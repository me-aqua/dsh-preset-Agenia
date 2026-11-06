/**
 * `CARD-07` · **`待你拍` 三态**（长期票 `ticket-20261106-02` · 复审 §7-E5 · batch 6）。
 *
 * 复审的判词（逐字）：输出的**句子**对了（`daily-cards.py:1350-1357`），**没有任何测试读这一页**
 * （`card05` / `card06` 都不碰 `待你拍`）；把 `:1347-1357` 三条腿合成一句
 * `ws4.append(("（今天 0 件）", …))` ⇒ 全绿。**这一格就是把那句话变成一条判据。**
 *
 * ── 判的是什么（三副夹具，同一个生成器、同一套 `--workspace` 夹具）────────────────────
 *   `A` **有行**：`.team/leader/<day>/待你拍.json` 里两行 ⇒ 卡 1 的 `待你拍` 页必须**逐字**印出
 *      三列（事 / 为什么 / 代价），而且**不许**印成任何一句占位语（"0 件" / "没有人登记"）。
 *   `B` **文件在、`[]`**：组长**明确登记了**"没有要拍的事" ⇒ 必须是「今天 0 件 · 组长登记了」这一族
 *      （含 `0 件` **且** 含 `登记`），**不许**说 `不存在` / `没有人登记`（那是另一件事）。
 *   `C` **文件不在**：没有人登记 ⇒ 必须说 `不存在` / `没有人登记`（点名 `待你拍.json`）
 *      **且**要有「不代表…」那半句（缺席 ≠ 真没有），**不许**印 `0 件`（那是替人编了一个"零"）。
 *      ⚠️ 必备语与禁止语一律看**全部数据列**（A/B/C）：只扫 A 列时，错句子写进 B 列照样绿。
 *   `D` **三句两两不同**：三态被合成一句 ⇒ 这一条单独红（复审给的正是这个输入）。
 *   `E` **刀（每次真跑）**：把**生产那一份**生成器复制到运行根，只对**副本**把那三条腿换成一句写死的
 *      「（今天 0 件）」—— 复审 §7 的原输入。刀后的三副夹具必须让 `A/B/C/D` **四条同时翻**；
 *      而**真源码**那一跑 0 项。刀不许把生成器弄崩（那只是"改坏了"，不是"翻面"）。
 *   `F` 生产 `.tools/daily-cards.py` 的 sha256 前后一致（这一格**不许**为了造红去改被测文件）。
 *   `G` **B 列刀**（复审 batch6 §4.1）：把**错句子**塞进 **B 列** —— `[]` 那态塞「没有人登记」、
 *      文件不在那态塞「今天 0 件」。禁止语 / 必备语都按**全部数据列**判（与 `A` 那一支的 `anyText` 同宽），
 *      所以这两条必须各翻一次；只扫 A 列时这一跑 **0 条**（那把刀当场红：判据对这一形态是哑的）。
 *
 * ── 版式（复审 batch6 §4.3）────────────────────────────────────────────────────────
 * 数据**起始行**被钉住，数据区里**不许夹空行**（`CARD07-LAYOUT`）：表头行逐字 + 起始行不是空行 +
 * 起始行到最后一个非空行之间无空洞 —— 三件都在 `support/card-surface.mjs::PENDING_LAYOUT` /
 * `layoutData()` 里钉一次。原来"硬切行偏移再滤空行"会让**插入一个空行照样绿**。
 *
 * ── 行数：窗口只管洞，页数归整页（复审 batch6r2 §3①）──────────────────────────────
 * 版式窗口（`layoutData(..., { expected_rows })`）的右端是"这一批应有的行数" —— 窗口**外面**的行
 * 谁也看不见。所以"恰好 N 行"这一条必须**整页量**：`rawDataRows(sheet.rows).length` 从数据起始行
 * 切到页尾（不滤空行、不截窗口），再与 `expectedRowsOf(state)` 逐态比。
 * 原来三处都拿窗口切出来的 `data.length` 数 ⇒ 复制一条数据行仍然绿，而报文还写着「恰好一行」。
 * 正控 `I`：把第二条数据行**复制成第三行** ⇒ `CARD07-ROWS-LOST` 必须红。
 *
 * ── 词的否定 / 第 4 列（复审 batch6r2 §1① 的两条仍绿假态）────────────────────────────
 * `J` 「登记」的**否定形态**不许算"登记了"（「组长没有登记」比禁语「没有人登记」只少一个字；
 *    词表**一个不放宽**，只加一条否定形态）；`K` 表头 / 数据行在声明的列数之外出现非空格 ⇒ 版式红
 *    （原来表头是**前缀**比较、`rowCells` 只读 0..2 ⇒ 第 4 列既不红也不被扫）。
 *
 * ── 为什么读的是人读页 ────────────────────────────────────────────────────────────
 * `待你拍` 这一页**没有机器格**（`C2 · 验收格` 的 39 个 key 里没有它）。老板读的就是这一页，
 * 所以判据钉这一页：页名 `待你拍` 逐字、表头 `事 / 为什么 / 代价`、数据从第 4 行起。
 * 版式常量只在 `support/card-surface.mjs` 里出现一次（`PENDING_SHEET`）。
 */
import { before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  DAY, NOW, PENDING_LAYOUT, PENDING_SHEET, cardFile, copyGeneratorWithPatch, generatorScriptPath, layoutData,
  makeCardRoots, runCards, sha256Of, sheetRows, writeDataRoot, writeMemorySource, writePending,
} from '../support/card-surface.mjs'

before(() => {
  preflight()
})

/** 夹具里的两行 —— 三列都写**能一眼认出来的**值：任何一列没接线都能当场看出来。 */
const FIXTURE_ROWS = Object.freeze([
  Object.freeze({ 事: '夹具·事·合并不合并', 为什么: '夹具·为什么·两条候选同源', 代价: '夹具·代价·并了要重判' }),
  Object.freeze({ 事: '夹具·事·要不要开票', 为什么: '夹具·为什么·影响下一步', 代价: '夹具·代价·—' }),
])

