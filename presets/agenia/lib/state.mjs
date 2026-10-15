/**
 * 共享更新状态（shared update state）· 作业记录 · 审计链 —— 读 / 写 / 不变量校验。
 *
 * 冻结依据：
 *   · 提案 §B3.6 的**字段表**（`state/update/<day>.json` 与 `state/jobs/<job_id>.json` 逐字段照抄）；
 *   · 提案 §B1.4 的 op 表（谁写哪个字段由那一张表说了算）；
 *   · 提案 §B3.7（原子写走 `lib/atomic.mjs`、锁在 `<dataRoot>/locks/`、读-改-写全程持锁、CAS 绝不覆盖）；
 *   · 追加裁定 **D-B3**（`init` 只在空根成功 ⇒ 非空根 `E_DATA_EXISTS`/exit 7）·
 *     **D-B4**（`is_double_low` 是**已发布值**，本模块只搬运、不重算）·
 *     **E-B5 / v1.4**（`redo:true` 必须同时带 `previous_attempt_id` 与 `boss_redo_evidence`）；
 *   · 追加裁定 **v1.10 ②**（`E_ARG_SCHEMA` ⇒ 2 · `E_TXN_IO` ⇒ 4，两个码只有一个来源 `error-codes.mjs`）。
 *
 * 五条口径：
 *   ① **状态只有一份形状**：`newUpdateState()` 造出来的对象就是磁盘上的对象 —— 没有第二份"内部状态"。
 *   ② **`judge_token` 只存 sha256 前 16 位**（B3.6 明文），原始 token 只在返回值里出现一次。
 *   ③ **不变量在写入之前查**：`validateUpdateState()` 同时给"读别人写的"和"写自己要写的"用；
 *      `phase === 'judging' ⇒ snapshot_available === false` 是硬的那一条。
 *   ④ **租约分钟数只有一个来源**：`lib/liveness.mjs` 的 `LEASES`（update 90 / local 45）。
 *      本模块**不许**再写一份数字 —— 两处各写一份，迟早会在 89/90/91 那一格上分叉。
 *   ⑤ **审计只增不改**：`appendAudit()` 每条带 `prev_sha256 → next_sha256`，读者能自查链条断没断。
 *
 * ⚠️ 本模块**不做**根判定（那是 `lib/paths.mjs` 的活），也**不做**进程级调度 —— 它只认 root 字符串。
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import { readJsonFile, writeJsonAtomic, writeFileAtomic } from './atomic.mjs'
import { now as clockNow } from './clock.mjs'
import { LEASES } from './liveness.mjs'

/** 状态 schema 版本（B3.6 第一行就是它）。 */
export const STATE_SCHEMA = 1

/** `phase` 的八个取值（B3.6 枚举，逐字）。 */
export const PHASES = Object.freeze([
  'unclaimed', 'judging', 'awaiting_review_start', 'reviewing', 'done', 'partial', 'failed', 'abandoned',
])

/** 作业记录的 `state` 枚举（B3.6）。 */
export const JOB_STATES = Object.freeze(['running', 'done', 'failed', 'stale', 'abandoned'])

/** 四个作业角色（提案 §B2.2 的表）。 */
export const JOB_ROLES = Object.freeze(['memory-judge', 'memory-review', 'conversation-review', 'technical-review'])

/** 角色 → 工具名（§B2.2 冻结的映射；写歪了就是"叫不动那个人"）。 */
export const ROLE_TOOL_NAMES = Object.freeze({
  'memory-judge': 'job_memory_judge',
  'memory-review': 'job_memory_review',
  'conversation-review': 'job_conversation_review',
  'technical-review': 'job_technical_review',
})

/**
 * 调用方惯用的简称 → 角色（`job-mark` 的 `job` 字段既收 `judge` 也收 `memory-judge`）。
 * ⚠️ 不收的写法一律拒（`E_ARG_SCHEMA`）—— 猜一个"最像的"会把写错名字变成静默的错角色。
 */
