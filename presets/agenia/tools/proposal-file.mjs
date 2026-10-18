/**
 * `proposal_file` —— **一次调用 = 一条候选 + 一句出处**，原子地追加到候选池的最后一行。
 *
 * 冻结依据：`.team/test/2026-10-17/F-53/F-53-契约.md`（§2 入参 / §3 出参 / §4 落点 / §6 实现落点）。
 * 它补的是那个摩擦：提一条候选以前要么手搓 JSON + 走命令行调 `--op proposal-import`，
 * 要么写草稿等人代转。**组员那条不许依赖命令行**（受限岗位结构上就没有）⇒ 这个动作必须是个工具。
 *
 * ── 四个名字（契约 §6 冻结，用例按名字取）──────────────────────────────────
 *   `PROPOSAL_FILE_TOOL_NAME` · `PROPOSAL_FILE_CODES` · `proposalFileVerdict`（纯函数，不碰盘）·
 *   `proposalFileRun`（主路）。
 *   为什么必须导出纯函数：不导出就只剩"隔着整条主路测"这一条路，而"形状族每一格各拒一次、
 *   报文点名哪个字段"这类事隔着主路根本喂不进去（`inject.js` 那条先例同一个尺子）。
 *
 * ── 三条口径（每一条都是别人的教训）──────────────────────────────────────
 *   ① **判重键 = (`source`, `sha256(text)`)**，不是 `priorImportVerdict` 那一支。
 *      那一支是**草稿完整性**规则（同一句 source 第二次导入、声明哈希不同 ⇒ `E_ARG_HASH`），
 *      与本工具的 A3 正好相反：**同一个出处换了内容再来 ⇒ 必须收**。
 *      ⇒ 同源同文第二次 ⇒ `E_PROPOSAL_DUPLICATE`；同文不同源 ⇒ 收（出处不同 = 两条引用事实）。
 *   ② **判重与追加必须在同一把锁里**（`lib/proposals.mjs` 的 `appendProposalDeduped`：
 *      读池 → 判重 → 发号 → 原子追加，全在一次 `acquireLock`）。
 *      先无锁判重再追加 ⇒ 两个并发调用都能通过判重 ⇒ 池子里两条同源候选。
 *   ③ **一个动作不是一条命令行**：这里不跑子进程；落盘也不走"追加写"（崩溃会留半行，
 *      半行让整份池子 `E_DATA_CORRUPT`）—— 原子写只在 `lib/proposals.mjs` 那一处。
 *
 * ── 失败了怎么报（契约 §3.2）──────────────────────────────────────────────
 *   抛 `Error`，`.code` = 四个稳定码之一，`message` **以码开头**。两件一起给，是因为
 *   `.code` 给程序与用例读，而工具失败的报错文本**只有 message 一定到得了模型**。
 *
 * ── 这个模块**不管**什么（契约 §2.2 最后一段）──────────────────────────────
 *   长度上限 / 四类的配额 / 复核与次日判决 —— 那三样归判决那一侧，工具顺手加一条就是第二条判据。
 */
import { appendProposalDeduped, duplicateProposalOf } from '../lib/proposals.mjs'
import { TYPE_IDS } from '../lib/memory.mjs'
import { dayOf, nowIso, sha256Hex } from '../lib/state.mjs'

/** 注册给模型的名字（下划线 —— 与 `team_test` / `subagent_fork` 同一套；契约 §1.1）。 */
export const PROPOSAL_FILE_TOOL_NAME = 'proposal_file'

