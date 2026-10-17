/**
 * F-56 判据本体 —— **「每个调用点必须配对一次转发」+「每个出口必须自带 progress」**。
 *
 * 📌 **口径同源**：本文件是从 `.team/test/2026-10-17/F-56/f56-forward-count.cases.mjs`
 *   （测试岗的参照实现，条款见 `F-56-契约.md`）**抄**过来的纯函数部分。
 *   🔴 **不 import 它**，因为它住在 `.team/` 里 —— 那份目录**不进 git**，发出去之后不存在。
 *   ⚠️ **改口径要两边同批改**（抄本与参照实现的语义必须一致，否则"用哪份算"就成了新问题）。
 *
 * 为什么不用简单正则（第 2 关用读数证的，不是推断）：
 *   · 单行 `/return \{ status:/` 只数到 **5** —— 漏掉多行的 `HOLD` 出口；
 *   · 整份源码数 `\bstatus:` 数到 **9** —— 多算进 `buildHealthCard`，会造假红；
 *   · 整份源码数 `\breturn\b` 数到 **16**。
 *   ⇒ 必须**剥注释** + **先抠出 `healthVerdict` 的函数体**再数。
 *   🔴 剥注释是**判据的语义前提**，不是"更聪明的正则"：A2 的造法就是「把那行注释掉」，
 *     不剥注释的话 `// progress: verdict.progress` 照样被数成转发点 ⇒ A2 永远红不了。
 *
 * 判据 = **全部 problems 为空**。量空也算红（`F56-NO-EXITS` / `F56-NO-CALLS` / `F56-BIN-EMPTY`），
 * 否则正则一断就静默通过。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// 契约常量
// ─────────────────────────────────────────────────────────────────────────────

/** 判定住在哪儿（出口就在这个函数里）。 */
export const CRITERION = Object.freeze({
  id: 'f56-forwards-bound',
  version: 1,
  libRel: 'presets/agenia/lib/health.mjs',
  binRel: 'presets/agenia/bin',
  fnName: 'healthVerdict',
})

/**
 * 「不需要转发」的白名单 —— **现在必须是空的**。
 *
 * · 它**只**用来登记「调了 `healthVerdict` 但确实没法/不必转发 `progress`」的**入口文件**；
 * · 加一个**转发了的**新入口 ⇒ 判据仍然绿，**不用动这里**；
 * · 每项必须形如 `{ path: 'presets/agenia/bin/xxx.mjs', reason: '<非空的人话>' }`：
 *   没有 reason ⇒ `F56-WHITELIST-NO-REASON`；登记了但那个文件根本没调 `healthVerdict` ⇒ `F56-WHITELIST-STALE`；
 * · 每次跑都会把「白名单生效了几项」打出来 —— 它变长，读的人第一眼就看得见。
 */
export const NO_FORWARD_NEEDED = Object.freeze([])

// ─────────────────────────────────────────────────────────────────────────────
// 源码工具（剥注释 · 配括号 · 抠函数体 · 抠返回表达式 · 顶层键）
// ─────────────────────────────────────────────────────────────────────────────

/** 剥掉 `//` 与 `/* *\/` 注释；字符串/模板字面量里的一律不剥。 */
export function stripComments(src) {
  const chars = src.split('')
  const n = chars.length
  let i = 0
  while (i < n) {
    const c = chars[i]
    const d = chars[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && chars[i] !== '\n') { chars[i] = ' '; i += 1 }
      continue
    }
    if (c === '/' && d === '*') {
      chars[i] = ' '; chars[i + 1] = ' '; i += 2
      while (i < n && !(chars[i] === '*' && chars[i + 1] === '/')) {
        if (chars[i] !== '\n') chars[i] = ' '
        i += 1
      }
      if (i < n) { chars[i] = ' '; chars[i + 1] = ' '; i += 2 }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i += 1
      while (i < n) {
        if (chars[i] === '\\') { i += 2; continue }
        if (chars[i] === quote) { i += 1; break }
        if (chars[i] === '\n' && quote !== '`') break // 未闭合的普通字符串：不吞后文
        i += 1
      }
      continue
    }
    i += 1
  }
  return chars.join('')
}

