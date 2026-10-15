#!/usr/bin/env node
/**
 * `agenia-install.mjs` —— 把 **staged** 的预设装进 **活体**（`presets/agenia`）。
 *
 * ── 它到底做什么（六步，顺序固定）────────────────────────────────────────────
 *   ① 量**两棵树**：staged 树哈希 + 活体树哈希（口径见下）—— 装之前先知道原来长什么样；
 *   ② 读**文件清单**（`--manifest`；不给就按 staged 树现场合成一份），逐文件算 SHA；
 *   ③ **逐文件 SHA 对账**：源文件 SHA ↔ 清单声明 ↔ 目标现有 SHA（三列并排，谁对不上都写进报告）；
 *   ④ **装前备份**：把"清单覆盖到的、活体上真实存在的"每一个文件原样拷进备份目录，
 *      并写一份 **SHA 清单**（`hash-manifest.json`）。**只备份将被覆盖的那些** —— 数据与未知文件不动；
 *   ⑤ **原子替换**：逐个文件先写同目录下的临时件、再 `rename` 覆盖（Windows 上 rename 是替换语义）。
 *      **只按清单动代码**：不清目录、不删多余文件、不递归覆盖；
 *   ⑥ **装后复量**：活体树哈希 + **被保留集合**的子树哈希（装前 == 装后 ⇒ "只动了清单里那几个"）。
 *
 * ── CLI 形状（两种调用都能用，同一支脚本）──────────────────────────────────
 *   仓库工具：`--staged <dir> --live <dir> [--dry-run] [--manifest <file>] [--backup <dir>]`
 *   测试/被装侧：`--op install --release <dir> --target <dir> [--manifest <file>]`
 *   ⚠️ `--release` 是 `--staged` 的别名、`--target` 是 `--live` 的别名 —— **同一支脚本两个名字**，
 *      不是两套实现。`--staged` / `--live` **逐次显式**：没有任何 env 兜底、没有默认值。
 *
 * ── 硬口径 ──────────────────────────────────────────────────────────────────
 *   · **拒绝**：C 盘 / UNC / 相对路径 / 空串 / `..` 穿越 / 目标落在 `.runtime` 或 `.team` 里 /
 *     源与目标互相包含 / 同一路径写两次 ⇒ 非零退出且**零写入**。
 *   · **`--dry-run` 一个字都不写活体**（逐文件断言：只读、不建目录、不改 mtime）；
 *     备份**只在显式给了 `--backup` 时**才落盘（备份落在活体之外，不是"写活体"）。
 *   · 清单里声明的 `sha256` 与磁盘不符 ⇒ **记进报告**（`declared_mismatches`）；
 *     `--strict-hashes` 才把它当失败（`E_MANIFEST_MISMATCH`）。
 *     ⚠️ 为什么默认不拦：清单可能是别的机器/别的版本的派生物，而**真正要保证的是"发出去的那份字节
 *        落到了目标上"** —— 那一条（源 SHA == 落盘 SHA）**永远**硬拦，与清单声明无关。
 *   · 退出码只从本文件顶部那张 `CODES` 来（与 staged `lib/error-codes.mjs` 同值，双向对账过）。
 *   · 🔴 **每个删除点都走"三闸"**（契约 §2.5）：解析绝对路径 → 校验身份 marker →
 *     校验落点在允许删的根之下。三条缺一即**拒删**（稳定码，非零退出 + 出声）。见 `assertDeletableTarget()`。
 *   · 🔴 **闸的决定进 JSON 报文**（裁定 v1.20 ②）：加性字段 `delete_gate`
 *     `{allowed_roots, marker_kind, resolved, verdict, code}` —— 清旧备份那一次的判定挂在 `backup.delete_gate` 上；
 *     **拒删**时挂在信封顶层（`ok:false` 那一份），与 `error.code` 并排（拒删不许只有 stderr 一行）。
 *     ⚠️ **没有删除动作**（旧备份本来就不在 · `--dry-run` 又没给 `--backup`）⇒ 取值 `null` ——
 *        不编造一个"放行"："放行"的意思是**真判过、真删了**。
 *     ⚠️ 收残留临时件被拒时，那个码同样进 `delete_gate.code`，而信封的主码仍是 `E_TXN_IO`
 *        —— 一次运行里可以同时有两个码，看 `error.code` 还是看 `delete_gate.code` 是两件事。
 *   · 🔴 **显式 `--backup` 指到允许区之外、而且那个落点已经存在 ⇒ 本版拒删**（裁定 v1.20 ①，照准不放宽：
 *     显式指到允许根之外还敢删，正是 I9 那次事故的同一形状）。**默认落点**与"带时间戳的**新**目录"
 *     这两条路不受影响 —— 新目录上根本没有删除动作。
 *
 * ── 树哈希口径（与 `tests/…/support/evidence.mjs` 的 `treeHash()` 逐字相同）──
 *   `sha256( Σ  `${rel}\0${fileSha}\0${bytes}\n` )`，rel 用 `/`、升序、UTF-8；原始字节不归一。
 *
 * ── 备份默认落点（不给 `--backup` 时）──────────────────────────────────────
 *   · 靶子在**测试现场**里（往上三层内有 `.agenia-test-root`）⇒ `<靶子>/../.agenia-install-backup/<slug>`
 *     —— 测试自己收自己的垃圾，不外溢；
 *   · 否则 ⇒ `<repo>/.tools/_backup/agenia-install/<slug>`（E 盘、活体之外、不进版本库）。
 *   两种都**按目标固定**（同名覆盖上一份）：回滚要的是"装之前那一刻"，不是历史；
 *   要留历史就显式给 `--backup <带时间戳的目录>`。
 *
 * ── 另一支 op：`--op publish-staged` ───────────────────────────────────────
 *   把本项目三支仓库脚本**逐字节**拷进 `<stagedPreset>/bin/`（`install.mjs` / `rollback.mjs` /
 *   `release-scan.mjs`）。存在的理由：staged 里那三份是**交付物**，`.tools/` 这三份是**来源** ——
 *   没有这一步，两边就会各改各的（`release-scan.mjs` 有一条 `SCAN-TOOL-DRIFT` 专门盯它）。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const REPO = path.resolve(path.dirname(SELF), '..')
const CLI_NAME = 'install.mjs'

/** 退出码表：键与值都与 staged `lib/error-codes.mjs` 一致（本文件自足，故就地留一份）。 */
const CODES = Object.freeze({
  E_USAGE: 2, E_ARG_SCHEMA: 2, E_ARG_USAGE: 2,
  E_ROOT_MISSING: 3, E_ROOT_RELATIVE: 3, E_ROOT_UNC: 3, E_ROOT_C_DRIVE: 3, E_ROOT_NO_MARKER: 3, E_ROOT_OUTSIDE: 3, E_PATH_ESCAPE: 3,
  E_TXN_IO: 4,
  E_MANIFEST_MISMATCH: 5,
  E_DATA_MISSING: 7, E_MANIFEST_MISSING: 7,
  E_INTERNAL: 8,
})

