/**
 * `DASH-01` / `DASH-02` / `DASH-09` —— 客户端看板**数据层**的契约面（第 2 关，红先）。
 *
 * 契约：`.team/test/2026-11-04/技术契约-客户端看板.md`（§2 字段映射表 / §3 视图模型 / §4 缺·空·坏）。
 * 定形：`.team/leader/2026-11-04/定形-客户端看板.md` §六.1「字段映射表：每个字段都能指到账本里的一个真源
 * （指不到 ⇒ 红）」；§八.3「这一版不读 `now.md`」。
 * 对照表：`.team/design/2026-11-04/元素对照表.md` §2（E09/E15/E20/E27 那几行）+ §5（缺 ≠ 空）。
 *
 * 三格：
 *   · `DASH-01` **字段映射表逐行指到真源**：表里每一条（13 行，其中 10 条有真源）都必须在**活树上那四份
 *     真文件**里解析得出来；解析器**不许和生产代码共用**（各写一份，两边一起错才可能同时绿）；
 *     外加"这一跑读了哪个文件"的读数（`readDashboardSources` 的 `sources`，定形 §六.2 的机器那一半）。
 *   · `DASH-02` **两条负控**：① 一个**指向不存在键**的字段必须被判红（生产侧 `auditFields`
 *     与测试侧解析器**各判一次** —— 一个说"没问题"就翻红）；② 四种读源状态（在 / 不在 / 读不出来 /
 *     形状不对）必须分得开，不许都塌成 `null`。
 *   · `DASH-09` **不读 `now.md`**（§八.3 的决定）：字段表里没有这一条、视图键里没有"下一步"、
 *     夹具里放一份带唯一标记的 `now.md` 也不会被读进来。
 *
 * 为什么这三格红：`presets/agenia/lib/dashboard.mjs` 今天不在盘上（第一关刚定形，第三关才写）。
 */
