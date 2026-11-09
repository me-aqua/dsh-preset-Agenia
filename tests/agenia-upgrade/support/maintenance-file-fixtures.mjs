/**
 * `maintenance_file` 的夹具 / **参照实现** / 刀架 / 六条检查（`MNF-01`…`MNF-06`）。
 *
 * 契约：`.team/test/2026-11-09/CONTRACT-maintenance-file.md`（第 2 关）。
 * 用例：`integration/mnf01-maintenance-file.test.mjs`。
 *
 * ── 这个文件里的东西分三层，别混着读 ────────────────────────────────────────
 *   ① **夹具**：合成数据根（快照 + 池子）、草稿样本、落点式子、读写小工具。
 *   ② **参照实现** `referenceTool()`：照契约写的**最小实现**（**不 import 产品**）。
 *      它存在只为一件事：证明这六条检查**可满足**（阳性对照），并且每把刀**咬得动**（翻面证明）。
 *      它不是产品副本，也不是"建议的实现"；产品那一份住在 `presets/agenia/tools/maintenance-file.mjs`。
 *   ③ **六条检查** `checkC1()`…`checkC6()`：每条返回 `{problems, readings}`，**期望值手写在本文件里**，
 *      不 import 被测文件的任何符号（`cand-20261106-0140`：刀锚在对方字节上时，谁改谁同批改刀）。
 *
 * ── 两条纪律 ────────────────────────────────────────────────────────────────
 *   · **落盘只在运行根里**（`AGENIA_TEST_RUN_ROOT/maintenance-file/**`）；`presets/**` 一个字节都不写。
 *   · **空样本不许绿**：每条检查都自带前后读数（池子行数 / 草稿文件数 / 冻结清单），
 *     且"没动"这一侧必须有"会动"的对照（`MNF-03` / `MNF-04` / `MNF-05` 的尺子格）。
 */
import { createHash } from 'node:crypto'
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENV, FROZEN, PATHS } from './env.mjs'
import { ensureMarkedDir } from './root-guard.mjs'
import { parseComposition } from './composition.mjs'
import { runCli, writeFixture } from './sut.mjs'
import { problem, runRoot } from './evidence.mjs'

// ── 冻结的名字（与契约 §1 逐字同值）────────────────────────────────────────
export const TOOL_NAME = 'maintenance_file'
export const TOOL_REL = path.join('presets', 'agenia', 'tools', 'maintenance-file.mjs')
export const CODES = Object.freeze({
  SHAPE: 'E_MAINTENANCE_SHAPE',
  TARGET: 'E_MAINTENANCE_TARGET',
  DUP: 'E_MAINTENANCE_DUPLICATE',
  IO: 'E_MAINTENANCE_IO',
})
/** 引擎真认的六个 op（`lib/snapshot.mjs::applyEntriesPatch` 的 switch 分支）。 */
export const OPS = Object.freeze(['add', 'modify', 'retire', 'cull', 'merge', 'retag'])
/** 池子行 / 文件里那几个键（契约 §4.2 / §4.3）。 */
export const FILE_KEYS = Object.freeze(['schema', 'draft_id', 'day', 'filed_at', 'content_sha256', 'base_snapshot', 'draft', 'pool'])
export const DRAFT_ID_RE = /^MR-\d{8}-\d{4}$/
/** 冻结的日与时刻（可复跑：生产逻辑里不出现裸 `Date` 的测试侧同形）。 */
export const DAY = '2026-11-09'
export const DAY2 = '2026-11-10'
export const AT = '2026-11-09T04:00:00.000Z'
export const AT2 = '2026-11-10T04:00:00.000Z'

// ── 小工具 ─────────────────────────────────────────────────────────────────
export const sha256Hex = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex')
/** 与 `lib/state.mjs::stableStringify` **同口径**（键按字典序、无空白）—— 第二份实现是刻意的：
 *  两边分叉时，"内容哈希"这一格会红（同一份草稿两个值），而不是静默地各算各的。 */
export function stableStringify(value) {
  const walk = (v) => {
    if (Array.isArray(v)) return `[${v.map(walk).join(',')}]`
    if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
    const keys = Object.keys(v).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${walk(v[k])}`).join(',')}}`
  }
  return walk(value)
}
const readText = (file) => {
  try { return readFileSync(file, 'utf8') } catch { return null }
}
const readJson = (file) => {
  const text = readText(file)
  if (text === null) return null
  try { return JSON.parse(text) } catch { return null }
}
/** 递归列文件（相对路径、posix、升序）—— 落点读数与"零新增"都用它。 */
export function pathsUnder(dir) {
  const abs = path.resolve(dir)
  if (!existsSync(abs)) return []
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = path.join(d, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) out.push(path.relative(abs, full).replace(/\\/g, '/'))
    }
  }
  walk(abs)
  return out
}
export const countFiles = (dir) => pathsUnder(dir).length

// ── 落点式子（契约 §4.2）───────────────────────────────────────────────────
export const draftsRoot = (root) => path.join(root, 'state', 'maintenance-drafts')
export const draftDayDir = (root, day) => path.join(draftsRoot(root), day)
export const draftPathOf = (root, day, draftId) => path.join(draftDayDir(root, day), `${draftId}.json`)
export const poolFileOf = (root) => path.join(root, 'proposals', 'pool.jsonl')
export const dayKeyOf = (day) => String(day).replace(/-/g, '')

/** 读池子：文件不在 = 合法空态；**一行坏 ⇒ `rows: null`**（半写要被看见，不许读成空池）。 */
export function readPoolRows(root) {
  const file = poolFileOf(root)
  const text = readText(file)
  if (text === null) return { rows: [], text: '', file, exists: false }
  const rows = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === '') continue
    try { rows.push(JSON.parse(lines[i])) } catch { return { rows: null, text, file, exists: true, corruptLine: i + 1 } }
  }
  return { rows, text, file, exists: true }
}
/** 一行里的号（`-<8位>-<数字>`）；认不出 ⇒ null。 */
export function drawOf(id) {
  const m = /-(\d{8})-(\d+)$/.exec(String(id ?? ''))
  return m === null ? null : { day: m[1], seq: Number(m[2]) }
}
/** 池子里已经用过的最大号（id 里那几位与 `seq` 字段都读，取大的）。 */
export function maxPoolSeq(rows) {
  let max = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    const byId = drawOf(row?.imported_id)?.seq ?? 0
    const byField = Number.isFinite(Number(row?.seq)) ? Number(row.seq) : 0
    max = Math.max(max, byId, byField)
  }
  return max
}

// ── 合成数据根 ─────────────────────────────────────────────────────────────
/** 快照里的三条条目（`last_evidence_review` 是 `normalizeEntry` 的必填项）。 */
export const ENTRY_FIXTURE = Object.freeze([
  { id: 'g-fixture-1', type: 'general', text: '夹具：底层通用第一条（维护案的目标）', last_evidence_review: '2026-11-01' },
  { id: 'p-fixture-1', type: 'project', text: '夹具：关于某个项目的那一条', last_evidence_review: '2026-11-02' },
  { id: 'b-fixture-1', type: 'boss', text: '夹具：关于老板的那一条', last_evidence_review: '2026-11-03' },
])
export const TARGET_ID = 'g-fixture-1'

let snapshotModule = null
/** 产品自己的快照构造器（**形状的唯一来源**：夹具不手抄那 13 个必填键）。 */
async function snapshotMod() {
  if (snapshotModule === null) {
    const file = path.join(PATHS.repo, 'presets', 'agenia', 'lib', 'snapshot.mjs')
    snapshotModule = await import(`${pathToFileURL(file).href}?mnf=snapshot`)
  }
  return snapshotModule
}

