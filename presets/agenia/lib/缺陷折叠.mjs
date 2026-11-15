#!/usr/bin/env node
/**
 * **缺陷册的折叠 —— 全仓唯一实现**（契约 §4.1 / 0012 §②-10）。
 *
 * 病（0012 §①）：缺陷台账原来是**一个 397 KB 的 `ledger.json`**，9 个文件 / 20 处各读一遍它的
 * `entries`。谁想"看看这条票现在什么状态"，就得自己按 `disposition` 筛一遍 —— 那等于**每个读者各写一份折叠**。
 * 两份折叠一起错的时候谁也看不见。所以这里只做一件事，其余地方一律调它：
 *
 *   `账本/缺陷/<YYYY-MM-DD>.json`（一天一个事件流，`registered` / `assessed` / `disposed`）
 *        ──折叠──▶  每条票的**现状**（`states[]`，按 id 升序）
 *
 * 折叠的口径（契约 §3.1 / §4.1）：
 *   · `phenomenon` / `entry_kind` / `registered_at` 取**最后一条** `registered`（重开一次就换新现象）；
 *   · `assessed` 取**最后一条** `assessed`（`verdict` 许 `null`：那是"这一格没记"，不是 `unknown`）；
 *   · `disposition` 取**最后一条** `disposed` 的原件（`.reason` 逐字 —— 读者不许自己解释它）；
 *   · `chain` 由那条 `disposed` 的三格派生：`构案` → `scheme` · `判假` → `judged_false` · `历史` → `legacy`；
 *   · **只追加**机器判得了的那一半：同一条票两个 `disposed` 而中间没有新的 `registered` ⇒ `BUG-FOLD-CONFLICT`。
 *     「昨天那份文件今天有没有被改过」没有历史可比，本库**不假装**判得了（契约 §3.1 末条）。
 *
 * 判词码（契约 §9.1）：`BUG-EVENT-SHAPE`（点名文件 + seq + 哪一格）· `BUG-FOLD-CONFLICT`（id + 两个 seq）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/** 事件流的三个 kind（闭集，契约 §3.1）。 */
export const FOLD_KINDS = Object.freeze(['registered', 'assessed', 'disposed'])
/** 缺陷册的相对位置（相对 `<root>`）。 */
export const BUG_BOOK_REL = '账本/缺陷'
/** 一天一个 JSON 的文件名形状。 */
export const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.json$/
/** 三个闭集（与 `presets/agenia/lib/bug-ledger.mjs` 同义；这里只用来判形状，不引它的实现）。 */
const ENTRY_KINDS = Object.freeze(['bug', 'observation'])
const VERDICTS = Object.freeze(['true', 'false', 'duplicate', 'unknown'])
const DISPOSITIONS = Object.freeze(['adopted', 'rejected', 'deferred'])
/** `disposed` 的三种记账（至多一格，契约 §3.2）。 */
const DISPOSED_REFS = Object.freeze(['构案', '判假', '历史'])

const problem = (code, message, extra = {}) => ({ code, message, ...extra })
const posix = (p) => String(p).replace(/\\/g, '/')
const filled = (v) => typeof v === 'string' && v.trim() !== ''

/** `at` 能不能解析（ISO 8601；`Date.parse` 认不出来的就是"没记"）。 */
function atOk(value) {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value))
}

function listDir(dir) {
  try {
    return readdirSync(dir).sort()
  } catch {
    return []
  }
}