const lineOf = (code, index) => code.slice(0, index).split('\n').length

/** 从左花括号走到配对的右花括号（认字符串，跳过里面的括号）。 */
function matchBrace(code, openIndex) {
  let depth = 0
  for (let i = openIndex; i < code.length; i += 1) {
    const c = code[i]
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i += 1
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue }
        if (code[i] === quote) break
        i += 1
      }
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 找到某个函数声明的**函数体**（`{` 的偏移 ~ `}` 的偏移）。 */
function findFunctionBody(code, name) {
  const re = new RegExp(`\\bfunction\\s+${name}\\s*\\(`, 'g')
  const m = re.exec(code)
  if (!m) return null
  let i = code.indexOf('(', m.index)
  let depth = 0
  for (; i < code.length; i += 1) {
    const c = code[i]
    if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) { i += 1; break }
    }
  }
  const open = code.indexOf('{', i)
  if (open < 0) return null
  const close = matchBrace(code, open)
  if (close < 0) return null
  return { open, close }
}

/** 从 `return` 后面抠出返回表达式（对象字面量优先）。 */
function returnExpression(code, fromIndex) {
  let i = fromIndex
  while (i < code.length && /\s/.test(code[i])) i += 1
  const start = i
  if (code[i] === '{') {
    const close = matchBrace(code, i)
    if (close > 0) return { text: code.slice(i, close + 1), start, kind: 'object' }
    return { text: code.slice(i).trim(), start, kind: 'object-unterminated' }
  }
  let depth = 0
  for (; i < code.length; i += 1) {
    const c = code[i]
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i += 1
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue }
        if (code[i] === quote) break
        i += 1
      }
      continue
    }
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break
      depth -= 1
    } else if ((c === ';' || c === '\n') && depth === 0) break
  }
  return { text: code.slice(start, i).trim(), start, kind: 'expression' }
}

/** 对象字面量**第一层**的键 + 有没有用 spread。 */
function topLevelKeys(objectText) {
  const keys = []
  const spreads = []
  let depth = 0
  let i = 0
  const n = objectText.length
  while (i < n) {
    const c = objectText[i]
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i += 1
      while (i < n) {
        if (objectText[i] === '\\') { i += 2; continue }
        if (objectText[i] === quote) break
        i += 1
      }
      i += 1
      continue
    }
    if (c === '{' || c === '[' || c === '(') { depth += 1; i += 1; continue }
    if (c === '}' || c === ']' || c === ')') { depth -= 1; i += 1; continue }
    if (depth === 1 && c === '.' && objectText.slice(i, i + 3) === '...') {
      const m = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(objectText.slice(i))
      spreads.push(m ? m[1] : '(表达式)')
      i += 3
      continue
    }
    if (depth === 1 && /[A-Za-z_$]/.test(c) && (i === 0 || /[{,(\s]/.test(objectText[i - 1]))) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(objectText.slice(i, i + 240))
      if (m) {
        keys.push(m[1])
        i += m[0].length
        continue
      }
    }
    i += 1
  }
  return { keys, spreads }
}

// ─────────────────────────────────────────────────────────────────────────────
// 判据本体
// ─────────────────────────────────────────────────────────────────────────────

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

function binFiles(root) {
  const dir = path.join(root, CRITERION.binRel)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
    .map((f) => path.join(CRITERION.binRel, f).replace(/\\/g, '/'))
}

