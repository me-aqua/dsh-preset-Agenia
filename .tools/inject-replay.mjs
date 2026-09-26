/**
 * 尾巴注入的**重放工具** —— 拿真会话日志验节奏。
 *
 * 它回答一个问题：**把真会话的事件时间线喂给真 `inject.js`，"该摆几次"和"实际摆几次"对得上吗？**
 *
 * 为什么需要它：探针喂的是**我编的事件序列**，它能证明"逻辑按契约跑"，
 * 证明不了"真会话里那个节奏"。2026-09-24 那次事故的形态就是"参数是这样、表现不是"——
 * 读代码读不出来，只有在真时间线上跑一遍才现形。
 *
 * ── 怎么跑 ────────────────────────────────────────────────────────────────────
 *   <node.exe> .tools/inject-replay.mjs                 # 默认：活动最多的 5 个会话
 *   <node.exe> .tools/inject-replay.mjs --all           # 全扫（慢）
 *   <node.exe> .tools/inject-replay.mjs --limit 12
 *   <node.exe> .tools/inject-replay.mjs --session ed92f3fd
 *   <node.exe> .tools/inject-replay.mjs --trace ed92f3fd  # 逐次触发点（诊断用）
 *   <node.exe> .tools/inject-replay.mjs --self-test     # 只验本工具自己（不 import inject.js）
 *   退出码：0 = 全部对得上 / 1 = 有对不上的 / 2 = 工具自己出错
 *
 * ── 三件必须说清楚的事 ────────────────────────────────────────────────────────
 *  1. **真日志是分帧 zstd**：每帧一条 JSON，一帧一个 zstd 帧。Node 的流式解压只吃第一帧
 *     （实测 512627 B 的文件只出来 191 字符），所以这里自己走块边界切帧。
 *  2. **"该摆几次"来自契约的参考模型**（`.team/test/2026-09-25/技术契约-尾巴注入两个机制.md`
 *     第三节那段伪代码）。参考模型和 inject.js 是两份独立的东西，对不上才有信息量。
 *     参考模型自己用 `--self-test` 里的手算样例钉住。
 *  3. **只喂会话事件 + 一处推断出来的「一步的 claim 点」。** 契约把机制① 钉在事件上
 *     （`tool/result`），把机制② 钉在**这一步领到的 messages** 上（`agent/pre-step`）。
 *     claim 不是会话事件（它是 Cordis 钩子），日志里没有 —— 所以这条工具在**每个
 *     `step/start` 之前**插一个 claim 点，并把"这一步里出现的老板那几句"记在它上面。
 *     依据（`dsh-agent-loop` L889/L890/L894/L951/L1028，2026-09-26 按源码核过）：
 *     `inbox.claim()` → `system-prompt/assemble` → `agent/pre-step` → `step/start`
 *     → 这批 messages 落笔成 `user/message`。
 *     ⇒ **老板那句话出现在某一步的 `step/start` 之后**，而它是**这一步的 claim 领进来的**。
 *     契约 §2 第 4 条那组真 seq 就是这个形状：`step/start`(767) 在 `user/message`(768) 前面。
 *     ⚠️ claim 的确切时刻仍是**推断**（日志里没有这个事件）；形状有两处实测撑着（上面那条 +
 *     "每个 step 里恰好一条 `assistant/message`"）。**落点**由探针的 L 族判，不靠这条工具。
 *
 * ⚠️ 本工具只读日志、只 import 预设，**不写 `presets/` 下任何东西、不起会话、不花 token**。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PRESET_DIR = join(REPO, 'presets', 'agenia')
/**
 * 被测的入口。默认就是产物 `presets/agenia/inject.js`。
 * ⚠️ 允许用环境变量换掉，**用途只有一个**：拿"照契约写的参考实现"把这一套跑一遍，
 *    证明"该摆几次"这个参考模型和一份正确实现是对得上的（阳性对照）。
 *    参考实现在 `.team/test/2026-09-26/`，不是产物。
 */
const PRESET_ENTRY = process.env.AGENIA_REPLAY_ENTRY ?? join(PRESET_DIR, 'inject.js')
const STYLE_FILE = join(PRESET_DIR, 'style.md')

/**
 * 🔴 **假会话带 `appending` 守卫** —— 照 `dsh-session/lib/index.js` 建模：
 *   · L1181：`if (entry?.appending) throw new Error("session append cannot reenter while another append is being published")`
 *   · L1191-1202：`entry.appending = true` → `log.push(event)` → **同步**派发 `session/event` → `finally` 里清掉
 *   · `dsh-agent-loop` L795-796 `inject()` → L786 `send()` → L206 `inbox.splice()` → `session.append(...)`
 *     ⇒ **`agent.inject()` 也是一条写 session 的路**，派发窗口里调它必抛。
 *
 * 2026-09-26 之前这个字段是**缺的**：假 ctx 的 `inbox` 是纯数组、`inject()` 直接 push，
 * 永远不重入失败 ⇒ 机制①（在 `session/event` 里 `agent.inject()`）死了一整天，
 * 而探针 / 重放 / 体检三套全绿。这一批把它补上，`--self-test` 里有它自己的阳性对照。
 */
const REENTER = 'session append cannot reenter while another append is being published'
function makeSession(id, header = {}) {
  const session = { ...header, id, header: { ...header }, appending: false }
  /** 监听器自己抛的错：真 harness 是 contained 的（`invokeContainedSessionObservers`），这里记下来报出去。 */
  const contained = []
  return {
    session,
    contained,
    /** 派发一条会话事件 —— 在 `appending` 窗口里**同步**调监听器。 */
    dispatch(listeners, event) {
      if (session.appending) throw new Error(REENTER)
      session.appending = true
      try {
        for (const listener of listeners) {
          try {
            listener(session, event)
          } catch (error) {
            contained.push(String(error))
          }
        }
      } finally {
        session.appending = false
      }
    },
    /** 一次"写 session"（`agent.inject()` 走的就是这条路）—— 窗口里必须抛。 */
    append() {
      if (session.appending) throw new Error(REENTER)
    },
  }
}

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name, fallback) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback
}

