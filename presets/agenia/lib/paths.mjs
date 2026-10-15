/**
 * 路径与隔离 —— data-root 判定、基准目录内的解析、测试模式判定。
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
 * ⚠️ 本轮**不新增**退出码：所以这里**没有**"必须在 E 盘"这一条判据 —— E 盘只落在常量上
 *    （真实根、staging、运行根都在 E 盘）。C 盘拒绝是提案 §B1.7 明列的 `E_ROOT_C_DRIVE`。
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
