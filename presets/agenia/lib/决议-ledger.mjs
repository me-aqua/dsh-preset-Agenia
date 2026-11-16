#!/usr/bin/env node
/**
 * **三册账本的核心（唯一解析面 + 唯一派生面）** —— `决议-check` 与 `census` 两个入口**都 import 它**。
 *
 * 规格：`.team/test/2026-11-15/CONTRACT-0012.md`（下称「契约」）· 构案 `账本/构案/0012-三册账本.md`。
 *
 * 这一份里装的是**结构**：书怎么读（`账本/产品` · `账本/缺陷` · `账本/构案`）、头怎么拆、三条链怎么算
 * （外加构案 `父` 的向上解析）、派生页怎么渲染、文件级 `依据:` 怎么核。装在别处的两件事：
 *   · 缺陷事件流怎么折成现状 —— `lib/缺陷折叠.mjs`（唯一实现，本文件只调它）；
 *   · 概念怎么数 —— 就是本文件（`readConceptTable` / `countConcept` / `COUNT_RULES`）。
 *
 * 三条口径写死在这里，别处不许再写一份：
 *   1. **头块**（H1 → 一行空行 → 到第一条空行）只有 `splitHeaderBlock` 一份；
 *   2. **派生页**只有 `--op index` 会写，`check` 只按同一份渲染结果比字节；
 *   3. **文件级 `依据:`** 只在 `judgeFileBasis` 里判（豁免清单是 §6 的四条具名豁免）。
 *
 * 三册的区别（0012 §②-2 / 契约 §2）：
 *   · 产品：`层级: 产品` + `拍板人: 老板` + `原话:`，**不许有 `父`**；
 *   · 构案：`层级: 构案` + `父:` 必填（产品号或缺陷 id），`依据P` / `依据bug` 至少一栏非空，
 *     且 `父` 必须是那两栏里的成员（契约 §2.2-3）；
 *   · 缺陷：一天一个 `YYYY-MM-DD.json` 事件流，现状靠折叠（`缺陷折叠.mjs`）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { foldBugBook } from './缺陷折叠.mjs'

// ── 身份与常量（契约 §1 / §2 / §5.3 / §10.2）────────────────────────────────
/** 本文件所在的目录（`<repo>/presets/agenia/lib`）。 */
export const SELF_DIR = path.dirname(fileURLToPath(import.meta.url))
/** 仓库根：`<repo>/presets/agenia/lib` 往上三层 —— **不是** `cwd`。 */
export const REPO_ROOT = path.resolve(SELF_DIR, '..', '..', '..')

/** 账本根（相对 `<root>`，posix）。 */
export const LEDGER_REL = '账本'
/** 三册（逐字；次序 = 报告里的次序）。 */
export const BOOKS = Object.freeze(['产品', '缺陷', '构案'])
/** 概念表（**不在任何一册里** —— 一册里只许放决议 / 事件流 / INDEX，契约 §1.2）。 */
export const TABLE_REL = `${LEDGER_REL}/概念表.md`
/** 三张派生页（相对 `<root>`）。 */
export const INDEX_REL_OF = (book) => `${LEDGER_REL}/${book}/INDEX.md`
/** 旧树（迁移没做完的证据，契约 §1.1）。 */
export const OLD_TREE_REL = '决议'

/** 契约 §2.1：产品头的键（次序不判）。`父` 是**已知但禁止**的键（出现即 `PRODUCT-HAS-PARENT`）。 */
export const PRODUCT_KEYS = Object.freeze(['层级', '主题', '日期', '拍板人', '原话', '状态', 'supersedes', 'superseded_by'])
/** 契约 §2.2：构案头的键 = 产品那套 + 父 / 依据P / 依据bug。 */
export const SCHEME_KEYS = Object.freeze([...PRODUCT_KEYS, '父', '依据P', '依据bug'])
/** 产品与构案共有的那七个键（旧单册口径，`parseDecisionText` 的缺省值）。 */
export const DECISION_KEYS = Object.freeze(['状态', '主题', '日期', '拍板人', '原话', 'supersedes', 'superseded_by'])
/**
 * 构案正文的七节（**只判在不在**，次序不判；产品正文是自由散文，不判这七节 —— 0012 §②-2）。
 * 节名与旧单册同名同义（0012 §③「复用什么」把这条正文形态留了下来）。
 */
export const BODY_SECTIONS = Object.freeze(['背景', '决定', '复用什么', '不复用什么', '新增什么', '公共化时点', '反悔条件'])
/** ⑦ 反悔条件那张表的四列（逐字、次序逐字；0012 §③ 复用）。 */
export const REVERSAL_COLUMNS = Object.freeze(['编号', '条件', '触发时动作', '状态'])
/** 动作列必须说得出这三种处置之一（否则"触发时做什么"读不出来）。 */
export const REVERSAL_ACTION_WORDS = /(supersede|重开|打回)/u
/** 缺陷 id 的形状（契约 §2.2 的 `依据bug` 元素）。 */
export const BUG_ID = /^bug-\d{8}-\d{2,}$/
/** 缺陷册的文件名形状（一天一个 JSON，契约 §1.2）。 */
export const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.json$/
/** 决议册的文件名形状（一条一 md）。 */
export const DECISION_FILE = /^(\d{4})-(.+)\.md$/
/** 三册里除了条目还许有的东西（其余一律 `BOOK-STRAY-FILE`）。 */
export const BOOK_EXTRA_FILES = Object.freeze(['INDEX.md', '.gitkeep'])

/** 派生页的生成标记：首行非空行以 `<!--` 开头，且同时含下面两个针（契约 §1.3）。 */
export const GEN_MARKER = '<!-- 生成物 · 由 node presets/agenia/bin/决议-check.mjs --op index 生成 · 手改当场红 -->'
export const GEN_MARKER_NEEDLES = Object.freeze(['生成物', '决议-check.mjs'])

/** §5.3 的文件级 `依据:` 面（机器枚举，**新加的文件自动进面**）。 */
export const BASIS_SURFACE_GLOBS = Object.freeze([
  { dir: 'presets/agenia/bin', ext: '.mjs', kind: 'code' },
  { dir: 'presets/agenia/lib', ext: '.mjs', kind: 'code' },
  { file: 'presets/agenia/inject.js', kind: 'code' },
  { dir: 'presets/agenia/team', ext: '.md', kind: 'doc' },
  { dir: 'presets/agenia/job-briefs', ext: '.md', kind: 'doc' },
  { file: 'presets/agenia/说明.md', kind: 'doc' },
])
/** §6 的四条**具名**豁免：按文件给，不按目录给。 */
export const BASIS_EXEMPT_NAMES = ['now.md', 'log.md']
export const BASIS_EXEMPT_PREFIXES = ['账本/', '.team/']

/** 契约 §1.3 派生页的三列表头（列名由实现定，第一格必须是编号 / id）。 */
export const PRODUCT_INDEX_COLUMNS = Object.freeze(['编号', '主题', '日期', '状态', '子构案'])
export const SCHEME_INDEX_COLUMNS = Object.freeze(['编号', '主题', '日期', '状态', '依据P', '依据bug'])
export const BUG_INDEX_COLUMNS = Object.freeze(['id', '登记日', '种类', '判定', '处置', '链'])
/** 构案册的第二张表：概念普查（`census` 与 `--op index` 共用同一份渲染，数字因此不可能分叉）。 */
export const CONCEPT_INDEX_COLUMNS = Object.freeze(['概念', '归属', 'census', '构案', '单位'])

/** 概念表口径（与旧单册同名同义，census 的输出形状不变）。 */
export const CONCEPT_COLUMNS = Object.freeze(['概念', '实现探针', '扫描', '归属'])
export const CONCEPT_RULE_COLUMN = '计数口径'
export const INDEX_COLUMNS = Object.freeze(['概念', '归属', 'census', '构案'])
export const INDEX_UNIT_COLUMN = '单位'

/**
 * **每个概念的计数口径**（Gate 4 · M4）。
 *
 * 为什么需要它：探针是子串，所以"命中"天然是**提到**；而这一页要回答的是**实现数**。
 * 两者只在「一处实现 = 一份文件」时才相等 —— 而四种情形里只有一种是这样。所以口径必须写在这一行上，
 * 并且**印进派生页的「单位」列**（读的人不必回推工具的实现）。
 *
 * 四个 token（闭集；概念表里写别的 ⇒ `CONCEPT-TABLE-SHAPE`）：
 *   · `file`       —— 命中的**不同文件**数；注释里的提及**算**（默认口径）；
 *   · `file-code`  —— 命中的**不同文件**数，但只认**代码行**（整行注释不算）；
 *   · `site`       —— 探针**出现点**数（同一文件多处 = 多处）；
 *   · `site-code`  —— 出现的**代码行**数（整行注释不算）；
 *   · `零代码`     —— 按设计没有实现（实现数恒为 0，探针命中只当见证）；
 *   · `atomic-write-by-shape` —— 按**形状**数手搓原子写（临时名上的写 + 同一份文件里的 rename）。
 */
export const COUNT_RULES = Object.freeze({
  file: { label: '份文件（含注释）', kind: 'file', comments: 'any' },
  'file-code': { label: '份代码文件', kind: 'file', comments: 'code' },
  site: { label: '处（出现点）', kind: 'site', comments: 'any' },
  'site-code': { label: '处代码行', kind: 'site', comments: 'code' },
  '零代码': { label: '零代码决定', kind: 'zero', comments: 'any' },
  'atomic-write-by-shape': { label: '处手搓原子写（全库代码面）', kind: 'shape', comments: 'code' },
})
/** 概念表不写第五列时的口径。 */
export const DEFAULT_COUNT_RULE = 'file'
/** 占位值（这些不是"有话"）。 */
export const PLACEHOLDERS = Object.freeze(['—', '-', 'TODO', 'TBD', '待补', '?', ''])
/** em dash。 */
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
 * 读 `决议/概念表.md` 里**第二张表**（`## 原子写形状允许清单`）的条目。
 *
 * 只认第一张表后面的那一节；四列逐字 `| 路径 | 行 | 类别 | 理由 |`（契约 §0.3）。
 * 每一行归一成 `{file, line, kind, why, source_line}`；行级坏法（格子数不是 4 / 行号不是正整数 /
 * 表头不认识）⇒ 该条目带 `malformed` 标记或整体 `problem` —— 判词在 `countShapeSites()` 里按契约的
 * 判定次序给码（这一处只负责"把表读成条目"）。
 *
 * @returns {{present:boolean, entries:Array<object>, problems:Array<object>}}
 */
