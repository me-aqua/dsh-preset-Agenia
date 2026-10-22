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

/**
 * 组员注释（**0.2.1 迁移之后，人格与否定项的唯一来源**）。
 *
 * 形状（逐字）：行**上方**两句注释 ——
 *   `# @member-persona 【组员:<角色>】…`   ← 人格（生成器写进那一份组员预设的 `persona.prefix`）
 *   `# @member-deny <名字> [<名字> …]`     ← 工具否定项（生成器给注入器写 `proposalFile: false` 之类）
 * 对照物：`.tools/check-notes.mjs::memberAnnotations`（体检那一侧，同一口径；两边必须同形）。
 *
 * 🔴 为什么不从解析出来的 `row.config` 里读：0.2.1 里 `persona` / `toolFilter` 已经**不是**配置键，
 *    写着它们整行报迁移错 —— 只剩注释这条来源。剔注释的那份文本（`effectiveYml`）里读不到。
 *
 * @param {string} rawText 组合的**原文**（含注释）
 * @returns {Map<string, {persona: string|undefined, deny: string[]}>} 行 id → 注释
 */
export function memberAnnotations(rawText) {
  const out = new Map()
  let persona
  let deny = []
  for (const line of String(rawText).split(/\r?\n/)) {
    const p = /^\s*#\s*@member-persona\s+(.+?)\s*$/.exec(line)
    if (p !== null) { persona = p[1]; continue }
    const d = /^\s*#\s*@member-deny\s+(.+?)\s*$/.exec(line)
    if (d !== null) { deny = d[1].split(/[\s,]+/).filter(Boolean); continue }
    const id = /^\s*- id:\s*(\S+)\s*$/.exec(line)
    if (id !== null) {
      out.set(id[1], { persona, deny })
      persona = undefined
      deny = []
    }
  }
  return out
}

/**
 * 补丁里的**预设入口**（`name: @deepseek-ai/dsh-agent-preset` 的那些行）——
 * 0.2.1 起补丁里有 **10** 份（组长 1 + 组员 9），旧的"注册行恰好 1"已经作废。
 * 每份给出：`config.id`、`plugins` 的 id 列表、以及那一份自己的 injector 配置（普通对象）。
 */
export function presetEntries(rows) {
  return registrationRows(rows).map((r) => {
    const plugins = plain(cfg(r, 'plugins')) ?? []
    return {
      rowId: r.id,
      id: cfg(r, 'id'),
      pluginIds: plugins.map((p) => p.id),
      injector: plugins.find((p) => p.id === 'persona-injector') ?? null,
      personaPrefix: plugins.find((p) => p.id === 'persona')?.config?.prefix ?? null,
    }
  })
}

/**
 * 补丁里"应当有哪几份预设"—— **从组合推**（不写死 10）：
 * 组长一份（`agenia`）+ 每个写了 `agentPreset` 的委派行各一份（值就是那一份的 id）。
 * ⇒ 改了组合没跑生成器，或生成器多吐/少吐一份，这一条当场对不上。
 */
export function expectedPresetIds(rows, { leaderId = FROZEN.patchPresets.leaderPresetId } = {}) {
  const out = [leaderId]
  for (const r of rows) {
    const id = cfg(r, 'agentPreset')
    if (typeof id === 'string' && id.trim() !== '' && !out.includes(id)) out.push(id)
  }
  return out
}

/**
 * **组员预设 id 的公式** —— `agenia-<名字，下划线换横线>`（一份实现，三个调用点）。
 *
 * 名字 = 那一行的 `toolName`；**唯一的例外是裸 `subagent`** —— 它没有自己的岗位行，
 * 那一份预设叫 `agenia-hire`（`.tools/make-bundle-patch.mjs::presetIdOf` 与组合
 * `agent.cordis.yml:302` 的 `# @member-persona 【组员:hire】` 同一口径；AGENTS.md 3b：外聘走裸那一行）。
 *
 * 🔴 **别在别处再抄一份这个公式**（架构判据 1）：`static/roles.test.mjs`（四条 job 行）与
 *    `static/composition.test.mjs`（`TEAM-AGENTPRESET` / `SUBAGENT-AGENTPRESET`）都调这里。
 *    来历：`F-109` 第 4 关评审 `M-4` —— 那两条原来只断言"`agentPreset` 在补丁的入口里存在"，
 *    于是把 `team-design` / `team-dev` 两行的 `agentPreset` **对调**（份数不变、每份行数不变、
 *    两份都存在）⇒ 全绿，而装配时两个岗位的人格互换了。
 */
