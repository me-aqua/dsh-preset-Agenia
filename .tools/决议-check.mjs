#!/usr/bin/env node
/**
 * **决议-check —— 决议树的检查器**（构案 0001 的机器侧判词）。
 *
 * 规格：`.team/test/2026-11-12/CONTRACT-构案.md`（下称「契约」）§5（判词）· §6（拒接闸）· §4（派生叶对账）。
 *
 * 三个 op（`--op=<x>` 与 `--op <x>` 两种写法都收）：
 *
 *   · `check`（缺省）—— 判七件事，**只读**：
 *       ① 头块七键齐 / 可解析 / 值形状对        ② 指针解析得到 + 双向对称 + 不许自称
 *       ③ 每个（系列, 主题）恰好一条 `生效`      ④ `INDEX` 与派生叶逐行逐格一致
 *       ⑤ 状态与指针自洽                        ⑥ 生效构案的 主题 在概念表里
 *       ⑦ 构案正文七节 + ⑦ 反悔条件那张四列表
 *   · `gate2-card --card=<路径>` —— 第 2 关拒接闸：**新机制票无构案编号 ⇒ 拒**（exit 1，fail-closed）。
 *   · `supersede <旧编号> --by <新编号>` —— 组长跑的**写手**：只翻旧文头块两个字段
 *       （`状态`→`已废`、`superseded_by`→新编号），**正文一个字节不动**；指针不成立就拒。
 *
 * 🔴 `supersede` 为什么住在这里（老板 2026-11-12 的裁决，契约 §0.3-`D4` 原来把这条留着没做）：
 *   supersede 若是"人的两次编辑"，就一定有人只改了一半 —— 那正是 `SUPERSEDED-BUT-LIVE` /
 *   `POINTER-ASYMMETRIC` 这两种红的样子。机器能做的就两件：**判边界**（`check`）和**替人做这次翻转**
 *   （`supersede`），人只负责说"这一条被哪一条替了"。所以这里是**唯一会写盘**的 op，
 *   而且它只写那两个字段 —— 写之前先算正文 sha256，写完再算一次，对不上就不落盘。
 *
 * 🔴 解析面**只有一份**：头块怎么拆、`INDEX` 怎么派生，全在 `.tools/lib/决议-ledger.mjs` 里
 *   （本文件 import 它，自己不解析 md）。两个入口各写一份解析器，两边一起错的时候谁也看不见（契约 §5.3 末条）。
 *
 * 退出码（契约 §5.5）：`0` 无 problems · `1` 有 problems（含 gate 拒接 / supersede 拒做）· `3` 用法或根不成立。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileAtomic } from '../presets/agenia/lib/atomic.mjs'
import { emit, parseArgs } from '../presets/agenia/lib/cli-harness.mjs'
import {
  DASH, GEN_MARKER_NEEDLES, INDEX_COLUMNS, INDEX_REL, INDEX_UNIT_COLUMN, REPO_ROOT, SERIES, TABLE_REL,
  dedupeProblems, firstTable, linesOf, parseRefList, problem, readText, resolveRef, scanLedger, splitHeaderBlock,
} from './lib/决议-ledger.mjs'

/** 一份文件的 sha256（小写 hex）。 */
function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

// ── `INDEX` 那一页（契约 §4.1 / §4.2 / §4.3）────────────────────────────────
/**
 * 判 `INDEX`：先判"它是不是生成物"，再判行集 / 次序 / 逐格。
 *
 * 级联（契约 §5.1）：行集不一致 ⇒ **只报行集**（不再报次序与逐格）；行集一致才比次序；
 * 次序一致才比逐格。这样读的人看到的是"一处病"，不是"八处病"。
 */
