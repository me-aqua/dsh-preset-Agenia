/**
 * 结算探针 —— 给判据（`STM-01` / `WIT-01`）造一份**合成证据根**，然后在子进程里跑真入口
 * `node support/evidence.mjs --settle`，读回 `settlement.json` / `settlement.md` / 退出码。
 *
 * 🔴 **这不是判据本体**：它是"把结算放到一个我控制得了的输入上跑"的架子和量具。
 *    · 判据要的是**行为**（改坏 DR-02 的读数 ⇒ 结算行必须跟着红/变字），不是让真结算去跑真证据；
 *    · `DR-02` 那一条**必须**是**真读数**（调用方传进来）—— 合成它就没有"结算读 DR-02"这回事了。
 *    · 同文件里的兄弟用例（`DR-01` / `DR-03` / `TMP-01` / `STM-01`）用一份**明确标注的**合成记录补齐，
 *      目的是让报告器的"文件内缺结算"那一格闭嘴 —— 它是**夹具**，不是"这几条跑过了"的声明。
 *
 * 证据根口径与 `evidence.mjs::evidenceRoot()` 同一条：`<运行根>/../..` 那层下的 `_evidence/<run id>`。
 * 探针**自己复算**这条规则，并在读 `result.json` 时核对它 —— 规则一变就红 `PROBE-EVIDENCE-ROOT-MISMATCH`，
 * 不会静默去读另一棵树。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, PATHS } from './env.mjs'

/** 与 `evidence.mjs::evidenceRoot()` 同一条规则的**独立复算**（不是从那边 import 来的）。 */
export function evidenceDirOfRunRoot(runRoot) {
  const abs = path.resolve(runRoot)
  return path.join(path.dirname(path.dirname(abs)), '_evidence', path.basename(abs))
}

export function writeJsonFile(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
  return file
}

/** 同文件里的兄弟用例：只为了让"文件内缺结算"那一格闭嘴的夹具。 */
export function syntheticPeerRecord(id, note = '结算探针的夹具') {
  return {
    id,
    registry: null,
    group: 'data-root',
    file: 'integration/data-root.test.mjs',
    registry_status: 'written',
    run_id: null,
    started_at: null,
    finished_at: null,
    ms: 0,
    result: 'GREEN',
    problems: [],
    holds: [],
    readings: {},
    synthetic_fixture: note,
  }
}

/**
 * 造一份合成证据根：两相位（before/after 同一份快照 ⇒ `diff=[]`）+ 同文件兄弟用例的合成记录
 * + 调用方给的那几份**真**记录（`records: { 'DR-02': object }`）。
 *
 * @returns {{ runRoot: string, evidenceDir: string, phasePath: string }}
 */
export function buildSettlementProbe({ baseDir, name, snapshot, records, peers = ['DR-01', 'DR-03', 'TMP-01', 'STM-01'] }) {
  const runRoot = path.join(baseDir, name)
  const evidenceDir = evidenceDirOfRunRoot(runRoot)
  mkdirSync(path.join(runRoot, 'tmp'), { recursive: true })
  writeJsonFile(path.join(evidenceDir, '_preflight', 'real-roots.before.json'), snapshot)
  writeJsonFile(path.join(evidenceDir, '_preflight', 'real-roots.after.json'), snapshot)
  for (const id of peers) writeJsonFile(path.join(evidenceDir, id, 'result.json'), syntheticPeerRecord(id))
  for (const [id, rec] of Object.entries(records)) writeJsonFile(path.join(evidenceDir, id, 'result.json'), rec)
  return { runRoot, evidenceDir }
}

/**
 * ── 子进程里的**用例体** / **测试文件副本**（`STM-01` / `WIT-01` / `HCA-01` 共用）──────────────
 *
 * 为什么要有它：判据要量的是"**换一份输入，同一个用例体会给出另一个判词**"
 * （`STM-01`：DR-02 的判词不是 GREEN 时；`WIT-01`：源码被剪掉一段时；`HCA-01`：`caseHold` 少传实参时）。
 * 这种问题用真跑量不到 —— 真跑只有一种环境。也不能靠 import：用例体住在 `test()` 里，
 * import 一个 `.test.mjs` 会把它整份注册一遍。
 * ⇒ 子进程 + 一份**独立运行根**（三层 marker / `state/now.txt` / `TEMP`·`TMP` 都在里面），
 *   这样"换一份输入"不会污染主运行根，也不会在真证据根里留下孤儿目录（`settle()` 会对那件事报红）。
 */
