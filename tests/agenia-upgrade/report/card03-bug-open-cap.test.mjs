/**
 * `CARD-03` · **bug 开放数** + **50/30**（两格读同一个查询）。
 *
 * 冻结依据：定形 §3.1 第 7 条（**bug open = `kind=bug` 且无 disposition**；条目 open（通用）是另一个词；
 *   **票 open 不在这个数里**；**observation 不计入**；50 条 bug open 或最老超过 **30 天（日历）** ⇒
 *   在卡上 bug 开放数区 + 预警 banner 提醒老板，**不自动动手**）· §2.3（account 的 `open` 三义分开）·
 *   §6.2「bug 开放数」那一行（**卡区与 50/30 格读同一个查询（不许各算）**；**0 也显示**；
 *   生成失败 ⇒ 会话红 + 日志）。
 *   契约：`.team/test/CONTRACT-C2.md` §3.3 / §3.4；口径来源 = `.team/test/CONTRACT-B.md` §5（唯一一份）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格判六样：
 *   `A` 口径：3 条 open bug + 1 条已处置 bug + 2 条 open observation ⇒ `bug.open = 3`
 *       （observation 不计、已处置的不计）。
 *   `B` **票不漏进来**：同一份台账 + 8 张票 ⇒ `bug.open` 一格不动。
 *   `C` **同一个查询**（定形 §6.2 原话）：`bug.open.source` **逐字等于** `cap.bug_open.source`，
 *       且 `bug.open === cap.bug_open`；外加上**第三个读者** —— `--op bug-read` 的
 *       `counts.bug_open` / `cap.bug_open` / `cap.red` 必须与卡上同值（不可用 ⇒ **HOLD**，不记绿）。
 *   `D` 50 边界：49 条不红 · 50 条红（`cap.reasons` 必须含 `count`）。
 *   `E` 30 边界：最老 30 天不红 · 31 天红（`cap.reasons` 必须含 `age`）；用**注入时钟**算。
 *   `F` **不自动动手**：卡生成前后 `ledger.json` 的 sha256 **一字不变**（封顶是读数 + 预警，不是动作）。
 *
 * ── 现在为什么红 ─────────────────────────────────────────────────────────
 * 卡上没有 bug 开放数区、也没有 50/30 格（生成器今天只印"票（账本里 ⬜ 的）"那一行，
 * 而那是**另一本账**）；`C2 · 验收格` 那一页整个不在 ⇒ `C2-SHEET-MISSING`。
 */
import { before, test } from 'node:test'
import { caseHold, caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CARD_SHEET, bugEntry, bugLedger, freshTicket, hasRed, keysMissing, opUnavailable, readBugOp,
  assertReasonCodes, routeLedger, runCards, scene, setClock, sha256Of, sheetMissing,
} from '../support/card-surface.mjs'
import path from 'node:path'

before(() => {
  preflight()
})

/** 注入时钟那一天（30/31 天都从它的前一天算起）。 */
const DAY = '2026-11-02'
/** 日历天：30 天前 = 10-03（不红）；31 天前 = 10-02（红）。 */
const AT_30 = '2026-10-03T09:00:00+08:00'
const AT_31 = '2026-10-02T09:00:00+08:00'

const bugs = (n, over = {}) => Array.from({ length: n }, (_, i) => bugEntry(`bug-20261102-${String(i + 1).padStart(2, '0')}`, over))
const disposed = (id) => bugEntry(id, { disposition: { value: 'adopted', reason: '已修', by: 'leader', at: '2026-11-02T09:30:00+08:00' } })
const observation = (id) => bugEntry(id, { kind: 'observation', phenomenon: `${id} 的质量 finding（夹具）` })

