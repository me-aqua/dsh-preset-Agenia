/**
 * `DASH-11` / `DASH-12` —— 客户端看板**数据链的端到端**（第 2 关重开，2026-11-04）。
 *
 * 为什么会有这两格（第 4 关独立评审 `🟠 打回·修`，`.team/review/2026-11-04/评审报告.md`）：
 *   · 评审 `F2`：**端到端零证据** —— `.runtime/state/dashboard/view.json` 不在盘上，
 *     而浏览器侧只读这份文件；Node 那半边（`lib/index.js` 的 15 秒刷新）**一条测试都没有**。
 *   · 评审 `F3`：**陈旧读数当当下** —— `latestUpdateDay()` 取"最近一天有相位文件的日期"，
 *     徽标与回执读的是那一天；`view.day` 从来不画；契约 §3.4「当天文件不在 ⇒ badge=null」那一支
 *     在生产路径上**不可达**。
 *
 * 两格的分工（别混着读）：
 *   · `DASH-11` **机制**：真跑 `lib/index.js` 的 `apply()`（真子进程 + 假 ctx），判它
 *     **原子写**（`<file>.tmp` → rename；写到一半崩掉不许留下半份**活文件**）、
 *     **文档形状**（契约 §3 那八个键，一个不多一个不少）、**第二次跑会覆盖**；
 *     再判渲染层**只读这一份文件**（快照路径两半同源、不碰四份账本、不自己算），
 *     以及 **读盘失败不许把组件带走**（见下面那条 🔴）。
 *     🔴 **今天这一格在机制上是绿的**（原子写早就在 `writeDashboardSnapshot` 里）—— 它补的是
 *     **证据洞**，不是首跑红。它红的形态由下面两把刀给出：直接写活文件 / 快照路径两半漂了。
 *   · `DASH-12` **日身份**：`view.day` = **今天这个周期日**（`lib/route.mjs::dayKeyOf` 的 04:00 切点，
 *     与全系统同一把尺子）；画面上要**看得到 day**；当天相位文件不在、只有旧的那一份时，
 *     徽标必须是 `null` / `未知`，**不许**把旧相位词当今天显示。
 *     🔴 **红读数在冻结评审副本上**：`latestUpdateDay` 那个实现就是"退回最近一天"的那把刀本身
 *     （`_runs/zof-dash-redonfrozen-final-2253`）。⚠️ 写这格时 dev 正在并发改 `presets/**`
 *     （22:19–22:20 把日键改成了 `dayKeyOf(now)`）⇒ 现役树上的读数会变绿；**红只能绑在不变的树上**。
 *
 * 🔴 **2026-11-06 重写了两腿**（老板报障：点「看板」，按钮自己消失、面板一个字都不留）：
 *   · **读调用那一条**：旧断言是 `/workspaceFiles\.read\s*\(\s*sessionId\s*,\s*SNAPSHOT_PATH/` ——
 *     一个**文本形状**。为了让同步抛变成一条 rejected promise，实现改成先取服务
 *     （`const svc = ctx.remote && ctx.remote.workspaceFiles`）再 `svc.read(...)`，这句就红在
 *     `DASH11-SNAPSHOT-PATH-DRIFT` 上 —— 红因说的是"路径漂了"，其实路径一个字都没动。
 *     现在改成**两位读者**：① 源码里那个 `SNAPSHOT_PATH` 字面量 = `DASHBOARD_SNAPSHOT_REL`（静态）；
 *     ② **真装 `client.js`、真点一次**，把 `read` 被调用时的实参抓下来（行为）—— 第二读者比字面量比对硬：
 *     它认的是**运行时真的传了什么**，不是"文件里有没有那句话"。
 *   · **新的一腿「读盘失败只画红条」**：`readSnapshot` 在"服务不在 / 同步抛 / 返回 rejected"三种情形下
 *     都必须是**一条 rejected promise**（不是同步抛），组件必须**还画得出按钮**并多出一条 `role="alert"`
 *     的错误条，条上带的是**那一条原因**。这一腿的红形态由**故障那一版的真字节**（`d586215^`）给出。
 *     载具见 `support/dash-client-harness.mjs`（假 React 的边界写在那份文件的文件头）。
 *     🔴 **红基线**（2026-11-06 实测）：把 `d586215^` 那一版当 SUT 跑这一格 ⇒ **8 项** =
 *     四个失败现场 ×（`DASH11-CLIENT-THREW` + `DASH11-CLIENT-NO-ERROR-STATE`）；
 *     `read返回rejected` 那一格**不红**（旧代码在"服务已经把失败变成 rejected"这一支本来就是对的 ——
 *     真故障是**同步抛**）。读数 `_runs/marta-red-on-defect-sut/run7`。
 *     ⚠️ 两把变异刀切的是**活树**那一份（`LIVE_CLIENT`），不是 SUT —— 见那个常量旁边的注释。
 *
 * 两条纪律：
 *   · 夹具**只落在运行根里**（`<run-root>/fixtures/…`，运行根在 E: 盘；C 盘一个字节都不写）。
 *   · 插件跑的是**真** `presets/agenia/client-ui-dashboard/lib/index.js`（`AGENIA_DASH_CLIENT`
 *     指到别处时跑那一棵树 —— 那一跑会在 `DASH-SUT-OVERRIDE` 下记 HOLD，只当对照/刀用）。
 */
