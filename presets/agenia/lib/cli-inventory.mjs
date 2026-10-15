/**
 * 命令清单 —— 三支 CLI 的**全部 op**，机器可读的副本（提案 §B1.4 最后一段）。
 *
 * 冻结依据：提案 §B1.4 的三张 op 表 + 契约 §2.4 第 6 条：
 * "【设计冻结】清单 = 上面三张表里**所有 op**，机器可读副本落 `presets/agenia/lib/cli-inventory.mjs`
 *  （导出 `COMMANDS = [{cli, op, writes:boolean, needsDataRoot:boolean}]`）。DR-01/DR-02 的断言分母
 *   = 这份清单；**清单没列的共享写命令不许存在**（新增 op 必须同批进清单，否则 DR 用例红）。"
 *
 * 三条口径：
 *   ① **清单就是分母**：`COMMANDS` 逐行等于三支 CLI 真正注册的 op（含各自的 `help`）——
 *      "清单与实现逐项相等"是探针的判据，也是"新增 op 必须同批进清单"那条纪律的载体。
 *   ② **`writes` 判的是"会不会改权威状态"**：本地状态 / 脑根 / 路线 / 票 / 审计 —— 改了就是 `true`。
 *      `health` 落的那张 `brain/<day>/health.json` 是**派生卡**（随时可由同一批输入重算出来），
 *      与 `report-read` / `state-read` 同族 ⇒ 记 `false`；冻结表里它也是 `false`。
 *   ③ **`needsDataRoot`**：这一条 op 的根是共享脑根（`--data-root`）⇒ `true`；工作区那一侧
 *      （`--workspace`）⇒ `false`。DR-01 的"非法根 × 逐命令"矩阵只跑 `writes && needsDataRoot` 那批。
 *
 * ⚠️ 本文件**没有逻辑**，只有清单 + 两个纯比较函数。
 */

/** 三支 CLI 的文件名（与 §B1.3 的落点表一致）。 */
export const CLI_NAMES = Object.freeze(['agenia-brain.mjs', 'agenia-route.mjs', 'agenia-local.mjs'])

/** 共享脑：根是 `--data-root`，21 个写/读 op 加 `help`（2026-10-15 加 `session-packet`）。 */
const BRAIN_OPS = Object.freeze([
  { op: 'init', writes: true },
  // `init-real` 是**唯一**能落真实脑根的那一下（`lib/paths.mjs::realInitVerdict` 的三道硬闸）。
  // 它同样是"改权威状态"⇒ `writes: true`；根也是共享脑根 ⇒ `needsDataRoot: true`。
  // ⚠️ 它会因此进 DR-01 的"非法根 × 写命令"矩阵 —— 那是对的：
  //    矩阵**总是带 `--test-mode`**，而 `init-real` 与测试模式互斥 ⇒ 每次都被 `E_ARG_SCHEMA` 拒，
  //    真实根一个字节都不会被建出来。
  { op: 'init-real', writes: true },
  { op: 'state-read', writes: false },
  { op: 'daily-start', writes: true },
  { op: 'claim-update', writes: true },
  { op: 'candidates-freeze', writes: true },
  { op: 'judge-start', writes: true },
  { op: 'judge-commit', writes: true },
  { op: 'review-start', writes: true },
  { op: 'proposal-import', writes: true },
  { op: 'maintenance-import', writes: true },
  { op: 'snapshot-read', writes: false },
  { op: 'snapshot-list', writes: false },
  { op: 'entry-count', writes: false },
  { op: 'report-read', writes: false },
  { op: 'health-read', writes: false },
  { op: 'job-mark', writes: true },
  { op: 'audit-append', writes: true },
  { op: 'snapshot-archive', writes: true },
  { op: 'cs-confirm', writes: true },
  // `session-packet`（2026-10-15 加）：冻结会话包 —— 落到 `<工作区>/.team/retro/<day>/conversation-packet/`，
  // 同时往脑侧记一条 `session-packet` 审计。⇒ **它改的是权威状态**（那两份评审唯一的输入就是它）
  // ⇒ `writes: true`；根是共享脑根 ⇒ `needsDataRoot: true`（由下面 `rowsFor` 按 CLI 统一给）。
  // ⚠️ 它会因此进 DR-01 的"非法根 × 写命令"矩阵 —— 那是对的：非法根必须在**任何写之前**就被拒。
  { op: 'session-packet', writes: true },
  { op: 'help', writes: false },
])

