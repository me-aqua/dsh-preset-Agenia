/**
 * 看板（客户端 dashboard）的**量具**：夹具 + 官方像素层的取件 + 源码结构提取。
 *
 * 三份用例（`integration/dash0{1,2,3}-*.test.mjs`）共用这一份 —— 夹具与提取器只有一处实现，
 * 否则"官方那一段长什么样"会有三种读法。
 *
 * 四条纪律：
 *   ① **夹具照契约手写**（`.team/test/2026-11-04/技术契约-客户端看板.md` §3 的账本形状），
 *      **不从实现反推**；形状与活树上那四份真文件同源（`route.mjs` / `bug-ledger.mjs` / `local-state.mjs` / `state.mjs`）。
 *   ② **写的只有运行根**（`<run-root>/fixtures/…`）；活树 `.team/` 与 `presets/**` 一个字节都不碰
 *      （真实根由 `run-all.mjs` 的 before/after 两次哈希看着）。
 *   ③ 官方像素层**只读**：先在抽屉里的只读副本里找，找不到再用 `.tools/asar-cli/extract.mjs` 解到运行根。
 *      两者都没有 ⇒ 由调用方记 `HOLD`（点名 `tried`），**不拿"没找到"当"没这段源码"**。
 *   ④ 提取器**不执行**被测代码：只做括号配对 + 顶层切分（不引第三方解析器，不 eval）。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PATHS } from './env.mjs'
import { caseHold, runRoot } from './evidence.mjs'
import { platformReading } from './platform.mjs'

// ── 契约钉死的两个落点（改了就是重开第 2 关，见契约 §1）────────────────────────
/**
 * 🔴 **只有一个例外，而且必须出声**：`AGENIA_DASH_MODULE` / `AGENIA_DASH_CLIENT` / `AGENIA_DASH_CLIENT_PKG`
 * 可以把被测面指到别处 —— **只给"阳性对照 / 刀"用**（证明这九条判据在"照契约写的最小实现"上会绿、
 * 在被改坏时各自会红）。一被设置，每一条用例都记 `HOLD`（`DASH-SUT-OVERRIDE`）：
 * 那一跑**不是对现役的判据**，不许拿来当验收读数（同 `AGENIA_MJUDGE_CHARTER_ROOT` 的规矩）。
 */
const overrideOf = (name) => {
  const raw = process.env[name]
  return typeof raw === 'string' && raw.trim() !== '' ? path.resolve(raw.trim()) : null
}
export const SUT_OVERRIDE = {
  module: overrideOf('AGENIA_DASH_MODULE'),
  client: overrideOf('AGENIA_DASH_CLIENT'),
  client_pkg: overrideOf('AGENIA_DASH_CLIENT_PKG'),
}
export const SUT_OVERRIDDEN = SUT_OVERRIDE.module !== null || SUT_OVERRIDE.client !== null || SUT_OVERRIDE.client_pkg !== null

/** 每一条用例开头都调：被指到别处就记 HOLD（红仍然压过一切，见 `runCase` 的三态）。 */
export function noteSutOverride(rec) {
  if (!SUT_OVERRIDDEN) return
  caseHold(rec, 'DASH-SUT-OVERRIDE', `AGENIA_DASH_MODULE/CLIENT 把被测面指到了别处（${JSON.stringify(SUT_OVERRIDE)}）—— 这一跑是阳性对照 / 刀，不是对现役的判据`)
}

/** 看板数据层（Node、纯函数面）。 */
export const DASH_MODULE = SUT_OVERRIDE.module ?? path.join(PATHS.repo, 'presets', 'agenia', 'lib', 'dashboard.mjs')
/** 看板渲染层（浏览器模块，官方同款 `__ModuleLoader__` 装载）。 */
export const DASH_CLIENT = SUT_OVERRIDE.client ?? path.join(PATHS.repo, 'presets', 'agenia', 'client-ui-dashboard', 'lib', 'client.js')
/** 渲染层的包身份（能不能被当成插件挂上，靠它）。 */
export const DASH_CLIENT_PKG = SUT_OVERRIDE.client_pkg ?? path.join(PATHS.repo, 'presets', 'agenia', 'client-ui-dashboard', 'package.json')

