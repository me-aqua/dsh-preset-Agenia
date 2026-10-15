/**
 * 快照 —— 发布 / 读取 / 损坏检测 / 归档 + 记忆更新报告的只读投影。
 *
 * 冻结依据：
 *   · 提案 §B3.6 的**快照字段表**（`<dataRoot>/memory/snapshots/<vN>.json` + `current` 指针）与
 *     **entry 字段表**；`archived[{entry_id, disposition, to}]` 是归档的去向；
 *   · 提案 §B3.4 的四类分布与字符口径（`distribution` 恰 4 项、`totals` 与之严格相等、
 *     `char_metric` 逐字 `{unit:'unicode-code-point', normalization:'strip-bom+lf', scope:'entry.text', schema:1}`）；
 *   · 追加裁定 **D-B4**：快照条目**必须有 `is_double_low`**（发布值）—— 斩杀资格读它，不重算；
 *   · 追加裁定 **C-2**：`entries_patch` 的六种 op 形状由 `lib/memory.mjs::capacityVerdict` 判，
 *     本模块**不另立一份判定**（见下面 `applyEntriesPatch` 的口径）；
 *   · 提案 §B3.7（原子写）与 STO-01（事务原子性：写失败 ⇒ **零残留**）。
 *
 * 四条口径：
 *   ① **快照一旦发布就只读**：归档**不搬、不改、不删**本体，只在 `memory/archive/` 记一条去向
 *      （MEM-09 的"归档之后 v0 的内容哈希不许变"就是这条）。
 *   ② **发布是一个事务**：报告 → 快照 → `current` 指针 → 共享状态，四步里任何一步失败，
 *      **已落的那几个文件全部撤销**（写失败不许留下半个快照 —— STO-01 的两处故障注入钉的就是它）。
 *      次序是刻意的：**报告先写**。报告失败时一个快照都不许出现。
 *   ③ **存活集只有一份权威**：`capacityVerdict` 判合法性、算条数/字符数；本模块的 `applyEntriesPatch`
 *      只是把同一批 op 落到数组上。两者**当场对账**（条数与字符数必须逐个相等），对不上就 `E_INTERNAL`
 *      —— 两份实现分叉时必须当场炸，不许静默用错的那一份。
 *   ④ **报告是快照的投影**：`reportOf(snapshot)` 是纯函数；没有报告文件时 `report-read` 就从
 *      当前快照现算（`derived: true`），**不写盘**（它是只读 op）。
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readJsonFile, writeFileAtomic, writeJsonAtomic } from './atomic.mjs'
import { capacityVerdict, charCountOf, distributionOf, sharesOf, TYPE_IDS } from './memory.mjs'
import {
  archiveDir,
  brainError,
  isSnapshotVersion,
  nowIso,
  reportsDir,
  reportRelPath,
  snapshotsDir,
  updateStatePath,
} from './state.mjs'

/** 指针文件名（B3.6 的"符号链接式指针文件"；这里是一个只写版本号的小文件，不需要符号链接权限）。 */
export const CURRENT_POINTER = 'current'

/** 快照 schema 版本。 */
export const SNAPSHOT_SCHEMA = 1

/** 字符口径的机读声明（§B3.4 逐字；与 `FROZEN.charMetric` 同值）。 */
export const CHAR_METRIC = Object.freeze({
  unit: 'unicode-code-point',
  normalization: 'strip-bom+lf',
  scope: 'entry.text',
  schema: 1,
})

const VERSION_RE = /^v(\d+)$/

