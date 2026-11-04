/**
 * `DASH-03` / `DASH-04` / `DASH-08` —— 客户端看板**视图模型**的契约面（第 2 关，红先）。
 *
 * 契约：`.team/test/2026-11-04/技术契约-客户端看板.md` §3（视图模型）/ §4（缺·空·坏三态）。
 * 定形：R3「第一行 = 目标 · 当前大阶段（不许拿阶段名冒充五关的值）」· R5「欠账区没有就写 0，不许留空」·
 * §八.1（三列）· §八.2（徽标住记忆相位词）· §六.1（字段指到真源）。
 * 对照表：E09（第一行读 `headline`，**不现拼**）· E15（三格的真源与算法）· E20（空态）· §5「缺 ≠ 空」。
 *
 * 三格：
 *   · `DASH-03` **第一行**：等于 `current.json#headline` **原样**；把 `goal.title` 改掉而 headline 不动
 *     ⇒ 第一行不动（证明没现拼）；headline 空 ⇒ `（目标未填）`；读不到 ⇒ `未知`（不是空白）。
 *   · `DASH-04` **五关那一格**：读 `tasks[id].five_gate_state`，9 值闭集；**把大阶段名改成某个五关词**
 *     ⇒ 那一格不许跟着变（这是"拿阶段名冒充五关"的唯一可翻面造法）；闭集外 ⇒ `不适用` + 报警。
 *   · `DASH-08` **缺 / 空 / 坏**：空集合 ⇒ 显式 `0`；少一份源 ⇒ 该格 `未知`、其余格不动、**不崩不空**；
 *     route 读不到时**不许**印"本阶段没有当前任务"（那是"我们知道没有"，两件事）。
 */
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { loadDashboard, routeFixture, sourcePathsOf, writeSources, noteSutOverride } from '../support/dashboard-surface.mjs'
import { FIVE_GATES } from '../../../presets/agenia/lib/route.mjs'
import { PHASES } from '../../../presets/agenia/lib/state.mjs'

before(() => {
  preflight()
})

const D = '2026-11-04'
const HEADLINE = '演示目标 · 执行一 · 演示'
const EMPTY_NOTICE = '本阶段没有当前任务'
/** 契约 §4 的报警码闭集（带 `:<source>` 后缀的按前缀判）。 */
const ALERT_CODES = [
  'DASH-SOURCE-MISSING',
  'DASH-SOURCE-UNREADABLE',
  'DASH-SOURCE-SCHEMA',
  'DASH-HEADLINE-EMPTY',
  'DASH-TASK-POINTER-DANGLING',
  'DASH-GATE-INVALID',
  'DASH-PHASE-INVALID',
]

/** 从夹具目录读出一份 `input`（走生产侧读者；不手搓输入，免得"读者"那一层没人过）。 */
function inputFrom(readSources, caseId, purpose, sources) {
  const fixture = writeSources(caseId, purpose, { day: D, ...sources })
  const read = readSources(sourcePathsOf(fixture.files))
  return { fixture, read, input: read.input }
}

/** 取生产侧读者（契约 §1 导出 #3）；缺了就把这一格记成问题、返回 null。 */
function readerOf(mod, problems) {
  const readSources = mod.mod.readDashboardSources
  if (typeof readSources !== 'function') {
    problems.push(problem('DASH-READER-MISSING', 'readDashboardSources 必须是函数（契约 §1 导出 #3）'))
    return null
  }
  return readSources
}

/** 报警码闭集检查（多一个没登记的码 ⇒ 报告里读不出它是什么）。 */
function alertProblems(view, where) {
  const problems = []
  const alerts = Array.isArray(view?.alerts) ? view.alerts : null
  if (alerts === null) return [problem('DASH-ALERTS-SHAPE', `${where}：alerts 必须是数组（契约 §3）`)]
  for (const alert of alerts) {
    const code = String(alert?.code ?? '')
    const known = ALERT_CODES.some((c) => code === c || code.startsWith(`${c}:`))
    if (!known) problems.push(problem('DASH-ALERT-CODE', `${where}：报警码 ${JSON.stringify(code)} 不在契约 §4 的闭集里`))
  }
  return problems
}

