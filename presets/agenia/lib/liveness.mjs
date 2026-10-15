/**
 * 事件式 liveness —— 时间戳写入 · 过期判定 · 父进程存活 · 父死接缝。
 *
 * 冻结依据：
 *   · 提案 §B1.5：`staleVerdict(lastEventAt, now, leaseMinutes)` 的签名与返回形状
 *     （B1.5 把它的**落点**写在 `lib/health.mjs`；本轮实现的**本体**在这里，
 *      `health.mjs` 落盘时 `export { staleVerdict } from './liveness.mjs'` 即可 —— 一份实现、两个入口）。
 *   · 提案 §B1.6：父死接缝写 `parent_state:"dead"`；`parentAlive()` 可被 `AGENIA_PARENT_ALIVE_FILE` 覆盖；
 *     **不许杀真实进程**来模拟父死。
 *   · 提案 §B3.6：`last_liveness_event_at`（job 记录）/ `liveness_at`（本地场）是**事件式**，不是心跳。
 *   · 提案 §B3.7：僵锁判定读持有者 pid 还活着吗 —— 用的就是本模块的 `parentAlive`。
 *   · 追加裁定 v1.2 **C-5**：`ageMinutes >= leaseMinutes` 即 stale
 *     （update 90 与 local 45 同一条规则：89 分钟 fresh · 90 分钟 stale · 91 分钟 stale）。
 *   · 追加裁定 **v1.10 ③**：`staleVerdict` 返回里那个 `reason` 三态是**加性扩展**（保留，见下）；
 *     本模块写出去的 liveness 记录里，**除 `parent_state` 与 B3.6 已冻的 `last_liveness_event_at` /
 *     `liveness_at` 之外**的键（`parent_session_id` / `session_id` / `updated_at` / `schema`）
 *     属**实现内部** —— 测试只许断言 `parent_state` 的存在与枚举，不许把那些加性键的名字写进断言
 *     （写进去就是第二份来源）。
 *
 * 三条纪律：
 *   ① **事件式**：这里只有"某件事发生了 ⇒ 盖一个时间戳"。没有定时器、没有心跳 ——
 *      "作业还活着"永远由**事件**回答，不由"多久没出事"回答。
 *   ② **只前进不后退**：`stampLiveness` 不许把已有时间戳往回写（迟到的完成事件不算"更新"）。
 *   ③ **判定只读、时间只从参数进**：`staleVerdict` 是纯函数；需要"现在"的地方走 `lib/clock.mjs`
 *      （`AGENIA_NOW_FILE` 可注入），不在这里摸真实时钟。
 */
import path from 'node:path'
import { readJsonFile, writeJsonAtomic } from './atomic.mjs'
import { now as clockNow } from './clock.mjs'

/** 两个租约档（分钟）：update 90 / local 45（提案 §4 汇总）。 */
export const LEASES = Object.freeze({ update: 90, local: 45 })

/** 时间戳字段名（B3.6）：作业侧一个、本地场一个 —— 别混用。 */
export const LIVENESS_FIELDS = Object.freeze({ job: 'last_liveness_event_at', local: 'liveness_at' })

/** 父进程状态（B3.6 的 `parent_state` 枚举）。 */
export const PARENT_STATES = Object.freeze(['alive', 'dead', 'unknown'])

/** 父存活覆盖点的变量名（B1.6 冻结）。 */
export const PARENT_ALIVE_FILE_VAR = 'AGENIA_PARENT_ALIVE_FILE'

function livenessError(code, message, detail) {
  const err = new Error(message)
  err.name = 'LivenessError'
  err.code = code
  err.detail = detail ?? null
  return err
}

/** ISO8601 / `Date` → 毫秒；解不出 ⇒ `null`（调用方决定怎么出声）。 */
function msOf(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (typeof value !== 'string' || value.trim() === '') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** 需要"现在"时：字符串原样用；`Date` 转 ISO；缺 ⇒ 走可注入时钟。 */
function isoOf(value) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return clockNow().toISOString()
}

