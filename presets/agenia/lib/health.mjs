/**
 * brain-health —— 判定（`healthVerdict`）· 过期的转出（`staleVerdict`）· 工作区来源与健康卡。
 *
 * 冻结依据：提案 §B1.3（`lib/health.mjs` = "brain-health 判定（纯函数 + 读取器）"）· §B1.5（签名）·
 *   §B3.6（`<WS>\brain\<day>\health.json` 的字段表）· §B3.3（未关闭的采纳票必须看得见）·
 *   提案 §4（update **90** / local **45** 两档租约"不许出现 60"）·
 *   🔴 追加裁定 **v1.12 C-1**：入参形状照 CLI 带回的真实形状**冻结**，判定逻辑**整体搬进本文件**，
 *   "CLI 只做薄调用"（搬完 HLT-01 / HLT-02 复跑）。
 *
 * 四条口径：
 *   ① **过期判定不在这儿重写**：`staleVerdict` 从 `lib/liveness.mjs` 转出（一份实现、两个入口）——
 *      C-5 的 `age >= lease` 只写在一处。
 *   ② **`RUNNING ≠ GREEN`**：有作业在跑、而且 liveness 还新鲜 ⇒ 状态是 `RUNNING`，绝不许显示绿。
 *   ③ **"技术复盘完成"≠"发现已解决"**：未关闭的采纳票另立字段，而且**不许被绿掩盖**（非空 ⇒ 不给绿）。
 *   ④ **纯函数那一段不摸盘**：`healthVerdict(input)` 只吃入参；盘上的读取在下面那两个读取器里，
 *      调用方（`agenia-brain.mjs` / `agenia-local.mjs`）自己装输入 —— 薄调用就是薄在这儿。
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { LEASES, staleVerdict } from './liveness.mjs'
import { distributionOf } from './memory.mjs'
import { nodeStaleVerdict } from './local-state.mjs'
import { now as clockNow } from './clock.mjs'

export { staleVerdict }

/** 四个状态（B3.6）。`RUNNING` 与 `HOLD` 都**不是**"绿"。 */
export const HEALTH_STATUSES = Object.freeze(['GREEN', 'RED', 'RUNNING', 'HOLD'])

/** 健康卡里那几条判红用的码（**reason 码，不是 CLI 退出码** —— 与 `E_PACKET_*` 同一条口径）。 */
export const HEALTH_REASON_CODES = Object.freeze({
  NO_UPDATE_TODAY: 'E_NO_UPDATE_TODAY',
  LOCAL_FAILED: 'E_LOCAL_FAILED',
  LOCAL_STALE: 'E_LOCAL_STALE',
  /** 三场**一个都没登记**（今天还没开工）—— 它和 `LOCAL_INCOMPLETE` 是两档，读的人要分得开。 */
  LOCAL_NOT_STARTED: 'E_LOCAL_NOT_STARTED',
  /** 开了工但**没跑齐**（`done > 0`）。 */
  LOCAL_INCOMPLETE: 'E_LOCAL_INCOMPLETE',
  RECEIPT_MISSING: 'E_RECEIPT_MISSING',
  RECEIPT_ANCHOR: 'E_RECEIPT_ANCHOR',
  RECEIPT_HASH: 'E_RECEIPT_HASH',
  TICKETS_OPEN: 'E_TICKETS_OPEN',
  DATA_MISSING: 'E_DATA_MISSING',
  DATA_CORRUPT: 'E_DATA_CORRUPT',
})

/** 本地那三个节点（顺序即卡上的次序）。 */
const NODE_KEYS = Object.freeze(['memory_review', 'conversation', 'technical'])

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isFilledString = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * `daily` 在、`local` 不在那一支的 detail：**谁开的这一天**（契约 §11.3）。
 *
 * 只看两样东西：盘上有没有 `first_session_id`、载荷里有没有 `session_id`。
 *   · 带了、且**就是** opener ⇒ 说「本会话刚开工」；
 *   · 带了、且**不是** opener ⇒ 点名 opener 与 `first_at`，说「本会话不是」；
 *   · 没带 ⇒ 只报"谁开的"，**不冒充**知道本会话是谁（两句身份话都不说）；
 *   · 盘上根本没有 opener ⇒ 同样不冒充（本会话是不是它，判不了）。
 * `first_at` 照**盘上那个字符串**逐字带出来（时间怎么写以盘上为准，这里不重新格式化）。
 */
