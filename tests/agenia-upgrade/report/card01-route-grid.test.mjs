/**
 * `CARD-01` · **路线格**（卡的第一行 / 未建账 / 「（目标未填）」+ 红条 / 暂停徽标）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）
 *   §2.3 末段（卡由现有日报卡生成器生成；三区 + 状态条 + 容量行）· §3.2（卡上的路线格：
 *   **第一行 = 目标 · 大阶段名**；**未建账 = 第一行只印「未建账」**；**headline 空 = 「（目标未填）」+ 红条**；
 *   **暂停 = 第二行徽标，不改第一行**；**切阶段会变**）· §6.2「路线格」那一行
 *   （**第一行只随 `stage-enter` 或 headline 补齐而变**）。
 *   契约：`.team/test/CONTRACT-C2.md` §3.1（五个现场 + 一条不变量）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格判七样（每一格都单独能翻面）：
 *   `A` 没有路线账本 ⇒ 第一行**逐字** `未建账`（不许带目标 / 阶段 / 间隔号）、`mode=uninitialized`。
 *   `B` 有账 + headline ⇒ 第一行**逐字**等于账上那一行、`mode=build`、没有徽标、没有红条。
 *   `C` headline **缺键** ⇒ `（目标未填）` + `red_bar:true` + `card.reasons` 里有 `HEADLINE_EMPTY`。
 *   `D` headline 是 `""` / 全空白 ⇒ 与 `C` 同形（`headlineOf` 的 `empty` 就是这两个形状）。
 *   `E` `pauses[]` 里有一条 `state:'open'` ⇒ `mode=build-paused`、**徽标非空且含「暂停」**、
 *       **第一行与 `B` 逐字相同**（暂停写进第一行就能被这一条抓住）。
 *   `F` 给账本加一条在途任务 ⇒ 第一行**逐字不变**（"第一行只随两件事变"的机械形态：
 *       两版账本只差 `tasks[]`，读出来的第一行必须同值）。
 *   `G` 账本**在盘上但读不出来** ⇒ 卡**照样出**（不许因为账本坏了就不出卡），
 *       第一行 `（目标未填）`、`red_bar:true`、`card.reasons` 里有 `ROUTE_UNREADABLE`。
 *
 * ── 现在为什么红 ─────────────────────────────────────────────────────────
 * `.tools/daily-cards.py` 今天**没有**路线格（第一页第一条是「报告日」，不是「目标 · 大阶段」），
 * 更没有 `C2 · 验收格` 那一页 ⇒ `C2-SHEET-MISSING` 一条，**不是 import 崩、也不是断言写歪**。
 * 这一格同时钉住那一条**已知的谎**：第一行不许从 `tasks[]` / `follow-ups.md` 推。
 */
import { before, test } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CARD_SHEET, DAY, NOW, assertReasonCodes, copyCardWithBodyPatch, hasRed, judgeRenderAgree,
  keysMissing, makeCardRoots, readCard, renderChecks, routeLedger, routeTask,
  scene, setClock, sheetMissing, writeDataRoot, writeMemorySource, writeRoute, runCards, cardFile,
} from '../support/card-surface.mjs'

before(() => {
  preflight()
})

/** 账上那一行（`headline` 的唯一载体；C1 §6.1：`stored = derived = 目标 · 当前大阶段名`）。 */
const GOAL = 'Agenia 持续改进'
const STAGE = '执行一 · 拆账并员通电'
const HEADLINE = `${GOAL} · ${STAGE}`
const UNFILLED = '（目标未填）'
const UNINITIALIZED = '未建账'

