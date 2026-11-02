/**
 * **路线账本（任务 C1）的被测面常量与夹具** —— 单一来源，五格用例共用。
 *
 * 契约：`.team/test/CONTRACT-C1.md`（第 2 关交付物）。定形：
 * `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版，冻结）——
 * 本文件里每一个名字都能在契约的对应小节里指到出处；**不许在别处再抄一份**。
 *
 * 🔴 为什么这些名字要冻：C1 的五格判的是「模式是派生的四个值 · 账是怎么建的 · 槽怎么判 ·
 *   暂停集合是谁 · 一个准入函数怎么收」。名字不冻 ⇒ 每格都得靠猜键名，猜错一次就同时得到
 *   一条假红和一条假绿（`mig-rules-11`）。所以：**路径 / 模式四值 / 工作种类三值 / 槽四态 /
 *   节点三值 / op 名 / 十六格矩阵** 只在这里出现一次。
 *
 * ⚠️ 本文件是**工具**，不是用例：`discover.mjs` 只数 `static|unit|integration|report` 四棵树里的
 *   `*.test.mjs`，`support/` 不进分母。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { makeWorkspace as makeMarkedWorkspace } from './bug-surface.mjs'

// ── 账的落点（契约 §2）──────────────────────────────────────────────────────
/**
 * **三处落点，各一个目录**（定形 §2.3）：
 * - 路线账本：`<WS>/.team/route/current.json`（实现任务 + 评审票 + `pauses`）
 * - legacy 票店：`<WS>/.team/tickets/legacy.json`（**独立存储**，C1a 的输入；迁移后清空）
 * - bug 台账：`<WS>/.team/bug/ledger.json`（B 的；C1a **只**观察迁移时写它）
 */
export const ROUTE_PATHS = Object.freeze({
  teamDir: '.team',
  routeDir: '.team/route',
  current: '.team/route/current.json',
  audit: '.team/route/audit.jsonl',
  lock: '.team/route/.route.lock',
  legacyDir: '.team/tickets',
  legacyStore: '.team/tickets/legacy.json',
  bugDir: '.team/bug',
  bugLedger: '.team/bug/ledger.json',
})

// ── 模式：**纯派生**的四值（定形 §2.3 末段；不是存值）────────────────────────
/**
 * 四值闭集（`uninitialized` 是一个**值**，不是缺席）：
 *   `uninitialized` = 没有路线账本；其余 = 账本阶段类型（`build|maintain`）+ 暂停位。
 * ⚠️ `paused` **不在**这里 —— 它是**任务状态**（§3.3），不是模式。
 */
export const MODES = Object.freeze(['uninitialized', 'build', 'build-paused', 'maintain'])

/** 阶段类型（`stages[].kind`）—— 闭集两个值。缺省按 `build` 读（保守读法，契约 §13 第 2 条）。 */
export const STAGE_KINDS = Object.freeze(['build', 'maintain'])

/** 工作种类（定形 §3.3：「`implement` / `bug` / `ticket` 是**工作种类**，不是 toolName」）。 */
export const ROUTE_TASK_KINDS = Object.freeze(['implement', 'ticket-repair', 'bug-repair'])

/**
 * **路线任务**的四态（定形 §2.3「`paused` 是任务状态」）；bug 任务仍是三态
 * （`lib/route.mjs::TASK_STATUSES`，B 的 `bugTaskVerdict` 读它）—— 两个词集**不混**。
 */
export const ROUTE_TASK_STATUSES = Object.freeze(['open', 'in_progress', 'paused', 'done'])

/** 槽的四态（定形 §3.3 的闭集）。`free` 不是第五态：它是 `exited` 的判读。 */
export const SLOT_STATES = Object.freeze(['busy', 'exited', 'crash', 'unknown'])

/** 五个真实节点里**落 route** 的三个（开工 / 交活 / 验收）；切阶段 = `stage-enter`，收工只落日志。 */
export const NODE_MARKS = Object.freeze(['open', 'handoff', 'accept'])

/** `stale` 阈值（定形 §3.3：心跳超过 **30 分钟** ⇒ 回收候选，**不自动**）。 */
export const SLOT_STALE_MS = 30 * 60 * 1000

