/**
 * 回执（receipt）· 发现清单（findings）—— 覆盖校验 · 锚点 · 版本化写入。
 *
 * 冻结依据：提案 §B1.5（签名即契约）· §B3.1（findings 文件的三个锚点）· §B3.2（MD↔机读、覆盖校验、
 *   处置枚举、接手声明）· 追加裁定 v1.2 **C-4**（`nextReceiptVersion` = 现存 max + 1、**空洞不填**、
 *   重复 max 也 +1、无历史 ⇒ 1）与 **C-6**（`E_RECEIPT_OVERWRITE` **只由本文件的回执写入函数产生**）·
 *   组长拍板 **Q10**（`findings_set_sha256` 的规范化：UTF-8 字节 + 键按字节序升序 + 无空白）。
 *
 * 四条口径：
 *   ① **这个码住在这儿**：`E_RECEIPT_OVERWRITE` 的**唯一产生面**是 `receiptWriteVerdict()`
 *      （C-6 逐字："目标版本文件已存在、或调用方 `expected_version` 与当前 head 不符时拒绝写入；
 *      **不许静默覆盖**"）。别的模块只许**转手**它返回的 `code`，一个字节都不许自己写这个字面量 ——
 *      全树扫描（RCP-01 ⑤）就是这么判的。退出码那一行也随它一起住在本文件，`lib/error-codes.mjs` 只做汇总。
 *   ② **规范化只有一份**（Q10）：`canonicalJson()` 把对象键按 **UTF-8 字节序**升序重排、去空白，
 *      `findingsSetSha256()` 在它的 UTF-8 字节上取 SHA256。产出方用它填 `findings_set_sha256`；
 *      **校验方自己复算再跟声明值比**（`F-121`：自报一个 64 hex 就过，等于没验 ——
 *      `cand-20261018-0113`）。规范化配方唯一 ⇒ 产物那份 JSON 怎么写都不影响复算，
 *      所以"复算"不引入第二份口径。
 *   ②b **`code_fingerprint.equal` 是作业自报**（`F-122`）：校验方自己判三样 ——
 *      自洽（`equal:true` ⇒ 两个哈希逐字相同）、可复核（两个哈希都在且都是 64 hex）、
 *      与盘面复算对账（调用方给了 `anchors.code_fingerprint` 时逐项相同）。
 *      判不了的那一格（自洽但编造、调用方没给盘面复算）**不假装判过**，见 `codeFingerprintVerdict()`。
 *   ③ **每条 finding 恰好一个落点**（B3.2 的不变量）：漏 / 重 / 多 三张清单各报各的，不许糊成一个码。
 *   ④ **纯函数**：本模块不读盘、不写盘、不看时钟 —— 文件面的读与写由 CLI 负责。
 */
import { createHash } from 'node:crypto'
import { charCountOf } from './memory.mjs'

/** findings 文件与回执的 schema 版本（B3.1 / B3.2）。 */
export const RECEIPT_SCHEMA = 1

/**
 * 🔴 **C-6 的那个码**：回执不许被静默覆盖。
 *
 * 它的字面量**只出现在本文件**；`lib/error-codes.mjs` 从这里取键名去汇总退出码，
 * 别的模块只转手 `receiptWriteVerdict()` 给的 `code`。
 */
export const RECEIPT_OVERWRITE_CODE = 'E_RECEIPT_OVERWRITE'

/**
 * 🔴 **`F-122` 的那个码**：作业期间的代码指纹对不上（`equal !== true`，或 `equal:true` 但
 * 两个哈希互相矛盾 / 与盘面复算不符）⇒ **本次作废**（B3.1 逐字）。
 *
 * 它的产生面是 `codeFingerprintVerdict()`（`parseFindings` / `validateReceiptCoverage` 共用这一处）；
 * `receipt-check` 把它抬到 CLI 层，所以它必须在这张表里 —— 不在表里的码会被
 * `bin/agenia-local.mjs` 的 catch 折成 `E_INTERNAL`（exit 8），"作业作废"与"程序有 bug"就分不开了。
 */
export const CODE_FINGERPRINT_MOVED = 'E_CODE_FINGERPRINT_MOVED'

/** 回执这一族码的退出码行（汇总进 `lib/error-codes.mjs` 的那张表）。 */
export const RECEIPT_CODES = Object.freeze({
  [RECEIPT_OVERWRITE_CODE]: { exit: 5, zh: '回执不许静默覆盖（目标版本已存在 / expected_version 与 head 不符）' },
  [CODE_FINGERPRINT_MOVED]: { exit: 5, zh: '作业期间的代码指纹对不上（before≠after 却写 equal:true，或与盘面复算不符）⇒ 本次作废' },
})

/** 处置枚举 —— **只有两种，无第三种静默态**（B3.2）。 */
export const DISPOSITIONS = Object.freeze(['adopted', 'rejected'])

