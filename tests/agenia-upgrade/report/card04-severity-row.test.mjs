/**
 * `CARD-04` · **严重度那一排**（三条线 + `unclassified` / 样本四个 / 判不了 ⇒ 卡红）。
 *
 * 冻结依据：定形 §4.2（**三条线**：数据/库坏了 · 产品功能坏了 = 一个用户可见功能失败 + 复现步骤 ·
 *   「读数说假话」只有掩盖前两条时才算；**三条线 + `unclassified` = 四个出口**（不是第五桶）；
 *   **样本四个**、组长**事故前预注册**；**第三线正 / 负只代表它自己的线，不给未采样线赋值**；
 *   **判不了 ⇒ 升级 + 卡红**（不是静默保留 open））· §3.1 第 3 条（`assessment:'unknown'` 是**另一个词**：
 *   保留 open、不升级）· §6.2「严重 bug 判定」那一行。
 *   契约：`.team/test/CONTRACT-C2.md` §3.5；口径来源 = `.team/test/CONTRACT-B.md` §7（唯一一份）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格判五样：
 *   `A` **四出口闭集**：`severity.lines` **恰好**四条且顺序 = 三条线 + `unclassified`。
 *   `B` **样本四个**：`severity.samples` 恰好四个且集合 = 正 / 负 / 第三线正 / 第三线负。
 *   `C` **只代表它自己的线**：`severity.calibrated.function_broken_repro === false`（没被采样），
 *       `data_broken` / `reading_lies` 是 `true`，`unclassified` **不出现在** `calibrated` 里。
 *   `D` **判不了 ⇒ 升级 + 卡红**（两向都量）：
 *       ① 那条 entry `escalated_at` 非空 ⇒ `severity.card_red:true` + `escalations` **点名**它；
 *       ② 同一条但 `escalated_at` 为 `null` ⇒ 卡**仍然要红**（`SEVERITY_CANNOT_UNESCALATED` + 点名）——
 *          "判不了不许静默"两个方向分开报。
 *   `E` **`assessment:'unknown'` 不是严重线的判不了**：它只让条目保留 open，**不**让卡因为"严重线判不了"而红。
 *
 * ── 现在为什么红 ─────────────────────────────────────────────────────────
 * 卡上没有严重度那一排（今天生成器只印技术评审的 findings 与票），`C2 · 验收格` 整页不在。
 */
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CARD_SHEET, DAY, SAMPLE_SET, SEVERITY_LINES, assertReasonCodes, bugEntry, bugLedger, hasRed,
  keysMissing, localState, redDetails, routeLedger, sampleIds, scene, sheetMissing, statOf,
} from '../support/card-surface.mjs'
import path from 'node:path'

before(() => {
  preflight()
})

const at = (hhmm) => `2026-11-02T${hhmm}:00+08:00`

/** 一条**升级过**的判不了（`severity_confidence:'cannot'` + `escalated_at`）。 */
const escalated = (id) => bugEntry(id, {
  phenomenon: `${id} 装不进四个出口（夹具）`,
  escalated_at: at('09:10'),
  card_red: true,
  assessment: { verdict: 'unknown', severity_line: 'unclassified', severity_confidence: 'cannot', by_role: 'test', at: at('09:00') },
})

/** 同一条，但**没人升级**（`escalated_at: null`）—— 账本已经坏成那个样子时，卡必须喊。 */
const notEscalated = (id) => bugEntry(id, {
  phenomenon: `${id} 判不了、也没升级（夹具：非法状态）`,
  escalated_at: null,
  card_red: false,
  assessment: { verdict: 'unknown', severity_line: 'unclassified', severity_confidence: 'cannot', by_role: 'test', at: at('09:00') },
})

/** bug 评估里的"判不了"（另一个词；不升级、不清零）。 */
const assessUnknown = (id) => bugEntry(id, {
  phenomenon: `${id} 真假判不了（bug 评估；夹具）`,
  escalated_at: null,
  assessment: { verdict: 'unknown', by_role: 'test', at: at('09:00') },
})

