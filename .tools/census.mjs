#!/usr/bin/env node
/**
 * **census —— 概念 → 几处实现**（构案 0001「决议账本三册制」的现状层读数）。
 *
 * 规格：`.team/test/2026-11-12/CONTRACT-构案.md` §3（下称「契约」）。口径只有一句话：
 *
 * > `count` = 在 `<root>` 下、**落在该概念 `扫描` glob 里**、且**字节里含 `实现探针` 至少一次**的
 * > **不同文件**的个数。
 *
 * 四条钉死的边界（每一条都有判据腿，改这里之前先读契约 §3.2）：
 *   1. **按文件数，不按出现次数** —— 同一份文件里探针出现两次仍是 1；
 *   2. **`决议/` 下一律不算** —— 概念表自己就含探针字面量，不排除就是自吞（每行天然 +1）；
 *   3. **glob 之外不算** —— 盘上有文件、含探针、但不在 `扫描` 里 ⇒ 不计；
 *   4. **零处 ⇒ 0** —— 概念在表里、今天还没实现，是合法状态（不是缺行、不是 `—`）。
 *
 * 本文件还有第二个身份：**它是决议账本唯一的解析器**（`.tools/决议-check.mjs` import 它）。
 * 头块七键怎么拆、`INDEX` 怎么派生、`反悔条件` 那张表怎么读，只有这一份实现 ——
 * 两个入口各写一份解析器，两边一起错的时候谁也看不见（契约 §5.3 末条）。
 *
 * 命令（契约 §3.3）：
 *   node .tools/census.mjs [--root=<绝对目录>] [--json] [--concept=<概念>] [--write-index]
 *
 * 退出码：`0` 无问题 · `1` 有 problems · `3` 用法/根不成立。
 * `--write-index` 是**唯一**允许写盘的开关；不开它，本脚本一个字节都不写（契约 §5.4）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── 身份与常量（契约 §1.1 / §2 / §3.1 / §4）─────────────────────────────────
/** 脚本自己的仓库根（**不是** `cwd`；契约 §3.3）。 */
export const SELF_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(SELF_DIR, '..')

/** 决议账本根（相对 `<root>`，posix）。 */
export const LEDGER_REL = '决议'
export const TABLE_REL = '决议/概念表.md'
export const INDEX_REL = '决议/INDEX.md'
/** 两个系列（契约 §1.2：系列 = 所在目录）。 */
export const SERIES = Object.freeze(['构案', '产品'])

/** 契约 §2.1：头块七个键（次序不判，键集恰为这七个）。 */
export const DECISION_KEYS = Object.freeze(['状态', '主题', '日期', '拍板人', '原话', 'supersedes', 'superseded_by'])
/** 契约 §2.3：构案正文七节（只判在不在）。 */
export const BODY_SECTIONS = Object.freeze(['背景', '决定', '复用什么', '不复用什么', '新增什么', '公共化时点', '反悔条件'])
/** 契约 §2.4：⑦ 那节第一张表的四列（逐字、次序也逐字）。 */
export const REVERSAL_COLUMNS = Object.freeze(['编号', '条件', '触发时动作', '状态'])
/** 契约 §3.1：概念表的四列（逐字）。 */
export const CONCEPT_COLUMNS = Object.freeze(['概念', '实现探针', '扫描', '归属'])
/** 契约 §4.2：构案录的四列（逐字）。 */
export const INDEX_COLUMNS = Object.freeze(['概念', '归属', 'census', '构案'])
/** 契约 §4.1：生成标记（逐字）。 */
export const GEN_MARKER = '<!-- 生成物 · 由 node .tools/census.mjs --write-index 生成 · 手改由 node .tools/决议-check.mjs 对账 -->'
/** 契约 §4.1 的判法：第一行非空行以 `<!--` 开头，且同时含这两个字面量。 */
export const GEN_MARKER_NEEDLES = Object.freeze(['生成物', 'census.mjs'])
/** 占位值（契约 §2.2：这些不是"有话"）。 */
export const PLACEHOLDERS = Object.freeze(['—', '-', 'TODO', 'TBD', '待补', '?', ''])
/** 契约 §2.2 的 em dash。 */
export const DASH = '—'

/** 一条红因（契约 §5.1：一个红因一行）。 */
export function problem(code, message, extra = {}) {
  return { code, message, ...extra }
}

