/**
 * 测试根守卫 —— E 盘 / marker / 拒真实根 / 拒 C 盘 / RUN_ID 目录 / TEMP·TMP 显式。
 *
 * 冻结依据：接口冻结提案 v1 §B1.1 / §B1.2 / §B1.7（组长拍板 v1 采纳为执行一实现合同）。
 *
 * 三条纪律（写在这里，免得后来的人靠猜）：
 *   1. **被测对象永远是 staging**（`AGENIA_STAGING_PRESET`）。活体 `presets/agenia/**`
 *      只当"没被碰过"的见证 —— 本模块只对它做**只读哈希**，从不把它当靶子。
 *   2. **任何一次运行都在自己的 RUN_ID 目录里**，退出前不许复用（契约 §2.3）。
 *   3. **子进程的 TEMP/TMP 必须显式指到 E 盘** —— 默认 `%TEMP%` 在 C 盘，
 *      这是全组最容易漏的一处（2026-10-11 全组往 C 盘塞了 39.6 GB）。
 *
 * 判定的**顺序**是冻结的（提案 §B1.7 第 3 条）：同一输入每次必须得到同一个 code。
 */
import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** 仓库根 —— 本机固定值（同 `.git/hooks/post-commit` 里那只 node 的口径）。 */
export const REPO_ROOT = 'E:\\Harness'

/** 真实脑根（**任何测试都不许写**；当前不存在）。 */
export const REAL_BRAIN_ROOT = 'E:\\Harness\\presets\\agenia\\.runtime'

/** 真实路线根（**任何测试都不许写**；当前不存在）。 */
export const REAL_ROUTE_ROOT = 'E:\\Harness\\.team\\route'

/** 活体预设根 —— 只作"没被碰过"的见证，不许当被测对象。 */
export const REAL_PRESET_ROOT = 'E:\\Harness\\presets\\agenia'

/** 运行根 marker 的文件名（提案 §B1.7）。 */
export const TEST_ROOT_MARKER = '.agenia-test-root'

/** 运行根必须落在这个父目录之下。 */
export const RUNS_PARENT = 'E:\\Harness\\.team\\test'

/** 真实根名单（`dataRootVerdict` 与本模块共用同一份语义）。 */
export const REAL_ROOTS = [REAL_BRAIN_ROOT, REAL_ROUTE_ROOT]

export class RootGuardError extends Error {
  constructor(code, failures, readings) {
    const lines = failures.map((f) => `  · [${f.code}] ${f.detail}`)
    super(`${code}: 测试根守卫不通过（${failures.length} 项）\n${lines.join('\n')}`)
    this.name = 'RootGuardError'
    this.code = code
    this.failures = failures
    this.readings = readings
  }
}

/** 盘符（`C:` / `E:` …）；不认识的形状返回 null。 */
export function driveOf(p) {
  const m = /^([A-Za-z]):/.exec(String(p ?? ''))
  return m ? `${m[1].toUpperCase()}:` : null
}

/** UNC（`\\server\share`）。 */
export function isUnc(p) {
  return /^\\\\/.test(String(p ?? '')) || /^\/\//.test(String(p ?? ''))
}

/** 绝对路径判定：`E:\…`、`C:/…`、UNC 都算绝对；`foo\bar`、`.\foo`、`..\foo` 不算。 */
export function isAbsoluteish(p) {
  const s = String(p ?? '')
  if (isUnc(s)) return true
  return /^[A-Za-z]:[\\/]/.test(s)
}

/**
 * canonical 解析 —— **只看字符串会被 `.team/review/../../x.txt` 穿过去**（AGENTS.md 3e）。
 * 所以：先 `path.resolve`（吃掉 `..` 与 `.`），存在则再 `realpathSync`（吃掉 junction/symlink）。
 */
