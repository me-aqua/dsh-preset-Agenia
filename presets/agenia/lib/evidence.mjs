/**
 * 老板证据（boss approval evidence）—— 形状、绑定校验、唯一性键。
 *
 * 冻结依据：提案 §B1.5（签名即契约：`validateBossEvidence(evidence, {transition, usedEvidenceKeys})`
 *   → `{ok, code}` 与 `evidenceKey(evidence)`）· §B3.5（形状表 + **七场景**判定表 + 唯一性键）·
 *   拍板 Q4（`occurred_at: null` + `occurred_at_note`，校验器只报 **WARN**，**不许编时间**）·
 *   追加裁定 A6（`transition_id` 由 updater 在提议切换时生成并回填 —— **调用方不预填**）·
 *   追加裁定 v1.4 E-B5（手动重做的老板点名证据 ⇒ `E_REDO_NOT_AUTHORIZED`）。
 *
 * 四条口径（本文件里每一处都照它写）：
 *   ① **"是不是他嘴里的话"先判**，字段齐不齐后判 —— 转述（"组长复述：老板同意了"）与
 *      "拿 log 行冒充原话"（`kind==='quote'` 但 `source_kind!=='dsh-session'`）都归 `E_EVIDENCE_TRANSCRIBED`，
 *      不因为同一条记录还缺别的字段就改报别的码（§B3.5 场景②的判据在这里，测试给正反例）。
 *   ② **形状不齐 ⇒ `E_EVIDENCE_MISSING`（"当作没有"）**：§B1.5 把返回码冻死在那五个里，
 *      所以本模块**不新造码** —— 一份字段不全的证据等于没有证据。
 *   ③ **`occurred_at` 只报 WARN、不报 FAIL**：`null` 是拍板 Q4 认可的合法值（本轮 GO 的确切时刻没落盘），
 *      缺 `occurred_at_note` 时给 `warning` 而不给 `code` —— "不许编时间"这条纪律就落在这里。
 *   ④ **唯一性键不含 from/to**：`evidenceKey = source_session_id + '#' + (occurred_at ?? 'null') + '#' +
 *      sha256(verbatim).slice(0,16)`（§B3.5 逐字）。同一句原话换个阶段再说一遍，**还是同一条证据** ⇒ `E_EVIDENCE_USED`。
 *
 * ⚠️ 本模块**不读盘、不写盘、不看时钟** —— 它是纯函数；"这条键用过没有"由调用方把
 *    `usedEvidenceKeys` 喂进来（updater 从 `route/evidence/used-keys.json` 读）。
 */
import { createHash } from 'node:crypto'

/** `kind` 的两档（§B3.5 形状表）：`quote` = 老板原话；`action` = 可观察动作。 */
export const BOSS_EVIDENCE_KINDS = Object.freeze(['quote', 'action'])

/** `source_kind` 的三档；**本轮 GO 必须是 `dsh-session`**（§B3.5 逐字）。 */
export const BOSS_EVIDENCE_SOURCE_KINDS = Object.freeze(['dsh-session', 'log-line', 'screenshot'])

/** 本模块会返回的五个码（§B1.5 冻死的清单；外加上层自己的 `E_ARG_SCHEMA`）。 */
export const EVIDENCE_CODES = Object.freeze({
  MISSING: 'E_EVIDENCE_MISSING',
  TRANSCRIBED: 'E_EVIDENCE_TRANSCRIBED',
  TIME: 'E_EVIDENCE_TIME',
  NOT_MATCH: 'E_EVIDENCE_NOT_MATCH',
  USED: 'E_EVIDENCE_USED',
})

/** §B3.5 的唯一性键里那个"没时间"的占位（`occurred_at ?? 'null'`，逐字）。 */
export const NULL_TIME_KEY = 'null'

/** ISO8601 **带时区偏移**（`Z` 或 `±HH:MM`）—— 与 `lib/clock.mjs` 同一个形状。 */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/**
 * "这是转述"的字样（§B3.5 场景②的判据写在实现里）。
 * 只认**明确在转述**的说法，不做"含 go/ok 就拒"那种宽判 —— 本轮那条合法原话里就有 `go`。
 */
const PARAPHRASE_RE = /转述|复述|转达|据(他|老板)说|听说|老板(说|表示|称|觉得)(可以|同意|没问题|批准|行)/

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isFilledString = (v) => typeof v === 'string' && v.trim() !== ''

