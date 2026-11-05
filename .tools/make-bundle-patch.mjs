/**
 * 从 `presets/agenia/agent.cordis.yml` 生成**内联版**的 bundle 补丁。
 *
 * 为什么要生成而不是手写：那份组合是**唯一来源**，补丁里那一份必须是它的派生物 ——
 * 这个脚本就是那条"派生"关系的可执行形态（改完 .yml 跑一次它，两份永远一致）。
 *
 * ── 2026-10-19（DSH 0.2.1）：一份预设 → 十份 ─────────────────────────────────
 * 0.2.1 的 `tool-subagent` **不再接受 `persona` / `toolFilter`**（见到就报迁移错，
 * 整份预设判 broken）。一个岗位的"人格 + 工具集"必须是一份**独立的 Agent Preset**，
 * 组长那一行只用 `agentPreset:` 指过去。那时生成的是 1 份组长 + 9 份组员。
 *
 * ── 2026-11-01（并员）：十份 → **两份** ───────────────────────────────────────
 * 九条委派行现在指**同一份**通用组员预设 `agenia-member`（页面上只剩两条）。
 * 角色（persona / charter / model / tools）不再住在预设里，而是住在 `inject.js` 的
 * `ROLE_TABLE`（按 `toolName` 查，唯一作者）⇒ 这一份只负责"组员那一份组合长什么样"：
 *
 *   · **组长那一份** = 组合里**预设级**的全部行原样（`persona` / `persona-injector` 两行由这里改写）；
 *   · **通用组员那一份** = 组合**去掉整个 delegation 组**（组员没有委派工具，
 *     `workflow` / `ralph` 也一起结构性没有）+ **一份不扮演任何具体角色的通用人格**
 *     + 注入器的 `defaultRole: leader` **改写成 `member`**（各份声明各档）；
 *   · 组员那一份**不声明** `model` / `tools`（任意深度都没有这两个键）—— 那两个键只住在
 *     角色表里。生成时**当场对账**，出现了就 throw（不是等到体检才发现）。
 *
 * ── 两层分工：bundle 补丁只放预设级行 ─────────────────────────────────────────
 * 组合里出现 `# @host-level` 标记、或 `HOST_LEVEL_IDS` 非空 ⇒ 这里当场 throw。
 * 宿主级行（客户端 UI 那类 `dsh.client.platform: web` + `exports["./client"]` 的包）写进
 * **profile 补丁**的顶层 `- insert:`，不写进这一份。
 * 这一份只放**预设级**行：两条 `@deepseek-ai/dsh-agent-preset`（`agenia` / `agenia-member`），
 * 它们的 `config.plugins` 是**会话**的组合，不进宿主树。
 *
 * 为什么：浏览器只收**宿主 Loader 树**里的条目（`@deepseek-ai/dsh-client-modules` 的
 * `ClientModuleRegistry.processOne()` 只枚举 `ctx.loader.entries()`）；bundle 层在 boot 时被
 * 合成，而预设里的行由 `@deepseek-ai/dsh-agent-preset` 注册进它自建的 Loader 树。
 * 宿主级行与预设级行混在一份 bundle 补丁里，会让“哪一层装了什么”没有单一落点。
 *
 * 用法：<node> .tools/make-bundle-patch.mjs [--check | --interlock-control]
 *   · 不带参数：写 `presets/agenia/cordis.patch.yml`
 *   · `--check`：只对账，不一致就退出 1（体检脚本调它）
 *   · `--interlock-control`：联锁的阴性对照 —— 喂一条宿主级行，必须 throw（退出 1 = 没 throw）
 */
import { readFileSync, writeFileSync } from 'node:fs'
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

/** 组长那一份的预设 id（`inject.js` 的 `LEADER_PRESET_ID` 同值）。 */
const LEADER_PRESET_ID = 'agenia'
/** 通用组员那一份的预设 id（`inject.js` 的 `MEMBER_PRESET_ID` 同值）。九条委派行全指它。 */
const MEMBER_PRESET_ID = 'agenia-member'

