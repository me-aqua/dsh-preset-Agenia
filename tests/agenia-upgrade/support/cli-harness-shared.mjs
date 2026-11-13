/**
 * 量具：**CLI 骨架只剩一份** + **参数形式统一**（构案 0009 · 史山清查 B4 · Gate 2）。
 *
 * 契约：`.team/test/2026-11-13/CONTRACT-史山清查-B4.md`（唯一出处：口径 / 腿 / 刀 / 允许清单 / 分母）。
 * 决定：`决议/构案/0009-CLI-骨架归一.md` §②。
 *
 * ## 病（2026-11-13 现量 · 本文件的常量就是从这一次量出来的）
 * 20 支 CLI（`presets/agenia/bin/*.mjs` 7 支 + `.tools/*.mjs` 13 支）各写一套入口骨架：
 *
 * | 函数 | 20 支里定义数 | 实现种数 | 字符跨度 | 树里全部定义点（含 `lib/`） |
 * | --- | ---: | ---: | --- | ---: |
 * | `parseArgs` | 11 | **11** | 613–2,252 | 11 |
 * | `cliError` | 7 | **7** | 128–172 | 7 |
 * | `emit` | 7 | 3 | 83 / 105 / 485 | **8**（第 8 处 = `lib/cli-guards.mjs`，B3 的共享那一份） |
 * | `main` | **13** | 13 | 271–13,226 | 13 |
 *
 * ⚠️ **`main` 是 13 处，不是决定 §① 写的 12**：`.tools/mount-dashboard-profile.mjs:419` 也是
 * `function main()`（与 `.tools/unmount-host-row.mjs:705` 同形）。逐处清单见契约 §1.1；
 * 这条腿钉的是"今天 13 处、改完还是这 13 支各 1 处"（范围栅栏），不是去凑决定里那个数。
 *
 * 后果不是"代码长"，是**参数形式不统一**：`bug-20261113-19`（`--backup-dir=<dir>` 静默忽略、
 * 回落默认目录）就是这族的一个实例 —— 11 套解析器、11 种对"未知参数"的态度：
 *   · **静默无视**（4 支）：`agenia-brain` / `agenia-local` / `agenia-route` / `bg-notify`
 *     （未知参数推进 `unknown[]`，之后**没有任何地方读它**）；
 *   · **具名码但只认空格形式**（3 支）：`install` / `rollback` / `release-scan`（`E_USAGE`）；
 *   · **只有文字**（3 支）：`census` / `fingerprint` / `决议-check`（`*-USAGE:` 前缀，stdout 无信封）；
 *   · **具名码 + 只认空格形式**（1 支）：`tree-at-commit`（`E_USAGE`）。
 * ⇒ 未知参数"出声"这件事今天在 11 支里有 **4 种**做法；等号形式在 11 支里有 **5 支直接拒**。
 *
 * ## 判什么（一条用例 = 一格；这里是 `INS-02` 新加的四条腿的量具）
 *   · **腿 ⑦ · 定义**：11 支有 `parseArgs` 的 CLI 里 `parseArgs` / `cliError` / `emit` 各 **0 处**定义；
 *     `presets/agenia/lib/cli-harness.mjs` 存在、三个名字**都导出**（`parseArgs` / `cliError` 定义在
 *     它里面；`emit` 可以是从 `lib/cli-guards.mjs` 转出 —— 树里 `emit` 的**定义**只许一处）；
 *     树里 `parseArgs` / `cliError` 的定义**各 1 处**；`main` 仍是那 13 支各 1 处（不合并）。
 *     允许清单：`tree-at-commit.mjs` 的 `parseArgs`（决定 §②-3）**只能**经具名条目（文件名 + 理由）
 *     留在它的 CLI 里；条目不合法 ⇒ 红，且读数必须**明写**"放行了谁、为什么"。
 *   · **腿 ⑧ · 参数形式**：11 支各自"同一个调用"的 `--k v` 与 `--k=v` 两种写法**退出码与输出逐字相同**；
 *     多带一个未知参数 ⇒ 非零退出 + stdout 信封里 `error.code === 'E_ARG_USAGE'`
 *     （**不许静默、不许回落默认值** —— `-19` 的根因）。
 *     刀：把其中一支的参数解析换回"静默无视未知参数" ⇒ 同一条判据必须**点名那一支**红。
 *   · **腿 ⑨ · 行为**：11 支的平凡路径（`--op help` / `--help` / `--op check`）退出 0；
 *     3 支代表 CLI 的主路径退出码与**改前冻结值**逐条相同（§4）。
 *   · **腿 ⑩ · `main` 栅栏**：13 处 `function main` 仍是 13 支各 1 处，共享件里 0 处。
 *
 * ## 口径（写在明处）
 *   ① **"处"= 定义形状**：与 `support/cli-guards-shared.mjs::definitionForms` **同一张表**
 *      （`function name(` / `const name = function` / `const name = (…) =>`），且必须**顶层**（列 0）。
 *      注释行不算；缩进的同名局部量不算。
 *   ② **派生的内联副本不算第二处**：出厂件（staged `bin/rollback.mjs`）里那一段骨架正文，若在
 *      `@inline-begin CLI 骨架正文` … `@inline-end` 标记之间、且规范化之后与共享件那一块**逐字相同**
 *      ⇒ 记 `derived_inline` 并**点名跳过**（与 B2/B3 同一套作用域规则）。标记里放**不同**正文
 *      ⇒ 是第二份实现（`B4-PUBLISHED-INLINE-DRIFT`），不豁免。"打个标记"不是免检章。
 *   ③ **判定只读文本、只跑子进程**：不 import 被测 CLI（它们加载期就会跑 `main()`；
 *      `cand-20261107-0219`）。定义腿只读源码字节；参数/行为腿用 `spawnSync` 真跑。
 *   ④ **未知参数的码是 `E_ARG_USAGE`**（冻结表里 exit 2 的那个）：`E_USAGE` 是同一批 CLI 里
 *      "**op 不认识**"用的码（`route` / `brain` / `local` 都这么用）—— 拿它兼作"参数不认识"，
 *      读信封的人就分不清"参数写错"与"op 不存在"。这一条是契约 §3.3 的选择，**要动它改一处常量 + 契约**。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { INLINE_BLOCKS, beginOf, markedSpans, normalizeBlock, shippedBlockOf } from './injector-inline.mjs'
import { definitionForms } from './cli-guards-shared.mjs'

// ── 常量（判据侧的唯一出处）────────────────────────────────────────────────
/**
 * 共享件里那一对标记的描述符（内联块的第三块 —— `CLI 骨架正文`）。
 *
 * 🔴 **今天住在这里，Gate 3 同批搬进 `support/injector-inline.mjs::INLINE_BLOCKS`**：
 *    搬运的时点**必须**与"实现 + `--op publish-staged`"同批 —— 出厂件带上那一块之前就搬，
 *    `ATM-01` 腿 7b（出厂件每一块）会红，连它自己的阳性对照（"真出厂件原文应当绿"）一起红。
 *    搬运之后本文件从这里读、`ATM-01` 从 `INLINE_BLOCKS` 读 —— 那时**同一个事实有两个读者**，
 *    正是想要的样子；今天只有一个读者（本文件），因为另一个读者（`ATM-01`）的对象还不存在。
 *
 * `label` 与发布器的包装标记逐字一致；`fingerprints` 是内容锚（不锚行号）：
 *   · `function parseArgs(` / `function cliError(` —— 两个骨架的定义形状；
 *   · `B4-KNIFE-ANCHOR` —— 未知参数"出声"那一行上的刀锚（必须在块里：出厂件里的未知参数也走同一行）。
 * `emit` **不在**这块里：它的唯一定义在 `lib/cli-guards.mjs`（B3），这里只导出。
 */
export const CLI_HARNESS_BLOCK = Object.freeze({
  id: 'cliHarness',
  label: 'CLI 骨架正文',
  sourceRel: 'presets/agenia/lib/cli-harness.mjs',
  fingerprints: Object.freeze(['function parseArgs(', 'function cliError(', 'B4-KNIFE-ANCHOR']),
  definitions: Object.freeze(['parseArgs', 'cliError']),
})
export const HARNESS_REL = CLI_HARNESS_BLOCK.sourceRel
export const GUARDS_REL = INLINE_BLOCKS.guards.sourceRel
export const ROLLBACK_REL = 'presets/agenia/bin/rollback.mjs'
export const SHIPPED_ROLLBACK_REL = 'bin/rollback.mjs'
export const SKELETON_NAMES = Object.freeze(['parseArgs', 'cliError', 'emit'])
export const MAIN_NAME = 'main'
/** 未知参数的具名码（契约 §3.3；改这里 = 改契约）。 */
export const UNKNOWN_ARG_CODE = 'E_ARG_USAGE'
/** 每一支探针都多带这一个未知参数（名字要一眼看得出是量具，不是产品参数）。 */
export const UNKNOWN_ARG_FLAG = '--b4-unknown-probe'
/** 共享件里"未知参数出声"那一行上的刀锚（契约 §3.4）。 */
export const KNIFE_ANCHOR = 'B4-KNIFE-ANCHOR'
/** 刀把锚行换成的那一行（**只**换这一行；见 `mutateHarnessForKnife`）。 */
export const KNIFE_IGNORE_LINE = 'void 0 // B4-KNIFE-IGNORE'

/** 11 支有 `parseArgs` 的 CLI（`agentia-brain` 起按路径排序；决定 §②-2 的分母）。 */
export const PARSE_ARGS_CLIS = Object.freeze([
  'presets/agenia/bin/agenia-brain.mjs',
  'presets/agenia/bin/agenia-local.mjs',
  'presets/agenia/bin/agenia-route.mjs',
  'presets/agenia/bin/bg-notify.mjs',
  'presets/agenia/bin/install.mjs',
  'presets/agenia/bin/release-scan.mjs',
  'presets/agenia/bin/rollback.mjs',
  '.tools/census.mjs',
  '.tools/fingerprint.mjs',
  '.tools/tree-at-commit.mjs',
  '.tools/决议-check.mjs',
])