export const ROLE_ALIASES = Object.freeze({
  'judge': 'memory-judge',
  'memory-judge': 'memory-judge',
  'review': 'memory-review',
  'memory-review': 'memory-review',
  'conversation': 'conversation-review',
  'conversation-review': 'conversation-review',
  'technical': 'technical-review',
  'technical-review': 'technical-review',
})

/** judge-start 允许开工的 phase —— 别的一律 `E_STATE_PHASE`。 */
export const PHASES_FOR_JUDGE_START = Object.freeze(['unclaimed', 'judging', 'failed', 'partial'])

/** 四类硬帽字段的键名扫描（§B3.4 口径，与测试同一形状）。 */
const CAP_KEY_RE = /(^|_)(cap|limit|max|quota)_?(count|chars|entries)?$/i

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const SNAPSHOT_VERSION_RE = /^v(\d+)$/
const HEX64_RE = /^[0-9a-f]{64}$/i

function brainError(code, message, detail) {
  const err = new Error(message)
  err.name = 'BrainStateError'
  err.code = code
  err.detail = detail ?? null
  return err
}

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex')
}

/** 键按字典序的规范化 JSON —— 审计链与内容哈希共用它（同一对象永远同一个串）。 */
export function stableStringify(value) {
  const walk = (v) => {
    if (Array.isArray(v)) return `[${v.map(walk).join(',')}]`
    if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
    const keys = Object.keys(v).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${walk(v[k])}`).join(',')}}`
  }
  return walk(value)
}

/** **本地日历日**（老板看到的"今天"；与 `lib/memory.mjs` 的今日口径同一形状）。 */
export function dayOf(date = clockNow()) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isDayKey(value) {
  return typeof value === 'string' && DAY_KEY_RE.test(value.trim())
}

export function isSnapshotVersion(value) {
  return typeof value === 'string' && SNAPSHOT_VERSION_RE.test(value.trim())
}

/** 当前时刻的 ISO8601（只从 `lib/clock.mjs` 进 —— 生产逻辑里不许出现裸 `Date`）。 */
export function nowIso() {
  return clockNow().toISOString()
}

// ── 落点（`<dataRoot>` 之下的全部路径都只从这里出）───────────────────────────
export const stateDir = (root) => path.join(root, 'state')
export const updateDir = (root) => path.join(root, 'state', 'update')
export const updateStatePath = (root, day) => path.join(updateDir(root), `${day}.json`)
export const jobsDir = (root) => path.join(root, 'state', 'jobs')
export const jobPath = (root, jobId) => path.join(jobsDir(root), `${jobId}.json`)
export const locksDir = (root) => path.join(root, 'locks')
export const updateLockPath = (root, day) => path.join(locksDir(root), `update-${day}.lock`)
export const currentDayPath = (root) => path.join(stateDir(root), 'current-day.json')
export const commonSensePath = (root) => path.join(root, 'common-sense.md')
export const commonSenseRecordPath = (root) => path.join(stateDir(root), 'common-sense.json')
export const auditPath = (root) => path.join(root, 'audit.jsonl')
export const memoryDir = (root) => path.join(root, 'memory')
export const snapshotsDir = (root) => path.join(root, 'memory', 'snapshots')
export const archiveDir = (root) => path.join(root, 'memory', 'archive')
export const reportsDir = (root) => path.join(root, 'reports', 'memory-update')
export const reportRelPath = (day) => `reports/memory-update/${day}.json`
export const noticesDir = (root) => path.join(root, 'notices')
export const proposalsDir = (root) => path.join(root, 'proposals')
export const poolPath = (root) => path.join(root, 'proposals', 'pool.jsonl')
export const poolLockPath = (root) => path.join(root, 'proposals', '.pool.lock')

/** `init` 落的那份常识骨架 —— **确定性文本**（同一个哈希每次都一样，CS 三处核对才有意义）。 */
export const COMMON_SENSE_TEMPLATE = [
  '# 常识（老板直写 · Agenia 只读）',
  '',
  '> 这一份由老板维护。Agenia 只读它；要改，由老板亲手改，改完再用 `cs-confirm` 记下新的哈希。',
  '',
].join('\n')

