#!/usr/bin/env node
/**
 * `agenia-local.mjs` —— 项目本地状态（local project state）· 本地双评审 claim · brain-health · 回执对账。
 *
 * 冻结依据：提案 §B1.3（文件名与落点）· §B1.4（**调用形状 / op 表 / 退出码**：`local-read` / `local-claim` /
 *   `local-mark` / `local-receipt-set` / `local-fail` / `health` / `receipt-check` / `help`）·
 *   §B1.5（判定住在 `lib/local-state.mjs` / `lib/health.mjs` / `lib/receipt.mjs` 里）·
 *   §B3.6（本地状态 schema）· §B3.7（位置 / 原子写 / 锁 / 读-改-写全程持锁）·
 *   追加裁定 v1.2 **C-4**（回执版本 max+1、空洞不填）· **C-6**（覆盖那个码只由 `lib/receipt.mjs` 产生）·
 *   追加裁定 **v1.12 C-1**（`healthVerdict` 的判定整体在 `lib/health.mjs`，**本文件只做薄调用**）。
 *
 * 六条硬口径：
 *   ① **根逐次显式**：`--workspace` 必填（`--status-root` 不给就取 `<workspace>/.team`；`--data-root`
 *      给了只**校验**）。省略 / 空串 / 相对 / UNC / C 盘 / 指真实根 / 越界 / 测试模式下不带 marker
 *      —— 一律非零退出且**零写入**（判定顺序由 `lib/paths.mjs` 冻结）。
 *   ② **stdout 恰好一行 JSON**（`{ok:true,…}` / `{ok:false,error:{code,message,details}}`），人话走 stderr。
 *   ③ **退出码只从 `lib/error-codes.mjs` 来**：`ok ? 0 : CODES[code].exit`。
 *   ④ **写面全走 `lib/atomic.mjs`**（临时件同目录 → fsync → rename）；锁是真锁，僵锁**不静默抢写**。
 *   ⑤ **读面零写入**：`local-read` / `receipt-check` 不建目录、不持锁、不写盘；`health` 只落**派生卡**
 *      （`brain/<day>/health.json`，随时可由同一批输入重算 ⇒ 清单里记 `writes:false`）。
 *   ⑥ **"现在"只从 `lib/clock.mjs` 进**，本文件里没有裸 `Date`（锁自己的记账时间除外 —— 见 `lib/local-state.mjs` ③）。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { CODES } from '../lib/error-codes.mjs'
import { dataRootVerdict, resolveWithin, TEST_ROOT_MARKER, testModeOf } from '../lib/paths.mjs'
import { writeJsonAtomic } from '../lib/atomic.mjs'
import { now as clockNow } from '../lib/clock.mjs'
import * as S from '../lib/state.mjs'
import { LEASES } from '../lib/liveness.mjs'
import { openAdoptedTicketIds } from '../lib/tickets.mjs'
import * as R from '../lib/receipt.mjs'
import * as H from '../lib/health.mjs'
import * as L from '../lib/local-state.mjs'

const CLI_NAME = 'agenia-local.mjs'

/** op 清单（顺序即 `--op help` 的打字顺序；与提案 §B1.4 那张表逐条一致）。 */
const OP_NAMES = Object.freeze([
  'local-read', 'local-claim', 'local-mark', 'local-receipt-set', 'local-fail',
  'health', 'receipt-check', 'help',
])

const TEAM_DIR_NAME = '.team'

function cliError(code, message, details = null) {
  const err = new Error(message)
  err.name = 'LocalCliError'
  err.code = code
  err.details = details
  return err
}

