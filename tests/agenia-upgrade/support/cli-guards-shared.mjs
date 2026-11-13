/**
 * 量具：**install / rollback 的公共 helper 只剩一份**（构案 0008 · 史山清查 B3 · Gate 2）。
 *
 * 契约：`.team/test/2026-11-13/CONTRACT-史山清查-B3.md` §1。
 * 决定：`决议/构案/0008-install-rollback-公共-helper.md` §决定 ①②。
 *
 * ## 病（2026-11-13 现量 · 本文件的常量就是从这一次量出来的）
 * `presets/agenia/bin/install.mjs` 与 `rollback.mjs` 共有 **18 个同名函数**（B3 现量；B4 起这张量具管 **16 个**
 * —— `parseArgs` / `cliError` 移交给 `lib/cli-harness.mjs`，见下）：
 *   · **8 个逐字同体**（合计 2,194 字符）—— `assertDeletableTarget` · `defaultBackupRoot` · `driveOf` ·
 *     `emit` · `isUnder` · `normKey` · `pathVerdict` · `slugOf`。两份各揣一份，改一边不会有任何判据变红；
 *   · **已分叉的同名函数**（B3 时 10 个、B4 起 8 个 —— `parseArgs` / `cliError` 移交给
 *     `lib/cli-harness.mjs`，由 `support/cli-harness-shared.mjs` 判）：`allowedDeleteRoots` · `canonical` ·
 *     `insideTestScene` · `main` · `refuseDelete` · `resolveWithin` · `treeHashOf` · `walkFiles`。
 *     它们**不在本票**：盲合会把行为改掉。这一份量具只给它们留一条**范围腿**（"别顺手合并"）。
 *
 * ## 判什么（一条用例 = 一格；这里只是那两腿的量具）
 *   · **腿 ③ · 定义**：8 个 helper 在 `presets/**` 里各**恰好 1 处**定义，落在
 *     `presets/agenia/lib/cli-guards.mjs` 的**标记块**（`@inline-begin 公共 helper 正文` … ）里、
 *     且是 `export`；`install.mjs` / `rollback.mjs` 里各 **0 处**。
 *   · **腿 ⑤ · 已分叉的 8 个不许被动**：每个在 `install.mjs` / `rollback.mjs` 里仍**各 1 处**
 *     （合计 2）—— 合并 / 删除任何一支都红（防范围蔓延）。
 *
 * ## 三条口径（写在明处）
 *   ① **"处"= 定义形状**，不是猜测：`function name(` / `const name = function` / `const name = (…) =>`
 *      （与 `support/atomic-writers.mjs` 的 `DEFINITION_FORMS` 同一形状表），**且必须是顶层**（列 0）。
 *      注释行不算；嵌在函数体里的同名局部量不算（`inject.js:2017` 那个 `const driveOf = (p) =>` 就是一例，
 *      它和 CLI 那个 `driveOf` 没关系 —— 见扫描函数里那一段）。
 *   ② **同名物允许清单**（`NAMESAKE_ALLOWLIST`）：`driveOf` / `emit` / `isUnder` / `normKey` 在别处
 *      本来就有同名函数（`release-scan.mjs` / 别的 CLI / `lib/paths.mjs`）—— 那是**另一个东西**，
 *      不是本票的重复。清单只用于**放行已知的同名物**：清单里的文件消失了**不是**红（那是别人的事）。
 *      清单**以外**的任何一处定义 ⇒ 红（`CG-DEF-NAMESAKE`）—— 这样"再抄一份到别的文件"也会响。
 *   ③ **派生副本不算第二处**：标记块里的正文若与共享件那一块**规范化之后逐字相同**，记成
 *      `derived_inline` 并**点名跳过**（`RC-3` 的同一套作用域规则，B2 已立）；标记块里放**不同**正文
 *      ⇒ 是第二份实现（`CG-DEF-DERIVED-MISMATCH`），不豁免。"打个标记"不是免检章。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { INLINE_BLOCKS, beginOf, markedSpans, normalizeBlock } from './injector-inline.mjs'

/** 8 个**逐字同体**的 helper（本票要抽进共享件的那些）。名字顺序与决定 §①那张表一致。 */
export const SHARED_HELPERS = Object.freeze([
  'assertDeletableTarget',
  'defaultBackupRoot',
  'driveOf',
  'emit',
  'isUnder',
  'normKey',
  'pathVerdict',
  'slugOf',
])

