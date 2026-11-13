/**
 * 量具：**三个宿主侧适配器的三处副本**（构案 0008 §⑧「显式例外」· 第 4 关 r1 `MF-4`）。
 *
 * 契约/决定：`.team/test/2026-11-13/CONTRACT-史山清查-B3.md` §1 腿 ⑥ · `决议/构案/0008-install-rollback-公共-helper.md` §⑧。
 *
 * ## 病（这一格为什么存在）
 * `lib/cli-guards.mjs` 里那 8 个 helper 的正文要**逐字内联**进出厂件；出厂件里它们引用的
 * `canonical` / `insideTestScene` / `refuseDelete` 必须解析到**出厂件自己作用域**里那一份
 * （否则出厂件要多带一份依赖）。于是这三个名字在 **模块 + 两支 CLI** 各有一份 —— 共 **3 处**。
 * 原来只有 `CG-FORK-COUNT` 数「两支 CLI 各 1 处」，`lib/cli-guards.mjs` 里那第三份**看不见**：
 * 改共享件里的 `canonical`，出厂件内联块读的还是 rollback 那份，**没有任何判据变红**。
 *
 * ## 判什么（§⑧ 的两条，按可翻面拆成两族）
 *   · **正文族**（`canonical` / `insideTestScene`）：三处**归一之后逐字相同**。
 *   · **字段族**（`refuseDelete`）：三处**同码 · 同 `delete_gate` 投影 · 同 `err.name` 规则**。
 *     ⚠️ `err.name` 按**字面**在三处**不相等**（`CliGuardError` / `InstallCliError` / `RollbackCliError`
 *     —— 各自沿用本文件 `cliError()` 的类名）：今天没有任何消费者读它（评审 §1.2），所以它不是行为差，
 *     是**写法差**。本判据把它**逐处钉死**（`PINNED_ERR_NAMES`）：谁改一处 ⇒ 红并点名那个文件；
 *     要字面相等 ⇒ 改的是这三处 + 这张表（同批），不是把判据放宽。
 *
 * ## 三条口径（写在明处 —— 尺子不说清，读数就不可复现）
 *   ① **份数口径 = 3**：`ADAPTER_PINS`（模块 + 两支 CLI）各**恰好 1 处顶层定义**，合计 **3**。
 *      模块那一份是**三处里的第三处**，不是"第四份"（别把 `CG-FORK-COUNT` 的 2 加它再加一次）。
 *      别的文件里的同名物（今天：`bin/release-scan.mjs` 的 `canonical`）**不在本格**：
 *      它是那份 CLI 自己的路径解析，归 `CG-FORK-COUNT` 那一族；这里只作 `outside_pins` **读数**记下来。
 *   ② **归一 = 词法绑定归一**（不是"看起来差不多"）：剥注释 / 空白之后按 token 比；
 *      `import fs from 'node:fs'` 的 `fs.x` 与 `import { x } from 'node:fs'` 的裸 `x` 是**同一个绑定**
 *      （install 用后者、另两处用前者 ⇒ 今天这两段正文逐字不同、语义相同）。
 *      归一器**只做这一件事**：把每份文件**自己 import 行**里的本地名换成 `模块.原名`；
 *      `.` 后面的属性名不动。正文里出现 `/`（可能是正则字面量）⇒ **拒绝归一**
 *      （`CG-ADAPTER-NORMALIZE`，fail-closed），不许"猜一个差不多"。
 *   ③ **字段族 = 真跑**（`node:vm` 把盘上那段函数正文装起来，喂同一份输入）：
 *      同一 `code` 输入 ⇒ 三处 `err.code` 相同 · 同一 `gate` 对象 ⇒ 三处 `err.delete_gate === gate`
 *      （同一个对象，不是"字段像"）· `err.name` 等于 `PINNED_ERR_NAMES` 里给那一处的值。
 *      静态读代码判不出"投影是不是原样递进来的"，所以这一族用**行为读数**，不用正则猜。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { extractFunctionText } from './atomic-writers.mjs'
import { CLI_PAIR_FILES, SHARED_GUARDS_REL, definitionForms } from './cli-guards-shared.mjs'

/** 三处钉子的顺序：**模块在前**（第三份也要被数进来），再两支 CLI。 */
export const ADAPTER_PINS = Object.freeze([SHARED_GUARDS_REL, ...CLI_PAIR_FILES])

