/**
 * **「码写在文件里」≠「码吐得出来」** —— 判据目录两端的那把尺子。
 *
 * 来历（2026-11-07 复审第三轮）：原来的机械核对只数"这个名字在用例里出现过几次"，
 * 于是 `RDW-CONTROL-NOT-GREEN` 被当成"已经在目录里"—— 而那个名字只活在 `CODE` 表的声明、
 * 文件头和 registry 题面里，**没有任何一条路径会把它塞进 problems**。
 *
 * 来历 2（同日复审第四轮）：第一版把**整段实参文本**拿去做 `includes('CODE.<alias>')` ——
 * 那分不开"**发射**"与"**提到**"：`problem(CODE.x, '… CODE.magic …')` 里那句提示把 `CODE.magic`
 * 也算成了发射点。⇒ 现在只认**码位**那一个实参，整词匹配：
 *
 *   · `problem(…)`     —— 第 **1** 个实参；
 *   · `caseHold(…)`    —— 第 **2** 个实参；
 *   · `codes.push(…)`  —— 第 **1** 个实参。
 *
 * 🔴 **这把尺子量到哪儿、没量到哪儿**（读 `no_emission: []` 之前先看这段）：
 *   · 它判的是"**有没有一个码位**在源码里写着这个字面量"，**不是**"这一跑能不能走到那一行"：
 *     (a) 死代码 / 从没被调用的 helper 里的 `problem(CODE.x)` **照样算**（语法面，不是可达性分析）；
 *     (b) 码位是**变量 / 模板串 / map 查表 / 函数返回**（`problem(code, …)`、`problem(codes[i], …)`）时
 *         它**看不见** ⇒ 那些码会被误判成"不可吐"（红，不会假绿）；码位是三元表达式时，
 *         里面的字面别名**算**（例：`codes.push(expect === 'x' ? CODE.a : CODE.b)` 两个都算）；
 *     (c) 一个只会在某棵树里才走到的分支（例如拿不到 `.git` 时的 vintage `else`）**照样算** ——
 *         分支到底走没走是**用例**记的读数（`vintage.available` / `anchorsOk`），不是这把尺子。
 *   ⇒ `no_emission: []` 的正确读法只有一句：**"没有找到缺码位的字面发射点"**，
 *      **不等于**"每一个码都真的发得出来"。
 *
 *   · 另一头也是真的：**声明表读不出来**时必须出声（`table_ok: false`），否则
 *     `declared: 0 · no_emission: []` 会让整格静默变绿（复审第四轮 MF-2）。
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
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** `depth === 0` 处按逗号切（引号 / 括号内不切）。 */
function splitArguments(text) {
  const out = []
  let start = 0
  let depth = 0
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quote !== null) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') depth -= 1
    else if (c === ',' && depth === 0) { out.push(text.slice(start, i)); start = i + 1 }
  }
  out.push(text.slice(start))
  return out.map((part) => part.trim())
}

/**
 * 声明表：`const CODE = {…}` / `const CODE = Object.freeze({…})`，单双引号都认。
 * 🔴 **读不出来必须出声**（`ok: false` + `why`）—— 返回空表会让调用方静默变绿。
 *
 * @param {string} source
 * @returns {{ok:boolean, why:string|null, shape:string|null, aliases:Map<string,string>}}
 */