/**
 * 根里除了 marker 之外还有没有东西 —— `init` 的"空根"判据（D-B3）。
 * ⚠️ marker（`.agenia-test-root`）不算"东西"：测试根一建出来就带着它。
 */
export function rootIsEmpty(root) {
  let names = []
  try {
    names = readdirSync(root)
  } catch {
    return { empty: true, entries: [] } // 根还不存在 = 空的
  }
  const entries = names.filter((n) => n !== '.agenia-test-root')
  return { empty: entries.length === 0, entries }
}

/** 建出整套目录骨架（幂等；不写任何文件）。 */
export function ensureLayout(root) {
  for (const dir of [
    stateDir(root), updateDir(root), jobsDir(root), locksDir(root),
    memoryDir(root), snapshotsDir(root), archiveDir(root),
    path.join(root, 'reports'), reportsDir(root),
    proposalsDir(root), noticesDir(root),
  ]) {
    mkdirSync(dir, { recursive: true })
  }
  return root
}

// ── 共享更新状态 ───────────────────────────────────────────────────────────
/**
 * 造一份 §B3.6 的共享更新状态（**每一个必填键都在**，缺一个就是"读起来像样的坏数据"）。
 *
 * @param {object} spec
 * @param {string} spec.day                     `YYYY-MM-DD`
 * @param {string|null} spec.ownerProject
 * @param {string|null} spec.ownerSession
 * @param {string} spec.commonSenseSha256       开工那一刻的常识哈希
 * @param {number} [spec.generation]            默认 1
 * @param {number} [spec.judgeAttempt]          默认 0（claim 之后写 1）
 * @param {string|null} [spec.judgeToken]       只收**已哈希**的那个 16 位串
 * @param {string} [spec.at]                    ISO8601；缺省走时钟
 */
export function newUpdateState(spec = {}) {
  const {
    day,
    ownerProject = null,
    ownerSession = null,
    commonSenseSha256 = null,
    generation = 1,
    judgeAttempt = 0,
    judgeToken = null,
    at = nowIso(),
  } = spec
  if (!isDayKey(day)) throw brainError('E_ARG_SCHEMA', `newUpdateState：day 必须是 YYYY-MM-DD，实得 ${JSON.stringify(day)}`)
  return {
    schema: STATE_SCHEMA,
    day,
    generation,
    phase: 'unclaimed',
    snapshot_available: false,
    snapshot_ready_at: null,
    owner_project: ownerProject,
    owner_session: ownerSession,
    judge_attempt: judgeAttempt,
    review_attempt: 0,
    judge_token: judgeToken,
    frozen_proposal_ids: [],
    base_snapshot: null,
    new_snapshot: null,
    common_sense_sha256: commonSenseSha256,
    reports: { memory_update: null },
    started_at: at,
    last_liveness_event_at: at,
    finished_at: null,
    update_lease_minutes: LEASES.update,
    failure_reason: null,
  }
}

/** 逐类硬帽键递归扫描（§B3.4：对象里带 `type`/`typeId` 又带上限键 ⇒ `E_STATE_TYPE_CAP`）。 */
export function typeCapKeysOf(obj, at = '$', out = []) {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => typeCapKeysOf(v, `${at}[${i}]`, out))
    return out
  }
  if (obj === null || typeof obj !== 'object') return out
  const keys = Object.keys(obj)
  const hasTypeKey = keys.some((k) => k === 'type' || k === 'typeId')
  for (const k of keys) {
    if (hasTypeKey && CAP_KEY_RE.test(k)) out.push(`${at}.${k}`)
    typeCapKeysOf(obj[k], `${at}.${k}`, out)
  }
  return out
}

const UPDATE_REQUIRED = [
  'schema', 'day', 'generation', 'phase', 'snapshot_available', 'snapshot_ready_at',
  'owner_project', 'owner_session', 'judge_attempt', 'review_attempt', 'judge_token',
  'frozen_proposal_ids', 'base_snapshot', 'new_snapshot', 'common_sense_sha256', 'reports',
  'started_at', 'last_liveness_event_at', 'finished_at', 'update_lease_minutes', 'failure_reason',
]