test('DASH-03 第一行 = headline 原样（阶段名/目标名都改不动它）', async () => {
  await runCase('DASH-03', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const mod = await loadDashboard()
    if (!mod.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${mod.file}（${mod.reason}）`))
      caseFail(problems)
    }
    const { dashboardOf } = mod.mod
    if (typeof dashboardOf !== 'function') {
      problems.push(problem('DASH-VIEW-MISSING', 'dashboardOf 必须是函数（契约 §1 导出 #2）'))
      caseFail(problems)
    }
    const readSources = readerOf(mod, problems)
    if (readSources === null) caseFail(problems)

    const cells = [
      {
        key: 'A-自洽',
        route: routeFixture(),
        want: { text: HEADLINE, empty: false, stale: false, equalsDerived: true },
      },
      {
        key: 'B-headline 与派生值不一致',
        route: routeFixture({ headline: '别的目标 · 别的阶段' }),
        want: { text: '别的目标 · 别的阶段', empty: false, stale: true, equalsDerived: false },
      },
      {
        key: 'C-阶段改名、headline 不动',
        route: routeFixture({
          stages: [{ id: 'stage-demo', name: '偷偷改过的阶段名', order: 1, state: 'current', boss_gate: 'none', exit_criteria: [], kind: 'build' }],
        }),
        want: { text: HEADLINE, empty: false, stale: true, equalsDerived: false },
      },
      {
        key: 'D-目标改名、headline 不动',
        route: routeFixture({ goal: { id: 'genia-demo', title: '偷偷改过的目标名' } }),
        want: { text: HEADLINE, empty: false, stale: true, equalsDerived: false },
      },
      {
        key: 'E-headline 空',
        route: routeFixture({ headline: null }),
        want: { text: '（目标未填）', empty: true, stale: false, equalsDerived: false, alert: 'DASH-HEADLINE-EMPTY' },
      },
    ]
    const readings = []
    for (const cell of cells) {
      const { input } = inputFrom(readSources, 'DASH-03', cell.key, { route: cell.route })
      let view
      try {
        view = dashboardOf(input)
      } catch (err) {
        problems.push(problem('DASH-VIEW-THROWS', `${cell.key}：dashboardOf 抛了：${String(err?.message ?? err)}`))
        continue
      }
      const header = view?.header
      const derived = `${cell.route.goal.title} · ${cell.route.stages[0].name}`
      readings.push({ key: cell.key, header: header ?? null, derived })
      if (header === undefined || header === null) {
        problems.push(problem('DASH-HEADER-MISSING', `${cell.key}：视图里没有 header（契约 §3：header = {text, empty, stale}）`))
        continue
      }
      if (header.text !== cell.want.text) {
        problems.push(problem('DASH-HEADER-TEXT', `${cell.key}：第一行是 ${JSON.stringify(header.text)}，应当是 ${JSON.stringify(cell.want.text)} —— 第一行只读 current.json#headline（对照表 E09），不许现拼、不许印阶段名`))
      }
      if (typeof header.text !== 'string' || header.text.trim() === '') {
        problems.push(problem('DASH-HEADER-BLANK', `${cell.key}：第一行是空白 —— 定形 R5 的"不许留空"同样管第一行`))
      }
      if (header.empty !== cell.want.empty) problems.push(problem('DASH-HEADER-EMPTY', `${cell.key}：header.empty=${JSON.stringify(header.empty)}，应当是 ${cell.want.empty}`))
      if (header.stale !== cell.want.stale) problems.push(problem('DASH-HEADER-STALE', `${cell.key}：header.stale=${JSON.stringify(header.stale)}，应当是 ${cell.want.stale}（stale 是读数：stored ≠ derived 时为 true）`))
      if (cell.want.equalsDerived === true && header.text !== derived) {
        problems.push(problem('DASH-HEADER-TEXT', `${cell.key}：自洽的账上第一行应当正好是「目标 · 大阶段」= ${JSON.stringify(derived)}，实得 ${JSON.stringify(header.text)}`))
      }
      if (cell.want.equalsDerived === false && header.text === derived) {
        problems.push(problem('DASH-HEADER-REDERIVED', `${cell.key}：第一行又被现拼成了 ${JSON.stringify(derived)} —— 它必须原样印 headline（对照表 §8 的反向断言）`))
      }
      problems.push(...alertProblems(view, cell.key))
      if (cell.want.alert !== undefined && !(view.alerts ?? []).some((a) => String(a?.code).startsWith(cell.want.alert))) {
        problems.push(problem('DASH-HEADER-ALERT', `${cell.key}：缺报警 ${cell.want.alert}（headline 空要走红条那一格）`))
      }
    }
    rec.readings.cells = readings

    // ── 读不到（不是"没有"）⇒ `未知` + 报警，绝不是空白 ────────────────────
    const corrupt = inputFrom(readSources, 'DASH-03', 'route-corrupt', { route: 'corrupt' })
    let view
    try {
      view = dashboardOf(corrupt.input)
    } catch (err) {
      problems.push(problem('DASH-VIEW-THROWS', `route 读不出来时 dashboardOf 抛了：${String(err?.message ?? err)} —— 读不到不许炸`))
    }
    if (view !== undefined) {
      rec.readings.corrupt = { header: view.header ?? null, alerts: view.alerts ?? null }
      if (view?.header?.text !== '未知') problems.push(problem('DASH-HEADER-UNKNOWN', `route 读不出来时第一行是 ${JSON.stringify(view?.header?.text)}，应当是 「未知」（缺 ≠ 空：读不到不能印"没有目标"）`))
      problems.push(...alertProblems(view, 'route-corrupt'))
      if (!(view.alerts ?? []).some((a) => String(a?.code).startsWith('DASH-SOURCE-UNREADABLE'))) {
        problems.push(problem('DASH-HEADER-ALERT', 'route 读不出来时必须有一条 DASH-SOURCE-UNREADABLE 报警（红条那一格）'))
      }
    }

    caseFail(problems)
  })
})

