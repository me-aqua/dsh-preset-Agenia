/**
 * bug 台账（任务 B1 / B2 / B3）—— 条目准入 · 两个词不混 · 五分支分流 · 封顶 50/30 ·
 * bug 任务形状 · 批次 · 严重三线与四出口 · 四个预注册样本 · 卡红。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版，冻结）
 *   §2.3（对象 → 账 · 五分支表 · 两个词不混 · 50/30 只数 `kind=bug` · 四出口 · 四个样本）
 *   §3.1 第 1/2/3/5/6/7 条 · §4.2（严重三线 · 四出口 · 两个作者 · 判不了 ⇒ 升级 + 卡红）
 *   §6.2（改样本 = 版本 + 旧样本留档、改后不许重判）。
 * 契约：`.team/test/CONTRACT-B.md` §3（条目）· §4（五分支）· §5（封顶）· §6（任务/批次/归档）
 *   §7（严重线）· §9.2（导出的八个名字）。
 *
 * 四条纪律：
 *   ① **纯函数**：不读盘、不写盘、不看时钟（时间一律由调用方给）—— 与 `lib/route.mjs` 同一条；
 *   ② **五关词表从 `lib/route.mjs` import**，不在这里另抄一份：bug 任务与路线任务共用同一套五关状态机
 *      （契约 §6.1：`方案` 这种"并集里有、五个正名里没有"的值也必须收 —— 另抄五个正名就是第二个真相）；
 *   ③ **两个词不混**：`disposition`（组长的处置：adopted / rejected / deferred）与
 *      `assessment`（测试岗的评估：true / false / duplicate / unknown）是两个集合；
 *      **entry 的 open/closed = 有无 disposition**，不是"评估为 true"（契约 §4.1）；
 *   ④ **判不了不许猜**：分流表判不了就拒；严重线判不了 ⇒ `escalate:true` + 卡红（不是静默保留 open）。
 *
 * ⚠️ 本文件**不认识 CLI**，也不认识 `.team/` 的路径：落点与读写全在 `bin/agenia-route.mjs` 那九个 op 里。
 */
import { FIVE_GATES, TASK_STATUSES, dayDigitsOf } from './route.mjs'

/** bug 台账的 schema 版本（契约 §2.2 冻结）。 */
export const BUG_LEDGER_SCHEMA = 1

// ── 闭集（契约 §3.1 / §4.1 / §7.1）──────────────────────────────────────────
/** 条目种类：**50/30 只数 `kind=bug`**；`observation` 是未建账期的临时载体（不计入）。 */
export const BUG_KINDS = Object.freeze(['bug', 'observation'])

/** 证据种类（契约 §3.1：`evidence = [{kind:'file'|'cmd'|'log', ref, note?}]`，≥1 条）。 */
export const BUG_EVIDENCE_KINDS = Object.freeze(['file', 'cmd', 'log'])

/** 载体 = 谁报的（不是谁写的）。登记人恒为组长，报告人只提供证据（定形 §3.1 第 1 条）。 */
export const SOURCE_CARRIERS = Object.freeze(['boss', 'report', 'test', 'leader'])

/** **disposition**（组长的处置）：`deferred` 是未建账期的暂缓（契约 §4.1）。 */
export const DISPOSITIONS = Object.freeze(['adopted', 'rejected', 'deferred'])

/** **assessment**（测试岗的评估）：`unknown` = 判不了 ⇒ 条目**保留 open、不清零**。 */
export const ASSESSMENTS = Object.freeze(['true', 'false', 'duplicate', 'unknown'])

/**
 * **真正做过判定**的那三个 verdict（`unknown` 不在里面）。
 *
 * 🔴 `unknown` 是"判不了"，不是"已评估"：SLA（契约 C2 §3.7.1）按"还没真正判定"算超期。
 *    把它算成已评估，一只超期 bug 就会静默变绿 —— 这是"判不了冒充处理过了"。
 */
export const ASSESSED_VERDICTS = Object.freeze(ASSESSMENTS.filter((v) => v !== 'unknown'))

/**
 * 一条条目**是否已经被评估过**（SLA 的豁免之一）。
 *
 * 判据只有一条：`assessment` 是个对象、且 `verdict` 落在那三个真判定里。
 * `null` / 缺键 / 形状坏 / `verdict:'unknown'` / `verdict` 缺失 ⇒ **没评估过**（保守读法：超期照算）。
 */
