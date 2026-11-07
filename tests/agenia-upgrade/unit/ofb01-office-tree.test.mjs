/**
 * `OFB-01`…`OFB-08` —— **office 的基准是"落点自己所在的那棵树的 `.team`"**（`ticket-20261102-02`）。
 *
 * 契约：`.team/test/2026-11-07/CONTRACT-batch14.md`（§一 接口 / §二 用例与刀 / §三 夹具拓扑 / §四 边界）。
 * 定形：`.team/leader/2026-11-07/定形-ticket-20261102-02.md`（§二 是组长拍的，不在这里重新讨论）。
 * 被测：staged `inject.js` 的 `officeBoundVerdict` 与 `narrowVerdict`。
 *      ⚠️ 2026-11-07 `9e744ec` 起产物里**没有 `landsInOffice`**（连同旧 docstring 一起删了；它原先也没导出）——
 *      落点规则只有一份：`officeLandingVerdict(target, agent, strict)`；`office_root` / `OFFICE_TREE_DIFFERS`
 *      走 `officeBoundVerdict` 的**可选第 6 个参数** `readings`（见契约 §一、§六、§七）。
 *
 * ## 每一格判什么（判词，不是计数）
 *   `OFB-01` ① 同树：相对 `.team/review/note.md` 与绝对 `<A>/.team/review/note.md` **都放行**；
 *            `office_root` 与**独立复算**的 `A/.team` 同值、两次相同；`header_office` 同值；
 *            `differs:false`、`warning:null`（"相对/绝对走同一个门"）。
 *   `OFB-02` ② 异树：cwd=A、落点 `B/.team/...`（`write` 与 `edit` 两条写入通道）⇒ **放行**，
 *            且 `readings` 记 `OFFICE_TREE_DIFFERS` + 两个 office 路径（**绝不允许悄悄发生**）。
 *   `OFB-03` ③ 越界：落点 `B/src/x.js`（B 树非 `.team` 处）⇒ **拒绝** + `E_GUARD_OFFICE_WRITE` +
 *            冻结前缀 + 报文**同时**含落点与 `B/.team`；`readings.expected_office` = `B/.team`。
 *   `OFB-04` ④ 三条老口径各一格：C 盘 / 空目标 / cwd 不可用（三种形状）⇒ 各拒绝。
 *            三格都做成**非空样本**：C 盘负例本身带 `.team` 分量、空目标那格的 cwd 在 `.team` 里、
 *            cwd 不可用那格的目标指向 `B/.team` —— 闸没了就必须放行/抛，不许"本来就会拒"。
 *   `OFB-05` ⑤ 老越界样例 `.team/review/../../x.txt` **仍拒绝**；报文点名落点；
 *            且落点所在链上**没有** `.team`（串匹配会放过它，landing 判不会）。
 *   `OFB-06` 纪律 1 **刀架**：阳性对照（照契约写的最小实现）五格全绿 + 六把刀，每把只翻它该翻的那几面。
 *            实现前：刀只跑在对照上（真源码没有 `officeLandingVerdict` ⇒ `OFFB-KNIFE-ANCHOR` **红**）；
 *            实现后：同一段自动改跑真 staged 源码。
 *   `OFB-07` §二.6 **门禁层必须出声**：真 `apply()` 的 `tools.guard` 放行异树写，
 *            并且 `console.error` 那一行带 `OFFICE_TREE_DIFFERS` 与两个 office 路径。
 *   `OFB-08` **窄会话的写边界仍是最严的那道**（契约 §六 / gate-4 返修 MF-2）：窄会话写**另一棵树**的
 *            `.team/` ⇒ **拒**；写自己树的 `.team/` ⇒ 放行；写两棵树的项目处 ⇒ 拒；**同一笔**跨树写从
 *            非窄的 `review` 走 ⇒ 放行 + `OFFICE_TREE_DIFFERS`（证明门只在窄那一侧变窄）。
 *            刀 `K7`：把 `strict` 当 falsy（`if (strict === true)` → `if (false)`）⇒ 跨树那一腿必须翻。
 *            另带 **N1** 的 oracle 两向校准（目标就是 `.team` / 树根 ⇒ `expected_office:null`；
 *            `B/src/x.js` ⇒ `B/.team`）。
 *
 * ## 口径边界（这些格**不**判什么；同契约 §四）
 *   · **不判**窄会话的另外两格（工具白名单 / 提案拒）与"门禁真的会调 `narrowVerdict`"那一层
 *     （`PRS-02` 的 row 5 工具拒覆盖同一条路由；`OFB-08` 只判 `write_scope` 这一格）；
 *   · **不判** strict 分支的**读数**（`office_root` / `warning` 等六个字段是 §1.1 非严格规则的；
 *     窄会话只判 allow/reject 与拒绝码）；
 *   · **不判**真实挂载（R1：框架有没有真的调这个 guard）；
 *   · **不判** `DEFAULT_OFFICE_BOUND` 与 yml `officeBound` 的逐项一致（`REV-02` / `STAT-02` 已有）；
 *   · **不判**「相对路径按**活体当前目录**（`working_directory` 改过之后）解析」——本层只拿得到会话头 cwd，
 *     看不见活体 cwd；"滑进原树"在这里只体现为 `office_root` 点名（契约 §〇.2）；
 *   · **不判** junction / symlink 攻击、UNC、大小写、8.3 名；
 *   · **不判**报文完整措辞（只判契约 §1.4 点名的两个路径 + 冻结前缀/码）。
 *
 * ## 夹具（为什么不在运行根里）
 *   运行根按守卫只能落在 `<repo>/.team/test/<日期>/_runs/<RUN_ID>` ⇒ "向上找最近的 `.team`"会先撞上
 *   **真实的 `<repo>/.team`** ⇒ ③⑤ 的拒绝在运行根里造不出来。⇒ 两棵临时树放在
 *   `<repo 的父目录>/.agenia-office-fixtures/<RUN_ID>/A|B`（同盘、仓库之外、祖先链上没有 `.team`）。
 *   拓扑本身是判据：每格先过 `sampleProblems()`（`support/office-fixtures.mjs`）。**不删**任何东西。
 */
