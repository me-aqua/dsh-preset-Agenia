/**
 * `maintenance_file` —— **一次调用 = 一份维护案草稿 + 一行入池**（复核岗提维护案的路）。
 *
 * 冻结依据：`.team/test/2026-11-09/CONTRACT-maintenance-file.md`（§1 四个导出 / §2 入参 /
 * §3 回执 / §4 落点与两个号 / §5 一次调用 = 文件 + 池行）；定形
 * `.team/leader/2026-11-09/定形-maintenance-file.md`（绑定范围）。
 *
 * 它补的是那个病：维护案以前**没有工具** ⇒ 复核岗只能手写 JSON，落点由"它当时在哪个工作区"决定
 * （2026-11-08 那 27 份落进了 `…\RealisticAccessories\.team\memory-review\…`，判决侧只读数据根的
 * `proposals/pool.jsonl` ⇒ 结构上看不见它们，而 claim → 冻结池 → judge 一路绿灯）。
 * ⇒ 这个工具把三件事做成**一次调用**：校验 → 落到**共享数据根** → 同一次调用里登记进池。
 *
 * ── 四个名字（契约 §1 冻结，用例按名字取）────────────────────────────────────
 *   `MAINTENANCE_FILE_TOOL_NAME` · `MAINTENANCE_FILE_CODES` · `maintenanceFileVerdict`（纯函数，不碰盘）·
 *   `maintenanceFileRun`（主路）。
 *   为什么要导出纯函数：与 `proposal-file.mjs` 同一条理由 —— 否则"形状族每一格各拒一次、报文点名
 *   哪一项"只能隔着整条主路测，而那条路会写盘。
 *
 * ── 四条口径（每一条都对着一次真实失效）──────────────────────────────────────
 *   ① **落点由 `root`（数据根）决定，不由 `process.cwd()` 决定**：草稿写
 *      `<root>/state/maintenance-drafts/<day>/<draft_id>.json`。这个模块里**没有** `process.cwd()`。
 *   ② **六个 op 从引擎来，不从 `ORDINARY_FORBIDDEN_KINDS` 抄**：那张表里还有 `delete` / `remove`，
 *      而 `lib/snapshot.mjs::applyEntriesPatch` 的 `switch` 没有这两个分支（只有
 *      add / modify / retire / cull / merge / retag）—— 拿它当白名单会收下一份永远执行不了的处置。
 *   ③ **判重键 = `content_sha256`（跨 kind、跨天）**，不是 `(source, sha256)`：
 *      这条路没有"调用方声明的哈希"，同一个草稿内容第二次提就是同一件事。
 *   ④ **拒绝 = 零写入；成功 = 文件 + 池行都动**：两件在同一次池子锁里做完（次序见 `lib/proposals.mjs`
 *      的 `appendMaintenanceDraftDeduped`），"只有文件"由那一条路自己回滚。
 *
 * ── 失败了怎么报（契约 §1 末段）──────────────────────────────────────────────
 *   抛 `Error`，`.code` = 四个稳定码之一，`message` **以码开头**。两件一起给，是因为 `.code` 给程序
 *   与用例读，而工具失败的报错文本**只有 message 一定到得了模型**。
 *
 * ── 这个模块**不管**什么（契约 §9）──────────────────────────────────────────
 *   400 字帽（那是导入那一层 `importVerdict` 的事）· "哪类处置该走维护案"（作业书的渠道纪律）·
 *   判决会不会采纳（工具只提出并入库）· 并发夹具（判重与追加在同一把锁里，由合同 §5 钉）。
 */
import path from 'node:path'
import { readCurrentSnapshot } from '../lib/snapshot.mjs'
import { appendMaintenanceDraftDeduped, contentShaOf } from '../lib/proposals.mjs'
import { writeJsonAtomic } from '../lib/atomic.mjs'
import { dayOf, isDayKey, nowIso } from '../lib/state.mjs'

/** 注册给模型的名字（下划线 —— 与 `proposal_file` / `team_test` 同一套；契约 §1）。 */
export const MAINTENANCE_FILE_TOOL_NAME = 'maintenance_file'

/**
 * 四个稳定码（键名冻结：`SHAPE` / `TARGET` / `DUP` / `IO`；四行同批在 `lib/error-codes.mjs` 的 `CODES` 里）。
 * ⚠️ 退出码也在那张表里（SHAPE 2 / TARGET 5 / DUP 5 / IO 4）—— 这里不写第二份数字。
 */
