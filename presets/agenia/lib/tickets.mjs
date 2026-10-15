/**
 * 票（ticket）—— schema、状态机、关闭证据、void 重呈现。
 *
 * 冻结依据：提案 §B1.5（签名即契约：`validateTicket(ticket, {existingIds, findingsSet})` ·
 *   `canTransition(from, to)` · `closeEvidenceVerdict(ticket, evidence)` · `voidVerdict(ticket, payload)`）
 *   · §B3.3（在 v5 §8.3 的字段上补 `closure_evidence` / `void_reason` / `re_present` / `closed_at`）
 *   · 追加裁定 **C-3**（票的终态：`open→in_progress|void` · `in_progress→done|void` ·
 *     `done`/`void` 是终态；**`open→done` 必须为 false**）。
 *
 * 五条口径：
 *   ① **状态机是一张表**（`TICKET_TRANSITIONS`），不散在 if 里 —— 断言矩阵直接对着它读。
 *      `open→done` 为假是刻意的：关票要有验收证据，跳过 `in_progress` 就等于绕开那条证据要求。
 *   ② **关闭证据三非空**：`kind`（枚举）· `ref` · `sha256` 各非空 —— 缺一样就是
 *      `E_TICKET_EVIDENCE_MISSING`（§B3.3："`status==='done'` 时必填且三个非空"）。
 *   ③ **void 必附两样**：具体理由（≥10 字，不许"不做"这种空泛话）与**重呈现位置**
 *      （`re_present.ref` / `re_present.at`）—— 先判理由，再判重呈现（报文要指得出缺哪一样）。
 *   ④ **void 不销毁证据**：票记录原地留着（`void_reason` / `re_present` / `closed_at` 都写进去），
 *      而且**重呈现可以再来一次** —— 再来时把上一条挤进 `re_present_history[]`，
 *      当前指针换成新的。**一条都不许丢**（"重呈现后可再呈现"）。
 *   ⑤ **纯函数**：本模块不读盘、不写盘、不看时钟 —— "现在"由调用方给（`lib/clock.mjs` 是唯一入口）。
 */
// 字符尺子**只有一把**：`lib/memory.mjs` 的 code point 口径（§B3.4）。
// void 理由那 10 字的下限与"记忆条目多少字符"必须是同一把尺子 —— 两处各写一份迟早分叉。
import { charCountOf } from './memory.mjs'

/** 票的四个状态（v5 §8.3 原样 + B3.3 的 `void`）。 */
export const TICKET_STATUSES = Object.freeze(['open', 'in_progress', 'done', 'void'])

/** 终态：不可回退（C-3）。要回退 ⇒ 新票 + `superseded_by`（B3.3）。 */
export const TICKET_TERMINAL_STATUSES = Object.freeze(['done', 'void'])

/** **C-3 那张表**（逐字）：`open→in_progress|void` · `in_progress→done|void` · `done`/`void` 无出边。 */
export const TICKET_TRANSITIONS = Object.freeze({
  open: Object.freeze(['in_progress', 'void']),
  in_progress: Object.freeze(['done', 'void']),
  done: Object.freeze([]),
  void: Object.freeze([]),
})

/** 关闭证据的五种 `kind`（§B3.3 逐字）。 */
export const CLOSURE_KINDS = Object.freeze(['code-change', 'test-run', 'receipt', 'doc-update', 'manual-verification'])

/** void 理由的下限（§B3.3："每条 finding 至少 10 字"、不许空泛）。 */
export const VOID_REASON_MIN_CHARS = 10

/** 票的来源形状：`technical-review:<报告 sha256>#<finding id>`（§B3.2/§B3.3）。 */
const SOURCE_RE = /^technical-review:([0-9a-fA-F]{64})#([A-Za-z0-9._-]+)$/

/** 来源前缀（`openAdoptedTicketIds` 认这个）。 */
export const REVIEW_SOURCE_PREFIX = 'technical-review:'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isFilledString = (v) => typeof v === 'string' && v.trim() !== ''
const ok = () => ({ ok: true, code: null, message: '' })
const bad = (code, message) => ({ ok: false, code, message })

/** 字符数按 **Unicode code point** 数 —— 尺子在 `lib/memory.mjs`（§B3.4），这里只转手。 */
export { charCountOf }

/** 正常化一条来源字符串里的摘要大小写不敏感比较用（只用于比对，不改写任何值）。 */
export function sourceVerdict(source) {
  if (!isFilledString(source)) return bad('E_TICKET_SOURCE_BAD', `票的 source 必填（形状 technical-review:<报告 sha256>#<finding id>），实得 ${JSON.stringify(source)}`)
  const m = SOURCE_RE.exec(source)
  if (m === null) {
    return bad('E_TICKET_SOURCE_BAD', `票的 source 形状不对：${JSON.stringify(source)} —— 要能指到报告（64 hex）与 finding（#F1 这样的 id）`)
  }
  return { ok: true, code: null, message: '', report_sha256: m[1].toLowerCase(), finding_id: m[2] }
}