/** 拒绝理由的下限字数（B3.2："≥10 字，具体原因"）—— 与票的 void 理由同一把尺子（code point）。 */
export const REJECT_REASON_MIN_CHARS = 10

/** finding 的严重度枚举（B3.1）。 */
export const SEVERITIES = Object.freeze(['P0', 'P1', 'P2', 'P3'])

/** 证据条目的种类（B3.1）。 */
export const EVIDENCE_KINDS = Object.freeze(['file', 'cmd', 'log'])

/** 接手声明里**不许出现**的那种话（B3.2："不许伪造'原组长已处置'"）。 */
const FORGED_HANDOVER_RE = /原组长(已经|已)?(处置|处理|看过|同意了)/

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isFilledString = (v) => typeof v === 'string' && v.trim() !== ''
const isSha256 = (v) => typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v.trim())
const ok = () => ({ ok: true, code: null, message: '' })

// ── Q10：规范化 JSON 与发现集哈希 ────────────────────────────────────────────
/** 两个键的 UTF-8 字节序比较（**不是** UTF-16 码元序 —— Q10 写死的就是字节序）。 */
function bytesCompare(a, b) {
  return Buffer.compare(Buffer.from(String(a), 'utf8'), Buffer.from(String(b), 'utf8'))
}

/** 递归重排：对象键按 UTF-8 字节序升序；数组保序；其余原样（纯函数，不改入参）。 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (isObject(value)) {
    const out = {}
    for (const key of Object.keys(value).sort(bytesCompare)) out[key] = canonicalize(value[key])
    return out
  }
  return value
}

/**
 * Q10 的规范化 JSON：**键按字节序升序 + 无空白**。同一份内容无论键序/缩进怎么写，出来的串逐字相同。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

/**
 * `findings_set_sha256`（B3.1）：对**规范化后**的 findings 数组取 SHA256（UTF-8 字节）。
 *
 * 只吃数组；给了对象就取它的 `findings`。
 *
 * @param {Array|{findings?:Array}} findings
 * @returns {string} 64 hex（小写）
 */
export function findingsSetSha256(findings) {
  const list = Array.isArray(findings) ? findings : (Array.isArray(findings?.findings) ? findings.findings : [])
  return createHash('sha256').update(canonicalJson(list), 'utf8').digest('hex')
}

/** 一个摘要的**比对键**：64 hex ⇒ 去空白 + 小写；否则 `null`（"缺"与"形状不对"在比对这一层同义）。 */
function shaKeyOf(value) {
  return isSha256(value) ? value.trim().toLowerCase() : null
}

/**
 * **`F-121` 的判据**：`findings_set_sha256` 必须由校验方**自己复算**，不采信自报值。
 *
 * @param {Array} findings 发现数组（调用方已经确认它真的是数组）
 * @param {unknown} declared 产物里声明的值
 * @returns {{computed:string, declared:string|null, equal:boolean|null}}
 *   `equal === null` = 没有可比的声明值（缺失 / 不是 64 hex）⇒ 这一格由 schema 那条判，不在这里判。
 */
export function findingsSetVerdict(findings, declared) {
  const computed = findingsSetSha256(findings)
  const declaredKey = shaKeyOf(declared)
  return { computed, declared: declaredKey, equal: declaredKey === null ? null : declaredKey === computed }
}

/**
 * **`F-122` 的判据**：`code_fingerprint` 是**作业自报**，校验方自己判三样（按能判的次序）。
 *
 *   ① **自洽性** —— `equal === true` 时 `before_sha256` 必须逐字等于 `after_sha256`；
 *   ② **可复核性** —— `equal === true` 时两个哈希必须都在、都是 64 hex（只写 `{equal:true}` = "相信我" ⇒ 拒）；
 *   ③ **与盘面复算对账** —— 调用方给了 `anchorsFp`（独立复算出来的那两个值）时，声明值必须与它逐项相同。
 *   ④ `equal !== true`（作业自己说"本次作废"）⇒ 拒（既有行为，不许退化）。
 *
 * 🔴 **判不了的那一格（写清，别假装覆盖得更宽）**：两个哈希自洽、形状合法，而 `anchorsFp` 是 `null`
 *    —— 校验方手里**没有那棵树**，算不出来。这一格**不报绿、也不把"没给"读成"相等"**：
 *    返回 `ok:true` 只表示"形状与自洽过了"，"真不真"要由给 `anchorsFp` 的那一方关上
 *    （`receipt-check` 目前没有 `code_root` 入参，加它是另一票）。
 *
 * @param {unknown} fp 作业产物里的 `code_fingerprint`
 * @param {{before_sha256?:unknown, after_sha256?:unknown}|null} [anchorsFp] 独立复算值（可省）
 * @returns {{ok:boolean, code:string|null, detail:string}}
 */
