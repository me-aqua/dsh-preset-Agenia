/**
 * 量具：**`writeFileAtomic` 到底有几份、每份强在哪**（构案 0006 · 史山清查 B1）。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-史山清查-B1.md`（口径 / 七类腿 / 刀架（每腿各一把 + 腿 7 两条构造）/ 分母的唯一出处）。
 * 定形：`.team/leader/2026-11-12/定形-B1-原子写归一.md`。决定：`决议/构案/0006-原子写归一.md`。
 *
 * 本文件**只读源码文本**（不写盘、不 import 被测模块）：
 *   · `scanWriteFileAtomicDefinitions` —— `presets/**` 里 `writeFileAtomic` 的定义点（唯一的计数口径）；
 *   · `definitionVerdict` —— 计数 / 落点 / CLI 副本三条判词；
 *   · `retryReading` / `retryVerdict` —— 重试码那一套**只剩一份**吗（并集腿 d 的结构面）；
 *   · `callSiteReading` / `callSiteVerdict` —— install / rollback 读的是共享件、不再读 `{ok,tmp}`；
 *   · `extractFunctionText` / `applyMutations` / `pickMutation` —— **刀**（在 scratch 副本上改一处，看它咬不咬）。
 *
 * 三条口径边界（写在明处，别读成"它什么都能判"）：
 *   ① 定义形状只认三种：`function name(` · `const name = function` · `const name = (…) =>`。
 *      其它形状（对象方法 / 赋值给别的变量 / 字符串拼出来）**一律不算** —— 但
 *      `files_referencing` 会把"提到这个名字却没认出定义"的文件列出来，让读的人自己补（不静默）。
 *   ② 只扫 `presets/**`（定形的验收面就是它）。`tests/**` / `.tools/**` 不在面上 ——
 *      夹具 / 测试里的同名函数不是产品副本。
 *   ③ 注释行不算（与本项目其余静态判据同口径：`//` `*` `/*` 开头）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { BLOCK_BEGIN, BLOCK_END, INJECTOR_REL, blockOf, markedSpans, normalizeBlock } from './injector-inline.mjs'

/** 函数名（唯一）。 */
export const ATOMIC_FN = 'writeFileAtomic'
/** 合并之后**唯一**该留定义的那个文件（相对仓库根，posix）。 */
export const CANONICAL_ATOMIC = 'presets/agenia/lib/atomic.mjs'
/** 这一票要清掉的那两份 CLI 副本（相对仓库根，posix）。 */
export const CLI_COPY_FILES = ['presets/agenia/bin/install.mjs', 'presets/agenia/bin/rollback.mjs']

/** 判据自己的问题码 —— 每个码一句话（测试与入口共用同一份；别在别处再写一遍）。 */
export const ATOMIC_CODES = [
  'ATM-DEF-COUNT',
  'ATM-DEF-LOCATION',
  'ATM-DEF-DERIVED-MISMATCH',
  'ATM-DEF-CLI-COPY',
  'ATM-SCAN-EMPTY',
  'ATM-SCAN-DIR',
  'ATM-SCAN-READ',
  'ATM-SCAN-SHAPE',
  'ATM-RETRY-SET-MISSING',
  'ATM-RETRY-SET-CODES',
  'ATM-RETRY-DUP',
  'ATM-CALLSITE-NO-IMPORT',
  'ATM-CALLSITE-IMPORT-NOT-LIB',
  'ATM-CALLSITE-NO-CALL',
  'ATM-CALLSITE-TMP',
  'ATM-CALLSITE-READ',
]

const isCommentLine = (line) => /^\s*(\/\/|\*|\/\*)/.test(line)