// ── 官方像素层：只读副本优先，其次 asar 解到运行根 ────────────────────────────
/**
 * 🔴 平台代码在 `app.asar` 里住在 **`dsh/`** 下（`platform.mjs` 读平台包用的也是
 * `dsh/node_modules/@deepseek-ai/dsh/package.json`）。设计抽屉里那两份只读副本是从 asar 的
 * `dsh/` 这一层解出来的 —— 所以 `extract.mjs` 的内层路径**必须带这个前缀**：
 * 少了它，工具会打印 `MISS: …` 并 exit 0（`F5` 修参数形状时顺手抓到的第二个错）。
 */
const ASAR_PLATFORM_ROOT = 'dsh'
const OFFICIAL_PACKAGE = path.join('node_modules', '@deepseek-ai', 'dsh-experimental-client-ui-agent-team', 'lib', 'client.js')
/** asar 内的完整路径（`extract.mjs` 的位置参数 / 只读副本的相对路径都用它）。 */
const OFFICIAL_INNER = path.join(ASAR_PLATFORM_ROOT, OFFICIAL_PACKAGE)
/** 设计岗 2026-11-04 用 asar-cli 解出来的只读副本（`.team/` 不进 git，所以它不是唯一来源）。 */
export const OFFICIAL_COPY_CANDIDATES = [
  path.join(PATHS.repo, '.team', 'design', '2026-11-04', 'extracted', OFFICIAL_INNER),
  path.join(PATHS.repo, '.team', 'design', '2026-11-04', 'panel-ref', OFFICIAL_INNER),
]

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()

/**
 * 官方件取不到的**四种原因，四种码**（`F5`：把"调用写错"说成"这台机器上没有"是这一格的病根）。
 *
 * 为什么要分开：这四种的修法完全不同 ——
 *   · `NO-ASAR`       ⇒ 机器 / 安装落点的事（不是这段代码能修的）；
 *   · `TOOL-MISSING`  ⇒ 仓库里少了 `.tools/asar-cli/extract.mjs`；
 *   · `CALL-FAILED`   ⇒ **我们调用它的方式**不对（参数形状 / 退出码非 0）；
 *   · `TARGET-MISSING`⇒ 调用成功但没解出目标（asar 里没有这个包，或内层路径写错）。
 * 塌成一个 `DASH-OFFICIAL-ABSENT`，读的人会先去装工具 —— 2026-11-04 的评审就是这么被引错的。
 */
export const OFFICIAL_FAIL = {
  noAsar: 'DASH-OFFICIAL-NO-ASAR',
  toolMissing: 'DASH-OFFICIAL-TOOL-MISSING',
  callFailed: 'DASH-OFFICIAL-CALL-FAILED',
  targetMissing: 'DASH-OFFICIAL-TARGET-MISSING',
  notAttempted: 'DASH-OFFICIAL-NOT-ATTEMPTED',
}

/**
 * 官方 `client.js` 的取件（**只读**）。
 *
 * @param {{ extract?: boolean, asar?: string|null, inner?: string, toolPath?: string|null }} [options]
 *   `extract: true` ⇒ 副本都不在时从 `.tools/asar-cli/extract.mjs` 解到 `<run-root>/fixtures/dash-official/`。
 *   `asar` / `inner` / `toolPath` 只为**尺子的自证与刀**留的注入口（默认走 `platformReading()` +
 *   仓库里那份工具 + 官方包路径）—— 生产调用方一个都不传。
 * @returns {{ok:boolean, path:string|null, source:string|null, bytes:number|null, sha256:string|null,
 *            origin:string|null, tried:string[], reason:string|null,
 *            code:string|null, failure:string|null, platform:object|null}}
 */