export function codeFingerprintVerdict(fp, anchorsFp = null) {
  if (!isObject(fp)) {
    return { ok: false, code: 'E_ARG_SCHEMA', detail: 'code_fingerprint 必填且必须是对象（B3.1 三个锚点之一）' }
  }
  if (fp.equal !== true) {
    return {
      ok: false,
      code: CODE_FINGERPRINT_MOVED,
      detail: `作业期间的代码指纹对不上（equal=${JSON.stringify(fp.equal)} · before=${String(fp.before_sha256).slice(0, 12)}… / after=${String(fp.after_sha256).slice(0, 12)}…）—— B3.1：不等 ⇒ 本次作废`,
    }
  }
  const before = shaKeyOf(fp.before_sha256)
  const after = shaKeyOf(fp.after_sha256)
  if (before === null || after === null) {
    const bad = []
    if (before === null) bad.push(`before_sha256=${JSON.stringify(fp.before_sha256 ?? null)}`)
    if (after === null) bad.push(`after_sha256=${JSON.stringify(fp.after_sha256 ?? null)}`)
    return {
      ok: false,
      code: 'E_ARG_SCHEMA',
      detail: `equal:true 但两个哈希不都可复核（${bad.join(' · ')}）—— 只写一个布尔等于"相信我"，校验方没有任何可复核的东西`,
    }
  }
  if (before !== after) {
    return {
      ok: false,
      code: CODE_FINGERPRINT_MOVED,
      detail: `equal:true 却 before=${before.slice(0, 12)}… ≠ after=${after.slice(0, 12)}… —— 作业自己打自己的脸（自洽性先于一切）`,
    }
  }
  if (isObject(anchorsFp)) {
    const mismatches = []
    for (const [key, own] of [['before_sha256', before], ['after_sha256', after]]) {
      const anchor = shaKeyOf(anchorsFp[key])
      if (anchor === null) continue // 调用方没给这一项（或给的形状不对）⇒ 这一项判不了，不假装判过
      if (own !== anchor) mismatches.push(`${key}：声明 ${own.slice(0, 12)}… ≠ 盘面复算 ${anchor.slice(0, 12)}…`)
    }
    if (mismatches.length > 0) {
      return {
        ok: false,
        code: CODE_FINGERPRINT_MOVED,
        detail: `代码指纹的声明与盘面复算对不上（${mismatches.join(' · ')}）—— 校验方自己量过那棵树，不采信自报`,
      }
    }
  }
  return { ok: true, code: null, detail: '' }
}

// ── findings 文件 ───────────────────────────────────────────────────────────
/**
 * 解析并校验一份 `技术评审.findings.json`（B3.1 的字段表）。
 *
 * @param {object|string} findingsJson 对象**或**它的 JSON 文本
 * @returns {{ok:boolean, code:string|null, findings:Map<string,object>, count:number,
 *            computed_set_sha256:string|null, declared_set_sha256:string|null,
 *            problems:Array<{code:string,detail:string}>, message:string}}
 *   · 重复 id ⇒ `E_COVERAGE_DUP`；缺号（`F1`,`F3`）⇒ `E_COVERAGE_MISSING`（B3.1：唯一且连续）；
 *   · 形状问题一律 `E_ARG_SCHEMA`；
 *   · `findings` 是 `Map<id, finding>`，`count` 是条数（零条 ⇒ `ok:true` / `count:0`）。
 */
