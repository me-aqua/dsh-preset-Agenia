/**
 * 候选池 —— **append-only 导入 + fence**（提案 §B1.3 的 `proposals.mjs`）。
 *
 * 冻结依据：
 *   · 提案 §B1.4：`proposal-import` / `maintenance-import` 的 payload、成功字段（`imported_id`/`imported_at`）
 *     与主要错误码（`E_FENCE_STALE` / `E_ARG_SCHEMA` / `E_ARG_HASH`）；
 *   · 计划 v5 §7.2：**共享候选只能由组长的 append-only 导入命令写入**；维护候选带 update generation/attempt fence；
 *     不声称防篡改，只记录来源 / 哈希；
 *   · MEM-04（维护案导入必须能在"还没开过工"的根上成功）· MEM-11（schema / 基准版本 / 来源 / 内容 SHA / fence；
 *     旧 attempt 拒收）· MEM-12（普通提案不许删/并/退/改类型/斩杀；**无冷却、不限制数量**）。
 *
 * 四条口径：
 *   ① **池子是 append-only 的 JSONL**：导入只追加一行，**从不改写已有行**（"组长不得修改原文"的落地形状）。
 *      一行 = 一次导入的全部事实（来源 / 声明的 sha256 / 内容的 sha256 / fence / payload 原样）。
 *   ② **"原文没被改过"要可机读**：同一个 `source` 第二次导入时，
 *      声明哈希不一样 ⇒ `E_ARG_HASH`（原文被改过）；声明哈希一样但**内容哈希**不一样 ⇒ 也 `E_ARG_HASH`
 *      （那个声明对不上内容）。两条都不看"文件在不在盘上" —— 池子只认自己记过的事实。
 *   ③ **fence 是"这一份候选属于哪一轮"**（顺序冻结：形状 → 普通提案白名单 → 哈希 → 原文一致 → fence）：
 *      · 根上**还没有共享状态** ⇒ 只接受第一轮（generation 1 / review_attempt 1）；
 *      · 有状态 ⇒ `update_generation` 必须**等于** `state.generation`；
 *        `review_attempt` 必须落在 `[1, state.review_attempt + 1]`（**"过期"= 跳到还没发生的轮次**）；
 *      · `base_snapshot` 必须是一个**盘上真的存在**的快照版本 —— 除非这个根上一份快照都还没有
 *        （全新根上首次导入照收：那一刻没有可比的基准）。
 *   ④ **普通提案只许新增与修改**（`add` / `modify` 或缺省）：删 / 并 / 退 / 改类型 / 斩杀**一律 `E_ARG_SCHEMA`**
 *      —— 那几样只能走"复核 → 次日判决"。维护案（`maintenance-import`）不受这条白名单约束。
 *   ⑤ **「已判」是另一个文件、另一条链**（T-MEM-07）：`proposals/judged.jsonl` 只由 `judge-commit`
 *      在**事务成功之后**追加，一行 = 一次判决结果（`readJudged` / `appendJudgedRows`）。
 *      它**不回写池子**：池子照旧只进不出，"判过没有"这个问题由"池子 − 已判"算出来。
 *   ⑥ **每条进库的正文都有 400 字上限**（`F-125`，老板 2026-10-22「不许超」）：闸装在 `importVerdict`
 *      里**两种 kind 都过**的那一层 —— 两条 CLI（`--op maintenance-import` / `--op proposal-import`）
 *      都只经过这里；只挂在其中一支，另一支就是同一个上限下一次静默消失的地方。
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { acquireLock, releaseLock, writeFileAtomic } from './atomic.mjs'
import { sha256Hex, stableStringify, brainError, judgedLockPath, judgedPath, poolLockPath, poolPath, proposalsArchiveDir, proposalsDir } from './state.mjs'
import { listVersions } from './snapshot.mjs'
// 尺子只有一把：`charCountOf`（去开头 BOM → `\r\n` 归成 `\n` → 数 code point）住在 `lib/memory.mjs`。
// 正文上限那一关（`bodyCapVerdict`）量字数时只许用它 —— 另写一份 `.length` 判据就是"同一个 400 长出第二个数"。
import { charCountOf } from './memory.mjs'

/** 池子行的 schema。 */
export const POOL_SCHEMA = 1

/** 「已判」索引行的 schema（T-MEM-07；当前恒 `1`）。 */
export const JUDGED_SCHEMA = 1

/** 普通提案允许的处置（其余一律走复核 → 次日判决）。 */
export const ORDINARY_ALLOWED_KINDS = Object.freeze(['add', 'modify'])

/** 普通提案里**明令禁止**的处置（MEM-12 的那六个；写在这儿是为了让报文能点名）。 */
export const ORDINARY_FORBIDDEN_KINDS = Object.freeze(['delete', 'remove', 'merge', 'retire', 'retag', 'cull'])

/**
 * 每条**正文**的上限（字）：`> 400` 拒，`400` 收。**这个数不在这里发明** ——
 * 它是老板 2026-10-18「以后提案阶段超过400字的不准提」+ 2026-10-22「不许超」那两句话，
 * 与 `tools/proposal-file.mjs` 的 `PROPOSAL_MAX_CHARS` 是同一个 400。
 *
 * 两处各有一份是刻意的（那个工具走 `proposalFileVerdict`，不进 `importVerdict`），代价被两头钉住：
 * `MTC-01` / `MTC-02` 钉这一份（400 收 / 401 拒 ⇒ 只能是 400），`MTC-03` 钉工具那一份 —— 任何一份被改，
 * 对应用例会红。改这个数**必须同批**改那条老闸，否则库与工具会活成两个上限。
 */
