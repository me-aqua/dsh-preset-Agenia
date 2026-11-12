/**
 * **决议账本夹具与量具**（`DEC-01`…`DEC-08` 共用）。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-构案.md`（下称「契约」）。**这里是测试侧唯一的夹具/量具出口**：
 * 每一格都从这同一份里造树、跑工具、读 JSON —— 八格各自的刀（只改一处）因此可以互相比对。
 *
 * 🔴 三条纪律：
 *   ① **不重复实现被测的判词**：本文件只负责"造树 / 跑命令 / 读 JSON / 比码集"。
 *      头块怎么解析、指针怎么查、INDEX 怎么派生，全在 `.tools/census.mjs` 与 `.tools/决议-check.mjs` 里
 *      —— 测试侧再写一份解析器，两边一起错的时候谁也看不见。
 *   ② **夹具全部落在运行根里**（`<run-root>/decision-ledger/<case>-<tag>/`），**不碰** 仓库的 `决议/`。
 *   ③ **期望值是手写的**（取自契约的码表与样本表），不从工具的输出去反推。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from './env.mjs'
import { runRoot } from './evidence.mjs'

/** 与契约 §2 逐字一致：七个键（次序即规范次序；解析口径不判次序）。 */
export const DECISION_KEYS = Object.freeze(['状态', '主题', '日期', '拍板人', '原话', 'supersedes', 'superseded_by'])

/** 契约 §2.3：构案正文的七节名（**只判在不在**）。 */
export const BODY_SECTIONS = Object.freeze(['背景', '决定', '复用什么', '不复用什么', '新增什么', '公共化时点', '反悔条件'])

/** 契约 §4.1 的生成标记（判据只认这两个字面量，见 `INDEX-MARKER-NEEDLES`）。 */
export const GEN_MARKER = '<!-- 生成物 · 由 node .tools/census.mjs --write-index 生成 · 手改由 node .tools/决议-check.mjs 对账 -->'
export const INDEX_MARKER_NEEDLES = Object.freeze(['生成物', 'census.mjs'])

/** 两个被测工具的落点（契约 §3.3 / §5.1）。 */
export const CENSUS = path.join(PATHS.repo, '.tools', 'census.mjs')
export const CHECK = path.join(PATHS.repo, '.tools', '决议-check.mjs')

/** 三份岗位说明书要加的**那一行**（任务书 §5 的原话，逐字；`design.md` 不在此列 —— 方案岗搁置）。 */
export const ROLE_CLAUSES = Object.freeze([
  { role: 'test', file: 'presets/agenia/team/test.md', clause: '无构案编号的新机制票不接活' },
  { role: 'dev', file: 'presets/agenia/team/dev.md', clause: '卡首无编号退回；做不到回来 supersede，不许静默换路' },
  { role: 'review', file: 'presets/agenia/team/review.md', clause: '三段核 + 跑 census' },
])
/** 方案岗：`design.md` 里**一个本族字面量都不许出现**（老板 2026-11-12 11:39：方案岗搁置）。 */
export const DESIGN_FILE = 'presets/agenia/team/design.md'
export const DESIGN_FORBIDDEN = Object.freeze(['构案', '决议', 'census', 'supersede'])

// ── 夹具正文 ────────────────────────────────────────────────────────────

/**
 * 一份决议文件的正文。`header` 缺省给一份合法头块；`drop` 删掉某个键（造 `DEC-MISSING-KEY`）；
 * `headerLines` 直接给整段（造重复键 / 未知键 / 坏行）。
 */