/** 字节级 sha256（与测试侧的 `sha256File` 同一口径 —— 不经过 utf8 往返）。 */
export function sha256Bytes(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** `v7` → `7`；不认的形状 ⇒ `null`。 */
export function versionNumber(version) {
  const m = VERSION_RE.exec(String(version ?? '').trim())
  return m ? Number(m[1]) : null
}

/** 下一个版本号（`current` 之后紧挨着的那一个）。 */
export function nextVersion(version) {
  const n = versionNumber(version)
  if (n === null) throw brainError('E_ARG_SCHEMA', `nextVersion：版本形状必须是 v<n>，实得 ${JSON.stringify(version)}`)
  return `v${n + 1}`
}

export const snapshotPath = (root, version) => path.join(snapshotsDir(root), `${version}.json`)
export const pointerPath = (root) => path.join(snapshotsDir(root), CURRENT_POINTER)

/**
 * 盘上现有的快照版本（**升序按数字**，`current` 指针不算一个版本）。
 *
 * ⚠️ **只认文件**：探针抓到过一次 —— 故障注入把 `v1.json` 占成**目录**之后，
 * 只按名字匹配会把那个目录也算成一个版本，于是"事务失败后快照列表没变"当场变成假的。
 * 名字像快照的东西不是快照；读面必须跟着 `isFile()` 一起判。
 */
export function listVersions(root) {
  let names = []
  try {
    names = readdirSync(snapshotsDir(root))
  } catch {
    return []
  }
  return names
    .filter((n) => /^v\d+\.json$/.test(n))
    .filter((n) => {
      try {
        return statSync(path.join(snapshotsDir(root), n)).isFile()
      } catch {
        return false
      }
    })
    .map((n) => n.slice(0, -5))
    .sort((a, b) => versionNumber(a) - versionNumber(b))
}

/** 读 `current` 指针（内容就是一个版本号）。 */
export function readCurrentVersion(root) {
  const file = pointerPath(root)
  if (!existsSync(file)) return { ok: false, code: 'E_DATA_MISSING', version: null, path: file, message: `current 指针不在：${file}` }
  const text = readFileSync(file, 'utf8').trim()
  if (!isSnapshotVersion(text)) return { ok: false, code: 'E_DATA_CORRUPT', version: null, path: file, message: `current 指针内容不是版本号：${JSON.stringify(text.slice(0, 40))}` }
  return { ok: true, code: null, version: text, path: file, message: '' }
}

/** 把 `current` 指到某个版本（**只改指针，不动快照本体**）。 */
export function writeCurrentVersion(root, version) {
  if (!isSnapshotVersion(version)) throw brainError('E_ARG_SCHEMA', `writeCurrentVersion：版本形状必须是 v<n>，实得 ${JSON.stringify(version)}`)
  const written = writeFileAtomic(pointerPath(root), `${version}\n`)
  if (!written.ok) throw brainError(written.code, `current 指针写入失败：${written.message}`)
  return { ok: true, path: written.path, version }
}

/** 读一份快照：**缺**与**坏**分得开（`E_DATA_MISSING` / `E_DATA_CORRUPT`），坏文件绝不读成空库。 */
export function readSnapshot(root, version) {
  const file = snapshotPath(root, version)
  const read = readJsonFile(file)
  if (!read.ok) return { ok: false, code: read.code, snapshot: null, path: file, message: read.message }
  const snap = read.value
  const problems = []
  if (snap === null || typeof snap !== 'object' || Array.isArray(snap)) problems.push('快照不是一个对象')
  else {
    for (const key of ['schema', 'version', 'parent_version', 'generated_at', 'common_sense_sha256', 'entries', 'distribution', 'totals', 'char_metric', 'accepted_proposal_ids', 'accepted_maintenance_ids', 'archived', 'publication_version']) {
      if (!(key in snap)) problems.push(`缺必填键 ${key}（提案 §B3.6）`)
    }
    if (!Array.isArray(snap.entries)) problems.push('entries 必须是数组')
    if (!Array.isArray(snap.distribution) || snap.distribution.length !== TYPE_IDS.length) problems.push(`distribution 必须恰 ${TYPE_IDS.length} 项`)
    if (snap.totals === null || typeof snap.totals !== 'object') problems.push('totals 必须是对象')
  }
  if (problems.length > 0) return { ok: false, code: 'E_DATA_CORRUPT', snapshot: null, path: file, message: `快照不合形状：${problems.join('；')}` }
  return { ok: true, code: null, snapshot: snap, path: file, message: '' }
}

/** 读"当前快照"（跟指针走）。指针不在 ⇒ `E_DATA_MISSING`（不许当场当空库）。 */
export function readCurrentSnapshot(root) {
  const pointer = readCurrentVersion(root)
  if (!pointer.ok) return { ok: false, code: pointer.code, snapshot: null, version: null, path: pointer.path, message: pointer.message }
  const read = readSnapshot(root, pointer.version)
  return { ...read, version: pointer.version }
}

/** 库里现在有多少条 / 多少字符（读不成 ⇒ 全 0）。 */
export function currentCounts(root) {
  const current = readCurrentSnapshot(root)
  if (!current.ok) return { ok: false, code: current.code, count: 0, chars: 0, entries: [] }
  const entries = current.snapshot.entries ?? []
  return { ok: true, code: null, count: entries.length, chars: entries.reduce((a, e) => a + charCountOf(e?.text), 0), entries }
}

// ── entry 归一（发布面）────────────────────────────────────────────────────
/**
 * 把一条 patch 里的 entry 归一成 §B3.6 的形状。
 *
 * **哪些是"必填"**：`id` / `type`（四类）/ `text` / `last_evidence_review` —— 缺一个就 `E_ARG_SCHEMA`
 * （份额重算要读 `type` 与 `last_evidence_review`，没有它们算不出全库归一）。
 * **哪些按"新条目"的默认值补齐**（并在文件头写明）：`raw:0` · `double_low_streak:0` ·
 * `is_double_low:false` · `known_from:''` · `created_at:发布时刻` · `type_changed_at:null` ·
 * `imp_share`/`fresh_share` —— 后两个**发布时重算**（MEM-05 的"存活集重算 N+1 份额"），
 * 调用方给的值只当占位。
 */
export function normalizeEntry(entry, at = nowIso()) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw brainError('E_ARG_SCHEMA', 'entry 不是对象')
  const { id, type, text } = entry
  if (typeof id !== 'string' || id === '') throw brainError('E_ARG_SCHEMA', `entry.id 必填，实得 ${JSON.stringify(id)}`)
  if (!TYPE_IDS.includes(type)) throw brainError('E_ARG_SCHEMA', `entry.type 不在四类里：${JSON.stringify(type)}（id=${id}）`)
  if (typeof text !== 'string') throw brainError('E_ARG_SCHEMA', `entry.text 必须是字符串（id=${id}）`)
  if (typeof entry.last_evidence_review !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.last_evidence_review)) {
    throw brainError('E_ARG_SCHEMA', `entry.last_evidence_review 必须是 YYYY-MM-DD（id=${id}），实得 ${JSON.stringify(entry.last_evidence_review)}`)
  }
  const raw = Number(entry.raw)
  const streak = Number(entry.double_low_streak)
  return {
    id,
    type,
    text,
    raw: Number.isFinite(raw) ? raw : 0,
    imp_share: Number.isFinite(Number(entry.imp_share)) ? Number(entry.imp_share) : 0,
    fresh_share: Number.isFinite(Number(entry.fresh_share)) ? Number(entry.fresh_share) : 0,
    double_low_streak: Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0,
    // D-B4：**发布值**。调用方没给 ⇒ 新条目就是"还没双低"（false），不在发布面重算。
    is_double_low: entry.is_double_low === true,
    last_evidence_review: entry.last_evidence_review,
    known_from: typeof entry.known_from === 'string' ? entry.known_from : '',
    created_at: typeof entry.created_at === 'string' && entry.created_at !== '' ? entry.created_at : at,
    type_changed_at: typeof entry.type_changed_at === 'string' && entry.type_changed_at !== '' ? entry.type_changed_at : null,
  }
}

