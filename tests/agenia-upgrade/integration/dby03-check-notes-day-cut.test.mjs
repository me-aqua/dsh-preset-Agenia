/**
 * `DBY-05` · **`F-158`** —— 体检那条「今天的记忆更新报告在」必须跟着**同一个切点**走（两个方向）。
 *
 * 定形 `.team/leader/2026-10-23/spec-F-158.md` 的落点 6 + 验收口径 #2：
 *   模拟"01:30 在干活" ⇒ **不许**报"今天的记忆更新缺"；模拟"04:30" ⇒ **该报就报**（同一把尺子两个方向）。
 *
 * 契约：`CONTRACT.md` §13.5。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 判的是什么：**那一行点名的日子**，不是它绿不绿。
 *   `.tools/check-notes.mjs:1464` 那一条断言的名字里就带着日子：
 *     `今天的记忆更新报告在（reports/memory-update/<today>.json）`
 *   ⇒ 把**注入时钟**摆到两个时刻，读那一行里的 `<day>`：
 *     · 摆到 `2026-10-24T01:30:00+08:00` ⇒ 那一行必须点名 **`2026-10-23`**（凌晨一点半属于前一天）；
 *     · 摆到 `2027-01-02T04:30:00+08:00` ⇒ 那一行必须点名 **`2027-01-02`**、而且**必须是红的**
 *       （那一天没有报告 ⇒ 该报就报）。
 *
 * 🔴 **为什么"该报"那一向用 2027-01-02 而不是"今天的 04:30"**：
 *    今天的报告**在盘上**（2026-10-24 现量：`presets/agenia/.runtime/reports/memory-update/2026-10-24.json` 存在
 *    ⇒ 体检 117/117 全绿）。把时钟摆到 10-24 的 04:30，"该报就报"这一支**永远量不到**（它本来就该绿）——
 *    那会是一条恒绿的假判据。换一个**盘上必然没有报告**的日子，这一支才真的能红（`mig-rules-11`：
 *    判据要能翻面）。
 *
 * **这个工具走同一把尺子**：`.tools/check-notes.mjs:241` 是 `const today = dayKeyOf(clockNow())`，
 *    `:23-24` 从 `presets/agenia/lib/` 取时钟与切点 ⇒ 注入时钟对它**生效**，两个方向各读一行。
 *    这一格守的是"**它别退回**真时钟 / 零点切"：哪天退了，`DBY-CN-CLOCK-IGNORED` 与 `DBY-CN-*` 当场红。
 *    ⚠️ 它**不是**"两向格驱不动所以要降级"：两个方向**都驱得动**（同一个进程、同一份注入文件）。
 *
 * 边界：
 *   1. **不判** 体检的其余 116 条（它们各有各的判据）；只取那一行。
 *   2. **不判** 那一条断言**该绿还是该红**取决于报告在不在 —— 除了 2027-01-02 那一向（盘上必然没有）。
 *   3. **不判** "昨天 / 前日"那几行（它们用的是同一把 `today`，但各自另有语义；要判另开格）。
 *   4. 跑的是**真子进程**、**只读**（全文 0 处写盘调用）—— 跑它不会动活体任何一个字节。
 *   5. `.tools/**` 不在测试岗的可写范围里：这一格**只判、不改**。
 */
import { before, describe, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256File, stagingReadings } from '../support/evidence.mjs'
import { runCheckNotes, memoryRootReading } from '../support/day-cut.mjs'

before(() => {
  preflight()
})

/** 两个时刻：① 凌晨一点半还在干活；② 切点之后、且**盘上必然没有报告**的那一天。 */
const AT_NIGHT = '2026-10-24T01:30:00+08:00'
const AT_NIGHT_DAY = '2026-10-23'
const AFTER_CUT = '2027-01-02T04:30:00+08:00'
const AFTER_CUT_DAY = '2027-01-02'

const CHECK_NOTES = path.join(PATHS.repo, '.tools', 'check-notes.mjs')

