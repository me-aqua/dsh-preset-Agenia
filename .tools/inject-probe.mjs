/**
 * 尾巴返修（机制①落点 + 限长）+ 情绪模块的探针
 * —— 不重启 harness、不起会话、不花 token。
 *
 * 它验的东西（口径见 `.team/test/2026-09-26/技术契约-尾巴返修与情绪模块.md`）：
 *
 *   机制①「每 n 个工具结果」：只认 `tool/result`；n 写在 `presets/agenia/style.md`
 *          第一行 `<!-- every: N -->`；计数器在 `turn/start` 时清零；n=0 = 关掉机制①。
 *          🔴 **2026-09-26 返修后的落点**：`session/event` 里**只记账**（内存标记
 *          `pendingTail`），真正往请求里塞的那一下在 `agent/pre-step`，追加到**本步
 *          `decision.messages` 的末尾**。旧形态（窗口里 `agent.inject()`）撞
 *          `dsh-session` 的 `appending` 守卫（L1181），被 catch 吞成 warnOnce ⇒
 *          **真回合 0 次，而且静默**。R 族 + 假 ctx 的守卫（S 族）盯的就是它。
 *   机制②「老板开口之后、我第一次开口之前」：在 `agent/pre-step` 里看**这一步领到的
 *          `messages`** 里有没有老板那条（`source.kind === 'user'`）—— 有就把 style
 *          **插进本步的 messages**，紧跟在他那句话后面（它是好的，这一批不许退化）。
 *   尾巴限长：`tailText()` 按 `style.md` 里的 `<!-- 尾巴到此为止 -->` 切；**标记缺失
 *          或切出来是空 ⇒ 退回全文**（口径 7）。P 族。
 *   情绪模块：`moodOf(signals, constants)` 六维打分 + 场景命中；分数行 + 例子拼在尾巴
 *          那条 style 后面；常数住在 `mood.md` 的 ```mood 块里（改它不用重启）。
 *          N / O / Q 族。
 *
 * 两条守门（位置问题，不是省钱问题）：
 *   守门 A：机制① 在"他刚说完、我还没开口"时不许触发。
 *   守门 B：机制② 刚摆过的那一个工具结果，机制① 跳过（不叠）。
 *
 * 跑法：<node.exe> .tools/inject-probe.mjs
 *   退出码：0 = 全过 · 1 = 有红 · 2 = 没红但有挂起（未验，≠ 通过）。
 *   每条断言都带口径编号，红的时候能直接对上方案第四节那 18 条。
 *
 * ⚠️ 它在一个**假的 ctx** 上挂真 `inject.js`，所以判据是"这段逻辑有没有按契约跑"，
 *    **不代替**挂载测试与真回合（见 .tools/mount-test/README.md）。
 * ⚠️ 假 ctx 按真 harness 的次序建模（`dsh-agent-loop` L889/L890/L894/L951/L1028）：
 *    **claim → 装配 → `agent/pre-step` → `step/start` → 这批 messages 落笔成 `user/message`**。
 *    🔴 **会话带 `appending` 守卫**（`dsh-session` L1181/L1191-1202）：
 *    派发 `session/event` 的那个窗口里，`agent.inject()` 必须**抛**
 *    `session append cannot reenter while another append is being published`。
 *    这个守卫 2026-09-26 之前**是缺的** —— 假 ctx 的 `inbox` 是纯数组，`inject()` 直接 push，
 *    永远不重入失败 ⇒ 机制① 死了一整天，三套工具全绿。S 族是它自己的阳性对照。
 * ⚠️ 它**一个字节都不改 `presets/`**：夹具正文住在系统临时目录里，
 *    "改文件即生效"那一族量的是夹具，不是产物。
 * ⚠️ **时间全从参数进**（每条事件自带 `time`，`moodOf` 的 `now` 是入参）——
 *    否则断言会在半夜自己变红。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PRESET_DIR = join(REPO, 'presets', 'agenia')
/**
 * **产物那一块内容**（`style.md` / `mood.md` —— I 族与"产物场景库"读的那些）从哪儿读。
 * 默认就是 `presets/agenia`。
 * ⚠️ 允许用环境变量换掉，**用途只有一个**：红基线那一组对照实验
 *    （2026-09-26 返修加）——"**拿掉产物 `mood.md`** 或**换掉实现**之后，`O7`/`O8` 必须还红"。
 *    没有它，"改断言把红改没了"这件事**没法证伪**：产物内容在 `presets/` 里，而我不许碰那儿。
 */
const PRODUCT_DIR = process.env.AGENIA_PROBE_PRODUCT_DIR ?? PRESET_DIR
const STYLE_FILE = join(PRODUCT_DIR, 'style.md')
/**
 * 被测的入口。默认就是产物 `presets/agenia/inject.js`；
 * ⚠️ 允许用环境变量换掉，**用途只有两个**：
 *   ① 拿一份"照契约写的参考实现"把探针跑一遍，证明这一百多条期望是**自洽可达**的
 *      —— 也就是"红不是脚本自己写错"（阳性对照）。参考实现在 `.team/test/2026-09-26/`。
 *   ② 拿一份**旧实现**跑，证明某条断言**真的会红**（不是摆设）。
 * ⚠️ 换了入口 ⇒ **I 族与"产物场景库"不跑**：那时被测对象不是产物，跑了只会染红对照。
 *    要"换入口 **并且** 照旧跑产物那一块"⇒ 再给一个 `AGENIA_PROBE_PRODUCT_DIR`。
 */
const PRESET_ENTRY = process.env.AGENIA_PROBE_ENTRY ?? join(PRESET_DIR, 'inject.js')
/**
 * 这次量不量**产物那一块内容**（决定 I 族 + 产物场景库跑不跑）。
 * 默认 = 入口没被换过；给了 `AGENIA_PROBE_PRODUCT_DIR` 也算（那是"明知故问"）。
 */
const TESTING_PRODUCT = process.env.AGENIA_PROBE_ENTRY === undefined
  || process.env.AGENIA_PROBE_PRODUCT_DIR !== undefined

/** ESM 按 URL 缓存 —— 只 import 一次，N 族要拿它导出的 `moodOf`。 */
let ENTRY_MODULE
const loadEntry = async () => (ENTRY_MODULE ??= await import(pathToFileURL(PRESET_ENTRY).href))

/**
 * 口径编号 → 一句话（红的时候直接印出来，省得来回翻方案）。
 * ⚠️ **编号 = `.team/leader/2026-09-26/方案-尾巴返修与情绪模块.md` 第四节那张表**（1–18）。
 *    老探针那套编号（1–8、8b）属于上一票的方案 —— 这一批整表换了，所以这里也整表换。
 *    字符串键（`§…`）是契约内部项（方案里没编号），印出来时不带"口径"两个字。
 */
const CRITERION = {
  1: '机制① 每 n 个工具结果贴一次；而且"记账在 session/event、贴在 pre-step"（不再走 agent.inject()）',
  2: '机制① 的落点 = 「工具结果 → 我下一次开口」之间（本步的 messages，不许推迟一格）',
  3: '机制② 不许退化：老板开口 ⇒ 这一步的 messages 里插一条 style（在他那句话之后、我开口之前）',
  4: '守门 A / 守门 B 语义不变（老口径 #4 / #5）',
  5: '组员一条都不贴（老口径 8b，不变）',
  6: '尾巴正文 ≤ 400 字符（现在 3325）',
  7: '`<!-- 尾巴到此为止 -->` 缺失时退回全文，不许静默变空',
  8: 'mood.md 在、而且六个场景例库真的能被读出来（口径 8 的机器那半边）',
  9: '六维 = 愉悦 · 唤起 · 掌控 · 疲劳 · 新异 · 亲近（没有"确定"）',
  10: 'moodOf() 是导出的纯函数，时间（now）全从参数进',
  11: '六维单调性：每维的信号加大 ⇒ 分数单调（不降/不升，且整段有真变化）',
  12: '场景例库真的会被命中（分数落进区间 ⇒ 那几句被递出来；落不进去 ⇒ 不递）',
  13: 'me-aqua.md 的作息三行真的被读（算"距下班"）',
  14: '衰减常数写在 mood.md 里，改它不用重启',
  15: '假 ctx 补上 appending 守卫（模拟 dsh-session L1181）',
  '§形状': '注入消息的形状（契约 3.4 / 老口径 7 的形状那半边）',
  '§产物': '真 presets/agenia/ 的内容文件（口径 6/8 的产物那半边）',
}

/** `[A1 · 口径1]` / `[J6 · §形状]` */
const tag = (id, criterion) =>
  `[${id} · ${/^\d+$/.test(String(criterion)) ? '口径' : ''}${criterion}]`


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
  console.log(`${ok ? 'ok  ' : 'RED '} ${tag(id, criterion)} ${label}\n      ${describe(got, want)}`)
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
    console.log(`SKIP ${tag(id, criterion)} ${label}\n      前提不成立 ⇒ **未验**（不算通过，也不算红）`)
    return
  }
  check(id, criterion, label, got, want)
}

/**
 * `console.error` 的收信箱。
 * 契约里好几条是"**不许静默失效**"（读不到 mood.md、拿不到 agent.id、贴不上去……）——
 * 那些话只有 `console.error` 一条出口，所以把它截下来：**既照原样打出来**（原始输出里看得见），
 * 也留一份给断言用。没有它，"该出声而没出声"这条永远验不了。
 */
