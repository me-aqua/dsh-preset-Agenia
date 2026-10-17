/**
 * 证据与结算 —— 每个用例一条 `result.json`，外加"真实根前后哈希"与 oracle 读数。
 *
 * 冻结依据：契约 §6.0（证据根 `_evidence\<RUN_ID>`）· §9.4（红基线必须保存什么）·
 * §9.5 第 3 条（**注册数 vs 结算数**，不许只看退出码）· 提案 §B1.7（marker/三层）。
 *
 * 为什么每例都落盘：红基线的价值全在"**为什么红**"这一列上。
 * 只截最后一行 `RED`，等于把"被测对象还没实现"和"断言写歪了"混成一个数。
 */
import path from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canonical, guardVerdict, assertRunGuard, RootGuardError } from './root-guard.mjs'
import { ENV, FROZEN, PATHS, optionalEnv } from './env.mjs'
import { calibrate } from './composition.mjs'
import { CASES_BY_ID, TOTAL, countByStatus, REGISTRY, registryProblems, DISCOVERY } from './registry.mjs'

export const EVIDENCE_PARENT = 'E:\\Harness\\.team\\test'

/** 运行根（缺失就抛 —— 调用方必须先跑守卫）。 */
export function runRoot() {
  const raw = optionalEnv(ENV.RUN_ROOT)
  if (!raw) throw new Error('ENV-MISSING: AGENIA_TEST_RUN_ROOT —— 证据根是从运行根推出来的，不能缺')
  return canonical(raw)
}

export function runId() {
  return path.basename(runRoot())
}

/** `…\<日期>\_runs\<RUN_ID>` ⇒ `…\<日期>\_evidence\<RUN_ID>`（契约 §6.0 的落点口径）。 */
export function evidenceRoot() {
  const root = runRoot()
  const runsParent = path.dirname(root)
  const dateDir = path.dirname(runsParent)
  return path.join(dateDir, '_evidence', path.basename(root))
}

export function caseDir(id) {
  return path.join(evidenceRoot(), id)
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
  return dir
}

export function writeJson(file, obj) {
  ensureDir(path.dirname(file))
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
  return file
}

export function writeText(file, text) {
  ensureDir(path.dirname(file))
  writeFileSync(file, text, 'utf8')
  return file
}

// ── 哈希 ───────────────────────────────────────────────────────────────────
/**
 * 下面两个算出来的摘要一律是**小写 hex**（`digest('hex')` 的天然形状；SUT 侧比对、审计链比对都按它）。
 * ⚠️ 但**冻结值**那一侧是**大写**（`FROZEN.oracle.sha256` 等，逐字冻结不许改）。
 * ⇒ 凡是"我算的 vs 冻结值"的比对，**必须过 `normalizeSha`/`sha256Equal`**，
 *   否则同一份摘要会因大小写不同永远报红（`ORACLE-SHA` 就踩过这一脚）。
 * ⚠️ 大小写**不是**摘要值的一部分 ⇒ 这类比对不算放宽断言。
 */
export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** 摘要归一：去空白 + 统一大写（只用于**比对**，不改任何冻结值、也不改算出来的值）。 */
export function normalizeSha(value) {
  return String(value ?? '').trim().toUpperCase()
}

/** 两个摘要是否是同一个值（大小写不敏感；空值一律不等 —— 缺哈希不算"相等"）。 */
export function sha256Equal(a, b) {
  const x = normalizeSha(a)
  return x !== '' && x === normalizeSha(b)
}

/**
 * 树哈希 —— 确定性：相对路径升序 + 每个文件 sha256 + 汇总。
 * 不存在 ⇒ `exists:false`（当前真实 `.runtime` / 真实路线就是这种态，**如实写"不存在"**）。
 */
export function treeHash(root) {
  const abs = canonical(root)
  if (!existsSync(abs)) return { path: abs, exists: false, count: 0, sha256: null, files: [] }
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) {
        files.push({
          rel: path.relative(abs, full).replace(/\\/g, '/'),
          bytes: st.size,
          sha256: sha256File(full),
        })
      }
    }
  }
  walk(abs)
  const digest = createHash('sha256')
  for (const f of files) digest.update(`${f.rel}\u0000${f.sha256}\u0000${f.bytes}\n`, 'utf8')
  return { path: abs, exists: true, count: files.length, sha256: digest.digest('hex'), files }
}

/**
 * 真实根快照 —— 契约 §2.4 第 5 条：执行前后各量一次，任何变化 = 立即停测。
 * 只读。**真实脑根 2026-10-15 起是"存在"的**（`--op init-real` 亲手开过，exit 0），
 * 真实路线仍然不存在 —— 两格都**如实写盘上是什么**，不预设"应该不存在"。
 */
export function realRootsSnapshot() {
  const snap = {
    at: new Date().toISOString(),
    brain: treeHash(PATHS.realBrainRoot),
    route: treeHash(PATHS.realRouteRoot),
    livePreset: treeHash(PATHS.finalPreset),
  }
  return snap
}

