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
 * 🔴 **读盘这一条现在的样子**（`read` 返回的那一页由 `pickPageText` 取正文；`readSnapshot` resolve
 * `{text}`，远端报 `workspace-file/not-found` 时 resolve `{absent:<path>}`）：组件成功那一支是
 * `setView(JSON.parse(result.text))`，没有快照那一支画一条灰的 `role="status"` 通知
 * （`data-dashboard-absent`）。⇒ 四条判据各钉一件事：
 *   ① **静态**（`-SNAPSHOT-PATH-DRIFT`）：`SNAPSHOT_PATH` 与 `DASHBOARD_SNAPSHOT_REL` 两半同源，
 *      且渲染层**解析的是它读回来的那份文本**（`JSON.parse(text)` 或 `JSON.parse(<读盘结果>.text)`）——
 *      不是自己算出来的对象；"不自己做账本数学"由 `-LEDGER-TOUCHED` 那一族看。
 *      ⚠️ 静态只判文本形状；**运行时真的传了什么**由 ⑦ 那次真跑说了算（第二读者比字面量比对硬）。
 *   ② **成功那一支**（`-SUCCESS-BROKEN`）：三种页形状（扁平 `{offset,text,lines,eof}` /
 *      `{value:{text}}` / `{result:{text}}`）都必须渲染出快照里的 headline，且 `readSnapshot`
 *      resolve 出 `{text}`（正文逐字是那一页的）。
 *   ③ **认不出的页形状**（`-SHAPE-UNNAMED` / `-SHAPE-SWALLOWED`）：红条必须**点名形状**
 *      （类型 + 顶层键 + 预览），不许退化成 `"undefined" is not valid JSON`（现场那句）。
 *   ④ **没有快照那一格**（`-ABSENT-*`）：`workspace-file/not-found` ⇒ `[data-dashboard-absent]` 在、
 *      `role="status"`、文字里带着它找的那个路径、**没有** `role="alert"`、按钮与根都还在。
 *     红基线是 `46ddea6` 那一版真字节（`pickPageText` 有了、`absent` 那一支还没有）。
 *   · **那一腿「读盘失败只画红条」**：`readSnapshot` 在"服务不在 / 同步抛 / 返回 rejected"三种情形下
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
 *
 * ── 2026-11-06 第 4 关复审 §7（「四修复、零判据」E1–E4）补的四组判据 ─────────────────────
 * 复审的形状是：**每一条修复都能只改一处、全量照绿**。下面四组各自干掉一条（编号接着 ⑧ 往下排）：
 *
 *   ⑨ **落点不在被测树里**（E1/E2）—— `DASHBOARD_SNAPSHOT_REL`（数据层）与 `SNAPSHOT_PATH`
 *      （渲染层自己的字面量）**逐字相同**，**且**都不在 `presets/agenia` / 任一 `.runtime` /
 *      任一 `.team` 之下；形状不是"工作区相对路径"（绝对路径 / `..`）另给一码。
 *      复审的输入：两半**同批**改成 `presets/agenia/.snap/view.json` ⇒ 原来那三处判据全绿，
 *      而 DR-02 的 `livePreset` 树哈希 / `F57-TARGET` / CODE 全部回到旧病（15 秒写手每天翻它几十次）。
 *      🔴 **红基线是真字节**：`84bdddb`（搬走落点之前那一版）两半都是
 *      `presets/agenia/.snapshot/dashboard-view.json` —— 就在 `presets/agenia` 这棵被测树里；
 *      判据在它身上必须翻 `-SNAPSHOT-UNDER-MEASURED-TREE`（拿不到那一版 ⇒ HOLD，不当绿）。
 *      三把刀只改**内存里的字符串 / 传进判据的那个值**，每把只翻自己那一面：
 *      只改渲染层·仍在树外 ⇒ 漂移码；只改渲染层·搬进树内 ⇒ 漂移 + 被测树；两半同改 ⇒ 被测树码。
 *
 *   ⑩ **视图守卫的十种现场**（E3）—— 「合法 JSON、形状不对」十种：缺 `alerts` / 缺 `header` /
 *      `header:null` / `debts:null` / `debts:[null]` / `alerts:[null]` / 缺 `badge` / 缺 `main` /
 *      `null`（`JSON.parse("null")`）/ 顶层数组。每种都必须：按钮还在、出现 `role="alert"` 的红条、
 *      红条**点名那个缺陷**。复审的输入：把 `viewProblem` 的函数体换成 `return null` ⇒ 全绿。
 *      🔴 写这格那一刻的读数（2026-11-06）：**六种过、四种仍抛** —— `debts:[null]` / `alerts:[null]` /
 *      缺 `badge` / 缺 `main` 记 `-VIEW-SHAPE-THREW` + `-VIEW-SHAPE-NO-ALERT`。那四格是**产品缺口**
 *      （`viewProblem` 只判容器类型，不判元素与 `badge`/`main`），不是判据坏；红基线是 `84bdddb`
 *      那一版真字节（加 `viewProblem` 之前的最后一版：十种现场**全部**翻，一格都过不去）。
 *
 *   ⑪ **`generated_at` 的值与「多久以前」**（D3 / E11 的值那一半）—— 注入时钟直接跑
 *      `refreshSnapshot({root, now})`：`generated_at` 必须解析得了、且等于那个时刻（±1 s）；
 *      面板页脚（`role="status"` 那条「读数日 …」）必须带「· N 分钟前」；
 *      **没有** `generated_at` ⇒ 页脚**不许**出现「刚刚」/「N 分钟前」（"不知道多旧"和"刚刚"
 *      长得一样是最坏的一种谎）。三把刀：去掉写手的盖章（拷一份 `lib/` + 改过的 `index.mjs` 到运行根里跑）
 *      / 删掉 `ageSuffix(...)` / 让 `ageSuffix` 在缺章时猜「刚刚」，每把只翻它自己那一码。
 *
 *   ⑫ **键数从唯一载体读**：快照九个键（含 `generated_at`）；`registry.mjs` 的 DASH-11 那一行
 *      不再自报份数，改为指向契约 §3 与这里的 `VIEW_KEYS`（一个数三份载体是这一批的通病）。
 */
