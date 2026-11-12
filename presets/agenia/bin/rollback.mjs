#!/usr/bin/env node
/**
 * `rollback.mjs` —— 从**备份**把活体代码退回装之前那一刻。**只回代码，不回数据。**
 *
 * @ship-header-begin 这一段是**本文件（repo 那一份）**的自述；`publish-staged` 发布时把标记之间整段
 *   换成**出厂件口径**的同一段（`install.mjs::shippedHeaderLines()`）。出厂件里不许出现"本文件引用了
 *   共享件"这类自述 —— 那一份的正文里根本没有共享件。
 * 🔴 **出厂件是单文件、零静态引用**（拍板 Q6）。理由：回滚的适用场合正是"刚装上去的那一版是坏的" ——
 *    这时候它**不能依赖任何新装上去的东西**（新 `lib/`、新 `bin/`、新模块）。
 *    ⚠️ **本文件是 repo 那一份，不是出厂件**：两支 CLI 与共享件去重是构案 0006 的目的，所以本文件
 *    引用了 `../lib/atomic.mjs`（原子写并集正文 + 删除三闸，两者在同一份共享件里）。
 *    **出厂件由 `install.mjs --op publish-staged` 在发布时造出来**：它把 `lib/atomic.mjs` 的
 *    原子写并集正文（删除三闸 + 原子写）**逐字内联**进来、去掉那条静态引用 ⇒ 用户拿到的那一份
 *    仍然是单文件、零静态引用，且 `node:` 内建仍走运行时取（不构成"依赖新代码"）。
 *    两棵树的这处差是**受控差异**，由 `<staging>/target-lag.json` 声明（点名本文件那一个路径）。
 *    判据：`INS-02 ①` / `ENV-02 ROLLBACK-IMPORT` 扫**出厂件**；`ATM-01` 扫**本文件**（一份定义 + 调用点）。
 *  · 路径判据（`canonical` / `isUnder` / `pathVerdict`）与哈希仍就地一份 —— 它们是本脚本自己的策略，
 *    不跨脚本共用。
 * @ship-header-end
 *
 * ── 它做什么（四步，顺序固定）──────────────────────────────────────────────
 *   ① **靶子先过关**：`--target` 必须显式给、绝对、非 UNC、非 C 盘、非空、**盘上真实存在**
 *      （不存在 ⇒ `E_DATA_MISSING` 非零退出，且**一个字节都不碰** —— 失败不许毁现场）；
 *   ② **找备份**：`--backup` 显式给，或按目标算默认落点（与 `install.mjs` 同一条规则）；
 *   ③ **备份先自证**：`hash-manifest.json` 必须在、必须能解析、**每一件的 SHA 必须与盘上一致**。
 *      缺清单 / 坏清单 / 对不上 ⇒ **明确拒绝**（`E_MANIFEST_MISSING` / `E_MANIFEST_MISMATCH`），
 *      **不写一个字节**。宁可"回不去"，也不许拿一份验不过的备份去覆盖活体。
 *   ④ **还原**：逐文件原子替换 → 逐文件复算 SHA → 与备份清单对齐；**再量一次"清单外那些文件"**
 *      的子树哈希（回滚前后必须相同 ⇒ 未知文件与数据一个字都没动）。
 *   ⑤ **每个删除点都走"三闸"**（契约 §2.5）：解析绝对路径 → 校验身份 marker →
 *      校验落点在允许删的根之下。三条缺一即**拒删**（稳定码，非零退出 + 出声）——
 *      墓碑与"空目录回收"都在其中（见 `assertDeletableTarget()`）。墓碑那一条**在动任何字节之前**先判，
 *      所以"闸不过"不会留下半场回滚。
 *   ⑥ **闸的决定进 JSON 报文**（裁定 v1.20 ②）：加性字段 `delete_gate`
 *      `{allowed_roots, marker_kind, resolved, verdict, code}` —— 挂在**每一条 `removed[]`** 上
 *      （文件那一次 = `delete_gate`；跟着回收掉的空目录各一条 = `recycled_dirs[].delete_gate`）；
 *      **拒删**时挂在信封顶层（`ok:false` 那一份），与 `error.code` 并排。
 *      ⚠️ **没有删除动作**（墓碑本来就不在 · `--dry-run`）⇒ 取值 `null` ——
 *         不编造一个"放行"："放行"的意思是**真判过、真删了**。
 *      ⚠️ 收残留临时件被拒时，那个码同样进 `delete_gate.code`，而信封的主码仍是 `E_TXN_IO`
 *         —— 一次运行里可以同时有两个码，看 `error.code` 还是看 `delete_gate.code` 是两件事。
 *
 * ⚠️ **与 `install.mjs` 不对称的一处**（别照抄对面那条）：`--backup` 在回滚里只是**读的来源**，
 *    不是删除点 —— 所以「显式 `--backup` 指到允许区之外、且已存在 ⇒ 拒删」（裁定 v1.20 ①）
 *    **不适用于本脚本**。本脚本的删除点只有墓碑与空目录回收，两者都严格在**靶子根**之下。
 *
 * ── 缺备份怎么办（两档，写清楚免得两边各猜一套）────────────────────────────
 *   · 备份目录**不在** + 没给 `--require-backup` ⇒ **`status:"NO-BACKUP"`、`applied:false`、
 *     `restored:[]`、退出码 0**，并在 stderr 上出声。语义是"**没有可还原的东西**"，
 *     不是"还原成功" —— 报告里 `applied` 一眼可读。
 *   · 备份目录**不在** + 给了 `--require-backup` ⇒ `E_MANIFEST_MISSING`（exit 7）**明确拒绝**。
 *     真正要跑回滚的场合（停机维修、R1）**应当带这个开关** —— 那时候"没有备份"是事故，不是常态。
 *   · 备份目录**在**、而清单缺/坏/对不上 ⇒ 一律拒（上面第 ③ 步），两档都一样。
 *
 * ── CLI 形状 ───────────────────────────────────────────────────────────────
 *   `--target <dir>`（别名 `--live`）· `--backup <dir>` · `--require-backup` · `--dry-run` · `--op rollback`
 *   退出码：0 成功（含 NO-BACKUP）· 2 用法 · 3 路径 · 4 IO · 5 校验 · 7 数据/清单缺失 · 8 内部
 */