export function readShapeAllowlist(lines) {
  const headingAt = lines.findIndex((l) => /^\s{0,3}#{2,6}\s+/.test(l) && String(l).includes(SHAPE_ALLOWLIST_HEADING))
  if (headingAt < 0) return { present: false, entries: [], problems: [] }
  const table = firstTable(lines, headingAt + 1)
  if (table === null) {
    return {
      present: true,
      entries: [],
      problems: [problem('SHAPE-ALLOWLIST-SHAPE', `${TABLE_REL}:${headingAt + 1} 「${SHAPE_ALLOWLIST_HEADING}」下面没有表 —— `
        + `这一节要么是四列表 ${JSON.stringify(SHAPE_ALLOWLIST_COLUMNS)}，要么整节不写（契约 §0.3）`, { file: TABLE_REL, line: headingAt + 1 })],
    }
  }
  if (table.columns.length !== SHAPE_ALLOWLIST_COLUMNS.length || table.columns.some((c, i) => c !== SHAPE_ALLOWLIST_COLUMNS[i])) {
    return {
      present: true,
      entries: [],
      problems: [problem('SHAPE-ALLOWLIST-SHAPE', `${TABLE_REL}:${table.startLine} 的列名不是 ${JSON.stringify(SHAPE_ALLOWLIST_COLUMNS)}`
        + `（实得 ${JSON.stringify(table.columns)}）—— 四列逐字、次序也逐字（契约 §0.3）`, { file: TABLE_REL, line: table.startLine })],
    }
  }
  const entries = []
  const problems = []
  table.rows.forEach((cells, idx) => {
    const line = table.startLine + 2 + idx
    if (cells.length !== SHAPE_ALLOWLIST_COLUMNS.length) {
      entries.push({ file: cells[0] ?? null, line: null, kind: cells[2] ?? null, why: cells[3] ?? null, source_line: line, malformed: true, malformed_why: `有 ${cells.length} 格，应当是 4 格`, raw: cells })
      return
    }
    const [fileCell, lineCell, kindCell, whyCell] = cells
    const lineNo = Number(lineCell)
    const entry = {
      file: fileCell,
      line: Number.isInteger(lineNo) && lineNo > 0 ? lineNo : lineCell,
      kind: kindCell,
      why: whyCell,
      source_line: line,
    }
    if (!Number.isInteger(entry.line) || entry.line <= 0) {
      // 行号不是正整数 ⇒ 这一条指不了路："过期"与"写错了"必须分得开（前者报 STALE，后者报 SHAPE）
      entries.push({ ...entry, line: null, raw_line: lineCell, malformed: true, malformed_why: `「行」${JSON.stringify(lineCell)} 不是正整数`, raw: cells })
      return
    }
    entries.push(entry)
  })
  return { present: true, entries, problems }
}

/**
 * 读 `<root>/账本/概念表.md`。
 *
 * @returns {{present:boolean, file:string, rows:Array<object>, problems:Array<object>,
 *            allowlist:Array<object>, allowlist_present:boolean}}
 */
export function readConceptTable(root) {
  const rel = TABLE_REL
  const file = path.join(root, rel)
  if (!existsSync(file)) {
    return {
      present: false,
      file: rel,
      rows: [],
      allowlist: [],
      allowlist_present: false,
      problems: [problem('CONCEPT-TABLE-MISSING', `${rel} 不在 —— 它是 census 的**唯一**概念源（契约 §3.1）；`
        + '这一条上游缺了，`INDEX` 的派生与 `census` 的数都无从谈起')],
    }
  }
  const lines = linesOf(readFileSync(file, 'utf8'))
  const allowlist = readShapeAllowlist(lines)
  const table = firstTable(lines)
  if (table === null) {
    return {
      present: true,
      file: rel,
      rows: [],
      allowlist: allowlist.entries,
      allowlist_present: allowlist.present,
      problems: [problem('CONCEPT-TABLE-SHAPE', `${rel} 里没有第一张 md 表（契约 §3.1）；`
        + '概念表必须是一张四列表：`| 概念 | 实现探针 | 扫描 | 归属 |`')],
    }
  }
  const problems = []
  const allowlistProblems = [...allowlist.problems]
  const want = CONCEPT_COLUMNS
  const hasRuleColumn = table.columns.length === want.length + 1 && table.columns[want.length] === CONCEPT_RULE_COLUMN
  if (!hasRuleColumn && (table.columns.length !== want.length || table.columns.some((c, i) => c !== want[i]))) {
    problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${table.startLine} 的列名不是 ${JSON.stringify(want)}`
      + `（或 ${JSON.stringify([...want, CONCEPT_RULE_COLUMN])}，实得 ${JSON.stringify(table.columns)}）`
      + ' —— 四列逐字、次序也逐字；第五列可选的 `计数口径` 只能加在最后一列（契约 §3.1 / M4）'))
    return { present: true, file: rel, rows: [], problems, declares_rule: false, allowlist: allowlist.entries, allowlist_present: allowlist.present, allowlist_problems: allowlistProblems }
  }
  const columns = hasRuleColumn ? table.columns.length : want.length
  const rows = []
  const seen = new Set()
  table.rows.forEach((cells, idx) => {
    const line = table.startLine + 2 + idx
    if (cells.length !== columns) {
      problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${line} 有 ${cells.length} 格，应当是 ${columns} 格`
        + `（${JSON.stringify(cells)}）—— 缺格的行会让"扫描"或"计数口径"静默变成空值`))
      return
    }
    const [concept, probe, scanRaw, owner, ruleRaw = DEFAULT_COUNT_RULE] = cells.map((c) => c.trim())
    const bad = []
    if (concept === '') bad.push('概念')
    if (probe === '') bad.push('实现探针')
    if (owner === '') bad.push('归属')
    if (bad.length > 0) {
      problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${line} 这几格是空的：${JSON.stringify(bad)}（契约 §3.1）`))
      return
    }
    if (!Object.hasOwn(COUNT_RULES, ruleRaw)) {
      problems.push(problem('CONCEPT-TABLE-SHAPE', `${rel}:${line} 的「${CONCEPT_RULE_COLUMN}」是 ${JSON.stringify(ruleRaw)} —— `
        + `只认闭集 ${Object.keys(COUNT_RULES).map((k) => `\`${k}\``).join(' / ')}（M4：这个数是什么单位，必须由这一行自己说清）`))
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
    rows.push({ concept, probe, scan, owner, rule: ruleRaw, line })
  })
  return {
    present: true,
    file: rel,
    rows,
    problems,
    declares_rule: hasRuleColumn,
    allowlist: allowlist.entries,
    allowlist_present: allowlist.present,
    allowlist_problems: allowlistProblems,
  }
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

/** 不走目录：`.git` / `node_modules` 是仓库的机械件，不是实现（与 `账本/` 同理）。 */
const SKIP_DIRS = new Set(['.git', 'node_modules'])
/** 单份文件的上限（超过就记进 `read_failures`，**不**静默当成"没有实现"）。 */
const MAX_FILE_BYTES = 8 * 1024 * 1024

/**
 * **按形状那条口径的扫描面排除项**（Gate 4 round-1 `MF-2`；相对 `<root>` 的 posix 前缀，逐字）。
 *
 * 六条都是**非代码的施工 / 数据区**，每一条在 `.gitignore` 里都有来历 —— 它们是"换台机器重跑一次就有"的东西，
 * 不是仓库交付的代码：数据根（记忆快照 / 报告 / 一次性 scratch）、施工区、staging 镜像、备份、排查脚手架、字节码。
 *
 * 🔴 三条约束：
 *   ① **只给 `atomic-write-by-shape` 这一条口径用**（别的概念行的面与读数不跟着变）；
 *   ② 切掉了什么必须**印在读数上**（`scan_excluded`：路径 + 那里有几份代码文件）——
 *      不印，"没有实现"与"没扫到"就分不开（`MF-2`：地板靠 9 份未提交 scratch 撑着的那个病）；
 *   ③ 只排**非代码区**。排掉代码面里的真目录就是缩面，不是排除。
 */
export const SHAPE_SCAN_EXCLUSIONS = Object.freeze([
  'presets/agenia/.runtime',
  '.tools/_scratch',
  '.tools/_staging',
  '.tools/_backup',
  '.tools/mount-test',
  '.tools/__pycache__',
])

/** 一份相对 posix 路径落在哪条排除前缀下（不在任何一条下 ⇒ `null`）。 */
function exclusionPrefixOf(rel, prefixes) {
  for (const prefix of prefixes) {
    if (rel === prefix || rel.startsWith(`${prefix}/`)) return prefix
  }
  return null
}

/**
 * 按 glob 枚举文件，并把**被排除前缀切掉的文件**按前缀记下来（一次走完 ⇒ 两个数同源，不会各说各的）。
 *
 * @param {{exclude?: string[]}} [options] `exclude` = 相对 `<root>` 的 posix 前缀；命中的文件不进 `files`，
 *        进 `excluded`（前缀 → 绝对路径列表）。不给 `exclude` ⇒ 与老行为一字不差。
 * @returns {{files:string[], excluded:Map<string, string[]>}}
 */
export function walkGlobDetailed(root, glob, options = {}) {
  const excludes = (options.exclude ?? []).map((p) => String(p).replace(/\\/g, '/'))
  const rel = String(glob).replace(/\\/g, '/')
  const segments = rel.split('/').filter((s) => s !== '' && s !== '.')
  const out = []
  const excluded = new Map()
  if (segments.length === 0) return { files: out, excluded }
  const top = path.resolve(root)
  const go = (abs, i) => {
    if (i === segments.length) {
      if (!isFile(abs)) return
      const hit = excludes.length === 0 ? null : exclusionPrefixOf(relPosix(top, abs), excludes)
      if (hit === null) out.push(abs)
      else {
        if (!excluded.has(hit)) excluded.set(hit, [])
        excluded.get(hit).push(path.resolve(abs))
      }
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
  go(top, 0)
  // `账本/` 整个子树不算（根这一级判；更深的 `x/账本/` 不是账本，照算）
  const ledgerPrefix = `${path.resolve(top, LEDGER_REL)}${path.sep}`
  const files = out.filter((abs) => !abs.startsWith(ledgerPrefix))
  return { files, excluded }
}

/**
 * 按 glob 枚举文件（**只走匹配到的目录**：`src/**\/*.mjs` 不会去读 `.team/`）。
 *
 * 语法（契约 §3.1）：`*` = 段内任意、`**` = 跨段、`?` = 一个字符。
 * `账本/` 在根这一级整体跳过（契约 §3.2 第 2 条：概念表自己含探针字面量）。
 * 不排除任何前缀（要排除、并要求"切掉了什么"的读数时用 `walkGlobDetailed`）。
 */
export function walkGlob(root, glob) {
  return walkGlobDetailed(root, glob).files
}

/**
 * 一个概念的实现数（契约 §3.2）。
 *
 * @returns {{count:number, implementations:string[], scan_empty:boolean, read_failures:Array<object>}}
 */
/**
 * 一行是不是**整行注释**（M4 的 `*-code` 口径用它）。
 *
 * 保守判定：去掉前导空白后以 `//` / `/*` / `*` / `#` / `#!` 开头 ⇒ 注释行。
 * **行尾注释不剥**（`const a = 1 // 探针` 仍算代码行）—— 只做这一步，不做半个语法解析器；
 * 判错的方向必须是"多算一处"，因为少算会让一处重复实现藏起来。
 */
export function isCommentLine(line) {
  return /^\s*(\/\/|\/\*|\*|#!|#)/.test(String(line))
}

// ── 按形状数手搓原子写（构案 0007 · 契约 §0.2 / §0.3）────────────────────────
/**
 * 概念表**第二张表**（允许清单）的标题与四列（逐字）。第一张表仍是概念表：`readConceptTable` 只认第一张，
 * 所以多这一张不改任何现有解析。
 */
export const SHAPE_ALLOWLIST_HEADING = '原子写形状允许清单'
export const SHAPE_ALLOWLIST_COLUMNS = Object.freeze(['路径', '行', '类别', '理由'])
/** 允许清单的类别闭集（契约 §0.3）。 */
export const SHAPE_ALLOWLIST_KINDS = Object.freeze(['shared-implementation', 'non-atomic-rename'])
/** 理由写这些等于没写。 */
export const SHAPE_ALLOWLIST_PLACEHOLDERS = Object.freeze(['—', '-', '?', 'TODO', 'TBD', '待补'])
/** 理由至少要是一句能读的话（契约 §0.3）。 */
export const SHAPE_ALLOWLIST_MIN_REASON = 12
/** 临时名：标识符里含 `tmp`（不区分大小写：`tmp` / `tmpFile` / `bodyTmp` 都算）…… */
const SHAPE_TMP_IDENT = /tmp/i
/** ……或者右值 / 字面量里含 `.tmp` / `.tmp-` / `agenia-tmp`（`` `${file}.tmp-${pid}` `` 也算）。 */
const SHAPE_TMP_LITERAL = /\.tmp|agenia-tmp/i
/** 写临时名的两个原语（`writeFile` 是异步那一个的名字，形状同一个）。第一实参：标识符 / 引号 / 模板串。 */
const SHAPE_WRITE_RE = /\b(?:writeFileSync|writeFile)\s*\(\s*([A-Za-z_$][\w$]*|`[^`]*`|'[^']*'|"[^"]*")/g
const SHAPE_RENAME_RE = /\brenameSync\s*\(\s*([A-Za-z_$][\w$]*|`[^`]*`|'[^']*'|"[^"]*")/g
const SHAPE_DECL_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/
const BARE_IDENT = /^[A-Za-z_$][\w$]*$/

/** 一个实参是不是**临时名**（标识符按声明表的"含不含 tmp"判，字面量按 `.tmp` / `agenia-tmp` 判）。 */
function shapeIsTempName(arg, decls) {
  if (BARE_IDENT.test(arg)) return decls.get(arg) === true || SHAPE_TMP_IDENT.test(arg)
  return SHAPE_TMP_LITERAL.test(arg)
}

/**
 * **一份文件里的原子写形状**（契约 §0.2；这是一个纯文本扫描，不做语法分析）。
 *
 * 两族，各自按**处**记，站点行按契约钉死：
 *   · **A 族 · 手搓文件原子写**：临时名上的 `writeFileSync` / `writeFile`，同一份文件里**之后**有
 *     `renameSync(<同一个临时名>, …)`。**站点行 = 写那一行**。这一族永远不许进允许清单（它就是病）。
 *   · **B 族 · 只 rename 的临时名**：`renameSync(<临时名>, …)`，而这一份文件**没有**直接写那个名字。
 *     可能是合法的（整目录换名 / 清残渣），所以**可以**进允许清单。**站点行 = rename 那一行**。
 *
 * 三条保守选择（判错的方向都是"多算一处"，因为少算会让一处重复实现藏起来）：
 *   ① 整行注释不算（与 `isCommentLine` 同一口径）；行尾注释不剥；
 *   ② 临时名只认**裸标识符**与**字面量**：`writeFileSync(path.join(tmp, 'x'))` 写的不是 `tmp` 这个名字本身
 *      ⇒ 不算"写了那个临时名"（`bodyTmp` 那种整目录换名因此是 B 族）；
 *   ③ 声明表按整份文件收集（跨函数也算）—— "同一个临时名"按**名字**对，不按作用域对。
 *
 * @returns {Array<{line:number, shape:'A'|'B', name:string, line_text:string}>}
 */
export function shapeSitesOf(text) {
  const lines = String(text).split(/\r?\n/)
  const decls = new Map()
  for (const line of lines) {
    if (isCommentLine(line)) continue
    const m = SHAPE_DECL_RE.exec(line)
    if (m === null) continue
    const [, name, rhs] = m
    if (decls.has(name)) continue
    decls.set(name, SHAPE_TMP_IDENT.test(name) || SHAPE_TMP_LITERAL.test(rhs.trim()))
  }
  const writes = []
  const renames = []
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return
    for (const m of line.matchAll(SHAPE_WRITE_RE)) {
      if (!shapeIsTempName(m[1], decls)) continue
      writes.push({ line: i + 1, name: m[1] })
    }
    for (const m of line.matchAll(SHAPE_RENAME_RE)) {
      if (!shapeIsTempName(m[1], decls)) continue
      renames.push({ line: i + 1, name: m[1] })
    }
  })
  const sites = []
  for (const w of writes) {
    if (!renames.some((r) => r.name === w.name && r.line > w.line)) continue
    sites.push({ line: w.line, shape: 'A', name: w.name, line_text: lines[w.line - 1].trim() })
  }
  for (const r of renames) {
    if (writes.some((w) => w.name === r.name)) continue
    sites.push({ line: r.line, shape: 'B', name: r.name, line_text: lines[r.line - 1].trim() })
  }
  return sites.sort((a, b) => (a.line - b.line) || (a.shape < b.shape ? -1 : a.shape > b.shape ? 1 : 0))
}

/** 一条允许清单条目的**结构**问题（契约 §0.3 的六条；证据面在判据侧，不在这里）。 */
function shapeAllowlistEntryProblems(entry) {
  const problems = []
  const push = (message) => problems.push(problem('SHAPE-ALLOWLIST-SHAPE', message))
  const file = typeof entry.file === 'string' ? entry.file.trim() : ''
  if (file === '') push(`允许清单条目缺「${SHAPE_ALLOWLIST_COLUMNS[0]}」（实得 ${JSON.stringify(entry.file)}）`)
  else if (/[*?]/.test(file)) push(`允许清单的「路径」是通配 ${JSON.stringify(file)} —— 一条只许点名**一处**，不许一次盖一片`)
  if (!Number.isInteger(entry.line) || entry.line <= 0) {
    push(`允许清单条目 ${JSON.stringify(file)} 缺「行」（实得 ${JSON.stringify(entry.line)}）—— 不允许"整份文件"进清单`)
  }
  if (!SHAPE_ALLOWLIST_KINDS.includes(entry.kind)) {
    push(`允许清单条目 ${JSON.stringify(file)} 的「类别」是 ${JSON.stringify(entry.kind)}，只认 ${JSON.stringify(SHAPE_ALLOWLIST_KINDS)}`)
  }
  const why = typeof entry.why === 'string' ? entry.why.trim() : ''
  if (why === '' || SHAPE_ALLOWLIST_PLACEHOLDERS.includes(why)) {
    push(`允许清单条目 ${JSON.stringify(file)} 的「理由」是空的 / 占位值（实得 ${JSON.stringify(entry.why)}）`)
  } else if ([...why].length < SHAPE_ALLOWLIST_MIN_REASON) {
    push(`允许清单条目 ${JSON.stringify(file)} 的「理由」只有 ${[...why].length} 个字（至少 ${SHAPE_ALLOWLIST_MIN_REASON}）：读的人要能据它判"该不该留"`)
  }
  return problems
}

/**
 * **按形状数**（`COUNT_RULES['atomic-write-by-shape']` 的实现，契约 §0.2）。
 *
 * 数出来的那个数怎么拆（读的人必须能回推）：
 * ```
 * count = A 族处数 + (B 族处数 − 被允许清单盖住的 B 族处数)
 * sites = 全部命中（A + B）
 * implementations = 算数的那些处（`路径:行号`，升序）
 * ```
 * 允许清单的**判定次序**（契约 §0.3 钉死，免得同一棵树两个码各说一半）：
 *   ① 条目命中一处 **A 族** ⇒ **只报** `SHAPE-ALLOWLIST-HIDES-HANDROLLED`（不再报结构码），那一处**仍计数**；
 *   ② 一处都命不中 ⇒ `SHAPE-ALLOWLIST-STALE`（清单是账，不是许愿池）；
 *   ③ 命中 **B 族**但条目字段不合法 ⇒ `SHAPE-ALLOWLIST-SHAPE`（这一处**不**放行，按 B 计）；
 *   ④ 都合法 ⇒ 放行这一处 B。
 * 形状坏到连 (路径, 行) 都拼不出来的条目（格子少了 / 行号不是整数）⇒ `SHAPE-ALLOWLIST-SHAPE`：
 * 它从来不是一条能指路的条目，报 STALE 会让人去查"那一处是不是没了"，而病在这一行的写法上。
 *
 * `scanExcluded` = 扫描面里被切掉的非代码区（`countConcept` 现算：路径 + 那里有几份代码文件）——
 * 原样进读数 `scan_excluded`：这个 0 是"量过全库代码面之后"的 0，不是"没扫到"。
 */
function countShapeSites(root, { ruleName, rule, files, allowlist, scanExcluded = [] }) {
  const failures = []
  const sites = []
  const hitFiles = new Set()
  for (const file of files) {
    const rel = relPosix(root, file)
    let text = null
    try {
      if (statSync(file).size > MAX_FILE_BYTES) {
        failures.push({ file: rel, reason: `超过 ${MAX_FILE_BYTES} B，本工具不读` })
        continue
      }
      text = readFileSync(file, 'utf8')
    } catch (err) {
      failures.push({ file: rel, reason: String(err?.code ?? err).slice(0, 120) })
      continue
    }
    for (const site of shapeSitesOf(text)) {
      sites.push({ file: rel, line: site.line, shape: site.shape, name: site.name, line_text: site.line_text })
      hitFiles.add(rel)
    }
  }
  sites.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.line - b.line) || (a.shape < b.shape ? -1 : 1))
  const problems = []
  const released = new Set()
  const reading = []
  for (const entry of allowlist) {
    const file = typeof entry.file === 'string' ? entry.file.trim().replace(/\\/g, '/') : ''
    const key = (s) => `${s.file}:${s.line}`
    const matched = entry.malformed === true
      ? []
      : sites.filter((s) => s.file === file && s.line === entry.line)
    const entryRead = {
      file,
      line: Number.isInteger(entry.line) ? entry.line : null,
      kind: typeof entry.kind === 'string' ? entry.kind : null,
      why: typeof entry.why === 'string' ? entry.why : null,
      shape: matched.length === 0 ? null : matched[0].shape,
      source_line: entry.source_line ?? null,
    }
    if (entry.malformed === true) {
      // 连 (路径, 行) 都拼不出来：结构码 + 点出那一行原文（不是 STALE）
      problems.push(problem('SHAPE-ALLOWLIST-SHAPE',
        `${TABLE_REL}:${entry.source_line ?? '?'} 这一行拼不成一条允许清单条目（${entry.malformed_why ?? '格子数不对'}）：${JSON.stringify(entry.raw ?? null)}`,
        { file: TABLE_REL, line: entry.source_line ?? null }))
      reading.push(entryRead)
      continue
    }
    const structProblems = shapeAllowlistEntryProblems(entry)
    const aHit = matched.find((s) => s.shape === 'A') ?? null
    if (aHit !== null) {
      // ① A 族不许被清单藏起来：只报这一条，而且它**仍然计数**（放行只对 B 族有效）
      problems.push(problem('SHAPE-ALLOWLIST-HIDES-HANDROLLED',
        `${TABLE_REL}:${entry.source_line ?? '?'} 的允许清单条目点名了 ${file}:${aHit.line}，而那一处是**手搓文件原子写**（A 族：临时名上的写 + rename）`
        + ' —— A 族就是这一条口径要抓的东西，清单不许把它藏起来；这一处仍然计数（清单不是"消红开关"）',
        { file, line: aHit.line }))
      reading.push(entryRead)
      continue
    }
    if (matched.length === 0) {
      problems.push(problem('SHAPE-ALLOWLIST-STALE',
        `${TABLE_REL}:${entry.source_line ?? '?'} 的允许清单条目点名 ${file}:${entry.line ?? '?'}，而那一处**不是**任何一处命中`
        + '（路径对但行过期 / 那一处已经改好了 / 文件不在扫描面里）—— 清单是账，不是许愿池：过期的条目要删掉或改到真行上',
        { file, line: entry.line ?? null }))
      reading.push(entryRead)
      continue
    }
    if (structProblems.length > 0) {
      // ③ 命中 B 族但字段不合法：报结构码，**不放行**（这一处照 B 计数）
      for (const p of structProblems) problems.push(problem(p.code, `${TABLE_REL}:${entry.source_line ?? '?'} ${p.message}`, { file, line: entry.line }))
      reading.push(entryRead)
      continue
    }
    // ④ 都合法 ⇒ 放行这一处 B
    for (const s of matched) released.add(key(s))
    reading.push(entryRead)
  }
  const aSites = sites.filter((s) => s.shape === 'A')
  const bSites = sites.filter((s) => s.shape === 'B')
  const counted = [...aSites, ...bSites.filter((s) => !released.has(`${s.file}:${s.line}`))]
  const implementations = counted.map((s) => `${s.file}:${s.line}`).sort()
  return {
    count: implementations.length,
    implementations,
    scan_empty: files.length === 0,
    read_failures: failures.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
    rule: ruleName,
    unit: rule.label,
    files: [...hitFiles].sort(),
    scanned_files: files.length,
    scan_excluded: scanExcluded,
    sites,
    allowlist: reading,
    problems,
  }
}

