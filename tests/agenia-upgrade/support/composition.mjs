/**
 * 组合 / 补丁的**窄口径 YAML 读取器**与派生判据。
 *
 * 为什么自己写：测试**不许有第三方依赖**（派工单），而 `agent.cordis.yml` 与
 * `standard.patch.yml` 都不是标准 JSON。所以这里实现 YAML 的一个**受控子集**，
 * 并且遵守一条硬纪律 ——
 *
 *   🔴 **看不懂就出声，绝不静默跳过。**
 *       `parseYamlSubset()` 把没吃掉的行、认不出的键行全部记进 `warnings`；
 *       `calibrate()` 再拿**活体那两个已知文件**做阳性对照（解析器哑了当场红）。
 *       来历：AGENTS.md 规矩 7 ——"静默失效的检查"和"通过的检查"长得一模一样。
 *
 * 支持的子集（正是这两个文件用到的全部形状）：
 *   块映射 / 块序列 / `- key: value` 起头的序列项 / 单双引号标量 / 纯标量（带 ` #` 尾注释）
 *   / 行内列表 `[a, b]` / 块标量 `|` `|-` `|+` / `!!js` 标签 / 数字与布尔。
 * 不支持（会进 warnings）：锚点 `&`/`*`、多行折叠 `>`、流式映射 `{}`、多文档 `---`。
 */
import path from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { FROZEN } from './env.mjs'

// ── 词法小工具 ─────────────────────────────────────────────────────────────
const isBlank = (l) => l.trim() === ''
const isComment = (l) => l.trimStart().startsWith('#')
const indentOf = (l) => l.length - l.trimStart().length

function skipIgnorable(lines, i) {
  let j = i
  while (j < lines.length && (isBlank(lines[j]) || isComment(lines[j]))) j += 1
  return j
}

const KEY_RE = /^([A-Za-z0-9_$@.\-/]+)\s*:(.*)$/
const isKeyStart = (text) => KEY_RE.test(text.trim())

function stripInlineComment(s) {
  const m = /\s#/.exec(s)
  return (m ? s.slice(0, m.index) : s).trimEnd()
}

function splitInlineList(body) {
  const out = []
  let cur = ''
  let quote = null
  for (const ch of body) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue }
    if (ch === ',') { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim() !== '') out.push(cur)
  return out.map((s) => s.trim()).filter((s) => s !== '')
}

function unquote(s) {
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'")
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  return s
}

function parseScalar(raw) {
  const s = raw.trim()
  if (s === '') return null
  if (s.startsWith('!!js')) return { __yamlTag: '!!js', expr: s.slice(4).trim() }
  if (s.startsWith("'") || s.startsWith('"')) return unquote(s)
  if (s.startsWith('[') && s.endsWith(']')) return splitInlineList(s.slice(1, -1)).map(parseScalar)
  const plain = stripInlineComment(s)
  if (plain === 'true') return true
  if (plain === 'false') return false
  if (plain === 'null' || plain === '~') return null
  if (/^-?\d+$/.test(plain)) return Number(plain)
  if (/^-?\d+\.\d+$/.test(plain)) return Number(plain)
  return plain
}

// ── 递归下降（按缩进）──────────────────────────────────────────────────────
function parseBlock(lines, i, minIndent) {
  const j = skipIgnorable(lines, i)
  if (j >= lines.length) return { value: null, next: i }
  const ind = indentOf(lines[j])
  if (ind < minIndent) return { value: null, next: i }
  const rest = lines[j].slice(ind)
  if (rest === '-' || rest.startsWith('- ')) return parseList(lines, j, ind)
  return parseMap(lines, j, ind, null)
}

