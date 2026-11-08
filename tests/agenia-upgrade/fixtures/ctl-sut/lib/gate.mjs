/**
 * 【测试替身 · 不是产品代码】`CTL-05` 刀架用的最小闸 —— 只有一件事：
 * **正文里 `code < 32` 且 ≠ LF 的字符必须拒**（`AGENIA_CTL_KNIFE` 只给刀架选变体）。
 *
 * 为什么是独立替身而不是"产品副本 + 打补丁"：刀不能和它守的东西共用一个坟。
 * 产品一旦按契约装好闸，副本上的锚点就没了（或闸被装了两遍）—— 刀架会以"尺子坏了"的样子红，
 * 而红的不是判据。**真实四条入库路径由 `CTL-01`…`CTL-04` 量**；这里只证明判据本身
 * "该绿时绿、该红时红、每把刀只翻它那一面"。
 *
 * 行为与契约 `.team/test/2026-11-08/CONTRACT-batch9.md` §1.2 一致：
 * 报错码 `E_PROPOSAL_CONTROL_CHAR` · 报文含 `where` / `第 <N> 个字符` / `U+XXXX`（1-based 码点、原始正文）。
 */
export const CONTROL_CODE = 'E_PROPOSAL_CONTROL_CHAR'

/**
 * 正文控制字符判决。`mode` 取 `AGENIA_CTL_KNIFE`（缺省 `ok`）：
 * `ok` / `only_tool`（只 P1 有闸）/ `ban_lf`（忘 LF 例外）/ `allow_cr`（CR 先归一再查）/
 * `first_only`（`engine_ops` 只看第 0 条）。
 * @returns {{ok:true}|{ok:false, index:number, codePoint:number}}
 */
export function controlCharVerdict(text, where = '', mode = process.env.AGENIA_CTL_KNIFE ?? 'ok') {
  if (typeof text !== 'string') return { ok: true }
  if (mode === 'only_tool' && !String(where).startsWith('proposal_file')) return { ok: true }
  if (mode === 'first_only') {
    const m = /engine_ops\[(\d+)\]/.exec(String(where))
    if (m !== null && Number(m[1]) > 0) return { ok: true }
  }
  const allowLf = mode !== 'ban_lf'
  const allowCr = mode === 'allow_cr'
  let i = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    i += 1
    const lfOk = cp === 10 && allowLf
    const crOk = cp === 13 && allowCr
    if (cp < 32 && !lfOk && !crOk) return { ok: false, index: i, codePoint: cp }
  }
  return { ok: true }
}

/** 码点 ⇒ `U+XXXX`（十六进制；CR = U+000D）。 */
export function hex4(cp) {
  return cp.toString(16).padStart(4, '0').toUpperCase()
}

/** 一句拒绝报文（契约 §1.2 的三样：位置 / 第 N 个字符 / 码点）。 */
export function controlMessage(where, v) {
  return `${CONTROL_CODE}: 正文里有控制字符：${where} 第 ${v.index} 个字符（U+${hex4(v.codePoint)}）—— 只许 LF（U+000A）；CR 与其它 code<32 一律拒（每条正文必须是 0 个控制字符）`
}
