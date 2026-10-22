#!/usr/bin/env node
/**
 * **唯一结算入口**（F-57）—— 跑一次，**分母只有一个数**，退出码与它说同一件事。
 *
 * 它替代的是 `.team/test/2026-10-14/_scan/run-full-55.ps1` 那套「两段命令 + 两句读数」的跑法：
 * 旧跑法里 `node --test` 的退出码与 `settle` 的"分母 55"是**两条互不知情的读数**，
 * 中间没有任何东西要求它们说同一件事。
 *
 * 一次做七件事（⓪ 自检 / ⓪' 报身份并落盘 = 入口在套件之前的两步，不计在这七件里）：
 *   ⓪ **自检**（`support/self-check.mjs` 的冻结表：判据被改回去 ⇒ 拒跑 exit 3）
 *   ⓪' **报自己是哪一份**：入口与它 import 的 `support/self-check.mjs` 的路径 / 字节 / sha256 由**跑着的
 *      这份代码自己**算，连同自检读数（`ok` / `checked` / `failures`）一起落盘（`entry-identity.txt` ·
 *      `self-check.json` · `judgement.txt` · `--json`）—— 自检不过的那一跑也落，"跑的是哪一份"不许退回自报
 *   ① 建运行根（三层 marker，与冻结跑法一致）→ ② 真实根 before 哈希 → ③ `node --test <glob>`
 *   → ④ 真实根 after 哈希 → ⑤ `--settle` → ⑥ **打一行**，并用**一个**退出码收口
 *   → ⓻ **靶子对数**（`support/target.mjs`：这一跑打的 staged 树与现役 `presets/agenia` 的差
 *      必须被声明过；差的字节数 / 缺的功能名都打在 `F57-TARGET` 那一行上）。
 *
 * 🔴 ⓻ 与其余六件**同时成立**才算数：靶子过期而未声明 ⇒ 这一跑记 `exit 1`（红因在 `F57-FAIL` 里），
 *    **`F57-OK` 一个都不许出**。为什么把这条放在入口而不是新加一个用例 ID：加 ID 会动分母，
 *    还会让测试岗自己的阳性对照（`_ref/`）从 10 绿掉成 9 绿（`support/self-check.mjs` 文件头那段 🔴）。
 *
 * 用法（cwd 随便；`--glob` 相对 `--repo`）：
 *   node tests/agenia-upgrade/run-all.mjs --run-root=<绝对路径>\...\_runs\<RUN_ID>
 *   node tests/agenia-upgrade/run-all.mjs --run-root=… --glob="tests/agenia-upgrade/static/read-obligations.test.mjs"
 *   （不给 `--run-root` ⇒ 拒跑 exit 3 —— 证据落点不靠默认值猜）
 *
 * 控制台先出这两行（顺序钉死），再出两条尺子行，再出那一条携带分母的行：
 *   [平台] 0.2.1-rc.2（@deepseek-ai/dsh-desktop + @deepseek-ai/dsh 同版）· asar 取自 环境变量 VIPSHOME
 *   F57-TARGET 靶子=现役 · inject.js 逐字节相同（129771 B · sha256 eb524ab7…）
 *   [尺子] 覆盖：E:\Harness\tests\agenia-upgrade 那棵树（开跑 / 收口各量一次它自己的指纹）—— **不覆盖**"执行的是哪一份入口"
 *   [尺子·入口] run-all.mjs <绝对路径> · <字节> B · sha256 <HEX> · self-check.mjs <绝对路径> · <字节> B · sha256 <HEX>
 *   F57-SETTLE 分母 66 · 盘上发现 66 · 跑到 20 文件/66 条 · RED 0 / GREEN 64 / HOLD 2 · 登记=盘上 ✓ · node --test exit 0（tests 66 · fail 0） · settle exit 0
 *
 * 🔴 这几行回答的是**四件不同的事**，别混着读：
 *   · `[平台]` = 这一跑跑在**哪个平台版本**上（`resources/app.asar` 里的版本号，`F-106`）——
 *     **读数**：不参与判词、不改退出码；判不了会印 `[平台] 🔴 判不了`（不是"不印"）。
 *   · `F57-TARGET` = 这一跑打的是**哪棵树**（被测的 preset 树 vs 现役）。
 *   · `[尺子]` = **测试树**（`PATHS.testRoot` 那一棵）开跑与收口是否同一棵 —— 它**只**覆盖那棵树，
 *     不覆盖"执行的是哪一份入口代码"；这一行写的就是它的覆盖边界。
 *   · `[尺子·入口]` = **跑着的这份代码自己**报的路径 / 字节 / sha256（入口 + 它 import 的
 *     `support/self-check.mjs`）。"哪一份在跑"只有这一行说了算；入口不在 `[尺子]` 那棵树里时，
 *     紧跟一行 🔴 明写这一跑的 `[尺子]` 读数不是关于跑着的这份代码的。
 *
 * `judgement.txt` 里逐行是：`[平台]` → `F57-TARGET` → `[尺子] 覆盖` → `[尺子·入口]` → `F57-SETTLE` → 判词 → `exit=`。
 * （`[尺子]` 的**同树判定**那两句只进控制台 —— 它们的输入是收口才有的 settlement；覆盖范围与入口身份两行落盘。）
 *
 * 🔴 **`F57-OK` 只在"分母 = 跑到 = 全绿 = 无 HOLD"时出现**。其余情况一个 OK 都不许有：
 *   · `HOLD > 0` ⇒ `exit 2`（判不了不是绿）
 *   · `--glob` 收窄 ⇒ 那一行只代表"这一跑"，另补一行 `F57-SCOPE` 明写"不是全量证据"，且**不打 OK**
 *   · `settled ≠ 声明的范围` / `node --test` 的条数 ≠ 结算条数 ⇒ `exit 1`（半跑与两套读数都非零）
 *
 * 退出码：`0` 全绿且这一跑算数 · `1` 有红 / 不一致 / 空跑 / 半跑 / 两套读数打架 · `2` 有 HOLD · `3` 用法或环境不成立（拒跑）
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { entryVerdict, judgementLines } from './support/verdict.mjs'
import { runSelfCheck } from './support/self-check.mjs'
import { targetReport } from './support/target.mjs'
import { platformReading, platformLine } from './support/platform.mjs'
import { DISCOVERY } from './support/registry.mjs'
import { PATHS } from './support/env.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ARGV = process.argv.slice(2)
const arg = (name) => {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? null : hit.slice(name.length + 3)
}
const REPO = arg('repo') === null ? path.resolve(HERE, '..', '..') : path.resolve(arg('repo'))
const RUN_ROOT_RAW = arg('run-root')
const GLOB_GIVEN = arg('glob')
const GLOB = GLOB_GIVEN ?? 'tests/agenia-upgrade/**/*.test.mjs'
const JSON_OUT = arg('json')

