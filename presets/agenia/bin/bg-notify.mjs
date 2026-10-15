#!/usr/bin/env node
/**
 * `bg-notify.mjs` —— **通知接缝**：后台作业完成的通知（到达 / 丢失 / 父死）。
 *
 * 冻结依据：提案 §B1.3（文件名）· §B1.4（`bg-notify.mjs` 的 op 与退出码）·
 *   §B1.6（通知 / 时钟 / 父死 / 丢通知四个接缝的**形状**：`--op deliver` · `--drop-notice` ·
 *   `--op parent-dead` · `AGENIA_PARENT_ALIVE_FILE`）· §B3.6（`state/jobs/<job_id>.json` 的字段表）·
 *   §B3.7（原子写）· 追加裁定 v1.2 **C-5**（`age >= lease` 即 stale，转出 `lib/liveness.mjs`）。
 *
 * 五条硬口径：
 *   ① **通知只动三样**：`job_state` / `last_liveness_event_at` / 通知记录。
 *      **产物一个字节都不许碰**（报告、回执、本地状态、路线都不属于它的写面）。
 *   ② **丢通知不许静默**：`--drop-notice` **不投递**，只在 `<data-root>\notices\dropped-<job-id>.json`
 *      留一条痕迹；作业状态**保持未结** —— 下一开工要能**检测到未结**，不许被当成完成。
 *   ③ **旧通知分三种处置**（"旧 attempt 的结果不许回写"是它们共同的红线）：
 *      · **形状不合**：作业号不是 `job-<role>-<尾巴>`（角色名与 `--job` 逐字不一致、或没有尾巴）⇒
 *        **硬拒** `E_JOB_UNKNOWN`，零写入 —— 那根本不是这个系统发出来的派工号；
 *      · **号对、记录在、只是这一轮换过 attempt/generation** ⇒ **硬拒** `E_JOB_FENCE_STALE`，零写入 ——
 *        这一份通知指不到任何"现在还在跑"的东西（JOB-04 ④ 的口径："对旧 job id 的投递竟然成功了
 *        应当被 fence"）；
 *      · **号对、记录不在**：这一角色已经有**终结**记录 ⇒ 同样硬拒 `E_JOB_FENCE_STALE`；
 *        这一角色一张记录都没有 ⇒ 一份 `unmatched-<id>` 通知、退出 0，不动任何状态。
 *   ④ **父死是接缝、不是杀进程**：`--op parent-dead` 只往 liveness 文件里写 `parent_state:"dead"`；
 *      "父还活着吗"由 `lib/liveness.mjs` 的 `parentAlive()` 回答（可被 `AGENIA_PARENT_ALIVE_FILE` 覆盖）。
 *   ⑤ **完成事件必须看得见**：一次投递就是一次 liveness 事件，它写下的时刻**一定严格晚于**记录里
 *      原来那个（同一刻度里连着发生两件事时 +1 毫秒）—— 否则"完成推进了 liveness"这条判据读不出来。
 */
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { CODES } from '../lib/error-codes.mjs'
import { dataRootVerdict, resolveWithin, TEST_ROOT_MARKER, testModeOf } from '../lib/paths.mjs'
import { readJsonFile, writeJsonAtomic } from '../lib/atomic.mjs'
import { now as clockNow } from '../lib/clock.mjs'
import { markParentDead } from '../lib/liveness.mjs'
import { JOB_ROLES, resolveDay, readJob, readUpdateState, writeJob } from '../lib/state.mjs'

const CLI_NAME = 'bg-notify.mjs'

/** op 清单（顺序即 `--op help` 的打字顺序）。 */
const OP_NAMES = Object.freeze(['deliver', 'parent-dead', 'help'])

/** 一次通知能宣告的终态（`running` 不是"完成了"）。 */
const NOTICE_STATES = Object.freeze(['done', 'failed', 'stale', 'abandoned'])

/** 作业号的尾巴（§B3.6："mock 与真实 job id 同形（`job-<role>-<n>`）"）—— `-1` / `-A` / `-OLD` 都算。 */
const JOB_ID_SUFFIX_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** 作业号是不是"这一角色发出来的那一种形状"（角色名逐字对得上 + 有非空尾巴）。 */
function jobIdShapeVerdict(jobId, job) {
  if (!isFilledString(jobId)) return false
  const prefix = `job-${job}-`
  if (!String(jobId).startsWith(prefix)) return false
  return JOB_ID_SUFFIX_RE.test(String(jobId).slice(prefix.length))
}

function cliError(code, message, details = null) {
  const err = new Error(message)
  err.name = 'NotifyCliError'
  err.code = code
  err.details = details
  return err
}

const isFilledString = (v) => typeof v === 'string' && v.trim() !== ''