import { before, test } from 'node:test'
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { caseFail, caseHold, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { createDashboardHarness, clientSourceAtCommit, messageOf, preFailureClientSource } from '../support/dash-client-harness.mjs'
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
/**
 * **缺 `absent` 那一支**的那一版（`46ddea6` = 认了包装页形状、还没有"这个工作区没有快照"那一支）。
 *
 * 为什么把哈希写在这里：这一格的红基线要能证明"它抓得住现场那次真缺陷" —— 合成变异体只能证明
 * 判据会翻面，抓不住"我造的那个假缺陷与现场那个真缺陷是不是同一个"。`46ddea6` 是**不变的历史**。
 * ⚠️ 拿不到它（副本没有 `.git`）⇒ 那一腿记 **HOLD**，不当绿。
 */
const PRE_ABSENT_COMMIT = '46ddea6'
/**
 * **加 `viewProblem` 之前的最后一版**（`84bdddb` = `b14381c` 的父；`b14381c` 才引入那个守卫）。
 *
 * 为什么把哈希写在这里：`⑩` 要证明"十种形状不对的现场在**零守卫**那一版上全红" ——
 * 合成变异体只能证明判据会翻面，证明不了它抓得住"这一批真正缺的那件东西"。`84bdddb` 是**不变的历史**。
 * ⚠️ 拿不到它（副本没有 `.git`）⇒ 那一腿记 **HOLD**，不当绿。
 */
const PRE_VIEW_GUARD_COMMIT = '84bdddb'

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
const VIEW_KEYS = ['alerts', 'badge', 'day', 'debts', 'emptyNotice', 'generated_at', 'header', 'main', 'schema']
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

// ── 渲染层：解析的是"读回来的那份文本"（静态腿）────────────────────────────────
/**
 * 静态腿：**渲染层解析的是它读回来的那份文本**，不是自己算出来的对象（"不自己做账本数学"
 * 由下面 `-LEDGER-TOUCHED` 那一族看）。
 *
 * 认两种写法：
 *   · `JSON.parse(text)` —— 正文已经取到变量里；
 *   · `JSON.parse(<读盘结果>.text)` —— 正文还挂在读盘结果上（`result.text` 就是这一种）。
 * **不认** `JSON.parse(<对象>)` / `JSON.parse(<字面量>)`：那说明被解析的东西不是"读回来的文本"。
 *
 * ⚠️ 这一条只判**文本形状**（点得快、红了也容易看）；运行时真的传了什么、真的画出什么，
 * 由 ⑦ 那次"真装 `client.js`、真点一次"说了算 —— 第二读者比字面量比对硬。
 */
function parseLegProblems(clientCode) {
  const args = [...clientCode.matchAll(/JSON\.parse\s*\(\s*([^()]*?)\s*\)/g)].map((match) => match[1].trim())
  const reading = { json_parse_args: args, ok: args.some((arg) => /^(?:[A-Za-z_$][\w$]*\s*\.\s*)?text$/.test(arg)) }
  if (reading.ok) return { reading, problems: [] }
  return {
    reading,
    problems: [problem(SHAPE_CODES.path, `渲染层没有解析"它读回来的那份文本"（实得 \`JSON.parse\` 的实参：${args.length === 0 ? '一处都没有' : JSON.stringify(args)}）—— 认的写法是 \`JSON.parse(text)\` 或 \`JSON.parse(<读盘结果>.text)\``)],
  }
}

// ── 落点：在不在被测树里（E1/E2）──────────────────────────────────────────────
/**
 * **被测树** —— 这一条判据存在的全部理由：快照落点一旦落进其中任何一棵，15 秒写手就开始驱动别人的尺子。
 *
 *   · `presets/agenia` —— DR-02 的 `livePreset` 树哈希（**零排除**）+ 安装落点（`PATHS.finalPreset`）；
 *   · 任一 `.runtime` —— 真实脑根（`root-guard.mjs:46` 就是 `presets/agenia/.runtime`）；
 *   · 任一 `.team` —— 账本 / 本地状态 / 测试运行根。
 *
 * 复审 §7 E1 的原话：原来只量了"两半是不是同一个常量"，**没量**"这个常量在不在被测树里" ——
 * 两半同批改成 `presets/agenia/.snap/view.json` 时三处判据全绿，而 DR-02 / F57-TARGET / CODE
 * 全部回到旧病。所以这一条不是"再判一次相等"，判的是**落点的位置**。
 */
const MEASURED_TREE_SEGMENTS = ['.runtime', '.team']
const LOCATION_CODES = {
  /** 两半漂了（与 ⑦ 的**运行时**同源是两件事：这条判的是两个**声明**）。 */
  drift: SHAPE_CODES.path,
  under: 'DASH11-SNAPSHOT-UNDER-MEASURED-TREE',
  badShape: 'DASH11-SNAPSHOT-REL-BAD-SHAPE',
  rendererMissing: 'DASH11-SNAPSHOT-RENDERER-LITERAL-MISSING',
  knife: 'DASH11-SNAPSHOT-LOCATION-KNIFE',
}

/**
 * 一份**工作区相对**路径落在哪一棵被测树里 —— 或者它压根不是"工作区相对路径"（`null` ⇒ 干净）。
 *
 * 绝对路径 / `..` 也归 `badShape`：那种写法落到哪个工作区不由这条常量决定，"不在被测树里"就无从成立
 * （判据要么判得动，要么说判不动 —— 不许把它当成"外面"）。
 *
 * @param {unknown} rel
 * @returns {{code:string, why:string}|null}
 */
function measuredTreeHit(rel) {
  const text = typeof rel === 'string' ? rel.trim() : ''
  if (text === '') return { code: LOCATION_CODES.badShape, why: `不是非空字符串（${JSON.stringify(rel)}）` }
  const normalized = text.replace(/\\/g, '/')
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/')) {
    return { code: LOCATION_CODES.badShape, why: `是绝对路径（${JSON.stringify(text)}）—— 落到哪个工作区不由这条常量决定，'不在被测树里'无从成立` }
  }
  const segments = normalized.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.includes('..')) {
    return { code: LOCATION_CODES.badShape, why: `带 ..（${JSON.stringify(text)}）—— 相对路径能爬出工作区，落点不可对账` }
  }
  if (segments[0] === 'presets' && segments[1] === 'agenia') {
    return { code: LOCATION_CODES.under, why: `落在 presets/agenia（DR-02 的 livePreset 树哈希 / 安装落点）之下：${JSON.stringify(text)}` }
  }
  for (const segment of MEASURED_TREE_SEGMENTS) {
    if (segments.includes(segment)) {
      return { code: LOCATION_CODES.under, why: `落在 ${segment} 之下（${JSON.stringify(text)}）—— 那是数据根，不是快照该住的地方` }
    }
  }
  return null
}

/** 渲染层里那个 `const SNAPSHOT_PATH = "…"`（只认字面量；取不到 ⇒ `null`）。 */
const SNAPSHOT_LITERAL = /const\s+SNAPSHOT_PATH\s*=\s*["']([^"']+)["']/

/**
 * 快照落点的判据（**入参是两个值**，所以能喂"两半同批改坏"的拷贝 —— 相等与位置是两条独立的事实）：
 *   (a) 两半**逐字相同**（`DASH11-SNAPSHOT-PATH-DRIFT`）；
 *   (b) **都不在**被测树里（`DASH11-SNAPSHOT-UNDER-MEASURED-TREE`），形状不对另给 `-REL-BAD-SHAPE`。
 *
 * @param {{moduleRel:unknown, rendererSource:string}} args
 * @returns {{readings:object, problems:Array<{code:string,message:string}>}}
 */
function snapshotLocationProblems({ moduleRel, rendererSource }) {
  const readings = { module_rel: typeof moduleRel === 'string' ? moduleRel : null, renderer_path: null, halves: {} }
  const problems = []
  const hit = SNAPSHOT_LITERAL.exec(String(rendererSource ?? ''))
  const rendererPath = hit === null ? null : hit[1]
  readings.renderer_path = rendererPath
  if (rendererPath === null) {
    problems.push(problem(LOCATION_CODES.rendererMissing, '渲染层里没有 const SNAPSHOT_PATH = "…" —— 它读哪个文件无从对账，也就没法证明那个文件不在被测树里'))
  }
  for (const [label, value] of [['数据层 DASHBOARD_SNAPSHOT_REL', moduleRel], ['渲染层 SNAPSHOT_PATH', rendererPath]]) {
    if (value === null || value === undefined) continue
    const at = measuredTreeHit(value)
    readings.halves[label] = { path: value, hit: at === null ? null : at.code }
    if (at !== null) problems.push(problem(at.code, `${label} ${at.why}`))
  }
  if (rendererPath !== null && typeof moduleRel === 'string' && rendererPath !== moduleRel) {
    problems.push(problem(LOCATION_CODES.drift, `渲染层读 ${JSON.stringify(rendererPath)}，数据层写 ${JSON.stringify(moduleRel)} —— 两半写的不是同一份文件`))
  }
  return { readings, problems }
}

/**
 * `DASH-11` ⑨：**落点不在被测树里**（复审 E1/E2）。
 *
 * 真源码那一跑要三样同时成立：两半逐字相同、两半都在被测树外、渲染层那条字面量读得出来。
 * 三把刀只改**内存里的字符串 / 传进判据的那个值**（每把的向量逐条写出来 —— 判据翻的必须是**该翻的那一面**）：
 *   · 只改渲染层·搬到**树外**的另一个路径 ⇒ 只翻漂移码（证明相等那一条独立承重）；
 *   · 只改渲染层·搬进 `presets/agenia` ⇒ 翻漂移 + 被测树（证明位置那一条**单独**读得出渲染层那一半）；
 *   · **两半同批**搬进 `presets/agenia`（复审的原输入）⇒ 只翻被测树码（相等仍然成立 —— 正是它翻不了面的原因）。
 *
 * @param {{rec:object, rel:string, clientSource:string, problems:Array}} args
 */
