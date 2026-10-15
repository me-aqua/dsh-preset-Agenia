/**
 * HLT-01 / HLT-02 —— brain-health 与每日状态（报告层）。
 *
 * 冻结依据：契约 §6.9 + 提案 §B3.6（`health.json` 字段与 `paths`）/ §B3.3（未关闭采纳票）/
 * §B1.5（`healthVerdict` / `staleVerdict` 签名）+ §B1.6（可注入时钟 `AGENIA_NOW_FILE`、父死接缝 `bg-notify`）
 * + §4 冻结常量（update **90** / local **45**，**不许出现 60**）。
 *
 * 矩阵走哪条路：`healthVerdict(input)` 的**入参形状没有被冻结页写死** ⇒
 * 本文件只对它做**形状级**检查（status 属于四态 + reasons 是数组），把形状歧义记进读数；
 * **真正的矩阵走 CLI**（`agenia-local.mjs --op health` + `health.json`）—— 那一侧的接口（op、payload、文件落点、字段）是冻的。
 * 契约 HLT-01 的六个场景都能用**工作区本地状态**表达（快照版本写在 local state 的 `snapshot` 字段里），
 * 所以不需要碰脑侧根，也不自创 `--data-root` 之外的参数。
 */
import { before, describe, test } from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { loadStagedModule, readStagedText, runCli, runLocal, stagingExists, stagingPath } from '../support/sut.mjs'

before(() => {
  preflight()
})

const DAY = '2026-10-14'
const PROJECT = 'harness'

function scenarioWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/** 可注入时钟：把 `AGENIA_NOW_FILE` 写成 ISO 一行（proposal §B1.2/§B1.6）。 */
function setNow(iso) {
  const file = process.env[ENV.NOW_FILE]
  if (!file) return { ok: false, note: 'AGENIA_NOW_FILE 未设置 —— 本用例的时间全靠它' }
  writeFileSync(file, `${iso}\n`, 'utf8')
  return { ok: true, file, iso }
}

/** 本地状态的一个节点（B3.6 的 local-state 形状）。 */
const node = (over = {}) => ({
  claim: null,
  state: 'unclaimed',
  job_id: null,
  liveness_at: null,
  failure_reason: null,
  report_path: null,
  report_sha256: null,
  findings_path: null,
  findings_set_sha256: null,
  findings_count: null,
  receipt_path: null,
  receipt_sha256: null,
  receipt_version: null,
  ticket_ids: [],
  artifact_paths: [],
  ...over,
})

function writeLocalState(ws, nodes) {
  const dir = path.join(ws, '.team', 'state', 'local')
  const obj = {
    schema: 1,
    day: DAY,
    project: PROJECT,
    snapshot: 'v7',
    memory_review: node(nodes.memory_review),
    conversation: node(nodes.conversation),
    technical: node(nodes.technical),
    local_lease_minutes: FROZEN.leases.local,
    imported_proposal_ids: [],
    updated_at: '2026-10-14T11:00:00+08:00',
  }
  return writeJson(path.join(dir, `${DAY}.json`), obj)
}

function healthCall(ws, label) {
  if (!stagingExists('bin/agenia-local.mjs')) {
    return { missing: true, label }
  }
  const res = runLocal('HLT', 'health', { project: PROJECT, day: DAY }, { workspace: ws })
  return {
    missing: false,
    label,
    exit_code: res.exit_code,
    code: res.json?.error?.code ?? null,
    status: res.json?.health?.status ?? null,
    health: res.json?.health ?? null,
    stdout: res.stdout.slice(0, 300),
  }
}

