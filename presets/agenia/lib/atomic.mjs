/**
 * 原子写 + 独占锁 —— 脑侧与路线侧共用同一套（提案 §B3.7）。
 *
 * 冻结依据：提案 §B3.7（位置、原子性、锁、CAS、审计）+ §B1.6（**只有**通知/时钟/父进程生命周期可 mock；
 *   锁、CAS、审计**一律不许 mock** —— 所以这个模块必须真的和文件系统打交道）。
 *
 * 四条口径：
 *   ① **临时件与目标同目录**：`<file>.tmp-<pid>-<rand>` ⇒ 同卷 `rename` 才原子。
 *      不跨卷写临时件（`_runs` 与 `_evidence` 同盘，但实现里不许假设）。
 *   ② **`fsync` 之后才 rename**；Windows 上 `rename` 会被占用文件的句柄顶成 `EPERM/EBUSY/EACCES`
 *      ⇒ 指数退避重试 ≤5 次，仍失败给 `E_TXN_IO`（**不静默留下半截文件**）。
 *      临时件用 `openSync(…, 'wx')` **独占建**：旧残留 / 符号链接不会被静默覆盖写。
 *      收残渣（删临时件）也是**删除** ⇒ 给了 `options.allowedRoot` 就走本模块的
 *      `deletableVerdict()` 三闸；闸不过就**出声留着**并把判定回给调用方
 *      （`cleanup_refused`）。不给 `allowedRoot` ⇒ 与加这一层之前一字不差（尽力清掉）。
 *   ③ **锁 = `open(path,'wx')` 独占建**，内容 `{pid, session_id, at, ttl_ms}`。
 *      已存在 ⇒ 读出来判"持有者还活着吗 / 过期了吗"。**死锁不静默抢写** ⇒ `E_LOCK_STALE`，
 *      要显式 `--force-recover`（RT-01 的判据）。
 *      ⚠️ **"读不出内容"不是死锁**：锁文件 0 字节 / 半截 JSON（持有者刚 `open`、还没 `write`）
 *      或刚被 `unlink`（持有者刚放锁）时，读出来的东西证不了持有者死活 ⇒ 那是**瞬时**的，
 *      等一会儿再抢就可能成 ⇒ `E_LOCK_HELD` 并带 `retryable: true`，不许判成僵锁。
 *   ④ **读-改-写全程持锁**；CAS（`expected_version`）由上层比对，本模块不管语义 —— 它只保证"写是原子的、锁是真的"。
 *
 * 本模块还带**删除三闸**（`deletableVerdict` / `gateReport`）：写失败之后收残渣也是"删除"，
 * 判定与两支 CLI 的删除点（旧备份 / 墓碑 / 空目录回收）是**同一份**（构案 0006：一份实现）。
 *
 * 判决风格与本目录其它纯函数一致：**返回 `{ok, code}`，不抛**（CLI 直接把它塞进错误信封）。
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
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

/**
 * 🔴 **这一段之间是"原子写并集正文"**：`bin/install.mjs --op publish-staged` 发布时把它**逐字**
 * 内联进出厂件 `bin/rollback.mjs`（出厂件必须单文件零静态 import —— 拍板 Q6；裁决见构案 0006 改定段）。
 * 里面有两半，出厂件两半都要：
 *   · **删除三闸**（`deletableVerdict` · `gateReport` · `dg*` 原语）—— 出厂件的墓碑/空目录回收与
 *     本模块的残渣清理读**同一个判定**；
 *   · **原子写**（`RETRYABLE_RENAME` · `sleepSync` · `ioError` · `cleanupTemp` · `writeFileAtomic`）。
 * ⇒ **写在这一段里的东西必须自足**：只许用 `node:fs` / `node:crypto` / `node:path` 的那几个名字
 *   （内联侧用一句 `const { … } = fs` 把它们绑起来）、以及本段自己声明的名字。
 *   新增一个外部依赖 ⇒ 发布出来那一份会当场跑不动；标记不在 ⇒ `publish-staged` 直接失败（不静默发半份）。
 *
 * 为什么 `dg` 前缀：出厂件里本来就有自己那一套 `canonical` / `isUnder` / `pathVerdict`（它的路径策略），
 * 同名的两份函数在同一个模块作用域里会互相顶掉 —— 前缀让"判定"与"那一份文件自己的策略"分得开。
 *
 * 🔴 **这一段有两个载体，改它要两边一起改**：发布时内联进 `bin/rollback.mjs`（上面那条），
 * 以及 `presets/agenia/inject.js` 里那一份**作者期**内联的副本（注入器由宿主加载、ESM 按 URL 缓存，
 * 不能静态 import 本模块；理由见构案 0007）。两份正文逐字比对的判据是 `ATM-01` 腿 10。
 */