export function codeTable(source) {
  const stripped = stripComments(source)
  const head = /const\s+CODE\s*=\s*(Object\.freeze\s*\(\s*)?\{/.exec(stripped)
  if (head === null) {
    return { ok: false, why: '找不到 `const CODE = {` / `const CODE = Object.freeze({` —— 声明表在哪？', shape: null, aliases: new Map() }
  }
  const brace = head.index + head[0].length - 1
  const close = closingIndexOf(stripped, brace)
  if (close < 0) return { ok: false, why: '`CODE` 那个对象字面量没有闭合 —— 解析不了', shape: null, aliases: new Map() }
  const block = stripped.slice(brace + 1, close)
  const aliases = new Map()
  // 键可以是裸标识符，也可以是引号包起来的（`"emittedProblem": "RDW-…"`）；值单双引号都认。
  const re = /(?:^|[,{\s])['"]?([A-Za-z_$][\w$]*)['"]?\s*:\s*(['"])(RDW-[A-Z0-9-]+)\2/g
  let m
  while ((m = re.exec(block)) !== null) aliases.set(m[1], m[3])
  if (aliases.size === 0) {
    return { ok: false, why: '`CODE` 对象里一个 `别名: \'RDW-…\'` 都没解析出来 —— 形状变了？', shape: head[1] === undefined ? 'literal' : 'Object.freeze', aliases }
  }
  return { ok: true, why: null, shape: head[1] === undefined ? 'literal' : 'Object.freeze', aliases }
}

/** 码位实参的规则（只认这三处；别的实参一律不算）。 */
const CODE_POSITION = [
  { kind: 'problem', re: /\bproblem\s*\(/g, index: 0 },
  { kind: 'caseHold', re: /\bcaseHold\s*\(/g, index: 1 },
  { kind: 'codes.push', re: /\bcodes\.push\s*\(/g, index: 0 },
]

/**
 * 全部**码位发射点**：`problem(…)` 的第 1 个实参 / `caseHold(…)` 的第 2 个 / `codes.push(…)` 的第 1 个。
 * 提示文本、别的实参、`expected_codes:`、leg 读数里的 `codes:` **都不算**。
 *
 * @returns {{sites:{kind:string,line:number,arg:string,args:number}[], skipped:{kind:string,line:number,why:string}[]}}
 */
export function emissionSites(source) {
  const stripped = stripComments(source)
  const lineOf = (index) => stripped.slice(0, index).split('\n').length
  const sites = []
  const skipped = []
  for (const { kind, re, index } of CODE_POSITION) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(stripped)) !== null) {
      const open = m.index + m[0].length - 1
      const close = closingIndexOf(stripped, open)
      if (close < 0) continue
      const args = splitArguments(stripped.slice(open + 1, close))
      const arg = args[index]
      if (arg === undefined || arg === '') {
        skipped.push({ kind, line: lineOf(m.index), why: `没有第 ${index + 1} 个实参` })
        continue
      }
      sites.push({ kind, line: lineOf(m.index), arg, args: args.length })
    }
  }
  return { sites, skipped }
}

/** 一个码位实参里有没有这个码（整词：`CODE.alias` 或整串字面量）。 */
function mentionsCode(arg, literal, alias) {
  const text = String(arg)
  const literalRe = new RegExp(`(['"\`])${literal.replace(/[-]/g, '\\-')}\\1`)
  if (literalRe.test(text)) return true
  if (alias === null) return false
  return new RegExp(`\\bCODE\\.${alias.replace(/[$]/g, '\\$')}\\b`).test(text)
}

/**
 * 声明 ↔ 可吐 ↔ 题面 的对账。
 *
 * @param {{source:string, registrySource?:string|null, registryRowPrefix?:string|null}} input
 * @returns {{table_ok:boolean, table_why:string|null, table_shape:string|null,
 *   declared:string[], reachable:string[], reachable_sites:object[], no_emission:string[],
 *   sites:number, skipped:object[], not_in_row:string[], row_present:boolean,
 *   scope_note:string}}
 */
export function emissionCatalogue({ source, registrySource = null, registryRowPrefix = null }) {
  const table = codeTable(source)
  const declared = [...new Set(table.aliases.values())].sort()
  const { sites, skipped } = emissionSites(source)
  const aliasOf = (literal) => {
    for (const [alias, value] of table.aliases) if (value === literal) return alias
    return null
  }
  const reachable = []
  const noEmission = []
  for (const literal of declared) {
    const alias = aliasOf(literal)
    const hit = sites.find((site) => mentionsCode(site.arg, literal, alias))
    if (hit === undefined) noEmission.push(literal)
    else reachable.push({ code: literal, kind: hit.kind, line: hit.line, position_arg: hit.arg.slice(0, 80) })
  }
  let notInRow = []
  let rowPresent = false
  if (registrySource !== null && registryRowPrefix !== null) {
    const row = String(registrySource).split('\n').find((line) => line.startsWith(registryRowPrefix))
    rowPresent = row !== undefined
    if (rowPresent) notInRow = declared.filter((literal) => !row.includes(literal))
  }
  return {
    table_ok: table.ok,
    table_why: table.why,
    table_shape: table.shape,
    declared,
    reachable: reachable.map((item) => item.code),
    reachable_sites: reachable,
    no_emission: noEmission,
    sites: sites.length,
    skipped,
    not_in_row: notInRow,
    row_present: rowPresent,
    scope_note: 'no_emission: [] 只说明"没有找到缺码位的字面发射点"，不等于"每个码都发得出来"：'
      + '死代码 / 走不到的分支照样算（语法面，不是可达性分析）；码位是变量 / 模板串 / map 查表时看不见（会误红，不会假绿）',
  }
}