/** 三个宿主侧适配器（§⑧）。 */
export const HOST_ADAPTERS = Object.freeze(['canonical', 'insideTestScene', 'refuseDelete'])

/** 正文族：三处必须归一之后逐字相同。 */
export const TEXT_EQUAL_ADAPTERS = Object.freeze(['canonical', 'insideTestScene'])

/** 字段族：`refuseDelete` 的三格。 */
export const ADAPTER_FIELDS = Object.freeze(['code', 'delete_gate', 'name'])

/**
 * `err.name` 逐处钉死（**字面不相等是记录在案的写法差**，见文件头）。
 * 键 = 相对仓库根的 posix 路径；值 = 那一处 `refuseDelete()` 产出的 `err.name`。
 */
export const PINNED_ERR_NAMES = Object.freeze({
  'presets/agenia/lib/cli-guards.mjs': 'CliGuardError',
  'presets/agenia/bin/install.mjs': 'InstallCliError',
  'presets/agenia/bin/rollback.mjs': 'RollbackCliError',
})

/** 归一尺子（写进读数：谁读这一格都能照着复算）。 */
export const NORMALIZE_RULER = '剥注释与空白 → token 序列；每份文件按**自己 import 行**把本地绑定名换成 `模块.原名`'
  + '（`fs.x` ≡ 裸 `x`）；`.` 后的属性名不动；正文里出现 `/` ⇒ 拒绝归一（fail-closed）'

/** 字段族的探针输入（两条：证明 `code` 跟着入参走，不是写死的）。 */
const FIELD_PROBES = Object.freeze([
  Object.freeze({ code: 'E_ROOT_NO_MARKER', message: '（探针）适配器字段读取 #1' }),
  Object.freeze({ code: 'E_PATH_ESCAPE', message: '（探针）适配器字段读取 #2' }),
])

/** 递归列出 `root` 下的源码（`*.mjs` / `*.js`；不跟 `node_modules`）。 */
function listSourceFiles(root) {
  const out = []
  const walk = (dir) => {
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue
        walk(full)
      } else if (e.isFile() && (e.name.endsWith('.mjs') || e.name.endsWith('.js'))) out.push(full)
    }
  }
  walk(root)
  return out
}

/** 字符偏移 → 行号（1 起）。 */
function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1
  return line
}

/**
 * 这份文件**自己**的绑定表：本地名 → `模块.原名`。
 * 只认 `import … from 'node:xxx'`（内建模块）；相对 import 不归一（跨文件绑定不是这一格的事）。
 */
export function importAliases(text) {
  const aliases = new Map()
  const re = /^\s*import\s+(?:([A-Za-z_$][\w$]*)\s*(?:,\s*)?)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/gm
  let m
  while ((m = re.exec(String(text))) !== null) {
    const [, defaultName, namedRaw, spec] = m
    if (!String(spec).startsWith('node:')) continue
    const prefix = String(spec).slice('node:'.length)
    if (defaultName !== undefined && defaultName !== '') aliases.set(defaultName, prefix)
    if (namedRaw === undefined) continue
    for (const item of namedRaw.split(',')) {
      const piece = item.trim()
      if (piece === '') continue
      const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(piece)
      if (asMatch !== null) aliases.set(asMatch[2], `${prefix}.${asMatch[1]}`)
      else if (/^[A-Za-z_$][\w$]*$/.test(piece)) aliases.set(piece, `${prefix}.${piece}`)
    }
  }
  return aliases
}

/**
 * 源码 → token 序列（剥注释与空白；字符串/模板各算**一个** token）。
 * 这里不认正则字面量 —— 调用方会先看 `slash_tokens`，有 `/` 就拒绝归一（fail-closed）。
 */