// ── op 名（契约 §9；三个新 op 与实现**同批**进 `FROZEN.ops`）─────────────────
export const C1_OPS = Object.freeze({
  bootstrap: 'bootstrap',
  routeMark: 'route-mark',
  headlineSet: 'headline-set',
})

// ── 纯函数接缝（契约 §9.2）────────────────────────────────────────────────
/** C1 的纯函数模块（**既有文件**，`lib/route.mjs`）—— `admitTask` 的名字是 B 冻过的，不许改。 */
export const ROUTE_LIB = 'lib/route.mjs'

/** `lib/route.mjs` 必须导出的名字（缺一个 ⇒ `C1-SURFACE-MISSING` 点名）。 */
export const ROUTE_EXPORTS = Object.freeze([
  'MODES',
  'STAGE_KINDS',
  'ROUTE_TASK_KINDS',
  'ROUTE_TASK_STATUSES',
  'SLOT_STATES',
  'NODE_MARKS',
  'modeOf',
  'headlineOf',
  'admitTask',
  'slotBusy',
  'ticketStatusOf',
  'ticketVoidVerdict',
  'pauseSetOf',
  'pauseEntriesVerdict',
  'legacyTicketVerdict',
])

// ── 夹具：阶段图 / 目标 ─────────────────────────────────────────────────────
/** 本票的 bootstrap 阶段（契约 §3：kind=build，建完 mode 已是 `build`）。 */
export const BOOTSTRAP_GRAPH = Object.freeze({
  goal: { id: 'agenia-improve', title: 'Agenia 持续改进' },
  stages: Object.freeze([
    Object.freeze({ id: 'stage-build', name: '执行一 · 拆账并员通电', order: 1, kind: 'build' }),
  ]),
  current_stage_id: 'stage-build',
})

/** build → maintain 两段（C1d 的 `(maintain, pause)` 拒绝格与 B 的 maintain 准入格共用）。 */
export const BUILD_THEN_MAINTAIN_GRAPH = Object.freeze({
  goal: { id: 'agenia-improve', title: 'Agenia 持续改进' },
  stages: Object.freeze([
    Object.freeze({ id: 'stage-build', name: '执行一 · 拆账并员通电', order: 1, kind: 'build' }),
    Object.freeze({ id: 'stage-maintain', name: '执行二 · 日常维护', order: 2, kind: 'maintain' }),
  ]),
  current_stage_id: 'stage-build',
})

/** bootstrap 的 headline（唯一载体 = 账上的 `headline` 字段；卡片只读它）。 */
export const BOOTSTRAP_HEADLINE = `${BOOTSTRAP_GRAPH.goal.title} · ${BOOTSTRAP_GRAPH.stages[0].name}`

// ── 夹具：legacy 票店（7 张旧票）────────────────────────────────────────────
/**
 * **7 张旧票的来历**：`.team/leader/2026-10-31/findings-map.json`（10-30/10-31 技术评审 9 条发现
 * → 7 张票；`F6` 并进 `F-167`、`F8` 不采纳）。票号沿用 `F-165`…`F-171`（两套票号并存，
 * 新的用 `ticket-YYYYMMDD-NN`）。
 *
 * 🔴 这是**手写夹具**（照契约 §4 的 legacy 形状写），**不是**从实现反推的：
 * 真实跑的时候这 7 条由组长写进 legacy 票店，C1a 只负责搬。
 */
