/**
 * `DBY-01` / `DBY-02` · **`F-158`** —— 一天的边界在本地 **04:00**（00:00–03:59 算前一天）。
 *
 * 病根（定形 `.team/leader/2026-10-23/spec-F-158.md`，老板原话逐字）：
 *   「**现在的"每天"是从0点算起的吧，改成从凌晨4点切分，不要在半夜一点我正在干活的时候嚷嚷
 *   "新的一天了，得先派记忆更新呀"**」
 * ⇒ 那一晚 01:02 体检当场红了「今天的记忆更新报告在（reports/memory-update/2026-10-24.json）· 缺」，
 * 而那时整组还在干 10-23 的活。**"新的一天"不该在凌晨一点嚷。**
 *
 * 契约：`CONTRACT.md` §13（§13.1 那一处算、§13.2 四处入口、§13.4 不许动的三样）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 两格 = **切点两侧各一格**，`want` 照契约手写（不从实现反推）：
 *   · `DBY-01` 切点**下方** `2026-10-24T03:59:59+08:00` ⇒ **`2026-10-23`**（前一天）
 *   · `DBY-02` 切点**上方** `2026-10-24T04:00:01+08:00` ⇒ **`2026-10-24`**（当天）
 *
 * 每格量七样（**都不看 stdout 的散文**）：
 *   ① 那一处算（`lib/route.mjs::dayKeyOf`，定形 §落点 3 点名"它本身就是那个函数"）；
 *   ② `daily-start` 的**缺省日** —— 真子进程 + 注入时钟 + payload 里**没有** `day`，
 *      判信封里的 `day` 与**盘上落点** `.team/state/daily/<day>.json`；
 *   ③ `claim-update` 的**缺省日** —— 同上，落点 `state/update/<day>.json`；
 *   ④ `daily-cards.py` 的**缺省日** —— 真 python 子进程，落点是 `.team/leader/<day>/` 那个**目录名**
 *      （跨语言那份切点副本就是它：`.tools/daily-cards.py` 的 `DAY_CUT_HOURS`）；
 *   ⑤ `local-claim` 的**缺省日** —— 本地 CLI，落点 `.team/state/local/<day>.json`；
 *   ⑥ `report-read` 的**缺省日** —— 这是**体检那条红走的同一条路**
 *      （`reports/memory-update/<day>.json`），判信封的 `day` 与它点名的 `path`；
 *   ⑦ `DBY-01` 另判**票号那 8 位**（`tickets.mjs::nextTicketId` 的输入就是同一个 `dayKeyOf`）——
 *      契约 §13.4「已经发出去的号不许重编」，形状也不许跟着日子一起变。
 *
 * 🔴 **为什么要两个时刻各走一遍「四个消费方」**（`F-158` 门 4 评审 F1）：
 *    `claim-update` / `daily-start` / `daily-cards` / `local-claim` 是这一票的**承重句**（"四处同值"）。
 *    只在一个时刻上走一遍，只能把切点夹在一个**很宽**的区间里 —— 例如四处全在 `01:30` 上量，
 *    `DAY_CUT_HOURS` 改成 3 / 5 / 10 / 20 都还是绿的（`01:30 − c` 落到哪一天由 c 决定）。
 *    `03:59:59` 与 `04:00:01` 一夹，**整数小时只能等于 4**：
 *    `03:59:59 ⇒ 10-23` 要求切点 > 3:59:59；`04:00:01 ⇒ 10-24` 要求切点 ≤ 4:00:01。
 *    ⇒ 每一格再配一把**切点刀**（把切点改成 3 / 5 跑一次**副本**），证明这条腿**能翻面**。
 *
 * ⚠️ **`DBY-02` 在两种尺子下同值**（零点尺子给 10-24、04:00 尺子也给 10-24）——
 *    它证明的是"改缺省分支别把切点**上方**也挪走"，不是"切点搬过家"。要让这一格**红**得把切点
 *    **搬晚**到 05:00（`K2`）；`K1`（去掉 −4h）**翻不动它** —— 那是算术，不是判据弱。
 *
 * 边界（这一对不覆盖什么，写清，别假装更宽）：
 *   1. **不改**已写盘的历史 day（`state/update/2026-10-23.json` …）· **不改**已发出的票 / 候选 id ·
 *      **不改**"同一天多场用 `snapshot` 区分"那套 —— 三样都由契约 §13.4 守着，这一对一格都不碰。
 *   2. **不判** `inject.js` 的时间行（`timeLineOf` 贴的是"现在几点"，与"哪一天"无关 —— 那是 `F-104` 的范围）。
 *   3. **不判** 磁盘上"一天的真实长度"（04:00 → 次日 03:59:59）：那件事只有把时钟**连续**走一遍才看得见，
 *      这一对只量切点两侧各一个点。
 */
