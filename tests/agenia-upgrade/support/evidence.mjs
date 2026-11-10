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
import { platformReading, platformLine } from './platform.mjs'
import { describeReadFailures, foldReadFailures, readFailureOf } from './tree-read.mjs'
import { coverageSettlementLine } from './coverage-line.mjs'

export { coverageSettlementLine } from './coverage-line.mjs'

/**
 * 本文件在仓库里的相对路径（**量出来的**，不是手打）：结算行末尾点名"唯一定义"时用它。
 * 形式与 `sourceInventory()` 的 `rel` 同形（posix 分隔符）。
 */
const SELF_REL = path.relative(PATHS.repo, fileURLToPath(import.meta.url)).replace(/\\/g, '/')

/**
 * 证据根的白名单父目录（`….team\test`）—— 跟着 `PATHS.repo` 派生（2026-11-02 起）。
 * ⚠️ 复核（2026-11-02）：**本模块与整套件都没有读点**（原来写死的 `E:\Harness\.team\test`
 *    在 worktree 里是另一棵树）。留着是为了不悄悄改导出面；**别再加第二份**。
 */
export const EVIDENCE_PARENT = path.join(PATHS.repo, '.team', 'test')

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
 *
 * `excludeTopLevel`：**只跳过顶层**这几个名字（目录或文件）。它存在的唯一理由是数据段
 * （`FROZEN.targetLag.dataSegments`）：顶层 `.runtime` 是每 15 秒就变的脑数据，不算"代码有没有被动过"。
 * 🔴 **只认顶层那一段** —— `lib/.runtime/x` 是代码（`.tools/fingerprint.mjs:26-27` 的同一课，
 *    那边按**根相对前缀**排 `.runtime/`，`lib/.runtime/…` 照样算代码）。按名字一路跳会开一个洞。
 * 返回值里带上 `excluded`（**那一个数组本身**，不是副本）⇒ 调用方可以判"排除集是不是单源"。
 */
export function treeHash(root, { excludeTopLevel = null } = {}) {
  const abs = canonical(root)
  if (!existsSync(abs)) return { path: abs, exists: false, count: 0, sha256: null, files: [], excluded: excludeTopLevel }
  const skip = Array.isArray(excludeTopLevel) ? excludeTopLevel : []
  const files = []
  const walk = (dir, depth) => {
    for (const name of readdirSync(dir).sort()) {
      if (depth === 0 && skip.includes(name)) continue
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full, depth + 1)
      else if (st.isFile()) {
        files.push({
          rel: path.relative(abs, full).replace(/\\/g, '/'),
          bytes: st.size,
          sha256: sha256File(full),
        })
      }
    }
  }
  walk(abs, 0)
  const digest = createHash('sha256')
  for (const f of files) digest.update(`${f.rel}\u0000${f.sha256}\u0000${f.bytes}\n`, 'utf8')
  return {
    path: abs,
    exists: true,
    count: files.length,
    sha256: digest.digest('hex'),
    files,
    /** 排除集（**同一个数组对象**；`null` = 这一格没排除任何东西）。`DR-02` 判它与 `FROZEN` 是不是同一个。 */
    excluded: Array.isArray(excludeTopLevel) ? excludeTopLevel : null,
  }
}

/**
 * 路径集合读数 —— **只记路径，一个字节内容都不读**（`DR-02` 的 `brain` 见证，组长 2026-11-07 决定）。
 *
 * 为什么不是树哈希：真实脑根就是 `presets/agenia/.runtime`，而它**天天在变** ——
 * 本会话的作业/状态/报告、**别的 workspace**（数据根是预设级共享的）、`bg-notify` 投递，
 * 都是**合法**变化。内容哈希分不清"是谁写的"，拿它当"这一跑写了"的证据 ⇒ 间歇红 + 归因错。
 * 路径集合（新增 / 删除）能抓住"一次迷路的写"最典型的结果（多一个文件 / 少一个），
 * 且**不受内容 churn 影响**。
 *
 * 🔴 **覆盖边界**（别把它读成"脑根被写就一定红"）：**已存在文件被就地覆盖**（内容改、路径不变）
 *    **不在**本见证的覆盖范围。兜它的是 `--real-mode` ⇒ `E_ROOT_REAL_BRAIN`（`DR-01`）；
 *    `lib/cli-inventory.mjs` 只是**枚举**有哪些命令、不判它会写哪儿 —— **它不是闸**。
 *    另一方向的**残余误报**：别的会话在窗口内新增 / 删除一个路径，同样会被判成路径集合变化
 *    ⇒ 假红（不是假绿）。这段边界同批写进 `rec.readings.real_roots.content_uncovered` 与结算那一行。
 *
 * ⚠️ 只记**常规文件**（目录由文件隐含；空目录不单独记）—— 与 `treeHash` 的 `files` 同一个 walk 口径。
 */
export function treePaths(root) {
  const abs = canonical(root)
  if (!existsSync(abs)) return { path: abs, exists: false, count: 0, paths: [] }
  const paths = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) paths.push(path.relative(abs, full).replace(/\\/g, '/'))
    }
  }
  walk(abs)
  return { path: abs, exists: true, count: paths.length, paths }
}

/**
 * `treePaths` 快照的**形状判据**（2026-11-07 MF-2）。
 *
 * `pathSetDiff` 过去写的是 `paths ?? []`：一个 **`treeHash` 形状**的快照（键是 `files`，没有 `paths`）
 * 会被读成**两个空集合** ⇒ `same:true` ⇒ 这条全量见证永远绿。形状不对时，差集**根本算不出来**，
 * 调用方不许把它当"没变"。返回 `null` = 形状合格；否则返回人话原因（红报文直接用它点名）。
 *
 * 判什么：`paths` 必须是数组；`count === paths.length`；`exists` 与 `paths` 的空/非空必须一致
 * （**真根存在 ⇒ 路径不许是空集**：空集"没变"不是证据，那是没量到）。
 */
export function pathSetShapeProblem(snap) {
  if (snap === null || typeof snap !== 'object') return `快照不是对象（实得 ${snap === null ? 'null' : typeof snap}）`
  if (!Array.isArray(snap.paths)) return `快照里没有 paths 数组（实得 ${snap.paths === undefined ? 'undefined' : typeof snap.paths}）—— treeHash 形状的键是 files ⇒ 两侧会变成两个空集`
  if (snap.count !== snap.paths.length) return `count ${snap.count} ≠ paths.length ${snap.paths.length}`
  if (snap.exists === true && snap.paths.length === 0) return 'exists=true 但 paths 是空的 —— 真根存在时"空集合没变"不是证据'
  if (snap.exists === false && snap.paths.length !== 0) return `exists=false 但 paths 有 ${snap.paths.length} 条`
  return null
}