export const BODY_MAX_CHARS = 400

const HEX64_RE = /^[0-9a-f]{64}$/i
const VERSION_RE = /^v\d+$/

/** 内容哈希：对规范化 JSON 取 sha256（键按字典序、无空白 —— 同一份 payload 永远同一个值）。 */
export function contentShaOf(payload) {
  return sha256Hex(stableStringify(payload ?? null))
}

/**
 * 读池子。**一行坏就整体 `E_DATA_CORRUPT`** —— 不跳过坏行（跳过等于把"少了一条"读成"本来就没有"）。
 */
export function readPool(root) {
  const file = poolPath(root)
  let text = null
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: true, code: null, entries: [], path: file, message: '' }
    return { ok: false, code: 'E_TXN_IO', entries: [], path: file, message: `候选池读不到（${err?.code ?? 'UNKNOWN'}）：${file}` }
  }
  const entries = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (line === '') continue
    try {
      const record = JSON.parse(line)
      if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new Error('不是一个对象')
      entries.push(record)
    } catch (err) {
      return { ok: false, code: 'E_DATA_CORRUPT', entries: [], path: file, message: `候选池第 ${i + 1} 行不是合法 JSON：${String(err?.message).slice(0, 120)}` }
    }
  }
  return { ok: true, code: null, entries, path: file, message: '' }
}

/**
 * 读「已判」索引 `<root>/proposals/judged.jsonl`（T-MEM-07）。
 *
 * 与 `readPool` 三条同形：文件不存在是**合法空态**（`rows: []`，不是错误）；
 * 一行坏就整体 `E_DATA_CORRUPT`（**不跳行** —— 跳过等于把"索引少了一条"读成"本来就没判过"）；
 * 读失败（不是 ENOENT，比如那一格是目录）⇒ `E_TXN_IO`。
 */
export function readJudged(root) {
  const file = judgedPath(root)
  let text = null
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: true, code: null, rows: [], path: file, message: '' }
    return { ok: false, code: 'E_TXN_IO', rows: [], path: file, message: `已判索引读不到（${err?.code ?? 'UNKNOWN'}）：${file}` }
  }
  const rows = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (line === '') continue
    try {
      const record = JSON.parse(line)
      if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new Error('不是一个对象')
      rows.push(record)
    } catch (err) {
      return { ok: false, code: 'E_DATA_CORRUPT', rows: [], path: file, message: `已判索引第 ${i + 1} 行不是合法 JSON：${String(err?.message).slice(0, 120)}` }
    }
  }
  return { ok: true, code: null, rows, path: file, message: '' }
}

/**
 * **append-only 追加 N 行**到「已判」索引（T-MEM-07；持索引自己的锁）。
 *
 * `rows` 是**不含 `seq`** 的行（形状见契约 §2.2），`seq` 在这里按"追加前的非空行数 + 1"发号 ——
 * 那是**本索引自己的序号**（`MEM-11` 钉着它），与池子的号是两套（池子见 `seqCeilingOf`；两边不互推）。
 *
 * 落地形状照 `appendProposal`：已有行原样 + 新行，同目录临时件 + rename 原子写回。
 * 空数组 ⇒ **什么都不做**（空候选批不许为了"有文件"写一行空的）。
 */
export function appendJudgedRows(root, rows = []) {
  const specs = Array.isArray(rows) ? rows : []
  const file = judgedPath(root)
  if (specs.length === 0) return { ok: true, code: null, rows: 0, path: file, start_seq: null, end_seq: null, message: '' }
  mkdirSync(proposalsDir(root), { recursive: true })
  const lock = acquireLock(judgedLockPath(root), { purpose: 'judged-index' })
  if (!lock.ok) throw brainError(lock.code, `已判索引锁拿不到：${lock.message}`)
  try {
    const current = readJudged(root)
    if (!current.ok) throw brainError(current.code, current.message, { path: current.path })
    const startSeq = current.rows.length + 1
    const next = specs.map((spec, i) => ({ ...spec, seq: startSeq + i }))
    const head = current.rows.map((r) => JSON.stringify(r)).join('\n')
    const tail = next.map((r) => JSON.stringify(r)).join('\n')
    const text = `${head}${head === '' ? '' : '\n'}${tail}\n`
    const written = writeFileAtomic(current.path, text)
    if (!written.ok) throw brainError(written.code, `已判索引追加失败：${written.message}`, { path: current.path })
    return {
      ok: true, code: null, rows: next.length, path: current.path,
      start_seq: startSeq, end_seq: startSeq + next.length - 1, bytes: written.bytes, message: '',
    }
  } finally {
    releaseLock(judgedLockPath(root))
  }
}

