/**
 * 路径与隔离 —— data-root 判定、**init-real / --real-mode 两道专用闸**、**工作区+落点判定**
 * （`workspaceWriteVerdict`，只给"写面是工作区里一格窄目录"的 op 用）、基准目录内的解析、测试模式判定。
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
 * ⚠️ 本文件**不新增**退出码：所以这里**没有**"必须在 E 盘"这一条判据。C 盘拒绝是提案 §B1.7
 *    明列的 `E_ROOT_C_DRIVE`（它管的是**调用方给的根**，不是本文件里的常量）。
 *    🔴 2026-10-15 起本文件**一条绝对路径都没有**：两个真实根是算出来的（怎么算见下），
 *    不再假设"装在 E 盘" —— 换机器 / 换安装目录之后，"真实根"照样指向装好之后那一份。
 *
 * 🔴 **`dataRootVerdict` 的 `REAL_ROOTS` 无条件拒，一个字都不许改。** 它挡的是"日常工具误写真实库"。
 *    落到真实库一共**两条**窄路，都单独住在本文件下半、都不改那张表：
 *      · `realInitVerdict` ⇒ `--op init-real`：**一次性**开库（还要求根必须不存在）；
 *      · `realModeVerdict` ⇒ `--real-mode`：日常 op 落真实库（**必须显式给开关**，且与测试模式互斥）。
 *    刻意不合并进 `dataRootVerdict` —— 合并等于在那张防误写的表上开条件分支，
 *    它会立刻不再是"无条件"。
 *
 * 🔴 **第三条路也不是"开的后门"，是另一条判据（2026-10-15 组长裁）**：
 *    `workspaceWriteVerdict` ⇒ `--op session-packet`。它**不用** `REAL_ROOTS` 那张表，也**没碰**
 *    `dataRootVerdict` 一分一毫：那条判的是"这个**根**危险吗"（两个方向都拒），这条判的是
 *    "这个**落点**危险吗"（只拒"落在真实根里"）。两者管的是两种写面，别拿一条去套另一条 ——
 *    详见那个函数自己的注释（"工作区包住真实库是设计如此，拿它判工作区＝永远自拒"）。
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── 两个"真实根"是**怎么算出来的**（本文件里一条绝对路径都不写）───────────────────────
//
// 🔴 它们不是配置，是 `dataRootVerdict` 的**判据常量**（那张默认拒绝名单的靶子）。
//    写成本机字面量的话，换台机器 / 换个安装目录 ⇒ 靶子指向一个不存在的路径 ⇒
//    "日常工具不许写真实库"当场**失败开（fail-open）**，而测试会全绿、看不出差别
//    （2026-10-15 技术评审 F4，P1）。
//
// ① **脑根 = `<预设目录>/.runtime`** —— 预设目录由**本文件自己的位置**推（`import.meta.url`）。
//    于是它天然跟着预设走：整个 `presets/agenia` 拷到哪儿（另一台机器、另一个安装目录、
//    演练用的假预设），它指的就是那儿的 `.runtime`。⇒ 那道闸永远认得自己的靶子。
//
// ② **路线根 = `<工作区>/.team/route`** —— 工作区是**运行时**才知道的，从预设目录推不出来。
//    规则的**唯一一份**住在下面那个 `realRouteRootOf()`；它取哪个工作区，按序：
//      · 调用方**显式**给了（`--workspace` / `payload.workspace`）⇒ 就用它
//        （`bin/agenia-brain.mjs` 把工作区喂进 `dataRootVerdict` 的 `realRoots`，走的就是这条）；
//      · 没给 ⇒ `process.cwd()`（**跑这个命令时站在哪个工作区里，那就是这个工作区**）。
//    ⚠️ 兜底**绝不退回"本文件写死的那一条"**：那只是把 fail-open 换个名字。
//    ⇒ 同一份代码在另一台机器、另一个工作区跑，指到的一定是对的那个 `.team/route`。

/** 预设目录：本文件住在 `<预设目录>/lib/paths.mjs` ⇒ 往上两层就是它。 */
export const PRESET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 真实脑根 = `<预设目录>/.runtime`（**任何测试/演练都不许写**）。 */
export const REAL_BRAIN_ROOT = path.join(PRESET_DIR, '.runtime')

/**
 * 工作区 → 真实路线根（`<工作区>/.team/route`）—— **这条规则只有这一份**。
 *
 * 工作区缺省（`undefined` / `null` / 空串）⇒ `process.cwd()`：跑命令时站的那个工作区。
 * ⚠️ 不 canonical、不 realpath：这张表是要被 `isUnder()` 比的，而 `isUnder` 自己会 canonical
 *    （见下面 `canonicalPath` —— 两份口径，但只有一处说"要不要 realpath"）。
 */