/** 20 支 CLI 全体（定义腿的扫描面 = 这 20 份；顺序 = bin 7 + .tools 13）。 */
export const CLI_FILES = Object.freeze([
  'presets/agenia/bin/agenia-brain.mjs',
  'presets/agenia/bin/agenia-local.mjs',
  'presets/agenia/bin/agenia-route.mjs',
  'presets/agenia/bin/bg-notify.mjs',
  'presets/agenia/bin/install.mjs',
  'presets/agenia/bin/release-scan.mjs',
  'presets/agenia/bin/rollback.mjs',
  '.tools/census.mjs',
  '.tools/check-notes.mjs',
  '.tools/clear-dsh-auth-cookies.mjs',
  '.tools/fingerprint.mjs',
  '.tools/inject-probe.mjs',
  '.tools/inject-replay.mjs',
  '.tools/make-bundle-patch.mjs',
  '.tools/mount-dashboard-profile.mjs',
  '.tools/office-guard-probe.mjs',
  '.tools/tree-at-commit.mjs',
  '.tools/unmount-host-row.mjs',
  '.tools/决议-check.mjs',
  '.tools/window-fingerprint.mjs',
])

/**
 * 今天（2026-11-13）**13 处** `function main` 的所在文件 —— 决定 §① 写的是 12，实测 13。
 * 腿 ⑩ 钉的是"这 13 支各 1 处、改完一处不少一处不多"（范围栅栏），行号不进判据（会漂）。
 */
export const MAIN_FILES = Object.freeze([
  'presets/agenia/bin/agenia-brain.mjs',
  'presets/agenia/bin/agenia-local.mjs',
  'presets/agenia/bin/agenia-route.mjs',
  'presets/agenia/bin/bg-notify.mjs',
  'presets/agenia/bin/install.mjs',
  'presets/agenia/bin/release-scan.mjs',
  'presets/agenia/bin/rollback.mjs',
  '.tools/census.mjs',
  '.tools/fingerprint.mjs',
  '.tools/mount-dashboard-profile.mjs',
  '.tools/tree-at-commit.mjs',
  '.tools/unmount-host-row.mjs',
  '.tools/决议-check.mjs',
])
export const MAIN_EXPECT = MAIN_FILES.length
/** 决定 §① 写的那个数（只进读数：13 ≠ 12 这件事要看得见，不许悄悄对齐）。 */
export const MAIN_DECISION_SAYS = 12

/**
 * 树里**清单外**的骨架同名物（不是"同一个东西"，但也不在本票的范围里）。
 *
 * 判据只放行清单里的；清单外任何一处 ⇒ 红 `B4-DEF-NAMESAKE`。每条必须**说清是什么**：
 *   · `unmount-host-row.mjs` 的 `emit`（485 字符，第三个实现）—— 它**没有** `parseArgs`，
 *     决定 §②-2 只改"11 支有 parseArgs 的"，所以它留在本票外（契约 §1.3 记为残留）。
 */
export const OUT_OF_SCOPE_NAMESAKE = Object.freeze([
  Object.freeze({ rel: '.tools/unmount-host-row.mjs', name: 'emit', why: '没有 parseArgs ⇒ 不在 0009 §②-2 的 11 支里；它的 emit 是第三个实现（485 字符），本票不动' }),
])

/**
 * `parseArgs` 的同名允许清单（决定 §②-3 的逃生口）。**今天是空的**（严格形态）。
 *
 * 条目形状：`{ rel, reason }`；`rel` 必须在 `PARSE_ARGS_CLIS` 里、不许通配；`reason` ≥ 24 字、
 * 不是占位值，且要说清"为什么它收敛不了"。放行**只对 `parseArgs` 一个名字**成立 ——
 * 被放行的那一支**照样**要过腿 ⑧（两种参数形式 + 未知参数报码）和腿 ⑨（平凡路径 0）：
 * 允许清单放行的是"留着自己的解析器"，不是"可以不统一参数形式"。
 */
export const PARSEARGS_ALLOWLIST = Object.freeze([])

/**
 * 腿 ⑧ 的探针表：每支 CLI 一个**它认得的取值键** + 平凡调用（空格形式与等号形式**等价**）。
 *
 * 为什么用 `--op`：`-19` 的形状正是"**取值键**写成等号形式"；7 支 bin CLI 都有 `--op`。
 * `.tools` 四支没有 `--op`，各取它自己的取值键（`--concept` / `--set` / `--repo`）。
 */
export const FORM_PROBES = Object.freeze([
  Object.freeze({ rel: 'presets/agenia/bin/agenia-brain.mjs', key: '--op', spaced: ['--op', 'help'], equals: ['--op=help'], note: '平凡的 help' }),
  Object.freeze({ rel: 'presets/agenia/bin/agenia-local.mjs', key: '--op', spaced: ['--op', 'help'], equals: ['--op=help'], note: '平凡的 help' }),
  Object.freeze({ rel: 'presets/agenia/bin/agenia-route.mjs', key: '--op', spaced: ['--op', 'help'], equals: ['--op=help'], note: '平凡的 help' }),
  Object.freeze({ rel: 'presets/agenia/bin/bg-notify.mjs', key: '--op', spaced: ['--op', 'help'], equals: ['--op=help'], note: '平凡的 help' }),
  Object.freeze({ rel: 'presets/agenia/bin/install.mjs', key: '--op', spaced: ['--op', 'help'], equals: ['--op=help'], note: '平凡的 help' }),
  Object.freeze({ rel: 'presets/agenia/bin/release-scan.mjs', key: '--op', spaced: ['--op', 'help'], equals: ['--op=help'], note: '平凡的 help' }),
  Object.freeze({ rel: 'presets/agenia/bin/rollback.mjs', key: '--op', spaced: ['--op', 'help'], equals: ['--op=help'], note: '平凡的 help' }),
  Object.freeze({ rel: '.tools/census.mjs', key: '--concept', spaced: ['--json', '--concept', '原子写'], equals: ['--json', '--concept=原子写'], note: '读只读那一格' }),
  Object.freeze({ rel: '.tools/fingerprint.mjs', key: '--set', spaced: ['--json', '--root', '<repo>', '--set', 'code'], equals: ['--json', '--root=<repo>', '--set=code'], note: '两个键都写两种形式' }),
  Object.freeze({ rel: '.tools/tree-at-commit.mjs', key: '--repo', spaced: ['--help', '--repo', '<repo>'], equals: ['--help', '--repo=<repo>'], note: 'help 走 stderr（stdout 为空）' }),
  Object.freeze({ rel: '.tools/决议-check.mjs', key: '--op', spaced: ['--json', '--op', 'check'], equals: ['--json', '--op=check'], note: '只读的 check' }),
])

/**
 * 腿 ⑨ 的三个平凡路径（"每支 CLI 的 `--op help`/已文档化的平凡路径"）。
 *
 * `takesValue` 的键在读数里换成真值（`<repo>` ⇒ 被测树根）；其余原样。
 * ⚠️ `决议-check --op check` 会**对账 INDEX 与 census**：Gate 3 若改了 `parseArgs` 却没重跑
 *    `census --write-index`，这一格会红在"页与口径不是同一版"上 —— 那是**顺序**问题（契约 §5.2），
 *    不是某支 CLI 坏了。
 */
export const TRIVIAL_PATHS = FORM_PROBES

/**
 * 腿 ⑨ 的主路径**改前冻结值**（2026-11-13 现量；Gate 3 之后必须逐条同值）。
 *
 * 选这三支的理由：一支最重的 bin（`brain`，参数/根判定最复杂）· 一支 `.tools`（另一棵树、
 * 另一套 import 形状）· 一支 workspace 侧、只读的（`local health`）。
 * 另两支 bin（`install` / `rollback`）的行为由 `INS-01` / `INS-02` / `INS-03` 既有腿守着；
 * `route` 的由 C1/路线账本那几格守着 —— 本腿不重复判它们。
 */
export const BEHAVIOUR_PINS = Object.freeze([
  Object.freeze({
    id: 'brain-init',
    rel: 'presets/agenia/bin/agenia-brain.mjs',
    why: '主路径正例：初始化共享脑根（写面最重的一条）',
    args: ['--op', 'init', '--data-root', '<fixture:brain-root>', '--test-mode'],
    expect: Object.freeze({ exit: 0, code: null }),
  }),
  Object.freeze({
    id: 'brain-state-read-uninitialized',
    rel: 'presets/agenia/bin/agenia-brain.mjs',
    why: '主路径负例：未初始化的根 ⇒ 具名码 + 非零退出（参数统一不许把这条压平）',
    args: ['--op', 'state-read', '--data-root', '<fixture:fresh-root>', '--test-mode'],
    expect: Object.freeze({ exit: 7, code: 'E_DATA_MISSING' }),
  }),
  Object.freeze({
    id: 'local-health',
    rel: 'presets/agenia/bin/agenia-local.mjs',
    why: '主路径正例：workspace 侧的派生卡（只读 op，零权威写入）',
    args: ['--op', 'health', '--workspace', '<fixture:workspace>', '--test-mode'],
    expect: Object.freeze({ exit: 0, code: null }),
  }),
  Object.freeze({
    id: 'census-json',
    rel: '.tools/census.mjs',
    why: '.tools 那一族的代表：真跑一次普查（另一棵树 + 另一套 import 形状）',
    args: ['--json', '--concept', '原子写'],
    expect: Object.freeze({ exit: 0, code: null }),
  }),
])

// ── 小工具 ─────────────────────────────────────────────────────────────────
const posix = (p) => String(p).replace(/\\/g, '/')
const lineOf = (text, index) => text.slice(0, index).split('\n').length
const isCommentLine = (line) => /^\s*(\/\/|\*|\/\*)/.test(line)

