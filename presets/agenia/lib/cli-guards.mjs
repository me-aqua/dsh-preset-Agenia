/**
 * `lib/cli-guards.mjs` —— `install.mjs` / `rollback.mjs` **共用**的 8 个 helper（构案 0008 · 史山清查 B3）。
 *
 * 这 8 个函数（`assertDeletableTarget` · `defaultBackupRoot` · `driveOf` · `emit` · `isUnder` ·
 * `normKey` · `pathVerdict` · `slugOf`，合计 2,194 字符）现在**只有这一份**：
 *   · 两支 CLI 用 `import` 拿（`presets/agenia/bin/{install,rollback}.mjs`）；
 *   · 出厂件（`bin/rollback.mjs`）里那一份由 `bin/install.mjs --op publish-staged` 把下面那个
 *     标记块**逐字内联**进去 —— 出厂件保持单文件、零静态引用（拍板 Q6）。
 *
 * ── 标记块（发布器与判据都按**标签**认这一段，不按行号）─────────────────────────
 *   下面那 8 个函数被一对标记夹住（`@inline-begin` / `@inline-end`，标签是 `公共 helper 正文`），
 *   标记之间是**逐字搬走**的正文。
 *   ⚠️ 本注释里刻意不写"标记 + 标签"的完整字面量：发布器与判据都按行找那一对标记，
 *      注释里再写一遍就会被当成真的标记行（切出来的正文会从注释开始）。
 *   块里只放这 8 个函数：它们除了下面那几样宿主侧依赖之外不引用块外的东西，也不声明模块级 `const`
 *   —— 出厂件里这一块要与「原子写并集正文」拼进同一个模块作用域（多一样会撞名，少一样会在用户回滚时炸）。
 *
 * ── 块外那几样是**宿主侧依赖**（为什么不搬进块里）───────────────────────────────
 *   这 8 个的正文按字节冻结（与抽出前两支 CLI 里那两份逐字相同），闭包引用了这六个名字：
 *     · 三个**已分叉**的 helper —— `canonical` · `insideTestScene` · `refuseDelete`
 *       （构案 0008 §④：已分叉的不许顺手合并 ⇒ 它们不进块）；
 *     · 三个同名同值的模块级 `const` —— `REPO` · `TEST_ROOT_MARKER` · `PROTECTED_TARGET_SEGMENTS`
 *       （搬进块里会与出厂件自己那一份撞名 —— 两块正文要拼进同一个模块作用域）。
 *   于是：**出厂件**里，块内正文读到的是 `rollback.mjs` 自己那几份（同一个模块作用域 —— 行为与抽出前一致）；
 *   **本模块**里，词法作用域借不到调用方的定义 ⇒ 下面这几份就是本模块自己的依赖实现。
 *   它们与两支 CLI 那几份**语义相同**（`canonical` = resolve + realpath；`insideTestScene` = 往上四层找
 *   `.agenia-test-root`；`refuseDelete` = 稳定码 + `delete_gate` 的错误信封），差别只在写法与 `err.name`。
 *   把这三个函数也合成一份，是那 10 个已分叉者各自的事（另一张票）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deletableVerdict } from './atomic.mjs'

/** 仓库根（本文件在 `presets/agenia/lib/` ⇒ 往上三级）。与两支 CLI 的 `REPO` 同一个值。 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** 运行根的 marker（`insideTestScene()` 用；与两支 CLI 同名同值）。 */
const TEST_ROOT_MARKER = '.agenia-test-root'

/** 靶子根 / 备份根都不许落在数据目录里（`pathVerdict()` 的黑名单；与两支 CLI 同名同值）。 */
const PROTECTED_TARGET_SEGMENTS = ['.runtime']

/** canonical：先 `resolve`（吃掉 `..` 与 `.`），盘上存在再 `realpath`（连 junction/symlink 一起）。 */
function canonical(p) {
  const abs = path.resolve(String(p))
  try {
    return fs.realpathSync.native(abs)
  } catch {
    return abs
  }
}

/** 靶子往上四层里找带 `.agenia-test-root` 的运行根（找到 ⇒ 回它；找不到 ⇒ `null`）。 */
function insideTestScene(liveRoot) {
  let dir = canonical(liveRoot)
  for (let i = 0; i < 4; i += 1) {
    dir = path.dirname(dir)
    if (dir === path.dirname(dir)) break
    if (fs.existsSync(path.join(dir, TEST_ROOT_MARKER))) return dir
  }
  return null
}

/**
 * 拒删的错误形状：稳定码 + 那一次判定的投影。
 * `main()` 把它挂到信封顶层（`delete_gate`，与 `ok:false` 并排）—— 拒删不许只有 stderr 一行。
 * 调用方（块里的 `assertDeletableTarget()`）永远把 `gate` 递进来，所以这里不再自己算一份。
 */
function refuseDelete({ code, message, gate }) {
  const err = new Error(message)
  err.name = 'CliGuardError'
  err.code = code
  err.delete_gate = gate
  return err
}

// @inline-begin 公共 helper 正文（install/rollback 共用的 8 个；发布时逐字内联进出厂件，边界由这一对标记定）
export function assertDeletableTarget(rawTarget, options) {
  const v = deletableVerdict(rawTarget, options)
  if (!v.ok) throw refuseDelete({ code: v.code, message: v.message, gate: v.delete_gate })
  return v
}

export function defaultBackupRoot(liveRoot) {
  const slug = slugOf(liveRoot)
  const scene = insideTestScene(liveRoot)
  if (scene !== null) return path.join(scene, '.agenia-install-backup', slug)
  return path.join(REPO, '.tools', '_backup', 'agenia-install', slug)
}

export function driveOf(p) {
  const m = /^([A-Za-z]):/.exec(String(p ?? ''))
  return m ? m[1].toUpperCase() : null
}

export function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
}

export function isUnder(child, parent) {
  const c = normKey(child)
  const p = normKey(parent)
  return c === p || c.startsWith(`${p}/`)
}

export function normKey(p) {
  let s = canonical(p).replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s.toLowerCase()
}

export function pathVerdict(raw, label, { allowProtected = false } = {}) {
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

export function slugOf(p) {
  return canonical(p).replace(/^[A-Za-z]:/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
}
// @inline-end 公共 helper 正文（这一行与上面那条 begin 标记成对；缺一条 ⇒ 发布拒跑）