// ── ⓪ 自检：判据被改回去 ⇒ 连跑都不许跑（exit 3）──────────────────────────
// 先**跑**自检、把读数留在手里；判词与 exit 挪到「入口身份 + 读数落盘」之后（下面 ⓪' 那一段）——
// 自检不过的那一跑也必须有落点，否则"跑的是哪一份 `self-check.mjs`"又成了自报。
const selfCheck = runSelfCheck()

if (RUN_ROOT_RAW === null) {
  console.error('F57-USAGE: 必须给 --run-root=<绝对路径>（证据落点不猜；它要落在 …\\_runs\\<RUN_ID>\\ 之下）')
  process.exit(3)
}
const RUN_ROOT = path.resolve(RUN_ROOT_RAW)
const RUN_ID = path.basename(RUN_ROOT)
if (!existsSync(REPO)) {
  console.error(`F57-USAGE: --repo 指到的地方不存在：${REPO}`)
  process.exit(3)
}

// ── 🔴 这一跑执行的是**哪一份入口代码** ────────────────────────────────────
/**
 * `[尺子]` 量的是 `PATHS.testRoot` **那棵树**（`support/env.mjs` 里硬编码），它回答的是
 * "开跑那一刻的测试树与收口那一刻是不是同一棵"；**它不回答**"执行的是哪一份 `run-all.mjs`、
 * 它 import 的又是哪一份 `support/self-check.mjs`"。拿副本跑时这两件事会分叉 ——
 * 读数记 A 树、跑的是 B 树，标签就是这么贴错的。
 * ⇒ 让**跑着的这份代码自己**报自己的路径 / 字节 / sha256，同批落盘（`entry-identity.txt` ·
 *   `self-check.json` · `judgement.txt`）：标签从此只能由跑着的这份代码写，不能手贴。
 *   `entry` 所在目录 ≠ `PATHS.testRoot` ⇒ 印 🔴：那一跑的 `[尺子]` 读数**不是**关于跑着的这份代码的，
 *   "跑的就是 `sources` 里那版"这句在那一跑不成立。
 */
