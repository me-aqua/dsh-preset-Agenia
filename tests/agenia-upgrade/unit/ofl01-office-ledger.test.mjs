/**
 * `OFL-01`…`OFL-06` —— **office 放行时的持久读数**（`bug-20261107-10` · batch 15）。
 *
 * 契约：`.team/test/2026-11-08/CONTRACT-batch15.md`（§一 账本 / §二 接口 / §三 读数 / §四 用例与刀 / §五 边界）。
 * 定形：`.team/leader/2026-11-08/定形-batch15.md`（§二 四条要什么，不在这里重新讨论）。
 * 被测：staged `inject.js` 的**门禁**（真 `apply()` 注册的那个 guard）与三个命名导出
 *      （`OFFICE_LANDING_LEDGER_REL` / `recordOfficeLanding` / `officeLandingLedger`）。
 *
 * ## 每一格判什么（判词，不是计数）
 *   `OFL-01` **同树也留一行**：`header.cwd` = T1 树，相对路径 `.team/review/note.md` ⇒ 放行；
 *            账上 `种子行 + 1 行`（恰好两行），新那行七键齐、`office_root === header_office === T1/.team`、
 *            `tree_differs:false`、**不带**正文、**没有** `OFFICE_TREE_DIFFERS` 日志；种子行逐字节不变。
 *            今天：**零行** —— 这一格就是定形 §一 点名的"那一半没修"。
 *   `OFL-02` **异树那行带两个 office**：`header.cwd` = T1、落点 `X/.team/review/from-a.md` ⇒ 放行；
 *            账上恰好一行、`tree_differs:true`、`office_root` = `X/.team` 与 `header_office` = `T1/.team`
 *            **两个串都在且不相等**；读者的 `cross_tree === 1`；控制台那行 `OFFICE_TREE_DIFFERS`
 *            同时含两个 office 路径。
 *   `OFL-03` **读数从账上读**：账由**测试自己**写（原始 JSONL，不经产品）—— 2 同树 + 1 异树 ⇒
 *            `3 / 2 / 1` + `warning`；3 同树 ⇒ `0` + `null`；夹一行半截 JSON ⇒ `ok:false` + `unreadable:1`
 *            （**不许**报成"2 行、一切正常"）；空账 `exists:true, entries:0`；没有账 `exists:false, ok:true`
 *            （后者明文写成"不算证据"）。产品读数与判据侧第二读者（oracle）对数。
 *   `OFL-04` **写不进去就拒**（fail-closed）：两种"账本不可写"的形状 ⇒ 那次写**被拒** + 报文以
 *            `E_GUARD_OFFICE_LEDGER` 开头 + `console.error` 点名 **码 / 账本路径 / 原因** + 账上不多一行。
 *   `OFL-05` **每一次放行都有一行**（定形 §四第一行）：三次探测（同树 / 异树 / `.team` 外被拒）⇒
 *            账上**恰好两行**，被拒那次的落点**不在**账上，且它的拒绝码仍是 `E_GUARD_OFFICE_WRITE`。
 *   `OFL-06` **刀架**：阳性对照（本批契约的最小实现，`tests/**` 自带、不 import 产品）五格必须全绿；
 *            七把刀各切对照一个开关，每把只许翻它该翻的码；真源码那一侧 `K1`（`recordOfficeLanding`
 *            函数体级）今天没有锚 ⇒ `OFL-KNIFE-ANCHOR` **红**（预期的首跑红）。
 *
 * ## 口径边界（这些格**不**判什么；同契约 §五）
 *   · **不判**被拒的写（后台硬门 / 窄权限 / 角色工具集 / 提案拒 / `.team` 外的 office 写）留不留账 ——
 *     一行都不留是**对的**（账记的是"放行"，拒的理由在报文里）；`OFL-05` 的第三探针钉这一条；
 *   · **不判**名单外岗位（`dev` / `test` / 组长）的写：`officeBoundVerdict` 第一行就 `return null`，
 *     本批**不动**那道早退（定形 §三）⇒ 那一半仍然缺，是残余风险，写在契约 §5.2；
 *   · **不判**文件真的写成了（guard 在写之前跑）、不判钟准（`at` 只判可解析）、不判并发多写者、
 *     不判账本被人手改（契约 §5.3–§5.7）；
 *   · **不判**窄会话 strict 分支与 `officeBound` 名单（`OFB-08` / `STAT-02` 守着；本批一个字节不碰）；
 *   · **没有 GUI 面**：定形 §三「面板一律不做」。人读的面 = 账本文件本身 / 控制台两行 / `result.json`。
 *
 * ## 夹具（为什么不在运行根里）
 *   运行根按守卫只能落在 `<repo>/.team/test/<日期>/_runs/<ID>` ⇒ 它自己就在**真实的** `<repo>/.team` 里
 *   ⇒ "落点在 `.team` 外被拒"与"异树"两腿都会静默塌掉。⇒ 树建在**仓库之外、祖先链上没有 `.team`** 的
 *   底座下（`support/office-ledger-fixtures.mjs` 的 `ensureLedgerFixtures`，每格 `mkdtempSync` 一个新目录）。
 *   🔴 **每格一个新目录**是判据的一部分：账本必须是空的，"恰好一行 / 恰好两行"这句话才成立
 *   （`OFL-SAMPLE-DIRTY` 挡住"用的是上一次的账"）。
 *
 * ## 今天（实现落地之前）
 *   六格全 **RED**，而且红在**缺痕迹**上（`OFL-LEDGER-ABSENT` / `OFL-READER-MISSING` /
 *   `OFL-FAIL-CLOSED-ALLOWED` / `OFL-KNIFE-ANCHOR`…），**不是**红在"文件找不到"。
 *   `OFL-06` 的阳性对照今天就必须绿 —— 它红说明判据不可满足，先修尺子。
 */
import { before, describe, test } from 'node:test'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseDir, caseFail, caseHold, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { FROZEN, PATHS } from '../support/env.mjs'
import { importStaged, readStagedText } from '../support/sut.mjs'
import { buildCatalog, buildContentRoot, configFromComposition, importSourceCopy, loadInjector } from '../support/injector-harness.mjs'
import {
  CODES, CONTENT_MARKER, CONTROL_SOURCE, KNIVES, LEDGER_REL, applyKnife, bytesOf, callReading, controlCatalog,
  dropLedgerWrite, ensureLedgerFixtures, fixtureReadings, ledgerLine, ledgerPathOf, ledgerSampleProblems,
  lineProblems, oracleLedger, readLedgerText, seedLedger, withGuardSubject, agentIn, writeStandaloneCopy,
} from '../support/office-ledger-fixtures.mjs'