/** 定义形状（三种都认；见文件头口径 ①）。 */
const DEFINITION_FORMS = [
  { kind: 'function', re: new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${ATOMIC_FN}\\s*\\(`) },
  { kind: 'function-assigned', re: new RegExp(`\\b(?:const|let|var)\\s+${ATOMIC_FN}\\s*=\\s*(?:async\\s+)?function\\b`) },
  { kind: 'arrow', re: new RegExp(`\\b(?:const|let|var)\\s+${ATOMIC_FN}\\s*=\\s*(?:async\\s+)?(?:\\([^)\\n]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`) },
]

/** 字符偏移 → 行号（1 起）。 */
function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1
  return line
}

/** 递归列出 `root` 下的源码文件（`*.mjs` / `*.js`；不跟 `node_modules`）。 */
function listSourceFiles(root) {
  const out = []
  const skipped = []
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir).sort()
    } catch (err) {
      skipped.push({ dir, code: err?.code ?? 'UNKNOWN' })
      return
    }
    for (const name of names) {
      const full = path.join(dir, name)
      let st = null
      try {
        st = statSync(full)
      } catch (err) {
        skipped.push({ dir: full, code: err?.code ?? 'UNKNOWN' })
        continue
      }
      if (st.isDirectory()) {
        if (name === 'node_modules') continue
        walk(full)
      } else if (st.isFile() && (name.endsWith('.mjs') || name.endsWith('.js'))) {
        out.push(full)
      }
    }
  }
  walk(root)
  return { files: out, skipped }
}

/**
 * 扫 `presets/**`，把所有 `writeFileAtomic` **定义点**找出来。
 *
 * 返回的 `line` 是给人读的一句（份数 + 每个落点），`hits` 是机器可读的那一份 ——
 * 判词只从 `hits` 来，`line` 只是投影（两处同源，不许各算一遍）。
 *
 * @param {{root: string}} input
 */
export function scanWriteFileAtomicDefinitions({ root }) {
  const base = path.resolve(root)
  const presets = path.join(base, 'presets')
  const canonicalDir = path.join(base, ...CANONICAL_ATOMIC.split('/').slice(0, -1))
  const reading = {
    root: base,
    scan_root: presets,
    scanned_files: 0,
    read_errors: [],
    skipped_dirs: [],
    hits: [],
    files_referencing: [],
    canonical_dir_present: false,
    note: `只扫 presets/** 的 *.mjs / *.js；定义形状只认 ${DEFINITION_FORMS.map((f) => f.kind).join(' / ')}`,
    line: '',
  }
  try {
    reading.canonical_dir_present = statSync(canonicalDir).isDirectory()
  } catch {
    reading.canonical_dir_present = false
  }
  const listed = listSourceFiles(presets)
  reading.skipped_dirs = listed.skipped
  // 共享正文的规范化文本（"派生副本"的判等基准）。读不到 ⇒ 判不了"同源" ⇒ 不豁免（fail-closed）。
  let sharedNorm = null
  reading.shared_block_found = false
  reading.marker_literals = { begin: BLOCK_BEGIN, end: BLOCK_END }
  try {
    const sharedBlock = blockOf(readFileSync(path.join(base, ...CANONICAL_ATOMIC.split('/')), 'utf8'))
    reading.shared_block = sharedBlock.found ? { begin_line: sharedBlock.begin_line, end_line: sharedBlock.end_line, lines: sharedBlock.text === '' ? 0 : sharedBlock.text.split('\n').length } : null
    reading.shared_block_found = sharedBlock.found
    if (sharedBlock.found) sharedNorm = normalizeBlock(sharedBlock.text)
  } catch {
    reading.shared_block = null
  }
  for (const file of listed.files) {
    let text = null
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      reading.read_errors.push({ file, code: err?.code ?? 'UNKNOWN' })
      continue
    }
    reading.scanned_files += 1
    const rel = path.relative(base, file).replace(/\\/g, '/')
    const lines = text.split(/\r?\n/)
    const spans = markedSpans(text)
    /** 只豁免**腿 10 读的那一段**：注入器的第一段，且正文与共享件逐字相同。 */
    const derivedSpan = rel === INJECTOR_REL ? spans[0] ?? null : null
    const derivedMatches = derivedSpan !== null && sharedNorm !== null && normalizeBlock(derivedSpan.text) === sharedNorm
    const hitLines = new Set()
    for (const form of DEFINITION_FORMS) {
      const re = new RegExp(form.re.source, 'g')
      let m
      while ((m = re.exec(text)) !== null) {
        const line = lineOf(text, m.index)
        if (isCommentLine(lines[line - 1] ?? '')) continue
        if (hitLines.has(line)) continue
        hitLines.add(line)
        const inside = spans.find((s) => line > s.begin_line && line < s.end_line) ?? null
        let classification = 'primary'
        if (inside !== null) {
          if (inside === derivedSpan) classification = derivedMatches ? 'derived_inline' : 'derived_inline_mismatch'
          else classification = 'marked_outside_derived_span'
        }
        reading.hits.push({
          file: rel,
          abs: file,
          line,
          kind: form.kind,
          exported: /export\s+(?:async\s+)?function\s+writeFileAtomic\b|\bexport\s*\{[^}]*\bwriteFileAtomic\b/.test(
            lines.slice(Math.max(0, line - 1), line).join('\n'),
          ) || /export\s+(?:async\s+)?function|export\s*\{/.test(lines[line - 1] ?? ''),
          classification,
          span: inside === null ? null : { begin_line: inside.begin_line, end_line: inside.end_line },
        })
      }
    }
    // 提到这个名字、却没认出定义 ⇒ 记下来（读数，不判红 —— 可能是 import / 调用 / 注释）
    if (!hitLines.size && new RegExp(`\\b${ATOMIC_FN}\\b`).test(text)) {
      reading.files_referencing.push({
        file: rel,
        lines: lines.map((l, i) => (new RegExp(`\\b${ATOMIC_FN}\\b`).test(l) && !isCommentLine(l) ? i + 1 : null)).filter((x) => x !== null),
      })
    }
  }
  reading.hits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
  const spanRows = (list) => {
    const bySpan = new Map()
    for (const h of list) {
      if (h.span === null) continue
      const key = `${h.file}#${h.span.begin_line}-${h.span.end_line}`
      if (!bySpan.has(key)) bySpan.set(key, { file: h.file, begin_line: h.span.begin_line, end_line: h.span.end_line, definitions: [] })
      bySpan.get(key).definitions.push(h.line)
    }
    return [...bySpan.values()]
  }
  // 只有 `derived_inline`（注入器第一段 + 逐字同源）不是实现；**标记里放了不同正文**仍是第二份实现
  // —— 否则"打个标记"就成了免检章（契约 §0.7 的刀 b：`count = 2` + `ATM-DEF-DERIVED-MISMATCH`）。
  reading.primary_hits = reading.hits.filter((h) => h.classification !== 'derived_inline')
  reading.derived_inline_spans = spanRows(reading.hits.filter((h) => h.classification === 'derived_inline'))
  reading.derived_inline_mismatch_spans = spanRows(reading.hits.filter((h) => h.classification === 'derived_inline_mismatch'))
  reading.raw_count = reading.hits.length
  reading.count = reading.primary_hits.length
  const defsLine = reading.primary_hits.map((h) => `${h.file}:${h.line}（${h.kind}${h.exported ? ' · exported' : ''}）`).join(' · ')
  const derivedLine = reading.derived_inline_spans.map((s) => `${s.file}:${s.begin_line}…${s.end_line}`).join(' · ')
  reading.line = `presets/** 扫了 ${reading.scanned_files} 份源码：**${reading.count} 处** ${ATOMIC_FN} 定义`
    + ` ⇒ ${defsLine || '（没有）'}`
    + (derivedLine === '' ? '' : ` · 派生内联（逐字同源，不算第二份实现）⇒ ${derivedLine}`)
  return reading
}

/**
 * 定义腿的判词。
 *
 * @param {ReturnType<typeof scanWriteFileAtomicDefinitions>} reading
 * @returns {{verdict:'GREEN'|'RED', problems:Array<{code:string,message:string,detail?:object}>}}
 */
export function definitionVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  if (reading.scanned_files === 0) {
    push('ATM-SCAN-EMPTY', `presets/** 一份源码都没扫到（${reading.scan_root}）—— "0 处定义"是真空真，不是绿`)
  }
  if (reading.canonical_dir_present !== true) {
    push('ATM-SCAN-DIR', `共享件所在目录不在：${CANONICAL_ATOMIC} 的父目录 —— 扫描面本身不成立`)
  }
  for (const e of reading.read_errors) push('ATM-SCAN-READ', `读不动一份源码（${e.code}）：${e.file}`)
  if (reading.count !== 1) {
    const named = reading.primary_hits.map((h) => `${h.file}:${h.line}`).join(' · ') || '（没有）'
    const skipped = reading.derived_inline_spans.map((s) => `${s.file}:${s.begin_line}…${s.end_line}`).join(' · ')
    push('ATM-DEF-COUNT', `\`${ATOMIC_FN}\` 必须**恰好 1 处**实现（源 + 逐字同源的派生内联不算第二处），实得 ${reading.count} 处：${named}`
      + (skipped === '' ? '' : `；已按"派生内联"跳过 ${skipped}`))
  }
  if (reading.derived_inline_mismatch_spans !== undefined && reading.derived_inline_mismatch_spans.length > 0) {
    push('ATM-DEF-DERIVED-MISMATCH', `标记块里的正文**不是**共享件那一份（${reading.derived_inline_mismatch_spans.map((s) => `${s.file}:${s.begin_line}…${s.end_line}`).join(' · ')}）—— 这不是"派生副本"，是第二份实现`)
  }
  if (reading.count === 1 && reading.primary_hits[0].file !== CANONICAL_ATOMIC) {
    push('ATM-DEF-LOCATION', `唯一那处定义不在共享件里：${reading.primary_hits[0].file}:${reading.primary_hits[0].line}（要 ${CANONICAL_ATOMIC}）`)
  }
  const cliHits = reading.primary_hits.filter((h) => CLI_COPY_FILES.includes(h.file))
  for (const h of cliHits) {
    push('ATM-DEF-CLI-COPY', `CLI 里还留着自己的那份 \`${ATOMIC_FN}\`：${h.file}:${h.line} —— 与共享件 ${CANONICAL_ATOMIC} 是同一功能的第二份实现（并集之后必须删掉）`)
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

/** 三个重试码（并集腿 d 的成员面）。 */
export const RETRY_CODE_MEMBERS = ['EPERM', 'EBUSY', 'EACCES']

/**
 * 重试码那一套的**结构读数**：`RETRYABLE_RENAME` 还在不在、成员齐不齐、有没有第二份内联数组。
 *
 * 判据是"**只剩一份**"，不是"两份都写了"：
 *   · 共享件的 `RETRYABLE_RENAME` 是唯一那份（合并之后不许再有内联的 `['EPERM','EBUSY','EACCES']`）；
 *   · 声明之外的内联数组字面量里出现 ≥2 个重试码 ⇒ 第二份（`ATM-RETRY-DUP`）。
 *
 * ⚠️ 2026-11-12 现量：**两套码集的成员完全相同**（共享件 `new Set(['EPERM','EBUSY','EACCES'])`，
 *    CLI 内联 `['EPERM','EBUSY','EACCES']`）⇒ "并集"在成员上是个恒等操作，"取并集"这句话
 *    今天只能靠**结构上只剩一份**来判（行为面由三条码各重试一次来判）。读数里 `union_is_identity`
 *    就是这个事实，别把它读成"并集做过了"。
 *
 * @param {{file: string}} input
 */
export function retryReading({ file }) {
  const abs = path.resolve(file)
  const reading = {
    file: abs,
    rel: null,
    exists: false,
    set_declared: false,
    set_members: [],
    set_line: null,
    inline_literals: [],
    predicate_lines: [],
    covers_all_three: false,
    line: '',
  }
  let text = null
  try {
    text = readFileSync(abs, 'utf8')
    reading.exists = true
  } catch (err) {
    reading.line = `读不动：${abs}（${err?.code ?? 'UNKNOWN'}）`
    return reading
  }
  reading.rel = abs
  const lines = text.split(/\r?\n/)
  const declRe = /\bconst\s+RETRYABLE_RENAME\s*=\s*(new\s+Set\s*\(\s*\[[^\]]*\]\s*\)|\[[^\]]*\])/
  const decl = declRe.exec(text)
  const declLines = new Set()
  if (decl !== null) {
    reading.set_declared = true
    reading.set_line = lineOf(text, decl.index)
    const startLine = reading.set_line
    const endLine = lineOf(text, decl.index + decl[0].length)
    for (let l = startLine; l <= endLine; l += 1) declLines.add(l)
    const codes = []
    const codeRe = /['"]([A-Z][A-Z0-9_]*)['"]/g
    let m
    while ((m = codeRe.exec(decl[1])) !== null) codes.push(m[1])
    reading.set_members = [...new Set(codes)].sort()
    reading.covers_all_three = RETRY_CODE_MEMBERS.every((c) => reading.set_members.includes(c))
  }
  // 声明之外的内联数组：含 ≥2 个重试码 ⇒ 第二份码集
  const arrayRe = /\[([^\[\]\n]*)\]/g
  let am
  while ((am = arrayRe.exec(text)) !== null) {
    const line = lineOf(text, am.index)
    if (isCommentLine(lines[line - 1] ?? '')) continue
    if (declLines.has(line)) continue
    const codes = RETRY_CODE_MEMBERS.filter((c) => new RegExp(`['"]${c}['"]`).test(am[1]))
    if (codes.length >= 2) reading.inline_literals.push({ line, codes, text: am[0].trim().slice(0, 120) })
  }
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i]
    if (isCommentLine(l)) continue
    if (/RETRYABLE_RENAME\s*\.\s*(has|includes)\s*\(/.test(l) || /\.includes\s*\(\s*err\??\.code\s*\)/.test(l)) {
      reading.predicate_lines.push({ line: i + 1, text: l.trim().slice(0, 160) })
    }
  }
  const members = reading.set_members.join(' · ') || '（没有）'
  const dup = reading.inline_literals.map((x) => `:${x.line} [${x.codes.join(',')}]`).join(' ')
  reading.line = `${reading.rel}：RETRYABLE_RENAME ${reading.set_declared ? `在 :${reading.set_line}（${members}）` : '**不在**'}`
    + ` · 声明外的重试码数组 ${reading.inline_literals.length} 处${dup === '' ? '' : ` ⇒ ${dup}`}`
    + ` · 判定行 ${reading.predicate_lines.map((p) => `:${p.line}`).join(' ') || '（没有）'}`
    + ` · 三个码齐不齐：${reading.covers_all_three ? '齐' : '缺'}`
  return reading
}

/** 重试码结构面的判词。 */
export function retryVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  if (!reading.exists) {
    push('ATM-SCAN-READ', `读不动重试码那一份：${reading.file}`)
    return { verdict: 'RED', problems }
  }
  if (!reading.set_declared) {
    push('ATM-RETRY-SET-MISSING', `${reading.rel} 里没有 \`RETRYABLE_RENAME\` 的声明 —— 共享件那一份名字没活下来（合并之后重试码只剩一份，名字是那一份）`)
  }
  const missing = RETRY_CODE_MEMBERS.filter((c) => !reading.set_members.includes(c))
  if (reading.set_declared && missing.length > 0) {
    push('ATM-RETRY-SET-CODES', `\`RETRYABLE_RENAME\` 少了这些码：${missing.join(' · ')}（实得 ${reading.set_members.join(' · ') || '（空）'}）`)
  }
  if (reading.inline_literals.length > 0) {
    push('ATM-RETRY-DUP', `声明之外还有 ${reading.inline_literals.length} 处内联重试码数组（第二份码集）：`
      + reading.inline_literals.map((x) => `:${x.line} [${x.codes.join(',')}]`).join(' · ')
      + ' —— 合并之后只许有一份（`RETRYABLE_RENAME`）')
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

/** 把 import 子句里的说明符抠出来（静态 `from '…'` 与动态 `import('…')` 两种形状）。 */
function moduleSpecifiers(text) {
  const out = []
  const staticRe = /\bfrom\s*['"]([^'"]+)['"]/g
  let m
  while ((m = staticRe.exec(text)) !== null) out.push({ kind: 'static', specifier: m[1], index: m.index })
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dynamicRe.exec(text)) !== null) out.push({ kind: 'dynamic', specifier: m[1], index: m.index })
  return out
}

/**
 * 调用点读数：这个 CLI 文件是不是**读共享件**（import + 调用），还有没有人在读 `{ok,tmp}`。
 *
 * @param {{file: string, canonicalFile: string}} input
 */
export function callSiteReading({ file, canonicalFile = CANONICAL_ATOMIC }) {
  const abs = path.resolve(file)
  const reading = {
    file: abs,
    rel: null,
    exists: false,
    defines: 0,
    calls: 0,
    import_specifier: null,
    import_kind: null,
    import_resolves_to: null,
    tmp_reads: [],
    line: '',
  }
  let text = null
  try {
    text = readFileSync(abs, 'utf8')
    reading.exists = true
  } catch (err) {
    reading.line = `读不动：${abs}（${err?.code ?? 'UNKNOWN'}）`
    return reading
  }
  // 仓库根：从这条路径往上找 `presets` 那一层 —— 找得到就用它，找不到就按"调用方给的 canonical 文件"推
  const canonicalAbs = path.resolve(canonicalFile)
  let root = null
  let probe = abs
  for (let i = 0; i < 8; i += 1) {
    const parent = path.dirname(probe)
    if (path.basename(parent) === 'presets') {
      root = path.dirname(parent)
      break
    }
    probe = parent
  }
  if (root === null) root = canonicalAbs.slice(0, canonicalAbs.length - canonicalFile.length)
  reading.rel = path.relative(root, abs).replace(/\\/g, '/')
  const lines = text.split(/\r?\n/)
  // 定义（本文件里还有没有一份）
  for (const form of DEFINITION_FORMS) {
    const re = new RegExp(form.re.source, 'g')
    while (re.exec(text) !== null) {
      const line = lineOf(text, re.lastIndex - 1)
      if (!isCommentLine(lines[line - 1] ?? '')) reading.defines += 1
    }
  }
  // 调用
  const callRe = new RegExp(`\\b${ATOMIC_FN}\\s*\\(`, 'g')
  let cm
  while ((cm = callRe.exec(text)) !== null) {
    const before = text.slice(Math.max(0, cm.index - 40), cm.index)
    if (/function\s*$/.test(before)) continue
    const line = lineOf(text, cm.index)
    if (isCommentLine(lines[line - 1] ?? '')) continue
    reading.calls += 1
  }
  // import：先找**带这个名字**的那条 import 子句
  const namedImportRe = new RegExp(`import\\s*\\{[^}]*\\b${ATOMIC_FN}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`)
  const named = namedImportRe.exec(text)
  const dynamicNamedRe = new RegExp(`(?:const|let|var)\\s+\\{[^}]*\\b${ATOMIC_FN}\\b[^}]*\\}\\s*=\\s*await\\s+import\\s*\\(\\s*['"]([^'"]+)['"]`)
  const dynamicNamed = dynamicNamedRe.exec(text)
  if (named !== null) {
    reading.import_specifier = named[1]
    reading.import_kind = 'static-named'
  } else if (dynamicNamed !== null) {
    reading.import_specifier = dynamicNamed[1]
    reading.import_kind = 'dynamic-named'
  } else {
    // 兜底：这个文件 import 了哪些模块（读数用；判词只在上面两条命中时才认）
    reading.specifiers = moduleSpecifiers(text).map((s) => s.specifier)
  }
  if (reading.import_specifier !== null) {
    reading.import_resolves_to = reading.import_kind === 'static-named' || reading.import_kind === 'dynamic-named'
      ? path.resolve(path.dirname(abs), reading.import_specifier).replace(/\\/g, '/')
      : null
  }
  // `{ok,tmp}` 的读端：结果对象上的 `.tmp` 属性读
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i]
    if (isCommentLine(l)) continue
    if (/\b[A-Za-z_$][\w$]*\s*\.\s*tmp\b/.test(l)) reading.tmp_reads.push({ line: i + 1, text: l.trim().slice(0, 160) })
  }
  reading.line = `${reading.rel}：定义 ${reading.defines} 处 · 调用 ${reading.calls} 处`
    + ` · import ${reading.import_specifier === null ? '**没有**' : `${reading.import_specifier}（${reading.import_kind}）→ ${reading.import_resolves_to}`}`
    + ` · .tmp 读端 ${reading.tmp_reads.length} 处`
  return reading
}

