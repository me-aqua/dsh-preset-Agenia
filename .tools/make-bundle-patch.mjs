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
 * ── 两层分工：一个顶层 insert，宿主级行与预设入口并列 ─────────────────────────
 * **层归属由包事实判，落点由 `# @host-level` 标记 + `HOST_LEVEL_IDS` 点名表定**：
 *   · 每一条顶格行的 `name` 解析到最近的 `package.json`；那份 manifest 声明
 *     `dsh.client.platform: web` ⇒ 这一行是客户端 UI 行 ⇒ **不许**进预设体（`throw`）。
 *   · 客户端 UI 行只有一条合法去处：标 `# @host-level` 并进 `HOST_LEVEL_IDS`，
 *     由本生成器发到**顶层 `- insert:` 的直接成员**。官方面板就是这个形状：
 *     `@deepseek-ai/dsh-experimental-agent-team-profile/cordis.patch.yml` 的顶层
 *     `- insert:` 里装着 `ui-agent-team`（与两条服务行并列）。
 *   · 标记与点名表必须成对出现：标记在、id 不在表里 ⇒ throw；id 在表里、标记没了 ⇒ throw。
 *     两边一起改，否则"哪一层装了什么"又变成两个作者。
 *   · 两份预设体里**永远**没有宿主级行：一个包只有一个 Node 写者（否则每个预设各起一份、
 *     各写一份快照）。`partitionHostLevel()` 把宿主级行从预设体里摘掉之后才组装两份预设。
 *
 * 唯一例外是一张**点名白名单**（`KNOWN_CLIENT_UI_IN_PRESET`）：客户端 UI 行若被硬塞回预设体，
 * 只有 `{id, package, disabled: true}` 三格都对上才放行。今天表里那一条已经走宿主级路线
 * ⇒ 真组合里它到不了这里（先被宿主级分支摘走）；白名单只在 `--interlock-control` 的夹具里翻面。
 *
 * **裸包名（`@deepseek-ai/…`）不是 `client: false`，是"判不了"**：它们住在宿主的 asar 里，
 * 这棵树没有 node_modules ⇒ 没有 `package.json` 可读。判不了就 fail-closed：
 *   · 只有 `BARE_ROWS_IN_PRESET` 点名过的裸名（= 今天这份组合里全部预设级包名 + 组名）
 *     可以进预设体；**表外裸名一律 `E_BUNDLE_CLIENT_UI_UNRESOLVED`**；
 *   · 新行要进来，先在表里做一次**显式分类**（一行），不许"不认识就放行"；
 *   · 框架自己的客户端 UI 包族（`@deepseek-ai/dsh-client-ui-*`）另有一条更早的拦截：
 *     命中包名族 ⇒ `E_BUNDLE_CLIENT_UI_IN_PRESET`（"裸名 + 客户端 UI 族"是最现实的形状）。
 *
 * `# @host-level` 标记只在**顶格行**、`- id:` 的下一行、两格缩进时有效；位置不对 ⇒ throw。
 * 标记不参与"是不是客户端 UI"的判定（那是包事实），它只声明"这一行去顶层 insert"。
 *
 * 预设入口本身仍是两条 `@deepseek-ai/dsh-agent-preset`（`agenia` / `agenia-member`），
 * 它们的 `config.plugins` 是**会话**的组合，不进宿主树。
 *
 * 为什么：浏览器只收**宿主 Loader 树**里的条目（`@deepseek-ai/dsh-client-modules` 的
 * `ClientModuleRegistry.processOne()` 只枚举 `ctx.loader.entries()`）；预设里的行由
 * `@deepseek-ai/dsh-agent-preset` 注册进它自建的 Loader 树。所以宿主级行必须住顶层 insert，
 * 且只住一份（一个包一个 Node 写者）。
 *
 * 用法：<node> .tools/make-bundle-patch.mjs [--check | --interlock-control | --describe=<文件>]
 *   · 不带参数：写 `presets/agenia/cordis.patch.yml`（写完**回读**，读数取自盘上那份）
 *   · `--check`：只对账 —— 先比"盘上补丁 = 从组合造出来的那一份"，再**直接读盘上那份补丁**
 *     数结构（顶层 `- insert:` / 直接成员 / 宿主级行 / 预设体内客户端 UI 行 / 行 id 出现次数），
 *     不一致就退出 1（体检脚本调它）
 *   · `--interlock-control`：联锁的阴性/阳性对照 —— 标记 / 点名表 / 包事实 / 白名单 / 裸名 /
 *     坏 manifest / 嵌套行各路各喂一条，该 throw 的必须 throw、该放行的必须放行（退出 1 = 有一格没翻面）
 *   · `--describe=<文件>`：只跑**产物侧读数**（`describePatch` + `patchProblems`）打一份外部文件 ——
 *     手工挪行之后"读数会不会翻面"就靠它量（退出 1 = 那份文件有问题）
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
 * **宿主级行点名表** —— 这些 id 的行由本生成器发到顶层 `- insert:` 的直接成员。
 *
 * 与组合里的 `# @host-level` 标记**互为守卫**：标记在、id 不在表里 ⇒ `E_BUNDLE_HOST_UNLISTED`；
 * id 在表里、标记没了 ⇒ `E_BUNDLE_HOST_UNMARKED`；表里的 id 在组合里找不到 ⇒
 * `E_BUNDLE_HOST_ROW_MISSING`。三格缺一粒都 throw —— 不静默生成一个少了宿主行的补丁。
 *
 * 这张表**不是**层归属的判据（判据是包事实：行解析到的包声明 `dsh.client.platform: web`）。
 * 它只回答"这一行发到哪"，并且必须与组合里的标记逐条对上。
 */
const HOST_LEVEL_IDS = Object.freeze(['agenia-dashboard'])

/**
 * 已知是客户端 UI、但**有意**留在预设体里的行 —— 点名白名单（唯一例外）。
 *
 * 放行要三条同时成立：① `id` 在这张表里；② 这一行解析到的包确实声明
 * `dsh.client.platform: web`（按包事实放行，不按名字猜）；③ 这一行写着 `disabled: true`
 * （放行的是"关着的行"，不是"打开的行"）。少一条就 throw。
 *
 * 今天表里那一条（看板面板）已经走宿主级路线（`HOST_LEVEL_IDS`），`partitionHostLevel()`
 * 先把它摘走 ⇒ 真组合里它到不了 `classifyPresetRow()`，白名单不会开火。保留这张表是为了让
 * "客户端 UI 行被硬塞回预设体"这件事在对照夹具里仍有一条具名出口（`_ALLOW_MISMATCH` / `_ENABLED`）。
 */
const KNOWN_CLIENT_UI_IN_PRESET = Object.freeze([
  Object.freeze({
    id: 'agenia-dashboard',
    package: '@agenia/dsh-client-ui-dashboard',
    disabled: true,
    why: '看板面板：走宿主级路线（HOST_LEVEL_IDS）；这条只兜"被硬塞回预设体"的对照夹具',
  }),
])

/**
 * 框架自己的客户端 UI 包族 —— **命中即拒**（更早于裸名分类表）。
 *
 * 为什么用包名前缀：裸名没有 manifest 可读，唯一能当场看见的是名字。这一条只做**拒绝**，
 * 不做放行：命中 ⇒ 当成客户端 UI 行（`E_BUNDLE_CLIENT_UI_IN_PRESET`），理由指向宿主级路线。
 * 它不声称覆盖所有客户端 UI 包 —— 覆盖靠下面那张 fail-closed 的裸名表。
 */