function analyzeLib(root) {
  const abs = path.join(root, CRITERION.libRel)
  const out = { relPath: CRITERION.libRel, absPath: abs, exists: existsSync(abs), sha256: null, exits: [], problems: [], notes: [] }
  if (!out.exists) {
    out.problems.push({ code: 'F56-LIB-MISSING', path: CRITERION.libRel, detail: `判定模块不在：${abs} —— 判据量不到出口，不许当绿` })
    return out
  }
  out.sha256 = sha256(abs)
  const code = stripComments(readFileSync(abs, 'utf8'))
  const fn = findFunctionBody(code, CRITERION.fnName)
  if (fn === null) {
    out.problems.push({ code: 'F56-FN-MISSING', path: CRITERION.libRel, detail: `找不到 function ${CRITERION.fnName}(…) 的函数体 —— 判据量不到出口，不许当绿` })
    return out
  }
  const bodyStart = fn.open
  const bodyEnd = fn.close
  const returnRe = /\breturn\b/g
  returnRe.lastIndex = bodyStart
  for (;;) {
    const m = returnRe.exec(code)
    if (!m || m.index > bodyEnd) break
    const expr = returnExpression(code, m.index + 'return'.length)
    const line = lineOf(code, m.index)
    if (expr.kind !== 'object') {
      // 不是对象字面量 ⇒ 证明不了它带不带 progress ⇒ fail-closed
      out.exits.push({ index: out.exits.length + 1, line, statusValue: null, hasStatus: false, hasProgress: false, keys: [], spreads: [], kind: expr.kind, text: expr.text.slice(0, 80) })
      continue
    }
    const { keys, spreads } = topLevelKeys(expr.text)
    const hasStatus = keys.includes('status')
    const hasProgress = keys.includes('progress')
    const statusMatch = /(?:^|[{,\s])status\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|([A-Za-z_$][\w$]*))/.exec(expr.text)
    const statusValue = statusMatch ? (statusMatch[1] ?? statusMatch[2] ?? statusMatch[3] ?? `(变量)${statusMatch[4]}`) : null
    out.exits.push({ index: out.exits.length + 1, line, statusValue, hasStatus, hasProgress, keys, spreads, kind: expr.kind, text: expr.text.slice(0, 80) })
  }
  const verdictExits = out.exits.filter((e) => e.hasStatus)
  out.verdictExitCount = verdictExits.length
  out.returnCount = out.exits.length
  // 防御：函数体里若有"带 block 体的箭头函数"，里面的 return 会被算进本函数 —— 出声，不拦
  if (/=>\s*\{/.test(code.slice(bodyStart, bodyEnd))) {
    out.notes.push('函数体里有 `=> {`（block 体的箭头函数）：它内部的 return 会被算成本函数的出口。现在这一版没有这种形状；将来有了要么改写、要么把这条判据改成认 AST。')
  }
  for (const e of out.exits) {
    if (e.hasProgress) continue
    const spreadHint = e.spreads.length > 0 ? `（它用了 spread：${e.spreads.join(', ')} —— 判据证明不了 spread 里有没有 progress）` : ''
    out.problems.push({
      code: 'F56-EXIT-NO-PROGRESS',
      path: CRITERION.libRel,
      line: e.line,
      detail: `${CRITERION.libRel}:${e.line} · ${CRITERION.fnName} 的第 ${e.index} 个出口（status=${e.statusValue ?? '(没有 status 键)'}）返回的对象里**没有 progress 键** —— 没有任何入口能把它转发出去${spreadHint}`,
    })
  }
  return out
}

function analyzeBinFile(root, relPath, whitelist) {
  const abs = path.join(root, relPath)
  const out = { relPath, absPath: abs, sha256: sha256(abs), callSites: [], forwards: [], problems: [] }
  const code = stripComments(readFileSync(abs, 'utf8'))

  const calls = []
  const callRe = new RegExp(`([A-Za-z_$][\\w$]*\\s*\\.\\s*)?${CRITERION.fnName}\\s*\\(`, 'g')
  for (;;) {
    const m = callRe.exec(code)
    if (!m) break
    const line = lineOf(code, m.index)
    const before = code.slice(Math.max(0, m.index - 200), m.index)
    const bound = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before)
    const returned = /\breturn\s*$/.test(before)
    const spread = /\.\.\.\s*$/.test(before)
    calls.push({
      line,
      kind: bound ? 'bound' : returned || spread ? 'returned-whole' : 'unprovable',
      binding: bound ? bound[1] : null,
    })
  }
  out.callSites = calls

  const forwards = []
  const fwdRe = /progress\s*:\s*([A-Za-z_$][\w$]*)\s*\.\s*progress\b/g
  for (;;) {
    const m = fwdRe.exec(code)
    if (!m) break
    forwards.push({ line: lineOf(code, m.index), from: m[1] })
  }
  out.forwards = forwards

  const wl = whitelist.find((w) => w && w.path === relPath)
  // 🔴 **按名字计数配对，不是按"名字集合"**（2026-10-17 评审 R-F56-01）：
  //    同一文件里两个 `const verdict = healthVerdict(…)` + 一处 `progress: verdict.progress`，
  //    拿 Set 去重会算成 **1 个绑定** ⇒ 漏判。而那正是「加了入口没转发」最可能的半修形状
  //    （两个入口的绑定名都叫 `verdict`；不同函数作用域里同名是合法 JS）。
  const boundCount = new Map()
  for (const c of calls) {
    if (c.kind !== 'bound') continue
    boundCount.set(c.binding, (boundCount.get(c.binding) ?? 0) + 1)
  }
  const fwdCount = new Map()
  for (const f of forwards) fwdCount.set(f.from, (fwdCount.get(f.from) ?? 0) + 1)
  const wholeForwarded = calls.filter((c) => c.kind === 'returned-whole').length
  const unprovable = calls.filter((c) => c.kind === 'unprovable')
  const matchedBindings = new Set([...boundCount.keys()].filter((n) => fwdCount.has(n)))
  let unpaired = unprovable.length
  for (const [name, need] of boundCount) {
    const have = fwdCount.get(name) ?? 0
    if (have < need) unpaired += need - have
  }

  for (const c of unprovable) {
    out.problems.push({
      code: 'F56-CALL-UNPROVABLE',
      path: relPath,
      line: c.line,
      detail: `${relPath}:${c.line} 调了 ${CRITERION.fnName}(…) 但结果既没绑到变量、也不是整份转出 —— 判据证明不了这个入口转发了 progress`,
    })
  }
  for (const f of forwards) {
    if (boundCount.has(f.from)) continue
    out.problems.push({
      code: 'F56-FORWARD-ORPHAN',
      path: relPath,
      line: f.line,
      detail: `${relPath}:${f.line} 写了 progress: ${f.from}.progress，但本文件里没有 \`${f.from} = ${CRITERION.fnName}(…)\` —— 转发了一个来历不明的值`,
    })
  }
  if (calls.length > 0 && wl === undefined && unpaired > 0) {
    out.problems.push({
      code: 'F56-CALL-UNPAIRED',
      path: relPath,
      line: calls[0].line,
      detail: `${relPath} 调了 ${CRITERION.fnName}(…) ${calls.length} 次，能证明的转发点 ${matchedBindings.size + wholeForwarded} 处 —— **缺 ${unpaired} 处** \`progress: <verdict>.progress\`：这个入口把判定吐出去了，progress 被吞了`,
    })
  }
  out.whitelisted = calls.length > 0 && wl !== undefined
  out.matchedBindings = matchedBindings.size
  out.wholeForwarded = wholeForwarded
  return out
}

