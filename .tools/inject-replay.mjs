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
 *  3. **只喂会话事件 + 一处推断出来的装配点。** 契约把机制① 钉在事件上（`tool/result`），
 *     把机制② 钉在 `system-prompt/assemble`（挂账 + 到装配才注）。
 *     而**装配不是会话事件**（它是 Cordis 的钩子），日志里没有 —— 所以这条工具在
 *     **每一条 `assistant/message` 之前插一个装配点**。
 *     依据：模型必须先被装配出来才会开口；实测每个 `step/start…step/end` 里恰好一条
 *     `assistant/message`（`session-eee21b3c`：80 步 / 80 条），日志里那 3 条 `request/header`
 *     也都排在 `assistant/message` 前面。
 *     ⚠️ 这是**推断**，不是量出来的：装配的确切时刻日志里没有。
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
const PRESET_ENTRY = join(PRESET_DIR, 'inject.js')
const STYLE_FILE = join(PRESET_DIR, 'style.md')

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
function referenceModel(events, every, { member = false } = {}) {
  const out = { expected: 0, byOne: 0, byTwo: 0, aBlocks: 0, bSkips: 0, fires: [], counts: [] }
  // 口径 8b：组员整个不贴 —— 机制① 和机制② 都不该落到他身上。
  if (member) { out.member = true; return out }
  let count = 0             // 机制① 的计数器
  let skipNext = false      // 守门 B
  let bossWaiting = false   // 守门 A
  let pendingWarmup = false // 机制② 的挂账（布尔量）
  for (const event of events) {
    const type = event?.type
    // 装配点（这条工具插进来的）：机制② 到这里才真的摆。
    if (type === 'assemble') {
      if (!pendingWarmup) continue
      pendingWarmup = false
      skipNext = true
      out.expected += 1
      out.byTwo += 1
      out.fires.push({ seq: event.seq, by: '②' })
      continue
    }
    if (type === 'turn/start') { count = 0; continue }
    if (type === 'user/message' && event.data?.source?.kind === 'user') {
      bossWaiting = true
      pendingWarmup = true     // 只挂账，不在这里摆
      continue
    }
    if (type === 'assistant/message') { bossWaiting = false; continue }
    if (type !== 'tool/result') continue
    if (every === 0) continue          // n=0 ⇒ 机制① 关着
    if (bossWaiting) { out.aBlocks += 1; continue }     // 守门 A：不计数、不触发、不动 skipNext
    if (skipNext) { skipNext = false; out.bSkips += 1; continue }  // 守门 B：不计数、不触发
    count += 1
    out.counts.push(count)
    if (count === every) {
      count = 0
      out.expected += 1
      out.byOne += 1
      out.fires.push({ seq: event.seq, by: '①' })
    }
  }
  return out
}

/**
 * 在时间线上插入装配点：**每一条 `assistant/message` 之前插一个**。
 * 依据见文件头第 3 条 —— 这是推断，日志里没有装配事件。
 */