const BARE_CLIENT_UI_FAMILY = /^@deepseek-ai\/dsh-client-ui-/

/**
 * **允许进预设体的裸名**（包事实读不到，只能点名）。
 *
 * 这张表 = 今天 `agent.cordis.yml` 里全部裸名 + 组名 + 预设入口包（`@deepseek-ai/dsh-agent-preset`）。
 * 它不是"客户端 UI 黑名单"，而是"**已知不是客户端 UI** 的预设级裸名"：表外的裸名判不了
 * ⇒ `E_BUNDLE_CLIENT_UI_UNRESOLVED`（fail-closed）。新增一个工具行 = 在这里加一行（一次显式
 * 分类）；不自动放行，也不按名字像不像猜。
 *
 * 🔴 别把 `@deepseek-ai/dsh-client-ui-*`（或任何客户端 UI 包）加进来：它们标成宿主级、进顶层 insert。
 */
const BARE_ROWS_IN_PRESET = Object.freeze([
  'cordis:group',
  '@deepseek-ai/dsh-agent-preset',
  '@deepseek-ai/dsh-agent-instructions',
  '@deepseek-ai/dsh-command-compact',
  '@deepseek-ai/dsh-command-goal',
  '@deepseek-ai/dsh-compaction-basic',
  '@deepseek-ai/dsh-compaction-tool-result-pruner',
  '@deepseek-ai/dsh-persona',
  '@deepseek-ai/dsh-plan-mode',
  '@deepseek-ai/dsh-plugin-manager/tools',
  '@deepseek-ai/dsh-skill-filesystem',
  '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-fs-search',
  '@deepseek-ai/dsh-tool-goal',
  '@deepseek-ai/dsh-tool-jobs',
  '@deepseek-ai/dsh-tool-present',
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-ralph',
  '@deepseek-ai/dsh-tool-skill',
  '@deepseek-ai/dsh-tool-subagent',
  '@deepseek-ai/dsh-tool-subagent-control',
  '@deepseek-ai/dsh-tool-todo',
  '@deepseek-ai/dsh-tool-web',
  '@deepseek-ai/dsh-tool-workflow',
  '@deepseek-ai/dsh-workflow-ptc',
])

/**
 * `# @host-level` 标记 —— 只在顶格行的 `- id:` 下一行、两格缩进时有效。
 *
 * 它声明"这一行发到顶层 `- insert:` 的直接成员"，必须与 `HOST_LEVEL_IDS` 里的同名 id 成对出现；
 * 位置不对 / 不成对 ⇒ throw（判层本身仍由包事实做：客户端 UI 行不许进预设体）。
 */
const HOST_MARK_LINE = /^ {2}#\s*@host-level\b/
const HOST_MARK_ANY = /@host-level\b/

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

// ── 包事实：行的 `name` → 最近的 package.json → `dsh.client.platform` ───────────
/** 路径形名字（与框架的 `pathLike` 同一族：`file:` / 盘符 / 斜杠 / `./` `../`）。 */
const PATH_LIKE = /^(file:|[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|\\\\)/

/** YAML 标量（这一份组合里出现的形状：单/双引号、裸值、行尾注释）。 */
function plainScalar(raw) {
  const value = String(raw).trim()
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) } catch { return value.slice(1, -1) }
  }
  return value.replace(/\s+#.*$/, '').trim()
}

/**
 * 一行组合块自己的三个字段（只认**行自己的两格键**；嵌套 `config` 里的同名键不算）。
 * @returns {{id: string|null, name: string|null, disabled: string|null}}
 */
function rowFacts(block) {
  const lines = block.split('\n')
  const id = /^- id:\s*(.+?)\s*$/.exec(lines[0])?.[1] ?? null
  const inlineName = /^- name:\s*(.+?)\s*$/.exec(lines[0])?.[1] ?? null
  const field = (key) => {
    for (let i = 1; i < lines.length; i += 1) {
      const hit = new RegExp(`^ {2}${key}:\\s*(.*?)\\s*$`).exec(lines[i])
      if (hit !== null) return hit[1]
    }
    return null
  }
  const name = field('name') ?? inlineName
  const disabled = field('disabled')
  return {
    id: id === null ? null : plainScalar(id),
    name: name === null ? null : plainScalar(name),
    disabled: disabled === null ? null : plainScalar(disabled),
  }
}

/** 从某个文件往上找最近的 `package.json`；找不到返回 null。 */
function nearestPackage(file) {
  let dir = dirname(file)
  for (;;) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      let pkg = null
      try { pkg = JSON.parse(readFileSync(manifest, 'utf8')) } catch { pkg = null }
      if (pkg === null) return { manifest, dir, name: null, platform: null, broken: true }
      return {
        manifest,
        dir,
        name: typeof pkg.name === 'string' ? pkg.name : null,
        platform: pkg?.dsh?.client?.platform ?? null,
        broken: false,
      }
    }
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

/**
 * 一行的 `name` **解析到哪个包**。**"判不了"是一个独立的态**（`client: null`），不是 `false`。
 *
 *   · `package` + `client: true|false` —— 路径形名字（`file:` / 盘符 / 绝对路径 / `./` `../`）
 *     解析到最近的 `package.json`，`dsh.client.platform === 'web'` ⇒ 客户端 UI；
 *   · `package` + `client: null` —— manifest 读不成 JSON（`unresolved: 'broken-manifest'`）；
 *   · `bare` + `client: null` —— 裸包名（宿主 asar 里，本树没有 manifest），不在
 *     `BARE_ROWS_IN_PRESET` 点名表里（`unresolved: 'bare'`；表里的裸名是 `client: false`）；
 *   · `path-no-manifest` + `client: null` —— 路径形但往上一个 `package.json` 都找不到；
 *   · `none` + `client: null` —— 行里没有可读的 `name:`（`unresolved: 'no-name'`）。
 *
 * `client: null` 的调用方**不许**把它当 `false`：`classifyPresetRow()` 当场 throw，
 * `describePatch()` 记一条 `E_PATCH_CLIENT_UI_UNRESOLVED`。
 *
 * @param {string|null} name 行自己的 `name`
 * @param {string} [baseDir] 路径形名字的解析基准（默认预设目录）
 * @returns {object} `kind` = `package` / `path-no-manifest` / `bare` / `none`；`client` = `true|false|null`
 */
function rowPackage(name, baseDir = PRESET) {
  const raw = typeof name === 'string' ? name.trim() : ''
  if (raw === '') return { kind: 'none', client: null, unresolved: 'no-name', raw }
  let file = null
  if (/^file:/i.test(raw)) {
    try { file = fileURLToPath(raw) } catch { file = null }
  } else if (PATH_LIKE.test(raw)) {
    file = resolve(baseDir, raw)
  }
  if (file === null) {
    const known = BARE_ROWS_IN_PRESET.includes(raw)
    return { kind: 'bare', client: known ? false : null, unresolved: known ? null : 'bare', raw }
  }
  const found = nearestPackage(file)
  if (found === null) return { kind: 'path-no-manifest', client: null, unresolved: 'no-manifest', raw, file }
  const base = {
    kind: 'package',
    raw,
    file,
    manifest: found.manifest,
    dir: found.dir,
    name: found.name,
    platform: found.platform,
    broken: found.broken === true,
  }
  if (found.broken) return { ...base, client: null, unresolved: 'broken-manifest' }
  return { ...base, client: found.platform === 'web' }
}

