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
 *      ⚠️ **"读不出内容"不是死锁**：锁文件 0 字节 / 半截 JSON（持有者刚 `open`、还没 `write`）
 *      或刚被 `unlink`（持有者刚放锁）时，读出来的东西证不了持有者死活 ⇒ 那是**瞬时**的，
 *      等一会儿再抢就可能成 ⇒ `E_LOCK_HELD` 并带 `retryable: true`，不许判成僵锁。
 *   ④ **读-改-写全程持锁**；CAS（`expected_version`）由上层比对，本模块不管语义 —— 它只保证"写是原子的、锁是真的"。
 *
 * 判决风格与本目录其它纯函数一致：**返回 `{ok, code}`，不抛**（CLI 直接把它塞进错误信封）。
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

/** 进程死后多久算僵锁（毫秒）。锁只护住一次读-改-写，所以给 1 分钟就够；
 *  真正的"作业还活着吗"是另一套事件式 liveness（90/45 分钟，见 `lib/liveness.mjs`）。 */
const DEFAULT_LOCK_TTL_MS = 60_000

/** 读不出内容的锁，多久之内仍然按"有人正在动它"算（毫秒）。
 *
 *  `open(...,'wx')` 与 `writeSync` 之间隔着几微秒到几十微秒，这段时间里锁文件是 0 字节；
 *  同一个窗口的另一种形状是"刚被 `unlink`"（读的那一刻已经不在了）。
 *  两种都**证不了持有者死活**，所以期内一律按可重试处理。
 *
 *  过了这个宽限期还没人写进去 ⇒ 那就是"有人在 `open` 与 `write` 之间死了"留下的坏锁：
 *  它永远不会有内容，谁都不会来放它 ⇒ 这时候判僵锁才是对的（要显式 `--force-recover`）。
 *  宽限期只作用于"读不出内容"这一族；**读得出来**的锁（pid 已死 / 过了 ttl）一格都不放宽。 */
const LOCK_UNREADABLE_GRACE_MS = 5_000

/** 瞬时判定在 `acquireLock` 内部重判几次、每次隔多久（加起来远小于一次读-改-写）。
 *  为什么要自己重判：`agenia-route` / `agenia-brain` / `proposals` 拿锁时**没有**预算循环，
 *  重判这一步没人替它做 ⇒ 一次瞬时判定就会变成一个失败。 */
const LOCK_RETRY_ATTEMPTS = 4
const LOCK_RETRY_MS = 5

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

/** 读不出内容的锁，离"最后被写过"过去多久了（毫秒）。
 *  文件已经不在了 / 读不到时间戳 ⇒ `null`（那是"刚被放掉"，不是"陈年坏锁"）。 */
function unreadableAgeMs(target, nowMs) {
  try {
    return nowMs - statSync(target).mtimeMs
  } catch {
    return null
  }
}

/**
 * 判一次锁：建成了 / 活人占着 / 真僵锁 / 此刻判不了。**不重试、不回收**（那两件事由 `acquireLock` 做）。
 *
 * 返回值分两层：
 * - `verdict` —— 就是给调用方看的那一份（形状与 `acquireLock` 的返回值一致）；
 * - `recoverable` —— `--force-recover` 允许回收这一把吗？
 *   活人占着的那一格是 `false`：显式恢复也不许顶掉一个还活着的持有者（RT-01 的"绝不覆盖"）。
 */
