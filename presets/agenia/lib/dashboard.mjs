/**
 * 客户端看板的**数据层**：字段映射表 + 视图模型 + 读源 + 字段审计。
 *
 * 契约：`.team/test/2026-11-04/技术契约-客户端看板.md`（§1 导出面 / §2 字段表 / §3 视图 / §4 三态）。
 * 定形：`.team/leader/2026-11-04/定形-客户端看板.md`（R3 第一行 / R4 主行一行 / R5 欠账三格 + §八 三条裁定）。
 * 形状出处：`.team/design/2026-11-04/元素对照表.md`（E09 / E15 / E20 / E27 那几行）。
 *
 * 这一层只做两件事：**把四份真源读进来**（`readDashboardSources`）与**把它们算成一份视图**
 * （`dashboardOf`）。它不写任何账、不看钟、不含任何文案以外的界面知识 ——
 * 画布在 `client-ui-dashboard/lib/client.js`，两边只通过 §3 的视图模型交接。
 *
 * 🔴 口径上的两条硬约束（契约 §1.2 / §3）：
 *   · `dashboardOf` 是**纯函数**：不读盘、不取"现在"（`day` 由调用方经 `input.day` 进来）——
 *     否则同一份 `input` 会跑出两个结果，判据不可复现。
 *   · **缺 ≠ 空**（对照表 §5）：文件不在 / JSON 坏 / 形状不对 ⇒ `value: null` + `未知` + 报警；
 *     **集合为空** ⇒ 显式 `0`。把这两件事塌成一种，读的人就分不清"没有"和"坏了"。
 */
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { FIVE_GATES, headlineOf, ticketStatusOf } from './route.mjs'
import { openCounts } from './bug-ledger.mjs'
import { NODE_STATES } from './local-state.mjs'
import { PHASES } from './state.mjs'

/**
 * 视图模型的版本号（形状一变就 +1）。
 *
 * 渲染层 `client-ui-dashboard/lib/client.js` 里有一份**同号**的 `VIEW_SCHEMA` 闸门：
 * 对不上就画错误条、不硬画 —— 浏览器那一半 import 不了这份 Node ESM，所以两半各持一份号，
 * **改形状时两边同批改**（`DASHBOARD_SCHEMA` / `VIEW_SCHEMA` 是同一个契约的两个落点）。
 */
export const DASHBOARD_SCHEMA = 1

/** 读源的四种状态（契约 §1.3）—— **四种必须分得开**。 */
export const SOURCE_REASONS = Object.freeze(['ok', 'missing', 'unreadable', 'schema'])

/** 欠账三格的键与格名（次序就是画面上的次序；§八.1 拍的三列）。 */
export const DEBT_CELLS = Object.freeze([
  Object.freeze({ key: 'tickets', label: '票' }),
  Object.freeze({ key: 'bugs', label: 'bug' }),
  Object.freeze({ key: 'receipts', label: '评审回执' }),
])

/** 回执那两段（`local-state.mjs::NODE_STATES` 里的两段；段是**角色**，不是人）。 */
export const RECEIPT_SEGMENTS = Object.freeze(['technical', 'conversation'])

/** 报警码（契约 §3.5 的闭集；`<source>` 后缀的四条按前缀构造）。 */
export const DASH_ALERTS = Object.freeze([
  'DASH-SOURCE-MISSING',
  'DASH-SOURCE-UNREADABLE',
  'DASH-SOURCE-SCHEMA',
  'DASH-HEADLINE-EMPTY',
  'DASH-TASK-POINTER-DANGLING',
  'DASH-GATE-INVALID',
  'DASH-PHASE-INVALID',
])

/** 五关那一格读不到时印的词（`route.mjs` L575 的写法：`null` ⇒ 不适用，不是报警）。 */
const GATE_NOT_APPLICABLE = '不适用'
/** 读不到时印的词（缺 ≠ 空：读不到就说不知道，**不许**说"没有"）。 */
const WORD_UNKNOWN = '未知'
/** headline 缺失时第一行印的词（定形 R5：不许留空）。 */
const HEADLINE_EMPTY = '（目标未填）'
/** 没有当前任务时印的那一句（E20 空态）。 */
const EMPTY_NOTICE = '本阶段没有当前任务'