/** 受试者的假会话 id（装配一次，多次调用；岗位由 `header.toolName` 决定）。 */
const AGENT_ID = 'ofl-agent'
const BOUND = [...FROZEN.staged.officeBoundRoles]
const ROLE = BOUND[0] ?? 'review'

before(() => { preflight() })

// ─────────────────────────────────────────────────────────────────────────────
// 每一格先过：夹具闸（建不出来 ⇒ HOLD + 点名，不是红）· 拓扑自检（挪走了 ⇒ 红）
// ─────────────────────────────────────────────────────────────────────────────
function fixtureGate(rec, fx, push) {
  if (fx !== null && fx.ok === true) {
    for (const [code, message] of ledgerSampleProblems(fx)) push(code, message)
    return true
  }
  const reasons = (fx?.problems ?? []).length > 0
    ? fx.problems
    : [{ code: 'OFL-SAMPLE-MISSING', message: '夹具对象没建出来（底座选不出来？）' }]
  for (const p of reasons) caseHold(rec, p.code, p.message)
  return false
}

/** 三个冻结的命名导出（契约 §2）。缺哪个就点名哪个 —— 不许落成"文件找不到"。 */
function surfaceProblems(mod) {
  const out = []
  if (typeof mod?.recordOfficeLanding !== 'function') out.push(['OFL-SURFACE-MISSING', '`inject.js` 没有导出 `recordOfficeLanding`（契约 §2.1）—— 账本没有任何一条写入路径'])
  if (typeof mod?.officeLandingLedger !== 'function') out.push(['OFL-READER-MISSING', '`inject.js` 没有导出 `officeLandingLedger`（契约 §2.2）—— 账上没有读者，读数只能从内存 readings 猜'])
  if (mod?.OFFICE_LANDING_LEDGER_REL !== LEDGER_REL) {
    out.push(['OFL-SURFACE-MISSING', `\`OFFICE_LANDING_LEDGER_REL\` 应为 ${JSON.stringify(LEDGER_REL)}（契约 §1.1），实得 ${JSON.stringify(mod?.OFFICE_LANDING_LEDGER_REL)}`])
  }
  return out
}

/** 把判据侧第二读者（oracle）与产品读者的四个计数对一次数；`warning` 另外各自绝对判。 */
function readerCountProblems(mod, office, oracle, { label = '' } = {}) {
  const out = []
  const read = mod.officeLandingLedger(office)
  const prefix = label === '' ? '' : `${label}：`
  if (read === null || typeof read !== 'object') return [['OFL-READER-SHAPE', `${prefix}\`officeLandingLedger\` 没返回对象：${JSON.stringify(read)}`]]
  for (const key of ['ok', 'path', 'exists', 'entries', 'same_tree', 'cross_tree', 'unreadable', 'warning']) {
    if (!(key in read)) out.push(['OFL-READER-SHAPE', `${prefix}读数缺键 \`${key}\`（契约 §2.2）实得 ${JSON.stringify(Object.keys(read))}`])
  }
  if (read.exists !== oracle.exists) out.push(['OFL-READER-DISAGREE', `${prefix}exists：产品说 ${JSON.stringify(read.exists)}，盘上说 ${JSON.stringify(oracle.exists)}`])
  if (read.entries !== oracle.entries) out.push(['OFL-READER-DISAGREE', `${prefix}entries：产品说 ${JSON.stringify(read.entries)}，盘上说 ${oracle.entries}（半行不许被吞）`])
  if (read.same_tree !== oracle.same_tree) out.push(['OFL-READER-DISAGREE', `${prefix}same_tree：产品说 ${JSON.stringify(read.same_tree)}，盘上说 ${oracle.same_tree}`])
  if (read.cross_tree !== oracle.cross_tree) out.push(['OFL-READER-DISAGREE', `${prefix}cross_tree：产品说 ${JSON.stringify(read.cross_tree)}，盘上说 ${oracle.cross_tree}`])
  if (read.ok !== oracle.ok) out.push(['OFL-READER-DISAGREE', `${prefix}ok：产品说 ${JSON.stringify(read.ok)}，盘上说 ${JSON.stringify(oracle.ok)}`])
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 五格判决（每一格是一个纯函数：喂 {mod, fx, subject}，返回 problem 清单）
//   同一批函数在 `OFL-06` 里也用来跑阳性对照与刀 —— **判据只有一份**。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ① 同树也留一行。
 * 顺序是**刻意**的：先判"门放行了吗"（前置），再判"盘上有没有那行"（**字节**），最后才是产品读者的计数 ——
 * 所以今天红的第一条是 `OFL-LEDGER-ABSENT`（缺痕迹），不是 `OFL-READER-MISSING`（缺函数）。
 */
async function officeRow1({ mod, fx, subject, tag }) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const tree = fx.trees[0]
  const marker = `${CONTENT_MARKER}-${tag}`
  // 种子行：测试自己当生产者，带唯一标记；放行之后它必须**逐字节**还在（只追加）。
  const seed = ledgerLine({
    landing: path.join(tree.office, 'review', `seed-${tag}.md`),
    officeRoot: tree.office,
    headerOffice: tree.office,
    treeDiffers: false,
  })
  seedLedger(tree.office, { lines: [seed] })
  const seedLine = JSON.stringify(seed)
  const target = '.team/review/note.md' // 相对路径 ⇒ 按会话头 cwd 解析 ⇒ 落进**会话头那棵树**
  let guarded = null
  let logs = []
  await withGuardSubject(subject, async ({ ask, logs: harnessLogs }) => {
    guarded = ask({ name: 'write', arguments: { file_path: target, content: marker }, agent: agentIn(subject.id, tree.dir) })
    logs = [...harnessLogs]
  })
  const call = callReading('row1 同树相对写', guarded)
  if (guarded === null || guarded.ok !== true) {
    push('OFL-HARNESS-GATE', `门禁没挂上：${String(guarded?.why ?? '没有返回值')} —— 这一格量不到"放行之后有没有留痕"`)
    return out
  }
  if (!call.allowed) {
    push('OFL-GATE-ALLOW', `同树相对写（${target}）应当放行；实得拒绝 ${JSON.stringify(call.reason.slice(0, 200))}`)
    return out
  }
  const text = readLedgerText(tree.office)
  if (text === null) {
    push('OFL-LEDGER-ABSENT', `放行了同树写（落点 ${path.join(tree.dir, target)}），但账本没有这一行（${ledgerPathOf(tree.office)} 不在）`
      + ' —— `office_root` 只作为 readings 存在，`OFFICE_TREE_DIFFERS` 在这一侧恒不触发 ⇒ 写错树在盘上零痕迹')
  }
  const oracle = oracleLedger(tree.office)
  if (text !== null) {
    const rawLines = text.split('\n').filter((line) => line.trim() !== '')
    if (rawLines.length !== 2) {
      push('OFL-ONE-LINE', `种子行 + 这一次放行应当**恰好两行**，实得 ${rawLines.length} 行 —— 每一次放行只许追加一行；`
        + '同树写（`office_root === header_office`）今天在盘上留不下任何痕迹：`OFFICE_TREE_DIFFERS` 在这一侧恒不触发，'
        + '`office_root` 只作为 readings 存在（这就是定形 §一 点名的"那一半没修"）')
    }
    const seedNow = rawLines.length > 0 ? rawLines[0] : ''
    if (!String(text).startsWith(`${seedLine}\n`)) {
      push('OFL-APPEND-ONLY', `种子行被改动了（只许追加）：写之前那一行是 ${seedLine.slice(0, 80)}…，写之后第一行是 ${seedNow.slice(0, 80)}…`)
    }
  }
  const event = oracle.lines.length > 0 ? oracle.lines[oracle.lines.length - 1] : null
  if (event !== null) {
    for (const [code, message] of lineProblems(event, {
      tool: 'write',
      landing: path.join(tree.dir, '.team', 'review', 'note.md'),
      officeRoot: tree.office,
      headerOffice: tree.office,
      treeDiffers: false,
      role: ROLE,
      marker,
      already: JSON.stringify(seed),
    })) push(code, message)
  } else if (text !== null) {
    push('OFL-ONE-LINE', '账上一行都没有（种子行也没了？）—— 这一格没有可判的行')
  }
  for (const [code, message] of surfaceProblems(mod)) push(code, message)
  if (typeof mod?.officeLandingLedger === 'function') {
    for (const [code, message] of readerCountProblems(mod, tree.office, oracle, { label: 'row1' })) push(code, message)
    const read = mod.officeLandingLedger(tree.office)
    if (read?.entries === 2 && read.same_tree !== 2) push('OFL-ONE-LINE', `读者说 entries=2 但 same_tree=${JSON.stringify(read.same_tree)}（同树那一行没被数进同树）`)
    if (read?.cross_tree !== 0) push('OFL-ONE-LINE', `同树写不可能是跨树：cross_tree 应为 0，实得 ${JSON.stringify(read?.cross_tree)}`)
  }
  const warned = logs.filter((line) => String(line).includes(CODES.differs))
  if (warned.length > 0) {
    push('OFL-WARN-NOT-EXPECTED', `同树写不该出 ${CODES.differs}（两棵树相同）—— 实得 ${JSON.stringify(warned[0].slice(0, 200))}`)
  }
  return out
}