/** 从定义点起按"先配平参数括号、再配平函数体"取正文（`function f({a}, b) {…}` 也对）。 */
function bodySpanOf(text, index) {
  const open = text.indexOf('(', index)
  if (open < 0) return { chars: text.length - index, closed: false }
  let depth = 0
  let close = -1
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) { close = i; break }
    }
  }
  if (close < 0) return { chars: text.length - index, closed: false }
  const brace = text.indexOf('{', close)
  if (brace < 0) return { chars: text.length - index, closed: false }
  let bd = 0
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === '{') bd += 1
    else if (text[i] === '}') {
      bd -= 1
      if (bd === 0) return { chars: i + 1 - index, closed: true }
    }
  }
  return { chars: text.length - index, closed: false }
}

/** 这个名字在这份正文里**导出**了没有（行内 `export`，或文件末/别处的 `export { … }` / `export { … } from`）。 */
function exportedAt(text, name, lineNo) {
  const line = (text.split(/\r?\n/)[lineNo - 1] ?? '')
  if (/^\s*export\s/.test(line)) return true
  return new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(text)
}

/** 一份正文里某名字的**顶层定义点**（形状表与 `cli-guards-shared.mjs` 同一份）。 */
export function definitionsOf(text, name) {
  const out = []
  const seen = new Set()
  for (const form of definitionForms(name)) {
    const re = new RegExp(form.re.source, 'gm')
    let m
    while ((m = re.exec(text)) !== null) {
      const line = lineOf(text, m.index)
      if (isCommentLine(text.split(/\r?\n/)[line - 1] ?? '')) continue
      if (/^[ \t]/.test(text.split(/\r?\n/)[line - 1] ?? '')) continue // 只数顶层（列 0）
      if (seen.has(line)) continue
      seen.add(line)
      const span = bodySpanOf(text, m.index)
      out.push({ line, kind: form.kind, chars: span.chars, closed: span.closed, exported: exportedAt(text, name, line) })
    }
  }
  return out.sort((a, b) => a.line - b.line)
}

/** 静态 import 的说明符（`import … from 'x'`；不含动态 `await import(`）。 */
export function staticImportSpecs(text) {
  const out = []
  const re = /^\s*import\s+[^;\n]*?from\s+['"]([^'"]+)['"]/gm
  let m
  while ((m = re.exec(text)) !== null) out.push({ line: lineOf(text, m.index), spec: m[1] })
  return out
}

const readMaybe = (file) => {
  if (!existsSync(file)) return { exists: false, text: null, error: null }
  try {
    return { exists: true, text: readFileSync(file, 'utf8'), error: null }
  } catch (err) {
    return { exists: true, text: null, error: String(err?.code ?? err?.name ?? 'E_READ') }
  }
}

/** 一个目录的顶层 `*.mjs`（不递归 —— `.tools/_scratch` / `_staging` 不在扫描面里）。 */
function topLevelMjs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mjs'))
    .map((e) => e.name)
    .sort()
}

/** 递归列 `presets/**` 里的源码（`*.mjs` / `*.js`；不跟 `node_modules` / `.runtime`）。 */
function walkSource(root) {
  const out = []
  const go = (dir) => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.runtime') continue
        go(full)
      } else if (e.isFile() && (e.name.endsWith('.mjs') || e.name.endsWith('.js'))) out.push(full)
    }
  }
  go(root)
  return out
}

// ── 定义腿（⑦）的扫描器 ─────────────────────────────────────────────────────
/**
 * 扫"CLI 骨架"的定义面。`root` 可注入 ⇒ 夹具（合成树）与真树走**同一份**扫描器。
 *
 * @param {{root:string, stagedPreset?:string, allowlist?:ReadonlyArray<{rel:string,reason:string}>}} input
 */
export function scanCliSkeleton({ root, stagedPreset = null, allowlist = PARSEARGS_ALLOWLIST } = {}) {
  const base = path.resolve(root)
  const cliFiles = [...CLI_FILES]
  const reading = {
    root: base,
    staged_preset: stagedPreset === null ? null : path.resolve(stagedPreset),
    scan_face: '20 支 CLI 的顶层（presets/agenia/bin/*.mjs + .tools/*.mjs）+ presets/agenia/lib 的两份共享件',
    scanned_clis: 0,
    read_errors: [],
    clis: [],
    harness: { rel: HARNESS_REL, exists: false, defs: {}, exports: {}, block: { found: false, begin_line: null, end_line: null, normalized: null }, anchor: null, read_error: null },
    guards: { rel: GUARDS_REL, exists: false, emit_defs: [], read_error: null },
    tree_defs: { parseArgs: [], cliError: [], emit: [] },
    main_defs: [],
    main_exported: [],
    published: null,
    allowlist: allowlist.map((e) => ({ rel: e.rel, reason: e.reason })),
    main_expect: MAIN_EXPECT,
    main_decision_says: MAIN_DECISION_SAYS,
    line: '',
  }

  for (const rel of cliFiles) {
    const file = path.join(base, ...rel.split('/'))
    const src = readMaybe(file)
    if (!src.exists) { reading.read_errors.push({ rel, code: 'E_MISSING' }); continue }
    if (src.error !== null) { reading.read_errors.push({ rel, code: src.error }); continue }
    reading.scanned_clis += 1
    const row = { rel, bytes: Buffer.byteLength(src.text, 'utf8'), defs: {} }
    for (const name of [...SKELETON_NAMES, MAIN_NAME]) row.defs[name] = definitionsOf(src.text, name)
    reading.clis.push(row)
    if (rel === ROLLBACK_REL) row.imports_harness = staticImportSpecs(src.text).some((x) => posix(path.posix.normalize(path.posix.join('presets/agenia/bin', x.spec))) === HARNESS_REL)
  }

  // 共享件：harness（三个名字都要导出）+ guards（emit 的唯一定义所在）
  const harnessFile = path.join(base, ...HARNESS_REL.split('/'))
  const harnessSrc = readMaybe(harnessFile)
  reading.harness.exists = harnessSrc.exists
  reading.harness.read_error = harnessSrc.error
  if (harnessSrc.text !== null) {
    for (const name of SKELETON_NAMES) {
      reading.harness.defs[name] = definitionsOf(harnessSrc.text, name)
      reading.harness.exports[name] = exportedAt(harnessSrc.text, name, reading.harness.defs[name][0]?.line ?? 1)
    }
    const span = markedSpans(harnessSrc.text, beginOf(CLI_HARNESS_BLOCK)).find((s) => s.label === CLI_HARNESS_BLOCK.label) ?? null
    reading.harness.block = span === null
      ? { found: false, begin_line: null, end_line: null, normalized: null }
      : { found: true, begin_line: span.begin_line, end_line: span.end_line, normalized: normalizeBlock(span.text) }
    reading.harness.anchor = harnessSrc.text.split(/\r?\n/).find((l) => l.includes(KNIFE_ANCHOR)) ?? null
  }
  const guardsFile = path.join(base, ...GUARDS_REL.split('/'))
  const guardsSrc = readMaybe(guardsFile)
  reading.guards.exists = guardsSrc.exists
  reading.guards.read_error = guardsSrc.error
  if (guardsSrc.text !== null) reading.guards.emit_defs = definitionsOf(guardsSrc.text, 'emit')

  // 树里的全部定义点（`presets/**` 递归 + `.tools` 顶层）—— 用来抓"清单外又抄了一份"
  for (const name of SKELETON_NAMES) {
    const hits = []
    const files = [...walkSource(path.join(base, 'presets', 'agenia')), ...topLevelMjs(path.join(base, '.tools')).map((n) => path.join(base, '.tools', n))]
    for (const file of files) {
      const src = readMaybe(file)
      if (src.text === null) continue
      const rel = posix(path.relative(base, file))
      for (const d of definitionsOf(src.text, name)) hits.push({ rel, line: d.line, chars: d.chars, exported: d.exported })
    }
    reading.tree_defs[name] = hits.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line))
  }
  reading.main_defs = reading.clis.flatMap((row) => row.defs[MAIN_NAME].map((d) => ({ rel: row.rel, line: d.line, chars: d.chars, exported: d.exported })))

  // 出厂件（staged `bin/rollback.mjs`）：派生内联副本的**唯一**合法形态
  if (reading.staged_preset !== null) {
    const shipped = path.join(reading.staged_preset, ...SHIPPED_ROLLBACK_REL.split('/'))
    const art = readMaybe(shipped)
    const live = reading.clis.find((r) => r.rel === ROLLBACK_REL) ?? null
    const published = {
      rel: SHIPPED_ROLLBACK_REL,
      file: shipped,
      exists: art.exists,
      read_error: art.error,
      inline_required: live?.imports_harness === true,
      static_imports: art.text === null ? null : staticImportSpecs(art.text).length,
      block: { found: false, begin_line: null, end_line: null, same: null, normalized: null, source_normalized: reading.harness.block.normalized },
      skeleton_defs: {},
      read: art.text,
    }
    if (art.text !== null) {
      const span = shippedBlockOf(art.text, CLI_HARNESS_BLOCK)
      const shippedNorm = span.found ? normalizeBlock(span.text) : null
      published.block = {
        found: span.found,
        begin_line: span.begin_line,
        end_line: span.end_line,
        same: span.found && reading.harness.block.found ? shippedNorm === reading.harness.block.normalized : null,
        normalized: shippedNorm,
        source_normalized: reading.harness.block.normalized,
      }
      for (const name of SKELETON_NAMES) published.skeleton_defs[name] = definitionsOf(art.text, name)
    }
    delete published.read
    reading.published = published
  }

  reading.line = buildSkeletonLine(reading)
  return reading
}

/** 一行读数：点名每一处定义落在 `file:line`（"名字 + 位置"是这一格的可复查面）。 */
function buildSkeletonLine(reading) {
  const where = (list) => (list.length === 0 ? '（没有）' : list.map((h) => `${h.rel}:${h.line}`).join(' · '))
  const perCli = reading.clis
    .filter((row) => SKELETON_NAMES.some((n) => row.defs[n].length > 0))
    .map((row) => `${path.posix.basename(row.rel)} → ${SKELETON_NAMES.filter((n) => row.defs[n].length > 0).map((n) => `${n}×${row.defs[n].length}（${row.defs[n].map((d) => `:${d.line}/${d.chars}`).join(',')}）`).join(' + ')}`)
  return `扫了 ${reading.scanned_clis} 支 CLI；骨架定义：${perCli.length === 0 ? '11 支里各 0 处（干净）' : perCli.join(' | ')}`
    + ` · 树里 parseArgs ${reading.tree_defs.parseArgs.length} / cliError ${reading.tree_defs.cliError.length} / emit ${reading.tree_defs.emit.length}`
    + ` · main ${reading.main_defs.length}（决定说 ${reading.main_decision_says}）`
    + ` · 共享件 ${reading.harness.exists ? `${HARNESS_REL}（块 ${reading.harness.block.found ? `${reading.harness.block.begin_line}…${reading.harness.block.end_line}` : '**没有**'}）` : '**不在**'}`
}