/**
 * 一个概念的实现读数（契约 §3.2 的四条边界 + M4 的**每行计数口径**）。
 *
 * `row.rule` ∈ `COUNT_RULES`（缺省 `file`）：
 *   · `file` / `file-code` ⇒ `implementations` 是**相对 root 的 posix 路径**（升序）；
 *   · `site` / `site-code` ⇒ 元素是 `路径:行号`（一个实现点一行），所以 `count === implementations.length` 永远成立。
 *   · `零代码` ⇒ 实现数**恒为 0**（这一条按设计没有实现）；探针命中的文件只进 `files` 当见证，
 *     `implementations` 为空 —— 页上印 `0 | 零代码决定`（契约 §3.2）。
 *   · `atomic-write-by-shape` ⇒ 交给 `countShapeSites()`：数**处**（A 族 + 未被允许清单盖住的 B 族），
 *     `sites[]` 记全部命中、`allowlist[]` 记每条允许清单条目盖住了哪一处（详见 `SHAPE_*`）。
 *     这一条口径的扫描面**排除 `SHAPE_SCAN_EXCLUSIONS` 那六个非代码区**，切掉了什么进 `scan_excluded`
 *     （路径 + 那里有几份代码文件）。**别的口径不排**：它们的面与读数与加排除之前一字不差。
 * `-code` 的那两种只认**代码行**（`isCommentLine` 的保守判法）。
 *
 * @param {{allowlist?:Array<object>|null}} [options] 形状口径要的允许清单（`决议/概念表.md` 第二张表）
 * @returns {{count:number, implementations:string[], scan_empty:boolean, read_failures:Array<object>,
 *            rule:string, unit:string, files:string[], scanned_files:number,
 *            sites?:Array<{file:string, line:number, shape:'A'|'B'}>, allowlist?:Array<object>, problems?:Array<object>,
 *            scan_excluded?:Array<{path:string, files:number}>}}
 *          `sites` / `allowlist` / `problems` / `scan_excluded` **只有**按形状那一条口径才有
 *          （其余口径不按处数、也没有排除面可报）。
 */
