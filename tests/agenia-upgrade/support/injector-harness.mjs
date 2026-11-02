/**
 * 任务 A 的**运行时载具**（第 4 关第二轮评审 **N-5** 的载体之一）。
 *
 * 为什么需要它：`PRS-02` / `PRS-04` 原来只钉**纯函数与静态面**（`identityVerdict` / 角色表的形状）。
 * 于是 2026-11-01 这一批新加的运行时规则 —— 窄权限的**执行者**（`narrowVerdict`）、角色工具集的
 * **执行者**（`roleToolVerdict` / `toolCatalogFor`）、角色人格**真的被注入**（`agenia:role-persona`）、
 * "只有 row 3 是组长侧"（`isMemberSide`）、共享记忆**按注入侧分流**（`memorySections(…, leaderSide)`）
 * —— 一条判据都没有：删掉 `narrowSessions.add(...)`、把门禁次序倒过来、把人格那一条 push 拿掉，
 * 102 条全绿、128 条体检全绿。实现岗的 flip 证据住在 `.team/dev/2026-11-01/_tools/`（git-ignored 的抽屉），
 * 那不是载体。这个模块把那份抽屉里的**量法**搬进 `tests/`，变成每次跑都会执行的东西。
 *
 * 量哪一层（写清口径，免得被读成"端到端"）：
 *   · **真的** `presets/agenia/inject.js`（不是重写一份实现），跑它自己的 `apply()`；
 *   · ctx 是假的（`get` / `on` / `effect` 三个口子，见 `makeCtx`）—— 平台的真实拓扑（每个预设一棵插件树、
 *     装配瀑布在 `dsh-system-prompt` 里）不在这一层，那一格归第 5 关的真挂载；
 *   · 内容根是**合成的**（`buildContentRoot`：把现役的 `.md` 拷进证据根，再写一份假快照 + 假常识 +
 *     假升级快照）—— **一个字节都不碰**真的 `presets/agenia/.runtime/`。
 *
 * 两把"表值刀"（`knifeReplace` + `importSourceCopy`）：
 *   · 刀打在**证据根里的副本**上，不碰 `presets/**`（同 `ANC-01` / `BRF-01` 的规矩：
 *     生产里那句存在之后，副本才是刀该落的地方 —— 生产文件一个字节不动，跑完就能比哈希）；
 *   · 每一刀都要求落点在源码里**恰好出现一次**（0 次 ⇒ 这一刀没有落点；2 次以上 ⇒ 切的是多处）。
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { cfg, parseComposition, plain } from './composition.mjs'
import { assertDeletable, ensureMarkedDir } from './root-guard.mjs'

/** 合成内容根里的长期记忆快照（四类各一条：够判"全条 / 只有索引"这一格）。 */
export const SYNTH_MEMORY = {
  // ⚠️ 版本号必须是 `v<n>`（注入器的 `MEMORY_VERSION_RE` 只认这一种；写成 `v-prs` ⇒ 指针被判非法、
  //    长期记忆整节不注入 —— 那是夹具错，不是被测物的读数）。文件名就是 `<version>.json`。
  version: 'v1',
  entries: [
    { id: 'g1', type: 'general', text: '底层通用第一条（索引可见；正文给不给，看受众）' },
    { id: 'b1', type: 'boss', text: '关于老板的那条正文 —— 只该给组长侧' },
    { id: 'm1', type: 'machine', text: '关于本机的那条正文 —— 只该给组长侧' },
    { id: 'p1', type: 'project', text: '关于某个项目的那条正文 —— 只该给组长侧' },
  ],
}
/** 合成常识的正文（判"组员侧拿到常识 / 组长侧不走快照"那一格用）。 */
export const SYNTH_COMMON_SENSE = '# 常识（合成夹具）\n\n- 夹具常识：只用来量"注不注入"。\n'
/** 假升级快照里的那个 session id —— 拿它开口的会话落在 row 0.5。 */
export const SYNTH_LEGACY_SESSION = 'prs-legacy-session'

