/**
 * `DEC-04` / `DEC-05` —— **三张派生页与它们的数**：`INDEX` 与册里逐行对账（`DEC-04`）、
 * census 的计数口径（`DEC-05`）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§1.3 三张派生页 · §4 折叠 · §5.3 依据面 · §10 census）。
 *
 * 🔴 0012 Gate 3 的重指（契约 §12-1）：单册 `决议/INDEX.md` + 概念表 → **三册三张页**
 * （`账本/{产品,缺陷,构案}/INDEX.md`）+ `账本/概念表.md`；`check --json` 不再有 `index.rows`
 * （页是派生物，检查器只报 `INDEX-*`），所以本文件自己从**页上的表**读行，再与 `check` 的
 * `decisions` / `census` 的 `concepts` 对账 —— 两边都不是从页反推的。
 *
 * 🔴 这一格最要紧的一句：**`INDEX` 不是账本**。判据不信页上那个数，它自己从 ① 概念表 ② 扫描 glob
 * 下的实现文件 ③ 决议头块 重算一遍（`census --json` + `check --json` 两份读数各自独立），
 * 再把两边对上。所以"改了实现、不重新生成"必须红 —— 那就是"页被信了"的反面证人。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import {
  CENSUS, CHECK, GOOD_CONCEPTS, GOOD_IMPLS, REAL_LEDGER, buildScene, codesOf, expectCodes,
  goodDecisionProduct0001, goodScheme, goodLedger, messagesOf, readText, runCensus, runCensusText,
  runCheck, runIndex, runNode, sceneRoot, summarize, toolPresent, treeDigest,
} from '../support/decision-ledger.mjs'
import { COUNT_RULES } from '../../../presets/agenia/lib/决议-ledger.mjs'
import {
  SHAPE_CONCEPT,
  SHAPE_EXCLUSIONS,
  SHAPE_FIXTURES,
  SHAPE_RULE,
  SHAPE_SCOPE_ROOTS,
  SHAPE_SURFACE,
  allowlistEntryProblems,
  shapeCountZeroProblems,
  shapeExclusionProblems,
  shapeReading,
  shapeScanFloor,
  shapeScanFloorText,
  shapeScene,
  shapeSummary,
  shapeSurfaceReading,
  shapeUnitProblems,
} from '../support/atomic-shape.mjs'

before(() => {
  preflight()
})

/** 一张 md 表：从第一格等于 `firstCell` 的表头开始读，跳过表头与分隔行，读到第一行不是表格为止。 */
function tableAfter(text, firstCell) {
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i + 1 < lines.length; i += 1) {
    const head = lines[i].trim()
    if (!head.startsWith('|')) continue
    const cells = head.replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim())
    if (cells[0] !== firstCell) continue
    const rows = []
    for (let j = i + 2; j < lines.length; j += 1) {
      const line = lines[j].trim()
      if (!line.startsWith('|')) break
      rows.push(line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim()))
    }
    return { columns: cells, rows }
  }
  return null
}

/** 派生页的第一行非空行是不是生成标记（0012 §1.3）。 */
function markerOk(text) {
  const first = String(text ?? '').split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  return first.trim().startsWith('<!--') && first.includes('生成物') && first.includes('决议-check.mjs')
}

/** 页上的行 → 一张可比的表（`name` 作为键）。 */
function rowsByFirstCell(table) {
  return new Map((table?.rows ?? []).map((cells) => [cells[0] ?? '', cells]))
}

/** 真树的三张页 + 概念表读数（DEC-04 的真树腿）。 */
function realPages() {
  const out = {}
  for (const book of ['产品', '缺陷', '构案']) {
    const file = path.join(REAL_LEDGER, book, 'INDEX.md')
    const text = readText(file)
    out[book] = { file, present: text !== null, marker: markerOk(text), table: text === null ? null : tableAfter(text, book === '缺陷' ? 'id' : '编号') }
  }
  out.构案.concepts = out.构案.table === null ? null : tableAfter(readText(out.构案.file), '概念')
  return out
}

