/**
 * local project state —— 位置 · 形状 · 原子写 · 双评审 claim（提案 §B3.6 / §B3.7）。
 *
 * 冻结依据：提案 §B1.3（文件名）· §B1.5（`lib/local-state.mjs` = "local project state 读写 + claim"）·
 *   §B3.6（`<WS>\state\local\<day>.json` 的字段表 + "两场可并行、各自独立 claim"）·
 *   §B3.7（位置 · 原子写 · 锁 · 读-改-写全程持锁 · CAS）· 追加裁定 v1.2 C-5（`age >= lease` 即 stale）。
 *
 * 五条口径：
 *   ① **一天一文件、一场一把锁**：状态本体住 `<.team>\state\local\<day>.json`；
 *      每场（`memory_review` / `conversation` / `technical`）另有**自己那把** claim 锁；
 *      文件本身还有一把读-改-写锁（名字按 §B3.7 冻的是 `.local-<day>.lock`）。
 *   ② **写全走 `lib/atomic.mjs`**：临时件同目录 → `fsync` → `rename`；锁是 `wx` 独占建的真锁，
 *      僵锁**不静默抢写**（要显式 `--force-recover`）。
 *   ③ **锁的记账时间用真实时钟**（`new Date()`），**不是**领域时间：`lib/atomic.mjs` 的 TTL 是拿
 *      `Date.now()` 比的，若把注入时钟（测试里可以差一整天）写进锁，活锁会当场被判成僵锁。
 *      领域时间（`claim.claimed_at` / `liveness_at`）才走 `lib/clock.mjs`。
 *   ④ **读写分账**：读面（`readLocalState`）不建目录、不持锁、零写入。
 *   ⑤ **跨场隔离**：一场失败/过期只影响它自己那个节点 —— 每场一个节点，谁也不许顺手改别人。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { acquireLock, readJsonFile, releaseLock, writeJsonAtomic } from './atomic.mjs'
import { now as clockNow } from './clock.mjs'
import { LEASES, parentAlive, staleVerdict } from './liveness.mjs'

/** 本地状态的 schema 版本（B3.6）。 */
export const LOCAL_SCHEMA = 1

/** 三个节点（B3.6 逐字；`memory_review` 是文件里的键名，CLI 的 field 拼法是 `memory-review`）。 */
export const LOCAL_FIELDS = Object.freeze(['memory_review', 'conversation', 'technical'])

/** CLI `field` 拼法 → 节点键名（`memory-review` 带连字符，节点键带下划线）。 */
export const FIELD_ALIASES = Object.freeze({
  'memory-review': 'memory_review',
  memory_review: 'memory_review',
  conversation: 'conversation',
  technical: 'technical',
})

/** 节点的状态枚举（B3.6）。 */
export const NODE_STATES = Object.freeze(['unclaimed', 'running', 'done', 'failed', 'stale'])

/** 状态文件里那三个节点的必填键（B3.6 逐字）；加性键（`receipt_versions` / `failure_history`）不算。 */
const NODE_REQUIRED = Object.freeze([
  'claim', 'state', 'job_id', 'liveness_at', 'failure_reason',
  'report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count',
  'receipt_path', 'receipt_sha256', 'receipt_version', 'ticket_ids', 'artifact_paths',
])

/** 读-改-写那把文件锁最多等多久（毫秒）。锁只护住一次读-改-写，正常是几毫秒。 */
const DEFAULT_WAIT_MS = 8000

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isFilledString = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * 同步睡一小会儿（无第三方依赖）。**只用来等那把文件锁** —— 两个进程各 claim 自己那一场时，
 * 后半段都要改同一个文件；等几毫秒比"第二个调用直接失败"对调用方更友好，而且**不等于抢写**
 * （抢写是"把别人的锁删掉"，这里只是重试获取）。
 */
function sleepSync(ms) {
  if (!(ms > 0)) return
  const buf = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(buf, 0, 0, ms)
}

// ── 落点（B3.7）────────────────────────────────────────────────────────────
/** `<team>\state\local` —— 本地状态的家。 */
export const localDirOf = (teamDir) => path.join(teamDir, 'state', 'local')

/** `<team>\state\local\<day>.json`（一天一文件）。 */
export const localStatePath = (teamDir, day) => path.join(localDirOf(teamDir), `${day}.json`)

