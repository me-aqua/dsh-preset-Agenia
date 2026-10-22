/**
 * 从 `presets/agenia/agent.cordis.yml` 生成**内联版**的 bundle 补丁。
 *
 * 为什么要生成而不是手写：那份组合是**唯一来源**，补丁里那一份必须是它的派生物 ——
 * 这个脚本就是那条"派生"关系的可执行形态（改完 .yml 跑一次它，两份永远一致）。
 *
 * ── 2026-10-19（DSH 0.2.1）：一份预设 → 十份 ─────────────────────────────────
 * 0.2.1 的 `tool-subagent` **不再接受 `persona` / `toolFilter`**（见到就报迁移错，
 * 整份预设判 broken）。一个岗位的"人格 + 工具集"必须是一份**独立的 Agent Preset**，
 * 组长那一行只用 `agentPreset:` 指过去。
 *
 * ⇒ 这个脚本现在生成 **1 份组长预设 + 9 份组员预设**，全部从同一份 `.yml` 派生：
 *   · 组员的**人格**来自组长那一行上面的 `# @member-persona …` 注释；
 *   · 组员的**工具集** = 组长的组合**去掉 delegation 组**（那两个 workflow 行本来就在组里，
 *     所以"不许 workflow / ralph"也一起是结构性的）；
 *   · `# @member-deny proposal_file` ⇒ 那一份组员预设的注入器写 `proposalFile: false`
 *     （判决岗"不能提候选"是结构性没有这个工具，不是调用被拒）。
 *
 * 用法：<node> .tools/make-bundle-patch.mjs [--check]
 *   · 不带参数：写 `presets/agenia/cordis.patch.yml`
 *   · `--check`：只对账，不一致就退出 1（体检脚本调它）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PRESET = join(REPO, 'presets', 'agenia')
const SOURCE = join(PRESET, 'agent.cordis.yml')
const TARGET = join(PRESET, 'cordis.patch.yml')

/**
 * 注入器那一行的行名 —— **必须写绝对的 `file:///` URL，不能写 `./inject.js`**。
 *
 * ⚠️ 2026-09-28 实测（真 web 档）：写成 `./inject.js` 时那一行报
 * `persona-injector (./inject.js): never started` —— 整份预设因此判 broken。
 * 相对路径是按**调起进程的工作目录**解析的，不是按补丁文件所在目录
 * （`presets/agenia/cordis.patch.yml` 只是 bundle 的入口，插入的行归 profile 的加载器管）。
 *
 * ⚠️ **这是整个仓库里唯一一处写死 E: 的地方** —— 换机器 / 换目录，改这一行。
 * （旧写法 `./inject.js` 依赖"补丁文件就在预设文件夹里"，那是 `cordis:include` 时代的性质，
 *   include 一去掉就不成立了 —— 见下面那段注释。）
 */
const INJECTOR = 'file:///E:/Harness/presets/agenia/inject.js'

/**
 * 内容目录 —— 跟上面同一个理由，**也必须写绝对路径**。
 *
 * `inject.js` 默认拿 `ctx.baseUrl` 当内容根（`presetDir()`）。内置时那个值是
 * **调起进程的工作目录**，不是预设文件夹 —— 于是 `persona.md` / `team/*.md` 全都读不到，
 * 而它**不报错**：那一行照样 active，只是每一段都静默不注入（实测 stderr 里那一串
 * `leaderOrder 里的「persona」找不到对应文件` 就是它）。
 * ⇒ 显式把 `contentDir` 写死，把位置从"解析出来的 baseUrl"改成"这一行说了算"。
 * ⚠️ 同 INJECTOR：换机器 / 换目录，这两行一起改。
 */
const CONTENT_DIR = 'E:/Harness/presets/agenia'

/** 组员人格的注释锚点（写在组长那一行上面）。 */
const MEMBER_PERSONA = /^\s*#\s*@member-persona\s+(.+?)\s*$/m
/** 组员工具集的否定项（目前只认 `proposal_file`）。 */
const MEMBER_DENY = /^\s*#\s*@member-deny\s+(.+?)\s*$/m

/**
 * 把组合本体切成"顶格 `- ` 开头的行块"。
 * 只认**行首**的 `- `：缩进的那些是行的内部（config 块、注释）。
 */
function splitRows(text) {
  const blocks = []
  let cur = null
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^- /.test(line)) {
      if (cur !== null) blocks.push(cur)
      cur = [line]
    } else if (cur !== null) {
      cur.push(line)
    }
  }
  if (cur !== null) blocks.push(cur)
  return blocks.map((block) => {
    while (block.length > 0 && block[block.length - 1].trim() === '') block.pop()
    return block.join('\n')
  })
}

