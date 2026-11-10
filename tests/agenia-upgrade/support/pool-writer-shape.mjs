/**
 * **池子 / 已判索引的写盘纪律**（`lib/proposals.mjs` 的结构判据）—— 三条，全部是**文本形状**：
 *
 *   ① `PWL-MKDIR-OUTSIDE-LOCK`：`lib/proposals.mjs` 里**不许有 `mkdirSync`**。
 *      「锁覆盖建目录」是那一份文件自己声明的口径：目录由 `writeFileAtomic` 在**调用方持有的锁里**建
 *      （建不出来返回 `E_TXN_IO`）；锁外那条 `mkdirSync` 抛的是裸 `EACCES` / `EEXIST`，报文不以码开头
 *      ⇒ 与"程序有 bug"同形。`bug-20261110-10`（`appendJudgedRows:146` 在 judged 锁**之前**建目录）
 *      就是这一族；写成"零个 `mkdirSync`"比"猜哪几行在锁里"宽，也更难糊弄过去。
 *   ② `PWL-POOL-WRITE-ELSEWHERE`：**池子那一份文件只能由 `writePoolRowLocked` 写**。
 *      判法：模块里每个写调用（`writeFileAtomic` / `writeFileSync` / `appendFileSync`）的实参里
 *      出现 `pool.path` / `poolPath(` ⇒ 它所在的函数必须是 `writePoolRowLocked`。
 *      它守的是"三条入口共用一条写路径"（改发号 / 落盘规则只改一处，不会出现两处新旧并存）。
 *   ③ `PWL-SCAN-BLIND`：**看不见 = 不许当绿**。一份源码里连一个 `poolPath(` / `pool.path` 都没有
 *      ⇒ 说明扫描器读错了文件（或那个文件被搬走了）—— 记一条"瞎了"，不许报 `ok:true`。
 *
 * 🔴 为什么是文本而不是 AST：这个仓库不装 JS 解析器（`node_modules` 不进提交），而一个**半懂**的
 *    解析器会静默漏掉它看不懂的形状。这里只认三件**在文本上不可能认错**的事，并且把"我看到了几处"
 *    一起写进读数（`sites`）—— 少看见一处，读数立刻能对出来。
 *
 * 🔴 刀：`PWL-01` 用三份**合成源码**各切一刀（锁外 mkdir / 池写跑到别的函数 / 空扫描），
 *    期望"只有对应的那一条码出现"；再用真 `lib/proposals.mjs` 跑一次（真读数）。
 */

/**
 * 注释与**字符串体** → 空白（保留引号、换行与长度）。
 * 字符串体也要抹掉：`mkdirSync(` 出现在字符串里不是调用（注释里更不是）—— 不抹会把散文当代码。
 */
function maskComments(raw) {
  const out = raw.split('')
  let i = 0
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
    i += 1
  }
  return out.join('')
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

/**
 * 扫一份源码，给出**形状**上的问题（不读盘、不 import）。
 *
 * @param {{source:string, rel?:string}} input
 * @returns {{ok:boolean, rel:string, findings:Array<{code:string,line:number|null,fn:string|null,detail:string}>,
 *            readings:{mkdir_sites:Array, write_sites:Array, pool_target_lines:number, functions:number,
 *                      raw_mkdir_occurrences:number}}}
 */
export function poolWriterFindings({ source, rel = 'lib/proposals.mjs' } = {}) {
  const raw = typeof source === 'string' ? source : ''
  const masked = maskComments(raw)
  const lines = masked.split(/\r?\n/)
  const spans = functionSpans(masked)
  const findings = []
  const mkdirSites = []
  const writeSites = []
  let poolTargetLines = 0

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
        detail: `${rel}:${lineNo}（函数 ${fn}）里有 \`mkdirSync(\` —— 这份文件的口径是"目录由 \`writeFileAtomic\` 在调用方持有的锁里建"`
          + '（建不出来返回 `E_TXN_IO`）；锁外那条抛出的是裸 `EACCES`/`EEXIST`，报文不以码开头，与"程序有 bug"同形'
          + '（`bug-20261110-10` 就是这一族：`appendJudgedRows` 在 judged 锁之前建目录）',
      })
    }
    if (WRITE_CALL.test(line)) {
      const fn = functionAt(spans, lineNo)
      const writesPool = POOL_TARGET.test(line)
      writeSites.push({ line: lineNo, fn, writes_pool: writesPool })
      if (writesPool && fn !== 'writePoolRowLocked') {
        findings.push({
          code: 'PWL-POOL-WRITE-ELSEWHERE',
          line: lineNo,
          fn,
          detail: `${rel}:${lineNo}（函数 ${fn}）在写**池子那一份文件**，但它不在 \`writePoolRowLocked\` 里 —— `
            + '"三条入口共用一条写路径"被破了：发号 / 判重 / 落盘规则会出现两处新旧并存',
        })
      }
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
      masked_chars: masked.length,
      raw_chars: raw.length,
    },
  }
}
