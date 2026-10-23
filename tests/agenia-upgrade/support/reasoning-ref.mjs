/**
 * `F-148`（`RFG-01` / `RFG-02`）的**阳性对照**：照 `CONTRACT.md` §10 写的最小实现 + 两把反向刀。
 *
 * 为什么住这儿而不是各自抄一份：两个用例（纯函数 / 接缝）要喂**同一份**最小实现 ——
 * 抄两份的那天，两份就会分叉，而"阳性对照"分叉以后谁都不是基准（`cand-20261019-0030`：
 * 兜底名单 / 参照实现这类第二份真相，光靠注释写「不许分叉」守不住）。
 *
 * 🔴 **这里没有一行是生产代码**：它只住在运行根之下（`<run>/fixtures/<case>-<purpose>/`），
 *    由 `importSource()` 落盘再 import。`presets/**` 一个字节都不碰。
 *
 * 两把刀（`mig-rules-16`：一个变异体只证一格）：
 *   · `knifeFence()`   —— 删掉围栏状态机那两行 ⇒ **只有围栏格**翻面（`RFG-01`）；
 *   · `knifeCatch()`   —— 删掉接缝里那对 `try`/`catch` ⇒ **只有"出错不抛"那一格**翻面（`RFG-02`）。
 *   刀割的是**这份最小实现的字节**，不是被测面的字节（生产里那段还不存在时没有字节可删）。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fixtureDir } from './verify-recompute.mjs'

/**
 * 照 `CONTRACT.md` §10.1–§10.4 写的**最小实现**（纯逻辑：单元数 / 批式 / 流式）。
 *
 * 写成源码字符串而不是普通模块：两个用例要把它**落进各自的运行根再 import**
 * （`presets/**` 只读；缓存按 URL 键 ⇒ 每个变体一个目录）。
 *
 * 三处刻意写成这样（都是给刀留的落点，不是风格）：
 *   ① 围栏状态机是**单独两行**（`if (inFence) …` / `if (isFence(line)) …`）⇒ `knifeFence()` 删的就是它们；
 *   ② 判据只有一处（`countUnits(line) > MIN_UNITS`），`3` 只有 `MIN_UNITS` 一个载体；
 *   ③ `\r` 在增量末尾**先留着**（可能是 `\r\n` 的前半）—— 否则"逐字节等价"那条不变式在跨增量切分上会假绿。
 */
export const REF_FILTER_SOURCE = `// F-148 阳性对照 · 照 CONTRACT.md §10 写的最小实现（**不是生产代码**，只住在运行根里）
export const MIN_UNITS = 3

const P0 = new Set([...'，。、：；！？（）【】「」《》『』“”‘’…—～', ...',.:;!?()[]{}<>"\\'-'])

const isModifier = (cp) => cp === 0xfe0f || cp === 0x200d || (cp >= 0x1f3fb && cp <= 0x1f3ff)
const isLatin = (cp) => (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)

export function countUnits(text) {
  const s = String(text ?? '')
  let n = 0
  let inWord = false
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (/\\s/u.test(ch) || P0.has(ch)) { inWord = false; continue }
    if (isLatin(cp)) { if (!inWord) { n += 1; inWord = true } continue }
    inWord = false
    if (isModifier(cp)) continue
    // 走到这里只可能是表里剩下的那几行（汉字 / 阿拉伯数字 / emoji / 其它非标点符号）—— 一律 1。
    // 口径逐字见 CONTRACT.md §10.2；汉字区段与 emoji 属性在这一份里不必再判（它们都落在这一支）。
    n += 1
  }
  return n
}

/** 一份**有状态的**逐段判据（围栏状态跨段保持；流式那一侧跨 delta 保持）。 */
function makeJudge() {
  let inFence = false
  const isFence = (line) => line.trim().startsWith('\`\`\`')
  return (line) => {
    if (inFence) { if (isFence(line)) inFence = false; return true }
    if (isFence(line)) { inFence = true; return true }
    return countUnits(line) > MIN_UNITS
  }
}

export function stripShortParagraphs(text) {
  const s = String(text ?? '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n')
  const segs = s.split('\\n')
  const judge = makeJudge()
  let out = ''
  for (let i = 0; i < segs.length; i += 1) {
    if (!judge(segs[i])) continue
    out += segs[i]
    if (i < segs.length - 1) out += '\\n'
  }
  return out
}

export function createReasoningFilter() {
  const judge = makeJudge()
  let buf = ''
  const normalize = (flush) => {
    buf = buf.replace(/\\r\\n/g, '\\n')
    buf = flush ? buf.replace(/\\r/g, '\\n') : buf.replace(/\\r(?!$)/g, '\\n')
  }
  const drain = (flush) => {
    normalize(flush)
    let emit = ''
    let at = buf.indexOf('\\n')
    while (at >= 0) {
      const line = buf.slice(0, at)
      buf = buf.slice(at + 1)
      if (judge(line)) emit += line + '\\n'
      at = buf.indexOf('\\n')
    }
    if (flush) {
      if (buf !== '' && judge(buf)) emit += buf
      buf = ''
    }
    return emit
  }
  return {
    push(delta) { buf += String(delta ?? ''); return drain(false) },
    flush() { return drain(true) },
  }
}
`

