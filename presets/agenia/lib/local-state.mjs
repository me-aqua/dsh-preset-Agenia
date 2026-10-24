/**
 * local project state —— 位置 · 形状 · 原子写 · 双评审 claim（提案 §B3.6 / §B3.7）。
 *
 * 冻结依据：提案 §B1.3（文件名）· §B1.5（`lib/local-state.mjs` = "local project state 读写 + claim"）·
 *   §B3.6（`<WS>\state\local\<day>.json` 的字段表 + "两场可并行、各自独立 claim"）·
 *   §B3.7（位置 · 原子写 · 锁 · 读-改-写全程持锁 · CAS）· 追加裁定 v1.2 C-5（`age >= lease` 即 stale）。
 *
 * 六条口径：
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
 *   ⑥ **落地的写面是一张白名单**：`local-mark` 写哪些键只由 `MARK_WRITE_KEYS`（= `MARK_WRITERS` 的键）说；
 *      不在表里的 payload 键一个都不写，而且不静默（CLI 把它们点名进 `ignored_keys`，§12.2.4）。
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

/**
 * 这一场 `local-mark` **要不要**回执三件套（§12.2.4）—— 三个值：`required` / `optional` / `forbidden`。
 *
 * 判据只有一条：**这一场是不是被派出去的那一场**（节点上记着 `claim.job_id`，§12.2 的三步：
 * claim 派出 / mark 落地）。有 claim ⇒ `required`（无条件）；没有 claim ⇒ `optional`（给了就按同一套规则验，
 * 不给就留 `null`）—— 没有派工就没有"这一场的回执"，那是另一种形状，不是这条规则要拦的东西。
 *
 * 🔴 回执**在不在盘上**不是判据之一（老板 2026-10-24 第 4 关的裁定）：拿"被要求的东西在不在"来决定
 * "要不要要求它"，闸会在回执**缺席**那一刻自动降档 —— 而回执缺席正是这条规则要抓的那个情形。
 *
 * ⚠️ 这就是本规则**唯一的降档口**（"没有 claim"那一支），别在别处再写一份。它的代价写在 `CONTRACT.md` §12.5 里。
 *
 * @param {string|null} field 节点键名（`memory_review` / `conversation` / `technical`）
 * @param {{node?:object|null}} spec `node` = 这一场在状态文件里的那个节点（只读 `claim.job_id`）
 * @returns {'required'|'optional'|'forbidden'}
 */
