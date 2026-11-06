/**
 * **卡（记忆更新报告）的被测面常量与夹具** —— 任务 C2 的六格共用。
 *
 * 契约：`.team/test/CONTRACT-C2.md`（第 2 关交付物）。定形：
 * `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版，冻结）——§2.3 末段（卡的三区 +
 * 状态条 + 容量行 + 两张卡）· §3.2（路线格的第一行 / 暂停徽标）· §3.4（票状态 = 投影）·
 * §3.1 第 7 条（50/30）· §4.2（三条线 + `unclassified`）· §6.2 的十行。
 *
 * 🔴 为什么这些名字要冻：C2 判的是"卡上那几格印的是什么"。名字不冻 ⇒ 每格都得猜 key，
 *    猜错一次就同时得到一条假红和一条假绿（`mig-rules-11`）。所以
 *    **页名 / 39 个 key / 十二格 / 红因码 / 生成器调用形状** 只在这里出现一次。
 *
 * ⚠️ 本文件是**工具**，不是用例：`discover.mjs` 只数 `static|unit|integration|report` 四棵树里的
 *   `*.test.mjs`，`support/` 不进分母。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, PATHS } from './env.mjs'
import { makeWorkspace } from './bug-surface.mjs'
import { NODE_BIN, childEnv, livePath, runCli } from './sut.mjs'
import { pythonBin } from './day-cut.mjs'
import { canonical } from './root-guard.mjs'

// ── 卡的落点与页名（契约 §2.1 / §2.4）──────────────────────────────────────
/** 卡 1 的文件名（生成器的现行为；`--day` 进文件名）。契约 §3.8：卡名逐字 `记忆更新报告`。 */
export const CARD_NAME = '记忆更新报告'
/** 卡 2 的文件名（技术评审回执）。第二段回执落在它上面（组长 2026-11-02 裁定第 5 条）。 */
export const CARD2_NAME = '技术评审回执'
export const cardDir = (ws, day) => path.join(ws, '.team', 'leader', day)
export const cardFile = (ws, day) => path.join(cardDir(ws, day), `${CARD_NAME}-${day}.xlsx`)
export const card2File = (ws, day) => path.join(cardDir(ws, day), `${CARD2_NAME}-${day}.xlsx`)
/** 失败标记（append-only 的 JSONL；契约 §3.8 —— 生成器唯一能写的"日志"位）。 */
export const failureFile = (ws, day) => path.join(cardDir(ws, day), `${CARD_NAME}-FAILED.jsonl`)

/** 卡 1 的机器读页名（**逐字**：空格与中点都照抄）。 */
export const CARD_SHEET = 'C2 · 验收格'
/** 卡 2 的机器读页名（**逐字**）。 */
export const CARD2_SHEET = 'C2 · 回执格'

/**
 * 卡 1 冻结的 39 个 key（契约 §2.3 那张表，**次序即表序**）。
 * 少一个 ⇒ `C2-SHEET-MISSING-KEY`；多一个**不红**（加性键允许）。
 * ⚠️ `receipt.conversation` **不在这里**：第二段落在卡 2（`CARD2_KEYS`）。
 */
export const CARD_KEYS = Object.freeze([
  'route.first_line',
  'route.mode',
  'route.pause_badge',
  'route.red_bar',
  'tickets.open',
  'tickets.in_progress',
  'tickets.done',
  'tickets.void',
  'tickets.legacy',
  'tickets.total',
  'bug.open',
  'bug.open.source',
  'cap.bug_open',
  'cap.bug_open.source',
  'cap.oldest_age_days',
  'cap.red',
  'cap.reasons',
  'severity.lines',
  'severity.samples',
  'severity.calibrated',
  'severity.card_red',
  'severity.escalations',
  'statusbar',
  'statusbar.count',
  'capacity.count',
  'capacity.chars',
  'capacity.cap_count',
  'capacity.cap_chars',
  'capacity.source',
  'capacity.state',
  'receipt.required',
  'receipt.technical',
  'receipt.red',
  'card.name',
  'card.generator',
  'card.day',
  'card.as_of',
  'card.red',
  'card.reasons',
])

/** 卡 2 冻结的 6 个 key（契约 §2.4）。少一个 ⇒ `C2-RECEIPT-SHEET-MISSING-KEY`。 */
export const CARD2_KEYS = Object.freeze([
  'card.name',
  'card.day',
  'receipt.required',
  'receipt.conversation',
  'receipt.red',
  'card.reasons',
])

/**
 * **十二格状态条**（契约 §4.2，次序即表序、`key` 逐字）。
 *
 * `wired_required` = 契约要求值，**十二格全是 `true`**（组长 2026-11-02 裁定第 1 条：
 * 五格全部接线，不是留常驻红）。`wired:false ⇒ red` 那条判据仍在，但它是**负样本**
 * （`CARD-05` 用合成输入证明它翻得动面），不是这一版可以留着的一格红。
 */
export const STATUS_CELLS = Object.freeze([
  Object.freeze({ key: 'cap_50_30', label: '50/30', producer: 'bug.bug-read.cap', wired_required: true, owner: 'B1' }),
  Object.freeze({ key: 'uninitialized', label: '未建账', producer: 'route.mode-of', wired_required: true, owner: 'C1b' }),
  Object.freeze({ key: 'memory_chain', label: '记忆链红', producer: 'memory.report-read', wired_required: true, owner: '记忆链' }),
  Object.freeze({ key: 'sla', label: 'SLA 红', producer: 'bug.sla', wired_required: true, owner: 'B3' }),
  Object.freeze({ key: 'carrier_missing', label: 'carrier 缺', producer: 'review.carrier', wired_required: true, owner: 'C1/C3' }),
  Object.freeze({ key: 'observation_count', label: 'observation 数', producer: 'bug.bug-read.counts.observation_open', wired_required: true, owner: 'B1' }),
  Object.freeze({ key: 'unknown_preset', label: '未知预设报警', producer: 'identity.<day>.json', wired_required: true, owner: 'A' }),
  Object.freeze({ key: 'preset_downgrade', label: '预设降级', producer: 'identity.<day>.json', wired_required: true, owner: 'A' }),
  Object.freeze({ key: 'legacy_sessions', label: 'legacy 会话数', producer: 'route.legacy', wired_required: true, owner: 'A + C1a' }),
  Object.freeze({ key: 'slot_not_enforced', label: '单写者未执行', producer: 'route.read.slot', wired_required: true, owner: 'C1c' }),
  Object.freeze({ key: 'stale_slot', label: 'stale 槽', producer: 'route.read.slot.holders', wired_required: true, owner: 'C1c' }),
  Object.freeze({ key: 'red_bar', label: '红条', producer: 'card.reasons', wired_required: true, owner: 'C2' }),
])

/** 状态条的 `state` 闭集（契约 §4.1：四个值；"黄"就是 `yellow`）。 */
export const STATUS_STATES = Object.freeze(['green', 'red', 'yellow', 'unknown'])
/** 只许"探针降级"的两格（A0b / A0d 不成立 ⇒ 卡槽格黄；C1 §11）。 */
export const PROBE_DEGRADED_KEYS = Object.freeze(['slot_not_enforced', 'stale_slot'])
export const PROBE_IDS = Object.freeze(['A0b', 'A0d'])

/** `card.reasons[].code` 的闭集（契约 §5；带 `<…>` 的是前缀码）。 */
export const RED_CODES = Object.freeze([
  'ROUTE_MISSING',
  'ROUTE_UNREADABLE',
  'HEADLINE_EMPTY',
  'VOID_WITH_LIVE_TASK',
  'CAP_50_30',
  'SEVERITY_CANNOT_UNESCALATED',
  'SEVERITY_CARD_RED',
  'CAPACITY_UNREADABLE',
  'RECEIPT_MISSING:',
  'RECEIPT_EXPIRED:',
  'CARD_UNWIRED:',
  'SLOT_NOT_ENFORCED',
  'STALE_SLOT',
  'SLA_OVER_CYCLE',
])

/** 三条线 + 第四个出口（次序冻结：契约 §3.5）。 */
export const SEVERITY_LINES = Object.freeze(['data_broken', 'function_broken_repro', 'reading_lies', 'unclassified'])
/** 四个样本（正 / 负 / 第三线正 / 第三线负）。第二条线**没被采样** ⇒ `calibrated:false`。 */
export const SAMPLE_SET = Object.freeze([
  Object.freeze({ line: 'data_broken', polarity: 'positive' }),
  Object.freeze({ line: 'data_broken', polarity: 'negative' }),
  Object.freeze({ line: 'reading_lies', polarity: 'positive' }),
  Object.freeze({ line: 'reading_lies', polarity: 'negative' }),
])
export const sampleIds = (set = SAMPLE_SET) => set.map((s) => `${s.line}:${s.polarity}`)

