/**
 * **两棵树的两个读者，对"读不到"说同一句话**（`bug-20261107-02`；技术评审 2026-11-06 `F4`）。
 *
 * 病根：`support/target.mjs::walkTree`（靶子过期判据）与 `support/evidence.mjs::stagedVsLiveDrift`
 * （`STAT-01` 的两棵树比）走的是同一条深度 / 数据段规则，**对失败却有两种形态**：
 *   · 一个 `catch { return }` / `catch { continue }` —— 静默把样本变短；
 *   · 一个没有 `try` —— 直接抛出去。
 * ⇒ 注释里承诺的 `missing_*` 报不出**枚举阶段已经丢掉的东西**：「读不到」与「那里没有」长得一样。
 *
 * 本模块只做一件事：把"读不到"折成**同一个形状、同一批字**：
 *   `{ rel, kind: 'dir' | 'stat' | 'file', code, message }`
 * 两个读者都从这里取，读数字段名也一致（`read_failures` / `missing_dirs` / `missing_files` /
 * `missing_paths` / `read_ok`），于是同一个输入在两边的读数里**点名同一个路径、同一个码**。
 *
 * 🔴 **覆盖边界**（别读宽了）：
 *   · 它只记**枚举阶段**读不动的路径（目录列不出来 / 条目 stat 不了 / 文件读不了），
 *     不判断那个路径"该不该在"、也不判断内容对不对；
 *   · 它**不改变**任何一条既有判据的红绿：读者自己决定怎么把 `read_failures` 报出去
 *     （`targetVerdict` 记 `TARGET-READ-FAILED`；`stagedVsLiveDrift` 让 `same:false`）；
 *   · **"读不到"不是"没有"**：`read_ok:false` 的读数不许当"两棵树一样"或"零样本"用 ——
 *     零样本是"两棵树都枚举不出文件"，读失败是"有一块我没看见"，两条红因分开。
 */

/** 三种失败形状（`kind` 就是"在哪一步读不动"）。 */
export const READ_FAILURE_KINDS = Object.freeze(['dir', 'stat', 'file'])

/**
 * 一条失败读数 —— 两个读者共用这一个构造函数。
 *
 * @param {string} rel 相对树根的路径（`/` 分隔）—— 与两棵树比较时的键同一个口径
 * @param {NodeJS.ErrnoException|Error|null} err 原始错误（`code` 原样留住：`ENOENT` / `EACCES` / `ELOOP` …）
 * @param {'dir'|'stat'|'file'} kind 在哪一步读不动
 * @returns {{rel:string, kind:string, code:string, message:string}}
 */
export function readFailureOf(rel, err, kind) {
  const code = typeof err?.code === 'string' && err.code !== '' ? err.code : 'E_READ'
  const detail = String(err?.message ?? err ?? '').replace(/\s+/g, ' ').slice(0, 200)
  return { rel: String(rel).replace(/\\/g, '/'), kind, code, message: detail }
}

/**
 * 把 `readFailureOf` 收集到的那一堆折成读者要报的字段（**一个形状、两个键名都有**）。
 *
 * `missing_dirs` / `missing_files` / `missing_paths` 三个键各按 `kind` 分：
 *   · `dir`  ⇒ 目录列不出来（子树整块没看见）
 *   · `file` ⇒ 文件读不了（stat 得到、字节读不出）
 *   · `stat` ⇒ 条目 stat 不了（链接指向不存在的目标、权限、路径太长……）—— 它"在不在"都判不了
 *
 * @param {Array<{rel:string,kind:string,code:string,message:string}>} failures
 */
export function foldReadFailures(failures = []) {
  const list = [...failures].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const byKind = (kind) => list.filter((f) => f.kind === kind)
  return {
    /** 全部失败（按路径排序）—— 判据读这一份，人读前三个分栏。 */
    list,
    count: list.length,
    missing_dirs: byKind('dir'),
    missing_files: byKind('file'),
    missing_paths: byKind('stat'),
    /** `false` = 这一棵树**有一块我没看见** ⇒ 不许把它的比较结果当"相同"。 */
    read_ok: list.length === 0,
  }
}

/** 人话（红报文直接用它点名路径与码；超过 `limit` 条只点名前几条，但**总数始终给**）。 */
export function describeReadFailures(failures, limit = 5) {
  const list = Array.isArray(failures) ? failures : []
  if (list.length === 0) return '（没有读不到的路径）'
  const fmt = (f) => `${f.rel}（${f.kind} · ${f.code}）`
  const head = list.slice(0, limit).map(fmt).join(' · ')
  return list.length <= limit ? head : `${head} …（共 ${list.length} 条）`
}