export const MAINTENANCE_FILE_CODES = Object.freeze({
  // 入参不成形状（缺 / 空 / 认不出的 op / 多给字段）
  SHAPE: 'E_MAINTENANCE_SHAPE',
  // 目标校不了：当前快照读不到，或目标 id 不在里面
  TARGET: 'E_MAINTENANCE_TARGET',
  // 同一个 content_sha256 已经提过
  DUP: 'E_MAINTENANCE_DUPLICATE',
  // 池子/落点写不进去（报文带底层码）
  IO: 'E_MAINTENANCE_IO',
})

/**
 * 引擎真认的六个 op —— 值域来自 `lib/snapshot.mjs::applyEntriesPatch` 的 `switch` 分支。
 * 🔴 来源是**引擎**，不是 `ORDINARY_FORBIDDEN_KINDS`（理由见文件头 ②）。
 */
export const MAINTENANCE_FILE_OPS = Object.freeze(['add', 'modify', 'retire', 'cull', 'merge', 'retag'])

/** 认识的入参就这六个；多给一个**拒**（静默忽略 = 让调用方以为它生效了）。 */
const KNOWN_DRAFT_KEYS = Object.freeze([
  'proposed_op', 'target_entry_id', 'target_original_text', 'product_text', 'source_entry_ids', 'reason',
])

/** 草稿文件的 schema（契约 §4.2：键集合恰好八个）。 */
const DRAFT_FILE_SCHEMA = 1

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''
const isNonEmptyStringArray = (value) => Array.isArray(value)
  && value.length > 0
  && value.every(isNonEmptyString)

/** 报文里说"实得什么"（`null` / 数组 / `typeof` 分开写，别把三种坏形状写成一句）。 */
function describeValue(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return '数组'
  if (typeof value === 'string') return JSON.stringify(value.length > 60 ? `${value.slice(0, 60)}…` : value)
  if (typeof value === 'object') return '对象'
  return JSON.stringify(value) ?? String(value)
}

/** 抛出去的错误：`.code` 是稳定码，`message` 以码开头。 */
function maintenanceError(code, message, detail = null) {
  const err = new Error(message)
  err.name = 'MaintenanceFileError'
  err.code = code
  err.detail = detail
  return err
}

/** 一条拒绝（纯函数那一侧的形状：`{ok:false, code, message}`，`message` 以码开头）。 */
function reject(code, why) {
  return { ok: false, code, message: `${code}: ${why}` }
}

/**
 * `E_MAINTENANCE_DUPLICATE` 的报文 —— **只有这一处**拼它。
 *
 * 判重只在 `maintenanceFileVerdict` 的 ③ 发生（主路把判词原样透传），所以"纯函数那一支"与"落盘那一支"
 * 报出来的那句话逐字相同，不会长出第二份措辞。
 * @param {string} contentSha 这一段草稿内容的哈希（= `sha256(stableStringify(draft))`）
 * @param {object|null} prior 池子里命中的那一条（报文要它的 `imported_id` / `seq`）
 */
function duplicateMessage(contentSha, prior) {
  const code = MAINTENANCE_FILE_CODES.DUP
  return `${code}: 重复 —— 同一段草稿内容已经提过（池子里那一条是 ${String(prior?.imported_id)}，`
    + `池子编号 ${String(prior?.seq)}：池内单调递增、清池后不回落、不是行号），`
    + `内容哈希 ${String(contentSha).slice(0, 12)}…。`
    + '换了正文再来会收（判重键 = sha256(stableStringify(draft))，跨 kind、跨天）。'
}

/**
 * **形状 + 目标 + 判重**，一个字节的盘都不碰（契约 §1 冻结的纯函数）。
 *
 * 次序：形状 → 目标 → 判重（一次调用只报一个码）。三样各自能单测，因为它们是三个不同的失效面：
 * 形状错是调用方写歪了；目标过期是**世界变了**（"快照换了、这条没了"）；重复是同一件事提了两遍。
 *
 * 两条边界（契约 §2 的纪律 4 / 5）：
 *   · `target_original_text` 只判"在不在、空不空"，**不判"对不对"** —— 升级成"必须与快照正文逐字相同"
 *     是另一条口径（会拒掉"快照换了、原文照旧"这类现场），要加先改定形。
 *   · `base_snapshot` **不是入参**：它由主路在落盘时把当时读到的 `current` 版本盖进去。
 *
 * @param {object} [input]
 * @param {object} [input.draft] 调用方给的那一份维护案（契约 §2 的六键）
 * @param {Array} [input.poolEntries] 池子现有的行；**不给 = 不做判重**（纯形状模式）
 * @param {object|null} [input.snapshot] 当前快照（`readCurrentSnapshot().snapshot`）；
 *   **`undefined` = 不校目标**（纯形状模式）· `null` = 明确"快照读不到" ⇒ `TARGET`
 * @param {string} [input.snapshotVersion] 快照版本（`readCurrentSnapshot().version`）
 * @returns {{ok:true, content_sha256:string, base_snapshot:string|null}
 *   | {ok:false, code:string, message:string}}
 */