import { before, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { caseFail, caseHold, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { createDashboardHarness, messageOf, preFailureClientSource } from '../support/dash-client-harness.mjs'
import { PATHS } from '../support/env.mjs'
import {
  DASH_CLIENT,
  bugFixture,
  loadDashboard,
  localFixture,
  matchBracket,
  routeFixture,
  stripCommentLines,
  noteSutOverride,
} from '../support/dashboard-surface.mjs'
import { dayKeyOf } from '../../../presets/agenia/lib/route.mjs'

before(() => {
  preflight()
})

/** 端到端载具（真子进程；见文件头）。 */
const RUNNER = path.join(PATHS.testRoot, 'fixtures', 'dash-snapshot-runner.mjs')
/** 与 `DASH_CLIENT` 同一个包的 Node 半边。 */
const pluginIndexOf = () => path.join(path.dirname(DASH_CLIENT), 'index.js')
/**
 * **活树**那一份渲染层。
 *
 * 刀切的是**它**，不是 `DASH_CLIENT`：`DASH_CLIENT` 可能是只读副本里的另一版（`AGENIA_DASH_CLIENT`），
 * 拿刀去切 SUT 会在"跑副本"那种跑法里切出一堆假红（"刀没切动源码" / 向量里多出 `THREW`），
 * 而红因说的是判据坏了、不是副本坏了（2026-11-06 实测：`_runs/marta-red-on-defect-sut/run6`）。
 * 判据量 SUT，刀证明尺子 —— 两件事分开。
 */
const LIVE_CLIENT = path.join(PATHS.repo, 'presets', 'agenia', 'client-ui-dashboard', 'lib', 'client.js')
const SUT_IS_COPY = DASH_CLIENT !== LIVE_CLIENT

// ── 夹具（只写运行根）───────────────────────────────────────────────────────
/** 每一个现场一个目录；**拒绝 C 盘 / 拒绝跑出运行根**（与 `root-guard` 同一条纪律）。 */
function workspaceOf(caseId, purpose) {
  const dir = path.join(runRoot(), 'fixtures', `${String(caseId).toLowerCase()}-${purpose}`)
  const abs = path.resolve(dir)
  const root = path.parse(abs).root
  if (/^[a-zA-Z]:/.test(root) && root.toUpperCase().startsWith('C:')) {
    throw new Error(`夹具落点在 C 盘（${abs}）—— 全组硬约束：C 盘一个字节都不许写`)
  }
  if (!abs.toLowerCase().startsWith(path.resolve(runRoot()).toLowerCase())) {
    throw new Error(`夹具落点跑出了运行根：${abs} ⊄ ${runRoot()}`)
  }
  mkdirSync(abs, { recursive: true })
  return abs
}

const writeJsonAt = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/**
 * 按**生产落点**写一个工作区（不是 `writeSources` 那种"直接喂读者"的四条路径）：
 *   · `.team/route/current.json` · `.team/bug/ledger.json`
 *   · `.team/state/local/<day>.json` · `presets/agenia/.runtime/state/update/<day>.json`
 *
 * @param {string} ws
 * @param {{route?:object, bug?:object, localDays?:Record<string,object>, updateDays?:Record<string,object>}} spec
 */
function seedWorkspace(ws, { route = routeFixture(), bug = bugFixture(), localDays = {}, updateDays = {} } = {}) {
  writeJsonAt(path.join(ws, '.team', 'route', 'current.json'), route)
  writeJsonAt(path.join(ws, '.team', 'bug', 'ledger.json'), bug)
  for (const [day, value] of Object.entries(localDays)) {
    writeJsonAt(path.join(ws, '.team', 'state', 'local', `${day}.json`), value)
  }
  for (const [day, value] of Object.entries(updateDays)) {
    writeJsonAt(path.join(ws, 'presets', 'agenia', '.runtime', 'state', 'update', `${day}.json`), value)
  }
}

/** 注入时钟文件（`AGENIA_NOW_FILE`；生产侧 `lib/clock.mjs::now()` 读它）。 */
function clockFileOf(ws, iso) {
  const file = path.join(ws, 'clock.txt')
  writeFileSync(file, `${iso}\n`, 'utf8')
  return file
}

/** 快照文件在某个工作区里的绝对路径（`DASHBOARD_SNAPSHOT_REL` 是工作区相对路径）。 */
function snapshotOf(ws, rel) {
  return path.join(ws, ...String(rel).split('/'))
}

/** 读一份文件的三种读数：在不在 / 字节 / 解析得出来的值。 */
function fileState(file) {
  if (!existsSync(file)) return { exists: false, bytes: 0, text: null, json: null }
  const text = readFileSync(file, 'utf8')
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { exists: true, bytes: statSync(file).size, text, json }
}

/**
 * 真跑一次插件（`apply(ctx, {root})`），返回子进程读数 + 落盘 payload。
 * @param {{pluginIndex:string, ws:string, mode?:'normal'|'crash-mid-write', clockFile?:string|null}} args
 */
function runPlugin({ pluginIndex, ws, mode = 'normal', clockFile = null }) {
  const env = {
    ...process.env,
    TEMP: path.join(runRoot(), 'tmp'),
    TMP: path.join(runRoot(), 'tmp'),
  }
  if (clockFile !== null) env.AGENIA_NOW_FILE = clockFile
  else delete env.AGENIA_NOW_FILE
  const r = spawnSync(process.execPath, [RUNNER, pluginIndex, ws, mode, clockFile ?? ''], {
    cwd: PATHS.repo,
    env,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const stdout = String(r.stdout ?? '')
  const line = stdout.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith('{')).pop() ?? null
  let payload = null
  try {
    payload = line === null ? null : JSON.parse(line)
  } catch {
    payload = null
  }
  return { status: r.status, signal: r.signal ?? null, stderr: String(r.stderr ?? '').slice(-2000), payload }
}

// ── 视图形状（契约 §3）──────────────────────────────────────────────────────
const VIEW_KEYS = ['alerts', 'badge', 'day', 'debts', 'emptyNotice', 'header', 'main', 'schema']
const HEADER_KEYS = ['empty', 'stale', 'text']
const MAIN_KEYS = ['gate', 'note', 'taskId', 'title']
const DEBT_KEYS = ['key', 'label', 'state', 'text', 'value']
const SHAPE_CODES = {
  shape: 'DASH11-SNAPSHOT-SHAPE',
  tmp: 'DASH11-NO-TMP-RENAME',
  nonatomic: 'DASH11-NONATOMIC-WRITE',
  path: 'DASH11-SNAPSHOT-PATH-DRIFT',
  half: 'DASH11-HALF-LIVE-FILE',
  harness: 'DASH11-CRASH-HARNESS',
  writes: 'DASH11-LEDGER-TOUCHED',
}

/** 契约 §3 的形状（**恰好这些键**；多一个键就是没进契约的新形状）。 */
function viewShapeProblems(view, where) {
  const problems = []
  if (view === null || typeof view !== 'object' || Array.isArray(view)) {
    return [problem(SHAPE_CODES.shape, `${where}：快照不是对象（${JSON.stringify(view)?.slice(0, 80)}）`)]
  }
  const keys = Object.keys(view).sort()
  if (keys.join(',') !== VIEW_KEYS.join(',')) {
    problems.push(problem(SHAPE_CODES.shape, `${where}：快照的键是 ${keys.join(',')}，契约 §3 是 ${VIEW_KEYS.join(',')}（多/少一个键都不是那一份文档）`))
  }
  if (view.schema !== 1) problems.push(problem(SHAPE_CODES.shape, `${where}：schema=${JSON.stringify(view.schema)}，契约 §3 是 1`))
  if (view.day !== null && typeof view.day !== 'string') problems.push(problem(SHAPE_CODES.shape, `${where}：day=${JSON.stringify(view.day)}，只能是字符串或 null`))
  if (view.header === null || typeof view.header !== 'object' || Object.keys(view.header).sort().join(',') !== HEADER_KEYS.join(',')) {
    problems.push(problem(SHAPE_CODES.shape, `${where}：header 不是 {text,empty,stale}`))
  } else if (typeof view.header.text !== 'string' || view.header.text.trim() === '') {
    problems.push(problem(SHAPE_CODES.shape, `${where}：header.text 是空白（定形 R5：第一行不许留空）`))
  }
  if (view.badge !== null && (typeof view.badge !== 'object' || Object.keys(view.badge).join(',') !== 'word' || typeof view.badge.word !== 'string')) {
    problems.push(problem(SHAPE_CODES.shape, `${where}：badge 不是 null 或 {word}`))
  }
  if (view.main !== null && (typeof view.main !== 'object' || Object.keys(view.main).sort().join(',') !== MAIN_KEYS.join(','))) {
    problems.push(problem(SHAPE_CODES.shape, `${where}：main 不是 null 或 {taskId,title,gate,note}`))
  }
  if (!Array.isArray(view.debts) || view.debts.length !== 3) {
    problems.push(problem(SHAPE_CODES.shape, `${where}：debts 不是恰好三格`))
  } else {
    if (view.debts.map((d) => d?.key).join(',') !== 'tickets,bugs,receipts') problems.push(problem(SHAPE_CODES.shape, `${where}：三格次序不是 tickets,bugs,receipts`))
    for (const debt of view.debts) {
      if (Object.keys(debt ?? {}).sort().join(',') !== DEBT_KEYS.join(',')) problems.push(problem(SHAPE_CODES.shape, `${where}：${debt?.key} 那一格不是 {key,label,value,text,state}`))
    }
  }
  if (!Array.isArray(view.alerts)) problems.push(problem(SHAPE_CODES.shape, `${where}：alerts 不是数组`))
  else {
    for (const alert of view.alerts) {
      if (typeof alert?.code !== 'string' || typeof alert?.message !== 'string') problems.push(problem(SHAPE_CODES.shape, `${where}：alerts 里有一条不是 {code,message}`))
    }
  }
  return problems
}

// ── 原子写机制（源码那一半；行为那一半在下面的 crash 现场）──────────────────
/**
 * `writeDashboardSnapshot` 的机制：**中间名 + rename**，且不许直接写活文件。
 * 这是"崩在中间"那一格的第二读者（第一读者是 crash 现场）：源码改了名字/换了写法，
 * 这条会点名；行为上真崩了，crash 现场会点名。
 */
function atomicMechanismProblems(source) {
  const code = stripCommentLines(source)
  const problems = []
  const decl = /const\s+([A-Za-z_$][\w$]*)\s*=\s*`\$\{outFile\}\.tmp`/.exec(code)
  const tmpName = decl === null ? null : decl[1]
  if (tmpName === null) {
    problems.push(problem(SHAPE_CODES.tmp, '没有 `<outFile>.tmp` 这个中间名 —— 快照的写盘没有"先写旁边再换名"的形状'))
  } else {
    const writeTmp = new RegExp(`writeFileSync\\s*\\(\\s*${tmpName}\\s*,`).exec(code)
    const rename = new RegExp(`renameSync\\s*\\(\\s*${tmpName}\\s*,\\s*outFile\\s*\\)`).exec(code)
    if (writeTmp === null) problems.push(problem(SHAPE_CODES.tmp, `没有先写中间文件 ${tmpName}`))
    if (rename === null) problems.push(problem(SHAPE_CODES.tmp, `没有 renameSync(${tmpName}, outFile) —— 中间文件写完没有换到活路径上`))
    if (writeTmp !== null && rename !== null && writeTmp.index > rename.index) {
      problems.push(problem(SHAPE_CODES.tmp, '先 rename 再写中间文件 —— 换名换的是上一份'))
    }
  }
  if (/writeFileSync\s*\(\s*outFile\b/.test(code)) {
    problems.push(problem(SHAPE_CODES.nonatomic, '直接 `writeFileSync(outFile, …)` 写活文件 —— 写到一半崩掉，读的人会看到半份 JSON'))
  }
  return problems
}

/** 把一份源码里的某个函数体换掉（刀用；只改**副本**）。 */
function replaceFunctionBody(source, name, body) {
  const at = source.indexOf(`export function ${name}(`)
  if (at < 0) return null
  const open = source.indexOf('{', at)
  if (open < 0) return null
  const close = matchBracket(source, open)
  if (close < 0) return null
  return `${source.slice(0, open)}{\n${body}\n}${source.slice(close + 1)}`
}

/**
 * "崩在写盘中间之后"的判据（纯函数）——**这一格的核心**。
 *
 * 现场：上一次完整快照 `before` 在盘上；这一次写到一半进程没了。
 * 原子写 ⇒ 活文件**逐字不变**（中间名 `.tmp` 里躺着半份）；
 * 直接写活文件 ⇒ 活文件变成**半份**（解析不了）。
 *
 * @param {{before:{exists:boolean,text:string|null}, after:{exists:boolean,text:string|null,json:unknown},
 *          tmp:{exists:boolean,json:unknown}}} state
 */
function crashAftermathProblems({ before, after, tmp }) {
  const problems = []
  if (!tmp.exists) {
    return [problem(SHAPE_CODES.harness, '现场里没有中间文件 —— 这个现场认不出实现写的是活文件还是中间文件')]
  }
  if (tmp.json !== null) {
    return [problem(SHAPE_CODES.harness, '中间文件是**完整**的 JSON —— 崩溃点没落在写盘中间，这一格判不了')]
  }
  if (!after.exists) return [problem('DASH11-LIVE-GONE', '崩在写盘中间之后，活文件**不见了** —— 读的人从"旧读数"变成"没有读数"')]
  if (after.text !== before.text) return [problem(SHAPE_CODES.half, '崩在写盘中间之后，活文件的内容变了（不再是崩之前那一份完整快照）—— 原子写没成立：读的人会读到半份 JSON')]
  if (after.json === null) return [problem(SHAPE_CODES.half, '崩在写盘中间之后，活文件解析不了 —— 它是半份')]
  return problems
}

/** 刀：把 `writeDashboardSnapshot` 换成"直接写活文件"（**只改内存里的字符串**，盘上什么都不动）。 */
function nonAtomicSource(source) {
  const mutated = replaceFunctionBody(source, 'writeDashboardSnapshot', [
    '  const view = dashboardOf(input)',
    '  const text = `${JSON.stringify(view)}\\n`',
    '  mkdirSync(path.dirname(outFile), { recursive: true })',
    '  writeFileSync(outFile, text, "utf8")',
    '  return { file: outFile, bytes: Buffer.byteLength(text, "utf8") }',
  ].join('\n'))
  return mutated
}

// ── `DASH-11` ───────────────────────────────────────────────────────────────
const DAY = '2026-11-04'
const CLOCK_NOON = '2026-11-04T12:00:00+08:00'

test('DASH-11 Node 半边端到端：apply() 落 view.json（原子/形状/覆盖）+ 渲染层只读那一份 + 读盘失败只画红条、不许把组件带走', async () => {
  await runCase('DASH-11', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const pluginIndex = pluginIndexOf()
    const loaded = await loadDashboard()
    rec.readings.module = { file: loaded.file, ok: loaded.ok, reason: loaded.reason }
    if (!loaded.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${loaded.file}（${loaded.reason}）`))
      caseFail(problems)
    }
    const rel = loaded.mod.DASHBOARD_SNAPSHOT_REL
    if (typeof rel !== 'string' || rel === '') {
      problems.push(problem(SHAPE_CODES.path, '数据层没有导出 `DASHBOARD_SNAPSHOT_REL`（渲染层读哪个文件就无从对账）'))
      caseFail(problems)
    }
    if (!existsSync(pluginIndex)) {
      problems.push(problem('DASH11-PLUGIN-MISSING', `Node 半边不在盘上：${pluginIndex}`))
      caseFail(problems)
    }

    // ① 正常跑一次：文件出现、形状对、没有残留 .tmp
    const ws = workspaceOf('DASH-11', 'happy')
    seedWorkspace(ws, {
      route: routeFixture({ headline: '演示目标 · 执行一 · 演示' }),
      bug: bugFixture(),
      localDays: { [DAY]: localFixture({ day: DAY, technical: { state: 'done' }, conversation: { state: 'running' } }) },
      updateDays: { [DAY]: { schema: 1, day: DAY, generation: 1, phase: 'done', updated_at: `${DAY}T09:00:00+08:00` } },
    })
    const clock = clockFileOf(ws, CLOCK_NOON)
    const first = runPlugin({ pluginIndex, ws, clockFile: clock })
    rec.readings.run1 = first
    if (first.status !== 0) problems.push(problem('DASH11-RUN-FAILED', `子进程退出码 ${first.status}（stderr 尾：${first.stderr.slice(-400)}）`))
    const snap = snapshotOf(ws, rel)
    const tmp = `${snap}.tmp`
    const firstFile = fileState(snap)
    rec.readings.snapshot = { file: snap, exists: firstFile.exists, bytes: firstFile.bytes, tmp_exists: existsSync(tmp) }
    if (!firstFile.exists) {
      problems.push(problem('DASH11-SNAPSHOT-MISSING', `跑完一次之后 ${rel} 不在盘上 —— 渲染层读的就是这一份，它不在则面板只能画错误条`))
      caseFail(problems)
    }
    if (existsSync(tmp)) problems.push(problem(SHAPE_CODES.tmp, `正常跑完之后还留着 ${path.basename(tmp)} —— 中间文件没有收掉`))
    problems.push(...viewShapeProblems(firstFile.json, 'happy'))
    if (firstFile.json?.header?.text !== '演示目标 · 执行一 · 演示') problems.push(problem(SHAPE_CODES.shape, `happy：快照里的第一行是 ${JSON.stringify(firstFile.json?.header?.text)}，应当是账本 headline 原样`))
    if (firstFile.json?.day !== DAY) problems.push(problem('DASH-DAY-NOT-TODAY', `happy：快照的 day 是 ${JSON.stringify(firstFile.json?.day)}，应当是注入时钟那一天的周期日 ${DAY}`))

    // ② 第二次跑：换掉 headline，快照必须被**覆盖**（不是留着上一份）
    seedWorkspace(ws, {
      route: routeFixture({ headline: '改过的目标 · 执行一 · 演示' }),
      localDays: { [DAY]: localFixture({ day: DAY, technical: { state: 'done' }, conversation: { state: 'running' } }) },
      updateDays: { [DAY]: { schema: 1, day: DAY, generation: 1, phase: 'done', updated_at: `${DAY}T09:00:00+08:00` } },
    })
    const second = runPlugin({ pluginIndex, ws, clockFile: clock })
    const secondFile = fileState(snap)
    rec.readings.run2 = { status: second.status, bytes: secondFile.bytes, header: secondFile.json?.header?.text ?? null }
    if (second.status !== 0) problems.push(problem('DASH11-RUN-FAILED', `第二次跑退出码 ${second.status}`))
    if (!secondFile.exists) problems.push(problem('DASH11-SNAPSHOT-MISSING', '第二次跑之后快照不见了'))
    else {
      if (secondFile.json?.header?.text !== '改过的目标 · 执行一 · 演示') {
        problems.push(problem('DASH11-NOT-OVERWRITTEN', `第二次跑之后第一行仍是 ${JSON.stringify(secondFile.json?.header?.text)} —— 快照没有覆盖（15 秒刷新会一直显示旧读数）`))
      }
      if (existsSync(tmp)) problems.push(problem(SHAPE_CODES.tmp, '第二次跑之后还留着 .tmp'))
    }

    // ③ crash 现场：写盘写到一半"进程没了" —— 活文件一个字都不许变
    const crashWs = workspaceOf('DASH-11', 'crash')
    seedWorkspace(crashWs, {
      route: routeFixture({ headline: '崩溃前那一份 · 执行一 · 演示' }),
      localDays: { [DAY]: localFixture({ day: DAY, technical: { state: 'done' }, conversation: { state: 'done' } }) },
      updateDays: { [DAY]: { schema: 1, day: DAY, generation: 1, phase: 'done', updated_at: `${DAY}T09:00:00+08:00` } },
    })
    const crashClock = clockFileOf(crashWs, CLOCK_NOON)
    const seedRun = runPlugin({ pluginIndex, ws: crashWs, clockFile: crashClock })
    const crashSnap = snapshotOf(crashWs, rel)
    const beforeCrash = fileState(crashSnap)
    /** crash 那一刻 `.tmp` 里的半份文本（**在恢复跑之前**抓住 —— 恢复会把 `.tmp` 收掉）。 */
    let crashHalfText = null
    if (!beforeCrash.exists) {
      problems.push(problem(SHAPE_CODES.harness, 'crash 现场的前置没成立：种下去的那一份快照没写出来 —— 这一格判不了"崩了之后旧文件还在不在"'))
    } else {
      // 换一份 headline，再让它崩在写盘中间
      seedWorkspace(crashWs, {
        route: routeFixture({ headline: '崩溃那一次的新内容 · 执行一 · 演示' }),
        localDays: { [DAY]: localFixture({ day: DAY, technical: { state: 'done' }, conversation: { state: 'done' } }) },
        updateDays: { [DAY]: { schema: 1, day: DAY, generation: 1, phase: 'done', updated_at: `${DAY}T09:00:00+08:00` } },
      })
      const crash = runPlugin({ pluginIndex, ws: crashWs, mode: 'crash-mid-write', clockFile: crashClock })
      const after = fileState(crashSnap)
      const tmpAfter = fileState(`${crashSnap}.tmp`)
      crashHalfText = tmpAfter.text
      rec.readings.crash = {
        phase: crash.payload?.phase ?? null,
        message: crash.payload?.message ?? null,
        warnings: crash.payload?.warnings ?? null,
        live_exists: after.exists,
        live_bytes: after.bytes,
        live_parseable: after.json !== null,
        tmp_exists: tmpAfter.exists,
        tmp_parseable: tmpAfter.json !== null,
      }
      // 量具自证：崩必须真的发生过（否则"活文件没变"可能只是"根本没写到那一步"）
      const crashHappened = (crash.payload?.phase === 'apply-threw' && String(crash.payload?.message ?? '').includes('SIMULATED-CRASH-MID-WRITE'))
        || (crash.payload?.warnings ?? []).some((w) => String(w).includes('SIMULATED-CRASH-MID-WRITE'))
      if (!crashHappened) {
        problems.push(problem(SHAPE_CODES.harness, `模拟崩溃没有发生（phase=${JSON.stringify(crash.payload?.phase)} · message=${JSON.stringify(crash.payload?.message)}）—— 这一格判不了，别把它记成绿`))
      } else {
        problems.push(...crashAftermathProblems({ before: beforeCrash, after, tmp: tmpAfter }))
      }
      // 恢复：下一拍能自己收干净
      const recovered = runPlugin({ pluginIndex, ws: crashWs, clockFile: crashClock })
      const recoveredFile = fileState(crashSnap)
      rec.readings.recovery = { status: recovered.status, header: recoveredFile.json?.header?.text ?? null, tmp_exists: existsSync(`${crashSnap}.tmp`) }
      if (recovered.status !== 0 || recoveredFile.json === null) problems.push(problem('DASH11-RECOVERY', '崩过之后再跑一次仍然写不出可解析的快照 —— 这个文件坏了就再也回不来'))
      else if (recoveredFile.json?.header?.text !== '崩溃那一次的新内容 · 执行一 · 演示') problems.push(problem('DASH11-RECOVERY', '崩过之后再跑一次，快照内容不是新的那一份'))
      if (existsSync(`${crashSnap}.tmp`)) problems.push(problem(SHAPE_CODES.tmp, '崩过之后再跑一次，中间文件还留着'))
    }

    // ④ 源码机制（第二读者；crash 现场是行为那一半）
    const dashboardSource = readFileSync(loaded.file, 'utf8')
    const mechanism = atomicMechanismProblems(dashboardSource)
    rec.readings.mechanism = mechanism
    for (const p of mechanism) problems.push(p)

    // ⑤ 两把刀（只改内存里的字符串，盘上一个字节都不动）
    //   刀 A：原子写换成"直接写活文件" ⇒ 机制判据必须点名 NONATOMIC。
    const knifeSource = nonAtomicSource(dashboardSource)
    if (knifeSource === null) {
      problems.push(problem(SHAPE_CODES.harness, '刀 A 没切动：`writeDashboardSnapshot` 的函数体没找到'))
    } else {
      const knifeMechanism = atomicMechanismProblems(knifeSource)
      rec.readings.knife_mechanism = knifeMechanism
      if (!knifeMechanism.some((p) => p.code === SHAPE_CODES.nonatomic)) {
        problems.push(problem('DASH-KNIFE-VECTOR', `刀 A（直接写活文件）没有被机制判据抓到（实得 ${JSON.stringify(knifeMechanism.map((p) => p.code))}）`))
      }
    }
    //   刀 B：把"崩在写盘中间"之后的**直接写**现场喂给 aftermath 判据 ⇒ 必须点名 HALF-LIVE-FILE。
    //        （现场不是编的：用真跑出来的那半份 `.tmp` 文本，当作"直接写进活文件"的那一半。）
    if (crashHalfText === null || crashHalfText === '') {
      problems.push(problem(SHAPE_CODES.harness, '刀 B 的前提丢了：crash 现场没有留下那半份文本'))
    } else {
      const synthetic = crashAftermathProblems({
        before: { exists: true, text: '<旧的完整快照>' },
        after: { exists: true, text: crashHalfText, json: null },
        tmp: { exists: true, json: null },
      })
      rec.readings.knife_aftermath = synthetic.map((p) => p.code)
      if (!synthetic.some((p) => p.code === SHAPE_CODES.half)) {
        problems.push(problem('DASH-KNIFE-VECTOR', `刀 B（半份活文件）没有被 aftermath 判据抓到（实得 ${JSON.stringify(synthetic.map((p) => p.code))}）—— 这一格分不开"原子写"与"直接写"`))
      }
    }

    // ⑥ 渲染层只读这一份文件（快照路径两半同源；不碰四份账本；不自己算）
    const clientSource = readFileSync(DASH_CLIENT, 'utf8')
    const clientCode = stripCommentLines(clientSource)
    const snapshotPath = /const\s+SNAPSHOT_PATH\s*=\s*["']([^"']+)["']/.exec(clientSource)
    rec.readings.renderer = { snapshot_path: snapshotPath === null ? null : snapshotPath[1], module_rel: rel }
    if (snapshotPath === null) {
      problems.push(problem(SHAPE_CODES.path, '渲染层里没有 `const SNAPSHOT_PATH = "…"` —— 它读哪个文件无从对账'))
    } else if (snapshotPath[1] !== rel) {
      problems.push(problem(SHAPE_CODES.path, `渲染层读 ${JSON.stringify(snapshotPath[1])}，Node 侧写 ${JSON.stringify(rel)} —— 两半写的不是同一份文件（这就是评审 §五·F2 的那个洞）`))
    }
    /**
     * 读调用这一条**不判文本形状**（`workspaceFiles.read(...)` 还是先取服务再 `svc.read(...)` 都行），
     * 判两件事实：① 引用了那条 Remote 服务（`workspaceFiles`）；② 有一个 `.read(…)` 的**前两个实参**是
     * `sessionId` + `SNAPSHOT_PATH`。真正的同源由下面 ⑦ 里那次真跑读出来（运行时实参），这条只是点得快。
     */
    const readCall = /\.\s*read\s*\(\s*sessionId\s*,\s*SNAPSHOT_PATH\b/.test(clientCode)
    const serviceMentioned = /workspaceFiles/.test(clientCode)
    rec.readings.renderer_read_call = { read_call: readCall, service_mentioned: serviceMentioned }
    if (!readCall) {
      problems.push(problem(SHAPE_CODES.path, '渲染层里没有 `.read(sessionId, SNAPSHOT_PATH, …)` 这个调用 —— 读的不是那一份快照'))
    }
    if (!serviceMentioned) {
      problems.push(problem(SHAPE_CODES.path, '渲染层里没有 `workspaceFiles` —— 它读的不是那条 Remote 服务（绕过服务读盘 = 浏览器侧根本拿不到内容）'))
    }
    if (!/JSON\.parse\s*\(\s*text\s*\)/.test(clientCode)) problems.push(problem(SHAPE_CODES.path, '渲染层没有 `JSON.parse(text)` —— 读到的是文本却没用上'))
    const ledgerHits = ['\\.team[\\\\/](route|bug|state)', 'state[\\\\/]update', 'node:fs', 'readFileSync\\s*\\(', 'openCounts\\s*\\(', 'ticketStatusOf\\s*\\(']
      .flatMap((pattern) => {
        const re = new RegExp(pattern)
        return clientCode.split(/\r?\n/).map((text, i) => ({ text: text.trim(), line: i + 1 })).filter((row) => re.test(row.text))
      })
    rec.readings.renderer_ledger_hits = ledgerHits
    if (ledgerHits.length > 0) {
      problems.push(problem(SHAPE_CODES.writes, `渲染层里出现了读账本 / 自己算的痕迹（${ledgerHits.slice(0, 3).map((h) => `L${h.line}: ${h.text}`).join(' · ')}）—— 浏览器那一半只许读那一份快照`))
    }
    // ⑦ 读盘失败只许画红条：**不许把组件带走**，也不许同步抛（2026-11-06 01:19 那个现场）
    await clientFailureLeg({ rec, clientSource, rel, problems })

    caseFail(problems)
  })
})

// ── `DASH-11` ⑦：渲染层的读盘失败路径（行为那一腿）────────────────────────────
const CLIENT_CODES = {
  unloadable: 'DASH11-CLIENT-UNLOADABLE',
  threw: 'DASH11-CLIENT-THREW',
  notPromise: 'DASH11-CLIENT-NOT-A-PROMISE',
  notRejected: 'DASH11-CLIENT-NOT-REJECTED',
  messageEmpty: 'DASH11-CLIENT-ERROR-EMPTY',
  noAlert: 'DASH11-CLIENT-NO-ERROR-STATE',
  buttonGone: 'DASH11-CLIENT-BUTTON-GONE',
  successBroken: 'DASH11-CLIENT-SUCCESS-BROKEN',
  pathDrift: 'DASH11-CLIENT-READ-PATH-DRIFT',
  knife: 'DASH11-KNIFE-VECTOR',
  knifeUnavailable: 'DASH11-KNIFE-UNAVAILABLE',
}

/** 一份最小但**合法**的视图快照（`schema` 必须是渲染层认识的那一版；内容只为让成功那一支画出来）。 */
const CLIENT_VIEW = {
  schema: 1,
  day: '2026-11-06',
  header: { text: '演示目标 · 只在快照里 · 演示', empty: false, stale: false },
  badge: null,
  main: null,
  emptyNotice: '本阶段没有当前任务',
  debts: [],
  alerts: [],
}

/**
 * "读那个服务失败了"的几种现场。**每一种都是真的**：服务不在 / 服务上没有 `read` / `read` 同步抛 /
 * `read` 返回 rejected —— 前两种是"浏览器侧没这个服务"，后两种是"服务那边坏了"。
 */
const FAILING_SERVICES = {
  没有remote: { remote: undefined, expect: null },
  没有workspaceFiles: { remote: {}, expect: null },
  read不是函数: { remote: { workspaceFiles: {} }, expect: null },
  read同步抛: {
    remote: { workspaceFiles: { read() { throw new Error('SIMULATED-SYNC-THROW') } } },
    expect: 'SIMULATED-SYNC-THROW',
  },
  read返回rejected: {
    remote: { workspaceFiles: { read: async () => { throw new Error('SIMULATED-READ-REJECTED') } } },
    expect: 'SIMULATED-READ-REJECTED',
  },
}

/**
 * 一格"失败现场"的判据（**纯函数**，一份判据三个读者：真源码 / 三把刀 / 故障那一版）。
 *
 * 每一格都要成立，缺一条就红：
 *   ① `readSnapshot(...)` **不许同步抛** —— 同步抛会被 React 当成渲染期异常，整个槽位当场拆掉
 *      （2026-11-06 01:19 的现场：点一下按钮，按钮自己消失、面板一个字都不留）；
 *   ② 它必须返回一条 **promise**，而且必须是 **rejected**（不是 resolved 一个空壳）；
 *   ③ 拒绝原因**非空** —— 红条上得有字；
 *   ④ 真点一次按钮之后：**没有抛出组件**、那个槽位的根还在、**触发器按钮还在**（`-BUTTON-GONE`）、
 *      并且多出一条 `role="alert"` 的错误条、条上的文字就是 ③ 那条原因（`-NO-ERROR-STATE`）。
 *
 * 同一个红因码只报一条（否则一把刀翻两面时向量里会出现重复码，读的人以为判据翻了两下）。
 *
 * @param {string} name 现场名（红因里点名用）
 * @param {object} got 载具读数（`harness.scene()` 的返回值）
 * @param {{expect:string|null}} spec
 * @returns {Array<{code:string,message:string}>}
 */
function failureVisitProblems(name, got, spec) {
  const messages = new Map()
  const add = (code, message) => {
    if (!messages.has(code)) messages.set(code, [])
    messages.get(code).push(message)
  }
  if (got.direct === null || got.direct === undefined) {
    return [problem(CLIENT_CODES.unloadable, `现场「${name}」：读盘路径根本没跑起来（没有「readSnapshot」）`)]
  }
  if (got.direct.threw) {
    add(CLIENT_CODES.threw, `现场「${name}」：「readSnapshot」**同步抛**了（${JSON.stringify(got.direct.message)}）—— 同步抛会被 React 当成渲染期异常，槽位整个拆掉、按钮跟着消失`)
  } else if (!got.direct.thenable) {
    add(CLIENT_CODES.notPromise, `现场「${name}」：「readSnapshot」返回的不是 promise（${JSON.stringify(got.direct.value_type)}）—— 调用方「.then/.catch」无处可挂`)
  } else if (got.direct.status !== 'rejected') {
    add(CLIENT_CODES.notRejected, `现场「${name}」：「readSnapshot」的 promise 是 ${got.direct.status}（不是 rejected）—— 失败被吞成了"读到了"`)
  } else if (String(got.direct.message ?? '').trim() === '') {
    add(CLIENT_CODES.messageEmpty, `现场「${name}」：拒绝原因是空的 —— 面板会画一条**没有字**的红条，读的人还是不知道出了什么事`)
  }
  if (spec.expect !== null && !String(got.direct.message ?? '').includes(spec.expect)) {
    add(CLIENT_CODES.notRejected, `现场「${name}」：拒绝原因里没有服务抛的那句 ${JSON.stringify(spec.expect)}（实得 ${JSON.stringify(got.direct.message)}）—— 原因在传递中被换掉了`)
  }
  if (got.throws.length > 0) {
    add(CLIENT_CODES.threw, `现场「${name}」：点一次按钮的过程中抛出了 ${JSON.stringify(got.throws)} —— 在 React 里这就是"槽位被拆掉"`)
  }
  if (!got.root_present || !got.trigger_present) {
    add(CLIENT_CODES.buttonGone, `现场「${name}」：失败之后那个槽位的根 / 触发器不见了（root=${got.root_present} · trigger=${got.trigger_present}）—— 正是 2026-11-06 01:19 那个现场"按钮自己消失"`)
  }
  if (got.alert_text === null) {
    add(CLIENT_CODES.noAlert, `现场「${name}」：失败之后树里没有「role=alert」的错误节点 —— 面板既不画内容也不报错，等于"什么都没发生"`)
  } else if (got.direct.threw === false && String(got.direct.message ?? '').trim() !== '' && !got.alert_text.includes(String(got.direct.message))) {
    add(CLIENT_CODES.noAlert, `现场「${name}」：红条上的字是 ${JSON.stringify(got.alert_text)}，不是那条拒绝原因 ${JSON.stringify(got.direct.message)} —— 读者分不出"服务不在"和"文件读坏了"`)
  }
  return [...messages.entries()].map(([code, list]) => problem(code, list.join(' · ')))
}

/**
 * `DASH-11` 的那一腿：**读盘失败必须变成错误态，而且不许把组件带走**。
 *
 * 判据是本文件上面那个 `failureVisitProblems`（纯函数）—— 三个读者，同一份判据：
 *   · **真源码**：五种失败现场（服务不在 / 没有 `workspaceFiles` / `read` 不是函数 / `read` 同步抛 /
 *     `read` 返回 rejected）逐个走一遍；
 *   · **成功那一支**的反面：`read` 返回 `{text: JSON.stringify(view)}` ⇒ 树里画得出快照里的 headline，
 *     且**没有**错误条；`read` 被调用时第二个实参必须逐字等于 `DASHBOARD_SNAPSHOT_REL`（运行时同源）；
 *   · **刀**：三条只改内存里源码的变异 + **故障那一版真字节**（`d586215^`）—— 每条都只说清一件事：
 *       刀 A `setFailure("")`（抓到了但不写原因）⇒ 只翻 `-NO-ERROR-STATE`；
 *       刀 B 失败时 `return null`（把整个槽位不画）⇒ 翻 `-NO-ERROR-STATE` + `-BUTTON-GONE`（两个都该翻：
 *            连根都没了，红条自然也没有；这一把**不是**"只翻一面"的刀，向量逐条写出来）。
 *
 * @param {{rec:object, clientSource:string, rel:string, problems:Array}} args
 */
async function clientFailureLeg({ rec, clientSource, rel, problems }) {
  const harness = createDashboardHarness(clientSource)
  rec.readings.client_harness = { ok: harness.ok, reason: harness.reason ?? null }
  if (!harness.ok) {
    problems.push(problem(CLIENT_CODES.unloadable, `渲染层装不进载具（${harness.reason}）—— 读盘失败那一路判不了，不许记绿`))
    return
  }

  /**
   * 一个现场：`read` 被调用时把实参抓下来（**运行时**同源只能在这里看）。
   * @param {unknown} remote
   * @param {{text?:string}} [reply]
   * @param {object} [on] 换一副载具（刀用；缺省就是真源码那一副）
   */
  const scene = async (remote, reply = null, on = harness) => {
    const calls = []
    const wrapped = remote === undefined || remote === null || typeof remote !== 'object'
      ? remote
      : {
          ...remote,
          ...(remote.workspaceFiles && typeof remote.workspaceFiles === 'object' && typeof remote.workspaceFiles.read === 'function'
            ? {
                workspaceFiles: {
                  ...remote.workspaceFiles,
                  read: (...args) => {
                    calls.push(args)
                    return reply === null ? remote.workspaceFiles.read(...args) : Promise.resolve({ text: reply.text })
                  },
                },
              }
            : {}),
        }
    const reading = await on.scene({ remote: wrapped })
    reading.read_calls = calls
    return reading
  }

  const failures = {}
  for (const [name, spec] of Object.entries(FAILING_SERVICES)) {
    const got = await scene(spec.remote)
    failures[name] = {
      direct: got.direct,
      throws: got.throws,
      click: got.click,
      trigger_present: got.trigger_present,
      root_present: got.root_present,
      alert_text: got.alert_text,
    }
    for (const p of failureVisitProblems(name, got, spec)) problems.push(p)
  }
  rec.readings.client_failures = failures

  // ⑤ 成功那一支：仍然解析那一份快照（`read` 的实参同源也在这一格里量）
  const happy = await scene(
    { workspaceFiles: { read: async () => ({ text: JSON.stringify(CLIENT_VIEW) }) } },
    { text: JSON.stringify(CLIENT_VIEW) },
  )
  rec.readings.client_success = {
    direct_status: happy.direct?.status ?? null,
    resolved_is_text: happy.direct?.status === 'resolved' && happy.direct.value === JSON.stringify(CLIENT_VIEW),
    throws: happy.throws,
    alert_text: happy.alert_text,
    headline_drawn: happy.texts.includes(CLIENT_VIEW.header.text),
    read_calls: happy.read_calls,
  }
  if (happy.direct === null || happy.direct.status !== 'resolved') {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场：「readSnapshot」没有 resolve 出文本（${JSON.stringify(happy.direct)}）`))
  } else if (happy.direct.value !== JSON.stringify(CLIENT_VIEW)) {
    problems.push(problem(CLIENT_CODES.successBroken, '成功现场：`readSnapshot` resolve 出来的不是 `page.text` —— 读到的正文丢了'))
  }
  if (!happy.texts.includes(CLIENT_VIEW.header.text)) {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场：快照里的 headline ${JSON.stringify(CLIENT_VIEW.header.text)} 没画出来 —— 成功路径不再「JSON.parse」那一份了（树里的文字：${JSON.stringify(happy.texts.slice(0, 8))}）`))
  }
  if (happy.alert_text !== null) {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场：画出了一条错误条（${JSON.stringify(happy.alert_text)}）—— 好读数被报成了坏读数`))
  }
  if (happy.read_calls.length === 0) {
    problems.push(problem(CLIENT_CODES.pathDrift, '成功现场：组件一次都没调用 `read` —— 那它画的东西不是从那份快照来的'))
  } else {
    const args = happy.read_calls[0]
    const where = { session: args[0], path: args[1], page: args[2] }
    rec.readings.client_read_args = where
    if (args[1] !== rel) {
      problems.push(problem(CLIENT_CODES.pathDrift, `组件读的是 ${JSON.stringify(args[1])}，Node 侧写的是 ${JSON.stringify(rel)} —— 运行时两半不是同一份文件（静态字面量对上也不算数）`))
    }
    if (args[0] !== 'session-under-test') {
      problems.push(problem(CLIENT_CODES.pathDrift, `组件读盘时第一个实参是 ${JSON.stringify(args[0])}，不是当前会话 —— 读的是别人的工作区`))
    }
    if (args[2] === null || typeof args[2] !== 'object' || args[2].offset !== 1 || args[2].limit !== 200) {
      problems.push(problem(CLIENT_CODES.pathDrift, `组件读盘的第三个实参是 ${JSON.stringify(args[2])}，应当是 {offset:1, limit:200} —— 那一份快照只读第一页`))
    }
  }

  // ── 刀：同一份判据（`failureVisitProblems`）在变异体 / 故障那一版上必须点名 ──────────────
  // 🔴 两把变异刀切的是**活树**那一份（`LIVE_CLIENT`），不是 SUT —— 见 `LIVE_CLIENT` 那一行注释。
  let liveSource = null
  try {
    liveSource = readFileSync(LIVE_CLIENT, 'utf8')
  } catch (err) {
    problems.push(problem(CLIENT_CODES.knife, `活树那一份渲染层读不出来（${LIVE_CLIENT}：${messageOf(err)}）—— 两把变异刀切不了，这一腿的"会翻面"没有证据`))
  }
  /** 把一份源码装起来，跑一个失败现场，返回**判据会报的码**（排序、去重）。 */
  const knifeVector = async (label, mutatedSource, fixtureName) => {
    const spec = FAILING_SERVICES[fixtureName]
    const knifeHarness = createDashboardHarness(mutatedSource)
    if (!knifeHarness.ok) return { label, ok: false, why: knifeHarness.reason, codes: [] }
    const got = await knifeHarness.scene({ remote: spec.remote })
    return { label, ok: true, why: null, codes: failureVisitProblems(`刀·${label}`, got, spec).map((p) => p.code).sort() }
  }
  const K = liveSource === null ? {} : {
    失败时不写原因: liveSource.replace('setFailure(String(reason && reason.message ? reason.message : reason));', 'setFailure("");'),
    失败时整个槽位不画: liveSource.replace('return (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tref: rootRef,', 'if (failure !== null) return null;\n\t\t\treturn (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tref: rootRef,'),
  }
  const wantK = {
    失败时不写原因: [CLIENT_CODES.noAlert],
    失败时整个槽位不画: [CLIENT_CODES.buttonGone, CLIENT_CODES.noAlert].sort(),
  }
  const knifeReadings = { knife_sut: SUT_IS_COPY ? 'SUT 是副本' : 'SUT = 活树', knife_source: LIVE_CLIENT }
  for (const [name, mutated] of Object.entries(K)) {
    if (mutated === liveSource) {
      problems.push(problem(CLIENT_CODES.knife, `刀「${name}」没切动活树源码（字符串没变）—— 这把刀不能证明判据会翻面`))
      continue
    }
    const got = await knifeVector(name, mutated, '没有remote')
    knifeReadings[name] = got
    if (!got.ok) {
      problems.push(problem(CLIENT_CODES.knife, `刀「${name}」装不进载具（${got.why}）`))
      continue
    }
    if (JSON.stringify(got.codes) !== JSON.stringify(wantK[name])) {
      problems.push(problem(CLIENT_CODES.knife, `刀「${name}」翻出来的面是 ${JSON.stringify(got.codes)}，应当是 ${JSON.stringify(wantK[name])} —— 判据分不开"失败被画成红条"与"失败被吞掉 / 整个槽位没了"`))
    }
  }

  // 真刀：**故障那一版**的真字节。它必须被点名（否则这一腿对那次真故障是瞎的）。
  const old = preFailureClientSource()
  rec.readings.client_knife_source = { available: old.available, why: old.why, sha256: old.sha256, proves_old: old.proves_old }
  if (!old.available) {
    rec.readings.client_knives = knifeReadings
    caseHold(rec, CLIENT_CODES.knifeUnavailable, `拿不到故障那一版的真字节（${old.why}）—— "这一腿抓得住那次真故障"判不了`)
    return
  }
  if (!old.proves_old) {
    rec.readings.client_knives = knifeReadings
    problems.push(problem(CLIENT_CODES.knife, '`d586215^` 那一版不是"故障那一版"（兜底藏起来 / 兜底报错文案 的指纹对不上）—— 这把刀证明的是别的东西'))
    return
  }
  const oldKnife = await knifeVector('故障那一版', old.text, '没有remote')
  knifeReadings['故障那一版'] = oldKnife
  rec.readings.client_knives = knifeReadings
  const wantOld = [CLIENT_CODES.noAlert, CLIENT_CODES.threw].sort()
  if (!oldKnife.ok) {
    problems.push(problem(CLIENT_CODES.knife, `故障那一版装不进载具（${oldKnife.why}）—— 这把刀切不动`))
  } else if (JSON.stringify(oldKnife.codes) !== JSON.stringify(wantOld)) {
    problems.push(problem(CLIENT_CODES.knife, `故障那一版在"服务不在"现场翻出来的是 ${JSON.stringify(oldKnife.codes)}，应当恰好是 ${JSON.stringify(wantOld)}（同步抛 + 没有红条）—— 这一腿对那次真故障是瞎的，或者连别的面一起抓`))
  }
}

// ── `DASH-12` ───────────────────────────────────────────────────────────────
const DAY_KEY = {
  noon: '2026-11-04T12:00:00+08:00',
  cutBelow: '2026-11-04T01:30:00+08:00',
}

/**
 * 画面上"看得到 day"：`view.day` 必须出现在某个 `jsx(...)` 调用的表达式里（不是只在变量里读一下）。
 *
 * ⚠️ 只判**存在**，不判位置、也不认类名：它不看 `notice` / `meta` / `footer` 任何一个类名 token。
 *    "日期在面板顶部还是底部""内容第一行必须是 headline 逐字"是 GUI 清单 #3/#4 的格子
 *    （R2-1 就是日期抢在第一个 `h3` 上面的那一种）；本格只保证"这堆数字是哪一天"在画面上有载体。
 */
function dayRenderProblems(source) {
  const code = stripCommentLines(source)
  if (!/view\.day/.test(code)) {
    return [problem('DASH-DAY-NOT-SHOWN', '渲染层里没有 `view.day` —— 快照里带着 day，画面上一个字都没有（读者没法判断这是哪一天的读数）')]
  }
  if (!/(?:jsx|jsxs)\)?\([\s\S]{0,400}?view\.day/.test(code)) {
    return [problem('DASH-DAY-NOT-SHOWN', '`view.day` 只被读进变量，没有画到任何元素上 —— 契约 §3.4 要的是"画面带出 day"')]
  }
  return []
}

test('DASH-12 日身份：view.day = 今天（04:00 切）+ 画面看得到 + 只有旧相位文件时 badge 必须是 null', async () => {
  await runCase('DASH-12', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const pluginIndex = pluginIndexOf()
    const loaded = await loadDashboard()
    if (!loaded.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${loaded.file}（${loaded.reason}）`))
      caseFail(problems)
    }
    const rel = loaded.mod.DASHBOARD_SNAPSHOT_REL
    if (typeof rel !== 'string' || rel === '') {
      problems.push(problem(SHAPE_CODES.path, '数据层没有导出 `DASHBOARD_SNAPSHOT_REL`（渲染层读哪个文件就无从对账）'))
      caseFail(problems)
    }
    if (!existsSync(pluginIndex)) {
      problems.push(problem('DASH12-PLUGIN-MISSING', `Node 半边不在盘上：${pluginIndex}`))
      caseFail(problems)
    }

    // ① 尺子自证：这把尺子就是全系统那把（04:00 切），两个方向各量一次
    const todayKey = dayKeyOf(new Date(DAY_KEY.noon))
    const belowKey = dayKeyOf(new Date(DAY_KEY.cutBelow))
    rec.readings.ruler = { noon: todayKey, cut_below: belowKey }
    if (todayKey !== '2026-11-04' || belowKey !== '2026-11-03') {
      problems.push(problem('DASH-RULER-BROKEN', `dayKeyOf 在这两个钉住的时刻上给出 ${todayKey} / ${belowKey}，应当是 2026-11-04 / 2026-11-03 —— 测试与生产用的不是同一把 04:00 切点的尺子`))
    }

    /** 跑一个现场，返回读到的快照（文件不在 ⇒ null）。 */
    const scene = (purpose, { clockIso, localDays, updateDays, headline }) => {
      const ws = workspaceOf('DASH-12', purpose)
      seedWorkspace(ws, {
        route: routeFixture({ headline }),
        bug: bugFixture(),
        localDays,
        updateDays,
      })
      const clock = clockFileOf(ws, clockIso)
      const run = runPlugin({ pluginIndex, ws, clockFile: clock })
      const file = snapshotOf(ws, rel)
      const state = fileState(file)
      return { run, state, view: state.json }
    }

    // ② 主现场：注入时钟 12:00（周期日 = 11-04），盘上**只有前一天**的相位文件
    const main = scene('old-phase-only', {
      clockIso: DAY_KEY.noon,
      headline: '演示目标 · 执行一 · 演示',
      localDays: {
        '2026-11-04': localFixture({ day: '2026-11-04', technical: { state: 'done' }, conversation: { state: 'done' } }),
        '2026-11-03': localFixture({ day: '2026-11-03', technical: { state: 'running' }, conversation: { state: 'running' } }),
      },
      updateDays: {
        '2026-11-03': { schema: 1, day: '2026-11-03', generation: 1, phase: 'done', updated_at: '2026-11-03T09:00:00+08:00' },
      },
    })
    rec.readings.old_phase_only = {
      run_phase: main.run.payload?.phase ?? null,
      snapshot_exists: main.state.exists,
      day: main.view?.day ?? null,
      badge: main.view?.badge ?? null,
      alerts: main.view?.alerts ?? null,
    }
    if (!main.state.exists) {
      problems.push(problem('DASH12-SNAPSHOT-MISSING', '当天还没有相位文件时，快照根本没写出来 —— 面板打开只能画错误条（契约 §3.4 的"当天文件不在"那一支在生产上不可达）'))
    } else if (main.view === null) {
      problems.push(problem('DASH12-SNAPSHOT-UNPARSEABLE', '快照在盘上但解析不了 —— 渲染层 `JSON.parse` 会落到错误条，看板等于没有内容'))
    } else {
      problems.push(...viewShapeProblems(main.view, 'old-phase-only'))
      if (main.view.day !== todayKey) {
        problems.push(problem('DASH-DAY-NOT-TODAY', `只有前一天的相位文件时，快照的 day 是 ${JSON.stringify(main.view.day)}，应当是**今天** ${todayKey}（周期日）—— 这就是评审 F3 的"陈旧读数当当下"`))
      }
      if (main.view.badge !== null) {
        problems.push(problem('DASH-BADGE-STALE', `今天的相位文件不在，徽标却是 ${JSON.stringify(main.view.badge)} —— 前一天的相位词被当今天显示了（契约 §3.4：不在 ⇒ null）`))
      }
      const alerts = (main.view.alerts ?? []).map((a) => String(a?.code ?? ''))
      if (alerts.includes('DASH-SOURCE-MISSING:update')) {
        problems.push(problem('DASH-BADGE-STALE', '当天相位文件不在被报成了"缺源" —— 那是正常态（"今天还没写"），不报警'))
      }
      // 回执那一格吃的是**今天**的 local（两段都 done ⇒ 缺 0 段）；读前一天那份会变成 缺 2 段
      const receipts = (main.view.debts ?? []).find((d) => d?.key === 'receipts')
      if (receipts?.value !== 0) {
        problems.push(problem('DASH-RECEIPT-DAY', `回执那一格是 ${JSON.stringify(receipts?.value)}，按今天的 local（两段都 done）应当是 0 —— 回执读的也是 day，day 错了它就跟着错`))
      }
    }

    // ③ 切点下方（01:30 ⇒ 周期日 11-03）：day 必须跟着 04:00 这把尺子走，不是日历日
    const below = scene('cut-below', {
      clockIso: DAY_KEY.cutBelow,
      headline: '演示目标 · 执行一 · 演示',
      localDays: { '2026-11-03': localFixture({ day: '2026-11-03', technical: { state: 'done' }, conversation: { state: 'done' } }) },
      updateDays: { '2026-11-03': { schema: 1, day: '2026-11-03', generation: 1, phase: 'done', updated_at: '2026-11-03T09:00:00+08:00' } },
    })
    rec.readings.cut_below = { day: below.view?.day ?? null, badge: below.view?.badge ?? null, exists: below.state.exists }
    if (!below.state.exists) problems.push(problem('DASH12-SNAPSHOT-MISSING', '01:30 那个现场没写出快照'))
    else if (below.view === null) problems.push(problem('DASH12-SNAPSHOT-UNPARSEABLE', '01:30 那个现场的快照解析不了'))
    else {
      if (below.view.day !== belowKey) problems.push(problem('DASH-DAY-NOT-TODAY', `01:30（本地）的周期日是 ${belowKey}，快照的 day 是 ${JSON.stringify(below.view.day)} —— 用了日历日就会是 2026-11-04`))
      if (below.view.badge?.word !== 'done') problems.push(problem('DASH-BADGE-WORD', `01:30 的周期日 ${belowKey} 有相位文件（done），徽标却是 ${JSON.stringify(below.view.badge)}`))
    }

    // ④ 当天文件在（12:00）：day = 今天，徽标 = 今天那份的相位词
    const todayIn = scene('today-present', {
      clockIso: DAY_KEY.noon,
      headline: '演示目标 · 执行一 · 演示',
      localDays: { '2026-11-04': localFixture({ day: '2026-11-04', technical: { state: 'done' }, conversation: { state: 'done' } }) },
      updateDays: { '2026-11-04': { schema: 1, day: '2026-11-04', generation: 1, phase: 'reviewing', updated_at: '2026-11-04T09:00:00+08:00' } },
    })
    rec.readings.today_present = { day: todayIn.view?.day ?? null, badge: todayIn.view?.badge ?? null }
    if (todayIn.view?.day !== todayKey) problems.push(problem('DASH-DAY-NOT-TODAY', `当天文件在时 day 是 ${JSON.stringify(todayIn.view?.day)}，应当是 ${todayKey}`))
    if (todayIn.view?.badge?.word !== 'reviewing') problems.push(problem('DASH-BADGE-WORD', `当天文件在时徽标是 ${JSON.stringify(todayIn.view?.badge)}，应当是 {word:'reviewing'}`))

    // ⑤ 源码那一腿：日键必须从 `dayKeyOf` 这把尺子来（退回"文件名排序取最后一天"当场红）
    const indexSource = readFileSync(pluginIndex, 'utf8')
    const moduleSource = readFileSync(loaded.file, 'utf8')
    const indexCode = stripCommentLines(indexSource)
    const moduleCode = stripCommentLines(moduleSource)
    const indexUsesCut = /dayKeyOf\s*\(/.test(indexCode)
    const helperUsesCut = /function\s+latestUpdateDay[\s\S]{0,500}?dayKeyOf\s*\(/.test(moduleCode)
    rec.readings.day_source = { index_dayKeyOf: indexUsesCut, latestUpdateDay_body_dayKeyOf: helperUsesCut }
    if (!indexUsesCut && !helperUsesCut) {
      problems.push(problem('DASH-DAY-NOT-CYCLE-KEY', 'Node 半边的日键既不是 `index.js` 里 `dayKeyOf(...)` 算的，也不是 `latestUpdateDay` 用 `dayKeyOf` 算的 —— 它来自"按文件名排序取最后一天"（评审 F3 的那个函数）'))
    }

    // ⑥ 画面上要看得到 day（合成样本自证这根针会翻面）
    const positive = 'const el = jsx("span", { className: css.meta, children: `读数日 ${view.day}` })'
    const negative = 'const day = view.day; const header = view.header.text'
    const control = { positive: dayRenderProblems(positive).length, negative: dayRenderProblems(negative).length }
    rec.readings.day_render_control = control
    if (control.positive !== 0) problems.push(problem('DASH-RULER-BROKEN', '"画得到 day"这根针在合成阳性样本上没通过'))
    if (control.negative === 0) problems.push(problem('DASH-RULER-BROKEN', '"画得到 day"这根针在"只读进变量"的合成样本上没翻面 —— 它分不开"显示"与"读了一下"'))
    const rendered = dayRenderProblems(readFileSync(DASH_CLIENT, 'utf8'))
    rec.readings.day_render = rendered
    for (const p of rendered) problems.push(p)

    caseFail(problems)
  })
})
