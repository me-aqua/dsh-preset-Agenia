/**
 * RT-01 / RT-02 / RT-03 —— 路线 updater 的集成面。
 *
 * 冻结依据：契约 §6.2 的 RT-01..03 + 提案 §B1.4 的 `agenia-route.mjs` op 表 + §B3.3（票）+
 * §B3.7（原子写 / 锁 / CAS / audit）与拍板 §I（字段名、绝对路径）。
 *
 * 三条纪律：
 *   · **真并发必须真进程**（提案 §B1.6：同进程两次调用不算并发）→ 用 `runCliAsync`；
 *   · **每个场景一份独立副本**（契约 §6.0 G4）→ 每个场景一个带 marker 的工作区；
 *   · 锁 / CAS / 审计 / 路径校验**一律不许 mock**（契约 §9.5 第 4 条）。
 */
import { before, describe, test } from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, caseHold, preflight, problem, runCase, sha256Equal, sha256File, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { countJsonlLines, runCliAsync, runRoute, stagingExists } from '../support/sut.mjs'

before(() => {
  preflight()
})

/** 场景专用工作区：独立副本、带 marker、只住运行根里（契约 §6.0 G4 / §2.5）。 */
function scenarioWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const dir = path.join(runRoot, `ws-${id.toLowerCase()}-${name}`)
  return ensureMarkedDir(dir, { runRoot, runId: path.basename(runRoot), kind: 'agenia-test-workspace' })
}

const LEGAL_GRAPH = {
  goal: { id: 'agenia-upgrade', title: 'Agenia 升级' },
  stages: [
    { id: 'discuss', name: '讨论阶段', order: 1, state: 'done' },
    { id: 'plan', name: '计划阶段', order: 2, state: 'current', boss_gate: 'approval_required' },
    { id: 'execute-1', name: '执行第一阶段 · 停机安装之前', order: 3, state: 'future' },
  ],
  current_stage_id: 'plan',
}

function requireRouteCli(problems) {
  if (stagingExists(path.join('bin', 'agenia-route.mjs'))) return true
  problems.push(problem('SUT-SURFACE-MISSING', 'staged 还没有 bin/agenia-route.mjs —— 路线 updater 未实现（预期的首跑红）'))
  return false
}

/**
 * 一条命令 + 一个期望：统一把退出码/错误码/报文三样收进 problems。
 * 🔴 **`anyOf` 一给就表示"期望被拒并命中其中之一"**（默认值里就把这件事说清）——
 *    以前默认恒为 `'ok'`，于是 `expect(label, r, problems, { anyOf: codes })` 这种写法
 *    **把"必须被拒"的负例当成了"必须成功"** ⇒ 负例全部假红（RT-03/04/07 各一片，v1.14 单里抓到）。
 */
function expect(label, res, problems, { ok = false, anyOf = [], expect = anyOf.length > 0 ? 'reject' : 'ok' } = {}) {
  if (res.spawn_error) { problems.push(problem('CLI-SPAWN', `${label}: spawn 失败 ${res.spawn_error}`)); return }
  if (res.timed_out) { problems.push(problem('CLI-TIMEOUT', `${label}: 超时 ${res.ms} ms`)); return }
  if (expect === 'ok') {
    if (res.exit_code !== 0 || res.json?.ok !== true) {
      problems.push(problem('CLI-EXPECTED-OK', `${label}: 期望成功，实得 exit=${res.exit_code} stdout=${res.stdout.trim().slice(0, 300)} stderr=${res.stderr.trim().slice(0, 200)}`))
    }
    return
  }
  if (res.exit_code === 0) {
    problems.push(problem('CLI-EXPECTED-REJECT', `${label}: 期望被拒，实得退出码 0 / ${JSON.stringify(res.json)?.slice(0, 240)}`))
    return
  }
  const got = res.json?.error?.code ?? null
  const allowed = anyOf.length > 0 ? anyOf : [expect]
  if (!allowed.includes(got)) {
    problems.push(problem('CLI-WRONG-CODE', `${label}: 期望 ${allowed.join('|')}，实得 ${got}（stdout=${res.stdout.trim().slice(0, 240)} stderr=${res.stderr.trim().slice(0, 160)}）`))
  }
}

