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
import { fixturePath, importStaged, readStagedText, stagingExists } from '../support/sut.mjs'
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
      /**
       * 名单的键 == 组合里的实例（`G1`）—— 上面三格就是这条：
       * `POLICY-SHAPE`（`mode` 必须是 Map）· `POLICY-NAMES`（键集）· `POLICY-MODE`（每个键的模式）。
       *
       * 🔴 这里**没有** `POLICY-EXPOSED`（2026-10-19 第 4 关评审 B-3，组长裁决：删掉）。理由写在
       *    `mig-rules-10` 上 —— 它不能翻面，所以它不是判据：
       *      ① `delegationPolicy()`（staged/inject.js:730）算 `backgroundExposed` 的方式就是
       *         `new Set(mode.keys())` ⇒ 只要上面 `POLICY-NAMES` 绿（`mode.keys()` == 冻结的九个头），
       *         这一条在逻辑上**不可能红**；它测的不是被测对象，是两张冻结表的一行算术。
       *      ② `run_in_background` 这个参数在 0.2.1 上**已经不存在**（见本用例 ② 段那段 🔴：省略即后台）
       *         ⇒ "这四条工具**暴露着**这个参数"是一句与平台相反的断言。
       *    ⇒ 删掉它**没有**丢掉真保护：那三格逐字未动，而且各有刀 ——
       *      `K17`（组合里多一个委派工具）⇒ `POLICY-NAMES` 当场红；
       *      `K18`（判决岗模式从 `one-shot` 改成 `continuable`）⇒ `POLICY-MODE` 当场红（都量过）。
       *      `POLICY-SHAPE`（`mode` 必须是 Map）这一轮**没有单独下刀** —— 别把它读成"证过了"。
       *    `backgroundExposed` 的读数照旧留在 `rec.readings.policy.backgroundExposed`（是证据，不是判据）。
       */
      rec.readings.exposed_note = {
        note: 'backgroundExposed = new Set(mode.keys())（inject.js:730）⇒ 它是派生量，不作判据；名单的键由 POLICY-NAMES 钉（刀 K17），每个键的模式由 POLICY-MODE 钉（刀 K18）。',
      }

      // ── ② job_*：显式 `true` **或省略**放行（0.2.1），显式 `false` / 非布尔真值一律拒（G2）──
      // 🔴 **2026-10-19（DSH 0.2.1）：这条判据跟着平台改，但**没有放宽**。**
      //    平台事实：`run_in_background` 这个参数已从工具里删掉，0.2.1 的委派一律异步
      //    （调用即返回 `started subagent`）⇒ "省略"从"在前台等着"变成"框架本身就异步"，
      //    它本来就满足这条门禁的**目标**。来源：`presets/agenia/inject.js:744-752,769-773`
      //    的 🔴 注释（实现岗落地的平台决定，不是测试岗猜的）。
      //    改后**两侧都钉**，少一侧就退化成"永远拒"或"永远放":
      //      · 省略 ⇒ **必须放行**（`GUARD-JOB-OMITTED`）—— 谁把它改回"必须 === true"，
      //        这一格立刻红（那种半修会让四条作业在 0.2.1 上一次都发不出去）；
      //      · 显式 `false` / `'true'` / `null` / `0` ⇒ **仍然必须拒**（`GUARD-JOB-FOREGROUND`）
      //        —— "硬塞一个前台值"这条路照样堵着。
      const jobResults = {}
      const badArgs = [
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
        // 省略 = 后台（0.2.1 的平台决定）：与上面那条**成对**
        const omitted = verdictOf(verdictFn(tool.name, {}, policy))
        jobResults[`${tool.name}/省略`] = { kind: omitted.kind, code: omitted.code }
        if (omitted.kind !== 'allow') {
          push('GUARD-JOB-OMITTED', `${tool.name} 省略 run_in_background 必须放行（0.2.1 的委派一律异步、参数已经删了），实得 ${omitted.kind}/${omitted.code}：${omitted.message.slice(0, 160)}`)
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
      // 🔴 2026-10-19（0.2.1）：one-shot 的"非法侧"从「省略」改成「显式 false」——
      //    "省略"现在是合法的（见 GRD-01 ②）。翻面的**形状**没变：合法放行 / 非法拒绝两侧都成立。
      const flip = {
        job_legal: verdictOf(verdictFn('job_memory_judge', { run_in_background: true }, policy)).kind,
        job_illegal: verdictOf(verdictFn('job_memory_judge', { run_in_background: false }, policy)).kind,
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

  test('GRD-03 拿不到 tools.guard 必须 loud（点名缺哪样 + 说清后果）且骨架写着「出声≠拦截」', async () => {
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
      /**
       * 🔴 判据口径（2026-10-19 · 0.2.1 换措辞之后）—— 钉**两个属性**，不是一句原文：
       *   ① 点名缺的是哪一样（`没有 tools.guard`）；② 同一句里说清后果（"没有生效 / 没挂上"）。
       * 这样"整段告警被删掉"仍然红、"喊了但没说清哪样/什么后果"也红。
       * 旧原文 `subagent 后台硬门未生效` 在 0.2.1 的注入器里已经不存在（实现岗按平台改的措辞）。
       */
      const NEEDLE = FROZEN.guardMessageNeedles.missingGuard
      const CONSEQ = FROZEN.guardMessageNeedles.missingGuardConsequence
      const namesAndConsequence = (text) => text.includes(NEEDLE) && CONSEQ.some((c) => text.includes(c))

      // ── ① 静态：那句话必须写在"拿不到 guard"的分支里 ──────────────────
      const src = readStagedText('inject.js')
      rec.readings.static_needle = { needle: NEEDLE, consequence_hits: CONSEQ.filter((c) => src.includes(c)) }
      if (!src.includes(NEEDLE)) {
        push('GUARD-SILENT', `staged/inject.js 里没有「${NEEDLE}」这句话 —— 硬门没生效必须点名缺的是哪一样（G6）`)
      } else if (!CONSEQ.some((c) => src.includes(c))) {
        push('GUARD-SILENT', `staged/inject.js 提到了「${NEEDLE}」却没说后果（${CONSEQ.join(' / ')} 一个都没有）—— "缺了"不是"没生效"（G6）`)
      }

      // ── ② 行为：假 ctx（tools.guard 不是函数）⇒ console.error 必须响 ──
      const noGuardRun = await withCapturedErrors(() => applyFn(fakeCtx({ tools: {}, baseUrl }), configWith))
      rec.readings.no_guard_run = { captured: noGuardRun.captured, threw: noGuardRun.threw ? String(noGuardRun.threw.message).slice(0, 300) : null }
      // 出声 = 有一条报文**同时**点名缺哪样 + 说清后果（见上面那段 🔴 的口径）
      const loudLine = noGuardRun.captured.find((l) => namesAndConsequence(l))
      const loud = loudLine !== undefined
        || (noGuardRun.threw !== null && noGuardRun.threw !== undefined && namesAndConsequence(String(noGuardRun.threw.message)))
      if (!loud) {
        push('GUARD-SILENT', `拿不到 tools.guard 时没有**说得清**的出声：要有一条报文同时含「${NEEDLE}」与 ${JSON.stringify(CONSEQ)} 之一`
          + `（既没 console.error 也没有这样的异常）：captured=${JSON.stringify(noGuardRun.captured).slice(0, 300)}`)
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

      // ── ④ 骨架必须留下那两条口径：**装不上要出声** + **出声不是拦截** ──────────
      // 🔴 2026-10-19：原来是"work-guidelines.md 必须写 `NO-GO`"。那个词在**整份预设里 0 处**
      //    （10-17「静态文件只留骨架」把知识搬去共享记忆了，老板原话「别往里写了」）——
      //    义务没有消失，它落在骨架保留的那两条上：门禁装不上**必须出声**、**但那不是拦截**。
      //    判据因此改钉这两条（**不是放宽**：谁把告警义务删掉、或把 fail-open 写成"拦得住"，这里都红）。
      //    来历：`cand-20261017-static-files-keep-skeleton-only-01`。
      // 🔴 2026-10-19 第 4 关复审 R-2：`loud` 这根针是**按行匹配的正则**（`FROZEN.guardDocNeedles.loud`
      //    是正则源串），不是字面子串 —— 理由写在 `support/env.mjs` 那段 🔴 里：
      //    钉字面邻接会把"门禁装不上**时，注入器**必须出声"（`B-6` 那张待挂票要写的样子）判成红。
      //    两个方向：`K14`（义务被换成"会打一条日志"）⇒ 红；`A1`（写清施动者）⇒ 绿。
      if (stagingExists('work-guidelines.md')) {
        const wg = readStagedText('work-guidelines.md')
        const loudNeedle = FROZEN.guardDocNeedles.loud
        const honestNeedle = FROZEN.guardDocNeedles.honest
        const loudRe = new RegExp(loudNeedle)
        const loudHit = wg.split(/\r?\n/).some((l) => loudRe.test(l))
        rec.readings.r1_needles = {
          loud: loudHit,
          loud_re: loudNeedle,
          honest: wg.includes(honestNeedle),
          scope: /后台硬门|门禁|guard/.test(wg),
          no_go: wg.includes('NO-GO'),
        }
        if (!loudHit) {
          push('R1-GATE', `work-guidelines.md 里没有一行匹配「${loudNeedle}」—— 门禁装不上必须**出声**这条义务没写下来（装不上是静默失败，没人发现）`)
        }
        if (!wg.includes(honestNeedle)) {
          push('R1-GATE', `work-guidelines.md 里没有「${honestNeedle}」—— 必须写明"那只出声、不拦人"（否则读的人会以为失败时是结构拦截，fail-open 的残余就被藏起来了）`)
        }
        if (!/后台硬门|门禁|guard/.test(wg)) push('R1-GATE', 'work-guidelines.md 里没有一处提到后台硬门/门禁 ⇒ 范围与 fail-open 残余没写清（拍板 I7）')
        if (/所有委派路径(都)?(被)?拦/.test(wg)) push('SCOPE-HONESTY', 'work-guidelines.md 写了"所有委派路径都拦住了" —— 拍板 I7 明令禁止（workflow/ralph 的内部 worker 不在结构保证内）')
      } else {
        push('SUT-SURFACE-MISSING', 'staged/work-guidelines.md 不在 ⇒ R1 gate 与范围口径无从检查（预期红）')
      }
      rec.readings.fail_open_residual = {
        note: '物理残余：门禁没装上时，委派仍然起得来，只是会 console.error。测试只证明"出声了"，**不许**把它说成结构性拦截（契约 §11.4 第 4 条）。',
      }

      // ── ⑤ 🔴 配置自检（`selfCheck`）的**四格夹具**（票 `T-TEST-06` ②）────────────────────
      // 【为什么钉它、而**不**钉一张 key 名字白名单】组长那条族级判据：
      //   **「这个东西明天会不会变？会 ⇒ 别拿它的值当判据 —— 钉它的形状，或者把它算出来。」**
      //   一份写死 key 名的白名单 ⇒ **每加一项都会常驻红** ⇒ 那正是"**红的是判据、不是被测对象**"。
      //   而 `inject.js::selfCheck` 守的是三条**真属性**：**合法性**（哪几类 key 不该出现在哪张表）
      //   + **可解析性**（"声明了但没注入"）+ **受众边界**（组长专属的不许进 `memberOrder`）。
      // 【判据只有一条】**加一个"合法的"注入项会不会红？**
      //   会红 ⇒ **白名单**（禁）；不会红、而**越界**会红 ⇒ **黑名单/边界**（对）。
      //   ⚠️ 两者在"越界"那一格**行为完全相同** ⇒ **只测越界分不出来** —— 第 ② 格就是为这个加的。
      // 【四格，缺一格就分不出"白名单"与"边界"】
      //   ① 正例：当前两份 order ⇒ **零问题**；
      //   ② 🆕 **合法新增**：两张表各加一个**假装的合法项**（夹具里造一份真 `.md`）⇒ **仍然零问题**；
      //   ③ **越界**：`me-aqua` 塞进 `memberOrder` ⇒ **必须出声**（那正是 2026-10-16 补的那道边界）；
      //   ④ **不生效 / 解析不开**：`charter` 进 `leaderOrder` · `roster` 进 `memberOrder` · 不存在的 key ⇒ **各自出声**。
      // 【怎么翻面】把 `NON_FILE_KEYS` 里的 `memory` 拿掉 ⇒ 第 ① 格会变成"找不到 memory.md"的**假问题**（红）；
      //   把第 ③ 格那道边界拆掉 ⇒ 第 ③ 格红（第 ② 格照旧绿）；把自检整个短路 ⇒ 第 ③④ 格红（第 ①② 格**假绿**）。
      if (config !== null && config !== undefined) {
        // 🔴 **先排空**：`selfCheck()` 是 fire-and-forget（`apply()` 不 await 它）⇒
        //    本用例**前面那三次 `applyFn`**（拿不到 guard / 有 guard / config 缺键）的自检
        //    可能还在飞 —— 它们的那一声会落进**下面任何一个**捕获窗，把读数搅乱
        //    （实测：不排空时"正例"那格抓到 2 行、下一格 0 行，**逐格行数在抖**）。
        await new Promise((resolve) => setTimeout(resolve, 400))
        /**
         * 自检那一声的**针**。⚠️ 这是**报文措辞**，本来属于"会变的东西"——
         * 所以下面**自带完整性对照**：④c 那一格必须**同时**满足
         *   ① 抓到的行里含我喂进去的那个 key 名（`no-such-doc`，**措辞无关**）
         *   ② 抓到的行命中了这根针
         * ⇒ 措辞哪天变了，②会不成立 ⇒ 当场红「**针过期了**」，**不会**静默变成"每格都静默"的假绿。
         * （同族先例：`FROZEN.guardMessageNeedles.missingGuard` —— 那道也是措辞针，用法一样。）
         */
        const NEEDLE = '配置里有'
        const pathMod = await import('node:path')
        const fsMod = await import('node:fs')
        const fxRoot = pathMod.default.join(pathMod.default.dirname(fixturePath('GRD-03', 'selfcheck-content', 'md')), 'selfcheck-content')
        const fxTeam = pathMod.default.join(fxRoot, 'team')
        fsMod.mkdirSync(fxTeam, { recursive: true })
        const write = (rel, text) => fsMod.writeFileSync(pathMod.default.join(fxRoot, rel), `${text}\n`, 'utf8')
        const realLeader = Array.isArray(config.leaderOrder) ? config.leaderOrder : []
        const realMember = Array.isArray(config.memberOrder) ? config.memberOrder : []
        const boundRoles = Array.isArray(config.officeBound) ? config.officeBound : []
        // 夹具内容根：**当前两份 order 需要的那些 .md** + `team/<受限角色>.md` + 一份"假装的合法新项"。
        for (const key of new Set([...realLeader, ...realMember])) {
          if (key === 'charter' || ['roster', 'board', 'memory'].includes(key)) continue
          write(`${key}.md`, `（夹具）${key}`)
        }
        for (const role of boundRoles) write(`team/${role}.md`, `（夹具）team/${role}`)
        write('fresh-notes.md', '（夹具）一个"合法的"新注入项 —— 它**存在**，所以加它不该红')
        const base = { ...config, contentDir: fxRoot }
        /**
         * 跑一次真 `apply()`，把**自检那一声**抓回来（按针筛选 —— 别的噪声一律不进读数）。
         * ⚠️ `selfCheck()` 是 **fire-and-forget**（`apply()` 不 await 它）⇒ 抓错误必须**多等一拍**，
         *    否则它那声会在 capture 关掉之后才响 —— 那样**每一格都是"静默"**（假绿）。
         * 🔴 **逐格判据一律做差**（"这一格比正例多出来的行"），**不钉具体措辞**：
         *    同一次 ctx/config 产生的**恒定噪声**在差里自动抵消。
         */
        const runOnce = async (over) => {
          const r = await withCapturedErrors(async () => {
            await applyFn(fakeCtx({ tools: { guard: () => ({ dispose() {} }) }, baseUrl }), { ...base, ...over })
            await new Promise((resolve) => setTimeout(resolve, 200))
          })
          return { lines: r.captured.filter((l) => l.includes(NEEDLE)).slice(), threw: r.threw ? String(r.threw.message).slice(0, 200) : null }
        }
        const cells = {}
        const runCell = async (label, over) => {
          const out = await runOnce(over)
          cells[label] = { lines: out.lines.map((l) => l.slice(0, 200)), threw: out.threw }
          return out
        }
        const base0 = await runCell('① 正例：当前两份 order（夹具内容根）', {})
        const added = (out) => out.lines.filter((l) => !base0.lines.includes(l))

        // 🔴 **① 正例必须干净**（2026-10-16 补：这一腿是变异体 `m-nonfile-memory-off` **活下来**之后加的）。
        //    为什么非有不可：下面 ②③④ 全是**跟 ① 做差**。如果某个错误**对所有格一视同仁**
        //    （最典型：把"算出来的"项当成"内容根下的一个 .md" ⇒ 每格都多出"找不到 X.md"），
        //    那它在差里**被自动抵消** ⇒ ②③④ 全绿 ⇒ **变异体存活**（实测过，就是这个形状）。
        //    夹具内容根里**恰好**是"当前两份 order 需要的那些 .md" ⇒ 正例报任何问题都**不是噪声**：
        //    要么是 `selfCheck` 的**假问题**，要么是夹具缺东西 —— 两种都该红。
        if (base0.lines.length > 0) {
          push('SELFCHECK-FALSE-PROBLEM',
            '① **正例**（当前两份 order · 夹具内容根里那些 .md 都在）竟然报了问题 —— '
            + '要么是 `selfCheck` 的**假问题**（典型：把"算出来的"项当成"内容根下的一个 .md"，'
            + '如 `memory` 不在 `NON_FILE_KEYS` 里 ⇒ 每格都喊"找不到 memory.md"），要么是夹具缺东西。'
            + `报文：${base0.lines.join(' / ').slice(0, 400)}`)
        }

        // ② **合法新增**（**承重那一格**）：两张表各加一个文件真的存在的新项 ⇒ **不许比正例多出任何一行**。
        //    白名单在这一格会红，边界不会 —— 这就是"白名单 vs 黑名单"唯一能被测出来的那一格。
        const cell2 = await runCell('② 合法新增：两张表各加 fresh-notes（文件在）', { leaderOrder: [...realLeader, 'fresh-notes'], memberOrder: [...realMember, 'fresh-notes'] })
        if (added(cell2).length > 0) {
          push('SELFCHECK-OVERREACH',
            `② **合法新增**（往两张 order 各加一个**文件真的存在**的项）竟然出声了 —— 这就是"**白名单冒充安全边界**"的形状：`
            + `加一个合法的项也红 ⇒ 每加一项都会常驻红。多出来的行：${added(cell2).join(' / ').slice(0, 300)}`)
        }
        // ③ **越界**：组长专属那份进 memberOrder ⇒ **必须比正例多出声**，而且点到那个 key 名。
        const cell3 = await runCell('③ 越界：me-aqua 进 memberOrder', { memberOrder: [...realMember, 'me-aqua'] })
        const add3 = added(cell3)
        if (add3.length === 0) {
          push('SELFCHECK-BOUNDARY-SILENT', '③ 把 `me-aqua`（**只给组长**的那份）塞进 `memberOrder` **一声没响** —— 组员会静默拿到「老板这个人」')
        } else if (!add3.join(' ').includes('me-aqua')) {
          push('SELFCHECK-BOUNDARY-WORDING', `③ 出声了但报文里没点到 \`me-aqua\`（认不出是哪一项）：${add3.join(' / ').slice(0, 300)}`)
        }
        // ④ 三格"不生效 / 解析不开"：各自必须多出声，且点到那个 key 名。
        let anyLoud = add3.length > 0
        for (const [label, over, key] of [
          ['④a 不生效：charter 进 leaderOrder', { leaderOrder: [...realLeader, 'charter'] }, 'charter'],
          ['④b 不生效：roster 进 memberOrder', { memberOrder: [...realMember, 'roster'] }, 'roster'],
          ['④c 解析不开：一个不存在的 key', { leaderOrder: [...realLeader, 'no-such-doc'] }, 'no-such-doc'],
        ]) {
          const out = await runCell(label, over)
          const add = added(out)
          if (add.length > 0) anyLoud = true
          if (add.length === 0) push('SELFCHECK-SILENT', `${label} **必须出声**却没有（自检没跑？判据被拆了？）`)
          else if (!add.join(' ').includes(key)) push('SELFCHECK-WORDING', `${label} 出声了但报文里没点到「${key}」：${add.join(' / ').slice(0, 300)}`)
          // 🔴 **针的完整性对照**（就放在 ④c 这一格上）：它必须**同时**命中针与那个 key 名。
          //    只命中 key 名而没命中针 ⇒ **针过期了**（措辞变了）⇒ 必须红，否则 ①② 的"静默"是假绿。
          if (label.startsWith('④c')) {
            const raw = (await runOnce(over)).lines
            const hasKeyName = raw.join(' ').includes(key)
            if (hasKeyName && add.length === 0) {
              push('SELFCHECK-NEEDLE-STALE', `④c 抓到了含「${key}」的行，但**没有一行命中针「${NEEDLE}」** ⇒ 这根**措辞针过期了**（staged/inject.js 的自检报文改了）。针一过期，①② 的"静默"就会变成**假绿** —— 请同批更新这根针。`)
            }
          }
        }
        // 🔴 **活性对照**：四格里至少有一格"比正例多出声" ⇒ 自检确实在这条路上跑着。
        //    否则 ①②的"静默"是**假绿**（自检压根没跑时，它们也是静默的）。
        //    ⚠️ 另：夹具内容根**故意不造** `memory.md` —— 它是"算出来的"，`selfCheck` 不该去找它；
        //       哪天它开始报"找不到 memory.md"，第 ① 格会多出行 ⇒ 同样在这里被逮住。
        if (!anyLoud) {
          push('SELFCHECK-NOT-RUNNING', '四格都拿不到"比正例多出来的行" ⇒ 自检这条路**没在跑**（此时 ①② 的"静默"是假绿，不是通过）')
        }
        rec.readings.selfcheck_cells = cells
        rec.readings.selfcheck_any_loud = anyLoud
      }

      caseFail(problems)
    })
  })
})