test('DASH-04 五关那一格读 five_gate_state，9 值闭集；阶段名冒充不了它', async () => {
  await runCase('DASH-04', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const mod = await loadDashboard()
    if (!mod.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${mod.file}（${mod.reason}）`))
      caseFail(problems)
    }
    const { dashboardOf } = mod.mod
    if (typeof dashboardOf !== 'function') {
      problems.push(problem('DASH-VIEW-MISSING', 'dashboardOf 必须是函数（契约 §1 导出 #2）'))
      caseFail(problems)
    }
    const readSources = readerOf(mod, problems)
    if (readSources === null) caseFail(problems)

    const task = routeFixture().tasks[0]
    const withTask = (patch) => routeFixture({ tasks: [{ ...task, ...patch }] })
    const cells = [
      { key: 'A-正常', route: withTask({ five_gate_state: '契约与测试' }), want: '契约与测试' },
      // 陷阱：**大阶段名就是某个五关词**。印阶段名会得到 `独立评审`，读 five_gate_state 才会得到 `契约与测试`。
      {
        key: 'B-阶段名=五关词',
        route: routeFixture({
          stages: [{ id: 'stage-demo', name: '独立评审', order: 1, state: 'current', boss_gate: 'none', exit_criteria: [], kind: 'build' }],
          tasks: [{ ...task, five_gate_state: '契约与测试' }],
          headline: '演示目标 · 独立评审',
        }),
        want: '契约与测试',
      },
      { key: 'C-null', route: withTask({ five_gate_state: null }), want: '不适用' },
      { key: 'D-并集同义词', route: withTask({ five_gate_state: '方案' }), want: '方案' },
      { key: 'E-闭集外', route: withTask({ five_gate_state: '思考中' }), want: '不适用', alert: 'DASH-GATE-INVALID' },
    ]
    const readings = []
    for (const cell of cells) {
      const { input } = inputFrom(readSources, 'DASH-04', cell.key, { route: cell.route })
      let view
      try {
        view = dashboardOf(input)
      } catch (err) {
        problems.push(problem('DASH-VIEW-THROWS', `${cell.key}：dashboardOf 抛了：${String(err?.message ?? err)}`))
        continue
      }
      const main = view?.main ?? null
      readings.push({ key: cell.key, main })
      if (main === null) {
        problems.push(problem('DASH-MAIN-MISSING', `${cell.key}：有当前任务却读不到 main（契约 §3：main={taskId,title,gate,note}）`))
        continue
      }
      if (main.gate !== cell.want) problems.push(problem('DASH-GATE-VALUE', `${cell.key}：五关那一格是 ${JSON.stringify(main.gate)}，应当是 ${JSON.stringify(cell.want)}`))
      if (main.taskId !== 'task-demo-01') problems.push(problem('DASH-MAIN-TASK', `${cell.key}：main.taskId=${JSON.stringify(main.taskId)}，应当是 task-demo-01`))
      if (main.title !== '把看板做出来') problems.push(problem('DASH-MAIN-TITLE', `${cell.key}：main.title=${JSON.stringify(main.title)}，应当是任务标题`))
      const allowed = new Set([...FIVE_GATES, '不适用'])
      if (!allowed.has(main.gate)) problems.push(problem('DASH-GATE-CLOSED-SET', `${cell.key}：gate=${JSON.stringify(main.gate)} 不在 FIVE_GATES（9 值）∪ {不适用} 里 —— 闭集外的东西不许上画板`))
      problems.push(...alertProblems(view, cell.key))
      if (cell.alert !== undefined && !(view.alerts ?? []).some((a) => String(a?.code).startsWith(cell.alert))) {
        problems.push(problem('DASH-GATE-ALERT', `${cell.key}：闭集外的 five_gate_state 必须有一条 ${cell.alert}`))
      }
    }
    rec.readings.cells = readings

    // ── 没有当前任务 ⇒ main=null，且五关那个词一个都不许冒出来 ────────────────
    const { input } = inputFrom(readSources, 'DASH-04', 'no-task', { route: routeFixture({ current_task_id: null, tasks: [] }) })
    let view
    try {
      view = dashboardOf(input)
    } catch (err) {
      problems.push(problem('DASH-VIEW-THROWS', `没有当前任务时 dashboardOf 抛了：${String(err?.message ?? err)}`))
    }
    if (view !== undefined) {
      rec.readings.no_task = { main: view.main ?? null, emptyNotice: view.emptyNotice ?? null }
      if (view.main !== null) problems.push(problem('DASH-MAIN-SHAPE', `current_task_id=null 时 main 必须是 null，实得 ${JSON.stringify(view.main)}`))
      if (view.emptyNotice !== EMPTY_NOTICE) problems.push(problem('DASH-EMPTY-NOTICE', `current_task_id=null 时 emptyNotice 应当是 ${JSON.stringify(EMPTY_NOTICE)}（E20 空态），实得 ${JSON.stringify(view.emptyNotice)}`))
    }

    caseFail(problems)
  })
})

test('DASH-08 缺 / 空 / 坏：空集合写 0，缺源写未知；不崩、不空', async () => {
  await runCase('DASH-08', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const mod = await loadDashboard()
    if (!mod.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${mod.file}（${mod.reason}）`))
      caseFail(problems)
    }
    const { dashboardOf } = mod.mod
    if (typeof dashboardOf !== 'function') {
      problems.push(problem('DASH-VIEW-MISSING', 'dashboardOf 必须是函数（契约 §1 导出 #2）'))
      caseFail(problems)
    }
    const readSources = readerOf(mod, problems)
    if (readSources === null) caseFail(problems)

    /** 跑一份夹具，返回视图（顺便把"抛了"记成问题）。 */
    const viewOf = (label, sources) => {
      const { input } = inputFrom(readSources, 'DASH-08', label, sources)
      try {
        return dashboardOf(input)
      } catch (err) {
        problems.push(problem('DASH-VIEW-THROWS', `${label}：dashboardOf 抛了：${String(err?.message ?? err)} —— 少一份源就炸，等于看板比账本还脆`))
        return null
      }
    }

    /** 三格 + 第一行的通用形状检查（每个夹具都过一遍）。 */
    const shapeProblems = (label, view) => {
      const out = []
      if (view === null) return out
      out.push(...alertProblems(view, label))
      if (typeof view.header?.text !== 'string' || view.header.text.trim() === '') out.push(problem('DASH-HEADER-BLANK', `${label}：第一行是空白`))
      const debts = view.debts
      if (!Array.isArray(debts) || debts.length !== 3) {
        out.push(problem('DASH-DEBT-SHAPE', `${label}：debts 必须是恰好三格（§八.1），实得 ${Array.isArray(debts) ? debts.length : typeof debts}`))
        return out
      }
      if (debts.map((d) => d?.key).join(',') !== 'tickets,bugs,receipts') out.push(problem('DASH-DEBT-ORDER', `${label}：三格的次序/键是 ${debts.map((d) => d?.key).join(',')}，契约 §3 是 tickets,bugs,receipts`))
      for (const debt of debts) {
        if (typeof debt?.text !== 'string' || debt.text === '') out.push(problem('DASH-DEBT-BLANK', `${label}：${debt?.key} 那一格是空白 —— 定形 R5：没有就写 0，不许留空`))
        if (debt?.value !== null && !(typeof debt?.value === 'number' && debt.value >= 0)) out.push(problem('DASH-DEBT-VALUE', `${label}：${debt?.key}.value=${JSON.stringify(debt?.value)}，只能是 null 或非负数`))
        if (!['done', 'warning', 'error'].includes(debt?.state)) out.push(problem('DASH-DEBT-STATE', `${label}：${debt?.key}.state=${JSON.stringify(debt?.state)}，闭集是 done/warning/error`))
        if (debt?.value === null && debt?.state !== 'error') out.push(problem('DASH-DEBT-STATE', `${label}：${debt?.key} 读不到（value=null）却标了 ${debt?.state}（应当是 error）`))
        if (debt?.value === 0 && debt?.state !== 'done') out.push(problem('DASH-DEBT-STATE', `${label}：${debt?.key} 是 0 却标了 ${debt?.state}（应当是 done）`))
        if (typeof debt?.value === 'number' && debt.value > 0 && debt?.state !== 'warning') out.push(problem('DASH-DEBT-STATE', `${label}：${debt?.key} 欠 ${debt.value} 却标了 ${debt?.state}（应当是 warning）`))
      }
      return out
    }

    // ── ① 空但读得到 ⇒ **显式 0**（不是留空、不是"—"）────────────────────────
    const empty = viewOf('empty', {
      route: routeFixture({ current_task_id: null, tasks: [], tickets: [] }),
      bug: { schema: 1, version: 1, entries: [], archived: [] },
      local: { schema: 1, day: D, technical: { state: 'done' }, conversation: { state: 'done' } },
      update: { schema: 1, day: D, phase: 'done' },
    })
    rec.readings.empty = empty === null ? null : { header: empty.header, debts: empty.debts, main: empty.main, emptyNotice: empty.emptyNotice, badge: empty.badge }
    problems.push(...shapeProblems('empty', empty))
    if (empty !== null) {
      if (empty.header?.text !== HEADLINE) problems.push(problem('DASH-HEADER-TEXT', `empty：第一行是 ${JSON.stringify(empty.header?.text)}，应当是 ${JSON.stringify(HEADLINE)}`))
      if (empty.main !== null) problems.push(problem('DASH-MAIN-SHAPE', `empty：没有当前任务时 main 必须是 null`))
      if (empty.emptyNotice !== EMPTY_NOTICE) problems.push(problem('DASH-EMPTY-NOTICE', `empty：emptyNotice 应当是 ${JSON.stringify(EMPTY_NOTICE)}，实得 ${JSON.stringify(empty.emptyNotice)}`))
      const wants = [
        { key: 'tickets', value: 0, text: 'open 0' },
        { key: 'bugs', value: 0, text: 'open 0' },
        { key: 'receipts', value: 0, text: '缺 0 段' },
      ]
      for (const want of wants) {
        const got = (empty.debts ?? []).find((d) => d?.key === want.key)
        if (got === undefined) {
          problems.push(problem('DASH-DEBT-MISSING', `empty：缺 ${want.key} 那一格`))
          continue
        }
        if (got.value !== want.value) problems.push(problem('DASH-DEBT-ZERO', `empty：${want.key}.value=${JSON.stringify(got.value)}，应当是 0（"没有"要写成数 0，不是 null / 空串）`))
        if (got.text !== want.text) problems.push(problem('DASH-DEBT-TEXT', `empty：${want.key}.text=${JSON.stringify(got.text)}，应当是 ${JSON.stringify(want.text)}`))
        if (!/\d/.test(String(got.text))) problems.push(problem('DASH-DEBT-ZERO', `empty：${want.key}.text=${JSON.stringify(got.text)} 里没有数字 —— "没有就写 0"要的是那个 0 出现在屏幕上`))
      }
      // 徽标：相位词（§八.2），不是计数
      if (empty.badge === null || typeof empty.badge?.word !== 'string') problems.push(problem('DASH-BADGE-SHAPE', `empty：badge 应当是 {word}（§八.2 记忆相位住 span.count），实得 ${JSON.stringify(empty.badge)}`))
      else if (![...PHASES, '未知'].includes(empty.badge.word)) problems.push(problem('DASH-BADGE-WORD', `empty：badge.word=${JSON.stringify(empty.badge.word)} 不在 PHASES 闭集里`))
    }

    // ── ② 少一份源：只有那一格塌，其余格不动（四个方向各一次）────────────────
    const full = {
      route: routeFixture(),
      bug: { schema: 1, version: 2, entries: [{ id: 'bug-demo-01', kind: 'bug', disposition: null }, { id: 'bug-demo-02', kind: 'bug', disposition: 'adopted' }], archived: [] },
      local: { schema: 1, day: D, technical: { state: 'done' }, conversation: { state: 'done' } },
      update: { schema: 1, day: D, phase: 'reviewing' },
    }
    const baseline = viewOf('full-baseline', full)
    problems.push(...shapeProblems('full-baseline', baseline))
    const baselineDebts = baseline?.debts ?? []
    rec.readings.baseline = baseline === null ? null : { header: baseline.header, debts: baseline.debts, badge: baseline.badge }
    if (baseline !== null) {
      // 基线自身要是"有数"的（否则下面"其余格不动"是在两种 0 之间比，读不出东西）
      if (baselineDebts.find((d) => d?.key === 'tickets')?.value !== 2) problems.push(problem('DASH-BASELINE', `full-baseline：票按投影应当是 2（含一张 status:'done' 但没任务的票），实得 ${JSON.stringify(baselineDebts.find((d) => d?.key === 'tickets')?.value)}`))
      if (baselineDebts.find((d) => d?.key === 'bugs')?.value !== 1) problems.push(problem('DASH-BASELINE', `full-baseline：bug open 应当是 1（kind=bug 且无 disposition），实得 ${JSON.stringify(baselineDebts.find((d) => d?.key === 'bugs')?.value)}`))
      if (baselineDebts.find((d) => d?.key === 'receipts')?.value !== 0) problems.push(problem('DASH-BASELINE', `full-baseline：两段回执都 done ⇒ 缺 0 段，实得 ${JSON.stringify(baselineDebts.find((d) => d?.key === 'receipts')?.value)}`))
    }
    const singleMissing = [
      { drop: 'route', cell: 'header', expect: () => baseline?.header?.text === '未知' },
      { drop: 'bug', debt: 'bugs' },
      { drop: 'local', debt: 'receipts' },
      { drop: 'update', badgeNull: true },
    ]
    const readings = []
    for (const item of singleMissing) {
      const view = viewOf(`drop-${item.drop}`, { ...full, [item.drop]: null })
      problems.push(...shapeProblems(`drop-${item.drop}`, view))
      if (view === null) continue
      const record = { drop: item.drop, header: view.header?.text ?? null, debts: view.debts ?? null, badge: view.badge ?? null }
      readings.push(record)
      const debtOf = (key) => (view.debts ?? []).find((d) => d?.key === key) ?? null
      if (item.cell === 'header') {
        if (view.header?.text !== '未知') problems.push(problem('DASH-SOURCE-UNKNOWN', `drop-route：第一行是 ${JSON.stringify(view.header?.text)}，应当是 「未知」`))
        if (view.main !== null) problems.push(problem('DASH-SOURCE-UNKNOWN', 'drop-route：route 都读不到，main 必须是 null'))
        if (view.emptyNotice !== null) problems.push(problem('DASH-EMPTY-LIE', 'drop-route：route 读不到时不许印"本阶段没有当前任务" —— 那是"我们知道没有"，读不到是"不知道"'))
        if (debtOf('tickets')?.value !== null) problems.push(problem('DASH-SOURCE-UNKNOWN', `drop-route：票那一格也依赖 route，必须塌成 null/未知，实得 ${JSON.stringify(debtOf('tickets')?.value)}`))
      }
      if (item.debt !== undefined) {
        const target = debtOf(item.debt)
        if (target?.value !== null) problems.push(problem('DASH-SOURCE-UNKNOWN', `drop-${item.drop}：${item.debt}.value=${JSON.stringify(target?.value)}，应当是 null（缺 ≠ 空：读不到不许写 0）`))
        if (target?.text !== '未知') problems.push(problem('DASH-SOURCE-UNKNOWN', `drop-${item.drop}：${item.debt}.text=${JSON.stringify(target?.text)}，应当是 「未知」`))
      }
      // 少一份源只许塌它自己那一格（route 少 ⇒ 票那一格也跟着塌，因为票数是从 route 的票段算的）。
      const affected = item.debt ?? (item.cell === 'header' ? 'tickets' : null)
      if (affected !== null) {
        for (const other of ['tickets', 'bugs', 'receipts'].filter((k) => k !== affected)) {
          const want = baselineDebts.find((d) => d?.key === other)?.value
          const got = debtOf(other)?.value
          if (got !== want) problems.push(problem('DASH-COLLATERAL', `drop-${item.drop}：另外那一格 ${other} 从 ${JSON.stringify(want)} 变成了 ${JSON.stringify(got)} —— 少一份源不该把别的格也带塌`))
        }
      }
      if (item.badgeNull === true) {
        if (view.badge !== null) problems.push(problem('DASH-BADGE-SHAPE', `drop-update：今天的相位文件不在时 badge 应当是 null（"还没写"是正常态，不是错误），实得 ${JSON.stringify(view.badge)}`))
        if (debtOf('bugs')?.value !== baselineDebts.find((d) => d?.key === 'bugs')?.value) problems.push(problem('DASH-COLLATERAL', 'drop-update：相位文件不在不该动欠账格'))
        if (view.header?.text !== baseline?.header?.text) problems.push(problem('DASH-COLLATERAL', 'drop-update：相位文件不在不该动第一行'))
      }
    }
    rec.readings.single_missing = readings

    // ── ③ 四份全不在：不崩、五格全是未知（不是 0）、报警点名 ────────────────
    const allMissing = viewOf('all-missing', { route: null, bug: null, local: null, update: null })
    problems.push(...shapeProblems('all-missing', allMissing))
    if (allMissing !== null) {
      rec.readings.all_missing = { header: allMissing.header, debts: allMissing.debts, badge: allMissing.badge, alerts: allMissing.alerts }
      if (allMissing.header?.text !== '未知') problems.push(problem('DASH-SOURCE-UNKNOWN', 'all-missing：第一行应当是 「未知」'))
      for (const debt of allMissing.debts ?? []) {
        if (debt?.value !== null) problems.push(problem('DASH-SOURCE-UNKNOWN', `all-missing：${debt?.key}.value=${JSON.stringify(debt?.value)}，应当是 null`))
        if (debt?.text !== '未知') problems.push(problem('DASH-SOURCE-UNKNOWN', `all-missing：${debt?.key}.text=${JSON.stringify(debt?.text)}，应当是 「未知」`))
      }
      const codes = (allMissing.alerts ?? []).map((a) => String(a?.code ?? ''))
      for (const key of ['route', 'bug', 'local']) {
        if (!codes.some((c) => c === `DASH-SOURCE-MISSING:${key}`)) problems.push(problem('DASH-ALERT-MISSING', `all-missing：缺 DASH-SOURCE-MISSING:${key}（读不到要出声）`))
      }
      if (codes.some((c) => c === 'DASH-SOURCE-MISSING:update')) problems.push(problem('DASH-ALERT-EXTRA', 'all-missing：相位文件不在是**正常态**（今天还没写），不该报"源缺失"'))
    }

    // ── ④ 坏文件（半截 JSON）：与"不在"分得开 ───────────────────────────────
    const corrupt = viewOf('corrupt', { ...full, route: 'corrupt', bug: 'corrupt' })
    problems.push(...shapeProblems('corrupt', corrupt))
    if (corrupt !== null) {
      rec.readings.corrupt = { header: corrupt.header?.text ?? null, debts: corrupt.debts ?? null, alerts: corrupt.alerts ?? null }
      const codes = (corrupt.alerts ?? []).map((a) => String(a?.code ?? ''))
      if (!codes.some((c) => c === 'DASH-SOURCE-UNREADABLE:route')) problems.push(problem('DASH-ALERT-MISSING', 'corrupt：route 是半截 JSON，必须报 DASH-SOURCE-UNREADABLE:route（"读不出来"与"不在"是两个诊断）'))
      if (!codes.some((c) => c === 'DASH-SOURCE-UNREADABLE:bug')) problems.push(problem('DASH-ALERT-MISSING', 'corrupt：bug 是半截 JSON，必须报 DASH-SOURCE-UNREADABLE:bug'))
      if (codes.some((c) => c.startsWith('DASH-SOURCE-MISSING'))) problems.push(problem('DASH-ALERT-DIAGNOSIS', 'corrupt：文件在盘上却报了"缺源" —— 两种诊断塌成了一种'))
    }

    caseFail(problems)
  })
})