function snapshotLocationLeg({ rec, rel, clientSource, problems }) {
  const real = snapshotLocationProblems({ moduleRel: rel, rendererSource: clientSource })
  rec.readings.snapshot_location = real.readings
  for (const p of real.problems) problems.push(p)
  /** 复审 §7 E1 那个坏落点（`presets/agenia/.snapshot/x.json` 的同族；用 `view.json` 免得像两个文件）。 */
  const BAD_REL = 'presets/agenia/.snapshot/view.json'
  /** 树外另一个路径（只为了让"漂移码"单独翻一次）。 */
  const ELSEWHERE_REL = '.tools/_scratch/dashboard/other.json'
  const moved = (target) => clientSource.split(rel).join(target)
  const codeVector = (args) => [...new Set(snapshotLocationProblems(args).problems.map((p) => p.code))].sort()
  /**
   * 三把刀只在**真源码那一对是干净的**时候跑：刀的期望值以"原来那一对是两个干净的声明"为前提，
   * 前提不成立时跑出来的向量差异是**前提坏了**，不是判据坏了（真源码那一对已经有红了 —— 红本身就是证据）。
   */
  if (real.problems.length > 0) {
    rec.readings.snapshot_location_knives = { skipped: '真源码那一对已经不是两个干净的声明 —— 三把刀的期望值不成立，见上面的红' }
  } else {
    const readings = {}
    const expect = [
      ['只改渲染层·树外另一处', moved(ELSEWHERE_REL), rel, [LOCATION_CODES.drift]],
      ['只改渲染层·搬进被测树', moved(BAD_REL), rel, [LOCATION_CODES.drift, LOCATION_CODES.under]],
      ['两半同批搬进被测树', moved(BAD_REL), BAD_REL, [LOCATION_CODES.under]],
    ]
    for (const [label, rendererSource, moduleRel, want] of expect) {
      if (rendererSource === clientSource) {
        problems.push(problem(LOCATION_CODES.knife, `刀「${label}」没切动源码（渲染层里找不到那个路径字面量 ${JSON.stringify(rel)}）—— 这把刀不能证明判据会翻面`))
        continue
      }
      const codes = codeVector({ moduleRel, rendererSource })
      readings[label] = codes
      if (JSON.stringify(codes) !== JSON.stringify(want)) {
        problems.push(problem(LOCATION_CODES.knife, `刀「${label}」翻出来的面是 ${JSON.stringify(codes)}，应当是 ${JSON.stringify(want)} —— 判据分不开"两半漂了"与"两半一起搬进被测树"`))
      }
    }
    rec.readings.snapshot_location_knives = readings
  }

  // 红基线：**搬走落点之前**那一版真字节（`84bdddb`：两半都在 `presets/agenia/.snapshot/` 下）
  const oldClient = clientSourceAtCommit({ commit: PRE_VIEW_GUARD_COMMIT })
  const oldModule = clientSourceAtCommit({ commit: PRE_VIEW_GUARD_COMMIT, rel: 'presets/agenia/lib/dashboard.mjs' })
  const oldRelHit = oldModule.text === null ? null : /export\s+const\s+DASHBOARD_SNAPSHOT_REL\s*=\s*['"]([^'"]+)['"]/.exec(oldModule.text)
  const oldRel = oldRelHit === null ? null : oldRelHit[1]
  const history = { commit: PRE_VIEW_GUARD_COMMIT, available: oldClient.available && oldModule.available, why: oldClient.why ?? oldModule.why, module_rel: oldRel, renderer_sha256: oldClient.sha256, codes: null }
  if (!history.available || oldClient.text === null || oldRel === null) {
    rec.readings.snapshot_location_history = history
    caseHold(rec, LOCATION_CODES.knife, `拿不到 ${PRE_VIEW_GUARD_COMMIT} 那一版的数据层 / 渲染层真字节（${history.why ?? '没解出 DASHBOARD_SNAPSHOT_REL'}）—— "这一条判据抓得住搬走之前那个落点"判不了`)
  } else {
    const codes = codeVector({ moduleRel: oldRel, rendererSource: oldClient.text })
    history.codes = codes
    rec.readings.snapshot_location_history = history
    if (!codes.includes(LOCATION_CODES.under)) {
      problems.push(problem(LOCATION_CODES.knife, `${PRE_VIEW_GUARD_COMMIT} 那一版（落点 = ${JSON.stringify(oldRel)}，就在 presets/agenia 里）没有被判据抓到（实得 ${JSON.stringify(codes)}）—— 这一条对"落点住在被测树里"是瞎的`))
    }
  }
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

// ── 视图守卫：十种「合法 JSON、形状不对」的现场（E3）──────────────────────────────
/**
 * 十种现场的红因码 —— 每一码说一件事（"抛了" / "没有红条" / "红条说不出是什么" / "组件没了"）。
 *
 * 复审 §7 E3 的原话：这一条修复**零样本** —— 客户端那一腿从来只喂"合法视图"，
 * 所以把 `viewProblem` 的函数体换成 `return null` 全量照绿。这里补的就是样本。
 */
const VIEW_SHAPE_CODES = {
  readBroken: 'DASH11-CLIENT-VIEW-SHAPE-READ-BROKEN',
  threw: 'DASH11-CLIENT-VIEW-SHAPE-THREW',
  noAlert: 'DASH11-CLIENT-VIEW-SHAPE-NO-ALERT',
  unnamed: 'DASH11-CLIENT-VIEW-SHAPE-UNNAMED',
  buttonGone: 'DASH11-CLIENT-VIEW-SHAPE-BUTTON-GONE',
  control: 'DASH11-CLIENT-VIEW-SHAPE-CONTROL',
  knife: 'DASH11-CLIENT-VIEW-SHAPE-KNIFE',
  knifeUnavailable: 'DASH11-CLIENT-VIEW-SHAPE-KNIFE-UNAVAILABLE',
}

/**
 * 十种"合法 JSON、形状不对"的现场。`names` = 红条上必须点到的那个缺陷名（命中任一个算点名）。
 *
 * ⚠️ 后四种（`debts:[null]` / `alerts:[null]` / 缺 `badge` / 缺 `main`）今天仍然会在渲染期抛 ——
 *    那正是复审 §4.2 的四个反例。判据照旧要求它们过关（先红后修的次序），**不许**把要求降到"今天就这德行"。
 *
 * @returns {Record<string, {view:unknown, names:string[]}>}
 */
function viewShapeSamples() {
  const omit = (key) => {
    const view = { ...CLIENT_VIEW }
    delete view[key]
    return view
  }
  return {
    缺alerts: { view: omit('alerts'), names: ['alerts'] },
    缺header: { view: omit('header'), names: ['header'] },
    header是null: { view: { ...CLIENT_VIEW, header: null }, names: ['header'] },
    debts是null: { view: { ...CLIENT_VIEW, debts: null }, names: ['debts'] },
    debts里有null: { view: { ...CLIENT_VIEW, debts: [null] }, names: ['debts'] },
    alerts里有null: { view: { ...CLIENT_VIEW, alerts: [null] }, names: ['alerts'] },
    缺badge: { view: omit('badge'), names: ['badge'] },
    缺main: { view: omit('main'), names: ['main'] },
    null视图: { view: null, names: ['null'] },
    顶层是数组: { view: [], names: ['array'] },
  }
}

/**
 * 一种现场该成立什么（**纯函数**：真源码 / 红基线 / 好视图对照三个读者共用同一份判据）。
 *
 * 每样同时成立，缺哪样说哪样：
 *   ① `readSnapshot` resolve（这一页是**合法 JSON**，"形状不对"不许被读盘那一层吞成失败）；
 *   ② **渲染期不抛** —— 抛一下在 React 里就是整个槽位被拆掉、按钮跟着消失（`bug-20261106-13` 的关闭词）；
 *   ③ 树里有 `role="alert"` 的红条，而且**点得出是哪个缺陷**（不许只说"形状不对"）；
 *   ④ 槽位的根与触发器都还在。
 *
 * @param {string} label 现场名
 * @param {object} got 载具读数
 * @param {{names:string[], wantAlert?:boolean}} spec
 */
function viewSampleProblems(label, got, spec) {
  const problems = []
  const rendered = got.settled?.render_threw ?? null
  const threw = (got.throws ?? []).length > 0 || rendered !== null
  const alert = got.alert_text
  if (got.direct === null || got.direct.status !== 'resolved') {
    problems.push(problem(VIEW_SHAPE_CODES.readBroken, `现场「${label}」：这一页是**合法 JSON**，readSnapshot 却不是 resolved（${JSON.stringify(got.direct === null ? null : got.direct.status)}）—— 形状不对被读盘那一层吞成了失败`))
  }
  if (threw) {
    const first = (got.throws ?? [])[0] ?? rendered
    problems.push(problem(VIEW_SHAPE_CODES.threw, `现场「${label}」：形状不对的视图在**渲染期抛了**（${JSON.stringify(first)}）—— 在 React 里这就是"整个槽位被拆掉、按钮跟着消失"；渲染期的守卫必须在这之前把它接住`))
  }
  if (spec.wantAlert !== false) {
    if (alert === null) {
      problems.push(problem(VIEW_SHAPE_CODES.noAlert, `现场「${label}」：没有 role="alert" 的红条 —— 面板既不画内容也不说形状不对，等于"什么都没发生"`))
    } else if (!spec.names.some((name) => alert.toLowerCase().includes(name.toLowerCase()))) {
      problems.push(problem(VIEW_SHAPE_CODES.unnamed, `现场「${label}」：红条没有点名那个缺陷（文字=${JSON.stringify(alert)}；要点到 ${JSON.stringify(spec.names)} 之一）`))
    }
  }
  if (!got.trigger_present || !got.root_present) {
    problems.push(problem(VIEW_SHAPE_CODES.buttonGone, `现场「${label}」：槽位的根 / 触发器不见了（root=${got.root_present} · trigger=${got.trigger_present}）—— 这一下把组件带走了`))
  }
  return problems
}

/**
 * `DASH-11` ⑩：**十种现场 + 好视图对照 + 零守卫那一版真字节**。
 *
 * 三个读者同一份判据（`viewSampleProblems`）：
 *   · 真源码十种现场 —— 每种都必须过（今天四种不过，红着；那是产品缺口，不是判据坏）；
 *   · **对照**：一份好视图必须**一格都不报**（否则这把尺子永远红，读的人分不清"产品坏了"与"判据坏了"）；
 *   · **红基线**（`84bdddb` = 加 `viewProblem` 之前的最后一版）：十种现场**必须全部**翻至少一码 ——
 *     一条在"零守卫"那一版上全绿的判据，等于没有判据。
 *
 * @param {{rec:object, clientSource:string, problems:Array}} args
 */
async function clientViewShapeLeg({ rec, clientSource, problems }) {
  const harness = createDashboardHarness(clientSource)
  if (!harness.ok) {
    problems.push(problem(CLIENT_CODES.unloadable, `渲染层装不进载具（${harness.reason}）—— 视图守卫的十种现场判不了，不许记绿`))
    return
  }
  const samples = viewShapeSamples()
  const readings = {}
  const vectors = {}
  for (const [name, spec] of Object.entries(samples)) {
    const text = JSON.stringify(spec.view)
    const page = { offset: 1, text, lines: 1, eof: true }
    const got = await sceneOf(harness, pageService(page), page)
    vectors[name] = viewSampleProblems(name, got, spec)
    readings[name] = {
      json: text.slice(0, 120),
      direct_status: got.direct === null ? null : got.direct.status,
      alert_text: got.alert_text,
      throws: got.throws,
      trigger_present: got.trigger_present,
      root_present: got.root_present,
    }
    for (const p of vectors[name]) problems.push(p)
  }
  // 对照：**好视图**必须干净（判据不是"永远红"）
  const goodPage = { offset: 1, text: JSON.stringify(CLIENT_VIEW), lines: 1, eof: true }
  const good = await sceneOf(harness, pageService(goodPage), goodPage)
  const goodProblems = viewSampleProblems('对照·好视图', good, { names: [], wantAlert: false })
  const goodClean = goodProblems.length === 0 && good.texts.includes(CLIENT_VIEW.header.text)
  if (!goodClean) {
    problems.push(problem(VIEW_SHAPE_CODES.control, `对照：一份**合法视图**被这一条判据报了 ${goodProblems.length} 项（${JSON.stringify(goodProblems.map((p) => p.code))}）或 headline 没画出来（${good.texts.includes(CLIENT_VIEW.header.text)}）—— 那是**判据坏了**，不是产品坏了`))
  }
  rec.readings.view_shapes = {
    cases: readings,
    codes: Object.fromEntries(Object.entries(vectors).map(([name, list]) => [name, list.map((p) => p.code).sort()])),
    control_clean: goodClean,
    control_problems: goodProblems.map((p) => p.code),
  }

  // 红基线：**零守卫**那一版真字节（加 `viewProblem` 之前的最后一版）
  const old = clientSourceAtCommit({ commit: PRE_VIEW_GUARD_COMMIT })
  const hasGuard = old.text === null ? null : old.text.includes('viewProblem')
  rec.readings.view_shapes_knife_source = { commit: PRE_VIEW_GUARD_COMMIT, available: old.available, why: old.why, sha256: old.sha256, has_view_problem: hasGuard }
  if (!old.available) {
    caseHold(rec, VIEW_SHAPE_CODES.knifeUnavailable, `拿不到 ${PRE_VIEW_GUARD_COMMIT} 那一版的真字节（${old.why}）—— "这一条判据抓得住零守卫那一版"判不了`)
    return
  }
  if (hasGuard !== false) {
    problems.push(problem(VIEW_SHAPE_CODES.knife, `${PRE_VIEW_GUARD_COMMIT} 那一版里已经有 viewProblem 了 —— 这把刀证明不了"零守卫时十种现场全是红的"`))
    return
  }
  const oldHarness = createDashboardHarness(old.text)
  if (!oldHarness.ok) {
    problems.push(problem(VIEW_SHAPE_CODES.knife, `${PRE_VIEW_GUARD_COMMIT} 那一版装不进载具（${oldHarness.reason}）—— 这把刀切不动`))
    return
  }
  const oldVectors = {}
  for (const [name, spec] of Object.entries(samples)) {
    const text = JSON.stringify(spec.view)
    const page = { offset: 1, text, lines: 1, eof: true }
    const got = await sceneOf(oldHarness, pageService(page), page)
    oldVectors[name] = viewSampleProblems(`红基线·${name}`, got, spec).map((p) => p.code).sort()
  }
  const blind = Object.entries(oldVectors).filter(([, codes]) => codes.length === 0).map(([name]) => name)
  rec.readings.view_shapes_knife = { commit: PRE_VIEW_GUARD_COMMIT, codes: oldVectors, blind }
  if (blind.length > 0) {
    problems.push(problem(VIEW_SHAPE_CODES.knife, `红基线（${PRE_VIEW_GUARD_COMMIT}，零守卫）上这些现场**一格都没翻**：${JSON.stringify(blind)} —— 这一条对"渲染期抛"是瞎的（它会在产品修好与没修好两种情况下一样绿）`))
  }
}

// ── `generated_at` 的值 + 「多久以前」（D3 / E11 的值那一半）──────────────────────────
/** 注入时钟（写手要盖的那个章就是这个时刻）。 */
const GENERATED_AT_ISO = '2026-11-04T12:34:56+08:00'
/** 页脚那一行的开头（`读数日 <day>`）。 */
const FOOTER_PREFIX = '读数日 '
/** 「有多旧」那段后缀（空串 = 没有这一段）。 */
const AGE_SUFFIX = /(?:· 刚刚|· \d+ 分钟前)$/
const GENERATED_AT_CODES = {
  missing: 'DASH11-GENERATED-AT-MISSING',
  unparseable: 'DASH11-GENERATED-AT-UNPARSEABLE',
  drift: 'DASH11-GENERATED-AT-DRIFT',
  footerMissing: 'DASH11-CLIENT-AGE-FOOTER-MISSING',
  suffixMissing: 'DASH11-CLIENT-AGE-SUFFIX-MISSING',
  suffixWrong: 'DASH11-CLIENT-AGE-SUFFIX-WRONG',
  suffixGuessed: 'DASH11-CLIENT-AGE-SUFFIX-GUESSED',
  knife: 'DASH11-GENERATED-AT-KNIFE',
}

/**
 * `generated_at` 的**值**判据（复审 D3 的原输入：删掉盖章 ⇒ 写 `null` ⇒ `DASH-11` 全绿）。
 *
 * 三样分开：键在不在（`-MISSING`）· 解析不解析得了（`-UNPARSEABLE`）· 是不是**注入的那个时刻**
 * （`-DRIFT`，允许 ±1 s —— 写手把 `now` 转成 ISO 字符串会掉到毫秒以下，不该为此判红）。
 *
 * @param {{generated_at?:unknown}|null} view 快照
 * @param {string} wantIso 注入时钟（ISO8601 带偏移）
 */
function generatedAtProblems(view, wantIso) {
  const problems = []
  const value = view === null || typeof view !== 'object' ? undefined : view.generated_at
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(problem(GENERATED_AT_CODES.missing, `快照里没有 generated_at（实得 ${JSON.stringify(value)}）—— 面板说不出"这份读数有多旧"；写手停摆时旧数据会被画成"此刻"`))
    return problems
  }
  const at = Date.parse(value)
  if (Number.isNaN(at)) {
    problems.push(problem(GENERATED_AT_CODES.unparseable, `generated_at 解析不了（实得 ${JSON.stringify(value)}）—— 面板的「N 分钟前」会静默退化成"没有后缀"，而读者看不出来`))
    return problems
  }
  const want = Date.parse(wantIso)
  if (Number.isNaN(want)) {
    problems.push(problem(GENERATED_AT_CODES.knife, `判据自己的注入时钟解析不了（${JSON.stringify(wantIso)}）—— 这一格判不了，不许记绿`))
    return problems
  }
  if (Math.abs(at - want) > 1000) {
    problems.push(problem(GENERATED_AT_CODES.drift, `generated_at = ${JSON.stringify(value)}（${new Date(at).toISOString()}），注入的时钟是 ${wantIso}（${new Date(want).toISOString()}）—— 差 ${Math.round(Math.abs(at - want) / 1000)} s（允许 ±1 s）：盖的不是"现在"`))
  }
  return problems
}