import { before, describe, test } from 'node:test'
import path from 'node:path'
import { caseDir, caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { FROZEN, PATHS } from '../support/env.mjs'
import { importStaged, readStagedText } from '../support/sut.mjs'
import { buildCatalog, buildContentRoot, configFromComposition, importSourceCopy, withHarness } from '../support/injector-harness.mjs'
import {
  CONTROL_SOURCE, KNIVES, NARROW_KNIFE, canonicalOf, decisionBody, digestOf, ensureOfficeFixtures, expectedOfficeOf,
  headerOfficeOf, normKey, officeOfPath, officeRunId, oracleProblems, sampleProblems, strictOff, swapDecisionBody,
} from '../support/office-fixtures.mjs'

const BOUND = new Set(FROZEN.staged.officeBoundRoles)
const WRITE_CODE = FROZEN.officeBoundCodes.write
const PREFIX = FROZEN.officeBoundMessagePrefix
const ROW_IDS = ['①', '②', '③', '④', '⑤']

/** 夹具（`before()` 里建；建不出来 = 整份文件红，不许静默跳过）。 */
let FX = null
before(() => {
  preflight()
  FX = ensureOfficeFixtures()
})

const agentAt = (cwd) => ({ id: 'ofb-agent', session: { header: { cwd } } })

/** 调一次冻结面（5 个参数 + 可选 readings）；**抛**也是一种读数，不许让它变成"没发生"。 */
function callOffice(mod, { role = 'review', tool = 'write', target, agent, sink } = {}) {
  const readings = sink === undefined ? {} : sink
  try {
    const out = mod.officeBoundVerdict(role, tool, { file_path: target }, agent, BOUND, readings)
    return { out, readings, threw: null }
  } catch (err) {
    return { out: undefined, readings, threw: String(err?.message ?? err) }
  }
}

const kindOf = (out) => (out === null || out === undefined ? 'allow' : (typeof out?.code === 'string' ? 'reject' : 'shape'))

/** 每一格都先过的样本/拓扑自检（空样本必须红）。 */
function sample(push) {
  for (const [code, message] of sampleProblems(FX)) push(code, message)
}

/** 读上面那几样（读数里要有"这一跑量的是哪棵树"，不然读的人没法回推）。 */
function fixtureReadings() {
  return {
    root: FX === null ? null : FX.root,
    a: FX === null ? null : FX.a,
    b: FX === null ? null : FX.b,
    tree_hashes: FX === null ? null : { a: digestOf(FX.a), b: digestOf(FX.b) },
    topology: {
      fixture_root_ancestor_office: FX === null ? null : officeOfPath(FX.root),
      run_root: runRoot(),
      run_root_ancestor_office: officeOfPath(runRoot()),
      note: '运行根在 <repo>/.team 里面 ⇒ ③⑤ 的拒绝只能在仓库之外的两棵临时树上量（契约 §三）。',
    },
    scope_note: '不判窄会话的另外两格（白名单 / 提案拒）与门禁路由 / 真挂载 / officeBound 名单一致 / 活体 cwd（working_directory）/ symlink 攻击；只判契约 §一、§六 的落点、读数与窄会话写范围。',
  }
}

async function loadSubject(push) {
  try {
    const mod = await importStaged('inject.js')
    if (typeof mod.officeBoundVerdict !== 'function') {
      push('OFFB-SURFACE-MISSING', 'staged/inject.js 没有导出 officeBoundVerdict（拍板 Q1 冻结的命名导出）')
      return null
    }
    return mod
  } catch (err) {
    push('OFFB-SURFACE-MISSING', `staged/inject.js import 不了：${String(err?.message ?? err).slice(0, 200)}`)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 五格判决（每一行是一个纯函数：喂一个模块，返回 problem 清单）
//   同一批函数在 `OFB-06` 里也用来跑阳性对照与刀 —— "判据只有一份"。
// ─────────────────────────────────────────────────────────────────────────────

/** ① 同树：相对 / 绝对都放行，office_root 相同且独立复算对得上。 */
function row1(mod) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const specs = [
    ['相对', '.team/review/note.md'],
    ['绝对', path.join(FX.a, '.team', 'review', 'note.md')],
  ]
  const offices = []
  for (const [label, target] of specs) {
    const r = callOffice(mod, { target, agent: agentAt(FX.a) })
    if (r.threw !== null) { push('OFFB-ROW1-THREW', `同树·${label}：调用抛了（${r.threw}）`); continue }
    if (kindOf(r.out) !== 'allow') {
      push('OFFB-ROW1-ALLOW', `同树·${label}（${target}）应当放行，实得 ${kindOf(r.out)}/${r.out?.code}`)
      continue
    }
    const wantLanding = canonicalOf(path.resolve(FX.a, target))
    if (normKey(r.readings.landing) !== normKey(wantLanding)) {
      push('OFFB-ROW1-LANDING', `同树·${label}：readings.landing 应为 ${wantLanding}，实得 ${JSON.stringify(r.readings.landing)}`)
    }
    const wantOffice = headerOfficeOf(FX.a)
    if (normKey(r.readings.office_root) !== normKey(wantOffice)) {
      push('OFFB-ROW1-OFFICE', `同树·${label}：office_root 应为 ${wantOffice}（判据侧独立复算），实得 ${JSON.stringify(r.readings.office_root)}`)
    }
    if (normKey(r.readings.header_office) !== normKey(wantOffice)) {
      push('OFFB-ROW1-HEADER', `同树·${label}：header_office 应为 ${wantOffice}，实得 ${JSON.stringify(r.readings.header_office)}`)
    }
    if (r.readings.differs !== false) push('OFFB-ROW1-DIFFERS', `同树·${label}：同一棵树，differs 必须为 false，实得 ${JSON.stringify(r.readings.differs)}`)
    if (r.readings.warning !== null) push('OFFB-ROW1-WARNING', `同树·${label}：同一棵树，warning 必须为 null，实得 ${JSON.stringify(r.readings.warning)}`)
    offices.push(r.readings.office_root)
  }
  if (offices.length === specs.length && normKey(offices[0]) !== normKey(offices[1])) {
    push('OFFB-ROW1-OFFICE-DIFFERS', `同树：相对写法与绝对写法给出的 office_root 不同（${JSON.stringify(offices)}）—— 它们必须走同一个门`)
  }
  return out
}

/** ② 异树：落点在 B 树的 `.team` 里 ⇒ 放行 + `OFFICE_TREE_DIFFERS` + 两个 office。 */
function row2(mod) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const specs = [
    ['write', 'OFFB-ROW2-WRITE', path.join(FX.b, '.team', 'review', 'from-a.md')],
    ['edit', 'OFFB-ROW2-EDIT', path.join(FX.b, '.team', 'review', 'from-a-edit.md')],
  ]
  for (const [tool, code, target] of specs) {
    const r = callOffice(mod, { tool, target, agent: agentAt(FX.a) })
    if (r.threw !== null) { push(code, `${tool} 异树写：调用抛了（${r.threw}）`); continue }
    if (kindOf(r.out) !== 'allow') {
      push(code, `${tool} 落点 ${target} 在 B 树的 .team 里，应当放行，实得 ${kindOf(r.out)}/${r.out?.code}：${String(r.out?.message ?? '').slice(0, 160)}`)
      continue
    }
    const wantOffice = headerOfficeOf(FX.b)
    if (normKey(r.readings.office_root) !== normKey(wantOffice)) {
      push(code, `${tool}：office_root 应为落点所在树的 office ${wantOffice}，实得 ${JSON.stringify(r.readings.office_root)}`)
      continue
    }
    if (normKey(r.readings.header_office) !== normKey(headerOfficeOf(FX.a))) {
      push(code, `${tool}：header_office 应为会话头 cwd 的 office ${headerOfficeOf(FX.a)}，实得 ${JSON.stringify(r.readings.header_office)}`)
    }
    if (r.readings.differs !== true) push(code, `${tool}：跨了两棵树，differs 必须为 true，实得 ${JSON.stringify(r.readings.differs)}`)
    if (r.readings.warning !== 'OFFICE_TREE_DIFFERS') {
      push(code, `${tool}：放行了异树写却没记 OFFICE_TREE_DIFFERS（实得 ${JSON.stringify(r.readings.warning)}）—— "绝不允许悄悄发生"`)
    }
  }
  return out
}

/** ③ 越界：B 树非 `.team` 处 ⇒ 拒绝 + 两个路径（落点 / 期望的 office）。 */
function row3(mod) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const target = path.join(FX.b, 'src', 'x.js')
  const landing = canonicalOf(path.resolve(FX.a, target))
  const expected = expectedOfficeOf(landing)
  if (officeOfPath(landing) !== null) {
    push('OFFB-ROW3-SAMPLE', `第③格的落点链上居然有 .team（${officeOfPath(landing)}）—— 这一格测不到"越界"，样本错了`)
  }
  if (expected === null) push('OFFB-ROW3-SAMPLE', `第③格的 expected_office 独立复算是 null —— B 树没有 .team，样本错了`)
  const r = callOffice(mod, { target, agent: agentAt(FX.a) })
  if (r.threw !== null) { push('OFFB-ROW3-THREW', `越界写：调用抛了（${r.threw}）`); return out }
  if (kindOf(r.out) === 'allow') { push('OFFB-ROW3-ALLOWED', `落点 ${landing} 不在任何 .team 里，应当拒绝，实得放行`); return out }
  if (r.out?.code !== WRITE_CODE) push('OFFB-ROW3-CODE', `拒绝码应为 ${WRITE_CODE}，实得 ${JSON.stringify(r.out?.code)}`)
  const message = String(r.out?.message ?? '')
  if (!message.includes(`${PREFIX}review）`)) push('OFFB-ROW3-PREFIX', `报文里没有冻结前缀「${PREFIX}review）」`)
  if (!normKey(message).includes(normKey(landing))) push('OFFB-ROW3-LANDING', `报文里没有落点 ${landing}（定形 §二.4 要两个路径）`)
  if (normKey(r.readings.expected_office) !== normKey(expected)) {
    push('OFFB-ROW3-EXPECTED', `readings.expected_office 应为 ${expected}，实得 ${JSON.stringify(r.readings.expected_office)}`)
  }
  if (expected !== null && !normKey(message).includes(normKey(expected))) {
    push('OFFB-ROW3-MESSAGE-EXPECTED', `报文里没有期望的 office ${expected}（定形 §二.4：落点 + 期望的 office 路径）`)
  }
  return out
}

