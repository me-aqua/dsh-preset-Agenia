/**
 * RT-04 / RT-05 / RT-06 / RT-07 / RT-08 —— 路线的阶段图·词表·老板门槛·任务·摘要。
 *
 * 冻结依据：契约 §6.2 的 RT-04..08 + 提案 §B1.4（`agenia-route.mjs` op 表）+ §B3.5（boss evidence）
 * + 拍板 Q5（五关词 denylist 取并集、硬拒）、Q4（历史 GO 的 occurred_at=null + note，WARN）。
 *
 * 这五条是"单元层"，但**接口仍然是那一个 CLI**（提案 §B1.4 把纯函数面也挂在 CLI 上），
 * 所以它们照样起真子进程、照样不许 mock 锁/CAS/校验（契约 §9.5 第 4 条）。
 */
import { before, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256Equal, sha256File } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { countJsonlLines, runRoute, stagingExists } from '../support/sut.mjs'

before(() => {
  preflight()
})

function scenarioWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

function requireRouteCli(problems) {
  if (stagingExists(path.join('bin', 'agenia-route.mjs'))) return true
  problems.push(problem('SUT-SURFACE-MISSING', 'staged 还没有 bin/agenia-route.mjs —— 路线 updater 未实现（预期的首跑红）'))
  return false
}

/**
 * 一条命令 + 一个期望。
 * 🔴 **`anyOf` 一给就表示"期望被拒并命中其中之一"** —— 以前 `want` 默认恒为 `'ok'`，
 *    于是 `expect(label, r, problems, { anyOf: [...] })` 把"必须被拒"的负例当成"必须成功" ⇒ 负例全假红。
 */
