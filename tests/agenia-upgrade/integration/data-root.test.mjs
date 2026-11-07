/**
 * DR-01 / DR-02 / DR-03 —— data-root 隔离与两根分舱（集成层）。
 *
 * 冻结依据：契约 §6.10 + §2.4（data-root 硬规则八条）+ 提案 §B1.4（三个 CLI 的 op 表 +
 * `--data-root` 必填 / `--workspace` / `--test-mode`）+ §B1.5（`dataRootVerdict` / `resolveWithin` / `testModeOf`）
 * + §B1.7（marker 三层 + 判定顺序 + canonical 解析）+ §B1.6（`bg-notify` 四个作业的投递接缝）。
 *
 * 三条口径：
 *   · **分母是清单**（`lib/cli-inventory.mjs` 的 `COMMANDS`）：清单没列的共享写命令不许存在；
 *     清单与冻结 op 表对不上也要红（新增 op 必须同批进清单、进测试）。
 *   · **正例必须存在**：只有"合法测试根写成功"这一侧过了，"拒绝"才不是"命令坏掉蒙对"（§9.5 第 1 条）。
 *   · 真实库前后**内容**随每个会碰它的子用例量（§2.4 第 5 条）：树哈希 + `audit.jsonl` 行数
 *     + `v0.json` 哈希；任何变化 = **安全违规**，不是普通红。
 *     ⚠️ **`DR-02` 的 `brain` 判据是路径集合，不是内容**（2026-11-07 MF-1）。真实脑根
 *     = `presets/agenia/.runtime`，它有多个**合法**的写入来源（别的 workspace 在同一个预设级共享
 *     数据根上干活 · `bg-notify` · 日常作业）⇒ 内容哈希会把别人的正常干活算到这一跑头上。
 *     覆盖边界（就地覆盖不判）写在 `DR-02` 的 `rec.readings.real_roots.content_uncovered` 里。
 *     🔴 **`DR-01` 在 2026-11-07（batch 8）**也换成了路径集合（`bug-20261106-20`）：内容哈希
 *     对 `.runtime` 是同一个病（合法 churn ⇒ 归因错）。它的两把刀（新建 ⇒ 红 / 只改内容 ⇒ 不红）
 *     在 ④c 那一段，残余风险写进 `rec.readings.real_brain.content_uncovered`。
 *     ⚠️ 两格的**窗口不同**：`DR-02` 每个 CLI 子调用一个窗口，`DR-01` 是整段用例一个窗口
 *     （读数里明写，别把两者的误报面读成一样）。
 *     ⚠️ `DR-02` 的见证**按 CLI 子调用开窗**（2026-11-07 MF-2）：不再拿一对快照夹整段用例（旧版 15.9 s），
 *     只夹真正碰 CLI 的子调用；输入形状另有一格钉住（`DR02-BRAIN-WITNESS-SHAPE`：`paths` 是数组、
 *     `count === paths.length`）—— `treeHash` 形状会让 `paths ?? []` 读成两个空集、④ 永远绿。
 *     ⚠️ 判据**不是**"它必须不存在"。旧断言 `existsSync(REAL_BRAIN_ROOT) ⇒ SECURITY-VIOLATION`
 *     的前提（"本轮真实根必须不存在"）**2026-10-15 已作废**：真实库那天起就是**真数据**。
 *     留着那条会变成"每天都红、而红的原因与有没有人写它无关"的假红。
 *     ⚠️ **同一条口径在真实路线上第二次发生**（2026-11-01）：`DR-03` 原来还有一条
 *     `existsSync(REAL_ROUTE_ROOT) ⇒ SECURITY-VIOLATION`，它的前提在组长 22:58 跑真 `bootstrap`
 *     那一刻死亡（`.team/route/current.json` 成了真数据）⇒ 该条**已退役**，护着真实路线的判据只剩
 *     「`DR-03` 期间前后同值」（本条 ④）。**不许把"它必须不存在"写回去。**
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 **死命令 —— 想给这个文件加用例的人，先读完这一段再动手**
 *
 *   **任何用例都不许让 `--real-mode`（或 `--op init-real`）+ 真实根 + `writes: true` 的 op 真跑起来。**
 *
 *   · 真实库 `E:\Harness\presets\agenia\.runtime` 是**真数据**：2026-10-15 有人亲手用 `--op init-real`
 *     把它开出来（exit 0），`.runtime\audit.jsonl` 里那两条 `init` / `init-real` 就是凭据。**它不是演练。**
 *   · `audit-append` 那种 op **光落一条审计**就把这个库的事写进去了；`init` 会把它重开一遍。
 *     一次"顺手加个用例"就能把真库烧掉，而且烧掉之后**看不出是测试干的**。
 *   · ⇒ **真实根那一侧只许跑只读 op**：`entry-count` / `state-read` / `health-read`。
 *   · ⇒ 写 op 只许出现在**「没给开关」**或**「根不是真实根」**的格子里；
 *     真要在一个"给了开关 + 真实根"的格子里放写 op，那是把真实库押在"闸不会坏"上 —— **禁止**。
 *   · ⇒ 那几条闸里，凡是"必须亲手碰真实根才看得见"的那一档，**一律改成纯函数断言**
 *     （`realInitVerdict` / `realModeVerdict` 都是**不摸盘**的纯函数，见下面的 ②b）。
 *     例：`init-real` 的「根必须不存在」那条一次性保护 ⇒ 纯函数注入 `exists:true` 来钉，
 *     绝不许拿盘上那个真根去撞。
 *   · 🔴 万一哪天真跑上了：**立即停测、如实报现场、别自己清理**（清理才是把它写坏的那一下）。
 *
 * ★ **端到端正例打在哪棵树上**（2026-10-22 补，读 ③b 那一段时要先知道这件事）：
 *   它打的**不是** staging 里那份 preset（那是开发副本、盘上没有 `.runtime` ⇒ 以前只能是 HOLD），
 *   而是 `support/installed.mjs` 在**运行根里**拷出来的一份"装好的预设"——
 *   靶子仍是副本**自己算出来的** `REAL_BRAIN_ROOT`，数据段由 `support/min-runtime.mjs` 摆在它上面。
 *   ⇒ 本节那条死命令（真实库只许跑只读 op）**一个字没松**：这条正例跑的三个 op 全是只读，
 *     而且它自己量前后树哈希；`presets/agenia` 与 `.tools/_staging` 都不在它的写面上。
 *
 * ★ **那份 `.runtime` 夹具是这条正例唯一的料**（`DR-01`，2026-10-25 配刀）：
 *   拿掉 `support/min-runtime.mjs` ⇒ 只有 `DR-01` 红（`MIN-RUNTIME-FIXTURE-MISSING`，报文点名那份文件与它摆的 8 份数据段），
 *   `DR-02` / `DR-03` 照旧绿、分母照旧 98；放回去 ⇒ 全绿（`_runs/dr01-*` 两跑）。
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
import { before, describe, test } from 'node:test'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN, PATHS, optionalEnv, requireEnv } from '../support/env.mjs'
import {
  caseFail,
  caseHold,
  pathSetDiff,
  pathSetShapeProblem,
  pathSetSummary,
  preflight,
  problem,
  realRootsSnapshot,
  runCase,
  runRoot,
  sha256File,
  stagingReadings,
  treeHash,
} from '../support/evidence.mjs'
import { canonical, driveOf, ensureMarkedDir, isUnc, REAL_BRAIN_ROOT, REAL_ROUTE_ROOT } from '../support/root-guard.mjs'
import { brainPaths, loadStagedModule, routePaths, runBrain, runCli, runRoute, stagingExists, writeFixture } from '../support/sut.mjs'
// 端到端正例的两块料（来历见各自的文件头）：
//   · `installed.mjs` —— 把 staged preset 拷成"装好的预设"（落在运行根里，staging 一个字节不动）
//   · `min-runtime.mjs` —— 那份最小 `.runtime`（数据段）的声明 / 落盘 / 自洽校验 / 抽走与还原
import { installedPreset, loadInstalledModule } from '../support/installed.mjs'

/**
 * 最小 `.runtime` 夹具（`support/min-runtime.mjs`）—— **端到端正例唯一的料**。
 *
 * 🔴 为什么是**动态** import，不是顶层 static import（`DR-01`，2026-10-25）：
 *    static import 一旦解析不到，**整份文件**（`DR-01` / `DR-02` / `DR-03`）连一条 `test()` 都注册不上，
 *    报出来的是 `ERR_MODULE_NOT_FOUND` + 结算"一条用例都没跑到"——
 *    读的人看不出"是哪一格缺了哪份夹具"，而 `DR-02` / `DR-03` 与这份夹具**根本无关**。
 *    ⇒ 现在：读得到就用；读不到就把 `MIN_RUNTIME_FIXTURE_MISSING` 这句话**点名到文件**
 *      （红因 `MIN-RUNTIME-FIXTURE-MISSING`，写在 DR-01 那一格的 `problems` 里），另两格照旧跑。
 *    「把这份文件拿掉 ⇒ DR-01 红、DR-02/03 仍绿、分母仍是 98；放回去 ⇒ 全绿」是这一票量过的刀。
 */
let MIN_RUNTIME_FIXTURE_MISSING = null
let MIN_RUNTIME_FIXTURE = null
try {
  MIN_RUNTIME_FIXTURE = await import('../support/min-runtime.mjs')
} catch (err) {
  MIN_RUNTIME_FIXTURE_MISSING = `${err?.code ?? 'IMPORT-FAILED'}: ${String(err?.message ?? err).slice(0, 300)}`
}
/** 夹具的五件导出（缺一件 ⇒ 当成"夹具读不到"：半个模块比没有更难查）。 */
const MIN_RUNTIME_EXPORTS = ['MIN_RUNTIME', 'materializeMinimalRuntime', 'verifyMinimalRuntime', 'quarantineRuntime', 'restoreQuarantinedRuntime']
if (MIN_RUNTIME_FIXTURE !== null) {
  const missingExports = MIN_RUNTIME_EXPORTS.filter((n) => typeof MIN_RUNTIME_FIXTURE[n] === 'undefined')
  if (missingExports.length > 0) {
    MIN_RUNTIME_FIXTURE_MISSING = `support/min-runtime.mjs 里少了导出：${missingExports.join(' / ')}`
    MIN_RUNTIME_FIXTURE = null
  }
}
const {
  MIN_RUNTIME,
  materializeMinimalRuntime,
  quarantineRuntime,
  restoreQuarantinedRuntime,
  verifyMinimalRuntime,
} = MIN_RUNTIME_FIXTURE ?? {}

before(() => {
  preflight()
})

/** 冻结 op 表 → `[{cli, op, writes, needsDataRoot}]`（DR-01 的第二个分母）。 */
const FROZEN_COMMANDS = Object.entries(FROZEN.ops).flatMap(([cli, ops]) =>
  ops.map(({ op, writes }) => ({ cli, op, writes, needsDataRoot: cli === 'agenia-brain.mjs' })),
)

function scenarioWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/**
 * 非法根姿势表（§2.4 第 3 条 + §B1.7 第 4 条：大小写/尾斜杠/`..`/junction 都要先 canonical 再判）。
 * 🔴 `realRoot` **由调用方给**，必须是**被测代码自己算出来的那个真实脑根**（`T-TEST-02` 的口径：
 *    靶子不许由用例注入）。以前这里写死 `PATHS.realBrainRoot`（活体那个）⇒ 被测树在 staging 时
 *    那些"真实脑根"格**判的不是同一个对象**，而且它们当时之所以安全，只因为"与 `--test-mode` 互斥"
 *    —— 那是"碰巧对"。换成 SUT 自己的根之后，拒它们的是**真实根那道闸本身**（不是 test-mode 那条）。
 */
function badRootPostures(realRoot) {
  const real = realRoot
  const reg = PATHS.stagedPreset
  const outside = path.join(PATHS.repo, '.tools', '_scratch', 'agenia-dr-outside')
  return [
    ['省略 --data-root', { mode: 'omit' }],
    ['空串', { mode: 'value', value: '' }],
    ['相对路径', { mode: 'value', value: 'brain-root' }],
    ['真实脑根（原样）', { mode: 'value', value: real }],
    ['真实脑根（大写盘符）', { mode: 'value', value: real.replace(/^E:/, 'e:') }],
    ['真实脑根（尾斜杠）', { mode: 'value', value: `${real}\\` }],
    ['真实脑根（`..` 绕一下）', { mode: 'value', value: path.join(real, '..', '.runtime') }],
    ['C 盘（非法姿势）', { mode: 'value', value: 'C:\\Windows\\Temp\\agenia-dr' }],
    ['UNC', { mode: 'value', value: '\\\\127.0.0.1\\share\\agenia-dr' }],
    ['运行根之外', { mode: 'value', value: outside }],
  ].map(([label, spec]) => ({ label, spec, real, reg }))
}

/**
 * 真实脑根的**安全违规**判定 —— 判的是**路径集合**，不是内容哈希（组长 2026-11-07 决定，
 * `决定-DR02的brain见证.md` §二/§三）：
 *
 *   · **抓什么**：`brain` 的路径集合（新增 / 删除）前后必须相等；差集非空 ⇒ `SECURITY-VIOLATION`
 *     并**点名**新增 / 删除了哪个路径。一次"迷路的写"最典型的结果就是多一个文件（或少一个）。
 *   · **不抓什么**：已存在文件的**内容变化** —— 它有好几个**合法**来源（别的 workspace 在同一个
 *     预设级共享数据根上干活、`bg-notify` 投递、日常作业），哈希分不清是谁写的
 *     ⇒ 拿它当"这一跑写了"的证据 = 间歇红 + 归因错（batch 7 评审 MF-1 的正是这条）。
 *     ⚠️ 覆盖边界：一次**就地覆盖**（内容改、路径不变）不在这里 —— 兜它的**只有** `--real-mode` 的
 *     `E_ROOT_REAL_BRAIN`（`DR-01`）。受控命令清单（`lib/cli-inventory.mjs`）只是**枚举**命令、
 *     不判它会写哪儿 —— **不是闸**。这段边界同批写进 `rec.readings.real_roots.content_uncovered`。
 *
 * 为什么要抽成函数：④c 的两把**副本刀**必须读**同一条比较** —— 刀响 = ④ 响。
 * 另写一份比较，刀证明的就只是"我另写的那份会响"。
 *
 * 🔴 **输入形状先判**（2026-11-07 MF-2）：`pathSetDiff` 遇到 `treeHash` 形状的快照会**算不出来**，
 * 这一层必须报**它自己的码**（`DR02-BRAIN-WITNESS-SHAPE`），不许落进"路径集合没变"。
 * 光靠差集返回 `null` 不够 —— 那会被读成"缺一相位"，仍然不是"产品被改回 `treeHash`"这句话。
 */
function brainWitnessViolation(before, after, label = 'DR-02 期间', { shapeCode = 'DR02-BRAIN-WITNESS-SHAPE' } = {}) {
  const shapeBefore = pathSetShapeProblem(before?.brain)
  const shapeAfter = pathSetShapeProblem(after?.brain)
  if (shapeBefore !== null || shapeAfter !== null) {
    return problem(shapeCode, `真实脑根见证的**输入形状**不对（${label}）：before=${shapeBefore ?? 'ok'} · after=${shapeAfter ?? 'ok'}`
      + ' —— 形状不对时"路径集合没变"根本算不出来（`paths ?? []` 会把 treeHash 两侧读成两个空集，④ 就永远绿）')
  }
  const diff = pathSetDiff(before?.brain, after?.brain)
  if (diff === null) return problem('SECURITY-VIOLATION', `真实脑根缺一相位（${label}）—— 判不了不许当绿`)
  if (diff.exists.before !== diff.exists.after) {
    return problem('SECURITY-VIOLATION', `真实脑根的**存在性**在${label}变了（${diff.exists.before} → ${diff.exists.after}）—— 立即停测并报事故`)
  }
  if (!diff.same) {
    return problem('SECURITY-VIOLATION', `真实脑根的**路径集合**在${label}变了（${pathSetSummary(diff)}）—— 立即停测并报事故，不许自行清理现场`)
  }
  return null
}

/**
 * 🔴 **真脑根（写保护见证）在哪** —— batch 8 评审 `M1`：**不从 `REPO_ROOT` 推**。
 *
 * 原来直接读 `PATHS.realBrainRoot`（= `REPO_ROOT/presets/agenia/.runtime`）。在**只读副本**里
 * 那个目录不存在 ⇒ 前后两个快照都是 `exists:false` ⇒ 路径集合"没变" ⇒ 这一格**绿**；
 * 两把刀拷出来的是空目录 ⇒ `knifeJudged:false` / `brainCells:[]`，而自守只判 `Array.isArray` ⇒ 照样绿。
 * ⇒ 现在：`AGENIA_LIVE_BRAIN_ROOT` **显式**给（评审副本 / worktree 必须给）；不给时回落到派生值
 *   （活树里逐字符相同、行为一字不改）。**根不在盘上 ⇒ 这一格记 HOLD（`DR01/02-BRAIN-WITNESS-ABSENT`），
 *   绝不是绿。** 读数里同批写 `source`（这一步是从哪来的）。
 *
 * ⚠️ **不许**用 `AGENIA_REPO_ROOT` 把整棵树钉回活树来"修"它：那会让 `MCR-03`（入口 / 尺子 / 体检
 * 脚本指副本）翻红 —— 那一格要的正是"根从这一跑自己推"。
 */
function brainWitnessRoot() {
  const raw = optionalEnv(ENV.LIVE_BRAIN_ROOT)
  if (raw !== null) return { root: canonical(raw), source: `env:${ENV.LIVE_BRAIN_ROOT}` }
  return { root: PATHS.realBrainRoot, source: 'derived:REPO_ROOT/presets/agenia/.runtime' }
}

/**
 * 把**真实脑根**拷进运行根（刀用的副本）—— 只读源树，真根一个字节都不碰。
 * 拷**全部**文件：脑根整棵就是数据，排除任何一段都是给"迷路的写"开一个洞。
 * `from` 缺省 = 派生值；`M1` 之后调用方把"显式给的那个见证根"传进来。
 */
function copyRealBrainForKnife(to, from = PATHS.realBrainRoot) {
  let files = 0
  const walk = (srcDir, dstDir) => {
    mkdirSync(dstDir, { recursive: true })
    for (const name of readdirSync(srcDir).sort()) {
      const src = path.join(srcDir, name)
      const dst = path.join(dstDir, name)
      const st = statSync(src)
      if (st.isDirectory()) walk(src, dst)
      else if (st.isFile()) { copyFileSync(src, dst); files += 1 }
    }
  }
  if (existsSync(from)) walk(from, to)
  else mkdirSync(to, { recursive: true })
  return { files, from }
}

/**
 * 活体预设的**安全违规**判定 —— 一把尺子，两处读：`DR-02` ④ 的真跑，和下面那把**副本刀**。
 *
 * 覆盖口径（组长 2026-11-06 决定，见 `.team/leader/2026-11-06/决定-DR02覆盖口径.md` §三）：
 * 哈希的是**整棵 `presets/agenia` 减去数据段**；数据段只有一个来源 `FROZEN.targetLag.dataSegments`，
 * 且只认**顶层**那一层（顶层 `.runtime` 是数据；`lib/.runtime/x` 是代码 —— `fingerprint.mjs:26-27`）。
 *
 * 为什么要抽成函数：那把刀要证明的是"**这一条比较**会响"，不是"我另写了一遍比较"。
 * 两处读同一个函数 ⇒ 刀响 = ④ 响。
 */
function livePresetViolation(before, after, label = 'DR-02 期间') {
  const b = before?.livePreset
  const a = after?.livePreset
  if (!b || !a) return problem('SECURITY-VIOLATION', `活体预设缺一相位（${label}）—— 判不了不许当绿`)
  if (b.exists !== a.exists) return problem('SECURITY-VIOLATION', `活体预设的存在性在${label}变了（${b.exists} → ${a.exists}）`)
  if (b.sha256 !== a.sha256) {
    return problem('SECURITY-VIOLATION', `活体预设树哈希在${label}变了（${b.sha256} → ${a.sha256}）—— 立即停测并报事故`)
  }
  return null
}

/**
 * 把**会被哈希的那一层**拷进运行根（刀用的副本）—— 顶层数据段**不拷**（它正是被排除的东西，
 * 由用例在副本里自己摆一份，好让"数据变了而哈希不变"这一格量得到）。
 * 只读源树；返回拷了多少份、跳了哪几个顶层名字。
 */