/**
 * 字段映射表（契约 §2 的 13 行，一条不多一条不少）。
 *
 * `file` 里的 `<day>` 由调用方填（`YYYY-MM-DD`）；`static` 那三条是文案，没有真源 ——
 * `file` / `pointer` 必须是 `null`（不许偷偷指一个文件来"凑一个真源"）。
 *
 * @type {ReadonlyArray<{id:string, cell:string, source:string, file:string|null, pointer:string|null,
 *                      compute:string, text?:string}>}
 */
export const DASHBOARD_FIELDS = Object.freeze([
  Object.freeze({ id: 'header.line', cell: 'header', source: 'route', file: '.team/route/current.json', pointer: '/headline', compute: 'headline' }),
  Object.freeze({ id: 'main.pointer', cell: 'main', source: 'route', file: '.team/route/current.json', pointer: '/current_task_id', compute: 'task_pointer' }),
  Object.freeze({ id: 'main.title', cell: 'main', source: 'route', file: '.team/route/current.json', pointer: '/tasks/[]/title', compute: 'task_title' }),
  Object.freeze({ id: 'main.gate', cell: 'main', source: 'route', file: '.team/route/current.json', pointer: '/tasks/[]/five_gate_state', compute: 'five_gate' }),
  Object.freeze({ id: 'main.note', cell: 'main', source: 'route', file: '.team/route/current.json', pointer: '/tasks/[]/note', compute: 'note' }),
  Object.freeze({ id: 'empty.notice', cell: 'empty', source: 'route', file: '.team/route/current.json', pointer: '/current_task_id', compute: 'empty_notice' }),
  Object.freeze({ id: 'badge.phase', cell: 'badge', source: 'update', file: 'presets/agenia/.runtime/state/update/<day>.json', pointer: '/phase', compute: 'phase' }),
  Object.freeze({ id: 'debt.tickets', cell: 'debt', source: 'route', file: '.team/route/current.json', pointer: '/tickets', compute: 'ticket_open' }),
  Object.freeze({ id: 'debt.bugs', cell: 'debt', source: 'bug', file: '.team/bug/ledger.json', pointer: '/entries', compute: 'bug_open' }),
  Object.freeze({ id: 'debt.receipts', cell: 'debt', source: 'local', file: '.team/state/local/<day>.json', pointer: '/technical/state', compute: 'receipt_missing' }),
  Object.freeze({ id: 'static.trigger', cell: 'static', source: 'static', file: null, pointer: null, compute: 'literal', text: '看板' }),
  Object.freeze({ id: 'static.group', cell: 'static', source: 'static', file: null, pointer: null, compute: 'literal', text: '欠着的东西' }),
  Object.freeze({ id: 'static.labels', cell: 'static', source: 'static', file: null, pointer: null, compute: 'literal', text: '票/bug/评审回执' }),
])

// ── 小工具 ──────────────────────────────────────────────────────────────────
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const filled = (value) => typeof value === 'string' && value.trim() !== ''

/** `YYYY-MM-DD` 出自哪一份按天的文件（`local/<day>.json` / `update/<day>.json`）。 */
function dayOfPath(file) {
  if (typeof file !== 'string') return null
  const hit = /(\d{4}-\d{2}-\d{2})\.json$/.exec(file)
  return hit === null ? null : hit[1]
}

/** 读源状态 → 报警码后缀（`ok` 不报警）。 */
const REASON_SUFFIX = Object.freeze({ missing: 'MISSING', unreadable: 'UNREADABLE', schema: 'SCHEMA' })

/** 一条源的诊断报警（`route` / `bug` / `local` / `update` 共用这一处）。 */
function sourceAlert(source, reason) {
  const suffix = REASON_SUFFIX[reason]
  if (suffix === undefined) return null
  const code = `DASH-SOURCE-${suffix}:${source}`
  return Object.freeze({ code, message: `${source} 这一份源读不到（${reason}）` })
}

