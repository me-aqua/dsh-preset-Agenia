/**
 * F-57 判据自检表（「格」）—— 入口每次启动先过这张表。
 *
 * 🔴 为什么在入口里、而不是加成一个正式用例 ID：
 *    测试岗的阳性对照（`_ref/`）把登记表钉在"HEAD 的 55 行 + 那 11 条 PFL"上；
 *    往盘上**加新 ID** 会让那一跑里盘上 70 条、登记 66 条 ⇒ 他们的 `--ref` 从 10 绿掉成 9 绿。
 *    所以这几格落成**入口的启动自检**：哪一条判据被改回去，入口当场 `F57-FAIL 自检` 并 exit 3
 *    —— 连"跑一次"都不许发生。它比"某条用例红"更硬，而且不动分母。
 *
 * 表里每一行都是**手写期望**（不从实现反推），输入是冻结的合成读数。四张表共 **30 格**：
 *   · `VERDICT_TABLE`（10）：这一跑的读数是真是假、该给哪个退出码、算不算"干净通过"；
 *   · `JUDGEMENT_TABLE`（3）：入口会打出**哪些字** —— 收窄那一跑里**一个 OK 都不许有**；
 *   · `SHAPE_TABLE`（7）：发现器认得出哪种 `test(...)` 形状；认不出的必须**报**（不许当成 0）；
 *   · `TARGET_TABLE`（10）：靶子过期判据（F-105）—— 差距没声明要红、声明过期也要红、
 *     声明逐字对上才绿。**每一格都单独承重**：绿的那两格防"永远红"，红的那八格防"永远绿"。
 *
 * 🔴 **两对格必然同红**（读到时别当重复删掉）。一句一箭头：
 *   · `V-01` ←同一条事实→ `J-01`（全量全绿）；`V-05` ←同一条事实→ `J-02`（收窄全绿）。
 *   · `ok` 翻面 ⇒ 判据格红 **且** 判词格红（`judgementLines()` 的 OK 行就是 `verdict.ok` 的渲染，`verdict.mjs:114`）。
 *   · 判词格红 ⇏ 判据格红 —— `F57-OK` / `F57-SCOPE` / `F57-FAIL` 那几行只有判词格在钉
 *     （`K-J01` ⇒ 只红 `J-01`；`K-J02` ⇒ 只红 `J-02`；`K-J03` ⇒ 只红 `J-03`）。
 *   · `V-05` 另有 `exitCode === 0` 这一条判据格独有（`K-V05b` ⇒ 只红 `V-05`，人造对照）。
 *   · `V-01` **没有**独有通道：`K-V01b` 人造最小刀也只得到 `[J-01, V-01]` —— 全表唯一不能单独红的格，设计如此。
 *   读数：`_mutant/_readings/f115-mutants.md`。
 */
import { createHash } from 'node:crypto'
import { entryVerdict, judgementLines } from './verdict.mjs'
import { parseTestCalls, caseIdOf } from './discover.mjs'
import { targetVerdict } from './target.mjs'

/**
 * 「这一跑算不算数」的**十个**格（输入 → 期望退出码 / 是否算干净通过 / 红因有几条）。
 *
 * ⚠️ 每一格都要能**单独承重**：`failHas` 只证明"那条红在里面"，`failCount` 才证明"红因**只有**它"。
 *    没有 `failCount` 的格，遇到"别的判据先红、把这一格遮住"就测不出半修形态（M-2 就是这么漏的）。
 */
