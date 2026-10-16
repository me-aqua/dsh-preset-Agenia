#!/usr/bin/env node
/**
 * `agenia-route.mjs` —— 路线 updater（**唯一**能写 `.team/route/` 的入口）。
 *
 * 冻结依据：提案 §B1.3（文件名与落点）· §B1.4（**调用形状 / op 表 / 退出码**）·
 * §B1.5（纯函数接缝：判定全在 `lib/route.mjs` / `lib/tickets.mjs` / `lib/evidence.mjs` 里）·
 * §B3.3（票）· §B3.5（老板证据 + `transition_id` 回填）· §B3.7（原子写 / 锁 / CAS / 审计链）·
 * 追加裁定 A6（`transition_id` 由 updater 在**提议切换时**生成并回填 —— 调用方不预填）。
 *
 * 七条硬口径：
 *   ① **根逐次显式**：`--workspace` 必填（`--status-root` / `--data-root` 给了就一起校验），
 *      **没有 env 兜底、没有默认值**。省略 / 空串 / 相对 / UNC / C 盘 / 指真实根 / 越界
 *      / 测试模式下不带 marker —— 一律非零退出且**零写入**（判定顺序由 `lib/paths.mjs` 冻结）。
 *      `--status-root` 给的是 `.team` 那一层（不给就取 `<workspace>/.team`）；`--data-root`
 *      只**校验**：路线侧的写面永远是工作区，脑根一个字节都不许沾（DR-03 的分舱判据）。
 *   ② **stdout 恰好一行 JSON**：`{ok:true,…}` / `{ok:false,error:{code,message,details}}`；
 *      人话一律走 **stderr**（受限档 + 中文编码上出过事，见 `AGENTS.local.md` 八②）。
 *   ③ **退出码只从 `lib/error-codes.mjs` 来**：`ok ? 0 : CODES[code].exit`，本文件里没有第二份码表。
 *   ④ **写面全走 `lib/atomic.mjs`**：临时件同目录 → `fsync` → `rename`；锁是 `wx` 独占建的真锁，
 *      僵锁**不静默抢写**（要 `--force-recover`）；CAS 认 `version`，不符**绝不覆盖**。
 *   ⑤ **读-改-写全程持锁**；读面（read / verify / summarize）**不持锁、零写入**（连目录都不建）。
 *   ⑥ **审计链只增不改**：`prev_sha256 → next_sha256` + 版本 + 写入者 + 会话 + 时间；
 *      每一条成功的写命令**恰好追加一行**，被拒的命令**一行都不加**。
 *   ⑦ **"现在"只从 `lib/clock.mjs` 进**（`AGENIA_NOW_FILE` 优先），本文件里没有裸 `Date`。
 *
 * ⚠️ **`init` 对"空路线"是可重入的**（我定的口径，已报组长）：路线已经**用起来**
 *   （有任务 / 有票 / 有切换记录 / 审计里出现过不是 init 的 op）时再 `init` ⇒ `E_ROUTE_EXISTS`
 *   （不许把历史抹掉）；但一份**只有 init 留下的空壳**（RT-06 场景⑥ 就是拿它换一张图再走的）
 *   允许重来一次，版本**继续往上走**（不回退 —— 回退会让旧调用方的 CAS 重新生效，那是 ABA）。
 *
 * ⚠️ **CAS（`version` 严格相等）只用在 `stage-enter` 与 `task-set` 上**：提案 §B1.4 的 op 表
 *   只给这两个 op 列了 `E_CAS_STALE`。`stage-graph-set` / 票那几条不拿它当门（RT-05 的正例
 *   连着两次换图用同一版），版本对不上**在 stderr 报 WARN**、变更照写 —— **不静默**。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { CODES } from '../lib/error-codes.mjs'
import { dataRootVerdict, TEST_ROOT_MARKER, testModeOf } from '../lib/paths.mjs'
import { acquireLock, readJsonFile, releaseLock, writeFileAtomic, writeJsonAtomic } from '../lib/atomic.mjs'
import { now as clockNow } from '../lib/clock.mjs'
import { validateBossEvidence, spentEvidenceRecord } from '../lib/evidence.mjs'
import * as R from '../lib/route.mjs'
import * as T from '../lib/tickets.mjs'

const CLI_NAME = 'agenia-route.mjs'

/** op 清单（顺序即 `--op help` 的打字顺序；与提案 §B1.4 那张表逐条一致）。 */
const OP_NAMES = Object.freeze([
  'init', 'stage-graph-set', 'stage-enter', 'task-set',
  'ticket-open', 'ticket-update', 'ticket-close', 'ticket-void',
  'read', 'verify', 'summarize', 'help',
])

/** 只读 op（不持锁、不建目录、零写入）。 */
const READ_OPS = Object.freeze(new Set(['read', 'verify', 'summarize']))