/** §B3.7 冻结的那个锁名：`.local-<day>.lock` —— 护住这个文件的读-改-写。 */
export const localLockPath = (teamDir, day) => path.join(localDirOf(teamDir), `.local-${day}.lock`)

/** 每场自己那把锁（"两场可并行、各自独立 claim"的载体）。 */
export const fieldLockPath = (teamDir, day, field) => path.join(localDirOf(teamDir), `.local-${day}-${field}.lock`)

/** 把 CLI 的 field 拼法认成节点键名；不认识 ⇒ `null`（调用方报 `E_ARG_SCHEMA`）。 */
export function fieldKeyOf(field) {
  return FIELD_ALIASES[String(field ?? '').trim()] ?? null
}

// ── 形状 ───────────────────────────────────────────────────────────────────
/** 一个空节点（B3.6 的字段表；`state` 是 `unclaimed`）。 */
export function emptyNode() {
  return {
    claim: null,
    state: 'unclaimed',
    job_id: null,
    liveness_at: null,
    failure_reason: null,
    report_path: null,
    report_sha256: null,
    findings_path: null,
    findings_set_sha256: null,
    findings_count: null,
    receipt_path: null,
    receipt_sha256: null,
    receipt_version: null,
    ticket_ids: [],
    artifact_paths: [],
    // 加性键（实现内部，测试不许断言名字）：已登记过的回执版本台账 + 失败原因的历史。
    receipt_versions: [],
    failure_history: [],
  }
}

/** 一份空状态（新建工作区时用它）。 */
export function emptyLocalState({ project = null, day, snapshot = null, at = null } = {}) {
  const stamp = at ?? clockNow().toISOString()
  const state = {
    schema: LOCAL_SCHEMA,
    day,
    project,
    snapshot,
    local_lease_minutes: LEASES.local,
    imported_proposal_ids: [],
    updated_at: stamp,
  }
  for (const key of LOCAL_FIELDS) state[key] = emptyNode()
  return state
}

/**
 * 形状校验（B3.6）：缺必填键 / 枚举越界 / 租约不是本地那一档 ⇒ 报 `E_DATA_CORRUPT`。
 *
 * @returns {{ok:boolean, code:string|null, problems:Array<{code:string,detail:string}>}}
 */
export function validateLocalState(state) {
  const problems = []
  const bad = (detail) => problems.push({ code: 'E_DATA_CORRUPT', detail })
  if (!isObject(state)) return { ok: false, code: 'E_DATA_CORRUPT', problems: [{ code: 'E_DATA_CORRUPT', detail: '本地状态不是一个对象' }] }
  if (state.schema !== LOCAL_SCHEMA) bad(`schema 必须是 ${LOCAL_SCHEMA}，实得 ${JSON.stringify(state.schema)}`)
  if (!isFilledString(state.day)) bad(`day 必填，实得 ${JSON.stringify(state.day)}`)
  if (!isFilledString(state.project)) bad('project 必填（项目 id）')
  if (!isFilledString(state.snapshot)) bad('snapshot 必填（本状态绑定的快照版本）')
  if (state.local_lease_minutes !== LEASES.local) bad(`local_lease_minutes 必须是 ${LEASES.local}（唯一来源 lib/liveness.mjs），实得 ${JSON.stringify(state.local_lease_minutes)}`)
  for (const key of LOCAL_FIELDS) {
    const node = state[key]
    if (!isObject(node)) { bad(`缺节点 ${key}`); continue }
    for (const field of NODE_REQUIRED) if (!(field in node)) bad(`${key} 节点缺必填键 ${field}（提案 §B3.6）`)
    if (!NODE_STATES.includes(node.state)) bad(`${key}.state 不在枚举里：${JSON.stringify(node.state)}`)
  }
  return { ok: problems.length === 0, code: problems.length === 0 ? null : 'E_DATA_CORRUPT', problems }
}

// ── 读 / 写 ────────────────────────────────────────────────────────────────
/**
 * 读一份本地状态。**缺**与**坏**分得开（`E_DATA_MISSING` / `E_DATA_CORRUPT`）——
 * "读不到"和"没有"长得一模一样，所以这里一次都不许回落成空对象。
 *
 * @returns {{ok:boolean, code:string|null, state:object|null, path:string, message:string}}
 */