/** 五个稳定码（键名冻结：`SHAPE` / `HASH` / `DUP` / `IO` / `TOO_LONG`；均已在 `lib/error-codes.mjs` 的表里）。 */
export const PROPOSAL_FILE_CODES = Object.freeze({
  SHAPE: 'E_PROPOSAL_SHAPE',
  HASH: 'E_PROPOSAL_HASH_MISMATCH',
  DUP: 'E_PROPOSAL_DUPLICATE',
  IO: 'E_PROPOSAL_IO',
  // 🔴 2026-10-18 老板：「以后提案阶段超过400字的不准提」⇒ 入口硬闸。
  //    它和 `SHAPE` 分开，是因为「太长了」不是「格式错」—— 报文要让提的人一眼知道该干什么。
  TOO_LONG: 'E_PROPOSAL_TOO_LONG',
})

/** 每条候选正文的上限（字符）。口径**必须**和 `lib/memory.mjs` 的 `charCountOf` 一致，
 *  否则「卡上 400、工具里 380」就会变成第二个「两个判据算不同的数」。 */
export const PROPOSAL_MAX_CHARS = 400

/** 与 `lib/memory.mjs::charCountOf` 同口径：去开头 BOM、`\r\n`/`\r` 归一成 `\n`、数 Unicode code point。 */
function charCountOfText(t) {
  let s = String(t ?? '')
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return [...s].length
}

/**
 * `kind` 只许这四类 —— **值从真源取，不抄第五份**。
 *
 * 真源是 `lib/memory.mjs` 的 `TYPE_IDS`（四类只写在那儿）；本模块只**派生**它一次，
 * 用来判"这个 kind 收不收"。注入器那一侧（`inject.js` 的 `parameters.kind`）只放
 * **给模型看的散文说明**：那里写 `enum` 会让"收不收"多出第二个执行者（越界报错就不再是
 * `E_PROPOSAL_SHAPE` 点名 `kind` 了）。判据只有这一处。
 */
export const PROPOSAL_FILE_KINDS = Object.freeze([...TYPE_IDS])

/** 认识的入参就这四个；多给一个**拒**（静默忽略 = 让调用方以为它生效了）。 */
const KNOWN_ARG_KEYS = Object.freeze(['text', 'source', 'kind', 'sha256'])

const HEX64_RE = /^[0-9a-f]{64}$/i

/** 抛出去的错误：`.code` 是稳定码，`message` 以码开头。 */
function proposalError(code, message) {
  const err = new Error(message)
  err.name = 'ProposalFileError'
  err.code = code
  return err
}

/** `E_PROPOSAL_DUPLICATE` 的报文（纯函数与主路**同一处**拼 —— 两条路的报错必须长一样）。 */
function duplicateMessage(source, prior) {
  return `${PROPOSAL_FILE_CODES.DUP}: 重复 —— 同一句出处（${source}）已经用同一段正文提过，`
    + `候选池里已有那一行是 ${String(prior?.imported_id)}（第 ${String(prior?.seq)} 行）。`
    + '换了正文再来会收（判重键 = 出处 + sha256(text)）。'
}

/**
 * **形状 + 声明哈希 + 判重**，一个字节的盘都不碰（契约 §6 冻结的纯函数）。
 *
 * 次序照 `lib/proposals.mjs` 的 `importVerdict`：形状 → 内容（声明哈希）→ 判重
 * （契约 §2.2：形状错与内容重复**分成两个码**，一次调用只报一个）。
 *
 * @param {object} input
 * @param {object} input.args 调用方给的入参（`{text, source, kind?, sha256?}`）
 * @param {Array} [input.poolEntries] 池子现有的行（`readPool().entries`；主路在锁里才传真的进来）
 * @returns {{ok:true, sha256:string, kind:string}|{ok:false, code:string, message:string}}
 */
