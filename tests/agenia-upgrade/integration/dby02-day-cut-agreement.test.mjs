/**
 * `DBY-03` / `DBY-04` / `DBY-06` · **`F-158`** —— 四处入口的"今天"必须是**同一个**日子，**显式 day 仍然优先**，
 * 而"给了但坏"的日子**当场拒**（不吞成"没给"）。
 *
 * 契约：`CONTRACT.md` §13.2（四处入口同一把尺子）· §13.3（显式 day 优先 / 给了但坏）。
 * 定形：`.team/leader/2026-10-23/spec-F-158.md` 验收口径 #3 / #4。
 * 门 4 评审（`.team/review/2026-10-24/F-158-第4关-评审.md`）F3 / F4 的两个落点，组长 2026-10-24 已拍板：
 *   · F3：**给了（含 `""` 与全空白）就必须是 day key，否则 `E_ARG_SCHEMA`** —— 一条规则，四个消费方同一个说法；
 *   · F4(b)：`claim-update` / `daily-start` 的**缺省日只看时钟**；`current-day` 指针留给**中途** op。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * `DBY-03`（同一时刻 `2026-10-24T01:30:00+08:00` —— 老板那张现场：凌晨一点半还在干 10-23 的活）
 *   四处入口**都不给 day**（payload / 命令行里没有这个键），四处都必须落到 **`2026-10-23`**：
 *     · `claim-update`（脑 CLI）—— 判信封 `day` + 盘上 `state/update/<day>.json`
 *     · `daily-start`（脑 CLI）—— 判信封 `day` + 盘上 `.team/state/daily/<day>.json`
 *     · `daily-cards.py`（python 固定生成器）—— 判它把卡落进的**目录名** `.team/leader/<day>/`
 *     · `local-claim`（本地 CLI）—— 判信封 `state.day` + 盘上 `.team/state/local/<day>.json`
 *   外加一条**互相一致**：四个值必须**同值**（四处各自对、但不相同也是错的 —— 那说明有两把尺子）。
 *
 * 这一格是**回归锁**：四处都有缺省、都走同一处算。它红只有四种成因，红因码分得开 ——
 *   `DBY-WRONG-DAY-<入口>`（某处又另算一遍）· `DBY-NO-DEFAULT-<入口>`（某处又变回必填）·
 *   `DBY-LEG-FAILED-<入口>`（这一腿没量到）· `DBY-CONSUMERS-DISAGREE` / `DBY-CONSUMERS-WRONG-DAY`
 *   （四处彼此不同 / 一起错）。它绿**不说明**切点被钉住 —— 切点由 `DBY-01` / `DBY-02` 各自的刀钉。
 *
 * `DBY-04`（**显式 day 的两种形态**）：
 *   (a) **好值照抄**，两个方向：
 *     · 显式 `2026-10-23` @ `04:00:01`（那一刻缺省会算成 `2026-10-24`）⇒ 必须仍是 `2026-10-23`；
 *     · 显式 `2026-10-24` @ `01:30`（那一刻缺省会算成 `2026-10-23`）⇒ 必须仍是 `2026-10-24`。
 *     两个方向**都要**：只给一个方向的话，"把显式值也过一遍 −4h"这种半修（`2026-10-23` 变成 `2026-10-22`）
 *     会**看不出来** —— 那正好是这次收敛最可能造出来的 bug。
 *   (b) **给了但坏 ⇒ 当场拒**：`day` 给 `BAD_DAYS` 里那四个值时，`claim-update` / `daily-start` /
 *     `daily-cards` / `local-claim` / `report-read` **五处都必须是 `E_ARG_SCHEMA`**。不许有一处把它
 *     吞成"没给"（同一个 `{"day": ""}` 曾经有三个消费方三种行为 —— 这条规则治的正是它）。
 *     四个值分两组：**不成形状**（`""` / 全空白）与**形状合规、日历上不存在**（`2026-13-40` / `2026-02-30`）——
 *     `isDayKey` 连**日历往返**一起验（Python 那份是 `datetime.strptime`），所以两组同命。
 *     ⚠️ 边界：形状合规**且**日历合法、只是"没人会写"的日子（如 `1999-01-01`）仍然被收下 ——
 *     那不是校验能管的事，这一格不判它。
 *
 * `DBY-06`（**根上有过期的 `current-day` 指针** —— 契约 §13.2 的裁定）：
 *   真实脑根不是一次性的：`claim-update` 成功之后会写 `state/current-day.json`。在一个**已经 claim 过、
 *   而新的一天还没开始**的根上，缺省日若跟着指针走，它就永远回到上一次 claim 的那一天 ——
 *   04:00 的切点会**静默失效**（这正是 `F-158` 让这条路变得可达的原因）。
 *   ⇒ 现场：根上 `current-day = 2026-10-23`、时钟 `2026-10-24T11:00:00+08:00`、不给 `day`：
 *   `claim-update` / `daily-start` 必须落到 **`2026-10-24`**（另外两个消费方的读数一并记下，只作读数）。
 *   🔴 **两条腿各有各的根、各自种一次过期指针**：`claim-update` 跑完会把这个指针写成 `10-24`，
 *   共用一副根时后跑的 `daily-start` 看到的不再是过期指针 ⇒ 一个**退回指针**的实现照样绿。
 *   每条腿开跑前从盘上读回指针（`readCurrentDayPointer`）当**见证** —— 现场是盘上事实，不是调用顺序。
 *
 * 边界：
 *   1. 这一组**不判** `daily-start` 的其余字段（`first_*` / `seen_count` 那套是 `DLY-01` 的事）。
 *   2. `DBY-03` / `DBY-04` 每格一个**全新的脑根**（没有指针），量的是"时钟那一支"；**指针那一支**由 `DBY-06` 单独判。
 *   3. **不判** `daily-cards.py` 产出的 xlsx 内容（那归卡片自己的判据）；只判它**用了哪一天**。
 *   4. `daily-cards.py` 那一档需要能在 E 盘上 `import openpyxl` 的 python：
 *      **找不到 ⇒ 这一格红**，红因码 `DBY-NO-PYTHON` 明写"这是**环境**不成立、不是被测对象的红"
 *      （与 `route-updater` 的 `NOW-FILE-ABSENT` 同一条规矩：前置不成立要**出声**，不许静默跳过）。
 */