export function parseFindings(findingsJson) {
  let obj = findingsJson
  if (typeof findingsJson === 'string') {
    try {
      obj = JSON.parse(findingsJson)
    } catch (err) {
      return findingsBad('E_DATA_CORRUPT', `findings 文件不是合法 JSON：${String(err?.message).slice(0, 120)}`)
    }
  }
  if (!isObject(obj)) return findingsBad('E_ARG_SCHEMA', `findings 必须是一个对象，实得 ${JSON.stringify(findingsJson)?.slice(0, 120)}`)

  const problems = []
  const bad = (code, detail) => problems.push({ code, detail })

  if (obj.schema !== RECEIPT_SCHEMA) bad('E_ARG_SCHEMA', `schema 必须是 ${RECEIPT_SCHEMA}，实得 ${JSON.stringify(obj.schema)}`)
  if (!isFilledString(obj.day)) bad('E_ARG_SCHEMA', `day 必填（YYYY-MM-DD），实得 ${JSON.stringify(obj.day)}`)
  if (!isFilledString(obj.report_path)) bad('E_ARG_SCHEMA', `report_path 必填（相对工作区、正斜杠），实得 ${JSON.stringify(obj.report_path)}`)
  if (!isSha256(obj.report_sha256)) bad('E_ARG_SCHEMA', `report_sha256 必须是 64 hex，实得 ${JSON.stringify(obj.report_sha256)}`)
  if (!isFilledString(obj.generated_at)) bad('E_ARG_SCHEMA', `generated_at 必填（ISO8601 带偏移），实得 ${JSON.stringify(obj.generated_at)}`)
  if (!isObject(obj.code_fingerprint) || typeof obj.code_fingerprint.equal !== 'boolean') {
    bad('E_ARG_SCHEMA', 'code_fingerprint 必填且带 boolean 的 equal（B3.1：不等 ⇒ 本次作废）')
  }
  if (!isSha256(obj.findings_set_sha256)) bad('E_ARG_SCHEMA', `findings_set_sha256 必须是 64 hex，实得 ${JSON.stringify(obj.findings_set_sha256)}`)
  if (!Array.isArray(obj.findings)) {
    bad('E_ARG_SCHEMA', `findings 必须是数组（**零条也要显式写空数组**），实得 ${JSON.stringify(obj.findings)?.slice(0, 80)}`)
    return { ...findingsBad('E_ARG_SCHEMA', 'findings 不是一个数组'), problems }
  }

  // F-122：指纹三样（自洽 / 可复核；③ 的盘面复算要 `validateReceiptCoverage` 拿到 anchors 才判）。
  // 排在集合哈希之前：`before≠after` 是"作业自己打了自己的脸"，比"哈希对不上"更靠近病根。
  const fpVerdict = codeFingerprintVerdict(obj.code_fingerprint)
  if (!fpVerdict.ok) bad(fpVerdict.code, fpVerdict.detail)

  const map = new Map()
  obj.findings.forEach((row, index) => {
    const where = `findings[${index}]`
    if (!isObject(row)) { bad('E_ARG_SCHEMA', `${where} 不是对象`); return }
    if (!isFilledString(row.id)) bad('E_ARG_SCHEMA', `${where}.id 必填，实得 ${JSON.stringify(row.id)}`)
    if (!isFilledString(row.title)) bad('E_ARG_SCHEMA', `${where}.title 必填（老板能懂的一句话）`)
    if (!SEVERITIES.includes(row.severity)) bad('E_ARG_SCHEMA', `${where}.severity 必须是 ${SEVERITIES.join('|')}，实得 ${JSON.stringify(row.severity)}`)
    if (!isFilledString(row.summary)) bad('E_ARG_SCHEMA', `${where}.summary 必填（一句话摘要）`)
    if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
      bad('E_ARG_SCHEMA', `${where}.evidence 至少一条（B3.1）`)
    } else {
      row.evidence.forEach((ev, j) => {
        if (!isObject(ev) || !EVIDENCE_KINDS.includes(ev.kind) || !isFilledString(ev.ref)) {
          bad('E_ARG_SCHEMA', `${where}.evidence[${j}] 要形如 {kind:'file'|'cmd'|'log', ref:string}`)
        }
      })
    }
    if (typeof row.id === 'string' && row.id !== '') {
      if (map.has(row.id)) bad('E_COVERAGE_DUP', `${where}.id=${row.id} 在同一份报告里出现多次（B3.1：同报告内唯一）`)
      else map.set(row.id, row)
    }
  })

  // 缺号（B3.1：id 在同一报告内**唯一、连续**）——只认 `F<n>` 这一种编号。
  const numbered = [...map.keys()]
    .map((id) => /^F(\d+)$/.exec(id))
    .filter((m) => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)
  if (numbered.length === map.size && numbered.length > 0) {
    for (let i = 0; i < numbered.length; i += 1) {
      if (numbered[i] !== i + 1) {
        bad('E_COVERAGE_MISSING', `finding 的编号不连续：期待 F${i + 1}，实得 F${numbered[i]}（B3.1：同一报告内连续）`)
        break
      }
    }
  }

  // F-121：**校验方自己复算**集合哈希再跟声明值比（自报一个 64 hex 不算证据）。
  // 排在最后的理由：一行一条的 schema / 编号问题更具体，先报它们；集合哈希是"整份内容被动过"。
  const setVerdict = findingsSetVerdict(obj.findings, obj.findings_set_sha256)
  if (setVerdict.equal === false) {
    bad('E_RECEIPT_HASH', `findings 内容的集合哈希与声明值对不上（声明 ${setVerdict.declared.slice(0, 12)}…，复算 ${setVerdict.computed.slice(0, 12)}…）—— 内容改一个字而声明不动，就是这一格`)
  }

  const first = problems[0] ?? null
  return {
    ok: problems.length === 0,
    code: first?.code ?? null,
    findings: map,
    count: map.size,
    computed_set_sha256: setVerdict.computed,
    declared_set_sha256: setVerdict.declared,
    code_fingerprint: isObject(obj.code_fingerprint) ? obj.code_fingerprint : null,
    report_sha256: isSha256(obj.report_sha256) ? obj.report_sha256.trim().toLowerCase() : null,
    problems,
    message: first?.detail ?? '',
  }
}

function findingsBad(code, message) {
  return {
    ok: false, code, findings: new Map(), count: 0,
    computed_set_sha256: null, declared_set_sha256: null, code_fingerprint: null, report_sha256: null,
    problems: [{ code, detail: message }], message,
  }
}