/**
 * 两份 `treePaths` 的差集 —— **一个定义，两处读**（`DR-02` ④ 的真跑 · 结算里"真实根前后"那一行）。
 * `same` 同时要求**存在性**相同：根出现 / 消失即使路径都是空，也是变化。
 * 返回 `null` = 判不了（缺一相位 / 形状不对）⇒ 调用方不许当绿。
 */
export function pathSetDiff(before, after) {
  if (!before || !after) return null
  if (pathSetShapeProblem(before) !== null || pathSetShapeProblem(after) !== null) return null
  const b = new Set(before.paths)
  const a = new Set(after.paths)
  const added = [...a].filter((p) => !b.has(p)).sort()
  const removed = [...b].filter((p) => !a.has(p)).sort()
  return {
    exists: { before: before.exists === true, after: after.exists === true },
    added,
    removed,
    same: before.exists === after.exists && added.length === 0 && removed.length === 0,
  }
}

/** 差集的人话（点名路径；超过 `limit` 条只点名前几条，但**总数始终给**）。 */
export function pathSetSummary(diff, limit = 8) {
  const fmt = (arr) => (arr.length <= limit ? arr.join(', ') : `${arr.slice(0, limit).join(', ')} …（共 ${arr.length} 条）`)
  const parts = []
  if (diff.added.length > 0) parts.push(`新增 ${diff.added.length} 份：${fmt(diff.added)}`)
  if (diff.removed.length > 0) parts.push(`删除 ${diff.removed.length} 份：${fmt(diff.removed)}`)
  return parts.join('；')
}

/**
 * 真实根快照 —— 契约 §2.4 第 5 条：执行前后各量一次，任何变化 = 立即停测。
 * 只读。**真实脑根 2026-10-15 起是"存在"的**（`--op init-real` 亲手开过，exit 0），
 * 真实路线仍然不存在 —— 两格都**如实写盘上是什么**，不预设"应该不存在"。
 *
 * 🔴 三格的**判据不同**（2026-11-07 MF-1）：
 *   · `brain` = **路径集合**（`treePaths`）—— 脑根天天被合法地改（别的会话 / 作业），内容不判；
 *   · `route` = **内容哈希**（`treeHash`）—— 真实路线根很小、只有本会话写，没有"别人也在写"的来源；
 *   · `livePreset` = **内容哈希 + 排除顶层数据段**。
 *
 * 🔴 `livePreset` 的覆盖口径（组长 2026-11-06 决定，`决定-DR02覆盖口径.md` §三）：
 *   = **整棵 `presets/agenia` 减去数据段**，数据段**只从** `FROZEN.targetLag.dataSegments` 取
 *   （今天是 `['.runtime']`）—— 这里**不许**再写第二份清单，也不许在调用方传一份。
 *   派生成语：数据段每 15 秒/每次作业就变，算进"安全哈希"= 只要有人正常干活这条安全判据就必红。
 * `livePresetRoot` 可注入（缺省 = 现役）—— **刀**要在副本上量同一把尺子，而不是另写一份。
 * 🔴 `brainRoot` 也可注入（2026-11-07 MF-2）：**刀必须走产品这条路**取 `before.brain`。
 *    刀自己调 `treePaths()` 造快照的那一版，把"产品把 `brain` 改回 `treeHash`"这个回归整个藏住了
 *    （刀仍绿，洞只在真跑那一格）。注入根 ⇒ 刀与真跑的**快照构造是同一份代码**。
 */
export function realRootsSnapshot({ brainRoot = PATHS.realBrainRoot, livePresetRoot = PATHS.finalPreset } = {}) {
  const snap = {
    at: new Date().toISOString(),
    /** 🔴 **路径集合**，不是内容哈希（2026-11-07 MF-1）—— 见 `treePaths` 的覆盖边界。 */
    brain: treePaths(brainRoot),
    route: treeHash(PATHS.realRouteRoot),
    livePreset: treeHash(livePresetRoot, { excludeTopLevel: FROZEN.targetLag.dataSegments }),
  }
  return snap
}

/**
 * 真实库的**内容级**读数 —— 只读，一个字节都不写。
 *
 * ⚠️ **它已经不是任何一条安全见证的判据了**（2026-11-07 batch 8）：`DR-01` 与 `DR-02` 的 `brain`
 * 见证都换成了**路径集合**（`treePaths` / `realRootsSnapshot().brain`）。这一份留着只当**读数**：
 * 想回答"这一刻库里有几条审计 / v0 的哈希是多少"时用它，**不许**拿它当"这一跑写了没有"的证据
 * （内容有多个**合法**来源：别的 workspace、`bg-notify`、日常作业 —— 见 `treePaths` 的覆盖边界）。
 *
 * 为什么树哈希之外还要拆这三样：真实库**已经开出来了**（2026-10-15，`--op init-real` 亲手跑过，exit 0）。
 * 从那一刻起，「真实根不存在」不再是可用判据；还能护着它的判据只剩「**路径集合没变**」。
 * 而"内容"这一层要让人一眼看出**变的是哪一样**，所以点名三样：
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

// ── 这棵树答得了哪一类问题（评审副本答不了数据 / 文档 / 仓库历史）──────────────
/**
 * **这一棵树是不是「从提交导出的只读副本」** —— 决定"样本不在"该记红还是记 `HOLD`。
 *
 * 技术评审 2026-11-03 `F4`：套件原地跑在副本里时，六条用例（`STAT-04` / `DOC-01` / `SURF-03` /
 * `VRF-01` / `DBY-05` / `REV-04`）报"缺数据 / 缺文档 / 缺历史提交"，被记成 **RED** 并推 `exit 1` ——
 * 只看结算行的人会把**冻结版**读成"六条红"。那六条量的是**活树的数据段**，而数据段
 * （`.runtime/` · `.team/`）与仓库历史**不随提交走**（导出器只搬 blob；`.gitignore` 挡着它们）⇒
 * 副本里它们本来就不该在，那不是"副本坏了"，是**这一格在这棵树上判不了**。
 *
 * 判据只有一条、可复算：`<repo>/.git` 在不在。
 *   · 活树是 git 检出（`.git` 目录，或 worktree 的 `.git` 文件）⇒ 缺了就是**真缺** ⇒ 红；
 *   · `.tools/tree-at-commit.mjs` 的副本是**纯树**（连 `.git` 都不许有，它自己会拒）⇒ 缺的是数据/历史 ⇒ `HOLD`。
 * ⚠️ 它只回答"缺样本时该记什么"，**不回答"样本在不在"**（那是各用例自己量的）；也**不是绿** ——
 *    `HOLD` 在结算里单独一栏，分母照旧计它（`evidence.mjs::runCase` 的第三态）。
 */