describe('integration · check-notes day cut (DBY) · F-158 体检那条红的两向格', () => {
  test('DBY-05 体检的「今天的记忆更新报告」：01:30 ⇒ 前一天（不许嚷）· 04:30 且报告缺 ⇒ 该报就报', async () => {
    await runCase('DBY-05', async (rec) => {
      const problems = []
      const push = (code, message, detail) => problems.push(problem(code, message, detail))
      rec.readings.staging = stagingReadings()
      rec.readings.tool = existsSync(CHECK_NOTES)
        ? { file: CHECK_NOTES, bytes: readFileSync(CHECK_NOTES).length, sha256: sha256File(CHECK_NOTES) }
        : { missing: true, file: CHECK_NOTES }
      rec.readings.instants = { night: AT_NIGHT, after_cut: AFTER_CUT }
      rec.readings.want_days = { night: AT_NIGHT_DAY, after_cut: AFTER_CUT_DAY }

      // ── ⓪ 前置 ─────────────────────────────────────────────────────────
      if (!process.env[ENV.NOW_FILE]) {
        push('DBY-CLOCK', `AGENIA_NOW_FILE 没设置（${process.env[ENV.NOW_FILE]}）—— 这一格的两个方向全靠注入式时钟`)
      }
      if (!existsSync(CHECK_NOTES)) {
        push('SUT-SURFACE-MISSING', `体检脚本不在：${CHECK_NOTES}`)
        caseFail(problems)
      }
      const mem = memoryRootReading()
      rec.readings.memory_root = mem
      if (!mem.exists) {
        // 记忆库根不在 ⇒ 体检走「挂起」那一支（"判不了"），两向都量不到 —— 前置不成立要出声。
        push('DBY-CN-PRECONDITION', `记忆库根不在（${mem.path}）⇒ 体检那一条走「挂起」而不是「红/绿」，两个方向都量不到；`
          + '这一格要的现场是"库在、报告缺/在"，缺了它就换了一支，读数不算')
      }

      // ── ① 两个方向：同一个注入时钟、同一份工具 ─────────────────────────────
      const night = runCheckNotes(AT_NIGHT, 'night')
      const after = runCheckNotes(AFTER_CUT, 'after-cut')
      rec.readings.runs = { night, after_cut: after }

      // ── ② 方向一：凌晨一点半 ⇒ 那一行必须点名**前一天** ─────────────────────
      if (night.row === null) {
        push('DBY-CN-NO-ROW', `体检输出里**找不到**「今天的记忆更新报告」那一行（exit=${night.exit_code}）—— 这一格失去了观察点；`
          + `stderr=${JSON.stringify(night.stderr)}`)
      } else if (night.day !== AT_NIGHT_DAY) {
        push('DBY-CN-NIGHT-DAY',
          `注入时钟 ${AT_NIGHT} 时，体检那一行点名的是 **${night.day ?? '(没读到日子)'}**，应当是 **${AT_NIGHT_DAY}**（凌晨一点半属于前一天）。`
          + `原文：${JSON.stringify(night.row)}`
          + (night.day === '2026-10-24'
            ? ' —— 这正是老板骂的那一句：「不要在半夜一点我正在干活的时候嚷嚷"新的一天了，得先派记忆更新呀"」'
            : ''))
      }

      // ── ③ 方向二：切点之后、且那一天的报告**必然不在** ⇒ 必须点名那一天、且必须是红的 ──
      if (after.row === null) {
        push('DBY-CN-NO-ROW', `体检输出里**找不到**「今天的记忆更新报告」那一行（exit=${after.exit_code}）—— 这一格失去了观察点`)
      } else {
        if (after.day !== AFTER_CUT_DAY) {
          push('DBY-CN-AFTER-DAY',
            `注入时钟 ${AFTER_CUT} 时，体检那一行点名的是 **${after.day ?? '(没读到日子)'}**，应当是 **${AFTER_CUT_DAY}**。`
            + `原文：${JSON.stringify(after.row)}`)
        }
        if (after.mark !== 'RED') {
          push('DBY-CN-AFTER-MARK',
            `注入时钟 ${AFTER_CUT}（那一天的报告**不在盘上**）时，体检那一行是 **${after.mark ?? '(没读到态)'}**，应当是 **RED** —— `
            + `"该报就报"这一向成立不了，就等于那条断言永远绿。原文：${JSON.stringify(after.row)}`)
        }
      }

      // ── ④ 两个方向必须是**同一把尺子**：它得真的跟着注入时钟走 ────────────────
      if (night.row !== null && after.row !== null && night.day === after.day) {
        push('DBY-CN-CLOCK-IGNORED',
          `两个方向（${AT_NIGHT} / ${AFTER_CUT}）体检读到的是**同一个日子 ${night.day}** —— 注入时钟对它没有影响：`
          + '`.tools/check-notes.mjs:241` **是** `const today = dayKeyOf(clockNow())`（时钟来自 `lib/clock.mjs`，'
          + '也就是同一份 `AGENIA_NOW_FILE`）。原文：`' + JSON.stringify(night.row) + '`'
          + '—— 🔴 这一格守的是"别退回去"：谁把"今天"改回真时钟或零点切，这条当场红')
      }

      // ── ⑤ 落点（读它的人要知道修在哪一层）──────────────────────────────────
      rec.readings.tool_contract = {
        where: '.tools/check-notes.mjs',
        today_line: '`:241` `const today = dayKeyOf(clockNow())` —— 时钟 `lib/clock.mjs`、切点 `lib/route.mjs::dayKeyOf`',
        expectations: [
          '落点 6（定形）：那条「今天的记忆更新报告在」的 `today` 走同一口径 —— `(now − 4h)` 的本地日期，不再自己切零点',
          '注入时钟：同一份 `AGENIA_NOW_FILE`（`lib/clock.mjs` 的那一个）—— 否则套件驱不动它，两向格只能靠"等真实时钟走到那个点"',
        ],
        why_not_fixed_here: '`.tools/**` 不在测试岗的可写范围里；这一格只判、不改，也不自建第二套时钟',
        what_this_cell_does_not_do: '不判体检其余 116 条；不判"昨天 / 前日"那几行；不动活体数据根一个字节（体检全文 0 处写盘调用）',
      }
      rec.readings.check_notes_summary = {
        night: night.summary_line,
        after_cut: after.summary_line,
        note: '这两行是体检**整份**的读数（117 条那一行），只作背景：这一格判的只有「今天的记忆更新报告」那一行',
      }

      caseFail(problems)
    })
  })
})