export const LEGACY_TICKETS = Object.freeze([
  Object.freeze({ id: 'F-165', status: 'open', title: '控制字符能原样穿过四条入库路径（全组没有一条会红的判据）', source: `technical-review:${'1'.repeat(64)}#F1` }),
  Object.freeze({ id: 'F-166', status: 'open', title: '`--out` 落在被测 CODE 名单里不拦', source: `technical-review:${'2'.repeat(64)}#F2` }),
  Object.freeze({ id: 'F-167', status: 'in_progress', title: '作业书 §三「地基」正文不承重 + 「代码根」任一命中', source: `technical-review:${'3'.repeat(64)}#F3` }),
  Object.freeze({ id: 'F-168', status: 'open', title: 'REV-04/E 的针读的是活树（拿副本跑套件时判的是另一棵树）', source: `technical-review:${'4'.repeat(64)}#F4` }),
  Object.freeze({ id: 'F-169', status: 'open', title: '套件打不到副本：靶子 / 尺子 / 体检脚本钉在活树', source: `technical-review:${'5'.repeat(64)}#F5` }),
  Object.freeze({ id: 'F-170', status: 'done', title: 'equal 只覆盖 CODE 集：副本里多一份非 CODE 文件 ⇒ equal:true', source: `technical-review:${'6'.repeat(64)}#F7` }),
  Object.freeze({ id: 'F-171', status: 'open', title: '一次全树 CODE 指纹 104–268 秒（walk 不剪枝）', source: `technical-review:${'7'.repeat(64)}#F9` }),
])

/** 一份 legacy 票店（契约 §4.1 冻结形状）。`tickets` 逐字给。 */
export function legacyStoreFixture({ tickets = LEGACY_TICKETS, source = 'review-2026-10-30', schema = 1, migrated_at = null, migrated_to = null } = {}) {
  return {
    schema,
    source,
    tickets: tickets.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      source: t.source,
      next_step: t.next_step ?? `把 ${t.id} 那条修掉（下一步由组长在修的时候写细）`,
      acceptance: t.acceptance ?? `${t.id} 的判据能翻面：修完绿、不修红`,
      opened_at: t.opened_at ?? '2026-10-30T19:00:00+08:00',
      finding_refs: t.finding_refs ?? [],
    })),
    migrated_at,
    migrated_to,
  }
}

// ── 夹具：admitTask 的十六格（定形 §2.3 + 契约 §7；**与 CONTRACT-B §6.4 逐字相同**）──
export const E1 = 'bug-20261101-01'
export const E2 = 'bug-20261101-02'
export const E3 = 'bug-20261101-03'

/**
 * 十六格：四种模式 × 三种工作种类 + 四格边界（headline 空 / 集合外 / `paused` 不是模式 /
 * `entry_id` 缺）。每一格一句为什么 + **一个冻死的拒码** —— 读红的时候不用回头翻定形：
 *   · `E_ADMIT_UNINITIALIZED` —— 未建账，只能登记（A01/A02）
 *   · `E_ADMIT_HEADLINE`      —— headline 空，先补第一行（A04）
 *   · `E_ADMIT_KIND`          —— 这个模式不收这种工作（A06/A07/A08/A14）
 *   · `E_ADMIT_SET`           —— 不在当前集合里 / 集合是空的（A10/A11/A13）
 *   · `E_ADMIT_MODE`          —— 模式不在四值闭集里（A15）
 *   · `E_ADMIT_ENTRY`         —— bug 修必须点名一条 entry（A16）
 *
 * ⚠️ 这个数组是**契约的第二个读者**（第一个是 `integration/bug03-bug-task.test.mjs` 的
 *    `ADMIT_CELLS`，B 冻在提交里）；两处漂移时**以契约 §7 为准**，并在交活说明里点名。
 */