export const VERDICT_TABLE = [
  {
    /**
     * ⚠️ **这一格只能与 `J-01` 同红**（2026-10-20 实测）：两者看同一条事实 ——"全绿这一跑算不算数"，
     * `V-01` 看判据层、`J-01` 看判词层。连"只在全零输入上加一条红"的人造刀也分不开
     * （读数 `K-V01b` ⇒ 红 `[J-01, V-01]`）—— **全表唯一连造都造不出单独红的格**。一起红是对的，别拆。
     */
    id: 'V-01', name: '全量全绿 ⇒ 0 且算干净通过',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 66, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 66, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 0, ok: true, failCount: 0 },
  },
  {
    id: 'V-02', name: '有 HOLD ⇒ 不是绿（exit 2）',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 64, hold: 2, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 66, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 2, ok: false, failHas: 'HOLD', failCount: 1 },
  },
  {
    id: 'V-03', name: '半跑（没声明范围，跑到 11/共 66）⇒ exit 1',
    input: { denominator: 66, scopeCases: null, scopeDeclared: false, settled: 11, red: 0, green: 11, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 11, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '11', failCount: 1 },
  },
  {
    /**
     * 🔴 **`nodeTests` 数不出来，而这一跑其余一切正常** —— 红因**只能**是"数不出来"。
     * 为什么要这一格：别的格里 `nodeTests: null` 都伴随 `settled === 0`，那条红先炸，
     * "把 null 当没事"这句半修就被遮住了（测试岗实测：改回去之后同一输入仍 `exit 0 / ok=true`）。
     */
    id: 'V-04', name: '数不出来（跑到 66 条但 node --test 没报 tests）⇒ exit 1，且红因只有这一条',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 66, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: null, nodeFail: null, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '数不出来', failCount: 1 },
  },
  {
    /**
     * ⚠️ **这一格与 `J-02` 必然同红**（读数 `K-V05`：删 `&& fullScope` ⇒ 红 `[J-02, V-05]`，与 10-17 的
     * `D-m10` 那次"点名 2 行"逐条对得上）：`judgementLines()` 的 OK 行**就是** `verdict.ok` 的渲染，
     * 让 `ok` 翻面两层必然一起红 —— 同一条事实的两个层面，不是重复。
     * 要单独红它只能造"退出码非零但不加红因"的分裂形态（读数 `K-V05b`，**人造对照**，不算半修形态）。
     */
    id: 'V-05', name: '声明范围跑满且全绿 ⇒ exit 0，但**不是**全量证据（不许打 OK）',
    input: { denominator: 66, scopeCases: 11, scopeDeclared: true, settled: 11, red: 0, green: 11, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 11, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 0, ok: false, failCount: 0 },
  },
  {
    id: 'V-06', name: '声明范围没跑满（声明 11 / 跑到 10）⇒ exit 1',
    input: { denominator: 66, scopeCases: 11, scopeDeclared: true, settled: 10, red: 0, green: 10, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 10, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '10', failCount: 1 },
  },
  {
    id: 'V-07', name: '有红 ⇒ exit 1',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 2, green: 64, hold: 0, consistent: true, diffCount: 0, nodeExit: 1, nodeTests: 66, nodeFail: 2, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: 'RED', failCount: 1 },
  },
  {
    /**
     * 空跑那一跑的 **3 条红因，一句一条**（`failCount: 3` 指的就是这三条，不是"三条随便什么"）：
     *   ① `settled === 0` ⇒ 「一条用例都没跑到 —— 0 用例不算结算」
     *   ② `nodeTests === null` ⇒ 「数不出来：…」
     *   ③ `nodeExit !== 0 && red === 0` ⇒ 「node --test exit 1 而结算 RED 0」
     * 刀：`K-V08`（删①那一支 ⇒ 靠 `failHas` 红）· `K-V08b`（删③那一支 ⇒ 靠 `failCount` 3→2 红）。
     */
    id: 'V-08', name: '空跑（0 条）⇒ exit 1 且明写"0 用例不算结算"，红因恰好 3 条',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 0, red: 0, green: 0, hold: 0, consistent: true, diffCount: 0, nodeExit: 1, nodeTests: null, nodeFail: null, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '0 用例', failCount: 3 },
  },
  {
    id: 'V-09', name: 'node 报 67 条、结算 66 条（发现器漏认一条）⇒ exit 1',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 66, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 67, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '67', failCount: 1 },
  },
  {
    id: 'V-10', name: '登记 ≠ 盘上 ⇒ exit 1',
    input: { denominator: 67, scopeCases: 67, scopeDeclared: false, settled: 67, red: 0, green: 67, hold: 0, consistent: false, diffCount: 1, nodeExit: 0, nodeTests: 67, nodeFail: 0, settleExit: 2 },
    want: { exitCode: 1, ok: false, failHas: '登记', failCount: 2 },
  },
]

/** 发现器认形状的格（认得 / 认不出就报，**不许当成 0**）。 */
export const SHAPE_TABLE = [
  /**
   * `S-01` 的标题用**双引号**：这一格要有一条**别的格没占的轴**。
   * 原来它用单引号，三个断言每一个都能在别处找到同款（`cases`/`unparsed` 同 `S-06`、`anonymous:0` 同 `S-02`）
   * ⇒ 任何一把刀落下去都至少红两格（实测：`K-S01` ⇒ `[S-01,S-06]`、`K-S01b` ⇒ `[S-01,S-02]`），整格影子化。
   * 换引号种类以后，`QUOTE` 那一支（`discover.mjs:138`）有了独立证人（`K-S01c` ⇒ 只红 `S-01`）；
   * 旧的两种能力一个没丢（同两把刀照样红它），而"单行 + 单引号"这条仍由 `S-06` 覆盖。
   *
   * 🔴 而且这条轴**不是造出来的**：真树 20 份 `.test.mjs` 里，**双引号标题 0 处、反引号 0 处**（2026-10-20 现量），
   * 全是单引号 ⇒ 谁把解析器改成"只认仓里那种写法"，**分母仍是 66、别的格一条都不红**，**只有这一格会响**。
   */
  { id: 'S-01', name: '单行 title（双引号）', text: 'test("A-01 单行", () => {})', want: { cases: 1, anonymous: 0, unparsed: 0 } },
  { id: 'S-02', name: '换行 title（node 会跑它）', text: "test(\n  'A-02 换行',\n  () => {}\n)", want: { cases: 1, anonymous: 0, unparsed: 0 } },
  { id: 'S-03', name: '标题是算出来的 ⇒ 报"数不出来"', text: 'test(name, () => {})', want: { cases: 0, anonymous: 0, unparsed: 1 } },
  { id: 'S-04', name: '正则方法 .test( 不算用例', text: 'if (/x/.test(line)) push(1)', want: { cases: 0, anonymous: 0, unparsed: 0 } },
  { id: 'S-05', name: '注释里的 test( 不算用例', text: "// test('A-03 注释', () => {})", want: { cases: 0, anonymous: 0, unparsed: 0 } },
  { id: 'S-06', name: '没 ID 的标题 ⇒ 认得出，但归到 anonymous（不进分母）', text: "test('没有 ID 的用例', () => {})", want: { cases: 1, anonymous: 1, unparsed: 0 } },
  { id: 'S-07', name: '前面不是语句边界 ⇒ 报"数不出来"，不许当 0', text: 'const t = [test(name, () => {})]', want: { cases: 0, anonymous: 0, unparsed: 1 } },
]