/**
 * 版式诊断：`CARD07-LAYOUT`。版式不对 ⇒ 这一页的其它判据都不可信（行会错位），只报这一条。
 * 钉的三件事在 `support/card-surface.mjs::PENDING_LAYOUT` / `layoutData()` 里只写一次。
 * `expected_rows`：三态各有几行数据（有行 = 夹具行数；`[]` / 文件不在 = 恰好 1 行）。
 */
function layoutProblems(sheet, expected_rows) {
  const layout = layoutData(sheet.rows, PENDING_LAYOUT, { expected_rows })
  if (layout.ok) return { problems: [], data: layout.data }
  const where = `\`${PENDING_SHEET}\` 第 ${layout.row ?? '?'} 行`
  let detail = `版式不对（${layout.why}）`
  if (layout.why === 'header') {
    detail = `${where}必须是表头 ${JSON.stringify(layout.expect)}（列名与列序逐字），实得 ${JSON.stringify(layout.got)}`
  } else if (layout.why === 'no-data') {
    detail = `${where}起必须是数据行，但整页只有 ${layout.total_rows ?? 0} 行`
  } else if (layout.why === 'blank-start') {
    detail = `${where}是**数据起始行**，现在却是一个空行（在数据前插一个空行也要红）`
  } else if (layout.why === 'hole') {
    detail = `数据区里**不许夹空行**，第 ${(layout.rows ?? []).join(' · ')} 行是空行（版式 = 连续的数据区）`
  } else if (layout.why === 'header-extra') {
    detail = `${where}（表头）在 ${PENDING_LAYOUT.header.length} 列之后还有非空格 ${JSON.stringify(layout.extra ?? [])}`
      + ` —— 表头必须**恰好** ${PENDING_LAYOUT.header.length} 列：多出来的列没有任何判据读它，等于夹带`
  } else if (layout.why === 'row-extra') {
    const wide = (layout.rows ?? []).map((r) => `第 ${r.row} 行 ${JSON.stringify(r.extra)}`).join(' · ')
    detail = `数据区在 ${PENDING_LAYOUT.header.length} 列之外还有非空格：${wide}`
      + ' —— 多出来的列必须红（判据只读前三列；不红就等于那一列没人管）'
  }
  return {
    problems: [problem('CARD07-LAYOUT',
      `CARD-07：${detail} —— 版式钉在 \`support/card-surface.mjs::PENDING_LAYOUT\`；`
      + '版式钉的是「表头逐字 + 数据起始行非空 + 数据区无空洞 + 不多不少这几列」——'
      + '红了先分清是哪一边动了：**产品改了版式**（那就同批改版式常量）还是**页被写坏**'
      + '（多行 / 少行 / 插空行 / 多一列）；这一条只报"形状不对"，**不替人判**是哪一种')],
    data: [],
  }
}

/** 三态各自应当有几行数据：有行 = 夹具行数；`[]` / 文件不在 = 恰好一行登记语。 */
const expectedRowsOf = (state) => (state === 'rows' ? FIXTURE_ROWS.length : 1)

/**
 * 从**数据起始行**切到页尾：**不截窗口、不滤空行**（尾部空行由 `card-xlsx.py` 剪掉）。
 * 两个用途：① 证据里逐行印出来（空洞要能在读数里看见）；② **整页行数** = `.length`。
 *
 * 🔴 与 `layoutData()` 的分工（复审 batch6r2 §3①）：窗口只管"数据区里有没有洞"，**页数归整页** ——
 *    窗口右端 = `data_row + expected_rows - 1`，窗口外面多出来的行谁也看不见；而这一条要的是
 *    "这一页**恰好**印了这一批应有的行数"，少一行和多一行都是缺陷。
 */
const rawDataRows = (rows) => (Array.isArray(rows) ? rows.slice(PENDING_LAYOUT.data_row) : [])

const rowCells = (row) => [0, 1, 2].map((i) => String(row?.[i] ?? '').trim())
const rowText = (row) => rowCells(row).join(' | ')
const anyText = (data) => data.map(rowText).join(' || ')
const isPlaceholder = (text) => text.includes('0 件') || text.includes('没有人登记')
/**
 * 「登记」的**否定形态**（复审 batch6r2 §1①）：`saysRegistered = includes('登记')` 会把
 * 「（今天 0 件 · 组长**没有登记**）」判成"登记了" —— 它比禁语「没有人登记」只少一个字，不用动版面。
 *
 * 🔴 词表**一个不放宽**：这里只加"否定"这一条形态（否定词 + 至多 6 个非标点字符 + `登记`），
 *    不往必备语里加新词。产品那句「组长登记了「没有要拍的事」」里 `没有` 在 `登记` **之后**，不命中。
 */
const NEGATED_REGISTER = /(?:没有|没|未|尚未|未曾|不曾|无人|没人|无|非|不)[^，。；、,.;：:\n]{0,6}登记/

/**
 * 判一副夹具印出来的那一页。返回 `problem[]`；`rows === null`（页不在）单独一条。
 * 三态各一条码、合成一句再一条 —— 复审的输入（三条腿合成一句）会**恰好**翻这四条。
 */