test('CARD-04 严重度那一排：四出口闭集 · 样本四个 · 只校准自己的线 · 判不了两向（升级 ⇒ 卡红 / 没升级 ⇒ 更要红）', async () => {
  await runCase('CARD-04', async (rec) => {
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
      readings[label].severity = {
        lines: c['severity.lines'], samples: c['severity.samples'], calibrated: c['severity.calibrated'],
        card_red: c['severity.card_red'], escalations: c['severity.escalations'], reasons: c['card.reasons'],
      }
      return true
    }

    // ── A/B/C · 出口、样本、校准（一条升级过的 entry 在场）────────────────
    const A = scene('CARD-04', 'escalated', {
      route: routeLedger({ tickets: [] }),
      bug: bugLedger({ entries: [escalated('bug-20261102-51')] }),
    })
    if (!usable('A/出口与样本', A)) { caseFail(problems); return }

    const lines = A.card.cells['severity.lines']
    if (!Array.isArray(lines) || JSON.stringify(lines) !== JSON.stringify(SEVERITY_LINES)) {
      push('C2-SEVERITY-LINES',
        `A：\`severity.lines\` 必须是**恰好四条**、顺序 = ${JSON.stringify(SEVERITY_LINES)}（三条线 + 第四个出口），`
        + `实得 ${JSON.stringify(lines)} —— 定形 §4.2：「三条线 + \`unclassified\` = 四个出口（不是第五桶）」`)
    }
    const samples = A.card.cells['severity.samples']
    const wantSamples = sampleIds()
    const gotSamples = Array.isArray(samples) ? [...samples].sort() : []
    if (JSON.stringify(gotSamples) !== JSON.stringify([...wantSamples].sort())) {
      push('C2-SEVERITY-SAMPLES',
        `A：\`severity.samples\` 必须是四个样本 ${JSON.stringify(wantSamples)}（正 / 负 / 第三线正 / 第三线负），`
        + `实得 ${JSON.stringify(samples)} —— 少一个 / 多一个 / 换成别的线都在这里翻面（定形 §4.2）`)
    }
    const calibrated = A.card.cells['severity.calibrated']
    if (calibrated === null || typeof calibrated !== 'object' || Array.isArray(calibrated)) {
      push('C2-SEVERITY-CALIBRATED',
        `A：\`severity.calibrated\` 必须是对象（\`{line: boolean}\`），实得 ${JSON.stringify(calibrated)}`)
    } else {
      if (calibrated.function_broken_repro !== false) {
        push('C2-SEVERITY-CALIBRATED',
          `A：\`function_broken_repro\` **没被采样** ⇒ \`calibrated\` 必须是 \`false\`，实得 ${JSON.stringify(calibrated.function_broken_repro)} —— `
          + '定形 §4.2：「第三线正 / 负**只代表它自己的线**，不给未采样线赋值」')
      }
      if (calibrated.data_broken !== true) {
        push('C2-SEVERITY-CALIBRATED', `A：\`data_broken\` 有正 / 负两个样本 ⇒ \`calibrated\` 必须是 \`true\`，实得 ${JSON.stringify(calibrated.data_broken)}`)
      }
      if (calibrated.reading_lies !== true) {
        push('C2-SEVERITY-CALIBRATED', `A：\`reading_lies\` 有正 / 负两个样本 ⇒ \`calibrated\` 必须是 \`true\`，实得 ${JSON.stringify(calibrated.reading_lies)}`)
      }
      if (Object.prototype.hasOwnProperty.call(calibrated, 'unclassified')) {
        push('C2-SEVERITY-CALIBRATED',
          'A：`unclassified` **不是线**（它是第四个出口）⇒ 不许出现在 `calibrated` 里'
          + `（实得 ${JSON.stringify(calibrated)}）—— 出口与线混在一起，"够不够线"就没法判了`)
      }
    }

    // ── D① · 升级了 ⇒ 卡红 + 点名 ───────────────────────────────────────
    if (A.card.cells['severity.card_red'] !== true) {
      push('C2-SEVERITY-CARD-RED',
        `D①：有一条 \`severity_confidence:'cannot'\` 且已升级的 entry ⇒ \`severity.card_red\` 必须 \`true\`，`
        + `实得 ${JSON.stringify(A.card.cells['severity.card_red'])} —— 定形 §4.2：「判不了 ⇒ 升级 + 卡红」`)
    }
    const escalations = A.card.cells['severity.escalations']
    if (!Array.isArray(escalations) || !escalations.includes('bug-20261102-51')) {
      push('C2-SEVERITY-ESCALATION-UNNAMED',
        `D①：\`severity.escalations\` 必须点名那条被升级的 entry（\`bug-20261102-51\`），实得 ${JSON.stringify(escalations)}`)
    }

    // ── D② · 没升级 ⇒ 卡**更要**红（静默保留 open 是那一格要治的病）──────
    const B = scene('CARD-04', 'cannot-not-escalated', {
      route: routeLedger({ tickets: [] }),
      bug: bugLedger({ entries: [notEscalated('bug-20261102-52')] }),
    })
    if (!usable('D②/没升级', B)) { caseFail(problems); return }
    if (B.card.cells['card.red'] !== true) {
      push('C2-SEVERITY-SILENT',
        `D②：一条 \`severity_confidence:'cannot'\` 的 entry **没有** \`escalated_at\` —— 这是"判不了被静默保留 open"的样子，`
        + `卡必须红（\`card.red:true\`），实得 ${JSON.stringify(B.card.cells['card.red'])}。定形 §4.2：「判不了 ⇒ 升级 + 卡红（不是静默保留 open）」`)
    }
    if (!hasRed(B.card.cells, 'SEVERITY_CANNOT_UNESCALATED')) {
      push('C2-SEVERITY-SILENT-REASON',
        `D②：\`card.reasons\` 里没有 \`SEVERITY_CANNOT_UNESCALATED\`（实得 ${JSON.stringify(B.card.cells['card.reasons'])}）`)
    }
    const silentNamed = redDetails(B.card.cells, 'SEVERITY_CANNOT_UNESCALATED').join(' ')
    if (!silentNamed.includes('bug-20261102-52')) {
      push('C2-SEVERITY-SILENT-UNNAMED',
        `D②：红因没点名是哪一条 entry（detail 实得 ${JSON.stringify(silentNamed)}）—— 卡红了却不说哪一条，等于没红`)
    }

    // ── E · `assessment:'unknown'` 是另一个词 ────────────────────────────
    const C = scene('CARD-04', 'assessment-unknown', {
      route: routeLedger({ tickets: [] }),
      bug: bugLedger({ entries: [assessUnknown('bug-20261102-53')] }),
    })
    if (!usable('E/评估判不了', C)) { caseFail(problems); return }
    if (C.card.cells['severity.card_red'] !== false) {
      push('C2-SEVERITY-ASSESSMENT-MIXED',
        `E：\`assessment:'unknown'\` 是**bug 评估**里的判不了（保留 open、不升级），不是严重线的判不了 `
        + `⇒ \`severity.card_red\` 必须 \`false\`，实得 ${JSON.stringify(C.card.cells['severity.card_red'])}`
        + '（定形 §3.1 第 3 条 + §4.2：两个词分开）')
    }
    const escalationsE = C.card.cells['severity.escalations']
    if (Array.isArray(escalationsE) && escalationsE.includes('bug-20261102-53')) {
      push('C2-SEVERITY-ASSESSMENT-MIXED',
        `E：\`assessment:'unknown'\` 的 entry 出现在 \`severity.escalations\` 里（${JSON.stringify(escalationsE)}）—— 它不该升级`)
    }
    if (hasRed(C.card.cells, 'SEVERITY_CANNOT_UNESCALATED')) {
      push('C2-SEVERITY-ASSESSMENT-MIXED',
        `E：\`assessment:'unknown'\` 让卡报了 \`SEVERITY_CANNOT_UNESCALATED\`（${JSON.stringify(C.card.cells['card.reasons'])}）—— 两个词混了`)
    }

    // ── F · **无 bug 台账** ⇒ `samples: []` 是合法读数，卡不因此红 ─────────────
    /**
     * 组长 2026-11-02 裁定（`gate4-C2` F-10 / 契约 §2.3 #19 + §3.5）：
     * 本工作区还没有 bug 台账 ⇒ `severity.samples = []`、`calibrated` 三条线全 `false`、
     * `severity.card_red = false`，**卡不因此红**。
     *
     * 为什么这一格必须存在：真工作区今天就是这个形状（实现岗 `gate3-C2.md:78-82` 记的读数）。
     * 没有这一格时，"样本恰四个"只在夹具里成立 —— 真实卡要么被读成"少了两格"（假红）、
     * 要么实现被逼着编四个样本（把"没登记"印成"登记过"）。两个方向都在这一格里量：
     *   · 样本必须是 `[]`（编样本 ⇒ `C2-SEVERITY-SAMPLES-FAKE`）；
     *   · 卡不许因此红（`card.red:false` 且 `reasons` 里没有 `SEVERITY_*`）；
     *   · `severity.lines` 仍是四条（出口是闭集，与有没有样本无关）。
     * 另一向（台账在 ⇒ 恰四个）由 A 段判着 —— 两条一起才排掉"把 `samples` 写成常量"。
     */
    const F = scene('CARD-04', 'no-ledger', {
      route: routeLedger({ tickets: [] }),
      local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
      identity: {},
      reviews: {},
      legacy: { remaining: 0 },
    })
    if (!usable('F/无台账', F)) { caseFail(problems); return }
    const ledgerFile = path.join(F.roots.ws, '.team', 'bug', 'ledger.json')
    readings['F/无台账'] = {
      ledger: statOf(ledgerFile),
      samples: F.card.cells['severity.samples'],
      calibrated: F.card.cells['severity.calibrated'],
      severity_card_red: F.card.cells['severity.card_red'],
      lines: F.card.cells['severity.lines'],
      card_red: F.card.cells['card.red'],
      reasons: F.card.cells['card.reasons'],
    }
    if (statOf(ledgerFile).exists) {
      push('C2-FIXTURE-BROKEN',
        `F：这一格的夹具本该**没有** bug 台账（${ledgerFile}），盘上却有 —— 场景没造对，下面的读数不可信`)
    }
    const samplesF = F.card.cells['severity.samples']
    if (!Array.isArray(samplesF) || samplesF.length !== 0) {
      push('C2-SEVERITY-SAMPLES-FAKE',
        `F（没有 bug 台账）：\`severity.samples\` 必须是 **\`[]\`**（契约 §2.3 #19：无台账 ⇒ 0 样本是合法读数），`
        + `实得 ${JSON.stringify(samplesF)} —— 编出样本就是把"没登记"印成"登记过"（组长 2026-11-02 裁定）`)
    }
    const calibratedF = F.card.cells['severity.calibrated']
    if (calibratedF === null || typeof calibratedF !== 'object' || Array.isArray(calibratedF)) {
      push('C2-SEVERITY-CALIBRATED', `F：\`severity.calibrated\` 必须是对象，实得 ${JSON.stringify(calibratedF)}`)
    } else {
      for (const line of ['data_broken', 'function_broken_repro', 'reading_lies']) {
        if (calibratedF[line] !== false) {
          push('C2-SEVERITY-CALIBRATED',
            `F（没有台账 ⇒ 一条样本也没有）：\`calibrated.${line}\` 必须 \`false\`，实得 ${JSON.stringify(calibratedF[line])}`)
        }
      }
      if (Object.prototype.hasOwnProperty.call(calibratedF, 'unclassified')) {
        push('C2-SEVERITY-CALIBRATED', `F：\`unclassified\` 不是线，不许出现在 \`calibrated\` 里（实得 ${JSON.stringify(calibratedF)}）`)
      }
    }
    if (F.card.cells['severity.card_red'] !== false) {
      push('C2-SEVERITY-CARD-RED',
        `F（没有 bug 台账）：\`severity.card_red\` 必须 \`false\` —— "没样本"不是"判不了"（那个词是 \`cannot\`），`
        + `实得 ${JSON.stringify(F.card.cells['severity.card_red'])}`)
    }
    if (!Array.isArray(F.card.cells['severity.lines']) || JSON.stringify(F.card.cells['severity.lines']) !== JSON.stringify(SEVERITY_LINES)) {
      push('C2-SEVERITY-LINES',
        `F：出口是闭集，与有没有样本无关 ⇒ \`severity.lines\` 仍是 ${JSON.stringify(SEVERITY_LINES)}，实得 ${JSON.stringify(F.card.cells['severity.lines'])}`)
    }
    if (F.card.cells['card.red'] !== false) {
      push('C2-SEVERITY-SAMPLES-RED',
        `F：没有 bug 台账 **不许**让卡红（组长 2026-11-02 裁定：那是"还没登记过"，不是故障）—— `
        + `\`card.red\` 实得 ${JSON.stringify(F.card.cells['card.red'])}，reasons=${JSON.stringify(F.card.cells['card.reasons'])}`)
    }
    for (const code of ['SEVERITY_CANNOT_UNESCALATED', 'SEVERITY_CARD_RED']) {
      if (hasRed(F.card.cells, code)) {
        push('C2-SEVERITY-SAMPLES-RED',
          `F：没有台账却报了 \`${code}\`（${JSON.stringify(F.card.cells['card.reasons'])}）—— 那两个码是"严重线判不了"，不是"没登记样本"`)
      }
    }

    rec.readings.card04 = readings
    rec.readings.sheet_name = CARD_SHEET
    rec.readings.sample_set = SAMPLE_SET.map((s) => `${s.line}:${s.polarity}`)
    caseFail(problems)
  })
})