const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()
const ENTRY_FILE = fileURLToPath(import.meta.url)
const SELF_CHECK_FILE = fileURLToPath(new URL('./support/self-check.mjs', import.meta.url))
const IDENTITY = {
  entry: { file: ENTRY_FILE, bytes: statSync(ENTRY_FILE).size, sha256: sha256Of(ENTRY_FILE) },
  self_check: { file: SELF_CHECK_FILE, bytes: statSync(SELF_CHECK_FILE).size, sha256: sha256Of(SELF_CHECK_FILE) },
  entry_tree: path.dirname(ENTRY_FILE),
  ruler_tree: PATHS.testRoot,
  entry_in_ruler_tree: path.resolve(path.dirname(ENTRY_FILE)).toLowerCase() === path.resolve(PATHS.testRoot).toLowerCase(),
}
const IDENTITY_LINE = `[尺子·入口] run-all.mjs ${IDENTITY.entry.file} · ${IDENTITY.entry.bytes} B · sha256 ${IDENTITY.entry.sha256}`
  + ` · self-check.mjs ${IDENTITY.self_check.file} · ${IDENTITY.self_check.bytes} B · sha256 ${IDENTITY.self_check.sha256}`
const RULER_SCOPE_LINE = `[尺子] 覆盖：${PATHS.testRoot} 那棵树（开跑 / 收口各量一次它自己的指纹）—— **不覆盖**"执行的是哪一份入口"；那一格由下一行 [尺子·入口] 回答`
const MISMATCH_LINE = IDENTITY.entry_in_ruler_tree
  ? null
  : `[尺子·入口] 🔴 入口不在 [尺子] 覆盖的那棵树里：入口树 = ${IDENTITY.entry_tree} ≠ ${PATHS.testRoot} ⇒ 这一跑的 [尺子] 读数**不是**关于跑着的这份代码的（两句都要读，别拿 [尺子] 给这一跑贴标签）`
const IDENTITY_TEXT = `${IDENTITY_LINE}\n${MISMATCH_LINE === null ? '' : `${MISMATCH_LINE}\n`}`
const writeJsonFile = (file, obj) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
  return file
}
/**
 * 🔴 这一跑的 `runSelfCheck()` **读数落盘** —— `ok / checked / failures` 与入口身份写在**同一份**
 * `self-check.json` 里。只在 log 里自报的 `ok=true · checked=31` 不算读数。
 * 落点：`<运行根的上一级>/<RUN_ID>.self-check.json`（判词只在 `<…>.self-check-FAIL.txt`）。
 * 过了自检之后同一份内容也写进运行根。
 */