/**
 * **判词**的格 —— 钉"入口会打出哪些字"。
 * 为什么单列一格：`F57-OK` 出现在收窄那一跑上，是这一票最可能的半修形态（把 `&& fullScope` 删掉）；
 * 而"退出码是 0"与"没打 OK"是**两件事** —— 只看退出码的判据永远看不见后者。
 */
export const JUDGEMENT_TABLE = [
  {
    /** ⚠️ 与 `V-01` 是同一条事实的**判词层**：必然同红，理由写在 `V-01` 那一格上。 */
    id: 'J-01', name: '全量全绿 ⇒ 判词恰好一行 OK、没有 SCOPE/FAIL',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 66, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 66, nodeFail: 0, settleExit: 0 },
    ctx: { settled: 66, denominator: 66, scopeCases: 66 },
    want: { okLines: 1, scopeLines: 0, failLines: 0 },
  },
  {
    /** ⚠️ 与 `V-05` 是同一条事实的**判词层**：必然同红，理由写在 `V-05` 那一格上。 */
    id: 'J-02', name: '收窄全绿 ⇒ 判词里**一个 OK 字都不许有**，且必须有 SCOPE 行',
    input: { denominator: 66, scopeCases: 11, scopeDeclared: true, settled: 11, red: 0, green: 11, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 11, nodeFail: 0, settleExit: 0 },
    ctx: { settled: 11, denominator: 66, scopeCases: 11 },
    want: { okLines: 0, scopeLines: 1, failLines: 0 },
  },
  {
    id: 'J-03', name: '有 HOLD ⇒ 判词里没有 OK，且有 FAIL 说到 HOLD',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 64, hold: 2, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 66, nodeFail: 0, settleExit: 0 },
    ctx: { settled: 66, denominator: 66, scopeCases: 66 },
    want: { okLines: 0, scopeLines: 0, failLines: 1, failHas: 'HOLD' },
  },
]

/**
 * **靶子过期判据**的格（F-105）—— 纯合成读数，不碰盘。
 *
 * 为什么必须有两格绿：这条判据现在（还没同步靶子时）就应该是**红**的。
 * 一条"现在就红"的判据如果只有红格，它和"永远红"长得一模一样 —— 那两格绿证明它会翻面。
 * 为什么红格要分成七种：每一种都是**最可能出现的半修形状**（`mig-rules-16`）：
 *   补了文件没撤声明 · 改了 1 个字节 · 声明漏报一样 · 声明字节数差 1 · 编一个功能名 ·
 *   少写认领人 · 把已经补上的说成还缺。
 */
const SYN_BASELINE = [
  'function helper() {}',
  'function commonSenseOf() {}',
  'function timeLineOf(id) {}',
  'const lastBoardPosted = new Map()',
  'const proposalFileEnabled = true',
  'let boardChanged = false',
  '',
].join('\n')
/** 少五样功能那一版（目录里五个名字一个都不在）。 */
const SYN_OLD = 'function helper() {}\n'
/** 字节数与 `SYN_BASELINE` 相同、内容差一个字符（"改了 1 个字节"那一格）。 */
const SYN_ONE_BYTE = SYN_BASELINE.replace('function helper() {}', 'function helpei() {}')
/** 靶子比现役还多一样（声明写成"落后"就该红的那一格用不上，留给多报那一格）。 */
const SYN_AHEAD = `${SYN_OLD}let boardChanged = false\n`

const SHA = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const BYTES = (text) => Buffer.byteLength(text, 'utf8')

/** 造一份合成量测：一边一段正文，别的一律从正文算出来（不许手写字节数/哈希）。 */
function synthMeasured(stagedText, baselineText = SYN_BASELINE, file = 'inject.js') {
  return {
    stagedRoot: '<synth-staged>',
    baselineRoot: '<synth-baseline>',
    files: [{
      file,
      staged: { file, abs: '<synth-staged>', exists: true, bytes: BYTES(stagedText), sha256: SHA(stagedText), text: stagedText },
      baseline: { file, abs: '<synth-baseline>', exists: true, bytes: BYTES(baselineText), sha256: SHA(baselineText), text: baselineText },
    }],
  }
}