function isDir(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/**
 * 扫 `账本/缺陷/*.json`（**只读**）。
 *
 * @returns {{ok:boolean, days:string[], files:string[], events:number, problems:Array<object>,
 *            dayEvents:Array<{day:string, file:string, events:Array<object>}>}}
 */
export function readDayFiles({ root }) {
  const dir = path.join(root, ...BUG_BOOK_REL.split('/'))
  const problems = []
  const days = []
  const files = []
  const dayEvents = []
  if (!isDir(dir)) {
    return { ok: false, days, files, events: 0, dayEvents, problems }
  }
  for (const name of listDir(dir)) {
    if (!DAY_FILE.test(name)) continue
    const rel = `${BUG_BOOK_REL}/${name}`
    const day = name.slice(0, -'.json'.length)
    files.push(rel)
    let json = null
    try {
      json = JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
    } catch (err) {
      problems.push(problem('BUG-EVENT-SHAPE', `${rel} 解析不了（${err?.name ?? 'Error'}）—— 一天一个 JSON（契约 §3.1）`, { file: rel }))
      continue
    }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
      problems.push(problem('BUG-EVENT-SHAPE', `${rel} 不是一个对象 —— 形状是 \`{schema, day, events}\`（契约 §3.1）`, { file: rel }))
      continue
    }
    if (json.day !== day) {
      problems.push(problem('BUG-EVENT-SHAPE', `${rel} 的 \`day\` 是 ${JSON.stringify(json.day)}，与文件名 ${JSON.stringify(day)} 不同 —— 一天一个文件（契约 §3.1）`, { file: rel }))
    }
    const events = Array.isArray(json.events) ? json.events : null
    if (events === null) {
      problems.push(problem('BUG-EVENT-SHAPE', `${rel} 没有 \`events\` 数组（契约 §3.1）`, { file: rel }))
      continue
    }
    days.push(day)
    dayEvents.push({ day, file: rel, events })
  }
  return { ok: problems.length === 0, days, files, events: dayEvents.reduce((n, d) => n + d.events.length, 0), dayEvents, problems }
}

/**
 * 折叠缺陷册（契约 §4.1）—— **唯一实现**。
 *
 * @returns {{ok:boolean, states:Array<object>, problems:Array<object>}}
 */
