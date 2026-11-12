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
 * 🔴 解析面**只有一份**：头块怎么拆、`INDEX` 怎么派生，全在 `.tools/census.mjs` 里（本文件 import 它）。
 *   两个入口各写一份解析器，两边一起错的时候谁也看不见（契约 §5.3 末条）。
 *
 * 退出码（契约 §5.5）：`0` 无 problems · `1` 有 problems（含 gate 拒接 / supersede 拒做）· `3` 用法或根不成立。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  DASH, GEN_MARKER_NEEDLES, INDEX_COLUMNS, INDEX_REL, REPO_ROOT,
  linesOf, parseRefList, problem, readText, resolveRef, scanLedger, splitTableRow,
} from './census.mjs'

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
function judgeIndex(root, concepts, problems) {
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
  // 第一张四列表
  const table = (() => {
    for (let i = 0; i < lines.length; i += 1) {
      const head = splitTableRow(lines[i])
      if (head === null) continue
      const sep = splitTableRow(lines[i + 1] ?? '')
      if (sep === null || sep.length !== head.length || !sep.every((c) => /^:?-{3,}:?$/.test(c))) continue
      const rows = []
      let j = i + 2
      for (; j < lines.length; j += 1) {
        const cells = splitTableRow(lines[j])
        if (cells === null) break
        rows.push(cells)
      }
      return { startLine: i + 1, columns: head, rows }
    }
    return null
  })()
  if (table === null || table.columns.length !== INDEX_COLUMNS.length || table.columns.some((c, i) => c !== INDEX_COLUMNS[i])) {
    reading.rows = []
    for (const c of concepts) {
      problems.push(problem('INDEX-ROW-MISSING', `${INDEX_REL} 里读不出 \`${c.concept}\` 这一行 —— `
        + `页上必须是一张四列表 ${JSON.stringify(INDEX_COLUMNS)}（契约 §4.2）`, { file: INDEX_REL, concept: c.concept }))
    }
    return reading
  }
  reading.rows = table.rows.map((cells) => ({
    concept: cells[0] ?? '',
    owner: cells[1] ?? '',
    census: cells[2] ?? '',
    decision: cells[3] ?? '',
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
export function runCheck({ root }) {
  const scan = scanLedger(root)
  const problems = [...scan.problems]
  // 决议树整个不在 ⇒ 空集不是错（契约 §5.3 末条：本工具判一致性，不判项目进度）
  const ledgerDir = path.join(root, '决议')
  const emptyLedger = !existsSync(ledgerDir) && !scan.table.present && scan.decisions.length === 0

  const index = emptyLedger
    ? { file: INDEX_REL, present: false, generated_marker: false, rows: [] }
    : judgeIndex(root, scan.concepts, problems)
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

  if (!emptyLedger) {
    for (const file of secondCopies(root)) {
      const rel = path.relative(root, file).replace(/\\/g, '/')
      problems.push(problem('INDEX-SECOND-COPY', `${rel} 是第二份 \`INDEX.md\` —— 构案录只许有一份，`
        + `住 \`${INDEX_REL}\`（定形 §五 / 契约 §1.1）`, { file: rel }))
    }
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
    implementations: c.implementations,
    scan: c.scan,
    scan_empty: c.scan_empty,
    decision: c.decision,
    skip_decision: c.skip_decision,
    read_failures: c.read_failures,
  }))
  const unique = []
  const seen = new Set()
  for (const p of problems) {
    const key = [p.code, p.file ?? '', p.key ?? '', p.concept ?? '', p.ref ?? '', p.column ?? '', p.message].join('\u0000')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(p)
  }
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
/** 派工卡头块（同 §2.1 的"H1 之后到空行为止"）。 */
export function parseCardText(text) {
  const lines = linesOf(text)
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i += 1
  if (i >= lines.length || !/^#\s+/.test(lines[i])) return { h1: null, fields: {}, problems: [{ code: 'GATE2-CARD-MISSING', message: '卡里没有 H1' }] }
  const h1 = lines[i].trim()
  const fields = {}
  let j = i + 2
  for (; j < lines.length; j += 1) {
    if (lines[j].trim() === '') break
    const m = /^\s*([^:：\s]+)\s*[:：]\s*(.*)$/u.exec(lines[j])
    if (m !== null) fields[m[1]] = m[2].trim()
  }
  return { h1, fields, problems: [] }
}

const NEW_MECHANISM_KINDS = new Set(['新机制', '新机制票'])
const DATA_KINDS = new Set(['数据', '数据票'])

/**
 * 第 2 关拒接闸（契约 §6.2 的六行表）。
 *
 * fail-closed 的三处：卡读不出来 ⇒ 拒；`票类` 缺/不认识 ⇒ 拒；`构案` 指向的不是"生效构案" ⇒ 拒。
 * 漏写一格不许绕过闸 —— 那是这一格存在的全部理由。
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
  if (parsed.problems.length > 0) return refuse('GATE2-CARD-MISSING', `派工卡 ${card} 的头块不成立：${parsed.problems[0].message}`)
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
  const decisionRaw = parsed.fields['构案'] ?? DASH
  out.decision = decisionRaw
  const ref = parseRefList(decisionRaw)
  const hasDecision = decisionRaw.trim() !== DASH && decisionRaw.trim() !== ''
  if (isData && !hasDecision) {
    // 纯数据票不竞标、不写构案（定形 §一·五）—— 这是读数，不是 problem
    out.readings = { not_required: 'GATE2-NOT-REQUIRED', why: '纯数据票不竞标、不写构案（定形 §一·五）' }
    out.verdict = 'pass'
    out.code = null
    out.ok = true
    return out
  }
  if (!hasDecision) {
    return refuse('GATE2-NO-DECISION', `${card} 是**新机制票**，而 \`构案:\` 是 \`${decisionRaw}\` —— `
      + '新机制票必须先有一条生效构案（定形 §一·五；契约 §6.2）。改法：先在 `决议/构案/` 落一条编号，再把编号写到卡首')
  }
  if (!ref.ok) {
    return refuse('GATE2-DANGLING-DECISION', `${card} 的 \`构案: ${decisionRaw}\` 解析不了：${ref.why}（契约 §6.2）`)
  }
  const scan = scanLedger(root)
  const found = []
  for (const r of ref.refs) {
    const target = resolveRef(scan.decisions, '构案', r)
    if (target !== null) found.push(target)
  }
  if (found.length === 0) {
    return refuse('GATE2-DANGLING-DECISION', `${card} 的 \`构案: ${decisionRaw}\` 在树上解析不到 —— `
      + '卡上的编号必须指向一条真的构案（契约 §6.2）', { ref: decisionRaw })
  }
  const target = found[0]
  if (target.series !== '构案') {
    return refuse('GATE2-DECISION-NOT-LIVE', `${card} 的 \`构案: ${decisionRaw}\` 指向 ${target.series}/${target.id}，`
      + '不是构案 —— 这道闸只认 \`生效\` 的构案（契约 §6.2）', { ref: `${target.series}/${target.id}` })
  }
  if (target.status !== '生效') {
    return refuse('GATE2-DECISION-NOT-LIVE', `${card} 的 \`构案: ${decisionRaw}\` 指向 ${target.series}/${target.id}，`
      + `而它是 \`${target.status ?? '（状态读不出来）'}\` —— 新机制票要一条**生效**的构案（契约 §6.2）`,
    { ref: `${target.series}/${target.id}` })
  }
  if (isData) out.readings = { not_required: 'GATE2-NOT-REQUIRED', why: '数据票；卡上给了编号且解析得到' }
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
  // 定位旧文头块里要改的那两行（行号来自同一个解析器）
  const text = readText(path.join(root, oldD.file))
  if (text === null) return refuse('SUPERSEDE-OLD-MISSING', `${oldD.file} 读不出来`)
  const rawLines = text.split('\n')
  /**
   * 头块的行号区间 `{ from, to }`（**含**）：H1 之后那一行空行的下一行起，到第一条空行为止。
   * 与 `census.parseDecisionText` 是同一条判法 —— 只是这里要行号，所以要再走一遍行指针。
   */
  const headerRange = () => {
    let i = 0
    while (i < rawLines.length && rawLines[i].trim() === '') i += 1
    if (i >= rawLines.length || !/^#\s+/.test(rawLines[i])) return null
    let j = i + 2
    if (j - 1 >= rawLines.length || rawLines[j - 1].trim() !== '') return null
    const from = j
    while (j < rawLines.length && rawLines[j].trim() !== '') j += 1
    return j > from ? { from, to: j - 1 } : null
  }
  const range = headerRange()
  if (range === null) {
    return refuse('SUPERSEDE-HEADER-UNLOCATABLE', `${oldD.file} 的头块定位不到（H1 → 空行 → 头块 → 空行）—— 不猜行号，先跑一次 \`check\``)
  }
  const headerLineOf = (key) => {
    for (let i = range.from; i <= range.to; i += 1) {
      const m = /^\s*([^:：\s]+)\s*[:：]\s*(.*)$/u.exec(rawLines[i].replace(/\r$/, ''))
      if (m !== null && m[1] === key) return i
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
    const lines = s.split('\n')
    let i = 0
    while (i < lines.length && lines[i].trim() === '') i += 1 // H1
    let j = i + 2
    while (j < lines.length && lines[j].trim() !== '') j += 1
    return lines.slice(j).join('\n')
  }
  const before = bodyOf(text)
  const after = bodyOf(nextText)
  out.body_sha256 = { before: sha256(Buffer.from(before, 'utf8')), after: sha256(Buffer.from(after, 'utf8')) }
  out.readings.byte_length = { before: Buffer.byteLength(text, 'utf8'), after: Buffer.byteLength(nextText, 'utf8') }
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
  const tmp = `${target}.tmp-${process.pid}`
  try {
    writeFileSync(tmp, nextText, 'utf8')
    renameSync(tmp, target)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* 临时件没落成，不掩盖原始错误 */
    }
    return refuse('SUPERSEDE-WRITE-FAILED', `${oldD.file} 写不进去：${String(err?.message ?? err)}`)
  }
  out.verdict = 'pass'
  out.ok = true
  out.written = true
  return out
}

// ── 命令行 ─────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const args = { op: 'check', root: null, json: false, card: null, by: null, dryRun: false, positional: [], bad: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--json') args.json = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a.startsWith('--op=')) args.op = a.slice('--op='.length)
    else if (a === '--op') args.op = argv[++i] ?? ''
    else if (a.startsWith('--root=')) args.root = a.slice('--root='.length)
    else if (a === '--root') args.root = argv[++i] ?? ''
    else if (a.startsWith('--card=')) args.card = a.slice('--card='.length)
    else if (a === '--card') args.card = argv[++i] ?? ''
    else if (a.startsWith('--by=')) args.by = a.slice('--by='.length)
    else if (a === '--by') args.by = argv[++i] ?? ''
    else if (a.startsWith('-')) args.bad.push(a)
    else args.positional.push(a)
  }
  return args
}

const OPS = new Set(['check', 'gate2-card', 'supersede'])

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const usage = (msg) => {
    process.stderr.write(`DECISION-CHECK-USAGE: ${msg}\n`
      + '  用法：node .tools/决议-check.mjs [--root=<绝对目录>] [--json] [--op=<check|gate2-card|supersede>] [--card=<路径>] [--by=<新编号>]\n')
    process.exit(3)
  }
  if (args.bad.length > 0) usage(`不认识的参数：${JSON.stringify(args.bad)}`)
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