/** 形状层：`source` / `sha256` / `base_snapshot` / `update_generation` / `review_attempt` / `payload`。 */
export function shapeVerdict(payload) {
  const p = payload ?? {}
  if (typeof p.source !== 'string' || p.source.trim() === '') return { ok: false, code: 'E_ARG_SCHEMA', message: 'source 必填（非空字符串）—— 候选必须指得出它是从哪份草稿来的' }
  if (p.payload === null || typeof p.payload !== 'object' || Array.isArray(p.payload)) return { ok: false, code: 'E_ARG_SCHEMA', message: 'payload 必填（对象）' }
  if (typeof p.sha256 !== 'string' || p.sha256.trim() === '') return { ok: false, code: 'E_ARG_SCHEMA', message: 'sha256 必填' }
  if (!HEX64_RE.test(p.sha256.trim())) return { ok: false, code: 'E_ARG_HASH', message: `sha256 必须是 64 hex，实得 ${JSON.stringify(String(p.sha256).slice(0, 40))}` }
  if (typeof p.base_snapshot !== 'string' || !VERSION_RE.test(p.base_snapshot.trim())) return { ok: false, code: 'E_ARG_SCHEMA', message: `base_snapshot 必须是 v<n>，实得 ${JSON.stringify(p.base_snapshot)}` }
  if (!Number.isInteger(p.update_generation) || p.update_generation < 1) return { ok: false, code: 'E_ARG_SCHEMA', message: `update_generation 必须是 ≥1 的整数，实得 ${JSON.stringify(p.update_generation)}` }
  if (!Number.isInteger(p.review_attempt) || p.review_attempt < 1) return { ok: false, code: 'E_ARG_SCHEMA', message: `review_attempt 必须是 ≥1 的整数，实得 ${JSON.stringify(p.review_attempt)}` }
  return { ok: true, code: null, message: '' }
}

/** 普通提案白名单：`payload.op` / `payload.kind` 只许 `add` / `modify`（缺省 = add）。 */
export function ordinaryKindVerdict(payload) {
  const inner = payload?.payload ?? {}
  const kind = inner.op ?? inner.kind ?? null
  if (kind === null || kind === undefined) return { ok: true, code: null, message: '' }
  if (ORDINARY_ALLOWED_KINDS.includes(kind)) return { ok: true, code: null, message: '' }
  const named = ORDINARY_FORBIDDEN_KINDS.includes(kind) ? `（${kind} 只能走"复核 → 次日判决"）` : ''
  return { ok: false, code: 'E_ARG_SCHEMA', message: `普通提案只许 add / modify，实得 kind=${JSON.stringify(kind)}${named}` }
}

/** 同一个来源的第二次导入：原文不许被改过。 */
export function priorImportVerdict(poolEntries, { source, sha256, contentSha256 }) {
  const same = (Array.isArray(poolEntries) ? poolEntries : []).filter((e) => e?.source === source)
  if (same.length === 0) return { ok: true, code: null, message: '' }
  for (const prior of same) {
    if (String(prior.sha256).toLowerCase() !== String(sha256).toLowerCase()) {
      return { ok: false, code: 'E_ARG_HASH', message: `同一个来源（${source}）已经用另一个哈希导入过（${prior.sha256} ≠ ${sha256}）—— 组长不得修改原文` }
    }
    if (prior.content_sha256 && prior.content_sha256 !== contentSha256) {
      return { ok: false, code: 'E_ARG_HASH', message: `同一个来源（${source}）声明的哈希一样、内容却变了（内容哈希 ${prior.content_sha256.slice(0, 12)}… ≠ ${contentSha256.slice(0, 12)}…）—— 声明与内容对不上` }
    }
  }
  return { ok: true, code: null, message: '' }
}

/**
 * fence：这一份候选属于哪一轮。
 *
 * @param {object} payload 导入请求
 * @param {object|null} state 共享更新状态（`null` = 根上还没开工）
 * @param {string[]} existingVersions 盘上现有的快照版本
 */
export function fenceVerdict(payload, state, existingVersions) {
  const expectedGeneration = state ? state.generation : 1
  if (payload.update_generation !== expectedGeneration) {
    return { ok: false, code: 'E_FENCE_STALE', message: `update_generation=${payload.update_generation} 与当前那一轮（${expectedGeneration}）对不上` }
  }
  const maxAttempt = state ? state.review_attempt + 1 : 1
  if (payload.review_attempt < 1 || payload.review_attempt > maxAttempt) {
    return { ok: false, code: 'E_FENCE_STALE', message: `review_attempt=${payload.review_attempt} 超出当前那一轮允许的范围（1..${maxAttempt}）` }
  }
  const versions = Array.isArray(existingVersions) ? existingVersions : []
  if (versions.length > 0 && !versions.includes(payload.base_snapshot)) {
    return { ok: false, code: 'E_FENCE_STALE', message: `base_snapshot=${payload.base_snapshot} 不是盘上存在的快照（现有：${versions.join(' / ')}）` }
  }
  return { ok: true, code: null, message: '' }
}

/**
 * **正文长度闸**（`F-125`）：`payload.entry.text` 与 `payload.engine_ops[].entry.text` 都不许超过
 * `BODY_MAX_CHARS`（400 收 / 401 拒）。`payload` 是**信封**（`importVerdict` 收到的那个），正文住在它的 `.payload` 里。
 *
 * 三件写进判据的事：
 *   ① **查两处**：真维护案的正文住在 `payload.engine_ops[].entry.text`（modify / merge 的目标），
 *      普通提案与顶层维护案住在 `payload.entry.text` —— 只查一处，就等于"换个入口继续漏"。
 *   ② **逐个查 engine_ops**，不是只看第一条（超长的那一条排第二也得抓）；`retire` 这类操作**没有 `entry`**
 *      ⇒ 跳过（每天在跑的纯退休案不许被误伤，这里也不许因为读 `entry.text` 抛出）。
 *   ③ **尺子只有一把**：`lib/memory.mjs::charCountOf`（去开头 BOM → `\r\n`/`\r` 归一成 `\n` → 数 code point）。
 *      用它而不是 `String.length`，所以 `"\uFEFF" + 400 字` 与 `300 字 + 100 个 \r\n` 都算 400（该收）。
 *
 * 只卡入口、不扫存量（F-72）：已被收进库的长条目靠复核重写，不靠拒收。
 * @param {object} payload 导入信封（`{source, sha256, payload: {entry?, engine_ops?}, …}`）
 * @param {string} kind `maintenance` / `proposal`（只影响报文怎么称呼这份案，不决定闸开不开）
 * @returns {{ok:true, code:null, message:string}|{ok:false, code:'E_PROPOSAL_TOO_LONG', message:string}}
 */