export function foldBugBook({ root }) {
  const read = readDayFiles({ root })
  const problems = [...read.problems]
  /** id → 累积状态 */
  const byId = new Map()
  for (const { day, file, events } of read.dayEvents) {
    let lastSeq = null
    for (const event of events) {
      const where = `${file}#${event?.seq ?? '?'}`
      const shape = (slot, why) => problems.push(problem('BUG-EVENT-SHAPE', `${where} 的 \`${slot}\` ${why}（契约 §3.1）`, { file, seq: event?.seq ?? null, slot }))
      if (event === null || typeof event !== 'object' || Array.isArray(event)) { shape('event', '不是一个对象'); continue }
      const seq = event.seq
      if (!Number.isInteger(seq) || seq < 1) { shape('seq', `必须是 ≥1 的整数，实得 ${JSON.stringify(seq)}`); continue }
      if (lastSeq !== null && seq <= lastSeq) { shape('seq', `必须严格递增（上一条是 ${lastSeq}）`); continue }
      if (lastSeq === null && seq !== 1) { shape('seq', `必须从 1 开始（实得 ${seq}）`); continue }
      lastSeq = seq
      const kind = event.kind
      if (!FOLD_KINDS.includes(kind)) { shape('kind', `只能是 ${FOLD_KINDS.join(' / ')}，实得 ${JSON.stringify(kind)}`); continue }
      const id = event.id
      if (!filled(id)) { shape('id', '不能是空的'); continue }
      if (!atOk(event.at)) { shape('at', `解析不了（实得 ${JSON.stringify(event.at)}）`); continue }
      let state = byId.get(id)
      if (state === undefined) {
        state = {
          id, day, phenomenon: null, entry_kind: null, registered_at: null, assessed: null, disposition: null,
          chain: { kind: null }, events: 0, last_disposed_seq: null, seqs: [],
          /**
           * `registered` / `assessed` 的**原件**（0022 §②-3 的写面把 `how_seen` / `evidence` /
           * `recipe` / `batch` 等字段放进 `registered` 事件的 payload；折叠只负责把它逐字带出来，
           * 读面 `ledgerFromBugBook` 从这一份还原条目 —— 不许在别处再按事件筛一遍）。
           */
          registered_payload: null,
          assessed_payload: null,
        }
        byId.set(id, state)
      }
      state.events += 1
      state.seqs.push({ day, seq })
      if (kind === 'registered') {
        if (!ENTRY_KINDS.includes(event.entry_kind)) shape('entry_kind', `只能是 ${ENTRY_KINDS.join(' / ')}，实得 ${JSON.stringify(event.entry_kind)}`)
        if (!filled(event.phenomenon)) shape('phenomenon', '不能是空的')
        state.phenomenon = filled(event.phenomenon) ? event.phenomenon : state.phenomenon
        state.entry_kind = ENTRY_KINDS.includes(event.entry_kind) ? event.entry_kind : state.entry_kind
        state.registered_at = event.at
        state.day = day
        state.registered_payload = { ...event }
        // 重开：上一次的 disposed 被一条新的 registered 截断，之后还能再处置一次（契约 §3.1）
        state.last_disposed_seq = null
        continue
      }
      if (kind === 'assessed') {
        const verdict = event.verdict === undefined ? null : event.verdict
        if (!(verdict === null || VERDICTS.includes(verdict))) shape('verdict', `只能是 ${VERDICTS.join(' / ')} 或 null（"这一格没记"），实得 ${JSON.stringify(verdict)}`)
        state.assessed = {
          verdict,
          severity_line: filled(event.severity_line) ? event.severity_line : null,
          by_role: filled(event.by_role) ? event.by_role : null,
          at: event.at,
        }
        state.assessed_payload = { ...event }
        continue
      }
      // disposed
      const d = event.disposition
      let shapeOk = true
      if (d === null || typeof d !== 'object' || Array.isArray(d)) { shape('disposition', '不是 `{value, reason, by, at}`（契约 §3.1）'); shapeOk = false } else {
        if (!DISPOSITIONS.includes(d.value)) { shape('disposition.value', `只能是 ${DISPOSITIONS.join(' / ')}，实得 ${JSON.stringify(d.value)}`); shapeOk = false }
        if (!filled(d.reason)) { shape('disposition.reason', '不能是空的'); shapeOk = false }
        if (!filled(d.by)) { shape('disposition.by', '不能是空的'); shapeOk = false }
        if (!atOk(d.at)) { shape('disposition.at', `解析不了（实得 ${JSON.stringify(d.at)}）`); shapeOk = false }
      }
      const present = DISPOSED_REFS.filter((k) => filled(event[k]))
      if (present.length > 1) { shape('disposed', `里 \`${present.join('` / `')}\` 同时非空 —— 三格至多一格（契约 §3.2）`); shapeOk = false }
      if (state.last_disposed_seq !== null) {
        problems.push(problem('BUG-FOLD-CONFLICT', `${id} 有两个 \`disposed\`（${file}#${state.last_disposed_seq} 与 ${where}）`
          + '而中间没有新的 `registered` —— 事件流只追加，重开要先登记（契约 §3.1）', { id, seqs: [state.last_disposed_seq, seq] }))
        continue
      }
      if (!shapeOk) continue
      state.disposition = { value: d.value, reason: d.reason, by: d.by, at: d.at }
      state.last_disposed_seq = seq
      const scheme = filled(event['构案']) ? event['构案'] : null
      const judgedFalse = filled(event['判假']) ? event['判假'] : null
      const legacy = filled(event['历史']) ? event['历史'] : null
      state.chain = scheme !== null ? { kind: 'scheme', ref: scheme }
        : judgedFalse !== null ? { kind: 'judged_false', ref: judgedFalse }
          : legacy !== null ? { kind: 'legacy', ref: legacy }
            : { kind: null }
    }
  }
  const states = [...byId.values()]
    .map(({ last_disposed_seq: _drop, ...rest }) => rest)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { ok: problems.length === 0, states, problems }
}

/** 有没有缺陷册（`账本/缺陷/` 在不在）—— 迁移没做完的工区靠它答。 */
export function bugBookPresent({ root }) {
  return existsSync(path.join(root, ...BUG_BOOK_REL.split('/')))
}

/** 一天的文件名（写手用：`<root>/账本/缺陷/<day>.json`）。 */
export function dayFileOf(root, day) {
  return path.join(root, ...BUG_BOOK_REL.split('/'), `${day}.json`)
}

export { posix as relPosixPosix }
// 依据: 0012
