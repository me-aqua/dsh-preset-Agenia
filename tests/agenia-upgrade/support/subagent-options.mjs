/**
 * **「改一个 model，会话真用它」的运行时量具**（`PRS-05`）—— 2026-11-08 老板把这一格从"不做"改成"做"。
 *
 * 背景（为什么这一格之前不在）：`CONTRACT-A` §12.4 写着 `ROLE_TABLE.model` 是**纯声明**（没有读者），
 * 定形 §6.1「非身份设置 no-regression」那一行因此被判成"第 5 关不成立"。老板 2026-11-08 改了落法：
 * 模型**不住角色表**，住**九条委派行**的 `agentOptions`（`dsh-tool-subagent` 的配置键；README：
 * "Configured child `provider`, `model`, … overlays any provider-owned route defaults"）。
 * 于是"会话真用它"这一格**有落点了** —— 量的是**装好的插件**拿到这一行配置之后，给子会话算出来的
 * `agentOptions`。
 *
 * ── 量的到底是哪一层（读的人先看这一句）────────────────────────────────────
 * **不是**子会话记录（`session.header`）。要拿到那一份得真起一个子会话 = 一次真 LLM 往返；
 * 这一层跑在套件里，做不到。所以量的是**它前一层**：
 *   ① 真 `dsh-tool-subagent/lib/index.js`（从装好的 `resources/app.asar` 里逐字节读出）的
 *      `execute()` 交给 `ctx.subagents.startActivation()` 的 `request.agentOptions`；
 *   ② 再用真 `dsh-subagent` 的 `resolveChildAgentOptions(parent, requested, depth)`（从同一份 asar
 *      里按函数名切出来）算出**子 Agent 的 options**（它的文档说这就是传给 `ctx.agents.create()` 的那一份）。
 * 读数是这两层；`measured_layer` 字段逐字写着这句话。
 *
 * ── 为什么 fake 父路由 ≠ 被写死的 model ────────────────────────────────────
 * 若父会话本来就在 `deepseek-flash` 上，子会话拿到同一个 model 可能只是**继承**来的 —— 那这一格
 * 无法区分"配置生效"与"跟着父会话走"。所以假父会话故意坐在另一个模型上（`deepseek-chat`），
 * 而刀（去掉一行 `agentOptions`）必须让子会话**回落到父路由**。两臂都量，才叫"真用它"。
 *
 * ── 哪些是真代码、哪些是假的（写清边界，别把 fake 读成产品）───────────────
 *   · **逐字节真源码**：`dsh-tool-subagent/lib/index.js` · `dsh-subagent-spawn-in-process/lib/index.js`；
 *   · **按函数名切出来的真源码**：`delegationDepthOf` / `assertSubagentMaxDepth` /
 *     `parentAgentOptionsForDelegation` / `resolveChildAgentOptions`（`dsh-subagent`）·
 *     `ReasoningEffortId`（`dsh-llm`）+ 它用的 `brandString`（`dsh-brand`）——
 *     锚点找不到 ⇒ `CHILD-MODEL-HARNESS`（红），**不静默换一份手抄实现**；
 *   · **假的是服务边界**：`ctx`（tools / subagents / systemPrompt / sessionProjections / logger）、
 *     `llm.resolveCallConfig`（只记路由）、`startActivation`（只记请求 + 回一个 childId）、
 *     以及三个 schema 包（`schemastery` / `zod` / `dsh-tools.defineTool`）—— 它们只用于模块加载期的
 *     配置形状声明，不参与这一格的计算。
 *
 * 输入：现役 `presets/agenia/agent.cordis.yml` 的九条委派行（**配置来自 yml，读数来自插件**）。
 * 另加一条派生物对账：`cordis.patch.yml` 里同一行的 `agentOptions` 必须与组合一致（装到机器上的是补丁）。
 */
import { createHash } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { asarHeader, platformReading } from './platform.mjs'
import { cfg, parseComposition, plain } from './composition.mjs'