/** 去重口径（契约 §5.1）：同一 `(code, 具体对象)` 只报一次。 */
export function dedupeProblems(list) {
  const seen = new Set()
  const out = []
  for (const p of list) {
    const key = [p.code, p.file ?? '', p.key ?? '', p.concept ?? '', p.ref ?? '', p.message].join('\u0000')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

// ── 极小的 md 读取面 ────────────────────────────────────────────────────────
export function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** 文件的行（保留原始行内容；`\r` 去掉 —— 判定用不到它，字节级操作另走 `supersede`）。 */
export function linesOf(text) {
  return String(text).split(/\r?\n/)
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

function isFile(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/** `| a | b |` ⇒ `['a', 'b']`（两侧空壳去掉，格内 trim）。 */
export function splitTableRow(line) {
  const t = String(line).trim()
  if (!t.startsWith('|')) return null
  const body = t.replace(/^\|/, '').replace(/\|$/, '')
  return body.split('|').map((cell) => cell.trim())
}

const SEPARATOR_CELL = /^:?-{3,}:?$/

/**
 * 从 `lines[from..]` 起找**第一张 md 表**。返回 `{ startLine, columns, rows } | null`。
 *
 * 「表」的形状：一行 `|` 开头 + 下一行是分隔行（每格 `---` / `:--:`）。表头行必须紧贴分隔行，
 * 这样正文里引用的 `| A | B |` 片段不会被当成表。
 */
export function firstTable(lines, from = 0) {
  for (let i = from; i < lines.length; i += 1) {
    const head = splitTableRow(lines[i])
    if (head === null) continue
    const sep = splitTableRow(lines[i + 1] ?? '')
    if (sep === null || sep.length !== head.length || !sep.every((c) => SEPARATOR_CELL.test(c))) continue
    const rows = []
    let j = i + 2
    for (; j < lines.length; j += 1) {
      const cells = splitTableRow(lines[j])
      if (cells === null) break
      rows.push(cells)
    }
    return { startLine: i + 1, columns: head, rows }
  }
  return null
}

// ── 概念表（契约 §3.1）──────────────────────────────────────────────────────
/**
 * 读 `<root>/决议/概念表.md`。
 *
 * @returns {{present:boolean, file:string, rows:Array<object>, problems:Array<object>}}
 */
export function readConceptTable(root) {
  const rel = TABLE_REL
  const file = path.join(root, rel)
  if (!existsSync(file)) {
    return {
      present: false,
      file: rel,
      rows: [],
      problems: [problem('CONCEPT-TABLE-MISSING', `${rel} 不在 —— 它是 census 的**唯一**概念源（契约 §3.1）；`
        + '这一条上游缺了，`INDEX` 的派生与 `census` 的数都无从谈起')],
    }
  }
  const lines = linesOf(readFileSync(file, 'utf8'))
  const table = firstTable(lines)
  if (table === null) {
    return {
      present: true,
      file: rel,
      rows: [],
      problems: [problem('CONCEPT-TABLE-SHAPE', `${rel} 里没有第一张 md 表（契约 §3.1）；`
        + '概念表必须是一张四列表：`| 概念 | 实现探针 | 扫描 | 归属 |`')],
    }
  }
  const problems = []
  const want = CONCEPT_COLUMNS
  if (table.columns.length !== want.length || table.columns.some((c, i) => c !== want[i])) {
    problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${table.startLine} 的列名不是 ${JSON.stringify(want)}`
      + `（实得 ${JSON.stringify(table.columns)}）—— 四列逐字、次序也逐字（契约 §3.1）`))
    return { present: true, file: rel, rows: [], problems }
  }
  const rows = []
  const seen = new Set()
  table.rows.forEach((cells, idx) => {
    const line = table.startLine + 2 + idx
    if (cells.length !== want.length) {
      problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${line} 有 ${cells.length} 格，应当是 4 格`
        + `（${JSON.stringify(cells)}）—— 缺格的行会让"扫描"或"归属"静默变成空值`))
      return
    }
    const [concept, probe, scanRaw, owner] = cells.map((c) => c.trim())
    const bad = []
    if (concept === '') bad.push('概念')
    if (probe === '') bad.push('实现探针')
    if (owner === '') bad.push('归属')
    if (bad.length > 0) {
      problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${line} 这几格是空的：${JSON.stringify(bad)}（契约 §3.1）`))
      return
    }
    const scan = scanRaw.split(/[,，]/).map((s) => s.trim()).filter((s) => s !== '')
    if (scan.length === 0) {
      problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${line} 的「扫描」是空的 —— 至少一条 glob（契约 §3.1）`))
      return
    }
    if (seen.has(concept)) {
      problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${line} 的概念 \`${concept}\` 在表里出现了两次 —— `
        + '概念唯一（契约 §3.1；逐字比较，不做大小写/全半角归一）'))
      return
    }
    seen.add(concept)
    rows.push({ concept, probe, scan, owner, line })
  })
  return { present: true, file: rel, rows, problems }
}

// ── 扫描（glob）────────────────────────────────────────────────────────────
function hasWildcard(segment) {
  return /[*?]/.test(segment)
}