import { CLI_WRITE_MAX_ATTEMPTS, deletableVerdict, writeFileAtomic } from '../lib/atomic.mjs'

const fs = await import('node:fs')
const path = await import('node:path')
const crypto = await import('node:crypto')
const url = await import('node:url')

const SELF = url.fileURLToPath(import.meta.url)
const REPO = path.resolve(path.dirname(SELF), '..', '..', '..')
const CLI_NAME = 'rollback.mjs'
const TEST_ROOT_MARKER = '.agenia-test-root'
/**
 * 两个黑名单，**分工不同**（混成一个会把合法的靶子也拒掉）：
 *   · `PROTECTED_TARGET_SEGMENTS` —— 判**根路径**（`--target` / `--backup`）：只拦 `.runtime`。
 *     ⚠️ `.team` **不在**这里：测试现场与队伍的办公桌都住在 `.team/` 底下，
 *        靶子落在 `.team/test/…` 是**正常**的。
 *   · `PROTECTED_REL_SEGMENTS` —— 判**备份清单里的相对路径**（相对靶子根）：两个都拦。
 *     这一条才是"**回滚只回代码、不回数据**"的真判据。
 */
const PROTECTED_TARGET_SEGMENTS = ['.runtime']
const PROTECTED_REL_SEGMENTS = ['.runtime', '.team']
const BACKUP_MANIFEST_NAME = 'hash-manifest.json'
const BACKUP_FILES_DIR = 'files'
const OP_NAMES = ['rollback', 'help']

/** 退出码表：键与值都与 staged `lib/error-codes.mjs` 一致（本文件自足，故就地留一份）。 */
const CODES = Object.freeze({
  E_USAGE: 2, E_ARG_SCHEMA: 2, E_ARG_USAGE: 2,
  E_ROOT_MISSING: 3, E_ROOT_RELATIVE: 3, E_ROOT_UNC: 3, E_ROOT_C_DRIVE: 3, E_ROOT_NO_MARKER: 3, E_ROOT_OUTSIDE: 3, E_PATH_ESCAPE: 3,
  E_TXN_IO: 4,
  E_MANIFEST_MISMATCH: 5,
  E_DATA_MISSING: 7, E_MANIFEST_MISSING: 7,
  E_INTERNAL: 8,
})