describe('integration · route-updater', () => {
  test('RT-01 并发两次 updater / 旧 CAS 版本 / 崩溃后遗留锁：独占锁+CAS，绝不覆盖', async () => {
    await runCase('RT-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      if (!requireRouteCli(problems)) caseFail(problems)

      const ws = scenarioWorkspace('RT-01', 'main')
      const init = runRoute('RT-01', 'init', LEGAL_GRAPH, { workspace: ws })
      expect('init', init, problems)
      if (init.exit_code !== 0) caseFail(problems)
      const v1 = init.json.version
      const sha1 = sha256File(path.join(ws, '.team', 'route', 'current.json'))
      const auditBefore = countJsonlLines(path.join(ws, '.team', 'route', 'audit.jsonl'))
      rec.readings.baseline = { version: v1, current_sha256: sha1, audit_lines: auditBefore }

      // ① 从同一 baseline 并发两次写（真进程）
      const taskA = { tasks: [{ id: 'T1', stage_id: 'plan', title: 'A', status: 'in_progress' }], current_task_id: 'T1', version: v1 }
      const taskB = { tasks: [{ id: 'T2', stage_id: 'plan', title: 'B', status: 'open' }], current_task_id: null, version: v1 }
      const fileA = writeJson(path.join(ws, 'concurrent-a.json'), taskA)
      const fileB = writeJson(path.join(ws, 'concurrent-b.json'), taskB)
      const [ra, rb] = await Promise.all([
        runCliAsync('agenia-route.mjs', { op: 'task-set', workspace: ws, inFile: fileA, testMode: true }),
        runCliAsync('agenia-route.mjs', { op: 'task-set', workspace: ws, inFile: fileB, testMode: true }),
      ])
      rec.readings.concurrent = [ra, rb].map((r) => ({ exit: r.exit_code, code: r.json?.error?.code ?? null, ms: r.ms }))
      const winners = [ra, rb].filter((r) => r.exit_code === 0)
      if (winners.length !== 1) push('CONCURRENCY', `并发两次写应当**恰好一个**成功，实得 ${winners.length} 个成功（exit=${[ra.exit_code, rb.exit_code].join('/')}）`)
      for (const [label, r] of [['A', ra], ['B', rb]]) {
        if (r.exit_code !== 0) {
          const code = r.json?.error?.code
          if (!['E_LOCK_HELD', 'E_LOCK_STALE', 'E_CAS_STALE'].includes(code)) {
            push('CONCURRENCY', `失败方（${label}）的错误码应是锁冲突/旧版本（E_LOCK_* / E_CAS_STALE），实得 ${code}`)
          }
        }
      }
      const currentPath = path.join(ws, '.team', 'route', 'current.json')
      let current = null
      try {
        current = JSON.parse(readFileSync(currentPath, 'utf8'))
      } catch (err) {
        push('CURRENT-BROKEN', `并发写之后 current.json 读不出来（半写？）：${err.message}`)
      }
      if (current) {
        rec.readings.after_concurrent = { version: current.version, current_task_id: current.current_task_id }
        if (current.version !== v1 + 1) push('VERSION', `并发之后版本应当只 +1（${v1} → ${v1 + 1}），实得 ${current.version}`)
      }
      const auditAfter = countJsonlLines(path.join(ws, '.team', 'route', 'audit.jsonl'))
      rec.readings.audit_lines = { before: auditBefore, after: auditAfter }
      // v1.14 分界：**提交后** audit 读不出来 = 前置本不该失败 ⇒ 红；**提交前**文件还没落 = 基线不适用 ⇒ HOLD
      if (auditAfter === null) {
        push('AUDIT', `成功提交之后 audit.jsonl 必须存在（"只追加 1 条"押在它上面），实得读不到（before=${auditBefore}）`)
      } else if (auditBefore === null) {
        caseHold(rec, 'AUDIT-NO-BASELINE', '提交前还没有 audit.jsonl（第一次写入）⇒ "只追加 1 条"这一档不适用（基线无从取）')
      } else if (auditAfter !== auditBefore + 1) {
        push('AUDIT', `成功提交应当只追加 1 条 audit（${auditBefore} → ${auditBefore + 1}），实得 ${auditBefore} → ${auditAfter}`)
      }

      // ② 旧 CAS 版本写入：必须失败，且绝不覆盖
      const beforeStale = sha256File(currentPath)
      const stale = runRoute('RT-01', 'task-set', { tasks: [], current_task_id: null, version: v1 }, { workspace: ws })
      expect('旧版本写入', stale, problems, { expect: 'E_CAS_STALE', anyOf: ['E_CAS_STALE', 'E_LOCK_HELD'] })
      if (sha256File(currentPath) !== beforeStale) push('CAS-OVERWRITE', '旧版本写入把 current.json 改了 —— CAS 必须"绝不覆盖"')
      if (stale.exit_code === 0) push('CAS-ACCEPTED', '旧 CAS 版本的写入被接受了')

      // ③ 崩溃后遗留锁：不静默抢写，要求显式恢复
      const lockPath = path.join(ws, '.team', 'route', '.route.lock')
      writeFileSync(lockPath, `${JSON.stringify({ pid: 999999, session_id: 'session-dead-0000', at: '2026-10-14T00:00:00+08:00', ttl_ms: 1 })}\n`, 'utf8')
      const beforeLocked = sha256File(currentPath)
      const locked = runRoute('RT-01', 'task-set', { tasks: [], current_task_id: null, version: current?.version ?? v1 + 1 }, { workspace: ws })
      rec.readings.stale_lock = { exit: locked.exit_code, code: locked.json?.error?.code ?? null }
      expect('过期锁', locked, problems, { expect: 'E_LOCK_STALE', anyOf: ['E_LOCK_STALE', 'E_LOCK_HELD'] })
      if (sha256File(currentPath) !== beforeLocked) push('LOCK-SILENT-TAKEOVER', '留着过期锁时 current.json 仍被改写 —— 那是"静默抢写"，RT-01 明令禁止')
      // 显式恢复才允许继续
      const forced = runRoute('RT-01', 'task-set', { tasks: [], current_task_id: null, version: current?.version ?? v1 + 1 }, { workspace: ws, extra: ['--force-recover'] })
      rec.readings.force_recover = { exit: forced.exit_code, code: forced.json?.error?.code ?? null }
      expect('--force-recover 显式恢复', forced, problems)

      caseFail(problems)
    })
  })

  test('RT-02 audit 字段 + 篡改 current / 删改 audit / 直写 / 半写一律拒读', async () => {
    await runCase('RT-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      if (!requireRouteCli(problems)) caseFail(problems)

      // 每个篡改姿势一份独立副本（G4）
      const fresh = (name) => {
        const ws = scenarioWorkspace('RT-02', name)
        const init = runRoute('RT-02', 'init', LEGAL_GRAPH, { workspace: ws })
        expect(`init(${name})`, init, problems)
        return { ws, init }
      }
      const base = fresh('base')
      if (base.init.exit_code !== 0) caseFail(problems)
      const auditPath = path.join(base.ws, '.team', 'route', 'audit.jsonl')
      const currentPath = path.join(base.ws, '.team', 'route', 'current.json')

      // ① 成功提交的 audit 字段
      const commit = runRoute('RT-02', 'task-set', { tasks: [{ id: 'T1', stage_id: 'plan', title: 'A', status: 'open' }], current_task_id: 'T1', version: base.init.json.version }, { workspace: base.ws })
      expect('task-set', commit, problems)
      if (commit.exit_code === 0) {
        const lines = readFileSync(auditPath, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '')
        let last = null
        try {
          last = JSON.parse(lines[lines.length - 1])
        } catch (err) {
          push('AUDIT-JSON', `audit 末条不是 JSON：${err.message}`)
        }
        rec.readings.audit_tail = last
        if (last) {
          for (const key of ['prev_sha256', 'next_sha256', 'version', 'at']) {
            if (!(key in last)) push('AUDIT-FIELDS', `audit 末条缺字段 ${key}（提案 §B3.7：prev_sha256 → next_sha256、版本、写入者、会话、时间）`)
          }
          if (!('writer' in last) && !('session_id' in last) && !('by' in last)) push('AUDIT-FIELDS', 'audit 末条没有写入者/会话字段')
          // 大小写不敏感：SUT 写的摘要与我算的摘要是同一份值，hex 大小写不是值的一部分
          if (last.next_sha256 && !sha256Equal(sha256File(currentPath), last.next_sha256)) push('AUDIT-LINK', 'audit 末条的 next_sha256 与盘上 current.json 的哈希不符')
        }
        const okVerify = runRoute('RT-02', 'verify', {}, { workspace: base.ws })
        expect('未篡改的 verify（正例）', okVerify, problems)
        if (okVerify.exit_code === 0 && okVerify.json?.authoritative !== true) push('VERIFY-FLAG', '未篡改时 verify 必须返回 authoritative:true')
      }

      // ② 篡改 current（改一个字段）
      const tamperCurrent = fresh('tamper-current')
      if (tamperCurrent.init.exit_code === 0) {
        const p = path.join(tamperCurrent.ws, '.team', 'route', 'current.json')
        const obj = JSON.parse(readFileSync(p, 'utf8'))
        obj.version = (obj.version ?? 1) + 7
        writeJson(p, obj)
        const r = runRoute('RT-02', 'verify', {}, { workspace: tamperCurrent.ws })
        expect('篡改 current 后 verify', r, problems, { expect: 'E_ROUTE_TAMPERED' })
        rec.readings.tamper_current = { exit: r.exit_code, code: r.json?.error?.code ?? null, authoritative: r.json?.authoritative ?? null }
      }

      // ③ 删掉 audit 末条
      const delAudit = fresh('delete-audit-tail')
      if (delAudit.init.exit_code === 0) {
        const commit2 = runRoute('RT-02', 'task-set', { tasks: [], current_task_id: null, version: delAudit.init.json.version }, { workspace: delAudit.ws })
        expect('场景③的提交', commit2, problems)
        const p = path.join(delAudit.ws, '.team', 'route', 'audit.jsonl')
        const lines = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '')
        writeFileSync(p, `${lines.slice(0, -1).join('\n')}\n`, 'utf8')
        const r = runRoute('RT-02', 'verify', {}, { workspace: delAudit.ws })
        expect('删 audit 末条后 verify', r, problems, { expect: 'E_ROUTE_TAMPERED' })
        rec.readings.deleted_audit_tail = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      // ④ 篡改 audit 末条
      const tamperAudit = fresh('tamper-audit-tail')
      if (tamperAudit.init.exit_code === 0) {
        const p = path.join(tamperAudit.ws, '.team', 'route', 'audit.jsonl')
        const lines = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '')
        const last = JSON.parse(lines[lines.length - 1])
        last.next_sha256 = 'f'.repeat(64)
        lines[lines.length - 1] = JSON.stringify(last)
        writeFileSync(p, `${lines.join('\n')}\n`, 'utf8')
        const r = runRoute('RT-02', 'verify', {}, { workspace: tamperAudit.ws })
        expect('篡改 audit 末条后 verify', r, problems, { expect: 'E_ROUTE_TAMPERED' })
        rec.readings.tampered_audit_tail = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      // ⑤ 绕过 updater 直接手写 current（合法 JSON、无审计）
      const directWrite = fresh('direct-write')
      if (directWrite.init.exit_code === 0) {
        const p = path.join(directWrite.ws, '.team', 'route', 'current.json')
        const obj = JSON.parse(readFileSync(p, 'utf8'))
        obj.version = (obj.version ?? 1) + 1
        obj.current_stage_id = 'execute-1'
        writeJson(p, obj)
        const r = runRoute('RT-02', 'verify', {}, { workspace: directWrite.ws })
        expect('直写 current 后 verify', r, problems, { expect: 'E_ROUTE_TAMPERED' })
        rec.readings.direct_write = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      // ⑥ 半截 JSON
      const halfWrite = fresh('half-written')
      if (halfWrite.init.exit_code === 0) {
        const p = path.join(halfWrite.ws, '.team', 'route', 'current.json')
        const text = readFileSync(p, 'utf8')
        writeFileSync(p, text.slice(0, Math.max(10, Math.floor(text.length / 2))), 'utf8')
        const r = runRoute('RT-02', 'verify', {}, { workspace: halfWrite.ws })
        expect('半写 current 后 verify', r, problems, { expect: 'E_ROUTE_HALF_WRITTEN', anyOf: ['E_ROUTE_HALF_WRITTEN', 'E_ROUTE_TAMPERED'] })
        rec.readings.half_written = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      caseFail(problems)
    })
  })

  test('RT-03 票的完整字段与非法票拒绝；非 updater 写票无效；合法采纳票正例', async () => {
    await runCase('RT-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      if (!requireRouteCli(problems)) caseFail(problems)

      const ws = scenarioWorkspace('RT-03', 'main')
      const init = runRoute('RT-03', 'init', LEGAL_GRAPH, { workspace: ws })
      expect('init', init, problems)
      if (init.exit_code !== 0) caseFail(problems)
      const currentPath = path.join(ws, '.team', 'route', 'current.json')
      const auditPath = path.join(ws, '.team', 'route', 'audit.jsonl')
      const reportSha = 'a'.repeat(64)
      const legal = {
        title: '把 guard 的错误文案补上正确示例',
        source: `technical-review:${reportSha}#F1`,
        next_step: '实现关在 staging 改 inject.js 的拒绝文案，重跑 G5',
        acceptance: 'inject-probe 的 G5 通过，且错误文案含 run_in_background: true',
        version: init.json.version,
      }

      // ① 正例：合法票（采纳票：source 指向 technical-review + acceptance 非空）
      const opened = runRoute('RT-03', 'ticket-open', legal, { workspace: ws })
      expect('合法 ticket-open（正例）', opened, problems)
      rec.readings.opened = opened.json ?? null
      let ticketId = opened.json?.ticket_id ?? null

      // ② 非法票逐条（缺字段 = 拿去一个键；错误码按提案 §B1.4 的 op 表钉）
      const without = (obj, key) => {
        const out = { ...obj }
        delete out[key]
        return out
      }
      const negBase = { ...legal, version: opened.json?.version ?? init.json.version }
      const negResults = {}
      const negCases = [
        ['缺 title', () => runRoute('RT-03', 'ticket-open', without(negBase, 'title'), { workspace: ws }), ['E_ARG_SCHEMA']],
        ['缺 source', () => runRoute('RT-03', 'ticket-open', without(negBase, 'source'), { workspace: ws }), ['E_ARG_SCHEMA']],
        ['缺 next_step', () => runRoute('RT-03', 'ticket-open', without(negBase, 'next_step'), { workspace: ws }), ['E_ARG_SCHEMA']],
        ['缺 acceptance', () => runRoute('RT-03', 'ticket-open', without(negBase, 'acceptance'), { workspace: ws }), ['E_ARG_SCHEMA']],
        ['acceptance 为空', () => runRoute('RT-03', 'ticket-open', { ...negBase, acceptance: '' }, { workspace: ws }), ['E_ARG_SCHEMA', 'E_TICKET_SOURCE_BAD']],
        ['status 非法', () => runRoute('RT-03', 'ticket-update', { id: ticketId ?? 'ticket-00000000-99', status: '不存在的状态', version: negBase.version }, { workspace: ws }), ['E_TICKET_STATUS', 'E_TICKET_NOT_FOUND', 'E_ARG_SCHEMA']],
        ['source 形状不对', () => runRoute('RT-03', 'ticket-open', { ...negBase, source: 'technical-review:not-a-sha#F1' }, { workspace: ws }), ['E_TICKET_SOURCE_BAD']],
      ]
      for (const [label, run, codes] of negCases) {
        const r = run()
        negResults[label] = { exit: r.exit_code, code: r.json?.error?.code ?? null }
        expect(label, r, problems, { anyOf: codes })
      }

      // ③ id 重复（用同一个 id 再开一次）
      if (ticketId) {
        const dup = runRoute('RT-03', 'ticket-open', { ...negBase, id: ticketId }, { workspace: ws })
        expect('id 重复', dup, problems, { anyOf: ['E_TICKET_DUP', 'E_ARG_SCHEMA'] })
        negResults['id 重复'] = { exit: dup.exit_code, code: dup.json?.error?.code ?? null }
      }

      // ④ 关闭证据 / void 的必填项
      if (ticketId) {
        const noEvidence = runRoute('RT-03', 'ticket-close', { id: ticketId, status: 'done', version: negBase.version }, { workspace: ws })
        expect('done 无关闭证据', noEvidence, problems, { anyOf: ['E_TICKET_EVIDENCE_MISSING'] })
        negResults['done 无关闭证据'] = { exit: noEvidence.exit_code, code: noEvidence.json?.error?.code ?? null }
        const voidNoReason = runRoute('RT-03', 'ticket-void', { id: ticketId, status: 'void', void_reason: '', re_present: { ref: 'x', at: '2026-10-14T12:00:00+08:00' }, version: negBase.version }, { workspace: ws })
        expect('void 无理由', voidNoReason, problems, { anyOf: ['E_TICKET_VOID_REASON'] })
        const voidNoRep = runRoute('RT-03', 'ticket-void', { id: ticketId, status: 'void', void_reason: '原票要求改的路由在方案选择里被否，改由新票承接，验收口径也改写。', version: negBase.version }, { workspace: ws })
        expect('void 无重呈现', voidNoRep, problems, { anyOf: ['E_TICKET_VOID_REPRESENT'] })
        negResults['void 无理由'] = { exit: voidNoReason.exit_code, code: voidNoReason.json?.error?.code ?? null }
        negResults['void 无重呈现'] = { exit: voidNoRep.exit_code, code: voidNoRep.json?.error?.code ?? null }
      }
      rec.readings.negatives = negResults

      // ⑥ 非 updater 写票无效：绕过 CLI 直接往 current.json 里塞一张票
      const before = sha256File(currentPath)
      const obj = JSON.parse(readFileSync(currentPath, 'utf8'))
      obj.tickets = [...(obj.tickets ?? []), { id: 'ticket-20261014-99', title: '手写的票', source: `technical-review:${reportSha}#F9`, status: 'open' }]
      writeJson(currentPath, obj)
      const verify = runRoute('RT-03', 'verify', {}, { workspace: ws })
      expect('直写票后 verify', verify, problems, { expect: 'E_ROUTE_TAMPERED' })
      rec.readings.direct_ticket_write = { exit: verify.exit_code, code: verify.json?.error?.code ?? null, before_sha: before }

      // ⑦ 票不改变"当前任务 0/1"不变量
      const readBack = runRoute('RT-03', 'read', {}, { workspace: ws })
      if (readBack.exit_code === 0) {
        const cur = readBack.json?.current ?? {}
        const currents = (cur.tasks ?? []).filter((t) => t.id === cur.current_task_id)
        rec.readings.invariant = { current_task_id: cur.current_task_id, tasks: (cur.tasks ?? []).length, matched: currents.length }
        if (cur.current_task_id !== null && currents.length !== 1) push('TASK-INVARIANT', `开票之后"当前任务至多一个"不变量被破坏：current_task_id=${cur.current_task_id} 命中 ${currents.length} 条`)
      }
      const auditLines = countJsonlLines(auditPath)
      rec.readings.audit_lines = auditLines

      caseFail(problems)
    })
  })
})
