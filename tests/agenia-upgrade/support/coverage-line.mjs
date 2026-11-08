/**
 * 结算「覆盖边界」那一行 —— **每一个字都从读数里来**（`bug-20261107-06` MF-1，gate-4 打回）。
 *
 * 打回的原因是"覆盖边界只剩一份"这句话当时不真：同一段人话有三个载体 ——
 *   ① `support/evidence.mjs::REAL_ROOTS_CONTENT_UNCOVERED`（定义）；
 *   ② `DR-01` 的 `content_uncovered` 里**逐字重抄**了那五句（还带着自己那份 `window`）；
 *   ③ 本文件原来的位置（`evidence.mjs::coverageSettlementLine`）只读 `what`/`covered_by`，
 *      其余三句**自己重打**了一遍 —— 而且 `residual_false_positive` 那一句在重打时丢掉了码名
 *      `SECURITY-VIOLATION`（两侧已经漂了）。
 *
 * 现在这里**只拼结构**（标签 / 分隔符 / 标点），内容字段全部从 `rr.content_uncovered` 原样取；
 * `DR-01` 与 `DR-02` 都是**展开**那一个常量（`{ ...REAL_ROOTS_CONTENT_UNCOVERED, window }`），
 * 结算再从 `DR-02/result.json` 读回 ⇒ **唯一一份人写的载体是那个常量**，本行末尾把它点名。
 *
 * 判据（`STM-01`）量三件事：
 *   · A 健康行逐字包含读数里的 `note` / `cli_inventory` / `residual_false_positive`（含码名 `SECURITY-VIOLATION`）；
 *   · C 读数缺 `content_uncovered` ⇒ 行里出现 `COVERAGE_MISSING_TOKEN`（**健康行里没有这个串**），
 *       且结算读数的 `content_uncovered === null`；
 *   · 刀：把本文件的"缺失"分支改回手写字面量（副本）⇒ 同一输入下那个 token 不在 ⇒ C 会红（刀咬住）。
 */

/** 「读数里没有 `content_uncovered`」那一支的稳定 token（**健康行里不许出现**）。 */
export const COVERAGE_MISSING_TOKEN = 'SETTLE-DR02-CONTENT-UNCOVERED-MISSING'

/** 缺失时的那一行（单一来源：只有这里写一次；刀切的就是它的 `return`）。 */
export const COVERAGE_MISSING_LINE = '  - 🔴 覆盖边界：DR-02 的读数里没有 `content_uncovered`（'
  + COVERAGE_MISSING_TOKEN
  + '）—— 这一行判不了（它不是一份可以另写的字面量：判据与结算读同一份）'

/**
 * 健康那一行。**内容字段全部来自读数**；这里只加标签、分隔符与来源。
 *
 * @param {object} rr 结算的 `real_roots` 一节（`content_uncovered` + `content_uncovered_source`）
 */
export function coverageSettlementLine(rr) {
  const u = rr.content_uncovered
  if (u === null || typeof u !== 'object') return COVERAGE_MISSING_LINE
  const coveredBy = Array.isArray(u.covered_by) && u.covered_by.length > 0 ? u.covered_by.join(' + ') : '（未声明 covered_by）'
  const src = rr.content_uncovered_source ?? null
  const provenance = src === null
    ? '（没有来源读数）'
    : `唯一定义：${src.definition ?? '(未给)'} · 本行从 ${src.printed_from ?? '(未给)'} 读回`
  return `  - 🔴 覆盖边界（DR-02 的读数）：【${u.what ?? '（未给 what）'}】${u.note ?? '（未给 note）'}`
    + ` 兜它的是 ${coveredBy}；${u.cli_inventory ?? '（未给 cli_inventory）'}；${u.residual_false_positive ?? '（未给 residual_false_positive）'}`
    + `（${provenance}）`
}