function cliError(code, message, details = null) {
  const err = new Error(message)
  err.name = 'RollbackCliError'
  err.code = code
  err.details = details
  return err
}

// ── 参数 ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { op: 'rollback', target: null, backup: null, requireBackup: false, dryRun: false }
  const takesValue = new Set(['--op', '--target', '--live', '--backup'])
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) throw cliError('E_USAGE', `不认这个位置参数：${JSON.stringify(a)}`)
    if (takesValue.has(a)) {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) throw cliError('E_USAGE', `${a} 后面要跟一个值`)
      i += 1
      if (a === '--op') out.op = v
      else if (a === '--target' || a === '--live') out.target = v
      else if (a === '--backup') out.backup = v
      continue
    }
    if (a === '--require-backup') out.requireBackup = true
    else if (a === '--dry-run') out.dryRun = true
    else throw cliError('E_USAGE', `未知参数：${a}`)
  }
  return out
}

// ── 路径守卫（与 staged `lib/paths.mjs` 同一套判据；就地一份）──────────────
function canonical(p) {
  const abs = path.resolve(String(p))
  try {
    return fs.realpathSync.native(abs)
  } catch {
    return abs
  }
}
function normKey(p) {
  let s = canonical(p).replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s.toLowerCase()
}
function isUnder(child, parent) {
  const c = normKey(child)
  const p = normKey(parent)
  return c === p || c.startsWith(`${p}/`)
}
function driveOf(p) {
  const m = /^([A-Za-z]):/.exec(String(p ?? ''))
  return m ? m[1].toUpperCase() : null
}
/**
 * 路径判定。`allowProtected` 只对**备份落点**开：备份本来就该落在一个普通目录里。
 * ⚠️ 靶子（`--target`）与备份清单里的路径**永远**不许碰 `.runtime` / `.team`。
 */
function pathVerdict(raw, label, { allowProtected = false } = {}) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false, code: 'E_ROOT_MISSING', message: `${label} 缺失（省略 / 空串都算缺失）` }
  }
  const s = String(raw)
  if (/^\\\\/.test(s) || /^\/\//.test(s)) return { ok: false, code: 'E_ROOT_UNC', message: `${label} 不许是 UNC：${s}` }
  if (!/^[A-Za-z]:[\\/]/.test(s)) return { ok: false, code: 'E_ROOT_RELATIVE', message: `${label} 必须是绝对路径：${s}` }
  const abs = canonical(s)
  // ⚠️ 拒的时候把**解析出来的绝对路径**一起带回去（`path`）：报文里的 `delete_gate.resolved`
  //    要它。解析不出来的那几档（相对 / UNC / 缺失）没有 `path` —— 那一档**不许**拿 cwd 现编一个。
  if (driveOf(abs) === 'C') return { ok: false, code: 'E_ROOT_C_DRIVE', message: `${label} 不许在 C 盘：${abs}`, path: abs }
  if (!allowProtected) {
    const segs = abs.replace(/\\/g, '/').split('/').map((x) => x.toLowerCase())
    for (const bad of PROTECTED_TARGET_SEGMENTS) {
      if (segs.includes(bad)) return { ok: false, code: 'E_PATH_ESCAPE', message: `${label} 落在数据目录里（${bad}）：${abs}`, path: abs }
    }
  }
  return { ok: true, code: null, path: abs }
}
function resolveWithin(base, rel) {
  const baseAbs = canonical(base)
  const abs = canonical(path.resolve(baseAbs, String(rel)))
  if (!isUnder(abs, baseAbs)) return { ok: false, code: 'E_PATH_ESCAPE', message: `备份清单里的路径逃出了备份根：${rel} → ${abs}` }
  return { ok: true, code: null, path: abs }
}

// ── 删除三闸（契约 §2.5）────────────────────────────────────────────────────
/**
 * **每个**删除/递归删除点删之前都要过这三关（① 解析绝对路径 ② 身份 marker ③ 落点在允许删的根之下；
 * 缺一即拒删，稳定码 + 出声，绝不"先删了再说"）。
 *
 * 判定本身**只有一份**：`lib/atomic.mjs` 的 `deletableVerdict()`（出厂件里那一段是发布时逐字内联进来的同一段正文）。
 * 本文件只留两个适配层 —— `refuseDelete()`（把判定包成 CLI 错误）与 `assertDeletableTarget()`（过 ⇒ 给落点）。
 * 出厂件（用户跑的那一份）里这段判定是**发布时逐字内联**进去的（单文件零静态 import —— 拍板 Q6）。
 */