// ── 参数与根 ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    op: null, workspace: null, statusRoot: null, dataRoot: null, inFile: null,
    testMode: false, forceRecover: false, unknown: [],
  }
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
 * 根判定 —— 每条 op 都先过这一关（顺序由 `lib/paths.mjs` 冻结）。
 * `--status-root` 指 `.team` 那一层，它的 marker 允许长在**父目录**（工作区）上：
 * 那一层本来就是"这份工作区属于某次测试运行"的凭据，而 `.team` 本身可能还没建出来。
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
    throw cliError('E_ARG_SCHEMA', '缺 --workspace（本地状态只写它下面；这里**没有** env 兜底，每次都要显式给）')
  }
  // 🔴 工作区不判"包住真实根"（恒自拒）—— 来历见 `lib/paths.mjs` 判定处那段注释。2026-10-16 加。
  return resolveRoot(args, { label: '--workspace', raw, containingRule: false })
}

function teamDirOf(args, workspace) {
  const raw = args.statusRoot
  if (raw === null || raw === undefined || String(raw).trim() === '') return path.join(workspace, TEAM_DIR_NAME)
  return resolveRoot(args, { label: '--status-root', raw, markerInParent: true })
}

/** 解析一个"相对某一层"的落点；逃出去 ⇒ `E_PATH_ESCAPE`（`..` 穿越与绝对逃逸一起吃掉）。 */
function resolveUnder(base, rel, { label }) {
  const verdict = resolveWithin(base, rel)
  if (!verdict.ok) throw cliError('E_PATH_ESCAPE', `${label} 逃出了它该在的那一层（${base}）：${rel}`)
  return verdict.path
}

/**
 * 这一票"哪一天"（六个 op 全用它）—— 与脑侧**同一支**（`lib/state.mjs::resolveDay`）。
 *
 * 契约 `CONTRACT.md` §13.2 / §13.3（`F-158`）：`day` **可选**。
 *   · 给了 ⇒ 必须是 day key（形状**和**日历），否则 `E_ARG_SCHEMA`；`""` / 全空白也算"给了"，
 *     **不许**吞成"没给"（那会让一次拼错的日子落到别的日子上）；
 *   · 没给 ⇒ 时钟那一支：`dayKeyOf`（本地 04:00 切，00:00–03:59 归前一天），时钟走 `lib/clock.mjs`
 *     那一份（`AGENIA_NOW_FILE` 可注入）—— 别在这里另造一份。
 * 本地 CLI 没有脑根、没有 `current-day` 指针 ⇒ **不传 `{ pointer: true }`**，所以第一参给 `null`：
 * 缺省只有"时钟"这一支（指针那一支只活在脑侧的中途 op 里，见 `resolveDay` 的注释）。
 */
function dayOfPayload(payload) {
  return S.resolveDay(null, payload?.day).day
}

function projectOfPayload(payload, fallback = null) {
  const project = payload?.project
  if (typeof project === 'string' && project.trim() !== '') return project.trim()
  if (typeof fallback === 'string' && fallback.trim() !== '') return fallback.trim()
  throw cliError('E_ARG_SCHEMA', `project 必填（项目 id），实得 ${JSON.stringify(payload?.project)}`)
}

// ── op：读面 ───────────────────────────────────────────────────────────────
function opLocalRead(ctx) {
  const { payload, teamDir } = ctx
  const day = dayOfPayload(payload)
  const read = L.readLocalState(teamDir, day)
  if (!read.ok) throw cliError(read.code, read.message, { path: read.path })
  return { state: read.state, state_path: read.path, summary: L.localSummary(read.state), project: read.state.project, day: read.state.day }
}

/**
 * `receipt-check` —— **锚点对账**（B3.1 的最后一段：回执自报的 SHA 不算锚）。
 *
 * 逐条比：报告**盘上字节** ↔ 状态里的 `report_sha256` ↔ 回执的 `report.sha256`；
 * 发现集那两处声明值彼此一致；再把"每条 finding 恰好一个落点"的清单核一遍。
 * ⚠️ 票那一族只在**票库真的拿得到**（`<team>\route\current.json`）时才判 ——
 * 拿不到票库就说"票这一格不适用"，**不拿空票库当"票不存在"**（那会把正例判红）。
 */