function segmentMatcher(segment) {
  let out = ''
  for (const ch of segment) {
    if (ch === '*') out += '[^/]*'
    else if (ch === '?') out += '[^/]'
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

/** 不走目录：`.git` / `node_modules` 是仓库的机械件，不是实现（与 `决议/` 同理）。 */
const SKIP_DIRS = new Set(['.git', 'node_modules'])
/** 单份文件的上限（超过就记进 `read_failures`，**不**静默当成"没有实现"）。 */
const MAX_FILE_BYTES = 8 * 1024 * 1024

/**
 * 按 glob 枚举文件（**只走匹配到的目录**：`src/**\/*.mjs` 不会去读 `.team/`）。
 *
 * 语法（契约 §3.1）：`*` = 段内任意、`**` = 跨段、`?` = 一个字符。
 * `决议/` 在根这一级整体跳过（契约 §3.2 第 2 条：概念表自己含探针字面量）。
 */
export function walkGlob(root, glob) {
  const rel = String(glob).replace(/\\/g, '/')
  const segments = rel.split('/').filter((s) => s !== '' && s !== '.')
  const out = []
  if (segments.length === 0) return out
  const go = (abs, i) => {
    if (i === segments.length) {
      if (isFile(abs)) out.push(abs)
      return
    }
    const segment = segments[i]
    if (segment === '**') {
      go(abs, i + 1) // `**` 吃零段
      for (const name of listDir(abs)) {
        if (SKIP_DIRS.has(name)) continue
        const child = path.join(abs, name)
        if (isDir(child)) go(child, i) // `**` 再吃一段
      }
      return
    }
    if (!hasWildcard(segment)) {
      const child = path.join(abs, segment)
      if (existsSync(child)) go(child, i + 1)
      return
    }
    const re = segmentMatcher(segment)
    for (const name of listDir(abs)) {
      if (re.test(name)) go(path.join(abs, name), i + 1)
    }
  }
  const top = path.resolve(root)
  go(top, 0)
  // `决议/` 整个子树不算（根这一级判；更深的 `x/决议/` 不是账本，照算）
  const prefix = `${path.resolve(top, LEDGER_REL)}${path.sep}`
  return out.filter((abs) => !abs.startsWith(prefix))
}

/**
 * 一个概念的实现数（契约 §3.2）。
 *
 * @returns {{count:number, implementations:string[], scan_empty:boolean, read_failures:Array<object>}}
 */
export function countConcept(root, row) {
  const abs = new Set()
  for (const glob of row.scan) for (const file of walkGlob(root, glob)) abs.add(path.resolve(file))
  const probeBuf = Buffer.from(String(row.probe), 'utf8')
  const hits = []
  const failures = []
  for (const file of [...abs].sort()) {
    let bytes = null
    try {
      if (statSync(file).size > MAX_FILE_BYTES) {
        failures.push({ file: relPosix(root, file), reason: `超过 ${MAX_FILE_BYTES} B，本工具不读` })
        continue
      }
      bytes = readFileSync(file)
    } catch (err) {
      failures.push({ file: relPosix(root, file), reason: String(err?.code ?? err).slice(0, 120) })
      continue
    }
    if (bytes.includes(probeBuf)) hits.push(relPosix(root, file))
  }
  const implementations = hits.map((h) => h).sort()
  return {
    count: implementations.length,
    implementations,
    scan_empty: abs.size === 0,
    read_failures: failures.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
  }
}

/** 绝对路径 ⇒ 相对 `<root>` 的 posix 路径。 */
export function relPosix(root, abs) {
  return path.relative(path.resolve(root), abs).replace(/\\/g, '/')
}

// ── 决议文件：头块七键（契约 §2.1 / §2.2）──────────────────────────────────
const KEY_LINE = /^\s*([^:：\s]+)\s*[:：]\s*(.*)$/
const H1_LINE = /^#\s+/u
const H1_IDENTITY = /^#\s+(\S+)\s+(\d{4})\s*(?:[·・•]\s*)?(.*)$/u
const FILE_IDENTITY = /^(\d{4})-(.+)\.md$/

/** 日期形状：`YYYY-MM-DD`，且解析后回写逐字相同（契约 §2.2）。 */
function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return false
  return new Date(ms).toISOString().slice(0, 10) === value
}

/**
 * 引用表的值（`supersedes` / `superseded_by`）：`—` 或逗号分隔的 `NNNN` / `构案/NNNN` / `产品/NNNN`。
 * 返回 `{ ok, refs: [{raw, series|null, id}], why }`。
 */
export function parseRefList(value) {
  const v = String(value).trim()
  if (v === DASH) return { ok: true, refs: [], why: null }
  if (v === '') return { ok: false, refs: [], why: `空值 —— 没有就写 \`${DASH}\`（契约 §2.2）` }
  const parts = v.split(',').map((s) => s.trim())
  const refs = []
  const seen = new Set()
  for (const raw of parts) {
    if (raw === '') return { ok: false, refs: [], why: '引用表里有空格子（逗号前后多写了逗号）' }
    const m = /^(?:(构案|产品)\/)?(\d+)$/u.exec(raw)
    if (m === null) return { ok: false, refs: [], why: `\`${raw}\` 不是 \`NNNN\` / \`构案/NNNN\` / \`产品/NNNN\`` }
    if (m[2].length !== 4) return { ok: false, refs: [], why: `\`${raw}\` 的编号必须是四位（\`0001\` 与 \`1\` 不是同一个引用）` }
    const key = `${m[1] ?? ''}/${m[2]}`
    if (seen.has(key)) return { ok: false, refs: [], why: `\`${raw}\` 在同一个引用表里出现了两次` }
    seen.add(key)
    refs.push({ raw, series: m[1] ?? null, id: m[2] })
  }
  return { ok: true, refs, why: null }
}

/** 七个键各自己的形状（契约 §2.2）。返回 `why` 或 `null`。 */
export function checkKeyValue(key, value) {
  const v = String(value).trim()
  switch (key) {
    case '状态':
      return v === '生效' || v === '已废' ? null : `只能是 \`生效\` 或 \`已废\`（逐字），实得 ${JSON.stringify(v)}`
    case '主题':
      if (v === '') return '空的 —— 主题必须非空'
      if (v === DASH) return `\`${DASH}\` 不是主题`
      if (/[,，]/u.test(v)) return '含逗号 —— 主题是一个概念的名字，不是列表'
      return null
    case '日期':
      return isRealDate(v) ? null : `${JSON.stringify(v)} 不是真实的 \`YYYY-MM-DD\`（解析后回写要逐字相同）`
    case '拍板人':
      return PLACEHOLDERS.includes(v) ? `${JSON.stringify(v)} 是占位，不是拍板人` : null
    case '原话': {
      if (v.length < 2) return '必须被 `「…」` / `“…”` / `"…"` 包住'
      const pairs = [['「', '」'], ['“', '”'], ['"', '"']]
      const hit = pairs.find(([open, close]) => v.startsWith(open) && v.endsWith(close) && v.length > open.length + close.length)
      if (!hit) return '必须被 `「…」` / `“…”` / `"…"` 包住（内部非空）'
      const inner = v.slice(hit[0].length, v.length - hit[1].length).trim()
      return PLACEHOLDERS.includes(inner) ? `引号里是占位（${JSON.stringify(inner)}），不是原话` : null
    }
    case 'supersedes':
    case 'superseded_by': {
      const r = parseRefList(v)
      return r.ok ? null : r.why
    }
    default:
      return null
  }
}

/**
 * 解析一份决议文件（契约 §2.1 的六条判法，逐条对应）。
 *
 * @returns {{h1:string|null, header:Object, headerLines:Array<{key:string,value:string,line:number}>,
 *            bodyLines:string[], bodyStartLine:number, problems:Array<object>}}
 */
export function parseDecisionText(text, { relFile, series, id, nameTitle }) {
  const lines = linesOf(text)
  const problems = []
  const out = {
    h1: null,
    header: {},
    headerLines: [],
    bodyLines: [],
    bodyStartLine: null,
    problems,
  }
  // ① 跳过开头空行，第一行非空必须是 H1（`^#\s+`）
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i += 1
  if (i >= lines.length || !H1_LINE.test(lines[i])) {
    problems.push(problem('DEC-HEADER-MISSING', `${relFile}:${i + 1} 起没有 H1（\`# ${series} ${id} · ${nameTitle}\`）—— `
      + '决议文件的第一个非空行必须是 H1（契约 §2.1-1）', { file: relFile, line: i + 1 }))
    return out
  }
  out.h1 = lines[i].trim()
  const identity = H1_IDENTITY.exec(out.h1)
  if (identity === null) {
    problems.push(problem('DEC-TITLE-MISMATCH', `${relFile}:${i + 1} 的 H1 认不出系列+编号+标题：${JSON.stringify(out.h1)}`
      + `（应当是 \`# ${series} ${id} · ${nameTitle}\`，契约 §1.1）`, { file: relFile, line: i + 1 }))
  } else {
    const [, h1Series, h1Id, h1Title] = identity
    const wrong = []
    if (h1Series !== series) wrong.push(`系列 ${JSON.stringify(h1Series)} ≠ 目录 ${JSON.stringify(series)}`)
    if (h1Id !== id) wrong.push(`编号 ${h1Id} ≠ 文件名 ${id}`)
    if (h1Title.trim() !== nameTitle) wrong.push(`标题 ${JSON.stringify(h1Title.trim())} ≠ 文件名 ${JSON.stringify(nameTitle)}`)
    if (wrong.length > 0) {
      problems.push(problem('DEC-TITLE-MISMATCH', `${relFile}:${i + 1} 的 H1 与身份对不上：${wrong.join(' · ')}`
        + `（H1 = ${JSON.stringify(out.h1)}；期望 \`# ${series} ${id} · ${nameTitle}\`，契约 §1.1）`, { file: relFile, line: i + 1 }))
    }
  }
  // ② H1 之后必须是一行空行，然后是头块；头块到第一条空行为止
  if (i + 1 >= lines.length || lines[i + 1].trim() !== '') {
    problems.push(problem('DEC-HEADER-MISSING', `${relFile}:${i + 2} 不是空行 —— H1 之后必须先空一行再写头块（契约 §2.1-2）`,
      { file: relFile, line: i + 2 }))
    return out
  }
  const block = []
  let j = i + 2
  for (; j < lines.length; j += 1) {
    if (lines[j].trim() === '') break
    block.push({ text: lines[j], line: j + 1 })
  }
  if (block.length === 0) {
    problems.push(problem('DEC-HEADER-MISSING', `${relFile}:${i + 2} 之后直接就是正文/空行 —— 头块为空（契约 §2.1-2）`,
      { file: relFile, line: i + 2 }))
    return out
  }
  // ③ 每一行必须匹配 `键: 值`；不匹配 ⇒ HEADER-MISSING（带行号，**不**把散文当"缺失的七个键"报）
  const seen = new Map()
  for (const { text: lineText, line: lineNo } of block) {
    const m = KEY_LINE.exec(lineText)
    if (m === null) {
      problems.push(problem('DEC-HEADER-MISSING', `${relFile}:${lineNo} 不是 \`键: 值\` 形状：`
        + `${JSON.stringify(String(lineText).slice(0, 60))} —— 头块里每一行都必须能解析（契约 §2.1-3）`,
      { file: relFile, line: lineNo }))
      continue
    }
    const key = m[1]
    const value = m[2].trim()
    // ④ 键名必须在那七个里
    if (!DECISION_KEYS.includes(key)) {
      problems.push(problem('DEC-UNKNOWN-KEY', `${relFile}:${lineNo} 出现了七键之外的键 \`${key}\` —— `
        + `机器只解析这七个：${DECISION_KEYS.join(' / ')}（契约 §2.1-4）`, { file: relFile, line: lineNo, key }))
      continue
    }
    // ⑤ 七个键各出现恰好一次
    if (seen.has(key)) {
      problems.push(problem('DEC-DUP-KEY', `${relFile}:${lineNo} 的 \`${key}\` 出现了第二次（第一次在 :${seen.get(key)}）—— `
        + '七个键各恰好一次（契约 §2.1-5）', { file: relFile, line: lineNo, key }))
      continue
    }
    seen.set(key, lineNo)
    out.header[key] = value
    out.headerLines.push({ key, value, line: lineNo })
    // ⑥ 值形状
    const why = checkKeyValue(key, value)
    if (why !== null) {
      problems.push(problem('DEC-BAD-VALUE', `${relFile}:${lineNo} \`${key}\` 的值 ${JSON.stringify(value)} 形状不对：${why}（契约 §2.2）`,
        { file: relFile, line: lineNo, key }))
    }
  }
  const missing = DECISION_KEYS.filter((k) => !seen.has(k))
  // 缺键只在"头块本身解析得出来"时报 —— 头块整体坏了（上面已经报过 HEADER-MISSING）再报七条，读的人会以为有七处病
  if (missing.length > 0 && !problems.some((p) => p.code === 'DEC-HEADER-MISSING')) {
    for (const key of missing) {
      problems.push(problem('DEC-MISSING-KEY', `${relFile} 的头块缺 \`${key}\`（契约 §2.1-5：七个键各恰好一次）`,
        { file: relFile, key }))
    }
  }
  out.bodyStartLine = j + 1
  out.bodyLines = lines.slice(j)
  return out
}

// ── 决议文件：正文七节 + ⑦ 反悔条件表（契约 §2.3 / §2.4）────────────────────
/** `## ⑤ 新增什么` ⇒ `新增什么`（去掉编号前缀，但节名要**包含**七节名之一）。 */
function sectionHeading(line) {
  const m = /^\s{0,3}##\s+(.*)$/u.exec(line)
  if (m === null) return null
  return m[1].replace(/^[①-⑦⑧⑨⑩]+\s*/u, '').replace(/^\d+[.、)]\s*/u, '').trim()
}

