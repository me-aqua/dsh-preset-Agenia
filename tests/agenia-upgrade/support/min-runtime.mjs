/**
 * **DR-01 的最小 `.runtime`（数据段）** —— 端到端正例要的那一份"装好的库"。
 *
 * 为什么要有这个文件（来历，不是设计说明）：
 *   `DR-01` 的端到端正例（`--real-mode` + 只读 op）此前是**第三态 HOLD**
 *   （`REAL-MODE-POSITIVE-VACUOUS`）：它的靶子是 SUT 自己算出来的 `REAL_BRAIN_ROOT`
 *   （= `<预设目录>/.runtime`），而 **staging 是开发副本、盘上没有 `.runtime`** ⇒ 判不了。
 *   这一份夹具就是"那个目录里该有什么"的最小答案。
 *
 * 🔴 **三条边界（照实写，别读宽了）**
 *   1. **只落在运行根里**：本模块只往调用方给的那个绝对路径写，而调用方（`installed.mjs`）
 *      给的是**运行根下那份预设副本**里的 `.runtime`。`presets\agenia\.runtime`（生产库）
 *      与 `.tools\_staging`（staging 本体）**一个字节都不碰**（`integration/data-root.test.mjs` 文件头死命令）。
 *   2. **不是"让绿"**：这里放的是**数据**，不是期望值。判据照旧要求
 *      exit 0 / `ok:true` / 读数与盘上那份文件对得上；把这份数据抽走，那一格必须重新**红**
 *      （用例里有一步专门抽走它再跑一遍，读数落在 `result.json` 的 `ablation_without_runtime`）。
 *   3. **最小 ≠ 假**：`memory/snapshots/v0.json` → `v1.json` 是一条真的版本链，
 *      `common-sense.md` 的哈希真的写进了三处（快照 / 共享状态 / 报告），
 *      条目文本与字符数由**测试侧独立实现**重算一遍（见 `verifyMinimalRuntime`）。
 *      只有 `audit.jsonl` **没有**：审计链由 `appendAudit` 自哈希链产生，
 *      手写一条等于编造一条 —— 这个库在本格里只被读，一条审计都没有才是诚实的形状。
 *
 * 谁读这些文件（照实点名，别把装饰当成承重）：
 *   · `entry-count`  → `memory/snapshots/current` + `v1.json`（以及 `v0.json` 只作为父版本存在）
 *   · `state-read`   → `state/current-day.json` + `state/update/<day>.json`
 *   · `report-read`  → `reports/memory-update/<day>.json`（**盘上有它**才 `derived:false`）
 *   · `common-sense.md` / `state/common-sense.json`：**本格没有 op 读它们**；
 *     它们在这里是因为"装好的库里一定有"，且 `verifyMinimalRuntime` 会核对三处哈希一致。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** 字符口径 —— 与生产 `charCountOf` **独立**的一份实现（本模块不 import 被测代码）。 */
export function charCountOf(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  return [...text.replace(/^\uFEFF+/, '').replace(/\r\n?/g, '\n')].length
}

const TYPE_IDS = ['general', 'boss', 'machine', 'project']
const TYPE_NAMES = {
  general: '【底层通用】',
  boss: '【关于老板】',
  machine: '【关于本机】',
  project: '【关于某个项目】',
}
const CHAR_METRIC = Object.freeze({ unit: 'unicode-code-point', normalization: 'strip-bom+lf', scope: 'entry.text', schema: 1 })
/** 共享更新状态里的租约常量（唯一来源是 `lib/liveness.mjs`；这里只是把同一个数写进夹具）。 */
const UPDATE_LEASE_MINUTES = 90

/** 测试侧的四类分布（顺序 = `TYPE_IDS`，0 条的类型也在）。 */
export function distributionOf(entries) {
  const buckets = new Map(TYPE_IDS.map((typeId) => [typeId, { typeId, typeName: TYPE_NAMES[typeId], count: 0, chars: 0 }]))
  for (const e of Array.isArray(entries) ? entries : []) {
    const bucket = buckets.get(e?.type)
    if (!bucket) throw new Error(`夹具里的 entry.type 不在四类里：${JSON.stringify(e?.type)}（id=${e?.id ?? '(无 id)'}）`)
    bucket.count += 1
    bucket.chars += charCountOf(e?.text)
  }
  return TYPE_IDS.map((typeId) => buckets.get(typeId))
}