/** ④ 三条老口径：C 盘 / 空目标 / cwd 不可用。 */
function row4(mod) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const checkReject = (r, code, label) => {
    if (r.threw !== null) { push('OFFB-ROW4-THREW', `${label}：调用抛了（${r.threw}）—— 拒绝必须是判词，不是异常`); return false }
    if (kindOf(r.out) !== 'reject') { push(code, `${label}：应当拒绝，实得 ${kindOf(r.out)}/${r.out?.code}`); return false }
    if (r.out?.code !== WRITE_CODE) push('OFFB-ROW4-CODE', `${label}：拒绝码应为 ${WRITE_CODE}，实得 ${JSON.stringify(r.out?.code)}`)
    if (!String(r.out?.message ?? '').includes(`${PREFIX}review）`)) push('OFFB-ROW4-PREFIX', `${label}：报文里没有冻结前缀「${PREFIX}review）」`)
    return true
  }
  // ① C 盘 —— 负例（非法姿势）落点本身带 `.team` 分量：C 盘闸没了它就会被放行（非空样本）。
  const cProbe = 'C:\\agenia\\office-probe\\.team\\x.md' // 负例（非法姿势；期望被 C 盘闸拒，绝不在 C 盘建它）
  const cLanding = canonicalOf(cProbe)
  if (officeOfPath(cLanding) === null) push('OFFB-ROW4-SAMPLE-C', `C 盘负例本身没有 .team 分量（${cLanding}）—— 这一格测不到 C 盘闸`)
  checkReject(callOffice(mod, { target: cProbe, agent: agentAt(FX.a) }), 'OFFB-ROW4-C-DRIVE', 'C 盘落点')
  // ② 空目标 —— cwd 在 `.team` 里面：空目标闸没了就会被放行（非空样本）。
  const cwdInsideOffice = path.join(FX.a, '.team', 'review')
  if (officeOfPath(canonicalOf(cwdInsideOffice)) === null) push('OFFB-ROW4-SAMPLE-EMPTY', `空目标那格的 cwd 不在 .team 里（${cwdInsideOffice}）—— 测不到空目标闸`)
  checkReject(callOffice(mod, { target: '', agent: agentAt(cwdInsideOffice) }), 'OFFB-ROW4-EMPTY', '空目标')
  // ③ cwd 不可用（三种形状）—— 目标绝对指向 B 树的 `.team`：cwd 闸没了它就会被放行/抛。
  const targetAbs = path.join(FX.b, '.team', 'review', 'x.md')
  const shapes = [
    ['没有 header.cwd', { session: { header: {} } }],
    ['cwd 是空串', { session: { header: { cwd: '   ' } } }],
    ['cwd 不是字符串', { session: { header: { cwd: 42 } } }],
  ]
  for (const [label, agent] of shapes) checkReject(callOffice(mod, { target: targetAbs, agent }), 'OFFB-ROW4-CWD', label)
  return out
}