function pendingProblems(state, sheet) {
  const out = []
  if (sheet.rows === null) {
    out.push(problem('CARD07-SHEET-MISSING',
      `CARD-07：卡 1 上没有 \`${PENDING_SHEET}\` 这一页（${sheet.error}；页名实得 ${JSON.stringify(sheet.sheet_names)}）—— `
      + '这一页是老板读"今天要拍什么"的地方，页不在就没得判'))
    return out
  }
  const shaped = layoutProblems(sheet, expectedRowsOf(state))
  if (shaped.problems.length > 0) return shaped.problems
  const data = shaped.data
  const pageRows = rawDataRows(sheet.rows)
  if (state === 'rows') {
    if (pageRows.length !== FIXTURE_ROWS.length) {
      out.push(problem('CARD07-ROWS-LOST',
        `CARD-07[A]：夹具里登记了 ${FIXTURE_ROWS.length} 行待拍，卡上**整页**数据行实得 ${pageRows.length} 行（${JSON.stringify(pageRows.map(rowText))}）`
        + ' —— 少了 = 有行没印出来；多了 = 多出来的行没人管（窗口只判洞，页数必须整页数）'))
      return out
    }
    for (const [i, want] of FIXTURE_ROWS.entries()) {
      const got = rowCells(data[i])
      const expect = [want['事'], want['为什么'], want['代价']]
      if (got.join(' | ') !== expect.join(' | ')) {
        out.push(problem('CARD07-ROWS-LOST',
          `CARD-07[A]：第 ${i + 1} 行必须是夹具逐字 ${JSON.stringify(expect)}（事 / 为什么 / 代价三列），实得 ${JSON.stringify(got)}`
          + ' —— 三列里有一列没接线，或者行被换成了占位语'))
      }
    }
    const text = anyText(data)
    if (isPlaceholder(text)) {
      out.push(problem('CARD07-ROWS-LOST',
        `CARD-07[A]：有 ${FIXTURE_ROWS.length} 行待拍，卡上却出现了占位语（${JSON.stringify(text)}）`
        + ' —— "有行"与"0 件 / 没有人登记"是两件事'))
    }
    return out
  }
  if (state === 'empty') {
    if (pageRows.length !== 1) {
      out.push(problem('CARD07-EMPTY-NOT-REGISTERED',
        `CARD-07[B]：待你拍.json 是 ` + '`[]`' + `（组长登记了"没有要拍的事"），卡上**整页**数据行实得 ${pageRows.length} 行 —— 应当是**恰好一行**那句登记语`))
      return out
    }
    // 🔴 扫**全部数据列**（A/B/C），与上面 `A` 那一支的 `anyText()` 同宽：只扫 A 列时，
    //    「没有人登记」写进 B 列照样绿（复审 batch6 §4.1）；那一形态由 B 列刀每次真跑证明。
    const text = rowText(data[0])
    const saysZero = text.includes('0 件')
    const saysRegistered = text.includes('登记')
    const negatedRegister = NEGATED_REGISTER.test(text)
    const claimsAbsent = text.includes('不存在') || text.includes('没有人登记')
    if (!saysZero || !saysRegistered || negatedRegister || claimsAbsent) {
      out.push(problem('CARD07-EMPTY-NOT-REGISTERED',
        `CARD-07[B]：\`[]\` 是"组长明确登记了没有要拍的事" ⇒ 那一行要说 \`0 件\` **且**说 \`登记\`（**肯定**形态），`
        + `**不许**（任何一列）说"不存在 / 没有人登记 / 没有登记"；实得 ${JSON.stringify(rowCells(data[0]))}`
        + `（0件=${saysZero} · 登记=${saysRegistered} · 否定登记=${negatedRegister} · 缺登记=${claimsAbsent}）`))
    }
    return out
  }
  if (state === 'absent') {
    if (pageRows.length !== 1) {
      out.push(problem('CARD07-ABSENT-AS-ZERO',
        `CARD-07[C]：待你拍.json **不在**，卡上**整页**数据行实得 ${pageRows.length} 行 —— 应当是**恰好一行**那句"没有人登记"`))
      return out
    }
    // 同上：**全部数据列**。只扫 A 列时，"今天 0 件"写进 B 列（且「不代表…」那半句还在）照样绿。
    const text = rowText(data[0])
    const saysAbsent = text.includes('不存在') || text.includes('没有人登记')
    const namesFile = text.includes('待你拍.json')
    const saysNotZero = !text.includes('0 件')
    const warns = text.includes('不代表')
    if (!saysAbsent || !namesFile || !saysNotZero || !warns) {
      out.push(problem('CARD07-ABSENT-AS-ZERO',
        'CARD-07[C]：文件**不在** ⇒ 那一行必须说"没有人登记 / 待你拍.json 不存在"，要有「不代表…」那半句'
        + `（缺席 ≠ 真没有），而且**不许**（任何一列）印 \`0 件\`；实得 ${JSON.stringify(rowCells(data[0]))}`
        + `（说缺席=${saysAbsent} · 点名文件=${namesFile} · 没有冒零=${saysNotZero} · 有反面话=${warns}）`))
    }
    return out
  }
  throw new Error(`CARD-07：未知 state=${state}`)
}

/** 三态合成一句 ⇒ `CARD07-PENDING-INDISTINCT`。页不在（`null`）时不判：那由 `CARD07-SHEET-MISSING` 说。 */
function indistinctProblem(summaries) {
  if (Object.values(summaries).some((s) => s === null)) return []
  const unique = new Set(Object.values(summaries))
  if (unique.size === Object.keys(summaries).length) return []
  return [problem('CARD07-PENDING-INDISTINCT',
    `CARD-07[D]：有行 / \`[]\` / 文件不在**必须印三句不同的话**，实得 ${unique.size} 种（${JSON.stringify(summaries)}）`
    + ' —— 三态糊成一句之后，这一格就永远绿了（复审 §7-E5 的原输入）')]
}

/** 一副夹具的"那一句"（三态可区分性用）。版式不成立 ⇒ `null`（由 `CARD07-LAYOUT` 说，不重复报）。 */
function sceneSummary(sheet, state) {
  if (sheet.rows === null) return null
  const layout = layoutData(sheet.rows, PENDING_LAYOUT, { expected_rows: expectedRowsOf(state) })
  return layout.ok ? anyText(layout.data) : null
}

/** 跑一副夹具 → 读回 `待你拍` 那一页。`script` 给刀后的副本；不给 = 生产那一份。 */
function pendingScene(tag, { pending, script = null, nowIso = NOW } = {}) {
  const roots = makeCardRoots('CARD-07', tag)
  writeMemorySource(roots.ws)
  writeDataRoot(roots.dr, { day: DAY })
  writePending(roots.ws, DAY, pending)
  const run = runCards(roots, { day: DAY, nowIso, script })
  const sheet = sheetRows(cardFile(roots.ws, DAY), PENDING_SHEET)
  return { tag, roots, run, sheet, card: cardFile(roots.ws, DAY), script }
}