import { before, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { ENV } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256File, stagingReadings } from '../support/evidence.mjs'
import { stagingExists, stagingPath } from '../support/sut.mjs'
import {
  DAY_ABOVE, DAY_BELOW, DAY_NEXT, DAY_PREV,
  cardsCutKnife, controlArm, legVerdict, makeRoots, probeClaimUpdate, probeDailyCards, probeDailyStart,
  probeLocalClaim, probeReportRead, pythonBin, readLegVerdict,
  stagedDayKeyOf, ticketIdShape,
} from '../support/day-cut.mjs'

before(() => {
  preflight()
})

/** 被测面的字节读数（"我量的是哪一版"，与 `run-all` 的靶子对数分开记）。 */
const SUT_FILES = ['lib/route.mjs', 'lib/tickets.mjs', 'lib/state.mjs', 'bin/agenia-brain.mjs', 'bin/agenia-local.mjs']

function sutReadings() {
  const out = {}
  for (const rel of SUT_FILES) {
    const abs = stagingExists(rel) ? stagingPath(rel) : null
    out[rel] = abs === null ? { missing: true } : { file: abs, bytes: readFileSync(abs).length, sha256: sha256File(abs) }
  }
  return out
}

/** 那一处算这一格的读数（形状错与切点错**分开报** —— 它们要两份不同的修法）。 */
function pureProblems(pure, wantDay, why) {
  const problems = []
  if (!pure.ok && pure.missing) {
    problems.push(problem('SUT-SURFACE-MISSING', `被测面还不在：${pure.rel} —— ${pure.error}（预期的首跑红）`))
    return problems
  }
  if (!pure.ok) {
    problems.push(problem('DBY-PURE-IMPORT', `${pure.rel}::dayKeyOf 调不通：${pure.error}`))
    return problems
  }
  if (typeof pure.day === 'string' && /^\d{8}$/.test(pure.day)) {
    problems.push(problem('DBY-PURE-SHAPE',
      `${pure.rel}::dayKeyOf(${pure.iso}) 返回 ${JSON.stringify(pure.day)} —— 那是**票号**那 8 位（\`YYYYMMDD\`），`
      + '而契约 §13.1 要的日子是 `YYYY-MM-DD`（`isDayKey` / 状态文件 / 报告路径用的都是这一种）。'
      + '⚠️ 收敛时要决定谁派生谁：**带连字符的日子**是那个函数的结果，8 位那一段从它派生（`replaceAll("-", "")`）——'
      + '反过来的话，已经发出去的票号会被这次收敛改写'))
  }
  if (pure.day !== wantDay) {
    problems.push(problem('DBY-PURE-DAY',
      `${pure.rel}::dayKeyOf(${pure.iso}) = ${JSON.stringify(pure.day)}，应当是 ${JSON.stringify(wantDay)} —— ${why}`))
  }
  return problems
}