function bodyCapVerdict(payload, kind) {
  const inner = payload?.payload ?? {}
  const label = kind === 'maintenance' ? '维护案' : '普通提案'
  const overlong = []
  const entryText = inner?.entry?.text
  if (typeof entryText === 'string') {
    const n = charCountOf(entryText)
    if (n > BODY_MAX_CHARS) overlong.push({ at: 'payload.entry', chars: n })
  }
  const ops = Array.isArray(inner?.engine_ops) ? inner.engine_ops : []
  for (let i = 0; i < ops.length; i += 1) {
    const text = ops[i]?.entry?.text
    if (typeof text !== 'string') continue
    const n = charCountOf(text)
    if (n > BODY_MAX_CHARS) overlong.push({ at: `payload.engine_ops[${i}].entry`, chars: n })
  }
  if (overlong.length === 0) return { ok: true, code: null, message: '' }
  const spots = overlong.map((o) => `${o.at}（${o.chars} 字）`).join(' / ')
  return {
    ok: false,
    code: 'E_PROPOSAL_TOO_LONG',
    message: `${label}正文太长，不收：${spots} —— 每条正文上限 ${BODY_MAX_CHARS} 字（实测超了 ${overlong[0].chars - BODY_MAX_CHARS} 字）。`
      + `入口只卡新导入、不扫存量（F-72）；请把「事实 + 判据」留下，把来历 / 推导 / 现场读数挪进当天的 log.md 再导。`,
  }
}

/**
 * 四道闸门按**冻结顺序**跑一遍，返回第一个不过的。
 * 顺序：形状 → 普通提案白名单 → **正文长度** → 原文一致（声明的哈希 vs 内容）→ fence。
 * （`sha256` 的**形状**在形状那一层就查了。）
 *
 * 长度那一关排在这里的两个理由：
 *   · **在形状之后**：连 `payload.payload` 都不成形状时，谈"哪一段正文超了"没有意义；
 *   · **在普通提案白名单之后**：普通提案带 `delete` / `merge` 时，原有的 `E_ARG_SCHEMA`（"这条路根本不该走"）
 *     比"正文超长"更该先报 —— 那一格的诊断次序不动。维护案没有白名单，于是它紧挨着形状。
 * 次序本身**不是判据**（`CONTRACT.md §8.1`）：只判"该拒的拒了、该收的收了"。
 */
export function importVerdict({ payload, state, poolEntries, existingVersions, kind }) {
  const shape = shapeVerdict(payload)
  if (!shape.ok) return shape
  if (kind !== 'maintenance') {
    const ordinary = ordinaryKindVerdict(payload)
    if (!ordinary.ok) return ordinary
  }
  const cap = bodyCapVerdict(payload, kind)
  if (!cap.ok) return cap
  const contentSha256 = contentShaOf(payload.payload)
  const prior = priorImportVerdict(poolEntries, { source: payload.source, sha256: payload.sha256, contentSha256 })
  if (!prior.ok) return prior
  const fence = fenceVerdict(payload, state, existingVersions)
  if (!fence.ok) return fence
  return { ok: true, code: null, message: '', contentSha256 }
}

/** 池子里现有几条（**不是**发号依据 —— 号由 `seqCeilingOf` 按"已经发出去过哪些号"定）。 */
export function poolSize(root) {
  const pool = readPool(root)
  return pool.ok ? pool.entries.length : 0
}

/**
 * **池子行 / 条目的发号口径**：`<kind>-<YYYYMMDD>-<seq:04>`。
 * 只有这一处拼它 —— `appendProposal` 与 `appendProposalDeduped` 必须是同一套号。
 * `seq` 的**值**由 `seqCeilingOf` 定（不是"池子现在第几行"）。
 */
function poolIdOf(kind, day, seq) {
  return `${kind}-${String(day).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`
}

/**
 * `proposal-20261014-0003` / `maintenance-20261019-0031` ⇒ `{day:'20261014', seq:3}`（认不出 ⇒ `null`）。
 *
 * 为什么认 id 里的那 8 位日子：那是**发号那一刻的日**。`imported_at` 记的是调用方给的时刻
 * （`proposal_file` 允许传，用例里更是钉死的），两者正常一致；不一致时"这个号属于哪一天"由 id 说了算。
 */
function idDrawOf(importedId) {
  const m = /-(\d{8})-(\d+)$/.exec(String(importedId ?? ''))
  if (m === null) return null
  const seq = Number(m[2])
  return Number.isSafeInteger(seq) && seq > 0 ? { day: m[1], seq } : null
}