test('CARD-01 路线格：第一行 = 目标 · 大阶段 · 未建账只印那一行 · headline 空 ⇒ （目标未填）+ 红条 · 暂停在第二行 · 任务不改第一行', async () => {
  await runCase('CARD-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {}

    /**
     * 一个现场收尾：页不在 / key 不全 ⇒ 只报那一条（别让后面几十格一起红，把红因淹掉）。
     * 返回 `true` = 可以继续判这一格的值。
     */
    const usable = (label, s) => {
      readings[label] = {
        exit_code: s.run.exit_code,
        sheet_names: s.card.dump?.sheet_names ?? null,
        card: { exists: s.card.ok, error: s.card.error },
      }
      if (s.run.exit_code !== 0) {
        push('C2-GENERATOR-FAILED', `${label}：生成器 exit=${s.run.exit_code}（这一格值不了）—— stderr=${String(s.run.stderr).trim().slice(0, 300)}`)
        return false
      }
      if (sheetMissing(s.card, push, label)) return false
      if (keysMissing(s.card, push, label)) return false
      // 🔴 `card.reasons` 的闭集（`gate4-C2` F-05；契约 §5 末条）—— 每个现场都过一遍。
      assertReasonCodes(s.card.cells, push, label)
      // 🔴 正文 ↔ 机器格同值（契约 §2.2；`gate4-C2` F-08）—— 这一格只判「路线」那一对。
      const render = renderChecks(s.card, { only: ['route'] })
      const renderFailed = judgeRenderAgree(render, push, label)
      readings[label].render = {
        sheet: render.sheet,
        route_row: render.rows.route,
        pairs: render.pairs.length,
        failed: renderFailed,
      }
      readings[label].cells = {
        first_line: s.card.cells['route.first_line'],
        mode: s.card.cells['route.mode'],
        badge: s.card.cells['route.pause_badge'],
        red_bar: s.card.cells['route.red_bar'],
        red: s.card.cells['card.red'],
        reasons: s.card.cells['card.reasons'],
      }
      return true
    }
    const firstLineOf = (s) => s.card.cells['route.first_line']
    const modeOf = (s) => s.card.cells['route.mode']
    const badgeOf = (s) => s.card.cells['route.pause_badge']

    // ── A · 没有路线账本 ⇒ 只印「未建账」 ─────────────────────────────────
    const A = scene('CARD-01', 'no-route', {})
    if (!usable('A/未建账', A)) { caseFail(problems); return }
    if (firstLineOf(A) !== UNINITIALIZED) {
      push('C2-ROUTE-FIRSTLINE-UNINITIALIZED',
        `A（没有 \`.team/route/current.json\`）：第一行应当是逐字 ${JSON.stringify(UNINITIALIZED)}，实得 ${JSON.stringify(firstLineOf(A))} —— `
        + '定形 §3.2：「未建账 = 第一行只印「未建账」（目标取不到）」。不许带目标名 / 阶段名 / 间隔号')
    }
    if (modeOf(A) !== 'uninitialized') {
      push('C2-ROUTE-MODE', `A：\`route.mode\` 应当是 \`uninitialized\`（模式是**值**，不是缺席），实得 ${JSON.stringify(modeOf(A))}`)
    }
    if (badgeOf(A) !== null) {
      push('C2-ROUTE-BADGE', `A：未建账不可能暂停 ⇒ \`route.pause_badge\` 必须是 \`null\`，实得 ${JSON.stringify(badgeOf(A))}`)
    }
    if (A.card.cells['route.red_bar'] !== false) {
      push('C2-ROUTE-REDBAR', `A：未建账的红由状态条「未建账」那一格说（§4.2 #2），\`route.red_bar\` 必须是 \`false\`，实得 ${JSON.stringify(A.card.cells['route.red_bar'])}`)
    }
    if (!hasRed(A.card.cells, 'ROUTE_MISSING')) {
      push('C2-ROUTE-REASON-MISSING', `A：\`card.reasons\` 里没有 \`ROUTE_MISSING\`（实得 ${JSON.stringify(A.card.cells['card.reasons'])}）—— 红要能点名是哪一格红`)
    }

    // ── B · 有账 + headline ⇒ 第一行逐字等于账上那一行 ────────────────────
    const B = scene('CARD-01', 'legal', { route: routeLedger({ headline: HEADLINE }) })
    if (!usable('B/有账', B)) { caseFail(problems); return }
    if (firstLineOf(B) !== HEADLINE) {
      push('C2-ROUTE-FIRSTLINE',
        `B（有账、headline 在）：第一行应当是 ${JSON.stringify(HEADLINE)}（目标 · 大阶段名，账上那一条），`
        + `实得 ${JSON.stringify(firstLineOf(B))} —— 第一行**只读唯一载体** \`route.headline\`（C1 §6.1），`
        + '不许自己拼、不许从任务 / 票 / `follow-ups.md` 推')
    }
    if (modeOf(B) !== 'build') {
      push('C2-ROUTE-MODE', `B：阶段 \`kind:build\` 且没有 open 的暂停 ⇒ \`route.mode\` 应当 \`build\`，实得 ${JSON.stringify(modeOf(B))}`)
    }
    if (badgeOf(B) !== null) {
      push('C2-ROUTE-BADGE', `B：没有暂停 ⇒ \`route.pause_badge\` 必须是 \`null\`，实得 ${JSON.stringify(badgeOf(B))}`)
    }
    if (B.card.cells['route.red_bar'] !== false) {
      push('C2-ROUTE-REDBAR', `B：headline 有值 ⇒ \`route.red_bar\` 必须 \`false\`，实得 ${JSON.stringify(B.card.cells['route.red_bar'])}`)
    }
    if (hasRed(B.card.cells, 'HEADLINE_EMPTY')) {
      push('C2-ROUTE-REASON-MISSING', `B：headline 有值却报 \`HEADLINE_EMPTY\`（实得 ${JSON.stringify(B.card.cells['card.reasons'])}）`)
    }

    // ── B2 · 正文 ↔ 机器格（F-08）：阳性 + **只改正文一格的负样本** ─────────
    /**
     * 阳性：`B` 那五个现场的正文「目标 · 大阶段」行已经在上面的 `usable()` 里逐条判过
     * （同值 ⇒ 0 条 `C2-RENDER-DISAGREE`）。这里补**负样本**：
     * 把生成出来的那张卡**复制一份**、只把正文那一格改成别的串（机器格一个字不动），
     * 再喂同一只判据 —— 它必须红。不红 ⇒ 这条判据没有牙（`mig-rules-14`）。
     */
    {
      const routeRow = renderChecks(B.card, { only: ['route'] }).rows.route
      readings['B2/正文负样本'] = { row: routeRow, positive_failed: renderChecks(B.card, { only: ['route'] }).pairs.filter((p) => !p.ok).length }
      if (routeRow === null) {
        push('C2-RENDER-ROW-MISSING',
          'B：第一页找不到那条「路线」行（正文里没有 `目标 · 大阶段` 这种行）—— 契约 §2.2 要的第一对就是这个 '
          + '（老板读的是正文；正文那一行不在，"同值"就无从谈起）')
      } else {
        const patched = copyCardWithBodyPatch(cardFile(B.roots.ws, DAY), [
          { label: routeRow.label, value: '（改过的正文：不是账上那一条）' },
        ])
        readings['B2/正文负样本'].patched = { ok: patched.ok, file: patched.file, error: patched.error, patched: patched.patched }
        if (!patched.ok) {
          push('C2-RENDER-KNIFE-MISSED',
            `B2：造不出"正文与机器格各说各的"那张副本（${patched.error ?? '未知'}）—— 负样本没跑，`
            + '这一格"该红时真红"就没量到（记红，别当成绿）')
        } else {
          const badCard = readCard(patched.file)
          const badProblems = []
          const badPush = (code, message, detail) => badProblems.push(problem(code, message, detail))
          const flipped = renderChecks(badCard, { only: ['route'] })
          judgeRenderAgree(flipped, badPush, 'B2/负样本')
          readings['B2/正文负样本'].codes = badProblems.map((p) => p.code)
          readings['B2/正文负样本'].flipped_pairs = flipped.pairs.map((p) => ({ pair: p.pair, ok: p.ok }))
          if (!badProblems.some((p) => p.code === 'C2-RENDER-DISAGREE')) {
            push('C2-RENDER-KNIFE-MISSED',
              `B2：把正文那一格改成 ${JSON.stringify('（改过的正文：不是账上那一条）')}、机器格不动，判据却没有报 `
              + '`C2-RENDER-DISAGREE` —— 这条判据翻不了面，"正文与机器格同值"就还是散文（`mig-rules-14`）')
          }
          // 机器格那一页一个字没动（负样本改的**只有正文**）：不成立 ⇒ 负样本造歪了，读数不可信。
          if (flipped.pairs.some((p) => p.machine !== B.card.cells['route.first_line'])) {
            push('C2-RENDER-KNIFE-MISSED',
              'B2：副本的 `route.first_line` 机器格也变了 —— 负样本应当只改正文；这样造出来的红不能归给"正文印错"')
          }
        }
      }
    }

    // ── C · headline 缺键 ⇒ （目标未填）+ 红条 ───────────────────────────
    const C = scene('CARD-01', 'headline-missing', { route: routeLedger({ omitHeadline: true }) })
    if (!usable('C/headline缺键', C)) { caseFail(problems); return }
    if (firstLineOf(C) !== UNFILLED) {
      push('C2-ROUTE-FIRSTLINE-UNFILLED',
        `C（账在、\`headline\` **缺键**）：第一行应当是逐字 ${JSON.stringify(UNFILLED)}（全角括号、四个字），实得 ${JSON.stringify(firstLineOf(C))}`)
    }
    if (C.card.cells['route.red_bar'] !== true) {
      push('C2-ROUTE-REDBAR', `C：headline 空 ⇒ \`route.red_bar\` 必须 \`true\`（定形 §2.3 t0 第三行：+ 卡红），实得 ${JSON.stringify(C.card.cells['route.red_bar'])}`)
    }
    if (modeOf(C) !== 'build') {
      push('C2-ROUTE-MODE',
        `C：\`headline\` 空**不影响模式**（模式 = 阶段类型 + 暂停位，C1 §2.2）⇒ \`route.mode\` 必须仍是 \`build\`，`
        + `实得 ${JSON.stringify(modeOf(C))} —— 别把"目标未填"读成"未建账"`)
    }
    if (!hasRed(C.card.cells, 'HEADLINE_EMPTY')) {
      push('C2-ROUTE-REASON-MISSING', `C：\`card.reasons\` 里没有 \`HEADLINE_EMPTY\`（实得 ${JSON.stringify(C.card.cells['card.reasons'])}）`)
    }

    // ── D · headline = "" / 全空白 ⇒ 与 C 同形 ───────────────────────────
    for (const [tag, value] of [['empty-string', ''], ['spaces', '   ']]) {
      const D = scene('CARD-01', tag, { route: routeLedger({ headline: value }) })
      if (!usable(`D/${tag}`, D)) { caseFail(problems); return }
      if (firstLineOf(D) !== UNFILLED) {
        push('C2-ROUTE-FIRSTLINE-UNFILLED',
          `D（headline = ${JSON.stringify(value)}）：第一行应当是 ${JSON.stringify(UNFILLED)}，实得 ${JSON.stringify(firstLineOf(D))} —— `
          + '`headlineOf` 的 `empty` 只认"非空白字符串才算有"，`""` 与全空白都是空（C1 §6.1）')
      }
      if (D.card.cells['route.red_bar'] !== true) {
        push('C2-ROUTE-REDBAR', `D（headline = ${JSON.stringify(value)}）：\`route.red_bar\` 必须 \`true\`，实得 ${JSON.stringify(D.card.cells['route.red_bar'])}`)
      }
    }

    // ── E · 暂停 ⇒ 第二行徽标，第一行一字不动 ────────────────────────────
    const PAUSE = {
      pause_id: 'pause-20261102-01',
      state: 'open',
      opened_at: '2026-11-02T09:00:00+08:00',
      by: 'leader',
      reason: '一条够线的 bug 打断实现',
      entry_ids: ['bug-20261102-01'],
      line: 'data_broken',
      evidence: null,
      closed_at: null,
      closed_by: null,
    }
    const E = scene('CARD-01', 'paused', { route: routeLedger({ headline: HEADLINE, pauses: [PAUSE] }) })
    if (!usable('E/暂停', E)) { caseFail(problems); return }
    if (modeOf(E) !== 'build-paused') {
      push('C2-ROUTE-MODE', `E（有一条 \`state:'open'\` 的暂停）：\`route.mode\` 应当 \`build-paused\`，实得 ${JSON.stringify(modeOf(E))}`)
    }
    const badge = badgeOf(E)
    if (typeof badge !== 'string' || badge.trim() === '') {
      push('C2-ROUTE-BADGE', `E：暂停 ⇒ \`route.pause_badge\` 必须是非空字符串（第二行徽标），实得 ${JSON.stringify(badge)} —— 定形 §3.2：「暂停 = 第二行徽标」`)
    } else if (!badge.includes('暂停')) {
      push('C2-ROUTE-BADGE', `E：徽标里没有「暂停」两个字（实得 ${JSON.stringify(badge)}）—— 老板要一眼看出这个工作区停着`)
    }
    if (firstLineOf(E) !== HEADLINE) {
      push('C2-ROUTE-FIRSTLINE-PAUSE',
        `E：暂停**不改第一行**（定形 §3.2 原话）。第一行应当仍是 ${JSON.stringify(HEADLINE)}，实得 ${JSON.stringify(firstLineOf(E))}`)
    }

    // ── F · 加一条任务不改第一行（两版账本只差 tasks[]）───────────────────
    const F = scene('CARD-01', 'with-task', {
      route: routeLedger({
        headline: HEADLINE,
        tasks: [routeTask('task-20261102-01', 'in_progress', { title: '把卡改对（夹具）' })],
      }),
    })
    if (!usable('F/有任务', F)) { caseFail(problems); return }
    if (firstLineOf(F) !== firstLineOf(B)) {
      push('C2-FIRST-LINE-MOVED',
        `F：账本只多了一条在途任务，第一行却从 ${JSON.stringify(firstLineOf(B))} 变成了 ${JSON.stringify(firstLineOf(F))} —— `
        + '定形 §6.2：「第一行**只随** `stage-enter` 或 headline 补齐而变」。任务 / 票 / 模式都不许改它')
    }

    // ── G · 账本坏了 ⇒ 卡照样出，但第一行要说"未填"+ 红 ───────────────────
    {
      const roots = makeCardRoots('CARD-01', 'route-broken')
      writeMemorySource(roots.ws)
      writeDataRoot(roots.dr, { day: DAY, totals: { count: 73, chars: 4321 } })
      const broken = path.join(roots.ws, '.team', 'route', 'current.json')
      // 这一格是**手写坏账本**（不走 `writeRoute` —— 那一口只会写合法 JSON）：
      // `.team/route/` 在这里没人建过（`makeCardRoots` 只建到 `.team`），少了下面这一行
      // `writeFileSync` 会 ENOENT 在**块 G 之前**炸掉 —— 那是夹具红，不是被测对象的红。
      mkdirSync(path.dirname(broken), { recursive: true })
      writeFileSync(broken, '{ 这不是 JSON', 'utf8')
      const run = runCards(roots, { day: DAY, nowIso: NOW })
      const card = readCard(cardFile(roots.ws, DAY))
      readings['G/账本坏了'] = { exit_code: run.exit_code, ok: card.ok, error: card.error, sheet_names: card.dump?.sheet_names ?? null }
      if (run.exit_code !== 0) {
        push('C2-ROUTE-BROKEN-NO-CARD',
          `G（账本在盘上但不是 JSON）：生成器 exit=${run.exit_code}，一张卡都没出 —— 账本坏了老板更要知道，`
          + `卡不许因此不出（stderr=${String(run.stderr).trim().slice(0, 240)}）`)
      } else if (!sheetMissing(card, push, 'G/账本坏了') && !keysMissing(card, push, 'G/账本坏了')) {
        readings['G/账本坏了'].cells = card.cells['route.first_line']
        if (card.cells['route.first_line'] !== UNFILLED) {
          push('C2-ROUTE-FIRSTLINE-UNREADABLE',
            `G：账本读不出来时第一行应当是 ${JSON.stringify(UNFILLED)}，实得 ${JSON.stringify(card.cells['route.first_line'])} —— `
            + '"读不出来"不是"没有"（未建账），也不许猜一个目标名')
        }
        if (card.cells['route.red_bar'] !== true) {
          push('C2-ROUTE-REDBAR', `G：账本坏了 ⇒ \`route.red_bar\` 必须 \`true\`，实得 ${JSON.stringify(card.cells['route.red_bar'])}`)
        }
        if (!hasRed(card.cells, 'ROUTE_UNREADABLE')) {
          push('C2-ROUTE-REASON-MISSING', `G：\`card.reasons\` 里没有 \`ROUTE_UNREADABLE\`（实得 ${JSON.stringify(card.cells['card.reasons'])}）`)
        }
      }
    }

    rec.readings.card01 = readings
    rec.readings.sheet_name = CARD_SHEET
    rec.readings.clock = { now: NOW, via: setClock(A.roots, NOW).AGENIA_NOW_FILE }
    caseFail(problems)
  })
})