function opReceiptCheck(ctx) {
  const { payload, teamDir, workspace } = ctx
  const day = dayOfPayload(payload)
  const read = L.readLocalState(teamDir, day)
  if (!read.ok) throw cliError(read.code, read.message, { path: read.path })
  const node = read.state.technical ?? {}
  const statePath = read.path

  const reportRel = typeof payload?.report_path === 'string' && payload.report_path.trim() !== '' ? payload.report_path : node.report_path
  const findingsRel = typeof payload?.findings_path === 'string' && payload.findings_path.trim() !== '' ? payload.findings_path : node.findings_path
  const receiptRel = typeof payload?.receipt_path === 'string' && payload.receipt_path.trim() !== ''
    ? payload.receipt_path
    : (typeof node.receipt_path === 'string' && node.receipt_path.trim() !== '' ? node.receipt_path : path.join('leader', day, '技术复盘回执.json'))
  const routeRel = typeof payload?.route_path === 'string' && payload.route_path.trim() !== '' ? payload.route_path : path.join('route', 'current.json')

  for (const [label, rel] of [['report_path', reportRel], ['findings_path', findingsRel]]) {
    if (typeof rel !== 'string' || rel.trim() === '') {
      throw cliError('E_DATA_MISSING', `本地状态的 technical 节点里没有 ${label} —— 回执无从对账（先 local-mark 登记作业产物）`, { state_path: statePath })
    }
  }
  const reportAbs = resolveUnder(workspace, reportRel, { label: 'report_path' })
  const findingsAbs = resolveUnder(workspace, findingsRel, { label: 'findings_path' })
  const receiptAbs = resolveUnder(teamDir, receiptRel, { label: 'receipt_path' })
  const routeAbs = resolveUnder(teamDir, routeRel, { label: 'route_path' })

  if (!existsSync(reportAbs)) throw cliError('E_DATA_MISSING', `报告不在盘上：${reportAbs}`, { path: reportAbs })
  if (!existsSync(receiptAbs)) throw cliError('E_DATA_MISSING', `回执不在盘上：${receiptAbs}`, { path: receiptAbs })

  const actualReportSha = createHash('sha256').update(readFileSync(reportAbs)).digest('hex')
  const anchorProblems = []
  const anchor = (code, detail) => anchorProblems.push({ code, detail })
  const declaredReport = typeof node.report_sha256 === 'string' ? node.report_sha256.trim().toLowerCase() : null
  if (declaredReport !== null && actualReportSha !== declaredReport) {
    anchor('E_RECEIPT_HASH', `技术报告盘上字节与本地状态的锚点对不上（状态 ${declaredReport.slice(0, 12)}…，盘上 ${actualReportSha.slice(0, 12)}…）—— 锚点来自作业产物`)
  }

  const receiptRead = H.readJsonSource(receiptAbs)
  if (!receiptRead.ok) throw cliError(receiptRead.code, `回执读不出来：${receiptRead.message}`, { path: receiptAbs })
  const receipt = receiptRead.value
  const findingsRead = H.readJsonSource(findingsAbs)
  if (!findingsRead.ok) throw cliError(findingsRead.code, `findings 文件读不出来：${findingsRead.message}`, { path: findingsAbs })
  const findingsObj = findingsRead.value

  const ownReport = typeof receipt?.report?.sha256 === 'string' ? receipt.report.sha256.trim().toLowerCase() : null
  if (ownReport === null) anchor('E_RECEIPT_HASH', '回执缺 report.sha256 —— 报告锚点必填')
  else if (declaredReport !== null && ownReport !== declaredReport) {
    anchor('E_RECEIPT_HASH', `回执自报的报告 SHA 与作业产物的锚点对不上（回执 ${ownReport.slice(0, 12)}…，状态 ${declaredReport.slice(0, 12)}…）—— 自报不算锚`)
  }
  const declaredSet = typeof node.findings_set_sha256 === 'string' ? node.findings_set_sha256.trim().toLowerCase() : null
  const ownSet = typeof receipt?.findings_set_sha256 === 'string' ? receipt.findings_set_sha256.trim().toLowerCase() : null
  if (ownSet === null) anchor('E_RECEIPT_HASH', '回执缺 findings_set_sha256 —— 发现集锚点必填')
  else if (declaredSet !== null && ownSet !== declaredSet) {
    anchor('E_RECEIPT_HASH', `回执的 findings_set_sha256 与本地状态的锚点对不上（回执 ${ownSet.slice(0, 12)}…，状态 ${declaredSet.slice(0, 12)}…）`)
  }
  const artifactSet = typeof findingsObj?.findings_set_sha256 === 'string' ? findingsObj.findings_set_sha256.trim().toLowerCase() : null
  if (artifactSet !== null && declaredSet !== null && artifactSet !== declaredSet) {
    anchor('E_RECEIPT_HASH', `findings 文件自报的 findings_set_sha256 与本地状态的锚点对不上（文件 ${artifactSet.slice(0, 12)}…，状态 ${declaredSet.slice(0, 12)}…）`)
  }

  const lenient = R.parseFindings(findingsObj)
  if (!lenient.ok) throw cliError(lenient.code, `findings 文件不成形状：${lenient.message}`, { path: findingsAbs })

  const routeRead = H.readJsonSource(routeAbs)
  const route = routeRead.ok ? routeRead.value : null
  const tickets = route === null ? null : (Array.isArray(route.tickets) ? route.tickets : [])
  const coverage = R.validateReceiptCoverage(receipt, findingsObj, tickets, {
    report_sha256: declaredReport ?? actualReportSha,
    findings_set_sha256: declaredSet,
  })
  const problems = [...anchorProblems, ...coverage.anchorProblems, ...coverage.fingerprintProblems]
  const code = problems[0]?.code ?? coverage.code ?? null
  if (code !== null) {
    throw cliError(code, problems[0]?.detail ?? coverage.message, {
      path: receiptAbs, missing: coverage.missing, duplicate: coverage.duplicate, extra: coverage.extra,
      ticket_problems: coverage.ticketProblems, reason_problems: coverage.reasonProblems, anchor_problems: anchorProblems,
    })
  }
  return {
    coverage,
    anchors: {
      report_sha256: declaredReport, findings_set_sha256: declaredSet,
      actual_report_sha256: actualReportSha, receipt_sha256: coverage.receipt_anchors?.receipt_sha256 ?? null,
    },
    tickets_checked: tickets !== null,
    paths: { report: reportAbs, findings: findingsAbs, receipt: receiptAbs, route: routeRead.ok ? routeAbs : null, state: statePath },
  }
}

