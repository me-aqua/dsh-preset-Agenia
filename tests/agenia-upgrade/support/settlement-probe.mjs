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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
