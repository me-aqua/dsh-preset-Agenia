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
import { buildCatalog, buildContentRoot, configFromComposition, importSourceCopy, knifeReplace, loadInjector } from '../support/injector-harness.mjs'
import {
  CODES, CONTENT_MARKER, CONTROL_SOURCE, HALF_LINE_CODE_CANDIDATE, KNIVES, LEDGER_REL,
  READER_CONTROL_SOURCE, READER_KNIVES,
  applyKnife, bytesOf, callReading, controlCatalog, dropLedgerWrite, ensureLedgerFixtures, fixtureReadings,
  ledgerCodeBookProblems, ledgerLine, ledgerPathOf, ledgerSampleProblems, lineProblems, oracleLedger, readLedgerText, seedLedger,
  withGuardSubject, agentIn, writeStandaloneCopy,
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
  // 🔴 这一行必须**自洽**（值表 V6）：`tree_differs:true` ⇔ 两个 office 不相等。写成"同一个 office + true"
  //    会被产品按值表判成不合规（计入 `unreadable`）—— 那是**种子错**，不是读者错，也不许为它放宽 V6。
  seedLedger(sameOnly.office, {
    lines: [ledgerLine({ landing: path.join(fx.other.office, 'review', 'z.md'), officeRoot: fx.other.office, headerOffice: sameOnly.office, treeDiffers: true })],
  })
  const after = mod.officeLandingLedger(sameOnly.office)
  if (after?.cross_tree !== 1 || after?.same_tree !== 0 || after?.entries !== 1 || after?.unreadable !== 0 || after?.ok !== true) {
    push('OFL-READER-COUNT', `把盘上那一行改成异树之后读者没跟着变（cross_tree=${JSON.stringify(after?.cross_tree)} same_tree=${JSON.stringify(after?.same_tree)} entries=${JSON.stringify(after?.entries)} unreadable=${JSON.stringify(after?.unreadable)} ok=${JSON.stringify(after?.ok)}）—— 数的是内存，不是账；或那一行不是自洽的异树行`)
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

// ─────────────────────────────────────────────────────────────────────────────
// `OFL-07`（F11）：**半截的最后一行**与**中间坏行**必须是两个读数
//   · (a) 最后一行写了一半 ⇒ `partial_tail > 0` · `unreadable === 0` · `ok:false` · `reason` 点名"写了一半"
//         · **自己的码**（≠ (b) 的 `E_OFFICE_LEDGER_UNREADABLE`、≠ `E_OFFICE_LEDGER_SHAPE`；名字由实现定，
//           候选 `E_OFFICE_LEDGER_PARTIAL_TAIL`）；
//   · (b) 中间一行坏   ⇒ `unreadable > 0` · `partial_tail === 0` · `ok:false` · `reason` 点名"不合格"
//         · 码**仍是** `E_OFFICE_LEDGER_UNREADABLE`（组长裁定：坏行不换码）；
//   · (c) 干净账本     ⇒ 两个 0 且 `ok:true`、`reason:null`；
//   · (d) **组合**       ⇒ 半截尾行 + 中间坏行同时在场：`partial_tail === 1`、`unreadable === 1`、`entries === 2`、
//         `ok:false`，**码按声明 2 走坏行**（`E_OFFICE_LEDGER_UNREADABLE`；半截事实由 `partial_tail` 承重）。
//   组合面的设计选择与理由写在 (d) 那段注释里（**不是**"照今天的输出写"）。
//   `ok:false` 两格是"诚实上限"：**报告了**（不是静默容忍一个坏尾行）。
//   四个面的码各自独立（`OFL7-LAST-HALF` / `OFL7-MIDDLE-CORRUPT` / `OFL7-CLEAN` / `OFL7-COMBINED`），
//   三把刀（`READER_KNIVES`）各翻自己那一面 —— 刀只切**对照读者**，判据本体只在这一处。
// ─────────────────────────────────────────────────────────────────────────────
/** "写了一半"这一面的措辞标记（产品 / 对照的 reason 至少命中一个）。 */
const HALF_WRITTEN_MARKERS = ['写了一半', 'half-written', 'half written']
/** "坏行"这一面的措辞标记 —— 两面**不许互相命中**（混成一句就是"分不开"）。 */
const CORRUPT_MARKERS = ['不合格', '坏行', 'corrupt', 'unparsable']
const containsAnyMarker = (text, markers) => markers.some((marker) => String(text).toLowerCase().includes(marker.toLowerCase()))

/**
 * 一个读数的**码**：优先取 `reason` 的 `E_…:` 前缀 —— **那才是人读的那个字符串**；`reason` 没有码前缀时
 * 才看 `read.code`（实现若加了独立字段）。读不出 ⇒ `null`。
 * 🔴 半截面与坏行面必须**按码**分得开（组长裁定）：只加一个 `code` 字段、`reason` 仍写着
 *    `E_OFFICE_LEDGER_UNREADABLE` 不算 —— 那句字符串还是同一个。
 */
function codeOf(read) {
  if (read === null || typeof read !== 'object') return null
  const hit = /^\s*(E_[A-Z0-9_]+)\s*:/.exec(String(read.reason ?? ''))
  if (hit !== null) return hit[1]
  if (typeof read.code === 'string' && read.code.trim() !== '') return read.code.trim()
  return null
}

/** 四面的账：**每格一棵树**（账本天然是空的）。 */
function seedReaderFaces(fx) {
  const [lastHalf, middleBad, clean, combined] = fx.trees
  const first = ledgerLine({ landing: path.join(lastHalf.office, 'review', 'a.md'), officeRoot: lastHalf.office, headerOffice: lastHalf.office, treeDiffers: false })
  const second = ledgerLine({ landing: path.join(lastHalf.office, 'review', 'b.md'), officeRoot: lastHalf.office, headerOffice: lastHalf.office, treeDiffers: false })
  // (a) 一行合法 + 最后一行**没有换行**的半截 JSON —— 并发写没写完的形状。
  seedLedger(lastHalf.office, { raw: `${JSON.stringify(first)}\n{"at": "2026-11-09T0` })
  // (b) 第一行合法 + **中间**一行坏 JSON + 最后一行合法。
  seedLedger(middleBad.office, { raw: `${JSON.stringify(first)}\n{"at": "2026-11-09T0\n${JSON.stringify(second)}\n` })
  // (c) 两行合法。
  seedLedger(clean.office, { lines: [first, second] })
  // (d) 组合：合法 + **中间坏** + 合法 + **半截尾行** —— 两个事实同时在场（评审点名的未覆盖组合）。
  seedLedger(combined.office, { raw: `${JSON.stringify(first)}\n{"at": "broken\n${JSON.stringify(second)}\n{"at": "2026-11-09T0` })
  return { lastHalf, middleBad, clean, combined }
}

/** 只留读数里那几格（`lines` 不进证据，免得把整本账抄进去）。 */
function readerReadingOf(read) {
  if (read === null || typeof read !== 'object') return read
  const { lines, ...rest } = read
  return rest
}

/**
 * 同一段四面断言 —— 产品、阳性对照、三把刀**喂的是这一份**。
 * @returns {{problems: Array<{code:string,message:string}>, readings: object}}
 */
async function readerFaces({ mod, fx, label }) {
  const out = []
  const readings = {}
  if (typeof mod?.officeLandingLedger !== 'function') {
    out.push(problem('OFL7-READER-MISSING', `${label}：没有 \`officeLandingLedger\` —— 这一格没有读者可判`))
    return { problems: out, readings }
  }
  const trees = seedReaderFaces(fx)
  const readOf = (tree, face) => {
    try {
      return mod.officeLandingLedger(tree.office)
    } catch (err) {
      out.push(problem('OFL7-READER-THREW', `${label}/${face} 抛了：${String(err?.message ?? err).slice(0, 200)}`))
      return null
    }
  }
  const a = readOf(trees.lastHalf, 'last-half')
  const b = readOf(trees.middleBad, 'middle-bad')
  const c = readOf(trees.clean, 'clean')
  const d = readOf(trees.combined, 'combined')
  readings.last_half = readerReadingOf(a)
  readings.middle_bad = readerReadingOf(b)
  readings.clean = readerReadingOf(c)
  readings.combined = readerReadingOf(d)

  // (a) 最后一行写了一半
  {
    const d = []
    if (a === null || typeof a !== 'object') d.push('读者没返回对象')
    else {
      for (const key of ['exists', 'entries', 'unreadable', 'partial_tail', 'ok', 'reason']) {
        if (!(key in a)) d.push(`读数缺键 \`${key}\``)
      }
      if (a.exists !== true) d.push(`exists 必须 true（账本已种下）实得 ${JSON.stringify(a.exists)}`)
      if (a.partial_tail !== 1) d.push(`最后一行半截 ⇒ \`partial_tail\` 应为 1（>0），实得 ${JSON.stringify(a.partial_tail)}`)
      if (a.unreadable !== 0) d.push(`半截最后一行不是"中间行坏" ⇒ \`unreadable\` 应为 0，实得 ${JSON.stringify(a.unreadable)}`)
      if (a.entries !== 1) d.push(`半截之前那一行合法 ⇒ \`entries\` 应为 1，实得 ${JSON.stringify(a.entries)}`)
      if (a.ok !== false) d.push(`半行必须让 \`ok:false\`（"报告了"不等于"容忍"），实得 ${JSON.stringify(a.ok)}`)
      const reason = String(a.reason ?? '')
      if (!containsAnyMarker(reason, HALF_WRITTEN_MARKERS)) d.push(`reason 没点名"写了一半"：${JSON.stringify(reason.slice(0, 200))}`)
      if (containsAnyMarker(reason, CORRUPT_MARKERS)) d.push(`reason 把半截说成了坏行（两个面混成一句）：${JSON.stringify(reason.slice(0, 200))}`)
      // 🔴 组长裁定（2026-11-09）：`ok:false` 留着，但**码必须分开** —— 半截尾行与中间坏行
      //    今天共用 `E_OFFICE_LEDGER_UNREADABLE`，读的人分不出"有人边写边读"与"账本坏了"。
      const code = codeOf(a)
      if (code === null) {
        d.push('读数里读不出半截面的码（没有 `code`、`reason` 也没有 `E_…:` 前缀）—— 两个面按码分不开')
      } else {
        if (code === CODES.unreadable) d.push(`半截尾行与**中间坏行**共用 \`${CODES.unreadable}\` —— 它必须有自己的码（候选 \`${HALF_LINE_CODE_CANDIDATE}\`），否则"并发写没写完"与"账本坏了"是同一个字符串`)
        if (code === CODES.shape) d.push(`半截尾行不许复用 \`${CODES.shape}\`（那是"一行不合契约 §1.2"的码，不是"最后一行没写完"）`)
      }
    }
    if (d.length > 0) out.push(problem('OFL7-LAST-HALF', `${label}：${d.join(' · ')}`))
  }
  // (b) 中间一行坏
  {
    const d = []
    if (b === null || typeof b !== 'object') d.push('读者没返回对象')
    else {
      for (const key of ['exists', 'entries', 'unreadable', 'partial_tail', 'ok', 'reason']) {
        if (!(key in b)) d.push(`读数缺键 \`${key}\``)
      }
      if (b.exists !== true) d.push(`exists 必须 true（账本已种下）实得 ${JSON.stringify(b.exists)}`)
      if (b.unreadable !== 1) d.push(`中间一行坏 ⇒ \`unreadable\` 应为 1（>0），实得 ${JSON.stringify(b.unreadable)}`)
      if (b.partial_tail !== 0) d.push(`中间行坏不是"最后一行写了一半" ⇒ \`partial_tail\` 必须 0，实得 ${JSON.stringify(b.partial_tail)}`)
      if (b.entries !== 2) d.push(`坏行两侧各一行合法 ⇒ \`entries\` 应为 2，实得 ${JSON.stringify(b.entries)}`)
      if (b.ok !== false) d.push(`坏行必须让 \`ok:false\`，实得 ${JSON.stringify(b.ok)}`)
      const reason = String(b.reason ?? '')
      if (!containsAnyMarker(reason, CORRUPT_MARKERS)) d.push(`reason 没点名"行不合格"：${JSON.stringify(reason.slice(0, 200))}`)
      if (containsAnyMarker(reason, HALF_WRITTEN_MARKERS)) d.push(`reason 把中间坏行说成了"写了一半"（两个面混成一句）：${JSON.stringify(reason.slice(0, 200))}`)
      // 组长裁定（2026-11-09）：中间坏行**保留** `E_OFFICE_LEDGER_UNREADABLE` —— 半截面的新码不许把它也改掉。
      const code = codeOf(b)
      if (code !== CODES.unreadable) d.push(`中间坏行的码必须仍是 \`${CODES.unreadable}\`，实得 ${JSON.stringify(code)}`)
    }
    if (d.length > 0) out.push(problem('OFL7-MIDDLE-CORRUPT', `${label}：${d.join(' · ')}`))
  }
  // (c) 干净账本
  {
    const d = []
    if (c === null || typeof c !== 'object') d.push('读者没返回对象')
    else {
      for (const key of ['entries', 'unreadable', 'partial_tail', 'ok', 'reason']) {
        if (!(key in c)) d.push(`读数缺键 \`${key}\``)
      }
      if (c.entries !== 2) d.push(`两行合法 ⇒ \`entries\` 应为 2，实得 ${JSON.stringify(c.entries)}`)
      if (c.partial_tail !== 0) d.push(`干净账本 ⇒ \`partial_tail\` 应为 0，实得 ${JSON.stringify(c.partial_tail)}`)
      if (c.unreadable !== 0) d.push(`干净账本 ⇒ \`unreadable\` 应为 0，实得 ${JSON.stringify(c.unreadable)}`)
      if (c.ok !== true) d.push(`干净账本 ⇒ \`ok:true\`，实得 ${JSON.stringify(c.ok)}`)
      if (c.reason !== null) d.push(`干净账本不该有 reason，实得 ${JSON.stringify(c.reason)}`)
    }
    if (d.length > 0) out.push(problem('OFL7-CLEAN', `${label}：${d.join(' · ')}`))
  }
  // (d) 组合：半截尾行 **与** 中间坏行同时在场 —— 选定 **设计 2**（见下面那段注释）。
  // 🔴 组合面的**设计选择**（组长 2026-11-09 交办）：两种都合法，本格选 **设计 2（一个赢、声明出来）**：
  //    `reason` 只有一个 `E_…:` 码前缀；把两个码塞进一个前缀会让"这条读数的码是什么"变成二义
  //    （(a)/(b) 的分面判据也依赖"一个面一个码"）。⇒ **坏行赢**（中间行坏 = 账本已不可信；半截尾行更轻），
  //    `reason` 走 `E_OFFICE_LEDGER_UNREADABLE`；**半截事实不丢**：它仍在 `partial_tail`（本格断言 === 1）。
  //    设计 2 与设计 1 的分界也钉在这里：**`reason` 只带赢家（坏行），不许把半截也写进去** ——
  //    写了就是设计 1（两个事实都进 reason），本格红，要先改契约。
  //    若产品改成"半截赢"或"两个都写进 reason（设计 1）"⇒ 本格红；那时要先改契约再改这一格，
  //    不许把今天的输出当标准。夹具：合法 + 中间坏 + 合法 + 半截尾行（`entries:2 · unreadable:1 · partial_tail:1`）。
  {
    const dd = []
    if (d === null || typeof d !== 'object') dd.push('读者没返回对象')
    else {
      for (const key of ['entries', 'unreadable', 'partial_tail', 'ok', 'reason']) {
        if (!(key in d)) dd.push(`读数缺键 \`${key}\``)
      }
      if (d.ok !== false) dd.push(`两个坏事实同时在场 ⇒ \`ok:false\`，实得 ${JSON.stringify(d.ok)}`)
      if (d.partial_tail !== 1) dd.push(`半截尾行仍必须被数出来 ⇒ \`partial_tail\` 应为 1，实得 ${JSON.stringify(d.partial_tail)}（这一格就是防"坏行把半截吞掉"）`)
      if (d.unreadable !== 1) dd.push(`中间坏行仍必须被数出来 ⇒ \`unreadable\` 应为 1，实得 ${JSON.stringify(d.unreadable)}`)
      if (d.entries !== 2) dd.push(`坏行两侧各一行合法 ⇒ \`entries\` 应为 2，实得 ${JSON.stringify(d.entries)}`)
      const code = codeOf(d)
      if (code === null) dd.push('组合面读不出码 —— 两个事实都没进 `reason` 的 `E_…:` 前缀，也没有 `code` 字段')
      else if (code !== CODES.unreadable) {
        dd.push(`**声明的是设计 2：坏行赢**（组合面的码应为 \`${CODES.unreadable}\`），实得 \`${code}\``
          + `${code === HALF_LINE_CODE_CANDIDATE ? ' —— 半截赢了（那是另一种声明，必须先改契约）' : ''}`)
      }
      const reason = String(d.reason ?? '')
      if (!containsAnyMarker(reason, CORRUPT_MARKERS)) dd.push(`组合面 reason 没点名坏行（声明 2 的赢家是坏行）：${JSON.stringify(reason.slice(0, 200))}`)
      // 设计 2 与设计 1 的**分界**：设计 2 的 reason 只带赢家（坏行），另一个事实（半截）必须由
      // `partial_tail` 承重。若 reason 也把半截写进去 ⇒ 那是设计 1，本格红（要先改契约）。
      if (containsAnyMarker(reason, HALF_WRITTEN_MARKERS)) {
        dd.push(`声明 2：reason 只带赢家（坏行），半截事实应由 \`partial_tail\` 承重；reason 里也写了半截 ⇒ 这是设计 1（要先改契约）：${JSON.stringify(reason.slice(0, 200))}`)
      }
    }
    if (dd.length > 0) out.push(problem('OFL7-COMBINED', `${label}：${dd.join(' · ')}`))
  }
  return { problems: out, readings }
}

const codesOfProblems = (problems) => [...new Set((problems ?? []).map((p) => p.code))].sort()

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

  test('OFL-06 刀架：阳性对照五格全绿 + 七把刀各翻自己那几码 + 真源码 K1（锚在 · 基线成立才判）', async () => {
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

      // ── ③ 真源码那一侧（`K1` 函数体级）：锚在 ⇒ 基线成立才判；锚不在 ⇒ `OFL-KNIFE-ANCHOR` ──
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
          push('OFL-KNIFE-ANCHOR', `真 staged 源码里找不到这一刀的锚（契约 §2.1 的冻结名字）：${cut.code} ${cut.why} —— `
            + '先看锚（名字被改了 / 函数被删了），不是"产品没实现"；这一刀该翻的是一组**六**码：`OFL-CROSS-TREE` · `OFL-EXACTLY-TWO` · '
            + '`OFL-FAIL-CLOSED-ALLOWED` · `OFL-LEDGER-ABSENT` · `OFL-LINE-VALUES` · `OFL-ONE-LINE`'
            + ' —— `OFL-ONE-LINE`（行数 ≠ 2）与 `OFL-LINE-VALUES`（最后一行逐字等于种子行）是**同一条事实的两句话**：'
            + '没有追加行时最后一行就是种子行 ⇒ 「有 `ONE-LINE` 而没有 `LINE-VALUES`」这种形状不存在')
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
              /**
               * 🔴 **为什么恰好是这六个**（gate-2 重开时逐条查过的；写在这里，下一个读它的人不必再推一遍）：
               * 这一刀把 `recordOfficeLanding` 的函数体换成"什么都不写" ⇒ 四格产生码，按格拆开正好六个**不同**的：
               *   · row1（同树放行）：`OFL-ONE-LINE`（行数 ≠ 2）**与** `OFL-LINE-VALUES`（最后一行逐字等于种子行）——
               *     这两个是**同一条事实的两句话**：没有追加行 ⇒ 最后一行**就是**种子行 ⇒
               *     「有 `ONE-LINE` 而没有 `LINE-VALUES`」这种形状**不存在**（这也是为什么 `want` 不能只写四条）。
               *   · row2（异树放行）：`OFL-LEDGER-ABSENT`（会话头那本账里没有这一行）+ `OFL-CROSS-TREE`（带两个 office 的那行没了）；
               *   · row4（账写不进去）：`OFL-FAIL-CLOSED-ALLOWED`（追加这一步都不存在了，失败分支当然也不存在）；
               *   · row5（三次探测）：`OFL-EXACTLY-TWO`（凑不出"恰好两行"）；row3（读者）无码。
               * ⇒ 2 + 2 + 1 + 1 = **六**，与对照侧 `KNIVES[K1].want` 逐字相同（那边 `match=true`，`readings.knives.K1`）。
               * 判据是**精确集合相等**（`JSON.stringify(codes) !== JSON.stringify(want)`）⇒ 把这两条加进来只会**更严**
               * （漏翻 ⇒ 红），不会让任何一个该红的变异体变绿。
               */
              const want = ['OFL-CROSS-TREE', 'OFL-EXACTLY-TWO', 'OFL-FAIL-CLOSED-ALLOWED', 'OFL-LEDGER-ABSENT', 'OFL-LINE-VALUES', 'OFL-ONE-LINE']
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

  test('OFL-07 半行与坏行必须解释得不一样：最后一行半截 ⇒ partial_tail（unreadable 0）且**自己的码** · 中间行坏 ⇒ unreadable（partial_tail 0，码仍是 UNREADABLE） · 干净 ⇒ 两个 0 · **组合（两个事实同时在场）⇒ 声明 2：坏行赢，半截仍由 partial_tail 读出**；两格都 ok:false；三把刀各翻自己那几面', async () => {
    await runCase('OFL-07', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      // ── ① 产品读者（staged `inject.js`）：四个面各一棵空树 ────────────────
      const fx = ensureLedgerFixtures({ caseId: 'OFL-07', trees: 4 })
      rec.readings.fixtures = fixtureReadings(fx)
      if (!fixtureGate(rec, fx, push)) { caseFail(out); return }
      const mod = await loadSubject(push)
      if (mod !== null) {
        // 契约 §2.4（batch15 补行）：这一族现在有两个写方失败码，`SHAPE` 是**导出面**的一部分。
        if (mod.OFFICE_LEDGER_SHAPE !== CODES.shape) {
          push('OFL7-SURFACE', `\`inject.js\` 的 \`OFFICE_LEDGER_SHAPE\` 应为 ${JSON.stringify(CODES.shape)}（契约 §2.4），实得 ${JSON.stringify(mod.OFFICE_LEDGER_SHAPE)}`)
        }
        const product = await readerFaces({ mod, fx, label: '产品读者' })
        out.push(...product.problems)
        rec.readings.product = product.readings
        rec.readings.product_codes = codesOfProblems(product.problems)
      }

      // ── ② 阳性对照 + 三把刀（只切对照；判据本体就是上面那一段）────────────
      const base = path.join(caseDir('OFL-07'), 'ofl07')
      const controlFx = ensureLedgerFixtures({ caseId: 'OFL-07-control', trees: 4 })
      if (!controlFx.ok || ledgerSampleProblems(controlFx).length > 0) {
        push('OFL7-SAMPLE-MISSING', `阳性对照的夹具建不出来：${JSON.stringify(controlFx.problems ?? [])}`)
        caseFail(out)
        return
      }
      const control = await importSourceCopy({ dir: path.join(base, 'control'), source: READER_CONTROL_SOURCE })
      if (!control.ok) {
        push('OFL7-CONTROL-UNAVAILABLE', `阳性对照 import 不了：${control.code} ${control.why}`)
        caseFail(out)
        return
      }
      const controlResult = await readerFaces({ mod: control.mod, fx: controlFx, label: '阳性对照' })
      const controlCodes = codesOfProblems(controlResult.problems)
      rec.readings.control = { codes: controlCodes, readings: controlResult.readings }
      if (controlCodes.length > 0) {
        push('OFL7-CONTROL-NOT-GREEN', `阳性对照自己没有全绿（${JSON.stringify(controlCodes)}）—— 判据不可满足，先修尺子：`
          + JSON.stringify(controlResult.problems.map((p) => p.message.slice(0, 120))))
      }
      const knifeRows = {}
      for (const knife of READER_KNIVES) {
        const row = { label: knife.label, delta: knife.delta, want: [...knife.want].sort(), codes: null }
        knifeRows[knife.id] = row
        const cut = applyKnife(READER_CONTROL_SOURCE, knife)
        if (!cut.ok) {
          row.control = { ok: false, code: cut.code, why: cut.why }
          push('OFL7-KNIFE-ANCHOR', `${knife.id} 在对照上没有落点：${cut.code} ${cut.why} —— 尺子坏了，不许当成"刀咬了"`)
          continue
        }
        const knifeFx = ensureLedgerFixtures({ caseId: `OFL-07-${knife.id}`, trees: 4 })
        if (!knifeFx.ok || ledgerSampleProblems(knifeFx).length > 0) {
          push('OFL7-SAMPLE-MISSING', `刀 ${knife.id} 的夹具建不出来：${JSON.stringify(knifeFx.problems ?? [])}`)
          continue
        }
        const mutant = await importSourceCopy({ dir: path.join(base, `knife-${knife.id}`), source: cut.source })
        if (!mutant.ok) {
          push('OFL7-KNIFE-IMPORT', `${knife.id}：切过的对照 import 不了（那不是"咬到了"，是换个崩法）：${mutant.why}`)
          continue
        }
        const mutantResult = await readerFaces({ mod: mutant.mod, fx: knifeFx, label: `刀 ${knife.id}` })
        const codes = codesOfProblems(mutantResult.problems)
        row.codes = codes
        row.readings = mutantResult.readings
        if (JSON.stringify(codes) !== JSON.stringify(row.want)) {
          const onlyActual = codes.filter((c) => !row.want.includes(c))
          const onlyWant = row.want.filter((c) => !codes.includes(c))
          push('OFL7-KNIFE-VECTOR', `${knife.id}：翻面集与期望不同（多翻 ${JSON.stringify(onlyActual)} · 少翻 ${JSON.stringify(onlyWant)}）`
            + ` —— 多翻 = 刀切宽了，少翻 = 那一面没人守；实测 ${JSON.stringify(codes)}，期望 ${JSON.stringify(row.want)}`)
        }
      }
      rec.readings.knives = knifeRows
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

// ─────────────────────────────────────────────────────────────────────────────
// `OFL-08` —— 账本四码的**登记面**（判词与红码在 `CONTRACT-f11-judge-kind.md` §5）
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 这一格判的不是"账本行为"（那是 `OFL-01…07`），而是**码位表的登记面**：
 *
 *   · 契约 §2.4 的**四个账本码**（`SHAPE` / `UNWRITABLE` / `UNREADABLE` / `PARTIAL_TAIL`）
 *     必须出现在产品 `lib/error-codes.mjs` 的 `CODES` 里，且 `exit === 5`；
 *   · 同四个码必须出现在测试侧 `FROZEN.exitCodes` 里，且值逐项相同（5）；
 *   · 两张表里**多出**本族的码（`E_OFFICE_LEDGER_*`）而不在码位表里 ⇒ 登记面走样。
 *
 * 判词与三个方向的红码只写在契约 §5（**唯一出处**）；这张表的来源是
 * `support/office-ledger-fixtures.mjs::LEDGER_CODE_TABLE`（这里不再抄一份）。
 * 为什么必须是独立一格：`STAT-02` 的退出码对账对两个方向都只记读数（`mine_only` / `impl_only`），
 * 不会让任何一格变红 ⇒ 缺码、值不等必须由这一格的红码说。
 */
describe('unit · office ledger code book (OFL-08)', () => {
  test('OFL-08 账本四码必须同时登记进 `CODES` 与测试侧 `exitCodes`（exit 5），且两张表里不许有表外的本族码', async () => {
    await runCase('OFL-08', async (rec) => {
      const problems = []
      const push = (code, message) => problems.push(problem(code, message))
      let codes = null
      try {
        const mod = await importStaged(path.join('lib', 'error-codes.mjs'))
        codes = mod?.CODES ?? null
      } catch (err) {
        push(err?.code ?? 'OFL8-SURFACE-MISSING', `staged \`lib/error-codes.mjs\` 载不进来（码位表无从对账）：${String(err?.message ?? err).slice(0, 240)}`)
      }
      if (codes === null) {
        rec.readings.codes_lib = { loaded: false }
        caseFail(problems)
        return
      }
      const book = ledgerCodeBookProblems({ codes, exitCodes: FROZEN.exitCodes })
      rec.readings.codes_lib = { loaded: true, count: Object.keys(codes).length }
      rec.readings.book = book.readings
      for (const [code, message] of book.problems) push(code, message)
      // 自证：这张表**真的**有四个码、且每个码的退出码都带着（不是靠空表绿）。
      rec.readings.table_size = book.readings.table.length
      if (book.readings.table.length !== 4) push('OFL8-TABLE-SHAPE', `码位表应有 4 行（契约 §2.4 四码），实得 ${book.readings.table.length}`)
      if (Object.keys(FROZEN.exitCodes).length === 0) push('OFL8-TABLE-SHAPE', '测试侧 `FROZEN.exitCodes` 是空的 —— 对账会变成空转（"查不到期望 ⇒ 静默空过"）')
      caseFail(problems)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// `OFL-09` —— 值表 V1–V6：写方必须按契约 §1.2.1 拒，且被拒的行**一行都不写**
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 这一格判 `CONTRACT-batch15.md` §1.2.1 的六类值（每类至少一行；表本身就是判词，**唯一出处**）：
 *
 *   · V1 三条路径必须是绝对路径（相对路径 ⇒ 拒）；
 *   · V2 `role` 必须在受限岗位名单里（名单外 ⇒ 拒）；
 *   · V3 `role` / `tool` / `landing` / `office_root` / `header_office` 不许是空串（五键逐条）；
 *   · V4 三条路径每条 ≤ 4096 字符（超长 ⇒ 拒，三条同一上限）；
 *   · V5 七键的类型（含 `at` 可解析、`tool` 只能是 write/edit）；
 *   · V6 `tree_differs` 必须与两个 office 的等值关系一致（两个方向）。
 *
 * 每一行都必须：`ok:false` + `code === E_OFFICE_LEDGER_SHAPE`（不是 `UNWRITABLE`，更不是静默收下）+
 * `reason` 点名那一格（键名）+ **账本字节不变**（被拒的行不留痕）。
 * 阳性对照：一行合法的行必须**收下**（+1 行）；否则"全拒"也能让六类看起来绿。
 * 两个读者同号：同一行产品 `OFFICE_LEDGER_ROW_VERDICT` 判 `null` **且** 判据侧 `lineProblems` 判干净。
 * 刀 `V-all`：把写方那一处 `shape = OFFICE_LEDGER_ROW_VERDICT(line)` 改成 `shape = null`
 * ⇒ 六类全部被收下 ⇒ 本格必须红出**恰好** `OFL9-V1…V6`（精确集合；多翻/少翻都红）。
 */
describe('unit · office ledger value table (OFL-09)', () => {
  test('OFL-09 值表 V1–V6：六类坏值各拒一次（E_OFFICE_LEDGER_SHAPE + reason 点名 + 零写入），合法行必须收；把写方那道值检查拿掉 ⇒ 六类全红', async () => {
    await runCase('OFL-09', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      let mod = null
      try {
        mod = await importStaged('inject.js')
      } catch (err) {
        push(err?.code ?? 'OFL9-SURFACE-MISSING', `staged \`inject.js\` 载不进来：${String(err?.message ?? err).slice(0, 240)}`)
      }
      if (mod !== null && typeof mod.recordOfficeLanding !== 'function') {
        push('OFL9-SURFACE-MISSING', '`inject.js` 没有导出 `recordOfficeLanding`（契约 §2.1）—— 值表没有执行点')
      }
      if (mod !== null && typeof mod.OFFICE_LEDGER_ROW_VERDICT !== 'function') {
        push('OFL9-SURFACE-MISSING', '`inject.js` 没有导出 `OFFICE_LEDGER_ROW_VERDICT` —— 值表的判词没有纯函数入口')
      }
      if (out.length > 0) { caseFail(out); return }

      const fx = ensureLedgerFixtures({ caseId: 'OFL-09', trees: 1 })
      rec.readings.fixtures = fixtureReadings(fx)
      if (!fixtureGate(rec, fx, push)) { caseFail(out); return }
      const office = fx.trees[0].office
      const other = fx.other.office
      const base = ledgerLine({ landing: path.join(office, 'review', 'ok.md'), officeRoot: office, headerOffice: office, treeDiffers: false })
      const row = (over = {}) => ({ ...base, ...over })
      /** 三条路径同一上限；4103 字符 > 4096，且仍是一条"看起来合法"的绝对路径。 */
      const longPath = `E:/${'a'.repeat(4100)}`

      // ── 阳性对照：合法行必须收下；两个读者必须同号 ──────────────────────────
      {
        const res = mod.recordOfficeLanding(office, base)
        const text = readLedgerText(office) ?? ''
        const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
        rec.readings.control = { ok: res?.ok, code: res?.code ?? null, lines: lines.length, reason: res?.reason ?? null }
        if (res?.ok !== true || res?.code !== null) push('OFL9-CONTROL', `合法行必须被收下（ok:true / code:null），实得 ${JSON.stringify(res)} —— 全拒不是通过`)
        if (lines.length !== 1) push('OFL9-CONTROL', `合法行收下后账本应恰好 1 行，实得 ${lines.length}`)
        const verdict = mod.OFFICE_LEDGER_ROW_VERDICT(base)
        if (verdict !== null) push('OFL9-CONTROL', `产品纯函数对合法行必须判 null，实得 ${JSON.stringify(verdict)}`)
        const lp = lineProblems(base, { tool: 'write', landing: base.landing, officeRoot: office, headerOffice: office, treeDiffers: false, role: 'review' })
        if (lp.length > 0) push('OFL9-CONTROL', `判据侧 lineProblems 对同一行必须干净（两个读者同号），实得 ${JSON.stringify(lp)}`)
      }

      // ── 六类值：每类至少一行 ─────────────────────────────────────────────────
      const ROWS = [
        // V1 · 绝对路径（三条路径各一行）
        { v: 'V1', label: 'landing 相对路径', key: 'landing', row: row({ landing: '.team/review/x.md' }) },
        { v: 'V1', label: 'office_root 相对路径', key: 'office_root', row: row({ office_root: '.team' }) },
        { v: 'V1', label: 'header_office 相对路径', key: 'header_office', row: row({ header_office: '.team' }) },
        // V2 · 岗位成员
        { v: 'V2', label: 'role 不在名单（admin）', key: 'role', row: row({ role: 'admin' }) },
        // V3 · 空串（五键各一行）
        { v: 'V3', label: 'role 空串', key: 'role', row: row({ role: '' }) },
        { v: 'V3', label: 'tool 空串', key: 'tool', row: row({ tool: '' }) },
        { v: 'V3', label: 'landing 空串', key: 'landing', row: row({ landing: '' }) },
        { v: 'V3', label: 'office_root 空串', key: 'office_root', row: row({ office_root: '' }) },
        { v: 'V3', label: 'header_office 空串', key: 'header_office', row: row({ header_office: '' }) },
        // V4 · 长度上界（三条路径同一上限）
        { v: 'V4', label: 'landing 超长', key: 'landing', row: row({ landing: longPath }) },
        { v: 'V4', label: 'office_root 超长', key: 'office_root', row: row({ office_root: longPath }) },
        { v: 'V4', label: 'header_office 超长', key: 'header_office', row: row({ header_office: longPath }) },
        // V5 · 类型（七键逐条 + at 可解析）
        { v: 'V5', label: 'at:null', key: 'at', row: row({ at: null }) },
        { v: 'V5', label: 'at 不可解析', key: 'at', row: row({ at: '不是时刻' }) },
        { v: 'V5', label: 'role:42', key: 'role', row: row({ role: 42 }) },
        { v: 'V5', label: 'tool:read', key: 'tool', row: row({ tool: 'read' }) },
        { v: 'V5', label: 'landing:0', key: 'landing', row: row({ landing: 0 }) },
        { v: 'V5', label: 'office_root:{}', key: 'office_root', row: row({ office_root: {} }) },
        { v: 'V5', label: 'header_office:[]', key: 'header_office', row: row({ header_office: [] }) },
        { v: 'V5', label: "tree_differs:'false'", key: 'tree_differs', row: row({ tree_differs: 'false' }) },
        // V6 · 跨字段（两个方向各一行）
        { v: 'V6', label: 'tree_differs:true 但两个 office 相等', key: 'tree_differs', row: row({ tree_differs: true }) },
        { v: 'V6', label: 'tree_differs:false 但两个 office 不等', key: 'tree_differs', row: row({ office_root: other, landing: path.join(other, 'review', 'x.md'), tree_differs: false }) },
      ]
      const classes = [...new Set(ROWS.map((spec) => spec.v))].sort()
      if (JSON.stringify(classes) !== JSON.stringify(['V1', 'V2', 'V3', 'V4', 'V5', 'V6'])) {
        push('OFL9-TABLE-SHAPE', `这一格必须覆盖 V1–V6 六类（每类至少一行），实得 ${JSON.stringify(classes)}`)
      }
      const readings = (rec.readings.rows = [])
      for (const spec of ROWS) {
        const before = readLedgerText(office) ?? ''
        const res = mod.recordOfficeLanding(office, spec.row)
        const after = readLedgerText(office) ?? ''
        const reason = String(res?.reason ?? '')
        readings.push({ v: spec.v, label: spec.label, ok: res?.ok ?? null, code: res?.code ?? null, reason: reason.slice(0, 200), bytes_same: before === after })
        const code = `OFL9-${spec.v}`
        if (res?.ok !== false) push(code, `${spec.v}（${spec.label}）必须被拒（ok:false），实得 ${JSON.stringify({ ok: res?.ok, code: res?.code ?? null, reason })}`)
        if (res?.code !== CODES.shape) push(code, `${spec.v}（${spec.label}）的码必须是 ${CODES.shape}（不是 UNWRITABLE、也不是静默收下），实得 ${JSON.stringify(res?.code ?? null)}`)
        if (reason === '') push(code, `${spec.v}（${spec.label}）被拒但 reason 是空的 —— 点名不了那一格`)
        else if (!reason.includes(spec.key)) push(code, `${spec.v}（${spec.label}）的 reason 没点名 \`${spec.key}\`：${JSON.stringify(reason.slice(0, 160))}`)
        if (before !== after) push(code, `${spec.v}（${spec.label}）被拒了，账本却变了 —— 被拒的行不许留痕`)
      }

      // ── 刀 `V-all`：拿掉写方那道值检查 ⇒ 六类全部被收下 ⇒ 精确翻出六个码 ────
      {
        const cut = knifeReplace({ source: readStagedText('inject.js'), find: 'const shape = OFFICE_LEDGER_ROW_VERDICT(line)', replace: 'const shape = null' })
        const knife = (rec.readings.knife = { id: 'V-all', anchor_ok: cut.ok, code: cut.code ?? null, why: cut.why ?? null, codes: [], want: ['OFL9-V1', 'OFL9-V2', 'OFL9-V3', 'OFL9-V4', 'OFL9-V5', 'OFL9-V6'] })
        if (!cut.ok) {
          push('OFL9-KNIFE-ANCHOR', `刀 V-all 在 staged \`inject.js\` 上没有落点：${cut.code} ${cut.why} —— 尺子坏了，不许当成"刀咬了"`)
        } else {
          const mutant = await importSourceCopy({ dir: path.join(caseDir('OFL-09'), 'knife-v-all'), source: cut.source })
          if (!mutant.ok) {
            knife.import = { ok: false, code: mutant.code, why: mutant.why }
            push('OFL9-KNIFE-IMPORT', `刀 V-all 的副本载不进来：${mutant.code} ${mutant.why}`)
          } else {
            const flipped = new Set()
            for (const spec of ROWS) {
              const res = mutant.mod.recordOfficeLanding(office, spec.row)
              if (res?.ok !== false || res?.code !== CODES.shape) flipped.add(`OFL9-${spec.v}`)
            }
            knife.codes = [...flipped].sort()
            if (JSON.stringify(knife.codes) !== JSON.stringify([...knife.want].sort())) {
              push('OFL9-KNIFE-VECTOR', `刀 V-all 的翻面集与期望不同：实测 ${JSON.stringify(knife.codes)}，期望 ${JSON.stringify(knife.want)} —— 多翻 = 刀切宽了，少翻 = 那一类没人守`)
            }
          }
        }
      }

      rec.readings.summary = {
        classes,
        rows: ROWS.length,
        control_ok: (rec.readings.control?.ok === true),
        knife_codes: rec.readings.knife?.codes ?? null,
      }
      caseFail(out)
    })
  })
})