// ── op：写面（全走 localTransaction：锁内读 → 判 → 原子写）──────────────────
function opLocalClaim(ctx) {
  const { payload, teamDir, args, at, sessionId } = ctx
  const day = dayOfPayload(payload)
  const request = L.claimRequestVerdict(payload)
  if (!request.ok) throw cliError(request.code, request.message)
  const field = request.field
  const project = projectOfPayload(payload)

  const result = L.localTransaction(teamDir, { day, field, at, sessionId, forceRecover: args.forceRecover, waitMs: ctx.waitMs }, (current) => {
    const state = current ?? L.emptyLocalState({ project, day, snapshot: typeof payload.snapshot === 'string' && payload.snapshot.trim() !== '' ? payload.snapshot.trim() : 'v0', at })
    if (current !== null && typeof payload.snapshot === 'string' && payload.snapshot.trim() !== '' && current.snapshot !== payload.snapshot.trim()) {
      process.stderr.write(`[${CLI_NAME}] WARN 这一天已经绑在快照 ${current.snapshot} 上，本次带的 ${payload.snapshot} 不覆盖它（"同一天多场用 snapshot 区分"由文件里的那一个说了算）\n`)
    }
    const verdict = L.claimVerdict(state[field], { attempt: payload.attempt })
    if (!verdict.ok) return { ok: false, code: verdict.code, message: verdict.message }
    const next = { ...state, updated_at: at }
    next[field] = L.applyClaim(state[field], { attempt: payload.attempt, jobId: payload.job_id, at })
    return { ok: true, state: next }
  })
  if (!result.ok) throw cliError(result.code, result.message, { path: result.path })
  return {
    state: result.state,
    state_path: result.path,
    claim_path: L.fieldLockPath(teamDir, day, field),
    field,
    snapshot: result.state.snapshot,
    attempt: payload.attempt,
    job_id: payload.job_id,
  }
}