export function officialClient({ extract = true, asar = null, inner = OFFICIAL_INNER, toolPath = null } = {}) {
  const tried = []
  // 显式注入了 asar / 内层路径 / 工具 ⇒ 这是**尺子的自证与刀**（`F5` 的分型必须能各走各的），
  // 跳过只读副本；生产调用方一个都不传 ⇒ 照旧"抽屉优先、asar 兜底"。
  const forced = asar !== null || toolPath !== null || inner !== OFFICIAL_INNER
  if (!forced) {
    for (const candidate of OFFICIAL_COPY_CANDIDATES) {
      tried.push(candidate)
      if (existsSync(candidate)) {
        return {
          ok: true,
          path: candidate,
          source: readFileSync(candidate, 'utf8'),
          bytes: statSync(candidate).size,
          sha256: sha256(candidate),
          origin: 'design-drawer-copy',
          tried,
          reason: null,
          code: null,
          failure: null,
          platform: null,
        }
      }
    }
  }
  if (!extract) {
    return {
      ok: false, path: null, source: null, bytes: null, sha256: null, origin: null, tried,
      code: OFFICIAL_FAIL.notAttempted,
      failure: 'not-attempted',
      reason: '调用方没有允许 asar 取件，而设计抽屉的两处只读副本都不在',
      platform: null,
    }
  }
  const tool = toolPath ?? path.join(PATHS.repo, '.tools', 'asar-cli', 'extract.mjs')
  // 平台读数（`platform.mjs`）是 asar 路径的**唯一来源**（四级候选；④ 会自报"是猜的"）。
  const platform = asar === null ? platformReading() : null
  const asarFile = asar ?? platform?.asar ?? null
  const innerPath = inner.split(path.sep).join('/')
  // 注入口走**单独的 out 目录**，且每次都真调一次：否则"先跑过一次好取件"会让后面的坏样本
  // 看到缓存目标就短路成 ok（`F5` 的分型自证必须各走各的，不能共享缓存）。
  const outDir = path.join(runRoot(), 'fixtures', forced ? 'dash-official-probe' : 'dash-official')
  const target = path.join(outDir, ...inner.split('/'))
  tried.push(`asar-cli extract → ${target}（asar=${asarFile ?? '(无)'} · inner=${innerPath}）`)
  if (asarFile === null || !existsSync(asarFile)) {
    const why = asar !== null
      ? `给的 asar 不在盘上：${asarFile}`
      : `这台机器上找不到 app.asar（platformReading 的四级候选全不在盘：${(platform?.tried ?? []).join(' · ') || '—'}）`
    return {
      ok: false, path: null, source: null, bytes: null, sha256: null, origin: null, tried,
      code: OFFICIAL_FAIL.noAsar,
      failure: 'no-asar',
      reason: `${why} —— 官方件没有可比对的对象`,
      platform,
    }
  }
  if (!existsSync(tool)) {
    return {
      ok: false, path: null, source: null, bytes: null, sha256: null, origin: null, tried,
      code: OFFICIAL_FAIL.toolMissing,
      failure: 'tool-missing',
      reason: `取件工具不在盘上：${tool}（仓库里的 .tools/asar-cli/extract.mjs 应当随代码一起在）—— 不是"这台机器上没有官方包"`,
      platform,
    }
  }
  if (!existsSync(target) || forced) {
    // 解包器自己是一次外部调用；失败就照实记（不吞）。它只读 asar。
    try {
      mkdirSync(path.dirname(target), { recursive: true })
      // 🔴 **位置参数**：`node extract.mjs <asar> <outDir> <innerPath…>`（不是 `--out=` / `--path=`）。
      //    2026-11-04 的调用写成两个 flag ⇒ 工具打印用法并 exit 2，却被报成"这台机器上没有"（`F5`）。
      const r = spawnSync(process.execPath, [tool, asarFile, outDir, innerPath], {
        cwd: PATHS.repo,
        encoding: 'utf8',
      })
      const status = r.status ?? 1
      // "工具说的那句"要能读：优先挑带诊断信息的那一行（用法 / MISS / Error / ENOENT），
      // 否则 stderr 的第一行常常只是 `<anonymous_script>:1` 这种栈头，读的人看不出错因。
      const firstLine = (text) => {
        const lines = String(text ?? '').split('\n').map((s) => s.trim()).filter((s) => s !== '')
        return lines.find((s) => /用法|MISS|Error|error|Unexpected|invalid|ENOENT|EACCES/.test(s)) ?? lines[0] ?? ''
      }
      if (status !== 0) {
        const said = firstLine(r.stderr) || firstLine(r.stdout) || '(工具没有输出)'
        return {
          ok: false, path: null, source: null, bytes: null, sha256: null, origin: null, tried,
          code: OFFICIAL_FAIL.callFailed,
          failure: 'call-failed',
          reason: `官方 client.js 取件**调用失败**（不是"这台机器上没有"）：${path.basename(tool)} exit ${status}：${said}`
            + `（asar=${asarFile} · inner=${innerPath}${platform === null ? '' : ` · 平台读数：asar 取自 ${platform.source ?? '—'}`}）`,
          platform,
        }
      }
      const okLine = firstLine(r.stdout)
      if (okLine !== '') tried.push(`asar-cli exit 0：${okLine}`)
    } catch (err) {
      return {
        ok: false, path: null, source: null, bytes: null, sha256: null, origin: null, tried,
        code: OFFICIAL_FAIL.callFailed,
        failure: 'call-failed',
        reason: `官方 client.js 取件**调用抛错**（不是"这台机器上没有"）：${String(err?.message ?? err)}`,
        platform,
      }
    }
  }
  if (existsSync(target)) {
    return {
      ok: true,
      path: target,
      source: readFileSync(target, 'utf8'),
      bytes: statSync(target).size,
      sha256: sha256(target),
      origin: 'asar-extracted',
      tried,
      reason: null,
      code: null,
      failure: null,
      platform,
    }
  }
  return {
    ok: false, path: null, source: null, bytes: null, sha256: null, origin: null, tried,
    code: OFFICIAL_FAIL.targetMissing,
    failure: 'target-missing',
    reason: `取件工具跑完了（exit 0），但没有解出 ${innerPath} —— asar 里没有这个包，或内层路径写错（tried=${tried.join(' · ')}）`,
    platform,
  }
}

