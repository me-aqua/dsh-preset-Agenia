/**
 * 路径与隔离 —— data-root 判定、**init-real / --real-mode 两道专用闸**、基准目录内的解析、测试模式判定。
 *
 * 冻结依据：提案 §B1.5（签名）+ §B1.7（判定**顺序**与 canonical 解析）+ 契约 §2.4（data-root 硬规则）。
 *
 * 三条纪律：
 *   ① **判定顺序冻结**（同一输入每次同一个码）：
 *      MISSING → RELATIVE → UNC → C_DRIVE → REAL_BRAIN → NO_MARKER（仅测试模式）→ OUTSIDE
 *   ② **先 canonical 再判**（`AGENTS.md` 3e 的教训：只匹配字符串会被 `..\..\x` 穿过去）。
 *      盘上存在的走 `realpath`（连 junction/symlink 一起吃掉）；不存在的退回 `resolve`。
 *   ③ **纯函数、不摸盘**：marker 在不在由调用方给（`markerExists`），盘符怎么算可以注入（`driveOf`）。
 *
 * ⚠️ 本文件**不新增**退出码：所以这里**没有**"必须在 E 盘"这一条判据 —— E 盘只落在常量上
 *    （真实根、staging、运行根都在 E 盘）。C 盘拒绝是提案 §B1.7 明列的 `E_ROOT_C_DRIVE`。
 *
 * 🔴 **`dataRootVerdict` 的 `REAL_ROOTS` 无条件拒，一个字都不许改。** 它挡的是"日常工具误写真实库"。
 *    落到真实库一共**两条**窄路，都单独住在本文件下半、都不改那张表：
 *      · `realInitVerdict` ⇒ `--op init-real`：**一次性**开库（还要求根必须不存在）；
 *      · `realModeVerdict` ⇒ `--real-mode`：日常 op 落真实库（**必须显式给开关**，且与测试模式互斥）。
 *    刻意不合并进 `dataRootVerdict` —— 合并等于在那张防误写的表上开条件分支，
 *    它会立刻不再是"无条件"。
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'

/** 真实脑根（**任何测试/演练都不许写**；当前在盘上不存在）。 */
export const REAL_BRAIN_ROOT = 'E:\\Harness\\presets\\agenia\\.runtime'

/** 真实路线根（**任何测试/演练都不许写**；当前在盘上不存在）。 */
export const REAL_ROUTE_ROOT = 'E:\\Harness\\.team\\route'

/** 测试根标记文件名（提案 §B1.7 的三层 marker 用它）。 */
export const TEST_ROOT_MARKER = '.agenia-test-root'

/** 真实根名单（`dataRootVerdict` 的默认拒绝集）。 */
const REAL_ROOTS = [REAL_BRAIN_ROOT, REAL_ROUTE_ROOT]

/** 盘符（`C:` / `E:`…）；不认识 ⇒ null。 */
function driveOfPath(p) {
  const m = /^([A-Za-z]):/.exec(String(p ?? ''))
  return m ? `${m[1].toUpperCase()}:` : null
}

/** UNC（`\\server\share` 或 `//server/share`）。 */
function isUnc(p) {
  const s = String(p ?? '')
  return /^\\\\/.test(s) || /^\/\//.test(s)
}

/** 绝对路径的形状：`E:\…` / `C:/…` / UNC 都算；`foo\bar`、`.\foo`、`..\foo` 不算。 */
function isAbsoluteish(p) {
  const s = String(p ?? '')
  if (isUnc(s)) return true
  return /^[A-Za-z]:[\\/]/.test(s)
}

