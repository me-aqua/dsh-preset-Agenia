/**
 * GRD-01 / GRD-02 / GRD-03 —— 后台 guard（调用前判定）。
 *
 * 冻结依据：契约 §6.5 + 提案 §B1.5（签名即契约）+ §B2.5 ③（G1–G6 断言族）
 * + **裁定 A4**（`config.delegationTools` 单一形状、`configError` 与 `E_GUARD_CONFIG_MISSING` 的拒绝规则）
 * + 拍板 Q1（三个纯函数留在 `inject.js` 内用命名 `export`）。
 *
 * 三条纪律：
 *   · 被测面**只在用例体内 import**（缺面 ⇒ `SUT-SURFACE-MISSING`，不是整个文件炸掉）；
 *   · **guard 判定本身不许 mock**（契约 §9.5 第 4 条）—— 只有"框架给的 ctx"用假的；
 *   · 每个负例族都配正例：拒绝的那一条必须能被"合法参数 ⇒ 放行"翻面。
 */
import { before, describe, test } from 'node:test'
import { FROZEN, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings } from '../support/evidence.mjs'
import { importStaged, readStagedText, stagingExists } from '../support/sut.mjs'
import { parseComposition, plain } from '../support/composition.mjs'

before(() => {
  preflight()
})

/** 九件委派工具 + 各自的模式（裁定 A4 的冻结表）。 */
const TOOLS = Object.entries(FROZEN.delegationTools).map(([name, mode]) => ({ name, mode }))
const JOB_TOOLS = TOOLS.filter((t) => t.mode === 'one-shot')
const SELF_TOOLS = TOOLS.filter((t) => t.mode === 'continuable')

/** 从 staged 组合里取 `persona-injector` 那一行的 config —— **A4 冻结的唯一入参形状**。 */
function guardConfig(problems) {
  if (!stagingExists('agent.cordis.yml')) {
    problems.push(problem('SUT-SURFACE-MISSING', 'staged 还没有 agent.cordis.yml —— guard 的 config 取不到（预期的首跑红）'))
    return null
  }
  const rows = parseComposition(readStagedText('agent.cordis.yml'), 'staged').rows
  const inj = rows.find((r) => r.id === 'persona-injector')
  if (!inj || !(inj.config instanceof Map)) {
    problems.push(problem('GUARD-CONFIG', 'staged 组合里找不到 persona-injector 行的 config 映射'))
    return null
  }
  return plain(inj.config)
}

/**
 * 只会"应声"的桩 —— 用来喂 `apply` 的**假 ctx**（框架的那一半）。
 * ⚠️ 它**不参与任何判定**：被测的判定全在被 import 的纯函数里。
 */
function stubValue(seen) {
  const fn = function () { return proxy }
  const proxy = new Proxy(fn, {
    get: (t, key) => {
      if (key === 'then' || key === Symbol.toPrimitive || key === Symbol.iterator) return undefined
      seen.push(String(key))
      return proxy
    },
    apply: () => proxy,
    construct: () => proxy,
  })
  return proxy
}

function fakeCtx({ tools, baseUrl }) {
  const seen = []
  const registered = []
  let effectRuns = 0
  return {
    baseUrl,
    tools,
    get(name) {
      if (name === 'tools') return tools
      return stubValue(seen)
    },
    on() { return { dispose() {} } },
    effect(fn) {
      effectRuns += 1
      try { fn() } catch (err) { registered.push(`effect 抛错：${String(err.message)}`) }
      return { dispose() {} }
    },
    __seen: seen,
    __effectRuns: () => effectRuns,
  }
}