/**
 * 共享更新状态的形状与不变量校验（**读写两侧共用**）。
 *
 * @returns {{ok:boolean, code:string|null, problems:Array<{code:string,detail:string}>}}
 */
export function validateUpdateState(state) {
  const problems = []
  const bad = (code, detail) => problems.push({ code, detail })
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, code: 'E_DATA_CORRUPT', problems: [{ code: 'E_DATA_CORRUPT', detail: 'state 不是一个对象' }] }
  }
  for (const key of UPDATE_REQUIRED) {
    if (!(key in state)) bad('E_DATA_CORRUPT', `缺必填键 ${key}（提案 §B3.6）`)
  }
  if (state.schema !== STATE_SCHEMA) bad('E_DATA_CORRUPT', `schema 必须是 ${STATE_SCHEMA}，实得 ${JSON.stringify(state.schema)}`)
  if (!isDayKey(state.day)) bad('E_DATA_CORRUPT', `day 必须是 YYYY-MM-DD，实得 ${JSON.stringify(state.day)}`)
  if (!PHASES.includes(state.phase)) bad('E_DATA_CORRUPT', `phase 不在枚举里：${JSON.stringify(state.phase)}`)
  if (typeof state.snapshot_available !== 'boolean') bad('E_DATA_CORRUPT', 'snapshot_available 必须是 boolean')
  if (!Number.isInteger(state.generation) || state.generation < 1) bad('E_DATA_CORRUPT', `generation 必须是 ≥1 的整数，实得 ${JSON.stringify(state.generation)}`)
  if (!Number.isInteger(state.judge_attempt) || state.judge_attempt < 0) bad('E_DATA_CORRUPT', 'judge_attempt 必须是 ≥0 的整数')
  if (!Number.isInteger(state.review_attempt) || state.review_attempt < 0) bad('E_DATA_CORRUPT', 'review_attempt 必须是 ≥0 的整数')
  if (!Array.isArray(state.frozen_proposal_ids)) bad('E_DATA_CORRUPT', 'frozen_proposal_ids 必须是数组')
  if (state.reports === null || typeof state.reports !== 'object') bad('E_DATA_CORRUPT', 'reports 必须是对象（`{memory_update: string|null}`）')
  if (state.judge_token !== null && (typeof state.judge_token !== 'string' || state.judge_token.length > 32)) {
    bad('E_DATA_CORRUPT', `judge_token 只许存 sha256 前 16 位（null 或 ≤32 字符串），实得 ${JSON.stringify(state.judge_token)}`)
  }
  if (state.common_sense_sha256 !== null && !HEX64_RE.test(String(state.common_sense_sha256))) {
    bad('E_DATA_CORRUPT', `common_sense_sha256 必须是 64 hex 或 null，实得 ${JSON.stringify(state.common_sense_sha256)}`)
  }
  if (state.update_lease_minutes !== LEASES.update) {
    bad('E_DATA_CORRUPT', `update_lease_minutes 必须是 ${LEASES.update}（唯一来源 lib/liveness.mjs），实得 ${JSON.stringify(state.update_lease_minutes)}`)
  }
  // B3.6 的硬不变量
  if (state.phase === 'judging' && state.snapshot_available === true) {
    bad('E_STATE_TYPE_CAP', '不变量破了：`phase==="judging"` 时 `snapshot_available` 必须是 false')
  }
  const caps = typeCapKeysOf(state)
  for (const key of caps) bad('E_STATE_TYPE_CAP', `状态里出现逐类硬帽字段 ${key}（四类不设硬帽，§B3.4）`)
  return { ok: problems.length === 0, code: problems.length === 0 ? null : problems[0].code, problems }
}

export function readUpdateState(root, day) {
  const file = updateStatePath(root, day)
  const read = readJsonFile(file)
  if (!read.ok) return { ok: false, code: read.code, state: null, path: file, message: read.message }
  const check = validateUpdateState(read.value)
  if (!check.ok) {
    return { ok: false, code: check.code, state: null, path: file, message: `状态不合形状：${check.problems.map((p) => p.detail).join('；')}` }
  }
  return { ok: true, code: null, state: read.value, path: file, message: '' }
}