export function decisionText({ series = '构案', id, title, header = {}, drop = [], headerLines = null, body = null, reversal = undefined, h1 = null }) {
  const lines = []
  if (headerLines !== null) lines.push(...headerLines)
  else {
    const merged = {
      '状态': '生效',
      '主题': title,
      '日期': '2026-11-12',
      '拍板人': '老板',
      '原话': '「账本要能自己长」',
      'supersedes': '—',
      'superseded_by': '—',
      ...header,
    }
    for (const key of DECISION_KEYS) {
      if (drop.includes(key)) continue
      lines.push(`${key}: ${merged[key]}`)
    }
  }
  return [`${h1 ?? `# ${series} ${id} · ${title}`}`, '', ...lines, '', body ?? (series === '构案' ? defaultBody(reversal) : '（正文）'), ''].join('\n')
}

/** 构案正文：七节 + ⑦ 表（四列，逐字；契约 §2.4）。`reversal === null` ⇒ 不写表。 */
export function defaultBody(reversal) {
  const rows = reversal === undefined
    ? [{ id: 'RC-1', condition: '同概念第 3 处实现', action: 'supersede 到新编号', status: '未触发' },
      { id: 'RC-2', condition: '两个岗位各自实现同一件事', action: '打回并抽公共件', status: '未触发' }]
    : reversal
  const out = ['## ① 背景', '这一份是夹具。', '', '## ② 决定', '照契约写。', '',
    '## ③ 复用什么', '没有现成的。', '', '## ④ 不复用什么', '不新造一套账。', '',
    '## ⑤ 新增什么', '三件。', '', '## ⑥ 公共化时点', '第三次出现时。', '', '## ⑦ 反悔条件']
  if (rows !== null) {
    out.push('| 编号 | 条件 | 触发时动作 | 状态 |', '| --- | --- | --- | --- |')
    for (const r of rows) out.push(`| ${r.id} | ${r.condition} | ${r.action} | ${r.status} |`)
  }
  return out.join('\n')
}

/** 概念表（一张表；契约 §3.1）。`rows = [{concept, probe, scan, owner}]`。 */
export function conceptTableText(rows) {
  return [
    '<!-- 概念表：census 的唯一概念源；改这一行 = 改 census 的口径 -->',
    '# 概念表',
    '',
    '| 概念 | 实现探针 | 扫描 | 归属 |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.concept} | ${r.probe} | ${r.scan} | ${r.owner} |`),
    '',
  ].join('\n')
}

/** INDEX 页（契约 §4.2）。`rows = [{concept, owner, census, decision}]`；`marker: false` ⇒ 删掉生成标记。 */
export function indexText(rows, { marker = true } = {}) {
  const head = marker ? [GEN_MARKER, ''] : []
  return [
    ...head,
    '# 构案录（现状层）',
    '',
    '| 概念 | 归属 | census | 构案 |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.concept} | ${r.owner} | ${r.census} | ${r.decision} |`),
    '',
  ].join('\n')
}

/** 派工卡（契约 §6.1）。`ticket_kind === null` ⇒ 不写 `票类` 那一行。 */
export function cardText({ ticket_kind, decision }) {
  const lines = ['# 派工卡 · 测试岗', '']
  if (ticket_kind !== null) lines.push(`票类: ${ticket_kind}`)
  if (decision !== undefined) lines.push(`构案: ${decision}`)
  return `${lines.join('\n')}\n`
}

// ── 造树 ────────────────────────────────────────────────────────────────

/** `good` 树的三份常量（契约 §8.1 的第一段）。判据的期望值取自这里 —— **不从工具输出反推**。 */
export const GOOD_CONCEPTS = Object.freeze([
  { concept: '决议账本三册制', probe: 'LEDGER_PROBE_A', scan: 'src/**/*.mjs', owner: '组长' },
  { concept: '双写者', probe: 'LEDGER_PROBE_B', scan: 'src/**/*.mjs', owner: '实现岗' },
])
export const GOOD_IMPLS = Object.freeze([
  { rel: 'src/a1.mjs', needle: 'LEDGER_PROBE_A' },
  { rel: 'src/a2.mjs', needle: 'LEDGER_PROBE_A' },
  { rel: 'src/b1.mjs', needle: 'LEDGER_PROBE_B' },
])
export const GOOD_INDEX = Object.freeze({
  rows: [
    { concept: '决议账本三册制', owner: '组长', census: 2, decision: '0001' },
    { concept: '双写者', owner: '实现岗', census: 1, decision: '—' },
  ],
})
/** `good` 树的 0001（生效构案）；`over` 覆盖头块字段。 */
export function goodDecision0001(over = {}) {
  return { series: '构案', id: '0001', title: '决议账本三册制', header: { 主题: '决议账本三册制', ...over } }
}
/** `good` 树的产品决议（正文自由，只判头块）。 */
export function goodDecisionProduct0001(over = {}) {
  return { series: '产品', id: '0001', title: '产品口径样张', header: { 主题: '产品口径样张', ...over } }
}
/** 造一棵带缺省 `good` 内容的树（`decisions` 给了就**整个替换**，不合并 —— 刀必须只改一处）。 */
export function goodLedger(spec = {}) {
  const {
    caseId, tag, decisions = [goodDecision0001(), goodDecisionProduct0001()],
    concepts = [...GOOD_CONCEPTS], impls = [...GOOD_IMPLS], index = { rows: GOOD_INDEX.rows.map((r) => ({ ...r })) },
    card = null, extraFiles = [],
  } = spec
  return buildScene({ caseId, tag, decisions, concepts, impls, index, card, extraFiles })
}

/**
 * 这一格的夹具根（**每次清空**：同一个运行根重跑时不许留着上一次的文件）。
 *
 * 🔴 删除前两道闸，缺一不删（契约 §2.5 · `ENV-02` 的 `DELETE-NO-MARKER`）：
 *   ① 运行根必须有 `.agenia-test-root` marker（`support/root-guard.mjs` 的 `TEST_ROOT_MARKER`）——
 *      没有 marker 的目录**不是**测试运行根，一个字节都不许动；
 *   ② 解析后的绝对路径必须在运行根**之下**（不是前缀相等：`...\run` 与 `...\run-evil` 是两棵树）。
 */
export function sceneRoot(caseId, tag) {
  const base = path.resolve(runRoot())
  const marker = path.join(base, '.agenia-test-root')
  if (!existsSync(marker)) {
    throw new Error(`拒绝清空：${base} 没有运行根 marker（${path.basename(marker)}）—— 不是测试运行根，一个字节都不动`)
  }
  const resolved = path.resolve(base, 'decision-ledger', `${String(caseId).toLowerCase()}-${tag}`)
  if (resolved !== path.join(base, 'decision-ledger', `${String(caseId).toLowerCase()}-${tag}`)) {
    throw new Error(`夹具根不是纯拼出来的：${resolved}`)
  }
  if (!resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`夹具根跑到运行根之外了：${resolved}`)
  }
  rmSync(resolved, { recursive: true, force: true })
  mkdirSync(resolved, { recursive: true })
  return resolved
}