function verdict(ok, code, message, extra = {}) {
  return { ok, code: ok ? null : code, message, key: null, warning: null, ...extra }
}

/**
 * 这条证据指向"哪一次提交"—— 唯一性键（§B3.5 逐字）。
 *
 * ⚠️ `verbatim` 只吃字符串；非字符串（`undefined` / 数字）一律当空串参与哈希
 *    —— 键必须是**算得出来**的，不能因为一条坏输入就抛。
 */
export function evidenceKey(evidence) {
  const session = evidence?.source_session_id
  const at = evidence?.occurred_at
  const verbatim = typeof evidence?.verbatim === 'string' ? evidence.verbatim : ''
  const digest = createHash('sha256').update(verbatim, 'utf8').digest('hex').slice(0, 16)
  return `${session === null || session === undefined || session === '' ? NULL_TIME_KEY : String(session)}#${at === null || at === undefined || at === '' ? NULL_TIME_KEY : String(at)}#${digest}`
}

/**
 * 时间形状判定（§B3.5 `occurred_at` 那一行 + 拍板 Q4）。
 *
 * @returns {{ok:boolean, code:string|null, warning:string|null, message:string}}
 *   · `null` ⇒ ok，缺 note 时给 `warning`（**不是** FAIL）；
 *   · ISO8601 带偏移 ⇒ ok；
 *   · 别的字符串 / 缺键 ⇒ `E_EVIDENCE_TIME`（缺键也算"时间形状不成立"，
 *     因为 §B3.5 把 `occurred_at` 列成必填，而"必填"的合法缺省只有一个：显式 `null`）。
 */
export function evidenceTimeVerdict(evidence) {
  if (!isObject(evidence) || !Object.hasOwn(evidence, 'occurred_at')) {
    return { ok: false, code: EVIDENCE_CODES.TIME, warning: null, message: 'evidence 缺 `occurred_at` —— 要么给 ISO8601 带偏移，要么显式 `null` + `occurred_at_note`（拍板 Q4）' }
  }
  const at = evidence.occurred_at
  if (at === null) {
    const note = evidence.occurred_at_note
    return {
      ok: true,
      code: null,
      warning: isFilledString(note) ? null : 'WARN_EVIDENCE_TIME_NOTE_MISSING',
      message: isFilledString(note) ? '' : 'occurred_at 为 null 但没给 occurred_at_note —— 只报 WARN，**不许编时间**（拍板 Q4）',
    }
  }
  if (typeof at === 'string' && ISO_WITH_OFFSET.test(at)) return { ok: true, code: null, warning: null, message: '' }
  return { ok: false, code: EVIDENCE_CODES.TIME, warning: null, message: `occurred_at 必须是 ISO8601 带时区偏移的字符串或 null，实得 ${JSON.stringify(at)}` }
}

/**
 * 形状判定（§B3.5 形状表的必填项）—— 只判"这份记录像不像一条证据"，不判绑定、不判唯一性。
 *
 * @param {object} evidence
 * @param {{requireSourceKind?:boolean, requireKind?:boolean}} [options]
 *   `requireSourceKind` 默认 true（阶段切换那条路要求 `dsh-session`）；
 *   手动重做那条路（E-B5）原文只点了"原话/动作 + source_session_id + occurred_at" ⇒ 那边关掉它。
 */
export function evidenceShapeVerdict(evidence, options = {}) {
  const { requireSourceKind = true, requireKind = true } = options ?? {}
  if (!isObject(evidence)) return verdict(false, EVIDENCE_CODES.MISSING, `evidence 必须是对象，实得 ${JSON.stringify(evidence)}`)
  if (requireKind && !BOSS_EVIDENCE_KINDS.includes(evidence.kind)) {
    return verdict(false, EVIDENCE_CODES.MISSING, `evidence.kind 必须是 ${BOSS_EVIDENCE_KINDS.join(' | ')}，实得 ${JSON.stringify(evidence.kind)}`)
  }
  if (!requireKind && evidence.kind !== undefined && !BOSS_EVIDENCE_KINDS.includes(evidence.kind)) {
    return verdict(false, EVIDENCE_CODES.MISSING, `evidence.kind 给错了：${JSON.stringify(evidence.kind)}（要么不写，要么是 ${BOSS_EVIDENCE_KINDS.join(' | ')}）`)
  }
  if (!isFilledString(evidence.verbatim)) {
    return verdict(false, EVIDENCE_CODES.MISSING, 'evidence.verbatim 必填（老板原话 / 动作要点），不许空')
  }
  if (!isFilledString(evidence.source_session_id)) {
    return verdict(false, EVIDENCE_CODES.MISSING, 'evidence.source_session_id 必填（DSH 会话 id，形如 session-…）')
  }
  if (requireSourceKind && !BOSS_EVIDENCE_SOURCE_KINDS.includes(evidence.source_kind)) {
    return verdict(false, EVIDENCE_CODES.MISSING, `evidence.source_kind 必须是 ${BOSS_EVIDENCE_SOURCE_KINDS.join(' | ')}，实得 ${JSON.stringify(evidence.source_kind)}`)
  }
  return evidenceTimeVerdict(evidence)
}