test('DEC-04 三张派生页：页与册逐行对账；改页 / 改了实现不重生成 ⇒ 红；重生成 ⇒ 绿；页是生成物', async () => {
  await runCase('DEC-04', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const hasCensus = toolPresent(problems, CENSUS, '契约 §10.1 的 census')
    const hasCheck = toolPresent(problems, CHECK, '契约 §10.1 的检查器')
    const ledgerPresent = existsSync(REAL_LEDGER)

    // ── ① 真树：check 绿 + census 绿 + 跑完一个字节都不改 ─────────────────────────
    if (!ledgerPresent) {
      push('TREE-MISSING', `${REAL_LEDGER} 不在盘上 —— 三张派生页与概念表都还没有被测对象`)
    } else if (hasCensus && hasCheck) {
      const before = treeDigest(REAL_LEDGER)
      const census = runCensus(PATHS.repo)
      const check = runCheck(PATHS.repo)
      const after = treeDigest(REAL_LEDGER)
      rec.readings.real = {
        before: before.digest, after: after.digest, files: before.files.length,
        census_exit: census.exit, check_exit: check.exit,
        census_codes: codesOf(census.json), check_codes: codesOf(check.json),
      }
      if (expectCodes(problems, check, [], push, { label: 'DEC-04/real-check' })) {
        const pages = realPages()
        rec.readings.real.pages = Object.fromEntries(Object.entries(pages).map(([book, p]) => [book, { present: p.present, marker: p.marker, rows: p.table?.rows.length ?? null }]))
        for (const [book, page] of Object.entries(pages)) {
          if (!page.present) push('INDEX-MISSING', `[真树] 账本/${book}/INDEX.md 不在`)
          else if (!page.marker) push('INDEX-NOT-GENERATED', `[真树] 账本/${book}/INDEX.md 的第一行不是生成标记`)
        }
        // 产品页：每行 = 编号 | 主题 | 日期 | 状态 | 子构案（子构案数由**生效构案**的 依据P 现算）
        const products = (check.json.decisions ?? []).filter((d) => d.book === '产品')
        const schemesLive = (check.json.decisions ?? []).filter((d) => d.book === '构案' && d.status === '生效')
        const childCount = new Map()
        for (const s of schemesLive) for (const id of s.basisP ?? []) childCount.set(id, (childCount.get(id) ?? 0) + 1)
        const productRows = rowsByFirstCell(pages.产品.table)
        for (const d of products) {
          const row = productRows.get(d.id)
          if (row === undefined) { push('INDEX-ROW-MISSING', `[真树] 产品页没有 ${d.id} 这一行`); continue }
          const want = [d.id, d.topic, d.date, d.status, String(childCount.get(d.id) ?? 0)]
          if (JSON.stringify(row) !== JSON.stringify(want)) push('INDEX-ROW-MISMATCH', `[真树] 产品页 ${d.id}：页上 ${JSON.stringify(row)} / 重算 ${JSON.stringify(want)}`)
        }
        if (productRows.size !== products.length) push('INDEX-ROW-SET', `[真树] 产品页有 ${productRows.size} 行，产品册有 ${products.length} 条`)
        // 构案页：每行 = 编号 | 主题 | 日期 | 状态 | 依据P | 依据bug
        const schemes = (check.json.decisions ?? []).filter((d) => d.book === '构案')
        const schemeRows = rowsByFirstCell(pages.构案.table)
        for (const d of schemes) {
          const row = schemeRows.get(d.id)
          if (row === undefined) { push('INDEX-ROW-MISSING', `[真树] 构案页没有 ${d.id} 这一行`); continue }
          const want = [d.id, d.topic, d.date, d.status, (d.basisP ?? []).join(',') || '—', (d.basisBug ?? []).join(',') || '—']
          if (JSON.stringify(row) !== JSON.stringify(want)) push('INDEX-ROW-MISMATCH', `[真树] 构案页 ${d.id}：页上 ${JSON.stringify(row)} / 重算 ${JSON.stringify(want)}`)
        }
        // 缺陷页：行数 = `books.缺陷.entries`（现算，不钉数），每行第一格是缺陷 id
        const bugRows = pages.缺陷.table?.rows ?? []
        if (bugRows.length !== (check.json.books?.['缺陷']?.entries ?? -1)) {
          push('INDEX-ROW-SET', `[真树] 缺陷页 ${bugRows.length} 行，折叠出 ${JSON.stringify(check.json.books?.['缺陷']?.entries)} 条 —— 页必须一行一条`)
        }
        const badIds = bugRows.filter((cells) => !/^bug-\d{8}-\d{2,}$/.test(cells[0] ?? ''))
        if (badIds.length > 0) push('INDEX-ROW-MISMATCH', `[真树] 缺陷页有 ${badIds.length} 行第一格不是缺陷 id：${JSON.stringify(badIds.slice(0, 3))}`)
        // 概念表那一页：概念 | 归属 | census | 构案 | 单位 —— 每一格都能在 census 读数里找到同值
        if (expectCodes(problems, census, [], push, { label: 'DEC-04/real-census' })) {
          const conceptRows = rowsByFirstCell(pages.构案.concepts)
          const byConcept = new Map((census.json.concepts ?? []).map((c) => [c.concept, c]))
          if ((pages.构案.concepts?.rows.length ?? -1) !== byConcept.size) {
            push('INDEX-ROW-SET', `[真树] 概念表页 ${pages.构案.concepts?.rows.length ?? '（没有表）'} 行，census 有 ${byConcept.size} 个概念`)
          }
          for (const [concept, c] of byConcept) {
            const row = conceptRows.get(concept)
            if (row === undefined) { push('INDEX-ROW-MISSING', `[真树] 概念表页没有 \`${concept}\` 这一行`); continue }
            if (row[1] !== c.owner) push('INDEX-ROW-MISMATCH', `[真树] \`${concept}\` 的归属：页上 ${JSON.stringify(row[1])} / census ${JSON.stringify(c.owner)}`)
            if (Number(row[2]) !== c.count) push('INDEX-ROW-MISMATCH', `[真树] \`${concept}\` 的 census：页上 ${JSON.stringify(row[2])} / 重算 ${c.count}`)
            const wantDecision = c.decision ?? '—'
            if ((row[3] ?? '—') !== wantDecision) push('INDEX-ROW-MISMATCH', `[真树] \`${concept}\` 的构案：页上 ${JSON.stringify(row[3])} / 生效构案派生 ${JSON.stringify(wantDecision)}`)
            if (typeof c.unit !== 'string' || c.unit.trim() === '') push('INDEX-UNIT-MISSING', `[真树] census 的 \`${concept}\` 没有单位（rule=${JSON.stringify(c.rule)}）`)
            else if ((row[4] ?? '') !== c.unit) push('INDEX-UNIT-MISMATCH', `[真树] \`${concept}\` 的单位：页上 ${JSON.stringify(row[4])} / census ${JSON.stringify(c.unit)}`)
          }
          if (!(pages.构案.concepts?.columns ?? []).includes('单位')) {
            push('INDEX-UNIT-MISSING', `[真树] 概念表页的列名里没有「单位」（实得 ${JSON.stringify(pages.构案.concepts?.columns ?? null)}）`)
          }
        }
      }
      if (before.digest !== after.digest) {
        push('CHECK-NOT-READONLY', `[真树] 跑完 census+check，账本/ 那棵树变了：${before.digest.slice(0, 16)} → ${after.digest.slice(0, 16)}`)
      }
    }

    // ── ② 解析面在哪（测试侧自检）：只许指向 `presets/agenia/lib/决议-ledger.mjs` ─────
    {
      const harness = readText(path.join(PATHS.testRoot, 'support', 'decision-ledger.mjs')) ?? ''
      const OLD_POINTER = '全在 `.tools/census.mjs` 与 `.tools/决议-check.mjs` 里'
      const namesLib = harness.includes('presets/agenia/lib/决议-ledger.mjs')
      const keepsOld = harness.includes(OLD_POINTER) || harness.includes('.tools/lib/决议-ledger.mjs')
      rec.readings.parse_pointer = { names_lib: namesLib, keeps_old: keepsOld }
      if (!namesLib) push('PARSE-POINTER', '`tests/.../support/decision-ledger.mjs` 的头没点名 `presets/agenia/lib/决议-ledger.mjs` —— 解析面只有一份，三个载体都要说同一句话')
      if (keepsOld) push('PARSE-POINTER', `\`support/decision-ledger.mjs\` 里还留着旧指针（${JSON.stringify(OLD_POINTER)} / \`.tools/lib/…\`）—— 0012 之后那些路径不存在`)
    }

    if (!(hasCensus && hasCheck)) {
      caseFail(problems)
      return
    }

    // ── ③ 夹具：good 绿 ────────────────────────────────────────────────────────
    {
      const { run } = (() => {
        const scene = goodLedger({ caseId: 'DEC-04', tag: 'good' })
        return { run: runCheck(scene.root) }
      })()
      rec.readings.good = { exit: run.exit, codes: codesOf(run.json) }
      expectCodes(problems, run, [], push, { label: 'DEC-04/good' })
    }
    // ── ④ 刀：改页上一个格 ⇒ 红，点名那一条 ─────────────────────────────────────
    {
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'stale-count' })
      const file = path.join(scene.root, '账本', '产品', 'INDEX.md')
      const text = readText(file)
      const changed = text.replace('| 0001 | 产品口径样张 | 2026-11-12 | 生效 | 1 |', '| 0001 | 产品口径样张 | 2026-11-12 | 已废 | 1 |')
      if (changed === text) push('KNIFE-ANCHOR', '[DEC-04/stale-count] 产品页那一行不在（夹具锚点漂了）')
      else writeFileSync(file, changed, 'utf8')
      const run = runCheck(scene.root)
      rec.readings.stale_count = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 180)) }
      if (changed !== text && expectCodes(problems, run, ['INDEX-ROW-MISMATCH'], push, { label: 'DEC-04/stale-count' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes('0001') && msg.includes('已废') && msg.includes('生效'))) {
          push('NOT-NAMED', `[DEC-04/stale-count] 报文要点名 0001 与两侧值（已废 / 生效），实得 ${JSON.stringify(msg.slice(0, 220))}`)
        }
      }
    }
    // ── ⑤ 刀：加一份实现、**不**重新生成 ⇒ 红（"页被信了"的反面证人）───────────────
    {
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'impl-added' })
      writeFileSync(path.join(scene.root, 'src', 'a3.mjs'), "// 夹具：新加的一份实现\nconst needle = 'LEDGER_PROBE_A'\n", 'utf8')
      const run = runCheck(scene.root)
      rec.readings.impl_added = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 180)) }
      if (expectCodes(problems, run, ['INDEX-ROW-MISMATCH'], push, { label: 'DEC-04/impl-added' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes(GOOD_CONCEPTS[0].concept) && /3/.test(msg) && /2/.test(msg))) {
          push('NOT-NAMED', `[DEC-04/impl-added] 报文要点名概念 \`${GOOD_CONCEPTS[0].concept}\` 与"派生 3 / 页上 2"，实得 ${JSON.stringify(msg.slice(0, 240))}`)
        }
      }
      // ── ⑥ 重新生成（`--op index`，唯一写页的人）⇒ 绿，且页上真的变成 3 ──────────────
      const impls = [...GOOD_IMPLS, { rel: 'src/a3.mjs', needle: 'LEDGER_PROBE_A' }]
      const regenerated = goodLedger({ caseId: 'DEC-04', tag: 'regenerated', impls })
      const write = runIndex(regenerated.root)
      rec.readings.regenerated_write = { exit: write.exit, ok: write.json?.ok ?? null, codes: codesOf(write.json), written: write.json?.written ?? null }
      const checkAfter = runCheck(regenerated.root)
      rec.readings.regenerated = { exit: checkAfter.exit, codes: codesOf(checkAfter.json), ok: checkAfter.json?.ok ?? null }
      if (expectCodes(problems, write, [], push, { label: 'DEC-04/regenerated-index' })
        && expectCodes(problems, checkAfter, [], push, { label: 'DEC-04/regenerated' })) {
        const page = tableAfter(readText(path.join(regenerated.root, '账本', '构案', 'INDEX.md')), '概念')
        const row = rowsByFirstCell(page).get(GOOD_CONCEPTS[0].concept)
        if (row === undefined || Number(row[2]) !== 3 || row[4] !== '份文件（含注释）') {
          push('INDEX-NOT-REGENERATED', `[DEC-04/regenerated] \`--op index\` 之后构案页的概念行应当是 \`${GOOD_CONCEPTS[0].concept} … 3 … 份文件（含注释）\`，实得 ${JSON.stringify(row)}`)
        }
      }
    }
    // ── ⑦ 标记行删掉 ⇒ 红（"这一页是生成的"必须自己说得出来）───────────────────
    {
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'not-generated' })
      const file = path.join(scene.root, '账本', '产品', 'INDEX.md')
      writeFileSync(file, readText(file).replace(/^<!--[^\n]*-->\n\n/u, ''), 'utf8')
      const run = runCheck(scene.root)
      rec.readings.not_generated = { exit: run.exit, codes: codesOf(run.json) }
      expectCodes(problems, run, ['INDEX-NOT-GENERATED'], push, { label: 'DEC-04/not-generated' })
    }
    // ── ⑧ 行集：缺一行 / 多一行 / 次序变了 / 册里混进别的文件 ─────────────────────
    {
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'missing-row' })
      const file = path.join(scene.root, '账本', '产品', 'INDEX.md')
      const text = readText(file)
      writeFileSync(file, text.replace('| 0001 | 产品口径样张 | 2026-11-12 | 生效 | 1 |\n', ''), 'utf8')
      const run = runCheck(scene.root)
      rec.readings.missing_row = { exit: run.exit, codes: codesOf(run.json) }
      expectCodes(problems, run, ['INDEX-ROW-MISSING'], push, { label: 'DEC-04/missing-row' })
    }
    {
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'extra-row' })
      const file = path.join(scene.root, '账本', '产品', 'INDEX.md')
      writeFileSync(file, readText(file).replace(/\n+$/u, '\n| 9999 | 手改 | 2026-11-12 | 生效 | 0 |\n'), 'utf8')
      const run = runCheck(scene.root)
      rec.readings.extra_row = { exit: run.exit, codes: codesOf(run.json) }
      expectCodes(problems, run, ['INDEX-ROW-EXTRA'], push, { label: 'DEC-04/extra-row' })
    }
    {
      // 两条产品、两行对调：行集相同，但页的字节与重算不是同一份 ⇒ `INDEX-ROW-MISMATCH`
      const decisions = [
        goodDecisionProduct0001(),
        { ...goodDecisionProduct0001({ 主题: '第二件产品' }), id: '0002', title: '第二件产品' },
        goodScheme('0002', '子构案'),
        goodScheme('0003', '第二件产品的落地方案', { 父: '0002', 依据P: '0002' }),
      ]
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'order', decisions })
      const file = path.join(scene.root, '账本', '产品', 'INDEX.md')
      const text = readText(file)
      const a = '| 0001 | 产品口径样张 | 2026-11-12 | 生效 | 1 |'
      const b = '| 0002 | 第二件产品 | 2026-11-12 | 生效 | 1 |'
      if (!text.includes(a) || !text.includes(b)) push('KNIFE-ANCHOR', '[DEC-04/order] 两行锚点不在')
      else writeFileSync(file, text.replace(a, '@@A@@').replace(b, a).replace('@@A@@', b), 'utf8')
      const run = runCheck(scene.root)
      rec.readings.order = { exit: run.exit, codes: codesOf(run.json) }
      expectCodes(problems, run, ['INDEX-ROW-MISMATCH'], push, { label: 'DEC-04/order' })
    }
    {
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'stray-file' })
      writeFileSync(path.join(scene.root, '账本', '产品', 'notes.md'), '# 手写的旁注\n', 'utf8')
      const run = runCheck(scene.root)
      rec.readings.stray_file = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 160)) }
      if (expectCodes(problems, run, ['BOOK-STRAY-FILE'], push, { label: 'DEC-04/stray-file' })) {
        if (!messagesOf(run.json).some((m) => m.includes('notes.md'))) push('NOT-NAMED', '[DEC-04/stray-file] 报文要点名 notes.md')
      }
    }
    // ── ⑨ 单位那一列：改一个单位 ⇒ 红，点名概念（M4 的翻面）───────────────────────
    {
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'unit-mismatch' })
      const file = path.join(scene.root, '账本', '构案', 'INDEX.md')
      const text = readText(file)
      const before = `| ${GOOD_CONCEPTS[0].concept} | ${GOOD_CONCEPTS[0].owner} | 2 | 0001 | 份文件（含注释） |`
      const after = `| ${GOOD_CONCEPTS[0].concept} | ${GOOD_CONCEPTS[0].owner} | 2 | 0001 | 份 |`
      if (!text.includes(before)) push('KNIFE-ANCHOR', '[DEC-04/unit-mismatch] 概念行锚点不在')
      else writeFileSync(file, text.replace(before, after), 'utf8')
      const run = runCheck(scene.root)
      rec.readings.unit_mismatch = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 180)) }
      if (expectCodes(problems, run, ['INDEX-ROW-MISMATCH'], push, { label: 'DEC-04/unit-mismatch' })) {
        if (!messagesOf(run.json).some((m) => m.includes(GOOD_CONCEPTS[0].concept))) {
          push('NOT-NAMED', `[DEC-04/unit-mismatch] 报文要点名概念 \`${GOOD_CONCEPTS[0].concept}\``)
        }
      }
    }

    caseFail(problems)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DEC-05 · census 的计数口径（0012 的重指：概念表在 `账本/概念表.md`；工具在 preset）