export function proposalFileVerdict({ args, poolEntries } = {}) {
  const a = args
  if (a === null || typeof a !== 'object' || Array.isArray(a)) {
    return {
      ok: false,
      code: PROPOSAL_FILE_CODES.SHAPE,
      message: `${PROPOSAL_FILE_CODES.SHAPE}: 入参必须是一个对象（实得 ${a === null ? 'null' : Array.isArray(a) ? '数组' : typeof a}）—— 必填 text 与 source`,
    }
  }

  // ① text：必填、非空。**原文逐字入池**（不 trim、不归一换行），trim 只用来判"是不是没给"。
  if (typeof a.text !== 'string' || a.text.trim() === '') {
    return {
      ok: false,
      code: PROPOSAL_FILE_CODES.SHAPE,
      message: `${PROPOSAL_FILE_CODES.SHAPE}: text 必填（非空字符串；strip 之后不许为空）—— 一条候选必须有正文`,
    }
  }
  // ①b 🔴 400 字入口闸（老板 2026-10-18：「以后提案阶段超过400字的不准提」）。
  //     只卡**入口**，不卡存量：已入库的长条目靠复核提维护案慢慢重写，不靠拒收（F-72）。
  const nchars = charCountOfText(a.text)
  if (nchars > PROPOSAL_MAX_CHARS) {
    return {
      ok: false,
      code: PROPOSAL_FILE_CODES.TOO_LONG,
      message: `${PROPOSAL_FILE_CODES.TOO_LONG}: 正文 ${nchars} 字，超过每条 ${PROPOSAL_MAX_CHARS} 字的上限 —— `
        + `请把「事实 + 判据」留下，把来历 / 推导 / 现场读数挪进当天的 log.md（F-72）`,
    }
  }
  // ② source：必填、非空。**不许静默补空**（不补 "(unknown)"、不拿正文顶上）：出处是这条候选的凭据。
  if (typeof a.source !== 'string' || a.source.trim() === '') {
    return {
      ok: false,
      code: PROPOSAL_FILE_CODES.SHAPE,
      message: `${PROPOSAL_FILE_CODES.SHAPE}: source 必填（非空字符串）—— 出处不许静默补空、也不许拿正文顶上`,
    }
  }
  // ③ kind：缺省 general；只许四类。
  const kind = a.kind === undefined ? 'general' : a.kind
  if (!PROPOSAL_FILE_KINDS.includes(kind)) {
    return {
      ok: false,
      code: PROPOSAL_FILE_CODES.SHAPE,
      message: `${PROPOSAL_FILE_CODES.SHAPE}: kind 只许 ${PROPOSAL_FILE_KINDS.join(' / ')} 这四类之一，实得 ${JSON.stringify(kind)}`,
    }
  }
  // ④ sha256：给了就必须是 64 hex（形状）。
  const actual = sha256Hex(a.text)
  if (a.sha256 !== undefined) {
    if (typeof a.sha256 !== 'string' || !HEX64_RE.test(a.sha256)) {
      return {
        ok: false,
        code: PROPOSAL_FILE_CODES.SHAPE,
        message: `${PROPOSAL_FILE_CODES.SHAPE}: sha256 必须是 64 位十六进制（= sha256(text, UTF-8)），实得 ${JSON.stringify(a.sha256)}`,
      }
    }
  }
  // ⑤ 多给了不认识的字段：拒（形状这一族还没走完，所以排在"对账"之前）。
  const unknown = Object.keys(a).filter((k) => !KNOWN_ARG_KEYS.includes(k))
  if (unknown.length > 0) {
    return {
      ok: false,
      code: PROPOSAL_FILE_CODES.SHAPE,
      message: `${PROPOSAL_FILE_CODES.SHAPE}: 不认识的入参 ${unknown.map((k) => JSON.stringify(k)).join(', ')}`
        + `（只收 ${KNOWN_ARG_KEYS.join(' / ')}）—— 多给的字段一律拒：静默忽略会让调用方以为它生效了`,
    }
  }
  // ⑥ 声明哈希与内容对账：形状对了才有资格谈内容。
  if (a.sha256 !== undefined && a.sha256.toLowerCase() !== actual) {
    return {
      ok: false,
      code: PROPOSAL_FILE_CODES.HASH,
      message: `${PROPOSAL_FILE_CODES.HASH}: 声明的 sha256 ${a.sha256.slice(0, 12)}… 与 sha256(text) 实算 ${actual.slice(0, 12)}… 不符`,
    }
  }
  // ⑦ 判重：键是 (`source`, sha256(text))。规则在 `lib/proposals.mjs` 的 `duplicateProposalOf`，
  //    主路在**锁里**调同一个函数 —— 判重只有一份口径。
  const prior = duplicateProposalOf(poolEntries, { source: a.source, sha256: actual })
  if (prior !== null) {
    return { ok: false, code: PROPOSAL_FILE_CODES.DUP, message: duplicateMessage(a.source, prior) }
  }
  return { ok: true, sha256: actual, kind }
}