// ════════════════════════════════════════════════════════════════════════════
// 一 · 读真日志（分帧 zstd）
// ════════════════════════════════════════════════════════════════════════════
const ZSTD_MAGIC = 0xfd2fb528

/** 走一个 zstd 帧的块边界，算出这一帧占多少字节。不靠"猜 magic 出现次数"。 */
function frameLength(buf, offset) {
  if (buf.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`偏移 ${offset} 不是 zstd 帧头`)
  let at = offset + 4
  const descriptor = buf[at]
  at += 1
  const fcsFlag = descriptor >> 6
  const singleSegment = (descriptor >> 5) & 1
  const checksum = (descriptor >> 2) & 1
  const dictFlag = descriptor & 3
  if (!singleSegment) at += 1                                  // Window_Descriptor
  at += [0, 1, 2, 4][dictFlag]                                 // Dictionary_ID
  if (fcsFlag === 0) { if (singleSegment) at += 1 }            // Frame_Content_Size
  else if (fcsFlag === 1) at += 2
  else if (fcsFlag === 2) at += 4
  else at += 8
  for (;;) {
    const header = buf.readUIntLE(at, 3)
    at += 3
    const last = header & 1
    const type = (header >> 1) & 3
    const size = header >> 3
    if (type === 0 || type === 2) at += size                   // Raw_Block / Compressed_Block
    else if (type === 1) at += 1                               // RLE_Block
    else throw new Error(`偏移 ${at - 3} 处是保留块类型`)
    if (last) break
  }
  if (checksum) at += 4
  return at - offset
}

/** 一份 `session.v3.jsonl.zstd` → 事件数组。 */
function readSession(path) {
  const buf = readFileSync(path)
  const events = []
  let at = 0
  while (at < buf.length) {
    const length = frameLength(buf, at)
    const text = zstdDecompressSync(buf.subarray(at, at + length)).toString('utf8')
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue
      events.push(JSON.parse(line))
    }
    at += length
  }
  return { events, frames: at === buf.length, bytes: buf.length }
}

/**
 * 会话根目录下所有日志（本机形如 `~/.dsh/sessions/<会话>/session.v3.jsonl.zstd`）。
 * ⚠️ 不猜那个被 mangle 过的目录名（`--E-Harness--` 的拼法试过一次就错：
 *    驱动器的 `:\` 合成一个 `-`，其余分隔符各一个 `-`，而目录名里的点还留着）。
 *    **让日志自己说 cwd**：首帧带着 `cwd`，按它筛，比猜目录名硬。
 */