/** 路线 updater：根是 `--workspace`（`--status-root` 可选）。 */
const ROUTE_OPS = Object.freeze([
  { op: 'init', writes: true },
  { op: 'stage-graph-set', writes: true },
  { op: 'stage-enter', writes: true },
  { op: 'task-set', writes: true },
  { op: 'ticket-open', writes: true },
  { op: 'ticket-update', writes: true },
  { op: 'ticket-close', writes: true },
  { op: 'ticket-void', writes: true },
  { op: 'read', writes: false },
  { op: 'verify', writes: false },
  { op: 'summarize', writes: false },
  { op: 'help', writes: false },
])

/** 项目本地状态 / 健康：根是 `--workspace`。 */
const LOCAL_OPS = Object.freeze([
  { op: 'local-read', writes: false },
  { op: 'local-claim', writes: true },
  { op: 'local-mark', writes: true },
  { op: 'local-receipt-set', writes: true },
  { op: 'local-fail', writes: true },
  { op: 'health', writes: false },
  { op: 'receipt-check', writes: false },
  { op: 'help', writes: false },
])

function rowsFor(cli, ops) {
  const needsDataRoot = cli === 'agenia-brain.mjs'
  return ops.map(({ op, writes }) => Object.freeze({ cli, op, writes, needsDataRoot }))
}

/**
 * 全清单（顺序 = 逐支 CLI 的 `--op help` 打字顺序拼接）。
 *
 * @type {ReadonlyArray<{cli:string, op:string, writes:boolean, needsDataRoot:boolean}>}
 */
export const COMMANDS = Object.freeze([
  ...rowsFor('agenia-brain.mjs', BRAIN_OPS),
  ...rowsFor('agenia-route.mjs', ROUTE_OPS),
  ...rowsFor('agenia-local.mjs', LOCAL_OPS),
])

/** 每支 CLI 的 op 名（升序之外的**打字顺序**，与 `--op help` 一致）—— 供 `help` 与探针共用。 */
export const OP_NAMES = Object.freeze({
  'agenia-brain.mjs': Object.freeze(BRAIN_OPS.map((r) => r.op)),
  'agenia-route.mjs': Object.freeze(ROUTE_OPS.map((r) => r.op)),
  'agenia-local.mjs': Object.freeze(LOCAL_OPS.map((r) => r.op)),
})

/** 清单里某一条的键（`<cli>#<op>`）。 */
export function commandKey(row) {
  return `${row?.cli}#${row?.op}`
}

/**
 * 清单 vs 真实 op 表的逐项比较（纯函数）。
 *
 * @param {Record<string, string[]>} opLists 形如 `{'agenia-brain.mjs': ['init', …], …}`
 * @returns {{ok:boolean, missing:string[], extra:string[], count:number, want:number}}
 *   · `missing` = 清单里有、某个 CLI 没实现（"清单宣布了不存在的 op"）；
 *   · `extra` = CLI 实现了、清单里没有（**新增 op 必须同批进清单**）。
 */
export function inventoryDiffOf(opLists = {}) {
  const actual = new Set()
  for (const [cli, ops] of Object.entries(opLists)) {
    for (const op of Array.isArray(ops) ? ops : []) actual.add(`${cli}#${op}`)
  }
  const wanted = new Set(COMMANDS.map(commandKey))
  const missing = [...wanted].filter((key) => !actual.has(key)).sort()
  const extra = [...actual].filter((key) => !wanted.has(key)).sort()
  return { ok: missing.length === 0 && extra.length === 0, missing, extra, count: actual.size, want: wanted.size }
}