/**
 * `withHarness({ scopeId: MISSING_ID })` ⇒ `context.scope` 上**没有 `id` 这个键**。
 * 为什么要一个哨兵、而不是 `scopeId: undefined`：`undefined` 在参数里读作"没给"（缺省 = 用 `id`），
 * 而"键不存在"与"给了个 `undefined`"在注入器里都读成 `undefined` —— 这里要的是**前一种形状**，
 * 免得将来有人拿 `'id' in scope` 做判据时，两个现场混成一个。
 */
export const MISSING_ID = Symbol('agenia-harness-missing-id')

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/**
 * 造一份**合成内容根**（只落在**运行根**里 —— 带 marker，删除前过 `assertDeletable`，契约 §2.5）。
 *
 * 拷什么：现役预设根下所有 `.md`（根 + `team/`）—— `leaderOrder` / `memberOrder` 里点的每一个 key
 * 都要有真文件，否则注入器自己的配置自检会报"找不到对应文件"，而那是**夹具**的问题，不是被测物的。
 * 不拷什么：`.runtime/`（那是真的共享记忆库；拷过来会把老板的画像带进测试证据里）。
 *
 * @param {{root: string, presetDir: string, runRoot: string}} input
 * @returns {{root: string, md_files: string[], snapshot: string, common_sense: string, legacy: string}}
 */
export function buildContentRoot({ root, presetDir, runRoot }) {
  if (typeof runRoot !== 'string' || runRoot.trim() === '') {
    throw new Error('buildContentRoot 必须给 runRoot —— 递归删除前的落点校验要用它（契约 §2.5）')
  }
  const runId = path.basename(runRoot)
  // 🔴 删除前：解析绝对路径 → 校验 marker → 校验在运行根之下（不进 `_evidence`、不碰真实根 / C 盘）。
  //    这一对调用既是规矩，也是 `ENV-02` 的 `DELETE-NO-MARKER` 那条静态判据要看见的落点。
  ensureMarkedDir(root, { runRoot, runId, kind: 'agenia-prs-harness-content' })
  const target = assertDeletable(root, { runRoot })
  rmSync(target, { recursive: true, force: true })
  ensureMarkedDir(root, { runRoot, runId, kind: 'agenia-prs-harness-content' })
  mkdirSync(path.join(root, 'team'), { recursive: true })
  mkdirSync(path.join(root, '.runtime', 'memory', 'snapshots'), { recursive: true })
  const mdFiles = []
  for (const name of readdirSync(presetDir)) {
    if (!name.endsWith('.md')) continue
    const from = path.join(presetDir, name)
    if (!statSync(from).isFile()) continue
    copyFileSync(from, path.join(root, name))
    mdFiles.push(name)
  }
  for (const name of readdirSync(path.join(presetDir, 'team'))) {
    if (!name.endsWith('.md')) continue
    copyFileSync(path.join(presetDir, 'team', name), path.join(root, 'team', name))
    mdFiles.push(`team/${name}`)
  }
  const runtime = path.join(root, '.runtime')
  const commonSense = path.join(runtime, 'common-sense.md')
  const pointer = path.join(runtime, 'memory', 'snapshots', 'current')
  const snapshot = path.join(runtime, 'memory', 'snapshots', `${SYNTH_MEMORY.version}.json`)
  const legacy = path.join(runtime, 'legacy-sessions.json')
  writeFileSync(commonSense, SYNTH_COMMON_SENSE, 'utf8')
  writeFileSync(pointer, `${SYNTH_MEMORY.version}\n`, 'utf8')
  writeFileSync(snapshot, `${JSON.stringify(SYNTH_MEMORY, null, 2)}\n`, 'utf8')
  writeFileSync(legacy, `${JSON.stringify({
    upgrade_at: '2026-11-01T00:00:00+08:00',
    session_ids: [SYNTH_LEGACY_SESSION],
  }, null, 2)}\n`, 'utf8')
  return { root, md_files: mdFiles.sort(), snapshot, common_sense: commonSense, legacy }
}

