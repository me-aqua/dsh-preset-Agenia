/**
 * SUT 入口 —— 动态 import + 子进程调用器。
 *
 * 冻结依据：提案 §B1.2（运行入口）/ §B1.3（生产文件布局）/ §B1.4（CLI 调用形状 + 退出码）
 * / §B1.6（子进程必须是真的）/ §B1.5（纯函数接缝：按最终落点 import）。
 *
 * 🔴 **为什么一切都是动态 import**：契约 §9.3 允许首跑红在
 * `SUT-SURFACE-MISSING` / `ERR_MODULE_NOT_FOUND` / 非 0 CLI 上。
 * 如果被测模块走**顶层 import**，一个不存在的文件会让**整个测试文件**在加载期就炸 ——
 * 那样一来"14 条各自红"就变成"一个文件报一次错"，分母当场失效。
 * 所以：**被测对象一律在用例体内 import**，缺面就抛 `SUT-SURFACE-MISSING`。
 */
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { canonical, isUnder } from './root-guard.mjs'
import { ENV, PATHS, optionalEnv, requireEnv } from './env.mjs'

export const NODE_BIN = process.execPath

export class SutSurfaceMissing extends Error {
  constructor(rel, abs, cause) {
    super(`SUT-SURFACE-MISSING: 被测面还不存在 —— ${rel}\n  落点：${abs}\n  原因：${cause ?? '文件不存在（实现关尚未落 staging）'}`)
    this.name = 'SutSurfaceMissing'
    this.code = 'SUT-SURFACE-MISSING'
    this.rel = rel
    this.abs = abs
  }
}

export class SutImportFailed extends Error {
  constructor(rel, abs, cause) {
    super(`SUT-IMPORT-FAILED: 被测面存在但 import 失败 —— ${rel}\n  落点：${abs}\n  原因：${cause}`)
    this.name = 'SutImportFailed'
    this.code = 'SUT-IMPORT-FAILED'
    this.rel = rel
    this.abs = abs
  }
}

/** staged preset 根（**被测对象**；活体永远不是）。 */
export function stagingRoot(env = process.env) {
  return canonical(requireEnv(ENV.STAGING_PRESET, env))
}

/** staging 下的绝对落点；`..` 穿越 / 绝对逃逸一律拒（提案 §B1.5 resolveWithin 的测试侧同形）。 */
export function stagingPath(rel, env = process.env) {
  const root = stagingRoot(env)
  const abs = canonical(path.resolve(root, rel))
  if (!isUnder(abs, root)) {
    const err = new Error(`E_PATH_ESCAPE: ${rel} 逃出了 staging 根 ${root}`)
    err.code = 'E_PATH_ESCAPE'
    throw err
  }
  return abs
}

export function stagingExists(rel, env = process.env) {
  try {
    return existsSync(stagingPath(rel, env))
  } catch {
    return false
  }
}

/** 读 staged 文本；缺面 ⇒ `SUT-SURFACE-MISSING`（RED-SURFACE，就是预期的首跑红）。 */
export function readStagedText(rel, env = process.env) {
  const abs = stagingPath(rel, env)
  if (!existsSync(abs)) throw new SutSurfaceMissing(rel, abs)
  return readFileSync(abs, 'utf8')
}

/**
 * 动态 import 一个 staged 模块。
 * `ERR_MODULE_NOT_FOUND` ⇒ 缺面（含"它 import 的兄弟文件还没写"这一种）；
 * 其它错误（语法错、apply 期副作用崩）⇒ `SUT-IMPORT-FAILED`，**不许混成缺面**。
 */
export async function importStaged(rel, env = process.env) {
  const abs = stagingPath(rel, env)
  if (!existsSync(abs)) throw new SutSurfaceMissing(rel, abs)
  const url = new URL(`file:///${abs.replace(/\\/g, '/')}`).href
  try {
    return await import(url)
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') throw new SutSurfaceMissing(rel, abs, `它自己或它 import 的东西不在盘上：${err.message}`)
    throw new SutImportFailed(rel, abs, err?.message ?? String(err))
  }
}