// ── 读源（唯一一处读盘）───────────────────────────────────────────────────
/**
 * 读一份 JSON 源，并把**四种状态**分出来（契约 §1.3 / §4）。
 *
 * @param {string} key   `route` / `bug` / `local` / `update`
 * @param {string|null|undefined} file
 * @returns {{key:string, file:string|null, ok:boolean, reason:string, value:object|null}}
 */
function readSource(key, file) {
  const at = typeof file === 'string' && file !== '' ? file : null
  if (at === null) return { key, file: null, ok: false, reason: 'missing', value: null }
  if (!existsSync(at)) return { key, file: at, ok: false, reason: 'missing', value: null }
  let text
  try {
    text = readFileSync(at, 'utf8')
  } catch {
    return { key, file: at, ok: false, reason: 'unreadable', value: null }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { key, file: at, ok: false, reason: 'unreadable', value: null }
  }
  if (!isObject(parsed)) return { key, file: at, ok: false, reason: 'schema', value: null }
  return { key, file: at, ok: true, reason: 'ok', value: parsed }
}

/**
 * 读那四份源（定形 §六.2「哪个字段读了哪个文件」的机器那一半）。
 *
 * `sources` **恰好四条**（`route` / `bug` / `local` / `update`），每条带文件名与状态 ——
 * 这就是"看板读了什么"的全部读数，不许再从别处猜。
 *
 * @param {{routeFile?:string|null, bugFile?:string|null, localFile?:string|null,
 *          updateFile?:string|null, day?:string|null}} paths
 * @returns {{input:{day:string|null, route:object, bug:object, local:object, update:object},
 *            sources:Array<object>}}
 */
export function readDashboardSources({ routeFile = null, bugFile = null, localFile = null, updateFile = null, day = null } = {}) {
  const sources = [
    readSource('route', routeFile),
    readSource('bug', bugFile),
    readSource('local', localFile),
    readSource('update', updateFile),
  ]
  const input = { day: day ?? dayOfPath(localFile) ?? dayOfPath(updateFile) }
  for (const source of sources) input[source.key] = source
  return { input, sources }
}

/**
 * 把一份视图写成**快照文件**（插件把"视图怎么到浏览器"落成这一份文件；
 * 渲染层只经 `workspaceFiles` 读它，不读账本、不自己算）。
 *
 * 原子写：同目录先写 `<file>.tmp` 再 `rename` —— 半截文件等于让读的人看到半份账。
 *
 * @param {{input:object, outFile:string}} args
 * @returns {{file:string, bytes:number}}
 */
export function writeDashboardSnapshot({ input, outFile }) {
  const view = dashboardOf(input)
  const text = `${JSON.stringify(view)}\n`
  mkdirSync(path.dirname(outFile), { recursive: true })
  const tmp = `${outFile}.tmp`
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, outFile)
  return { file: outFile, bytes: Buffer.byteLength(text, 'utf8') }
}

// ── 视图模型（纯函数）─────────────────────────────────────────────────────
/** 欠账一格的形状：读得到写数，读不到写 `未知`（`state` 由数决定，不另存）。 */
function debtCell(key, fresh) {
  const label = DEBT_CELLS.find((cell) => cell.key === key).label
  const value = fresh === null ? null : fresh
  const text = value === null ? WORD_UNKNOWN : key === 'receipts' ? `缺 ${value} 段` : `open ${value}`
  const state = value === null ? 'error' : value === 0 ? 'done' : 'warning'
  return { key, label, value, text, state }
}

/** 五关那一格：`null` ⇒ `不适用`；闭集外 ⇒ `不适用` + 报警。并集同义词**原样收**。 */
function gateOf(task) {
  const raw = task?.five_gate_state
  if (raw === null || raw === undefined || raw === '') return { gate: GATE_NOT_APPLICABLE, invalid: false }
  if (FIVE_GATES.includes(raw)) return { gate: raw, invalid: false }
  return { gate: GATE_NOT_APPLICABLE, invalid: true }
}