// ── 定义腿的判词 ───────────────────────────────────────────────────────────
/**
 * @param {ReturnType<typeof scanCliSkeleton>} reading
 * @returns {{verdict:'GREEN'|'RED', problems:Array<{code:string,message:string,detail?:object}>}}
 */
export function skeletonVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  const where = (list) => (list.length === 0 ? '（没有）' : list.map((h) => `${h.rel}:${h.line}（${h.chars} 字符${h.exported ? ' · exported' : ''}）`).join(' · '))

  if (reading.scanned_clis === 0) {
    push('B4-SCAN-EMPTY', `一支 CLI 都没扫到（${reading.root}）—— "0 处定义"是真空真，不是绿`)
  }
  if (reading.scanned_clis > 0 && reading.scanned_clis < CLI_FILES.length) {
    const seen = new Set(reading.clis.map((r) => r.rel))
    push('B4-CLI-MISSING', `扫描面少了几支 CLI（扫到 ${reading.scanned_clis}/${CLI_FILES.length}）：${CLI_FILES.filter((rel) => !seen.has(rel)).join(' · ')} —— 少扫一支，"那一支 0 处"就没有证据`)
  }
  for (const e of reading.read_errors) push('B4-READ', `读不动一份源码（${e.code}）：${e.rel}`)

  // 共享件：存在 · 三个名字都导出 · parseArgs/cliError 的定义各 1 处 · 标记块在 · 刀锚在
  if (!reading.harness.exists) {
    push('B4-HARNESS-MISSING', `共享件不在：${HARNESS_REL} —— 11 支 CLI 的骨架没有落点（"0 处定义"此时无从谈起）`)
  } else if (reading.harness.read_error !== null) {
    push('B4-READ', `共享件读不动（${reading.harness.read_error}）：${HARNESS_REL}`)
  } else {
    for (const name of SKELETON_NAMES) {
      if (reading.harness.exports[name] !== true) {
        push('B4-HARNESS-EXPORT', `共享件没有导出 \`${name}\`（${HARNESS_REL}）—— 11 支 CLI 要 import 它`)
      }
    }
    for (const name of ['parseArgs', 'cliError']) {
      const defs = reading.harness.defs[name]
      if (defs.length !== 1) {
        push('B4-HARNESS-DEF-COUNT', `\`${name}\` 在共享件里必须**恰好 1 处**定义，实得 ${defs.length} 处（${where(defs.map((d) => ({ ...d, rel: HARNESS_REL })))}）`)
      }
    }
    const emitDefs = reading.harness.defs.emit
    const guardEmit = reading.guards.emit_defs
    const emitDefinitionSites = [...emitDefs.map((d) => ({ rel: HARNESS_REL, line: d.line })), ...guardEmit.map((d) => ({ rel: GUARDS_REL, line: d.line }))]
    if (emitDefinitionSites.length !== 1) {
      push('B4-EMIT-DUPLICATE', `\`emit\` 的**定义**在共享件里必须恰好 1 处（今天在 ${GUARDS_REL} 的标记块里），实得 ${emitDefinitionSites.length} 处：${emitDefinitionSites.map((h) => `${h.rel}:${h.line}`).join(' · ')} —— 两块各定义一个 emit 就是"同一件事两份正文"`)
    }
    if (!reading.harness.block.found) {
      push('B4-HARNESS-BLOCK-MISSING', `共享件里没有 \`${beginOf(CLI_HARNESS_BLOCK)}\` … \`@inline-end ${CLI_HARNESS_BLOCK.label}\` 那一对标记（${HARNESS_REL}）—— 出厂件（单文件）没有可内联的正文`)
    }
    if (reading.harness.anchor === null) {
      push('B4-KNIFE-ANCHOR', `共享件里找不到刀锚 \`${KNIFE_ANCHOR}\`（${HARNESS_REL}）—— 未知参数"出声"那一行必须带它：`
        + '没有锚，"把某一支改回静默无视"这把刀就切不出去（`cand-20261106-0140`：刀锚在函数字节上，谁改那一行谁同批改刀）')
    }
  }

  // 11 支：三个名字各 0 处（parseArgs 可按允许清单放行）
  const allow = new Map((reading.allowlist ?? []).map((e) => [e.rel, e.reason]))
  for (const [rel, reason] of allow.entries()) {
    if (!PARSE_ARGS_CLIS.includes(rel)) {
      push('B4-ALLOWLIST-SHAPE', `允许清单里的 \`${rel}\` 不在 11 支有 \`parseArgs\` 的 CLI 里 —— 这条放行没有对象`)
    }
    if (/[*?]/.test(rel)) push('B4-ALLOWLIST-SHAPE', `允许清单不许通配：\`${rel}\``)
    if (typeof reason !== 'string' || reason.trim().length < 24 || /^[—\-?]+$|TODO|TBD|待补/i.test(reason.trim())) {
      push('B4-ALLOWLIST-SHAPE', `允许清单里 \`${rel}\` 的理由不合格（要 ≥ 24 字、不是占位值，并说清"为什么收敛不了"）：${JSON.stringify(reason)}`)
    }
  }
  for (const rel of PARSE_ARGS_CLIS) {
    const row = reading.clis.find((r) => r.rel === rel)
    if (row === undefined) continue
    const local = SKELETON_NAMES
      .filter((name) => row.defs[name].length > 0 && !(name === 'parseArgs' && allow.has(rel)))
      .map((name) => ({ name, defs: row.defs[name] }))
    if (local.length === 0) continue
    push('B4-DEF-LOCAL', `${rel} 里还留着自己那份骨架：`
      + local.map(({ name, defs }) => `\`${name}\`${defs.map((d) => `:${d.line}（${d.chars} 字符）`).join(' · ')}`).join('；')
      + ` —— 与共享件 ${reading.harness.exists ? HARNESS_REL : '（还没落盘）'} 是同一个功能的第二份实现（改一边不会有任何判据变红）`)
  }
  // 允许清单：放行了就必须**指得到**那一处（清单是账，不是许愿池）
  for (const [rel, reason] of allow.entries()) {
    const row = reading.clis.find((r) => r.rel === rel)
    if (row !== undefined && row.defs.parseArgs.length === 0) {
      push('B4-ALLOWLIST-STALE', `允许清单放行了 \`${rel}\`，但它里面 \`parseArgs\` 是 0 处定义 —— 条目过期了（理由：${JSON.stringify(reason)}）`)
    }
  }

  // 树里的同名物：清单外的一处都不许（否则"再抄一份到别的文件"不会响）
  for (const name of SKELETON_NAMES) {
    for (const hit of reading.tree_defs[name]) {
      if (PARSE_ARGS_CLIS.includes(hit.rel)) continue
      if (name === 'emit' && (hit.rel === GUARDS_REL || hit.rel === HARNESS_REL)) continue
      if (name !== 'emit' && hit.rel === HARNESS_REL) continue
      if (OUT_OF_SCOPE_NAMESAKE.some((e) => e.rel === hit.rel && e.name === name)) continue
      push('B4-DEF-NAMESAKE', `\`${name}\` 在清单之外的文件里也有定义：${hit.rel}:${hit.line}（${hit.chars} 字符）`
        + ` —— 本票的 11 支之外只许有：共享件（${name === 'emit' ? GUARDS_REL : HARNESS_REL}）${name === 'emit' ? `；已知残留：${OUT_OF_SCOPE_NAMESAKE.map((e) => `${e.rel}（${e.why}）`).join(' · ')}` : ''}`
        + '；清单外这一处要么是又抄了一份，要么该进允许清单（要说明它不是同一个东西）')
    }
  }
  // main 栅栏：13 处 · 13 个文件 · 各 1 处 · 不导出（不共享）
  const mainByFile = new Map()
  for (const d of reading.main_defs) mainByFile.set(d.rel, (mainByFile.get(d.rel) ?? 0) + 1)
  if (reading.main_defs.length !== MAIN_EXPECT) {
    push('B4-MAIN-COUNT', `\`main\` 必须仍是 **${MAIN_EXPECT} 处**（决定 §① 写的是 ${MAIN_DECISION_SAYS}，2026-11-13 实测是 ${MAIN_EXPECT}：`
      + `${MAIN_FILES.map((rel) => path.posix.basename(rel)).join(' · ')}），实得 ${reading.main_defs.length} 处：${where(reading.main_defs)}`
      + ' —— 这一格是**范围栅栏**：谁把 `main` 合并/抽走，这里就红')
  }
  const missingMain = MAIN_FILES.filter((rel) => !mainByFile.has(rel))
  const extraMain = [...mainByFile.keys()].filter((rel) => !MAIN_FILES.includes(rel))
  if (missingMain.length > 0) push('B4-MAIN-SET', `这几支 CLI 的 \`main\` 不见了：${missingMain.join(' · ')}`)
  if (extraMain.length > 0) push('B4-MAIN-SET', `清单外的文件里冒出了 \`main\`：${extraMain.join(' · ')}（范围蔓延）`)
  for (const [rel, count] of mainByFile.entries()) {
    if (count !== 1) push('B4-MAIN-COUNT', `${rel} 里有 ${count} 处 \`main\` —— 每支 CLI 只许 1 处`)
  }
  // 导出与否是**读数**，不是红：`.tools/census.mjs` / `.tools/决议-check.mjs` 今天就是
  // `export function main`（测试侧要 import 它们那两个入口），这条在本票之前就成立。
  reading.main_exported = reading.main_defs.filter((d) => d.exported).map((d) => `${d.rel}:${d.line}`)
  if (reading.harness.defs?.main?.length > 0) push('B4-MAIN-IN-HARNESS', `共享件里出现了 \`main\`（${HARNESS_REL}）—— 决定 §④：入口本来就各不相同，不抽模板`)

  // 出厂件：派生内联副本（只在"live rollback 真 import 了共享件"时才要求）
  const pub = reading.published
  if (pub !== null && pub.exists && pub.read_error === null && pub.inline_required) {
    if (pub.static_imports > 0) {
      push('B4-PUBLISHED-IMPORT', `出厂件（${SHIPPED_ROLLBACK_REL}）有 ${pub.static_imports} 行静态 import —— 拍板 Q6：单文件零静态引用；`
        + '`live rollback` 已经 import 共享骨架 ⇒ 发布时要把那一块**内联**、把 import 去掉')
    }
    if (!pub.block.found) {
      push('B4-PUBLISHED-INLINE-MISSING', `出厂件里没有 \`${CLI_HARNESS_BLOCK.label}\` 那一段包装 —— live rollback 已 import ${HARNESS_REL}，`
        + '发布器（`install.mjs --op publish-staged`）要把这一块也内联进出厂件（RC-3 的标记块机制）')
    } else if (pub.block.same !== true) {
      push('B4-PUBLISHED-INLINE-DRIFT', `出厂件里那一段骨架正文与共享件**不是同一段**（源 ${HARNESS_REL}:${reading.harness.block.begin_line}…${reading.harness.block.end_line} / 出厂件 :${pub.block.begin_line}…${pub.block.end_line}）—— 改了一边没改另一边`)
    }
    // 出厂件里的三个名字：各 1 处（正文同源由上面那两格判）
    for (const name of SKELETON_NAMES) {
      const defs = pub.skeleton_defs[name] ?? []
      if (defs.length !== 1) {
        push('B4-PUBLISHED-DEF-COUNT', `出厂件里 \`${name}\` 必须恰好 1 处定义，实得 ${defs.length} 处：${defs.map((d) => `:${d.line}`).join(' · ') || '（没有）'}`)
      }
    }
  }

  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