function copyLivePresetForKnife(to) {
  let files = 0
  const walk = (srcDir, dstDir) => {
    mkdirSync(dstDir, { recursive: true })
    for (const name of readdirSync(srcDir).sort()) {
      const src = path.join(srcDir, name)
      const dst = path.join(dstDir, name)
      const st = statSync(src)
      if (st.isDirectory()) walk(src, dst)
      else if (st.isFile()) { copyFileSync(src, dst); files += 1 }
    }
  }
  mkdirSync(to, { recursive: true })
  const skipped = []
  for (const name of readdirSync(PATHS.finalPreset).sort()) {
    if (FROZEN.targetLag.dataSegments.includes(name)) { skipped.push(name); continue }
    const src = path.join(PATHS.finalPreset, name)
    const dst = path.join(to, name)
    const st = statSync(src)
    if (st.isDirectory()) walk(src, dst)
    else if (st.isFile()) { copyFileSync(src, dst); files += 1 }
  }
  return { files, skipped }
}

describe('integration · data-root (DR)', () => {
  test('DR-01 命令清单 × 五种姿势：非法一律非零退出零写入（合法根必须写成功）', async () => {
    await runCase('DR-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      // 真实库的**写保护见证**（2026-11-07 起是**路径集合**，不是内容哈希；见下面 `brainPathsOf`）——
      // 只读，见 support/evidence.mjs。
      // 🔴 **这一个根是"写保护见证"，不是"靶子"**（2026-10-16 分清，技术评审 F2 / 票 `T-TEST-02`）：
      //    · **见证**：它是**活体**那个真库（`E:\Harness\presets\agenia\.runtime`），跑前跑后逐字比
      //      ⇒ 判"有没有人把它写坏"。它**永远**是活体那个，不跟着被测树走。
      //    · **靶子**：根判定那几组要喂进去的根，必须是**被测代码自己算出来的**那个
      //      （`<staging>/.runtime`，从 staged `lib/paths.mjs` 的 `REAL_BRAIN_ROOT` 读）
      //      —— 口径由组长拍死：**不许由用例注入**。让用例把活体那个根喂进去，
      //      等于**把答案告诉被测者**；那样就算绿了，也证明不了"它在自己的位置上算得对"。
      //    ⇒ 两者**不是同一个对象**，别再合并成一个常量。
      const witness = brainWitnessRoot()
      const realRoot = witness.root
      /**
       * 🔴 **`DR-01` 的见证也是路径集合，不是内容哈希**（`bug-20261106-20`；与 `DR-02` 同一个病）。
       *
       * 2026-11-07 之前这里读的是 `realRootContent()`（整树哈希 + audit 行数 + v0 哈希）——
       * 而 `.runtime` 的内容**会合法地变**（本会话的作业/状态/报告 · 别的 workspace 在同一个
       * 预设级共享数据根上干活 · `bg-notify` 投递）⇒「内容变了」不等于「这次测试写了」，
       * 归因是错的。见证换成 **路径集合**（新增 / 删除）；就地覆盖不判，残余风险写在读数里
       * （`rec.readings.real_brain.content_uncovered`）。
       *
       * 快照**走产品那条路**（`realRootsSnapshot({ brainRoot })`）—— 刀与真跑的构造是同一份代码，
       * 自己 `treePaths()` 另造一份正是"产品改回 `treeHash` 整套仍绿"的藏身处（batch 7 `MF-2`）。
       */
      const brainPathsOf = (brainRoot = realRoot) => realRootsSnapshot({ brainRoot }).brain
      const brainDiff = (before, after, label) => brainWitnessViolation({ brain: before }, { brain: after }, label, { shapeCode: 'DR01-BRAIN-WITNESS-SHAPE' })
      const summarizeBrain = (b) => ({
        path: b.path,
        exists: b.exists,
        count: typeof b.count === 'number' ? b.count : null,
        /** 形状不对（例如有人把 `brain` 改回 `treeHash`）时这里是 `null`，**不许**在这里抛（那是脚手架红）。 */
        sample: Array.isArray(b.paths) ? b.paths.slice(0, 5) : null,
      })
      const realBefore = brainPathsOf()
      /**
       * 🔴 **`M1`：见证根不在盘上 ⇒ 判不了，记 HOLD（绝不是绿）。**
       * 只读副本 / worktree 里没有 `presets/agenia/.runtime` ⇒ 前后两个快照都是 `exists:false`，
       * 路径集合差集"空" —— 那句话不是"没被写"，是"没东西可量"（空对空）。活树里 `source` = 派生值，
       * 根在盘上，本分支不触发（行为一字不改）；评审副本要量活体那个根，就显式给
       * `AGENIA_LIVE_BRAIN_ROOT`。
       */
      const witnessJudged = realBefore.exists === true
      if (!witnessJudged) {
        caseHold(rec, 'DR01-BRAIN-WITNESS-ABSENT',
          `真脑根（写保护见证）不在盘上：${realRoot}（来源 ${witness.source}）⇒ 前后都是"不存在"，`
          + '路径集合"没变"是**空对空**，这一格判不了。**不是绿。** 要量活体那个根，把 '
          + `${ENV.LIVE_BRAIN_ROOT} 指向 <活体预设>/.runtime 再跑；不要拿 AGENIA_REPO_ROOT 把整棵树钉回活树（那会红 MCR-03）`)
      }

      // ── ① 清单本身（分母）：必须存在、必须与冻结 op 表一致 ──────────────
      const inv = await loadStagedModule('lib/cli-inventory.mjs', [])
      let commands = null
      if (inv.surfaceMissing) {
        push('SUT-SURFACE-MISSING', 'staged/lib/cli-inventory.mjs 不在 —— DR 的分母（命令清单）拿不到（预期的首跑红）')
      } else if (inv.mod === null) {
        push('CLI-INVENTORY', `lib/cli-inventory.mjs 载入失败：${inv.errors.join(' / ')}`)
      } else if (!Array.isArray(inv.mod.COMMANDS)) {
        push('CLI-INVENTORY', 'lib/cli-inventory.mjs 必须导出 COMMANDS 数组（提案 §B1.4 口径）')
      } else {
        commands = inv.mod.COMMANDS
        rec.readings.inventory_count = commands.length
        const shapeBad = commands.filter((c) => typeof c?.cli !== 'string' || typeof c?.op !== 'string' || typeof c?.writes !== 'boolean' || typeof c?.needsDataRoot !== 'boolean')
        if (shapeBad.length > 0) push('CLI-INVENTORY', `清单条目必须形如 {cli, op, writes, needsDataRoot}，这些不合格：${JSON.stringify(shapeBad.slice(0, 3))}`)
        const frozenKey = (c) => `${c.cli}#${c.op}`
        const got = new Set(commands.map(frozenKey))
        const want = new Set(FROZEN_COMMANDS.map(frozenKey))
        const missingInInventory = FROZEN_COMMANDS.filter((c) => !got.has(frozenKey(c))).map(frozenKey)
        const extraInInventory = commands.filter((c) => !want.has(frozenKey(c))).map(frozenKey)
        rec.readings.inventory_diff = { missing: missingInInventory, extra: extraInInventory }
        if (missingInInventory.length > 0) push('CLI-INVENTORY', `清单漏了冻结 op 表里的命令：${missingInInventory.join(', ')}`)
        if (extraInInventory.length > 0) push('CLI-INVENTORY', `清单里多出冻结 op 表没有的命令（新增 op 必须同批进冻结表与测试）：${extraInInventory.join(', ')}`)
        for (const c of commands) {
          const want0 = FROZEN_COMMANDS.find((f) => frozenKey(f) === frozenKey(c))
          if (!want0) continue
          if (c.writes !== want0.writes) push('CLI-INVENTORY', `${frozenKey(c)} 的 writes 实得 ${c.writes}，冻结 ${want0.writes}`)
          if (c.needsDataRoot !== want0.needsDataRoot) push('CLI-INVENTORY', `${frozenKey(c)} 的 needsDataRoot 实得 ${c.needsDataRoot}，冻结 ${want0.needsDataRoot}`)
        }
      }

      // ── ①b V7（T-MEM-07）：新 op `judge-pending` 三处必须**同批** ─────────────
      // 定形 V7 逐字：「`cli-inventory` 与测试侧 `FROZEN.ops` **都**含 `judge-pending`（少一处就是常驻红）」。
      // 第三处是**实现**（`--op help` 的 `ops`）—— 少它的话，清单与冻结表都在宣布一个不存在的 op，
      // 那是**最坏的一种绿**：三张表对得上，而命令跑不起来。
      // 契约：`.team/test/2026-10-16/契约-T-MEM-07.md` §三。
      const frozenBrainOps = FROZEN.ops['agenia-brain.mjs'] ?? []
      const frozenRow = frozenBrainOps.find((o) => o.op === 'judge-pending') ?? null
      const invRow = commands === null ? null : (commands.find((c) => c.cli === 'agenia-brain.mjs' && c.op === 'judge-pending') ?? null)
      let helpOps = null
      let helpExit = null
      if (stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        const helpRes = runCli('agenia-brain.mjs', { op: 'help' }, { env: process.env })
        helpExit = helpRes.exit_code
        helpOps = Array.isArray(helpRes.json?.ops) ? helpRes.json.ops : null
      }
      rec.readings.v7_sites = {
        frozen_ops: frozenRow !== null,
        inventory: commands === null ? null : invRow !== null,
        op_help: helpOps === null ? null : helpOps.includes('judge-pending'),
        op_help_exit: helpExit,
        op_help_count: helpOps === null ? null : helpOps.length,
      }
      if (frozenRow === null) {
        push('V7-FROZEN-OPS', '测试侧 `FROZEN.ops`（`support/env.mjs`）里没有 `agenia-brain.mjs#judge-pending` —— 那张表就是"新增 op 必须同批补"的载体，少它就是常驻红')
      }
      if (commands !== null && invRow === null) {
        push('V7-INVENTORY', '生产侧 `lib/cli-inventory.mjs` 的 `COMMANDS` 里没有 `agenia-brain.mjs#judge-pending` —— 清单就是分母；op 不进清单等于假装它不存在')
      }
      if (helpOps === null) {
        push('V7-OP-HELP', `拿不到 \`--op help\` 的 ops 列表（exit=${helpExit}）⇒ 「实现里到底有没有这个 op」判不了`)
      } else if (!helpOps.includes('judge-pending')) {
        push('V7-OP-HELP', '`--op help` 的 ops 列表里没有 `judge-pending` ⇒ **这个 op 还没实现**（`bin/agenia-brain.mjs` 的 `OP_NAMES` / `OPS` 分派里都没有它；V1–V6/V8/V9 全部判不了，缺的就是 op 本身）')
      }
      if (frozenRow !== null && frozenRow.writes !== false) {
        push('V7-FLAGS', `冻结表里 \`judge-pending\` 的 \`writes\` 必须是 \`false\`（只读：不改权威状态），实得 ${JSON.stringify(frozenRow.writes)}`)
      }
      if (invRow !== null && invRow.writes !== false) {
        push('V7-FLAGS', `清单里 \`judge-pending\` 的 \`writes\` 必须是 \`false\`（只读），实得 ${JSON.stringify(invRow.writes)}`)
      }
      if (invRow !== null && invRow.needsDataRoot !== true) {
        push('V7-FLAGS', `清单里 \`judge-pending\` 的 \`needsDataRoot\` 必须是 \`true\`（根是共享脑根），实得 ${JSON.stringify(invRow.needsDataRoot)}`)
      }

      // ── ② 纯函数：dataRootVerdict 的判定顺序 + canonical 解析 ───────────
      const pathLib = await loadStagedModule('lib/paths.mjs', ['dataRootVerdict', 'resolveWithin', 'testModeOf', 'realInitVerdict', 'realModeVerdict', 'REAL_BRAIN_ROOT'])
      if (pathLib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/paths.mjs 不在 —— 根判定拿不到（预期的首跑红）')
      for (const n of pathLib.missing) push('SUT-SURFACE-MISSING', `staged/lib/paths.mjs 没有导出 ${n}`)

      // ── 🎯 靶子（`T-TEST-02` / 技术评审 F2）：**被测代码自己算出来的那个真实脑根** ──────────
      // 口径（组长拍死）：**不许由用例注入**。所以这里只**读** SUT 的常量，不往它里面喂任何根。
      // 形状（F4 的不变量，2026-10-15 技术评审）：脑根 = `<预设目录>/.runtime`，预设目录由**本文件自己的位置**推
      // ⇒ 被测树在 staging ⇒ 靶子就是 `<staging>/.runtime`。这一条本身就是判据：它哪天不再跟着预设走
      //   （比如又改回写死的本机绝对路径），下面的断言会当场红 —— 那正是 F4 要挡的 fail-open。
      const sutRealBrain = pathLib.mod?.REAL_BRAIN_ROOT ?? null
      rec.readings.sut_real_brain = sutRealBrain
      rec.readings.sut_real_brain_expected = path.join(canonical(requireEnv(ENV.STAGING_PRESET)), '.runtime')
      if (typeof sutRealBrain !== 'string' || sutRealBrain === '') {
        push('SUT-REAL-ROOT', 'staged/lib/paths.mjs 没有导出 REAL_BRAIN_ROOT —— 靶子算不出来（F4 那条不变量也没了）')
      } else if (canonical(sutRealBrain) !== canonical(path.join(canonical(requireEnv(ENV.STAGING_PRESET)), '.runtime'))) {
        push('SUT-REAL-ROOT', `真实脑根必须**跟着预设目录走**（F4 的不变量）：实得 ${sutRealBrain}，应为 <AGENIA_STAGING_PRESET>/.runtime = ${path.join(canonical(requireEnv(ENV.STAGING_PRESET)), '.runtime')}`)
      }
      // 见证侧：活体那个根**依然**必须是活体那个（不许跟着被测树漂 —— 它是"有没有被写坏"的锚）。
      // ⚠️ `M1` 之后，评审副本里的 `PATHS.finalPreset` 是**副本**、不是活体 ⇒ 这条同值检查在副本里
      //    判不了（活体预设根在副本里不可知）⇒ 只记读数；派生模式下照旧判（活树里逐字符相同）。
      const witnessExpected = path.join(PATHS.finalPreset, '.runtime')
      const witnessIsLivePreset = canonical(realRoot) === canonical(witnessExpected)
      rec.readings.witness_root_check = {
        witness: realRoot, source: witness.source, expected_live_preset: witnessExpected, same: witnessIsLivePreset,
        checked: !witness.source.startsWith('env:'),
      }
      if (!witness.source.startsWith('env:') && !witnessIsLivePreset) {
        push('SUT-REAL-ROOT', `写保护见证必须是**活体**那个根（${witnessExpected}），实得 ${realRoot}`)
      }
      // 🔴 两条语义不许混：靶子 ≠ 见证。相等的唯一情形是"预设就装在活体位置上"（装好之后）——
      //    在 staging 里跑时它们**必须**不同；相同 ⇒ 说明靶子又漂回活体了（F2 复发）。
      rec.readings.target_vs_witness = { target: sutRealBrain, witness: realRoot, same: canonical(sutRealBrain ?? '') === canonical(realRoot) }

      if (pathLib.mod?.dataRootVerdict) {
        const v = pathLib.mod.dataRootVerdict
        // 🔴 **不注入 `realRoots`**：让它用**自己那一份**（`REAL_ROOTS`，由模块位置 + cwd 算出来）。
        //    用例往里喂一张"拒绝名单"，等于把答案告诉被测者 —— 拍板口径明令禁止。
        const opts = { testMode: true, markerExists: true, driveOf }
        const markerless = path.join(canonical(requireEnv(ENV.RUN_ROOT)), 'agenia-dr-markless')
        const cases = [
          ['缺失', undefined, 'E_ROOT_MISSING', { ...opts, markerExists: false }],
          ['空串', '', 'E_ROOT_MISSING', { ...opts, markerExists: false }],
          ['相对', 'brain-root', 'E_ROOT_RELATIVE', { ...opts, markerExists: false }],
          ['UNC', '\\\\server\\share', 'E_ROOT_UNC', { ...opts, markerExists: false }],
          ['C 盘（非法姿势）', 'C:\\Temp\\agenia', 'E_ROOT_C_DRIVE', { ...opts, markerExists: false }],
          ['真实脑根（**靶子** = SUT 自己算的那个）', sutRealBrain, 'E_ROOT_REAL_BRAIN', opts],
          ['真实脑根（`.team/review/../../` 绕）', `${sutRealBrain}\\..\\.runtime`, 'E_ROOT_REAL_BRAIN', opts],
          // ⚠️ 落点换到运行根之下：`PATHS.stagedPreset` **包住** 靶子（`<staging>/.runtime` 就在它里面）
          //    ⇒ 拿它当"无 marker"那一格会先撞 `E_ROOT_REAL_BRAIN`（判定顺序：REAL_BRAIN 在 NO_MARKER 之前）。
          ['测试模式无 marker', markerless, 'E_ROOT_NO_MARKER', { ...opts, markerExists: false }],
          ['合法测试根', `${PATHS.repo}\\.team\\test\\2026-10-14\\_runs\\20261014-red-x`, null, opts],
        ]
        const got = {}
        for (const [label, raw, wantCode, o] of cases) {
          let out = null
          try { out = v(raw, o) } catch (err) { push('ROOT-VERDICT', `dataRootVerdict(${label}) 抛错：${String(err.message).slice(0, 160)}`); continue }
          got[label] = { ok: out?.ok ?? null, code: out?.code ?? null }
          if (wantCode === null) {
            if (out?.ok !== true) push('ROOT-VERDICT', `${label} 应当通过，实得 ok=${out?.ok} code=${out?.code}`)
          } else if (out?.ok !== false || out?.code !== wantCode) {
            push('ROOT-VERDICT', `${label} 应为 ${wantCode}，实得 ok=${out?.ok} code=${out?.code}`)
          }
        }
        rec.readings.root_verdict = got
        // 顺序冻结：同一输入必须每次同一个码（不许"有时报这个有时报那个"）
        const twice = [v(sutRealBrain, opts)?.code, v(sutRealBrain, opts)?.code]
        if (twice[0] !== twice[1]) push('ROOT-VERDICT-ORDER', `同一输入两次得到不同码：${JSON.stringify(twice)}（判定顺序必须冻结）`)
      }
      if (pathLib.mod?.resolveWithin) {
        const base = `${PATHS.repo}\\.team\\test`
        const cases = [
          ['普通子路径', 'a/b.json', true],
          ['`..` 穿越', '..\\..\\AGENTS.md', false],
          ['绝对逃逸', 'E:\\Harness\\AGENTS.md', false],
        ]
        const got = {}
        for (const [label, target, wantOk] of cases) {
          let out = null
          try { out = pathLib.mod.resolveWithin(base, target) } catch (err) { push('RESOLVE-WITHIN', `resolveWithin(${label}) 抛错：${String(err.message).slice(0, 140)}`); continue }
          got[label] = { ok: out?.ok ?? null, code: out?.code ?? null }
          if (Boolean(out?.ok) !== wantOk) push('RESOLVE-WITHIN', `${label} 应当 ok=${wantOk}，实得 ok=${out?.ok} code=${out?.code}`)
          if (wantOk === false && out?.code !== 'E_PATH_ESCAPE') push('RESOLVE-WITHIN', `${label} 的码应为 E_PATH_ESCAPE，实得 ${out?.code}`)
        }
        rec.readings.resolve_within = got
      }
      if (pathLib.mod?.testModeOf) {
        const got = {}
        try {
          got['{testMode:true}'] = pathLib.mod.testModeOf({ testMode: true })
          got['{}（本进程有 AGENIA_TEST_RUN_ROOT）'] = pathLib.mod.testModeOf({})
        } catch (err) { push('TEST-MODE', `testModeOf 抛错：${String(err.message).slice(0, 140)}`) }
        rec.readings.test_mode = got
        if (got['{testMode:true}'] !== true) push('TEST-MODE', `testModeOf({testMode:true}) 必须为 true，实得 ${got['{testMode:true}']}`)
      }

      // ── ②b 两道新闸的**纯函数**面：`init-real` 与 `--real-mode` ────────────────
      // 🔴 为什么这一半必须走纯函数（而不是真跑 CLI）：它们各有几档"只有**真碰真实库**才看得见"，
      //    而真碰就是事故（见文件头那条死命令）。两个函数都**不摸盘**（`exists` 由调用方注入）
      //    ⇒ 能把"根必须不存在"这种一次性保护**在盘外**钉死，一个字节都不冒险。
      // 【钉什么】闸的**码**与**判定次序**：形状 → 测试模式互斥 → 专名（逐字相等）→ 一次性。
      // 【怎么翻面】① 把 `realModeVerdict` 里"必须显式给开关"那条删掉 ⇒ 「真实根 + 没给开关」那一格
      //            从 `E_ROOT_REAL_BRAIN` 变成 ok ⇒ 当场红（那正是"真实库后门"的形状）；
      //            ② 把测试模式互斥闸删掉 ⇒ 两处 `E_ARG_SCHEMA` 变 `E_DATA_EXISTS`/ok ⇒ 红；
      //            ③ 把"逐字相等"改成"落在里面就算" ⇒ 「子路径」那一格从 `E_ROOT_OUTSIDE` 变 ok ⇒ 红。
      if (pathLib.mod?.realInitVerdict) {
        const v = pathLib.mod.realInitVerdict
        const cases = [
          ['省略根', undefined, 'E_ROOT_MISSING', { exists: false, testMode: false }],
          ['相对路径', 'brain-root', 'E_ROOT_RELATIVE', { exists: false, testMode: false }],
          ['UNC', '\\\\server\\share', 'E_ROOT_UNC', { exists: false, testMode: false }],
          ['C 盘（非法姿势）', 'C:\\Temp\\agenia', 'E_ROOT_C_DRIVE', { exists: false, testMode: false }],
          // 🔴 互斥闸：带测试模式 ⇒ 一律 E_ARG_SCHEMA（**不是** E_ROOT_REAL_BRAIN —— 那是日常 op 的码）
          ['真实根 + 测试模式', sutRealBrain, 'E_ARG_SCHEMA', { exists: false, testMode: true }],
          ['真实根 + 测试模式（根已存在也还是先报互斥）', sutRealBrain, 'E_ARG_SCHEMA', { exists: true, testMode: true }],
          // 一次性保护 —— **注入** `exists:true` 来钉，绝不许拿盘上那个真根去撞
          ['真实根（已经在盘上 ⇒ 一次性保护）', sutRealBrain, 'E_DATA_EXISTS', { exists: true, testMode: false }],
          // 专名闸：**是相等，不是"落在里面"**
          ['真实根的子路径', `${sutRealBrain}\\sub`, 'E_ROOT_OUTSIDE', { exists: false, testMode: false }],
          ['真实根的父目录', path.dirname(sutRealBrain), 'E_ROOT_OUTSIDE', { exists: false, testMode: false }],
          // ★ 正例：**只做纯函数**。真开库那一下永远不许在测试里跑（真库已经在盘上了）。
          //    ⚠️ 这里注入 `exists:false` 钉的是**判定逻辑**，不是盘上事实 —— 盘上事实是 exists:true
          //    （读数见 DR-01 ④ 的 `real_brain`）。
          ['真实根 + 还不存在（正例）', sutRealBrain, null, { exists: false, testMode: false }],
        ]
        const got = {}
        for (const [label, raw, wantCode, o] of cases) {
          let out = null
          try { out = v(raw, o) } catch (err) { push('INIT-REAL-VERDICT', `realInitVerdict(${label}) 抛错：${String(err.message).slice(0, 160)}`); continue }
          got[label] = { ok: out?.ok ?? null, code: out?.code ?? null }
          if (wantCode === null) {
            if (out?.ok !== true) push('INIT-REAL-VERDICT', `${label} 应当通过，实得 ok=${out?.ok} code=${out?.code}`)
          } else if (out?.ok !== false || out?.code !== wantCode) {
            push('INIT-REAL-VERDICT', `${label} 应为 ${wantCode}，实得 ok=${out?.ok} code=${out?.code}`)
          }
        }
        rec.readings.init_real_verdict = got
        // 次序冻结：同一输入两次同一个码
        const twice = [v(sutRealBrain, { exists: true, testMode: true })?.code, v(sutRealBrain, { exists: true, testMode: true })?.code]
        if (twice[0] !== twice[1]) push('INIT-REAL-VERDICT-ORDER', `realInitVerdict 同一输入两次得到不同码：${JSON.stringify(twice)}（判定次序必须冻结）`)
      }
      if (pathLib.mod?.realModeVerdict) {
        const v = pathLib.mod.realModeVerdict
        const nonReal = `${PATHS.repo}\\.tools\\_scratch\\agenia-dr-outside`
        const cases = [
          ['省略根', undefined, 'E_ROOT_MISSING', { realMode: true }],
          ['相对路径', 'brain-root', 'E_ROOT_RELATIVE', { realMode: true }],
          ['UNC', '\\\\server\\share', 'E_ROOT_UNC', { realMode: true }],
          ['C 盘（非法姿势）', 'C:\\Temp\\agenia', 'E_ROOT_C_DRIVE', { realMode: true }],
          // **命门**：与测试模式互斥（"给开关 + 真实根 + --test-mode" 就是撞这一条）
          ['真实根 + 开关 + 测试模式', sutRealBrain, 'E_ARG_SCHEMA', { realMode: true, testMode: true }],
          // 老行为不许退化：没给开关 ⇒ 真实根照旧无条件拒
          ['真实根 + 没给开关', sutRealBrain, 'E_ROOT_REAL_BRAIN', { realMode: false }],
          // 专名闸：**是相等，不是"落在里面"**
          ['非真实根 + 开关', nonReal, 'E_ROOT_OUTSIDE', { realMode: true }],
          ['真实根的子路径 + 开关', `${sutRealBrain}\\sub`, 'E_ROOT_OUTSIDE', { realMode: true }],
          // ★ 正例（纯函数）：开关真的能把那道门打开
          ['真实根 + 开关（正例）', sutRealBrain, null, { realMode: true }],
        ]
        const got = {}
        for (const [label, raw, wantCode, o] of cases) {
          let out = null
          try { out = v(raw, o) } catch (err) { push('REAL-MODE-VERDICT', `realModeVerdict(${label}) 抛错：${String(err.message).slice(0, 160)}`); continue }
          got[label] = { ok: out?.ok ?? null, code: out?.code ?? null }
          if (wantCode === null) {
            if (out?.ok !== true) push('REAL-MODE-VERDICT', `${label} 应当通过，实得 ok=${out?.ok} code=${out?.code}`)
          } else if (out?.ok !== false || out?.code !== wantCode) {
            push('REAL-MODE-VERDICT', `${label} 应为 ${wantCode}，实得 ok=${out?.ok} code=${out?.code}`)
          }
        }
        rec.readings.real_mode_verdict = got
      }

      // ── ②c 工作区那一档的 `containingRule`（2026-10-16 组长批 · 承重函数）────────
      // 【钉什么】`dataRootVerdict` 多了一个**可选**键 `containingRule`（默认 `true` = 照旧判"包住真实根"）。
      //   只有**工作区**那一档传 `false`（三份 CLI 的 `resolveWorkspace`）；`--data-root` / `--status-root`
      //   **照旧**用默认值。三条判据：
      //     ① **默认值不许变** —— 同一个根，不传 `containingRule` 与传 `false` ⇒ **结论相反**（这就是翻面）；
      //     ② **老防线一条都不许退化** —— C 盘 / 相对 / UNC / 缺 / marker / 越界 / `⊆` 那半条，
      //        逐格跑**两遍**（不传 vs `false`），两遍结论必须**逐字相同**；
      //     ③ **三份 `resolveWorkspace`**（brain / local / route）都要覆盖，外加 `--status-root` 那条路。
      // 【怎么翻面】
      //   · 把 `containingRule: false` 删掉 ⇒ 下面 `WSV-ACCEPT` 那两格（local / route）从"放行"变回 `E_ROOT_REAL_BRAIN`；
      //     （`agenia-brain` 那一格 2026-10-17 撤了，理由写在 ③ 开头：它那两个调 `resolveWorkspace` 的 op **都写**。）
      //   · 把默认值改成 `false` ⇒ ② 每一格的"不传"那一遍当场变结论（`WSV-DEFAULT`）；
      //   · 让 `--status-root` 也传 `false` ⇒ `WSV-STATUS-ROOT` 那两格红。
      // ⚠️ 靶子**按被测树自己算**（`pathLib.mod.REAL_BRAIN_ROOT`）—— 不许拿活体那个绝对路径当靶子：
      //    被测代码从 staging 载入 ⇒ 它算出来的真实脑根是 `<staging>/.runtime`（2026-10-16 技术评审 F2）。
      if (pathLib.mod?.dataRootVerdict) {
        const sutRealBrain = pathLib.mod.REAL_BRAIN_ROOT ?? null
        rec.readings.wsv_sut_real_brain = sutRealBrain
        if (typeof sutRealBrain !== 'string' || sutRealBrain === '') {
          push('WSV-SURFACE', 'staged/lib/paths.mjs 没有导出 REAL_BRAIN_ROOT —— 工作区那档的靶子算不出来')
        } else {
          const wsRealRoots = [sutRealBrain, path.join(PATHS.repo, '.team', 'route')]
          const containerRoot = PATHS.repo // E:\Harness ⊇ <staging>/.runtime，也 ⊇ E:\Harness\.team\route
          const outsideRoot = path.join(PATHS.repo, '.tools', '_scratch', 'agenia-wsv-outside')
          const markerlessRoot = path.join(PATHS.repo, '.tools', '_scratch', 'agenia-wsv-marker')
          const runRoot = canonical(process.env[ENV.RUN_ROOT])
          /** 同一个根跑两遍：**不传** `containingRule` 与传 `false`。 */
          const pair = (label, raw, o = {}) => {
            const base = { testMode: false, markerExists: false, driveOf, realRoots: wsRealRoots, ...o }
            let d = null
            let f = null
            try { d = pathLib.mod.dataRootVerdict(raw, base) } catch (err) { d = { ok: null, code: `THREW:${String(err.message).slice(0, 80)}` } }
            try { f = pathLib.mod.dataRootVerdict(raw, { ...base, containingRule: false }) } catch (err) { f = { ok: null, code: `THREW:${String(err.message).slice(0, 80)}` } }
            return { label, default: { ok: d?.ok ?? null, code: d?.code ?? null }, false: { ok: f?.ok ?? null, code: f?.code ?? null } }
          }

          // ① 翻面那一格：容器根（包住两个真实根）。
          const flip = pair('工作区容器根（E:\\Harness ⊇ 两个真实根）', containerRoot)
          rec.readings.wsv_flip = flip
          if (!(flip.default.ok === false && flip.default.code === 'E_ROOT_REAL_BRAIN')) {
            push('WSV-DEFAULT', `${flip.label} **不传** containingRule 应为 E_ROOT_REAL_BRAIN（默认照旧判"包住"），实得 ok=${flip.default.ok} code=${flip.default.code}`)
          }
          if (flip.false.ok !== true) {
            push('WSV-FLIP', `${flip.label} 传 containingRule:false 应当放行（工作区那一档的正题），实得 ok=${flip.false.ok} code=${flip.false.code}`)
          }
          if (!(flip.default.ok !== flip.false.ok)) {
            push('WSV-FLIP', `${flip.label} 传/不传 containingRule 得到**同一个**结论（ok=${flip.default.ok}）—— 那这条判据翻不了面，等于没测`)
          }

          // ② 老防线：逐格两遍，结论必须逐字相同（`containingRule` 只该关掉"包住"那半条）。
          const legacy = [
            ['C 盘', 'C:\\Windows\\Temp\\agenia-wsv', 'E_ROOT_C_DRIVE'],
            ['相对路径', 'brain-root', 'E_ROOT_RELATIVE'],
            ['UNC', '\\\\127.0.0.1\\share\\agenia-wsv', 'E_ROOT_UNC'],
            ['缺（undefined）', undefined, 'E_ROOT_MISSING'],
            ['空串', '', 'E_ROOT_MISSING'],
            ['落在真实根里（⊆ 那半条，关不掉）', path.join(sutRealBrain, 'memory'), 'E_ROOT_REAL_BRAIN'],
            ['测试模式无 marker', markerlessRoot, 'E_ROOT_NO_MARKER'],
            ['越界', outsideRoot, 'E_ROOT_OUTSIDE'],
          ]
          const legacyRows = []
          for (const [label, raw, want] of legacy) {
            const o = label === '测试模式无 marker'
              ? { testMode: true, markerExists: false }
              : label === '越界'
                ? { testMode: true, markerExists: true, mustBeUnder: runRoot }
                : {}
            const r = pair(label, raw, o)
            legacyRows.push({ ...r, want })
            for (const side of ['default', 'false']) {
              if (r[side].ok !== false || r[side].code !== want) {
                push('WSV-LEGACY', `${label}（${side === 'default' ? '不传' : 'containingRule:false'}）应为 ${want}，实得 ok=${r[side].ok} code=${r[side].code}`)
              }
            }
            if (r.default.code !== r.false.code || r.default.ok !== r.false.ok) {
              push('WSV-LEGACY', `${label} 在"不传"与"传 false"两种姿势下结论不同（${r.default.code} vs ${r.false.code}）—— 老防线退化了`)
            }
          }
          rec.readings.wsv_legacy = legacyRows

          // ③ `resolveWorkspace` 那一档的 CLI 接线（真子进程）+ `--status-root` 那条**不在改动范围内**的路。
          //    🔴 **这一组里的 op 必须一个字节都不写**：它们喂的是活体容器根（`E:\Harness`）。
          //       `health-read` / `health` / `daily-start` 名字看着像只读，实际各落一张派生卡
          //       （`<ws>\.team\brain\<day>\health.json` / `<ws>\.team\state\daily\<day>.json`）——
          //       喂活体容器根跑它们 = 每跑一次全量套件就把活体工作区改写一次（F-48 就是这么来的：
          //       那张混血卡 `now_file` 指测试运行根、`paths.*` 指活体）。
          //    🔴 `agenia-brain` **没有 CLI 格**（2026-10-17 撤）：它 22 个 op 里只有 `daily-start`（:453）与
          //       `health-read`（:1155）调 `resolveWorkspace`，**两个都写**，落点又都按 `<ws>\.team` 硬拼
          //       （`--status-root` 救不了它们）⇒ 给它一格就等于让它写活体，没有零写入的替身可换。
          //       它那条 `containingRule: false` 仍由上面的纯函数翻面（`WSV-FLIP` / `pair()`）钉住；
          //       丢掉的是"brain 的 CLI 接线"这一层覆盖 —— 记在这里，不装作还在。
          //    🔴 「放行」那几格必须**剥掉 `AGENIA_TEST_RUN_ROOT`**：测试模式下 `mustBeUnder = 运行根`，
          //       容器根 `E:\Harness` 会先撞 `E_ROOT_OUTSIDE`，那样读到的就不是"工作区那一档"的结论了。
          const emptyPayload = writeFixture('DR-01', 'wsv-empty', {})
          const testDataRoot = process.env[ENV.TEST_DATA_ROOT]
          const cliCells = [
            // `local-read` 是零写入的读面（只读 `<teamDir>\state\local\<day>.json`），而它在 `main()` 里
            // 走的是与 `health` **同一个** `resolveWorkspace`（`agenia-local.mjs:472`，op 分派之前）⇒
            // 接线覆盖不丢、写入没有了。读数里的 `code` 会是 `E_ARG_SCHEMA`（这份空 payload 没有 `day`）——
            // 那不是"根被拒"：根判定跑在 op 分派之前，能走到 `E_ARG_SCHEMA` 就说明容器根被**放行**了；
            // 真被拒的话这里读到的是 `E_ROOT_REAL_BRAIN`，也就是下面 `WSV-ACCEPT` 判的那一格。
            ['local · --workspace <容器根>（放行，op 为零写入的 local-read）', 'agenia-local.mjs', { op: 'local-read', workspace: containerRoot, inFile: emptyPayload }, true, null],
            ['route · --workspace <容器根>（放行）', 'agenia-route.mjs', { op: 'read', workspace: containerRoot, inFile: emptyPayload }, true, null],
            ['brain · --workspace <真实根\\memory>（⊆ 照旧拒）', 'agenia-brain.mjs', { op: 'health-read', dataRoot: testDataRoot, workspace: path.join(sutRealBrain, 'memory'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['local · --workspace <真实根\\memory>（⊆ 照旧拒）', 'agenia-local.mjs', { op: 'health', workspace: path.join(sutRealBrain, 'memory'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['route · --workspace <真实根\\memory>（⊆ 照旧拒）', 'agenia-route.mjs', { op: 'read', workspace: path.join(sutRealBrain, 'memory'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['brain · --data-root <真实根>（不给 --real-mode ⇒ 照旧拒）', 'agenia-brain.mjs', { op: 'health-read', dataRoot: sutRealBrain, inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['local · --status-root <包住路线根的那层>（默认值不许被顺手改掉）', 'agenia-local.mjs', { op: 'health', workspace: containerRoot, statusRoot: path.join(PATHS.repo, '.team'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['route · --status-root <包住路线根的那层>（默认值不许被顺手改掉）', 'agenia-route.mjs', { op: 'read', workspace: containerRoot, statusRoot: path.join(PATHS.repo, '.team'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
          ]
          const cliRows = []
          for (const [label, cli, opts, strip, want] of cliCells) {
            if (!stagingExists(path.join('bin', cli))) { cliRows.push({ label, surfaceMissing: true }); continue }
            let res = null
            try {
              res = runCli(cli, opts, { env: process.env, ...(strip ? { stripEnv: [ENV.RUN_ROOT] } : {}) })
            } catch (err) {
              cliRows.push({ label, threw: String(err.message).slice(0, 120) })
              push('WSV-CLI-THREW', `${label}：跑不起来 —— ${String(err.message).slice(0, 160)}`)
              continue
            }
            const code = res.json?.error?.code ?? null
            cliRows.push({ label, exit_code: res.exit_code, code })
            if (want === null) {
              if (code === 'E_ROOT_REAL_BRAIN') {
                push('WSV-ACCEPT', `${label} 仍然被 E_ROOT_REAL_BRAIN 拒了（工作区那一档的 containingRule 没生效）：${res.stdout.trim().slice(0, 200)}`)
              }
            } else if (code !== want) {
              push('WSV-CODE', `${label} 应为 ${want}，实得 ${code ?? '(无码)'} / exit=${res.exit_code}：${res.stdout.trim().slice(0, 200)}`)
            }
          }
          rec.readings.wsv_cli = cliRows
        }
      }

      // ── ③ 逐命令 × 逐姿势（真子进程）────────────────────────────────────
      if (!stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 逐命令的 data-root 矩阵跑不起来（预期的首跑红）')
      }
      // 🔴 `init-real` **不进这张矩阵**（单列在下面的 ③a）。
      //    理由：矩阵里「真实脑根（原样）」那一格会把真实根**原样**交给它。那一格现在之所以安全，
      //    只因为"`init-real` 与 `--test-mode` 互斥"那一道闸 —— 派工单的定性是：
      //    那是"碰巧对"，不是"看得出来在护什么"（真漏了闸，这一格会**当场把真实库开一遍**）。
      // ⇒ 单列一组：码钉死（E_ARG_SCHEMA）、跑前跑后真实库内容钉死。
      // ⚠️ 它也因此没有"合法测试根"那一条正向对照 —— `init-real` 在测试模式下**永远**是 E_ARG_SCHEMA，
      //    它的正例只存在于纯函数那一档（②b 的「真实根 + 还不存在」）。
      const writeCommands = (commands ?? []).filter((c) => c.writes === true && c.needsDataRoot === true && c.op !== 'init-real')
      rec.readings.write_commands = writeCommands.map((c) => `${c.cli}#${c.op}`)
      // 分母不许空：`init-real` 若从清单里消失，③a 那一组就会**空着一路绿**（"清单就是分母"）。
      const initRealRows = (commands ?? []).filter((c) => c.cli === 'agenia-brain.mjs' && c.op === 'init-real')
      rec.readings.init_real_row = initRealRows.map((c) => ({ writes: c.writes, needsDataRoot: c.needsDataRoot }))
      if (commands !== null && initRealRows.length === 0) {
        push('CLI-INVENTORY', '清单里没有 `agenia-brain.mjs#init-real` —— ③a 那一组的分母是空的（它在不在盘上都必须被清点点名）')
      }
      const postureResults = {}
      for (const cmd of writeCommands) {
        for (const { label, spec } of badRootPostures(sutRealBrain)) {
          const payloadFile = writeFixture('DR-01', `${cmd.op}-${label.replace(/[^\w]/g, '')}`.slice(0, 40), {})
          const extra = spec.mode === 'value' ? ['--data-root', spec.value] : []
          let res = null
          try {
            res = runCli(cmd.cli, { op: cmd.op, dataRoot: undefined, inFile: payloadFile, testMode: true, extra }, { env: process.env })
          } catch (err) {
            postureResults[`${cmd.op}/${label}`] = { threw: String(err.message).slice(0, 120) }
            continue
          }
          postureResults[`${cmd.op}/${label}`] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
          if (res.exit_code === 0) {
            push('DR-ILLEGAL-ACCEPTED', `${cmd.cli}#${cmd.op} 用「${label}」竟然成功了（exit 0）—— 非法根必须非零退出、零写入`)
          } else if (!res.json?.error?.code) {
            push('DR-ILLEGAL-NOCODE', `${cmd.cli}#${cmd.op} 用「${label}」被拒但没给稳定错误码（stdout=${res.stdout.trim().slice(0, 160)}）`)
          }
        }
        // 正向对照（§2.4 第 4 条）：合法测试根必须**不被当成根问题拒掉**。
        // 🔴 这里**不能**要求"每个写命令都 exit 0"：同一个根上连跑 `init`/`judge-commit`/`claim-update`…
        //    本来就会因为**状态次序**失败（`E_DATA_EXISTS`/`E_DATA_MISSING`）—— 那是**假红**，
        //    与"根合法不合法"无关（这一条是交付前自查抓到的）。
        //    所以判据是：① 干净的合法根上 `init` 必须成功（硬正例，证明命令本身可用、根被接受）；
        //              ② 其余命令只要**不是**被 `E_ROOT_*`/`E_PATH_ESCAPE` 拒的就算过。
        const okFile = writeFixture('DR-01', `${cmd.op}-legal`.slice(0, 40), {})
        const okRes = runCli(cmd.cli, { op: cmd.op, dataRoot: process.env[ENV.TEST_DATA_ROOT], inFile: okFile, testMode: true }, { env: process.env })
        const okCode = okRes.json?.error?.code ?? null
        postureResults[`${cmd.op}/合法测试根`] = { exit_code: okRes.exit_code, code: okCode }
        if (okRes.exit_code !== 0 && /^E_ROOT_|^E_PATH_/.test(String(okCode))) {
          push('DR-POSITIVE', `${cmd.cli}#${cmd.op} 在合法测试根上被**根判定**拒了（${okCode}）—— 合法根不许被当成隔离问题：${okRes.stdout.trim().slice(0, 200)}`)
        }
      }
      // 硬正例：干净的合法根上 init 必须成功
      const freshRoot = scenarioWorkspace('DR-01', 'positive-root')
      const initRes = runCli('agenia-brain.mjs', { op: 'init', dataRoot: freshRoot, inFile: writeFixture('DR-01', 'init-legal', {}), testMode: true }, { env: process.env })
      rec.readings.positive_init = { exit_code: initRes.exit_code, code: initRes.json?.error?.code ?? null }
      if (initRes.exit_code !== 0) {
        push('DR-POSITIVE', `干净合法根上的 init 必须成功（正向对照），实得 exit=${initRes.exit_code} / ${initRes.json?.error?.code ?? '(无码)'}：${initRes.stdout.trim().slice(0, 200)}`)
      }
      rec.readings.postures = postureResults

      // ── ③a `init-real`：**单列一组**（它已经不在上面那张矩阵里了）──────────────────
      // 【钉什么】
      //   ① 「真实根姿势」那四格（原样 / 大写盘符 / 尾斜杠 / `..` 绕）⇒ **E_ARG_SCHEMA**（互斥闸），
      //      **不是** E_ROOT_REAL_BRAIN —— 后者是"日常 op 误写真实库"那个码，`init-real` 不走那张表。
      //   ② 非真实根姿势的码各自钉死（缺失 / 相对 / C 盘 / UNC / 专名闸 E_ROOT_OUTSIDE）。
      //   ③ 这一组跑前跑后，真实库**内容一字未变**：`audit.jsonl` 行数 / `v0.json` 哈希 / 整树哈希。
      // 【怎么翻面】
      //   · 把 `realInitVerdict` 的测试模式互斥闸删掉 ⇒ 四格的真实根姿势从 E_ARG_SCHEMA 变成
      //     E_DATA_EXISTS（真库已在盘上）⇒ ① 当场红；真让它写进去 ⇒ ③ 红（而且那是**安全违规**级别的红）。
      //   · 把"逐字相等"放宽成"落在里面就算" ⇒ 「运行根之外」那一格的 E_ROOT_OUTSIDE 会变 ok ⇒ 红。
      //   · 把 `init-real` 从清单里删掉 ⇒ 分母空了 ⇒ 上面的 `CLI-INVENTORY` 红（不许空着一路绿）。
      const initRealBefore = brainPathsOf()
      // 缺面时别在这里刷一串"跑不起来"：`③` 开头那条 `SUT-SURFACE-MISSING` 已经把缺面报红了，
      // 这里再报 7 条只会把"被测对象没实现"读成一堆噪声。
      const brainCliOk = stagingExists(path.join('bin', 'agenia-brain.mjs'))
      rec.readings.brain_cli_present = brainCliOk
      const initRealShapeCodes = {
        '省略 --data-root': 'E_ROOT_MISSING',
        '空串': 'E_ROOT_MISSING',
        '相对路径': 'E_ROOT_RELATIVE',
        'C 盘（非法姿势）': 'E_ROOT_C_DRIVE',
        'UNC': 'E_ROOT_UNC',
      }
      const initRealCases = []
      for (const { label, spec } of badRootPostures(sutRealBrain)) {
        const touchesReal = /^真实/.test(label)
        const want = touchesReal ? 'E_ARG_SCHEMA' : (initRealShapeCodes[label] ?? null)
        if (want === null) continue // 「运行根之外」在下面单独跑（要剥测试模式才看得到专名闸）
        initRealCases.push({ label, extra: spec.mode === 'value' ? ['--data-root', spec.value] : [], want, strip: false, touchesReal })
      }
      const outsidePosture = badRootPostures(sutRealBrain).find(({ label }) => label === '运行根之外')
      // 专名闸要**不带测试模式**才看得到（带测试模式时先撞互斥闸，永远只看到 E_ARG_SCHEMA）。
      // 剥 `AGENIA_TEST_RUN_ROOT` 是安全的：根判定跑在 op 分派**之前**，被拒的那一次不写盘；
      // 而且这一格的根是运行根之外的 `_scratch` 子目录，**不是**真实根。
      initRealCases.push({
        label: '运行根之外（不带测试模式）',
        extra: ['--data-root', outsidePosture.spec.value],
        want: 'E_ROOT_OUTSIDE',
        strip: true,
        touchesReal: false,
      })
      const initRealResults = {}
      for (const c of initRealCases) {
        if (!brainCliOk) break
        let res = null
        try {
          res = runCli('agenia-brain.mjs', { op: 'init-real', testMode: !c.strip, extra: c.extra }, {
            env: process.env,
            ...(c.strip ? { stripEnv: [ENV.RUN_ROOT] } : {}),
          })
        } catch (err) {
          initRealResults[c.label] = { threw: String(err.message).slice(0, 160) }
          push('INIT-REAL-THREW', `init-real 用「${c.label}」跑不起来（连拒绝都没给出来）：${String(err.message).slice(0, 160)}`)
          continue
        }
        const code = res.json?.error?.code ?? null
        const wantExit = FROZEN.exitCodes[c.want]
        initRealResults[c.label] = { exit_code: res.exit_code, code, want: c.want, touches_real_root: c.touchesReal }
        if (res.exit_code === 0) {
          push('INIT-REAL-ACCEPTED', `init-real 用「${c.label}」竟然 exit 0 —— 这一格必须被拒：${res.stdout.trim().slice(0, 200)}`)
          continue
        }
        if (code !== c.want) {
          push('INIT-REAL-CODE', `init-real 用「${c.label}」应报 ${c.want}，实得 ${code ?? '(无码)'}：${res.stdout.trim().slice(0, 240)}`)
        }
        if (typeof wantExit === 'number' && res.exit_code !== wantExit) {
          push('INIT-REAL-EXIT', `init-real 用「${c.label}」的 ${c.want} 应配退出码 ${wantExit}，实得 ${res.exit_code}`)
        }
      }
      const initRealAfter = brainPathsOf()
      const initRealViolation = brainDiff(initRealBefore, initRealAfter, 'init-real 那一组期间')
      rec.readings.init_real = {
        before: summarizeBrain(initRealBefore),
        after: summarizeBrain(initRealAfter),
        diff: initRealViolation === null ? [] : [{ code: initRealViolation.code, message: initRealViolation.message }],
        judged: witnessJudged,
        cases: initRealResults,
      }
      if (witnessJudged && initRealViolation !== null) {
        push(initRealViolation.code, `真实库在 init-real 那一组里被改动了：${initRealViolation.message} —— 立即停测并报事故，不许自行清理现场`)
      }
      if (!initRealBefore.exists) {
        // 空对空永远"前后同值" ⇒ 这一组此刻**判不了**。挂起（HOLD）而不是绿，也不是红：
        // 真库还没开出来这一档本来就无从判（换台机器 / 重新克隆时就是这种态）。
        caseHold(rec, 'INIT-REAL-VACUOUS', `真实库 ${initRealBefore.root} 不在盘上 ⇒ 「跑前跑后同值」这一组判不了（空对空永远相等）。**这一格不是绿。**`)
      }

      // ── ③b `--real-mode`（**开关**，不是 op）：三条 + 一条只读正例 ──────────────
      // 它不在冻结 op 表里（`--op help` 照样 21 个），但"有行为就必须有用例"照样成立。
      // 🔴 死命令（文件头）：这几格里**任何一格**都不许让 `--real-mode` + 真实根 + 写 op 真跑起来。
      //    ⇒ 真实根那一侧**只用只读 op**（`entry-count`）；互斥闸是 **op 无关**的（跑在 op 分派之前），
      //      所以用只读 op 钉到的正是同一件事，却不用把真库押在"闸不会坏"上。
      const realModeBefore = brainPathsOf()
      const realModeResults = {}
      const runRealMode = (label, opts, strip) => {
        if (!brainCliOk) return null // 缺面已由 ③ 那条 SUT-SURFACE-MISSING 报过（同上）
        try {
          const res = runCli('agenia-brain.mjs', opts, { env: process.env, ...(strip ? { stripEnv: [ENV.RUN_ROOT] } : {}) })
          realModeResults[label] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null, args: res.args.join(' ') }
          return res
        } catch (err) {
          realModeResults[label] = { threw: String(err.message).slice(0, 160) }
          push('REAL-MODE-THREW', `${label}：跑不起来（连拒绝都没给出来）：${String(err.message).slice(0, 160)}`)
          return null
        }
      }
      const expectReject = (label, res, want) => {
        if (res === null) return
        if (res.exit_code === 0) {
          push('REAL-MODE-ACCEPTED', `${label} 竟然 exit 0 —— 这一格必须被 ${want} 拒：${res.stdout.trim().slice(0, 200)}`)
          return
        }
        const code = res.json?.error?.code ?? null
        if (code !== want) push('REAL-MODE-CODE', `${label} 应报 ${want}，实得 ${code ?? '(无码)'}：${res.stdout.trim().slice(0, 240)}`)
        const wantExit = FROZEN.exitCodes[want]
        if (typeof wantExit === 'number' && res.exit_code !== wantExit) {
          push('REAL-MODE-EXIT', `${label} 的 ${want} 应配退出码 ${wantExit}，实得 ${res.exit_code}`)
        }
      }

      // ① 不给开关 + 真实根 + **写 op** ⇒ `E_ROOT_REAL_BRAIN`（老行为没退化）
      //    🔴 两个写 op 都是**结构上写不出去**的（就算根判定那一道闸坏了，也写不进真实库）：
      //      · `init`：真实库非空 ⇒ op 自己就 `E_DATA_EXISTS`（D-B3），一个字节不写；
      //      · `audit-append`：空载荷缺 `kind` ⇒ 在 `appendAudit` **之前**被 `E_ARG_SCHEMA` 拒
      //        （这一只正是派工单点名的"光落一条审计就把真库写了"那条 op）。
      for (const op of ['init', 'audit-append']) {
        const label = `不给开关 · 真实根 · ${op}`
        expectReject(label, runRealMode(label, { op, testMode: true, extra: ['--data-root', sutRealBrain] }, false), 'E_ROOT_REAL_BRAIN')
      }

      // ② 给开关 + 真实根 + `--test-mode` ⇒ `E_ARG_SCHEMA`（**命门**：互斥闸）
      {
        const label = '给了开关 · 真实根 · --test-mode'
        expectReject(label, runRealMode(label, { op: 'entry-count', testMode: true, extra: ['--data-root', sutRealBrain, '--real-mode'] }, false), 'E_ARG_SCHEMA')
      }

      // ③ 给开关 + **非**真实根 ⇒ `E_ROOT_OUTSIDE`（专名闸：只认那一个根）
      //    必须剥 `AGENIA_TEST_RUN_ROOT`：留着它 ⇒ testMode 恒 true ⇒ 先撞互斥闸 ⇒ 永远看不到这一格。
      {
        const label = '给了开关 · 非真实根'
        const nonReal = scenarioWorkspace('DR-01', 'real-mode-nonreal')
        expectReject(label, runRealMode(label, { op: 'entry-count', testMode: false, extra: ['--data-root', nonReal, '--real-mode'] }, true), 'E_ROOT_OUTSIDE')
      }

      // ★ 正例（端到端）：开关真能把门打开 —— 打在一个**装好的**预设上。
      //   没有这一条，上面那三条"被拒"就可能是"命令坏了蒙对"（§9.5 第 1 条：正例必须存在）。
      //   `entry-count` / `state-read` / `report-read` 全是**只读** op ⇒ 库一个字节都不会变
      //   （死命令允许的正是这一类；这一格自己量前后树哈希，见下面的 `REAL-MODE-WROTE`）。
      //
      //   🔴 `T-TEST-02` 那条口径不变：靶子还是 **SUT 自己算出来的** `REAL_BRAIN_ROOT`
      //      （`<预设目录>/.runtime`），**不由用例写死**。旧版打的是 staging 里那份 preset，
      //      而 staging 是**开发副本**、盘上没有 `.runtime` ⇒ 只能是第三态 HOLD
      //      （`REAL-MODE-POSITIVE-VACUOUS`：不是绿、也不是红，是判不了）。
      //      文件头那条死命令又不许在 staging 里造一个假库（会污染后续每一跑）。
      //   ⇒ 两件事同时成立时的解法只有一个：**换到"装好的位置"上**（本文件那句
      //      "换到装好的位置上它自己会绿"就是这么写的）：
      //      ① `support/installed.mjs` 把 staged preset 整棵拷进**运行根**（装好的预设）；
      //      ② `support/min-runtime.mjs` 把最小数据段摆在**副本自己算出来的那个 `.runtime`** 上；
      //      ③ 跑**副本的** `bin/agenia-brain.mjs`：真子进程、真参数、真根判定、真 op。
      //      staging 本体与 `presets/agenia` 本体：一个字节都不动。
      //
      //   🔴 这一格**不只判"exit 0"**：读数必须与盘上那份文件对得上（版本 / 条目数 / 字符数 /
      //      `day` / `derived:false`），**而且格里要把夹具抽走一次**（改名搬开 ⇒ 该报 `E_DATA_MISSING`）——
      //      否则"开关打开了"这句话，一个恒定返回 ok 的实现也能满足（`mig-rules-14`）。
      //      抽走之后**必须放回去**，并且树哈希要与抽走前逐字节相同。
      {
        const label = '给了开关 · 装好的预设 · 只读 op（正例）'
        const installed = installedPreset('DR-01', 'installed', process.env)
        const installedPaths = await loadInstalledModule(installed, 'lib/paths.mjs', ['REAL_BRAIN_ROOT'])
        const installedRealBrain = installedPaths.mod?.REAL_BRAIN_ROOT ?? null
        const expectRealBrain = path.join(installed.presetRoot, '.runtime')
        rec.readings.installed_preset = {
          scenario_dir: installed.dir,
          preset_root: installed.presetRoot,
          source: installed.source,
          source_runtime_present: installed.source_runtime_present,
          real_brain: installedRealBrain,
          expect_real_brain: expectRealBrain,
        }
        realModeResults[label] = { preset_root: installed.presetRoot, real_brain: installedRealBrain }

        if (installedPaths.mod === null) {
          push('INSTALLED-SURFACE', `装好的副本里 lib/paths.mjs 载不进来（${installedPaths.errors.join(' / ')}）⇒ 端到端正例没有靶子`)
        } else if (typeof installedRealBrain !== 'string' || installedRealBrain === '') {
          push('INSTALLED-REAL-ROOT', '装好的副本里 lib/paths.mjs 没有导出 REAL_BRAIN_ROOT ⇒ 端到端正例没有靶子')
        } else if (canonical(installedRealBrain) !== canonical(expectRealBrain)) {
          push('INSTALLED-REAL-ROOT', `副本里的真实脑根必须**跟着预设目录走**（F4 的不变量）：实得 ${installedRealBrain}，应为 ${expectRealBrain}`)
        } else if (!canonical(installedRealBrain).startsWith(canonical(installed.dir))) {
          push('INSTALLED-REAL-ROOT', `副本算出来的真实脑根跑出了运行根（${installedRealBrain} ⊄ ${installed.dir}）—— 夹具绝不许落在运行根之外`)
        } else if (MIN_RUNTIME_FIXTURE === null) {
          // 夹具读不到 ⇒ 这一格**点名红**（不是绿、也不是"命令坏了蒙对"）。把文件放回去就恢复。
          push(
            'MIN-RUNTIME-FIXTURE-MISSING',
            `端到端正例要的那份**最小 \`.runtime\`**（数据段）读不到：\`tests/agenia-upgrade/support/min-runtime.mjs\`（${MIN_RUNTIME_FIXTURE_MISSING}）。`
            + '装好的副本里那个 `.runtime` 的 8 份数据段（快照链 / 指针 / 当日状态 / 记忆更新报告 / 常识与它的三处哈希）'
            + '与 5 个空目录全由它摆 —— 没有它，`entry-count` / `state-read` / `report-read` 一个都跑不起来，'
            + '这一格就退化成"开关打开了却什么都没读"（`REAL-MODE-POSITIVE-VACUOUS` 那个第三态）。'
            + '修法：把那份夹具放回去（它不是期望值，是数据段；`presets/agenia/.runtime` 与 staging 一个字节都不碰）',
          )
          realModeResults[label].fixture = { ok: false, missing: 'support/min-runtime.mjs', why: MIN_RUNTIME_FIXTURE_MISSING }
        } else {
          // ① 夹具落盘 + 自洽（盘上那棵树 vs 声明 vs 测试侧独立重算，三者对不上先在这里点名）
          const made = materializeMinimalRuntime(installedRealBrain, MIN_RUNTIME)
          const checked = verifyMinimalRuntime(installedRealBrain, MIN_RUNTIME)
          rec.readings.min_runtime = {
            root: installedRealBrain,
            files: made.files.map((f) => f.rel),
            file_count: made.files.length,
            dirs: made.dirs,
            verify_ok: checked.ok,
            verify_problems: checked.problems,
            readings: checked.readings,
          }
          realModeResults[label].fixture = { root: installedRealBrain, file_count: made.files.length, dir_count: made.dirs.length, verify_ok: checked.ok }
          for (const p of checked.problems) push(p.code, p.detail)

          // 只读 op 一律走**副本的** CLI；`--real-mode` 与 `AGENIA_TEST_RUN_ROOT` 互斥 ⇒ 必须剥。
          const runInstalled = (op, inFile) => runCli('agenia-brain.mjs', {
            op,
            dataRoot: installedRealBrain,
            inFile,
            testMode: false,
            extra: ['--real-mode'],
          }, { env: process.env, stripEnv: [ENV.RUN_ROOT], cliPath: installed.brainCli })

          const treeBefore = treeHash(installedRealBrain)
          const want = MIN_RUNTIME.expect

          // ② `entry-count`：开关真能把门打开，且读出来的是**盘上那份文件**里的数
          const pos = runInstalled('entry-count')
          realModeResults[label].entry_count = {
            exit_code: pos.exit_code,
            code: pos.json?.error?.code ?? null,
            snapshot: pos.json?.snapshot ?? null,
            count: pos.json?.count ?? null,
            chars: pos.json?.chars ?? null,
          }
          if (pos.exit_code !== 0 || pos.json?.ok !== true) {
            push('REAL-MODE-POSITIVE', `${label} 必须成功（开关真能把门打开），实得 exit=${pos.exit_code} / ${pos.json?.error?.code ?? '(无码)'}：${pos.stdout.trim().slice(0, 240)}`)
          } else {
            if (pos.json.snapshot !== want.version) push('REAL-MODE-POSITIVE-READING', `${label} 报的快照版本 = ${JSON.stringify(pos.json.snapshot)}，夹具里是 ${want.version}`)
            if (pos.json.count !== want.count) push('REAL-MODE-POSITIVE-READING', `${label} 报的条目数 = ${JSON.stringify(pos.json.count)}，盘上那份快照里是 ${want.count} 条`)
            if (pos.json.chars !== want.chars) push('REAL-MODE-POSITIVE-READING', `${label} 报的字符数 = ${JSON.stringify(pos.json.chars)}，重算是 ${want.chars}`)
            const wantTotals = { count: want.count, chars: want.chars }
            if (JSON.stringify(pos.json.totals) !== JSON.stringify(wantTotals)) {
              push('REAL-MODE-POSITIVE-READING', `${label} 报的 totals = ${JSON.stringify(pos.json.totals)}，盘上那份快照声明的是 ${JSON.stringify(wantTotals)}`)
            }
          }

          // ③ `state-read`：读到的**那一天**只能来自盘上的 `current-day` 指针 ——
          //    运行根注入的时钟是 `MIN_RUNTIME.clockDay`（另一个日子），所以"读对了日子"这件事分得开。
          const st = runInstalled('state-read')
          realModeResults[label].state_read = { exit_code: st.exit_code, code: st.json?.error?.code ?? null, day: st.json?.day ?? null, day_source: st.json?.day_source ?? null }
          if (st.exit_code !== 0 || st.json?.ok !== true) {
            push('REAL-MODE-POSITIVE-READING', `${label}（state-read）必须成功，实得 exit=${st.exit_code} / ${st.json?.error?.code ?? '(无码)'}：${st.stdout.trim().slice(0, 240)}`)
          } else {
            if (st.json.day !== MIN_RUNTIME.day) push('REAL-MODE-POSITIVE-READING', `${label}（state-read）的 day = ${JSON.stringify(st.json.day)} ≠ 夹具里的 ${MIN_RUNTIME.day}`)
            if (st.json.day_source !== 'pointer') push('REAL-MODE-POSITIVE-READING', `${label}（state-read）的 day_source = ${JSON.stringify(st.json.day_source)}，应是 pointer（否则"读到了那一天"这句话说不清）`)
            if (st.json.state?.phase !== 'unclaimed') push('REAL-MODE-POSITIVE-READING', `${label}（state-read）的 phase = ${JSON.stringify(st.json.state?.phase)}，夹具里是 unclaimed`)
          }

          // ④ `report-read`：`derived:false` 只可能在"报告文件真的在盘上"时出现 —— 那正是夹具里那份壳。
          const rep = runInstalled('report-read')
          realModeResults[label].report_read = { exit_code: rep.exit_code, code: rep.json?.error?.code ?? null, day: rep.json?.day ?? null, derived: rep.json?.derived ?? null }
          if (rep.exit_code !== 0 || rep.json?.ok !== true) {
            push('REAL-MODE-POSITIVE-READING', `${label}（report-read）必须成功，实得 exit=${rep.exit_code} / ${rep.json?.error?.code ?? '(无码)'}：${rep.stdout.trim().slice(0, 240)}`)
          } else {
            if (rep.json.day !== MIN_RUNTIME.day) push('REAL-MODE-POSITIVE-READING', `${label}（report-read）的 day = ${JSON.stringify(rep.json.day)} ≠ ${MIN_RUNTIME.day}`)
            if (rep.json.derived !== false) push('REAL-MODE-POSITIVE-READING', `${label}（report-read）报 derived=${JSON.stringify(rep.json.derived)} —— 报告文件在盘上时必须是 false（true = 它现算的，那份壳没被读）`)
            if (rep.json.report?.snapshot !== want.version) push('REAL-MODE-POSITIVE-READING', `${label}（report-read）里 report.snapshot = ${JSON.stringify(rep.json.report?.snapshot)} ≠ ${want.version}`)
          }

          // ⑤ 零写入：三个只读 op 跑完，库的树哈希必须与跑之前逐字节相同
          const treeAfterReads = treeHash(installedRealBrain)
          rec.readings.min_runtime.after_reads = { exists: treeAfterReads.exists, count: treeAfterReads.count, sha256: treeAfterReads.sha256 }
          if (treeAfterReads.sha256 !== treeBefore.sha256) {
            push('REAL-MODE-WROTE', `只读 op 改动了库（${treeBefore.count} 份/${String(treeBefore.sha256).slice(0, 16)} → ${treeAfterReads.count} 份/${String(treeAfterReads.sha256).slice(0, 16)}）—— 只读 op 一个字节都不许写`)
          }

          // ⑥ 格内阳性对照：把夹具**抽走**，同一条命令必须失败（且必须是"数据不在"那种失败）。
          //    没有这一步，"exit 0"可以由一个不看盘、恒定返回 ok 的实现满足。
          let quarantined = null
          try {
            quarantined = quarantineRuntime(installedRealBrain)
            const gone = runInstalled('entry-count')
            realModeResults[label].ablation_without_runtime = {
              moved_to: quarantined.movedTo,
              exit_code: gone.exit_code,
              code: gone.json?.error?.code ?? null,
            }
            if (gone.exit_code === 0) {
              push('REAL-MODE-POSITIVE-FIXTURE', '把 `.runtime` 整个搬走之后 entry-count 仍然 exit 0 ⇒ 这个读数不是从那个目录里读出来的（夹具不承重）')
            } else if ((gone.json?.error?.code ?? null) !== 'E_DATA_MISSING') {
              push('REAL-MODE-POSITIVE-FIXTURE', `搬走 .runtime 之后应报 E_DATA_MISSING，实得 ${gone.json?.error?.code ?? '(无码)'} / exit=${gone.exit_code}：${gone.stdout.trim().slice(0, 240)}`)
            }
          } finally {
            if (quarantined !== null) restoreQuarantinedRuntime(quarantined)
          }
          const back = runInstalled('entry-count')
          realModeResults[label].restored_exit_code = back.exit_code
          if (back.exit_code !== 0) {
            push('REAL-MODE-POSITIVE-RESTORE', `夹具放回原位之后这一格必须重新成功，实得 exit=${back.exit_code} / ${back.json?.error?.code ?? '(无码)'}：${back.stdout.trim().slice(0, 240)}`)
          }
          const treeRestored = treeHash(installedRealBrain)
          rec.readings.min_runtime.after_restore = { exists: treeRestored.exists, count: treeRestored.count, sha256: treeRestored.sha256 }
          if (treeRestored.sha256 !== treeBefore.sha256) {
            push('REAL-MODE-POSITIVE-RESTORE', `夹具搬走→放回之后库的树哈希变了（${String(treeBefore.sha256).slice(0, 16)} → ${String(treeRestored.sha256).slice(0, 16)}）—— 还原不是逐字节的`)
          }
        }
      }
      const realModeAfter = brainPathsOf()
      const realModeViolation = brainDiff(realModeBefore, realModeAfter, '--real-mode 那一组期间')
      rec.readings.real_mode = {
        before: summarizeBrain(realModeBefore),
        after: summarizeBrain(realModeAfter),
        diff: realModeViolation === null ? [] : [{ code: realModeViolation.code, message: realModeViolation.message }],
        judged: witnessJudged,
        cases: realModeResults,
      }
      if (witnessJudged && realModeViolation !== null) {
        push(realModeViolation.code, `真实库在 --real-mode 那一组里被改动了：${realModeViolation.message} —— 立即停测并报事故`)
      }

      // ── ④ 零写入 / 真实脑根**路径集合**不变（`bug-20261106-20`）────────────────────
      // 🔴 判据是「**前后同值**」，**不是**"它必须不存在"。
      //    旧断言 `existsSync(REAL_BRAIN_ROOT) ⇒ SECURITY-VIOLATION` 的前提（"本轮真实根必须不存在"）
      //    2026-10-15 已作废：真实库那天起就是**真数据**（`--op init-real` 亲手开过，exit 0）。
      //    留着它 = 每天都红、而红的原因跟"有没有人写它"无关 —— 假红比不红更坏（AGENTS.md §6）。
      // 🔴 量的东西也换了：**路径集合**（不是内容哈希）—— 内容有多个合法来源，见 `brainPathsOf` 上面那段。
      const realAfter = brainPathsOf()
      const realViolation = brainDiff(realBefore, realAfter, 'DR-01 期间')
      rec.readings.real_brain = {
        before: summarizeBrain(realBefore),
        after: summarizeBrain(realAfter),
        diff: realViolation === null ? [] : [{ code: realViolation.code, message: realViolation.message }],
        exists: realBefore.exists,
        /** 🔴 **这一格判过没有**（`M1`）：根不在盘上 ⇒ `judged:false` + HOLD，不拿"没变"当读数。 */
        judged: witnessJudged,
        witness_root: { root: realRoot, source: witness.source },
        /**
         * 读数口径（`M1`）：`171 = 171` 这类份数是**活树**的读数 —— 真脑根住在活体预设里
         * （`presets/agenia/.runtime`），只读副本 / worktree 里没有它。副本里要判，显式给
         * `AGENIA_LIVE_BRAIN_ROOT`；不给就记 HOLD，**不许**把空对空读成"没变"。
         */
        basis: witness.source.startsWith('env:') ? 'explicit-witness-root' : 'live-tree (derived)',
        note: '份数是**活树**的读数：真脑根住在活体预设里；副本 / worktree 里它不在盘上 ⇒ 这一格记 HOLD（`DR01-BRAIN-WITNESS-ABSENT`），不是绿',
        /**
         * 🔴 **`M1` 的 HOLD 语义**（第 1 轮评审要求"写在读数里，不只写在契约里"）：
         *   · HOLD 是第三态：`runCase` 的 `rec.result` · 结算的 `hold_cases` 逐条列 · 入口 `exit 2` ·
         *     以及 `HOLD > 0` 时 `F57-OK` **一个都不出**（`verdict.mjs` / `run-all.mjs`）；
         *   · **红压过 HOLD**（`evidence.mjs:479` 的 `runCase`）：有红就是 RED，HOLD 洗不白一条红；
         *   · ⇒ **#5 的证据必须是"活树那一跑"**：副本里这个根不在盘上 ⇒ HOLD；要在一份只读副本里判它，
         *     必须显式给 `AGENIA_LIVE_BRAIN_ROOT=<活体预设>/.runtime`（那一跑同样算证据，但**默认**证据是活树）。
         */
        hold_semantics: {
          third_state: 'HOLD',
          read_at: [
            'rec.result 的第三态（runCase：RED 压过一切；没有红但有 HOLD ⇒ HOLD）',
            'settlement.settled.hold_cases（逐条列出 code / why）',
            '入口 verdict 的 exit 2（F57-FAIL 有 HOLD 那一条）',
            'HOLD > 0 时 F57-OK 一个都不出（verdict.mjs / run-all.mjs）',
          ],
          red_beats_hold: 'evidence.mjs:479（runCase）：rec.result = RED 优先；HOLD 洗不白一条红',
          evidence_must_be: '这一格的证据必须是**活树**那一跑；副本 / worktree 里没有 presets/agenia/.runtime ⇒ HOLD。要在副本里判，显式给 AGENIA_LIVE_BRAIN_ROOT=<活体预设>/.runtime',
        },
        witness: 'treePaths（路径集合）· 内容不判',
        /**
         * 🔴 残余风险 —— 读的人不必去翻决定书（`决定-DR02的brain见证.md` §二/§三）：
         * "就地覆盖"不在这一格的覆盖范围；兜它的是 `--real-mode` 的 `E_ROOT_REAL_BRAIN`。
         * 另一方向是**残余误报**：别的会话在窗口里新增 / 删除一个路径，同样会红（假红，不是假绿）。
         */
        content_uncovered: {
          root: 'brain',
          what: '已存在文件被就地覆盖（内容改、路径不变）',
          note: '`brain` 的见证是**路径集合**（新增 / 删除）；已存在文件被就地覆盖（内容改、路径不变）不在这条判据的覆盖范围。',
          covered_by: ['DR-01 --real-mode ⇒ E_ROOT_REAL_BRAIN'],
          cli_inventory: 'lib/cli-inventory.mjs 只是枚举命令，不判它会写哪儿 —— 不是闸',
          residual_false_positive: '别的会话在窗口内新增 / 删除路径会被判成 SECURITY-VIOLATION（假红，不是假绿）',
          window: 'DR-01 整段用例（不是每个 CLI 子调用一个窗口 —— 那是 DR-02 的口径；这一段比 DR-02 的窗口长）',
        },
      }
      if (witnessJudged && realViolation !== null) {
        push(realViolation.code, `真实库在 DR-01 期间被改动：${realViolation.message} —— 立即停测并报事故，不许自行清理现场`)
      }

      // ── ④c `DR-01` 的路径集合见证：两把刀（**副本**脑根；真根一个字节都不许碰）──────────
      // 与 `DR-02` 的 ④c 同形：刀走产品那条路（`realRootsSnapshot({ brainRoot })`），
      // 读**同一个** `brainWitnessViolation()` ⇒ 刀响 = ④ 响。
      //   · A（正向）：副本里**新建**一个文件 ⇒ 必须 `SECURITY-VIOLATION` 并点名那个路径；
      //   · B（反向）：副本里既有文件**只改内容**、路径不变 ⇒ **必须不报**
      //     （这一格是"内容不再是 `brain` 的判据"的证明；没有它，把内容哈希偷偷加回来照样全绿）。
      const brainKnifeRoot = path.join(runRoot(), 'fixtures', 'dr01-brain-knife')
      const brainCopied = copyRealBrainForKnife(brainKnifeRoot, realRoot)
      const knifeIsCopy = canonical(brainKnifeRoot) !== canonical(realRoot)
      const b0 = knifeIsCopy ? brainPathsOf(brainKnifeRoot) : null
      const knifeShape = b0 === null ? '副本没造出来' : pathSetShapeProblem(b0)
      /** `M1`：见证根不在盘上 ⇒ 拷出来的是空目录 ⇒ **刀量不了**。记 HOLD，不许让空刀架当绿。 */
      const knifeJudged = witnessJudged && knifeIsCopy && knifeShape === null && b0.exists === true && b0.count > 0
      const brainCells = []
      const bcell = (label, ok, code, detail) => {
        brainCells.push({ label, ok, detail })
        if (!ok) problems.push(problem(code, detail))
      }
      if (!knifeIsCopy) {
        push('DR01-BRAIN-KNIFE-NOT-A-COPY', `硬闸：目标 ${brainKnifeRoot} 就是真实脑根 —— 不拷、不写、刀不跑`)
      } else if (!knifeJudged) {
        caseHold(rec, 'DR01-BRAIN-KNIFE-UNJUDGED',
          `DR-01 的两把刀量不了：见证根 ${realRoot}（来源 ${witness.source}）${witnessJudged ? '在盘上，但副本' : '不在盘上 ⇒ 拷出来的副本'}`
          + `只有 ${b0?.count ?? 0} 份（拷贝器自报 ${brainCopied.files} 份）· 形状 ${knifeShape ?? 'ok'}`
          + ' —— 刀架是空的，这一格**不是绿**。要量活体那个根就显式给 '
          + `${ENV.LIVE_BRAIN_ROOT}`)
      }
      if (knifeJudged) {
        const STRAY_REL = 'dr01-stray-write.txt'
        writeFileSync(path.join(brainKnifeRoot, STRAY_REL), 'stray\n', 'utf8')
        const b1 = brainPathsOf(brainKnifeRoot)
        const vAdd = brainDiff(b0, b1, '副本里新建一个文件之后（DR-01 的刀）')
        bcell(
          '副本里新建一个文件 ⇒ `SECURITY-VIOLATION` 必须响，且报文点名那个路径',
          existsSync(path.join(brainKnifeRoot, STRAY_REL)) && vAdd?.code === 'SECURITY-VIOLATION' && String(vAdd.message).includes(STRAY_REL),
          'DR01-BRAIN-KNIFE-ADD-NOFLIP',
          `b0 ${b0.count} 份 → b1 ${b1.count} 份；判定=${vAdd?.code ?? '(没响)'}`
            + ` · 报文点名 \`${STRAY_REL}\`=${String(vAdd?.message ?? '').includes(STRAY_REL)}`
            + ' —— 不响说明"多一个文件"这条判据早就死了，绿是假的',
        )
        const victim = b0.paths[0] ?? null
        let shaBefore = null
        let shaAfter = null
        let vContent = null
        let b2 = null
        if (victim !== null) {
          const victimFile = path.join(brainKnifeRoot, victim)
          shaBefore = sha256File(victimFile)
          writeFileSync(victimFile, `${readFileSync(victimFile, 'utf8')}\n// dr01-knife\n`, 'utf8')
          shaAfter = sha256File(victimFile)
          b2 = brainPathsOf(brainKnifeRoot)
          vContent = brainDiff(b1, b2, '副本里只改一个既有文件的内容之后（DR-01 的刀）')
        }
        bcell(
          victim === null
            ? '副本里**没有既有文件** ⇒ 反向刀打不出去（"只改内容不许报"这一格量不到）'
            : `副本 \`${victim}\` 只改内容（sha 变了）、路径不变 ⇒ **不许报**违规`,
          victim !== null && shaBefore !== shaAfter && vContent === null,
          'DR01-BRAIN-KNIFE-CONTENT-FLIPS',
          victim === null
            ? `副本 ${brainKnifeRoot} 里 0 份文件（拷贝器自报 ${brainCopied.files} 份）—— 反向刀打不出去`
            : `\`${victim}\` sha ${String(shaBefore).slice(0, 12)} → ${String(shaAfter).slice(0, 12)}`
              + ` · 路径份数 ${b1.count} → ${b2?.count} · 判定=${vContent?.code ?? '(没响 = 对)'}`
              + ' —— 响了就是把"别人的正常干活"算到这一跑头上（内容不许再当 `brain` 的判据）',
        )
        bcell(
          '副本份数与**真根基线**路径份数相同（锚在 before.count，不是副本自报）',
          b0.count === realBefore.count && realBefore.count > 0,
          'DR01-BRAIN-KNIFE-NOT-A-COPY',
          `副本 ${brainKnifeRoot} · 快照量的路径=${b0.path} · 副本份数=${b0.count} · 真根基线份数=${realBefore.count}`
            + ` · 拷贝器自报=${brainCopied.files}（**只当读数，不当锚**）—— 半份副本会让两把刀失去意义`,
        )
      }
      if (knifeJudged && brainCells.length !== 3) {
        push('DR01-BRAIN-WITNESS-UNGUARDED', `DR-01 路径集合见证的刀架没跑全：${brainCells.length} 格（应为 3）`)
      }
      rec.readings.brain_witness = {
        real_root: realRoot,
        real_root_source: witness.source,
        copy: brainKnifeRoot,
        snapshot_via: 'realRootsSnapshot({ brainRoot })',
        copy_files_reported: brainCopied.files,
        real_baseline_count: realBefore.count,
        copy_is_not_real_root: knifeIsCopy,
        knife_shape: knifeShape,
        knife_judged: knifeJudged,
        judged: witnessJudged,
        /**
         * 🔴 这一份的**证据口径**（`M1` / 第 1 轮评审）：`171 = 171` 是**活树**的读数 ——
         * 真脑根住在活体预设里（`presets/agenia/.runtime`），只读副本 / worktree 里**没有它**。
         * ⇒ 这一段（两把刀 + 逐份对账）的证据只可能来自**活树那一跑**；副本里要判，显式给
         * `AGENIA_LIVE_BRAIN_ROOT`。不给就记 HOLD（`DR01-BRAIN-KNIFE-UNJUDGED`），不是绿。
         */
        evidence_basis: witness.source.startsWith('env:') ? 'explicit-witness-root (copy run allowed)' : 'live-tree run (this is the default evidence)',
        note: '171 = 171 是**活树**的读数：真脑根住在活体预设里；副本 / worktree 里它不在盘上 ⇒ 这一段记 HOLD，不是绿',
        cells: brainCells,
      }
      /**
       * 段外兜底（同 `DR-02` 的 ④ 段外兜底）：整段删掉时 problems 仍是 0 ⇒ 这一段必须自己读一次读数。
       * 🔴 **`M1` 起两条出路都算"有落点"**：要么**判过**（`judged:true` 且刀架 3 格），
       *    要么**明确记了 HOLD**（`DR01-BRAIN-WITNESS-ABSENT` / `DR01-BRAIN-KNIFE-UNJUDGED`）。
       *    只判 `Array.isArray(cells)` 的话，空刀架 + 空见证就是一条**绿**（评审抓到的那一版）。
       */
      {
        const rw = rec.readings.real_brain
        const bw = rec.readings.brain_witness
        const holdCodes = new Set(rec.holds.map((h) => h.code))
        const witnessExit = rw?.judged === true || holdCodes.has('DR01-BRAIN-WITNESS-ABSENT')
        const knifeExit = (Array.isArray(bw?.cells) && bw.cells.length === 3) || holdCodes.has('DR01-BRAIN-KNIFE-UNJUDGED')
        if (!rw?.content_uncovered || !rw?.witness_root?.root || !witnessExit || !knifeExit) {
          push('DR01-BRAIN-WITNESS-UNGUARDED',
            `DR-01 的路径集合见证没有落点：读数=${rw?.content_uncovered ? '有' : '缺'}`
            + ` · 见证根=${rw?.witness_root?.root ?? '(缺)'}（来源 ${rw?.witness_root?.source ?? '?'}）`
            + ` · judged=${JSON.stringify(rw?.judged ?? null)} · 刀架=${Array.isArray(bw?.cells) ? `${bw.cells.length} 格` : '(无)'}`
            + ` · HOLD=${JSON.stringify([...holdCodes])} —— 判过要有 3 格刀、判不了要有 HOLD；两条都没有就是"没量到"冒充"没变"`)
        }
      }

      caseFail(problems)
    })
  })

  test('DR-02 所有可写命令只落测试根；真实脑路径集合每个 CLI 子调用窗口内不变（内容不判）；临时件全在 E 盘', async () => {
    await runCase('DR-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      // ④ 的**基线采样**：只用来钉副本份数（`before.brain.count`）与输入形状 —— **不是**见证窗口。
      // 见证 = 下面每个真正碰 CLI 的子调用各自那一对快照（MF-2 / 决定 §五.2：窗口从 15.9 s 压到子调用）。
      const witness = brainWitnessRoot()
      const before = realRootsSnapshot({ brainRoot: witness.root })
      // 🔴 **形状评估计数器**（2026-11-07 MF-3）：形状格的每一次输入检查都从这里过。
      // 形状格自守读**两样**：评估次数（零窗口时 `ok:true` 是真的，但"空样本上没发现坏形状"不是证据，
      // 评审 §三.3）**和判决**（MF-4：`ok:false` 必须真的进了 `problems`，否则报告那一行被摘掉就 0 红）。
      let shapeCellEvaluations = 0
      const evalShape = (snap) => {
        shapeCellEvaluations += 1
        return pathSetShapeProblem(snap)
      }
      const baselineShape = evalShape(before.brain)
      /**
       * 🔴 **`M1` 的同一条病也在这里**（batch 8 评审只点了 `DR-01`，但形状一模一样：副本里
       * `PATHS.realBrainRoot` 不存在 ⇒ 前后都 `exists:false` ⇒ 窗口"没变" ⇒ 绿）。⇒ 见证根不在盘上时
       * `witnessUsable=false` + HOLD（`DR02-BRAIN-WITNESS-ABSENT`），窗口只记读数不判。
       */
      const witnessRootPresent = before.brain.exists === true
      const witnessUsable = baselineShape === null && witnessRootPresent
      if (!witnessRootPresent) {
        caseHold(rec, 'DR02-BRAIN-WITNESS-ABSENT',
          `真脑根（写保护见证）不在盘上：${before.brain.path}（来源 ${witness.source}）⇒ 每个窗口的前后都是"不存在"，`
          + '路径集合"没变"是**空对空**，这一格判不了。**不是绿。** 要量活体那个根就把 '
          + `${ENV.LIVE_BRAIN_ROOT} 指向 <活体预设>/.runtime 再跑；不要拿 AGENIA_REPO_ROOT 把整棵树钉回活树（那会红 MCR-03）`)
      }
      const windows = []
      const round3 = (v) => Math.round(v * 1000) / 1000
      /**
       * 夹住**一个 CLI 子调用**：快照 → 调用 → 快照。窗口里判三格（brain 路径集合 / route 内容 /
       * livePreset 内容），三格都走真跑**同一个**比较函数。
       * `witnessUsable=false`（产品快照形状坏了）⇒ 只记读数、不判 —— 那一跑的红归 ④ 的形状格
       * （`DR02-BRAIN-WITNESS-SHAPE`），不把同一句话重复二十遍。
       */
      const witnessWindow = (label, fn) => {
        const t0 = process.hrtime.bigint()
        const b = realRootsSnapshot({ brainRoot: witness.root })
        const t1 = process.hrtime.bigint()
        let value
        try {
          value = fn()
        } finally {
          const t2 = process.hrtime.bigint()
          const a = realRootsSnapshot({ brainRoot: witness.root })
          const t3 = process.hrtime.bigint()
          const shapeBefore = evalShape(b.brain)
          const shapeAfter = evalShape(a.brain)
          const w = {
            label,
            call_ms: round3(Number(t2 - t1) / 1e6),
            snapshot_ms: round3((Number(t1 - t0) + Number(t3 - t2)) / 1e6),
            window_ms: round3(Number(t3 - t0) / 1e6),
            at: { before: b.at, after: a.at },
            brain: {
              before: { exists: b.brain.exists, count: b.brain.count },
              after: { exists: a.brain.exists, count: a.brain.count },
            },
            shape: { before: shapeBefore, after: shapeAfter },
            judged: witnessUsable && shapeBefore === null && shapeAfter === null,
            brain_diff: null,
            route_changed: false,
            live_preset_changed: false,
          }
          if (w.judged) {
            const d = pathSetDiff(b.brain, a.brain)
            w.brain_diff = d === null ? null : { added: d.added, removed: d.removed, same: d.same }
            const brainProblem = brainWitnessViolation({ brain: b.brain }, { brain: a.brain }, `子调用「${label}」期间`)
            if (brainProblem !== null) problems.push(brainProblem)
            if (b.route.exists !== a.route.exists || (b.route.exists && b.route.sha256 !== a.route.sha256)) {
              w.route_changed = true
              push('SECURITY-VIOLATION', `真实根 route 在子调用「${label}」期间被改动（${b.route.exists ? b.route.sha256 : '不存在'} → ${a.route.exists ? a.route.sha256 : '不存在'}）—— 立即停测并报事故`)
            }
            const liveProblem = livePresetViolation({ livePreset: b.livePreset }, { livePreset: a.livePreset }, `子调用「${label}」期间`)
            if (liveProblem !== null) {
              w.live_preset_changed = true
              problems.push(liveProblem)
            }
          } else {
            w.brain_diff = '(未判：输入形状不对)'
          }
          windows.push(w)
        }
        return value
      }

      // 🔴 **子调用计数器**（2026-11-07 MF-3）：**每一个真正发出去的 CLI 子调用**都从
      // `bracketedCli` 过，与 `witnessWindow` 分开记。
      // 为什么分开：`witnessWindow` 自己坏掉（例如函数体换成 `return fn()`）时，窗口数组是 0，
      // 而这个数照样是 28 —— 两者不等 ⇒ 收口那一格必须红（评审 §三.3 的那个洞）。
      let cliCalls = 0
      const bracketedCli = (label, fn) => {
        cliCalls += 1
        return witnessWindow(label, fn)
      }

      // ── 副本脑根：**基线之后立刻拷贝**（真根只读；写面只落运行根）──────────────────────────
      // 为什么这么早：`DR02-BRAIN-KNIFE-NOT-A-COPY` 的份数锚是 `before.brain.count`——
      // 锚与副本之间只许隔一次拷贝；隔上十几个子调用，"别人在这十几秒里正常新增一个文件"
      // 就会把这一格刷成假红（残余误报），而那不是这条判据要抓的东西。
      const brainKnifeRoot = path.join(canonical(requireEnv(ENV.RUN_ROOT)), 'dr02-brain-copy')
      // 🔴 硬闸：目标不是副本就**不拷、不写** —— "真根只读"是本文件的死命令（见文件头）。
      const knifeIsCopy = canonical(brainKnifeRoot) !== canonical(witness.root)
      const brainCopied = knifeIsCopy ? copyRealBrainForKnife(brainKnifeRoot, witness.root) : { files: 0 }
      const b0snap = knifeIsCopy ? realRootsSnapshot({ brainRoot: brainKnifeRoot }) : null
      const b0 = b0snap?.brain ?? { path: null, exists: false, count: 0, paths: [] }
      const knifeShape = knifeIsCopy ? pathSetShapeProblem(b0) : '不是副本（硬闸）'
      const knifeJudged = knifeIsCopy && witnessUsable && knifeShape === null

      const bp = brainPaths()
      const inv = await loadStagedModule('lib/cli-inventory.mjs', [])
      const commands = Array.isArray(inv.mod?.COMMANDS) ? inv.mod.COMMANDS : null
      if (commands === null) {
        push('SUT-SURFACE-MISSING', 'staged/lib/cli-inventory.mjs（或它的 COMMANDS）不在 ⇒ DR-02 的清单分母拿不到（预期的首跑红）')
      }
      // 🔴 ④ 的**期望调用数**（floor：2026-11-07 MF-3 起判，MF-4 这一轮把分母钉到**冻结表**）——
      //   分母**不许和循环变量同源**（评审 r4 §四.1）：① 循环遍历的 `needsDataRootOps` 来自
      //   `lib/cli-inventory.mjs`；把它的过滤改成 `.filter(() => false)` ⇒ 循环跑 0 条、期望数也
      //   跟着变 5（1 + 4 作业）⇒ ① 真空绿、窗口格照旧绿。期望与循环同源 = 两边一起缩。
      //   · `FROZEN_COMMANDS.filter(c => c.needsDataRoot)` = **第二个分母**（`DR-01` 已用它逐条对账）；
      //     清单缩水时它不缩 ⇒ 刀在这一格红；
      //   · `+ 1` = ② 那条正向 `init` 的**一个**调用点；
      //   · `FROZEN.jobs` 就是 ③ 循环自己遍历的那个数组（`bg-notify` 不在 staging 时那 4 个调用点跑不到）。
      // 将来谁把某个子调用移出 `witnessWindow`（直接 `runCli`），窗口数就比这个数少 ⇒
      // `DR02-BRAIN-WINDOWS-UNGUARDED` 红。
      const needsDataRootOps = (commands ?? []).filter((c) => c.needsDataRoot === true)
      const frozenDataRootOps = FROZEN_COMMANDS.filter((c) => c.needsDataRoot === true)
      const jobsWired = stagingExists(path.join('bin', 'bg-notify.mjs'))
      const expectedCliCalls = frozenDataRootOps.length + 1 + (jobsWired ? FROZEN.jobs.length : 0)

      // ① 每个 needsDataRoot 的命令在合法测试根上跑一遍，产物必须全在测试根里
      const runResults = {}
      for (const cmd of needsDataRootOps) {
        const payloadFile = writeFixture('DR-02', cmd.op.slice(0, 40), {})
        let res = null
        try {
          res = bracketedCli(`cli:${cmd.cli}#${cmd.op}`, () => runCli(cmd.cli, { op: cmd.op, dataRoot: bp.root, inFile: payloadFile, testMode: true }, { env: process.env }))
        } catch (err) {
          runResults[cmd.op] = { threw: String(err.message).slice(0, 120) }
          continue
        }
        runResults[cmd.op] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
      }
      rec.readings.command_runs = runResults
      const bpAfter = treeHash(bp.root)
      rec.readings.test_root_tree = { exists: bpAfter.exists, count: bpAfter.count, sha256: bpAfter.sha256 }
      // 正向对照（§2.4 第 4 条）：干净的合法测试根上 `init` 必须成功，而且在测试根里**留下产物**。
      // 🔴 不要求"每个写命令都成功"：同一个根上按任意顺序连跑，状态次序本身就会让一部分失败
      //    （`E_DATA_EXISTS`/`E_DATA_MISSING`）—— 那是假红（交付前自查抓到的一条）。
      const freshRoot = scenarioWorkspace('DR-02', 'all-commands')
      const initRes = bracketedCli('cli:agenia-brain.mjs#init（合法空根正向）', () => runCli('agenia-brain.mjs', { op: 'init', dataRoot: freshRoot, inFile: writeFixture('DR-02', 'init-legal', {}), testMode: true }, { env: process.env }))
      rec.readings.positive_init = { exit_code: initRes.exit_code, code: initRes.json?.error?.code ?? null }
      if (initRes.exit_code !== 0) {
        push('DR-POSITIVE', `干净合法根上的 init 必须成功（正向对照），实得 exit=${initRes.exit_code} / ${initRes.json?.error?.code ?? '(无码)'}：${initRes.stdout.trim().slice(0, 200)}`)
      }
      const freshTree = treeHash(freshRoot)
      rec.readings.positive_root_tree = { exists: freshTree.exists, count: freshTree.count }
      if (freshTree.count === 0) push('DR-POSITIVE', '合法测试根上跑完 init 之后一个产物都没有 —— 正例不成立（"没写出去"和"写对了地方"必须分得开）')
      if (bpAfter.count === 0) push('DR-POSITIVE', `共享测试根 ${bp.root} 上一个产物都没有 —— 清单里的命令没在测试根里落下东西`)

      // ② 临时件落点：运行根 tmp 里不许留 .tmp-* 残渣；真实预设目录里也不许有
      const leftovers = []
      for (const dir of [path.join(PATHS.repo, '.team', 'test', '2026-10-14', '_runs'), PATHS.finalPreset]) {
        const t = treeHash(dir)
        for (const f of t.files ?? []) if (/\.tmp-|\.partial$/i.test(f.rel)) leftovers.push(`${dir}\\${f.rel}`)
      }
      rec.readings.temp_leftovers = leftovers
      if (leftovers.length > 0) push('TEMP-LEFTOVER', `发现临时件残渣（原子写的临时文件必须同目录 rename 掉）：${leftovers.slice(0, 5).join(', ')}`)

      // ③ 四个作业以测试根输入：投递必须只改测试根
      if (!jobsWired) {
        push('SUT-SURFACE-MISSING', 'staged/bin/bg-notify.mjs 不在 ⇒ 四作业以测试根输入的接缝拿不到（预期的首跑红）')
      } else {
        const ws = scenarioWorkspace('DR-02', 'jobs')
        const jobResults = {}
        for (const job of FROZEN.jobs) {
          const resultFile = writeFixture('DR-02', `${job.role}-result`.slice(0, 40), { ok: true, role: job.role })
          const res = bracketedCli(`job:${job.role}`, () => runCli('bg-notify.mjs', {
            op: 'deliver', dataRoot: bp.root,
            extra: ['--status-root', path.join(ws, '.team'), '--job', job.role, '--job-id', `job-${job.role}-1`, '--state', 'done', '--result-file', resultFile],
          }, { env: process.env }))
          jobResults[job.role] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
        }
        rec.readings.job_deliveries = jobResults
        for (const [role, r] of Object.entries(jobResults)) {
          if (r.exit_code !== 0) push('NOTIFY', `bg-notify deliver（${role}）必须成功（接缝正例），实得 exit=${r.exit_code} / ${r.code ?? '(无码)'}`)
        }
      }

      // ── ③c 活体预设那条判据的**覆盖口径** + 一把副本刀（组长 2026-11-06 决定 §四.1–§四.3）──
      // 【钉什么】
      //   · **单源**：`livePreset` 的排除集**就是** `FROZEN.targetLag.dataSegments` 那一个数组
      //     （不是内容相等的第二份 —— 分叉过一次就漏过一项：`.snapshot` 事件，`STAT-01` 当场红）；
      //   · **内容钉死**：那个数组今天**恰为** `['.runtime']`。将来谁想把某个**产品文件**塞进排除表
      //     好让这条安全判据闭嘴，这一格就红 ⇒ 加数据段必须是一次显式、有人看的编辑；
      //   · **覆盖真的生效**：哈希里不许出现顶层数据段的文件，且样本不许是空的（`inject.js` 必须在）。
      // 【怎么翻面】把排除集换成一份本地字面量 ⇒ ① 红；往 `dataSegments` 里加一项 ⇒ ② 红；
      //   把 `realRootsSnapshot` 的排除删掉 ⇒ ③ 红（顶层 `.runtime` 又进了哈希）。
      // 【刀】④ 那一组在**副本**里量：`lib/` 写一个字节 ⇒ 哈希必须变 ⇒ ④ 用的**同一个函数**
      //   （`livePresetViolation`）必须报 `SECURITY-VIOLATION`。没有这把刀，这条判据可能因为
      //   "量的是同一个东西"而永远绿。副本在运行根里，`presets/agenia` 一个字节都不碰。
      const rulerCells = []
      const cell = (label, ok, code, detail) => {
        rulerCells.push({ label, ok, detail })
        if (!ok) problems.push(problem(code, detail))
      }
      const exclusions = before.livePreset.excluded ?? null
      cell(
        '排除集与 `FROZEN.targetLag.dataSegments` 是**同一个数组**（单源，不是第三份字面量）',
        exclusions === FROZEN.targetLag.dataSegments,
        'DR02-EXCLUSION-NOT-SINGLE-SOURCE',
        `实得 ${JSON.stringify(exclusions)}（同一性 ${exclusions === FROZEN.targetLag.dataSegments}）；应为 \`FROZEN.targetLag.dataSegments\` = ${JSON.stringify(FROZEN.targetLag.dataSegments)} 那一个数组 —— 排除表只许一个来源，第二份字面量就是第三个真相`,
      )
      // ⚠️ 下面这个是**期望值**（判据），不是哈希用的排除集（那一份只能来自 `FROZEN`）。
      const PINNED_DATA_SEGMENTS = ['.runtime']
      cell(
        '排除集的内容恰为 `[\'.runtime\']`（加一项就要显式改这一条）',
        JSON.stringify(exclusions) === JSON.stringify(PINNED_DATA_SEGMENTS),
        'DR02-EXCLUSION-CONTENT',
        `实得 ${JSON.stringify(exclusions)}，应为 ${JSON.stringify(PINNED_DATA_SEGMENTS)} —— 把产品文件塞进排除表来躲开这条安全判据，会在这里红`,
      )
      const topLevelDataHits = (before.livePreset.files ?? []).filter((f) => PINNED_DATA_SEGMENTS.includes(String(f.rel).split('/')[0]))
      cell(
        '顶层数据段的文件不在哈希里（排除真的生效了）',
        topLevelDataHits.length === 0 && existsSync(path.join(PATHS.finalPreset, '.runtime')),
        'DR02-EXCLUSION-NOT-APPLIED',
        `哈希里还有 ${topLevelDataHits.length} 份顶层数据段文件（例：${topLevelDataHits.slice(0, 3).map((f) => f.rel).join(', ')}）`
        + `；盘上 \`presets/agenia/.runtime\` 存在 = ${existsSync(path.join(PATHS.finalPreset, '.runtime'))}`
        + ' —— 数据段没被排除 ⇒ 只要有人正常干活这条安全判据就必红（先例 `cand-20261019-0042`）',
      )
      const presentRels = new Set((before.livePreset.files ?? []).map((f) => f.rel))
      cell(
        '哈希不是空样本：既有文件，又有产品文件 `inject.js`',
        before.livePreset.exists === true && before.livePreset.count > 0 && presentRels.has('inject.js'),
        'DR02-EXCLUSION-ZERO-SAMPLE',
        `count=${before.livePreset.count} · exists=${before.livePreset.exists} · 含 inject.js=${presentRels.has('inject.js')} —— 空树的哈希"没变"不是证据`,
      )

      // ④ 那把刀：**副本**里逐次只多一个字节，两两相比（每一对只差**那一处**写）。
      const knifeRoot = path.join(canonical(requireEnv(ENV.RUN_ROOT)), 'dr02-livepreset-copy')
      const copied = copyLivePresetForKnife(knifeRoot)
      // 副本里摆一份顶层数据段 + 一份**嵌套**的 `.runtime`（后者的内容是代码，不许被跳）
      // 外加一份**临时段** `.snapshot`（下面用它验"排除集真的是从 `FROZEN` 读的"）
      mkdirSync(path.join(knifeRoot, '.runtime'), { recursive: true })
      mkdirSync(path.join(knifeRoot, 'lib', '.runtime'), { recursive: true })
      mkdirSync(path.join(knifeRoot, '.snapshot'), { recursive: true })
      writeFileSync(path.join(knifeRoot, '.runtime', 'probe.txt'), 'v0\n', 'utf8')
      writeFileSync(path.join(knifeRoot, 'lib', '.runtime', 'x.mjs'), '// a\n', 'utf8')
      writeFileSync(path.join(knifeRoot, '.snapshot', 'probe.json'), '{"seg":"临时加进 dataSegments 的那一段"}\n', 'utf8')
      const snapAt = (label) => {
        const snap = realRootsSnapshot({ livePresetRoot: knifeRoot })
        rec.readings[`knife_${label}`] = { path: snap.livePreset.path, count: snap.livePreset.count, sha256: snap.livePreset.sha256 }
        return snap
      }
      const k0 = snapAt('k0')
      cell(
        '副本是副本（不是活体那棵树），而且量的就是它',
        canonical(knifeRoot) !== canonical(PATHS.finalPreset)
          && k0.livePreset.path === canonical(knifeRoot)
          && k0.livePreset.count === copied.files + 2,
        'DR02-KNIFE-NOT-A-COPY',
        `副本 ${knifeRoot} · 与活体同名=${canonical(knifeRoot) === canonical(PATHS.finalPreset)}`
        + ` · 快照量的路径=${k0.livePreset.path} · 份数=${k0.livePreset.count}`
        + `（拷贝 ${copied.files} 份 + 嵌套代码 1 份 + 临时段 \`.snapshot\` 1 份；顶层数据段 ${JSON.stringify(copied.skipped)} 不算）`
        + ' —— 量错树 / 量空树都会让下面四格失去意义',
      )
      // (a) 产品代码：`lib/` 里写一个字节 ⇒ 哈希必须变 ⇒ 违规必须响
      //     ⚠️ 先确认副本里**真有** `lib/*.mjs`：把产品目录塞进排除表的人，会让这一格在这里就打不出去
      //     （那不是崩溃，那是一条读数 —— 排除表吃掉了产品目录，刀自然插不进去）。
      const libFiles = existsSync(path.join(knifeRoot, 'lib'))
        ? readdirSync(path.join(knifeRoot, 'lib')).filter((n) => n.endsWith('.mjs')).sort()
        : []
      const libFile = libFiles[0] ?? null
      let k1 = null
      let vLib = null
      if (libFile !== null) {
        writeFileSync(path.join(knifeRoot, 'lib', libFile), `${readFileSync(path.join(knifeRoot, 'lib', libFile), 'utf8')}// \n`, 'utf8')
        k1 = snapAt('k1')
        vLib = livePresetViolation(k0, k1, '副本 `lib/` 写一个字节之后')
      }
      cell(
        libFile === null
          ? '副本 `lib/*.mjs` 写一个字节 ⇒ 哈希必变 ⇒ `SECURITY-VIOLATION` 必须响（**副本里没有 lib/**：排除表把产品目录吃掉了）'
          : `副本 \`lib/${libFile}\` 写一个字节 ⇒ 哈希必变 ⇒ \`SECURITY-VIOLATION\` 必须响`,
        libFile !== null && vLib?.code === 'SECURITY-VIOLATION',
        'DR02-KNIFE-NOFLIP',
        libFile === null
          ? `副本 ${knifeRoot} 里没有 \`lib/*.mjs\`（拷贝 ${copied.files} 份，跳过 ${JSON.stringify(copied.skipped)}）—— 产品目录被排除表吃掉，这把刀打不出去`
          : `k0 ${String(k0.livePreset.sha256).slice(0, 12)} → k1 ${String(k1.livePreset.sha256).slice(0, 12)}；判定=${vLib?.code ?? '(没响)'} —— 不响说明这条比较早就死了，绿是假的`,
      )
      // (b) 顶层数据段：内容变了，哈希**不许**变（否则常驻红）
      writeFileSync(path.join(knifeRoot, '.runtime', 'probe.txt'), 'v1\n', 'utf8')
      const k2 = snapAt('k2')
      const vData = livePresetViolation(k1 ?? k0, k2, '副本顶层 `.runtime` 内容变了之后')
      cell(
        '副本顶层 `.runtime/probe.txt` 内容变了 ⇒ 哈希不变、不许报违规',
        vData === null,
        'DR02-KNIFE-DATA-NOT-EXCLUDED',
        `k1 ${String((k1 ?? k0).livePreset.sha256).slice(0, 12)} → k2 ${String(k2.livePreset.sha256).slice(0, 12)}；判定=${vData?.code ?? '(没响 = 对)'} —— 数据段进了安全哈希，正常干活就会把这格刷红`,
      )
      // (c) 嵌套的 `.runtime`：那是**代码**（`fingerprint.mjs:26-27` 的同一课），变了必须报
      writeFileSync(path.join(knifeRoot, 'lib', '.runtime', 'x.mjs'), '// b\n', 'utf8')
      const k3 = snapAt('k3')
      const vNested = livePresetViolation(k2, k3, '副本 `lib/.runtime/x.mjs` 改了之后')
      cell(
        '副本 `lib/.runtime/x.mjs` 改了 ⇒ 哈希必变（嵌套的是代码，不许按名字一路跳）',
        vNested?.code === 'SECURITY-VIOLATION',
        'DR02-KNIFE-NESTED-SKIPPED',
        `k2 ${String(k2.livePreset.sha256).slice(0, 12)} → k3 ${String(k3.livePreset.sha256).slice(0, 12)}；判定=${vNested?.code ?? '(没响)'} —— 按目录名在任何深度跳「.runtime」，等于给代码开了一个不被哈希的洞`,
      )
      // (d) 排除集**真的来自 `FROZEN`**：源上临时加一段 `.snapshot` ⇒ 哈希立刻不算那一份
      //     （同一性那一格只能证明"它报的是哪个数组"，证明不了"走的是它"—— 这是本票第一次跑红的形态）
      const sentinel = '.snapshot'
      const kSegIn = snapAt('seg_in')
      const segLenBefore = FROZEN.targetLag.dataSegments.length
      let kSegOut = null
      FROZEN.targetLag.dataSegments.push(sentinel)
      try {
        kSegOut = snapAt('seg_out')
      } finally {
        FROZEN.targetLag.dataSegments.pop()
      }
      const segRestored = FROZEN.targetLag.dataSegments.length === segLenBefore && !FROZEN.targetLag.dataSegments.includes(sentinel)
      cell(
        `顶层 \`${sentinel}\` 进了排除集 ⇒ 哈希立刻不算它（排除集只有 \`FROZEN.targetLag.dataSegments\` 那一份）`,
        segRestored && kSegOut.livePreset.count === kSegIn.livePreset.count - 1,
        'DR02-EXCLUSION-NOT-FROM-FROZEN',
        `同一份副本：默认排除集下份数 ${kSegIn.livePreset.count}，临时 push ${JSON.stringify(sentinel)} 后份数 ${kSegOut.livePreset.count}（应 −1）`
        + ` · sha ${String(kSegIn.livePreset.sha256).slice(0, 12)} → ${String(kSegOut.livePreset.sha256).slice(0, 12)}`
        + ` · 排除集已还原=${segRestored} —— 写死一份清单的实现在这里不会跟着变`,
      )
      rec.readings.live_preset_ruler = { exclusions: exclusions ?? null, pinned: PINNED_DATA_SEGMENTS, cells: rulerCells }

      // ── ④ 真实根的见证：**每个 CLI 子调用一个窗口**（MF-2 / 决定 §五.2）──────────────────
      // 【窗口】`DR-02` 不再拿一对快照夹住整段用例（旧版夹 15.9 s ⇒ 别人在这段里正常干活也会被
      //   算到这一跑头上）。现在只有"真正碰 CLI 的子调用"各夹一对（`witnessWindow`，逐条给 call_ms /
      //   window_ms）。三格判据（brain 路径集合 / route 内容 / livePreset 内容）在窗口里各判一次。
      // 【未夹的】不碰 CLI 的段落（全树走读 / 临时件扫描 / 两把副本刀）**不在窗口里**，逐条列在
      //   `real_roots.unbracketed` —— 不许把它们说成"已见证"。
      // 【形状】`brain` 的输入必须是 `treePaths` 形状；`treeHash` 形状会让差集变成两个空集
      //   （`paths ?? []` 的老洞）⇒ 这一格点名红 `DR02-BRAIN-WITNESS-SHAPE`，不落进"没变"。
      // 【覆盖边界】就地覆盖不判（见 ④b）；另一方向：别的会话在窗口内新增 / 删除路径仍会红（残余误报）。
      const badShapeWindows = windows.filter((w) => w.shape.before !== null || w.shape.after !== null)
      const shapeCell = {
        label: '④ 的输入形状：before.brain / 每个窗口的 before+after 都是 `treePaths` 形状（`Array.isArray(paths)`、`count === paths.length`、真根存在 ⇒ paths 非空）',
        ok: baselineShape === null && badShapeWindows.length === 0,
        // 🔴 下面两个是**计数**（2026-11-07 MF-3）：`ok` 是"没发现坏形状"，零窗口时它也真；
        //    "形状真的被评估过"只能靠次数读（自守在 ④''，不在这里）。④'' 另外还读这个 `ok`
        //    （MF-4：判决要成立、或者必须已经报出去）—— 两处读的是同一条判决，不是两份判据。
        evaluated: shapeCellEvaluations,
        windows: windows.length,
        bad: badShapeWindows.length,
        detail: `before.brain：paths=${Array.isArray(before.brain.paths) ? `array(${before.brain.paths.length})` : String(before.brain.paths)} · count=${before.brain.count}`
          + ` · 形状=${baselineShape ?? 'ok'} · 窗口 ${windows.length} 个，其中形状坏 ${badShapeWindows.length} 个`
          + ` · 形状评估 ${shapeCellEvaluations} 次（应为 1 + 窗口 × 2）`
          + `${badShapeWindows.length > 0 ? `（例：${badShapeWindows[0].label}）` : ''}`
          + ' —— 形状不对时"路径集合没变"算不出来（treeHash 的 `files` 会被读成两个空集 ⇒ 永远绿）',
      }
      if (!shapeCell.ok) push('DR02-BRAIN-WITNESS-SHAPE', `${shapeCell.label}：${shapeCell.detail}`)

      // ── ④b 残余风险的**登记**（决定 §三.3；2026-11-07 MF-2 更正措辞）────────────────────
      // 读的人不必去翻决定书：`brain` 这一格**没盖住**"就地覆盖"；兜它的**只有** `E_ROOT_REAL_BRAIN`
      // （`cli-inventory` 是枚举不是闸）；另一方向（别人新增 / 删除路径）是**残余误报**，不是"不会红"。
      const contentUncovered = {
        root: 'brain',
        what: '已存在文件被就地覆盖（内容改、路径不变）',
        note: '`brain` 的见证是**路径集合**（新增 / 删除）；已存在文件被就地覆盖（内容改、路径不变）不在这条判据的覆盖范围。',
        covered_by: ['DR-01 --real-mode ⇒ E_ROOT_REAL_BRAIN'],
        cli_inventory: 'lib/cli-inventory.mjs 只是枚举命令，不判它会写哪儿 —— 不是闸',
        residual_false_positive: '别的会话在窗口内新增 / 删除路径会被判成 SECURITY-VIOLATION（假红，不是假绿）',
      }
      rec.readings.real_roots = {
        baseline: {
          at: before.at,
          brain: { path: before.brain.path, exists: before.brain.exists, count: before.brain.count },
          route: { exists: before.route.exists, sha256: before.route.exists ? before.route.sha256 : null },
          live_preset: { exists: before.livePreset.exists, count: before.livePreset.count, sha256: before.livePreset.sha256 },
        },
        brain_shape: shapeCell,
        windows,
        unbracketed: [
          '① 之后：两棵测试根的全树走读（treeHash(bp.root) / treeHash(freshRoot)）—— 无 CLI',
          '② 临时件落点扫描（读 .team/test/2026-10-14/_runs 与活体预设两棵树）—— 无 CLI',
          '③c 活体预设副本刀（拷贝 + 6 次写 + 6 次快照：k0/k1/k2/k3/seg_in/seg_out）—— 无 CLI；写只落运行根',
          '基线之后立刻：脑根副本拷贝（整棵真根，只读源树）—— 无 CLI',
          '④c 脑根副本刀（2 次写 + 3 次快照）—— 无 CLI；写只落运行根，对真根只读',
          '用例体之外：preflight / settle / run-all 的 real-roots 两相位（整跑约 5 分钟）—— 那是结算的契约口径（§2.4 第 5 条），不是 DR-02 的见证',
        ],
        content_uncovered: contentUncovered,
      }
      // ④' 这一段的自守（`F-142` 的形状，边界也一样）：**整段删掉**时 `problems` 仍是 0 ⇒ 全绿。
      // 只判"这一段跑过没有"（格数）；某一条 `push` 被单独抽掉不归它管（那一层要源码对账，
      // 会退化成"改一句实现就红"的变更探测器）。
      {
        const cells = rec.readings.live_preset_ruler?.cells
        if (!Array.isArray(cells) || cells.length !== 9) {
          push('DR02-RULER-UNGUARDED', `活体预设那一段（③c）没跑：读数格数 ${Array.isArray(cells) ? cells.length : '(无读数)'}（应为 9）—— `
            + '这一段整段删掉时 problems 仍是 0，所以它必须留下读数、并由这里读一次')
        }
      }
      // ── ④'' 两段见证的**自守**（2026-11-07 MF-3；MF-4 起形状那一格也读**判决**）────────────
      // 这两格**不在**被它们守的那两段里（`F-142` 的边界）：形状格整段删掉、或 `witnessWindow`
      // 被换成 `return fn()`，这两格照旧会跑。判两件事：**真的跑了**（计数）+ **判决真的出去了**。
      //   · 窗口：期望数从**发调用的那三处**派生（① 的冻结分母 + ② 的一条 + ③ 的作业表），不写死 28；
      //     计数器 `cliCalls` 在 `bracketedCli` 里、窗口数组在 `witnessWindow` 里 —— 两处分开记，
      //     `witnessWindow` 坏掉时 28 ≠ 0。
      //   · 形状格：**两个条件都读** —— ① `evaluated` 次数（baseline 1 + 每窗口 2；零窗口时 `ok:true`
      //     在空样本上没有意义）；② **判决**（`brain_shape.ok` 为真，或那个码已经进了 `problems`）。
      //     只数次数挡不住"删掉报告那一行"（MF-4：坏 baseline ⇒ `judged:false` ⇒
      //     `brainWitnessViolation` 走不到它自己的形状分支，报告那一行一删就 0 红）。
      {
        const rs = rec.readings.real_roots
        const winList = Array.isArray(rs?.windows) ? rs.windows : null
        // 评审 §六 原文："任何窗口 `judged:false` **且不是形状原因** ⇒ 红" —— 窗口自己的形状坏由形状格
        // （`DR02-BRAIN-WITNESS-SHAPE`）点名，这里不重复报同一句话。
        const unjudgedWhenUsable = witnessUsable
          ? windows.filter((w) => !w.judged && w.shape.before === null && w.shape.after === null)
          : []
        const countOk = winList !== null
          && windows.length >= expectedCliCalls
          && cliCalls === windows.length
          && winList.length === windows.length
        const judgedOk = unjudgedWhenUsable.length === 0
        const shapeReading = rs?.brain_shape
        const shapeIsObject = shapeReading !== null && typeof shapeReading === 'object'
        const shapeEvaluated = shapeIsObject && Number.isInteger(shapeReading.evaluated) ? shapeReading.evaluated : null
        const shapeExpected = 1 + 2 * Math.max(windows.length, 0)
        // 🔴 **判决**自守（2026-11-07 MF-4）：上面数的都是"评估过几次"，不是"判出了什么"。
        //    输入形状坏时只有形状格自己那一行 `push('DR02-BRAIN-WITNESS-SHAPE')` 会说话；删掉那一行
        //    ⇒ 0 红（坏 baseline ⇒ `judged:false` ⇒ `brainWitnessViolation` 走不到它自己的形状分支，
        //    本段只数次数 ⇒ 照旧绿）。⇒ 这里直接读**判决**，并要求它**真的报了**：
        //    `ok === true`，或者 `ok === false` 但那个码已经进了 `problems`；两条都不成立 ⇒ 红。
        const shapeVerdictOk = shapeIsObject && shapeReading.ok === true
        const shapeVerdictReported = problems.some((p) => p.code === 'DR02-BRAIN-WITNESS-SHAPE')
        const verdictGuardOk = shapeVerdictOk || shapeVerdictReported
        const shapeGuardOk = shapeIsObject && shapeEvaluated === shapeExpected && windows.length > 0 && verdictGuardOk
        rec.readings.dr02_witness_guards = {
          expected_cli_calls: expectedCliCalls,
          cli_calls_from: {
            frozen_commands: frozenDataRootOps.length,
            live_inventory: needsDataRootOps.length,
            positive_init: 1,
            jobs: jobsWired ? FROZEN.jobs.length : 0,
          },
          cli_calls: cliCalls,
          windows: windows.length,
          windows_reading: winList === null ? null : winList.length,
          unjudged_when_baseline_usable: unjudgedWhenUsable.map((w) => w.label),
          shape_reading_present: shapeIsObject,
          shape_evaluations: shapeEvaluated,
          shape_evaluations_expected: shapeExpected,
          shape_verdict: shapeIsObject ? shapeReading.ok : null,
          shape_verdict_reported: shapeVerdictReported,
          cells: [
            { id: 'DR02-BRAIN-WINDOWS-UNGUARDED', ok: countOk && judgedOk, count_ok: countOk, judged_ok: judgedOk },
            {
              id: 'DR02-BRAIN-WITNESS-SHAPE-UNGUARDED',
              ok: shapeGuardOk,
              evaluated: shapeEvaluated,
              expected: shapeExpected,
              verdict: shapeIsObject ? shapeReading.ok : null,
              verdict_reported: shapeVerdictReported,
            },
          ],
        }
        if (!countOk || !judgedOk) {
          push('DR02-BRAIN-WINDOWS-UNGUARDED',
            `④ 的窗口没跑全：期望 ${expectedCliCalls} 个（冻结表 needsDataRoot 命令 ${frozenDataRootOps.length} + 正向 init 1 + 作业 ${jobsWired ? FROZEN.jobs.length : 0} —— 分母钉在冻结表，不跟 ① 的循环变量一起缩）`
            + ` · 子调用计数器 cliCalls=${cliCalls} · 窗口 ${windows.length} 个（① 实际遍历 ${needsDataRootOps.length} 个 needsDataRoot 命令）`
            + ` · 读数里 ${winList === null ? '(没有 windows 读数)' : `${winList.length} 个`}`
            + ` · baseline 形状 ${baselineShape ?? 'ok'} 下未判的窗口 ${unjudgedWhenUsable.length} 个`
            + `${unjudgedWhenUsable.length > 0 ? `（例：${unjudgedWhenUsable[0].label}）` : ''}`
            + ' —— 空样本（0 个窗口）不是"全都没变"，是"没看"：少一个窗口 = 有一个子调用没被夹住')
        }
        if (!shapeGuardOk) {
          push('DR02-BRAIN-WITNESS-SHAPE-UNGUARDED',
            !shapeIsObject
              ? `没有 brain_shape 读数（rec.readings.real_roots.brain_shape = ${shapeReading === undefined ? 'undefined（键不在）' : String(shapeReading)}）`
                + ' —— 形状格整段删掉时 problems 仍是 0，所以它必须留下读数、并由这一段读一次（本段不在形状格里）'
              : !verdictGuardOk
                ? `形状格**判了红却没人报**：brain_shape.ok=${String(shapeReading.ok)} · 窗口 ${windows.length} 个 · `
                  + '`problems` 里没有 `DR02-BRAIN-WITNESS-SHAPE` —— '
                  + '输入形状坏时每个窗口 `judged:false`，`brainWitnessViolation` 走不到它自己的形状分支；'
                  + '报告那一行被摘掉时，这里是唯一还读判决的地方'
                : `形状格没有真的评估过窗口：evaluated=${shapeEvaluated ?? '(不是整数)'} · 应=${shapeExpected}（baseline 1 + 窗口 ${windows.length} × 2）`
                  + (windows.length === 0 ? ' · 窗口 0 个 —— 空样本上的 `ok:true` 不是证据' : '')
                  + ' —— 这一格判两件事：评估次数（本次这一条）与判决；次数不对时判决也不必再看')
        }
      }
      // ── ④c `brain` 见证的两把刀（**副本**脑根；真根一个字节都不许碰）──────────────────
      // 🔴 **刀走产品那条路**（MF-2 要求 2）：每一份 `b*` 都是 `realRootsSnapshot({ brainRoot })` 的
      //    `.brain`，不是刀自己 `treePaths()` 造的 —— 自己造快照正是"产品改回 treeHash 整套仍绿"的藏身处。
      // 刀与真跑读**同一个** `brainWitnessViolation()` ⇒ 刀响 = ④ 响。
      //   · A（正向）：副本里**新建**一个文件 ⇒ 必须 `SECURITY-VIOLATION`，且报文**点名**那个路径；
      //   · B（反向）：副本里既有文件**只改内容**、路径不变（sha 前 ≠ 后）⇒ **必须不报** ——
      //     这一格是"内容不再是 `brain` 的判据"的证明；没有它，把内容哈希偷偷加回来也照样全绿。
      // 🔴 份数**锚在 `before.brain.count`**（真根基线），不是副本自报的 `brainCopied.files`——
      //    锚在副本自报上，半份副本也能过（MF-2 同族）。副本就在基线之后立刻拷贝，两者只隔一次拷贝。
      const brainCells = []
      const bcell = (label, ok, code, detail) => {
        brainCells.push({ label, ok, detail })
        if (!ok) problems.push(problem(code, detail))
      }
      if (!knifeJudged) {
        // 形状坏了（或硬闸没开）：刀量不到任何东西。**不**在这里补一条红 —— 形状格已经点名红了
        // （`DR02-BRAIN-WITNESS-SHAPE`）；硬闸那一条单独报。
        if (!knifeIsCopy) push('DR02-BRAIN-KNIFE-NOT-A-COPY', `硬闸：目标 ${brainKnifeRoot} 就是真实脑根 —— 不拷、不写、刀不跑`)
        rec.readings.brain_witness = {
          real_root: witness.root,
          copy: brainKnifeRoot,
          snapshot_via: 'realRootsSnapshot({ brainRoot })',
          copy_files_reported: brainCopied.files,
          real_baseline_count: before.brain.count,
          copy_is_not_real_root: knifeIsCopy,
          knife_shape: knifeShape,
          skipped: `输入形状不对，刀量不了：${knifeShape ?? baselineShape ?? '（未给原因）'}`,
          cells: [],
        }
      } else {
        bcell(
          '刀量的是**副本**（不是真实脑根），副本份数与**真根基线**相同（锚在 before.brain.count，不是副本自报）',
          b0.path === canonical(brainKnifeRoot) && b0.count === before.brain.count && before.brain.count > 0,
          'DR02-BRAIN-KNIFE-NOT-A-COPY',
          `副本 ${brainKnifeRoot} · 与真根同名=false`
            + ` · 快照量的路径=${b0.path} · 副本份数=${b0.count} · 真根基线 before.brain.count=${before.brain.count}`
            + ` · 拷贝器自报=${brainCopied.files}（**只当读数，不当锚**）`
            + ' —— 量错树 / 量空树 / 半份副本都会让下面两格失去意义',
        )
        // A 正向刀：新建一个文件
        const STRAY_REL = 'dr02-stray-write.txt'
        writeFileSync(path.join(brainKnifeRoot, STRAY_REL), 'stray\n', 'utf8')
        const b1 = realRootsSnapshot({ brainRoot: brainKnifeRoot }).brain
        const vAdd = brainWitnessViolation({ brain: b0 }, { brain: b1 }, '副本里新建一个文件之后')
        bcell(
          '副本里新建一个文件 ⇒ `SECURITY-VIOLATION` 必须响，且报文点名那个路径',
          existsSync(path.join(brainKnifeRoot, STRAY_REL))
            && vAdd?.code === 'SECURITY-VIOLATION'
            && String(vAdd.message).includes(STRAY_REL),
          'DR02-BRAIN-KNIFE-ADD-NOFLIP',
          `b0 ${b0.count} 份 → b1 ${b1.count} 份；判定=${vAdd?.code ?? '(没响)'}`
            + ` · 报文点名 \`${STRAY_REL}\`=${String(vAdd?.message ?? '').includes(STRAY_REL)}`
            + ' —— 不响说明"多一个文件"这条判据早就死了，绿是假的',
        )
        // B 反向刀：只改内容（路径不变）
        const victim = b0.paths[0] ?? null
        let shaBefore = null
        let shaAfter = null
        let vContent = null
        let b2 = null
        if (victim !== null) {
          const victimFile = path.join(brainKnifeRoot, victim)
          shaBefore = sha256File(victimFile)
          writeFileSync(victimFile, `${readFileSync(victimFile, 'utf8')}\n// dr02-knife\n`, 'utf8')
          shaAfter = sha256File(victimFile)
          b2 = realRootsSnapshot({ brainRoot: brainKnifeRoot }).brain
          vContent = brainWitnessViolation({ brain: b1 }, { brain: b2 }, '副本里只改一个既有文件的内容之后')
        }
        bcell(
          victim === null
            ? '副本里**没有既有文件** ⇒ 反向刀打不出去（"只改内容不许报"这一格量不到）'
            : `副本 \`${victim}\` 只改内容（sha 变了）、路径不变 ⇒ **不许报**违规`,
          victim !== null && shaBefore !== shaAfter && vContent === null,
          'DR02-BRAIN-KNIFE-CONTENT-FLIPS',
          victim === null
            ? `副本 ${brainKnifeRoot} 里 0 份文件（拷贝器自报 ${brainCopied.files} 份 · 真根基线 ${before.brain.count} 份）—— 反向刀打不出去`
            : `\`${victim}\` sha ${String(shaBefore).slice(0, 12)} → ${String(shaAfter).slice(0, 12)}`
              + ` · 路径份数 ${b1.count} → ${b2?.count} · 判定=${vContent?.code ?? '(没响 = 对)'}`
              + ' —— 响了就是把"别人的正常干活"算到这一跑头上（内容不许再当 `brain` 的判据）',
        )
        rec.readings.brain_witness = {
          real_root: witness.root,
          copy: brainKnifeRoot,
          snapshot_via: 'realRootsSnapshot({ brainRoot })',
          copy_files_reported: brainCopied.files,
          real_baseline_count: before.brain.count,
          copy_is_not_real_root: true,
          knife_shape: null,
          stray_rel: STRAY_REL,
          content_victim: victim,
          cells: brainCells,
        }
      }
      // 这一段的自守（`F-142` 的形状，边界同 ④'）：整段删掉时 problems 仍是 0 ⇒ 全绿。
      // 例外：`skipped` 是"输入形状坏了、红在 ④ 的形状格" —— 那一跑已经红了，别拿这一条重复报。
      {
        const bw = rec.readings.brain_witness
        if (!bw?.skipped && (!Array.isArray(bw?.cells) || bw.cells.length !== 3)) {
          push('DR02-BRAIN-WITNESS-UNGUARDED', `brain 见证那一段（④c）没跑：读数格数 ${Array.isArray(bw?.cells) ? bw.cells.length : '(无读数)'}（应为 3）—— `
            + '这一段整段删掉时 problems 仍是 0，所以它必须留下读数、并由这里读一次')
        }
      }
      // ── ④ 见证的**段外兜底**（2026-11-07 MF-5）──────────────────────────────────────────────
      // 🔴 为什么住在这里 —— 这一段在 §④ 那个**连续区域的外面**（`// ── ④ 真实根的见证` →
      //    ④c 自守结束）。那一段整段连续删掉时，`problems` 仍是 0：两格自守也跟着走，因为它们
      //    原来就长在那一段里（`F-142` 只推到"格"这一层，没推到"段"）。
      //    这里量的是**读数有没有真的写下来**（"DR-02 的见证跑过"在盘上的唯一载体）：
      //      · `rec.readings.real_roots`：`baseline` / `brain_shape` / `windows` / `unbracketed` / `content_uncovered`；
      //      · `rec.readings.dr02_witness_guards`：两格自守的判决 + 两个分母。
      //    没有它们，这一跑剩下的只有"这一格没报错"—— 而"没报错"和"没跑"在这里长得一模一样。
      //    ⚠️ **判决也要有出口**：`dr02_witness_guards.cells` 里某一格 `ok:false`，那个码必须已经进了
      //    `problems`；否则摘掉 ④'' 里那一条 `push` 就静默（形状格那一刀在 MF-4 里是同一个病）。
      //    ⚠️ 边界：这一段自己也能被删掉（老边界）—— 但它**不在** §④ 的连续区域里，
      //    所以"整段删 §④"这一刀必须红在它身上，而不是红在已经被一起删掉的两格上。
      {
        const rs = rec.readings.real_roots
        const gd = rec.readings.dr02_witness_guards
        const rsOk = rs !== null && typeof rs === 'object'
          && rs.brain_shape !== null && typeof rs.brain_shape === 'object'
          && Array.isArray(rs.windows)
          && Array.isArray(rs.unbracketed) && rs.unbracketed.length > 0
          && rs.content_uncovered !== null && typeof rs.content_uncovered === 'object'
          && typeof rs.baseline?.brain?.count === 'number'
        const GUARD_CELL_IDS = ['DR02-BRAIN-WINDOWS-UNGUARDED', 'DR02-BRAIN-WITNESS-SHAPE-UNGUARDED']
        const gdCells = Array.isArray(gd?.cells) ? gd.cells : null
        const gdCore = gdCells === null ? [] : gdCells.filter((c) => GUARD_CELL_IDS.includes(c?.id))
        const gdOk = gdCells !== null
          // 按 **id 成员**判，不按条数：`cells.length === 2` 会被"把同一格写两遍"混过去（少一格却仍是 2 条）。
          && GUARD_CELL_IDS.every((id) => gdCore.some((c) => c?.id === id))
          && Number.isInteger(gd?.expected_cli_calls) && gd.expected_cli_calls > 0
          && gdCore.every((c) => c?.ok === true || problems.some((p) => p.code === c.id))
        rec.readings.dr02_witness_outside = {
          real_roots_present: rsOk,
          guards_present: gdOk,
          real_roots_keys: rs !== null && typeof rs === 'object' ? Object.keys(rs) : null,
          guard_cells: gdCells === null ? null : gdCells.map((c) => ({ id: c?.id ?? null, ok: c?.ok ?? null })),
        }
        if (!rsOk || !gdOk) {
          push('DR02-WITNESS-READINGS-UNGUARDED',
            `DR-02 的见证读数没写全（段外兜底）：\`real_roots\` ${rsOk ? '在' : '缺/形状不对'}`
            + ` · \`dr02_witness_guards\` ${gdOk ? '在' : '缺/形状不对/判决没出口'}`
            + ` · real_roots 的键=${rs !== null && typeof rs === 'object' ? JSON.stringify(Object.keys(rs)) : String(rs)}`
            + ` · 自守格=${gdCells === null ? '(没有 cells)' : JSON.stringify(gdCells.map((c) => ({ id: c?.id ?? null, ok: c?.ok ?? null })))}`
            + ' —— §④ 那一段（含两格自守）整段删掉时 problems 仍是 0；这一格住在它外面，'
            + '所以那一段不在、或者写了判决却没报，都必须在这里红。')
        }
      }
      rec.readings.controlled_env = {
        temp: process.env.TEMP ?? null,
        tmp: process.env.TMP ?? null,
        run_root: process.env[ENV.RUN_ROOT] ?? null,
        data_root: process.env[ENV.TEST_DATA_ROOT] ?? null,
      }
      for (const [k, v] of Object.entries(rec.readings.controlled_env)) {
        if (!v) continue
        if (isUnc(v) || driveOf(v) !== 'E:') push('ENV-DRIVE', `${k} 不在 E 盘：${v}`)
      }
      rec.readings.caveat = { note: '受控路径层面的证明；不是全机监控（契约 §11.4 第 2 条）。' }

      caseFail(problems)
    })
  })

  test('DR-03 脑根与路线工作区分舱：票写测试工作区、脑命令不产路线产物、错根被拒', async () => {
    await runCase('DR-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const realRouteBefore = treeHash(REAL_ROUTE_ROOT)

      const ws = scenarioWorkspace('DR-03', 'split')
      const rp = routePaths({ ...process.env, [ENV.TEST_WORKSPACE]: ws })
      const bp = brainPaths()

      // ① 路线侧：updater 写测试工作区的 .team/route，脑根不许因此起变化
      const brainBefore = treeHash(bp.root)
      if (!stagingExists(path.join('bin', 'agenia-route.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-route.mjs 不在 ⇒ 路线侧写面拿不到（预期的首跑红）')
      } else {
        const init = runRoute('DR-03', 'init', {
          goal: { id: 'agenia-upgrade', title: 'Agenia 升级' },
          stages: [{ id: 'plan', name: '计划阶段', order: 1, state: 'current' }],
          current_stage_id: 'plan',
        }, { workspace: ws })
        rec.readings.route_init = { exit_code: init.exit_code, code: init.json?.error?.code ?? null }
        if (init.exit_code !== 0) push('ROUTE-WRITE', `路线 init 必须写进测试工作区（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
        else {
          if (!existsSync(rp.current)) push('ROUTE-LOCATION', `路线 current.json 没落在 ${rp.current}（票只许写测试工作区的 .team/route）`)
          if (existsSync(path.join(bp.root, 'route'))) push('ROUTE-LOCATION', '路线产物出现在了脑根里（两根混写 —— P2-V6 的残余项）')
          if (existsSync(path.join(ws, '.team', 'route', 'current.json'))) {
            const t = runRoute('DR-03', 'ticket-open', {
              title: '（夹具）分舱验证', source: `technical-review:${'a'.repeat(64)}#F1`, next_step: '无', acceptance: '票落在测试工作区',
              version: init.json.version,
            }, { workspace: ws })
            rec.readings.ticket_open = { exit_code: t.exit_code, code: t.json?.error?.code ?? null }
            if (t.exit_code === 0) {
              const cur = JSON.parse(readFileSync(rp.current, 'utf8'))
              if (!Array.isArray(cur.tickets) || cur.tickets.length === 0) push('ROUTE-TICKET', '成功开票之后 current.json.tickets 里没有票')
              if (existsSync(path.join(bp.root, 'tickets'))) push('ROUTE-LOCATION', '票出现在了脑根里')
            } else {
              push('ROUTE-TICKET', `ticket-open 必须成功（正例），实得 exit=${t.exit_code} / ${t.json?.error?.code ?? '(无码)'}`)
            }
          }
        }
      }
      const brainAfterRoute = treeHash(bp.root)
      rec.readings.brain_tree = { before: brainBefore, after_route_ops: brainAfterRoute }
      if (brainBefore.exists !== brainAfterRoute.exists || (brainBefore.exists && brainBefore.sha256 !== brainAfterRoute.sha256)) {
        push('ROOT-MIX', `路线操作改动了脑根（${brainBefore.sha256} → ${brainAfterRoute.sha256}）—— 两根必须分舱`)
      }

      // ② 脑侧：共享脑命令写 data-root，路线工作区不许因此起变化
      const routeBefore = treeHash(path.join(ws, '.team', 'route'))
      if (!stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 脑侧写面拿不到（预期的首跑红）')
      } else {
        // 🔴 v1.17 ②：**自己的空脑根**（照 DR-01/02 的 `scenarioWorkspace` 一行）。
        //    根因：本批补上 `cli-inventory.mjs` 之后 DR-01 的矩阵才真跑，共享脑根已被它 `init` 占掉 ⇒
        //    这里再 `init` 必撞 D-B3（"init 只在空根成功"）⇒ 硬正例假红。
        const brainRoot03 = scenarioWorkspace('DR-03', 'own-brain-root')
        const init = runBrain('init', {}, { dataRoot: brainRoot03 })
        rec.readings.brain_init = { exit_code: init.exit_code, code: init.json?.error?.code ?? null, root: brainRoot03 }
        if (init.exit_code !== 0) push('BRAIN-WRITE', `脑 init 必须写进 data-root（正例，独立空根），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
        if (existsSync(path.join(ws, '.team', 'route', 'current.json')) === false && existsSync(ws)) {
          // 路线没被脑命令创建出来即可
          rec.readings.route_untouched_by_brain = true
        }
      }
      const routeAfter = treeHash(path.join(ws, '.team', 'route'))
      if (routeBefore.exists && routeAfter.exists && routeBefore.sha256 !== routeAfter.sha256) {
        push('ROOT-MIX', `脑侧命令改动了路线工作区（${routeBefore.sha256} → ${routeAfter.sha256}）—— 两根必须分舱`)
      }

      // ③ 错根读取：拿另一个根去读预期产物必须明确失败，不许"读到一个像样的空结果"
      if (stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        const wrongRead = runCli('agenia-brain.mjs', { op: 'state-read', dataRoot: ws, inFile: writeFixture('DR-03', 'wrong-root', {}), testMode: true }, { env: process.env })
        rec.readings.wrong_root_read = { exit_code: wrongRead.exit_code, code: wrongRead.json?.error?.code ?? null }
        if (wrongRead.exit_code === 0) push('WRONG-ROOT', `用路线工作区当脑根去读状态竟然成功 —— 错根必须被拒（或明确 E_DATA_MISSING）`)
      }
      if (stagingExists(path.join('bin', 'agenia-route.mjs'))) {
        const wrongRoute = runCli('agenia-route.mjs', { op: 'read', workspace: bp.root, inFile: writeFixture('DR-03', 'wrong-route', {}), testMode: true }, { env: process.env })
        rec.readings.wrong_route_read = { exit_code: wrongRoute.exit_code, code: wrongRoute.json?.error?.code ?? null }
        if (wrongRoute.exit_code === 0) push('WRONG-ROOT', `用脑根当路线工作区去读路线竟然成功 —— 错根必须被拒（或明确 E_ROUTE_MISSING）`)
      }

      // ④ 真实路线前后不变
      // 🔴 判据是「**前后同值**」，**不是**"它必须不存在"（与上面 ① 的脑根那条同一条口径）。
      //    旧断言 `existsSync(REAL_ROUTE_ROOT) ⇒ SECURITY-VIOLATION` 的前提（"本轮真实路线必须不存在"）
      //    **2026-11-01 22:58 已作废**：组长那天跑了真的 `bootstrap`，`.team/route/current.json`
      //    就是**真数据**（7 张迁移票、`version:1`）。留着那条 = 每天都红，而红的原因与"有没有人写它"
      //    无关 —— 假红比不红更坏（AGENTS.md §6；`data-root.test.mjs:14-16` 记的是同一类事故）。
      //    ⇒ 退役（2026-11-01 第 4 关复审 `DR-03`），护着它的判据只剩下面这一条「前后同值」。
      const realRouteAfter = treeHash(REAL_ROUTE_ROOT)
      rec.readings.real_route = { before: realRouteBefore, after: realRouteAfter }
      if (realRouteBefore.exists !== realRouteAfter.exists || (realRouteBefore.exists && realRouteBefore.sha256 !== realRouteAfter.sha256)) {
        push('SECURITY-VIOLATION', `真实路线在 DR-03 期间被改动（${realRouteBefore.exists ? realRouteBefore.sha256 : '不存在'} → ${realRouteAfter.exists ? realRouteAfter.sha256 : '不存在'}）—— 立即停测`)
      }

      caseFail(problems)
    })
  })
})