/** 页脚那一条 `role="status"` 的文字（`读数日 …`）；没有 ⇒ `[]`。 */
const footerTextsOf = (got) => (got.status_texts ?? []).filter((text) => String(text).startsWith(FOOTER_PREFIX))

/**
 * 「有多旧」这一段该不该有（**纯函数**；真源码 / 两把刀共用）。
 *
 * `spec.minutes === null` ⇒ 这一份快照**没有** `generated_at`：页脚**不许**出现「刚刚」或「N 分钟前」
 * （"不知道多旧"与"刚刚"长得一样是最坏的一种谎 —— 那是 `ageSuffix` 注释里自己写的口径，这里是它的执行点）。
 * 给了分钟数 ⇒ 必须**恰好**是这一段（证明它是算出来的，不是一个常量「· 刚刚」）。
 *
 * @param {string} label 现场名
 * @param {object} got 载具读数
 * @param {{minutes:number|null}} spec
 */
function ageSuffixProblems(label, got, spec) {
  const problems = []
  const footers = footerTextsOf(got)
  if (footers.length === 0) {
    problems.push(problem(GENERATED_AT_CODES.footerMissing, `现场「${label}」：树里没有以「${FOOTER_PREFIX}」开头的 status 节点 —— 那一行是"这堆数字是哪一天"的唯一载体（页脚）`))
    return problems
  }
  const footer = footers[0]
  const hasSuffix = AGE_SUFFIX.test(footer)
  if (spec.minutes === null) {
    if (hasSuffix) {
      problems.push(problem(GENERATED_AT_CODES.suffixGuessed, `现场「${label}」：快照里没有 generated_at，页脚却写了「${footer}」—— 不知道多旧被写成了「刚刚」/「N 分钟前」（猜 0 是最坏的一种谎）`))
    }
  } else if (!hasSuffix) {
    problems.push(problem(GENERATED_AT_CODES.suffixMissing, `现场「${label}」：页脚是「${footer}」—— 没有「· N 分钟前」这段相对年龄（写手停摆时读者仍以为这是最新读数）`))
  } else if (!footer.endsWith(`· ${spec.minutes} 分钟前`)) {
    problems.push(problem(GENERATED_AT_CODES.suffixWrong, `现场「${label}」：页脚是「${footer}」，按注入时刻应当是「· ${spec.minutes} 分钟前」—— 相对年龄不是按 generated_at 算出来的`))
  }
  return problems
}

