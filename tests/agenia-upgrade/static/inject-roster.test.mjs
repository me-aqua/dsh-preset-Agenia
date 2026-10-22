/**
 * SURF-02 —— **`inject.js` 的兜底名单：注释里的机读声明与常量必须是同一个名单**（`F-112` ② · 2026-10-22）。
 *
 * ## 这一格治的是什么
 *
 * 审计现场（`presets/agenia/inject.js`，2026-10-22）：兜底名单上方那段说明说的与常量写的
 * 不是同一件事 ⇒ 读注释的人与跑代码的人，对"配置没写名单时会注入什么"拿到**两个答案**。
 * 这种分叉不红：没有任何判据把"那段话"和"那个常量"放在一起看过。
 *
 * ## 判据（四样，各自承重）
 *
 * 1. **机读声明必须在**（`SURF-ROSTER-NO-CLAIM`）：常量正上方那段说明里要有一行
 *    `@roster key=present|absent …`。**散文不算声明** —— 只写散文、没有 `@roster` ⇒ 红
 *    （"声明必须机读"这一格；2026-10-22 收口）。
 * 2. **一致性**（`SURF-ROSTER-CLAIM-VIOLATED`）：`@roster` 说"不在"的 key 不许在常量里；
 *    说"在"的 key 必须在常量里。两个方向都判、**点名到 key + 两处行号**。
 *    两行 `@roster` 自相矛盾、或散文与 `@roster` 说反了，也归这一码。
 * 3. **不许沉默**（`SURF-ROSTER-NO-CLAIM-KEY`）：`memory` / `style`（组员那张是 `memory`）
 *    必须在机读声明里各有一次表态 —— "把说错的那一对删掉"不是修好，是把这一格改成静默。
 * 4. **常量不是死名字**（`SURF-ROSTER-UNUSED-CONST`）：`const` 在整份文件里至少被读一次
 *    （这是 `F-111③` 那一格在源码里的同形）。
 *
 * ## 声明只有一种写法
 *
 * `@roster memory=present style=absent …`（一行可以写多对；只有 vocabulary 里的名字算数）。
 * 散文（「在这份兜底里」/「不在里面」…）**可以留给人读，但它提供不了声明、也不能让这一格变绿**；
 * 它唯一的用处是**不许说反**（与 `@roster` 相反 ⇒ 红：读注释的人与跑代码的人仍然拿到两个答案）。
 * ⚠️ 同一句里被反引号包起来、又跟"在 / 不在"贴在一起的名字，可能被读成散文表态 ——
 *    只想提一嘴的名词（`leaderOrder` 这种）请另起一句，或者别用反引号。
 *
 * ## 行号（会漂，别钉它）
 *
 * 2026-10-22 现量：组长那张表的 `@roster` 在 `inject.js:54`、常量在 `:58`；
 * 组员那张表在 `:63-67`（`@roster` 在 63、常量在 67）。**行号会漂、以 `@roster` + 常量为准**：
 * 判据按「常量正上方那段注释」定位（`commentBlockAbove`），从不按行号。
 *
 * ## 控制面
 *
 * 用例内部喂十四组合成源码：机读行与常量一致（绿）/ 改常量那个方向（绿）/
 * **散文还在但删掉 `@roster`（红）** / 整段注释删掉 / `@roster` 写不出合法对 / 漏 `memory` /
 * 漏 `style` / 机读行说反（两个方向）/ 散文说反 / 两行 `@roster` 打架 / 同一个病挪到组员表 /
 * 常量零读点 / 两个常量都不见。每组的**问题码 + 点名**都逐条对上，
 * 否则报 `SURF-ROSTER-CONTROL`（判据翻不了面时，"绿"不作数）。
 *
 * ## 边界
 *
 * · 靶子 = **被测 staging 树**里的 `inject.js`（不是活体那份；活体由漂移判据守）。
 * · 只判"注释与常量"这一对。**注入行为一个字都不改**（这一票的定形这么写的）：
 *   兜底名单本身对不对（该不该有 `memory`）是生产侧的决定，不是这条判据替它拍。
 */
import { before, describe, test } from 'node:test'
import { FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { readStagedText } from '../support/sut.mjs'
import { CODES, fallbackRosterProblems, rosterControls } from '../support/declared-surface.mjs'

before(() => {
  preflight()
})

describe('static · surface-declared', () => {
  test('SURF-02 inject.js 兜底名单的注释与常量必须一致（分叉 ⇒ 红、点名 key 与两处行号）', async () => {
    await runCase('SURF-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── 控制面先跑（判据自己翻不了面时，下面那个"绿"没有意义）───────────────
      const controls = rosterControls()
      rec.readings.controls = controls.controls
      for (const f of controls.failures) push(CODES.rosterControl, f)

      // ── 主判据：staging 里那份 inject.js ──────────────────────────────────
      let src = null
      try {
        src = readStagedText('inject.js')
      } catch (err) {
        // 缺面是**预期的首跑红**（`SUT-SURFACE-MISSING`），不许当成"没有分叉"
        push(err?.code ?? 'SUT-SURFACE-MISSING', String(err?.message ?? err))
      }
      if (src !== null) {
        // "哪些名字算 order key"由事实现算：两个常量的 key + 要求表态的 key +
        // 组合里那几个"算出来的"项（`memory` / `roster` / `board`）——
        // 别在这儿硬编一张名单（硬编的那张永远比事实晚一步）。
        const verdict = fallbackRosterProblems(src, { vocabulary: [...FROZEN.staged.computedOrderKeys] })
        for (const p of verdict.problems) push(p.code, p.message, p.detail)
        rec.readings.roster = verdict.readings
        rec.readings.source = { rel: 'inject.js', bytes: Buffer.byteLength(src, 'utf8') }
      }

      caseFail(problems)
    })
  })
})