/** 这一节的标题是否就是 `name` 那一节（`不复用什么` 不许被当成 `复用什么`）。 */
function headingIs(heading, name) {
  let probe = heading
  for (const other of BODY_SECTIONS) {
    if (other !== name && other !== '复用什么' && probe.includes(other)) return false
  }
  if (name === '复用什么') probe = probe.replace(/不复用什么/u, '')
  return probe.includes(name)
}

/** 正文七节（只判在不在）+ ⑦ 那张四列表。 */
export function parseBody(series, bodyLines, relFile, firstBodyLine) {
  const problems = []
  const found = []
  const spans = []
  for (let k = 0; k < bodyLines.length; k += 1) {
    const heading = sectionHeading(bodyLines[k])
    if (heading === null) continue
    const hit = BODY_SECTIONS.find((name) => headingIs(heading, name))
    if (hit !== undefined && !found.includes(hit)) {
      found.push(hit)
      spans.push({ name: hit, from: k })
    }
  }
  if (series === '构案') {
    const missing = BODY_SECTIONS.filter((name) => !found.includes(name))
    for (const name of missing) {
      problems.push(problem('BODY-SECTION-MISSING', `${relFile} 的正文缺 \`## ${name}\` 这一节（契约 §2.3：构案正文七节只判在不在）`,
        { file: relFile }))
    }
    const reversal = spans.find((s) => s.name === '反悔条件')
    let reversalRows = []
    /** `section_missing`：⑦ 那一节在不在（缺了就不用再报"表缺" —— 契约 §5.1 的上游缺只报上游）。 */
    const reversalSectionPresent = reversal !== undefined
    if (reversalSectionPresent) {
      const after = spans.filter((s) => s.from > reversal.from).map((s) => s.from)
      const end = after.length === 0 ? bodyLines.length : Math.min(...after)
      const slice = bodyLines.slice(reversal.from + 1, end)
      const table = firstTable(slice, 0)
      if (table === null) {
        problems.push(problem('REVERSAL-TABLE-MISSING', `${relFile} 的 ⑦ 反悔条件下没有表 —— 这一节必须是`
          + ` \`| 编号 | 条件 | 触发时动作 | 状态 |\` 四列表（契约 §2.4）；第 5 关要逐格核它`, { file: relFile }))
      } else if (table.columns.length !== REVERSAL_COLUMNS.length || table.columns.some((c, i) => c !== REVERSAL_COLUMNS[i])) {
        problems.push(problem('REVERSAL-ROW-SHAPE', `${relFile} 的 ⑦ 表列名不是 ${JSON.stringify(REVERSAL_COLUMNS)}`
          + `（实得 ${JSON.stringify(table.columns)}）—— 四列逐字、次序也逐字（契约 §2.4）`, { file: relFile }))
      } else {
        const ids = new Set()
        table.rows.forEach((cells, idx) => {
          const line = firstBodyLine + reversal.from + 1 + table.startLine + 1 + idx
          const where = `${relFile}:${line}`
          if (cells.length !== 4) {
            problems.push(problem('REVERSAL-ROW-SHAPE', `${where} 这一行有 ${cells.length} 格，应当是 4 格`
              + `（${JSON.stringify(cells)}）—— 缺格的行会让"状态"静默变成空`, { file: relFile, line }))
            return
          }
          const [idCell, condition, action, status] = cells
          const rowProblems = []
          if (!/^RC-\d+$/.test(idCell)) rowProblems.push(`「编号」${JSON.stringify(idCell)} 不是 \`RC-<正整数>\``)
          else if (ids.has(idCell)) rowProblems.push(`「编号」${JSON.stringify(idCell)} 在本文件里重复`)
          else ids.add(idCell)
          if (condition === '') rowProblems.push('「条件」是空的')
          if (action === '') rowProblems.push('「触发时动作」是空的')
          else if (!/(supersede|重开|打回)/.test(action)) {
            rowProblems.push(`「触发时动作」${JSON.stringify(action)} 里没有 \`supersede\` / \`重开\` / \`打回\``)
          }
          const state = status.trim()
          if (state !== '未触发' && state !== '已触发') rowProblems.push(`「状态」${JSON.stringify(status)} 只能是 \`未触发\` / \`已触发\``)
          if (rowProblems.length > 0) {
            problems.push(problem('REVERSAL-ROW-SHAPE', `${where} 这一行不合形状（${idCell || '?'}）：${rowProblems.join(' · ')}（契约 §2.4）`,
              { file: relFile, line, row: idCell }))
            return
          }
          reversalRows.push({ id: idCell, condition, action: action, status: state })
        })
      }
    }
    return { sections: BODY_SECTIONS.filter((n) => found.includes(n)), reversalRows, problems }
  }
  // 产品正文：自由散文，零要求
  return { sections: BODY_SECTIONS.filter((n) => found.includes(n)), reversalRows: [], problems }
}