/**
 * 把 C-2 的六种 op 落到数组上（**返回新数组，不改入参**）。
 *
 * ⚠️ 合法性由 `capacityVerdict` 判 —— 调用方**必须先**拿到它的 `ok:true` 再调这里；
 * 这里只处理"已经合法"的那一批形状，形状不对照样 `E_OP_INVALID`（与权威同码）。
 * 落地之后 `assertPatchMatchesVerdict()` 把两份的条数/字符数对一次账。
 */
export function applyEntriesPatch(entries, ops) {
  const list = (Array.isArray(entries) ? entries : []).map((e) => ({ ...e }))
  const indexOf = (id) => list.findIndex((e) => e?.id === id)
  for (const op of Array.isArray(ops) ? ops : []) {
    if (op === null || typeof op !== 'object') throw brainError('E_OP_INVALID', 'op 不是对象')
    switch (op.kind) {
      case 'add':
        if (indexOf(op.entry?.id) >= 0) throw brainError('E_OP_INVALID', `add 的 id 已存在：${op.entry?.id}`)
        list.push({ ...op.entry })
        break
      case 'modify': {
        const i = indexOf(op.id)
        if (i < 0) throw brainError('E_OP_INVALID', `modify 的 id 不存在：${op.id}`)
        list[i] = { ...op.entry }
        break
      }
      case 'retire':
      case 'cull': {
        const i = indexOf(op.id)
        if (i < 0) throw brainError('E_OP_INVALID', `${op.kind} 的 id 不存在：${JSON.stringify(op.id)}`)
        list.splice(i, 1)
        break
      }
      case 'merge': {
        const merged = new Set(op.ids ?? [])
        for (const id of merged) if (indexOf(id) < 0) throw brainError('E_OP_INVALID', `merge 的 id 不存在：${id}`)
        const survivors = list.filter((e) => !merged.has(e.id))
        list.length = 0
        list.push(...survivors)
        if (op.entry !== null && op.entry !== undefined) list.push({ ...op.entry })
        break
      }
      case 'retag': {
        const i = indexOf(op.id)
        if (i < 0) throw brainError('E_OP_INVALID', `retag 的 id 不存在：${JSON.stringify(op.id)}`)
        list[i] = { ...list[i], type: op.typeId }
        break
      }
      default:
        throw brainError('E_OP_INVALID', `未知 op kind：${JSON.stringify(op?.kind)}`)
    }
  }
  return list
}