/**
 * 造一个**带 marker 的数据根**：`memory/snapshots/{current,v1.json}` + 可选预置池子行。
 *
 * @param {string} dir 落点（必须在运行根之下）
 * @param {{entries?: Array, version?: string, poolRows?: Array, withSnapshot?: boolean}} [opts]
 * @returns {Promise<{root: string, version: string|null, entries: Array}>}
 */
export async function makeDataRoot(dir, { entries = [...ENTRY_FIXTURE], version = 'v1', poolRows = [], withSnapshot = true } = {}) {
  const abs = path.resolve(dir)
  rmSync(abs, { recursive: true, force: true })
  mkdirSync(abs, { recursive: true })
  // 三层 marker 里的"数据根"那一层：真 CLI（`claim-update`）在 `--test-mode` 下要它。
  ensureMarkedDir(abs, { runRoot: runRoot(), runId: path.basename(runRoot()), kind: 'agenia-mnf-fixture-root' })
  let entryList = Array.isArray(entries) ? entries : []
  if (withSnapshot) {
    const mod = await snapshotMod()
    const snapshot = mod.buildSnapshot({ version, parentVersion: null, entries: entryList, generatedAt: AT })
    const snapDir = path.join(abs, 'memory', 'snapshots')
    mkdirSync(snapDir, { recursive: true })
    writeFileSync(path.join(snapDir, `${version}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
    writeFileSync(path.join(snapDir, 'current'), `${version}\n`, 'utf8')
    entryList = snapshot.entries
  }
  if (poolRows.length > 0) {
    mkdirSync(path.join(abs, 'proposals'), { recursive: true })
    writeFileSync(poolFileOf(abs), poolRows.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8')
  }
  return { root: abs, version: withSnapshot ? version : null, entries: entryList }
}

/** 池子里一行"别 kind"的历史行（用来钉**跨 kind 一个号段**）。 */
export function proposalRow({ day = DAY, seq = 7, kind = 'proposal', text = '夹具：一条普通候选' } = {}) {
  const id = `${kind}-${dayKeyOf(day)}-${String(seq).padStart(4, '0')}`
  return {
    schema: 1,
    kind,
    imported_id: id,
    imported_at: `${day}T00:10:00.000Z`,
    seq,
    source: '（MNF 夹具）跳号的历史行',
    sha256: 'f'.repeat(64),
    content_sha256: 'e'.repeat(64),
    base_snapshot: 'v0',
    update_generation: 1,
    review_attempt: 1,
    payload: { entry: { id: `cand-${dayKeyOf(day)}-${String(seq).padStart(4, '0')}`, type: 'general', text } },
  }
}

/** 一份合法草稿（`target` 指向快照里第一条）。 */
export function draftFixture(over = {}) {
  return {
    proposed_op: 'retire',
    target_entry_id: TARGET_ID,
    target_original_text: '夹具：底层通用第一条（维护案的目标）',
    reason: '夹具：这一条已经被同族的另一条完全覆盖（MNF 用例）',
    source_entry_ids: ['p-fixture-1'],
    ...over,
  }
}

/** 内容哈希（契约 §4.3：一个定义，三处同值）。 */
export const contentShaOfDraft = (draft) => sha256Hex(stableStringify(draft))

/**
 * **cwd 沙盒**：`fn()` 执行期间把工作目录切到 `dir`（必须在运行根之下），退出时**一定**切回来。
 *
 * 为什么必须有它：`MNF-02` 那把刀（`path-from-cwd`）与它的翻面矩阵里，`MNF-01` 会在**入口 cwd**
 * 上落一份草稿。第一版没沙盒 ⇒ 那几份落到了 `E:\Harness\state\maintenance-drafts\…`（仓库根，
 * 运行根之外，`git status` 里多一个 `?? state/`）。那是**测试自己**越界，不是产品的问题 ——
 * 但它会污染工作树，也会让"所有写入都在运行根里"这句话变成假话。
 * ⇒ 刀只能在**沙盒里**切：cwd 指到这一格的目录（运行根之下），落点再歪也歪不出运行根。
 */
export async function withCwdSandbox(dir, fn) {
  const abs = path.resolve(dir)
  const root = path.resolve(runRoot())
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) throw new Error(`MNF-E-SANDBOX-OUTSIDE: ${abs} 不在运行根（${root}）之下`)
  mkdirSync(abs, { recursive: true })
  const before = process.cwd()
  try {
    process.chdir(abs)
    return await fn()
  } finally {
    process.chdir(before)
  }
}

/** 运行根之外**不许**多出来的东西（刀切出来的落点最典型的越界形状）。 */
export function repoLeaks() {
  const leaks = []
  const candidates = [path.join(PATHS.repo, 'state'), path.join(PATHS.repo, 'proposals'), path.join(PATHS.repo, 'memory')]
  for (const p of candidates) if (existsSync(p)) leaks.push(p)
  return leaks
}

// ── 调工具（统一的成功/失败形状）────────────────────────────────────────────
export async function callTool(tool, draft, options) {
  try {
    return { ok: true, value: await tool.run(draft, options) }
  } catch (error) {
    return { ok: false, code: error?.code ?? null, message: String(error?.message ?? error) }
  }
}

// ── ② 参照实现（照契约写的最小实现；不 import 产品）────────────────────────
/**
 * @param {{defect?: string|null}} [opts] 刀开关（见 `KNIVES`）
 * @returns {{name: string, codes: object, run: Function, defects: string[]}}
 */
export function referenceTool({ defect = null } = {}) {
  const KNOWN = ['proposed_op', 'target_entry_id', 'target_original_text', 'product_text', 'source_entry_ids', 'reason']
  const err = (code, message) => {
    const e = new Error(`${code}: ${message}`)
    e.code = code
    return e
  }
  const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== ''
  const isNonEmptyStringArray = (v) => Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString)

  function validate(draft) {
    if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
      throw err(CODES.SHAPE, `draft 必须是一个对象（实得 ${draft === null ? 'null' : Array.isArray(draft) ? '数组' : typeof draft}）`)
    }
    const unknown = Object.keys(draft).filter((k) => !KNOWN.includes(k))
    if (unknown.length > 0) {
      throw err(CODES.SHAPE, `不认识的入参 ${unknown.map((k) => JSON.stringify(k)).join(', ')}（只收 ${KNOWN.join(' / ')}）—— 多给的字段一律拒：静默忽略会让调用方以为它生效了`)
    }
    if (!isNonEmptyString(draft.proposed_op) || !OPS.includes(draft.proposed_op)) {
      throw err(CODES.SHAPE, `proposed_op 必须是 ${OPS.join(' / ')} 之一，实得 ${JSON.stringify(draft.proposed_op)}`)
    }
    if (!isNonEmptyString(draft.target_entry_id)) {
      throw err(CODES.SHAPE, 'target_entry_id 必填（非空字符串）')
    }
    if (!isNonEmptyString(draft.target_original_text)) {
      throw err(CODES.SHAPE, 'target_original_text 必填（非空字符串；原文全文，逐字，不许只写 id / 摘要）')
    }
    if (!isNonEmptyString(draft.reason)) {
      throw err(CODES.SHAPE, 'reason 必填（非空字符串）—— 判决那一关要读它')
    }
    if (draft.product_text !== undefined && !isNonEmptyString(draft.product_text)) {
      throw err(CODES.SHAPE, `product_text 给了就必须是非空字符串，实得 ${JSON.stringify(draft.product_text)}`)
    }
    if (draft.source_entry_ids !== undefined && !isNonEmptyStringArray(draft.source_entry_ids)) {
      throw err(CODES.SHAPE, `source_entry_ids 给了就必须是非空字符串数组，实得 ${JSON.stringify(draft.source_entry_ids)}`)
    }
  }

  function readSnapshot(root) {
    const pointerFile = path.join(root, 'memory', 'snapshots', 'current')
    const version = readText(pointerFile)
    if (version === null) throw err(CODES.TARGET, `当前快照读不到（${pointerFile} 不在）—— 目标没法校，整份拒`)
    const snap = readJson(path.join(root, 'memory', 'snapshots', `${String(version).trim()}.json`))
    if (snap === null || !Array.isArray(snap.entries)) {
      throw err(CODES.TARGET, `当前快照（${String(version).trim()}）读不出来或没有 entries —— 目标没法校，整份拒`)
    }
    return { version: String(version).trim(), entries: snap.entries }
  }

  async function run(draft, options = {}) {
    const root = options?.root
    if (!isNonEmptyString(root)) throw err(CODES.SHAPE, 'root 必须是数据根的绝对路径（<内容根>/.runtime 那一层）')
    const day = isNonEmptyString(options?.day) ? options.day.trim() : DAY
    const at = isNonEmptyString(options?.at) ? options.at : new Date().toISOString()

    validate(draft)
    const snapshot = defect === 'no-target-check' ? null : readSnapshot(root)
    if (snapshot !== null && !snapshot.entries.some((e) => e?.id === draft.target_entry_id)) {
      throw err(CODES.TARGET, `目标条目 ${JSON.stringify(draft.target_entry_id)} 不在当前快照（${snapshot.version}）里 —— 这条处置没有宾语`)
    }
    const contentSha = contentShaOfDraft(draft)

    const pool = readPoolRows(root)
    if (pool.rows === null) {
      throw err(CODES.IO, `候选池第 ${pool.corruptLine} 行不是合法 JSON（${pool.file}）—— 整份拒，不写草稿`)
    }
    // 池子文件被一个目录占着之类：读不到 ⇒ 与"坏行"同一个出口（都不许装作没发生过）。
    if (!pool.exists && readText(pool.file) === null && existsSync(pool.file)) {
      throw err(CODES.IO, `候选池读不了（${pool.file} 不是可读文件）—— 整份拒，不写草稿`)
    }
    if (defect !== 'no-dedupe') {
      const prior = pool.rows.find((row) => String(row?.content_sha256 ?? '') === contentSha)
      if (prior !== undefined) {
        throw err(CODES.DUP, `重复 —— 同一段草稿内容已经提过（池子里那一条是 ${String(prior.imported_id)}，内容哈希 ${contentSha.slice(0, 12)}…）`)
      }
    }
    const seq = defect === 'id-from-rowcount' ? pool.rows.length + 1 : maxPoolSeq(pool.rows) + 1
    const draftId = `MR-${dayKeyOf(day)}-${String(seq).padStart(4, '0')}`
    const baseSnapshot = snapshot?.version ?? 'v1'

    const file = defect === 'path-from-cwd'
      ? path.join(process.cwd(), 'state', 'maintenance-drafts', day, `${draftId}.json`)
      : draftPathOf(root, day, draftId)
    const body = {
      schema: 1,
      draft_id: draftId,
      day,
      filed_at: at,
      content_sha256: contentSha,
      base_snapshot: baseSnapshot,
      draft,
      pool: { seq, imported_id: draftId },
    }
    mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(16).slice(2, 8)}`
    writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
    renameSync(tmp, file)

    if (defect !== 'no-pool-register') {
      const row = {
        schema: 1,
        kind: 'maintenance',
        imported_id: draftId,
        imported_at: at,
        seq,
        source: `maintenance-drafts/${day}/${draftId}.json`,
        sha256: contentSha,
        content_sha256: contentSha,
        base_snapshot: baseSnapshot,
        update_generation: null,
        review_attempt: null,
        payload: { draft },
      }
      const head = pool.rows.map((r) => JSON.stringify(r)).join('\n')
      const text = `${head}${head === '' ? '' : '\n'}${JSON.stringify(row)}\n`
      mkdirSync(path.dirname(pool.file), { recursive: true })
      const poolTmp = `${pool.file}.tmp-${process.pid}-${Math.random().toString(16).slice(2, 8)}`
      writeFileSync(poolTmp, text, 'utf8')
      renameSync(poolTmp, pool.file)
    }
    return { ok: true, draft_id: draftId, path: file, pool_seq: seq, content_sha256: contentSha, day, base_snapshot: baseSnapshot }
  }

  return { name: TOOL_NAME, codes: CODES, run, defects: ['id-from-rowcount', 'path-from-cwd', 'no-target-check', 'no-dedupe', 'no-pool-register'] }
}

/** 真工具 → 同一个调用面（缺面时 `run` 抛 `SUT-SURFACE-MISSING`）。 */
export function realToolAdapter(mod) {
  return {
    name: mod?.MAINTENANCE_FILE_TOOL_NAME ?? null,
    codes: mod?.MAINTENANCE_FILE_CODES ?? null,
    hasVerdict: typeof mod?.maintenanceFileVerdict === 'function',
    hasRun: typeof mod?.maintenanceFileRun === 'function',
    run: async (draft, options) => mod.maintenanceFileRun(draft, options),
  }
}

// ── ③ 六条检查 ─────────────────────────────────────────────────────────────
/**
 * 每条的约定：`check(ctx)` ⇒ `{problems, readings}`。
 * `ctx.tool` 是一个 `{run}`；`ctx.dir` 是这一跑独占的目录（检查内部自己造数据根）。
 */

/** C1 · 一次调用 = 文件 + 池行（另加：跨 kind 号段 / 池子读不了 ⇒ IO 且零草稿）。 */
export async function checkC1({ tool, dir }) {
  const problems = []
  const readings = {}
  const data = await makeDataRoot(path.join(dir, 'dr1'))
  const rowsBefore = readPoolRows(data.root).rows
  if (rowsBefore === null) {
    problems.push(problem('MNF-C1-FIXTURE', '夹具池子读不出来（空根上不该发生）'))
    return { problems, readings }
  }
  readings.before = { pool_rows: rowsBefore.length, draft_files: countFiles(draftsRoot(data.root)) }
  const draft = draftFixture()
  const res = await callTool(tool, draft, { root: data.root, day: DAY, at: AT })
  readings.receipt = res
  if (!res.ok) {
    problems.push(problem('MNF-C1-FILED', `提一份合法草稿必须成功，实得 ${String(res.code)}: ${res.message}`))
    return { problems, readings }
  }
  const value = res.value ?? {}
  const draftId = value.draft_id
  const expectedPath = draftPathOf(data.root, DAY, draftId)
  readings.path = { got: value.path ?? null, expected: expectedPath }
  if (typeof draftId !== 'string' || !DRAFT_ID_RE.test(draftId)) {
    problems.push(problem('MNF-C1-DRAFT-ID', `draft_id 必须是 MR-<YYYYMMDD>-<seq:04>，实得 ${JSON.stringify(draftId)}`))
  }
  if (String(value.path ?? '') !== expectedPath) {
    problems.push(problem('MNF-C1-PATH', `回执 path 必须逐字等于 <DR>/state/maintenance-drafts/<day>/<draft_id>.json（期望 ${expectedPath}，实得 ${JSON.stringify(value.path)}）`))
  }
  if (!existsSync(expectedPath)) {
    problems.push(problem('MNF-C1-FILE-ABSENT', `数据根下没有这份草稿：${expectedPath}`))
  } else {
    const body = readJson(expectedPath)
    readings.file = body
    if (body === null) {
      problems.push(problem('MNF-C1-FILE-JSON', `草稿文件不是合法 JSON：${expectedPath}`))
    } else {
      const keys = Object.keys(body).sort()
      const want = [...FILE_KEYS].sort()
      if (JSON.stringify(keys) !== JSON.stringify(want)) {
        problems.push(problem('MNF-C1-FILE-KEYS', `草稿文件的键集合必须恰好是 ${JSON.stringify(want)}，实得 ${JSON.stringify(keys)}`))
      }
      if (stableStringify(body.draft) !== stableStringify(draft)) {
        problems.push(problem('MNF-C1-DRAFT-VERBATIM', '文件里的 `draft` 必须与调用方给的**逐字相同**（不加不减、不 trim、不归一）'))
      }
      const wantContent = contentShaOfDraft(draft)
      if (body.content_sha256 !== wantContent) {
        problems.push(problem('MNF-C1-CONTENT-SHA', `文件里的 content_sha256 必须是 sha256(stableStringify(draft))（期望 ${wantContent.slice(0, 12)}…，实得 ${String(body.content_sha256).slice(0, 12)}…）`))
      }
      if (body.draft_id !== draftId) problems.push(problem('MNF-C1-FILE-ID', `文件里的 draft_id 与回执不一致：${JSON.stringify(body.draft_id)} ≠ ${JSON.stringify(draftId)}`))
      if (body.pool?.imported_id !== draftId) problems.push(problem('MNF-C1-POOL-STAMP', `文件里 pool.imported_id 必须等于 draft_id，实得 ${JSON.stringify(body.pool?.imported_id)}`))
      if (body.pool?.seq !== value.pool_seq) problems.push(problem('MNF-C1-POOL-STAMP', `文件里 pool.seq 必须等于回执 pool_seq，实得 ${JSON.stringify(body.pool?.seq)} ≠ ${JSON.stringify(value.pool_seq)}`))
      if (body.base_snapshot !== data.version) problems.push(problem('MNF-C1-BASE-SNAPSHOT', `文件里的 base_snapshot 必须是当时读到的快照版本（期望 ${data.version}，实得 ${JSON.stringify(body.base_snapshot)}）`))
    }
  }
  const rowsAfter = readPoolRows(data.root).rows
  if (rowsAfter === null) {
    problems.push(problem('MNF-C1-POOL-CORRUPT', '提完之后池子读不出来了（写坏了）'))
  } else {
    readings.after = { pool_rows: rowsAfter.length, draft_files: countFiles(draftsRoot(data.root)) }
    if (rowsAfter.length !== rowsBefore.length + 1) {
      problems.push(problem('MNF-C1-POOL-ROWS', `池子必须恰好 +1 行（${rowsBefore.length} → ${rowsBefore.length + 1}），实得 ${rowsAfter.length}`))
    }
    const last = rowsAfter[rowsAfter.length - 1] ?? null
    readings.last_row = last
    if (last === null || last.kind !== 'maintenance') {
      problems.push(problem('MNF-C1-POOL-KIND', `池子末行必须是 kind: "maintenance"，实得 ${JSON.stringify(last?.kind ?? null)}`))
    } else {
      if (last.imported_id !== draftId) {
        problems.push(problem('MNF-C1-POOL-ID', `池子末行的 imported_id 必须等于 draft_id（${JSON.stringify(draftId)}），实得 ${JSON.stringify(last.imported_id)}`))
      }
      if (last.seq !== value.pool_seq) {
        problems.push(problem('MNF-C1-POOL-SEQ', `池子末行的 seq 必须等于回执 pool_seq（${JSON.stringify(value.pool_seq)}），实得 ${JSON.stringify(last.seq)}`))
      }
      if (last.content_sha256 !== contentShaOfDraft(draft)) {
        problems.push(problem('MNF-C1-POOL-CONTENT', '池子末行的 content_sha256 必须 = 草稿的内容哈希（三处同值：文件 / 池行 / sha256 那一格）'))
      }
      if (last.sha256 !== last.content_sha256) {
        problems.push(problem('MNF-C1-POOL-SHA', '池行里 `sha256` 与 `content_sha256` 必须是同一个值（这条路上没有"调用方声明的哈希"）'))
      }
      if (last.base_snapshot !== data.version) {
        problems.push(problem('MNF-C1-POOL-BASE', `池行的 base_snapshot 必须是 ${data.version}，实得 ${JSON.stringify(last.base_snapshot)}`))
      }
      if (stableStringify(last.payload?.draft) !== stableStringify(draft)) {
        problems.push(problem('MNF-C1-POOL-PAYLOAD', '池行的 payload.draft 必须与调用方给的逐字相同'))
      }
    }
  }

  // ── 腿 2：跨 kind 一个号段（池里已有 seq 7 ⇒ 新号必须 0008；"按行数发号"会当场红）──
  const gap = await makeDataRoot(path.join(dir, 'dr2'), { poolRows: [proposalRow({ day: DAY, seq: 7 })] })
  const gapRes = await callTool(tool, draftFixture({ reason: '夹具：跨 kind 号段那一格' }), { root: gap.root, day: DAY, at: AT })
  readings.seq_ceiling = { receipt: gapRes.ok ? { draft_id: gapRes.value?.draft_id, pool_seq: gapRes.value?.pool_seq } : { code: gapRes.code, message: gapRes.message } }
  if (!gapRes.ok) {
    problems.push(problem('MNF-C1-SEQ-FILED', `池子里已有一条 seq 7 的历史行时，新草稿必须照样能提；实得 ${String(gapRes.code)}: ${gapRes.message}`))
  } else {
    const want = `MR-${dayKeyOf(DAY)}-0008`
    if (gapRes.value?.draft_id !== want) {
      problems.push(problem('MNF-C1-SEQ-CEILING', `发号依据是"已经发出去过哪些号"，不是"池子里现在几行"：池里 1 行（seq 7）⇒ 新号必须是 ${want}，实得 ${JSON.stringify(gapRes.value?.draft_id)}`))
    }
  }

  // ── 腿 3：池子读不了 ⇒ IO，且一份草稿都不许留 ──
  const broken = await makeDataRoot(path.join(dir, 'dr3'))
  mkdirSync(poolFileOf(broken.root), { recursive: true })
  const brokenRes = await callTool(tool, draftFixture({ reason: '夹具：池子读不了那一格' }), { root: broken.root, day: DAY, at: AT })
  readings.pool_unreadable = {
    code: brokenRes.ok ? null : brokenRes.code,
    message: brokenRes.ok ? null : brokenRes.message,
    draft_files: countFiles(draftsRoot(broken.root)),
  }
  if (brokenRes.ok) {
    problems.push(problem('MNF-C1-IO-ACCEPTED', '池子读不了（`proposals/pool.jsonl` 是一个目录）时竟然成功了 —— 那份草稿没有池行，下一轮看不见它'))
  } else if (brokenRes.code !== CODES.IO) {
    problems.push(problem('MNF-C1-IO-CODE', `池子写不进去的码必须是 ${CODES.IO}，实得 ${String(brokenRes.code)}`))
  }
  if (countFiles(draftsRoot(broken.root)) !== 0) {
    problems.push(problem('MNF-C1-IO-DRAFT-LEFT', `池子读不了的时候一份草稿都不许留下，实得 ${countFiles(draftsRoot(broken.root))} 份`))
  }
  return { problems, readings }
}

/** C2 · 落点与调用方工作区无关（chdir 到另一个工作区里提）。 */
export async function checkC2({ tool, dir }) {
  const problems = []
  const readings = {}
  const data = await makeDataRoot(path.join(dir, 'dr'))
  const workspace = ensureMarkedDir(path.join(dir, 'workspace'), { runRoot: runRoot(), runId: path.basename(runRoot()), kind: 'agenia-mnf-caller-workspace' })
  for (const sub of ['leader', 'state', 'brain', 'review', 'test']) mkdirSync(path.join(workspace, '.team', sub), { recursive: true })
  writeFileSync(path.join(workspace, '.team', 'leader', 'now.md'), '# 调用方工作区的 now（夹具）\n', 'utf8')
  const wsTeamBefore = pathsUnder(path.join(workspace, '.team'))
  readings.workspace_team_before = wsTeamBefore.length

  // 量具自检：**测试自己**往那个工作区的 `.team/` 写一份 ⇒ 同一个量具必须看得见（否则"零新增"是空绿）。
  // ⚠️ 这一份**不删**（`ENV-02` 的 `DELETE-NO-MARKER` 是对的：这里没有可删的理由）——
  //    它留在那里当"测量基线上本来就有一份"的样本：后面那次"零新增"是**带着它在场**量的。
  const probeFile = path.join(workspace, '.team', 'leader', 'mnf02-probe.md')
  writeFileSync(probeFile, '探针：这份必须被同一个量具看见（它不删，是基线的一部分）\n', 'utf8')
  const wsTeamBaseline = pathsUnder(path.join(workspace, '.team'))
  readings.detector = {
    before: wsTeamBefore.length,
    baseline_with_probe: wsTeamBaseline.length,
    saw_probe: wsTeamBaseline.some((p) => p.endsWith('mnf02-probe.md')),
  }
  if (readings.detector.baseline_with_probe !== wsTeamBefore.length + 1 || readings.detector.saw_probe !== true) {
    problems.push(problem('MNF-C2-DETECTOR', `量具自检失败：往工作区 .team/ 写一份之后必须数成 +1（${wsTeamBefore.length} → ${readings.detector.baseline_with_probe}）—— 那样"零新增"就是空绿`))
  }

  const cwdBefore = process.cwd()
  let res
  try {
    process.chdir(workspace)
    readings.cwd_during_call = process.cwd()
    res = await callTool(tool, draftFixture({ reason: '夹具：在另一个工作区里提' }), { root: data.root, day: DAY, at: AT })
  } finally {
    process.chdir(cwdBefore)
  }
  readings.receipt = res.ok ? { draft_id: res.value?.draft_id, path: res.value?.path } : { code: res.code, message: res.message }
  if (!res.ok) {
    problems.push(problem('MNF-C2-FILED', `在另一个工作区里调它也必须成功（落点由 root 决定），实得 ${String(res.code)}: ${res.message}`))
    return { problems, readings }
  }
  const expectedPath = draftPathOf(data.root, DAY, res.value.draft_id)
  if (!existsSync(expectedPath)) {
    problems.push(problem('MNF-C2-DR-FILE', `数据根下必须有这份草稿：${expectedPath}`))
  }
  const drDraftFiles = countFiles(draftsRoot(data.root))
  readings.dr_draft_files = drDraftFiles
  if (drDraftFiles !== 1) {
    problems.push(problem('MNF-C2-DR-COUNT', `数据根下必须恰好 1 份草稿，实得 ${drDraftFiles}`))
  }
  // 基线 = **带探针**的那一份（`wsTeamBaseline`）：所以"零新增"量的是"工具有没有多写"，
  // 而不是"测试自己那份探针在不在"。
  const wsTeamAfter = pathsUnder(path.join(workspace, '.team'))
  readings.workspace_team_after = wsTeamAfter
  readings.new_paths_in_workspace = wsTeamAfter.filter((p) => !wsTeamBaseline.includes(p))
  if (wsTeamAfter.length !== wsTeamBaseline.length) {
    problems.push(problem('MNF-C2-WORKSPACE-TOUCHED', `调用方工作区的 .team/ 必须零新增（${wsTeamBaseline.length} → ${wsTeamAfter.length}）：${JSON.stringify(readings.new_paths_in_workspace)}`
      + ' —— 落点由调用方决定 = 昨天那个病（27 份草稿落在当时所在的工作区）'))
  }
  // 量具仍然活着：测量那一刻探针必须还在（否则"零新增"可能只是量具丢了样本）
  readings.detector.probe_present_at_measure = wsTeamAfter.some((p) => p.endsWith('mnf02-probe.md'))
  if (readings.detector.probe_present_at_measure !== true) {
    problems.push(problem('MNF-C2-DETECTOR', '测量那一刻探针不见了 —— 这一格的"零新增"没有样本，不许当绿'))
  }
  const wsAll = pathsUnder(workspace).filter((p) => !p.startsWith('.agenia-test-root'))
  readings.workspace_all_after_count = wsAll.length
  const strays = wsAll.filter((p) => p.includes('maintenance-drafts'))
  if (strays.length > 0) {
    problems.push(problem('MNF-C2-WORKSPACE-DRAFT', `调用方工作区里出现了草稿：${JSON.stringify(strays)} —— 落点跟了调用方`))
  }
  return { problems, readings }
}

/** C3 · 形状不对要拒，且零写入（末尾一份合法案当尺子）。 */
export async function checkC3({ tool, dir }) {
  const problems = []
  const readings = {}
  const data = await makeDataRoot(path.join(dir, 'dr'))
  const counter = () => ({ pool_rows: readPoolRows(data.root).rows?.length ?? -1, draft_files: countFiles(draftsRoot(data.root)) })
  readings.before = counter()
  const cells = [
    { tag: 'missing-target-original-text', draft: (() => { const d = draftFixture(); delete d.target_original_text; return d })(), code: CODES.SHAPE, names: 'target_original_text' },
    { tag: 'op-delete', draft: draftFixture({ proposed_op: 'delete' }), code: CODES.SHAPE, names: 'proposed_op' },
    { tag: 'target-missing', draft: draftFixture({ target_entry_id: 'g-not-in-snapshot', reason: '夹具：目标不在快照里' }), code: CODES.TARGET, names: 'g-not-in-snapshot' },
    { tag: 'unknown-key', draft: { ...draftFixture(), evidence: '夹具：多给一个键' }, code: CODES.SHAPE, names: 'evidence' },
  ]
  readings.cells = {}
  for (const cell of cells) {
    const res = await callTool(tool, cell.draft, { root: data.root, day: DAY, at: AT })
    const after = counter()
    readings.cells[cell.tag] = { ok: res.ok, code: res.ok ? null : res.code, message: res.ok ? null : res.message, after }
    if (res.ok) {
      problems.push(problem(`MNF-C3-${cell.tag.toUpperCase()}-ACCEPTED`, `[${cell.tag}] 这一份必须被拒，实得成功（它会被写进池子并被下一轮看见）`))
    } else {
      if (res.code !== cell.code) {
        problems.push(problem(`MNF-C3-${cell.tag.toUpperCase()}-CODE`, `[${cell.tag}] 码必须是 ${cell.code}，实得 ${String(res.code)}`))
      }
      if (!String(res.message).startsWith(cell.code)) {
        problems.push(problem(`MNF-C3-${cell.tag.toUpperCase()}-MESSAGE`, `[${cell.tag}] 报文必须以码开头（${cell.code}），实得 ${JSON.stringify(String(res.message).slice(0, 80))}`))
      }
      if (!String(res.message).includes(cell.names)) {
        problems.push(problem(`MNF-C3-${cell.tag.toUpperCase()}-NAMES`, `[${cell.tag}] 报文必须点名 ${JSON.stringify(cell.names)}，实得 ${JSON.stringify(String(res.message).slice(0, 160))}`))
      }
    }
    if (after.pool_rows !== readings.before.pool_rows || after.draft_files !== readings.before.draft_files) {
      problems.push(problem(`MNF-C3-${cell.tag.toUpperCase()}-WROTE`, `[${cell.tag}] 被拒的那一次必须**零写入**（池子 ${readings.before.pool_rows}→${after.pool_rows} 行 · 草稿 ${readings.before.draft_files}→${after.draft_files} 份）`))
    }
  }
  // ── 尺子：一份合法案必须被收（且计数会动）——"上面都没动"不能是"量具坏了" ──
  const okRes = await callTool(tool, draftFixture({ reason: '夹具：形状那一族的阳性对照' }), { root: data.root, day: DAY, at: AT })
  const afterOk = counter()
  readings.ruler = { ok: okRes.ok, code: okRes.ok ? null : okRes.code, after: afterOk }
  if (!okRes.ok) {
    problems.push(problem('MNF-C3-RULER', `阳性对照没成立：同一根上一份合法草稿必须被收，实得 ${String(okRes.code)}: ${okRes.message} —— 那么上面"零写入"是空绿`))
  } else if (afterOk.pool_rows !== readings.before.pool_rows + 1) {
    problems.push(problem('MNF-C3-RULER', `阳性对照没动计数（池子 ${readings.before.pool_rows} → ${afterOk.pool_rows}）—— 量具坏了`))
  }
  return { problems, readings }
}

/** C4 · 重复要拒（同一天 / 换一天都拒），池子仍只有一行；换一字 ⇒ 收（尺子）。 */
export async function checkC4({ tool, dir }) {
  const problems = []
  const readings = {}
  const data = await makeDataRoot(path.join(dir, 'dr'))
  const draft = draftFixture({ reason: '夹具：判重那一格' })
  const first = await callTool(tool, draft, { root: data.root, day: DAY, at: AT })
  readings.first = first.ok ? { draft_id: first.value?.draft_id } : { code: first.code, message: first.message }
  if (!first.ok) {
    problems.push(problem('MNF-C4-FIRST', `第一份必须成功，实得 ${String(first.code)}: ${first.message}`))
    return { problems, readings }
  }
  const rowsAfterFirst = readPoolRows(data.root).rows?.length ?? -1
  readings.rows_after_first = rowsAfterFirst
  if (rowsAfterFirst !== 1) problems.push(problem('MNF-C4-FIRST-ROWS', `第一份之后池子必须恰好 1 行，实得 ${rowsAfterFirst}`))

  const dupCells = [
    { tag: 'same-day', opts: { root: data.root, day: DAY, at: AT } },
    { tag: 'other-day', opts: { root: data.root, day: DAY2, at: AT2 } },
  ]
  readings.dup = {}
  for (const cell of dupCells) {
    const res = await callTool(tool, draft, cell.opts)
    readings.dup[cell.tag] = { ok: res.ok, code: res.ok ? null : res.code, message: res.ok ? null : res.message }
    if (res.ok) {
      problems.push(problem(`MNF-C4-${cell.tag.toUpperCase()}-ACCEPTED`, `[${cell.tag}] 同一段草稿内容第二次必须被拒（E_MAINTENANCE_DUPLICATE），实得成功`))
    } else if (res.code !== CODES.DUP) {
      problems.push(problem(`MNF-C4-${cell.tag.toUpperCase()}-CODE`, `[${cell.tag}] 码必须是 ${CODES.DUP}，实得 ${String(res.code)}`))
    }
    const rows = readPoolRows(data.root).rows?.length ?? -1
    if (rows !== 1) problems.push(problem(`MNF-C4-${cell.tag.toUpperCase()}-ROWS`, `[${cell.tag}] 被拒之后池子必须仍只有 1 行，实得 ${rows}`))
  }
  // ── 尺子：换一个字（内容不同）必须收 —— 拒的不是"全都拒" ──
  const changed = await callTool(tool, draftFixture({ ...draft, reason: '夹具：判重那一格的阳性对照（换了一个字）' }), { root: data.root, day: DAY, at: AT })
  const rowsAfterChanged = readPoolRows(data.root).rows?.length ?? -1
  readings.ruler = { ok: changed.ok, code: changed.ok ? null : changed.code, rows: rowsAfterChanged }
  if (!changed.ok) {
    problems.push(problem('MNF-C4-RULER', `换了一字的草稿必须被收（判重键是内容哈希），实得 ${String(changed.code)}: ${changed.message}`))
  } else if (rowsAfterChanged !== 2) {
    problems.push(problem('MNF-C4-RULER', `换了一字之后池子必须 2 行，实得 ${rowsAfterChanged}`))
  }
  return { problems, readings }
}

/** C5 的"下一轮读数"：真 CLI 三连（`claim-update` → `judge-pending` → `candidates-freeze`）。 */
export async function readingChain({ root, day, caseId = 'MNF-05' }) {
  const cliPath = path.join(PATHS.repo, 'presets', 'agenia', 'bin', 'agenia-brain.mjs')
  const env = { ...process.env }
  const claimIn = writeFixture(caseId, 'claim-update', { day, owner_project: 'mnf05-fixture', owner_session: 'mnf05-session' }, 'json', env)
  const claim = runCli('agenia-brain.mjs', { op: 'claim-update', dataRoot: root, inFile: claimIn, testMode: true }, { env, cliPath })
  const generation = claim.json?.generation ?? null
  const pending = runCli('agenia-brain.mjs', { op: 'judge-pending', dataRoot: root, testMode: true }, { env, cliPath })
  const pendingIds = Array.isArray(pending.json?.pending_ids) ? pending.json.pending_ids : []
  const rows = readPoolRows(root).rows ?? []
  const rowById = new Map(rows.map((r) => [String(r?.imported_id), r]))
  const maintenanceRows = rows.filter((r) => r?.kind === 'maintenance')
  const maintenancePending = pendingIds.filter((id) => rowById.get(String(id))?.kind === 'maintenance')
  const freezeIn = writeFixture(caseId, 'candidates-freeze', { day, generation, candidate_ids: pendingIds }, 'json', env)
  const freeze = generation === null
    ? { exit_code: null, json: null, stdout: '', stderr: 'claim-update 没给出 generation' }
    : runCli('agenia-brain.mjs', { op: 'candidates-freeze', dataRoot: root, inFile: freezeIn, testMode: true }, { env, cliPath })
  const state = readJson(path.join(root, 'state', 'update', `${day}.json`))
  return {
    steps: {
      claim: { exit_code: claim.exit_code, generation, code: claim.json?.error?.code ?? null },
      pending: { exit_code: pending.exit_code, count: pendingIds.length, ids: pendingIds, code: pending.json?.error?.code ?? null },
      freeze: { exit_code: freeze.exit_code, count: freeze.json?.count ?? null, code: freeze.json?.error?.code ?? null },
    },
    pool_rows: rows.length,
    pool_maintenance_rows: maintenanceRows.length,
    maintenance_pending: maintenancePending,
    frozen_ids: Array.isArray(state?.frozen_proposal_ids) ? state.frozen_proposal_ids : null,
    stderr: [claim, pending, freeze].map((r) => String(r.stderr ?? '').trim()).filter((s) => s !== '').join(' | ').slice(0, 400),
  }
}

/**
 * C5 · 下一轮看得见。
 * `withChain:false` = 只判"池子那一侧"（矩阵里别的刀下跑它，不重复起三次 CLI）。
 */
export async function checkC5({ tool, dir, withChain = true }) {
  const problems = []
  const readings = {}
  const draft = draftFixture({ reason: '夹具：下一轮看得见那一格' })

  // ── 昨天那个现场：草稿文件在盘上、池子里 0 行 `maintenance`（没有池行 = 判决侧结构上看不见）──
  const hand = await makeDataRoot(path.join(dir, 'hand'))
  const handId = `MR-${dayKeyOf(DAY)}-0001`
  const handFile = draftPathOf(hand.root, DAY, handId)
  mkdirSync(path.dirname(handFile), { recursive: true })
  writeFileSync(handFile, `${JSON.stringify({ schema: 1, draft_id: handId, day: DAY, filed_at: AT, content_sha256: contentShaOfDraft(draft), base_snapshot: hand.version, draft, pool: { seq: 1, imported_id: handId } }, null, 2)}\n`, 'utf8')
  const handRows = readPoolRows(hand.root).rows ?? []
  readings.yesterday_sample = { draft_files: countFiles(draftsRoot(hand.root)), pool_rows: handRows.length, pool_maintenance_rows: handRows.filter((r) => r?.kind === 'maintenance').length }
  if (readings.yesterday_sample.pool_maintenance_rows !== 0) {
    problems.push(problem('MNF-C5-SAMPLE', `"昨天那个现场"（只写了草稿文件、没有池行）的读数必须是 0 行 maintenance，实得 ${readings.yesterday_sample.pool_maintenance_rows} —— 那样这一格量不到东西`))
  }
  if (withChain) {
    const handChain = await readingChain({ root: hand.root, day: DAY, caseId: 'MNF-05-hand' })
    readings.yesterday_chain = handChain
    if (handChain.steps.claim.exit_code !== 0 || handChain.steps.freeze.exit_code !== 0) {
      problems.push(problem('MNF-C5-CHAIN', `[昨天那个现场] claim-update / candidates-freeze 必须能跑（exit 0），实得 claim=${handChain.steps.claim.exit_code} freeze=${handChain.steps.freeze.exit_code}；stderr=${JSON.stringify(handChain.stderr)}`))
    } else if (handChain.maintenance_pending.length !== 0 || (handChain.frozen_ids ?? []).some((id) => String(id).startsWith('MR-'))) {
      problems.push(problem('MNF-C5-CHAIN-ZERO', `[昨天那个现场] 下一轮的读数里不许有 maintenance 候选（frozen=${JSON.stringify(handChain.frozen_ids)}）—— 草稿文件在盘上不等于看得见`))
    }
  }

  // ── 经工具提一份 ⇒ 同一串读数里必须看得见 ──
  const filed = await makeDataRoot(path.join(dir, 'filed'))
  const res = await callTool(tool, draft, { root: filed.root, day: DAY, at: AT })
  readings.receipt = res.ok ? { draft_id: res.value?.draft_id } : { code: res.code, message: res.message }
  const filedRows = readPoolRows(filed.root).rows ?? []
  readings.filed = { draft_files: countFiles(draftsRoot(filed.root)), pool_rows: filedRows.length, pool_maintenance_rows: filedRows.filter((r) => r?.kind === 'maintenance').length }
  if (!res.ok) {
    problems.push(problem('MNF-C5-FILED', `经工具提一份必须成功，实得 ${String(res.code)}: ${res.message}`))
    return { problems, readings }
  }
  if (readings.filed.pool_maintenance_rows < 1) {
    problems.push(problem('MNF-C5-POOL', `提完之后池子里 kind: maintenance 的行数必须 ≥ 1，实得 ${readings.filed.pool_maintenance_rows}（草稿在盘上但不在池里 = 判决岗结构上看不见 —— 昨天那 27 份）`))
  }
  if (withChain) {
    const chain = await readingChain({ root: filed.root, day: DAY, caseId: 'MNF-05-filed' })
    readings.chain = chain
    if (chain.steps.claim.exit_code !== 0) problems.push(problem('MNF-C5-CHAIN', `claim-update 必须 exit 0，实得 ${chain.steps.claim.exit_code}；stderr=${JSON.stringify(chain.stderr)}`))
    if (chain.steps.pending.exit_code !== 0) problems.push(problem('MNF-C5-CHAIN', `judge-pending 必须 exit 0，实得 ${chain.steps.pending.exit_code}`))
    if (chain.steps.freeze.exit_code !== 0) problems.push(problem('MNF-C5-CHAIN', `candidates-freeze 必须 exit 0，实得 ${chain.steps.freeze.exit_code}；stderr=${JSON.stringify(chain.stderr)}`))
    if (chain.maintenance_pending.length < 1) {
      problems.push(problem('MNF-C5-READING', `下一轮的读数里 kind: maintenance 的候选必须 ≥ 1，实得 ${chain.maintenance_pending.length}（pending=${JSON.stringify(chain.steps.pending.ids)}）`))
    }
    if (!Array.isArray(chain.frozen_ids) || !chain.frozen_ids.includes(res.value.draft_id)) {
      problems.push(problem('MNF-C5-FROZEN', `冻结清单里必须有那个草稿 id ${JSON.stringify(res.value.draft_id)}，实得 ${JSON.stringify(chain.frozen_ids)}`))
    }
  }
  return { problems, readings }
}

/**
 * C6 · 可达性（判组合，不判散文）。
 * @param {{roleTable: Array, baseToolSet: string[], registerNames: string[], checkNotesText: string|null, ymlText: string|null}} input
 */
export function checkC6({ roleTable, baseToolSet, registerNames, checkNotesText, ymlText }) {
  const problems = []
  const readings = {}
  const table = Array.isArray(roleTable) ? roleTable : null
  const base = Array.isArray(baseToolSet) ? baseToolSet : null
  const registered = Array.isArray(registerNames) ? registerNames : null
  readings.surfaces = {
    role_table: table === null ? 'missing' : table.length,
    base_tool_set: base === null ? 'missing' : base.length,
    registered: registered,
  }
  if (table === null) {
    problems.push(problem('MNF-C6-COMPOSITION', '`inject.js` 拿不到 `ROLE_TABLE` —— 工具面判不了（不许当绿）'))
    return { problems, readings }
  }
  const member = table.find((e) => e?.role === 'memory-review')
  readings.memory_review_role = member === undefined ? null : { tools: member.tools, has_tool: Array.isArray(member.tools) && member.tools.includes(TOOL_NAME) }
  if (member === undefined) {
    problems.push(problem('MNF-C6-COMPOSITION', '`ROLE_TABLE` 里没有 role=memory-review 那一条 —— 复核岗的工具面判不了'))
  } else if (!Array.isArray(member.tools) || !member.tools.includes(TOOL_NAME)) {
    problems.push(problem('MNF-C6-TOOL-FACE', `复核岗（memory-review）的 \`ROLE_TABLE[].tools\` 里没有 ${TOOL_NAME}（实得 ${JSON.stringify(member.tools)}）—— 这就是今天病的直接成因：那个岗位没有那个工具`))
  }
  if (base !== null && !base.includes(TOOL_NAME)) {
    problems.push(problem('MNF-C6-TOOL-FACE', `\`BASE_TOOL_SET\` 里没有 ${TOOL_NAME}（通用组员预设的工具面由它派生）`))
  }
  // 阳性对照：同一个读者必须看得见**已经在用的**那个工具（否则上面"没看见"是读者瞎了）。
  const controlSeen = (member !== undefined && Array.isArray(member.tools) && member.tools.includes('proposal_file'))
    && (base === null || base.includes('proposal_file'))
  readings.control_sees_proposal_file = controlSeen
  if (!controlSeen) {
    problems.push(problem('MNF-C6-CONTROL', '阳性对照失败：同一个读者在同一个位置上连 `proposal_file` 都看不见 —— 那么"没看见 maintenance_file"不作数'))
  }
  // ② 实际注册（行为，不是散文）
  if (registered === null) {
    problems.push(problem('MNF-C6-REGISTER', '量不到实际注册的工具名（`apply()` 没跑起来）—— 不许当绿'))
  } else {
    readings.registered_has_tool = registered.includes(TOOL_NAME)
    readings.control_registered_proposal_file = registered.includes('proposal_file')
    if (!registered.includes(TOOL_NAME)) {
      problems.push(problem('MNF-C6-REGISTER', `真跑 \`apply()\` 时实际注册的工具名里没有 ${TOOL_NAME}（实得 ${JSON.stringify(registered)}）—— 工具在盘上 ≠ 那个岗位拿得到`))
    }
    if (!registered.includes('proposal_file')) {
      problems.push(problem('MNF-C6-CONTROL', '阳性对照失败：`apply()` 连 `proposal_file` 都没注册 —— 这次装配本身不可信'))
    }
  }
  // ③ 体检同伴（同一批）
  if (typeof checkNotesText !== 'string') {
    readings.check_notes = { present: false }
  } else {
    const names = checkNotesText.includes(TOOL_NAME)
    readings.check_notes = { present: true, names_tool: names }
    if (!names) {
      problems.push(problem('MNF-C6-CHECK-NOTES', `.tools/check-notes.mjs 里一个字都没提 ${TOOL_NAME} —— 「同批更新」没做：这个工具加进去之后，没有任何体检判据盯着它`))
    }
    const m = /const EXPECTED_ONLY_AGENIA\s*=\s*(\d+)/.exec(checkNotesText)
    const expected = m === null ? null : Number(m[1])
    readings.check_notes.expected_only_agenia = expected
    if (typeof ymlText === 'string') {
      const compRows = parseComposition(ymlText, 'mnf-live-composition').rows.length
      const retiredStdRows = FROZEN.staged.onlyInStandard.length
      const want = compRows - (FROZEN.oracle.capabilityRows - retiredStdRows)
      readings.only_agenia_from_composition = { composition_rows: compRows, standard_capability_rows: FROZEN.oracle.capabilityRows, upstream_retired_standard_rows: retiredStdRows, delta: want }
      if (expected === null) problems.push(problem('MNF-C6-CHECK-NOTES', '读不出体检里的 `EXPECTED_ONLY_AGENIA` 常量 —— 增量口径没有落点'))
      else if (expected !== want) {
        problems.push(problem('MNF-C6-CONST-DRIFT', `\`EXPECTED_ONLY_AGENIA\` 应为 ${want}（组合 ${compRows} 行 −（出厂能力行 ${FROZEN.oracle.capabilityRows} − 上游已取消的 ${retiredStdRows} 条）），实得 ${expected}`))
      }
      // 若实现岗真给组合加了 cordis 行，那一行还得落进 `CLIENT_UI_ROWS` 那类"点名清单"（否则 extraNotDeclared 红）。
      const rowId = 'tool-maintenance-file'
      const hasRow = parseComposition(ymlText, 'mnf-live-composition').rows.some((r) => r.id === rowId)
      readings.cordis_row = { id: rowId, present: hasRow }
      if (hasRow) {
        const declaredLiteral = /const CLIENT_UI_ROWS\s*=\s*\[([^\]]*)\]/.exec(checkNotesText)
        const declared = declaredLiteral === null ? [] : [...declaredLiteral[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] ?? x[2])
        readings.cordis_row.declared_in = declared
        if (!declared.includes(rowId)) {
          problems.push(problem('MNF-C6-DECLARED', `组合里加了 \`${rowId}\` 那一行，但体检的"点名清单"里没有它（实得 ${JSON.stringify(declared)}）—— 只改一处，` + '`extraNotDeclared` 当场红'))
        }
      }
    }
  }
  return { problems, readings }
}

/** 六条检查的登记（用例按 id 取；矩阵按同一个函数跑别的格）。 */
export const CHECKS = Object.freeze({
  'MNF-01': checkC1,
  'MNF-02': checkC2,
  'MNF-03': checkC3,
  'MNF-04': checkC4,
  'MNF-05': checkC5,
  'MNF-06': checkC6,
})

/** 每格的刀（契约 §8 的矩阵；`C6` 那一把切的是合成注入器，不走 referenceTool）。 */
export const KNIVES = Object.freeze({
  'MNF-01': { kind: 'reference', defect: 'id-from-rowcount' },
  'MNF-02': { kind: 'reference', defect: 'path-from-cwd' },
  'MNF-03': { kind: 'reference', defect: 'no-target-check' },
  'MNF-04': { kind: 'reference', defect: 'no-dedupe' },
  'MNF-05': { kind: 'reference', defect: 'no-pool-register' },
  'MNF-06': { kind: 'injector', defect: 'face-without-tool' },
})

/**
 * 一跑独占的目录（在运行根之下；删之前过 `assertDeletable` 那三道校验由调用方保证）。
 * @param {string} caseId
 */
export function caseDir(caseId) {
  const dir = path.join(runRoot(), 'maintenance-file', caseId.toLowerCase())
  const abs = path.resolve(dir)
  const root = path.resolve(runRoot())
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) throw new Error(`MNF-E-OUTSIDE-RUN-ROOT: ${abs}`)
  rmSync(abs, { recursive: true, force: true })
  mkdirSync(abs, { recursive: true })
  return abs
}

/** 真工具模块的动态加载（缺面 ⇒ `{mod:null,error}`，不是测试崩）。 */
let toolCache
export async function loadRealTool() {
  if (toolCache !== undefined) return toolCache
  const file = path.join(PATHS.repo, TOOL_REL)
  if (!existsSync(file)) {
    toolCache = { mod: null, file, error: `盘上没有 ${file}` }
    return toolCache
  }
  try {
    toolCache = { mod: await import(`${pathToFileURL(file).href}?mnf=${Date.now()}`), file, error: null }
  } catch (error) {
    toolCache = { mod: null, file, error: `${error?.code ?? 'ERR'}: ${String(error?.message ?? error)}` }
  }
  return toolCache
}

/** 体检脚本 / 组合的现读（不在树里 ⇒ null，由用例记 HOLD 或读数）。 */
export function readCheckNotes() {
  const file = path.join(PATHS.repo, '.tools', 'check-notes.mjs')
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}
export function readCompositionYml() {
  const file = path.join(PATHS.repo, 'presets', 'agenia', 'agent.cordis.yml')
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}