export function isAssessed(entry) {
  const assessment = entry?.assessment
  if (assessment === null || assessment === undefined || typeof assessment !== 'object' || Array.isArray(assessment)) return false
  return ASSESSED_VERDICTS.includes(assessment.verdict)
}

/** 封顶的两个数（定形 §3.1 第 7 条）：`bug_open >= 50` 红 · 最老 `> 30` 日历天红（契约 §5.2）。 */
export const CAP = Object.freeze({ bug_open: 50, days: 30 })

/** 严重三条线（定形 §4.2 逐字）：数据/库坏了 · 产品功能坏了（+复现步骤）· 读数说假话（只掩盖前两条时才算）。 */
export const SEVERITY_LINES = Object.freeze(['data_broken', 'function_broken_repro', 'reading_lies'])
/** 第四个出口 —— **不是第五桶**（装不进样本 ⇒ 升级老板）。 */
export const UNCLASSIFIED = 'unclassified'
/** 四出口闭集（契约 §7.2）。 */
export const SEVERITY_EXITS = Object.freeze([...SEVERITY_LINES, UNCLASSIFIED])

/** 严重线的"判不了"（与 bug 评估里的 `unknown` 是两个词，契约 §7.5）。 */
export const SEVERITY_CONFIDENCE = Object.freeze(['yes', 'no', 'cannot'])

/** 第三线必须有地基：`reading_lies` 只能掩盖前两条之一（定形 §4.2）。 */
export const THIRD_LINE_HIDES = Object.freeze(['data_broken', 'function_broken_repro'])

/** 样本的极性（正 / 负）。 */
export const SAMPLE_POLARITIES = Object.freeze(['positive', 'negative'])

/**
 * **四个预注册样本的形状**（定形 §6.2：正 / 负 / 第三线正 / 第三线负）——
 * 恰好这四个，且**必须**含第三线那一对；第三线正/负只代表它自己的线，不给未采样线赋值。
 */
export const SAMPLE_SET_SHAPE = Object.freeze([
  Object.freeze({ line: 'data_broken', polarity: 'positive' }),
  Object.freeze({ line: 'data_broken', polarity: 'negative' }),
  Object.freeze({ line: 'reading_lies', polarity: 'positive' }),
  Object.freeze({ line: 'reading_lies', polarity: 'negative' }),
])

/**
 * **被采样过的线**（`severityVerdict().calibrated` 的默认输入）。
 * 由上面那张表推出来，不另写一份：第二个线（`function_broken_repro`）没被采样 ⇒ `calibrated:false`。
 */
export const SAMPLED_LINES = Object.freeze([...new Set(SAMPLE_SET_SHAPE.map((s) => s.line))])

/** 五分支表的配方词闭集（契约 §4.2）。 */
export const RECIPE_WORDS = Object.freeze(['yes', 'no', 'intermittent'])

/** 条目必填的 14 个键（契约 §3.1；加性键不判名字）。 */
export const ENTRY_KEYS = Object.freeze([
  'id', 'kind', 'phenomenon', 'how_seen', 'evidence', 'recipe', 'reporter', 'author',
  'source', 'tags', 'registered_at', 'finding_refs', 'assessment', 'disposition',
])

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const filled = (v) => typeof v === 'string' && v.trim() !== ''
const ok = () => ({ ok: true, code: null, message: '' })
const bad = (code, message) => ({ ok: false, code, message })

// ── 条目（契约 §3）──────────────────────────────────────────────────────────
/**
 * **登记准入的判据**：现象非空 + 证据 ≥1 条 + `kind` 在闭集里；外加"谁写的"这一个事实（`author = leader`）。
 *
 * 🔴 **`recipe` 不是门槛**（契约 §3.2）：定形 §4.1 写的是「老板报的 bug 按「现象 + 证据」登记，
 *    **不要求配方**（不适用此表）」—— 本函数对 `recipe:null` 一律放行；编出来的配方才是假证据。
 *
 * @param {object} entry 已经组装好的条目（作者由写面强制成 `leader`）
 * @returns {{ok:boolean, code:string|null, message:string}}
 */