function findLogs(root, depth = 0) {
  if (depth > 3) return []
  let entries
  try { entries = readdirSync(root, { withFileTypes: true }) } catch { return [] }
  const out = []
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (!entry.isDirectory()) continue
    const candidate = join(full, 'session.v3.jsonl.zstd')
    try { if (statSync(candidate).isFile()) { out.push(candidate); continue } } catch { /* 往下走 */ }
    out.push(...findLogs(full, depth + 1))
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════
// 二 · 参考模型（契约第三节那段伪代码，逐行照抄）
//   跟 inject.js 是**两份独立的东西** —— 对不上才有信息量。
// ════════════════════════════════════════════════════════════════════════════
/**
 * 参考模型（契约第三节那段伪代码，逐行照抄；2026-09-26 改成**落点口径**）。
 * 跟 inject.js 是**两份独立的东西** —— 对不上才有信息量。
 *
 * 🔴 2026-09-26 的两处改动（都是"落点"那半边，不是次数那半边）：
 *   1. **机制① 的账挂起来，到下一个 claim 点才落地** —— 新契约里它贴在
 *      `agent/pre-step` 的 `decision.messages` 上，不在 `tool/result` 那一刻。
 *      ⇒ 一个挂账要是后面**没有** claim 点（会话到这儿断了），它就不算数。
 *   2. **不叠**（口径 4）：同一个 claim 点上既有老板的话、又有一笔到期的 ① ⇒
 *      **② 赢，① 的挂账清掉**（那一格只贴一条）。
 */
function referenceModel(events, every, { member = false } = {}) {
  const out = { expected: 0, byOne: 0, byTwo: 0, aBlocks: 0, bSkips: 0, fires: [], counts: [], dangling: false }
  // 口径 5：组员整个不贴 —— 机制① 和机制② 都不该落到他身上。
  if (member) { out.member = true; return out }
  let count = 0             // 机制① 的计数器
  let skipNext = false      // 守门 B
  let bossWaiting = false   // 守门 A
  let pendingOne = false    // 机制① 挂的账：等下一个 claim 点落地
  for (const event of events) {
    const type = event?.type
    // 一步的 claim 点（这条工具插进来的）：两条机制**都**在这儿落地。
    if (type === 'prestep') {
      const hasBoss = Array.isArray(event.bossMessages) && event.bossMessages.length > 0
      if (hasBoss) {
        pendingOne = false                       // 不叠：② 赢下这一格，① 的账清掉
        skipNext = true
        out.expected += 1
        out.byTwo += 1
        out.fires.push({ seq: event.seq, by: '②' })
      } else if (pendingOne) {
        pendingOne = false
        out.expected += 1
        out.byOne += 1
        out.fires.push({ seq: event.seq, by: '①' })
      }
      continue
    }
    if (type === 'turn/start') { count = 0; continue }
    if (type === 'user/message' && event.data?.source?.kind === 'user') {
      bossWaiting = true
      continue
    }
    if (type === 'assistant/message') { bossWaiting = false; continue }
    if (type !== 'tool/result') continue
    if (every === 0) continue          // n=0 ⇒ 机制① 关着
    if (bossWaiting) { out.aBlocks += 1; continue }     // 守门 A：不计数、不触发、不动 skipNext
    if (skipNext) { skipNext = false; out.bSkips += 1; continue }  // 守门 B：不计数、不触发
    // ⚠️ 不看 `data.message.isError`：报错的、被门禁拒的**都算一次**（口径点 1）。
    count += 1
    out.counts.push(count)
    if (count === every) {
      count = 0
      pendingOne = true
    }
  }
  out.dangling = pendingOne            // 挂的账没等到 claim 点（会话在这儿断了）
  return out
}

/**
 * 在时间线上插入**一步的 claim 点**：每个 `step/start` **之前**（次序见文件头第 3 条）。
 *
 * 老板那句话出现在某一步的 `step/start` **之后**（它是 `step()` 里落笔的，L1028），
 * 可是它是**这一步的 claim 领进来的**（claim 在 `step/start` 之前，L889 早于 L951）。
 * ⇒ 得先预扫一遍：把第 N 步里出现的老板消息，记到第 N 步的 claim 点上。
 *
 * 返回 `{ timeline, orphans }`：`orphans` = 落在任何 step 之外的老板消息条数。
 * 真实日志里应当是 0；不是 0 就说明这条推断在这份日志上不成立，报表会打出来。
 */
function withPrestepPoints(events) {
  const bossOfStep = []
  // ⚠️ 下标只在 `step/start` 上 +1，`step/end` 只翻"人在不在步里"——
  //    早先一版把 `step/end` 也当成"下标归位"，于是第二步的老板消息记到了第一步头上
  //    （自检 ⑧ 当场抓住：实测 [1,0] / 期望 [0,1]）。
  let stepIndex = -1
  let inStep = false
  let orphans = 0
  for (const event of events) {
    const type = event?.type
    if (type === 'step/start') { stepIndex += 1; bossOfStep.push([]); inStep = true; continue }
    if (type === 'step/end') { inStep = false; continue }
    if (type !== 'user/message' || event.data?.source?.kind !== 'user') continue
    if (!inStep) { orphans += 1; continue }
    // ⚠️ 记的是**消息本身**（`event.data`），不是事件 —— claim 领到的是消息，
    //    实现的判据读的也是消息的 `source.kind`（早先一版把整个事件塞进去，② 一条都没落地）。
    bossOfStep[stepIndex].push(event.data)
  }
  const timeline = []
  let step = -1
  for (const event of events) {
    if (event?.type === 'step/start') {
      step += 1
      timeline.push({
        type: 'prestep',
        seq: event.seq,
        step: step + 1,
        bossMessages: bossOfStep[step] ?? [],
      })
    }
    timeline.push(event)
  }
  return { timeline, orphans }
}

/** 从日志里认出这个组员是哪个岗位（`subagent/descriptor` 的 persona 或系统提示里带着那枚标记）。 */
function memberRoleOf(events) {
  for (const event of events) {
    const type = event?.type
    if (type !== 'subagent/descriptor' && type !== 'system/message' && type !== 'user/message') continue
    const hit = /【组员:([a-z0-9][a-z0-9-]*)】/.exec(JSON.stringify(event))
    if (hit !== null) return hit[1]
  }
  return undefined
}

// ════════════════════════════════════════════════════════════════════════════
// 三 · 把真时间线喂给真 inject.js（假 ctx，一次 apply 一个会话 = 一份独立状态）
// ════════════════════════════════════════════════════════════════════════════
async function replayThroughInjector(events, sessionId, contentDir, header = {}, memberRole = undefined) {
  const handlers = new Map()
  const injected = []
  // ⚠️ `id` 必须放在 `...header` **后面**：日志首帧自己带一个 `id`（完整会话 id），
  //    铺开会把这里的短 id 覆盖掉 —— 于是 `session/event` 监听器把刻度记在完整 id 名下，
  //    而注入那一侧按 `context.scope.id`（短 id）去查，查不到 ⇒ 一条都不贴。
  //    实测踩过：日志读数是"实际 0 条"，看着像实现不贴，其实是这里的锅。
  const host = makeSession(sessionId, header)
  const session = host.session
  /**
   * next-step 收件箱 —— 真语义：`agent.inject()` 进这里，**下一个** claim 领走。
   * 机制① 的落点就靠它建模（不进收件箱的话，`inject()` 会被当成"当场进请求"，
   * 而那正是被评审打回的那条旧模型）。注入出来的那条**不回灌**成会话事件：
   * 实现只认 `source.kind === 'user'`，回灌也只会被它自己忽略。
   */
  const inbox = []
  /** 实现这边按**落点**分开数：`队列` = 走了 `agent.inject()`；`本步` = 插进 `decision.messages`。 */
  const seen = { queued: 0, spliced: 0 }
  const agent = {
    id: sessionId,
    session,
    inject: (message) => {
      host.append()                       // 🔴 窗口里必须抛（口径 15）
      inbox.push(message)
      injected.push({ at: Date.now(), message })
      seen.queued += 1
    },
  }
  const ctx = {
    baseUrl: pathToFileURL(contentDir + sep).href,
    get(name) {
      if (name === 'systemPrompt') return {}
      if (name === 'agents') return { get: (want) => (want === sessionId ? agent : undefined) }
      if (name === 'tools') return { guard: () => () => {} }
      return undefined
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    effect(run) { run() },
  }
  const mod = await import(pathToFileURL(PRESET_ENTRY).href)
  await mod.apply(ctx, { contentDir })

  const listeners = handlers.get('session/event') ?? []
  const assemblers = handlers.get('system-prompt/assemble') ?? []
  const preSteps = handlers.get('agent/pre-step') ?? []

  /** 一次装配：`sections` 里带不带那枚 `【组员:xx】`，决定实现认不认得出"这次是组员"。 */
  const assembleOnce = async () => {
    const assembly = {
      sections: [{
        name: 'deployment:persona-prefix',
        text: memberRole === undefined ? '（组长的装配，没有组员标记）' : `【组员:${memberRole}】`,
      }],
      contexts: [],
      tools: [],
      variables: {},
    }
    for (const assemble of assemblers) {
      await assemble(assembly, { scope: { id: sessionId } }, async () => assembly)
    }
  }

  /** 假 ctx 上的 `agent/pre-step` 瀑布（注册顺序 = 外层到内层，和 Cordis 一样）。 */
  const runPreStep = async (messages, step) => {
    const payload = {
      agent,
      messages,
      step,
      turn: 1,
      signal: { aborted: false, throwIfAborted() {} },
    }
    let next = async () => ({ kind: 'enter', messages: payload.messages })
    for (let i = preSteps.length - 1; i >= 0; i--) {
      const handler = preSteps[i]
      const inner = next
      next = () => handler(payload, inner)
    }
    return await next()
  }

  for (const event of events) {
    if (event.type === 'prestep') {
      // 真次序：claim（L889）→ 装配（L890）→ `agent/pre-step`（L894）。
      // 领到的那一批 = 收件箱里排着的 + **这一步里老板说的那几句**。
      const claimed = [...inbox.splice(0, inbox.length), ...(event.bossMessages ?? [])]
      await assembleOnce()
      const decision = await runPreStep(claimed, event.step)
      // 「本步」的观测量：pre-step 往这一步的 messages 里**新插**了几条。
      // ⚠️ 2026-09-26 之后**两条机制都从这条路出去**（口径 1/2 的返修）——
      //    所以这一列不再等于"机制②"，它等于"本步贴了几条"，判定看**总数**。
      if (decision?.kind !== 'reject' && Array.isArray(decision?.messages)) {
        const before = new Set(claimed)
        for (const message of decision.messages) if (!before.has(message)) seen.spliced += 1
      }
      // 这批 messages 随后会落笔成 `user/message`（L1028）—— 会话事件照日志原样继续走，
      // 所以不做第二次派发（老板那几句本来的位置就在这个 `step/start` 后面）。
      continue
    }
    // 🔴 在 `appending` 窗口里派发（口径 15）—— 旧实现就是在这一步被守卫挡住的。
    host.dispatch(listeners, event)
    // ⚠️ 只让"同步的状态更新"落地，不等 I/O —— 契约要求状态更新发生在第一个 await 之前，
    //    否则事件顺序会被读盘延迟搅乱。真正写进去的条数由最后那次 settle 收齐。
    await new Promise((resolve) => setImmediate(resolve))
  }
  // 收尾：一直等到不再有新注入（readFile 落地要 ~100 轮 setImmediate，实测）。
  const t0 = Date.now()
  let quiet = 0
  for (let i = 0; i < 3000000; i++) {
    const before = injected.length
    await new Promise((resolve) => setImmediate(resolve))
    quiet = injected.length === before ? quiet + 1 : 0
    if (quiet >= 5000 && Date.now() - t0 >= 120) break
  }
  // ⚠️ 总数是**两条路加起来**：`injected` 只数得到"进收件箱"那一类，
  //    插进 `decision.messages` 的得单独数（早先一版拿 `injected.length` 当总数，
  //    于是 ② 那 28 条凭空没了）。
  return { ...seen, total: seen.queued + seen.spliced, contained: host.contained }
}

// ════════════════════════════════════════════════════════════════════════════
// 四 · 自检：本工具自己的机器（帧解析 + 参考模型）先得是对的
// ════════════════════════════════════════════════════════════════════════════
let selfFails = 0
function expect(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) selfFails++
  console.log(`  ${ok ? 'ok  ' : 'RED '} ${label}  ·  实测 ${JSON.stringify(got)} / 期望 ${JSON.stringify(want)}`)
}

/** 每条样例都是**手算**的，不是把参考模型跑两遍。 */
function selfTest() {
  console.log('── 自检 1 · 参考模型（手算样例，n=3）──')
  const ev = (type, extra = {}) => ({ type, ...extra })
  const boss = ev('user/message', { data: { source: { kind: 'user' } } })
  const tool = ev('tool/result')
  const toolErr = ev('tool/result', {
    data: {
      message: {
        id: 'x',
        role: 'user',
        source: { kind: 'tool', callId: 'x' },
        content: [{ type: 'tool-result', toolCallId: 'x', content: [], isError: true }],
      },
      error: { name: 'FsError', code: 'X' },
    },
  })
  const speak = ev('assistant/message')
  const turn = ev('turn/start')
  const stepStart = ev('step/start')
  /** 一步的 claim 点：`n` = 这一步的 claim 领进来几句老板的话（领到的是**消息**，不是事件）。 */
  const claim = (n = 0) => ev('prestep', {
    bossMessages: Array.from({ length: n }, () => ({ role: 'user', content: [], source: { kind: 'user' } })),
  })

  // ① 每 3 个工具结果：每个步块 3 个结果 ⇒ 各落一次（**落点在下一个 claim 点**）
  // ⚠️ 样例里必须写出 claim 点：新契约下"账"要到 claim 点才落地，
  //    一条没有 claim 点的时间线是**测不出**机制① 的（末尾那个 `claim(0)` 就是收尾那一步）。
  expect('两个步块各 3 个工具结果（每个块后面跟着 claim 点）⇒ 2 次',
    referenceModel([turn, claim(0), stepStart, speak, tool, speak, tool, speak, tool,
      claim(0), stepStart, speak, tool, speak, tool, speak, tool, claim(0)], 3).expected, 2)
  // ② 老板的话被**这一步**领进来：同一步里三条也只摆 1 条（布尔量）
  expect('同一步领进 3 条老板消息 + 1 个 claim 点 ⇒ 1 次（不是 3 次）',
    referenceModel([turn, claim(3), stepStart, boss, boss, boss, speak, tool], 3).expected, 1)
  // ③ 守门 A：老板说完、我还没开口时来 2 个工具结果 ⇒ 0 次 ①（只有 ② 那 1 次）
  expect('守门 A 窗口里 2 个工具结果 ⇒ 只有 ② 的 1 次',
    referenceModel([turn, speak, tool, speak, tool, claim(1), stepStart, boss, tool, tool], 3).expected, 1)
  // ④ 老板说话**不算**进计数：他那句话之后仍要喂满 3 个"被计数的"工具结果才响
  expect('老板的话被领进来 + 4 个工具结果（末尾再走一步）⇒ 2 次（B 吃 1 个，剩 3 个凑满）',
    referenceModel([turn, claim(1), stepStart, boss, speak, tool, speak, tool, speak, tool, speak, tool,
      claim(0), stepStart], 3).expected, 2)
  // ⑤ n=0：机制① 关着，只剩机制②
  expect('n=0 + 2 个 claim 点（各领进一句）+ 9 个工具结果 ⇒ 2 次（全是 ②）',
    referenceModel([turn, claim(1), stepStart, boss, claim(1), stepStart, boss,
      ...Array.from({ length: 9 }, () => [speak, tool]).flat()], 0).expected, 2)
  // ⑥ turn/start 清零：上一回合攒了 2 个，新回合从 0 起
  expect('回合交界清零：2 个结果 + turn/start + 1 个结果 ⇒ 0 次',
    referenceModel([turn, speak, tool, speak, tool, turn, speak, tool], 3).expected, 0)
  // ⑦ 守门 B 之后再攒：skip 掉 1 个，接下来 3 个凑满 ⇒ 多 1 次
  expect('守门 B 之后重新攒满（末尾再走一步）⇒ 多 1 次',
    referenceModel([turn, speak, tool, speak, tool, claim(1), stepStart, boss,
      speak, tool, speak, tool, speak, tool, speak, tool, claim(0), stepStart], 3).expected, 2)
  // ⑦-b 🔴 **不叠**（口径 4）：同一格上"老板的话"和"到期的 ①"撞在一起 ⇒ 只贴一条
  {
    const noStack = referenceModel([turn, speak, tool, speak, tool, speak, tool, claim(1), stepStart, boss], 3)
    expect('不叠：一笔到期的 ① 撞上领进老板的话的那一格 ⇒ 只算 ② 那 1 次（① 的账清掉）',
      { expected: noStack.expected, byOne: noStack.byOne, byTwo: noStack.byTwo },
      { expected: 1, byOne: 0, byTwo: 1 })
  }
  // ⑦-c 挂的账后面**没有** claim 点（会话到这儿断了）⇒ 不算数
  expect('账挂了但没有下一个 claim 点 ⇒ 一次都不算（不许"预支"）',
    referenceModel([turn, claim(0), stepStart, speak, tool, speak, tool, speak, tool], 3).expected, 0)
  // ⑧ claim 点插在**每个 `step/start` 之前**，老板那几句记在**它所在那一步**上
  {
    const { timeline, orphans } = withPrestepPoints([
      stepStart, speak, ev('step/end'),
      stepStart, boss, speak, ev('step/end'),
    ])
    expect('插 claim 点：2 个 step/start ⇒ 2 个点，各带 0 / 1 条老板消息',
      timeline.filter((e) => e.type === 'prestep').map((e) => e.bossMessages.length), [0, 1])
    expect('claim 点排在它那一步的 step/start 之前（真次序：claim 早于 step/start）',
      timeline.findIndex((e) => e.type === 'prestep') < timeline.findIndex((e) => e.type === 'step/start'), true)
    expect('落在任何 step 之外的老板消息计数（真实日志里应当是 0）', orphans, 0)
  }
  // ⑨ 组员：整段 0 次（口径 5）
  expect('组员：老板的话被领进来 + 9 个工具结果 ⇒ 0 次',
    referenceModel([turn, claim(1), stepStart, boss,
      ...Array.from({ length: 9 }, () => [speak, tool]).flat()], 3, { member: true }).expected, 0)
  // ⑩ 口径点 1：**报错的工具结果也算一次**（`data.message.isError: true`，跟成败无关）
  expect('报错的工具结果也算一次：3 个 isError 的结果（末尾走一步）⇒ 1 次',
    referenceModel([turn, speak, toolErr, speak, toolErr, speak, toolErr, claim(0), stepStart], 3).expected, 1)
  expect('报错的和成功的一起数：1 个报错 + 2 个成功 ⇒ 1 次（不是"报错的不算所以还差一个"）',
    referenceModel([turn, speak, toolErr, speak, tool, speak, tool, claim(0), stepStart], 3).expected, 1)

  console.log('\n── 自检 2 · 假会话的 `appending` 守卫（口径 15）──')
  // 🔴 这一族量的是**工具自己**：守卫要是没补上（或者补坏了），假 ctx 就退回
  //    "inject() 永远成功"——那时**机制① 死了也会全绿**，正是 2026-09-26 之前一整天的形状。
  {
    const host = makeSession('guard-probe')
    let insideError
    const listeners = [() => {
      // 真 harness：`agent.inject()` 最终就走到这一步（inject → send → inbox.splice → append）。
      // ⚠️ 错要在这儿自己接住：`dispatch` 是 contained 的（见下面第三条断言）。
      try { host.append() } catch (error) { insideError = String(error) }
    }]
    host.dispatch(listeners, { type: 'tool/result' })
    expect('派发窗口里写 session（= agent.inject 那条路）⇒ 撞 L1181 那条守卫',
      /cannot reenter while another append is being published/.test(String(insideError)), true)
    expect('窗口关掉了（finally 里清）', host.session.appending, false)

    // 窗口外必须**不抛** —— 守卫不是"把所有注入都拦掉"。
    let outsideError
    let outsideOk = false
    try {
      host.append()
      outsideOk = true
    } catch (error) {
      outsideError = String(error)
    }
    expect('窗口外写 session ⇒ 不抛（守卫不是把路全堵死）',
      { 抛错: outsideError === undefined ? '无' : outsideError, 写成功: outsideOk }, { 抛错: '无', 写成功: true })

    // 监听器自己抛的错要被 contained 住并记下来（真 harness 是 contained 的）。
    const h2 = makeSession('guard-probe-2')
    h2.dispatch([() => { throw new Error('监听器自己炸了') }], { type: 'x' })
    expect('监听器自己抛错 ⇒ 被 contained 住、记一笔（不把整趟跑挂掉）', h2.contained.length, 1)
  }

  console.log('\n── 自检 3 · 分帧 zstd 解析器 ──')
  const root = process.env.DSH_SESSION_ROOT ?? join(homedir(), '.dsh', 'sessions')
  const logs = findLogs(root).slice(0, 40)
  let checked = 0
  let bad = 0
  let frameTotal = 0
  for (const path of logs) {
    try {
      const { events, frames } = readSession(path)
      frameTotal += events.length
      if (!frames) { bad++; continue }
      if (events.length === 0) { bad++; continue }
      if (events[0]?.type !== 'session') { bad++; continue }
      checked++
    } catch { bad++ }
  }
  expect(`前 40 份日志全部切帧成功、首帧都是 session（共 ${frameTotal} 条事件）`, { checked, bad }, { checked: logs.length, bad: 0 })
  expect('日志份数 > 0', logs.length > 0, true)
}

// ════════════════════════════════════════════════════════════════════════════
// 五 · 主流程
// ════════════════════════════════════════════════════════════════════════════
if (flag('self-test')) {
  console.log('# 重放工具自检（不 import inject.js，不碰预设）\n')
  selfTest()
  console.log(selfFails === 0 ? '\n自检全过 —— 工具自己是好的。' : `\n自检 ${selfFails} 条红 —— 先修工具，别拿它的读数说事。`)
  process.exit(selfFails === 0 ? 0 : 2)
}

const sessionRoot = process.env.DSH_SESSION_ROOT ?? join(homedir(), '.dsh', 'sessions')
console.log(`# 尾巴注入重放 · 日志根 ${sessionRoot}`)

const styleRaw = readFileSync(STYLE_FILE, 'utf8')
const everyHit = /<!--\s*every:\s*(\d+)\s*-->/.exec(styleRaw.split('\n')[0] ?? '')
const every = everyHit === null ? 3 : Number(everyHit[1])
console.log(`# 被测参数：\`style.md\` 第一行 every = ${every}${everyHit === null ? '（没找到注释，按契约取默认 3）' : ''}`)
if (every !== 3) {
  console.log(`# ⚠️ 口径 #1 定的是 n = 3 —— 参数本身还没改，下面所有"该摆"都是按 ${every} 算的。`)
}

let logs = findLogs(sessionRoot)
if (logs.length === 0) {
  console.error(`找不到日志：${sessionRoot}`)
  process.exit(2)
}

const only = value('session', undefined)
if (only !== undefined) logs = logs.filter((p) => p.includes(only))

const loaded = []
let otherCwd = 0
for (const path of logs) {
  let parsed
  try { parsed = readSession(path) } catch (error) {
    loaded.push({ path, id: path, error: String(error) })
    continue
  }
  const { events } = parsed
  const header = events[0] ?? {}
  // 只跑**这个仓库**的会话：日志首帧自己带着 cwd。
  // ⚠️ 两边都过一遍 `resolve` —— `fileURLToPath` 出来的仓库路径带尾分隔符（`E:\Harness\`），
  //    日志里写的是 `E:\Harness`，直接比会一份都匹配不上（实测踩过：跑 0 份却退出 0）。
  if (typeof header.cwd !== 'string' || resolve(header.cwd) !== REPO) { otherCwd++; continue }
  const id = /([0-9a-f]{8})/.exec(path.split(/[\\/]/).slice(-2)[0] ?? '')?.[1] ?? path
  const bossCount = events.filter((e) => e.type === 'user/message' && e.data?.source?.kind === 'user').length
  const toolCount = events.filter((e) => e.type === 'tool/result').length
  // 报错的工具结果**也算一次**（口径点 1）—— 数出来是为了让"这批日志里真有报错的结果、
  // 而参考模型与实现照样把它们算进去"变成一条看得见的读数，不是一句口径。
  // ⚠️ 真形状：报错标记在 `data.message.content[].isError`（量过 45269 条，979 条报错）。
  const erroredTools = events.filter((e) => e.type === 'tool/result'
    && (e.data?.message?.content ?? []).some((c) => c?.isError === true)).length
  // 组员 = 这个会话是被人叫起来的（首帧自带 parentSession / delegationDepth / origin）。
  const member = header.delegationDepth > 0 || typeof header.parentSession === 'string'
  // 插 claim 点：机制② 现在挂在"这一步领到的 messages"上（见文件头第 3 条）。
  const { timeline, orphans } = withPrestepPoints(events)
  // 组员的岗位名从日志里认 —— 装配的 `sections` 要原样带上那枚标记，
  // 实现才知道"这次开口的是组员"（口径 8b 就靠它）。
  const memberRole = member ? memberRoleOf(events) : undefined
  loaded.push({ path, id, events, timeline, orphans, memberRole, bossCount, toolCount, erroredTools, member, header, preset: header.agentPreset })
}
const leaders = loaded.filter((s) => s.error === undefined && !s.member)
  .sort((a, b) => (b.bossCount + b.toolCount) - (a.bossCount + a.toolCount))
// 组员那边挑**工具调用最多**的几份：口径 8b 的判据是"一次都不许贴"，
// 会话越长越有说服力（组长实测那份 35 步贴了 5 次）。
const members = loaded.filter((s) => s.error === undefined && s.member)
  .sort((a, b) => b.toolCount - a.toolCount)

const limit = Number(value('limit', 5))
const memberLimit = Number(value('members', 3))
const chosen = flag('all')
  ? [...leaders, ...members]
  : [...leaders.slice(0, limit), ...members.slice(0, memberLimit)]
console.log(`# 这个仓库（cwd = ${REPO}）的日志 ${loaded.length} 份（另有 ${otherCwd} 份是别的 cwd，跳过）`)
console.log(`#   其中组长会话 ${leaders.length} 份 · 组员会话 ${members.length} 份`)
// 🔴 「跑了 0 份」绝不能当成"全过" —— 那是"静默失效的检查和通过的检查长得一模一样"的标准形态。
if (leaders.length === 0 && members.length === 0) {
  console.error(
    `\n🔴 这个仓库一份日志都没匹配上（扫到 ${loaded.length} 份、别的 cwd ${otherCwd} 份）—— `
    + '不是"全过"，是**什么都没量**。退出码 2。',
  )
  process.exit(2)
}
console.log(`# 本次跑 ${chosen.length} 份（` +
  (flag('all') ? '--all：全跑' : `组长前 ${Math.min(limit, leaders.length)} + 组员前 ${Math.min(memberLimit, members.length)}；--all 全跑 / --limit N / --members N`)
  + '）\n')

const traceOf = value('trace', undefined)
const rows = []
let mismatches = 0

for (const item of chosen) {
  if (item.error !== undefined) {
    rows.push({ ...item, verdict: '读取失败' })
    mismatches++
    continue
  }
  const reference = referenceModel(item.timeline, every, { member: item.member })
  const seen = await replayThroughInjector(item.timeline, item.id, PRESET_DIR, item.header, item.memberRole)
  const actual = seen.total
  const ok = actual === reference.expected
  if (!ok) mismatches++
  rows.push({
    id: item.id,
    who: item.member ? '组员' : '组长',
    boss: item.bossCount,
    turns: item.events.filter((e) => e.type === 'turn/start').length,
    tools: item.toolCount,
    steps: item.events.filter((e) => e.type === 'step/start').length,
    expected: reference.expected,
    byOne: reference.byOne,
    byTwo: reference.byTwo,
    aBlocks: reference.aBlocks,
    bSkips: reference.bSkips,
    actual,
    actualQueued: seen.queued,
    actualSpliced: seen.spliced,
    contained: seen.contained.length,
    verdict: ok ? 'ok' : 'RED',
    fires: reference.fires,
  })

  if (traceOf !== undefined && item.path.includes(traceOf)) {
    console.log(`── 触发点明细：${item.id}（参考模型说该在下面这些 seq 摆）──`)
    for (const fire of reference.fires.slice(0, 60)) {
      console.log(`   seq ${String(fire.seq).padStart(5)}  ${fire.by}`)
    }
    if (reference.fires.length > 60) console.log(`   …（共 ${reference.fires.length} 次，只印前 60）`)
    console.log(`   实际贴了 ${actual} 条\n`)
  }
}

// ── 报表 ────────────────────────────────────────────────────────────────────
const pad = (text, width) => String(text).padEnd(width, ' ')
console.log(
  `${pad('会话', 12)} ${pad('身份', 5)} ${pad('老板', 5)} ${pad('回合', 5)} ${pad('步', 5)} ${pad('工具结果', 9)} `
  + `${pad('该摆', 6)} ${pad('实际', 6)} ${pad('①该', 5)} ${pad('②该', 5)} ${pad('队列实', 7)} ${pad('本步实', 7)} `
  + `${pad('A拦', 5)} ${pad('B跳', 5)} 判定`,
)
console.log('─'.repeat(120))
for (const row of rows) {
  if (row.verdict === '读取失败') {
    console.log(`${pad(row.id, 12)}  读取失败：${row.error}`)
    continue
  }
  console.log(
    `${pad(row.id, 12)} ${pad(row.who, 5)} ${pad(row.boss, 5)} ${pad(row.turns, 5)} ${pad(row.steps, 5)} ${pad(row.tools, 9)} `
    + `${pad(row.expected, 6)} ${pad(row.actual, 6)} ${pad(row.byOne, 5)} ${pad(row.byTwo, 5)} `
    + `${pad(row.actualQueued, 7)} ${pad(row.actualSpliced, 7)} `
    + `${pad(row.aBlocks, 5)} ${pad(row.bSkips, 5)} ${row.verdict}`,
  )
}
console.log('─'.repeat(120))
const totalExpected = rows.reduce((sum, r) => sum + (r.expected ?? 0), 0)
const totalActual = rows.reduce((sum, r) => sum + (r.actual ?? 0), 0)
const totalA = rows.reduce((sum, r) => sum + (r.aBlocks ?? 0), 0)
const memberRows = rows.filter((r) => r.who === '组员')
const memberActual = memberRows.reduce((sum, r) => sum + (r.actual ?? 0), 0)
const leaderActual = rows.filter((r) => r.who === '组长').reduce((sum, r) => sum + (r.actual ?? 0), 0)
const leaderExpected = rows.filter((r) => r.who === '组长').reduce((sum, r) => sum + (r.expected ?? 0), 0)
console.log(`合计：该摆 ${totalExpected} 次 · 实际 ${totalActual} 次 · 差 ${totalActual - totalExpected} 次`)
// ⚠️ 别只看这个"差"：组长那几份是**各自差一截**（该摆 101 / 实际 91），
//    一加一减也能凑出一个接近 0 的总数。判据是**逐份的判定**，不是这个合计。
const redRows = rows.filter((r) => r.verdict === 'RED')
console.log(
  `对不上：${redRows.length}/${rows.length} 份`
  + `（组长 ${rows.filter((r) => r.who === '组长' && r.verdict === 'RED').length}`
  + `/${rows.filter((r) => r.who === '组长').length}`
  + ` · 组员 ${rows.filter((r) => r.who === '组员' && r.verdict === 'RED').length}`
  + `/${rows.filter((r) => r.who === '组员').length}）`,
)
// 🔴 "组员 0 条"只有在**同批组长确实贴了东西**时才说明问题 ——
//    否则整套压根没跑起来，那个 0 是空跑的（假绿），跟"达标"长得一模一样。
if (memberRows.length === 0) {
  console.log('口径 8b（组员整个不贴）：这次一份组员会话都没跑到 —— **没有判定**，别读成达标。')
} else if (leaderActual === 0 && leaderExpected > 0) {
  console.log(
    `🔴 口径 8b：**不能判定**。组员 ${memberRows.length} 份共贴 ${memberActual} 条看着是"0 条达标"，`
    + `但同批组长会话也是 0 条（该摆 ${leaderExpected} 条）—— 说明整套压根没贴，那个 0 是空跑出来的。`,
  )
  mismatches++
} else {
  console.log(
    `口径 8b（组员整个不贴）：跑了 ${memberRows.length} 份组员会话，共贴 ${memberActual} 条 —— `
    + (memberActual === 0
      ? `0 条达标（对照：同批组长会话实际贴了 ${leaderActual} 条 ⇒ 这个 0 不是空跑）`
      : '🔴 应该 0 条'),
  )
}
console.log(`守门 A 在这些真日志里拦下 ${totalA} 次 —— ${totalA === 0 ? '⚠️ 是真日志里 0 次命中的分支，它只有探针的合成序列在验' : '确有命中'}`)
// 🔴 2026-09-26 返修之后，**两条机制都从"本步"那条路出去**（口径 1/2）⇒ `队列实` 应当是 0。
//    它 > 0 就说明有人又把某条机制挪回 `agent.inject()` 了 —— 而那条路在真 harness 里
//    会撞 `appending` 守卫（假会话里也撞，见 `--self-test` 自检 3）。
//    ⚠️ 这只是**提示行，不是判据**：落点由探针的 R/L 族判，这里只量次数。
const totalQueued = rows.reduce((sum, r) => sum + (r.actualQueued ?? 0), 0)
const totalSpliced = rows.reduce((sum, r) => sum + (r.actualSpliced ?? 0), 0)
const totalContained = rows.reduce((sum, r) => sum + (r.contained ?? 0), 0)
console.log(
  `落点分布：进收件箱（\`agent.inject()\` 那条路）${totalQueued} 条 · 插进本步 messages ${totalSpliced} 条`
  + (totalQueued > 0
    ? ' 🔴 队列那条路还有人在用 —— 真 harness 里它会撞 appending 守卫（口径 1 要求这里是 0）'
    : '（0 = 两条机制都从"本步"出去，符合口径 1/2）'),
)
console.log(
  `会话事件监听器自己抛的错：${totalContained} 次`
  + (totalContained === 0
    ? '（真 harness 的 `invokeContainedSessionObservers` 也是这么吞的 —— 吞掉的错不会让整趟跑挂掉，所以这里单独记一笔）'
    : ' ⚠️ 有监听器在抛错（真 harness 会吞掉它们，那是"静默失效"的温床）'),
)
// 口径点 1 的真读数：报错的工具结果**照样算一次**。参考模型与实现都不看 `isError`，
// 所以这一行是"这批日志里真有报错的结果，而它们被算进去了"——不是一句口径。
const totalErrored = chosen.reduce((sum, s) => sum + (s.erroredTools ?? 0), 0)
const totalOrphans = chosen.reduce((sum, s) => sum + (s.orphans ?? 0), 0)
console.log(
  `口径点 1（报错的工具结果也算一次）：这批日志里有 ${totalErrored} 个 \`data.message.content[].isError: true\` 的结果`
  + ` —— 参考模型和实现都不看 isError，它们照样占机制① 的计数`
  + (totalErrored === 0 ? '（⚠️ 这一批一个都没有 ⇒ 这条口径**本批没被真数据覆盖**）' : ''),
)
console.log(
  `claim 点建模：落在任何 \`step\` 之外的老板消息 ${totalOrphans} 条`
  + (totalOrphans === 0
    ? '（0 = 上面那条"老板的话记在它所在那一步"的推断，在这批日志上成立）'
    : '（⚠️ 不是 0 ⇒ 这条推断在这批日志上不成立，机制② 的"该摆"要打问号）'),
)
console.log(
  '\n⚠️ 这条工具量的是**次数**，量不出**落点**（贴出去的那条在请求里插在第几条消息）。\n'
  + '   落点归探针的 R / L 族判（假 ctx 按 claim → 装配 → pre-step 的次序建模）。',
)
console.log(
  '⚠️ 假会话带 `appending` 守卫（照 `dsh-session` L1181/L1191-1202）：派发 `session/event` 的窗口里\n'
  + '   写 session（= `agent.inject()` 那条路）必抛。它的阳性对照在 `--self-test` 的自检 2 里 ——\n'
  + '   没有它，机制① 死了也会全绿（2026-09-26 之前一整天的形状）。',
)
console.log(
  '⚠️ claim 点是**推断**出来的（每个 `step/start` 之前插一个，老板那几句记在它所在那一步上），\n'
  + '   日志里没有 claim 事件。依据是 `dsh-agent-loop` 的 L889/L890/L894/L951/L1028 与\n'
  + '   契约 §2 第 4 条那组真 seq（`step/start` 767 排在 `user/message` 768 之前）。\n'
  + '   组员的岗位名从日志里认（`subagent/descriptor` 的 persona 那枚标记），原样放进装配的 sections。',
)

process.exit(mismatches > 0 ? 1 : 0)