// ── 决议树 ─────────────────────────────────────────────────────────────────
/**
 * 枚举 `<root>/决议/<系列>/*.md` 并解析（**唯一的决议读取面**）。
 *
 * @returns {{decisions:Array<object>, problems:Array<object>}}
 */
export function readDecisions(root) {
  const problems = []
  const decisions = []
  const seenIds = new Map()
  for (const series of SERIES) {
    const dir = path.join(root, LEDGER_REL, series)
    if (!isDir(dir)) continue
    for (const name of listDir(dir)) {
      if (!name.endsWith('.md')) continue
      const relFile = `${LEDGER_REL}/${series}/${name}`
      const identity = FILE_IDENTITY.exec(name)
      if (identity === null) {
        problems.push(problem('DEC-BAD-FILENAME', `${relFile} 的文件名不是 \`NNNN-标题.md\`（契约 §1.1）`, { file: relFile }))
        continue
      }
      const [, id, nameTitle] = identity
      const dupKey = `${series}/${id}`
      if (seenIds.has(dupKey)) {
        problems.push(problem('DEC-DUP-ID', `${relFile} 的编号 ${id} 与 ${seenIds.get(dupKey)} 撞了 —— 同一个系列里编号唯一（契约 §1.1）`,
          { file: relFile, ref: id }))
        continue
      }
      const text = readText(path.join(dir, name))
      if (text === null) {
        problems.push(problem('DEC-BAD-FILENAME', `${relFile} 读不出来`, { file: relFile }))
        continue
      }
      seenIds.set(dupKey, relFile)
      const parsed = parseDecisionText(text, { relFile, series, id, nameTitle })
      problems.push(...parsed.problems)
      // 头块没解析出来（`bodyStartLine === null`）⇒ 正文在哪里都无从谈起：只报上游那一条
      const body = parsed.bodyStartLine === null
        ? { sections: [], reversalRows: [], problems: [] }
        : parseBody(series, parsed.bodyLines, relFile, parsed.bodyStartLine)
      problems.push(...body.problems)
      const supersedes = parseRefList(parsed.header.supersedes ?? DASH)
      const supersededBy = parseRefList(parsed.header.superseded_by ?? DASH)
      const status = parsed.header['状态']
      decisions.push({
        series,
        id,
        file: relFile,
        title: nameTitle,
        h1: parsed.h1,
        status: status === '生效' || status === '已废' ? status : null,
        raw_status: status ?? null,
        topic: (parsed.header['主题'] ?? '').trim(),
        date: (parsed.header['日期'] ?? '').trim(),
        decider: (parsed.header['拍板人'] ?? '').trim(),
        quote: (parsed.header['原话'] ?? '').trim(),
        supersedes: supersedes.ok ? supersedes.refs : [],
        superseded_by: supersededBy.ok ? supersededBy.refs : [],
        body_sections: body.sections,
        reversal_rows: body.reversalRows,
        /** 头块是否干净（值为 null 的键没有；形状问题在 `problems` 里）。 */
        header_clean: parsed.problems.length === 0,
        pointer_clean: true,
      })
    }
  }
  return { decisions, problems }
}