/** 原子写状态（**先校验再写** —— 写进去的必须是自己也读得回来的那份）。 */
export function writeUpdateState(root, day, state, options = {}) {
  const check = validateUpdateState(state)
  if (!check.ok) throw brainError(check.code, `拒绝写入不成形状的状态：${check.problems.map((p) => p.detail).join('；')}`, check.problems)
  const file = updateStatePath(root, day)
  const written = writeJsonAtomic(file, state, options)
  if (!written.ok) throw brainError(written.code, `状态写入失败：${written.message}`, { path: file })
  return { ok: true, path: file, bytes: written.bytes }
}

// ── 当前生效的那一天（指针）───────────────────────────────────────────────
/**
 * 读"当前那一天"。**调用方给的 day > 指针 > 时钟**（三级，顺序冻结）。
 * 为什么要有这个指针：`judge-*` / `state-read` / 导入的 payload 里**没有** `day`，
 * 而 STO/JOB 批都是先 `claim-update {day:'2026-10-14'}` 再调它们 —— 没有指针就只能去猜"今天"。
 */
export function readCurrentDay(root) {
  const read = readJsonFile(currentDayPath(root))
  if (!read.ok) return { ok: false, code: read.code, day: null, message: read.message }
  const day = read.value?.day
  if (!isDayKey(day)) return { ok: false, code: 'E_DATA_CORRUPT', day: null, message: `current-day 指针里的 day 不合法：${JSON.stringify(day)}` }
  return { ok: true, code: null, day, message: '' }
}

export function writeCurrentDay(root, day, options = {}) {
  const written = writeJsonAtomic(currentDayPath(root), { schema: 1, day, updated_at: nowIso() }, options)
  if (!written.ok) throw brainError(written.code, `current-day 指针写入失败：${written.message}`)
  return { ok: true, path: written.path }
}

/** 三级解析：显式 day → 指针 → 时钟。返回 `{day, source}`。 */
export function resolveDay(root, explicit = null) {
  if (isDayKey(explicit)) return { day: String(explicit).trim(), source: 'explicit' }
  const pointer = readCurrentDay(root)
  if (pointer.ok) return { day: pointer.day, source: 'pointer' }
  return { day: dayOf(clockNow()), source: 'clock' }
}

// ── token ─────────────────────────────────────────────────────────────────
/** 原始 token → **只存前 16 位**（B3.6 明文；原始 token 永远不落盘）。 */
export function hashToken(token) {
  return sha256Hex(String(token)).slice(0, 16)
}

/** 提交时对 token：状态里的哈希与调用方给的原始串要对得上。 */
export function tokenMatches(state, token) {
  if (typeof token !== 'string' || token === '') return false
  if (typeof state?.judge_token !== 'string' || state.judge_token === '') return false
  return hashToken(token) === state.judge_token
}

/** 新 token（32 hex）—— claim 没给 token 时用它。 */
export function mintToken() {
  return randomBytes(16).toString('hex')
}

// ── 作业记录 ───────────────────────────────────────────────────────────────
const JOB_REQUIRED = [
  'schema', 'job_id', 'role', 'tool_name', 'attempt', 'generation', 'parent_session_id',
  'parent_state', 'state', 'started_at', 'finished_at', 'last_liveness_event_at',
  'lease_minutes', 'result_path', 'failure_reason',
]

/**
 * 造一份 §B3.6 的作业记录。`fence` 是**实现内部**的加性键（旧 attempt 的结果不许回写时用它，
 * 测试不许断言它的名字 —— 见 `lib/liveness.mjs` 头注释同一条口径）。
 */
