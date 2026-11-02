/**
 * `CARD-05` · **状态条 · 十二格**（十二格全接线；未接线 = 红；只有探针降级的格显 unknown / 黄）。
 *
 * 冻结依据：定形 §2.3 末段（**卡红统一落状态条的「红条」格**）· §6.2「状态条」那一行（**十二格**：
 *   50/30 · 未建账 · 记忆链红 · SLA 红 · carrier 缺 · observation 数 · 未知预设报警 · 预设降级 ·
 *   legacy 会话数 · 单写者未执行 · stale 槽 · 红条；**未接线 = 红（缺格）**；**十二格全部接线才算过**；
 *   每格一个接线任务；**只有探针降级的格显 unknown / 黄**；缺回执 / 缺 carrier 照样红）。
 *   契约：`.team/test/CONTRACT-C2.md` §4（12 格表 + 四条结构断言 + §4.3 槽谓词）·
 *   组长裁定 `.team/leader/2026-11-02/C2-rulings.md` 第 1、2 条（五格全部接线，不留常驻红）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格判七样（每一格都单独能翻面）：
 *   `A` **形状**：`statusbar` 恰好 12 个对象、`key` 与契约 §4.2 **逐字同序**、每个对象**至少**六个键
 *       （`key/label/state/reading/producer/wired`；`degraded_by` 是第七个，只在探针降级时出现，
 *       **别的加性键也允许** —— 契约 §4.1 明写"至少"）、`state` 在四值闭集里、`statusbar.count === 12`、
 *       **`label` / `producer` 逐字等于 §4.2 那两列**（`gate4-C2` F-06）。
 *   `B` 🔴 **十二格全接线**（裁定第 1 条）：`statusbar` 里任何一格 `wired:false` ⇒ `C2-STATUSBAR-ANY-UNWIRED`。
 *       主夹具（五种 producer 全给）里十二格必须**真的**是 `wired:true`。
 *       ⚠️ **`wired` 今天是常量 `true`**（`gate4-C2` F-13）：生成器每条路径都写 `True`，
 *       所以这条**只守测试侧**（合成输入证明它翻得动面），不证明生产路径会产出 `false`。
 *   `C` 🔴 **不许拿 unknown / 黄当挡箭牌**：`state ∈ {unknown, yellow}` ⇒ 必须 `wired === true` 且
 *       `degraded_by ∈ {A0b, A0d}`，并且那一格**只能**是两道槽格（`slot_not_enforced` / `stale_slot`）。
 *   `D` **红条是总闸**：`red_bar` 那一格的 `state` 必须与 `card.red` 同值（定形：「卡红统一落红条格」）。
 *   `E` 🔴 **五格真读数（两个方向各一次）**：`sla` / `carrier_missing` / `unknown_preset` /
 *       `preset_downgrade` / `legacy_sessions` 在自己的 producer 给了时必须是 `green`，缺 / 越界时必须 `red`，
 *       且 `reading` 点得出"量到了什么"。**SLA 的三条**（`gate4-C2` F-01 / F-03）：超一个开工周期 ⇒ 红 + 点名；
 *       `assessment.verdict:'unknown'`（判不了）**照样超期**；`bug-read.sla` 用**同一注入时钟**跨读者对账
 *       （不可用 ⇒ HOLD）。**槽两格的四条**（F-02 / F-07）见 `F` 段。
 *   `F` 🔴 **槽谓词只有一份权威**（契约 §4.3）：同一份 `tasks[]` 喂 `slotBusy()`（现役 `lib/route.mjs`）与
 *       `slot_state_of()`（生成器 Python 那份），`state` / `allow` / `holders` **逐项相同**；
 *       `implement` + `bug-repair` 两个活持有者 ⇒ `slot_not_enforced` 红 + `SLOT_NOT_ENFORCED`；
 *       `crash` 心跳 ⇒ `stale_slot` 红 + `STALE_SLOT`；两样同时在 ⇒ **两格都红、两条码都在**；
 *       心跳缺（判不了）⇒ **两格黄 + `degraded_by`**。
 *       🔴 **30 分钟边界**（`SLOT_STALE_MS`）：`29:59` ⇒ 还活着（`busy`，`stale_slot` 不红）；
 *       `30:01` ⇒ `crash`（`stale_slot` 红 + `STALE_SLOT` 点名）；**同一个注入时钟** `NOW`。
 *       两个边界行同时进跨值矩阵（JS / Python 各判一次）+ 常量字面值对账
 *       （Python 那份 `SLOT_STALE_MS` 是**手抄**的，只靠 2 小时那种远场现场抓不到 30→60 的漂移）。
 *   `G` 🔴 **两个 producer 自己的写面**（`gate4-C2` F-09）：A = `inject.js::recordIdentityAlarm()`
 *       （落点 / 04:00 天号 / 去重 / 不是工作区就不写）；B = `lib/bug-ledger.mjs::slaVerdict()`
 *       （`unknown` 照样超期 / 当天开的不算 / observation 不算 / `cycle` 缺 ⇒ 判不了）。
 *
 * ── 未接线那两条判据怎么证明自己翻得动面 ───────────────────────────────
 * 主夹具里十二格全接线 ⇒ "`wired:false ⇒ red`" 这条判据在主夹具上**没有样本**。
 * 所以这一格把结构断言抽成 `judgeBar()`，再喂**六份合成输入**（阳性对照 + 五个负样本）：
 *   · 合成 A（全绿、12 格全 wired）⇒ `judgeBar` 必须 **0 问题**（判据不是"永远红"）；
 *   · 合成 B（第 4 格 `wired:false` + `state:'green'` + reading 不说没接线、reasons 里没有 `CARD_UNWIRED:sla`）
 *     ⇒ 必须抓到 **`UNWIRED-GREEN` / `UNWIRED-SILENT` / `UNWIRED-REASON` + `ANY-UNWIRED`**；
 *   · 合成 C（第 4 格 `wired:false` 但**守规矩**：`state:'red'` + reading 说"未接线" + reasons 有点名）
 *     ⇒ **只**剩 `C2-STATUSBAR-ANY-UNWIRED`（证明"十二格全接线"与"未接线 ⇒ 红"是**两条**判据，
 *     第 2 条不是第 4 条的影子）；
 *   · 合成 D（一道**非**探针格显 `unknown`）⇒ 必须抓到 `C2-STATUSBAR-FAKE-UNKNOWN`；
 *   · 合成 E（两格的 `producer` 互换）⇒ 必须抓到 `C2-STATUSBAR-PRODUCER-VALUE` **两条**（F-06）；
 *   · 合成 F（一格的 `label` 改成 `?`）⇒ 必须抓到 `C2-STATUSBAR-LABEL`（F-06）。
 *
 * ── 现在为什么红 ─────────────────────────────────────────────────────────
 * 卡上没有状态条（今天生成器四页：判决/库现状 · 处置与原文 · 复核/池子/水位 · 待你拍），
 * `C2 · 验收格` 整页不在 ⇒ `C2-SHEET-MISSING`。
 */