export function tokenize(source) {
  const s = String(source)
  const tokens = []
  let i = 0
  const n = s.length
  const isIdentStart = (c) => /[A-Za-z_$]/.test(c)
  const isIdentPart = (c) => /[A-Za-z0-9_$]/.test(c)
  while (i < n) {
    const c = s[i]
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i += 1; continue }
    if (c === '/' && s[i + 1] === '/') {
      while (i < n && s[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && s[i + 1] === '*') {
      i += 2
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const start = i
      i += 1
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue }
        if (s[i] === c) { i += 1; break }
        i += 1
      }
      tokens.push({ kind: 'string', text: s.slice(start, i) })
      continue
    }
    if (isIdentStart(c)) {
      const start = i
      while (i < n && isIdentPart(s[i])) i += 1
      tokens.push({ kind: 'ident', text: s.slice(start, i) })
      continue
    }
    if (/[0-9]/.test(c)) {
      const start = i
      while (i < n && /[0-9A-Za-z_.]/.test(s[i])) i += 1
      tokens.push({ kind: 'number', text: s.slice(start, i) })
      continue
    }
    tokens.push({ kind: 'punct', text: c })
    i += 1
  }
  return tokens
}

/**
 * 归一：token 序列 + 绑定表。规则见 `NORMALIZE_RULER`；
 * `.` 之后的标识符是**属性名**，不查绑定表。
 */
export function normalizeTokens(source, aliases = new Map()) {
  const raw = tokenize(source)
  const out = []
  for (let i = 0; i < raw.length; i += 1) {
    const tok = raw[i]
    const prev = i === 0 ? null : raw[i - 1]
    const isProperty = prev !== null && prev.text === '.'
    if (tok.kind === 'ident' && !isProperty && aliases.has(tok.text)) {
      for (const inner of tokenize(aliases.get(tok.text))) out.push(inner)
      continue
    }
    out.push(tok)
  }
  const text = out.map((t) => t.text).join(' ')
  return {
    tokens: out,
    slash_tokens: out.filter((t) => t.kind === 'punct' && t.text === '/').length,
    string_tokens: out.filter((t) => t.kind === 'string').length,
    text,
    digest: createHash('sha256').update(out.map((t) => t.text).join('\u0001'), 'utf8').digest('hex'),
  }
}

/** 顶层定义计数（形状表复用 `cli-guards-shared.mjs::definitionForms`；列 0 才算顶层）。 */
function topLevelDefinitions(text, name) {
  const hits = []
  const lines = String(text).split(/\r?\n/)
  for (const form of definitionForms(name)) {
    const re = new RegExp(form.re.source, 'g')
    let m
    while ((m = re.exec(text)) !== null) {
      const line = lineOf(text, m.index)
      if (/^[ \t]/.test(lines[line - 1] ?? '')) continue
      if (hits.some((h) => h.line === line)) continue
      hits.push({ line, kind: form.kind })
    }
  }
  return hits.sort((a, b) => a.line - b.line)
}

/**
 * 在受限上下文里把盘上那段函数正文装起来，返回**函数**或 `{fn:null, why}`。
 * 依赖（`cliError` / `gateReport`）由调用方塞进同一个上下文 —— 与 `dash-client-harness.mjs` 同一手法。
 */
function compileInContext(context, text, name, filename) {
  const fn = extractFunctionText(String(text), name)
  if (fn === null) return { fn: null, why: `抠不出 \`${name}\` 那一整段定义` }
  try {
    const compiled = vm.runInContext(`(${fn.text})`, context, { filename, timeout: 2000 })
    if (typeof compiled !== 'function') return { fn: null, why: `\`${name}\` 那一段不是函数（${typeof compiled}）` }
    return { fn: compiled, why: null, line: fn.line }
  } catch (err) {
    return { fn: null, why: `装不起来（${err?.name ?? 'Error'}: ${String(err?.message ?? err).slice(0, 200)}）` }
  }
}