export function maintenanceFileVerdict({ draft, poolEntries, snapshot, snapshotVersion } = {}) {
  const codes = MAINTENANCE_FILE_CODES
  // ① 形状：draft 本身
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
    return reject(
      codes.SHAPE,
      `draft 必须是一个维护案对象（实得 ${describeValue(draft)}）—— `
        + `必填 ${KNOWN_DRAFT_KEYS.join(' / ')} 里的 proposed_op / target_entry_id / target_original_text / reason`,
    )
  }
  // ①b 多给的字段：拒（静默忽略 = 让调用方以为它被记下了）
  const unknown = Object.keys(draft).filter((key) => !KNOWN_DRAFT_KEYS.includes(key))
  if (unknown.length > 0) {
    return reject(
      codes.SHAPE,
      `不认识的入参 ${unknown.map((key) => JSON.stringify(key)).join(', ')}`
        + `（只收 ${KNOWN_DRAFT_KEYS.join(' / ')}）—— 多给的字段一律拒：`
        + '静默忽略会让调用方以为它被记下了，而判决那一关读不到它',
    )
  }
  // ①c proposed_op：六个引擎 op
  if (!isNonEmptyString(draft.proposed_op) || !MAINTENANCE_FILE_OPS.includes(draft.proposed_op)) {
    return reject(
      codes.SHAPE,
      `proposed_op 必须是 ${MAINTENANCE_FILE_OPS.join(' / ')} 之一，实得 ${describeValue(draft.proposed_op)}`
        + '（这六个是引擎真的能执行的分支；delete / remove 不在里面）',
    )
  }
  // ①d target_entry_id：形状（"在不在快照里"是 ② 那一格）
  if (!isNonEmptyString(draft.target_entry_id)) {
    return reject(codes.SHAPE, `target_entry_id 必填（非空字符串，= 快照条目的 id），实得 ${describeValue(draft.target_entry_id)}`)
  }
  // ①e target_original_text：必填、非空。**逐字**（不 trim）。
  if (!isNonEmptyString(draft.target_original_text)) {
    return reject(
      codes.SHAPE,
      `target_original_text 必填（非空字符串：目标条目的原文全文，逐字；不许只写 id / 摘要），`
        + `实得 ${describeValue(draft.target_original_text)}`,
    )
  }
  // ①f reason：必填 —— 判决那一关要读它
  if (!isNonEmptyString(draft.reason)) {
    return reject(codes.SHAPE, `reason 必填（非空字符串：为什么该这么处置）—— 判决那一关要读它，实得 ${describeValue(draft.reason)}`)
  }
  // ①g 两个可选项：给了就必须是对的形状
  if (draft.product_text !== undefined && !isNonEmptyString(draft.product_text)) {
    return reject(codes.SHAPE, `product_text 给了就必须是非空字符串，实得 ${describeValue(draft.product_text)}`)
  }
  if (draft.source_entry_ids !== undefined && !isNonEmptyStringArray(draft.source_entry_ids)) {
    return reject(
      codes.SHAPE,
      `source_entry_ids 给了就必须是非空字符串数组（每项非空），实得 ${describeValue(draft.source_entry_ids)}`,
    )
  }

  const version = isNonEmptyString(snapshotVersion)
    ? snapshotVersion.trim()
    : (typeof snapshot?.version === 'string' ? snapshot.version : null)

  // ② 目标：只在"这一层能校"的时候校（`undefined` = 纯形状模式；`null` = 快照读不到）
  if (snapshot !== undefined) {
    if (snapshot === null || !Array.isArray(snapshot?.entries)) {
      return reject(
        codes.TARGET,
        `当前快照读不到（或读不出 entries）—— 目标条目 ${JSON.stringify(draft.target_entry_id)} 没法校，整份拒`,
      )
    }
    if (!snapshot.entries.some((entry) => entry?.id === draft.target_entry_id)) {
      return reject(
        codes.TARGET,
        `目标条目 ${JSON.stringify(draft.target_entry_id)} 不在当前快照（${version ?? '版本读不到'}）里`
          + ' —— 这条处置没有宾语（快照换了要按新的那一条重写）',
      )
    }
  }

  // ③ 判重：键 = 内容哈希（跨 kind、跨天）。与 `lib/proposals.mjs` 的追加口读同一份池行、同一个定义。
  const content_sha256 = contentShaOf(draft)
  if (Array.isArray(poolEntries)) {
    const prior = poolEntries.find((row) => String(row?.content_sha256 ?? '') === content_sha256) ?? null
    if (prior !== null) return { ok: false, code: codes.DUP, message: duplicateMessage(content_sha256, prior) }
  }
  return { ok: true, content_sha256, base_snapshot: version }
}