/** 从三种可接受形状里取出"findings 那一侧有哪些 id"：数组 / 带 `findings` 数组的对象 / Map。 */
function idListOf(container, key) {
  if (container instanceof Map) return [...container.keys()]
  if (Array.isArray(container)) return container.map((row) => (isObject(row) ? row.id : undefined))
  if (isObject(container) && Array.isArray(container[key])) return container[key].map((row) => (isObject(row) ? row.id : undefined))
  return null
}

// ── 锚点 ───────────────────────────────────────────────────────────────────
/**
 * 回执里那三个锚点（B3.1 / B3.2）。
 *
 * ⚠️ **回执自报的 SHA 永远不是锚**：它只在这儿被**读出来**给调用方去跟作业产物对账
 * （反例：RCP-03 改报告一字 ⇒ 状态里的锚点对不上 ⇒ 红）。
 *
 * @param {object} receipt
 * @returns {{report_sha256:string|null, findings_set_sha256:string|null, receipt_sha256:string|null}}
 */
export function receiptAnchors(receipt) {
  return {
    report_sha256: isFilledString(receipt?.report?.sha256) ? String(receipt.report.sha256).trim() : null,
    findings_set_sha256: isFilledString(receipt?.findings_set_sha256) ? String(receipt.findings_set_sha256).trim() : null,
    receipt_sha256: isFilledString(receipt?.receipt_sha256) ? String(receipt.receipt_sha256).trim() : null,
  }
}

// ── 覆盖校验 ───────────────────────────────────────────────────────────────
/**
 * 覆盖校验（B3.2 的形状，逐字）：`{ok, missing, duplicate, extra, ticketProblems, anchorProblems, code}`。
 *
 * 校验方**自己复算**的两处（`F-121` / `F-122`，都不采信产物里的同名值）：
 *   · `code_fingerprint` 的自洽 / 可复核 / 与 `anchors.code_fingerprint` 对账（`codeFingerprintVerdict`）；
 *   · `findings_set_sha256` 与 findings 内容复算值对账（`findingsSetVerdict`）。
 *
 * @param {object} receipt 机读回执
 * @param {object|Map|Array} findings findings 文件（对象/解析结果/数组都吃）
 * @param {Array<object>} tickets 票库（`current.json.tickets`）
 * @param {{report_sha256?:string, findings_set_sha256?:string,
 *          code_fingerprint?:{before_sha256?:string, after_sha256?:string}}} anchors
 *   **独立锚点**（来自作业产物 / 本地状态 / 盘面复算）；回执与作业自报的值只跟它比。
 *   `code_fingerprint` 一旦给出，就按"盘面复算"逐项对账（③ 形）；没给 ⇒ 那一格**判不了**，不假装判过。
 * @returns {{ok:boolean, missing:string[], duplicate:string[], extra:string[],
 *            ticketProblems:Array<{id:string,code:string,detail:string}>,
 *            reasonProblems:Array<{id:string,code:string,detail:string}>,
 *            dispositionProblems:Array<{id:string,code:string,detail:string}>,
 *            handoverProblems:Array<{code:string,detail:string}>,
 *            anchorProblems:Array<{code:string,detail:string}>,
 *            fingerprintProblems:Array<{code:string,detail:string}>,
 *            setHashProblems:Array<{code:string,detail:string}>,
 *            code:string|null, message:string}}
 */