/**
 * 阶段切换的老板门槛判定 —— §B3.5 七个场景里属于证据本身的五个（①②④⑤，以及合法的③）。
 *
 * @param {object|null|undefined} evidence 调用方给的那份证据（`stage-enter` 的 `payload.evidence`）
 * @param {object} [options]
 * @param {{from_stage_id?:string, to_stage_id?:string, transition_id?:string|null}} [options.transition]
 *   本次切换的 from/to（可带我们**将要**生成的 `transition_id`）。
 * @param {Iterable<string>} [options.usedEvidenceKeys] 已经用过的键（updater 从盘上读）
 * @returns {{ok:boolean, code:string|null, message:string, key:string|null, warning:string|null}}
 *
 * 判定顺序（测试给的是正反例，所以顺序本身也是判据）：
 *   不加证据 ⇒ ①MISSING · 转述 ⇒ ②TRANSCRIBED · 形状不齐 ⇒ MISSING（"当作没有"）·
 *   时间形状 ⇒ TIME（`null` 只 WARN）· 键用过/自己标了 used ⇒ ④USED · from/to 张冠李戴 ⇒ ⑤NOT_MATCH。
 */
export function validateBossEvidence(evidence, { transition = {}, usedEvidenceKeys = [] } = {}) {
  // ① 老板门槛要关当前阶段，却没给证据。
  if (evidence === null || evidence === undefined) {
    return verdict(false, EVIDENCE_CODES.MISSING, '当前大阶段的 boss_gate 要求老板批准，但没有 evidence —— 阶段切换只认老板证据')
  }
  if (!isObject(evidence)) {
    return verdict(false, EVIDENCE_CODES.MISSING, `evidence 必须是对象，实得 ${JSON.stringify(evidence)}`)
  }

  // ② 转述 / 拿非会话来源冒充原话 —— 先判，因为这一条问的是"这话是不是他说的"。
  const verbatim = typeof evidence.verbatim === 'string' ? evidence.verbatim : ''
  if (verbatim !== '' && PARAPHRASE_RE.test(verbatim)) {
    return verdict(false, EVIDENCE_CODES.TRANSCRIBED, `evidence.verbatim 是转述（命中转述字样）：${JSON.stringify(verbatim.slice(0, 60))} —— 要的是他嘴里的话，不是"老板同意了"`)
  }
  if (evidence.kind === 'quote' && evidence.source_kind !== 'dsh-session') {
    return verdict(false, EVIDENCE_CODES.TRANSCRIBED, `kind='quote' 的原话必须来自 DSH 会话（source_kind='dsh-session'），实得 source_kind=${JSON.stringify(evidence.source_kind)} —— log 行/截图不算原话`)
  }

  // 形状（含时间形状）。
  const shape = evidenceShapeVerdict(evidence)
  if (!shape.ok) return verdict(false, shape.code, shape.message)
  const warning = shape.warning ?? null
  const key = evidenceKey(evidence)

  // ④ 唯一性：键用过、或这条自己已经标了 `used:true`（§B3.5："提交即 true"）。
  const used = new Set()
  for (const k of usedEvidenceKeys ?? []) used.add(String(k))
  if (used.has(key)) {
    return verdict(false, EVIDENCE_CODES.USED, `这条证据已经用过了（evidenceKey=${key}）—— 同一条原话只能支起一次切换`, { key, warning })
  }
  if (evidence.used === true) {
    return verdict(false, EVIDENCE_CODES.USED, `evidence.used 已经是 true（used_in_transition_id=${JSON.stringify(evidence.used_in_transition_id ?? null)}）—— 用过的证据不许再提交`, { key, warning })
  }

  // ⑤ 绑定：属于另一次切换 / 另一个阶段 —— 一律 NOT_MATCH。
  const wants = { from_stage_id: transition?.from_stage_id ?? null, to_stage_id: transition?.to_stage_id ?? null }
  for (const field of ['from_stage_id', 'to_stage_id']) {
    const got = evidence[field]
    if (got === undefined || got === null || got === '') continue // 没写 ⇒ 由 updater 回填（A6 同一条精神）
    if (wants[field] !== null && String(got) !== String(wants[field])) {
      return verdict(false, EVIDENCE_CODES.NOT_MATCH, `evidence.${field}=${JSON.stringify(got)} 与本次切换的 ${field}=${JSON.stringify(wants[field])} 不一致 —— 张冠李戴的证据不算数`, { key, warning })
    }
  }
  const tid = transition?.transition_id
  if (isFilledString(evidence.transition_id) && isFilledString(tid) && evidence.transition_id !== tid) {
    return verdict(false, EVIDENCE_CODES.NOT_MATCH, `evidence.transition_id=${JSON.stringify(evidence.transition_id)} 不属于本次切换（${tid}）`, { key, warning })
  }

  return { ok: true, code: null, message: '', key, warning }
}