export function readLocalState(teamDir, day) {
  const file = localStatePath(teamDir, day)
  const read = readJsonFile(file)
  if (!read.ok) return { ok: false, code: read.code, state: null, path: file, message: read.message }
  const shape = validateLocalState(read.value)
  if (!shape.ok) {
    return { ok: false, code: 'E_DATA_CORRUPT', state: null, path: file, message: `本地状态不成形状：${shape.problems.map((p) => p.detail).join('；')}` }
  }
  return { ok: true, code: null, state: read.value, path: file, message: '' }
}

/** 原子写一份本地状态（同目录临时件 → fsync → rename；父目录自动建）。 */
export function writeLocalState(teamDir, day, state, options = {}) {
  const file = localStatePath(teamDir, day)
  const written = writeJsonAtomic(file, state, options)
  if (!written.ok) return { ok: false, code: written.code, path: file, message: written.message }
  return { ok: true, code: null, path: file, message: '' }
}

/** 已经登记过的回执版本（台账；不在 ⇒ 空数组）。 */
export function receiptVersionsOf(node) {
  const raw = Array.isArray(node?.receipt_versions) ? node.receipt_versions : []
  return [...new Set(raw.filter((v) => Number.isInteger(v) && v >= 1))].sort((a, b) => a - b)
}

/**
 * 盘上真实存在的回执版本 —— 按 `<team>\leader\<day>\技术复盘回执[.<n>].json` 数。
 * C-6 逐字点了"**目标版本文件已存在**"这一条，所以"文件在不在"必须真去盘上看。
 */
export function receiptVersionsOnDisk(teamDir, day) {
  const dir = path.join(teamDir, 'leader', day)
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const m = /^技术复盘回执(?:\.(\d+))?\.json$/.exec(name)
    if (m === null) continue
    out.push(m[1] === undefined ? 1 : Number(m[1]))
  }
  return [...new Set(out.filter((v) => Number.isInteger(v) && v >= 1))].sort((a, b) => a - b)
}

// ── 事务（读-改-写全程持锁 · §B3.7）───────────────────────────────────────
/**
 * 抢那把读-改-写锁：**在时限内重试**（别的进程正占着 / 正写着 / 刚放掉，都只是一瞬间）。
 *
 * 重试集合的判据只有一条：`retryable`（由 `lib/atomic.mjs` 给）或 `E_LOCK_HELD`。
 * 而 `E_LOCK_STALE`（持有者已死或过期）**不重试** —— 那种锁不会自己松开，
 * 等满预算也还是那个结果；它的处置是显式 `--force-recover`，不是等。
 *
 * 预算用满或被僵锁挡着就照原样返回（`E_LOCK_HELD` / `E_LOCK_STALE`）—— **不静默抢写**。
 */
function acquireDayLock(teamDir, day, spec) {
  const waitMs = Number.isFinite(spec?.waitMs) ? spec.waitMs : DEFAULT_WAIT_MS
  const deadline = Date.now() + Math.max(0, waitMs)
  for (;;) {
    const got = acquireLock(
      localLockPath(teamDir, day),
      { session_id: spec?.sessionId ?? null, purpose: 'local-state:read-modify-write' },
      { at: new Date(), forceRecover: spec?.forceRecover === true, parentAlive },
    )
    if (got.ok) return got
    if (got.code !== 'E_LOCK_HELD' && got.retryable !== true) return got
    if (Date.now() >= deadline) return got
    sleepSync(20)
  }
}

/**
 * 持锁跑一段"读-改-写"。
 *
 * 取锁次序固定（先自己那一场、再那个文件），**永远不会**"持着文件锁去抢场锁" ⇒ 不会成环。
 * 回调拿到的是**锁内读到**的那一份状态（`null` = 还没有这份文件）；它返回
 * `{ok:true, state}` 就原子落盘，返回 `{ok:false, code, message}` 就**一个字节都不写**。
 *
 * @param {string} teamDir `.team` 那一层
 * @param {{day:string, field?:string|null, at?:string, sessionId?:string|null, forceRecover?:boolean, waitMs?:number}} spec
 * @param {(state:object|null) => {ok:boolean, code?:string|null, message?:string, state?:object}} fn
 * @returns {{ok:boolean, code:string|null, message:string, state:object|null, path:string|null, wrote:boolean}}
 */