export function countConcept(root, row, options = {}) {
  const ruleName = Object.hasOwn(COUNT_RULES, row.rule) ? row.rule : DEFAULT_COUNT_RULE
  const rule = COUNT_RULES[ruleName]
  const shape = rule.kind === 'shape'
  const abs = new Set()
  /** 被排除前缀切掉的代码文件（前缀 → 绝对路径集合）；**只**在按形状那一条口径下收集。 */
  const excludedHits = new Map()
  if (shape) {
    // 只印**盘上存在**的前缀（空目录也给一行 `files: 0`：读者要能看出这一块被切过）
    for (const prefix of SHAPE_SCAN_EXCLUSIONS) {
      if (existsSync(path.join(root, ...String(prefix).split('/')))) excludedHits.set(prefix, new Set())
    }
  }
  for (const glob of row.scan) {
    const walked = walkGlobDetailed(root, glob, shape ? { exclude: SHAPE_SCAN_EXCLUSIONS } : {})
    for (const file of walked.files) abs.add(path.resolve(file))
    for (const [prefix, hits] of walked.excluded) {
      if (!excludedHits.has(prefix)) excludedHits.set(prefix, new Set())
      for (const file of hits) excludedHits.get(prefix).add(path.resolve(file))
    }
  }
  const files = [...abs].sort()
  const scanExcluded = [...excludedHits]
    .map(([prefix, hits]) => ({ path: prefix, files: hits.size }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (shape) {
    return countShapeSites(root, { ruleName, rule, files, allowlist: options.allowlist ?? [], scanExcluded })
  }
  const probeBuf = Buffer.from(String(row.probe), 'utf8')
  const implementations = []
  const hitFiles = []
  const failures = []
  for (const file of files) {
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
    if (!bytes.includes(probeBuf)) continue
    const rel = relPosix(root, file)
    const lines = bytes.toString('utf8').split(/\r?\n/)
    const hitLines = []
    lines.forEach((line, i) => {
      if (!line.includes(String(row.probe))) return
      if (rule.comments === 'code' && isCommentLine(line)) return
      hitLines.push(i + 1)
    })
    if (hitLines.length === 0) continue // 只出现在注释里（且这一行的口径说"只看代码"）⇒ 不算
    hitFiles.push(rel)
    if (rule.kind === 'site') for (const n of hitLines) implementations.push(`${rel}:${n}`)
    else implementations.push(rel)
  }
  implementations.sort()
  const zeroCode = rule.kind === 'zero'
  return {
    count: zeroCode ? 0 : implementations.length,
    implementations: zeroCode ? [] : implementations,
    scan_empty: abs.size === 0,
    read_failures: failures.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
    rule: ruleName,
    unit: rule.label,
    files: hitFiles.sort(),
    scanned_files: abs.size,
  }
}

/** 绝对路径 ⇒ 相对 `<root>` 的 posix 路径。 */
export function relPosix(root, abs) {
  return path.relative(path.resolve(root), abs).replace(/\\/g, '/')
}
// ── 头块：唯一一份切法（契约 §2）────────────────────────────────────────────
const KEY_LINE = /^\s*([^:：\s]+)\s*[:：]\s*(.*)$/
const H1_LINE = /^#\s+/u
const H1_IDENTITY = /^#\s+(\S+)\s+(\d{4})\s*(?:[·・•]\s*)?(.*)$/u

/** 日期形状：`YYYY-MM-DD`，且解析后回写逐字相同。 */
export function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return false
  return new Date(ms).toISOString().slice(0, 10) === value
}

/**
 * 引用表的值。三种口径（`kind`）：
 *   · `decision` —— `supersedes` / `superseded_by` / `依据P`：`—` 或逗号分隔的四位编号（可带 `构案/` `产品/` 前缀）；
 *   · `bug`      —— `依据bug`：`—` 或逗号分隔的 `bug-YYYYMMDD-NN`；
 *   · `parent`   —— `父`：**恰好一个**四位编号或缺陷 id。
 * 分隔符逐字是**半角逗号**（`、` 不算）。
 */
export function parseRefList(value, { kind = 'decision' } = {}) {
  const v = String(value).trim()
  if (v === DASH) return { ok: true, refs: [], why: null }
  if (v === '') return { ok: false, refs: [], why: `空值 —— 没有就写 \`${DASH}\`` }
  const parts = v.split(',').map((s) => s.trim())
  const refs = []
  const seen = new Set()
  for (const raw of parts) {
    if (raw === '') return { ok: false, refs: [], why: '引用表里有空格子（逗号前后多写了逗号）' }
    let ref = null
    if (kind === 'bug') {
      if (!BUG_ID.test(raw)) return { ok: false, refs: [], why: `\`${raw}\` 不是缺陷 id（形状 \`bug-YYYYMMDD-NN\`）` }
      ref = { raw, series: null, id: raw, bug: true }
    } else {
      const m = /^(?:(构案|产品)\/)?(\d+)$/u.exec(raw)
      if (m === null) return { ok: false, refs: [], why: `\`${raw}\` 不是 \`NNNN\` / \`构案/NNNN\` / \`产品/NNNN\`` }
      if (m[2].length !== 4) return { ok: false, refs: [], why: `\`${raw}\` 的编号必须是四位（\`0001\` 与 \`1\` 不是同一个引用）` }
      ref = { raw, series: m[1] ?? null, id: m[2] }
    }
    if (seen.has(ref.id)) return { ok: false, refs: [], why: `\`${raw}\` 在同一个引用表里出现了两次` }
    seen.add(ref.id)
    refs.push(ref)
  }
  if (kind === 'parent' && refs.length !== 1) {
    return { ok: false, refs, why: `\`父\` 只能写一个编号（实得 ${refs.length} 个）` }
  }
  return { ok: true, refs, why: null }
}

/** 一个键的值形状。返回 `why` 或 `null`（`父` 空值的处置在 `judgeEntry` 里，这里只判形状）。 */
export function checkKeyValue(key, value) {
  const v = String(value).trim()
  switch (key) {
    case '层级': return v === '产品' || v === '构案' ? null : `只能是 \`产品\` 或 \`构案\`（逐字），实得 ${JSON.stringify(v)}`
    case '状态': return v === '生效' || v === '已废' ? null : `只能是 \`生效\` 或 \`已废\`（逐字），实得 ${JSON.stringify(v)}`
    case '主题':
      if (v === '') return '空的 —— 主题必须非空'
      if (v === DASH) return `\`${DASH}\` 不是主题`
      if (/[,，]/u.test(v)) return '含逗号 —— 主题是一个概念的名字，不是列表'
      return null
    case '日期': return isRealDate(v) ? null : `${JSON.stringify(v)} 不是真实的 \`YYYY-MM-DD\`（解析后回写要逐字相同）`
    case '拍板人': return PLACEHOLDERS.includes(v) ? `${JSON.stringify(v)} 是占位，不是拍板人` : null
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
    case '父': {
      if (v === '' || v === DASH) return null // 「父为空」是 `SCHEME-PARENT-MISSING`，不是形状问题
      const asDecision = parseRefList(v, { kind: 'parent' })
      if (asDecision.ok) return null
      const asBug = parseRefList(v, { kind: 'bug' })
      if (asBug.ok && asBug.refs.length === 1) return null
      return `\`${v}\` 既不是四位编号（产品/构案），也不是缺陷 id（/^bug-\\d{8}-\\d{2,}$/）`
    }
    case '依据P': {
      const r = parseRefList(v)
      return r.ok ? null : r.why
    }
    case '依据bug': {
      const r = parseRefList(v, { kind: 'bug' })
      return r.ok ? null : r.why
    }
    default: return null
  }
}

/**
 * **头块切分 —— 全仓唯一一份**（决议文件与派工卡共用；`supersede` 找那两行也走这里）。
 *
 *   1. 跳过开头空行，第一行非空必须是 H1（`^#\s+`）；
 *   2. H1 之后必须**恰好一行空行**，然后是头块；
 *   3. 头块 = 从那一行起、到**第一条空行**为止的连续行；头块为空 ⇒ 不成立。
 */
export function splitHeaderBlock(text) {
  const lines = linesOf(text)
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i += 1
  if (i >= lines.length || !H1_LINE.test(lines[i])) {
    return { ok: false, why: `${i + 1} 起没有 H1（第一个非空行必须 \`# …\`）`, line: i + 1, lines }
  }
  const h1 = lines[i].trim()
  if (i + 1 >= lines.length || lines[i + 1].trim() !== '') {
    return { ok: false, why: `${i + 2} 不是空行 —— H1 之后必须先空一行再写头块`, line: i + 2, lines, h1, h1Line: i + 1 }
  }
  const block = []
  let j = i + 2
  for (; j < lines.length; j += 1) {
    if (lines[j].trim() === '') break
    block.push({ text: lines[j], line: j + 1 })
  }
  if (block.length === 0) {
    return { ok: false, why: `${i + 2} 之后直接就是正文/空行 —— 头块为空`, line: i + 2, lines, h1, h1Line: i + 1 }
  }
  return {
    ok: true,
    why: null,
    lines,
    h1,
    h1Line: i + 1,
    blankLine: i + 2,
    range: { from: i + 3, to: j },
    block,
    bodyStartLine: j + 1,
    bodyLines: lines.slice(j),
  }
}

/** 一份 md 里"有几个 H1"（围栏代码块里的 `#` 不算）。契约 §1.2 的「一份 md 恰好一条决议」靠它。 */
export function countH1(text) {
  let fenced = false
  let n = 0
  for (const line of linesOf(text)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue }
    if (fenced) continue
    if (H1_LINE.test(line)) n += 1
  }
  return n
}

/**
 * 解析一份决议文件（`keys` 决定认哪套头：产品八键 / 构案十一键）。
 *
 * 键的处理有三处**级联**（不然一处病会报成两条）：
 *   · 产品写了 `父` ⇒ 只报 `PRODUCT-HAS-PARENT`（不叠加 `DEC-UNKNOWN-KEY`）；
 *   · 构案缺 `父` ⇒ 只报 `SCHEME-PARENT-MISSING`（不叠加 `DEC-MISSING-KEY`）；
 *   · 头块整体不成立 ⇒ 只报那一条（不补七条"缺键"）。
 */
export function parseDecisionText(text, { relFile, book, id, nameTitle, keys = DECISION_KEYS }) {
  const problems = []
  const out = { h1: null, header: {}, headerLines: [], bodyLines: [], bodyStartLine: null, problems }
  const split = splitHeaderBlock(text)
  if (!split.ok) {
    problems.push(problem('DEC-HEADER-MISSING', `${relFile}:${split.line} ${split.why}（契约 §2）`, { file: relFile, line: split.line }))
    return out
  }
  const { block, h1, h1Line, bodyLines, bodyStartLine } = split
  out.h1 = h1
  out.bodyLines = bodyLines
  out.bodyStartLine = bodyStartLine
  const identity = H1_IDENTITY.exec(h1)
  if (identity === null) {
    problems.push(problem('DEC-TITLE-MISMATCH', `${relFile}:${h1Line} 的 H1 认不出系列+编号+标题：${JSON.stringify(h1)}`
      + `（应当是 \`# ${book} ${id} · ${nameTitle}\`）`, { file: relFile, line: h1Line }))
  } else {
    const [, h1Series, h1Id, h1Title] = identity
    const wrong = []
    if (h1Series !== book) wrong.push(`系列 ${JSON.stringify(h1Series)} ≠ 目录 ${JSON.stringify(book)}`)
    if (h1Id !== id) wrong.push(`编号 ${h1Id} ≠ 文件名 ${id}`)
    if (h1Title.trim() !== nameTitle) wrong.push(`标题 ${JSON.stringify(h1Title.trim())} ≠ 文件名 ${JSON.stringify(nameTitle)}`)
    if (wrong.length > 0) {
      problems.push(problem('DEC-TITLE-MISMATCH', `${relFile}:${h1Line} 的 H1 与身份对不上：${wrong.join(' · ')}`
        + `（H1 = ${JSON.stringify(h1)}；期望 \`# ${book} ${id} · ${nameTitle}\`）`, { file: relFile, line: h1Line }))
    }
  }
  const allowed = book === '产品' ? [...keys, '父'] : [...keys]
  const seen = new Map()
  let parentOnProduct = 0
  for (const { text: lineText, line: lineNo } of block) {
    const m = KEY_LINE.exec(lineText)
    if (m === null) {
      problems.push(problem('DEC-HEADER-MISSING', `${relFile}:${lineNo} 不是 \`键: 值\` 形状：`
        + `${JSON.stringify(String(lineText).slice(0, 60))} —— 头块里每一行都必须能解析（契约 §2）`,
      { file: relFile, line: lineNo }))
      continue
    }
    const key = m[1]
    const value = m[2].trim()
    if (!allowed.includes(key)) {
      problems.push(problem('DEC-UNKNOWN-KEY', `${relFile}:${lineNo} 出现了这套头之外的键 \`${key}\` —— `
        + `机器只解析：${allowed.join(' / ')}`, { file: relFile, line: lineNo, key }))
      continue
    }
    if (book === '产品' && key === '父') {
      parentOnProduct += 1
      continue // 值不解析：产品的父一律不许有
    }
    if (seen.has(key)) {
      problems.push(problem('DEC-DUP-KEY', `${relFile}:${lineNo} 的 \`${key}\` 出现了第二次（第一次在 :${seen.get(key)}）`,
        { file: relFile, line: lineNo, key }))
      continue
    }
    seen.set(key, lineNo)
    out.header[key] = value
    out.headerLines.push({ key, value, line: lineNo })
    const why = checkKeyValue(key, value)
    if (why !== null) {
      problems.push(problem('DEC-BAD-VALUE', `${relFile}:${lineNo} \`${key}\` 的值 ${JSON.stringify(value)} 形状不对：${why}`,
        { file: relFile, line: lineNo, key }))
    }
  }
  if (book === '产品' && parentOnProduct > 0) {
    problems.push(problem('PRODUCT-HAS-PARENT', `${relFile} 的头块写了 \`父\` —— 产品是老板发的，**没有父**（契约 §2.1）`,
      { file: relFile }))
  }
  const missing = keys.filter((k) => !seen.has(k))
  const parentMissing = book === '构案' && missing.includes('父')
  if (parentMissing) {
    problems.push(problem('SCHEME-PARENT-MISSING', `${relFile} 的头块缺 \`父\`（或写了 \`${DASH}\`）—— `
      + '构案必须挂在一条产品号或一个缺陷 id 上（契约 §2.2-1）', { file: relFile }))
  }
  const rest = missing.filter((k) => !(parentMissing && k === '父'))
  if (rest.length > 0 && !problems.some((p) => p.code === 'DEC-HEADER-MISSING')) {
    for (const key of rest) {
      problems.push(problem('DEC-MISSING-KEY', `${relFile} 的头块缺 \`${key}\`（契约 §2）`, { file: relFile, key }))
    }
  }
  return out
}

// ── 构案正文形态（0012 §③：七节 + ⑦ 四列表）────────────────────────────────
/**
 * `## ⑤ 新增什么` ⇒ `新增什么`（去掉编号前缀；节名要**包含**七节名之一）。
 *
 * 只认 `##` 二级标题（`###` / 围栏代码块里的 `##` 不算正文节）。
 */
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