import { before, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { ENV, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256File, stagingReadings } from '../support/evidence.mjs'
import { stagingExists, stagingPath } from '../support/sut.mjs'
import {
  AGREEMENT_NOW, AGREEMENT_PREV, BAD_DAYS, DAY_ABOVE, DAY_NEXT, DAY_PREV, STALE_POINTER_AT, STALE_POINTER_DAY,
  badDaySlug, badDayVerdict, cardsClassifierProblems, controlArm, legVerdict, makeRoots,
  probeClaimUpdate, probeDailyCards, probeDailyStart, probeLocalClaim, probeReportRead, pythonBin,
  readCurrentDayPointer, rulesControlArm, writeCurrentDayPointer,
} from '../support/day-cut.mjs'

before(() => {
  preflight()
})

const SUT_FILES = ['lib/route.mjs', 'lib/state.mjs', 'bin/agenia-brain.mjs', 'bin/agenia-local.mjs', '.tools/daily-cards.py']

function sutReadings() {
  const out = {}
  for (const rel of SUT_FILES) {
    // `.tools/daily-cards.py` 是**仓库里**的工具（不是预设的一部分）⇒ 读仓库那一份；其余读 staged 那一份。
    const abs = rel.startsWith('.tools/')
      ? `${PATHS.repo}\\${rel.replace(/\//g, '\\')}`
      : (stagingExists(rel) ? stagingPath(rel) : null)
    let bytes = null
    let sha256 = null
    if (abs !== null) {
      try {
        bytes = readFileSync(abs).length
        sha256 = sha256File(abs)
      } catch {
        bytes = null
        sha256 = null
      }
    }
    out[rel] = abs === null || bytes === null ? { missing: true, file: abs } : { file: abs, bytes, sha256 }
  }
  return out
}

/**
 * 四条腿（同一时刻、同一件事）。`explicit` = 命令行 / payload 里给的显式 day（`null` = 不给，量缺省）。
 * 每格一个**全新**的工作区 + 脑根（脑根共用会让 `current-day` 指针把缺省值拐到上一次那一格去）。
 */
function runFourLegs(caseId, tag, { nowIso, explicit }) {
  const legs = []
  {
    const roots = makeRoots(caseId, `${tag}-daily-start`)
    legs.push({ label: 'daily-start', kind: 'write', roots, probe: probeDailyStart(roots, nowIso, explicit) })
  }
  {
    const roots = makeRoots(caseId, `${tag}-claim-update`)
    legs.push({ label: 'claim-update', kind: 'write', roots, probe: probeClaimUpdate(roots, nowIso, explicit) })
  }
  {
    const roots = makeRoots(caseId, `${tag}-daily-cards`)
    legs.push({ label: 'daily-cards', kind: 'write', roots, probe: probeDailyCards(roots, nowIso, explicit) })
  }
  {
    const roots = makeRoots(caseId, `${tag}-local-claim`)
    legs.push({ label: 'local-claim', kind: 'write', roots, probe: probeLocalClaim(roots, nowIso, explicit) })
  }
  return legs.map((l) => ({ ...l, probe: { ...l.probe, instant: nowIso } }))
}

/** 四条腿的读数 + 判据。`wantDay` = 这一格四处该落到的那一天。 */
function judgeFourLegs(legs, wantDay, push, readings) {
  const days = {}
  for (const leg of legs) {
    const v = legVerdict(leg.label, leg.probe, wantDay)
    for (const p of v.problems) push(p.code, p.message)
    if (leg.probe.kind === 'resolved') days[leg.label] = leg.probe.day
  }
  const got = Object.entries(days)
  if (got.length === 4) {
    const values = [...new Set(got.map(([, d]) => d))]
    if (values.length !== 1) {
      push('DBY-CONSUMERS-DISAGREE',
        `四处入口在**同一个时刻**给出了 ${values.length} 个不同的日子：${JSON.stringify(days)} —— `
        + '契约 §13.2 要的是"一处算、四处用"；两个值就说明有第二把尺子（或某处把结果又换算了一次）')
    }
    if (values.length === 1 && values[0] !== wantDay) {
      push('DBY-CONSUMERS-WRONG-DAY',
        `四处入口**一致**地落在 ${JSON.stringify(values[0])}，都应当是 ${JSON.stringify(wantDay)} —— `
        + '四处同值还不够：一起错也是一种同值（§13.2 判两层：各自对 + 互相相同）')
    }
  }
  readings.consumer_days = days
  readings.agreed = got.length === 4 ? [...new Set(got.map(([, d]) => d))] : null
}

describe('integration · day cut agreement (DBY) · F-158 四处入口同一把尺子 + 显式优先', () => {
  test('DBY-03 凌晨 01:30：四个入口的缺省日必须都是前一天（2026-10-23）', async () => {
    await runCase('DBY-03', async (rec) => {
      const problems = []
      const push = (code, message, detail) => problems.push(problem(code, message, detail))
      rec.readings.staging = stagingReadings()
      rec.readings.sut = sutReadings()
      rec.readings.instant = AGREEMENT_NOW
      rec.readings.want = AGREEMENT_PREV

      if (!process.env[ENV.NOW_FILE]) {
        push('DBY-CLOCK', 'AGENIA_NOW_FILE 没设置 —— 四个入口的日子全靠注入式时钟，缺了它量的是真实时钟')
      }
      for (const rel of ['lib/route.mjs', 'bin/agenia-brain.mjs', 'bin/agenia-local.mjs']) {
        if (!stagingExists(rel)) push('SUT-SURFACE-MISSING', `staged 里没有 ${rel}（预期的首跑红）`)
      }
      const py = pythonBin()
      rec.readings.python = py
      if (!py.ok) {
        // 前置不成立 ⇒ 出声（红因点名"是环境"；与 route-updater 的 NOW-FILE-ABSENT 同一条规矩）。
        push('DBY-NO-PYTHON', `daily-cards 那一档判不了：${py.note} —— 这一格因此只剩三条腿，"四处一致"不成立。`
          + '🔴 这是**环境**不成立、不是被测对象的红')
      }

      const legs = runFourLegs('DBY-03', 'agreement', { nowIso: AGREEMENT_NOW, explicit: null })
      rec.readings.legs = legs.map((l) => ({ label: l.label, workspace: l.roots.ws, brain: l.roots.brain, ...l.probe }))
      judgeFourLegs(legs, AGREEMENT_PREV, push, rec.readings)

      const control = await controlArm('K3-ONE-CONSUMER-BYPASS')
      rec.readings.controls = control.readings
      for (const p of control.problems) push(p.code, p.message)

      // ── ④ 量具自证（门 4 评审 F2）：`resolved` 之前必须 `exit_code === 0` ──────────
      //    `daily-cards.py:140` 在**读数据之前**就 `os.makedirs(out_dir)` ⇒ "崩在目录建好之后"也会留下一个
      //    以日子命名的目录。只按目录名判绿，"进程 exit 1、卡没出"与"进程 exit 0、卡出了"长得一模一样。
      //    四行合成读数（不跑 python）：`CLS-3` 就是那条 —— 它不判 `failed`，F2 就是没修。
      const classifier = cardsClassifierProblems()
      rec.readings.cards_classifier = classifier.rows
      for (const p of classifier.problems) push(p.code, p.message)

      rec.readings.boundary = {
        fresh_brain_per_leg: '每格一副**全新**脑根 ⇒ 没有 `current-day` 指针 ⇒ 量的是"时钟那一支"（指针那一支由 `DBY-06` 判）',
        daily_fields: '`daily-start` 的其余字段（`first_*` / `seen_count`）归 `DLY-01`，这里只判日子',
        cards_content: '`daily-cards.py` 只判**用了哪一天**（落点目录名 + 退出码），不判 xlsx 内容',
        no_default_is_a_regression_now: '四处**都有缺省** ⇒ `DBY-NO-DEFAULT-<入口>` 只会在"某一处又变回必填"时'
          + '出现（那是回归信号）；这一格的绿**不说明**切点被钉住 —— 切点由 `DBY-01` / `DBY-02` 各自的刀钉',
      }

      caseFail(problems)
    })
  })

  test('DBY-04 显式 day 的两种形态：**好值照抄**（两个方向）· **给了但坏当场拒**（`""` / 全空白 × 五个消费方）', async () => {
    await runCase('DBY-04', async (rec) => {
      const problems = []
      const push = (code, message, detail) => problems.push(problem(code, message, detail))
      rec.readings.staging = stagingReadings()
      rec.readings.sut = sutReadings()

      if (!process.env[ENV.NOW_FILE]) {
        push('DBY-CLOCK', 'AGENIA_NOW_FILE 没设置 —— 这一格要把时钟摆在"缺省会算错"的位置上，缺了它就量不出"显式优先"')
      }
      const py = pythonBin()
      rec.readings.python = py
      if (!py.ok) push('DBY-NO-PYTHON', `daily-cards 那一档判不了：${py.note}`)

      // ① 显式 = 前一天，时钟在**切点上方**（缺省会算成 2026-10-24）⇒ 必须仍是 2026-10-23
      const a = {
        title: '① 显式 2026-10-23 @ 04:00:01（缺省会算成 2026-10-24）',
        now: DAY_ABOVE,
        explicit: DAY_PREV,
        want: DAY_PREV,
      }
      // ② 显式 = 当天，时钟在**切点下方**（缺省会算成 2026-10-23）⇒ 必须仍是 2026-10-24
      const b = {
        title: '② 显式 2026-10-24 @ 01:30（缺省会算成 2026-10-23）',
        now: AGREEMENT_NOW,
        explicit: DAY_NEXT,
        want: DAY_NEXT,
      }
      rec.readings.directions = []
      for (const dir of [a, b]) {
        const legs = runFourLegs('DBY-04', dir.explicit === DAY_PREV ? 'explicit-prev' : 'explicit-next', { nowIso: dir.now, explicit: dir.explicit })
        const row = {
          title: dir.title,
          now: dir.now,
          explicit: dir.explicit,
          want: dir.want,
          legs: legs.map((l) => ({ label: l.label, day: l.probe.day, kind: l.probe.kind, exit_code: l.probe.exit_code, files: l.probe.files, error_code: l.probe.error_code })),
        }
        rec.readings.directions.push(row)
        judgeFourLegs(legs, dir.want, push, row)
      }

      const control = await controlArm('K4-EXPLICIT-IGNORED')
      rec.readings.controls = control.readings
      for (const p of control.problems) push(p.code, p.message)

      // ── ③ **给了但坏 ⇒ 当场拒**（契约 §13.3；门 4 评审 F3 的落点）────────────────────────────
      //    同一个 `{"day": ""}` 曾经有三个消费方三种行为：`claim-update` 拒、`local-*` 当"没给"、
      //    `daily-start` / `report-read` 静默走指针/时钟。现在**一条规则**：给了（含 `""` 与全空白）
      //    就必须是 day key，否则 `E_ARG_SCHEMA`。五条腿（四个消费方 + 读面）逐个问一遍。
      //    四个坏值分两组，走**同一条**规则：不成形状（`""` / 全空白）与形状合规、日历上不存在
      //    （`2026-13-40` / `2026-02-30`）—— 后者是 `isDayKey` 连日历往返一起验之后才成立的；
      //    它们和空串一样**必须**由五条腿全拒，多一条也拒得掉的就不是"同一条规则"。
      rec.readings.bad_days = []
      for (const bad of BAD_DAYS) {
        const tag = badDaySlug(bad)
        const rootsFor = (name) => makeRoots('DBY-04', `bad-${tag}-${name}`)
        const rows = [
          { label: 'claim-update', probe: probeClaimUpdate(rootsFor('claim-update'), AGREEMENT_NOW, bad) },
          { label: 'daily-start', probe: probeDailyStart(rootsFor('daily-start'), AGREEMENT_NOW, bad) },
          { label: 'daily-cards', probe: probeDailyCards(rootsFor('daily-cards'), AGREEMENT_NOW, bad) },
          { label: 'local-claim', probe: probeLocalClaim(rootsFor('local-claim'), AGREEMENT_NOW, bad) },
          { label: 'report-read', probe: probeReportRead(rootsFor('report-read'), AGREEMENT_NOW, bad) },
        ]
        for (const row of rows) {
          for (const p of badDayVerdict(row.label, row.probe, bad)) push(p.code, p.message)
        }
        rec.readings.bad_days.push({
          value: bad,
          root_tag: tag,
          legs: rows.map((r) => ({
            label: r.label, kind: r.probe.kind, day: r.probe.day,
            exit_code: r.probe.exit_code ?? null, error_code: r.probe.error_code ?? null, message: r.probe.message ?? null,
          })),
        })
      }
      // 一句话回答"这四个输入里，到底哪个真的被拒了"（门 4 评审 F3 的原始问题）—— 逐条点名，不写形容词。
      rec.readings.bad_days_summary = rec.readings.bad_days.map((row) => ({
        value: row.value,
        rejected_E_ARG_SCHEMA: row.legs.filter((l) => l.error_code === 'E_ARG_SCHEMA').map((l) => l.label),
        not_rejected: row.legs
          .filter((l) => l.error_code !== 'E_ARG_SCHEMA')
          .map((l) => `${l.label}（${l.kind}${l.exit_code === 0 ? ' · exit 0' : ` · exit ${l.exit_code}`}）`),
      }))

      // ── ④ 阳性对照 + 本格拥有的那两把刀（K4 显式被吞 · K5 空串被吞）──────────────
      const rules = await rulesControlArm('K5-EMPTY-SWALLOWED')
      rec.readings.rules_controls = rules.readings
      for (const p of rules.problems) push(p.code, p.message)

      rec.readings.boundary = {
        why_two_directions: '只给一个方向的话，"把显式值也过一遍 −4h"这种半修（2026-10-23 ⇒ 2026-10-22）**看不出来** —— 那正是这次收敛最可能的 bug',
        what_this_cell_is: '两半都是**回归锁**：① 显式 day 优先（两个方向都要，半修只在一个方向上看得出来）；'
          + '② 给了但坏当场拒 —— 四个坏值 × 五条腿，任一处把它吞成"没给"就是 `DBY-BAD-DAY-ACCEPTED-<入口>`',
        calendar_leg: '`2026-13-40` / `2026-02-30` 与 `""` / 全空白走的是**同一条**规则（§13.3），不是两条：'
          + '`day` 一旦给出就必须是 day key，而 `isDayKey` 的"是"包含日历往返（Python 那份是 `datetime.strptime`）',
        fabricated_but_valid_still_accepted: '⚠️ 边界：形状合规**且**日历合法、只是没人会写的日子（如 `1999-01-01`）'
          + '**仍然被收下** —— `isDayKey` 判的是"这一天存在"，不是"这一天像今天"。这一格不判它',
        not_default_source: '**不判**缺省日的来源次序：好值那一半每格一个全新脑根（没有指针）；指针那一支由 `DBY-06` 判',
        python_reject_code: '`daily-cards.py` 拒坏值时用 `E_ARG_SCHEMA:` 前缀（本套件按 `E_CLOCK_FILE` 同一个约定从 stderr 读码）'
          + '—— 只 exit 非零、不给码 ⇒ `DBY-BAD-DAY-CODE-daily-cards`（拒得对、码不对）',
      }

      caseFail(problems)
    })
  })

  test('DBY-06 根上有**过期**的 current-day 指针：缺省日仍须是"今天"（2026-10-24）', async () => {
    await runCase('DBY-06', async (rec) => {
      const problems = []
      const push = (code, message, detail) => problems.push(problem(code, message, detail))
      rec.readings.staging = stagingReadings()
      rec.readings.sut = sutReadings()
      rec.readings.scenario = {
        current_day_pointer: STALE_POINTER_DAY,
        clock: STALE_POINTER_AT,
        payload_day: '(不给)',
        why: '`claim-update` 成功之后会写 `current-day`；在一个已经 claim 过、而新的一天还没开始的根上，'
          + '缺省日若跟着指针走，它就永远回到上一次 claim 的那一天 —— 本地 04:00 的切点**静默失效**。',
        fresh_root_per_leg: '两条写入口**各有各的脑根**、各自种一次过期指针：`claim-update` 会把指针写成 10-24，'
          + '共用一副根时后跑的 `daily-start` 已经看不见过期指针 ⇒ 退回指针的实现照样绿（门 4 复审 R1）',
      }
      if (!process.env[ENV.NOW_FILE]) {
        push('DBY-CLOCK', 'AGENIA_NOW_FILE 没设置 —— 这一格要把时钟摆在"指针之后、切点之上"，缺了它就量不出缺省日去哪')
      }
      const py = pythonBin()
      rec.readings.python = py
      if (!py.ok) push('DBY-NO-PYTHON', `daily-cards 那一腿判不了（只作读数）：${py.note}`)

      // ── ① 两个**写入口**：缺省日必须只看时钟（10-24），不许跟那个过期指针（10-23）────────
      //    每一条腿一副**自己的**脑根，开跑前重新种一次过期指针 —— 这才是"一次全新运行看到的现场"。
      //    种完从盘上读回来当见证：现场必须是**盘上事实**（`pointer_at_start.day === 10-23`），
      //    不能靠"我先种过了"这个顺序约定（门 4 复审 R1 就是这么找到洞的）。
      const legs = []
      for (const leg of [
        { label: 'claim-update', probe: probeClaimUpdate },
        { label: 'daily-start', probe: probeDailyStart },
      ]) {
        const roots = makeRoots('DBY-06', `stale-${leg.label}`)
        const pointerFile = writeCurrentDayPointer(roots.brain, STALE_POINTER_DAY)
        const atStart = readCurrentDayPointer(roots.brain)
        if (!atStart.ok || atStart.day !== STALE_POINTER_DAY) {
          push('DBY-06-POINTER-NOT-SEEDED',
            `${leg.label}：这一腿开跑前，盘上的 \`current-day\` 是 ${JSON.stringify(atStart.day)}（${atStart.why || '种进去的不是过期指针'}），`
            + `应当是 ${JSON.stringify(STALE_POINTER_DAY)} —— 现场没立起来，这一腿量不到"缺省日会不会跟指针"`)
        }
        const probe = leg.probe(roots, STALE_POINTER_AT)
        legs.push({
          label: leg.label,
          want: DAY_NEXT,
          roots,
          probe,
          pointer: { file: pointerFile, at_start: atStart.day, after: readCurrentDayPointer(roots.brain).day },
        })
      }
      for (const leg of legs) {
        const v = legVerdict(leg.label, leg.probe, leg.want)
        for (const p of v.problems) push(p.code, p.message)
      }
      rec.readings.write_legs = legs.map((l) => ({ label: l.label, want: l.want, ...l.probe }))
      // 指针读数**按腿记**：`at_start` 是这条腿看见的现场，`after` 是它跑完留下的（`claim-update` 会写 10-24）。
      // 两条腿的 `at_start` 必须都是 10-23 —— 这是"各自的根"的证据，也是旧写法（共用根 + 读数取在两条腿之前）
      // 读不出来的东西。
      rec.readings.pointer_witness = legs.map((l) => ({
        label: l.label,
        file: l.pointer.file,
        brain: l.roots.brain,
        at_start: l.pointer.at_start,
        after: l.pointer.after,
        seeded_stale: l.pointer.at_start === STALE_POINTER_DAY,
      }))

      // ── ② 另外两个消费方：**只记读数**（本票没把它们的缺省日改口径，见契约 §13.2 的裁定）──
      const readOnly = []
      {
        const roots = makeRoots('DBY-06', 'stale-pointer-cards')
        writeCurrentDayPointer(roots.brain, STALE_POINTER_DAY)
        readOnly.push({ label: 'daily-cards', probe: probeDailyCards(roots, STALE_POINTER_AT) })
      }
      {
        const roots = makeRoots('DBY-06', 'stale-pointer-local')
        writeCurrentDayPointer(roots.brain, STALE_POINTER_DAY)
        readOnly.push({ label: 'local-claim', probe: probeLocalClaim(roots, STALE_POINTER_AT) })
      }
      rec.readings.consumer_readings = readOnly.map((r) => ({
        label: r.label, kind: r.probe.kind, day: r.probe.day, exit_code: r.probe.exit_code ?? null,
        note: '读数：本票只把 `claim-update` / `daily-start` 的缺省改成"只看时钟"；另两处不在这一格的断言面里',
      }))

      // ── ③ 阳性对照 + 本格拥有的那把刀（K6：缺省日跟指针走）─────────────────────
      const rules = await rulesControlArm('K6-POINTER-WINS')
      rec.readings.rules_controls = rules.readings
      for (const p of rules.problems) push(p.code, p.message)

      rec.readings.boundary = {
        what_this_cell_guards: '契约 §13.2：`claim-update` / `daily-start` 的缺省日**只看时钟**，指针留给中途 op。'
          + '两条写入口各有各的根、各有一个过期指针在场 ⇒ 谁退回指针，谁那一腿当场 `DBY-WRONG-DAY-<入口>`',
        how_the_tooth_was_measured: '门 4 复审 R1 要的"这一腿能不能红"是**真跑**量出来的：把 staged 的 '
          + '`opDailyStart` 那一行改成传 `{ pointer: true }`（副本住在运行根，`presets/**` 零字节），'
          + '两条腿的向量 = `["daily-start"]` 一条翻面、`claim-update` 不动。脚本与读数：'
          + '`.team/test/2026-10-24/_tmp/r3-knife-r1.mjs` + `_runs/test-f158-r3-knife/knife.json`',
        pointer_still_exists: '指针**没有被废掉**：`state/current-day.json` 仍由 `claim-update` 写、仍供"正在进行的这一天"的 op 使用'
          + '（`pointer_witness[claim-update].after === 10-24` 就是它：这条腿跑完把指针写成了今天）',
        not_this_cells_job: '**不判**指针的写入时机 / 锁 / `claim-update` 的其余语义（`STO-*` / `RT-*` / `DBY-03` 在守）',
      }

      caseFail(problems)
    })
  })
})