/**
 * `local` 那两段里没回来的段数（契约 §2 `receipt_missing`）。
 *
 * 两个读数必须分开（缺 ≠ 空）：
 *   · **段不在**（文件在、那个键没有）⇒ 算 1 —— 真的没回来；
 *   · **段在、形状不对**（不是对象 / `state` 不在 `NODE_STATES` 里）⇒ 不是"缺一段"，
 *     是**这一份源的形状坏了** ⇒ `missing: null` + `broken` 点名，画面写「未知」。
 * 把第二种折成"缺 1 段"，读的人会以为评审没回来（一个看起来完全合理的数字）。
 *
 * 两段走同一个循环、同一条规则 —— **对称**（`technical` 与 `conversation` 谁坏了都走这一支）。
 *
 * @param {object} local `local/<day>.json` 解析出来的对象
 * @returns {{missing:number|null, broken:string[]}}
 */
function receiptsOf(local) {
  let missing = 0
  const broken = []
  for (const segment of RECEIPT_SEGMENTS) {
    if (!isObject(local) || !Object.hasOwn(local, segment)) {
      missing += 1
      continue
    }
    const node = local[segment]
    if (!isObject(node) || !NODE_STATES.includes(node.state)) {
      broken.push(segment)
      continue
    }
    if (node.state !== 'done') missing += 1
  }
  return { missing: broken.length === 0 ? missing : null, broken }
}

/**
 * `input` → 视图（契约 §3）。
 *
 * `input` 是 `readDashboardSources().input`：每份源 `{key, file, ok, reason, value}` + `day`。
 * 这个函数**不读盘、不看钟**；同样的 `input` 永远得到同样的视图。
 *
 * @param {{day?:string|null, route?:object, bug?:object, local?:object, update?:object}} input
 * @returns {{schema:number, day:string|null, header:{text:string, empty:boolean, stale:boolean},
 *            badge:{word:string}|null, main:null|{taskId:string, title:string, gate:string, note:string|null},
 *            emptyNotice:string|null, debts:Array<object>, alerts:Array<{code:string, message:string}>}}
 */