/**
 * 活树**真源根**在不在盘上 —— "判不了"与"红"的分界（`F6`）。
 *
 * 病根：`.team/` 与 `presets/agenia/.runtime/` 里的数据**不在提交里**。干净 clone 上它们本来就不存在，
 * 这时 DASH-01/02 若照常判"指得到真源"，会把自己解析器的前置失败写成 `DASH-RULER-BROKEN`（RED）——
 * 读的人会以为被评的代码坏了。真实源根不在 = **这一格判不了**（HOLD，点名缺的那几份）。
 *
 * 🔴 **不能拿 `.team/` 本身当分界**：`run-all.mjs` 的运行根必须落在 `<repo>/.team/test/…`（根守卫），
 *    所以**干净 clone 上跑测试时 `.team/` 也存在** —— 拿它判"活树数据在不在"会把这条 HOLD 永远关掉。
 *    这里看的是**四份真源的根**（route / bug / local / update），跑测试不会创建它们。
 *
 * ⚠️ 只判**根**：任一根在盘而某一份文件缺 ⇒ 那是真问题（RED，照旧）。
 */
export const LIVE_DATA_ROOTS = {
  route: PATHS.realRouteRoot,
  bug: path.join(PATHS.repo, '.team', 'bug'),
  local: path.join(PATHS.repo, '.team', 'state', 'local'),
  update: path.join(PATHS.repo, 'presets', 'agenia', '.runtime', 'state', 'update'),
}
/** 四份真源根的**路径清单**（判"根在不在"用这一张；调用方一般传默认值）。 */
export const LIVE_DATA_ROOT_LIST = Object.values(LIVE_DATA_ROOTS)

/**
 * @param {string[]} [roots] 要检查的根（默认 = 四份真源根；尺子的自证可以传一个夹具目录）
 * @returns {{roots: string[], present: boolean, clone: boolean, verdict: string,
 *            families: Record<string, boolean>, roots_present: string[], note: string}}
 */