// ── 现场：工作区 + 数据根 + 注入时钟 ─────────────────────────────────────────
/**
 * 一格一副根：**工作区**（带 marker；`--workspace` 的合法姿势）与**数据根**（记忆库那一侧）。
 * 两者必须分开：`daily-cards.py` 的 `DR` 是"预设级"的（默认按 `WS` 推），夹具里显式给。
 */
export function makeCardRoots(caseId, tag) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const ws = makeWorkspace(caseId, tag)
  mkdirSync(path.join(ws, '.team'), { recursive: true })
  const dr = path.join(runRoot, 'card-data-root', `${String(caseId).toLowerCase()}-${tag}`)
  mkdirSync(dr, { recursive: true })
  const nowFile = path.join(runRoot, 'card-clock', `${String(caseId).toLowerCase()}-${tag}.txt`)
  mkdirSync(path.dirname(nowFile), { recursive: true })
  return { ws, dr, nowFile, runRoot }
}

/** 把注入时钟摆到 `iso`（**同一个文件**，`daily-cards.py::now_instant()` 读的就是它）。 */
export function setClock(roots, iso) {
  writeFileSync(roots.nowFile, `${iso}\n`, 'utf8')
  return { ...childEnv(), [ENV.NOW_FILE]: roots.nowFile }
}

export function writeJsonAt(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
  return file
}

export function readJsonAt(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function sha256Of(file) {
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null
}

/**
 * 夹具的**参考线来源**：`<WS>/presets/agenia/lib/memory.mjs`（生成器 `read_capacity()` 读的就是它）。
 *
 * ⚠️ 两个值**故意是怪值**（137 / 12_345）：写死 200 / 80000 的实现当场翻红（契约 §3.6
 * `C2-CAPACITY-HARDCODED`）。而且这里必须写成 `const CAP_COUNT = …` 那个**逐字形状**——
 * 生成器的正则就是 `^const CAP_COUNT`（`daily-cards.py:54-58`），夹具不许比被测面更宽松。
 */
export function writeMemorySource(ws, { capCount = 137, capChars = 12345 } = {}) {
  const text = [
    '// C2 夹具：容量参考线的**唯一来源**（契约 §3.6）。两个值故意不是 200 / 80000。',
    `const CAP_COUNT = ${capCount}`,
    `const CAP_CHARS = ${String(capChars).replace(/\B(?=(\d{3})+(?!\d))/g, '_')}`,
    '',
  ].join('\n')
  return writeJsonAtText(memorySourceAt(ws), text)
}

function writeJsonAtText(file, text) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
  return file
}

/**
 * 数据根（记忆库那一侧）：`state/update/<day>.json` + `reports/memory-update/<day>.json` +
 * `memory/snapshots/<snap>.json`。三个文件都写 —— 生成器三个都读（`daily-cards.py:189-198`）。
 * `totals` 是**容量的实际占用**（契约 §3.6：不是参考线）。
 */
export function writeDataRoot(dr, { day, snapshot = 'v-c2', base = 'v-c2-base', totals = { count: 73, chars: 4321 }, distribution = [] } = {}) {
  writeJsonAt(path.join(dr, 'state', 'update', `${day}.json`), {
    phase: 'judged',
    snapshot_available: true,
    owner_project: 'harness',
    new_snapshot: snapshot,
    base_snapshot: base,
  })
  writeJsonAt(path.join(dr, 'reports', 'memory-update', `${day}.json`), {
    snapshot,
    base_snapshot: base,
    generated_at: `${day}T02:00:00.000Z`,
    distribution,
    totals,
    common_sense_sha256: 'a'.repeat(64),
    maintenance_decisions: [],
  })
  return writeJsonAt(path.join(dr, 'memory', 'snapshots', `${snapshot}.json`), {
    schema: 1,
    snapshot,
    entries: [],
    distribution,
    totals,
    char_metric: { unit: 'unicode-code-point', normalization: 'strip-bom+lf', scope: 'entry.text' },
  })
}

/** 把数据根里那份快照删掉（判"快照读不到 ⇒ 容量红、不出 0"那一格）。 */
export function removeSnapshot(dr, snapshot = 'v-c2') {
  const file = path.join(dr, 'memory', 'snapshots', `${snapshot}.json`)
  if (existsSync(file)) writeFileSync(file, '{ 这不是 JSON', 'utf8')
  return file
}

// ── 夹具：路线账本（照 CONTRACT-C1 §3.1 / §4.2 / §7.5 的**冻结形状**手写）────────
/**
 * 一份路线账本。**手写**（不是从实现反推）：卡读的是**文件**（契约 §6 第 2 条），
 * 而"老账本 `headline` 空"这个**真实形态**只能靠手写才造得出来（C1 §6.3：它来自 C1 之前的 `init`）。
 *
 * ⚠️ 手写的账本**没有**审计链 ⇒ `--op read` 会拒（`E_ROUTE_TAMPERED`）。
 *    所以"票投影的第二个读者"这件事**只落在 bug 台账那一侧**（`bug-read` 不验审计链，`CARD-03` 的 C 段）；
 *    路线那一路的跨读者**没有做**（read 会因链坏而拒）—— 那一段是坦白，不是遗漏：
 *    合同 §6 第 2 条已经把"卡读文件、read op 只做对账"写死，票投影的机器对账靠 `projectTickets()`
 *    这份**第二实现**（只用来算期望值，不当被测面）。
 */
export function routeLedger({
  goal = { id: 'agenia-improve', title: 'Agenia 持续改进' },
  stageName = '执行一 · 拆账并员通电',
  kind = 'build',
  headline = `${goal.title} · ${stageName}`,
  tickets = [],
  tasks = [],
  pauses = [],
  version = 2,
  omitHeadline = false,
} = {}) {
  const route = {
    schema: 1,
    goal,
    stages: [{ id: 'stage-build', name: stageName, order: 1, state: 'current', boss_gate: 'none', exit_criteria: [], kind }],
    current_stage_id: 'stage-build',
    tasks,
    current_task_id: tasks.some((t) => t.status === 'in_progress') ? tasks.find((t) => t.status === 'in_progress').id : null,
    tickets,
    pauses,
    transitions: [],
    version,
    created_at: '2026-11-01T22:58:11+08:00',
    updated_at: '2026-11-02T10:00:00+08:00',
  }
  if (omitHeadline) delete route.headline
  else route.headline = headline
  return route
}

/** 一张**迁移票**（C1 §4.2：**不存 `status`**，状态是投影；没有任务时用 `legacy_status`）。 */
export function legacyTicket(id, legacyStatus = 'open', over = {}) {
  return {
    id,
    title: `${id} 的题面（夹具）`,
    source: `technical-review:${'1'.repeat(64)}#${id}`,
    next_step: `${id} 的下一步`,
    acceptance: `${id} 的验收口径`,
    legacy_status: legacyStatus,
    legacy_ref: 'review-2026-10-30',
    migrated_at: '2026-11-01T22:58:11+08:00',
    finding_refs: [],
    created_at: '2026-10-30T19:00:00+08:00',
    last_update: '2026-11-01T22:58:11+08:00',
    closure_evidence: null,
    void_reason: null,
    re_present: null,
    re_present_history: [],
    closed_at: null,
    ...over,
  }
}

/** 一张**新票**（`ticket-YYYYMMDD-NN`；可以存 `status`，但投影仍按 C1 §7.5 那张表）。 */
export function freshTicket(id, over = {}) {
  return {
    schema: 1,
    id,
    title: `${id} 的题面（夹具）`,
    source: `technical-review:${'2'.repeat(64)}#F1`,
    next_step: `${id} 的下一步`,
    acceptance: `${id} 的验收口径`,
    status: 'open',
    supersedes: null,
    created_at: '2026-11-02T10:58:09+08:00',
    last_update: '2026-11-02T10:58:09+08:00',
    closure_evidence: null,
    void_reason: null,
    re_present: null,
    re_present_history: [],
    closed_at: null,
    finding_refs: [],
    ...over,
  }
}

/** 一条**路线任务**（卡只读 `status` / `ticket_id` / `kind`；别的键是给别的用例的）。 */
export function routeTask(id, status = 'in_progress', over = {}) {
  return {
    id,
    title: `${id} 的题面（夹具）`,
    status,
    kind: 'ticket-repair',
    stage: 'stage-build',
    ticket_id: null,
    created_at: '2026-11-02T09:00:00+08:00',
    last_update: '2026-11-02T09:30:00+08:00',
    ...over,
  }
}