// @inline-begin 原子写并集正文（删除三闸 + 原子写；发布时内联进出厂件，边界由这一对标记定）
// ── 删除三闸（契约 §2.5）────────────────────────────────────────────────────
/**
 * **每个**删除/递归删除点删之前都要过这三关（缺一即拒删，绝不"先删了再说"）：
 *   ① **解析绝对路径** —— `path.resolve` 吃掉 `.`/`..`，盘上存在再 `realpath`（连 junction 一起）；
 *      相对 / UNC / C 盘 / 数据目录（`.runtime`）一律拒
 *      （`E_ROOT_RELATIVE` / `E_ROOT_UNC` / `E_ROOT_C_DRIVE` / `E_PATH_ESCAPE`）。
 *   ② **身份 marker** —— 目标自己，或它所属的那个允许根，必须自证身份：
 *      · `.agenia-test-root`：运行根（自己那一层，或往上 4 层 —— 与 `insideTestScene` 同口径）
 *      · `hash-manifest.json`：备份根（只认**目标自己**那一层，且里面的 `live_root` 必须就是本次靶子
 *        —— 别人的备份不当自己的删）
 *      · `agent.cordis.yml`：预设根（只认**目标自己**那一层 —— 与 `--op publish-staged` 认预设根同一条判据）
 *      三者都没有 ⇒ `E_ROOT_NO_MARKER`。
 *   ③ **落点在允许删的根之下** —— 必须**严格**在它之下（那个根本身不许被删），
 *      而且不许把**活体根**包进去（`--backup` 指到靶子的上层目录时，删一次连靶子一起没）。
 *      一个允许根都装不下它 ⇒ `E_ROOT_OUTSIDE`（报文里列出允许根）。
 */
const DG_TEST_ROOT_MARKER = '.agenia-test-root'
const DG_BACKUP_MANIFEST_NAME = 'hash-manifest.json'
const DG_PRESET_ROOT_MARKER = 'agent.cordis.yml'
/** 靶子根、备份根都不许落在数据目录里（与 `lib/paths.mjs` / 两支 CLI 的黑名单同一份）。 */
const DG_PROTECTED_TARGET_SEGMENTS = ['.runtime']

function dgCanonical(p) {
  const abs = path.resolve(String(p))
  try {
    return realpathSync.native(abs) // 盘上存在 ⇒ 连 junction/symlink 一起吃掉
  } catch {
    return abs
  }
}

function dgNormKey(p) {
  let s = dgCanonical(p).replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s.toLowerCase()
}

function dgIsUnder(child, parent) {
  const c = dgNormKey(child)
  const p = dgNormKey(parent)
  return c === p || c.startsWith(`${p}/`)
}

function dgDriveOf(p) {
  const m = /^([A-Za-z]):/.exec(String(p ?? ''))
  return m ? m[1].toUpperCase() : null
}

/**
 * 路径判定（删除目标那一侧）。与 `bin/install.mjs::pathVerdict` 同源同值，
 * 只是不带 `allowProtected` 那一档 —— 删除目标**永远**不许落在 `.runtime` 里。
 */
function dgPathVerdict(raw, label) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false, code: 'E_ROOT_MISSING', message: `${label} 缺失（省略 / 空串都算缺失）` }
  }
  const s = String(raw)
  if (/^\\\\/.test(s) || /^\/\//.test(s)) return { ok: false, code: 'E_ROOT_UNC', message: `${label} 不许是 UNC：${s}` }
  if (!/^[A-Za-z]:[\\/]/.test(s)) return { ok: false, code: 'E_ROOT_RELATIVE', message: `${label} 必须是绝对路径：${s}` }
  const abs = dgCanonical(s)
  // 拒的时候把**解析出来的绝对路径**一起带回去（`path`）：报文里的 `delete_gate.resolved` 要它。
  // 解析不出来的那几档（相对 / UNC / 缺失）没有 `path` —— 那一档不许拿 cwd 现编一个。
  if (dgDriveOf(abs) === 'C') return { ok: false, code: 'E_ROOT_C_DRIVE', message: `${label} 不许在 C 盘：${abs}`, path: abs }
  const segs = abs.replace(/\\/g, '/').split('/').map((x) => x.toLowerCase())
  for (const bad of DG_PROTECTED_TARGET_SEGMENTS) {
    if (segs.includes(bad)) return { ok: false, code: 'E_PATH_ESCAPE', message: `${label} 落在数据目录里（${bad}）：${abs}`, path: abs }
  }
  return { ok: true, code: null, path: abs }
}