export function realRouteRootOf(workspace) {
  const raw = typeof workspace === 'string' ? workspace.trim() : ''
  const base = raw === '' ? path.resolve(process.cwd()) : path.resolve(raw)
  return path.join(base, '.team', 'route')
}

/** 真实根名单（给**某一个**工作区）：顺序冻结 = 先脑根、后路线根。 */
export function realRootsFor(workspace) {
  return [REAL_BRAIN_ROOT, realRouteRootOf(workspace)]
}

/**
 * 真实路线根 —— **缺省工作区那一档**（`cwd`）。
 * 调用方没显式说工作区时，看到的就是它；显式说了，就该用 `realRouteRootOf(<那个工作区>)`。
 */
export const REAL_ROUTE_ROOT = realRouteRootOf()

/** 测试根标记文件名（提案 §B1.7 的三层 marker 用它）。 */
export const TEST_ROOT_MARKER = '.agenia-test-root'

/**
 * 真实根名单（`dataRootVerdict` 的默认拒绝集）—— 缺省工作区（`cwd`）算出来的那一份。
 *
 * 🔴 **依旧是"无条件拒"**：这张表的语义一个字没动（落进这两条里、或包住这两条，一律拒），
 *    变的只是**靶子怎么算出来**。调用方要换工作区，就把 `realRoots: realRootsFor(ws)` 传进去。
 */