export function testRunEnv(runRoot, { extra = {} } = {}) {
  const root = path.resolve(runRoot)
  for (const d of ['tmp', 'state', 'brain-root', 'workspace', 'fixtures', 'dsh-home']) mkdirSync(path.join(root, d), { recursive: true })
  for (const sub of ['route', 'state', 'brain', 'leader', 'retro', 'review', 'hire']) mkdirSync(path.join(root, 'workspace', '.team', sub), { recursive: true })
  for (const m of [root, path.join(root, 'brain-root'), path.join(root, 'workspace')]) {
    const marker = path.join(m, '.agenia-test-root')
    if (!existsSync(marker)) writeFileSync(marker, JSON.stringify({ kind: 'agenia-test-run', run_id: path.basename(root), created_at: new Date().toISOString(), schema: 1 }), 'utf8')
  }
  writeFileSync(path.join(root, 'state', 'now.txt'), '2026-10-14T12:00:00+08:00', 'utf8')
  const childEnv = {
    ...process.env,
    TEMP: path.join(root, 'tmp'),
    TMP: path.join(root, 'tmp'),
    DSH_HOME: path.join(root, 'dsh-home'),
    [ENV.RUN_ROOT]: root,
    [ENV.TEST_DATA_ROOT]: path.join(root, 'brain-root'),
    [ENV.TEST_WORKSPACE]: path.join(root, 'workspace'),
    [ENV.STATUS_ROOT]: path.join(root, 'workspace', '.team'),
    [ENV.NOW_FILE]: path.join(root, 'state', 'now.txt'),
    /**
     * 探针**嵌套深度**（只增不减）：`WIT-01` 会把整份 `data-root.test.mjs` 放进子进程，
     * 那一跑里的 `STM-01` 再想开自己的端到端探针就是"套娃"—— 读到深度 > 0 的用例可以
     * **显式跳过**那些内层探针（并把跳过这件事写进读数），别让一次全量跑炸成指数。
     */
    AGENIA_PROBE_DEPTH: String(Number(process.env.AGENIA_PROBE_DEPTH ?? 0) + 1),
    ...extra,
  }
  /**
   * 🔴 父进程是 `node --test` 的子进程时，环境里带着 `NODE_TEST_CONTEXT`：嵌套的 `node --test`
   * 会打印 "run() is being called recursively … skipping running files" 然后 **exit 0 但一条都不跑**
   * —— 那种"0 红"是脚手架坏了，不是刀的结果（`WIT-01` 的实测）。
   */
  delete childEnv.NODE_TEST_CONTEXT
  delete childEnv.NODE_TEST_REPORTER
  return childEnv
}