function judgeLockOnce(target, info, { parentAlive, nowMs }) {
  // ① 独占创建：成功就是我的（`wx` = 已存在即 EEXIST，绝不覆盖）
  try {
    const handle = openSync(target, 'wx')
    try {
      writeSync(handle, `${JSON.stringify(info)}\n`)
      fsyncSync(handle)
    } finally {
      closeSync(handle)
    }
    return { verdict: { ok: true, code: null, info, path: target, message: '' }, recoverable: false }
  } catch (err) {
    if (err?.code !== 'EEXIST') {
      return { verdict: ioError(`建锁失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { path: target }), recoverable: false }
    }
  }

  // ② 已存在 ⇒ 读内容，判"活着 / 过期 / 读不出"
  const read = readLock(target)
  const existing = read.ok ? read.info : null
  const ttl = Number.isFinite(existing?.ttl_ms) ? existing.ttl_ms : DEFAULT_LOCK_TTL_MS
  const startedMs = existing?.at ? Date.parse(existing.at) : NaN
  const ageMs = Number.isFinite(startedMs) ? nowMs - startedMs : Number.POSITIVE_INFINITY
  const expired = !(ageMs < ttl)

  if (existing && aliveOf(existing.pid, parentAlive) && !expired) {
    // 🔴 这一格**不带** `retryable`：活人占着的锁该怎么等，是调用方的事
    //（`acquireDayLock` 有 8 秒预算循环；`agenia-route` / `agenia-brain` 要立刻拒）。
    // 在这里替它重判，等于把"占着"这件事的时序也改了 —— 而本模块只负责"此刻拿不拿得到"。
    return {
      verdict: {
        ok: false, code: 'E_LOCK_HELD', info: existing, path: target,
        message: `锁被 pid ${existing.pid} 占着（${Math.round(ageMs / 1000)} 秒）`,
      },
      recoverable: false,
    }
  }

  if (existing === null) {
    // 读不出内容：0 字节 / 半截 JSON（持有者正写着）或锁刚被 unlink（持有者刚放掉）。
    // 这两格**不是**"持有者死了"的证据 —— 判成僵锁会教人去删一把还热着的锁，那是把互斥拆掉。
    const age = unreadableAgeMs(target, nowMs)
    const abandoned = age !== null && age >= LOCK_UNREADABLE_GRACE_MS
    if (!abandoned) {
      return {
        verdict: {
          ok: false, code: 'E_LOCK_HELD', info: null, path: target,
          retryable: true,
          message: read.code === 'E_DATA_MISSING'
            ? '锁刚被放掉（读的那一刻已经不在了）—— 不是僵锁，等一下重抢'
            : `锁内容还没落全（${read.code}，${Math.max(0, Math.round(age ?? 0))} 毫秒）—— 持有者正在写这把锁，不是僵锁`,
        },
        recoverable: true,
      }
    }
    return {
      verdict: {
        ok: false, code: 'E_LOCK_STALE', info: null, path: target,
        message: `僵锁：锁内容坏了（${read.code}），而且 ${Math.round(age / 1000)} 秒没人再写过它（持有者死在建锁与写字之间）—— 不静默抢写，要显式 --force-recover`,
      },
      recoverable: true,
    }
  }

  // 读得出来：这才有资格谈"持有者死了没有"。
  return {
    verdict: {
      ok: false, code: 'E_LOCK_STALE', info: existing, path: target,
      message: `僵锁：pid ${existing.pid} 已不在或已过期 —— 不静默抢写，要显式 --force-recover`,
    },
    recoverable: true,
  }
}

/**
 * 抢一把独占锁。
 *
 * - 拿到 ⇒ `{ok:true, info}`；
 * - 被活着的持有者占着 ⇒ `E_LOCK_HELD`（判一次就回，不在这里替调用方等 —— 时序与加这层改动之前一字不差）；
 * - 锁**读不出内容**（0 字节 / 半截 JSON = 持有者正写着）或**刚被放掉**（`unlink` 窗口）
 *   ⇒ 也是 `E_LOCK_HELD`，但带 `retryable: true`：这两格证不了持有者死活，是一瞬间的事。
 *   它在内部几毫秒内先自己重判几次，多数情况直接重判成"我拿到了"；
 *   若同一个锁**过了宽限期**（`LOCK_UNREADABLE_GRACE_MS`）还是读不出内容，那才是僵锁；
 * - 僵锁（**读得出来**但持有者已死 / 超过 `ttl_ms`，或上面那种过期的坏锁）⇒ `E_LOCK_STALE`，
 *   **不静默抢写**；带上 `{forceRecover:true}`（CLI 的 `--force-recover`）才回收**这一个**锁文件再抢一次。
 *
 * 两种拒绝都不写坏东西：`E_LOCK_HELD` 是"等"，`E_LOCK_STALE` 是"要人点头才回收"。
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

  /** 最后一次"还可以再判一次"的判定（重试用完就返回它）。 */
  let lastRetryable = null
  for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt += 1) {
    const judged = judgeLockOnce(target, info, { parentAlive, nowMs })
    const verdict = judged.verdict
    if (verdict.ok === true) return verdict

    if (forceRecover === true && judged.recoverable === true) {
      // 显式回收：只删这一个锁文件，然后**照原样再抢一次**（不递归，避免自喂）。
      try {
        unlinkSync(target)
      } catch (err) {
        if (err?.code !== 'ENOENT') return ioError(`回收僵锁失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { path: target })
      }
      const retry = acquireLock(target, meta, { ...options, forceRecover: false })
      return retry.ok ? { ...retry, recovered: true, recovered_from: verdict.info ?? null } : retry
    }

    if (verdict.retryable !== true) return verdict
    lastRetryable = verdict
    if (attempt < LOCK_RETRY_ATTEMPTS) sleepSync(LOCK_RETRY_MS)
  }
  return lastRetryable
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