function parseList(lines, i, indent) {
  const out = []
  while (true) {
    const j = skipIgnorable(lines, i)
    if (j >= lines.length) { i = j; break }
    const ind = indentOf(lines[j])
    if (ind !== indent) { i = j; break }
    const rest = lines[j].slice(ind)
    if (!(rest === '-' || rest.startsWith('- '))) { i = j; break }
    const inline = rest === '-' ? '' : rest.slice(2)
    i = j + 1
    if (inline.trim() === '') {
      const r = parseBlock(lines, i, indent + 1)
      out.push(r.value)
      i = r.next
    } else if (isKeyStart(inline)) {
      const r = parseMap(lines, i, indent + 2, inline)
      out.push(r.value)
      i = r.next
    } else {
      out.push(parseScalar(inline))
    }
  }
  return { value: out, next: i }
}

/**
 * 解析期的"出声"收集器 —— 单线程同步解析，用模块级变量最省事（`parseYamlSubset` 每次重置）。
 * 它的存在只有一个目的：**认不出的东西必须留下痕迹**，不许静默跳过。
 */
let WARN = []

function parseMap(lines, i, keyIndent, firstInline) {
  const map = new Map()
  let pending = firstInline
  while (true) {
    let text
    if (pending !== null) { text = pending; pending = null } else {
      const j = skipIgnorable(lines, i)
      if (j >= lines.length) { i = j; break }
      const ind = indentOf(lines[j])
      const rest = lines[j].slice(ind)
      if (ind !== keyIndent || rest === '-' || rest.startsWith('- ')) { i = j; break }
      text = rest
      i = j + 1
    }
    const m = KEY_RE.exec(text)
    if (!m) { WARN.push(`parseMap：认不出的键行「${text.slice(0, 120)}」`); continue }
    const key = m[1]
    const rest = m[2].trim()
    if (rest === '') {
      const j = skipIgnorable(lines, i)
      if (j < lines.length && indentOf(lines[j]) > keyIndent) {
        const r = parseBlock(lines, j, keyIndent + 1)
        map.set(key, r.value)
        i = r.next
      } else {
        map.set(key, null)
        i = j
      }
    } else if (/^[|>][-+]?$/.test(rest)) {
      const r = readBlockScalar(lines, i, keyIndent)
      map.set(key, r.value)
      i = r.next
    } else {
      map.set(key, parseScalar(rest))
    }
  }
  return { value: map, next: i }
}

function readBlockScalar(lines, i, keyIndent) {
  const body = []
  let j = i
  let min = Infinity
  while (j < lines.length) {
    const line = lines[j]
    if (isBlank(line)) { body.push(''); j += 1; continue }
    const ind = indentOf(line)
    if (ind <= keyIndent) break
    min = Math.min(min, ind)
    body.push(line)
    j += 1
  }
  while (body.length > 0 && body[body.length - 1] === '') body.pop()
  const text = body.map((l) => (l === '' ? '' : l.slice(min))).join('\n')
  return { value: body.length === 0 ? '' : `${text}\n`, next: j }
}

/** 解析受控子集；`warnings` 非空 ⇒ 这份文本里有它没读懂的东西（调用方必须出声）。 */
export function parseYamlSubset(text, origin = '<memory>') {
  WARN = []
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const { value, next } = parseBlock(lines, 0, 0)
  for (let i = next; i < lines.length; i += 1) {
    if (!isBlank(lines[i]) && !isComment(lines[i])) WARN.push(`未被解析器吃掉的行 ${i + 1}：${lines[i].slice(0, 120)}`)
  }
  return { origin, value, warnings: [...WARN] }
}

// ── 行模型 ─────────────────────────────────────────────────────────────────
/** `- id: …` 的**裸计数**（与生成器同一个正则口径）。 */
export function countIdLines(text) {
  return (String(text).match(/^\s*- id: .+$/gm) ?? []).length
}

/**
 * 通用行收集：块序列里的每个 `id:` 项算一行；组的 `config`（是**列表**时）里的项算子行。
 *
 * ⚠️ 两个都踩过的坑，别改：
 *   ① **不把映射形态的 config 当行** —— `preset-agenia` 的 config 里也有一个 `id: agenia`，
 *      当成行会让"活体 38 行"当场变 39。
 *   ② **但要走进映射形态 config 里那些"列表"** —— 补丁的形状是
 *      `- insert: → [注册行] → config: {plugins: [ …38 行… ]}`；不进去就只能读到 1 行
 *      （第一次跑冒烟就是这个读数：`patch_rows= 1 / 裸计数 39`）。
 */