/** 落点名（分开写，别把 `.team` 与 `route` 拼成一个字符串常量）。 */
const TEAM_DIR_NAME = '.team'
const ROUTE_DIR_NAME = 'route'
const CURRENT_FILE = 'current.json'
const AUDIT_FILE = 'audit.jsonl'
const LOCK_FILE = '.route.lock'
const EVIDENCE_DIR_NAME = 'evidence'
const USED_KEYS_FILE = 'used-keys.json'

function cliError(code, message, details = null) {
  const err = new Error(message)
  err.name = 'RouteCliError'
  err.code = code
  err.details = details
  return err
}

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex')

// ── 参数 ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { op: null, workspace: null, statusRoot: null, dataRoot: null, inFile: null, testMode: false, forceRecover: false, unknown: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]
    const eq = raw.indexOf('=')
    const key = eq >= 0 ? raw.slice(0, eq) : raw
    const inline = eq >= 0 ? raw.slice(eq + 1) : null
    const take = () => (inline !== null ? inline : (argv[i + 1] !== undefined ? argv[(i += 1)] : null))
    switch (key) {
      case '--op': out.op = take(); break
      case '--workspace': out.workspace = take(); break
      case '--status-root': out.statusRoot = take(); break
      case '--data-root': out.dataRoot = take(); break
      case '--in': out.inFile = take(); break
      case '--test-mode': out.testMode = true; break
      case '--force-recover': out.forceRecover = true; break
      default: out.unknown.push(raw); break
    }
  }
  return out
}

function readPayload(args) {
  if (args.inFile === null || String(args.inFile).trim() === '') return {}
  const file = path.resolve(String(args.inFile))
  if (!existsSync(file)) throw cliError('E_ARG_USAGE', `--in 指的入参文件不在：${file}`)
  let text = null
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    throw cliError('E_ARG_USAGE', `--in 指的入参文件读不到（${err?.code ?? 'UNKNOWN'}）：${file}`)
  }
  try {
    const parsed = JSON.parse(text)
    return parsed === null ? {} : parsed
  } catch (err) {
    throw cliError('E_ARG_SCHEMA', `--in 的文件不是合法 JSON（${String(err?.message).slice(0, 120)}）：${file}`)
  }
}

/**
 * 根判定 —— 每一条 op 都先过这一关（判定顺序由 `lib/paths.mjs` 冻结）。
 * `--status-root` 指 `.team` 那一层，它的 marker 允许长在**父目录**（工作区）上：
 * 那一层本来就是"这份工作区属于某次测试运行"的凭据。
 */
function resolveRoot(args, { label, raw, markerInParent = false, containingRule }) {
  const testMode = args.testMode === true || testModeOf({}, process.env)
  const runRoot = typeof process.env.AGENIA_TEST_RUN_ROOT === 'string' && process.env.AGENIA_TEST_RUN_ROOT.trim() !== ''
    ? process.env.AGENIA_TEST_RUN_ROOT
    : null
  let markerExists = false
  if (typeof raw === 'string' && /^[A-Za-z]:[\\/]/.test(raw)) {
    const probe = (dir) => {
      try { return statSync(path.join(dir, TEST_ROOT_MARKER)).isFile() } catch { return false }
    }
    markerExists = probe(raw) || (markerInParent && probe(path.dirname(path.resolve(raw))))
  }
  // `containingRule` 不喂 ⇒ 默认 `true`（照旧判"包住"）；**只有工作区那一档传 `false`** —— 见 `resolveWorkspace`。
  const verdict = dataRootVerdict(raw, { testMode, markerExists, mustBeUnder: testMode ? runRoot : null, containingRule })
  if (!verdict.ok) throw cliError(verdict.code, `${label}：${verdict.message}`)
  return verdict.root
}

function resolveWorkspace(args, payload) {
  const raw = typeof payload?.workspace === 'string' && payload.workspace.trim() !== '' ? payload.workspace : args.workspace
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw cliError('E_ARG_SCHEMA', '缺 --workspace（路线只写它下面；这里**没有** env 兜底，每次都要显式给）')
  }
  // 🔴 工作区不判"包住真实根"（恒自拒）—— 来历见 `lib/paths.mjs` 判定处那段注释。2026-10-16 加。
  return resolveRoot(args, { label: '--workspace', raw, containingRule: false })
}

function routePaths(workspace, statusRoot) {
  const teamDir = statusRoot === null ? path.join(workspace, TEAM_DIR_NAME) : statusRoot
  const routeDir = path.join(teamDir, ROUTE_DIR_NAME)
  return {
    workspace,
    teamDir,
    routeDir,
    current: path.join(routeDir, CURRENT_FILE),
    audit: path.join(routeDir, AUDIT_FILE),
    lock: path.join(routeDir, LOCK_FILE),
    evidenceDir: path.join(routeDir, EVIDENCE_DIR_NAME),
    usedKeys: path.join(routeDir, EVIDENCE_DIR_NAME, USED_KEYS_FILE),
  }
}