/**
 * 构案正文的形态（0012 §③ 那一族的**唯一**实现；`readDecisionFile` 只调这一处）。
 *
 * 判两件：
 *   ① 七节 `## ① …`…`## ⑦ …` 各在不在 —— 缺一节一条 `BODY-SECTION-MISSING`；
 *   ② ⑦ 那一节下是一张 **4 列**表（列名逐字 `编号 / 条件 / 触发时动作 / 状态`），且
 *      「触发时动作」那格含 `supersede` / `重开` / `打回` 之一 —— 表不在 ⇒ `REVERSAL-TABLE-MISSING`，
 *      列/行不合形状 ⇒ `REVERSAL-ROW-SHAPE`。
 *
 * 级联（契约 §9.3 同一口径）：**⑦ 那一节不在** ⇒ 只报 `BODY-SECTION-MISSING`，不补"表缺"。
 * 产品册**不要求**这两节（0012 §②-2：产品 = 原话 + 影响面，不是七节模板）。
 *
 * @returns {{sections:string[], reversalRows:Array<object>, problems:Array<object>}}
 */
export function parseBodyShape(book, bodyLines, relFile) {
  const problems = []
  const found = []
  const spans = []
  let fenced = false
  for (let k = 0; k < bodyLines.length; k += 1) {
    const line = bodyLines[k]
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue }
    if (fenced) continue
    const heading = sectionHeading(line)
    if (heading === null) continue
    const hit = BODY_SECTIONS.find((name) => headingIs(heading, name))
    if (hit !== undefined && !found.includes(hit)) {
      found.push(hit)
      spans.push({ name: hit, from: k })
    }
  }
  const sections = BODY_SECTIONS.filter((name) => found.includes(name))
  if (book !== '构案') return { sections, reversalRows: [], problems }
  const missing = BODY_SECTIONS.filter((name) => !found.includes(name))
  for (const name of missing) {
    problems.push(problem('BODY-SECTION-MISSING', `${relFile} 的正文缺 \`## ${name}\` 这一节 —— `
      + '构案的正文是这七节（0012 §③；只判在不在，次序不判）', { file: relFile }))
  }
  const reversal = spans.find((s) => s.name === '反悔条件')
  if (reversal === undefined) return { sections, reversalRows: [], problems }
  const after = spans.filter((s) => s.from > reversal.from).map((s) => s.from)
  const end = after.length === 0 ? bodyLines.length : Math.min(...after)
  const slice = bodyLines.slice(reversal.from + 1, end)
  const table = firstTable(slice, 0)
  if (table === null) {
    problems.push(problem('REVERSAL-TABLE-MISSING', `${relFile} 的 ⑦ 反悔条件下没有表 —— 这一节必须是 `
      + `\`| 编号 | 条件 | 触发时动作 | 状态 |\` 四列表（0012 §③）`, { file: relFile }))
    return { sections, reversalRows: [], problems }
  }
  if (table.columns.length !== REVERSAL_COLUMNS.length || table.columns.some((c, i) => c !== REVERSAL_COLUMNS[i])) {
    problems.push(problem('REVERSAL-ROW-SHAPE', `${relFile} 的 ⑦ 表列名不是 ${JSON.stringify(REVERSAL_COLUMNS)}`
      + `（实得 ${JSON.stringify(table.columns)}）—— 四列逐字、次序也逐字（0012 §③）`, { file: relFile }))
    return { sections, reversalRows: [], problems }
  }
  const reversalRows = []
  const ids = new Set()
  table.rows.forEach((cells) => {
    if (cells.length !== REVERSAL_COLUMNS.length) {
      problems.push(problem('REVERSAL-ROW-SHAPE', `${relFile} 的 ⑦ 表有一行是 ${cells.length} 格，应当是 4 格`
        + `（${JSON.stringify(cells)}）—— 缺格会让「状态」静默变成空`, { file: relFile }))
      return
    }
    const [idCell, condition, action, status] = cells
    const why = []
    if (!/^RC-\d+$/.test(idCell)) why.push(`「编号」${JSON.stringify(idCell)} 不是 \`RC-<正整数>\``)
    else if (ids.has(idCell)) why.push(`「编号」${JSON.stringify(idCell)} 在本文件里重复`)
    else ids.add(idCell)
    if (condition === '') why.push('「条件」是空的')
    if (action === '') why.push('「触发时动作」是空的')
    else if (!REVERSAL_ACTION_WORDS.test(action)) why.push(`「触发时动作」${JSON.stringify(action)} 里没有 \`supersede\` / \`重开\` / \`打回\``)
    const state = status.trim()
    if (state !== '未触发' && state !== '已触发') why.push(`「状态」${JSON.stringify(status)} 只能是 \`未触发\` / \`已触发\``)
    if (why.length > 0) {
      problems.push(problem('REVERSAL-ROW-SHAPE', `${relFile} 的 ⑦ 表有一行不合形状（${idCell || '?'}）：${why.join(' · ')}（0012 §③）`,
        { file: relFile, row: idCell }))
      return
    }
    reversalRows.push({ id: idCell, condition, action, status: state })
  })
  return { sections, reversalRows, problems }
}

// ── 三册：读 ───────────────────────────────────────────────────────────────
function bookDir(root, book) {
  return path.join(root, LEDGER_REL, book)
}

/** 一条决议的条目（头解析 + 自洽三条）。`problems` 已经 push 进总表；`clean` = 这一条没毛病。 */
function readDecisionFile(root, book, name, problems) {
  const relFile = `${LEDGER_REL}/${book}/${name}`
  const identity = DECISION_FILE.exec(name)
  if (identity === null) {
    problems.push(problem('BOOK-STRAY-FILE', `${relFile} 不是 \`NNNN-标题.md\` —— ${book}册里只许放一条一 md 的决议、INDEX.md、.gitkeep（契约 §1.2）`, { file: relFile }))
    return null
  }
  const [, id, nameTitle] = identity
  const text = readText(path.join(bookDir(root, book), name))
  if (text === null) {
    problems.push(problem('DEC-HEADER-MISSING', `${relFile} 读不出来`, { file: relFile }))
    return null
  }
  if (countH1(text) > 1) {
    problems.push(problem('DEC-MULTI-PER-FILE', `${relFile} 里有 ${countH1(text)} 个 H1 —— 一份 md 恰好一条决议（契约 §1.2）`, { file: relFile }))
    return null
  }
  const keys = book === '产品' ? PRODUCT_KEYS : SCHEME_KEYS
  const parsed = parseDecisionText(text, { relFile, book, id, nameTitle, keys })
  const before = problems.length
  problems.push(...parsed.problems)
  const entry = {
    book,
    series: book,
    id,
    file: relFile,
    title: nameTitle,
    h1: parsed.h1,
    header: parsed.header,
    status: parsed.header['状态'] === '生效' || parsed.header['状态'] === '已废' ? parsed.header['状态'] : null,
    raw_status: parsed.header['状态'] ?? null,
    topic: (parsed.header['主题'] ?? '').trim(),
    date: (parsed.header['日期'] ?? '').trim(),
    decider: (parsed.header['拍板人'] ?? '').trim(),
    quote: (parsed.header['原话'] ?? '').trim(),
    level: (parsed.header['层级'] ?? '').trim(),
    parent: book === '构案' ? (parsed.header['父'] ?? '').trim() : null,
    basisP: [],
    basisBug: [],
    parent_ref: null,
    supersedes: [],
    superseded_by: [],
    header_clean: parsed.problems.length === 0,
  }
  if (entry.level !== book) {
    problems.push(problem('DEC-BAD-VALUE', `${relFile} 的 \`层级\` 是 ${JSON.stringify(entry.level)}，而它在 ${book}册 —— 头字段与所在册必须一致（契约 §2.1/§2.2）`, { file: relFile, key: '层级' }))
  }
  const sup = parseRefList(entry.header.supersedes ?? DASH)
  const supBy = parseRefList(entry.header.superseded_by ?? DASH)
  entry.supersedes = sup.ok ? sup.refs : []
  entry.superseded_by = supBy.ok ? supBy.refs : []
  if (book === '构案') {
    const bp = parseRefList(entry.header['依据P'] ?? DASH)
    const bb = parseRefList(entry.header['依据bug'] ?? DASH, { kind: 'bug' })
    entry.basisP = bp.ok ? bp.refs : []
    entry.basisBug = bb.ok ? bb.refs : []
    const p = parseRefList(entry.parent ?? DASH, { kind: 'parent' })
    // `父` 可能是四位编号，也可能是缺陷 id —— 两种都试，谁成立认谁
    const p2 = p.ok ? p : parseRefList(entry.parent ?? DASH, { kind: 'bug' })
    entry.parent_ref = (p.ok ? p.refs[0] : (p2.ok ? p2.refs[0] : null)) ?? null
    const noBasis = entry.basisP.length === 0 && entry.basisBug.length === 0
    if (noBasis) {
      problems.push(problem('SCHEME-NO-BASIS', `${relFile} 的 \`依据P\` 与 \`依据bug\` 都是 \`${DASH}\` —— 构案必须挂在什么上（契约 §2.2-2）`, { file: relFile }))
    } else if (entry.parent_ref !== null && entry.parent !== '' && entry.parent !== DASH) {
      const members = new Set([...entry.basisP.map((r) => r.id), ...entry.basisBug.map((r) => r.id)])
      if (!members.has(entry.parent_ref.id)) {
        problems.push(problem('SCHEME-PARENT-INCONSISTENT', `${relFile} 的 \`父: ${entry.parent}\` 不在来源列表里`
          + `（依据P = [${entry.basisP.map((r) => r.id).join(',') || DASH}] / 依据bug = [${entry.basisBug.map((r) => r.id).join(',') || DASH}]）`
          + ' —— 主父必须是来源列表的成员（契约 §2.2-3）', { file: relFile, ref: entry.parent }))
      }
    }
  }
  /**
   * 正文形态（0012 §③）只判**构案**；产品是自由散文。
   * 🔴 这一族**不进 `entry.clean`**：它不影响派生页怎么渲染（页只读头与链），
   *    所以"正文缺一节"不该让整册的 `INDEX-*` 判据被跳过（契约 §9.3 的级联只认头块）。
   * 头块整体不成立（`DEC-HEADER-MISSING`）时正文从哪开始都无从谈起 —— 只报上游那一条。
   */
  entry.body_sections = []
  entry.reversal_rows = []
  entry.body_clean = true
  entry.body_problems = []
  entry.clean = problems.length === before
  const headerBroken = parsed.problems.some((p) => p.code === 'DEC-HEADER-MISSING')
  if (book === '构案' && parsed.bodyStartLine !== null && !headerBroken) {
    const body = parseBodyShape(book, parsed.bodyLines, relFile)
    entry.body_sections = body.sections
    entry.reversal_rows = body.reversalRows
    entry.body_clean = body.problems.length === 0
    // 正文形态**不在这里进总表**：`readBook` 先按头/链算 `clean`（页要不要判），再把这一族补进去。
    entry.body_problems = body.problems
  }
  return entry
}

/**
 * 读一册。产品 / 构案：一条一 md；缺陷：一天一个 JSON（折叠走 `缺陷折叠.mjs`）。
 *
 * @returns {{present:boolean, entries:Array, states:Array, clean:boolean, ids_on_disk:string[]}}
 */
export function readBook(root, book, problems) {
  const dir = bookDir(root, book)
  if (!isDir(dir)) {
    problems.push(problem('BOOK-MISSING', `${LEDGER_REL}/${book}/ 不在 —— 三册同级，缺一册就是这一条（契约 §1.1）`, { file: `${LEDGER_REL}/${book}` }))
    return { present: false, entries: [], states: [], clean: false, ids_on_disk: [] }
  }
  if (book === '缺陷') {
    const names = listDir(dir)
    for (const name of names) {
      if (BOOK_EXTRA_FILES.includes(name)) continue
      if (!DAY_FILE.test(name)) {
        problems.push(problem('BOOK-STRAY-FILE', `${LEDGER_REL}/${book}/${name} 不是 \`YYYY-MM-DD.json\` —— 缺陷册一天一个事件流（契约 §1.2）`, { file: `${LEDGER_REL}/${book}/${name}` }))
      }
    }
    const folded = foldBugBook({ root })
    problems.push(...folded.problems)
    return { present: true, entries: [], states: folded.states, clean: folded.problems.length === 0, ids_on_disk: folded.states.map((s) => s.id) }
  }
  const before = problems.length
  const entries = []
  const seen = new Map()
  /**
   * 盘上**有这个编号的文件**（哪怕那一份头块坏了、`readDecisionFile` 返回 `null`）。
   * 父解析用它分开两种"解析不到"：**没有这条记录**（悬空）vs **有那份文件、读不出来**（上游已报）。
   */
  const idsOnDisk = []
  for (const name of listDir(dir)) {
    if (BOOK_EXTRA_FILES.includes(name)) continue
    const identity = DECISION_FILE.exec(name)
    if (identity !== null) idsOnDisk.push(identity[1])
    const entry = readDecisionFile(root, book, name, problems)
    if (entry === null) continue
    const key = `${book}/${entry.id}`
    if (seen.has(key)) {
      problems.push(problem('DEC-DUP-ID', `${entry.file} 的编号 ${entry.id} 与 ${seen.get(key)} 撞了 —— 同一册里编号唯一`, { file: entry.file, ref: entry.id }))
      continue
    }
    seen.set(key, entry.file)
    entries.push(entry)
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  /** `clean` 只认头/链（决定派生页要不要判）；正文形态在它之后补进总表。 */
  const clean = problems.length === before
  for (const entry of entries) {
    if (Array.isArray(entry.body_problems) && entry.body_problems.length > 0) problems.push(...entry.body_problems)
    delete entry.body_problems
  }
  return { present: true, entries, states: [], clean, ids_on_disk: idsOnDisk }
}

/** 一条引用解析到哪一条决议（`null` = 解析不到）。裸编号先本册、再另一册（唯一时）。 */
export function resolveRef(decisions, fromBook, ref) {
  if (ref !== null && ref !== undefined && ref.bug === true) return null
  const book = ref.series ?? fromBook
  const hit = decisions.find((d) => d.book === book && d.id === ref.id)
  if (hit !== undefined) return hit
  if (ref.series === null) {
    const others = decisions.filter((d) => d.id === ref.id && d.book !== book)
    if (others.length === 1) return others[0]
  }
  return null
}

/**
 * **同一册里同一主题只许一条 `生效`**（0012 §②-2 的不变式；旧单册检查器也叫 `DUPLICATE-LIVE-TOPIC`）。
 *
 * 三条口径：
 *   · **按册各判**：`产品` 与 `构案` 各一组 —— 产品 0001 与构案 0012 同主题是**合法**的
 *     （构案就是为那条产品写的），跨册不许判红；
 *   · **两条都要点名**：报文里写出 `产品/0001` 与 `产品/0002` 两个 id（只报"有重复"不算）；
 *   · 已废的那一条不参与（换掉旧的决定 = 旧文翻成 `已废` + 双向指针，见 `judgePointers`）。
 *
 * 级联：头块坏了的条目不参与（`topic` 读不出来时会天然跳过）；主题为空也不参与。
 */
export function judgeDuplicateTopics(decisions, problems) {
  const groups = new Map()
  for (const d of decisions) {
    if (d.status !== '生效' || d.topic === '') continue
    const key = `${d.book}\u0000${d.topic}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(d)
  }
  const duplicated = []
  for (const [, list] of groups) {
    if (list.length < 2) continue
    const names = list.map((d) => `${d.book}/${d.id}`)
    duplicated.push({ book: list[0].book, topic: list[0].topic, ids: list.map((d) => d.id) })
    problems.push(problem('DUPLICATE-LIVE-TOPIC', `同一册里主题 \`${list[0].topic}\` 有 ${list.length} 条 \`生效\`：${names.join(' / ')}`
      + ` —— 一个主题只许一条生效；换掉旧的要把它翻成 \`已废\` 并写双向 \`superseded_by\`（0012 §②-2）`,
    { book: list[0].book, concept: list[0].topic, ids: list.map((d) => d.id) }))
  }
  return duplicated
}

