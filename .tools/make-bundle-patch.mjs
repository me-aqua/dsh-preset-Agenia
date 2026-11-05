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
 * ── 2026-11-05（宿主级行）：预设级 → **预设级 + 宿主级** ─────────────────────────
 * 组合里的一行可以声明自己**不进任何预设**：`- id:` 的下一行写 `# @host-level`。
 * 这些行由这里写进**单独的另一个顶层 `- insert:`**（= 宿主装载层），两个预设体里一行都不放。
 *
 * 为什么要有这一层：浏览器收的是**宿主 Loader 树**里的条目 —— `@deepseek-ai/dsh-client-modules`
 * 的 `ClientModuleRegistry.processOne()` 只枚举 `ctx.loader.entries()`，再按包自己的
 * `dsh.client.platform: web` + `exports["./client"]` 决定给浏览器发哪一份；而预设里的行由
 * `@deepseek-ai/dsh-agent-preset` 注册进 registry 自建的 Loader 树，永远不在宿主树里
 * ⇒ 面板写完了也到不了界面（`bug-20261104-02`）。而"装进每一份预设"是这条流水线的默认行为：
 * 不加这一层，一行宿主级的东西会被**每一份**预设各拷一份（当天实测：两份预设各一份）。
 *
 * 三个方向都当场 throw（错一层就静默不显示，不许靠人眼发现）：
 *   · 标了 `# @host-level` 但 id 不在 `HOST_LEVEL_IDS` 点名表里；
 *   · `HOST_LEVEL_IDS` 里的 id 没有标（= 又静默回到预设层）；
 *   · 同一个宿主级 id 标了两次，或者一行都没标。
 *
 * 用法：<node> .tools/make-bundle-patch.mjs [--check]
 *   · 不带参数：写 `presets/agenia/cordis.patch.yml`
 *   · `--check`：只对账，不一致就退出 1（体检脚本调它）
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
 * **宿主级行**的点名表 —— 组合里标了 `# @host-level` 的行，id 必须在这里。
 *
 * 为什么要点名而不是"谁标了就算谁"：漏标是**静默的**（那一行又回到预设层，界面上照样没有，
 * 而盘上所有读数都绿）。这张表让"漏标"变成一次 throw。加一行宿主级的东西 = 这里加一个 id
 * + 组合里那一行加标记，两处同批改（与 `CLIENT_UI_ROWS` / `EXPECTED_ONLY_AGENIA` 同一族账）。
 */
const HOST_LEVEL_IDS = []
// 2026-11-05 16:2x **清空**：`agenia-dashboard` 那一行挂宿主层之后，重启实测让整个 bundle 层在 boot 时失效
//   （新会话的 `agentPreset` 变成 `standard` ⇒ 无角色 ⇒ 窄权限）。回滚成"一行宿主级都没有"，
//   正确的挂载路线走 **profile 层**（`~/.dsh/profiles/<档>/cordis.patch.yml`），另开票。
//   表清空之后 `partitionHostLevel()` 不再要求"至少一行宿主级"（见下面那条 guard）。

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
 * 把组合的行块分成**预设级**与**宿主级**两组（判据只有一条：`- id:` 的下一行是不是那枚标记）。
 *
 * ⚠️ 三个方向都在这里 throw，而不是留到产物上被"人多看一眼"发现 —— 因为这三种错
 * **在盘上都长得像成功**（补丁照样生成、体检照样全绿、界面上什么都没有）：
 *   · 标记挂在没有 `- id:` 的块上（缩进写错 / 写在 `- id:` 上面 ⇒ 那枚注释归上一块）；
 *   · 标记在、id 不在点名表里；
 *   · id 在点名表里、标记没了（= 静默回到预设层）；另加"同一个 id 标两次"。
 *
 * @param {string[]} blocks `splitRows()` 出来的行块
 * @returns {{hostBlocks: {id: string, block: string}[], presetBlocks: string[]}}
 */