/**
 * 已经**分叉**的同名函数（B3 时 10 个；**B4 起 8 个** —— `parseArgs` / `cliError` 已交给
 * `lib/cli-harness.mjs`，见下）。
 *
 * 🔴 **2026-11-13 的第二刀（构案 0009 · 史山清查 B4）**：`parseArgs` 与 `cliError` 从这张表里**移出**。
 *    它们的两支 CLI 副本（`install.mjs` / `rollback.mjs`）由 B4 的骨架腿判（0 处定义 + 共享件 1 处），
 *    比这里"各 1 处"更严 —— 两张表同时管这两个名字只会互相打脸（B4 落地那一刻这一格会红成假红）。
 *    `main` 留在表里：B4 明确不动 `main`（每个入口本来就不同），"两支各 1 处"仍是它的范围栅栏。
 *    `emit` 从来不在这一族（B3 已把它做成共享件）。
 */
export const FORKED_HELPERS = Object.freeze([
  'allowedDeleteRoots',
  'canonical',
  'insideTestScene',
  'main',
  'refuseDelete',
  'resolveWithin',
  'treeHashOf',
  'walkFiles',
])

/** 那两支 CLI（判据对象）。 */
export const CLI_PAIR_FILES = Object.freeze([
  'presets/agenia/bin/install.mjs',
  'presets/agenia/bin/rollback.mjs',
])

/** 共享件落点（名字与 `INLINE_BLOCKS.guards.sourceRel` 同源）。 */
export const SHARED_GUARDS_REL = INLINE_BLOCKS.guards.sourceRel

/**
 * 同名物允许清单（`名 → 允许出现该定义的**其它**文件`）。
 *
 * 来历：2026-11-13 现量（`tests/**` 之外那一棵树），逐条是"同一个名字、不同的东西"：
 *   · `driveOf` 在 `release-scan.mjs` 里也有一份（扫描器自己的路径判据）；
 *   · `emit` 是每个 CLI 自己的输出信封（6 份，各说各的信封形状）；
 *   · `isUnder` / `normKey` 在 `lib/paths.mjs` 里是**共享路径库**的那一份（与 CLI 的局部副本也不同）；
 * 清单**只放行、不要求**：这几份哪天被删掉 / 改名，不是本票的红（那是它们各自的票）。
 */
export const NAMESAKE_ALLOWLIST = Object.freeze({
  assertDeletableTarget: Object.freeze([]),
  defaultBackupRoot: Object.freeze([]),
  driveOf: Object.freeze(['presets/agenia/bin/release-scan.mjs']),
  emit: Object.freeze([
    'presets/agenia/bin/agenia-brain.mjs',
    'presets/agenia/bin/agenia-local.mjs',
    'presets/agenia/bin/agenia-route.mjs',
    'presets/agenia/bin/bg-notify.mjs',
    'presets/agenia/bin/release-scan.mjs',
  ]),
  isUnder: Object.freeze(['presets/agenia/lib/paths.mjs']),
  normKey: Object.freeze(['presets/agenia/lib/paths.mjs']),
  pathVerdict: Object.freeze([]),
  slugOf: Object.freeze([]),
})

/**
 * 定义形状表（与 `atomic-writers.mjs::DEFINITION_FORMS` 同一条形状口径）。
 * 导出是给 `support/host-adapters.mjs` 复用同一张形状表（腿 ⑥ 的份数口径）—— 别在那边再抄一份。
 */
export const definitionForms = (name) => [
  { kind: 'function', re: new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g') },
  { kind: 'function-assigned', re: new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s+)?function\\b`, 'g') },
  { kind: 'arrow', re: new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s+)?(?:\\([^)\\n]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`, 'g') },
]

