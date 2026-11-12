/**
 * `DEC-04` / `DEC-05` —— **现状层那一页与它的数**：`INDEX` 与派生叶逐行对账（`DEC-04`）、
 * census 的计数口径（`DEC-05`）。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-构案.md`（§3 census · §4 INDEX · §5.1 判词 · §8.1 样本表）。
 *
 * 🔴 这一格最要紧的一句：**`INDEX` 不是账本**。判据不信页上那个数，它自己从 ① 概念表 ② 扫描 glob
 * 下的实现文件 ③ 决议头块 重算一遍（`census --json` + `check --json` 两份读数各自独立），
 * 再把两边对上。所以"改了实现、不重新生成"必须红 —— 那就是"页被信了"的反面证人。
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import {
  CENSUS, CHECK, GOOD_CONCEPTS, GOOD_IMPLS, GOOD_INDEX, REAL_LEDGER, buildScene, codesOf, expectCodes,
  goodDecision0001, goodDecisionProduct0001, goodLedger, messagesOf, readText, runCensus, runCensusText,
  runCheck, toolPresent, treeDigest,
} from '../support/decision-ledger.mjs'

before(() => {
  preflight()
})

/** 跑一份夹具并把读数收进 `rec.readings`。 */
function runSample(problems, rec, { caseId, tag, spec, extra = [], tool = 'check' }) {
  const scene = goodLedger({ caseId, tag, ...spec })
  const run = tool === 'check' ? runCheck(scene.root, extra) : runCensus(scene.root, extra)
  const entry = {
    root: scene.root,
    exit: run.exit,
    ok: run.json?.ok ?? null,
    codes: codesOf(run.json),
    messages: messagesOf(run.json).map((m) => m.slice(0, 200)),
    stdout_head: run.stdout_head,
    stderr_head: run.stderr_head,
  }
  rec.readings[tag] = entry
  return { scene, run, entry }
}