/** 一个目录里有没有这个文件 —— 判据是"在不在"，读不动就当没有。 */
function dgHasFileIn(dir, name) {
  try {
    return statSync(path.join(dir, name)).isFile()
  } catch {
    return false
  }
}

/** 备份根自证：带 `hash-manifest.json`、kind 对、**而且点名了本次靶子**。 */
function dgIsOurBackupRoot(dir, liveRoot) {
  if (liveRoot === undefined || liveRoot === null) return false
  let doc = null
  try {
    doc = JSON.parse(readFileSync(path.join(dir, DG_BACKUP_MANIFEST_NAME), 'utf8'))
  } catch {
    return false
  }
  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.files)) return false
  if (doc.kind !== undefined && doc.kind !== 'agenia-install-backup') return false
  // `live_root` 缺失（早期版本的备份）⇒ 不当成"我们的"：宁可拒删，也不删错。
  return typeof doc.live_root === 'string' && dgNormKey(doc.live_root) === dgNormKey(liveRoot)
}

/**
 * 身份 marker（第 ② 闸的判据）。目标是文件时判**它所在的目录**（"这个落点属于哪个根"）。
 * @returns {{kind:string, at:string}|null}
 */
function dgMarkerOf(target, { liveRoot } = {}) {
  let isDir = false
  try {
    isDir = statSync(target).isDirectory()
  } catch {
    isDir = false
  }
  let at = dgCanonical(isDir ? target : path.dirname(target))
  for (let i = 0; i < 5; i += 1) {
    if (dgHasFileIn(at, DG_TEST_ROOT_MARKER)) return { kind: 'run-root', at }
    if (i === 0 && dgHasFileIn(at, DG_BACKUP_MANIFEST_NAME) && dgIsOurBackupRoot(at, liveRoot)) return { kind: 'backup-root', at }
    if (i === 0 && dgHasFileIn(at, DG_PRESET_ROOT_MARKER)) return { kind: 'preset-root', at }
    const up = path.dirname(at)
    if (up === at) break
    at = up
  }
  return null
}

/**
 * 闸的决定 → 报文里那个**加性字段**（裁定 v1.20 ②）：五个键，一个不多、一个不少。
 *   · `allowed_roots` —— 这一次判定的"应删的根"（解析成绝对路径；没给的那一档不占位）；
 *   · `marker_kind`   —— 第 ② 闸认出的身份（`run-root` / `backup-root` / `preset-root`）；
 *     **没走到第 ② 闸**（①就拒了 · 落点把活体根包住了）⇒ `null` —— 不编造"它带了 marker"；
 *   · `resolved`      —— 第 ① 闸解析后的落点；解析不出来（相对 / UNC / 缺失）⇒ `null`；
 *   · `verdict`       —— `"allow"` / `"deny"`；`code` —— 拒的那个稳定码（放行时 `null`）。
 * ⚠️ 它只是一份**投影**：判定本身是 `deletableVerdict()` 那一份，报文不许反过来改判定。
 */
export function gateReport({ allowedRoots, marker, resolved, verdict, code }) {
  return {
    allowed_roots: (allowedRoots ?? [])
      .filter((r) => r?.root !== undefined && r.root !== null && String(r.root).trim() !== '')
      .map((r) => dgCanonical(r.root)),
    marker_kind: marker ?? null,
    resolved: resolved ?? null,
    verdict,
    code: code ?? null,
  }
}

/**
 * 删除前判定（三闸，**不抛**）：过 ⇒ `{ok:true, path:<解析后的落点>, root, marker…, delete_gate}`；
 * 不过 ⇒ `{ok:false, code, message, delete_gate}`（稳定码 + 一句能读的报文 + 报文里那一项）。
 *
 * 谁读它：`bin/install.mjs`（旧备份）· `bin/rollback.mjs`（墓碑 / 空目录回收）·
 * 本模块的 `cleanupTemp()`（原子写失败后的残渣）。出厂件里这一份是发布时内联进去的**同一段正文**。
 *
 * @param {string} rawTarget 要删的落点（**原样**传进来，别预先 canonical —— 第 ① 闸要自己解析）
 * @param {{label:string, liveRoot:string, allowedRoots:Array<{root:string|null, why:string}>}} options
 *        `allowedRoots` = 契约里那句"**应删的根**"：目标必须严格落在其中之一
 */