/**
 * **拒删的错误形状**（裁定 v1.20 ②：拒删不许只有 stderr 一行）：稳定码 + 一份 `delete_gate`，
 * 由 `main()` 落到信封顶层、与 `ok:false` 并排。三闸那一支把已经算好的投影**原样**递进来。
 */
function refuseDelete({ code, message, gate }) {
  const err = cliError(code, message)
  err.delete_gate = gate
  return err
}

/** 三闸的**执行**形状：不过就抛（调用方据此非零退出 + 出声），过就给出解析后的落点。 */
function assertDeletableTarget(rawTarget, options) {
  const v = deletableVerdict(rawTarget, options)
  if (!v.ok) throw refuseDelete({ code: v.code, message: v.message, gate: v.delete_gate })
  return v
}

/** 本靶子的允许删根（墓碑、临时件、空目录回收都在这一个根底下）。 */
function allowedDeleteRoots(targetRoot) {
  return [{ root: targetRoot, why: '本次回滚的靶子根' }]
}

// ── 哈希 / 树 ──────────────────────────────────────────────────────────────
const sha256Buf = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const sha256File = (f) => sha256Buf(fs.readFileSync(f))
function walkFiles(root) {
  const out = []
  const visit = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) visit(full)
      else if (st.isFile()) out.push({ rel: path.relative(root, full).replace(/\\/g, '/'), bytes: st.size, sha256: sha256File(full) })
    }
  }
  visit(root)
  out.sort((a, b) => Buffer.compare(Buffer.from(a.rel, 'utf8'), Buffer.from(b.rel, 'utf8')))
  return out
}
/** 树哈希：`rel\0sha\0bytes\n` 升序 —— 与测试侧 `treeHash()` 逐字相同。 */
function treeHashOf(root, only = null) {
  const all = walkFiles(root)
  const picked = only === null ? all : all.filter((f) => only.has(f.rel))
  const digest = crypto.createHash('sha256')
  for (const f of picked) digest.update(`${f.rel}\u0000${f.sha256}\u0000${f.bytes}\n`, 'utf8')
  return { sha256: digest.digest('hex'), files: picked.length, rels: picked.map((f) => f.rel) }
}

// ── 备份落点（与 install.mjs 同一条规则）──────────────────────────────────
function slugOf(p) {
  return canonical(p).replace(/^[A-Za-z]:/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
}
function insideTestScene(liveRoot) {
  let dir = canonical(liveRoot)
  for (let i = 0; i < 4; i += 1) {
    dir = path.dirname(dir)
    if (dir === path.dirname(dir)) break
    if (fs.existsSync(path.join(dir, TEST_ROOT_MARKER))) return dir
  }
  return null
}
function defaultBackupRoot(liveRoot) {
  const slug = slugOf(liveRoot)
  const scene = insideTestScene(liveRoot)
  if (scene !== null) return path.join(scene, '.agenia-install-backup', slug)
  return path.join(REPO, '.tools', '_backup', 'agenia-install', slug)
}

/** 读备份清单：缺 / 坏 / 形状不合 ⇒ 抛（**绝不回落成"没有备份"**）。 */
function readBackupManifest(backupRoot) {
  const file = path.join(backupRoot, BACKUP_MANIFEST_NAME)
  if (!fs.existsSync(file)) {
    throw cliError('E_MANIFEST_MISSING', `备份目录在、但里面没有 ${BACKUP_MANIFEST_NAME}：${backupRoot} —— 一份验不过的备份不算备份，拒绝还原`)
  }
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw cliError('E_MANIFEST_MISSING', `备份清单不是可解析 JSON：${file} —— ${String(err.message)}`)
  }
  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.files)) {
    throw cliError('E_ARG_SCHEMA', `备份清单形状不合（要一个对象 + files 数组）：${file}`)
  }
  if (doc.kind !== undefined && doc.kind !== 'agenia-install-backup') {
    throw cliError('E_ARG_SCHEMA', `备份清单的 kind 不是 agenia-install-backup：${JSON.stringify(doc.kind)}`)
  }
  return { file, doc }
}