/** 一行记录的短预览（≤120 字）：报"哪一条读不出 `imported_id`"时要能看见它长什么样。 */
function previewOf(record) {
  let text
  try {
    text = JSON.stringify(record)
  } catch {
    text = undefined
  }
  if (typeof text !== 'string') text = String(record)
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

/**
 * 归档里发过的号：`proposals/archive/*.jsonl` 每行的 `imported_id`。
 *
 * 🔴 只读**内容**，不许看文件名：盘上真有一份 `pool-judged-2026-10-18.jsonl` 装着 20261017 的 id，
 * 还有一份 `pool-judged-20261019-0032-20261019-0031.jsonl` —— 首 id 比末 id **大**。
 * 名字里的日期是**清池日**，不是发号日。
 * 只认 `.jsonl`：`MANIFEST*.json` 是清单不是流水；`pool.jsonl.bak-*` 在上一层目录，不是账。
 *
 * 一行坏（不是合法 JSON，**或解析得出但读不出 `imported_id`**）⇒ 整体 `E_DATA_CORRUPT`
 * （与 `readPool` 同一条政策：跳过坏行 = 把"这里少了一个号"读成"这个号没用过"，然后重号）。
 */
function readArchiveDraws(root) {
  const dir = proposalsArchiveDir(root)
  let names = []
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((ent) => ent.isFile() && ent.name.endsWith('.jsonl'))
      .map((ent) => ent.name)
      .sort()
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: true, code: null, draws: [], message: '' }
    return { ok: false, code: 'E_TXN_IO', draws: [], message: `归档目录读不到（${err?.code ?? 'UNKNOWN'}）：${dir}` }
  }
  const draws = []
  for (const name of names) {
    const file = path.join(dir, name)
    let text = null
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      return { ok: false, code: 'E_TXN_IO', draws: [], message: `归档读不到（${err?.code ?? 'UNKNOWN'}）：${file}` }
    }
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim()
      if (line === '') continue
      let row = null
      try {
        row = JSON.parse(line)
      } catch (err) {
        return {
          ok: false, code: 'E_DATA_CORRUPT', draws: [],
          message: `归档 ${name} 第 ${i + 1} 行不是合法 JSON：${String(err?.message).slice(0, 120)}`,
        }
      }
      const draw = idDrawOf(row?.imported_id)
      // 🔴 解析得出但**读不出 `imported_id`**（`null` / 数组 / `{"schema":1}` 这类）也是坏行 ——
      //    与 `bin/agenia-brain.mjs` 的 `uniqueIdsOf`（T-MEM-10：一律整体拒，绝不静默丢弃）同一口径。
      //    跳过它 = 把"这里少了一个号"读成"这个号没用过"，然后重号。
      if (draw === null) {
        return {
          ok: false, code: 'E_DATA_CORRUPT', draws: [],
          message: `归档 ${name} 第 ${i + 1} 行读不出 imported_id（这一行：${previewOf(row)}）—— 整体拒`,
        }
      }
      draws.push(draw)
    }
  }
  return { ok: true, code: null, draws, message: '' }
}

/**
 * **发号的上界**：`max(池子里已占的最大号, 当天已用过的最大号)` —— 两个发号点共用这一处。
 *
 * 为什么不是"池子当前行数 + 1"（2026-10-20 的真现场）：清池把判过的行搬进 `proposals/archive/`
 * ⇒ 池子行数回落 ⇒ 号跟着回落 ⇒ 池子里长出两条同号
 * （`maintenance-20261020-0034` × 2 / `maintenance-20261020-0035` × 2）。
 * **号的依据是"已经发出去过哪些"，不是"池子现在有几行"。**
 *
 * 三处读数，都读**内容**：
 *   · `proposals/pool.jsonl` —— 承重：清池之后留下的那几行还在池子里，号要从它们上面接着数。
 *   · `proposals/archive/*.jsonl` —— 承重：今天判过的行被搬走了，那些号**只活在归档里**
 *     （2026-10-20 盘上：4 份 / 300 行 / 298 个 id，其中 113 个 id 不在 judged 里）。
 *   · `proposals/judged.jsonl` —— **不承重**（今天对今天的行一条都没有；它也不是唯一副本）：
 *     留着只为"已经被判走的那几行也不许重号"这一层冗余。
 *     ⚠️ 它行里的 `seq` 是**已判索引自己的序号**（从 1 数，2026-10-20 盘上 187 行与 id 里的号
 *     **187/187 全不一致**），不是池子的号 ⇒ 这一处只认 `imported_id` 里的号。
 *
 * 池子那一项**不按天**：`seq` 是**池内单调递增的编号**（导入的先后），跨天从 1 重数会让昨天的行排到新行后面（判序倒退）。
 * 归档 / 已判两项**按天**（取 `imported_id` 里那 8 位日子）：清池只发生在当天，旧归档里的号属于旧的那天。
 * `day` 认不出 8 位日子 ⇒ 按"全部已发号"算（**宁可跳号，不许重号**）。
 *
 * 🔴 只在**池子锁里**调用：读最大号与写新行之间不许有缝（否则两个进程会拿到同一个号）。
 *
 * 🔴 **代价（写在明处，别让下一个人自己撞上）**：发号现在要求 `pool + archive + judged` **全部可解析** ——
 *   **一行坏 = 今天所有候选一个号都发不出**（包括用来修它的那一条维护案）。修法只有一条：
 *   **手改盘上那一行**（补 `imported_id`，或删掉半行）。这是刻意的：宁可不发号，也不发重号。
 *   读的量随历史线性长（2026-10-20：归档 300 行 + 已判 187 行 ≈ 2 ms/次）；而池子锁的 `ttl_ms` 是
 *   **60 s** —— 那是**锁的上限，不是读的上限**：读慢到超过它，别处的锁判据会把这把锁判过期。
 *
 * 🔴 **并发这一格只管"两个发号者"**（别把话说大）：
 *   · `--force-recover` 顶不掉**活着且没过期**的锁 —— 单靠 TTL 那一侧只会回 `E_LOCK_STALE`
 *     （要人点头才回收）：**失败，不重号**。
 *   · **清池那一路不在锁里**（`presets/` 里没有清池实现，是手/外部脚本 `.tools/_scratch/pool-archive.mjs`）。
 *     它先 `:40` 读池、`:103` 写归档、`:104` **整份重写池子**。发号那一侧也是**整份重写**（`poolTextWith`），
 *     两个写者互不知情 ⇒ **谁后写谁赢**。于是有三条活口子，大小都写在这儿：
 *       ① **丢一条**：清池在 `:40` 读到的那一版与 `:104` 整份重写之间，并发追加的那一条会被**吞掉** ——
 *          模型的回话已经说了 `ok` 和一个号，盘上却没有这一条。
 *       ② **看不见的重号**：被吞的那一条若**当时是最大号**，它的号就只活在那个被吞掉的条目里
 *          （池子、归档、已判三本账都没有它）⇒ **下一次发号会把同一个号再发一遍**。
 *          这才是这一票要治的病，只是换了个入口。
 *       ③ **复活**：发号若后写（它也整份重写），会把自己 `readPool` 那一刻的条目写回去
 *          ⇒ **清池刚搬进归档的那几条又出现在池子里**（同一条在两个文件里各一份）。
 *     这一票没治它（清池不在 preset 里，越界）；要治只有一条路：**把清池挪进同一把池子锁**（另票）。
 *
 * @param {string} root 脑根
 * @param {{poolEntries: Array, day: string}} spec `poolEntries` = 锁里刚读到的池子行（不在这里重读）
 * @returns {{ok: true, code: null, max: number, sources: object, message: string}
 *   | {ok: false, code: string, max: number, message: string}} `max` = 已占的最大号（空池 / 空归档 ⇒ `0`）
 */
