/**
 * **「码写在文件里」≠「码吐得出来」** —— 判据目录两端的那把尺子。
 *
 * 来历（2026-11-07 复审第三轮）：我原来的机械核对只数"这个名字在用例里出现过几次"，
 * 于是 `RDW-CONTROL-NOT-GREEN` 被当成"已经在目录里"—— 而那个名字只活在 `CODE` 表的声明、
 * 文件头和 registry 题面里，**没有任何一条路径会把它塞进 problems**。题面因此承诺了一个用例
 * 说不出来的码。⇒ 这一把尺子把两个问题分开问：
 *
 *   ① **declared（声明）** —— `CODE` 表里有哪些；
 *   ② **reachable（可吐）** —— 有没有一个**发射点**：`problem(…)` / `caseHold(…)` / `codes.push(…)`
 *      的**实参里**出现这个名字（或它的别名 `CODE.x`）。注释、文件头、`expected_codes:`（那是期望，
 *      不是发射）、以及 leg 读数里的 `codes:` 都**不算**。
 *
 * 只读源码，不执行用例：判据是"能不能指到那一行"，不是"这一跑有没有走到"。
 * 后者由用例自己那些刀负责（每把刀都要把某一条路径真的走一遍）。
 */

/** 把注释从源码里剥掉（引号里的 `//` 不动）；字符串保留 —— 字面量码名本身就是发射点。 */
export function stripComments(source) {
  const text = String(source)
  let out = ''
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quote !== null) {
      out += c
      if (c === '\\') {
        out += text[i + 1] ?? ''
        i += 1
      } else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue }
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i)
      if (nl < 0) break
      out += ' '.repeat(nl - i)
      i = nl - 1
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) { out += ' '.repeat(text.length - i); break }
      out += text.slice(i, end + 2).replace(/[^\n]/g, ' ')
      i = end + 1
      continue
    }
    out += c
  }
  return out
}

/** `CODE = { alias: 'RDW-X', … }` → `Map<alias, literal>`。 */
export function declaredCodes(source) {
  const stripped = stripComments(source)
  const start = stripped.indexOf('const CODE = {')
  if (start < 0) return new Map()
  const end = stripped.indexOf('\n}', start)
  const block = stripped.slice(start, end < 0 ? stripped.length : end)
  const map = new Map()
  const re = /^\s*([A-Za-z_$][\w$]*)\s*:\s*'(RDW-[A-Z0-9-]+)'\s*,/gm
  let m
  while ((m = re.exec(block)) !== null) map.set(m[1], m[2])
  return map
}

/** `open` 位置那个括号的匹配下标（-1 = 不闭合）。 */
function closingIndexOf(text, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < text.length; i += 1) {
    const c = text[i]
    if (quote !== null) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 全部**发射点**：`problem(…)` / `caseHold(…)` / `codes.push(…)` 的实参文本。
 * @returns {{kind:string, line:number, args:string}[]}
 */
export function emissionSites(source) {
  const stripped = stripComments(source)
  const sites = []
  const lineOf = (index) => stripped.slice(0, index).split('\n').length
  const patterns = [
    { kind: 'problem', re: /\bproblem\s*\(/g },
    { kind: 'caseHold', re: /\bcaseHold\s*\(/g },
    { kind: 'codes.push', re: /\bcodes\.push\s*\(/g },
  ]
  for (const { kind, re } of patterns) {
    let m
    while ((m = re.exec(stripped)) !== null) {
      const open = m.index + m[0].length - 1
      const close = closingIndexOf(stripped, open)
      if (close < 0) continue
      sites.push({ kind, line: lineOf(m.index), args: stripped.slice(open + 1, close) })
    }
  }
  return sites
}

/**
 * 声明 ↔ 可吐 的对账。
 *
 * @param {{source:string, registrySource?:string, registryRowPrefix?:string}} input
 *   `registrySource` / `registryRowPrefix` 给了就顺带核对"题面里有没有这个名字"。
 * @returns {{declared:string[], reachable:string[], no_emission:string[],
 *   sites:number, not_in_row:string[], row_present:boolean}}
 */
export function emissionCatalogue({ source, registrySource = null, registryRowPrefix = null }) {
  const aliases = declaredCodes(source)
  const literalOf = (literal) => {
    for (const [alias, value] of aliases) if (value === literal) return `CODE.${alias}`
    return null
  }
  const declared = [...new Set(aliases.values())].sort()
  const sites = emissionSites(source)
  const reachable = []
  const noEmission = []
  for (const literal of declared) {
    const alias = literalOf(literal)
    const hit = sites.find((site) => site.args.includes(`'${literal}'`) || (alias !== null && site.args.includes(alias)))
    if (hit === undefined) noEmission.push(literal)
    else reachable.push({ code: literal, kind: hit.kind, line: hit.line })
  }
  let notInRow = []
  let rowPresent = false
  if (registrySource !== null && registryRowPrefix !== null) {
    const row = String(registrySource).split('\n').find((line) => line.startsWith(registryRowPrefix))
    rowPresent = row !== undefined
    if (rowPresent) notInRow = declared.filter((literal) => !row.includes(literal))
  }
  return {
    declared,
    reachable: reachable.map((item) => item.code),
    reachable_sites: reachable,
    no_emission: noEmission,
    sites: sites.length,
    not_in_row: notInRow,
    row_present: rowPresent,
  }
}
