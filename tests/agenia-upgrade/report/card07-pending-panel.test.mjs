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
 *      **且** B 列要有「不代表…」那半句（缺席 ≠ 真没有），**不许**印 `0 件`（那是替人编了一个"零"）。
 *   `D` **三句两两不同**：三态被合成一句 ⇒ 这一条单独红（复审给的正是这个输入）。
 *   `E` **刀（每次真跑）**：把**生产那一份**生成器复制到运行根，只对**副本**把那三条腿换成一句写死的
 *      「（今天 0 件）」—— 复审 §7 的原输入。刀后的三副夹具必须让 `A/B/C/D` **四条同时翻**；
 *      而**真源码**那一跑 0 项。刀不许把生成器弄崩（那只是"改坏了"，不是"翻面"）。
 *   `F` 生产 `.tools/daily-cards.py` 的 sha256 前后一致（这一格**不许**为了造红去改被测文件）。
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
  DAY, NOW, PENDING_SHEET, cardFile, copyGeneratorWithPatch, generatorScriptPath, makeCardRoots,
  runCards, sha256Of, sheetRows, writeDataRoot, writeMemorySource, writePending,
} from '../support/card-surface.mjs'

before(() => {
  preflight()
})

/** 夹具里的两行 —— 三列都写**能一眼认出来的**值：任何一列没接线都能当场看出来。 */
const FIXTURE_ROWS = Object.freeze([
  Object.freeze({ 事: '夹具·事·合并不合并', 为什么: '夹具·为什么·两条候选同源', 代价: '夹具·代价·并了要重判' }),
  Object.freeze({ 事: '夹具·事·要不要开票', 为什么: '夹具·为什么·影响下一步', 代价: '夹具·代价·—' }),
])

/** 数据行：`待你拍` 的版式 = r1 标题 / r2 空行 / r3 表头 / r4 起数据（版式随生成器变 ⇒ 这里也要跟着改）。 */
const dataRows = (rows) => (rows ?? []).slice(3).filter((r) => (r ?? []).some((c) => c !== null && String(c).trim() !== ''))
const rowCells = (row) => [0, 1, 2].map((i) => String(row?.[i] ?? '').trim())
const rowText = (row) => rowCells(row).join(' | ')
const anyText = (data) => data.map(rowText).join(' || ')
const isPlaceholder = (text) => text.includes('0 件') || text.includes('没有人登记')

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
  const data = dataRows(sheet.rows)
  if (state === 'rows') {
    if (data.length !== FIXTURE_ROWS.length) {
      out.push(problem('CARD07-ROWS-LOST',
        `CARD-07[A]：夹具里登记了 ${FIXTURE_ROWS.length} 行待拍，卡上数据行实得 ${data.length} 行（${JSON.stringify(data.map(rowText))}）`
        + ' —— 有行没印出来'))
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
    if (data.length !== 1) {
      out.push(problem('CARD07-EMPTY-NOT-REGISTERED',
        `CARD-07[B]：待你拍.json 是 ` + '`[]`' + `（组长登记了"没有要拍的事"），卡上数据行实得 ${data.length} 行 —— 应当是**恰好一行**那句登记语`))
      return out
    }
    const [a, b] = rowCells(data[0])
    const saysZero = a.includes('0 件') || b.includes('0 件')
    const saysRegistered = a.includes('登记') || b.includes('登记')
    const claimsAbsent = a.includes('不存在') || a.includes('没有人登记')
    if (!saysZero || !saysRegistered || claimsAbsent) {
      out.push(problem('CARD07-EMPTY-NOT-REGISTERED',
        `CARD-07[B]：\`[]\` 是"组长明确登记了没有要拍的事" ⇒ 那一行要说 \`0 件\` **且**说 \`登记\`，`
        + `**不许**说"不存在 / 没有人登记"；实得 ${JSON.stringify([a, b])}（0件=${saysZero} · 登记=${saysRegistered} · 缺登记=${claimsAbsent}）`))
    }
    return out
  }
  if (state === 'absent') {
    if (data.length !== 1) {
      out.push(problem('CARD07-ABSENT-AS-ZERO',
        `CARD-07[C]：待你拍.json **不在**，卡上数据行实得 ${data.length} 行 —— 应当是**恰好一行**那句"没有人登记"`))
      return out
    }
    const [a, b] = rowCells(data[0])
    const saysAbsent = a.includes('不存在') || a.includes('没有人登记')
    const namesFile = a.includes('待你拍.json') || b.includes('待你拍.json')
    const saysNotZero = !a.includes('0 件')
    const warns = b.includes('不代表')
    if (!saysAbsent || !namesFile || !saysNotZero || !warns) {
      out.push(problem('CARD07-ABSENT-AS-ZERO',
        'CARD-07[C]：文件**不在** ⇒ 那一行必须说"没有人登记 / 待你拍.json 不存在"，B 列要有「不代表…」'
        + `（缺席 ≠ 真没有），而且**不许**印 \`0 件\`；实得 ${JSON.stringify([a, b])}`
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
      readings.cases.push({ state: item.state, pending: item.pending, exit_code: scene.run.exit_code, stderr: String(scene.run.stderr ?? '').trim().slice(0, 400), data_rows: dataRows(scene.sheet.rows).map(rowCells) })
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
    const summaries = Object.fromEntries(scenes.map((s) => [s.state, s.sheet.rows === null ? null : anyText(dataRows(s.sheet.rows))]))
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
      const knifeSummaries = Object.fromEntries(knifeScenes.map((s) => [s.state, s.sheet.rows === null ? null : anyText(dataRows(s.sheet.rows))]))
      knifeCodes.push(...indistinctProblem(knifeSummaries))
      const got = knifeCodes.map((p) => p.code)
      const unique = [...new Set(got)].sort()
      const EXPECTED = ['CARD07-ABSENT-AS-ZERO', 'CARD07-EMPTY-NOT-REGISTERED', 'CARD07-PENDING-INDISTINCT', 'CARD07-ROWS-LOST'].sort()
      readings.knife.runs = knifeScenes.map((s) => ({
        state: s.state,
        exit_code: s.run.exit_code,
        stderr: String(s.run.stderr ?? '').trim().slice(0, 400),
        sheet_error: s.sheet.error,
        data_rows: dataRows(s.sheet.rows).map(rowCells),
        summary: anyText(dataRows(s.sheet.rows)),
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