/** 声明的一行：默认**逐字对上** `stagedText` / `baselineText` 的实测事实，再按 `over` 覆写。 */
function synthDeclaration(stagedText = SYN_OLD, baselineText = SYN_BASELINE, over = {}, markers = undefined) {
  const missing = (markers ?? ['commonSenseOf', 'timeLineOf', 'lastBoardPosted', 'proposalFileEnabled', 'boardChanged'])
    .filter((m) => baselineText.includes(m) && !stagedText.includes(m))
  const lag = BYTES(baselineText) - BYTES(stagedText)
  const row = {
    file: 'inject.js',
    state: lag > 0 ? 'behind' : lag < 0 ? 'ahead' : 'differ',
    lag_bytes: lag,
    sha256: SHA(stagedText),
    baseline_sha256: SHA(baselineText),
    missing_markers: missing,
    reason: '那一轮还没把五样功能补进 staged（合成读数）',
    approved_by: 'leader',
    approved_on: '2026-10-19',
    closes_when: 'staged/inject.js 与现役逐字节相同',
    ...over,
  }
  return { path: '<synth-declaration>', present: true, error: null, value: { schema: 1, entries: [row] } }
}

const NO_DECLARATION = { path: '<synth-declaration>', present: false, error: null, value: null }

export const TARGET_TABLE = [
  {
    id: 'T-01', name: '逐字节相同 + 没有声明 ⇒ 绿（目标态：绿了就是绿了）',
    input: { measured: synthMeasured(SYN_BASELINE), declaration: NO_DECLARATION },
    want: { ok: true, state: 'equal', codes: [], lineHas: '靶子=现役' },
  },
  {
    id: 'T-02', name: '落后 + 声明逐字对上 ⇒ 绿（落后允许，只要说清）',
    input: { measured: synthMeasured(SYN_OLD), declaration: synthDeclaration() },
    want: { ok: true, state: 'declared', codes: [], lineHas: '已声明' },
  },
  {
    id: 'T-03', name: '落后 + 没有声明 ⇒ 红，且点名文件/字节数/缺的五样',
    input: { measured: synthMeasured(SYN_OLD), declaration: NO_DECLARATION },
    want: { ok: false, codes: ['TARGET-LAG-UNDECLARED'], lineHas: '未声明', problemsHave: ['inject.js', 'proposalFileEnabled', String(BYTES(SYN_BASELINE) - BYTES(SYN_OLD))] },
  },
  {
    id: 'T-04', name: '已经逐字节相同、声明还说落后 ⇒ 红（声明过期）',
    input: { measured: synthMeasured(SYN_BASELINE), declaration: synthDeclaration(SYN_OLD) },
    want: { ok: false, codes: ['TARGET-LAG-STALE-DECLARATION'], lineHas: '未声明或不符' },
  },
  {
    id: 'T-05', name: '声明漏报一样（proposalFileEnabled）⇒ 红（少报）',
    input: {
      measured: synthMeasured(SYN_OLD),
      declaration: synthDeclaration(SYN_OLD, SYN_BASELINE, {
        missing_markers: ['commonSenseOf', 'timeLineOf', 'lastBoardPosted', 'boardChanged'],
      }),
    },
    want: { ok: false, codes: ['TARGET-MARKER-UNDERCLAIM'], problemsHave: ['proposalFileEnabled'] },
  },
  {
    id: 'T-06', name: '声明字节数差 1 ⇒ 红（声明的每个数都必须能复现）',
    input: {
      measured: synthMeasured(SYN_OLD),
      declaration: synthDeclaration(SYN_OLD, SYN_BASELINE, { lag_bytes: BYTES(SYN_BASELINE) - BYTES(SYN_OLD) - 1 }),
    },
    want: { ok: false, codes: ['TARGET-DECLARATION-MISMATCH'], problemsHave: ['lag_bytes'] },
  },
  {
    id: 'T-07', name: '只差 1 个字节、字节数没变 ⇒ 红（这一格是那把刀）',
    input: { measured: synthMeasured(SYN_ONE_BYTE), declaration: NO_DECLARATION },
    want: { ok: false, codes: ['TARGET-LAG-UNDECLARED'], problemsHave: ['字节数相同但内容不同'] },
  },
  {
    id: 'T-08', name: '声明里编一个不在目录里的功能名 ⇒ 红',
    input: {
      measured: synthMeasured(SYN_OLD),
      declaration: synthDeclaration(SYN_OLD, SYN_BASELINE, {
        missing_markers: ['commonSenseOf', 'timeLineOf', 'lastBoardPosted', 'proposalFileEnabled', 'boardChanged', 'timeLineOfX'],
      }),
    },
    want: { ok: false, codes: ['TARGET-MARKER-UNKNOWN'], problemsHave: ['timeLineOfX'] },
  },
  {
    id: 'T-09', name: '声明没写认领人（approved_by 空）⇒ 红',
    input: { measured: synthMeasured(SYN_OLD), declaration: synthDeclaration(SYN_OLD, SYN_BASELINE, { approved_by: '  ' }) },
    want: { ok: false, codes: ['TARGET-DECLARATION-FIELD'], problemsHave: ['approved_by'] },
  },
  {
    id: 'T-10', name: '把靶子里本来就有的一样说成缺 ⇒ 红（多报）',
    input: {
      measured: synthMeasured(SYN_AHEAD),
      declaration: synthDeclaration(SYN_AHEAD, SYN_BASELINE, {
        missing_markers: ['commonSenseOf', 'timeLineOf', 'lastBoardPosted', 'proposalFileEnabled', 'boardChanged'],
      }),
    },
    want: { ok: false, codes: ['TARGET-MARKER-OVERCLAIM'], problemsHave: ['boardChanged'] },
  },
]