const TEST_ROOT_MARKER = '.agenia-test-root'
/**
 * 两个黑名单，**分工不同**（混成一个会把合法的靶子也拒掉）：
 *   · `PROTECTED_TARGET_SEGMENTS` —— 判**根路径**（`--live` / `--backup`）：只拦 `.runtime`。
 *     ⚠️ `.team` **不在**这里：测试现场与队伍的办公桌都住在 `.team/` 底下，
 *        靶子落在 `.team/test/…` 是**正常**的（`ins-*` 那几个用例就是这样）。
 *   · `PROTECTED_REL_SEGMENTS` —— 判**清单里的相对路径**（相对活体根）：`.runtime` 与 `.team` 都拦。
 *     这一条才是"**安装只许动代码**"的真判据：活体根底下的数据目录一个字节都不许进去。
 */
const PROTECTED_TARGET_SEGMENTS = ['.runtime']
const PROTECTED_REL_SEGMENTS = ['.runtime', '.team']
const OP_NAMES = ['install', 'publish-staged', 'help']

function cliError(code, message, details = null) {
  const err = new Error(message)
  err.name = 'InstallCliError'
  err.code = code
  err.details = details
  return err
}

// ── 参数 ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    op: 'install', staged: null, live: null, manifest: null, backup: null,
    dryRun: false, strictHashes: false, allowNewLive: false, repo: REPO, testMode: false,
  }
  const takesValue = new Set(['--op', '--staged', '--release', '--live', '--target', '--manifest', '--backup', '--repo'])
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) throw cliError('E_USAGE', `不认这个位置参数：${JSON.stringify(a)}`)
    if (takesValue.has(a)) {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) throw cliError('E_USAGE', `${a} 后面要跟一个值`)
      i += 1
      if (a === '--op') out.op = v
      else if (a === '--staged' || a === '--release') out.staged = v
      else if (a === '--live' || a === '--target') out.live = v
      else if (a === '--manifest') out.manifest = v
      else if (a === '--backup') out.backup = v
      else if (a === '--repo') out.repo = v
      continue
    }
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--strict-hashes') out.strictHashes = true
    else if (a === '--allow-new-live') out.allowNewLive = true
    else if (a === '--test-mode') out.testMode = true
    else throw cliError('E_USAGE', `未知参数：${a}`)
  }
  return out
}