/** 老板 2026-11-08 写死的那一对（`provider` + **模型 id**）。 */
export const CHILD_MODEL_PIN = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-flash' })
/** 那个只是**显示名**（不是 id）—— 写进 yml 会让适配器找不到模型。 */
export const CHILD_MODEL_DISPLAY_NAME = 'DeepSeek-V41-Flash'
/** 假父会话的路由：**故意不是**被写死的那个 model（否则这一格分不清"配置"与"继承"）。 */
export const CHILD_PARENT_ROUTE = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-chat', maxTokens: 8192 })

const ASAR_PREFIX = 'dsh/node_modules/@deepseek-ai/'
/** 从 asar 里要读的源码（`kind` 决定怎么进沙箱）。 */
const SOURCES = Object.freeze({
  plugin: { inner: `${ASAR_PREFIX}dsh-tool-subagent/lib/index.js`, as: 'plugin.mjs' },
  spawn: { inner: `${ASAR_PREFIX}dsh-subagent-spawn-in-process/lib/index.js`, as: 'spawn-provider.mjs' },
  subagent: { inner: `${ASAR_PREFIX}dsh-subagent/lib/index.js`, as: 'dsh-subagent-source.mjs' },
  llm: { inner: `${ASAR_PREFIX}dsh-llm/lib/index.js`, as: 'dsh-llm-source.mjs' },
  brand: { inner: `${ASAR_PREFIX}dsh-brand/lib/index.js`, as: 'dsh-brand-source.mjs' },
  session: { inner: `${ASAR_PREFIX}dsh-session/lib/index.js`, as: 'dsh-session-source.mjs' },
  pkg: { inner: `${ASAR_PREFIX}dsh-tool-subagent/package.json`, as: 'plugin-package.json' },
})

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/** 从 asar 目录树里读一份文件的**全部字节**（`unpacked` 的真身在旁边目录）。 */
function readAsarEntry(asar, inner) {
  const { header, dataOffset, problem } = asarHeader(asar)
  if (header === null) return { ok: false, why: problem, text: null }
  let node = header
  for (const part of inner.split('/').filter(Boolean)) node = node?.files?.[part]
  if (node === undefined) return { ok: false, why: `asar 里没有 ${inner}`, text: null }
  if (node.files !== undefined) return { ok: false, why: `${inner} 在 asar 里是目录`, text: null }
  if (node.unpacked === true) {
    try {
      return { ok: true, why: null, text: readFileSync(`${asar}.unpacked\\${inner.split('/').join('\\')}`, 'utf8') }
    } catch (err) {
      return { ok: false, why: `读 unpacked 真身失败：${err.code ?? err.message}`, text: null }
    }
  }
  let fd
  try {
    fd = openSync(asar, 'r')
    const buf = Buffer.alloc(Number(node.size ?? 0))
    readSync(fd, buf, 0, buf.length, dataOffset + Number(node.offset ?? 0))
    return { ok: true, why: null, text: buf.toString('utf8') }
  } catch (err) {
    return { ok: false, why: `读 ${inner} 失败：${err.code ?? err.message}`, text: null }
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** 按函数名切一段真源码（锚点缺失 ⇒ 返回 null，调用方记红；**不**回落到手抄实现）。 */
function sliceFunction(source, startMarker, endMarker) {
  const a = source.indexOf(startMarker)
  if (a < 0) return null
  const b = endMarker === null ? source.indexOf('\n}', a) + 2 : source.indexOf(endMarker, a + startMarker.length)
  if (b <= a) return null
  return source.slice(a, b)
}

/** 三个 schema 包的最小假面：模块加载期只做形状声明，不参与计算（读的人看得见它是假的）。 */
const SCHEMA_STUB = `
const chain = () => {
  const p = new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : (...a) => p),
    apply: () => p,
  })
  return p
}
`

/**
 * 把量具要的沙箱落盘（**只写 `workspace` 之下**）：真源码 + 切出来的真函数 + 三个 schema 假面。
 * @param {string} workspace 证据根里的一个目录（`caseDir('PRS-05')`）
 * @param {Record<string,string>} sources `readAsarEntry` 的结果
 * @returns {{dir: string, files: Record<string,string>, stubs: string[], slices: object}}
 */
function writeSandbox(workspace, sources) {
  const dir = path.join(workspace, 'plugin-sandbox')
  const helper = [
    sliceFunction(sources.subagent, 'function delegationDepthOf(agent)', 'function assertSubagentMaxDepth(maxDepth)'),
    sliceFunction(sources.subagent, 'function assertSubagentMaxDepth(maxDepth)', '//#endregion'),
    sliceFunction(sources.subagent, 'function parentAgentOptionsForDelegation(parent)', 'function resolveChildAgentOptions'),
    sliceFunction(sources.subagent, 'function resolveChildAgentOptions(parent, requested, childDepth)', 'function childSessionMeta'),
    'export { delegationDepthOf, assertSubagentMaxDepth, parentAgentOptionsForDelegation, resolveChildAgentOptions }',
  ]
  const reasoning = [
    sliceFunction(sources.brand, 'function brandString(value)', 'function brandNumber'),
    sliceFunction(sources.llm, 'function ReasoningEffortId(', null),
    'export { ReasoningEffortId }',
  ]
  if (helper.some((x) => x === null) || reasoning.some((x) => x === null)) {
    return { dir, files: {}, stubs: [], slices: { helper: null, reasoning: null }, why: '真源码里切不出那几个函数（锚点变了）' }
  }
  const files = {
    'node_modules/@deepseek-ai/schemastery/package.json': JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.0-agenia-test-stub', type: 'module', main: 'index.mjs', exports: './index.mjs' }, null, 2) + '\n',
    'node_modules/@deepseek-ai/schemastery/index.mjs': `${SCHEMA_STUB}\nexport default new Proxy({}, { get: () => chain() })\n`,
    'node_modules/zod/package.json': JSON.stringify({ name: 'zod', version: '0.0.0-agenia-test-stub', type: 'module', main: 'index.mjs', exports: './index.mjs' }, null, 2) + '\n',
    'node_modules/zod/index.mjs': `${SCHEMA_STUB}\nexport const z = new Proxy({}, { get: () => chain() })\n`,
    'node_modules/@deepseek-ai/dsh-tools/package.json': JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.0.0-agenia-test-stub', type: 'module', main: 'index.mjs', exports: './index.mjs' }, null, 2) + '\n',
    'node_modules/@deepseek-ai/dsh-tools/index.mjs': 'export function defineTool(definition) { return definition }\n',
    'node_modules/@deepseek-ai/dsh-llm/package.json': JSON.stringify({ name: '@deepseek-ai/dsh-llm', version: '0.0.0-agenia-test-stub', type: 'module', main: 'index.mjs', exports: './index.mjs' }, null, 2) + '\n',
    'node_modules/@deepseek-ai/dsh-llm/index.mjs': `${reasoning.join('\n')}\n`,
    'node_modules/@deepseek-ai/dsh-subagent/package.json': JSON.stringify({ name: '@deepseek-ai/dsh-subagent', version: '0.0.0-agenia-test-stub', type: 'module', main: 'index.mjs', exports: './index.mjs' }, null, 2) + '\n',
    'node_modules/@deepseek-ai/dsh-subagent/index.mjs': `${helper.join('\n')}\n`,
    'plugin.mjs': sources.plugin,
    'spawn-provider.mjs': sources.spawn,
  }
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, text, 'utf8')
  }
  return {
    dir,
    files,
    stubs: ['@deepseek-ai/schemastery', 'zod', '@deepseek-ai/dsh-tools'],
    slices: {
      helper: { bytes: helper.join('\n').length, sha256: sha256(helper.join('\n')), functions: ['delegationDepthOf', 'assertSubagentMaxDepth', 'parentAgentOptionsForDelegation', 'resolveChildAgentOptions'] },
      reasoning: { bytes: reasoning.join('\n').length, sha256: sha256(reasoning.join('\n')), functions: ['brandString', 'ReasoningEffortId'] },
    },
  }
}