function judgeIndex(root, concepts, problems, { declaresRule = false } = {}) {
  const file = path.join(root, INDEX_REL)
  const reading = { file: INDEX_REL, present: false, generated_marker: false, rows: [] }
  if (!existsSync(file)) {
    reading.missing = true
    problems.push(problem('INDEX-MISSING', `${INDEX_REL} 不在 —— 构案录（现状层）是派生页，`
      + '`node .tools/census.mjs --write-index` 生成它（契约 §4）', { file: INDEX_REL }))
    return reading
  }
  reading.present = true
  const lines = linesOf(readFileSync(file, 'utf8'))
  const firstNonEmpty = lines.find((l) => l.trim() !== '') ?? ''
  const markerOk = firstNonEmpty.trim().startsWith('<!--') && GEN_MARKER_NEEDLES.every((n) => firstNonEmpty.includes(n))
  reading.generated_marker = markerOk
  if (!markerOk) {
    problems.push(problem('INDEX-NOT-GENERATED', `${INDEX_REL} 的第一行非空行不是生成标记 —— 这一页是**生成物**，`
      + '手改会红；重跑 `node .tools/census.mjs --write-index`（契约 §4.1）', { file: INDEX_REL }))
    return reading
  }
  // 第一张表（**解析走共用那份 `firstTable`**，M6）
  const table = firstTable(lines)
  const wants = [...INDEX_COLUMNS, INDEX_UNIT_COLUMN]
  const hasUnitColumn = table !== null && table.columns.length === wants.length && table.columns.every((c, i) => c === wants[i])
  if (table === null || (!hasUnitColumn && (table.columns.length !== INDEX_COLUMNS.length || table.columns.some((c, i) => c !== INDEX_COLUMNS[i])))) {
    reading.rows = []
    for (const c of concepts) {
      problems.push(problem('INDEX-ROW-MISSING', `${INDEX_REL} 里读不出 \`${c.concept}\` 这一行 —— `
        + `页上必须是一张四列表 ${JSON.stringify(INDEX_COLUMNS)}（或带「${INDEX_UNIT_COLUMN}」的第五列，M4）`, { file: INDEX_REL, concept: c.concept }))
    }
    return reading
  }
  reading.rows = table.rows.map((cells) => ({
    concept: cells[0] ?? '',
    owner: cells[1] ?? '',
    census: cells[2] ?? '',
    decision: cells[3] ?? '',
    unit: hasUnitColumn ? (cells[4] ?? '') : null,
  }))
  const pageNames = reading.rows.map((r) => r.concept)
  const derivedNames = concepts.map((c) => c.concept)
  const pageSet = new Set(pageNames)
  const derivedSet = new Set(derivedNames)
  // 行集：缺 / 多 / 重复 ⇒ 只报行集
  let rowSetBroken = false
  for (const name of derivedNames) {
    if (!pageSet.has(name)) {
      rowSetBroken = true
      problems.push(problem('INDEX-ROW-MISSING', `${INDEX_REL} 缺 \`${name}\` 这一行 —— 行集 = 概念表的行集（契约 §4.2）`,
        { file: INDEX_REL, concept: name }))
    }
  }
  for (const name of pageNames) {
    if (!derivedSet.has(name)) {
      rowSetBroken = true
      problems.push(problem('INDEX-ROW-EXTRA', `${INDEX_REL} 上多出一行 \`${name}\` —— 概念表里没有它；`
        + '页上的行只能由概念表派生（多出来的那一行就是手抄，契约 §4.2）', { file: INDEX_REL, concept: name }))
    }
  }
  const seen = new Set()
  for (const name of pageNames) {
    if (seen.has(name)) {
      rowSetBroken = true
      problems.push(problem('INDEX-ROW-DUP', `${INDEX_REL} 里 \`${name}\` 有两行 —— 一个概念一行（契约 §4.2）`,
        { file: INDEX_REL, concept: name }))
    }
    seen.add(name)
  }
  if (rowSetBroken) return reading
  // 次序：行集一致才比（次序 = 概念表次序，不排序）
  for (let i = 0; i < derivedNames.length; i += 1) {
    if (pageNames[i] !== derivedNames[i]) {
      problems.push(problem('INDEX-ORDER', `${INDEX_REL} 第 ${i + 1} 行是 \`${pageNames[i]}\`，概念表第 ${i + 1} 个是 `
        + `\`${derivedNames[i]}\` —— 行序 = 概念表行序（不排序：那是人维护的有意义的次序，契约 §4.2）`,
      { file: INDEX_REL, concept: derivedNames[i] }))
      return reading
    }
  }
  // 逐格（census / 归属 / 构案 三列；「概念」列是行键）
  for (const derived of concepts) {
    const page = reading.rows.find((r) => r.concept === derived.concept)
    if (page.owner !== derived.owner) {
      problems.push(problem('INDEX-ROW-MISMATCH', `${INDEX_REL} \`${derived.concept}\` 的「归属」：页上 ${JSON.stringify(page.owner)}`
        + ` / 概念表 ${JSON.stringify(derived.owner)}`, { file: INDEX_REL, concept: derived.concept, column: '归属' }))
    }
    const pageCount = /^\d+$/.test(page.census.trim()) ? Number(page.census.trim()) : NaN
    if (pageCount !== derived.census) {
      problems.push(problem('INDEX-ROW-MISMATCH', `${INDEX_REL} \`${derived.concept}\` 的「census」：页上 ${JSON.stringify(page.census)}`
        + ` / 概念表派生 ${derived.census} —— 页是派生物：改了实现要重跑 \`node .tools/census.mjs --write-index\``,
      { file: INDEX_REL, concept: derived.concept, column: 'census' }))
    }
    if (!derived.skip_decision) {
      const want = derived.decision ?? DASH
      if (page.decision.trim() !== want) {
        problems.push(problem('INDEX-ROW-MISMATCH', `${INDEX_REL} \`${derived.concept}\` 的「构案」：页上 ${JSON.stringify(page.decision)}`
          + ` / 生效构案派生 ${JSON.stringify(want)} —— 只认 \`生效\` 的构案（契约 §4.2）`,
        { file: INDEX_REL, concept: derived.concept, column: '构案' }))
      }
    }
    // 「单位」列（M4）：页上没有这一列、而概念表**声明了**计数口径 ⇒ 这一格是缺的（不许让单位悄悄消失）
    const unit = derived.unit ?? DASH
    if (page.unit === null) {
      if (declaresRule) {
        problems.push(problem('INDEX-ROW-MISMATCH', `${INDEX_REL} \`${derived.concept}\` 缺「${INDEX_UNIT_COLUMN}」这一列 —— `
          + `概念表声明了「计数口径」⇒ 页上必须印出单位 ${JSON.stringify(unit)}（M4：数要带单位）`,
        { file: INDEX_REL, concept: derived.concept, column: INDEX_UNIT_COLUMN }))
      }
    } else if (page.unit.trim() !== unit) {
      problems.push(problem('INDEX-ROW-MISMATCH', `${INDEX_REL} \`${derived.concept}\` 的「${INDEX_UNIT_COLUMN}」：页上 ${JSON.stringify(page.unit)}`
        + ` / 概念表派生 ${JSON.stringify(unit)} —— 单位变了就是口径变了，重跑 \`node .tools/census.mjs --write-index\``,
      { file: INDEX_REL, concept: derived.concept, column: INDEX_UNIT_COLUMN }))
    }
  }
  return reading
}

