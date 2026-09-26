/**
 * 尾巴注入（inject.js 第 ⑤ 件事）的探针 —— 不重启 harness、不起会话、不花 token。
 *
 * 它验的是**两个机制**（2026-09-25 老板定的设计；组长拍的口径见
 * `.team/test/2026-09-25/技术契约-尾巴注入两个机制.md`）：
 *
 *   机制①「每 n 个工具结果」：只认 `tool/result`；n 写在 `presets/agenia/style.md`
 *          第一行 `<!-- every: N -->`；计数器在 `turn/start` 时清零；n=0 = 关掉机制①。
 *   机制②「老板开口之后、我第一次开口之前」：在 `agent/pre-step` 里看**这一步领到的
 *          `messages`** 里有没有老板那条（`source.kind === 'user'`）—— 有就把 style
 *          **插进本步的 messages**，紧跟在他那句话后面（2026-09-26 按源码次序定的落点：
 *          装配排在 `inbox.claim()` 之后、老板那句话落笔之前，装配里做的决定赶不上本次请求）。
 *
 * 两条守门（位置问题，不是省钱问题）：
 *   守门 A：机制① 在"他刚说完、我还没开口"时不许触发。
 *   守门 B：机制② 刚摆过的那一个工具结果，机制① 跳过（不叠）。
 *
 * 跑法：<node.exe> .tools/inject-probe.mjs
 *   退出码：0 = 全过 · 1 = 有红 · 2 = 没红但有挂起（未验，≠ 通过）。
 *   每条断言都带口径编号，红的时候能直接对上 `now.md` 的验收口径。
 *
 * ⚠️ 它在一个**假的 ctx** 上挂真 `inject.js`，所以判据是"这段逻辑有没有按契约跑"，
 *    **不代替**挂载测试与真回合（见 .tools/mount-test/README.md）。
 * ⚠️ 假 ctx 按真 harness 的次序建模（`dsh-agent-loop` L889/L890/L894/L951/L1028）：
 *    **claim → 装配 → `agent/pre-step` → `step/start` → 这批 messages 落笔成 `user/message`**。
 *    `agent.inject()` 进 next-step 收件箱、**下一次** claim 才被领走。
 *    ⇒ 「机制② 落在回答老板那一次请求里」这件事，**不用真回合就能红**（L 族）。
 * ⚠️ 它**一个字节都不改 `presets/`**：夹具正文住在系统临时目录里，
 *    "改文件即生效"那一族量的是夹具，不是产物。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PRESET_DIR = join(REPO, 'presets', 'agenia')
const STYLE_FILE = join(PRESET_DIR, 'style.md')
/**
 * 被测的入口。默认就是产物 `presets/agenia/inject.js`；
 * ⚠️ 允许用环境变量换掉，**只有一个用途**：拿一份"照契约写的参考实现"把探针跑一遍，
 *    证明这 50 来条期望是**自洽可达**的 —— 也就是"红不是脚本自己写错"。
 *    参考实现住在 `.team/test/2026-09-25/`，**不是产物、也不是给实现岗抄的**。
 */
const PRESET_ENTRY = process.env.AGENIA_PROBE_ENTRY ?? join(PRESET_DIR, 'inject.js')

/** 口径编号 → 一句话（红的时候直接印出来，省得来回翻 now.md）。 */
const CRITERION = {
  1: '机制①：每 n 个工具结果注入一次（n=3，写在 style.md 第一行）',
  2: '机制②：老板开口 ⇒ 这一步的 messages 里插一条 style（在他那句话之后、我开口之前）',
  3: '老板说话不算进机制① 的计数',
  4: '守门 A：机制① 在"他刚说完、我还没开口"时让路',
  5: '守门 B：机制② 刚摆过的那一步，机制① 跳过（不叠）',
  6: '同一个刻度（seq）重复组装不重复贴',
  7: '贴出去的是 style.md 正文（剥注释、不加外框）',
  8: '改 every 不用重启；n=0 = 只留机制②',
  '8b': '组员完全不需要语气：尾巴提醒对组员整个关掉（机制①② 都不生效）',
}

// ── 计数与打印 ────────────────────────────────────────────────────────────────
let passed = 0
const reds = []
const skips = []
/**
 * 读数怎么印。
 * ⚠️ 长的字符串不许原样打 —— style.md 正文 3000+ 字符，印出来日志就没法看了，
 *    而且"逐字比"真正有用的是**第一个不同的位置**，不是两坨正文。
 */
function brief(value) {
  const text = value === undefined ? 'undefined' : typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 240 ? `${text.slice(0, 240)}…（共 ${text.length} 字符，已截断）` : text
}
function describe(got, want) {
  const long = (typeof got === 'string' && got.length > 200) || (typeof want === 'string' && want.length > 200)
  if (long) {
    if (typeof got !== 'string' || typeof want !== 'string') return `实测 ${brief(got)} / 期望 ${brief(want)}`
    if (got === want) return `两个字符串逐字相同（${got.length} 字符）`
    let i = 0
    while (i < got.length && i < want.length && got[i] === want[i]) i++
    return `第 ${i} 个字符起不同：实测 ${JSON.stringify(got.slice(i, i + 40))} / 期望 ${JSON.stringify(want.slice(i, i + 40))}`
      + `（长度 ${got.length} vs ${want.length}）`
  }
  return `实测 ${brief(got)} / 期望 ${brief(want)}`
}
const check = (id, criterion, label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) passed++
  else reds.push({ id, criterion, label, got, want })
  console.log(`${ok ? 'ok  ' : 'RED '} [${id} · 口径${criterion}] ${label}\n      ${describe(got, want)}`)
}
const checkTrue = (id, criterion, label, cond, detail = '') =>
  check(id, criterion, label, cond ? '是' : `否${detail ? `（${detail}）` : ''}`, '是')