/**
 * 过期判定（**C-5 逐字**：`ageMinutes >= leaseMinutes` 即 stale）。
 *
 * 三种"答不出来"都不许当成新鲜：
 *   · 时间戳缺失 ⇒ `{stale:true, ageMinutes:null, reason:'no_liveness_event'}`；
 *   · 时间戳坏（不是 ISO8601）⇒ `{stale:true, ageMinutes:null, reason:'bad_timestamp'}`；
 *   · `now` / `leaseMinutes` 本身不成形状 ⇒ **抛** `E_ARG_SCHEMA`（那是调用方的 bug，不是数据的状态）。
 *
 * 三态 `reason` 是追加裁定 **v1.10 ③** 认可的**加性扩展**（`null` = 答得出来）；返回就是这三个键，
 * 不多不少。**别的入口要它，只能从这里转出**（`lib/health.mjs` 就是这么干的）。
 *
 * 不做夹逼：时间戳在未来（时钟回拨/跨机）⇒ `ageMinutes` 为负、判 fresh，由断言层判它合不合理。
 *
 * @param {string|Date|null} lastEventAt
 * @param {string|Date} now
 * @param {number} leaseMinutes
 * @returns {{stale:boolean, ageMinutes:number|null, reason:string|null}}
 */
export function staleVerdict(lastEventAt, now, leaseMinutes) {
  const lease = Number(leaseMinutes)
  if (!Number.isFinite(lease) || lease <= 0) {
    throw livenessError('E_ARG_SCHEMA', `staleVerdict：leaseMinutes 必须是正数（冻结两档：update 90 / local 45），实得 ${JSON.stringify(leaseMinutes)}`)
  }
  const nowMs = msOf(now)
  if (nowMs === null) {
    throw livenessError('E_ARG_SCHEMA', `staleVerdict：now 必须是 ISO8601 或 Date，实得 ${JSON.stringify(now)}`)
  }
  const atMs = msOf(lastEventAt)
  if (atMs === null) {
    const missing = lastEventAt === undefined || lastEventAt === null || (typeof lastEventAt === 'string' && lastEventAt.trim() === '')
    return { stale: true, ageMinutes: null, reason: missing ? 'no_liveness_event' : 'bad_timestamp' }
  }
  const ageMinutes = (nowMs - atMs) / 60000
  return { stale: ageMinutes >= lease, ageMinutes, reason: null }
}

/**
 * 盖一次 liveness 事件（**只前进不后退**）。
 * 返回**新的**记录对象（不改入参）；已有时间戳更晚 ⇒ `advanced:false`，原值保留。
 *
 * @param {object} record 作业记录 / 本地场节点
 * @param {string|Date} at 这次事件的时间
 * @param {{field?:string}} [options] 字段名，默认作业侧那个（本地场传 `LIVENESS_FIELDS.local`）
 * @returns {{ok:true, record:object, field:string, at:string, previous:string|null, advanced:boolean}}
 */
export function stampLiveness(record, at, options = {}) {
  const field = typeof options?.field === 'string' && options.field !== '' ? options.field : LIVENESS_FIELDS.job
  const atIso = isoOf(at)
  const atMs = msOf(atIso)
  if (atMs === null) throw livenessError('E_ARG_SCHEMA', `stampLiveness：at 必须是 ISO8601 或 Date，实得 ${JSON.stringify(at)}`)
  const base = record !== null && typeof record === 'object' && !Array.isArray(record) ? { ...record } : {}
  const previous = typeof base[field] === 'string' && base[field].trim() !== '' ? base[field] : null
  const prevMs = msOf(previous)
  const advanced = prevMs === null || atMs > prevMs
  if (advanced) base[field] = atIso
  return { ok: true, record: base, field, at: atIso, previous, advanced }
}

/** 从记录里读 `parent_state`；不在 / 不认 ⇒ `null`（**不回落**成 alive）。 */
export function parentStateOf(record) {
  const raw = record !== null && typeof record === 'object' && !Array.isArray(record) ? record.parent_state : record
  if (typeof raw !== 'string') return null
  return PARENT_STATES.includes(raw) ? raw : null
}

/**
 * 读一份 liveness 文件：缺与坏分得开（`E_DATA_MISSING` / `E_DATA_CORRUPT`）。
 *
 * @param {string} file
 * @returns {{ok:boolean, code:string|null, record:object|null, parent_state:string|null, message:string}}
 */
export function readLiveness(file) {
  const target = path.resolve(String(file ?? ''))
  const read = readJsonFile(target)
  if (!read.ok) return { ok: false, code: read.code, record: null, parent_state: null, message: read.message }
  if (read.value === null || typeof read.value !== 'object' || Array.isArray(read.value)) {
    return { ok: false, code: 'E_DATA_CORRUPT', record: null, parent_state: null, message: `liveness 文件不是一个对象：${target}` }
  }
  return { ok: true, code: null, record: read.value, parent_state: parentStateOf(read.value), message: '' }
}