export function validateReceiptCoverage(receipt, findings, tickets, anchors = {}) {
  const missing = []
  const duplicate = []
  const extra = []
  const ticketProblems = []
  const reasonProblems = []
  const dispositionProblems = []
  const handoverProblems = []
  const anchorProblems = []
  const fingerprintProblems = []
  const setHashProblems = []

  const empty = () => ({
    ok: false, code: null,
    missing, duplicate, extra, ticketProblems, reasonProblems, dispositionProblems,
    handoverProblems, anchorProblems, fingerprintProblems, setHashProblems, message: '',
  })

  if (!isObject(receipt)) {
    return { ...empty(), code: 'E_ARG_SCHEMA', message: `回执必须是一个对象，实得 ${JSON.stringify(receipt)?.slice(0, 120)}` }
  }

  // ① 作业产物那一侧：`code_fingerprint` 是**作业自报**，校验方自己判（`F-122`）。
  //    四种拒绝形状共用一个产生面（`codeFingerprintVerdict`）：④ `equal !== true`（既有行为）·
  //    ① `before≠after` 却 `equal:true` · ② 只有布尔 / 哈希不都是 64 hex · ③ 与 `anchors.code_fingerprint` 不符。
  //    一次就把原因码定死（先返回）：后面那些"一条 finding 落在哪"的判词建立在这份产物可信之上。
  const fp = isObject(findings) ? findings.code_fingerprint : null
  if (isObject(fp)) {
    const fpVerdict = codeFingerprintVerdict(fp, anchors?.code_fingerprint ?? null)
    if (!fpVerdict.ok) {
      fingerprintProblems.push({ code: fpVerdict.code, detail: fpVerdict.detail })
      return { ...empty(), code: fpVerdict.code, message: fpVerdict.detail }
    }
  }

  // ② 回执里的处置清单：**必须显式存在**（"零发现"要写 `[]`，缺字段不算零发现）
  if (!Array.isArray(receipt.findings)) {
    return {
      ...empty(),
      code: 'E_COVERAGE_MISSING',
      message: '回执里没有 findings 清单（零发现也必须显式写 `[]` —— 缺字段不许被读成"零发现"）',
    }
  }

  const findingIds = idListOf(findings, 'findings')
  if (findingIds === null) {
    return { ...empty(), code: 'E_ARG_SCHEMA', message: 'findings 那一侧既不是数组、也不是带 findings 数组的对象/Map' }
  }
  const fileIds = new Set(findingIds.filter((id) => typeof id === 'string' && id !== ''))

  const seen = new Map()
  for (const row of receipt.findings) {
    const id = isObject(row) ? row.id : undefined
    if (!isFilledString(id)) {
      dispositionProblems.push({ id: String(id ?? '(缺 id)'), code: 'E_ARG_SCHEMA', detail: '回执里每条处置都要有 id' })
      continue
    }
    seen.set(id, (seen.get(id) ?? 0) + 1)
    if (!fileIds.has(id)) extra.push(id)
  }
  for (const id of fileIds) if (!seen.has(id)) missing.push(id)
  for (const [id, n] of seen) if (n > 1) duplicate.push(id)

  // ③ 处置枚举与它各自的必填项（B3.2 的两行表）
  const anchorReportSha = isFilledString(anchors?.report_sha256) ? String(anchors.report_sha256).trim().toLowerCase() : null
  // ⚠️ **票库"拿不到" ≠ "票不存在"**：`tickets` 传 `null`/`undefined` 表示这一层**没有票库可查**
  //    （例如 `receipt-check` 在还没有路线的工作区里跑）⇒ 只判"adopted 有没有写票号"，
  //    **不判**票在不在、有没有验收、来源对不对。拿空数组冒充"票库里一张票都没有"会把正例判红。
  const ticketsKnown = Array.isArray(tickets)
  const ticketList = ticketsKnown ? tickets : []
  for (const row of receipt.findings) {
    if (!isObject(row)) continue
    const id = isFilledString(row.id) ? row.id : '(缺 id)'
    if (!DISPOSITIONS.includes(row.disposition)) {
      dispositionProblems.push({
        id, code: 'E_COVERAGE_DISPOSITION',
        detail: `disposition 必须是 ${DISPOSITIONS.join(' | ')}（只有两种，无第三种静默态），实得 ${JSON.stringify(row.disposition)}`,
      })
      continue
    }
    if (row.disposition === 'adopted') {
      if (!isFilledString(row.ticket_id)) {
        ticketProblems.push({ id, code: 'E_COVERAGE_TICKET', detail: 'adopted 必须给出 ticket_id（采纳 = 开票）' })
        continue
      }
      if (!ticketsKnown) continue
      const ticket = ticketList.find((t) => isObject(t) && t.id === row.ticket_id)
      if (ticket === undefined) {
        ticketProblems.push({ id, code: 'E_COVERAGE_TICKET', detail: `票 ${row.ticket_id} 不在 current.json.tickets 里（不许采纳到不存在的票）` })
        continue
      }
      if (!isFilledString(ticket.acceptance)) {
        ticketProblems.push({ id, code: 'E_COVERAGE_TICKET', detail: `票 ${row.ticket_id} 没有验收口径（acceptance 为空）` })
      }
      const src = /^technical-review:([0-9a-fA-F]{64})#/.exec(String(ticket.source ?? ''))
      if (src === null) {
        ticketProblems.push({ id, code: 'E_COVERAGE_TICKET', detail: `票 ${row.ticket_id} 的 source 形状不对（要 technical-review:<报告 sha256>#<finding id>）` })
      } else if (anchorReportSha !== null && src[1].toLowerCase() !== anchorReportSha) {
        ticketProblems.push({ id, code: 'E_COVERAGE_TICKET', detail: `票 ${row.ticket_id} 的 source 指的报告 ${src[1].slice(0, 12)}… 与回执的 report.sha256 对不上` })
      }
    } else {
      const reason = typeof row.reason === 'string' ? row.reason.trim() : ''
      if (reason === '') {
        reasonProblems.push({ id, code: 'E_COVERAGE_REASON', detail: 'rejected 必须写具体原因（空原因不是"不采纳"，是没写）' })
      } else if (charCountOf(reason) < REJECT_REASON_MIN_CHARS) {
        reasonProblems.push({ id, code: 'E_COVERAGE_REASON', detail: `rejected 的原因只有 ${charCountOf(reason)} 字（下限 ${REJECT_REASON_MIN_CHARS}）—— "不做"这种空泛话不算原因` })
      }
    }
  }

  // ④ 接手声明（B3.2）：taken-over 必须带来源与说明；**不许伪造"原组长已处置"**
  const handover = receipt.handover
  if (!isObject(handover) || !['fresh', 'taken-over'].includes(handover.mode)) {
    handoverProblems.push({ code: 'E_COVERAGE_HANDOVER', detail: `handover.mode 必须是 fresh | taken-over，实得 ${JSON.stringify(handover?.mode)}` })
  } else if (handover.mode === 'taken-over') {
    if (!Number.isInteger(handover.from_receipt_version) || handover.from_receipt_version < 1) {
      handoverProblems.push({ code: 'E_COVERAGE_HANDOVER', detail: `taken-over 必须写 from_receipt_version（接手自哪一版），实得 ${JSON.stringify(handover.from_receipt_version)}` })
    }
    if (!isFilledString(handover.statement)) {
      handoverProblems.push({ code: 'E_COVERAGE_HANDOVER', detail: 'taken-over 必须写 statement（说清接手自谁、知不知道原组长行动过）' })
    } else if (FORGED_HANDOVER_RE.test(handover.statement)) {
      handoverProblems.push({ code: 'E_COVERAGE_HANDOVER', detail: '接手声明里不许出现"原组长已处置/已处理/看过/同意了"这类伪造（B3.2）' })
    }
  }

  // ⑤ 锚点：回执自报的值必须与**独立锚点**逐项相同（自报不算锚）
  const receiptAnchorsOf = receiptAnchors(receipt)
  if (anchorReportSha !== null) {
    const own = isFilledString(receipt.report?.sha256) ? String(receipt.report.sha256).trim().toLowerCase() : null
    if (own === null) anchorProblems.push({ code: 'E_RECEIPT_HASH', detail: '回执缺 report.sha256 —— 报告锚点必填' })
    else if (own !== anchorReportSha) anchorProblems.push({ code: 'E_RECEIPT_HASH', detail: `report_sha256 与 findings 文件不一致（回执自报 ${own.slice(0, 12)}…，产物 ${anchorReportSha.slice(0, 12)}…）` })
  }
  const anchorSetSha = isFilledString(anchors?.findings_set_sha256) ? String(anchors.findings_set_sha256).trim().toLowerCase() : null
  if (anchorSetSha !== null) {
    const own = isFilledString(receipt.findings_set_sha256) ? String(receipt.findings_set_sha256).trim().toLowerCase() : null
    if (own === null) anchorProblems.push({ code: 'E_RECEIPT_HASH', detail: '回执缺 findings_set_sha256 —— 发现集锚点必填' })
    else if (own !== anchorSetSha) anchorProblems.push({ code: 'E_RECEIPT_HASH', detail: `findings_set_sha256 与产物不一致（回执自报 ${own.slice(0, 12)}…，产物 ${anchorSetSha.slice(0, 12)}…）` })
  }
  if (!Number.isInteger(receipt.version) || receipt.version < 1) {
    anchorProblems.push({ code: 'E_ARG_SCHEMA', detail: `回执 version 必须是 ≥1 的整数，实得 ${JSON.stringify(receipt.version)}` })
  }

  // ⑥ `F-121`：findings 入参是**带 `findings_set_sha256` 的文件对象**时，校验方自己复算一次。
  //    数组 / Map（以及解析结果那种 `findings` 是 Map 的形状）没有可比的声明值 ⇒ 这一格**不判**
  //    （不许凭空造一个"期望值"，也不许因为"判不了"就判红）。
  if (isObject(findings) && Array.isArray(findings.findings)) {
    const setVerdict = findingsSetVerdict(findings.findings, findings.findings_set_sha256)
    if (setVerdict.equal === false) {
      setHashProblems.push({
        code: 'E_RECEIPT_HASH',
        detail: `findings 内容的集合哈希与声明值对不上（声明 ${setVerdict.declared.slice(0, 12)}…，复算 ${setVerdict.computed.slice(0, 12)}…）—— 内容改一个字而声明不动，就是这一格（F-121）`,
      })
    }
  }

  // 判码次序 = 上面那几段的次序：先"漏/重/多"，再票、再理由、再枚举与接手、再锚点，最后集合哈希自洽。
  // 这样每个负例都能拿到**它自己那一族**的稳定码，而不是被另一族的码先截走。
  // ⚠️ 集合哈希自洽排在最后：一条 finding 落在哪是**逐条**判词，整份内容被动过是**整份**怀疑；
  //    两者同属校验拒绝族（exit 5），先报得出"哪一条漏了"的那一个更有用。
  const code = missing.length > 0 ? 'E_COVERAGE_MISSING'
    : duplicate.length > 0 ? 'E_COVERAGE_DUP'
      : extra.length > 0 ? 'E_COVERAGE_EXTRA'
        : ticketProblems.length > 0 ? 'E_COVERAGE_TICKET'
          : reasonProblems.length > 0 ? 'E_COVERAGE_REASON'
            : dispositionProblems.length > 0 ? 'E_COVERAGE_DISPOSITION'
              : handoverProblems.length > 0 ? 'E_COVERAGE_HANDOVER'
                : anchorProblems.length > 0 ? (anchorProblems[0].code === 'E_RECEIPT_HASH' ? 'E_RECEIPT_HASH' : 'E_ARG_SCHEMA')
                  : setHashProblems.length > 0 ? 'E_RECEIPT_HASH'
                    : null

  const firstDetail = [missing, duplicate, extra, ticketProblems, reasonProblems, dispositionProblems, handoverProblems, anchorProblems, setHashProblems]
    .flatMap((list) => list.map((row) => (typeof row === 'string' ? row : row.detail)))[0] ?? ''

  return {
    ok: code === null,
    missing, duplicate, extra, ticketProblems, reasonProblems, dispositionProblems,
    handoverProblems, anchorProblems, fingerprintProblems, setHashProblems,
    tickets_checked: ticketsKnown,
    receipt_anchors: receiptAnchorsOf,
    code,
    message: code === null ? '' : firstDetail,
  }
}