function partitionHostLevel(blocks) {
  const hostBlocks = []
  const presetBlocks = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const marks = lines.filter((line) => HOST_MARK_LINE.test(line)).length
    if (marks === 0) {
      presetBlocks.push(block)
      continue
    }
    // 标记**只认位置**（`- id:` 的下一行）；写在别处 = 它归错了块，或者在跟人说话。
    if (!(lines.length > 1 && HOST_MARK_LINE.test(lines[1]))) {
      throw new Error(`宿主级标记必须紧跟在 \`- id: <id>\` 的下一行，这一块里那枚标记在第 `
        + `${lines.findIndex((line) => HOST_MARK_LINE.test(line)) + 1} 行（第一行是「${lines[0]}」）`
        + ' —— 写在 `- id:` 上面会被算进上一块，缩进差一格就不是这一行的标记')
    }
    // 同一条命令写两遍是"我以为改了一处"的典型形状：只要一枚。
    if (marks > 1) throw new Error(`\`- id: ${/^- id:\s*(\S+)\s*$/.exec(lines[0])?.[1] ?? '?'}\` 这一块里有 ${marks} 枚宿主级标记（只认一枚）`)
    const id = /^- id:\s*(\S+)\s*$/.exec(lines[0])?.[1]
    if (id === undefined) {
      throw new Error(`宿主级标记下面那一行不是 \`- id: <id>\`，而是「${lines[0]}」—— 标记挂在了没有 id 的块上`)
    }
    hostBlocks.push({ id, block })
  }
  const got = hostBlocks.map((h) => h.id)
  const unknown = got.filter((id) => !HOST_LEVEL_IDS.includes(id))
  if (unknown.length > 0) {
    throw new Error(`这些行标了 # @host-level，但不在 HOST_LEVEL_IDS 点名表里：${unknown.join(', ')}`
      + '（宿主级行要连同点名表一起加：漏一个 id，那一行会静默留在预设层）')
  }
  const missing = HOST_LEVEL_IDS.filter((id) => !got.includes(id))
  if (missing.length > 0) {
    throw new Error(`这些行必须带 # @host-level 标记却丢了：${missing.join('、')}`
      + ' —— 没有标记，它会被拷进**每一份**预设；宿主装载层就没有这一行了（面板做了也到不了界面）')
  }
  const dupes = got.filter((id, i) => got.indexOf(id) !== i)
  if (dupes.length > 0) throw new Error(`宿主级行标了不止一次：${[...new Set(dupes)].join(', ')}（补丁里会出现两行同 id 的宿主级条目）`)
  if (hostBlocks.length === 0 && HOST_LEVEL_IDS.length > 0) throw new Error(`组合里一行宿主级都没有（HOST_LEVEL_IDS = ${HOST_LEVEL_IDS.join(', ')}）—— 这一份补丁的宿主层是空的`)
  return { hostBlocks, presetBlocks }
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

  // 先分两组：**预设级**（进两份预设）与**宿主级**（写进单独的顶层 insert）。
  const { hostBlocks, presetBlocks } = partitionHostLevel(blocks)

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
  const HOST_INDENT = ' '.repeat(4) // 对齐到顶层 `- insert:` 下面的 `- id:`（宿主装载层）
  const indentBy = (pad) => (text) => text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : pad + line))
    .join('\n')
  const indentBody = indentBy(INDENT)
  const indentHost = indentBy(HOST_INDENT)

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
   * 宿主级那几行：**整块搬走**（连同块里的注释），只摘掉那枚标记行 —— 标记是给生成器读的，
   * 产物里留着会让"这一行为什么在宿主层"看起来像一句没主语的注释。
   */
  const hostBody = hostBlocks
    .map(({ block }) => block.split('\n').filter((_, i) => i !== 1).join('\n'))
    .map(indentHost)
    .join('\n\n')

  // 那一行仍然写相对路径：插入行的相对路径按**这份补丁所在目录**解析，
  // 而这份补丁就在预设文件夹里（profile 里那个 junction 指回 E:\Harness\presets\agenia）。
  // ⚠️ 它**不再**走 `cordis:include`，所以"按被包含文件解析"那条性质不适用了 ——
  //    解析基准变回"补丁文件所在目录"，而那个目录就是预设文件夹本身，结论一样。
  const text = `# Agenia 作为一个 DSH bundle 的补丁文件 —— 这份预设的**注册入口**。
#
# ── 这一份里有两层（别混着读）─────────────────────────────────────────────
#   ① 宿主级行（第 1 个 \`- insert:\`）—— 直接装进**宿主 Loader 树**。浏览器收的包就是从
#      这一层里挑的（\`dsh.client\` + \`exports["./client"]\`），预设里的行不在这一层。
#   ② 预设入口（第 2 个 \`- insert:\`）—— 两条 \`@deepseek-ai/dsh-agent-preset\`，
#      它们的 \`config.plugins\` 是**会话**的组合，不进宿主树。
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
# ── 🔴 2026-11-05（宿主级行）：浏览器只认第一层 ────────────────────────────────
# 组合里标了 \`# @host-level\` 的行（点名表 = 生成器的 \`HOST_LEVEL_IDS\`）**不进预设**，
# 在这里被搬成第 1 个顶层 \`- insert:\` 的直接成员。理由不在这一份文件里猜：
# \`@deepseek-ai/dsh-client-modules\` 的 \`ClientModuleRegistry.processOne()\` 只枚举
# \`ctx.loader.entries()\`（宿主 Loader 树），而预设里的行由 \`@deepseek-ai/dsh-agent-preset\`
# 注册进 registry 自建的 Loader 树 —— 装进预设 = 浏览器永远收不到。
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

# ── ① 宿主级行（宿主装载层；从组合里标 \`# @host-level\` 的那些行搬来）────────────
- insert:
${hostBody}

# ── ② 预设入口（会话的组合；不进宿主树）──────────────────────────────────────
- insert:
${preset(LEADER_PRESET_ID, 'Agenia 模式', '带班子的工程组长。她自己分诊、派人、验收；手下四个固定岗位按次序干活，只审不改的岗位碰不到源码。', 10, leaderBody)}
${memberPreset}
`
  // ── 产物侧对账（三条，都对着**字面**数，不对着"我以为写进去了"）──────────────
  // ① 每一份预设 `plugins:` 里的 `- id:`（10 格缩进）—— 只数，不写死；
  // ② 预设入口恰好两条（组长 + 通用组员）；
  // ③ 宿主级行：**每个 id 在预设体里 0 次、在顶层 insert 里恰好 1 次** ——
  //    这一条是"层"的唯一读数：放回预设层 ⇒ 前一半红，被删掉 ⇒ 后一半红。
  const copied = (text.match(/^ {10}- id: /gm) ?? []).length
  const presetEntries = (text.match(/^ {4}- id: preset-/gm) ?? []).length
  if (presetEntries !== 2) throw new Error(`补丁里应有 2 条预设入口（组长 + 通用组员），实得 ${presetEntries}`)
  for (const id of HOST_LEVEL_IDS) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const inPreset = (text.match(new RegExp(`^ {10}- id: ${esc}\\s*$`, 'gm')) ?? []).length
    const inHost = (text.match(new RegExp(`^ {4}- id: ${esc}\\s*$`, 'gm')) ?? []).length
    if (inPreset !== 0) {
      throw new Error(`宿主级行 ${id} 出现在预设体里（10 格缩进 ${inPreset} 次）—— 它只能住在顶层 insert；`
        + '预设里的行由 dsh-agent-preset 注册进 registry 自建的 Loader 树，浏览器永远收不到')
    }
    if (inHost !== 1) {
      throw new Error(`宿主级行 ${id} 在顶层 insert 里出现 ${inHost} 次（应恰好 1 次）—— 0 次 = 面板消失了，2 次 = 同 id 两行`)
    }
  }
  return {
    text,
    sourceRows: ids(source).length,
    copied,
    blocks: blocks.length,
    memberCount: members.length,
    hostRows: hostBlocks.length,
    presetRows: presetBlocks.length,
  }
}

const isCheck = process.argv.includes('--check')
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