/**
 * 写一份 liveness 文件：只**并**字段，不覆盖别的键；原子写（同目录临时件 + 改名）。
 * 文件在、但内容坏 ⇒ **抛 `E_DATA_CORRUPT`**（不许把坏记录当成空记录覆盖掉）。
 *
 * @param {string} file
 * @param {object} patch 要并进去的字段
 * @param {object} [options] 透传给 `atomic.mjs` 的原子写（fsync / 重试）
 */
export function writeLiveness(file, patch = {}, options = {}) {
  if (file === undefined || file === null || String(file).trim() === '') {
    throw livenessError('E_ARG_SCHEMA', 'writeLiveness：file 必填')
  }
  const target = path.resolve(String(file))
  const current = readJsonFile(target)
  if (!current.ok && current.code !== 'E_DATA_MISSING') {
    throw livenessError(current.code, `liveness 文件读不动（不覆盖）：${current.message}`)
  }
  const base = current.ok && current.value !== null && typeof current.value === 'object' && !Array.isArray(current.value) ? current.value : {}
  const record = { schema: 1, ...base, ...(patch !== null && typeof patch === 'object' ? patch : {}) }
  const written = writeJsonAtomic(target, record, options)
  if (written.ok !== true) {
    return { ok: false, code: written.code, path: target, record: null, message: written.message }
  }
  return { ok: true, code: null, path: target, record, message: '' }
}

/**
 * 父死接缝（B1.6）：往 liveness 文件里写 `parent_state:"dead"`。
 * **不杀任何真实进程**；`parent_session_id` / `session_id` 只是留痕。
 *
 * @param {{file:string, parentSessionId?:string|null, sessionId?:string|null, now?:string|Date}} options
 */
export function markParentDead(options = {}) {
  const { file, parentSessionId = null, sessionId = null, now } = options ?? {}
  const at = isoOf(now)
  const written = writeLiveness(file, {
    parent_state: 'dead',
    parent_session_id: parentSessionId,
    session_id: sessionId,
    updated_at: at,
  })
  return { ...written, at, parent_state: 'dead' }
}

/**
 * 父进程还活着吗？
 *
 * ① 有覆盖点（显式 `options.file` 或环境里的 `AGENIA_PARENT_ALIVE_FILE`）⇒ **按那份文件判**：
 *    `parent_state === 'alive'` ⇒ true；`dead` / `unknown` ⇒ false；
 *    文件在但读不出 `parent_state` ⇒ **抛 `E_DATA_CORRUPT`**（不许静默当成活着）；
 *    覆盖点指着的那份**不在** ⇒ false（保守方向：僵锁给 `E_LOCK_STALE`、要显式回收，绝不静默抢写）。
 * ② 没有覆盖点 ⇒ 问进程表：`pid`（默认 `process.ppid`）还在不在；
 *    `EPERM` 算活着（进程在、只是不归我管，照 `atomic.mjs` 的保守方向）。
 *
 * ⚠️ 形状与 `atomic.mjs` 的 `parentAlive` 注入点一致：`(pid) => boolean`。
 *
 * @param {number} [pid]
 * @param {{file?:string, env?:Record<string,string|undefined>}} [options]
 * @returns {boolean}
 */
export function parentAlive(pid, options = {}) {
  const env = options?.env ?? process.env
  const file = options?.file ?? env?.[PARENT_ALIVE_FILE_VAR] ?? null
  if (file !== null && String(file).trim() !== '') {
    const read = readJsonFile(path.resolve(String(file)))
    if (!read.ok) {
      if (read.code === 'E_DATA_MISSING') return false
      throw livenessError('E_DATA_CORRUPT', `父存活覆盖文件读不动：${read.message}`)
    }
    const state = parentStateOf(read.value)
    if (state === null) {
      throw livenessError('E_DATA_CORRUPT', `父存活覆盖文件里没有可认的 parent_state（${PARENT_STATES.join('|')}）：${file}`)
    }
    return state === 'alive'
  }
  const target = Number(pid ?? process.ppid)
  if (!Number.isInteger(target) || target <= 0) return false
  try {
    process.kill(target, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}