/** ② 异树：一行 + 两个 office 都写着 + 读者数得出来 + 控制台那行同源。 */
async function officeRow2({ mod, fx, subject, tag }) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const tree = fx.trees[0]
  const other = fx.other
  if (other === null) { push('OFL-SAMPLE-TREES', '夹具里没有"另一棵树"—— 异树这一格没样本'); return out }
  const target = path.join(other.dir, '.team', 'review', `from-a-${tag}.md`)
  let guarded = null
  let logs = []
  await withGuardSubject(subject, async ({ ask, logs: harnessLogs }) => {
    guarded = ask({ name: 'write', arguments: { file_path: target, content: `${CONTENT_MARKER}-${tag}-cross` }, agent: agentIn(subject.id, tree.dir) })
    logs = [...harnessLogs]
  })
  const call = callReading('row2 异树绝对写', guarded)
  if (guarded === null || guarded.ok !== true) {
    push('OFL-HARNESS-GATE', `门禁没挂上：${String(guarded?.why ?? '没有返回值')}`)
    return out
  }
  if (!call.allowed) {
    push('OFL-GATE-ALLOW', `异树写（落点 ${target} 在 X 树的 .team 里）应当放行；实得拒绝 ${JSON.stringify(call.reason.slice(0, 200))}`)
    return out
  }
  const text = readLedgerText(tree.office)
  if (text === null) {
    push('OFL-LEDGER-ABSENT', `放行了异树写（落点 ${target}），账本却没有这一行（${ledgerPathOf(tree.office)} 不在）`
      + ' —— 定形 §二.3 第二句要的就是"那一行里两个 office 都写着"')
  }
  const oracle = oracleLedger(tree.office)
  const rawCount = text === null ? 0 : text.split('\n').filter((line) => line.trim() !== '').length
  if (text !== null && rawCount !== 1) push('OFL-CROSS-TREE', `异树写应当**恰好一行**，实得 ${rawCount} 行`)
  const event = oracle.lines.length > 0 ? oracle.lines[oracle.lines.length - 1] : null
  if (event !== null) {
    for (const [code, message] of lineProblems(event, {
      tool: 'write',
      landing: target,
      officeRoot: other.office,
      headerOffice: tree.office,
      treeDiffers: true,
      role: ROLE,
      marker: `${CONTENT_MARKER}-${tag}-cross`,
    })) push(code, message)
  }
  if (oracle.cross_tree !== 1) {
    push('OFL-CROSS-TREE', `账上 tree_differs:true 的应当恰好 1 行，实得 ${oracle.cross_tree} 行（entries=${oracle.entries}）`)
  }
  // 两个 office 都必须**真的写着**（不是一个非空就行）：契约 §四第二行。
  if (event !== null) {
    for (const [key, want] of [['office_root', other.office], ['header_office', tree.office]]) {
      if (typeof event[key] !== 'string' || event[key].trim() === '') push('OFL-CROSS-TREE', `那一行的 \`${key}\` 是空的：${JSON.stringify(event[key])}`)
      else if (normKeyOf(event[key]) !== normKeyOf(want)) push('OFL-CROSS-TREE', `那一行的 \`${key}\` 应为 ${want}，实得 ${event[key]}`)
    }
    if (typeof event.office_root === 'string' && typeof event.header_office === 'string'
      && normKeyOf(event.office_root) === normKeyOf(event.header_office)) {
      push('OFL-CROSS-TREE', `那一行的两个 office 相等（${event.office_root}）—— 异树那一行必须写出两个不同的树`)
    }
  }
  // 控制台那一行：码 + 两个 office 路径（判据在报文的两个**值**上，不钉措辞）。
  const line = logs.find((entry) => String(entry).includes(CODES.differs))
  if (line === undefined) {
    push('OFL-WARN-MISSING', `放行了异树写，控制台没有 ${CODES.differs} 那一行 —— 而这一行本批起必须由**账上那一行**驱动`)
  } else {
    if (!normKeyOf(line).includes(normKeyOf(other.office))) push('OFL-WARN-MISSING', `那一行里没有落点树的 office ${other.office}：${String(line).slice(0, 240)}`)
    if (!normKeyOf(line).includes(normKeyOf(tree.office))) push('OFL-WARN-MISSING', `那一行里没有会话头 cwd 的 office ${tree.office}：${String(line).slice(0, 240)}`)
  }
  for (const [code, message] of surfaceProblems(mod)) push(code, message)
  if (typeof mod?.officeLandingLedger === 'function') {
    for (const [code, message] of readerCountProblems(mod, tree.office, oracle, { label: 'row2' })) push(code, message)
    const read = mod.officeLandingLedger(tree.office)
    if (read?.cross_tree !== 1) push('OFL-CROSS-TREE', `读者数出来的跨树行应是 1，实得 ${JSON.stringify(read?.cross_tree)} —— "账上有异树放行那一条 ⇒ 读数能数出来"`)
    if (read?.warning !== CODES.differs) push('OFL-CROSS-TREE', `读者的 warning 应为 ${JSON.stringify(CODES.differs)}（cross_tree>0），实得 ${JSON.stringify(read?.warning)}`)
  }
  return out
}

