/**
 * `CARD-06` · **容量行** + **两段回执（两张卡）** + **卡本身 / 生成失败**。
 *
 * 冻结依据：定形 §2.3 末段（卡 = 三区 + 状态条 + **容量行** + 回执卡；**两期互斥**里那一句
 *   「**容量读记忆库快照，路线账本不存**」）· §4.6（「卡上读容量（来自记忆库快照，路线账本不存）」）·
 *   §6.2「容量」那一行（**卡下方一行另列**；来源 = 记忆库快照；**卡上没有容量读数 ⇒ 红**）·
 *   §6.2「技术评审回执」/「会话评审回执」（**有路线 OR 有任务 ⇒ 每个开工周期一张**；两者都无 / 无活动
 *   ⇒ 不判红；**缺 / 过期（超一个开工周期）⇒ 红**；第二段 = 会话评审）·
 *   §6.2「卡本身」（卡名 = 记忆更新报告；生成器 = 日报卡脚本；as-of 只显示；**生成失败 ⇒ 会话一行红 +
 *   日志 + 失败标记**，**不许拿昨天那张当绿**）· §2.3（**生成失败 ⇒ 会话里一行红 + 日志 + 失败标记（带时点）**）。
 *   契约：`.team/test/CONTRACT-C2.md` §3.6 / §3.7 / §3.8 / §2.4。
 *
 * 🔴 **落点**（组长 2026-11-02 裁定第 5 条）：第一段（技术评审）在**卡 1** 的 `C2 · 验收格`；
 *    第二段（会话评审）在**卡 2**（`技术评审回执-<day>.xlsx`）的 `C2 · 回执格`。
 *    三态（present / missing / expired / na）与"缺 / 过期 ⇒ 红"两条判据**一个字没改**，改的是**去哪张卡读**。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格判六样：
 *   `A` **容量五读数**：`count/chars` = 快照 `totals`；`cap_count/cap_chars` = **夹具 `memory.mjs` 的怪值**
 *       （137 / 12345 ⇒ 写死 200 / 80000 的实现当场翻红）；`source` 必须点名快照、**不许**含 `.team/route`。
 *   `B` **卡本身**：`card.name` 逐字 `记忆更新报告`；`card.generator` 含 `daily-cards.py`；
 *       `card.day` = `--day`；`card.as_of` 是带偏移的 ISO8601（只显示）。
 *   `C` **快照读不到 ⇒ 红，不出 0**（`capacity.state:'red'` + `count:null` + `CAPACITY_UNREADABLE`）。
 *   `C2` **快照读到了、但 `totals` 不是两个整数 ⇒ 同样红、不出 0**（`"73"` / `true` 都算判不了：
 *       `capacity.state:'red'` + `count/chars:null` + `CAPACITY_UNREADABLE` + 正文两个数 `?`）；
 *       阳性对照 = 合法 `totals` ⇒ 绿（同一副夹具，只差 `totals` 这一格）。
 *   `C3` **identity 文件在盘上、但是坏 JSON ⇒ 两格红 + 卡红**（`unknown_preset` / `preset_downgrade`
 *       的 `reading` 必须说"读不出来"，**不许**读成"0 条报警"）；阳性对照 = 合法空对象 ⇒ 两格绿、`0 条`。
 *   `D` **回执三态 · 逐段逐卡**：`present`（本周期 done）/ `missing`（本周期没有）/ `expired`（只有上一周期）/
 *       `na`（无路线、无任务 ⇒ **不判红**）；缺 / 过期 ⇒ **那张卡**的 `receipt.red:true` + 逐段点名；
 *       两张卡的 `receipt.required` 必须同值（同一条事实两个读者）。
 *   `E` **生成失败四件套**：退出码非 0 · **没有卡**（绝不绿兜底）· append-only 的失败标记（带 `at` / `day` /
 *       `code`）· stderr 上一行 `🔴` 带那个 `E_*` 码；**再失败一次 ⇒ 两行**（覆盖写 ⇒ 红）。
 *   `F` **卡不自证**：失败标记里的 `at` 是**注入时钟**那一刻，不是真实此刻。
 *
 * ── 现在为什么红 ─────────────────────────────────────────────────────────
 * 卡上没有容量行、没有回执段、两张卡都没有 `C2 · 验收格` / `C2 · 回执格` 那一页；
 * 失败路径今天**什么也不留**（`daily-cards.py` 的 `raise SystemExit("E_CAP_SOURCE: …")` 只有 stderr）。
 */
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CARD2_KEYS, CARD2_NAME, CARD_KEYS, CARD_NAME, CARD_SHEET, DAY, DAY_PREV, NOW, assertReasonCodes,
  card2File, cardFile, card2SheetMissing, copyCardWithBodyPatch, failureFile, hasRed, judgeRenderAgree,
  keysMissing, localState, makeCardRoots, readCard, readCard2, readFailures, removeSnapshot, renderChecks,
  routeLedger, runCards, scene, setClock, sheetMissing, statOf, writeDataRoot, writeIdentity,
  writeIdentityRaw, writeLegacyStore, writeLocal, writeMemorySource, writeReviewReports, writeRoute,
} from '../support/card-surface.mjs'

before(() => {
  preflight()
})

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/**
 * 卡 1 能不能读：生成器 0 → 页在 → 39 个 key 齐。返回 `true` = 可以判这一格的值。
 * 卡 2 由 `usable2()` 单独判（第二段落在它上面）。
 */
const usable = (readings, problems, push, label, s) => {
  readings[label] = { exit_code: s.run.exit_code, sheet_names: s.card.dump?.sheet_names ?? null, error: s.card.error }
  if (s.run.exit_code !== 0) {
    push('C2-GENERATOR-FAILED', `${label}：生成器 exit=${s.run.exit_code} —— stderr=${String(s.run.stderr).trim().slice(0, 300)}`)
    return false
  }
  if (sheetMissing(s.card, push, label)) return false
  if (keysMissing(s.card, push, label)) return false
  // 🔴 `card.reasons` 的闭集（`gate4-C2` F-05；契约 §5 末条）。
  assertReasonCodes(s.card.cells, push, label)
  return true
}

/**
 * 卡 2 能不能读：生成器 0 → `C2 · 回执格` 在 → 6 个 key 齐。
 * 卡 1 **不**带第二段，所以两段的判据必须分开落：卡 2 的页不在 ⇒ `C2-RECEIPT-SHEET-MISSING`。
 * 🔴 卡 2 也有 `card.reasons`（六格之一）⇒ 闭集判据在两张卡上各跑一次（F-05）。
 */