/** 一条引用在树上解析成哪一条决议（`null` = 解析不到）。 */
export function resolveRef(decisions, fromSeries, ref) {
  const series = ref.series ?? fromSeries
  const hit = decisions.find((d) => d.series === series && d.id === ref.id)
  if (hit !== undefined) return hit
  if (ref.series === null) {
    // 裸编号：先按本系列的；本系列没有、另一个系列唯一有 ⇒ 认它（跨系列的唯一解释）
    const others = decisions.filter((d) => d.id === ref.id && d.series !== series)
    if (others.length === 1) return others[0]
  }
  return null
}

/**
 * 指针判据（契约 §5.1-②）：悬空 / 自称 / 双向对称。
 * 会在 `decisions[]` 上打 `pointer_clean`（供 ④ 的「构案」列做上游缺的级联）。
 */
export function judgePointers(decisions) {
  const problems = []
  const dirty = new Set()
  const pairs = new Set()
  for (const d of decisions) {
    const check = (refs, direction) => {
      for (const ref of refs) {
        const target = resolveRef(decisions, d.series, ref)
        if (target === null) {
          problems.push(problem('POINTER-DANGLING', `${d.file} 的 \`${direction}: ${ref.raw}\` 解析不到 —— 树上没有 \`${ref.series ?? d.series}/${ref.id}\``
            + '（契约 §5.1-②：指针必须解析得到）', { file: d.file, ref: ref.raw, from: `${d.series}/${d.id}` }))
          dirty.add(d)
          continue
        }
        if (target.file === d.file) {
          problems.push(problem('POINTER-SELF', `${d.file} 的 \`${direction}: ${ref.raw}\` 指向自己 —— 自称不算 supersede（契约 §5.1-②）`,
            { file: d.file, ref: ref.raw }))
          dirty.add(d)
          continue
        }
        const pairKey = [d.file, target.file].sort().join('\u0000')
        if (pairs.has(pairKey)) continue
        pairs.add(pairKey)
        const forward = direction === 'supersedes'
          ? target.superseded_by.some((r) => resolveRef(decisions, target.series, r)?.file === d.file)
          : target.supersedes.some((r) => resolveRef(decisions, target.series, r)?.file === d.file)
        if (!forward) {
          const want = direction === 'supersedes' ? 'superseded_by' : 'supersedes'
          problems.push(problem('POINTER-ASYMMETRIC', `${d.series}/${d.id} 的 \`${direction}\` 指向 ${target.series}/${target.id}，`
            + `而 ${target.series}/${target.id} 的 \`${want}\` 里没有 ${d.id} —— 指针必须双向（契约 §5.1-②）`,
          { file: d.file, ref: `${d.id}→${target.id}`, ids: [d.id, target.id] }))
          dirty.add(d)
          dirty.add(target)
        }
      }
    }
    check(d.supersedes, 'supersedes')
    check(d.superseded_by, 'superseded_by')
  }
  for (const d of decisions) d.pointer_clean = !dirty.has(d)
  return problems
}

/**
 * 派生 `INDEX` 的行集（契约 §4.2）：行集/次序 = **概念表的**；`census` 现算；`构案` = 生效且 `主题` 逐字相同的构案编号。
 *
 * `构案` 那一列的三条级联（上游缺 ⇒ 只报上游那一条）：
 *   · 该概念有 ≥2 条 `生效` 同主题 ⇒ 跳过（`DUPLICATE-LIVE-TOPIC` 已经说了这件事）；
 *   · 该概念的决议有头块问题 / 指针问题 ⇒ 跳过（`DEC-*` / `POINTER-*` 已经说了）；
 *   · 其余 ⇒ 0 或 1 条生效构案，直接派生（没有 ⇒ `—`）。
 */