/**
 * 一个行块**内部**的包行（组 `config` 里的 `- name:` 项）——
 * `splitRows()` 只拆顶格行，组里的行必须单独过同一把尺子，否则它们会绕过判层。
 *
 * 只认**行块内部**的列表项（缩进 > 0），读法与本文件其它地方一致：`- id:` / `- name:`
 * 可以写在同一行；`name:` / `disabled:` 也可以写在下一行（缩进 +2）。
 *
 * @param {string} block `splitRows()` 出来的行块
 * @returns {{line: number, id: string|null, name: string, disabled: string|null}[]}
 */
function nestedRowsIn(block) {
  const lines = block.split('\n')
  const out = []
  for (let i = 1; i < lines.length; i += 1) {
    const item = /^(\s*)- (.*)$/.exec(lines[i])
    if (item === null) continue
    const indent = item[1].length
    if (indent === 0) continue
    let idRaw = /^id:\s*(.+?)\s*$/.exec(item[2])?.[1] ?? null
    let nameRaw = /^name:\s*(.+?)\s*$/.exec(item[2])?.[1] ?? null
    let disabledRaw = null
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim() === '' || /^\s*#/.test(lines[j])) continue
      const ind = indentOf(lines[j])
      if (ind <= indent) break
      if (ind !== indent + 2) continue
      const rest = lines[j].slice(ind)
      if (nameRaw === null) {
        const hit = /^name:\s*(.+?)\s*$/.exec(rest)
        if (hit !== null) nameRaw = hit[1]
      }
      if (disabledRaw === null) {
        const hit = /^disabled:\s*(.+?)\s*$/.exec(rest)
        if (hit !== null) disabledRaw = hit[1]
      }
    }
    if (nameRaw === null) continue // 不是包行（标量列表项）
    out.push({
      line: i + 1,
      id: idRaw === null ? null : plainScalar(idRaw),
      name: plainScalar(nameRaw),
      disabled: disabledRaw === null ? null : plainScalar(disabledRaw),
    })
  }
  return out
}

/**
 * 一行**能不能进预设体** —— 顶层行与嵌套行走同一个分支，不再各写一份判断。
 *
 * 顺序（每一条都 fail-closed）：
 *   ① 解析不到包（裸名没点名 / 坏 manifest / 找不到 manifest / 没有 name）⇒
 *      `E_BUNDLE_CLIENT_UI_UNRESOLVED`（白名单行另给一句"白名单与包事实对不上"）；
 *      裸名命中框架客户端 UI 包族 ⇒ `E_BUNDLE_CLIENT_UI_IN_PRESET`（更准的码）；
 *   ② 解析到 web 包：不在白名单 ⇒ `E_BUNDLE_CLIENT_UI_IN_PRESET`；
 *      在白名单但包名不是 `package` 那一格 ⇒ `E_BUNDLE_CLIENT_UI_ALLOW_MISMATCH`；
 *      没写 `disabled: true` ⇒ `E_BUNDLE_CLIENT_UI_ENABLED`；
 *   ③ 解析到非 web 包 ⇒ 放行（返回 null）。
 *
 * @returns {{id: string, package: string, platform: string, manifest: string, why: string}|null}
 *   放行且是白名单行时返回点名记录；普通行返回 null。该拒时 throw。
 */
function classifyPresetRow({ id, name, disabled }, { where = '组合里的顶格行', baseDir = PRESET } = {}) {
  const pkg = rowPackage(name, baseDir)
  const label = id ?? '（没有 - id:）'
  const allow = KNOWN_CLIENT_UI_IN_PRESET.find((entry) => entry.id === id)

  if (pkg.client === null) {
    if (allow !== undefined) {
      throw new Error(`E_BUNDLE_CLIENT_UI_UNRESOLVED ${where} ${label} 是点名白名单里的行，但没有解析到 `
        + `dsh.client.platform: web 的包（name=${JSON.stringify(name)} · ${pkg.kind}`
        + `${pkg.manifest === undefined ? '' : ` · ${pkg.manifest}`}`
        + `${pkg.unresolved === 'broken-manifest' ? ' · manifest 解析失败' : ''}）—— 白名单与包事实对不上：`
        + '要么包没了 / 平台改了，要么这一行该从 KNOWN_CLIENT_UI_IN_PRESET 删掉。')
    }
    if (pkg.kind === 'bare' && BARE_CLIENT_UI_FAMILY.test(pkg.raw)) {
      throw new Error(`E_BUNDLE_CLIENT_UI_IN_PRESET ${where} ${label} 的 name 是裸包名 ${JSON.stringify(name)}，`
        + '而它属于框架的客户端 UI 包族（`@deepseek-ai/dsh-client-ui-*`）—— 裸名在这棵树里解析不到 manifest，'
        + '不能证明它不是客户端 UI。客户端 UI 行只许住顶层 `- insert:` 的直接成员'
        + '（在组合里标 `# @host-level` 并进 HOST_LEVEL_IDS），不许进预设体。')
    }
    throw new Error(`E_BUNDLE_CLIENT_UI_UNRESOLVED ${where} ${label} 的包解析不出来（${pkg.unresolved} · `
      + `name=${JSON.stringify(name)}${pkg.file === undefined ? '' : ` · ${pkg.file}`}`
      + `${pkg.manifest === undefined ? '' : ` · ${pkg.manifest}`}）—— `
      + (pkg.unresolved === 'broken-manifest'
        ? 'manifest 读不成 JSON ⇒ 判不了它是不是客户端 UI，**不许当"不是"**。修好那份 package.json，或给这一行标 `# @host-level` 并进 HOST_LEVEL_IDS。'
        : pkg.unresolved === 'bare'
          ? '裸包名在这棵树里没有 package.json（框架的包装在宿主 asar 里）⇒ 判不了它是不是客户端 UI。'
            + `已知不是客户端 UI 的预设级裸名要点名进 BARE_ROWS_IN_PRESET（今天 ${BARE_ROWS_IN_PRESET.length} 条）；`
            + '新行要进来先做一次显式分类，不自动放行。'
          : pkg.unresolved === 'no-name'
            ? '这一行没有可读的 `name:`（两格缩进或写在 `- ` 同一行）⇒ 判不了它是什么包。'
            : '路径形名字往上找不到 package.json ⇒ 判不了它是不是客户端 UI，**不许当"不是"**。'))
  }
  if (pkg.client === true) {
    if (allow === undefined) {
      throw new Error(`E_BUNDLE_CLIENT_UI_IN_PRESET ${where} ${label} 的 name 解析到声明 dsh.client.platform: web 的包`
        + `（${pkg.name ?? '（manifest 没有 name）'} · ${pkg.manifest}）—— 客户端 UI 行不许进 bundle 补丁的预设体：`
        + '它会被拷进两份预设，而浏览器只收宿主 Loader 树里的条目（预设里的行进的是另一棵 Loader 树）。'
        + '在组合里给这一行标 `# @host-level` 并把它加进 HOST_LEVEL_IDS —— 生成器会发到顶层 `- insert:`。'
        + `确实要留在预设体里且是关着的，把它加进 KNOWN_CLIENT_UI_IN_PRESET 白名单（今天只有 ${KNOWN_CLIENT_UI_IN_PRESET.map((e) => e.id).join(' / ')}）`)
    }
    if (allow.package !== pkg.name) {
      throw new Error(`E_BUNDLE_CLIENT_UI_ALLOW_MISMATCH ${where} ${label} 的 id 在白名单里，但解析到的包是 `
        + `${JSON.stringify(pkg.name)}（${pkg.manifest}），白名单要求 ${JSON.stringify(allow.package)} —— `
        + '白名单绑定的是"id + 包名 + 关着"三格；复用这个 id 指到另一个 web 包 = 白名单在放行一条它没点头的行。')
    }
    if (disabled !== 'true') {
      throw new Error(`E_BUNDLE_CLIENT_UI_ENABLED ${where} ${label} 在点名白名单里，但没写 disabled: true`
        + `（实得 ${JSON.stringify(disabled)}）—— 白名单放行的是"关着的客户端 UI 行"；`
        + '打开它 = 两份预设各起一个写者，且它仍然到不了浏览器。要么关掉，要么标成宿主级。')
    }
    return { id, package: pkg.name, platform: pkg.platform, manifest: pkg.manifest, why: allow.why }
  }
  return null
}