/** ⑤ 老的越界样例：`.team/review/../../x.txt` 仍拒绝（且报文点名落点）。 */
function row5(mod) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const target = '.team/review/../../x.txt'
  const landing = canonicalOf(path.resolve(FX.a, target))
  if (officeOfPath(landing) !== null) push('OFFB-ROW5-SAMPLE', `第⑤格的落点链上有 .team（${officeOfPath(landing)}）—— 样本错了`)
  if (!String(target).includes('.team/')) push('OFFB-ROW5-SAMPLE', '第⑤格的 raw target 里没有 `.team/` —— 它测不到"串匹配会放过"')
  const r = callOffice(mod, { target, agent: agentAt(FX.a) })
  if (r.threw !== null) { push('OFFB-ROW5-THREW', `老越界样例：调用抛了（${r.threw}）`); return out }
  if (kindOf(r.out) === 'allow') { push('OFFB-ROW5-ALLOWED', `raw target 含 .team/ 但落点 ${landing} 在组外，应当拒绝，实得放行（串匹配形状）`); return out }
  if (r.out?.code !== WRITE_CODE) push('OFFB-ROW5-CODE', `拒绝码应为 ${WRITE_CODE}，实得 ${JSON.stringify(r.out?.code)}`)
  const message = String(r.out?.message ?? '')
  if (!message.includes(`${PREFIX}review）`)) push('OFFB-ROW5-PREFIX', `报文里没有冻结前缀「${PREFIX}review）」`)
  if (!normKey(message).includes(normKey(landing))) push('OFFB-ROW5-LANDING', `报文里没有落点 ${landing}（定形 §二.4 要两个路径）`)
  return out
}

