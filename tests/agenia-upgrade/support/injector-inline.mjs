/**
 * `ATM-01` 腿 10 的量具 —— **注入器里的原子写与共享件同源**（构案 0007 · 史山清查 B2 · Gate 2）。
 *
 * 契约：`.team/test/2026-11-13/CONTRACT-史山清查-B2.md` §2。
 *
 * 🔴 **2026-11-13 起，这一份还是"内联块"字面量的唯一出处**（构案 0008 · 史山清查 B3）：
 * `INLINE_BLOCKS` 里有**三块**（`atomic` / `guards` / `cliHarness`），`@inline-begin/@inline-end` 的标签、
 * 出厂件那一侧的成对包装标记前缀、每块的正文指纹，全部从这张表派生。
 * 腿 10（注入器同源）只读 `atomic` 那一块；`support/staged-artifact.mjs` 的腿 7b（出厂件每一块）
 * 与 `support/cli-guards-shared.mjs` 的普查腿各读自己那一块 —— **不许**在别处再写一遍这些字面量。
 * ⚠️ 构案 0009（B4）的第三块 `CLI 骨架正文` 在 Gate 3 与发布**同批**搬进来了（搬运时点见那块自己的注释）。
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

/**
 * 🔴 **内联块的字面量只有这一处**（构案 0008 · 史山清查 B3）：`@inline-begin <标签>` / `@inline-end <标签>`
 * 与出厂件那一侧的成对包装标记，全部从这张表派生。两条腿（腿 10 注入器同源 / 腿 7b 出厂件两块）
 * 与普查腿（`support/cli-guards-shared.mjs`）都读它 —— **不许**在别处再写一遍这些字面量
 * （`cand-20261104-0020`：一个数 / 一条口径有几份载体，改一处 = 没改）。
 *
 * 两块的分工：
 *   · `atomic` —— `lib/atomic.mjs` 的原子写并集正文（B1 起就在内联；标记与指纹 **逐字不变**）；
 *   · `guards` —— `lib/cli-guards.mjs` 的公共 helper 正文（B3 新增：install/rollback 共用的 8 个 helper）。
 *     ⚠️ `emit` 的**唯一定义**在这一块里（B3）。构案 0009 的 CLI 骨架共享件只能**导出**它
 *     （`export { emit } from './cli-guards.mjs'`）—— 两块各定义一个 `emit` 就是"同一件事两份正文"，
 *     正是那一票要清的病；骨架腿（`support/cli-harness-shared.mjs`）数这件事。
 *
 * `shipped_*` 两格是**出厂件那一侧**的包装标记（发布器写进出厂件的）：
 *   · 起点行：`// ── 出厂件内联：<标签>（…）──`（**标签必须在这一行里** —— 切块 / 剥块都靠它认人）；
 *   · 终点行：逐字 `// ── 内联结束 ──`（块**不嵌套**，所以终点不必带标签；起点带标签就够分清了）；
 *   · 包装之间**只能放逐字正文**（内建绑定那几行放在起点标记**之前**）—— 这样"两边同源"是一条
 *     字节级判据（`normalizeBlock` 之后逐字相等），不是"看着差不多"。
 */
export const INLINE_BLOCKS = Object.freeze({
  atomic: Object.freeze({
    id: 'atomic',
    label: '原子写并集正文',
    sourceRel: SHARED_REL,
    /** 正文指纹（内容锚；每一项都要**两边同值**且 > 0）。 */
    fingerprints: Object.freeze([
      'writeSync(handle',
      'fsyncSync(handle)',
      "openSync(tmp, 'wx')",
      'const tmp = `${target}.tmp-${pid}-${rand}`',
      'RETRYABLE_RENAME',
      'maxAttempts = 5',
      'CLI_WRITE_MAX_ATTEMPTS = 6',
      'cleanup_refused',
    ]),
    /**
     * 出厂件里这份正文**必须**定义的东西（定义计数：`function <名>(`）。
     * 今天那份 CLI 副本里也有它们（那是同一份正文被抄过去的时代）⇒ 这条**不是**判别器，
     * 它是"发布时没有把旧副本和内联块一起留下两份定义"这一格（`SHIP-INLINE-DUP`）。
     */
    definitions: Object.freeze(['writeFileAtomic']),
  }),
  guards: Object.freeze({
    id: 'guards',
    label: '公共 helper 正文',
    sourceRel: 'presets/agenia/lib/cli-guards.mjs',
    /** 8 个 helper 的**定义形状**（`normalizeBlock` 去掉了 `export ` 前缀，两边都该长这样）。 */
    fingerprints: Object.freeze([
      'function assertDeletableTarget(',
      'function defaultBackupRoot(',
      'function driveOf(',
      'function emit(',
      'function isUnder(',
      'function normKey(',
      'function pathVerdict(',
      'function slugOf(',
    ]),
    definitions: Object.freeze(['assertDeletableTarget', 'defaultBackupRoot', 'driveOf', 'emit', 'isUnder', 'normKey', 'pathVerdict', 'slugOf']),
  }),
  /**
   * `cliHarness` —— `lib/cli-harness.mjs` 的 CLI 骨架正文（构案 0009 · B4 · Gate 3 搬进来的第三块）。
   *
   * 搬运时点：**与"实现 + `--op publish-staged`"同批**。先搬会怎样：出厂件还没带上这一块 ⇒
   * `ATM-01` 腿 7b 立刻红，连它自己的阳性对照（"真出厂件原文应当绿"）都跟着红 —— 那一条红的来历是
   * "还没发布"，不是 B1/B2 的病（`cand-20261016-promise-without-assertion`）。
   *
   * 这块只放 `parseArgs` / `cliError`：`emit` 的**唯一定义**在 `guards` 那一块，骨架共享件只**转出**它
   * （`export { emit } from './cli-guards.mjs'`）—— 两块各定义一个 `emit` 就是"同一件事两份正文"。
   * 指纹里的刀锚（`B4-KNIFE-ANCHOR`）指向"未知参数出声"那一行：出厂件里的未知参数也走同一行。
   */
  cliHarness: Object.freeze({
    id: 'cliHarness',
    label: 'CLI 骨架正文',
    sourceRel: 'presets/agenia/lib/cli-harness.mjs',
    fingerprints: Object.freeze(['function parseArgs(', 'function cliError(', 'B4-KNIFE-ANCHOR']),
    definitions: Object.freeze(['parseArgs', 'cliError']),
  }),
})