export function entryVerdict(entry) {
  if (!isObject(entry)) return bad('E_ARG_SCHEMA', `条目必须是对象，实得 ${JSON.stringify(entry)}`)
  if (!filled(entry.id)) return bad('E_ARG_SCHEMA', '条目 id 必填（台账内唯一、读两次不变）')
  if (!BUG_KINDS.includes(entry.kind)) {
    return bad('E_ARG_SCHEMA', `kind 只认 ${BUG_KINDS.join(' / ')}（闭集），实得 ${JSON.stringify(entry.kind)}`)
  }
  if (!filled(entry.phenomenon)) {
    return bad('E_ARG_SCHEMA', '现象（phenomenon）必填且非空 —— 登记准入的第一扇门（契约 §3.2：现象 + 证据）')
  }
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    return bad('E_ARG_SCHEMA', `evidence 必须 ≥1 条（"证据在哪"是登记准入的第二扇门），实得 ${JSON.stringify(entry.evidence)}`)
  }
  for (const [i, ev] of entry.evidence.entries()) {
    if (!isObject(ev) || !BUG_EVIDENCE_KINDS.includes(ev.kind) || !filled(ev.ref)) {
      return bad('E_ARG_SCHEMA', `evidence[${i}] 必须形如 {kind: ${BUG_EVIDENCE_KINDS.join('|')}, ref: 非空}，实得 ${JSON.stringify(ev)}`)
    }
  }
  if (entry.recipe !== null && entry.recipe !== undefined) {
    if (!isObject(entry.recipe)) return bad('E_ARG_SCHEMA', 'recipe 要么是 null，要么是 {steps, expected, actual}（**不要求**配方，不等于配方可以乱写）')
    if (!Array.isArray(entry.recipe.steps)) return bad('E_ARG_SCHEMA', 'recipe.steps 必须是数组')
  }
  if (!filled(entry.reporter)) return bad('E_ARG_SCHEMA', '报告人（reporter）必填 —— 报告人只提供证据，登记人恒为组长')
  if (entry.author !== 'leader') {
    return bad('E_ARG_SCHEMA', `条目的 author 必须是 "leader"（定形 §3.1 第 1 条：登记人 = 组长（代报告人）；entry 作者 = 组长），实得 ${JSON.stringify(entry.author)}`)
  }
  if (!isObject(entry.source) || !SOURCE_CARRIERS.includes(entry.source.carrier)) {
    return bad('E_ARG_SCHEMA', `source 必须形如 {carrier: ${SOURCE_CARRIERS.join('|')}, ref}，实得 ${JSON.stringify(entry.source)}`)
  }
  if (!Array.isArray(entry.tags) || entry.tags.some((t) => typeof t !== 'string')) {
    return bad('E_ARG_SCHEMA', `tags 必须是字符串数组（不加就空数组），实得 ${JSON.stringify(entry.tags)}`)
  }
  if (!filled(entry.registered_at)) return bad('E_ARG_SCHEMA', 'registered_at 必填（30/31 天那一格靠它）')
  if (entry.disposition !== null && entry.disposition !== undefined) {
    if (!isObject(entry.disposition) || !DISPOSITIONS.includes(entry.disposition.value)) {
      return bad('E_ARG_SCHEMA', `disposition 只认 ${DISPOSITIONS.join(' / ')}，实得 ${JSON.stringify(entry.disposition)}`)
    }
  }
  if (entry.assessment !== null && entry.assessment !== undefined) {
    if (!isObject(entry.assessment)) return bad('E_ARG_SCHEMA', 'assessment 要么是 null，要么是对象')
    if (entry.assessment.verdict !== null && !ASSESSMENTS.includes(entry.assessment.verdict)) {
      return bad('E_ARG_SCHEMA', `assessment.verdict 只认 ${ASSESSMENTS.join(' / ')}，实得 ${JSON.stringify(entry.assessment.verdict)}`)
    }
  }
  return ok()
}