/**
 * 通用组员的人格正文 —— **不扮演任何具体角色**（角色那九句住在 `inject.js` 的
 * `ROLE_TABLE` 里，按 `toolName` 给）。这里只交代"你是组员、先读说明书"。
 *
 * ⚠️ 别往这段里写 `【组员:<角色>】` 标记：标记已退役（`inject.js` 不再读它），
 *    而这只是一份**通用**人格，写一个具体角色就是让九个岗位里八个认错自己。
 */
const MEMBER_PERSONA = '你是这个项目组的组员。你的岗位说明书（你是谁、这摊活怎么干）会随请求自动注入 —— 开工前先读它。'

/** 组员那一份**不许**出现的两个键（任意深度）：它们只住在角色表里。 */
const FORBIDDEN_IN_MEMBER = ['model', 'tools']

/**
 * **宿主级行点名表 —— 永远为空。**
 *
 * 宿主级行不属于 bundle 补丁：它们住 profile 补丁的顶层 `- insert:`
 * （`.tools/mount-dashboard-profile.mjs` 写 / 撤）。这张表非空、或组合里出现
 * `# @host-level` 标记 ⇒ `partitionHostLevel()` 当场 throw —— 不静默生成一个空壳 insert。
 * 加一行宿主级的东西 = 去 profile 层加，不在这里加。
 */
const HOST_LEVEL_IDS = Object.freeze([])

/**
 * 宿主级标记**只认一个位置**：`- id: <id>` 的**下一行**，行首两格缩进 + `# @host-level`。
 *
 * 为什么不认"块里任意一行"或行尾注释：`splitRows` 把**上一行**后面的注释算进上一块，
 * 位置放宽就会把一张写给下一行的说明认成这一行的标记。钉死位置 ⇒ 认错不可能发生，
 * 而写错（缩进 / 拼错 / 放到 `- id:` 上面）会在对账里当场 throw，不会静默降级。
 */
const HOST_MARK_LINE = /^ {2}#\s*@host-level\b/

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
 * 把组合的行块分成**预设级**与**宿主级**。宿主级在 bundle 补丁里**不被接受**：
 * 组合里出现 `# @host-level` 标记、或点名表非空 ⇒ 这里当场 throw，理由指向 profile 层。
 *
 * 为什么 throw 而不是"生成一个空壳 insert"：空壳在盘上长得像成功（补丁照样生成、体检照样全绿、
 * 界面上什么都没有），下一个人会以为"宿主层已经留好位置了"。宿主级行有它自己的落点：
 * profile 补丁的顶层 `- insert:`（`.tools/mount-dashboard-profile.mjs`）。
 *
 * @param {string[]} blocks `splitRows()` 出来的行块
 * @param {readonly string[]} [hostLevelIds] 点名表（默认永远为空；只给阴性对照传非空值）
 * @returns {{hostBlocks: [], presetBlocks: string[]}}
 */