export function deriveIndexRows(root, concepts, decisions, judge) {
  const byTopicLive = new Map()
  for (const d of decisions) {
    if (d.series !== '构案' || d.status !== '生效') continue
    if (d.topic === '') continue
    if (!byTopicLive.has(d.topic)) byTopicLive.set(d.topic, [])
    byTopicLive.get(d.topic).push(d)
  }
  return concepts.map((row) => {
    const counted = countConcept(root, row)
    const live = byTopicLive.get(row.concept) ?? []
    const untrusted = judge.untrustedTopics.has(row.concept) || live.some((d) => !d.header_clean || !d.pointer_clean)
    const decision = untrusted || live.length > 1 ? null : (live[0]?.id ?? DASH)
    return {
      concept: row.concept,
      owner: row.owner,
      census: counted.count,
      decision: decision ?? null,
      skip_decision: decision === null,
      implementations: counted.implementations,
      scan: row.scan,
      scan_empty: counted.scan_empty,
      read_failures: counted.read_failures,
    }
  })
}

/** 渲染 `INDEX.md`（契约 §4.1 生成标记 + §4.2 四列）。 */
export function renderIndex(rows) {
  const cell = (v) => (v === null || v === undefined || v === '' ? DASH : String(v))
  const out = [GEN_MARKER, '', '# 构案录（现状层）', '', `| ${INDEX_COLUMNS.join(' | ')} |`, `| ${INDEX_COLUMNS.map(() => '---').join(' | ')} |`]
  for (const row of rows) {
    out.push(`| ${cell(row.concept)} | ${cell(row.owner)} | ${cell(row.census)} | ${cell(row.decision)} |`)
  }
  out.push('')
  return out.join('\n')
}

/**
 * 一次完整扫描：概念表 + 决议 + 指针 + 派生叶。**两个入口共用它**（契约 §5.3 末条）。
 *
 * @returns {{concepts:Array, decisions:Array, problems:Array, table:object, judge:object}}
 */
export function scanLedger(root) {
  const table = readConceptTable(root)
  const { decisions, problems: decisionProblems } = readDecisions(root)
  const pointerProblems = judgePointers(decisions)
  const problems = [...table.problems, ...decisionProblems, ...pointerProblems]

  // ③ 每个（系列, 主题）恰好一条 生效
  const liveByKey = new Map()
  for (const d of decisions) {
    if (d.status !== '生效' || d.topic === '') continue
    const key = `${d.series}\u0000${d.topic}`
    if (!liveByKey.has(key)) liveByKey.set(key, [])
    liveByKey.get(key).push(d)
  }
  const dupTopics = new Set()
  for (const [, list] of liveByKey) {
    if (list.length < 2) continue
    const ids = list.map((d) => `${d.series}/${d.id}`)
    for (const d of list) dupTopics.add(`${d.series}\u0000${d.topic}`)
    problems.push(problem('DUPLICATE-LIVE-TOPIC', `同一 主题 \`${list[0].topic}\` 有 ${list.length} 条 \`生效\`：${ids.join(' / ')}`
      + ' —— 一个主题只许一条生效；换掉旧的要把它翻成 `已废` 并写 `superseded_by`（契约 §5.1-③）',
    { concept: list[0].topic, ids: list.map((d) => d.id) }))
  }

  // ⑤ 状态与指针自洽
  const pointedAt = new Map()
  for (const d of decisions) {
    for (const ref of d.supersedes) {
      const target = resolveRef(decisions, d.series, ref)
      if (target !== null && target.file !== d.file) pointedAt.set(target.file, d)
    }
  }
  for (const d of decisions) {
    if (d.status === '生效' && pointedAt.has(d.file)) {
      const by = pointedAt.get(d.file)
      problems.push(problem('SUPERSEDED-BUT-LIVE', `${d.series}/${d.id} 被 ${by.series}/${by.id} 的 \`supersedes\` 指着，自己却还是 \`生效\``
        + ' —— 指针与状态必须一起翻（契约 §5.1-⑤）', { file: d.file, ids: [d.id, by.id] }))
    }
    if (d.status === '已废' && d.superseded_by.length === 0) {
      problems.push(problem('RETIRED-WITHOUT-SUCCESSOR', `${d.series}/${d.id} 是 \`已废\`，而 \`superseded_by\` 是 \`${DASH}\``
        + ' —— 废掉一条决议必须指向继任者（契约 §5.1-⑤）', { file: d.file, ref: d.id }))
    }
    if (d.status === '生效' && d.superseded_by.length > 0) {
      problems.push(problem('LIVE-WITH-SUCCESSOR', `${d.series}/${d.id} 还是 \`生效\`，而 \`superseded_by\` 已经写了继任者`
        + ' —— 两条状态只能有一条（契约 §5.1-⑤）', { file: d.file, ref: d.id }))
    }
  }

  // ⑥ 生效构案的 主题 必须在概念表里
  if (table.present) {
    const known = new Set(table.rows.map((r) => r.concept))
    for (const d of decisions) {
      if (d.series !== '构案' || d.status !== '生效') continue
      if (d.topic !== '' && !known.has(d.topic)) {
        problems.push(problem('DECISION-TOPIC-UNLISTED', `${d.file} 是生效构案，而它的 主题 \`${d.topic}\` 不在 \`${TABLE_REL}\` 里`
          + ' —— `INDEX` 的「构案」列只能从概念表现场派生（契约 §5.1-⑥）', { file: d.file, concept: d.topic }))
      }
    }
  }

  // ⑧ 已触发 ⇒ 必须已废 + superseded_by 指向生效（契约 §2.4 末条 / §7）
  for (const d of decisions) {
    if (d.series !== '构案') continue
    for (const row of d.reversal_rows) {
      if (row.status !== '已触发') continue
      const successor = d.superseded_by.map((ref) => resolveRef(decisions, d.series, ref)).find((x) => x !== null && x !== undefined)
      const why = []
      if (d.status !== '已废') why.push('还没废')
      if (d.superseded_by.length === 0) why.push('没写 supersede')
      else if (successor === undefined) why.push('指向的不生效/解析不到')
      if (why.length > 0) {
        problems.push(problem('REVERSAL-TRIGGERED-NOT-SUPERSEDED', `${d.file} 的 ${row.id} 已经是 \`已触发\`，但这条决议${why.join(' · ')}`
          + ' —— 触发过就必须在历史层留下证据：旧文 已废 + 新文 生效 + 双向指针（契约 §2.4 / §7）',
        { file: d.file, row: row.id, ids: [d.id] }))
      }
    }
  }

  // 哪些主题不可信（头块坏了 / 指针坏了）——给 ④ 的「构案」列做级联
  const untrustedTopics = new Set()
  for (const d of decisions) {
    if (d.header_clean && d.pointer_clean) continue
    if (d.topic !== '') untrustedTopics.add(d.topic)
    untrustedTopics.add(d.title)
  }
  const judge = { dupTopics, untrustedTopics }
  const concepts = table.present && table.problems.length === 0
    ? deriveIndexRows(root, table.rows, decisions, judge)
    : []
  return { table, decisions, concepts, problems: dedupeProblems(problems), judge }
}