/**
 * 刀 C：**去掉写手的盖章**（`generated_at: new Date(now).toISOString()` 删掉）—— 复审 §7 E4 的原输入。
 *
 * 做法：把真 `lib/` 与一份改过的 `index` 拷进**运行根**（产品树一个字节不动），进程内 import 那一份，
 * 用同一个夹具工作区 + 同一个注入时钟再跑一次 ⇒ `generated_at` 必须变成 `null`，判据必须点名。
 * ⚠️ 拷贝里的入口写成 `.mjs`：那块临时目录没有 `package.json`，`.js` 会被当成 CommonJS 而 import 不了。
 *
 * @param {{rec:object, pluginIndex:string, problems:Array}} args
 */
async function engineStampingKnife({ rec, pluginIndex, problems }) {
  const indexSource = readFileSync(pluginIndex, 'utf8')
  const mutated = indexSource.replace(', generated_at: new Date(now).toISOString()', '')
  if (mutated === indexSource) {
    problems.push(problem(GENERATED_AT_CODES.knife, '刀 C（去掉写手的盖章）没切动源码 —— 这一格分不开"写手盖了章"与"写手没盖章"'))
    return
  }
  const fixture = path.join(runRoot(), 'fixtures', 'dash11-stamping-knife-sut')
  try {
    cpSync(path.join(PATHS.repo, 'presets', 'agenia', 'lib'), path.join(fixture, 'lib'), { recursive: true })
    const knifeIndex = path.join(fixture, 'client-ui-dashboard', 'lib', 'index.mjs')
    mkdirSync(path.dirname(knifeIndex), { recursive: true })
    writeFileSync(knifeIndex, mutated, 'utf8')
    const ws = workspaceOf('DASH-11', 'stamping-knife')
    seedWorkspace(ws, {
      route: routeFixture({ headline: '刀 · 没有盖章 · 演示' }),
      localDays: { [DAY]: localFixture({ day: DAY, technical: { state: 'done' }, conversation: { state: 'done' } }) },
      updateDays: { [DAY]: { schema: 1, day: DAY, generation: 1, phase: 'done', updated_at: `${DAY}T09:00:00+08:00` } },
    })
    const engine = await import(pathToFileURL(knifeIndex).href)
    const written = engine.refreshSnapshot({ root: ws, now: new Date(GENERATED_AT_ISO) })
    // 读**这一份写手自己报的那个文件**：SUT 被指到别处时（`AGENIA_DASH_MODULE`）`rel` 是那一棵树的值，
    // 拿 `snapshotOf(ws, rel)` 去读会读到"另一个落点没写"——那变成在量 SUT，不是在量这把刀。
    const target = typeof written?.file === 'string' ? written.file : null
    const state = target === null ? { exists: false, json: null } : fileState(target)
    const codes = state.json === null ? ['(快照没写出来)'] : generatedAtProblems(state.json, GENERATED_AT_ISO).map((p) => p.code)
    rec.readings.generated_at_knife = { source: knifeIndex, cut: true, wrote: target, exists: state.exists, value: state.json?.generated_at ?? null, codes }
    if (!codes.includes(GENERATED_AT_CODES.missing)) {
      problems.push(problem(GENERATED_AT_CODES.knife, `刀 C（去掉写手的盖章）没有被 generated_at 判据抓到（实得 ${JSON.stringify(codes)}）—— 这一格对"写手盖没盖章"是瞎的`))
    }
  } catch (err) {
    problems.push(problem(GENERATED_AT_CODES.knife, `刀 C 跑不起来（${messageOf(err)}）—— 这一格判不了，不许记绿`))
  }
}

/**
 * `DASH-11` ⑪：**盖章的值 + 页脚相对年龄 + 没有章时不许猜**。
 *
 * 四样并排（复审 D3/E4 与 E11 的值那一半）：
 *   (i) 注入时钟直接跑 `refreshSnapshot({root, now})` ⇒ 盘上 `generated_at` 等于那个时刻（±1 s）；
 *   (ii) 带章的快照 ⇒ 页脚有「· N 分钟前」（按注入时刻算出来的那一段）；
 *   (iii) 没有章的快照 ⇒ 页脚**没有**任何年龄后缀（不许「刚刚」）；
 *   (iv) 三把刀每把只翻自己那一码：去掉盖章 ⇒ `-GENERATED-AT-MISSING`；删 `ageSuffix(...)` ⇒ `-AGE-SUFFIX-MISSING`；
 *        缺章时猜「刚刚」⇒ `-AGE-SUFFIX-GUESSED`。
 *
 * @param {{rec:object, clientSource:string, rel:string, pluginIndex:string, problems:Array}} args
 */