export function deletableVerdict(rawTarget, { label, liveRoot, allowedRoots }) {
  /** 拒的那一支：稳定码 + 那一项 `delete_gate`（裁定 v1.20 ②：拒删不许只有 stderr 一行）。 */
  const deny = (code, message, { marker = null, resolved = null } = {}) => ({
    ok: false,
    code,
    message,
    delete_gate: gateReport({ allowedRoots, marker, resolved, verdict: 'deny', code }),
  })

  // ① 解析绝对路径（相对 / UNC / C 盘 / 数据目录在这条路上就拒）
  const v = dgPathVerdict(rawTarget, label)
  if (!v.ok) return deny(v.code, `拒绝删除：${v.message}`, { resolved: v.path ?? null })
  const target = v.path

  // 删的落点不许把活体根包进去（否则"清旧备份"会把靶子本身一起清掉）
  if (liveRoot !== undefined && liveRoot !== null && dgNormKey(target) !== dgNormKey(liveRoot) && dgIsUnder(liveRoot, target)) {
    return deny('E_ROOT_OUTSIDE', `拒绝删除：${label} 把活体根包在里面（删一次连靶子一起没）：${target} ⊇ ${dgCanonical(liveRoot)}`, { resolved: target })
  }

  // ③ 落点：挑最贴身（最长）的那个允许根 —— 也用于第 ② 闸判"它所属的根"
  let matched = null
  for (const r of allowedRoots ?? []) {
    if (r?.root === undefined || r.root === null || String(r.root).trim() === '') continue
    const root = dgCanonical(r.root)
    if (dgNormKey(target) === dgNormKey(root)) continue // 严格：允许根本身不许被删
    if (!dgIsUnder(target, root)) continue
    if (matched === null || dgNormKey(root).length > dgNormKey(matched.root).length) matched = { root, why: r.why }
  }

  // ② 身份 marker：目标自己，或它所属的那个允许根
  const onTarget = dgMarkerOf(target, { liveRoot })
  const onRoot = matched === null ? null : dgMarkerOf(matched.root, { liveRoot })
  if (onTarget === null && onRoot === null) {
    return deny('E_ROOT_NO_MARKER', `拒绝删除：${label} 自己不带 ${DG_BACKUP_MANIFEST_NAME} / ${DG_PRESET_ROOT_MARKER}，所属根也不带 ${DG_TEST_ROOT_MARKER}：${target}${matched === null ? '' : `（所属根 ${matched.root}）`}`, { resolved: target })
  }

  // ③ 报：一个允许根都装不下
  if (matched === null) {
    const where = (allowedRoots ?? []).filter((r) => r?.root).map((r) => `${r.root}（${r.why}）`).join(' · ') || '（没给允许根）'
    return deny('E_ROOT_OUTSIDE', `拒绝删除：${label} 不在任何允许删的根之下：${target} —— 允许根：${where}`, { marker: (onTarget ?? onRoot)?.kind ?? null, resolved: target })
  }
  const marker = onTarget ?? onRoot
  return {
    ok: true,
    code: null,
    message: '',
    path: target,
    root: matched.root,
    root_why: matched.why,
    marker,
    marker_on: onTarget !== null ? 'target' : 'root',
    delete_gate: gateReport({ allowedRoots, marker: marker?.kind ?? null, resolved: target, verdict: 'allow', code: null }),
  }
}

// ── 原子写 ─────────────────────────────────────────────────────────────────
/** 这些 rename 失败是可重试的（Windows 上被占用的句柄）：①被占用 ②设备忙 ③权限瞬时拒绝。 */
const RETRYABLE_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * `install` / `rollback` 这两条写盘路径的 rename 重试上限 = **6**（其余调用者仍是本函数的默认 5）。
 *
 * 为什么不是 5：并集之前 CLI 那两份各自重试 **6** 次（构案 0006 §背景 那张表），RC-2 的前提也写的是
 * "6 次不够" —— 取并集时如果只留共享件的默认 5，两条**最重的写盘路径**就各少一次重试
 * （最坏情形少约 240 ms 退避预算），而且没有任何判据盖住这个数。⇒ 那两处调用点显式传本常量。
 * 出厂件（`bin/rollback.mjs`）里这个常量随内联正文一起过去 —— 它的第 2 处写盘路径读的是同一个 6。
 */