/**
 * 造一棵决议树。
 *
 * @param {{caseId: string, tag: string, decisions?: Array<object>, concepts?: Array<object>|null,
 *          impls?: Array<{rel: string, needle: string, times?: number}>,
 *          index?: {rows: Array<object>, marker?: boolean}|null,
 *          card?: {ticket_kind: string|null, decision?: string}|null}} spec
 */
export function buildScene({ caseId, tag, decisions = [], concepts = [], impls = [], index = null, card = null, extraFiles = [] }) {
  const root = sceneRoot(caseId, tag)
  const writes = []
  const write = (rel, text) => {
    const file = path.join(root, rel)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text, 'utf8')
    writes.push(rel.replace(/\\/g, '/'))
    return file
  }
  if (concepts !== null) write('决议/概念表.md', conceptTableText(concepts))
  for (const d of decisions) {
    const file = `${d.series ?? '构案'}/${d.id}-${d.title}.md`
    write(`决议/${file}`, decisionText(d))
  }
  for (const impl of impls) {
    const times = impl.times ?? 1
    const text = `${(impl.prefix ?? '// 夹具：这一份是实现\n')}${Array.from({ length: times }, () => `const needle = '${impl.needle}'\n`).join('')}`
    write(impl.rel, text)
  }
  if (index !== null) write('决议/INDEX.md', indexText(index.rows, index))
  if (card !== null) write('card.md', cardText(card))
  for (const extra of extraFiles) write(extra.rel, extra.text)
  return { root, writes, files: writes.map((rel) => path.join(root, rel)) }
}

// ── 跑工具 ──────────────────────────────────────────────────────────────