/** 与 `capacityVerdict` 对账：分叉就当场 `E_INTERNAL`，不许静默用错的那一份。 */
export function assertPatchMatchesVerdict(patched, verdict) {
  const count = patched.length
  const chars = patched.reduce((a, e) => a + charCountOf(e?.text), 0)
  if (count !== verdict?.count || chars !== verdict?.chars) {
    throw brainError(
      'E_INTERNAL',
      `存活集与 capacityVerdict 对不上：本模块 ${count} 条/${chars} 字符，权威 ${verdict?.count} 条/${verdict?.chars} 字符 —— 两份实现分叉了`,
    )
  }
  return true
}

// ── 发布 ───────────────────────────────────────────────────────────────────
/**
 * 造一份快照对象（**纯函数**；不写盘）。
 *
 * `entries` 传进来时是"最终存活集"（已经过 `capacityVerdict` + `applyEntriesPatch`），
 * 这里做三件事：逐条归一 · 重算全库份额（MEM-05 的 N+1 重算）· 算四类分布与总计。
 */
export function buildSnapshot(spec = {}) {
  const {
    version,
    parentVersion = null,
    entries = [],
    commonSenseSha256 = null,
    acceptedProposalIds = [],
    acceptedMaintenanceIds = [],
    archived = [],
    generatedAt = nowIso(),
    shares = null,
  } = spec
  if (!isSnapshotVersion(version)) throw brainError('E_ARG_SCHEMA', `buildSnapshot：version 必须是 v<n>，实得 ${JSON.stringify(version)}`)
  const normalized = entries.map((e) => normalizeEntry(e, generatedAt))
  const shareTable = shares ?? sharesOf(normalized)
  const published = normalized.map((e) => ({
    ...e,
    imp_share: Number(shareTable.imp?.get?.(e.id) ?? 0),
    fresh_share: Number(shareTable.fresh?.get?.(e.id) ?? 0),
  }))
  const distribution = distributionOf(published)
  const totals = {
    count: distribution.reduce((a, d) => a + d.count, 0),
    chars: distribution.reduce((a, d) => a + d.chars, 0),
  }
  return {
    schema: SNAPSHOT_SCHEMA,
    version,
    parent_version: parentVersion,
    generated_at: generatedAt,
    common_sense_sha256: commonSenseSha256,
    entries: published,
    distribution,
    totals,
    char_metric: { ...CHAR_METRIC },
    accepted_proposal_ids: [...acceptedProposalIds],
    accepted_maintenance_ids: [...acceptedMaintenanceIds],
    archived: [...archived],
    publication_version: versionNumber(version),
  }
}