function dailyOnlyDetail(daily, sessionId) {
  const doc = isObject(daily) ? daily : {}
  const opener = isFilledString(doc.first_session_id) ? doc.first_session_id : null
  const firstAt = isFilledString(doc.first_at) ? doc.first_at : null
  const openerText = opener === null
    ? (firstAt === null ? '首次开工的会话与时间都没有记下来' : `首次开工的会话没有记下来（${firstAt}）`)
    : `首次开工是 ${opener}${firstAt === null ? '' : `（${firstAt}）`}`
  const tail = '，但本地状态还没有 —— 本地双评审没启动'
  if (!isFilledString(sessionId)) {
    return `今天开过工（每日状态在，${openerText}）${tail}；本次调用没有带 session_id，判不了是谁开的`
  }
  if (opener === null) return `今天开过工（每日状态在，${openerText}）${tail}`
  if (opener.trim() === sessionId.trim()) return `今天开过工（每日状态在，本会话刚开工：${openerText}）${tail}`
  return `今天开过工（每日状态在，${openerText}）${tail}；本会话不是开这一天的人`
}

/**
 * 一份脑健康的判定（**C-1 冻结的入参与返回**）。
 *
 * @param {object} input
 *   `project` · `day` · `now` · `leases:{update,local}` · `state` · `snapshot` · `report` ·
 *   `local` · `receipt` · `daily` · `route` · `reads`（7 份各自的 `{ok,code,path}`）。
 *   缺的键按"这一份还没读到"处理（`null`），**不许**因此抛错 —— 卡读不出来比卡判错更糟。
 *   加性可选键：`open_adopted_tickets`（未关闭的采纳票，B3.3）· `anchor_problems`（锚点核对结果）·
 *   `session_id`（调用方的会话身份，只用来让「`daily` 在、`local` 不在」那一支说清是谁开的这一天；
 *   缺了照样能判 —— 只是卡片不点名"本会话"）。
 * @returns {{status:'GREEN'|'RED'|'RUNNING'|'HOLD', reasons:Array<{code:string,detail:string,source_path:string|null}>,
 *            progress:{done:number,total:number,receipt:boolean}}}
 *   `progress` = 「今天到哪一步了」：`done` = 三节点里 `state === 'done'` 的个数（与判定链同一个数组）·
 *   `total` = `NODE_KEYS.length` · `receipt` = 回执**内容读到了没有**。**四个 status 都带** ——
 *   `HOLD`（还没开工）那一档最需要 `0/3`。它只报进度，不解释红因（`status` / `reasons` 的读法不变）。
 */