/** 读一份证据根里某条用例的 `result.json`（读不到 ⇒ `null`，**不许**抛）。 */
export function readCaseResult(evidenceDir, id) {
  const file = path.join(evidenceDir, id, 'result.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 在子进程里跑**一段用例体**（一个独立模块，自己调 `runCase`），读回它的 `result.json`。
 * `source` 是一整份 ESM 源码；它 import 的 `evidence.mjs` 由调用方用**绝对 `file://`** 指过来
 * （副本/探针不许依赖相对路径 —— 那会把"跑的是哪一份 harness"变成一个隐式假设）。
 */
export function spawnCaseProbe({ baseDir, name, source, id, fileName = 'probe.mjs', runRootName = null, extraEnv = {}, timeoutMs = 180000 }) {
  const dir = path.join(baseDir, name)
  mkdirSync(dir, { recursive: true })
  const runRoot = path.join(dir, runRootName ?? 'run')
  const env = testRunEnv(runRoot, { extra: extraEnv })
  const file = path.join(dir, fileName)
  writeFileSync(file, source, 'utf8')
  const r = spawnSync(process.execPath, [file], { cwd: PATHS.repo, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs })
  const evidenceDir = evidenceDirOfRunRoot(runRoot)
  return {
    runRoot,
    evidenceDir,
    file,
    exit: r.status,
    stdout: String(r.stdout ?? ''),
    stderr: String(r.stderr ?? ''),
    record: readCaseResult(evidenceDir, id),
    env: { TEMP: env.TEMP, TMP: env.TMP, DSH_HOME: env.DSH_HOME },
  }
}

/**
 * 在子进程里跑**一份测试文件的副本**（`node --test --test-name-pattern=…`），
 * 读回这份独立证据根里所有写出来的 `result.json`。
 * `seed`：先往证据根里放几份记录（`{ 'DR-02': record }`）——这就是"喂环境条件"那一步。
 */
export function spawnTestFileVariant({ baseDir, name, file, testNamePattern, runRootName = null, extraEnv = {}, seed = {}, timeoutMs = 300000 }) {
  const dir = path.join(baseDir, name)
  mkdirSync(dir, { recursive: true })
  const runRoot = path.join(dir, runRootName ?? 'run')
  const env = testRunEnv(runRoot, { extra: extraEnv })
  const evidenceDir = evidenceDirOfRunRoot(runRoot)
  const seedIds = Object.keys(seed)
  for (const id of seedIds) writeJsonFile(path.join(evidenceDir, id, 'result.json'), seed[id])
  const argv = ['--test', '--test-concurrency=1', '--test-reporter=spec']
  if (typeof testNamePattern === 'string' && testNamePattern !== '') argv.push(`--test-name-pattern=${testNamePattern}`)
  argv.push(file)
  const r = spawnSync(process.execPath, argv, { cwd: PATHS.repo, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: timeoutMs })
  const results = {}
  for (const id of seedIds) results[id] = readCaseResult(evidenceDir, id)
  if (existsSync(evidenceDir)) {
    for (const n of readdirSync(evidenceDir)) {
      if (n.startsWith('_')) continue
      const rec = readCaseResult(evidenceDir, n)
      if (rec !== null) results[n] = rec
    }
  }
  return { runRoot, evidenceDir, exit: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? ''), results }
}

/**
 * 在子进程里跑**真**结算入口（`--settle`），读回三样：退出码 · `settlement.json` · `settlement.md`。
 * 证据根**自己复算**并核对（读不到 `settlement.json` ⇒ `PROBE-EVIDENCE-ROOT-MISMATCH`）。
 */
export function runSettleCLI({ runRoot, timeoutMs = 120000 }) {
  const evidenceDir = evidenceDirOfRunRoot(runRoot)
  const childEnv = { ...process.env, [ENV.RUN_ROOT]: runRoot }
  // 结算入口不是 `node --test`，但父进程可能带着测试 runner 的变量 —— 一并摘掉，别把上下文带进去。
  delete childEnv.NODE_TEST_CONTEXT
  delete childEnv.NODE_TEST_REPORTER
  const r = spawnSync(process.execPath, [path.join(PATHS.testRoot, 'support', 'evidence.mjs'), '--settle'], {
    cwd: PATHS.repo,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  })
  const jsonFile = path.join(evidenceDir, 'settlement.json')
  const mdFile = path.join(evidenceDir, 'settlement.md')
  const present = existsSync(jsonFile) && existsSync(mdFile)
  let settlement = null
  let markdown = null
  if (present) {
    try {
      settlement = JSON.parse(readFileSync(jsonFile, 'utf8'))
      markdown = readFileSync(mdFile, 'utf8')
    } catch {
      settlement = null
      markdown = null
    }
  }
  return {
    exit: r.status,
    stdout: String(r.stdout ?? ''),
    stderr: String(r.stderr ?? ''),
    evidenceDir,
    present: present && settlement !== null && markdown !== null,
    settlement,
    markdown,
  }
}

/** `settlement.md` 里「真实根前后」那一条（按行首找；红的时候行首是 `- 🔴 …`；找不到 ⇒ `null`）。 */
export function realRootsLineOf(markdown) {
  if (typeof markdown !== 'string') return null
  const line = markdown.split(/\r?\n/).find((l) => /^-\s*(🔴\s*)?真实根前后/.test(l))
  return line ?? null
}

/** `settlement.md` 里「覆盖边界」那一条（`真实根前后` 下面的缩进子条）。 */
export function coverageLineOf(markdown) {
  if (typeof markdown !== 'string') return null
  const lines = markdown.split(/\r?\n/)
  const at = lines.findIndex((l) => /^-\s*(🔴\s*)?真实根前后/.test(l))
  if (at < 0) return null
  for (let i = at + 1; i < lines.length; i += 1) {
    if (/^\s+-\s/.test(lines[i])) return lines[i]
    if (/^-\s/.test(lines[i])) break
  }
  return null
}

/**
 * **`DR-02` 的判词能不能喂给 `STM-01`**（`F3`，技术评审 2026-11-09）。
 *
 * 病：`STM-01` 原来读的是 `realDr02.result !== 'GREEN'` ⇒ **一律**记红
 * （`STM-SETUP`「本跑的 DR-02 不是 GREEN」）。而 `DR-02` 有一格是**环境性 HOLD**
 * （`DR02-EXCLUSION-NO-DATA-ROOT`：只读副本里没有 `presets/agenia/.runtime`，
 * 命中 0 分不清"排除生效了"与"没东西可排"）。那条件**与被测对象无关** ⇒
 * `STM-01` 在副本上必红，红因却指向"DR-02 坏了"。同一件事在 `WIT-01` 上再红一次（它要求 `STM-01` 绿）。
 *
 * 三态（**红是红、挂起是挂起**）：
 *   · `GREEN` ⇒ `{kind:'GREEN'}`，五条腿照跑；
 *   · `HOLD`  ⇒ `{kind:'HOLD', code:'STM-SETUP-DR02-HOLD'}`，**并把 DR-02 的成因码逐个点名**
 *     （读的人不用回 DR-02 那一格去猜"为什么挂起"）；
 *   · `RED`   ⇒ `{kind:'RED', code:'STM-SETUP'}`，仍然是红（HOLD 不许变成藏身处）；
 *   · 记录缺失 / 形状不对 ⇒ `{kind:'HOLD', code:'STM-SETUP-DR02-NO-READING'}`（判不了，**不是绿**）。
 *
 * 纯函数：真跑与刀喂同一份（`cand-20261020-0064`：判断先抽成纯函数，再用假输入量它翻不翻面）。
 *
 * @param {object|null} record  `_evidence/<run>/DR-02/result.json` 的内容
 * @returns {{kind:'GREEN'|'HOLD'|'RED', code:string|null, why:string, dr02_codes:string[], hold_kind?:'environment'|'case'}}
 *   `hold_kind` 只在那两态是 HOLD 时给（结算句组的 `HOLD … env|case` 读它，见 `SHN-01`）。
 */
export function dr02FeedVerdict(record) {
  const dr02Codes = (Array.isArray(record?.holds) ? record.holds : [])
    .map((h) => (typeof h?.code === 'string' ? h.code : null))
    .filter((c) => c !== null)
  const result = record?.result ?? null
  if (result === 'GREEN') {
    return { kind: 'GREEN', code: null, why: '本跑的 DR-02 = GREEN，下面那些"读数完好"的前提成立', dr02_codes: [] }
  }
  if (result === 'HOLD') {
    return {
      kind: 'HOLD',
      code: 'STM-SETUP-DR02-HOLD',
      /** 结算句组读的 kind：DR-02 自己挂起了 ⇒ 这一格是**环境**没给到读数，不是被测对象坏了（`SHN-01`）。 */
      hold_kind: 'environment',
      why: `本跑的 DR-02 是 **HOLD**（成因码 ${JSON.stringify(dr02Codes)}）—— 它是"判不了"，不是"坏了"：`
        + '这一格要的是 DR-02 的**真读数**，而 DR-02 自己没判出来 ⇒ 这里没有对象可判。'
        + '**不记红**（红是"被测对象错了"）；要看成因就读 DR-02 那一格。',
      dr02_codes: dr02Codes,
    }
  }
  if (result === 'RED') {
    return {
      kind: 'RED',
      code: 'STM-SETUP',
      why: `本跑的 DR-02 = RED（problems / holds 见 DR-02 那一格）—— 它坏了，所以这一格也坏：`
        + '这一条是**真红**，先看 DR-02 自己的红因。',
      dr02_codes: dr02Codes,
    }
  }
  return {
    kind: 'HOLD',
    code: 'STM-SETUP-DR02-NO-READING',
    hold_kind: 'environment',
    why: `读不到本跑 DR-02 的判词（result=${JSON.stringify(result)}）—— 没有"DR-02 的读数"这个对象，这一格判不了`,
    dr02_codes: dr02Codes,
  }
}