/**
 * `local-mark` —— 落地：节点 `done` + 产物锚点（§12.2）。
 *
 * 锚点闸**按字段**（`field` 一路传给 `lib/local-state.mjs::artifactAnchorVerdict`：
 * `technical` 要 findings 三件套，另外两个字段只要报告），而且它跑在事务**之前** ——
 * 被拒的 mark 一个字节都不写（状态文件保持 claim 写完的那一份）。
 *
 * 落进节点的路径是**闸归一之后**的规范拼法（`.team/<…>/<file>`，正斜杠）——
 * 调用方用 `.team/a.md` / `a.md` / `./.team/a.md` / `.team\a.md` 哪一种写法都行，
 * 状态文件里只有一种（§12.2.2）。
 */
function opLocalMark(ctx) {
  const { payload, teamDir, workspace, at } = ctx
  const day = dayOfPayload(payload)
  const field = L.fieldKeyOf(payload?.field)
  if (field === null) throw cliError('E_ARG_SCHEMA', `field 必须是 memory-review | conversation | technical，实得 ${JSON.stringify(payload?.field)}`)
  const project = projectOfPayload(payload)
  const anchors = L.artifactAnchorVerdict(workspace, payload, field)
  if (!anchors.ok) throw cliError(anchors.code, anchors.message, { problems: anchors.problems })
  // 规范化后的锚点（闸给的），不是调用方给的那一串字面量。
  const markSpec = { ...payload, report_path: anchors.report_rel }
  if (typeof payload?.findings_path === 'string' && payload.findings_path.trim() !== '') markSpec.findings_path = anchors.findings_rel
  if (Array.isArray(payload?.artifact_paths)) markSpec.artifact_paths = anchors.artifact_rels

  const result = L.localTransaction(teamDir, { day, field, at, sessionId: ctx.sessionId, forceRecover: ctx.args.forceRecover, waitMs: ctx.waitMs }, (current) => {
    const snapshot = typeof payload.snapshot === 'string' && payload.snapshot.trim() !== '' ? payload.snapshot.trim() : (current?.snapshot ?? 'v0')
    const state = current ?? L.emptyLocalState({ project, day, snapshot, at })
    const next = { ...state, updated_at: at }
    next[field] = L.applyMark(state[field], markSpec, at)
    return { ok: true, state: next }
  })
  if (!result.ok) throw cliError(result.code, result.message, { path: result.path })
  const node = result.state[field]
  return {
    state: result.state,
    state_path: result.path,
    field,
    node_state: node.state,
    anchors: {
      report_path: node.report_path, report_sha256: node.report_sha256,
      findings_path: node.findings_path, findings_set_sha256: node.findings_set_sha256, findings_count: node.findings_count,
    },
    artifact_paths: node.artifact_paths,
  }
}