/**
 * 把组合的行块分成**宿主级**与**预设级**：宿主级去顶层 `- insert:`，预设级进两份预设体。
 *
 * 判据按顺序：
 *   ① 行里有 `# @host-level`：
 *      · 位置必须是 `- id:` 的下一行、两格缩进 ⇒ 否则 `E_BUNDLE_HOST_MARK_POSITION`；
 *      · id 必须在 `HOST_LEVEL_IDS` 里 ⇒ 否则 `E_BUNDLE_HOST_UNLISTED`；
 *      · 不许写着 `disabled: true` ⇒ 否则 `E_BUNDLE_HOST_ROW_DISABLED`（宿主行关着 = 面板不启动）；
 *      · 整块进 `hostBlocks`，**不进任何一份预设体**。
 *   ② 没有标记但 id 在 `HOST_LEVEL_IDS` 里 ⇒ `E_BUNDLE_HOST_UNMARKED`（表与标记必须成对）。
 *   ③ 其余行过 `classifyPresetRow()`：客户端 UI 行（包事实）不在白名单且不是"白名单三格全中"
 *      ⇒ throw；组 `config` 里的嵌套行也过同一把尺子。
 * 收口：表里每个 id 都必须真的出现在组合里（`E_BUNDLE_HOST_ROW_MISSING`），预设体不许为空。
 *
 * @param {string[]} blocks `splitRows()` 出来的行块
 * @param {readonly string[]} [hostLevelIds] 点名表（默认 `HOST_LEVEL_IDS`；对照可传别的）
 * @param {string} [baseDir] 路径形 `name` 的解析基准（默认预设目录）
 * @returns {{hostBlocks: string[], presetBlocks: string[], allowedClientRows: object[]}}
 */
function partitionHostLevel(blocks, hostLevelIds = HOST_LEVEL_IDS, baseDir = PRESET) {
  if (!Array.isArray(hostLevelIds)) {
    throw new Error(`HOST_LEVEL_IDS 必须是数组，实得 ${typeof hostLevelIds}`)
  }
  const named = [...hostLevelIds]
  const hostBlocks = []
  const presetBlocks = []
  const allowedClientRows = []
  const seenHostIds = new Set()
  for (const block of blocks) {
    const lines = block.split('\n')
    const facts = rowFacts(block)
    const label = facts.id ?? '（没有 - id:）'
    const markIndex = lines.findIndex((line) => HOST_MARK_ANY.test(line))
    const listed = facts.id !== null && named.includes(facts.id)
    if (markIndex >= 0) {
      if (markIndex !== 1 || !HOST_MARK_LINE.test(lines[markIndex])) {
        throw new Error(`E_BUNDLE_HOST_MARK_POSITION 组合里的行 ${label} 的 \`# @host-level\` 位置不对`
          + `（在第 ${markIndex + 1} 行；只认 \`- id:\` 的下一行、两格缩进）—— `
          + '标记的位置本身是判据：写歪了就等于没标，而这一行会被当成预设行拷进两份预设。')
      }
      if (!listed) {
        throw new Error(`E_BUNDLE_HOST_UNLISTED 组合里的行 ${label} 标了 \`# @host-level\`，`
          + `但它的 id 不在 HOST_LEVEL_IDS（今天 ${JSON.stringify(named)}）—— `
          + '标记与点名表必须成对：只标不点名 ⇒ 生成器不知道该把哪一行发到顶层 insert。')
      }
      if (facts.disabled === 'true') {
        throw new Error(`E_BUNDLE_HOST_ROW_DISABLED 组合里的宿主级行 ${label} 写着 disabled: true —— `
          + '宿主级行关着 = 那一份插件不启动（面板写完了也不会出现）。要么打开，要么把它从 HOST_LEVEL_IDS 里撤掉。')
      }
      hostBlocks.push(block)
      seenHostIds.add(facts.id)
      continue
    }
    if (listed) {
      throw new Error(`E_BUNDLE_HOST_UNMARKED 组合里的行 ${label} 在 HOST_LEVEL_IDS 里，`
        + '但没写 `# @host-level`（`- id:` 的下一行、两格缩进）—— '
        + '表与标记必须成对：只点名不标 ⇒ 这一行会静默进预设体，面板就永远到不了浏览器。')
    }
    // ① 预设行：包事实判（解析不到 = 判不了 ⇒ throw，不当"不是"）；白名单绑 id + 包名 + 关着。
    const allowed = classifyPresetRow(facts, { where: '组合里的顶格行', baseDir })
    if (allowed !== null) allowedClientRows.push(allowed)
    // ② 组 `config` 里的行：`splitRows()` 只拆顶格行，这些行必须单独过同一把尺子 ——
    //    否则一条客户端 UI 行藏在组里就能原样被拷进预设体。
    for (const row of nestedRowsIn(block)) {
      const nestedAllowed = classifyPresetRow(row, {
        where: `组合里 ${label} 的 config 内嵌行（块内第 ${row.line} 行）`,
        baseDir,
      })
      if (nestedAllowed !== null) allowedClientRows.push(nestedAllowed)
    }
    presetBlocks.push(block)
  }
  const missing = named.filter((id) => !seenHostIds.has(id))
  if (missing.length > 0) {
    throw new Error(`E_BUNDLE_HOST_ROW_MISSING HOST_LEVEL_IDS 里的 ${JSON.stringify(missing)} 在组合里找不到`
      + '（没有一行带这个 `- id:`）—— 点名表与组合漂了：要么删表项，要么把行写回来。')
  }
  if (presetBlocks.length === 0) throw new Error('组合里一行预设级行都没有 —— 这不是一份可用的 bundle 补丁')
  return { hostBlocks, presetBlocks, allowedClientRows }
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

  // 分组：宿主级行（标记 + 点名表）去顶层 insert，预设级行进两份预设体；
  // 预设体里出现客户端 UI 行（包事实）⇒ throw（白名单三格全中的除外）。
  const { hostBlocks, presetBlocks, allowedClientRows } = partitionHostLevel(blocks)

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
   * 宿主级行**进顶层 `- insert:` 的直接成员**（与两条预设入口并列）—— 官方面板就是这个形状。
   * 它们**不进**任何一份预设体：一个包只有一个 Node 写者（否则每个预设各起一份、各写一份快照）。
   */
  const indentByFour = (text) => text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `    ${line}`))
    .join('\n')
  const hostBody = hostBlocks.map(indentByFour).join('\n\n')

  // 那一行仍然写相对路径：插入行的相对路径按**这份补丁所在目录**解析，
  // 而这份补丁就在预设文件夹里（profile 里那个 junction 指回 E:\Harness\presets\agenia）。
  // ⚠️ 它**不再**走 `cordis:include`，所以"按被包含文件解析"那条性质不适用了 ——
  //    解析基准变回"补丁文件所在目录"，而那个目录就是预设文件夹本身，结论一样。
  const text = `# Agenia 作为一个 DSH bundle 的补丁文件 —— 这份预设的**注册入口**。
#
# ── 这一份的顶层 insert：宿主级行 + 两条预设入口（官方形状）──────────────────
#   顶层 \`- insert:\` 的直接成员 = 宿主级行（客户端 UI 那类；组合里标了 \`# @host-level\`
#   并在生成器的 \`HOST_LEVEL_IDS\` 里点名）+ 两条 \`@deepseek-ai/dsh-agent-preset\`
#   （\`agenia\` / \`agenia-member\`）。后者的 \`config.plugins\` 是**会话**的组合，不进宿主树。
#   官方面板就是这个形状：\`@deepseek-ai/dsh-experimental-agent-team-profile\` 的补丁
#   顶层 \`- insert:\` 里装着 \`ui-agent-team\`（与两条服务行并列）。
#   🔴 宿主级行**绝不进预设体**：浏览器只收**宿主 Loader 树**里的条目
#   （\`@deepseek-ai/dsh-client-modules\` 只枚举 \`ctx.loader.entries()\`），而预设里的行由
#   \`@deepseek-ai/dsh-agent-preset\` 注册进它自建的 Loader 树；两处都放还会各起一个 Node 写者。
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
# ── 🔴 宿主级行的位置 ────────────────────────────────────────────────────────
# 组合里标了 \`# @host-level\` 的行只出现在**顶层 \`- insert:\` 的直接成员**里，不出现在任何
# 预设体里。标记与生成器的 \`HOST_LEVEL_IDS\` 必须成对；缺一边 / 位置写歪 ⇒ 生成器当场 throw。
# 生成器把宿主级行从两份预设体里**摘掉**再组装 —— 一个包只有一个 Node 写者。
# 理由见上面「这一份的顶层 insert」。
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

# ── 顶层 insert：宿主级行 + 预设入口（会话的组合；不进宿主树）────────────────
- insert:
${preset(LEADER_PRESET_ID, 'Agenia 模式', '带班子的工程组长。她自己分诊、派人、验收；手下四个固定岗位按次序干活，只审不改的岗位碰不到源码。', 10, leaderBody)}
${memberPreset}

${hostBody}
`
  // ── 产物侧对账（四条，都对着**字面**数，不对着"我以为写进去了"）──────────────
  // ① 每一份预设 `plugins:` 里的 `- id:`（10 格缩进）—— 只数，不写死；
  // ② 预设入口恰好两条（组长 + 通用组员）；
  // ③ 顶层 `- insert:` 恰好一个：直接成员 = 2 条预设入口 + `HOST_LEVEL_IDS.length` 条宿主行；
  // ④ 每一个宿主级 id 在整份文本里**只出现一次**（在 insert 里，不在任何预设体里）。
  const copied = (text.match(/^ {10}- id: /gm) ?? []).length
  const presetEntries = (text.match(/^ {4}- id: preset-/gm) ?? []).length
  const topInserts = (text.match(/^- insert:/gm) ?? []).length
  const insertMembers = (text.match(/^ {4}- id: /gm) ?? []).length
  if (presetEntries !== 2) throw new Error(`补丁里应有 2 条预设入口（组长 + 通用组员），实得 ${presetEntries}`)
  if (topInserts !== 1) throw new Error(`补丁顶层应恰好 1 个 \`- insert:\`，实得 ${topInserts}`
    + ' —— 宿主级行与两条预设入口都装在这一个 insert 里（官方形状）')
  const expectedMembers = 2 + hostBlocks.length
  if (insertMembers !== expectedMembers) {
    throw new Error(`顶层 insert 的直接成员应有 ${expectedMembers} 条（2 条预设入口 + ${hostBlocks.length} 条宿主行），实得 ${insertMembers}`)
  }
  for (const id of HOST_LEVEL_IDS) {
    const hits = text.split('\n').filter((line) => line.trim() === `- id: ${id}`).length
    if (hits !== 1) {
      throw new Error(`宿主级行 ${id} 在整份补丁里应出现 1 次（按 \`- id:\` 行数），实得 ${hits} 次 —— `
        + '它只许是顶层 insert 的直接成员，不许再被拷进任何一份预设体')
    }
  }
  return {
    text,
    sourceRows: ids(source).length,
    copied,
    blocks: blocks.length,
    memberCount: members.length,
    allowedClientRows,
    presetRows: presetBlocks.length,
    hostRows: hostBlocks.length,
  }
}