/**
 * 一条新刀（`I` / `J` / `K`）的最小跑法：补丁只打**副本**，跑指定的那几副夹具，收每副翻出来的码。
 *
 * 🔴 返回里的 `runs[*]` 是**输入**的读数（`page_data_rows` / `header_cells` / `summary`）——
 *    "刀真的造出了那个输入吗"要能被读到，否则"翻了面"可能只是刀把生成器改成了另一个样子。
 * 🔴 `knife === null` ⇒ 刀没打上（`error` 说为什么）；调用方记"尺子坏了"，不许静默跳过。
 */
function probeKnife(tag, knifeDir, { why, marker, patch, states }) {
  let knife = null
  let error = null
  try {
    knife = copyGeneratorWithPatch(knifeDir, { why, marker, patch })
  } catch (err) {
    error = String(err?.message ?? err)
  }
  const runs = []
  const codes = []
  for (const state of states) {
    if (knife === null) break
    const pending = state === 'rows' ? FIXTURE_ROWS : (state === 'empty' ? [] : null)
    const scene = pendingScene(`pending-${tag}-${state}`, { pending, script: knife.script })
    const pageRows = rawDataRows(scene.sheet.rows)
    const problems = scene.run.exit_code === 0 ? pendingProblems(state, scene.sheet) : []
    if (scene.run.exit_code !== 0) codes.push('GENERATOR-FAILED')
    for (const p of problems) codes.push(p.code)
    runs.push({
      state,
      exit_code: scene.run.exit_code,
      stderr: String(scene.run.stderr ?? '').trim().slice(0, 400),
      sheet_error: scene.sheet.error,
      header_cells: (scene.sheet.rows?.[PENDING_LAYOUT.header_row] ?? []).map((c) => String(c ?? '').trim()).filter((s) => s !== ''),
      page_data_rows: pageRows.length,
      data_rows: pageRows.map(rowCells),
      summary: pageRows.map(rowText).join(' || '),
      codes: problems.map((p) => p.code),
    })
  }
  return { knife, error, runs, codes, unique: [...new Set(codes)].sort() }
}

/**
 * 一条新刀的判词：尺子坏了 / 副本没变 / 生成器崩了 / 输入没造出来 / 一条没翻 / 翻错面 —— 六种各一条码。
 * `expect` = **恰好**该翻的码（排序后逐项比）；`landed(runs)` = "刀真的造出了那个输入"。
 */
function judgeKnife(push, code, label, probe, expect, { productionSha, landed, landedHint, hint }) {
  const { knife, error, runs, unique } = probe
  if (knife === null) {
    push(code, `CARD-07[${label}]：刀没打上（${error}）—— 这一格的红因此不可核：判据可能只是"永远绿"`)
    return
  }
  if (knife.changed !== true || knife.production_sha256 !== productionSha) {
    push(code, `CARD-07[${label}]：刀后的副本与生产那一份逐字节相同、或者副本不是从这一份生产文件复制的`
      + `（changed=${knife.changed} · production_sha256=${knife.production_sha256} ≠ ${productionSha}）—— 刀没落地`)
    return
  }
  const broke = runs.filter((r) => r.exit_code !== 0)
  if (broke.length > 0) {
    push(code, `CARD-07[${label}]：刀后生成器 exit≠0（${broke.map((r) => `${r.state}=${r.exit_code}`).join(' · ')}）—— `
      + `刀把生成器弄崩了，那不是"翻面"（stderr=${JSON.stringify(broke[0].stderr)}）`)
    return
  }
  if (landed(runs) !== true) {
    push(code, `CARD-07[${label}]：刀**没造出目标输入**（${landedHint}；读数=${JSON.stringify(runs.map((r) => ({ state: r.state, page_data_rows: r.page_data_rows, header_cells: r.header_cells, summary: r.summary })))})`)
    return
  }
  if (unique.length === 0) {
    push(code, `CARD-07[${label}]：刀后**一条判据都没翻** —— ${hint}`)
    return
  }
  if (unique.join(',') !== expect.join(',')) {
    push(`${code}-VECTOR`, `CARD-07[${label}]：刀翻错了面 —— 期望恰好 ${JSON.stringify(expect)}，实得 ${JSON.stringify(unique)}（逐条：${JSON.stringify(probe.codes)}）`)
  }
}