export function dashboardOf(input) {
  const source = input ?? {}
  const alerts = []
  const push = (alert) => {
    if (alert !== null) alerts.push(alert)
  }

  const route = source.route ?? { ok: false, reason: 'missing', value: null }
  const bug = source.bug ?? { ok: false, reason: 'missing', value: null }
  const local = source.local ?? { ok: false, reason: 'missing', value: null }
  const update = source.update ?? { ok: false, reason: 'missing', value: null }
  const routeOk = route.ok === true && isObject(route.value)
  const bugOk = bug.ok === true && isObject(bug.value)
  const localOk = local.ok === true && isObject(local.value)
  const updateOk = update.ok === true && isObject(update.value)

  // ── 第一行（R3）：只读 `headline`，不现拼 ------------------------------------
  let header
  if (!routeOk) {
    // 读不到 ≠ 没有：第一行说"不知道"，不走"（目标未填）"那一格
    header = { text: WORD_UNKNOWN, empty: true, stale: false }
    push(sourceAlert('route', route.reason))
  } else {
    const headline = headlineOf(route.value)
    if (headline.stored === null) {
      header = { text: HEADLINE_EMPTY, empty: true, stale: false }
      push({ code: 'DASH-HEADLINE-EMPTY', message: '路线账本没有 headline（目标未填）' })
    } else {
      header = { text: headline.stored, empty: false, stale: headline.stored !== headline.derived }
    }
  }

  // ── 主行（R4）：一个对象，渲染层把它画成**一行** ----------------------------
  const tasks = routeOk && Array.isArray(route.value.tasks) ? route.value.tasks : []
  const currentTaskId = routeOk ? route.value.current_task_id ?? null : null
  let main = null
  let emptyNotice = null
  if (routeOk) {
    if (currentTaskId === null) {
      emptyNotice = EMPTY_NOTICE
    } else {
      const task = tasks.find((item) => isObject(item) && item.id === currentTaskId) ?? null
      if (task === null) {
        push({ code: 'DASH-TASK-POINTER-DANGLING', message: `current_task_id=${currentTaskId} 在 tasks 里找不到那一条` })
      } else {
        const { gate, invalid } = gateOf(task)
        if (invalid) push({ code: 'DASH-GATE-INVALID', message: `five_gate_state 不在五关的 9 值闭集里（${JSON.stringify(task.five_gate_state)}）` })
        main = {
          taskId: String(task.id),
          title: typeof task.title === 'string' ? task.title : '',
          gate,
          note: filled(task.note) ? task.note : null,
        }
      }
    }
  }

  // ── 欠账三格（R5）：没有就写 0，读不到就写未知 ------------------------------
  const ticketList = routeOk && Array.isArray(route.value.tickets) ? route.value.tickets : []
  const ticketOpen = routeOk ? ticketList.filter((ticket) => ticketStatusOf(ticket, tasks) === 'open').length : null
  const bugOpen = bugOk ? openCounts(bug.value).bug_open : null
  if (!bugOk) push(sourceAlert('bug', bug.reason))
  const receipts = localOk ? receiptsOf(local.value) : { missing: null, broken: [] }
  if (!localOk) push(sourceAlert('local', local.reason))
  else if (receipts.broken.length > 0) {
    push({
      code: 'DASH-SOURCE-SCHEMA:local',
      message: `local 的 ${receipts.broken.join(' / ')} 段形状不对（不是对象，或 state 不在 NODE_STATES 里）—— 回执格记「未知」，不记「缺 1 段」`,
    })
  }
  const debts = [
    debtCell('tickets', ticketOpen),
    debtCell('bugs', bugOpen),
    debtCell('receipts', receipts.missing),
  ]

  // ── 徽标（§八.2）：一个词 —— 当天的记忆相位 --------------------------------
  let badge = null
  if (updateOk) {
    const phase = update.value.phase
    if (PHASES.includes(phase)) {
      badge = { word: phase }
    } else {
      badge = { word: WORD_UNKNOWN }
      push({ code: 'DASH-PHASE-INVALID', message: `update 的 phase 不在 8 值闭集里（${JSON.stringify(phase)}）` })
    }
  } else if (update.reason !== 'missing') {
    // 文件整天不在 = "今天还没写"，是正常态（不报警、不画徽标）；坏 / 形状不对才出声
    badge = { word: WORD_UNKNOWN }
    push(sourceAlert('update', update.reason))
  }

  return {
    schema: DASHBOARD_SCHEMA,
    day: typeof source.day === 'string' ? source.day : null,
    // 🔴 生成时刻：没有它，写手停摆时面板会把旧数据画成"此刻"（实测 mtime 有 20 秒不动过）。
    //    形状 = ISO8601 带毫秒；由写手给（`dashboardOf` 不读时钟，`now` 是调用方给的）。
    generated_at: typeof source.generated_at === 'string' ? source.generated_at : null,
    header,
    badge,
    main,
    emptyNotice,
    debts,
    alerts,
  }
}

// ── 字段审计（定形 §六.1 的执行点）───────────────────────────────────────────
/**
 * 按契约 §2 的 pointer 语法解析一条路径。
 *
 * `[]` 是**单独一段**（`/tasks/[]/title` = 对 `tasks` 的每一个元素都要有 `title`）：
 * 空数组不算错 —— 但那时判不出"键在不在"，所以单独记一种状态，不冒充 ok。
 *
 * @returns {{state:'ok'|'missing_key'|'empty_array'|'bad_shape', at:string|null, value:unknown}}
 */
function resolvePointer(root, pointer) {
  const text = String(pointer ?? '')
  if (text === '' || text === '/') return { state: 'ok', at: null, value: root }
  const segments = text.split('/').slice(1)
  const walk = (node, index, at) => {
    if (index >= segments.length) return { state: 'ok', at: null, value: node }
    const head = segments[index]
    if (head === '[]') {
      if (!Array.isArray(node)) return { state: 'bad_shape', at: at || '/', value: undefined }
      if (node.length === 0) return { state: 'empty_array', at: at || '/', value: [] }
      for (const item of node) {
        const sub = walk(item, index + 1, `${at}/[]`)
        if (sub.state !== 'ok') return sub
      }
      return { state: 'ok', at: null, value: node }
    }
    if (!isObject(node) || !Object.hasOwn(node, head)) return { state: 'missing_key', at: `${at}/${head}`, value: undefined }
    return walk(node[head], index + 1, `${at}/${head}`)
  }
  return walk(root, 0, '')
}