/** `refuseDelete` 的字段读数：三处各喂同一份输入，记 `code` / `delete_gate` 身份 / `err.name`。 */
function probeRefuseDelete(texts, readErrors) {
  const rows = []
  for (const rel of ADAPTER_PINS) {
    const text = texts[rel]
    if (text === null) {
      rows.push({ file: rel, ok: false, why: '读不到这一份文件', line: null, probes: [] })
      continue
    }
    const context = vm.createContext({})
    // 依赖：本文件自己的 `cliError()`（install / rollback 有；模块那份只 new Error）。
    const cliError = compileInContext(context, text, 'cliError', rel)
    if (rel !== SHARED_GUARDS_REL && cliError.fn === null) {
      rows.push({ file: rel, ok: false, why: `拿不到本文件的 \`cliError()\`：${cliError.why}`, line: null, probes: [] })
      continue
    }
    if (cliError.fn !== null) context.cliError = cliError.fn
    // install 那一支的兜底分支要 `gateReport`：探针永远递 gate ⇒ 它一旦被调用就是语义变了，炸出来。
    context.gateReport = () => { throw new Error('探针：`gate` 已经给了，`gateReport()` 不该被调用') }
    const compiled = compileInContext(context, text, 'refuseDelete', rel)
    if (compiled.fn === null) {
      rows.push({ file: rel, ok: false, why: compiled.why, line: null, probes: [] })
      continue
    }
    const probes = []
    for (const probe of FIELD_PROBES) {
      const gate = { probe: probe.code, allowedRoots: ['（探针）允许根'], marker: '.agenia-test-root', resolved: 'E:/probe', verdict: 'deny' }
      let out
      try {
        const err = compiled.fn({ code: probe.code, message: probe.message, gate })
        out = {
          input_code: probe.code,
          err_code: typeof err?.code === 'string' ? err.code : null,
          err_name: typeof err?.name === 'string' ? err.name : null,
          delete_gate_is_input: err?.delete_gate === gate,
          delete_gate_type: err?.delete_gate === null ? 'null' : typeof err?.delete_gate,
          err_is_error: err instanceof Error,
        }
      } catch (err) {
        out = { input_code: probe.code, threw: `${err?.name ?? 'Error'}: ${String(err?.message ?? err).slice(0, 200)}` }
      }
      probes.push(out)
    }
    rows.push({ file: rel, ok: true, why: null, line: compiled.line, probes })
  }
  return rows
}

/**
 * 三处副本 × 3 个名字的读数（**只读盘，不写盘**；`root` 可注入 ⇒ 刀在 scratch 树上跑同一份量具）。
 *
 * @param {{root: string}} input
 */
