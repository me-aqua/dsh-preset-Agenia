/**
 * 「**这一跑算不算数**」—— 唯一判据点（纯函数，不碰盘、不读 env）。
 *
 * 为什么单独成模块：这条判断原本散在 `run-all.mjs` 的几行 `if` 里，而它要回答的是三个问题：
 *   ① 这一跑的**范围**是不是它声明的那个范围（跑到 N / 声明 M）；
 *   ② 这一跑的**读数**能不能互相印证（`node --test` 自报的 `tests N` 必须等于结算条数）；
 *   ③ 这一跑的结果是不是**绿**（红要非零；`HOLD` = 判不了，**也不是绿**）。
 * 三者任一不成立 ⇒ 这一跑不算数。放进纯函数，才能被自检表逐格钉住（`support/self-check.mjs`）。
 *
 * 退出码语义（与 `.tools/check-notes.mjs` 同一套）：
 *   `0` 全绿且这一跑算数 · `1` 有红 / 不一致 / 空跑 / 半跑 / 两套读数打架 · `2` 有 `HOLD`（有挂起，判不了）
 *   （`3` 是"用法或环境不成立"，由入口自己判，不进这里。）
 */

/**
 * @param {object} input
 * @param {number} input.denominator     盘上发现的条数（= 登记表要对上的那个数）
 * @param {number|null} input.scopeCases `--glob` 声明的范围里有几条（没给 glob ⇒ null）
 * @param {boolean} input.scopeDeclared  调用方是否显式给了 `--glob`
 * @param {number} input.settled         结算条数
 * @param {number} input.red
 * @param {number} input.green
 * @param {number} input.hold
 * @param {boolean} input.consistent     登记是否等于盘上
 * @param {number} input.diffCount       登记↔盘上的差异条数
 * @param {number} input.nodeExit        `node --test` 的退出码
 * @param {number|null} input.nodeTests  `node --test` 自报的 `tests N`（读不出 = null）
 * @param {number|null} input.nodeFail   `node --test` 自报的 `fail N`
 * @param {number} input.settleExit      `support/evidence.mjs --settle` 的退出码
 * @returns {{exitCode: number, ok: boolean, fullScope: boolean, failures: string[], note: string}}
 */
export function entryVerdict(input) {
  const {
    denominator, scopeCases, scopeDeclared, settled, red, green, hold,
    consistent, diffCount, nodeExit, nodeTests, nodeFail, settleExit,
  } = input

  /** 这一跑**声明的**范围。没声明 ⇒ 声明的就是全量（分母）。 */
  const declared = typeof scopeCases === 'number' ? scopeCases : denominator
  const fullScope = declared === denominator
  const failures = []
  const reds = []      // 红类（退出码 1）
  const holds = []     // 挂起类（退出码 2，只在没有红类问题时才用它）

  // ① 范围：0 条不算结算；跑到的条数必须等于这一跑声明的范围。
  if (settled === 0) {
    reds.push('一条用例都没跑到 —— 0 用例不算结算（F-43 的坑）')
  } else if (settled !== declared) {
    reds.push(`这一跑不算数：跑到 ${settled} 条 / 声明范围 ${declared} 条——缺的那部分是"没跑到"，不是"通过"`)
  }

  // ② 两套读数：`node --test` 自己数的条数必须与结算条数相同（发现器漏认一条就露在这里）。
  if (typeof nodeTests === 'number' && nodeTests !== settled) {
    reds.push(`两套读数：node --test 跑了 ${nodeTests} 条、结算只有 ${settled} 条——发现器与 runner 数的不是同一批用例`)
  }
  if (nodeExit !== 0 && red === 0) reds.push(`node --test exit ${nodeExit} 而结算 RED 0 —— 两件事没说同一件事`)
  if (nodeExit === 0 && red > 0) reds.push(`node --test exit 0 而结算 RED ${red} —— 两件事没说同一件事`)

  // ③ 结果：红；以及"判不了"的 HOLD（**绝不当绿**）。
  if (red > 0) reds.push(`结算里有 RED ${red} 条 —— 退出码必须非零（红就是红，"一致"不等于"绿"）`)
  if (hold > 0) holds.push(`有 HOLD ${hold} 条 —— 判不了，不是绿（绿 ${green} / 红 ${red} / 挂起 ${hold}）`)

  // ④ 登记 ↔ 盘上；结算自己有没有说不通过。
  if (!consistent) reds.push(`登记 ≠ 盘上（${diffCount} 处）—— 这一跑的分母与登记表对不上`)
  if (settleExit !== 0) reds.push(`settle exit ${settleExit} —— 结算自己说不通过`)

  failures.push(...reds, ...holds)
  const exitCode = reds.length > 0 ? 1 : holds.length > 0 ? 2 : 0
  /**
   * `ok` = **这一跑可以被当成"干净通过"**：退出码 0、覆盖的是全量、一条 HOLD 都没有。
   * 只有 `ok` 才允许入口打 `F57-OK`（判不了 / 只跑了一部分，都不许出现 OK 这个词）。
   */
  const ok = exitCode === 0 && fullScope && hold === 0 && settled === denominator
  const note = fullScope
    ? `全量 ${denominator} 条`
    : `只跑了 ${settled} / 共 ${denominator} 条（--glob 声明的范围 = ${declared}）—— 这一跑不是全量证据`
  return { exitCode, ok, fullScope, failures, note }
}