/** 票的 id 形状：`ticket-<YYYYMMDD>-<NN>`（B3.3 的示例；生成见 `nextTicketId`）。 */
export function nextTicketId(tickets, dayKey) {
  const taken = new Set((tickets ?? []).map((t) => t?.id))
  const prefix = `ticket-${dayKey}-`
  let seq = (tickets ?? []).filter((t) => typeof t?.id === 'string' && t.id.startsWith(prefix)).length + 1
  // 撞名就往下挪（re-init / 手工补票都可能让"个数"对不上"序号"）。
  while (taken.has(`${prefix}${String(seq).padStart(2, '0')}`)) seq += 1
  return `${prefix}${String(seq).padStart(2, '0')}`
}

/** 一条**新票**的完整记录（v5 §8.3 的字段 + B3.3 的四个新字段，一次成型）。 */
export function newTicketRecord({ id, title, source, next_step: nextStep, acceptance, at, supersedes = null }) {
  return {
    schema: 1,
    id,
    title,
    source,
    next_step: nextStep,
    acceptance,
    status: 'open',
    supersedes,
    created_at: at,
    last_update: at,
    closure_evidence: null,
    void_reason: null,
    re_present: null,
    re_present_history: [],
    closed_at: null,
  }
}

/**
 * **C-3 状态机**：这一步转得动吗。
 *
 * @returns {boolean} 合法 ⇒ `true`；非法（含未知状态、原地不动）⇒ `false`。
 *   `open→done` 是 `false`（C-3 明写）—— 关票要证据，不许跳过 `in_progress`。
 */
export function canTransition(from, to) {
  const allowed = TICKET_TRANSITIONS[from]
  if (!Array.isArray(allowed)) return false
  return allowed.includes(to)
}

/**
 * 关闭证据判定（§B3.3）。
 *
 * @param {object} ticket 要关的那张票（本函数只读它的 id 用于报文）
 * @param {object|null} evidence `{kind, ref, sha256, note, closed_at}`
 * @returns {{ok:boolean, code:string|null, message:string}}
 *   `kind` / `ref` / `sha256` **三个非空**且 `kind` 在枚举里 ⇒ 通过；
 *   否则 `E_TICKET_EVIDENCE_MISSING`（"done 必有验收证据"）。
 */
export function closeEvidenceVerdict(ticket, evidence) {
  const id = ticket?.id ?? '(未知票)'
  if (!isObject(evidence)) {
    return bad('E_TICKET_EVIDENCE_MISSING', `${id} 要关成 done，必须给 closure_evidence（kind/ref/sha256 三样非空）`)
  }
  if (!CLOSURE_KINDS.includes(evidence.kind)) {
    return bad('E_TICKET_EVIDENCE_MISSING', `${id} 的 closure_evidence.kind 必须是 ${CLOSURE_KINDS.join(' | ')}，实得 ${JSON.stringify(evidence.kind)}`)
  }
  for (const field of ['ref', 'sha256']) {
    if (!isFilledString(evidence[field])) {
      return bad('E_TICKET_EVIDENCE_MISSING', `${id} 的 closure_evidence.${field} 必填且非空，实得 ${JSON.stringify(evidence[field])}`)
    }
  }
  return ok()
}

/**
 * void 的理由判定（§B3.3：必填、每条至少 10 字、不许空泛）。
 *
 * @returns {{ok:boolean, code:string|null, message:string}}
 */
export function voidReasonVerdict(ticket, payload) {
  const id = ticket?.id ?? '(未知票)'
  const reason = payload?.void_reason
  if (!isFilledString(reason)) {
    return bad('E_TICKET_VOID_REASON', `${id} 要 void，必须给 void_reason（说清为什么这张票不做了），实得 ${JSON.stringify(reason)}`)
  }
  if (charCountOf(reason.trim()) < VOID_REASON_MIN_CHARS) {
    return bad('E_TICKET_VOID_REASON', `${id} 的 void_reason 只有 ${charCountOf(reason.trim())} 字（下限 ${VOID_REASON_MIN_CHARS}）—— "不做"这种空泛话不算理由`)
  }
  return ok()
}

/**
 * void 的重呈现判定（§B3.3：`status==='void'` 时必填 —— 指向 void 之后重新呈现的位置）。
 *
 * @returns {{ok:boolean, code:string|null, message:string}}
 */