// ── 读面 ───────────────────────────────────────────────────────────────────
/** 读 current.json —— **缺**与**坏**分得开（缺 ⇒ `E_ROUTE_MISSING`，坏 ⇒ `E_ROUTE_HALF_WRITTEN`）。 */
function readCurrent(paths, { required = true } = {}) {
  if (!existsSync(paths.current)) {
    if (!required) return null
    throw cliError('E_ROUTE_MISSING', `路线还没初始化（没有 ${paths.current}）—— 先跑 --op init`)
  }
  let text = null
  try {
    text = readFileSync(paths.current, 'utf8')
  } catch (err) {
    throw cliError('E_TXN_IO', `current.json 读不到（${err?.code ?? 'UNKNOWN'}）：${paths.current}`)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw cliError('E_ROUTE_HALF_WRITTEN', `current.json 解析不开（原子写没走完？）：${String(err?.message).slice(0, 120)}`)
  }
}

/** 读审计链（只读，不建目录）。半截/非 JSON 的行一律报"链条不可信"。 */
function readAudit(paths) {
  if (!existsSync(paths.audit)) return { ok: false, code: 'E_ROUTE_TAMPERED', records: [], message: `审计文件不在：${paths.audit}（current.json 在，链就断在那儿）` }
  let text = null
  try {
    text = readFileSync(paths.audit, 'utf8')
  } catch (err) {
    return { ok: false, code: 'E_TXN_IO', records: [], message: `审计文件读不到（${err?.code ?? 'UNKNOWN'}）：${paths.audit}` }
  }
  const records = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      records.push(JSON.parse(line))
    } catch {
      return { ok: false, code: 'E_ROUTE_TAMPERED', records, message: `审计有一行不是 JSON：${line.slice(0, 120)}` }
    }
  }
  return { ok: true, code: null, records, message: '' }
}

/** 链条自洽 + 末端对得上盘上这份 current.json。 */
function chainVerdict(paths, records, currentSha) {
  if (records.length === 0) return { ok: false, code: 'E_ROUTE_TAMPERED', message: '审计链是空的，而 current.json 在 —— 这份 current 不是 updater 写的' }
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i]
    if (typeof rec?.next_sha256 !== 'string' || rec.next_sha256 === '') {
      return { ok: false, code: 'E_ROUTE_TAMPERED', message: `审计第 ${i + 1} 条没有 next_sha256` }
    }
    if (i === 0) {
      if (rec.prev_sha256 !== null && rec.prev_sha256 !== undefined) {
        return { ok: false, code: 'E_ROUTE_TAMPERED', message: `审计第一条的 prev_sha256 应当是 null，实得 ${JSON.stringify(rec.prev_sha256)}` }
      }
    } else if (records[i - 1].next_sha256 !== rec.prev_sha256) {
      return { ok: false, code: 'E_ROUTE_TAMPERED', message: `审计链在第 ${i + 1} 条断了：上一条 next_sha256=${records[i - 1].next_sha256}，这一条 prev_sha256=${JSON.stringify(rec.prev_sha256)}` }
    }
  }
  const tail = records[records.length - 1]
  if (String(tail.next_sha256).toUpperCase() !== String(currentSha).toUpperCase()) {
    return { ok: false, code: 'E_ROUTE_TAMPERED', message: `current.json 的 SHA 与审计末条的 next_sha256 对不上（盘上 ${currentSha}，链上 ${tail.next_sha256}）—— 有人绕过 updater 改过它` }
  }
  return { ok: true, code: null, message: '', tail }
}

/** 每次写之前都把链条核一遍（写面只认"链还在"的路线）。 */
function assertChain(paths, records) {
  const currentSha = sha256Hex(readFileSync(paths.current))
  const verdict = chainVerdict(paths, records, currentSha)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  return { currentSha, tail: verdict.tail }
}

/** 追加一行审计（**只增不改**）。`next_sha256` 是**将要落盘那份 current.json 的字节**的 SHA。 */
function appendAudit(paths, { op, at, detail, prevSha, nextSha, version, sessionId }) {
  const records = readAudit(paths).records ?? []
  const record = {
    schema: 1,
    seq: records.length + 1,
    at,
    op,
    kind: op,
    writer: 'agenia-route',
    session_id: sessionId ?? null,
    version,
    prev_sha256: prevSha,
    next_sha256: nextSha,
    detail: detail ?? {},
  }
  try {
    mkdirSync(path.dirname(paths.audit), { recursive: true })
    appendFileSync(paths.audit, `${JSON.stringify(record)}\n`, 'utf8')
  } catch (err) {
    throw cliError('E_TXN_IO', `审计追加失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`)
  }
  return record
}