function opLocalReceiptSet(ctx) {
  const { payload, teamDir, at } = ctx
  const day = dayOfPayload(payload)
  const project = projectOfPayload(payload)
  if (!Number.isInteger(payload?.receipt_version) || payload.receipt_version < 1) {
    throw cliError('E_ARG_SCHEMA', `receipt_version 必须是 ≥1 的整数，实得 ${JSON.stringify(payload?.receipt_version)}`)
  }
  if (typeof payload?.receipt_path !== 'string' || payload.receipt_path.trim() === '') {
    throw cliError('E_ARG_SCHEMA', `receipt_path 必填（相对 .team 那一层），实得 ${JSON.stringify(payload?.receipt_path)}`)
  }
  if (typeof payload?.receipt_sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(payload.receipt_sha256.trim())) {
    throw cliError('E_ARG_SCHEMA', `receipt_sha256 必须是 64 hex，实得 ${JSON.stringify(payload?.receipt_sha256)}`)
  }
  if (payload?.ticket_ids !== undefined && !Array.isArray(payload.ticket_ids)) {
    throw cliError('E_ARG_SCHEMA', `ticket_ids 必须是数组，实得 ${JSON.stringify(payload?.ticket_ids)}`)
  }
  const receiptAbs = resolveUnder(teamDir, payload.receipt_path, { label: 'receipt_path' })

  const result = L.localTransaction(teamDir, { day, field: null, at, sessionId: ctx.sessionId, forceRecover: ctx.args.forceRecover, waitMs: ctx.waitMs }, (current) => {
    const snapshot = typeof payload.snapshot === 'string' && payload.snapshot.trim() !== '' ? payload.snapshot.trim() : (current?.snapshot ?? 'v0')
    const state = current ?? L.emptyLocalState({ project, day, snapshot, at })
    const node = state.technical
    // 已存在的版本 = 台账（登记过的） ∪ 盘上真有的那几份 —— C-6 明写"目标版本文件已存在"也算。
    const existing = [...new Set([...L.receiptVersionsOf(node), ...L.receiptVersionsOnDisk(teamDir, day)])].sort((a, b) => a - b)
    const verdict = R.receiptWriteVerdict({
      existing,
      version: payload.receipt_version,
      expected_version: payload.expected_version ?? null,
      target_exists: existsSync(receiptAbs),
    })
    if (!verdict.ok) return { ok: false, code: verdict.code, message: verdict.message }
    const next = { ...state, updated_at: at }
    next.technical = L.applyReceiptRegistration(node, { ...payload, receipt_path: payload.receipt_path.trim() }, at)
    return { ok: true, state: next }
  })
  if (!result.ok) throw cliError(result.code, result.message, { path: result.path })
  return {
    state: result.state,
    state_path: result.path,
    receipt_path: result.state.technical.receipt_path,
    receipt_abs: receiptAbs,
    receipt_version: result.state.technical.receipt_version,
    versions: L.receiptVersionsOf(result.state.technical),
  }
}

function opLocalFail(ctx) {
  const { payload, teamDir, at } = ctx
  const day = dayOfPayload(payload)
  const field = L.fieldKeyOf(payload?.field)
  if (field === null) throw cliError('E_ARG_SCHEMA', `field 必须是 memory-review | conversation | technical，实得 ${JSON.stringify(payload?.field)}`)

  const result = L.localTransaction(teamDir, { day, field, at, sessionId: ctx.sessionId, forceRecover: ctx.args.forceRecover, waitMs: ctx.waitMs }, (current) => {
    if (current === null) return { ok: false, code: 'E_CLAIM_NOT_FOUND', message: `这一天还没有本地状态（${L.localStatePath(teamDir, day)}）—— 没有 claim 可以标失败` }
    const verdict = L.failureRequestVerdict(current[field])
    if (!verdict.ok) return { ok: false, code: verdict.code, message: verdict.message }
    const next = { ...current, updated_at: at }
    next[field] = L.applyFailure(current[field], payload, at)
    return { ok: true, state: next }
  })
  if (!result.ok) throw cliError(result.code, result.message, { path: result.path })
  return { state: result.state, state_path: result.path, field, failure_reason: result.state[field].failure_reason }
}