export function healthVerdict(input = {}) {
  const reasons = []
  const push = (code, detail, sourcePath) => reasons.push({ code, detail, source_path: sourcePath ?? null })

  // 「到哪一步了」这三个数**只算一处**：
  //   · `receipt` 与 GREEN 门槛是同一个判据（回执内容读到没有，不是路径在不在）⇒ 先算一次，三处共用；
  //   · `done` 不在这里数 —— 各支直接拿判定链里那个 `done` 数组，免得出现第二份计数；
  //   · `total` 取 NODE_KEYS.length，不写死字面量。
  const hasReceipt = input?.receipt !== null && input?.receipt !== undefined
  const progressOf = (doneList) => ({ done: doneList.length, total: NODE_KEYS.length, receipt: hasReceipt })

  const leases = { update: LEASES.update, local: LEASES.local, ...(isObject(input?.leases) ? input.leases : {}) }
  const nowIso = isFilledString(input?.now) ? input.now : clockNow().toISOString()
  const localReadPath = input?.reads?.local?.path ?? null
  const local = isObject(input?.local) ? input.local : null
  const nodes = local === null ? [] : NODE_KEYS.map((key) => [key, isObject(local[key]) ? local[key] : null])

  // ① 没开工 ⇒ HOLD；开过工但状态缺 ⇒ RED（v1.12 的头两条）
  //    这一支还没算出 `done` 数组（`nodes` 是空的）⇒ `done` 就是 0，用空数组过 `progressOf`。
  if (local === null) {
    if (input?.daily !== null && input?.daily !== undefined) {
      push(HEALTH_REASON_CODES.DATA_MISSING, dailyOnlyDetail(input.daily, input?.session_id), localReadPath)
      return { status: 'RED', reasons, progress: progressOf([]) }
    }
    return {
      status: 'HOLD',
      reasons: [{ code: HEALTH_REASON_CODES.NO_UPDATE_TODAY, detail: '今天还没有开工痕迹（既无本地状态也无每日状态）', source_path: localReadPath }],
      progress: progressOf([]),
    }
  }

  // ② 过期判定走 `lib/liveness.mjs`（C-5 唯一来源），节点的"看哪个时间戳"走 `lib/local-state.mjs`
  //    （本地状态的形状归它管）—— "答不出来"一律当过期。
  const staleOf = (node) => nodeStaleVerdict(node, nowIso).stale
  const failed = nodes.filter(([, n]) => n?.state === 'failed' || n?.state === 'stale')
  const running = nodes.filter(([, n]) => n?.state === 'running' && !staleOf(n))
  const expiredRunning = nodes.filter(([, n]) => n?.state === 'running' && staleOf(n))
  const done = nodes.filter(([, n]) => n?.state === 'done')

  for (const [name, node] of failed) {
    push(HEALTH_REASON_CODES.LOCAL_FAILED, `${name} 失败：${node?.failure_reason ?? '(没给原因)'}`, localReadPath)
  }
  for (const [name, node] of expiredRunning) {
    push(HEALTH_REASON_CODES.LOCAL_STALE, `${name} 在跑但 liveness 已经过期（本地租约 ${leases.local} 分钟，最后事件 ${node?.liveness_at ?? node?.claim?.claimed_at ?? '无'}）`, localReadPath)
  }

  // ③ 技术评审：缺回执 ≠ 完成（v1.12 的第五条）
  if (!hasReceipt) {
    const technicalDone = nodes.some(([name, n]) => name === 'technical' && n?.state === 'done')
    if (technicalDone) {
      push(HEALTH_REASON_CODES.RECEIPT_MISSING, '技术评审跑完了但没有回执 ⇒ 技术复盘未完成（缺回执不是"完成"）', input?.reads?.receipt?.path ?? null)
    }
  } else {
    const node = isObject(local?.technical) ? local.technical : {}
    const anchors = [node.report_sha256, node.findings_set_sha256, node.receipt_sha256].filter((v) => isFilledString(v))
    if (anchors.length > 0 && anchors.length < 3) {
      push(HEALTH_REASON_CODES.RECEIPT_ANCHOR, '技术复盘的三个锚点（报告 / 发现集 / 回执）不齐 —— 回执与产物对不上账', localReadPath)
    }
  }
  for (const [name, node] of nodes) {
    if (node === null) push(HEALTH_REASON_CODES.DATA_MISSING, `${name} 这一场还没有任何痕迹（既没 claim 也没产物）`, localReadPath)
  }

  // ④ 加性：锚点核对（报告盘上字节 vs 状态里的锚点）+ 未关闭的采纳票
  for (const problem of Array.isArray(input?.anchor_problems) ? input.anchor_problems : []) {
    push(problem?.code ?? HEALTH_REASON_CODES.RECEIPT_HASH, problem?.detail ?? '锚点核对未通过', problem?.source_path ?? localReadPath)
  }
  const openTickets = Array.isArray(input?.open_adopted_tickets) ? input.open_adopted_tickets.filter(isFilledString) : []
  if (openTickets.length > 0) {
    push(HEALTH_REASON_CODES.TICKETS_OPEN, `技术复盘已完成，但仍有 ${openTickets.length} 张采纳票未关闭（${openTickets.join(', ')}）—— "完成"不等于"发现已解决"`, input?.reads?.route?.path ?? null)
  }

  // ⑤ 状态判定（次序即 v1.12 的规则次序）：红压过一切；有新鲜的在跑 ⇒ RUNNING（≠ GREEN）
  if (failed.length > 0 || expiredRunning.length > 0 || reasons.length > 0) return { status: 'RED', reasons, progress: progressOf(done) }
  if (running.length > 0) return { status: 'RUNNING', reasons: [], progress: progressOf(done) }
  if (done.length === NODE_KEYS.length && hasReceipt) return { status: 'GREEN', reasons: [], progress: progressOf(done) }
  // 走到这里 = 没有别的红因、也没有在跑的作业，只是三场没跑齐。两档给两个码：
  //   `done === 0` ⇒ 三场一个都没登记（今天还没开工）；`done > 0` ⇒ 开了工但没跑齐。
  //   共用 `E_LOCAL_INCOMPLETE` 的时候这两种处境只有 `done=x/3` 的字面差别，读的人分不开。
  if (done.length === 0) {
    push(HEALTH_REASON_CODES.LOCAL_NOT_STARTED, `今天还没开工（三场一个都没登记，done=0/${NODE_KEYS.length}）`, localReadPath)
  } else {
    push(HEALTH_REASON_CODES.LOCAL_INCOMPLETE, `三场没跑齐（done=${done.length}/${NODE_KEYS.length}）`, localReadPath)
  }
  return { status: 'RED', reasons, progress: progressOf(done) }
}

