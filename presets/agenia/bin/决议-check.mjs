#!/usr/bin/env node
/**
 * **决议-check —— 三册账本的检查器**（构案 0012 的机器侧判词）。
 *
 * 规格：`.team/test/2026-11-15/CONTRACT-0012.md`（下称「契约」）。
 *
 * 八个 op（`--op=<x>` 与 `--op <x>` 两种写法都收；`--root` 缺省 = `.`）：
 *
 *   · `check`（缺省）—— 只读，判六件事：① 三册在（缺册 / 旧树还在 / 册里混进别的文件）
 *       ② 头字段两套（产品**没有父** · 构案**必须有父**、主父在来源列表里、**且父解析得到一条生效记录**）
 *       ③ 三张派生页与重算逐字节相同 ④ 产品→构案 ⑤ 缺陷→构案 ⑥ 构案→文件（`依据:`）。
 *       读数带**链的四段**（`parent` + 三条链）+ `legacy_disposed`；`chain.bug` 按**五组**印
 *       （`closed_by_scheme` / `closed_judged_false` / `legacy_closed` / `deferred_open` / `legacy_frozen`）。
 *       `--today=YYYY-MM-DD` 是「暂缓过期」那条判据的**注入时钟**（缺省 = 本机今天）。
 *   · `init` —— 建 `账本/{产品,缺陷,构案}/` + 三张派生页骨架。**幂等**：已建的一个字节都不动。
 *   · `index` —— **唯一**允许写派生页的 op（三张一起重写，跑两次字节相同）。
 *   · `fold` —— 折叠缺陷册（调 `lib/缺陷折叠.mjs`，自己不折）。
 *   · `reconcile --archive=<旧 ledger.json>` —— 与旧台账逐条对账（**按 kind 的键宇宙**：
 *     `registered` / `assessed` / `disposed` / **`bookkeeping`（兜底：旧账的册级书签）** 四族各自取
 *     「旧台账视图 ∪ 事件视图」的全集，逐键比 identical / missing / differing，报文点名 id + kind + 键；
 *     比对面不手写），差异逐条点名。
 *   · `gate2-card --card=<路径>` —— 第 2 关拒接闸的新词表（`票类: 产品 | 构案`，+ `数据` 的具名豁免）。
 *   · `card-land --card=… --day=… --role=…` —— **先落盘、再过闸**：被拒的卡照样在盘上，逐字节相同。
 *   · `supersede <旧编号> --by <新编号>` —— 写手：只翻旧文头块两个字段，正文一个字节不动。
 *
 * 🔴 解析面只有一份：书怎么读、头怎么拆、页怎么渲染，全在 `../lib/决议-ledger.mjs`；
 *   缺陷怎么折，全在 `../lib/缺陷折叠.mjs`。本文件只做**参数、op、输出**。
 *
 * 退出码（契约 §10.1）：`0` 无 problems · `1` 有 problems · `3` 用法或根不成立。
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, statSync, writeSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileAtomic } from '../lib/atomic.mjs'
import { emit, parseArgs } from '../lib/cli-harness.mjs'
import {
  BOOKS, DASH, INDEX_REL_OF, LEDGER_REL, REPO_ROOT,
  dedupeProblems, problem, readText, renderIndexPage, resolveRef,
  scanLedger, splitHeaderBlock,
} from '../lib/决议-ledger.mjs'
import { foldBugBook } from '../lib/缺陷折叠.mjs'

/** 一份字节的 sha256（小写 hex）。 */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// ── 派生页：唯一一处"读三册 → 渲染三张页" ────────────────────────────────────
/** 三册现在的样子（`index` 与 `init` 都用它；`init` 传空内容）。 */
function pagesOf(root, { empty = false } = {}) {
  if (empty) {
    return Object.fromEntries(BOOKS.map((b) => [b, renderIndexPage(b, { decisions: [], states: [], conceptRows: [] })]))
  }
  const scan = scanLedger(root)
  const ctx = { decisions: scan.decisions, states: scan.states, conceptRows: scan.concepts }
  return Object.fromEntries(BOOKS.map((b) => [b, renderIndexPage(b, ctx)]))
}

// ── op: init ───────────────────────────────────────────────────────────────
/**
 * 建骨架。**幂等**：目录已在该什么都不做（`mkdirSync` 递归不报）；页已在该一个字节都不写。
 * 这样"再跑一次 init"对树的哈希没有影响（契约 §10.1 的 `INIT-NOT-IDEMPOTENT` 就是钉这个）。
 */