function seqCeilingOf(root, { poolEntries, day } = {}) {
  let poolMax = 0
  for (const row of Array.isArray(poolEntries) ? poolEntries : []) {
    // 一条有两个号来源（`seq` 字段 / `imported_id` 里那几位）—— 取大的：少算一个就要重号。
    // 🔴 `seq` 可能是**字符串**（老数据 / 手改过的池子 —— `bin/agenia-brain.mjs` 的 `judge-pending`
    //    亲口承认过这一格，见 `契约-T-MEM-07.md` §7.3）：先过 `Number()` 再判，别把 "999" 当 0。
    const rawField = row?.seq
    const fieldNum = (typeof rawField === 'number' || typeof rawField === 'string') ? Number(rawField) : Number.NaN
    const byField = Number.isSafeInteger(fieldNum) && fieldNum > 0 ? fieldNum : 0
    const byId = idDrawOf(row?.imported_id)?.seq ?? 0
    const own = Math.max(byField, byId)
    if (own > poolMax) poolMax = own
  }
  // ⚠️ 池子这一路**不拒**"读不出号"的条目（归档与已判两处会拒）—— 理由两条：
  //    ① 一条池子记录身上只有两个地方能装号（`seq` 字段 / `imported_id` 里那 4 位），两处都读不出
  //       ⇒ 它**本来就没带号**，跳过它不会少算任何一个号；
  //    ② 它就在池子里、一眼看得见，`judge-pending` 那边也会因为"读不出 `imported_id`"整体拒
  //       （T-MEM-10 · 契约 §八）—— 那时由人来修，不必让"发一条新候选"先替历史账做守门人。
  //    对照：归档 / 已判是**历史**，跳过一条就永远少一个号（后面还会重号）⇒ 那两处必须拒。

  const archive = readArchiveDraws(root)
  if (!archive.ok) return { ok: false, code: archive.code, max: 0, message: archive.message }
  const judged = readJudged(root)
  if (!judged.ok) return { ok: false, code: judged.code, max: 0, message: judged.message }

  const raw = String(day ?? '').replace(/-/g, '')
  const dayKey = /^\d{8}$/.test(raw) ? raw : null
  const sameDay = (draw) => dayKey === null || draw.day === dayKey

  let archiveMax = 0
  for (const draw of archive.draws) if (sameDay(draw) && draw.seq > archiveMax) archiveMax = draw.seq
  let judgedMax = 0
  for (let i = 0; i < judged.rows.length; i += 1) {
    const draw = idDrawOf(judged.rows[i]?.imported_id)
    // 🔴 同一条口径（T-MEM-10）：索引里有**一条**记录读不出 `imported_id` ⇒ 整体拒。
    //    报文点"第几条非空记录" + **那一条**的预览（空行在 `readJudged` 那一层已经被丢掉了
    //    ⇒ 这里的序号是**非空记录**的序号，不冒充文件行号）。
    if (draw === null) {
      return {
        ok: false, code: 'E_DATA_CORRUPT', max: 0,
        message: `已判索引（${judged.path}）第 ${i + 1} 条非空记录读不出 imported_id（这一条：${previewOf(judged.rows[i])}）—— 整体拒`,
      }
    }
    if (sameDay(draw) && draw.seq > judgedMax) judgedMax = draw.seq
  }
  return {
    ok: true,
    code: null,
    message: '',
    max: Math.max(poolMax, archiveMax, judgedMax),
    /** 读数：这三个数各自是多少（号突然跳了，靠它看是哪一处抬高的）。 */
    sources: { pool: poolMax, archive_today: archiveMax, judged_today: judgedMax, day: dayKey },
  }
}