const sha256Text = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/**
 * 夹具（**冻结的数据段**）。
 *
 * `expect` 是**手写的真值**（不从生成结果反推）：改 `entries` 而不改这里 ⇒
 * `verifyMinimalRuntime` 当场红 —— 否则"读数是几"就变成"生成器说是几就是几"。
 */
export const MIN_RUNTIME = Object.freeze({
  /** 库里"那一天"。故意**不等于**运行根注入的时钟那一天（见 `clockDay`）—— */
  day: '2026-10-22',
  /** 运行根注入的时钟（`run-all.mjs` 的 `AGENIA_NOW_FILE`）。两个日子不同是**刻意的**：
   *  于是 `state-read` 报出 `2026-10-22` 只可能来自盘上那个 `current-day` 指针，不可能来自时钟。 */
  clockDay: '2026-10-14',
  commonSense: [
    '# 常识（DR-01 最小库 · 夹具，不是老板的常识）',
    '',
    '> 这份 `.runtime` 只服务于 DR-01 的端到端正例：让「装好的预设」这条路上真的有一个库可读。',
    '',
  ].join('\n'),
  entries: [
    {
      id: 'mr-01',
      type: 'general',
      text: 'fixture entry alpha',
      raw: 1,
      double_low_streak: 0,
      is_double_low: false,
      last_evidence_review: '2026-10-21',
      known_from: 'DR-01 夹具',
      created_at: '2026-10-20T09:00:00+08:00',
      type_changed_at: null,
    },
    {
      id: 'mr-02',
      type: 'project',
      text: 'fixture entry beta',
      raw: 1,
      double_low_streak: 0,
      is_double_low: false,
      last_evidence_review: '2026-10-22',
      known_from: 'DR-01 夹具',
      created_at: '2026-10-21T09:00:00+08:00',
      type_changed_at: null,
    },
  ],
  /** `v0` = `init` 那一刻（空库），`v1` = 发布过一次更新之后的当前快照。 */
  versions: ['v0', 'v1'],
  expect: {
    version: 'v1',
    /** 2 条（`mr-01` + `mr-02`）。 */
    count: 2,
    /** 19 + 18 = 37 个 unicode code point（`fixture entry alpha` / `fixture entry beta`，全 ASCII）。 */
    chars: 37,
    distributionCount: 4,
  },
})

const snapshotOf = (spec, version, { parentVersion, entries, generatedAt, sha, publication }) => {
  const distribution = distributionOf(entries)
  return {
    schema: 1,
    version,
    parent_version: parentVersion,
    generated_at: generatedAt,
    common_sense_sha256: sha,
    entries,
    distribution,
    totals: {
      count: distribution.reduce((a, d) => a + d.count, 0),
      chars: distribution.reduce((a, d) => a + d.chars, 0),
    },
    char_metric: { ...CHAR_METRIC },
    accepted_proposal_ids: [],
    accepted_maintenance_ids: [],
    archived: [],
    publication_version: publication,
  }
}

