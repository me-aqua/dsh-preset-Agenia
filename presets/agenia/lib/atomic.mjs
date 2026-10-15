/**
 * 原子写 + 独占锁 —— 脑侧与路线侧共用同一套（提案 §B3.7）。
 *
 * 冻结依据：提案 §B3.7（位置、原子性、锁、CAS、审计）+ §B1.6（**只有**通知/时钟/父进程生命周期可 mock；
 *   锁、CAS、审计**一律不许 mock** —— 所以这个模块必须真的和文件系统打交道）。
 *
 * 四条口径：
 *   ① **临时件与目标同目录**：`<file>.tmp-<pid>-<rand>` ⇒ 同卷 `rename` 才原子。
 *      不跨卷写临时件（`_runs` 与 `_evidence` 同盘，但实现里不许假设）。
 *   ② **`fsync` 之后才 rename**；Windows 上 `rename` 会被占用文件的句柄顶成 `EPERM/EBUSY`
 *      ⇒ 指数退避重试 ≤5 次，仍失败给 `E_TXN_IO`（**不静默留下半截文件**）。
 *   ③ **锁 = `open(path,'wx')` 独占建**，内容 `{pid, session_id, at, ttl_ms}`。
 *      已存在 ⇒ 读出来判"持有者还活着吗 / 过期了吗"。**死锁不静默抢写** ⇒ `E_LOCK_STALE`，
 *      要显式 `--force-recover`（RT-01 的判据）。
 *   ④ **读-改-写全程持锁**；CAS（`expected_version`）由上层比对，本模块不管语义 —— 它只保证"写是原子的、锁是真的"。
 *
 * 判决风格与本目录其它纯函数一致：**返回 `{ok, code}`，不抛**（CLI 直接把它塞进错误信封）。
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

/** 进程死后多久算僵锁（毫秒）。锁只护住一次读-改-写，所以给 1 分钟就够；
 *  真正的"作业还活着吗"是另一套事件式 liveness（90/45 分钟，见 `lib/liveness.mjs`）。 */
const DEFAULT_LOCK_TTL_MS = 60_000

/** 这些 rename 失败是可重试的（Windows 上被占用的句柄）：①被占用 ②设备忙 ③权限瞬时拒绝。 */
const RETRYABLE_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES'])

/** 同步睡（无第三方依赖）：主线程上用 `Atomics.wait` 阻塞，不引入定时器与事件循环。 */
function sleepSync(ms) {
  if (!(ms > 0)) return
  const buf = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(buf, 0, 0, ms)
}

function ioError(message, extra = {}) {
  return { ok: false, code: 'E_TXN_IO', message, ...extra }
}

/**
 * 原子写一个文件（同目录临时件 → fsync → rename）。
 *
 * @param {string} file 目标文件（父目录会自动建）
 * @param {string|Buffer|Uint8Array} data 内容
 * @param {object} [options] `{ fsync?:boolean, maxAttempts?:number, retryBaseMs?:number, pid?, rand?, sleep? }`
 * @returns {{ok:true,code:null,path:string,bytes:number,attempts:number}|{ok:false,code:string,message:string,path?:string,attempts?:number}}
 */