export function scanHostAdapters({ root }) {
  const base = path.resolve(root)
  const reading = {
    root: base,
    pins: [...ADAPTER_PINS],
    files: {},
    normalize: { ruler: NORMALIZE_RULER, aliases: {} },
    per_name: {},
    outside_pins: [],
    read_errors: [],
    line: '',
  }
  const texts = {}
  for (const rel of ADAPTER_PINS) {
    const abs = path.join(base, ...rel.split('/'))
    if (!existsSync(abs)) {
      reading.files[rel] = { exists: false }
      texts[rel] = null
      continue
    }
    try {
      const text = readFileSync(abs, 'utf8')
      texts[rel] = text
      reading.files[rel] = {
        exists: true,
        bytes: Buffer.byteLength(text, 'utf8'),
        chars: text.length,
        lf_lines: text.split('\n').length,
      }
      reading.normalize.aliases[rel] = Object.fromEntries(importAliases(text))
    } catch (err) {
      texts[rel] = null
      reading.files[rel] = { exists: true, read_error: String(err?.code ?? err?.name ?? 'E_READ') }
      reading.read_errors.push({ file: rel, code: String(err?.code ?? err?.name ?? 'E_READ') })
    }
  }
  // ── 每个名字：三处各几处定义 / 归一副本 / 归一之后的比较 ────────────────────
  for (const name of HOST_ADAPTERS) {
    const copies = []
    for (const rel of ADAPTER_PINS) {
      const text = texts[rel]
      if (text === null) {
        copies.push({ file: rel, found: false, definitions: 0, line: null, digest: null, text_tokens: 0 })
        continue
      }
      const defs = topLevelDefinitions(text, name)
      const fn = extractFunctionText(text, name)
      const aliases = importAliases(text)
      const norm = fn === null ? null : normalizeTokens(fn.text, aliases)
      copies.push({
        file: rel,
        found: fn !== null,
        definitions: defs.length,
        definition_lines: defs.map((d) => d.line),
        line: fn === null ? null : fn.line,
        digest: norm === null ? null : norm.digest,
        text_tokens: norm === null ? 0 : norm.tokens.length,
        slash_tokens: norm === null ? null : norm.slash_tokens,
        string_tokens: norm === null ? null : norm.string_tokens,
      })
    }
    const found = copies.filter((c) => c.found)
    const row = {
      name,
      role: TEXT_EQUAL_ADAPTERS.includes(name) ? 'text-equal' : 'field-equal',
      copies,
      copy_count: copies.reduce((sum, c) => sum + c.definitions, 0),
      pinned_files_present: found.length,
    }
    if (row.role === 'text-equal') {
      const digests = found.map((c) => c.digest)
      const equal = found.length === ADAPTER_PINS.length && digests.every((d) => d === digests[0])
      row.text_equal = equal
      row.first_difference = null
      row.majority_files = []
      row.differing_files = []
      if (!equal) {
        /**
         * "谁是少数派"要先判：三处里有两处同文时，**剩下的那一处**才是改过的那一份。
         * 不判就会写成"模块 != install"，读的人会去查没错的那一个文件。
         */
        const tally = new Map()
        for (const copy of found) tally.set(copy.digest, (tally.get(copy.digest) ?? 0) + 1)
        const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        const majorityDigest = ranked[0]?.[0] ?? null
        row.majority_files = found.filter((c) => c.digest === majorityDigest).map((c) => c.file)
        row.differing_files = found.filter((c) => c.digest !== majorityDigest).map((c) => c.file)
        const ref = found.find((c) => c.digest === majorityDigest) ?? found[0]
        const odd = found.find((c) => c.digest !== majorityDigest) ?? found.find((c) => c.file !== ref.file) ?? null
        if (ref !== undefined && odd !== null && odd !== undefined) {
          const tokensOf = (copy) => normalizeTokens(extractFunctionText(texts[copy.file], name).text, importAliases(texts[copy.file])).tokens
          const leftTokens = tokensOf(ref)
          const rightTokens = tokensOf(odd)
          const max = Math.max(leftTokens.length, rightTokens.length)
          for (let i = 0; i < max; i += 1) {
            const a = leftTokens[i]?.text ?? null
            const b = rightTokens[i]?.text ?? null
            if (a !== b) {
              row.first_difference = {
                token_index: i,
                left: { file: ref.file, token: a, context: leftTokens.slice(Math.max(0, i - 4), i + 5).map((t) => t.text).join(' ') },
                right: { file: odd.file, token: b, context: rightTokens.slice(Math.max(0, i - 4), i + 5).map((t) => t.text).join(' ') },
              }
              break
            }
          }
        }
      }
    } else {
      row.probe_rows = probeRefuseDelete(texts, reading.read_errors)
      const okRows = row.probe_rows.filter((r) => r.ok)
      row.field_equal = {
        code: okRows.length === ADAPTER_PINS.length && okRows.every((r) => r.probes.every((p) => p.err_code === p.input_code)),
        delete_gate: okRows.length === ADAPTER_PINS.length && okRows.every((r) => r.probes.every((p) => p.delete_gate_is_input === true)),
      }
      row.names = Object.fromEntries(okRows.map((r) => [r.file, r.probes.map((p) => p.err_name ?? null)]))
      row.pinned_names = { ...PINNED_ERR_NAMES }
      row.names_literal_equal = new Set(okRows.map((r) => r.probes[0]?.err_name ?? null)).size === 1
      row.names_match_pins = okRows.length === ADAPTER_PINS.length
        && okRows.every((r) => r.probes.every((p) => p.err_name === PINNED_ERR_NAMES[r.file]))
    }
    reading.per_name[name] = row
  }
  // ── 钉子之外的同名物（读数，不是这一格的判据）────────────────────────────────
  const scanRoot = path.join(base, 'presets')
  for (const file of listSourceFiles(scanRoot)) {
    const rel = path.relative(base, file).replace(/\\/g, '/')
    if (ADAPTER_PINS.includes(rel)) continue
    let text = null
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const name of HOST_ADAPTERS) {
      for (const def of topLevelDefinitions(text, name)) {
        reading.outside_pins.push({ name, file: rel, line: def.line })
      }
    }
  }
  const where = (row) => row.copies.map((c) => `${c.file}:${c.line ?? '（没有）'}${c.definitions === 1 ? '' : `[${c.definitions} 处]`}`).join(' · ')
  reading.line = `宿主侧适配器（0008 §⑧）· ${HOST_ADAPTERS.map((n) => {
    const row = reading.per_name[n]
    if (row.role === 'text-equal') return `${n} ${row.text_equal ? '三处归一同文' : `**不同文**（${row.copies.filter((c) => c.found).length}/${ADAPTER_PINS.length} 处可读）`}`
    const cells = row.field_equal === undefined ? '判不了' : `码 ${row.field_equal.code ? '同' : '**不同**'} / delete_gate ${row.field_equal.delete_gate ? '同' : '**不同**'} / err.name ${row.names_match_pins ? '逐处对上钉子' : '**偏离钉子**'}${row.names_literal_equal ? '' : '（字面三处不同，见 PINNED_ERR_NAMES）'}`
    return `${n} ${cells}`
  }).join(' | ')} · 份数 ${HOST_ADAPTERS.map((n) => `${n}=${reading.per_name[n].copy_count}`).join(' / ')} · 钉子外同名物 ${reading.outside_pins.length} 处`
  return reading
}