const mustWriteJson = (file, obj, what) => {
  const written = writeJsonAtomic(file, obj)
  if (!written.ok) throw brainError(written.code, `${what}写入失败：${written.message}`, { path: file })
  return written
}

/**
 * 发布一个更新 —— **事务**：报告 → 快照 → `current` 指针 → 共享状态。
 *
 * 任何一步失败：**已落的那几个文件全部撤销**（报告/快照删掉、指针恢复旧内容），
 * 调用方拿到一个错误码，盘上不留半个快照。次序是刻意的：**报告先写**，于是"报告写不动"这一格
 * 一个快照都不会出现（STO-01 的注入②钉的就是它）。
 */
export function publishUpdate(root, spec = {}) {
  const { snapshot, report, day, nextState } = spec
  const snapshotFile = snapshotPath(root, snapshot.version)
  const reportFile = path.join(reportsDir(root), `${day}.json`)
  const pointer = pointerPath(root)
  const stateFile = updateStatePath(root, day)

  const created = []
  const restores = []
  const rollback = () => {
    for (const file of [...created].reverse()) {
      try {
        unlinkSync(file)
      } catch {
        // 故障注入时那个路径本来就是目录（占位）；删不掉不是新问题，如实留着
      }
    }
    for (const undo of [...restores].reverse()) {
      try {
        undo()
      } catch {
        // 回滚尽力而为：失败也把原错误抛出去，别用一个回滚失败盖掉根因
      }
    }
  }

  try {
    mustWriteJson(reportFile, report, '记忆更新报告')
    created.push(reportFile)

    mustWriteJson(snapshotFile, snapshot, '快照')
    created.push(snapshotFile)

    const previousPointer = existsSync(pointer) ? readFileSync(pointer, 'utf8') : null
    const pointerWrite = writeFileAtomic(pointer, `${snapshot.version}\n`)
    if (!pointerWrite.ok) throw brainError(pointerWrite.code, `current 指针写入失败：${pointerWrite.message}`, { path: pointer })
    restores.push(() => {
      if (previousPointer === null) unlinkSync(pointer)
      else writeFileSync(pointer, previousPointer, 'utf8')
    })

    mustWriteJson(stateFile, nextState, '共享更新状态')
    return {
      ok: true,
      code: null,
      snapshot_path: snapshotFile,
      report_path: reportFile,
      pointer_path: pointer,
      state_path: stateFile,
      created: [...created, pointer, stateFile],
    }
  } catch (err) {
    rollback()
    throw err
  }
}

// ── 归档（快照本体只读）────────────────────────────────────────────────────
/**
 * 归档一个版本：在 `memory/archive/` 记一条**去向**（版本 / 原因 / 本体哈希 / 条数）。
 * **本体一个字都不动** —— 不搬、不改、不删（MEM-09 的"归档只读"）。
 */