const normKeyOf = (value) => {
  let s = String(value ?? '').replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s.toLowerCase()
}

/**
 * ③ 读数从账上读：账由**测试自己**写（不经产品），产品读者必须数得出来。
 * 这一格是"不再从内存 readings"的**唯一可翻面**的证明：如果读者数的是内存，喂文件就不会变。
 */
async function officeRow3({ mod, fx }) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const [crossTree, sameOnly, corrupt, empty, absent] = fx.trees
  // ① 2 同树 + 1 异树（三条都合法）
  seedLedger(crossTree.office, {
    lines: [
      ledgerLine({ landing: path.join(crossTree.office, 'review', 'a.md'), officeRoot: crossTree.office, headerOffice: crossTree.office, treeDiffers: false }),
      ledgerLine({ landing: path.join(crossTree.office, 'review', 'b.md'), officeRoot: crossTree.office, headerOffice: crossTree.office, treeDiffers: false }),
      ledgerLine({ landing: path.join(fx.other.office, 'review', 'c.md'), officeRoot: fx.other.office, headerOffice: crossTree.office, treeDiffers: true }),
    ],
  })
  // ② 3 行全同树
  seedLedger(sameOnly.office, {
    lines: [1, 2, 3].map((n) => ledgerLine({ landing: path.join(sameOnly.office, 'review', `s${n}.md`), officeRoot: sameOnly.office, headerOffice: sameOnly.office, treeDiffers: false })),
  })
  // ③ 2 行合法 + 1 行半截 JSON（"解析不出来"不许被当成 0 行）
  const good = [1, 2].map((n) => JSON.stringify(ledgerLine({ landing: path.join(corrupt.office, 'review', `c${n}.md`), officeRoot: corrupt.office, headerOffice: corrupt.office, treeDiffers: false })))
  seedLedger(corrupt.office, { raw: `${good.join('\n')}\n{"at": "2026-11-08T0\n` })
  // ④ 空账（exists:true, entries:0）
  seedLedger(empty.office, { raw: '' })
  // ⑤ 没有账（exists:false）—— 明文写成"不算证据"
  for (const [code, message] of surfaceProblems(mod)) push(code, message)
  if (typeof mod?.officeLandingLedger !== 'function') return out

  const cases = [
    ['2 同树 + 1 异树', crossTree, { exists: true, entries: 3, same_tree: 2, cross_tree: 1, unreadable: 0, ok: true, warning: CODES.differs }],
    ['3 行全同树', sameOnly, { exists: true, entries: 3, same_tree: 3, cross_tree: 0, unreadable: 0, ok: true, warning: null }],
    ['夹一行半截 JSON', corrupt, { exists: true, entries: 2, same_tree: 2, cross_tree: 0, unreadable: 1, ok: false }],
    ['空账', empty, { exists: true, entries: 0, same_tree: 0, cross_tree: 0, unreadable: 0, ok: true, warning: null }],
    ['没有账', absent, { exists: false, entries: 0, same_tree: 0, cross_tree: 0, unreadable: 0, ok: true, warning: null }],
  ]
  const readings = {}
  for (const [label, tree, want] of cases) {
    const read = mod.officeLandingLedger(tree.office)
    const oracle = oracleLedger(tree.office)
    readings[label] = { product: read === null || typeof read !== 'object' ? read : { ...read, lines: undefined }, oracle: { exists: oracle.exists, entries: oracle.entries, same_tree: oracle.same_tree, cross_tree: oracle.cross_tree, unreadable: oracle.unreadable, ok: oracle.ok, warning: oracle.warning } }
    if (read === null || typeof read !== 'object') { push('OFL-READER-SHAPE', `${label}：\`officeLandingLedger\` 没返回对象`); continue }
    for (const key of ['ok', 'path', 'exists', 'entries', 'same_tree', 'cross_tree', 'unreadable', 'warning']) {
      if (!(key in read)) push('OFL-READER-SHAPE', `${label}：读数缺键 \`${key}\`（契约 §2.2）实得 ${JSON.stringify(Object.keys(read))}`)
    }
    for (const [key, value] of Object.entries(want)) {
      if (read[key] !== value) {
        const target = key === 'unreadable' ? 'OFL-READER-BAD-LINE' : key === 'warning' ? 'OFL-READER-WARNING' : key === 'ok' ? 'OFL-READER-BAD-LINE' : 'OFL-READER-COUNT'
        push(target, `${label}：\`${key}\` 应为 ${JSON.stringify(value)}，实得 ${JSON.stringify(read[key])}`)
      }
    }
    if (oracle.exists !== (want.exists === true)) push('OFL-READER-COUNT', `${label}：盘上 exists 与期望不符（盘上 ${oracle.exists}）—— 种子没写成？`)
    for (const [code, message] of readerCountProblems(mod, tree.office, oracle, { label })) push(code, message)
    if (read.entries !== undefined && read.same_tree !== undefined && read.cross_tree !== undefined
      && read.entries !== read.same_tree + read.cross_tree) {
      push('OFL-READER-SHAPE', `${label}：entries(=${read.entries}) ≠ same_tree + cross_tree（= ${read.same_tree} + ${read.cross_tree}）—— 守恒式不成立`)
    }
  }
  if (mod.OFFICE_LANDING_LEDGER_REL !== LEDGER_REL) {
    push('OFL-SURFACE-MISSING', `\`OFFICE_LANDING_LEDGER_REL\` 应为 ${JSON.stringify(LEDGER_REL)}，实得 ${JSON.stringify(mod.OFFICE_LANDING_LEDGER_REL)}`)
  }
  // 读者不吃"内存里的东西"：把文件换掉，读数必须跟着变（这一条是 §2.2 的翻面面）。
  seedLedger(sameOnly.office, {
    lines: [ledgerLine({ landing: path.join(sameOnly.office, 'review', 'z.md'), officeRoot: sameOnly.office, headerOffice: sameOnly.office, treeDiffers: true })],
  })
  const after = mod.officeLandingLedger(sameOnly.office)
  if (after?.cross_tree !== 1 || after?.same_tree !== 0) {
    push('OFL-READER-COUNT', `把盘上那一行改成异树之后读者没跟着变（cross_tree=${JSON.stringify(after?.cross_tree)} same_tree=${JSON.stringify(after?.same_tree)}）—— 数的是内存，不是账`)
  }
  return out
}