const ROWS = { '①': row1, '②': row2, '③': row3, '④': row4, '⑤': row5 }

/**
 * ⑧ **窄会话的写边界仍是最严的那道**（契约 §六；gate-4 返修 MF-2）。
 *
 * 判四件事 + 一个对照：
 *   · 窄会话写**另一棵树**的 `.team/` ⇒ **拒**（`OFFB-NARROW-CROSS-TREE`）—— 这条是本格的主判词；
 *   · 窄会话写**自己那棵树**的 `.team/` ⇒ 放行（`OFFB-NARROW-OWN-TREE`）；
 *   · 窄会话写自己树 / 另一棵树的项目处 ⇒ 拒（`OFFB-NARROW-OUTSIDE`）；
 *   · **同一笔**跨树写从非窄的受限岗位（`review`）走 ⇒ **放行 + `OFFICE_TREE_DIFFERS`**（`OFFB-NARROW-CONTRAST`）——
 *     证明"门变窄"只发生在窄会话那一侧，不是把所有人都关在外面。
 *
 * 口径边界：这里判的是**执行者**（`narrowVerdict`，导出纯函数）；"门禁真的会调它"那一层由
 * `PRS-02` 的 row 5 工具拒覆盖（同一条 `narrowVerdict`，只是另一条腿）。strict 的读数**不在契约里**
 * （§1.1 的六个字段是非严格规则的；窄会话只判判决），所以这里只判 allow/reject 与拒绝码。
 */
function narrowRow(mod) {
  const out = []
  const push = (code, message) => out.push(problem(code, message))
  const wantCode = mod.NARROW_CODES !== null && mod.NARROW_CODES !== undefined && typeof mod.NARROW_CODES.write === 'string'
    ? mod.NARROW_CODES.write
    : null
  if (wantCode === null) push('OFFB-NARROW-SURFACE', '模块没有导出 NARROW_CODES.write —— 窄拒绝的码无从对账')
  const agent = agentAt(FX.a)
  const cross = path.join(FX.b, '.team', 'bug', 'ledger.json')
  const own = path.join(FX.a, '.team', 'bug', 'ledger.json')
  const leg = (label, target, want, code) => {
    let verdict
    try {
      verdict = mod.narrowVerdict('write', { file_path: target }, agent)
    } catch (err) {
      push('OFFB-NARROW-THREW', `${label}：调用抛了（${String(err?.message ?? err)}）—— 拒绝必须是判词，不是异常`)
      return
    }
    const kind = kindOf(verdict)
    if (kind !== want) {
      push(code, `${label}（${target}）应当${want === 'allow' ? '放行' : '拒绝'}，实得 ${kind}/${verdict?.code}`)
      return
    }
    if (want === 'reject' && wantCode !== null && verdict?.code !== wantCode) {
      push(code, `${label}：拒绝码应为 ${wantCode}，实得 ${JSON.stringify(verdict?.code)}`)
    }
  }
  leg('窄会话写另一棵树的 .team', cross, 'reject', 'OFFB-NARROW-CROSS-TREE')
  leg('窄会话写自己树的 .team', own, 'allow', 'OFFB-NARROW-OWN-TREE')
  leg('窄会话写自己树的项目根', path.join(FX.a, 'x.md'), 'reject', 'OFFB-NARROW-OUTSIDE')
  leg('窄会话写另一棵树的项目处', path.join(FX.b, 'src', 'x.js'), 'reject', 'OFFB-NARROW-OUTSIDE')
  const contrast = callOffice(mod, { target: cross, agent })
  if (kindOf(contrast.out) !== 'allow' || contrast.readings.warning !== 'OFFICE_TREE_DIFFERS') {
    push('OFFB-NARROW-CONTRAST', `同一笔跨树写从非窄的 review 会话走：必须放行且记 OFFICE_TREE_DIFFERS，`
      + `实得 ${kindOf(contrast.out)}/${contrast.out?.code} warning=${JSON.stringify(contrast.readings.warning)}`)
  }
  return out
}


/** 一次跑完五格：返回 `{ ①: [problems], … }`（刀架用它比翻面集）。 */
function judgeAll(mod) {
  const rows = {}
  for (const id of ROW_IDS) rows[id] = ROWS[id](mod)
  return rows
}

const codesOf = (rows) => [...new Set(ROW_IDS.flatMap((id) => rows[id].map((p) => p.code)))].sort()