// ── 参数形式腿（⑧）的跑法与判词 ─────────────────────────────────────────────
/** 跑一次 CLI，收退出码 + stdout/stderr 全文 + stdout 最后一行 JSON 信封。 */
export function runCliProbe({ nodeBin = process.execPath, cliFile, args, cwd, env, timeoutMs = 180000 }) {
  if (!existsSync(cliFile)) {
    return { cli: path.posix.basename(String(cliFile)), cli_file: cliFile, args, missing: true, exit_code: null, stdout: '', stderr: '', json: null, code: null }
  }
  const r = spawnSync(nodeBin, [cliFile, ...args], { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  const stdout = String(r.stdout ?? '')
  const stderr = String(r.stderr ?? '')
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim() !== '')
  let json = null
  try {
    json = JSON.parse(lines[lines.length - 1] ?? 'null')
  } catch {
    json = null
  }
  return {
    cli: path.posix.basename(String(cliFile)),
    cli_file: cliFile,
    args,
    missing: false,
    timed_out: r.error?.code === 'ETIMEDOUT',
    spawn_error: r.error ? String(r.error.message) : null,
    exit_code: r.status,
    stdout,
    stderr,
    json,
    code: json?.error?.code ?? null,
    ok: json?.ok ?? null,
  }
}

/** 把探针表里的占位符换成真值（`<repo>` ⇒ 被测树根）。 */
export function concretiseArgs(args, { repo }) {
  return args.map((a) => a.split('<repo>').join(repo))
}

/**
 * 一条 CLI 的三次探针：空格形式 / 等号形式 / 多带一个未知参数。**跑法与判词分开** ——
 * 刀（`mutateHarnessForKnife`）喂的是同一份判词，只是跑的是被改过的副本。
 */
export function probeCliForms({ cliFile, probe, cwd, env, repo, unknownFlag = UNKNOWN_ARG_FLAG, nodeBin = process.execPath }) {
  const spaced = runCliProbe({ nodeBin, cliFile, args: concretiseArgs(probe.spaced, { repo }), cwd, env })
  const equals = runCliProbe({ nodeBin, cliFile, args: concretiseArgs(probe.equals, { repo }), cwd, env })
  const unknown = runCliProbe({ nodeBin, cliFile, args: [...concretiseArgs(probe.spaced, { repo }), unknownFlag], cwd, env })
  return { cli: probe.rel, key: probe.key, spaced, equals, unknown }
}

/**
 * 腿 ⑧ 的判词。**纯函数**：喂什么结果判什么结果（刀与合成夹具都走这一份）。
 *
 * 三格，各自吞一条病：
 *   · **等号形式**：同一件事的两种写法 ⇒ `{exit_code, stdout}` 必须逐字相同（`stdout` 为空时比 `stderr`）；
 *   · **未知参数出声**：非零退出 + stdout 信封 `error.code === E_ARG_USAGE`；
 *   · **不许静默**：`exit 0` / `ok:true` / 没有任何码 ⇒ 单列（`-19` 的形状就是这一格）。
 *
 * @param {{results:Array<{cli:string,space?:string,spaced:object,equals:object,unknown:object}>, expectCode?:string}} input
 * @returns {{problems:Array<{code:string,message:string}>, per_cli:Array<object>}}
 */
export function judgeCliForms({ results, expectCode = UNKNOWN_ARG_CODE }) {
  const problems = []
  const perCli = []
  for (const r of results) {
    const cli = r.cli
    const row = { cli, key: r.key ?? null, form: 'ok', unknown: 'ok', notes: [] }
    if (r.spaced?.missing === true || r.equals?.missing === true || r.unknown?.missing === true) {
      problems.push({ code: 'B4-FORM-MISSING', message: `${cli} 不在盘上 —— 参数形式判不了（缺面不许记绿）` })
      row.form = 'missing'
      row.unknown = 'missing'
      perCli.push(row)
      continue
    }
    for (const [label, res] of [['空格形式', r.spaced], ['等号形式', r.equals], ['未知参数', r.unknown]]) {
      if (res?.timed_out === true || res?.spawn_error) {
        problems.push({ code: 'B4-FORM-RUN', message: `${cli} 的${label}探针没跑成（${res?.timed_out ? '超时' : res?.spawn_error}）` })
        row.form = 'run-failed'
      }
    }
    // ① `--k v` 与 `--k=v` 必须不可区分
    const a = r.spaced
    const b = r.equals
    const sameExit = a.exit_code === b.exit_code
    const sameStdout = a.stdout === b.stdout
    const stderrCompared = a.stdout === '' && b.stdout === ''
    const sameStderr = !stderrCompared || a.stderr === b.stderr
    if (!sameExit || !sameStdout || !sameStderr) {
      row.form = 'mismatch'
      problems.push({
        code: 'B4-FORM-EQ-MISMATCH',
        message: `${cli}：\`${(r.key ?? '--k')} v\` 与 \`${(r.key ?? '--k')}=v\` 不是同一件事 —— `
          + `退出码 ${a.exit_code} vs ${b.exit_code}`
          + `${sameStdout ? '' : ` · stdout 不同（${JSON.stringify(a.stdout.slice(0, 80))} vs ${JSON.stringify(b.stdout.slice(0, 80))}）`}`
          + `${sameStderr ? '' : ` · stderr 不同（${JSON.stringify(a.stderr.split(/\r?\n/)[0]?.slice(0, 80))} vs ${JSON.stringify(b.stderr.split(/\r?\n/)[0]?.slice(0, 80))}）`}`
          + ` ⇒ 只认一种写法的解析器（\`bug-20261113-19\` 那一族）`,
      })
    }
    // ②③ 未知参数：出声，而且要**具名码**
    const u = r.unknown
    const silent = u.exit_code === 0 || u.ok === true
    if (silent) {
      row.unknown = 'silent'
      problems.push({
        code: 'B4-FORM-UNKNOWN-SILENT',
        message: `${cli}：多带一个未知参数（${UNKNOWN_ARG_FLAG}）竟然**成功退出**（exit ${u.exit_code} / ok=${JSON.stringify(u.ok)}）—— `
          + '"参数写错"与"没写这个参数"在读数上同形，落点会静默回落到默认值（`bug-20261113-19` 的根因）',
      })
    } else if (u.code !== expectCode) {
      row.unknown = `code=${u.code ?? '(没有码)'}`
      problems.push({
        code: 'B4-FORM-UNKNOWN-CODE',
        message: `${cli}：未知参数必须报具名码 \`${expectCode}\`（exit 2），实得 ${u.code === null ? `**没有信封码**（stdout=${JSON.stringify(u.stdout.slice(0, 80))} · stderr=${JSON.stringify(u.stderr.split(/\r?\n/)[0]?.slice(0, 80))}）` : `\`${u.code}\``}。`
          + '文字前缀 / 别的码都不算"出声"：读信封的人分不清"参数不认识"与"op 不存在"',
      })
    }
    perCli.push(row)
  }
  return { problems, per_cli: perCli }
}

/** 腿 ⑨ 的平凡路径：每支 CLI 的 `--op help`（或已文档化的平凡路径）退出 0。 */
export function judgeTrivialPaths({ results }) {
  const problems = []
  for (const r of results) {
    if (r.missing === true) {
      problems.push({ code: 'B4-TRIVIAL-MISSING', message: `${r.cli} 不在盘上 —— 平凡路径判不了` })
      continue
    }
    if (r.exit_code !== 0) {
      problems.push({
        code: 'B4-TRIVIAL-EXIT',
        message: `${r.cli} 的平凡路径（\`${r.args.join(' ')}\`）必须 exit 0，实得 ${r.exit_code}`
          + `${r.code === null ? '' : ` / ${r.code}`}；stdout=${JSON.stringify(r.stdout.slice(0, 120))} stderr=${JSON.stringify(r.stderr.split(/\r?\n/)[0]?.slice(0, 120))}`,
      })
    }
  }
  return problems
}