/**
 * 照 `CONTRACT.md` §10.5 写的**最小接缝**（`llm/stream` 监听器）—— 与生产同签名、同语义。
 *
 * 四个刻意之处：
 *   ① 它是 **async generator function**（调用它**同步**返回 AsyncGenerator）——
 *      `dsh-agent-loop` 是 `for await (… of llm.stream(request))`，返回 Promise 会当场 TypeError；
 *   ② 🔴 它**同时**改 `reasoning-delta.text` **和 `block-end` 的 reasoning 载荷** ——
 *      落盘的是后者（`dsh-llm/lib/index.js:1020-1021` 的 `if (partial.block) return partial.block`），
 *      只改 delta 等于什么都没改；
 *   ③ 尾巴排在 `finish` **之前**（`finish` 之后不再吐 reasoning）；
 *   ④ 三处各是**可整块删掉的行**：`try`/`catch` 那一对（`knifeCatch`）、载荷改写那一行（`knifePayload`）、
 *      `finish` 前 flush 那一行（`knifeFinishFlush`）—— 一把刀只证一格。
 */
export const REF_LISTENER_SOURCE = `// F-148 阳性对照 · 照 CONTRACT.md §10.5 写的最小接缝（**不是生产代码**）
import { createReasoningFilter, stripShortParagraphs } from './reasoning-filter.mjs'

export async function* llmStreamListener(options, next) {
  const stream = await next()
  const filter = createReasoningFilter()
  let lastIndex
  let warned = false
  const isObj = (v) => v !== null && typeof v === 'object'
  const complain = (err) => {
    if (warned) return
    warned = true
    console.error('[agenia] F-148 思考链过滤出错，这一条原样放行：' + String(err && err.message ? err.message : err))
  }
  const reasoningPayload = (chunk) => isObj(chunk) && chunk.type === 'block-end'
    && isObj(chunk.block) && chunk.block.type === 'reasoning' && typeof chunk.block.text === 'string'
  const tailOf = (index) => {
    if (index === undefined) return null
    let tail = ''
    try {
      tail = filter.flush()
    } catch (err) {
      complain(err)
      return null
    }
    return tail === '' ? null : { type: 'reasoning-delta', index, text: tail }
  }
  for await (const chunk of stream) {
    let out = chunk
    try {
      if (isObj(chunk) && chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
        lastIndex = chunk.index
        out = { ...chunk, text: filter.push(chunk.text) }
      } else if (reasoningPayload(chunk)) {
        const atBlockEnd = tailOf(chunk.index)
        if (atBlockEnd !== null) yield atBlockEnd
        out = { ...chunk, block: { ...chunk.block, text: stripShortParagraphs(chunk.block.text) } }
      } else if (isObj(chunk) && chunk.type === 'finish') {
        const beforeFinish = tailOf(lastIndex)
        if (beforeFinish !== null) yield beforeFinish
      }
    } catch (err) {
      complain(err)
      out = chunk
    }
    yield out
  }
  const atEnd = tailOf(lastIndex)
  if (atEnd !== null) yield atEnd
}
`

/** 「什么都不做」那一臂：**原样放行**（红/绿全靠它不该绿这件事证明）。 */
export const NULL_FILTER_SOURCE = `// F-148 反向对照 · 什么都不做（原样放行）
export const MIN_UNITS = 3
export function countUnits(text) { return 0 }
export function stripShortParagraphs(text) { return String(text ?? '') }
export function createReasoningFilter() {
  return { push(delta) { return String(delta ?? '') }, flush() { return '' } }
}
`