/** 已用过的证据键（`evidence/used-keys.json`；不在 ⇒ 空清单）。 */
function readUsedKeys(paths) {
  if (!existsSync(paths.usedKeys)) return []
  const read = readJsonFile(paths.usedKeys)
  if (!read.ok) return []
  const keys = read.value?.keys
  return Array.isArray(keys) ? keys.map(String) : []
}

function appendUsedKey(paths, key, at) {
  const keys = readUsedKeys(paths)
  if (keys.includes(key)) return keys.length
  const next = [...keys, key]
  const written = writeJsonAtomic(paths.usedKeys, { schema: 1, keys: next, updated_at: at })
  if (!written.ok) throw cliError(written.code, `used-keys 写入失败：${written.message}`, { path: paths.usedKeys })
  return next.length
}

// ── 事务 ───────────────────────────────────────────────────────────────────
/**
 * 持锁跑一段读-改-写。**先抢锁再读**：锁外先读会让并发的两个写者都读到同一版，
 * 然后各写一遍（"写者不唯一"）—— 与 `bin/agenia-brain.mjs` 的 `claim-update` 同一条道理。
 *
 * 🔴 锁的 `at` 是**真实此刻**，不是领域时钟。两个钟量的是两件事：
 * - `lib/atomic.mjs` 的 `judgeLockOnce` 拿真实 `Date.now()` 减锁里的 `at` 判"过期没有"
 *   （`clockNow()` 的领域钟由 `AGENIA_NOW_FILE` 注入，可以和真实钟差几十小时）⇒
 *   锁里只要写领域钟，一个**活着的**持有者写下的锁在别的进程眼里就"早已过期"（`E_LOCK_STALE`）。
 * - 领域钟是**数据**的日期（审计 `at` / `updated_at` / `closed_at` / 票号），那些由调用方用，不进锁。
 * 同一件事 `lib/local-state.mjs` 的 `acquireDayLock` 也是这么写的（`at: new Date()`）。
 *
 * ⇒ 这个函数**不接领域时钟**（第三个参数只带 `op` 与 `sessionId`）：让它在作用域里根本拿不到
 * 那个值，比在函数体里少写一处更难写回错。
 */
function withLock(paths, args, { op, sessionId }, fn) {
  const acquired = acquireLock(paths.lock, { session_id: sessionId, purpose: `route:${op}` }, { forceRecover: args.forceRecover === true, at: new Date() })
  if (!acquired.ok) throw cliError(acquired.code, acquired.message, { path: paths.lock })
  try {
    return fn()
  } finally {
    releaseLock(paths.lock)
  }
}

/** CAS：调用方带的版本必须就是盘上这一版，否则**绝不覆盖**。 */
function casVerdict(current, want) {
  if (!Number.isInteger(want)) {
    throw cliError('E_ARG_SCHEMA', `version 必填（CAS：调用方手上是哪一版），实得 ${JSON.stringify(want)}`)
  }
  if (want !== current.version) {
    throw cliError('E_CAS_STALE', `带的是 version=${want}，盘上已经是 ${current.version} —— 绝不覆盖（重新 --op read 拿新版再来）`)
  }
}

/** 落盘：字节先算哈希 ⇒ 原子写 ⇒ 用**同一份字节**的哈希追加审计。 */
function commitRoute(paths, { op, at, nextRoute, prevSha, sessionId, detail }) {
  const text = `${JSON.stringify(nextRoute, null, 2)}\n`
  const nextSha = sha256Hex(text)
  const written = writeFileAtomic(paths.current, text)
  if (!written.ok) throw cliError(written.code, `current.json 写入失败：${written.message}`, { path: paths.current })
  const record = appendAudit(paths, { op, at, detail, prevSha, nextSha, version: nextRoute.version, sessionId })
  return { sha256: nextSha, audit_seq: record.seq, audit_tail_sha256: record.next_sha256 }
}

// ── op：init ───────────────────────────────────────────────────────────────
function opInit(ctx) {
  const { paths, payload, at, args, sessionId } = ctx
  const graph = R.stageGraphVerdict(payload)
  if (!graph.ok) throw cliError(graph.code, graph.message)
  const existing = readCurrent(paths, { required: false })
  let prevSha = null
  if (existing !== null) {
    const audit = readAudit(paths)
    if (!audit.ok) throw cliError(audit.code, audit.message)
    prevSha = assertChain(paths, audit.records).currentSha
    if (!R.isPristineRoute(existing, { auditOps: audit.records.map((r) => r.op ?? r.kind ?? 'unknown') })) {
      throw cliError('E_ROUTE_EXISTS', `路线已经用起来了（任务 ${(existing.tasks ?? []).length} · 票 ${(existing.tickets ?? []).length} · 切换 ${(existing.transitions ?? []).length} · 审计里出现过 ${[...new Set(audit.records.map((r) => r.op))].join('/')}）—— init 不许抹掉历史`)
    }
  }
  const route = R.newRouteObject({ goal: graph.goal, stages: graph.stages, current_stage_id: graph.current_stage_id, at, version: (existing?.version ?? 0) + 1 })
  const out = commitRoute(paths, { op: 'init', at, nextRoute: route, prevSha, sessionId, detail: { goal: route.goal.id, stages: route.stages.map((s) => s.id), reinit: existing !== null } })
  return { version: route.version, sha256: out.sha256, reinit: existing !== null, audit_seq: out.audit_seq }
}

