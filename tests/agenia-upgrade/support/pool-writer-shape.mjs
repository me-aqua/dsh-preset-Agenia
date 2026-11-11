/**
 * **池子 / 已判索引的写盘纪律**（`lib/proposals.mjs` 的结构判据）—— 三条：
 *
 *   ① `PWL-MKDIR-OUTSIDE-LOCK`：`lib/proposals.mjs` 里**不许有 `mkdirSync`**。
 *      「锁覆盖建目录」是那一份文件自己声明的口径：建目录的两处都在 `atomic.mjs` 里
 *      （`acquireLock` 建锁文件、`writeFileAtomic` 建父目录），建不出来都返回 `E_TXN_IO`；
 *      锁外自己那条 `mkdirSync` 抛的是裸 `EACCES` / `EEXIST`，报文不以码开头
 *      ⇒ 与"程序有 bug"同形。`bug-20261110-10`（`appendJudgedRows:146` 在 judged 锁**之前**建目录）
 *      就是这一族；写成"零个 `mkdirSync`"比"猜哪几行在锁里"宽，也更难糊弄过去。
 *   ② `PWL-POOL-WRITE-ELSEWHERE`：**池子那一份文件只能由 `writePoolRowLocked` 写**。
 *      判法按**结构**，不按行（`bug-20261111-01` ①：旧判法要求写调用与 `pool.path` 同一行，
 *      折行或别名即可溜过去）：
 *        · 先找每个写调用（`writeFileAtomic` / `writeFileSync` / `appendFileSync`）的**实参区间**
 *          —— 从它的 `(` 配对到 `)`，跨几行都算同一段；
 *        · 实参区间里出现 `pool.path` / `poolPath(` ⇒ 池写；出现**作用域内被绑到池子路径上的名字**
 *          （`const poolFile = poolPath(root)`，链式的一路解到不动点）⇒ 也算池写；
 *        · 池写所在的函数必须是 `writePoolRowLocked`。
 *      它守的是"三条入口共用一条写路径"（改发号 / 落盘规则只改一处，不会出现两处新旧并存）。
 *      ⚠️ **声明边界**：认的是"名字 = 池子路径"这一类绑定。解构（`const { path } = pool`）、
 *      经函数返回值中转（`const p = readPool(root).path`）、模板字符串里插值 —— **不认**（那三种
 *      形状在真源码里一个都没有）；它们出现那天，这条判据要给它们补分支，而不是被当成"没有池写"。
 *   ③ `PWL-SCAN-BLIND`：**看不见 = 不许当绿**。一份源码里连一个 `poolPath(` / `pool.path` 都没有
 *      ⇒ 说明扫描器读错了文件（或那个文件被搬走了）—— 记一条"瞎了"，不许报 `ok:true`。
 *
 * 🔴 掩码（`maskComments`）：注释、字符串体、**正则字面量**都抹成空白（保留引号 / 换行 / 长度）。
 *    `bug-20261111-01` ②：不认正则字面量时，`/['"]/` 里的引号会被当成字符串的开头 ⇒ 从那一路
 *    吞到文件尾（换行留着、后文全成空白），后文的池写就**看不见**了，而 `pool_target_lines` 又不是 0
 *    ⇒ 静默报绿。所以：
 *      · 认正则字面量（`/` 前面是表达式位置才算；字符类 `[…]` 里不结束；`\x` 转义跳过；
 *        没闭合 / 碰到换行 ⇒ 不认，按除号处理 —— 免得把除号当正则、从另一边吞掉代码）；
 *      · 每吞掉一段正则都记进读数（`regex_literals`），**吞了代码要说得出来**。
 *
 * 🔴 为什么不做成 AST：这个仓库不装 JS 解析器（`node_modules` 不进提交），而一个**半懂**的解析器
 *    会静默漏掉它看不懂的形状。这里只认几件在文本上不可能认错的事（括号配对 / 函数边界 /
 *    在作用域里绑到池子路径上的名字），并且把"我看到了几处、这一段跨了几行、池子路径是怎么认出来的"
 *    一起写进读数（`readings`）—— 少看见一处，读数立刻能对出来。
 */

/**
 * 注释 / 字符串体 / 正则字面量 → 空白（保留引号、换行与长度）。
 * 字符串体也要抹掉：`mkdirSync(` 出现在字符串里不是调用（注释里更不是）—— 不抹会把散文当代码。
 * 正则字面量同理，而且**必须认出来**（见文件头）。
 *
 * @param {string} raw
 * @returns {{masked:string, regex_literals:Array<{line:number, chars:number}>}}
 */
