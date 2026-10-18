/**
 * 记忆核心 —— 纯函数：字符口径 / 半衰期与新鲜度 / 全库归一 / 类型内低线 / 双低与 streak /
 * 斩杀资格 / 容量判定 / 四类分布。
 *
 * 冻结依据（**逐条对应，别改口径**）：
 *   · 提案 §B1.5 的签名（导出名就是下面这一批，一个不多一个不少）；
 *   · 提案 §B3.6 的 entry / snapshot 字段表（`double_low_streak` 是**已发布值**）；
 *   · 提案 §B3.4 的字符口径与汇总不变量（code point · 去 BOM · LF 归一 · 只计 `entry.text` · 不 trim · 不 NFC）；
 *   · 计划 v5 §2.5（T 表 · `raw_fresh=2^(-天数/T)` · 全库归一 · 类型内最低 20% · K=3）；
 *   · 追加裁定 v1.2 的 **C-2**（`capacityVerdict(entries, ops)` 的六种 op 形状与 `E_OP_INVALID`）；
 *   · 追加裁定 v1.3 的 **D-B4**（`isCullEligible` 只认 `is_double_low` + `double_low_streak`）。
 *
 * 五条纪律：
 *   ① **不改入参、不写盘**：`capacityVerdict` 在副本上按顺序应用 ops，任一 op 非法就整体拒绝
 *      （`E_OP_INVALID`）——**不产生部分结果**（C-2 规则 2/3）。
 *   ② **未知类型一律出声**：`halfLifeOf` 对未知类型给 `undefined`，调用方（本文件的归一/新鲜度）
 *      立刻抛错，**不兜底**（提案 §B1.5 明写）。
 *   ③ **streak 只吃已发布值**：`isCullEligible(entryN)` 读的是 N 快照里记的两个字段，
 *      绝不在这里重算（D-B4：字段名就是 `is_double_low` / `double_low_streak`）。
 *   ④ **"现在"只从 `lib/clock.mjs` 进**：全库归一里的"当前日"决定新鲜度。
 *      `sharesOf(entries)` 是冻结签名，缺省走时钟接缝（`AGENIA_NOW_FILE` 优先）；
 *      需要确定性时可用**可选第二参** `{today:'YYYY-MM-DD'}` 覆盖（不影响 1 参调用形状）。
 *   ⑤ **容量是读数，不是闸**（F-71，老板 2026-10-18）：`capacityVerdict` 只判 **op 形状**；
 *      `count > 200` / `chars > 60000` **不拒绝任何东西**，只多给 `overCap` / `overBy` / `capRef` 三个读数。
 *      「该不该收」是判决的事，「全过之后会不会落回上限内」是复核每天一次**预测**的事 ——
 *      上限的实际结果**没人管**。**四类不设硬帽**：返回值里没有、也不许出现任何逐类上限字段（§B3.4）。
 *      分布只是维护信号，进不了容量签名。
 */
import { now } from './clock.mjs'

/** 四类类型（机读用英文 id；中文只作呈现名，拍板 Q9）。 */
export const TYPE_IDS = Object.freeze(['general', 'boss', 'machine', 'project'])

/** 半衰期 T（天）：general/boss 365 · machine 180 · project 90（计划 v5 §2.5）。 */
export const HALF_LIFE_DAYS = Object.freeze({ general: 365, boss: 365, machine: 180, project: 90 })

/** 呈现用中文名（§B3.4 的表，逐字）。 */
const TYPE_NAMES = Object.freeze({
  general: '【底层通用】',
  boss: '【关于老板】',
  machine: '【关于本机】',
  project: '【关于某个项目】',
})

/** 长期记忆的两个上限（§B3.4 / §4 汇总）：**恰好等于允许**。
 *  ⚠️ 它们是**读数与预测的参考值**，不是闸（F-71）—— `capacityVerdict` 拿它们算 `overCap` / `overBy` / `capRef`，
 *  超了**照样放行**。 */
const CAP_COUNT = 200
const CAP_CHARS = 60_000

/** 类型内低线：n < 5 不判；n ≥ 5 取 `ceil(0.2n)` 个名额，并列全计入。 */
const LOW_LINE_MIN_N = 5
const LOW_LINE_QUOTA_RATIO = 0.2

/** 斩杀资格：连续双低 K=3 次（计划 v5 §2.5）。 */
const STREAK_K = 3