export const ADMIT_CELLS = Object.freeze([
  { id: 'A01', input: { mode: 'uninitialized', kind: 'bug-repair', entry_id: E1, headline: null, batch_entry_ids: [], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_UNINITIALIZED', note: '未建账 ⇒ 拒一切修任务（只能登记）' },
  { id: 'A02', input: { mode: 'uninitialized', kind: 'implement', entry_id: null, headline: '有目标', batch_entry_ids: [], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_UNINITIALIZED', note: '未建账 ⇒ 不开实现任务' },
  { id: 'A03', input: { mode: 'build', kind: 'implement', entry_id: null, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [] }, want: true, code: null, note: '实现任务只在 build 收' },
  { id: 'A04', input: { mode: 'build', kind: 'implement', entry_id: null, headline: '   ', batch_entry_ids: [], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_HEADLINE', note: 'headline 空 ⇒ 拒实现任务（先补 headline）' },
  { id: 'A05', input: { mode: 'build', kind: 'ticket-repair', entry_id: null, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [] }, want: true, code: null, note: '票的修 = build 期的路线任务' },
  { id: 'A06', input: { mode: 'build', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_KIND', note: '实现期普通 bug 只登记、不修' },
  { id: 'A07', input: { mode: 'maintain', kind: 'implement', entry_id: null, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_KIND', note: '维护期不接新实现' },
  { id: 'A08', input: { mode: 'maintain', kind: 'ticket-repair', entry_id: null, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_KIND', note: '维护期只修批内 bug，不修票' },
  { id: 'A09', input: { mode: 'maintain', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [E1, E2], pause_entry_ids: [] }, want: true, code: null, note: 'maintain 读 batch：批内收' },
  { id: 'A10', input: { mode: 'maintain', kind: 'bug-repair', entry_id: E3, headline: '本票目标', batch_entry_ids: [E1, E2], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_SET', note: 'batch 外的 bug 不在 maintain 修（点名那条 entry）', names: E3 },
  { id: 'A11', input: { mode: 'maintain', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_SET', note: '没有 batch ⇒ 维护期什么都不收' },
  { id: 'A12', input: { mode: 'build-paused', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [E1] }, want: true, code: null, note: 'build-paused 读 pause set：触发条收' },
  { id: 'A13', input: { mode: 'build-paused', kind: 'bug-repair', entry_id: E2, headline: '本票目标', batch_entry_ids: [E2], pause_entry_ids: [E1] }, want: false, code: 'E_ADMIT_SET', note: 'pause set 外的拒（**即使它在 batch 里** —— 两个集合不混名）', names: E2 },
  { id: 'A14', input: { mode: 'build-paused', kind: 'implement', entry_id: null, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [E1] }, want: false, code: 'E_ADMIT_KIND', note: 'build-paused 只收触发的那一条' },
  { id: 'A15', input: { mode: 'paused', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [E1] }, want: false, code: 'E_ADMIT_MODE', note: '模式是四值闭集（`paused` 是任务状态，不是模式）' },
  { id: 'A16', input: { mode: 'maintain', kind: 'bug-repair', entry_id: null, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [] }, want: false, code: 'E_ADMIT_ENTRY', note: 'bug 修必须点名一条 entry' },
])

// ── 现场：工作区 / 读盘小工具 ───────────────────────────────────────────────
/** 一个带 marker 的工作区（`--workspace` 的合法姿势；`tag` 进目录名 ⇒ 每格一个根）。 */
export function makeWorkspace(caseId, tag) {
  return makeMarkedWorkspace(caseId, tag)
}

/** 工作区里的绝对落点。 */
export function routeAbs(workspace, rel) {
  return path.join(workspace, ...String(rel).split('/'))
}

/** 读一个 JSON；不在 / 读不出来 ⇒ `null`（缺 ≠ 坏：坏由用例自己判）。 */
export function readJsonFile(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** 路线账本（`current.json`）；不在 ⇒ `null`。 */
export function readRoute(workspace) {
  return readJsonFile(routeAbs(workspace, ROUTE_PATHS.current))
}

/** legacy 票店；不在 ⇒ `null`。 */
export function readLegacy(workspace) {
  return readJsonFile(routeAbs(workspace, ROUTE_PATHS.legacyStore))
}

/** 写一份 legacy 票店（**夹具**，不是被测对象的写路径；C1a 只读它 + 清空它）。 */
export function writeLegacy(workspace, store) {
  const file = routeAbs(workspace, ROUTE_PATHS.legacyStore)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  return file
}

/** 审计链（逐行 JSON；半截行原样留住 —— 那是"链条坏了"的读数）。 */
export function readAudit(workspace) {
  const file = routeAbs(workspace, ROUTE_PATHS.audit)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return { unparsable: l.slice(0, 120) }
      }
    })
}

/** 文件在不在 + 字节数 + sha256（"零写入"那一族判据的读数）。 */
export function fileStatRoute(file) {
  try {
    const st = statSync(file)
    return { exists: true, bytes: st.size, sha256: sha256OfFileRoute(file) }
  } catch {
    return { exists: false, bytes: null, sha256: null }
  }
}

/**
 * 造一个 `push(code, message, detail)`：**同一个码 + 同一句话只记一次**。
 * 为什么：一条断言会在很多格上重复（例如"op 不存在"每调一次都会命中），
 * 重复 4 遍不会让它更红，只会让结算里那一段读不完（"报红要能拆"不等于"同一句抄十遍"）。
 */
export function makePusher(problems) {
  const seen = new Set()
  return (code, message, detail) => {
    const key = `${code}\u0000${message}`
    if (seen.has(key)) return
    seen.add(key)
    problems.push({ code, message, detail: detail ?? null })
  }
}

/** 一个文件的 sha256（小写 hex；与 `support/evidence.mjs::sha256File` 同口径）。 */
export function sha256OfFileRoute(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

// ── 信封判读（四个小工具，五格共用）────────────────────────────────────────
/**
 * 一次调用是不是"**这个 op 根本还没有**"（不是"op 拒了这条输入"）。
 * 形状：`E_USAGE` + stderr 里的 `未知 op`，或 `SUT-SURFACE-MISSING`（连 CLI 都不在盘上）。
 */
export function opMissing(res) {
  if (res?.spawn_error) return false
  const code = res?.json?.error?.code ?? null
  if (code === 'E_USAGE') return true
  return String(res?.stderr ?? '').includes('SUT-SURFACE-MISSING')
}

/** op 缺失时的那条 problem（点名 op 与它该在哪一份 `--op help` 里）。 */
export function missingOpProblem(op, res) {
  return {
    code: 'C1-OP-MISSING',
    message: `\`agenia-route.mjs\` 没有 \`--op ${op}\`（exit=${res?.exit_code ?? '?'} · code=${res?.json?.error?.code ?? '(无)'}）—— `
      + `契约 §9.1 的三个 C1 op 一个都还没有；这一格判的是"功能没做"，不是"这条输入被拒"`,
    detail: { op, exit_code: res?.exit_code ?? null, stderr: String(res?.stderr ?? '').slice(0, 300) },
  }
}

/**
 * 期望"成功"或"被某个码拒"。`want` = `'ok'` | `'E_XXX'` | `['E_A','E_B']`（**不许**用它放宽到"任何非零"）。
 * 返回一句人话（不成立）或 `null`（成立）。
 */
export function envelopeProblem(label, res, want) {
  if (res?.spawn_error) return `${label}：spawn 失败（${res.spawn_error}）`
  if (res?.timed_out) return `${label}：超时（${res.ms} ms）`
  if (want === 'ok') {
    if (res.exit_code !== 0) return `${label}：期望退出码 0，实得 ${res.exit_code}；stdout=${String(res.stdout).trim().slice(0, 400)} stderr=${String(res.stderr).trim().slice(0, 300)}`
    if (res.json?.ok !== true) return `${label}：期望 stdout JSON 的 ok=true，实得 ${JSON.stringify(res.json)?.slice(0, 300)}`
    return null
  }
  const codes = Array.isArray(want) ? want : [want]
  if (res.exit_code === 0) return `${label}：期望被拒（${codes.join(' | ')}），实得退出码 0 / ${JSON.stringify(res.json)?.slice(0, 240)}`
  const got = res.json?.error?.code ?? '(stdout 不是错误信封)'
  if (!codes.includes(got)) return `${label}：期望错误码 ${codes.join(' | ')}，实得 ${got}；stderr=${String(res.stderr).trim().slice(0, 240)}`
  return null
}

/** 一次"该被拒"的调用：返回 `null` 或一句人话（与 `envelopeProblem` 同形，只是读起来更短）。 */
export function refusalOf(label, res, want) {
  return envelopeProblem(label, res, want)
}

/** 注入式时钟：写一个 now 文件，返回 `{env, file}`（30 分钟 / 30 天那些格子都靠它）。 */
export function clockEnv(workspace, iso, base = process.env) {
  const file = path.join(workspace, '.team-now.txt')
  writeFileSync(file, `${iso}\n`, 'utf8')
  return { env: { ...base, AGENIA_NOW_FILE: file }, file }
}