function partitionHostLevel(blocks, hostLevelIds = HOST_LEVEL_IDS) {
  if (!Array.isArray(hostLevelIds)) {
    throw new Error(`HOST_LEVEL_IDS 必须是数组，实得 ${typeof hostLevelIds}`)
  }
  const named = [...hostLevelIds]
  if (named.length > 0) {
    throw new Error(`HOST_LEVEL_IDS 必须为空（实得 ${JSON.stringify(named)}）—— 宿主级行不属于 bundle 补丁；`
      + '把它们写进 profile 补丁的顶层 `- insert:`（用 .tools/mount-dashboard-profile.mjs 挂 / 撤），'
      + 'bundle 补丁只放预设级行（两条 @deepseek-ai/dsh-agent-preset）')
  }
  const presetBlocks = []
  for (const block of blocks) {
    const lines = block.split('\n')
    // 任何一处出现这枚标记都拒（不认缩进）：漏看一格就会静默把宿主级行拷进预设。
    const markIndex = lines.findIndex((line) => /@host-level\b/.test(line))
    if (markIndex < 0) {
      presetBlocks.push(block)
      continue
    }
    const id = /^- id:\s*(\S+)\s*$/.exec(lines[0])?.[1] ?? '（没有 - id:）'
    const position = HOST_MARK_LINE.test(lines[markIndex]) && markIndex === 1
      ? '位置对（`- id:` 的下一行）'
      : `位置不对（在第 ${markIndex + 1} 行，不在 \`- id:\` 的下一行，或缩进不是两格）`
    throw new Error(`组合里的行 ${id} 标了 # @host-level，但 bundle 补丁不收宿主级行 —— ${position}。`
      + '宿主级行只写 profile 补丁的顶层 `- insert:`（用 .tools/mount-dashboard-profile.mjs 挂 / 撤）；'
      + '这一份 bundle 补丁只放预设级行（两条 @deepseek-ai/dsh-agent-preset）')
  }
  if (presetBlocks.length === 0) throw new Error('组合里一行预设级行都没有 —— 这不是一份可用的 bundle 补丁')
  return { hostBlocks: [], presetBlocks }
}

/**
 * 委派组里那些带 `agentPreset` 的行（= 真正会起子会话的九条）。
 * @returns {{ id: string, toolName: string|undefined, presetId: string }[]}
 */