export function writeFileAtomic(file, data, options = {}) {
  const {
    fsync = true,
    maxAttempts = 5,
    retryBaseMs = 15,
    pid = process.pid,
    rand = randomBytes(6).toString('hex'),
    sleep = sleepSync,
  } = options ?? {}

  const target = path.resolve(String(file))
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')
  // 临时件**必须同目录**（同卷 rename 才原子）；名字里带 pid+随机串，撞名会当场炸而不是静默覆盖。
  const tmp = `${target}.tmp-${pid}-${rand}`

  try {
    mkdirSync(path.dirname(target), { recursive: true })
  } catch (err) {
    return ioError(`目标目录建不出来：${err?.code ?? ''} ${err?.message}`, { path: target })
  }

  let handle = null
  try {
    handle = openSync(tmp, 'wx')
    writeSync(handle, buf)
    if (fsync) fsyncSync(handle)
    closeSync(handle)
    handle = null
  } catch (err) {
    if (handle !== null) {
      try { closeSync(handle) } catch { /* 已经在失败路径上，关不掉就算了 */ }
    }
    try { unlinkSync(tmp) } catch { /* 临时件可能压根没建起来 */ }
    return ioError(`写临时件失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { path: target })
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      renameSync(tmp, target)
      return { ok: true, code: null, path: target, bytes: buf.length, attempts: attempt }
    } catch (err) {
      const retryable = RETRYABLE_RENAME.has(err?.code)
      if (!retryable || attempt === maxAttempts) {
        try { unlinkSync(tmp) } catch { /* 尽力清掉临时件，别留残渣 */ }
        return ioError(`rename 失败（${err?.code ?? 'UNKNOWN'}，第 ${attempt} 次）：${err?.message}`, { path: target, attempts: attempt })
      }
      sleep(retryBaseMs * 2 ** (attempt - 1))
    }
  }
  return ioError('rename 重试耗尽', { path: target, attempts: maxAttempts })
}

/** 原子写一份 JSON（缩进 2 + 结尾换行：与本目录其它产物同一形状）。 */
export function writeJsonAtomic(file, obj, options = {}) {
  return writeFileAtomic(file, `${JSON.stringify(obj, null, 2)}\n`, options)
}

/**
 * 读一份 JSON —— **缺**与**坏**分得开（`E_DATA_MISSING` / `E_DATA_CORRUPT`），
 * 不许把坏文件读成"空对象"（那正是 §B1.7 "半截快照必须 E_DATA_CORRUPT" 的同一条道理）。
 */
export function readJsonFile(file) {
  const target = path.resolve(String(file))
  let text = null
  try {
    text = readFileSync(target, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: false, code: 'E_DATA_MISSING', value: null, message: `文件不存在：${target}` }
    return { ok: false, code: 'E_TXN_IO', value: null, message: `文件读不到（${err?.code ?? 'UNKNOWN'}）：${target}` }
  }
  try {
    return { ok: true, code: null, value: JSON.parse(text), message: '' }
  } catch (err) {
    return { ok: false, code: 'E_DATA_CORRUPT', value: null, message: `不是可解析 JSON（${String(err?.message).slice(0, 120)}）：${target}` }
  }
}

/** 读锁文件的内容（不改任何东西）。 */
export function readLock(lockPath) {
  const target = path.resolve(String(lockPath))
  let text = null
  try {
    text = readFileSync(target, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: false, code: 'E_DATA_MISSING', info: null, message: `锁不存在：${target}` }
    return { ok: false, code: 'E_TXN_IO', info: null, message: `锁读不到（${err?.code ?? 'UNKNOWN'}）：${target}` }
  }
  try {
    const info = JSON.parse(text)
    return { ok: true, code: null, info, message: '' }
  } catch {
    return { ok: false, code: 'E_DATA_CORRUPT', info: null, message: `锁内容是半截 JSON：${target}` }
  }
}

/** 持有者还活着吗 —— 可注入（B1.6 明确：父进程生命周期是允许 mock 的三种之一）。 */
function aliveOf(pid, injectable) {
  if (typeof injectable === 'function') return injectable(pid) === true
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM = 进程在、只是不归我管 ⇒ 算活着（保守：宁可判活，不判死）。
    return err?.code === 'EPERM'
  }
}

/**
 * 抢一把独占锁。
 *
 * - 拿到 ⇒ `{ok:true, info}`；
 * - 被活着的持有者占着 ⇒ `E_LOCK_HELD`；
 * - 僵锁（持有者已死 / 超过 `ttl_ms`）⇒ `E_LOCK_STALE`，**不静默抢写**；
 *   带上 `{forceRecover:true}`（CLI 的 `--force-recover`）才回收**这一个**锁文件再抢一次。
 *
 * @param {string} lockPath
 * @param {{session_id?:string|null, ttl_ms?:number, purpose?:string|null}} [meta]
 * @param {{pid?:number, at?:Date, parentAlive?:(pid:number)=>boolean, forceRecover?:boolean, nowMs?:number}} [options]
 */
export function acquireLock(lockPath, meta = {}, options = {}) {
  const { pid = process.pid, at = new Date(), parentAlive, forceRecover = false, nowMs = Date.now() } = options ?? {}
  const target = path.resolve(String(lockPath))
  const info = {
    pid,
    session_id: meta?.session_id ?? null,
    at: at.toISOString(),
    ttl_ms: meta?.ttl_ms ?? DEFAULT_LOCK_TTL_MS,
    purpose: meta?.purpose ?? null,
  }

  try {
    mkdirSync(path.dirname(target), { recursive: true })
  } catch (err) {
    return ioError(`锁目录建不出来：${err?.code ?? ''} ${err?.message}`, { path: target })
  }

  // ① 独占创建：成功就是我的（`wx` = 已存在即 EEXIST，绝不覆盖）
  try {
    const handle = openSync(target, 'wx')
    try {
      writeSync(handle, `${JSON.stringify(info)}\n`)
      fsyncSync(handle)
    } finally {
      closeSync(handle)
    }
    return { ok: true, code: null, info, path: target, message: '' }
  } catch (err) {
    if (err?.code !== 'EEXIST') return ioError(`建锁失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { path: target })
  }

  // ② 已存在 ⇒ 读内容，判"活着 / 过期"
  const read = readLock(target)
  const existing = read.ok ? read.info : null
  const ttl = Number.isFinite(existing?.ttl_ms) ? existing.ttl_ms : DEFAULT_LOCK_TTL_MS
  const startedMs = existing?.at ? Date.parse(existing.at) : NaN
  const ageMs = Number.isFinite(startedMs) ? nowMs - startedMs : Number.POSITIVE_INFINITY
  const expired = !(ageMs < ttl)
  const alive = existing ? aliveOf(existing.pid, parentAlive) : false

  if (existing && alive && !expired) {
    return { ok: false, code: 'E_LOCK_HELD', info: existing, path: target, message: `锁被 pid ${existing.pid} 占着（${Math.round(ageMs / 1000)} 秒）` }
  }

  if (forceRecover === true) {
    // 显式回收：只删这一个锁文件，然后**照原样再抢一次**（不递归，避免自喂）。
    try {
      unlinkSync(target)
    } catch (err) {
      if (err?.code !== 'ENOENT') return ioError(`回收僵锁失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { path: target })
    }
    const retry = acquireLock(target, meta, { ...options, forceRecover: false })
    return retry.ok ? { ...retry, recovered: true, recovered_from: existing } : retry
  }

  return {
    ok: false,
    code: 'E_LOCK_STALE',
    info: existing,
    path: target,
    message: `僵锁：${existing ? `pid ${existing.pid} 已不在或已过期` : `锁内容坏了（${read.code}）`} —— 不静默抢写，要显式 --force-recover`,
  }
}

/**
 * 放锁 —— **只放自己那把**（pid 不符要 `{force:true}` 才肯动手：替别人解锁会把并发保护拆掉）。
 */
export function releaseLock(lockPath, options = {}) {
  const { pid = process.pid, force = false } = options ?? {}
  const target = path.resolve(String(lockPath))
  const read = readLock(target)
  if (!read.ok) {
    if (read.code === 'E_DATA_MISSING') return { ok: true, code: null, path: target, message: '锁本来就不在（幂等释放）' }
    return { ok: false, code: read.code, path: target, message: read.message }
  }
  if (read.info?.pid !== pid && force !== true) {
    return { ok: false, code: 'E_LOCK_HELD', path: target, info: read.info, message: `锁不是本进程持有的（持有者 pid ${read.info?.pid}）—— 替别人放锁会把并发保护拆掉` }
  }
  try {
    unlinkSync(target)
    return { ok: true, code: null, path: target, message: '' }
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: true, code: null, path: target, message: '锁已经不在了' }
    return ioError(`放锁失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { path: target })
  }
}