const isCommentLine = (line) => /^\s*(\/\/|\*|\/\*)/.test(line)
const lineOf = (text, index) => {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1
  return line
}

/** 递归列出 `root` 下的源码（`*.mjs` / `*.js`；不跟 `node_modules`）。 */
function listSourceFiles(root) {
  const out = []
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of names) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue
        walk(full)
      } else if (e.isFile() && (e.name.endsWith('.mjs') || e.name.endsWith('.js'))) out.push(full)
    }
  }
  walk(root)
  return out
}

/** 这个名字在这份文件里**导出**了没有（行内 `export` 或文件末的 `export { … }`）。 */
function exportedAt(text, name, lineNo) {
  const lines = String(text).split(/\r?\n/)
  if (/^\s*export\s/.test(lines[lineNo - 1] ?? '')) return true
  return new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(text)
}

/**
 * 扫 `presets/**`，把 18 个名字的**定义点**全找出来，按名字分组。
 *
 * `root` 可注入 ⇒ 刀在 scratch 树上跑**同一份**量具（不另写一份）。
 *
 * @param {{root: string}} input
 */
export function scanHelperDefinitions({ root }) {
  const base = path.resolve(root)
  const scanRoot = path.join(base, 'presets')
  const names = [...SHARED_HELPERS, ...FORKED_HELPERS]
  const reading = {
    root: base,
    scan_root: scanRoot,
    scanned_files: 0,
    read_errors: [],
    blocks: {
      guards: { rel: SHARED_GUARDS_REL, label: INLINE_BLOCKS.guards.label, found: false, begin_line: null, end_line: null, digest: null },
    },
    hits: [],
    derived_inline_spans: [],
    mismatch_spans: [],
    names: {},
    line: '',
  }
  // 共享件那一块的规范化正文（"派生副本"的判等基准）。读不到 ⇒ 判不了同源 ⇒ 不豁免（fail-closed）。
  let guardsNorm = null
  const sharedFile = path.join(base, ...SHARED_GUARDS_REL.split('/'))
  if (existsSync(sharedFile)) {
    try {
      const sharedText = readFileSync(sharedFile, 'utf8')
      const span = markedSpans(sharedText, beginOf(INLINE_BLOCKS.guards)).find((s) => s.label === INLINE_BLOCKS.guards.label) ?? null
      if (span !== null) {
        guardsNorm = normalizeBlock(span.text)
        reading.blocks.guards = {
          ...reading.blocks.guards,
          found: true,
          begin_line: span.begin_line,
          end_line: span.end_line,
          digest: guardsNorm === '' ? null : createHash('sha256').update(guardsNorm, 'utf8').digest('hex'),
        }
      }
    } catch (err) {
      reading.read_errors.push({ file: SHARED_GUARDS_REL, code: String(err?.code ?? err?.name ?? 'E_READ') })
    }
  }
  const files = listSourceFiles(scanRoot)
  for (const file of files) {
    let text = null
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      reading.read_errors.push({ file: path.relative(base, file).replace(/\\/g, '/'), code: String(err?.code ?? 'E_READ') })
      continue
    }
    reading.scanned_files += 1
    const rel = path.relative(base, file).replace(/\\/g, '/')
    const lines = text.split(/\r?\n/)
    const spans = markedSpans(text)
    const seenLines = new Set()
    for (const name of names) {
      for (const form of definitionForms(name)) {
        const re = new RegExp(form.re.source, 'g')
        let m
        while ((m = re.exec(text)) !== null) {
          const line = lineOf(text, m.index)
          if (isCommentLine(lines[line - 1] ?? '')) continue
          /**
           * 只数**顶层**定义（定义行从列 0 开始）。嵌在函数体里的同名局部量不是同一件事 ——
           * 现量一例：`presets/agenia/inject.js:2017` 的 `  const driveOf = (p) => …`
           * （`officeLandingVerdict` 内部的局部箭头，和 CLI 那个 `driveOf` 没有关系）。
           * 把"同名"当"同一个东西"会让这一格变成噪声，而噪声判据会被绕过。
           */
          if (/^[ \t]/.test(lines[line - 1] ?? '')) continue
          const key = `${name}#${line}`
          if (seenLines.has(key)) continue
          seenLines.add(key)
          const inside = spans.find((s) => line > s.begin_line && line < s.end_line) ?? null
          let classification = 'primary'
          if (inside !== null) {
            const isOwnGuardsBlock = rel === SHARED_GUARDS_REL && inside.label === INLINE_BLOCKS.guards.label
            if (isOwnGuardsBlock) classification = 'shared_block'
            else if (guardsNorm !== null && normalizeBlock(inside.text) === guardsNorm) classification = 'derived_inline'
            else classification = 'marked_mismatch'
          }
          reading.hits.push({
            name,
            file: rel,
            line,
            kind: form.kind,
            exported: exportedAt(text, name, line),
            classification,
            span: inside === null ? null : { begin_line: inside.begin_line, end_line: inside.end_line, label: inside.label },
          })
        }
      }
    }
  }
  reading.hits.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
  const spanRows = (list) => {
    const bySpan = new Map()
    for (const h of list) {
      if (h.span === null) continue
      const key = `${h.file}#${h.span.begin_line}-${h.span.end_line}`
      if (!bySpan.has(key)) bySpan.set(key, { file: h.file, begin_line: h.span.begin_line, end_line: h.span.end_line, names: [] })
      bySpan.get(key).names.push(h.name)
    }
    return [...bySpan.values()]
  }
  reading.derived_inline_spans = spanRows(reading.hits.filter((h) => h.classification === 'derived_inline'))
  reading.mismatch_spans = spanRows(reading.hits.filter((h) => h.classification === 'marked_mismatch'))
  for (const name of names) {
    const hits = reading.hits.filter((h) => h.name === name)
    const counts = hits.filter((h) => h.classification !== 'derived_inline')
    reading.names[name] = {
      name,
      role: SHARED_HELPERS.includes(name) ? 'shared' : 'forked',
      hits,
      counted: counts.length,
      pair_hits: counts.filter((h) => CLI_PAIR_FILES.includes(h.file)),
      shared_hits: counts.filter((h) => h.file === SHARED_GUARDS_REL && h.classification === 'shared_block'),
      /**
       * "清单之外的一处"。⚠️ **标记块里放改过正文的那一种不算**：它是"第二份实现"，
       * 由 `CG-DEF-DERIVED-MISMATCH` 单独报 —— 同一件事挂两个码会让报文互相打脸。
       */
      other_hits: counts.filter((h) => !CLI_PAIR_FILES.includes(h.file) && h.file !== SHARED_GUARDS_REL && h.classification !== 'marked_mismatch'),
    }
  }
  const where = (list) => list.map((h) => `${h.file}:${h.line}`).join(' · ') || '（没有）'
  reading.line = `presets/** 扫了 ${reading.scanned_files} 份源码；18 个名字的定义点：`
    + SHARED_HELPERS.map((n) => `${n} → ${where(reading.names[n].hits)}`).join(' | ')
    + ` · 共享块 ${reading.blocks.guards.found ? `${SHARED_GUARDS_REL}:${reading.blocks.guards.begin_line}…${reading.blocks.guards.end_line}` : '**没有**'}`
    + (reading.derived_inline_spans.length === 0 ? '' : ` · 派生内联（逐字同源，不算第二处）⇒ ${reading.derived_inline_spans.map((s) => `${s.file}:${s.begin_line}…${s.end_line}`).join(' · ')}`)
  return reading
}