const ids = (text) => (text.match(/^\s*- id: .+$/gm) ?? []).map((l) => l.trim().slice(6).trim())

/**
 * 从 `toolName` 推岗位名：`team_design` → `design`、`job_memory_judge` → `memory-judge`、
 * `subagent` → `hire`。这三条是这份预设自己冻的约定（见 agent.cordis.yml「队伍」那一节）。
 */
function roleOf(toolName) {
  if (toolName === 'subagent') return 'hire'
  return toolName.replace(/^team_|^job_/, '').replace(/_/g, '-')
}

/** 组员预设 id：`team_design` → `agenia-team-design`、`subagent` → `agenia-hire`。 */
function presetIdOf(toolName) {
  if (toolName === 'subagent') return 'agenia-hire'
  return `agenia-${toolName.replace(/_/g, '-')}`
}

/**
 * 解析 delegation 组里的组员行：每行要有 `agentPreset`，人格来自上面那行 `# @member-persona`。
 * @returns {{ id: string, toolName: string, presetId: string, persona: string, deny: string[] }[]}
 */
function memberRows(delegationBlock) {
  const rows = []
  let pendingPersona
  let pendingDeny
  let current = null
  for (const line of delegationBlock.split('\n')) {
    const persona = MEMBER_PERSONA.exec(line)
    if (persona !== null && /@member-persona/.test(line)) {
      pendingPersona = persona[1]
      continue
    }
    const deny = MEMBER_DENY.exec(line)
    if (deny !== null && /@member-deny/.test(line)) {
      pendingDeny = deny[1].split(/[\s,]+/).filter(Boolean)
      continue
    }
    const id = /^\s*- id: (\S+)\s*$/.exec(line)
    if (id !== null) {
      current = { id: id[1], toolName: undefined, presetId: undefined, persona: pendingPersona, deny: pendingDeny ?? [] }
      rows.push(current)
      pendingPersona = undefined
      pendingDeny = undefined
      continue
    }
    if (current === null) continue
    const toolName = /^\s+toolName: (\S+)\s*$/.exec(line)
    if (toolName !== null) current.toolName = toolName[1]
    const preset = /^\s+agentPreset: (\S+)\s*$/.exec(line)
    if (preset !== null) current.presetId = preset[1]
  }
  return rows.filter((row) => row.presetId !== undefined)
}

