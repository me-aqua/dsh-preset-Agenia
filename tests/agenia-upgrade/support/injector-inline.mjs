/**
 * `ATM-01` 腿 10 的量具 —— **注入器里的原子写与共享件同源**（构案 0007 · 史山清查 B2 · Gate 2）。
 *
 * 契约：`.team/test/2026-11-13/CONTRACT-史山清查-B2.md` §2。
 *
 * 病：`inject.js` 是**注入器**（宿主加载、ESM 缓存），它不一定能静态 import `lib/atomic.mjs`；
 * 若 Gate 3 把共享正文**内联**进去，就会出现第二份正文 —— 两份各自被改，谁也看不见。
 * 这条腿钉的是"同源"，**锚内容不锚行号**：
 *   · 共享正文 = `lib/atomic.mjs` 里 `@inline-begin` … `@inline-end` 那一对标记之间；
 *   · 注入器合法形态**只有两种**：① 静态 import（解析后 = `lib/atomic.mjs`）；② 一对**同名标记**
 *     之间放**同一段正文**（规范化之后逐字相同：去标记行 / 去 `export ` / 去公共缩进 / 去行尾空白）；
 *   · 两种形态都要求：正文里那组**指纹**（`writeSync(handle` / `fsyncSync` / `wx` …）在、
 *     两个写盘点**真的调用**它（`writeFileAtomic(` ≥ 2 处，定义那一行不算），
 *     且内联块前面注明了来源（`lib/atomic.mjs`）与版本（版本号或提交号）。
 *   · **编辑任意一侧**（共享件或内联副本）而没有同步另一侧 ⇒ 两边正文不再相同 ⇒ 红。
 *
 * ⚠️ 这一份是**纯文本判据**：不跑注入器、不依赖客户端重启。`inject.js` 改动要重启客户端才生效，
 * 但这条读数只读源码字节，与"跑没跑起来"无关（契约 §2.3 写明了这条边界）。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

/** 两个对象的相对仓库根路径（posix）。 */
export const SHARED_REL = 'presets/agenia/lib/atomic.mjs'
export const INJECTOR_REL = 'presets/agenia/inject.js'
/** 正文标记（与 `lib/atomic.mjs` 里那一对逐字相同；内联副本必须用同名标记）。 */
export const BLOCK_BEGIN = '@inline-begin 原子写并集正文'
export const BLOCK_END = '@inline-end 原子写并集正文'
/** 正文指纹（内容锚；每一项都要**两边同值**）。 */
export const INLINE_FINGERPRINTS = Object.freeze([
  'writeSync(handle',
  'fsyncSync(handle)',
  "openSync(tmp, 'wx')",
  'const tmp = `${target}.tmp-${pid}-${rand}`',
  'RETRYABLE_RENAME',
  'maxAttempts = 5',
  'CLI_WRITE_MAX_ATTEMPTS = 6',
  'cleanup_refused',
])

const stripComment = (text) => String(text).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
const countOf = (text, needle) => String(text).split(needle).length - 1

/**
 * 一份源码里**所有**标记跨度（`@inline-begin` … `@inline-end`；行号 1 起，`text` 不含标记行）。
 *
 * 为什么要有"全部"这一份：腿 10 只认**第一段**（注入器那一份正文），而腿 0 的
 * "派生副本不算第二份实现"要按**第一段**判（别处的标记块 / 第二段都不豁免）。
 * 标记字面量只有这一处（`BLOCK_BEGIN` / `BLOCK_END`）—— 两条腿都从这里读，不各写一份。
 *
 * @param {string} source
 * @returns {Array<{begin_line:number, end_line:number, text:string}>}
 */
export function markedSpans(source) {
  const lines = String(source).split(/\r?\n/)
  const spans = []
  let begin = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (begin < 0) {
      if (lines[i].includes(BLOCK_BEGIN)) begin = i
      continue
    }
    if (lines[i].includes(BLOCK_END)) {
      spans.push({ begin_line: begin + 1, end_line: i + 1, text: lines.slice(begin + 1, i).join('\n') })
      begin = -1
    }
  }
  return spans
}

/**
 * 从一份源码里切出**第一段**标记之间的正文（**含**标记行也算读数，调用方自己决定用不用）。
 * @returns {{found:boolean, begin_line:number|null, end_line:number|null, text:string, marker_lines:number[]}}
 */
export function blockOf(source) {
  const first = markedSpans(source)[0]
  if (first === undefined) return { found: false, begin_line: null, end_line: null, text: '', marker_lines: [] }
  return { found: true, begin_line: first.begin_line, end_line: first.end_line, text: first.text, marker_lines: [first.begin_line, first.end_line] }
}