/** `.team/` 下的第二份 `INDEX.md`（契约 §1.1 / 定形 §五）。只看到 `<root>/.team` 与它的一级子目录 —— 边界写在这里。 */
function secondCopies(root) {
  const team = path.join(root, '.team')
  const out = []
  const probe = (dir, depth) => {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      let st = null
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isFile() && name === 'INDEX.md') out.push(full)
      else if (st.isDirectory() && depth > 0) probe(full, depth - 1)
    }
  }
  probe(team, 1)
  return out
}

// ── op: check ──────────────────────────────────────────────────────────────
/** `决议/` 下有没有可判的东西（决议文件 / 概念表 / INDEX）。三样都没有 ⇒ 空集，不是错（契约 §5.3 末条）。 */
function ledgerIsEmpty(root) {
  const dir = path.join(root, '决议')
  if (!existsSync(dir)) return true
  if (existsSync(path.join(root, INDEX_REL)) || existsSync(path.join(root, TABLE_REL))) return false
  for (const series of SERIES) {
    const sub = path.join(dir, series)
    if (!existsSync(sub)) continue
    try {
      if (readdirSync(sub).some((n) => n.endsWith('.md'))) return false
    } catch {
      return false
    }
  }
  return true
}

export function runCheck({ root }) {
  // 空集不是错：本工具判一致性，不判项目进度（契约 §5.3 末条）——
  // 这一条必须在 `scanLedger` 之前，否则"一棵还没有账本的树"会被报成 `CONCEPT-TABLE-MISSING`。
  if (ledgerIsEmpty(root)) {
    return {
      ok: true,
      root: path.resolve(root),
      op: 'check',
      decisions: [],
      concepts: [],
      index: { file: INDEX_REL, present: false, generated_marker: false, rows: [], judged: false },
      problems: [],
    }
  }
  const scan = scanLedger(root)
  const problems = [...scan.problems]
  /**
   * 概念表不在 ⇒ **不判** ④/⑥（契约 §5.1 的级联：上游缺只报上游那一条）。
   * ④ 的派生叶是从概念表长出来的：没有表就没有"应有的行集"，此时判 `INDEX` 的行只会判出
   * 一页假红（"概念表里没有这一行"其实说的是"概念表不在"）。
   */
  const tableMissing = !scan.table.present
  const index = tableMissing
    ? {
      file: INDEX_REL,
      present: existsSync(path.join(root, INDEX_REL)),
      generated_marker: false,
      rows: [],
      judged: false,
      skipped: 'CONCEPT-TABLE-MISSING',
    }
    : judgeIndex(root, scan.concepts, problems, { declaresRule: scan.table.declares_rule === true })
  /**
   * 读数里的 `census` 是**数**（契约 §5.3 的形状：`census: 2`），不是页上那串字。
   * 页上写成 `02` / `2 ` / `两` 时，读到的是 `null` —— 那正是"这一格不是数"的证据，别替它猜。
   */
  if (Array.isArray(index.rows)) {
    index.rows = index.rows.map((row) => {
      const raw = String(row.census ?? '').trim()
      return { ...row, census_raw: raw, census: /^\d+$/.test(raw) ? Number(raw) : null }
    })
  }

  for (const file of secondCopies(root)) {
    const rel = path.relative(root, file).replace(/\\/g, '/')
    problems.push(problem('INDEX-SECOND-COPY', `${rel} 是第二份 \`INDEX.md\` —— 构案录只许有一份，`
      + `住 \`${INDEX_REL}\`（定形 §五 / 契约 §1.1）`, { file: rel }))
  }

  const decisions = scan.decisions.map((d) => ({
    series: d.series,
    id: d.id,
    file: d.file,
    title: d.title,
    status: d.status,
    topic: d.topic,
    date: d.date,
    decider: d.decider,
    quote: d.quote,
    supersedes: d.supersedes.map((r) => (r.series === null ? r.id : `${r.series}/${r.id}`)),
    superseded_by: d.superseded_by.map((r) => (r.series === null ? r.id : `${r.series}/${r.id}`)),
    body_sections: d.body_sections,
    reversal_rows: d.reversal_rows,
  }))
  const concepts = scan.concepts.map((c) => ({
    concept: c.concept,
    owner: c.owner,
    count: c.census,
    unit: c.unit,
    rule: c.rule,
    implementations: c.implementations,
    files: c.files,
    scan: c.scan,
    scan_empty: c.scan_empty,
    decision: c.decision,
    skip_decision: c.skip_decision,
    read_failures: c.read_failures,
  }))
  const unique = dedupeProblems(problems)
  return {
    ok: unique.length === 0,
    root: path.resolve(root),
    op: 'check',
    decisions,
    concepts,
    index,
    problems: unique,
  }
}