export function runInit({ root }) {
  const created = []
  const problems = []
  const pages = pagesOf(root, { empty: true })
  for (const book of BOOKS) {
    const dir = path.join(root, LEDGER_REL, book)
    const existed = existsSync(dir)
    try {
      mkdirSync(dir, { recursive: true })
    } catch (err) {
      problems.push(problem('E_TXN_IO', `${LEDGER_REL}/${book}/ 建不出来（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { file: `${LEDGER_REL}/${book}` }))
      continue
    }
    if (!existed) created.push(`${LEDGER_REL}/${book}`)
  }
  for (const book of BOOKS) {
    const rel = INDEX_REL_OF(book)
    const file = path.join(root, rel)
    if (existsSync(file)) continue
    const written = writeFileAtomic(file, pages[book])
    if (!written.ok) {
      problems.push(problem('E_TXN_IO', `${rel} 写不进去：${written.code} ${written.message}`, { file: rel }))
      continue
    }
    created.push(rel)
  }
  return { ok: problems.length === 0, root: path.resolve(root), op: 'init', created, problems }
}

// ── op: index ──────────────────────────────────────────────────────────────
/** 重写三张派生页（**唯一**写页的地方）。幂等：同样的输入 ⇒ 同样的字节。 */
export function runIndex({ root }) {
  const scan = scanLedger(root)
  if (!scan.ledger_present) {
    return {
      ok: false, root: path.resolve(root), op: 'index', written: [],
      problems: scan.problems.length > 0
        ? scan.problems
        : [problem('LEDGER-NOT-INITIALISED', `${LEDGER_REL}/ 不在 ${path.resolve(root)} —— 先跑 --op init（契约 §1.1）`, { file: LEDGER_REL })],
    }
  }
  const pages = {
    产品: renderIndexPage('产品', { decisions: scan.decisions }),
    构案: renderIndexPage('构案', { decisions: scan.decisions, conceptRows: scan.concepts }),
    缺陷: renderIndexPage('缺陷', { states: scan.states }),
  }
  const written = []
  const problems = []
  for (const book of BOOKS) {
    // 册不在 ⇒ 不写它的页：`--op index` 不许顺手把缺的那一册建出来（那会让 `BOOK-MISSING` 消失）
    if (!statIsDir(path.join(root, LEDGER_REL, book))) continue
    const rel = INDEX_REL_OF(book)
    const out = writeFileAtomic(path.join(root, rel), pages[book])
    if (!out.ok) {
      problems.push(problem('E_TXN_IO', `${rel} 写不进去：${out.code} ${out.message}`, { file: rel }))
      continue
    }
    written.push(rel)
  }
  return { ok: problems.length === 0, root: path.resolve(root), op: 'index', written, problems }
}

// ── op: fold / reconcile ───────────────────────────────────────────────────
/** 折叠（唯一的实现是 `lib/缺陷折叠.mjs`；这里只转手）。 */
export function runFold({ root }) {
  const folded = foldBugBook({ root })
  return { ok: folded.problems.length === 0, root: path.resolve(root), op: 'fold', states: folded.states, problems: folded.problems }
}

/**
 * 对账的**四族**：缺陷事件的三个 kind（`registered` / `assessed` / `disposed`）+ **兜底那一族**
 * `bookkeeping`（旧台账的册级书签）。
 *
 * 🔴 **比对面不手写**：按 kind 取「旧台账视图 ∪ 事件载荷」的**键宇宙**，逐键比。
 * 为什么（2026-11-15 第 4 关 r2 · M-5/M-6）：手写的七字段表已经两次比数据窄 ——
 * 上一轮漏 `registered` 的四个字段，这一轮漏 `assessed` 的 `fix_sketch` / `cost`。
 * 手写表只要有人加字段就再漏一次；键宇宙是从数据自己长出来的（契约 §4.2）。
 *
 * 🔴 `bookkeeping` 为什么也进比对面（2026-11-15 第 4 关 r3 · M-2）：它是唯一一个**旧台账有、事件里没有**
 * 的族（读面按写者身份写死 `'leader'`）。不把它变成一族，它就是一个自由槽：把新键往这里一塞，
 * `FOLD-ARCHIVE-KEY-UNCLASSIFIED` 就绿了，而键不在比对面 —— 同一个病换门口。现在这一族的期望侧是
 * 「旧账的 `author`」，实际侧是「读面会写死的那个常量」：153 条里有一条不是 `'leader'`，折叠就把它
 * 静默替换掉了 ⇒ 那一格当场红（`FOLD-DIFF`），不是绿。
 */
export const RECONCILE_KINDS = Object.freeze(['registered', 'assessed', 'disposed', 'bookkeeping'])

/** 读面给每条缺陷写死的书签值（`ledgerFromBugBook` 的 `author: 'leader'`）——兜底那一族的实际侧。 */
export const BOOKKEEPING_AUTHOR = 'leader'

/** 事件信封：`seq` / `kind` 是流的结构，不是记录字段（形状由折叠判 `BUG-EVENT-SHAPE`）。 */
export const EVENT_ENVELOPE_KEYS = Object.freeze(['seq', 'kind'])

const hasOwn = (value, key) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.prototype.hasOwnProperty.call(value, key)

/**
 * 旧台账的键 → 本族的键（只改名，不改值）。
 * `kind` 是旧台账的"条目种类"（`bug`），在事件里叫 `entry_kind`；`registered_at` 就是事件的 `at`。
 */
const REGISTERED_KEYS = Object.freeze({
  id: 'id', kind: 'entry_kind', phenomenon: 'phenomenon', reporter: 'reporter', source: 'source',
  tags: 'tags', how_seen: 'how_seen', evidence: 'evidence', recipe: 'recipe', batch: 'batch',
  finding_refs: 'finding_refs', registered_at: 'at',
})

/**
 * 旧台账一行混着三族 + 册级书签。**每个键都要分类**（`FOLD-ARCHIVE-KEY-UNCLASSIFIED` 守它）：
 *   · `registered` —— 登记那一族（表见 `REGISTERED_KEYS`）；
 *   · `assessed`   —— 评估那一族：嵌套的 `assessment.*` + **条目级**的 `line_decision` /
 *                     `escalated_at` / `card_red`（读面 `ledgerFromBugBook` 从 `assessed_payload` 取它们）；
 *   · `disposed`   —— 处置那一族：`disposition.*`；
 *   · `bookkeeping`—— **钉死**成 `['author']`：读面按写者身份写死 `'leader'`，它不在事件载荷里。
 *     这一格不许当自由槽：往这里塞一个新键，`FOLD-ARCHIVE-KEY-UNCLASSIFIED` 就绿了，而它**不在**比对面
 *     —— 那正是"比对面比数据窄"换一个门口复发（2026-11-15 第 4 关 r3 · M-2）。
 * 分类表**不是比对面**：比的是每一族视图里**实际出现的键的并集**。分类只保证"旧台账新加一个键，
 * 要么进某一族、要么当场红"，不让它静默落在比较面之外。
 */
export const ARCHIVE_KEY_PARTITION = Object.freeze({
  registered: Object.keys(REGISTERED_KEYS),
  assessed: Object.freeze(['assessment', 'line_decision', 'escalated_at', 'card_red']),
  disposed: Object.freeze(['disposition']),
  bookkeeping: Object.freeze(['author']),
})

/**
 * 一个值的**规范形**（两条读数用同一份口径比）：
 * `undefined` 与 `null` 同义（"字段不在"与"值为空"在这里是同一件事）；
 * 对象 / 数组按键排序后序列化 —— `JSON.stringify` 的键序会让"同值不同序"假红。
 */
export function canonicalJson(value) {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * 旧台账一条在某个 kind 下的**视图**（expected 侧）。**只搬键**、不补默认值 ——
 * 旧台账没有的键，视图里也没有：presence 本身是数据（回填要逐字，见 §3.1）。
 *
 * 三处派生（写在契约 §4.2，别在别处再补一份）：
 *   · `kind` → `entry_kind`、`registered_at` → `at`（改名）；
 *   · `assessment.*` / `disposition.*` 摊平 / 整体搬（嵌套载荷）；
 *   · `历史: disposition.value` —— 旧台账里的每条处置都是**迁移前**写的，
 *     所以它在事件里必然带 `历史`（契约 §3.2）；这是本对账唯一一处补值。
 *   · `disposition.at` → `at`（改名）：`disposed` 事件的顶层 `at` 就是处置那一刻，
 *     旧台账把同一个值记在 `disposition.at` 里 —— 与 `registered_at → at` 同一条规则。
 *
 * `assessed` 这一族的**存在条件**（2026-11-15 第 4 关 r3 · M-2）：`assessment` 非空，**或**条目级三格
 * 里有一个带信息（`line_decision` 在 / `escalated_at` 非空 / `card_red === true`）。为什么不是
 * "`assessment` 非空"一条：旧台账每条都有 `escalated_at` / `card_red` 两个键（31 条没有评估的记成
 * `null` / `false`），那是**行默认值**不是数据 —— 拿它当"这一族存在"会把 31 条读成"事件流丢了整族"。
 * 反过来，`line_decision` 是"没有正式评估也落了决定"的唯一载体：它在这一族里，就必须能被看见。
 */
export function archiveKindView(entry, kind) {
  const view = {}
  if (entry === null || typeof entry !== 'object') return view
  if (kind === 'registered') {
    for (const [from, to] of Object.entries(REGISTERED_KEYS)) {
      if (hasOwn(entry, from)) view[to] = entry[from]
    }
    return view
  }
  if (kind === 'assessed') {
    const hasAssessment = hasOwn(entry, 'assessment') && entry.assessment !== null
    const extras = ['line_decision', 'escalated_at', 'card_red']
      .filter((k) => hasOwn(entry, k) && !(entry[k] === null || entry[k] === false))
    // 旧台账 31 条没有 `assessment`（`null`）且条目级三格全是行默认值 ⇒ 那一族对它们**不存在**（不是"空视图"）。
    if (!hasAssessment && extras.length === 0) return view
    if (hasOwn(entry, 'id')) view.id = entry.id
    if (hasAssessment) for (const [k, v] of Object.entries(entry.assessment)) view[k] = v
    for (const k of ['line_decision', 'escalated_at', 'card_red']) {
      if (hasOwn(entry, k)) view[k] = entry[k]
    }
    return view
  }
  // disposed
  if (kind === 'disposed') {
    if (hasOwn(entry, 'id')) view.id = entry.id
    if (hasOwn(entry, 'disposition')) {
      view.disposition = entry.disposition
      if (entry.disposition !== null && hasOwn(entry.disposition, 'value')) view['历史'] = entry.disposition.value
      if (entry.disposition !== null && hasOwn(entry.disposition, 'at')) view.at = entry.disposition.at
    }
    return view
  }
  // bookkeeping（兜底那一族）：旧账的册级书签，**只搬 `author`**（分类表钉死的一个键）
  if (hasOwn(entry, 'id')) view.id = entry.id
  if (hasOwn(entry, 'author')) view.author = entry.author
  return view
}

/**
 * 折叠出来的现状在某个 kind 下的**视图**（actual 侧）。
 * 三族都读折叠带出来的**载荷原件**（`registered_payload` / `assessed_payload` / `disposed_payload`）：
 * 事件里有几个键，视图里就有几个键，只剔除信封的 `seq` / `kind`。**不许**在这里按字段名挑拣 ——
 * 挑掉一个键，产品视图与测试 oracle 就同时看不见它（2026-11-15 第 4 关 r3 · M-2）。
 */
export function eventKindView(state, kind) {
  if (state === null || typeof state !== 'object') return null
  if (kind === 'bookkeeping') {
    // 兜底那一族：事件载荷里**没有**这一格；读面给每条记录写死 `author: 'leader'`。
    // 实际侧就是读面会写出来的那个值 —— 旧账里有一条不是它，这里就红（数据会在折叠时被静默替换掉）。
    if (state.registered_payload === null || typeof state.registered_payload !== 'object') return null
    return { id: state.id, author: BOOKKEEPING_AUTHOR }
  }
  const payload = kind === 'registered' ? state.registered_payload
    : kind === 'assessed' ? state.assessed_payload
      : kind === 'disposed' ? state.disposed_payload
        : null
  if (payload === null || typeof payload !== 'object') return null
  const view = {}
  for (const [k, v] of Object.entries(payload)) {
    if (EVENT_ENVELOPE_KEYS.includes(k)) continue
    view[k] = v
  }
  return view
}

/** 报文里的一格值：规范形，太长就截断（全量留在 `diffs[]` 里）。 */
function showFieldValue(value, max = 240) {
  const text = canonicalJson(value)
  return text.length > max ? `${text.slice(0, max)}…（共 ${text.length} 字符）` : text
}

/**
 * 逐 kind 比「旧台账视图」与「事件视图」：键宇宙 = 两侧键的并集，逐键记
 * identical / missing / differing（外加两边都没有的 `absent`，四数之和 = `compared`）。
 *
 * 为什么 presence 也判：只比值的对账会漏掉「值是 null 的键被删掉」——
 * `undefined` 与 `null` 在 `canonicalJson` 里同义。回填是逐字搬，presence 也是数据。
 * `id` 同时出现在三族视图里（记录身份），归 `registered` 那一族的分类表。
 */
function compareKind(kind, archiveEntries, states, archiveIds, presentIds, archiveUpdatedAt) {
  const want = new Map()
  for (const entry of archiveEntries) {
    const view = archiveKindView(entry, kind)
    if (Object.keys(view).length > 0) want.set(String(entry.id), view)
  }
  const got = new Map()
  for (const state of states) {
    const view = eventKindView(state, kind)
    if (view !== null) got.set(String(state.id), view)
  }
  const keys = new Set()
  for (const view of want.values()) for (const k of Object.keys(view)) keys.add(k)
  for (const view of got.values()) for (const k of Object.keys(view)) keys.add(k)
  const table = {}
  for (const k of [...keys].sort()) table[k] = { identical: 0, missing: 0, missing_side: {}, differing: 0, absent: 0 }
  const diffs = []
  const missingKeys = []
  const missingKinds = []
  const postMigrationKinds = []
  let compared = 0
  const ids = [...new Set([...want.keys(), ...got.keys()])].sort()
  for (const id of ids) {
    const a = want.get(id)
    const b = got.get(id)
    // 只比两边都**在旧台账里**的记录：迁移之后新登记的不可能在这份归档里（外层 `post_migration` 已单列）。
    if (!archiveIds.has(id)) continue
    // 整条记录丢了（旧台账有、事件流没有）由外层 `FOLD-TOTAL-MISMATCH` 点名 ——
    // 这里不再按三族各报一次（同一个病只报一条，契约 §9.3）。
    if (!presentIds.has(id)) continue
    if (a === undefined) {
      // 事件流里这一族有、旧台账没有：**迁移之后补记的**（`at` 晚于归档）不算损失；
      // 早于归档的才是"归档里有、事件流漏折了"（下面这一支）。
      const at = Date.parse(b?.at ?? '')
      if (Number.isFinite(archiveUpdatedAt) && Number.isFinite(at) && at > archiveUpdatedAt) {
        postMigrationKinds.push({ id, kind })
        continue
      }
      missingKinds.push({ id, kind, side: 'archive' })
      continue
    }
    if (b === undefined) {
      missingKinds.push({ id, kind, side: 'event' })
      continue
    }
    compared += 1
    for (const k of keys) {
      const ah = hasOwn(a, k)
      const bh = hasOwn(b, k)
      if (!ah && !bh) { table[k].absent += 1; continue }
      if (ah && !bh) {
        table[k].missing += 1
        table[k].missing_side.event = (table[k].missing_side.event ?? 0) + 1
        missingKeys.push({ id, kind, field: k, side: 'event' })
        continue
      }
      if (!ah && bh) {
        table[k].missing += 1
        table[k].missing_side.archive = (table[k].missing_side.archive ?? 0) + 1
        missingKeys.push({ id, kind, field: k, side: 'archive' })
        continue
      }
      if (canonicalJson(a[k]) === canonicalJson(b[k])) { table[k].identical += 1; continue }
      table[k].differing += 1
      diffs.push({ id, kind, field: k, expected: canonicalJson(a[k]), actual: canonicalJson(b[k]) })
    }
  }
  return {
    kind, archive_records: want.size, event_records: got.size, compared,
    keys: table, diffs, missing_keys: missingKeys, missing_kinds: missingKinds, post_migration_kinds: postMigrationKinds,
  }
}

/**
 * 与旧台账逐条对账（契约 §4.2）。判四件：
 *   ① **条数**：旧台账每条都要折得出来（缺一条 ⇒ `FOLD-TOTAL-MISMATCH` 点名 id）；
 *      迁移之后**新登记**的条目不是损失（按 `registered_at` 晚于旧台账 `updated_at` 归档为
 *      `post_migration` 读数，不算问题）；同一条时间窗之外多出来的 id 才算 `FOLD-TOTAL-MISMATCH`。
 *   ② **逐 kind 的键宇宙**（`registered` / `assessed` / `disposed`）：每族的键 = 旧台账视图 ∪ 事件视图，
 *      逐键记 identical / missing / differing；缺键 ⇒ `FOLD-FIELD-MISSING`，值不同 ⇒ `FOLD-DIFF`，
 *      整族记录（如 `assessed` 事件）丢了 ⇒ `FOLD-KIND-MISSING`。报文点名 id + kind + 键。
 *   ③ **旧台账的键必须全部分类**（`ARCHIVE_KEY_PARTITION`）：新加一个字段而不分类 ⇒
 *      `FOLD-ARCHIVE-KEY-UNCLASSIFIED` —— 否则它落在比对面之外，"比对面比数据窄"就会再犯一次。
 *   ④ 读数：`kinds` 里逐族逐键的四数（identical + missing + differing + absent = compared）。
 */
export function runReconcile({ root, archive }) {
  const out = {
    ok: false, root: path.resolve(root), op: 'reconcile', archive: archive ?? null,
    archive_entries: 0, folded_states: 0, compared: 0, legacy_disposed: 0,
    kinds: {}, post_migration: [], diffs: [], problems: [],
    /** 分类表本身也印出来：`bookkeeping` 是不是被钉死、哪一族收哪些旧账键，读的人不用猜。 */
    archive_key_partition: Object.fromEntries(Object.entries(ARCHIVE_KEY_PARTITION).map(([k, v]) => [k, [...v]])),
  }
  if (typeof archive !== 'string' || archive === '' || !existsSync(archive)) {
    out.problems.push(problem('FOLD-ARCHIVE-MISSING', `对账的旧台账读不出来：${JSON.stringify(archive ?? null)} —— `
      + '迁移的回滚点必须在（0012 §⑤ 归档到 .team/_archive/）', { file: String(archive ?? '') }))
    return out
  }
  let json = null
  try {
    json = JSON.parse(readFileSync(archive, 'utf8'))
  } catch (err) {
    out.problems.push(problem('FOLD-ARCHIVE-MISSING', `旧台账解析不了（${err?.name ?? 'Error'}）：${archive}`, { file: archive }))
    return out
  }
  const entries = Array.isArray(json?.entries) ? json.entries : null
  if (entries === null) {
    out.problems.push(problem('FOLD-ARCHIVE-MISSING', `旧台账里没有 \`entries\` 数组：${archive}`, { file: archive }))
    return out
  }
  const folded = foldBugBook({ root })
  out.problems.push(...folded.problems)
  out.archive_entries = entries.length
  out.folded_states = folded.states.length
  out.legacy_disposed = folded.states.filter((s) => s.disposition !== null && s.disposition !== undefined && s.chain.kind === 'legacy').length
  const archiveIds = new Set(entries.map((e) => String(e.id)))
  const stateIds = new Set(folded.states.map((s) => String(s.id)))
  const archiveUpdatedAt = typeof json?.updated_at === 'string' ? Date.parse(json.updated_at) : Number.NaN
  for (const id of [...archiveIds].filter((x) => !stateIds.has(x)).sort()) {
    out.problems.push(problem('FOLD-TOTAL-MISMATCH', `旧台账有 ${id}，缺陷册里折叠不出来 —— 迁移丢了一条（契约 §4.2-1）`, { id }))
  }
  for (const state of folded.states) {
    const id = String(state.id)
    if (archiveIds.has(id)) continue
    const registeredAt = Date.parse(state.registered_at ?? '')
    // 归档是迁移那一刻的回滚点：之后新登记的不是"多出来一条"（事件流 append-only）。
    // 时间读不出来 ⇒ fail-closed（按"多出来"报），不许把判不了的当合法。
    if (Number.isFinite(archiveUpdatedAt) && Number.isFinite(registeredAt) && registeredAt > archiveUpdatedAt) {
      out.post_migration.push({ id, registered_at: state.registered_at })
      continue
    }
    out.problems.push(problem('FOLD-TOTAL-MISMATCH', `缺陷册里有 ${id}（${state.registered_at ?? 'registered_at 读不出来'}），`
      + `旧台账里没有、也不晚于归档的 updated_at（${json?.updated_at ?? '读不出来'}）—— 多出来一条（契约 §4.2-1）`, { id }))
  }
  // ③ 旧台账的键分类（覆盖，不要求互斥）：漏一个 = 它不在比对面里。
  const classified = new Set([...Object.values(ARCHIVE_KEY_PARTITION).flat()])
  const unclassified = new Map()
  for (const entry of entries) {
    for (const key of Object.keys(entry)) {
      if (classified.has(key)) continue
      const hit = unclassified.get(key) ?? { key, ids: [] }
      if (hit.ids.length < 5) hit.ids.push(String(entry.id))
      unclassified.set(key, hit)
    }
  }
  for (const { key, ids } of [...unclassified.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    out.problems.push(problem('FOLD-ARCHIVE-KEY-UNCLASSIFIED', `旧台账的键 \`${key}\` 没有分类（${ids.join(' / ')}…）—— `
      + '它落在比对面之外：把它归进 registered / assessed / disposed 之一，或写进 bookkeeping（契约 §4.2-3）', { field: key }))
  }
  // ② 逐 kind 的键宇宙
  for (const kind of RECONCILE_KINDS) {
    const result = compareKind(kind, entries, folded.states, archiveIds, stateIds, archiveUpdatedAt)
    out.kinds[kind] = result
    for (const miss of result.missing_kinds) {
      out.problems.push(problem('FOLD-KIND-MISSING', `${miss.id} 的 \`${kind}\` 记录在${miss.side === 'event' ? '事件流' : '旧台账'}里缺了 —— `
        + '整族记录丢了，不是某个键丢了（契约 §4.2-2）', { id: miss.id, kind, side: miss.side }))
    }
    for (const miss of result.missing_keys) {
      out.problems.push(problem('FOLD-FIELD-MISSING', `${miss.id} 的 \`${kind}.${miss.field}\` 在${miss.side === 'event' ? '事件流' : '旧台账'}里缺这个键 —— `
        + '缺键也是数据损失（presence 是数据，契约 §4.2-2）', { id: miss.id, kind, field: miss.field, side: miss.side }))
    }
    for (const diff of result.diffs) {
      out.diffs.push(diff)
      const clip = (text) => (text.length > 240 ? `${text.slice(0, 240)}…（共 ${text.length} 字符）` : text)
      out.problems.push(problem('FOLD-DIFF', `${diff.id} 的 \`${kind}.${diff.field}\` 对不上：旧台账 ${clip(diff.expected)}`
        + ` / 折叠 ${clip(diff.actual)}（契约 §4.2-2）`, { id: diff.id, kind, field: diff.field }))
    }
  }
  out.compared = [...archiveIds].filter((id) => stateIds.has(id)).length
  out.problems = dedupeProblems(out.problems)
  out.ok = out.problems.length === 0
  return out
}

// ── 卡片闸（契约 §7）───────────────────────────────────────────────────────
/** 票类的闭集（逐字）。旧的 `新机制` 不再收 —— fail-closed。 */
export const TICKET_KINDS = Object.freeze(['产品', '构案', '数据'])
/** 卡头块里认得的键（逐字）。 */
export const CARD_KEYS = Object.freeze(['票类', '产品', '构案', '依据'])

/**
 * 派工卡的头块 —— 只认「H1 → 一行空行 → 到第一条空行」这一段（与决议文件同一份切法）；
 * 每个键最多一次；头块之外写 `票类:` 一律不算结构化字段（报了名拒）。
 */
export function parseCardText(text) {
  const split = splitHeaderBlock(text)
  if (!split.ok) return { ok: false, h1: null, fields: {}, duplicates: [], stray_kinds: [], problems: [{ code: 'GATE2-CARD-MISSING', message: split.why }] }
  const fields = {}
  const duplicates = []
  for (const { text: lineText } of split.block) {
    const m = /^\s*([^:：\s]+)\s*[:：]\s*(.*)$/u.exec(lineText)
    if (m === null) continue
    const key = m[1]
    if (fields[key] !== undefined) duplicates.push(key)
    else fields[key] = m[2].trim()
  }
  const strayKinds = []
  split.lines.forEach((line, idx) => {
    const lineNo = idx + 1
    if (lineNo >= split.range.from && lineNo <= split.range.to) return
    if (/^\s*票类\s*[:：]/u.test(line)) strayKinds.push(lineNo)
  })
  return { ok: true, h1: split.h1, fields, duplicates, stray_kinds: strayKinds, problems: [] }
}

const DATA_KINDS = new Set(['数据', '数据票'])
/** 数据票的改动面里不许出现的东西（机制代码面）。 */
const CODE_PATHS = ['presets/', '.tools/', '账本/']

/**
 * 第 2 关拒接闸（契约 §7.1）。**判定次序钉死**：① 卡读不读得到 → ② 头块 / 票类词表 →
 * ③ 票类要的那个轴上的号码（产品 / 构案）→ ④ `依据` 与构案头一致。前面那一格不过就**不再**报后面那格。
 *
 * fail-closed 的每一处：读不到卡 ⇒ 拒；头块不成立 / 缺 `票类` ⇒ 拒；`票类` 写两行 ⇒ 拒；
 * 正文里另有一行 `票类` ⇒ 拒（票类只认结构化头块）。
 */
export function runGate2Card({ root, card }) {
  const out = {
    ok: false, root: path.resolve(root), op: 'gate2-card',
    verdict: 'refuse', code: null, card: card ?? null,
    ticket_kind: null, decision: null, product: null, basis: null, problems: [], readings: {},
  }
  const refuse = (code, message, extra = {}) => {
    out.verdict = 'refuse'
    out.code = code
    out.problems = [problem(code, message, extra)]
    out.ok = false
    return out
  }
  if (typeof card !== 'string' || card === '' || !existsSync(card)) {
    return refuse('GATE2-CARD-MISSING', `派工卡读不出来：${JSON.stringify(card ?? null)} —— 读不到卡就是拒（契约 §7.2）`)
  }
  const text = readText(card)
  if (text === null) return refuse('GATE2-CARD-MISSING', `派工卡读不出来：${card}`)
  const parsed = parseCardText(text)
  if (!parsed.ok) return refuse('GATE2-CARD-MISSING', `派工卡 ${card} 的头块不成立：${parsed.problems[0].message}`)
  if (parsed.stray_kinds.length > 0) {
    return refuse('GATE2-TICKET-KIND-NOT-STRUCTURED', `${card} 的第 ${parsed.stray_kinds.join(' / ')} 行不在头块里、却写着 \`票类:\` —— `
      + '这道闸只认卡首的结构化头块（H1 → 空行 → 到第一个空行）；正文 / 例子 / 引用里的 `票类` 不算数（契约 §7.1）')
  }
  if (parsed.duplicates.includes('票类')) {
    return refuse('GATE2-TICKET-KIND-AMBIGUOUS', `${card} 的头块里 \`票类\` 写了两行 —— 票类必须恰好一格（契约 §7.1）`)
  }
  const kindRaw = parsed.fields['票类']
  out.ticket_kind = kindRaw ?? null
  if (kindRaw === undefined) {
    return refuse('GATE2-TICKET-KIND-MISSING', `${card} 的头块里没有 \`票类:\` —— 漏写一格不许绕过闸（fail-closed）；`
      + `认得的三个词是 ${TICKET_KINDS.join(' / ')}（契约 §7.1）`)
  }
  if (!TICKET_KINDS.includes(kindRaw)) {
    return refuse('GATE2-TICKET-KIND-MISSING', `${card} 的 \`票类: ${kindRaw}\` 不认识 —— 只认 ${TICKET_KINDS.join(' / ')} `
      + '（旧的 `新机制` 不再收；fail-closed，契约 §7.1）')
  }
  for (const key of ['产品', '构案', '依据']) {
    if (parsed.duplicates.includes(key)) {
      return refuse(`GATE2-${key === '依据' ? 'BASIS' : 'DECISION'}-AMBIGUOUS`, `${card} 的头块里 \`${key}\` 写了两行 —— 这一格必须恰好一个值（契约 §7.1）`)
    }
  }
  // ── ②' 数据票的具名豁免（0012 没动它；不扩不缩）────────────────────────────
  if (DATA_KINDS.has(kindRaw)) {
    const decisionRaw = parsed.fields['构案']
    if (decisionRaw === undefined) {
      return refuse('GATE2-EXEMPTION-NOT-EXPLICIT', `${card} 的头块里没有 \`构案:\` —— 数据票的豁免要**写出来**：写 \`构案: ${DASH}\`（契约 §7.1）`)
    }
    const surfaceRaw = parsed.fields['改动面']
    const surface = typeof surfaceRaw === 'string'
      ? surfaceRaw.split(/[,，]/).map((s) => s.trim()).filter((s) => s !== '' && s !== DASH)
      : null
    const violations = surface === null ? [] : surface.filter((p) => CODE_PATHS.some((c) => p.replace(/\\/g, '/').startsWith(c)))
    if (violations.length > 0) {
      return refuse('GATE2-EXEMPTION-CONTRADICTED', `${card} 的 \`票类: 数据\` 与 \`改动面\` 自相矛盾：${JSON.stringify(violations)} 落在机制代码面上`
        + `（${CODE_PATHS.join(' / ')}）—— 数据票不竞标、不写构案（契约 §7.1）`)
    }
    out.readings = {
      exemption: 'GATE2-EXEMPT-DATA-TICKET',
      why: '纯数据票不竞标、不写构案；豁免要求 `票类: 数据` + `构案: —` 两格**都写出来**',
      basis: '票类=数据（卡自己的结构化头块）',
      unverified: '这道闸没有第三方签名 —— 它只能证明"卡上这么写"，不能证明"这真是数据票"。',
    }
    out.verdict = 'pass'
    out.code = null
    out.ok = true
    return out
  }
  const scan = scanLedger(root)
  // ── ③ 票类要的那个轴上的号码 ────────────────────────────────────────────────
  if (kindRaw === '产品') {
    const raw = parsed.fields['产品']
    out.product = raw ?? null
    if (raw === undefined) {
      return refuse('GATE2-PRODUCT-MISSING', `${card} 的头块里没有 \`产品:\` —— \`票类: 产品\` 的卡要一条**生效产品号**（契约 §7.1）`)
    }
    const product = scan.decisions.find((d) => d.book === '产品' && d.id === String(raw).trim())
    if (product === undefined) {
      const elsewhere = scan.decisions.find((d) => d.id === String(raw).trim())
      if (elsewhere !== undefined) {
        return refuse('GATE2-PRODUCT-NOT-LIVE', `${card} 的 \`产品: ${raw}\` 是 ${elsewhere.book}/${elsewhere.id}，不是产品册里的生效产品 —— `
          + '`票类: 产品` 只能指老板发的那一册（契约 §7.1）', { ref: String(raw) })
      }
      return refuse('GATE2-PRODUCT-DANGLING', `${card} 的 \`产品: ${raw}\` 在产品册里解析不到 —— 卡上的编号必须指向一条真的产品（契约 §7.1）`, { ref: String(raw) })
    }
    if (product.status !== '生效') {
      return refuse('GATE2-PRODUCT-NOT-LIVE', `${card} 的 \`产品: ${raw}\` 状态是 \`${product.raw_status ?? DASH}\` —— 要**生效**产品（契约 §7.1）`, { ref: String(raw) })
    }
    out.readings = { product: { id: product.id, topic: product.topic, status: product.status } }
    out.verdict = 'pass'
    out.code = null
    out.ok = true
    return out
  }
  // 构案卡
  const rawDecision = parsed.fields['构案']
  out.decision = rawDecision ?? null
  if (rawDecision === undefined) {
    return refuse('GATE2-NO-DECISION', `${card} 的头块里没有 \`构案:\` —— \`票类: 构案\` 的卡要一条生效构案编号（契约 §7.1）`)
  }
  const schemeId = String(rawDecision).trim()
  const scheme = scan.decisions.find((d) => d.book === '构案' && d.id === schemeId)
  if (scheme === undefined) {
    const elsewhere = scan.decisions.find((d) => d.id === schemeId)
    if (elsewhere !== undefined) {
      return refuse('GATE2-DECISION-NOT-LIVE', `${card} 的 \`构案: ${schemeId}\` 是 ${elsewhere.book}/${elsewhere.id}，不是构案册里的生效构案（契约 §7.1）`, { ref: schemeId })
    }
    return refuse('GATE2-DANGLING-DECISION', `${card} 的 \`构案: ${schemeId}\` 在构案册里解析不到 —— 卡上的编号必须指向一条真的构案（契约 §7.1）`, { ref: schemeId })
  }
  if (scheme.status !== '生效') {
    return refuse('GATE2-DECISION-NOT-LIVE', `${card} 的 \`构案: ${schemeId}\` 状态是 \`${scheme.raw_status ?? DASH}\` —— 要**生效**构案（契约 §7.1）`, { ref: schemeId })
  }
  // ── ④ `依据` 与构案头一致 ───────────────────────────────────────────────────
  const rawBasis = parsed.fields['依据']
  out.basis = rawBasis ?? null
  if (rawBasis === undefined) {
    return refuse('GATE2-BASIS-MISSING', `${card} 的头块里没有 \`依据:\` —— \`票类: 构案\` 的卡要写这条构案挂在哪一条上`
      + '（产品号或缺陷 id；必须出现在该构案的 `依据P` / `依据bug` 里，契约 §7.1）')
  }
  const basisId = String(rawBasis).trim()
  const members = [...scheme.basisP.map((r) => r.id), ...scheme.basisBug.map((r) => r.id)]
  if (!members.includes(basisId)) {
    return refuse('GATE2-BASIS-MISMATCH', `${card} 的 \`依据: ${basisId}\` 不在构案 ${schemeId} 的来源列表里`
      + `（依据P = [${scheme.basisP.map((r) => r.id).join(',') || DASH}] / 依据bug = [${scheme.basisBug.map((r) => r.id).join(',') || DASH}]）`
      + ' —— 卡上的 `依据` 与构案头必须是同一个字面量（契约 §7.1）', { ref: basisId })
  }
  out.readings = { decision: { id: scheme.id, topic: scheme.topic, status: scheme.status }, basis: { id: basisId, members } }
  out.verdict = 'pass'
  out.code = null
  out.ok = true
  return out
}

/** `gate2-card` 那一句判词 —— 两个 op 共用这一处渲染。 */
function gate2Line(out) {
  if (out === null || out === undefined) return 'GATE2-REFUSE GATE2-CARD-MISSING: （没有判词）\n'
  return out.ok === true
    ? `GATE2-PASS · ${out.ticket_kind} · ${out.product !== null ? `产品 ${out.product}` : `构案 ${out.decision} · 依据 ${out.basis}`}\n`
    : `GATE2-REFUSE ${out.code}: ${out.problems[0]?.message ?? ''}\n`
}

// ── op: card-land（先落盘、再过闸）──────────────────────────────────────────
/** `--role` 的闭集。 */
export const CARD_ROLES = Object.freeze(['test', 'dev', 'review', 'design'])

/** `--day` 的形状**且**真是这一天。 */
export function dayShapeOk(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(day)) return false
  const t = Date.parse(`${day}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day
}

function hhmmssOf(now) {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

/**
 * **派工卡落地 → 在落下去的那一份上跑 `gate2-card`**。
 * ① 先落：字节逐字写进 `<root>/.team/leader/<day>/cards/<HHmmss>-<role>.md`（`wx` 独占建，同名顺延）；
 * ② 后判：闸判的路径就是最终路径。拒了也不删 —— 被拒的卡留在抽屉里才答得出"拒在哪个码"。
 */
export function runCardLand({ root, card, day, role, build = null, now = new Date() }) {
  const out = {
    ok: false, root: path.resolve(root), op: 'card-land',
    verdict: 'refuse', code: null, day, role, build,
    card: card ?? null, landed: null, bytes: null, sha256: null,
    ticket_kind: null, decision: null, product: null, basis: null, problems: [], readings: {}, gate: null,
  }
  const refuse = (code, message, extra = {}) => {
    out.verdict = 'refuse'
    out.code = code
    out.problems = [problem(code, message, extra)]
    out.ok = false
    return out
  }
  if (!dayShapeOk(day)) return refuse('E_ARG_USAGE', `--day ${JSON.stringify(day ?? null)} 不是一个真日期（要 YYYY-MM-DD）`)
  if (!CARD_ROLES.includes(role)) return refuse('E_ARG_USAGE', `--role ${JSON.stringify(role ?? null)} 不认识 —— 卡只能落进 ${CARD_ROLES.join(' / ')} 这四格之一`)
  if (typeof card !== 'string' || card === '' || !existsSync(card)) {
    return refuse('GATE2-CARD-MISSING', `派工卡读不出来：${JSON.stringify(card ?? null)} —— 读不到卡就是拒（契约 §7.2）`)
  }
  let buf
  try {
    buf = readFileSync(card)
  } catch (err) {
    return refuse('GATE2-CARD-MISSING', `派工卡读不出来（${err?.code ?? 'UNKNOWN'}）：${card}`)
  }
  const dir = path.join(out.root, '.team', 'leader', day, 'cards')
  try {
    mkdirSync(dir, { recursive: true })
  } catch (err) {
    return refuse('E_TXN_IO', `卡抽屉建不出来（${err?.code ?? 'UNKNOWN'}）：${err?.message}（${dir}）`)
  }
  const base = `${hhmmssOf(now)}-${role}.md`
  const candidate = path.join(dir, base)
  let handle = null
  try {
    handle = openSync(candidate, 'wx')
    writeSync(handle, buf)
    fsyncSync(handle)
    closeSync(handle)
    handle = null
  } catch (err) {
    if (handle !== null) {
      try { closeSync(handle) } catch { /* 失败路径上，关不掉就算了 */ }
    }
    if (err?.code === 'EEXIST') {
      // 同一秒同一角色已经在盘上：**拒**，不换名字、不覆盖。
      // 换名（`-2`）会让"卡抽屉里落了几张"与 `<HHmmss>-<role>.md` 这个名字对不上：
      // 按名字数的人只看见 1 张，而盘上有 2 张 —— 静默多出一张卡，正是这张闸要防的那种账。
      return refuse('LAND-EXISTS', `${candidate} 已经在盘上 —— 同一秒落两张 ${role} 卡会分不清哪一张过了闸；`
        + '等一秒再来（`wx` 独占建，永不覆盖；契约 §7.2）')
    }
    return refuse('E_TXN_IO', `卡落不进去（${err?.code ?? 'UNKNOWN'}）：${err?.message}（${candidate}）`)
  }
  out.landed = candidate
  out.bytes = buf.length
  out.sha256 = sha256(buf)
  let landedBuf = null
  try {
    landedBuf = readFileSync(out.landed)
  } catch {
    landedBuf = null
  }
  if (landedBuf === null || Buffer.compare(landedBuf, buf) !== 0) {
    return refuse('E_TXN_IO', `落下去的那一份与输入不逐字节相同：${out.landed} —— 这一张不许当"落地了"（路径留着，人去看）`)
  }
  out.readings = {
    land: 'open(…, "wx") 独占建 · 追加不覆盖 · 同名顺延 -2 / -3',
    name_rule: '<HHmmss>-<role>.md（HHmmss = 本机此刻；冲突就顺延）',
    verbatim: { bytes: buf.length, sha256: out.sha256, source: card, landed: out.landed },
  }
  const gate = runGate2Card({ root: out.root, card: out.landed })
  out.gate = gate
  out.ticket_kind = gate.ticket_kind
  out.decision = gate.decision
  out.product = gate.product
  out.basis = gate.basis
  if (gate.ok) {
    out.verdict = 'pass'
    out.code = null
    out.ok = true
    return out
  }
  out.verdict = 'refuse'
  out.code = gate.code
  out.ok = false
  out.problems = gate.problems
  return out
}

// ── op: supersede（写手）───────────────────────────────────────────────────
/**
 * 一次原子翻转：只碰旧文头块那两个字段（`状态` → `已废`、`superseded_by` → 新编号），
 * 其余字节逐字不动 —— 由"写前 / 写后正文 sha256 相同"自证。
 */
export function runSupersede({ root, oldRef, byRef, dryRun = false }) {
  const out = {
    ok: false, root: path.resolve(root), op: 'supersede', verdict: 'refuse', code: null,
    old: null, by: null, changed: [], body_sha256: { before: null, after: null }, file: null, written: false,
    problems: [], readings: {},
  }
  const refuse = (code, message, extra = {}) => {
    out.code = code
    out.problems = [problem(code, message, extra)]
    out.ok = false
    return out
  }
  const scan = scanLedger(root)
  const parseOne = (raw) => {
    const id = String(raw ?? '').trim()
    if (!/^\d{4}$/.test(id)) return null
    return scan.decisions.find((d) => d.id === id) ?? null
  }
  if (typeof oldRef !== 'string' || oldRef.trim() === '') return refuse('SUPERSEDE-USAGE', '缺旧编号：`--op supersede <旧编号> --by <新编号>`')
  if (typeof byRef !== 'string' || byRef.trim() === '') return refuse('SUPERSEDE-USAGE', '缺新编号：`--by <新编号>`')
  const oldD = parseOne(oldRef)
  const newD = parseOne(byRef)
  if (oldD === null) return refuse('SUPERSEDE-OLD-MISSING', `旧编号 ${JSON.stringify(oldRef)} 在账本里解析不到 —— 指针悬空，不写`)
  if (newD === null) return refuse('SUPERSEDE-NEW-MISSING', `新编号 ${JSON.stringify(byRef)} 在账本里解析不到 —— 指针悬空，不写`)
  out.old = `${oldD.book}/${oldD.id}`
  out.by = `${newD.book}/${newD.id}`
  out.file = oldD.file
  if (oldD.book !== newD.book) {
    return refuse('SUPERSEDE-CROSS-BOOK', `supersede 只在同一册里做（实得 ${out.old} → ${out.by}）`)
  }
  if (oldD.file === newD.file) return refuse('SUPERSEDE-SAME-FILE', `${out.old} 与 ${out.by} 是同一个文件 —— 自称不算 supersede`)
  if (oldD.status === '已废') return refuse('SUPERSEDE-ALREADY-RETIRED', `${out.old} 已经是 \`已废\` —— 第二次翻转会让两条继任者链打架`)
  if (oldD.status !== '生效') return refuse('SUPERSEDE-OLD-STATUS-BAD', `${out.old} 的 \`状态\` 读不出合法值（实得 ${JSON.stringify(oldD.raw_status)}）`)
  const otherSuccessors = oldD.superseded_by.filter((r) => r.id !== newD.id)
  if (otherSuccessors.length > 0) {
    return refuse('SUPERSEDE-OLD-HAS-OTHER-SUCCESSOR', `${out.old} 的 \`superseded_by\` 已经写着 ${otherSuccessors.map((r) => r.raw).join(', ')} —— 覆盖掉它就是弄丢一条指针`)
  }
  const reciprocal = newD.supersedes.some((r) => resolveRef(scan.decisions, newD.book, r)?.file === oldD.file)
  if (!reciprocal) {
    return refuse('SUPERSEDE-NO-RECIPROCAL', `${out.by} 的 \`supersedes\` 里没有 ${out.old} —— 先把它写进新文，否则翻转之后就是一条单向指针`)
  }
  const target = path.join(root, oldD.file)
  const text = readText(target)
  if (text === null) return refuse('SUPERSEDE-OLD-MISSING', `${oldD.file} 读不出来`)
  const split = splitHeaderBlock(text)
  if (!split.ok) return refuse('SUPERSEDE-HEADER-UNLOCATABLE', `${oldD.file} 的头块定位不到（${split.why}）`)
  const rawLines = text.split('\n')
  const headerLineOf = (key) => {
    for (let i = split.range.from; i <= split.range.to; i += 1) {
      const m = /^\s*([^:：\s]+)\s*[:：]\s*(.*)$/u.exec(rawLines[i - 1].replace(/\r$/, ''))
      if (m !== null && m[1] === key) return i - 1
    }
    return -1
  }
  const statusAt = headerLineOf('状态')
  const byAt = headerLineOf('superseded_by')
  if (statusAt < 0 || byAt < 0) return refuse('SUPERSEDE-HEADER-UNLOCATABLE', `${oldD.file} 的头块里定位不到 \`状态\` / \`superseded_by\``)
  const withEol = (line) => (line.endsWith('\r') ? `${line.slice(0, -1)}\r` : line)
  const next = [...rawLines]
  const fromStatus = rawLines[statusAt].replace(/\r$/, '')
  const fromBy = rawLines[byAt].replace(/\r$/, '')
  next[statusAt] = withEol('状态: 已废')
  next[byAt] = withEol(`superseded_by: ${newD.id}`)
  const nextText = next.join('\n')
  const bodyOf = (s) => {
    const cut = splitHeaderBlock(s)
    return cut.ok ? cut.bodyLines.join('\n') : null
  }
  const before = bodyOf(text)
  const after = bodyOf(nextText)
  out.body_sha256 = {
    before: before === null ? null : sha256(Buffer.from(before, 'utf8')),
    after: after === null ? null : sha256(Buffer.from(after, 'utf8')),
  }
  out.readings.byte_length = { before: Buffer.byteLength(text, 'utf8'), after: Buffer.byteLength(nextText, 'utf8') }
  if (out.body_sha256.before === null || out.body_sha256.after === null) return refuse('SUPERSEDE-HEADER-UNLOCATABLE', `${oldD.file} 的正文切不出来（头块不成立）—— 不写`)
  if (out.body_sha256.before !== out.body_sha256.after) {
    return refuse('SUPERSEDE-BODY-CHANGED', `${oldD.file} 的正文 sha256 会变 —— supersede 只许动头块两个字段，不写`)
  }
  out.changed = [
    { key: '状态', from: fromStatus, to: '状态: 已废' },
    { key: 'superseded_by', from: fromBy, to: `superseded_by: ${newD.id}` },
  ]
  if (dryRun) {
    out.verdict = 'dry-run'
    out.ok = true
    return out
  }
  const written = writeFileAtomic(target, nextText)
  if (!written.ok) return refuse('SUPERSEDE-WRITE-FAILED', `${oldD.file} 写不进去：${written.code} ${written.message}`)
  out.verdict = 'pass'
  out.ok = true
  out.written = true
  return out
}

// ── op: check ──────────────────────────────────────────────────────────────
/** 缺陷链的**五组**读数（契约 §10.1）：`closed 52 / deferred 104` 那种混桶读数在这里被拆开。 */
function chainBugLine(bug) {
  if (bug === null || bug === undefined) return '链·缺陷：（读数缺失）'
  return `链·缺陷：closed_by_scheme ${bug.closed_by_scheme ?? '—'} · closed_judged_false ${bug.closed_judged_false ?? '—'} · `
    + `legacy_closed ${bug.legacy_closed ?? '—'} · deferred_open ${bug.deferred_open ?? '—'} · legacy_frozen ${bug.legacy_frozen ?? '—'}`
    + `（合计 closed ${bug.closed ?? '—'} = 前三组 / deferred ${bug.deferred ?? '—'} = 后两组；`
    + `其中结构化 due_at 的暂缓 ${bug.deferred_open_structured ?? '—'} 条）`
}

/**
 * 三册现状 + 六族判词。读数里链的四段（`parent` + 三条链）与 `legacy_disposed` **必须在**（契约 §10.1）；
 * `chain.bug` 按五组印（`closed_by_scheme` / `closed_judged_false` / `legacy_closed` / `deferred_open` /
 * `legacy_frozen`），`--today` 是那条「暂缓过期」判据的注入时钟（缺省 = 本机今天）。
 */
export function runCheck({ root, today = undefined }) {
  const scan = today === undefined || today === null ? scanLedger(root) : scanLedger(root, { today })
  return {
    ok: scan.ok,
    root: scan.root,
    op: 'check',
    ledger_present: scan.ledger_present,
    old_tree_present: scan.old_tree_present,
    books: scan.books,
    chain: scan.chain,
    legacy_disposed: scan.legacy_disposed,
    decisions: scan.decisions.map((d) => ({
      book: d.book, series: d.book, id: d.id, file: d.file, title: d.title, status: d.status,
      topic: d.topic, date: d.date, decider: d.decider, quote: d.quote,
      parent: d.parent, basisP: d.basisP.map((r) => r.id), basisBug: d.basisBug.map((r) => r.id),
      supersedes: d.supersedes.map((r) => r.raw), superseded_by: d.superseded_by.map((r) => r.raw),
    })),
    concepts: scan.concepts.map((c) => ({ concept: c.concept, owner: c.owner, count: c.census, unit: c.unit, rule: c.rule, decision: c.decision })),
    problems: scan.problems,
  }
}

// ── 命令行 ─────────────────────────────────────────────────────────────────
export const ARG_SPEC = {
  value: {
    '--op': 'op', '--root': 'root', '--card': 'card', '--by': 'by', '--day': 'day', '--role': 'role',
    '--build': 'build', '--archive': 'archive', '--today': 'today',
  },
  flag: { '--json': 'json', '--dry-run': 'dryRun' },
  defaults: { op: 'check' },
  positional: true,
}

const OPS = new Set(['check', 'init', 'index', 'fold', 'reconcile', 'gate2-card', 'card-land', 'supersede'])

export function main(argv = process.argv.slice(2)) {
  let args
  try {
    args = parseArgs(argv, ARG_SPEC)
  } catch (err) {
    emit({ ok: false, error: { code: err?.code ?? 'E_ARG_USAGE', message: String(err?.message ?? err), details: err?.details ?? null } })
    process.exit(2)
  }
  const usage = (msg) => {
    process.stderr.write(`DECISION-CHECK-USAGE: ${msg}\n`
      + '  用法：node presets/agenia/bin/决议-check.mjs [--root=<目录>] [--json] '
      + `[--op=<${[...OPS].join('|')}>] [--card=<路径>] [--archive=<旧 ledger.json>] `
      + '[--by=<新编号>] [--day=<YYYY-MM-DD>] [--role=<test|dev|review|design>] [--build=<编号>] [--today=<YYYY-MM-DD>]\n')
    process.exit(3)
  }
  if (!OPS.has(args.op)) usage(`--op ${JSON.stringify(args.op)} 不认识（只认 ${[...OPS].join(' / ')}）`)
  // `--today` 是「暂缓过期」那条判据的注入时钟：形状与真实存在都要判（`2026-02-30` 不是一天）。
  if (args.today !== null && !dayShapeOk(args.today)) usage(`--today ${JSON.stringify(args.today)} 不是一个真日期（要 YYYY-MM-DD）`)
  const root = args.root === null ? REPO_ROOT : path.resolve(args.root)
  let rootOk = true
  try {
    rootOk = statIsDir(root)
  } catch {
    rootOk = false
  }
  if (!rootOk) usage(`--root 不是目录：${root}`)

  if (args.op === 'gate2-card') {
    if (args.card === null) usage('--op gate2-card 必须给 --card=<路径>')
    const out = runGate2Card({ root, card: args.card })
    if (args.json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
    else process.stdout.write(gate2Line(out))
    process.exit(out.ok ? 0 : 1)
  }
  if (args.op === 'card-land') {
    if (args.card === null) usage('--op card-land 必须给 --card=<路径>')
    if (args.day === null) usage('--op card-land 必须给 --day=<YYYY-MM-DD>')
    if (!dayShapeOk(args.day)) usage(`--day ${JSON.stringify(args.day)} 不是一个真日期`)
    if (args.role === null) usage('--op card-land 必须给 --role=<test|dev|review|design>')
    if (!CARD_ROLES.includes(args.role)) usage(`--role ${JSON.stringify(args.role)} 不认识`)
    const out = runCardLand({ root, card: args.card, day: args.day, role: args.role, build: args.build })
    const buildTail = out.build === null || out.build === undefined ? '' : ` · build ${out.build}`
    if (args.json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
    else if (out.ok) {
      process.stdout.write(`card landed: ${out.landed}${buildTail}\n`)
      process.stdout.write(gate2Line(out.gate))
    } else {
      if (out.landed !== null) process.stdout.write(`card kept: ${out.landed}${buildTail}\n`)
      process.stdout.write(gate2Line(out))
    }
    process.exit(out.ok ? 0 : 1)
  }
  if (args.op === 'supersede') {
    const out = runSupersede({ root, oldRef: args.positional[0] ?? null, byRef: args.by, dryRun: args.dryRun })
    if (args.json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
    else if (out.ok) {
      process.stdout.write(`SUPERSEDE-${out.written ? 'DONE' : 'DRY-RUN'} ${out.old} → ${out.by}\n`)
      for (const c of out.changed) process.stdout.write(`  ${c.from}  ⇒  ${c.to}\n`)
      process.stdout.write(`  ${out.file} 正文 sha256 不变：${out.body_sha256.before}\n`)
    } else process.stdout.write(`SUPERSEDE-REFUSE ${out.code}: ${out.problems[0]?.message ?? ''}\n`)
    process.exit(out.ok ? 0 : 1)
  }
  const runner = args.op === 'init' ? runInit
    : args.op === 'index' ? runIndex
      : args.op === 'fold' ? runFold
        : args.op === 'reconcile' ? (p) => {
          if (args.archive === null) usage('--op reconcile 必须给 --archive=<旧 ledger.json>')
          return runReconcile({ root: p.root, archive: args.archive })
        }
          : runCheck
  const out = runner({ root, today: args.today })
  if (args.json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
  } else if (out.ok) {
    if (args.op === 'init') process.stdout.write(`账本骨架已就绪 · 新建 ${out.created.length} 处\n${out.created.join('\n')}\n`)
    else if (args.op === 'index') process.stdout.write(`三张派生页已重写：${out.written.join(' · ')}\n`)
    else if (args.op === 'fold') process.stdout.write(`缺陷 ${out.states.length} 条（折叠）\n`)
    else if (args.op === 'reconcile') process.stdout.write(`对账 ${out.compared}/${out.archive_entries} 条一致 · legacy_disposed ${out.legacy_disposed}\n`)
    else {
      process.stdout.write(`决议-check OK · 产品 ${out.books.产品.entries} 条 · 缺陷 ${out.books.缺陷.entries} 条 · 构案 ${out.books.构案.entries} 条 · `
        + `legacy_disposed ${out.legacy_disposed}\n`)
      process.stdout.write(`${chainBugLine(out.chain?.bug)}\n`)
    }
  } else {
    for (const p of out.problems) process.stdout.write(`${p.code}${p.file ? ` ${p.file}` : ''}: ${p.message}\n`)
    // 红了也要印链读数：判据红的时候，读的人第一件事是问"哪一组变了"。
    if (args.op === 'check') process.stdout.write(`${chainBugLine(out.chain?.bug)}\n`)
    process.stdout.write(`决议-check ${out.problems.length} 处未成立\n`)
  }
  process.exit(out.ok ? 0 : 1)
}

function statIsDir(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()
// 依据: 0012