export function collectRows(node, parentId = null, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectRows(item, parentId, out)
    return out
  }
  if (node instanceof Map) {
    const id = node.get('id')
    if (typeof id === 'string') {
      const row = {
        id,
        parent: parentId,
        name: node.get('name') ?? null,
        disabled: node.get('disabled') ?? null,
        group: node.get('group') ?? null,
        isolate: node.get('isolate') ?? null,
        config: node.get('config') instanceof Map ? node.get('config') : null,
        map: node,
      }
      out.push(row)
      const cfg = node.get('config')
      if (Array.isArray(cfg)) collectRows(cfg, id, out)
      else if (cfg instanceof Map) {
        for (const [, v] of cfg) if (Array.isArray(v)) collectRows(v, id, out)
      }
      return out
    }
    for (const [, v] of node) collectRows(v, parentId, out)
  }
  return out
}

export function parseComposition(text, origin = '<memory>') {
  const doc = parseYamlSubset(text, origin)
  const rows = collectRows(doc.value)
  return { ...doc, rows, ids: rows.map((r) => r.id) }
}

/** 注册行（`name: @deepseek-ai/dsh-agent-preset`）—— oracle 里那一行，做 diff 时要剔掉。 */
export function registrationRows(rows) {
  return rows.filter((r) => r.name === FROZEN.oracle.registrationName)
}

export function capabilityRows(rows) {
  return rows.filter((r) => r.name !== FROZEN.oracle.registrationName)
}

function multiset(items) {
  const m = new Map()
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1)
  return m
}

/** 多重集差：`a` 里有而 `b` 里不够的（含重复计数）。 */
export function multisetDiff(a, b) {
  const A = multiset(a)
  const B = multiset(b)
  const out = []
  for (const [k, n] of A) {
    const miss = n - (B.get(k) ?? 0)
    for (let i = 0; i < miss; i += 1) out.push(k)
  }
  return out.sort()
}

/** disabled 的三态：字面 true / `!!js` 条件 / 没写。 */
export function disabledKind(row) {
  if (row.disabled === true) return 'literal-true'
  if (row.disabled && typeof row.disabled === 'object' && row.disabled.__yamlTag === 'js') return 'js'
  return 'none'
}

export function enabledRows(rows) {
  return rows.filter((r) => disabledKind(r) === 'none')
}

/** config 取值（config 是映射时）。 */
export function cfg(row, key) {
  if (!(row.config instanceof Map)) return undefined
  return row.config.get(key)
}

/** **行自身**的键（`id` / `name` / `disabled` / `group` …）—— 注意与 `cfg()` 不是一层。 */
export function rowGet(row, key) {
  return row.map instanceof Map ? row.map.get(key) : undefined
}

/** Map/数组 → 普通对象（喂给被测纯函数时要的是普通对象，不是 Map）。 */
export function plain(node) {
  if (Array.isArray(node)) return node.map(plain)
  if (node instanceof Map) {
    const out = {}
    for (const [k, v] of node) out[k] = plain(v)
    return out
  }
  return node
}

/**
 * 注册行 config 摊平后的普通对象（形如 `{id, order, plugins:[…]}`）。
 * 这是"组合 config"最字面的读法（`preset-agenia` 那一行的 config）——
 * ⚠️ guard 纯函数 `delegationToolNames(config)` 的入参形状**没有被拍板冻到这一层**
 * （拍板 Q1 只冻了"命名 export 在 inject.js 里"），所以 STAT-05 会按几个候选形状依次试，
 * 并把"哪个形状吃到了"记进证据；这条歧义已报组长。
 */
export function presetConfigOf(rows) {
  const reg = registrationRows(rows)[0]
  if (!reg || !(reg.map.get('config') instanceof Map)) return null
  return plain(reg.map.get('config'))
}