export function maskComments(raw) {
  const out = raw.split('')
  const regexLiterals = []
  let i = 0
  /** 正则只在**表达式位置**开始：前一个"有意义的字符"必须是这些之一（或行首 / 这些关键字之后）。 */
  const canStartRegex = (cp) => cp === null || '=(,:[!&|?{};+-*%<>~^'.includes(cp)
  /** 关键字之后也是表达式位置（`return /x/` / `case /x/:` / `typeof /x/` …）—— 漏了它们就会把
   *  `/['"]/` 里的引号当字符串开头，从那儿吞到文件尾（`bug-20261111-01` ② 的同一个病）。 */
  const REGEX_AFTER_KEYWORD = new Set(['return', 'typeof', 'instanceof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'do', 'else', 'yield', 'await'])
  const isIdent = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
  /** 位置 `at` 之前最后一个非空白字符（换行也算"空"—— 换行之后是表达式位置）。 */
  const prevSignificant = (at) => {
    for (let k = at - 1; k >= 0; k -= 1) {
      const ch = raw[k]
      if (ch === '\n') return null
      if (ch !== ' ' && ch !== '\t' && ch !== '\r') return ch
    }
    return null
  }
  /** `at` 之前的那个词是不是关键字（只认"整词"，`returned` 不算 `return`）。 */
  const afterKeyword = (at) => {
    let end = at
    while (end > 0 && (raw[end - 1] === ' ' || raw[end - 1] === '\t')) end -= 1
    let begin = end
    while (begin > 0 && /[A-Za-z]/.test(raw[begin - 1])) begin -= 1
    if (begin === end) return false
    if (begin > 0 && /[A-Za-z0-9_$]/.test(raw[begin - 1])) return false
    return REGEX_AFTER_KEYWORD.has(raw.slice(begin, end))
  }
  while (i < raw.length) {
    const c = raw[i]
    const n = raw[i + 1]
    if (c === '/' && n === '/') {
      while (i < raw.length && raw[i] !== '\n') { out[i] = ' '; i += 1 }
      continue
    }
    if (c === '/' && n === '*') {
      out[i] = ' '; out[i + 1] = ' '; i += 2
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
        if (raw[i] !== '\n') out[i] = ' '
        i += 1
      }
      if (i < raw.length) { out[i] = ' '; out[i + 1] = ' '; i += 2 }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i += 1
      while (i < raw.length) {
        if (raw[i] === '\\') { out[i] = ' '; if (i + 1 < raw.length && raw[i + 1] !== '\n') out[i + 1] = ' '; i += 2; continue }
        if (raw[i] === quote) { i += 1; break }
        if (raw[i] !== '\n') out[i] = ' '
        i += 1
      }
      continue
    }
    if (c === '/') {
      // 先**探**一遍是不是正则字面量；探不成 ⇒ 原样放行（除号）。
      const start = i
      let k = i + 1
      let inClass = false
      let closed = false
      while (k < raw.length) {
        const ch = raw[k]
        if (ch === '\n') break
        if (ch === '\\') { k += 2; continue }
        if (inClass) {
          if (ch === ']') inClass = false
          k += 1
          continue
        }
        if (ch === '[') { inClass = true; k += 1; continue }
        if (ch === '/') { closed = true; break }
        k += 1
      }
      if (closed && (canStartRegex(prevSignificant(start)) || afterKeyword(start)) && !isIdent(raw[k + 1])) {
        // 吞掉 `/…/` + flags，并记进读数（"这一段是正则，不是代码"）。
        for (let m = start; m <= k; m += 1) { if (raw[m] !== '\n') out[m] = ' ' }
        let f = k + 1
        while (f < raw.length && /[a-z]/.test(raw[f])) { out[f] = ' '; f += 1 }
        i = f
        const line = raw.slice(0, start).split('\n').length
        regexLiterals.push({ line, chars: f - start })
        continue
      }
    }
    i += 1
  }
  return { masked: out.join(''), regex_literals: regexLiterals }
}

/** 顶层 `function` 声明的边界（`{ name, start_line, end_line }`）；按花括号深度收口。 */
export function functionSpans(maskedSource) {
  const lines = maskedSource.split(/\r?\n/)
  const spans = []
  let open = null
  let depth = 0
  let sawOpen = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const decl = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line)
    if (open === null && decl !== null) {
      open = { name: decl[1], start_line: i + 1, end_line: null }
      depth = 0
      sawOpen = false
    }
    if (open !== null) {
      for (const ch of line) {
        if (ch === '{') { depth += 1; sawOpen = true }
        else if (ch === '}') depth -= 1
      }
      // 单行函数也必须在这一行收口（`function f() { … }`）—— 否则它会吞掉后面所有行，
      // 让"在哪个函数里"整片判错（`PWL-01` 的干净样本就是这么被误判的）。
      if (sawOpen && depth <= 0) {
        open.end_line = i + 1
        spans.push(open)
        open = null
        depth = 0
        sawOpen = false
      }
    }
  }
  // 没闭合的那一个（语法坏的源码）也交出去：`end_line` 用最后一行 —— 让判据能点名，而不是静默丢掉。
  if (open !== null) spans.push({ ...open, end_line: lines.length, unterminated: true })
  return spans
}