export function newJobRecord(spec = {}) {
  const {
    jobId, role, attempt, generation, parentSessionId = null, parentState = 'unknown',
    state = 'running', at = nowIso(), resultPath = null, failureReason = null,
  } = spec
  if (typeof jobId !== 'string' || jobId === '') throw brainError('E_ARG_SCHEMA', `newJobRecord：job_id 必填，实得 ${JSON.stringify(jobId)}`)
  if (!JOB_ROLES.includes(role)) throw brainError('E_ARG_SCHEMA', `newJobRecord：role 不在四作业里：${JSON.stringify(role)}`)
  return {
    schema: STATE_SCHEMA,
    job_id: jobId,
    role,
    tool_name: ROLE_TOOL_NAMES[role],
    attempt,
    generation,
    parent_session_id: parentSessionId,
    parent_state: parentState,
    state,
    started_at: at,
    finished_at: null,
    last_liveness_event_at: at,
    lease_minutes: LEASES.update,
    result_path: resultPath,
    failure_reason: failureReason,
    fence: { generation, attempt, job_id: jobId },
  }
}

export function validateJobRecord(record) {
  const problems = []
  const bad = (detail) => problems.push({ code: 'E_DATA_CORRUPT', detail })
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, code: 'E_DATA_CORRUPT', problems: [{ code: 'E_DATA_CORRUPT', detail: 'job 记录不是一个对象' }] }
  }
  for (const key of JOB_REQUIRED) if (!(key in record)) bad(`缺必填键 ${key}（提案 §B3.6）`)
  if (!JOB_ROLES.includes(record.role)) bad(`role 不在四作业里：${JSON.stringify(record.role)}`)
  if (!JOB_STATES.includes(record.state)) bad(`state 不在枚举里：${JSON.stringify(record.state)}`)
  if (record.lease_minutes !== LEASES.update) bad(`lease_minutes 必须是 ${LEASES.update}（唯一来源 lib/liveness.mjs）`)
  if (!['alive', 'dead', 'unknown'].includes(record.parent_state)) {
    bad(`parent_state 不在枚举里：${JSON.stringify(record.parent_state)}`)
  }
  return { ok: problems.length === 0, code: problems.length === 0 ? null : 'E_DATA_CORRUPT', problems }
}

export function readJob(root, jobId) {
  const file = jobPath(root, jobId)
  const read = readJsonFile(file)
  if (!read.ok) return { ok: false, code: read.code, job: null, path: file, message: read.message }
  return { ok: true, code: null, job: read.value, path: file, message: '' }
}

export function writeJob(root, job, options = {}) {
  const check = validateJobRecord(job)
  if (!check.ok) throw brainError(check.code, `拒绝写入不成形状的作业记录：${check.problems.map((p) => p.detail).join('；')}`)
  const file = jobPath(root, job.job_id)
  const written = writeJsonAtomic(file, job, options)
  if (!written.ok) throw brainError(written.code, `作业记录写入失败：${written.message}`, { path: file })
  return { ok: true, path: file, bytes: written.bytes }
}

export function listJobIds(root) {
  try {
    return readdirSync(jobsDir(root)).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).sort()
  } catch {
    return []
  }
}

/**
 * launch intent —— **派工先落盘**（JOB-01 ①）。
 * claim 那一刻还不知道 job id（payload 里没有），所以先落一份 intent，
 * `judge-start` 再按它建真正的作业记录；两件事分开，才有"先落盘再起作业"这个次序。
 */
export function launchIntentPath(root, day, generation, attempt, role = 'memory-judge') {
  return path.join(jobsDir(root), `intent-${day}-g${generation}-a${attempt}-${role}.json`)
}

export function writeLaunchIntent(root, spec = {}) {
  const { day, generation, attempt, role = 'memory-judge', ownerProject = null, ownerSession = null, at = nowIso() } = spec
  const file = launchIntentPath(root, day, generation, attempt, role)
  const written = writeJsonAtomic(file, {
    schema: STATE_SCHEMA,
    kind: 'launch_intent',
    role,
    tool_name: ROLE_TOOL_NAMES[role],
    day,
    generation,
    attempt,
    owner_project: ownerProject,
    parent_session_id: ownerSession,
    created_at: at,
    state: 'pending',
  })
  if (!written.ok) throw brainError(written.code, `launch intent 写入失败：${written.message}`, { path: file })
  return { ok: true, path: file }
}