/** `at`：不传 = 读时钟（`lib/state.mjs` 的 `nowIso`，生产逻辑里不出现裸 `Date`）；传了就用它（可复跑）。 */
function atOf(at) {
  if (at === undefined || at === null) return nowIso()
  return at instanceof Date ? at.toISOString() : String(at)
}

/** 草稿文件的落点（契约 §4.2）：`<root>/state/maintenance-drafts/<YYYY-MM-DD>/<draft_id>.json`。 */
export function maintenanceDraftPathOf(root, day, draftId) {
  return path.join(root, 'state', 'maintenance-drafts', day, `${draftId}.json`)
}

/**
 * **主路**：校验 → 落到数据根 → 同一次调用里登记进池，回 `{ok, draft_id, path, pool_seq, …}`。
 *
 * 次序（在**池子锁**里，见 `lib/proposals.mjs::appendMaintenanceDraftDeduped`）：
 * ```
 * 抢池子锁 → 读池（坏 ⇒ IO）→ 形状 → 读快照 + 目标（拒 ⇒ 零写入）
 *         → 判重 content_sha256（命中 ⇒ DUP，零写入）→ 发号
 *         → 写草稿文件（原子）→ 追加池行（原子）→ 放锁，回执
 * ```
 *
 * @param {object} draft 维护案对象（契约 §2 的六键：`proposed_op` / `target_entry_id` /
 *   `target_original_text` / `reason` 必填，`product_text` / `source_entry_ids` 可选）
 * @param {{root: string, at?: string|Date, day?: string}} options
 *   `root` = **共享数据根**（`<内容根>/.runtime`；CLI 的 `--data-root` 那一层），**必须是绝对路径**
 *   —— 相对路径 ⇒ `E_MAINTENANCE_SHAPE`，且这一拒发生在任何写入之前；
 *   `at` / `day` 只为可复跑的用例准备，生产留空 = 读时钟 / 由时钟算日子
 * @returns {Promise<object>} `{ok, draft_id, path, pool_seq, content_sha256, day, base_snapshot, pool_path}`
 */