/** 全部**已启用的具名** `@deepseek-ai/dsh-tool-subagent` 实例（提案 §B2.5 ③ G1）。 */
export function enabledDelegations(rows) {
  return enabledRows(rows).filter((r) => r.name === '@deepseek-ai/dsh-tool-subagent')
}

export function delegationToolNames(rows) {
  return enabledDelegations(rows)
    .map((r) => cfg(r, 'toolName') ?? r.id)
    .sort()
}

/** guard 名单 vs 组合枚举的对账（缺的 / 多的）—— 变异测试就是让 `uncovered` 非空。 */
export function guardCoverageProblems(enumerated, guardNames) {
  const e = [...new Set(enumerated)].sort()
  const g = [...new Set(guardNames)].sort()
  return {
    enumerated: e,
    guard: g,
    uncovered: e.filter((n) => !g.includes(n)),
    extra: g.filter((n) => !e.includes(n)),
  }
}

// ── 生成补丁的结构对账（**不 import 生成器**）────────────────────────────────
/**
 * 🔴 为什么不 import `.tools/make-bundle-patch.mjs`：
 *    那个模块在**加载期**就跑 `build()`，而没有 `--check` 时它会
 *    直接 `writeFileSync('presets/agenia/cordis.patch.yml')` ——
 *    import 一次就等于**改活体**（派工单明令禁止）。
 *    所以这里用**结构对账**代替"跑生成器再比文本"：
 *      · 逐行（trim 后）与相对缩进形状必须与组合的顶层行块一一对应 ⇒ 抓陈旧补丁/漏行/改值；
 *      · 注册行恰好一行，且 `name` 正确；
 *      · `persona-injector` 那两处是**绝对路径**（相对路径 ⇒ 那一行 never started ⇒ 整份 broken）。
 */
export function topLevelBlocks(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let cur = null
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (cur !== null) blocks.push(cur)
      cur = [line]
    } else if (cur !== null) cur.push(line)
  }
  if (cur !== null) blocks.push(cur)
  return blocks
    .map((b) => {
      while (b.length > 0 && b[b.length - 1].trim() === '') b.pop()
      return b
    })
    .filter((b) => b.length > 0)
}

function shape(lines) {
  const base = indentOf(lines[0])
  // ⚠️ 空行没有缩进可言：块标量里那句空行在两份文件里的 `indentOf` 都是 0，
  //    直接减 base 会让**每个含空行的块**都对不上（第一次跑冒烟就是这样全红）。
  return lines.map((l) => (l.trim() === '' ? ['', null] : [l.trim(), indentOf(l) - base]))
}

function containsBlock(haystackLines, blockLines) {
  const target = JSON.stringify(shape(blockLines))
  for (let i = 0; i + blockLines.length <= haystackLines.length; i += 1) {
    if (JSON.stringify(shape(haystackLines.slice(i, i + blockLines.length))) === target) return i
  }
  return -1
}