/** ④ fail-closed：账写不进去 ⇒ 拒 + 出声（两种"不可写"的形状各一格）。 */
async function officeRow4({ mod, fx, subject, tag }) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const [dirShape, fileShape] = fx.trees
  // 形状 ①：账本路径被一个**目录**占着 ⇒ `appendFileSync` 必抛（本机实测 `EISDIR`）。
  mkdirSync(ledgerPathOf(dirShape.office), { recursive: true })
  // 形状 ②：`<office>/state` 是一个**文件** ⇒ `mkdirSync(…, {recursive:true})` 必抛（本机实测 `EEXIST`）。
  writeFileSync(path.join(fileShape.office, 'state'), 'OFL 夹具：state 是一个文件 —— 账本目录建不出来。\n', 'utf8')
  const shapes = [
    ['账本路径被目录占着', dirShape],
    ['state 是一个文件', fileShape],
  ]
  const calls = []
  for (const [label, tree] of shapes) {
    const target = path.join(tree.dir, '.team', 'review', `failclosed-${tag}.md`)
    let guarded = null
    let logs = []
    await withGuardSubject(subject, async ({ ask, logs: harnessLogs }) => {
      guarded = ask({ name: 'write', arguments: { file_path: target }, agent: agentIn(subject.id, tree.dir) })
      logs = [...harnessLogs]
    })
    const call = callReading(label, guarded)
    calls.push(call)
    if (guarded === null || guarded.ok !== true) {
      push('OFL-HARNESS-GATE', `${label}：门禁没挂上（${String(guarded?.why ?? '没有返回值')}）`)
      continue
    }
    if (call.allowed) {
      push('OFL-FAIL-CLOSED-ALLOWED', `${label}：账本不可写，这次写仍然被放行（fail-open）—— 定形 §二.4：账写不进去不许静默放行`)
      continue
    }
    if (!call.reason.startsWith(CODES.guard)) {
      push('OFL-FAIL-CLOSED-CODE', `${label}：拒绝码应以 ${CODES.guard} 开头，实得 ${JSON.stringify(call.reason.slice(0, 160))}`)
    }
    const line = logs.find((entry) => String(entry).includes(CODES.guard)) ?? ''
    if (line === '') push('OFL-FAIL-CLOSED-SILENT', `${label}：被拒了，但 console.error 里没有 ${CODES.guard} 那一行 —— "拒了"与"出声"是两件事`)
    else {
      if (!normKeyOf(line).includes(normKeyOf(ledgerPathOf(tree.office)))) {
        push('OFL-FAIL-CLOSED-PATH', `${label}：那一行没点名账本路径 ${ledgerPathOf(tree.office)}：${String(line).slice(0, 240)}`)
      }
      if (String(line).length < 80) push('OFL-FAIL-CLOSED-REASON', `${label}：那一行没有说清原因（太短：${JSON.stringify(String(line))}）`)
    }
    // 被拒的那一次**不许**在账上留行（"追加失败"与"追加了一半"是两件事）。
    // ⚠️ 用 `statSync` 而不是 `readLedgerText`：形状 ① 里那个路径**是目录**，`readFileSync` 会抛 EISDIR。
    const ledgerFile = ledgerPathOf(tree.office)
    let residue = null
    try {
      if (statSync(ledgerFile).isFile()) residue = readFileSync(ledgerFile, 'utf8')
    } catch { residue = null }
    if (residue !== null) push('OFL-FAIL-CLOSED-ALLOWED', `${label}：账本不可写，却在账本路径上出现了内容（${residue.slice(0, 120)}）`)
  }
  return out
}

/** ⑤ 三次探测 ⇒ 恰好两行；被拒的那次不落账；它的码仍是旧的 `E_GUARD_OFFICE_WRITE`。 */
async function officeRow5({ mod, fx, subject, tag }) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const tree = fx.trees[0]
  const other = fx.other
  if (other === null) { push('OFL-SAMPLE-TREES', '夹具里没有"另一棵树"—— 越界那一腿没样本'); return out }
  const refusedTarget = path.join(other.dir, 'src', `x-${tag}.js`)
  const probes = [
    ['同树相对', '.team/review/peek.md', true],
    ['异树绝对', path.join(other.dir, '.team', 'review', `peek-${tag}.md`), true],
    ['`.team` 外', refusedTarget, false],
  ]
  const calls = []
  let logs = []
  await withGuardSubject(subject, async ({ ask, logs: harnessLogs }) => {
    for (const [label, target] of probes) {
      const guarded = ask({ name: 'write', arguments: { file_path: target }, agent: agentIn(subject.id, tree.dir) })
      calls.push({ ...callReading(label, guarded), target })
    }
    logs = [...harnessLogs]
  })
  const [same, cross, refused] = calls
  if (calls.some((call) => call.mounted !== true)) {
    push('OFL-HARNESS-GATE', '门禁没挂上 —— 三次探测一条都量不到')
    return out
  }
  if (same.allowed !== true) push('OFL-GATE-ALLOW', `同树相对写应当放行；实得拒绝 ${JSON.stringify(same.reason.slice(0, 200))}`)
  if (cross.allowed !== true) push('OFL-GATE-ALLOW', `异树写应当放行；实得拒绝 ${JSON.stringify(cross.reason.slice(0, 200))}`)
  if (refused.allowed !== false) {
    push('OFL-THIRD-REFUSED', `\`.team\` 外的写（${refusedTarget}）应当**被拒**（那是既有口径，不是本批改的）；实得放行 —— 这一格就测不到"被拒的不落账"`)
  } else if (refused.reason.startsWith(CODES.guard)) {
    push('OFL-THIRD-CODE', `被拒的原因变成了账本那道口（${CODES.guard}）—— 账本不许接管 office 边界的拒绝：这条写根本没落进任何 \`.team\`，与账本无关`)
  } else if (!refused.reason.includes(`${FROZEN.officeBoundMessagePrefix}${ROLE}）`)) {
    // ⚠️ 判的是**既有**的岗位写边界报文（冻结前缀），不是一个码：产品今天把 `office.message` 直接返回，
    //    码 `E_GUARD_OFFICE_WRITE` 只活在纯函数的返回值里（`OFB-03` 那一格判的才是码）。这里不新增要求。
    push('OFL-THIRD-CODE', `被拒那次的报文不是既有的岗位写边界报文（前缀「${FROZEN.officeBoundMessagePrefix}${ROLE}）」不在）：`
      + `${JSON.stringify(refused.reason.slice(0, 200))}`)
  }
  const oracle = oracleLedger(tree.office)
  if (oracle.entries !== 2) {
    push('OFL-EXACTLY-TWO', `三次探测应恰好两行（同树 + 异树），实得 ${oracle.entries} 行（${JSON.stringify(oracle.lines.map((line) => line.landing))}）`)
  }
  if (oracle.same_tree !== 1 || oracle.cross_tree !== 1) {
    push('OFL-EXACTLY-TWO', `两行应当是一同树 + 一异树，实得 same=${oracle.same_tree} / cross=${oracle.cross_tree}`)
  }
  for (const line of oracle.lines) {
    if (normKeyOf(line.landing) === normKeyOf(refusedTarget)) {
      push('OFL-REFUSED-LEAVES-LINE', `被拒的那次（${refusedTarget}）居然在账上留了行 —— 账记的是"放行"（契约 §5.1）`)
    }
  }
  for (const [code, message] of surfaceProblems(mod)) push(code, message)
  if (typeof mod?.officeLandingLedger === 'function') { for (const [code, message] of readerCountProblems(mod, tree.office, oracle, { label: 'row5' })) push(code, message) }
  const warns = logs.filter((line) => String(line).includes(CODES.differs))
  if (warns.length !== 1) push('OFL-WARN-MISSING', `三次探测里只有异树那次该出 ${CODES.differs}：实得 ${warns.length} 行`)
  return out
}