/** `at`：不传 = 读时钟（`lib/state.mjs` 的 `nowIso`，生产逻辑里不出现裸 `Date`）；传了就用它（可复跑）。 */
function atOf(at) {
  if (at === undefined || at === null) return nowIso()
  return at instanceof Date ? at.toISOString() : String(at)
}

/**
 * **主路**：把一条候选原子地追加到候选池的最后一行，回那 6+ 个字段。
 *
 * @param {object} args `{text, source, kind?, sha256?}`
 * @param {{root: string, at?: string|Date, day?: string}} options `root` = **脑根**（`<内容根>/.runtime`）；
 *   `at` / `day` 只为可复跑的用例准备，生产留空 = 读时钟
 * @returns {Promise<object>} `{ok, proposal_id, entry_id, pool_path, seq, content_sha256, sha256, source, kind, imported_at}`
 */
export async function proposalFileRun(args, options = {}) {
  // `options` 是**入参的第二半**，所以它坏了也走四个码之一 —— 不许抛裸 `TypeError`
  // （那条路在框架那边会被物化成 `E_INTERNAL`，跟"程序有 bug"长得一模一样）。
  const opts = options ?? {}
  const root = opts.root
  if (typeof root !== 'string' || root.trim() === '') {
    throw proposalError(
      PROPOSAL_FILE_CODES.SHAPE,
      `${PROPOSAL_FILE_CODES.SHAPE}: root 必须是脑根的绝对路径（<内容根>/.runtime 那一层），`
        + `实得 ${root === null || root === undefined ? String(root) : typeof root === 'string' ? JSON.stringify(root) : typeof root}`,
    )
  }
  const at = atOf(opts.at)
  const day = typeof opts.day === 'string' && opts.day.trim() !== '' ? opts.day.trim() : dayOf(at)

  // 形状与声明哈希先在**盘外面**判掉（拒绝必须零写入；没必要为一次形状错去抢锁）。
  const pre = proposalFileVerdict({ args, poolEntries: [] })
  if (!pre.ok) throw proposalError(pre.code, pre.message)

  const appended = await appendProposalDeduped(root, {
    kind: 'proposal',
    source: args.source,
    sha256: pre.sha256,
    day,
    at,
    // payload 要在锁里才拼得出来：`entry.id` 的号 = 池子里第几行，而那个数只有锁里才算得准。
    payloadOf: ({ entry_id: entryId }) => ({ entry: { id: entryId, type: pre.kind, text: args.text } }),
  })

  if (!appended.ok) {
    if (appended.code === PROPOSAL_FILE_CODES.DUP) {
      throw proposalError(PROPOSAL_FILE_CODES.DUP, duplicateMessage(args.source, appended.existing))
    }
    throw proposalError(
      PROPOSAL_FILE_CODES.IO,
      `${PROPOSAL_FILE_CODES.IO}: 候选池写不进去（${String(appended.code)}）—— ${String(appended.message)}`,
    )
  }

  return {
    ok: true,
    proposal_id: appended.imported_id,
    entry_id: appended.entry_id,
    pool_path: appended.path,
    seq: appended.seq,
    content_sha256: appended.content_sha256,
    sha256: pre.sha256,
    source: args.source,
    kind: pre.kind,
    imported_at: at,
  }
}