export function writeRoute(ws, route) {
  return writeJsonAt(path.join(ws, '.team', 'route', 'current.json'), route)
}

// ── 夹具：bug 台账（照 CONTRACT-B §2.2 的**冻结形状**手写）──────────────────────
export function bugEntry(id, over = {}) {
  const registeredAt = over.registered_at ?? '2026-11-01T09:00:00+08:00'
  return {
    id,
    kind: 'bug',
    phenomenon: `${id} 的现象（夹具）`,
    how_seen: null,
    evidence: [{ kind: 'file', ref: `.team/bug/${id}.md` }],
    recipe: null,
    reporter: '老板',
    author: 'leader',
    source: { carrier: 'boss', ref: null },
    tags: [],
    /** SLA 的起算点（契约 §3.7.1：从 `opened_at` 起，超一个开工周期仍未 `assessed` ⇒ 红）。 */
    opened_at: over.opened_at ?? registeredAt,
    registered_at: registeredAt,
    finding_refs: [],
    assessment: null,
    disposition: null,
    escalated_at: null,
    card_red: false,
    ...over,
  }
}

/** 一份 bug 台账（`severity_samples` 与 `archived` 都给默认值，免得每格都写一遍）。 */
export function bugLedger({ entries = [], tasks = [], batches = [], samples = SAMPLE_SET, samplesVersion = 1, archived = [] } = {}) {
  return {
    schema: 1,
    entries,
    tasks,
    batches,
    severity_samples: {
      version: samplesVersion,
      registered_at: samplesVersion === 0 ? null : '2026-10-31T09:00:00+08:00',
      registered_by: samplesVersion === 0 ? null : 'leader',
      samples: samples.map((s) => ({ line: s.line, polarity: s.polarity, text: `${s.line} 的 ${s.polarity} 例（夹具）` })),
      history: [],
    },
    archived,
    version: 1,
    created_at: '2026-10-31T09:00:00+08:00',
    updated_at: '2026-11-02T09:00:00+08:00',
  }
}

export function writeBug(ws, ledger) {
  return writeJsonAt(path.join(ws, '.team', 'bug', 'ledger.json'), ledger)
}

/**
 * 本地节点（`F-156` / `F-162` 的形状；`local-read` 是它的读面）。
 * 回执那两段（契约 §3.7）就读这里：`technical` 是第一段、`conversation` 是第二段。
 *
 * 🔴 **两段的 `report_path` 默认值不同**（`gate4-C2` F-09）：第一段是 `技术评审.md`、
 *    第二段是 `会话评审.md`。以前两段共用一个默认值（`技术评审.md`），于是证据里
 *    `receipt.conversation.report_path` 印的是技术评审的路径 —— 夹具喂错，判据又只判 `state`，
 *    所以"第二段读的是会话评审那份"这件事**从来没有被证明过**。
 */
export function localState({
  day, technical = 'unclaimed', conversation = 'unclaimed',
  reportPath = null, technicalPath = null, conversationPath = null,
} = {}) {
  const node = (state, ownPath) => ({
    state,
    job_id: state === 'unclaimed' ? null : `job-${day}`,
    attempt: state === 'unclaimed' ? null : 1,
    started_at: state === 'unclaimed' ? null : `${day}T01:00:00+08:00`,
    finished_at: state === 'done' ? `${day}T02:00:00+08:00` : null,
    liveness_at: state === 'unclaimed' ? null : `${day}T02:00:00+08:00`,
    report_path: state === 'done' ? (ownPath ?? reportPath ?? `.team/retro/${day}/技术评审.md`) : null,
    report_sha256: state === 'done' ? 'b'.repeat(64) : null,
    findings_path: null,
    findings_set_sha256: null,
    findings_count: null,
    artifact_paths: [],
    failure_reason: state === 'failed' ? '（夹具）' : null,
  })
  return {
    schema: 1,
    day,
    nodes: {
      memory_review: node('unclaimed'),
      conversation: node(conversation, conversationPath ?? `.team/retro/${day}/会话评审.md`),
      technical: node(technical, technicalPath ?? `.team/retro/${day}/技术评审.md`),
    },
    updated_at: `${day}T02:00:00+08:00`,
  }
}

export function writeLocal(ws, day, state) {
  return writeJsonAt(path.join(ws, '.team', 'state', 'local', `${day}.json`), state)
}

/** `follow-ups.md` —— 生成器**今天**数票的来源。夹具里故意写满 9 张（契约 §3.2 的红因）。 */
export function writeFollowUps(ws, { count = 9 } = {}) {
  const lines = ['# 待办（夹具：**故意比票段多**）', '']
  for (let i = 1; i <= count; i += 1) {
    lines.push(`## F-9${String(i).padStart(2, '0')} · 夹具票 ${i}`, `- ⬜ 票（夹具）`, '')
  }
  return writeJsonAtText(path.join(ws, '.team', 'leader', 'follow-ups.md'), `${lines.join('\n')}\n`)
}

// ── 夹具：状态条那五格的 producer（契约 §4.2 · 组长 2026-11-02 裁定第 1 条）──────────
/**
 * `unknown_preset` / `preset_downgrade` 的读面：`.team/state/identity/<day>.json`。
 * 形状（裁定原文）：`{unknown_preset:[…], preset_downgrade:[…]}`；同一格只一份。
 */
export function writeIdentity(ws, day, { unknownPreset = [], presetDowngrade = [] } = {}) {
  return writeJsonAt(path.join(ws, '.team', 'state', 'identity', `${day}.json`), {
    day,
    unknown_preset: unknownPreset,
    preset_downgrade: presetDowngrade,
  })
}

/**
 * 同一份文件的**坏文件**现场（`gate4-C2` 复审 R-02）：文件在盘上、但**不是合法 JSON**。
 * `read_identity()` 对这一形态的判读是 `broken`（两格红；"读不出来"不是"0 条报警"）。
 * `writeIdentity()` 只写得出合法对象 ⇒ 坏 JSON 这一格必须另有一口，否则它永远造不出来。
 */
export function writeIdentityRaw(ws, day, text) {
  return writeJsonAtText(path.join(ws, '.team', 'state', 'identity', `${day}.json`), text)
}

/**
 * `carrier_missing` 的读面（契约 §4.2 #5）：**评审报告文件在不在** ——
 * `<WS>/.team/retro/<day>/技术评审.md` 与 `会话评审.md`。
 */
export function writeReviewReports(ws, day, { technical = true, conversation = true } = {}) {
  const dir = path.join(ws, '.team', 'retro', day)
  const out = []
  if (technical) out.push(writeJsonAtText(path.join(dir, '技术评审.md'), `# 技术评审（夹具）· ${day}\n`))
  if (conversation) out.push(writeJsonAtText(path.join(dir, '会话评审.md'), `# 会话评审（夹具）· ${day}\n`))
  return out
}

/**
 * `legacy_sessions` 的读面（契约 §4.2 #9）：C1 的 legacy 票店 `<WS>/.team/tickets/legacy.json`。
 * `remaining > 0` ⇒ 迁移没做完 ⇒ 那一格红（C1a 之后应当是 0）。
 */
export function writeLegacyStore(ws, { remaining = 0 } = {}) {
  const tickets = []
  for (let i = 0; i < remaining; i += 1) tickets.push(legacyTicket(`F-9${String(i + 1).padStart(2, '0')}`))
  return writeJsonAt(path.join(ws, '.team', 'tickets', 'legacy.json'), {
    schema: 1,
    tickets,
    migrated_at: remaining === 0 ? '2026-11-01T22:58:11+08:00' : null,
  })
}

// ── 驱动生成器（契约 §1 的那一行命令）──────────────────────────────────────────
/**
 * 跑一次 `daily-cards.py`。**真子进程**、注入时钟、`TEMP`/`TMP` 落运行根（`childEnv()` 已做）。
 * 返回 `{exit_code, stdout, stderr, card, marker, cmdline, ms}`。
 */