export function liveDataPresence(roots = LIVE_DATA_ROOT_LIST) {
  const list = Array.isArray(roots) ? roots : [roots]
  const families = {}
  for (const [key, dir] of Object.entries(LIVE_DATA_ROOTS)) families[key] = existsSync(dir)
  const rootsPresent = list.filter((dir) => existsSync(dir))
  const present = rootsPresent.length > 0
  return {
    roots: list,
    present,
    clone: !present,
    verdict: present ? 'data-root-present' : 'data-not-in-a-commit-clone',
    families,
    roots_present: rootsPresent,
    note: '`.team/`（账本 / 本地状态）与 `presets/agenia/.runtime/`（相位）是数据，不进提交 —— '
      + '干净 clone 上这四份真源的根都不存在。任一根在 = 缺文件是真问题（红）；一根都不在 = 判不了（HOLD）。'
      + ' ⚠️ 不拿 `.team/` 本身判：运行根就在 `.team/test/` 下，clone 上跑测试时它也会被建出来。',
  }
}

/** 数据层取件（动态 import；理由见上面 `loadDashboard` 的注释）。 */
/**
 * 动态取看板数据层（**不许静态 import**：模块今天还不存在，静态 import 会让整个文件加载失败 ⇒
 * 一条用例都结算不出来，而结算器会把那读成"半跑"而不是"这条红"）。
 *
 * @returns {Promise<{ok:boolean, mod:object|null, file:string, reason:string|null}>}
 */
export async function loadDashboard() {
  if (!existsSync(DASH_MODULE)) return { ok: false, mod: null, file: DASH_MODULE, reason: '模块不在盘上' }
  try {
    const mod = await import(pathToFileURL(DASH_MODULE).href)
    return { ok: true, mod, file: DASH_MODULE, reason: null }
  } catch (err) {
    return { ok: false, mod: null, file: DASH_MODULE, reason: `import 失败：${String(err?.message ?? err)}` }
  }
}

// ── 夹具（照契约 §3 的账本形状手写）─────────────────────────────────────────
/** 一份自洽的路线账本：目标 · 大阶段 · headline 与派生值一致 · 一条在做的任务。 */
export function routeFixture(over = {}) {
  const base = {
    schema: 1,
    goal: { id: 'genia-demo', title: '演示目标' },
    stages: [{ id: 'stage-demo', name: '执行一 · 演示', order: 1, state: 'current', boss_gate: 'none', exit_criteria: [], kind: 'build' }],
    current_stage_id: 'stage-demo',
    tasks: [
      {
        id: 'task-demo-01',
        stage_id: 'stage-demo',
        title: '把看板做出来',
        status: 'in_progress',
        five_gate_state: '契约与测试',
        note: '第一行只读 headline',
        kind: 'implement',
        entry_id: null,
        ticket_id: null,
        session_ref: null,
        session_exit: null,
        heartbeat: null,
        fence: null,
      },
    ],
    current_task_id: 'task-demo-01',
    tickets: [
      { id: 'ticket-demo-01', title: '票一', source: 'boss:2026-11-04#1', next_step: 'x', acceptance: 'y', status: 'open', legacy_status: null, void_reason: null },
      { id: 'ticket-demo-02', title: '票二', source: 'boss:2026-11-04#2', next_step: 'x', acceptance: 'y', status: 'done', legacy_status: null, void_reason: null },
    ],
    pauses: [],
    transitions: [],
    headline: '演示目标 · 执行一 · 演示',
    version: 3,
    created_at: '2026-11-04T09:00:00+08:00',
    updated_at: '2026-11-04T09:00:00+08:00',
  }
  return { ...base, ...over }
}

/** 一份 bug 台账：两条 bug（一条无处置 = open、一条已处置）+ 一条 observation（不计）。 */
export function bugFixture(over = {}) {
  const base = {
    schema: 1,
    version: 2,
    entries: [
      { id: 'bug-demo-01', kind: 'bug', disposition: null, phenomenon: '甲', evidence: ['e1'] },
      { id: 'bug-demo-02', kind: 'bug', disposition: 'adopted', phenomenon: '乙', evidence: ['e2'] },
      { id: 'bug-demo-03', kind: 'observation', disposition: null, phenomenon: '丙', evidence: ['e3'] },
    ],
    archived: [],
    updated_at: '2026-11-04T09:00:00+08:00',
  }
  return { ...base, ...over }
}