// ── 路径守卫（与 staged `lib/paths.mjs` 同一套判据，本文件自足故就地留一份）──
function canonical(p) {
  const abs = path.resolve(String(p))
  try {
    return realpathSync.native(abs) // 盘上存在 ⇒ 连 junction/symlink 一起吃掉
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
 * 路径判定。`allowProtected` 只对**备份落点**开：备份本来就该落在一个普通目录里
 * （`.team/` 之下也算普通目录 —— 那是队伍的办公桌，不是被安装的数据区）。
 * ⚠️ 靶子（`--live`）**永远**不许落在 `.runtime` 里。
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
  if (!isUnder(abs, baseAbs)) {
    return { ok: false, code: 'E_PATH_ESCAPE', message: `清单里的路径逃出了源根：${rel} → ${abs}` }
  }
  return { ok: true, code: null, path: abs }
}

// ── 删除三闸（契约 §2.5）────────────────────────────────────────────────────
/**
 * **每个**删除/递归删除点删之前都要过这三关（缺一即拒删，抛稳定码，绝不"先删了再说"）：
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
 *
 * ⚠️ 本文件自足（`.tools/` 与 `bin/` 那两份必须逐字节同源），所以**不 import** `lib/paths.mjs` ——
 *    判据与它同源，靠的是同一套原语（`canonical` / `isUnder` / `pathVerdict`）。
 */
const BACKUP_MANIFEST_NAME = 'hash-manifest.json'
const PRESET_ROOT_MARKER = 'agent.cordis.yml'

/** 一个目录里有没有这个文件 —— 判据是"在不在"，读不动就当没有。 */
function hasFileIn(dir, name) {
  try {
    return statSync(path.join(dir, name)).isFile()
  } catch {
    return false
  }
}

/**
 * 身份 marker（第 ② 闸的判据）。目标是文件时判**它所在的目录**（"这个落点属于哪个根"）。
 * @returns {{kind:string, at:string}|null}
 */
function markerOf(target, { liveRoot } = {}) {
  let isDir = false
  try {
    isDir = statSync(target).isDirectory()
  } catch {
    isDir = false
  }
  let at = canonical(isDir ? target : path.dirname(target))
  for (let i = 0; i < 5; i += 1) {
    if (hasFileIn(at, TEST_ROOT_MARKER)) return { kind: 'run-root', at }
    if (i === 0 && hasFileIn(at, BACKUP_MANIFEST_NAME) && isOurBackupRoot(at, liveRoot)) return { kind: 'backup-root', at }
    if (i === 0 && hasFileIn(at, PRESET_ROOT_MARKER)) return { kind: 'preset-root', at }
    const up = path.dirname(at)
    if (up === at) break
    at = up
  }
  return null
}

/** 备份根自证：带 `hash-manifest.json`、kind 对、**而且点名了本次靶子**。 */
function isOurBackupRoot(dir, liveRoot) {
  if (liveRoot === undefined || liveRoot === null) return false
  let doc = null
  try {
    doc = JSON.parse(readFileSync(path.join(dir, BACKUP_MANIFEST_NAME), 'utf8'))
  } catch {
    return false
  }
  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.files)) return false
  if (doc.kind !== undefined && doc.kind !== 'agenia-install-backup') return false
  // `live_root` 缺失（早期版本的备份）⇒ 不当成"我们的"：宁可拒删，也不删错。
  return typeof doc.live_root === 'string' && normKey(doc.live_root) === normKey(liveRoot)
}

/**
 * 闸的决定 → 报文里那个**加性字段**（裁定 v1.20 ②）：五个键，一个不多、一个不少。
 *   · `allowed_roots` —— 这一次判定的"应删的根"（解析成绝对路径；没给的那一档不占位）；
 *   · `marker_kind`   —— 第 ② 闸认出的身份（`run-root` / `backup-root` / `preset-root`）；
 *     **没走到第 ② 闸**（①就拒了 · 落点把活体根包住了）⇒ `null` —— 不编造"它带了 marker"；
 *   · `resolved`      —— 第 ① 闸解析后的落点；解析不出来（相对 / UNC / 缺失）⇒ `null`；
 *   · `verdict`       —— `"allow"` / `"deny"`；`code` —— 拒的那个稳定码（放行时 `null`）。
 * ⚠️ 它只是一份**投影**：判定本身仍是 `deletableVerdict()` 那一份，报文不许反过来改判定。
 */