async function generatedAtLeg({ rec, clientSource, rel, pluginIndex, problems }) {
  // (i) 值：注入时钟、进程内真跑写手
  const ws = workspaceOf('DASH-11', 'generated-at')
  seedWorkspace(ws, {
    route: routeFixture({ headline: '盖章现场 · 执行一 · 演示' }),
    localDays: { [DAY]: localFixture({ day: DAY, technical: { state: 'done' }, conversation: { state: 'running' } }) },
    updateDays: { [DAY]: { schema: 1, day: DAY, generation: 1, phase: 'done', updated_at: `${DAY}T09:00:00+08:00` } },
  })
  let written = null
  try {
    const engine = await import(pathToFileURL(pluginIndex).href)
    written = engine.refreshSnapshot({ root: ws, now: new Date(GENERATED_AT_ISO) })
  } catch (err) {
    problems.push(problem(GENERATED_AT_CODES.missing, `进程内调 refreshSnapshot({root, now}) 抛了（${messageOf(err)}）—— generated_at 的值这一腿判不了`))
    return
  }
  const state = fileState(snapshotOf(ws, rel))
  rec.readings.generated_at = { written, exists: state.exists, value: state.json === null ? null : state.json.generated_at }
  if (!state.exists || state.json === null) {
    problems.push(problem(GENERATED_AT_CODES.missing, `注入时钟跑完之后快照不在盘上 / 解析不了（${rel}）—— 值这一腿没有对象，不许记绿`))
    return
  }
  for (const p of generatedAtProblems(state.json, GENERATED_AT_ISO)) problems.push(p)

  // (ii)(iii) 页脚：带章 / 不带章
  const harness = createDashboardHarness(clientSource)
  if (!harness.ok) {
    problems.push(problem(CLIENT_CODES.unloadable, `渲染层装不进载具（${harness.reason}）—— 页脚「多久以前」判不了，不许记绿`))
    return
  }
  /** 带章视图：`generated_at` = 现在减 5 分钟（每次现算，免得"套件跑久了"把分钟数挪掉）。 */
  const stampedViewOf = () => ({ ...CLIENT_VIEW, generated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() })
  const sceneWith = async (view, on = harness) => {
    const page = { offset: 1, text: JSON.stringify(view), lines: 1, eof: true }
    return sceneOf(on, pageService(page), page)
  }
  const stamped = await sceneWith(stampedViewOf())
  const unstamped = await sceneWith({ ...CLIENT_VIEW })
  rec.readings.age_footer = {
    stamped: { footers: footerTextsOf(stamped), alert_text: stamped.alert_text },
    unstamped: { footers: footerTextsOf(unstamped), alert_text: unstamped.alert_text },
  }
  for (const p of ageSuffixProblems('带盖章（5 分钟前）', stamped, { minutes: 5 })) problems.push(p)
  for (const p of ageSuffixProblems('没有盖章', unstamped, { minutes: null })) problems.push(p)

  // (iv) 两把客户端刀：只改内存里的源码
  const knifeReadings = {}
  const runKnife = async (label, mutated, view, spec, want) => {
    if (mutated === clientSource) {
      problems.push(problem(GENERATED_AT_CODES.knife, `刀「${label}」没切动源码（那段字符串没找到）—— 这把刀不能证明判据会翻面`))
      return
    }
    const knifeHarness = createDashboardHarness(mutated)
    if (!knifeHarness.ok) {
      problems.push(problem(GENERATED_AT_CODES.knife, `刀「${label}」装不进载具（${knifeHarness.reason}）`))
      return
    }
    const got = await sceneWith(view, knifeHarness)
    const codes = ageSuffixProblems(`刀·${label}`, got, spec).map((p) => p.code)
    knifeReadings[label] = { codes, footers: footerTextsOf(got) }
    if (JSON.stringify(codes) !== JSON.stringify(want)) {
      problems.push(problem(GENERATED_AT_CODES.knife, `刀「${label}」翻出来的面是 ${JSON.stringify(codes)}，应当是 ${JSON.stringify(want)} —— 判据分不开这几件事`))
    }
  }
  await runKnife('删掉相对年龄', clientSource.replace('${ageSuffix(view.generated_at)}', ''), stampedViewOf(), { minutes: 5 }, [GENERATED_AT_CODES.suffixMissing])
  await runKnife(
    '缺章时猜刚刚',
    clientSource.replace('if (typeof generatedAt !== "string" || generatedAt === "") return "";', 'if (typeof generatedAt !== "string" || generatedAt === "") return " · 刚刚";'),
    { ...CLIENT_VIEW },
    { minutes: null },
    [GENERATED_AT_CODES.suffixGuessed],
  )
  rec.readings.age_footer_knives = knifeReadings

  // 刀 C：写手那一半（拷贝进运行根，产品树一个字节不动）
  await engineStampingKnife({ rec, pluginIndex, problems })
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
    const parseLeg = parseLegProblems(clientCode)
    rec.readings.renderer_parse = parseLeg.reading
    for (const p of parseLeg.problems) problems.push(p)
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
    // ⑧ 没有快照（`workspace-file/not-found`）只许画一条灰的 status 通知，不许画成红错
    await clientAbsentLeg({ rec, clientSource, rel, problems })
    // ⑨ 落点**不在被测树里**（复审 E1/E2：两半同源还不够，那个常量本身也不许住在被测树里）
    snapshotLocationLeg({ rec, rel, clientSource, problems })
    // ⑩ 视图守卫的十种「合法 JSON、形状不对」现场（复审 E3：这一条修复原来零样本）
    await clientViewShapeLeg({ rec, clientSource, problems })
    // ⑪ `generated_at` 的**值** + 页脚的「多久以前」+ 没有章时不许猜（复审 D3 / E11 的值那一半）
    await generatedAtLeg({ rec, clientSource, rel, pluginIndex, problems })

    caseFail(problems)
  })
})

// ── `DASH-11` ⑦：渲染层的读盘失败路径（行为那一腿）────────────────────────────
/** 读盘失败 / 成功 / 页形状 那一族的红因码。 */
const CLIENT_CODES = {
  unloadable: 'DASH11-CLIENT-UNLOADABLE',
  threw: 'DASH11-CLIENT-THREW',
  notPromise: 'DASH11-CLIENT-NOT-A-PROMISE',
  notRejected: 'DASH11-CLIENT-NOT-REJECTED',
  messageEmpty: 'DASH11-CLIENT-ERROR-EMPTY',
  noAlert: 'DASH11-CLIENT-NO-ERROR-STATE',
  buttonGone: 'DASH11-CLIENT-BUTTON-GONE',
  successBroken: 'DASH11-CLIENT-SUCCESS-BROKEN',
  /** 认不出的页形状：红条没点名形状（说不出拿到的是个什么东西）。 */
  shapeUnnamed: 'DASH11-CLIENT-SHAPE-UNNAMED',
  /** 认不出的页形状被吞了：没有红条 / readSnapshot 没被拒。 */
  shapeSwallowed: 'DASH11-CLIENT-SHAPE-SWALLOWED',
  pathDrift: 'DASH11-CLIENT-READ-PATH-DRIFT',
  knife: 'DASH11-KNIFE-VECTOR',
  knifeUnavailable: 'DASH11-KNIFE-UNAVAILABLE',
}

/** 「这个工作区还没有快照」那一族的红因码（一条子断言一个码）。 */
const ABSENT_CODES = {
  noNotice: 'DASH11-CLIENT-ABSENT-NO-NOTICE',
  notStatus: 'DASH11-CLIENT-ABSENT-NOT-STATUS',
  noPath: 'DASH11-CLIENT-ABSENT-NO-PATH',
  asAlert: 'DASH11-CLIENT-ABSENT-AS-ALERT',
  buttonGone: 'DASH11-CLIENT-ABSENT-BUTTON-GONE',
  knifeUnavailable: 'DASH11-ABSENT-KNIFE-UNAVAILABLE',
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
 * 一个现场：把远端包一层，`read` 被调用时把实参抓下来（**运行时**同源只能在这里看），
 * 需要时把返回值钉成一页。
 *
 * @param {{scene:Function}} on 载具
 * @param {unknown} remote 远端服务
 * @param {unknown} [page] 非 null ⇒ `read` 直接 resolve 这一页（不碰服务自己的 `read`）
 */
async function sceneOf(on, remote, page = null) {
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
                  return page === null ? remote.workspaceFiles.read(...args) : Promise.resolve(page)
                },
              },
            }
          : {}),
      }
  const reading = await on.scene({ remote: wrapped })
  reading.read_calls = calls
  return reading
}