// ── 版本化 ─────────────────────────────────────────────────────────────────
/** 把三种可接受形状归一成"已存在的版本号数组"：`[1,3]` / `{versions:[…]}` / `{receipt_version:n}` / null。 */
export function normalizeReceiptVersions(existing) {
  const raw = Array.isArray(existing) ? existing
    : Array.isArray(existing?.versions) ? existing.versions
      : Number.isInteger(existing?.receipt_version) ? [existing.receipt_version]
        : Number.isInteger(existing) ? [existing]
          : []
  return [...new Set(raw.filter((v) => Number.isInteger(v) && v >= 1))].sort((a, b) => a - b)
}

/**
 * **C-4（追加裁定 v1.2）**：下一版回执号 = 现存版本里的 max + 1；无历史 ⇒ 1。
 *
 * **空洞不填**（有 1、3 时下一版是 4，不是 2）；重复 max 也 +1；乱序无所谓。
 *
 * @param {number[]|{versions?:number[]}|{receipt_version?:number}|number|null} existing
 * @returns {number}
 */
export function nextReceiptVersion(existing) {
  const versions = normalizeReceiptVersions(existing)
  return versions.length === 0 ? 1 : Math.max(...versions) + 1
}

/**
 * 🔴 **回执写入判定 —— C-6 的唯一产生面。**
 *
 * 拒两种情形（都返回 `E_RECEIPT_OVERWRITE`，**绝不静默覆盖**）：
 *   ① 目标版本已经存在（盘上有那一版文件，或登记册里已经有这一版）；
 *   ② 调用方带了 `expected_version`，而它与当前 head 不符（并发/过期调用方）。
 *
 * 调用方**必须**先用 `nextReceiptVersion(existing)` 取新版本再写。
 *
 * @param {object} spec
 * @param {*} spec.existing 已存在的版本（形状同 `nextReceiptVersion` 的入参；另接受 `{head_version}`）
 * @param {number} spec.version 本次要写的版本
 * @param {number|null} [spec.expected_version] 调用方以为的 head（可省）
 * @param {boolean} [spec.target_exists] 目标**文件**是否已经在盘上（由调用方探）
 * @returns {{ok:true, code:null, version:number, head:number, message:string}
 *          |{ok:false, code:string, version:number|null, head:number, message:string}}
 */