/**
 * **一条池子记录**（只有这一处拼它）。
 *
 * 为什么单独拎出来：`--op proposal-import` 写出来的行与 `proposal_file` 工具写出来的行
 * 必须**逐字同形**（`readPool` / `opJudgePending` / `priorImportVerdict` / 判决那一侧
 * 都按这些名字读）。两处各拼一遍 = 第二个来源，迟早分叉。
 */
function poolRecordOf(spec) {
  const {
    kind, importedId, at, seq, source, sha256, contentSha256,
    baseSnapshot, updateGeneration, reviewAttempt, payload,
  } = spec
  return {
    schema: POOL_SCHEMA,
    kind,
    imported_id: importedId,
    imported_at: at,
    seq,
    source,
    sha256: String(sha256).toLowerCase(),
    content_sha256: contentSha256,
    base_snapshot: baseSnapshot,
    update_generation: updateGeneration,
    review_attempt: reviewAttempt,
    payload,
  }
}

/** 追加后的整份池子文本：**已有行原样** + 新的一行（最后一行也带 `\n`）。 */
function poolTextWith(pool, record) {
  const head = pool.entries.map((e) => JSON.stringify(e)).join('\n')
  return `${head}${head === '' ? '' : '\n'}${JSON.stringify(record)}\n`
}

/**
 * 判重：池子里有没有「**同一句 `source` 且同一段正文**」的那一条。
 *
 * 判重键是 `(source, sha256(text))` —— **不是** `priorImportVerdict` 那一支。
 * 那一支是**草稿完整性**规则（同一个 source 第二次导入、声明哈希不同 ⇒ `E_ARG_HASH`），
 * 与"同一个出处换了内容再来 ⇒ 必须收"正好相反。两条规则各有各的用处，别互相顶替。
 *
 * 同内容、不同出处 ⇒ **不算重复**（出处不同就是两条不同的引用事实）。
 *
 * @param {Array} poolEntries `readPool` 的 `entries`
 * @param {{source: string, sha256: string}} key
 * @returns {object|null} 命中的那一条（原样返回，报文要它的 `imported_id` / `seq`）
 */
export function duplicateProposalOf(poolEntries, { source, sha256 } = {}) {
  const want = String(sha256 ?? '').toLowerCase()
  return (Array.isArray(poolEntries) ? poolEntries : [])
    .find((e) => e?.source === source && String(e?.sha256).toLowerCase() === want) ?? null
}

/**
 * 池子锁的**有界等待**：每 `retryMs` 重抢一次，累计不超过 `waitMs`。
 *
 * 为什么要在这里等（`acquireLock` 自己不替调用方等）：活人占着锁该怎么等，是**调用方**的事
 * （`lib/atomic.mjs` 那一段注释写着；`acquireDayLock` 有预算循环、route / brain 立刻拒）。
 * 改 `acquireLock` 去替所有人等，会改掉那两处的时序。
 *
 * `E_LOCK_STALE` **不等** —— 持有者已经死了/过期了，再等也不会自己变好；那是要人点头才回收的一格。
 *
 * 为什么 `await` 而不是同步睡：这个函数在**工具调用里**跑，同步阻塞最多 2 秒会把整个
 * 事件循环（别的会话、别的工具）一起顶住。
 */
async function acquirePoolLock(root, { waitMs = 2000, retryMs = 50 } = {}) {
  const deadline = Date.now() + waitMs
  for (;;) {
    const lock = acquireLock(poolLockPath(root), { purpose: 'proposal-pool' })
    if (lock.ok) return lock
    if (lock.code === 'E_LOCK_STALE') return lock
    if (Date.now() >= deadline) return lock
    await new Promise((resolve) => { setTimeout(resolve, retryMs) })
  }
}

/**
 * **读池 → 判重 → 发号 → 原子追加，全在**一次** `acquireLock` 里**（一个动作 = 一条候选）。
 *
 * 为什么不"先自己拿锁、再调 `appendProposal`"：`appendProposal` 自己会拿同一把锁，
 * `openSync(...,'wx')` 不可重入 ⇒ 自己撞自己（第二次直接 `E_LOCK_HELD`）。
 * 为什么不"先无锁读池判重、再追加"：两次调用之间有一个窗口，两个并发调用都能通过判重，
 * 于是池子里长出两条同源候选 —— 这个函数存在就是为了关掉那个窗口。
 *
 * 落地形状与 `appendProposal` 完全一致（同一套发号、同一份记录拼装、同一条原子写路径）：
 * 已有行原样 + 新的一行，同目录临时件 + rename 写回。**不走追加写**（追加写在崩溃时会留半行，
 * 而半行让整份池子 `E_DATA_CORRUPT`）。
 *
 * 错误一律**返回**（不抛）：调用方要把 `E_PROPOSAL_DUPLICATE` 与"写不进去"分开报，
 * 而两者都不是"程序坏了"。
 *
 * @param {string} root 脑根
 * @param {object} spec `{kind?, source, sha256, day, at, payloadOf|payload, baseSnapshot?, updateGeneration?, reviewAttempt?}`
 *   · `payloadOf({seq, imported_id, entry_id})` —— 入池的 `payload`（编号要在锁里才定得下来，所以收函数）
 * @param {{waitMs?: number, retryMs?: number}} [options] 锁等待预算
 * @returns {Promise<object>} 成功 `{ok:true, imported_id, entry_id, imported_at, path, seq, content_sha256, …}`
 *   · 重复 `{ok:false, code:'E_PROPOSAL_DUPLICATE', message, existing}`
 *   · 写不进去 `{ok:false, code: <底层码>, message}`（`E_LOCK_HELD` / `E_LOCK_STALE` / `E_TXN_IO` / `E_DATA_CORRUPT`）
 */