/**
 * 把一次登记入参组装成**条目**（纯函数）。
 * 写面强制 `author = 'leader'`（调用方给什么都不认）—— "谁写的"不是入参。
 *
 * 🔴 `how_seen`（怎么撞见的）**记录但不设闸**（契约 §3.2 的准入只认"现象 + 证据"两样）：
 *    没给 ⇒ 存 `null`（没人问过），给了空串 ⇒ 存 `''`（问了、答的是空）—— 两者在台账里**分得开**
 *    （gate4 复审 BC-05：以前两种都落成 `''`，"没人问"和"答了空"长得一模一样）。
 */
export function composeBugEntry(payload, { at = null, ledger = null } = {}) {
  const p = isObject(payload) ? payload : {}
  const evidence = Array.isArray(p.evidence)
    ? p.evidence.map((ev) => (isObject(ev) ? {
      kind: ev.kind,
      ref: ev.ref,
      ...(ev.note === undefined ? {} : { note: ev.note }),
    } : ev))
    : p.evidence
  return {
    id: filled(p.id) ? p.id : nextEntryId(ledger, at),
    kind: p.kind,
    phenomenon: p.phenomenon,
    how_seen: typeof p.how_seen === 'string' ? p.how_seen : null,
    evidence,
    recipe: p.recipe === undefined ? null : p.recipe,
    reporter: p.reporter,
    author: 'leader',
    source: p.source === undefined ? { carrier: 'leader', ref: null } : p.source,
    tags: Array.isArray(p.tags) ? [...p.tags] : [],
    registered_at: at,
    finding_refs: Array.isArray(p.finding_refs) ? [...p.finding_refs] : [],
    assessment: null,
    disposition: null,
    escalated_at: null,
    card_red: false,
    /** 加性键：这一条属于哪一批（冻结之后登记的 ⇒ `null`，进下一批；定形 §3.1 第 2 条）。 */
    batch: null,
  }
}