const SELF_CHECK_READING = {
  run_id: RUN_ID,
  ok: selfCheck.ok,
  checked: selfCheck.checked,
  failures: selfCheck.failures,
  ...IDENTITY,
  measured_at: new Date().toISOString(),
}
const sidecar = (suffix) => path.join(path.dirname(RUN_ROOT), `${RUN_ID}.${suffix}`)
mkdirSync(path.dirname(RUN_ROOT), { recursive: true })
writeJsonFile(sidecar('self-check.json'), SELF_CHECK_READING)
writeFileSync(sidecar('entry-identity.txt'), IDENTITY_TEXT, 'utf8')

// ── ⓪' 自检不过 ⇒ 判词落盘 + 拒跑（exit 3；运行根不建）──────────────────────
if (!selfCheck.ok) {
  writeFileSync(
    sidecar('self-check-FAIL.txt'),
    `${IDENTITY_TEXT}F57-FAIL 自检：入口自己的判据表不符（${selfCheck.failures.length} 处，共 ${selfCheck.checked} 格）—— 这一跑不算数\n`
    + `${selfCheck.failures.map((f) => `  · ${f}`).join('\n')}\nexit=3\n`,
    'utf8',
  )
  console.error(`F57-FAIL 自检：入口自己的判据表不符（${selfCheck.failures.length} 处，共 ${selfCheck.checked} 格）—— 这一跑不算数`)
  for (const f of selfCheck.failures) console.error(`  · ${f}`)
  console.error(IDENTITY_LINE)
  if (MISMATCH_LINE !== null) console.error(MISMATCH_LINE)
  process.exit(3)
}

// ── ⓻ 靶子对数：这一跑打的是**哪棵树**、它与现役差多少 ────────────────────────
// 先量、先打（比用例更早）—— 用例炸了也要能读到这一行：绿不绿是一回事，"绿的是哪版"是另一回事。
const target = targetReport()
/**
 * 🔴 **`F-106`**：这一跑跑在**哪个平台版本**上（`resources/app.asar` 里那两份 package.json）。
 * 它是**读数**，不参与判词、不改退出码 —— 但它必须有落点：判据是对着这一版平台写的，
 * 平台换了（例如 0.2.2 把 `run_in_background` 还回来）而这一行还印着旧版本，人才看得见。
 * ⚠️ 别和 `AGENIA_ORACLE_VERSION` 混：那是冻结的 0.2.0 桌面 oracle（被测期望的来历）。
 */
const platform = platformReading()
const PLATFORM_LINE = platformLine(platform)
console.log(PLATFORM_LINE)
console.log(target.line)
console.log(RULER_SCOPE_LINE)
console.log(IDENTITY_LINE)
if (MISMATCH_LINE !== null) console.log(MISMATCH_LINE)

// ── ① 运行根：目录 + 三层 marker + 注入式时钟（与冻结跑法同形）──────────────
const dirs = ['tmp', 'state', 'brain-root', 'workspace', 'fixtures']
for (const d of dirs) mkdirSync(path.join(RUN_ROOT, d), { recursive: true })
for (const sub of ['route', 'state', 'brain', 'leader', 'retro', 'review', 'hire']) {
  mkdirSync(path.join(RUN_ROOT, 'workspace', '.team', sub), { recursive: true })
}
const marker = JSON.stringify({ kind: 'agenia-test-run', run_id: RUN_ID, created_at: new Date().toISOString(), schema: 1 })
for (const m of [RUN_ROOT, path.join(RUN_ROOT, 'brain-root'), path.join(RUN_ROOT, 'workspace')]) {
  const file = path.join(m, '.agenia-test-root')
  if (!existsSync(file)) writeFileSync(file, marker, 'utf8')
}
const nowFile = path.join(RUN_ROOT, 'state', 'now.txt')
if (!existsSync(nowFile)) writeFileSync(nowFile, '2026-10-14T12:00:00+08:00', 'utf8')