/** `RFG-01` 那把刀要删的两行（逐字在 `REF_FILTER_SOURCE` 里；找不到 ⇒ 调用方报 `KNIFE-LINE-MISSING`）。 */
export const FENCE_LINES = [
  /^ *if \(inFence\) \{.*$/m,
  /^ *if \(isFence\(line\)\) \{.*$/m,
]

/**
 * `RFG-02` 那把刀要删的两处（`try` 那一行 + `} catch (err) { … }` 整块）。
 *
 * 🔴 **锚点必须够长**：`^ *try \{\n` 会先命中 `tailOf()` 里那个小 `try`（它排在主循环**前面**），
 *    那样一刀切下去，量到的是"尾巴那个 guard 没了"，而主循环的 guard 还在 ⇒ `S6` 根本不翻面。
 *    （2026-10-23 实测：短锚点下 `flipped` 是空的。）所以两头都带上它独有的邻居：
 *    `try` 前面必须是 `let out = chunk`，`catch` 里必须是 `out = chunk`（`tailOf` 那个是 `return null`）。
 */
export const LISTENER_TRY_LINE = /^ *let out = chunk\n *try \{\n/m
export const LISTENER_CATCH_BLOCK = /^ *\} catch \(err\) \{\n *complain\(err\)\n *out = chunk\n *\}\n/m

/** 删掉围栏状态机那两行（返回 `null` = 落点找不到，**不许**静默当成"刀成立"）。 */
export function knifeFence(source) {
  const removed = []
  let out = source
  for (const re of FENCE_LINES) {
    const hit = out.match(re)
    if (hit === null) return null
    removed.push(hit[0].trim())
    out = out.replace(re, '')
  }
  return { source: out, removed }
}

/** 删掉接缝里那对 `try` / `catch`（返回 `null` = 落点找不到）。 */
export function knifeCatch(source) {
  const tryHit = source.match(LISTENER_TRY_LINE)
  const catchHit = source.match(LISTENER_CATCH_BLOCK)
  if (tryHit === null || catchHit === null) return null
  // 只把 `try {` 那一行抹掉（`let out = chunk` 留着），再挖掉 catch 整块 ⇒ 异常直接冒到流上。
  const out = source.replace(LISTENER_TRY_LINE, `${tryHit[0].split('\n')[0]}\n`).replace(LISTENER_CATCH_BLOCK, '')
  return { source: out, removed: ['try {', catchHit[0].trim().split('\n')[0]] }
}

/**
 * `RFG-03` 第一把刀：删掉**载荷改写**那一行 ⇒ `A1`/`A2` 翻面，`A3` 不动。
 *
 * 半修形状（真机上出现过的那个）：只改 delta、不改 `block-end` 载荷 ⇒ 落盘的还是原始全文。
 */
export const LISTENER_PAYLOAD_LINE = /^ *out = \{ \.\.\.chunk, block: \{ \.\.\.chunk\.block, text: stripShortParagraphs\(chunk\.block\.text\) \} \}\n/m

/** `RFG-03` 第二把刀：删掉 `finish` 那一整个分支 ⇒ 尾巴落回流末尾（排在 `finish` 之后）⇒ 只翻 `A3`。 */
export const LISTENER_FINISH_BRANCH = /^ *\} else if \(isObj\(chunk\) && chunk\.type === 'finish'\) \{\n[\s\S]*?\n *\}\n/m

/** 删掉载荷改写那一行（返回 `null` = 落点找不到）。 */
export function knifePayload(source) {
  const hit = source.match(LISTENER_PAYLOAD_LINE)
  if (hit === null) return null
  return { source: source.replace(LISTENER_PAYLOAD_LINE, ''), removed: [hit[0].trim()] }
}

/** 删掉 `finish` 那一整个分支（返回 `null` = 落点找不到）。 */
export function knifeFinishFlush(source) {
  const hit = source.match(LISTENER_FINISH_BRANCH)
  if (hit === null) return null
  // ⚠️ 匹配段落的**第一个字**是前一个分支的收尾 `}` —— 整段删掉会把那个 `}` 一起吃掉（语法当场崩，
  //    那不是"翻面"，是换个崩法）。所以留一个同缩进的 `}` 把前一个分支收住。
  const indent = /^( *)\} else if/.exec(hit[0])?.[1] ?? ''
  return {
    source: source.replace(LISTENER_FINISH_BRANCH, `${indent}}\n`),
    removed: [hit[0].trim().split('\n')[0]],
  }
}