/** 下一条目的 id：`bug-<YYYYMMDD>-<NN>`。日子那 8 位**从 `lib/route.mjs::dayDigitsOf` 派生**（唯一来源）。 */
export function nextEntryId(ledger, at) {
  const prefix = `bug-${dayDigitsOf(at ?? new Date(0))}-`
  const ids = [...(ledger?.entries ?? []), ...(ledger?.archived ?? [])].map((e) => String(e?.id ?? ''))
  let max = 0
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue
    const n = Number(id.slice(prefix.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`
}

// ── 封顶 50/30（契约 §5）───────────────────────────────────────────────────
/**
 * 账上的四个数（契约 §5.3：**恰好这四格** —— 票 open 不许从这里出）。
 * - `entry_open`：任意 kind 且无 disposition；
 * - `bug_open`：`kind=bug` 且无 disposition（**封顶只数这个**）；
 * - `observation_open`：`kind=observation` 且无 disposition；
 * - `archived`：已归档条数（它们已经有结论，不进 bug_open）。
 */
export function openCounts(ledger) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : []
  const open = (e) => (e?.disposition ?? null) === null
  return {
    entry_open: entries.filter(open).length,
    bug_open: entries.filter((e) => e?.kind === 'bug' && open(e)).length,
    observation_open: entries.filter((e) => e?.kind === 'observation' && open(e)).length,
    archived: Array.isArray(ledger?.archived) ? ledger.archived.length : 0,
  }
}

/** 一个本地日历日号（只吃"年月日"，不吃时分秒）—— 跨夏令时也不会把 30 天算成 29.*/
function localDayNumber(date) {
  const d = date instanceof Date ? date : new Date(date)
  const t = d.getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
}

/** 两个时刻之间的**本地日历日差**（`registered_at` 那一天 → 注入时钟那一天；契约 §5.2）。 */
export function calendarDayDiff(from, to) {
  const a = localDayNumber(from)
  const b = localDayNumber(to)
  return a === null || b === null ? null : b - a
}

/**
 * 封顶读数（契约 §5.3 冻结的形状）。
 *
 * 🔴 两个边界的读法（契约 §5.2，逐条可翻案）：
 *   · 50 —— 定形写「50 条 bug open」⇒ **达到就红**（`>= 50`）；
 *   · 30 —— 定形写「最老超过 30 天」⇒ **严格大于才红**（`> 30`），第 30 天不红。
 *
 * 🔴 `now` **必须由调用方给**（CLI 用注入时钟）。不给 ⇒ 年龄这一格**不判**（`oldest_age_days: 0`）——
 *    纯函数自己取"现在"会让一条断言在换台机器上翻面（`mig-test-05`）。
 *
 * @param {object} ledger
 * @param {{now?: Date|string|null}} [options]
 */
export function capVerdict(ledger, { now = null } = {}) {
  const openBugs = (Array.isArray(ledger?.entries) ? ledger.entries : [])
    .filter((e) => e?.kind === 'bug' && (e?.disposition ?? null) === null)
  const bugOpen = openBugs.length
  const overCount = bugOpen >= CAP.bug_open
  let oldest = 0
  if (now !== null && now !== undefined) {
    for (const e of openBugs) {
      const age = calendarDayDiff(e?.registered_at, now)
      if (age !== null && age > oldest) oldest = age
    }
  }
  const overAge = now !== null && now !== undefined && oldest > CAP.days
  const reasons = []
  if (overCount) reasons.push(`count: bug_open=${bugOpen} ≥ ${CAP.bug_open}`)
  if (overAge) reasons.push(`age: 最老一条 ${oldest} 天 > ${CAP.days} 天`)
  return {
    bug_open: bugOpen,
    threshold: CAP.bug_open,
    days: CAP.days,
    over_count: overCount,
    oldest_age_days: oldest,
    over_age: overAge,
    red: overCount || overAge,
    reasons,
  }
}

/**
 * 卡红（契约 §7.5 的读面那一半）：严重线上"判不了" / `unclassified` ⇒ **升级 + 卡红**，
 * 而且 `reasons` **必须点名是哪一条**（卡红了却不说哪一条，等于没红）。
 */
export function cardRedVerdict(ledger) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : []
  const red = entries.filter((e) => e?.card_red === true || filled(e?.escalated_at))
  return {
    red: red.length > 0,
    reasons: red.map((e) => {
      const line = e?.assessment?.severity_line ?? UNCLASSIFIED
      const cannot = e?.assessment?.severity_confidence === 'cannot'
      return `条目 ${e?.id ?? '(缺 id)'}：${line}${cannot ? ' —— 严重线判不了（cannot）' : ''} ⇒ 升级老板 + 卡红`
    }),
  }
}

// ── SLA（契约 C2 §3.7.1 · 组长 2026-11-02 裁定第 2 条）──────────────────────
/** 一个 `YYYY-MM-DD` 日子键 → **本地中午**那一刻（`calendarDayDiff` 的终点；不会跨日）。 */
function localNoonOfDayKey(dayKey) {
  if (typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey.trim())) return null
  const [y, m, d] = dayKey.trim().split('-').map((part) => Number(part))
  const at = new Date(y, m - 1, d, 12, 0, 0, 0)
  return Number.isFinite(at.getTime()) ? at : null
}

/**
 * **SLA 读数**（契约 C2 §3.7.1）：一只 bug 从 **`opened_at`** 起，**超过当前一个开工周期**
 * 仍未**真正评估过**（判据 = `isAssessed()`；机械口径以 §3.7.1 为准，这里不再复述）⇒ 记进 `over`。
 *
 * 只有两个豁免（逐字照契约）：
 *   · **同一天开的**（`opened_at` 的日号 ≥ `cycle`）—— 当天开工的不算超期；
 *   · **已经评估过的**（`isAssessed()`：`assessment` 是对象且 `verdict` 是 `true/false/duplicate`）。
 * ⚠️ `assessment.verdict === 'unknown'`（判不了）**不是**"已评估"：它保留 open，所以照样超期 ——
 *    别把"判不了"读成"已经处理过了"。`kind === 'observation'` 不是 bug，不进这个数。
 *
 * `cycle` = 开工周期号 = 卡上的 `<day>`（同一个键；不按 24h 算 —— 同一场里先后跑两次会互相判过期）。
 * `now` 由调用方给（CLI 用注入时钟）；**没有 `cycle` ⇒ 这一格判不了**：`over` 空、`oldest_age` 为 0，
 * 但那不是"没有超期"，所以 `cycle` 原样回 `null`，读的人看得出这一跑没量。
 *
 * @param {object} ledger
 * @param {{cycle?: string|null}} [options]
 * @returns {{over: string[], oldest_age: number, cycle: string|null}}
 */
export function slaVerdict(ledger, { cycle = null } = {}) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : []
  const cycleAt = localNoonOfDayKey(cycle)
  const over = []
  let oldest = 0
  if (cycleAt !== null) {
    for (const e of entries) {
      if (e?.kind !== 'bug') continue
      if (isAssessed(e)) continue
      const openedAt = filled(e?.opened_at) ? e.opened_at : e?.registered_at
      const age = calendarDayDiff(openedAt, cycleAt)
      if (age === null || age <= 0) continue
      over.push(String(e?.id ?? '(缺 id)'))
      if (age > oldest) oldest = age
    }
  }
  return { over, oldest_age: oldest, cycle: cycle ?? null }
}

// ── 五分支分流（契约 §4.2）─────────────────────────────────────────────────
/**
 * 五分支表 —— **只用于评审 finding 的载体**（登记 vs 票）。
 *
 * | 配方 | 重复结果 | 环境相关 | 去向 |
 * | 有 | 成功 | 任意 ⇒ 条目（**不许**因为"环境相关"就打 `env`） |
 * | 有 | 失败 | 是 ⇒ 条目 + `env` + 证据 |
 * | 有 | 失败 | 否 ⇒ 评审票 |
 * | 无 | — | 任意 ⇒ 票 + `one-off` |
 * | 间歇 | — | 任意 ⇒ 条目 + `intermittent` + 证据 |
 *
 * **判不了就不许猜**：`repeat=failure` 而 `env_related` 没给 ⇒ ②③ 分不开 ⇒ 拒。
 * 老板报的 bug **不走这张表**（写面：`E_BUG_ROUTE_NOT_APPLICABLE`）。
 *
 * @returns {{ok:true, code:null, carrier:'entry'|'ticket', tags:string[]}|{ok:false, code:string, message:string}}
 */
export function routingVerdict({ recipe, repeat = null, env_related = null } = {}) {
  if (!RECIPE_WORDS.includes(recipe)) {
    return bad('E_ARG_SCHEMA', `配方的词只认 ${RECIPE_WORDS.join(' / ')}（闭集），实得 ${JSON.stringify(recipe)} —— 判不了不许猜`)
  }
  if (recipe === 'yes') {
    if (repeat !== 'success' && repeat !== 'failure') {
      return bad('E_ARG_SCHEMA', `有配方时重复结果只认 success / failure，实得 ${JSON.stringify(repeat)}`)
    }
    if (repeat === 'success') return { ok: true, code: null, carrier: 'entry', tags: [] }
    if (env_related !== true && env_related !== false) {
      return bad('E_ARG_SCHEMA', '重复失败时必须给 env_related（true / false）—— ②「条目 + env」与 ③「评审票」靠它分叉；没给就分不开（判不了不许挑一条）')
    }
    return env_related
      ? { ok: true, code: null, carrier: 'entry', tags: ['env'] }
      : { ok: true, code: null, carrier: 'ticket', tags: [] }
  }
  if (recipe === 'no') return { ok: true, code: null, carrier: 'ticket', tags: ['one-off'] }
  return { ok: true, code: null, carrier: 'entry', tags: ['intermittent'] }
}

// ── bug 任务（契约 §6.1）───────────────────────────────────────────────────
/**
 * bug 任务的形状：三态 + **五关共用 `FIVE_GATES`** + 真 `batch` + 非空 `entry_ids` + 一个根因。
 *
 * ⚠️ 五关的**值域**与路线任务同一份（`lib/route.mjs::FIVE_GATES` 九词并集）——
 *    在这里另抄五个正名会让 `five_gate_state:"方案"` 在 bug 侧被拒、在路线侧被收（两个真相）。
 *
 * @param {object} task
 * @param {{batches?: Array<{id:string}>}} [options]
 */
export function bugTaskVerdict(task, { batches = [] } = {}) {
  if (!isObject(task)) return bad('E_ARG_SCHEMA', `bug 任务必须是对象，实得 ${JSON.stringify(task)}`)
  if (!filled(task.id)) return bad('E_ARG_SCHEMA', 'bug 任务必须带非空 id')
  if (!filled(task.title)) return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 title 必填`)
  if (!TASK_STATUSES.includes(task.status)) {
    return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 status 必须是 ${TASK_STATUSES.join(' | ')}（与路线任务同一套三态），实得 ${JSON.stringify(task.status)}`)
  }
  if (!FIVE_GATES.includes(task.five_gate_state)) {
    return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 five_gate_state 必须是 lib/route.mjs::FIVE_GATES 里的词（${FIVE_GATES.join(' / ')}），实得 ${JSON.stringify(task.five_gate_state)}`)
  }
  if (!filled(task.batch)) return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 必须指向一个 batch（任务只带 batch id；批次不是任务标签）`)
  const known = Array.isArray(batches) ? batches : []
  if (!known.some((b) => b?.id === task.batch)) {
    return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 batch=${JSON.stringify(task.batch)} 不在台账的 batches 里（现有：${known.map((b) => b?.id).join(' / ') || '（没有批次）'}）`)
  }
  if (!Array.isArray(task.entry_ids) || task.entry_ids.length === 0) {
    return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 entry_ids 必须 ≥1 条（一个根因一个 bug 任务）`)
  }
  if (task.entry_ids.some((id) => !filled(id))) return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 entry_ids 里有非空 id 以外的值：${JSON.stringify(task.entry_ids)}`)
  if (!filled(task.root_cause)) return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 root_cause 必填（一个根因一个任务）`)
  if (task.session_ref !== undefined && task.session_ref !== null && !filled(task.session_ref)) {
    return bad('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 session_ref 只能是 null 或非空字符串（槽那一半归 C1c）`)
  }
  return ok()
}