const REAL_ROOTS = Object.freeze(realRootsFor())

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
 * @param {boolean} [options.containingRule] 「包住真实根」那半条判不判（默认 `true` = 照旧判）。
 *   🔴 只有**工作区**那一档会传 `false` —— 来历见下面判定处那段注释。
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
    containingRule = true,
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
  // 🔴 下面这两条**不是一回事，别一起拆**：
  //   · `root ⊆ real`（**落在**真实根里）—— **无条件拒**。有意义的防线：根不许就是库本身、或库的子目录。
  //   · `root ⊇ real`（**包住**真实根）—— 默认也拒，但 `containingRule: false` 关得掉。
  //     为什么**工作区**那一档必须关掉它：工作区**一定包住它自己的** `<ws>/.team/route`，
  //     拿"包住"去判它 ⇒ **恒自拒**（本函数与 `agenia-brain.mjs` 的注释都早写着这句话，只是没人去修）。
  //     而库固定住在**预设目录**底下（`<预设目录>/.runtime`）⇒ 拿开发仓库当工作区时（`E:\Harness`），
  //     `daily-start` / `health-read` 恒拒 `E_ROOT_REAL_BRAIN`（2026-10-16 现场撞到 · 艾芙琳报的）。
  //   ⚠️ `--data-root` 那一档**照旧**用默认值（`true`）—— 那道反面对照不许退化。
  for (const real of realRoots ?? []) {
    if (isUnder(root, real)) {
      return { ok: false, code: 'E_ROOT_REAL_BRAIN', message: `根路径落在真实根里：${root} ⊆ ${canonicalPath(real)}` }
    }
    if (containingRule && isUnder(real, root)) {
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
 * **工作区 + 落点** 两件套判据 —— 只给"写面是工作区里**一格窄目录**"的 op 用（目前只有
 * `bin/agenia-brain.mjs --op session-packet`）。判的是「**我会写到哪里**」，不是「我在哪儿开工」。
 *
 * 🔴 **为什么它和 `dataRootVerdict` 不是同一条判据（2026-10-15 组长裁）**：
 *   · `--data-root` 要写的是**整个根** ⇒ "落进真实根"和"**包住**真实根"都危险（后者一把 init
 *     就可能把里面的真实库一起端掉）⇒ 那张表两个方向都拒，**语义一个字不许改**；
 *   · 工作区的写面是 `<工作区>\.team\retro\<day>\conversation-packet\` 这一格 ⇒
 *     "工作区包住真实库"**是设计如此**（真实库就住在工作区里面！）—— 拿"包住"去判工作区，
 *     等于判"工作区不许包住自己的东西"，**永远自拒，那不是保护**。
 *   ⇒ 所以这条判据只判一件事：**落点**（`target`）不许落在任何真实根里（含与真实根相等）。
 *     反方向（落点**包住**真实根）刻意**不判**：落点是个叶子目录，包住只是路径巧合；
 *     往里写一个字节都碰不到那个真实根（要动真实根得走 `init-real` / `--real-mode` 两条窄路）。
 *
 * 判定顺序（冻结，同一输入每次同一个码）：
 *   MISSING → RELATIVE → UNC → C_DRIVE → **落点在真实根里** → NO_MARKER（仅测试模式）→ OUTSIDE（仅测试模式）。
 *   ⚠️ 前四条判**工作区**的形状（与 `dataRootVerdict` 同一套说法、同一套码）；第五条判**落点**。
 *   ⚠️ marker / 越界两格判的还是**工作区**（测试模式的根必须带 `.agenia-test-root`、必须落在运行根之下）——
 *      那是 data-root 与 workspace 两档共有的一条，本判据不另立一份。
 *
 * @param {string|undefined|null} rawWorkspace 调用方给的工作区（`payload.workspace` / `--workspace`）
 * @param {object} [options]
 * @param {string} [options.relPath]        **相对工作区**的落点（例 `.team\retro\2026-10-15\conversation-packet`）
 * @param {boolean} [options.testMode]      测试模式（只看 NO_MARKER / OUTSIDE 两格）
 * @param {boolean} [options.markerExists]  盘上工作区里有没有 `.agenia-test-root`（由调用方探）
 * @param {string|null} [options.mustBeUnder] 越界判据（测试模式下 = `AGENIA_TEST_RUN_ROOT`）
 * @param {string[]} [options.realRoots]    真实根名单（默认脑根 + **默认工作区**的路线根；
 *                                          调用方该喂 `realRootsFor(<这个工作区>)`）
 * @param {(p:string)=>string|null} [options.driveOf] 盘符函数（默认本文件那份）
 * @returns {{ok:true,code:null,workspace:string,target:string,message:string}
 *          |{ok:false,code:string,workspace:string|null,target:string|null,message:string}}
 */
export function workspaceWriteVerdict(rawWorkspace, options = {}) {
  const {
    relPath = '',
    testMode = false,
    markerExists = false,
    mustBeUnder = null,
    realRoots = REAL_ROOTS,
    driveOf = driveOfPath,
  } = options ?? {}

  const fail = (code, message, workspace = null, target = null) => ({ ok: false, code, workspace, target, message })

  // ① 工作区的形状：缺 / 相对 / UNC —— 与 data-root 同一套说法（同一件事只有一处说法）
  if (rawWorkspace === undefined || rawWorkspace === null || String(rawWorkspace).trim() === '') {
    return fail('E_ROOT_MISSING', '工作区路径缺失（省略 / 空串都算缺失）')
  }
  const raw = String(rawWorkspace)
  if (!isAbsoluteish(raw)) return fail('E_ROOT_RELATIVE', `工作区必须是绝对路径：${raw}`)
  if (isUnc(raw)) return fail('E_ROOT_UNC', `工作区不许是 UNC：${raw}`)

  const workspace = canonicalPath(raw)
  if (driveOf(workspace) === 'C:') return fail('E_ROOT_C_DRIVE', `工作区不许在 C 盘：${workspace}`)

  // ② 落点 = 工作区 + relPath（relPath 只许是相对路径，且必须落回工作区里）
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    return fail('E_ARG_SCHEMA', 'relPath 必填（相对工作区的落点）', workspace)
  }
  if (path.isAbsolute(relPath)) {
    return fail('E_ARG_SCHEMA', `relPath 只许是相对工作区的那一段，实得绝对路径：${relPath}`, workspace)
  }
  const target = path.resolve(workspace, relPath)
  if (!isUnder(target, workspace)) {
    return fail('E_ROOT_OUTSIDE', `落点跑出了工作区（${relPath}）：${target} ⊄ ${workspace}`, workspace, target)
  }

  // ③ 🔴 **本判据的正题**：落点不许落在任何真实根里（含与真实根逐字相等）
  for (const real of realRoots ?? []) {
    if (isUnder(target, real)) {
      return fail('E_ROOT_REAL_BRAIN', `包落点落在真实根里：${target} ⊆ ${canonicalPath(real)}`, workspace, target)
    }
  }

  // ④ 测试模式的两格：marker 在不在 / 落点是不是跑出了运行根（判的都是工作区）
  if (testMode && markerExists !== true) {
    return fail('E_ROOT_NO_MARKER', `测试模式的工作区必须带 ${TEST_ROOT_MARKER}：${workspace}`, workspace, target)
  }
  if (mustBeUnder && !isUnder(workspace, mustBeUnder)) {
    return fail('E_ROOT_OUTSIDE', `工作区越界（要求落在 ${canonicalPath(mustBeUnder)} 之下）：${workspace}`, workspace, target)
  }

  return { ok: true, code: null, workspace, target, message: '' }
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