import { before, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import { livePath, loadLiveModule } from '../support/sut.mjs'
import { PATHS } from '../support/env.mjs'
import {
  CARD_SHEET, DAY, DAY_PREV, NOW, NOW_PREV, PROBE_DEGRADED_KEYS, PROBE_IDS, RED_CODES, STATUS_CELLS,
  STATUS_STATES, assertReasonCodes, bugEntry, bugLedger, cardFile, hasRed, keysMissing, localState,
  makeCardRoots, opUnavailable, pythonMirror, readBugOp, readCard, redCodes, redDetails, routeLedger,
  routeTask, runCards, scene, setClock, sheetMissing, statOf, writeBug, writeDataRoot, writeIdentity,
  writeLegacyStore, writeLocal, writeMemorySource, writeReviewReports, writeRoute,
} from '../support/card-surface.mjs'

before(() => {
  preflight()
})

/** 状态条每一格**恰好**这六个键（加性键允许 —— 但这六个少一个就是"读不到"）。 */
const CELL_KEYS = ['key', 'label', 'state', 'reading', 'producer', 'wired']
/** `reading` 里"没接线"那一句的针（实现写中文；这三个词任何一种都算说了）。 */
const UNWIRED_NEEDLES = ['未接线', '没接线', '未接']

/**
 * 十二条结构断言（`A`–`D`）+ `label`/`producer` 逐字（`A'`），**一份判据**：
 *   · 主夹具喂它 —— 这里吐不出问题才算这一格过；
 *   · 六份合成输入也喂它 —— 那六份证明它**该红时真红**（`mig-rules-14`：翻不了面的判据是装饰）。
 */
function judgeBar(bar, cells) {
  const problems = []
  const push = (code, message, detail) => problems.push(problem(code, message, detail))

  if (!Array.isArray(bar)) {
    push('C2-STATUSBAR-SHAPE', `\`statusbar\` 必须是数组（十二行对象），实得 ${JSON.stringify(bar)?.slice(0, 300)}`)
    return problems
  }
  const count = cells['statusbar.count']
  if (count !== 12 || bar.length !== 12) {
    push('C2-STATUSBAR-SHAPE',
      `状态条必须**恰好十二格**（定形 §6.2：那一行点名了十二个格），实得 \`statusbar.count\` = ${JSON.stringify(count)}`
      + `、数组长度 = ${bar.length}。少一格就是"缺格"（= 未接线 = 红），多一格说明有人在状态条上塞了别的东西`)
  }
  const wantKeys = STATUS_CELLS.map((c) => c.key)
  const gotKeys = bar.map((c) => c?.key)
  if (JSON.stringify(gotKeys) !== JSON.stringify(wantKeys)) {
    push('C2-STATUSBAR-KEYS',
      `十二格的 \`key\` 必须与契约 §4.2 逐字同序：期望 ${JSON.stringify(wantKeys)}，实得 ${JSON.stringify(gotKeys)}`
      + ' —— 格名一改，老板读的那条横条与判据就对不上了')
  }
  for (const cell of bar) {
    const missing = CELL_KEYS.filter((k) => cell === null || typeof cell !== 'object' || !(k in cell))
    if (missing.length > 0) {
      push('C2-STATUSBAR-CELL-SHAPE',
        `格 ${JSON.stringify(cell?.key ?? '(无 key)')} 少了 ${missing.join(' / ')} —— 六样缺一样，这一格就"读得到标签、读不到值"`)
      continue
    }
    if (!STATUS_STATES.includes(cell.state)) {
      push('C2-STATUSBAR-STATE',
        `格 \`${cell.key}\` 的 \`state\` = ${JSON.stringify(cell.state)} 不在闭集 ${JSON.stringify(STATUS_STATES)} 里`)
    }
    if (typeof cell.reading !== 'string' || cell.reading.trim() === '') {
      push('C2-STATUSBAR-READING', `格 \`${cell.key}\` 的 \`reading\` 必须是非空字符串（"这一格量到了什么"），实得 ${JSON.stringify(cell.reading)}`)
    }
    // ── A' · `label` / `producer` **逐字**（`gate4-C2` F-06；契约 §4.2 那两列）──────
    // 只判"非空"会让"十二格全部接线"退化成"十二格都有个非空字符串"：两格 producer 互换、
    // 或 label 改成 `?`，照旧全绿。表在（`STATUS_CELLS`）就要有判据读它。
    const want = STATUS_CELLS.find((c) => c.key === cell.key) ?? null
    if (want !== null) {
      if (cell.label !== want.label) {
        push('C2-STATUSBAR-LABEL',
          `格 \`${cell.key}\` 的 \`label\` 必须与契约 §4.2 逐字相同（期望 ${JSON.stringify(want.label)}），实得 ${JSON.stringify(cell.label)}`)
      }
      if (cell.producer !== want.producer) {
        push('C2-STATUSBAR-PRODUCER-VALUE',
          `格 \`${cell.key}\` 的 \`producer\` 必须与契约 §4.2 逐字相同（期望 ${JSON.stringify(want.producer)}），实得 ${JSON.stringify(cell.producer)} —— `
          + '"谁接线"就是这一列；两格互换照旧绿的话，这一列只是装饰')
      }
    }
    // （`producer` 的"非空"由上面那条**逐字**判据涵盖：空串不可能等于 §4.2 的串。）
    // ── B · 十二格全接线（裁定第 1 条）──────────────────────────────
    if (cell.wired === false) {
      push('C2-STATUSBAR-ANY-UNWIRED',
        `格 \`${cell.key}\` 的 \`wired\` = false —— 定形 §6.2：「**十二格全部接线才算过**」；`
        + '组长 2026-11-02 裁定第 1 条把五格全部接上（常驻红会把真红淹掉）。'
        + '未接线的格只能在**负样本**里出现，不许出现在主夹具里')
    }
    // ── 未接线那格不许装绿（这条独立承重：合成 C 只剩上面那一条）────────
    if (cell.wired === false) {
      if (cell.state !== 'red') {
        push('C2-STATUSBAR-UNWIRED-GREEN',
          `格 \`${cell.key}\` 声明了 \`wired:false\`（这一格没接线），但 \`state\` = ${JSON.stringify(cell.state)} —— `
          + '定形 §6.2：「**未接线 = 红（缺格）**」。未接线的格不许绿、不许 unknown、不许黄：'
          + '"没接线"与"读了、是绿的"长得一样，就是红格被静音的方式（`mig-rules-12`）')
      }
      const said = UNWIRED_NEEDLES.some((n) => String(cell.reading).includes(n))
      if (!said) {
        push('C2-STATUSBAR-UNWIRED-SILENT',
          `格 \`${cell.key}\` 没接线，但 \`reading\` 里没有一个"没接线"的说法（实得 ${JSON.stringify(cell.reading)}）—— `
          + 'reading 必须说的是"没接"这件事，不是"读数正常"')
      }
      if (!hasRed(cells, `CARD_UNWIRED:${cell.key}`)) {
        push('C2-STATUSBAR-UNWIRED-REASON',
          `格 \`${cell.key}\` 没接线，但 \`card.reasons\` 里没有 \`CARD_UNWIRED:${cell.key}\`（实得 ${JSON.stringify(cells['card.reasons'])}）`)
      }
    }
    if (cell.wired === true && UNWIRED_NEEDLES.some((n) => String(cell.reading).includes(n))) {
      push('C2-STATUSBAR-WIRED-LYING',
        `格 \`${cell.key}\` 声明了 \`wired:true\`，\`reading\` 却说自己没接线（${JSON.stringify(cell.reading)}）—— 两个字段互相矛盾`)
    }
    // ── C · unknown / 黄 只许探针降级的格 ──────────────────────────────
    if (cell.state === 'unknown' || cell.state === 'yellow') {
      if (cell.wired !== true) {
        push('C2-STATUSBAR-FAKE-UNKNOWN',
          `格 \`${cell.key}\` 是 \`${cell.state}\` 且 \`wired:${JSON.stringify(cell.wired)}\` —— `
          + '没接线的格只能红（unknown 会让"没接线"看起来像"判不了"）')
      }
      if (!PROBE_DEGRADED_KEYS.includes(cell.key)) {
        push('C2-STATUSBAR-FAKE-UNKNOWN',
          `格 \`${cell.key}\` 显 \`${cell.state}\` —— 只有两道槽格（${PROBE_DEGRADED_KEYS.join(' / ')}）才允许`
          + '「探针降级 ⇒ unknown / 黄」（C1 §11：A0b / A0d 不成立 ⇒ 卡槽格黄）。'
          + '定形 §6.2：「**只有探针降级的格显 unknown / 黄；缺回执 / 缺 carrier 照样红**」'
          + '—— 别的格拿 unknown 当挡箭牌，就是把一条该红的红换成了"判不了"')
      }
      const degradedBy = cell.degraded_by ?? null
      if (!PROBE_IDS.includes(degradedBy)) {
        push('C2-STATUSBAR-FAKE-UNKNOWN',
          `格 \`${cell.key}\` 是 \`${cell.state}\` 但没点名是哪条探针降的级（\`degraded_by\` = ${JSON.stringify(degradedBy)}；应是 ${PROBE_IDS.join(' / ')}）—— `
          + '"判不了"必须说得出是谁判不了')
      }
    }
  }

  // ── D · 红条 = 总闸 ──────────────────────────────────────────────────
  const redBar = bar.find((c) => c?.key === 'red_bar')
  const cardRed = cells['card.red']
  if (redBar === undefined) {
    push('C2-STATUSBAR-REDBAR-MISSING', '状态条里没有 `red_bar` 那一格 —— 定形：「卡红统一落状态条的「红条」格」')
  } else if (typeof cardRed !== 'boolean') {
    push('C2-STATUSBAR-REDBAR-DISAGREE', `\`card.red\` 必须是布尔（实得 ${JSON.stringify(cardRed)}）—— 红条格要与它同值`)
  } else {
    const want = cardRed ? 'red' : 'green'
    if (redBar.state !== want) {
      push('C2-STATUSBAR-REDBAR-DISAGREE',
        `\`red_bar\` 格的 \`state\` = ${JSON.stringify(redBar.state)}，而 \`card.red\` = ${JSON.stringify(cardRed)} `
        + `⇒ 应当是 ${JSON.stringify(want)} —— 卡红必须落在这一格上（否则老板看到的横条与卡的真实状态相反）`)
    }
  }
  return problems
}

/** 一份"全绿、十二格全 wired"的合成状态条（阳性对照的输入）。 */
const goodBar = () => STATUS_CELLS.map((c) => ({
  key: c.key, label: c.label, state: 'green', reading: `${c.key}=0`, producer: c.producer, wired: true,
}))
/** 合成现场的外壳：`card.red:false` + 红条格 green（与 `goodBar()` 自洽）。 */
const goodCells = (bar) => ({ statusbar: bar, 'statusbar.count': 12, 'card.red': false, 'card.reasons': [] })

test('CARD-05 状态条十二格：形状（12 格逐字同序）· 十二格全接线 · unknown/黄只许探针格 · 红条 = 总闸 · 五格真读数两向', async () => {
  await runCase('CARD-05', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {}
    // 读数对象先挂上去：早退（页不在 / 生成器炸）也留得下六份合成输入的判词。
    rec.readings.card05 = readings

    // ── 阳性对照 / 负样本：先证明 judgeBar 该绿时绿、该红时红 ─────────────
    {
      const bar = goodBar()
      const cells = goodCells(bar)
      const ok = judgeBar(bar, cells)
      readings.synthetic_ok = { problems: ok.length }
      if (ok.length !== 0) {
        push('C2-STATUSBAR-JUDGE-ALWAYS-RED',
          `合成输入 A（十二格全 wired、全 green、红条格 green）⇒ judgeBar 应当 0 问题，实得 ${ok.length} 条：`
          + `${ok.map((p) => p.code).join(' / ')} —— 判据不是"永远红"`)
      }
    }
    {
      // 合成 B：一格没接线，却装成绿色 —— 四条判据必须全部抓到。
      const bar = goodBar()
      bar[3] = { ...bar[3], wired: false, state: 'green', reading: 'sla=0' }
      const got = judgeBar(bar, goodCells(bar))
      const codes = got.map((p) => p.code)
      readings.synthetic_unwired_green = { codes }
      for (const want of ['C2-STATUSBAR-UNWIRED-GREEN', 'C2-STATUSBAR-UNWIRED-SILENT', 'C2-STATUSBAR-UNWIRED-REASON', 'C2-STATUSBAR-ANY-UNWIRED']) {
        if (!codes.includes(want)) {
          push('C2-STATUSBAR-KNIFE-MISSED',
            `合成输入 B（第 4 格 \`wired:false\` + \`state:'green'\` + reading 不说没接线 + reasons 没点名）⇒ 必须抓到 \`${want}\`，`
            + `实得 ${JSON.stringify(codes)} —— 这条判据没有牙（` + '`mig-rules-14`）')
        }
      }
    }
    {
      // 合成 C：同一格没接线，但**守规矩**（红 + 说没接线 + reasons 有点名）⇒ 只该剩"十二格全接线"那一条。
      const bar = goodBar()
      bar[3] = { ...bar[3], wired: false, state: 'red', reading: '未接线（sla 的 producer 还没接）' }
      // 这一份现场是"卡已经红了"：红条格必须跟着红（否则会多报一条 REDBAR-DISAGREE，掩盖要证的那一条）。
      bar[11] = { ...bar[11], state: 'red' }
      const cells = { ...goodCells(bar), 'card.red': true, 'card.reasons': [{ code: 'CARD_UNWIRED:sla', detail: 'sla' }] }
      const got = judgeBar(bar, cells)
      const codes = got.map((p) => p.code)
      readings.synthetic_unwired_proper = { codes }
      if (JSON.stringify(codes) !== JSON.stringify(['C2-STATUSBAR-ANY-UNWIRED'])) {
        push('C2-STATUSBAR-KNIFE-LEAK',
          `合成输入 C（第 4 格没接线但**守规矩**：red + reading 说没接线 + reasons 点名）⇒ 只该剩 \`C2-STATUSBAR-ANY-UNWIRED\` 一条，`
          + `实得 ${JSON.stringify(codes)} —— 多半是"未接线 ⇒ 红"与"十二格全接线"被写成了同一条判据（两条各有各的翻面样本才留得住）`)
      }
    }
    {
      // 合成 D：一道**非**探针格显 unknown（拿 unknown 当挡箭牌）。
      const bar = goodBar()
      bar[4] = { ...bar[4], state: 'unknown' }
      const got = judgeBar(bar, goodCells(bar))
      const codes = got.map((p) => p.code)
      readings.synthetic_fake_unknown = { codes }
      if (!codes.includes('C2-STATUSBAR-FAKE-UNKNOWN')) {
        push('C2-STATUSBAR-KNIFE-MISSED',
          `合成输入 D（非探针格 \`carrier_missing\` 显 unknown）⇒ 必须抓到 \`C2-STATUSBAR-FAKE-UNKNOWN\`，实得 ${JSON.stringify(codes)}`)
      }
    }
    {
      // 合成 E（F-06）：两格的 `producer` **互换** —— 两条判据各抓一条。
      const bar = goodBar()
      const p3 = bar[3].producer
      bar[3] = { ...bar[3], producer: bar[4].producer }
      bar[4] = { ...bar[4], producer: p3 }
      const got = judgeBar(bar, goodCells(bar))
      const codes = got.map((p) => p.code)
      readings.synthetic_producer_swap = { codes, from: p3, to: STATUS_CELLS[4].producer }
      const hits = codes.filter((c) => c === 'C2-STATUSBAR-PRODUCER-VALUE').length
      if (hits !== 2) {
        push('C2-STATUSBAR-KNIFE-MISSED',
          `合成输入 E（第 4 格与第 5 格的 \`producer\` 互换）⇒ 必须抓到 **2 条** \`C2-STATUSBAR-PRODUCER-VALUE\`，`
          + `实得 ${hits} 条（全部 ${JSON.stringify(codes)}）—— 这一列只判"非空"时，换过之后照旧全绿（F-06）`)
      }
    }
    {
      // 合成 F（F-06）：一格的 `label` 被改成 `?` ⇒ 必须抓到。
      const bar = goodBar()
      bar[9] = { ...bar[9], label: '?' }
      const got = judgeBar(bar, goodCells(bar))
      const codes = got.map((p) => p.code)
      readings.synthetic_label_wrong = { codes }
      if (!codes.includes('C2-STATUSBAR-LABEL')) {
        push('C2-STATUSBAR-KNIFE-MISSED',
          `合成输入 F（第 10 格 \`label\` 改成 \`?\`）⇒ 必须抓到 \`C2-STATUSBAR-LABEL\`，实得 ${JSON.stringify(codes)}`)
      }
    }
    {
      // ── F-05：`card.reasons` 闭集的**阳性 / 阴性对照**（同一只判据，两个方向）──
      // 阳性：一条合法码（`SLA_OVER_CYCLE`）⇒ 不许报。
      const okProblems = []
      const okPush = (code, message, detail) => okProblems.push(problem(code, message, detail))
      const ok = assertReasonCodes({ 'card.reasons': [{ code: 'SLA_OVER_CYCLE', detail: '1 条超期' }] }, okPush, '合成/合法码')
      // 阴性：一条拼错/没人登记的码 ⇒ **必须**报。
      const badProblems = []
      const badPush = (code, message, detail) => badProblems.push(problem(code, message, detail))
      const bad = assertReasonCodes({ 'card.reasons': [{ code: 'BOGUS_CODE', detail: '（编的）' }] }, badPush, '合成/瞎编码')
      readings.reason_closed_set = {
        red_codes: RED_CODES,
        positive_codes: ok.codes,
        positive_problems: okProblems.map((p) => p.code),
        negative_codes: bad.codes,
        negative_problems: badProblems.map((p) => p.code),
      }
      if (okProblems.length !== 0) {
        push('C2-STATUSBAR-KNIFE-ALWAYS-RED',
          `合成（阳性）：\`card.reasons\` 里只有一条合法码 \`SLA_OVER_CYCLE\`，闭集判据却报了 ${JSON.stringify(okProblems.map((p) => p.code))} —— 它恒红，不是判据`)
      }
      if (!badProblems.some((p) => p.code === 'C2-REASON-UNKNOWN')) {
        push('C2-STATUSBAR-KNIFE-MISSED',
          `合成（阴性）：\`card.reasons\` 里塞一条 \`BOGUS_CODE\`，闭集判据没有报 \`C2-REASON-UNKNOWN\`（实得 ${JSON.stringify(badProblems.map((p) => p.code))}）—— `
          + '那"新码要同批进那张表"就没有执行点（F-05）')
      }
    }

    // ── 主夹具：十二格的 producer 全给（裁定第 1 条：全部接线）────────────
    /**
     * 现场：路线账本 + bug 台账（一只当天开的 bug）+ 本地节点（两段都 done）+
     * 数据根（记忆库快照在）+ `identity/<day>.json`（两格都空）+ 两份评审报告（都在）+
     * legacy 票店（**已迁空** ⇒ 0 张）。
     * ⇒ 十二格**全部有读面**；主夹具里任何一格 `wired:false` 都是"没接线"。
     */
    const S = scene('CARD-05', 'statusbar', {
      route: routeLedger({ tickets: [] }),
      bug: bugLedger({ entries: [bugEntry('bug-20261102-01', { opened_at: `${DAY}T09:00:00+08:00`, registered_at: `${DAY}T09:00:00+08:00` })] }),
      local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
      identity: {},
      reviews: {},
      legacy: { remaining: 0 },
    })
    readings['现场'] = { exit_code: S.run.exit_code, sheet_names: S.card.dump?.sheet_names ?? null, error: S.card.error }
    if (S.run.exit_code !== 0) {
      push('C2-GENERATOR-FAILED', `现场：生成器 exit=${S.run.exit_code} —— stderr=${String(S.run.stderr).trim().slice(0, 300)}`)
      rec.readings.card05 = readings
      caseFail(problems)
      return
    }
    // 🔴 提前收尾也要把读数落盘：六份合成输入的判词是"判据有没有牙"的证据，别跟着早退一起丢。
    if (sheetMissing(S.card, push, '状态条')) { rec.readings.card05 = readings; caseFail(problems); return }
    if (keysMissing(S.card, push, '状态条')) { rec.readings.card05 = readings; caseFail(problems); return }

    const bar = S.card.cells['statusbar']
    readings.statusbar = bar
    readings.count = S.card.cells['statusbar.count']
    readings.card_red = S.card.cells['card.red']
    readings.reasons = S.card.cells['card.reasons']
    readings.sla = { now: NOW }

    // A–D 四条结构断言（与六份合成输入**同一份判据**）
    for (const p of judgeBar(bar, S.card.cells)) problems.push(p)
    // 🔴 `card.reasons` 的闭集（`gate4-C2` F-05；契约 §5 末条）—— 主夹具也要过。
    assertReasonCodes(S.card.cells, push, '现场')

    // ── 读数：哪几格还没接线、各格状态（写进证据，方便第 4 关读）────────
    readings.unwired = Array.isArray(bar) ? bar.filter((c) => c?.wired === false).map((c) => c.key) : null
    readings.required_wired = STATUS_CELLS.filter((c) => c.wired_required === true).map((c) => c.key)
    readings.states = Array.isArray(bar) ? Object.fromEntries(bar.map((c) => [c?.key, c?.state])) : null

    /** 取一格（不在 ⇒ null，由 A 那一段报缺格）。 */
    const cellOf = (source, key) => (Array.isArray(source) ? source.find((c) => c?.key === key) ?? null : null)

    // ── E · 五格真读数：主夹具里必须 green（真的读到了，且没越界）────────
    for (const key of ['sla', 'carrier_missing', 'unknown_preset', 'preset_downgrade', 'legacy_sessions']) {
      const cell = cellOf(bar, key)
      if (cell === null) continue
      if (cell.wired !== true) {
        push('C2-STATUSBAR-ANY-UNWIRED', `格 \`${key}\` 在主夹具里（producer 全给）仍然是 \`wired:${JSON.stringify(cell.wired)}\` —— 裁定第 1 条要的是**全部接线**`)
      }
      if (cell.state !== 'green') {
        push(`C2-STATUSBAR-${key.toUpperCase().replace(/_/g, '-')}-STATE`,
          `主夹具（路线账本在、bug 台账干净、identity 两格都空、两份评审报告都在、legacy 票店已迁空）⇒`
          + ` 格 \`${key}\` 应当是 \`green\`，实得 ${JSON.stringify(cell.state)}（reading=${JSON.stringify(cell.reading)}）`
          + ' —— 该格要么没真读到，要么把"空"读成了红')
      }
    }

    // ── E2 · sla 的另一向：超一个开工周期仍未评估 ⇒ 红 ──────────────────
    {
      const over = scene('CARD-05', 'sla-over', {
        route: routeLedger({ tickets: [] }),
        bug: bugLedger({
          entries: [
            bugEntry('bug-20261101-01', { opened_at: `${DAY_PREV}T09:00:00+08:00`, registered_at: `${DAY_PREV}T09:00:00+08:00` }),
          ],
        }),
        local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
        identity: {},
        reviews: {},
        legacy: { remaining: 0 },
      })
      if (over.run.exit_code !== 0) {
        push('C2-GENERATOR-FAILED', `sla 越界现场：生成器 exit=${over.run.exit_code}`)
      } else if (over.card.sheet !== null) {
        const cells = over.card.cells
        const cell = cellOf(cells['statusbar'], 'sla')
        readings.sla_over = { cell, reasons: cells['card.reasons'], card_red: cells['card.red'] }
        if (cell === null || cell.state !== 'red') {
          push('C2-SLA-OVER-CYCLE-GREEN',
            `一只 bug 的 \`opened_at\` 是 ${DAY_PREV}（上一个开工周期）、\`assessment\` 仍是 null ⇒ 格 \`sla\` 必须 \`red\`，`
            + `实得 ${JSON.stringify(cell)} —— 契约 §3.7.1 / 裁定第 2 条：「从 opened_at 起超一个开工周期仍未 assessed ⇒ 红」`)
        }
        if (cell !== null && !String(cell.reading).match(/\d/)) {
          push('C2-SLA-READING', `格 \`sla\` 的 \`reading\` 必须带得出数（条数 / 最老天数），实得 ${JSON.stringify(cell.reading)}`)
        }
        if (!hasRed(cells, 'SLA_OVER_CYCLE')) {
          push('C2-SLA-REASON',
            `超期的 bug 在 \`card.reasons\` 里没有 \`SLA_OVER_CYCLE\`（实得 ${JSON.stringify(cells['card.reasons'])}）—— `
            + '裁定第 2 条：「红 + **日志一行**」；机器那一半就是这条码（§6 第 11 条）')
        }
      }
    }

    // ── E2b · 🔴 **判不了不是已评估**（`gate4-C2` F-01）：旧 bug + `assessment.verdict:'unknown'` ──
    /**
     * 这是 F-01 的现场：一只 2026-11-01 开、只有 `{"verdict":"unknown"}` 那种评估的 bug。
     * `unknown` = 判不了 ⇒ 它**保留 open** ⇒ 照样超期 ⇒ 格 `sla` 必须 `red`，且 `SLA_OVER_CYCLE`
     * 的 `detail` **点名那只 bug**。
     * 病灶（打回那一条）：`assessment` 只要是个非空对象就被当成"已评估" ⇒ 这只 bug 静默变绿。
     */
    const SLA_UNKNOWN_ID = 'bug-20261101-07'
    // ── E2c · **跨读者**（F-03）：`bug-read.sla` 必须用**同一个注入时钟**，三项逐项相同 ──
    const slaCrossReader = (label, s, slaCell, cells) => {
      const env = setClock(s.roots, s.nowIso)
      const res = readBugOp(s.roots.ws, `c2-card05-${label.replace(/[^a-zA-Z0-9]/g, '')}`, { env })
      readings[label] = {
        exit_code: res?.exit_code ?? null,
        code: res?.json?.error?.code ?? null,
        sla: res?.json?.sla ?? null,
        clock: { file: env.AGENIA_NOW_FILE, now: s.nowIso },
        card: { state: slaCell === null ? null : slaCell.state, reading: slaCell === null ? null : slaCell.reading },
      }
      if (opUnavailable(res)) {
        caseHold(rec, 'C2-SLA-CROSS-READER-UNAVAILABLE',
          `\`--op bug-read\` 没量到（${label}）—— SLA 的"两条路同值"（契约 §3.7.1）这一腿**判不了**，不记绿。`)
        return
      }
      if (res.exit_code !== 0) {
        caseHold(rec, 'C2-SLA-CROSS-READER-REFUSED',
          `\`--op bug-read\` 拒了夹具台账（${label} · exit=${res.exit_code} · code=${res?.json?.error?.code ?? '(无)'}）—— 这一腿记 HOLD，不记绿。`)
        return
      }
      const sla = res.json?.sla ?? null
      if (sla === null || typeof sla !== 'object') {
        push('C2-SLA-CROSS-READER', `${label}：\`bug-read\` 的信封里没有 \`sla\` 段（实得 ${JSON.stringify(sla)}）—— 契约 §3.7.1 点名它由 \`bug-read\` 给`)
        return
      }
      if (sla.cycle !== s.day) {
        push('C2-SLA-CROSS-READER',
          `${label}：\`bug-read.sla.cycle\` = ${JSON.stringify(sla.cycle)}，卡上的周期号（\`--day\`）= ${JSON.stringify(s.day)} —— `
          + '周期号是 `--day` 同一个键（04:00 切），两个读者要同值')
      }
      // 卡上那一格自己的读数：`超期 N 条 · 最老 M 天 · 周期 <day>`
      const reading = slaCell === null ? '' : String(slaCell.reading ?? '')
      const mOver = /超期\s*(\d+)\s*条/.exec(reading)
      const mOldest = /最老\s*(\d+)\s*天/.exec(reading)
      const overIds = Array.isArray(sla.over) ? sla.over : []
      if (mOver === null || Number(mOver[1]) !== overIds.length) {
        push('C2-SLA-CROSS-READER',
          `${label}：卡上 \`sla\` 格说 \`超期 ${mOver === null ? '(读不出)' : mOver[1]} 条\`，\`bug-read.sla.over\` 有 ${overIds.length} 条`
          + `（${JSON.stringify(overIds)}；reading=${JSON.stringify(reading)})—— 两个读者必须同值`)
      }
      const oldestAge = typeof sla.oldest_age === 'number' ? sla.oldest_age : Number(sla.oldest_age)
      if (mOldest === null || Number(mOldest[1]) !== oldestAge) {
        push('C2-SLA-CROSS-READER',
          `${label}：卡上 \`sla\` 格说 \`最老 ${mOldest === null ? '(读不出)' : mOldest[1]} 天\`，\`bug-read.sla.oldest_age\` = ${JSON.stringify(sla.oldest_age)}`
          + `（reading=${JSON.stringify(reading)}）`)
      }
      // `SLA_OVER_CYCLE` 的 detail 必须点名 `over` 里那几个 id（红了却说不出是哪只 = 没红）。
      if (overIds.length > 0) {
        const detail = redDetails(cells, 'SLA_OVER_CYCLE').join(' ')
        const missing = overIds.filter((id) => !detail.includes(String(id)))
        if (missing.length > 0) {
          push('C2-SLA-REASON-UNNAMED',
            `${label}：\`bug-read.sla.over\` 里的 ${JSON.stringify(missing)} 没有出现在 \`SLA_OVER_CYCLE\` 的 detail 里（detail=${JSON.stringify(detail)}）`)
        }
      }
      // 反方向：`over` 空而卡上那格是红的 ⇒ 也是"两条路不同值"。
      if (overIds.length === 0 && slaCell !== null && slaCell.state === 'red') {
        push('C2-SLA-CROSS-READER',
          `${label}：卡上 \`sla\` 格是红的，\`bug-read.sla.over\` 却是空的 —— 两条路各说各的`)
      }
    }
    {
      const unknown = scene('CARD-05', 'sla-unknown-assessment', {
        route: routeLedger({ tickets: [] }),
        bug: bugLedger({
          entries: [
            bugEntry(SLA_UNKNOWN_ID, {
              opened_at: `${DAY_PREV}T09:00:00+08:00`,
              registered_at: `${DAY_PREV}T09:00:00+08:00`,
              assessment: { verdict: 'unknown', by_role: 'test', at: `${NOW_PREV}` },
            }),
          ],
        }),
        local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
        identity: {},
        reviews: {},
        legacy: { remaining: 0 },
      })
      if (unknown.run.exit_code !== 0) {
        push('C2-GENERATOR-FAILED', `sla 判不了现场：生成器 exit=${unknown.run.exit_code}`)
      } else if (unknown.card.sheet !== null) {
        const cells = unknown.card.cells
        const cell = cellOf(cells['statusbar'], 'sla')
        readings.sla_unknown_assessment = { cell, reasons: cells['card.reasons'], card_red: cells['card.red'] }
        if (cell === null || cell.state !== 'red') {
          push('C2-SLA-UNKNOWN-ASSESSMENT-GREEN',
            `一只 bug 的 \`opened_at\` 是 ${DAY_PREV}、它的 \`assessment\` 是 \`{"verdict":"unknown"}\`（**判不了**）⇒ 格 \`sla\` 必须 \`red\`，`
            + `实得 ${JSON.stringify(cell)} —— 契约 §3.7.1：\`verdict:'unknown'\` **不是**"已评估"，它保留 open、照样算超期。`
            + '把"判不了"读成"处理过了"，真超期的 bug 会静默变绿（`gate4-C2` F-01）')
        }
        if (!hasRed(cells, 'SLA_OVER_CYCLE')) {
          push('C2-SLA-REASON',
            `判不了的那只 bug 在 \`card.reasons\` 里没有 \`SLA_OVER_CYCLE\`（实得 ${JSON.stringify(cells['card.reasons'])}）`)
        }
        const named = redDetails(cells, 'SLA_OVER_CYCLE').join(' ')
        if (!named.includes(SLA_UNKNOWN_ID)) {
          push('C2-SLA-REASON-UNNAMED',
            `\`SLA_OVER_CYCLE\` 的 detail 没点名那只 bug（\`${SLA_UNKNOWN_ID}\`；detail 实得 ${JSON.stringify(named)}）—— `
            + '红了不说哪一只，等于没红（契约 §5 末条）')
        }
        // 🔴 F-03：跨读者（同一个注入时钟）
        slaCrossReader('E2c/sla-cross-reader', unknown, cell, cells)
      }
    }

    // ── E3 · carrier_missing：评审报告不在 ⇒ 红 ─────────────────────────
    {
      const miss = scene('CARD-05', 'carrier-missing', {
        route: routeLedger({ tickets: [] }),
        bug: bugLedger({ entries: [] }),
        local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
        identity: {},
        reviews: { technical: true, conversation: false },
        legacy: { remaining: 0 },
      })
      if (miss.run.exit_code !== 0) {
        push('C2-GENERATOR-FAILED', `carrier 缺现场：生成器 exit=${miss.run.exit_code}`)
      } else if (miss.card.sheet !== null) {
        const cell = cellOf(miss.card.cells['statusbar'], 'carrier_missing')
        readings.carrier_missing = { cell, reasons: miss.card.cells['card.reasons'], card_red: miss.card.cells['card.red'] }
        if (cell === null || cell.state !== 'red') {
          push('C2-CARRIER-MISSING-GREEN',
            `\`.team/retro/${DAY}/会话评审.md\` 不在 ⇒ 格 \`carrier_missing\` 必须 \`red\`，实得 ${JSON.stringify(cell)} `
            + '—— 契约 §4.2 #5（producer `review.carrier`：查两份评审报告文件在不在）')
        }
      }
    }

    // ── E4 · legacy_sessions：legacy 票店没迁空 ⇒ 红 ────────────────────
    {
      const dirty = scene('CARD-05', 'legacy-remaining', {
        route: routeLedger({ tickets: [] }),
        bug: bugLedger({ entries: [] }),
        local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
        identity: {},
        reviews: {},
        legacy: { remaining: 2 },
      })
      if (dirty.run.exit_code !== 0) {
        push('C2-GENERATOR-FAILED', `legacy 没迁空现场：生成器 exit=${dirty.run.exit_code}`)
      } else if (dirty.card.sheet !== null) {
        const cell = cellOf(dirty.card.cells['statusbar'], 'legacy_sessions')
        readings.legacy_remaining = { cell, reasons: dirty.card.cells['card.reasons'] }
        if (cell === null || cell.state !== 'red') {
          push('C2-LEGACY-REMAINING-GREEN',
            `legacy 票店里还剩 2 张（迁移没做完）⇒ 格 \`legacy_sessions\` 必须 \`red\`，实得 ${JSON.stringify(cell)} `
            + '—— 契约 §4.2 #9（producer `route.legacy`：C1a 之后应当是 0）')
        }
      }
    }

    // ── E5 · unknown_preset / preset_downgrade：identity 文件里有报警 ⇒ 红 ─
    {
      const alert = scene('CARD-05', 'identity-alert', {
        route: routeLedger({ tickets: [] }),
        bug: bugLedger({ entries: [] }),
        local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
        identity: { unknownPreset: ['preset-mystery'], presetDowngrade: ['member:legacy'] },
        reviews: {},
        legacy: { remaining: 0 },
      })
      if (alert.run.exit_code !== 0) {
        push('C2-GENERATOR-FAILED', `identity 报警现场：生成器 exit=${alert.run.exit_code}`)
      } else if (alert.card.sheet !== null) {
        const bar2 = alert.card.cells['statusbar']
        readings.identity_alert = { unknown_preset: cellOf(bar2, 'unknown_preset'), preset_downgrade: cellOf(bar2, 'preset_downgrade') }
        for (const key of ['unknown_preset', 'preset_downgrade']) {
          const cell = cellOf(bar2, key)
          if (cell === null || cell.state !== 'red') {
            push('C2-IDENTITY-ALERT-GREEN',
              `\`.team/state/identity/${DAY}.json\` 里 \`${key}\` 那一格写着一条报警 ⇒ 状态条 \`${key}\` 必须 \`red\`，`
              + `实得 ${JSON.stringify(cell)} —— 契约 §4.2 #7/#8（producer \`identity.<day>.json\`）`)
          }
        }
      }
    }

    // ══ F · 槽谓词：一份权威、四态、两格的红/黄都真跑（`gate4-C2` F-02 / F-07）════════
    /**
     * `slot_not_enforced` / `stale_slot` 两格的事实源是**同一个谓词**：
     * 权威 = 现役 `presets/agenia/lib/route.mjs::slotBusy()`；卡侧 = `daily-cards.py::slot_state_of()`。
     * 这一段的判据有三层：
     *   ① **同值**（F-02）：同一份 `tasks[]` 喂两份实现，`state` / `allow` / `holders` 逐项相同。
     *      词表抄错（`implement` / `bug-repair` 不在集合里）时，这一层**当场翻面**。
     *   ② **两格的红**（F-07）：两个活持有者 ⇒ `SLOT_NOT_ENFORCED`；`crash` 心跳 ⇒ `STALE_SLOT`；
     *      两样同时在 ⇒ 两格都红、两条码都在。
     *   ③ **两格的黄**（§4.1 第 3 条）：心跳缺（判不了）⇒ 两格黄 + `degraded_by`，**不许装绿**。
     */
    const routeLib = await loadLiveModule(path.join('lib', 'route.mjs'), ['slotBusy', 'SLOT_STALE_MS', 'ROUTE_TASK_KINDS', 'DAY_CUT_HOURS', 'dayKeyOf'])
    readings.slot_authority = {
      file: routeLib.abs ?? null,
      surface_missing: routeLib.surfaceMissing,
      missing: routeLib.missing,
      error: routeLib.error,
      task_kinds: routeLib.mod?.ROUTE_TASK_KINDS ?? null,
      stale_ms: routeLib.mod?.SLOT_STALE_MS ?? null,
    }
    if (routeLib.surfaceMissing || routeLib.mod === null || typeof routeLib.mod.slotBusy !== 'function') {
      push('C2-SLOT-AUTHORITY-MISSING',
        `现役 \`presets/agenia/lib/route.mjs\` 读不到 \`slotBusy\`（${routeLib.error ?? '缺面'}）—— `
        + '槽两格的权威就是它（契约 §4.3）；读不到 ⇒ 这两格判不了')
    } else {
      /** 一条工作写任务（槽谓词只读这几个字段；其余键与路线任务的形状一致）。 */
      const slotTask = (id, over = {}) => ({
        id,
        title: `${id} 的题面（夹具）`,
        status: 'in_progress',
        kind: 'implement',
        stage: 'stage-build',
        ticket_id: null,
        session_ref: 'sess-c2-slot',
        session_exit: null,
        heartbeat: `${DAY}T09:55:00+08:00`,
        fence: null,
        created_at: `${DAY}T09:00:00+08:00`,
        last_update: `${DAY}T09:50:00+08:00`,
        ...over,
      })
      const matrix = [
        { tag: '空槽', tasks: [] },
        { tag: 'implement 活', tasks: [slotTask('task-slot-1', { kind: 'implement' })] },
        { tag: 'implement+bug-repair 活', tasks: [slotTask('task-slot-1', { kind: 'implement' }), slotTask('task-slot-2', { kind: 'bug-repair', session_ref: 'sess-c2-slot-2' })] },
        { tag: 'crash 心跳', tasks: [slotTask('task-slot-3', { kind: 'implement', heartbeat: `${DAY}T08:00:00+08:00` })] },
        /**
         * 🔴 **30 分钟边界两行**（`SLOT_STALE_MS = 30 * 60 * 1000`，权威 = `lib/route.mjs:71`，
         * 判据是**严格大于**）。注入时钟 = `NOW`（`${DAY}T10:00:00+08:00`）：
         *   · `29:59` ⇒ `NOW − 29:59` = `09:30:01` ⇒ **还活着**（busy）；
         *   · `30:01` ⇒ `NOW − 30:01` = `09:29:59` ⇒ **崩了**（crash）。
         * 为什么非要有这两行：`crash 心跳` 那一行是 2 小时前 —— 阈值漂成 60 分钟它也照样 crash，
         * **抓不到漂移**。而 30:01 这行在 60 分钟阈值下会变 busy、29:59 这行在 15 分钟阈值下会变 crash。
         */
        { tag: '心跳 29:59（阈值内）', tasks: [slotTask('task-slot-29-59', { kind: 'implement', heartbeat: `${DAY}T09:30:01+08:00` })] },
        { tag: '心跳 30:01（阈值外）', tasks: [slotTask('task-slot-30-01', { kind: 'implement', heartbeat: `${DAY}T09:29:59+08:00` })] },
        { tag: '心跳缺', tasks: [slotTask('task-slot-4', { kind: 'implement', heartbeat: null })] },
        { tag: 'ref 空', tasks: [slotTask('task-slot-5', { session_ref: '' })] },
        { tag: '只读工作', tasks: [slotTask('task-slot-6', { kind: 'read-only' })] },
        { tag: 'fence', tasks: [slotTask('task-slot-7', { fence: 2 })] },
        { tag: 'paused+活会话', tasks: [slotTask('task-slot-8', { status: 'paused' })] },
      ]
      const rows = []
      for (const row of matrix) {
        const js = routeLib.mod.slotBusy({ tasks: row.tasks, now: NOW, requester_task_id: null })
        const py = pythonMirror('slot', { tasks: row.tasks, nowIso: NOW })
        const pyValue = py.ok ? py.value : null
        rows.push({
          tag: row.tag,
          js: { state: js.state, allow: js.allow, free: js.free, code: js.code, holders: js.holders },
          py: pyValue === null ? { error: py.error } : { state: pyValue.state, allow: pyValue.allow, free: pyValue.free, code: pyValue.code, holders: pyValue.holders },
          equal: pyValue !== null
            && js.state === pyValue.state
            && js.allow === pyValue.allow
            && JSON.stringify(js.holders) === JSON.stringify(pyValue.holders),
        })
      }
      readings.slot_cross_value = rows
      for (const row of rows) {
        if (row.equal) continue
        push('C2-SLOT-CROSS-VALUE',
          `槽谓词的两份实现不同值（${row.tag}）：\`slotBusy()\`（现役 \`lib/route.mjs\`）= ${JSON.stringify(row.js)}，`
          + `\`slot_state_of()\`（\`daily-cards.py\`）= ${JSON.stringify(row.py)} —— `
          + '契约 §4.3：词表只有一份权威（`implement` / `ticket-repair` / `bug-repair`），镜像**不许手抄**；'
          + '两边分叉时，一个合法的在途任务会被当成"不占槽"（假绿）或反过来（假红）')
      }
      // 词表本身逐字（F-02 的"权威"那一行）
      const kinds = routeLib.mod.ROUTE_TASK_KINDS
      if (JSON.stringify(kinds) !== JSON.stringify(['implement', 'ticket-repair', 'bug-repair'])) {
        push('C2-SLOT-TASK-KINDS',
          `现役 \`ROUTE_TASK_KINDS\` 与契约 §4.3 的权威值不同：期望 \`['implement','ticket-repair','bug-repair']\`，实得 ${JSON.stringify(kinds)}`)
      }
      /**
       * 🔴 **30 分钟常量：两个字面值对一次**（`SLOT_STALE_MS`）。
       * Python 那份（`.tools/daily-cards.py` 的 `SLOT_STALE_MS = 30 * 60 * 1000`）是**手抄**的；
       * 只靠"心跳停了 2 小时"那种远场现场，30→60 的漂移**两边都还是 crash**，看不出来。
       * ⇒ 这里把 JS 导出的常量与 Python 源码里的字面值摊在同一份读数里：不等就红。
       * （行为侧的证人是下面那两个边界现场：`29:59` 还活着 / `30:01` 崩了。）
       */
      {
        const pyPath = path.join(PATHS.repo, '.tools', 'daily-cards.py')
        const pySource = readFileSync(pyPath, 'utf8')
        const m = /^SLOT_STALE_MS\s*=\s*([0-9_* \t()]+)$/m.exec(pySource)
        const literal = m === null ? null : m[1].trim()
        /** `30 * 60 * 1000` 这种乘积式：按 `*` 拆开相乘（数字里的下划线归一）。 */
        const valueOfProduct = (text) => {
          if (text === null) return null
          const parts = text.replace(/[()]/g, '').split('*').map((p) => p.trim().replace(/_/g, ''))
          if (parts.length === 0 || parts.some((p) => !/^\d+$/.test(p))) return null
          return parts.reduce((a, p) => a * Number(p), 1)
        }
        const pyValue = valueOfProduct(literal)
        readings.slot_stale_constant = {
          file: pyPath,
          python_literal: literal,
          python_value: pyValue,
          js_export: routeLib.mod.SLOT_STALE_MS ?? null,
          expect: 30 * 60 * 1000,
        }
        if (pyValue === null) {
          push('C2-SLOT-STALE-CONSTANT',
            `\`.tools/daily-cards.py\` 里找不到可解析的 \`SLOT_STALE_MS = …\`（实得 ${JSON.stringify(literal)}）—— `
            + '卡侧那份阈值是手抄的；找不到它，"两边的 30 分钟"就没有对账点')
        } else if (pyValue !== 30 * 60 * 1000) {
          push('C2-SLOT-STALE-CONSTANT',
            `Python 那份 \`SLOT_STALE_MS\` = ${literal}（= ${pyValue} ms），权威值是 **30 分钟 = 1800000 ms** —— `
            + '漂成别的分钟数之后，`stale_slot` 的红/绿会整段挪位（下面 29:59 / 30:01 两个现场就是它的证人）')
        } else if (routeLib.mod.SLOT_STALE_MS !== pyValue) {
          push('C2-SLOT-STALE-CONSTANT',
            `两边阈值不同值：\`lib/route.mjs\` 导出 ${JSON.stringify(routeLib.mod.SLOT_STALE_MS)}，`
            + `\`daily-cards.py\` 写着 ${JSON.stringify(pyValue)} —— 同一件事两个数（\`mig-rules-18\`）`)
        }
      }
    }

    /** 槽两格的现场检查：喂 `routeTasks` + `bugTasks`，看两格状态 / 读数 / 红因码。 */
    const slotScene = (tag, { routeTasks = [], bugTasks = [] } = {}) => {
      const s = scene('CARD-05', tag, {
        route: routeLedger({ tickets: [], tasks: routeTasks }),
        bug: bugLedger({ entries: [], tasks: bugTasks }),
        local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
        identity: {},
        reviews: {},
        legacy: { remaining: 0 },
      })
      if (s.run.exit_code !== 0 || s.card.sheet === null) return null
      const cells = s.card.cells
      const out = {
        not_enforced: cellOf(cells['statusbar'], 'slot_not_enforced'),
        stale: cellOf(cells['statusbar'], 'stale_slot'),
        reasons: cells['card.reasons'],
        card_red: cells['card.red'],
      }
      readings[`F/${tag}`] = out
      return out
    }

    {
      // F-02 / F-07 ①：`implement` 与 `bug-repair` 两个**活**持有者（两本账各一个）⇒
      // `slot_not_enforced` 必须红，且 `card.reasons` 里有 `SLOT_NOT_ENFORCED` 点名两个 id。
      const two = slotScene('slot-two-live', {
        routeTasks: [{ id: 'task-slot-implement', title: '实现（夹具）', status: 'in_progress', kind: 'implement', stage: 'stage-build', ticket_id: null, session_ref: 'sess-a', session_exit: null, heartbeat: `${DAY}T09:55:00+08:00`, fence: null, created_at: `${DAY}T09:00:00+08:00`, last_update: `${DAY}T09:50:00+08:00` }],
        bugTasks: [{ id: 'task-slot-bugrepair', kind: 'bug-repair', status: 'in_progress', session_ref: 'sess-b', session_exit: null, heartbeat: `${DAY}T09:56:00+08:00`, fence: null }],
      })
      if (two === null) {
        push('C2-GENERATOR-FAILED', '槽：两个活持有者现场 —— 生成器没出卡（这一格值不了）')
      } else {
        if (two.not_enforced === null || two.not_enforced.state !== 'red') {
          push('C2-SLOT-NOT-ENFORCED-GREEN',
            `路线账上一条 \`implement\` 在途 + bug 账上一条 \`bug-repair\` 在途（两个活持有者）⇒ 格 \`slot_not_enforced\` 必须 \`red\`，`
            + `实得 ${JSON.stringify(two.not_enforced)} —— 契约 §4.3 / §4.2 #10：单写者 ⇒ 同时最多一个工作写；两个 = 门禁没执行`)
        }
        if (!hasRed({ 'card.reasons': two.reasons }, 'SLOT_NOT_ENFORCED')) {
          push('C2-SLOT-REASON-MISSING',
            `两个活持有者 ⇒ \`card.reasons\` 里没有 \`SLOT_NOT_ENFORCED\`（实得 ${JSON.stringify(two.reasons)}）—— `
            + '契约 §5 末条：红了不点名 ⇒ 与没红等价（F-07 的核心）')
        }
        const slotDetail = redDetails({ 'card.reasons': two.reasons }, 'SLOT_NOT_ENFORCED').join(' ')
        for (const id of ['task-slot-implement', 'task-slot-bugrepair']) {
          if (!slotDetail.includes(id)) {
            push('C2-SLOT-REASON-UNNAMED',
              `\`SLOT_NOT_ENFORCED\` 的 detail 没点名持有者 \`${id}\`（detail=${JSON.stringify(slotDetail)}）—— 读的人不知道去停谁`)
          }
        }
        if (two.stale !== null && two.stale.state === 'red') {
          push('C2-SLOT-STALE-FALSE-RED',
            `两个活持有者、没有 crash ⇒ 格 \`stale_slot\` 应当 \`green\`（这一格只认 \`state:'crash'\` 的持有者），实得 ${JSON.stringify(two.stale)}`)
        }
        if (two.card_red !== true) {
          push('C2-SLOT-CARD-RED', `两个活持有者 ⇒ 卡必须红（\`card.red:true\`），实得 ${JSON.stringify(two.card_red)}`)
        }
      }
    }
    {
      // F-07 ②：`crash` 心跳（停了 2 小时）⇒ `stale_slot` 红 + `STALE_SLOT` 点名；
      // 而 `slot_not_enforced` 必须**绿**：一次带码的拒绝不是"门禁没执行"（两格不是同一条判据）。
      const crash = slotScene('slot-crash', {
        routeTasks: [{ id: 'task-slot-crash', title: '崩掉的实现（夹具）', status: 'in_progress', kind: 'implement', stage: 'stage-build', ticket_id: null, session_ref: 'sess-c', session_exit: null, heartbeat: `${DAY}T08:00:00+08:00`, fence: null, created_at: `${DAY}T09:00:00+08:00`, last_update: `${DAY}T09:50:00+08:00` }],
      })
      if (crash === null) {
        push('C2-GENERATOR-FAILED', '槽：crash 心跳现场 —— 生成器没出卡')
      } else {
        if (crash.stale === null || crash.stale.state !== 'red') {
          push('C2-SLOT-STALE-GREEN',
            `一条在途任务的 \`heartbeat\` 停在 2 小时前（> 30 分钟）⇒ 格 \`stale_slot\` 必须 \`red\`（§4.2 #11：有 \`state:'crash'\` 的持有者），`
            + `实得 ${JSON.stringify(crash.stale)}`)
        }
        if (!hasRed({ 'card.reasons': crash.reasons }, 'STALE_SLOT')) {
          push('C2-SLOT-REASON-MISSING',
            `crash 持有者 ⇒ \`card.reasons\` 里没有 \`STALE_SLOT\`（实得 ${JSON.stringify(crash.reasons)}）`)
        }
        const staleDetail = redDetails({ 'card.reasons': crash.reasons }, 'STALE_SLOT').join(' ')
        if (!staleDetail.includes('task-slot-crash')) {
          push('C2-SLOT-REASON-UNNAMED', `\`STALE_SLOT\` 的 detail 没点名那个 crash 持有者（detail=${JSON.stringify(staleDetail)}）`)
        }
        if (crash.not_enforced !== null && crash.not_enforced.state === 'red') {
          push('C2-SLOT-NOT-ENFORCED-FALSE-RED',
            `只有一条 crash 持有者（拒绝是带码的）⇒ 格 \`slot_not_enforced\` 应当 \`green\`（§4.2 #10 只认"门禁没执行 / 拒了却没码"），`
            + `实得 ${JSON.stringify(crash.not_enforced)} —— 两格混成一个，F-07 就只剩一格`)
        }
      }
    }
    {
      // F-07 ③：两样同时在（一个 crash + 两个活）⇒ **两格都红、两条码都在**。
      const both = slotScene('slot-both', {
        routeTasks: [
          { id: 'task-slot-live-a', title: '实现 A（夹具）', status: 'in_progress', kind: 'implement', stage: 'stage-build', ticket_id: null, session_ref: 'sess-l1', session_exit: null, heartbeat: `${DAY}T09:55:00+08:00`, fence: null, created_at: `${DAY}T09:00:00+08:00`, last_update: `${DAY}T09:50:00+08:00` },
          { id: 'task-slot-live-b', title: '实现 B（夹具）', status: 'in_progress', kind: 'ticket-repair', stage: 'stage-build', ticket_id: null, session_ref: 'sess-l2', session_exit: null, heartbeat: `${DAY}T09:56:00+08:00`, fence: null, created_at: `${DAY}T09:00:00+08:00`, last_update: `${DAY}T09:50:00+08:00` },
          { id: 'task-slot-dead', title: '崩掉的（夹具）', status: 'in_progress', kind: 'bug-repair', stage: 'stage-build', ticket_id: null, session_ref: 'sess-d', session_exit: null, heartbeat: `${DAY}T07:30:00+08:00`, fence: null, created_at: `${DAY}T09:00:00+08:00`, last_update: `${DAY}T09:50:00+08:00` },
        ],
      })
      if (both === null) {
        push('C2-GENERATOR-FAILED', '槽：两样同时在现场 —— 生成器没出卡')
      } else {
        if (both.not_enforced === null || both.not_enforced.state !== 'red') {
          push('C2-SLOT-NOT-ENFORCED-GREEN', `两个活 + 一个 crash ⇒ \`slot_not_enforced\` 必须 \`red\`，实得 ${JSON.stringify(both.not_enforced)}`)
        }
        if (both.stale === null || both.stale.state !== 'red') {
          push('C2-SLOT-STALE-GREEN', `一个 crash 持有者 ⇒ \`stale_slot\` 必须 \`red\`，实得 ${JSON.stringify(both.stale)}`)
        }
        for (const code of ['SLOT_NOT_ENFORCED', 'STALE_SLOT']) {
          if (!hasRed({ 'card.reasons': both.reasons }, code)) {
            push('C2-SLOT-REASON-MISSING', `两样同时在 ⇒ \`card.reasons\` 里没有 \`${code}\`（实得 ${JSON.stringify(both.reasons)}）`)
          }
        }
      }
    }
    /**
     * 🔴 **30 分钟边界**（`SLOT_STALE_MS`，权威 `lib/route.mjs:71`，判据**严格大于**）——
     * 卡侧的两个现场，**同一个注入时钟** `NOW = ${DAY}T10:00:00+08:00`：
     *   · `29:59`（心跳 `09:30:01`）⇒ 还活着：`stale_slot` **绿**、没有 `STALE_SLOT`；
     *   · `30:01`（心跳 `09:29:59`）⇒ 崩了：`stale_slot` **红** + `STALE_SLOT` **点名**那条任务。
     * 为什么这两格非有不可："心跳停了 2 小时"那一格在阈值漂成 60 分钟时**照样红**，
     * 所以它对"30→60"这种漂移**没有牙**；而这一对现场在 60 分钟下会翻绿、在 15 分钟下会翻红。
     */
    const BOUNDARY = {
      inside: { tag: 'slot-boundary-29-59', id: 'task-slot-inside', heartbeat: `${DAY}T09:30:01+08:00` },
      outside: { tag: 'slot-boundary-30-01', id: 'task-slot-outside', heartbeat: `${DAY}T09:29:59+08:00` },
    }
    const boundaryScene = (spec) => slotScene(spec.tag, {
      routeTasks: [{
        id: spec.id, title: `${spec.id}（边界夹具）`, status: 'in_progress', kind: 'implement',
        stage: 'stage-build', ticket_id: null, session_ref: 'sess-boundary', session_exit: null,
        heartbeat: spec.heartbeat, fence: null,
        created_at: `${DAY}T09:00:00+08:00`, last_update: `${DAY}T09:50:00+08:00`,
      }],
    })
    {
      const inside = boundaryScene(BOUNDARY.inside)
      const outside = boundaryScene(BOUNDARY.outside)
      readings.slot_boundary = { inside, outside, clock: NOW }
      if (inside === null || outside === null) {
        push('C2-GENERATOR-FAILED', '槽：30 分钟边界现场 —— 生成器没出卡（这一格值不了）')
      } else {
        // ① 29:59 ⇒ 还活着（**不红**），且不许拿 unknown/黄糊过去。
        if (inside.stale === null || inside.stale.state !== 'green') {
          push('C2-SLOT-BOUNDARY-INSIDE',
            `心跳停在 **29:59**（阈值 30 分钟之内，注入时钟 ${NOW}）⇒ 格 \`stale_slot\` 必须 \`green\`，`
            + `实得 ${JSON.stringify(inside.stale)} —— 阈值是**严格大于** 30 分钟（` + '`lib/route.mjs:71` 的注释原文：「整 30 分钟仍算忙」）')
        }
        if (hasRed({ 'card.reasons': inside.reasons }, 'STALE_SLOT')) {
          push('C2-SLOT-BOUNDARY-INSIDE',
            `心跳停在 29:59 却报了 \`STALE_SLOT\`（reasons=${JSON.stringify(inside.reasons)}）—— 阈值被缩短了（< 30 分钟）`)
        }
        // ② 30:01 ⇒ 崩了（**红** + 点名）。
        if (outside.stale === null || outside.stale.state !== 'red') {
          push('C2-SLOT-BOUNDARY-OUTSIDE',
            `心跳停在 **30:01**（超过阈值 30 分钟，注入时钟 ${NOW}）⇒ 格 \`stale_slot\` 必须 \`red\`，`
            + `实得 ${JSON.stringify(outside.stale)} —— 阈值被拉长了（> 30 分钟）时这一格会假绿，`
            + '而"2 小时前"那种远场现场照样红 ⇒ 抓不到这种漂移')
        }
        if (!hasRed({ 'card.reasons': outside.reasons }, 'STALE_SLOT')) {
          push('C2-SLOT-BOUNDARY-OUTSIDE',
            `心跳停在 30:01 ⇒ \`card.reasons\` 里没有 \`STALE_SLOT\`（实得 ${JSON.stringify(outside.reasons)}）—— `
            + '红了不点名与没红等价（契约 §5 末条）')
        }
        const outsideDetail = redDetails({ 'card.reasons': outside.reasons }, 'STALE_SLOT').join(' ')
        if (!outsideDetail.includes(BOUNDARY.outside.id)) {
          push('C2-SLOT-BOUNDARY-OUTSIDE',
            `\`STALE_SLOT\` 的 detail 没点名那条刚好越线的任务（detail=${JSON.stringify(outsideDetail)}；期望含 \`${BOUNDARY.outside.id}\`）`)
        }
        // ③ 两格**必须不同结论** —— 一条边界把红/绿切开；两边相同 ⇒ 判据没在量边界。
        if (inside.stale !== null && outside.stale !== null && inside.stale.state === outside.stale.state) {
          push('C2-SLOT-BOUNDARY-NO-EDGE',
            `29:59 与 30:01 两个现场的 \`stale_slot\` 是**同一个结论**（都 ${JSON.stringify(inside.stale.state)}）—— `
            + '30 分钟这条边界没有把红/绿切开：要么阈值不是 30 分钟，要么这一格没在读心跳')
        }
        // ④ `slot_not_enforced` 不该被边界带红：单一持有者、拒绝带码 ⇒ 那不是"门禁没执行"。
        for (const [label, s] of [['29:59', inside], ['30:01', outside]]) {
          if (s.not_enforced !== null && s.not_enforced.state === 'red') {
            push('C2-SLOT-BOUNDARY-NOT-ENFORCED',
              `心跳 ${label} 的单一持有者现场 ⇒ \`slot_not_enforced\` 不该红（一条带码的拒绝不是"门禁没执行"），实得 ${JSON.stringify(s.not_enforced)}`)
          }
        }
      }
    }
    {
      // F-07 ④：心跳**缺**（判不了）⇒ 两格黄 + `degraded_by`（§4.1 第 3 条），**不许装绿**。
      const unknown = slotScene('slot-unknown', {
        routeTasks: [{ id: 'task-slot-unknown', title: '心跳缺（夹具）', status: 'in_progress', kind: 'implement', stage: 'stage-build', ticket_id: null, session_ref: 'sess-u', session_exit: null, heartbeat: null, fence: null, created_at: `${DAY}T09:00:00+08:00`, last_update: `${DAY}T09:50:00+08:00` }],
      })
      if (unknown === null) {
        push('C2-GENERATOR-FAILED', '槽：心跳缺现场 —— 生成器没出卡')
      } else {
        for (const [name, cell] of [['slot_not_enforced', unknown.not_enforced], ['stale_slot', unknown.stale]]) {
          if (cell === null) continue
          if (cell.state !== 'yellow') {
            push('C2-SLOT-UNKNOWN-STATE',
              `心跳读不出来 ⇒ 格 \`${name}\` 必须 \`yellow\`（"判不了"是黄，不是绿、也不是红），实得 ${JSON.stringify(cell.state)} —— `
              + '§4.1 第 3 条：只有探针降级（A0b/A0d 不成立）的槽格才显黄/unknown')
          }
          if (!PROBE_IDS.includes(cell.degraded_by ?? null)) {
            push('C2-SLOT-DEGRADED-BY',
              `格 \`${name}\` 显黄却没点名是哪条探针降的级（\`degraded_by\` = ${JSON.stringify(cell.degraded_by)}；应是 ${PROBE_IDS.join(' / ')}）`)
          }
        }
      }
    }

    // ══ G · producer A / B 自己的**写面**（`gate4-C2` F-09）════════════════════════════
    /**
     * 卡侧的"读"由夹具喂饱 ⇒ 读得对**不**证明写得对。这一段直接调两个 producer：
     *   A = `inject.js::recordIdentityAlarm()`（`unknown_preset` / `preset_downgrade` 的写面）
     *   B = `lib/bug-ledger.mjs::slaVerdict()`（`sla` 那一格的写面）
     * 都是**现役树**里那份（与卡的 producer 树同一棵）。
     */
    {
      const inj = await loadLiveModule('inject.js', ['recordIdentityAlarm', 'identityDayKeyOf'])
      readings.producer_a = { file: inj.abs ?? null, surface_missing: inj.surfaceMissing, missing: inj.missing, error: inj.error }
      if (inj.surfaceMissing || inj.mod === null || typeof inj.mod.recordIdentityAlarm !== 'function' || typeof inj.mod.identityDayKeyOf !== 'function') {
        push('C2-PRODUCER-A-MISSING',
          `现役 \`presets/agenia/inject.js\` 里读不到 \`recordIdentityAlarm\` / \`identityDayKeyOf\`（${inj.error ?? '缺面'}）—— `
          + '那是状态条 #7/#8 两格的 producer（契约 §4.2），没有它这两格只能靠夹具手写文件')
      } else {
        const rootsA = makeCardRoots('CARD-05', 'producer-a')
        const wsA = rootsA.ws
        const expectedFile = path.join(wsA, '.team', 'state', 'identity', `${DAY}.json`)
        const record = { session: 'session-c2-producer-a', message: 'preset-mystery', at: NOW }
        const r1 = await inj.mod.recordIdentityAlarm({ cwd: wsA, nowMs: Date.parse(NOW), kind: 'unknown', record })
        const samePath = (a, b) => typeof a === 'string' && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
        const readFileJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
        const after1 = readFileJson(expectedFile)
        readings.producer_a.write = { result: r1, expected: expectedFile, file_exists: statOf(expectedFile).exists, content: after1 }
        if (r1?.ok !== true) {
          push('C2-PRODUCER-A-WRITE', `A：\`recordIdentityAlarm()\` 没写成功（返回 ${JSON.stringify(r1)}）—— 工作区有 \`.team/\`，它应当写`)
        }
        if (!samePath(r1?.path, expectedFile)) {
          push('C2-PRODUCER-A-PATH',
            `A：落点必须是 \`<cwd>/.team/state/identity/<day>.json\`（期望 ${JSON.stringify(expectedFile)}），实得 ${JSON.stringify(r1?.path)} —— `
            + '契约 §4.2 #7/#8 的 producer 路径钉的就是这一个')
        }
        if (!Array.isArray(after1?.unknown_preset) || after1.unknown_preset.length !== 1) {
          push('C2-PRODUCER-A-CONTENT',
            `A：文件里 \`unknown_preset\` 必须恰好 1 条（实得 ${JSON.stringify(after1?.unknown_preset)}；整份 ${JSON.stringify(after1)}）`)
        }
        if (after1?.day !== DAY) {
          push('C2-PRODUCER-A-DAY', `A：文件里的 \`day\` 必须是 \`identityDayKeyOf(nowMs)\` = ${JSON.stringify(DAY)}，实得 ${JSON.stringify(after1?.day)}`)
        }
        // 去重：同一个会话的同一种报警只落一次
        const r2 = await inj.mod.recordIdentityAlarm({ cwd: wsA, nowMs: Date.parse(NOW), kind: 'unknown', record })
        const after2 = readFileJson(expectedFile)
        readings.producer_a.dedupe = { result: r2, count: Array.isArray(after2?.unknown_preset) ? after2.unknown_preset.length : null }
        if (r2?.code !== 'already-recorded') {
          push('C2-PRODUCER-A-DEDUPE',
            `A：同一个会话同一种报警第二次进来应当回 \`already-recorded\`（装配会被反复触发），实得 ${JSON.stringify(r2)}`)
        }
        if (!Array.isArray(after2?.unknown_preset) || after2.unknown_preset.length !== 1) {
          push('C2-PRODUCER-A-DEDUPE',
            `A：第二次报警把条目写重了（\`unknown_preset\` 现在 ${Array.isArray(after2?.unknown_preset) ? after2.unknown_preset.length : '?'} 条）—— 文件里堆同一行比没记录更难读`)
        }
        // 另一种报警写**另一个键**，同一份文件里两格各自一份
        const r3 = await inj.mod.recordIdentityAlarm({
          cwd: wsA, nowMs: Date.parse(NOW), kind: 'downgrade',
          record: { session: 'session-c2-producer-a', message: 'member:legacy', at: NOW },
        })
        const after3 = readFileJson(expectedFile)
        readings.producer_a.downgrade = { result: r3, unknown: after3?.unknown_preset ?? null, downgrade: after3?.preset_downgrade ?? null }
        if (r3?.ok !== true) push('C2-PRODUCER-A-WRITE', `A：\`preset_downgrade\` 那条没写成功（${JSON.stringify(r3)}）`)
        if (!Array.isArray(after3?.preset_downgrade) || after3.preset_downgrade.length !== 1) {
          push('C2-PRODUCER-A-CONTENT', `A：\`preset_downgrade\` 必须恰好 1 条（实得 ${JSON.stringify(after3?.preset_downgrade)}）`)
        }
        if (!Array.isArray(after3?.unknown_preset) || after3.unknown_preset.length !== 1) {
          push('C2-PRODUCER-A-CONTENT',
            `A：写 \`preset_downgrade\` 把同一天的 \`unknown_preset\` 弄丢了（现在 ${JSON.stringify(after3?.unknown_preset)}）—— 同一份文件两格各一份，互不覆盖`)
        }
        // 04:00 切点（天号）：三份副本同值由 DBY-03 判；这里判 A 自己用哪个天号
        const cutBelow = await inj.mod.identityDayKeyOf(Date.parse(`${DAY}T03:59:59+08:00`))
        const cutAbove = await inj.mod.identityDayKeyOf(Date.parse(`${DAY}T04:00:00+08:00`))
        readings.producer_a.day_cut = { at_0359: cutBelow, at_0400: cutAbove }
        if (cutBelow !== DAY_PREV || cutAbove !== DAY) {
          push('C2-PRODUCER-A-DAY-CUT',
            `A：\`identityDayKeyOf\` 的 04:00 切点不对 —— ${DAY}T03:59:59 应当 ${JSON.stringify(DAY_PREV)}（实得 ${JSON.stringify(cutBelow)}）、`
            + `${DAY}T04:00:00 应当 ${JSON.stringify(DAY)}（实得 ${JSON.stringify(cutAbove)}）。凌晨 0–4 点写下的报警会落进另一天的文件，`
            + '卡读到"0 条"而绿')
        }
        // 不是工作区（没有 `.team/`）⇒ 不写、也不报失败
        const notWs = path.join(rootsA.runRoot, 'card-not-a-workspace', 'producer-a')
        const r4 = await inj.mod.recordIdentityAlarm({ cwd: notWs, nowMs: Date.parse(NOW), kind: 'unknown', record })
        readings.producer_a.not_a_workspace = { result: r4, dir_exists: existsSync(notWs) }
        if (r4?.ok !== false || r4?.code !== 'not-a-workspace') {
          push('C2-PRODUCER-A-NOT-WORKSPACE',
            `A：\`cwd\` 不是工作区（没有 \`.team/\`）⇒ 应当不写、返回 \`not-a-workspace\`（不是失败、也不许照写），实得 ${JSON.stringify(r4)}`)
        }
        if (existsSync(path.join(notWs, '.team'))) {
          push('C2-PRODUCER-A-NOT-WORKSPACE', `A：它给一个不是工作区的目录建出了 \`.team/\`（${notWs}）—— 报警的写面不许在工作区之外造抽屉`)
        }
        // 🔴 A 写的文件 → 卡**读得到**（写面与读面接上）：这一格是"producer 真的接线了"的最小证据
        writeMemorySource(wsA)
        writeDataRoot(rootsA.dr, { day: DAY })
        writeRoute(wsA, routeLedger({ tickets: [] }))
        writeLocal(wsA, DAY, localState({ day: DAY, technical: 'done', conversation: 'done' }))
        writeReviewReports(wsA, DAY, {})
        writeLegacyStore(wsA, { remaining: 0 })
        const runA = runCards(rootsA, { day: DAY, nowIso: NOW })
        const cardA = readCard(cardFile(wsA, DAY))
        readings.producer_a.to_card = { exit_code: runA.exit_code, sheet_names: cardA.dump?.sheet_names ?? null, cells: cardA.sheet === null ? null : { unknown_preset: cellOf(cardA.cells['statusbar'], 'unknown_preset'), preset_downgrade: cellOf(cardA.cells['statusbar'], 'preset_downgrade'), reasons: cardA.cells['card.reasons'] } }
        if (runA.exit_code !== 0 || cardA.sheet === null) {
          push('C2-PRODUCER-A-TO-CARD', `A：producer 写完文件之后卡出不来（exit=${runA.exit_code}）—— 接线那一半没量到`)
        } else {
          for (const key of ['unknown_preset', 'preset_downgrade']) {
            const cell = cellOf(cardA.cells['statusbar'], key)
            if (cell === null || cell.state !== 'red') {
              push('C2-PRODUCER-A-TO-CARD',
                `A：producer 写的那份 \`identity/${DAY}.json\` 里 \`${key}\` 有一条 ⇒ 卡上那一格必须 \`red\`，实得 ${JSON.stringify(cell)} —— `
                + '"写面写了、卡读不到"就是"没接线"（`mig-rules-12`）')
            }
          }
        }
      }
    }
    {
      // B · `slaVerdict()`：四个方向（`unknown` 照样超期 / 当天开的不算 / observation 不算 / cycle 缺 ⇒ 判不了）
      const bugLib = await loadLiveModule(path.join('lib', 'bug-ledger.mjs'), ['slaVerdict'])
      readings.producer_b = { file: bugLib.abs ?? null, surface_missing: bugLib.surfaceMissing, missing: bugLib.missing, error: bugLib.error }
      if (bugLib.surfaceMissing || bugLib.mod === null || typeof bugLib.mod.slaVerdict !== 'function') {
        push('C2-PRODUCER-B-MISSING',
          `现役 \`presets/agenia/lib/bug-ledger.mjs\` 里读不到 \`slaVerdict\`（${bugLib.error ?? '缺面'}）—— 它是 \`bug-read.sla\` 的写面`)
      } else {
        const entry = (id, over = {}) => ({ id, kind: 'bug', opened_at: `${DAY_PREV}T09:00:00+08:00`, registered_at: `${DAY_PREV}T09:00:00+08:00`, assessment: null, ...over })
        const ledger = {
          entries: [
            entry('bug-sla-old-null'),
            entry('bug-sla-old-unknown', { assessment: { verdict: 'unknown', by_role: 'test', at: NOW_PREV } }),
            entry('bug-sla-today', { opened_at: `${DAY}T09:00:00+08:00`, registered_at: `${DAY}T09:00:00+08:00` }),
            { id: 'obs-sla-old', kind: 'observation', opened_at: `${DAY_PREV}T09:00:00+08:00`, registered_at: `${DAY_PREV}T09:00:00+08:00`, assessment: null },
            entry('bug-sla-assessed', { assessment: { verdict: 'true', by_role: 'test', at: NOW_PREV } }),
          ],
        }
        const v1 = bugLib.mod.slaVerdict(ledger, { cycle: DAY })
        const v2 = bugLib.mod.slaVerdict(ledger, { cycle: null })
        readings.producer_b.sla = { cycle_day: v1, cycle_null: v2 }
        const wantOver = ['bug-sla-old-null', 'bug-sla-old-unknown']
        if (JSON.stringify(v1?.over ?? null) !== JSON.stringify(wantOver)) {
          push('C2-PRODUCER-B-UNKNOWN',
            `B：\`slaVerdict(cycle=${DAY}).over\` 必须是 ${JSON.stringify(wantOver)}（旧 bug 未评估 + 旧 bug **判不了**；`
            + `当天开的不算、observation 不算、已评估的不算），实得 ${JSON.stringify(v1?.over)} —— `
            + '`assessment.verdict:"unknown"` 不是"已评估"，它保留 open（`gate4-C2` F-01 的写面那一半）')
        }
        if (v1?.oldest_age !== 1) {
          push('C2-PRODUCER-B-AGE', `B：\`oldest_age\` 必须是 1（${DAY_PREV} 开、周期 ${DAY}），实得 ${JSON.stringify(v1?.oldest_age)}`)
        }
        if (v1?.cycle !== DAY) {
          push('C2-PRODUCER-B-CYCLE', `B：\`cycle\` 必须原样回 ${JSON.stringify(DAY)}，实得 ${JSON.stringify(v1?.cycle)}`)
        }
        if (JSON.stringify(v2?.over ?? null) !== JSON.stringify([]) || v2?.cycle !== null) {
          push('C2-PRODUCER-B-NO-CYCLE',
            `B：没有 \`cycle\` ⇒ 这一格**判不了**（\`over: []\` + \`cycle: null\`），不许猜一个周期号；实得 ${JSON.stringify(v2)}`)
        }
      }
    }

    // ══ H · 两把刀：F-01 / F-02 的**翻面**（证明上面那些判据抓得到旧 bug）══════════════
    /**
     * 「修好了」这句话的证据只有一种：**把 bug 放回去，判据要红**。
     *
     * 这一段的刀**切在运行根里的源码副本上**（生产零写入）：把现役两份源码读出来、只改那一行，
     * 落进运行根、import 它，然后把**同一个输入**喂给刀与真实现，断言两者的结论**不同** ——
     * 不同 ⇒ 我那条断言确实盯着那一行（`mig-rules-14`：翻不了面的判据是装饰）。
     *
     * · 刀 1（F-01）：`bug-ledger.mjs::isAssessed()` 里那一条改成"只要 assessment 非 null 就算已评估"
     *   ⇒ `slaVerdict` 必须**丢掉** `verdict:'unknown'` 那只 bug（旧 bug 的行为）。
     * · 刀 2（F-02）：`route.mjs::ROUTE_TASK_KINDS` 换成旧的错词表
     *   ⇒ 一条 `implement` 在途任务被当成"不占槽"（`slotBusy` 说 `exited`），而 Python 那份仍说 `busy`
     *   ⇒ 跨值判据必须**看得出来**。
     */
    {
      const liveBugFile = livePath(path.join('lib', 'bug-ledger.mjs'))
      const liveRouteFile = livePath(path.join('lib', 'route.mjs'))
      const liveRouteSrc = readFileSync(liveRouteFile, 'utf8')
      const knifeDir = path.join(S.roots.runRoot, 'knives')
      const importCopy = async (dir, name, source) => {
        mkdirSync(dir, { recursive: true })
        const file = path.join(dir, name)
        writeFileSync(file, source, 'utf8')
        return import(new URL(`file:///${file.replace(/\\/g, '/')}?t=${Date.now()}-${Math.random().toString(16).slice(2)}`).href)
      }
      readings.knives = {}

      // ── 刀 1（F-01）──────────────────────────────────────────────────────
      const bugSrc = readFileSync(liveBugFile, 'utf8')
      const f01Needle = 'return ASSESSED_VERDICTS.includes(assessment.verdict)'
      const f01Mutant = bugSrc.replace(f01Needle, 'return true')
      const knifeLedger = {
        entries: [
          { id: 'bug-sla-old-null', kind: 'bug', opened_at: `${DAY_PREV}T09:00:00+08:00`, registered_at: `${DAY_PREV}T09:00:00+08:00`, assessment: null },
          { id: 'bug-sla-old-unknown', kind: 'bug', opened_at: `${DAY_PREV}T09:00:00+08:00`, registered_at: `${DAY_PREV}T09:00:00+08:00`, assessment: { verdict: 'unknown', by_role: 'test', at: NOW_PREV } },
        ],
      }
      const liveBugLib = await loadLiveModule(path.join('lib', 'bug-ledger.mjs'), ['slaVerdict'])
      const liveOver = liveBugLib.mod?.slaVerdict?.(knifeLedger, { cycle: DAY })?.over ?? null
      readings.knives.f01 = { needle_found: f01Mutant !== bugSrc, live_over: liveOver }
      if (f01Mutant === bugSrc) {
        push('C2-KNIFE-MISSED',
          `刀 1（F-01）：\`bug-ledger.mjs\` 里找不到那一行 \`${f01Needle}\` —— 刀没切下去，`
          + '"判不了照样超期"这条判据的翻面证据**没量到**（实现换写法了就把这条刀同批挪过去）')
      } else {
        await importCopy(path.join(knifeDir, 'bug-ledger'), 'route.mjs', liveRouteSrc)
        const mutantFile = path.join(knifeDir, 'bug-ledger', 'bug-ledger.mjs')
        writeFileSync(mutantFile, f01Mutant, 'utf8')
        const mutantMod = await import(new URL(`file:///${mutantFile.replace(/\\/g, '/')}?t=${Date.now()}`).href)
        const mutantOver = mutantMod.slaVerdict?.(knifeLedger, { cycle: DAY })?.over ?? null
        readings.knives.f01.mutant_over = mutantOver
        if (mutantOver === null || mutantOver.includes('bug-sla-old-unknown')) {
          push('C2-KNIFE-MISSED',
            `刀 1（F-01）：把 \`isAssessed\` 改回"assessment 非 null 就算已评估"之后，\`slaVerdict\` 仍然把`
            + ` \`verdict:'unknown'\` 那只 bug 算进 \`over\`（实得 ${JSON.stringify(mutantOver)}）—— `
            + '这说明刀切歪了（或判据盯着别的东西），"判不了照样超期"的翻面证据不成立')
        }
        if (JSON.stringify(mutantOver) === JSON.stringify(liveOver)) {
          push('C2-KNIFE-MISSED',
            `刀 1（F-01）：刀与真实现给出同一份 \`over\`（${JSON.stringify(liveOver)}）—— 这条判据在旧 bug 下**不会红**`)
        }
      }

      // ── 刀 2（F-02）──────────────────────────────────────────────────────
      const f02Needle = "export const ROUTE_TASK_KINDS = Object.freeze(['implement', 'ticket-repair', 'bug-repair'])"
      const f02Mutant = liveRouteSrc.replace(f02Needle,
        "export const ROUTE_TASK_KINDS = Object.freeze(['implementation', 'ticket-repair', 'bug-fix', 'review', 'design', 'test', 'docs'])")
      const knifeTasks = [{
        id: 'task-knife-implement', kind: 'implement', status: 'in_progress', session_ref: 'sess-knife',
        session_exit: null, heartbeat: `${DAY}T09:55:00+08:00`, fence: null,
      }]
      readings.knives.f02 = { needle_found: f02Mutant !== liveRouteSrc }
      if (f02Mutant === liveRouteSrc) {
        push('C2-KNIFE-MISSED',
          `刀 2（F-02）：\`route.mjs\` 里找不到 \`${f02Needle}\` —— 刀没切下去，"词表分叉"这条判据的翻面证据没量到`)
      } else {
        const mutantRoute = await importCopy(path.join(knifeDir, 'route-authority'), 'route.mjs', f02Mutant)
        const py = pythonMirror('slot', { tasks: knifeTasks, nowIso: NOW })
        const mutantSlot = typeof mutantRoute.slotBusy === 'function'
          ? mutantRoute.slotBusy({ tasks: knifeTasks, now: NOW, requester_task_id: null })
          : null
        readings.knives.f02.mutant_slot = mutantSlot === null ? null : { state: mutantSlot.state, allow: mutantSlot.allow, holders: mutantSlot.holders }
        readings.knives.f02.python_slot = py.ok ? py.value : { error: py.error }
        if (mutantSlot === null) {
          push('C2-KNIFE-MISSED', '刀 2（F-02）：切过词表的那份 `route.mjs` 没有导出 `slotBusy` —— 刀没量到')
        } else if (py.ok !== true) {
          push('C2-KNIFE-MISSED', `刀 2（F-02）：Python 那一份跑不出来（${py.error}）—— 跨值比较没量到`)
        } else if (mutantSlot.state === py.value.state) {
          push('C2-KNIFE-MISSED',
            `刀 2（F-02）：词表换回旧的错集合之后，\`slotBusy\` 与 Python 的结论**仍然一样**`
            + `（${JSON.stringify(mutantSlot.state)} vs ${JSON.stringify(py.value.state)}）—— `
            + '那说明跨值判据没在看词表那一行，旧的假绿它抓不到')
        }
      }
    }

    rec.readings.card05 = readings
    rec.readings.sheet_name = CARD_SHEET
    // ⚠️ `wired` 今天是常量 `true`（F-13）：这一行是**读数**，不是断言 —— 它明写"这一跑没有一条路径能产出 false"。
    rec.readings.wired_constant_today = true
    caseFail(problems)
  })
})