import { before, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, caseHold, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import {
  DASH_MODULE,
  allKeys,
  latestDaySources,
  liveDataPresence,
  loadDashboard,
  routeFixture,
  sourcePathsOf,
  writeSources,
  noteSutOverride,
} from '../support/dashboard-surface.mjs'

before(() => {
  preflight()
})

/**
 * 契约 §2 那 13 行（**一条不许少**；多的不许出现同 id）——
 * `static` 那三条是文案，没有真源，也不许偷偷指一个文件。
 */
const REQUIRED_FIELDS = [
  { id: 'header.line', source: 'route' },
  { id: 'main.pointer', source: 'route' },
  { id: 'main.title', source: 'route' },
  { id: 'main.gate', source: 'route' },
  { id: 'main.note', source: 'route' },
  { id: 'empty.notice', source: 'route' },
  { id: 'badge.phase', source: 'update' },
  { id: 'debt.tickets', source: 'route' },
  { id: 'debt.bugs', source: 'bug' },
  { id: 'debt.receipts', source: 'local' },
  { id: 'static.trigger', source: 'static' },
  { id: 'static.group', source: 'static' },
  { id: 'static.labels', source: 'static' },
]

/** 契约 §2 钉死的四个文件（`<day>` 是占位符，运行期由调用方填）。 */
const REQUIRED_FILES = {
  route: '.team/route/current.json',
  bug: '.team/bug/ledger.json',
  local: '.team/state/local/<day>.json',
  update: 'presets/agenia/.runtime/state/update/<day>.json',
}

/**
 * **测试自己那份**指针解析器（不 import 生产代码 —— 两边独立，才有一边喊得住另一边）。
 *
 * 口径（契约 §2）：`/a/b` 逐段走；`[]` 段 = 当前值是数组、剩余路径对**每一个元素**成立（空数组合法但
 * 判不出"键在不在" ⇒ 记 `empty_array`）；其余段必须是对象自己的键（`Object.hasOwn`，原型链不算）。
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
      for (let i = 0; i < node.length; i += 1) {
        const sub = walk(node[i], index + 1, `${at}/[${i}]`)
        if (sub.state !== 'ok') return sub
      }
      return { state: 'ok', at: null, value: node }
    }
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, head)) {
      return { state: 'missing_key', at: `${at}/${head}`, value: undefined }
    }
    return walk(node[head], index + 1, `${at}/${head}`)
  }
  return walk(root, 0, '')
}

/** 契约 §2 的字段形状（每条都得有这些键；缺一个 ⇒ 这条字段不成立）。 */
function fieldShapeProblems(field) {
  const problems = []
  if (typeof field?.id !== 'string' || field.id === '') problems.push(problem('DASH-FIELD-SHAPE', `字段缺 id：${JSON.stringify(field)}`))
  if (typeof field?.source !== 'string') problems.push(problem('DASH-FIELD-SHAPE', `${field?.id}：缺 source`))
  if (typeof field?.compute !== 'string' || field.compute === '') problems.push(problem('DASH-FIELD-SHAPE', `${field?.id}：缺 compute`))
  if (field?.source === 'static') {
    if (field.file !== null) problems.push(problem('DASH-FIELD-SHAPE', `${field?.id}：static 字段的 file 必须是 null（不许偷偷指一个文件）`))
    if (field.pointer !== null) problems.push(problem('DASH-FIELD-SHAPE', `${field?.id}：static 字段的 pointer 必须是 null`))
    if (typeof field.text !== 'string' || field.text.trim() === '') problems.push(problem('DASH-FIELD-SHAPE', `${field?.id}：static 字段的 text 必须是非空文案`))
  } else {
    if (typeof field?.file !== 'string' || field.file === '') problems.push(problem('DASH-FIELD-SHAPE', `${field?.id}：缺 file`))
    if (typeof field?.pointer !== 'string' || field.pointer === '') problems.push(problem('DASH-FIELD-SHAPE', `${field?.id}：缺 pointer`))
  }
  return problems
}

test('DASH-01 字段映射表：13 行逐条指到活树上那四份真源（指不到 ⇒ 红）+ 读源读数', async () => {
  await runCase('DASH-01', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const mod = await loadDashboard()
    rec.readings.module = { file: mod.file, ok: mod.ok, reason: mod.reason }
    if (!mod.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${DASH_MODULE}（${mod.reason}）—— 第三关按契约落这个文件；挪了位置就要重开第 2 关，不许悄悄搬`))
      caseFail(problems)
    }
    const fields = mod.mod.DASHBOARD_FIELDS
    if (!Array.isArray(fields)) {
      problems.push(problem('DASH-FIELDS-MISSING', 'DASHBOARD_FIELDS 必须是数组（契约 §1 导出 #1）'))
      caseFail(problems)
    }

    // ── ① 表本身：13 行一条不少、一条不多、形状齐全 ─────────────────────────
    const ids = fields.map((f) => f?.id)
    rec.readings.fields = { count: fields.length, ids }
    for (const required of REQUIRED_FIELDS) {
      if (!ids.includes(required.id)) problems.push(problem('DASH-FIELD-MISSING', `契约 §2 的字段不在表里：${required.id}`))
    }
    for (const id of ids) {
      if (!REQUIRED_FIELDS.some((r) => r.id === id)) problems.push(problem('DASH-FIELD-EXTRA', `表里多了一个契约 §2 没有的字段：${id}（多出来的格子要能在对照表里指到 twin，否则就是自创形状）`))
    }
    if (new Set(ids).size !== ids.length) problems.push(problem('DASH-FIELD-DUP', `字段 id 有重复：${ids.join(', ')}`))
    for (const field of fields) problems.push(...fieldShapeProblems(field))
    for (const field of fields) {
      const required = REQUIRED_FIELDS.find((r) => r.id === field?.id)
      if (required !== undefined && field?.source !== required.source) {
        problems.push(problem('DASH-FIELD-SOURCE', `${field.id} 的 source 是 ${field.source}，契约 §2 写的是 ${required.source}`))
      }
    }
    for (const [key, file] of Object.entries(REQUIRED_FILES)) {
      const hit = fields.find((f) => f?.source === key)
      if (hit === undefined) continue
      if (hit.file !== file) problems.push(problem('DASH-FIELD-FILE', `${key} 那一行的 file 是 ${JSON.stringify(hit.file)}，契约 §2 是 ${file}`))
    }

    // ── ② 尺子自证（**夹具**，不依赖活树数据）+ 真源根在不在（"判不了"与"红"的分界）──
    // 🔴 `F6`：干净 clone 上 `.team/` 根本不存在（数据不进提交）。旧版拿**活树 route** 当阳性，
    //    副本上它读不到 ⇒ `DASH-RULER-BROKEN`（RED）—— 把"没有数据"报成"测试自己的解析器坏了"。
    //    尺子的自证改在夹具上做：它证明的是解析器，不是盘上有没有账本。
    const rulerFixture = routeFixture()
    const positive = resolvePointer(rulerFixture, '/headline')
    if (positive.state !== 'ok') {
      problems.push(problem('DASH-RULER-BROKEN', `测试自己的解析器在夹具的 /headline 上就失败了（${positive.state} @ ${positive.at}）—— 后面所有"指得到了"的绿都不可信`))
      caseFail(problems)
    }
    // 阴性：一个不存在的键必须判 missing（否则解析器永远说 ok）。
    const negative = resolvePointer(rulerFixture, '/definitely_not_a_key_dash')
    if (negative.state !== 'missing_key') problems.push(problem('DASH-RULER-BROKEN', `解析器对不存在的键给出的状态是 ${negative.state}（应当是 missing_key）—— 它不会红，就不能拿它当判据`))
    // 翻面自证：`liveDataPresence()` 必须分得开"根在"与"根不在"（否则 clone 上的 HOLD 永远不会出现）。
    const probeRoot = path.join(runRoot(), 'fixtures', 'dash-01-data-root-probe')
    mkdirSync(path.join(probeRoot, '.team'), { recursive: true })
    const rootProbe = { present: liveDataPresence(probeRoot), absent: liveDataPresence(path.join(probeRoot, 'absent')) }
    rec.readings.live_data_root_probe = rootProbe
    if (rootProbe.present.present !== true || rootProbe.absent.present !== false) {
      problems.push(problem('DASH-RULER-BROKEN', '真源根判据翻不了面（有 `.team` 说不在 / 没 `.team` 说在）—— clone 上的 HOLD 会永远不出现'))
    }

    const liveRoot = liveDataPresence()
    rec.readings.live_data_root = liveRoot
    if (!liveRoot.present) {
      caseHold(rec, 'DASH-LIVE-DATA-ABSENT', `四份真源根一个都不在盘上（${liveRoot.verdict}）：${liveRoot.roots.join(' · ')}`
        + ' ⇒ "字段指得到真源"这一格判不了；'
        + '缺的：.team/route/current.json · .team/bug/ledger.json · .team/state/local/<day>.json · presets/agenia/.runtime/state/update/<day>.json')
      caseFail(problems)
      return
    }

    // ── ③ 逐行在活树上解析 ────────────────────────────────────────────────
    const live = latestDaySources()
    rec.readings.live = {
      route: live.route.file,
      bug: live.bug.file,
      local: live.local?.file ?? null,
      update: live.update?.file ?? null,
    }
    const day = live.local?.day ?? live.update?.day ?? null
    const values = {
      route: existsSync(live.route.file) ? JSON.parse(readFileSync(live.route.file, 'utf8')) : null,
      bug: existsSync(live.bug.file) ? JSON.parse(readFileSync(live.bug.file, 'utf8')) : null,
      local: live.local !== null && existsSync(live.local.file) ? JSON.parse(readFileSync(live.local.file, 'utf8')) : null,
      update: live.update !== null && existsSync(live.update.file) ? JSON.parse(readFileSync(live.update.file, 'utf8')) : null,
    }

    // ── ③ 逐行在活树上解析 ────────────────────────────────────────────────
    const resolution = []
    for (const field of fields) {
      if (field?.source === 'static') continue
      const file = String(field.file).replace('<day>', day ?? '<day>')
      const sourceKey = field.source
      const value = values[sourceKey]
      if (value === null) {
        if (sourceKey === 'local' || sourceKey === 'update') {
          caseHold(rec, 'DASH-NO-DAY-FILE', `${sourceKey} 没有任何一天的源文件 ⇒ 这一行今天判不了（不是绿）`)
        } else {
          problems.push(problem('DASH-LIVE-SOURCE-MISSING', `${field.id} 的真源不在盘上：${file} —— 契约 §六.1 要求"指得到"，今天指不到`))
        }
        resolution.push({ id: field.id, file, state: 'file_missing' })
        continue
      }
      const hit = resolvePointer(value, field.pointer)
      resolution.push({ id: field.id, file, pointer: field.pointer, state: hit.state, at: hit.at })
      if (hit.state === 'missing_key') {
        problems.push(problem('DASH-FIELD-PHANTOM-KEY', `${field.id} 指向 ${file}#${field.pointer}，那个键不在（缺在 ${hit.at}）—— 一个字段指着不存在的键，看板上那一格就永远是空的`))
      } else if (hit.state === 'bad_shape') {
        problems.push(problem('DASH-FIELD-BAD-SHAPE', `${field.id} 指向 ${file}#${field.pointer}，路上形状不对（${hit.at}）`))
      } else if (hit.state === 'empty_array') {
        caseHold(rec, 'DASH-FIELD-EMPTY-ARRAY', `${field.id}：${file}#${field.pointer} 的数组今天是空的 ⇒ "键在不在"判不出来（不是绿）`)
      }
    }
    rec.readings.resolution = resolution

    // ── ④ 读源读数（定形 §六.2 的机器那一半：哪个字段读了哪个文件）──────────
    const readSources = mod.mod.readDashboardSources
    if (typeof readSources !== 'function') {
      problems.push(problem('DASH-READER-MISSING', 'readDashboardSources 必须是函数（契约 §1 导出 #3）'))
    } else {
      const files = {
        route: live.route.file,
        bug: live.bug.file,
        local: live.local?.file ?? path.join(PATHS.repo, '.team', 'state', 'local', `${day}.json`),
        update: live.update?.file ?? path.join(PATHS.repo, 'presets', 'agenia', '.runtime', 'state', 'update', `${day}.json`),
      }
      const read = readSources(sourcePathsOf(files))
      rec.readings.sources = read?.sources ?? null
      if (!Array.isArray(read?.sources) || read.sources.length !== 4) {
        problems.push(problem('DASH-SOURCES-SHAPE', 'readDashboardSources().sources 必须是恰好四条（route / bug / local / update），一条一排 —— 定形 §六.2 要的是"哪个字段读了哪个文件"'))
      } else {
        const keys = read.sources.map((s) => s?.key).sort()
        if (keys.join(',') !== 'bug,local,route,update') problems.push(problem('DASH-SOURCES-SHAPE', `sources 的键是 ${keys.join(',')}，契约 §4 是 route / bug / local / update`))
        for (const source of read.sources) {
          if (typeof source?.file !== 'string' || source.file === '') problems.push(problem('DASH-SOURCES-SHAPE', `sources 里 ${source?.key} 没有记文件名（读数必须是"读了哪个文件"）`))
          if (source?.ok !== true) problems.push(problem('DASH-SOURCE-NOT-READ', `${source?.key} 今天没读成（reason=${source?.reason}）—— 活树上这四份都在（route/bug/local/update）`))
        }
        const expectedFiles = { route: files.route, bug: files.bug, local: files.local, update: files.update }
        for (const source of read.sources) {
          if (expectedFiles[source?.key] !== undefined && source.file !== expectedFiles[source.key]) {
            problems.push(problem('DASH-SOURCE-FILE', `${source.key} 的读数记的是 ${source.file}，应当是 ${expectedFiles[source.key]}（读的不是那份文件 ⇒ 后面的数都不作数）`))
          }
        }
      }
    }

    caseFail(problems)
  })
})