describe('integration · day boundary (DBY) · F-158 一天从本地 04:00 切', () => {
  test('DBY-01 切点**下方**：2026-10-24T03:59:59 ⇒ 2026-10-23（四个消费方 + 读面 + 票号形状）', async () => {
    await runCase('DBY-01', async (rec) => {
      const problems = []
      const push = (code, message, detail) => problems.push(problem(code, message, detail))
      rec.readings.staging = stagingReadings()
      rec.readings.sut = sutReadings()
      rec.readings.instant = DAY_BELOW
      rec.readings.want = DAY_PREV

      // ── ⓪ 前置 ─────────────────────────────────────────────────────────
      if (!process.env[ENV.NOW_FILE]) {
        push('DBY-CLOCK', `AGENIA_NOW_FILE 没设置（${process.env[ENV.NOW_FILE]}）—— 这一票的日子全靠注入式时钟，缺了它四个消费方量的都是真实时钟`)
      }
      for (const rel of SUT_FILES) {
        if (!stagingExists(rel)) push('SUT-SURFACE-MISSING', `staged 里没有 ${rel}（预期的首跑红）`)
      }
      const py = pythonBin()
      rec.readings.python = py
      if (!py.ok) {
        push('DBY-NO-PYTHON', `daily-cards 那一腿判不了：${py.note} —— 这一格因此只剩三个消费方，"四处同值"不成立。`
          + '🔴 这是**环境**不成立、不是被测对象的红')
      }

      // ── ① 那一处算 ──────────────────────────────────────────────────────
      const pure = await stagedDayKeyOf(DAY_BELOW)
      rec.readings.pure_function = pure
      for (const p of pureProblems(pure, DAY_PREV,
        '切点**下方**（00:00–03:59）属于**前一天**：本地时间减 4 小时再取日期')) problems.push(p)

      // ── ②③④⑤ 四个消费方的缺省日（真子进程；payload / 命令行里**没有** day）──
      //    每一腿一副**全新**的根：指针会让缺省值拐弯（那一条由 `DBY-06` 单独判）。
      const legs = []
      {
        const roots = makeRoots('DBY-01', 'daily-start')
        legs.push({ label: 'daily-start', probe: probeDailyStart(roots, DAY_BELOW), roots })
      }
      {
        const roots = makeRoots('DBY-01', 'claim-update')
        legs.push({ label: 'claim-update', probe: probeClaimUpdate(roots, DAY_BELOW), roots })
      }
      {
        const roots = makeRoots('DBY-01', 'daily-cards')
        legs.push({ label: 'daily-cards', probe: probeDailyCards(roots, DAY_BELOW), roots })
      }
      {
        const roots = makeRoots('DBY-01', 'local-claim')
        legs.push({ label: 'local-claim', probe: probeLocalClaim(roots, DAY_BELOW), roots })
      }
      for (const leg of legs) {
        const v = legVerdict(leg.label, leg.probe, DAY_PREV)
        for (const p of v.problems) push(p.code, p.message)
      }
      rec.readings.write_legs = legs.map((l) => ({ label: l.label, workspace: l.roots.ws, brain: l.roots.brain, ...l.probe }))
      rec.readings.cut_squeeze = {
        below: `${DAY_BELOW} ⇒ ${DAY_PREV}（切点必须 > 3:59:59）`,
        above: `${DAY_ABOVE} ⇒ ${DAY_NEXT}（切点必须 ≤ 4:00:01）`,
        why: '两个方向合起来，整数小时的切点只能等于 4 —— 单独一个 01:30 只能把它夹在 (1.5h, 25.5h) 里',
      }

      // ── ④' Python 那份切点的**刀**：改成 3 小时 ⇒ 这一刻必须落到 10-24（腿当场翻面）──
      {
        const roots = makeRoots('DBY-01', 'cards-knife-3h')
        const knife = cardsCutKnife(roots, DAY_BELOW, 3)
        rec.readings.cards_knife = knife
        if (!knife.ok) {
          push('DBY-CARDS-KNIFE', `Python 切点刀没跑起来：${knife.why} —— 这一刀切不动 ⇒ 这条腿"能翻面"没有证据`
            + '（切点那一行改名 / 换写法了？回来重新对准 `.tools/daily-cards.py` 的 `DAY_CUT_HOURS`）')
        } else if (knife.day !== DAY_NEXT) {
          push('DBY-CARDS-KNIFE-NO-BITE', `切点改成 3 小时之后，${DAY_BELOW} 仍落到 ${JSON.stringify(knife.day)}（应当是 ${DAY_NEXT}）`
            + ' —— 这说明 `daily-cards` 那一腿**不是**靠那个切点算出日子的（它有第二套算法，或这一腿本来就不看切点）')
        }
      }

      // ── ⑤ 读面：体检那条红走的同一条路 ────────────────────────────────────
      const reportRoots = makeRoots('DBY-01', 'report-read')
      const report = probeReportRead(reportRoots, DAY_BELOW)
      rec.readings.report_read = { brain: reportRoots.brain, ...report }
      for (const p of readLegVerdict('report-read', report, DAY_PREV)) push(p.code, p.message)

      // ── ⑥ 票号那 8 位（契约 §13.4：形状不许跟着变）────────────────────────
      const ticket = await ticketIdShape(DAY_BELOW)
      rec.readings.ticket_id = ticket
      if (!ticket.shape_ok) {
        push('DBY-TICKET-SHAPE',
          `\`nextTicketId([], dayKeyOf(${DAY_BELOW}))\` = ${JSON.stringify(ticket.id)} —— 形状必须是 \`ticket-<8 位>-<NN>\``
          + '（契约 §13.4：日子换了形状，**票号那 8 位不许跟着变**；已发出的号不重编）')
      }

      // ── ⑦ 阳性对照 + 本格拥有的那把刀（K1：去掉 −4h）─────────────────────
      const control = await controlArm('K1-NO-OFFSET')
      rec.readings.controls = control.readings
      for (const p of control.problems) push(p.code, p.message)

      // ── ⑧ 边界（写清这一格不假装覆盖得更宽）──────────────────────────────
      rec.readings.boundary = {
        not_history: '**不碰**已写盘的历史 day（`state/update/*.json` / `reports/memory-update/*.json` / 快照版本号）—— 它们记的是当时的账（契约 §13.4）',
        not_injector_time_line: '**不判** `inject.js` 的时间行（`timeLineOf` 是"现在几点"，与"哪一天"无关 —— `F-104` 的范围）',
        not_day_length: '**不判**"一天的真实长度"（04:00 → 次日 03:59:59）：这一格只量切点下方一个点',
        clock: '时间全部走**运行根那一份** `AGENIA_NOW_FILE`（`run-all.mjs` 导出的同一份文件；跑完逐字节还原）',
        why_k1_cannot_flip_above: '`K1`（去掉 −4h）翻不动 `DBY-02`：04:00:01 在两种尺子下都是 10-24（算术，不是判据弱）',
      }

      caseFail(problems)
    })
  })

  test('DBY-02 切点**上方**：2026-10-24T04:00:01 ⇒ 2026-10-24（同一批四个消费方，方向相反）', async () => {
    await runCase('DBY-02', async (rec) => {
      const problems = []
      const push = (code, message, detail) => problems.push(problem(code, message, detail))
      rec.readings.staging = stagingReadings()
      rec.readings.sut = sutReadings()
      rec.readings.instant = DAY_ABOVE
      rec.readings.want = DAY_NEXT

      if (!process.env[ENV.NOW_FILE]) {
        push('DBY-CLOCK', 'AGENIA_NOW_FILE 没设置 —— 这一票的日子全靠注入式时钟，缺了它四个消费方量的都是真实时钟')
      }
      for (const rel of SUT_FILES) {
        if (!stagingExists(rel)) push('SUT-SURFACE-MISSING', `staged 里没有 ${rel}（预期的首跑红）`)
      }
      const py = pythonBin()
      rec.readings.python = py
      if (!py.ok) {
        push('DBY-NO-PYTHON', `daily-cards 那一腿判不了：${py.note} —— 这一格因此只剩三个消费方。`
          + '🔴 这是**环境**不成立、不是被测对象的红')
      }

      // ── ① 那一处算 ──────────────────────────────────────────────────────
      const pure = await stagedDayKeyOf(DAY_ABOVE)
      rec.readings.pure_function = pure
      for (const p of pureProblems(pure, DAY_NEXT,
        '切点**上方**（04:00–23:59）就是**当天**：减 4 小时之后仍落在同一天')) problems.push(p)

      // ── ②③④⑤ 四个消费方的缺省日（同一批入口，方向相反）──────────────────────
      const legs = []
      {
        const roots = makeRoots('DBY-02', 'daily-start')
        legs.push({ label: 'daily-start', probe: probeDailyStart(roots, DAY_ABOVE), roots })
      }
      {
        const roots = makeRoots('DBY-02', 'claim-update')
        legs.push({ label: 'claim-update', probe: probeClaimUpdate(roots, DAY_ABOVE), roots })
      }
      {
        const roots = makeRoots('DBY-02', 'daily-cards')
        legs.push({ label: 'daily-cards', probe: probeDailyCards(roots, DAY_ABOVE), roots })
      }
      {
        const roots = makeRoots('DBY-02', 'local-claim')
        legs.push({ label: 'local-claim', probe: probeLocalClaim(roots, DAY_ABOVE), roots })
      }
      for (const leg of legs) {
        const v = legVerdict(leg.label, leg.probe, DAY_NEXT)
        for (const p of v.problems) push(p.code, p.message)
      }
      rec.readings.write_legs = legs.map((l) => ({ label: l.label, workspace: l.roots.ws, brain: l.roots.brain, ...l.probe }))
      rec.readings.cut_squeeze = {
        below: `${DAY_BELOW} ⇒ ${DAY_PREV}（切点必须 > 3:59:59）`,
        above: `${DAY_ABOVE} ⇒ ${DAY_NEXT}（切点必须 ≤ 4:00:01）`,
        why: '这一格是上半夹：切点若被搬到 5 小时，这一刻会落回 10-23 —— 由下面那把刀证明',
      }

      // ── ④' Python 那份切点的**刀**：改成 5 小时 ⇒ 这一刻必须落回 10-23（腿当场翻面）──
      {
        const roots = makeRoots('DBY-02', 'cards-knife-5h')
        const knife = cardsCutKnife(roots, DAY_ABOVE, 5)
        rec.readings.cards_knife = knife
        if (!knife.ok) {
          push('DBY-CARDS-KNIFE', `Python 切点刀没跑起来：${knife.why} —— 这一刀切不动 ⇒ 这条腿"能翻面"没有证据`
            + '（切点那一行改名 / 换写法了？回来重新对准 `.tools/daily-cards.py` 的 `DAY_CUT_HOURS`）')
        } else if (knife.day !== DAY_PREV) {
          push('DBY-CARDS-KNIFE-NO-BITE', `切点改成 5 小时之后，${DAY_ABOVE} 仍落到 ${JSON.stringify(knife.day)}（应当是 ${DAY_PREV}）`
            + ' —— 这说明 `daily-cards` 那一腿**不是**靠那个切点算出日子的（它有第二套算法，或这一腿本来就不看切点）')
        }
      }

      // ── ⑤ 读面 ──────────────────────────────────────────────────────────
      const reportRoots = makeRoots('DBY-02', 'report-read')
      const report = probeReportRead(reportRoots, DAY_ABOVE)
      rec.readings.report_read = { brain: reportRoots.brain, ...report }
      for (const p of readLegVerdict('report-read', report, DAY_NEXT)) push(p.code, p.message)

      // ── ⑥ 阳性对照 + 本格拥有的那把刀（K2：切点搬到 05:00）────────────────
      const control = await controlArm('K2-CUT-TOO-LATE')
      rec.readings.controls = control.readings
      for (const p of control.problems) push(p.code, p.message)

      rec.readings.boundary = {
        why_this_side_must_not_move: '切点上方在**两种尺子下同值**（零点尺子 10-24、04:00 尺子 10-24）⇒ 这一格是"别把切点上方也挪走"的锁；'
          + '它今天就算绿，也**不是**"边界对了"的证据 —— 边界由 `DBY-01` 证。',
        why_k2_exists: '`K1` 翻不动这一格（算术），所以让它红的那把刀是 `K2`（切点搬到 05:00）—— 没有 `K2`，这一格就是装饰',
        not_history: '**不碰**已写盘的历史 day / 已发出的票与候选 id / `snapshot` 那套（契约 §13.4）',
        clock: '时间全部走运行根那一份 `AGENIA_NOW_FILE`（跑完逐字节还原）',
      }

      caseFail(problems)
    })
  })
})