// ── op：health（薄调用 —— 判定全在 lib/health.mjs）─────────────────────────
function opHealth(ctx) {
  const { payload, teamDir, workspace, at } = ctx
  const day = dayOfPayload(payload)
  const sources = H.readWorkspaceHealthSources({ teamDir, day })
  const project = typeof payload?.project === 'string' && payload.project.trim() !== ''
    ? payload.project.trim()
    : (typeof sources.local?.project === 'string' ? sources.local.project : null)
  const openTickets = openAdoptedTicketIds(sources.route?.tickets ?? [])
  const anchorProblems = H.receiptAnchorProblems(workspace, sources.local)
  const notReadHere = (what) => ({ ok: false, code: 'E_ARG_USAGE', path: null, note: `agenia-local.mjs 不读脑根（${what} 归 --data-root 那一侧）` })

  const input = {
    project,
    day,
    now: at,
    leases: { update: LEASES.update, local: LEASES.local },
    state: null,
    snapshot: null,
    report: null,
    local: sources.local,
    receipt: sources.receipt,
    daily: sources.daily,
    route: sources.route,
    reads: {
      state: notReadHere('共享状态'),
      snapshot: notReadHere('快照'),
      report: notReadHere('记忆更新报告'),
      local: sources.reads.local,
      receipt: sources.reads.receipt,
      daily: sources.reads.daily,
      route: sources.reads.route,
    },
    open_adopted_tickets: openTickets,
    anchor_problems: anchorProblems,
  }
  const verdict = H.healthVerdict(input)
  const healthFile = path.join(teamDir, 'brain', day, 'health.json')
  const card = H.buildHealthCard({ input, verdict, extra: { open_adopted_tickets: openTickets, health_path: healthFile } })
  const written = writeJsonAtomic(healthFile, card)
  if (!written.ok) throw cliError(written.code, `health.json 写入失败：${written.message}`, { path: healthFile })
  // `progress` 出在**信封顶端**（与 `health` 平级）：`health.json` 的字段表 B3.6 冻结、`buildHealthCard`
  // 只取 `status` / `reasons` ⇒ 「今天到哪一步了」只能从这一层原样带出来，一个数都不重算。
  return {
    progress: verdict.progress,
    health: card,
    health_path: healthFile,
    workspace,
    day,
    input_shape: Object.keys(input),
    brain_side_reads: { state: input.reads.state.code, snapshot: input.reads.snapshot.code, report: input.reads.report.code },
  }
}

// ── 入口 ───────────────────────────────────────────────────────────────────
const OPS = {
  'local-read': opLocalRead,
  'local-claim': opLocalClaim,
  'local-mark': opLocalMark,
  'local-receipt-set': opLocalReceiptSet,
  'local-fail': opLocalFail,
  health: opHealth,
  'receipt-check': opReceiptCheck,
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
      process.stderr.write(`agenia-local.mjs 的 op 清单（${OP_NAMES.length} 个）：\n  ${OP_NAMES.join('\n  ')}\n`)
      emit({ ok: true, op: 'help', cli: CLI_NAME, ops: [...OP_NAMES] })
      return 0
    }
    if (!Object.hasOwn(OPS, op)) throw cliError('E_USAGE', `未知 op：${JSON.stringify(op)}；可用：${OP_NAMES.join(' / ')}`)
    const payload = readPayload(args)
    const workspace = resolveWorkspace(args, payload)
    const teamDir = teamDirOf(args, workspace)
    // `--data-root` 只**校验**（本地状态的写面永远是工作区）：给了非法根照样拒，但一个字节都不写它。
    if (args.dataRoot !== null && args.dataRoot !== undefined && String(args.dataRoot).trim() !== '') {
      resolveRoot(args, { label: '--data-root', raw: args.dataRoot })
    }
    const at = clockNow().toISOString()
    const sessionId = typeof payload?.session_id === 'string' && payload.session_id.trim() !== '' ? payload.session_id : null
    const ctx = { args, payload, workspace, teamDir, at, sessionId, waitMs: undefined }
    // 读面不持锁、零写入；写面（除 health 的派生卡外）全在 localTransaction 里。
    const out = OPS[op](ctx)
    emit({ ok: true, op, workspace, status_root: teamDir, ...out })
    return 0
  } catch (err) {
    const code = typeof err?.code === 'string' && Object.hasOwn(CODES, err.code) ? err.code : 'E_INTERNAL'
    process.stderr.write(`[${CLI_NAME}] ${code} ${String(err?.message ?? err)}\n`)
    emit({ ok: false, op, error: { code, message: String(err?.message ?? err), details: err?.details ?? null } })
    return CODES[code].exit
  }
}

process.exitCode = main(process.argv.slice(2))