// 环境：临时件全落运行根（C 盘一个字节都不写）；被测 preset 是 staging，不是活体。
const STAGING = path.join(REPO, '.tools', '_staging', 'agenia-upgrade')
const ENV = {
  ...process.env,
  TEMP: path.join(RUN_ROOT, 'tmp'),
  TMP: path.join(RUN_ROOT, 'tmp'),
  DSH_HOME: path.join(RUN_ROOT, 'dsh-home'),
  AGENIA_TEST_RUN_ROOT: RUN_ROOT,
  AGENIA_STAGING_PRESET: path.join(STAGING, 'preset'),
  AGENIA_TEST_DATA_ROOT: path.join(RUN_ROOT, 'brain-root'),
  AGENIA_TEST_WORKSPACE: path.join(RUN_ROOT, 'workspace'),
  AGENIA_STATUS_ROOT: path.join(RUN_ROOT, 'workspace', '.team'),
  AGENIA_NOW_FILE: nowFile,
  AGENIA_DESKTOP_ORACLE_STANDARD: path.join(STAGING, 'oracle', 'standard.patch.yml'),
  AGENIA_ORACLE_VERSION: '0.2.0-rc.2',
  AGENIA_ORACLE_SHA256: '6CD2F197737FC94A45E487D0BB57869461DD6F392D45F6429B576E75D973EDA8',
}
mkdirSync(path.join(RUN_ROOT, 'dsh-home'), { recursive: true })
// 入口身份与自检读数进运行根（与 `<上一级>/<RUN_ID>.*` 那两份同一次测量、同一份内容）
writeJsonFile(path.join(RUN_ROOT, 'self-check.json'), SELF_CHECK_READING)
writeFileSync(path.join(RUN_ROOT, 'entry-identity.txt'), IDENTITY_TEXT, 'utf8')