const usable2 = (readings, push, label, s) => {
  if (s.run.exit_code !== 0) return false
  if (card2SheetMissing(s.card2, push, label)) return false
  if (keysMissing(s.card2, push, label)) return false
  assertReasonCodes(s.card2.cells, push, `${label}/卡2`)
  readings[`${label}/卡2`] = { sheet_names: s.card2.dump?.sheet_names ?? null, cells: s.card2.cells }
  return true
}

test('CARD-06 容量行 + 两段回执（两张卡）+ 卡本身：参考线读 memory.mjs（怪值）· 快照读不到 ⇒ 红 · 回执 4 态 · 生成失败四件套', async () => {
  await runCase('CARD-06', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {}
    // 读数对象先挂上去：后面任何一次早退（页不在 / 生成器炸）都还能在证据里读到已经量到的东西。
    rec.readings.card06 = readings

    /**
     * 🔴 **落点自检**（跑在第一个现场之前 ⇒ 功能没做时**也会**执行）：裁定第 5 条把第二段挪到卡 2。
     * 判据的**结构**今天就能验：`receipt.conversation` 不许在卡 1 的 key 表里、必须在卡 2 的 key 表里；
     * 第一段反过来。两张表的 key 数也要与契约 §2.3 / §2.4 对上 —— 这两条一翻面，"第二段放哪张卡"
     * 就又回到版式里去了（第 4 关以后没人能一眼看出它搬没搬）。
     */
    readings.landing_selfcheck = {
      card1_keys: CARD_KEYS.length,
      card2_keys: CARD2_KEYS.length,
      card1_has_conversation: CARD_KEYS.includes('receipt.conversation'),
      card2_has_conversation: CARD2_KEYS.includes('receipt.conversation'),
      card1_has_technical: CARD_KEYS.includes('receipt.technical'),
      card2_has_technical: CARD2_KEYS.includes('receipt.technical'),
    }
    if (CARD_KEYS.length !== 39) {
      push('C2-RECEIPT-LANDING', `卡 1 的机器读面必须是 **39** 个冻结 key（契约 §2.3），实得 ${CARD_KEYS.length}`)
    }
    if (CARD2_KEYS.length !== 6) {
      push('C2-RECEIPT-LANDING', `卡 2 的机器读面必须是 **6** 个冻结 key（契约 §2.4），实得 ${CARD2_KEYS.length}`)
    }
    if (readings.landing_selfcheck.card1_has_conversation || !readings.landing_selfcheck.card2_has_conversation) {
      push('C2-RECEIPT-LANDING',
        '`receipt.conversation` 的落点不对：它**不许**在卡 1 的 key 表里、**必须**在卡 2 的 key 表里 '
        + '—— 组长 2026-11-02 裁定第 5 条（第二段放第二张卡）；两段挤在一张卡上，第二张卡就没有可读的机器面')
    }
    if (!readings.landing_selfcheck.card1_has_technical || readings.landing_selfcheck.card2_has_technical) {
      push('C2-RECEIPT-LANDING', '`receipt.technical` 的落点不对：它**必须**在卡 1、**不许**跑到卡 2（第一段留在记忆更新报告）')
    }

    // ── A/B · 容量五读数 + 卡本身 + 两段回执都 present（两张卡）──────────
    const A = scene('CARD-06', 'ok', {
      route: routeLedger({ tickets: [] }),
      local: localState({ day: DAY, technical: 'done', conversation: 'done' }),
    })
    if (!usable(readings, problems, push, 'A/正常', A)) { caseFail(problems); return }
    const c = A.card.cells
    readings['A/容量'] = {
      count: c['capacity.count'], chars: c['capacity.chars'], cap_count: c['capacity.cap_count'],
      cap_chars: c['capacity.cap_chars'], source: c['capacity.source'], state: c['capacity.state'],
    }
    readings['A/卡'] = {
      name: c['card.name'], generator: c['card.generator'], day: c['card.day'], as_of: c['card.as_of'],
    }
    readings['A/回执'] = { required: c['receipt.required'], technical: c['receipt.technical'], red: c['receipt.red'] }
    const A2ok = usable2(readings, push, 'A/正常', A)
    const c2 = A2ok ? A.card2.cells : {}
    if (A2ok) {
      readings['A/回执'].conversation = c2['receipt.conversation']
      readings['A/回执'].card2_red = c2['receipt.red']
      readings['A/回执'].card2_name = c2['card.name']
    }

    if (c['capacity.count'] !== 73) {
      push('C2-CAPACITY-COUNT',
        `A：数据根里快照的 \`totals.count\` 是 **73**，卡上 \`capacity.count\` 实得 ${JSON.stringify(c['capacity.count'])} `
        + '—— 容量的**实际占用**来自记忆库快照（定形 §2.3：「路线账本不存」）')
    }
    if (c['capacity.chars'] !== 4321) {
      push('C2-CAPACITY-CHARS', `A：快照 \`totals.chars\` 是 **4321**，卡上 \`capacity.chars\` 实得 ${JSON.stringify(c['capacity.chars'])}`)
    }
    if (c['capacity.cap_count'] !== 137 || c['capacity.cap_chars'] !== 12345) {
      push('C2-CAPACITY-HARDCODED',
        `A：参考线必须读夹具的 \`presets/agenia/lib/memory.mjs\`（\`CAP_COUNT = 137\` / \`CAP_CHARS = 12_345\`），`
        + `卡上实得 ${JSON.stringify(c['capacity.cap_count'])} / ${JSON.stringify(c['capacity.cap_chars'])}`
        + (c['capacity.cap_count'] === 200 || c['capacity.cap_chars'] === 80000
          ? ' —— 这是**写死的旧值**（2026-11-02 已实测过一次：卡上 60,000 而权威常量是 80,000）'
          : ' —— 参考线与实际占用是两件事，别把 \`totals\` 当参考线'))
    }
    const src = String(c['capacity.source'] ?? '')
    if (!src.includes('memory/snapshots')) {
      push('C2-CAPACITY-SOURCE',
        `A：\`capacity.source\` 必须点名快照路径（含 \`memory/snapshots/\`），实得 ${JSON.stringify(c['capacity.source'])}`)
    }
    if (src.includes('.team/route') || src.includes('.team\\route')) {
      push('C2-CAPACITY-FROM-ROUTE',
        `A：\`capacity.source\` 指到了路线账本（${JSON.stringify(c['capacity.source'])}）—— `
        + '定形 §2.3：「**容量读记忆库快照，路线账本不存**」')
    }
    if (c['capacity.state'] !== 'green') {
      push('C2-CAPACITY-STATE', `A：快照可读 ⇒ \`capacity.state\` 必须是 \`green\`，实得 ${JSON.stringify(c['capacity.state'])}`)
    }

    if (c['card.name'] !== CARD_NAME) {
      push('C2-CARD-NAME', `A：\`card.name\` 必须逐字 ${JSON.stringify(CARD_NAME)}，实得 ${JSON.stringify(c['card.name'])}`)
    }
    if (!String(c['card.generator'] ?? '').includes('daily-cards.py')) {
      push('C2-CARD-GENERATOR',
        `A：\`card.generator\` 必须点名日报卡脚本（含 \`daily-cards.py\`），实得 ${JSON.stringify(c['card.generator'])} `
        + '—— 定形 §6.2：「生成器 = 日报卡脚本」')
    }
    if (c['card.day'] !== DAY) {
      push('C2-CARD-DAY', `A：\`card.day\` 必须等于 \`--day\`（${DAY}），实得 ${JSON.stringify(c['card.day'])}`)
    }
    if (typeof c['card.as_of'] !== 'string' || !ISO_WITH_OFFSET.test(c['card.as_of'])) {
      push('C2-CARD-ASOF',
        `A：\`card.as_of\` 必须是带时区偏移的 ISO8601（只显示；≤24h 不进判据），实得 ${JSON.stringify(c['card.as_of'])}`)
    }
    if (c['receipt.required'] !== true) {
      push('C2-RECEIPT-REQUIRED', `A：有路线账本 ⇒ \`receipt.required\` 必须 \`true\`，实得 ${JSON.stringify(c['receipt.required'])}`)
    }
    // 第一段：卡 1
    {
      const r = c['receipt.technical']
      if (r === null || typeof r !== 'object' || r.state !== 'present') {
        push('C2-RECEIPT-PRESENT',
          `A：\`.team/state/local/${DAY}.json\` 的 \`nodes.technical\` 是 \`done\` ⇒ 卡 1 的 \`receipt.technical.state\` 必须 \`present\`，`
          + `实得 ${JSON.stringify(r)}`)
      }
    }
    if (c['receipt.red'] !== false) {
      push('C2-RECEIPT-RED', `A：第一段 present ⇒ 卡 1 的 \`receipt.red\` 必须 \`false\`，实得 ${JSON.stringify(c['receipt.red'])}`)
    }
    // 第二段：卡 2（裁定第 5 条 —— 它**不在**卡 1 上）
    if (A2ok) {
      const r = c2['receipt.conversation']
      if (r === null || typeof r !== 'object' || r.state !== 'present') {
        push('C2-RECEIPT-PRESENT',
          `A：\`.team/state/local/${DAY}.json\` 的 \`nodes.conversation\` 是 \`done\` ⇒ 卡 2 的 \`receipt.conversation.state\` 必须 \`present\`，`
          + `实得 ${JSON.stringify(r)}`)
      }
      // 🔴 第二段的 `report_path` 逐字（`gate4-C2` F-09）：会话评审那一份，不是技术评审那一份。
      const wantConversationPath = `.team/retro/${DAY}/会话评审.md`
      readings['A/回执'].conversation_path = r !== null && typeof r === 'object' ? r.report_path : null
      if (r === null || typeof r !== 'object' || r.report_path !== wantConversationPath) {
        push('C2-RECEIPT-PATH',
          `A：卡 2 的 \`receipt.conversation.report_path\` 必须逐字 ${JSON.stringify(wantConversationPath)}`
          + `（\`nodes.conversation.report_path\` 就是它），实得 ${JSON.stringify(r === null || typeof r !== 'object' ? r : r.report_path)} —— `
          + '契约 §3.7：第二段是**会话评审**作业产的那一份；印成技术评审那份 ⇒ 两段在卡上"长得一样"，读的人分不出读的是哪一份')
      }
      if (c2['receipt.red'] !== false) {
        push('C2-RECEIPT-RED', `A：第二段 present ⇒ 卡 2 的 \`receipt.red\` 必须 \`false\`，实得 ${JSON.stringify(c2['receipt.red'])}`)
      }
      if (c2['receipt.required'] !== c['receipt.required']) {
        push('C2-RECEIPT-CROSS-CARD',
          `A：两张卡的 \`receipt.required\` 必须同值（同一条事实两个读者）：卡 1 = ${JSON.stringify(c['receipt.required'])}、`
          + `卡 2 = ${JSON.stringify(c2['receipt.required'])}`)
      }
      if (c2['card.name'] !== CARD2_NAME) {
        push('C2-RECEIPT-CARD-NAME', `A：卡 2 的 \`card.name\` 必须逐字 ${JSON.stringify(CARD2_NAME)}，实得 ${JSON.stringify(c2['card.name'])}`)
      }
      if (c2['card.day'] !== DAY) {
        push('C2-RECEIPT-CARD-DAY', `A：卡 2 的 \`card.day\` 必须等于 \`--day\`（${DAY}），实得 ${JSON.stringify(c2['card.day'])}`)
      }
    }

    // ── A2 · 正文 ↔ 机器格（契约 §2.2；`gate4-C2` F-08）：**容量**那一对 ────
    /**
     * 阳性：`A` 的正文容量行必须写出 `73 条` / `4321 字符`（与 `capacity.count/chars` 同值）。
     * 负样本：把卡复制一份、只把正文容量行的首数改成 `0`，机器格不动 ⇒ 必须报 `C2-RENDER-DISAGREE`
     * （"正文印 0 条"正是会让人以为"记忆库空了"的那种谎）。
     */
    {
      const rendered = renderChecks(A.card, { only: ['capacity'] })
      const row = rendered.rows.capacity
      readings['A2/正文同值'] = { row, pairs: rendered.pairs.map((p) => ({ pair: p.pair, ok: p.ok })) }
      judgeRenderAgree(rendered, push, 'A2/正文同值')
      if (row === null) {
        push('C2-RENDER-ROW-MISSING',
          '正文里找不到容量那一行（`容量 … 条 / 字符`）—— 契约 §2.2 的第三对就是这个；那一行不在，"同值"无从谈起')
      } else {
        const text = String(row.value ?? '')
        const badText = text.replace(/^(\d+)(\s*条)/, '0$2')
        if (badText === text) {
          push('C2-RENDER-KNIFE-MISSED',
            `A2：正文容量行里找不到"首数 + 条"这个形状（行=${JSON.stringify(text)}）—— 负样本造不出来，记红不记绿`)
        } else {
          const patched = copyCardWithBodyPatch(cardFile(A.roots.ws, DAY), [{ label: row.label, value: badText }])
          readings['A2/正文负样本'] = { ok: patched.ok, error: patched.error, file: patched.file, value: badText }
          if (!patched.ok) {
            push('C2-RENDER-KNIFE-MISSED', `A2：造不出"正文首数印成 0"那张副本（${patched.error ?? '未知'}）—— 记红不记绿`)
          } else {
            const badCard = readCard(patched.file)
            const badProblems = []
            const badPush = (code, message, detail) => badProblems.push(problem(code, message, detail))
            const flipped = renderChecks(badCard, { only: ['capacity'] })
            judgeRenderAgree(flipped, badPush, 'A2/负样本')
            readings['A2/正文负样本'].codes = badProblems.map((p) => p.code)
            readings['A2/正文负样本'].failed_pairs = flipped.pairs.filter((p) => !p.ok).map((p) => p.pair)
            if (!badProblems.some((p) => p.code === 'C2-RENDER-DISAGREE')) {
              push('C2-RENDER-KNIFE-MISSED',
                'A2：正文容量行首数印成 0、机器格仍是 73，判据却没有报 `C2-RENDER-DISAGREE` —— 这条判据翻不了面')
            }
            if (badCard.cells['capacity.count'] !== 73) {
              push('C2-RENDER-KNIFE-MISSED', 'A2：副本的 `capacity.count` 机器格也变了 —— 负样本应当只改正文')
            }
          }
        }
      }
    }

    // ── C · 快照读不到 ⇒ 红，不出 0 ─────────────────────────────────────
    {
      const roots = makeCardRoots('CARD-06', 'snapshot-broken')
      writeMemorySource(roots.ws)
      writeDataRoot(roots.dr, { day: DAY, totals: { count: 73, chars: 4321 } })
      removeSnapshot(roots.dr)
      const run = runCards(roots, { day: DAY, nowIso: NOW })
      const card = readCard(cardFile(roots.ws, DAY))
      readings['C/快照坏了'] = { exit_code: run.exit_code, ok: card.ok, error: card.error }
      if (run.exit_code !== 0) {
        // 生成器整张卡不出也算"没绿兜底"，但容量那一格就没得读 —— 记读数 + 一条具体红因。
        push('C2-CAPACITY-MISSING',
          `C（快照文件在、但不是 JSON）：生成器 exit=${run.exit_code}、一张卡都没出。`
          + '契约 §3.6 钉的是「**卡照出**、`capacity.state=red`、`count=null`、`reasons` 有 `CAPACITY_UNREADABLE`」'
          + '—— 快照读不到**不许**让整张卡不出（老板更要知道），也**不许**印 0 / 印旧值。'
          + `若这一版选择不出卡，失败标记必须在（已判在 E 那一组）；stderr=${String(run.stderr).trim().slice(0, 240)}`)
      } else if (!sheetMissing(card, push, 'C/快照坏了') && !keysMissing(card, push, 'C/快照坏了')) {
        readings['C/快照坏了'].cells = {
          state: card.cells['capacity.state'], count: card.cells['capacity.count'], reasons: card.cells['card.reasons'],
        }
        if (card.cells['capacity.state'] !== 'red') {
          push('C2-CAPACITY-STATE',
            `C：快照读不到 ⇒ \`capacity.state\` 必须 \`red\`，实得 ${JSON.stringify(card.cells['capacity.state'])}`)
        }
        if (card.cells['capacity.count'] !== null) {
          push('C2-CAPACITY-FAKE-ZERO',
            `C：快照读不到时 \`capacity.count\` 必须是 \`null\`（判不了），实得 ${JSON.stringify(card.cells['capacity.count'])} `
            + '—— **判不了不是 0**：印 0 会让老板以为"记忆库空了"')
        }
        if (!hasRed(card.cells, 'CAPACITY_UNREADABLE')) {
          push('C2-CAPACITY-REASON', `C：\`card.reasons\` 里没有 \`CAPACITY_UNREADABLE\`（实得 ${JSON.stringify(card.cells['card.reasons'])}）`)
        }
        // 🔴 正文那一行同理（契约 §2.2 + §3.6）：判不了 ⇒ 正文必须是 `?`，不是 0，也不是旧值。
        const renderedC = renderChecks(card, { only: ['capacity'] })
        readings['C/快照坏了'].render = renderedC.pairs.map((p) => ({ pair: p.pair, body: p.body, ok: p.ok }))
        judgeRenderAgree(renderedC, push, 'C/快照坏了')
      }
    }

    // ── C2 / C3 · `totals` 形状坏 · identity 坏 JSON（`gate4-C2` 复审 R-02）──────────
    /**
     * 一副"除要判的那一格之外全绿"的现场：路线账本（票段空）+ 本周期两段回执 + legacy 票店已迁空。
     * `totals` / `identity` 由调用方给 —— **阳性对照与阴性现场只差那一个输入**，
     * 否则"该绿时绿、该红时红"就变成两副互不相干的夹具在各自说话（`mig-rules-14`）。
     */
    const readSurface = (tag, { totals = { count: 73, chars: 4321 }, identity = 'absent' } = {}) => {
      const roots = makeCardRoots('CARD-06', tag)
      writeMemorySource(roots.ws)
      writeDataRoot(roots.dr, { day: DAY, totals })
      writeRoute(roots.ws, routeLedger({ tickets: [] }))
      writeLocal(roots.ws, DAY, localState({ day: DAY, technical: 'done', conversation: 'done' }))
      writeReviewReports(roots.ws, DAY)
      writeLegacyStore(roots.ws, { remaining: 0 })
      if (identity === 'empty') writeIdentity(roots.ws, DAY)
      if (identity === 'bad-json') writeIdentityRaw(roots.ws, DAY, '{ 这不是 JSON：身份报警文件坏在盘上\n')
      const run = runCards(roots, { day: DAY, nowIso: NOW })
      return { roots, run, card: readCard(cardFile(roots.ws, DAY)) }
    }
    /** 状态条某一格（读不到 ⇒ `null`；调用方自己决定怎么红）。 */
    const barCell = (card, key) => {
      const bar = Array.isArray(card.cells?.['statusbar']) ? card.cells['statusbar'] : []
      return bar.find((c) => c !== null && typeof c === 'object' && c.key === key) ?? null
    }
    /** 除 `except` 那几格之外**不是绿**的格（"红是不是只有那一格弄出来的"）。 */
    const barNotGreen = (card, except = []) => {
      const bar = Array.isArray(card.cells?.['statusbar']) ? card.cells['statusbar'] : []
      return bar
        .filter((c) => c !== null && typeof c === 'object' && !except.includes(c.key) && c.state !== 'green')
        .map((c) => ({ key: c.key, state: c.state }))
    }

    // C2 阳性对照：同一副夹具、`totals` 合法 ⇒ 容量绿、两个数照读、正文印数、卡不红。
    {
      const label = 'C2/阳性·totals 合法'
      const p = readSurface('totals-ok', { totals: { count: 73, chars: 4321 } })
      if (!usable(readings, problems, push, label, p)) { caseFail(problems); return }
      const cells = p.card.cells
      const rendered = renderChecks(p.card, { only: ['capacity'] })
      Object.assign(readings[label], {
        totals: { count: 73, chars: 4321 },
        state: cells['capacity.state'], count: cells['capacity.count'], chars: cells['capacity.chars'],
        card_red: cells['card.red'], reasons: cells['card.reasons'],
        bar_not_green: barNotGreen(p.card), render: rendered.pairs.map((q) => ({ pair: q.pair, ok: q.ok })),
      })
      if (cells['capacity.state'] !== 'green') {
        push('C2-CAPACITY-STATE',
          `C2（阳性对照）：\`totals\` = \`{count:73, chars:4321}\` ⇒ \`capacity.state\` 必须 \`green\`，实得 ${JSON.stringify(cells['capacity.state'])} `
          + '—— 这一格是阴性现场「只差 totals」的那一半；它不绿，阴性那边红也说明不了是 totals 形状弄的')
      }
      if (cells['capacity.count'] !== 73 || cells['capacity.chars'] !== 4321) {
        push('C2-CAPACITY-COUNT',
          `C2（阳性对照）：合法 totals 必须照读（73 / 4321），实得 ${JSON.stringify(cells['capacity.count'])} / ${JSON.stringify(cells['capacity.chars'])}`)
      }
      if (cells['card.red'] !== false) {
        push('C2-CAPACITY-RED', `C2（阳性对照）：容量合法 ⇒ 卡不该因此红，实得 \`card.red\` = ${JSON.stringify(cells['card.red'])}`)
      }
      const notGreen = barNotGreen(p.card)
      if (notGreen.length > 0) {
        push('C2-CAPACITY-RED', `C2（阳性对照）：除容量外这副夹具的十二格应当全绿，实得 ${JSON.stringify(notGreen)} —— 否则下面阴性现场的红分不清是谁弄的`)
      }
      judgeRenderAgree(rendered, push, label)
    }

    // C2 阴性：`totals` 在盘上、`count` 是字符串 / `chars` 是布尔 ⇒ 红、不出 0、正文 `?`。
    {
      const label = 'C2/阴性·totals 不是整数'
      const n = readSurface('totals-shape-bad', { totals: { count: '73', chars: true } })
      if (!usable(readings, problems, push, label, n)) { caseFail(problems); return }
      const cells = n.card.cells
      const rendered = renderChecks(n.card, { only: ['capacity'] })
      Object.assign(readings[label], {
        totals: { count: '73', chars: true },
        state: cells['capacity.state'], count: cells['capacity.count'], chars: cells['capacity.chars'],
        card_red: cells['card.red'], reasons: cells['card.reasons'],
        bar_not_green: barNotGreen(n.card), render: rendered.pairs.map((q) => ({ pair: q.pair, body: q.body, ok: q.ok })),
      })
      if (cells['capacity.state'] !== 'red') {
        push('C2-CAPACITY-STATE',
          `C2（阴性）：快照读到了、但 \`totals.count\` 是字符串 \`"73"\`、\`totals.chars\` 是布尔 \`true\` ⇒ `
          + `\`capacity.state\` 必须 \`red\`，实得 ${JSON.stringify(cells['capacity.state'])} `
          + '—— 契约 §2.3 #25 要的是两个**整数**；"看起来有值"不是"判得了"')
      }
      for (const [key, got] of [['capacity.count', cells['capacity.count']], ['capacity.chars', cells['capacity.chars']]]) {
        if (got !== null) {
          push('C2-CAPACITY-FAKE-ZERO',
            `C2（阴性）：\`totals\` 不是两个整数 ⇒ \`${key}\` 必须 \`null\`（判不了），实得 ${JSON.stringify(got)} `
            + '—— 印 0 / 印那个字符串，都是"判不了冒充读数"')
        }
      }
      if (!hasRed(cells, 'CAPACITY_UNREADABLE')) {
        push('C2-CAPACITY-REASON', `C2（阴性）：\`card.reasons\` 里没有 \`CAPACITY_UNREADABLE\`（实得 ${JSON.stringify(cells['card.reasons'])}）`)
      }
      if (cells['card.red'] !== true) {
        push('C2-CAPACITY-RED', `C2（阴性）：容量判不了且红因在 ⇒ \`card.red\` 必须 \`true\`，实得 ${JSON.stringify(cells['card.red'])}`)
      }
      const bodyText = String(rendered.rows.capacity?.value ?? '')
      if (!(/\?\s*条/.test(bodyText) && /\?\s*字符/.test(bodyText))) {
        push('C2-CAPACITY-BODY',
          `C2（阴性）：容量判不了时正文那两个数必须是 \`?\`（不是 0、不是那个字符串、不是旧值），`
          + `实得 ${JSON.stringify(bodyText.slice(0, 200))} —— 老板读的是这一行`)
      }
      const notGreen = barNotGreen(n.card, ['red_bar'])
      if (notGreen.length > 0) {
        push('C2-CAPACITY-RED',
          `C2（阴性）：容量坏掉不该顺带把别的格弄红（\`red_bar\` 除外 —— 它是 \`card.red\` 的总闸），实得 ${JSON.stringify(notGreen)}`)
      }
      judgeRenderAgree(rendered, push, label)
    }

    // C3 阳性对照：合法 identity（两个报警数组都空）⇒ 两格绿、读数是 `0 条`、卡不红。
    {
      const label = 'C3/阳性·identity 合法'
      const p = readSurface('identity-ok', { identity: 'empty' })
      if (!usable(readings, problems, push, label, p)) { caseFail(problems); return }
      const cells = p.card.cells
      const unknownCell = barCell(p.card, 'unknown_preset')
      const downgradeCell = barCell(p.card, 'preset_downgrade')
      Object.assign(readings[label], {
        unknown_preset: unknownCell, preset_downgrade: downgradeCell,
        card_red: cells['card.red'], reasons: cells['card.reasons'], bar_not_green: barNotGreen(p.card),
      })
      for (const [key, cell] of [['unknown_preset', unknownCell], ['preset_downgrade', downgradeCell]]) {
        if (cell === null) {
          push('C2-STATUSBAR-SHAPE', `C3（阳性对照）：状态条里没有 \`${key}\` 那一格 —— 十二格是冻结形状（契约 §4.2）`)
          continue
        }
        if (cell.state !== 'green') {
          push('C2-IDENTITY-STATE',
            `C3（阳性对照）：identity 文件合法且两个报警数组都空 ⇒ \`${key}\` 必须 \`green\`，实得 ${JSON.stringify(cell.state)} `
            + `（reading=${JSON.stringify(cell.reading)}）`)
        }
        if (!String(cell.reading ?? '').startsWith('0 条')) {
          push('C2-IDENTITY-READING',
            `C3（阳性对照）：没有报警 ⇒ \`${key}\` 的 reading 必须是 \`0 条…\`，实得 ${JSON.stringify(cell.reading)} `
            + '—— 这一格是阴性现场「只差文件内容」的那一半：坏文件必须与"读了、是空的"分得开')
        }
      }
      if (cells['card.red'] !== false) {
        push('C2-IDENTITY-STATE', `C3（阳性对照）：无报警 ⇒ 卡不该红，实得 \`card.red\` = ${JSON.stringify(cells['card.red'])}`)
      }
      const notGreen = barNotGreen(p.card)
      if (notGreen.length > 0) {
        push('C2-IDENTITY-STATE', `C3（阳性对照）：除身份两格外这副夹具的十二格应当全绿，实得 ${JSON.stringify(notGreen)}`)
      }
    }

    // C3 阴性：`<WS>/.team/state/identity/<day>.json` 是**坏 JSON** ⇒ 两格红、卡红、reading 说"读不出来"。
    {
      const label = 'C3/阴性·identity 坏 JSON'
      const n = readSurface('identity-bad-json', { identity: 'bad-json' })
      if (!usable(readings, problems, push, label, n)) { caseFail(problems); return }
      const cells = n.card.cells
      const unknownCell = barCell(n.card, 'unknown_preset')
      const downgradeCell = barCell(n.card, 'preset_downgrade')
      Object.assign(readings[label], {
        unknown_preset: unknownCell, preset_downgrade: downgradeCell,
        card_red: cells['card.red'], reasons: cells['card.reasons'], bar_not_green: barNotGreen(n.card),
        // ⚠️ N-02：现行 §5 闭集里没有身份码 ⇒ 这两格红了 `card.reasons` 仍是 `[]`。
        //     本条判据**不要求**带码（只记读数）；要求带码会当场变成 `C2-REASON-UNKNOWN` 的假红。
        reasons_empty_by_closed_set: Array.isArray(cells['card.reasons']) && cells['card.reasons'].length === 0,
      })
      for (const [key, cell] of [['unknown_preset', unknownCell], ['preset_downgrade', downgradeCell]]) {
        if (cell === null) {
          push('C2-STATUSBAR-SHAPE', `C3（阴性）：状态条里没有 \`${key}\` 那一格 —— 十二格是冻结形状（契约 §4.2）`)
          continue
        }
        if (cell.state !== 'red') {
          push('C2-IDENTITY-STATE',
            `C3（阴性）：identity 文件在盘上但**读不出来** ⇒ \`${key}\` 必须 \`red\`，实得 ${JSON.stringify(cell.state)} `
            + `（reading=${JSON.stringify(cell.reading)}）—— 判不了不是"0 条报警"`)
        }
        const text = String(cell.reading ?? '')
        if (!text.includes('读不出来')) {
          push('C2-IDENTITY-READING',
            `C3（阴性）：坏 JSON 时 \`${key}\` 的 reading 必须说**读不出来**（与"读了、是空的"分开），实得 ${JSON.stringify(text)}`)
        }
        if (/^\s*0\s*条/.test(text)) {
          push('C2-IDENTITY-READING',
            `C3（阴性）：坏 JSON 被读成了 \`0 条\`（reading=${JSON.stringify(text)}）—— `
            + '"读不出来"与"没有报警"长得一样，注入器那一侧的坏就静默通过了')
        }
      }
      if (cells['card.red'] !== true) {
        push('C2-IDENTITY-STATE', `C3（阴性）：两格红 ⇒ \`card.red\` 必须 \`true\`，实得 ${JSON.stringify(cells['card.red'])}`)
      }
      const notGreen = barNotGreen(n.card, ['unknown_preset', 'preset_downgrade', 'red_bar'])
      if (notGreen.length > 0) {
        push('C2-IDENTITY-STATE', `C3（阴性）：除身份两格外其余各格必须绿（\`red_bar\` 除外 —— 它是 \`card.red\` 的总闸；红只该由坏 identity 弄出来），实得 ${JSON.stringify(notGreen)}`)
      }
    }

    // ── D · 回执三态（missing / expired / na）· 逐段逐卡 ─────────────────
    const D = scene('CARD-06', 'receipt-missing', { route: routeLedger({ tickets: [] }) })
    if (!usable(readings, problems, push, 'D/缺回执', D)) { caseFail(problems); return }
    readings['D/回执'] = { required: D.card.cells['receipt.required'], technical: D.card.cells['receipt.technical'], red: D.card.cells['receipt.red'], reasons: D.card.cells['card.reasons'] }
    if (D.card.cells['receipt.red'] !== true) {
      push('C2-RECEIPT-MISSING-GREEN',
        `D（有路线账本、本周期没有任何本地状态文件）：卡 1 的 \`receipt.red\` 必须 \`true\`，实得 ${JSON.stringify(D.card.cells['receipt.red'])} `
        + '—— 定形 §6.2：「缺 / 过期（超一个开工周期）⇒ 红」')
    }
    for (const seg of ['technical']) {
      const r = D.card.cells[`receipt.${seg}`]
      if (r === null || typeof r !== 'object' || r.state !== 'missing') {
        push('C2-RECEIPT-MISSING-STATE',
          `D：本周期没有那一段 ⇒ 卡 1 的 \`receipt.${seg}.state\` 必须 \`missing\`，实得 ${JSON.stringify(r)}`)
      }
      if (!hasRed(D.card.cells, `RECEIPT_MISSING:${seg}`)) {
        push('C2-RECEIPT-MISSING-REASON',
          `D：卡 1 的 \`card.reasons\` 里没有 \`RECEIPT_MISSING:${seg}\`（实得 ${JSON.stringify(D.card.cells['card.reasons'])}）`
          + '—— 两段是两个作业产的，红必须逐段点名')
      }
    }
    if (usable2(readings, push, 'D/缺回执', D)) {
      const d2 = D.card2.cells
      readings['D/回执'].conversation = d2['receipt.conversation']
      readings['D/回执'].card2_red = d2['receipt.red']
      readings['D/回执'].card2_reasons = d2['card.reasons']
      const r = d2['receipt.conversation']
      if (r === null || typeof r !== 'object' || r.state !== 'missing') {
        push('C2-RECEIPT-MISSING-STATE',
          `D：本周期没有那一段 ⇒ **卡 2** 的 \`receipt.conversation.state\` 必须 \`missing\`，实得 ${JSON.stringify(r)}`)
      }
      if (d2['receipt.red'] !== true) {
        push('C2-RECEIPT-MISSING-GREEN',
          `D：第二段缺 ⇒ **卡 2** 的 \`receipt.red\` 必须 \`true\`，实得 ${JSON.stringify(d2['receipt.red'])}`)
      }
      if (!hasRed(d2, 'RECEIPT_MISSING:conversation')) {
        push('C2-RECEIPT-MISSING-REASON',
          `D：卡 2 的 \`card.reasons\` 里没有 \`RECEIPT_MISSING:conversation\`（实得 ${JSON.stringify(d2['card.reasons'])}）`)
      }
      // 🔴 两张卡不许互相顶替：第二段的红**不许**跑到卡 1 上，反之亦然。
      if (hasRed(D.card.cells, 'RECEIPT_MISSING:conversation')) {
        push('C2-RECEIPT-CROSS-CARD',
          'D：第二段的红（`RECEIPT_MISSING:conversation`）出现在**卡 1** 上 —— 裁定第 5 条：第二段落第二张卡，'
          + '它的红也在那张卡上；两段挤在一张卡上，第二张卡就没有可读的机器面了')
      }
      if (hasRed(d2, 'RECEIPT_MISSING:technical')) {
        push('C2-RECEIPT-CROSS-CARD', 'D：第一段的红（`RECEIPT_MISSING:technical`）出现在**卡 2** 上 —— 逐段逐卡，别串')
      }
    }

    // `expired`：只有**上一个**开工周期的本地状态（两段都 done）──────────────
    {
      const roots = makeCardRoots('CARD-06', 'receipt-expired')
      writeMemorySource(roots.ws)
      writeDataRoot(roots.dr, { day: DAY, totals: { count: 73, chars: 4321 } })
      const route = routeLedger({ tickets: [] })
      // 先把账与"昨天"的本地状态摆好，再生成今天的卡。
      writeRoute(roots.ws, route)
      writeLocal(roots.ws, DAY_PREV, localState({ day: DAY_PREV, technical: 'done', conversation: 'done' }))
      const run = runCards(roots, { day: DAY, nowIso: NOW })
      const card = readCard(cardFile(roots.ws, DAY))
      const card2 = readCard2(card2File(roots.ws, DAY))
      readings['D2/过期'] = { exit_code: run.exit_code, ok: card.ok, error: card.error, card2_sheets: card2.dump?.sheet_names ?? null }
      if (run.exit_code === 0 && !sheetMissing(card, push, 'D2/过期') && !keysMissing(card, push, 'D2/过期')) {
        readings['D2/过期'].cells = { technical: card.cells['receipt.technical'], red: card.cells['receipt.red'] }
        const r = card.cells['receipt.technical']
        if (r === null || typeof r !== 'object' || r.state !== 'expired') {
          push('C2-RECEIPT-EXPIRED-STATE',
            `D2：只有 ${DAY_PREV} 那一份本地状态（两段都 done）⇒ 今天是 ${DAY}，卡 1 的 \`receipt.technical.state\` 必须是 \`expired\`，`
            + `实得 ${JSON.stringify(r)} —— 定形 §6.2：「**过期（超一个开工周期）⇒ 红**」`)
        }
        if (!hasRed(card.cells, 'RECEIPT_EXPIRED:technical')) {
          push('C2-RECEIPT-EXPIRED-REASON', `D2：卡 1 的 \`card.reasons\` 里没有 \`RECEIPT_EXPIRED:technical\`（实得 ${JSON.stringify(card.cells['card.reasons'])}）`)
        }
        if (card.cells['receipt.red'] !== true) {
          push('C2-RECEIPT-EXPIRED-RED', `D2：过期 ⇒ 卡 1 的 \`receipt.red\` 必须 \`true\`，实得 ${JSON.stringify(card.cells['receipt.red'])}`)
        }
      }
      if (run.exit_code === 0 && !card2SheetMissing(card2, push, 'D2/过期') && !keysMissing(card2, push, 'D2/过期')) {
        readings['D2/过期'].card2 = { conversation: card2.cells['receipt.conversation'], red: card2.cells['receipt.red'] }
        const r = card2.cells['receipt.conversation']
        if (r === null || typeof r !== 'object' || r.state !== 'expired') {
          push('C2-RECEIPT-EXPIRED-STATE',
            `D2：卡 2 的 \`receipt.conversation.state\` 必须是 \`expired\`，实得 ${JSON.stringify(r)}`)
        }
        if (!hasRed(card2.cells, 'RECEIPT_EXPIRED:conversation')) {
          push('C2-RECEIPT-EXPIRED-REASON', `D2：卡 2 的 \`card.reasons\` 里没有 \`RECEIPT_EXPIRED:conversation\`（实得 ${JSON.stringify(card2.cells['card.reasons'])}）`)
        }
        if (card2.cells['receipt.red'] !== true) {
          push('C2-RECEIPT-EXPIRED-RED', `D2：过期 ⇒ 卡 2 的 \`receipt.red\` 必须 \`true\`，实得 ${JSON.stringify(card2.cells['receipt.red'])}`)
        }
      }
    }

    // `na`：没有路线、也没有任务 ⇒ **不判红**（两张卡都是）────────────────
    const F = scene('CARD-06', 'receipt-na', {})
    if (!usable(readings, problems, push, 'F/未建账', F)) { caseFail(problems); return }
    readings['F/回执'] = { required: F.card.cells['receipt.required'], technical: F.card.cells['receipt.technical'], red: F.card.cells['receipt.red'] }
    if (F.card.cells['receipt.required'] !== false) {
      push('C2-RECEIPT-REQUIRED',
        `F（没有路线账本、也没有任务）：\`receipt.required\` 必须 \`false\`，实得 ${JSON.stringify(F.card.cells['receipt.required'])} `
        + '—— 定形 §6.2：「两者都无 / 无活动 ⇒ 不判红」')
    }
    if (F.card.cells['receipt.red'] !== false) {
      push('C2-RECEIPT-NA-RED',
        `F：未建账期无活动 ⇒ 卡 1 的 \`receipt.red\` 必须 \`false\`（回执无从谈起），实得 ${JSON.stringify(F.card.cells['receipt.red'])}`)
    }
    {
      const r = F.card.cells['receipt.technical']
      if (r !== null && typeof r === 'object' && r.state !== 'na') {
        push('C2-RECEIPT-NA-STATE', `F：无活动 ⇒ 卡 1 的 \`receipt.technical.state\` 必须是 \`na\`，实得 ${JSON.stringify(r)}`)
      }
    }
    if (usable2(readings, push, 'F/未建账', F)) {
      readings['F/回执'].conversation = F.card2.cells['receipt.conversation']
      readings['F/回执'].card2_red = F.card2.cells['receipt.red']
      if (F.card2.cells['receipt.red'] !== false) {
        push('C2-RECEIPT-NA-RED', `F：卡 2 的 \`receipt.red\` 也必须 \`false\`，实得 ${JSON.stringify(F.card2.cells['receipt.red'])}`)
      }
      const r = F.card2.cells['receipt.conversation']
      if (r !== null && typeof r === 'object' && r.state !== 'na') {
        push('C2-RECEIPT-NA-STATE', `F：无活动 ⇒ 卡 2 的 \`receipt.conversation.state\` 必须是 \`na\`，实得 ${JSON.stringify(r)}`)
      }
    }

    // ── E/F · 生成失败四件套（外加 append-only）──────────────────────────
    {
      // `memory.mjs` 不在 ⇒ 生成器现行为 `SystemExit("E_CAP_SOURCE: …")`（exit 1）。
      const roots = makeCardRoots('CARD-06', 'failure')
      writeDataRoot(roots.dr, { day: DAY, totals: { count: 73, chars: 4321 } })
      const run1 = runCards(roots, { day: DAY, nowIso: NOW })
      const cardFileAbs = cardFile(roots.ws, DAY)
      const card2FileAbs = card2File(roots.ws, DAY)
      const markerAbs = failureFile(roots.ws, DAY)
      const failures1 = readFailures(roots.ws, DAY)
      readings['E/失败1'] = {
        exit_code: run1.exit_code,
        card: statOf(cardFileAbs),
        card2: statOf(card2FileAbs),
        marker: statOf(markerAbs),
        failures: failures1,
        stderr: String(run1.stderr).trim().slice(0, 300),
        stdout: String(run1.stdout).trim().slice(0, 200),
      }
      if (run1.exit_code === 0) {
        push('C2-FAIL-SILENT',
          'E：夹具里没有 `presets/agenia/lib/memory.mjs`（参考线读不到）⇒ 生成必须失败，实得 **exit 0** —— '
          + '"看起来成功了"比失败更坏（`F-111` ⑤ 的同一条病）')
      }
      if (statOf(cardFileAbs).exists) {
        push('C2-FAIL-NO-CARD',
          `E：生成失败了，却留下了一张卡（${cardFileAbs}）—— 定形 §2.3：「不许拿昨天那张当绿」；`
          + '零值卡比没卡更坏（它看起来成功了）')
      }
      if (statOf(card2FileAbs).exists) {
        push('C2-FAIL-NO-CARD',
          `E：生成失败了，却留下了第二张卡（${card2FileAbs}）—— 第二段回执卡同样不许有"绿兜底"`)
      }
      if (failures1.length === 0) {
        push('C2-FAIL-MARKER',
          `E：生成失败**没有失败标记**（${markerAbs} 不在 / 是空的）—— 定形 §2.3：「生成失败 ⇒ 会话里一行红 + 日志 +`
          + '失败标记（带时点）」。当时没人在场时，这一行是唯一能事后查的东西')
      } else {
        const f = failures1[0]
        if (typeof f?.at !== 'string' || !ISO_WITH_OFFSET.test(f.at)) {
          push('C2-FAIL-MARKER-AT', `E：失败标记缺"带时点"的 \`at\`（实得 ${JSON.stringify(f)}）—— 必须能被注入时钟驱动（同一个时钟，不是 \`datetime.now()\`）`)
        } else if (f.at !== NOW) {
          push('C2-FAIL-MARKER-AT',
            `E：失败标记的 \`at\` = ${JSON.stringify(f.at)}，注入时钟是 ${NOW} —— 标记要记**那一刻**，不是真实此刻`)
        }
        if (f?.day !== DAY) {
          push('C2-FAIL-MARKER-DAY', `E：失败标记的 \`day\` 必须是 ${DAY}，实得 ${JSON.stringify(f?.day)}`)
        }
        if (typeof f?.code !== 'string' || !/^E_[A-Z][A-Z_]+$/.test(f.code)) {
          push('C2-FAIL-MARKER-CODE', `E：失败标记没有点名错误码（实得 ${JSON.stringify(f)}）—— 老板要知道是哪一类失败`)
        }
      }
      const stderr = String(run1.stderr ?? '')
      if (!stderr.includes('🔴')) {
        push('C2-FAIL-STDOUT', `E：stderr 上没有那一行「🔴」（定形：「会话里一行红」的生成器侧那一半）；实得 ${JSON.stringify(stderr.trim().slice(0, 240))}`)
      }
      if (!/\bE_[A-Z][A-Z_]+\b/.test(stderr)) {
        push('C2-FAIL-STDOUT', `E：stderr 上没有错误码（\`E_*\`）；实得 ${JSON.stringify(stderr.trim().slice(0, 240))}`)
      }

      // 第二次失败 ⇒ 标记**追加**成两行（覆盖写 ⇒ 红）
      const run2 = runCards(roots, { day: DAY, nowIso: NOW })
      const failures2 = readFailures(roots.ws, DAY)
      readings['E/失败2'] = { exit_code: run2.exit_code, count: failures2.length }
      if (failures2.length !== 2) {
        push('C2-FAIL-MARKER-APPEND',
          `E：第二次失败之后失败标记应当是 **2 行**（append-only），实得 ${failures2.length} 行 —— `
          + '覆盖写会把"第一次在哪一刻失败"抹掉（`cand-20261022-0208`：读数 / 产物不许原地重写）')
      }
    }

    rec.readings.card06 = readings
    rec.readings.sheet_name = CARD_SHEET
    rec.readings.clock = setClock(A.roots, NOW).AGENIA_NOW_FILE
    caseFail(problems)
  })
})