/** 跑一个 node 子进程（cwd 固定仓库根；临时件落运行根，由入口的 ENV 管）。 */
export function runNode(argv) {
  const r = spawnSync(process.execPath, argv, { cwd: PATHS.repo, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return {
    argv,
    exit: r.status,
    signal: r.signal ?? null,
    spawn_error: r.error === undefined ? null : String(r.error?.code ?? r.error),
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  }
}

/** 跑 `census`（缺口径：`--json` 永远加）。 */
export function runCensus(root, extra = []) {
  return summarize(runNode([CENSUS, `--root=${root}`, '--json', ...extra]), `census ${extra.join(' ')}`.trim())
}

/** 跑 `census` 的**人读输出**（不加 `--json`）—— 那一页是老板读的那一页，判据也要看它一眼。 */
export function runCensusText(root, extra = []) {
  const r = runNode([CENSUS, `--root=${root}`, ...extra])
  return {
    label: `census(text) ${extra.join(' ')}`.trim(),
    exit: r.exit,
    spawn_error: r.spawn_error,
    stdout: r.stdout,
    stderr: r.stderr,
    lines: String(r.stdout).split(/\r?\n/),
  }
}

/** 跑 `决议-check`（缺省 `--op check`；`extra` 可给 `--op=gate2-card --card=…`）。 */
export function runCheck(root, extra = []) {
  return summarize(runNode([CHECK, `--root=${root}`, '--json', ...extra]), `check ${extra.join(' ')}`.trim())
}

/** 子进程读数归一：退出码 / 原始尾部 / 解析出来的 JSON（解析不了 ⇒ `json: null` + `json_error`）。 */
export function summarize(run, label) {
  let json = null
  let jsonError = null
  const text = String(run.stdout).trim()
  if (text !== '') {
    try {
      json = JSON.parse(text)
    } catch (err) {
      jsonError = `${err.name}: ${String(err.message).slice(0, 160)}`
    }
  } else if (run.exit === 0) {
    jsonError = 'stdout 是空的（契约要求 --json 时 stdout 只有 JSON）'
  }
  return {
    label,
    exit: run.exit,
    spawn_error: run.spawn_error,
    stderr_head: String(run.stderr).trim().split(/\r?\n/).slice(0, 4).join('\n').slice(0, 600),
    stdout_head: text.split(/\r?\n/).slice(0, 4).join('\n').slice(0, 600),
    json,
    json_error: jsonError,
  }
}

/** 码集（排序后，便于"精确相等"）。 */
export function codesOf(json) {
  return [...new Set((json?.problems ?? []).map((p) => String(p.code ?? '?')))].sort()
}

/** 报文里点名了哪些字段/键（判"点名"那一面用）。 */
export function messagesOf(json) {
  return (json?.problems ?? []).map((p) => String(p.message ?? ''))
}

/**
 * 断言：这一跑**成功解析出 JSON**，且**码集与期望精确相等**（多一个少一个都红）。
 * `codes` 用 `[]` = 必须绿（无 problems）。
 */
export function expectCodes(problems, run, want, push, { label } = {}) {
  const tag = label ?? run.label
  if (run.spawn_error !== null) {
    push('TOOL-MISSING', `[${tag}] 跑不起来（${run.spawn_error}）—— 契约 §3.3/§5.1 的两个入口不在盘上或不可执行`)
    return false
  }
  if (run.json === null) {
    push('JSON-UNPARSEABLE', `[${tag}] --json 的输出解析不了（${run.json_error}）· stdout 头=${JSON.stringify(run.stdout_head)} · stderr=${JSON.stringify(run.stderr_head)}`)
    return false
  }
  const got = codesOf(run.json)
  const expected = [...want].sort()
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    push('CODE-SET-DRIFT', `[${tag}] 码集实得 ${JSON.stringify(got)}，期望 ${JSON.stringify(expected)}`
      + `（报文：${JSON.stringify(messagesOf(run.json).slice(0, 6))}）—— 多报/少报都算没判准`)
    return false
  }
  const wantOk = expected.length === 0
  if (Boolean(run.json.ok) !== wantOk) {
    push('OK-DRIFT', `[${tag}] \`ok\` 实得 ${JSON.stringify(run.json.ok)}，期望 ${JSON.stringify(wantOk)}（码集=${JSON.stringify(got)}）`)
    return false
  }
  const wantExit = wantOk ? 0 : 1
  if (run.exit !== wantExit) {
    push('EXIT-DRIFT', `[${tag}] 退出码实得 ${JSON.stringify(run.exit)}，期望 ${wantExit}（契约 §5.5：有 problems ⇒ 1）`)
    return false
  }
  return true
}

/** 工具是否在盘上（不在就推一条 `TOOL-MISSING`，返回 false）。 */
export function toolPresent(problems, file, note) {
  if (existsSync(file)) return true
  problems.push({
    code: 'TOOL-MISSING',
    message: `${file} 不在盘上 —— ${note}（契约 §3.3 / §5.1；Gate 3 之前这一格**必须**红）`,
    detail: { tool: file },
  })
  return false
}

// ── 读盘 / 树哈希 ────────────────────────────────────────────────────────

/** 一棵树的确定性摘要（相对路径升序 + 每份 sha256）—— 用来证明"跑检查器一个字节都没改"。 */
export function treeDigest(root) {
  const files = []
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) {
        files.push({
          rel: path.relative(root, full).replace(/\\/g, '/'),
          bytes: st.size,
          sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
        })
      }
    }
  }
  walk(root)
  const digest = createHash('sha256').update(files.map((f) => `${f.rel}\u0000${f.sha256}`).join('\n')).digest('hex')
  return { digest, files }
}

