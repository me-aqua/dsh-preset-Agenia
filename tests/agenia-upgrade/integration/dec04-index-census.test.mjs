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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import {
  CENSUS, CHECK, GOOD_CONCEPTS, GOOD_IMPLS, GOOD_INDEX, REAL_LEDGER, buildScene, codesOf, expectCodes,
  goodDecision0001, goodDecisionProduct0001, goodLedger, messagesOf, readText, runCensus, runCensusText,
  runCheck, runNode, sceneRoot, summarize, toolPresent, treeDigest,
} from '../support/decision-ledger.mjs'
import { COUNT_RULES } from '../../../.tools/lib/决议-ledger.mjs'
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

/**
 * `键序集合比` 那一行的判据（Y-M7a）：这一行的读数必须落在**判据侧**（`tests/`），
 * 因为构案 0004 ⑤ 写的是"判据侧的集合比 · 没有新增产品代码"。页上的数只能由那一行派生。
 * `concept` = census `--json` 里那个概念的条目；`indexRow` = `check --json` 里页上那一行（可缺）。
 */
function keyOrderRowProblems({ concept, indexRow }) {
  const out = []
  const push = (code, message) => out.push({ code, message })
  if (concept === undefined || concept === null) {
    push('KEYORDER-ROW-MISSING', 'census 的 concepts[] 里没有 `键序集合比` 这一行 —— 概念表里它必须在（构案 0004 的主题）')
    return out
  }
  if (concept.count !== 1) push('KEYORDER-COUNT', `\`键序集合比\` 的实现数必须是 1，实得 ${JSON.stringify(concept.count)}`)
  if (concept.unit !== '份代码文件') push('KEYORDER-UNIT', `\`键序集合比\` 的单位必须是 \`份代码文件\`，实得 ${JSON.stringify(concept.unit)}`)
  if (concept.rule !== 'file-code') push('KEYORDER-RULE', `\`键序集合比\` 的口径必须是 \`file-code\`，实得 ${JSON.stringify(concept.rule)}`)
  const impls = (concept.implementations ?? []).map((p) => String(p).replace(/\\/g, '/'))
  const outside = impls.filter((p) => !p.startsWith('tests/'))
  if (outside.length > 0) {
    push('KEYORDER-WRONG-SIDE', `\`键序集合比\` 的实现必须落在 \`tests/\`（判据侧），实得 ${JSON.stringify(outside)}`
      + ' —— 这一行数的是"判据里那把集合比的刀"，不是产品侧的键序规范化（构案 0004 ⑤：没有新增产品代码）')
  }
  const scan = (concept.scan ?? []).map((s) => String(s).replace(/\\/g, '/'))
  if (!scan.some((s) => s.startsWith('tests/'))) push('KEYORDER-SCAN', `\`键序集合比\` 的「扫描」必须盖住 \`tests/\`，实得 ${JSON.stringify(scan)}`)
  if (scan.some((s) => s.startsWith('presets/'))) push('KEYORDER-WRONG-SIDE', `\`键序集合比\` 的「扫描」里不许有 \`presets/\`（那会把它数回产品侧），实得 ${JSON.stringify(scan)}`)
  if (indexRow !== undefined && indexRow !== null) {
    if (indexRow.census !== 1) push('KEYORDER-INDEX', `INDEX 上 \`键序集合比\` 的 census 必须是 1，实得 ${JSON.stringify(indexRow.census)}`)
    if (indexRow.unit !== '份代码文件') push('KEYORDER-INDEX', `INDEX 上 \`键序集合比\` 的单位必须是 \`份代码文件\`，实得 ${JSON.stringify(indexRow.unit)}`)
  }
  return out
}

/** 页首那句「计数口径是闭集 N 个」的读数（Y-M7b）：token 与单位都由 `COUNT_RULES` 现算。 */
const LEGEND_TOKENS = Object.freeze([
  ['file', '份文件（含注释）'],
  ['file-code', '份代码文件'],
  ['site', '处（出现点）'],
  ['site-code', '处代码行'],
  ['零代码', '零代码决定'],
])
/**
 * 页首该印哪几对：**冻结的五对**（上表，手写期望）+ **按形状那一对**（只在口径落进 `COUNT_RULES` 之后出现）。
 *
 * 为什么按形状那一对从 `COUNT_RULES` 读标签、不手抄：M4 的口径是"单位只有一处来源"——
 * 页首那句本来就是从 `COUNT_RULES` 现算的；判据在这一对上判的是"页与口径同值"，不是"标签长什么样"
 * （标签本身另有约束：含「处」，见 `DEC-05` 腿 ⑧ 的 unit 那一格）。这样 Gate 3 加 token 时页与判据同批跟上，
 * 不会因为"判据先红"把加 token 变成两处改。
 */
