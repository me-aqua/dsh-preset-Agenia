#!/usr/bin/env node
/**
 * **唯一结算入口**（F-57）—— 跑一次，**分母只有一个数**，退出码与它说同一件事。
 *
 * 它替代的是 `.team/test/2026-10-14/_scan/run-full-55.ps1` 那套「两段命令 + 两句读数」的跑法：
 * 旧跑法里 `node --test` 的退出码与 `settle` 的"分母 55"是**两条互不知情的读数**，
 * 中间没有任何东西要求它们说同一件事。
 *
 * 一次做六件事：
 *   ⓪ **自检**（`support/self-check.mjs` 的冻结表：判据被改回去 ⇒ 拒跑 exit 3）
 *   ① 建运行根（三层 marker，与冻结跑法一致）→ ② 真实根 before 哈希 → ③ `node --test <glob>`
 *   → ④ 真实根 after 哈希 → ⑤ `--settle` → ⑥ **打一行**，并用**一个**退出码收口。
 *
 * 用法（cwd 随便；`--glob` 相对 `--repo`）：
 *   node tests/agenia-upgrade/run-all.mjs --run-root=<绝对路径>\...\_runs\<RUN_ID>
 *   node tests/agenia-upgrade/run-all.mjs --run-root=… --glob="tests/agenia-upgrade/static/read-obligations.test.mjs"
 *   （不给 `--run-root` ⇒ 拒跑 exit 3 —— 证据落点不靠默认值猜）
 *
 * 那一行的形状（**唯一**允许写分母的地方）：
 *   F57-SETTLE 分母 66 · 盘上发现 66 · 跑到 20 文件/66 条 · RED 0 / GREEN 64 / HOLD 2 · 登记=盘上 ✓ · node --test exit 0（tests 66 · fail 0） · settle exit 0
 *
 * 🔴 **`F57-OK` 只在"分母 = 跑到 = 全绿 = 无 HOLD"时出现**。其余情况一个 OK 都不许有：
 *   · `HOLD > 0` ⇒ `exit 2`（判不了不是绿）
 *   · `--glob` 收窄 ⇒ 那一行只代表"这一跑"，另补一行 `F57-SCOPE` 明写"不是全量证据"，且**不打 OK**
 *   · `settled ≠ 声明的范围` / `node --test` 的条数 ≠ 结算条数 ⇒ `exit 1`（半跑与两套读数都非零）
 *
 * 退出码：`0` 全绿且这一跑算数 · `1` 有红 / 不一致 / 空跑 / 半跑 / 两套读数打架 · `2` 有 HOLD · `3` 用法或环境不成立（拒跑）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { entryVerdict } from './support/verdict.mjs'
import { runSelfCheck } from './support/self-check.mjs'
import { DISCOVERY } from './support/registry.mjs'

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
const selfCheck = runSelfCheck()
if (!selfCheck.ok) {
  console.error(`F57-FAIL 自检：入口自己的判据表不符（${selfCheck.failures.length} 处，共 ${selfCheck.checked} 格）—— 这一跑不算数`)
  for (const f of selfCheck.failures) console.error(`  · ${f}`)
  process.exit(3)
}

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
writeFileSync(path.join(RUN_ROOT, 'exit-code.txt'), `node --test exit=${testRun.code} (glob=${GLOB})\nreal-roots before=${before.code} after=${after.code} · settle exit=${settleRun.code}\n`, 'utf8')

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
  console.error(`F57-NO-SETTLEMENT: 结算报告没生成（${settlementFile}）—— 这一跑不算结算`)
  if (settleRun.stderr.trim() !== '') console.error(settleRun.stderr.trim().split('\n').slice(0, 8).join('\n'))
  process.exit(1)
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
// 收窄的一跑只代表它自己：明写"不是全量证据"，别让人从"跑绿了"读出"全量绿"；这种跑**不给 OK**。
if (!verdict.fullScope) console.log(`F57-SCOPE 这一跑只覆盖 ${settled}/${denominator} 条（--glob 声明的范围 = ${scopeCases ?? '?'}）—— 不是全量证据，不给 OK，也不能当验收读数`)

if (JSON_OUT !== null) {
  writeFileSync(path.resolve(JSON_OUT), `${JSON.stringify({
    run_root: RUN_ROOT, glob: GLOB, scope_declared: GLOB_GIVEN !== null, scope_cases: scopeCases,
    denominator, discovered, consistent, diffs,
    ran_files: ranFiles, settled, red: s.settled.red, green: s.settled.green, hold,
    node_exit: testRun.code, node_tests: nodeTests, node_fail: nodeFail, settle_exit: settleRun.code,
    reporter_check_ok: s.reporter_check_ok,
    exit_code: verdict.exitCode, ok: verdict.ok, full_scope: verdict.fullScope,
    problems: verdict.failures, line,
  }, null, 2)}\n`, 'utf8')
}

if (verdict.failures.length > 0) {
  for (const p of verdict.failures) console.error(`F57-FAIL ${p}`)
}
// 🔴 只有"分母 = 跑到 = 全绿 = 无 HOLD"才允许出现 OK；判不了、只跑了一部分，都不许有这个词。
if (verdict.ok) console.log('F57-OK 分母只有一个数，且它与 node --test 的退出码说同一件事')
process.exit(verdict.exitCode)
