/**
 * F-57 判据自检表（「格」）—— 入口每次启动先过这张表。
 *
 * 🔴 为什么在入口里、而不是加成一个正式用例 ID：
 *    测试岗的阳性对照（`_ref/`）把登记表钉在"HEAD 的 55 行 + 那 11 条 PFL"上；
 *    往盘上**加新 ID** 会让那一跑里盘上 70 条、登记 66 条 ⇒ 他们的 `--ref` 从 10 绿掉成 9 绿。
 *    所以这三格落成**入口的启动自检**：哪一条判据被改回去，入口当场 `F57-FAIL 自检` 并 exit 3
 *    —— 连"跑一次"都不许发生。它比"某条用例红"更硬，而且不动分母。
 *
 * 表里每一行都是**手写期望**（不从实现反推），输入是冻结的合成读数。三张表共 **19 格**：
 *   · `VERDICT_TABLE`（9）：这一跑的读数是真是假、该给哪个退出码、算不算"干净通过"；
 *   · `JUDGEMENT_TABLE`（3）：入口会打出**哪些字** —— 收窄那一跑里**一个 OK 都不许有**；
 *   · `SHAPE_TABLE`（7）：发现器认得出哪种 `test(...)` 形状；认不出的必须**报**（不许当成 0）。
 */
import { entryVerdict, judgementLines } from './verdict.mjs'
import { parseTestCalls } from './discover.mjs'

/** 「这一跑算不算数」的九个格（输入 → 期望退出码 / 是否算干净通过）。 */
export const VERDICT_TABLE = [
  {
    name: '全量全绿 ⇒ 0 且算干净通过',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 66, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 66, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 0, ok: true },
  },
  {
    name: '有 HOLD ⇒ 不是绿（exit 2）',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 64, hold: 2, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 66, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 2, ok: false, failHas: 'HOLD' },
  },
  {
    name: '半跑（没声明范围，跑到 11/共 66）⇒ exit 1',
    input: { denominator: 66, scopeCases: null, scopeDeclared: false, settled: 11, red: 0, green: 11, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 11, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '11' },
  },
  {
    name: '声明范围跑满且全绿 ⇒ exit 0，但**不是**全量证据（不许打 OK）',
    input: { denominator: 66, scopeCases: 11, scopeDeclared: true, settled: 11, red: 0, green: 11, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 11, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 0, ok: false },
  },
  {
    name: '声明范围没跑满（声明 11 / 跑到 10）⇒ exit 1',
    input: { denominator: 66, scopeCases: 11, scopeDeclared: true, settled: 10, red: 0, green: 10, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 10, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '10' },
  },
  {
    name: '有红 ⇒ exit 1',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 2, green: 64, hold: 0, consistent: true, diffCount: 0, nodeExit: 1, nodeTests: 66, nodeFail: 2, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: 'RED' },
  },
  {
    name: '空跑（0 条）⇒ exit 1 且明写"0 用例不算结算"',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 0, red: 0, green: 0, hold: 0, consistent: true, diffCount: 0, nodeExit: 1, nodeTests: null, nodeFail: null, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '0 用例' },
  },
  {
    name: 'node 报 67 条、结算 66 条（发现器漏认一条）⇒ exit 1',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 66, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 67, nodeFail: 0, settleExit: 0 },
    want: { exitCode: 1, ok: false, failHas: '67' },
  },
  {
    name: '登记 ≠ 盘上 ⇒ exit 1',
    input: { denominator: 67, scopeCases: 67, scopeDeclared: false, settled: 67, red: 0, green: 67, hold: 0, consistent: false, diffCount: 1, nodeExit: 0, nodeTests: 67, nodeFail: 0, settleExit: 2 },
    want: { exitCode: 1, ok: false, failHas: '登记' },
  },
]

/** 发现器认形状的格（认得 / 认不出就报，**不许当成 0**）。 */
export const SHAPE_TABLE = [
  { name: '单行 title', text: "test('A-01 单行', () => {})", want: { cases: 1, anonymous: 0, unparsed: 0 } },
  { name: '换行 title（node 会跑它）', text: "test(\n  'A-02 换行',\n  () => {}\n)", want: { cases: 1, anonymous: 0, unparsed: 0 } },
  { name: '标题是算出来的 ⇒ 报"数不出来"', text: 'test(name, () => {})', want: { cases: 0, anonymous: 0, unparsed: 1 } },
  { name: '正则方法 .test( 不算用例', text: 'if (/x/.test(line)) push(1)', want: { cases: 0, anonymous: 0, unparsed: 0 } },
  { name: '注释里的 test( 不算用例', text: "// test('A-03 注释', () => {})", want: { cases: 0, anonymous: 0, unparsed: 0 } },
  { name: '没 ID 的标题 ⇒ 认得出，但归到 anonymous（不进分母）', text: "test('没有 ID 的用例', () => {})", want: { cases: 1, anonymous: 1, unparsed: 0 } },
  { name: '前面不是语句边界 ⇒ 报"数不出来"，不许当 0', text: 'const t = [test(name, () => {})]', want: { cases: 0, anonymous: 0, unparsed: 1 } },
]