/** 行号（1 基）→ 所在函数名（不在任何顶层函数里 ⇒ `'(module scope)'`）。 */
function functionAt(spans, line) {
  const hit = spans.find((s) => line >= s.start_line && line <= s.end_line)
  return hit === undefined ? '(module scope)' : hit.name
}

const WRITE_CALL = /\b(?:writeFileAtomic|writeFileSync|appendFileSync)\s*\(/
const POOL_TARGET = /(?:pool\.path|poolPath\s*\()/
/** 赋值语句（`const` / `let` / `var` 可省）：拿它认"这个名字 = 池子路径"。 */
const ASSIGN = /(?:^|[^=!<>])(?:\b(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g
/**
 * **只认"这个名字持有的是池子路径"那一种赋值**：`const p = poolPath(root)` / `const p = pool.path` /
 * `const q = p`（纯换名）。**不认**"从池子内容里算出来的东西"（`const lines = text.split(…)`）——
 * 那些名字装的是**内容**不是路径；把它们也算进来会让别名表长成一片森林，
 * 于是任何一个同名变量的写调用都会被误判成池写（判据钉在真源码上，误判就是常驻红）。
 */
const ALIAS_RHS = /^(?:await\s+)?(?:poolPath\s*\(|pool\.path\b|[A-Za-z_$][\w$]*$)/
/** 名字 → 池子路径的绑定（只认 `名字 = 池子路径 / 池子里那个小写别名`）。 */
const boundNames = (masked, spans) => {
  const direct = new Map()
  const deferred = []
  for (const m of masked.matchAll(ASSIGN)) {
    const name = m[1]
    const rhs = (m[2] ?? '').trim()
    const line = masked.slice(0, m.index ?? 0).split('\n').length
    if (!ALIAS_RHS.test(rhs)) continue
    if (POOL_TARGET.test(rhs)) direct.set(name, { line, how: 'expression' })
    else deferred.push({ name, rhs, line })
  }
  // 纯换名链 `const a = poolPath(root); const b = a` —— 解到不动点（只在"整条右值就是一个名字"时传）。
  let grew = true
  while (grew) {
    grew = false
    for (const d of deferred) {
      if (direct.has(d.name)) continue
      if (!/^[A-Za-z_$][\w$]*$/.test(d.rhs)) continue
      const info = direct.get(d.rhs)
      if (info !== undefined) {
        direct.set(d.name, { line: d.line, how: `alias:${d.rhs}`, from: info.line })
        grew = true
      }
    }
  }
  // 作用域：函数里绑的名字只在该函数里算（同名变量在不同函数里不互串）。
  const byScope = new Map()
  for (const [name, info] of direct) {
    const scope = functionAt(spans, info.line)
    if (!byScope.has(scope)) byScope.set(scope, new Map())
    byScope.get(scope).set(name, info)
  }
  return { byScope, spans }
}
const aliasInScope = (bindings, scope, name) => {
  const local = bindings.byScope.get(scope)
  if (local !== undefined && local.has(name)) return local.get(name)
  const top = bindings.byScope.get('(module scope)')
  return top !== undefined && top.has(name) ? top.get(name) : null
}

/** 从 `(` 的下标配对到它的 `)`（跨行；认不出 ⇒ `null`）。 */
function argSpanOf(masked, openIndex) {
  let depth = 0
  for (let i = openIndex; i < masked.length; i += 1) {
    const ch = masked[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return { start: openIndex + 1, end: i }
    }
  }
  return null
}

/**
 * 扫一份源码，给出**形状**上的问题（不读盘、不 import）。
 *
 * @param {{source:string, rel?:string}} input
 * @returns {{ok:boolean, rel:string, findings:Array<{code:string,line:number|null,fn:string|null,detail:string}>,
 *            readings:{mkdir_sites:Array, write_sites:Array, pool_target_lines:number, functions:number,
 *                      raw_mkdir_occurrences:number, regex_literals:Array, masked_chars:number,
 *                      raw_chars:number, aliases:Array}}}
 */
export function poolWriterFindings({ source, rel = 'lib/proposals.mjs' } = {}) {
  const raw = typeof source === 'string' ? source : ''
  const mask = maskComments(raw)
  const masked = mask.masked
  const lines = masked.split(/\r?\n/)
  const spans = functionSpans(masked)
  const findings = []
  const mkdirSites = []
  const writeSites = []
  const bindings = boundNames(masked, spans)
  let poolTargetLines = 0

  const lineOfIndex = (index) => masked.slice(0, index).split('\n').length

  // ① 锁外 mkdir：按行扫（`mkdirSync(` 是调用形状，跨行与否不影响"有没有"）。
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const lineNo = i + 1
    if (POOL_TARGET.test(line)) poolTargetLines += 1
    if (/\bmkdirSync\s*\(/.test(line)) {
      const fn = functionAt(spans, lineNo)
      mkdirSites.push({ line: lineNo, fn })
      findings.push({
        code: 'PWL-MKDIR-OUTSIDE-LOCK',
        line: lineNo,
        fn,
        detail: `${rel}:${lineNo}（函数 ${fn}）里有 \`mkdirSync(\` —— 这份文件的口径是"建目录的两处都在 \`atomic.mjs\` 里`
          + '（`acquireLock` 建锁文件、`writeFileAtomic` 建父目录），建不出来都返回 `E_TXN_IO`"；锁外那条抛出的是'
          + '裸 `EACCES`/`EEXIST`，报文不以码开头，与"程序有 bug"同形'
          + '（`bug-20261110-10` 就是这一族：`appendJudgedRows` 在 judged 锁之前建目录）',
      })
    }
  }

  // ② 池写只能出现在 `writePoolRowLocked` 里 —— **按结构**（实参区间 + 作用域内的别名），不按行。
  for (const m of masked.matchAll(new RegExp(WRITE_CALL.source, 'g'))) {
    const nameAt = m.index ?? 0
    const openIndex = masked.indexOf('(', nameAt)
    if (openIndex === -1) continue
    const span = argSpanOf(masked, openIndex)
    const lineNo = lineOfIndex(nameAt)
    const fn = functionAt(spans, lineNo)
    const argsText = span === null ? masked.slice(openIndex + 1) : masked.slice(span.start, span.end)
    const argsLines = span === null ? 1 : masked.slice(nameAt, span.end).split('\n').length
    let poolVia = POOL_TARGET.test(argsText) ? 'inline' : null
    if (poolVia === null) {
      for (const mm of argsText.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
        const hit = aliasInScope(bindings, fn, mm[1])
        if (hit !== null) { poolVia = `alias:${mm[1]}`; break }
      }
    }
    const writesPool = poolVia !== null
    writeSites.push({ line: lineNo, fn, writes_pool: writesPool, pool_via: poolVia, args_lines: argsLines, closed: span !== null })
    if (writesPool && fn !== 'writePoolRowLocked') {
      findings.push({
        code: 'PWL-POOL-WRITE-ELSEWHERE',
        line: lineNo,
        fn,
        detail: `${rel}:${lineNo}（函数 ${fn}）在写**池子那一份文件**（池子路径的认法：${poolVia}；`
          + `这条写调用的实参跨了 ${argsLines} 行），但它不在 \`writePoolRowLocked\` 里 —— `
          + '"三条入口共用一条写路径"被破了：发号 / 判重 / 落盘规则会出现两处新旧并存',
      })
    }
    if (writesPool && span === null) {
      findings.push({
        code: 'PWL-SCAN-BLIND',
        line: lineNo,
        fn,
        detail: `${rel}:${lineNo} 的写调用实参括号没配上 —— 这一条写的到底是不是池子判不了，不许当绿`,
      })
    }
  }
  if (poolTargetLines === 0) {
    findings.push({
      code: 'PWL-SCAN-BLIND',
      line: null,
      fn: null,
      detail: `${rel} 里连一处 \`poolPath(\` / \`pool.path\` 都没有 —— 扫描器读错了文件（或那个文件被搬走了）。`
        + '"什么都没找到"不许当绿',
    })
  }
  for (const s of spans) {
    if (s.unterminated === true) {
      findings.push({ code: 'PWL-SCAN-BLIND', line: s.start_line, fn: s.name, detail: `${rel}:${s.start_line} 的函数 ${s.name} 花括号没闭合 —— 这份源码读不成形状，这一格判不了` })
    }
  }
  const aliases = []
  for (const [scope, map] of bindings.byScope) {
    for (const [name, info] of map) aliases.push({ name, scope, line: info.line, how: info.how })
  }
  return {
    ok: findings.length === 0,
    rel,
    findings,
    readings: {
      rel,
      mkdir_sites: mkdirSites,
      write_sites: writeSites,
      pool_target_lines: poolTargetLines,
      functions: spans.map((s) => s.name),
      raw_mkdir_occurrences: (raw.match(/mkdirSync\s*\(/g) ?? []).length,
      regex_literals: mask.regex_literals,
      aliases,
      masked_chars: masked.length,
      raw_chars: raw.length,
    },
  }
}