export function receiptPolicyOf(field, spec = {}) {
  const policy = FIELD_RECEIPT_POLICY[String(field ?? '')] ?? 'required'
  if (policy !== 'required') return policy
  return isFilledString(spec?.node?.claim?.job_id) ? 'required' : 'optional'
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
 * 哪几个字段**必须**交 findings 三件套（§12.2 的按字段表；老板 2026-10-24 的裁定"选项 1"）。
 *
 * 只有 `technical` 有发现集产物（`job-briefs/technical-review.md:13`）；会话评审与记忆复核的
 * 作业书里 `findings` 零处出现 ⇒ 逼它们交，等于逼人编一份桩文件加一个 64 位摘要。
 */
export const FIELD_REQUIRES_FINDINGS = Object.freeze({
  memory_review: false,
  conversation: false,
  technical: true,
})

/**
 * 哪几个字段**要**回执三件套（§12.2.4；老板 2026-10-24 的裁定：技术复盘的回执由组长写）。
 *
 * · `required` ⇒ 这一场必须交齐 `receipt_path` / `receipt_sha256` / `receipt_version`（缺 ⇒ `E_ARG_SCHEMA`）；
 * · `forbidden` ⇒ 这个字段不产回执，交了就拒 —— 收下再丢掉正是 `F-162` 的病根。
 *
 * "必须交"的形状**不在这张表里**再写第二遍：`required` 还要过 `receiptPolicyOf()` 那道收窄（这一场
 * 真的是被派出去的那一场 —— 节点上有 `claim.job_id`），见那个函数的注释。
 */
export const FIELD_RECEIPT_POLICY = Object.freeze({
  memory_review: 'forbidden',
  conversation: 'forbidden',
  technical: 'required',
})

/** 节点里存的那**一种**拼法：工作区相对、正斜杠、带 `.team/` 那一层。 */
const TEAM_PREFIX = '.team/'

/** `abs` 是不是落在 `<工作区>/.team/` **里面**（本平台不分大小写：Windows 上 `.TEAM` 与 `.team` 是同一个目录）。 */
function insideTeam(teamRoot, abs) {
  const delta = path.relative(teamRoot, abs)
  if (delta === '' || path.isAbsolute(delta)) return false
  return delta !== '..' && !delta.startsWith(`..${path.sep}`)
}

/**
 * 一个锚点（**任何拼法**）→ `{abs, rel, reason, elsewhere}`。
 *
 * 🔴 判的是**位置**，不是拼法（老板 2026-10-24 修正裁定）：只要解析之后落在 `<工作区>/.team/` 里就收，
 * 存进节点的永远是规范拼法 `.team/<…>/<file>`（正斜杠）—— 状态文件里只有一种写法，哪怕调用方用另一种。
 *
 * 两种相对基准**都试**（工作区相对优先，`.team` 相对兜底）：同一串 `retro/x.md` 既可能是
 * `<WS>/retro/x.md`，也可能是 `<WS>/.team/retro/x.md` —— 哪一读落在 `.team/` 里，就用哪一读。
 * 两读**都**落在 `.team/` 里时（`.team/…` 这种拼法：工作区相对那一读是 `<WS>/.team/…`，`.team` 相对那一读
 * 是 `<WS>/.team/.team/…`）**由存在性消歧** —— 盘上真有那一份赢；两读都不在盘上 ⇒ `E_DATA_MISSING`。
 *
 * 🔴 「在不在 `.team/` 里」在**本平台**（Windows）**不分大小写**：`e:\harness\.team\x.md` 与
 * `E:\Harness\.team\x.md` 是同一个文件 ⇒ 同一格收下、存同一个规范形（`insideTeam()` 用 `path.relative`，
 * 跟着平台的路径语义走，不是字符串前缀比较）。
 *
 * · `reason === null` ⇒ 收（`abs` 是盘上那一份，`rel` 是规范拼法）；
 * · `reason === 'outside_team'` ⇒ 两读都落不进 `.team/`（`README.md` 在**工作区根**、`../…`、工作区外的绝对路径）；
 * · `reason === 'missing'` ⇒ 落点算得出来（`abs` 是第一读），但盘上没有这个文件。
 *   两件都报 `E_DATA_MISSING` —— "在外 / 缺"是同一个诊断；`reason` 只用来把话说清。
 * · `elsewhere` = **另一读在盘上真的那一份**（有才给）：用来把"文件在，但不在 `.team/` 里"这句话说出来 ——
 *   否则读的人只会看到"不在盘上"，而那份文件明明就在工作区根上（`RCP-03` / `VRF-02` 那种现场）。
 */
function anchorResolution(workspace, rel) {
  if (!isFilledString(rel)) return { abs: null, rel: null, reason: 'empty', elsewhere: null }
  const root = path.resolve(workspace)
  const teamRoot = path.join(root, '.team')
  const text = String(rel).trim().replace(/\\/g, path.sep)
  const candidates = []
  const outside = []
  for (const base of [root, teamRoot]) {
    const abs = path.resolve(base, text)
    if (candidates.includes(abs) || outside.includes(abs)) continue
    if (insideTeam(teamRoot, abs)) candidates.push(abs)
    else outside.push(abs)
  }
  const onDisk = (list) => list.find((abs) => existsSync(abs) && statSync(abs).isFile()) ?? null
  if (candidates.length === 0) {
    const hit = onDisk(outside)
    return { abs: hit ?? outside[0] ?? null, rel: null, reason: 'outside_team', elsewhere: hit }
  }
  const hit = onDisk(candidates)
  if (hit === null) return { abs: candidates[0], rel: null, reason: 'missing', elsewhere: onDisk(outside) }
  // 规范形由 `.team` 根拼出来（不从调用方那串字里截）：第一段永远是 `.team`，写 `.TEAM/…` 也存成 `.team/…`。
  const canonical = `${TEAM_PREFIX}${path.relative(teamRoot, hit).split(path.sep).join('/')}`
  return { abs: hit, rel: canonical, reason: null, elsewhere: null }
}

/** findings 文件里 `findings` 数组的条数；读不出来或没有那个数组 ⇒ `null`（调用方报 `E_DATA_CORRUPT`）。 */
function findingsCountInFile(file) {
  let doc = null
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  return Array.isArray(doc?.findings) ? doc.findings.length : null
}

/** 回执文件里声明的 `version`（整数 ≥1 才认；读不出来 / 没有这个字段 ⇒ `null`，调用方判 `E_DATA_CORRUPT`）。 */
function receiptVersionInFile(file) {
  let doc = null
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  return Number.isInteger(doc?.version) && doc.version >= 1 ? doc.version : null
}

/**
 * 规范拼法 `.team/<…>/<file>` → **`.team` 相对**那一份（`leader/<day>/技术复盘回执.json`）。
 *
 * 节点里 `receipt_path` 存的是这一种：`local-receipt-set` 存的是它，两扇读者也只认它
 * （`lib/health.mjs:215` 的 `path.join(teamDir, …)`、`bin/agenia-local.mjs::opReceiptCheck` 的
 * `resolveUnder(teamDir, …)`）—— 存成带 `.team/` 的那一种，卡会去读 `<ws>/.team/.team/…`。
 * 见 `CONTRACT.md` §12.2.2 的两基准表 / §12.2.4。
 */
const teamRelativeOf = (canonical) => (isFilledString(canonical) && canonical.startsWith(TEAM_PREFIX) ? canonical.slice(TEAM_PREFIX.length) : null)

/**
 * 作业产物的锚点判定（`local-mark` 用）。**按字段**（§12.2），三条规则：
 *
 * ① `report_path` / `report_sha256` —— 三个字段都要。`report_path` **任何拼法都收**，只要它落在
 *    `<工作区>/.team/` 里（见 `anchorResolution`）；落不进去、或者盘上没有 ⇒ **同一个** `E_DATA_MISSING`。
 *    收下之后节点里存的是**规范拼法** `.team/<…>/<file>`（`report_rel`）。
 * ② findings 三件套（`findings_path` / `findings_set_sha256` / `findings_count`）——
 *    `technical` **必填**（缺 ⇒ `E_ARG_SCHEMA`）；`memory_review` / `conversation` **可选**：
 *    不给 ⇒ 三个锚点留 `null`；给了 ⇒ 按同一套规则验（"要么三件都给、要么都不给"）。
 * ③ `findings_count` 必须**等于产物里 `findings` 数组的条数** —— 只写不读的计数会让
 *    `0` 变成"查过了、没发现问题"，而 `0` 恰好是最容易被这么读的那个数。
 * ④ 回执三件套（`receipt_path` / `receipt_sha256` / `receipt_version`，§12.2.4）—— 按 `receiptPolicy`：
 *    `forbidden`（`memory_review` / `conversation`）交了就拒、`required`（`technical` + 有 `claim.job_id`，
 *    由 `receiptPolicyOf()` 收窄）必须交齐、`optional` 给了就按同一套规则验。三件套"要么都给、要么都不给"；
 *    `receipt_sha256` 必须**等于回执盘上字节**（自报的那一份不算锚）、`receipt_version` 是 ≥1 的整数、
 *    回执自己也必须声明整数 `version` 且与之相等（声明不出来 ⇒ `E_DATA_CORRUPT`）。路径同样**按位置收**
 *    （见 `anchorResolution`），但节点里存的是 **`.team` 相对**那一种（`teamRelativeOf`）—— 那是两扇读者已经在读的形状。
 *
 * `artifact_paths` **不是锚点**（没有摘要、落地之后没有任何一扇门再读它），但**每一格都必须是
 * `<WS>/.team/` 里一个真文件** —— 落点在外、或者盘上没有这个文件，都是**同一个** `E_DATA_MISSING`；
 * 收下之后同样按规范拼法写回（`artifact_rels`）—— 一串锚点里混进第二种写法，等于把"锚点长什么样"又开一个口子。
 *
 * ⚠️ 这里**不**复算 `findings_set_sha256` 的内容（Q10 摘要归 `receipt-check` / `VRF-02`）、也不判回执内容
 * 对不对（那是 `receipt-check` / `VRF-02` 的事）—— 本函数只判形状与条数，以及报告 / 回执两个锚点与
 * **盘上字节**是否逐字相同。
 *
 * @param {string} workspace 工作区根（锚点最终都落在它下面的 `.team/`）
 * @param {{report_path?:string, report_sha256?:string, findings_path?:string, findings_set_sha256?:string, findings_count?:unknown,
 *          receipt_path?:string, receipt_sha256?:string, receipt_version?:unknown, artifact_paths?:unknown}} spec
 * @param {string|null} field 节点键名（`memory_review` / `conversation` / `technical`）—— 它决定 findings / 回执是不是必填
 * @param {{receiptPolicy?:'required'|'optional'|'forbidden'}} [options] 回执三件套要不要（缺省取 `FIELD_RECEIPT_POLICY`；
 *        CLI 传 `receiptPolicyOf()` 的结果 —— 判定只在那两处，本函数不另算一份）
 * @returns {{ok:boolean, code:string|null, message:string, report_abs:string|null, findings_abs:string|null,
 *            receipt_abs:string|null, report_rel:string|null, findings_rel:string|null, receipt_rel:string|null,
 *            receipt_rel_team:string|null, artifact_rels:string[]|null, actual_report_sha256:string|null,
 *            actual_receipt_sha256:string|null, findings_count_in_artifact:number|null, receipt_policy:string,
 *            problems:Array<{code:string,detail:string}>}}
 */
export function artifactAnchorVerdict(workspace, spec = {}, field = null, options = {}) {
  const problems = []
  const bad = (code, detail) => problems.push({ code, detail })
  // 没给字段名 / 不认识的字段名 ⇒ 按**最严**的那一档判（findings 必填）：宁可多要一样，
  // 也不许因为少传一个参数就把 technical 的发现集漏过去。
  const requiresFindings = FIELD_REQUIRES_FINDINGS[String(field ?? '')] !== false
  // 回执三件套的档位同理：显式给了就用给的，没给就取那**一张**表（不认识的字段名按最严 = `required`）。
  const receiptPolicy = options?.receiptPolicy ?? (FIELD_RECEIPT_POLICY[String(field ?? '')] ?? 'required')

  // ── report_path：落点必须在 <工作区>/.team/ 里，且盘上真的有 ──
  const report = anchorResolution(workspace, spec.report_path)
  if (!isFilledString(spec.report_path)) {
    bad('E_ARG_SCHEMA', `report_path 必填（报告路径是非空字符串），实得 ${JSON.stringify(spec.report_path)}`)
  } else if (report.reason === 'outside_team') {
    bad('E_DATA_MISSING', `report_path 必须解析到工作区的 .team/ 里面（收到的是 ${JSON.stringify(spec.report_path)}；工作区根下的文件、../… 与工作区外的绝对路径都不行）`)
  } else if (report.reason === 'missing') {
    const hint = report.elsewhere === null ? '' : `（盘上有一份同名文件 ${report.elsewhere}，但它在 .team/ 外面 —— 锚点必须落在 .team/ 里）`
    bad('E_DATA_MISSING', `报告不在 .team/ 里：${report.abs}${hint}`)
  }

  // ── findings 三件套：按字段（technical 必填；另两个字段给了就同一套规则）──
  const findingsGiven = isFilledString(spec.findings_path)
  const setShaGiven = spec.findings_set_sha256 !== undefined && spec.findings_set_sha256 !== null
  const countGiven = spec.findings_count !== undefined && spec.findings_count !== null
  const findings = findingsGiven ? anchorResolution(workspace, spec.findings_path) : { abs: null, rel: null, reason: 'empty' }
  let countInArtifact = null
  if (!findingsGiven) {
    if (requiresFindings) {
      bad('E_ARG_SCHEMA', `${field ?? '这一场'} 必须交 findings 产物：findings_path / findings_set_sha256 / findings_count 三个都要（三个字段里只有 technical 有发现集）`)
    } else if (setShaGiven || countGiven) {
      const extra = [setShaGiven ? 'findings_set_sha256' : null, countGiven ? 'findings_count' : null].filter((k) => k !== null)
      bad('E_ARG_SCHEMA', `findings 三个锚点要么都给、要么都不给（findings_path 没给，却给了 ${extra.join(' + ')}）—— 只给一半会在节点上留下一个没有产物的锚点`)
    }
  } else {
    if (findings.reason === 'outside_team') {
      bad('E_DATA_MISSING', `findings_path 必须解析到工作区的 .team/ 里面（收到的是 ${JSON.stringify(spec.findings_path)}）`)
    } else if (findings.reason === 'missing') {
      const hint = findings.elsewhere === null ? '' : `（盘上有一份同名文件 ${findings.elsewhere}，但它在 .team/ 外面 —— 锚点必须落在 .team/ 里）`
      bad('E_DATA_MISSING', `findings 文件不在 .team/ 里：${findings.abs}${hint}`)
    } else {
      countInArtifact = findingsCountInFile(findings.abs)
      if (countInArtifact === null) bad('E_DATA_CORRUPT', `findings 文件里没有 findings 数组（读不出来或形状不对）：${findings.abs}`)
    }
    if (!isSha(spec.findings_set_sha256)) bad('E_ARG_HASH', `findings_set_sha256 必须是 64 hex，实得 ${JSON.stringify(spec.findings_set_sha256)}`)
    if (!Number.isInteger(spec.findings_count) || spec.findings_count < 0) {
      bad('E_ARG_SCHEMA', `findings_count 必须是 ≥0 的整数，实得 ${JSON.stringify(spec.findings_count)}`)
    } else if (countInArtifact !== null && spec.findings_count !== countInArtifact) {
      bad('E_ARG_SCHEMA', `findings_count=${spec.findings_count} 与 findings 文件里的条数 ${countInArtifact} 对不上：${findings.abs}`)
    }
  }

  // ── 回执三件套：按字段（`technical` 要；另两个字段交了就拒）──
  const receiptPathGiven = isFilledString(spec.receipt_path)
  const receiptShaGiven = spec.receipt_sha256 !== undefined && spec.receipt_sha256 !== null
  const receiptVerGiven = spec.receipt_version !== undefined && spec.receipt_version !== null
  const receiptAnyGiven = receiptPathGiven || receiptShaGiven || receiptVerGiven
  const receipt = receiptPathGiven ? anchorResolution(workspace, spec.receipt_path) : { abs: null, rel: null, reason: 'empty', elsewhere: null }
  const receiptMissing = [
    receiptPathGiven ? null : 'receipt_path',
    receiptShaGiven ? null : 'receipt_sha256',
    receiptVerGiven ? null : 'receipt_version',
  ].filter((k) => k !== null)
  if (receiptPolicy === 'forbidden') {
    if (receiptAnyGiven) {
      const given = Object.entries({ receipt_path: receiptPathGiven, receipt_sha256: receiptShaGiven, receipt_version: receiptVerGiven })
        .filter(([, v]) => v).map(([k]) => k)
      bad('E_ARG_SCHEMA', `${field ?? '这一场'} 不收回执锚点（回执是技术复盘那一场的产物），却给了 ${given.join(' + ')} —— 收下再丢掉正是 F-162 的病根，所以在这里拒`)
    }
  } else if (!receiptAnyGiven) {
    if (receiptPolicy === 'required') {
      bad('E_ARG_SCHEMA', `${field ?? '这一场'} 必须交回执三件套：receipt_path / receipt_sha256 / receipt_version 三个都要（这一场是被派出去的那一场 —— 有 claim.job_id —— 锚点不许缺）`)
    }
  } else {
    if (receiptMissing.length > 0) {
      bad('E_ARG_SCHEMA', `回执三件套要么都给、要么都不给（缺 ${receiptMissing.join(' + ')}）—— 只给一半会在节点上留下一个没有产物的锚点`)
    }
    if (receiptPathGiven) {
      if (receipt.reason === 'outside_team') {
        bad('E_DATA_MISSING', `receipt_path 必须解析到工作区的 .team/ 里面（收到的是 ${JSON.stringify(spec.receipt_path)}）`)
      } else if (receipt.reason === 'missing') {
        const hint = receipt.elsewhere === null ? '' : `（盘上有一份同名文件 ${receipt.elsewhere}，但它在 .team/ 外面 —— 锚点必须落在 .team/ 里）`
        bad('E_DATA_MISSING', `回执不在 .team/ 里：${receipt.abs}${hint}`)
      }
    }
    if (receiptShaGiven && !isSha(spec.receipt_sha256)) bad('E_ARG_HASH', `receipt_sha256 必须是 64 hex，实得 ${JSON.stringify(spec.receipt_sha256)}`)
    if (receiptVerGiven && (!Number.isInteger(spec.receipt_version) || spec.receipt_version < 1)) {
      bad('E_ARG_SCHEMA', `receipt_version 必须是 ≥1 的整数（回执里那个 version），实得 ${JSON.stringify(spec.receipt_version)}`)
    }
  }

  // ── 报告摘要的形状 ──
  if (!isSha(spec.report_sha256)) bad('E_ARG_HASH', `report_sha256 必须是 64 hex，实得 ${JSON.stringify(spec.report_sha256)}`)

  // ── artifact_paths：不是锚点（没有摘要、之后没有读者），但每一格都必须是 .team/ 里一个真文件（并按规范拼法写回）──
  if (spec.artifact_paths !== undefined && spec.artifact_paths !== null && !Array.isArray(spec.artifact_paths)) {
    bad('E_ARG_SCHEMA', `artifact_paths 必须是数组，实得 ${JSON.stringify(spec.artifact_paths)}`)
  }
  const artifactRels = []
  for (const [i, rel] of (Array.isArray(spec.artifact_paths) ? spec.artifact_paths : []).entries()) {
    if (!isFilledString(rel)) {
      bad('E_ARG_SCHEMA', `artifact_paths[${i}] 必须是非空字符串路径，实得 ${JSON.stringify(rel)}`)
      continue
    }
    const resolved = anchorResolution(workspace, rel)
    if (resolved.rel === null) {
      bad('E_DATA_MISSING', `artifact_paths[${i}] 必须解析到工作区的 .team/ 里面并且真的存在（这一格解析到 ${resolved.abs}），实得 ${JSON.stringify(rel)}`)
      continue
    }
    artifactRels.push(resolved.rel)
  }

  // ── 最后才动盘上的字节：形状都对了，报告 / 回执两个摘要必须与盘上字节逐字相同 ──
  let actual = null
  let actualReceipt = null
  if (problems.length === 0) {
    actual = sha256File(report.abs)
    if (actual.toLowerCase() !== String(spec.report_sha256).trim().toLowerCase()) {
      bad('E_ARG_HASH', `report_sha256 与报告盘上字节对不上（登记 ${String(spec.report_sha256).slice(0, 12)}…，盘上 ${actual.slice(0, 12)}…）—— 锚点必须来自作业产物`)
    }
    // 回执那一份：`receipt_sha256` 是**回执文件的字节**（不是回执自己声明的那个值），对不上就不是锚。
    if (receiptPathGiven && receipt.rel !== null) {
      actualReceipt = sha256File(receipt.abs)
      if (actualReceipt.toLowerCase() !== String(spec.receipt_sha256).trim().toLowerCase()) {
        bad('E_ARG_HASH', `receipt_sha256 与回执盘上字节对不上（登记 ${String(spec.receipt_sha256).slice(0, 12)}…，盘上 ${actualReceipt.slice(0, 12)}…）—— 自报的摘要不算锚`)
      }
      // 版本：回执必须声明整数 `version`（`技术复盘回执.2.json` 声明 2），且等于登记的那一版。
      // 声明不出来 ⇒ `E_DATA_CORRUPT`（与 findings 读不出数组 `:580` 同一条规矩）：没被核过的数
      // 会经 `receipt_versions` 并进登记台账，一个写错的版本号能把那一版"占掉"。
      const declaredVersion = receiptVersionInFile(receipt.abs)
      if (declaredVersion === null) {
        bad('E_DATA_CORRUPT', `回执里没有整数的 version（读不出来或形状不对）：${receipt.abs}`)
      } else if (declaredVersion !== spec.receipt_version) {
        bad('E_ARG_SCHEMA', `receipt_version=${JSON.stringify(spec.receipt_version)} 与回执里声明的 version=${declaredVersion} 对不上：${receipt.abs}`)
      }
    }
  }
  const first = problems[0] ?? null
  return {
    ok: problems.length === 0,
    code: first?.code ?? null,
    message: first?.detail ?? '',
    report_abs: report.abs,
    findings_abs: findings.abs,
    receipt_abs: receipt.abs,
    report_rel: report.rel,
    findings_rel: findings.rel,
    receipt_rel: receipt.rel,
    receipt_rel_team: teamRelativeOf(receipt.rel),
    artifact_rels: artifactRels,
    actual_report_sha256: actual,
    actual_receipt_sha256: actualReceipt,
    findings_count_in_artifact: countInArtifact,
    receipt_policy: receiptPolicy,
    problems,
  }
}

/**
 * `local-mark` **写回节点的键**：键 → 怎么写回（**一处定义**，`applyMark` 逐条执行，`MARK_WRITE_KEYS` 就是它的键）。
 *
 * 这张表是**白名单**：不在表里的 payload 键一个都不写 —— 而且不再静默：`bin/agenia-local.mjs::opLocalMark`
 * 把它们收进返回信封的 `ignored_keys`、并在 stderr 报一行（`F-162` 的病根就是"收下了、`ok:true`、就是没落盘"）。
 *
 * 表里有一格是**派生**的：`receipt_versions`（登记台账，C-4/C-6 的"空洞不填"靠它判）只从 `receipt_version`
 * 长出来 —— payload 直接给这一串不收（`MARK_DERIVED_KEYS`），跟在 `receipt_version` 后面一行，顺序即依赖。
 *
 * 两格**不在这张表里**、也不许由 payload 给：`liveness_at`（落地那一刻，时钟给）与 `failure_reason`
 * （`state === 'done'` 时清空）—— 它们由 `state` 与时间派生，不是调用方的输入。
 * `findings_sha256` 也不在表里：它是 `findings_set_sha256` 的另一种拼法（§B1.4 / §B3.6），只读、不单独落键。
 */
const MARK_WRITERS = Object.freeze({
  /** 落地状态（缺省 `done`）。 */
  state: (next, spec) => { next.state = isFilledString(spec.state) ? String(spec.state).trim() : 'done' },
  report_path: (next, spec) => { if (isFilledString(spec.report_path)) next.report_path = String(spec.report_path).trim() },
  report_sha256: (next, spec) => { if (isFilledString(spec.report_sha256)) next.report_sha256 = String(spec.report_sha256).trim().toLowerCase() },
  findings_path: (next, spec) => { if (isFilledString(spec.findings_path)) next.findings_path = String(spec.findings_path).trim() },
  findings_set_sha256: (next, spec) => {
    const setSha = isFilledString(spec.findings_set_sha256) ? spec.findings_set_sha256 : (isFilledString(spec.findings_sha256) ? spec.findings_sha256 : null)
    if (setSha !== null) next.findings_set_sha256 = String(setSha).trim().toLowerCase()
  },
  findings_count: (next, spec) => { if (Number.isInteger(spec.findings_count)) next.findings_count = spec.findings_count },
  /** 回执三件套（§12.2.4）。路径与摘要写的是闸归一 / 核过的那一份。 */
  receipt_path: (next, spec) => { if (isFilledString(spec.receipt_path)) next.receipt_path = String(spec.receipt_path).trim() },
  receipt_sha256: (next, spec) => { if (isFilledString(spec.receipt_sha256)) next.receipt_sha256 = String(spec.receipt_sha256).trim().toLowerCase() },
  receipt_version: (next, spec) => { if (Number.isInteger(spec.receipt_version)) next.receipt_version = spec.receipt_version },
  /** 登记台账（派生）：本节点登记过的回执版本，`local-receipt-set` 拿它判"这一版已经登记过"。 */
  receipt_versions: (next, spec, node) => {
    if (!Number.isInteger(spec.receipt_version)) return
    next.receipt_versions = [...new Set([...receiptVersionsOf(node), spec.receipt_version])].sort((a, b) => a - b)
  },
  artifact_paths: (next, spec) => { if (Array.isArray(spec.artifact_paths)) next.artifact_paths = spec.artifact_paths.map(String) },
})

/** `local-mark` 写回节点的键（白名单；由 `MARK_WRITERS` 的键导出来，不许另抄一份）。 */
export const MARK_WRITE_KEYS = Object.freeze(Object.keys(MARK_WRITERS))

/**
 * 在白名单里、但**不由 payload 给**的键：它们由同一张表里别格派生。
 *
 * 进了白名单 ≠ 收得下（`receipt_versions` 由 `receipt_version` 派生，payload 直接给的那一串不参与）——
 * 所以 CLI 的 `ignored_keys` 要把它照样点名报出来，别让"表里没有"变成"收了但不写"。
 */
export const MARK_DERIVED_KEYS = Object.freeze(['receipt_versions'])

/**
 * `local-mark` 的 payload 里**只读不写**的键：地址那几格 + 一个拼法别名。
 * 其余既不在写表白名单、也不在这里的键，CLI 会当成"没落盘的输入"点名报出来。
 */
export const MARK_READ_KEYS = Object.freeze(['day', 'project', 'field', 'snapshot', 'session_id', 'workspace', 'findings_sha256'])

/**
 * 把锚点写进节点（纯函数）。写回的键**只**取 `MARK_WRITE_KEYS` 那张白名单（§12.2.4）；
 * 锚点必须在事务之前由 `artifactAnchorVerdict` 核过 —— 本函数只负责"核过的那一份怎么落键"。
 * 逐条执行、按表里的次序（`receipt_versions` 排在 `receipt_version` 后面，它读的是派生出来的那一版）。
 */
export function applyMark(node, spec = {}, at) {
  const next = { ...node }
  for (const key of MARK_WRITE_KEYS) MARK_WRITERS[key](next, spec, node)
  // 派生的两格：落地那一刻 + `done` 不留旧失败原因（都不读 payload）。
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