/** 取导出的命名函数；没有就当成缺面（拍板 Q1：guard 三个纯函数用命名 export）。 */
export function requireExport(mod, name, rel) {
  const fn = mod?.[name]
  if (typeof fn !== 'function') {
    const err = new SutSurfaceMissing(`${rel} → export function ${name}`, `${rel}#${name}`, `模块在，但没有导出函数 ${name}（拍板 Q1 冻结了导出名）`)
    err.code = 'SUT-SURFACE-MISSING'
    throw err
  }
  return fn
}

/**
 * 载入一个 staged 模块并点名要哪些命名导出 —— **不抛**，把"缺面/缺导出/import 失败"如实回报，
 * 让用例自己决定怎么记（缺面是预期红，import 崩是另一回事）。
 *
 * ⚠️ `missing` 只管**存在性**（`!(n in mod)` 或值为 `undefined`）—— 冻结签名里既有函数也有**常量**
 * （`HALF_LIFE_DAYS` 对象 / `TYPE_IDS` 数组 …），拿"是不是函数"当存在性判据会把常量误判成"没导出"
 * （MEM-01 / MEM-10 曾因此永远多一项假红）。**类型要求另外查**：见 `nonCallables()`。
 */
export async function loadStagedModule(rel, names = [], env = process.env) {
  if (!stagingExists(rel, env)) {
    return { rel, surfaceMissing: true, mod: null, missing: [...names], errors: [`staged 还没有 ${rel}`] }
  }
  try {
    const mod = await importStaged(rel, env)
    return { rel, surfaceMissing: false, mod, missing: names.filter((n) => !(n in mod) || typeof mod[n] === 'undefined'), errors: [] }
  } catch (err) {
    return {
      rel,
      surfaceMissing: err?.code === 'SUT-SURFACE-MISSING',
      mod: null,
      missing: [...names],
      errors: [String(err.message).slice(0, 240)],
    }
  }
}

/**
 * 冻结签名里**必须是函数**的那些名字里，实际不是函数的（存在但不是函数的那些）。
 * 与 `loadStagedModule().missing` 分工：那边管"在不在"，这边管"类型对不对" ——
 * 不存在的不在这里重复报（已经由 `missing` 报了）。
 */
export function nonCallables(mod, names = []) {
  // 模块**整个不在**时返回空：那种情况下"在不在"已经由 `loadStagedModule().missing` 逐个点名了，
  // 这里再逐个说一遍"不是函数"只是噪声（REV-01 补写 B 半后首跑就多出 4 条这样的）。
  if (mod === null || typeof mod !== 'object') return []
  // 值为 `undefined` 的**也不在这里报**（同样算"没导出"，由 `missing` 报 —— 避免同一个名字报两条）
  return names.filter((n) => n in mod && typeof mod[n] !== 'undefined' && typeof mod[n] !== 'function')
}

// ── 子进程 ─────────────────────────────────────────────────────────────────
function cliAbs(cliName, env) {
  return stagingPath(path.join('bin', cliName), env)
}

/** 子进程必须显式拿到的环境：TEMP/TMP 落运行根、注入式时钟、测试模式标记。 */
export function childEnv(env = process.env) {
  const run = canonical(requireEnv(ENV.RUN_ROOT, env))
  const tmp = path.join(run, 'tmp')
  mkdirSync(tmp, { recursive: true })
  const out = { ...env, TEMP: tmp, TMP: tmp }
  out[ENV.RUN_ROOT] = run
  return out
}

/** 夹具命名（契约 §2.5）：`<case-id 小写>-<用途>-vNN.<ext>`，只住 `_runs\<RUN_ID>\fixtures\`。 */
export function fixturePath(caseId, purpose, ext = 'json', env = process.env) {
  const run = canonical(requireEnv(ENV.RUN_ROOT, env))
  const dir = path.join(run, 'fixtures')
  mkdirSync(dir, { recursive: true })
  return path.join(dir, `${caseId.toLowerCase()}-${purpose}-v01.${ext}`)
}

export function writeFixture(caseId, purpose, obj, ext = 'json', env = process.env) {
  const file = fixturePath(caseId, purpose, ext, env)
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
  return file
}

export function writeFixtureText(caseId, purpose, text, ext, env = process.env) {
  const file = fixturePath(caseId, purpose, ext, env)
  writeFileSync(file, text, 'utf8')
  return file
}