/**
 * 一个"服务永远返回这一页"的远端。
 *
 * `read` 故意**同步抛**：这一格的返回值必须由 `sceneOf` 的采集层接住 —— 接不住就当场变成
 * `-THREW`，而不是悄悄落回服务自己的 `read` 又"碰巧"成功（那种绿是假的）。
 */
const pageService = (page) => ({
  workspaceFiles: {
    read() {
      throw new Error('PAGE-SERVICE-READ-CALLED —— 采集层没接住返回值（这一格判不了，不许记绿）')
    },
  },
})

/**
 * 「读成功」那一支的判据（**纯函数**；三种页形状共用一份）。
 *
 * 每格四样同时成立：
 *   ① `readSnapshot` resolve 出**新契约**的 `{text}`（不是裸字符串、也不是把页原样交出来）；
 *   ② `text` **逐字**等于那一页的正文（"取正文"这一步不许改字节）；
 *   ③ 树里画得出快照里的 headline —— 说明那段文本真的被解析成了视图；
 *   ④ 树里**没有** `role="alert"` —— 好读数不许报成坏读数。
 * ①里还带一条：**不许同时带 `absent`** —— 成功与"这个工作区没有快照"是互斥的两支。
 *
 * @param {string} name 现场名（红因里点名用）
 * @param {object} got 载具读数
 * @param {string} wantText 那一页的正文（逐字）
 */