/** canonical：先 `resolve`（吃掉 `..` 与 `.`），存在则再 `realpath`（吃掉 junction/symlink）。 */
function canonicalPath(p) {
  const resolved = path.resolve(String(p))
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

/** 可比较形状：canonical + 正斜杠 + 去尾斜杠 + 小写。 */
function normKey(p) {
  let s = canonicalPath(p).replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s.toLowerCase()
}

/** `child` 是否落在 `parent` 之下（含相等）。 */
function isUnder(child, parent) {
  const c = normKey(child)
  const p = normKey(parent)
  return c === p || c.startsWith(`${p}/`)
}

/**
 * data-root 判定（纯函数）。
 *
 * @param {string|undefined|null} rawRoot 调用方给的根（`--data-root`）
 * @param {object} [options]
 * @param {boolean} [options.testMode]     测试模式（判定 NO_MARKER 只看它）
 * @param {boolean} [options.markerExists] 盘上有没有 `.agenia-test-root`（由调用方探）
 * @param {string[]} [options.realRoots]   真实根名单（默认脑根 + 路线根）
 * @param {(p:string)=>string|null} [options.driveOf] 盘符函数（默认本文件那份）
 * @param {string|null} [options.mustBeUnder] 越界判据（给了才可能出 `E_ROOT_OUTSIDE`）
 * @returns {{ok:true,code:null,root:string,message:string}|{ok:false,code:string,message:string}}
 */
export function dataRootVerdict(rawRoot, options = {}) {
  const {
    testMode = false,
    markerExists = false,
    realRoots = REAL_ROOTS,
    driveOf = driveOfPath,
    mustBeUnder = null,
  } = options ?? {}

  if (rawRoot === undefined || rawRoot === null || String(rawRoot).trim() === '') {
    return { ok: false, code: 'E_ROOT_MISSING', message: '根路径缺失（省略 / 空串都算缺失）' }
  }
  const raw = String(rawRoot)
  if (!isAbsoluteish(raw)) {
    return { ok: false, code: 'E_ROOT_RELATIVE', message: `根路径必须是绝对路径：${raw}` }
  }
  if (isUnc(raw)) {
    return { ok: false, code: 'E_ROOT_UNC', message: `根路径不许是 UNC：${raw}` }
  }
  const root = canonicalPath(raw)
  if (driveOf(root) === 'C:') {
    return { ok: false, code: 'E_ROOT_C_DRIVE', message: `根路径不许在 C 盘：${root}` }
  }
  for (const real of realRoots ?? []) {
    if (isUnder(root, real)) {
      return { ok: false, code: 'E_ROOT_REAL_BRAIN', message: `根路径落在真实根里：${root} ⊆ ${canonicalPath(real)}` }
    }
    if (isUnder(real, root)) {
      return { ok: false, code: 'E_ROOT_REAL_BRAIN', message: `根路径包住了真实根：${root} ⊇ ${canonicalPath(real)}` }
    }
  }
  if (testMode && markerExists !== true) {
    return { ok: false, code: 'E_ROOT_NO_MARKER', message: `测试模式的根必须带 ${TEST_ROOT_MARKER}：${root}` }
  }
  if (mustBeUnder && !isUnder(root, mustBeUnder)) {
    return { ok: false, code: 'E_ROOT_OUTSIDE', message: `根路径越界（要求落在 ${canonicalPath(mustBeUnder)} 之下）：${root}` }
  }
  return { ok: true, code: null, root, message: '' }
}

// ── `init-real`：开真实库的那一道专用闸（**唯一**能落到 `REAL_BRAIN_ROOT` 的路）──────
/**
 * `init-real` 允许的那**一个**根。它与 `REAL_BRAIN_ROOT` 是同一个常量 ——
 * 这里另起一个名字只是为了在调用点读得出来"这是 init-real 的落点"。
 */
export const REAL_INIT_ROOT = REAL_BRAIN_ROOT

/**
 * `init-real` 的三道硬闸（**纯函数**：`exists` 由调用方探，本函数不摸盘）。
 *
 * 为什么它不放在 `dataRootVerdict` 里：那张表的 `REAL_ROOTS` 无条件拒是**对的**，
 * 它挡的是"日常工具误写真实库"。开库是一次性的、专名的、要人亲手跑的动作 ——
 * 所以给它**自己的**入口，而不是在那张防误写的表上开一个条件分支
 * （开了分支，日常工具就再也算不上"无条件被挡"了）。
 *
 * 判定顺序（冻结，同一输入永远同一个码）：
 *   MISSING → RELATIVE → UNC → C 盘 → **不接受测试模式** → **必须逐字等于真实根** → **必须不存在**。
 *
 * 三道闸逐条对应：
 *   ① `根 === REAL_INIT_ROOT`（归一后比：正/反斜杠、大小写、尾斜杠都不算差异；`..` 先吃掉）。
 *      **是相等，不是"落在里面"** —— 否则 `…\.runtime\sub` 那种更深的名字也能开库。
 *   ② `exists === true` ⇒ 拒（`E_DATA_EXISTS`）。**这就是"一次性"保护**：开过就再也开不了第二次。
 *   ③ C 盘 / 相对 / UNC 照旧拒；并且 `testMode` 与它**互斥**（一起给 ⇒ 拒）。
 *      ⚠️ 最后这一条不是洁癖：`tests/` 的 DR-01 矩阵会拿"真实脑根"这一姿势去跑
 *      **清单里每一个 `writes && needsDataRoot` 的命令**，而那个矩阵**总是带 `--test-mode`**。
 *      所以这条闸就是"测试跑起来也不会真开库"的那一道 —— 少了它，一次测试就会把真实根建出来。
 *
 * @param {string|undefined|null} rawRoot 调用方给的根（`--data-root`）
 * @param {object} [options]
 * @param {boolean} [options.exists]     盘上这个路径**已经存在**吗（由调用方探）
 * @param {boolean} [options.testMode]   是不是测试模式（`--test-mode` 或 `AGENIA_TEST_RUN_ROOT`）
 * @param {string} [options.expectedRoot] 允许的那一个根（默认 `REAL_INIT_ROOT`；只给自证脚本换）
 * @param {(p:string)=>string|null} [options.driveOf] 盘符函数（默认本文件那份）
 * @returns {{ok:true,code:null,root:string,message:string}|{ok:false,code:string,message:string}}
 */
export function realInitVerdict(rawRoot, options = {}) {
  const {
    exists = true,
    testMode = false,
    expectedRoot = REAL_INIT_ROOT,
    driveOf = driveOfPath,
  } = options ?? {}

  // ① 形状：缺 / 相对 / UNC —— 与 data-root 同一套（同一件事只有一处说法）
  if (rawRoot === undefined || rawRoot === null || String(rawRoot).trim() === '') {
    return { ok: false, code: 'E_ROOT_MISSING', message: 'init-real 的根路径缺失（省略 / 空串都算缺失）' }
  }
  const raw = String(rawRoot)
  if (!isAbsoluteish(raw)) {
    return { ok: false, code: 'E_ROOT_RELATIVE', message: `init-real 的根路径必须是绝对路径：${raw}` }
  }
  if (isUnc(raw)) {
    return { ok: false, code: 'E_ROOT_UNC', message: `init-real 的根路径不许是 UNC：${raw}` }
  }

  // ③（先头那半）C 盘：一次都不许
  const root = canonicalPath(raw)
  if (driveOf(root) === 'C:') {
    return { ok: false, code: 'E_ROOT_C_DRIVE', message: `init-real 的根路径不许在 C 盘：${root}` }
  }

  // ③（互斥那半）：测试模式与开真实库是两件事，同时给就是入参不合
  if (testMode === true) {
    return { ok: false, code: 'E_ARG_SCHEMA', message: 'init-real 不接受测试模式（--test-mode / AGENIA_TEST_RUN_ROOT 与它互斥）—— 测试请在 `init` + 测试根上做' }
  }

  // ① 专名：必须**逐字**是那一个根（归一后相等）
  if (normKey(root) !== normKey(expectedRoot)) {
    return { ok: false, code: 'E_ROOT_OUTSIDE', message: `init-real 只认 ${canonicalPath(expectedRoot)} 这一个根，实得 ${root}` }
  }

  // ② 一次性：已经存在 ⇒ 拒（开过就再也开不了第二次）
  if (exists === true) {
    return { ok: false, code: 'E_DATA_EXISTS', message: `init-real 只许在**还不存在**的根上跑：${root} 已经存在（开过就再也开不了第二次）` }
  }

  return { ok: true, code: null, root, message: '' }
}

// ── `--real-mode`：日常 op 落真实库的那道开关（与 `init-real` **并存，不合并**）────────
/**
 * `--real-mode` 的判定（**纯函数**：`exists` 由调用方探，本函数不摸盘）。
 *
 * 为什么它和 `realInitVerdict` 是**两个**函数而不是一个：
 *   `init-real` 比它**更窄** —— 除了"是那个根"，还要求**根必须不存在**（一次性保护）。
 *   把两者合成一个，等于让"日常写"也沾上"专名 + 一次性"那套语义；反过来，
 *   让 `init-real` 复用"日常"那套，则"一次性"这条就没有地方住了。
 *   ⇒ 各管各的，共用同一份 `normKey` / `canonicalPath`（同一件事只有一处说法）。
 *
 * 判定顺序（冻结，同一输入永远同一个码）：
 *   MISSING → RELATIVE → UNC → C 盘 → **与测试模式互斥** → **必须逐字等于真实根**
 *   → **必须显式给了 `--real-mode`**。
 *
 * 三道硬闸：
 *   ① **必须显式给 `--real-mode`** —— 不给（`realMode !== true`）⇒ 真实根照旧 `E_ROOT_REAL_BRAIN`。
 *      ⚠️ 这一条放在**最后**是刻意的：于是"没开开关"永远不会把 C 盘 / 相对 / UNC 那种更具体的问题
 *      盖成一个笼统的 `E_ROOT_REAL_BRAIN`。
 *      ⚠️ 而真正的调用点（`bin/agenia-brain.mjs`）在开关关着时**根本不会调到这里** ——
 *      它直接走老的 `dataRootVerdict`。所以这一条是**纵深防御**：万一有人把线接错，它自己就拒。
 *   ② **`--data-root` 必须逐字等于 `REAL_BRAIN_ROOT`**（归一后相等）。**是相等，不是"落在里面"**：
 *      `…\.runtime\sub`、父目录 `…\presets\agenia` 一律 `E_ROOT_OUTSIDE`。
 *   ③ **与 `--test-mode` 互斥** ⇒ 一起给就是 `E_ARG_SCHEMA`。
 *      🔴 **这一条是命门**：`tests/agenia-upgrade/integration/data-root.test.mjs` 的 DR-01 矩阵
 *      会拿"真实脑根"这一姿势去跑清单里**每一个 `writes && needsDataRoot` 的命令**，
 *      而那个矩阵**总是带 `--test-mode`**（L180）。少了这条互斥闸，一次测试就会往真实库写。
 *
 * ⚠️ `exists` **不参与**本函数的判定（只收着，签名与 `realInitVerdict` 对齐）：
 *    "根必须不存在"是 `init-real` 独有的语义；日常读写当然要发生在**已存在**的库上。
 *
 * @param {string|undefined|null} rawRoot 调用方给的根（`--data-root`）
 * @param {object} [options]
 * @param {boolean} [options.realMode]   调用方是不是显式给了 `--real-mode`
 * @param {boolean} [options.exists]     盘上这个路径**已经存在**吗（**本函数不用**，见上）
 * @param {boolean} [options.testMode]   是不是测试模式（`--test-mode` 或 `AGENIA_TEST_RUN_ROOT`）
 * @param {string} [options.expectedRoot] 允许的那一个根（默认 `REAL_BRAIN_ROOT`；只给自证脚本换）
 * @param {(p:string)=>string|null} [options.driveOf] 盘符函数（默认本文件那份）
 * @returns {{ok:true,code:null,root:string,message:string}|{ok:false,code:string,message:string}}
 */
export function realModeVerdict(rawRoot, options = {}) {
  const {
    realMode = false,
    // eslint-disable-next-line no-unused-vars —— 收着不用是有意的：见上面那条 ⚠️
    exists = true,
    testMode = false,
    expectedRoot = REAL_BRAIN_ROOT,
    driveOf = driveOfPath,
  } = options ?? {}

  // 形状：缺 / 相对 / UNC / C 盘 —— 与 data-root、init-real 同一套
  if (rawRoot === undefined || rawRoot === null || String(rawRoot).trim() === '') {
    return { ok: false, code: 'E_ROOT_MISSING', message: '--real-mode 的根路径缺失（省略 / 空串都算缺失）' }
  }
  const raw = String(rawRoot)
  if (!isAbsoluteish(raw)) {
    return { ok: false, code: 'E_ROOT_RELATIVE', message: `--real-mode 的根路径必须是绝对路径：${raw}` }
  }
  if (isUnc(raw)) {
    return { ok: false, code: 'E_ROOT_UNC', message: `--real-mode 的根路径不许是 UNC：${raw}` }
  }
  const root = canonicalPath(raw)
  if (driveOf(root) === 'C:') {
    return { ok: false, code: 'E_ROOT_C_DRIVE', message: `--real-mode 的根路径不许在 C 盘：${root}` }
  }

  // ③ 命门：与测试模式互斥
  if (testMode === true) {
    return { ok: false, code: 'E_ARG_SCHEMA', message: '--real-mode 不接受测试模式（--test-mode / AGENIA_TEST_RUN_ROOT 与它互斥）—— 测试请走测试根' }
  }

  // ② 专名：必须**逐字**是那一个根（归一后相等）
  if (normKey(root) !== normKey(expectedRoot)) {
    return { ok: false, code: 'E_ROOT_OUTSIDE', message: `--real-mode 只认 ${canonicalPath(expectedRoot)} 这一个根，实得 ${root}` }
  }

  // ① 必须显式给开关（纵深防御：开关关着时自己就拒）
  if (realMode !== true) {
    return { ok: false, code: 'E_ROOT_REAL_BRAIN', message: `没给 --real-mode ⇒ 真实根照旧无条件拒：${root}` }
  }

  return { ok: true, code: null, root, message: '' }
}

/**
 * 把 `target` 解析到 `base` 之下；`..` 穿越 / 绝对逃逸 / 空值一律拒绝。
 *
 * ⚠️ 它只回答"这个落点在不在 base 里面"，**不**负责建目录、也不负责判 marker ——
 * 删除前的 marker 校验是另一条路（契约 §2.5）。
 */
export function resolveWithin(base, target) {
  if (base === undefined || base === null || String(base).trim() === '') {
    return { ok: false, code: 'E_PATH_ESCAPE', message: '基准目录缺失' }
  }
  if (target === undefined || target === null || String(target).trim() === '') {
    return { ok: false, code: 'E_PATH_ESCAPE', message: '目标路径缺失' }
  }
  const baseAbs = canonicalPath(base)
  const abs = canonicalPath(path.resolve(baseAbs, String(target)))
  if (!isUnder(abs, baseAbs)) {
    return { ok: false, code: 'E_PATH_ESCAPE', message: `目标逃出了基准目录：${abs} ⊄ ${baseAbs}` }
  }
  return { ok: true, code: null, path: abs, message: '' }
}

/**
 * 测试模式判定（提案 §B1.7）：显式 `--test-mode` **或** `AGENIA_TEST_RUN_ROOT` 在环境里。
 *
 * ⚠️ 这个 env 读取是**冻结的判定规则本身**，不是"生产路径的 env 兜底" ——
 *    共享写命令的 `--data-root` 必须逐次显式传（DR-01 盯的就是那条）。
 */
export function testModeOf(config = {}, env = process.env) {
  return config?.testMode === true || Boolean(env?.AGENIA_TEST_RUN_ROOT)
}