// ── op: gate2-card（契约 §6）────────────────────────────────────────────────
/** 卡头块里认得的两个键（逐字）。 */
export const CARD_KEYS = Object.freeze(['票类', '构案'])

/**
 * 派工卡的头块 —— **判的是卡的「结构化字段」**（Gate 4 · M3）。
 *
 * 上一版把整段头块里出现的 `键: 值` 收进一个对象（后写的那一行赢），于是：
 *   · 正文里随便一行 `票类: 数据` 就能把闸的票类改掉；
 *   · 同一张卡写两次 `票类` 时，静默取最后一条 —— 谁也没看见。
 * 现在：
 *   ① 头块**只认**「H1 → 一行空行 → 到第一条空行」这一段（`splitHeaderBlock`，与决议文件同一份判法）；
 *   ② 每个键**最多出现一次**（重复 ⇒ 交回调用方拒，点名那个键）；
 *   ③ 头块**之外**（正文 / 代码块 / 引用）出现 `票类` 一律不算结构化字段 —— 报了名拒，不许它替闸做主。
 *
 * @returns {{ok, h1, fields, duplicates:string[], stray_kinds:number[], problems:Array}}
 */
export function parseCardText(text) {
  const split = splitHeaderBlock(text)
  if (!split.ok) return { ok: false, h1: null, fields: {}, duplicates: [], stray_kinds: [], problems: [{ code: 'GATE2-CARD-MISSING', message: split.why }] }
  const fields = {}
  const duplicates = []
  for (const { text: lineText } of split.block) {
    const m = /^\s*([^:：\s]+)\s*[:：]\s*(.*)$/u.exec(lineText)
    if (m === null) continue // 头块里的非 `键: 值` 行不参与判定（卡可以有人读的标题行）
    const key = m[1]
    if (fields[key] !== undefined) duplicates.push(key)
    else fields[key] = m[2].trim()
  }
  // 头块之外还有没有 `票类`（正文 / 例子 / 引用里的都不许替闸做主）
  const strayKinds = []
  split.lines.forEach((line, idx) => {
    const lineNo = idx + 1
    if (lineNo >= split.range.from && lineNo <= split.range.to) return
    if (/^\s*票类\s*[:：]/u.test(line)) strayKinds.push(lineNo)
  })
  return { ok: true, h1: split.h1, fields, duplicates, stray_kinds: strayKinds, problems: [] }
}

const NEW_MECHANISM_KINDS = new Set(['新机制', '新机制票'])
const DATA_KINDS = new Set(['数据', '数据票'])

/**
 * 第 2 关拒接闸（契约 §6.2 的六行表）。
 *
 * fail-closed 的每一处（漏写一格不许绕过闸 —— 那是这一格存在的全部理由）：
 *   · 卡读不出来 ⇒ 拒（`GATE2-CARD-MISSING`）；
 *   · 头块不成立 / 缺 `票类` ⇒ 拒（`GATE2-CARD-MISSING` / `GATE2-TICKET-KIND-MISSING`）；
 *   · `票类` 写了两行、或正文里另有一行 `票类` ⇒ 拒（`GATE2-TICKET-KIND-AMBIGUOUS` / `GATE2-TICKET-KIND-NOT-STRUCTURED`）
 *     —— **票类只认卡的结构化头块，正文里的一句不算**；
 *   · 新机制票没有编号 ⇒ 拒（`GATE2-NO-DECISION`）；
 *   · **引用表里每一个编号都要解析得到、都要是生效构案**（M3：上一版只看"第一个能解析的"，
 *     `构案: 0001, 9999` 会静默放过 9999）；任何一条不成立 ⇒ 拒，点名那一个编号。
 *
 * 「数据票」的豁免（`票类: 数据` + `构案: —`）**是有名字、且要写出来的**（M3）：
 *   · `构案` 那一行**必须在**（缺了不是"零个编号"，是"没写" ⇒ 拒 `GATE2-EXEMPTION-NOT-EXPLICIT`）；
 *   · 通过了也要在 `readings.exemption` 里留下它的名字与**它证明不了什么**
 *     （票类是卡自己写的：这道闸没有第三方签名，只有"卡的结构化头块里怎么说"）。
 */