function successProblems(name, got, wantText) {
  const problems = []
  const value = got.direct === null ? null : got.direct.value
  const isObject = value !== null && typeof value === 'object'
  if (got.direct === null || got.direct.status !== 'resolved') {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场「${name}」：readSnapshot 没有 resolve（${JSON.stringify(got.direct)}）`))
  } else if (!isObject || typeof value.text !== 'string') {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场「${name}」：resolve 出来的不是 {text}（${JSON.stringify(value)?.slice(0, 160)}）—— 读盘的两支是 {text} / {absent}`))
  } else if (value.text !== wantText) {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场「${name}」：{text} 不是那一页的正文 —— 取正文时被改了（实得 ${JSON.stringify(value.text).slice(0, 120)}）`))
  } else if ('absent' in value) {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场「${name}」：读成功却带着 absent=${JSON.stringify(value.absent)} —— 成功与"没有快照"两支同时成立`))
  }
  if (!got.texts.includes(CLIENT_VIEW.header.text)) {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场「${name}」：快照里的 headline ${JSON.stringify(CLIENT_VIEW.header.text)} 没画出来 —— 这段文本没有被解析成视图（树里的文字：${JSON.stringify(got.texts.slice(0, 8))}）`))
  }
  if (got.alert_text !== null) {
    problems.push(problem(CLIENT_CODES.successBroken, `成功现场「${name}」：画出了一条错误条（${JSON.stringify(got.alert_text)}）—— 好读数被报成了坏读数`))
  }
  return problems
}

/**
 * 「认不出的页形状」那一格：**那条红条就是量具**。
 *
 * 它必须告诉读的人"拿到的是个什么东西"（类型 + 顶层键 + 一段预览）；`{ok:false}` 这一页
 * 认不出正文，所以 `pickPageText` 要抛一条**点名形状**的错误。**不许**退化成
 * `"undefined" is not valid JSON` —— 那句只说 JSON 坏了，说不出拿到的是空、是对象、还是被包了一层
 * （2026-11-06 现场就是这一句，它把"形状不对"伪装成了"JSON 坏了"）。
 */
function shapeNamedProblems(got) {
  const problems = []
  const seen = new Set()
  /** 同一个红因码只报一条（与 `failureVisitProblems` 同一条口径）。 */
  const report = (code, message) => {
    if (seen.has(code)) return
    seen.add(code)
    problems.push(problem(code, message))
  }
  const alert = got.alert_text
  if (got.direct === null || got.direct.status !== 'rejected') {
    report(CLIENT_CODES.shapeSwallowed, `认不出的页形状没有被拒（readSnapshot 是 ${JSON.stringify(got.direct === null ? null : got.direct.status)}）—— 形状错误被吞成了"读到了"`)
  }
  if (alert === null) {
    report(CLIENT_CODES.shapeSwallowed, '认不出的页形状没有画成红条（树里没有 role="alert"）—— 读者看不到"读回来的东西认不出"')
    return problems
  }
  if (!/键|object/.test(alert)) {
    report(CLIENT_CODES.shapeUnnamed, `红条没有点名形状（文字=${JSON.stringify(alert)}）—— 应当含"键"或 object（类型 + 顶层键 + 预览那一句）`)
  }
  if (alert.includes('"undefined" is not valid JSON')) {
    report(CLIENT_CODES.shapeUnnamed, '红条就是现场那句 "undefined" is not valid JSON —— 它说不出拿到的是个什么东西（这一格整条的来历）')
  }
  return problems
}

/**
 * `DASH-11` 的那一腿：**读盘失败必须变成错误态，而且不许把组件带走**。
 *
 * 判据是本文件上面那个 `failureVisitProblems`（纯函数）—— 三个读者，同一份判据：
 *   · **真源码**：五种失败现场（服务不在 / 没有 `workspaceFiles` / `read` 不是函数 / `read` 同步抛 /
 *     `read` 返回 rejected）逐个走一遍；
 *   · **成功那一支**的反面：三种页形状（扁平 / `{value:{text}}` / `{result:{text}}`）都要落成同一张视图
 *     （`successProblems`），且 `read` 被调用时第二个实参必须逐字等于 `DASHBOARD_SNAPSHOT_REL`（运行时同源）；
 *   · **认不出的页形状**：`{ok:false}` 那一页的红条必须点名形状（`shapeNamedProblems`）；
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
   * @param {unknown} [page] 给了就把 `read` 的**返回值**钉成这一页（成功 / 认不出 那几格喂页形状）；
   *   不给 ⇒ 真调服务自己的 `read`（失败现场用）
   * @param {object} [on] 换一副载具（刀用；缺省就是真源码那一副）
   */
  const scene = (remote, page = null, on = harness) => sceneOf(on, remote, page)

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

  // ⑤ 成功那一支：**三种页形状**都必须落成同一张视图（`read` 的实参同源也在这一格里量）
  const SNAPSHOT_TEXT = JSON.stringify(CLIENT_VIEW)
  /**
   * 服务返回的那一页有三种成功形状 —— 喂的是**页本身**，不是我们替它包好的 `{text}`：
   * 浏览器那边拿到哪种形状是服务说了算，`pickPageText` 就是为这三种而存在。
   */
  const PAGE_SHAPES = {
    扁平页: { page: { offset: 1, text: SNAPSHOT_TEXT, lines: 1, eof: true }, shape: '{offset,text,lines,eof}' },
    包一层value: { page: { value: { text: SNAPSHOT_TEXT } }, shape: '{value:{text}}' },
    包一层result: { page: { result: { text: SNAPSHOT_TEXT } }, shape: '{result:{text}}' },
  }
  const successReadings = {}
  /** 第一个成功现场：三种形状走的是同一条 `read` 调用，读盘实参只在它身上量一次。 */
  let happy = null
  for (const [name, spec] of Object.entries(PAGE_SHAPES)) {
    const got = await scene(pageService(spec.page), spec.page)
    successReadings[name] = {
      page: spec.shape,
      direct_status: got.direct?.status ?? null,
      resolved: got.direct?.value ?? null,
      headline_drawn: got.texts.includes(CLIENT_VIEW.header.text),
      alert_text: got.alert_text,
      throws: got.throws,
      read_calls: got.read_calls,
    }
    for (const p of successProblems(`${name}（${spec.shape}）`, got, SNAPSHOT_TEXT)) problems.push(p)
    if (happy === null) happy = got
  }
  rec.readings.client_success = successReadings
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

  // ⑥ 认不出的页形状：红条必须**点名形状**（这整格的来历就是现场那句 `"undefined" is not valid JSON`）
  const badPage = { ok: false }
  const bad = await scene(pageService(badPage), badPage)
  rec.readings.client_bad_shape = {
    page: '{ok:false}',
    direct: bad.direct,
    alert_text: bad.alert_text,
    trigger_present: bad.trigger_present,
    root_present: bad.root_present,
  }
  for (const p of shapeNamedProblems(bad)) problems.push(p)

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

// ── `DASH-11` ⑧：`workspace-file/not-found` 是一条状态，不是故障 ────────────────────
/**
 * 「这个工作区还没有快照」那一格的判据（**纯函数**；两个现场共用一份）。
 *
 * 一条子断言一个码，缺哪条说哪条：
 *   ① `-ABSENT-NO-NOTICE`：树里没有 `[data-dashboard-absent]` 那条通知；
 *      有通知之后再判两样 —— `-ABSENT-NOT-STATUS`（`role` 必须是 `status`，不是告警、也不是对话框）、
 *      `-ABSENT-NO-PATH`（通知里带着**远端报的那个路径**，读的人知道该去哪儿找）；
 *   ② `-ABSENT-AS-ALERT`：树里**没有** `role="alert"` —— 没有快照不是故障，画成红条就是"看板崩了"；
 *   ③ `-ABSENT-BUTTON-GONE`：槽位的根与触发器**都还在** —— 这一下不许把组件带走。
 *
 * @param {string} label 现场名
 * @param {object} got 载具读数
 * @param {string} wantPath 通知里该出现的那个路径
 */
function absentVisitProblems(label, got, wantPath) {
  const problems = []
  const notice = got.absent ?? null
  if (notice === null) {
    problems.push(problem(ABSENT_CODES.noNotice, `现场「${label}」：树里没有 [data-dashboard-absent] 通知（readSnapshot=${JSON.stringify(got.direct === null ? null : got.direct.status)} · 红条=${JSON.stringify(got.alert_text)}）—— "这个工作区还没有快照"被画成了别的东西`))
  } else {
    if (notice.role !== 'status') {
      problems.push(problem(ABSENT_CODES.notStatus, `现场「${label}」：通知的 role 是 ${JSON.stringify(notice.role)}，应当是 status —— 它是一条读盘状态，不是告警、也不是对话框`))
    }
    if (!String(notice.text ?? '').includes(wantPath)) {
      problems.push(problem(ABSENT_CODES.noPath, `现场「${label}」：通知里没有它找的那个路径 ${JSON.stringify(wantPath)}（实得 ${JSON.stringify(notice.text)}）—— 读的人不知道该去哪儿找那份快照`))
    }
  }
  if (got.alert_text !== null) {
    problems.push(problem(ABSENT_CODES.asAlert, `现场「${label}」：同时画出了一条 role="alert" 的红条（${JSON.stringify(got.alert_text)}）—— 没有快照是状态，不是故障`))
  }
  if (!got.root_present || !got.trigger_present) {
    problems.push(problem(ABSENT_CODES.buttonGone, `现场「${label}」：通知之后槽位的根 / 触发器不见了（root=${got.root_present} · trigger=${got.trigger_present}）—— 这一下把组件带走了`))
  }
  return problems
}

/**
 * `DASH-11` 的那一腿：**没有快照 = 一条状态**。
 *
 * 现场：另一个工作区（`RealisticAccessories`）里那份快照**根本不存在**（账本没在那儿跑过），
 * 远端用 `workspace-file/not-found` 拒；面板却画了一条红错 —— 读的人会把它读成"看板坏了"。
 * 口径要的是：一条灰的 `role="status"` 通知（一句人话 + 它找的那个路径），**没有** `role="alert"`，
 * 按钮照旧在。
 *
 * 两个读者：
 *   · **真源码**：两个现场（远端报了路径 / 远端没报路径 ⇒ 用 `SNAPSHOT_PATH`）；远端报的路径
 *     **故意不等于** `SNAPSHOT_PATH` —— 不然判据分不开"用上了远端报的那一条"与"抄了自己的常量"；
 *   · **红基线**：`46ddea6` 那一版真字节（`pickPageText` 有了、`absent` 那一支还没有）——
 *     它必须**只**翻 `-ABSENT-NO-NOTICE` + `-ABSENT-AS-ALERT`（按钮那一码不许跟着翻：
 *     判据要分得开"画错了"与"组件没了"）。
 *
 * @param {{rec:object, clientSource:string, rel:string, problems:Array}} args
 */
async function clientAbsentLeg({ rec, clientSource, rel, problems }) {
  const harness = createDashboardHarness(clientSource)
  if (!harness.ok) {
    problems.push(problem(CLIENT_CODES.unloadable, `渲染层装不进载具（${harness.reason}）—— "没有快照要画状态"这一路判不了，不许记绿`))
    return
  }
  /** 远端用 `workspace-file/not-found` 拒了。`details.path` 给不给是两种现场。 */
  const notFoundService = ({ path: filePath } = {}) => ({
    workspaceFiles: {
      read: async () => {
        const err = new Error('SIMULATED-WORKSPACE-FILE-NOT-FOUND')
        err.code = 'workspace-file/not-found'
        if (filePath !== undefined) err.details = { path: filePath }
        throw err
      },
    },
  })
  /** 远端报的路径（与组件里那个 `SNAPSHOT_PATH` 常量**不同**）。 */
  const REMOTE_PATH = 'E:/RealisticAccessories/presets/agenia/.runtime/state/dashboard/view.json'
  const scenes = [
    { label: '远端报了路径', remote: notFoundService({ path: REMOTE_PATH }), want: REMOTE_PATH },
    { label: '远端没报路径', remote: notFoundService(), want: rel },
  ]
  const readings = {}
  for (const spec of scenes) {
    const got = await sceneOf(harness, spec.remote)
    readings[spec.label] = {
      read_calls: got.read_calls,
      direct_status: got.direct === null ? null : got.direct.status,
      direct_message: got.direct === null ? null : got.direct.message,
      notice: got.absent,
      alert_text: got.alert_text,
      trigger_present: got.trigger_present,
      root_present: got.root_present,
      throws: got.throws,
      /** 读数（不断言）：那条远端错误的原因有没有被整段倒进通知里。 */
      dumps_error: got.absent !== null && String(got.absent.text ?? '').includes('SIMULATED-WORKSPACE-FILE-NOT-FOUND'),
    }
    for (const p of absentVisitProblems(spec.label, got, spec.want)) problems.push(p)
  }
  rec.readings.client_absent = readings

  // 红基线：**缺 `absent` 那一支**的那一版真字节
  const old = clientSourceAtCommit({ commit: PRE_ABSENT_COMMIT })
  const provesPre = old.available && old.text.includes('pickPageText') && !old.text.includes('data-dashboard-absent')
  rec.readings.client_absent_knife_source = { commit: PRE_ABSENT_COMMIT, available: old.available, why: old.why, sha256: old.sha256, proves_pre_absent: provesPre }
  if (!old.available) {
    caseHold(rec, ABSENT_CODES.knifeUnavailable, `拿不到 ${PRE_ABSENT_COMMIT} 那一版的真字节（${old.why}）—— "这一格抓得住那次真缺陷"判不了`)
    return
  }
  if (!provesPre) {
    problems.push(problem(CLIENT_CODES.knife, `${PRE_ABSENT_COMMIT} 那一版不是"缺 absent 那一支"的那一版（指纹对不上：pickPageText=${old.text.includes('pickPageText')} · data-dashboard-absent=${old.text.includes('data-dashboard-absent')}）—— 这把刀证明的是别的东西`))
    return
  }
  const oldHarness = createDashboardHarness(old.text)
  if (!oldHarness.ok) {
    problems.push(problem(CLIENT_CODES.knife, `${PRE_ABSENT_COMMIT} 那一版装不进载具（${oldHarness.reason}）—— 这把刀切不动`))
    return
  }
  const oldGot = await sceneOf(oldHarness, notFoundService({ path: REMOTE_PATH }))
  const opened = absentVisitProblems(`红基线·${PRE_ABSENT_COMMIT}`, oldGot, REMOTE_PATH).map((p) => p.code).sort()
  const want = [ABSENT_CODES.asAlert, ABSENT_CODES.noNotice].sort()
  rec.readings.client_absent_knife = { codes: opened, want, notice: oldGot.absent, alert_text: oldGot.alert_text }
  if (JSON.stringify(opened) !== JSON.stringify(want)) {
    problems.push(problem(CLIENT_CODES.knife, `${PRE_ABSENT_COMMIT} 那一版在"没有快照"现场翻出来的是 ${JSON.stringify(opened)}，应当恰好是 ${JSON.stringify(want)}（没有通知 + 画成红条；按钮那一码不许跟着翻）—— 这一格对那次真缺陷是瞎的，或者连别的面一起抓`))
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