/** 读一份文本（不在 ⇒ `null`）。 */
export function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

// ── 第 2 关拒接闸 / 岗位说明书的纯判据（`DEC-06` / `DEC-07` 用）──────────────

/**
 * **拒接闸的判据面**（契约 §6.2 的六行表）。工具缺席时返回 `null`（由调用方记 `TOOL-MISSING`）；
 * 这里只判"读回来的 JSON 与该表一致"。
 */
export function gateVerdict(run) {
  if (run.json === null) return null
  return { verdict: run.json.verdict ?? null, code: run.json.code ?? null, ticket_kind: run.json.ticket_kind ?? null }
}

/**
 * **三份说明书那一行**的纯判据（不跑任何工具）：`texts` 是 `{'test': '…全文…', …}`。
 * 返回 `[{role, code, message}]`；三份各一条独立红因。
 */
export function clauseProblems(texts) {
  const out = []
  for (const spec of ROLE_CLAUSES) {
    const text = texts[spec.role]
    if (typeof text !== 'string') {
      out.push({ role: spec.role, code: 'CLAUSE-FILE-MISSING', message: `${spec.file} 读不到（契约 §8 / 任务书 §5）` })
      continue
    }
    const hit = text.split(/\r?\n/).some((line) => line.trim() === spec.clause || line.includes(spec.clause))
    if (!hit) {
      out.push({
        role: spec.role,
        code: 'CLAUSE-MISSING',
        message: `${spec.file} 里没有那一行：${JSON.stringify(spec.clause)}`
          + '（任务书 §5：三份说明书各加**一行**；这一行是第 2 关硬门的**人读载体**）',
      })
    }
  }
  return out
}

/** `design.md` 一个本族字面量都不许有（方案岗搁置）。 */
export function designProblems(text) {
  if (typeof text !== 'string') return [{ code: 'DESIGN-FILE-MISSING', message: `${DESIGN_FILE} 读不到` }]
  const hits = DESIGN_FORBIDDEN.filter((needle) => text.includes(needle))
  if (hits.length === 0) return []
  return [{
    code: 'DESIGN-TOUCHED',
    message: `${DESIGN_FILE} 里出现了本族字面量 ${JSON.stringify(hits)} —— 方案岗 2026-11-12 搁置（老板 11:39），`
      + '`team/design.md` 本票一个字节都不该动（契约 §8 / 任务书 §5）',
  }]
}

// ── 真树读数（`DEC-01` / `DEC-04` / `DEC-05` 的"真树那一腿"）──────────────────

/** 真树的 `决议/` 路径。 */
export const REAL_LEDGER = path.join(PATHS.repo, '决议')

/** 真树 `决议/构案/` 下的决议文件（相对 `决议/` 的 posix 路径，升序）。 */
export function realDecisionFiles() {
  const dir = path.join(REAL_LEDGER, '构案')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((n) => n.endsWith('.md')).sort().map((n) => `构案/${n}`)
}

/** 真树的 `git ls-files -- 决议`（没有 `.git` 的副本 ⇒ `{git: false}`）。 */
export function realTrackedFiles() {
  if (!existsSync(path.join(PATHS.repo, '.git'))) return { git: false, files: [], exit: null, stderr: '' }
  const r = spawnSync('git', ['ls-files', '--', '决议'], { cwd: PATHS.repo, encoding: 'utf8' })
  return {
    git: true,
    exit: r.status,
    files: String(r.stdout ?? '').split(/\r?\n/).filter((l) => l.trim() !== ''),
    stderr: String(r.stderr ?? '').trim().slice(0, 200),
  }
}