export function runCards(roots, { day, nowIso, extraArgs = [], timeoutMs = 180000, script = null, cwd = null } = {}) {
  const py = pythonBin()
  if (!py.ok) return { exit_code: null, stdout: '', stderr: py.note, card: cardFile(roots.ws, day), marker: failureFile(roots.ws, day), cmdline: null, ms: 0, python: py }
  const scriptPath = script ?? path.join(PATHS.repo, '.tools', 'daily-cards.py')
  const args = [scriptPath, '--day', day, '--workspace', roots.ws, '--data-root', roots.dr, ...extraArgs]
  const started = Date.now()
  const res = spawnSync(py.bin, args, {
    cwd: cwd ?? PATHS.repo,
    env: setClock(roots, nowIso),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  return {
    exit_code: res.status,
    signal: res.signal ?? null,
    timed_out: res.error?.code === 'ETIMEDOUT',
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    card: cardFile(roots.ws, day),
    marker: failureFile(roots.ws, day),
    cmdline: `"${py.bin}" ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`,
    ms: Date.now() - started,
    python: py,
  }
}

// ── 读卡（openpyxl，**唯一一口**）────────────────────────────────────────────
/**
 * 把 `<xlsx>` 的单元格打成 JSON。返回 `{ok, dump, error}`；
 * `dump.sheets[] = {name, rows[]}`、`dump.sheet_names[]`。
 */
export function dumpXlsx(file) {
  const py = pythonBin()
  if (!py.ok) return { ok: false, dump: null, error: py.note }
  if (!existsSync(file)) return { ok: false, dump: null, error: 'E_NO_FILE' }
  const helper = path.join(PATHS.testRoot, 'support', 'card-xlsx.py')
  if (!existsSync(helper)) return { ok: false, dump: null, error: `E_NO_HELPER: ${helper}` }
  const res = spawnSync(py.bin, [helper, '--xlsx', file], {
    cwd: PATHS.repo,
    env: childEnv(),
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  const line = String(res.stdout ?? '').trim().split(/\r?\n/).filter((l) => l !== '').pop() ?? ''
  let dump = null
  try {
    dump = JSON.parse(line)
  } catch {
    return { ok: false, dump: null, error: `E_DUMP_JSON: ${line.slice(0, 240)} · stderr=${String(res.stderr ?? '').slice(0, 240)}` }
  }
  return { ok: dump.ok === true, dump, error: dump.ok === true ? null : String(dump.error ?? 'E_DUMP') }
}

/** 卡上那一页在不在（不在 ⇒ 指名；拿来做"功能没做"的那条红因）。 */
export function sheetOf(dump, name = CARD_SHEET) {
  if (dump === null || !Array.isArray(dump.sheets)) return null
  return dump.sheets.find((s) => s.name === name) ?? null
}

/** `C2 · 验收格` 那一页 → `{key: 值}`（值按 JSON 解；解不动就原样字符串）。 */
export function cellsOf(sheet) {
  const out = {}
  if (sheet === null || !Array.isArray(sheet.rows)) return out
  for (const row of sheet.rows.slice(1)) {
    const key = row[0]
    if (typeof key !== 'string' || key.trim() === '') continue
    out[key.trim()] = tryParse(row[1])
  }
  return out
}

export function tryParse(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (text === '') return ''
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

/** 一次读完：`{sheet, cells, keys, missingKeys, extraKeys}`（缺省读卡 1；`sheet`/`keys` 可换）。 */
export function readCard(file, { sheet: sheetName = CARD_SHEET, keys: wantedKeys = CARD_KEYS } = {}) {
  const { ok, dump, error } = dumpXlsx(file)
  const sheet = ok ? sheetOf(dump, sheetName) : null
  const cells = cellsOf(sheet)
  const keys = Object.keys(cells)
  return {
    ok,
    error,
    dump,
    file,
    sheet,
    sheet_name: sheetName,
    cells,
    keys,
    missingKeys: wantedKeys.filter((k) => !keys.includes(k)),
    extraKeys: keys.filter((k) => !wantedKeys.includes(k)),
  }
}

/** 卡 2（技术评审回执）的那一页：`C2 · 回执格` + `CARD2_KEYS`。 */
export function readCard2(file) {
  return readCard(file, { sheet: CARD2_SHEET, keys: CARD2_KEYS })
}

// ── 正文 ↔ 机器格同值（契约 §2.2 的 `C2-RENDER-DISAGREE`；`gate4-C2` F-08）──────────
/**
 * 正文那一页（**第一张 sheet**）的行：`{sheet, rows, byLabel}`（`byLabel` 是 `格 → 值`，先到先得）。
 * 老板读的是这一页；机器读面在 `C2 · 验收格`。两页说的是同一条事实（契约 §2.2）。
 */
export function bodyRows(card) {
  const sheet = Array.isArray(card?.dump?.sheets) ? card.dump.sheets[0] ?? null : null
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : []
  const byLabel = new Map()
  for (const row of rows) {
    const label = typeof row?.[0] === 'string' ? row[0].trim() : ''
    if (label === '' || byLabel.has(label)) continue
    byLabel.set(label, row[1])
  }
  return { sheet: sheet?.name ?? null, rows, byLabel }
}

/**
 * 正文那几行的**语义针**（只认意思，不钉整句 —— 措辞归实现，契约 §6 第 6 条）。
 * 每项：先按 `label` 逐字找，找不到再用 `needles` 的顺序匹配。
 */
export const BODY_ROWS = Object.freeze({
  route: Object.freeze({ label: '目标 · 大阶段', needles: [/目标.*大阶段/] }),
  tickets: Object.freeze({ label: '票（路线票段投影 · 唯一真源）', needles: [/^票（/, /^票/] }),
  capacity: Object.freeze({ label: '容量（卡下方另列）', needles: [/容量.*另列/, /^容量/] }),
})

/** 按语义针找正文那一行；找不到 ⇒ `null`（"正文没印"也是红）。 */
export function findBodyRow(body, spec) {
  if (body.byLabel.has(spec.label)) return { label: spec.label, value: body.byLabel.get(spec.label) }
  for (const re of spec.needles) {
    for (const [label, value] of body.byLabel) {
      if (re.test(label)) return { label, value }
    }
  }
  return null
}

/** 一个 `<名> <数>` 是否**以那个形状**出现在正文那一行里（`0` 不许被印成 `—` / 空）。 */
function hasNumberToken(text, name, value) {
  const esc = `${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
  return new RegExp(`(^|[^A-Za-z0-9_])${esc}(?![0-9])`).test(String(text))
}

/**
 * 正文 ↔ 机器格的三对（契约 §2.2）。每对产 `{pair, body, machine, ok}`：
 *   · `route`    —— `route.first_line` ↔ 第一页那条「路线」行（**逐字**相等）；
 *   · `tickets`  —— 四数 + `legacy` + `total` ↔ 票区（**每个数以 `<名> <数>` 的形状出现**）；
 *   · `capacity` —— `count` / `chars` ↔ 容量行（`<数> 条` / `<数> 字符`；判不了时是 `? 条`）。
 *
 * 为什么不全比"整行相等"：正文的措辞归实现，钉整行等于把版式变成判据。
 * 为什么**每个数都要在**：机器格对、正文少印一个数 ⇒ 老板看到的那一格是错的（"没印"与"印错"同罪）。
 *
 * `only` 用来**把三对分到三格去判**（`CARD-01` 判 route / `CARD-02` 判 tickets / `CARD-06` 判 capacity）——
 * 一条判据只落在一个用例里，红了才说得清是哪一块（跨用例红会把真红淹掉）。缺省 = 三对都判。
 */
export function renderChecks(card, { only = null } = {}) {
  const want = (name) => only === null || only.includes(name)
  const body = bodyRows(card)
  const cells = card?.cells ?? {}
  const out = { sheet: body.sheet, pairs: [], rows: {} }

  // ① 路线：第一行
  if (want('route')) {
    const routeRow = findBodyRow(body, BODY_ROWS.route)
    out.rows.route = routeRow
    out.pairs.push({
      pair: 'route.first_line ↔ 正文「目标 · 大阶段」',
      body: routeRow === null ? null : routeRow.value,
      machine: cells['route.first_line'],
      ok: routeRow !== null && routeRow.value === cells['route.first_line'],
    })
  }

  // ② 票区：四数 + legacy + total
  if (want('tickets')) {
    const ticketRow = findBodyRow(body, BODY_ROWS.tickets)
    out.rows.tickets = ticketRow
    const ticketText = ticketRow === null ? '' : String(ticketRow.value ?? '')
    const ticketFields = [
      ['open', 'tickets.open'],
      ['in_progress', 'tickets.in_progress'],
      ['done', 'tickets.done'],
      ['void', 'tickets.void'],
      ['迁移票', 'tickets.legacy'],
      ['合计', 'tickets.total'],
    ]
    for (const [name, key] of ticketFields) {
      const machine = cells[key]
      out.pairs.push({
        pair: `${key} ↔ 正文票区（\`${name} ${machine}\`）`,
        body: ticketRow === null ? null : ticketText.slice(0, 200),
        machine,
        ok: ticketRow !== null && typeof machine === 'number' && hasNumberToken(ticketText, name, machine),
      })
    }
  }

  // ③ 容量行：count / chars（读不到快照时正文必须是 `?`，不是 0）
  if (want('capacity')) {
    const capRow = findBodyRow(body, BODY_ROWS.capacity)
    out.rows.capacity = capRow
    const capText = capRow === null ? '' : String(capRow.value ?? '')
    const capCount = cells['capacity.count']
    const capChars = cells['capacity.chars']
    out.pairs.push({
      pair: 'capacity.count ↔ 正文容量行（`<数> 条`）',
      body: capRow === null ? null : capText.slice(0, 200),
      machine: capCount,
      ok: capRow !== null && (typeof capCount === 'number'
        ? new RegExp(`(^|[^0-9,])${capCount}\\s*条`).test(capText)
        : /^\s*\?/.test(capText) || /(^|[^0-9,?])\?\s*条/.test(capText)),
    })
    out.pairs.push({
      pair: 'capacity.chars ↔ 正文容量行（`<数> 字符`）',
      body: capRow === null ? null : capText.slice(0, 200),
      machine: capChars,
      ok: capRow !== null && (typeof capChars === 'number'
        ? new RegExp(`(^|[^0-9,])${capChars}\\s*字符`).test(capText)
        : /(^|[^0-9,?])\?\s*字符/.test(capText)),
    })
  }
  return out
}

/**
 * 把 `renderChecks()` 的结果判掉（每条不等的 ⇒ `C2-RENDER-DISAGREE`）。
 * 返回问题条数（调用方拿它做"该绿时绿"的阳性对照）。
 */
export function judgeRenderAgree(checks, push, label) {
  let bad = 0
  for (const pair of checks.pairs ?? []) {
    if (pair.ok === true) continue
    bad += 1
    push('C2-RENDER-DISAGREE',
      `${label}：正文与 \`${CARD_SHEET}\` 那一格说的不是同一件事 —— ${pair.pair}：`
      + `正文实得 ${JSON.stringify(pair.body)}，机器格是 ${JSON.stringify(pair.machine)}。`
      + '契约 §2.2：老板读的是正文，机器格对、正文印成别的数 ⇒ 卡就是错的')
  }
  return bad
}

/**
 * 生成一张**只改正文一格**的卡副本（F-08 的负样本；**生产零写入**）。
 * 走 `support/card-xlsx.py --copy-to <新文件> --set "<行标签>=<坏值>"`：
 * 复制**生成出来的那张卡**、只改第一张 sheet 里那一行的值，机器读那一页一个字不动 ——
 * 这正是"正文与机器格各说各的"的真形态（比在 JS 里手造一对假值硬得多）。
 */
export function copyCardWithBodyPatch(file, patches = [], { out = null, timeoutMs = 120000 } = {}) {
  const py = pythonBin()
  if (!py.ok) return { ok: false, file: null, error: py.note, cmdline: null }
  if (!existsSync(file)) return { ok: false, file: null, error: 'E_NO_FILE', cmdline: null }
  const target = out ?? path.join(path.dirname(file), `patched-${path.basename(file)}`)
  const helper = path.join(PATHS.testRoot, 'support', 'card-xlsx.py')
  const args = [helper, '--xlsx', file, '--copy-to', target]
  for (const p of patches) args.push('--set', `${p.label}=${p.value}`)
  const res = spawnSync(py.bin, args, {
    cwd: PATHS.repo,
    env: childEnv(),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  const line = String(res.stdout ?? '').trim().split(/\r?\n/).filter((l) => l !== '').pop() ?? ''
  let dump = null
  try {
    dump = JSON.parse(line)
  } catch {
    return { ok: false, file: target, error: `E_DUMP_JSON: ${line.slice(0, 240)} · stderr=${String(res.stderr ?? '').slice(0, 240)}`, cmdline: null }
  }
  return {
    ok: dump?.ok === true,
    file: target,
    error: dump?.ok === true ? null : String(dump?.error ?? 'E_PATCH'),
    patched: dump?.patched ?? null,
    cmdline: `"${py.bin}" ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`,
  }
}

// ── 生成器里那两份**第二实现**（F-02 槽谓词 / F-11 切点）────────────────────────
/**
 * 把一份输入喂给**生成器自己的 Python 纯函数**（`support/card-mirror.py` 是那只手）。
 *
 * · `op: 'slot'` —— `tasks[]` 喂 `daily-cards.py::slot_state_of()`（返回 `{state, allow, holders, …}`）；
 * · `op: 'default-day'` —— 调 `daily-cards.py::default_day()`（它自己读 `AGENIA_NOW_FILE`）。
 *
 * `nowIso` / `env` 二选一：给了 `nowIso` 就显式传时刻（与 JS 那一侧同一串 ISO）；
 * 不给就让它走**生成器自己的时钟**（`env` 里那个 `AGENIA_NOW_FILE`）。两者都指向同一个现场。
 */
export function pythonMirror(op, { tasks = null, nowIso = null, env = null, dir = null } = {}) {
  const py = pythonBin()
  if (!py.ok) return { ok: false, value: null, error: py.note, cmdline: null }
  const helper = path.join(PATHS.testRoot, 'support', 'card-mirror.py')
  if (!existsSync(helper)) return { ok: false, value: null, error: `E_NO_HELPER: ${helper}`, cmdline: null }
  const args = [helper, '--op', op, '--cards', path.join(PATHS.repo, '.tools', 'daily-cards.py')]
  if (tasks !== null) {
    const base = dir ?? canonical(process.env[ENV.RUN_ROOT] ?? PATHS.testRoot)
    const file = path.join(base, 'fixtures', `card-mirror-tasks-${op}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(tasks, null, 2)}\n`, 'utf8')
    args.push('--tasks', file)
  }
  if (nowIso !== null) args.push('--now', nowIso)
  // 🔴 `PYTHONDONTWRITEBYTECODE=1`：`card-mirror.py` 要 import 被测的 `.tools/daily-cards.py`，
  //    Python 默认会在**生产目录**旁边写 `__pycache__/` —— 那是测试往 `.tools/**` 落产物。
  const baseEnv = env ?? childEnv()
  const res = spawnSync(py.bin, args, {
    cwd: PATHS.repo,
    env: { ...baseEnv, PYTHONDONTWRITEBYTECODE: '1' },
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  const line = String(res.stdout ?? '').trim().split(/\r?\n/).filter((l) => l !== '').pop() ?? ''
  let dump = null
  try {
    dump = JSON.parse(line)
  } catch {
    return { ok: false, value: null, error: `E_DUMP_JSON: ${line.slice(0, 240)} · stderr=${String(res.stderr ?? '').slice(0, 240)}`, cmdline: null }
  }
  return {
    ok: dump?.ok === true,
    value: dump?.value ?? null,
    now: dump?.now ?? null,
    error: dump?.ok === true ? null : String(dump?.error ?? 'E_MIRROR'),
    cmdline: `"${py.bin}" ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`,
  }
}

// ── 跨读者（契约 §3.3 的"同一个查询"）────────────────────────────────────────
/** `--op read`（路线账本读面；票投影从它出）。夹具手写账本 ⇒ 它会因链坏而拒，调用方记 HOLD。 */
export function readRouteOp(ws, tag = 'read') {
  const inFile = path.join(path.dirname(ws), `card-in-${tag}.json`)
  writeFileSync(inFile, '{}\n', 'utf8')
  try {
    return runCli('agenia-route.mjs', { op: 'read', workspace: ws, inFile })
  } catch (err) {
    return { exit_code: null, json: null, stdout: '', stderr: String(err?.message ?? err), spawn_error: 'SUT-SURFACE-MISSING', problems: [] }
  }
}

/**
 * `--op bug-read`（bug 台账读面；`counts` / `cap` / `card_red` / `sla`）。
 *
 * 🔴 **必须能拿到该现场的注入时钟**（`gate4-C2` F-04）：不传 `env` 时它按**真实此刻**算年龄，
 *    于是同一份台账在卡上（注入时钟）与 `bug-read` 上（真实时钟）会给出两个年龄，
 *    而判据若只比计数就看不见 —— 那就是"跨读者不是同一个查询"。
 *    `env` 用 `setClock(roots, nowIso)` 的返回值（`AGENIA_NOW_FILE` 就在里面）。
 * 🔴 **跑现役那一份 CLI**（`cliPath` 缺省 = `presets/agenia/bin/agenia-route.mjs`；`sut.mjs::livePath`）：
 *    卡的 producer 树是 `<WS>/presets/agenia`，跨读者必须指同一棵树（见 `livePath` 的注释）。
 */
export function readBugOp(ws, tag = 'bug', { env = null, cliPath = null } = {}) {
  const inFile = path.join(path.dirname(ws), `card-in-${tag}.json`)
  writeFileSync(inFile, '{}\n', 'utf8')
  try {
    return runCli('agenia-route.mjs', { op: 'bug-read', workspace: ws, inFile }, {
      ...(env === null ? {} : { env }),
      cliPath: cliPath ?? livePath(path.join('bin', 'agenia-route.mjs')),
    })
  } catch (err) {
    return { exit_code: null, json: null, stdout: '', stderr: String(err?.message ?? err), spawn_error: 'SUT-SURFACE-MISSING', problems: [] }
  }
}

/**
 * 这一次调用**是不是"这个 op 根本还没有"**（不是"它拒了这条输入"）。
 * 与 `route-surface.mjs::opMissing` 同形，但独立一份：C2 的 HOLD 语义不能借 C1 的红因码。
 */
export function opUnavailable(res) {
  if (res === null || res === undefined) return true
  if (res.spawn_error) return true
  const code = res?.json?.error?.code ?? null
  if (code === 'E_USAGE') return true
  return String(res?.stderr ?? '').includes('SUT-SURFACE-MISSING')
}

/** 路线票段的投影（**契约口径的第二份实现**，只给测试算期望值，不许当被测面）。 */
export function projectTickets(route) {
  const tickets = Array.isArray(route?.tickets) ? route.tickets : []
  const tasks = Array.isArray(route?.tasks) ? route.tasks : []
  const statusOf = (t) => {
    if (typeof t?.void_reason === 'string' && t.void_reason.trim() !== '') return 'void'
    if (t?.status === 'void') return 'void'
    const mine = tasks.filter((x) => x?.ticket_id === t?.id)
    if (mine.some((x) => x?.status === 'in_progress' || x?.status === 'paused')) return 'in_progress'
    if (mine.length > 0 && mine.every((x) => x?.status === 'done')) return 'done'
    if (mine.length > 0) return 'open'
    if (['open', 'in_progress', 'done'].includes(t?.legacy_status)) return t.legacy_status
    return 'open'
  }
  const out = { open: 0, in_progress: 0, done: 0, void: 0 }
  for (const t of tickets) out[statusOf(t)] += 1
  /** 迁移票张数（`legacy_status` 非空）—— **子集计数**：不进四数、不加进 `total`（裁定第 4 条）。 */
  const legacy = tickets.filter((t) => typeof t?.legacy_status === 'string' && t.legacy_status.trim() !== '').length
  return { ...out, legacy, total: tickets.length, statuses: tickets.map((t) => ({ id: t.id, status: statusOf(t) })) }
}

/** 一个目录下的名字（按名字排序；不在 ⇒ `[]`）。 */
export function listNames(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).sort()
}

/** `记忆更新报告-FAILED.jsonl` 的每一行（坏行原样留住 —— 那是"标记坏了"的读数）。 */
export function readFailures(ws, day) {
  const file = failureFile(ws, day)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return { unparsable: l.slice(0, 160) }
      }
    })
}

/** 文件在不在 + 字节 + mtime（"卡真的落盘了吗"那一族读数）。 */
export function statOf(file) {
  try {
    const st = statSync(file)
    return { exists: true, bytes: st.size, mtime: new Date(st.mtimeMs).toISOString() }
  } catch {
    return { exists: false, bytes: null, mtime: null }
  }
}

// ── 一个"现场"= 一副根 + 一份账 + 一张卡（六格共用）────────────────────────────
/** 本批的"今天"（注入时钟与 `--day` 都用它；**不用真实日期**）。 */
export const DAY = '2026-11-02'
export const NOW = `${DAY}T10:00:00+08:00`
/** 后一天（判回执"过期"那一格的现场：回执停在昨天、卡是今天）。 */
export const DAY_PREV = '2026-11-01'
export const NOW_PREV = `${DAY_PREV}T10:00:00+08:00`

/**
 * 造一个现场并生成两张卡：
 *   ① 工作区（带 marker）+ 数据根 + 注入时钟；
 *   ② 夹具：`memory.mjs`（参考线）/ 数据根三个文件 / 路线账本 / bug 台账 / 本地节点 / `follow-ups.md`
 *      + 状态条那五格的 producer（`identity` / `reviews` / `legacy`，给了才写）；
 *   ③ 真子进程跑 `daily-cards.py`；
 *   ④ 用 openpyxl 把**两张卡**都读回来（`card` = 卡 1，`card2` = 卡 2）。
 *
 * `route === undefined` ⇒ **不写**路线账本（"未建账"那个现场）；`null` 也一样（显式"没有"）。
 * `identity` / `reviews` / `legacy` 同样是"给了才写" —— 不写就是**没接线**的那个现场（负样本要用）。
 */
export function scene(caseId, tag, {
  route = undefined,
  bug = undefined,
  local = undefined,
  day = DAY,
  nowIso = NOW,
  memorySource = true,
  followUps = 0,
  snapshot = 'v-c2',
  totals = { count: 73, chars: 4321 },
  identity = undefined,
  reviews = undefined,
  legacy = undefined,
} = {}) {
  const roots = makeCardRoots(caseId, tag)
  if (memorySource) writeMemorySource(roots.ws)
  writeDataRoot(roots.dr, { day, snapshot, totals })
  if (route !== undefined && route !== null) writeRoute(roots.ws, route)
  if (bug !== undefined && bug !== null) writeBug(roots.ws, bug)
  if (local !== undefined && local !== null) writeLocal(roots.ws, day, local)
  if (followUps > 0) writeFollowUps(roots.ws, { count: followUps })
  if (identity !== undefined && identity !== null) writeIdentity(roots.ws, day, identity)
  if (reviews !== undefined && reviews !== null) writeReviewReports(roots.ws, day, reviews)
  if (legacy !== undefined && legacy !== null) writeLegacyStore(roots.ws, legacy)
  const run = runCards(roots, { day, nowIso })
  const card = readCard(cardFile(roots.ws, day))
  const card2 = readCard2(card2File(roots.ws, day))
  return { roots, run, card, card2, day, nowIso }
}

/**
 * "这一页不在"那一条红因（**功能没做时唯一该出的那条**）。
 * 返回 `true` ⇒ 调用方**立刻收尾**（否则后面几十格会一起红，把真正的红因淹掉）。
 */
export function sheetMissing(card, push, caseId) {
  if (card.sheet !== null) return false
  const seen = JSON.stringify(card.dump?.sheet_names ?? null)
  const why = card.error === null ? '' : ` · 读卡失败：${card.error}`
  push(
    'C2-SHEET-MISSING',
    `${caseId}：卡上没有 \`${card.sheet_name ?? CARD_SHEET}\` 那一页（页名实得 ${seen}${why}）—— `
    + '契约 §2.1 要的是「三区照旧给人看 + 同一批值另有一页机器读的单元格」。'
    + '**这是"功能没做"，不是"这条输入被拒"**',
    { sheet_names: card.dump?.sheet_names ?? null, error: card.error },
  )
  return true
}

/**
 * 卡 2（技术评审回执）上 `C2 · 回执格` 那一页不在 —— 与 `C2-SHEET-MISSING` 同类，但**点名第二张卡**。
 * 契约 §2.1 / §2.4（组长 2026-11-02 裁定第 5 条）。
 */
export function card2SheetMissing(card2, push, caseId) {
  if (card2.sheet !== null) return false
  const seen = JSON.stringify(card2.dump?.sheet_names ?? null)
  const why = card2.error === null ? '' : ` · 读卡失败：${card2.error}`
  push(
    'C2-RECEIPT-SHEET-MISSING',
    `${caseId}：第二张卡（\`${CARD2_NAME}-<day>.xlsx\`）上没有 \`${CARD2_SHEET}\` 那一页`
    + `（页名实得 ${seen}${why}）—— 契约 §2.4：第二段回执（会话评审）落在**第二张卡**的机器读面上。`
    + '**这是"功能没做"，不是"这条输入被拒"**',
    { sheet_names: card2.dump?.sheet_names ?? null, error: card2.error, file: card2.file ?? null },
  )
  return true
}

/** 冻结的 key 缺了哪几个（缺 ⇒ 一条红因，点名；卡 1 与卡 2 各用各的码）。 */
export function keysMissing(card, push, caseId) {
  if (card.missingKeys.length === 0) return false
  const second = (card.sheet_name ?? CARD_SHEET) === CARD2_SHEET
  push(
    second ? 'C2-RECEIPT-SHEET-MISSING-KEY' : 'C2-SHEET-MISSING-KEY',
    `${caseId}：\`${card.sheet_name ?? CARD_SHEET}\` 少了 ${card.missingKeys.length} 个冻结的 key：${card.missingKeys.join(' · ')}`
    + `（多出来的 ${JSON.stringify(card.extraKeys)} 不红 —— 加性键允许）`,
    { missing: card.missingKeys, extra: card.extraKeys },
  )
  return true
}

/** `card.reasons` 里的码（`CARD_UNWIRED:<key>` 这类带冒号的**保留全串**）。 */
export function redCodes(cells) {
  const reasons = Array.isArray(cells['card.reasons']) ? cells['card.reasons'] : []
  return reasons.map((r) => (typeof r === 'string' ? r : String(r?.code ?? ''))).filter((c) => c !== '')
}

/**
 * 🔴 **`card.reasons` 的闭集判据**（`gate4-C2` F-05；契约 §5 末条）。
 *
 * 为什么单开一只判据：六格各自只查**自己关心的那几个码**（`hasRed(cells,'ROUTE_MISSING')`…），
 * 一个拼错的码（`SLA_OVER_CYCL`）或一个没人登记的新码会让所有六格照绿 ——
 * "新码要同批进那张表"这条规则就**没有执行点**。
 *
 * 前缀码（`RECEIPT_MISSING:` / `RECEIPT_EXPIRED:` / `CARD_UNWIRED:`）后面必须还有东西；
 * `CARD_UNWIRED:<key>` 的 `<key>` 必须是十二格表里的 key（逐字）。
 *
 * @returns {{codes: string[], unknown: number}} `unknown` = 报出来的问题条数
 */
export function assertReasonCodes(cells, push, label) {
  const codes = redCodes(cells)
  const prefixCodes = RED_CODES.filter((c) => c.endsWith(':'))
  const exact = new Set(RED_CODES.filter((c) => !c.endsWith(':')))
  let unknown = 0
  for (const raw of codes) {
    const code = String(raw).trim()
    if (exact.has(code)) continue
    const hit = prefixCodes.find((p) => code.startsWith(p) && code.length > p.length)
    if (hit !== undefined) {
      if (hit === 'CARD_UNWIRED:') {
        const key = code.slice(hit.length)
        if (!STATUS_CELLS.some((c) => c.key === key)) {
          push('C2-REASON-UNWIRED-KEY',
            `${label}：\`card.reasons\` 里的 \`${code}\` 点名了一个不在十二格表里的 key（契约 §5：\`CARD_UNWIRED:<key>\` 的 key 必须逐字是 §4.2 的 key）`)
          unknown += 1
        }
      }
      continue
    }
    push('C2-REASON-UNKNOWN',
      `${label}：\`card.reasons\` 里有一条码 ${JSON.stringify(code)} **不在契约 §5 的闭集里**（实得全部 ${JSON.stringify(codes)}）—— `
      + '新码要同批进那张表；否则"红了却说不清是哪一格"与没红等价（`cand-20261019-0042`）')
    unknown += 1
  }
  return { codes, unknown }
}

export function hasRed(cells, code) {
  return redCodes(cells).some((c) => c === code || c.startsWith(`${code}:`))
}

/** `card.reasons` 里某条码的 `detail`（点名票号 / entry id 时用）。 */
export function redDetails(cells, code) {
  const reasons = Array.isArray(cells['card.reasons']) ? cells['card.reasons'] : []
  return reasons
    .filter((r) => {
      const c = typeof r === 'string' ? r : String(r?.code ?? '')
      return c === code || c.startsWith(`${code}:`)
    })
    .map((r) => (typeof r === 'string' ? '' : String(r?.detail ?? '')))
}

export { NODE_BIN }


// ── 容量参考线的三级候选 + 生成器副本（CARD-06 的两条腿）────────────────────────────
/**
 * 容量参考线那份真源在某个根下的形状：`<root>/presets/agenia/lib/memory.mjs`。
 * `read_capacity()` 的三个候选就是这个形状分别在 **工作区 / 生成器自己那棵树 / cwd** 下拼出来的。
 */
export const memorySourceAt = (root) => path.join(root, 'presets', 'agenia', 'lib', 'memory.mjs')

/** `read_capacity()` 的第二级候选 = **生成器自己那棵树**（`<repo>/presets/agenia/lib/memory.mjs`）。 */
export const generatorTreeMemorySource = () => memorySourceAt(PATHS.repo)

/** 生产那一份生成器的绝对路径（副本要与它逐字节相同，才叫"同一把尺子"）。 */
export const generatorScriptPath = () => path.join(PATHS.repo, '.tools', 'daily-cards.py')

/**
 * 从一份 `memory.mjs` **解析** `CAP_COUNT` / `CAP_CHARS`。
 *
 * 读的是**输入**（生成器要解析的那份真源），不是生成器的输出 —— 期望值因此不是自证的。
 * 两个正则与 `daily-cards.py::read_capacity()` 同一个形状（`^const CAP_COUNT = <数>`）：
 * 夹具比被测面更宽松，就等于给"那段没被解析到"留了一条静默通过的缝。
 */
export function readCapConstants(file) {
  if (!existsSync(file)) return { ok: false, file, count: null, chars: null, error: `E_NO_FILE: ${file}` }
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    return { ok: false, file, count: null, chars: null, error: `E_READ: ${String(err?.message ?? err)}` }
  }
  const mCount = /^const CAP_COUNT\s*=\s*(\d+)/m.exec(text)
  const mChars = /^const CAP_CHARS\s*=\s*([\d_]+)/m.exec(text)
  if (mCount === null || mChars === null) {
    return {
      ok: false, file, count: null, chars: null,
      error: 'E_PARSE: 文件里没有 `const CAP_COUNT` / `const CAP_CHARS`（形状变了？）',
    }
  }
  return { ok: true, file, count: Number(mCount[1]), chars: Number(mChars[1].replace(/_/g, '')) }
}