// ── op: rollback ───────────────────────────────────────────────────────────
function opRollback(args) {
  const targetV = pathVerdict(args.target, '--target/--live')
  if (!targetV.ok) throw cliError(targetV.code, targetV.message)
  const targetRoot = targetV.path
  // ① 靶子先过关：不存在就**当场拒**，而且是所有写入动作之前
  if (!fs.existsSync(targetRoot) || !fs.statSync(targetRoot).isDirectory()) {
    throw cliError('E_DATA_MISSING', `靶子不在（或不是目录）：${targetRoot} —— 失败保留现场，一个字节都不碰`)
  }
  const backupInput = args.backup === null ? defaultBackupRoot(targetRoot) : args.backup
  const backupV = pathVerdict(backupInput, '--backup', { allowProtected: true })
  if (!backupV.ok) throw cliError(backupV.code, backupV.message)
  const backupRoot = backupV.path
  if (isUnder(backupRoot, targetRoot)) throw cliError('E_ROOT_OUTSIDE', `备份落点不许在靶子里面：${backupRoot}`)

  const targetTreeBefore = treeHashOf(targetRoot)

  // ② 找备份
  if (!fs.existsSync(backupRoot)) {
    if (args.requireBackup) {
      throw cliError('E_MANIFEST_MISSING', `--require-backup：备份目录不在（${backupRoot}）—— 明确拒绝，一个字节都不碰`)
    }
    process.stderr.write(`[${CLI_NAME}] NO-BACKUP 备份目录不在（${backupRoot}）⇒ 没有可还原的东西；applied=false，未写任何文件。要"缺备份即拒绝"请加 --require-backup\n`)
    return {
      status: 'NO-BACKUP',
      applied: false,
      target_root: targetRoot,
      backup_root: backupRoot,
      backup_exists: false,
      require_backup: false,
      restored: [],
      counts: { planned: 0, wrote: 0, same: 0, preserved: targetTreeBefore.files },
      target_tree_before: { sha256: targetTreeBefore.sha256, files: targetTreeBefore.files },
      target_tree_after: { sha256: targetTreeBefore.sha256, files: targetTreeBefore.files },
      notes: ['缺备份 ≠ 回滚成功：这是一次**空操作**，报告里 applied=false 是判据'],
    }
  }

  // ③ 备份先自证
  const { file: manifestFile, doc } = readBackupManifest(backupRoot)
  const entries = doc.files.map((e, i) => {
    if (e === null || typeof e !== 'object' || typeof e.path !== 'string' || e.path.trim() === '') {
      throw cliError('E_ARG_SCHEMA', `备份清单第 ${i + 1} 项缺字符串 path：${manifestFile}`)
    }
    const rel = e.path.replace(/\\/g, '/').replace(/^\.\//, '')
    return { rel, sha256: typeof e.sha256 === 'string' ? e.sha256.toLowerCase() : null, bytes: Number.isInteger(e.bytes) ? e.bytes : null }
  })
  const seen = new Set()
  for (const e of entries) {
    if (seen.has(e.rel)) throw cliError('E_ARG_SCHEMA', `备份清单里同一个路径出现两次：${e.rel}`)
    seen.add(e.rel)
    const segs = e.rel.split('/').map((s) => s.toLowerCase())
    for (const bad of PROTECTED_REL_SEGMENTS) {
      if (segs.includes(bad)) throw cliError('E_PATH_ESCAPE', `备份清单点了数据目录里的路径（${bad}）：${e.rel} —— 回滚**只回代码、不回数据**`)
    }
    if (!/^[0-9a-f]{64}$/.test(e.sha256 ?? '')) throw cliError('E_ARG_SCHEMA', `备份清单里 ${e.rel} 的 sha256 不成形状：${JSON.stringify(e.sha256)}`)
  }
  const verified = []
  for (const e of entries) {
    const srcV = resolveWithin(backupRoot, path.join(BACKUP_FILES_DIR, e.rel))
    if (!srcV.ok) throw cliError(srcV.code, srcV.message)
    if (!fs.existsSync(srcV.path) || !fs.statSync(srcV.path).isFile()) {
      throw cliError('E_MANIFEST_MISSING', `备份里缺这一件：${e.rel}（${srcV.path}）—— 拒绝还原`)
    }
    const actual = sha256File(srcV.path)
    if (actual !== e.sha256) {
      throw cliError('E_MANIFEST_MISMATCH', `备份件与清单对不上：${e.rel}（清单 ${e.sha256} / 盘上 ${actual}）—— 拒绝还原`)
    }
    const dstV = resolveWithin(targetRoot, e.rel)
    if (!dstV.ok) throw cliError(dstV.code, dstV.message)
    if (fs.existsSync(dstV.path) && fs.statSync(dstV.path).isDirectory()) {
      throw cliError('E_PATH_ESCAPE', `靶子上这个位置是个目录、不是文件：${e.rel} —— 拒绝`)
    }
    const before = fs.existsSync(dstV.path) ? sha256File(dstV.path) : null
    verified.push({ ...e, src_abs: srcV.path, dst_abs: dstV.path, live_sha256_before: before })
  }

  const covered = new Set(verified.map((v) => v.rel))

  // ③b 墓碑：装之前活体上**不存在**、安装新建的那些代码文件 —— 回滚要把它们删掉，才叫"还原"。
  //     判据从严：**只有**盘上那份的 SHA 仍等于 `installed_sha256` 才删；被人改过 ⇒ 拒绝（绝不错删）。
  const tombstones = Array.isArray(doc.tombstones) ? doc.tombstones : []
  const remove = []
  for (let i = 0; i < tombstones.length; i += 1) {
    const t = tombstones[i]
    if (t === null || typeof t !== 'object' || typeof t.path !== 'string' || t.path.trim() === '') {
      throw cliError('E_ARG_SCHEMA', `备份清单的 tombstones 第 ${i + 1} 项缺字符串 path：${manifestFile}`)
    }
    const rel = t.path.replace(/\\/g, '/').replace(/^\.\//, '')
    const segs = rel.split('/').map((s) => s.toLowerCase())
    for (const bad of PROTECTED_REL_SEGMENTS) {
      if (segs.includes(bad)) throw cliError('E_PATH_ESCAPE', `墓碑点了数据目录里的路径（${bad}）：${rel} —— 回滚**只回代码、不回数据**`)
    }
    if (!/^[0-9a-f]{64}$/.test(String(t.installed_sha256 ?? '').toLowerCase())) {
      throw cliError('E_ARG_SCHEMA', `墓碑 ${rel} 的 installed_sha256 不成形状：${JSON.stringify(t.installed_sha256)}`)
    }
    const dstV = resolveWithin(targetRoot, rel)
    if (!dstV.ok) throw cliError(dstV.code, dstV.message)
    if (!fs.existsSync(dstV.path)) {
      remove.push({ rel, dst_abs: dstV.path, action: 'absent', before_sha256: null, installed_sha256: t.installed_sha256.toLowerCase(), delete_gate: null })
      continue
    }
    if (fs.statSync(dstV.path).isDirectory()) throw cliError('E_PATH_ESCAPE', `墓碑位置上是个目录、不是文件：${rel} —— 拒绝`)
    const now = sha256File(dstV.path)
    if (now !== String(t.installed_sha256).toLowerCase()) {
      throw cliError('E_MANIFEST_MISMATCH', `装之后有人改过这个新建件：${rel}（安装写的 ${t.installed_sha256} / 现在 ${now}）—— 拒绝删除，一个字节都不碰`)
    }
    // 删除三闸**在这里先判一次**（还原还一个字节都没写）：闸不过 ⇒ 整场拒，
    // 绝不"回滚到一半才发现删不掉"。删除点上还会再判一次（见下面那两处）。
    const gate = assertDeletableTarget(dstV.path, { label: `墓碑 ${rel}`, liveRoot: targetRoot, allowedRoots: allowedDeleteRoots(targetRoot) })
    remove.push({ rel, dst_abs: gate.path, action: 'remove', before_sha256: now, installed_sha256: String(t.installed_sha256).toLowerCase(), delete_gate: gate.delete_gate })
    covered.add(rel)
  }

  const preservedBefore = treeHashOf(targetRoot, new Set(targetTreeBefore.rels.filter((r) => !covered.has(r))))
  const preservedRels = new Set(preservedBefore.rels)
  const plan = {
    restore: verified.filter((v) => v.live_sha256_before !== v.sha256).map((v) => v.rel),
    same: verified.filter((v) => v.live_sha256_before === v.sha256).map((v) => v.rel),
    create: verified.filter((v) => v.live_sha256_before === null).map((v) => v.rel),
    remove: remove.filter((r) => r.action === 'remove').map((r) => r.rel),
    preserved: [...preservedRels].sort(),
  }

  // ④ 还原
  const rows = []
  for (const v of verified) {
    if (v.live_sha256_before === v.sha256) {
      rows.push({ path: v.rel, action: 'same', wrote: false, before_sha256: v.live_sha256_before, after_sha256: v.live_sha256_before, expected_sha256: v.sha256 })
      continue
    }
    if (args.dryRun) {
      rows.push({ path: v.rel, action: v.live_sha256_before === null ? 'create' : 'restore', wrote: false, before_sha256: v.live_sha256_before, after_sha256: null, expected_sha256: v.sha256 })
      continue
    }
    // 这两条写盘路径的重试上限是 **6**（并集之前 CLI 就是 6；RC-2 的前提也是"6 次不够"）——
    // 共享件的默认 5 只留给其余调用者。见 `lib/atomic.mjs::CLI_WRITE_MAX_ATTEMPTS`。
    const r = writeFileAtomic(v.dst_abs, fs.readFileSync(v.src_abs), { allowedRoot: targetRoot, maxAttempts: CLI_WRITE_MAX_ATTEMPTS })
    if (!r.ok) {
      const err = cliError(r.code, r.message, { path: v.rel })
      // 收残留临时件被拒 ⇒ 那一次删除的判定也进报文（主码仍是 E_TXN_IO —— 两个码各表各的）。
      if (r.cleanup_refused?.delete_gate) err.delete_gate = r.cleanup_refused.delete_gate
      throw err
    }
    const after = sha256File(v.dst_abs)
    if (after !== v.sha256) {
      throw cliError('E_MANIFEST_MISMATCH', `还原之后 SHA 与备份不一致：${v.rel}（要 ${v.sha256} / 实得 ${after}）`, { path: v.rel })
    }
    rows.push({ path: v.rel, action: v.live_sha256_before === null ? 'create' : 'restore', wrote: true, before_sha256: v.live_sha256_before, after_sha256: after, expected_sha256: v.sha256 })
  }
  /** 墓碑：删掉本次安装新建的那些（已经是"验过 SHA 相同"的才走到这儿）。
   *  每一条都带 `delete_gate`（那一次删除的闸判定，裁定 v1.20 ②；没有删除动作 ⇒ `null`），
   *  跟着回收掉的空目录各带一条（`recycled_dirs[].delete_gate`）。 */
  const removed = []
  for (const r of remove) {
    if (args.dryRun) {
      // dry-run 不删 —— 记的是**计划期那一次**判定（同一落点、同一套允许根，判据是确定性的）。
      removed.push({ path: r.rel, action: r.action, wrote: false, installed_sha256: r.installed_sha256, delete_gate: r.delete_gate, recycled_dirs: [] })
      continue
    }
    if (r.action === 'absent') {
      // 墓碑本来就不在盘上 ⇒ 这一次**没有删除动作** ⇒ `null`（不编造一个"放行"）。
      removed.push({ path: r.rel, action: 'absent', wrote: false, installed_sha256: r.installed_sha256, delete_gate: null, recycled_dirs: [] })
      continue
    }
    // 删除点（一）：墓碑文件。删之前再过一次三闸 —— 删的永远是**①解析后的**那个落点。
    const del = assertDeletableTarget(r.dst_abs, { label: `墓碑 ${r.rel}`, liveRoot: targetRoot, allowedRoots: allowedDeleteRoots(targetRoot) })
    fs.unlinkSync(del.path)
    /** 删除点（二）那几次判定：跟着回收掉的空目录，一个一个记。 */
    const recycledDirs = []
    // 顺手收掉因此变空的目录（只往上走到靶子根为止，绝不删靶子自己）
    let dir = path.dirname(del.path)
    while (isUnder(dir, targetRoot) && normKey(dir) !== normKey(targetRoot)) {
      let names = []
      try {
        names = fs.readdirSync(dir)
      } catch {
        break
      }
      if (names.length > 0) break
      // 删除点（二）：空目录回收 —— 同样是删除，同样过三闸（严格在靶子根之下）。
      const dirDel = assertDeletableTarget(dir, { label: `空目录回收 ${dir}`, liveRoot: targetRoot, allowedRoots: allowedDeleteRoots(targetRoot) })
      fs.rmdirSync(dirDel.path)
      recycledDirs.push({ path: dirDel.path, delete_gate: dirDel.delete_gate })
      dir = path.dirname(dirDel.path)
    }
    removed.push({ path: r.rel, action: 'removed', wrote: true, installed_sha256: r.installed_sha256, delete_gate: del.delete_gate, recycled_dirs: recycledDirs })
  }
  const appliedCount = plan.restore.length + plan.create.length + plan.remove.length
  const targetTreeAfter = args.dryRun ? null : treeHashOf(targetRoot)
  const preservedAfter = args.dryRun ? null : treeHashOf(targetRoot, preservedRels)

  return {
    status: args.dryRun ? 'DRY-RUN' : appliedCount > 0 ? 'RESTORED' : 'ALREADY-RESTORED',
    applied: !args.dryRun && appliedCount > 0,
    target_root: targetRoot,
    backup_root: backupRoot,
    backup_exists: true,
    require_backup: args.requireBackup,
    backup_manifest: { path: manifestFile, sha256: sha256File(manifestFile), kind: doc.kind ?? null, created_at: doc.created_at ?? null, live_root: doc.live_root ?? null, entries: entries.length, tombstones: tombstones.length },
    restored: rows,
    removed,
    plan,
    counts: { planned: appliedCount, wrote: args.dryRun ? 0 : appliedCount, same: plan.same.length, removed: args.dryRun ? 0 : removed.filter((r) => r.wrote).length, preserved: preservedRels.size },
    target_tree_before: { sha256: targetTreeBefore.sha256, files: targetTreeBefore.files },
    target_tree_after: targetTreeAfter === null ? null : { sha256: targetTreeAfter.sha256, files: targetTreeAfter.files },
    preserved_guard: {
      rels: preservedBefore.rels.length,
      before_sha256: preservedBefore.sha256,
      after_sha256: preservedAfter === null ? null : preservedAfter.sha256,
      unchanged: preservedAfter === null ? null : preservedAfter.sha256 === preservedBefore.sha256,
      note: '保留集合 = 靶子里**备份清单没点到**的那些（数据、未知文件）；前后相同 ⇒ 回滚只碰了备份覆盖到的代码',
    },
    notes: [
      '回滚**只回代码、不回数据**：清单外的文件一个都不删、不改（只覆盖与按墓碑删除，绝不清理目录）',
      '墓碑删除的判据：盘上那份的 SHA 仍等于安装写下的 `installed_sha256`；被人改过就整场拒绝',
      '每一条 `removed[]` 都带 `delete_gate`（那一次删除的闸判定，裁定 v1.20 ②）；**没有删除动作**时是 `null`，不编造"放行"',
    ],
  }
}

// ── 入口 ───────────────────────────────────────────────────────────────────
function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
}
const OPS = { rollback: opRollback }

function main(argv) {
  let op = 'rollback'
  try {
    const args = parseArgs(argv)
    op = args.op
    if (op === null || String(op).trim() === '') throw cliError('E_USAGE', `缺 --op；可用：${OP_NAMES.join(' / ')}`)
    if (op === 'help') {
      process.stderr.write(`${CLI_NAME} 的 op（${OP_NAMES.length} 个）：\n  ${OP_NAMES.join('\n  ')}\n`)
      emit({ ok: true, op: 'help', cli: CLI_NAME, ops: [...OP_NAMES] })
      return 0
    }
    if (!Object.hasOwn(OPS, op)) throw cliError('E_USAGE', `未知 op：${JSON.stringify(op)}；可用：${OP_NAMES.join(' / ')}`)
    const out = OPS[op](args)
    emit({ ok: true, op, cli: CLI_NAME, ...out })
    return 0
  } catch (err) {
    const code = typeof err?.code === 'string' && Object.hasOwn(CODES, err.code) ? err.code : 'E_INTERNAL'
    process.stderr.write(`[${CLI_NAME}] ${code} ${String(err?.message ?? err)}\n`)
    const envelope = { ok: false, op, cli: CLI_NAME, error: { code, message: String(err?.message ?? err), details: err?.details ?? null } }
    // 拒删 ⇒ 报文里也要有那一次判定的投影（裁定 v1.20 ②：拒删不许只有 stderr 一行）。
    if (err?.delete_gate) envelope.delete_gate = err.delete_gate
    emit(envelope)
    return CODES[code]
  }
}

process.exitCode = main(process.argv.slice(2))