/** 正文标记（与各共享件里那一对逐字相同；内联副本必须用同名标记）。 */
export const BLOCK_BEGIN = `@inline-begin ${INLINE_BLOCKS.atomic.label}`
export const BLOCK_END = `@inline-end ${INLINE_BLOCKS.atomic.label}`
/** 出厂件那一侧的包装标记（起点带标签 —— 见 `INLINE_BLOCKS` 的注释）。 */
export const SHIPPED_BEGIN_PREFIX = '// ── 出厂件内联：'
export const SHIPPED_END_MARKER = '// ── 内联结束 ──'
/** 原子写那一份的指纹（B2 起的读者：`fingerprintCounts()` 与腿 10）。 */
export const INLINE_FINGERPRINTS = INLINE_BLOCKS.atomic.fingerprints

/** 一对标记的裸字面量（`<标签>` ⇒ 两行标记；所有腿 / 普查腿共用这一份）。 */
export const beginOf = (block) => `@inline-begin ${block.label}`
export const endOf = (block) => `@inline-end ${block.label}`

/** 一行 `@inline-begin …` 里的标签（到 `（` 或行尾为止；共享件那边允许在标签后面写括注）。 */
export function labelOf(beginText) {
  const m = /@inline-begin\s+([^（\r\n]*)/.exec(String(beginText))
  return m === null ? null : m[1].trim()
}

const stripComment = (text) => String(text).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
const countOf = (text, needle) => String(text).split(needle).length - 1

/**
 * 一份源码里**所有**标记跨度（`@inline-begin` … `@inline-end`；行号 1 起，`text` 不含标记行）。
 *
 * 为什么要有"全部"这一份：腿 10 只认**第一段**（注入器那一份正文），而腿 0 的
 * "派生副本不算第二份实现"要按**第一段**判（别处的标记块 / 第二段都不豁免）。
 * 标记字面量只有这一处（`INLINE_BLOCKS` ⇒ `beginOf` / `endOf`）—— 所有腿都从这里读，不各写一份。
 *
 * `beginNeedle` 给了 ⇒ 只收**起点行里含它**的那几段（两块同处一份文件时靠标签认人）；
 * 每段都带回 `begin_text` / `end_text` / `label`（读数要能说清"跳过了哪一段"）。
 * ⚠️ 共享件那边的起点行允许在标签后面写括注（`…正文（删除三闸 + 原子写…）`）⇒ 用**子串**认，
 *    不用整行相等。
 *
 * @param {string} source
 * @param {string|null} [beginNeedle]  `null` = 所有标签
 * @returns {Array<{begin_line:number, end_line:number, text:string, label:string|null, begin_text:string, end_text:string}>}
 */
/** 标记行的形状：`@inline-begin` / `@inline-end` **后面必须跟一个标签**（`\s+\S`）。 */
const MARKER_BEGIN_RE = /(?:^|\s)@inline-begin\s+\S/
const MARKER_END_RE = /(?:^|\s)@inline-end\s+\S/

export function markedSpans(source, beginNeedle = null) {
  const lines = String(source).split(/\r?\n/)
  const spans = []
  let begin = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (begin < 0) {
      if (MARKER_BEGIN_RE.test(lines[i]) && (beginNeedle === null || lines[i].includes(beginNeedle))) begin = i
      continue
    }
    if (MARKER_END_RE.test(lines[i])) {
      spans.push({
        begin_line: begin + 1,
        end_line: i + 1,
        text: lines.slice(begin + 1, i).join('\n'),
        label: labelOf(lines[begin]),
        begin_text: lines[begin].trim(),
        end_text: lines[i].trim(),
      })
      begin = -1
    }
  }
  return spans
}