/**
 * 字段表 × 输入 → 审计结论（定形 §六.1「指不到 ⇒ 红」的**生产侧**执行点）。
 *
 * 四种问题各有自己的码：源没有 / 源读不到（`DASH-FIELD-NO-SOURCE`）· 键不存在
 * （`DASH-FIELD-PHANTOM-KEY`）· 路上形状不对（`DASH-FIELD-BAD-SHAPE`）· 静态字段形状不对
 * （`DASH-FIELD-SHAPE`）。空数组只说明"今天判不出"，**不记红**（那是测试侧的 HOLD 口径）。
 * 一条字段若是 `receipt_missing`（读两段），两段各解析一次 —— 见下面那条 `pointers` 注释。
 *
 * @param {ReadonlyArray<object>} fields
 * @param {object} input `readDashboardSources().input`
 * @returns {{ok:boolean, problems:Array<{code:string, field:string, pointer:string|null,
 *            file:string|null, message:string}>}}
 */
export function auditFields(fields, input) {
  const problems = []
  const add = (code, field, message) => problems.push({
    code,
    field: typeof field?.id === 'string' ? field.id : '(无 id)',
    pointer: typeof field?.pointer === 'string' ? field.pointer : null,
    file: typeof field?.file === 'string' ? field.file : null,
    message,
  })
  for (const field of Array.isArray(fields) ? fields : []) {
    if (field?.source === 'static') {
      if (field.file !== null || field.pointer !== null || !filled(field.text)) {
        add('DASH-FIELD-SHAPE', field, '静态字段的 file / pointer 必须是 null，text 必须是非空文案')
      }
      continue
    }
    const source = input?.[field?.source]
    if (source === undefined || source === null) {
      add('DASH-FIELD-NO-SOURCE', field, `输入里没有 ${String(field?.source)} 这一份源`)
      continue
    }
    if (source.ok !== true) {
      add('DASH-FIELD-NO-SOURCE', field, `${String(field?.source)} 这一份源没读成（reason=${String(source.reason)}）`)
      continue
    }
    // 一条字段可以有**一份以上**指针：`receipt_missing` 读的是两段（`RECEIPT_SEGMENTS`），
    // 而字段表那一行只能写一个 `pointer` —— 段清单由 `RECEIPT_SEGMENTS` 给（不另抄一份），
    // 这里逐段解析，`technical` 与 `conversation` **对称**：谁被改名/缺键都会红。
    const pointers = [field.pointer]
    if (field?.compute === 'receipt_missing') {
      for (const segment of RECEIPT_SEGMENTS) {
        const pointer = `/${segment}/state`
        if (!pointers.includes(pointer)) pointers.push(pointer)
      }
    }
    for (const pointer of pointers) {
      const hit = resolvePointer(source.value, pointer)
      const at = { ...field, pointer }
      if (hit.state === 'missing_key') {
        add('DASH-FIELD-PHANTOM-KEY', at, `指向的键不在（缺在 ${String(hit.at)}）—— 这一格会永远是空的`)
      } else if (hit.state === 'bad_shape') {
        add('DASH-FIELD-BAD-SHAPE', at, `路上形状不对（${String(hit.at)}）`)
      }
    }
  }
  return { ok: problems.length === 0, problems }
}

// ── 快照落点（与渲染层共用的那一个路径常量）────────────────────────────────
/** 快照文件名（工作区相对路径；渲染层经 `workspaceFiles` 读同一个路径）。 */
export const DASHBOARD_SNAPSHOT_REL = '.tools/_scratch/dashboard/view.json'

/** 本票四份真源在**一个根**下的落点（`<day>` 由调用方填）。 */
export function dashboardSourcePaths(root, day) {
  const at = (...parts) => path.join(root, ...parts)
  return {
    routeFile: at('.team', 'route', 'current.json'),
    bugFile: at('.team', 'bug', 'ledger.json'),
    localFile: at('.team', 'state', 'local', `${day}.json`),
    updateFile: at('presets', 'agenia', '.runtime', 'state', 'update', `${day}.json`),
  }
}