/**
 * 读一份 JSON（**缺**与**坏**分得开；`present:false` 也带上路径，好让卡上给得出处）。
 *
 * @returns {{ok:boolean, code:string|null, value:unknown, path:string, message:string}}
 */
export function readJsonSource(file) {
  const target = path.resolve(String(file))
  if (!existsSync(target)) return { ok: false, code: 'E_DATA_MISSING', value: null, path: target, message: `文件不存在：${target}` }
  try {
    return { ok: true, code: null, value: JSON.parse(readFileSync(target, 'utf8')), path: target, message: '' }
  } catch (err) {
    return { ok: false, code: 'E_DATA_CORRUPT', value: null, path: target, message: `不是可解析 JSON（${String(err?.message).slice(0, 120)}）：${target}` }
  }
}

/**
 * 读**工作区那一侧**的四份来源（`:local` / `:daily` / `:receipt` / `:route`）—— `health.mjs` 的"读取器"那一半。
 *
 * 回执落点：优先用本地状态 `technical.receipt_path`（`local-receipt-set` 登记过就用它），
 * 否则取 B3.2 的默认 `<team>\leader\<day>\技术复盘回执.json`。
 *
 * @param {{teamDir:string, day:string, receiptPath?:string|null}} spec
 * @returns {{local:object|null, daily:object|null, receipt:object|null, route:object|null,
 *            reads:{local:object, daily:object, receipt:object, route:object}, receipt_path:string}}
 */