describe('report · health (HLT)', () => {
  test('HLT-01 health 输入矩阵：没开工 HOLD、运行中非绿、缺本地双评审红、完整绿', async () => {
    await runCase('HLT-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ① 纯函数：形状级（入参形状未冻结 ⇒ 只断言形状，矩阵走 CLI）
      const lib = await loadStagedModule('lib/health.mjs', ['healthVerdict', 'staleVerdict'])
      rec.readings.health_lib = { surfaceMissing: lib.surfaceMissing, missing: lib.missing, errors: lib.errors }
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/health.mjs 不在 —— health 判定拿不到（预期的首跑红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/health.mjs 没有导出 ${n}（提案 §B1.5 冻了签名）`)
      if (lib.mod === null) caseFail(problems)
      const { healthVerdict, staleVerdict } = lib.mod
      if (typeof healthVerdict === 'function') {
        const candidateInput = { project: PROJECT, day: DAY, state: null, local: null, receipt: null, snapshot: null, now: '2026-10-14T12:00:00+08:00' }
        let out = null
        let threw = null
        try { out = healthVerdict(candidateInput) } catch (err) { threw = String(err.message).slice(0, 200) }
        rec.readings.healthVerdict_probe = { input: candidateInput, threw, out }
        if (threw) {
          push('HEALTH-INPUT-SHAPE', `healthVerdict(input) 的入参形状**没有被冻结页写死**：按 {project,day,state,local,receipt,snapshot,now} 试一次就抛了（${threw}）⇒ 这条歧义要报组长冻形状，不许测试自创`)
        } else {
          const okStatus = ['GREEN', 'RED', 'RUNNING', 'HOLD'].includes(out?.status)
          if (!okStatus) push('HEALTH-SHAPE', `healthVerdict().status 必须是 GREEN|RED|RUNNING|HOLD 之一，实得 ${JSON.stringify(out?.status)}`)
          if (!Array.isArray(out?.reasons)) push('HEALTH-SHAPE', `healthVerdict().reasons 必须是数组，实得 ${typeof out?.reasons}`)
        }
      }
      rec.readings.healthVerdict_shape_note = {
        note: '`healthVerdict(input)` 的入参形状未冻结（B1.5 只给了签名与返回）⇒ 这里只做形状级检查；六场景矩阵走 CLI（`health` op + `health.json`，那两侧都冻了）。',
      }

      // ② 矩阵（CLI）：六个场景各起一个独立工作区
      const now = '2026-10-14T12:00:00+08:00'
      rec.readings.now_file = setNow(now)
      const scenarios = []
      const expect = (label, wantStatus) => scenarios.push({ label, wantStatus })

      // 场景 1：没开工
      const wsIdle = scenarioWorkspace('HLT-01', 'idle')
      expect('没开工', 'HOLD')
      // 场景 2：daily-start 存在但状态缺失
      const wsDailyOnly = scenarioWorkspace('HLT-01', 'daily-only')
      writeJson(path.join(wsDailyOnly, '.team', 'state', 'daily', `${DAY}.json`), { schema: 1, day: DAY, project: PROJECT, distribution: [] })
      expect('daily-start 存在但状态缺失', 'RED')
      // 场景 3：快照可用但本地双评审无 claim 无产物
      const wsNoReview = scenarioWorkspace('HLT-01', 'no-review')
      writeLocalState(wsNoReview, {})
      expect('快照可用但本地双评审无 claim 无产物', 'RED')
      // 场景 4：一个 claim 在跑且 liveness 新鲜（10 分钟）
      const wsRunning = scenarioWorkspace('HLT-01', 'running')
      writeLocalState(wsRunning, {
        conversation: { state: 'running', claim: { attempt: 1, job_id: 'job-conversation-review-1', claimed_at: '2026-10-14T11:50:00+08:00' }, job_id: 'job-conversation-review-1', liveness_at: '2026-10-14T11:50:00+08:00' },
      })
      expect('一个 claim 在跑且 liveness 新鲜', 'RUNNING')
      // 场景 5：失败 / 过期（liveness 差 120 分钟 > local 租约 45）
      const wsFailed = scenarioWorkspace('HLT-01', 'failed')
      writeLocalState(wsFailed, {
        technical: { state: 'failed', failure_reason: '技术评审作业退出码非 0', claim: { attempt: 1, job_id: 'job-technical-review-1', claimed_at: '2026-10-14T09:00:00+08:00' }, liveness_at: '2026-10-14T10:00:00+08:00' },
      })
      expect('失败/过期', 'RED')
      // 场景 6：两场 + 回执完整
      const wsGreen = scenarioWorkspace('HLT-01', 'green')
      writeLocalState(wsGreen, {
        conversation: { state: 'done', claim: { attempt: 1, job_id: 'job-conversation-review-1', claimed_at: '2026-10-14T11:00:00+08:00' }, liveness_at: '2026-10-14T11:20:00+08:00', report_path: 'retro/2026-10-14/会话评审.md', artifact_paths: ['retro/2026-10-14/会话评审.md'] },
        technical: {
          state: 'done',
          claim: { attempt: 1, job_id: 'job-technical-review-1', claimed_at: '2026-10-14T11:00:00+08:00' },
          liveness_at: '2026-10-14T11:30:00+08:00',
          report_path: 'retro/2026-10-14/技术评审.md',
          report_sha256: 'a'.repeat(64),
          findings_path: 'retro/2026-10-14/技术评审.findings.json',
          findings_set_sha256: 'b'.repeat(64),
          findings_count: 2,
          receipt_path: 'leader/2026-10-14/技术复盘回执.json',
          receipt_sha256: 'c'.repeat(64),
          receipt_version: 1,
          ticket_ids: [],
        },
        memory_review: { state: 'done', claim: { attempt: 1, job_id: 'job-memory-review-1', claimed_at: '2026-10-14T11:00:00+08:00' }, liveness_at: '2026-10-14T11:10:00+08:00' },
      })
      writeJson(path.join(wsGreen, '.team', 'leader', DAY, '技术复盘回执.json'), { schema: 1, version: 1, superseded_by: null, project: PROJECT, day: DAY, lead: 'Agenia', report: { path: 'retro/2026-10-14/技术评审.md', sha256: 'a'.repeat(64) }, findings_set_sha256: 'b'.repeat(64), findings: [], handover: { mode: 'fresh', from_receipt_version: null, statement: null }, created_at: now, receipt_sha256: 'c'.repeat(64) })
      expect('两场 + 回执完整', 'GREEN')
      // 场景 7：快照迟到（本地已绑新快照、两场未 claim）—— 重查点必须补启动两场
      const wsLate = scenarioWorkspace('HLT-01', 'late-snapshot')
      writeLocalState(wsLate, {})
      expect('快照迟到（重查点）', 'RED')

      const wsOf = {
        '没开工': wsIdle,
        'daily-start 存在但状态缺失': wsDailyOnly,
        '快照可用但本地双评审无 claim 无产物': wsNoReview,
        '一个 claim 在跑且 liveness 新鲜': wsRunning,
        '失败/过期': wsFailed,
        '两场 + 回执完整': wsGreen,
        '快照迟到（重查点）': wsLate,
      }
      const results = {}
      for (const s of scenarios) {
        const out = healthCall(wsOf[s.label], s.label)
        results[s.label] = { want: s.wantStatus, ...out }
        if (out.missing) continue
        if (out.exit_code !== 0) {
          push('HEALTH-CLI', `${s.label}：health 读取面必须可用（正例），实得 exit=${out.exit_code} / ${out.code ?? '(无码)'}：${out.stdout}`)
          continue
        }
        if (out.status !== s.wantStatus) push('HEALTH-MATRIX', `${s.label}：health.status 应为 ${s.wantStatus}，实得 ${out.status}`)
        if (out.status === 'RUNNING' && out.health?.status === 'GREEN') push('HEALTH-COVER', `${s.label}：运行中不许显示绿（RUNNING ≠ GREEN）`)
        const reasons = out.health?.reasons
        if (!Array.isArray(reasons)) push('HEALTH-SHAPE', `${s.label}：health.reasons 必须是数组`)
        else {
          for (const r of reasons) {
            if (!r?.code || !r?.detail) push('HEALTH-REASON', `${s.label}：每条 reason 必须有 code 与 detail（B3.6），实得 ${JSON.stringify(r)?.slice(0, 120)}`)
          }
          if (s.wantStatus === 'RED' && reasons.length === 0) push('HEALTH-REASON', `${s.label}：判红却没有给任何 reason（每条红都要给得出处）`)
        }
        // health.json 落点（B3.6：`<WS>\brain\<day>\health.json`）
        const healthFile = path.join(wsOf[s.label], '.team', 'brain', DAY, 'health.json')
        let onDisk = null
        try { onDisk = JSON.parse(readFileSync(healthFile, 'utf8')) } catch (err) { push('HEALTH-FILE', `${s.label}：读不到 ${healthFile}（${err.message}）`) }
        if (onDisk) {
          if (onDisk.status !== out.status) push('HEALTH-FILE', `${s.label}：盘上的 health.json status=${onDisk.status} 与 stdout 的 ${out.status} 不一致`)
          if (!onDisk.paths || typeof onDisk.paths !== 'object') push('HEALTH-FILE', `${s.label}：health.json 必须带 paths（snapshot/state/local/receipt/route），便于 GUI 对账`)
        }
      }
      rec.readings.matrix = results
      if (!stagingExists('bin/agenia-local.mjs')) push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 ⇒ 六场景矩阵跑不起来（预期的首跑红）')

      // ③ 重查点：契约要求"快照迟到 ⇒ 下一次老板开口/下一关前重查，补启动两场"
      rec.readings.recheck_note = {
        note: '重查点 R-A/B/C 是**流程**动作（谁在什么时候重查），自动层只能证"迟到时 health 判红"；真正的补启动在 JOB-03/R1。',
      }

      caseFail(problems)
    })
  })

  test('HLT-02 失败/父死接班不丢原因；update 90 / local 45 分列且无 60 旧值', async () => {
    await runCase('HLT-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      const lib = await loadStagedModule('lib/health.mjs', ['staleVerdict', 'healthVerdict'])
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/health.mjs 不在 —— 过期判定拿不到（预期的首跑红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/health.mjs 没有导出 ${n}`)
      if (lib.mod === null) caseFail(problems)
      const { staleVerdict } = lib.mod

      // ① staleVerdict 边界：89/90/91 × update 90 / local 45
      //    **C-5 追加裁定 v1.2 冻结**：`ageMinutes >= leaseMinutes` 即 stale ⇒ 90 分钟 stale（不是 fresh）。
      const base = Date.parse('2026-10-14T12:00:00+08:00')
      const at = (minutesAgo) => new Date(base - minutesAgo * 60000).toISOString()
      const nowIso = new Date(base).toISOString()
      const bounds = {}
      for (const lease of [FROZEN.leases.update, FROZEN.leases.local]) {
        for (const age of [0, lease - 1, lease, lease + 1, lease * 2, lease * 3]) {
          let out = null
          try { out = staleVerdict(at(age), nowIso, lease) } catch (err) { push('STALE-VERDICT', `staleVerdict 抛错（lease=${lease} age=${age}）：${String(err.message).slice(0, 140)}`); continue }
          bounds[`lease=${lease}/age=${age}`] = { stale: out?.stale ?? null, ageMinutes: out?.ageMinutes ?? null }
          const wantStale = age >= lease // C-5：等号算过期
          if (out?.stale !== wantStale) push('STALE-VERDICT', `lease=${lease}、年龄 ${age} 分钟应判 stale=${wantStale}（C-5：age >= lease 即过期），实得 ${out?.stale}`)
          if (typeof out?.ageMinutes === 'number' && Math.abs(out.ageMinutes - age) > 2) {
            push('STALE-VERDICT', `lease=${lease}：ageMinutes 实得 ${out.ageMinutes}，应为 ${age}（容差 2 分钟）`)
          }
        }
      }
      rec.readings.stale_bounds = bounds
      rec.readings.stale_rule_frozen = FROZEN.staleRule

      // ② 常量：不许出现 60 分钟的旧租约值
      const scanned = []
      for (const rel of ['lib/health.mjs', 'lib/liveness.mjs', 'lib/local-state.mjs', 'lib/state.mjs']) {
        if (!stagingExists(rel)) continue
        const text = readStagedText(rel)
        scanned.push(rel)
        text.split(/\r?\n/).forEach((line, i) => {
          if (!/lease/i.test(line)) return
          if (/\b60\b/.test(line)) push('LEASE-60', `${rel}:${i + 1} 出现 60 分钟的租约旧值（冻结：update 90 / local 45，**不许出现 60**）：${line.trim().slice(0, 140)}`)
        })
      }
      rec.readings.lease_scanned = scanned
      if (scanned.length === 0) push('SUT-SURFACE-MISSING', 'staged 里没有可扫的 lib 文件（health/liveness/local-state/state 一个都不在）⇒ 租约常量无从检查（预期红）')
      rec.readings.leases = FROZEN.leases

      // ③ 失败态 + 下一 owner 接班：failure_reason 不许丢
      const now = '2026-10-14T12:00:00+08:00'
      setNow(now)
      const ws = scenarioWorkspace('HLT-02', 'failure')
      const reason = '技术评审作业退出码非 0（夹具）'
      writeLocalState(ws, {
        technical: {
          state: 'failed',
          claim: { attempt: 1, job_id: 'job-technical-review-1', claimed_at: '2026-10-14T09:00:00+08:00' },
          liveness_at: '2026-10-14T09:30:00+08:00',
          failure_reason: reason,
        },
      })
      const before = readFileSync(path.join(ws, '.team', 'state', 'local', `${DAY}.json`), 'utf8')
      if (!stagingExists('bin/agenia-local.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 ⇒ 失败卡/接班读数拿不到（预期的首跑红）')
      } else {
        const res = runLocal('HLT', 'health', { project: 'harness-b', day: DAY }, { workspace: ws })
        rec.readings.next_owner = { exit_code: res.exit_code, code: res.json?.error?.code ?? null, status: res.json?.health?.status ?? null, reasons: res.json?.health?.reasons ?? null }
        if (res.exit_code !== 0) push('HEALTH-CLI', `另一 owner 读 health 必须可用（正例），实得 exit=${res.exit_code} / ${res.json?.error?.code ?? '(无码)'}`)
        else {
          if (res.json?.health?.status !== 'RED') push('FAIL-CARD', `失败态必须判红，实得 ${res.json?.health?.status}`)
          const text = JSON.stringify(res.json?.health ?? {})
          if (!text.includes(reason)) push('FAIL-CARD', `接班读数里丢了 failure_reason（${reason}）—— 失败原因必须保留可见`)
        }
        const after = readFileSync(path.join(ws, '.team', 'state', 'local', `${DAY}.json`), 'utf8')
        if (after !== before) push('FAIL-CARD', 'health（只读面）改动了状态文件 —— 读不许写')
      }

      // ④ 父死接缝：bg-notify --op parent-dead 必须能造出 parent_state="dead"
      if (!stagingExists(path.join('bin', 'bg-notify.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/bg-notify.mjs 不在 ⇒ 父死接缝拿不到（预期的首跑红）')
      } else {
        const livenessFile = path.join(ws, 'parent-liveness.json')
        const res = runCli('bg-notify.mjs', {
          op: 'parent-dead', extra: ['--parent-session-id', 'session-dead-0000', '--liveness-file', livenessFile],
        }, { env: process.env })
        rec.readings.parent_dead = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
        if (res.exit_code !== 0) push('PARENT-DEAD', `bg-notify --op parent-dead 必须成功（接缝），实得 exit=${res.exit_code} / ${res.json?.error?.code ?? '(无码)'}`)
        else {
          let onDisk = null
          try { onDisk = JSON.parse(readFileSync(livenessFile, 'utf8')) } catch (err) { push('PARENT-DEAD', `父死接缝没写出 liveness 文件：${err.message}`) }
          if (onDisk && onDisk.parent_state !== 'dead') push('PARENT-DEAD', `父死接缝必须写 parent_state:"dead"，实得 ${JSON.stringify(onDisk.parent_state)}`)
        }
      }
      rec.readings.parent_death_pending = {
        status: 'PENDING',
        note: '契约把"父死让下一 owner 接手、状态机轨迹"放在 JOB-02/R1-04（需要真子进程 + 通知接缝）；本用例只验 staleVerdict 边界、租约常量、失败原因不丢与父死接缝的形状。',
      }

      // ⑤ 无回执 ⇒ 技术复盘明确未完成，不许被"评估已完成"掩盖
      const wsNoReceipt = scenarioWorkspace('HLT-02', 'no-receipt')
      writeLocalState(wsNoReceipt, {
        technical: { state: 'done', claim: { attempt: 1, job_id: 'job-technical-review-1', claimed_at: '2026-10-14T11:00:00+08:00' }, liveness_at: '2026-10-14T11:30:00+08:00', report_path: 'retro/2026-10-14/技术评审.md', report_sha256: 'a'.repeat(64), findings_path: 'retro/2026-10-14/技术评审.findings.json', findings_set_sha256: 'b'.repeat(64), findings_count: 0 },
        conversation: { state: 'done', claim: { attempt: 1, job_id: 'job-conversation-review-1', claimed_at: '2026-10-14T11:00:00+08:00' }, liveness_at: '2026-10-14T11:20:00+08:00', report_path: 'retro/2026-10-14/会话评审.md' },
        memory_review: { state: 'done', claim: { attempt: 1, job_id: 'job-memory-review-1', claimed_at: '2026-10-14T11:00:00+08:00' }, liveness_at: '2026-10-14T11:10:00+08:00' },
      })
      if (stagingExists('bin/agenia-local.mjs')) {
        const res = runLocal('HLT', 'health', { project: 'harness-c', day: DAY }, { workspace: wsNoReceipt })
        rec.readings.no_receipt = { exit_code: res.exit_code, status: res.json?.health?.status ?? null, reasons: res.json?.health?.reasons ?? null }
        if (res.exit_code === 0) {
          if (res.json?.health?.status === 'GREEN') push('NO-RECEIPT', '技术复盘没有回执时不许判绿（缺回执 = 技术复盘未完成）')
          const text = JSON.stringify(res.json?.health ?? {})
          if (!/回执|receipt/i.test(text)) push('NO-RECEIPT', '缺回执时 reasons 里必须点到回执（否则老板看不出差在哪）')
        }
      }

      caseFail(problems)
    })
  })
})