/**
 * 第三种状态：**挂起**。
 * 有些断言是"某个数为 0"（典型：组员整个不贴）。整套跑不起来的时候那个 0 **照样成立** ——
 * 绿得和达标一模一样，这就是"静默失效的检查"。所以先要一条**阳性对照**；
 * 对照不成立时这条记挂起（不算通过、也不算红），退出码 2。
 * 来历：这个仓库吃过一次亏 —— 一条"环境没准备好就必然红"的用例把 28 个变异体全报成"被抓"，
 * 扫描变成了空扫描。
 */
const checkIf = (premise, id, criterion, label, got, want) => {
  if (!premise) {
    skips.push({ id, criterion, label })
    console.log(`SKIP [${id} · 口径${criterion}] ${label}\n      前提不成立 ⇒ **未验**（不算通过，也不算红）`)
    return
  }
  check(id, criterion, label, got, want)
}

// ── 挂载假 ctx ────────────────────────────────────────────────────────────────
/**
 * 贴出来那条 style 长什么样（形状由契约第六节钉着）——
 * 假 ctx 用它认"这一条是尾巴提醒"，落点断言（L 族）也用它。
 */
const isStyleMessage = (m) => m?.source?.kind === 'plugin' && m?.source?.plugin === 'agenia'

/**
 * 让 inject.js 的 `apply()` 在一个假 ctx 上跑一遍。
 * 每次调用都是一份**全新的状态**（apply 里的 Map 都在闭包里），所以各测各的、互不串味。
 *
 * @param contentDir 内容根（夹具，或真的预设目录）
 * @param member     填了就是"这次是组员"：**只给一个信号** ——
 *                   装配用的 `sections` 里带 `【组员:<role>】`。
 *                   ⚠️ 故意**不**在会话头上塞 `parentSession` / `delegationDepth`：
 *                   组长拍下来的设计里，认人发生在装配那一刻（那里角色是现成的）；
 *                   多给一条路会掩盖"认人到底发生了没有"。
 */