test('DEC-04 INDEX 与派生叶逐行对账：改页上一个数 ⇒ 红；改了实现不重新生成 ⇒ 红；重新生成 ⇒ 绿', async () => {
  await runCase('DEC-04', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const hasCensus = toolPresent(problems, CENSUS, '契约 §3.3 的 census')
    const hasCheck = toolPresent(problems, CHECK, '契约 §5.1 的检查器')
    const ledgerPresent = existsSync(REAL_LEDGER)

    // ── ① 真树：检查器绿 + 页与重算一致 + 跑完一个字节都不改 ─────────────────────
    if (!ledgerPresent) {
      push('TREE-MISSING', `${REAL_LEDGER} 不在盘上 —— 现状层那一页（决议/INDEX.md）与概念表都还没有被测对象`)
    } else if (hasCensus && hasCheck) {
      const before = treeDigest(REAL_LEDGER)
      const census = runCensus(PATHS.repo)
      const check = runCheck(PATHS.repo)
      const after = treeDigest(REAL_LEDGER)
      rec.readings.real = {
        before: before.digest, after: after.digest, files: before.files.length,
        census_exit: census.exit, check_exit: check.exit,
        census_codes: codesOf(census.json), check_codes: codesOf(check.json),
        index_rows: check.json?.index?.rows ?? null,
      }
      if (expectCodes(problems, check, [], push, { label: 'DEC-04/real-check' })) {
        if (!expectCodes(problems, census, [], push, { label: 'DEC-04/real-census' })) {
          // 读到 census 的红因就够了，不再往下判
        } else {
          // **独立重算**：页上的每一格都必须能在 census 的读数里找到同一个值。
          const rows = check.json.index?.rows ?? []
          const byConcept = new Map((census.json.concepts ?? []).map((c) => [c.concept, c]))
          if (rows.length !== byConcept.size) {
            push('INDEX-ROW-SET', `[真树] INDEX 有 ${rows.length} 行，概念表有 ${byConcept.size} 个概念 —— 行集必须一一对应`)
          }
          const live = new Map((check.json.decisions ?? [])
            .filter((d) => d.series === '构案' && d.status === '生效')
            .map((d) => [d.topic, d.id]))
          // 「单位」列（M4 / T4）：页上必须带着单位，而且与 census 里那个概念的 unit 同值。
          const indexText = readText(path.join(PATHS.repo, '决议', 'INDEX.md')) ?? ''
          const headerLine = indexText.split(/\r?\n/).find((l) => /^\|\s*概念\s*\|/.test(l.trim())) ?? ''
          rec.readings.real_index_header = headerLine
          if (!headerLine.includes('单位')) {
            push('INDEX-UNIT-MISSING', `[真树] INDEX 的表头里没有「单位」列（实得 ${JSON.stringify(headerLine)}）—— `
              + '概念表声明了计数口径，页上就必须印出单位（契约 §4.2 / M4）')
          }
          for (const row of rows) {
            const c = byConcept.get(row.concept)
            if (c === undefined) {
              push('INDEX-ROW-EXTRA', `[真树] INDEX 上有一行 \`${row.concept}\`，概念表里没有它 —— 页上多出来的一行就是手抄`)
              continue
            }
            if (row.census !== c.count) push('INDEX-ROW-MISMATCH', `[真树] \`${row.concept}\` 的 census：页上 ${JSON.stringify(row.census)}，重算 ${JSON.stringify(c.count)}`)
            if (row.owner !== c.owner) push('INDEX-ROW-MISMATCH', `[真树] \`${row.concept}\` 的归属：页上 ${JSON.stringify(row.owner)}，概念表 ${JSON.stringify(c.owner)}`)
            const derivedDecision = live.get(row.concept) ?? '—'
            if (row.decision !== derivedDecision) {
              push('INDEX-ROW-MISMATCH', `[真树] \`${row.concept}\` 的「构案」：页上 ${JSON.stringify(row.decision)}，生效构案派生 ${JSON.stringify(derivedDecision)}`)
            }
            const wantUnit = typeof c.unit === 'string' ? c.unit.trim() : ''
            if (wantUnit === '') {
              push('INDEX-UNIT-MISSING', `[真树] census 的 \`${row.concept}\` 没有单位（rule=${JSON.stringify(c.rule)}）—— 数不带单位就只是一个数`)
            } else if (typeof row.unit !== 'string' || row.unit.trim() === '') {
              push('INDEX-UNIT-MISSING', `[真树] INDEX 的 \`${row.concept}\` 这一行没有读出「单位」（页上 ${JSON.stringify(row.unit)}）`)
            } else if (row.unit.trim() !== wantUnit) {
              push('INDEX-UNIT-MISMATCH', `[真树] \`${row.concept}\` 的单位：页上 ${JSON.stringify(row.unit)}，概念表派生 ${JSON.stringify(wantUnit)}`)
            }
          }
        }
      }
      if (before.digest !== after.digest) {
        push('CHECK-NOT-READONLY', `[真树] 跑完 census+check，决议/ 那棵树变了：${before.digest.slice(0, 16)} → ${after.digest.slice(0, 16)}`
          + `（契约 §5.4：检查器不许顺手修）`)
      }
    }

    if (!(hasCensus && hasCheck)) {
      caseFail(problems)
      return
    }

    // ── ② 夹具：good 绿 ────────────────────────────────────────────────────────
    {
      const { run } = runSample(problems, rec, { caseId: 'DEC-04', tag: 'good', spec: {} })
      expectCodes(problems, run, [], push, { label: 'DEC-04/good' })
    }
    // ── ③ 刀：改页上一个数（别的都不动）⇒ 红，点名概念与那一列 ──────────────────
    {
      const rows = GOOD_INDEX.rows.map((r) => ({ ...r }))
      rows[0].census = 3
      const { run } = runSample(problems, rec, { caseId: 'DEC-04', tag: 'stale-count', spec: { index: { rows } } })
      if (expectCodes(problems, run, ['INDEX-ROW-MISMATCH'], push, { label: 'DEC-04/stale-count' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes(GOOD_CONCEPTS[0].concept) && msg.includes('census'))) {
          push('NOT-NAMED', `[DEC-04/stale-count] 报文要点名概念 \`${GOOD_CONCEPTS[0].concept}\` 与那一列 \`census\`，实得 ${JSON.stringify(msg.slice(0, 200))}`)
        }
      }
    }
    // ── ④ 刀：加一份实现、**不**重新生成 ⇒ 红（"页被信了"的反面证人）───────────────
    {
      const impls = [...GOOD_IMPLS, { rel: 'src/a3.mjs', needle: 'LEDGER_PROBE_A' }]
      const { run } = runSample(problems, rec, { caseId: 'DEC-04', tag: 'impl-added', spec: { impls } })
      if (expectCodes(problems, run, ['INDEX-ROW-MISMATCH'], push, { label: 'DEC-04/impl-added' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes(GOOD_CONCEPTS[0].concept) && /3/.test(msg) && /2/.test(msg))) {
          push('NOT-NAMED', `[DEC-04/impl-added] 报文要点名"派生 3 / 页上 2"，实得 ${JSON.stringify(msg.slice(0, 220))}`)
        }
      }
      // ── ⑤ 重新生成（`census --write-index`）⇒ 绿，且页上真的变成 3 ──────────────
      const scene = goodLedger({ caseId: 'DEC-04', tag: 'regenerated', impls })
      const write = runCensus(scene.root, ['--write-index'])
      rec.readings.regenerated_write = { exit: write.exit, ok: write.json?.ok ?? null, codes: codesOf(write.json) }
      const checkAfter = runCheck(scene.root)
      rec.readings.regenerated = { exit: checkAfter.exit, codes: codesOf(checkAfter.json), ok: checkAfter.json?.ok ?? null }
      if (expectCodes(problems, checkAfter, [], push, { label: 'DEC-04/regenerated' })) {
        const text = readText(path.join(scene.root, '决议', 'INDEX.md')) ?? ''
        const wantRow = `| ${GOOD_CONCEPTS[0].concept} | ${GOOD_CONCEPTS[0].owner} | 3 | 0001 |`
        if (!text.includes(wantRow)) {
          push('INDEX-NOT-REGENERATED', `[DEC-04/regenerated] \`census --write-index\` 之后 INDEX 里应当有这一行：${JSON.stringify(wantRow)}`)
        }
        if (!text.split(/\r?\n/).some((l) => l.includes('生成物') && l.includes('census.mjs'))) {
          push('INDEX-NOT-GENERATED', '[DEC-04/regenerated] 生成出来的 INDEX 第一行必须带生成标记（契约 §4.1）')
        }
      }
    }
    // ── ⑥ 标记行删掉 ⇒ 红（"这一页是生成的"必须自己说得出来）───────────────────
    {
      const { run } = runSample(problems, rec, { caseId: 'DEC-04', tag: 'not-generated', spec: { index: { rows: GOOD_INDEX.rows, marker: false } } })
      expectCodes(problems, run, ['INDEX-NOT-GENERATED'], push, { label: 'DEC-04/not-generated' })
    }
    // ── ⑦ 行集 / 次序 / `.team/` 第二份 INDEX ─────────────────────────────────
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-04', tag: 'missing-row',
        spec: { index: { rows: [GOOD_INDEX.rows[0]] } },
      })
      expectCodes(problems, run, ['INDEX-ROW-MISSING'], push, { label: 'DEC-04/missing-row' })
    }
    {
      const rows = [...GOOD_INDEX.rows.map((r) => ({ ...r })), { concept: '不存在的东西', owner: '组长', census: 0, decision: '—' }]
      const { run } = runSample(problems, rec, { caseId: 'DEC-04', tag: 'extra-row', spec: { index: { rows } } })
      expectCodes(problems, run, ['INDEX-ROW-EXTRA'], push, { label: 'DEC-04/extra-row' })
    }
    {
      const rows = [GOOD_INDEX.rows[1], GOOD_INDEX.rows[0]].map((r) => ({ ...r }))
      const { run } = runSample(problems, rec, { caseId: 'DEC-04', tag: 'order', spec: { index: { rows } } })
      expectCodes(problems, run, ['INDEX-ORDER'], push, { label: 'DEC-04/order' })
    }
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-04', tag: 'second-copy',
        spec: { extraFiles: [{ rel: '.team/INDEX.md', text: '# 构案录\n\n（第二份）\n' }] },
      })
      expectCodes(problems, run, ['INDEX-SECOND-COPY'], push, { label: 'DEC-04/second-copy' })
    }

    caseFail(problems)
  })
})

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
      note: '两处；若把 `决议/` 下的概念表也算进来会变成 3（自吞）',
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

    // ⑦ 真树那一腿：census 读得出、单位都在；**0 只许出现在声明了 `零代码` 的行上**
    {
      const run = runCensus(PATHS.repo)
      rec.readings.real = {
        exit: run.exit, ok: run.json?.ok ?? null, codes: codesOf(run.json),
        concepts: (run.json?.concepts ?? []).map((c) => ({ concept: c.concept, count: c.count, unit: c.unit, rule: c.rule })),
      }
      if (run.json === null) {
        push('TREE-MISSING', `[真树] census 在仓库根上读不出 JSON（${run.json_error}）—— \`决议/概念表.md\` 今天不在（Gate 3 建）`)
      } else if (!expectCodes(problems, run, [], push, { label: 'DEC-05/real' })) {
        // 红因已在码集里
      } else {
        const zero = rec.readings.real.concepts.filter((c) => c.count === 0 && c.rule !== '零代码')
        if (zero.length > 0) {
          push('CENSUS-REAL-ZERO', `[真树] 这些概念数出 0 处实现、而口径不是 \`零代码\`：${JSON.stringify(zero)} —— `
            + '探针要么写错、要么扫描范围没盖住。真树上 0 只有一种合法形状：这一行**声明**了 `零代码`（零代码决定）。')
        }
        const missingUnit = rec.readings.real.concepts.filter((c) => typeof c.unit !== 'string' || c.unit.trim() === '')
        if (missingUnit.length > 0) {
          push('CENSUS-UNIT', `[真树] 这些概念没有单位：${JSON.stringify(missingUnit.map((c) => c.concept))} —— 数不带单位就只是一个数`)
        }
      }
    }

    caseFail(problems)
  })
})