/** 腿 ⑨ 的主路径：退出码与改前冻结值逐条相同（3 支代表 CLI）。 */
export function judgeBehaviourPins({ results }) {
  const problems = []
  for (const r of results) {
    const want = r.expect
    if (r.missing === true) {
      problems.push({ code: 'B4-BEHAVIOUR-MISSING', message: `${r.id}（${r.rel}）不在盘上 —— 主路径判不了` })
      continue
    }
    if (r.exit_code !== want.exit) {
      problems.push({
        code: 'B4-BEHAVIOUR-EXIT',
        message: `${r.id}：改前冻结值 exit=${want.exit}，实得 ${r.exit_code}（${r.code ?? '无码'}）—— 参数骨架归一不许改主路径的退出码`
          + `${String(r.stdout ?? '').trim() === '' ? '' : `；stdout=${JSON.stringify(String(r.stdout).slice(0, 160))}`}`,
      })
    }
    if ((r.code ?? null) !== (want.code ?? null)) {
      problems.push({ code: 'B4-BEHAVIOUR-CODE', message: `${r.id}：改前冻结码 ${JSON.stringify(want.code)}，实得 ${JSON.stringify(r.code ?? null)}` })
    }
  }
  return problems
}

// ── 刀（⑧ 的阳性对照）：把一支 CLI 的参数解析改回"静默无视未知参数"──────────
/**
 * 把一份共享骨架**改成病的那一版**：只换**带刀锚的那一行**（`B4-KNIFE-ANCHOR`）⇒ `void 0`，
 * 于是未知参数被静默跳过。返回改后的正文与读数（改没改、改了哪一行、字节数前后）。
 *
 * 口径边界：只认**一行**（契约 §3.4 要求"出声"是独立语句、单独一行、带锚）。找不到锚 / 找到多行
 * ⇒ `ok:false`（**不许**静默返回原文冒充"改过了"）。
 */
export function mutateHarnessForKnife(source) {
  const lines = String(source).split(/\r?\n/)
  const hits = lines.map((l, i) => ({ l, i })).filter((x) => x.l.includes(KNIFE_ANCHOR))
  const before = Buffer.byteLength(String(source), 'utf8')
  if (hits.length !== 1) {
    return { ok: false, reason: `刀锚 \`${KNIFE_ANCHOR}\` 命中 ${hits.length} 行（要恰好 1 行）`, lines: hits.map((x) => x.i + 1), bytes_before: before, bytes_after: null, text: null }
  }
  const { i, l } = hits[0]
  const indent = (/^\s*/.exec(l) ?? [''])[0]
  const replaced = `${indent}${KNIFE_IGNORE_LINE}`
  const out = [...lines.slice(0, i), replaced, ...lines.slice(i + 1)].join('\n')
  return {
    ok: true,
    reason: null,
    line: i + 1,
    original: l.trim(),
    replaced: replaced.trim(),
    bytes_before: before,
    bytes_after: Buffer.byteLength(out, 'utf8'),
    text: out,
  }
}

/**
 * 刀要用的一份"现场"：把被测预设定整份拷进运行根（跳过 `.runtime` —— 那是数据，不是代码）。
 * `applyMutation` 为真时才把共享骨架换成病的那一版；为假时是**控制面**那一份（逐字节原件）。
 * **不碰** staged 树（它是只读靶子）。
 *
 * @returns {{root:string, harness_file:string, mutation:object}}
 */
export function stageKnifeScene({ presetRoot, destRoot, applyMutation = false }) {
  const base = path.resolve(destRoot)
  mkdirSync(base, { recursive: true })
  const copyTree = (from, to) => {
    mkdirSync(to, { recursive: true })
    for (const e of readdirSync(from, { withFileTypes: true })) {
      if (e.name === '.runtime') continue
      const src = path.join(from, e.name)
      const dst = path.join(to, e.name)
      if (e.isDirectory()) copyTree(src, dst)
      else if (e.isFile()) writeFileSync(dst, readFileSync(src))
    }
  }
  copyTree(path.resolve(presetRoot), base)
  const harnessFile = path.join(base, ...HARNESS_REL.split('/').slice(2))
  const src = readMaybe(harnessFile)
  if (src.text === null) return { root: base, harness_file: harnessFile, mutation: { ok: false, reason: `拷过来的共享件读不到：${harnessFile}` } }
  const mutation = mutateHarnessForKnife(src.text)
  if (mutation.ok && applyMutation) writeFileSync(harnessFile, mutation.text, 'utf8')
  const out = { root: base, harness_file: harnessFile, applied: mutation.ok && applyMutation, mutation: { ...mutation } }
  delete out.mutation.text
  return out
}

/**
 * 刀那一段的判词（腿 ⑧ 的**阳性对照**）。三条一起读：
 *   ① **控制**：没改过的那一份，同一条判据必须**绿**（否则刀没对象）；
 *   ② **刀**：把未知参数那一行换掉之后，同一条判据必须**红**；
 *   ③ **点名**：红里必须有一条**点名被改的那一支**（`B4-FORM-UNKNOWN-SILENT` 里出现它的文件名）——
 *      "整体红了"不够，要能定位到那一支。
 *
 * 🔴 `primary_green` 是**这一格的当前状态**（真树那一跑是否已经绿）：今天它红 ⇒ 刀**还没对象**，
 *    记 `status:'not-run'`（读数里明写原因），**不许**当成"刀咬住了"。Gate 3 之后主判据转绿，
 *    刀必须 `status:'bit'`；那时若还 `not-run` ⇒ `B4-KNIFE-NOT-RUN` 红。
 */
export function judgeKnife({ primaryGreen, control, mutant, mutatedCli, mutation }) {
  const problems = []
  const reading = { status: 'not-run', reason: null, mutation, control_green: null, mutant_red: null, names_cli: null, mutated_cli: mutatedCli }
  if (primaryGreen !== true) {
    reading.reason = '主判据（真树那一跑）还没绿 ⇒ 刀没有对象；这一格的状态由腿 ⑧ 的主判据决定'
    return { problems, reading }
  }
  if (mutation?.ok !== true) {
    problems.push({ code: 'B4-KNIFE-NO-ANCHOR', message: `刀切不出去：${mutation?.reason ?? '原因不明'} —— 共享件里"未知参数出声"那一行必须带 \`${KNIFE_ANCHOR}\` 且单独成行` })
    reading.reason = 'no-anchor'
    return { problems, reading }
  }
  const ctl = judgeCliForms({ results: [control] })
  const mut = judgeCliForms({ results: [mutant] })
  const name = path.posix.basename(String(mutatedCli))
  reading.control_green = ctl.problems.length === 0
  reading.mutant_red = mut.problems.length > 0
  reading.names_cli = mut.problems.some((p) => p.message.includes(name))
  if (!reading.control_green) {
    problems.push({ code: 'B4-KNIFE-CONTROL-RED', message: `刀的控制面不成立：没改过的那一份（${mutatedCli}）都过不了同一条判据 ⇒ 这把刀量不出"改坏了"（先修主判据）` })
  }
  if (!reading.mutant_red) {
    problems.push({ code: 'B4-KNIFE-TOOTH', message: `刀没咬住：把 ${mutatedCli} 的未知参数那一行换成"静默"之后，同一条判据**仍然绿** —— 判据没在判"出声"` })
  } else if (!reading.names_cli) {
    problems.push({ code: 'B4-KNIFE-NAME', message: `刀咬住了，但红里没有点名被改的那一支（${mutatedCli}）—— 报文看不出该去修哪一支` })
  }
  if (problems.length === 0) reading.status = 'bit'
  return { problems, reading }
}

// ── 定义腿的合成树（控制面与刀；只在运行根里）──────────────────────────────
/** 合成共享件（**合规**）：一对标记 + 三个导出（`emit` 从 `guards` 转出）+ 刀锚。 */
export const MIRROR_HARNESS = [
  '/** 夹具：合规的 CLI 骨架共享件（定义腿的合成控制面）。 */',
  '// @inline-begin CLI 骨架正文（夹具：这一段会被内联进出厂件）',
  'export function cliError(code, message, details = null) {',
  '  const err = new Error(message)',
  '  err.code = code',
  '  err.details = details',
  '  return err',
  '}',
  '',
  'export function parseArgs(argv, spec = {}) {',
  '  const values = {}',
  '  const flags = {}',
  '  const positional = []',
  '  const takesValue = new Set(spec.value ?? [])',
  '  const isFlag = new Set(spec.flag ?? [])',
  '  for (let i = 0; i < argv.length; i += 1) {',
  '    const raw = argv[i]',
  '    if (!raw.startsWith("--")) { positional.push(raw); continue }',
  '    const eq = raw.indexOf("=")',
  '    const key = eq >= 0 ? raw.slice(0, eq) : raw',
  '    if (takesValue.has(key)) { values[key] = eq >= 0 ? raw.slice(eq + 1) : argv[(i += 1)]; continue }',
  '    if (isFlag.has(key)) { flags[key] = true; continue }',
  '    throw cliError("E_ARG_USAGE", `未知参数：${raw}`) // B4-KNIFE-ANCHOR',
  '  }',
  '  return { values, flags, positional }',
  '}',
  '// @inline-end CLI 骨架正文（夹具）',
  '',
  "export { emit } from './cli-guards.mjs'",
  '',
].join('\n')

/** 合成 `cli-guards.mjs`（只放 `emit` —— 它是 `emit` 的唯一定义处，B3 的共享那一份同形）。 */
export const MIRROR_GUARDS = [
  '/** 夹具：`emit` 的唯一定义处（B3 的共享件同形）。 */',
  '// @inline-begin 公共 helper 正文（夹具）',
  'export function emit(envelope) {',
  '  process.stdout.write(`${JSON.stringify(envelope)}\\n`)',
  '}',
  '// @inline-end 公共 helper 正文（夹具）',
  '',
].join('\n')

/** 一支"干净的 CLI"（0 处骨架定义；`withMain` 决定它是不是 13 支有入口的那一族）。 */
const cleanCli = (withMain) => (withMain ? '#!/usr/bin/env node\nfunction main(argv) {\n  return argv.length\n}\n\nmain(process.argv.slice(2))\n' : '#!/usr/bin/env node\nexport {}\n')