/**
 * 把**生产那一份**生成器复制到 `<dir>/tools/daily-cards.py`（生产目录零字节）。
 *
 * 副本的"自己那棵树" = `<dir>`（`read_capacity()` 取 `dirname(dirname(__file__))`）——
 * 于是"让它站在没有预设的地方、跑的却是同一份脚本"这件事才量得出来。
 */
export function copyGeneratorInto(dir) {
  const from = generatorScriptPath()
  const to = path.join(dir, 'tools', 'daily-cards.py')
  mkdirSync(path.dirname(to), { recursive: true })
  copyFileSync(from, to)
  return to
}

/**
 * 把 `lib/route.mjs` 摆进合成工作区（`<ws>/presets/agenia/lib/route.mjs`）。
 *
 * 用途：**只让 `memory.mjs` 那一级落空**。`daily-cards.py::main()` 先 `route_constants()`（`:877`）
 * 再 `read_capacity()`（`:920`）；`route.mjs` 也找不到时失败停在 `E_ROUTE_SOURCE`，
 * 就量不到"三处都没有 memory.mjs"这一格了（`cand-20261020-0078`）。
 */
export function writeRouteSource(ws) {
  const from = path.join(PATHS.finalPreset, 'lib', 'route.mjs')
  const to = path.join(ws, 'presets', 'agenia', 'lib', 'route.mjs')
  mkdirSync(path.dirname(to), { recursive: true })
  copyFileSync(from, to)
  return to
}