/**
 * 真实库的**内容级**读数 —— 只读，一个字节都不写。
 *
 * 为什么树哈希之外还要拆这三样：真实库**已经开出来了**（2026-10-15，`--op init-real` 亲手跑过，exit 0）。
 * 从那一刻起，「真实根不存在」不再是可用判据；还能护着它的判据只剩「**内容没变**」。
 * 而"内容没变"要让人一眼看出**变的是哪一样**，所以点名三样：
 *   ① `audit.jsonl` 的**行数** —— 任何一次 audit 写入都会让它 +1（哪怕只落一条审计）；
 *   ② `v0.json` 的**哈希** —— 开库产物，任何重开 / 重建 / 误初始化都会让它变；
 *   ③ **整棵树**的哈希（兜底：其它任何文件被写 / 被删 / 被加）。
 *
 * ⚠️ 这三样**只用来判"变没变"**，不判"应该是什么值" —— 真实库每写一次本来就该变，
 *    测试没有资格规定它长什么样。
 */
export function realRootContent(root = PATHS.realBrainRoot) {
  const audit = path.join(root, 'audit.jsonl')
  const v0 = path.join(root, 'memory', 'snapshots', 'v0.json')
  const tree = treeHash(root)
  const auditLines = existsSync(audit)
    ? readFileSync(audit, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').length
    : null
  return {
    root: tree.path,
    exists: tree.exists,
    tree_files: tree.count,
    tree_sha256: tree.sha256,
    audit_lines: auditLines,
    audit_sha256: existsSync(audit) ? sha256File(audit) : null,
    v0_sha256: existsSync(v0) ? sha256File(v0) : null,
  }
}

/**
 * 两份 `realRootContent` 的差异（空数组 = 一字未变）。
 * 逐项点名 ⇒ 红基线里读到的是"谁变了"，不是一个"哈希不同"。
 */
export function realRootContentDiff(before, after) {
  if (!before || !after) return ['（缺一相位：判不了）']
  const fields = ['exists', 'tree_files', 'tree_sha256', 'audit_lines', 'audit_sha256', 'v0_sha256']
  return fields.filter((k) => before[k] !== after[k]).map((k) => `${k}: ${before[k]} → ${after[k]}`)
}

/** oracle 读数来源 —— 只读；缺失如实写（**不许静默换源**，拍板 I3 / 契约 PH0-5）。 */
export function oracleReadings(env = process.env) {
  const file = optionalEnv(ENV.DESKTOP_ORACLE_STANDARD, env)
  const out = {
    env_var: ENV.DESKTOP_ORACLE_STANDARD,
    path: file,
    declared_version: optionalEnv(ENV.ORACLE_VERSION, env),
    declared_sha256: optionalEnv(ENV.ORACLE_SHA256, env),
    frozen_sha256: '6CD2F197737FC94A45E487D0BB57869461DD6F392D45F6429B576E75D973EDA8',
    exists: false,
    actual_sha256: null,
    actual_bytes: null,
    provenance_path: PATHS.oracleProvenance,
    provenance_exists: false,
    retired_web_path_marker: false,
  }
  if (file) {
    out.retired_web_path_marker = /Roaming[\\/]npm|[\\/]_npx[\\/]/i.test(file)
    if (existsSync(file)) {
      out.exists = true
      out.actual_sha256 = sha256File(file)
      out.actual_bytes = statSync(file).size
    }
  }
  if (existsSync(PATHS.oracleProvenance)) out.provenance_exists = true
  return out
}

/**
 * staging 只读靶子的存在性读数（缺面 ⇒ 预期的 RED-SURFACE）。
 *
 * **T-RUN-1（追加裁定 v1.5）**：这里同时给出 **`tree_sha256`** —— 被测 staging 的**树哈希**，
 * 与 oracle 的 SHA 并列落进 `_preflight` 与 `settlement.json`。理由：实现关在并发写盘，
 * 没有这一项，"那一刻的 staging 是什么"就不可复现（本单之前只能靠 oracle SHA 间接锚）。
 */
export function stagingReadings(env = process.env) {
  const raw = optionalEnv(ENV.STAGING_PRESET, env)
  if (!raw) return { path: null, exists: false, files: null, tree_sha256: null, tree_files: null }
  const abs = canonical(raw)
  const tree = existsSync(abs) ? treeHash(abs) : { exists: false, count: 0, sha256: null }
  return {
    path: abs,
    exists: existsSync(abs),
    composition: existsSync(path.join(abs, 'agent.cordis.yml')),
    injector: existsSync(path.join(abs, 'inject.js')),
    patch: existsSync(path.join(abs, 'cordis.patch.yml')),
    teamDir: existsSync(path.join(abs, 'team')),
    jobBriefsDir: existsSync(path.join(abs, 'job-briefs')),
    binDir: existsSync(path.join(abs, 'bin')),
    libDir: existsSync(path.join(abs, 'lib')),
    /** 被测 staging 树哈希（**T-RUN-1**）—— 与 `oracle.actual_sha256` 并列，读数是可复现的锚。 */
    tree_sha256: tree.sha256,
    tree_files: tree.count,
  }
}

// ── 用例壳 ─────────────────────────────────────────────────────────────────
export class CaseFailure extends Error {
  constructor(id, problems) {
    const lines = problems.map((p) => `  · [${p.code}] ${p.message}`)
    super(`${id} RED（${problems.length} 项未成立）\n${lines.join('\n')}`)
    this.name = 'CaseFailure'
    this.code = 'CASE-FAILED'
    this.caseId = id
    this.problems = problems
  }
}

function newRecord(id) {
  const reg = CASES_BY_ID.get(id)
  const guard = guardVerdict()
  return {
    id,
    registry: reg ?? null,
    group: reg?.group ?? null,
    file: reg?.file ?? null,
    registry_status: reg?.status ?? null,
    run_id: runId(),
    started_at: new Date().toISOString(),
    finished_at: null,
    ms: null,
    result: 'RED',
    problems: [],
    /**
     * **第三态 `HOLD`（裁定 v1.14）**：前置未成立、**且这一档本来就不适用** ⇒ 记在这儿。
     * 🔴 `HOLD` **绝不计绿**：结算里与 `red`/`green` 并列单独计数、逐条写明原因，分母照旧计它。
     * ⚠️ 判据分界：**"前置本不该失败" ⇒ 红**（进 `problems`）；"这一档不适用" ⇒ `HOLD`。
     */
    holds: [],
    readings: {
      staging: stagingReadings(),
      oracle: oracleReadings(),
      guard_ok: guard.ok,
      guard_failures: guard.failures,
    },
    where: { cwd: canonical(process.cwd()), pid: process.pid },
  }
}

export function problem(code, message, detail) {
  return { code, message, detail: detail ?? null }
}

/**
 * **第三态 `HOLD`（裁定 v1.14）** —— "这一档本来就不适用，所以判不了"。
 *
 * 什么时候用（判据来自 v1.14）：
 *   · **前置本不该失败** ⇒ **红**（写进 `problems`，例如"CLI 必须能读出来"）；
 *   · **这一档不适用** ⇒ **`HOLD`**（例如"旧通知被 fence 合法拒了 ⇒ 没有'有没有覆盖状态'可判"）。
 * 🔴 `HOLD` **绝不计绿**，也不算失败 —— 它在结算里单独一栏，读的人一眼看得见"这条没判"。
 *
 * @param {object} rec  `runCase` 给的记录（`rec.holds` 就是出口）
 * @param {string} code 短码（稳定、可 grep）
 * @param {string} why  为什么这一档不适用（人话）
 */
export function caseHold(rec, code, why) {
  const entry = { code, why, at: new Date().toISOString() }
  rec.holds.push(entry)
  return entry
}

/**
 * 用例体末尾的统一出口：`problems` 非空就抛。
 * 抛出去的那个错误带 `problems` 数组 —— `runCase` 会把它们**逐条**记进 `result.json`，
 * 于是红基线既能读到一个漂亮的失败报文，也能机器读出每一条原因码。
 */
export function caseFail(problems) {
  if (!Array.isArray(problems) || problems.length === 0) return
  const err = new Error(`${problems.length} 项未成立：\n${problems.map((p) => `  · [${p.code}] ${p.message}`).join('\n')}`)
  err.name = 'CaseFailure'
  err.code = 'CASE-PROBLEMS'
  err.problems = problems
  throw err
}

/**
 * 跑一个用例：
 *   · 用例自己把"没成立的东西"推进 `problems`（全收齐，不撞第一个就退）；
 *   · 抛异常也照样落盘（原始错误原样再抛，保住 stack）；
 *   · `problems` 非空 ⇒ 抛 `CaseFailure`，报文里逐条列出原因。
 */
export async function runCase(id, fn) {
  const rec = newRecord(id)
  let thrown = null
  try {
    await fn(rec)
  } catch (err) {
    thrown = err
    if (Array.isArray(err?.problems) && err.problems.length > 0) {
      for (const p of err.problems) rec.problems.push(p)
    } else {
      rec.problems.push(problem(err?.code ?? err?.name ?? 'THROWN', String(err?.message ?? err), err?.stack ?? null))
    }
  }
  rec.finished_at = new Date().toISOString()
  rec.ms = Date.parse(rec.finished_at) - Date.parse(rec.started_at)
  // 结果三态（裁定 v1.14）：**红压过一切**；没有红、但有 HOLD ⇒ `HOLD`（**不算绿**）；都没有 ⇒ `GREEN`。
  rec.result = thrown !== null || rec.problems.length > 0 ? 'RED' : rec.holds.length > 0 ? 'HOLD' : 'GREEN'
  rec.real_roots = realRootsSnapshot()
  writeJson(path.join(caseDir(id), 'result.json'), rec)
  if (thrown !== null) {
    if (Array.isArray(thrown.problems) && thrown.problems.length > 0) throw new CaseFailure(id, rec.problems)
    throw thrown
  }
  if (rec.problems.length > 0) throw new CaseFailure(id, rec.problems)
  return rec
}

/**
 * 🔴 `T-R1-04` / `T-TEST-03`（技术评审 F3 / F-29）：**staged 与活体逐字节比** —— 两棵树，不是"活体 vs 冻结期望"。
 *
 * 为什么需要它：测试的靶子（`AGENIA_STAGING_PRESET`）与生产（活体 `presets/agenia`）之间是**手工同步**。
 * 2026-10-16 一天里撞到两次"活体改了、staged 没跟上"（技术评审开工时 · 测试岗开工 10 分钟），
 * 而当时**没有任何一条断言**拿两棵树比 —— 树哈希**只被记下来**（`stagingReadings()` / `settlement`），
 * **只记账、不判等**。⇒ 这就是"假绿"的结构原因，本条把它补上。
 *
 * 🔴 口径（组长 `T-R1-04` 逐字定）：**必须是"两棵树"比**；**不许做成"放进 55 条里跑绿就算完"**
 *    —— 它得能在「只改了活体、没改 staged」的那一瞬**当场翻面**（阳性对照见 `_runs` 里那次变异体跑）。
 *
 * `SKIP`：`.runtime/` 是**数据**（真实记忆库），不是代码 —— 它**本来就不该**同步进 staging
 * （活体 61 文件 / staged 48 文件，差的那 13 个全是它）。拿它当"漂移"就是每天都红的假红。
 *
 * @returns {{staged:string|null, live:string, staged_files:number, live_files:number,
 *            only_staged:string[], only_live:string[], different:string[], same:boolean, note:string}}
 */
export function stagedVsLiveDrift(env = process.env) {
  const SKIP = new Set(['.runtime'])
  const live = canonical(PATHS.finalPreset)
  const stagedRaw = optionalEnv(ENV.STAGING_PRESET, env)
  const staged = stagedRaw ? canonical(stagedRaw) : null
  const walkOf = (root) => {
    const out = new Map()
    if (root === null || !existsSync(root)) return out
    const go = (dir) => {
      for (const name of readdirSync(dir).sort()) {
        if (SKIP.has(name)) continue
        const full = path.join(dir, name)
        const st = statSync(full)
        if (st.isDirectory()) go(full)
        else if (st.isFile()) {
          out.set(path.relative(root, full).replace(/\\/g, '/'), {
            bytes: st.size,
            sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
          })
        }
      }
    }
    go(root)
    return out
  }
  const a = walkOf(staged)
  const b = walkOf(live)
  const onlyStaged = [...a.keys()].filter((k) => !b.has(k)).sort()
  const onlyLive = [...b.keys()].filter((k) => !a.has(k)).sort()
  const different = [...a.keys()].filter((k) => b.has(k) && (a.get(k).sha256 !== b.get(k).sha256 || a.get(k).bytes !== b.get(k).bytes)).sort()
  return {
    staged,
    live,
    staged_files: a.size,
    live_files: b.size,
    only_staged: onlyStaged,
    only_live: onlyLive,
    different,
    same: staged !== null && onlyStaged.length === 0 && onlyLive.length === 0 && different.length === 0,
    note: '比的是**两棵树**（跳过 `.runtime/` = 数据，不是代码）；差一个字节就算漂移',
  }
}

// ── 开盘预检（PC）──────────────────────────────────────────────────────────
/**
 * 三条预检（契约 §6.0）：
 *   ① 根守卫（E 盘 / marker / 拒真实根 / 拒 C 盘 / RUN_ID 目录 / TEMP·TMP 显式）；
 *   ② 注册表形状自检（分母 = 盘上发现的条数、冻结清单一条不少、每组计数与契约 §9.1 对上）；
 *   ③ 可选：拿**活体那两个文件**给解析器做阳性对照（只读，见 composition.calibrate）。
 * 预检的问题必须与被测对象的红**分得开** —— 预检红说明"这台机器/这份测试自己的地基坏了"。
 */
export function preflight({ calibrateLive = false } = {}) {
  const guard = assertRunGuard()
  const registry = registryProblems()
  const out = { at: new Date().toISOString(), guard, registry_problems: registry, calibration_file: null }
  // **B3 的护栏**：名单类冻结常量必须是非空字符串数组、计数类必须是 number —— 空值/缺键一律红，**不许兜底**。
  // （来历：`staged.officeBound` 本来是计数 4，被当名单 `for...of` ⇒ 实现做对的那一刻 `not iterable`。）
  const shapeProblems = []
  const pair = [FROZEN.staged.officeBoundRoles, FROZEN.staged.officeBound]
  if (!Array.isArray(pair[0]) || pair[0].length === 0 || pair[0].some((v) => typeof v !== 'string' || v === '')) {
    shapeProblems.push('FROZEN.staged.officeBoundRoles 必须是非空字符串数组（名单）')
  }
  if (typeof pair[1] !== 'number') shapeProblems.push('FROZEN.staged.officeBound 必须是计数（number）—— 名单请读 officeBoundRoles')
  if (Array.isArray(pair[1])) shapeProblems.push('FROZEN.staged.officeBound 被写成名单了：计数处读它、名单处读 officeBoundRoles，两者别混')
  if (Array.isArray(pair[0]) && typeof pair[1] === 'number' && pair[0].length !== pair[1]) {
    shapeProblems.push(`officeBound 计数(${pair[1]}) 与名单长度(${pair[0].length}) 不一致`)
  }
  out.frozen_shape_problems = shapeProblems
  if (shapeProblems.length > 0) {
    throw new RootGuardError('FROZEN-SHAPE', shapeProblems.map((p) => ({ code: 'E_INTERNAL', detail: p })), {})
  }
  // **T-RUN-1**：`_preflight` 也记被测 staging 的树哈希（与 settlement 并列；并发写盘时可复现）
  const st = stagingReadings()
  out.staged_tree_sha256 = st.tree_sha256
  out.staged_tree_files = st.tree_files
  // **T-R1-04**：`_preflight` 也记"staged vs 活体"的两棵树读数（**只记不判** —— 判在 STAT-01 那条用例上）。
  // 记在这儿的好处：每一跑（含定向跑）的 `_preflight` 里都留下"那一刻两棵树是什么"，可复现。
  out.staged_vs_live = (() => {
    const d = stagedVsLiveDrift()
    return { same: d.same, staged_files: d.staged_files, live_files: d.live_files, only_staged: d.only_staged, only_live: d.only_live, different: d.different }
  })()
  out.oracle_sha256 = oracleReadings().actual_sha256
  if (registry.length > 0) {
    throw new RootGuardError('REGISTRY-SHAPE', registry.map((p) => ({ code: 'E_ARG_SCHEMA', detail: p })), {})
  }
  if (calibrateLive) {
    const cal = calibrate(readFileSync(PATHS.liveComposition, 'utf8'), readFileSync(PATHS.livePatch, 'utf8'))
    // ⚠️ 校准读数写**单独一个文件**：`preflight.json` 会被四个测试文件的 before 各写一次，
    //    后跑的那个文件会把先跑的那份覆盖掉（第一次跑就是这样把校准读数盖成 null 的）。
    out.calibration_file = writeJson(path.join(evidenceRoot(), '_preflight', 'calibration.json'), cal)
    if (cal.problems.length > 0) {
      throw new RootGuardError('PARSER-CALIBRATION-FAILED', cal.problems.map((p) => ({ code: 'E_INTERNAL', detail: p })), cal.readings)
    }
  }
  writeJson(path.join(evidenceRoot(), '_preflight', `preflight.${process.pid}.json`), out)
  return out
}

/** 真实根 before/after 两相位（契约 §2.4 第 5 条 / §6.0 PC-4）。 */
export function writeRealRootsPhase(phase, snap = realRootsSnapshot()) {
  writeJson(path.join(evidenceRoot(), '_preflight', `real-roots.${phase}.json`), snap)
  return snap
}

/** 两相位对照：任何变化 ⇒ 安全违规（不是普通红）。 */
export function realRootsDiff(before, after) {
  const diffs = []
  for (const key of ['brain', 'route']) {
    const b = before[key]
    const a = after[key]
    if (b.exists !== a.exists) diffs.push(`${key}：exists ${b.exists} → ${a.exists}`)
    else if (b.exists && b.sha256 !== a.sha256) diffs.push(`${key}：树哈希 ${b.sha256} → ${a.sha256}`)
  }
  return diffs
}

// ── 结算（注册数 vs 结算数）────────────────────────────────────────────────
/** 交付面清单：`tests/agenia-upgrade/**` 逐文件 SHA —— 红基线要能冻住"测试是哪一版"。 */
export function sourceInventory() {
  const root = canonical(PATHS.testRoot)
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) out.push({ rel: path.relative(root, full).replace(/\\/g, '/'), bytes: st.size, sha256: sha256File(full) })
    }
  }
  walk(root)
  return out
}