/** 一份本地状态：技术评审已回、会话评审没回（缺 1 段）。 */
export function localFixture(over = {}) {
  const base = {
    schema: 1,
    day: '2026-11-04',
    project: 'demo',
    technical: { state: 'done', claim: { job_id: 'job-1' }, receipt_version: 1 },
    conversation: { state: 'running', claim: { job_id: 'job-2' } },
    memory_review: { state: 'done', claim: { job_id: 'job-3' } },
    updated_at: '2026-11-04T09:00:00+08:00',
  }
  return { ...base, ...over }
}

/** 一份当天的记忆更新相位。 */
export function updateFixture(over = {}) {
  const base = { schema: 1, day: '2026-11-04', generation: 1, phase: 'done', updated_at: '2026-11-04T09:00:00+08:00' }
  return { ...base, ...over }
}

/** 一个"什么源都不在"的空目录（用来造"文件不在"那一态）。 */
export function emptyWorkspace(caseId, purpose) {
  const dir = path.join(runRoot(), 'fixtures', `${String(caseId).toLowerCase()}-${purpose}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 把四份源写成一个工作区（**只有运行根里**）。
 *
 * 每份的值：对象 ⇒ 写 JSON；`'corrupt'` ⇒ 写半截 JSON（读不出来）；`'schema'` ⇒ 写 `[]`（读得出、但不是对象）；
 * `null` / `undefined` ⇒ **不写**（文件不在）。
 *
 * @returns {{dir:string, day:string, files:{route:string,bug:string,local:string,update:string},
 *            present:{route:boolean,bug:boolean,local:boolean,update:boolean}}}
 */
export function writeSources(caseId, purpose, { route = routeFixture(), bug = bugFixture(), local = localFixture(), update = updateFixture(), day = '2026-11-04' } = {}) {
  const dir = emptyWorkspace(caseId, purpose)
  const files = {
    route: path.join(dir, '.team', 'route', 'current.json'),
    bug: path.join(dir, '.team', 'bug', 'ledger.json'),
    local: path.join(dir, '.team', 'state', 'local', `${day}.json`),
    update: path.join(dir, '.runtime', 'state', 'update', `${day}.json`),
  }
  const present = {}
  for (const [key, value] of Object.entries({ route, bug, local, update })) {
    const file = files[key]
    if (value === null || value === undefined) {
      present[key] = false
      continue
    }
    mkdirSync(path.dirname(file), { recursive: true })
    const text = value === 'corrupt' ? '{ "schema": 1, ' : value === 'schema' ? '[]' : `${JSON.stringify(value, null, 2)}\n`
    writeFileSync(file, text, 'utf8')
    present[key] = true
  }
  return { dir, day, files, present }
}

/** 把一份 `readDashboardSources` 的入参拼出来（四个路径原样给，读者不猜根）。 */
export const sourcePathsOf = (files) => ({ routeFile: files.route, bugFile: files.bug, localFile: files.local, updateFile: files.update })

// ── 活树上的四份真源（只读）─────────────────────────────────────────────────
/**
 * 活树里"最新一天"的两份按天的源（`local/<day>.json` / `update/<day>.json`）。
 * **不写死 2026-11-04**：换一天再跑，判据跟着那一天的盘走。
 */
export function latestDaySources() {
  const pick = (dir) => {
    if (!existsSync(dir)) return null
    const days = readdirSync(dir)
      .map((name) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name))
      .filter((m) => m !== null)
      .map((m) => m[1])
      .sort()
    if (days.length === 0) return null
    const day = days[days.length - 1]
    return { day, file: path.join(dir, `${day}.json`) }
  }
  return {
    route: { file: path.join(PATHS.realRouteRoot, 'current.json') },
    bug: { file: path.join(PATHS.repo, '.team', 'bug', 'ledger.json') },
    local: pick(path.join(PATHS.repo, '.team', 'state', 'local')),
    update: pick(path.join(PATHS.repo, 'presets', 'agenia', '.runtime', 'state', 'update')),
  }
}

// ── 源码结构提取（不执行被测代码）───────────────────────────────────────────
const QUOTES = new Set(["'", '"', '`'])

function skipString(text, i) {
  const q = text[i]
  let j = i + 1
  while (j < text.length) {
    if (text[j] === '\\') {
      j += 2
      continue
    }
    if (text[j] === q) return j
    j += 1
  }
  return text.length - 1
}

/** 从 `openIndex`（一个 `[` / `(` / `{`）找配对的闭括号；找不到 ⇒ -1。 */
export function matchBracket(text, openIndex) {
  const open = text[openIndex]
  const close = { '[': ']', '(': ')', '{': '}' }[open]
  if (close === undefined) return -1
  let depth = 0
  for (let i = openIndex; i < text.length; i += 1) {
    const c = text[i]
    if (QUOTES.has(c)) {
      i = skipString(text, i)
      continue
    }
    if (c === open) depth += 1
    else if (c === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 按**顶层**逗号切（括号/方括号/花括号与字符串里的逗号不切）。 */
export function splitTopLevel(text) {
  const parts = []
  let start = 0
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (QUOTES.has(c)) {
      i = skipString(text, i)
      continue
    }
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) depth -= 1
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((s) => s.trim()).filter((s) => s !== '')
}

/**
 * 一段从某个偏移切下来的表达式 —— 只取**配对完整**的那一段。
 *
 * 两种尾巴都要切掉：
 *   · 以括号开头（`[…]`）⇒ 取到配对闭括号为止；
 *   · 不以括号开头（`team.members.length }`）⇒ 在第一处**没有对应开括号**的闭括号前收住
 *     （那是 props 对象的 `}` 被切进来了）。
 */
export function balancedExpr(segment) {
  const text = String(segment).trim()
  if (text === '') return text
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (QUOTES.has(c)) {
      i = skipString(text, i)
      continue
    }
    if ('[{('.includes(c)) depth += 1
    else if (')]}'.includes(c)) {
      if (depth === 0) return text.slice(0, i).trim()
      depth -= 1
    }
  }
  return text
}

/** 一段 `jsx("div", {…})` / `jsxs)("div", {…})` 调用的结构（只认形状）。 */
export function parseElementCall(text, callIndex) {
  const parenOpen = text.indexOf('(', callIndex)
  if (parenOpen < 0) return null
  const parenClose = matchBracket(text, parenOpen)
  if (parenClose < 0) return null
  const args = splitTopLevel(text.slice(parenOpen + 1, parenClose))
  if (args.length === 0) return null
  let tag = null
  const stringTag = /^["']([\w-]+)["']$/.exec(args[0])
  if (stringTag !== null) tag = stringTag[1]
  else if (/^[A-Za-z_$][\w$.]*$/.test(args[0])) tag = args[0].split('.').pop()
  const props = args[1] ?? ''
  const propOf = (name) => {
    const at = props.indexOf(`${name}:`)
    if (at < 0) return null
    const segs = splitTopLevel(props.slice(at + name.length + 1))
    return segs.length === 0 ? null : balancedExpr(segs[0])
  }
  return { tag, props, className: propOf('className'), children: propOf('children') }
}

/**
 * 元素调用里某个 prop 的**原文**（`null` = 这个元素没写这个 prop）。
 *
 * 与 `parseElementCall` 里那个同名内部函数同一口径；单独导出是给"定位 / 展开钮"那类
 * **看接线**的用例用的（它们要读 `style` / `ref` / `aria-expanded`，不只是 `className` 与 children）。
 *
 * ⚠️ 属性名有三种写法：`style:` / `"aria-expanded":` / `'x':` —— 只找裸名会把 JSX 里带引号的
 * 属性判成"没有"（`aria-expanded` 就是这么漏的）。
 */
export function propOf(props, name) {
  const text = String(props ?? '')
  const candidates = [`${name}:`, `"${name}":`, `'${name}':`]
    .map((needle) => ({ needle, at: text.indexOf(needle) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at)
  if (candidates.length === 0) return null
  const { needle, at } = candidates[0]
  const segs = splitTopLevel(text.slice(at + needle.length))
  return segs.length === 0 ? null : balancedExpr(segs[0])
}

/**
 * 在源码里找 `.<token>` 这样的 **className 用法**（不是 CSS 映射表里的 `"token": "…"`），
 * 返回它所在的那个元素调用（含完整 props 原文与调用起点）。
 */
export function elementCallByClassToken(source, token) {
  const re = new RegExp(`\\.\\s*${token}\\b`, 'g')
  let m
  while ((m = re.exec(source)) !== null) {
    const before = source.slice(Math.max(0, m.index - 400), m.index)
    const callRe = /(?:jsx|jsxs)\)?\(/g
    let last = null
    let c
    while ((c = callRe.exec(before)) !== null) last = c
    if (last === null) continue
    const callIndex = m.index - before.length + last.index
    const el = parseElementCall(source, callIndex)
    if (el !== null) return { ...el, callIndex }
  }
  return null
}

/** 同 `elementCallByClassToken`，只留形状（旧的三个读者只用这三个键）。 */
export function elementByClassToken(source, token) {
  const el = elementCallByClassToken(source, token)
  if (el === null) return null
  return { tag: el.tag, className: el.className, children: el.children }
}

/**
 * `div.taskTitle` 的**结构**（官方 E25 那一行：标题与状态同一个 flex 行）。
 *
 * 返回 `{found, container, children:[{kind,tag,className,hasChildren}]}` ——
 * 判据在用例里：官方先量一次（尺子自证），再看板那份量一次（必须同形）。
 */
export function taskTitleShape(source) {
  const header = elementByClassToken(source, 'taskTitle')
  if (header === null) return { found: false, why: '没有任何 className 用到 .taskTitle', container: null, children: null }
  if (header.children === null) return { found: false, why: 'div.taskTitle 没有 children', container: header.tag, children: null }
  const inner = header.children.startsWith('[') && header.children.endsWith(']') ? header.children.slice(1, -1) : header.children
  const children = splitTopLevel(inner).map((chunk) => {
    const callRe = /(?:jsx|jsxs)\)?\(/g
    const c = callRe.exec(chunk)
    if (c === null) return { kind: 'text', text: chunk.slice(0, 80) }
    const el = parseElementCall(chunk, c.index)
    return { kind: 'element', tag: el?.tag ?? null, className: el?.className ?? null, hasChildren: el?.children !== null }
  })
  return { found: true, why: null, container: header.tag, children }
}

/** `const css = "…"` 那一段（官方就是把 CSS 内嵌在同一个模块里；`L12`）。 */
export function extractCss(source) {
  const m = /const css = "((?:[^"\\]|\\.)*)"/.exec(source)
  return m === null ? null : m[1]
}

/** 比 CSS 时把空白全部挤掉（官方与我们的排版不一定一样）。 */
export const squash = (text) => String(text).replace(/\s+/g, '')

/** 去掉整行注释（`//` / `*` / `/*` 开头）—— 与 `support/discover.mjs` 同口径。 */
export function stripCommentLines(source) {
  return String(source)
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}

/** 一行里的所有命中（用来把"哪里命中了"打进读数）。 */
export function linesWith(source, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern)
  const hits = []
  String(source)
    .split(/\r?\n/)
    .forEach((line, idx) => {
      if (re.test(line)) hits.push({ line: idx + 1, text: line.trim().slice(0, 160) })
    })
  return hits
}

/** 深扫一个对象里所有 key（判"视图里没有某一类格子"用）。 */
export function allKeys(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, out)
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      allKeys(v, out)
    }
  }
  return out
}

/** 正则计数（读数里常要"几处命中"）。 */
export const countMatches = (source, pattern) => (String(source).match(new RegExp(pattern, 'g')) ?? []).length