export async function appendProposalDeduped(root, spec = {}, options = {}) {
  const {
    kind = 'proposal', source, sha256, payload: givenPayload, payloadOf,
    day, at, baseSnapshot = null, updateGeneration = null, reviewAttempt = null,
  } = spec
  // 🔴 这里**不** `mkdirSync`（原来那一行在锁外：权限不足 / 路径是个文件时抛的是裸 `EACCES`/`EEXIST`，
  //    报文不以码开头，`proposalFileRun` 那边接不住 —— 评审 R8）。
  //    两处建目录都在库里面，而且都**返回**码、不抛：
  //      · 锁目录 —— `acquireLock` 自己建，建不出来返回 `E_TXN_IO`；
  //      · 池子目录 —— `writeFileAtomic` 自己建，建不出来返回 `E_TXN_IO`。
  //    ⇒ 这一层于是没有任何"锁外的裸 fs 调用"；两种失败都变成返回码，工具那边折成 `E_PROPOSAL_IO`。
  const lock = await acquirePoolLock(root, options)
  if (!lock.ok) {
    return { ok: false, code: lock.code, message: `候选池锁拿不到：${lock.message}`, info: lock.info ?? null }
  }
  try {
    const pool = readPool(root)
    if (!pool.ok) return { ok: false, code: pool.code, message: pool.message, path: pool.path }
    const prior = duplicateProposalOf(pool.entries, { source, sha256 })
    if (prior !== null) {
      return {
        ok: false,
        code: 'E_PROPOSAL_DUPLICATE',
        message: `候选池里已经有「同一句出处 + 同一段正文」的那一条：${prior.imported_id}（池子编号 ${prior.seq}：池内单调递增、清池后不回落、不是行号）`,
        existing: prior,
        path: pool.path,
      }
    }
    const ceiling = seqCeilingOf(root, { poolEntries: pool.entries, day })
    if (!ceiling.ok) return { ok: false, code: ceiling.code, message: ceiling.message, path: pool.path }
    const seq = ceiling.max + 1
    const importedId = poolIdOf(kind, day, seq)
    // `entry.id` 与 `imported_id` 是**同一个号**，只换前缀（`proposal` → `cand`）。
    const entryId = poolIdOf('cand', day, seq)
    const payload = typeof payloadOf === 'function'
      ? payloadOf({ seq, imported_id: importedId, entry_id: entryId })
      : givenPayload
    const record = poolRecordOf({
      kind,
      importedId,
      at,
      seq,
      source,
      sha256,
      contentSha256: contentShaOf(payload),
      baseSnapshot,
      updateGeneration,
      reviewAttempt,
      payload,
    })
    const written = writeFileAtomic(pool.path, poolTextWith(pool, record))
    if (!written.ok) {
      return { ok: false, code: written.code, message: `候选池追加失败：${written.message}`, path: pool.path }
    }
    return {
      ok: true,
      code: null,
      imported_id: importedId,
      entry_id: entryId,
      imported_at: at,
      path: pool.path,
      seq,
      content_sha256: record.content_sha256,
      sha256: record.sha256,
      source,
      kind,
      payload,
      bytes: written.bytes,
    }
  } finally {
    releaseLock(poolLockPath(root))
  }
}

/**
 * **append-only 追加一行**（持池子锁）。
 *
 * 追加的落地形状：把"已有行原样 + 新的一行"原子写回（同目录临时件 + rename）。
 * 为什么不用 `appendFileSync`：那一条在崩溃/断电时会留下**半行**，而半行会让整份池子变成
 * `E_DATA_CORRUPT`（读池子不许跳坏行）。持锁 + 原子写换来的代价只是一次小文件重写。
 *
 * @param {string} root
 * @param {object} spec `{kind, source, sha256, contentSha256, baseSnapshot, updateGeneration, reviewAttempt, payload, day, at}`
 */
export function appendProposal(root, spec = {}) {
  const {
    kind = 'proposal', source, sha256, contentSha256, baseSnapshot,
    updateGeneration, reviewAttempt, payload, day, at,
  } = spec
  mkdirSync(proposalsDir(root), { recursive: true })
  const lock = acquireLock(poolLockPath(root), { purpose: 'proposal-pool' })
  if (!lock.ok) throw brainError(lock.code, `候选池锁拿不到：${lock.message}`)
  try {
    const pool = readPool(root)
    if (!pool.ok) throw brainError(pool.code, pool.message, { path: pool.path })
    const ceiling = seqCeilingOf(root, { poolEntries: pool.entries, day })
    if (!ceiling.ok) throw brainError(ceiling.code, ceiling.message, { path: pool.path })
    const seq = ceiling.max + 1
    const importedId = poolIdOf(kind, day, seq)
    const record = poolRecordOf({
      kind, importedId, at, seq, source, sha256, contentSha256,
      baseSnapshot, updateGeneration, reviewAttempt, payload,
    })
    const written = writeFileAtomic(pool.path, poolTextWith(pool, record))
    if (!written.ok) throw brainError(written.code, `候选池追加失败：${written.message}`, { path: pool.path })
    return { ok: true, code: null, imported_id: importedId, imported_at: at, path: pool.path, seq, bytes: written.bytes }
  } finally {
    releaseLock(poolLockPath(root))
  }
}

/** 池子里某一类记录（探针/报告用）。 */
export function poolByKind(root, kind) {
  const pool = readPool(root)
  if (!pool.ok) return []
  return pool.entries.filter((e) => e?.kind === kind)
}