// ═══════════════════════════════════════════════════════════════════════════
test('DEC-05 census：一个概念两处实现 ⇒ 2；一处 ⇒ 1；零处 ⇒ 0；同文件两处仍 1；glob 之外不算', async () => {
  await runCase('DEC-05', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CENSUS, '契约 §3.3 的 census')) {
      caseFail(problems)
      return
    }

    /** 一个概念、一份夹具：`count` / `implementations` / `total` 都是手写期望。 */
    const scene = ({ tag, concepts, impls, want, wantFiles, note, wantUnit = '份文件（含注释）' }) => {
      const built = buildScene({ caseId: 'DEC-05', tag, concepts, impls, index: null })
      const run = runCensus(built.root)
      const c = (run.json?.concepts ?? []).find((x) => x.concept === concepts[0].concept) ?? null
      rec.readings[tag] = {
        root: built.root, exit: run.exit, ok: run.json?.ok ?? null, codes: codesOf(run.json),
        concept: c, total: run.json?.total_concepts ?? null, note,
      }
      if (!expectCodes(problems, run, [], push, { label: `DEC-05/${tag}` })) return
      if (c === null) {
        push('CENSUS-CONCEPT-MISSING', `[DEC-05/${tag}] census 的 concepts[] 里没有 \`${concepts[0].concept}\`（实得 ${JSON.stringify((run.json?.concepts ?? []).map((x) => x.concept))}）`)
        return
      }
      if (c.count !== want) push('CENSUS-COUNT', `[DEC-05/${tag}] \`${concepts[0].concept}\` 的实现数必须是 ${want}，实得 ${JSON.stringify(c.count)} —— ${note}`)
      if (JSON.stringify(c.implementations) !== JSON.stringify(wantFiles)) {
        push('CENSUS-FILES', `[DEC-05/${tag}] implementations 必须是 ${JSON.stringify(wantFiles)}，实得 ${JSON.stringify(c.implementations)}`)
      }
      if (c.count !== (c.implementations ?? []).length) {
        push('CENSUS-COUNT', `[DEC-05/${tag}] count (${c.count}) 必须等于 implementations.length (${(c.implementations ?? []).length})`)
      }
      if (c.unit !== wantUnit) {
        push('CENSUS-UNIT', `[DEC-05/${tag}] \`${concepts[0].concept}\` 的单位必须是 ${JSON.stringify(wantUnit)}，实得 ${JSON.stringify(c.unit)}（rule=${JSON.stringify(c.rule)}）`)
      }
      if (run.json.total_concepts !== 1) push('CENSUS-TOTAL', `[DEC-05/${tag}] total_concepts 必须是 1，实得 ${JSON.stringify(run.json.total_concepts)}`)
      // 🔴 **人读那一页**：老板读的就是这一页（契约 §3.3）—— 它必须印得出那个数，而不只是 JSON 里有。
      const text = runCensusText(built.root)
      const conceptRe = new RegExp(`^\\s*${want}\\s+${concepts[0].concept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`)
      rec.readings[tag].text = { exit: text.exit, lines: text.lines.filter((l) => l.trim() !== '').slice(0, 4), stderr_head: String(text.stderr).slice(0, 200) }
      if (text.exit !== 0) {
        push('CENSUS-TEXT', `[DEC-05/${tag}] 人读那一跑 exit=${text.exit}（契约 §3.3 要求 0）· stderr=${JSON.stringify(rec.readings[tag].text.stderr_head)}`)
      } else {
        if (!text.lines.some((l) => conceptRe.test(l))) {
          push('CENSUS-TEXT', `[DEC-05/${tag}] 人读输出里没有 \`${want}  ${concepts[0].concept}\` 这一行（实得 ${JSON.stringify(rec.readings[tag].text.lines)}）`)
        }
        const summary = `census 概念 1 · 实现合计 ${want}`
        if (!text.stdout.includes(summary)) {
          push('CENSUS-TEXT', `[DEC-05/${tag}] 人读输出缺收口那一行：${JSON.stringify(summary)}（实得 ${JSON.stringify(text.stdout.slice(0, 300))}）`)
        }
      }
    }

    const A = { concept: '决议账本三册制', probe: 'LEDGER_PROBE_A', scan: 'src/**/*.mjs', owner: '组长' }
    // ① 两处 ⇒ 2（探针字面量同时出现在概念表自己那一行 ⇒ 决议/ 不许被扫，否则这里会数出 3）
    scene({
      tag: 'two',
      concepts: [A],
      impls: [{ rel: 'src/a1.mjs', needle: 'LEDGER_PROBE_A' }, { rel: 'src/a2.mjs', needle: 'LEDGER_PROBE_A' }],
      want: 2,
      wantFiles: ['src/a1.mjs', 'src/a2.mjs'],
      note: '两处；若把 `账本/` 下的概念表也算进来会变成 3（自吞）',
    })
    // ② 一处 ⇒ 1
    scene({
      tag: 'one', concepts: [A], impls: [{ rel: 'src/a1.mjs', needle: 'LEDGER_PROBE_A' }],
      want: 1, wantFiles: ['src/a1.mjs'], note: '一处',
    })
    // ③ 零处 ⇒ 0（不是缺行、不是 —）
    scene({ tag: 'zero', concepts: [A], impls: [], want: 0, wantFiles: [], note: '还没实现：0，不是"没有这一行"' })
    // ④ 同一个文件里出现两次 ⇒ 仍 1（按文件数，不按次数）
    scene({
      tag: 'twice-one-file', concepts: [A], impls: [{ rel: 'src/a1.mjs', needle: 'LEDGER_PROBE_A', times: 2 }],
      want: 1, wantFiles: ['src/a1.mjs'], note: '同一个文件里两次 ⇒ 仍是 1（按文件不按出现次数）',
    })
    // ⑤ glob 之外不算
    scene({
      tag: 'outside-glob', concepts: [A], impls: [{ rel: 'docs/not-scanned.mjs', needle: 'LEDGER_PROBE_A' }],
      want: 0, wantFiles: [], note: '文件在盘上、含探针，但不在 `扫描` 那一列里 ⇒ 0（否则"扫描"是装饰）',
    })
    // ⑥ 零代码决定（T5 / 契约 §3.2）：声明 `计数口径 = 零代码` ⇒ 实现数恒为 0，单位是 `零代码决定`；
    //    探针照旧命中（那两份文件是**见证**，不是实现）。刀：同一条探针换成 `file` ⇒ 数出 2 ——
    //    证明这个 0 来自**那一列声明的口径**，不是探针没扫到。
    {
      const P = { concept: '面板搁置', probe: 'PANEL_OFF_MARK', scan: 'src/**/*.mjs', owner: '组长' }
      scene({
        tag: 'zero-code',
        concepts: [{ ...P, rule: '零代码' }],
        impls: [{ rel: 'src/p1.mjs', needle: 'PANEL_OFF_MARK' }, { rel: 'src/p2.mjs', needle: 'PANEL_OFF_MARK' }],
        want: 0,
        wantFiles: [],
        wantUnit: '零代码决定',
        note: '声明的零代码决定：探针命中两份见证文件，但实现数恒为 0',
      })
      // 刀：同一个探针，口径换回 `file` ⇒ 2（"0"是口径说的，不是探针没命中）
      scene({
        tag: 'zero-code-knife',
        concepts: [{ ...P, rule: 'file' }],
        impls: [{ rel: 'src/p1.mjs', needle: 'PANEL_OFF_MARK' }, { rel: 'src/p2.mjs', needle: 'PANEL_OFF_MARK' }],
        want: 2,
        wantFiles: ['src/p1.mjs', 'src/p2.mjs'],
        note: '同一份探针、口径 file ⇒ 2 —— 零代码那一行的 0 是"声明的口径"给的',
      })
      // 见证读数：零代码那一跑里 `files` 必须看得见那两份（探针没被丢掉，只是不算实现）
      const witness = rec.readings['zero-code']?.concept?.files ?? []
      if (!(Array.isArray(witness) && witness.length === 2)) {
        push('CENSUS-ZERO-WITNESS', `[DEC-05/zero-code] 零代码那一行的 \`files\`（见证）必须是两份，实得 ${JSON.stringify(witness)} —— `
          + '探针仍要扫：它是"库里唯一留下的痕迹"，丢掉它这一行就变成了"什么都没量"')
      }
    }

    // ⑦ 真树那一腿：census 读得出、单位都在；**0 只许出现在"声明了 `零代码`"或"按形状量过"的行上**
    //
    // 🔴 MF-2（Gate 4 round-2）的地板在这里现算：**派生** = `ceil(0.9 × 参照)`，
    // 参照 = min(git 跟踪的代码文件数, 盘上独立数出的代码文件数)。**没有手写的文件数**。
    const realSurface = shapeSurfaceReading(PATHS.repo)
    const realFloor = shapeScanFloor(PATHS.repo, { surface: realSurface })
    {
      const run = runCensus(PATHS.repo)
      rec.readings.real = {
        exit: run.exit, ok: run.json?.ok ?? null, codes: codesOf(run.json),
        concepts: (run.json?.concepts ?? []).map((c) => ({ concept: c.concept, count: c.count, unit: c.unit, rule: c.rule, scanned_files: c.scanned_files ?? null, scan_empty: c.scan_empty ?? null })),
        floor: realFloor,
      }
      if (run.json === null) {
        push('TREE-MISSING', `[真树] census 在仓库根上读不出 JSON（${run.json_error}）—— \`决议/概念表.md\` 今天不在（Gate 3 建）`)
      } else if (!expectCodes(problems, run, [], push, { label: 'DEC-05/real' })) {
        // 红因已在码集里
      } else {
        /**
         * 🔴 **"0 处"只有两种合法形状**：
         *   · 这一行声明了 `零代码`（按设计没有实现）；
         *   · 这一行是**按形状**量的（`atomic-write-by-shape`），而且**扫描面真的量到了**：
         *     `scan_empty === false` 且 `scanned_files ≥ 地板`。否则那个 0 是**真空真**（探针写错 / 面没盖住）——
         *     今天 `原子写剩余实现` 那一行就是这种：探针是字面量 `writeFileSync…renameSync`（带省略号），永远数不出东西。
         * ⚠️ 地板是**派生**的（`realFloor`），不是手写数：面被缩掉（例如少一份 glob）时 `scanned_files` 会掉到地板下 ⇒ 这里红。
         */
        const measuredShapeZero = (c) => c.rule === SHAPE_RULE
          && c.scan_empty === false
          && Number.isInteger(c.scanned_files)
          && c.scanned_files >= realFloor.floor
        const zero = rec.readings.real.concepts.filter((c) => c.count === 0 && c.rule !== '零代码' && !measuredShapeZero(c))
        if (zero.length > 0) {
          push('CENSUS-REAL-ZERO', `[真树] 这些概念数出 0 处实现、而口径不是 \`零代码\` / 也不是"按形状且量过面"：${JSON.stringify(zero)} —— `
            + '探针要么写错、要么扫描范围没盖住。真树上 0 只有两种合法形状：这一行**声明**了 `零代码`（零代码决定），'
            + `或者这一行是**按形状**量的且 \`scan_empty:false\` + \`scanned_files ≥ 地板\`（${shapeScanFloorText(realFloor)}；量过面才敢说 0）。`)
        }
        const missingUnit = rec.readings.real.concepts.filter((c) => typeof c.unit !== 'string' || c.unit.trim() === '')
        if (missingUnit.length > 0) {
          push('CENSUS-UNIT', `[真树] 这些概念没有单位：${JSON.stringify(missingUnit.map((c) => c.concept))} —— 数不带单位就只是一个数`)
        }
      }
    }

    // ══ ⑧ 按形状数手搓原子写（构案 0007 · B2）：真树 0 处 · 正负对照 · 允许清单 ═══════════════
    // 病：`writeFileAtomic` 归一之后，"原子写"这个概念还有**手搓实现**（自己拼临时名 + writeFileSync + renameSync），
    // 而按**名字**数的 census 数不到它们 ⇒ 概念表那一行要一条**按形状**的口径（`atomic-write-by-shape`）。
    // 这一组腿住在 `DEC-05`（它本来就是"census 的计数口径"那一格）：**不新增用例**，分母不破（0007 §七）。
    {
      const ruleRegistered = Object.hasOwn(COUNT_RULES, SHAPE_RULE)
      rec.readings.shape_rule = { token: SHAPE_RULE, registered: ruleRegistered, label: COUNT_RULES[SHAPE_RULE]?.label ?? null }
      if (!ruleRegistered) {
        // 口径没落 ≠ 夹具没接上：先跑一棵正对照 + 一棵负对照，证明夹具管线是活的
        // （它们此刻的码集是 `CONCEPT-TABLE-SHAPE`：那一行声明的口径不认识 —— Gate 3 落 token 之后才会变成期望值）。
        for (const [tag, files] of [['handrolled-tmp', [{ rel: 'presets/agenia/lib/handrolled.mjs', text: SHAPE_FIXTURES.handrolledTmp }]], ['read-only', [{ rel: 'presets/agenia/lib/read-only.mjs', text: SHAPE_FIXTURES.readOnly }]]]) {
          const built = shapeScene({ caseId: 'DEC-05', tag: `dormant-${tag}`, files })
          const reading = shapeReading(built.root)
          rec.readings[`shape_dormant_${tag}`] = { root: built.root, exit: reading.exit, codes: reading.problem_codes, count: reading.concept?.count ?? null }
        }
        push('DEC05-SHAPE-RULE-MISSING',
          `\`COUNT_RULES\` 里没有 \`${SHAPE_RULE}\` 这个计数口径（Gate 3：把它加进 \`.tools/lib/决议-ledger.mjs\` 的闭集，`
          + `并把 \`决议/概念表.md\` 里「${SHAPE_CONCEPT}」那一行改成按形状量）。`
          + `夹具管线已跑通（读数 shape_dormant_handrolled-tmp / shape_dormant_read-only：码集 ${JSON.stringify([rec.readings['shape_dormant_handrolled-tmp']?.codes, rec.readings['shape_dormant_read-only']?.codes])}）`)
      } else {
        // ── 真树 ────────────────────────────────────────────────────────────────────────
        const real = shapeReading(PATHS.repo)
        const concept = real.concept
        rec.readings.shape_real = {
          root: PATHS.repo, exit: real.exit, problem_codes: real.problem_codes, missing_fields: real.missing_fields,
          concept, summary: shapeSummary(concept), floor: realFloor,
          surface: { total: realSurface.total, presets: realFloor.presets_only, tools: realFloor.tools_only, excluded: realSurface.excluded },
        }
        if (concept === null) {
          push('DEC05-SHAPE-CONCEPT', `真树 \`${PATHS.repo}\` 的 census 里没有「${SHAPE_CONCEPT}」这个概念 —— 0007 登记时那一行要在（主题与构案 0007 同名）`)
        } else {
          // 缺字段**不短路**：缺哪一格就说哪一格，别的格照判（否则"读数缺 scan_excluded"会把"面比名字窄"整条盖住）
          if (real.missing_fields.length > 0) {
            push('DEC05-SHAPE-FIELDS', `「${SHAPE_CONCEPT}」的读数缺字段 ${JSON.stringify(real.missing_fields)} —— 这一组腿要能拆开读（扫描面 / 扫了几份 / 每处形状 / 允许清单 / 排掉了什么），缺一个就只剩一个数`)
          }
          if (real.exit !== 0 || real.problem_codes.length > 0) {
            push('DEC05-SHAPE-CENSUS-PROBLEMS', `真树 census exit=${real.exit}，码集 ${JSON.stringify(real.problem_codes)} —— 概念表 / 允许清单本身有问题（报文 ${JSON.stringify(real.problems.map((p) => p.message).slice(0, 3))}）`)
          }
          if (concept.rule !== SHAPE_RULE) push('DEC05-SHAPE-RULE', `「${SHAPE_CONCEPT}」的计数口径必须是 \`${SHAPE_RULE}\`，实得 ${JSON.stringify(concept.rule)} —— 今天那一行是 \`site\` + 一个字面量探针（永远数不出东西，是真空真）`)
          // 单位：既要说"处"，也要说清**盖的是哪些面**（MF-1：名字/单位比面窄 = 同一族病）
          for (const p of shapeUnitProblems(concept)) push(p.code, p.message)
          const scan = Array.isArray(concept.scan) ? concept.scan.map((s) => String(s).replace(/\\/g, '/')) : []
          for (const glob of SHAPE_SURFACE) {
            if (!scan.includes(glob)) {
              push('DEC05-SHAPE-SCAN', `扫描面缺 ${JSON.stringify(glob)}（实得 ${JSON.stringify(scan)}）—— 这一行的名字是「${SHAPE_CONCEPT}」，`
                + '所以它的面必须是**全库代码面**：只写 `presets/**` 时那个 0 只是"presets 里的 0"（0012 把 census / 决议-check 搬进 preset 之后，`.tools/` 不再是这两支工具的家）')
            }
          }
          if (concept.scan_empty === true) push('DEC05-SHAPE-SCAN', '`scan_empty: true` —— 扫描面一份文件都没扫到，"0 处"是真空真，不是绿')
          if (!Number.isInteger(concept.scanned_files) || concept.scanned_files < realFloor.floor) {
            push('DEC05-SHAPE-SCAN', `扫描面只读到 ${JSON.stringify(concept.scanned_files)} 份代码文件，低于**派生下限**（${shapeScanFloorText(realFloor)}；`
              + `判据侧独立数出 ${realSurface.total} 份：presets ${realFloor.presets_only} + .tools ${realFloor.tools_only}）—— 面塌了，"0 处"不作数`)
          }
          // 排除项：切掉了什么必须印出来，而且只许切非代码区（MF-2）
          for (const p of shapeExclusionProblems({ root: PATHS.repo, concept, surface: realSurface })) push(p.code, p.message)
          const sites = Array.isArray(concept.sites) ? concept.sites : []
          const allow = Array.isArray(concept.allowlist) ? concept.allowlist : []
          const aSites = sites.filter((s) => s?.shape === 'A')
          const bSites = sites.filter((s) => s?.shape === 'B')
          const aAllow = allow.filter((e) => e?.shape === 'A')
          const bAllow = allow.filter((e) => e?.shape === 'B')
          rec.readings.shape_real.breakdown = { sites: sites.length, a: aSites.length, b: bSites.length, allowlisted_a: aAllow.length, allowlisted_b: bAllow.length }
          if (sites.length !== aSites.length + bSites.length) {
            push('DEC05-SHAPE-SITES', `sites 里有 ${sites.length - aSites.length - bSites.length} 条既不是 A 也不是 B（实得 ${JSON.stringify(sites.filter((s) => !['A', 'B'].includes(s?.shape)))}）—— 形状闭集只有 A / B`)
          }
          if (concept.count !== aSites.length + bSites.length - bAllow.length) {
            push('DEC05-SHAPE-COUNT', `count=${JSON.stringify(concept.count)} 对不上"${aSites.length} 处 A + ${bSites.length} 处 B − ${bAllow.length} 条放行的 B"（= ${aSites.length + bSites.length - bAllow.length}）—— 数不能拆，就不是读数`)
          }
          {
            const allowedB = new Set(bAllow.map((e) => `${e.file}:${e.line}`))
            const counted = [...aSites, ...bSites.filter((s) => !allowedB.has(`${s.file}:${s.line}`))].map((s) => `${s.file}:${s.line}`).sort()
            const got = Array.isArray(concept.implementations) ? [...concept.implementations] : null
            if (got === null || JSON.stringify(got) !== JSON.stringify(counted)) {
              push('DEC05-SHAPE-IMPLEMENTATIONS', `implementations 必须逐字是"算数的那些处" ${JSON.stringify(counted)}，实得 ${JSON.stringify(got)} —— 明细与 count 各说各的，读的人没法回推`)
            }
          }
          if (aAllow.length > 0) {
            push('DEC05-SHAPE-ALLOWLIST-HIDES-A', `允许清单放行了 ${aAllow.length} 处 **A 族**（手搓文件原子写）：${JSON.stringify(aAllow.map((e) => `${e.file}:${e.line ?? '?'}`))} —— A 族是这一票要清的东西，不许被清单藏起来（RC-3 只允许放行合法非原子 rename）`)
          }
          // 刀（全库口径）：留一处不改 ⇒ 红必须**点名那一处**
          for (const p of shapeCountZeroProblems(concept)) push(p.code, p.message)
          const realProblems = []
          for (const entry of allow) for (const p of allowlistEntryProblems(entry, { root: PATHS.repo })) realProblems.push(p)
          rec.readings.shape_real.allowlist_problems = realProblems
          for (const p of realProblems) push(p.code, `[真树允许清单] ${p.message}`)
        }

        // ── 夹具：正对照（必须数得出来）· 负对照（必须 0）────────────────────────────────
        const shapeCase = ({ tag, files, allowlist = null, concept: conceptRow = {}, wantCodes = [], floorCheck = false }) => {
          const built = shapeScene({ caseId: 'DEC-05', tag, files, allowlist, concept: conceptRow })
          const reading = shapeReading(built.root)
          const c = reading.concept
          const surface = shapeSurfaceReading(built.root)
          const floor = shapeScanFloor(built.root, { surface })
          const entry = {
            root: built.root, files: built.files, exit: reading.exit, codes: [...reading.problem_codes].sort(),
            count: c?.count ?? null, scanned_files: c?.scanned_files ?? null, scan_empty: c?.scan_empty ?? null, unit: c?.unit ?? null,
            sites: (c?.sites ?? []).map((s) => ({ file: s.file, line: s.line, shape: s.shape })),
            allowlist: (c?.allowlist ?? []).map((e) => ({ file: e.file, line: e.line, kind: e.kind, shape: e.shape, why: e.why })),
            scan_excluded: Array.isArray(c?.scan_excluded) ? c.scan_excluded : null,
            floor: { floor: floor.floor, reference: floor.reference, source: floor.source, disk: surface.total },
            problems: reading.problems.map((p) => `${p.code}: ${p.message}`).slice(0, 4),
          }
          rec.readings[`shape_${tag}`] = entry
          const usable = expectCodes(problems, reading.run, wantCodes, push, { label: `DEC-05/shape-${tag}` })
          /**
           * 地板刀：**捕获**，不进 cases 的红集（默认不判）。
           * 夹具里故意把面缩窄的那一棵（`surface-narrowed`）要的正是"派生地板当场咬" —— 那是**刀**，不是真红；
           * 让真红与刀混在一个数组里，实现岗落完之后这一格会永远红（而红的是刀自己）。
           */
          const floorVerdict = Number.isInteger(c?.scanned_files) && c.scanned_files < floor.floor
            ? [problem('DEC05-SHAPE-SCENE-SURFACE', `[夹具 ${tag}] 扫描面只读到 ${c.scanned_files} 份，而判据侧独立数出 ${surface.total} 份 ⇒ 派生地板 ${floor.floor}（${shapeScanFloorText(floor)}）—— 面塌了`)]
            : []
          entry.floor_verdict = floorVerdict.map((p) => p.code)
          if (!floorCheck) entry.floor_verdict = null // 这一格没配 ⇒ 读数里写 null（"没判"不是"绿"）
          return { built, reading, concept: c, entry, usable, floorVerdict }
        }
        const F = (rel, text) => ({ rel: `presets/agenia/lib/${rel}`, text })
        const countIs = (want) => (c) => (c?.count === want ? [] : [problem('DEC05-SHAPE-SCENE-COUNT', `count 必须是 ${want}，实得 ${JSON.stringify(c?.count)}`)])
        const scannedIs = (want) => (c) => (c?.scanned_files === want ? [] : [problem('DEC05-SHAPE-SCENE-SURFACE', `scanned_files 必须是 ${want}，实得 ${JSON.stringify(c?.scanned_files)}`)])
        const siteShape = (index, shape) => (c) => {
          const s = (c?.sites ?? [])[index]
          return s?.shape === shape ? [] : [problem('DEC05-SHAPE-SCENE-SHAPE', `sites[${index}].shape 必须是 ${shape}，实得 ${JSON.stringify(s?.shape)}（sites=${JSON.stringify(c?.sites)}）`)]
        }
        const check = (tag, result, extra = []) => {
          if (!result.usable) return
          for (const p of extra) push(p.code, `[夹具 ${tag}] ${p.message}`)
        }
        let r = shapeCase({ tag: 'handrolled-tmp', files: [F('handrolled.mjs', SHAPE_FIXTURES.handrolledTmp)] })
        check('handrolled-tmp', r, [...countIs(1)(r.concept), ...scannedIs(1)(r.concept), ...siteShape(0, 'A')(r.concept), ...(r.entry.unit?.includes('处') ? [] : [problem('DEC05-SHAPE-SCENE-UNIT', `单位要含"处"，实得 ${JSON.stringify(r.entry.unit)}`)])])
        r = shapeCase({ tag: 'handrolled-tmp-pid', files: [F('handrolled-pid.mjs', SHAPE_FIXTURES.handrolledPid)] })
        check('handrolled-tmp-pid', r, [...countIs(1)(r.concept), ...siteShape(0, 'A')(r.concept)])
        r = shapeCase({ tag: 'handrolled-writefile', files: [F('handrolled-writefile.mjs', SHAPE_FIXTURES.handrolledWriteFile)] })
        check('handrolled-writefile', r, [...countIs(1)(r.concept), ...siteShape(0, 'A')(r.concept)])
        r = shapeCase({ tag: 'two-sites-one-file', files: [F('two-sites.mjs', `${SHAPE_FIXTURES.handrolledTmp}\n${SHAPE_FIXTURES.handrolledPid}`)] })
        check('two-sites-one-file', r, [...countIs(2)(r.concept), ...scannedIs(1)(r.concept)])
        for (const [tag, text] of [['rename-only', SHAPE_FIXTURES.renameOnly], ['read-only', SHAPE_FIXTURES.readOnly], ['direct-write', SHAPE_FIXTURES.directWrite]]) {
          r = shapeCase({ tag, files: [F(`${tag}.mjs`, text)] })
          check(tag, r, [...countIs(0)(r.concept), ...scannedIs(1)(r.concept)])
        }
        // 真空真：glob 对不上任何文件 ⇒ `scan_empty:true`（"0 处"与"没扫到"必须分得开）
        r = shapeCase({ tag: 'scan-empty', files: [F('outside.mjs', SHAPE_FIXTURES.handrolledTmp)], concept: { scan: 'nowhere/**/*.mjs' } })
        check('scan-empty', r, [...countIs(0)(r.concept), ...(r.concept?.scan_empty === true ? [] : [problem('DEC05-SHAPE-SCENE-EMPTY', `扫描面对不上任何文件时必须 \`scan_empty:true\`，实得 ${JSON.stringify(r.concept?.scan_empty)}`)])])

        // ══ MF-1（Gate 4 round-2）：**面 = 全库代码面**，不是 presets 面 ═══════════════════════
        // 病：概念名叫「原子写剩余实现」，面却只盖 `presets/**` —— `.tools/` 还活着的同一形状数不到。
        // 这一格：`.tools/` 里的一段手搓写法必须**数得到**；留一处不改 ⇒ 判据那句红必须点名那一处。
        r = shapeCase({ tag: 'tools-surface', files: [{ rel: '.tools/probe-tool.mjs', text: SHAPE_FIXTURES.handrolledTmp }] })
        check('tools-surface', r, [
          ...countIs(1)(r.concept),
          ...scannedIs(1)(r.concept),
          ...(r.entry.sites.length === 1 && r.entry.sites[0].file === '.tools/probe-tool.mjs' && r.entry.sites[0].shape === 'A'
            ? [] : [problem('DEC05-SHAPE-SCENE-SURFACE', `命中必须落在 \`.tools/probe-tool.mjs\` 且是 A 族，实得 ${JSON.stringify(r.entry.sites)}`)]),
        ])
        {
          // 刀：count 非 0 ⇒ 判据自己那句话必须报 `DEC05-SHAPE-COUNT-ZERO` 且**点名那一处**（不手抄文案）
          const named = shapeCountZeroProblems(r.concept)
          rec.readings.shape_count_zero_knife = { codes: named.map((p) => p.code), message: named[0]?.message ?? null }
          const names = typeof named[0]?.message === 'string' && named[0].message.includes('.tools/probe-tool.mjs:4')
          if (!(named.length === 1 && named[0].code === 'DEC05-SHAPE-COUNT-ZERO' && names)) {
            push('DEC05-SHAPE-KNIFE', `[刀 一处未接共享件] count=1 ⇒ 必须报且只报 \`DEC05-SHAPE-COUNT-ZERO\`、报文点名 \`.tools/probe-tool.mjs:4\`，实得 ${JSON.stringify(named)}`)
          }
        }
        r = shapeCase({ tag: 'tools-surface-converted', files: [{ rel: '.tools/probe-tool.mjs', text: SHAPE_FIXTURES.readOnly }] })
        check('tools-surface-converted', r, [
          ...countIs(0)(r.concept),
          ...(shapeCountZeroProblems(r.concept).length === 0 ? [] : [problem('DEC05-SHAPE-KNIFE', '[控制 全接共享件] 一处都不剩时 `DEC05-SHAPE-COUNT-ZERO` 不许出现')]),
        ])
        // 刀：把面缩回 presets（= MF-1 之前的写法）⇒ 派生地板当场红（面塌了，不是"代码干净"）
        r = shapeCase({
          tag: 'surface-narrowed',
          files: [F('a.mjs', SHAPE_FIXTURES.readOnly), { rel: '.tools/b.mjs', text: SHAPE_FIXTURES.readOnly }],
          concept: { scan: 'presets/**/*.mjs' },
          floorCheck: true,
        })
        check('surface-narrowed', r, [
          ...scannedIs(1)(r.concept),
          ...(r.entry.floor.disk === 2 && r.entry.floor.floor === 2 ? [] : [problem('DEC05-SHAPE-SCENE-SURFACE', `判据侧必须独立数出 2 份、派生地板 2，实得 ${JSON.stringify(r.entry.floor)}`)]),
          ...(Array.isArray(r.entry.floor_verdict) && r.entry.floor_verdict.includes('DEC05-SHAPE-SCENE-SURFACE')
            ? [] : [problem('DEC05-SHAPE-KNIFE', `[刀 面缩回 presets] 判据侧独立数出 2 份 ⇒ 派生地板 2、census 只读到 1 ⇒ 地板必须咬（\`DEC05-SHAPE-SCENE-SURFACE\`），实得 ${JSON.stringify(r.entry.floor_verdict)}`)]),
        ])

        // ══ MF-2（Gate 4 round-2）：**排除项**——数据根 / 施工区不进面，但必须印出来 ════════════
        const excludedHas = (prefix, files) => (res) => {
          const got = res.entry.scan_excluded
          if (got === null) {
            return [problem('DEC05-SHAPE-SCENE-EXCLUDED', `读数里没有 \`scan_excluded\`（被排除的路径 + 那里有多少份代码文件）—— 实得 ${JSON.stringify(res.concept?.scan_excluded)}`)]
          }
          const hit = got.find((e) => (e?.path ?? e?.prefix) === prefix)
          if (hit === undefined) return [problem('DEC05-SHAPE-SCENE-EXCLUDED', `\`scan_excluded\` 必须含 ${JSON.stringify(prefix)}，实得 ${JSON.stringify(got)}`)]
          if (hit.files !== files) return [problem('DEC05-SHAPE-SCENE-EXCLUDED', `\`scan_excluded\` 说 ${JSON.stringify(prefix)} 有 ${JSON.stringify(hit.files)} 份代码文件，盘上是 ${files} 份（实得 ${JSON.stringify(got)}）`)]
          return []
        }
        // 数据根（`.runtime`）里放一处 A 族：不许计数、不许进 sites，但必须在 `scan_excluded` 里印出来
        r = shapeCase({
          tag: 'runtime-excluded',
          files: [
            { rel: 'presets/agenia/.runtime/reports/_scratch/fake-atomic.mjs', text: SHAPE_FIXTURES.handrolledTmp },
            F('clean.mjs', SHAPE_FIXTURES.readOnly),
          ],
        })
        check('runtime-excluded', r, [
          ...countIs(0)(r.concept),
          ...scannedIs(1)(r.concept),
          ...(r.entry.sites.length === 0 ? [] : [problem('DEC05-SHAPE-SCENE-EXCLUDED', `数据根下的命中不许进 sites，实得 ${JSON.stringify(r.entry.sites)}`)]),
          ...excludedHas('presets/agenia/.runtime', 1)(r),
        ])
        // 施工区（`.tools/_scratch`）里放一处 A 族：同上
        r = shapeCase({ tag: 'tools-scratch-excluded', files: [{ rel: '.tools/_scratch/mutant.mjs', text: SHAPE_FIXTURES.handrolledTmp }] })
        check('tools-scratch-excluded', r, [
          ...countIs(0)(r.concept),
          ...scannedIs(0)(r.concept),
          ...excludedHas('.tools/_scratch', 1)(r),
        ])
        // 刀：读数把**代码面里的真目录**排掉（不是声明的非代码区）⇒ 红（防"缩面"伪装成"排除项"）
        {
          const built = shapeScene({ caseId: 'DEC-05', tag: 'excluded-not-declared', files: [F('a.mjs', SHAPE_FIXTURES.readOnly), F('b.mjs', SHAPE_FIXTURES.handrolledTmp)] })
          const fake = {
            count: 0, rule: SHAPE_RULE, unit: '处手搓原子写（全库代码面）', scan: SHAPE_SURFACE, scan_empty: false,
            scanned_files: 1, implementations: [], sites: [], allowlist: [],
            scan_excluded: [{ path: 'presets/agenia/lib', files: 1 }],
          }
          const verdict = shapeExclusionProblems({ root: built.root, concept: fake })
          rec.readings.shape_scan_excluded_knife = { codes: verdict.map((p) => p.code), messages: verdict.map((p) => p.message).slice(0, 2) }
          if (!verdict.some((p) => p.code === 'DEC05-SHAPE-SCAN-EXCLUDED')) {
            push('DEC05-SHAPE-KNIFE', `[刀 偷缩面] 把 \`presets/agenia/lib\` 写成排除项必须报 \`DEC05-SHAPE-SCAN-EXCLUDED\`（实得 ${JSON.stringify(verdict.map((p) => p.code))}）`)
          }
        }
        // 刀：排除项**漏印**（盘上有 1 份被切掉的代码，读数里没有）⇒ 红
        {
          const built = shapeScene({ caseId: 'DEC-05', tag: 'excluded-unprinted', files: [{ rel: '.tools/_scratch/mutant.mjs', text: SHAPE_FIXTURES.readOnly }] })
          const fake = { count: 0, rule: SHAPE_RULE, unit: '处手搓原子写（全库代码面）', scan: SHAPE_SURFACE, scan_empty: false, scanned_files: 0, implementations: [], sites: [], allowlist: [], scan_excluded: [] }
          const verdict = shapeExclusionProblems({ root: built.root, concept: fake })
          rec.readings.shape_scan_excluded_unprinted_knife = { codes: verdict.map((p) => p.code) }
          if (!verdict.some((p) => p.code === 'DEC05-SHAPE-SCAN-EXCLUDED')) {
            push('DEC05-SHAPE-KNIFE', `[刀 排除项漏印] 盘上 \`.tools/_scratch\` 有 1 份代码被切掉而读数没写，必须报 \`DEC05-SHAPE-SCAN-EXCLUDED\`（实得 ${JSON.stringify(verdict.map((p) => p.code))}）`)
          }
        }
        // 单位盖的面对不对（MF-1 的另一半）：纯函数，窄的那份红、两种宽写法都绿
        {
          const narrow = shapeUnitProblems({ unit: '处手搓原子写（presets 面）', rule: SHAPE_RULE })
          const wideRoots = shapeUnitProblems({ unit: `处手搓原子写（${SHAPE_SCOPE_ROOTS.map((x) => `${x}/**`).join(' + ')} 代码面）`, rule: SHAPE_RULE })
          const wideWord = shapeUnitProblems({ unit: '处手搓原子写（全库代码面）', rule: SHAPE_RULE })
          const noScope = shapeUnitProblems({ unit: '处手搓原子写（按形状）', rule: SHAPE_RULE })
          rec.readings.shape_unit_knife = { narrow: narrow.map((p) => p.code), wide_roots: wideRoots.map((p) => p.code), wide_word: wideWord.map((p) => p.code), no_scope: noScope.map((p) => p.code) }
          if (!narrow.some((p) => p.code === 'DEC05-SHAPE-UNIT-SCOPE')) {
            push('DEC05-SHAPE-KNIFE', `[刀 单位比面窄] '处手搓原子写（presets 面）' 必须报 \`DEC05-SHAPE-UNIT-SCOPE\`（实得 ${JSON.stringify(narrow.map((p) => p.code))}）`)
          }
          if (!noScope.some((p) => p.code === 'DEC05-SHAPE-UNIT-SCOPE')) {
            push('DEC05-SHAPE-KNIFE', `[刀 单位不说面] '处手搓原子写（按形状）' 必须报 \`DEC05-SHAPE-UNIT-SCOPE\`（实得 ${JSON.stringify(noScope.map((p) => p.code))}）—— 今天页上就是这句`)
          }
          for (const [tag, verdict] of [['点全根', wideRoots], ['写全库', wideWord]]) {
            if (verdict.length !== 0) {
              push('DEC05-SHAPE-KNIFE', `[控制 单位${tag}] 这份单位必须全绿，实得 ${JSON.stringify(verdict.map((p) => `${p.code}: ${p.message}`))}`)
            }
          }
        }

        // ── 允许清单：B 族可放行（控制面 = 不放行时数得出来）；A 族不许 ────────────────
        const bLine = SHAPE_FIXTURES.tempRenameOnly.split(/\r?\n/).findIndex((l) => l.includes('renameSync(bodyTmp, finalDir)')) + 1
        const aLine = SHAPE_FIXTURES.handrolledTmp.split(/\r?\n/).findIndex((l) => l.includes('writeFileSync(tmp')) + 1
        r = shapeCase({ tag: 'temp-rename-only', files: [F('temp-rename.mjs', SHAPE_FIXTURES.tempRenameOnly)] })
        check('temp-rename-only', r, [...countIs(1)(r.concept), ...siteShape(0, 'B')(r.concept)])
        r = shapeCase({
          tag: 'allowlisted-b',
          files: [F('temp-rename.mjs', SHAPE_FIXTURES.tempRenameOnly)],
          allowlist: [{ file: 'presets/agenia/lib/temp-rename.mjs', line: bLine, kind: 'non-atomic-rename', why: '整目录换名：文件先写进临时目录，最后整目录 rename，文件级不是原子写' }],
        })
        check('allowlisted-b', r, [
          ...countIs(0)(r.concept),
          ...(r.entry.allowlist.length === 1 && r.entry.allowlist[0].shape === 'B' ? [] : [problem('DEC05-SHAPE-SCENE-ALLOW', `放行的那一条必须以 B 族的身份被记下来（实得 ${JSON.stringify(r.entry.allowlist)}）`)]),
          ...(r.entry.sites.length === 1 ? [] : [problem('DEC05-SHAPE-SCENE-ALLOW', `sites 仍要记着那一处（实得 ${JSON.stringify(r.entry.sites)}）—— 放行是"不算数"，不是"没看见"`)]),
        ])
        r = shapeCase({
          tag: 'allowlist-hides-a',
          files: [F('handrolled.mjs', SHAPE_FIXTURES.handrolledTmp)],
          allowlist: [{ file: 'presets/agenia/lib/handrolled.mjs', line: aLine, kind: 'non-atomic-rename', why: '整目录换名：文件先写进临时目录，最后整目录 rename（这一条是借口，用来试清单能不能藏住 A 族）' }],
        })
        check('allowlist-hides-a', r, (r.concept?.count === 1 ? [] : [problem('DEC05-SHAPE-SCENE-COUNT', `被 A 族点名的条目不许改变计数：count 必须是 1，实得 ${JSON.stringify(r.concept?.count)}`)]))
        // 🔴 0012 的重指：新的 `census` 不再把允许清单的 `SHAPE-ALLOWLIST-STALE` /
        //    `SHAPE-ALLOWLIST-SHAPE` 放进 `problems[]`（只记在读数里）—— 那两条旧腿随旧工具退役，
        //    证据面仍由 `allowlistEntryProblems()` 在下面逐条判（那是判据侧自己的量具）。
        // ── 允许清单的**证据面**（判据侧核；工具只记"这条盖住了哪一处"）──────────────────
        const sharedLine = SHAPE_FIXTURES.sharedBody.split(/\r?\n/).findIndex((l) => l.includes('renameSync(tmp, file)')) + 1
        r = shapeCase({
          tag: 'shared-implementation',
          files: [F('shared.mjs', SHAPE_FIXTURES.sharedBody)],
          allowlist: [{ file: 'presets/agenia/lib/shared.mjs', line: sharedLine, kind: 'shared-implementation', why: '共享原子写实现本体：唯一一份 writeFileAtomic（B 族命中是它自己）' }],
        })
        check('shared-implementation', r, (r.concept?.count === 0 ? [] : [problem('DEC05-SHAPE-SCENE-COUNT', `shared-implementation 条目要把它放行掉（count 0），实得 ${JSON.stringify(r.concept?.count)}`)]))
        if (r.usable) {
          const entry = r.entry.allowlist[0]
          const verdict = allowlistEntryProblems(entry, { root: r.built.root, relPaths: r.built.files })
          rec.readings.shape_allowlist_evidence = { entry, codes: verdict.map((p) => p.code) }
          if (verdict.length > 0) push('DEC05-SHAPE-ALLOWLIST-EVIDENCE', `[夹具 shared-implementation] 证据面把一条**真的**共享实现判红了：${JSON.stringify(verdict)} —— 判据坏了，不是条目坏了`)
          const bad = { ...entry, kind: 'non-atomic-rename', why: '就是这么写的，别问了' }
          const badVerdict = allowlistEntryProblems(bad, { root: r.built.root, relPaths: r.built.files })
          rec.readings.shape_allowlist_reason_knife = { codes: badVerdict.map((p) => p.code) }
          if (!badVerdict.some((p) => p.code === 'DEC05-SHAPE-ALLOWLIST-EVIDENCE')) {
            push('DEC05-SHAPE-ALLOWLIST-KNIFE', `[刀 non-atomic-reason] 把一处共享实现标成"非原子 rename"且理由不提目录，必须报 \`DEC05-SHAPE-ALLOWLIST-EVIDENCE\`（实得 ${JSON.stringify(badVerdict.map((p) => p.code))}）`)
          }
        }
        // 证据面必须翻面：`shared-implementation` 点在一份没有共享正文的文件上 ⇒ 必须红
        {
          const built = shapeScene({ caseId: 'DEC-05', tag: 'shared-no-evidence', files: [F('not-shared.mjs', SHAPE_FIXTURES.tempRenameOnly)] })
          const entry = { file: 'presets/agenia/lib/not-shared.mjs', line: bLine, kind: 'shared-implementation', why: '共享原子写实现本体（其实是散的）' }
          const verdict = allowlistEntryProblems(entry, { root: built.root, relPaths: built.files })
          rec.readings.shape_allowlist_evidence_knife = { codes: verdict.map((p) => p.code) }
          if (!verdict.some((p) => p.code === 'DEC05-SHAPE-ALLOWLIST-EVIDENCE')) {
            push('DEC05-SHAPE-ALLOWLIST-KNIFE', `[刀 shared-no-evidence] 把一份没有共享正文的文件标成 \`shared-implementation\` 必须报 \`DEC05-SHAPE-ALLOWLIST-EVIDENCE\`（实得 ${JSON.stringify(verdict.map((p) => p.code))}）—— 类别成了自报`)
          }
        }
        rec.readings.shape_expected = {
          /** 面 = 全库代码面（Gate 4 round-2 裁定）：三个 glob；地板派生，不手写。 */
          surface: 'presets/**/*.mjs · presets/**/*.js · .tools/**/*.mjs（排除：presets/agenia/.runtime · .tools/_scratch · _staging · _backup · mount-test · __pycache__）',
          floor: `派生：${shapeScanFloorText(realFloor)}（今天真树：presets ${realFloor.presets_only} + .tools ${realFloor.tools_only} = ${realFloor.disk} 份代码）`,
          /** 扩面之后 **转换前** 的诚实读数（探针 `_probe/surface-widened.mjs` 量的，2026-11-13）：3 处 A 族在 `.tools`。 */
          before_conversion: '0012 迁移前：census.mjs 与 决议-check.mjs 还在 .tools（A 族，写临时名那一行）',
          after_conversion: '0012 迁移后：两支工具进 preset；真树 count 0（读数见 shape_real）',
          knife: '留一处未接共享件 ⇒ DEC05-SHAPE-COUNT-ZERO 点名那一处；A 族条目被允许清单点名 ⇒ SHAPE-ALLOWLIST-HIDES-HANDROLLED 且仍计数；B 族条目 ⇒ 放行但不消失',
        }
      }
    }

    caseFail(problems)
  })
})