/** 假 ctx —— 只到插件碰的那几个口子（`apply` / `execute` 的观察面都在这里）。 */
function makeCtx() {
  const captured = { preflight: [], starts: [], tools: new Map() }
  const providers = new Map()
  const ctx = {
    get: (name) => ({
      agentPresets: {},
      llm: { resolveCallConfig: async (route) => { captured.preflight.push({ ...route }) ; return {} } },
    })[name],
    on: () => {},
    effect: (fn) => fn(),
    logger: { info: () => {} },
    tools: {
      register: (definition) => { captured.tools.set(definition.name, definition); return () => captured.tools.delete(definition.name) },
      get: (name) => captured.tools.get(name),
    },
    systemPrompt: { section: () => {}, context: () => {}, getSectionOrder: () => 0, getContextOrder: () => 0 },
    sessionProjections: { register: async () => ({ stateOf: () => undefined }) },
    subagents: {
      registerProvider: (provider) => providers.set(provider.name, provider),
      getProvider: (name) => providers.get(name),
      resolveMaxDepth: (value) => (value === 'provider-managed' ? undefined : value),
      startActivation: async (input) => { captured.starts.push(input); return { childId: 'fake-child-1' } },
    },
  }
  return { ctx, captured }
}

/** 假父 Agent：**路由故意不是**被写死的那个 model（见文件头）；形状照真 `dsh-subagent` 读的两处。 */
function makeParent(route) {
  return {
    options: { provider: route.provider, model: route.model, maxTokens: route.maxTokens ?? CHILD_PARENT_ROUTE.maxTokens, subagentDepth: 0 },
    session: {
      header: { delegationDepth: 0 },
      requestHeader: () => ({ config: { provider: route.provider, model: route.model } }),
    },
  }
}