export function archiveSnapshot(root, version, reason, at = nowIso()) {
  const read = readSnapshot(root, version)
  if (!read.ok) return { ok: false, code: read.code, archive_path: null, message: read.message }
  if (typeof reason !== 'string' || reason.trim() === '') return { ok: false, code: 'E_ARG_SCHEMA', archive_path: null, message: '归档必须给原因（reason 非空）' }
  const bytes = readFileSync(read.path)
  const stamp = at.replace(/[:.]/g, '-')
  const file = path.join(archiveDir(root), `${version}-${stamp}.json`)
  const record = {
    schema: 1,
    version,
    reason,
    archived_at: at,
    snapshot_path: read.path,
    snapshot_sha256: sha256Bytes(bytes),
    snapshot_bytes: bytes.length,
    entry_count: Array.isArray(read.snapshot.entries) ? read.snapshot.entries.length : 0,
    publication_version: read.snapshot.publication_version ?? null,
  }
  const written = writeJsonAtomic(file, record)
  if (!written.ok) return { ok: false, code: written.code, archive_path: file, message: written.message }
  return { ok: true, code: null, archive_path: file, record, message: '' }
}

// ── 报告（快照的只读投影）──────────────────────────────────────────────────
/**
 * 记忆更新报告（§B3.4：`<dataRoot>/reports/memory-update/<day>.json` 是**机器口径的唯一权威**）。
 * 它是快照的一个投影 —— 四类分布 / 总计 / 字符口径三样与快照严格同源。
 */
export function reportOf(snapshot, spec = {}) {
  const { day, baseSnapshot = snapshot?.parent_version ?? null, maintenanceDecisions = [], generatedAt = nowIso(), derived = false } = spec
  const distribution = snapshot?.distribution ?? distributionOf([])
  const totals = snapshot?.totals ?? { count: 0, chars: 0 }
  return {
    schema: 1,
    day,
    generated_at: generatedAt,
    snapshot: snapshot?.version ?? null,
    base_snapshot: baseSnapshot,
    distribution,
    totals,
    char_metric: { ...(snapshot?.char_metric ?? CHAR_METRIC) },
    accepted_proposal_ids: [...(snapshot?.accepted_proposal_ids ?? [])],
    accepted_maintenance_ids: [...(snapshot?.accepted_maintenance_ids ?? [])],
    maintenance_decisions: [...maintenanceDecisions],
    common_sense_sha256: snapshot?.common_sense_sha256 ?? null,
    report: { memory_update: reportRelPath(day) },
    derived,
  }
}

/**
 * 读某一天的记忆更新报告（`report-read` 的实现面）。
 *
 * 三级：
 *   ① 报告文件在盘上 ⇒ 读它（坏 ⇒ `E_DATA_CORRUPT`）；
 *   ② 不在，但**有已发布快照** ⇒ 从当前快照现算（`derived:true`，**不写盘**）；
 *   ③ 连快照都没有（根还没 init）⇒ 空库投影（四类全 0）。
 *
 * ⚠️ ②③ 是刻意的：`report-read` 是**只读 op**，而"今天还没判决"是完全正常的一天。
 * 报告文件本身由 `judge-commit` 落盘（那一笔才是权威）。
 */
export function readReport(root, day) {
  const file = path.join(reportsDir(root), `${day}.json`)
  if (existsSync(file)) {
    const read = readJsonFile(file)
    if (!read.ok) return { ok: false, code: read.code, report: null, path: file, message: read.message }
    const report = read.value
    if (report === null || typeof report !== 'object' || !Array.isArray(report.distribution) || report.distribution.length !== TYPE_IDS.length) {
      return { ok: false, code: 'E_DATA_CORRUPT', report: null, path: file, message: `报告不合形状（distribution 必须恰 ${TYPE_IDS.length} 项）：${file}` }
    }
    return { ok: true, code: null, report, path: file, message: '' }
  }
  const current = readCurrentSnapshot(root)
  if (!current.ok) {
    const empty = reportOf(null, { day, derived: true })
    return { ok: true, code: null, report: { ...empty, snapshot: null }, path: file, message: '根上还没有快照 ⇒ 空库投影（只读、不写盘）' }
  }
  return { ok: true, code: null, report: reportOf(current.snapshot, { day, derived: true }), path: file, message: '报告文件不在 ⇒ 从当前快照现算（不写盘）' }
}

/** 报告是否真的落过盘（探针用；`derived` 的读数靠它对照）。 */
export function reportFileExists(root, day) {
  return existsSync(path.join(reportsDir(root), `${day}.json`))
}
