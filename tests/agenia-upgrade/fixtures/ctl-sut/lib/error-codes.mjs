/**
 * 【测试替身 · 不是产品代码】`CTL-05` 刀架用的最小 SUT 的错误码表 —— 只有一条。
 * 判据读它来回答"拒的那个码是不是登记过的"（`codeRegistered()`）。
 */
export const CODES = Object.freeze({
  E_PROPOSAL_CONTROL_CHAR: { exit: 2, zh: '正文里有控制字符（code<32 且 ≠LF）' },
})