// ── 参数与根 ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    op: null, dataRoot: null, statusRoot: null, job: null, jobId: null, state: null,
    resultFile: null, exitCode: null, failureReason: null, dropNotice: false,
    parentSessionId: null, livenessFile: null, testMode: false, unknown: [],
  }
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]
    const eq = raw.indexOf('=')
    const key = eq >= 0 ? raw.slice(0, eq) : raw
    const inline = eq >= 0 ? raw.slice(eq + 1) : null
    const take = () => (inline !== null ? inline : (argv[i + 1] !== undefined ? argv[(i += 1)] : null))
    switch (key) {
      case '--op': out.op = take(); break
      case '--data-root': out.dataRoot = take(); break
      case '--status-root': out.statusRoot = take(); break
      case '--job': out.job = take(); break
      case '--job-id': out.jobId = take(); break
      case '--state': out.state = take(); break
      case '--result-file': out.resultFile = take(); break
      case '--exit-code': out.exitCode = take(); break
      case '--failure-reason': out.failureReason = take(); break
      case '--drop-notice': out.dropNotice = true; break
      case '--parent-session-id': out.parentSessionId = take(); break
      case '--liveness-file': out.livenessFile = take(); break
      case '--test-mode': out.testMode = true; break
      default: out.unknown.push(raw); break
    }
  }
  return out
}

function resolveRoot(args, { label, raw, markerInParent = false, required = true }) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    if (!required) return null
    throw cliError('E_ARG_SCHEMA', `缺 ${label}（每次都要显式给，**没有** env 兜底）`)
  }
  const testMode = args.testMode === true || testModeOf({}, process.env)
  const runRoot = isFilledString(process.env.AGENIA_TEST_RUN_ROOT) ? process.env.AGENIA_TEST_RUN_ROOT : null
  let markerExists = false
  if (typeof raw === 'string' && /^[A-Za-z]:[\\/]/.test(raw)) {
    const probe = (dir) => {
      try { return statSync(path.join(dir, TEST_ROOT_MARKER)).isFile() } catch { return false }
    }
    markerExists = probe(raw) || (markerInParent && probe(path.dirname(path.resolve(raw))))
  }
  const verdict = dataRootVerdict(raw, { testMode, markerExists, mustBeUnder: testMode ? runRoot : null })
  if (!verdict.ok) throw cliError(verdict.code, `${label}：${verdict.message}`)
  return verdict.root
}

/** 通知落点：`<data-root>\notices\<name>`（§B1.6 的 `notices/dropped-<id>.json` 就在这儿）。 */
const noticesDirOf = (root) => path.join(root, 'notices')

function writeNotice(root, name, record) {
  const file = path.join(noticesDirOf(root), name)
  const written = writeJsonAtomic(file, record)
  if (!written.ok) throw cliError(written.code, `通知记录写入失败：${written.message}`, { path: file })
  return file
}

/** `--result-file` 记进 job 记录时的形状：能落在脑根里就记相对路径，落不进去就记原样的绝对路径。 */
function resultPathOf(root, abs) {
  if (!isFilledString(abs)) return null
  const within = resolveWithin(root, abs)
  if (within.ok) return path.relative(root, within.path).replace(/\\/g, '/')
  return path.resolve(String(abs))
}

/** 这一角色在 jobs 目录里已有的**真记录**（跳过 launch intent 那几份），按 job_id 索引。 */
function jobsOfRole(root, role) {
  const dir = path.join(root, 'state', 'jobs')
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('intent-')) continue
    const read = readJsonFile(path.join(dir, name))
    if (!read.ok || read.value === null || typeof read.value !== 'object') continue
    if (read.value.role !== role || !isFilledString(read.value.job_id)) continue
    out.push(read.value)
  }
  return out
}

/**
 * 完成事件的时间戳：**严格晚于**记录里原来那个（同一刻度里 +1 毫秒）。
 * 见文件头 ⑤：不这么做的话，"完成推进了 liveness"在注入时钟下读出来是"没变"。
 */
function advanceStamp(previous, at) {
  const atMs = Date.parse(at)
  const prevMs = isFilledString(previous) ? Date.parse(previous) : NaN
  if (!Number.isFinite(prevMs) || !Number.isFinite(atMs) || atMs > prevMs) return at
  return new Date(prevMs + 1).toISOString()
}