// ── 装配器（`RFG-03` 的量具）──────────────────────────────────────────────
/**
 * 复刻 `@deepseek-ai/dsh-llm` 的 `BlockAssembler`（`dsh-llm/lib/index.js:954-1123`，从 `app.asar` 读的）
 * 里**够这一票用**的那半边：`push()` 的三种 chunk + `blocks()` 的拼装。
 *
 * 🔴 证据等级（照实写，别当成"真类跑过"）：**这是复刻，不是真类**。
 *    真类只在 `app.asar` 里；从测试树 import 它要连 `@deepseek-ai/dsh-typert-protocol` /
 *    `dsh-util-values` / `dsh-util-crypto` / `dsh-brand` / `schemastery` / `dsh-timeout` 六个包一起加载，
 *    测试树够不着（`app.asar.unpacked` 里也没有它）。
 *    ⇒ 复刻的**规则**由 `RFG-03` 的三条自控格钉住（`A-PREF` 载荷赢 · `A-ACC` 无载荷时按 delta 累加 ·
 *    `A-IGN` `block-end` 之后到的 delta 被忽略）；三条里任何一条不成立 ⇒ 报 `ASSEMBLER-RECOMPUTE`。
 *    ⚠️ 复刻与真类的一致性另有**一次性对账**读数（2026-10-23 14:5x，对同一条流跑真类字节 vs 本函数，
 *    结论逐字相同 —— 见 `.team/test/2026-10-23/log.md` 第五节）。
 *
 * 与真类一致的三处（逐条可回查）：
 *   · `block-start` ⇒ `ensure(index, blockType)`；
 *   · delta ⇒ `ensure(index, ...)`，**已有载荷就丢**（真类：`if (partial.block) return`）；
 *   · `block-end` ⇒ `partial.block = chunk.block`，**载荷优先**（真类：`assemble()` 第一句 `if (partial.block) return partial.block`）。
 * 不复刻的：`max-tokens` 截断（丢 tool-call）、`replayState`、`message()`、被中断的前缀。
 *
 * @param {Array<object>} chunks 流里的 chunk（按到达次序）
 * @returns {Array<{type: string, text?: string}>} 每个见过的 index 一块（按流次序）
 */
export function assembleBlocks(chunks) {
  return assembleIndexed(chunks).map((entry) => entry.block)
}

/** 同 `assembleBlocks`，但每块带上它自己的 `index`（判据要按 index 取那一条 reasoning）。 */
export function assembleIndexed(chunks) {
  const partials = new Map()
  const order = []
  const ensure = (index, blockType) => {
    let partial = partials.get(index)
    if (partial === undefined) {
      partial = { blockType, text: '', block: undefined }
      partials.set(index, partial)
      order.push(index)
    }
    return partial
  }
  for (const chunk of chunks) {
    if (chunk === null || typeof chunk !== 'object') continue
    switch (chunk.type) {
      case 'block-start':
        ensure(chunk.index, chunk.blockType)
        break
      case 'text-delta':
      case 'reasoning-delta': {
        const partial = ensure(chunk.index, chunk.type === 'text-delta' ? 'text' : 'reasoning')
        if (partial.block !== undefined) break
        partial.text += chunk.text
        break
      }
      case 'block-end': {
        const partial = ensure(chunk.index, chunk.block?.type)
        if (partial.block !== undefined) break
        partial.block = chunk.block
        break
      }
      default:
        break
    }
  }
  return order.map((index) => {
    const partial = partials.get(index)
    const block = partial.block !== undefined
      ? partial.block
      : { type: partial.blockType ?? 'text', text: partial.text }
    return { index, block }
  })
}

/**
 * 装配之后：某个 index 的 reasoning 文本（判据只看它 —— 那是**落盘的那一份**）。
 * `index === undefined` ⇒ 取最后一条 reasoning（本票夹具都只有一个 reasoning 块）。
 */
export function assembledReasoningText(chunks, index = undefined) {
  const reasoning = assembleIndexed(chunks).filter((entry) => entry.block?.type === 'reasoning')
  if (reasoning.length === 0) return null
  const hit = index === undefined
    ? reasoning[reasoning.length - 1]
    : reasoning.find((entry) => entry.index === index)
  return hit === undefined ? null : String(hit.block.text ?? '')
}

/**
 * 把 `files`（`文件名 → 源码`）落到运行根之下、import 其中的入口文件。
 *
 * 每个变体一个**独立子目录**：ESM 缓存按 URL 键，同名不同内容的文件会拿到旧字节
 * （`mig-rules-04`）—— 换目录是最省事也最不会看错的那种隔离。
 *
 * @param {string} caseId  `RFG-01` / `RFG-02`
 * @param {string} tag     变体名（`ref` / `null` / `knife` …）
 * @param {Record<string,string>} files
 * @param {string} entry   入口文件名（`reasoning-filter.mjs` / `listener.mjs`）
 * @returns {Promise<{mod: object, dir: string, entry: string, sha256: Record<string,string>, bytes: Record<string,number>}>}
 */
export async function importSource(caseId, tag, files, entry) {
  const base = fixtureDir(caseId, tag)
  const dir = path.join(base, 'tree')
  mkdirSync(dir, { recursive: true })
  const sha256 = {}
  const bytes = {}
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(dir, name)
    writeFileSync(file, source, 'utf8')
    sha256[name] = createHash('sha256').update(source, 'utf8').digest('hex')
    bytes[name] = Buffer.byteLength(source, 'utf8')
  }
  const entryFile = path.join(dir, entry)
  const mod = await import(pathToFileURL(entryFile).href)
  return { mod, dir, entry: entryFile, sha256, bytes }
}