/**
 * 分一份模块进来：**内容哈希当 query**（同一份字节只加载一次；改过的副本一定是另一个 URL）。
 * @param {string} file
 */
export async function loadInjector(file) {
  if (!existsSyncFile(file)) return { ok: false, code: 'SUT-SURFACE-MISSING', why: `${file} 不在`, mod: null }
  const url = `${pathToFileURL(file).href}?sha=${sha256(readFileSync(file))}`
  try {
    return { ok: true, code: null, why: null, mod: await import(url), url }
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') {
      return { ok: false, code: 'SUT-SURFACE-MISSING', why: `它自己或它 import 的东西不在盘上：${err.message}`, mod: null }
    }
    return { ok: false, code: 'SUT-IMPORT-FAILED', why: String(err?.message ?? err), mod: null }
  }
}

const existsSyncFile = (file) => {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * 假 ctx（`apply()` 只碰这三个口子 + `on`）：
 *   · `get('systemPrompt')` —— 没有它 `apply()` 直接早退（什么都不注入）；
 *   · `get('agents')` —— 装配那一步按 agent id 认人；
 *   · `get('tools')` —— 门禁（`guard`）与工具注册（`register`）；
 *   · `on(event, handler)` —— 装配瀑布 / pre-step / session 事件 / 流。
 * `console.error` 由 `withHarness` 接管（注入器所有"出声"都走它），量完原样还回去。
 */
function makeCtx({ contentDir, state, logs }) {
  const handlers = new Map()
  let guardHandler
  const agentFor = () => ({ id: state.session.id, session: state.session })
  const ctx = {
    baseUrl: pathToFileURL(`${contentDir}${path.sep}`).href,
    get(name) {
      if (name === 'systemPrompt') return {}
      if (name === 'agents') return { get: () => agentFor() }
      if (name === 'tools') {
        return {
          guard: (handler) => {
            guardHandler = handler
            return () => {}
          },
          register: () => () => {},
        }
      }
      return undefined
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    effect(fn) {
      const off = fn()
      return typeof off === 'function' ? off : () => {}
    },
  }
  return { ctx, handlers, guard: () => guardHandler, logs }
}

/**
 * 跑一次 `apply()`，量完（**一定**）把 `console.error` 还回去。
 *
 * `messages`（可选）：这条会话的**消息列表**。委派桥在 `system-prompt/assemble` 里读子会话的
 * **第一条用户消息**（`firstUserPromptOf`）去给 claim 对号 —— 夹具不给它，那一条路就永远走不到
 * （2026-11-02 的并行派工那一格就是靠它量出来的）。不给 ⇒ 会话形状与从前一样（没有 `messages`）。
 *
 * `agentId` / `scopeId`（可选）：装配那一刻 `context.agent.id` / `context.scope.id` 各自是什么。
 * **不给 ⇒ 两个都等于 `id`**（与从前逐字相同的形状）。给它是为了量**两者分叉**的现场：
 * 注入器里 `agentId = context.scope.id`（`inject.js:3221`），而 `context.agent.id` 是另一个可取到的键
 * —— "`scope.id` 不是字符串时还钉不钉得住"这件事只有让它们分叉才量得到（`BMAP-01`）。
 * `scopeId` 给 `MISSING_ID` ⇒ `context.scope` 上**连 `id` 这个键都没有**（"缺失"与"给了个坏值"是两形）。
 * 量具自证：`contextSeen()` 回报**最近一次装配真的传进去**的那两个 id —— 没有它，
 * "传进去的确实是坏形状"就退回自报（`mig-test-05`）。
 *
 * @param {object} mod  `inject.js` 的模块
 * @param {{contentDir: string, config: object, header: object, id: string, catalog: object[], messages?: object[], quietMs?: number, agentId?: unknown, scopeId?: unknown}} input
 * @param {(h: {assemble: Function, guard: Function, logs: string[], newSession: Function, session: Function, contextSeen: Function}) => Promise<void>} fn
 */
export async function withHarness(mod, input, fn) {
  const logs = []
  const state = { session: { id: input.id, header: input.header, messages: input.messages } }
  /**
   * 装配那一刻交给注入器的两个 id（缺省都等于 `input.id`）。
   * `=== undefined` 才算"没给"：显式给 `null` / 数字 / 空串都是**要在现场出现的坏形状**。
   */
  const agentIdOf = () => (input.agentId === undefined ? state.session.id : input.agentId)
  const scopeIdOf = () => (input.scopeId === undefined ? agentIdOf() : input.scopeId)
  let contextSeen = null
  const sink = (line) => logs.push(String(line))
  const originalError = console.error
  console.error = (...args) => sink(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '))
  let built
  try {
    built = makeCtx({ contentDir: input.contentDir, state, logs })
    await mod.apply(built.ctx, input.config)
    // 注入器自己的配置自检是 fire-and-forget（`selfCheck().catch(...)`）—— 等它出完声再量，
    // 否则"这一次有没有报配置问题"会随调度顺序变。50ms 是实测够用的（量的是 console 输出，不是等盘）。
    await new Promise((resolve) => setTimeout(resolve, input.quietMs ?? 50))
    // ⚠️ `messages` 必须**跟着**过来：桥在装配时读它（并行派工靠它对号），丢了就量不到那一条路。
    state.session = { id: state.session.id, header: state.session.header, messages: state.session.messages, appending: false }
    const harness = {
      logs,
      /** 换一条会话（同一个注入器实例里的第二条会话 —— 量"一次性 / 按形状各一次"要用它）。 */
      newSession(next) {
        state.session = { id: next.id, header: next.header, messages: next.messages, appending: false }
        return harness
      },
      /**
       * 读回这条会话的**裸形状**（装配那一刻注入器看到的东西）。
       * 用途：夹具自证 —— "我喂进去的第一条用户消息真的交到注入器手里了吗"。
       * 没有它，`messages` 中途掉了会以"功能红"的样子出现（假红，`mig-test-05`）。
       */
      session() {
        return state.session
      },
      /** 装配那一刻真的交给注入器的两个 id（量具自证；没装配过 ⇒ `null`）。 */
      contextSeen() {
        return contextSeen
      },
      /** 走一次 `system-prompt/assemble` 瀑布；`sections` 缺省 = 空。 */
      async assemble(sections = []) {
        // ⚠️ `agent` 与 `scope` 是**两个对象**（不是从前那种同一个引用）：注入器两边都读
        //    （`context.agent.session` / `context.scope.session`），而不比引用 —— 量"两个 id 分叉"必须让它们分开。
        const session = state.session
        const agent = { id: agentIdOf(), session }
        // `MISSING_ID` ⇒ 连 `id` 这个键都不放到 `scope` 上（"缺失"那一形，与"给了个坏值"分开量）。
        const scope = input.scopeId === MISSING_ID ? { session } : { id: scopeIdOf(), session }
        contextSeen = {
          agent_id: agent.id,
          scope_id: scope.id,
          scope_has_id: Object.prototype.hasOwnProperty.call(scope, 'id'),
        }
        const assembly = {
          sections: Array.isArray(sections) ? [...sections] : [],
          contexts: [],
          tools: input.catalog.map((schema) => ({ ...schema })),
          variables: {},
        }
        let out = assembly
        for (const handler of built.handlers.get('system-prompt/assemble') ?? []) {
          out = await handler(out, { agent, scope }, async () => out)
        }
        return out
      },
      /** 调一次门禁（没有 `tools.guard` ⇒ 报出来，不许静默当成"放行"）。 */
      guard(call) {
        const handler = built.guard()
        if (typeof handler !== 'function') return { ok: false, why: '这个注入器没有注册 tools.guard（门禁没挂上）', reason: undefined }
        return { ok: true, why: null, reason: handler(call) }
      },
    }
    await fn(harness)
    return harness
  } finally {
    console.error = originalError
    if (built !== undefined) built.handlers.clear()
  }
}

/**
 * 从**组合本体**（`agent.cordis.yml`）读 `persona-injector` 那一行的 config —— 载具的入参不手抄。
 *
 * 为什么读它、不写死：`leaderOrder` / `memberOrder` 是"哪一侧拿到什么"的**事实来源**；
 * 写死一份的话，配置改了而载具不知道，量出来的就是另一件事（`mig-i16-staging-tree-01` 那一族）。
 * 读不到 ⇒ `ok:false`（载具缺输入 = 红，不许拿兜底名单顶上：`DEFAULT_LEADER_ORDER` 里没有 `style`，
 * 拿它量组长侧会假红）。
 *
 * @param {{ymlText: string, contentDir: string}} input
 */
export function configFromComposition({ ymlText, contentDir }) {
  const { rows } = parseComposition(String(ymlText), 'prs-harness-composition')
  const row = rows.find((item) => item.id === 'persona-injector')
  if (row === undefined) {
    return { ok: false, why: '组合里找不到 `- id: persona-injector` 那一行（载具的 config 没有来源）', config: null }
  }
  const leaderOrder = plain(cfg(row, 'leaderOrder'))
  const memberOrder = plain(cfg(row, 'memberOrder'))
  const officeBound = plain(cfg(row, 'officeBound'))
  const delegationTools = plain(cfg(row, 'delegationTools'))
  const problems = []
  if (!Array.isArray(leaderOrder)) problems.push('leaderOrder')
  if (!Array.isArray(memberOrder)) problems.push('memberOrder')
  if (!Array.isArray(officeBound)) problems.push('officeBound')
  if (delegationTools === null || typeof delegationTools !== 'object' || Array.isArray(delegationTools)) problems.push('delegationTools')
  if (problems.length > 0) {
    return { ok: false, why: `persona-injector 的 config 读不出这些键：${problems.join(' / ')}`, config: null }
  }
  return {
    ok: true,
    why: null,
    config: { contentDir, leaderOrder, memberOrder, officeBound, delegationTools },
  }
}

/**
 * 一份**合成工具目录**：`BASE_TOOL_SET` 的全部名字 + 两个框架自己的工具。
 * 为什么带框架工具：`roleToolVerdict` / `toolCatalogFor` 的口径是"只裁角色表里那些模型面向的工具，
 * 框架的（PTC 的 `run_code`、结构化输出之类）原样留着" —— 不把这两条放进来，就等于没量过 fail-open 那一侧。
 *
 * @param {string[]} baseToolSet `mod.BASE_TOOL_SET`
 * @param {string[]} extra 额外塞进去的框架工具名（缺省两个：一个认识的 `run_code`、一个不认识的 `framework_extra`）
 */
export function buildCatalog(baseToolSet, extra = ['run_code', 'framework_extra']) {
  return [...baseToolSet, ...extra].map((name) => ({ name, description: `合成 schema：${name}`, parameters: { type: 'object' } }))
}

/** 目录 / 白名单比较用：排序后的名字（顺序不参与判等，集合参与）。 */
export const namesOfCatalog = (catalog) => (Array.isArray(catalog) ? catalog.map((schema) => schema?.name) : []).sort()

/** 装配结果 → 名字清单（`contexts` 那一条；顺序有意义）。 */
export const injectedNames = (out) => (Array.isArray(out?.contexts) ? out.contexts.map((entry) => entry?.name) : [])
/** 装配结果 → 某一条 `contexts` 的正文（没有 ⇒ 空串）。 */
export const injectedText = (out, name) => {
  const hit = (out?.contexts ?? []).find((entry) => entry?.name === name)
  return typeof hit?.text === 'string' ? hit.text : ''
}
/** 装配结果 → `sections` 的名字清单（开工四步住在这里）。 */
export const sectionNames = (out) => (Array.isArray(out?.sections) ? out.sections.map((entry) => entry?.name) : [])
/** 装配结果 → 工具目录的名字清单。 */
export const catalogNames = (out) => (Array.isArray(out?.tools) ? out.tools.map((schema) => schema?.name) : [])

/**
 * 一把"表值刀"：把源码里的某一段**恰好一处**替换掉（0 处 / 多处 ⇒ 这一刀不成立，**不许**当成"刀咬了"）。
 *
 * @param {{source: string, find: string|RegExp, replace: string}} input
 * @returns {{ok: boolean, code: string|null, why: string|null, source: string|null}}
 */
export function knifeReplace({ source, find, replace }) {
  const text = String(source)
  const pattern = find instanceof RegExp ? find : new RegExp(escapeRe(find), 'g')
  const hits = text.match(pattern) ?? []
  if (hits.length === 0) {
    return { ok: false, code: 'KNIFE-LINE-MISSING', why: `落点没找到：${String(find)}`, source: null }
  }
  if (hits.length > 1) {
    return { ok: false, code: 'KNIFE-LINE-AMBIGUOUS', why: `落点出现 ${hits.length} 次（必须恰好 1 次）：${String(find)}`, source: null }
  }
  const out = text.replace(pattern, replace)
  if (out === text) {
    return { ok: false, code: 'KNIFE-NO-CUT', why: `替换没改动一个字节：${String(find)}`, source: null }
  }
  return { ok: true, code: null, why: null, source: out }
}

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 把一份（可能被刀切过的）`inject.js` 源码落成**证据根里的副本**再 import。
 * ⚠️ 副本的 `import.meta.url` 在证据根 ⇒ 它的两个懒加载（`./tools/*`、`./lib/*`）指不到；
 *    这一层量的是 `apply()` / 纯函数，**不触发**那两个懒加载（触发就会当场 import 失败、红因点名它）。
 *
 * @param {{dir: string, source: string, name?: string}} input
 */
export async function importSourceCopy({ dir, source, name = 'inject.knife.mjs' }) {
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  writeFileSync(file, source, 'utf8')
  return loadInjector(file)
}

/**
 * 门禁里那五条判定的**次序**（`CONTRACT-A` §7 / 实现岗 `gate4-A.md` §3 冻的次序）。
 *
 * 口径：这是**文件序代理** —— 它证明"源码里那五处调用按这个次序排"，不证明运行时真的这样跑
 * （真语义只有第 5 关真挂载能给；同一句解释在 `inject.js` 的 ③ 段注释里）。
 * 但它能抓住"把窄挪到角色工具集后面"这种把安全边界改松的改法 —— 而那正是 N-5 点名的静默失效。
 *
 * @param {string} source `inject.js` 的全文
 * @returns {{ok: boolean, order: string[], missing: string[], codes: string[]}}
 */
export function guardOrderOf(source) {
  const text = String(source)
  const start = text.indexOf("const tools = ctx.get('tools')")
  const end = text.indexOf('agenia：岗位写权限边界', start < 0 ? 0 : start)
  if (start < 0 || end < 0 || end < start) {
    return { ok: false, order: [], missing: ['guard-region'], codes: ['GUARD-REGION-MISSING'] }
  }
  const region = text.slice(start, end)
  const wanted = ['subagentBackgroundVerdict(', 'narrowVerdict(', 'roleToolVerdict(', 'proposalVerdict(', 'officeBoundVerdict(']
  const found = []
  const missing = []
  for (const needle of wanted) {
    const at = region.indexOf(needle)
    if (at < 0) missing.push(needle)
    else found.push({ needle, at })
  }
  found.sort((a, b) => a.at - b.at)
  const order = found.map((hit) => hit.needle.replace('(', ''))
  const codes = []
  if (missing.length > 0) codes.push('GUARD-CALL-MISSING')
  if (missing.length === 0 && order.join('>') !== wanted.map((n) => n.replace('(', '')).join('>')) codes.push('GUARD-ORDER-SWAPPED')
  return { ok: codes.length === 0, order, missing, codes }
}