/**
 * 正文规范化（"同一段正文"的判法；**只做这四步**，不做语法分析）：
 *   ① 去标记行（调用方传的正文本来就不含标记，这里再挡一次）；
 *   ② 每行去 `export `（共享件里是 `export function`，内联副本不需要导出）；
 *   ③ 去公共缩进（内联块可能整体缩进过）；
 *   ④ 去行尾空白；保留空行（空行也是正文的一部分）。
 */
export function normalizeBlock(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => !l.includes(BLOCK_BEGIN) && !l.includes(BLOCK_END))
  const stripped = lines.map((l) => l.replace(/^(\s*)export\s+/, '$1').replace(/\s+$/, ''))
  const indents = stripped.filter((l) => l.trim() !== '').map((l) => (/^\s*/.exec(l) ?? [''])[0].length)
  const common = indents.length === 0 ? 0 : Math.min(...indents)
  return stripped.map((l) => (l.trim() === '' ? '' : l.slice(common))).join('\n').trim()
}

/** 规范化正文的摘要（读数用；判等用字符串比，摘要只进 `result.json`）。 */
export function blockDigest(text) {
  return createHash('sha256').update(normalizeBlock(text), 'utf8').digest('hex')
}

/** 每个指纹在两边各出现几次（**两边必须同值**）。 */
export function fingerprintCounts(sharedText, injectorText) {
  const out = {}
  for (const needle of INLINE_FINGERPRINTS) out[needle] = { shared: countOf(sharedText, needle), injector: countOf(injectorText, needle) }
  return out
}

/** 静态 import 那一支：注入器里有没有一条 import，解析后指向共享件（相对 `inject.js` 所在目录）。 */
export function staticImportOf(source, { injectorRel = INJECTOR_REL, sharedRel = SHARED_REL } = {}) {
  const hits = []
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(String(source))) !== null) {
    const names = m[1].split(',').map((s) => s.trim())
    if (!names.some((n) => n.split(/\s+as\s+/)[0].trim() === 'writeFileAtomic')) continue
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(injectorRel), m[2]))
    hits.push({ spec: m[2], resolved, is_shared: resolved === sharedRel })
  }
  return hits
}

/**
 * 判一条"注入器与共享件同源"的读数。**纯函数**（刀直接喂合成的两段源码）。
 *
 * @param {{sharedSource:string, injectorSource:string}} input
 * @returns {{mode:'static-import'|'inline-block'|'none', problems:Array<{code:string,message:string}>, readings:object}}
 */