/** 夹具的**全部文件**（相对 `.runtime`，正斜杠）—— 一份声明，落盘与自检读同一份。 */
export function minRuntimeFiles(spec = MIN_RUNTIME) {
  const sha = sha256Text(spec.commonSense)
  const at = '2026-10-22T09:00:00+08:00'
  const v0 = snapshotOf(spec, 'v0', { parentVersion: null, entries: [], generatedAt: '2026-10-22T08:59:00+08:00', sha, publication: 0 })
  const v1 = snapshotOf(spec, 'v1', {
    parentVersion: 'v0',
    entries: spec.entries.map((e) => ({
      ...e,
      imp_share: 0,
      fresh_share: 0,
    })),
    generatedAt: at,
    sha,
    publication: 1,
  })
  const report = {
    schema: 1,
    day: spec.day,
    generated_at: at,
    snapshot: 'v1',
    base_snapshot: 'v0',
    distribution: v1.distribution,
    totals: v1.totals,
    char_metric: { ...CHAR_METRIC },
    accepted_proposal_ids: [],
    accepted_maintenance_ids: [],
    maintenance_decisions: [],
    common_sense_sha256: sha,
    report: { memory_update: `reports/memory-update/${spec.day}.json` },
    derived: false,
  }
  const state = {
    schema: 1,
    day: spec.day,
    generation: 1,
    phase: 'unclaimed',
    snapshot_available: false,
    snapshot_ready_at: null,
    owner_project: null,
    owner_session: null,
    judge_attempt: 0,
    review_attempt: 0,
    judge_token: null,
    frozen_proposal_ids: [],
    base_snapshot: null,
    new_snapshot: null,
    common_sense_sha256: sha,
    reports: { memory_update: `reports/memory-update/${spec.day}.json` },
    started_at: at,
    last_liveness_event_at: at,
    finished_at: null,
    update_lease_minutes: UPDATE_LEASE_MINUTES,
    failure_reason: null,
  }
  const json = (obj) => `${JSON.stringify(obj, null, 2)}\n`
  return [
    { rel: 'common-sense.md', text: spec.commonSense },
    { rel: 'memory/snapshots/current', text: 'v1\n' },
    { rel: 'memory/snapshots/v0.json', text: json(v0) },
    { rel: 'memory/snapshots/v1.json', text: json(v1) },
    { rel: 'state/common-sense.json', text: json({ schema: 1, sha256: sha, confirmed_by: null, confirmed_at: at, previous_sha256: null }) },
    { rel: 'state/current-day.json', text: json({ schema: 1, day: spec.day, updated_at: at }) },
    { rel: `state/update/${spec.day}.json`, text: json(state) },
    { rel: `reports/memory-update/${spec.day}.json`, text: json(report) },
  ]
}

/** 空壳目录（"装好的库"有它们，且写面要往里落；本格里一个都不会被写）。 */
export const MIN_RUNTIME_DIRS = Object.freeze([
  'locks',
  'memory/archive',
  'notices',
  'proposals',
  'state/jobs',
])

/**
 * 把夹具写到 `runtimeRoot`（**先清空再写**：同一跑里重复调用得到同一棵树）。
 *
 * @returns {{root:string, files:Array<{rel:string,abs:string,bytes:number,sha256:string}>, dirs:string[]}}
 */
export function materializeMinimalRuntime(runtimeRoot, spec = MIN_RUNTIME) {
  // 只往"刚装好、还没有库"的那个目录里摆：已经有东西 ⇒ 说清楚，**不覆盖、不删除**。
  if (existsSync(runtimeRoot)) {
    const already = readdirSync(runtimeRoot)
    if (already.length > 0) {
      throw new Error(`E_DATA_EXISTS: ${runtimeRoot} 里已经有 ${already.length} 项（${already.slice(0, 5).join(' / ')}）—— 夹具只摆在空目录上`)
    }
  }
  mkdirSync(runtimeRoot, { recursive: true })
  for (const dir of MIN_RUNTIME_DIRS) mkdirSync(path.join(runtimeRoot, dir), { recursive: true })
  const files = []
  for (const { rel, text } of minRuntimeFiles(spec)) {
    const abs = path.join(runtimeRoot, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, text, 'utf8')
    files.push({ rel, abs, bytes: Buffer.byteLength(text, 'utf8'), sha256: sha256Text(text) })
  }
  return { root: runtimeRoot, files, dirs: [...MIN_RUNTIME_DIRS] }
}

function walkFiles(root) {
  const out = []
  const go = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) go(full)
      else if (st.isFile()) out.push(path.relative(root, full).replace(/\\/g, '/'))
    }
  }
  go(root)
  return out.sort()
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/**
 * **夹具自洽校验** —— 盘上那棵树必须与 `MIN_RUNTIME` 声明、与测试侧独立重算三者对得上。
 *
 * 为什么要有它：这份 `.runtime` 是**手写形状**的。如果不自检，
 * 一个把 `totals.chars` 写错的夹具会让 `entry-count` 报出一个"真读数"——
 * 读的是错的文件，红/绿都说不清是谁的错。
 *
 * @returns {{ok:boolean, problems:Array<{code:string,detail:string}>, readings:object}}
 */