// ── 批次 AE：回执卡的两格（`待你拍` / 「处置」列）—— 夹具、读页、副本上的刀 ─────────────
/**
 * 卡 1 的「待你拍」页（**逐字**；生成器 `wb.create_sheet("待你拍")`）。
 * 版式（今天）：r1 = 标题、r2 = 空行、r3 = 表头「事 / 为什么 / 代价」、r4 起 = 数据行。
 * 这一页**没有机器格**（`C2 · 验收格` 里没有它）—— 老板读的就是这一页（复审 §7 E5）。
 */
export const PENDING_SHEET = '待你拍'
/** 卡 2 的人读页：每条发现的「处置」「票号 / 落点」两列都在这一页（复审 §7 E6 / §3.3）。 */
export const DISPOSITION_SHEET = '每条的落点'
/** 技术评审 findings 的文件名 —— `tag` 靠它认出「第一场」（`daily-cards.py::1435`）。 */
export const FINDINGS_FILE = '技术评审.findings.json'
/** 「处置」列的四个词（契约侧的字面量只在这里出现一次：`adopted` / `rejected` / 两种未登记）。 */
export const DISPOSITION_WORDS = Object.freeze({
  adopted: '采纳',
  rejected: '不采纳',
  unregistered_landing: '🔴 未登记落点',
  unregistered_shape: '🔴 未登记口径',
})