/** 岗位说明书第一行当菜单名（`# 莉薇（Liv）· 设计与美工` → `莉薇（Liv）· 设计与美工`）。 */
function rosterName(role) {
  const file = join(PRESET, 'team', `${role}.md`)
  if (!existsSync(file)) return role
  const first = readFileSync(file, 'utf8').split('\n')[0].trim()
  return first.replace(/^#+\s*/, '') || role
}

/** 组员人格那一行（`persona` 行被整块换掉）。 */
function memberPersona(personaText, suffix) {
  return [
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    '    prefix: |-',
    `      ${personaText}`,
    '',
    `    suffix: ${suffix}`,
  ].join('\n')
}

export function build() {
  const source = readFileSync(SOURCE, 'utf8')
  const blocks = splitRows(source).map((block) => {
    if (!/^- id: persona-injector\s*$/m.test(block)) return block
    // 只动 `persona-injector` 这一行（`planning` / `compaction` 那种组的 config 是**列表**，
    // 往里插键会把 YAML 插坏 —— 第一版就是那么挂的，报 bad indentation）。
    return block
      .replace(/^(\s*name:\s*)'\.\/inject\.js'\s*$/m, `$1'${INJECTOR}'`)
      // 锚在 `leaderOrder:` 上（它是这一行 config 的第一个键），把 contentDir 插在它前面。
      .replace(/^(\s*)leaderOrder:\s*$/m, (m, indent) => `${indent}contentDir: '${CONTENT_DIR}'\n${m}`)
  })

  const delegation = blocks.find((block) => /^- id: delegation\s*$/m.test(block))
  if (delegation === undefined) throw new Error('agent.cordis.yml 里找不到 delegation 组 —— 组员行必须住在里面')
  const members = memberRows(delegation)
  if (members.length === 0) throw new Error('delegation 组里一条带 agentPreset 的组员行都没有 —— 迁移没做？')

  const personaBlock = blocks.find((block) => /^- id: persona\s*$/m.test(block))
  if (personaBlock === undefined) throw new Error('agent.cordis.yml 里找不到 persona 行')
  // ⚠️ 兜底值**不带任何 `{{…}}`**：0.2.1 的 persona 模板只认 `provider` / `model`，
  //    写了没注册的变量（例如 `{{cwd}}`）= 建会话第一轮直接失败
  //    （`unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"`）。
  const suffix = /^\s*suffix:\s*(.+)$/m.exec(personaBlock)?.[1]?.trim() ?? '你在当前工作目录里干活。'
  const injectorBlock = blocks.find((block) => /^- id: persona-injector\s*$/m.test(block))

  const INDENT = ' '.repeat(10) // 对齐到 `plugins:` 下面的 `- id:`（见下面模板）
  const indentBody = (text) => text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : INDENT + line))
    .join('\n')

  // 组长那一份：全部行块原样（组员行已经是 agentPreset 形状）。
  const leaderBody = indentBody(blocks.join('\n\n'))

  /**
   * 组员那一份：去掉整个 delegation 组（组员没有委派工具），换掉 persona，
   * 判决岗再给注入器加 `proposalFile: false`（那个工具因此不注册）。
   */
  function memberBody(member) {
    const inherit = member.deny.includes('proposal_file')
    const picked = blocks
      .filter((block) => !/^- id: delegation\s*$/m.test(block))
      .map((block) => {
        if (/^- id: persona\s*$/m.test(block)) return memberPersona(member.persona ?? roleOf(member.toolName ?? ''), suffix)
        if (inherit && block === injectorBlock) {
          return block.replace(/^(\s*)contentDir: .*$/m, (m, pad) => `${m}\n${pad}proposalFile: false`)
        }
        return block
      })
    return indentBody(picked.join('\n\n'))
  }

  const preset = (id, name, description, order, body) => [
    `    - id: preset-${id} # 行名按约定写 preset-<预设 id>`,
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    `        id: ${id}`,
    `        name: ${name}`,
    `        description: ${description}`,
    `        order: ${order}`,
    '        plugins:',
    body,
  ].join('\n')

  const memberPresets = members.map((member, index) => {
    const role = roleOf(member.toolName ?? '')
    const expected = presetIdOf(member.toolName ?? '')
    if (member.toolName === undefined || member.persona === undefined) {
      throw new Error(`组员行「${member.id}」缺 toolName 或 \`# @member-persona\` 注释 —— 0.2.1 迁移没做全`)
    }
    if (member.presetId !== expected) {
      throw new Error(
        `组员行「${member.id}」的 agentPreset 是 ${member.presetId}，但按 toolName=${member.toolName} 推出来应该是 ${expected}`,
      )
    }
    return preset(
      member.presetId,
      `'Agenia 组员 · ${rosterName(role)}'`,
      `'Agenia 的 ${role} 组合 —— 组长派工时自动使用，不要手动选。'`,
      100 + index,
      memberBody(member),
    )
  })

  // 那一行仍然写相对路径：插入行的相对路径按**这份补丁所在目录**解析，
  // 而这份补丁就在预设文件夹里（profile 里那个 junction 指回 E:\Harness\presets\agenia）。
  // ⚠️ 它**不再**走 `cordis:include`，所以"按被包含文件解析"那条性质不适用了 ——
  //    解析基准变回"补丁文件所在目录"，而那个目录就是预设文件夹本身，结论一样。
  const text = `# Agenia 作为一个 DSH bundle 的补丁文件 —— 这份预设的**注册入口**。
#
# ── 为什么需要它（2026-09-28 换版）─────────────────────────────────────────
# DSH 0.1.7 起，"用户预设"的发现机制整个换掉了：
#   · 以前：往 profile 的 cordis.patch.yml 里登记一个 \`roots\` 目录，由扫描器去扫目录里
#     的 agent.cordis.yml（那一行的 id 叫 \`agent-presets\`）。
#   · 现在：**没有任何东西会扫目录**（框架自己的 skill 原话：Nothing reads that
#     directory any more —— 连 ~/.dsh/.agent-presets/ 一起作废）。
#     一份预设 = 一行 @deepseek-ai/dsh-agent-preset 声明，由某个 bundle 的补丁带进来。
#   ⇒ 旧的 \`agent-presets\` 行与 \`roots\` 键在新版里**根本不存在**，写它只会得到一句
#     \`patch: entry %C not found\` 然后被跳过。症状：预设菜单里**只剩出厂那四个**
#     （standard / ptc / minimal / cordis）—— 2026-09-28 真发生过一次。
#
# 出厂那四份就是这个形状，住在 @deepseek-ai/dsh-web-app/presets/<id>.patch.yml。
# 照抄它，别自己发挥。装法见同目录的 说明.md「怎么装」。
#
# ── 🔴 为什么下面那些行是**内联**的，而不是 \`cordis:include\` 进来的 ──────────────
# 2026-09-28 实测（在**真 web 档**里读的注册表）：
#
#   standard / ptc / minimal / cordis : generation=true  行=32/33/7/33  broken=无
#   我们这份（include 写法）           : generation=false 行=-        broken=persona… never started
#   同一个组合本体、同一个位置、内联   : generation=true  行=1        broken=无
#
# —— **\`cordis:include\` 在预设里挂不起来**：那份补丁的全部行都停在"等宿主服务"，
#    整份预设被判 broken（菜单里那条**被 UI 藏掉**，所以症状是"压根看不见 Agenia"）。
#    出厂四份预设**没有一份**用 include，它们的 plugins 全是内联的。这一条在无头档里
#    也同样复现（那里是 29 行全废）。⇒ **别再改回 include。**
#
# ── 🔴 2026-10-19（DSH 0.2.1）：一份预设变十份 ─────────────────────────────────
# 0.2.1 的 \`tool-subagent\` 删掉了 \`persona\` / \`toolFilter\`：见到就抛
#   tool-subagent: persona is no longer supported; configure persona and tool plugins
#   in an Agent Preset and select it with agentPreset (spawn only)
# ⇒ 组长那一份里九条委派行全部判 broken、整份预设被 UI 藏掉（症状：模式菜单里没有 Agenia，
#    新会话回落到 standard）。现在每一条委派行用 \`agentPreset:\` 指向**一份独立的组员预设**，
#    那十份全部由 \`.tools/make-bundle-patch.mjs\` 从同一个 \`agent.cordis.yml\` 派生：
#      · 组员人格 ← 组长那一行上面的 \`# @member-persona\` 注释；
#      · 组员工具集 = 组长组合**去掉 delegation 组**（workflow / ralph 本来就在那组里）；
#      · \`# @member-deny proposal_file\` ⇒ 那一份注入器写 \`proposalFile: false\`。
#    ⚠️ **别手动改这份文件** —— 改了 \`.yml\` 就跑一次生成器。
#
# ⚠️ 所以这份文件是 \`agent.cordis.yml\` 的**派生物**：
#    那份仍是唯一来源，这份由 \`.tools/make-bundle-patch.mjs\` 生成 ——
#    **改了 agent.cordis.yml 就跑一次它**，体检脚本有一条断言盯着两份是否一致。
#
# ⚠️ 下面那个 \`persona-injector\` 的行名与 \`contentDir\` 都是**绝对路径**，
#    两处都由生成器改写（见 \`.tools/make-bundle-patch.mjs\` 里 INJECTOR / CONTENT_DIR 两段说明）：
#      · 行名写 \`./inject.js\` ⇒ 那一行 never started ⇒ **整份预设 broken**（实测）
#      · 不写 contentDir   ⇒ 那些 .md 全读不到，**而且不报错**（静默注入 0 字符）
#    ⇒ **换机器 / 换目录，改生成器里那两行，再跑一次生成器。**
- insert:
${preset('agenia', 'Agenia 模式', '带班子的工程组长。她自己分诊、派人、验收；手下四个固定岗位按次序干活，只审不改的岗位碰不到源码。', 10, leaderBody)}
${memberPresets.join('\n')}
`
  // 对账：每一份 `plugins:` 里拷进来的 `- id:` 总数，必须等于"组长那一份 + 9 份组员"该有的量。
  const copied = (text.match(/^ {10}- id: /gm) ?? []).length
  return { text, sourceRows: ids(source).length, copied, blocks: blocks.length, memberCount: members.length }
}