export function memberPresetIdFor(toolName) {
  const name = toolName === FROZEN.bareSubagent.toolName ? 'hire' : String(toolName)
  return `agenia-${name.replace(/_/g, '-')}`
}

/**
 * **组员预设 id → 那个岗位的角色名**（`M-2` 的产物侧锚点）—— `memberPresetIdFor()` 的逆。
 *   `agenia-team-test` → `test` · `agenia-job-memory-judge` → `memory-judge` · `agenia-hire` → `hire`。
 * 组长那一份（`agenia`）**没有角色** ⇒ 返回 `null`（调用方据此分开"组长份"与"组员份"，不写死判断）。
 */
export function roleOfPresetId(presetId) {
  const m = /^agenia-(?:(?:team|job)-)?(.+)$/.exec(String(presetId))
  return m === null ? null : m[1]
}

/**
 * 组合里属于某个 `cordis:group` 的**整棵子树**：组自己那一行 + 它 `config` 列表里的全部行（含更深一层）。
 * 为什么不是"父子两层"：`collectRows` 只记**直接父行**，而组的 config 里再套组是合法形状
 * （现在没有，但判据不该靠"现在没有"活着）⇒ 用不动点把子树找全。
 */
export function subtreeIds(rows, groupId) {
  const set = new Set([groupId])
  let grew = true
  while (grew) {
    grew = false
    for (const r of rows) {
      if (r.parent !== null && set.has(r.parent) && !set.has(r.id)) {
        set.add(r.id)
        grew = true
      }
    }
  }
  return set
}

/**
 * **`delegation` 组的归属**（`F-109` 第 4 关评审 `M-3` / 现场 `S-2`）。
 *
 * 为什么这条必须存在：`expectedPresetRows()` 的组员那一行是 `subtreeIds(compRows,'delegation')` ——
 * **组员预设的工具集 = 组合减去这一组**。也就是说"哪几行住在组里"是**承重事实**，
 * 而在这一条之前它**零断言**：`subtreeIds` 只在 `composition.mjs` 里被调用 · `row.parent` 只写不读 ·
 * `check-notes.mjs` 只查 id 与文档。⇒ 把 `tool-fs` 误缩进进组、重跑生成器，九个岗位一起失去它，
 * 而**所有派生判据照旧绿**（派生判据的期望值和被测物读的是同一份组合 —— 源本身没人判）。
 *
 * 判据钉**规则**，不钉清单：
 *   `subtreeIds(compRows, groupId)` 必须**恰好**等于
 *   `{groupId} ∪ {name ∈ FROZEN.patchPresets.delegationToolNames 的全部行}`。
 * ⇒ 加一条委派行（`name: @deepseek-ai/dsh-tool-subagent`）仍然绿（不是 change-detector）；
 *   把 `tool-fs` 挪进组、或把 `tool-workflow` 挪出组，当场红。
 *
 * 调用点：`presetEntryProblems()` 的**开头** —— 于是"活体阳性对照"（`calibrate()`）与
 * "staged 被测对象的判据"（`patchStructuralProblems()`）**同时**受它管（与既有设计一致，
 * 免得一处判、一处不判，迟早分叉）。
 *
 * @returns {string[]} 空数组 = 组归属与规则一致
 */
export function delegationGroupProblems(compRows, {
  groupId = FROZEN.patchPresets.memberDropsGroup,
  toolNames = FROZEN.patchPresets.delegationToolNames,
} = {}) {
  const problems = []
  if (!compRows.some((r) => r.id === groupId)) {
    problems.push(`组合里没有 ${groupId} 组 —— "组员份 = 组合去掉 ${groupId} 组"这条口径没有落点（判据会空转）`)
    return problems
  }
  const subtree = subtreeIds(compRows, groupId)
  const inGroup = compRows.filter((r) => r.id !== groupId && subtree.has(r.id))
  const byName = compRows.filter((r) => toolNames.includes(r.name))
  if (byName.length === 0) {
    problems.push(`组合里一条 \`name\` ∈ ${JSON.stringify(toolNames)} 的行都没有 —— 这条规则级判据在空转（名单读坏了，或者组合里委派行全没了）`)
    return problems
  }
  const extra = inGroup.filter((r) => !toolNames.includes(r.name)).map((r) => r.id)
  const missing = byName.filter((r) => !subtree.has(r.id)).map((r) => r.id)
  if (extra.length > 0) {
    problems.push(`delegation 组的成员多了不该在组里的行：${extra.join(', ')}（组员预设 = 组合**减去**这一组 ⇒ 哪一行进了组，九份组员预设就一起失去它，而那些行的判据全绿）`)
  }
  if (missing.length > 0) {
    problems.push(`delegation 组的成员少了本该在组里的行：${missing.join(', ')}（这 ${toolNames.length} 个包名是委派工具，组员不该拿到它们 —— 漏在组外 = 组员能自己再招人）`)
  }
  return problems
}