export function verifyMinimalRuntime(runtimeRoot, spec = MIN_RUNTIME) {
  const problems = []
  const bad = (code, detail) => problems.push({ code, detail })
  const readings = { root: runtimeRoot, files: [], expect: { ...spec.expect } }
  if (!existsSync(runtimeRoot)) {
    bad('MIN-RUNTIME-MISSING', `.runtime 不在：${runtimeRoot}`)
    return { ok: false, problems, readings }
  }
  const files = walkFiles(runtimeRoot)
  readings.files = files
  readings.file_count = files.length

  // ① 声明里的每一个文件都得在盘上（少一个 ⇒ 后面那些读操作会以别的方式红，先在这里点名）
  for (const { rel } of minRuntimeFiles(spec)) {
    if (!files.includes(rel)) bad('MIN-RUNTIME-FILE', `夹具少了 ${rel}（${runtimeRoot}）`)
  }

  // ② 指针：`current` 必须指向声明的那一版
  let pointer = null
  try {
    pointer = readFileSync(path.join(runtimeRoot, 'memory/snapshots/current'), 'utf8').trim()
  } catch (err) {
    bad('MIN-RUNTIME-POINTER', `current 指针读不出来：${String(err.message).slice(0, 160)}`)
  }
  readings.current = pointer
  if (pointer !== null && pointer !== spec.expect.version) bad('MIN-RUNTIME-POINTER', `current 指针 = ${JSON.stringify(pointer)}，声明是 ${spec.expect.version}`)

  // ③ 快照：版本链 / 条目数 / 字符数 / 四类分布 —— 一律**测试侧重算**，再与文件里写的对账
  let snap = null
  try {
    snap = readJson(path.join(runtimeRoot, 'memory/snapshots', `${spec.expect.version}.json`))
  } catch (err) {
    bad('MIN-RUNTIME-SNAPSHOT', `${spec.expect.version}.json 读不出来：${String(err.message).slice(0, 160)}`)
  }
  if (snap !== null) {
    const entries = Array.isArray(snap.entries) ? snap.entries : []
    const distribution = distributionOf(entries)
    const totals = { count: distribution.reduce((a, d) => a + d.count, 0), chars: distribution.reduce((a, d) => a + d.chars, 0) }
    readings.snapshot = { version: snap.version, parent_version: snap.parent_version, entries: entries.length, totals, declared_totals: snap.totals }
    if (snap.version !== spec.expect.version) bad('MIN-RUNTIME-SNAPSHOT', `快照版本 = ${JSON.stringify(snap.version)} ≠ ${spec.expect.version}`)
    if (entries.length !== spec.expect.count) bad('MIN-RUNTIME-COUNT', `重算条目数 ${entries.length} ≠ 声明的 ${spec.expect.count}`)
    if (totals.chars !== spec.expect.chars) bad('MIN-RUNTIME-CHARS', `重算字符数 ${totals.chars} ≠ 声明的 ${spec.expect.chars}`)
    if (JSON.stringify(snap.totals) !== JSON.stringify(totals)) bad('MIN-RUNTIME-TOTALS', `快照里写的 totals=${JSON.stringify(snap.totals)} ≠ 重算 ${JSON.stringify(totals)}`)
    if (JSON.stringify(snap.distribution) !== JSON.stringify(distribution)) bad('MIN-RUNTIME-DISTRIBUTION', `快照里写的 distribution ≠ 重算（${JSON.stringify(distribution)}）`)
    if (distribution.length !== spec.expect.distributionCount) bad('MIN-RUNTIME-DISTRIBUTION', `四类分布 ${distribution.length} 项 ≠ ${spec.expect.distributionCount}`)
    if (snap.char_metric?.unit !== CHAR_METRIC.unit) bad('MIN-RUNTIME-METRIC', `char_metric.unit = ${JSON.stringify(snap.char_metric?.unit)} ≠ ${CHAR_METRIC.unit}`)
  }

  // ④ 三处哈希必须同源：common-sense.md → 快照 → 共享状态 → 报告
  let csSha = null
  try {
    csSha = sha256Text(readFileSync(path.join(runtimeRoot, 'common-sense.md'), 'utf8'))
  } catch (err) {
    bad('MIN-RUNTIME-CS-HASH', `common-sense.md 读不出来：${String(err.message).slice(0, 160)}`)
  }
  readings.common_sense_sha256 = csSha
  const hashSites = {
    snapshot: snap?.common_sense_sha256 ?? null,
    state: (() => {
      try {
        return readJson(path.join(runtimeRoot, 'state/update', `${spec.day}.json`)).common_sense_sha256
      } catch {
        return null
      }
    })(),
    report: (() => {
      try {
        return readJson(path.join(runtimeRoot, 'reports/memory-update', `${spec.day}.json`)).common_sense_sha256
      } catch {
        return null
      }
    })(),
  }
  readings.common_sense_sites = hashSites
  for (const [site, value] of Object.entries(hashSites)) {
    if (value !== csSha) bad('MIN-RUNTIME-CS-HASH', `${site} 里的 common_sense_sha256 = ${JSON.stringify(value)} ≠ sha256(common-sense.md) = ${csSha}`)
  }

  // ⑤ 日期：三处都必须是声明的那一天（并且**不是**注入时钟那一天 —— 那会让 state-read 的读数有第二种解释）
  const daySites = {}
  try {
    daySites.current_day = readJson(path.join(runtimeRoot, 'state/current-day.json')).day
  } catch {
    daySites.current_day = null
  }
  try {
    daySites.state = readJson(path.join(runtimeRoot, 'state/update', `${spec.day}.json`)).day
  } catch {
    daySites.state = null
  }
  try {
    daySites.report = readJson(path.join(runtimeRoot, 'reports/memory-update', `${spec.day}.json`)).day
  } catch {
    daySites.report = null
  }
  readings.day_sites = daySites
  for (const [site, value] of Object.entries(daySites)) {
    if (value !== spec.day) bad('MIN-RUNTIME-DAY', `${site} 的 day = ${JSON.stringify(value)} ≠ ${spec.day}`)
  }
  // ⑥ 「那一天不可能来自时钟」：注入时钟那天的状态文件不在，且两个日子不同 ——
  //    否则 `state-read` 读出 `2026-10-22` 就有第二种解释（时钟），读数当场变弱。
  readings.clock_day = spec.clockDay
  if (spec.clockDay === spec.day) bad('MIN-RUNTIME-DAY', '夹具的 day 与注入时钟那一天相同 ⇒ 端到端读数分不出"读到了那一天"和"用了时钟"')
  if (files.includes(`state/update/${spec.clockDay}.json`)) {
    bad('MIN-RUNTIME-DAY', `夹具里居然有注入时钟那一天的状态文件（state/update/${spec.clockDay}.json）⇒ state-read 的 day 有两种解释`)
  }

  return { ok: problems.length === 0, problems, readings }
}