export function runGate2Card({ root, card }) {
  const out = {
    ok: false, root: path.resolve(root), op: 'gate2-card',
    verdict: 'refuse', code: null, card: card ?? null,
    ticket_kind: null, decision: null, problems: [], readings: {},
  }
  const refuse = (code, message, extra = {}) => {
    out.verdict = 'refuse'
    out.code = code
    out.problems = [problem(code, message, extra)]
    out.ok = false
    return out
  }
  if (typeof card !== 'string' || card === '' || !existsSync(card)) {
    return refuse('GATE2-CARD-MISSING', `派工卡读不出来：${JSON.stringify(card ?? null)} —— 读不到卡就是拒（契约 §6.2）`)
  }
  const text = readText(card)
  if (text === null) return refuse('GATE2-CARD-MISSING', `派工卡读不出来：${card}`)
  const parsed = parseCardText(text)
  if (!parsed.ok) return refuse('GATE2-CARD-MISSING', `派工卡 ${card} 的头块不成立：${parsed.problems[0].message}`)
  // ① 票类只认结构化头块里**恰好一次**的那一行
  if (parsed.stray_kinds.length > 0) {
    return refuse('GATE2-TICKET-KIND-NOT-STRUCTURED', `${card} 的第 ${parsed.stray_kinds.join(' / ')} 行不在头块里、却写着 \`票类:\` —— `
      + '这道闸只认卡首的结构化头块（H1 → 空行 → 到第一个空行）；正文 / 例子 / 引用里的 `票类` 不算数（M3）')
  }
  if (parsed.duplicates.includes('票类')) {
    return refuse('GATE2-TICKET-KIND-AMBIGUOUS', `${card} 的头块里 \`票类\` 写了两行 —— 票类必须恰好一格（M3）`)
  }
  const kindRaw = parsed.fields['票类']
  out.ticket_kind = kindRaw ?? null
  if (kindRaw === undefined) {
    return refuse('GATE2-TICKET-KIND-MISSING', `${card} 的头块里没有 \`票类:\` —— 漏写一格不许绕过闸（fail-closed，契约 §6.2）`)
  }
  const isNew = NEW_MECHANISM_KINDS.has(kindRaw)
  const isData = DATA_KINDS.has(kindRaw)
  if (!isNew && !isData) {
    return refuse('GATE2-TICKET-KIND-MISSING', `${card} 的 \`票类: ${kindRaw}\` 不认识 —— 只认 \`新机制\` / \`数据\`（fail-closed，契约 §6.1）`)
  }
  // ② `构案` 那一格不许写两行（同一张卡两个编号 = 谁也不知道按哪一条走）
  if (parsed.duplicates.includes('构案')) {
    return refuse('GATE2-DECISION-AMBIGUOUS', `${card} 的头块里 \`构案\` 写了两行 —— 这一格必须恰好一个值（M3）`)
  }
  /**
   * ③ 数据票的豁免要**能被卡上别的格子反驳**（M3：光靠 `票类:` 一行 = "被闸一方自己勾"）。
   *    卡上写了 `改动面:`（逗号分隔的路径 / glob）时，数据票的改动面里不许落在机制代码面上：
   *    声明了 `presets/**` / `.tools/**` / `决议/**` 却说自己是数据票 ⇒ 自相矛盾，拒。
   *    ⚠️ **没写 `改动面:` 不构成拒**（卡上可以没有这一格），但读数里必须写明"这一层没核对"。
   */
  const codePaths = ['presets/', '.tools/', '决议/']
  const surfaceRaw = parsed.fields['改动面']
  const surface = typeof surfaceRaw === 'string'
    ? surfaceRaw.split(/[,，]/).map((s) => s.trim()).filter((s) => s !== '' && s !== DASH)
    : null
  const surfaceViolations = surface === null
    ? []
    : surface.filter((p) => {
      const norm = p.replace(/\\/g, '/')
      return codePaths.some((c) => norm.startsWith(c) || norm.includes(`/${c}`))
    })
  if (isData && surfaceViolations.length > 0) {
    return refuse('GATE2-EXEMPTION-CONTRADICTED', `${card} 的 \`票类: 数据\` 与 \`改动面\` 自相矛盾：`
      + `${JSON.stringify(surfaceViolations)} 落在机制代码面上（${codePaths.join(' / ')}）—— `
      + '数据票不竞标、不写构案，也不改机制代码；要改机制代码就是新机制票（M3）')
  }
  // ④ 构案那一格必须**写得出来**（缺行 ≠ 零个编号）
  const decisionRaw = parsed.fields['构案']
  out.decision = decisionRaw ?? null
  if (decisionRaw === undefined) {
    const code = isData ? 'GATE2-EXEMPTION-NOT-EXPLICIT' : 'GATE2-NO-DECISION'
    return refuse(code, `${card} 的头块里没有 \`构案:\` —— ${isData ? '数据票的豁免要**写出来**' : '新机制票要一条生效构案'}：`
      + `没有就写 \`构案: ${DASH}\`（漏写一格不算"零个编号"，M3 / 契约 §6.2）`)
  }
  const ref = parseRefList(decisionRaw)
  const hasDecision = decisionRaw !== DASH && decisionRaw !== ''
  if (!ref.ok) {
    return refuse('GATE2-DANGLING-DECISION', `${card} 的 \`构案: ${decisionRaw}\` 解析不了：${ref.why}（契约 §6.2）`)
  }
  if (!hasDecision) {
    if (!isData) {
      return refuse('GATE2-NO-DECISION', `${card} 是**新机制票**，而 \`构案:\` 是 \`${decisionRaw}\` —— `
        + '新机制票必须先有一条生效构案（定形 §一·五；契约 §6.2）。改法：先在 `决议/构案/` 落一条编号，再把编号写到卡首')
    }
    // 豁免：**有名字、且写明它证明不了什么**（M3：这东西仍然只是卡自己说的）
    out.readings = {
      exemption: 'GATE2-EXEMPT-DATA-TICKET',
      why: '纯数据票不竞标、不写构案（定形 §一·五）；豁免要求 `票类: 数据` + `构案: —` 两格**都写出来**',
      basis: '票类=数据（卡自己的结构化头块）',
      surface_check: surface === null
        ? '未核对（卡上没写 `改动面:`）'
        : `核对过：${surface.length} 条改动面，都不在 ${codePaths.join(' / ')} 上`,
      unverified: '这道闸没有第三方签名 —— 它只能证明"卡上这么写"，不能证明"这真是数据票"。'
        + '要第三方，得让票类从派卡方以外的记录里来（今天没有那张记录）。',
    }
    out.verdict = 'pass'
    out.code = null
    out.ok = true
    return out
  }
  // ③ **每一个**编号都要解析得到（M3：不是"第一个能解析的就算过"）
  const scan = scanLedger(root)
  const resolved = []
  const dangling = []
  for (const r of ref.refs) {
    const target = resolveRef(scan.decisions, '构案', r)
    if (target === null) dangling.push(r.raw)
    else resolved.push(target)
  }
  if (dangling.length > 0) {
    return refuse('GATE2-DANGLING-DECISION', `${card} 的 \`构案\` 里这几个编号在树上解析不到：${dangling.map((d) => `\`${d}\``).join(' / ')} —— `
      + '卡上的每一个编号都必须指向一条真的构案；有一个悬空就整张卡拒（M3 / 契约 §6.2）', { ref: dangling.join(',') })
  }
  const notLive = resolved.filter((d) => d.series !== '构案' || d.status !== '生效')
  if (notLive.length > 0) {
    const bad = notLive[0]
    return refuse('GATE2-DECISION-NOT-LIVE', `${card} 的 \`构案\` 里 ${notLive.map((d) => `${d.series}/${d.id}`).join(' / ')} `
      + `不是**生效构案**（${bad.series === '构案' ? `状态是 \`${bad.status ?? '（读不出来）'}\`` : `它在 ${bad.series} 系列`}）`
      + ' —— 新机制票要一条**生效**的构案（契约 §6.2）', { ref: `${bad.series}/${bad.id}` })
  }
  if (isData) {
    out.readings = {
      exemption: 'GATE2-NOT-REQUIRED',
      why: '数据票；卡上给了编号，而且每一条都解析得到、都是生效构案',
      basis: '票类=数据（卡自己的结构化头块）',
    }
  }
  out.verdict = 'pass'
  out.code = null
  out.ok = true
  return out
}

// ── op: supersede（组长跑的写手）────────────────────────────────────────────
/**
 * 一次原子翻转。**只碰头块那两个字段**：
 *   `状态: <anything>` → `状态: 已废`
 *   `superseded_by: <anything>` → `superseded_by: <新编号>`
 * 其余字节（H1、别的键、空行、正文）逐字不动 —— 这一点由"写前 / 写后正文 sha256 相同"自证。
 *
 * 五条拒做（每一条都是"写下去会留下一条坏账"）：
 *   · 旧文不在 / 新文不在（指针悬空）
 *   · 同一个文件（自称）
 *   · 旧文已经是 `已废`
 *   · 旧文已有**别的**继任者（再写就把那条指针弄丢）
 *   · 新文的 `supersedes` 里没有旧文（写下去就是单向指针，`check` 会红）
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
    const r = parseRefList(String(raw ?? '').trim())
    if (!r.ok || r.refs.length !== 1) return null
    return resolveRef(scan.decisions, '构案', r.refs[0])
  }
  if (typeof oldRef !== 'string' || oldRef.trim() === '') return refuse('SUPERSEDE-USAGE', '缺旧编号：`--op supersede <旧编号> --by <新编号>`')
  if (typeof byRef !== 'string' || byRef.trim() === '') return refuse('SUPERSEDE-USAGE', '缺新编号：`--by <新编号>`')
  const oldD = parseOne(oldRef)
  const newD = parseOne(byRef)
  if (oldD === null) return refuse('SUPERSEDE-OLD-MISSING', `旧编号 ${JSON.stringify(oldRef)} 在树上解析不到 —— 指针悬空，不写（契约 §0.3 的 D4）`)
  if (newD === null) return refuse('SUPERSEDE-NEW-MISSING', `新编号 ${JSON.stringify(byRef)} 在树上解析不到 —— 指针悬空，不写`)
  out.old = `${oldD.series}/${oldD.id}`
  out.by = `${newD.series}/${newD.id}`
  out.file = oldD.file
  if (oldD.series !== '构案' || newD.series !== '构案') {
    return refuse('SUPERSEDE-NOT-CONSTRUCTION', `只对构案做 supersede（实得 ${out.old} → ${out.by}）`)
  }
  if (oldD.file === newD.file) return refuse('SUPERSEDE-SAME-FILE', `${out.old} 与 ${out.by} 是同一个文件 —— 自称不算 supersede`)
  if (oldD.status === '已废') {
    return refuse('SUPERSEDE-ALREADY-RETIRED', `${out.old} 已经是 \`已废\`（superseded_by: `
      + `${oldD.superseded_by.map((r) => r.id).join(',') || DASH}）—— 第二次翻转会让两条继任者链打架`)
  }
  if (oldD.status !== '生效') {
    return refuse('SUPERSEDE-OLD-STATUS-BAD', `${out.old} 的 \`状态\` 读不出合法值（实得 ${JSON.stringify(oldD.raw_status)}）—— 不猜，先修头块`)
  }
  const otherSuccessors = oldD.superseded_by.filter((r) => !(r.series === null && r.id === newD.id))
  if (otherSuccessors.length > 0) {
    return refuse('SUPERSEDE-OLD-HAS-OTHER-SUCCESSOR', `${out.old} 的 \`superseded_by\` 已经写着 `
      + `${otherSuccessors.map((r) => r.raw).join(', ')} —— 覆盖掉它就是弄丢一条指针`)
  }
  const reciprocal = newD.supersedes.some((r) => resolveRef(scan.decisions, newD.series, r)?.file === oldD.file)
  if (!reciprocal) {
    return refuse('SUPERSEDE-NO-RECIPROCAL', `${out.by} 的 \`supersedes\` 里没有 ${out.old} —— 先把它写进新文，`
      + '否则翻转之后就是一条单向指针（`check` 会报 `POINTER-ASYMMETRIC`）')
  }
  // 定位旧文头块里要改的那两行 —— 头块切分走**共用那份** `splitHeaderBlock`（M6：这里不再自己走一遍行指针）
  const text = readText(path.join(root, oldD.file))
  if (text === null) return refuse('SUPERSEDE-OLD-MISSING', `${oldD.file} 读不出来`)
  const split = splitHeaderBlock(text)
  if (!split.ok) {
    return refuse('SUPERSEDE-HEADER-UNLOCATABLE', `${oldD.file} 的头块定位不到（${split.why}）—— 不猜行号，先跑一次 \`check\``)
  }
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
  if (statusAt < 0 || byAt < 0) {
    return refuse('SUPERSEDE-HEADER-UNLOCATABLE', `${oldD.file} 的头块里定位不到 \`状态\` / \`superseded_by\` —— 不猜行号，先跑一次 \`check\``)
  }
  const withEol = (line) => (line.endsWith('\r') ? `${line.slice(0, -1)}\r` : line)
  const next = [...rawLines]
  const fromStatus = rawLines[statusAt].replace(/\r$/, '')
  const fromBy = rawLines[byAt].replace(/\r$/, '')
  next[statusAt] = withEol(`状态: 已废`)
  next[byAt] = withEol(`superseded_by: ${newD.id}`)
  const nextText = next.join('\n')
  // 正文（头块之后的全部字节）不许变 —— 用 sha256 自证，不靠"我小心地只改了两行"
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
  if (out.body_sha256.before === null || out.body_sha256.after === null) {
    return refuse('SUPERSEDE-HEADER-UNLOCATABLE', `${oldD.file} 的正文切不出来（头块不成立）—— 不写`)
  }
  if (out.body_sha256.before !== out.body_sha256.after) {
    return refuse('SUPERSEDE-BODY-CHANGED', `${oldD.file} 的正文 sha256 会变（${out.body_sha256.before.slice(0, 12)} → `
      + `${out.body_sha256.after.slice(0, 12)}）—— supersede 只许动头块两个字段（契约 §0.3 的 D3），不写`)
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
  const target = path.join(root, oldD.file)
  // 写盘走**共享原子写**（`presets/agenia/lib/atomic.mjs` 的 `writeFileAtomic`：同目录临时件 → fsync → rename）。
  // 这里不再自己拼临时名：那个形状在仓库里只许有一份实现（「原子写剩余实现」那一行按形状数它）。
  const written = writeFileAtomic(target, nextText)
  if (!written.ok) {
    return refuse('SUPERSEDE-WRITE-FAILED', `${oldD.file} 写不进去：${written.code} ${written.message}`)
  }
  out.verdict = 'pass'
  out.ok = true
  out.written = true
  return out
}