/** 一副夹具的读数（证据里要能逐字看见卡上印了什么）。 */
test('CARD-07 待你拍三态：有行 / [] / 文件不在 必须印三句不同的话（刀 = 三条腿合成一句「今天 0 件」）', async () => {
  await runCase('CARD-07', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = { cases: [], knife: null }

    // ── 0. 生产那一份生成器在整格跑前跑后各量一次（这一格不许改被测文件）──────────────
    const productionFile = generatorScriptPath()
    const productionBefore = { file: productionFile, sha256: sha256Of(productionFile) }
    readings.production_before = productionBefore

    // ── 1. 三副夹具（同一套环境，只差 `.team/leader/<day>/待你拍.json`）──────────────
    const cases = [
      { state: 'rows', pending: FIXTURE_ROWS },
      { state: 'empty', pending: [] },
      { state: 'absent', pending: null },
    ]
    const scenes = []
    for (const item of cases) {
      const scene = pendingScene(`pending-${item.state}`, { pending: item.pending })
      scene.state = item.state
      scene.pendingTag = item.state
      scenes.push(scene)
      const layoutReading = scene.sheet.rows === null
        ? { ok: false, why: 'no-sheet' }
        : (() => { const l = layoutData(scene.sheet.rows, PENDING_LAYOUT, { expected_rows: expectedRowsOf(item.state) }); return { ok: l.ok, why: l.why ?? null } })()
      readings.cases.push({ state: item.state, pending: item.pending, layout: layoutReading, exit_code: scene.run.exit_code, stderr: String(scene.run.stderr ?? '').trim().slice(0, 400), data_rows: rawDataRows(scene.sheet.rows).map(rowCells) })
      if (scene.run.python?.ok === false) {
        caseHold(rec, 'CARD07-NO-PYTHON', `这一档要真跑 daily-cards.py，但找不到能 import openpyxl 的 python：${scene.run.python.note}`)
        readings.python = scene.run.python
        caseFail(problems)
        return
      }
      if (scene.run.exit_code !== 0) {
        push('CARD07-GENERATOR-FAILED',
          `CARD-07[${item.state}]：生成器 exit=${scene.run.exit_code} —— 卡没出（stderr=${JSON.stringify(String(scene.run.stderr ?? '').trim().slice(0, 400))}）`)
        continue
      }
      for (const p of pendingProblems(item.state, scene.sheet)) problems.push(p)
    }
    // 三态的可区分性：三副夹具都出了页才判（页都不在时三条 SHEET-MISSING 已经说清）
    const summaries = Object.fromEntries(scenes.map((s) => [s.state, sceneSummary(s.sheet, s.state)]))
    readings.summaries = summaries
    if (Object.values(summaries).every((s) => s !== null)) problems.push(...indistinctProblem(summaries))

    // ── 2. 刀：只改**副本**，把三条腿（`:1358-1368`）合成一句写死的「（今天 0 件）」──────
    //     锚点用**生产正文自己**的字节（`from`），不写死行号：函数挪了位置，锚点照样对得上；
    //     真的对不上时 `copyGeneratorWithPatch` 当场抛 ⇒ 这里记 `CARD07-PENDING-KNIFE`（尺子坏了）。
    const knifeDir = path.join(scenes[0].roots.runRoot, 'knife', 'card-07')
    const KNIFE_MARKER = 'KNIFE-PENDING-COLLAPSED'
    let knife = null
    let knifeError = null
    try {
      const src = readFileSync(productionFile, 'utf8')
      const start = src.indexOf('    if pending_rows:\n')
      const endAnchor = '"不代表今天没有要拍的事 —— 只代表组长没写这一页：%s" % pending_path, "—"))\n'
      const endAt = src.indexOf(endAnchor)
      if (start < 0 || endAt < 0 || endAt <= start) {
        throw new Error(`刀口找不到了（三条腿那一段不在：start=${start} · end=${endAt}）—— 生成器的正文变了，刀要跟着改`)
      }
      const from = src.slice(start, endAt + endAnchor.length)
      const to = `    ws4.append(("（今天 0 件）", "—", "—"))  # ${KNIFE_MARKER}\n`
      knife = copyGeneratorWithPatch(knifeDir, {
        why: 'CARD-07 三条腿合成一句',
        marker: KNIFE_MARKER,
        patch: [{ from, to, why: '三条腿 → 一句写死的（今天 0 件）（复审 §7-E5 的原输入）' }],
      })
    } catch (err) {
      knifeError = String(err?.message ?? err)
    }
    readings.knife = knife === null
      ? { error: knifeError }
      : {
          error: null,
          dir: knifeDir,
          script: knife.script,
          production: knife.production,
          applied: knife.applied,
          marker: knife.marker,
          changed: knife.changed,
          bytes: knife.bytes,
          production_bytes: knife.production_bytes,
          sha256: knife.sha256,
          production_sha256: knife.production_sha256,
        }

    if (knife === null) {
      push('CARD07-PENDING-KNIFE',
        `CARD-07[E]：刀没打上（${knifeError}）—— 这一格的红因此不可核：判据可能只是"永远绿"`)
    } else if (knife.changed !== true || knife.production_sha256 !== productionBefore.sha256) {
      push('CARD07-PENDING-KNIFE',
        `CARD-07[E]：刀后的副本与生产那一份逐字节相同、或者副本不是从这一份生产文件复制的`
        + `（changed=${knife.changed} · production_sha256=${knife.production_sha256} ≠ ${productionBefore.sha256}）—— 刀没落地`)
    } else {
      // 刀后的三副夹具：同一个待你拍.json、只换生成器
      const knifeScenes = []
      const knifeCodes = []
      for (const item of cases) {
        const scene = pendingScene(`pending-${item.state}-knife`, { pending: item.pending, script: knife.script })
        scene.state = item.state
        knifeScenes.push(scene)
        if (scene.run.exit_code !== 0) {
          push('CARD07-PENDING-KNIFE',
            `CARD-07[E]：刀后生成器 exit=${scene.run.exit_code}（${item.state}）—— 刀把生成器弄崩了，`
            + `那不是"翻面"（stderr=${JSON.stringify(String(scene.run.stderr ?? '').trim().slice(0, 400))}）`)
          continue
        }
        for (const p of pendingProblems(item.state, scene.sheet)) knifeCodes.push(p)
      }
      const knifeSummaries = Object.fromEntries(knifeScenes.map((s) => [s.state, sceneSummary(s.sheet, s.state)]))
      knifeCodes.push(...indistinctProblem(knifeSummaries))
      const got = knifeCodes.map((p) => p.code)
      const unique = [...new Set(got)].sort()
      const EXPECTED = ['CARD07-ABSENT-AS-ZERO', 'CARD07-EMPTY-NOT-REGISTERED', 'CARD07-PENDING-INDISTINCT', 'CARD07-ROWS-LOST'].sort()
      readings.knife.runs = knifeScenes.map((s) => ({
        state: s.state,
        exit_code: s.run.exit_code,
        stderr: String(s.run.stderr ?? '').trim().slice(0, 400),
        sheet_error: s.sheet.error,
        data_rows: rawDataRows(s.sheet.rows).map(rowCells),
        summary: sceneSummary(s.sheet, s.state),
      }))
      readings.knife.codes = got
      readings.knife.expected = EXPECTED
      if (unique.length === 0) {
        push('CARD07-PENDING-KNIFE',
          'CARD-07[E]：刀后**一条判据都没翻** —— 这一格是装饰（`mig-rules-14`：红不了的一条判据就是装饰）')
      } else if (unique.join(',') !== EXPECTED.join(',')) {
        push('CARD07-PENDING-KNIFE-VECTOR',
          `CARD-07[E]：刀翻错了面 —— 期望恰好 ${JSON.stringify(EXPECTED)}，实得 ${JSON.stringify(unique)}`
          + `（逐条：${JSON.stringify(got)}）`)
      }
    }

    // ── 2b. B 列刀：把**错句子**塞进 B 列（复审 batch6 §4.1）──────────────────────
    //      `[]` 那态的 B 列塞「没有人登记」、文件不在那态的 B 列塞「今天 0 件」——
    //      两条都是这一格必须抓到的假绿：**只扫 A 列时这一跑 0 条**（判据对这一形态是哑的）。
    const knifeBDir = path.join(scenes[0].roots.runRoot, 'knife', 'card-07-b')
    const KNIFE_B_MARKER = 'KNIFE-B-WRONG-COLUMN'
    const KNIFE_B_EXPECTED = ['CARD07-ABSENT-AS-ZERO', 'CARD07-EMPTY-NOT-REGISTERED'].sort()
    let knifeB = null
    let knifeBError = null
    try {
      knifeB = copyGeneratorWithPatch(knifeBDir, {
        why: 'CARD-07 错句子塞进 B 列',
        marker: KNIFE_B_MARKER,
        patch: [
          {
            from: '"两张卡按定好的形状交齐；明天那一批 %d 条候选自动开庭。" % len(pool)',
            to: '"🔴 没有人登记（KNIFE-B-WRONG-COLUMN：这一句被塞进了 B 列）"',
            why: '`[]` 那态：B 列写「没有人登记」（A 列照旧说 0 件 · 登记了）',
          },
          {
            from: '"不代表今天没有要拍的事 —— 只代表组长没写这一页：%s" % pending_path',
            to: '"今天 0 件 · 不代表今天没有要拍的事 —— 只代表组长没写这一页：%s" % pending_path',
            why: '文件不在那态：B 列**多带一句**「今天 0 件」（「不代表…」那半句仍在 —— 只替换 B 会被 `warns` 抓到，'
              + '复审 §4.1 的假绿形态是"错句子与必备句**同在** B 列"）',
          },
        ],
      })
    } catch (err) {
      knifeBError = String(err?.message ?? err)
    }
    readings.knife_b = knifeB === null
      ? { error: knifeBError }
      : {
          error: null,
          dir: knifeBDir,
          script: knifeB.script,
          applied: knifeB.applied,
          marker: knifeB.marker,
          changed: knifeB.changed,
          bytes: knifeB.bytes,
          sha256: knifeB.sha256,
          production_sha256: knifeB.production_sha256,
        }

    if (knifeB === null) {
      push('CARD07-PENDING-KNIFE-B',
        `CARD-07[G]：B 列刀没打上（${knifeBError}）—— 这一形态的红因此不可核（"错句子塞进 B 列"可能永远绿）`)
    } else if (knifeB.changed !== true || knifeB.production_sha256 !== productionBefore.sha256) {
      push('CARD07-PENDING-KNIFE-B',
        `CARD-07[G]：B 列刀后的副本与生产那一份逐字节相同、或者副本不是从这一份生产文件复制的`
        + `（changed=${knifeB.changed} · production_sha256=${knifeB.production_sha256} ≠ ${productionBefore.sha256}）—— 刀没落地`)
    } else {
      const knifeBScenes = []
      const knifeBCodes = []
      for (const item of cases) {
        const scene = pendingScene(`pending-${item.state}-knife-b`, { pending: item.pending, script: knifeB.script })
        scene.state = item.state
        knifeBScenes.push(scene)
        if (scene.run.exit_code !== 0) {
          push('CARD07-PENDING-KNIFE-B',
            `CARD-07[G]：B 列刀后生成器 exit=${scene.run.exit_code}（${item.state}）—— 刀把生成器弄崩了，`
            + `那不是"翻面"（stderr=${JSON.stringify(String(scene.run.stderr ?? '').trim().slice(0, 400))}）`)
          continue
        }
        for (const p of pendingProblems(item.state, scene.sheet)) knifeBCodes.push(p)
      }
      const knifeBSummaries = Object.fromEntries(knifeBScenes.map((s) => [s.state, sceneSummary(s.sheet, s.state)]))
      knifeBCodes.push(...indistinctProblem(knifeBSummaries))
      const got = knifeBCodes.map((p) => p.code)
      const unique = [...new Set(got)].sort()
      readings.knife_b.runs = knifeBScenes.map((s) => ({
        state: s.state,
        exit_code: s.run.exit_code,
        stderr: String(s.run.stderr ?? '').trim().slice(0, 400),
        sheet_error: s.sheet.error,
        data_rows: rawDataRows(s.sheet.rows).map(rowCells),
        summary: sceneSummary(s.sheet, s.state),
        codes: pendingProblems(s.state, s.sheet).map((p) => p.code),
      }))
      readings.knife_b.codes = got
      readings.knife_b.expected = KNIFE_B_EXPECTED
      if (unique.length === 0) {
        push('CARD07-PENDING-KNIFE-B',
          'CARD-07[G]：**错句子塞进 B 列，一条判据都没翻** —— 这一形态是假绿'
          + '（禁止语 / 必备语只扫了 A 列；复审 batch6 §4.1 的原缺陷）')
      } else if (unique.join(',') !== KNIFE_B_EXPECTED.join(',')) {
        push('CARD07-PENDING-KNIFE-B-VECTOR',
          `CARD-07[G]：B 列刀翻错了面 —— 期望恰好 ${JSON.stringify(KNIFE_B_EXPECTED)}，实得 ${JSON.stringify(unique)}`
          + `（逐条：${JSON.stringify(got)}）`)
      }
    }

    // ── 2c. 版式刀：在数据前插一行空行 / 在数据区里夹一行空行（复审 batch6 §4.3）──────────
    //      两把刀口合成一个副本：`[]` 那态在数据前插空行（`blank-start`）、有行那态在第一条
    //      数据后夹空行（`hole`）。空行是缺陷 —— 旧写法"切行偏移再滤空行"会把它藏起来。
    //      期望：翻 **恰好一条** `CARD07-LAYOUT`（`rows` 与 `empty` 各一条，`absent` 不响）。
    const layoutKnifeDir = path.join(scenes[0].roots.runRoot, 'knife', 'card-07-layout')
    const LAYOUT_KNIFE_MARKER = 'KNIFE-LAYOUT-ROW'
    const LAYOUT_EXPECTED = ['CARD07-LAYOUT']
    let layoutKnife = null
    let layoutKnifeError = null
    try {
      layoutKnife = copyGeneratorWithPatch(layoutKnifeDir, {
        why: 'CARD-07 版式空行',
        marker: LAYOUT_KNIFE_MARKER,
        patch: [
          {
            from: '        ws4.append(("（今天 0 件 · 组长登记了「没有要拍的事」）",\n',
            to: `        ws4.append(())  # ${LAYOUT_KNIFE_MARKER}（数据前的空行）\n`
              + '        ws4.append(("（今天 0 件 · 组长登记了「没有要拍的事」）",\n',
            why: '`[]` 那态：数据前多一个空行 ⇒ 数据起始行是空行（`blank-start`）',
          },
          {
            from: '        for r in pending_rows:\n            ws4.append((str(r.get("事", "")), str(r.get("为什么", "")), str(r.get("代价", ""))))\n',
            to: '        for _knife_i, r in enumerate(pending_rows):\n'
              + '            ws4.append((str(r.get("事", "")), str(r.get("为什么", "")), str(r.get("代价", ""))))\n'
              + `            if _knife_i == 0:\n                ws4.append(())  # ${LAYOUT_KNIFE_MARKER}（数据区里的空行）\n`,
            why: '有行那态：第一条数据后夹一个空行 ⇒ 数据区有洞（`hole`）',
          },
        ],
      })
    } catch (err) {
      layoutKnifeError = String(err?.message ?? err)
    }
    readings.layout_knife = layoutKnife === null
      ? { error: layoutKnifeError }
      : {
          error: null,
          dir: layoutKnifeDir,
          script: layoutKnife.script,
          applied: layoutKnife.applied,
          marker: layoutKnife.marker,
          changed: layoutKnife.changed,
          sha256: layoutKnife.sha256,
          production_sha256: layoutKnife.production_sha256,
        }

    if (layoutKnife === null) {
      push('CARD07-PENDING-KNIFE-LAYOUT',
        `CARD-07[H]：版式刀没打上（${layoutKnifeError}）—— "空行会红"这件事不可核`)
    } else if (layoutKnife.changed !== true || layoutKnife.production_sha256 !== productionBefore.sha256) {
      push('CARD07-PENDING-KNIFE-LAYOUT',
        `CARD-07[H]：版式刀后的副本与生产那一份逐字节相同、或者副本不是从这一份生产文件复制的`
        + `（changed=${layoutKnife.changed} · production_sha256=${layoutKnife.production_sha256} ≠ ${productionBefore.sha256}）—— 刀没落地`)
    } else {
      const layoutRuns = []
      const layoutCodes = []
      for (const item of cases) {
        const scene = pendingScene(`pending-${item.state}-knife-layout`, { pending: item.pending, script: layoutKnife.script })
        const layout = scene.sheet.rows === null ? null : layoutData(scene.sheet.rows, PENDING_LAYOUT, { expected_rows: expectedRowsOf(item.state) })
        layoutRuns.push({
          state: item.state,
          exit_code: scene.run.exit_code,
          stderr: String(scene.run.stderr ?? '').trim().slice(0, 400),
          layout: layout === null ? null : { ok: layout.ok, why: layout.why ?? null, row: layout.row ?? null, holes: layout.rows ?? null },
          data_rows: rawDataRows(scene.sheet.rows).map(rowCells),
        })
        if (scene.run.exit_code !== 0) {
          push('CARD07-PENDING-KNIFE-LAYOUT',
            `CARD-07[H]：版式刀后生成器 exit=${scene.run.exit_code}（${item.state}）—— 刀把生成器弄崩了，`
            + `那不是"翻面"（stderr=${JSON.stringify(String(scene.run.stderr ?? '').trim().slice(0, 400))}）`)
          continue
        }
        for (const p of pendingProblems(item.state, scene.sheet)) layoutCodes.push(p)
      }
      const got = layoutCodes.map((p) => p.code)
      const unique = [...new Set(got)].sort()
      readings.layout_knife.runs = layoutRuns
      readings.layout_knife.codes = got
      readings.layout_knife.expected = LAYOUT_EXPECTED
      if (unique.length === 0) {
        push('CARD07-PENDING-KNIFE-LAYOUT',
          'CARD-07[H]：版式刀后**一条判据都没翻** —— 插一个空行照样绿（复审 batch6 §4.3 的原缺陷）')
      } else if (unique.join(',') !== LAYOUT_EXPECTED.join(',')) {
        push('CARD07-PENDING-KNIFE-LAYOUT-VECTOR',
          `CARD-07[H]：版式刀翻错了面 —— 期望恰好 ${JSON.stringify(LAYOUT_EXPECTED)}，实得 ${JSON.stringify(unique)}`
          + `（逐条：${JSON.stringify(got)}）`)
      }
    }

    // ── 2d. 行数刀：把第二条数据行**复制成第三行**（复审 batch6r2 §3① 的正控）────────────
    //      "整页恰好 N 行"这一条如果只拿版式窗口切出来的行数来数，多出来的行落在窗口外 ⇒
    //      复制一条数据行**照样绿**。期望：`CARD07-ROWS-LOST` **恰好一条**（另两副夹具不动）。
    const dupKnife = probeKnife(
      'knife-dup',
      path.join(scenes[0].roots.runRoot, 'knife', 'card-07-dup'),
      {
        why: 'CARD-07 复制一条数据行',
        marker: 'KNIFE-DUP-ROW',
        states: ['rows', 'empty', 'absent'],
        patch: [{
          from: '        for r in pending_rows:\n            ws4.append((str(r.get("事", "")), str(r.get("为什么", "")), str(r.get("代价", ""))))\n',
          to: '        for _knife_i, r in enumerate(pending_rows):\n'
            + '            ws4.append((str(r.get("事", "")), str(r.get("为什么", "")), str(r.get("代价", ""))))\n'
            + '            if _knife_i == 1:\n'
            + '                ws4.append((str(r.get("事", "")), str(r.get("为什么", "")), str(r.get("代价", ""))))  # KNIFE-DUP-ROW\n',
          why: '第二条数据行印两次 ⇒ 整页 3 行（应当 2 行）',
        }],
      },
    )
    const DUP_EXPECTED = ['CARD07-ROWS-LOST']
    readings.knife_dup = {
      error: dupKnife.error,
      knife: dupKnife.knife,
      runs: dupKnife.runs,
      codes: dupKnife.codes,
      expected: DUP_EXPECTED,
    }
    judgeKnife(push, 'CARD07-PENDING-KNIFE-DUP', 'I', dupKnife, DUP_EXPECTED, {
      productionSha: productionBefore.sha256,
      landed: (rs) => rs.find((r) => r.state === 'rows')?.page_data_rows === FIXTURE_ROWS.length + 1,
      landedHint: `\`rows\` 那副应当印出 ${FIXTURE_ROWS.length + 1} 行数据`,
      hint: '整页多出来的那一行没人数（窗口只切 2 行）—— "页数归整页"这一条是假的（复审 batch6r2 §3① 的原缺陷）',
    })

    // ── 2e. 否定刀：`[]` 那态的 A 列改成「（今天 0 件 · 组长没有登记）」────────────────────
    //      它含 `0 件` + `登记`、不含禁语「不存在 / 没有人登记」⇒ 旧写法（`includes('登记')`）判绿。
    //      期望：`CARD07-EMPTY-NOT-REGISTERED` **恰好一条**（词表不放宽，只加"否定形态"）。
    const negKnife = probeKnife(
      'knife-neg',
      path.join(scenes[0].roots.runRoot, 'knife', 'card-07-neg'),
      {
        why: 'CARD-07 否定登记',
        marker: 'KNIFE-NEGATED-REGISTER',
        states: ['empty'],
        patch: [{
          from: '        ws4.append(("（今天 0 件 · 组长登记了「没有要拍的事」）",\n',
          to: '        ws4.append(("（今天 0 件 · 组长没有登记）",  # KNIFE-NEGATED-REGISTER\n',
          why: '`[]` 那态的 A 列改成否定句 —— 比禁语「没有人登记」只少一个字',
        }],
      },
    )
    const NEG_EXPECTED = ['CARD07-EMPTY-NOT-REGISTERED']
    readings.knife_neg = {
      error: negKnife.error,
      knife: negKnife.knife,
      runs: negKnife.runs,
      codes: negKnife.codes,
      expected: NEG_EXPECTED,
    }
    judgeKnife(push, 'CARD07-PENDING-KNIFE-NEG', 'J', negKnife, NEG_EXPECTED, {
      productionSha: productionBefore.sha256,
      landed: (rs) => String(rs[0]?.summary ?? '').includes('没有登记'),
      landedHint: '`[]` 那副的第一行里应当出现「没有登记」',
      hint: '「登记」的否定形态被当成了"登记了"（`includes(\'登记\')` 的边界；复审 batch6r2 §1①-1）',
    })

    // ── 2f. 多列刀：表头加第 4 列（`("事","为什么","代价","多出来的一列")`）──────────────────
    //      表头比较是**前缀**（`slice(0, header.length)`）、`rowCells` 只读 0..2 ⇒ 第 4 列既不红也不扫。
    //      期望：`CARD07-LAYOUT` **恰好一条**（版式一红就早退，别的判据不重复报）。
    const extraColKnife = probeKnife(
      'knife-extra-col',
      path.join(scenes[0].roots.runRoot, 'knife', 'card-07-extra-col'),
      {
        why: 'CARD-07 表头多一列',
        marker: 'KNIFE-EXTRA-COLUMN',
        states: ['rows'],
        patch: [{
          from: '    ws4.append(()); ws4.append(("事", "为什么", "代价")); head(ws4, 3)\n',
          to: '    ws4.append(()); ws4.append(("事", "为什么", "代价", "多出来的一列")); head(ws4, 3)  # KNIFE-EXTRA-COLUMN\n',
          why: '表头加第 4 列 ⇒ 前缀比较会把它切掉（旧写法既不红也不扫）',
        }],
      },
    )
    const EXTRA_COL_EXPECTED = ['CARD07-LAYOUT']
    readings.knife_extra_col = {
      error: extraColKnife.error,
      knife: extraColKnife.knife,
      runs: extraColKnife.runs,
      codes: extraColKnife.codes,
      expected: EXTRA_COL_EXPECTED,
    }
    judgeKnife(push, 'CARD07-PENDING-KNIFE-EXTRA-COL', 'K', extraColKnife, EXTRA_COL_EXPECTED, {
      productionSha: productionBefore.sha256,
      landed: (rs) => (rs[0]?.header_cells ?? []).length === PENDING_LAYOUT.header.length + 1,
      landedHint: `表头那行应当有 ${PENDING_LAYOUT.header.length + 1} 个非空格`,
      hint: '第 4 列既不红也不被扫（表头前缀比较 + `rowCells` 只读 0..2；复审 batch6r2 §1①-2）',
    })

    // ── 3. 生产那一份一个字节都不许动 ───────────────────────────────────────────
    const productionAfter = { file: productionFile, sha256: sha256Of(productionFile) }
    readings.production_after = productionAfter
    if (productionBefore.sha256 === null || productionBefore.sha256 !== productionAfter.sha256) {
      push('CARD07-PRODUCTION-TOUCHED',
        `CARD-07[F]：这一格跑前跑后 \`${productionFile}\` 的 sha256 不一致（${productionBefore.sha256} → ${productionAfter.sha256}）`
        + ' —— 被测文件被改了，这一跑的读数不算数')
    }

    rec.readings.card07 = readings
    caseFail(problems)
  })
})