/**
 * **抽走夹具**（阳性对照用）：把 `.runtime` 整个改名搬开，返回还原要用的凭据。
 *
 * 只改名、**从不删除**（本模块一次 `rmSync` 都没有 —— 静态扫描 `DELETE-NO-MARKER` 那条守的正是这件事）：
 * 还原必须逐字节回到原位，抽走的那一棵就是唯一的凭据。
 */
export function quarantineRuntime(runtimeRoot) {
  const movedTo = `${runtimeRoot}.quarantined`
  if (existsSync(movedTo)) {
    throw new Error(`E_DATA_EXISTS: ${movedTo} 已经在盘上 —— 上一轮抽走的那一棵没人放回去，先看现场`)
  }
  if (!existsSync(runtimeRoot)) throw new Error(`E_DATA_MISSING: ${runtimeRoot} 不在盘上 —— 没有可抽走的夹具`)
  renameSync(runtimeRoot, movedTo)
  return { from: runtimeRoot, movedTo }
}

/** 把 `quarantineRuntime` 搬走的那一棵放回原位（原位必须空着；不覆盖任何东西）。 */
export function restoreQuarantinedRuntime(token) {
  if (existsSync(token.from)) throw new Error(`E_DATA_EXISTS: ${token.from} 已经在盘上 —— 还原前原位必须是空的（不覆盖）`)
  if (!existsSync(token.movedTo)) throw new Error(`E_DATA_MISSING: ${token.movedTo} 不在盘上 —— 抽走的那一棵没了`)
  renameSync(token.movedTo, token.from)
  return { restoredTo: token.from, from: token.movedTo }
}