test('DASH-02 两条负控：指向不存在的键必须红；四种读源状态必须分得开', async () => {
  await runCase('DASH-02', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const mod = await loadDashboard()
    if (!mod.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${DASH_MODULE}（${mod.reason}）`))
      caseFail(problems)
    }
    const { DASHBOARD_FIELDS, auditFields, readDashboardSources } = mod.mod
    if (typeof auditFields !== 'function') {
      problems.push(problem('DASH-AUDIT-MISSING', 'auditFields 必须是函数（契约 §1 导出 #4）—— 定形 §六.1 的"指不到就红"要有执行点，不许只写在文档里'))
      caseFail(problems)
    }

    // ── ① 阳性：真表 + 真源 ⇒ 审计干净 ────────────────────────────────────
    // 🔴 `F6`：真源根（`.team/`）不在盘上 = **干净 clone**。数据不进提交 ⇒ 这一格判不了，
    //    记 HOLD（点名缺的那几份），不把"没有数据"写成"审计/表坏了"。
    const liveRoot = liveDataPresence()
    rec.readings.live_data_root = liveRoot
    const live = liveRoot.present ? latestDaySources() : null
    const liveFiles = live === null ? {} : {
      route: live.route.file,
      bug: live.bug.file,
      local: live.local?.file,
      update: live.update?.file,
    }
    if (!liveRoot.present) {
      caseHold(rec, 'DASH-LIVE-DATA-ABSENT', `四份真源根一个都不在盘上（${liveRoot.verdict}）：${liveRoot.roots.join(' · ')}`
        + ' ⇒ "真表 + 真源"的阳性/阴性对照判不了；'
        + '缺的：.team/route/current.json · .team/bug/ledger.json · .team/state/local/<day>.json · presets/agenia/.runtime/state/update/<day>.json')
    } else if (liveFiles.local === undefined || liveFiles.update === undefined) {
      problems.push(problem('DASH-LIVE-SOURCE-MISSING', '活树上缺按天的那两份源（local / update）⇒ 这一格今天判不了真表'))
    } else {
      const read = readDashboardSources(sourcePathsOf(liveFiles))
      rec.readings.audit_live = auditFields(DASHBOARD_FIELDS, read.input)
      if (read.input.route?.ok !== true) problems.push(problem('DASH-SOURCE-NOT-READ', `真源 route 没读成：${read.input.route?.reason}`))
      if (auditFields(DASHBOARD_FIELDS, read.input).ok !== true) {
        problems.push(problem('DASH-AUDIT-FALSE-RED', `真表 + 真源被判红（${JSON.stringify(auditFields(DASHBOARD_FIELDS, read.input).problems)}）—— 要么表错了，要么审计错了`))
      }

      // ── ② 阴性 A：多一条指向不存在键的字段 ⇒ 审计必须红、并点名 ─────────
      const phantom = {
        id: 'dash.phantom',
        cell: 'header',
        source: 'route',
        file: REQUIRED_FILES.route,
        pointer: '/definitely_not_a_key_dash',
        compute: 'literal',
      }
      const withPhantom = [...DASHBOARD_FIELDS, phantom]
      const phantomAudit = auditFields(withPhantom, read.input)
      rec.readings.audit_phantom = phantomAudit
      if (phantomAudit.ok !== false) {
        problems.push(problem('DASH-AUDIT-VACUOUS', '把一个指向不存在键的字段塞进表里，auditFields 仍然说 ok ⇒ 这个审计永远绿，定形 §六.1 那一条等于没写'))
      } else {
        const text = JSON.stringify(phantomAudit.problems)
        if (!text.includes('dash.phantom')) problems.push(problem('DASH-AUDIT-NO-NAME', `审计红了，但没点名是哪个字段（problems=${text.slice(0, 300)}）—— 红要能指认`))
        if (!text.includes('/definitely_not_a_key_dash')) problems.push(problem('DASH-AUDIT-NO-POINTER', `审计红了，但没点名那个键（problems=${text.slice(0, 300)}）`))
        if (!/DASH-FIELD-PHANTOM-KEY|NO-SOURCE|MISSING/.test(text)) problems.push(problem('DASH-AUDIT-CODE', `审计的问题码不在契约 §2 的闭集里（problems=${text.slice(0, 300)}）`))
      }

      // ── ③ 阴性 B：文件不在 ⇒ 审计必须说"没有文件"，不是"字段为 null" ─────
      const withoutBug = { ...read.input, bug: { ...read.input.bug, ok: false, reason: 'missing', value: null } }
      const bugAudit = auditFields(DASHBOARD_FIELDS, withoutBug)
      rec.readings.audit_missing_bug = bugAudit
      if (bugAudit.ok !== false) problems.push(problem('DASH-AUDIT-VACUOUS', 'bug 台账不在时审计仍说 ok ⇒ 缺 ≠ 空 那条规矩在审计里没有执行点'))
      else if (!JSON.stringify(bugAudit.problems).includes('debt.bugs')) problems.push(problem('DASH-AUDIT-NO-NAME', 'bug 台账不在时审计红了，但没点名 debt.bugs'))
    }

    // ── ④ 四种读源状态分得开（在 / 不在 / 读不出来 / 形状不对）─────────────
    const cases = {
      present: writeSources('DASH-02', 'present'),
      missing: writeSources('DASH-02', 'missing', { route: null }),
      corrupt: writeSources('DASH-02', 'corrupt', { route: 'corrupt' }),
      schema: writeSources('DASH-02', 'schema', { route: 'schema' }),
    }
    const reasons = {}
    for (const [name, fixture] of Object.entries(cases)) {
      const read = readDashboardSources(sourcePathsOf(fixture.files))
      let gate
      try {
        gate = read.input.route
      } catch (err) {
        problems.push(problem('DASH-READER-THROWS', `读源在 ${name} 这一态抛了：${String(err?.message ?? err)}`))
        continue
      }
      reasons[name] = { ok: gate?.ok, reason: gate?.reason, value: gate?.value ?? null }
    }
    rec.readings.reader_reasons = reasons
    const want = { present: 'ok', missing: 'missing', corrupt: 'unreadable', schema: 'schema' }
    for (const [name, reason] of Object.entries(want)) {
      const got = reasons[name]
      if (got === undefined) continue
      if (got.reason !== reason) problems.push(problem('DASH-REASON-COLLAPSED', `${name} 这一态读出来的 reason 是 ${JSON.stringify(got.reason)}，契约 §4 是 ${JSON.stringify(reason)} —— 四种状态塌在一起，读的人就分不清"没有"和"坏了"`))
      if (reason !== 'ok' && got.ok !== false) problems.push(problem('DASH-REASON-COLLAPSED', `${name} 这一态 ok 仍是 ${got.ok}（应当 false）`))
      if (reason !== 'ok' && got.value !== null) problems.push(problem('DASH-REASON-COLLAPSED', `${name} 这一态 value 是 ${JSON.stringify(got.value)}，应当 null`))
    }

    // ── ⑤ 字段算出来的数：票读**投影**，不读落盘 status（对照表 E15）────────
    const { dashboardOf } = mod.mod
    if (typeof dashboardOf === 'function') {
      const fixture = cases.present
      const read = readDashboardSources(sourcePathsOf(fixture.files))
      const view = dashboardOf(read.input)
      const tickets = view?.debts?.find?.((d) => d.key === 'tickets')
      rec.readings.tickets_cell = tickets ?? null
      // 夹具两张票：票一 `legacy_status: 'open'`（没有任务）⇒ open；
      // 票二 `status: 'done'` 但**没有任务、没有 legacy_status** ⇒ 投影**仍是 open**（存着的 status 不是权威）。
      // ⇒ 按投影 open 恰好 2；读落盘 status 会得到 1。
      if (tickets?.value !== 2) {
        problems.push(problem('DASH-TICKET-PROJECTION', `票那一格是 ${JSON.stringify(tickets?.value)}，按投影应当是 2（夹具里有一张 status:'done' 但没有任务、没有 legacy_status 的票 —— 它的投影仍是 open；读落盘 status 会得到 1）`))
      }
    }

    caseFail(problems)
  })
})

test('DASH-09 这一版不读 now.md（字段表 / 视图键 / 夹具标记三面都判）', async () => {
  await runCase('DASH-09', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const mod = await loadDashboard()
    if (!mod.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${DASH_MODULE}（${mod.reason}）`))
      caseFail(problems)
    }
    const { DASHBOARD_FIELDS, dashboardOf, readDashboardSources } = mod.mod

    // 针的自证：同一个扫描器对一条真的 now.md 路径必须命中（否则"零命中"是死的）。
    const needle = (fields) => fields.filter((f) => typeof f?.file === 'string' && f.file.endsWith('now.md')).map((f) => f.id)
    const selfProof = needle([{ id: 'x', file: 'x/now.md' }])
    if (selfProof.length !== 1) problems.push(problem('DASH-RULER-BROKEN', '扫 now.md 的那个针连一条假路径都没命中 ⇒ 它永远零命中'))

    // ── ① 字段表里没有 now.md ───────────────────────────────────────────────
    const hits = needle(Array.isArray(DASHBOARD_FIELDS) ? DASHBOARD_FIELDS : [])
    rec.readings.now_md_fields = hits
    if (hits.length > 0) problems.push(problem('DASH-READS-NOW-MD', `字段表里指向 now.md 的字段：${hits.join(', ')} —— 定形 §八.3 决定这一版不读它（"要加'下一步'，先给 now.md 加一行可解析的锚"，那是另一条改动）`))

    // ── ② 夹具里放一份 now.md（带唯一标记），看板数据里不许出现它 ─────────────
    const MARKER = 'DASH-NOW-MD-MARKER-8f2c1d'
    const fixture = writeSources('DASH-09', 'with-now-md')
    const nowFile = path.join(fixture.dir, '.team', 'leader', 'now.md')
    mkdirSync(path.dirname(nowFile), { recursive: true })
    writeFileSync(nowFile, `# now\n\n## 下一步（按这个次序）\n\n1. ${MARKER} 这一条只该活在 now.md 里\n`, 'utf8')
    rec.readings.fixture_now_md = nowFile

    const read = readDashboardSources(sourcePathsOf(fixture.files))
    const view = dashboardOf(read.input)
    const haystack = `${JSON.stringify(view)}\n${JSON.stringify(read.sources)}`
    if (haystack.includes(MARKER)) problems.push(problem('DASH-READS-NOW-MD', `看板数据里出现了 now.md 的正文标记（${MARKER}）—— this 版不许读它（定形 §八.3）`))

    // ── ③ 视图里没有"下一步"这一类格子（它是 now.md 唯一会带来的东西）────────
    const keys = allKeys(view)
    rec.readings.view_keys = keys
    const forbidden = keys.filter((k) => /^(next|nextStep|next_step|todo|todos|now|nowMd|now_md)$/i.test(k))
    if (forbidden.length > 0) problems.push(problem('DASH-READS-NOW-MD', `视图里出现了只可能来自 now.md 的键：${forbidden.join(', ')}（定形 §八.3：这一版不读它）`))

    caseFail(problems)
  })
})
