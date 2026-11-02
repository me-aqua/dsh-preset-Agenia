/**
 * `CARD-02` · **票区**（`open` / `in_progress` / `done` / `void` 四个数）。
 *
 * 冻结依据：定形 §2.3（`legacy` 票店 / 7 张迁移票 / 票 open = 票状态）· §3.4（**票状态 = 每次读任务算出来的
 *   投影**（不存值）：`open`（无任务）/ `in_progress`（任务进行）/ `done`（任务验收）/ `void`（**终态**：
 *   任务取消 / **组长关票 + 理由**）；**只有一条不变量：有 live task 的票不许 `void`**）·
 *   §6.2「票区」那一行（**四个数分列**；`void` 两个来源；**0 不是错**；**负样本：`void` 票 + 在途任务 ⇒ 红**）。
 *   契约：`.team/test/CONTRACT-C2.md` §3.2；投影口径 = `.team/test/CONTRACT-C1.md` §7.5 那张表（唯一一份）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格判六样：
 *   `A` **四数 + 总数来自投影**，不是 `.team/leader/follow-ups.md` —— 夹具里 `follow-ups.md` **故意写 9 张**
 *       （那是生成器今天数的东西：`daily-cards.py:226-236`），票段只有 8 张 ⇒ 卡上必须是 8 的组合。
 *       出现 9 / `open=9` ⇒ `C2-TICKETS-FROM-FOLLOWUPS`（**这一格直接钉住那条已知的谎**）。
 *   `B` **`legacy_status` 是投影**（迁移票不存 `status`）：7 张迁移票 5 open / 1 in_progress / 1 done。
 *   `B2` **`tickets.legacy` = 迁移票张数**（`legacy_status` 非空；今天 7）——**子集计数**：
 *       它不进四数、不加进 `total`；票段空 ⇒ `0`；`legacy <= total` 恒成立（组长 2026-11-02 裁定第 4 条）。
 *   `C` **在途任务把票顶成 `in_progress`**（一条 `ticket_id` 指向它的 `in_progress` 任务）——
 *       即使票上存着 `status:'open'`（存着的 `status` 不是权威，C1 §7.5）。
 *   `D` **0 不是错**：票段空 ⇒ 五个数都是**数** `0`（不是 `—` / `无` / 空串），`total = 0`。
 *   `E` **负样本（必须红）**：一张 `void` 的票 + 一条挂在它上面的在途任务 ⇒ `card.red:true`，且
 *       `card.reasons` 里有一条 `VOID_WITH_LIVE_TASK` **点名那张票**（"红了却不说哪一张" = 没红）。
 *
 * ── 现在为什么红 ─────────────────────────────────────────────────────────
 * 卡没有 `C2 · 验收格` 这一页；而且即使有，今天的票数来源是 `follow-ups.md`（夹具里 9 张）——
 * 两条红因分开报，读的人一眼看得出是"没做"还是"做了但数错了源"。
 */
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CARD_SHEET, assertReasonCodes, cardFile, copyCardWithBodyPatch, freshTicket, hasRed,
  judgeRenderAgree, keysMissing, legacyTicket, projectTickets, readCard, redDetails, renderChecks,
  routeLedger, routeTask, scene, sheetMissing,
} from '../support/card-surface.mjs'

before(() => {
  preflight()
})

/** 7 张迁移票的状态（与 `support/route-surface.mjs::LEGACY_TICKETS` 同一份事实：5 open / 1 in_progress / 1 done）。 */
const LEGACY_STATUS = [
  ['F-165', 'open'],
  ['F-166', 'open'],
  ['F-167', 'in_progress'],
  ['F-168', 'open'],
  ['F-169', 'open'],
  ['F-170', 'done'],
  ['F-171', 'open'],
]