/**
 * 写一棵**合成的定义面**：20 支 CLI + 两份共享件（+ 可选的 staged 出厂件）。
 *
 * 用途：控制面（全合规 ⇒ 绿）与刀（改一处 ⇒ 红并点名）。**只在运行根里**，不碰真树。
 *
 * @param {{dir:string, overrides?:Record<string,string|null>, harness?:string, guards?:string, shippedRollback?:string|null, stagedDir?:string|null}} input
 *        `overrides`: 相对路径 → 正文（`null` = 该文件不写）
 */
export function writeSkeletonMirror({ dir, overrides = {}, harness = MIRROR_HARNESS, guards = MIRROR_GUARDS, shippedRollback = null, stagedDir = null }) {
  const base = path.resolve(dir)
  const put = (rel, text) => {
    const file = path.join(base, ...rel.split('/'))
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text, 'utf8')
    return file
  }
  for (const rel of CLI_FILES) {
    if (overrides[rel] === null) continue
    put(rel, overrides[rel] ?? cleanCli(MAIN_FILES.includes(rel)))
  }
  put(HARNESS_REL, harness)
  put(GUARDS_REL, guards)
  let stagedPreset = null
  if (typeof stagedDir === 'string') {
    stagedPreset = path.resolve(stagedDir)
    if (typeof shippedRollback === 'string') {
      const file = path.join(stagedPreset, ...SHIPPED_ROLLBACK_REL.split('/'))
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, shippedRollback, 'utf8')
    }
  }
  return { root: base, staged_preset: stagedPreset }
}

/**
 * 一份"和共享件同源"的出厂件（夹具）：把**两块**共享正文逐字放进发布器的包装标记之间
 * （`guards` 提供 `emit`，`cliHarness` 提供 `parseArgs` / `cliError` —— 与真发布器的顺序一致）。
 * `drift` 给了 ⇒ 在骨架块里多写一行（用来证明"标记里放改过的正文"会红）。
 */
export function mirrorShippedRollback({ harnessSource = MIRROR_HARNESS, guardsSource = MIRROR_GUARDS, drift = null } = {}) {
  const wrap = (block, source) => {
    const span = markedSpans(source, beginOf(block)).find((s) => s.label === block.label) ?? null
    if (span === null) return null
    return [`// ── 出厂件内联：${block.label}（夹具）──`, ...span.text.split('\n'), '// ── 内联结束 ──']
  }
  const guards = wrap(INLINE_BLOCKS.guards, guardsSource)
  const harness = wrap(CLI_HARNESS_BLOCK, harnessSource)
  if (guards === null || harness === null) return null
  if (drift !== null) harness.splice(harness.length - 1, 0, drift)
  return [
    '/** 夹具：出厂件（单文件）—— 共享正文逐字内联，零静态 import。 */',
    ...guards,
    ...harness,
    '',
  ].join('\n')
}

/**
 * 合成骨架（**合规的那一版**）：`parseArgs` 同时吃两种写法、未知参数**出声**（带刀锚）、一行 JSON。
 * 与真共享件**同一套对外行为**，但只有几十行 —— 它是判据自己的夹具，不是被测对象。
 */
export const SYNTH_HARNESS = [
  "/** 夹具：合规的 CLI 骨架（B4 腿 ⑦/⑧ 的合成控制面）。 */",
  'export function cliError(code, message, details = null) {',
  '  const err = new Error(message)',
  '  err.code = code',
  '  err.details = details',
  '  return err',
  '}',
  '',
  'export function parseArgs(argv, spec = {}) {',
  '  const values = {}',
  '  const flags = {}',
  '  const positional = []',
  '  const takesValue = new Set(spec.value ?? [])',
  '  const isFlag = new Set(spec.flag ?? [])',
  '  for (let i = 0; i < argv.length; i += 1) {',
  '    const raw = argv[i]',
  '    if (!raw.startsWith("--")) { positional.push(raw); continue }',
  '    const eq = raw.indexOf("=")',
  '    const key = eq >= 0 ? raw.slice(0, eq) : raw',
  '    if (takesValue.has(key)) { values[key] = eq >= 0 ? raw.slice(eq + 1) : argv[(i += 1)]; continue }',
  '    if (isFlag.has(key)) { flags[key] = true; continue }',
  '    throw cliError("E_ARG_USAGE", `未知参数：${raw}`) // B4-KNIFE-ANCHOR',
  '  }',
  '  return { values, flags, positional }',
  '}',
  '',
  'export function emit(envelope) {',
  '  process.stdout.write(`${JSON.stringify(envelope)}\\n`)',
  '}',
  '',
].join('\n')

/** 合成 CLI：只用骨架、只做两件事（`--op help` 成功 / 别的 op 报 `E_USAGE`）。 */
export const SYNTH_CLI = [
  '#!/usr/bin/env node',
  'import { cliError, emit, parseArgs } from "./harness.mjs"',
  '',
  'try {',
  '  const { values } = parseArgs(process.argv.slice(2), { value: ["--op"] })',
  '  if (values["--op"] !== "help") throw cliError("E_USAGE", `未知 op：${values["--op"]}`)',
  '  emit({ ok: true, op: "help", cli: "synth-cli.mjs" })',
  '} catch (err) {',
  '  emit({ ok: false, error: { code: err.code, message: err.message } })',
  '  process.exit(err.code === "E_ARG_USAGE" ? 2 : 5)',
  '}',
  '',
].join('\n')

/** 把合成夹具写到 `dir`（每次一个**新目录**；不删旧目录）。 */
export function writeSyntheticSkeleton(dir) {  const base = path.resolve(dir)
  mkdirSync(base, { recursive: true })
  const harness = path.join(base, 'harness.mjs')
  const cli = path.join(base, 'synth-cli.mjs')
  writeFileSync(harness, SYNTH_HARNESS, 'utf8')
  writeFileSync(cli, SYNTH_CLI, 'utf8')
  return { dir: base, harness, cli }
}

/** 合成控制面：同一份 CLI 与骨架，判据必须绿（等号形式 + 未知参数报码）。 */
export function synthFormResults({ cli, cwd, env, repo = process.cwd() }) {
  return probeCliForms({
    cliFile: cli,
    probe: { rel: 'synth-cli.mjs', key: '--op', spaced: ['--op', 'help'], equals: ['--op=help'] },
    cwd,
    env,
    repo,
  })
}

// ── 四条腿的编排（`INS-02` 只调这一处）──────────────────────────────────────
/**
 * 跑 `INS-02` 的四条 B4 腿（⑦ 定义 / ⑧ 参数形式 / ⑨ 行为 / ⑩ `main` 栅栏），外加两套刀：
 *
 *   · **合成自控**（今天就能跑）：合成 CLI + 合成骨架 ⇒ 控制面绿、把刀锚换成"静默" ⇒ 红且点名。
 *     它证明的是**判据与刀这套机械**会咬，不是被测对象；
 *   · **真源刀**（Gate 3 之后才有对象）：把 staged preset 整份拷进运行根 ⇒ 换掉共享件里带锚那一行
 *     ⇒ 拿**同一支** CLI 的副本跑同一条判据 ⇒ 必须红且**点名那一支**。
 *     `primaryGreen === false`（今天）⇒ 记 `status:'not-run'`，**不**当成刀咬住了。
 *
 * 夹具一律落在 `<运行根>/fixtures/b4/` 下（不写 `presets/**` / `.tools/**` / `_staging`）。
 *
 * @param {{repo:string, stagedPreset:string, runRoot:string, env?:object, nodeBin?:string}} input
 * @returns {{problems:Array<{code:string,message:string}>, readings:object}}
 */