export async function maintenanceFileRun(draft, options = {}) {
  const codes = MAINTENANCE_FILE_CODES
  // `options` 是**入参的第二半**，所以它坏了也走四个码之一 —— 不许抛裸 `TypeError`
  // （那条路在框架那边会被物化成 `E_INTERNAL`，跟"程序有 bug"长得一模一样）。
  const opts = options ?? {}
  const root = opts.root
  // 🔴 根必须是**绝对路径**，而且这一关要挡在**任何写入之前**（`bug-20261110-01`）：
  //    相对 root（`'.runtime'` / `'./x'`）会被 `path.join` 折到 `process.cwd()` 之下 ⇒ 草稿与池行
  //    落进调用方当时所在的工作区，判决侧只读数据根 ⇒ 结构上看不见它们。那正是这个工具要治的病。
  //    码用形状族那一个（`E_MAINTENANCE_SHAPE`，`lib/error-codes.mjs` 里 exit 2），报文点名 `root`。
  if (typeof root !== 'string' || root.trim() === '') {
    throw maintenanceError(
      codes.SHAPE,
      `${codes.SHAPE}: root 必须是数据根的绝对路径（<内容根>/.runtime 那一层），实得 ${describeValue(root)}`,
    )
  }
  if (!path.isAbsolute(root)) {
    throw maintenanceError(
      codes.SHAPE,
      `${codes.SHAPE}: root 必须是**绝对路径**（数据根 = <内容根>/.runtime 那一层），实得 ${describeValue(root)}`
        + ' —— 相对路径会按调用方的 cwd 解析，草稿与池行会落进调用方的工作区（这份工具存在的理由就是不那样）',
    )
  }
  const at = atOf(opts.at)
  const day = typeof opts.day === 'string' && opts.day.trim() !== '' ? opts.day.trim() : dayOf(at)
  // 日子形状要当场校：一次拼错的日子会落到一个**永远不会有人读**的目录里，而调用方以为自己写成功了
  // （与 `lib/state.mjs::isDayKey` 同一条道理）。
  if (!isDayKey(day)) {
    throw maintenanceError(codes.SHAPE, `${codes.SHAPE}: day 必须是 YYYY-MM-DD（本地日历日），实得 ${describeValue(day)}`)
  }

  // 🔴 兜底：落盘那一段**不抛**（拒绝是一份返回码），但万一真抛了，也不能让一个裸 `Error` 上去 ——
  //    框架那边会把它折成 `E_INTERNAL`，于是"这份案该拒"与"程序有 bug"在报文里长得一模一样，
  //    而那正是这四个码存在的理由。四个码里没有"内部"那一格 ⇒ 折成 IO（"没落进盘"是事实）。
  let drafted
  try {
    drafted = await appendMaintenanceDraftDeduped(root, {
      day,
      at,
      /**
       * 锁里、读池之后、发号之前判一次。三段的次序是合同 §5 冻的：
       * 形状（不读盘）→ 快照（读不到 ⇒ TARGET）→ 目标 / 判重（`maintenanceFileVerdict` 的第二趟）。
       */
      verdictOf: ({ poolEntries, root: dataRoot }) => {
        const shape = maintenanceFileVerdict({ draft })
        if (!shape.ok) return shape
        const current = readCurrentSnapshot(dataRoot)
        if (!current.ok) {
          return reject(
            codes.TARGET,
            `当前快照读不到（${current.message}）—— 目标条目 ${JSON.stringify(draft.target_entry_id)} 没法校，整份拒`,
          )
        }
        return maintenanceFileVerdict({ draft, poolEntries, snapshot: current.snapshot, snapshotVersion: current.version })
      },
      /** 发号之后写草稿文件（原子：同目录临时件 + rename）。八个键，一个不多一个不少（契约 §4.2）。 */
      fileOf: ({ imported_id: draftId, seq, content_sha256: contentSha, base_snapshot: baseSnapshot }) => {
        const file = maintenanceDraftPathOf(root, day, draftId)
        const body = {
          schema: DRAFT_FILE_SCHEMA,
          draft_id: draftId,
          day,
          filed_at: at,
          content_sha256: contentSha,
          base_snapshot: baseSnapshot,
          // **逐字**：调用方给的那一份，不加不减、不 trim、不归一。
          draft,
          pool: { seq, imported_id: draftId },
        }
        const written = writeJsonAtomic(file, body)
        if (!written.ok) return { ok: false, code: written.code, message: `草稿写不进去：${written.message}`, path: file }
        return { ok: true, path: written.path }
      },
      /** 池行里那份 payload（契约 §4.3：`payload = { draft }`）。 */
      payloadOf: () => ({ draft }),
    })
  } catch (error) {
    throw maintenanceError(
      codes.IO,
      `${codes.IO}: 维护案落不进盘（${String(error?.code ?? 'THREW')}）—— ${String(error?.message ?? error)}`,
    )
  }

  if (!drafted.ok) {
    // 四个码原样上去（报文已以码开头）；其余（锁 / 原子写 / 坏账）一律折成 IO，报文带底层码。
    if (drafted.code === codes.SHAPE || drafted.code === codes.TARGET || drafted.code === codes.DUP) {
      throw maintenanceError(drafted.code, drafted.message, drafted.detail ?? null)
    }
    throw maintenanceError(
      codes.IO,
      `${codes.IO}: 维护案落不进盘（${String(drafted.code)}）—— ${String(drafted.message)}`,
      { path: drafted.path ?? null },
    )
  }

  return {
    ok: true,
    draft_id: drafted.imported_id,
    path: drafted.path,
    pool_seq: drafted.seq,
    content_sha256: drafted.content_sha256,
    day,
    base_snapshot: drafted.base_snapshot,
    pool_path: drafted.pool_path,
  }
}