function baseArgs({ op, dataRoot, workspace, statusRoot, inFile, testMode, extra = [] }) {
  const args = ['--op', op]
  if (dataRoot) args.push('--data-root', dataRoot)
  if (workspace) args.push('--workspace', workspace)
  if (statusRoot) args.push('--status-root', statusRoot)
  if (inFile) args.push('--in', inFile)
  if (testMode) args.push('--test-mode')
  args.push(...extra)
  return args
}

export function callSpec(cliName, opts, env = process.env) {
  const abs = cliAbs(cliName, env)
  return { cli: cliName, abs, args: baseArgs(opts), cwd: canonical(requireEnv(ENV.RUN_ROOT, env)) }
}

function parseEnvelope(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { json: null, problems: ['stdout 是空的（契约 §B1.4 要求 stdout 恰好一行 JSON）'] }
  const last = lines[lines.length - 1]
  try {
    return { json: JSON.parse(last), problems: [] }
  } catch (err) {
    return { json: null, problems: [`stdout 最后一行不是 JSON：${last.slice(0, 200)}`] }
  }
}

/**
 * 子进程环境 + **一处可剥的变量**（`stripEnv`）。
 *
 * 存在的唯一理由：`--real-mode` / `init-real` 那两道**互斥闸**只在"子进程**不是**测试模式"时
 * 才可能被单独看见 —— 只要 `AGENIA_TEST_RUN_ROOT` 还留在环境里，`testModeOf()` 就恒为 true，
 * 于是所有姿势都只能读到 `E_ARG_SCHEMA`，`E_ROOT_OUTSIDE` 那一格**永远测不到**。
 *
 * 🔴 **剥掉它只许用在"根会被拒"的姿势上**：根判定跑在 op 分派**之前**，
 *    被拒的那一次一个字节都不会写。**剥着它去跑真写 op = 把真实库押在"闸不会坏"上 —— 禁止**
 *    （`integration/data-root.test.mjs` 的文件头有这条死命令）。
 */
function childProcessEnv(env, stripEnv = []) {
  const out = childEnv(env)
  for (const key of stripEnv) delete out[key]
  return out
}

/**
 * 同步跑一次 CLI（**缺面 ⇒ SUT-SURFACE-MISSING**）。
 * 契约 §9.5 第 5 条：退出码用不截断管道收集，失败也留 stdout/stderr。
 *
 * `stripEnv`：要给子进程**剥掉**的环境变量名（见 `childProcessEnv` 那条 🔴）。
 *
 * `cliPath`：**另一棵树上的同一个 CLI**（缺省 `null` = `AGENIA_STAGING_PRESET` 里那个）。
 *   存在的唯一理由：`DR-01` 的端到端正例要打在**一份装好的预设副本**上
 *   （副本自己算 `REAL_BRAIN_ROOT`，见 `support/installed.mjs`）——
 *   参数形状、子进程环境、信封解析全部照旧，只有"跑哪棵树上的 bin"变了。
 */
export function runCli(cliName, opts = {}, { env = process.env, timeoutMs = 60000, stripEnv = [], cliPath = null } = {}) {
  const spec = cliPath === null
    ? callSpec(cliName, opts, env)
    : {
        cli: path.basename(cliPath),
        abs: canonical(cliPath),
        args: baseArgs(opts),
        cwd: canonical(requireEnv(ENV.RUN_ROOT, env)),
      }
  if (!existsSync(spec.abs)) throw new SutSurfaceMissing(cliPath === null ? `bin/${cliName}` : cliPath, spec.abs)
  const started = Date.now()
  const res = spawnSync(NODE_BIN, [spec.abs, ...spec.args], {
    cwd: spec.cwd,
    env: childProcessEnv(env, stripEnv),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  const out = {
    cli: cliName,
    args: spec.args,
    cmdline: `"${NODE_BIN}" "${spec.abs}" ${spec.args.join(' ')}`,
    exit_code: res.status,
    signal: res.signal ?? null,
    timed_out: res.error?.code === 'ETIMEDOUT',
    spawn_error: res.error ? String(res.error.message) : null,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    ms: Date.now() - started,
    ...parseEnvelope(res.stdout),
  }
  return out
}

/** 异步跑（**真并发**必须用这个：契约 §9.5 / 提案 §B1.6 "同进程两次调用不算并发"）。 */
export function runCliAsync(cliName, opts = {}, { env = process.env, timeoutMs = 60000 } = {}) {
  const spec = callSpec(cliName, opts, env)
  if (!existsSync(spec.abs)) {
    const err = new SutSurfaceMissing(`bin/${cliName}`, spec.abs)
    return Promise.reject(err)
  }
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(NODE_BIN, [spec.abs, ...spec.args], {
      cwd: spec.cwd,
      env: childEnv(env),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d.toString('utf8') })
    child.stderr.on('data', (d) => { stderr += d.toString('utf8') })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        cli: cliName, args: spec.args, cmdline: `"${NODE_BIN}" "${spec.abs}" ${spec.args.join(' ')}`,
        exit_code: null, signal: null, timed_out: timedOut, spawn_error: String(err.message),
        stdout, stderr, ms: Date.now() - started, json: null, problems: ['spawn 失败'],
      })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({
        cli: cliName,
        args: spec.args,
        cmdline: `"${NODE_BIN}" "${spec.abs}" ${spec.args.join(' ')}`,
        exit_code: code,
        signal: signal ?? null,
        timed_out: timedOut,
        spawn_error: null,
        stdout,
        stderr,
        ms: Date.now() - started,
        ...parseEnvelope(stdout),
      })
    })
  })
}