export function localTransaction(teamDir, spec, fn) {
  const day = spec?.day
  if (!isFilledString(day)) return { ok: false, code: 'E_ARG_SCHEMA', message: 'localTransaction：day 必填', state: null, path: null, wrote: false }
  const field = spec?.field ?? null
  const held = []
  try {
    if (field !== null) {
      const got = acquireLock(
        fieldLockPath(teamDir, day, field),
        { session_id: spec?.sessionId ?? null, purpose: `local-claim:${field}` },
        { at: new Date(), forceRecover: spec?.forceRecover === true, parentAlive },
      )
      if (!got.ok) return { ok: false, code: got.code, message: got.message, state: null, path: null, wrote: false }
      held.push(fieldLockPath(teamDir, day, field))
    }
    const dayLock = acquireDayLock(teamDir, day, spec)
    if (!dayLock.ok) return { ok: false, code: dayLock.code, message: dayLock.message, state: null, path: null, wrote: false }
    held.push(localLockPath(teamDir, day))

    const read = readLocalState(teamDir, day)
    if (!read.ok && read.code !== 'E_DATA_MISSING') {
      return { ok: false, code: read.code, message: read.message, state: null, path: read.path, wrote: false }
    }
    const outcome = fn(read.ok ? read.state : null)
    if (!outcome?.ok) {
      return { ok: false, code: outcome?.code ?? 'E_INTERNAL', message: outcome?.message ?? '事务被拒', state: read.ok ? read.state : null, path: read.path, wrote: false }
    }
    const written = writeLocalState(teamDir, day, outcome.state, {})
    if (!written.ok) return { ok: false, code: written.code, message: written.message, state: outcome.state, path: written.path, wrote: false }
    return { ok: true, code: null, message: '', state: outcome.state, path: written.path, wrote: true }
  } finally {
    for (const lock of held.reverse()) releaseLock(lock)
  }
}

// ── claim 判定（B3.6 / STO-04）──────────────────────────────────────────────
/**
 * claim 请求的形状判定：把不属于本地场的东西挡在门外。
 *
 * · `field` 必须是三个节点之一（`memory-review` 是 CLI 拼法，落盘键名是 `memory_review`）；
 * · `attempt` 必须是 ≥1 的整数；`job_id` 必填（claim 要指得出是哪次派工）；
 * · 🔴 **维护案 fence 不许混进本地场**（B3.6 最后一段 / STO-04 ③）⇒ `E_CLAIM_MIXED`。
 *
 * @returns {{ok:boolean, code:string|null, message:string, field:string|null}}
 */
export function claimRequestVerdict(payload) {
  const field = fieldKeyOf(payload?.field)
  if (field === null) {
    return { ok: false, code: 'E_ARG_SCHEMA', message: `field 必须是 memory-review | conversation | technical，实得 ${JSON.stringify(payload?.field)}`, field: null }
  }
  if (!Number.isInteger(payload?.attempt) || payload.attempt < 1) {
    return { ok: false, code: 'E_ARG_SCHEMA', message: `attempt 必须是 ≥1 的整数，实得 ${JSON.stringify(payload?.attempt)}`, field }
  }
  if (!isFilledString(payload?.job_id)) {
    return { ok: false, code: 'E_ARG_SCHEMA', message: `job_id 必填（claim 要指得出是哪次派工），实得 ${JSON.stringify(payload?.job_id)}`, field }
  }
  for (const key of ['maintenance_fence', 'update_generation', 'review_attempt']) {
    if (payload?.[key] !== undefined && payload?.[key] !== null) {
      return {
        ok: false, code: 'E_CLAIM_MIXED', field,
        message: `本地场 claim 里出现了 ${key} —— 那是记忆复核的维护案 fence，不许混进本地场（两场各自独立 claim）`,
      }
    }
  }
  return { ok: true, code: null, message: '', field }
}

/**
 * 一个节点现在还能不能被 claim。
 *
 * **唯一被占的形状**是"这一场正在跑"（`state === 'running'`）—— 那正是 `E_CLAIM_HELD`；
 * 失败 / 已完成 / 从没跑过 ⇒ 允许新一轮 claim（重查点要能把缺的那一场**补起来**，JOB-03 ③）。
 *
 * @returns {{ok:boolean, code:string|null, message:string}}
 */