/** streak/flag 的字段名（D-B4 冻结，逐字；它们是**已发布 N 快照里的列**）。 */
const STREAK_FIELD = 'double_low_streak'
const FLAG_FIELD = 'is_double_low'

const DAY_MS = 86_400_000
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function schemaError(message) {
  const err = new Error(message)
  err.name = 'MemorySchemaError'
  err.code = 'E_ARG_SCHEMA'
  return err
}

// ── 字符口径（§B3.4 第 1–3 条逐字）───────────────────────────────────────────
/**
 * 只数 `entry.text`：删开头的 BOM → `\r\n`/`\r` 归一成 `\n` → 数 **Unicode code point**。
 * 不 trim（前后空格算数）、不做 NFC/NFD（`e` + 组合音标是 2 个字）。
 * 非字符串按 0 计（缺正文的条目不该让整份报告炸掉；坏数据的检测在快照读取那一层）。
 */
export function charCountOf(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  const normalized = text.replace(/^\uFEFF+/, '').replace(/\r\n?/g, '\n')
  return [...normalized].length
}

// ── 半衰期 / 新鲜度 ─────────────────────────────────────────────────────────
/** T 映射；**未知类型给 `undefined`**（调用方必须自己报错，不许兜底）。 */
export function halfLifeOf(typeId) {
  if (typeof typeId !== 'string') return undefined
  return Object.hasOwn(HALF_LIFE_DAYS, typeId) ? HALF_LIFE_DAYS[typeId] : undefined
}

/**
 * `raw_fresh = 2 ^ (-days / T)`。**不夹逼**：负数天（证据复核日在未来）给出 > 1 的值，
 * 由断言层判它合不合理 —— 函数自己不改数（提案 §B1.5 明写）。
 */
export function freshnessOf(days, halfLifeDays) {
  const d = Number(days)
  const t = Number(halfLifeDays)
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return Number.NaN
  return 2 ** (-d / t)
}