/** 共享脑 CLI（`--data-root`）。 */
export function runBrain(op, payload, { dataRoot, inFile, extra, env = process.env, timeoutMs } = {}) {
  const file = inFile ?? (payload === undefined ? undefined : writeFixture('brain', op, payload, 'json', env))
  return runCli('agenia-brain.mjs', { op, dataRoot: dataRoot ?? optionalEnv(ENV.TEST_DATA_ROOT, env), inFile: file, testMode: true, extra }, { env, timeoutMs })
}

/** 路线 updater（`--workspace`）。 */
export function runRoute(caseId, op, payload, { workspace, inFile, extra, env = process.env, timeoutMs } = {}) {
  const file = inFile ?? (payload === undefined ? undefined : writeFixture(caseId, op, payload, 'json', env))
  return runCli('agenia-route.mjs', {
    op,
    workspace: workspace ?? optionalEnv(ENV.TEST_WORKSPACE, env),
    inFile: file,
    testMode: true,
    extra,
  }, { env, timeoutMs })
}

/** 项目本地状态（`--workspace`）。 */
export function runLocal(caseId, op, payload, { workspace, inFile, extra, env = process.env, timeoutMs } = {}) {
  const file = inFile ?? (payload === undefined ? undefined : writeFixture(caseId, op, payload, 'json', env))
  return runCli('agenia-local.mjs', {
    op,
    workspace: workspace ?? optionalEnv(ENV.TEST_WORKSPACE, env),
    inFile: file,
    testMode: true,
    extra,
  }, { env, timeoutMs })
}

/**
 * 测试工作区里那几个冻结落点（提案 §B1.7 的目录树）。
 * 票与状态**只许**落这里；脑数据落 `--data-root`。两者别混（P2-V6 的残余项）。
 */
export function routePaths(env = process.env) {
  const workspace = canonical(optionalEnv(ENV.TEST_WORKSPACE, env) ?? requireEnv(ENV.TEST_WORKSPACE, env))
  const team = path.join(workspace, '.team')
  const routeDir = path.join(team, 'route')
  return {
    workspace,
    team,
    routeDir,
    current: path.join(routeDir, 'current.json'),
    audit: path.join(routeDir, 'audit.jsonl'),
    lock: path.join(routeDir, '.route.lock'),
    evidenceDir: path.join(routeDir, 'evidence'),
    stateDir: path.join(team, 'state'),
    localStateDir: path.join(team, 'state', 'local'),
    brainDir: path.join(team, 'brain'),
    leaderDir: path.join(team, 'leader'),
    retroDir: path.join(team, 'retro'),
    reviewDir: path.join(team, 'review'),
  }
}