export function inlineSourceProblems({ sharedSource, injectorSource }) {
  const problems = []
  const sharedBlock = blockOf(sharedSource)
  const readings = {
    shared_block: { found: sharedBlock.found, begin_line: sharedBlock.begin_line, end_line: sharedBlock.end_line, lines: sharedBlock.text === '' ? 0 : sharedBlock.text.split('\n').length },
    injector_block: null,
    mode: 'none',
    fingerprints: {},
    calls: 0,
    static_imports: [],
    source_note: null,
    version_note: null,
  }
  if (!sharedBlock.found) {
    problems.push({ code: 'ATM01-INJECT-SHARED-BLOCK-MISSING', message: `共享件里没有 \`${BLOCK_BEGIN}\` … \`${BLOCK_END}\` 这一对标记 —— "内联的是哪一段"没有定义` })
    return { mode: 'none', problems, readings }
  }
  const sharedNorm = normalizeBlock(sharedBlock.text)
  const injectorBlock = blockOf(injectorSource)
  const imports = staticImportOf(injectorSource)
  readings.static_imports = imports
  /** 真正调用的次数（定义那一行不算；注释行不算）。 */
  const code = stripComment(injectorSource).join('\n')
  const calls = countOf(code, 'writeFileAtomic(') - countOf(code, 'function writeFileAtomic(') - countOf(code, 'const writeFileAtomic =')
  readings.calls = calls

  if (imports.some((h) => h.is_shared)) {
    readings.mode = 'static-import'
    if (calls < 2) {
      problems.push({ code: 'ATM01-INJECT-NO-CALLS', message: `注入器已经 import 共享件，但 \`writeFileAtomic(\` 只出现 ${calls} 次（两个写盘点都要真调它）—— 内联/共享件成了摆设` })
    }
    return { mode: 'static-import', problems, readings }
  }
  if (imports.length > 0) {
    problems.push({ code: 'ATM01-INJECT-STATIC-IMPORT-NOT-LIB', message: `注入器 import 了 \`writeFileAtomic\`，但解析后不是共享件：${JSON.stringify(imports.map((h) => ({ spec: h.spec, resolved: h.resolved })))}` })
  }
  if (!injectorBlock.found) {
    readings.mode = 'none'
    problems.push({
      code: 'ATM01-INJECT-NO-SHARED-WRITER',
      message: `注入器既没有从 ${SHARED_REL} 静态 import \`writeFileAtomic\`，也没有 \`${BLOCK_BEGIN}\` … \`${BLOCK_END}\` 内联块 —— 它的写盘还是自己那一份（Gate 3 要把它改成共享件或内联同一段正文）`,
    })
    return { mode: 'none', problems, readings }
  }
  readings.mode = 'inline-block'
  const injectorNorm = normalizeBlock(injectorBlock.text)
  readings.injector_block = {
    begin_line: injectorBlock.begin_line,
    end_line: injectorBlock.end_line,
    lines: injectorBlock.text === '' ? 0 : injectorBlock.text.split('\n').length,
    digest: blockDigest(injectorBlock.text),
    shared_digest: blockDigest(sharedBlock.text),
  }
  // 来源 / 版本注明（在 begin 标记上面那几行里找）
  const injectorLines = String(injectorSource).split(/\r?\n/)
  const before = injectorLines.slice(Math.max(0, injectorBlock.begin_line - 9), injectorBlock.begin_line - 1).join('\n')
  readings.source_note = /lib\/atomic\.mjs/.test(before) ? before.split(/\r?\n/).find((l) => l.includes('lib/atomic.mjs'))?.trim() ?? null : null
  readings.version_note = /\bv?\d+\.\d+(?:\.\d+)*\b|\b[0-9a-f]{7,40}\b/i.test(before)
    ? before.split(/\r?\n/).find((l) => /\bv?\d+\.\d+(?:\.\d+)*\b|\b[0-9a-f]{7,40}\b/i.test(l))?.trim() ?? null
    : null
  if (readings.source_note === null) {
    problems.push({ code: 'ATM01-INJECT-SOURCE-NOTE', message: `内联块前面没有注明来源（那 8 行里没有 \`lib/atomic.mjs\`）—— 读的人会以为它就是本文件自己的实现` })
  }
  if (readings.version_note === null) {
    problems.push({ code: 'ATM01-INJECT-SOURCE-NOTE', message: '内联块前面没有注明版本（版本号或提交号）—— 两份正文哪天分叉，谁也说不清是哪一版' })
  }
  if (injectorNorm !== sharedNorm) {
    problems.push({
      code: 'ATM01-INJECT-INLINE-DRIFT',
      message: `内联块与共享正文**不再逐字相同**（共享 ${readings.shared_block.lines} 行 / 内联 ${readings.injector_block.lines} 行；摘要 ${readings.injector_block.shared_digest.slice(0, 12)} → ${readings.injector_block.digest.slice(0, 12)}）—— 改了一边没改另一边`,
    })
  }
  readings.fingerprints = fingerprintCounts(sharedNorm, injectorNorm)
  for (const [needle, counts] of Object.entries(readings.fingerprints)) {
    if (counts.shared !== counts.injector || counts.shared === 0) {
      problems.push({
        code: 'ATM01-INJECT-FINGERPRINT',
        message: `正文指纹 \`${needle}\` 两边不同值（共享 ${counts.shared} 次 / 内联 ${counts.injector} 次）—— 内联的不是同一段正文`,
      })
    }
  }
  if (calls < 2) {
    problems.push({ code: 'ATM01-INJECT-NO-CALLS', message: `注入器里 \`writeFileAtomic(\` 只出现 ${calls} 次（两个写盘点都要真调它）—— 内联了但没接上` })
  }
  return { mode: 'inline-block', problems, readings }
}

/** 从真树读两份源码，跑同一条判词（`result.json` 的读数）。 */
export function injectorInlineReading({ repoRoot }) {
  const sharedFile = path.join(repoRoot, ...SHARED_REL.split('/'))
  const injectorFile = path.join(repoRoot, ...INJECTOR_REL.split('/'))
  const reading = { shared_file: sharedFile, injector_file: injectorFile, read_errors: [], mode: 'none', problems: [], readings: null }
  let sharedSource = null
  let injectorSource = null
  try {
    sharedSource = readFileSync(sharedFile, 'utf8')
  } catch (err) {
    reading.read_errors.push({ file: SHARED_REL, code: String(err?.code ?? err) })
  }
  try {
    injectorSource = readFileSync(injectorFile, 'utf8')
  } catch (err) {
    reading.read_errors.push({ file: INJECTOR_REL, code: String(err?.code ?? err) })
  }
  if (sharedSource === null || injectorSource === null) {
    reading.problems.push({ code: 'ATM01-INJECT-READ', message: `读不动：${JSON.stringify(reading.read_errors)} —— 这一腿判不了，不许记绿` })
    return reading
  }
  const verdict = inlineSourceProblems({ sharedSource, injectorSource })
  reading.mode = verdict.mode
  reading.problems = verdict.problems
  reading.readings = verdict.readings
  reading.injector_bytes = Buffer.byteLength(injectorSource, 'utf8')
  reading.shared_bytes = Buffer.byteLength(sharedSource, 'utf8')
  return reading
}