// ── op：deliver ────────────────────────────────────────────────────────────
function opDeliver(args) {
  const root = resolveRoot(args, { label: '--data-root', raw: args.dataRoot })
  // `--status-root` 只**校验** + 留痕：通知的写面是脑根，工作区一个字节都不碰。
  const statusRoot = resolveRoot(args, { label: '--status-root', raw: args.statusRoot, markerInParent: true, required: false })

  const job = args.job
  if (!JOB_ROLES.includes(job)) {
    throw cliError('E_ARG_SCHEMA', `--job 必须是 ${JOB_ROLES.join(' | ')}，实得 ${JSON.stringify(job)}`)
  }
  const jobId = args.jobId
  if (!isFilledString(jobId)) throw cliError('E_ARG_SCHEMA', '--job-id 必填（通知要指名是哪一次派工）')
  const state = isFilledString(args.state) ? String(args.state).trim() : 'done'
  if (!NOTICE_STATES.includes(state)) {
    throw cliError('E_ARG_SCHEMA', `--state 必须是 ${NOTICE_STATES.join(' | ')}（"还在跑"不是"完成了"），实得 ${JSON.stringify(args.state)}`)
  }

  const at = clockNow().toISOString()
  const noticeBase = {
    schema: 1,
    kind: 'job-notice',
    job,
    job_id: jobId,
    state,
    at,
    result_file: isFilledString(args.resultFile) ? path.resolve(String(args.resultFile)) : null,
    exit_code: args.exitCode === null ? null : Number(args.exitCode),
    status_root: statusRoot,
  }

  // ① 形状不合的作业号：那根本不是这个系统发出来的 ⇒ fence（零写入）
  if (!jobIdShapeVerdict(jobId, job)) {
    throw cliError('E_JOB_UNKNOWN', `作业号形状不合：${JSON.stringify(jobId)}（§B3.6 冻的是 job-<role>-<尾巴>，且 role 要与 --job 逐字一致）—— 伪造的通知一律 fence`, { job, job_id: jobId })
  }

  const existing = readJob(root, jobId)
  if (!existing.ok) {
    if (existing.code !== 'E_DATA_MISSING') throw cliError(existing.code, `作业记录读不出来：${existing.message}`, { path: existing.path })
    // ② 这一角色已经有另一份**终结**记录 ⇒ 这条就是迟到的通知
    const sameRole = jobsOfRole(root, job).filter((rec) => rec.job_id !== jobId)
    const settled = sameRole.filter((rec) => rec.state !== 'running')
    if (settled.length > 0) {
      throw cliError('E_JOB_FENCE_STALE', `作业 ${jobId} 没有记录，而 ${job} 这一角色已经有终结记录（${settled.map((r) => `${r.job_id}:${r.state}`).join(', ')}）—— 迟到的通知不许回写状态`, { job, job_id: jobId })
    }
    // ③ 形状对、这一角色也还没有任何记录 ⇒ 记一条"未匹配"的通知，**不动任何状态**（退出 0）
    const file = writeNotice(root, `unmatched-${jobId}.json`, {
      ...noticeBase,
      delivered: false,
      unmatched: true,
      note: '脑根里没有这次派工的记录（launch intent 还没落盘 / 记录已被清理）—— 只留痕，不推进任何状态',
    })
    return { delivered: false, unmatched: true, notice_path: file, job_state: null, last_liveness_event_at: null }
  }

  const record = existing.job
  if (record.role !== job) {
    throw cliError('E_JOB_UNKNOWN', `作业 ${jobId} 记录里的 role 是 ${JSON.stringify(record.role)}，与 --job 的 ${JSON.stringify(job)} 不符`, { path: existing.path })
  }
  // ④ fence：记录的 generation/attempt 必须与当前 update state 一致（旧 attempt 的结果不许回写）。
  //    命中 ⇒ **硬拒 + 零写入**：这一份通知指不到任何"现在还在跑"的东西，回写它就是把旧结果盖上来。
  const day = resolveDay(root, null).day
  const update = readUpdateState(root, day)
  if (update.ok && update.state !== null && typeof update.state === 'object') {
    const fence = record.fence ?? {}
    const generation = update.state.generation
    if (Number.isInteger(fence.generation) && Number.isInteger(generation) && fence.generation !== generation) {
      throw cliError('E_JOB_FENCE_STALE', `作业 ${jobId} 属于 generation ${fence.generation}，当前是 ${generation} —— 旧 attempt 的结果不许回写`, { path: existing.path })
    }
    if (job === 'memory-judge' && Number.isInteger(fence.attempt) && Number.isInteger(update.state.judge_attempt) && fence.attempt !== update.state.judge_attempt) {
      throw cliError('E_JOB_FENCE_STALE', `作业 ${jobId} 是 attempt ${fence.attempt}，当前判决 attempt 是 ${update.state.judge_attempt} —— 旧 attempt 的结果不许回写`, { path: existing.path })
    }
  }

  // ⑤ 丢通知：不投递，只留痕；作业状态**保持未结**
  if (args.dropNotice === true) {
    const file = writeNotice(root, `dropped-${jobId}.json`, {
      ...noticeBase,
      delivered: false,
      dropped: true,
      would_be_state: state,
      note: '通知丢失（接缝）：不投递、不推进状态 —— 下一开工只能把这次作业读成"未结"',
      last_liveness_event_at: record.last_liveness_event_at ?? null,
    })
    return { delivered: false, dropped: true, notice_path: file, job_state: record.state, last_liveness_event_at: record.last_liveness_event_at ?? null }
  }

  // ⑥ 投递：只改 job_state / last_liveness_event_at / 通知记录
  const next = {
    ...record,
    state,
    finished_at: at,
    result_path: resultPathOf(root, args.resultFile),
    failure_reason: state === 'failed' ? (isFilledString(args.failureReason) ? String(args.failureReason) : '(没给原因)') : null,
    last_liveness_event_at: advanceStamp(record.last_liveness_event_at, at),
  }
  try {
    writeJob(root, next)
  } catch (err) {
    throw cliError(typeof err?.code === 'string' && Object.hasOwn(CODES, err.code) ? err.code : 'E_INTERNAL', `作业记录写回失败：${String(err?.message ?? err)}`, { path: existing.path })
  }
  const file = writeNotice(root, `delivered-${jobId}.json`, {
    ...noticeBase,
    delivered: true,
    fence: next.fence ?? null,
    job_state: next.state,
    last_liveness_event_at: next.last_liveness_event_at,
  })
  return {
    delivered: true,
    notice_path: file,
    job_state: next.state,
    last_liveness_event_at: next.last_liveness_event_at,
    result_path: next.result_path,
  }
}

