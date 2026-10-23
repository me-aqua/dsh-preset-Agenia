/**
 * `F-148` · 思考链清理：单元数 ≤ `MIN_UNITS` 的段落不进会话历史（代码块例外）。
 *
 * 契约：`CONTRACT.md` §10.1–§10.4（四个导出的签名冻结）。
 * 纯逻辑：不读盘、不读 env、不改入参、不写全局状态。`createReasoningFilter()` 每次调用
 * 返回独立的一份状态（`inFence` 与半行缓冲不共享）。
 *
 * 住在模型调用内侧（`inject.js` 的 `llm/stream` 监听器）⇒ 这里返回的文本就是落盘的那份。
 */

/** 定形里唯一的那个 `3`（不进 `agent.cordis.yml`：一条常量、一个读者）。 */
export const MIN_UNITS = 3

/**
 * `P0`：计 0 的标点（§10.2 那张表逐字）。
 *
 * 只有表里点名的这些是 0。`·`（Po）· `_`（Pc）· `#` `/`（Po）· 反引号（Sk）都**不在**这里
 * ⇒ 它们各计 1 —— 按 `\p{P}` 去判会把这几个算成 0，那是另一种口径。
 */
const P0 = new Set([...'，。、：；！？（）【】「」《》『』“”‘’…—～', ...',.:;!?()[]{}<>"\'-'])

/** emoji 修饰符计 0：U+FE0F（VS16）· U+200D（ZWJ）· U+1F3FB–U+1F3FF（肤色）。 */
const isEmojiModifier = (cp) => cp === 0xfe0f || cp === 0x200d || (cp >= 0x1f3fb && cp <= 0x1f3ff)

/** 连续的 `[A-Za-z]` 串算**一个**单元（`OK` = 1 · `CONTRACT` = 1）。 */
const isLatinLetter = (cp) => (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)

const WHITESPACE = /\s/u

/**
 * 段落单元数（§10.2）。
 *
 * 表里七行落到这里只有三条支：空白与 `P0` 计 0；拉丁字母按"词"合并；**其余一律 1**
 * （汉字 · 阿拉伯数字一个算一个 · emoji · 其它不在 `P0` 里的符号 —— 这四行的读数相同，
 * 不必分成四支，但没有一支是"兜底猜的"：它们就是 §10.2 剩下的那四行）。
 *
 * `countUnits` 不自己 trim：空白与 `P0` 都计 0。
 */
export function countUnits(text) {
  const s = String(text ?? '')
  let units = 0
  let inWord = false
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (WHITESPACE.test(ch) || P0.has(ch)) {
      inWord = false
      continue
    }
    if (isLatinLetter(cp)) {
      if (!inWord) {
        units += 1
        inWord = true
      }
      continue
    }
    inWord = false
    if (isEmojiModifier(cp)) continue
    units += 1
  }
  return units
}

/** 围栏行：`trim()` 之后**以三个反引号开头**（` ``` ` / ` ```js ` 都算；只看前三个）。 */
const isFenceLine = (line) => line.trim().startsWith('```')

/**
 * 一份**有状态的**逐段判据：围栏状态跨段保持（批式在整段文本内保持，流式跨 delta 保持）。
 *
 * 状态机（§10.3 ⑤）：
 *   - `inFence === false`：围栏行 ⇒ 保留 + 进围栏；否则 `countUnits(段) > MIN_UNITS` 才留。
 *   - `inFence === true`：**无条件保留**；围栏行 ⇒ 这一行也保留、退出围栏。
 *   - 走到末尾仍是 `inFence === true`（没闭合）⇒ opening 之后每一段都已按"保留"走过
 *     ⇒ 自然就是"到末尾全留"（宁可多留，不许把代码吃掉）。
 */
function makeParagraphJudge() {
  let inFence = false
  return (paragraph) => {
    if (inFence) {
      if (isFenceLine(paragraph)) inFence = false
      return true
    }
    if (isFenceLine(paragraph)) {
      inFence = true
      return true
    }
    return countUnits(paragraph) > MIN_UNITS
  }
}

/** `\r\n` → `\n`；孤立 `\r` → `\n`（§10.3 ①；顺序不能反）。 */
const normalizeNewlines = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

/**
 * 批式清理（§10.3）：按 `\n` 切段，留下 4 单元以上的段与围栏块。
 *
 * 重建口径（③）：留下的段**原样保留、它后面那个 `\n` 也保留**；删掉的段**连同它后面那个
 * `\n` 一起消失**。最后一段没有后继 `\n`，所以原样拼、不补换行。
 */
export function stripShortParagraphs(text) {
  const segments = normalizeNewlines(String(text ?? '')).split('\n')
  const keep = makeParagraphJudge()
  let out = ''
  for (let i = 0; i < segments.length; i += 1) {
    if (!keep(segments[i])) continue
    out += segments[i]
    if (i < segments.length - 1) out += '\n'
  }
  return out
}

/**
 * 流式清理（§10.4）：只吐"已经完整、判据已定"的段落。
 *
 * 承重不变式：对**任意**切分 `text = d1 + … + dn`，
 * `push(d1) + … + push(dn) + flush()` 逐字节等于 `stripShortParagraphs(text)`。
 *
 * 跨 delta 的两样状态：`inFence`（住在 judge 里）与**半行缓冲** `buf`。
 * ⇒ 半行永远不早吐（否则"3 还是 4 单元"会在切分点附近翻面）；
 *    ` ``` ` 被拆在多个 delta 里也认得出（只有整行到齐才判）。
 *
 * `\r` 的处理是这条不变式最容易漏的一处：增量末尾的 `\r` **先留着** —— 它可能是
 * `\r\n` 的前半，当场换成 `\n` 会让跨 delta 的 `\r\n` 多吐一个换行。
 */
export function createReasoningFilter() {
  const keep = makeParagraphJudge()
  let buf = ''

  /** 把缓冲里已经确定的换行归一：末尾那个孤零零的 `\r` 留到下一次（或 `flush`）再判。 */
  const normalizeBuffer = (isFlush) => {
    buf = buf.replace(/\r\n/g, '\n')
    buf = isFlush ? normalizeNewlines(buf) : buf.replace(/\r(?!$)/g, '\n')
  }

  const drain = (isFlush) => {
    normalizeBuffer(isFlush)
    let out = ''
    let at = buf.indexOf('\n')
    while (at >= 0) {
      const paragraph = buf.slice(0, at)
      buf = buf.slice(at + 1)
      if (keep(paragraph)) out += paragraph + '\n'
      at = buf.indexOf('\n')
    }
    if (isFlush) {
      if (buf !== '' && keep(buf)) out += buf
      buf = ''
    }
    return out
  }

  return {
    /** @param {string} delta @returns {string} 这一段流到目前为止可以放出去的文本（可能空串） */
    push(delta) {
      buf += String(delta ?? '')
      return drain(false)
    },
    /** @returns {string} 剩下那个没被 `\n` 终结的段落；内部状态清空，下一次 `push` 从零开始 */
    flush() {
      return drain(true)
    },
  }
}