function gateReport({ allowedRoots, marker, resolved, verdict, code }) {
  return {
    allowed_roots: (allowedRoots ?? [])
      .filter((r) => r?.root !== undefined && r.root !== null && String(r.root).trim() !== '')
      .map((r) => canonical(r.root)),
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
 * @param {string} rawTarget 要删的落点（**原样**传进来，别预先 canonical —— 第 ① 闸要自己解析）
 * @param {{label:string, liveRoot:string, allowedRoots:Array<{root:string|null, why:string}>}} options
 *        `allowedRoots` = 契约里那句"**应删的根**"：目标必须严格落在其中之一
 */
function deletableVerdict(rawTarget, { label, liveRoot, allowedRoots }) {
  /** 拒的那一支：稳定码 + 那一项 `delete_gate`（裁定 v1.20 ②：拒删不许只有 stderr 一行）。 */
  const deny = (code, message, { marker = null, resolved = null } = {}) => ({
    ok: false,
    code,
    message,
    delete_gate: gateReport({ allowedRoots, marker, resolved, verdict: 'deny', code }),
  })

  // ① 解析绝对路径（相对 / UNC / C 盘 / 数据目录在这条路上就拒）
  const v = pathVerdict(rawTarget, label)
  if (!v.ok) return deny(v.code, `拒绝删除：${v.message}`, { resolved: v.path ?? null })
  const target = v.path

  // 删的落点不许把活体根包进去（否则"清旧备份"会把靶子本身一起清掉）
  if (liveRoot !== undefined && liveRoot !== null && normKey(target) !== normKey(liveRoot) && isUnder(liveRoot, target)) {
    return deny('E_ROOT_OUTSIDE', `拒绝删除：${label} 把活体根包在里面（删一次连靶子一起没）：${target} ⊇ ${canonical(liveRoot)}`, { resolved: target })
  }

  // ③ 落点：挑最贴身（最长）的那个允许根 —— 也用于第 ② 闸判"它所属的根"
  let matched = null
  for (const r of allowedRoots ?? []) {
    if (r?.root === undefined || r.root === null || String(r.root).trim() === '') continue
    const root = canonical(r.root)
    if (normKey(target) === normKey(root)) continue // 严格：允许根本身不许被删
    if (!isUnder(target, root)) continue
    if (matched === null || normKey(root).length > normKey(matched.root).length) matched = { root, why: r.why }
  }

  // ② 身份 marker：目标自己，或它所属的那个允许根
  const onTarget = markerOf(target, { liveRoot })
  const onRoot = matched === null ? null : markerOf(matched.root, { liveRoot })
  if (onTarget === null && onRoot === null) {
    return deny('E_ROOT_NO_MARKER', `拒绝删除：${label} 自己不带 ${BACKUP_MANIFEST_NAME} / ${PRESET_ROOT_MARKER}，所属根也不带 ${TEST_ROOT_MARKER}：${target}${matched === null ? '' : `（所属根 ${matched.root}）`}`, { resolved: target })
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

/**
 * **拒删的错误形状**（裁定 v1.20 ②：拒删不许只有 stderr 一行）：稳定码 + 一份 `delete_gate`，
 * 由 `main()` 落到信封顶层、与 `ok:false` 并排。
 *   · 三闸那一支把 `deletableVerdict()` 已经算好的投影**原样**递进来（`gate`）；
 *   · 上游那几支（`--backup` 落点本身不合格 ⇒ 本次运行的删除动作当场被拒）就地投影一份 ——
 *     **码与那一次判定逐字一致**，不另编一个。
 */
function refuseDelete({ code, message, resolved = null, marker = null, allowedRoots = null, gate = null }) {
  const err = cliError(code, message)
  err.delete_gate = gate ?? gateReport({ allowedRoots, marker, resolved, verdict: 'deny', code })
  return err
}

/** 三闸的**执行**形状：不过就抛（调用方据此非零退出 + 出声），过就给出解析后的落点。 */
function assertDeletableTarget(rawTarget, options) {
  const v = deletableVerdict(rawTarget, options)
  if (!v.ok) throw refuseDelete({ code: v.code, message: v.message, gate: v.delete_gate })
  return v
}

// ── 哈希 ───────────────────────────────────────────────────────────────────
const sha256Buf = (buf) => createHash('sha256').update(buf).digest('hex')
const sha256File = (f) => sha256Buf(readFileSync(f))
function walkFiles(root) {
  const out = []
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = statSync(full)
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
  const digest = createHash('sha256')
  for (const f of picked) digest.update(`${f.rel}\u0000${f.sha256}\u0000${f.bytes}\n`, 'utf8')
  return { sha256: digest.digest('hex'), files: picked.length, rels: picked.map((f) => f.rel) }
}

// ── 清单 ───────────────────────────────────────────────────────────────────
const SHA_RE = /^[0-9a-f]{64}$/i
function readManifest(file) {
  const abs = canonical(file)
  if (!existsSync(abs)) throw cliError('E_MANIFEST_MISSING', `清单文件不在：${abs}`)
  let doc
  try {
    doc = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (err) {
    throw cliError('E_MANIFEST_MISSING', `清单不是可解析 JSON：${abs} —— ${String(err.message)}`)
  }
  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.files)) {
    throw cliError('E_ARG_SCHEMA', '清单必须是一个对象且带 `files` 数组')
  }
  const seen = new Set()
  const files = doc.files.map((entry, i) => {
    if (entry === null || typeof entry !== 'object' || typeof entry.path !== 'string' || entry.path.trim() === '') {
      throw cliError('E_ARG_SCHEMA', `清单第 ${i + 1} 项缺字符串 \`path\``)
    }
    const rel = entry.path.replace(/\\/g, '/').replace(/^\.\//, '')
    if (seen.has(rel)) throw cliError('E_ARG_SCHEMA', `清单里同一个路径出现两次：${rel}`)
    seen.add(rel)
    return { rel, declared_sha256: typeof entry.sha256 === 'string' ? entry.sha256.toLowerCase() : null, declared_bytes: Number.isInteger(entry.bytes) ? entry.bytes : null }
  })
  return { abs, source: 'file', doc, files }
}
function synthesizeManifest(stagedRoot) {
  const files = walkFiles(stagedRoot)
    .filter((f) => !f.rel.replace(/\\/g, '/').split('/').some((s) => PROTECTED_REL_SEGMENTS.includes(s.toLowerCase())))
    .map((f) => ({ rel: f.rel, declared_sha256: f.sha256, declared_bytes: f.bytes }))
  return { abs: null, source: 'synthesized', doc: { schema: 1, preset: path.basename(stagedRoot), version: null, files: [] }, files }
}

// ── 备份落点 ───────────────────────────────────────────────────────────────
function slugOf(p) {
  return canonical(p).replace(/^[A-Za-z]:/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
}
function insideTestScene(liveRoot) {
  let dir = canonical(liveRoot)
  for (let i = 0; i < 4; i += 1) {
    dir = path.dirname(dir)
    if (dir === path.dirname(dir)) break
    if (existsSync(path.join(dir, TEST_ROOT_MARKER))) return dir
  }
  return null
}
function defaultBackupRoot(liveRoot) {
  const slug = slugOf(liveRoot)
  const scene = insideTestScene(liveRoot)
  if (scene !== null) return path.join(scene, '.agenia-install-backup', slug)
  return path.join(REPO, '.tools', '_backup', 'agenia-install', slug)
}

/**
 * 清旧备份那一次判定用的**允许根** —— 上游（判 `--backup` 落点）与删除点用的是同一份：
 * 本工具为这个靶子推导出的备份区，以及（测试现场的）那个带 marker 的运行根。
 * ⚠️ 两个都要给：生产形状下备份区自己不带任何 marker，身份要靠靶子所属的运行根那一支。
 */
function allowedDeleteRoots(liveRoot) {
  return [
    { root: path.dirname(defaultBackupRoot(liveRoot)), why: '本工具为这个靶子推导出的备份区' },
    { root: insideTestScene(liveRoot), why: `带 ${TEST_ROOT_MARKER} 的运行根` },
  ]
}

/**
 * 原子替换：同目录临时件 + rename。**失败就重试几次**（Windows 上 EPERM/EBUSY 是常态）。
 * `allowedRoot` = 这一次写进去的那个根：收残留临时件也是**删除**，同样要过三闸；
 * 闸不过就**出声留着**（绝不静默 —— 静默的"清不掉"和"清干净了"长得一模一样）。
 * 被拒的那一次判定记进返回值 `cleanup_refused.delete_gate`（裁定 v1.20 ②），调用方据此把它挂到错误上。
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
function writeFileAtomic(dest, buf, { allowedRoot } = {}) {
  const dir = path.dirname(dest)
  mkdirSync(dir, { recursive: true }) // 目标目录可能还不存在（`create` 那一档就是）
  const tmp = path.join(dir, `.${path.basename(dest)}.agenia-tmp-${process.pid}`)
  let last = null
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      writeFileSync(tmp, buf)
      renameSync(tmp, dest)
      return { ok: true, tmp }
    } catch (err) {
      last = err
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err?.code)) break
      sleepSync(25 * (attempt + 1))
    }
  }
  const cleanup = deletableVerdict(tmp, {
    label: '原子写的残留临时件',
    liveRoot: allowedRoot,
    allowedRoots: [{ root: allowedRoot ?? null, why: '本次写入的根' }],
  })
  let cleanupRefused = null
  if (!cleanup.ok) {
    cleanupRefused = { code: cleanup.code, message: cleanup.message, delete_gate: cleanup.delete_gate }
    process.stderr.write(`[${CLI_NAME}] ${cleanup.code} ${cleanup.message} —— 临时件留着，不静默\n`)
  } else {
    try {
      unlinkSync(cleanup.path)
    } catch {
      /* 清不掉就留着 —— 但绝不静默当成功 */
    }
  }
  return { ok: false, code: 'E_TXN_IO', message: `原子替换失败（${last?.code ?? '未知'}）：${dest} —— ${String(last?.message ?? '')}`, cleanup_refused: cleanupRefused }
}

// ── op: install ────────────────────────────────────────────────────────────
function opInstall(args) {
  const stagedV = pathVerdict(args.staged, '--staged/--release')
  if (!stagedV.ok) throw cliError(stagedV.code, stagedV.message)
  const liveV = pathVerdict(args.live, '--live/--target')
  if (!liveV.ok) throw cliError(liveV.code, liveV.message)
  const stagedRoot = stagedV.path
  const liveRoot = liveV.path

  if (!existsSync(stagedRoot) || !statSync(stagedRoot).isDirectory()) {
    throw cliError('E_DATA_MISSING', `staged 根不在（或不是目录）：${stagedRoot}`)
  }
  if (!existsSync(liveRoot) || !statSync(liveRoot).isDirectory()) {
    if (!args.allowNewLive) {
      throw cliError('E_DATA_MISSING', `活体根不在（或不是目录）：${liveRoot} —— 装前备份无从谈起；确实要新建请显式 --allow-new-live`)
    }
    mkdirSync(liveRoot, { recursive: true })
  }
  if (isUnder(stagedRoot, liveRoot) || isUnder(liveRoot, stagedRoot)) {
    throw cliError('E_ROOT_OUTSIDE', `源与目标互相包含（staged=${stagedRoot} · live=${liveRoot}）—— 拒绝`)
  }
  if (normKey(stagedRoot) === normKey(liveRoot)) throw cliError('E_ROOT_OUTSIDE', '源与目标是同一个目录 —— 拒绝')

  const manifest = args.manifest === null ? synthesizeManifest(stagedRoot) : readManifest(args.manifest)

  // ② 逐文件：源 SHA / 目标 SHA / 清单声明 —— 三列并排
  const files = []
  const problems = []
  for (const entry of manifest.files) {
    const srcV = resolveWithin(stagedRoot, entry.rel)
    if (!srcV.ok) throw cliError(srcV.code, srcV.message)
    const dstV = resolveWithin(liveRoot, entry.rel)
    if (!dstV.ok) throw cliError(dstV.code, dstV.message)
    const segs = entry.rel.split('/').map((s) => s.toLowerCase())
    for (const bad of PROTECTED_REL_SEGMENTS) {
      if (segs.includes(bad)) throw cliError('E_PATH_ESCAPE', `清单里的路径落在数据目录里（${bad}）：${entry.rel} —— 安装只许动代码`)
    }
    const srcExists = existsSync(srcV.path) && statSync(srcV.path).isFile()
    if (!srcExists) {
      problems.push({ code: 'E_MANIFEST_MISSING', path: entry.rel, message: `清单点名了 ${entry.rel}，但源根里没有这个文件` })
      continue
    }
    const sourceSha = sha256File(srcV.path)
    const sourceBytes = statSync(srcV.path).size
    const dstExists = existsSync(dstV.path) && statSync(dstV.path).isFile()
    const liveSha = dstExists ? sha256File(dstV.path) : null
    const declaredOk = entry.declared_sha256 === null ? null : entry.declared_sha256 === sourceSha
    const declaredBytesOk = entry.declared_bytes === null ? null : entry.declared_bytes === sourceBytes
    files.push({
      path: entry.rel,
      action: !dstExists ? 'create' : liveSha === sourceSha ? 'same' : 'replace',
      source_sha256: sourceSha,
      source_bytes: sourceBytes,
      live_sha256_before: liveSha,
      declared_sha256: entry.declared_sha256,
      declared_matches_source: declaredOk,
      declared_bytes_matches_source: declaredBytesOk,
      src_abs: srcV.path,
      dst_abs: dstV.path,
    })
  }
  if (problems.length > 0) throw cliError('E_MANIFEST_MISSING', `清单里有 ${problems.length} 项在源根里找不到 —— 拒绝（一个都不许猜）`, problems)
  if (args.strictHashes) {
    const bad = files.filter((f) => f.declared_matches_source === false || f.declared_bytes_matches_source === false)
    if (bad.length > 0) throw cliError('E_MANIFEST_MISMATCH', `--strict-hashes：有 ${bad.length} 项与清单声明对不上`, bad.map((f) => f.path))
  }

  // ① 两棵树
  const stagedTree = treeHashOf(stagedRoot)
  const liveTreeBefore = treeHashOf(liveRoot)
  const manifestRels = new Set(files.map((f) => f.path))
  const preservedBefore = treeHashOf(liveRoot, new Set(liveTreeBefore.rels.filter((r) => !manifestRels.has(r))))
  const preservedRels = new Set(preservedBefore.rels)

  const plan = {
    create: files.filter((f) => f.action === 'create').map((f) => f.path),
    replace: files.filter((f) => f.action === 'replace').map((f) => f.path),
    same: files.filter((f) => f.action === 'same').map((f) => f.path),
    preserved: [...preservedRels].sort(),
  }
  const extraInStaged = stagedTree.rels.filter((r) => !manifestRels.has(r)).sort()

  // ④ 装前备份：只备份"清单覆盖到的、活体上真实存在的"那些
  //    ⚠️ `--backup` 判的是**原样给的那个值**：先 `canonical()` 再看，就永远看不出它本来是相对的
  //    （相对路径会被 `path.resolve` 悄悄锚到进程 cwd —— 删旧备份/覆盖之前必须先把这一手掐掉）。
  const backupRaw = args.backup === null ? defaultBackupRoot(liveRoot) : args.backup
  const backupBV = pathVerdict(backupRaw, '--backup', { allowProtected: true })
  // 这两条拒的是"**落点本身不合格**" ⇒ 本次运行的删除动作当场被拒：报文里同样要带那一项
  // （裁定 v1.20 ②）—— 码与这一次判定逐字一致（相对 / C 盘 / UNC / 数据目录；落点把活体包住）。
  if (!backupBV.ok) throw refuseDelete({ code: backupBV.code, message: backupBV.message, resolved: backupBV.path ?? null, allowedRoots: allowedDeleteRoots(liveRoot) })
  const backupRoot = backupBV.path
  if (isUnder(backupRoot, liveRoot)) throw refuseDelete({ code: 'E_ROOT_OUTSIDE', message: `备份落点不许在活体里面：${backupRoot}`, resolved: backupRoot, allowedRoots: allowedDeleteRoots(liveRoot) })
  const toBackup = files.filter((f) => f.live_sha256_before !== null)
  /** 墓碑：清单里有、**活体上本来没有**的那些（这次是 `create`）—— 回滚要把它们删掉，才叫"还原"。 */
  const tombstones = files.filter((f) => f.live_sha256_before === null).map((f) => ({ path: f.path, installed_sha256: f.source_sha256 }))
  const backup = {
    path: backupRoot,
    existed: existsSync(backupRoot),
    created: false,
    // 清旧备份那一次的闸判定（加性字段，裁定 v1.20 ②）：真删过 ⇒ `verdict:"allow"`；
    // 🔴 **没有删除动作**（旧备份本来就不在 · dry-run 又没给 `--backup`）⇒ `null` —— 不编造一个"放行"。
    delete_gate: null,
    files: toBackup.map((f) => ({ path: f.path, bytes: statSync(f.dst_abs).size, sha256: f.live_sha256_before })),
    tombstones,
    manifest_path: path.join(backupRoot, 'hash-manifest.json'),
    hash_manifest: null,
    note: '备份只装"将被覆盖"的那些活体文件（`files`）；清单里活体本来就没有的那些记成**墓碑**（`tombstones`）—— 回滚据此删掉本次新建的代码文件。数据与清单外的文件一个字节都不碰。',
  }
  const writeBackup = !args.dryRun || args.backup !== null
  if (writeBackup) {
    // 旧备份要清掉（同名覆盖上一份）—— **递归删除，必须过三闸**：解析绝对路径 → 身份 marker → 落点。
    // 允许删的根只有两个：本工具为这个靶子推导出的备份区，以及（测试现场的）那个带 marker 的运行根。
    if (existsSync(backupRoot)) {
      const del = assertDeletableTarget(backupRoot, { label: '--backup 落点（本工具要清的旧备份）', liveRoot, allowedRoots: allowedDeleteRoots(liveRoot) })
      backup.delete_gate = del.delete_gate
      rmSync(del.path, { recursive: true, force: true })
    }
    mkdirSync(path.join(backupRoot, 'files'), { recursive: true })
    for (const f of toBackup) {
      const dst = path.join(backupRoot, 'files', ...f.path.split('/'))
      mkdirSync(path.dirname(dst), { recursive: true })
      writeFileSync(dst, readFileSync(f.dst_abs))
    }
    const hashManifest = {
      schema: 1,
      kind: 'agenia-install-backup',
      created_at: new Date().toISOString(),
      live_root: liveRoot,
      staged_root: stagedRoot,
      install_manifest: manifest.abs,
      caliber: 'tree/files 的 sha256 都是"原始字节"的 SHA-256；备份件逐字节拷贝后再复算一次',
      files: backup.files,
      tombstones,
      tombstones_note: '墓碑 = 装之前活体上**不存在**、本次由安装创建的代码文件。回滚只在"盘上那份的 SHA 仍等于 installed_sha256"时删它们（被人改过就拒绝，绝不错删）。',
    }
    writeFileSync(backup.manifest_path, `${JSON.stringify(hashManifest, null, 2)}\n`, 'utf8')
    backup.hash_manifest = sha256File(backup.manifest_path)
    backup.created = true
    // 备份**自己复算一遍**：拷过去的那份必须与被拷的那份逐字节相同
    const bad = []
    for (const f of toBackup) {
      const dst = path.join(backupRoot, 'files', ...f.path.split('/'))
      if (!existsSync(dst) || sha256File(dst) !== f.live_sha256_before) bad.push(f.path)
    }
    if (bad.length > 0) throw cliError('E_TXN_IO', `备份件复算对不上（${bad.length} 项）—— 拒绝继续安装`, bad)
  }

  // ⑤ 原子替换
  const appliedByPath = new Map()
  if (!args.dryRun) {
    for (const f of files) {
      if (f.action === 'same') {
        appliedByPath.set(f.path, { wrote: false, live_sha256_after: f.live_sha256_before })
        continue
      }
      const r = writeFileAtomic(f.dst_abs, readFileSync(f.src_abs), { allowedRoot: liveRoot })
      if (!r.ok) {
        const err = cliError(r.code, r.message, { path: f.path })
        // 收残留临时件被拒 ⇒ 那一次删除的判定也进报文（主码仍是 E_TXN_IO —— 两个码各表各的）。
        if (r.cleanup_refused?.delete_gate) err.delete_gate = r.cleanup_refused.delete_gate
        throw err
      }
      const after = sha256File(f.dst_abs)
      if (after !== f.source_sha256) {
        throw cliError('E_MANIFEST_MISMATCH', `落盘之后 SHA 与源不一致：${f.path}（源 ${f.source_sha256} / 落盘 ${after}）`, { path: f.path })
      }
      appliedByPath.set(f.path, { wrote: true, live_sha256_after: after })
    }
  }

  // ⑥ 装后复量
  const liveTreeAfter = args.dryRun ? null : treeHashOf(liveRoot)
  const preservedAfter = args.dryRun ? null : treeHashOf(liveRoot, preservedRels)

  return {
    mode: args.dryRun ? 'dry-run' : 'apply',
    staged_root: stagedRoot,
    live_root: liveRoot,
    staged_tree: { sha256: stagedTree.sha256, files: stagedTree.files },
    live_tree_before: { sha256: liveTreeBefore.sha256, files: liveTreeBefore.files },
    live_tree_after: liveTreeAfter === null ? null : { sha256: liveTreeAfter.sha256, files: liveTreeAfter.files },
    manifest: {
      path: manifest.abs,
      source: manifest.source,
      preset: manifest.doc?.preset ?? null,
      version: manifest.doc?.version ?? null,
      entries: manifest.files.length,
      declared_mismatches: files.filter((f) => f.declared_matches_source === false).map((f) => ({ path: f.path, declared: f.declared_sha256, actual: f.source_sha256 })),
      extra_in_staged: extraInStaged,
      note: extraInStaged.length > 0 ? '源根里这些文件不在清单里 ⇒ **不装**（只按清单覆盖代码）' : null,
    },
    plan,
    files: files.map((f) => ({
      path: f.path,
      action: f.action,
      wrote: appliedByPath.get(f.path)?.wrote ?? false,
      source_sha256: f.source_sha256,
      source_bytes: f.source_bytes,
      live_sha256_before: f.live_sha256_before,
      live_sha256_after: appliedByPath.get(f.path)?.live_sha256_after ?? f.live_sha256_before,
      declared_sha256: f.declared_sha256,
      declared_matches_source: f.declared_matches_source,
    })),
    backup,
    preserved_guard: {
      rels: preservedBefore.rels.length,
      before_sha256: preservedBefore.sha256,
      after_sha256: preservedAfter === null ? null : preservedAfter.sha256,
      unchanged: preservedAfter === null ? null : preservedAfter.sha256 === preservedBefore.sha256,
      note: '被保留集合 = 活体里**不在清单里**的那些（数据与未知文件）；装前 == 装后 ⇒ 一个字节都没动',
    },
    counts: {
      manifest: manifest.files.length,
      create: plan.create.length,
      replace: plan.replace.length,
      same: plan.same.length,
      preserved: plan.preserved.length,
      tombstones: tombstones.length,
      wrote: args.dryRun ? 0 : plan.create.length + plan.replace.length,
    },
    notes: [
      'staged 树哈希与活体树哈希是**两棵树**（口径 treeHash：rel\\0sha\\0bytes\\n）',
      '清单声明的 sha256 与磁盘不符 ⇒ 只记进 declared_mismatches；--strict-hashes 才拦',
      '活体上本来没有的那些记进 backup.tombstones ⇒ 回滚会把它们删掉（这才叫"还原"）',
      '`backup.delete_gate` = 清旧备份那一次的闸判定（裁定 v1.20 ②）；旧备份本来不在 ⇒ `null`，不编造"放行"',
    ],
  }
}

// ── op: publish-staged ─────────────────────────────────────────────────────
function opPublishStaged(args) {
  const v = pathVerdict(args.staged, '--staged/--release')
  if (!v.ok) throw cliError(v.code, v.message)
  const presetRoot = v.path
  if (!existsSync(presetRoot) || !statSync(presetRoot).isDirectory()) {
    throw cliError('E_DATA_MISSING', `staged 预设根不在：${presetRoot}`)
  }
  if (!existsSync(path.join(presetRoot, 'agent.cordis.yml'))) {
    throw cliError('E_DATA_MISSING', `${presetRoot} 里没有 agent.cordis.yml —— 这不像是预设根，拒绝往里写脚本`)
  }
  const repoV = pathVerdict(args.repo, '--repo')
  if (!repoV.ok) throw cliError(repoV.code, repoV.message)
  const map = [
    ['agenia-install.mjs', 'install.mjs'],
    ['agenia-rollback.mjs', 'rollback.mjs'],
    ['agenia-release-scan.mjs', 'release-scan.mjs'],
  ]
  const published = []
  const drift = []
  for (const [srcName, dstName] of map) {
    const from = path.join(repoV.path, '.tools', srcName)
    const to = path.join(presetRoot, 'bin', dstName)
    if (!existsSync(from)) throw cliError('E_DATA_MISSING', `来源脚本不在：${from}`)
    if (normKey(from) === normKey(to)) throw cliError('E_ROOT_OUTSIDE', `来源与落点是同一个文件：${from}`)
    if (existsSync(to) && sha256File(to) === sha256File(from)) drift.push({ name: dstName, state: 'already-identical' })
    mkdirSync(path.dirname(to), { recursive: true })
    const r = writeFileAtomic(to, readFileSync(from), { allowedRoot: presetRoot })
    if (!r.ok) {
      const err = cliError(r.code, r.message, { path: to })
      if (r.cleanup_refused?.delete_gate) err.delete_gate = r.cleanup_refused.delete_gate
      throw err
    }
    const sha = sha256File(to)
    if (sha !== sha256File(from)) throw cliError('E_MANIFEST_MISMATCH', `publish 之后逐字节对不上：${to}`)
    published.push({ name: dstName, from, to, bytes: statSync(to).size, sha256: sha, was: drift.some((d) => d.name === dstName) ? 'identical' : 'synced' })
  }
  return { staged: presetRoot, published, note: '逐字节拷贝 —— staged/bin 那三支与 .tools 这三支必须始终同源（release-scan 的 SCAN-TOOL-DRIFT 盯着）' }
}

// ── 入口 ───────────────────────────────────────────────────────────────────
function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
}
const OPS = { install: opInstall, 'publish-staged': opPublishStaged }

function main(argv) {
  let op = 'install'
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