/** 指针判据（悬空 / 自称 / 双向对称 / 状态与指针自洽）。 */
export function judgePointers(decisions) {
  const problems = []
  const dirty = new Set()
  const pairs = new Set()
  for (const d of decisions) {
    const check = (refs, direction) => {
      for (const ref of refs) {
        const target = resolveRef(decisions, d.book, ref)
        if (target === null) {
          problems.push(problem('POINTER-DANGLING', `${d.file} 的 \`${direction}: ${ref.raw}\` 解析不到 —— 账本里没有这一条`, { file: d.file, ref: ref.raw }))
          dirty.add(d)
          continue
        }
        if (target.file === d.file) {
          problems.push(problem('POINTER-SELF', `${d.file} 的 \`${direction}: ${ref.raw}\` 指向自己 —— 自称不算 supersede`, { file: d.file, ref: ref.raw }))
          dirty.add(d)
          continue
        }
        const pairKey = [d.file, target.file].sort().join('\u0000')
        if (pairs.has(pairKey)) continue
        pairs.add(pairKey)
        const forward = direction === 'supersedes'
          ? target.superseded_by.some((r) => resolveRef(decisions, target.book, r)?.file === d.file)
          : target.supersedes.some((r) => resolveRef(decisions, target.book, r)?.file === d.file)
        if (!forward) {
          const want = direction === 'supersedes' ? 'superseded_by' : 'supersedes'
          problems.push(problem('POINTER-ASYMMETRIC', `${d.book}/${d.id} 的 \`${direction}\` 指向 ${target.book}/${target.id}，`
            + `而 ${target.book}/${target.id} 的 \`${want}\` 里没有 ${d.id} —— 指针必须双向`, { file: d.file, ref: `${d.id}→${target.id}`, ids: [d.id, target.id] }))
          dirty.add(d)
          dirty.add(target)
        }
      }
    }
    check(d.supersedes, 'supersedes')
    check(d.superseded_by, 'superseded_by')
  }
  for (const d of decisions) {
    if (d.status === '生效' && d.superseded_by.length > 0) {
      problems.push(problem('LIVE-WITH-SUCCESSOR', `${d.book}/${d.id} 还是 \`生效\`，而 \`superseded_by\` 已经写了继任者`
        + ' —— 两条状态只能有一条', { file: d.file, ref: d.id }))
      dirty.add(d)
    }
    if (d.status === '已废' && d.superseded_by.length === 0) {
      problems.push(problem('RETIRED-WITHOUT-SUCCESSOR', `${d.book}/${d.id} 是 \`已废\`，而 \`superseded_by\` 是 \`${DASH}\` —— 废掉一条决议必须指向继任者`, { file: d.file, ref: d.id }))
      dirty.add(d)
    }
    d.pointer_clean = !dirty.has(d)
  }
  for (const d of decisions) if (d.pointer_clean === undefined) d.pointer_clean = true
  return problems
}

/**
 * **构案头的 `父` 必须解析到一条存在且生效的记录**（契约 §2.2：`父` 是一个产品号或缺陷 id）。
 *
 * 为什么单开一条：`SCHEME-PARENT-INCONSISTENT` 只判"主父是不是来源列表的成员"，两侧都是**没解析过的引用**；
 * `judgeProductChain` 只数向下的子。于是 `父: 0099`（不存在）+ `依据P: 0099` 全绿 ——
 * 链的**最上面那一段**没有判据（2026-11-15 第 4 关 M-2）。
 *
 * 三个码分开（三种事实，报文各自点名 `父` 的原值）：
 *   · `SCHEME-PARENT-DANGLING` —— 解析不到（产品册 / 缺陷册都没有这个号）；
 *   · `SCHEME-PARENT-RETIRED` —— 解析到了，但那条产品是 `已废`（要的是**生效**记录）；
 *   · `SCHEME-PARENT-NOT-PRODUCT` —— 解析到的是**构案**（`父` 只许写产品号或缺陷 id）。
 *     显式写 `构案/NNNN` 的父**不必解析**就落这一码（它自己说它指一条构案；号上有没有同号产品都不改变这一点）。
 *
 * 边界：缺陷册的事件流**没有 `状态` 字段**（`registered` / `assessed` / `disposed` 三段，契约 §3.1），
 * 所以缺陷父的"生效"只有一种机器判得了的读法 —— **它在折叠出来的现状里存在**；已判假（`判假`）
 * 是"这条缺陷不成立"的处置，不是"记录被废"，不折进 `SCHEME-PARENT-RETIRED`。
 * `父` 缺 / 空 / 形状坏（`SCHEME-PARENT-MISSING` / `DEC-BAD-VALUE`）时不进这一族 —— 上游已经报了。
 * 产品册 / 缺陷册**不在**时也不判「悬空」：那是 `BOOK-MISSING` 的读数，判不了 ≠ 不存在。
 * 盘上**有那份文件、但头块坏了**（`DEC-MULTI-PER-FILE` 等）时同样不叠「悬空」——那一份的病上游已经报了。
 */
export function judgeParentRefs(decisions, states, problems, {
  productBookPresent = true, defectBookPresent = true, productIdsOnDisk = null, schemeIdsOnDisk = null,
} = {}) {
  const bugIds = new Set(states.map((s) => s.id))
  const hasEntry = (book, id) => decisions.some((x) => x.book === book && x.id === id)
  const brokenProduct = (id) => productIdsOnDisk !== null && productIdsOnDisk.has(id) && !hasEntry('产品', id)
  const brokenScheme = (id) => schemeIdsOnDisk !== null && schemeIdsOnDisk.has(id) && !hasEntry('构案', id)
  let checked = 0
  let unresolved = 0
  for (const d of decisions) {
    if (d.book !== '构案' || d.parent_ref === null) continue
    checked += 1
    const ref = d.parent_ref
    const name = `\`父: ${d.parent}\``
    if (ref.bug === true) {
      // 缺陷册不在 ⇒ "解析不到"这一句话今天判不了（`BOOK-MISSING` 已经报了，别把它读成悬空）。
      if (!defectBookPresent) continue
      if (bugIds.has(ref.id)) continue
      unresolved += 1
      problems.push(problem('SCHEME-PARENT-DANGLING', `${d.file} 的 ${name} 在缺陷册里解析不到（缺陷册里没有 ${ref.id}）—— `
        + '构案的父必须指得到一条真的记录（契约 §2.2）', { file: d.file, ref: d.parent }))
      continue
    }
    // 显式写了 `构案/` 前缀 ⇒ 这个父**自己说**它指一条构案 —— 不管号上有没有产品，都不是产品父。
    // 这一支要放在"产品册不在"之前：它由头块的字面量就能判，不依赖盘上有没有产品。
    if (ref.series === '构案') {
      unresolved += 1
      problems.push(problem('SCHEME-PARENT-NOT-PRODUCT', `${d.file} 的 ${name} 写了 \`构案/\` 前缀 —— `
        + '`父` 只许写产品号（`NNNN` / `产品/NNNN`）或缺陷 id（`bug-YYYYMMDD-NN`）（契约 §2.2）', { file: d.file, ref: d.parent }))
      continue
    }
    // 产品册不在 ⇒ 同上：判不了不等于悬空。
    if (!productBookPresent) continue
    const product = decisions.find((x) => x.book === '产品' && x.id === ref.id)
    if (product !== undefined) {
      if (product.status === '生效') continue
      // `状态` 读不出来是上游 `DEC-BAD-VALUE` 的病；这里不把它读成"已废"。
      if (product.status !== '已废') continue
      unresolved += 1
      problems.push(problem('SCHEME-PARENT-RETIRED', `${d.file} 的 ${name} 指到已废产品 ${product.id}`
        + `（状态 \`${product.raw_status ?? DASH}\`）—— 父必须是**生效**记录（契约 §2.2）`, { file: d.file, ref: d.parent }))
      continue
    }
    // 盘上有这个 id 的文件、但那一份的**头块坏了**（`DEC-HEADER-MISSING` / `DEC-MULTI-PER-FILE` 等）⇒
    // 上游已经报了那一份的病；这里不把"读不出"叠成"悬空"（`cand-20261021-0092`：不知道 ≠ 没有）。
    if (brokenProduct(ref.id) || brokenScheme(ref.id)) continue
    const existing = decisions.find((x) => x.id === ref.id)
    if (existing === undefined) {
      unresolved += 1
      problems.push(problem('SCHEME-PARENT-DANGLING', `${d.file} 的 ${name} 在产品册与缺陷册里都解析不到 —— `
        + '构案的父必须指得到一条真的记录（契约 §2.2）', { file: d.file, ref: d.parent }))
      continue
    }
    unresolved += 1
    problems.push(problem('SCHEME-PARENT-NOT-PRODUCT', `${d.file} 的 ${name} 指到的是构案 ${existing.id}`
      + ' —— `父` 只许写产品号（`NNNN`）或缺陷 id（`bug-YYYYMMDD-NN`）（契约 §2.2）', { file: d.file, ref: d.parent }))
  }
  return { checked, unresolved }
}