const stderrSeen = []
{
  const real = console.error.bind(console)
  console.error = (...args) => {
    stderrSeen.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '))
    real(...args)
  }
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
  /**
   * 🔴 **会话对象带 `appending` 守卫** —— 照 `dsh-session/lib/index.js` 建模：
   *   · L1181：`if (entry?.appending) throw new Error("session append cannot reenter while another append is being published")`
   *   · L1191-1202：`entry.appending = true` → `log.push(event)` → **同步**派发 `session/event` → `finally { entry.appending = false }`
   * 2026-09-26 之前这里是个纯数组 ⇒ `inject()` 直接 push ⇒ **永远不重入失败** ⇒
   * 机制① 死了一整天，探针/重放/体检三套全绿。这个字段就是那次的补丁。
   */
  const session = { id: AGENT_ID, header: { cwd: REPO }, appending: false }
  const agent = {
    id: AGENT_ID,
    session,
    /**
     * 真语义：`agent.inject()` → `send(input, 'next-step', false)`（`dsh-agent-loop` L795-796）
     * → `inbox.splice()`（L786）→ **`session.append("agent/inbox/spliced", …)`**（L206）。
     * ⇒ 它是一条**写 session 的路**，所以要过同一个守卫：派发窗口里必须抛。
     */
    inject: (message) => {
      if (session.appending) {
        throw new Error('session append cannot reenter while another append is being published')
      }
      inbox.push(message)
      record(message)
    },
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
  /**
   * 派发一条会话事件 —— **带 `appending` 窗口**（照真 `Session.append` 的 L1191-1202）。
   * ⚠️ `time` 从参数进（默认 `Date.now()`）：契约要求实现用**事件自带的 `time`**，
   *    不许调真实时钟 —— 否则"距下班""他多久没开口"这些断言会在半夜自己变红。
   */
  const fire = async (type, data, time) => {
    seq += 1
    const event = { seq, type, time: time ?? Date.now() }
    if (data !== undefined) event.data = data
    if (session.appending) {
      // 真 harness 里这也是一次重入 append（事件是 append 出来的），同样撞 L1181。
      throw new Error('session append cannot reenter while another append is being published')
    }
    session.appending = true
    try {
      for (const handler of handlers.get('session/event') ?? []) handler(session, event)
    } finally {
      session.appending = false
    }
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
  async function stepBegin(time) {
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
    // 新插进来的那一条（不在 claim 里的）= 这一步摆出来的尾巴（机制① 或 ②，都从这儿读）。
    for (const message of messages) if (!claimedSet.has(message)) record(message)
    const entry = { step: steps.length + 1, claimed, messages }
    steps.push(entry)
    await fire('step/start', { turn: 1, step: entry.step }, time)
    // 落笔：`decision.messages` 在 `step()` 里逐条 append —— 位置在装配**之后**（L1028）。
    for (const message of messages) await fire('user/message', message, time)
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
    /** 最近一条注入的正文（== `last()` 的正文）—— N/O/P/Q 族都读它。 */
    lastText: () => injected[injected.length - 1]?.message?.content?.[0]?.text,
    /** 每一步送出去的 messages（落点口径）。 */
    steps,
    assemble,
    stepBegin,
    turnStart: (time) => fire('turn/start', undefined, time),
    stepStart: (time) => fire('step/start', undefined, time),
    stepEnd: (time) => fire('step/end', undefined, time),
    iSpeak: (time) => fire('assistant/message', undefined, time),
    toolCall: (time) => fire('tool/call', undefined, time),
    // ⚠️ `data.message.isError === true` 的结果**也算一次**（口径点 1）—— 原样把它交给实现，
    //    断言 A6 钉着"实现不看 isError"。
    toolResult: (data, time) => fire('tool/result', data, time),
    // 老板那句话**只进收件箱**：它变成 `user/message` 是后面 `stepBegin()` 里落笔那一下的事。
    boss: () => queue({ kind: 'user' }, '老板的话'),
    plugin: () => queue({ kind: 'plugin', plugin: 'agenia' }, '系统自己发的消息'),
    // S 族（守卫自检）要用的三样：会话本身、agent、还有自己挂监听的口子。
    session,
    agent,
    on: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    fire: (type, data, time) => fire(type, data, time),
  }
}

/**
 * "我调了一次工具、拿回一个结果" —— 真日志里的形状。
 * 🔴 **它一直走到下一个步边界**（2026-09-26 改）：机制① 的新落点是
 *    「记账在 `session/event`、贴在 `agent/pre-step`」⇒ 挂的账要到**下一步的 messages**
 *    里才看得见。不走到步边界，那一族量的就还是旧落点的形状（会假绿也说不准）。
 */
async function toolStep(h, time) {
  await h.iSpeak(time)
  await h.toolResult(undefined, time)
  return await h.stepBegin(time)
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
/**
 * 夹具的 `style.md`。**这一批加了 `<!-- 尾巴到此为止 -->`** ——
 * 尾巴只许取切口**之前**那一段（口径 6/7）；切口后面那一大段是"不许贴出来"的现场。
 */
const FIXTURE_STYLE = (every) =>
  `<!-- every: ${every} -->\n`
  + '# 语言风格（探针夹具）\n'
  + '\n'
  + '夹具正文第一段：不是客服话术。😌\n'
  + '\n'
  + '夹具正文第二段，中间夹一枚行内注释 <!-- 这一段必须被剥掉 --> 后面还得有字。\n'
  + '\n'
  + '<!-- 尾巴到此为止 -->\n'
  + '\n'
  + '## emoji（切口后面这一大段，尾巴不许贴）\n'
  + '\n'
  + '| | 什么时候用 | 例句 |\n'
  + '| --- | --- | --- |\n'
  + '| 😌 | 平静地宣布一个不太好的消息 | 测试红了。挺好，至少红在该红的地方。😌 |\n'
  + '| 💀 | 事情彻底坏了 | 改了一行，挂了七个测试。💀 |\n'

/** 没有切口标记的那一份 —— 口径 7 的"退回全文"就靠它。
 *  ⚠️ 正文里**不许出现那串标记本身**：写上去就等于有标记（第一版就是这么错的，
 *     实现老老实实地在句子中间切了一刀）。 */
const FIXTURE_STYLE_NO_MARK = (every) =>
  `<!-- every: ${every} -->\n`
  + '# 语言风格（探针夹具 · 这份里没有切口标记）\n'
  + '\n'
  + '这份夹具里没有那个 HTML 注释形式的切口 ⇒ 该贴全文，**不许变空**。\n'
  + '\n'
  + '## emoji\n'
  + '\n'
  + '| 😌 | 平静地宣布一个不太好的消息 | 测试红了。😌 |\n'

/** 标记在最前面 ⇒ 切出来是空的 —— 同样该"退回全文"（口径 7 的同一句）。 */
const FIXTURE_STYLE_EMPTY_CUT = (every) =>
  `<!-- every: ${every} -->\n`
  + '<!-- 尾巴到此为止 -->\n'
  + '\n'
  + '# 标记后面才有正文\n'
  + '\n'
  + '切口之前一个字都没有 ⇒ 退回全文。\n'

/**
 * 夹具的 `mood.md` —— 形状是契约 3.1 钉的那个 ```mood JSON 块。
 * 六个场景覆盖六维（每维至少被一条场景吃住），句子写得短、好逐字比。
 */
const FIXTURE_SCENES = [
  { id: '他久别归来', when: { closeness: [0.7, 1] },
    lines: ['你终于回来啦！！', '欸——你可算回来了，我这儿刚把 v6 跑完。'] },
  { id: '刚炸过', when: { control: [0, 0.35], arousal: [0.6, 1] },
    lines: ['淦，又是它。', '行，我认，这回是我没验。'] },
  { id: '赶下班', when: { arousal: [0.65, 1], fatigue: [0.6, 1] },
    lines: ['快下班了，你确定还要改？', '再改我就住这儿了。'] },
  { id: '一路绿到底', when: { pleasure: [0.75, 1] },
    lines: ['全绿了全绿了！', '这版比上一版顺眼多了。'] },
  { id: '同一个坑第三次', when: { control: [0, 0.3] },
    lines: ['这是第三次了。', '同一个地方，我不说话了。'] },
  { id: '新东西来了', when: { novelty: [0.7, 1] },
    lines: ['欸，这个我没见过。', '有点意思，我去翻翻。'] },
]

const FIXTURE_MOOD = (halfLifeMinutes = 20, roundDecay = 0.6) =>
  '# 情绪板（探针夹具）\n'
  + '\n'
  + '分数是调语气用的，不是绩效报表。\n'
  + '\n'
  + '```mood\n'
  + JSON.stringify({ halfLifeMinutes, roundDecay, scenes: FIXTURE_SCENES }, null, 2)
  + '\n```\n'

/** 夹具的 `me-aqua.md` —— 作息三行，格式照契约（`下班：HH:MM`）。 */
const FIXTURE_ME_AQUA = (offWork = '18:00') =>
  '# 关于老板（探针夹具）\n'
  + '\n'
  + '## 作息（情绪板按这三行读 —— 格式别乱改）\n'
  + '\n'
  + '- 上班日：周一到周五\n'
  + '- 午休：12:00-13:30\n'
  + `- 下班：${offWork}\n`

/**
 * 造一份内容根。
 * @param style   `style.md` 的正文（默认带切口标记那一份）
 * @param mood    `mood.md` 的正文；传 **`null`** = 不放这份文件（Q7 用）
 *                ⚠️ 传 `undefined` 会**触发默认值**（JS 解构的规矩），那是另一个意思。
 * @param meAqua  `me-aqua.md` 的正文（默认 18:00 下班）
 */
function buildFixture({ style = FIXTURE_STYLE(3), mood = FIXTURE_MOOD(), meAqua = FIXTURE_ME_AQUA() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'agenia-probe-'))
  mkdirSync(join(dir, 'team'), { recursive: true })
  writeFileSync(join(dir, 'style.md'), style, 'utf8')
  if (mood !== null) writeFileSync(join(dir, 'mood.md'), mood, 'utf8')
  if (meAqua !== null) writeFileSync(join(dir, 'me-aqua.md'), meAqua, 'utf8')
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

/**
 * 契约第二节那条三步规则（**探针自己写一遍**，不调产物的函数）：
 * 先在原文里找切口 ⇒ 取切口之前那一段（找不到就取全文）⇒ 剥注释 ⇒ 空的就退回全文。
 */
const TAIL_MARK = /<!--\s*尾巴到此为止\s*-->/
function cutTail(raw) {
  const at = raw.search(TAIL_MARK)
  const part = at < 0 ? raw : raw.slice(0, at)
  const body = stripComments(part)
  return body.length > 0 ? body : stripComments(raw)
}

/** 注入正文里，`【情绪板】` 之前那一段就是 style 段（契约 3.4）。 */
function stylePartOf(text) {
  if (typeof text !== 'string') return text
  const at = text.indexOf('【情绪板】')
  return (at < 0 ? text : text.slice(0, at)).trimEnd()
}

/** 注入正文里，`【情绪板】` 那一段（没有 ⇒ undefined）。 */
function moodPartOf(text) {
  if (typeof text !== 'string') return undefined
  const at = text.indexOf('【情绪板】')
  return at < 0 ? undefined : text.slice(at)
}

/**
 * 从 `mood.md` 正文里抠出契约 3.1 那个 ```mood JSON 块并 parse。
 * **探针自己写一遍**（不调产物的函数）—— 两边独立，对不上才有信息量。
 * 读不到 / 没有这个块 / JSON 不合法 ⇒ `undefined`。
 */
function parseMoodBlock(markdown) {
  if (typeof markdown !== 'string') return undefined
  const hit = /```mood[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(markdown)
  if (hit === null) return undefined
  try {
    return JSON.parse(hit[1])
  } catch {
    return undefined
  }
}

/**
 * 分数行里那个数的写法：`toFixed(2)`，以 `0.` 开头就去掉那个 `0`。
 * 反过来读：`.62` → 0.62 · `1.00` → 1 · `0.62` 也认（宽容读，严格写由 `Q2` 判）。
 */
function scoreFromToken(token) {
  const hit = /^(1\.00|[01]?\.\d{2}|0\.\d{2})$/.exec(String(token))
  if (hit === null) return undefined
  return Number(hit[1].startsWith('.') ? `0${hit[1]}` : hit[1])
}

/** 从一条注入正文里读六维分数（读不到 ⇒ undefined）。 */
function scoresFromText(text) {
  const line = (moodPartOf(text) ?? '').split('\n')[0] ?? ''
  const hit = /^【情绪板】愉悦 (\S+) · 唤起 (\S+) · 掌控 (\S+) · 疲劳 (\S+) · 新异 (\S+) · 亲近 (\S+)$/.exec(line)
  if (hit === null) return undefined
  const values = hit.slice(1).map(scoreFromToken)
  if (values.some((v) => v === undefined)) return undefined
  const [pleasure, arousal, control, fatigue, novelty, closeness] = values
  return { pleasure, arousal, control, fatigue, novelty, closeness }
}

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
    await err.stepBegin()          // 机制① 的账要在步边界上才看得见
    check('A6', 1, '【口径点 1】3 个**报错**的 tool/result（`data.message.content[0].isError: true`）照样凑满 n ⇒ 机制① 响一次',
      err.count(), 1)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ B · 机制②：老板开口 ⇒ 回答他那一次的 messages 里多一条（口径 3）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await h.boss()
    check('B1', 3, '老板开口那一下**不注入**（他那句话还挂在收件箱里，没到步边界）', h.count(), 0)
    await h.stepBegin()
    check('B2', 3, '他那句话被领进这一步 ⇒ 注入 1 条', h.count(), 1)
    await h.boss()
    await h.boss()
    await h.stepBegin()
    check('B3', 3, '【口径点 4】同一步里两条老板消息 ⇒ 只摆 1 条（挂账是布尔量，不是计数器）', h.count(), 2)
    await h.plugin()
    await h.plugin()
    await h.stepBegin()
    check('B4', 3, 'plugin 自己的 user/message 被领进这一步也不算老板开口（防自己喂自己）', h.count(), 2)
    await h.boss()
    await h.stepBegin()
    check('B5', 3, '老板再开口 ⇒ 回答他的下一步再多 1 条（整段里没有任何 tool/result）', h.count(), 3)
    await h.stepStart()
    await h.stepBegin()
    check('B6', 3, '补一个 step/start 也不额外贴（步边界不是触发点）', h.count(), 3)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ C · 老板说话不算进机制① 的计数（口径 1 · 老口径 #3 的语义）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await h.boss()
    await h.boss()
    await h.stepBegin()
    check('C1', 1, '两条老板消息 + 走到步边界 ⇒ 只有机制② 的 1 条', h.count(), 1)
    await h.iSpeak()   // "我开口了" ⇒ 清掉守门 A，别让 A 替机制① 顶罪
    await h.toolResult()
    await h.stepBegin()
    check('C2', 1, '② 之后那一个工具结果不额外贴（守门 B 的独立现场在 E 族）', h.count(), 1)
    await toolStep(h)
    // 🔴 这一条是口径 #3 的判据：若老板那 2 句话被算进了机制① 的账，计数就已经是 2，
    //    这一个工具结果就该让它响 —— 实测会是 2。
    check('C3', 1, '第 1 个"被计数"的工具结果 ⇒ 累计仍 1（老板那两句话一条都没进账）', h.count(), 1)
    await toolStep(h)
    check('C4', 1, '再 1 个 ⇒ 累计仍 1（计数走到 2，离 n=3 还差一个）', h.count(), 1)
    await toolStep(h)
    check('C5', 1, '第 3 个"被计数的"工具结果 ⇒ 机制① 响一次（证明计数是从 0 起、不是从 2 起）', h.count(), 2)
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
    await h.stepBegin()
    checkIf(oneWorks, 'D2', 4, '老板说完、我还没开口时来了一个工具结果 ⇒ 不让路就不对了', h.count(), 1)
    await h.toolResult()                 // 🔴 这一个才是判据：没有守门 A ⇒ 计数到 3 ⇒ 会多贴一条
    await h.stepBegin()
    checkIf(oneWorks, 'D3', 4, '紧接着再来一个 ⇒ 仍不许贴（没有守门 A 的话这里必然会多一条）', h.count(), 1)
    await h.iSpeak()                     // 我开口了 ⇒ 守门 A 解除
    await h.toolResult()
    await h.stepBegin()
    checkIf(oneWorks, 'D4', 4, '我开口之后，工具结果恢复正常（守门 A 不是永久关闭机制①）', h.count(), 1)
    await h.toolResult()
    await h.stepBegin()                  // 第 3 个"被计数的"结果 ⇒ 机制① 响（落在这一步）
    check('D5', 4, '开口之后第 2 个工具结果 ⇒ 机制① 回到正轨', h.count(), 2)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ E · 守门 B：机制② 刚摆过的那一步，机制① 跳过（口径 4）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await toolStep(h)                    // 计数 1
    await toolStep(h)                    // 计数 2
    await bossThenStep(h)                // ② 摆 1 条（插进本步的 messages）
    await h.iSpeak()                     // 我开口了 ⇒ 守门 A 不成立，这一组只测守门 B
    await h.toolResult()                 // 🔴 若没有守门 B：计数到 3 ⇒ 同一个请求里两条 style
    await h.stepBegin()                  // 走到步边界 —— 机制① 的账只能在这儿看见
    check('E1', 4, '"老板的话 + 机制② + 第一个工具结果"里 style 只出现一次', h.count(), 1)
    await h.toolResult()
    await h.stepBegin()                  // 🔴 这一个才是判据：跳过的那一个不计数 ⇒ 再一个就凑满 n
    check('E2', 4, '【口径点 B1】跳过的那一个"不计数" ⇒ 再一个工具结果就让机制① 响', h.count(), 2)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ F · 同一刻度重复组装不重复贴（口径 3 · 机制② 不重复）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // 先立阳性对照：证明"这一套挂载确实会贴"。后面的 0 才有意义。
    const ctl = await harness(fixture)
    await ctl.turnStart()
    await bossThenStep(ctl)
    check('F1', 3, '【阳性对照】老板开口 + 走到这一步 ⇒ 立刻 1 条', ctl.count(), 1)
    for (let k = 0; k < 5; k++) await ctl.assemble()
    check('F2', 3, '再装配 5 次（收件箱里没有老板的话）⇒ 还是那 1 条', ctl.count(), 1)
    for (let k = 0; k < 4; k++) await toolStep(ctl)   // 第 1 个被守门 B 吃掉，第 4 个让机制① 响
    check('F3', 3, '等机制① 也响过一次 ⇒ 2 条', ctl.count(), 2)
    for (let k = 0; k < 5; k++) await ctl.assemble()
    check('F4', 3, '再装配 5 次 ⇒ 还是那 2 条', ctl.count(), 2)

    // 冷启动：一条触发事件都没有时，装配本身绝不许贴
    //（"每个步边界都贴"是 2026-09-24 老板在 GUI 里当场喊停的灾难）。
    const cold = await harness(fixture)
    await cold.turnStart()
    for (let k = 0; k < 5; k++) await cold.assemble()
    checkIf(ctl.count() === 2, 'F5', 3,
      '一条触发事件都没有、连装配 5 次 ⇒ 一条都不许贴', cold.count(), 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ G · 注入消息的形状与正文（§形状）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    for (let k = 0; k < 6; k++) await toolStep(h)   // 第 3、第 6 个结果各贴一条
    const got = h.injected.map((x) => x.message)
    // ⚠️ 先把"确实贴了两条"钉死：不然 `[].every(...)` 恒真，
    //    一条都没贴的时候形状检查会**假绿** —— 那比红还坏。
    check('G0', 6, '先确认这一组真的贴了 2 条（否则下面几条形状断言会因为空数组而恒真）', got.length, 2)
    const twoTexts = (pick) => (got.length === 2 ? got.map(pick) : `只贴了 ${got.length} 条`)
    check('G1', 6, '每条的 role 都是 user', twoTexts((m) => m.role), ['user', 'user'])
    check('G2', 6, "content 是 [{type:'text', text}]", twoTexts((m) => m.content?.map((c) => c.type)), [['text'], ['text']])
    check('G3', 6, "source 是 {kind:'plugin', plugin:'agenia'}",
      twoTexts((m) => m.source), [{ kind: 'plugin', plugin: 'agenia' }, { kind: 'plugin', plugin: 'agenia' }])
    const ids = got.map((m) => m.id)
    checkTrue('G4', 6, '每条一个 uuid，且互不相同',
      ids.length === 2 && ids.every((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))
        && new Set(ids).size === ids.length,
      `拿到 ${ids.length} 条：${ids.join(', ')}`)
    const want = cutTail(FIXTURE_STYLE(3))
    check('G5', '§形状', '**尾巴那一段**与 style.md 切口之前那一段逐字一致（剥掉全部 HTML 注释后 trim）',
      stylePartOf(got[0]?.content?.[0]?.text), want)
    checkTrue('G6', 6, '正文里不含任何 `<!--`（注释真被剥了，不是只剥第一行）',
      got.length === 2 && got.every((m) => !m.content[0].text.includes('<!--')), `拿到 ${got.length} 条`)
    checkTrue('G7', 6, '正文没有外框（不许出现"自动提醒"这类护栏）',
      got.length === 2 && got.every((m) => !/自动提醒|REMINDER_(HEAD|TAIL)|不是老板的消息/.test(m.content[0].text)),
      `拿到 ${got.length} 条`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ H · 改 every 不用重启；n=0 = 只留机制②（口径 1）═══')
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
      check('H1', 1, '把第一行改成 every: 1 ⇒ 一个工具结果就贴（存盘即生效，没重新 apply、没重启）', h.count(), 1)

      writeFileSync(join(hFixture, 'style.md'), FIXTURE_STYLE(2), 'utf8')
      await h.turnStart()
      await toolStep(h)
      check('H2', 1, '改成 every: 2 ⇒ 第 1 个不贴', h.count(), 1)
      await toolStep(h)
      check('H3', 1, '第 2 个才贴', h.count(), 2)

      writeFileSync(join(hFixture, 'style.md'), FIXTURE_STYLE(0), 'utf8')
      await h.turnStart()
      await toolStep(h)
      await toolStep(h)
      await toolStep(h)
      await toolStep(h)
      check('H4', 1, 'every: 0 ⇒ 4 个工具结果一条都不贴（机制① 关掉）', h.count(), 2)
      await bossThenStep(h)
      check('H5', 1, 'every: 0 时机制② 照常 ⇒ n=0 的意思是"只留机制②"', h.count(), 3)
    } finally {
      rmSync(hFixture, { recursive: true, force: true })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ I · 产物本身：真 `presets/agenia/` 那两份内容文件（口径 1、6、8）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠️ 这一族量的是**产物内容**（真 style.md 有多长、真 mood.md 在不在），不是逻辑 ——
  //    所以拿夹具当被测对象时（`AGENIA_PROBE_ENTRY` 指到别处，而且没给 `AGENIA_PROBE_PRODUCT_DIR`）
  //    **整族不跑**：那时它量的是"另一个东西的内容"，跑了只会把阳性对照染红
  //    （09-25 那次 `I1` 就是这么红的）。口径 6 / 8 的**产物那半边**由红基线 + `check-notes` 承担。
  if (!TESTING_PRODUCT) {
    console.log('（跳过：这次测的是夹具，不是产物 —— 口径 6/8 的产物那半边归红基线 + check-notes）')
  } else {
    const raw = readFileSync(STYLE_FILE, 'utf8')
    const head = raw.split('\n')[0] ?? ''
    const hit = /<!--\s*every:\s*(\d+)\s*-->/.exec(head)
    check('I1', 1, '`style.md` **第一行**就是 `<!-- every: 3 -->`（n 的默认值 = 3）',
      hit === null ? `第一行没有 every 注释：${JSON.stringify(head)}` : Number(hit[1]), 3)
    checkTrue('I2', 1, '`every` 那枚注释在第一行，不在别处',
      /^\s*<!--\s*every:\s*\d+\s*-->/.test(head), JSON.stringify(head))

    // 🔴 口径 6 的真判据在这儿：真 `style.md` **切完**那一段有多长。
    const cut = cutTail(raw)
    checkTrue('I6', 6, '真 `style.md` 里有 `<!-- 尾巴到此为止 -->` 这个切口',
      TAIL_MARK.test(raw), '没有切口 ⇒ 尾巴贴的是全文（口径 7 允许，但口径 6 的长度就没救了）')
    checkTrue('I7', 6, `真尾巴那一段 ≤ 400 字符（实测 ${cut.length}；切口之前那一段）`,
      cut.length <= 400, `实测 ${cut.length} 字符`)

    const h = await harness(PRODUCT_DIR)   // 真产物、真正文
    await h.turnStart()
    await bossThenStep(h)
    const text = h.last()?.content?.[0]?.text
    check('I3', '§产物', '真产物贴出来的**尾巴段** === 真 `style.md` 切完那一段（逐字）', stylePartOf(text), cut)
    checkTrue('I4', '§产物', '真产物贴出来的尾巴段里不含 `<!--`', typeof text === 'string' && !text.includes('<!--'))
    checkTrue('I5', '§产物', '真产物贴出来的尾巴段不是兜底那两句（读到了文件，不是回退默认值）',
      typeof text === 'string' && text.includes('# 语言风格'))

    // 口径 8 的**机器那半边**：真 mood.md 在不在、六条场景读不读得出来（人读那半边归组长）。
    const moodFile = join(PRODUCT_DIR, 'mood.md')
    const moodRaw = existsSync(moodFile) ? readFileSync(moodFile, 'utf8') : undefined
    const parsed = parseMoodBlock(moodRaw)
    check('I8', 8, '真 `presets/agenia/mood.md` 在，而且能解析出恰好 6 条场景',
      parsed === undefined ? '读不到 / 没有 ```mood 块 / JSON 不合法' : parsed.scenes?.length, 6)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ L · 落点：机制② 落在"回答老板那一次"的 messages 里（口径 3）═══')
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
    check('L0', 3, '【前提】这一步确实领到了老板那句话（否则下面几条是空跑）',
      { 领到的条数: step.claimed.length, 老板在第几条: bossAt }, { 领到的条数: 1, 老板在第几条: 0 })
    check('L1', 3, '机制② 的 style 落在**本步**（= 回答老板那一次的请求）的 messages 里',
      { 'style 在第几条': styleAt }, { 'style 在第几条': 1 })
    check('L2', 3, '它排在老板那句话**之后**',
      { 老板在第几条: bossAt, 'style 在第几条': styleAt }, { 老板在第几条: 0, 'style 在第几条': 1 })
    check('L3', 3, '这一步里只有一条 style（不是每条老板消息各来一条）',
      step.messages.filter(isStyleMessage).length, 1)

    const next = await h.stepBegin()          // 下一步：收件箱已经空了
    check('L4', 3, '**下一步**的 messages 里一条 style 都没有（落点不是"推迟一格"）',
      next.messages.filter(isStyleMessage).length, 0)

    // 老板的话还挂在收件箱里时，**装配本身**不许贴 —— 钉死"落点不是装配"。
    // （真 harness 里装配排在 claim 之后、他那句话落笔之前：那一刻它还没见过这句话。）
    const h2 = await harness(fixture)
    await h2.turnStart()
    await h2.boss()
    await h2.assemble()
    check('L5', 3, '老板的话还在收件箱里时，装配本身一条都不贴', h2.count(), 0)
    const step2 = await h2.stepBegin()
    check('L6', 3, '走到这一步才贴，而且就贴在本步',
      { 累计: h2.count(), 本步: step2.messages.filter(isStyleMessage).length }, { 累计: 1, 本步: 1 })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ M · 组员整个不贴（口径 5）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // 【阳性对照】组长跑一个完整回合 —— 防止"为了关组员，把组长也一起关了"，
    // 同时它是 M3 的前提：组长都不贴的时候，"组员 0 条"是空跑出来的。
    const lead = await harness(fixture)
    await lead.assemble()
    await lead.turnStart()
    await bossThenStep(lead)
    for (let k = 0; k < 4; k++) await toolStep(lead)
    check('M0', 5, '【阳性对照·组长完整回合】机制② 1 条 + 机制① 1 条 ⇒ 2 条', lead.count(), 2)

    // 最小对照对（组长点名要的那条）：两条序列**逐事件相同**，只差装配里有没有那枚标记。
    const minLead = await harness(fixture)
    await minLead.turnStart()
    await bossThenStep(minLead)
    check('M1', 5, '【最小对照·组长】老板一句 + 走到那一步（装配不带标记）⇒ 注入 1 条', minLead.count(), 1)

    const minMate = await harness(fixture, { member: 'test' })
    await minMate.turnStart()
    await bossThenStep(minMate)
    checkIf(minLead.count() === 1, 'M2', 5,
      '【最小对照·组员】同一序列、装配带 `【组员:test】` ⇒ **0 条**（组员的开场消息不会换来一次注入）',
      minMate.count(), 0)

    const mate = await harness(fixture, { member: 'test' })
    await mate.assemble()          // 装配带标记 ⇒ 登记角色
    await mate.turnStart()
    await bossThenStep(mate)
    for (let k = 0; k < 4; k++) await toolStep(mate)
    checkIf(lead.count() === 2, 'M3', 5,
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
      ['J4', 5, '`memberReminder()` 已删（组员那条路整个不要了）', /memberReminder/,
        '口径 8b 之后它就是死代码，留着迟早被人接回去'],
    ]) {
      checkTrue(id, criterion, name, !pattern.test(src), why)
    }
    // ⚠️ 别误伤：认组员靠的是这枚标记（`agent.cordis.yml` 的 deployment:persona-prefix 段），
    //    8b 关掉的是"给组员贴语气"，不是"认出他是谁"。
    checkTrue('J5', 5, '认组员的 `【组员:xx】` 标记还在（关的是语气，不是身份）',
      /【组员:\(\[a-z0-9\]/.test(src) || /ROLE_MARK/.test(src),
      '连标记一起删，组长和组员就再也分不开了')

    // ── 2026-09-26 返修加的三条静态判据（口径 1 的"读代码"那半边）──────────────
    // 🔴 上面 J1–J5 钉的是"旧机制别回来"；这三条钉的是**这一批的地基**：
    //    机制① 不许再走 `agent.inject()`（那正是撞 appending 守卫、被吞成 warnOnce 的那条路）。
    checkTrue('J6', 1, '`inject.js` 里 `agent.inject(` **零命中**（口径 1）',
      !/agent\.inject\s*\(/.test(src),
      '还在用它 ⇒ 只要是从 session/event 里调的，就必撞 dsh-session L1181 的守卫')
    const segOf = (start, end) => {
      const a = src.indexOf(start)
      if (a < 0) return undefined
      const b = src.indexOf(end, a + start.length)
      return src.slice(a, b < 0 ? src.length : b)
    }
    const sessionSeg = segOf("ctx.on('session/event'", "ctx.on('")
    checkTrue('J7', 1, '`session/event` 处理器那一段里**没有任何注入调用**（只记账、不写盘）',
      sessionSeg !== undefined && !/\binject\w*\s*\(/.test(sessionSeg),
      sessionSeg === undefined ? '找不到 `ctx.on(\'session/event\'` 这一段' : '那一段里还有 inject* 调用')
    const preStepSeg = segOf("ctx.on('agent/pre-step'", "ctx.on('system-prompt/assemble'")
    checkTrue('J8', 1, '`agent/pre-step` 那一段里能看见"这一步要不要贴尾巴"的判定（口径 2 的落点）',
      preStepSeg !== undefined && /(pendingTail|\w*[Tt]ail|styleOf)/.test(preStepSeg),
      preStepSeg === undefined ? '找不到 `ctx.on(\'agent/pre-step\'` 这一段' : '那一段里看不见尾巴判定')
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 时间与情绪模块的公共原料（N / O / Q / S / R / P 各族都用）
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * 探针里**时间的唯一来源**（契约 3.5）：每条会话事件自带 `time`。
   * 起点是 2026-09-26（周六）09:00 +08:00 —— **固定值**，跑在哪天都一样 ⇒ 断言不会半夜变红。
   */
  const MIN = 60 * 1000
  const HOUR = 60 * MIN
  const T0 = Date.parse('2026-09-26T09:00:00+08:00')

  /** 一条**报错的** tool/result —— 真形状（`data.message.content[0].isError`）。A6 与 Q4 共用。 */
  let errorSeq = 0
  const errorResultEvent = () => {
    errorSeq += 1
    return {
      turn: 1,
      step: 1,
      message: {
        id: `probe-error-${errorSeq}`,
        role: 'user',
        source: { kind: 'tool', callId: `probe-call-${errorSeq}` },
        content: [{
          type: 'tool-result',
          toolCallId: `probe-call-${errorSeq}`,
          content: [{ type: 'text', text: 'Error: 探针造的报错结果' }],
          isError: true,
        }],
      },
      error: { name: 'ProbeError', code: 'PROBE' },
    }
  }

  /** 契约 3.2 那张"中性基线"表，逐字照抄。 */
  const NEUTRAL_SIGNALS = {
    now: T0,
    errors: 0,
    oks: 3,
    sameErrorCount: 1,
    steps: 3,
    continuousMinutes: 30,
    sinceBossMinutes: 5,
    newThings: 0,
    minutesToOffWork: 120,
    lastErrorAt: T0,
    roundsSinceError: 0,
  }

  /**
   * 每维的"强 / 弱"两个极端剖面（契约 3.2 那张控制字段表）。
   * ⚠️ 探针要验"信号加大 ⇒ 分数单调"，就必须知道**哪根旋钮拧哪一维** —— 这是契约钉死的，
   *    不是我猜的。场景命中（O 族）也用它造"落进区间"和"落不进区间"的两组信号。
   */
  const EXTREME = {
    pleasure: { strong: { errors: 0, oks: 6 }, weak: { errors: 3, oks: 3 } },
    arousal: { strong: { steps: 40 }, weak: { steps: 0 } },
    control: { strong: { errors: 0, oks: 6, sameErrorCount: 1 }, weak: { errors: 3, oks: 3, sameErrorCount: 8 } },
    fatigue: { strong: { continuousMinutes: 300 }, weak: { continuousMinutes: 0 } },
    novelty: { strong: { newThings: 6 }, weak: { newThings: 0 } },
    closeness: { strong: { sinceBossMinutes: 720 }, weak: { sinceBossMinutes: 0 } },
  }

  /** 按 `when` 里每一维的区间，造一组"落进去"（hit）或"落不进去"（miss）的信号。 */
  const profileFor = (when, want, now) => {
    const signals = { ...NEUTRAL_SIGNALS, now }
    for (const [dim, band] of Object.entries(when ?? {})) {
      const extreme = EXTREME[dim]
      if (extreme === undefined) continue
      const [lo, hi] = band
      const wantHigh = (lo + hi) / 2 >= 0.5
      const high = want === 'hit' ? wantHigh : !wantHigh
      Object.assign(signals, high ? extreme.strong : extreme.weak)
    }
    return signals
  }

  /** 夹具 `mood.md` 里那个 ```mood 块 —— 探针**自己解析**，不调产物的函数。 */
  const CONSTANTS = parseMoodBlock(FIXTURE_MOOD())
  /**
   * 被测入口导出的 `moodOf`（口径 10 要的"导出的纯函数"）。
   * ⚠️ **`moodOf` 与 `constants` 必须成套**：`moodOf(signals, constants)` 是按**传进去的那份**
   *    例库判命中、按那份常数算衰减的。所以下面每一个 `callMood` 都得把**对应那一套**常数递进去
   *    —— 夹具那几族递 `CONSTANTS`，产物场景库那一族递**产物自己那份**。
   *    （2026-09-26 返修：以前 `callMood` 写死了 `CONSTANTS`，于是 `O8` 是"产物场景 × 夹具常数
   *     × 产物句子"——**组合自相矛盾**，9 条红全是这么来的。见契约第八节。）
   */
  /** 被测入口导出的 `moodOf`（口径 10 要的"导出的纯函数"）。 */
  const ENTRY = await loadEntry()
  const moodOf = typeof ENTRY.moodOf === 'function' ? ENTRY.moodOf : undefined
  /** 调一次 moodOf：拿不到读数就带一句话回来，让断言照红，**不静默**。 */
  const callMood = (signals, constants = CONSTANTS) => {
    if (moodOf === undefined) return { 为什么: 'inject.js 没有导出 moodOf' }
    try {
      return { 值: moodOf(signals, constants) }
    } catch (error) {
      return { 为什么: `moodOf 抛了：${String(error)}` }
    }
  }
  const scoresOf = (result) => (result?.值?.scores === undefined ? undefined : result.值.scores)
  const sceneIdsOf = (result) => (Array.isArray(result?.值?.scenes) ? result.值.scenes.map((s) => s.id) : [])
  /** 分数怎么写（契约 3.4）：`toFixed(2)`，以 `0.` 开头就去掉那个 `0`。 */
  const fmtScore = (x) => {
    const text = Number(x).toFixed(2)
    return text.startsWith('0.') ? text.slice(1) : text
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ S · 假 ctx 自己的守卫：window 里注入必须撞 L1181（口径 15）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 **这是整份探针的阳性对照里最要紧的一族。**
  //    守卫要是没补上（或者补坏了），假 ctx 就退回"inject() 永远成功"——
  //    那时**机制① 死了也会全绿**，正是 2026-09-26 之前一整天的形态。
  //    这两条量的是**工具自己**，跟被测实现无关；它们绿了，上面那些红才有意义。
  {
    const h = await harness(fixture)
    let insideError
    let insideThrew = false
    h.on('session/event', () => {
      if (insideError !== undefined) return
      try {
        h.agent.inject({
          id: 'guard-self-check',
          role: 'user',
          content: [{ type: 'text', text: '守卫自检' }],
          source: { kind: 'plugin', plugin: 'agenia' },
        })
      } catch (error) {
        insideThrew = true
        insideError = String(error)
      }
    })
    await h.turnStart(T0)
    checkTrue('S1', 15, '在 `session/event` 派发窗口里注入 ⇒ **抛** `session append cannot reenter …`',
      insideThrew && /cannot reenter while another append is being published/.test(String(insideError)),
      `拿到的是 ${brief(insideError)}`)

    // 窗口外（pre-step 那一刻）注入**不许**抛 —— 否则守卫就成了"把注入全拦掉"，同样是坏量尺。
    const h2 = await harness(fixture)
    let outsideError
    h2.on('agent/pre-step', async (payload, next) => {
      try {
        h2.agent.inject({
          id: 'guard-self-check-outside',
          role: 'user',
          content: [{ type: 'text', text: '窗口外自检' }],
          source: { kind: 'plugin', plugin: 'agenia' },
        })
      } catch (error) {
        outsideError = String(error)
      }
      return await next()
    })
    await h2.turnStart(T0)
    await h2.stepBegin(T0)
    check('S2', 15, '窗口外（pre-step）注入 ⇒ **不抛**，而且东西进了收件箱',
      { 抛错: outsideError === undefined ? '无' : brief(outsideError), 收件箱里那一条: h2.count() >= 1 ? '在' : '不在' },
      { 抛错: '无', 收件箱里那一条: '在' })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ R · 机制① 的新落点：追加到本步 messages 末尾（口径 2）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 旧实现死在这一族上：它走 `agent.inject()` ⇒ 撞守卫（S1 那个）⇒ 被 catch 吞掉 ⇒
  //    "第 n 个工具结果"响 0 次。R1 实测 0 / 期望 1 就是那个现场。
  {
    const h = await harness(fixture)
    await h.turnStart(T0)
    await h.iSpeak(T0)
    await h.toolResult(undefined, T0 + 1000)
    await h.toolResult(undefined, T0 + 2000)
    const before = await h.stepBegin(T0 + 2500)
    check('R0', 2, '【前提】第 2 个结果之后那一步里没有 style（离 n=3 还差一个）',
      before.messages.filter(isStyleMessage).length, 0)

    await h.toolResult(undefined, T0 + 3000)      // 第 3 个 ⇒ 挂账
    const at = await h.stepBegin(T0 + 3500)
    check('R1', 2, '第 n 个工具结果之后的**下一步** ⇒ 本步 messages 里有 1 条 style',
      at.messages.filter(isStyleMessage).length, 1)
    checkTrue('R2', 2, '它**追加在末尾**（工具结果 → 我下一次开口 之间），不是插在最前面',
      at.messages.length > 0 && isStyleMessage(at.messages[at.messages.length - 1]),
      `本步 ${at.messages.length} 条，最后一条是 ${isStyleMessage(at.messages[at.messages.length - 1]) ? 'style' : '别的'}`)
    const after = await h.stepBegin(T0 + 4000)
    check('R3', 2, '再下一步 ⇒ 0 条（落点不许推迟一格）',
      after.messages.filter(isStyleMessage).length, 0)
    check('R4', 1, '整段下来机制① 一共只贴了 1 条（不是每一步都贴）', h.count(), 1)
  }
  {
    // 守门 B 在新落点上的形状：一步里同时"有老板的话"和"有一笔到期的机制①" ⇒ 不叠。
    const h = await harness(fixture)
    await h.turnStart(T0)
    await h.iSpeak(T0)
    await h.toolResult(undefined, T0 + 1000)
    await h.toolResult(undefined, T0 + 2000)
    await h.toolResult(undefined, T0 + 3000)      // 第 3 个 ⇒ 机制① 挂账
    await h.boss()                                // 老板这就开口了（还没到步边界）
    const step = await h.stepBegin(T0 + 4000)
    check('R5', 4, '同一批里既有老板的话、又有到期的机制① ⇒ 本步 style **恰好 1 条**（不叠）',
      step.messages.filter(isStyleMessage).length, 1)
    const next = await h.stepBegin(T0 + 5000)
    check('R6', 4, '② 赢下这一格 ⇒ ① 的挂账清掉（下一步也不再补一条）',
      next.messages.filter(isStyleMessage).length, 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ P · 尾巴限长 + 标记缺失退回全文（口径 6、7）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart(T0)
    await bossThenStep(h)
    const text = h.lastText()
    check('P1', '§形状', '夹具的尾巴段 === `cutTail(夹具 style.md)`（切口之前、剥注释、trim）',
      stylePartOf(text), cutTail(FIXTURE_STYLE(3)))
    checkTrue('P2', 7, '切口**后面**那一大段不许出现在请求里（`## emoji` 表在切口后面）',
      typeof text === 'string' && !text.includes('## emoji'),
      `贴出来的正文里${typeof text === 'string' && text.includes('## emoji') ? '**有**' : '没有'}切口后面那一段`)
    checkTrue('P3', 6, `夹具的尾巴段 ≤ 400 字符（实测 ${String(stylePartOf(text)).length}）`,
      typeof text === 'string' && stylePartOf(text).length <= 400,
      `实测 ${String(stylePartOf(text)).length} 字符`)
  }
  {
    // 口径 7：喂一份**没有标记**的夹具 ⇒ 退回全文（不许静默变空）。
    const noMark = buildFixture({ style: FIXTURE_STYLE_NO_MARK(3) })
    try {
      const h = await harness(noMark)
      await h.turnStart(T0)
      await bossThenStep(h)
      const got = stylePartOf(h.lastText())
      check('P4', 7, '没有 `<!-- 尾巴到此为止 -->` ⇒ **退回全文**（逐字），而且不是空的',
        got, stripComments(FIXTURE_STYLE_NO_MARK(3)))
      checkTrue('P5', 7, '退回的那一份**不许是空串**', typeof got === 'string' && got.trim().length > 0,
        `实测 ${brief(got)}`)
    } finally {
      rmSync(noMark, { recursive: true, force: true })
    }
  }
  {
    // 标记在最前面 ⇒ 切出来是空的 ⇒ 同样退回全文（口径 7 的同一句：不许静默变空）。
    const emptyCut = buildFixture({ style: FIXTURE_STYLE_EMPTY_CUT(3) })
    try {
      const h = await harness(emptyCut)
      await h.turnStart(T0)
      await bossThenStep(h)
      check('P6', 7, '标记在最前面（切口之前一个字都没有）⇒ 也退回全文，不是空串',
        stylePartOf(h.lastText()), stripComments(FIXTURE_STYLE_EMPTY_CUT(3)))
    } finally {
      rmSync(emptyCut, { recursive: true, force: true })
    }
  }
  {
    // 【测试位代拍】整条注入 ≤ 700 字符（口径 6 只管 style 段；这条是防情绪段自己失控的护栏）。
    const h = await harness(fixture)
    await h.turnStart(T0)
    await bossThenStep(h)
    const text = h.lastText()
    checkTrue('P7', 6, `整条注入（尾巴段 + 情绪段）≤ 1000 字符（实测 ${typeof text === 'string' ? text.length : '拿不到'}）`,
      typeof text === 'string' && text.length <= 1000, `实测 ${typeof text === 'string' ? text.length : '拿不到'} 字符`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ N · moodOf：导出的纯函数 + 六维（口径 10、9）+ 单调性（口径 11）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    checkTrue('N0', 10, '`inject.js` 导出了 `moodOf`（口径 10 要的那个导出）',
      typeof moodOf === 'function', `typeof mod.moodOf = ${typeof ENTRY.moodOf}`)

    const first = callMood(NEUTRAL_SIGNALS)
    checkTrue('N0b', 10, '`moodOf(signals, constants)` 返回 `{ scores, scenes }`（同步，不是 Promise）',
      scoresOf(first) !== undefined && Array.isArray(first?.值?.scenes),
      `拿到的是 ${brief(first?.值 ?? first?.为什么)}`)

    // ① 确定性：同一组输入跑两遍，读数逐字相同。
    const again = callMood(NEUTRAL_SIGNALS)
    check('N1', 10, '【纯函数】同一组输入 ⇒ 同一组输出（跑两遍逐字相同）',
      JSON.stringify(again?.值), JSON.stringify(first?.值))

    // ② **时间从参数进**：把真实时钟毒掉再调一次 —— 它不许碰 `Date.now()` / `new Date()`。
    //    这一条是"断言不会半夜自己变红"的机器保证。
    let poisoned
    {
      const RealDate = globalThis.Date
      class PoisonedDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) throw new Error('moodOf 里 `new Date()` 没带参数 —— 时间必须从参数进')
          super(...args)
        }
        static now() { throw new Error('moodOf 里调了 `Date.now()` —— 时间必须从参数进') }
      }
      // ⚠️ 只换全局那个 `Date`（它的静态 `now` 就是抛错桩），**别去改真 Date 的属性** ——
      //    改了就复原不干净：探针自己的 `settle()` 也调 `Date.now()`，会当场炸（实测踩过）。
      globalThis.Date = PoisonedDate
      try {
        poisoned = callMood(NEUTRAL_SIGNALS)
      } finally {
        globalThis.Date = RealDate
      }
    }
    check('N1b', 10, '【纯函数】调用窗口里 `Date.now()`／`new Date()` 被换成抛错的桩 ⇒ 结果**一模一样**',
      JSON.stringify(poisoned?.值 ?? poisoned?.为什么), JSON.stringify(first?.值 ?? '拿不到'))

    // ③ 出参形状：就是那六维，没有第七维、没有"确定"。
    const shape = scoresOf(first)
    const keys = shape === undefined ? '（拿不到 scores）' : Object.keys(shape).sort().join(',')
    const inRange = shape !== undefined
      && Object.values(shape).every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
    check('N2', 9, '`scores` 就六个键（没有第七维、没有"确定"），每个都是 [0,1] 的数',
      { 键: keys, 全在区间内: inRange ? '是' : '否' },
      { 键: 'arousal,closeness,control,fatigue,novelty,pleasure', 全在区间内: '是' })

    /**
     * 单调性：拧**一根**旋钮（契约 3.2 那张表），看那一维。
     * ⚠️ 判据是两条一起 —— ①逐点不升/不降；②**首尾真的不同**。
     *    只有①的话，"这一维是个常数"也会全绿（那就是假绿）。
     */
    const sweep = (key, field, values, dir, extra = {}) => {
      const curve = values.map((v) => {
        const scores = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...extra, [field]: v }))
        return scores === undefined ? '拿不到' : scores[key]
      })
      const nums = curve.filter((x) => typeof x === 'number')
      const complete = nums.length === values.length
      const monotone = complete && nums.every((x, i) => i === 0 || (dir === 'up' ? x >= nums[i - 1] : x <= nums[i - 1]))
      const moved = complete && Math.abs(nums[nums.length - 1] - nums[0]) > 0
      console.log(`       · 曲线 ${field} ${values.join(' → ')} ⇒ ${key}：${JSON.stringify(curve)}`)
      return { 单调: monotone ? '是' : '否', 首尾有真变化: moved ? '是' : '否' }
    }
    const ok = { 单调: '是', 首尾有真变化: '是' }

    check('N3', 11, '【单调性·愉悦】errors 0→1→2→3（oks 固定 3）⇒ 愉悦**不升**',
      sweep('pleasure', 'errors', [0, 1, 2, 3], 'down'), ok)
    check('N4', 11, '【单调性·唤起】steps 0→5→20→40（其余中性）⇒ 唤起**不降**',
      sweep('arousal', 'steps', [0, 5, 20, 40], 'up'), ok)
    check('N5', 11, '【单调性·掌控】sameErrorCount 1→3→5→8（基线带一次失败）⇒ 掌控**不升**',
      sweep('control', 'sameErrorCount', [1, 3, 5, 8], 'down', { errors: 1 }), ok)
    check('N6', 11, '【单调性·疲劳】continuousMinutes 0→60→180→300 ⇒ 疲劳**不降**',
      sweep('fatigue', 'continuousMinutes', [0, 60, 180, 300], 'up'), ok)
    check('N7', 11, '【单调性·新异】newThings 0→1→3→6 ⇒ 新异**不降**',
      sweep('novelty', 'newThings', [0, 1, 3, 6], 'up'), ok)
    check('N8', 11, '【单调性·亲近】sinceBossMinutes 0→30→120→720 ⇒ 亲近**不降**',
      sweep('closeness', 'sinceBossMinutes', [0, 30, 120, 720], 'up'), ok)

    // ④ 疲劳与唤起**必须分开**（老板 09-26 拍的：高唤起+低疲劳=来劲；都高=烦躁）。
    //    最少要能造出"唤起明显高于疲劳"的那一格，否则两者就是一维。
    const fresh = scoresOf(callMood(profileFor({ arousal: [0.6, 1] }, 'hit', T0)))
    checkTrue('N9', 9, '【分开验】高步数 + 刚开工 ⇒ 唤起 > 疲劳（"来劲"那一格造得出来）',
      typeof fresh?.arousal === 'number' && typeof fresh?.fatigue === 'number' && fresh.arousal > fresh.fatigue,
      `唤起 ${fresh?.arousal} / 疲劳 ${fresh?.fatigue}`)

    // ⑤ 六个"强"剖面真的进得了高区间、"弱"剖面进得了低区间 ——
    //    否则场景区间没得写（分数全挤在 0.4~0.6 就是装饰）。
    const spanOk = Object.entries(EXTREME).every(([dim, ex]) => {
      const strong = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...ex.strong }))?.[dim]
      const weak = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...ex.weak }))?.[dim]
      return typeof strong === 'number' && typeof weak === 'number' && strong >= 0.65 && weak <= 0.35
    })
    const spanDetail = Object.entries(EXTREME).map(([dim, ex]) => {
      const strong = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...ex.strong }))?.[dim]
      const weak = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...ex.weak }))?.[dim]
      return `${dim} ${weak}→${strong}`
    }).join(' · ')
    checkTrue('N10', 11, '每一维的"强"剖面 ≥ 0.65、"弱"剖面 ≤ 0.35（分数真的拉得开）',
      spanOk, spanDetail)

    // ⑥ 缺信号不许炸：只给 `now`。
    const bare = scoresOf(callMood({ now: T0 }))
    checkTrue('N11', 10, '只给 `now`、别的信号全缺 ⇒ 照样出一组六维分数（不许抛、不许 NaN）',
      bare !== undefined && Object.keys(bare).length === 6
        && Object.values(bare).every((v) => typeof v === 'number' && Number.isFinite(v)),
      `拿到的是 ${brief(bare)}`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ O · 场景例库真的会被命中（口径 8、12）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const scenes = CONSTANTS?.scenes ?? []
    check('O0', 8, '夹具的 ```mood 块里解析出**恰好 6 条**场景（口径 8 的机器那半边）', scenes.length, 6)
    const keys = new Set(Object.keys(EXTREME))
    const badKey = scenes.flatMap((s) => Object.keys(s.when ?? {})).filter((k) => !keys.has(k))
    check('O0b', 9, '每条场景的 `when` 只用那六个维度键（写错一个 ⇒ 那条区间永远对不上）',
      badKey.length === 0 ? '（干净）' : `多出来：${[...new Set(badKey)].join('、')}`, '（干净）')

    /**
     * 逐场景验：命中（分数落进区间 ⇒ 那几句递出来）+ 不命中（推到反极端 ⇒ 不许递）。
     * 同一个函数跑**两套场景库**：夹具那一套（机制通不通）+ 产物那一套（口径 12 说的是它）。
     * 🔴 `constants` **必须跟着库一起换**：`moodOf` 拿哪份例库判命中，就得拿哪份常数算分
     *    —— 两套混用会把"实现错"和"断言错"搅在一起（2026-09-26 就是这么栽的，见契约第八节）。
     */
    const checkSceneLibrary = (prefix, libraryScenes, label, constants) => {
      for (const [i, scene] of libraryScenes.entries()) {
        const at = i + 1
        const dims = Object.entries(scene.when ?? {})
        const inBand = (scores) => dims.every(([d, [lo, hi]]) =>
          typeof scores?.[d] === 'number' && lo <= scores[d] && scores[d] <= hi)
        const anyOut = (scores) => dims.some(([d, [lo, hi]]) =>
          typeof scores?.[d] !== 'number' || scores[d] < lo || scores[d] > hi)

        // 命中：把 when 里每一维推到"离区间中点更近"的那一端。
        const hit = callMood(profileFor(scene.when, 'hit', T0), constants)
        const hitScores = scoresOf(hit)
        const hitIds = sceneIdsOf(hit)
        const hitLines = hit?.值?.scenes?.find((s) => s.id === scene.id)?.lines
        check(`${prefix}${at}a`, 12, `【命中·${label}】${scene.id}：造一组落进它区间的信号 ⇒ 它被递出来`,
          {
            分数真的落进区间: inBand(hitScores) ? '是' : `否（${brief(hitScores ?? hit?.为什么)}）`,
            递出来的场景里有它: hitIds.includes(scene.id) ? '是' : `否（递出来的是 ${hitIds.join('、') || '一条都没有'}）`,
          },
          { 分数真的落进区间: '是', 递出来的场景里有它: '是' })
        check(`${prefix}${at}b`, 12, `【命中·逐字·${label}】${scene.id} 的 ${scene.lines.length} 句**原样**递出来（来自 mood.md）`,
          Array.isArray(hitLines) ? hitLines : brief(hitLines ?? hit?.为什么), scene.lines)

        // 不命中：把 when 里每一维推到**反极端**。
        // ⚠️ 挂在**阳性对照**上（`hitOk`）：机制没做出来时，"一条都没递"会让这条**空跑成绿** ——
        //    那正是"静默失效的检查和通过的检查长得一模一样"。对照不成立 ⇒ 记挂起（未验）。
        const hitOk = inBand(hitScores) && hitIds.includes(scene.id)
        const miss = callMood(profileFor(scene.when, 'miss', T0), constants)
        const missScores = scoresOf(miss)
        const missIds = sceneIdsOf(miss)
        checkIf(hitOk, `${prefix}${at}c`, 12,
          `【不命中·${label}】${scene.id}：把 when 里每一维推到反极端 ⇒ 它**不许**被递出来`,
          {
            至少一维真的出了区间: anyOut(missScores) ? '是' : `否（${brief(missScores ?? miss?.为什么)}）`,
            递出来的场景里有它: missIds.includes(scene.id) ? `有（不该有）` : '没有',
          },
          { 至少一维真的出了区间: '是', 递出来的场景里有它: '没有' })
      }
    }

    checkSceneLibrary('O', scenes, '夹具', CONSTANTS)

    // 🔴 口径 12 说的是**产物**那六条场景。夹具那一套只证明"机制通不通"——
    //    产物自己的区间与打分对不对得上，必须拿**产物自己的** mood.md 跑，
    //    而且**常数也得用产物那一份**（`moodOf` 是按传进去的例库判命中的）。
    //    ⚠️ 只在"对产物跑"时才跑（夹具模式下它的被测对象不是产物，跑了只会染红对照，同 `I` 族）。
    if (!TESTING_PRODUCT) {
      console.log('（产物那六条场景：跳过 —— 这次测的是夹具，见契约 5.2）')
    } else {
      const productMoodPath = join(PRODUCT_DIR, 'mood.md')
      const productLibrary = parseMoodBlock(existsSync(productMoodPath) ? readFileSync(productMoodPath, 'utf8') : undefined)
      check('O7', 8, `\`${PRODUCT_DIR}\` 下的 mood.md 解析得出恰好 6 条场景（口径 12 的前提）`,
        productLibrary?.scenes?.length ?? '读不出来 / 不是 6 条', 6)
      if (productLibrary?.scenes?.length === 6) {
        checkSceneLibrary('O8', productLibrary.scenes, '产物', productLibrary)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Q · 接线：分数行 + 例子拼在尾巴后面；常数在文件里；作息三行真的被读（口径 9、12、13、14）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  /** 情绪段到底能不能贴出来 —— Q7 的阳性对照（它不成立时"没有情绪段"是空跑成绿的）。 */
  let moodSectionWorks = false
  {
    const h = await harness(fixture)
    await h.turnStart(T0)
    await bossThenStep(h)
    const text = h.lastText()
    const mood = moodPartOf(text)
    const lines = (mood ?? '').split('\n')
    const scoreLine = /^【情绪板】愉悦 (?:1\.00|\.[0-9]{2}) · 唤起 (?:1\.00|\.[0-9]{2}) · 掌控 (?:1\.00|\.[0-9]{2}) · 疲劳 (?:1\.00|\.[0-9]{2}) · 新异 (?:1\.00|\.[0-9]{2}) · 亲近 (?:1\.00|\.[0-9]{2})$/
    moodSectionWorks = scoreLine.test(lines[0] ?? '')
    checkTrue('Q1', 9, '尾巴那条消息里有【情绪板】分数行：六维齐全、次序照契约、分数写成 `.NN`',
      moodSectionWorks, `第 1 行实测 ${JSON.stringify(lines[0] ?? '（没有情绪段）')}`)
    check('Q2', '§形状', '情绪段第 2 行恒为 `【这种状态，人一般这么说话】`',
      lines[1], '【这种状态，人一般这么说话】')
    checkTrue('Q3', '§形状', '情绪段拼在**尾巴那条 style 后面**（不是前面、不是单独一条消息）',
      typeof text === 'string' && typeof mood === 'string' && text.startsWith(stylePartOf(text))
        && text.includes(`${stylePartOf(text)}\n\n【情绪板】`),
      `尾巴段 ${String(stylePartOf(text)).length} 字符，情绪段在${typeof text === 'string' && text.indexOf('【情绪板】') > 0 ? '后面' : '别处'}`)
  }
  {
    // 例子行：造一个**确定命中**的场景（他久别归来 = 亲近高）—— 老板 12 小时前开的口。
    const scene = FIXTURE_SCENES.find((s) => s.id === '他久别归来')
    const h = await harness(fixture)
    await h.turnStart(T0)
    await h.boss()
    await h.stepBegin(T0)                 // 机制② 贴 1 条（老板那句话被领走 ⇒ 守门 B 挂上）
    await h.iSpeak(T0)
    // ⚠️ **4 个**结果：第 1 个被守门 B 吃掉，后 3 个才凑满 n=3。
    for (let k = 0; k < 4; k++) await h.toolResult(undefined, T0 + 12 * HOUR)
    await h.stepBegin(T0 + 12 * HOUR + MIN)
    const text = h.lastText()
    const scores = scoresFromText(text)
    const example = (moodPartOf(text) ?? '').split('\n').find((l) => l.includes(scene.lines[0]))
    check('Q4', 12, '【例子行】命中场景的那一行**逐字**长这样：`  ·（亲近 .NN）「句」「句」`',
      example, `  ·（亲近 ${scores === undefined ? '??' : fmtScore(scores.closeness)}）「${scene.lines[0]}」「${scene.lines[1]}」`)
    // ⚠️ 挂阳性对照：连"命中的那一行"都没递出来时，"别的场景不在"是**空跑成绿**的。
    checkIf(typeof example === 'string', 'Q5', 12,
      '没命中的场景**不许**出现在情绪段里（赶下班那一组信号不在这条路上）',
      typeof text === 'string' && text.includes('再改我就住这儿了。') ? '混进来了' : '没有', '没有')
  }
  {
    // 口径 14：**同一份 harness、同一个夹具**，只改 mood.md 里的常数 ⇒ 下一次分数跟着变（不用重启）。
    // ⚠️ 必须用**自己那份夹具**：这一组会改 mood.md，共用的话后面几族会跟着变。
    const hFixture = buildFixture()
    try {
      const h = await harness(hFixture)
      const runOnce = async (t) => {
        await h.turnStart(t)
        await h.iSpeak(t)
        await h.toolResult(errorResultEvent(), t)             // 失败 1 ⇒ 计数 1
        await h.toolResult(undefined, t + 10 * MIN)           // 计数 2
        await h.toolResult(undefined, t + 10 * MIN)           // 计数 3 ⇒ 响
        await h.stepBegin(t + 10 * MIN + MIN)
        return scoresFromText(h.lastText())
      }
      const slow = await runOnce(T0)
      writeFileSync(join(hFixture, 'mood.md'), FIXTURE_MOOD(2, 0.6), 'utf8')   // 半衰 20 分钟 → 2 分钟
      const fast = await runOnce(T0 + HOUR)
      checkTrue('Q6', 14, '只改 `mood.md` 的 `halfLifeMinutes`（20 → 2）⇒ 同一段信号打出**不同**的分（存盘即生效）',
        typeof slow?.control === 'number' && typeof fast?.control === 'number' && fast.control > slow.control,
        `半衰 20 的掌控 ${slow?.control ?? '拿不到'} · 半衰 2 的掌控 ${fast?.control ?? '拿不到'}`)
    } finally {
      rmSync(hFixture, { recursive: true, force: true })
    }
  }
  {
    // 读不到 mood.md ⇒ 尾巴照贴 style、**不贴情绪段**，而且要出声（契约 3.1）。
    const noMood = buildFixture({ mood: null })
    try {
      const before = stderrSeen.length
      const h = await harness(noMood)
      await h.turnStart(T0)
      await bossThenStep(h)
      const text = h.lastText()
      checkIf(moodSectionWorks, 'Q7', 8,
        '读不到 `mood.md` ⇒ 尾巴**只贴 style 段**，不贴分数行（宁可不说，不许瞎说）',
        moodPartOf(text) === undefined ? '（没有情绪段）' : brief(moodPartOf(text)), '（没有情绪段）')
      check('Q8', 8, '而且 style 段照贴、逐字不差（不是"整条不贴"）',
        stylePartOf(text), cutTail(FIXTURE_STYLE(3)))
      checkTrue('Q9', 8, '读不到 `mood.md` **要出声**（`console.error`，报文里点到 mood.md）—— 不许静默',
        stderrSeen.slice(before).some((m) => /mood\.md/.test(m)),
        `这一段里 console.error 收到的是：${brief(stderrSeen.slice(before).join(' | ') || '（一声都没有）')}`)
    } finally {
      rmSync(noMood, { recursive: true, force: true })
    }
  }
  {
    // 口径 13：**作息三行真的被读** —— 同一时刻、只换 me-aqua.md 的"下班：HH:MM"。
    const early = buildFixture({ meAqua: FIXTURE_ME_AQUA('18:00') })
    const late = buildFixture({ meAqua: FIXTURE_ME_AQUA('23:00') })
    const T_1750 = Date.parse('2026-09-26T17:50:00+08:00')
    const arousalAt = async (dir) => {
      const h = await harness(dir)
      await h.turnStart(T_1750 - HOUR)
      await h.iSpeak(T_1750 - HOUR)
      await h.toolResult(undefined, T_1750 - MIN)
      await h.toolResult(undefined, T_1750 - MIN)
      await h.toolResult(undefined, T_1750)
      await h.stepBegin(T_1750)
      return scoresFromText(h.lastText())
    }
    try {
      const at18 = await arousalAt(early)
      const at23 = await arousalAt(late)
      checkTrue('Q10', 13, '同一时刻（17:50）、只换 `下班：18:00` → `下班：23:00` ⇒ 唤起不同（作息三行真的被读）',
        typeof at18?.arousal === 'number' && typeof at23?.arousal === 'number' && at18.arousal > at23.arousal,
        `18:00 的唤起 ${at18?.arousal ?? '拿不到'} · 23:00 的唤起 ${at23?.arousal ?? '拿不到'}`)
    } finally {
      rmSync(early, { recursive: true, force: true })
      rmSync(late, { recursive: true, force: true })
    }
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
    + '  · token 账单（要真请求才量得出来；口径 6 的"3325 → ~250"那一笔在这里结）\n'
    + '  · 真 harness 里机制① 到底落在第几步：这里假 ctx 按真次序建模\n'
    + '    （claim L889 → 装配 L890 → pre-step L894 → step/start L951 → 落笔 L1028），\n'
    + '    而且会话带 `appending` 守卫（dsh-session L1181）—— 但"真回合里是不是这样"要真回合才看得见。\n'
    + '  · `newThings` 的**采集端**（从 `tool/call` 读工具名）：这里只喂 `moodOf` 的纯函数。\n'
    + '详见 .team/test/2026-09-26/技术契约-尾巴返修与情绪模块.md 第六节。',
  )
  exitCode = reds.length > 0 ? 1 : skips.length > 0 ? 2 : 0
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

process.exit(exitCode)