/**
 * **这 30 格的身份证**（冻结）。`runSelfCheck()` 收尾时按这张清单对账。
 *
 * 🔴 为什么按 **id** 而不是按**数目**：`checked === 30` 只防"删"，防不住"删两格加两格"——
 *    两次改完数目照样是 30。换成"这 30 条 id **一条不少**"以后，**删一格 / 换一格**都会红
 *    （`cand-20261017-0072`）。**挪到别的表** id 不变，由下面 `TABLE_OF_ID_PREFIX` 那一条抓。
 * ⚠️ 加一格**新 id** 不红（新增格是合法改动；要改这张冻结清单是另一件要批的事）。
 */
export const FROZEN_CELL_IDS = [
  'V-01', 'V-02', 'V-03', 'V-04', 'V-05', 'V-06', 'V-07', 'V-08', 'V-09', 'V-10',
  'J-01', 'J-02', 'J-03',
  'S-01', 'S-02', 'S-03', 'S-04', 'S-05', 'S-06', 'S-07',
  'T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06', 'T-07', 'T-08', 'T-09', 'T-10',
]

/**
 * **每格的断言面**（冻结）—— 那一格 `want` 上有哪些键。
 *
 * 🔴 为什么只冻 id 不够：把一格的 `failCount` 删掉、把 `problemsHave` 去掉、或者把 `want` 改宽，
 *    **id 一个不少、格照样跑、入口全绿** —— "改小"不只发生在**行**上，也发生在**断言面**上（第 4 关评审 `N-2`）。
 *    两个方向都红，但用的字不一样：
 *      · 少了一个冻结的面 ⇒ 「少了一个冻结的断言面」（危险的那个方向）；
 *      · 多了一个没登记的面 ⇒ 「多了一个没登记的断言面：要加断言，先把它登记进这里」。
 */
export const FROZEN_CELL_KEYS = {
  'V-01': ['exitCode', 'failCount', 'ok'],
  'V-02': ['exitCode', 'failCount', 'failHas', 'ok'],
  'V-03': ['exitCode', 'failCount', 'failHas', 'ok'],
  'V-04': ['exitCode', 'failCount', 'failHas', 'ok'],
  'V-05': ['exitCode', 'failCount', 'ok'],
  'V-06': ['exitCode', 'failCount', 'failHas', 'ok'],
  'V-07': ['exitCode', 'failCount', 'failHas', 'ok'],
  'V-08': ['exitCode', 'failCount', 'failHas', 'ok'],
  'V-09': ['exitCode', 'failCount', 'failHas', 'ok'],
  'V-10': ['exitCode', 'failCount', 'failHas', 'ok'],
  'J-01': ['failLines', 'okLines', 'scopeLines'],
  'J-02': ['failLines', 'okLines', 'scopeLines'],
  'J-03': ['failHas', 'failLines', 'okLines', 'scopeLines'],
  'S-01': ['anonymous', 'cases', 'unparsed'],
  'S-02': ['anonymous', 'cases', 'unparsed'],
  'S-03': ['anonymous', 'cases', 'unparsed'],
  'S-04': ['anonymous', 'cases', 'unparsed'],
  'S-05': ['anonymous', 'cases', 'unparsed'],
  'S-06': ['anonymous', 'cases', 'unparsed'],
  'S-07': ['anonymous', 'cases', 'unparsed'],
  'T-01': ['codes', 'lineHas', 'ok', 'state'],
  'T-02': ['codes', 'lineHas', 'ok', 'state'],
  'T-03': ['codes', 'lineHas', 'ok', 'problemsHave'],
  'T-04': ['codes', 'lineHas', 'ok'],
  'T-05': ['codes', 'ok', 'problemsHave'],
  'T-06': ['codes', 'ok', 'problemsHave'],
  'T-07': ['codes', 'ok', 'problemsHave'],
  'T-08': ['codes', 'ok', 'problemsHave'],
  'T-09': ['codes', 'ok', 'problemsHave'],
  'T-10': ['codes', 'ok', 'problemsHave'],
}

/** id 的第一个字母就是它该在的表（挪表 ⇒ 红；这一条 `ran` 里已经记了 `table`）。 */
export const TABLE_OF_ID_PREFIX = { V: 'VERDICT', J: 'JUDGEMENT', S: 'SHAPE', T: 'TARGET' }

/**
 * @returns {{ok: boolean, failures: string[], checked: number}}
 */