// ── op：stage-graph-set ────────────────────────────────────────────────────
function opStageGraphSet(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const current = readCurrent(paths)
  if (payload?.version !== undefined && !Number.isInteger(payload.version)) {
    throw cliError('E_ARG_SCHEMA', `version 要么不写，要么是整数，实得 ${JSON.stringify(payload.version)}`)
  }
  // 🔴 **这一条不拿 `version` 当门**（与 `stage-enter` / `task-set` 不同）：提案 §B1.4 的 op 表
  //    只给那两个 op 列了 `E_CAS_STALE`，`stage-graph-set` 那两格是 `E_STAGE_MULTI_CURRENT` / `E_ARG_SCHEMA`；
  //    而 RT-05 连着两次换图用的是**同一个版本**（循环外算好的）⇒ 拿了门就会把正例判红。
  //    但**不许静默**：版本对不上就在 stderr 说一句，变更照写（版本照样 +1、审计照样追加）。
  if (Number.isInteger(payload?.version) && payload.version !== current.version) {
    process.stderr.write(`[${CLI_NAME}] WARN stage-graph-set：带的是 version=${payload.version}，盘上是 ${current.version} —— 按 op 表这一条不拦，照写；要改成拦请组长裁定\n`)
  }
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const graph = R.stageGraphVerdict(payload, { goalFallback: current.goal })
  if (!graph.ok) throw cliError(graph.code, graph.message)
  // 换了图之后，任务不许变成"无主"（属的阶段没了）。
  const stageIds = new Set(graph.stages.map((s) => s.id))
  for (const task of current.tasks ?? []) {
    if (!stageIds.has(task.stage_id)) {
      throw cliError('E_TASK_STAGE_MISMATCH', `任务 ${task.id} 属的阶段 ${task.stage_id} 在新图里没了 —— 换图不许把任务扔在半空`)
    }
  }
  const pointer = current.current_task_id ?? null
  if (pointer !== null) {
    const hit = (current.tasks ?? []).find((t) => t.id === pointer)
    if (!hit || hit.stage_id !== graph.current_stage_id) {
      throw cliError('E_TASK_STAGE_MISMATCH', `当前任务 ${pointer} 不在新图的当前阶段 ${graph.current_stage_id} 里`)
    }
  }
  const next = {
    ...current,
    goal: graph.goal,
    stages: graph.stages,
    current_stage_id: graph.current_stage_id,
    version: current.version + 1,
    updated_at: at,
  }
  const out = commitRoute(paths, { op: 'stage-graph-set', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { stages: graph.stages.map((s) => s.id), current_stage_id: graph.current_stage_id } })
  return { version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

// ── op：stage-enter ────────────────────────────────────────────────────────
/**
 * 阶段切换 —— **只认老板证据**（§B3.5 七场景）。
 *
 * 判定顺序（顺序本身就是判据，RT-06 逐条钉着）：
 *   ① 入参形状 → ② **证据唯一性/绑定/转述/时间**（在阶段图之前 —— 复用的证据哪怕 to 不在图里也要报 USED）
 *   → ③ 阶段图（from=当前、to 在图里）→ ④ 当前阶段要老板批就必须有证据 → ⑤ exit_criteria
 *   → ⑥ 未结任务 → ⑦ 落盘（阶段证据 → used-keys → current.json + 审计）。
 */
function opStageEnter(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['from', 'to', 'exit_criteria_met', 'evidence', 'version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `stage-enter 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)

  const met = payload?.exit_criteria_met ?? []
  if (!Array.isArray(met)) throw cliError('E_ARG_SCHEMA', `exit_criteria_met 必须是数组，实得 ${JSON.stringify(met)}`)

  // ② 证据本身（唯一性 / 绑定 / 转述 / 时间形状）。
  const evidence = payload?.evidence ?? null
  let key = null
  if (evidence !== null) {
    const verdict = validateBossEvidence(evidence, {
      transition: { from_stage_id: payload?.from, to_stage_id: payload?.to },
      usedEvidenceKeys: readUsedKeys(paths),
    })
    if (!verdict.ok) throw cliError(verdict.code, verdict.message, { evidence_key: verdict.key })
    key = verdict.key
  }

  // ③ 阶段图。
  const graph = R.stageEnterGraphVerdict(current, payload?.from, payload?.to)
  if (!graph.ok) throw cliError(graph.code, graph.message)

  // ④ 老板门槛：**只约束当前阶段的关闭**（下一阶段要不要批，与这一次无关 —— §B3.5 场景⑥）。
  if (graph.currentStage.boss_gate === 'approval_required' && evidence === null) {
    throw cliError('E_EVIDENCE_MISSING', `当前大阶段「${graph.currentStage.name}」要求老板批准才能收口，但没有 evidence —— 阶段切换只认老板证据`)
  }

  // ⑤ 退出条件。
  const criteria = R.exitCriteriaVerdict(graph.currentStage, met)
  if (!criteria.ok) throw cliError(criteria.code, criteria.message)

  // ⑥ 未结任务。
  const openTasks = R.openTasksVerdict(current)
  if (!openTasks.ok) throw cliError(openTasks.code, openTasks.message)

  // ⑦ 落盘：先补出 transition_id（**调用方不预填** —— A6），再写阶段证据、再改路线。
  const dayKey = R.dayKeyOf(at)
  const transitionId = R.transitionIdOf(dayKey, audit.records.filter((r) => r.op === 'stage-enter' || r.kind === 'stage-enter').length + 1)
  const evidencePath = path.join(paths.evidenceDir, `${transitionId}.json`)
  if (evidence !== null) {
    const record = spentEvidenceRecord(evidence, { transitionId, fromStageId: current.current_stage_id, toStageId: graph.nextStage.id, spentAt: at, key })
    const written = writeJsonAtomic(evidencePath, record)
    if (!written.ok) throw cliError(written.code, `阶段证据写入失败：${written.message}`, { path: evidencePath })
    try {
      appendUsedKey(paths, key, at)
    } catch (err) {
      throw cliError(err?.code ?? 'E_TXN_IO', `used-keys 写入失败：${err?.message}`, { path: paths.usedKeys })
    }
  }
  const next = R.applyStageEnter(current, {
    to: graph.nextStage.id,
    at,
    transitionId,
    exitCriteriaMet: met,
    evidenceKey: key,
    evidencePath: evidence === null ? null : evidencePath,
  })
  const out = commitRoute(paths, {
    op: 'stage-enter', at, nextRoute: next, prevSha: currentSha, sessionId,
    detail: { transition_id: transitionId, from_stage_id: current.current_stage_id, to_stage_id: graph.nextStage.id, evidence_key: key, evidence_path: evidence === null ? null : evidencePath },
  })
  return {
    version: next.version,
    from: current.current_stage_id,
    to: graph.nextStage.id,
    transition_id: transitionId,
    evidence_key: key,
    evidence_path: evidence === null ? null : evidencePath,
    audit_seq: out.audit_seq,
    sha256: out.sha256,
  }
}

// ── op：task-set ───────────────────────────────────────────────────────────
function opTaskSet(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const verdict = R.taskSetVerdict(payload, current)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  const next = {
    ...current,
    tasks: verdict.tasks,
    current_task_id: verdict.current_task_id,
    // ⑤ 任务做完**不自动**推进大阶段：这里一个字都不动 current_stage_id。
    version: current.version + 1,
    updated_at: at,
  }
  const out = commitRoute(paths, { op: 'task-set', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { tasks: verdict.tasks.length, current_task_id: verdict.current_task_id } })
  return { version: next.version, sha256: out.sha256, audit_seq: out.audit_seq, tasks: verdict.tasks.length }
}

// ── op：票 ─────────────────────────────────────────────────────────────────
function requireTicket(current, id) {
  if (typeof id !== 'string' || id.trim() === '') throw cliError('E_ARG_SCHEMA', `票号（id）必填，实得 ${JSON.stringify(id)}`)
  const hit = (current.tickets ?? []).find((t) => t.id === id)
  if (!hit) throw cliError('E_TICKET_NOT_FOUND', `票 ${id} 不在路线里（现有：${(current.tickets ?? []).map((t) => t.id).join(' / ') || '（没有票）'}）`)
  return hit
}

function opTicketOpen(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['title', 'source', 'next_step', 'acceptance', 'id', 'version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `ticket-open 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)

  const tickets = current.tickets ?? []
  const id = typeof payload?.id === 'string' && payload.id.trim() !== '' ? payload.id.trim() : T.nextTicketId(tickets, R.dayKeyOf(at))
  const record = T.newTicketRecord({
    id,
    title: payload?.title,
    source: payload?.source,
    next_step: payload?.next_step,
    acceptance: payload?.acceptance,
    at,
  })
  const verdict = T.validateTicket(record, { existingIds: tickets.map((t) => t.id), findingsSet: null })
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  // 同一来源只许开一张（"同一来源的票重复开" ⇒ E_TICKET_DUP，B3.3/§B1.4）。
  const dupSource = tickets.find((t) => t.source === record.source)
  if (dupSource) throw cliError('E_TICKET_DUP', `来源 ${record.source} 已经开过票了（${dupSource.id}，状态 ${dupSource.status}）—— 要补差就在那张票上补`)

  const next = { ...current, tickets: [...tickets, record], version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, { op: 'ticket-open', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: record.id, source: record.source } })
  return { ticket_id: record.id, ticket: record, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

function opTicketUpdate(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['id', 'status', 'version', 'closure_evidence', 'void_reason', 're_present', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `ticket-update 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const ticket = requireTicket(current, payload?.id)

  // "重呈现之后再来一次"：票已经是 void，这一步只换/补 `re_present`（**状态机不动**，证据不丢）。
  const rePresentOnly = ticket.status === 'void'
    && (payload?.status === undefined || payload?.status === 'void')
    && payload?.re_present !== undefined
    && payload?.closure_evidence === undefined
  if (rePresentOnly) {
    const again = T.voidRePresentVerdict(ticket, payload)
    if (!again.ok) throw cliError(again.code, again.message)
    const history = [...(ticket.re_present_history ?? []), ticket.re_present].filter((v) => v !== null && v !== undefined)
    const updated = { ...ticket, re_present: { ref: payload.re_present.ref, at: payload.re_present.at, note: payload.re_present.note ?? null }, re_present_history: history, last_update: at }
    const next = { ...current, tickets: (current.tickets ?? []).map((t) => (t.id === ticket.id ? updated : t)), version: current.version + 1, updated_at: at }
    const out = commitRoute(paths, { op: 'ticket-update', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: ticket.id, re_present: updated.re_present.ref, action: 're-present-again' } })
    return { ticket: updated, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
  }

  const status = payload?.status
  if (!T.TICKET_STATUSES.includes(status)) {
    throw cliError('E_TICKET_STATUS', `status 必须是 ${T.TICKET_STATUSES.join(' | ')}，实得 ${JSON.stringify(status)}`)
  }
  // 终态那两条路各有各的证据要求 —— 先判证据、再判状态机（"关票要证据"是前置条件）。
  let patch = null
  if (status === 'done') {
    const close = T.closeEvidenceVerdict(ticket, payload?.closure_evidence)
    if (!close.ok) throw cliError(close.code, close.message)
    patch = { closure_evidence: { ...payload.closure_evidence, closed_at: payload.closure_evidence.closed_at ?? at }, closed_at: at }
  } else if (status === 'void') {
    const v = T.voidVerdict(ticket, payload)
    if (!v.ok) throw cliError(v.code, v.message)
    patch = { void_reason: payload.void_reason, re_present: { ref: payload.re_present.ref, at: payload.re_present.at, note: payload.re_present.note ?? null }, closed_at: at }
  }
  if (!T.canTransition(ticket.status, status)) {
    throw cliError('E_TICKET_TRANSITION', `票 ${ticket.id}：${ticket.status} → ${status} 不合法（C-3：open→in_progress|void · in_progress→done|void · done/void 是终态）`)
  }
  const updated = { ...ticket, ...(patch ?? {}), status, last_update: at }
  const next = { ...current, tickets: (current.tickets ?? []).map((t) => (t.id === ticket.id ? updated : t)), version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, { op: 'ticket-update', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: ticket.id, from_status: ticket.status, to_status: status } })
  return { ticket: updated, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

/** `ticket-close`：`done` 那条路（关闭证据三非空）。 */
function opTicketClose(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['id', 'status', 'closure_evidence', 'version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `ticket-close 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const ticket = requireTicket(current, payload?.id)
  if (payload?.status !== undefined && payload.status !== 'done') {
    throw cliError('E_ARG_SCHEMA', `ticket-close 只用于 done，实得 status=${JSON.stringify(payload.status)}（要 void 走 ticket-void）`)
  }
  const close = T.closeEvidenceVerdict(ticket, payload?.closure_evidence)
  if (!close.ok) throw cliError(close.code, close.message)
  if (!T.canTransition(ticket.status, 'done')) {
    throw cliError('E_TICKET_TRANSITION', `票 ${ticket.id}：${ticket.status} → done 不合法（C-3：不许跳过 in_progress）`)
  }
  const updated = {
    ...ticket,
    status: 'done',
    closure_evidence: { ...payload.closure_evidence, closed_at: payload.closure_evidence.closed_at ?? at },
    closed_at: at,
    last_update: at,
  }
  const next = { ...current, tickets: (current.tickets ?? []).map((t) => (t.id === ticket.id ? updated : t)), version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, { op: 'ticket-close', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: ticket.id, closure_kind: updated.closure_evidence.kind } })
  return { ticket: updated, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

/** `ticket-void`：`void` 那条路（必须给理由**与**重呈现位置）。 */
function opTicketVoid(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['id', 'status', 'void_reason', 're_present', 'version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `ticket-void 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const ticket = requireTicket(current, payload?.id)
  if (payload?.status !== undefined && payload.status !== 'void') {
    throw cliError('E_ARG_SCHEMA', `ticket-void 只用于 void，实得 status=${JSON.stringify(payload.status)}（要 done 走 ticket-close）`)
  }
  const verdict = T.voidVerdict(ticket, payload)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  if (!T.canTransition(ticket.status, 'void')) {
    throw cliError('E_TICKET_TRANSITION', `票 ${ticket.id}：${ticket.status} → void 不合法（C-3：done/void 是终态，要回退就开新票）`)
  }
  const updated = {
    ...ticket,
    status: 'void',
    void_reason: payload.void_reason,
    re_present: { ref: payload.re_present.ref, at: payload.re_present.at, note: payload.re_present.note ?? null },
    closed_at: at,
    last_update: at,
  }
  const next = { ...current, tickets: (current.tickets ?? []).map((t) => (t.id === ticket.id ? updated : t)), version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, { op: 'ticket-void', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: ticket.id, re_present: updated.re_present.ref } })
  return { ticket: updated, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

// ── op：读面 ───────────────────────────────────────────────────────────────
function opRead(ctx) {
  const { paths } = ctx
  const current = readCurrent(paths)
  const shape = R.routeShapeVerdict(current)
  if (!shape.ok) throw cliError(shape.code, shape.message)
  const sha = sha256Hex(readFileSync(paths.current))
  return { current, version: current.version, sha256: sha, path: paths.current }
}

function opVerify(ctx) {
  const { paths } = ctx
  const current = readCurrent(paths)
  const sha = sha256Hex(readFileSync(paths.current))
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const verdict = chainVerdict(paths, audit.records, sha)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  return {
    authoritative: true,
    sha256: sha,
    audit_tail_sha256: verdict.tail.next_sha256,
    audit_seq: verdict.tail.seq ?? audit.records.length,
    audit_records: audit.records.length,
    version: current?.version ?? null,
    path: paths.current,
  }
}

function opSummarize(ctx) {
  const { paths } = ctx
  const current = readCurrent(paths)
  const shape = R.routeShapeVerdict(current)
  if (!shape.ok) throw cliError(shape.code, shape.message)
  const sha = sha256Hex(readFileSync(paths.current))
  return { text: R.summarizeRoute(current), version: current.version, sha256: sha, path: paths.current }
}

// ── 入口 ───────────────────────────────────────────────────────────────────
const OPS = {
  init: opInit,
  'stage-graph-set': opStageGraphSet,
  'stage-enter': opStageEnter,
  'task-set': opTaskSet,
  'ticket-open': opTicketOpen,
  'ticket-update': opTicketUpdate,
  'ticket-close': opTicketClose,
  'ticket-void': opTicketVoid,
  read: opRead,
  verify: opVerify,
  summarize: opSummarize,
}

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
      process.stderr.write(`agenia-route.mjs 的 op 清单（${OP_NAMES.length} 个）：\n  ${OP_NAMES.join('\n  ')}\n`)
      emit({ ok: true, op: 'help', cli: CLI_NAME, ops: [...OP_NAMES] })
      return 0
    }
    if (!Object.hasOwn(OPS, op)) throw cliError('E_USAGE', `未知 op：${JSON.stringify(op)}；可用：${OP_NAMES.join(' / ')}`)
    const payload = readPayload(args)
    const workspace = resolveWorkspace(args, payload)
    const statusRoot = args.statusRoot === null || args.statusRoot === undefined || String(args.statusRoot).trim() === ''
      ? null
      : resolveRoot(args, { label: '--status-root', raw: args.statusRoot, markerInParent: true })
    // `--data-root` 只**校验**（路线侧的写面永远是工作区）：给了非法根照样拒，但一个字节都不写它。
    if (args.dataRoot !== null && args.dataRoot !== undefined && String(args.dataRoot).trim() !== '') {
      resolveRoot(args, { label: '--data-root', raw: args.dataRoot })
    }
    const paths = routePaths(workspace, statusRoot)
    const at = R.isoWithOffset(clockNow())
    const sessionId = typeof payload?.session_id === 'string' && payload.session_id.trim() !== '' ? payload.session_id : null
    const ctx = { paths, payload, at, args, sessionId, op }
    const out = READ_OPS.has(op) ? OPS[op](ctx) : withLock(paths, args, { op, sessionId }, () => OPS[op](ctx))
    emit({ ok: true, op, workspace, route_dir: paths.routeDir, ...out })
    return 0
  } catch (err) {
    const code = typeof err?.code === 'string' && Object.hasOwn(CODES, err.code) ? err.code : 'E_INTERNAL'
    process.stderr.write(`[${CLI_NAME}] ${code} ${String(err?.message ?? err)}\n`)
    emit({ ok: false, op, error: { code, message: String(err?.message ?? err), details: err?.details ?? null } })
    return CODES[code].exit
  }
}

process.exitCode = main(process.argv.slice(2))