/** 技术评审 findings 夹具（`<WS>/.team/technical-review/<day>/<file>`；`code_fingerprint` 给一份合法值）。 */
export function writeFindings(ws, day, findings, { file = FINDINGS_FILE } = {}) {
  return writeJsonAt(path.join(ws, '.team', 'technical-review', day, file), {
    code_fingerprint: { equal: true },
    findings,
  })
}

/** `findings-map.json` 夹具（生成器按 `out_dir` = `<WS>/.team/leader/<day>/` 读它）。 */
export function writeFindingsMap(ws, day, map, { raw = null } = {}) {
  const file = path.join(ws, '.team', 'leader', day, 'findings-map.json')
  if (raw !== null) return writeJsonAtText(file, raw)
  return writeJsonAt(file, { schema: 1, map })
}

/** `待你拍.json` 夹具（`rows === null` ⇒ **不写** = "没有人登记"那个现场）。 */
export function writePending(ws, day, rows) {
  if (rows === null) return null
  return writeJsonAt(path.join(ws, '.team', 'leader', day, '待你拍.json'), rows)
}

/**
 * 一整页的单元格值：`{ok, rows, error, dump}`。页名不在 ⇒ `rows: null` + `E_NO_SHEET`。
 * 读的是**产出**（`dumpXlsx` 走 `card-xlsx.py` = 生成器同一个 openpyxl），不是实现内部的返回值。
 */