/** 抓住 console.error（guard 的"出声"落在这里）—— 一定还原。 */
async function withCapturedErrors(fn) {
  const captured = []
  const original = console.error
  console.error = (...args) => { captured.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')) }
  try {
    const result = await fn()
    return { captured, result, threw: null }
  } catch (err) {
    return { captured, result: null, threw: err }
  } finally {
    console.error = original
  }
}

/** verdict 的三态读数（放行 / 拒绝 / 形状不对）。 */
function verdictOf(value) {
  if (value === null || value === undefined) return { kind: 'allow', code: null, message: '' }
  if (typeof value === 'object' && typeof value.code === 'string') return { kind: 'reject', code: value.code, message: String(value.message ?? '') }
  return { kind: 'shape', code: null, message: JSON.stringify(value)?.slice(0, 120) ?? String(value) }
}

describe('unit · guard', () => {
  test('GRD-01 job_*/team_*/subagent 的调用前判定 + config 错误态一律拒', async () => {
    await runCase('GRD-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const config = guardConfig(problems)

      if (!stagingExists('inject.js')) {
        push('SUT-SURFACE-MISSING', 'staged/inject.js 不在 ⇒ guard 纯函数拿不到（预期的首跑红）')
        caseFail(problems)
      }
      const mod = await importStaged('inject.js')
      const policyFn = mod.delegationPolicy
      const verdictFn = mod.subagentBackgroundVerdict
      if (typeof policyFn !== 'function') push('SUT-SURFACE-MISSING', 'staged/inject.js 没有导出 delegationPolicy（拍板 Q1）')
      if (typeof verdictFn !== 'function') push('SUT-SURFACE-MISSING', 'staged/inject.js 没有导出 subagentBackgroundVerdict（拍板 Q1）')
      if (config === null || typeof policyFn !== 'function' || typeof verdictFn !== 'function') caseFail(problems)

      // ── ① 名单来自 config，不是硬编码（G1）────────────────────────────
      const policy = policyFn(config)
      rec.readings.policy = {
        configError: policy?.configError ?? null,
        modeKeys: policy?.mode instanceof Map ? [...policy.mode.keys()].sort() : null,
        backgroundExposed: policy?.backgroundExposed instanceof Set ? [...policy.backgroundExposed].sort() : null,
      }
      if (policy?.configError !== null && policy?.configError !== undefined) {
        push('POLICY-CONFIG-ERROR', `合法 config 上 delegationPolicy 不该报错，实得 configError=${policy.configError}`)
      }
      if (!(policy?.mode instanceof Map)) push('POLICY-SHAPE', 'delegationPolicy(config).mode 必须是 Map（提案 §B1.5）')
      else {
        const got = [...policy.mode.keys()].sort()
        const want = TOOLS.map((t) => t.name).sort()
        if (JSON.stringify(got) !== JSON.stringify(want)) push('POLICY-NAMES', `mode 的键实得 ${JSON.stringify(got)}，冻结 ${JSON.stringify(want)}`)
        const badMode = TOOLS.filter((t) => policy.mode.get(t.name) !== t.mode)
        if (badMode.length > 0) push('POLICY-MODE', `模式与冻结表不符：${badMode.map((t) => `${t.name} 应为 ${t.mode} 实得 ${policy.mode.get(t.name)}`).join('；')}`)
      }
      if (!(policy?.backgroundExposed instanceof Set)) push('POLICY-SHAPE', 'delegationPolicy(config).backgroundExposed 必须是 Set')
      else {
        const missingExposed = JOB_TOOLS.filter((t) => !policy.backgroundExposed.has(t.name))
        if (missingExposed.length > 0) {
          push('POLICY-EXPOSED', `这四条 job 工具没有暴露 run_in_background 参数：${missingExposed.map((t) => t.name).join(', ')} —— 那样 guard 的"必须显式 true"根本无法满足（拍板 I1：不写 enableRunInBackground 就是为了留着它）`)
        }
      }

      // ── ② job_*：只有 `=== true` 才放行（G2）──────────────────────────
      const jobResults = {}
      const badArgs = [
        ['省略', {}],
        ['false', { run_in_background: false }],
        ['字符串 true', { run_in_background: 'true' }],
        ['null', { run_in_background: null }],
        ['0', { run_in_background: 0 }],
      ]
      for (const tool of JOB_TOOLS) {
        for (const [label, args] of badArgs) {
          const v = verdictOf(verdictFn(tool.name, args, policy))
          jobResults[`${tool.name}/${label}`] = { kind: v.kind, code: v.code }
          if (v.kind !== 'reject') push('GUARD-JOB-FOREGROUND', `${tool.name} 传「${label}」必须被拒（E_GUARD_JOB_FOREGROUND），实得 ${v.kind}/${v.code}`)
          else if (v.code !== FROZEN.guardVerdictCodes.job) push('GUARD-JOB-CODE', `${tool.name} 传「${label}」的拒绝码应为 ${FROZEN.guardVerdictCodes.job}，实得 ${v.code}`)
          else {
            for (const needle of [tool.name, FROZEN.guardMessageNeedles.must, FROZEN.guardMessageNeedles.jobExample]) {
              if (!v.message.includes(needle)) push('GUARD-JOB-MSG', `${tool.name} 传「${label}」的报文里没有「${needle}」：${v.message.slice(0, 160)}`)
            }
          }
        }
        const ok = verdictOf(verdictFn(tool.name, { run_in_background: true }, policy))
        jobResults[`${tool.name}/true`] = { kind: ok.kind, code: ok.code }
        if (ok.kind !== 'allow') push('GUARD-JOB-POSITIVE', `${tool.name} 显式 run_in_background:true 必须放行（正例），实得 ${ok.kind}/${ok.code}：${ok.message.slice(0, 160)}`)
        // 多余字段不许影响判定
        const extra = verdictOf(verdictFn(tool.name, { run_in_background: true, prompt: 'x', weird: 1 }, policy))
        if (extra.kind !== 'allow') push('GUARD-JOB-EXTRA', `${tool.name} 带无关字段时仍应放行（guard 只按工具名+参数行动），实得 ${extra.kind}/${extra.code}`)
      }
      rec.readings.job_verdicts = jobResults

      // ── ③ team_*/subagent：只拒显式 false（G3）────────────────────────
      const selfResults = {}
      for (const tool of SELF_TOOLS) {
        const denied = verdictOf(verdictFn(tool.name, { run_in_background: false }, policy))
        selfResults[`${tool.name}/false`] = { kind: denied.kind, code: denied.code }
        if (denied.kind !== 'reject') push('GUARD-SELF-FOREGROUND', `${tool.name} 显式 run_in_background:false 必须被拒，实得 ${denied.kind}/${denied.code}`)
        else if (denied.code !== FROZEN.guardVerdictCodes.self) push('GUARD-SELF-CODE', `${tool.name} 的拒绝码应为 ${FROZEN.guardVerdictCodes.self}，实得 ${denied.code}`)
        else {
          for (const needle of [tool.name, FROZEN.guardMessageNeedles.must, FROZEN.guardMessageNeedles.selfOmitted]) {
            if (!denied.message.includes(needle)) push('GUARD-SELF-MSG', `${tool.name} 的报文里没有「${needle}」：${denied.message.slice(0, 160)}`)
          }
        }
        for (const [label, args] of [['省略', {}], ['true', { run_in_background: true }]]) {
          const allowed = verdictOf(verdictFn(tool.name, args, policy))
          selfResults[`${tool.name}/${label}`] = { kind: allowed.kind, code: allowed.code }
          if (allowed.kind !== 'allow') push('GUARD-SELF-POSITIVE', `${tool.name} 传「${label}」必须放行（省略即后台），实得 ${allowed.kind}/${allowed.code}`)
        }
      }
      rec.readings.self_verdicts = selfResults

      // ── ④ config 缺失/非法的错误态（裁定 A4 第 3 条）──────────────────
      const badConfigs = [
        ['空 config', {}],
        ['null', null],
        ['undefined', undefined],
        ['数组', { delegationTools: [] }],
        ['空对象', { delegationTools: {} }],
        ['值非法', { delegationTools: { job_memory_judge: 'foreground', team_test: 'continuable' } }],
        ['字符串', { delegationTools: 'job_memory_judge' }],
      ]
      const cfgResults = {}
      for (const [label, cfgBad] of badConfigs) {
        let badPolicy = null
        try {
          badPolicy = policyFn(cfgBad)
        } catch (err) {
          push('POLICY-CONFIG-ERROR', `delegationPolicy(${label}) 抛错而不是返回 configError：${String(err.message).slice(0, 160)}`)
          continue
        }
        cfgResults[label] = { configError: badPolicy?.configError ?? null }
        if (badPolicy?.configError !== FROZEN.guardConfigError) {
          push('POLICY-CONFIG-ERROR', `delegationPolicy(${label}) 的 configError 应为 ${FROZEN.guardConfigError}，实得 ${JSON.stringify(badPolicy?.configError)}`)
          continue
        }
        // 错误态下的 emergency 拒绝规则（**A13 逐字**：别误杀框架自己的 job 工具）
        //   拒：精确 `subagent` · `team_` 前缀 · `job_memory_`/`job_conversation_`/`job_technical_` 前缀
        //   放：`job_output`/`job_kill`/`job_list` 及其它非委派工具 —— 配置坏了也要能收作业结果
        for (const name of FROZEN.guardConfigErrorRejects) {
          const v = verdictOf(verdictFn(name, { run_in_background: true }, badPolicy))
          if (v.kind !== 'reject' || v.code !== FROZEN.guardConfigError) {
            push('GUARD-CONFIG-ERROR', `${label}：config 错误态下 ${name} 必须被拒（${FROZEN.guardConfigError}），实得 ${v.kind}/${v.code}`)
          }
        }
        for (const name of FROZEN.guardConfigErrorAllows) {
          const v = verdictOf(verdictFn(name, { run_in_background: false }, badPolicy))
          if (v.kind !== 'allow') {
            push('GUARD-CONFIG-ERROR', `${label}：config 错误态下「${name}」必须放行（A13：job_output / job_kill / job_list 是取作业结果用的，误杀它们等于现场再也收不回来），实得 ${v.kind}/${v.code}`)
          }
        }
        // 边界读数（只记不断言）：这些名字**不在** A13 的拒绝形状里
        cfgResults[label].boundary_names = Object.fromEntries(
          FROZEN.guardConfigErrorRule.boundaryNames.map((n) => [n, verdictOf(verdictFn(n, {}, badPolicy)).kind]),
        )
        cfgResults[label].framework_job_tools = Object.fromEntries(
          FROZEN.guardConfigErrorRule.allowExplicit.map((n) => [n, verdictOf(verdictFn(n, {}, badPolicy)).kind]),
        )
      }
      rec.readings.config_error_state = cfgResults
      rec.readings.a13_note = {
        note: 'A13（追加裁定 v1.1）：错误态拒绝形状从 `^(subagent|team_|job_)` 收窄成"精确 subagent + team_ + job_memory_/job_conversation_/job_technical_ 前缀"，并**明确放行** job_output/job_kill/job_list。',
      }

      // ── ⑤ 门禁必须排在 officeBound 提前返回之前（覆盖所有角色）────────
      //    ⚠️ 这是**文件序代理**：真正的语义是"同一个回调里先判 guard 再判岗位"。
      //    两个标记都要在；且 gate 的出现位置必须早于岗位判定。
      // 🔴 v1.18 ⑤（同类加固）：位置比较**只许在代码行上做** —— 先剔掉注释行与空行，
      //    否则注释里提一句 `officeBoundVerdict(` / `subagentBackgroundVerdict(` 就能左右判据（"注释一动判据就翻脸"）。
      const srcRaw = readStagedText('inject.js')
      const src = srcRaw.split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
      rec.readings.gate_order_src = { raw_bytes: srcRaw.length, code_only_bytes: src.length, note: '位置比较用的是剔掉注释/空行之后的代码文本' }
      const gateIdx = src.indexOf('subagentBackgroundVerdict(')
      const officeIdx = (() => {
        const cands = ['officeBoundVerdict(', 'officeBound.has(', 'OFFICE_BOUND.has(']
          .map((m) => src.indexOf(m))
          .filter((i) => i >= 0)
        return cands.length === 0 ? -1 : Math.min(...cands)
      })()
      rec.readings.gate_order = { gate_idx: gateIdx, office_idx: officeIdx }
      rec.readings.gate_order_note = {
        note: 'A15（追加裁定 v1.1）：这条只是**文件序代理**，不是语义证明；真正的"guard 调用点早于岗位判定"只能在 R1 真挂载验证（留在 R1 清单）。',
      }
      if (gateIdx < 0) push('GATE-ORDER', 'staged/inject.js 里没有 subagentBackgroundVerdict 的调用点 —— 门禁根本没接上')
      if (officeIdx < 0) push('GATE-ORDER', 'staged/inject.js 里找不到岗位判定（officeBoundVerdict / officeBound.has）—— 无法确认门禁排在它前面')
      if (gateIdx >= 0 && officeIdx >= 0 && gateIdx > officeIdx) {
        push('GATE-ORDER', `门禁的调用点（第 ${gateIdx} 字节）排在岗位判定（第 ${officeIdx} 字节）之后 —— 受限岗位会先被提前返回吃掉，门禁对它们不生效（契约 GRD-01：必须覆盖所有角色）`)
      }
      if (!src.includes('tools.guard')) push('GATE-WIRING', 'staged/inject.js 里没有 tools.guard 的注册点')

      caseFail(problems)
    })
  })

  test('GRD-02 合法调用与无关工具一律放行（判据会翻面）', async () => {
    await runCase('GRD-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const config = guardConfig(problems)
      if (!stagingExists('inject.js')) {
        push('SUT-SURFACE-MISSING', 'staged/inject.js 不在 ⇒ guard 纯函数拿不到（预期的首跑红）')
        caseFail(problems)
      }
      const mod = await importStaged('inject.js')
      const policyFn = mod.delegationPolicy
      const verdictFn = mod.subagentBackgroundVerdict
      if (typeof policyFn !== 'function' || typeof verdictFn !== 'function' || config === null) {
        push('SUT-SURFACE-MISSING', 'staged/inject.js 缺 delegationPolicy / subagentBackgroundVerdict 的命名导出（拍板 Q1）')
        caseFail(problems)
      }
      const policy = policyFn(config)
      rec.readings.policy_config_error = policy?.configError ?? null

      // ── ① 合法调用：十条工具各按自己的模式放行 ────────────────────────
      const legal = []
      for (const tool of TOOLS) {
        const args = tool.mode === 'one-shot' ? { run_in_background: true } : {}
        const v = verdictOf(verdictFn(tool.name, args, policy))
        legal.push({ name: tool.name, mode: tool.mode, args, kind: v.kind })
        if (v.kind !== 'allow') push('GUARD-LEGAL', `${tool.name}（${tool.mode}）的合法调用必须放行，实得 ${v.kind}/${v.code}：${v.message.slice(0, 160)}`)
      }
      rec.readings.legal_calls = legal

      // ── ② 无关工具不许被误伤（含框架自己的 job_output / job_kill）──────
      const unrelated = ['read', 'write', 'edit', 'present', 'job_output', 'job_kill', 'send_message', 'todo_write', 'pwsh', 'bash', 'team_design_fake', 'not_a_tool']
      const harmed = []
      for (const name of unrelated) {
        for (const args of [{}, { run_in_background: false }, { run_in_background: true }, { run_in_background: 'true' }, { path: '.team/x.md' }]) {
          const v = verdictOf(verdictFn(name, args, policy))
          if (v.kind !== 'allow') {
            harmed.push({ name, args, code: v.code })
            push('GUARD-UNRELATED', `无关工具 ${name}（args=${JSON.stringify(args)}）被 guard 拦了（${v.code}）—— 它只该按工具名+参数行动，不许误伤别的字段/工具`)
          }
        }
      }
      rec.readings.unrelated_harmed = harmed

      // ── ③ 判据会翻面：同一条断言的两侧都成立（负例已在 GRD-01，这里钉正侧）──
      const flip = {
        job_legal: verdictOf(verdictFn('job_memory_judge', { run_in_background: true }, policy)).kind,
        job_illegal: verdictOf(verdictFn('job_memory_judge', {}, policy)).kind,
        self_legal: verdictOf(verdictFn('team_test', {}, policy)).kind,
        self_illegal: verdictOf(verdictFn('team_test', { run_in_background: false }, policy)).kind,
      }
      rec.readings.flip = flip
      if (!(flip.job_legal === 'allow' && flip.job_illegal === 'reject' && flip.self_legal === 'allow' && flip.self_illegal === 'reject')) {
        push('GUARD-FLIP', `判据没有翻面（应当合法放行/非法拒绝两侧都成立）：${JSON.stringify(flip)}`)
      }

      // ── ④ config 错误态下"非委派工具一律放行"（A4 第 3 条的另一半 + **A13 收窄后**）──
      const a13Rejects = (name) =>
        name === 'subagent' || name.startsWith('team_') || ['job_memory_', 'job_conversation_', 'job_technical_'].some((p) => name.startsWith(p))
      const badPolicy = policyFn({})
      if (badPolicy?.configError === FROZEN.guardConfigError) {
        const mustAllow = [...new Set([...unrelated, ...FROZEN.guardConfigErrorAllows])].filter((n) => !a13Rejects(n))
        const harmedUnderError = mustAllow.filter((n) => verdictOf(verdictFn(n, {}, badPolicy)).kind !== 'allow')
        rec.readings.unrelated_under_config_error = { must_allow: mustAllow, harmed: harmedUnderError }
        if (harmedUnderError.length > 0) {
          push('GUARD-CONFIG-ERROR', `config 错误态下这些非委派工具仍应放行（A13 明确要求 job_output/job_kill/job_list 也放行），实得被拦：${harmedUnderError.join(', ')}`)
        }
        // 边界读数：按 A13 的形状判，`team_design_fake` 也算委派形状（读数，不断言）
        rec.readings.config_error_boundary = {
          team_design_fake: verdictOf(verdictFn('team_design_fake', {}, badPolicy)).kind,
          subagent_fork: verdictOf(verdictFn('subagent_fork', {}, badPolicy)).kind,
        }
      } else {
        push('POLICY-CONFIG-ERROR', `空 config 上 delegationPolicy 应返回 ${FROZEN.guardConfigError}，实得 ${JSON.stringify(badPolicy?.configError)}`)
      }

      caseFail(problems)
    })
  })

  test('GRD-03 拿不到 tools.guard 必须 loud（含“subagent 后台硬门未生效”）且 R1 判 NO-GO', async () => {
    await runCase('GRD-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const config = guardConfig(problems)
      if (!stagingExists('inject.js')) {
        push('SUT-SURFACE-MISSING', 'staged/inject.js 不在 ⇒ GRD-03 无从执行（预期的首跑红）')
        caseFail(problems)
      }
      const mod = await importStaged('inject.js')
      const applyFn = mod.apply
      if (typeof applyFn !== 'function') {
        push('SUT-SURFACE-MISSING', 'staged/inject.js 没有导出 apply（钩子入口）—— 无法用假 ctx 走到门禁安装那一步')
        caseFail(problems)
      }
      const baseUrl = `file:///${PATHS.stagedPreset.replace(/\\/g, '/')}/inject.js`
      const configWith = config ?? { contentDir: PATHS.stagedPreset, delegationTools: FROZEN.delegationTools }

      // ── ① 静态：那句话必须写在"拿不到 guard"的分支里 ──────────────────
      const src = readStagedText('inject.js')
      rec.readings.static_needle_present = src.includes(FROZEN.guardMessageNeedles.missingGuard)
      if (!src.includes(FROZEN.guardMessageNeedles.missingGuard)) {
        push('GUARD-SILENT', `staged/inject.js 里没有「${FROZEN.guardMessageNeedles.missingGuard}」这句话 —— 硬门没生效必须出声（G6）`)
      }

      // ── ② 行为：假 ctx（tools.guard 不是函数）⇒ console.error 必须响 ──
      const noGuardRun = await withCapturedErrors(() => applyFn(fakeCtx({ tools: {}, baseUrl }), configWith))
      rec.readings.no_guard_run = { captured: noGuardRun.captured, threw: noGuardRun.threw ? String(noGuardRun.threw.message).slice(0, 300) : null }
      const loud = noGuardRun.captured.some((l) => l.includes(FROZEN.guardMessageNeedles.missingGuard))
        || (noGuardRun.threw && String(noGuardRun.threw.message).includes(FROZEN.guardMessageNeedles.missingGuard))
      if (!loud) {
        push('GUARD-SILENT', `拿不到 tools.guard 时没有出声（既没 console.error 也没有含「${FROZEN.guardMessageNeedles.missingGuard}」的异常）：captured=${JSON.stringify(noGuardRun.captured).slice(0, 300)}`)
      }

      // ── ③ 有 guard 时必须装上，且 config 错误态要出声（裁定 A4 第 3 条）──
      const hooked = []
      const goodRun = await withCapturedErrors(() => applyFn(fakeCtx({ tools: { guard: (fn) => { hooked.push(fn); return { dispose() {} } } }, baseUrl }), configWith))
      rec.readings.good_run = { captured: goodRun.captured, hooked: hooked.length, threw: goodRun.threw ? String(goodRun.threw.message).slice(0, 300) : null }
      // v1.14：`apply` 在有 guard 的正当 config 下**本不该抛** ⇒ 抛了是红（否则下面"有没有登记回调"根本判不了）
      if (goodRun.threw !== null) {
        push('GATE-WIRING', `有 tools.guard、config 合法时 apply 不该抛，实得 ${String(goodRun.threw.message).slice(0, 200)}`)
      } else if (hooked.length === 0) {
        push('GATE-WIRING', '有 tools.guard 时没有登记任何门禁回调')
      }
      // config 里缺 delegationTools ⇒ 必须出声（报文里点到那个键或那个错误码）
      const brokenRun = await withCapturedErrors(() => applyFn(fakeCtx({ tools: { guard: () => ({ dispose() {} }) }, baseUrl }), { contentDir: PATHS.stagedPreset }))
      rec.readings.config_missing_run = { captured: brokenRun.captured }
      const configLoud = brokenRun.captured.some((l) => l.includes(FROZEN.delegationToolsKey) || l.includes(FROZEN.guardConfigError))
      if (!configLoud) {
        push('GUARD-CONFIG-SILENT', `config 缺 ${FROZEN.delegationToolsKey} 时 apply 没有出声（报文里既没有这个键名、也没有 ${FROZEN.guardConfigError}）：${JSON.stringify(brokenRun.captured).slice(0, 300)}`)
      }
      // 派生检查：新键必须进配置自检的白名单，否则每次挂载都会误报"不认识的配置键"
      const unknownKey = goodRun.captured.filter((l) => l.includes('不认识的配置键'))
      rec.readings.selfcheck_unknown_key = unknownKey
      if (unknownKey.length > 0) {
        push('SELFCHECK-UNKNOWN-KEY', `配置自检把新增的 ${FROZEN.delegationToolsKey} 当成"不认识的配置键"（${unknownKey.join(' / ').slice(0, 200)}）—— 新键要同批进 inject.js 的 KNOWN_CONFIG 白名单`)
      }

      // ── ④ R1 必须判 NO-GO + 不许把 fail-open 说成结构拦截 ──────────────
      if (stagingExists('work-guidelines.md')) {
        const wg = readStagedText('work-guidelines.md')
        rec.readings.r1_no_go_needle = wg.includes('NO-GO')
        rec.readings.guard_scope_needle = /后台硬门|门禁|guard/.test(wg)
        if (!wg.includes('NO-GO')) push('R1-GATE', 'work-guidelines.md 没有写"guard 没装上 ⇒ R1 判 NO-GO"（契约 GRD-03 的 R1 gate）')
        if (!/后台硬门|门禁|guard/.test(wg)) push('R1-GATE', 'work-guidelines.md 里没有一处提到后台硬门/门禁 ⇒ 范围与 fail-open 残余没写清（拍板 I7）')
        if (/所有委派路径(都)?(被)?拦/.test(wg)) push('SCOPE-HONESTY', 'work-guidelines.md 写了"所有委派路径都拦住了" —— 拍板 I7 明令禁止（workflow/ralph 的内部 worker 不在结构保证内）')
      } else {
        push('SUT-SURFACE-MISSING', 'staged/work-guidelines.md 不在 ⇒ R1 gate 与范围口径无从检查（预期红）')
      }
      rec.readings.fail_open_residual = {
        note: '物理残余：门禁没装上时，委派仍然起得来，只是会 console.error。测试只证明"出声了"，**不许**把它说成结构性拦截（契约 §11.4 第 4 条）。',
      }

      caseFail(problems)
    })
  })
})