export function readWorkspaceHealthSources(spec = {}) {
  const teamDir = path.resolve(String(spec.teamDir))
  const day = String(spec.day)
  const localRead = readJsonSource(path.join(teamDir, 'state', 'local', `${day}.json`))
  const dailyRead = readJsonSource(path.join(teamDir, 'state', 'daily', `${day}.json`))
  const routeRead = readJsonSource(path.join(teamDir, 'route', 'current.json'))
  const registered = isFilledString(spec.receiptPath) ? String(spec.receiptPath).trim()
    : (isFilledString(localRead.value?.technical?.receipt_path) ? String(localRead.value.technical.receipt_path).trim() : null)
  const receiptRel = registered ?? path.join('leader', day, '技术复盘回执.json').replace(/\\/g, '/')
  const receiptRead = readJsonSource(path.join(teamDir, receiptRel.replace(/\//g, path.sep)))
  const src = (read) => ({ ok: read.ok, code: read.code, path: read.path })
  return {
    local: localRead.ok ? localRead.value : null,
    daily: dailyRead.ok ? dailyRead.value : null,
    receipt: receiptRead.ok ? receiptRead.value : null,
    route: routeRead.ok ? routeRead.value : null,
    receipt_path: receiptRead.path,
    reads: { local: src(localRead), daily: src(dailyRead), receipt: src(receiptRead), route: src(routeRead) },
  }
}

/**
 * 锚点核对（**读取器**）：技术节点的 `report_sha256` 必须等于报告**盘上字节**的哈希。
 *
 * · 报告文件不在盘上 ⇒ **不判**（锚点无从核对；这一条在 C-1 的规则表里没有，不许凭空判红）；
 * · 在盘上但对不上 ⇒ 一条 `E_RECEIPT_HASH` 的 reason 素材（"改报告一字即红"的载体）。
 *
 * @returns {Array<{code:string, detail:string, source_path:string|null}>}
 */
export function receiptAnchorProblems(workspace, localState) {
  const node = isObject(localState?.technical) ? localState.technical : null
  if (node === null || !isFilledString(node.report_path) || !isFilledString(node.report_sha256)) return []
  const root = path.resolve(String(workspace))
  const abs = path.resolve(root, String(node.report_path).replace(/\//g, path.sep))
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    return [{ code: HEALTH_REASON_CODES.RECEIPT_HASH, detail: `技术报告路径逃出了工作区：${node.report_path}`, source_path: abs }]
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) return []
  const actual = createHash('sha256').update(readFileSync(abs)).digest('hex')
  if (actual.toLowerCase() === String(node.report_sha256).trim().toLowerCase()) return []
  return [{
    code: HEALTH_REASON_CODES.RECEIPT_HASH,
    detail: `技术报告盘上字节与状态里的锚点对不上（登记 ${String(node.report_sha256).slice(0, 12)}…，盘上 ${actual.slice(0, 12)}…）—— 锚点来自作业产物，不来自回执自报`,
    source_path: abs,
  }]
}

/**
 * 装一张健康卡（B3.6 的字段表）。
 *
 * @param {object} spec `{input, verdict, extra}`；`extra` 里放 `open_adopted_tickets` / `distribution` / `health_path`
 * @returns {object} 要落盘的 `health.json` 对象
 */
export function buildHealthCard(spec = {}) {
  const input = spec.input ?? {}
  const verdict = spec.verdict ?? { status: 'RED', reasons: [] }
  const extra = spec.extra ?? {}
  const report = isObject(input.report) ? input.report : null
  return {
    schema: 1,
    day: input.day ?? null,
    project: input.project ?? null,
    status: verdict.status,
    reasons: verdict.reasons,
    checked_at: isFilledString(input.now) ? input.now : clockNow().toISOString(),
    now_file: process.env.AGENIA_NOW_FILE ?? null,
    paths: {
      snapshot: input?.reads?.snapshot?.path ?? null,
      state: input?.reads?.state?.path ?? null,
      local: input?.reads?.local?.path ?? null,
      receipt: input?.reads?.receipt?.path ?? null,
      route: input?.reads?.route?.path ?? null,
    },
    open_adopted_tickets: Array.isArray(extra.open_adopted_tickets) ? extra.open_adopted_tickets : [],
    distribution: Array.isArray(extra.distribution) ? extra.distribution : distributionOf([]),
    ...(isFilledString(extra.health_path) ? { health_path: String(extra.health_path) } : {}),
    ...(report === null ? {} : { report_day: report.day ?? null }),
  }
}
