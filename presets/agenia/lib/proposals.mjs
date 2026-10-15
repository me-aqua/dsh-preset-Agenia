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
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { acquireLock, releaseLock, writeFileAtomic } from './atomic.mjs'
import { sha256Hex, stableStringify, brainError, poolLockPath, poolPath, proposalsDir } from './state.mjs'
import { listVersions } from './snapshot.mjs'

/** 池子行的 schema。 */
export const POOL_SCHEMA = 1

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
    const importedId = `${kind}-${String(day).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`
    const record = {
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
    const head = pool.entries.map((e) => JSON.stringify(e)).join('\n')
    const text = `${head}${head === '' ? '' : '\n'}${JSON.stringify(record)}\n`
    const written = writeFileAtomic(pool.path, text)
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