/**
 * 手动重做的老板点名证据（追加裁定 v1.4 E-B5）。
 *
 * 原文口径：`redo:true` 必须同时带 `previous_attempt_id` 与 `boss_redo_evidence`
 * （**原话/动作 + source_session_id + occurred_at**）；缺一样 ⇒ `E_REDO_NOT_AUTHORIZED`（exit 5）。
 *
 * ⚠️ 这一条**不**走 §B3.5 的 from/to 绑定（重做不是阶段切换），也**不**查唯一性键
 *    —— 重做的"同一句话只能批一次"由 generation/attempt 那条链管（见 `lib/state.mjs`）。
 */
export function validateRedoEvidence({ previous_attempt_id: previousAttemptId, boss_redo_evidence: evidence } = {}) {
  if (!isFilledString(previousAttemptId)) {
    return { ok: false, code: 'E_REDO_NOT_AUTHORIZED', message: '手动重做必须带 `previous_attempt_id`（要作废的是哪一次 attempt）' }
  }
  if (!isObject(evidence)) {
    return { ok: false, code: 'E_REDO_NOT_AUTHORIZED', message: '手动重做必须带 `boss_redo_evidence`（老板点名的原话/动作）—— 没有它就不许重做' }
  }
  const shape = evidenceShapeVerdict(evidence, { requireSourceKind: false, requireKind: false })
  if (!shape.ok) {
    return { ok: false, code: 'E_REDO_NOT_AUTHORIZED', message: `boss_redo_evidence 不成形状：${shape.message}` }
  }
  return { ok: true, code: null, key: evidenceKey(evidence), warning: shape.warning ?? null, message: '' }
}

/**
 * 把一条证据**补成提交后的记录**（§B3.5：`transition_id` 由 updater 在提议切换时生成并回填，A6）。
 *
 * ⚠️ 调用方**不预填** `transition_id` —— 这里才是它被写进去的唯一地方；
 *    `used` / `used_in_transition_id` 同样在这一刻落成（"提交即 true"）。
 */
export function spentEvidenceRecord(evidence, { transitionId, fromStageId, toStageId, spentAt, key = null }) {
  const base = isObject(evidence) ? evidence : {}
  return {
    schema: 1,
    kind: base.kind ?? null,
    verbatim: typeof base.verbatim === 'string' ? base.verbatim : '',
    source_session_id: base.source_session_id ?? null,
    source_kind: base.source_kind ?? null,
    occurred_at: Object.hasOwn(base, 'occurred_at') ? base.occurred_at : null,
    occurred_at_note: base.occurred_at_note ?? null,
    from_stage_id: base.from_stage_id ?? fromStageId,
    to_stage_id: base.to_stage_id ?? toStageId,
    transition_id: transitionId,
    used: true,
    used_in_transition_id: transitionId,
    recorded_by: base.recorded_by ?? null,
    evidence_key: key ?? evidenceKey(base),
    spent_at: spentAt,
  }
}