export function commitCopyReading({ repo = PATHS.repo } = {}) {
  const gitMark = path.join(repo, '.git')
  return {
    repo,
    git_mark: gitMark,
    is_copy: !existsSync(gitMark),
    note: '副本 = 导出器落的纯树（没有 `.git`）；`.runtime/` · `.team/` · 仓库历史都不随提交走',
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
     * `{code, why, kind, at}` —— `kind` 由 `caseHold` 的第四参给（`case` 缺省 / `environment`），
     * 结算句组的 `HOLD <id> <code> env|case` 只**读**它（`SHN-01`）。
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
 * **判据自己的调用形状**（`HCA-01`）—— 纯函数，入口与刀共用同一份。
 *
 * 病（技术评审 2026-11-09 `F2`）：`caseHold(rec, code, why)` 收 3 个实参，而
 * `integration/flip01-bridge-reading.test.mjs` 里有一处写成 `return caseHold('FLIP-PROVENANCE-UNKNOWN', \`…\`)`
 * —— 只传了 2 个。那一跑的真事：`rec` 收到的是那个字符串、`rec.holds` 是 `undefined`
 * ⇒ `Cannot read properties of undefined (reading 'push')` ⇒ 用例判 **RED**
 * ⇒ "这一格判不了" 被记成了 "被测对象红了"。**判据自己的笔误，不许长成产品的红。**
 *
 * 三条判据（都是"形状"，不是"内容"）：
 *   · 实参**个数**必须是 3 —— 少了就点名 `CASE-HOLD-ARITY`；
 *   · 第 1 个必须是 `runCase` 的记录（有数组型 `holds`）—— 否则 `CASE-HOLD-REC`；
 *   · 第 2 / 3 个必须是字符串（`code` 还要求非空）—— 否则 `CASE-HOLD-CODE` / `CASE-HOLD-WHY`。
 * ⚠️ **多于 3 个实参不判**：第 4 个是文档化的 `opts`（`kind`）；多传不会让 `rec` / `code` / `why` 错位
 *   （这三类笔误都是"少传/错位"），它只是**不参与形状判定**的附加信息；
 *   把闸开到"多一个也红"就是把"判据写脏了"记成"这一格判不了"，而闸一吵人就会绕过它。
 *   边界写在这里，读的人不必回推。
 *
 * @param {{argc:number, rec:any, code:any, why:any}} input
 * @returns {null|{code:string, message:string}}
 */
export function caseHoldCallProblem({ argc, rec, code, why } = {}) {
  if (typeof argc !== 'number' || argc < 3) {
    return {
      code: 'CASE-HOLD-ARITY',
      message: `判据自己写错了：\`caseHold\` 只收到 ${argc ?? '?'} 个实参（要 3 个：rec, code, why）`
        + ' —— 这是 harness 的缺陷，不是被测对象的红。修调用点，别把这条当产品红报。',
    }
  }
  if (rec === null || typeof rec !== 'object' || !Array.isArray(rec.holds)) {
    return {
      code: 'CASE-HOLD-REC',
      message: `判据自己写错了：\`caseHold\` 的第 1 个实参不是 \`runCase\` 的记录（收到 ${rec === null ? 'null' : typeof rec}；`
        + '要求有数组型 `holds`）—— 这是 harness 的缺陷，不是被测对象的红。',
    }
  }
  if (typeof code !== 'string' || code.trim() === '') {
    return { code: 'CASE-HOLD-CODE', message: `判据自己写错了：\`caseHold\` 的第 2 个实参（code）必须是非空字符串，收到 ${JSON.stringify(code)}` }
  }
  if (typeof why !== 'string') {
    return { code: 'CASE-HOLD-WHY', message: `判据自己写错了：\`caseHold\` 的第 3 个实参（why）必须是字符串，收到 ${JSON.stringify(why)}` }
  }
  return null
}

/** 调 `caseHold` 的那一行在哪儿（`evidence.mjs` 自己那几帧跳掉）—— 报文里要指名道姓。 */
function callerFrameOfCaseHold() {
  const lines = String(new Error().stack ?? '').split(/\r?\n/).slice(1)
  for (const line of lines) {
    const t = line.trim()
    if (t === '' || !t.startsWith('at ')) continue
    if (t.includes('evidence.mjs')) continue
    if (t.includes('caseHoldCallProblem')) continue
    return t.replace(/^at\s+/, '')
  }
  return '(调用点读不出来)'
}

/** `caseHold` 的形状不对时抛这个 —— `code` 会原样进 `result.json` 的 `problems[0].code`。 */
export class CaseHoldShapeError extends Error {
  constructor(shape, callSite) {
    super(`[${shape.code}] ${shape.message}（调用点：${callSite}）`)
    this.name = 'CaseHoldShapeError'
    this.code = shape.code
    this.call_site = callSite
    this.detail = shape.message
  }
}

/**
 * **第三态 `HOLD`（裁定 v1.14）** —— "这一档本来就不适用，所以判不了"。
 *
 * 什么时候用（判据来自 v1.14）：
 *   · **前置本不该失败** ⇒ **红**（写进 `problems`，例如"CLI 必须能读出来"）；
 *   · **这一档不适用** ⇒ **`HOLD`**（例如"旧通知被 fence 合法拒了 ⇒ 没有'有没有覆盖状态'可判"）。
 * 🔴 `HOLD` **绝不计绿**，也不算失败 —— 它在结算里单独一栏，读的人一眼看得见"这条没判"。
 * 🔴 调用形状不对（少传实参 / 第 1 个不是记录 / code / why 类型不对）⇒ **抛**
 *    （`CASE-HOLD-ARITY` 等，见 `caseHoldCallProblem`），**不许**静默记成一条 HOLD、
 *    也不许让它长成 `TypeError` 形状的产品红。`HCA-01` 守这一条。
 *
 * `opts.kind`（第四参，可选；`SHN-01` 的结算行读它）：
 *   · `'case'`（缺省）—— 被测对象 / 判据自己的问题；
 *   · `'environment'` —— **环境给不给**的问题（副本没有数据根、没有来历、宿主读数不在、见证根不在盘上……）。
 * 白名单之外的值按 `'case'` 记（多写的值不许把 kind 变成第三档）。
 *
 * @param {object} rec  `runCase` 给的记录（`rec.holds` 就是出口）
 * @param {string} code 短码（稳定、可 grep）
 * @param {string} why  为什么这一档不适用（人话）
 * @param {{kind?: 'case'|'environment'}} [opts]
 */
export function caseHold(rec, code, why, opts = {}) {
  const shape = caseHoldCallProblem({ argc: arguments.length, rec, code, why })
  if (shape !== null) throw new CaseHoldShapeError(shape, callerFrameOfCaseHold())
  const kind = opts !== null && typeof opts === 'object' && opts.kind === 'environment' ? 'environment' : 'case'
  const entry = { code, why, kind, at: new Date().toISOString() }
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
 * `SKIP`：**顶层**的 `.runtime/` 是**数据**（真实记忆库），不是代码 —— 它**本来就不该**同步进 staging
 * （活体 55 份代码 / staged 55 份，差的那 165 份全是它）。拿它当"漂移"就是每天都红的假红。
 * 🔴 **排除集只有一份来源**：`FROZEN.targetLag.dataSegments`（这是 `E7`；从前这里是手写的
 *    `new Set(['.runtime'])`，与 `env.mjs` 各写一份 ⇒ 一边加了 `.snapshot`、另一边没加，
 *    `STAT-01` 当场红，红因却指向"两棵树不同步"）。返回值里的 `skip` 只是**读数**；
 *    判据在 `STAT-01` 那边按**行为**钉：临时往那个来源里加一段，这把尺子必须立刻跳过它
 *    （读数可以撒谎 —— 手写字面量照样能报出那个数组）。
 * 🔴 **只跳过顶层那一段**（`E8`）：`lib/.runtime/x` 是**代码**，按目录名在任何深度跳
 *    = 给代码开一个不被看见的洞（同一课见 `.tools/fingerprint.mjs:26-27` 与 `:92`：
 *    那边按**根相对前缀**排，`lib/.runtime/…` 照样算代码）。
 *
 * `liveRoot`：活体那一棵树（缺省 = `PATHS.finalPreset`）。它存在是为了**夹具** ——
 *   两棵树都得能指到一根临时根上，否则"两侧都读得到、但都是 0 份文件"那一格造不出来（`F-141`）。
 *
 * @param {object} [env]  `AGENIA_STAGING_PRESET` 从哪儿读（缺省 `process.env`）
 * @param {{liveRoot?: string, minFiles?: number|null}} [options]
 *   `minFiles`（`F-140`）：**份数下限**，由**调用方**给（它知道两棵树本该有多少份文件）。
 *   不给 ⇒ 这一关不判（`floor: null`，读数里看得出来）。
 * @returns {{staged:string|null, live:string, staged_files:number, live_files:number,
 *            only_staged:string[], only_live:string[], different:string[], same:boolean,
 *            skip:string[], floor:{min_files:number,staged_ok:boolean,live_ok:boolean}|null, note:string}}
 */
export function stagedVsLiveDrift(env = process.env, { liveRoot = PATHS.finalPreset, minFiles = null, onReadError = 'record' } = {}) {
  const dataSegments = FROZEN.targetLag.dataSegments
  const SKIP = new Set(dataSegments)
  const live = canonical(liveRoot)
  const stagedRaw = optionalEnv(ENV.STAGING_PRESET, env)
  const staged = stagedRaw ? canonical(stagedRaw) : null
  /**
   * 枚举一棵树（`bug-20261107-02`）：读不动的一块**记下来**，不再抛、也不再静默变短。
   * `onReadError` 的三个值见 `support/tree-read.mjs` 的模块头：`record`（默认）/ `drop` / `throw`。
   * 后两个只给刀用（它们各自是旧的两个形态：一个静默丢掉、一个抛出去）。
   */
  const walkOf = (root) => {
    const out = new Map()
    const failures = []
    const fail = (rel, err, kind) => {
      if (onReadError === 'throw') throw err
      if (onReadError === 'drop') return
      failures.push(readFailureOf(rel, err, kind))
    }
    if (root === null || !existsSync(root)) return { files: out, failures }
    const go = (dir, depth) => {
      let names = []
      try {
        names = readdirSync(dir).sort()
      } catch (err) {
        // 目录列不出来 ⇒ 这一整棵子树没看见（不是"里面没有文件"）
        fail(path.relative(root, dir).replace(/\\/g, '/') || '.', err, 'dir')
        return
      }
      for (const name of names) {
        if (depth === 0 && SKIP.has(name)) continue
        const full = path.join(dir, name)
        const rel = path.relative(root, full).replace(/\\/g, '/')
        let st = null
        try {
          st = statSync(full)
        } catch (err) {
          fail(rel, err, 'stat')
          continue
        }
        if (st.isDirectory()) go(full, depth + 1)
        else if (st.isFile()) {
          let buf = null
          try {
            buf = readFileSync(full)
          } catch (err) {
            fail(rel, err, 'file')
            continue
          }
          out.set(rel, { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') })
        }
      }
    }
    go(root, 0)
    return { files: out, failures }
  }
  const a = walkOf(staged)
  const b = walkOf(live)
  const onlyStaged = [...a.files.keys()].filter((k) => !b.files.has(k)).sort()
  const onlyLive = [...b.files.keys()].filter((k) => !a.files.has(k)).sort()
  const different = [...a.files.keys()].filter((k) => b.files.has(k) && (a.files.get(k).sha256 !== b.files.get(k).sha256 || a.files.get(k).bytes !== b.files.get(k).bytes)).sort()
  /**
   * 🔴 `same` 必须**先有样本**再谈"相同"（`F-141`）：三张差集为空只说明"没发现差异"，
   * 不说明"比过东西" —— 两棵树都读得到、各 0 份文件时差集全空，只看差集就会判"相同"
   * （那是替两棵空树背书，"测试的靶子 = 生产"那一格会因此变绿）。
   * 所以：任一侧 0 份 ⇒ `same: false`；两侧都非空且差集全空 ⇒ `same: true`；
   * `staged === null`（`AGENIA_STAGING_PRESET` 没设）也是 false —— 判不了不是相同。
   */
  const haveSamples = a.files.size > 0 && b.files.size > 0
  /**
   * 🔴 `F-140`：`haveSamples` 只挡住"0 份"，挡不住"一起变短" —— 48 份缩成 3 份、内容还对得上时，
   * 三张差集同样全空 ⇒ 只看差集/样本就会判 `same: true`，等于替一棵**缩水过的树**背书。
   * 下限由调用方给（它知道本该有多少份）；本函数不编常数。`null` = 这一关不判，
   * 读数里明写 `floor: null`（"没判"不许长得像"判过"）。
   */
  const floor = Number.isFinite(minFiles)
    ? { min_files: minFiles, staged_ok: a.files.size >= minFiles, live_ok: b.files.size >= minFiles }
    : null
  const floorOk = floor === null || (floor.staged_ok && floor.live_ok)
  /**
   * 🔴 **读不到的一块**（`bug-20261107-02`）：两侧各自折成 `tree-read.mjs` 那一个形状；
   * `same` 必须在 `read_ok` 之后才算成立 —— "有一块我没看见"不是"没发现差异"。
   * 读数里同时留 `missing_dirs` / `missing_files` / `missing_paths`（**点名**到路径与错误码）。
   */
  const readFailures = { staged: foldReadFailures(a.failures), live: foldReadFailures(b.failures) }
  const readOk = readFailures.staged.read_ok && readFailures.live.read_ok
  return {
    staged,
    live,
    staged_files: a.files.size,
    live_files: b.files.size,
    only_staged: onlyStaged,
    only_live: onlyLive,
    different,
    same: staged !== null && readOk && haveSamples && floorOk && onlyStaged.length === 0 && onlyLive.length === 0 && different.length === 0,
    /** 读不到的路径（两侧各一份，形状与 `measureTarget().read_failures` **同一份**）。 */
    read_failures: readFailures,
    read_ok: readOk,
    missing_dirs: [...readFailures.staged.missing_dirs, ...readFailures.live.missing_dirs],
    missing_files: [...readFailures.staged.missing_files, ...readFailures.live.missing_files],
    missing_paths: [...readFailures.staged.missing_paths, ...readFailures.live.missing_paths],
    read_failures_line: `靶子：${describeReadFailures(readFailures.staged.list)} · 现役：${describeReadFailures(readFailures.live.list)}`,
    /** 排除集 —— `FROZEN.targetLag.dataSegments`（**读数**：这一跑用的是哪一份；`STAT-01` 判的是**行为**，不是这个字段）。 */
    skip: dataSegments,
    floor,
    note: '比的是**两棵树**（跳过**顶层** `.runtime/` = 数据，不是代码；`lib/.runtime/…` 照样比）；差一个字节就算漂移；'
      + '**两侧都得有样本**（任一侧 0 份文件 ⇒ `same: false` —— 零样本不是"相同"）；'
      + '**给了份数下限时两侧都得够**（`F-140`：一起缩水不是"相同"；`floor: null` = 这一关没判）；'
      + '**读不到的路径**记进 `read_failures`（`same` 必为 false）—— 读不到 ≠ 没有',
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
  // 🔴 **`R-5`**：`_preflight` 也记**测试树**（尺子本身）在**开跑那一刻**的指纹 ——
  //    收口那份 `sources` 是"跑完之后"量的，冒充不了"这一跑加载的是哪一版"。
  //    与 `settled` 侧 `test_tree` 比一次，`same` 才是"跑的是交付那版"的落点。
  const tt = testTreeDigest()
  out.test_tree_sha256 = tt.sha256
  out.test_tree_files = tt.files
  out.test_tree = { at: tt.at, manifest: tt.manifest }
  // **T-R1-04**：`_preflight` 也记"staged vs 活体"的两棵树读数（**只记不判** —— 判在 STAT-01 那条用例上）。
  // 记在这儿的好处：每一跑（含定向跑）的 `_preflight` 里都留下"那一刻两棵树是什么"，可复现。
  out.staged_vs_live = (() => {
    const d = stagedVsLiveDrift()
    return {
      same: d.same,
      staged_files: d.staged_files,
      live_files: d.live_files,
      only_staged: d.only_staged,
      only_live: d.only_live,
      different: d.different,
      /** `bug-20261107-02`：预检这一份也不许把"读不到"藏掉（`read_ok:false` 时 `same` 必为 false）。 */
      read_ok: d.read_ok,
      missing_dirs: d.missing_dirs.map((f) => f.rel),
      missing_files: d.missing_files.map((f) => f.rel),
      missing_paths: d.missing_paths.map((f) => f.rel),
    }
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

/**
 * 两相位对照（结算那一行 / 契约 §2.4 第 5 条）。
 *
 * 🔴 两格**不是同一个判据**（2026-11-07 MF-1）：
 *   · `brain`：**路径集合**差集 —— 内容变是合法变化，不报（细节见 `treePaths`）；
 *   · `route`：**内容哈希** —— 真实路线根只有本会话写。
 * `brain` 那一格的覆盖边界由 `real_roots.content_uncovered` 同批报出，别把"差异无"读成"脑根没被写"。
 */
export function realRootsDiff(before, after) {
  const diffs = []
  const brain = pathSetDiff(before?.brain, after?.brain)
  if (brain === null) diffs.push('brain：（缺一相位或快照形状不对，判不了）')
  else if (brain.exists.before !== brain.exists.after) diffs.push(`brain：存在性 ${brain.exists.before} → ${brain.exists.after}`)
  else if (!brain.same) diffs.push(`brain：路径集合变了（${pathSetSummary(brain)}）`)
  for (const key of ['route']) {
    const b = before[key]
    const a = after[key]
    if (b.exists !== a.exists) diffs.push(`${key}：exists ${b.exists} → ${a.exists}`)
    else if (b.exists && b.sha256 !== a.sha256) diffs.push(`${key}：树哈希 ${b.sha256} → ${a.sha256}`)
  }
  return diffs
}

/**
 * 🔴 **覆盖边界只有一份**（`bug-20261107-06`）：这段话从前有两份手维护的副本
 * （`DR-02` 的 `rec.readings.real_roots.content_uncovered` 与 `settle()` 里的一个字面量），
 * 一处改、两处不一致不会有人知道。现在：
 *   · `DR-02` 把**这一个对象**写进它的读数；
 *   · 结算**从 `DR-02` 的 `result.json` 里读回来**（`dr02WitnessReading()`），不再自带字面量。
 * ⇒ 删掉 `DR-02` 的读数这一节，覆盖边界那一行就跟着红（`SETTLE-DR02-CONTENT-UNCOVERED-MISSING`）。
 */
export const REAL_ROOTS_CONTENT_UNCOVERED = Object.freeze({
  root: 'brain',
  what: '已存在文件被就地覆盖（内容改、路径不变）',
  note: '`brain` 的见证是**路径集合**（新增 / 删除）；已存在文件被就地覆盖（内容改、路径不变）不在这条判据的覆盖范围。',
  covered_by: ['DR-01 --real-mode ⇒ E_ROOT_REAL_BRAIN'],
  cli_inventory: 'lib/cli-inventory.mjs 只是枚举命令，不判它会写哪儿 —— 不是闸',
  residual_false_positive: '别的会话在窗口内新增 / 删除路径会被判成 SECURITY-VIOLATION（假红，不是假绿）',
})

/** 见证记录的落点（`<证据根>/DR-02/result.json`）—— 结算侧读 DR-02 的唯一入口。 */
export const DR02_WITNESS_ID = 'DR-02'

/**
 * **读 `DR-02` 的读数**（结算侧的文件外读者；`bug-20261107-06` / `-07`）。
 *
 * 为什么需要它：`DR-02` 的 `rec.readings.real_roots` 以前**文件外没有读者** ——
 * 把 §④ 那一段（连同它的最后一道守卫）整段删掉，结算行照旧印「差异=无」。
 * 现在结算这一侧读这份读数，缺了就说缺了。
 *
 * 三态分开（**不许混**）：
 *   · `present:false` ⇒ **这一跑没跑到 DR-02**（分批跑的正常形态）—— 结算行写"判不了"，不罚退出码；
 *   · `present:true` + 读数/守卫读数缺 ⇒ **红**（`SETTLE-DR02-*`）—— 有人删了见证或它的守卫；
 *   · `present:true` + 读数齐 ⇒ 按 `GREEN` / `HOLD` / `RED` 各说各的话（HOLD 判不了、RED 不重复判）。
 */
export function dr02WitnessReading({ evidenceDir = evidenceRoot() } = {}) {
  const file = path.join(evidenceDir, DR02_WITNESS_ID, 'result.json')
  const empty = {
    file,
    present: false,
    reason: 'case-not-run',
    case_result: null,
    problems: [],
    holds: [],
    real_roots: null,
    guard: null,
  }
  if (!existsSync(file)) return empty
  let rec = null
  try {
    rec = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { ...empty, present: true, reason: `读数读不出来（${String(err?.message ?? err).slice(0, 200)}）` }
  }
  const rs = rec?.readings?.real_roots
  const rsObj = rs !== null && typeof rs === 'object' ? rs : null
  const wins = Array.isArray(rsObj?.windows) ? rsObj.windows : null
  const guard = rec?.readings?.dr02_witness_outside
  const guardObj = guard !== null && typeof guard === 'object' ? guard : null
  return {
    file,
    present: true,
    reason: null,
    case_result: rec?.result ?? null,
    problems: (rec?.problems ?? []).map((p) => p?.code ?? null),
    holds: (rec?.holds ?? []).map((h) => ({ code: h?.code ?? null, why: String(h?.why ?? '').slice(0, 400) })),
    real_roots: rsObj === null ? null : {
      keys: Object.keys(rsObj),
      baseline_brain_count: typeof rsObj?.baseline?.brain?.count === 'number' ? rsObj.baseline.brain.count : null,
      windows_total: wins === null ? null : wins.length,
      windows_judged: wins === null ? null : wins.filter((w) => w?.judged === true).length,
      has_content_uncovered: rsObj?.content_uncovered !== null && typeof rsObj?.content_uncovered === 'object',
      content_uncovered: rsObj?.content_uncovered ?? null,
    },
    guard: guardObj === null ? null : {
      real_roots_present: guardObj.real_roots_present === true,
      guards_present: guardObj.guards_present === true,
      keys: Object.keys(guardObj),
    },
  }
}

/**
 * 结算的「真实根前后」那一节：**两相位差异 + DR-02 的见证读数**，**一个来源**。
 *
 * 两件事分开（别混着读）：
 *   · `diff` = 整跑两相位（`_preflight/real-roots.{before,after}.json`）的差集；
 *   · `dr02` = **跑中**每个 CLI 子调用窗口的见证（`DR-02` 的读数）。
 * 结算行由这两个**一起**说，缺 DR-02 的读数时**整行判不了**（不是"差异无"）。
 */
export function settlementRealRoots({ before, after, dr02 }) {
  const diff = before && after ? realRootsDiff(before, after) : null
  const witness = dr02 ?? { present: false, reason: 'case-not-run', file: null, case_result: null, problems: [], holds: [], real_roots: null, guard: null }
  const problems = []
  let witnessState = 'not-run'
  if (witness.present !== true) {
    witnessState = 'not-run'
  } else {
    /**
     * 🔴 **先查"读数在不在"（结构），再看病例的判词** —— 顺序是刻意的：
     *    只按 `case_result === 'RED'` 分流，会把"见证被整段删掉"与"见证跑了但量出了红"混成一件事；
     *    而"守卫被单独删掉"那种形态，病例自己甚至是 GREEN，只有结构检查抓得到。
     */
    if (witness.real_roots === null) {
      problems.push(problem('SETTLE-DR02-WITNESS-READING-MISSING',
        `DR-02 本跑的 result.json 里没有 \`readings.real_roots\`（${witness.file}${witness.reason ? ` · ${witness.reason}` : ''}）—— `
        + '结算这一行必须读它；读数不在时**不许**再自己拼一份"差异=无"'))
    }
    if (witness.guard === null) {
      problems.push(problem('SETTLE-DR02-GUARD-READING-MISSING',
        `DR-02 的 result.json 里没有 \`readings.dr02_witness_outside\`（${witness.file}）—— 段外兜底那一格`
        + '（`DR02-WITNESS-READINGS-UNGUARDED`）的读数不见了：守卫可能和被守的那一段一起被删了'))
    } else if (!witness.guard.real_roots_present || !witness.guard.guards_present) {
      problems.push(problem('SETTLE-DR02-GUARD-READING-MISSING',
        `DR-02 的段外兜底读数说自己没写全（real_roots_present=${witness.guard.real_roots_present} · guards_present=${witness.guard.guards_present}）—— 守卫的判决没有出口`))
    }
    if (witness.real_roots !== null) {
      if (!witness.real_roots.has_content_uncovered) {
        problems.push(problem('SETTLE-DR02-CONTENT-UNCOVERED-MISSING',
          `DR-02 的读数里没有 \`real_roots.content_uncovered\`（键=${JSON.stringify(witness.real_roots.keys)}）—— 覆盖边界只有一份，它必须由 DR-02 写下来、结算读回来`))
      }
      /**
       * ⚠️ **HOLD 时窗口本来就没判**（见证根不在盘上的合法形态）⇒ 不许拿"没判全"再记一条红。
       * HOLD 的语义是"这一档判不了"，已经在结算的 HOLD 栏里；这里只把它的读数要求留在上面两条。
       */
      if (witness.case_result !== 'HOLD') {
        const total = witness.real_roots.windows_total
        const judged = witness.real_roots.windows_judged
        if (!(typeof total === 'number' && total > 0 && judged === total)) {
          problems.push(problem('SETTLE-DR02-WINDOWS-UNJUDGED',
            `DR-02 的见证窗口没判全：${judged === null ? '(没有 windows 读数)' : `${judged}/${total}`}（窗口 ${total === null ? '?' : total} 个）—— `
            + '空窗口不是"都没变"，是"没看"'))
        }
      }
    }
    if (witness.case_result === 'RED') {
      witnessState = 'case-red'
      problems.push(problem('SETTLE-DR02-CASE-RED',
        `DR-02 本跑自己 **RED**（${(witness.problems ?? []).join(' / ') || '(无码)'}）—— 见证的判决没通过，这一行不许读成"差异=无"`))
    } else if (witness.case_result === 'HOLD' && problems.length === 0) {
      witnessState = 'hold'
    } else if (problems.length === 0) {
      witnessState = 'green'
    } else {
      witnessState = witness.real_roots === null ? 'reading-missing' : witness.guard === null ? 'guard-reading-missing' : 'reading-incomplete'
    }
  }
  return {
    before: before ?? null,
    after: after ?? null,
    diff,
    security_violation: diff === null ? null : diff.length > 0,
    source: DR02_WITNESS_ID,
    dr02: witness,
    witness_state: witnessState,
    /** `true` = 见证真的判过且没毛病；`false` = 判过但读数缺/病例红；`null` = 这一档本来就不适用（没跑到 / HOLD）。 */
    witness_ok: witness.present !== true || witnessState === 'hold' ? null : problems.length === 0,
    problems,
    content_uncovered: witness.real_roots?.content_uncovered ?? null,
    /** 这一行的来源读数（`definition` = 唯一的人写载体；`printed_from` = 本跑的 DR-02 读数路径）。 */
    content_uncovered_source: contentUncoveredSource(witness),
  }
}

/** `settlement.md` 的「真实根前后」那一行（**读者 = DR-02**；红的时候整行 🔴）。 */
export function realRootsSettlementLine(rr) {
  const twoPhase = `两相位 before=${rr.before ? '有' : '缺'} · after=${rr.after ? '有' : '缺'} · 差异=${rr.diff === null ? '（判不了：缺一相位）' : rr.diff.length === 0 ? '**无**' : `**有**：${rr.diff.join('；')}`}`
  const head = '真实根前后（读者 = DR-02 的读数）'
  const w = rr.dr02 ?? {}
  if (w.present !== true) return `- ${head}：**判不了** —— DR-02 本跑没跑到（\`${w.file ?? '(未给)'}\` 不在）· ${twoPhase}`
  // 🔴 有红因就先说红因（覆盖"见证被删 / 守卫被删 / 窗口没判 / 病例自己红了"四种）
  if (rr.problems.length > 0) {
    return `- 🔴 ${head}：**判不了** —— ${rr.problems.map((p) => `[${p.code}] ${String(p.message).split('\n')[0]}`).join('；')} · ${twoPhase}`
  }
  if (w.case_result === 'HOLD') {
    const why = (w.holds ?? []).map((h) => `${h.code}：${h.why}`).join('；') || '(未给理由)'
    return `- ${head}：**判不了** —— DR-02 本跑 **HOLD**（${why}）· ${twoPhase}`
  }
  return `- ${head}：DR-02 见证 **${w.real_roots.windows_judged}/${w.real_roots.windows_total} 窗口已判** · brain 基线 **${w.real_roots.baseline_brain_count}** 路径 · ${twoPhase}`
}

/**
 * 结算的 `real_roots.content_uncovered_source`：**这一行是从哪儿读回来的**（读数，不是断言）。
 *   · `definition` = 那份唯一的**人写**载体（本文件里的常量；`SELF_REL` 由 `import.meta.url` 量出来）；
 *   · `printed_from` = 这一跑的 `DR-02/result.json`（绝对路径，来自读数本身）。
 * ② 与 ③ 不再各自维护一份人话：`DR-01` / `DR-02` 都**展开**那个常量，本行按字段原样打印（`coverage-line.mjs`）。
 */
function contentUncoveredSource(witness) {
  if (!witness?.real_roots?.has_content_uncovered) return null
  return {
    definition: `${SELF_REL}#REAL_ROOTS_CONTENT_UNCOVERED`,
    printed_from: witness.file ?? null,
  }
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

/**
 * 🔴 **`R-5`（2026-10-20 第 4 关）：这一跑执行的是**哪一版尺子**。
 *
 * 病根：预检只哈希 **preset 树**（`staged_tree_sha256`），而"测试代码本身"只有**收口那一刻**的
 * `sources`（`sourceInventory()` 在 `settle()` 里现算）—— 那是跑完之后量到的树，
 * 冒充不了"开跑那一刻 `node --test` 加载的是哪一版"。
 * 评审就是靠这一点说明"`RED 0` 那一跑覆盖不了一次 5 分钟之后的改动"。
 *
 * 所以：**预检也算一次**（落进 `_preflight/preflight.<pid>.json`），收口再算一次、
 * 与**最早那份预检**比，得出 `test_tree.same`：
 *   · `true`  ⇒ 这一跑里测试树没动过 ⇒ "跑的是交付那版"这一格**有落点**；
 *   · `false` ⇒ 中途被改过（或两棵树不是同一棵）⇒ 收口那份 `sources` **不能**代表"跑的那版"，
 *                `differ` 点名是哪几个文件；
 *   · `null`  ⇒ 判不了（盘上没有带测试树指纹的预检 —— 老 run-root）。
 *
 * 指纹 = 逐文件 `rel:sha256` 按路径排序拼起来再 sha256 一次（只吃内容，不吃 mtime/字节数）。
 */
export function testTreeDigest() {
  const files = sourceInventory()
  const lines = files.map((f) => `${f.rel}:${f.sha256}`).join('\n')
  return {
    at: new Date().toISOString(),
    files: files.length,
    sha256: sha256Text(lines),
    manifest: files.map((f) => ({ rel: f.rel, sha256: f.sha256 })),
  }
}

/** 盘上最早那份**带测试树指纹**的预检（多个测试文件各写一份，取 `at` 最小的）。 */
function earliestTestTreePreflight() {
  const dir = path.join(evidenceRoot(), '_preflight')
  if (!existsSync(dir)) return null
  let first = null
  for (const name of readdirSync(dir)) {
    if (!/^preflight\..*\.json$/.test(name)) continue
    try {
      const p = JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
      if (typeof p.test_tree_sha256 !== 'string') continue
      if (first === null || String(p.at) < String(first.at)) first = p
    } catch {
      // 坏掉的一份不该让收口崩：跳过它，别的预检还在
    }
  }
  return first
}

/** 收口侧：把"现在这棵树"与"开跑那一刻那棵树"比一次。 */
export function testTreeComparison() {
  const now = testTreeDigest()
  const first = earliestTestTreePreflight()
  const prev = new Map((first?.test_tree?.manifest ?? []).map((f) => [f.rel, f.sha256]))
  const cur = new Map(now.manifest.map((f) => [f.rel, f.sha256]))
  const differ = []
  // 没有预检 ⇒ **没比过**，`differ` 留空（别把"盘上每一份"都列成差异，那会被读成"全变了"）。
  if (first !== null) {
    for (const [rel, sha] of cur) if (prev.get(rel) !== sha) differ.push(rel)
    for (const [rel] of prev) if (!cur.has(rel)) differ.push(rel)
    differ.sort()
  }
  return {
    settle_sha256: now.sha256,
    settle_files: now.files,
    preflight_at: first?.at ?? null,
    preflight_sha256: first?.test_tree_sha256 ?? null,
    preflight_files: first?.test_tree_files ?? null,
    /** `null` = 判不了；`true` = 这一跑里尺子没动过。 */
    same: first === null ? null : first.test_tree_sha256 === now.sha256,
    differ,
  }
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
  /**
   * 🔴 **`bug-20261107-06`**：结算的「真实根前后」不再自己拼 —— 它**读 `DR-02` 的读数**
   * （两相位差异 + 跑中见证，一个来源）。读数缺了/守卫读数缺了 ⇒ `problems` 非空 ⇒ 这一行红、退出码非零。
   * 以前 `DR-02` 的 `readings.real_roots` 文件外没有读者：把见证整段删掉，这一行照旧印「差异=无」。
   */
  const realRoots = settlementRealRoots({ before, after, dr02: dr02WitnessReading() })
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
  const reporterCheckOk = partialFiles.length === 0 && unexpected.length === 0 && red + green + holdCases.length === cases.filter((c) => c.settled).length && discoveryProblems.length === 0
  /**
   * 🔴 **`F-106`**：这一跑的平台版本 —— **读数**，不是判据（不进 `reporter_check_ok`、不改退出码）。
   * 它只回答"上面那些 `sources` / `test_tree` / `staged_tree_sha256` 是**对着哪一版平台**量的"。
   * ⚠️ 判不了时这里照样有一节（`ok:false` + `problems`）——"没有这一节"和"读不出来"是两件事。
   */
  const platform = platformReading()
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
    /** 报告器核对（三条一起看：文件内缺结算 / 跑到未写的 / HOLD 计数守恒 / 登记=盘上）。 */
    reporter_check_ok: reporterCheckOk,
    /**
     * 🔴 结算自己算不算数：报告器核对通过 **且** 「真实根前后」那一节没有红因。
     * 退出码认这一个（`--settle` 那一段）—— 结算说"不通过"就必须非零（F-43 / F-57）。
     */
    settlement_ok: reporterCheckOk && realRoots.problems.length === 0,
    full_coverage: missing.length === 0,
    /**
     * 安全不变量：真实脑 / 真实路线前后必须同值（契约 §2.4 第 5 条）。
     * 🔴 **同一来源**（`bug-20261107-06`）：`diff` 是两相位差集，`dr02` 是 `DR-02` 的读数；
     * 覆盖边界 `content_uncovered` **从 `DR-02` 的读数里读回来**（不再有第二份手写字面量）。
     */
    real_roots: realRoots,
    oracle: oracleReadings(),
    staging: stagingReadings(),
    /**
     * **T-RUN-1（追加裁定 v1.5）**：被测 staging 的树哈希**提升到顶层**，与 oracle SHA 并列 ——
     * 这一轮"被测的是哪一版"一眼可读、可复现（实现关会并发改 staging）。
     */
    staged_tree_sha256: stagingReadings().tree_sha256,
    staged_tree_files: stagingReadings().tree_files,
    sources: sourceInventory(),
    /** 🔴 **`R-5`**：这一跑**执行的是哪一版尺子** —— "开跑那一刻的测试树" vs "收口这一刻的测试树"。
     *    `same:true` 才让上面那份 `sources` 有资格代表"跑的那版"；`false` / `null` 都别拿它当基线。 */
    test_tree: testTreeComparison(),
    /** 🔴 **`F-106`**：这一跑**跑在哪个平台版本**上（读数，不进判词；判不了也有这一节）。
     *  `hardcoded_fallback:true` ⇒ 那两行是**本机兜底（硬编码路径）**读出来的，别当"换机器也可信"。 */
    platform: {
      ok: platform.ok, line: platformLine(platform), asar: platform.asar, source: platform.source,
      level: platform.level, hardcoded_fallback: platform.hardcoded_fallback,
      app: platform.app, dsh: platform.dsh, problems: platform.problems, tried: platform.tried,
    },
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
  lines.push(`- **平台版本（F-106）**：${s.platform?.ok ? '' : '🔴 **判不了** —— '}${s.platform?.line ?? '（这一节不在：这份 settlement 是老的）'}`)
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
  lines.push(realRootsSettlementLine(s.real_roots))
  lines.push(coverageSettlementLine(s.real_roots))
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
    console.log(`real-roots.${phase}: brain_paths=${snap.brain.exists ? snap.brain.count : 'ABSENT'} route=${snap.route.exists ? snap.route.sha256 : 'ABSENT'} livePreset=${snap.livePreset.exists ? snap.livePreset.sha256 : 'ABSENT'}`)
  } else {
    const s = settle()
    writeJson(path.join(evidenceRoot(), 'settlement.json'), s)
    writeText(path.join(evidenceRoot(), 'settlement.md'), settleMarkdown(s))
    console.log(`settlement: ${s.settled.red} RED / ${s.settled.green} GREEN / 分母 ${s.registry.total} / reporter_check_ok=${s.reporter_check_ok} / settlement_ok=${s.settlement_ok} / real_roots_diff=${s.real_roots.diff === null ? 'n/a' : s.real_roots.diff.length} / dr02_witness=${s.real_roots.witness_state} / real_roots_problems=${s.real_roots.problems.length}`)
    // 🔴 结算自己说"不通过" ⇒ 退出码必须非零（2）。恒 exit 0 会让"分母 + 全绿"那两句话谁都不负责（F-43 / F-57）。
    //    `settlement_ok` = 报告器核对 **且** 「真实根前后」那一节没有红因（读 DR-02 的读数）。
    process.exitCode = s.settlement_ok ? 0 : 2
  }
}