const CLI_WRITE_MAX_ATTEMPTS = 6

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
 * 收残留临时件 —— **一次判定，两条失败路径共用**（临时件写不出来 / rename 重试用尽）。
 *
 * · `allowedRoot` 没给 ⇒ 与加闸之前一字不差：尽力 `unlink`，不问（这个模块的老调用方全都走这一档）；
 * · 给了 ⇒ 走 `deletableVerdict()` 的三闸（残留临时件也是**删除**）；
 *   闸不过 ⇒ **出声留着**（静默的"清不掉"和"清干净了"长得一模一样），并把那一份判定回给调用方
 *   —— 调用方据此把它挂到错误信封上（`cleanup_refused.delete_gate`）。
 *
 * @returns {null|{code:string, message:string, delete_gate:object}} 拒删时那一份判定；其余 `null`
 */
function cleanupTemp(tmp, allowedRoot) {
  if (allowedRoot === undefined || allowedRoot === null) {
    try { unlinkSync(tmp) } catch { /* 临时件可能压根没建起来 */ }
    return null
  }
  const cleanup = deletableVerdict(tmp, {
    label: '原子写的残留临时件',
    liveRoot: allowedRoot,
    allowedRoots: [{ root: allowedRoot ?? null, why: '本次写入的根' }],
  })
  if (!cleanup.ok) {
    process.stderr.write(`[atomic] ${cleanup.code} ${cleanup.message} —— 临时件留着，不静默\n`)
    return { code: cleanup.code, message: cleanup.message, delete_gate: cleanup.delete_gate }
  }
  try {
    unlinkSync(cleanup.path)
  } catch {
    /* 清不掉就留着 —— 但绝不静默当成功 */
  }
  return null
}

/**
 * 原子写一个文件（同目录临时件 → `writeSync` → `fsync` → `rename`）。
 *
 * 这个函数是**唯一一份**原子写实现：`bin/install.mjs` / `bin/rollback.mjs` 从这里 import，
 * 出厂件那一份由 `install.mjs --op publish-staged` 在发布时把同一段正文内联进去
 * （出厂件保持单文件零静态 import —— 拍板 Q6）。
 *
 * @param {string} file 目标文件（父目录会自动建）
 * @param {string|Buffer|Uint8Array} data 内容
 * @param {object} [options] `{ fsync?:boolean, maxAttempts?:number, retryBaseMs?:number, allowedRoot?:string|null, pid?, rand?, sleep? }`
 *        `allowedRoot` = 这一次写进去的那个根：**不给就不判**残渣该不该删（老行为）；
 *        给了 ⇒ 删之前过三闸，拒删就出声留着（见 `cleanupTemp`）。
 * @returns {{ok:true,code:null,message:string,path:string,bytes:number,attempts:number}
 *          |{ok:false,code:string,message:string,path?:string,attempts?:number,cleanup_refused?:object|null}}
 */
export function writeFileAtomic(file, data, options = {}) {
  const {
    fsync = true,
    maxAttempts = 5,
    retryBaseMs = 15,
    allowedRoot = null,
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
    const cleanupRefused = cleanupTemp(tmp, allowedRoot)
    return ioError(`写临时件失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { path: target, attempts: 1, cleanup_refused: cleanupRefused })
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      renameSync(tmp, target)
      return { ok: true, code: null, message: '', path: target, bytes: buf.length, attempts: attempt }
    } catch (err) {
      const retryable = RETRYABLE_RENAME.has(err?.code)
      if (!retryable || attempt === maxAttempts) {
        const cleanupRefused = cleanupTemp(tmp, allowedRoot)
        return ioError(`rename 失败（${err?.code ?? 'UNKNOWN'}，第 ${attempt} 次）：${err?.message}`, { path: target, attempts: attempt, cleanup_refused: cleanupRefused })
      }
      sleep(retryBaseMs * 2 ** (attempt - 1))
    }
  }
  return ioError('rename 重试耗尽', { path: target, attempts: maxAttempts })
}
// @inline-end 原子写并集正文（这一行与上面那条 begin 标记成对；缺一条 ⇒ 发布拒跑）
export { CLI_WRITE_MAX_ATTEMPTS }

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