export function sheetRows(file, name) {
  const { ok, dump, error } = dumpXlsx(file)
  if (!ok) return { ok: false, rows: null, error, sheet_names: dump?.sheet_names ?? null }
  const sheet = sheetOf(dump, name)
  return {
    ok: sheet !== null,
    rows: sheet?.rows ?? null,
    error: sheet === null ? `E_NO_SHEET: ${name}（页名实得 ${JSON.stringify(dump?.sheet_names ?? null)}）` : null,
    sheet_names: dump?.sheet_names ?? null,
  }
}

/**
 * 把**生产那一份**生成器复制到 `<dir>/tools/daily-cards.py`，再按 `patch` 逐条改这份**副本**。
 *
 * 🔴 每一条 `{from, to, why}` 都要求 `from` 在文本里**恰好出现一次**：零次 = 刀没打上（锚点漂了），
 *    多次 = 刀口不唯一（改到的不一定是想改的那处）。两种都当场抛，**不许**静默跑一个"半刀"。
 * 🔴 打完必须能看见 `marker`（刀自己的标记）—— 否则"跑的是刀后的行为"这句话不可核。
 * 🔴 只写 `<dir>/tools/daily-cards.py`（副本）；生产文件由调用方在跑前跑后各量一次 sha256。
 */
export function copyGeneratorWithPatch(dir, { patch = [], marker = null, why = '' } = {}) {
  const script = copyGeneratorInto(dir)
  const production = generatorScriptPath()
  const text0 = readFileSync(script, 'utf8')
  let text = text0
  const applied = []
  for (const item of patch) {
    const count = text.split(item.from).length - 1
    if (count !== 1) {
      throw new Error(`KNIFE-PATCH${why ? `(${why})` : ''}: 锚点出现 ${count} 次（要求恰好 1 次）—— 刀没打上：${JSON.stringify(String(item.from).slice(0, 120))}`)
    }
    text = text.split(item.from).join(item.to)
    applied.push({
      why: item.why ?? null,
      from_bytes: Buffer.byteLength(item.from, 'utf8'),
      to_bytes: Buffer.byteLength(item.to, 'utf8'),
    })
  }
  if (typeof marker === 'string' && marker !== '' && !text.includes(marker)) {
    throw new Error(`KNIFE-PATCH${why ? `(${why})` : ''}: 副本里找不到标记 ${JSON.stringify(marker)} —— 刀没打上`)
  }
  writeFileSync(script, text, 'utf8')
  return {
    script,
    production,
    applied,
    marker,
    bytes: Buffer.byteLength(text, 'utf8'),
    production_bytes: Buffer.byteLength(text0, 'utf8'),
    sha256: sha256Of(script),
    production_sha256: sha256Of(production),
    changed: text !== text0,
  }
}

// ── 版式（`sheetRows().rows` 的**行位**）────────────────────────────────────────
/**
 * `待你拍` 的版式（**0 基索引**，索引的是 `sheetRows().rows` 那个数组；屏幕上第几行 = +1）。
 * 今天：r1 标题 · r2 空行 · r3 表头 · r4 起数据。
 *
 * 🔴 为什么把"表头行 / 数据起始行 / 列名"都钉在这里：原来两格都是 `rows.slice(3)` **再滤空行**
 *    （复审 batch6 §4.3）⇒ 在数据前插一个空行、或在数据区里插一个空行，**照样绿**；
 *    而插一个非空行才红。两个方向都教人下次去放宽它。空行是缺陷，不是排版 —— 滤掉它等于把缺陷藏起来。
 */
export const PENDING_LAYOUT = Object.freeze({
  header_row: 2,
  data_row: 3,
  header: Object.freeze(['事', '为什么', '代价']),
})

/**
 * 卡 2 `每条的落点` 的版式（0 基）：r1 标题 · r2 作业书 · r3 空行 · r4 表头 · r5 起数据。
 *
 * ⚠️ 表头是 **6 列**：`票号 / 落点` 在**同一格**（`daily-cards.py` 的 `w.append(("#", "级别", …))`
 *    只 append 了 6 个值）。判据读前 5 格（A–E），第 6 格 `下一步` 不进这一族判据。
 */
export const DISPOSITION_LAYOUT = Object.freeze({
  header_row: 3,
  data_row: 4,
  header: Object.freeze(['#', '级别', '发现（一句话）', '处置', '票号 / 落点', '下一步']),
})

/** 一行是不是"全空"（`null` / 空串 / 纯空白都算空）。 */
const blankRow = (row) => (Array.isArray(row) ? row : []).every((c) => c === null || String(c).trim() === '')

/**
 * 按版式切数据区。**不滤空行** —— 空行是缺陷（`why:'hole'`，带 1 基行号），滤掉它就看不见了。
 *
 * 判三件：
 *   ① **表头**那一行逐字等于 `layout.header`（换列名 / 换列序 ⇒ `why:'header'`）；
 *   ② **数据起始行**：钉住的那一行必须存在且不是空行（在数据前插一个空行 ⇒ `why:'blank-start'`）；
 *   ③ **数据区无空洞**：数据区 = `data_row` 起 `expected_rows` 行；那几行里每个空行都记进 `holes`
 *      （1 基行号）。页码比期望短时**不报版式**（缺行由用例自己的"行数 / 行键"判据说，那更具体）。
 *
 * 🔴 `expected_rows` 而不是"到最后一个非空行"：卡 2 的 `每条的落点` 页在 findings 下面**还有第二段**
 *    （一行空行 + `会话评审回执（第二段）`）—— "到最后一行都不许有空行"会把**产品的正常版式**判红。
 *    待你拍那一页用"期望行数"同样成立（2 行 / 1 行 / 1 行）。
 *
 * 尾部整行空行不算洞：`support/card-xlsx.py` 已经把它们剪掉了，这里再兼容一次。
 * 返回 `{ok:true, data, row_count}` 或 `{ok:false, why, …}`；只有 `ok:true` 才给 `data`。
 */
export function layoutData(rows, layout = PENDING_LAYOUT, { expected_rows = null } = {}) {
  const list = Array.isArray(rows) ? rows : []
  const rawHeader = Array.isArray(list[layout.header_row]) ? list[layout.header_row] : []
  const got = rawHeader.slice(0, layout.header.length).map((c) => String(c ?? '').trim())
  if (got.length !== layout.header.length || got.join('\u0000') !== layout.header.join('\u0000')) {
    return { ok: false, why: 'header', row: layout.header_row + 1, expect: layout.header, got, data: [] }
  }
  if (list.length <= layout.data_row) {
    return { ok: false, why: 'no-data', row: layout.data_row + 1, total_rows: list.length, data: [] }
  }
  if (blankRow(list[layout.data_row])) {
    return { ok: false, why: 'blank-start', row: layout.data_row + 1, data: [] }
  }
  // 数据区的右端：给了期望行数就从那一行截（短了就截到页尾）；没给就截到最后一个非空行。
  let end
  if (expected_rows === null) {
    end = list.length - 1
    while (end >= layout.data_row && blankRow(list[end])) end -= 1
  } else {
    // 给了期望行数：窗口右端就是那一行（短了就截到页尾）—— **不在这里剪尾部的空行**：
    // 期望窗口里的空行正是"数据区里的洞"，剪掉它等于把缺陷藏起来。
    const wanted = layout.data_row + Math.max(expected_rows, 1) - 1
    end = Math.min(wanted, list.length - 1)
  }
  const holes = []
  for (let i = layout.data_row; i <= end; i += 1) if (blankRow(list[i])) holes.push(i + 1)
  if (holes.length > 0) return { ok: false, why: 'hole', rows: holes, data: [] }
  return { ok: true, data: list.slice(layout.data_row, end + 1), row_count: end - layout.data_row + 1 }
}