const isCheck = process.argv.includes('--check')
const { text, sourceRows, copied, blocks, memberCount } = build()

if (isCheck) {
  let current = ''
  try {
    current = readFileSync(TARGET, 'utf8')
  } catch {
    current = ''
  }
  const same = current === text
  console.log(same
    ? `  ok   cordis.patch.yml 与 agent.cordis.yml 一致（${blocks} 条顶格行 · ${memberCount + 1} 份预设 · 拷进来 ${copied} 个 id）`
    : `  RED  cordis.patch.yml 与 agent.cordis.yml 对不上 —— 改了 .yml 就跑 <node> .tools/make-bundle-patch.mjs`)
  process.exit(same ? 0 : 1)
}

writeFileSync(TARGET, text, 'utf8')
console.log(`写出 ${TARGET}`)
// ⚠️ 这两个数**本来就不相等**，不是一个"对不上"：
//    `copied` 数的是**每一份预设的顶层行块**总和，`sourceRows` 数的是源文件里**全部 `- id:`**
//    （含组内子行）。真正的对账是 `--check` 那条（整份文本逐字比）。
console.log(`  ${blocks} 条顶格行 · ${memberCount + 1} 份预设（1 组长 + ${memberCount} 组员） · 补丁里拷进来 ${copied} 条 · 源文件共 ${sourceRows} 个 id`)