/** 脑侧落点（`--data-root`）。 */
export function brainPaths(env = process.env) {
  const root = canonical(optionalEnv(ENV.TEST_DATA_ROOT, env) ?? requireEnv(ENV.TEST_DATA_ROOT, env))
  return {
    root,
    stateDir: path.join(root, 'state'),
    updateState: (day) => path.join(root, 'state', 'update', `${day}.json`),
    jobsDir: path.join(root, 'state', 'jobs'),
    jobFile: (id) => path.join(root, 'state', 'jobs', `${id}.json`),
    locksDir: path.join(root, 'locks'),
    memoryDir: path.join(root, 'memory'),
    snapshotsDir: path.join(root, 'memory', 'snapshots'),
    reportsDir: path.join(root, 'reports'),
    // 候选池与「已判」索引（T-MEM-07）：两者**同目录、各自 append-only**。
    // `judged.jsonl` 是 `judge-commit` 成功之后的副作用；`pool.jsonl` 只由导入命令追加。
    // ⇒ 「跑一个只读 op 之后池子没被动过」这件事靠这三个落点量（V6 钉 sha256 + 字节 + 行数）。
    proposalsDir: path.join(root, 'proposals'),
    poolFile: path.join(root, 'proposals', 'pool.jsonl'),
    judgedFile: path.join(root, 'proposals', 'judged.jsonl'),
    // 只读 op 的另外两样"不许动"的东西（V6 · 契约 §3.1：`writes:false` = 不推状态、不落审计）：
    // `audit.jsonl` 与 `state/update/`（**整个目录**，不挑某一天 —— 挑一天会让"写到别的 day 里"逃过去）。
    auditFile: path.join(root, 'audit.jsonl'),
    updateDir: path.join(root, 'state', 'update'),
    memoryReport: (day) => path.join(root, 'reports', 'memory-update', `${day}.json`),
    commonSense: path.join(root, 'common-sense.md'),
    noticesDir: path.join(root, 'notices'),
  }
}

/** 数一个文件的非空行（audit.jsonl 的"只增一条"靠它）。 */
export function countJsonlLines(file) {
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').length
  } catch {
    return null
  }
}

// ── 断言小工具（返回 problems，不抛 —— 让每个用例把原因收齐）────────────────
export function envelopeProblem(label, res, expect) {
  if (res.spawn_error) return `${label}：spawn 失败（${res.spawn_error}）`
  if (res.timed_out) return `${label}：超时（${res.ms} ms）`
  if (expect === 'ok') {
    if (res.exit_code !== 0) return `${label}：期望退出码 0，实得 ${res.exit_code}；stdout=${res.stdout.trim().slice(0, 300)} stderr=${res.stderr.trim().slice(0, 300)}`
    if (res.json?.ok !== true) return `${label}：期望 stdout JSON 的 ok=true，实得 ${JSON.stringify(res.json)?.slice(0, 300)}`
    return null
  }
  const want = `E_${expect}`
  if (res.exit_code === 0) return `${label}：期望被拒（${want}），实得退出码 0 / ${JSON.stringify(res.json)?.slice(0, 200)}`
  if (res.json?.error?.code !== want) {
    return `${label}：期望错误码 ${want}，实得 ${res.json?.error?.code ?? '(stdout 不是错误信封)'}；stdout=${res.stdout.trim().slice(0, 300)} stderr=${res.stderr.trim().slice(0, 200)}`
  }
  return null
}

export function nodeVersion() {
  return process.version
}

export function fileSize(p) {
  try {
    return statSync(p).size
  } catch {
    return null
  }
}

/** 生产文件清单读数（哪几个已经落 staging、哪几个还没）。 */
export function surfaceInventory(env = process.env) {
  const out = { bin: {}, lib: {} }
  for (const f of ['agenia-brain.mjs', 'agenia-route.mjs', 'agenia-local.mjs', 'install.mjs', 'rollback.mjs', 'release-scan.mjs', 'bg-notify.mjs']) {
    out.bin[f] = stagingExists(path.join('bin', f), env)
  }
  for (const f of ['error-codes.mjs', 'paths.mjs', 'atomic.mjs', 'clock.mjs', 'liveness.mjs', 'memory.mjs', 'state.mjs', 'snapshot.mjs', 'reports.mjs', 'proposals.mjs', 'route.mjs', 'tickets.mjs', 'evidence.mjs', 'local-state.mjs', 'health.mjs', 'receipt.mjs', 'manifest.mjs', 'cli-inventory.mjs']) {
    out.lib[f] = stagingExists(path.join('lib', f), env)
  }
  out.injector = stagingExists('inject.js', env)
  out.composition = stagingExists('agent.cordis.yml', env)
  out.patch = stagingExists('cordis.patch.yml', env)
  out.staging_root = stagingRoot(env)
  out.repo_final_preset = PATHS.finalPreset
  return out
}