export function runB4Legs({ repo, stagedPreset, runRoot, env = process.env, nodeBin = process.execPath }) {
  const problems = []
  const push = (code, message) => problems.push({ code, message })
  const base = path.join(runRoot, 'fixtures', 'b4')
  /**
   * 夹具目录名带一个**每次跑都不同**的尾巴：`brain init` 这一类主路径只在**空根**上成功
   * （`E_DATA_EXISTS`），同一个运行根被跑第二次时，第一跑的目录不能复用 —— 否则第二次会红在
   * "根已经有数据"上，而那不是被测对象的问题（`cand-20261016-measurement-self-proof`：读数要能重放）。
   */
  const nonce = `${process.pid}-${Date.now().toString(36)}`
  const mkdirWithMarker = (name) => {
    const dir = path.join(base, `${name}-${nonce}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, '.agenia-test-root'), JSON.stringify({ kind: 'agenia-test-run', run_id: path.basename(runRoot), schema: 1 }), 'utf8')
    return dir
  }
  const tmp = mkdirWithMarker('tmp')
  const brainRoot = mkdirWithMarker('brain-root')
  const freshRoot = mkdirWithMarker('fresh-root')
  const workspace = mkdirWithMarker('workspace')
  mkdirSync(path.join(workspace, '.team'), { recursive: true })
  const childEnv = { ...env, TEMP: tmp, TMP: tmp }
  const runEnv = { ...childEnv, AGENIA_TEST_RUN_ROOT: runRoot }

  /** preset 里的文件走 staged 树；`.tools` 走活树（工具不是发布物）。 */
  const runFile = (rel) => (rel.startsWith('.tools/') ? path.join(repo, ...rel.split('/')) : path.join(stagedPreset, rel.slice('presets/agenia/'.length)))

  // ── ⑦ 定义腿 + ⑩ main 栅栏
  const skeleton = scanCliSkeleton({ root: repo, stagedPreset, allowlist: PARSEARGS_ALLOWLIST })
  const skeletonV = skeletonVerdict(skeleton)
  for (const p of skeletonV.problems) push(p.code, p.message)

  // ── ⑧ 参数形式腿
  const formResults = FORM_PROBES.map((probe) => probeCliForms({
    cliFile: runFile(probe.rel), probe, cwd: runRoot, env: runEnv, repo, nodeBin,
  }))
  const formV = judgeCliForms({ results: formResults })
  for (const p of formV.problems) push(p.code, p.message)

  // ── ⑨ 平凡路径（每支 CLI 的 `--op help` / 已文档化路径 exit 0）
  const trivial = judgeTrivialPaths({ results: formResults.map((r) => r.spaced) })
  for (const p of trivial) push(p.code, p.message)

  // ── ⑨ 主路径（3 支代表 CLI · 4 条改前冻结值）
  const fixtureFor = { '<fixture:brain-root>': brainRoot, '<fixture:fresh-root>': freshRoot, '<fixture:workspace>': workspace }
  const behaviour = BEHAVIOUR_PINS.map((pin) => {
    const args = pin.args.map((a) => fixtureFor[a] ?? a)
    const res = runCliProbe({ nodeBin, cliFile: runFile(pin.rel), args, cwd: runRoot, env: runEnv })
    return { id: pin.id, rel: pin.rel, why: pin.why, args, expect: pin.expect, exit_code: res.exit_code, code: res.code, stdout: res.stdout, missing: res.missing === true }
  })
  for (const p of judgeBehaviourPins({ results: behaviour })) push(p.code, p.message)

  /**
   * 栅栏的**翻面自控**（纯函数，不碰盘）：把真读数里的一格改坏，判据必须红。
   * 为什么要有它：「保绿栅栏」如果永远绿，它与"没在判"长得一样（`mig-rules-14`：阳性对照是红这个字唯一的合法性来源）。
   *   · 行为腿：把 `brain-init` 的 exit 与 code 同时改掉 ⇒ 必须同时出 `B4-BEHAVIOUR-EXIT` 与 `B4-BEHAVIOUR-CODE`；
   *   · 平凡路径腿：把第一支的 exit 改成 1 ⇒ 必须出 `B4-TRIVIAL-EXIT`。
   * 判据自己红不了 ⇒ `B4-FENCE-SELF`（这一格失守，不许记绿）。
   */
  const mutatedBehaviour = behaviour.map((b) => (b.id === 'brain-init'
    ? { ...b, exit_code: (typeof b.exit_code === 'number' ? b.exit_code : 0) + 1, code: 'E_INTERNAL' }
    : b))
  const behaviourFlip = judgeBehaviourPins({ results: mutatedBehaviour })
  const behaviourFlipCodes = behaviourFlip.map((p) => p.code)
  if (!behaviourFlipCodes.includes('B4-BEHAVIOUR-EXIT') || !behaviourFlipCodes.includes('B4-BEHAVIOUR-CODE')) {
    push('B4-FENCE-SELF', `行为腿的翻面自控不成立：把 \`brain-init\` 的 exit/code 同时改坏，判据只出了 ${JSON.stringify(behaviourFlipCodes)}（要 \`B4-BEHAVIOUR-EXIT\` + \`B4-BEHAVIOUR-CODE\`）—— 这条栅栏永远绿，等于没在判`)
  }
  const mutatedTrivial = formResults.map((r, i) => (i === 0 ? { ...r.spaced, exit_code: 1 } : r.spaced))
  const trivialFlipCodes = judgeTrivialPaths({ results: mutatedTrivial }).map((p) => p.code)
  if (!trivialFlipCodes.includes('B4-TRIVIAL-EXIT')) {
    push('B4-FENCE-SELF', `平凡路径腿的翻面自控不成立：把第一支的 exit 改成 1，判据没出 \`B4-TRIVIAL-EXIT\`（实得 ${JSON.stringify(trivialFlipCodes)}）`)
  }

  // ── 刀 A · 合成自控（今天就跑）：同一份合成 CLI，控制面绿 / 换掉锚行 ⇒ 红且点名
  const synthScene = writeSyntheticSkeleton(path.join(base, 'synth'))
  const synthControl = synthFormResults({ cli: synthScene.cli, cwd: runRoot, env: runEnv, repo })
  const synthControlProblems = judgeCliForms({ results: [synthControl] }).problems
  const synthMutation = mutateHarnessForKnife(readFileSync(synthScene.harness, 'utf8'))
  let synthMutantProblems = []
  if (!synthMutation.ok) {
    push('B4-KNIFE-SELF', `合成骨架的刀锚不在（${synthMutation.reason}）—— 刀这套机械没被试过，不许记绿`)
  } else {
    writeFileSync(synthScene.harness, synthMutation.text, 'utf8')
    const synthMutant = synthFormResults({ cli: synthScene.cli, cwd: runRoot, env: runEnv, repo })
    synthMutantProblems = judgeCliForms({ results: [synthMutant] }).problems
    if (synthControlProblems.length > 0) {
      push('B4-KNIFE-SELF', `合成控制面都不绿（${synthControlProblems.map((p) => p.code).join(' / ')}）—— 这把刀量不出"改坏了"`)
    }
    if (synthMutantProblems.length === 0) {
      push('B4-KNIFE-SELF-TOOTH', '合成刀没咬住：把合成骨架的未知参数那一行换成"静默"之后判据仍然绿')
    } else if (!synthMutantProblems.some((p) => p.message.includes('synth-cli.mjs'))) {
      push('B4-KNIFE-SELF-NAME', `合成刀咬住了但没点名那一支：${synthMutantProblems.map((p) => p.code).join(' / ')}`)
    }
  }

  // ── 刀 B · 真源刀（主判据绿了才有对象）：控制面 = 原件副本，刀 = 换了锚行的副本
  const primaryGreen = formV.problems.length === 0
  const knifeCliRel = 'presets/agenia/bin/agenia-brain.mjs'
  const knifeProbe = FORM_PROBES.find((p) => p.rel === knifeCliRel)
  const knifeRunOn = (scene) => probeCliForms({
    cliFile: path.join(scene.root, knifeCliRel.slice('presets/agenia/'.length)),
    probe: knifeProbe, cwd: runRoot, env: runEnv, repo, nodeBin,
  })
  let knife = { problems: [], reading: { status: 'not-run', reason: '主判据（真树那一跑）还没绿 ⇒ 刀没有对象' } }
  if (primaryGreen) {
    const controlScene = stageKnifeScene({ presetRoot: stagedPreset, destRoot: path.join(base, 'knife-control'), applyMutation: false })
    const mutantScene = stageKnifeScene({ presetRoot: stagedPreset, destRoot: path.join(base, 'knife-mutant'), applyMutation: true })
    const control = knifeRunOn(controlScene)
    const mutant = knifeRunOn(mutantScene)
    knife = judgeKnife({ primaryGreen, control, mutant, mutatedCli: knifeCliRel, mutation: mutantScene.mutation })
    knife.reading.applied = mutantScene.applied
  }
  for (const p of knife.problems) push(p.code, p.message)

  const readings = {
    scan_face: skeleton.scan_face,
    skeleton_line: skeleton.line,
    skeleton_verdict: skeletonV.verdict,
    allowlist_applied: skeleton.allowlist,
    allowlist_note: skeleton.allowlist.length === 0
      ? '允许清单**空** ⇒ 11 支一律 0 处（严格形态；tree-at-commit 没有放行）'
      : `允许清单放行了 ${skeleton.allowlist.map((e) => `${e.rel}（理由：${e.reason}）`).join(' · ')} —— 放行只对 parseArgs 成立，那一支照样要过参数形式腿`,
    per_cli_defs: skeleton.clis.map((row) => `${row.rel}: ${SKELETON_NAMES.map((n) => `${n}=${row.defs[n].length}`).join(' ')}${row.defs.parseArgs.length > 0 ? `（parseArgs:${row.defs.parseArgs.map((d) => `${d.line}/${d.chars}`).join(',')}）` : ''}`),
    harness: { rel: skeleton.harness.rel, exists: skeleton.harness.exists, block: { found: skeleton.harness.block.found, begin_line: skeleton.harness.block.begin_line, end_line: skeleton.harness.block.end_line }, anchor: skeleton.harness.anchor === null ? null : skeleton.harness.anchor.trim(), exports: skeleton.harness.exports },
    guards_emit_defs: skeleton.guards.emit_defs,
    tree_defs: { parseArgs: skeleton.tree_defs.parseArgs, cliError: skeleton.tree_defs.cliError, emit: skeleton.tree_defs.emit },
    out_of_scope_namesake: OUT_OF_SCOPE_NAMESAKE,
    main: { count: skeleton.main_defs.length, expect: MAIN_EXPECT, decision_says: MAIN_DECISION_SAYS, files: skeleton.main_defs.map((d) => `${d.rel}:${d.line}`), exported_reading_only: skeleton.main_exported },
    published: skeleton.published,
    forms: formResults.map((r) => ({
      cli: r.cli,
      spaced: { exit: r.spaced.exit_code, code: r.spaced.code },
      equals: { exit: r.equals.exit_code, code: r.equals.code },
      unknown: { exit: r.unknown.exit_code, code: r.unknown.code, stdout_first: String(r.unknown.stdout ?? '').split(/\r?\n/)[0] ?? '' },
      same_exit: r.spaced.exit_code === r.equals.exit_code,
      same_stdout: r.spaced.stdout === r.equals.stdout,
    })),
    forms_verdict: formV.problems.length === 0 ? 'GREEN' : 'RED',
    per_cli_form: formV.per_cli,
    behaviour: behaviour.map((b) => ({ id: b.id, cli: b.rel, args: b.args, expect: b.expect, actual: { exit: b.exit_code, code: b.code }, same: b.exit_code === b.expect.exit && (b.code ?? null) === (b.expect.code ?? null) })),
    knife_self: {
      anchor_line: synthMutation.line ?? null,
      original: synthMutation.original ?? null,
      replaced: synthMutation.replaced ?? null,
      status: synthControlProblems.length === 0 && synthMutantProblems.length > 0 ? 'bit' : 'not-bit',
      control_problems: synthControlProblems.map((p) => p.code),
      mutant_problems: synthMutantProblems.map((p) => p.code),
    },
    fence_flip_self: {
      behaviour_flip_codes: behaviourFlipCodes,
      trivial_flip_codes: trivialFlipCodes,
      note: '两格都是纯函数自控：把真读数改坏一格，判据必须红（保绿栅栏不许永远绿）',
    },
    knife_real: knife.reading,
  }
  return { problems, readings }
}