export function claimVerdict(node, { attempt = null } = {}) {
  if (!isObject(node)) return { ok: false, code: 'E_DATA_CORRUPT', message: '节点不是一个对象' }
  if (node.state === 'running') {
    return {
      ok: false, code: 'E_CLAIM_HELD',
      message: `${node.job_id ?? '(未知作业)'} 还在这场上跑着（attempt=${node.claim?.attempt ?? '?'}，${node.liveness_at ?? '没有时间戳'}）—— 要重来就等它结束或先记失败`,
    }
  }
  if (Number.isInteger(attempt) && Number.isInteger(node.claim?.attempt) && attempt < node.claim.attempt) {
    return { ok: false, code: 'E_ARG_SCHEMA', message: `attempt=${attempt} 比这一场已经跑过的 attempt=${node.claim.attempt} 还小 —— 旧 attempt 不许覆盖新一轮` }
  }
  return { ok: true, code: null, message: '' }
}

/** 把 claim 写进节点（纯函数：返回**新的**节点，不改入参）。 */
export function applyClaim(node, { attempt, jobId, at }) {
  const next = { ...node }
  const prevFailure = isFilledString(node?.failure_reason) ? node.failure_reason : null
  next.claim = { attempt, job_id: jobId, claimed_at: at }
  next.state = 'running'
  next.job_id = jobId
  next.liveness_at = at
  next.failure_reason = null
  next.failure_history = [...(Array.isArray(node?.failure_history) ? node.failure_history : []), ...(prevFailure === null ? [] : [{ attempt: node?.claim?.attempt ?? null, reason: prevFailure, at: node?.liveness_at ?? null }])]
  return next
}

/**
 * 这一场该不该判过期（C-5：`age >= lease` 即 stale）—— 租约取本地那一档。
 *
 * @returns {{stale:boolean, ageMinutes:number|null, reason:string|null}}
 */
export function nodeStaleVerdict(node, now) {
  const at = isFilledString(node?.liveness_at) ? node.liveness_at : (isFilledString(node?.claim?.claimed_at) ? node.claim.claimed_at : null)
  return staleVerdict(at, now, LEASES.local)
}

// ── 产物锚点（B3.1：三个都来自作业产物）────────────────────────────────────
/** 64 hex（大小写不敏感）。 */
const isSha = (v) => typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v.trim())

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/**
 * 作业产物的锚点判定（`local-mark` 用）。
 *
 * 判据：`report_path` / `findings_path` **必须在工作区里真的存在**，且 `report_sha256`
 * 与报告**盘上字节**的哈希逐字相同 —— 锚点来自产物，不来自回执自报（B3.1 的反例就是"改报告一字"）。
 *
 * @param {string} workspace 工作区根（报告是**相对工作区**的路径）
 * @param {{report_path?:string, report_sha256?:string, findings_path?:string, findings_set_sha256?:string, findings_count?:unknown, artifact_paths?:unknown}} spec
 * @returns {{ok:boolean, code:string|null, message:string, report_abs:string|null, findings_abs:string|null,
 *            actual_report_sha256:string|null, problems:Array<{code:string,detail:string}>}}
 */