// ── 全库归一 ───────────────────────────────────────────────────────────────
/** `YYYY-MM-DD` → UTC 毫秒（只算日历差，绕开夏令时）。 */
function dateKeyToMs(key) {
  const m = DATE_KEY_RE.exec(String(key ?? '').trim())
  if (!m) return Number.NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** `YYYY-MM-DD`（**本地日历日**：老板看到的"今天"）。 */
function todayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function resolveToday(options) {
  const given = options?.today
  if (typeof given === 'string' && DATE_KEY_RE.test(given.trim())) return given.trim()
  if (given instanceof Date && !Number.isNaN(given.getTime())) return todayKey(given)
  return todayKey(now())
}

/** 一条条目的原始新鲜度（天数 = 当前日 − 最后一次证据复核日）。 */
function freshRawOf(entry, today) {
  const t = halfLifeOf(entry?.type)
  if (t === undefined) {
    throw schemaError(`entry.type 不在四类里：${JSON.stringify(entry?.type)}（id=${entry?.id ?? '(无 id)'}）—— T 不许兜底`)
  }
  const reviewed = dateKeyToMs(entry?.last_evidence_review)
  if (!Number.isFinite(reviewed)) {
    throw schemaError(`entry.last_evidence_review 必须是 YYYY-MM-DD，实得 ${JSON.stringify(entry?.last_evidence_review)}（id=${entry?.id ?? '(无 id)'}）`)
  }
  const days = Math.round((dateKeyToMs(today) - reviewed) / DAY_MS)
  return freshnessOf(days, t)
}

/** `raw` 只许 0–1；坏值按 0 计（正常化之外的原始分由判决层负责，这里不夹逼）。 */
function rawOf(entry) {
  const v = Number(entry?.raw)
  return Number.isFinite(v) ? v : 0
}

/**
 * 全库归一：`ImpShare_i = raw_i / Σraw` · `FreshShare_i = raw_fresh_i / Σraw_fresh`。
 * 每次更新都在**最终存活集**上重算 ⇒ 新增/移除会让所有老条目的份额一起变。
 * 空库有明确空态（`empty:true`、份额表为空），**不除零**。
 *
 * @param {Array<object>} entries 条目（读 `id` / `type` / `raw` / `last_evidence_review`）
 * @param {{today?: string|Date}} [options] 可选：覆盖"当前日"（缺省走时钟接缝）
 * @returns {{imp: Map<string,number>, fresh: Map<string,number>, empty: boolean}}
 */
export function sharesOf(entries, options = {}) {
  const list = Array.isArray(entries) ? entries : []
  const imp = new Map()
  const fresh = new Map()
  if (list.length === 0) return { imp, fresh, empty: true }

  const today = resolveToday(options)
  const raws = list.map((e) => rawOf(e))
  const freshRaws = list.map((e) => freshRawOf(e, today))
  const sumRaw = raws.reduce((a, b) => a + b, 0)
  const sumFresh = freshRaws.reduce((a, b) => a + b, 0)
  // Σraw === 0（非空库但全是 0 分）时均分：否则份额和不为 1，"低线"会全灭。
  // 新鲜度那一侧永远 > 0（2^-x > 0），只有空库才轮到同一个兜底。
  const even = 1 / list.length

  list.forEach((entry, i) => {
    imp.set(entry?.id, sumRaw > 0 ? raws[i] / sumRaw : even)
    fresh.set(entry?.id, sumFresh > 0 ? freshRaws[i] / sumFresh : even)
  })
  return { imp, fresh, empty: false }
}

// ── 类型内低线 / 双低 / streak ──────────────────────────────────────────────
/** `shares` 可以是 `sharesOf` 的返回对象（默认取 `imp` 维度），也可以直接是一张 `Map`。 */
function shareMapOf(shares, dimension = 'imp') {
  if (shares instanceof Map) return shares
  const map = shares?.[dimension]
  return map instanceof Map ? map : null
}

/**
 * 类型内低线：**入参是该类型的条目集**（调用方按 `type` 分桶）。
 * n < 5 ⇒ 本轮不判（`lowIds:null`）；n ≥ 5 ⇒ 名额 `ceil(0.2n)`，线值 = 升序第 quota 名的份额，
 * **并列者全部计入**（份额 ≤ 线值）。
 *
 * @param {Array<object>} typeEntries 同一类型的条目
 * @param {Map<string,number>|{imp:Map,fresh:Map}} shares 份额表（对象形态默认取 imp 维度；要新鲜度就传 `shares.fresh`）
 * @param {'imp'|'fresh'} [dimension] 仅当 `shares` 是对象形态时生效
 * @returns {{n:number, quota:number, line:number|null, lowIds:Set<string>|null}}
 */
export function lowLineOf(typeEntries, shares, dimension = 'imp') {
  const list = Array.isArray(typeEntries) ? typeEntries : []
  const n = list.length
  if (n === 0 || n < LOW_LINE_MIN_N) return { n, quota: 0, line: null, lowIds: null }

  const map = shareMapOf(shares, dimension)
  const quota = Math.ceil(LOW_LINE_QUOTA_RATIO * n)
  const ranked = list
    .map((e) => ({ id: e?.id, v: Number(map?.get?.(e?.id) ?? 0) }))
    .sort((a, b) => (a.v === b.v ? String(a.id).localeCompare(String(b.id)) : a.v - b.v))
  const line = ranked[quota - 1].v
  const lowIds = new Set(ranked.filter((x) => x.v <= line).map((x) => x.id))
  return { n, quota, line, lowIds }
}

/** 双低：**两侧都低**才算（只一侧低不算 —— MEM-02 的核心）。 */
export function isDoubleLow(entryId, lowImp, lowFresh) {
  const a = typeof lowImp?.has === 'function' ? lowImp.has(entryId) : false
  const b = typeof lowFresh?.has === 'function' ? lowFresh.has(entryId) : false
  return a === true && b === true
}

/** streak 推进：双低 +1；否则清零（非双低、类型变更都由调用方以 `false` 表达）。 */
export function nextStreak(prevStreak, doubleLow) {
  const prev = Number(prevStreak)
  const base = Number.isFinite(prev) && prev > 0 ? Math.floor(prev) : 0
  return doubleLow === true ? base + 1 : 0
}

/**
 * 斩杀资格：`entryN.is_double_low === true && entryN.double_low_streak >= 3`。
 * `entryN` 是**已发布 N 快照里的条目记录**；两个字段都是 N 的发布值，**不许当前进程重算**（D-B4）。
 */
export function isCullEligible(entryN) {
  if (entryN === null || typeof entryN !== 'object') return false
  if (entryN[FLAG_FIELD] !== true) return false
  const streak = Number(entryN[STREAK_FIELD])
  return Number.isFinite(streak) && streak >= STREAK_K
}

// ── 四类分布 ───────────────────────────────────────────────────────────────
/**
 * 四类分布，**恰好 4 项**（0 条的类型也在，`count:0, chars:0`），顺序 = `TYPE_IDS`。
 * 不变量（严格相等）：`sum(count) === 条目数` · `sum(chars) === 全库字符数`。
 * 类型不在四类里 ⇒ 抛 `E_ARG_SCHEMA`（否则汇总不变量立刻变成假的）。
 */
export function distributionOf(entries) {
  const list = Array.isArray(entries) ? entries : []
  const buckets = new Map(TYPE_IDS.map((typeId) => [typeId, { typeId, typeName: TYPE_NAMES[typeId], count: 0, chars: 0 }]))
  for (const e of list) {
    const bucket = buckets.get(e?.type)
    if (!bucket) throw schemaError(`entry.type 不在四类里：${JSON.stringify(e?.type)}（id=${e?.id ?? '(无 id)'}）`)
    bucket.count += 1
    bucket.chars += charCountOf(e?.text)
  }
  return TYPE_IDS.map((typeId) => buckets.get(typeId))
}

// ── 容量判定（含 C-2 的六种 op）─────────────────────────────────────────────
function entryProblem(entry) {
  if (entry === null || typeof entry !== 'object') return 'entry 不是对象'
  if (typeof entry.id !== 'string' || entry.id === '') return 'entry 缺 id'
  if (!TYPE_IDS.includes(entry.type)) return `entry.type 不在四类里：${JSON.stringify(entry.type)}`
  if (typeof entry.text !== 'string') return 'entry.text 必须是字符串'
  return null
}

const indexOfId = (list, id) => list.findIndex((e) => e?.id === id)

/** 在副本上按顺序应用一个 op；非法 ⇒ `{ok:false, why}`（调用方立刻整体拒绝）。 */
function applyOp(list, op) {
  if (op === null || typeof op !== 'object') return { ok: false, why: 'op 不是对象' }
  switch (op.kind) {
    case 'add': {
      const bad = entryProblem(op.entry)
      if (bad) return { ok: false, why: `add 的 ${bad}` }
      if (indexOfId(list, op.entry.id) >= 0) return { ok: false, why: `add 的 id 已存在：${op.entry.id}` }
      list.push({ ...op.entry })
      return { ok: true }
    }
    case 'modify': {
      if (typeof op.id !== 'string' || op.id === '') return { ok: false, why: 'modify 缺 id' }
      const i = indexOfId(list, op.id)
      if (i < 0) return { ok: false, why: `modify 的 id 不存在：${op.id}` }
      const bad = entryProblem(op.entry)
      if (bad) return { ok: false, why: `modify 的 ${bad}` }
      if (op.entry.id !== op.id) return { ok: false, why: `modify 的 entry.id(${op.entry.id}) 必须等于 id(${op.id})` }
      list[i] = { ...op.entry } // 整体替换
      return { ok: true }
    }
    case 'retire':
    case 'cull': {
      const i = indexOfId(list, op.id)
      if (i < 0) return { ok: false, why: `${op.kind} 的 id 不存在：${JSON.stringify(op.id)}` }
      list.splice(i, 1)
      return { ok: true }
    }
    case 'merge': {
      if (!Array.isArray(op.ids) || op.ids.length === 0) return { ok: false, why: 'merge 缺 ids（非空数组）' }
      const merged = new Set(op.ids)
      if (merged.size !== op.ids.length) return { ok: false, why: 'merge 的 ids 里有重复' }
      for (const id of op.ids) {
        if (indexOfId(list, id) < 0) return { ok: false, why: `merge 的 id 不存在：${id}` }
      }
      // `entry:null` = 只吸收删除（C-2 的形状允许）；有产物才校验产物。
      const hasProduct = op.entry !== null && op.entry !== undefined
      if (hasProduct) {
        const bad = entryProblem(op.entry)
        if (bad) return { ok: false, why: `merge 的 ${bad}` }
        if (merged.has(op.entry.id)) return { ok: false, why: `merge 的 entry.id(${op.entry.id}) 与被合并的 ids 重复` }
      }
      const survivors = list.filter((e) => !merged.has(e.id))
      if (hasProduct && survivors.some((e) => e.id === op.entry.id)) {
        return { ok: false, why: `merge 的 entry.id(${op.entry.id}) 与现存条目冲突` }
      }
      list.length = 0
      list.push(...survivors)
      if (hasProduct) list.push({ ...op.entry })
      return { ok: true }
    }
    case 'retag': {
      const i = indexOfId(list, op.id)
      if (i < 0) return { ok: false, why: `retag 的 id 不存在：${JSON.stringify(op.id)}` }
      if (!TYPE_IDS.includes(op.typeId)) return { ok: false, why: `retag 的 typeId 非法：${JSON.stringify(op.typeId)}` }
      list[i] = { ...list[i], type: op.typeId }
      return { ok: true }
    }
    default:
      return { ok: false, why: `未知 op kind：${JSON.stringify(op?.kind)}` }
  }
}

/**
 * 容量判定（C-2 的六种 op，逐字）。
 *
 * - `ops` 省略 / `[]` ⇒ 只看当前集合，`deltaCount`/`deltaChars` 必须为 0；
 * - 纯函数：在**副本**上按顺序应用，不改入参、不写盘；
 * - 任一 op 非法 ⇒ `{ok:false, rejectCode:'E_OP_INVALID', reason}`，**不产生部分结果**；
 * - 合法 ⇒ `ok:true`、`rejectCode:null`，并给最终存活集的
 *   `count`/`chars`/`deltaCount`/`deltaChars`/`distribution` + 三个容量读数 `overCap`/`overBy`/`capRef`。
 *
 * 🔴 **它不是闸**（F-71，老板 2026-10-18 拍板）：超了照给 `ok:true`。
 *    「该不该收」不归这里判；「维护案全过之后会不会落回上限内」是**复核**每天一次预测的事；
 *    上限的实际结果**没人管**。
 *    `E_CAP_COUNT` / `E_CAP_CHARS` 两个**错误码定义仍在码表里**（历史调用方认得出），
 *    但**这条路径不再发出它们** —— `rejectCode` 只可能是 `null` 或 `'E_OP_INVALID'`。
 *
 * **四类不设硬帽**：返回值里没有任何逐类上限字段（§B3.4）；
 * `overCap`/`overBy`/`capRef` 是**总量读数**，不是逐类帽。
 *
 * @param {Array<object>} entries 当前集合
 * @param {Array<object>} [ops] 见 C-2 的六形状
 */
export function capacityVerdict(entries, ops) {
  const base = Array.isArray(entries) ? entries : []
  const working = []
  for (const e of base) {
    const bad = entryProblem(e)
    if (bad) {
      return { ok: false, rejectCode: 'E_OP_INVALID', reason: `当前集合里有一条不合格：${bad}`, count: null, chars: null, deltaCount: null, deltaChars: null, distribution: null }
    }
    working.push({ ...e }) // 浅拷贝：ops 只改这一层
  }
  const baseCount = working.length
  const baseChars = working.reduce((a, e) => a + charCountOf(e.text), 0)

  const opList = ops === undefined || ops === null ? [] : ops
  if (!Array.isArray(opList)) {
    return { ok: false, rejectCode: 'E_OP_INVALID', reason: 'ops 必须是数组（省略或 [] 表示只看当前集合）', count: null, chars: null, deltaCount: null, deltaChars: null, distribution: null }
  }
  for (const op of opList) {
    const r = applyOp(working, op)
    if (!r.ok) {
      return { ok: false, rejectCode: 'E_OP_INVALID', reason: r.why, count: null, chars: null, deltaCount: null, deltaChars: null, distribution: null }
    }
  }

  const count = working.length
  const chars = working.reduce((a, e) => a + charCountOf(e.text), 0)
  const distribution = distributionOf(working)
  const deltaCount = count - baseCount
  const deltaChars = chars - baseChars

  // 容量读数（不是闸）：超了照给 —— 判「该不该收」不是这里的事（F-71，老板 2026-10-18）。
  // `capRef` 是这两个常量的**一份权威引用**，复核拿它做预测，不必自己抄 200 / 60000。
  const capRef = { count: CAP_COUNT, chars: CAP_CHARS }
  const overBy = { count: Math.max(0, count - CAP_COUNT), chars: Math.max(0, chars - CAP_CHARS) }
  const overCap = overBy.count > 0 || overBy.chars > 0

  return {
    ok: true,
    rejectCode: null,
    reason: null,
    count,
    chars,
    deltaCount,
    deltaChars,
    distribution,
    overCap,
    overBy,
    capRef,
  }
}