test('CARD-03 bug 开放数 + 50/30：kind=bug 且无 disposition · 票不漏 · 与 50/30 同值同源 · 49/50 · 30/31 · 封顶不动手', async () => {
  await runCase('CARD-03', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {}

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
      const c = s.card.cells
      readings[label].bug = {
        open: c['bug.open'], source: c['bug.open.source'],
        cap_bug_open: c['cap.bug_open'], cap_source: c['cap.bug_open.source'],
        oldest: c['cap.oldest_age_days'], cap_red: c['cap.red'], reasons: c['cap.reasons'],
      }
      return true
    }
    const sameQuery = (label, s) => {
      const c = s.card.cells
      if (c['bug.open.source'] !== c['cap.bug_open.source']) {
        push('C2-SAME-QUERY-SOURCE',
          `${label}：\`bug.open.source\` = ${JSON.stringify(c['bug.open.source'])} 与 \`cap.bug_open.source\` = `
          + `${JSON.stringify(c['cap.bug_open.source'])} 不是同一个串 —— 定形 §6.2：「卡区与 50/30 格读**同一个查询**（不许各算）」`)
      }
      if (c['bug.open'] !== c['cap.bug_open']) {
        push('C2-SAME-QUERY-VALUE',
          `${label}：同一个查询算出两个数（\`bug.open\` = ${JSON.stringify(c['bug.open'])} · `
          + `\`cap.bug_open\` = ${JSON.stringify(c['cap.bug_open'])}）—— 要么是两份实现，要么其中一格取错了源`)
      }
    }
    const capReasonHas = (label, s, needle) => {
      const reasons = Array.isArray(s.card.cells['cap.reasons']) ? s.card.cells['cap.reasons'] : []
      const hit = reasons.some((r) => JSON.stringify(r).includes(needle))
      if (!hit) {
        push('C2-CAP-REASON-SILENT',
          `${label}：50/30 红了，但 \`cap.reasons\` 里没有一条提到 \`${needle}\`（实得 ${JSON.stringify(reasons)}）—— `
          + '"红了却不说哪一条越界"读的人没法修（CONTRACT-B §5.3）')
      }
    }

    // ── A · 口径（observation / 已处置都不计）──────────────────────────────
    const ledgerA = bugLedger({ entries: [...bugs(3), disposed('bug-20261102-90'), observation('obs-20261102-01'), observation('obs-20261102-02')] })
    const A = scene('CARD-03', 'count', { route: routeLedger({ tickets: [] }), bug: ledgerA })
    if (!usable('A/口径', A)) { caseFail(problems); return }
    if (A.card.cells['bug.open'] !== 3) {
      push('C2-BUG-OPEN-COUNT',
        `A：台账里 3 条 open bug + 1 条已处置 bug + 2 条 open observation ⇒ \`bug.open\` 必须是 **3**，`
        + `实得 ${JSON.stringify(A.card.cells['bug.open'])} —— 定形 §3.1 第 7 条：`
        + '**observation 不计入**、**无 disposition 才算 open**（已处置的不算）')
    }
    sameQuery('A/口径', A)

    // ── B · 票不漏进来 ───────────────────────────────────────────────────
    const tickets8 = Array.from({ length: 8 }, (_, i) => freshTicket(`ticket-20261102-${String(i + 1).padStart(2, '0')}`))
    const B = scene('CARD-03', 'with-tickets', { route: routeLedger({ tickets: tickets8 }), bug: ledgerA })
    if (!usable('B/有票', B)) { caseFail(problems); return }
    if (B.card.cells['bug.open'] !== A.card.cells['bug.open']) {
      push('C2-BUG-COUNT-TICKET-LEAK',
        `B：票段从 0 张变成 8 张，\`bug.open\` 却从 ${JSON.stringify(A.card.cells['bug.open'])} 变成了 `
        + `${JSON.stringify(B.card.cells['bug.open'])} —— 定形 §3.1 第 7 条：「**票 open 不在这个数里**」`)
    }
    sameQuery('B/有票', B)

    /**
     * 🔴 **跨读者（`--op bug-read`）** —— F-03/F-04 的落点。
     *
     * 三件事必须同时成立：
     *   ① 这一腿用的是**该现场的同一个注入时钟**（`setClock(roots, nowIso)` 的那个 env）——
     *      不传它，`bug-read` 按**真实此刻**算年龄，卡按注入时钟算 ⇒ 同一份台账两个年龄（F-04 的现场）。
     *   ② 逐项比：`counts.bug_open` / `cap.bug_open` / `cap.red` / **`cap.oldest_age_days`** / **`cap.reasons`**。
     *   ③ 红的时候，原因串必须点出**实际量到的那个数**（天数 / 条数）与**契约的阈值**（> 30 天 / >= 50 条）。
     * 量不到（op 不在 / 拒了夹具）⇒ **HOLD**，不记绿。
     */
    const numbersIn = (value) => {
      const hits = String(value ?? '').match(/\d+/g) ?? []
      return [...new Set(hits.map((n) => Number(n)))]
    }
    const crossReader = (label, s, tag) => {
      const env = setClock(s.roots, s.nowIso)
      const res = readBugOp(s.roots.ws, `c2-card03-${tag}`, { env })
      const c = s.card.cells
      readings[label] = {
        exit_code: res?.exit_code ?? null,
        code: res?.json?.error?.code ?? null,
        counts: res?.json?.counts ?? null,
        cap: res?.json?.cap ?? null,
        stderr: String(res?.stderr ?? '').slice(0, 200),
        clock: { file: env.AGENIA_NOW_FILE, now: s.nowIso },
        card: {
          bug_open: c['bug.open'], cap_bug_open: c['cap.bug_open'],
          oldest: c['cap.oldest_age_days'], red: c['cap.red'], reasons: c['cap.reasons'],
        },
      }
      if (opUnavailable(res)) {
        caseHold(rec, 'C2-CROSS-READER-UNAVAILABLE',
          `\`--op bug-read\` 这一腿没量到（op 不在 / 被测面缺 / spawn 失败）—— ${label} 上"同一份台账两个读者同值"**判不了**，`
          + '不记绿。卡上那两格仍由 `C2-SAME-QUERY-*` 单独判。')
        return
      }
      if (res.exit_code !== 0) {
        caseHold(rec, 'C2-CROSS-READER-REFUSED',
          `\`--op bug-read\` 拒了夹具台账（${label} · exit=${res.exit_code} · code=${res?.json?.error?.code ?? '(无)'}）—— `
          + '这一腿记 HOLD（夹具形状与它期望的不一致时，跨读者同值这件事没量到），不记绿。'
          + `stderr=${String(res.stderr ?? '').trim().slice(0, 200)}`)
        return
      }
      const counts = res.json?.counts ?? {}
      const cap = res.json?.cap ?? {}
      if (counts.bug_open !== c['bug.open']) {
        push('C2-CROSS-READER-COUNT',
          `${label}：\`bug-read.counts.bug_open\` = ${JSON.stringify(counts.bug_open)}，卡上 \`bug.open\` = `
          + `${JSON.stringify(c['bug.open'])} —— 同一份台账两个读者不同值，说明卡自己又算了一遍（或读错了源）`)
      }
      if (cap.bug_open !== c['cap.bug_open']) {
        push('C2-CROSS-READER-CAP',
          `${label}：\`bug-read.cap.bug_open\` = ${JSON.stringify(cap.bug_open)}，卡上 \`cap.bug_open\` = ${JSON.stringify(c['cap.bug_open'])}`)
      }
      if (typeof cap.red === 'boolean' && cap.red !== c['cap.red']) {
        push('C2-CROSS-READER-CAP-RED',
          `${label}：\`bug-read.cap.red\` = ${JSON.stringify(cap.red)}，卡上 \`cap.red\` = ${JSON.stringify(c['cap.red'])}`)
      }
      // 🔴 F-04 的年龄那一半：没有这一条，卡的年龄可以是对的、跨读者那一腿按真实此刻算出 0，而判据照绿。
      if (cap.oldest_age_days !== c['cap.oldest_age_days']) {
        push('C2-CROSS-READER-CAP-AGE',
          `${label}：\`bug-read.cap.oldest_age_days\` = ${JSON.stringify(cap.oldest_age_days)}，卡上 = ${JSON.stringify(c['cap.oldest_age_days'])} —— `
          + `两边必须用**同一个注入时钟**（这一腿注入的是 ${s.nowIso}）算同一条日历天差；`
          + '差一天也是红：那不是"舍入"，是两条路读了两个时刻（契约 §3.4 末条）')
      }
      if (JSON.stringify(cap.reasons ?? null) !== JSON.stringify(c['cap.reasons'] ?? null)) {
        push('C2-CROSS-READER-CAP-REASONS',
          `${label}：\`bug-read.cap.reasons\` = ${JSON.stringify(cap.reasons)}，卡上 \`cap.reasons\` = ${JSON.stringify(c['cap.reasons'])} —— `
          + '红因串也是同一条事实的一部分（阈值与量到的数都长在里面）')
      }
      // ③ 原因串里的数与阈值：红了必须点出**实际量到的那个数**，且阈值是契约那两条（30 天 / 50 条）。
      const reasons = Array.isArray(c['cap.reasons']) ? c['cap.reasons'] : []
      const ageReason = reasons.find((r) => /age/i.test(String(r))) ?? null
      if (ageReason !== null) {
        const seen = numbersIn(ageReason)
        if (typeof c['cap.oldest_age_days'] === 'number' && !seen.includes(c['cap.oldest_age_days'])) {
          push('C2-CAP-AGE-VALUE',
            `${label}：年龄红因没点出实际量到的天数（\`cap.oldest_age_days\` = ${c['cap.oldest_age_days']}，`
            + `原因串里出现的数是 ${JSON.stringify(seen)}：${JSON.stringify(ageReason)}）`)
        }
        if (!seen.includes(30)) {
          push('C2-CAP-AGE-VALUE',
            `${label}：年龄红因里没有契约的阈值 30 天（原因串 ${JSON.stringify(ageReason)}）—— 契约 §3.4：\`> 30\`（日历天）才红`)
        }
      }
      const countReason = reasons.find((r) => /count/i.test(String(r))) ?? null
      if (countReason !== null) {
        const seen = numbersIn(countReason)
        if (typeof c['cap.bug_open'] === 'number' && !seen.includes(c['cap.bug_open'])) {
          push('C2-CAP-COUNT-VALUE',
            `${label}：条数红因没点出实际量到的条数（\`cap.bug_open\` = ${c['cap.bug_open']}，`
            + `原因串里出现的数是 ${JSON.stringify(seen)}：${JSON.stringify(countReason)}）`)
        }
        if (!seen.includes(50)) {
          push('C2-CAP-COUNT-VALUE',
            `${label}：条数红因里没有契约的阈值 50 条（原因串 ${JSON.stringify(countReason)}）—— 契约 §3.4：\`>= 50\` 才红`)
        }
      }
    }

    // ── C · 跨读者（`--op bug-read`）：第三个读者必须同值。不可用 ⇒ HOLD ──
    crossReader('C/bug-read', B, 'not-red')

    // ── D · 50 的两条边界 ────────────────────────────────────────────────
    const D49 = scene('CARD-03', 'cap-49', { route: routeLedger({ tickets: [] }), bug: bugLedger({ entries: bugs(49) }) })
    if (!usable('D/49条', D49)) { caseFail(problems); return }
    if (D49.card.cells['cap.red'] !== false) {
      push('C2-CAP-49-RED', `D（49 条 open bug）：\`cap.red\` 必须 \`false\`（阈值是 **达到 50**），实得 ${JSON.stringify(D49.card.cells['cap.red'])}`)
    }
    const D50 = scene('CARD-03', 'cap-50', { route: routeLedger({ tickets: [] }), bug: bugLedger({ entries: bugs(50) }) })
    if (!usable('D/50条', D50)) { caseFail(problems); return }
    if (D50.card.cells['cap.red'] !== true) {
      push('C2-CAP-50-GREEN',
        `D（50 条 open bug）：\`cap.red\` 必须 \`true\` —— 定形 §3.1 第 7 条写的是「50 条 bug open」，`
        + '第 50 条一进来就红（CONTRACT-B §5.2 的保守读法：`>= 50`），'
        + `实得 ${JSON.stringify(D50.card.cells['cap.red'])}`)
    } else {
      capReasonHas('D/50条', D50, 'count')
    }

    // ── E · 30 的两条边界（日历天，注入时钟）─────────────────────────────
    const E30 = scene('CARD-03', 'cap-30d', {
      route: routeLedger({ tickets: [] }),
      bug: bugLedger({ entries: [bugEntry('bug-20261102-77', { registered_at: AT_30 })] }),
    })
    if (!usable('E/30天', E30)) { caseFail(problems); return }
    if (E30.card.cells['cap.oldest_age_days'] !== 30) {
      push('C2-CAP-AGE-VALUE',
        `E：最老一条注册于 ${AT_30}、注入时钟 ${DAY} ⇒ \`cap.oldest_age_days\` 必须是 **30**（日历天），`
        + `实得 ${JSON.stringify(E30.card.cells['cap.oldest_age_days'])} —— 按毫秒 /86400000 取整会在这里翻面`)
    }
    if (E30.card.cells['cap.red'] !== false) {
      push('C2-CAP-30-RED', `E（最老 30 天）：\`cap.red\` 必须 \`false\`（"**超过** 30 天"才红），实得 ${JSON.stringify(E30.card.cells['cap.red'])}`)
    }
    const E31 = scene('CARD-03', 'cap-31d', {
      route: routeLedger({ tickets: [] }),
      bug: bugLedger({ entries: [bugEntry('bug-20261102-78', { registered_at: AT_31 })] }),
    })
    if (!usable('E/31天', E31)) { caseFail(problems); return }
    if (E31.card.cells['cap.oldest_age_days'] !== 31) {
      push('C2-CAP-AGE-VALUE', `E：最老一条注册于 ${AT_31} ⇒ \`cap.oldest_age_days\` 必须是 **31**，实得 ${JSON.stringify(E31.card.cells['cap.oldest_age_days'])}`)
    }
    if (E31.card.cells['cap.red'] !== true) {
      push('C2-CAP-31-GREEN', `E（最老 31 天）：\`cap.red\` 必须 \`true\`，实得 ${JSON.stringify(E31.card.cells['cap.red'])}`)
    } else {
      capReasonHas('E/31天', E31, 'age')
    }
    // 🔴 C2 · **红的那一格**上的跨读者（F-04 的现场：卡 1 天、bug-read 0 天就是这么来的）——
    // 年龄与阈值只有在"红"的时候才真的被读到，绿的现场（C）两边都是 0，谁也分不出来。
    crossReader('C2/bug-read-31d', E31, 'red-31d')

    // ── F · 封顶不动手：卡是只读的 ────────────────────────────────────────
    {
      // 同一个工作区、同一份台账：跑一张卡前后各量一次 `ledger.json` 的 sha256。
      const ledgerFile = path.join(B.roots.ws, '.team', 'bug', 'ledger.json')
      const before = sha256Of(ledgerFile)
      const again = runCards(B.roots, { day: B.day, nowIso: B.nowIso })
      const after = sha256Of(ledgerFile)
      readings['F/只读'] = { before, after, exit_code: again.exit_code }
      if (before !== after) {
        push('C2-CAP-TOUCHED',
          'F：生成卡之后 `ledger.json` 的 sha256 变了 —— 封顶是**读数 + 预警**，不是动作'
          + `（定形 §3.1 第 7 条：「不自动动手」）。before=${before} after=${after}`)
      }
    }

    rec.readings.card03 = readings
    rec.readings.sheet_name = CARD_SHEET
    caseFail(problems)
  })
})