/** 跑一个子进程；stdout/stderr 一律落盘（红的时候要能读全文）。 */
const run = (argv, outFile, errFile) => {
  const r = spawnSync(process.execPath, argv, { cwd: REPO, env: ENV, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  writeFileSync(outFile, r.stdout ?? '', 'utf8')
  writeFileSync(errFile, r.stderr ?? '', 'utf8')
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// ── ②–⑤ 四个相位 ─────────────────────────────────────────────────────────
const EVIDENCE = path.join(HERE, 'support', 'evidence.mjs')
const phase = (p) => run([EVIDENCE, '--real-roots', p], path.join(RUN_ROOT, 'tmp', `real-roots-${p}.txt`), path.join(RUN_ROOT, 'tmp', `real-roots-${p}.err.txt`))
const before = phase('before')
const testRun = run(['--test', '--test-concurrency=1', '--test-reporter=spec', GLOB], path.join(RUN_ROOT, 'stdout.txt'), path.join(RUN_ROOT, 'stderr.txt'))
const after = phase('after')
const settleRun = run([EVIDENCE, '--settle'], path.join(RUN_ROOT, 'tmp', 'settle.txt'), path.join(RUN_ROOT, 'tmp', 'settle.err.txt'))
writeFileSync(
  path.join(RUN_ROOT, 'subprocess-exit-codes.txt'),
  '# 这个文件装的是**子进程**的退出码（node --test / support/evidence.mjs），不是入口自己的。\n'
  + '# 入口自己的判词与退出码在 judgement.txt。\n'
  + `node --test exit=${testRun.code} (glob=${GLOB})\nreal-roots before=${before.code} after=${after.code} · settle exit=${settleRun.code}\n`,
  'utf8',
)

// ── ⑥ 读回结算 + 一行收口 ────────────────────────────────────────────────
/** `…<_runs>/<RUN_ID>` ⇒ `…<_evidence>/<RUN_ID>`（与 `support/evidence.mjs` 的 `evidenceRoot()` 同口径）。 */
const settlementRoot = path.join(path.dirname(path.dirname(RUN_ROOT)), '_evidence', RUN_ID)
const settlementFile = path.join(settlementRoot, 'settlement.json')
let s = null
try {
  s = JSON.parse(readFileSync(settlementFile, 'utf8'))
} catch {
  s = null
}
if (s === null) {
  const bad = `F57-NO-SETTLEMENT: 结算报告没生成（${settlementFile}）—— 这一跑不算结算`
  console.error(bad)
  if (settleRun.stderr.trim() !== '') console.error(settleRun.stderr.trim().split('\n').slice(0, 8).join('\n'))
  writeFileSync(path.join(RUN_ROOT, 'judgement.txt'), `${[PLATFORM_LINE, target.line, RULER_SCOPE_LINE, IDENTITY_LINE, bad, 'exit=1'].join('\n')}\n`, 'utf8')
  process.exit(1)
}

// 🔴 **`R-5`**：这一跑**执行的是哪一版尺子**（测试树）—— 与"打的是哪棵树"（`target.line`）并列，
//    都是"这一跑的结论该算在谁头上"的锚点。收口那份 `sources` 是跑完之后量的，冒充不了它。
const testTree = s.test_tree ?? null
if (testTree === null) {
  console.log('[尺子] 判不了：这份 settlement 没有 `test_tree`（老 run-root）⇒ "跑的是哪版测试代码"没有落点')
} else if (testTree.same === true) {
  const short = String(testTree.preflight_sha256).slice(0, 16)
  console.log(`[尺子] 测试树 ${short} · ${testTree.settle_files} 份 · 开跑 ${testTree.preflight_at} 与收口一致 ⇒ 这一跑跑的**就是** \`sources\` 里那版`)
} else if (testTree.same === false) {
  console.log(`[尺子] 🔴 测试树在跑动中变过：开跑 ${String(testTree.preflight_sha256).slice(0, 16)} ≠ 收口 ${String(testTree.settle_sha256).slice(0, 16)}`)
  console.log(`       差异 ${JSON.stringify(testTree.differ)} ⇒ 收口那份 \`sources\` 不能代表"跑的那版"；这一跑不能当基线的收口证据`)
} else {
  console.log('[尺子] 判不了：预检里没有测树指纹（`test_tree_sha256`）⇒ "跑的是哪版"没有落点')
}

const denominator = s.registry.total
const discovered = s.discovery?.cases ?? null
const diffs = s.discovery?.problems ?? ['（这份 settlement 里没有 discovery 一节 —— 分母不是由盘上事实推出来的）']
const consistent = Array.isArray(diffs) && diffs.length === 0
const ranFiles = s.run_scope.files_in_run.length
const settled = s.settled.total
const hold = s.settled.holds ?? 0
const parseCount = (label) => {
  const m = new RegExp(`ℹ ${label} (\\d+)`).exec(testRun.stdout)
  return m === null ? null : Number(m[1])
}
const nodeTests = parseCount('tests')
const nodeFail = parseCount('fail')

/**
 * `--glob` 声明的范围里有几条用例（相对 `REPO` 与发现器同一批文件）。
 * 为什么要有它：收窄范围是**合法用法**，但"声明 11 条 / 只跑到 10 条"必须非零；
 * 而"声明 11 条 / 跑到 11 条"只是**这一跑**，不是全量 —— 那一格由 `F57-SCOPE` 单独说清。
 */
const globToRe = (glob) => new RegExp(`^${String(glob)
  .replace(/\\/g, '/')
  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, '\u0000')
  .replace(/\*/g, '[^/]*')
  .replace(/\u0000/g, '.*')}$`)
const scopeOf = () => {
  try {
    const re = globToRe(GLOB)
    return DISCOVERY.cases.filter((c) => re.test(path.relative(REPO, path.join(DISCOVERY.root, c.file)).replace(/\\/g, '/'))).length
  } catch {
    return null
  }
}
const scopeCases = GLOB_GIVEN === null ? null : scopeOf()

const verdict = entryVerdict({
  denominator,
  scopeCases: scopeCases === null ? denominator : scopeCases,
  scopeDeclared: GLOB_GIVEN !== null,
  settled,
  red: s.settled.red,
  green: s.settled.green,
  hold,
  consistent,
  diffCount: diffs.length,
  nodeExit: testRun.code,
  nodeTests,
  nodeFail,
  settleExit: settleRun.code,
  targetProblems: target.problems.map((p) => p.message),
})

const line = [
  `F57-SETTLE 分母 ${denominator}`,
  `· 盘上发现 ${discovered === null ? '(缺失)' : discovered}`,
  `· 跑到 ${ranFiles} 文件/${settled} 条${verdict.fullScope ? '' : `（scope ${scopeCases ?? '?'}/${denominator}）`}`,
  `· RED ${s.settled.red} / GREEN ${s.settled.green} / HOLD ${hold}`,
  `· 登记=盘上 ${consistent ? '✓' : `✗（${diffs.length} 处）`}`,
  `· node --test exit ${testRun.code}（tests ${nodeTests ?? '?'} · fail ${nodeFail ?? '?'}）`,
  `· settle exit ${settleRun.code}`,
].join(' ')
console.log(line)
/**
 * 判词（`F57-SCOPE` / `F57-FAIL …` / `F57-OK`）由 `judgementLines()` 一处产生，并且**默认落盘**
 * 到运行根的 `judgement.txt` —— 不靠 `--json` 才留得下。
 * 理由："我看到的"和"下一个人打开运行根看到的"必须是同一份东西；入口自己那一行判断
 * 从前只活在控制台里，运行根里只剩子进程的退出码 ⇒ 那一格等于没证据。
 */
const judgement = judgementLines(verdict, { settled, denominator, scopeCases })
for (const l of judgement) console.log(l)
writeFileSync(path.join(RUN_ROOT, 'judgement.txt'), `${[PLATFORM_LINE, target.line, RULER_SCOPE_LINE, IDENTITY_LINE, line, ...judgement, `exit=${verdict.exitCode}`].join('\n')}\n`, 'utf8')

if (JSON_OUT !== null) {
  writeFileSync(path.resolve(JSON_OUT), `${JSON.stringify({
    run_root: RUN_ROOT, glob: GLOB, scope_declared: GLOB_GIVEN !== null, scope_cases: scopeCases,
    denominator, discovered, consistent, diffs,
    ran_files: ranFiles, settled, red: s.settled.red, green: s.settled.green, hold,
    node_exit: testRun.code, node_tests: nodeTests, node_fail: nodeFail, settle_exit: settleRun.code,
    reporter_check_ok: s.reporter_check_ok,
    target: {
      ok: target.ok, state: target.state, line: target.line,
      staged_root: target.measured.stagedRoot, baseline_root: target.measured.baselineRoot,
      declaration: target.declaration.path, declaration_present: target.declaration.present,
      actuals: target.actuals, problems: target.problems,
    },
    /** 🔴 这一跑执行的是**哪一份入口代码**（同批落在 `entry-identity.txt` / `self-check.json` / 本文件）。 */
    entry: IDENTITY,
    self_check: SELF_CHECK_READING,
    /** 🔴 `F-106`：这一跑的平台版本（读数；判不了也照样出这一节，`ok:false` + `problems`）。 */
    platform: {
      ok: platform.ok, line: PLATFORM_LINE, asar: platform.asar, source: platform.source,
      level: platform.level, hardcoded_fallback: platform.hardcoded_fallback,
      app: platform.app, dsh: platform.dsh, problems: platform.problems,
      /** ⚠️ `R-8`：`tried` 必须在这儿 —— "判不了"的全部用处就是"试过 ①·②·③·④"。 */
      tried: platform.tried,
    },
    exit_code: verdict.exitCode, ok: verdict.ok, full_scope: verdict.fullScope,
    problems: verdict.failures, line, judgement,
  }, null, 2)}\n`, 'utf8')
}

// 判词已经打在上面（`F57-FAIL` 那几行），不再往 stderr 复制一份 —— 控制台与 judgement.txt 同一份文字。
process.exit(verdict.exitCode)