export function runSelfCheck() {
  const failures = []
  let checked = 0
  /**
   * **实际跑过的格**（不是"表里写着什么"）。
   * 结构判据必须读这一份：读表只能防"把行删掉"，防不住"把那一圈的循环去掉 / 把表换成空数组"——
   * 后者表里 id 一个不少，可一格都没跑（2026-10-20 实测：`for (const row of [])` ⇒ 表看着完整、跑 20 格、全绿）。
   */
  const ran = []
  for (const row of VERDICT_TABLE) {
    checked += 1
    ran.push({ table: 'VERDICT', id: row.id, want: row.want })
    const got = entryVerdict(row.input)
    if (got.exitCode !== row.want.exitCode) failures.push(`verdict「${row.id} ${row.name}」：退出码 ${got.exitCode} ≠ ${row.want.exitCode}`)
    if (got.ok !== row.want.ok) failures.push(`verdict「${row.id} ${row.name}」：ok=${got.ok} ≠ ${row.want.ok}（OK 只许在"分母=跑到=全绿=无 HOLD"时出现）`)
    if (row.want.failHas !== undefined && !got.failures.some((f) => f.includes(row.want.failHas))) {
      failures.push(`verdict「${row.id} ${row.name}」：没有任何一条失败信息提到 ${JSON.stringify(row.want.failHas)}（实得 ${JSON.stringify(got.failures)}）`)
    }
    // `failCount`：红因**只有**这么几条 —— 没有它，"别的判据先红"会把这一格的半修遮住。
    if (row.want.failCount !== undefined && got.failures.length !== row.want.failCount) {
      failures.push(`verdict「${row.id} ${row.name}」：红因 ${got.failures.length} 条 ≠ ${row.want.failCount}（实得 ${JSON.stringify(got.failures)}）`)
    }
  }
  for (const row of JUDGEMENT_TABLE) {
    checked += 1
    ran.push({ table: 'JUDGEMENT', id: row.id, want: row.want })
    const lines = judgementLines(entryVerdict(row.input), row.ctx)
    const got = {
      okLines: lines.filter((l) => l.startsWith('F57-OK')).length,
      scopeLines: lines.filter((l) => l.startsWith('F57-SCOPE')).length,
      failLines: lines.filter((l) => l.startsWith('F57-FAIL')).length,
    }
    for (const key of ['okLines', 'scopeLines', 'failLines']) {
      if (got[key] !== row.want[key]) failures.push(`judgement「${row.id} ${row.name}」：${key}=${got[key]} ≠ ${row.want[key]}（判词实得 ${JSON.stringify(lines)}）`)
    }
    if (row.want.failHas !== undefined && !lines.some((l) => l.startsWith('F57-FAIL') && l.includes(row.want.failHas))) {
      failures.push(`judgement「${row.id} ${row.name}」：没有一条 FAIL 提到 ${JSON.stringify(row.want.failHas)}（判词实得 ${JSON.stringify(lines)}）`)
    }
  }
  for (const row of SHAPE_TABLE) {
    checked += 1
    ran.push({ table: 'SHAPE', id: row.id, want: row.want })
    const parsed = parseTestCalls(row.text)
    const got = { cases: parsed.calls.length, anonymous: parsed.calls.filter((c) => caseIdOf(c.title) === null).length, unparsed: parsed.unparsed.length }
    for (const key of ['cases', 'anonymous', 'unparsed']) {
      if (got[key] !== row.want[key]) failures.push(`shape「${row.id} ${row.name}」：${key}=${got[key]} ≠ ${row.want[key]}`)
    }
  }
  /**
   * 靶子过期判据的格。三个方向各自承重：
   *   · `ok` / `state`：这一份实测+声明该不该绿；
   *   · `codes`：红因**恰好**是这几个码（多一个少一个都算没钉住 —— 半修形态常是"红对了、理由错了"）；
   *   · `problemsHave`：红的话必须**点名**（文件名 / 字节数 / 那个功能名），否则"红了"不给人修的路。
   */
  for (const row of TARGET_TABLE) {
    checked += 1
    ran.push({ table: 'TARGET', id: row.id, want: row.want })
    const got = targetVerdict(row.input)
    if (got.ok !== row.want.ok) failures.push(`target「${row.id} ${row.name}」：ok=${got.ok} ≠ ${row.want.ok}（判据实得 ${JSON.stringify(got.problems)}）`)
    if (row.want.state !== undefined && got.state !== row.want.state) failures.push(`target「${row.id} ${row.name}」：state=${got.state} ≠ ${row.want.state}`)
    const codes = got.problems.map((p) => p.code).sort()
    const wantCodes = [...row.want.codes].sort()
    if (JSON.stringify(codes) !== JSON.stringify(wantCodes)) failures.push(`target「${row.id} ${row.name}」：红因码 ${JSON.stringify(codes)} ≠ ${JSON.stringify(wantCodes)}`)
    if (row.want.lineHas !== undefined && !got.line.includes(row.want.lineHas)) {
      failures.push(`target「${row.id} ${row.name}」：判读那一行没有 ${JSON.stringify(row.want.lineHas)}（实得 ${JSON.stringify(got.line)}）`)
    }
    for (const needle of row.want.problemsHave ?? []) {
      if (!got.problems.some((p) => p.message.includes(needle))) {
        failures.push(`target「${row.id} ${row.name}」：没有任何一条红因提到 ${JSON.stringify(needle)}（实得 ${JSON.stringify(got.problems.map((p) => p.message))}）`)
      }
    }
  }
  /**
   * ── 结构：**那 30 格的 id 一条不许少** ───────────────────────────────────────
   * 前面四轮只证明"表里的格跑出来符合期望"；这一轮回答的是**"表自己少了格"**：
   *   · 一格被删掉（哪怕只删一格）⇒ 红 ⇒ 入口 `exit 3`，连跑都不许跑；
   *   · **整张表一圈都不跑**（表里 id 一个不少、跑的是空数组）⇒ 同样红 —— 这一段读的是 `ran`（实际跑过的格），
   *     不是"表里写着什么"；
   *   · 一格没有 id / 两个格共用一个 id ⇒ 红（"缺了哪一格"会说不清）；
   *   · 一格**少了一个冻结的断言面**（`failCount` / `problemsHave` …）⇒ 红（"改小"也能发生在面上）；
   *   · 一格挪到别的表 ⇒ 红（id 不变，看 `ran` 里记的 `table`）；
   *   · 新加一格（新 id）⇒ **不红**（新增是合法改动）。🔴 代价要写全：**它「可选的」断言面不受保护** ——
   *     `FROZEN_CELL_KEYS` 里没有它，下面那个面循环就 `continue` 掉了 ⇒ **删掉它的一个可选面
   *     （`problemsHave` / `lineHas` / `state` / `failCount`），不会有任何一条红**。
   *     ⚠️ 不受保护的**只有可选的**那几样：每格自己那一圈仍在**无条件地**读 `ok` / `exitCode` /
   *     `cases` / `anonymous` / `unparsed` / `*Lines`（上面那四个格循环），删掉照样红。
   *     🔴 `codes` **不在这张单子里**：`:421` 是 `const wantCodes = [...row.want.codes].sort()` —— 一格漏了
   *     `codes` 就**抛 `TypeError`**（不是"红"），而这一抛发生在 `run-all.mjs:82` 的
   *     `const selfCheck = runSelfCheck()`，**早于**入口身份与自检读数落盘（同文件 `:144` 起）⇒
   *     那一跑 `exit 1` 带栈，四处身份落盘
   *     （sidecar 两份 / 运行根两份 / `judgement.txt` / `--json`）一处都不会出现，"跑的是哪一份"又退回自报。
   *     ⚠️ 触发面正是被祝福的那条合法路径：按上面"新加一格（新 id）⇒ 不红"加一格 `TARGET` 类的新格
   *     而漏了 `codes`，就走到这里。
   *     要保护一格，就把 id 同时登记进 `FROZEN_CELL_IDS` 和 `FROZEN_CELL_KEYS`（两张表的键由下面那条对账）。
   *   · 两张冻结表**自己**对不上 ⇒ 红，且两个方向分开报（少一行 = 那一格的断言面没人守；
   *     多一行 = 那一格的 id 没在冻结清单里 —— 「幽灵登记」与「只删了 id」两种形态，见下面）。
   * ⚠️ `checked` 只是读数（跑了几格），判据是这段。别拿 `checked === 30` 当守卫。
   */
  const rows = ran
  const ids = rows.map((x) => x.id)
  const withoutId = rows.filter((x) => typeof x.id !== 'string' || x.id.trim() === '')
  if (withoutId.length > 0) {
    failures.push(`结构：${withoutId.length} 格没有 id（${withoutId.map((x) => x.table).join(' / ')}）—— 冻结清单靠 id 认格，没有 id 的格等于"数不出来的格"`)
  }
  const duplicated = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (duplicated.length > 0) {
    failures.push(`结构：id 重复 ${JSON.stringify([...new Set(duplicated)])} —— 两格共用一个 id，"少了哪一格"就说不清`)
  }
  const missing = FROZEN_CELL_IDS.filter((id) => !ids.includes(id))
  if (missing.length > 0) {
    failures.push(`结构：冻结清单里的格从表里消失了 ${missing.length} 格：${missing.join(' / ')} —— 这 ${FROZEN_CELL_IDS.length} 条 id 一条不许少`)
  }
  // 🔴 **登记表本身也得有人守**（`F-138`）：上面那条只查"表里的格少了没"，而下面那个断言面循环遇到
  //    `FROZEN_CELL_KEYS[x.id] === undefined` 直接 `continue` ⇒ 从登记表里删掉一行，那一格的断言面
  //    **当场失守、0 红**（套件全绿、`exit 0`）。所以两张冻结表必须**双向相等**。
  //    两个方向是两件事，分开报，别合成一句"对不上"：少的那一向是"没人守"，多的那一向是"假保护"。
  const keyIds = Object.keys(FROZEN_CELL_KEYS)
  const noFace = FROZEN_CELL_IDS.filter((id) => !keyIds.includes(id))
  if (noFace.length > 0) {
    failures.push(`结构：登记表少登记了 ${noFace.length} 格：${noFace.join(' / ')} —— FROZEN_CELL_IDS 里有、FROZEN_CELL_KEYS 里没有 ⇒ 它的断言面**没人守**：删掉它的一个可选面（problemsHave / lineHas / state / failCount）不会有任何一条红；必检的那几样（ok / exitCode / cases / anonymous / unparsed / *Lines）仍由那一格自己的循环无条件比；codes 不在其列（缺了它抛 TypeError，不是红）`)
  }
  /**
   * 「多登记」那一向有**两种形态**，红因分开说 —— 形态由 `ran` 判（`ids` 里有没有这个 id），**不猜**：
   *   ① **幽灵登记**：`FROZEN_CELL_KEYS` 里有一行，而套件里**跑不出这一格** ⇒ 它永远不会被检查
   *      —— 看着像有保护、其实没有。
   *   ② **只删了 id**：格还在套件里跑着，可选面也还在被 `FROZEN_CELL_KEYS` 守着，但 `FROZEN_CELL_IDS`
   *      里没有它的 id ⇒ 丢的是「这一格**存在**」这条**直接**保护：删格 / 改名要到形态① 才报，而形态①
   *      给的修法是「删掉这行登记」—— 照着做，这一格就连痕迹一起没了；全句只在下面那条红因里，这里留指针
   *      （同一件事写两遍，改一处就得动两处）。
   * 两种形态的修法**相反**：① 删掉这行登记（或把格补回套件再登记）· ② 把 id 加回 `FROZEN_CELL_IDS`
   * （② 若照 ① 的修法去删登记行，会把这一格剩下的面也一起丢掉）。
   */
  const unlisted = keyIds.filter((id) => !FROZEN_CELL_IDS.includes(id))
  const ghostIds = unlisted.filter((id) => !ids.includes(id))
  const ranButUnlisted = unlisted.filter((id) => ids.includes(id))
  if (ghostIds.length > 0) {
    failures.push(`结构：登记表多登记了 ${ghostIds.length} 格（幽灵登记）：${ghostIds.join(' / ')} —— FROZEN_CELL_KEYS 里有、FROZEN_CELL_IDS 里没有，而套件里**跑不出这一格** ⇒ 它永远不会被检查：看着像有保护、其实没有。修法：删掉这行登记（或把这一格补回套件并登记进 FROZEN_CELL_IDS）`)
  }
  if (ranButUnlisted.length > 0) {
    failures.push(`结构：登记表多登记了 ${ranButUnlisted.length} 格（只删了 id）：${ranButUnlisted.join(' / ')} —— 这一格**在套件里跑着**、可选面也还在被 FROZEN_CELL_KEYS 守着，但 FROZEN_CELL_IDS 里没有它的 id ⇒ 它的**存在**只被间接守着：只要 FROZEN_CELL_KEYS 那行还在，删格 / 改名会掉进形态①，而形态① 的修法是「删掉这行登记」—— 照着做，这一格就连痕迹一起没了；真正 0 红的是两行一起删（那时 checked 从 30 变 29，没有任何判据在看这个数）。修法：把 id 加回 FROZEN_CELL_IDS（删这行登记会把这一格的可选面一起丢掉）`)
  }
  // 挪表：id 不变，只有 `ran` 里那个 `table` 变了 —— 单靠 id 清单抓不住（第 4 关评审 `N-6`）。
  const moved = rows.filter((x) => typeof x.id === 'string' && TABLE_OF_ID_PREFIX[x.id[0]] !== undefined && TABLE_OF_ID_PREFIX[x.id[0]] !== x.table)
  if (moved.length > 0) {
    failures.push(`结构：格挪到别的表里了 ${moved.length} 格：${moved.map((x) => `${x.id}（现在在 ${x.table}）`).join(' / ')} —— id 的第一个字母就是它该在的表`)
  }
  /**
   * 断言面：**"改小"不只发生在行上，也发生在面**（第 4 关评审 `N-2`）。
   * 把一格的 `failCount` / `problemsHave` 删掉，id 一个不少、格照样跑 ⇒ 只有这一段能拦住。
   */
  for (const x of rows) {
    const frozen = FROZEN_CELL_KEYS[x.id]
    // 到这里 `frozen === undefined` 只剩一种情况：**新加的格**（两张冻结表都没登记）⇒ 不红，新增是合法改动。
    // （只从 `FROZEN_CELL_KEYS` 删了一行的那种，上面的 `noFace` 已经红掉了。）
    // ⚠️ 代价是它**可选的**断言面不受保护 —— 要保护就登记进 `FROZEN_CELL_IDS` + `FROZEN_CELL_KEYS`（上面那条双向相等在对账）。
    if (frozen === undefined) continue
    const has = Object.keys(x.want ?? {}).sort()
    const lost = frozen.filter((k) => !has.includes(k))
    const extra = has.filter((k) => !frozen.includes(k))
    if (lost.length > 0) {
      failures.push(`结构：「${x.id}」少了一个冻结的断言面：${lost.join(' / ')}（实得 ${JSON.stringify(has)}）—— 删一个面就等于把这一格的判据改宽`)
    }
    if (extra.length > 0) {
      failures.push(`结构：「${x.id}」多了一个没登记的断言面：${extra.join(' / ')}（实得 ${JSON.stringify(has)}）—— 要加断言，先把它登记进 FROZEN_CELL_KEYS`)
    }
  }
  return { ok: failures.length === 0, failures, checked }
}