/**
 * **子会话的 `session.header` 里到底允不允许出现 provider/model** —— 从装好的 `dsh-session` 里量。
 *
 * 为什么要量这一下：老板要的是"从**子会话自己的记录**里读到 model"。这一版平台的
 * `validateSessionHeader()` 是写进 header 的那张白名单；若里面没有 provider/model，那么
 * **子会话头天生不带模型** —— 模型住在子 Agent 的 options（`ctx.agents.create()` 那一层），
 * 也就是本格量的那一层。这是产品事实，不是本格的辩解；产品哪天把路由写进 header，这个读数会翻。
 */
function sessionHeaderReading(source) {
  const text = String(source ?? '')
  const a = text.indexOf('function validateSessionHeader(')
  const b = a < 0 ? -1 : text.indexOf('function validateRestoredSessionHeader(', a)
  if (a < 0 || b < 0) {
    return { source: 'asar!dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js', ok: false, fields: null, has_provider: null, has_model: null, why: '在 dsh-session 里切不出 `validateSessionHeader()`' }
  }
  const fields = [...new Set([...text.slice(a, b).matchAll(/record\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))].sort()
  return {
    source: 'asar!dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js',
    ok: true, fields,
    has_provider: fields.includes('provider'),
    has_model: fields.includes('model'),
    why: null,
  }
}

/** 一台机器上 `deepseek-flash` 这个 **id** 是不是真存在（只是读数；文件不在就不判）。 */function profileModelReading() {
  const file = path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml')
  const out = { file, present: false, model_id_present: null, display_name: null }
  let text
  try { text = readFileSync(file, 'utf8') } catch { return out }
  out.present = true
  const idAt = text.indexOf(`- id: ${CHILD_MODEL_PIN.model}`)
  if (idAt < 0) { out.model_id_present = false; return out }
  out.model_id_present = true
  const tail = text.slice(idAt, idAt + 400)
  const name = /^\s+name:\s*(.+)$/m.exec(tail)
  out.display_name = name === null ? null : name[1].trim()
  return out
}

/**
 * 跑一格：九条委派行 × 真插件 ⇒ 子会话的 `agentOptions`。
 *
 * @param {object} input
 * @param {string} input.compositionText 现役 `agent.cordis.yml` 全文
 * @param {string} [input.patchText] 现役 `cordis.patch.yml` 全文（给了才判派生物）
 * @param {string[]} input.toolNames 九条委派行的 `toolName`（从定形 §2.2 那张闭表来）
 * @param {string} input.workspace 证据根里的一个目录（沙箱落点）
 * @param {{provider: string, model: string, maxTokens?: number}} [input.parentRoute]
 * @returns {Promise<{problems: {code: string, message: string}[], readings: object}>}
 */
export async function childModelReadings({
  compositionText,
  patchText = null,
  toolNames,
  workspace,
  parentRoute = CHILD_PARENT_ROUTE,
}) {
  const problems = []
  const push = (code, message) => problems.push({ code, message })
  const readings = {
    pin: { ...CHILD_MODEL_PIN },
    display_name: CHILD_MODEL_DISPLAY_NAME,
    parent_route: { ...parentRoute },
    measured_layer: 'startActivation.request.agentOptions + dsh-subagent.resolveChildAgentOptions（**不是**子会话记录）',
    child_session_record: false,
    rows: [],
    profile: null,
    plugin: null,
    sandbox: null,
  }

  // ── 输入：九条委派行（配置来自组合；这九行是老板那句话的对象）───────────────
  const rows = parseComposition(compositionText, 'live-composition').rows
  const byTool = new Map()
  for (const row of rows) {
    const name = cfg(row, 'toolName')
    if (typeof name === 'string') byTool.set(name, row)
  }
  const missing = toolNames.filter((name) => !byTool.has(name))
  if (missing.length > 0) {
    push('CHILD-MODEL-ROW-MISSING', `组合里找不到这些委派行（toolName）：${JSON.stringify(missing)} —— 这一格要逐行读 \`agentOptions\``)
    return { problems, readings }
  }
  const configs = toolNames.map((name) => ({ name, row: byTool.get(name), config: plain(byTool.get(name).config) ?? {} }))
  readings.input_rows = configs.map(({ name, row, config }) => ({
    toolName: name, row_id: row.id ?? null, agentPreset: config.agentPreset ?? null,
    agentOptions: config.agentOptions ?? null,
  }))

  // ── 机器事实：装好的插件源码 / 版本（**从 asar 读，不从 yml 读**）──────────────
  const platform = platformReading()
  readings.platform = { ok: platform.ok, asar: platform.asar, version: platform.dsh?.version ?? null, source: platform.source, level: platform.level }
  if (!platform.ok || platform.asar === null) {
    return { problems, readings, hold: { code: 'CHILD-MODEL-PLUGIN-ABSENT', why: `读不到装好的平台 asar（${platform.problems.join('；')}）⇒ 这一格没有"真插件"可跑` } }
  }
  const sourceTexts = {}
  for (const [key, spec] of Object.entries(SOURCES)) {
    const got = readAsarEntry(platform.asar, spec.inner)
    if (!got.ok) {
      return { problems, readings, hold: { code: 'CHILD-MODEL-PLUGIN-ABSENT', why: `asar 里读不出 ${spec.inner}：${got.why}` } }
    }
    sourceTexts[key] = got.text
  }
  let pkg
  try { pkg = JSON.parse(sourceTexts.pkg) } catch { pkg = null }
  readings.plugin = {
    asar: platform.asar,
    inner: SOURCES.plugin.inner,
    bytes: Buffer.byteLength(sourceTexts.plugin, 'utf8'),
    sha256: sha256(sourceTexts.plugin),
    version: pkg?.version ?? null,
    provider_inner: SOURCES.spawn.inner,
    provider_sha256: sha256(sourceTexts.spawn),
    subagent_sha256: sha256(sourceTexts.subagent),
    llm_sha256: sha256(sourceTexts.llm),
  }
  // 真插件源码得先过一眼：拿到的是不是那个包（不是空壳 / 不是别的文件）
  if (!sourceTexts.plugin.includes('function requestedAgentOptions(') || !sourceTexts.plugin.includes('startActivation')) {
    push('CHILD-MODEL-HARNESS', `asar 里的 \`${SOURCES.plugin.inner}\` 不像 \`dsh-tool-subagent\`（没有 \`requestedAgentOptions\` / \`startActivation\`）—— 量具没有可跑的对象`)
    return { problems, readings }
  }

  // ── 沙箱：真源码 + 切出来的真函数 + schema 假面 ────────────────────────────
  let sandbox
  try {
    sandbox = writeSandbox(workspace, sourceTexts)
  } catch (err) {
    push('CHILD-MODEL-HARNESS', `沙箱写不出来（${workspace}）：${err?.message ?? err}`)
    return { problems, readings }
  }
  readings.sandbox = { dir: sandbox.dir, files: Object.keys(sandbox.files), stubs: sandbox.stubs, slices: sandbox.slices ?? null, why: sandbox.why ?? null }
  if (sandbox.why !== null && sandbox.why !== undefined) {
    push('CHILD-MODEL-HARNESS', `沙箱没建起来：${sandbox.why}`)
    return { problems, readings }
  }
  let pluginModule
  let spawnModule
  let helperModule
  try {
    pluginModule = await import(`${pathToFileURL(path.join(sandbox.dir, 'plugin.mjs')).href}?sha=${readings.plugin.sha256}`)
    spawnModule = await import(`${pathToFileURL(path.join(sandbox.dir, 'spawn-provider.mjs')).href}?sha=${readings.plugin.provider_sha256}`)
    helperModule = await import(pathToFileURL(path.join(sandbox.dir, 'node_modules', '@deepseek-ai', 'dsh-subagent', 'index.mjs')).href)
  } catch (err) {
    push('CHILD-MODEL-HARNESS', `真插件 / 真 provider / 切出来的运行时函数 import 失败：${err?.message ?? err}`)
    return { problems, readings }
  }
  if (typeof pluginModule.apply !== 'function' || typeof spawnModule.apply !== 'function' || typeof helperModule.resolveChildAgentOptions !== 'function') {
    push('CHILD-MODEL-HARNESS', `沙箱里的模块面不对：plugin.apply=${typeof pluginModule.apply} · spawn.apply=${typeof spawnModule.apply} · resolveChildAgentOptions=${typeof helperModule.resolveChildAgentOptions}`)
    return { problems, readings }
  }
  readings.profile = profileModelReading()
  if (readings.profile.present && readings.profile.model_id_present === false) {
    push('CHILD-MODEL-UNKNOWN-ID', `这台机器的 desktop profile（${readings.profile.file}）里没有模型 id \`${CHILD_MODEL_PIN.model}\` —— 写死的那个 id 在运行时不存在，子会话起不来`)
  }
  // ── "子会话头里带不带模型"：**量**一次（不是断言）────────────────────────────
  readings.session_header = sessionHeaderReading(sourceTexts.session)
  if (readings.session_header.ok && (readings.session_header.has_provider || readings.session_header.has_model)) {
    push('CHILD-MODEL-HEADER-NOW-CARRIES-ROUTE', `这一版平台的 session header 白名单里出现了 provider/model（${JSON.stringify(readings.session_header.fields)}）—— "子会话头不携带路由、只能量子 Agent options"这个前提变了：请重新定这一格的量法`)
  }

  /** 起一台假宿主：真 provider 注册 + 一行配置 ⇒ 执行一次委派 ⇒ 记三处读数。 */
  const drive = async (config) => {
    const { ctx, captured } = makeCtx()
    await spawnModule.apply(ctx, { providerName: 'spawn' })
    await pluginModule.apply(ctx, config)
    const definition = captured.tools.get(config.toolName)
    if (definition === undefined) throw new Error(`插件没有注册工具 ${config.toolName}（provider 没挂上？）`)
    const parent = makeParent(parentRoute)
    const exec = { agent: parent, signal: { throwIfAborted() {} } }
    const call = await definition.execute({ description: 'PRS-05 量具 · 一次派工', prompt: 'PRS-05：这一格只为读子会话的 agentOptions，不发真任务。' }, exec)
    const start = captured.starts[0] ?? null
    const requested = start?.request?.agentOptions ?? null
    const resolved = helperModule.resolveChildAgentOptions(parent, requested ?? undefined, 1)
    return { call, start, requested, resolved, preflight: captured.preflight[0] ?? null }
  }

  // ── 主判据：九行逐行过 ─────────────────────────────────────────────────────
  for (const { name, row, config } of configs) {
    const rowReading = { toolName: name, row_id: row.id ?? null, config, start: null, requested: null, resolved: null, preflight: null, error: null }
    if (config.agentOptions === undefined) {
      push('CHILD-MODEL-OPTIONS-MISSING', `${name} 那一行没有 \`agentOptions\` —— 子会话会跟着父会话的默认模型走，老板要的"写死"没有落点`)
      readings.rows.push(rowReading)
      continue
    }
    try {
      const got = await drive(config)
      rowReading.call = got.call
      rowReading.start = got.start === null ? null : { provider: got.start.provider, label: got.start.label, agentPreset: got.start.request?.agentPreset ?? null, maxDepth: got.start.request?.maxDepth ?? null, agentOptions: got.requested, extra_keys: Object.keys(got.start.request ?? {}) }
      rowReading.requested = got.requested
      rowReading.resolved = got.resolved
      rowReading.preflight = got.preflight
      const requested = got.requested
      if (requested === null || requested === undefined) {
        push('CHILD-MODEL-OPTIONS-MISSING', `${name}：插件交给 \`startActivation\` 的请求里没有 \`agentOptions\`（配置读到了却没落到子会话上）`)
      } else {
        if (requested.provider !== CHILD_MODEL_PIN.provider || requested.model !== CHILD_MODEL_PIN.model) {
          push('CHILD-MODEL-DRIFT', `${name}：子会话拿到的 agentOptions 是 ${JSON.stringify({ provider: requested.provider, model: requested.model })}，写死的是 ${JSON.stringify(CHILD_MODEL_PIN)}`
            + (requested.model === CHILD_MODEL_DISPLAY_NAME ? `（写成了显示名 \`${CHILD_MODEL_DISPLAY_NAME}\` —— 那不是模型 id）` : ''))
        }
        if (got.preflight === null || got.preflight.provider !== CHILD_MODEL_PIN.provider || got.preflight.model !== CHILD_MODEL_PIN.model) {
          push('CHILD-MODEL-PREFLIGHT-DRIFT', `${name}：插件送去适配器预检的路由是 ${JSON.stringify(got.preflight)}，写死的是 ${JSON.stringify(CHILD_MODEL_PIN)}`)
        }
        if (got.resolved === null || got.resolved.model !== CHILD_MODEL_PIN.model || got.resolved.provider !== CHILD_MODEL_PIN.provider) {
          push('CHILD-MODEL-NOT-LANDED', `${name}：运行时 \`resolveChildAgentOptions\` 算出来的子 Agent options 里没有写死的那一对（${JSON.stringify(got.resolved)}）`)
        }
        if (got.resolved?.model === CHILD_PARENT_ROUTE.model) {
          push('CHILD-MODEL-PARENT-INHERITED', `${name}：子会话的 model 等于**父会话**的 ${CHILD_PARENT_ROUTE.model} —— 说明拿到的不是写死的那一个（这一格的假父路由故意与写死的不同）`)
        }
      }
    } catch (err) {
      rowReading.error = String(err?.message ?? err)
      push('CHILD-MODEL-HARNESS', `${name}：跑真插件时抛了（${rowReading.error}）—— 量具没量到东西，不许当绿`)
    }
    readings.rows.push(rowReading)
  }
  if (configs.some(({ config }) => config.agentOptions?.model === CHILD_MODEL_PIN.model) && parentRoute.model === CHILD_MODEL_PIN.model) {
    push('CHILD-MODEL-PARENT-SAME', `假父会话的路由也是 ${CHILD_MODEL_PIN.model} —— 这一格分不清"配置生效"与"继承父会话"（量具前提不成立）`)
  }

  // ── 派生物：补丁里同一行必须也是这一对（装到机器上的是补丁）──────────────────
  if (typeof patchText === 'string') {
    const patchRows = parseComposition(patchText, 'live-patch').rows
    const patchByTool = new Map()
    for (const row of patchRows) {
      const name = cfg(row, 'toolName')
      if (typeof name === 'string') patchByTool.set(name, row)
    }
    readings.patch_rows = []
    for (const name of toolNames) {
      const row = patchByTool.get(name)
      if (row === undefined) {
        push('PATCH-MODEL-MISSING', `补丁（派生物）里找不到 ${name} 那一行 —— 组合改了而补丁没跟上`)
        readings.patch_rows.push({ toolName: name, found: false })
        continue
      }
      const got = plain(cfg(row, 'agentOptions')) ?? null
      readings.patch_rows.push({ toolName: name, found: true, agentOptions: got })
      if (got === null || got.provider !== CHILD_MODEL_PIN.provider || got.model !== CHILD_MODEL_PIN.model) {
        push('PATCH-MODEL-DRIFT', `补丁里 ${name} 的 agentOptions 是 ${JSON.stringify(got)}，写死的是 ${JSON.stringify(CHILD_MODEL_PIN)} —— 装到机器上的那份没有这一对`)
      }
    }
  }

  // ── 刀：把一条 `team_*` 行上的 `agentOptions` 拿掉 ⇒ 子会话必须回落到父路由 ────────
  //    点名 `team_dev`（"派一个组员"最典型的那条路）；它不在时退到第一条 team_*。
  const first = configs.find(({ name }) => name === 'team_dev')
    ?? configs.find(({ name }) => name.startsWith('team_'))
    ?? configs[0]
  const dropped = { ...first.config }
  delete dropped.agentOptions
  try {
    const got = await drive(dropped)
    const requested = got.requested
    const resolved = got.resolved
    const fellBack = requested === null || requested === undefined
      ? resolved?.model === CHILD_PARENT_ROUTE.model
      : requested.model === CHILD_PARENT_ROUTE.model || resolved?.model === CHILD_PARENT_ROUTE.model
    readings.knife = {
      row: first.name,
      removed: 'agentOptions',
      parent_model: CHILD_PARENT_ROUTE.model,
      requested, resolved,
      fell_back_to_parent: fellBack,
    }
    if (requested !== null && requested !== undefined) {
      push('CHILD-MODEL-KNIFE-NO-BITE', `刀切掉 ${first.name} 的 \`agentOptions\` 之后，插件仍然给子会话塞了 ${JSON.stringify(requested)}`
        + ' —— 说明这一格量的不是那一行配置（读数与配置无关 = 恒真）')
    } else if (!fellBack) {
      push('CHILD-MODEL-KNIFE-NO-BITE', `刀切掉 ${first.name} 的 \`agentOptions\` 之后，子会话没有回落到父路由 ${CHILD_PARENT_ROUTE.model}（实得 ${JSON.stringify(resolved)}）`
        + ' —— 这一格的"配置生效"读数说不清是谁给的')
    }
  } catch (err) {
    push('CHILD-MODEL-HARNESS', `刀那一臂跑不动（${err?.message ?? err}）—— 没有翻面读数，这一格不算量过`)
  }
  return { problems, readings }
}