/**
 * 判词。每一格都点名**位置**（`file:line`）—— 红的时候要能直接去改那一行。
 *
 * @param {ReturnType<typeof scanHelperDefinitions>} reading
 * @returns {{verdict:'GREEN'|'RED', problems:Array<{code:string,message:string,detail?:object}>}}
 */
export function helperDefinitionVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  const where = (list) => list.map((h) => `${h.file}:${h.line}`).join(' · ') || '（没有）'
  if (reading.scanned_files === 0) {
    push('CG-DEF-SCAN-EMPTY', `presets/** 一份源码都没扫到（${reading.scan_root}）—— "0 处定义"是真空真，不是绿`)
  }
  for (const e of reading.read_errors) push('CG-DEF-READ', `读不动一份源码（${e.code}）：${e.file}`)
  if (reading.blocks.guards.found !== true) {
    push('CG-DEF-SHARED-MISSING',
      `共享件里没有 \`${beginOf(INLINE_BLOCKS.guards)}\` … \`@inline-end ${INLINE_BLOCKS.guards.label}\` 那一对标记`
      + `（或整份 ${SHARED_GUARDS_REL} 不在）—— "共享件在哪 / 它内联的是哪一段"没有定义；`
      + `8 个 helper 此时应各 0 处合格定义`)
  }
  for (const span of reading.mismatch_spans) {
    push('CG-DEF-DERIVED-MISMATCH',
      `标记块里的正文**不是**共享件那一份（${span.file}:${span.begin_line}…${span.end_line}，含 ${span.names.join(' / ')}）`
      + ` —— 这不是"派生副本"，是第二份实现（打了标记不等于免检）`)
  }
  for (const name of SHARED_HELPERS) {
    const row = reading.names[name]
    if (row === undefined) continue
    if (row.shared_hits.length !== 1) {
      push('CG-DEF-SHARED-COUNT',
        `\`${name}\` 必须**恰好 1 处**定义在 ${SHARED_GUARDS_REL} 的 \`${INLINE_BLOCKS.guards.label}\` 标记块里，`
        + `实得 ${row.shared_hits.length} 处（${where(row.shared_hits)}）；这一份的全部分布：${where(row.hits)}`)
    }
    for (const h of row.pair_hits) {
      push('CG-DEF-PAIR-COPY',
        `\`${name}\` 在 CLI 里还留着自己那一份：${h.file}:${h.line}`
        + ` —— 与共享件 ${SHARED_GUARDS_REL}:${row.shared_hits[0]?.line ?? '?'} 是同一个功能的第二份实现`
        + `（两份各改一边不会有任何判据变红，正是这一票要清掉的病）`)
    }
    for (const h of row.other_hits) {
      const allowed = (NAMESAKE_ALLOWLIST[name] ?? []).includes(h.file)
      if (!allowed) {
        push('CG-DEF-NAMESAKE',
          `\`${name}\` 在清单之外的文件里也有定义：${h.file}:${h.line}`
          + ` —— 已知同名物只在这几个文件里（${(NAMESAKE_ALLOWLIST[name] ?? []).join(' / ') || '（没有）'}）；`
          + `这一处要么是又抄了一份，要么是清单该改（改清单要说明它不是同一个东西）`)
      }
    }
    if (row.shared_hits.length === 1 && row.shared_hits[0].exported !== true) {
      push('CG-DEF-EXPORT', `\`${name}\` 在共享件里没有导出（${SHARED_GUARDS_REL}:${row.shared_hits[0].line}）—— 两支 CLI 要 import 它`)
    }
  }
  for (const name of FORKED_HELPERS) {
    const row = reading.names[name]
    if (row === undefined) continue
    const counts = CLI_PAIR_FILES.map((file) => ({ file, hits: row.hits.filter((h) => h.file === file && h.classification !== 'derived_inline') }))
    const missing = counts.filter((c) => c.hits.length !== 1).map((c) => `${c.file}:${c.hits.length} 处`)
    if (missing.length > 0) {
      push('CG-FORK-COUNT',
        `\`${name}\` 是**已分叉**的 ${FORKED_HELPERS.length} 个之一（不在本票）—— 它在两支 CLI 里必须**各 1 处**，`
        + `实得 ${counts.map((c) => `${c.file}:${c.hits.length}`).join(' · ')}`
        + `（少的：${missing.join(' / ')}）；合并 / 删除它会改掉行为，这一票不许动它`)
    }
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}