/**
 * 从源码量一遍。**判据 = 全部 problems 为空**。
 * @param {string} root 树根（真树或 `_stage/<case>` 的副本根）
 */
export function analyzeTree(root, options = {}) {
  const whitelist = options.noForwardNeeded ?? NO_FORWARD_NEEDED
  const problems = []
  const notes = []

  // 白名单卫生（空数组 ⇒ 三项检查全过）
  for (const w of whitelist) {
    if (!w || typeof w.path !== 'string' || w.path.trim() === '') {
      problems.push({ code: 'F56-WHITELIST-BADSHAPE', path: '(whitelist)', detail: `白名单项形状不对：${JSON.stringify(w)} —— 要是 { path, reason }` })
      continue
    }
    if (typeof w.reason !== 'string' || w.reason.trim() === '') {
      problems.push({ code: 'F56-WHITELIST-NO-REASON', path: w.path, detail: `白名单登记了 ${w.path} 却没写 reason —— 空理由的白名单就是"静默放行"` })
    }
    if (!existsSync(path.join(root, w.path))) {
      problems.push({ code: 'F56-WHITELIST-STALE', path: w.path, detail: `白名单登记了 ${w.path}，但盘上没这个文件 —— 白名单烂了` })
    }
  }

  const lib = analyzeLib(root)
  problems.push(...lib.problems)
  // 🔴 `lib.notes` 必须在这里收进来（2026-10-17 评审 R-F56-04）：
  //    否则"出声、不静默"这句承诺在发出去的路径上不成立 —— 谁都不会打印它。
  notes.push(...(lib.notes ?? []))

  const files = binFiles(root)
  const binReports = []
  if (files.length === 0) {
    problems.push({ code: 'F56-BIN-EMPTY', path: CRITERION.binRel, detail: `入口目录里一个 .mjs 都没有（${CRITERION.binRel}）—— 判据量到 0 个转发点，0 == 0 会假绿` })
  }
  for (const relPath of files) {
    const r = analyzeBinFile(root, relPath, whitelist)
    problems.push(...r.problems)
    binReports.push(r)
    if (r.whitelisted) notes.push(`白名单生效：${relPath}`)
  }

  // 🔴 白名单腐烂（2026-10-17 评审 R-F56-02）：登记了，但那个文件**根本没调** healthVerdict ⇒ 红。
  //    否则它会从"签字的例外"退化成"永久免检" —— 那个文件以后真加了一个不转发的调用点，会被直接跳过。
  for (const w of whitelist) {
    if (!w || typeof w.path !== 'string') continue
    const hit = binReports.find((r) => r.relPath === w.path)
    if (hit && hit.callSites.length === 0) {
      problems.push({
        code: 'F56-WHITELIST-STALE',
        path: w.path,
        detail: `白名单登记了 ${w.path}，但那个文件**一个 ${CRITERION.fnName}(…) 都没调** —— 白名单是"签字的例外"，不是"永久免检"`,
      })
    }
  }

  const callSites = binReports.reduce((n, r) => n + r.callSites.length, 0)
  const forwards = binReports.reduce((n, r) => n + r.forwards.length, 0)
  const exits = lib.verdictExitCount ?? 0
  const exitsMissingProgress = lib.exits ? lib.exits.filter((e) => !e.hasProgress).length : 0

  // 🔴 自证：量到 0 的两边不许当绿（否则正则一断就静默通过）
  if (lib.exists && exits === 0 && lib.problems.length === 0) {
    problems.push({ code: 'F56-NO-EXITS', path: CRITERION.libRel, detail: `${CRITERION.fnName} 里一个带 status 的出口都没量到 —— 判据量空了，不许当绿` })
  }
  if (files.length > 0 && callSites === 0) {
    problems.push({ code: 'F56-NO-CALLS', path: CRITERION.binRel, detail: `bin/*.mjs 里一个 ${CRITERION.fnName}(…) 调用点都没量到 —— 判据量空了，不许当绿` })
  }

  return {
    criterion: CRITERION.id,
    root,
    ok: problems.length === 0,
    problems,
    notes,
    reading: {
      verdictExits: exits,
      returnsInFn: lib.returnCount ?? 0,
      exitsMissingProgress,
      callSites,
      forwards,
      whitelist: whitelist.length,
      binFiles: files.length,
    },
    lib,
    bin: binReports,
  }
}

/** 一行给人看的读数（体检那条断言就用它）。 */
export function describeReading(report) {
  const r = report.reading
  return `出口 ${r.verdictExits}（缺 progress ${r.exitsMissingProgress}）· 调用点 ${r.callSites} · 转发点 ${r.forwards} · 白名单 ${r.whitelist} · bin 文件 ${r.binFiles}`
}