/**
 * **每份预设入口里应当有哪几行**（0.2.1：一份组合派生 N 份预设）—— 从组合推，不写死行数。
 *
 * 口径来自生成器契约（`.tools/make-bundle-patch.mjs` 文件头 + `build()` 的 `memberBody()`）：
 *   · **组长份** = 组合的**全部**行；`persona-injector` 那一行由生成器改写（绝对 URL + 插入 contentDir）；
 *   · **组员份** = 组合**去掉整个 `delegation` 组**（组员没有委派工具），`persona` 换成该组员的人格。
 * 两条都只影响**行内容**，不影响**行 id 集合** ⇒ 这里冻的是"哪几行在哪一份里"。
 *
 * @returns {Map<string, string[]>} 预设 id → 那一份应有的行 id（**顺序不作为判据**，比较走多重集）
 */
export function expectedPresetRows(compRows, { leaderId = FROZEN.patchPresets.leaderPresetId } = {}) {
  const drop = subtreeIds(compRows, FROZEN.patchPresets.memberDropsGroup)
  const memberIds = compRows.filter((r) => !drop.has(r.id)).map((r) => r.id)
  const out = new Map()
  for (const presetId of expectedPresetIds(compRows, { leaderId })) {
    out.set(presetId, presetId === leaderId ? compRows.map((r) => r.id) : memberIds)
  }
  return out
}

/**
 * 补丁的**预设入口级**对账（0.2.0 的「注册行恰好 1 行 / 补丁行数 = 组合行数 + 1」的 0.2.1 口径）。
 *
 * 三条各自承重：
 *   ① **份数**：入口数必须 = 从组合推出来的份数（组长 1 + 带 `agentPreset` 的委派行）；
 *   ② **每份的行集**：组长份 = 组合全部行、组员份 = 组合去掉 `delegation` 整组 —— **多重集**相等；
 *   ③ **没有第 N+1 份外壳**：补丁的行必须全部住在这几份入口里（顶层只许是这些入口）。
 *
 * 为什么不是"行数相等"：259 这个数可以由无数种错法凑出来（多一份少一行、少一份多一行）。
 * 逐份对行集才抓得住"改了组合没重跑生成器"和"组员份混进了委派行"。
 *
 * @returns {{problems: string[], readings: object}}
 */