/**
 * 判词。每一条红都**点名文件**（`file:line`），并能指到 §⑧ 的哪一条。
 *
 * @param {ReturnType<typeof scanHostAdapters>} reading
 */
export function hostAdapterVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  for (const e of reading.read_errors) push('CG-ADAPTER-READ', `读不动一份钉子文件（${e.code}）：${e.file}`, e)
  for (const name of HOST_ADAPTERS) {
    const row = reading.per_name[name]
    if (row === undefined) {
      push('CG-ADAPTER-PIN', `\`${name}\` 这一格没有读数 —— 量具没跑出这一行`)
      continue
    }
    for (const copy of row.copies) {
      if (!copy.found) {
        push('CG-ADAPTER-MISSING',
          `\`${name}\` 在钉子上那一份里找不到定义：${copy.file}${reading.files[copy.file]?.exists === false ? '（整份文件不在）' : ''}`
          + ` —— 0008 §⑧ 钉的三处是 ${reading.pins.join(' / ')}；少一处 ⇒ 内联块的词法绑定没有着落`)
      } else if (copy.definitions !== 1) {
        push('CG-ADAPTER-COPIES',
          `\`${name}\` 在 ${copy.file} 里有 **${copy.definitions}** 处顶层定义（要恰好 1 处：${copy.definition_lines.join(' / ')}）`
          + ` —— 三处钉子里又多了一份，第三份会变成第四份`)
      }
      if (copy.slash_tokens !== null && copy.slash_tokens > 0) {
        push('CG-ADAPTER-NORMALIZE',
          `\`${name}\` 在 ${copy.file} 的正文里出现 \`/\`（可能是正则字面量）⇒ 归一器拒绝猜绑定表`
          + `（${NORMALIZE_RULER}）；要判这一段，先把归一器扩到认正则字面量`)
      }
    }
    if (row.copy_count !== ADAPTER_PINS.length) {
      push('CG-ADAPTER-COPIES',
        `\`${name}\` 在三处钉子上的定义总数是 **${row.copy_count}**，不是 ${ADAPTER_PINS.length}`
        + `（${row.copies.map((c) => `${c.file}:${c.definitions}`).join(' · ')}）—— 模块那一份是**第三处**，不是第四份；`
        + `少 / 多都说明这一格的份数口径被改过`)
    }
    if (row.role === 'text-equal') {
      if (row.text_equal !== true) {
        const diff = row.first_difference
        push('CG-ADAPTER-TEXT',
          `\`${name}\` 三处归一之后**不是同一段正文**（0008 §⑧：canonical / insideTestScene 三处逐字相同）`
          + (diff === null
            ? `：可读的只有 ${row.copies.filter((c) => c.found).length}/${ADAPTER_PINS.length} 处`
            : `：第 ${diff.token_index} 个 token —— ${diff.left.file} 是 \`${diff.left.token}\`（…${diff.left.context}…），`
              + `${diff.right.file} 是 \`${diff.right.token}\`（…${diff.right.context}…）`),
          row.first_difference)
      }
      continue
    }
    // 字段族（refuseDelete）：三格分开判，**每格每文件一条**（两条探针只取第一条失败做证据，不刷屏）。
    const badRows = row.probe_rows.filter((r) => !r.ok)
    for (const bad of badRows) {
      push('CG-ADAPTER-PROBE', `\`refuseDelete\` 的字段探针在 ${bad.file} 上建不起来：${bad.why}`
        + ' —— 判不了就不许算绿（同格的三处必须都能真跑一次）')
    }
    const threwFiles = []
    const cellFailures = { code: new Map(), delete_gate: new Map(), name: new Map() }
    for (const probeRow of row.probe_rows.filter((r) => r.ok)) {
      for (const p of probeRow.probes) {
        if (p.threw !== undefined) {
          if (!threwFiles.includes(probeRow.file)) threwFiles.push(probeRow.file)
          continue
        }
        if (p.err_code !== p.input_code && !cellFailures.code.has(probeRow.file)) cellFailures.code.set(probeRow.file, p)
        if (p.delete_gate_is_input !== true && !cellFailures.delete_gate.has(probeRow.file)) cellFailures.delete_gate.set(probeRow.file, p)
        if (p.err_name !== PINNED_ERR_NAMES[probeRow.file] && !cellFailures.name.has(probeRow.file)) cellFailures.name.set(probeRow.file, p)
      }
    }
    for (const file of threwFiles) {
      push('CG-ADAPTER-PROBE', `\`refuseDelete\` 在 ${file} 上一调用就抛 —— 探针输入是合法形状，抛就是语义变了`)
    }
    for (const [file, p] of cellFailures.code) {
      push('CG-ADAPTER-CODE',
        `${file} 的 \`refuseDelete\` 没把入参 \`code\` 原样投影到 \`err.code\`：`
        + `入参 \`${p.input_code}\` ⇒ 实得 \`${p.err_code}\`（§⑧：三处同码）`)
    }
    for (const [file, p] of cellFailures.delete_gate) {
      push('CG-ADAPTER-GATE',
        `${file} 的 \`refuseDelete\` 没有把调用方给的 \`gate\` **原样**放进 \`err.delete_gate\`：`
        + `实得 ${p.delete_gate_type}（§⑧：三处同 delete_gate 字段；内联块永远把 gate 递进来）`)
    }
    for (const [file, p] of cellFailures.name) {
      push('CG-ADAPTER-NAME',
        `${file} 的 \`refuseDelete\` 产出的 \`err.name\` 是 ${JSON.stringify(p.err_name)}，`
        + `钉子是 ${JSON.stringify(PINNED_ERR_NAMES[file])}（§⑧：三处同 err.name **规则**；字面差异逐处钉在这张表里 —— `
        + `改一处就要同批改 PINNED_ERR_NAMES，不许静默漂）`)
    }
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}