/** 下一个批次 id：`batch-<YYYYMMDD>-<NN>`（同一份 `dayDigitsOf`）。 */
export function nextBatchId(ledger, at) {
  const prefix = `batch-${dayDigitsOf(at ?? new Date(0))}-`
  let max = 0
  for (const b of ledger?.batches ?? []) {
    const id = String(b?.id ?? '')
    if (!id.startsWith(prefix)) continue
    const n = Number(id.slice(prefix.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`
}

// ── 严重三线 / 四出口 / 样本（契约 §7）────────────────────────────────────
/**
 * 样本集判定（定形 §6.2）：**恰好四个**，且必须是
 * `{data_broken, positive}` · `{data_broken, negative}` · `{reading_lies, positive}` · `{reading_lies, negative}`。
 * 少一个 / 重复 / 没有第三线那一对 ⇒ 拒（只钉"四个"不钉成分 ⇒ 四个全是 data_broken 也过，第三线等于没校准）。
 *
 * @param {{samples?: Array}|Array} input
 */
export function sampleSetVerdict(input) {
  const samples = Array.isArray(input) ? input : input?.samples
  if (!Array.isArray(samples)) return bad('E_ARG_SCHEMA', '样本集必须给 samples 数组（正 / 负 / 第三线正 / 第三线负）')
  if (samples.length !== SAMPLE_SET_SHAPE.length) {
    return bad('E_ARG_SCHEMA', `样本必须恰好 ${SAMPLE_SET_SHAPE.length} 个（正 / 负 / 第三线正 / 第三线负），实得 ${samples.length}`)
  }
  const seen = new Set()
  for (const [i, s] of samples.entries()) {
    if (!isObject(s) || !SEVERITY_LINES.includes(s.line) || !SAMPLE_POLARITIES.includes(s.polarity)) {
      return bad('E_ARG_SCHEMA', `samples[${i}] 必须形如 {line: ${SEVERITY_LINES.join('|')}, polarity: ${SAMPLE_POLARITIES.join('|')}}，实得 ${JSON.stringify(s)}`)
    }
    const key = `${s.line}|${s.polarity}`
    if (seen.has(key)) return bad('E_ARG_SCHEMA', `样本 ${key} 出现了两次 —— 样本集是集合不是多重集（正 / 负 / 第三线正 / 第三线负 各一个）`)
    seen.add(key)
  }
  const missing = SAMPLE_SET_SHAPE.filter((w) => !seen.has(`${w.line}|${w.polarity}`))
  if (missing.length > 0) {
    return bad('E_ARG_SCHEMA', `样本集缺 ${missing.map((m) => `${m.line}/${m.polarity}`).join(' / ')} —— 定形 §6.2 点名要「正 / 负 / 第三线正 / 第三线负」四个（第三线那一对不许省）`)
  }
  return ok()
}

/**
 * 严重线判定（四出口闭集 + 第三线地基 + 升级）。
 *
 * - `exit`：`data_broken` / `function_broken_repro` / `reading_lies` / `unclassified`（**闭集**，第五个值 ⇒ 拒）；
 * - `hides`：判 `reading_lies` **必须**点名它掩盖了前两条里的哪一条，否则 `E_BUG_SEVERITY_THIRD_LINE_UNGROUNDED`；
 * - `calibrated`：这一条线**被采样过**吗（默认按四样本冻结形状；`function_broken_repro` 没被采样 ⇒ false）；
 * - `escalate`：`unclassified` 或 `severity_confidence:"cannot"`（严重线上的"判不了"）⇒ **升级 + 卡红**。
 *
 * @param {{line?:string, hides?:string|null, severity_confidence?:string, samples?:Array|null}} input
 */
export function severityVerdict({ line, hides = null, severity_confidence, samples = null } = {}) {
  if (!SEVERITY_EXITS.includes(line)) {
    return bad('E_ARG_SCHEMA', `严重线的出口是闭集（${SEVERITY_EXITS.join(' / ')}：三条线 + unclassified，不是第五桶），实得 ${JSON.stringify(line)}`)
  }
  if (!SEVERITY_CONFIDENCE.includes(severity_confidence)) {
    return bad('E_ARG_SCHEMA', `severity_confidence 只认 ${SEVERITY_CONFIDENCE.join(' / ')}（cannot = 严重线上的判不了），实得 ${JSON.stringify(severity_confidence)}`)
  }
  if (line === 'reading_lies' && !THIRD_LINE_HIDES.includes(hides)) {
    return bad('E_BUG_SEVERITY_THIRD_LINE_UNGROUNDED', `「读数说假话」只有掩盖前两条时才算（定形 §4.2）—— 判 reading_lies 必须点名 hides ∈ ${THIRD_LINE_HIDES.join(' / ')}，实得 ${JSON.stringify(hides)}`)
  }
  const sampled = Array.isArray(samples) && samples.length > 0
    ? [...new Set(samples.map((s) => s?.line))]
    : SAMPLED_LINES
  return {
    ok: true,
    code: null,
    exit: line,
    calibrated: sampled.includes(line),
    escalate: line === UNCLASSIFIED || severity_confidence === 'cannot',
  }
}

// ── 台账形状（读面）───────────────────────────────────────────────────────
/**
 * 台账**外层形状**的判定（读面用）。只判段在不在、类型对不对 —— **不逐条判条目**：
 * 夹具台账与历史条目都要读得出来，逐条强判会把"读数"变成"写面复审"。
 */
export function bugLedgerShapeVerdict(ledger) {
  if (!isObject(ledger)) return bad('E_DATA_CORRUPT', `bug 台账不是一个对象：${JSON.stringify(ledger)?.slice(0, 120)}`)
  if (ledger.schema !== BUG_LEDGER_SCHEMA) {
    return bad('E_DATA_CORRUPT', `bug 台账的 schema 应为 ${BUG_LEDGER_SCHEMA}，实得 ${JSON.stringify(ledger.schema)}`)
  }
  for (const key of ['entries', 'tasks', 'batches', 'archived']) {
    if (!Array.isArray(ledger[key])) return bad('E_DATA_CORRUPT', `bug 台账缺段 ${key}（契约 §2.2：entries + tasks + batches + 严重线样本 + archived）`)
  }
  if (!isObject(ledger.severity_samples)) return bad('E_DATA_CORRUPT', 'bug 台账缺段 severity_samples（严重线样本集）')
  return ok()
}

/** 一份空台账（**由第一次登记创建**；定形 §2.3：bug 台账由第一次登记创建，登记不需要路线）。 */
export function newBugLedger({ at = null } = {}) {
  return {
    schema: BUG_LEDGER_SCHEMA,
    entries: [],
    tasks: [],
    batches: [],
    severity_samples: { version: 0, registered_at: null, registered_by: null, samples: [], history: [] },
    archived: [],
    version: 0,
    created_at: at,
    updated_at: at,
  }
}