/** 调用点判词：读共享件 + 有调用 + 不再读 `.tmp`。 */
export function callSiteVerdict(reading, { canonicalAbs } = {}) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  if (!reading.exists) {
    push('ATM-CALLSITE-READ', `读不动调用点：${reading.file}`)
    return { verdict: 'RED', problems }
  }
  const want = canonicalAbs === undefined ? null : path.resolve(canonicalAbs).replace(/\\/g, '/')
  if (reading.import_specifier === null) {
    push('ATM-CALLSITE-NO-IMPORT', `${reading.rel} 没有从共享件 import \`${ATOMIC_FN}\`（它还是自己那份实现？定义 ${reading.defines} 处）`)
  } else if (want !== null && reading.import_resolves_to !== want) {
    push('ATM-CALLSITE-IMPORT-NOT-LIB', `${reading.rel} 的 import 指到别处：${reading.import_specifier} → ${reading.import_resolves_to}（要 ${want}）`)
  }
  if (reading.calls === 0) {
    push('ATM-CALLSITE-NO-CALL', `${reading.rel} 里没有 \`${ATOMIC_FN}(\` 的调用 —— "读共享件"得有人真调它`)
  }
  if (reading.tmp_reads.length > 0) {
    push('ATM-CALLSITE-TMP', `${reading.rel} 还在读结果对象的 \`.tmp\`（${reading.tmp_reads.map((x) => `:${x.line}`).join(' ')}）—— 统一信封之后没有这个字段`)
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

/** 跳过一个字符串字面量（'…' / "…" / `…`，含 `${}` 里的嵌套与转义），返回收尾后的下标。 */
function skipString(text, i) {
  const q = text[i]
  let j = i + 1
  while (j < text.length) {
    const c = text[j]
    if (c === '\\') {
      j += 2
      continue
    }
    if (q === '`' && c === '$' && text[j + 1] === '{') {
      j = skipBraced(text, j + 1)
      continue
    }
    if (c === q) return j + 1
    j += 1
  }
  return j
}

/** 从 `{` 起跳过一整段花括号（字符串 / 注释 / 模板里的 `${}` 都算在里面），返回收尾后的下标。 */
function skipBraced(text, i) {
  let depth = 0
  let j = i
  while (j < text.length) {
    const c = text[j]
    if (c === '/' && text[j + 1] === '/') {
      const nl = text.indexOf('\n', j)
      j = nl < 0 ? text.length : nl + 1
      continue
    }
    if (c === '/' && text[j + 1] === '*') {
      const end = text.indexOf('*/', j + 2)
      j = end < 0 ? text.length : end + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      j = skipString(text, j)
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return j + 1
    }
    j += 1
  }
  return j
}

/**
 * 从源码里**整段抠出**一个 `function` 定义（含前面的 `export`）—— 刀用。
 *
 * 为什么要它：定义腿的刀是"把共享件那一段逐字复制到 CLI 里"，不是另编一份差不多的；
 * 判据与刀因此用的是同一段正文。
 *
 * @returns {null|{text:string, start:number, end:number, line:number}}
 */
export function extractFunctionText(text, name = ATOMIC_FN) {
  const re = new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`)
  const m = re.exec(text)
  if (m === null) return null
  let i = m.index + m[0].length - 1
  // 参数表：括号配对（跳过字符串）
  let depth = 0
  for (; i < text.length; i += 1) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(text, i) - 1
      continue
    }
    if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) {
        i += 1
        break
      }
    }
  }
  while (i < text.length && /\s/.test(text[i])) i += 1
  if (text[i] !== '{') return null
  const end = skipBraced(text, i)
  return { text: text.slice(m.index, end), start: m.index, end, line: lineOf(text, m.index) }
}

/**
 * 在源码上做一串**逐处**替换；每处都声明"期望命中几次"。
 * 命中数对不上 ⇒ 这一处 `ok:false`（**刀不咬就说出来**，不许当成"改过了"）。
 *
 * @param {string} source
 * @param {Array<{id:string, find:string, replace:string, expect?:number, all?:boolean}>} mutations
 */
export function applyMutations(source, mutations) {
  let out = source
  const applied = []
  for (const m of mutations) {
    const count = out.split(m.find).length - 1
    const want = m.expect ?? 1
    if (count === 0) {
      applied.push({ id: m.id, ok: false, count, want, reason: 'anchor-missing' })
      continue
    }
    if (count !== want) {
      applied.push({ id: m.id, ok: false, count, want, reason: 'anchor-count' })
      continue
    }
    out = m.all === true ? out.split(m.find).join(m.replace) : out.replace(m.find, m.replace)
    applied.push({ id: m.id, ok: true, count, want })
  }
  return { text: out, applied, ok: applied.every((a) => a.ok) }
}

/**
 * 一组候选替换里挑**第一处能命中**的那个（用于"实现可能换个写法"的刀）。
 * 一处都命中不了 ⇒ `null`（调用方据此记 `ATM-KNIFE-ANCHOR`，不许静默跳过）。
 */
export function pickMutation(source, candidates) {
  for (const cand of candidates) {
    const count = source.split(cand.find).length - 1
    if (count === (cand.expect ?? 1)) return { ...cand, count }
  }
  return null
}