export function canonical(p) {
  const resolved = path.resolve(String(p))
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

/** 规范化成"可比较"的形状：canonical + 小写 + 正斜杠 + 去尾斜杠。 */
export function normKey(p) {
  let s = canonical(p).replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s.toLowerCase()
}

/** child 是否落在 parent 之下（含相等）。 */
export function isUnder(child, parent) {
  const c = normKey(child)
  const p = normKey(parent)
  return c === p || c.startsWith(`${p}/`)
}

/**
 * 根判定 —— 顺序冻结（提案 §B1.7 第 3 条）：
 *   MISSING → RELATIVE → UNC → C_DRIVE → REAL_BRAIN → NO_MARKER（仅测试模式）→ OUTSIDE
 * 纯函数：不摸盘，盘上的事实（markerExists）由调用方给。
 */
export function rootVerdict(rawRoot, { testMode, markerExists, mustBeUnder, realRoots = REAL_ROOTS } = {}) {
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
  const canonicalRoot = canonical(raw)
  if (driveOf(canonicalRoot) === 'C:') {
    return { ok: false, code: 'E_ROOT_C_DRIVE', message: `根路径不许在 C 盘：${canonicalRoot}` }
  }
  for (const real of realRoots) {
    if (isUnder(canonicalRoot, real)) {
      return { ok: false, code: 'E_ROOT_REAL_BRAIN', message: `根路径落在真实根里：${canonicalRoot} ⊆ ${real}` }
    }
    if (isUnder(real, canonicalRoot)) {
      return { ok: false, code: 'E_ROOT_REAL_BRAIN', message: `根路径包住了真实根：${canonicalRoot} ⊇ ${real}` }
    }
  }
  if (testMode && markerExists !== true) {
    return { ok: false, code: 'E_ROOT_NO_MARKER', message: `测试模式的根必须带 ${TEST_ROOT_MARKER}：${canonicalRoot}` }
  }
  if (mustBeUnder && !isUnder(canonicalRoot, mustBeUnder)) {
    return { ok: false, code: 'E_ROOT_OUTSIDE', message: `根路径越界（要求落在 ${mustBeUnder} 之下）：${canonicalRoot}` }
  }
  return { ok: true, code: null, root: canonicalRoot, message: '' }
}

/** 测试模式判定（提案 §B1.7）：显式 `--test-mode` **或** `AGENIA_TEST_RUN_ROOT` 存在。 */
export function testModeOf(config = {}, env = process.env) {
  return config.testMode === true || Boolean(env.AGENIA_TEST_RUN_ROOT)
}

function hasMarker(dir) {
  try {
    return statSync(path.join(dir, TEST_ROOT_MARKER)).isFile()
  } catch {
    return false
  }
}

/** 运行根名下那个 marker 的内容（可复现：谁建的、什么时候、什么 schema）。 */
export function markerPayload(runId, kind = 'agenia-test-run') {
  return {
    kind,
    run_id: runId,
    created_at: new Date().toISOString(),
    schema: 1,
  }
}

/**
 * 建一个带 marker 的目录 —— 只允许建在运行根之下。
 * 越界（C 盘 / 真实根 / 运行根之外）直接抛，不"先建了再说"。
 */
export function ensureMarkedDir(dir, { runRoot, runId, kind = 'agenia-test-root' } = {}) {
  if (runRoot === undefined) throw new RootGuardError('ROOT-GUARD-USAGE', [{ code: 'E_ARG_USAGE', detail: 'ensureMarkedDir 必须带 runRoot' }], {})
  const target = canonical(dir)
  if (!isUnder(target, runRoot)) {
    throw new RootGuardError('ROOT-GUARD-REFUSED', [{ code: 'E_ROOT_OUTSIDE', detail: `拒绝在运行根之外建目录：${target}` }], { runRoot: canonical(runRoot) })
  }
  const v = rootVerdict(target, { testMode: true, markerExists: true })
  if (!v.ok) throw new RootGuardError('ROOT-GUARD-REFUSED', [{ code: v.code, detail: v.message }], {})
  mkdirSync(target, { recursive: true })
  const marker = path.join(target, TEST_ROOT_MARKER)
  if (!existsSync(marker)) writeFileSync(marker, `${JSON.stringify(markerPayload(runId, kind), null, 2)}\n`, 'utf8')
  return target
}

/**
 * 运行根守卫 —— 开盘前必须过（契约 §6.0 PC 预检 / §9.5）。
 * 一次把所有问题收齐（不是撞到第一个就退出），这样红基线能一眼看出"环境坏了"还是"被测对象没实现"。
 */
export function guardVerdict(env = process.env, { now = new Date() } = {}) {
  const failures = []
  const readings = { checked_at: now.toISOString(), cwd: canonical(process.cwd()), env: {} }

  const runRootRaw = env.AGENIA_TEST_RUN_ROOT
  readings.env.AGENIA_TEST_RUN_ROOT = runRootRaw ?? null
  const runVerdict = rootVerdict(runRootRaw, { testMode: true, markerExists: runRootRaw ? hasMarker(canonical(runRootRaw)) : false })
  if (!runVerdict.ok) {
    failures.push({ code: runVerdict.code, detail: `AGENIA_TEST_RUN_ROOT：${runVerdict.message}` })
  } else {
    const runRoot = runVerdict.root
    readings.run_root = runRoot
    readings.run_id = path.basename(runRoot)
    if (!isUnder(runRoot, RUNS_PARENT)) {
      failures.push({ code: 'E_ROOT_OUTSIDE', detail: `运行根必须落在 ${RUNS_PARENT}\\<日期>\\_runs\\<RUN_ID>\\ 之下：${runRoot}` })
    } else if (!/[\\/]_runs[\\/]/.test(runRoot)) {
      failures.push({ code: 'E_ROOT_OUTSIDE', detail: `运行根必须落在 _runs\\<RUN_ID>\\ 这一层：${runRoot}` })
    }
    if (!/^[A-Za-z0-9._-]+$/.test(readings.run_id ?? '')) {
      failures.push({ code: 'E_ARG_USAGE', detail: `RUN_ID 形状不合法（只允许 [A-Za-z0-9._-]）：${readings.run_id}` })
    }
    if (!existsSync(runRoot)) {
      failures.push({ code: 'E_ROOT_MISSING', detail: `运行根不存在：${runRoot}` })
    }
    if (isUnder(runRoot, REAL_PRESET_ROOT)) {
      failures.push({ code: 'E_ROOT_REAL_BRAIN', detail: `运行根不许落在活体预设里：${runRoot}` })
    }
  }

  // TEMP / TMP 显式指到 E 盘（最容易漏的一处）
  for (const key of ['TEMP', 'TMP']) {
    const raw = env[key]
    readings.env[key] = raw ?? null
    if (raw === undefined || String(raw).trim() === '') {
      failures.push({ code: 'E_ENV_TEMP_MISSING', detail: `${key} 未显式设置 —— 默认真实临时目录在 C 盘，必须先指到 E 盘` })
      continue
    }
    if (!isAbsoluteish(raw)) {
      failures.push({ code: 'E_ENV_TEMP_RELATIVE', detail: `${key} 必须是绝对路径：${raw}` })
      continue
    }
    const canon = canonical(raw)
    if (isUnc(raw)) failures.push({ code: 'E_ENV_TEMP_UNC', detail: `${key} 不许是 UNC：${raw}` })
    else if (driveOf(canon) !== 'E:') failures.push({ code: 'E_ENV_TEMP_C_DRIVE', detail: `${key} 必须在 E 盘：${canon}` })
    readings.env[`${key}_canonical`] = canon
  }

  // 测试数据根 / 工作区：必须在运行根之下、带 marker
  for (const [key, code] of [['AGENIA_TEST_DATA_ROOT', 'E_ROOT_OUTSIDE'], ['AGENIA_TEST_WORKSPACE', 'E_ROOT_OUTSIDE']]) {
    const raw = env[key]
    readings.env[key] = raw ?? null
    if (raw === undefined || String(raw).trim() === '') {
      failures.push({ code: 'E_ROOT_MISSING', detail: `${key} 未设置（拒绝开工）` })
      continue
    }
    const v = rootVerdict(raw, { testMode: true, markerExists: hasMarker(canonical(raw)), mustBeUnder: readings.run_root ?? RUNS_PARENT })
    if (!v.ok) failures.push({ code: v.code === 'E_ROOT_OUTSIDE' ? code : v.code, detail: `${key}：${v.message}` })
    else readings.env[`${key}_canonical`] = v.root
  }

  // staging 预设：必须显式给、必须绝对、**不许指着活体**（缺文件是预期的红，不在这里拦）
  const stagingRaw = env.AGENIA_STAGING_PRESET
  readings.env.AGENIA_STAGING_PRESET = stagingRaw ?? null
  if (stagingRaw === undefined || String(stagingRaw).trim() === '') {
    failures.push({ code: 'E_ROOT_MISSING', detail: 'AGENIA_STAGING_PRESET 未设置（拒绝开工）' })
  } else if (!isAbsoluteish(stagingRaw)) {
    failures.push({ code: 'E_ROOT_RELATIVE', detail: `AGENIA_STAGING_PRESET 必须是绝对路径：${stagingRaw}` })
  } else {
    const staging = canonical(stagingRaw)
    readings.staging_preset = staging
    if (isUnder(staging, REAL_PRESET_ROOT)) {
      failures.push({ code: 'E_ROOT_REAL_BRAIN', detail: `被测对象不许是活体预设：${staging}` })
    }
    readings.staging_exists = existsSync(staging)
  }

  // 状态根：给了就必须在运行根里（路线票/报告只许落测试工作区）
  // ⚠️ 这一层的 marker 判据与前两层不同：冻结的三层 marker 是
  //    `_runs\<RUN_ID>\` / `brain-root\` / `workspace\`；`AGENIA_STATUS_ROOT` 的默认值
  //    `$WS\.team` 住在**已带 marker 的 workspace 之下** ⇒ 要求它自己也带 marker 会误拦。
  //    这里真正要守的不变量只有一个：**别跑出运行根**。
  const statusRaw = env.AGENIA_STATUS_ROOT
  readings.env.AGENIA_STATUS_ROOT = statusRaw ?? null
  if (statusRaw !== undefined && String(statusRaw).trim() !== '') {
    const v = rootVerdict(statusRaw, { testMode: false, mustBeUnder: readings.run_root ?? RUNS_PARENT })
    if (!v.ok) failures.push({ code: v.code, detail: `AGENIA_STATUS_ROOT：${v.message}` })
    else readings.status_root = v.root
  }

  readings.real_brain_root = REAL_BRAIN_ROOT
  readings.real_brain_exists = existsSync(REAL_BRAIN_ROOT)
  readings.real_route_root = REAL_ROUTE_ROOT
  readings.real_route_exists = existsSync(REAL_ROUTE_ROOT)

  return { ok: failures.length === 0, failures, readings }
}

/** 守卫不过 ⇒ 抛（非 0 退出由 `enforceOrExit` 那一路负责）。 */
export function assertRunGuard(env = process.env) {
  const v = guardVerdict(env)
  if (!v.ok) throw new RootGuardError('ROOT-GUARD-FAILED', v.failures, v.readings)
  return v.readings
}

/** 独立进程入口：不满足就**拒绝开工**（非 0 退出），不是继续跑完再当绿。 */
export function enforceOrExit(env = process.env) {
  const v = guardVerdict(env)
  if (!v.ok) {
    for (const f of v.failures) console.error(`[root-guard] RED  ${f.code}  ${f.detail}`)
    console.error(`[root-guard] 拒绝开工（${v.failures.length} 项不满足）`)
    process.exit(2)
  }
  return v.readings
}

/**
 * 删除前置校验（契约 §2.5）：解析绝对路径 → 校验带 marker → 校验在 RUN_ID 之下
 * → 拒绝真实根 / C 盘 → 才允许删**这一个**目录。禁止通配符、禁止递归删 `.team/test`、禁止删 `_evidence`。
 */
export function assertDeletable(target, { runRoot } = {}) {
  const failures = []
  const canon = canonical(target)
  if (runRoot === undefined) failures.push({ code: 'E_ARG_USAGE', detail: 'assertDeletable 必须带 runRoot' })
  else if (!isUnder(canon, runRoot)) failures.push({ code: 'E_ROOT_OUTSIDE', detail: `拒绝删除运行根之外的路径：${canon}` })
  if (!hasMarker(canon)) failures.push({ code: 'E_ROOT_NO_MARKER', detail: `拒绝删除不带 ${TEST_ROOT_MARKER} 的目录：${canon}` })
  if (driveOf(canon) === 'C:') failures.push({ code: 'E_ROOT_C_DRIVE', detail: `拒绝删除 C 盘路径：${canon}` })
  for (const real of REAL_ROOTS) {
    if (isUnder(canon, real)) failures.push({ code: 'E_ROOT_REAL_BRAIN', detail: `拒绝删除真实根：${canon} ⊆ ${real}` })
  }
  if (normKey(canon) === normKey(RUNS_PARENT) || /[\\/]_evidence([\\/]|$)/.test(canon)) {
    failures.push({ code: 'E_ROOT_OUTSIDE', detail: `禁止删 _evidence 或 .team/test 本身：${canon}` })
  }
  if (failures.length > 0) throw new RootGuardError('ROOT-GUARD-REFUSED-DELETE', failures, { target: canon })
  return canon
}