// ── 命令行 ─────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const args = { root: null, json: false, concept: null, writeIndex: false, rest: [], bad: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--json') args.json = true
    else if (a === '--write-index') args.writeIndex = true
    else if (a.startsWith('--root=')) args.root = a.slice('--root='.length)
    else if (a === '--root') args.root = argv[++i] ?? ''
    else if (a.startsWith('--concept=')) args.concept = a.slice('--concept='.length)
    else if (a === '--concept') args.concept = argv[++i] ?? ''
    else args.bad.push(a)
  }
  return args
}

/**
 * 一次 census 扫描（**不写盘**）。返回 `--json` 那份形状（契约 §3.3）。
 */
export function censusReading(root) {
  const table = readConceptTable(root)
  const problems = [...table.problems]
  const concepts = []
  if (table.present && table.problems.length === 0) {
    const { decisions } = readDecisions(root)
    const liveByTopic = new Map()
    for (const d of decisions) {
      if (d.series === '构案' && d.status === '生效' && d.topic !== '') liveByTopic.set(d.topic, d.id)
    }
    for (const row of table.rows) {
      const counted = countConcept(root, row)
      concepts.push({
        concept: row.concept,
        owner: row.owner,
        count: counted.count,
        implementations: counted.implementations,
        scan: row.scan,
        scan_empty: counted.scan_empty,
        decision: liveByTopic.get(row.concept) ?? DASH,
        read_failures: counted.read_failures,
      })
      void liveByTopic
    }
  }
  const totalConcepts = concepts.length
  const totalImplementations = concepts.reduce((n, c) => n + c.count, 0)
  return {
    ok: problems.length === 0,
    root: path.resolve(root),
    concepts,
    total_concepts: totalConcepts,
    total_implementations: totalImplementations,
    problems,
  }
}

/** 人读那一页（契约 §3.3：一行一个概念 + 收口一行）。 */
export function renderCensusText(reading) {
  const lines = []
  const width = Math.max(0, ...reading.concepts.map((c) => [...c.concept].length))
  const pad = (s) => s + ' '.repeat(Math.max(0, width - [...s].length))
  for (const c of reading.concepts) {
    lines.push(`${String(c.count).padStart(2)}  ${pad(c.concept)}  (${c.owner})`)
  }
  lines.push(`census 概念 ${reading.total_concepts} · 实现合计 ${reading.total_implementations}`)
  return `${lines.join('\n')}\n`
}

/** 写 `INDEX.md`（原子：同目录临时件 + rename；**这是唯一允许写盘的路径**）。 */
export function writeIndex(root, text) {
  const file = path.join(root, INDEX_REL)
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  try {
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, file)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* 临时件没落成，不掩盖原始错误 */
    }
    throw err
  }
  return relPosix(root, file)
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const usage = (msg) => {
    process.stderr.write(`CENSUS-USAGE: ${msg}\n`
      + '  用法：node .tools/census.mjs [--root=<绝对目录>] [--json] [--concept=<概念>] [--write-index]\n')
    process.exit(3)
  }
  if (args.bad.length > 0) usage(`不认识的参数：${JSON.stringify(args.bad)}`)
  const root = args.root === null ? REPO_ROOT : path.resolve(args.root)
  if (!existsSync(root) || !isDir(root)) usage(`--root 不是目录：${root}`)

  const reading = censusReading(root)
  if (args.concept !== null) {
    reading.concepts = reading.concepts.filter((c) => c.concept === args.concept)
    reading.total_concepts = reading.concepts.length
    reading.total_implementations = reading.concepts.reduce((n, c) => n + c.count, 0)
  }

  if (args.writeIndex) {
    if (reading.problems.length > 0) {
      // 概念表坏了就不生成：派生页只能从干净的概念表派生（否则会写出一页错的"现状"）
      if (args.json) process.stdout.write(`${JSON.stringify(reading, null, 2)}\n`)
      else process.stderr.write(`${reading.problems.map((p) => `CENSUS-PROBLEM ${p.code}: ${p.message}`).join('\n')}\n`)
      process.exit(1)
    }
    const full = censusReading(root)
    const rows = full.concepts.map((c) => ({
      concept: c.concept,
      owner: c.owner,
      census: c.count,
      decision: c.decision ?? DASH,
    }))
    const rel = writeIndex(root, renderIndex(rows))
    if (args.json) process.stdout.write(`${JSON.stringify({ ...reading, written: rel }, null, 2)}\n`)
    else process.stdout.write(`${renderCensusText(reading)}INDEX 已生成：${rel}\n`)
    process.exit(0)
  }

  if (args.json) process.stdout.write(`${JSON.stringify(reading, null, 2)}\n`)
  else if (reading.problems.length === 0) process.stdout.write(renderCensusText(reading))
  else process.stderr.write(`${reading.problems.map((p) => `CENSUS-PROBLEM ${p.code}: ${p.message}`).join('\n')}\n`)
  process.exit(reading.problems.length === 0 ? 0 : 1)
}

const invokedDirectly = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()