// ── 命令行 ─────────────────────────────────────────────────────────────────
/**
 * 本支 CLI 认得的参数（逻辑在 `presets/agenia/lib/cli-harness.mjs`：`--k v` 与 `--k=v` 都收、
 * 不认识的抛 `E_ARG_USAGE`）。从前这里是一段 924 字符的手写解析器：未知参数只印一行
 * `DECISION-CHECK-USAGE:`、stdout 上没有信封码。`--op supersede <旧编号>` 的那个位置参数照收。
 */
export const ARG_SPEC = {
  value: { '--op': 'op', '--root': 'root', '--card': 'card', '--by': 'by' },
  flag: { '--json': 'json', '--dry-run': 'dryRun' },
  defaults: { op: 'check' },
  positional: true,
}

const OPS = new Set(['check', 'gate2-card', 'supersede'])

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
      + '  用法：node .tools/决议-check.mjs [--root=<绝对目录>] [--json] [--op=<check|gate2-card|supersede>] [--card=<路径>] [--by=<新编号>]\n')
    process.exit(3)
  }
  if (!OPS.has(args.op)) usage(`--op ${JSON.stringify(args.op)} 不认识（只认 ${[...OPS].join(' / ')}）`)
  const root = args.root === null ? REPO_ROOT : path.resolve(args.root)
  let rootOk = true
  try {
    rootOk = statSync(root).isDirectory()
  } catch {
    rootOk = false
  }
  if (!rootOk) usage(`--root 不是目录：${root}`)

  if (args.op === 'gate2-card') {
    if (args.card === null) usage('--op gate2-card 必须给 --card=<路径>')
    const out = runGate2Card({ root, card: args.card })
    if (args.json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
    else if (out.verdict === 'pass') process.stdout.write(`GATE2-PASS · ${out.ticket_kind} · 构案 ${out.decision}\n`)
    else process.stdout.write(`GATE2-REFUSE ${out.code}: ${out.problems[0]?.message ?? ''}\n`)
    process.exit(out.ok ? 0 : 1)
  }

  if (args.op === 'supersede') {
    const oldRef = args.positional[0] ?? null
    const out = runSupersede({ root, oldRef, byRef: args.by, dryRun: args.dryRun })
    if (args.json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
    else if (out.ok) {
      process.stdout.write(`SUPERSEDE-${out.written ? 'DONE' : 'DRY-RUN'} ${out.old} → ${out.by}\n`)
      for (const c of out.changed) process.stdout.write(`  ${c.from}  ⇒  ${c.to}\n`)
      process.stdout.write(`  ${out.file} 正文 sha256 不变：${out.body_sha256.before}\n`)
    } else process.stdout.write(`SUPERSEDE-REFUSE ${out.code}: ${out.problems[0]?.message ?? ''}\n`)
    process.exit(out.ok ? 0 : 1)
  }

  const out = runCheck({ root })
  if (args.json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
  else if (out.ok) {
    process.stdout.write(`决议-check OK · 决议 ${out.decisions.length} 条 · 概念 ${out.concepts.length} 个 · `
      + `INDEX ${out.index.present ? '在' : '不在'}\n`)
  } else {
    for (const p of out.problems) process.stdout.write(`${p.code}${p.file ? ` ${p.file}` : ''}${p.key ? ` [${p.key}]` : ''}: ${p.message}\n`)
    process.stdout.write(`决议-check ${out.problems.length} 处未成立\n`)
  }
  process.exit(out.ok ? 0 : 1)
}

const invokedDirectly = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === path.join(REPO_ROOT, '.tools', '决议-check.mjs')
if (invokedDirectly) main()