async function harness(contentDir, { member } = {}) {
  const handlers = new Map()
  const injected = []
  const AGENT_ID = 'probe-agent'
  /**
   * **next-step 收件箱** —— 真 harness 里"老板那句话"和 `agent.inject()` 都先落在这里，
   * 到下一个 `agent/pre-step` 被 `inbox.claim()` **一次**领走（`dsh-agent-loop` L889）。
   *
   * 🔴 假 ctx 的模型就从这儿来，旧探针错在哪儿也在这儿：
   *    · 装配排在 claim **之后**（L889 在 L890 前面）；
   *    · 老板那句话的 `user/message` 要到 `step()` 里才落笔（L1028），比装配**晚**。
   *    ⇒ 装配那一刻，"这一步会不会带上老板那句话"是**看不见**的。
   *    旧探针让 `boss()` 直接发 `user/message` 事件、装配单独摆一次 —— 于是"装配里做决定"
   *    那条错落点看着是通的（还在 `assistant/message` 之前插装配点，正好差一格）。
   *    那是在**错的模型上全绿**（2026-09-26 评审打回的主因）。
   */
  const inbox = []
  /** 每一步实际会送出去的 messages —— 机制② 的落点就从这儿读。 */
  const steps = []
  const recorded = new Set()
  // ⚠️ 只按**身份**记，不按形状认：形状是契约钉的，形状对不上的时候该红的是 G 族，
  //    不该是"这条没被数进去"（自喂自那条 plugin 消息长得和 style 一模一样，按形状认会把它算成一次注入）。
  const record = (message) => {
    if (recorded.has(message)) return
    recorded.add(message)
    injected.push({ owner: AGENT_ID, message })
  }
  let queued = 0
  const agent = {
    id: AGENT_ID,
    session: { header: { cwd: REPO } },
    // 真语义（`agent.inject()` → `send(input, 'next-step', false)`）：进收件箱，
    // **下一次** pre-step 才被领走 —— 不是当场进本次请求。
    inject: (message) => { inbox.push(message); record(message) },
  }
  const ctx = {
    baseUrl: pathToFileURL(contentDir + sep).href,
    get(name) {
      if (name === 'systemPrompt') return {}
      if (name === 'agents') return { get: (want) => (want === AGENT_ID ? agent : undefined) }
      // 假的门禁：不给它 inject.js 就会往 stderr 喊"边界没生效"，那是噪声不是判据。
      if (name === 'tools') return { guard: () => () => {} }
      return undefined
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    effect(run) { run() },
  }

  // ⚠️ ESM 按 URL 缓存，所以这里**故意**只 import 一次；状态靠"重新 apply 一遍"重置。
  const mod = await import(pathToFileURL(PRESET_ENTRY).href)
  await mod.apply(ctx, { contentDir })

  const tick = () => new Promise((resolve) => setImmediate(resolve))
  /**
   * 等到"没有新注入"为止。
   * ⚠️ 为什么不能只等一轮微任务：实现里要用 `await readFile` 读 style.md（实测本机
   *    一次 readFile 最多要 ~100 轮 setImmediate 才落地）。也**不能用 setTimeout(0)**
   *    —— 本机实测 15.26 ms/次，光等待就把探针拖死。
   *     判据：连续 200 轮没有新注入 **且** 至少过去 3 ms。
   */
  async function settle() {
    const t0 = Date.now()
    let quiet = 0
    for (let i = 0; i < 400000; i++) {
      const before = injected.length
      await tick()
      quiet = injected.length === before ? quiet + 1 : 0
      if (quiet >= 200 && Date.now() - t0 >= 3) return
    }
  }

  let seq = 0
  const fire = async (type, data) => {
    seq += 1
    const event = { seq, type, time: Date.now() }
    if (data !== undefined) event.data = data
    for (const handler of handlers.get('session/event') ?? []) handler({ id: AGENT_ID }, event)
    await settle()
  }

  /**
   * 跑一次装配 —— 真 harness 里它排在 `inbox.claim()` **之后**、`agent/pre-step` **之前**
   * （L889 → L890）。角色登记就在这一步做完。
   */
  const assemble = async () => {
    seq += 1
    const assembly = {
      sections: [{ name: 'x', text: member === undefined ? '没有标记' : `【组员:${member}】` }],
      contexts: [],
      tools: [],
      variables: {},
    }
    for (const handler of handlers.get('system-prompt/assemble') ?? []) {
      await handler(assembly, { scope: { id: AGENT_ID } }, async () => assembly)
    }
    await settle()
  }

  /** 假 ctx 上的 `agent/pre-step` 瀑布：注册过的按注册顺序一层层包起来（和 Cordis 一样）。 */
  async function preStepWaterfall(payload) {
    const list = handlers.get('agent/pre-step') ?? []
    let next = async () => ({ kind: 'enter', messages: payload.messages })
    for (let i = list.length - 1; i >= 0; i--) {
      const handler = list[i]
      const inner = next
      next = () => handler(payload, inner)
    }
    return await next()
  }

  /**
   * 走完**一个步的开头**，次序照真 harness：
   *   `claim`（L889）→ 装配（L890）→ `agent/pre-step` 瀑布（L894）→ `step/start`（L951）
   *   → 这批 messages 逐条落笔成 `user/message`（L1028，排在装配**之后**）。
   * 返回 `{ step, claimed, messages }` —— `messages` 就是**这一步送出去的请求里会有哪些消息**，
   * 机制② 的落点只能从这里读。
   */
  async function stepBegin() {
    const claimed = inbox.splice(0, inbox.length)
    // 瀑布**之前**拍一张身份快照：实现要是就地改这个数组，这张也不受影响。
    const claimedSet = new Set(claimed)
    await assemble()
    const payload = {
      agent,
      messages: claimed,
      step: steps.length + 1,
      turn: 1,
      signal: { aborted: false, throwIfAborted() {} },
    }
    const decision = await preStepWaterfall(payload)
    const messages = decision?.kind === 'reject'
      ? []
      : (Array.isArray(decision?.messages) ? decision.messages : [])
    // 新插进来的那一条（不在 claim 里的）= 这一步摆出来的 style。
    for (const message of messages) if (!claimedSet.has(message)) record(message)
    const entry = { step: steps.length + 1, claimed, messages }
    steps.push(entry)
    await fire('step/start', { turn: 1, step: entry.step })
    // 落笔：`decision.messages` 在 `step()` 里逐条 append —— 位置在装配**之后**（L1028）。
    for (const message of messages) await fire('user/message', message)
    return entry
  }

  const queue = (source, text) => {
    queued += 1
    inbox.push({
      id: `probe-${queued}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source,
    })
  }

  return {
    injected,
    ctx,
    /** 累计贴了几条（机制①② 都算）—— 次数口径，和落点无关。 */
    count: () => injected.length,
    last: () => injected[injected.length - 1]?.message,
    /** 每一步送出去的 messages（落点口径）。 */
    steps,
    assemble,
    stepBegin,
    turnStart: () => fire('turn/start'),
    stepStart: () => fire('step/start'),
    stepEnd: () => fire('step/end'),
    iSpeak: () => fire('assistant/message'),
    toolCall: () => fire('tool/call'),
    // ⚠️ `data.message.isError === true` 的结果**也算一次**（口径点 1）—— 原样把它交给实现，
    //    断言 A6 钉着"实现不看 isError"。
    toolResult: (data) => fire('tool/result', data),
    // 老板那句话**只进收件箱**：它变成 `user/message` 是后面 `stepBegin()` 里落笔那一下的事。
    boss: () => queue({ kind: 'user' }, '老板的话'),
    plugin: () => queue({ kind: 'plugin', plugin: 'agenia' }, '系统自己发的消息'),
  }
}

/** "我调了一次工具、拿回一个结果"的完整步 —— 真日志里的形状。 */
async function toolStep(h) {
  await h.iSpeak()
  await h.toolResult()
}

/**
 * "老板说一句、我这边走到回答他的那一步" —— 真 harness 的形状：
 * 他那句话进收件箱 ⇒ 下一个步边界 `claim` 领走 ⇒ 装配 ⇒ `agent/pre-step`
 * ⇒ 这就定下了"回答他那一次的请求里有什么"。
 * ⚠️ 旧版本这里是 `boss()` + 单独一次 `assemble()` —— 那对应"装配里做决定"的错落点。
 */
async function bossThenStep(h) {
  await h.boss()
  return await h.stepBegin()
}

// ── 夹具：一份内容根，正文和频率都由探针自己说了算 ─────────────────────────────
const FIXTURE_STYLE = (every) =>
  `<!-- every: ${every} -->\n`
  + '# 语言风格（探针夹具）\n'
  + '\n'
  + '夹具正文第一段：不是客服话术。😌\n'
  + '\n'
  + '夹具正文第二段，中间夹一枚行内注释 <!-- 这一段必须被剥掉 --> 后面还得有字。\n'

function buildFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agenia-probe-'))
  mkdirSync(join(dir, 'team'), { recursive: true })
  writeFileSync(join(dir, 'style.md'), FIXTURE_STYLE(3), 'utf8')
  // 这几份只是为了别让 inject.js 的配置自检往 stderr 喊"找不到文件" —— 那是噪声。
  for (const f of ['leader.md', 'work-guidelines.md', 'persona.md']) {
    writeFileSync(join(dir, f), `# ${f}（探针夹具）\n`, 'utf8')
  }
  for (const role of ['design', 'dev', 'test', 'review', 'retro', 'hire']) {
    writeFileSync(join(dir, 'team', `${role}.md`), `# ${role}（探针夹具）\n`, 'utf8')
  }
  return dir
}

/** 契约里写的"剥注释"口径：删掉全部 HTML 注释（含跨行）再 trim。 */
const stripComments = (raw) => raw.replace(/<!--[\s\S]*?-->/g, '').trim()

const fixture = buildFixture()
let exitCode = 1

try {
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ A · 机制①：每 n 个工具结果注入一次（口径 1）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    const seen = [h.count()]
    for (let k = 0; k < 7; k++) {
      await toolStep(h)
      seen.push(h.count())
    }
    const names = ['起点', '第 1 个结果', '第 2 个结果', '第 3 个结果', '第 4 个结果', '第 5 个结果', '第 6 个结果', '第 7 个结果']
    check('A1', 1, '第 1 个 tool/result 之后不多贴', { [names[1]]: seen[1] }, { [names[1]]: 0 })
    check('A2', 1, '第 2 个 tool/result 之后不多贴', { [names[2]]: seen[2] }, { [names[2]]: 0 })
    check('A3', 1, '第 3 个 tool/result 之后多贴 1 条', { [names[3]]: seen[3] }, { [names[3]]: 1 })
    check('A4', 1, '计数是"每 n 个"而不是"从第 n 个起一路贴"：第 4、5 个不多贴',
      seen.slice(4, 6), [1, 1])
    check('A5', 1, '第 6 个 tool/result 再多贴 1 条', { [names[6]]: seen[6] }, { [names[6]]: 2 })
  }
  {
    // 🔴 **口径点 1：报错的工具结果也算一次**（组长 2026-09-25 拍：老板说的是"每 n 个工具结果"，
    //    没提成败；被拒的那次调用一样占上下文）。这条口径以前**一条断言都没有**
    //    —— 探针和重放里 `isError` 零命中，哪天有人顺手在计数前滤一下，没人会红。
    // ⚠️ 形状按真日志（`.team/dev/2026-09-26/_probe-log-shape.mjs` 量过 45269 条 `tool/result`）：
    //    `{ turn, step, message: { id, role:'user', source:{kind:'tool',callId},
    //      content: [{ type:'tool-result', toolCallId, content:[…], isError:true }] }, error?:{…} }`
    //    ⇒ 报错标记在 **`data.message.content[0].isError`**（45269 条里 979 条是真报错）。
    //    ⚠️ 顺带一条：工具结果的 `role` 也是 `'user'` —— 机制② 的判据**只能**认 `source.kind`，
    //       认 `role` 的话每个工具结果都会被读成"老板又开口了"。
    const errorResult = {
      turn: 1,
      step: 1,
      message: {
        id: 'probe-error-result',
        role: 'user',
        source: { kind: 'tool', callId: 'probe-call' },
        content: [{
          type: 'tool-result',
          toolCallId: 'probe-call',
          content: [{ type: 'text', text: 'Error: 探针造的报错结果' }],
          isError: true,
        }],
      },
      error: { name: 'ProbeError', code: 'PROBE' },
    }
    const err = await harness(fixture)
    await err.turnStart()
    await err.toolResult(errorResult)
    await err.toolResult(errorResult)
    await err.toolResult(errorResult)
    check('A6', 1, '【口径点 1】3 个**报错**的 tool/result（`data.message.content[0].isError: true`）照样凑满 n ⇒ 机制① 响一次',
      err.count(), 1)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ B · 机制②：老板开口 ⇒ 回答他那一次的 messages 里多一条（口径 2）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await h.boss()
    check('B1', 2, '老板开口那一下**不注入**（他那句话还挂在收件箱里，没到步边界）', h.count(), 0)
    await h.stepBegin()
    check('B2', 2, '他那句话被领进这一步 ⇒ 注入 1 条', h.count(), 1)
    await h.boss()
    await h.boss()
    await h.stepBegin()
    check('B3', 2, '【口径点 4】同一步里两条老板消息 ⇒ 只摆 1 条（挂账是布尔量，不是计数器）', h.count(), 2)
    await h.plugin()
    await h.plugin()
    await h.stepBegin()
    check('B4', 2, 'plugin 自己的 user/message 被领进这一步也不算老板开口（防自己喂自己）', h.count(), 2)
    await h.boss()
    await h.stepBegin()
    check('B5', 2, '老板再开口 ⇒ 回答他的下一步再多 1 条（整段里没有任何 tool/result）', h.count(), 3)
    await h.stepStart()
    await h.stepBegin()
    check('B6', 2, '补一个 step/start 也不额外贴（步边界不是触发点）', h.count(), 3)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ C · 老板说话不算进机制① 的计数（口径 3）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await h.boss()
    await h.boss()
    await h.stepBegin()
    check('C1', 3, '两条老板消息 + 走到步边界 ⇒ 只有机制② 的 1 条', h.count(), 1)
    await h.iSpeak()   // "我开口了" ⇒ 清掉守门 A，别让 A 替机制① 顶罪
    await h.toolResult()
    check('C2', 3, '② 之后那一个工具结果不额外贴（守门 B 的独立现场在 E 族）', h.count(), 1)
    await toolStep(h)
    // 🔴 这一条是口径 #3 的判据：若老板那 2 句话被算进了机制① 的账，计数就已经是 2，
    //    这一个工具结果就该让它响 —— 实测会是 2。
    check('C3', 3, '第 1 个"被计数"的工具结果 ⇒ 累计仍 1（老板那两句话一条都没进账）', h.count(), 1)
    await toolStep(h)
    check('C4', 3, '再 1 个 ⇒ 累计仍 1（计数走到 2，离 n=3 还差一个）', h.count(), 1)
    await toolStep(h)
    check('C5', 3, '第 3 个"被计数的"工具结果 ⇒ 机制① 响一次（证明计数是从 0 起、不是从 2 起）', h.count(), 2)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ D · 守门 A：他刚说完、我还没开口，机制① 让路（口径 4）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // 🔴 阳性控制：同一份夹具、同样的两个工具结果、**只是没有老板插进来** ⇒ 计数到 3 时必须响。
    //    没有它，下面 D2/D3/D4 那三条"不许贴"在"机制① 压根不存在"的实现上会**空跑成绿**
    //    （实测踩过：旧实现对这三条全绿，而它根本没有机制①）。
    const ctlD = await harness(fixture)
    await ctlD.turnStart()
    for (let k = 0; k < 3; k++) await toolStep(ctlD)
    const oneWorks = ctlD.count() === 1
    check('D0', 4, '【阳性控制】没有老板插进来时，第 3 个工具结果让机制① 响一次', ctlD.count(), 1)

    const h = await harness(fixture)
    await h.turnStart()
    await toolStep(h)                    // 计数 1
    await toolStep(h)                    // 计数 2 —— 再来一个就该响
    console.log('       · 前置：已经把机制① 的计数喂到 n-1 = 2（否则下面 D3 会因为"还没到 n"而假绿）')
    await bossThenStep(h)                // 回答他的那一步：② 插进本步 messages；老板在等，我还没开口
    check('D1', 4, '老板开口 + 走到这一步 ⇒ 1 条（② 的落点就是"那句话之后、我开口之前"）', h.count(), 1)
    await h.stepStart()                  // ⚠️ step/start 排在老板那句话**之前**（真日志 seq 767→768）
    await h.toolResult()                 // 守门 A 拦住；若没有 A，守门 B 也只会吃掉这一个
    checkIf(oneWorks, 'D2', 4, '老板说完、我还没开口时来了一个工具结果 ⇒ 不让路就不对了', h.count(), 1)
    await h.toolResult()                 // 🔴 这一个才是判据：没有守门 A ⇒ 计数到 3 ⇒ 会多贴一条
    checkIf(oneWorks, 'D3', 4, '紧接着再来一个 ⇒ 仍不许贴（没有守门 A 的话这里必然会多一条）', h.count(), 1)
    await h.iSpeak()                     // 我开口了 ⇒ 守门 A 解除
    await h.toolResult()
    checkIf(oneWorks, 'D4', 4, '我开口之后，工具结果恢复正常（守门 A 不是永久关闭机制①）', h.count(), 1)
    await h.toolResult()
    check('D5', 4, '开口之后第 2 个工具结果 ⇒ 机制① 回到正轨', h.count(), 2)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ E · 守门 B：机制② 刚摆过的那一步，机制① 跳过（口径 5）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await toolStep(h)                    // 计数 1
    await toolStep(h)                    // 计数 2
    await bossThenStep(h)                // ② 摆 1 条（插进本步的 messages）
    await h.iSpeak()                     // 我开口了 ⇒ 守门 A 不成立，这一组只测守门 B
    await h.toolResult()                 // 🔴 若没有守门 B：计数到 3 ⇒ 同一个请求里两条 style
    check('E1', 5, '"老板的话 + 机制② + 第一个工具结果"里 style 只出现一次', h.count(), 1)
    await h.toolResult()
    check('E2', 5, '【口径点 B1】跳过的那一个"不计数" ⇒ 再一个工具结果就让机制① 响', h.count(), 2)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ F · 同一刻度重复组装不重复贴（口径 6）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // 先立阳性对照：证明"这一套挂载确实会贴"。后面的 0 才有意义。
    const ctl = await harness(fixture)
    await ctl.turnStart()
    await bossThenStep(ctl)
    check('F1', 6, '【阳性对照】老板开口 + 走到这一步 ⇒ 立刻 1 条', ctl.count(), 1)
    for (let k = 0; k < 5; k++) await ctl.assemble()
    check('F2', 6, '再装配 5 次（收件箱里没有老板的话）⇒ 还是那 1 条', ctl.count(), 1)
    for (let k = 0; k < 4; k++) await toolStep(ctl)   // 第 1 个被守门 B 吃掉，第 4 个让机制① 响
    check('F3', 6, '等机制① 也响过一次 ⇒ 2 条', ctl.count(), 2)
    for (let k = 0; k < 5; k++) await ctl.assemble()
    check('F4', 6, '再装配 5 次 ⇒ 还是那 2 条', ctl.count(), 2)

    // 冷启动：一条触发事件都没有时，装配本身绝不许贴
    //（"每个步边界都贴"是 2026-09-24 老板在 GUI 里当场喊停的灾难）。
    const cold = await harness(fixture)
    await cold.turnStart()
    for (let k = 0; k < 5; k++) await cold.assemble()
    checkIf(ctl.count() === 2, 'F5', 6,
      '一条触发事件都没有、连装配 5 次 ⇒ 一条都不许贴', cold.count(), 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ G · 注入消息的形状与正文（口径 7）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    for (let k = 0; k < 6; k++) await toolStep(h)   // 第 3、第 6 个结果各贴一条
    const got = h.injected.map((x) => x.message)
    // ⚠️ 先把"确实贴了两条"钉死：不然 `[].every(...)` 恒真，
    //    一条都没贴的时候形状检查会**假绿** —— 那比红还坏。
    check('G0', 7, '先确认这一组真的贴了 2 条（否则下面几条形状断言会因为空数组而恒真）', got.length, 2)
    const twoTexts = (pick) => (got.length === 2 ? got.map(pick) : `只贴了 ${got.length} 条`)
    check('G1', 7, '每条的 role 都是 user', twoTexts((m) => m.role), ['user', 'user'])
    check('G2', 7, "content 是 [{type:'text', text}]", twoTexts((m) => m.content?.map((c) => c.type)), [['text'], ['text']])
    check('G3', 7, "source 是 {kind:'plugin', plugin:'agenia'}",
      twoTexts((m) => m.source), [{ kind: 'plugin', plugin: 'agenia' }, { kind: 'plugin', plugin: 'agenia' }])
    const ids = got.map((m) => m.id)
    checkTrue('G4', 7, '每条一个 uuid，且互不相同',
      ids.length === 2 && ids.every((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))
        && new Set(ids).size === ids.length,
      `拿到 ${ids.length} 条：${ids.join(', ')}`)
    const want = stripComments(FIXTURE_STYLE(3))
    check('G5', 7, '正文与 style.md 逐字一致（剥掉全部 HTML 注释后 trim）', got[0]?.content?.[0]?.text, want)
    checkTrue('G6', 7, '正文里不含任何 `<!--`（注释真被剥了，不是只剥第一行）',
      got.length === 2 && got.every((m) => !m.content[0].text.includes('<!--')), `拿到 ${got.length} 条`)
    checkTrue('G7', 7, '正文没有外框（不许出现"自动提醒"这类护栏）',
      got.length === 2 && got.every((m) => !/自动提醒|REMINDER_(HEAD|TAIL)|不是老板的消息/.test(m.content[0].text)),
      `拿到 ${got.length} 条`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ H · 改 every 不用重启；n=0 = 只留机制②（口径 8）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // ⚠️ 这一组会一直改夹具的 `style.md`，所以**必须用自己那份夹具** ——
    //    共用一份的话，它把 every 改成 0 之后，后面几组会跟着变成"机制① 全程关着"。
    //    （实测踩过：M0 报 1 而不是 2，看着像守门 A 写错了，其实是这一组留下的 `every: 0`。）
    const hFixture = buildFixture()
    try {
      const h = await harness(hFixture)   // 起点是 <!-- every: 3 -->
      writeFileSync(join(hFixture, 'style.md'), FIXTURE_STYLE(1), 'utf8')
      await h.turnStart()
      await toolStep(h)
      check('H1', 8, '把第一行改成 every: 1 ⇒ 一个工具结果就贴（存盘即生效，没重新 apply、没重启）', h.count(), 1)

      writeFileSync(join(hFixture, 'style.md'), FIXTURE_STYLE(2), 'utf8')
      await h.turnStart()
      await toolStep(h)
      check('H2', 8, '改成 every: 2 ⇒ 第 1 个不贴', h.count(), 1)
      await toolStep(h)
      check('H3', 8, '第 2 个才贴', h.count(), 2)

      writeFileSync(join(hFixture, 'style.md'), FIXTURE_STYLE(0), 'utf8')
      await h.turnStart()
      await toolStep(h)
      await toolStep(h)
      await toolStep(h)
      await toolStep(h)
      check('H4', 8, 'every: 0 ⇒ 4 个工具结果一条都不贴（机制① 关掉）', h.count(), 2)
      await bossThenStep(h)
      check('H5', 8, 'every: 0 时机制② 照常 ⇒ n=0 的意思是"只留机制②"', h.count(), 3)
    } finally {
      rmSync(hFixture, { recursive: true, force: true })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ I · 产物本身：真 `presets/agenia/style.md`（口径 1、7）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const raw = readFileSync(STYLE_FILE, 'utf8')
    const head = raw.split('\n')[0] ?? ''
    const hit = /<!--\s*every:\s*(\d+)\s*-->/.exec(head)
    check('I1', 1, '`style.md` **第一行**就是 `<!-- every: 3 -->`（n 的默认值 = 3）',
      hit === null ? `第一行没有 every 注释：${JSON.stringify(head)}` : Number(hit[1]), 3)
    checkTrue('I2', 1, '`every` 那枚注释在第一行，不在别处',
      /^\s*<!--\s*every:\s*\d+\s*-->/.test(head), JSON.stringify(head))

    const h = await harness(PRESET_DIR)   // 真产物、真正文
    await h.turnStart()
    await bossThenStep(h)
    const text = h.last()?.content?.[0]?.text
    check('I3', 7, '真产物贴出来的正文 === 真 `style.md` 剥注释后的正文（逐字）', text, stripComments(raw))
    checkTrue('I4', 7, '真产物贴出来的正文里不含 `<!--`', typeof text === 'string' && !text.includes('<!--'))
    checkTrue('I5', 7, '真产物贴出来的正文不是兜底那两句（读到了文件，不是回退默认值）',
      typeof text === 'string' && text.includes('# 语言风格'))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ L · 落点：机制② 落在"回答老板那一次"的 messages 里（口径 2）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 这一族是 2026-09-26 返修专门加的"能红的断言"。
  //    旧的假 ctx 里 `inject()` 只是被记一笔，装配点还插在 `assistant/message` **之前** ——
  //    于是"装配里 inject ⇒ 落到下一步"这个错落点**结构上量不出来**（56/56 全绿，而落点是错的）。
  //    现在次序照真 harness：老板那句话进收件箱 ⇒ 步边界 `claim` 领走 ⇒ 装配 ⇒ `agent/pre-step`
  //    ⇒ **这一步的 messages 定了稿**（`stepBegin()` 的返回值就是它）。
  //    ⇒ 把落点改回"装配里 inject / 落到下一步"，L1/L2/L3/L6 当场红。
  {
    const h = await harness(fixture)
    await h.turnStart()
    await h.boss()
    const step = await h.stepBegin()          // 这一趟 = "回答老板的那一次"
    const bossAt = step.messages.findIndex((m) => m?.source?.kind === 'user')
    const styleAt = step.messages.findIndex(isStyleMessage)
    check('L0', 2, '【前提】这一步确实领到了老板那句话（否则下面几条是空跑）',
      { 领到的条数: step.claimed.length, 老板在第几条: bossAt }, { 领到的条数: 1, 老板在第几条: 0 })
    check('L1', 2, '机制② 的 style 落在**本步**（= 回答老板那一次的请求）的 messages 里',
      { 'style 在第几条': styleAt }, { 'style 在第几条': 1 })
    check('L2', 2, '它排在老板那句话**之后**',
      { 老板在第几条: bossAt, 'style 在第几条': styleAt }, { 老板在第几条: 0, 'style 在第几条': 1 })
    check('L3', 2, '这一步里只有一条 style（不是每条老板消息各来一条）',
      step.messages.filter(isStyleMessage).length, 1)

    const next = await h.stepBegin()          // 下一步：收件箱已经空了
    check('L4', 2, '**下一步**的 messages 里一条 style 都没有（落点不是"推迟一格"）',
      next.messages.filter(isStyleMessage).length, 0)

    // 老板的话还挂在收件箱里时，**装配本身**不许贴 —— 钉死"落点不是装配"。
    // （真 harness 里装配排在 claim 之后、他那句话落笔之前：那一刻它还没见过这句话。）
    const h2 = await harness(fixture)
    await h2.turnStart()
    await h2.boss()
    await h2.assemble()
    check('L5', 2, '老板的话还在收件箱里时，装配本身一条都不贴', h2.count(), 0)
    const step2 = await h2.stepBegin()
    check('L6', 2, '走到这一步才贴，而且就贴在本步',
      { 累计: h2.count(), 本步: step2.messages.filter(isStyleMessage).length }, { 累计: 1, 本步: 1 })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ M · 组员整个不贴（口径 8b）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // 【阳性对照】组长跑一个完整回合 —— 防止"为了关组员，把组长也一起关了"，
    // 同时它是 M3 的前提：组长都不贴的时候，"组员 0 条"是空跑出来的。
    const lead = await harness(fixture)
    await lead.assemble()
    await lead.turnStart()
    await bossThenStep(lead)
    for (let k = 0; k < 4; k++) await toolStep(lead)
    check('M0', '8b', '【阳性对照·组长完整回合】机制② 1 条 + 机制① 1 条 ⇒ 2 条', lead.count(), 2)

    // 最小对照对（组长点名要的那条）：两条序列**逐事件相同**，只差装配里有没有那枚标记。
    const minLead = await harness(fixture)
    await minLead.turnStart()
    await bossThenStep(minLead)
    check('M1', '8b', '【最小对照·组长】老板一句 + 走到那一步（装配不带标记）⇒ 注入 1 条', minLead.count(), 1)

    const minMate = await harness(fixture, { member: 'test' })
    await minMate.turnStart()
    await bossThenStep(minMate)
    checkIf(minLead.count() === 1, 'M2', '8b',
      '【最小对照·组员】同一序列、装配带 `【组员:test】` ⇒ **0 条**（组员的开场消息不会换来一次注入）',
      minMate.count(), 0)

    const mate = await harness(fixture, { member: 'test' })
    await mate.assemble()          // 装配带标记 ⇒ 登记角色
    await mate.turnStart()
    await bossThenStep(mate)
    for (let k = 0; k < 4; k++) await toolStep(mate)
    checkIf(lead.count() === 2, 'M3', '8b',
      '【组员完整回合】机制① 和机制② 都不生效 ⇒ 0 条', mate.count(), 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ J · 静态形状：旧机制删干净了没有 ═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const src = readFileSync(PRESET_ENTRY, 'utf8')
    for (const [id, criterion, name, pattern, why] of [
      ['J1', 1, '`armed` 已删（被机制② 的 pre-step 落点取代）', /\barmed\b/,
        '旧口径"有真消息 ⇒ 下个组装必贴"是**落点看运气**的那一版，正是 09-24 出事的地方'],
      ['J2', 1, '`steps` / `lastRemindStep` 已删（"每 N 步"那套）', /\b(lastRemindStep|steps\s*=\s*new Map)\b/,
        '老板 09-25 定的是"每 n 个**工具结果**"，不是"每 n 步"'],
      ['J3', 1, '`REMINDER_EVERY_DEFAULT` 已删（默认改成 3 且从文件读）', /REMINDER_EVERY_DEFAULT/,
        '留着 8 就是两份来源，迟早对不上'],
      ['J4', '8b', '`memberReminder()` 已删（组员那条路整个不要了）', /memberReminder/,
        '口径 8b 之后它就是死代码，留着迟早被人接回去'],
    ]) {
      checkTrue(id, criterion, name, !pattern.test(src), why)
    }
    // ⚠️ 别误伤：认组员靠的是这枚标记（`agent.cordis.yml` 的 deployment:persona-prefix 段），
    //    8b 关掉的是"给组员贴语气"，不是"认出他是谁"。
    checkTrue('J5', '8b', '认组员的 `【组员:xx】` 标记还在（关的是语气，不是身份）',
      /【组员:\(\[a-z0-9\]/.test(src) || /ROLE_MARK/.test(src),
      '连标记一起删，组长和组员就再也分不开了')
  }

  // ── 收尾 ───────────────────────────────────────────────────────────────────
  const total = passed + reds.length + skips.length
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`${passed}/${total} 条通过`
    + (reds.length > 0 ? ` · ${reds.length} 条红` : '')
    + (skips.length > 0 ? ` · ${skips.length} 条挂起（前提不成立，**未验**）` : ''))
  if (reds.length > 0) {
    console.log('\n红的是「实现还没跟上契约」。逐条对上 `now.md` 的验收口径：')
    for (const r of reds) {
      console.log(`  · [${r.id} · 口径${r.criterion}] ${r.label}`)
      console.log(`      ${describe(r.got, r.want)}`)
      console.log(`      口径原文：${CRITERION[r.criterion]}`)
    }
  }
  if (skips.length > 0) {
    console.log('\n挂起的（**未验**，别读成通过）：')
    for (const s of skips) console.log(`  · [${s.id} · 口径${s.criterion}] ${s.label}`)
    console.log('  前提是阳性对照。对照绿了之后这几条会自己开始判。')
  }

  console.log(
    '\n退出码：0 = 全过 · 1 = 有红 · 2 = 没红但有挂起（未验，≠ 通过）\n'
    + '\n本探针**不验**这些（自动验不了，留给真回合 / 组长）：\n'
    + '  · GUI 里会不会被读成"老板又开了一次口"（2026-09-24 那个现场）\n'
    + '  · 改完 `inject.js` 要不要重启才生效（ESM 按 URL 缓存 —— 只有真重启才知道）\n'
    + '  · token 账单（要真请求才量得出来）\n'
    + '  · 机制① 走 `agent.inject()` 的落点：这里假 ctx 按真语义建模（进 next-step 队列、\n'
    + '    下一个 claim 领走），但"真 harness 里到底是不是这样"要真回合才看得见。\n'
    + '  · 机制② 的落点**已经在这里判了**（L 族）：老板那句话进收件箱 ⇒ 步边界 claim ⇒\n'
    + '    `agent/pre-step` 里插进本步的 messages。这条以前量不出来，是 2026-09-26 返修补的。\n'
    + '详见 .team/test/2026-09-25/技术契约-尾巴注入两个机制.md 第九节。',
  )
  exitCode = reds.length > 0 ? 1 : skips.length > 0 ? 2 : 0
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

process.exit(exitCode)