function delegationRows(delegationBlock) {
  const rows = []
  let current = null
  for (const line of delegationBlock.split('\n')) {
    const id = /^\s*- id: (\S+)\s*$/.exec(line)
    if (id !== null) {
      current = { id: id[1], toolName: undefined, presetId: undefined }
      rows.push(current)
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

/** 组员的人格那一行（组合里的 `persona` 行被整块换掉）。 */
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

  // 分组：宿主级行在这里被拒（它们的落点是 profile 补丁），只留预设级行。
  const { presetBlocks } = partitionHostLevel(blocks)

  const delegation = presetBlocks.find((block) => /^- id: delegation\s*$/m.test(block))
  if (delegation === undefined) throw new Error('agent.cordis.yml 里找不到 delegation 组 —— 组员行必须住在里面')
  const members = delegationRows(delegation)
  if (members.length === 0) throw new Error('delegation 组里一条带 agentPreset 的组员行都没有 —— 迁移没做？')

  // 九条委派行必须**同指**那一份通用组员预设（并员的全部内容就是这一条）。
  const wrongRef = members.filter((row) => row.presetId !== MEMBER_PRESET_ID)
  if (wrongRef.length > 0) {
    throw new Error(
      `这些委派行的 agentPreset 不是 ${MEMBER_PRESET_ID}：`
        + wrongRef.map((row) => `${row.id}=${row.presetId}`).join(', ')
        + '（并员之后九行共用一份组员预设；各指各的 = 还是九份）',
    )
  }

  const personaBlock = presetBlocks.find((block) => /^- id: persona\s*$/m.test(block))
  if (personaBlock === undefined) throw new Error('agent.cordis.yml 里找不到 persona 行')
  // ⚠️ 兜底值**不带任何 `{{…}}`**：0.2.1 的 persona 模板只认 `provider` / `model`，
  //    写了没注册的变量（例如 `{{cwd}}`）= 建会话第一轮直接失败
  //    （`unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"`）。
  const suffix = /^\s*suffix:\s*(.+)$/m.exec(personaBlock)?.[1]?.trim() ?? '你在当前工作目录里干活。'
  const injectorBlock = presetBlocks.find((block) => /^- id: persona-injector\s*$/m.test(block))
  if (injectorBlock === undefined) throw new Error('agent.cordis.yml 里找不到 persona-injector 行')

  const INDENT = ' '.repeat(10) // 对齐到 `plugins:` 下面的 `- id:`（见下面模板）
  const indentBy = (pad) => (text) => text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : pad + line))
    .join('\n')
  const indentBody = indentBy(INDENT)

  // 组长那一份：预设级的全部行块原样（组员行已经是 agentPreset 形状）。
  const leaderBody = indentBody(presetBlocks.join('\n\n'))

  /**
   * 通用组员那一份：去掉整个 delegation 组（组员没有委派工具），换掉 persona，
   * 并把注入器的 `defaultRole` **改写**成 `member`（这一份自己声明的档）。
   *
   * 🔴 2026-11-01 第 4 关返修：组合本体现在**声明了** `defaultRole: leader`（组长那一份的档）。
   *    组员那一份不能原样抄过去（那就是"声明了 leader 的组员预设"，每个组员会话都报一次不符），
   *    也不能**再插一行**（同一个键写两遍 ⇒ YAML 后一条赢，读的人不知道哪条算数）。
   *    ⇒ 这一份是**改写那一行**；组合里没有这个键 ⇒ 生成失败（别静默产出一份不声明档的预设）。
   */
  const memberBody = indentBody(
    presetBlocks
      .filter((block) => !/^- id: delegation\s*$/m.test(block))
      .map((block) => {
        if (/^- id: persona\s*$/m.test(block)) return memberPersona(MEMBER_PERSONA, suffix)
        if (block === injectorBlock) {
          if (!/^\s*defaultRole:\s*\S+\s*$/m.test(block)) {
            throw new Error('组合本体的 persona-injector 没声明 defaultRole（组长那一份该写 `defaultRole: leader`）——'
              + ' 组员那一份无从改写，先生成一份"不声明档"的预设不是这里想要的形状')
          }
          return block.replace(/^(\s*)defaultRole:\s*\S+\s*$/m, '$1defaultRole: member')
        }
        return block
      })
      .join('\n\n'),
  )

  /**
   * 🔴 生成时当场对账：组员那一份里**不许**出现 `model` / `tools` 键（任意深度）。
   *    这两个键只住在 `inject.js` 的 `ROLE_TABLE` 里；预设里再写一份 = 两个作者。
   *    （扫的是**键**，不是"出现过这个词"：注释里的 `model` 字样不算。）
   */
  const forbidden = memberBody
    .split('\n')
    .map((line, i) => ({ line, no: i + 1 }))
    .filter(({ line }) => FORBIDDEN_IN_MEMBER.some((key) => new RegExp(`^\\s*${key}:\\s*\\S`).test(line)))
  if (forbidden.length > 0) {
    throw new Error(
      `通用组员预设里出现了 ${FORBIDDEN_IN_MEMBER.join(' / ')} 键：`
        + forbidden.map(({ line, no }) => `第 ${no} 行「${line.trim()}」`).join('；')
        + '（角色表是这两个键的唯一作者；预设里再写一份 = 第二个作者）',
    )
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

  const memberPreset = preset(
    MEMBER_PRESET_ID,
    "'Agenia 通用组员'",
    "'Agenia 的通用组员组合 —— 组长派工时自动使用，不要手动选。身份按 toolName 从角色表里取。'",
    100,
    memberBody,
  )

  /**
   * 宿主级行**不搬进这一份**：`partitionHostLevel()` 看到 `# @host-level` 就 throw。
   * 产物里只留预设入口；宿主级行住 profile 补丁（`.tools/mount-dashboard-profile.mjs`）。
   */

  // 那一行仍然写相对路径：插入行的相对路径按**这份补丁所在目录**解析，
  // 而这份补丁就在预设文件夹里（profile 里那个 junction 指回 E:\Harness\presets\agenia）。
  // ⚠️ 它**不再**走 `cordis:include`，所以"按被包含文件解析"那条性质不适用了 ——
  //    解析基准变回"补丁文件所在目录"，而那个目录就是预设文件夹本身，结论一样。
  const text = `# Agenia 作为一个 DSH bundle 的补丁文件 —— 这份预设的**注册入口**。
#
# ── 这一份里只有**预设层**（宿主级行住 profile 补丁，别混着读）────────────────
#   这一份的 \`- insert:\` 装两条 \`@deepseek-ai/dsh-agent-preset\`（\`agenia\` / \`agenia-member\`），
#   它们的 \`config.plugins\` 是**会话**的组合，不进宿主树。
#   客户端 UI 那类**宿主级**行写进 profile 补丁（\`~/.dsh/profiles/<档>/cordis.patch.yml\`）
#   的顶层 \`- insert:\`，不写进这一份 —— 浏览器只收**宿主 Loader 树**里的条目
#   （\`@deepseek-ai/dsh-client-modules\` 只枚举 \`ctx.loader.entries()\`），而预设里的行由
#   \`@deepseek-ai/dsh-agent-preset\` 注册进它自建的 Loader 树。
#   组合里出现 \`# @host-level\` 标记 ⇒ 生成器当场 throw，不会把它搬进这一份。
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
# ── 🔴 2026-11-01（并员）：页面 = **两条**预设 ────────────────────────────────
# 九条委派行（\`@deepseek-ai/dsh-tool-subagent\` 的九个命名实例）现在指**同一份**
# 通用组员预设 \`${MEMBER_PRESET_ID}\`。所以这份补丁里只有两条
# \`@deepseek-ai/dsh-agent-preset\` 入口：组长 \`${LEADER_PRESET_ID}\` + 通用组员 \`${MEMBER_PRESET_ID}\`。
#
#   · 角色（persona / charter / model / tools）的唯一作者是 \`inject.js\` 的 \`ROLE_TABLE\`，
#     按 \`toolName\` 查 —— 预设里**没有** \`model\` / \`tools\` 两个键（生成器当场对账）；
#   · 组员那一份 = 组合**去掉 delegation 组**（workflow / ralph 结构性没有，组员不能再招人）；
#   · **别手动改这份文件** —— 改了 \`.yml\` 就跑一次生成器。
#
# ── 🔴 宿主级行不在这里 ──────────────────────────────────────────────────────
# 组合里标了 \`# @host-level\` 的行**不进这一份**：生成器看到那枚标记当场 throw。
# 宿主级行（客户端 UI 那类）写进 profile 补丁的顶层 \`- insert:\`，用
# \`.tools/mount-dashboard-profile.mjs\` 挂 / 撤。理由见上面「这一份里只有预设层」。
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

# ── 预设入口（会话的组合；不进宿主树）────────────────────────────────────────
- insert:
${preset(LEADER_PRESET_ID, 'Agenia 模式', '带班子的工程组长。她自己分诊、派人、验收；手下四个固定岗位按次序干活，只审不改的岗位碰不到源码。', 10, leaderBody)}
${memberPreset}
`
  // ── 产物侧对账（三条，都对着**字面**数，不对着"我以为写进去了"）──────────────
  // ① 每一份预设 `plugins:` 里的 `- id:`（10 格缩进）—— 只数，不写死；
  // ② 预设入口恰好两条（组长 + 通用组员）；
  // ③ 顶层 `- insert:` 恰好一个（预设入口）：宿主级行不得借道这一份补丁。
  const copied = (text.match(/^ {10}- id: /gm) ?? []).length
  const presetEntries = (text.match(/^ {4}- id: preset-/gm) ?? []).length
  const topInserts = (text.match(/^- insert:/gm) ?? []).length
  if (presetEntries !== 2) throw new Error(`补丁里应有 2 条预设入口（组长 + 通用组员），实得 ${presetEntries}`)
  if (topInserts !== 1) throw new Error(`补丁顶层应恰好 1 个 \`- insert:\`（预设入口），实得 ${topInserts}`
    + ' —— 宿主级行不属于 bundle 补丁；它们写 profile 补丁的顶层 `- insert:`')
  return {
    text,
    sourceRows: ids(source).length,
    copied,
    blocks: blocks.length,
    memberCount: members.length,
    hostRows: 0,
    presetRows: presetBlocks.length,
  }
}

/**
 * 联锁的**阴性对照**：喂一条宿主级行，`partitionHostLevel()` 必须 throw。
 * 这是这个联锁自己的刀 —— 没有它，"生成器会拒"只是一句自述。
 *
 * 跑法：<node> .tools/make-bundle-patch.mjs --interlock-control
 * 退出码：0 = 两条该拒的都拒了、普通预设级行没被误伤；1 = 有一格没拒（联锁死了）。
 */
function runInterlockControl() {
  const cases = [
    {
      name: '组合里出现 # @host-level',
      blocks: [['- id: agenia-dashboard', '  # @host-level', "  name: 'file:///E:/Harness/presets/agenia/client-ui-dashboard/lib/index.js'"].join('\n')],
      named: [],
    },
    {
      name: 'HOST_LEVEL_IDS 非空',
      blocks: ['- id: persona\n  name: \'@deepseek-ai/dsh-persona\''],
      named: ['agenia-dashboard'],
    },
    {
      name: '标记缩进写错（4 格）',
      blocks: ['- id: agenia-dashboard\n    # @host-level'],
      named: [],
    },
  ]
  let survivors = 0
  for (const c of cases) {
    try {
      partitionHostLevel(c.blocks, c.named)
      console.log(`  RED  ${c.name}：没有 throw —— 联锁没拦住`)
      survivors += 1
    } catch (err) {
      console.log(`  ok   ${c.name}：throw —— ${String(err?.message ?? err).slice(0, 260)}`)
    }
  }
  const pass = partitionHostLevel(['- id: persona\n  name: \'@deepseek-ai/dsh-persona\''], [])
  console.log(`  ok   普通预设级行：不 throw（预设级 ${pass.presetBlocks.length} 条 · 宿主级 ${pass.hostBlocks.length} 条）`)
  if (survivors > 0) process.exit(1)
  console.log(`INTERLOCK-CONTROL ${cases.length}/${cases.length} 都 throw`)
  process.exit(0)
}

const ARGV = process.argv.slice(2)
if (ARGV.includes('--interlock-control')) runInterlockControl()
const isCheck = ARGV.includes('--check')
const { text, sourceRows, copied, blocks, memberCount, hostRows, presetRows } = build()

if (isCheck) {
  let current = ''
  try {
    current = readFileSync(TARGET, 'utf8')
  } catch {
    current = ''
  }
  const same = current === text
  console.log(same
    ? `  ok   cordis.patch.yml 与 agent.cordis.yml 一致（${blocks} 条顶格行 → ${presetRows} 条预设级 / ${hostRows} 条宿主级 · 2 份预设（1 组长 + 1 通用组员） · ${memberCount} 条委派行同指 ${MEMBER_PRESET_ID} · 拷进来 ${copied} 个 id）`
    : `  RED  cordis.patch.yml 与 agent.cordis.yml 对不上 —— 改了 .yml 就跑 <node> .tools/make-bundle-patch.mjs`)
  process.exit(same ? 0 : 1)
}

writeFileSync(TARGET, text, 'utf8')
console.log(`写出 ${TARGET}`)
// ⚠️ 这两个数**本来就不相等**，不是一个"对不上"：
//    `copied` 数的是**每一份预设的顶层行块**总和，`sourceRows` 数的是源文件里**全部 `- id:`**
//    （含组内子行）。真正的对账是 `--check` 那条（整份文本逐字比）。
console.log(`  ${blocks} 条顶格行 → ${presetRows} 条预设级 / ${hostRows} 条宿主级 · 2 份预设（1 组长 + 1 通用组员） · ${memberCount} 条委派行同指 ${MEMBER_PRESET_ID} · 补丁里拷进来 ${copied} 条 · 源文件共 ${sourceRows} 个 id`)