export function presetEntryProblems(compRows, patchRows, { leaderId = FROZEN.patchPresets.leaderPresetId } = {}) {
  const problems = []
  const readings = {}
  // 🔴 承重输入先自证：下面整个函数都是"从 `delegation` 组推组员份"（`M-3` / 评审 `S-2`）。
  //    组归属没人守的时候，"组合与补丁同错"会一起绿 —— 这条必须**先于**那些派生判据出声。
  problems.push(...delegationGroupProblems(compRows))
  const expected = expectedPresetRows(compRows, { leaderId })
  const regs = registrationRows(patchRows)
  const gotPresetIds = regs.map((r) => cfg(r, 'id'))
  readings.patch_preset_ids = gotPresetIds
  readings.expected_preset_ids = [...expected.keys()]
  if (regs.length !== expected.size) {
    problems.push(`补丁里的预设入口应有 ${expected.size} 份（从组合推：组长 1 + 每条带 agentPreset 的委派行各 1），实得 ${regs.length}`)
  }
  const missing = [...expected.keys()].filter((id) => !gotPresetIds.includes(id))
  const extra = gotPresetIds.filter((id) => !expected.has(id))
  if (missing.length > 0) problems.push(`补丁缺预设入口：${missing.join(', ')}（组合里有带 agentPreset 的行没被生成成预设？）`)
  if (extra.length > 0) problems.push(`补丁多出组合推不出的预设入口：${extra.join(', ')}（补丁是派生物，不许自己长）`)

  const counts = {}
  let rowsInEntries = 0
  for (const r of regs) {
    const presetId = cfg(r, 'id')
    const entryRows = collectRows(cfg(r, 'plugins'))
    rowsInEntries += entryRows.length + 1
    counts[presetId] = entryRows.length
    const want = expected.get(presetId)
    if (want === undefined) continue
    const got = entryRows.map((x) => x.id)
    const more = multisetDiff(got, want)
    const less = multisetDiff(want, got)
    if (more.length > 0) {
      problems.push(`预设 ${presetId} 多出这一份不该有的行：${more.join(', ')}（组长份 = 组合的全部行；组员份 = 组合去掉 ${FROZEN.patchPresets.memberDropsGroup} 组之后的行）`)
    }
    if (less.length > 0) {
      problems.push(`预设 ${presetId} 缺这一份该有的行：${less.join(', ')}（改了组合没重跑生成器？）`)
    }
  }
  readings.patch_preset_row_counts = counts
  readings.patch_rows_in_entries = rowsInEntries
  if (rowsInEntries !== patchRows.length) {
    problems.push(`补丁有 ${patchRows.length - rowsInEntries} 行不住在任何预设入口里（顶层只许是这 ${regs.length} 份入口，补丁是组合的派生物）`)
  }
  return { problems, readings }
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
 *      · **N 份预设入口逐份对行集**（0.2.1；`presetEntryProblems()`）＋ 组归属（`delegationGroupProblems()`）；
 *      · **逐份入口、逐行**（trim 后）与相对缩进形状必须与组合同形 ⇒ 抓陈旧补丁 / 漏行 / 改值；
 *      · 每份入口里的 `persona-injector` 那两处是**绝对路径**（相对路径 ⇒ 那一行 never started ⇒ 整份 broken）。
 */
/**
 * 一段 YAML 里**每一行自己的块**：从 `- id: X` 起，到下一个缩进 ≤ 它的非空行为止（尾部空行剔掉）。
 * 同一个 id 出现两次时保留**第一块**（组合里出现两次由 STAT-01 的 `STAGED-DUP-ID` 单独判）。
 *
 * 为什么要它：④ 的判据从"整份文本里找得到"改成"**逐份入口逐行比**"（评审 `M-1`），
 * 需要**按行切块**而不是按顶层切块 —— 顶层只有 20 块，而一行一行的块才是补丁里真正被搬来搬去的东西。
 */
export function rowBlocks(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const out = new Map()
  for (let i = 0; i < lines.length; i += 1) {
    // ⚠️ `- id: X` 后面可能跟一句**行尾注释**（补丁里那十份入口就是：
    //    `- id: preset-agenia # 行名按约定写 preset-<预设 id>`）—— 只写 `\S+\s*$` 会一个都认不出。
    const m = /^(\s*)- id:\s*([^\s#]+)(?:\s+#.*)?\s*$/.exec(lines[i])
    if (m === null) continue
    if (out.has(m[2])) continue
    const indent = m[1].length
    let end = i + 1
    while (end < lines.length) {
      if (lines[end].trim() === '') { end += 1; continue }
      if (indentOf(lines[end]) <= indent) break
      end += 1
    }
    while (end > i + 1 && lines[end - 1].trim() === '') end -= 1
    out.set(m[2], lines.slice(i, end))
  }
  return out
}

function shape(lines) {
  const base = indentOf(lines[0])
  // ⚠️ 空行没有缩进可言：块标量里那句空行在两份文件里的 `indentOf` 都是 0，
  //    直接减 base 会让**每个含空行的块**都对不上（第一次跑冒烟就是这样全红）。
  return lines.map((l) => (l.trim() === '' ? ['', null] : [l.trim(), indentOf(l) - base]))
}

export function patchStructuralProblems(compositionText, patchText) {
  const problems = []
  const compRows = collectRows(parseYamlSubset(compositionText, 'composition').value)
  const patchDoc = parseYamlSubset(patchText, 'patch')
  problems.push(...patchDoc.warnings.map((w) => `补丁解析出声：${w}`))
  const patchRows = collectRows(patchDoc.value)

  /**
   * ①–③ **入口级**对账（0.2.1：一份组合派生 N 份预设）—— 与 `calibrate()` 同一个口径函数，
   * 免得"活体阳性对照"与"staged 被测对象的判据"两处各写一份、迟早分叉。
   * 它替掉的两条 0.2.0 旧口径：`注册行恰好 1 行` / `补丁 id 多重集 == 组合 id 多重集`
   * （后者在 N 份入口的世界里必然不成立：组员份把组合那 42 行各带一遍）。
   */
  const entryCheck = presetEntryProblems(compRows, patchRows)
  problems.push(...entryCheck.problems)

  /**
   * ④ **逐份入口、逐行**与组合比（抓"某一份入口里某一行的正文被改过 / 值陈旧"）。
   *
   * 🔴 2026-10-19 第 4 关评审 `M-1`（现场 `S-1`）：这一条原来判的是"组合的每个顶层块
   *    **在补丁全文里找得到**"。0.2.0 只有 1 份入口 ⇒ 那时它等价于"那一份里有"（逐字判据）；
   *    0.2.1 有 10 份 ⇒ 它退化成"**任一份里有就行**"。输入：把 `preset-agenia-team-test` 里
   *    `tool-fs` 那一行的 `name` 换掉 —— id 多重集照旧相等 · ④ 在另外 9 份里找得到 · 行数不变
   *    ⇒ **那两条判据都静默**，而那一份组员的工具集被换掉了。这是"真判据被换成弱判据"，不是历史包袱。
   *
   * 现在的口径：
   *   · **逐份入口**（每份 `name: dsh-agent-preset` 的入口各比各的，不跨份借）；
   *   · **逐行**（`rowBlocks()` 切的每一块 vs 组合里同一个 id 的块，`shape()` 比相对缩进与逐行文字）；
   *   · **跳过 `persona` / `persona-injector` 两行** —— 生成器允许改写它们，改写后的落点由别的判据管：
   *     前者写组员人格 —— `STAT-02` 有两条：`PERSONA-PREFIX` 钉开头那枚 `【组员:<角色>】` 标记，
   *     `PERSONA-PREFIX-SOURCE` 钉标记之后那一段正文（必须等于组合里 `# @member-persona` 的原文）；
   *     后者写绝对 URL + contentDir（由下面 ⑤ 逐份精确断言）；
   *   · 组员份**少了**某些行不管（`delegation` 整组）—— 那是 ①–③ 的多重集管的，④ 只管"在的那几行长什么样"。
   */
  const compBlocks = rowBlocks(compositionText)
  const patchBlocks = rowBlocks(patchText)
  /** 生成器**允许改写**的两行（理由见上）。别把别的行名加进来 —— 加一个就是放掉一条判据。 */
  const REWRITTEN_BY_GENERATOR = new Set(['persona', 'persona-injector'])
  for (const reg of registrationRows(patchRows)) {
    const presetId = cfg(reg, 'id')
    const entryLines = patchBlocks.get(reg.id)
    if (entryLines === undefined) {
      problems.push(`补丁里那一份预设入口 ${reg.id} 切不出行块（判据在这一份上失效了，不许当绿）`)
      continue
    }
    const mismatched = []
    for (const [rowId, block] of rowBlocks(entryLines.join('\n'))) {
      if (REWRITTEN_BY_GENERATOR.has(rowId)) continue
      const want = compBlocks.get(rowId)
      if (want === undefined) continue // 组合里没有这一行 ⇒ 由 ①–③ 的多重集管（多出来的行）
      if (JSON.stringify(shape(block)) !== JSON.stringify(shape(want))) mismatched.push(rowId)
    }
    if (mismatched.length > 0) {
      problems.push(`预设 ${presetId} 里这几行的行体与组合不一致：${mismatched.join(', ')}`
        + '（补丁是组合的派生物 ⇒ 每一份入口的每一行都必须与组合逐字同形；只有 persona / persona-injector 两行允许被生成器改写）')
    }
  }

  /**
   * ⑤ **每一份**入口里的 `persona-injector` 行：绝对路径 + 冻结落点 + 注入清单三样逐字不变。
   * 0.2.1 起每份预设各有一行（10 行）—— 只查第一行等于放掉另外 9 份（"写相对路径 ⇒ never started"）。
   */
  const injRows = patchRows.filter((r) => r.id === 'persona-injector')
  if (injRows.length === 0) problems.push('补丁里没有 persona-injector 行')
  const compInj = compRows.find((r) => r.id === 'persona-injector')
  /** 那一行属于哪一份预设（报红时要能指到份）—— 按**底层 map 的身份**比，不按新建的行对象比。 */
  const presetOfInjector = new Map()
  for (const reg of registrationRows(patchRows)) {
    for (const x of collectRows(cfg(reg, 'plugins'))) {
      if (x.id === 'persona-injector') presetOfInjector.set(x.map, cfg(reg, 'id'))
    }
  }
  for (const inj of injRows) {
    const where = `预设 ${JSON.stringify(presetOfInjector.get(inj.map) ?? '?')}`
    const name = rowGet(inj, 'name')
    const contentDir = cfg(inj, 'contentDir')
    if (typeof name !== 'string' || !/^file:\/\/\/.+\.js$/.test(name)) {
      problems.push(`${where} 的 persona-injector 行名必须是绝对的 file:/// URL（写相对路径 ⇒ 那一行 never started ⇒ 整份预设 broken）；实得 ${JSON.stringify(name)}`)
    } else {
      const dir = name.replace(/^file:\/\/\//, '').replace(/\/[^/]+$/, '')
      if (!/^[A-Za-z]:\//.test(dir)) problems.push(`${where} 的 persona-injector 行名目录不是绝对路径：${dir}`)
      else if (dir.toLowerCase() !== FROZEN.patchTargets.injectorDir.toLowerCase()) {
        problems.push(`${where} 的 persona-injector 行名指向 ${dir}，冻结落点是 ${FROZEN.patchTargets.injectorDir}（staging 与活体逐字节对应 ⇒ 补丁必须写**装好之后**那个绝对路径）`)
      }
    }
    if (typeof contentDir !== 'string' || !/^[A-Za-z]:[\\/]/.test(contentDir)) {
      problems.push(`${where} 的 persona-injector 的 contentDir 必须是绝对路径（不写 ⇒ 那些 .md 全读不到而且不报错）；实得 ${JSON.stringify(contentDir)}`)
    } else if (contentDir.replace(/\\/g, '/').toLowerCase() !== FROZEN.patchTargets.injectorDir.toLowerCase()) {
      problems.push(`${where} 的 contentDir=${contentDir}，冻结落点是 ${FROZEN.patchTargets.injectorDir}`)
    }
    // 生成器**只许**改写行名、插入 contentDir（判决岗那份再加 `proposalFile: false`）——
    // 注入清单这三样必须与组合逐字相同（**每一份**都查）。
    for (const key of ['leaderOrder', 'memberOrder', 'officeBound']) {
      const a = JSON.stringify(cfg(compInj, key))
      const b = JSON.stringify(cfg(inj, key))
      if (a !== b) problems.push(`${where} 的 persona-injector 的 ${key} 被改写了：组合 ${a} ≠ 补丁 ${b}（生成器不该动它）`)
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
 *   · 补丁那个文件：**N 份预设入口逐份对上组合**（`presetEntryProblems()`：份数 / 每份的行集 /
 *     没有第 N+1 份外壳），两处绝对路径都得读到。
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
  /**
   * 🔴 两条 0.2.0 恒等式在这里**退休**（2026-10-19 · DSH 0.2.1 迁移）：
   *   · 旧①「注册行应为 1」 —— 0.2.1 起补丁里有**N 份预设入口**（组长 1 + 带 `agentPreset` 的委派行）；
   *   · 旧②「补丁行数 = 组合行数 + 1」 —— 每份入口都带自己那套行，259 行不是 43 行。
   * 换成 `presetEntryProblems()` 的三条（份数 / 每份的行集 / 没有第 N+1 份外壳），
   * 全部**从组合推**。判据没有放宽：旧②只钉一个数，新②钉的是"哪一行在哪一份里"。
   */
  const presetCheck = presetEntryProblems(rows, patch.rows)
  Object.assign(readings, presetCheck.readings)
  problems.push(...presetCheck.problems)
  const injectorRows = patch.rows.filter((r) => r.id === 'persona-injector')
  readings.patch_injector_rows = injectorRows.length
  if (injectorRows.length !== presetCheck.readings.patch_preset_ids.length) {
    problems.push(`补丁里 persona-injector 行应每份预设各 1 行（${presetCheck.readings.patch_preset_ids.length} 份），实得 ${injectorRows.length} 行`)
  }
  const injPatch = injectorRows[0]
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