function expect(label, res, problems, { anyOf = [], expect: want = anyOf.length > 0 ? 'reject' : 'ok' } = {}) {
  if (res.spawn_error) { problems.push(problem('CLI-SPAWN', `${label}: spawn 失败 ${res.spawn_error}`)); return }
  if (res.timed_out) { problems.push(problem('CLI-TIMEOUT', `${label}: 超时 ${res.ms} ms`)); return }
  if (want === 'ok') {
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
  const allowed = anyOf.length > 0 ? anyOf : [want]
  if (!allowed.includes(got)) {
    problems.push(problem('CLI-WRONG-CODE', `${label}: 期望 ${allowed.join('|')}，实得 ${got}（stdout=${res.stdout.trim().slice(0, 240)} stderr=${res.stderr.trim().slice(0, 160)}）`))
  }
}

const GATE_STAGE = {
  goal: { id: 'agenia-upgrade', title: 'Agenia 升级' },
  stages: [
    { id: 'plan', name: '计划阶段', order: 1, state: 'current', boss_gate: 'approval_required', exit_criteria: ['窄评审通过', '老板施工 GO'] },
    { id: 'execute-1', name: '执行第一阶段 · 停机安装之前', order: 2, state: 'future', boss_gate: 'none' },
  ],
  current_stage_id: 'plan',
}

/** 一条合法的老板证据（形状照提案 §B3.5；`occurred_at` 允许 null + note，见拍板 Q4）。 */
function legalEvidence(over = {}) {
  return {
    kind: 'quote',
    verbatim: "you have the go. don't let me down my good girl",
    source_session_id: 'session-c0dabefd-13fe-4380-abdf-1cc1e52ea89a',
    source_kind: 'dsh-session',
    occurred_at: null,
    occurred_at_note: '接收时未落下精确时刻；区间 10:05–10:22（组长 2026-10-14 log 记）。',
    from_stage_id: 'plan',
    to_stage_id: 'execute-1',
    recorded_by: 'Agenia',
    ...over,
  }
}

describe('unit · route', () => {
  test('RT-04 阶段图：自定义/合法大阶段名、两个 current 拒、任务错阶段拒、不自动推进、五关只在任务上', async () => {
    await runCase('RT-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      if (!requireRouteCli(problems)) caseFail(problems)

      // ① 自定义大阶段名必须合法
      const wsCustom = scenarioWorkspace('RT-04', 'custom-name')
      const custom = runRoute('RT-04', 'init', {
        goal: { id: 'g', title: '目标' },
        stages: [
          { id: 'one', name: '自定义大阶段 · 甲', order: 1, state: 'current' },
          { id: 'two', name: '自定义大阶段 · 乙', order: 2, state: 'future' },
        ],
        current_stage_id: 'one',
      }, { workspace: wsCustom })
      expect('自定义大阶段名（正例）', custom, problems)
      rec.readings.custom_stage = { exit: custom.exit_code, code: custom.json?.error?.code ?? null }

      // ② 六个可显示的大阶段名都要能显示
      const wsLegal = scenarioWorkspace('RT-04', 'legal-names')
      const legalInit = runRoute('RT-04', 'init', GATE_STAGE, { workspace: wsLegal })
      expect('init', legalInit, problems)
      if (legalInit.exit_code === 0) {
        const stages = FROZEN.legalStageNames.map((name, i) => ({ id: `s${i + 1}`, name, order: i + 1, state: i === 0 ? 'current' : 'future' }))
        const set = runRoute('RT-04', 'stage-graph-set', { stages, current_stage_id: 's1', version: legalInit.json.version }, { workspace: wsLegal })
        expect('六段合法名（正例）', set, problems)
        rec.readings.legal_names = { exit: set.exit_code, code: set.json?.error?.code ?? null, names: FROZEN.legalStageNames }
      }

      // ③ 两个 current ⇒ 拒
      const wsMulti = scenarioWorkspace('RT-04', 'multi-current')
      const multiInit = runRoute('RT-04', 'init', GATE_STAGE, { workspace: wsMulti })
      expect('init(multi)', multiInit, problems)
      if (multiInit.exit_code === 0) {
        const r = runRoute('RT-04', 'stage-graph-set', {
          stages: [
            { id: 'a', name: '甲阶段', order: 1, state: 'current' },
            { id: 'b', name: '乙阶段', order: 2, state: 'current' },
          ],
          current_stage_id: 'a',
          version: multiInit.json.version,
        }, { workspace: wsMulti })
        expect('两个 current', r, problems, { expect: 'E_STAGE_MULTI_CURRENT' })
        rec.readings.multi_current = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      // ④ 任务属错阶段 ⇒ 拒；任务完成不自动推进阶段；五关只在任务上
      const wsTask = scenarioWorkspace('RT-04', 'task-stage')
      const tInit = runRoute('RT-04', 'init', GATE_STAGE, { workspace: wsTask })
      expect('init(task)', tInit, problems)
      if (tInit.exit_code === 0) {
        const wrongStage = runRoute('RT-04', 'task-set', {
          tasks: [{ id: 'T1', stage_id: 'execute-1', title: '错阶段的任务', status: 'open' }],
          current_task_id: 'T1',
          version: tInit.json.version,
        }, { workspace: wsTask })
        expect('任务属错阶段', wrongStage, problems, { anyOf: ['E_TASK_STAGE_MISMATCH'] })
        rec.readings.wrong_stage = { exit: wrongStage.exit_code, code: wrongStage.json?.error?.code ?? null }

        const okTask = runRoute('RT-04', 'task-set', {
          tasks: [{ id: 'T1', stage_id: 'plan', title: '本阶段的任务', status: 'done', five_gate_state: '实现' }],
          current_task_id: null,
          version: tInit.json.version,
        }, { workspace: wsTask })
        expect('五关状态挂在任务上（正例）', okTask, problems)
        const after = runRoute('RT-04', 'read', {}, { workspace: wsTask })
        if (after.exit_code === 0) {
          const cur = after.json.current ?? {}
          rec.readings.stage_after_done = cur.current_stage_id
          if (cur.current_stage_id !== 'plan') push('AUTO-ADVANCE', `任务做完之后当前阶段被自动推进了（${cur.current_stage_id}）—— 阶段切换只能显式发生`)
        }
        // 五关值不在词表里 ⇒ 拒
        const badGate = runRoute('RT-04', 'task-set', {
          tasks: [{ id: 'T1', stage_id: 'plan', title: 'x', status: 'open', five_gate_state: '乱写的关' }],
          current_task_id: 'T1',
          version: after.exit_code === 0 ? after.json.version : tInit.json.version,
        }, { workspace: wsTask })
        expect('非法五关值', badGate, problems, { anyOf: ['E_ARG_SCHEMA'] })
        rec.readings.bad_gate = { exit: badGate.exit_code, code: badGate.json?.error?.code ?? null }
      }

      // ⑤ 切阶段前没收清旧任务 ⇒ 拒
      const wsOpen = scenarioWorkspace('RT-04', 'open-tasks')
      const oInit = runRoute('RT-04', 'init', GATE_STAGE, { workspace: wsOpen })
      expect('init(open)', oInit, problems)
      if (oInit.exit_code === 0) {
        const addTask = runRoute('RT-04', 'task-set', {
          tasks: [{ id: 'T1', stage_id: 'plan', title: '还没做完', status: 'in_progress' }],
          current_task_id: 'T1',
          version: oInit.json.version,
        }, { workspace: wsOpen })
        expect('布置一个未完成任务', addTask, problems)
        const v = addTask.exit_code === 0 ? addTask.json.version : oInit.json.version
        const switchRes = runRoute('RT-04', 'stage-enter', {
          from: 'plan',
          to: 'execute-1',
          exit_criteria_met: ['窄评审通过', '老板施工 GO'],
          evidence: legalEvidence(),
          version: v,
        }, { workspace: wsOpen })
        expect('未收清旧任务就切阶段', switchRes, problems, { anyOf: ['E_TASKS_OPEN', 'E_EVIDENCE_MISSING'] })
        rec.readings.tasks_open = { exit: switchRes.exit_code, code: switchRes.json?.error?.code ?? null }
      }

      caseFail(problems)
    })
  })

  test('RT-05 五关词一律硬拒（并集词表 + 空白/“阶段”后缀变体），写入零副作用；合法名正例', async () => {
    await runCase('RT-05', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      if (!requireRouteCli(problems)) caseFail(problems)

      const ws = scenarioWorkspace('RT-05', 'denylist')
      const init = runRoute('RT-05', 'init', GATE_STAGE, { workspace: ws })
      expect('init', init, problems)
      if (init.exit_code !== 0) caseFail(problems)

      const currentPath = path.join(ws, '.team', 'route', 'current.json')
      const auditPath = path.join(ws, '.team', 'route', 'audit.jsonl')
      const before = { sha: sha256File(currentPath), audit: countJsonlLines(auditPath), version: init.json.version }

      const variants = []
      for (const word of FROZEN.fiveGateDenylist) {
        variants.push([`bare:${word}`, word])
        variants.push([`空白:${word}`, `  ${word}  `])
        variants.push([`后缀:${word}`, `${word}阶段`])
      }
      const results = {}
      for (const [label, name] of variants) {
        const r = runRoute('RT-05', 'stage-graph-set', {
          stages: [
            { id: 'keep', name: '讨论阶段', order: 1, state: 'current' },
            { id: 'bad', name, order: 2, state: 'future' },
          ],
          current_stage_id: 'keep',
          version: before.version,
        }, { workspace: ws })
        results[label] = { exit: r.exit_code, code: r.json?.error?.code ?? null, name }
        expect(`阶段名「${label}」必须硬拒`, r, problems, { expect: 'E_STAGE_NAME_FORGED' })
      }
      rec.readings.denylist_results = results
      rec.readings.denylist_size = FROZEN.fiveGateDenylist.length

      // 零副作用：27 次拒绝之后，current.json 与 audit 必须一字未动
      const after = { sha: sha256File(currentPath), audit: countJsonlLines(auditPath) }
      if (after.sha !== before.sha) push('NO-WRITE', `被拒的阶段名改动了 current.json（${before.sha} → ${after.sha}）—— 拒绝必须零写入`)
      if (after.audit !== before.audit) push('NO-WRITE', `被拒的阶段名往 audit 里写了东西（${before.audit} → ${after.audit}）`)
      rec.readings.no_write = { before, after }

      // 正例：带额外限定的复合名允许（拍板 Q5 原话举的例子）+ 六段合法名
      for (const name of FROZEN.stageNamesAllowedWithQualifier) {
        const r = runRoute('RT-05', 'stage-graph-set', {
          stages: [
            { id: 'keep', name: '讨论阶段', order: 1, state: 'current' },
            { id: 'ok', name, order: 2, state: 'future' },
          ],
          current_stage_id: 'keep',
          version: after.sha === before.sha ? before.version : init.json.version,
        }, { workspace: ws })
        expect(`复合名「${name}」应当允许`, r, problems)
      }

      caseFail(problems)
    })
  })

  test('RT-06 boss evidence 七场景：缺证据/转述/合法/复用/张冠李戴/下一阶段 gate/exit_criteria', async () => {
    await runCase('RT-06', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      if (!requireRouteCli(problems)) caseFail(problems)

      const fresh = (name) => {
        const ws = scenarioWorkspace('RT-06', name)
        const init = runRoute('RT-06', 'init', GATE_STAGE, { workspace: ws })
        expect(`init(${name})`, init, problems)
        return { ws, init }
      }
      const results = {}

      // ① 当前阶段 gate=approval_required、exit_criteria 已满足，却无 evidence → E_EVIDENCE_MISSING
      const s1 = fresh('missing')
      if (s1.init.exit_code === 0) {
        const r = runRoute('RT-06', 'stage-enter', { from: 'plan', to: 'execute-1', exit_criteria_met: ['窄评审通过', '老板施工 GO'], version: s1.init.json.version }, { workspace: s1.ws })
        expect('① 缺证据', r, problems, { expect: 'E_EVIDENCE_MISSING' })
        results['①缺证据'] = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      // ② 只有"老板同意了"式转述 → E_EVIDENCE_TRANSCRIBED
      const s2 = fresh('transcribed')
      if (s2.init.exit_code === 0) {
        const r = runRoute('RT-06', 'stage-enter', {
          from: 'plan', to: 'execute-1', exit_criteria_met: ['窄评审通过', '老板施工 GO'],
          evidence: legalEvidence({ verbatim: '组长复述：老板同意了，可以开工。', source_session_id: null, source_kind: 'log-line' }),
          version: s2.init.json.version,
        }, { workspace: s2.ws })
        expect('② 转述代替原话', r, problems, { expect: 'E_EVIDENCE_TRANSCRIBED' })
        results['②转述'] = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      // ③ 合法 evidence → 放行 + audit + 阶段证据落盘
      const s3 = fresh('legal')
      if (s3.init.exit_code === 0) {
        const r = runRoute('RT-06', 'stage-enter', {
          from: 'plan', to: 'execute-1', exit_criteria_met: ['窄评审通过', '老板施工 GO'],
          evidence: legalEvidence(), version: s3.init.json.version,
        }, { workspace: s3.ws })
        expect('③ 合法证据（正例）', r, problems)
        results['③合法'] = { exit: r.exit_code, code: r.json?.error?.code ?? null, transition_id: r.json?.transition_id ?? null, audit_seq: r.json?.audit_seq ?? null }
        const tid = r.json?.transition_id
        if (r.exit_code === 0) {
          if (!tid) push('EVIDENCE-ANCHOR', '成功的阶段切换没有返回 transition_id（提案 §B3.5 冻结了它）')
          else {
            const evFile = path.join(s3.ws, '.team', 'route', 'evidence', `${tid}.json`)
            let ev = null
            try {
              ev = JSON.parse(readFileSync(evFile, 'utf8'))
            } catch (err) {
              push('EVIDENCE-ANCHOR', `阶段证据文件读不出来 ${evFile}：${err.message}`)
            }
            rec.readings.evidence_file = ev
            if (ev) {
              if (ev.transition_id !== tid) push('EVIDENCE-ANCHOR', `阶段证据里的 transition_id=${ev.transition_id} 与返回的 ${tid} 不一致`)
              if (ev.used !== true) push('EVIDENCE-ANCHOR', '阶段证据提交后 used 必须为 true')
              if (ev.occurred_at === null && !ev.occurred_at_note) push('EVIDENCE-WARN', 'occurred_at 为 null 时必须带 occurred_at_note（拍板 Q4：只报 WARN，不许编时间）')
            }
          }
          const audit = countJsonlLines(path.join(s3.ws, '.team', 'route', 'audit.jsonl'))
          rec.readings.audit_lines_after_switch = audit
          if (audit === null || audit < 2) push('AUDIT', '成功的阶段切换必须写 audit（init 之前已有 1 条）')
        }
      }

      // ④ 同一 evidence 再用于另一 transition → E_EVIDENCE_USED
      const s4 = fresh('reused')
      if (s4.init.exit_code === 0) {
        const first = runRoute('RT-06', 'stage-enter', {
          from: 'plan', to: 'execute-1', exit_criteria_met: ['窄评审通过', '老板施工 GO'],
          evidence: legalEvidence(), version: s4.init.json.version,
        }, { workspace: s4.ws })
        expect('④ 第一次切换（铺垫）', first, problems)
        if (first.exit_code === 0) {
          const second = runRoute('RT-06', 'stage-enter', {
            from: 'execute-1', to: 'execute-2', exit_criteria_met: [],
            evidence: legalEvidence({ from_stage_id: 'execute-1', to_stage_id: 'execute-2', occurred_at: null, occurred_at_note: '同上（复用测试）' }),
            version: first.json.version,
          }, { workspace: s4.ws })
          expect('④ 复用同一条证据', second, problems, { expect: 'E_EVIDENCE_USED' })
          results['④复用'] = { exit: second.exit_code, code: second.json?.error?.code ?? null }
        }
      }

      // ⑤ evidence 属于另一阶段 / 来源时间不匹配 → E_EVIDENCE_NOT_MATCH
      const s5 = fresh('not-match')
      if (s5.init.exit_code === 0) {
        const r = runRoute('RT-06', 'stage-enter', {
          from: 'plan', to: 'execute-1', exit_criteria_met: ['窄评审通过', '老板施工 GO'],
          evidence: legalEvidence({ from_stage_id: 'discuss', to_stage_id: 'plan' }),
          version: s5.init.json.version,
        }, { workspace: s5.ws })
        expect('⑤ 张冠李戴的证据', r, problems, { expect: 'E_EVIDENCE_NOT_MATCH' })
        results['⑤张冠李戴'] = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      // ⑥ 当前 gate=none、下一阶段 required → 放行（正例：gate 只约束当前阶段的关闭）
      const s6 = fresh('gate-current')
      if (s6.init.exit_code === 0) {
        const graph = {
          goal: { id: 'g', title: '目标' },
          stages: [
            { id: 'a', name: '讨论阶段', order: 1, state: 'current', boss_gate: 'none' },
            { id: 'b', name: '计划阶段', order: 2, state: 'future', boss_gate: 'approval_required' },
          ],
          current_stage_id: 'a',
        }
        const init2 = runRoute('RT-06', 'init', graph, { workspace: s6.ws })
        expect('⑥ init（当前 gate none）', init2, problems)
        if (init2.exit_code === 0) {
          const r = runRoute('RT-06', 'stage-enter', { from: 'a', to: 'b', exit_criteria_met: [], version: init2.json.version }, { workspace: s6.ws })
          expect('⑥ 当前 gate none ⇒ 放行', r, problems)
          results['⑥下一阶段gate'] = { exit: r.exit_code, code: r.json?.error?.code ?? null }
        }
      }

      // ⑦ exit_criteria 未满足就切 → E_EXIT_CRITERIA
      const s7 = fresh('exit-criteria')
      if (s7.init.exit_code === 0) {
        const r = runRoute('RT-06', 'stage-enter', {
          from: 'plan', to: 'execute-1', exit_criteria_met: [],
          evidence: legalEvidence(), version: s7.init.json.version,
        }, { workspace: s7.ws })
        expect('⑦ exit_criteria 未满足', r, problems, { expect: 'E_EXIT_CRITERIA' })
        results['⑦exit_criteria'] = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      rec.readings.scenarios = results
      rec.readings.transition_id_ambiguity = {
        note: '提案 §B3.5 说 transition_id 由 updater 在"提议切换时"生成并回填 ⇒ 调用方不可能预先知道它。测试因此**不预填** transition_id（合法场景）并只断言返回值里有；这条形状歧义已报组长',
      }

      caseFail(problems)
    })
  })

  test('RT-07 当前任务 0 或 1：null 合法、两个拒、错属拒、不存在拒；无任务时五关“不适用”', async () => {
    await runCase('RT-07', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      if (!requireRouteCli(problems)) caseFail(problems)

      const ws = scenarioWorkspace('RT-07', 'main')
      const init = runRoute('RT-07', 'init', GATE_STAGE, { workspace: ws })
      expect('init', init, problems)
      if (init.exit_code !== 0) caseFail(problems)
      const results = {}

      // ① 阶段有任务、当前任务为 null ⇒ 合法
      const r1 = runRoute('RT-07', 'task-set', {
        tasks: [{ id: 'T1', stage_id: 'plan', title: '排队里', status: 'open' }],
        current_task_id: null,
        version: init.json.version,
      }, { workspace: ws })
      expect('① current_task_id=null（正例）', r1, problems)
      results['①null'] = { exit: r1.exit_code, code: r1.json?.error?.code ?? null }
      const v1 = r1.exit_code === 0 ? r1.json.version : init.json.version

      // ② 恰好 1 个当前任务且属于当前阶段 ⇒ 合法
      const r2 = runRoute('RT-07', 'task-set', {
        tasks: [{ id: 'T1', stage_id: 'plan', title: '在做的', status: 'in_progress' }],
        current_task_id: 'T1',
        version: v1,
      }, { workspace: ws })
      expect('② 恰好一个当前任务（正例）', r2, problems)
      results['②恰好一个'] = { exit: r2.exit_code, code: r2.json?.error?.code ?? null }
      const v2 = r2.exit_code === 0 ? r2.json.version : v1

      // ③ pointer 指向另外阶段的任务 ⇒ 拒
      const r3 = runRoute('RT-07', 'task-set', {
        tasks: [
          { id: 'T1', stage_id: 'plan', title: '在做的', status: 'in_progress' },
          { id: 'T2', stage_id: 'execute-1', title: '别的阶段的', status: 'open' },
        ],
        current_task_id: 'T2',
        version: v2,
      }, { workspace: ws })
      expect('③ pointer 指向另外阶段', r3, problems, { anyOf: ['E_TASK_STAGE_MISMATCH', 'E_TASK_NOT_FOUND'] })
      results['③错属'] = { exit: r3.exit_code, code: r3.json?.error?.code ?? null }

      // ④ pointer 指向不存在的任务 ⇒ 拒
      const r4 = runRoute('RT-07', 'task-set', {
        tasks: [{ id: 'T1', stage_id: 'plan', title: '在做的', status: 'in_progress' }],
        current_task_id: 'T-不存在',
        version: v2,
      }, { workspace: ws })
      expect('④ pointer 指向不存在的任务', r4, problems, { expect: 'E_TASK_NOT_FOUND' })
      results['④不存在'] = { exit: r4.exit_code, code: r4.json?.error?.code ?? null }

      // ⑤ 两个"当前任务"的任何输入形状 ⇒ 拒
      const shapes = [
        ['两个 current 不变量（current_task_ids）', { tasks: [{ id: 'T1', stage_id: 'plan', title: 'A', status: 'in_progress' }, { id: 'T2', stage_id: 'plan', title: 'B', status: 'open' }], current_task_ids: ['T1', 'T2'], version: v2 }],
        ['两个 current 不变量（current 布尔）', { tasks: [{ id: 'T1', stage_id: 'plan', title: 'A', status: 'in_progress', current: true }, { id: 'T2', stage_id: 'plan', title: 'B', status: 'open', current: true }], current_task_id: null, version: v2 }],
      ]
      for (const [label, payload] of shapes) {
        const r = runRoute('RT-07', 'task-set', payload, { workspace: ws })
        expect(`⑤ ${label}`, r, problems, { anyOf: ['E_TASK_MULTI_CURRENT', 'E_ARG_SCHEMA'] })
        results[`⑤${label}`] = { exit: r.exit_code, code: r.json?.error?.code ?? null }
      }

      // ⑥ 阶段无任务 ⇒ 摘要里五关显示"不适用"，且不崩
      const wsEmpty = scenarioWorkspace('RT-07', 'empty')
      const eInit = runRoute('RT-07', 'init', GATE_STAGE, { workspace: wsEmpty })
      expect('⑥ init(empty)', eInit, problems)
      if (eInit.exit_code === 0) {
        const sum = runRoute('RT-07', 'summarize', {}, { workspace: wsEmpty })
        expect('⑥ 无任务时 summarize（正例：不许崩）', sum, problems)
        const text = sum.json?.text ?? ''
        rec.readings.empty_summary = text.slice(0, 400)
        if (sum.exit_code === 0 && !/不适用/.test(text)) push('GATE-NA', '阶段没有任务时，五关那一层必须显示"不适用"')
      }
      rec.readings.scenarios = results

      caseFail(problems)
    })
  })

  test('RT-08 摘要投影：首行“目标 · 当前大阶段”、任务/五关/票；不把大阶段当五关；与 current 同哈希', async () => {
    await runCase('RT-08', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      if (!requireRouteCli(problems)) caseFail(problems)

      const ws = scenarioWorkspace('RT-08', 'main')
      const init = runRoute('RT-08', 'init', GATE_STAGE, { workspace: ws })
      expect('init', init, problems)
      if (init.exit_code !== 0) caseFail(problems)
      const currentPath = path.join(ws, '.team', 'route', 'current.json')

      const addTask = runRoute('RT-08', 'task-set', {
        tasks: [{ id: 'T1', stage_id: 'plan', title: 'Phase 0 基线冻结 + 测试契约', status: 'in_progress', five_gate_state: '契约与测试' }],
        current_task_id: 'T1',
        version: init.json.version,
      }, { workspace: ws })
      expect('task-set', addTask, problems)

      const sum = runRoute('RT-08', 'summarize', {}, { workspace: ws })
      expect('summarize', sum, problems)
      if (sum.exit_code === 0) {
        const text = String(sum.json.text ?? '')
        rec.readings.summary = text.slice(0, 800)
        const first = text.split(/\r?\n/)[0]?.trim() ?? ''
        if (first !== '目标 · 当前大阶段') push('SUMMARY-FIRSTLINE', `摘要首行必须恰为「目标 · 当前大阶段」，实得 ${JSON.stringify(first)}`)

        const cur = JSON.parse(readFileSync(currentPath, 'utf8'))
        if (sum.json.version !== cur.version) push('SUMMARY-VERSION', `摘要 version=${sum.json.version} 与 current.json 的 ${cur.version} 不一致`)
        // 大小写不敏感：同一份摘要，hex 大小写不是值的一部分
        if (!sha256Equal(sum.json.sha256, sha256File(currentPath))) push('SUMMARY-HASH', `摘要 sha256=${sum.json.sha256} 与盘上 current.json 的哈希 ${sha256File(currentPath)} 不一致`)

        // 任务与五关（第二层）
        if (!text.includes('契约与测试')) push('SUMMARY-GATE', '摘要里没有任务上的五关值（应当出现在任务那一层）')
        // 不把大阶段当五关值
        for (const name of FROZEN.legalStageNames) {
          if (text.split(/\r?\n/).some((l) => /五关/.test(l) && l.includes(name))) {
            push('SUMMARY-MIXUP', `摘要把大阶段名「${name}」写进了五关那一行`)
          }
        }
        // 轻看板缺席不算失败：只记读数
        rec.readings.light_kanban = { note: '契约 RT-08：轻看板缺席不算失败（v5 明确这版不做轻看板 UI）' }
      }

      caseFail(problems)
    })
  })
})
