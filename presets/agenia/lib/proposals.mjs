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
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { acquireLock, releaseLock, writeFileAtomic } from './atomic.mjs'
import { sha256Hex, stableStringify, brainError, judgedLockPath, judgedPath, poolLockPath, poolPath, proposalsDir } from './state.mjs'
import { listVersions } from './snapshot.mjs'

/** 池子行的 schema。 */
export const POOL_SCHEMA = 1

/** 「已判」索引行的 schema（T-MEM-07；当前恒 `1`）。 */
export const JUDGED_SCHEMA = 1

/** 普通提案允许的处置（其余一律走复核 → 次日判决）。 */
export const ORDINARY_ALLOWED_KINDS = Object.freeze(['add', 'modify'])

/** 普通提案里**明令禁止**的处置（MEM-12 的那六个；写在这儿是为了让报文能点名）。 */
export const ORDINARY_FORBIDDEN_KINDS = Object.freeze(['delete', 'remove', 'merge', 'retire', 'retag', 'cull'])

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
 * 与 `appendProposal` 给池子发号同一口径。同一轮的行**一次性写出去**（不会留下半轮索引）。
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
 * 四道闸门按**冻结顺序**跑一遍，返回第一个不过的。
 * 顺序：形状 → 普通提案白名单 → 原文一致（声明的哈希 vs 内容）→ fence。
 * （`sha256` 的**形状**在形状那一层就查了。）
 */
export function importVerdict({ payload, state, poolEntries, existingVersions, kind }) {
  const shape = shapeVerdict(payload)
  if (!shape.ok) return shape
  if (kind !== 'maintenance') {
    const ordinary = ordinaryKindVerdict(payload)
    if (!ordinary.ok) return ordinary
  }
  const contentSha256 = contentShaOf(payload.payload)
  const prior = priorImportVerdict(poolEntries, { source: payload.source, sha256: payload.sha256, contentSha256 })
  if (!prior.ok) return prior
  const fence = fenceVerdict(payload, state, existingVersions)
  if (!fence.ok) return fence
  return { ok: true, code: null, message: '', contentSha256 }
}

/** 池子里现有几条（`imported_id` 的序号从它来）。 */
export function poolSize(root) {
  const pool = readPool(root)
  return pool.ok ? pool.entries.length : 0
}

/**
 * **池子行 / 条目的发号口径**：`<kind>-<YYYYMMDD>-<seq:04>`（`seq` 从 1 数）。
 * 只有这一处拼它 —— `appendProposal` 与 `appendProposalDeduped` 必须是同一套号。
 */
function poolIdOf(kind, day, seq) {
  return `${kind}-${String(day).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`
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
 * 判重：池子里有没有「**同一句 `source` 且同一段正文**」的那一行。
 *
 * 判重键是 `(source, sha256(text))` —— **不是** `priorImportVerdict` 那一支。
 * 那一支是**草稿完整性**规则（同一个 source 第二次导入、声明哈希不同 ⇒ `E_ARG_HASH`），
 * 与"同一个出处换了内容再来 ⇒ 必须收"正好相反。两条规则各有各的用处，别互相顶替。
 *
 * 同内容、不同出处 ⇒ **不算重复**（出处不同就是两条不同的引用事实）。
 *
 * @param {Array} poolEntries `readPool` 的 `entries`
 * @param {{source: string, sha256: string}} key
 * @returns {object|null} 命中的那一行（原样返回，报文要它的 `imported_id` / `seq`）
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
        message: `候选池里已经有「同一句出处 + 同一段正文」的那一行：${prior.imported_id}（第 ${prior.seq} 行）`,
        existing: prior,
        path: pool.path,
      }
    }
    const seq = pool.entries.length + 1
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
    const seq = pool.entries.length + 1
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

/** 单条池子记录的落点（读面用；追加是整份重写，所以这里只是"它住在哪一行"的说明）。 */
export function poolLineOf(root, importedId) {
  const pool = readPool(root)
  if (!pool.ok) return null
  const index = pool.entries.findIndex((e) => e?.imported_id === importedId)
  return index < 0 ? null : { index, record: pool.entries[index], path: pool.path }
}