// ─────────────────────────────────────────────────────────────────────────────
describe('unit · office tree (OFB) · ticket-20261102-02', () => {
  test('OFB-01 ① 同树：相对与绝对都放行，office_root 独立复算相同、warning 不响', async () => {
    await runCase('OFB-01', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      rec.readings.fixtures = fixtureReadings()
      sample(push)
      const mod = await loadSubject(push)
      if (mod !== null) {
        out.push(...row1(mod))
        rec.readings.row1 = out.map((p) => p.code)
      }
      caseFail(out)
    })
  })

  test('OFB-02 ② 异树：落点在 B 树 .team 里 ⇒ 放行，并记 OFFICE_TREE_DIFFERS（含两个 office）', async () => {
    await runCase('OFB-02', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      rec.readings.fixtures = fixtureReadings()
      sample(push)
      const mod = await loadSubject(push)
      if (mod !== null) {
        out.push(...row2(mod))
        rec.readings.row2 = out.map((p) => p.code)
      }
      caseFail(out)
    })
  })

  test('OFB-03 ③ 越界：B 树非 .team 处 ⇒ 拒绝，报文含落点与期望的 office', async () => {
    await runCase('OFB-03', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      rec.readings.fixtures = fixtureReadings()
      sample(push)
      const mod = await loadSubject(push)
      if (mod !== null) {
        out.push(...row3(mod))
        rec.readings.row3 = out.map((p) => p.code)
      }
      caseFail(out)
    })
  })

  test('OFB-04 ④ 三条老口径各一格：C 盘 / 空目标 / cwd 不可用 ⇒ 拒绝', async () => {
    await runCase('OFB-04', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      rec.readings.fixtures = fixtureReadings()
      sample(push)
      const mod = await loadSubject(push)
      if (mod !== null) {
        out.push(...row4(mod))
        rec.readings.row4 = out.map((p) => p.code)
      }
      caseFail(out)
    })
  })

  test('OFB-05 ⑤ 老越界样例 .team/../../x 仍拒绝（串匹配不许放过它），报文点名落点', async () => {
    await runCase('OFB-05', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      rec.readings.fixtures = fixtureReadings()
      sample(push)
      const mod = await loadSubject(push)
      if (mod !== null) {
        out.push(...row5(mod))
        rec.readings.row5 = out.map((p) => p.code)
      }
      caseFail(out)
    })
  })

  test('OFB-06 刀架：阳性对照五格全绿 + 六把刀，每把只翻它该翻的那几面（真源码在实现前是锚缺失）', async () => {
    await runCase('OFB-06', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      rec.readings.fixtures = fixtureReadings()
      sample(push)
      const base = path.join(caseDir('OFB-06'), 'ofb06')

      // ── 阳性对照：照契约写的最小实现必须五格全绿（否则是这套判据不可满足，不是产品的问题）──
      const control = await importSourceCopy({ dir: path.join(base, 'control'), source: CONTROL_SOURCE })
      if (!control.ok) {
        push('OFFB-CONTROL-UNAVAILABLE', `阳性对照 import 不了：${control.code} ${control.why}`)
      } else {
        const rows = judgeAll(control.mod)
        rec.readings.control = { codes: codesOf(rows), rows: Object.fromEntries(ROW_IDS.map((id) => [id, rows[id].map((p) => p.code)])) }
        if (codesOf(rows).length > 0) push('OFFB-CONTROL-NOT-GREEN', `阳性对照自己没有全绿（${JSON.stringify(codesOf(rows))}）—— 判据不可满足，先修尺子`)
      }

      // ── 刀：每一把只改 `decisionBody` 的一个开关，两个受试者 ─────────────────
      const realSource = (() => { try { return readStagedText('inject.js') } catch (err) { push('OFFB-SURFACE-MISSING', `读不到 staged inject.js：${String(err?.message ?? err).slice(0, 160)}`); return null } })()
      const knifeRows = {}
      for (const knife of KNIVES) {
        const body = decisionBody(knife.opts)
        const row = { delta: knife.delta, want: [...knife.want].sort(), control: null, real: null }
        for (const [subject, source] of [['control', CONTROL_SOURCE], ['real', realSource]]) {
          if (source === null) continue
          const swapped = swapDecisionBody(source, body)
          if (!swapped.ok) {
            // 实现前：真源码没有 `officeLandingVerdict` ⇒ 这一条红（预期的首跑红；实现落地后它必须消失）
            row[subject] = { ok: false, code: swapped.code, why: swapped.why }
            push(subject === 'real' ? 'OFFB-KNIFE-ANCHOR' : 'OFFB-KNIFE-CONTROL-ANCHOR',
              `${knife.id} 在 ${subject === 'real' ? '真 staged 源码' : '阳性对照'}上没有落点：${swapped.code} ${swapped.why}`)
            continue
          }
          const cut = await importSourceCopy({ dir: path.join(base, `knife-${knife.id}-${subject}`), source: swapped.source })
          if (!cut.ok) {
            row[subject] = { ok: false, code: 'KNIFE-IMPORT-FAILED', why: cut.why }
            push('OFFB-KNIFE-IMPORT', `${knife.id}@${subject}：切过的副本 import 不了（那不是"咬到了"，是换个崩法）：${cut.why}`)
            continue
          }
          const rows = judgeAll(cut.mod)
          const codes = codesOf(rows)
          row[subject] = { ok: true, codes, rows: Object.fromEntries(ROW_IDS.map((id) => [id, rows[id].map((p) => p.code)])) }
          if (JSON.stringify(codes) !== JSON.stringify(row.want)) {
            const onlyActual = codes.filter((c) => !row.want.includes(c))
            const onlyWant = row.want.filter((c) => !codes.includes(c))
            push('OFFB-KNIFE-VECTOR', `${knife.id}@${subject}：翻面集与期望不同（多翻 ${JSON.stringify(onlyActual)} · 少翻 ${JSON.stringify(onlyWant)}）`
              + ` —— 多翻 = 刀切宽了，少翻 = 那一面没人守；实测 ${JSON.stringify(codes)}，期望 ${JSON.stringify(row.want)}`)
          }
        }
        knifeRows[knife.id] = row
      }
      rec.readings.knives = knifeRows
      caseFail(out)
    })
  })

  test('OFB-07 门禁层必须出声：真 apply() 放行异树写，console.error 那行有码 + 两个 office', async () => {
    await runCase('OFB-07', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      rec.readings.fixtures = fixtureReadings()
      sample(push)
      const mod = await loadSubject(push)
      if (mod === null) caseFail(out)
      const contentRoot = path.join(runRoot(), 'tmp', 'ofb-harness', officeRunId())
      const built = buildContentRoot({ root: contentRoot, presetDir: PATHS.stagedPreset, runRoot: runRoot() })
      rec.readings.harness = { content_root: contentRoot, md_files: built.md_files.length }
      const yml = readStagedText('agent.cordis.yml')
      const conf = configFromComposition({ ymlText: yml, contentDir: contentRoot })
      if (!conf.ok) push('OFFB-HARNESS-CONFIG', `组合里读不出 persona-injector 的 config：${conf.why}`)
      const baseToolSet = Array.isArray(mod.BASE_TOOL_SET) ? mod.BASE_TOOL_SET : null
      if (baseToolSet === null) push('OFFB-HARNESS-CONFIG', 'staged inject.js 没有导出 BASE_TOOL_SET —— 合成工具目录无从造')
      if (!conf.ok || baseToolSet === null) caseFail(out)

      const header = { cwd: FX.a, agentPreset: 'agenia-member', toolName: 'team_review' }
      const id = `ofb07-${officeRunId()}`
      const target = path.join(FX.b, '.team', 'review', 'gate-log.md')
      let guarded = null
      let logs = []
      try {
        await withHarness(
          mod,
          { contentDir: contentRoot, config: { ...conf.config, defaultRole: 'member' }, header, id, catalog: buildCatalog(baseToolSet) },
          async (h) => {
            await h.assemble()
            guarded = h.guard({ name: 'write', arguments: { file_path: target }, agent: { id, session: { id, header } } })
            // 注入器自己的自检是 fire-and-forget；等一小拍再收 console 输出（量的是日志，不是等盘）。
            await new Promise((resolve) => setTimeout(resolve, 30))
            logs = [...h.logs]
          },
        )
      } catch (err) {
        push('OFFB-HARNESS-THREW', `载具跑挂了（不是"没出声"）：${String(err?.message ?? err).slice(0, 240)}`)
      }
      rec.readings.gate = {
        ok: guarded === null ? null : guarded.ok,
        allowed: guarded === null ? null : guarded.reason === undefined || guarded.reason === null,
        reason: guarded === null ? null : String(guarded.reason ?? '').slice(0, 200),
        logs: logs.filter((line) => line.includes('OFFICE_TREE_DIFFERS') || line.includes(PREFIX)).slice(0, 6),
      }
      if (guarded === null) {
        // 上面已经记过（载具挂了 / 面缺失）；这里不重复报同一个原因
      } else if (!guarded.ok) {
        push('OFFB-GATE-NOT-MOUNTED', `这个注入器没有注册 tools.guard：${String(guarded.why ?? '').slice(0, 160)}`)
      } else {
        if (guarded.reason !== undefined && guarded.reason !== null) {
          push('OFFB-ROW2-GATE-ALLOW', `异树写应当被放行；实得拒绝 ${JSON.stringify(String(guarded.reason).slice(0, 200))}`)
        } else {
          // 只有"放行了"才判"出不出声" —— 被拒的时候这条要求不成立，不许用同一条根因报两次。
          const line = logs.find((entry) => entry.includes('OFFICE_TREE_DIFFERS'))
          if (line === undefined) {
            push('OFFB-SILENT', '放行了异树写，但 console.error 里没有 OFFICE_TREE_DIFFERS 那一行 —— 这就是"悄悄发生"')
          } else {
            if (!normKey(line).includes(normKey(headerOfficeOf(FX.b)))) {
              push('OFFB-WARN-OFFICE-MISSING', `那一行里没有落点树的 office ${headerOfficeOf(FX.b)}：${line.slice(0, 240)}`)
            }
            if (!normKey(line).includes(normKey(headerOfficeOf(FX.a)))) {
              push('OFFB-WARN-OFFICE-MISSING', `那一行里没有会话头 cwd 的 office ${headerOfficeOf(FX.a)}：${line.slice(0, 240)}`)
            }
          }
        }
      }
      caseFail(out)
    })
  })

  test('OFB-08 窄会话的 .team 写边界仍是最严的那道：另一棵树的 .team 必须拒，同一笔写从 review 走放行+warning', async () => {
    await runCase('OFB-08', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      rec.readings.fixtures = fixtureReadings()
      sample(push)
      // N1 的落点：oracle 自己的两向校准（目标就是 .team / 树根 ⇒ null；B/src/x.js ⇒ B/.team）
      for (const [code, message] of oracleProblems(FX)) push(code, message)
      const base = path.join(caseDir('OFB-08'), 'ofb08')

      // ── ① 阳性对照：strict 接上的最小实现 ⇒ 四条窄腿全绿（这一格的要求是可满足的）──
      const control = await importSourceCopy({ dir: path.join(base, 'control'), source: CONTROL_SOURCE })
      if (!control.ok) {
        push('OFFB-NARROW-CONTROL-UNAVAILABLE', `阳性对照 import 不了：${control.code} ${control.why}`)
      } else {
        const controlProblems = narrowRow(control.mod)
        rec.readings.control = { codes: controlProblems.map((p) => p.code) }
        if (controlProblems.length > 0) {
          push('OFFB-NARROW-CONTROL-NOT-GREEN', `阳性对照自己没有全绿（${JSON.stringify(controlProblems.map((p) => p.code))}）—— 判据不可满足，先修尺子`)
        }
        // ── ② 刀 K7（对照上）：strict 当 falsy ⇒ 只翻"跨树写"那一腿 ──
        const cut = strictOff(CONTROL_SOURCE)
        if (!cut.ok) {
          push('OFFB-NARROW-KNIFE-ANCHOR', `${NARROW_KNIFE.id} 在阳性对照上没有落点：${cut.code} ${cut.why}`)
        } else {
          const mutant = await importSourceCopy({ dir: path.join(base, `knife-${NARROW_KNIFE.id}-control`), source: cut.source })
          if (!mutant.ok) {
            push('OFFB-NARROW-KNIFE-IMPORT', `${NARROW_KNIFE.id}@control：切过的副本 import 不了：${mutant.why}`)
          } else {
            const codes = narrowRow(mutant.mod).map((p) => p.code)
            rec.readings.knife_control = codes
            if (JSON.stringify(codes) !== JSON.stringify(NARROW_KNIFE.want)) {
              const onlyActual = codes.filter((c) => !NARROW_KNIFE.want.includes(c))
              const onlyWant = NARROW_KNIFE.want.filter((c) => !codes.includes(c))
              push('OFFB-NARROW-KNIFE-VECTOR', `${NARROW_KNIFE.id}@control：多翻 ${JSON.stringify(onlyActual)} · 少翻 ${JSON.stringify(onlyWant)}（实测 ${JSON.stringify(codes)}）`
                + ' —— 多翻 = 刀切宽了，少翻 = 窄的那一面没人守')
            }
          }
        }
      }

      // ── ③ 真 staged 源码：这一格判的主体 ──────────────────────────────────
      const mod = await loadSubject(push)
      if (mod !== null) {
        const real = narrowRow(mod)
        rec.readings.row8 = real.map((p) => p.code)
        out.push(...real)
        // ── ④ 刀 K7（真源码）—— 只在基线成立（跨树拒、同树允）时才有可比对象 ──
        const baselineOk = !real.some((p) => ['OFFB-NARROW-CROSS-TREE', 'OFFB-NARROW-OWN-TREE', 'OFFB-NARROW-THREW', 'OFFB-NARROW-SURFACE'].includes(p.code))
        if (!baselineOk) {
          rec.readings.knife_real = { skipped: 'baseline-not-strict（跨树写没被拒 ⇒ 刀没有可比对象；不是刀坏了）', codes: null }
        } else {
          const source = (() => { try { return readStagedText('inject.js') } catch (err) { push('OFFB-SURFACE-MISSING', `读不到 staged inject.js：${String(err?.message ?? err).slice(0, 160)}`); return null } })()
          if (source !== null) {
            const cut = strictOff(source)
            if (!cut.ok) {
              push('OFFB-NARROW-KNIFE-ANCHOR', `${NARROW_KNIFE.id} 在真 staged 源码上没有落点：${cut.code} ${cut.why}`)
            } else {
              const mutant = await importSourceCopy({ dir: path.join(base, `knife-${NARROW_KNIFE.id}-real`), source: cut.source })
              if (!mutant.ok) {
                push('OFFB-NARROW-KNIFE-IMPORT', `${NARROW_KNIFE.id}@real：切过的副本 import 不了：${mutant.why}`)
              } else {
                const codes = narrowRow(mutant.mod).map((p) => p.code)
                rec.readings.knife_real = { skipped: null, codes }
                if (JSON.stringify(codes) !== JSON.stringify(NARROW_KNIFE.want)) {
                  const onlyActual = codes.filter((c) => !NARROW_KNIFE.want.includes(c))
                  const onlyWant = NARROW_KNIFE.want.filter((c) => !codes.includes(c))
                  push('OFFB-NARROW-KNIFE-VECTOR', `${NARROW_KNIFE.id}@real：多翻 ${JSON.stringify(onlyActual)} · 少翻 ${JSON.stringify(onlyWant)}（实测 ${JSON.stringify(codes)}）`)
                }
              }
            }
          }
        }
      }
      caseFail(out)
    })
  })
})