// ── 产物侧读数：**直接读盘上那份补丁**（不是生成器自己记的数）──────────────────
const indentOf = (line) => (/^[ ]*/.exec(line) ?? [''])[0].length

/**
 * 把一份 bundle 补丁文本解析成"盘上事实"：
 *   · 顶层 `- insert:` 几个、每个的直接成员（4 格缩进）几条；
 *   · 每一条成员 / 每一条预设体内的行，`name` 解析到哪个包、是不是客户端 UI；
 *   · 标记 `# @host-level` 出现几行。
 *
 * 为什么读文件而不是拿生成器的计数器：计数器可以写死（`hostRows: 0` 就是那么来的），
 * 文件不能 —— 手改 / 另一个 writer 写出来的东西，只有从文件读才看得见。
 *
 * @param {string} text 补丁全文（`--check` 传盘上那份；写盘后传回读的那份）
 * @returns {object} 顶层结构 + 客户端 UI 行的分组
 */
function describePatch(text) {
  const source = String(text)
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const rows = []
  let topInsert = false
  let currentPreset = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^- insert:\s*(?:#.*)?$/.test(line)) { topInsert = true; currentPreset = null; continue }
    if (/^- /.test(line)) { topInsert = false; currentPreset = null; continue }
    const item = /^(\s*)- (.*)$/.exec(line)
    if (item === null) continue
    const indent = item[1].length
    if (indent < 4) continue
    // 行体：到下一个缩进 <= 本行的 `- ` 项为止（空的 / 注释行跟着走）。
    let end = i + 1
    while (end < lines.length) {
      const next = lines[end]
      if (next.trim() === '' || /^\s*#/.test(next)) { end += 1; continue }
      if (indentOf(next) <= indent) break
      end += 1
    }
    const keyIndent = indent + 2
    const rest = item[2]
    const idRaw = /^id:\s*(.+?)\s*$/.exec(rest)?.[1] ?? null
    let nameRaw = /^name:\s*(.+?)\s*$/.exec(rest)?.[1] ?? null
    let disabledRaw = null
    for (let j = i + 1; j < end; j += 1) {
      if (indentOf(lines[j]) !== keyIndent) continue
      if (nameRaw === null) {
        const hit = new RegExp(`^ {${keyIndent}}name:\\s*(.+?)\\s*$`).exec(lines[j])
        if (hit !== null) nameRaw = hit[1]
      }
      if (disabledRaw === null) {
        const hit = new RegExp(`^ {${keyIndent}}disabled:\\s*(.+?)\\s*$`).exec(lines[j])
        if (hit !== null) disabledRaw = hit[1]
      }
    }
    if (nameRaw === null) continue // 容器（`- insert:` 之类的非行项 / 标量列表）不算行
    const row = {
      line: i + 1,
      indent,
      id: idRaw === null ? null : plainScalar(idRaw),
      name: plainScalar(nameRaw),
      disabled: disabledRaw === null ? null : plainScalar(disabledRaw),
      // 顶层 insert 的直接成员（4 格）vs 它的嵌套内容（> 4 且当前成员不是预设入口）
      // vs 预设体（`- id: preset-*` 那一行之后、10 格的 `plugins` 行）。
      placement: indent === 4 && topInsert
        ? 'insert'
        : indent > 4
          ? (currentPreset === null ? 'insert-nested' : 'preset-body')
          : 'other',
      parent: indent > 4 ? currentPreset : null,
    }
    row.pkg = rowPackage(row.name, PRESET)
    if (row.placement === 'insert') currentPreset = row.id
    rows.push(row)
  }
  const topInsertMembers = rows.filter((r) => r.placement === 'insert')
  const presetEntries = topInsertMembers.filter((r) => r.name === '@deepseek-ai/dsh-agent-preset')
  const otherMembers = topInsertMembers.filter((r) => r.name !== '@deepseek-ai/dsh-agent-preset')
  const unresolvedRows = rows.filter((r) => r.pkg.client === null)
  const clientInInsert = rows.filter((r) => r.placement === 'insert' && r.pkg.client === true)
  const clientInPreset = rows.filter((r) => r.placement === 'preset-body' && r.pkg.client === true)
  const clientInPresetDisabled = clientInPreset.filter((r) => r.disabled === 'true')
  const clientInPresetEnabled = clientInPreset.filter((r) => r.disabled !== 'true')
  // 宿主级 id 在补丁里**作为行 id**出现了几次（`- id: <id>` 逐行比，不看注释）
  const idRowHits = Object.fromEntries(HOST_LEVEL_IDS.map((id) => [
    id,
    rows.filter((row) => row.id === id).length,
  ]))
  return {
    rows,
    topInserts: (source.match(/^- insert:/gm) ?? []).length,
    topInsertMembers,
    presetEntries,
    otherMembers,
    unresolvedRows,
    clientInInsert,
    clientInPreset,
    clientInPresetDisabled,
    clientInPresetEnabled,
    markedRows: (source.match(/^\s*#\s*@host-level\b.*$/gm) ?? []).length,
    idRowHits,
  }
}

/** 盘上那份补丁的结构 / 层归属问题（空 = 通过）。 */
function patchProblems(facts) {
  const problems = []
  const brief = (row) => `${row.id ?? '（无 id）'}@L${row.line}（${row.pkg?.name ?? row.name}）`
  const expectedMembers = 2 + HOST_LEVEL_IDS.length
  if (facts.topInserts !== 1) {
    problems.push(`E_PATCH_TOP_INSERT_SHAPE 顶层 \`- insert:\` 应恰好 1 个（宿主级行 + 预设入口），实得 ${facts.topInserts}`)
  }
  if (facts.topInsertMembers.length !== expectedMembers) {
    problems.push(`E_PATCH_TOP_INSERT_SHAPE 顶层 insert 的直接成员应恰好 ${expectedMembers} 条`
      + `（${HOST_LEVEL_IDS.length} 条宿主行 + 2 条 @deepseek-ai/dsh-agent-preset），实得 ${facts.topInsertMembers.length}`)
  }
  if (facts.presetEntries.length !== 2) {
    problems.push(`E_PATCH_TOP_INSERT_SHAPE 顶层 insert 里 @deepseek-ai/dsh-agent-preset 应恰好 2 条，实得 ${facts.presetEntries.length}`)
  }
  for (const row of facts.otherMembers) {
    if (row.id === null || !HOST_LEVEL_IDS.includes(row.id)) {
      problems.push(`E_PATCH_TOP_INSERT_SHAPE 顶层 insert 里有一条既不是预设入口、也不在 HOST_LEVEL_IDS 的成员：`
        + `${brief(row)} —— 宿主级行必须点名（表与组合里的标记成对）`)
    }
  }
  // 宿主级行：顶层 insert 里恰好 1 次、预设体里 0 次。两条分开报 —— 手工把它们挪进预设体
  // 就是"两侧各一次"或"只在预设体里一次"，读数必须能指出是哪一半。
  for (const id of HOST_LEVEL_IDS) {
    const inInsert = facts.topInsertMembers.filter((row) => row.id === id).length
    const inPreset = facts.rows.filter((row) => row.id === id && row.placement === 'preset-body').length
    if (inInsert !== 1) {
      problems.push(`E_PATCH_HOST_ROW_MISSING 宿主级行 ${id} 在顶层 insert 里应出现 1 次，实得 ${inInsert} 次`)
    }
    if (inPreset !== 0) {
      problems.push(`E_PATCH_HOST_ROW_IN_PRESET 宿主级行 ${id} 出现在预设体里 ${inPreset} 次 —— `
        + '一个包只有一个 Node 写者；宿主级行只许是顶层 insert 的直接成员')
    }
  }
  for (const row of facts.unresolvedRows) {
    problems.push(`E_PATCH_CLIENT_UI_UNRESOLVED 补丁里有一行的包解析不出来（${row.pkg.unresolved}）：${brief(row)}`
      + ` · name=${JSON.stringify(row.name)} —— 判不了它是不是客户端 UI，**不许当"不是"**`)
  }
  for (const row of facts.clientInPresetEnabled) {
    problems.push(`E_PATCH_CLIENT_UI_ENABLED 预设体里有打开的客户端 UI 行：${brief(row)} —— 它到不了浏览器，还会在每一份预设里各起一个写者`)
  }
  for (const row of facts.clientInPresetDisabled) {
    const allow = KNOWN_CLIENT_UI_IN_PRESET.find((entry) => entry.id === row.id)
    if (allow === undefined) {
      problems.push(`E_PATCH_CLIENT_UI_UNLISTED 预设体里有客户端 UI 行不在点名白名单里：${brief(row)} —— 新行必须 throw 或进白名单（关着）`)
    } else if (allow.package !== row.pkg?.name) {
      problems.push(`E_PATCH_CLIENT_UI_ALLOW_MISMATCH 预设体里的 ${brief(row)} 用了白名单 id，但解析到的包不是白名单要求的那一个`
        + `（要求 ${JSON.stringify(allow.package)}）—— 白名单绑定 id + 包名 + 关着三格`)
    }
  }
  return problems
}

/**
 * 打一份"盘上补丁"的读数（`--check` 与写盘后回读共用）。
 * 这几格就是验收格要读的东西：顶层 insert / 直接成员（宿主 + 预设入口）/ 宿主级行 /
 * 预设体内客户端 UI 行 / 宿主级 id 出现次数 / 包解析不出的行。
 */
function printPatchFacts(facts, label) {
  const names = facts.clientInPreset.map((row) => `${row.id ?? '（无 id）'}${row.disabled === 'true' ? '(disabled)' : '(OPEN)'}`)
  const hostNames = facts.otherMembers.map((row) => `${row.id ?? '（无 id）'}@L${row.line}`)
  const unresolved = facts.unresolvedRows.map((row) => `${row.id ?? '（无 id）'}@L${row.line}(${row.pkg.unresolved})`)
  console.log(`       ${label}：顶层 - insert: ${facts.topInserts} 个 · 直接成员 ${facts.topInsertMembers.length} 条`
    + `（${facts.otherMembers.length} 宿主 + ${facts.presetEntries.length} 预设入口）· 标记 @host-level ${facts.markedRows} 行`)
  console.log(`       ${label}：宿主级行 ${facts.otherMembers.length} 条${hostNames.length === 0 ? '' : `（${hostNames.join(' · ')}）`}`
    + ` · 预设体内客户端 UI 行 ${facts.clientInPreset.length} 条（disabled ${facts.clientInPresetDisabled.length} / enabled ${facts.clientInPresetEnabled.length}）`
    + `${names.length === 0 ? '' : ` · 点名：${names.join(' · ')}`}`
    + ` · 顶层 insert 里解析到 web 包 ${facts.clientInInsert.length} 条`
    + ` · 包解析不出 ${facts.unresolvedRows.length} 条${unresolved.length === 0 ? '' : `（${unresolved.join(' · ')}）`}`)
  const hits = HOST_LEVEL_IDS.map((id) => `${id} ${facts.idRowHits[id] ?? 0} 次`).join(' · ')
  console.log(`       ${label}：宿主级 id 在文件里（按 \`- id:\` 行数）${hits}`)
}

/** 白名单放行了哪几行 —— 必须打在输出里（"放行的是哪一条"不许靠读的人猜）。 */
function printAllowedRows(rows) {
  for (const row of rows) {
    console.log(`  白名单    ${row.id}（${row.package} · platform ${row.platform}）· disabled: true · ${row.why}`)
  }
}

/**
 * 联锁的**阴性/阳性对照**：标记 / 点名表 / 包事实 / 白名单 / 裸名 / 坏 manifest / 嵌套行。
 * 该 throw 的必须 throw（并**带对具名码**）、该放行的必须放行并点名。
 * 这是这个联锁自己的刀 —— 没有它，"生成器会拒"只是一句自述。
 *
 * 两条夹具写在本仓库 `.tools/interlock-tmp-<随机>/` 里（跑完就删；C 盘一个字节不写）：
 *   · `broken-pkg/` —— `package.json` 不是 JSON（坏 manifest）；
 *   · `other-web/`  —— 另一个 `dsh.client.platform: web` 的包（白名单 id 复用）。
 *
 * 跑法：<node> .tools/make-bundle-patch.mjs --interlock-control
 * 退出码：0 = 每一格都翻面；1 = 有一格没翻面（联锁死了）。
 */
function runInterlockControl() {
  const toPosix = (value) => String(value).replace(/\\/g, '/').replace(/\/+$/, '')
  const fileUrl = (file) => `file:///${toPosix(file).replace(/^\/+/, '')}`
  const dashboardRowUrl = fileUrl(join(REPO, 'presets', 'agenia', 'client-ui-dashboard', 'lib', 'index.js'))
  const clientRow = (id, extra = [], url = dashboardRowUrl) => [`- id: ${id}`, `  name: '${url}'`, ...extra].join('\n')
  /** 宿主级行：`# @host-level` 必须在 `- id:` 的下一行（两格缩进）。 */
  const hostRow = (id, extra = [], url = dashboardRowUrl) => [`- id: ${id}`, '  # @host-level', `  name: '${url}'`, ...extra].join('\n')
  const personaRow = `- id: persona\n  name: '@deepseek-ai/dsh-persona'`

  const tmp = mkdtempSync(join(REPO, '.tools', 'interlock-tmp-'))
  let wrong = 0
  let total = 0
  try {
    const brokenDir = join(tmp, 'broken-pkg')
    mkdirSync(join(brokenDir, 'lib'), { recursive: true })
    writeFileSync(join(brokenDir, 'package.json'), '{ 这不是 JSON\n', 'utf8')
    writeFileSync(join(brokenDir, 'lib', 'index.js'), '', 'utf8')
    const brokenUrl = fileUrl(join(brokenDir, 'lib', 'index.js'))

    const otherDir = join(tmp, 'other-web')
    mkdirSync(join(otherDir, 'lib'), { recursive: true })
    writeFileSync(join(otherDir, 'package.json'), `${JSON.stringify({
      name: '@fixture/other-web',
      version: '0.0.0',
      type: 'module',
      dsh: { client: { platform: 'web' } },
      exports: { './client': './lib/client.js' },
    }, null, 2)}\n`, 'utf8')
    writeFileSync(join(otherDir, 'lib', 'client.js'), 'export default {}\n', 'utf8')
    writeFileSync(join(otherDir, 'lib', 'index.js'), 'export default {}\n', 'utf8')
    const otherUrl = fileUrl(join(otherDir, 'lib', 'index.js'))

    const cases = [
      // ── 客户端 UI 行：不在宿主级点名的行，进预设体一律 throw（这一类必须一直是关着的）──
      { name: '不带标记的客户端 UI 行（路径形，新 id）', blocks: [clientRow('agenia-dashboard-2')], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_IN_PRESET' },
      { name: '不带 id 的客户端 UI 行（只有 - name:）', blocks: [`- name: '${dashboardRowUrl}'`], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_IN_PRESET' },
      { name: '裸包名客户端 UI 行（@deepseek-ai/dsh-client-ui-chat）', blocks: [`- id: ui-chat-extra\n  name: '@deepseek-ai/dsh-client-ui-chat'`], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_IN_PRESET' },
      { name: '标记拼错的客户端 UI 行（@hostlevel）', blocks: [clientRow('agenia-dashboard-2', ['  # @hostlevel'])], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_IN_PRESET' },
      // ── 宿主级行：标记 + 点名表成对 ⇒ 进 insert、不进预设体（阳性对照）──────────
      { name: '宿主级行（标记 + 点名表）', blocks: [hostRow('agenia-dashboard'), personaRow], named: ['agenia-dashboard'], expect: 'allow', host: 'agenia-dashboard' },
      // ── 标记 / 点名表：三格缺一粒都 throw ─────────────────────────────────────
      { name: '只标不点名（标记在、id 不在表里）', blocks: [hostRow('agenia-dashboard'), personaRow], expect: 'throw', code: 'E_BUNDLE_HOST_UNLISTED' },
      { name: '只点名不标（id 在表里、标记没了）', blocks: [clientRow('agenia-dashboard'), personaRow], named: ['agenia-dashboard'], expect: 'throw', code: 'E_BUNDLE_HOST_UNMARKED' },
      { name: '表里的 id 在组合里找不到', blocks: [personaRow], named: ['agenia-dashboard'], expect: 'throw', code: 'E_BUNDLE_HOST_ROW_MISSING' },
      { name: '标记位置不对（写在 name 之后）', blocks: [`- id: agenia-dashboard\n  name: '${dashboardRowUrl}'\n  # @host-level`, personaRow], named: ['agenia-dashboard'], expect: 'throw', code: 'E_BUNDLE_HOST_MARK_POSITION' },
      { name: '标记缩进写错（4 格）', blocks: [`- id: agenia-dashboard\n    # @host-level\n  name: '${dashboardRowUrl}'`, personaRow], named: ['agenia-dashboard'], expect: 'throw', code: 'E_BUNDLE_HOST_MARK_POSITION' },
      { name: '宿主级行写着 disabled: true', blocks: [hostRow('agenia-dashboard', ['  disabled: true']), personaRow], named: ['agenia-dashboard'], expect: 'throw', code: 'E_BUNDLE_HOST_ROW_DISABLED' },
      // ── 白名单（预设体里被硬塞的客户端 UI 行）：三格全中才放行 ───────────────────
      { name: '白名单行（预设体、disabled: true）', blocks: [clientRow('agenia-dashboard', ['  disabled: true']), personaRow], expect: 'allow', allowId: 'agenia-dashboard' },
      { name: '白名单行但没写 disabled: true', blocks: [clientRow('agenia-dashboard'), personaRow], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_ENABLED' },
      { name: '白名单 id 指向另一个 web 包（@fixture/other-web）', blocks: [`- id: agenia-dashboard\n  name: '${otherUrl}'\n  disabled: true`, personaRow], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_ALLOW_MISMATCH' },
      // ── 三态解析：坏 manifest / 找不到 manifest 都不是"不是客户端 UI" ────────────
      { name: '坏 manifest 的路径形行（新 id）', blocks: [clientRow('agenia-dashboard-broken', [], brokenUrl), personaRow], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_UNRESOLVED' },
      { name: '路径形行解析不到 package.json', blocks: [`- id: nowhere\n  name: 'file:///Z:/no-such-tree/lib/index.js'`, personaRow], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_UNRESOLVED' },
      // ── 组 config 里的嵌套行：同一把尺子 ───────────────────────────────────────
      { name: '嵌套在组 config 里的客户端 UI 行（splitRows 拆不到）', blocks: [`- id: planning\n  name: cordis:group\n  config:\n    - id: hidden-client-row\n      name: '${dashboardRowUrl}'`], expect: 'throw', code: 'E_BUNDLE_CLIENT_UI_IN_PRESET' },
      { name: '嵌套在组 config 里的普通行（不误伤）', blocks: [`- id: planning\n  name: cordis:group\n  config:\n    - id: plan-mode\n      name: '@deepseek-ai/dsh-plan-mode'`], expect: 'allow' },
      { name: '普通非客户端行（persona）', blocks: [personaRow], expect: 'allow' },
    ]
    total = cases.length
    for (const c of cases) {
      let result = null
      let error = null
      try { result = partitionHostLevel(c.blocks, c.named ?? []) } catch (err) { error = err }
      if (c.expect === 'throw') {
        if (error === null) {
          console.log(`  RED  ${c.name}：没有 throw —— 联锁没拦住`)
          wrong += 1
        } else if (c.code !== undefined && !String(error.message).startsWith(c.code)) {
          console.log(`  RED  ${c.name}：throw 了，但码不是 ${c.code} —— ${String(error.message).slice(0, 200)}`)
          wrong += 1
        } else {
          console.log(`  ok   ${c.name}：throw ${c.code ?? ''} —— ${String(error.message).slice(0, 200)}`)
        }
        continue
      }
      if (error !== null) {
        console.log(`  RED  ${c.name}：不该 throw 却 throw 了 —— ${String(error.message).slice(0, 240)}`)
        wrong += 1
        continue
      }
      const named = (result.allowedClientRows ?? []).map((row) => row.id)
      if (c.allowId !== undefined && !named.includes(c.allowId)) {
        console.log(`  RED  ${c.name}：放行了但输出里没点名（白名单 ${JSON.stringify(named)}）`)
        wrong += 1
        continue
      }
      if (c.host !== undefined) {
        const inHost = result.hostBlocks.filter((block) => block.split('\n')[0].trim() === `- id: ${c.host}`)
        const inPreset = result.presetBlocks.filter((block) => block.split('\n').some((line) => line.trim() === `- id: ${c.host}`))
        if (inHost.length !== 1 || inPreset.length !== 0) {
          console.log(`  RED  ${c.name}：宿主级落点不对（insert ${inHost.length} 次 · 预设体 ${inPreset.length} 次）`)
          wrong += 1
          continue
        }
      }
      console.log(`  ok   ${c.name}：放行${named.length === 0 ? '（非客户端行，不点名）' : ` · 点名 ${named.join(' / ')}`}`
        + `（预设级 ${result.presetBlocks.length} 条 · 宿主级 ${result.hostBlocks.length} 条`
        + `${c.host === undefined ? '' : ` · 宿主行 ${c.host} 在 insert 1 次 / 预设体 0 次`}）`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (wrong > 0) process.exit(1)
  console.log(`INTERLOCK-CONTROL ${total}/${total} 都翻面`)
  process.exit(0)
}

const ARGV = process.argv.slice(2)
if (ARGV.includes('--interlock-control')) runInterlockControl()

// ── 产物侧读数（外部文件）：手工挪行 / 另一份 writer 的产物，读数只认文件 ────────────
const describeArg = ARGV.find((a) => a.startsWith('--describe='))
if (describeArg !== undefined) {
  const target = resolve(describeArg.slice('--describe='.length))
  let text = ''
  try {
    text = readFileSync(target, 'utf8')
  } catch (err) {
    console.log(`  RED  E_PATCH_UNREADABLE 读不到 ${target}：${String(err?.message ?? err)}`)
    process.exit(1)
  }
  const facts = describePatch(text)
  const problems = patchProblems(facts)
  printPatchFacts(facts, target)
  for (const problem of problems) console.log(`  RED  ${problem}`)
  console.log(problems.length === 0
    ? '  ok   产物侧读数：这份文件的结构 / 层归属都成立'
    : `  RED  产物侧读数：${problems.length} 条问题`)
  process.exit(problems.length === 0 ? 0 : 1)
}

const isCheck = ARGV.includes('--check')
let built
try {
  built = build()
} catch (err) {
  // `--check` 的失败要长成"退出码 + 一句判词"：判据那边按 `exit 1 && stderr 为空 && 报文里有 RED`
  // 读"不一致"；带栈的崩会被读成另一件事（崩 ≠ 不一致）。
  if (isCheck) {
    console.log(`  RED  组合本体过不了生成器的联锁：${String(err?.message ?? err)}`)
    process.exit(1)
  }
  throw err
}
const { text, sourceRows, copied, blocks, memberCount, allowedClientRows, presetRows, hostRows } = built

if (isCheck) {
  let current = ''
  try {
    current = readFileSync(TARGET, 'utf8')
  } catch {
    current = ''
  }
  const same = current === text
  const fileFacts = describePatch(current)
  const fileProblems = patchProblems(fileFacts)
  const ok = same && fileProblems.length === 0
  if (same) {
    console.log(ok
      ? `  ok   cordis.patch.yml 与 agent.cordis.yml 一致（${blocks} 条顶格行 → ${presetRows} 条预设级 + ${hostRows} 条宿主级 · 2 份预设（1 组长 + 1 通用组员） · ${memberCount} 条委派行同指 ${MEMBER_PRESET_ID} · 拷进来 ${copied} 个 id）`
      : '  RED  cordis.patch.yml 与组合一致，但**盘上补丁的结构 / 层归属不对**：')
  } else {
    console.log('  RED  E_PATCH_NOT_DERIVED cordis.patch.yml 与 agent.cordis.yml 对不上 —— 改了 .yml 就跑 <node> .tools/make-bundle-patch.mjs')
  }
  printPatchFacts(fileFacts, '盘上补丁')
  printAllowedRows(allowedClientRows)
  for (const problem of fileProblems) console.log(`  RED  ${problem}`)
  process.exit(ok ? 0 : 1)
}

writeFileSync(TARGET, text, 'utf8')
const written = readFileSync(TARGET, 'utf8')
const writtenFacts = describePatch(written)
const writtenProblems = patchProblems(writtenFacts)
console.log(`写出 ${TARGET}`)
// ⚠️ 这两个数**本来就不相等**，不是一个"对不上"：
//    `copied` 数的是**每一份预设的顶层行块**总和，`sourceRows` 数的是源文件里**全部 `- id:`**
//    （含组内子行）。真正的对账是 `--check` 那条（整份文本逐字比）。
console.log(`  ${blocks} 条顶格行 → ${presetRows} 条预设级 + ${hostRows} 条宿主级 · 2 份预设（1 组长 + 1 通用组员） · ${memberCount} 条委派行同指 ${MEMBER_PRESET_ID} · 补丁里拷进来 ${copied} 条 · 源文件共 ${sourceRows} 个 id`)
printPatchFacts(writtenFacts, '回读')
printAllowedRows(allowedClientRows)
if (writtenProblems.length > 0) {
  // writer 自己产出的东西也要过同一把尺子：写进去的形状不对 ⇒ 非零。
  for (const problem of writtenProblems) console.log(`  RED  ${problem}`)
  process.exit(1)
}