function withAssemblyPoints(events) {
  const out = []
  for (const event of events) {
    if (event?.type === 'assistant/message') out.push({ type: 'assemble', seq: event.seq })
    out.push(event)
  }
  return out
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
  const session = { ...header, id: sessionId, header: { ...header } }
  const agent = { id: sessionId, session, inject: (message) => { injected.push({ at: Date.now(), message }) } }
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

  for (const event of events) {
    if (event.type === 'assemble') {
      // 装配的 `sections` 里放什么，决定了实现认不认得出"这次是组员" ——
      // 组长拍的设计里认人就在这一刻做（那里角色是现成的）。
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
      continue
    }
    for (const listener of listeners) listener(session, event)
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
  return injected
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
  const speak = ev('assistant/message')
  const turn = ev('turn/start')
  const asm = ev('assemble')      // 机制② 现在挂在装配上

  // ① 每 3 个工具结果：第 3、第 6 个响 ⇒ 2 次
  expect('6 个工具结果（无老板、无装配）⇒ 2 次',
    referenceModel([turn, speak, tool, speak, tool, speak, tool, speak, tool, speak, tool, speak, tool], 3).expected, 2)
  // ② 老板挂账、装配才摆：3 条老板消息 + 1 次装配 ⇒ 1 次（不是 3 次，挂账是布尔量）
  expect('3 条老板消息 + 1 次装配 ⇒ 1 次（布尔挂账）',
    referenceModel([turn, boss, boss, boss, asm, speak, tool], 3).expected, 1)
  // ③ 守门 A：老板说完、我还没开口时来 2 个工具结果 ⇒ 0 次 ①（只有 ② 那 1 次）
  expect('守门 A 窗口里 2 个工具结果 ⇒ 只有 ② 的 1 次',
    referenceModel([turn, speak, tool, speak, tool, boss, asm, ev('step/start'), tool, tool], 3).expected, 1)
  // ④ 老板说话**不算**进计数：老板之后仍要喂满 3 个"被计数的"工具结果才响
  expect('老板挂账 + 装配 + 4 个工具结果 ⇒ 2 次（B 吃 1 个，剩 3 个凑满）',
    referenceModel([turn, boss, asm, speak, tool, speak, tool, speak, tool, speak, tool], 3).expected, 2)
  // ⑤ n=0：机制① 关着，只剩机制②
  expect('n=0 + 2 条老板消息（各自装配）+ 9 个工具结果 ⇒ 2 次（全是 ②）',
    referenceModel([turn, boss, asm, boss, asm, ...Array.from({ length: 9 }, () => [speak, tool]).flat()], 0).expected, 2)
  // ⑥ turn/start 清零：上一回合攒了 2 个，新回合从 0 起
  expect('回合交界清零：2 个结果 + turn/start + 1 个结果 ⇒ 0 次',
    referenceModel([turn, speak, tool, speak, tool, turn, speak, tool], 3).expected, 0)
  // ⑦ 守门 B 之后再攒：skip 掉 1 个，接下来 3 个凑满 ⇒ 多 1 次
  expect('守门 B 之后重新攒满 ⇒ 多 1 次',
    referenceModel([turn, speak, tool, speak, tool, boss, asm, speak, tool, speak, tool, speak, tool, speak, tool], 3).expected, 2)
  // ⑧ 图省事也得对：每条 assistant/message 之前插装配点
  expect('插装配点：3 条 assistant/message ⇒ 3 个装配点',
    withAssemblyPoints([turn, speak, tool, speak, tool, speak]).filter((e) => e.type === 'assemble').length, 3)
  // ⑨ 组员：整段 0 次（口径 8b）
  expect('组员：老板 + 装配 + 9 个工具结果 ⇒ 0 次',
    referenceModel([turn, boss, asm, ...Array.from({ length: 9 }, () => [speak, tool]).flat()], 3, { member: true }).expected, 0)

  console.log('\n── 自检 2 · 分帧 zstd 解析器 ──')
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
  // 组员 = 这个会话是被人叫起来的（首帧自带 parentSession / delegationDepth / origin）。
  const member = header.delegationDepth > 0 || typeof header.parentSession === 'string'
  // 插装配点：机制② 现在挂在 `system-prompt/assemble` 上（见文件头第 3 条）。
  const timeline = withAssemblyPoints(events)
  // 组员的岗位名从日志里认 —— 装配的 `sections` 要原样带上那枚标记，
  // 实现才知道"这次开口的是组员"（口径 8b 就靠它）。
  const memberRole = member ? memberRoleOf(events) : undefined
  loaded.push({ path, id, events, timeline, memberRole, bossCount, toolCount, member, header, preset: header.agentPreset })
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
  const injected = await replayThroughInjector(item.timeline, item.id, PRESET_DIR, item.header, item.memberRole)
  const actual = injected.length
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
  + `${pad('该摆', 6)} ${pad('实际', 6)} ${pad('①', 5)} ${pad('②', 5)} ${pad('A拦', 5)} ${pad('B跳', 5)} 判定`,
)
console.log('─'.repeat(102))
for (const row of rows) {
  if (row.verdict === '读取失败') {
    console.log(`${pad(row.id, 12)}  读取失败：${row.error}`)
    continue
  }
  console.log(
    `${pad(row.id, 12)} ${pad(row.who, 5)} ${pad(row.boss, 5)} ${pad(row.turns, 5)} ${pad(row.steps, 5)} ${pad(row.tools, 9)} `
    + `${pad(row.expected, 6)} ${pad(row.actual, 6)} ${pad(row.byOne, 5)} ${pad(row.byTwo, 5)} `
    + `${pad(row.aBlocks, 5)} ${pad(row.bSkips, 5)} ${row.verdict}`,
  )
}
console.log('─'.repeat(102))
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
console.log(
  '\n⚠️ 这条工具量的是**次数**，量不出**落点**（贴出去的那条在请求里插在第几条消息）。\n'
  + '   落点要真回合才知道 —— 见契约第九节「自动验不了的部分」。',
)
console.log(
  '⚠️ 装配点是**推断**出来的（每条 `assistant/message` 之前插一个），日志里没有装配事件。\n'
  + '   机制② 现在就挂在那上面 ⇒ 这条读数跟"装配到底发生在哪一刻"绑在一起。\n'
  + '   组员的岗位名从日志里认（`subagent/descriptor` 的 persona 那枚标记），原样放进装配的 sections。',
)

process.exit(mismatches > 0 ? 1 : 0)