export function patchStructuralProblems(compositionText, patchText) {
  const problems = []
  const compRows = collectRows(parseYamlSubset(compositionText, 'composition').value)
  const patchDoc = parseYamlSubset(patchText, 'patch')
  problems.push(...patchDoc.warnings.map((w) => `补丁解析出声：${w}`))
  const patchRows = collectRows(patchDoc.value)

  const reg = registrationRows(patchRows)
  if (reg.length !== 1) problems.push(`补丁里的注册行应有恰好 1 行（name=${FROZEN.oracle.registrationName}），实得 ${reg.length}`)
  const patchCaps = capabilityRows(patchRows).map((r) => r.id)
  const compIds = compRows.map((r) => r.id)
  const onlyInPatch = multisetDiff(patchCaps, compIds)
  const onlyInComp = multisetDiff(compIds, patchCaps)
  if (onlyInPatch.length > 0) problems.push(`补丁里多出组合没有的 id：${onlyInPatch.join(', ')}（补丁是派生物，必须是组合的函数）`)
  if (onlyInComp.length > 0) problems.push(`组合里有而补丁里没有的 id：${onlyInComp.join(', ')}（改了组合没跑生成器？）`)

  const patchLines = String(patchText).replace(/\r\n/g, '\n').split('\n')
  for (const block of topLevelBlocks(compositionText)) {
    // `persona-injector` 那一块是**唯一**被生成器改写的（行名 → 绝对 URL；插入 contentDir），
    // 所以它不参加"逐行相同"这一条 —— 它由下面那三段精确断言管。
    if (/^- id: persona-injector\s*$/.test(block[0])) continue
    if (containsBlock(patchLines, block) < 0) {
      problems.push(`组合的顶层行块在补丁里找不到逐行对应（首行：${block[0].trim().slice(0, 80)}）`)
    }
  }

  const inj = patchRows.find((r) => r.id === 'persona-injector')
  if (!inj) problems.push('补丁里没有 persona-injector 行')
  else {
    const name = rowGet(inj, 'name')
    const contentDir = cfg(inj, 'contentDir')
    if (typeof name !== 'string' || !/^file:\/\/\/.+\.js$/.test(name)) {
      problems.push(`persona-injector 的行名必须是绝对的 file:/// URL（写相对路径 ⇒ 那一行 never started ⇒ 整份预设 broken）；实得 ${JSON.stringify(name)}`)
    } else {
      const dir = name.replace(/^file:\/\/\//, '').replace(/\/[^/]+$/, '')
      if (!/^[A-Za-z]:\//.test(dir)) problems.push(`persona-injector 行名的目录不是绝对路径：${dir}`)
      else if (dir.toLowerCase() !== FROZEN.patchTargets.injectorDir.toLowerCase()) {
        problems.push(`persona-injector 行名指向 ${dir}，冻结落点是 ${FROZEN.patchTargets.injectorDir}（staging 与活体逐字节对应 ⇒ 补丁必须写**装好之后**那个绝对路径）`)
      }
    }
    if (typeof contentDir !== 'string' || !/^[A-Za-z]:[\\/]/.test(contentDir)) {
      problems.push(`persona-injector 的 contentDir 必须是绝对路径（不写 ⇒ 那些 .md 全读不到而且不报错）；实得 ${JSON.stringify(contentDir)}`)
    } else if (contentDir.replace(/\\/g, '/').toLowerCase() !== FROZEN.patchTargets.injectorDir.toLowerCase()) {
      problems.push(`contentDir=${contentDir}，冻结落点是 ${FROZEN.patchTargets.injectorDir}`)
    }
    // 生成器**只许**改写行名与插入 contentDir —— 注入清单这三样必须与组合逐字相同。
    const compInj = compRows.find((r) => r.id === 'persona-injector')
    for (const key of ['leaderOrder', 'memberOrder', 'officeBound']) {
      const a = JSON.stringify(cfg(compInj, key))
      const b = JSON.stringify(cfg(inj, key))
      if (a !== b) problems.push(`persona-injector 的 ${key} 被改写了：组合 ${a} ≠ 补丁 ${b}（生成器不该动它）`)
    }
  }
  return { problems, patchRowCount: patchRows.length, compositionRowCount: compRows.length }
}

// ── 解析器阳性对照（**活体那两个已知文件**，只读）──────────────────────────
/**
 * 解析器哑掉的时候，"没找到 job 行"和"解析器根本没读懂文件"长得一模一样。
 * 所以每次跑静态用例之前，先拿活体这两个文件做阳性对照：
 *   · 不许有 warnings；`- id:` 裸计数必须 == 解析出来的行数（**静默丢行当场红**）；
 *   · officeBound 必须读成一个字符串数组、五条固定 team_* 必须都在；
 *   · 补丁那个文件：行数 == 组合行数 + 1（注册行），两处绝对路径都得读到。
 * 行数**不断言**某个固定值：装完新版之后活体会从 38 变 42，那是预期内的（记读数、不判红）。
 */
export function calibrate(compositionText, patchText) {
  const problems = []
  const readings = {}
  const comp = parseComposition(compositionText, 'live-composition')
  problems.push(...comp.warnings.map((w) => `活体组合解析出声：${w}`))
  const rows = comp.rows
  readings.composition_rows = rows.length
  readings.composition_id_lines = countIdLines(compositionText)
  if (readings.composition_rows !== readings.composition_id_lines) {
    problems.push(`解析行数 ${readings.composition_rows} ≠ 裸计数 ${readings.composition_id_lines} —— 解析器丢了行`)
  }
  if (!FROZEN.liveWitness.acceptableLiveRows.includes(rows.length)) {
    problems.push(`活体组合行数 ${rows.length} 既不是装前的 ${FROZEN.liveWitness.acceptableLiveRows[0]} 也不是装后的 ${FROZEN.liveWitness.acceptableLiveRows[1]} —— 有人改了活体，或解析器坏了`)
  }
  const injRow = rows.find((r) => r.id === 'persona-injector')
  const office = injRow ? cfg(injRow, 'officeBound') : undefined
  readings.officeBound = office
  if (!Array.isArray(office) || office.some((x) => typeof x !== 'string')) problems.push(`officeBound 没读成字符串数组：${JSON.stringify(office)}`)
  const teamToolNames = rows.filter((r) => FROZEN.fixedTeamRowIds.includes(r.id)).map((r) => cfg(r, 'toolName'))
  readings.fixed_team_tools = teamToolNames
  for (const want of FROZEN.fixedTeamTools) {
    if (!teamToolNames.includes(want)) problems.push(`五条固定 team_* 里缺 ${want}（解析器或活体有问题）`)
  }
  readings.disabled_literal = rows.filter((r) => disabledKind(r) === 'literal-true').map((r) => r.id)
  readings.enabled_delegations = delegationToolNames(rows)
  readings.onlyInAgeniaNow = rows
    .filter((r) => FROZEN.liveWitness.onlyInAgenia.includes(r.id))
    .map((r) => r.id)

  const patch = parseComposition(patchText, 'live-patch')
  problems.push(...patch.warnings.map((w) => `活体补丁解析出声：${w}`))
  readings.patch_rows = patch.rows.length
  readings.patch_id_lines = countIdLines(patchText)
  if (readings.patch_rows !== readings.patch_id_lines) problems.push(`补丁解析行数 ${readings.patch_rows} ≠ 裸计数 ${readings.patch_id_lines}`)
  const reg = registrationRows(patch.rows)
  readings.patch_registration_rows = reg.length
  if (reg.length !== 1) problems.push(`活体补丁的注册行应为 1，实得 ${reg.length}`)
  if (patch.rows.length !== rows.length + 1) {
    problems.push(`活体补丁行数 ${patch.rows.length} ≠ 组合行数 ${rows.length} + 1（注册行）—— 补丁与组合可能已经不同步`)
  }
  const injPatch = patch.rows.find((r) => r.id === 'persona-injector')
  readings.patch_injector_name = injPatch ? rowGet(injPatch, 'name') : null
  readings.patch_content_dir = injPatch ? cfg(injPatch, 'contentDir') : null
  if (typeof readings.patch_injector_name !== 'string' || !/^file:\/\/\//.test(readings.patch_injector_name)) {
    problems.push('活体补丁的 persona-injector 行名不是绝对 file:/// URL —— 解析器或活体有问题')
  }
  if (typeof readings.patch_content_dir !== 'string' || !/^[A-Za-z]:[\\/]/.test(readings.patch_content_dir)) {
    problems.push('活体补丁的 contentDir 不是绝对路径 —— 解析器或活体有问题')
  }
  return { problems, readings }
}

// ── 目录小工具 ─────────────────────────────────────────────────────────────
export function listMd(dir) {
  try {
    return readdirSync(dir).filter((n) => n.endsWith('.md') && statSync(path.join(dir, n)).isFile()).sort()
  } catch {
    return null
  }
}

export function listDirs(dir) {
  try {
    return readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory()).sort()
  } catch {
    return null
  }
}