const ROWS = [
  ['row1', officeRow1, 1],
  ['row2', officeRow2, 1],
  ['row3', officeRow3, 5],
  ['row4', officeRow4, 2],
  ['row5', officeRow5, 1],
]

const ROW_IDS = ROWS.map(([id]) => id)
const codesOf = (rows) => [...new Set(ROW_IDS.flatMap((id) => (rows[id] ?? []).map((p) => p.code)))].sort()

/**
 * 跑五格判决（**每一格一套新夹具**：账本必须是空的）。
 * @param {{mod:object, makeSubject:Function}} subject
 */
async function judgeRows(subject, { tag }) {
  const rows = {}
  for (const [id, row, trees] of ROWS) {
    const fx = ensureLedgerFixtures({ caseId: `${tag}-${id}`, trees })
    if (!fx.ok) { rows[id] = [problem('OFL-SAMPLE-MISSING', `夹具建不出来（${id}）：${JSON.stringify(fx.problems)}`)]; continue }
    const problems = ledgerSampleProblems(fx).map(([code, message]) => problem(code, message))
    if (problems.length === 0) {
      try {
        problems.push(...await row({ mod: subject.mod, fx, subject: subject.makeSubject(fx), tag: `${tag}-${id}` }))
      } catch (err) {
        problems.push(problem(err?.code ?? 'THROWN', `${id} 抛了：${String(err?.message ?? err).slice(0, 240)}`))
      }
    }
    rows[id] = problems
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
describe('unit · office landing ledger (OFL) · bug-20261107-10', () => {
  test('OFL-01 同树也留一行：相对路径落进会话头那棵树 ⇒ 放行，账上留 `tree_differs:false` 的那行（只追加、不记正文）', async () => {
    await runCase('OFL-01', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      const fx = ensureLedgerFixtures({ caseId: 'OFL-01', trees: 1 })
      rec.readings.fixtures = fixtureReadings(fx)
      if (!fixtureGate(rec, fx, push)) { caseFail(out); return }
      const mod = await loadSubject(push)
      if (mod !== null) {
        const subject = await buildProductSubject(mod, fx, push)
        if (subject !== null) {
          out.push(...await officeRow1({ mod, fx, subject, tag: 'ofl01' }))
          rec.readings.row1 = out.map((p) => p.code)
          rec.readings.ledger = ledgerReading(fx.trees[0].office)
          rec.readings.lines = (readLedgerText(fx.trees[0].office) ?? '').split('\n').filter((line) => line.trim() !== '').slice(0, 4)
        }
      }
      caseFail(out)
    })
  })

  test('OFL-02 异树那行：`tree_differs:true` + 两个 office 都写着 + 读者数得出来 + 控制台同源', async () => {
    await runCase('OFL-02', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      const fx = ensureLedgerFixtures({ caseId: 'OFL-02', trees: 1 })
      rec.readings.fixtures = fixtureReadings(fx)
      if (!fixtureGate(rec, fx, push)) { caseFail(out); return }
      const mod = await loadSubject(push)
      if (mod !== null) {
        const subject = await buildProductSubject(mod, fx, push)
        if (subject !== null) {
          out.push(...await officeRow2({ mod, fx, subject, tag: 'ofl02' }))
          rec.readings.row2 = out.map((p) => p.code)
          rec.readings.ledger = ledgerReading(fx.trees[0].office)
          rec.readings.lines = (readLedgerText(fx.trees[0].office) ?? '').split('\n').filter((line) => line.trim() !== '').slice(0, 4)
        }
      }
      caseFail(out)
    })
  })

  test('OFL-03 读数从账上读：测试自己写账（2 同树 + 1 异树 / 3 同树 / 夹半截 JSON）⇒ 读者必须数得出来', async () => {
    await runCase('OFL-03', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      const fx = ensureLedgerFixtures({ caseId: 'OFL-03', trees: 5 })
      rec.readings.fixtures = fixtureReadings(fx)
      if (!fixtureGate(rec, fx, push)) { caseFail(out); return }
      const mod = await loadSubject(push)
      if (mod !== null) {
        out.push(...await officeRow3({ mod, fx }))
        rec.readings.row3 = out.map((p) => p.code)
        rec.readings.ledger = {
          '2 同树 + 1 异树': ledgerReading(fx.trees[0].office),
          '3 行全同树': ledgerReading(fx.trees[1].office),
          '夹一行半截 JSON': ledgerReading(fx.trees[2].office),
          '空账': ledgerReading(fx.trees[3].office),
          '没有账': ledgerReading(fx.trees[4].office),
        }
        rec.readings.oracle = {
          '2 同树 + 1 异树': stripLines(oracleLedger(fx.trees[0].office)),
          '夹一行半截 JSON': stripLines(oracleLedger(fx.trees[2].office)),
        }
      }
      caseFail(out)
    })
  })

  test('OFL-04 写不进去就拒：账本不可写 ⇒ 写被拒 + 码/路径/原因都在控制台（fail-closed）', async () => {
    await runCase('OFL-04', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      const fx = ensureLedgerFixtures({ caseId: 'OFL-04', trees: 2 })
      rec.readings.fixtures = fixtureReadings(fx)
      if (!fixtureGate(rec, fx, push)) { caseFail(out); return }
      const mod = await loadSubject(push)
      if (mod !== null) {
        const subject = await buildProductSubject(mod, fx, push)
        if (subject !== null) {
          out.push(...await officeRow4({ mod, fx, subject, tag: 'ofl04' }))
          rec.readings.row4 = out.map((p) => p.code)
          rec.readings.ledger_paths = fx.trees.map((tree) => ledgerPathOf(tree.office))
        }
      }
      caseFail(out)
    })
  })

  test('OFL-05 三次探测 ⇒ 恰好两行：同树 + 异树各一行，`.team` 外那次被拒且不落账（旧码不变）', async () => {
    await runCase('OFL-05', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      const fx = ensureLedgerFixtures({ caseId: 'OFL-05', trees: 1 })
      rec.readings.fixtures = fixtureReadings(fx)
      if (!fixtureGate(rec, fx, push)) { caseFail(out); return }
      const mod = await loadSubject(push)
      if (mod !== null) {
        const subject = await buildProductSubject(mod, fx, push)
        if (subject !== null) {
          out.push(...await officeRow5({ mod, fx, subject, tag: 'ofl05' }))
          rec.readings.row5 = out.map((p) => p.code)
          rec.readings.ledger = ledgerReading(fx.trees[0].office)
          rec.readings.lines = (readLedgerText(fx.trees[0].office) ?? '').split('\n').filter((line) => line.trim() !== '').slice(0, 4)
        }
      }
      caseFail(out)
    })
  })

  test('OFL-06 刀架：阳性对照五格全绿 + 七把刀各翻自己那几码 + 真源码 K1（今天锚缺失，预期红）', async () => {
    await runCase('OFL-06', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      const base = path.join(caseDir('OFL-06'), 'ofl06')
      const built = buildContentRoot({ root: path.join(runRoot(), 'tmp', 'ofl-harness'), presetDir: PATHS.stagedPreset, runRoot: runRoot() })
      rec.readings.harness = { content_root: built.root, md_files: built.md_files.length }

      // ── ① 阳性对照：同一批行函数喂给它，必须全绿（否则是判据不可满足 ⇒ 先修尺子）──
      const control = await importSourceCopy({ dir: path.join(base, 'control'), source: CONTROL_SOURCE })
      const controlRows = control.ok
        ? await judgeRows({ mod: control.mod, makeSubject: (fx) => controlSubject(control.mod, fx, built.root) }, { tag: 'ctl' })
        : null
      rec.readings.control = control.ok
        ? { codes: codesOf(controlRows), rows: Object.fromEntries(ROW_IDS.map((id) => [id, (controlRows[id] ?? []).map((p) => p.code)])) }
        : { ok: false, code: control.code, why: control.why }
      if (!control.ok) {
        push('OFL-CONTROL-UNAVAILABLE', `阳性对照 import 不了：${control.code} ${control.why}`)
      } else if (codesOf(controlRows).length > 0) {
        push('OFL-CONTROL-NOT-GREEN', `阳性对照自己没有全绿（${JSON.stringify(codesOf(controlRows))}）—— 判据不可满足，先修尺子：`
          + JSON.stringify(Object.fromEntries(ROW_IDS.map((id) => [id, (controlRows[id] ?? []).map((p) => p.message.slice(0, 100))]))) )
      }

      // ── ② 七把刀（切对照的一个开关）：每把只许翻它该翻的码 ────────────────
      const knifeRows = {}
      if (control.ok) {
        for (const knife of KNIVES) {
          const cut = applyKnife(CONTROL_SOURCE, knife)
          const row = { label: knife.label, delta: knife.delta, want: [...knife.want].sort(), codes: null, control: null }
          if (!cut.ok) {
            row.control = { ok: false, code: cut.code, why: cut.why }
            push('OFL-KNIFE-CONTROL-ANCHOR', `${knife.id} 在对照上没有落点：${cut.code} ${cut.why} —— 尺子坏了，不许当成"刀咬了"`)
          } else {
            const mutant = await importSourceCopy({ dir: path.join(base, `knife-${knife.id}`), source: cut.source })
            if (!mutant.ok) {
              row.control = { ok: false, code: 'KNIFE-IMPORT-FAILED', why: mutant.why }
              push('OFL-KNIFE-IMPORT', `${knife.id}：切过的对照 import 不了（那不是"咬到了"，是换个崩法）：${mutant.why}`)
            } else {
              const rows = await judgeRows({ mod: mutant.mod, makeSubject: (fx) => controlSubject(mutant.mod, fx, built.root) }, { tag: `k${knife.id.slice(1)}` })
              const codes = codesOf(rows)
              row.control = { ok: true, codes, rows: Object.fromEntries(ROW_IDS.map((id) => [id, (rows[id] ?? []).map((p) => p.code)])) }
              row.codes = codes
              if (JSON.stringify(codes) !== JSON.stringify(row.want)) {
                const onlyActual = codes.filter((c) => !row.want.includes(c))
                const onlyWant = row.want.filter((c) => !codes.includes(c))
                push('OFL-KNIFE-VECTOR', `${knife.id}：翻面集与期望不同（多翻 ${JSON.stringify(onlyActual)} · 少翻 ${JSON.stringify(onlyWant)}）`
                  + ` —— 多翻 = 刀切宽了，少翻 = 那一面没人守；实测 ${JSON.stringify(codes)}，期望 ${JSON.stringify(row.want)}`)
              }
            }
          }
          knifeRows[knife.id] = row
        }
      }
      rec.readings.knives = knifeRows

      // ── ③ 真源码那一侧（`K1` 函数体级）：今天没有锚 ⇒ 预期红 ──────────────
      const realSource = (() => {
        try { return readStagedText('inject.js') } catch (err) { push('OFL-SURFACE-MISSING', `读不到 staged inject.js：${String(err?.message ?? err).slice(0, 160)}`); return null }
      })()
      if (realSource !== null) {
        // ── ③' 副本机器自检（与锚在不在无关，**今天就能跑**）──────────────────
        // 为什么要有它：`K1` 的真源码腿只有在锚出现之后才会执行；如果那一段的"自足副本"
        // 机器本身是坏的（没带 `lib/` + `tools/`），它会以"找不到 route.mjs"的样子假红 ——
        // 而那时没人分得清是"刀切坏了"还是"副本没带齐"（batch 13 踩过）。所以先拿**未切过的**
        // 真源码走一遍同一个函数：副本 import 得动、`apply` 在，才算这台机器能用。
        const copyDir = path.join(base, 'standalone-copy')
        const copiedFile = writeStandaloneCopy({ dir: copyDir, presetDir: PATHS.stagedPreset, source: realSource })
        const copied = await loadInjector(copiedFile)
        rec.readings.standalone_copy = { file: copiedFile, ok: copied.ok, code: copied.code, why: copied.why, has_apply: copied.ok ? typeof copied.mod.apply === 'function' : null }
        if (!copied.ok) {
          push('OFL-KNIFE-UNAVAILABLE', `真源码的**自足副本** import 不了（lib/ + tools/ 没带齐？）：${copied.code} ${copied.why}`)
        } else if (typeof copied.mod.apply !== 'function') {
          push('OFL-KNIFE-UNAVAILABLE', '真源码副本没有导出 `apply` —— 副本机器坏了（真源码刀会以"找不到 route.mjs"假红）')
        }
        const cut = dropLedgerWrite(realSource)
        rec.readings.real_knife = { knife: 'K1', anchor: cut.ok ? 'found' : cut.code, why: cut.why }
        if (!cut.ok) {
          push('OFL-KNIFE-ANCHOR', `真 staged 源码里找不到这一刀的锚（本批还没实现 ⇒ 预期红）：${cut.code} ${cut.why} —— `
            + '实现落地后这一条必须消失：`recordOfficeLanding` 的函数体被换掉之后，只有 row1/row2/row5 该红（`OFL-LEDGER-ABSENT` / `OFL-ONE-LINE` / `OFL-CROSS-TREE` / `OFL-EXACTLY-TWO`）')
        } else {
          const mod = await loadSubject(push)
          const baseline = mod === null ? null : await judgeRows({ mod, makeSubject: (fx) => productSubject(mod, fx, built.root) }, { tag: 'realbase' })
          rec.readings.real_knife.baseline = baseline === null ? null : codesOf(baseline)
          if (baseline === null || codesOf(baseline).length > 0) {
            rec.readings.real_knife.skipped = 'baseline-not-green（真源码还没达到契约；刀没有可比对象 —— 不是刀坏了）'
          } else {
            const dir = path.join(base, 'knife-real-K1')
            const file = writeStandaloneCopy({ dir, presetDir: PATHS.stagedPreset, source: cut.source })
            const mutant = await loadInjector(file)
            if (!mutant.ok) {
              push('OFL-KNIFE-IMPORT', `真源码的 K1 副本 import 不了：${mutant.code} ${mutant.why}`)
            } else {
              const rows = await judgeRows({ mod: mutant.mod, makeSubject: (fx) => productSubject(mutant.mod, fx, built.root) }, { tag: 'realk1' })
              const codes = codesOf(rows)
              const want = ['OFL-LEDGER-ABSENT', 'OFL-ONE-LINE', 'OFL-CROSS-TREE', 'OFL-EXACTLY-TWO']
              rec.readings.real_knife.codes = codes
              rec.readings.real_knife.want = want
              if (JSON.stringify(codes) !== JSON.stringify(want)) {
                push('OFL-KNIFE-VECTOR', `真源码 K1：翻面集与期望不同（实测 ${JSON.stringify(codes)}，期望 ${JSON.stringify(want)}）`)
              }
            }
          }
        }
      }
      caseFail(out)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 受试者（产品 / 对照）的装配
// ─────────────────────────────────────────────────────────────────────────────
async function loadSubject(push) {
  try {
    const mod = await importStaged('inject.js')
    if (typeof mod.officeBoundVerdict !== 'function') {
      push('OFL-SURFACE-MISSING', 'staged/inject.js 没有导出 officeBoundVerdict（batch 14 的冻结面）')
      return null
    }
    return mod
  } catch (err) {
    push('OFL-SURFACE-MISSING', `staged/inject.js import 不了：${String(err?.message ?? err).slice(0, 200)}`)
    return null
  }
}

const headerFor = (fx) => ({ cwd: fx.trees[0].dir, agentPreset: 'agenia-member', toolName: `team_${ROLE}` })

/** 产品那一侧：config 从组合本体读（不手抄 `officeBound` / `delegationTools`）。 */
function productSubject(mod, fx, contentRoot) {
  const yml = readStagedText('agent.cordis.yml')
  const conf = configFromComposition({ ymlText: yml, contentDir: contentRoot })
  if (!conf.ok) return null
  return {
    mod,
    config: { ...conf.config, defaultRole: 'member' },
    contentDir: contentRoot,
    header: headerFor(fx),
    id: `${AGENT_ID}-${path.basename(path.dirname(fx.root))}`,
    catalog: buildCatalog(Array.isArray(mod.BASE_TOOL_SET) ? mod.BASE_TOOL_SET : []),
  }
}

async function buildProductSubject(mod, fx, push) {
  const contentRoot = path.join(runRoot(), 'tmp', 'ofl-harness')
  buildContentRoot({ root: contentRoot, presetDir: PATHS.stagedPreset, runRoot: runRoot() })
  const subject = productSubject(mod, fx, contentRoot)
  if (subject === null) push('OFL-HARNESS-CONFIG', '组合里读不出 persona-injector 的 config（载具缺输入）')
  return subject
}

/** 对照那一侧：config 只有 `officeBound`（它的 `apply` 就只读这一个键）。 */
function controlSubject(mod, fx, contentRoot) {
  return {
    mod,
    config: { officeBound: BOUND },
    contentDir: contentRoot,
    header: headerFor(fx),
    id: `${AGENT_ID}-ctl-${path.basename(path.dirname(fx.root))}`,
    catalog: controlCatalog(),
  }
}

/** 读数：这一格的账（产品读者 + oracle 都抄一份；产品读不出来就记 null）。 */
function ledgerReading(office) {
  const text = readLedgerText(office)
  return {
    path: ledgerPathOf(office),
    exists: text !== null,
    bytes: text === null ? null : bytesOf(text),
    entries_text: text === null ? 0 : text.split('\n').filter((line) => line.trim() !== '').length,
    oracle: stripLines(oracleLedger(office)),
  }
}

const stripLines = (ledger) => {
  if (ledger === null || typeof ledger !== 'object') return ledger
  const { lines, malformed, ...rest } = ledger
  return { ...rest, malformed: Array.isArray(malformed) ? malformed.slice(0, 3) : malformed }
}