// ── 审计链（只增不改）──────────────────────────────────────────────────────
/**
 * 追加一条审计。每条带 `prev_sha256`（上一条的 `next_sha256`）与自己的 `next_sha256`，
 * 读者能自查"链条断没断" —— 半截写或被人抽掉一条都会当场露出来。
 */
export function appendAudit(root, { kind, detail = {}, at = null } = {}) {
  if (typeof kind !== 'string' || kind === '') throw brainError('E_ARG_SCHEMA', `appendAudit：kind 必填，实得 ${JSON.stringify(kind)}`)
  const file = auditPath(root)
  mkdirSync(path.dirname(file), { recursive: true })
  let seq = 0
  let prev = null
  if (existsSync(file)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '')
    seq = lines.length
    if (seq > 0) {
      try {
        prev = JSON.parse(lines[seq - 1])?.next_sha256 ?? null
      } catch {
        throw brainError('E_DATA_CORRUPT', `审计文件最后一行不是 JSON：${file}`)
      }
    }
  }
  const record = { schema: 1, seq: seq + 1, at: at ?? nowIso(), kind, detail, prev_sha256: prev }
  record.next_sha256 = sha256Hex(stableStringify(record))
  appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
  return { ok: true, code: null, audit_path: file, seq: record.seq, next_sha256: record.next_sha256 }
}

/** 审计条数（读面/探针用；空文件是 0）。 */
export function auditSeq(root) {
  try {
    return readFileSync(auditPath(root), 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').length
  } catch {
    return 0
  }
}

// ── 常识（老板直写、Agenia 只读）──────────────────────────────────────────
/**
 * 读常识：**正文**在 `common-sense.md`，**确认记录**在 `state/common-sense.json`。
 * 提交时核的是"确认记录里的哈希"（`cs-confirm` 写它）；记录不在 ⇒ 退回正文自己的哈希。
 */
export function readCommonSense(root) {
  const text = existsSync(commonSensePath(root)) ? readFileSync(commonSensePath(root), 'utf8') : null
  const textSha = text === null ? null : sha256Hex(text)
  const record = readJsonFile(commonSenseRecordPath(root))
  const recorded = record.ok && HEX64_RE.test(String(record.value?.sha256 ?? '')) ? record.value : null
  const sha256 = recorded ? String(recorded.sha256).toLowerCase() : textSha
  return {
    ok: sha256 !== null,
    code: sha256 === null ? 'E_DATA_MISSING' : null,
    sha256,
    text_sha256: textSha,
    confirmed_by: recorded?.confirmed_by ?? null,
    confirmed_at: recorded?.confirmed_at ?? null,
    path: commonSensePath(root),
    message: sha256 === null ? `常识文件与确认记录都不在：${commonSensePath(root)}` : '',
  }
}

/** `cs-confirm`：记下老板确认的那一个哈希（**不伪造正文** —— 只记"他确认的是这个"）。 */
export function writeCommonSenseConfirmation(root, { sha256, confirmedBy = 'boss', confirmedAt = null } = {}) {
  if (!HEX64_RE.test(String(sha256 ?? ''))) throw brainError('E_ARG_HASH', `cs-confirm：sha256 必须是 64 hex，实得 ${JSON.stringify(sha256)}`)
  const previous = readCommonSense(root)
  const file = commonSenseRecordPath(root)
  const written = writeJsonAtomic(file, {
    schema: STATE_SCHEMA,
    sha256: String(sha256).toLowerCase(),
    confirmed_by: confirmedBy,
    confirmed_at: confirmedAt ?? nowIso(),
    previous_sha256: previous.sha256,
  })
  if (!written.ok) throw brainError(written.code, `常识确认写入失败：${written.message}`, { path: file })
  return { ok: true, path: file, common_sense_sha256: String(sha256).toLowerCase() }
}

/** 原子写常识正文（只有 `init` 用它）。 */
export function writeCommonSenseText(root, text) {
  const written = writeFileAtomic(commonSensePath(root), text)
  if (!written.ok) throw brainError(written.code, `常识正文写入失败：${written.message}`)
  return { ok: true, path: written.path, sha256: sha256Hex(text) }
}

export { brainError }