// ── 派生页：渲染（`--op index` 与 `check` 共用这一份）──────────────────────
const cell = (v) => (v === null || v === undefined || v === '' ? DASH : String(v).replace(/\|/g, '\\|'))
const tableText = (columns, rows) => [
  `| ${columns.join(' | ')} |`,
  `| ${columns.map(() => '---').join(' | ')} |`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`),
].join('\n')

/** 三条链的读数种子：产品 → 子构案数（生效构案的 `依据P` 里记着它）。 */
export function childCounts(decisions) {
  const counts = new Map()
  for (const d of decisions) {
    if (d.book !== '构案' || d.status !== '生效') continue
    for (const ref of d.basisP) counts.set(ref.id, (counts.get(ref.id) ?? 0) + 1)
  }
  return counts
}

/**
 * 渲染一张派生页。**纯函数**：同样的三册内容 + 同样的概念普查 ⇒ 同样的字节（契约 §1.3 的幂等就是这样成立的）。
 */
export function renderIndexPage(book, { decisions = [], states = [], conceptRows = [] } = {}) {
  const out = [GEN_MARKER, '']
  if (book === '产品') {
    const counts = childCounts(decisions)
    const rows = decisions.filter((d) => d.book === '产品')
      .map((d) => [cell(d.id), cell(d.topic), cell(d.date), cell(d.status), cell(counts.get(d.id) ?? 0)])
    out.push('# 产品册（现状层）', '',
      '> 这一页是派生页：`node presets/agenia/bin/决议-check.mjs --op index` 重写它，手改当场红。',
      '> 一行一条产品；「子构案」= 生效构案的 `依据P` 里记着它的条数（产品 → 构案 那条链）。', '')
    out.push(tableText(PRODUCT_INDEX_COLUMNS, rows), '')
    return out.join('\n')
  }
  if (book === '构案') {
    const rows = decisions.filter((d) => d.book === '构案').map((d) => [
      cell(d.id), cell(d.topic), cell(d.date), cell(d.status),
      cell(d.basisP.map((r) => r.id).join(',')), cell(d.basisBug.map((r) => r.id).join(',')),
    ])
    out.push('# 构案册（现状层）', '',
      '> 这一页是派生页：`node presets/agenia/bin/决议-check.mjs --op index` 重写它，手改当场红。',
      '> 一行一条构案；`依据P` / `依据bug` 是这条构案的全部来源（主父必须在里面，契约 §2.2-3）。', '')
    out.push(tableText(SCHEME_INDEX_COLUMNS, rows), '')
    if (conceptRows.length > 0) {
      out.push('## 概念普查', '',
        '> 同一个渲染器：`census --write-index` 与 `--op index` 写出来的这一页逐字节相同。',
        '> `census` = 落在该概念「扫描」面里、按该行「计数口径」量出来的实现点数，**单位见最后一列**。', '')
      out.push(tableText(CONCEPT_INDEX_COLUMNS, conceptRows.map((r) => [cell(r.concept), cell(r.owner), cell(r.census), cell(r.decision), cell(r.unit)])), '')
    }
    return out.join('\n')
  }
  const rows = states.map((s) => [
    cell(s.id), cell(String(s.registered_at ?? '').slice(0, 10)), cell(s.entry_kind),
    cell(s.assessed === null ? DASH : s.assessed.verdict), cell(s.disposition?.value),
    cell(s.chain.kind === 'scheme' ? `构案 ${s.chain.ref ?? DASH}` : s.chain.kind === 'judged_false' ? '判假' : s.chain.kind === 'legacy' ? '历史（迁移）' : DASH),
  ])
  out.push('# 缺陷册（现状层）', '',
    '> 这一页是派生页：`node presets/agenia/bin/决议-check.mjs --op index` 重写它，手改当场红。',
    '> 一行一条缺陷，**现状是折出来的**（`lib/缺陷折叠.mjs` 扫 `账本/缺陷/*.json` 的 registered / assessed / disposed）；',
    '> 事件流只追加、永不改写，所以这一页永远能由事件重算。', '')
  out.push(tableText(BUG_INDEX_COLUMNS, rows), '')
  return out.join('\n')
}

/** 一张页里的所有 markdown 表（`{columns, rows}`）。分隔行与表头不算行。 */
export function tablesOf(text) {
  const out = []
  const lines = linesOf(text)
  for (let i = 0; i + 1 < lines.length; i += 1) {
    const head = splitTableRow(lines[i])
    const sep = splitTableRow(lines[i + 1])
    if (head === null || sep === null) continue
    if (!sep.every((c) => /^:?-{3,}:?$/.test(c))) continue
    const rows = []
    let j = i + 2
    for (; j < lines.length; j += 1) {
      const cells = splitTableRow(lines[j])
      if (cells === null) break
      rows.push(cells)
    }
    out.push({ columns: head, rows })
    i = j - 1
  }
  return out
}

/**
 * 判一张派生页（契约 §1.3 + §9.3 级联）。
 *
 * 级联：**标记坏了只报标记那一条**（否则删一行标记会同时红三处，读的人分不清是哪一层坏）。
 */
export function judgeIndexPage(root, book, expectedText, problems) {
  const rel = INDEX_REL_OF(book)
  const file = path.join(root, rel)
  const reading = { file: rel, present: false, generated_marker: false, rows: 0 }
  if (!existsSync(file)) {
    problems.push(problem('INDEX-MISSING', `${rel} 不在 —— 三册各有一张派生页，\`--op index\` 生成它（契约 §1.3）`, { file: rel }))
    return reading
  }
  reading.present = true
  const text = readText(file) ?? ''
  const firstNonEmpty = linesOf(text).find((l) => l.trim() !== '') ?? ''
  const markerOk = firstNonEmpty.trim().startsWith('<!--') && GEN_MARKER_NEEDLES.every((n) => firstNonEmpty.includes(n))
  reading.generated_marker = markerOk
  if (!markerOk) {
    problems.push(problem('INDEX-NOT-GENERATED', `${rel} 的第一行非空行不是生成标记 —— 这一页是**生成物**，手改会红；`
      + '重跑 `node presets/agenia/bin/决议-check.mjs --op index`（契约 §1.3）', { file: rel }))
    return reading
  }
  const want = tablesOf(expectedText)
  const got = tablesOf(text)
  const wantRows = want.flatMap((t) => t.rows)
  const gotRows = got.flatMap((t) => t.rows)
  reading.rows = gotRows.length
  const wantByKey = new Map(wantRows.map((cells) => [cells[0] ?? '', cells.join(' | ')]))
  const gotByKey = new Map(gotRows.map((cells) => [cells[0] ?? '', cells.join(' | ')]))
  const missing = [...wantByKey.keys()].filter((k) => !gotByKey.has(k))
  const extra = [...gotByKey.keys()].filter((k) => !wantByKey.has(k))
  const mismatch = [...wantByKey.keys()].filter((k) => gotByKey.has(k) && gotByKey.get(k) !== wantByKey.get(k))
  for (const key of missing) {
    problems.push(problem('INDEX-ROW-MISSING', `${rel} 上没有 \`${key}\` 这一行 —— 册里有它，页是派生物（契约 §1.3）`, { file: rel, key }))
  }
  for (const key of extra) {
    problems.push(problem('INDEX-ROW-EXTRA', `${rel} 上多出一行 \`${key}\` —— 册里没有它；多出来的那一行就是手抄（契约 §1.3）`, { file: rel, key }))
  }
  for (const key of mismatch) {
    problems.push(problem('INDEX-ROW-MISMATCH', `${rel} 上 \`${key}\` 这一行与重算不同：页上 ${JSON.stringify(gotByKey.get(key))}`
      + ` / 重算 ${JSON.stringify(wantByKey.get(key))}（契约 §1.3）`, { file: rel, key }))
  }
  if (missing.length === 0 && extra.length === 0 && mismatch.length === 0 && text !== expectedText) {
    const a = linesOf(expectedText)
    const b = linesOf(text)
    let at = 0
    while (at < a.length && at < b.length && a[at] === b[at]) at += 1
    problems.push(problem('INDEX-ROW-MISMATCH', `${rel}:${at + 1} 与重算不同：页上 ${JSON.stringify((b[at] ?? '').slice(0, 120))}`
      + ` / 重算 ${JSON.stringify((a[at] ?? '').slice(0, 120))}（契约 §1.3：页是派生物）`, { file: rel, line: at + 1 }))
  }
  return reading
}

// ── 概念普查（`census` 与 `--op index` 的同一份输入）────────────────────────
/**
 * 概念表的读数（`census` 的全部内容，也是构案册第二张表的行源）。
 * `decisions` 由调用方给（本文件已经从三册里读出来了）—— 这里**不重读**，免得两份解析器。
 */
export function conceptRows(root, decisions, { allowlist = [] } = {}) {
  const table = readConceptTable(root)
  const rows = table.present && table.problems.length === 0
    ? table.rows.map((row) => {
      const counted = countConcept(root, row, { allowlist: table.allowlist ?? [] })
      const live = decisions.filter((d) => d.book === '构案' && d.status === '生效' && d.topic === row.concept)
      return {
        concept: row.concept,
        owner: row.owner,
        census: counted.count,
        unit: counted.unit,
        rule: counted.rule,
        decision: live.length === 1 ? live[0].id : (live.length === 0 ? DASH : null),
        implementations: counted.implementations,
        files: counted.files,
        scan: row.scan,
        scan_empty: counted.scan_empty,
        scanned_files: counted.scanned_files,
        sites: counted.sites,
        allowlist: counted.allowlist,
        scan_excluded: counted.scan_excluded,
        read_failures: counted.read_failures,
        problems: counted.problems ?? [],
      }
    })
    : []
  return { table, rows, allowlist: allowlist.length > 0 ? allowlist : (table.allowlist ?? []) }
}

// ── 三条链 ─────────────────────────────────────────────────────────────────
/**
 * §5.1 产品 → 构案。刀：删掉某产品的全部子构案 ⇒ 恰好一条、点名它。
 *
 * 级联（契约 §9.3）：**子构案的来源不明**时不判这条链 —— 一条构案若 `依据P` / `依据bug` 两栏全空
 * （`SCHEME-NO-BASIS`）或没有 `父`（`SCHEME-PARENT-MISSING`），它就"可能挂在哪条产品上"，
 * 此时报 `CHAIN-PRODUCT-NO-CHILD` 是把"我不知道"读成了"它没有子"（`cand-20261021-0092`）。
 */
export function judgeProductChain(decisions, problems) {
  const unknownChild = decisions.some((d) => d.book === '构案'
    && (d.status === '生效')
    && ((d.basisP.length === 0 && d.basisBug.length === 0) || d.parent === null || d.parent === '' || d.parent === DASH))
  if (unknownChild) return { resolved: 0, unresolved: 0, skipped: 'CHAIN-PRODUCT-SOURCE-UNKNOWN' }
  const counts = childCounts(decisions)
  let unresolved = 0
  for (const d of decisions) {
    if (d.book !== '产品' || d.status !== '生效') continue
    if ((counts.get(d.id) ?? 0) > 0) continue
    unresolved += 1
    problems.push(problem('CHAIN-PRODUCT-NO-CHILD', `产品 ${d.id}（${d.topic}）没有任何生效构案在 \`依据P\` 里记着它 —— `
      + '老板发的每条产品都要有落地方案（契约 §5.1）', { file: d.file, ref: d.id }))
  }
  return { resolved: decisions.filter((d) => d.book === '产品' && d.status === '生效').length - unresolved, unresolved }
}

/** 非空字符串（`null` / `undefined` / 空串 / 全空白都不算）。 */
const filledValue = (v) => typeof v === 'string' && v.trim() !== ''

/** 今天的**本地日期**（`YYYY-MM-DD`）——注入时钟的缺省值；判据要能换成夹具那一天。 */
export function todayLocal(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/**
 * 迁移那一批给「冻结为历史」写的**声明字面量**。它不是日期判据（不从理由里抠日期，那是第二套真相），
 * 只认这一个声明词：写了它 = 这条处置自己说它是终态、没有到期日。
 */
const LEGACY_FROZEN_MARKER = '无到期日'

/** 一条 legacy 的 `deferred` 有没有声明自己是终态冻结。 */
function isFrozenMarked(state) {
  return String(state?.disposition?.reason ?? '').includes(LEGACY_FROZEN_MARKER)
}

/**
 * 这条暂缓**过期了吗**：`due_at` 的日期部分早于 `today`，且之后没有重开（`registered_at`）或再处置
 * （`disposition.at`）。返回过期的那个日期（`YYYY-MM-DD`）或 `null`。
 *
 * 边界：legacy 的暂缓**不参与**（迁移前写的，没有结构化 `due_at` 可补）；`due_at` 读不成真日期 ⇒ 判不了
 * （那是折叠的 `DEFERRED-NO-LANDING-PLAN` 的事，不在这一条里叠报）。
 */
function overdueDayOf(state, today) {
  if (state?.chain?.kind === 'legacy') return null
  const due = state?.disposed_payload?.due_at
  if (!filledValue(due)) return null
  const dueDay = due.slice(0, 10)
  if (!isRealDate(dueDay) || !isRealDate(today)) return null
  if (!(dueDay < today)) return null
  const lastDay = [state.registered_at, state.disposition?.at]
    .map((v) => (typeof v === 'string' ? v.slice(0, 10) : ''))
    .sort()
    .pop()
  if (typeof lastDay === 'string' && isRealDate(lastDay) && lastDay > dueDay) return null
  return dueDay
}

/** 一条缺陷的三种记账之一即可；悬空 / 不对称各自成码。
 *
 * `deferred`（暂缓）是**未结**，不是结论：它的落点就是延迟本身，但延迟必须**可执行** ——
 * 结构化 `due_at` / `owner` / `next_step` 由折叠判（`DEFERRED-NO-LANDING-PLAN`），这里判**过期**：
 * `due_at` 的日期部分早于今天、且之后没有重开 / 再处置过 ⇒ `CHAIN-BUG-DEFERRED-OVERDUE`。
 * 迁移那一批（`历史: deferred`）没有结构化 `due_at`，不在这条规则的射程里，也不进 `deferred_open`
 * （2026-11-15 第 4 关 r3 · M-1）。**判序**：过期判定跑在 `chain.kind` 分支**之前** —— 过期与这条票记着哪一格无关，`判假:` / `构案:` 短路不了它（缺陷 `-02`；写入口同批拒这一组合：`E_BUG_DEFERRED_WITH_CLOSER`）。
 *
 * 读数按**五组**印（`closed_by_scheme` / `closed_judged_false` / `legacy_closed` / `deferred_open` /
 * `legacy_frozen`）：`closed 52 / deferred 104` 那一版把「历史冻结」和「新开的待办」混成一个数，
 * 让「还有多少条开着」永远读不准。`closed` / `deferred` 保留为两组之和，算术可核对。
 */
export function judgeBugChain(decisions, states, problems, { today = todayLocal() } = {}) {
  let unresolved = 0
  /** 被计进 `unresolved` 的那些 id：它们在下面的分组里**不算关上了**（悬空 / 不互认不是"有着落"）。 */
  const unresolvedIds = new Set()
  const liveSchemes = decisions.filter((d) => d.book === '构案' && d.status === '生效')
  for (const s of states) {
    if (s.disposition === null || s.disposition === undefined) continue
    // 暂缓 = 未结：过期判定先于 `chain.kind` 分支（`判假:` / `构案:` 派生出的两支不短路它，契约 §5.2.1「判序」）。
    if (s.disposition.value === 'deferred') {
      const overdue = overdueDayOf(s, today)
      if (overdue !== null) {
        problems.push(problem('CHAIN-BUG-DEFERRED-OVERDUE', `缺陷 ${s.id} 的暂缓到期日 ${overdue} 已经过去、之后没有重开或再处置 —— `
          + '到期没动就不是延期的完成态，要么做、要么重新定一个到期日（契约 §5.2）', { id: s.id, due_at: overdue }))
      }
      continue
    }
    const kind = s.chain.kind
    if (kind === 'legacy') continue
    if (kind === 'judged_false') continue
    if (kind === 'scheme') {
      const target = liveSchemes.find((d) => d.id === s.chain.ref)
      if (target === undefined) {
        unresolved += 1
        unresolvedIds.add(s.id)
        problems.push(problem('CHAIN-BUG-SCHEME-DANGLING', `缺陷 ${s.id} 的处置记着 \`构案: ${s.chain.ref}\`，而账本里没有这条**生效构案** —— `
          + '关掉一条缺陷必须指得到那条方案（契约 §5.2）', { ref: `${s.id}/${s.chain.ref}`, id: s.id }))
        continue
      }
      if (!target.basisBug.some((r) => r.id === s.id)) {
        unresolved += 1
        unresolvedIds.add(s.id)
        problems.push(problem('CHAIN-BUG-SCHEME-NOT-RECIPROCAL', `缺陷 ${s.id} 说它由构案 ${target.id} 关掉，`
          + `而 ${target.id} 的 \`依据bug\` 里没有 ${s.id} —— 这条链必须双向（契约 §5.2）`,
        { ref: `${s.id}/${target.id}`, id: s.id }))
      }
      continue
    }
    unresolved += 1
    unresolvedIds.add(s.id)
    problems.push(problem('CHAIN-BUG-NO-SCHEME', `缺陷 ${s.id} 已经处置（${s.disposition.value}），但既不指向构案、也不判假、也不标历史 —— `
      + '关上的缺陷必须有一个着落（契约 §5.2）', { ref: s.id, id: s.id }))
  }
  const withDisposition = states.filter((s) => s.disposition !== null && s.disposition !== undefined)
  const concluded = withDisposition.filter((s) => s.disposition.value !== 'deferred')
  const deferredStates = withDisposition.filter((s) => s.disposition.value === 'deferred')
  /** 有结论**且**有着落（不在 `unresolvedIds` 里）——三组的和就是 `closed`。 */
  const landed = concluded.filter((s) => !unresolvedIds.has(s.id))
  const closedByScheme = landed.filter((s) => s.chain.kind === 'scheme').length
  const closedJudgedFalse = landed.filter((s) => s.chain.kind === 'judged_false').length
  const legacyClosed = landed.filter((s) => s.chain.kind === 'legacy').length
  const legacyFrozen = deferredStates.filter((s) => s.chain.kind === 'legacy' && isFrozenMarked(s)).length
  const deferredOpen = deferredStates.length - legacyFrozen
  return {
    resolved: closedByScheme + closedJudgedFalse + legacyClosed,
    unresolved,
    closed: closedByScheme + closedJudgedFalse + legacyClosed,
    deferred: deferredStates.length,
    closed_by_scheme: closedByScheme,
    closed_judged_false: closedJudgedFalse,
    legacy_closed: legacyClosed,
    deferred_open: deferredOpen,
    legacy_frozen: legacyFrozen,
    /** `deferred_open` 里带**结构化** `due_at` 的条数（过期判据只够得着这些；其余是 legacy 的散文到期日）。 */
    deferred_open_structured: deferredStates.filter((s) => s.chain.kind !== 'legacy' && filledValue(s.disposed_payload?.due_at)).length,
  }
}

// ── 文件级 `依据:`（§5.3 / §6 / §10.2）──────────────────────────────────────
/** §5.3 的生产面（机器枚举；新加的文件自动进面）。 */
export function basisSurface(root) {
  const out = []
  for (const rule of BASIS_SURFACE_GLOBS) {
    if (rule.file !== undefined) {
      if (existsSync(path.join(root, rule.file))) out.push({ rel: rule.file, kind: rule.kind })
      continue
    }
    const dir = path.join(root, rule.dir)
    if (!isDir(dir)) continue
    for (const name of listDir(dir)) {
      if (!name.endsWith(rule.ext)) continue
      if (!isFile(path.join(dir, name))) continue
      out.push({ rel: `${rule.dir}/${name}`, kind: rule.kind })
    }
  }
  return out
}

/** 一条路径是不是 §6 的具名豁免（按文件给，不按目录给）。 */
export function isBasisExempt(rel) {
  const posix = String(rel).replace(/\\/g, '/')
  const base = posix.split('/').pop()
  if (BASIS_EXEMPT_NAMES.includes(base)) return true
  return BASIS_EXEMPT_PREFIXES.some((p) => posix.startsWith(p))
}

/** 一份文件里的 `依据:` 行（取**第一行**；`.mjs` / `.js` 只认行首注释）。 */
export function basisReading(root, rel, { kind = 'code' } = {}) {
  const text = readText(path.join(root, rel))
  if (text === null) return { present: false, line: null, id: null, text: null }
  const re = kind === 'code' ? /^\s*(?:\/\/|\*)\s*依据\s*[:：]\s*(\S+)/ : /^\s*依据\s*[:：]\s*(\S+)/
  const lines = linesOf(text)
  for (let i = 0; i < lines.length; i += 1) {
    const m = re.exec(lines[i])
    if (m !== null) return { present: true, line: i + 1, id: m[1], text: lines[i].trim().slice(0, 160) }
  }
  return { present: false, line: null, id: null, text: null }
}

/**
 * 判文件级 `依据:`：面里每一份（除四条具名豁免）都要有一行，且指向**生效构案**。
 * 空集合不许恒真：面为 0 而 `presets/agenia/` 在盘上 ⇒ `CHAIN-FILE-EMPTY-SURFACE`。
 */
export function judgeFileBasis(root, decisions, problems) {
  const surface = basisSurface(root)
  const schemes = new Map(decisions.filter((d) => d.book === '构案').map((d) => [d.id, d]))
  let unresolved = 0
  if (surface.length === 0) {
    if (isDir(path.join(root, 'presets', 'agenia'))) {
      problems.push(problem('CHAIN-FILE-EMPTY-SURFACE', '生产面一份文件都没枚举到，而 presets/agenia/ 在盘上 —— '
        + '空集合不许恒真（要么面变了，要么枚举器坏了）', { file: 'presets/agenia' }))
      unresolved += 1
    }
    return { checked: 0, unresolved }
  }
  for (const { rel, kind } of surface) {
    if (isBasisExempt(rel)) continue
    const reading = basisReading(root, rel, { kind })
    if (!reading.present) {
      unresolved += 1
      problems.push(problem('CHAIN-FILE-NO-BASIS', `${rel} 没有 \`依据:\` 行 —— 生产代码与说明书/作业书都要有一行`
        + '（`// 依据: NNNN` 或 `依据: NNNN`，只许指**生效构案**；契约 §5.3）', { file: rel }))
      continue
    }
    const id = String(reading.id ?? '')
    const target = /^\d{4}$/.test(id) ? schemes.get(id) : undefined
    if (target === undefined) {
      unresolved += 1
      const product = decisions.find((d) => d.book === '产品' && d.id === id)
      if (product !== undefined) {
        problems.push(problem('CHAIN-FILE-BASIS-NOT-LIVE', `${rel}:${reading.line} 的 \`依据: ${id}\` 指到了**产品**（${product.topic}）—— `
          + '文件只能指生效**构案**（产品是老板发的，不是落地方式；契约 §5.3）', { file: rel, ref: id }))
        continue
      }
      problems.push(problem('CHAIN-FILE-BASIS-DANGLING', `${rel}:${reading.line} 的 \`依据: ${id}\` 在构案册里解析不到 —— `
        + '文件必须指一条真的构案（契约 §5.3）', { file: rel, ref: id }))
      continue
    }
    if (target.status !== '生效') {
      unresolved += 1
      problems.push(problem('CHAIN-FILE-BASIS-NOT-LIVE', `${rel}:${reading.line} 的 \`依据: ${id}\` 不是**生效构案**`
        + `（状态 \`${target.raw_status ?? DASH}\`）—— 只许指生效的（契约 §5.3）`, { file: rel, ref: id }))
    }
  }
  return { checked: surface.length, unresolved }
}

// ── 一次完整读（两个入口共用）──────────────────────────────────────────────
/**
 * 读三册 + 判六件事，返回**一份**读数。`决议-check` 的 `check` 与 `census` 都从这里出发
 * （`census` 只用 `concepts`，不重复判词）。
 *
 * @returns {{ok, root, ledger_present, old_tree_present, books, decisions, states, problems,
 *            chain, legacy_disposed, concepts, table}}
 */
export function scanLedger(root, { today = todayLocal() } = {}) {
  const problems = []
  const ledgerDir = path.join(root, LEDGER_REL)
  const ledgerPresent = isDir(ledgerDir)
  const oldTree = existsSync(path.join(root, OLD_TREE_REL))
  const empty = { 产品: { present: false, entries: [] }, 缺陷: { present: false, states: [] }, 构案: { present: false, entries: [] } }
  if (!ledgerPresent) {
    if (isDir(path.join(root, '.team'))) {
      problems.push(problem('LEDGER-NOT-INITIALISED', `${LEDGER_REL}/ 不在 ${path.resolve(root)} —— 这个工区有 .team/ 却没有账本；`
        + `跑 \`node presets/agenia/bin/决议-check.mjs --root ${path.resolve(root)} --op init\` 建骨架（契约 §1.1）`,
      { file: LEDGER_REL, root: path.resolve(root) }))
    }
    return {
      ok: problems.length === 0, root: path.resolve(root), ledger_present: false, old_tree_present: oldTree,
      books: empty, decisions: [], states: [], problems, chain: { parent: { checked: 0, unresolved: 0 }, product: { resolved: 0, unresolved: 0 }, bug: { resolved: 0, unresolved: 0, closed: 0, deferred: 0, closed_by_scheme: 0, closed_judged_false: 0, legacy_closed: 0, deferred_open: 0, legacy_frozen: 0, deferred_open_structured: 0 }, file: { checked: 0, unresolved: 0 } },
      legacy_disposed: 0, concepts: [], table: { present: false, rows: [], problems: [] },
    }
  }
  const read = {}
  for (const book of BOOKS) read[book] = readBook(root, book, problems)
  if (oldTree) {
    problems.push(problem('LEDGER-OLD-TREE-PRESENT', `${OLD_TREE_REL}/ 还在 —— 账本与旧树不许并存（迁移没做完，契约 §1.1）`, { file: OLD_TREE_REL }))
  }
  const decisions = [...read.产品.entries, ...read.构案.entries]
  problems.push(...judgePointers(decisions))
  judgeDuplicateTopics(decisions, problems)
  /** 向上的那一段（契约 §2.2）：`父` 必须解析到存在且生效的产品 / 缺陷。 */
  const parentChain = judgeParentRefs(decisions, read.缺陷.states, problems, {
    productBookPresent: read.产品.present,
    defectBookPresent: read.缺陷.present,
    productIdsOnDisk: new Set(read.产品.ids_on_disk),
    schemeIdsOnDisk: new Set(read.构案.ids_on_disk),
  })
  const chain = { parent: parentChain, product: { resolved: 0, unresolved: 0 }, bug: { resolved: 0, unresolved: 0, closed: 0, deferred: 0, closed_by_scheme: 0, closed_judged_false: 0, legacy_closed: 0, deferred_open: 0, legacy_frozen: 0, deferred_open_structured: 0 }, file: { checked: 0, unresolved: 0 } }
  chain.product = judgeProductChain(decisions, problems)
  chain.bug = judgeBugChain(decisions, read.缺陷.states, problems, { today })
  chain.file = judgeFileBasis(root, decisions, problems)
  // 概念普查（概念表在 `账本/概念表.md`；它坏了也不影响三册结构，所以只印读数）
  const { table, rows } = conceptRows(root, decisions)
  // 派生页：级联 —— 这一册的头块不干净就不比页（§9.3-2）
  for (const book of BOOKS) {
    const dir = read[book]
    if (!dir.present) continue
    if (!dir.clean) continue
    const expected = renderIndexPage(book, { decisions, states: read.缺陷.states, conceptRows: rows })
    judgeIndexPage(root, book, expected, problems)
  }
  const legacyDisposed = read.缺陷.states.filter((s) => s.disposition !== null && s.disposition !== undefined && s.chain.kind === 'legacy').length
  const unique = dedupeProblems(problems)
  return {
    ok: unique.length === 0,
    root: path.resolve(root),
    ledger_present: true,
    old_tree_present: oldTree,
    books: {
      产品: { present: read.产品.present, entries: read.产品.entries.length },
      缺陷: { present: read.缺陷.present, entries: read.缺陷.states.length },
      构案: { present: read.构案.present, entries: read.构案.entries.length },
    },
    decisions,
    states: read.缺陷.states,
    problems: unique,
    chain,
    legacy_disposed: legacyDisposed,
    concepts: rows,
    table,
  }
}
// 依据: 0012