// ── op：parent-dead ────────────────────────────────────────────────────────
function opParentDead(args) {
  const file = args.livenessFile
  if (!isFilledString(file)) throw cliError('E_ARG_SCHEMA', '--liveness-file 必填（父死要写在哪儿，由调用方指明）')
  const abs = path.resolve(String(file))
  const root = resolveRoot(args, { label: '--data-root', raw: args.dataRoot, required: false })
  const base = root ?? (isFilledString(process.env.AGENIA_TEST_RUN_ROOT) ? process.env.AGENIA_TEST_RUN_ROOT : null)
  if (base !== null) {
    const within = resolveWithin(base, abs)
    if (!within.ok) throw cliError('E_PATH_ESCAPE', `--liveness-file 逃出了允许的那一层（${base}）：${abs}`, { path: abs })
  } else {
    const verdict = dataRootVerdict(abs, { testMode: false })
    if (!verdict.ok && verdict.code !== 'E_ROOT_NO_MARKER') throw cliError(verdict.code, `--liveness-file：${verdict.message}`, { path: abs })
  }
  const at = clockNow().toISOString()
  const written = markParentDead({
    file: abs,
    parentSessionId: isFilledString(args.parentSessionId) ? String(args.parentSessionId) : null,
    sessionId: isFilledString(args.parentSessionId) ? String(args.parentSessionId) : null,
    now: at,
  })
  if (!written.ok) throw cliError(written.code, `父死接缝写不进去：${written.message}`, { path: abs })
  return { liveness_file: abs, parent_state: 'dead', at, parent_session_id: args.parentSessionId ?? null }
}

// ── 入口 ───────────────────────────────────────────────────────────────────
const OPS = { deliver: opDeliver, 'parent-dead': opParentDead }

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
}

function main(argv) {
  let op = null
  try {
    const args = parseArgs(argv)
    op = args.op
    if (op === null || String(op).trim() === '') throw cliError('E_USAGE', `缺 --op；可用：${OP_NAMES.join(' / ')}`)
    if (op === 'help') {
      process.stderr.write(`bg-notify.mjs 的 op 清单（${OP_NAMES.length} 个）：\n  ${OP_NAMES.join('\n  ')}\n`)
      emit({ ok: true, op: 'help', cli: CLI_NAME, ops: [...OP_NAMES] })
      return 0
    }
    if (!Object.hasOwn(OPS, op)) throw cliError('E_USAGE', `未知 op：${JSON.stringify(op)}；可用：${OP_NAMES.join(' / ')}`)
    const out = OPS[op](args)
    emit({ ok: true, op, ...out })
    return 0
  } catch (err) {
    const code = typeof err?.code === 'string' && Object.hasOwn(CODES, err.code) ? err.code : 'E_INTERNAL'
    process.stderr.write(`[${CLI_NAME}] ${code} ${String(err?.message ?? err)}\n`)
    emit({ ok: false, op, error: { code, message: String(err?.message ?? err), details: err?.details ?? null } })
    return CODES[code].exit
  }
}

process.exitCode = main(process.argv.slice(2))