/**
 * **判词**的格 —— 钉"入口会打出哪些字"。
 * 为什么单列一格：`F57-OK` 出现在收窄那一跑上，是这一票最可能的半修形态（把 `&& fullScope` 删掉）；
 * 而"退出码是 0"与"没打 OK"是**两件事** —— 只看退出码的判据永远看不见后者。
 */
export const JUDGEMENT_TABLE = [
  {
    name: '全量全绿 ⇒ 判词恰好一行 OK、没有 SCOPE/FAIL',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 66, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 66, nodeFail: 0, settleExit: 0 },
    ctx: { settled: 66, denominator: 66, scopeCases: 66 },
    want: { okLines: 1, scopeLines: 0, failLines: 0 },
  },
  {
    name: '收窄全绿 ⇒ 判词里**一个 OK 字都不许有**，且必须有 SCOPE 行',
    input: { denominator: 66, scopeCases: 11, scopeDeclared: true, settled: 11, red: 0, green: 11, hold: 0, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 11, nodeFail: 0, settleExit: 0 },
    ctx: { settled: 11, denominator: 66, scopeCases: 11 },
    want: { okLines: 0, scopeLines: 1, failLines: 0 },
  },
  {
    name: '有 HOLD ⇒ 判词里没有 OK，且有 FAIL 说到 HOLD',
    input: { denominator: 66, scopeCases: 66, scopeDeclared: false, settled: 66, red: 0, green: 64, hold: 2, consistent: true, diffCount: 0, nodeExit: 0, nodeTests: 66, nodeFail: 0, settleExit: 0 },
    ctx: { settled: 66, denominator: 66, scopeCases: 66 },
    want: { okLines: 0, scopeLines: 0, failLines: 1, failHas: 'HOLD' },
  },
]

/**
 * @returns {{ok: boolean, failures: string[], checked: number}}
 */
export function runSelfCheck() {
  const failures = []
  let checked = 0
  for (const row of VERDICT_TABLE) {
    checked += 1
    const got = entryVerdict(row.input)
    if (got.exitCode !== row.want.exitCode) failures.push(`verdict「${row.name}」：退出码 ${got.exitCode} ≠ ${row.want.exitCode}`)
    if (got.ok !== row.want.ok) failures.push(`verdict「${row.name}」：ok=${got.ok} ≠ ${row.want.ok}（OK 只许在"分母=跑到=全绿=无 HOLD"时出现）`)
    if (row.want.failHas !== undefined && !got.failures.some((f) => f.includes(row.want.failHas))) {
      failures.push(`verdict「${row.name}」：没有任何一条失败信息提到 ${JSON.stringify(row.want.failHas)}（实得 ${JSON.stringify(got.failures)}）`)
    }
  }
  for (const row of JUDGEMENT_TABLE) {
    checked += 1
    const lines = judgementLines(entryVerdict(row.input), row.ctx)
    const got = {
      okLines: lines.filter((l) => l.startsWith('F57-OK')).length,
      scopeLines: lines.filter((l) => l.startsWith('F57-SCOPE')).length,
      failLines: lines.filter((l) => l.startsWith('F57-FAIL')).length,
    }
    for (const key of ['okLines', 'scopeLines', 'failLines']) {
      if (got[key] !== row.want[key]) failures.push(`judgement「${row.name}」：${key}=${got[key]} ≠ ${row.want[key]}（判词实得 ${JSON.stringify(lines)}）`)
    }
    if (row.want.failHas !== undefined && !lines.some((l) => l.startsWith('F57-FAIL') && l.includes(row.want.failHas))) {
      failures.push(`judgement「${row.name}」：没有一条 FAIL 提到 ${JSON.stringify(row.want.failHas)}（判词实得 ${JSON.stringify(lines)}）`)
    }
  }
  for (const row of SHAPE_TABLE) {
    checked += 1
    const parsed = parseTestCalls(row.text)
    const got = { cases: parsed.calls.length, anonymous: parsed.calls.filter((c) => !/^[A-Z]+-\d{2}\b/.test(c.title)).length, unparsed: parsed.unparsed.length }
    for (const key of ['cases', 'anonymous', 'unparsed']) {
      if (got[key] !== row.want[key]) failures.push(`shape「${row.name}」：${key}=${got[key]} ≠ ${row.want[key]}`)
    }
  }
  return { ok: failures.length === 0, failures, checked }
}