/**
 * 从一份源码里切出标记之间的正文。`beginNeedle` 给了 ⇒ 只认那一段（找不到就是找不到）。
 * 不给 ⇒ **第一段**（B2 的调用方：注入器只有一段）。
 *
 * @returns {{found:boolean, begin_line:number|null, end_line:number|null, text:string, marker_lines:number[]}}
 */
export function blockOf(source, beginNeedle = null) {
  const first = markedSpans(source, beginNeedle)[0]
  if (first === undefined) return { found: false, begin_line: null, end_line: null, text: '', marker_lines: [] }
  return { found: true, begin_line: first.begin_line, end_line: first.end_line, text: first.text, marker_lines: [first.begin_line, first.end_line] }
}

/**
 * 从**出厂件**正文里切出某一块的**包装标记之间**的正文（发布器写进去的那一对）。
 *
 * 起点标记带着标签（见 `INLINE_BLOCKS` 的注释）；终点是逐字的 `// ── 内联结束 ──`。
 * 两块同处一份文件时，只有起点那一行能分清"这一段是谁的"，所以切块、剥块（刀）都走这一处。
 *
 * @param {string} text 出厂件正文
 * @param {{label:string}} block `INLINE_BLOCKS` 里的一项
 * @returns {{found:boolean, begin_line:number|null, end_line:number|null, text:string, reason?:string}}
 */
export function shippedBlockOf(text, block) {
  const lines = String(text).split(/\r?\n/)
  const beginNeedle = `${SHIPPED_BEGIN_PREFIX}${block.label}`
  const begin = lines.findIndex((l) => l.includes(beginNeedle))
  if (begin < 0) return { found: false, begin_line: null, end_line: null, text: '', reason: `找不到起点行（含 ${JSON.stringify(beginNeedle)}）` }
  let end = -1
  for (let i = begin + 1; i < lines.length; i += 1) {
    if (lines[i].includes(SHIPPED_END_MARKER)) { end = i; break }
  }
  if (end < 0) return { found: false, begin_line: begin + 1, end_line: null, text: '', reason: `起点在第 ${begin + 1} 行，但找不到终点行（逐字 ${JSON.stringify(SHIPPED_END_MARKER)}）` }
  return { found: true, begin_line: begin + 1, end_line: end + 1, text: lines.slice(begin + 1, end).join('\n'), reason: null }
}

/**
 * 把出厂件里某一块的**包装段整段剥掉**（刀的构造：`bug-20261112-16` 的同一课 —— 按标记切片，
 * 不拿"出厂件原文"冒充"剥过的那一份"）。剥不掉 ⇒ 如实回报（`ok:false`），**不许**静默返回原文。
 *
 * @returns {{ok:true, text:string, removed_lines:number, bytes_before:number, bytes_after:number}|{ok:false, reason:string}}
 */
export function stripShippedBlock(text, block) {
  const span = shippedBlockOf(text, block)
  if (!span.found) return { ok: false, reason: span.reason ?? '切不出那一段' }
  const lines = String(text).split(/\r?\n/)
  const kept = [...lines.slice(0, span.begin_line - 1), ...lines.slice(span.end_line)]
  const out = kept.join('\n')
  return {
    ok: true,
    text: out,
    removed_lines: span.end_line - span.begin_line + 1,
    bytes_before: Buffer.byteLength(String(text), 'utf8'),
    bytes_after: Buffer.byteLength(out, 'utf8'),
  }
}

/**
 * 正文规范化（"同一段正文"的判法；**只做这四步**，不做语法分析）：
 *   ① 去标记行（调用方传的正文本来就不含标记，这里再挡一次）；
 *   ② 每行去 `export `（共享件里是 `export function`，内联副本不需要导出）；
 *   ③ 去公共缩进（内联块可能整体缩进过）；
 *   ④ 去行尾空白；保留空行（空行也是正文的一部分）。
 */
export function normalizeBlock(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => !MARKER_BEGIN_RE.test(l) && !MARKER_END_RE.test(l))
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

/**
 * 某一块的指纹在**两边正文**里各出现几次（键名按对象的两侧取名，腿 7b 用）。
 * 计数发生在**规范化之后的块正文**上 —— 块外那些同名物不算（那是另一条腿的事）。
 *
 * @param {{fingerprints: readonly string[]}} block
 * @param {string} leftNorm  共享件那一块的正文
 * @param {string} rightNorm 出厂件那一块的正文
 * @param {[string,string]} [keys] 两个键名（缺省 `['shared','shipped']`）
 */
export function fingerprintCountsOf(block, leftNorm, rightNorm, keys = ['shared', 'shipped']) {
  const out = {}
  for (const needle of block.fingerprints) out[needle] = { [keys[0]]: countOf(leftNorm, needle), [keys[1]]: countOf(rightNorm, needle) }
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