function expectedLegendTokens() {
  const base = LEGEND_TOKENS.map(([t, u]) => [t, u])
  if (Object.hasOwn(COUNT_RULES, SHAPE_RULE)) base.push([SHAPE_RULE, COUNT_RULES[SHAPE_RULE].label])
  return base
}
function legendReading(text) {
  const line = String(text ?? '').split(/\r?\n/).find((l) => l.includes('计数口径是闭集')) ?? ''
  // 只从「闭集」那一句往后读：这一行开头还有一句 `census` = …（那是解释，不是闭集里的配对）。
  const tail = line.includes('闭集') ? line.slice(line.indexOf('闭集')) : ''
  const pairs = [...tail.matchAll(/`([^`]+)`\s*=\s*([^·。]+)/g)].map((m) => ({ token: m[1].trim(), unit: m[2].trim() }))
  const countMatch = /闭集\s*(\d+)\s*个/.exec(line)
  return { line, pairs, declared_count: countMatch === null ? null : Number(countMatch[1]) }
}
function legendProblems(reading, wantTokens = expectedLegendTokens()) {
  const out = []
  const push = (code, message) => out.push({ code, message })
  if (reading.line === '') {
    push('LEGEND-MISSING', 'INDEX 页首没有「计数口径是闭集 N 个…」那一句 —— 单位从哪来，读的人得自己猜')
    return out
  }
  const want = wantTokens.map(([t, u]) => `${t}=${u}`)
  const got = reading.pairs.map((p) => `${p.token}=${p.unit}`)
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    push('LEGEND-TOKENS', `页首闭集必须恰好是 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}`)
  }
  if (reading.declared_count !== wantTokens.length) {
    push('LEGEND-COUNT', `页首必须写「闭集 ${wantTokens.length} 个」，实得 ${JSON.stringify(reading.declared_count)}`)
  }
  return out
}

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
          // ── Y-M7a：`键序集合比` 那一行必须指回**判据侧**（构案 0004 ⑤：没有新增产品代码）────────
          {
            const concept = byConcept.get('键序集合比')
            const indexRow = rows.find((r) => r.concept === '键序集合比')
            rec.readings.real_key_order = { concept: concept ?? null, index_row: indexRow ?? null }
            for (const p of keyOrderRowProblems({ concept, indexRow })) push(p.code, `[真树] ${p.message}`)
          }
          // ── Y-M7b：页首那句闭集由 `COUNT_RULES` 现算（五个 token，含 `零代码`）──────────────────
          {
            const legend = legendReading(indexText)
            rec.readings.real_legend = { declared_count: legend.declared_count, pairs: legend.pairs, line_head: legend.line.slice(0, 120) }
            for (const p of legendProblems(legend)) push(p.code, `[真树] ${p.message}`)
          }
        }
      }
      if (before.digest !== after.digest) {
        push('CHECK-NOT-READONLY', `[真树] 跑完 census+check，决议/ 那棵树变了：${before.digest.slice(0, 16)} → ${after.digest.slice(0, 16)}`
          + `（契约 §5.4：检查器不许顺手修）`)
      }
    }

    // ── Y-M8：**解析面在哪** 这句话只许指向 `.tools/lib/决议-ledger.mjs`（三个载体同一句话）──────
    //    这是**指针**判据，不是行为判据：旧句（"全在 census.mjs 与 决议-check.mjs 里"）一回来就红。
    //    它不动工具、不碰 `决议/`；读的是测试岗自己那一份夹具头。
    {
      const harness = readText(path.join(PATHS.testRoot, 'support', 'decision-ledger.mjs')) ?? ''
      const OLD_POINTER = '全在 `.tools/census.mjs` 与 `.tools/决议-check.mjs` 里'
      const namesLib = harness.includes('.tools/lib/决议-ledger.mjs')
      const keepsOld = harness.includes(OLD_POINTER)
      rec.readings.parse_pointer = { names_lib: namesLib, keeps_old: keepsOld }
      if (!namesLib) {
        push('PARSE-POINTER', '`tests/.../support/decision-ledger.mjs` 的头没点名 `.tools/lib/决议-ledger.mjs` —— '
          + '解析面只有一份，三个载体（census / 决议-check / 测试夹具）都要说同一句话（Y-M8）')
      }
      if (keepsOld) {
        push('PARSE-POINTER', `\`tests/.../support/decision-ledger.mjs\` 里还留着旧指针 ${JSON.stringify(OLD_POINTER)} —— `
          + '那句话把解析面指到了 census/check 两个入口，而它们各只有一行 import（Y-M8）')
      }
    }

    // ── Y-M7a 的刀：把概念表那一行**指回产品侧**（旧探针 `canonicalJson` @ presets/）⇒ 同一条判据必须红 ──
    if (hasCensus) {
      const oldRow = buildScene({
        caseId: 'DEC-04', tag: 'keyorder-knife',
        concepts: [{ concept: '键序集合比', probe: 'canonicalJson', scan: 'presets/agenia/lib/*.mjs', owner: '实现岗', rule: 'file-code' }],
        impls: [{ rel: 'presets/agenia/lib/receipt.mjs', needle: 'canonicalJson' }],
        index: null,
      })
      const oldRun = runCensus(oldRow.root)
      const oldConcept = (oldRun.json?.concepts ?? []).find((c) => c.concept === '键序集合比') ?? null
      const oldProblems = keyOrderRowProblems({ concept: oldConcept })
      rec.readings.keyorder_knife = { exit: oldRun.exit, concept: oldConcept, codes: oldProblems.map((p) => p.code) }
      if (oldRun.exit !== 0 || oldConcept === null) {
        push('KEYORDER-KNIFE', `[刀] 旧行那一份夹具没造出来（exit=${oldRun.exit}）—— 刀没咬住`)
      } else if (!oldProblems.some((p) => p.code === 'KEYORDER-WRONG-SIDE')) {
        push('KEYORDER-KNIFE', `[刀] 把 \`键序集合比\` 指回产品侧（canonicalJson @ presets/）时，同一条判据没有报 \`KEYORDER-WRONG-SIDE\``
          + `（实得 ${JSON.stringify(oldProblems.map((p) => p.code))}）—— 那这条腿判不出"落在哪一侧"`)
      }
      // 阳性对照：同一把判据喂"按判据侧写"的那一份 ⇒ 不许有红。
      // ⚠️ 探针字面量**在源码里拼出来**：`键序集合比` 的扫描面是 `tests/**/*.mjs`，
      //    在测试源码里直接写那六个字母会把这个测试文件也算成"第二处实现"（census 按字面量数，
      //    注释不算、代码行算）。拼出来 = 这一格不改变它自己量的那个数。
      const SORTED_KEYS = ['sorted', 'Keys'].join('')
      const newRow = buildScene({
        caseId: 'DEC-04', tag: 'keyorder-control',
        concepts: [{ concept: '键序集合比', probe: SORTED_KEYS, scan: 'tests/**/*.mjs', owner: '实现岗', rule: 'file-code' }],
        impls: [{ rel: 'tests/unit/knife-control.test.mjs', needle: SORTED_KEYS }],
        index: null,
      })
      const newRun = runCensus(newRow.root)
      const newConcept = (newRun.json?.concepts ?? []).find((c) => c.concept === '键序集合比') ?? null
      const newProblems = keyOrderRowProblems({ concept: newConcept })
      rec.readings.keyorder_control = { exit: newRun.exit, concept: newConcept, codes: newProblems.map((p) => p.code) }
      if (newRun.exit !== 0 || newConcept === null || newProblems.length > 0) {
        push('KEYORDER-KNIFE', `[对照] 按判据侧写的那一份不许有红（实得 ${JSON.stringify(newProblems.map((p) => p.code))}）—— `
          + '否则这条腿只会红、翻不了面')
      }
    }

    // ── Y-M7b 的刀：副本里从 `COUNT_RULES` 删掉 `零代码` ⇒ 页首闭集少一项 ⇒ 同一条判据必须红 ──────────
    {
      const dir = sceneRoot('DEC-04', 'legend-knife')
      mkdirSync(path.join(dir, 'lib'), { recursive: true })
      const libSrc = readText(path.join(PATHS.repo, '.tools', 'lib', '决议-ledger.mjs')) ?? ''
      const ZERO_LINE = "  '零代码': { label: '零代码决定', kind: 'zero', comments: 'any' },"
      const hits = libSrc.split(ZERO_LINE).length - 1
      if (hits !== 1) {
        push('LEGEND-KNIFE-ANCHOR', `[刀] \`COUNT_RULES\` 里 \`零代码\` 那一行在源文件里出现 ${hits} 次（要恰好 1 次）—— 刀锚点不在`)
      } else {
        writeFileSync(path.join(dir, 'lib', '决议-ledger.mjs'), libSrc.replace(`${ZERO_LINE}\n`, ''), 'utf8')
        const probe = path.join(dir, 'probe.mjs')
        writeFileSync(probe, [
          "import { renderIndex, COUNT_RULES } from './lib/决议-ledger.mjs'",
          "const rows = [{ concept: 'x', owner: 'y', census: 0, decision: '0001', unit: '零代码决定' }]",
          'console.log(JSON.stringify({ keys: Object.keys(COUNT_RULES), index: renderIndex(rows) }))',
          '',
        ].join('\n'), 'utf8')
        const run = summarize(runNode([probe]), 'DEC-04/legend-knife')
        const keys = run.json?.keys ?? []
        const knifeLegend = legendReading(run.json?.index ?? '')
        const knifeProblems = legendProblems(knifeLegend)
        /** 副本里应当是"当前闭集 − 零代码"（口径落几个 token，这一格就跟几个）。 */
        const wantKeys = Object.keys(COUNT_RULES).filter((k) => k !== '零代码').sort()
        rec.readings.legend_knife = { exit: run.exit, keys, want_keys: wantKeys, pairs: knifeLegend.pairs, declared_count: knifeLegend.declared_count, codes: knifeProblems.map((p) => p.code) }
        if (run.exit !== 0 || run.json === null) {
          push('LEGEND-KNIFE', `[刀] 副本探针没跑出 JSON（exit=${run.exit} · ${run.json_error ?? ''}）`)
        } else if (keys.includes('零代码') || JSON.stringify([...keys].sort()) !== JSON.stringify(wantKeys)) {
          push('LEGEND-KNIFE', `[刀] 副本里 \`COUNT_RULES\` 的键必须是"当前闭集 − 零代码" ${JSON.stringify(wantKeys)}（删掉那一行之后），实得 ${JSON.stringify(keys)}`)
        } else if (!knifeProblems.some((p) => p.code === 'LEGEND-TOKENS')) {
          push('LEGEND-KNIFE', `[刀] 删掉 \`零代码\` 之后，同一条判据没有报 \`LEGEND-TOKENS\`（实得 ${JSON.stringify(knifeProblems.map((p) => p.code))}）`
            + ' —— 那"页首闭集逐条都从 COUNT_RULES 来"这句话没有被判到')
        }
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
                + '所以它的面必须是**全库代码面**：只写 `presets/**` 时那个 0 只是"presets 里的 0"（今天 `.tools/` 还活着 3 处，其中一处就住在印出这个 0 的工具里）')
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
          wantCodes: ['SHAPE-ALLOWLIST-HIDES-HANDROLLED'],
        })
        check('allowlist-hides-a', r, (r.concept?.count === 1 ? [] : [problem('DEC05-SHAPE-SCENE-COUNT', `被 A 族点名的条目不许改变计数：count 必须是 1，实得 ${JSON.stringify(r.concept?.count)}`)]))
        r = shapeCase({
          tag: 'allowlist-stale',
          files: [F('clean.mjs', SHAPE_FIXTURES.renameOnly)],
          allowlist: [{ file: 'presets/agenia/lib/clean.mjs', line: 2, kind: 'non-atomic-rename', why: '整目录换名（但这一份文件里没有临时名）' }],
          wantCodes: ['SHAPE-ALLOWLIST-STALE'],
        })
        check('allowlist-stale', r, [])
        r = shapeCase({
          tag: 'allowlist-no-reason',
          files: [F('temp-rename.mjs', SHAPE_FIXTURES.tempRenameOnly)],
          allowlist: [{ file: 'presets/agenia/lib/temp-rename.mjs', line: bLine, kind: 'non-atomic-rename', why: '—' }],
          wantCodes: ['SHAPE-ALLOWLIST-SHAPE'],
        })
        check('allowlist-no-reason', r, [])
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
          before_conversion: 'count 3 · 三处全在 .tools：census.mjs:93 · mount-dashboard-profile.mjs:197 · 决议-check.mjs:605（A 族，写临时名那一行）',
          after_conversion: 'count 0 · scanned_files 57（presets 34 + .tools 23）· allowlist 3 条（三条 B 族）',
          knife: '留一处未接共享件 ⇒ DEC05-SHAPE-COUNT-ZERO 点名那一处；A 族条目被允许清单点名 ⇒ SHAPE-ALLOWLIST-HIDES-HANDROLLED 且仍计数；B 族条目 ⇒ 放行但不消失',
        }
      }
    }

    caseFail(problems)
  })
})