export function artifactAnchorVerdict(workspace, spec = {}) {
  const problems = []
  const bad = (code, detail) => problems.push({ code, detail })
  const resolve = (rel) => {
    if (!isFilledString(rel)) return null
    const abs = path.resolve(workspace, String(rel).replace(/\//g, path.sep))
    const root = path.resolve(workspace)
    if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null
    return abs
  }
  const reportAbs = resolve(spec.report_path)
  const findingsAbs = resolve(spec.findings_path)

  if (reportAbs === null) bad('E_ARG_SCHEMA', `report_path 必填且必须在工作区里（相对工作区、正斜杠），实得 ${JSON.stringify(spec.report_path)}`)
  else if (!existsSync(reportAbs) || !statSync(reportAbs).isFile()) bad('E_DATA_MISSING', `报告不在盘上：${reportAbs}`)
  if (findingsAbs === null) bad('E_ARG_SCHEMA', `findings_path 必填且必须在工作区里，实得 ${JSON.stringify(spec.findings_path)}`)
  else if (!existsSync(findingsAbs) || !statSync(findingsAbs).isFile()) bad('E_DATA_MISSING', `findings 文件不在盘上：${findingsAbs}`)
  if (!isSha(spec.report_sha256)) bad('E_ARG_HASH', `report_sha256 必须是 64 hex，实得 ${JSON.stringify(spec.report_sha256)}`)
  if (!isSha(spec.findings_set_sha256)) bad('E_ARG_HASH', `findings_set_sha256 必须是 64 hex，实得 ${JSON.stringify(spec.findings_set_sha256)}`)
  if (!Number.isInteger(spec.findings_count) || spec.findings_count < 0) bad('E_ARG_SCHEMA', `findings_count 必须是 ≥0 的整数，实得 ${JSON.stringify(spec.findings_count)}`)

  let actual = null
  if (problems.length === 0) {
    actual = sha256File(reportAbs)
    if (actual.toLowerCase() !== String(spec.report_sha256).trim().toLowerCase()) {
      bad('E_ARG_HASH', `report_sha256 与报告盘上字节对不上（登记 ${String(spec.report_sha256).slice(0, 12)}…，盘上 ${actual.slice(0, 12)}…）—— 锚点必须来自作业产物`)
    }
  }
  const first = problems[0] ?? null
  return {
    ok: problems.length === 0,
    code: first?.code ?? null,
    message: first?.detail ?? '',
    report_abs: reportAbs,
    findings_abs: findingsAbs,
    actual_report_sha256: actual,
    problems,
  }
}

/** 把锚点写进节点（纯函数）。`findings_sha256` 是提案 §B1.4 的拼法，落盘键名按 §B3.6 用 `findings_set_sha256`。 */
export function applyMark(node, spec = {}, at) {
  const next = { ...node }
  next.state = isFilledString(spec.state) ? String(spec.state).trim() : 'done'
  next.report_path = isFilledString(spec.report_path) ? String(spec.report_path).trim() : next.report_path
  next.report_sha256 = isFilledString(spec.report_sha256) ? String(spec.report_sha256).trim().toLowerCase() : next.report_sha256
  next.findings_path = isFilledString(spec.findings_path) ? String(spec.findings_path).trim() : next.findings_path
  const setSha = isFilledString(spec.findings_set_sha256) ? spec.findings_set_sha256 : (isFilledString(spec.findings_sha256) ? spec.findings_sha256 : null)
  if (setSha !== null) next.findings_set_sha256 = String(setSha).trim().toLowerCase()
  if (Number.isInteger(spec.findings_count)) next.findings_count = spec.findings_count
  if (Array.isArray(spec.artifact_paths)) next.artifact_paths = spec.artifact_paths.map(String)
  next.liveness_at = at
  if (next.state === 'done') next.failure_reason = null
  return next
}

/** 把回执登记写进节点（纯函数）。台账 `receipt_versions` 是加性键，C-4 的"空洞不填"靠它判。 */
export function applyReceiptRegistration(node, spec = {}, at) {
  const next = { ...node }
  const version = spec.receipt_version
  next.receipt_path = isFilledString(spec.receipt_path) ? String(spec.receipt_path).trim() : next.receipt_path
  next.receipt_sha256 = isFilledString(spec.receipt_sha256) ? String(spec.receipt_sha256).trim().toLowerCase() : next.receipt_sha256
  next.receipt_version = version
  next.ticket_ids = Array.isArray(spec.ticket_ids) ? spec.ticket_ids.map(String) : next.ticket_ids
  next.receipt_versions = [...new Set([...receiptVersionsOf(node), version])].sort((a, b) => a - b)
  next.liveness_at = at
  return next
}

/** 把一场标成失败（纯函数）：保留原因、保留 claim 痕迹、只动这一场。 */
export function applyFailure(node, spec = {}, at) {
  const next = { ...node }
  const reason = isFilledString(spec.failure_reason) ? String(spec.failure_reason).trim() : '(没给原因)'
  next.state = 'failed'
  next.failure_reason = reason
  next.liveness_at = at
  return next
}

/** 失败那一场的 claim 还在不在（`local-fail` 的前置）。 */
export function failureRequestVerdict(node) {
  if (!isObject(node?.claim) || !isFilledString(node?.claim?.job_id)) {
    return { ok: false, code: 'E_CLAIM_NOT_FOUND', message: '这一场没有 claim 可以标失败（先 local-claim）' }
  }
  return { ok: true, code: null, message: '' }
}

/** 给 health 卡用的一行摘要（只读；不改任何状态）。 */
export function localSummary(state) {
  const out = { project: state?.project ?? null, day: state?.day ?? null, snapshot: state?.snapshot ?? null, nodes: {} }
  for (const key of LOCAL_FIELDS) {
    const node = state?.[key] ?? null
    out.nodes[key] = node === null ? null : { state: node.state, job_id: node.job_id, liveness_at: node.liveness_at, failure_reason: node.failure_reason }
  }
  return out
}