export function receiptWriteVerdict(spec = {}) {
  const versions = normalizeReceiptVersions(spec.existing)
  const head = Number.isInteger(spec?.existing?.head_version) ? spec.existing.head_version
    : (versions.length === 0 ? 0 : Math.max(...versions))
  const want = spec.version
  if (!Number.isInteger(want) || want < 1) {
    return { ok: false, code: 'E_ARG_SCHEMA', version: null, head, message: `receipt_version 必须是 ≥1 的整数，实得 ${JSON.stringify(want)}` }
  }
  if (spec.target_exists === true) {
    return {
      ok: false, code: RECEIPT_OVERWRITE_CODE, version: want, head,
      message: `第 ${want} 版回执的目标文件已经在盘上 —— 不许静默覆盖（要么先 superseded_by 指向新版，要么用 nextReceiptVersion 取下一版）`,
    }
  }
  if (versions.includes(want)) {
    return {
      ok: false, code: RECEIPT_OVERWRITE_CODE, version: want, head,
      message: `第 ${want} 版回执已经登记过（现存 ${versions.join(', ')}）—— 不许静默覆盖；下一版是 ${nextReceiptVersion(versions)}（空洞不填）`,
    }
  }
  const expected = spec.expected_version
  if (expected !== undefined && expected !== null && expected !== head) {
    return {
      ok: false, code: RECEIPT_OVERWRITE_CODE, version: want, head,
      message: `expected_version=${JSON.stringify(expected)} 与当前 head=${head} 不符 —— 调用方手上是旧读数，绝不覆盖`,
    }
  }
  return { ok: true, code: null, version: want, head, message: '' }
}