export function voidRePresentVerdict(ticket, payload) {
  const id = ticket?.id ?? '(未知票)'
  const re = payload?.re_present
  if (!isObject(re)) {
    return bad('E_TICKET_VOID_REPRESENT', `${id} 要 void，必须给 re_present（void 之后这件事在哪儿重新呈现：新票/回执/报告），实得 ${JSON.stringify(re)}`)
  }
  for (const field of ['ref', 'at']) {
    if (!isFilledString(re[field])) {
      return bad('E_TICKET_VOID_REPRESENT', `${id} 的 re_present.${field} 必填且非空，实得 ${JSON.stringify(re[field])}`)
    }
  }
  return ok()
}

/**
 * void 的完整判定：**先理由、后重呈现**（报文要指得出缺哪一样）。
 *
 * @param {object} ticket 要 void 的那张票
 * @param {{void_reason?:string, re_present?:{ref:string, at:string, note?:string}}} payload
 * @returns {{ok:boolean, code:'E_TICKET_VOID_REASON'|'E_TICKET_VOID_REPRESENT'|null, message:string}}
 */
export function voidVerdict(ticket, payload) {
  const reason = voidReasonVerdict(ticket, payload)
  if (!reason.ok) return reason
  return voidRePresentVerdict(ticket, payload)
}

/**
 * 票记录的完整校验（§B1.5 冻结签名）。
 *
 * @param {object} ticket 一张票的记录（`newTicketRecord` 那个形状）
 * @param {{existingIds?:string[], findingsSet?:Iterable<string>|null}} [options]
 *   · `existingIds` = 库里已有的 id ⇒ 撞上就是 `E_TICKET_DUP`（补差/接手也只许复用，不许重开）；
 *   · `findingsSet` = 报告里真实存在的 finding id 集合；**给了才查**（`null` = 这一步不查，
 *     例如路线 updater 手上没有 findings 文件）。
 * @returns {{ok:boolean, code:string|null, message:string}}
 */
export function validateTicket(ticket, { existingIds = [], findingsSet = null } = {}) {
  if (!isObject(ticket)) return bad('E_ARG_SCHEMA', `票必须是对象，实得 ${JSON.stringify(ticket)}`)

  for (const [field, why] of [['id', '票号'], ['title', '标题'], ['source', '来源'], ['next_step', '下一步'], ['acceptance', '验收口径']]) {
    if (!isFilledString(ticket[field])) return bad('E_ARG_SCHEMA', `${why}（${field}）必填且非空，实得 ${JSON.stringify(ticket[field])}`)
  }
  if (!TICKET_STATUSES.includes(ticket.status)) {
    return bad('E_TICKET_STATUS', `status 必须是 ${TICKET_STATUSES.join(' | ')}，实得 ${JSON.stringify(ticket.status)}`)
  }
  // 形状与"在不在"分开：`source` 写了但形状不对 ⇒ `E_TICKET_SOURCE_BAD`（缺它上面已经按 E_ARG_SCHEMA 报了）。
  const src = sourceVerdict(ticket.source)
  if (!src.ok) return src
  if (findingsSet !== null && findingsSet !== undefined) {
    const set = findingsSet instanceof Set ? findingsSet : new Set(findingsSet)
    if (!set.has(src.finding_id)) {
      return bad('E_TICKET_SOURCE_BAD', `票的 source 指向 ${src.finding_id}，但报告里没有这条 finding（findingsSet 里有 ${[...set].slice(0, 8).join(',') || '（空）'}）`)
    }
  }
  const taken = new Set((existingIds ?? []).map((v) => String(v)))
  if (taken.has(String(ticket.id))) {
    return bad('E_TICKET_DUP', `票号 ${ticket.id} 已经存在 —— 同一张票不许重开（要补差就在原票上补，要换就 void 后再开新票）`)
  }

  // 终态与它那两样必填项的自洽（§B3.3 的"何时必填"那一列）。
  if (ticket.status === 'done') {
    const close = closeEvidenceVerdict(ticket, ticket.closure_evidence)
    if (!close.ok) return close
  }
  if (ticket.status === 'void') {
    const v = voidVerdict(ticket, { void_reason: ticket.void_reason, re_present: ticket.re_present })
    if (!v.ok) return v
  }
  return ok()
}

/**
 * "还有哪些采纳票没关" —— §B3.3 的 `open_adopted_tickets`（P2-V1 口径：
 * **"技术复盘完成" ≠ "发现已解决"**，所以它必须**另立一个字段**，不许被 status=GREEN 掩盖）。
 *
 * ⚠️ 这个函数只回答"清单是什么"；"非空 ⇒ 卡上必须显示、且不许因此变绿"是 health 那一侧的判据
 *    （RCP-02 ⑤ / GUI-11），落在后面的 local/health 批次里。
 */
export function openAdoptedTicketIds(tickets) {
  return (tickets ?? [])
    .filter((t) => isObject(t) && !TICKET_TERMINAL_STATUSES.includes(t.status))
    .filter((t) => typeof t.source === 'string' && t.source.startsWith(REVIEW_SOURCE_PREFIX))
    .map((t) => String(t.id))
}