const legacyTickets = () => LEGACY_STATUS.map(([id, st]) => legacyTicket(id, st))
/** 本票现场的 8 张：7 张迁移 + 1 张新票（`ticket-20261102-01`）。 */
const eightTickets = () => [...legacyTickets(), freshTicket('ticket-20261102-01')]
/**
 * 投影的期望值（**照 C1 §7.5 那张表手算**，不从实现反推）：
 *   7 张迁移票 ⇒ 5 `open` / 1 `in_progress` / 1 `done`（`legacy_status` 是它们的投影）
 *   + 1 张新票（没有任务、没有 `legacy_status`）⇒ 第 6 条 `open`（表第 6 格：缺省 `open`）
 *   ⇒ 合计 **open 6 · in_progress 1 · done 1 · void 0 · total 8**；
 *   其中**迁移票 7 张**（`tickets.legacy`）—— 子集计数，**不加进 total**。
 */
const WANT_8 = { open: 6, in_progress: 1, done: 1, void: 0, legacy: 7, total: 8 }

test('CARD-02 票区：四数来自路线票段投影（不是 follow-ups.md）· void 两个来源 · 0 不是错 · void+在途任务 ⇒ 红并点名', async () => {
  await runCase('CARD-02', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {}
    // 读数先挂上：早退时夹具自检那几行也还读得到。
    rec.readings.card02 = readings

    /**
     * 🔴 **夹具自检**（跑在第一个现场之前 ⇒ 功能没做时**也会**执行）：
     * 期望值不是手写的孤证 —— 与**第二实现** `projectTickets()` 对账（C1 §7.5 那张表）。
     * `tickets.legacy` 是**子集计数**：它必须等于"`legacy_status` 非空的张数"，
     * 且**不参与** `total`（`total` 仍等于票段张数）。
     */
    {
      const p = projectTickets(routeLedger({ tickets: eightTickets() }))
      readings.fixture_selfcheck = p
      for (const key of ['open', 'in_progress', 'done', 'void', 'legacy', 'total']) {
        if (p[key] !== WANT_8[key]) {
          push('C2-FIXTURE-SELFCHECK',
            `夹具自检：\`projectTickets()\` 给出 ${key}=${JSON.stringify(p[key])}，用例里的期望值写的是 ${JSON.stringify(WANT_8[key])} —— `
            + '两处对不上，红的原因会是"期望值写错了"，不是被测对象')
        }
      }
      if (p.total !== p.open + p.in_progress + p.done + p.void) {
        push('C2-FIXTURE-SELFCHECK', `夹具自检：\`total\`（${p.total}）≠ 四数之和 —— \`tickets.legacy\` 不许被加进总数（裁定第 4 条）`)
      }
    }

    const usable = (label, s) => {
      readings[label] = { exit_code: s.run.exit_code, sheet_names: s.card.dump?.sheet_names ?? null, error: s.card.error }
      if (s.run.exit_code !== 0) {
        push('C2-GENERATOR-FAILED', `${label}：生成器 exit=${s.run.exit_code} —— stderr=${String(s.run.stderr).trim().slice(0, 300)}`)
        return false
      }
      if (sheetMissing(s.card, push, label)) return false
      if (keysMissing(s.card, push, label)) return false
      // 🔴 `card.reasons` 的闭集（`gate4-C2` F-05；契约 §5 末条）。
      assertReasonCodes(s.card.cells, push, label)
      // 🔴 正文 ↔ 机器格同值（契约 §2.2；`gate4-C2` F-08）—— 这一格只判**票区**那一对。
      const render = renderChecks(s.card, { only: ['tickets'] })
      const renderFailed = judgeRenderAgree(render, push, label)
      readings[label].render = {
        sheet: render.sheet,
        ticket_row: render.rows.tickets,
        pairs: render.pairs.length,
        failed: renderFailed,
      }
      const c = s.card.cells
      readings[label].tickets = {
        open: c['tickets.open'], in_progress: c['tickets.in_progress'], done: c['tickets.done'],
        void: c['tickets.void'], legacy: c['tickets.legacy'], total: c['tickets.total'],
        red: c['card.red'], reasons: c['card.reasons'],
      }
      return true
    }
    const four = (s) => ({
      open: s.card.cells['tickets.open'],
      in_progress: s.card.cells['tickets.in_progress'],
      done: s.card.cells['tickets.done'],
      void: s.card.cells['tickets.void'],
    })
    const expectFour = (label, s, want) => {
      const got = four(s)
      for (const key of ['open', 'in_progress', 'done', 'void']) {
        if (got[key] !== want[key]) {
          push(`C2-TICKETS-${key.toUpperCase()}`,
            `${label}：\`tickets.${key}\` 应当是 ${want[key]}，实得 ${JSON.stringify(got[key])} —— `
            + '投影口径 = CONTRACT-C1 §7.5 那张表（`void` 优先 → 任务 → `legacy_status` → 缺省 `open`）')
        }
      }
      if (s.card.cells['tickets.total'] !== want.total) {
        push('C2-TICKETS-TOTAL',
          `${label}：\`tickets.total\` 应当是 ${want.total}（票段里实际有几张），实得 ${JSON.stringify(s.card.cells['tickets.total'])} —— `
          + '四数之和与总张数必须自洽（重一张 / 漏一张都在这里翻面）')
      }
      /**
       * 第五个数：`tickets.legacy`（组长 2026-11-02 裁定第 4 条）。
       * 它是**子集计数**（`legacy_status` 非空的张数），不进四数、**不加进 `total`**。
       * 两个方向都判：少算（0，迁移票没被数到）与多算（8，把 7 张加进总数）都能翻面。
       */
      if (want.legacy !== undefined) {
        const got = s.card.cells['tickets.legacy']
        if (got !== want.legacy) {
          push('C2-TICKETS-LEGACY',
            `${label}：\`tickets.legacy\` 应当是 ${want.legacy}（\`legacy_status\` 非空的张数 = 迁移票），实得 ${JSON.stringify(got)} —— `
            + '契约 §3.2：它是**子集计数**，不是第五个状态；把迁移票**再加一遍**到 `total` 就是同一张票数两遍')
        }
      }
    }
    /** 票区那五格必须都是**数**（`0` 与 `""` 是两件事）；`legacy` 不许超过 `total`。 */
    const expectNumbers = (label, s) => {
      const c = s.card.cells
      for (const key of ['open', 'in_progress', 'done', 'void', 'legacy', 'total']) {
        const value = c[`tickets.${key}`]
        if (typeof value !== 'number') {
          push('C2-TICKETS-NOT-NUMBER', `${label}：\`tickets.${key}\` 必须是数，实得 ${JSON.stringify(value)}（${typeof value}）—— 卡上的 0 与空串是两件事（契约 §2.1）`)
        }
      }
      if (typeof c['tickets.legacy'] === 'number' && typeof c['tickets.total'] === 'number' && c['tickets.legacy'] > c['tickets.total']) {
        push('C2-TICKETS-LEGACY', `${label}：\`tickets.legacy\`（${c['tickets.legacy']}）大于 \`tickets.total\`（${c['tickets.total']}）—— 迁移票是票的子集，不可能比票还多`)
      }
    }

    // ── A + B · 8 张：7 迁移 + 1 新票；`follow-ups.md` 里写着 9 张（谎）──
    const A = scene('CARD-02', 'eight', { route: routeLedger({ tickets: eightTickets() }), followUps: 9 })
    if (!usable('A/8张', A)) { caseFail(problems); return }
    expectFour('A/8张', A, WANT_8)
    const totalA = A.card.cells['tickets.total']
    if (totalA === 9 || four(A).open === 9) {
      push('C2-TICKETS-FROM-FOLLOWUPS',
        `A：票数像是从 \`.team/leader/follow-ups.md\` 数的（夹具里那张文件写着 **9** 张，票段只有 8 张）—— `
        + `实得 total=${JSON.stringify(totalA)} / open=${JSON.stringify(four(A).open)}。`
        + '定形 §2.3：**票店 = 路线票段（唯一真源）**；`follow-ups.md` 不是票的账（`daily-cards.py:226-236` 就是那条旧路）')
    }
    // 四数 + total + legacy 必须是**数**（`0` 与 `""` 是两件事）
    expectNumbers('A/8张', A)

    // ── C · 在途任务把票顶成 in_progress（存着的 `status` 不是权威）────────
    const C = scene('CARD-02', 'live-task', {
      route: routeLedger({
        tickets: eightTickets(),
        tasks: [routeTask('task-20261102-01', 'in_progress', { ticket_id: 'ticket-20261102-01' })],
      }),
    })
    if (!usable('C/在途任务', C)) { caseFail(problems); return }
    expectFour('C/在途任务', C, { open: 5, in_progress: 2, done: 1, void: 0, legacy: 7, total: 8 })

    // ── C2 · 任务 done ⇒ 票 done（投影跟任务走）────────────────────────────
    const C2 = scene('CARD-02', 'done-task', {
      route: routeLedger({
        tickets: eightTickets(),
        tasks: [routeTask('task-20261102-02', 'done', { ticket_id: 'ticket-20261102-01' })],
      }),
    })
    if (!usable('C2/任务done', C2)) { caseFail(problems); return }
    expectFour('C2/任务done', C2, { open: 5, in_progress: 1, done: 2, void: 0, legacy: 7, total: 8 })

    // ── D · 0 不是错 ─────────────────────────────────────────────────────
    const D = scene('CARD-02', 'no-tickets', { route: routeLedger({ tickets: [] }) })
    if (!usable('D/0张', D)) { caseFail(problems); return }
    expectFour('D/0张', D, { open: 0, in_progress: 0, done: 0, void: 0, legacy: 0, total: 0 })
    for (const [key, value] of Object.entries({ ...four(D), legacy: D.card.cells['tickets.legacy'] })) {
      if (value !== 0) {
        push('C2-TICKETS-ZERO', `D（票段空）：\`tickets.${key}\` 必须是数 \`0\`，实得 ${JSON.stringify(value)} —— 定形 §6.2：「0 不是错」`)
      }
    }

    // ── D2 · void 来自"组长关票"（控制写）──────────────────────────────
    const voided = freshTicket('ticket-20261102-09', {
      status: 'void',
      void_reason: '重复，已并入 F-167（夹具）',
      re_present: { at: '2026-11-02T09:30:00+08:00', by: 'leader' },
      closed_at: '2026-11-02T09:30:00+08:00',
    })
    const D2 = scene('CARD-02', 'void-control', {
      route: routeLedger({ tickets: [...eightTickets(), voided] }),
    })
    if (!usable('D2/关票', D2)) { caseFail(problems); return }
    expectFour('D2/关票', D2, { open: 6, in_progress: 1, done: 1, void: 1, legacy: 7, total: 9 })

    // ── E · 负样本：void 票 + 在途任务 ⇒ 红，并点名那张票 ─────────────────
    const illegal = freshTicket('ticket-20261102-10', {
      status: 'void',
      void_reason: '先斩后奏（夹具：这是**非法**状态）',
      re_present: { at: '2026-11-02T09:30:00+08:00', by: 'leader' },
    })
    const E = scene('CARD-02', 'void-with-live-task', {
      route: routeLedger({
        tickets: [...eightTickets(), illegal],
        tasks: [routeTask('task-20261102-03', 'in_progress', { ticket_id: 'ticket-20261102-10' })],
      }),
    })
    if (!usable('E/void+在途', E)) { caseFail(problems); return }
    if (E.card.cells['card.red'] !== true) {
      push('C2-VOID-LIVE-TASK-GREEN',
        `E：一张 \`void\` 的票上挂着一条在途任务 —— 这是 C1 §7.5 那条唯一不变量（「有 live task 的票不许 void」）`
        + `坏掉之后的样子 ⇒ 卡必须红（\`card.red:true\`），实得 ${JSON.stringify(E.card.cells['card.red'])}。`
        + '定形 §6.2「票区」原话：「**负样本：`void` 票 + 在途任务 ⇒ 红**（可构造）」')
    }
    if (!hasRed(E.card.cells, 'VOID_WITH_LIVE_TASK')) {
      push('C2-VOID-LIVE-TASK-REASON',
        `E：\`card.reasons\` 里没有 \`VOID_WITH_LIVE_TASK\`（实得 ${JSON.stringify(E.card.cells['card.reasons'])}）`)
    }
    const named = redDetails(E.card.cells, 'VOID_WITH_LIVE_TASK').join(' ')
    if (!named.includes('ticket-20261102-10')) {
      push('C2-VOID-LIVE-TASK-UNNAMED',
        `E：红因没点名是哪一张票（detail 实得 ${JSON.stringify(named)}）—— 红了却不说哪一张，读的人没法修（契约 §5 末条）`)
    }

    // ── 读数：投影的第二份实现（只用来把"期望值"变可复现，不当被测面）────
    readings.projection = {
      eight: projectTickets(routeLedger({ tickets: eightTickets() })),
      with_live_task: projectTickets(routeLedger({
        tickets: eightTickets(),
        tasks: [routeTask('task-20261102-01', 'in_progress', { ticket_id: 'ticket-20261102-01' })],
      })),
    }

    // ── F · 正文 ↔ 机器格（F-08）：**只改正文里一个数**的负样本必须红 ────────
    /**
     * 阳性：上面每个现场（A/C/C2/D/D2/E）的正文票区行都由 `usable()` 里那只判据判过
     * （六个数逐个以 `<名> <数>` 出现）。
     * 负样本：把 `A` 那张卡**复制一份**，只把正文票区行的 `open 6` 改成 `open 99`，
     * 机器格一个字不动 ⇒ 同一只判据必须报 `C2-RENDER-DISAGREE`。
     */
    {
      const rendered = renderChecks(A.card, { only: ['tickets'] })
      const row = rendered.rows.tickets
      readings['F/正文负样本'] = {
        row,
        positive_failed: rendered.pairs.filter((p) => !p.ok).length,
      }
      if (row === null) {
        push('C2-RENDER-ROW-MISSING',
          '正文里找不到票区那一行（含有四数 + 迁移票 + 合计的那一行）—— 契约 §2.2 要的第二对就是这个；'
          + '正文那一行不在，"同值"无从谈起')
      } else {
        const openValue = A.card.cells['tickets.open']
        const badText = String(row.value ?? '').replace(`open ${openValue}`, `open ${Number(openValue) + 99}`)
        if (badText === String(row.value ?? '')) {
          push('C2-RENDER-KNIFE-MISSED',
            `F：正文票区行里找不到 \`open ${openValue}\` 这个形状（行=${JSON.stringify(row.value)}）—— 负样本造不出来，这一格"该红时真红"没量到`)
        } else {
          const patched = copyCardWithBodyPatch(cardFile(A.roots.ws, A.day), [{ label: row.label, value: badText }])
          readings['F/正文负样本'].patched = { ok: patched.ok, file: patched.file, error: patched.error, value: badText }
          if (!patched.ok) {
            push('C2-RENDER-KNIFE-MISSED',
              `F：造不出"正文印错一个数"那张副本（${patched.error ?? '未知'}）—— 负样本没跑，记红不记绿`)
          } else {
            const badCard = readCard(patched.file)
            const badProblems = []
            const badPush = (code, message, detail) => badProblems.push(problem(code, message, detail))
            const flipped = renderChecks(badCard, { only: ['tickets'] })
            judgeRenderAgree(flipped, badPush, 'F/负样本')
            readings['F/正文负样本'].codes = badProblems.map((p) => p.code)
            readings['F/正文负样本'].failed_pairs = flipped.pairs.filter((p) => !p.ok).map((p) => p.pair)
            if (!badProblems.some((p) => p.code === 'C2-RENDER-DISAGREE')) {
              push('C2-RENDER-KNIFE-MISSED',
                'F：正文里 `open` 那个数被改成 +99、机器格不动，判据却没有报 `C2-RENDER-DISAGREE` —— '
                + '这条判据翻不了面，"正文与票区同值"就还是散文（`mig-rules-14`）')
            }
            if (JSON.stringify(badCard.cells['tickets.open']) !== JSON.stringify(openValue)) {
              push('C2-RENDER-KNIFE-MISSED',
                'F：副本的 `tickets.open` 机器格也变了 —— 负样本应当只改正文；这样造出来的红不能归给"正文印错"')
            }
          }
        }
      }
    }

    rec.readings.card02 = readings
    rec.readings.sheet_name = CARD_SHEET
    caseFail(problems)
  })
})