function readPhase(phase) {
  const file = path.join(evidenceRoot(), '_preflight', `real-roots.${phase}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function settle() {
  const root = evidenceRoot()
  const counts = countByStatus()
  const cases = []
  for (const entry of REGISTRY) {
    const evidenceFile = path.join(root, entry.id, 'result.json')
    if (!existsSync(evidenceFile)) {
      cases.push({ ...entry, settled: false, result: null, problems: [], ms: null })
      continue
    }
    const rec = JSON.parse(readFileSync(evidenceFile, 'utf8'))
    cases.push({
      ...entry,
      settled: true,
      result: rec.result,
      ms: rec.ms,
      problems: rec.problems ?? [],
      /** 第三态（v1.14）：逐条带原因，结算里单独一栏 —— **绝不计绿**。 */
      holds: rec.holds ?? [],
      readings: rec.readings ?? null,
    })
  }
  const writtenIds = REGISTRY.filter((r) => r.status === 'written').map((r) => r.id)
  const settledWritten = cases.filter((c) => c.status === 'written' && c.settled).map((c) => c.id)
  const missing = writtenIds.filter((id) => !settledWritten.includes(id))
  const unexpected = cases.filter((c) => c.status !== 'written' && c.settled).map((c) => c.id)
  const red = cases.filter((c) => c.settled && c.result === 'RED').length
  const green = cases.filter((c) => c.settled && c.result === 'GREEN').length
  /** **HOLD 单独计数**（v1.14）：既不是绿、也不是红；分母照旧计它。 */
  const holdCases = cases.filter((c) => c.settled && c.result === 'HOLD')
  const holds = holdCases.map((c) => ({ id: c.id, reasons: c.holds.map((h) => ({ code: h.code, why: h.why })) }))

  // ── 运行范围的核对口径 ───────────────────────────────────────────────────
  // 分批交付时"只跑本批文件"是常态，所以判据不能是"written 全都要有结算"（那会把没跑的文件当成失败）。
  // 真正要守的两条：
  //   ① **跑到的文件里，不许有已写用例悄悄没结算**（那才是"注册数缩水"）；
  //   ② 没跑到的文件必须**明写**为 not_run，不许当选过。
  const filesInRun = [...new Set(cases.filter((c) => c.settled).map((c) => c.file))].sort()
  const partialFiles = []
  for (const file of filesInRun) {
    const want = REGISTRY.filter((r) => r.file === file && r.status === 'written').map((r) => r.id)
    const got = cases.filter((c) => c.file === file && c.settled).map((c) => c.id)
    const miss = want.filter((id) => !got.includes(id))
    if (miss.length > 0) partialFiles.push({ file, missing: miss })
  }
  const writtenFiles = [...new Set(REGISTRY.filter((r) => r.status === 'written').map((r) => r.file))].sort()
  const notRunFiles = writtenFiles.filter((f) => !filesInRun.includes(f))
  const notRun = cases.filter((c) => c.status === 'written' && !c.settled).map((c) => c.id)
  /**
   * ── 发现 ↔ 登记 ↔ 证据（F-57）────────────────────────────────────────
   * 结算过去只按 `REGISTRY` 枚举证据目录 ⇒ 一个**没登记**的用例目录被整个忽略
   * （实测：里面写着 RED 也看不见，`--settle` 还 exit 0）。
   * 现在两个方向都算：登记表里的（`registryProblems()`）与证据根里多出来的（孤儿证据）。
   */
  const evidenceDirs = existsSync(root)
    ? readdirSync(root).filter((n) => !n.startsWith('_') && statSync(path.join(root, n)).isDirectory())
    : []
  const orphanEvidence = evidenceDirs.filter((id) => !REGISTRY.some((r) => r.id === id))
  const discoveryProblems = [
    ...DISCOVERY.problems.map((p) => p.message),
    ...registryProblems(),
    ...orphanEvidence.map((id) => `证据根里有、登记表里没有的用例目录：${id} —— 结算会整个忽略它（EVID-ORPHAN）`),
  ]
  const before = readPhase('before')
  const after = readPhase('after')
  /**
   * **脚手架崩了 ≠ 被测对象红了**：
   *   用例体里出现 `ReferenceError` / `TypeError` / `THROWN` / `SyntaxError` 这类**语言级**错误，
   *   十有八九是**测试自己**的问题（例如用了没 import 的助手），不是被测对象的行为。
   *   它们照样算红（不许粉饰），但**单独列出来** —— 免得"红在脚手架"混进"红在被测对象"里，被当成实现缺陷去查。
   *   来历：本单我自己踩过一次（`sha256Equal` 忘了 import ⇒ `REV-03` 报 `ReferenceError`）。
   */
  const scaffoldingCodes = ['ReferenceError', 'TypeError', 'THROWN', 'SyntaxError']
  const scaffoldingErrors = cases
    .filter((c) => c.settled && c.problems.some((p) => scaffoldingCodes.includes(p.code)))
    .map((c) => ({ id: c.id, codes: [...new Set(c.problems.filter((p) => scaffoldingCodes.includes(p.code)).map((p) => p.code))] }))
  const diff = before && after ? realRootsDiff(before, after) : null
  return {
    run_id: runId(),
    evidence_root: root,
    generated_at: new Date().toISOString(),
    registry: { total: TOTAL, written: counts.written, pendingWrite: counts['pending-write'] },
    /**
     * 分母是从哪来的（F-57）：`cases` 是盘上发现的条数 = `registry.total`；
     * `problems` 把"登记 ≠ 盘上"与"孤儿证据"合在一起，`reporter_check_ok` 也认它。
     */
    discovery: {
      root: DISCOVERY.root,
      matcher: DISCOVERY.matcher,
      files: DISCOVERY.files.length,
      cases: DISCOVERY.cases.length,
      anonymous: DISCOVERY.anonymous.length,
      duplicates: DISCOVERY.duplicates.length,
      orphan_evidence: orphanEvidence,
      problems: discoveryProblems,
    },
    run_scope: { files_in_run: filesInRun, written_files: writtenFiles, not_run_files: notRunFiles, not_run_cases: notRun },
    settled: { total: cases.filter((c) => c.settled).length, red, green, holds: holdCases.length, hold_cases: holds, missing, unexpected, partial_files: partialFiles },
    /** 语言级错误（红在脚手架 ⇒ 先查测试自己）：单独一栏，别和"被测对象的红"混着读。 */
    scaffolding_errors: scaffoldingErrors,
    /**
     * 报告器核对（三条一起看）：
     *   ① 跑到的文件里不许有已写用例偷偷没结算（`partialFiles` 必须为空）；
     *   ② 不许有 pending-write 的用例跑出来（`unexpected` 必须为空）；
     *   ③ 🔴 **`HOLD` 不许被当 pass**（v1.14）：所以它**不进** `green`、也不进 `red`，单独一栏；
     *      这一条在这里只保证"三态互斥且计数守恒"（`red + green + holds === settled`），
     *      谁要把 HOLD 读成"过了"，得先推翻这个守恒式。
     *   ④ 🔴 **登记必须等于盘上**（F-57）：`discoveryProblems` 必须为空 ——
     *      包括"没登记的用例跑了 / 登记的用例不见了 / 证据根里有孤儿目录"。
     * `missing` 是"全部已写用例里这次没跑的"—— 分批跑时它非空是**正常的**，明写在 `not_run_cases` 里。
     */
    reporter_check_ok: partialFiles.length === 0 && unexpected.length === 0 && red + green + holdCases.length === cases.filter((c) => c.settled).length && discoveryProblems.length === 0,
    full_coverage: missing.length === 0,
    /** 安全不变量：真实脑 / 真实路线前后必须一字不变（契约 §2.4 第 5 条）。 */
    real_roots: { before, after, diff, security_violation: diff === null ? null : diff.length > 0 },
    oracle: oracleReadings(),
    staging: stagingReadings(),
    /**
     * **T-RUN-1（追加裁定 v1.5）**：被测 staging 的树哈希**提升到顶层**，与 oracle SHA 并列 ——
     * 这一轮"被测的是哪一版"一眼可读、可复现（实现关会并发改 staging）。
     */
    staged_tree_sha256: stagingReadings().tree_sha256,
    staged_tree_files: stagingReadings().tree_files,
    sources: sourceInventory(),
    by_group: groupSummary(cases),
    cases,
  }
}

function groupSummary(cases) {
  const out = {}
  for (const c of cases) {
    const g = (out[c.group] ??= { total: 0, settled: 0, red: 0, green: 0 })
    g.total += 1
    if (c.settled) {
      g.settled += 1
      if (c.result === 'RED') g.red += 1
      else g.green += 1
    }
  }
  return out
}

export function settleMarkdown(s) {
  const lines = []
  lines.push(`# 红基线结算 · RUN_ID \`${s.run_id}\``)
  lines.push('')
  lines.push(`- 生成时间：${s.generated_at}`)
  lines.push(`- 注册表分母：**${s.registry.total}**（已写 **${s.registry.written}** · pending-write **${s.registry.pendingWrite}**）`)
  // 分母是从哪来的（F-57）：盘上发现的条数 + 登记↔盘上的差异数（差异不为 0 时逐条点名）。
  const discoveryDiffs = s.discovery?.problems ?? []
  lines.push(`- 发现 ↔ 登记：盘上 **${s.discovery?.cases ?? '?'}** 条 / ${s.discovery?.files ?? '?'} 个文件 · 差异 **${discoveryDiffs.length}**${discoveryDiffs.length > 0 ? `：${discoveryDiffs.slice(0, 5).join('；')}` : ''}`)
  lines.push(`- 本次结算：${s.settled.total} 条 → RED **${s.settled.red}** / GREEN **${s.settled.green}** / **HOLD ${s.settled.holds ?? 0}**`)
  if ((s.settled.holds ?? 0) > 0) {
    lines.push(`- 🔴 **HOLD（第三态，v1.14）** —— 前置未成立、**且这一档本来就不适用** ⇒ **判不了**。**它不是绿**：${s.settled.hold_cases.map((h) => `${h.id}（${h.reasons.map((r) => `${r.code}: ${r.why}`).join('；')}）`).join(' · ')}`)
  }
  if ((s.scaffolding_errors ?? []).length > 0) {
    lines.push(`- 🔴 **红在脚手架，不在被测对象**（先查测试自己，别去改实现）：${s.scaffolding_errors.map((e) => `${e.id}（${e.codes.join('/')}）`).join(' · ')}`)
  }
  lines.push(`- 本次跑到的文件：${s.run_scope.files_in_run.join(' · ') || '（无）'}`)
  lines.push(`- 报告器核对（跑到的文件里不许缺结算 + 不许跑到未写的）：${s.reporter_check_ok ? '通过' : '**不通过**'}${s.settled.partial_files.length ? ` · 文件内缺结算：${s.settled.partial_files.map((p) => `${p.file}(${p.missing.join(',')})`).join('；')}` : ''}${s.settled.unexpected.length ? ` · 意外多出：${s.settled.unexpected.join(', ')}` : ''}`)
  lines.push(`- 未跑到的已写用例（分批跑时正常，明写在此）：${s.run_scope.not_run_cases.length === 0 ? '无（本次全覆盖）' : `${s.run_scope.not_run_cases.length} 条 —— ${s.run_scope.not_run_files.join(' · ')}`}`)
  lines.push(`- 真实根前后：before=${s.real_roots.before ? '有' : '缺'} · after=${s.real_roots.after ? '有' : '缺'} · 差异=${s.real_roots.diff === null ? '（判不了：缺一相位）' : (s.real_roots.diff.length === 0 ? '**无**' : `**有**：${s.real_roots.diff.join('；')}`)}`)
  lines.push(`- oracle：${s.oracle.exists ? `在盘（SHA ${s.oracle.actual_sha256}）` : '**不在盘**'} · 声明版本 ${s.oracle.declared_version ?? '(未给)'} · 路径 ${s.oracle.path ?? '(未给)'}`)
  lines.push(`- staging：${s.staging.exists ? '在盘' : '**不在盘**'}（${s.staging.path ?? '(未给)'}）`)
  lines.push(`- **被测 staging 树哈希（T-RUN-1）**：\`${s.staged_tree_sha256 ?? '(算不出)'}\` · ${s.staged_tree_files ?? 0} 个文件 —— 与上面那行 oracle SHA 并列，就是"这一轮被测的是哪一版"的锚`)
  lines.push('')
  lines.push('| ID | 组 | 文件 | 注册状态 | 结果 | 耗时 ms | 原因 |')
  lines.push('|---|---|---|---|---|---:|---|')
  for (const c of s.cases) {
    const reason = c.settled
      ? (c.problems.length === 0
        ? ((c.holds ?? []).length > 0 ? `**HOLD**：${c.holds.map((h) => `${h.code}（${h.why}）`).join('；')}` : '—')
        : c.problems.map((p) => `[${p.code}] ${String(p.message).split('\n')[0]}`).join('；'))
      : '（本批未写：pending-write）'
    lines.push(`| ${c.id} | ${c.group} | ${c.file} | ${c.status} | ${c.settled ? c.result : '—'} | ${c.ms ?? '—'} | ${reason.replace(/\|/g, '/')} |`)
  }
  lines.push('')
  lines.push('## 交付面 SHA（`tests/agenia-upgrade/**`）')
  lines.push('')
  lines.push('| 文件 | bytes | sha256 |')
  lines.push('|---|---:|---|')
  for (const f of s.sources) lines.push(`| ${f.rel} | ${f.bytes} | ${f.sha256} |`)
  lines.push('')
  return lines.join('\n')
}

// CLI：`node support/evidence.mjs --settle` / `--real-roots before|after`
// （把结算与前后哈希写进证据根；可复跑，不依赖谁记得）
if (process.argv[1] && canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2)
  const rr = argv.indexOf('--real-roots')
  if (rr >= 0) {
    const phase = argv[rr + 1] ?? 'before'
    const snap = writeRealRootsPhase(phase)
    console.log(`real-roots.${phase}: brain=${snap.brain.exists ? snap.brain.sha256 : 'ABSENT'} route=${snap.route.exists ? snap.route.sha256 : 'ABSENT'} livePreset=${snap.livePreset.exists ? snap.livePreset.sha256 : 'ABSENT'}`)
  } else {
    const s = settle()
    writeJson(path.join(evidenceRoot(), 'settlement.json'), s)
    writeText(path.join(evidenceRoot(), 'settlement.md'), settleMarkdown(s))
    console.log(`settlement: ${s.settled.red} RED / ${s.settled.green} GREEN / 分母 ${s.registry.total} / reporter_check_ok=${s.reporter_check_ok} / real_roots_diff=${s.real_roots.diff === null ? 'n/a' : s.real_roots.diff.length}`)
    // 🔴 结算自己说"不通过" ⇒ 退出码必须非零（2）。恒 exit 0 会让"分母 + 全绿"那两句话谁都不负责（F-43 / F-57）。
    process.exitCode = s.reporter_check_ok ? 0 : 2
  }
}
