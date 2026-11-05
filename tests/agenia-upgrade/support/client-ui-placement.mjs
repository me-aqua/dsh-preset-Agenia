/**
 * **客户端 UI 行的层归属（bundle 层）** —— `DASH-15` / `DASH-16` 的判据本体 + 真字节夹具。
 *
 * 一句话：**一行的层归属由"它指向的包是不是客户端 UI"决定，不由"作者记不记得写标记 / 点名表"决定。**
 *
 * ── 🔴 2026-11-05 深夜：判据的载体从 **profile 补丁** 搬回 **bundle 补丁** ────────────
 * 16:0x 那次"把看板那一行搬进宿主的 `- insert:` 会让整个 bundle 层 boot 失败"的归因**已被证伪**
 * （`bug-20261105-12` rejected）。官方那个"智能体团队"面板（`@deepseek-ai/dsh-experimental-agent-team-profile`）
 * 就是挂在自己的 `dsh.bundle.patch` **顶层 `- insert:`** 里 —— 我们自己的包 `agenia-injector` 有同一个
 * `dsh.bundle.patch`。⇒ 挂载回到我们自己的包，形状照官方，**C 盘一个字节都不用动**。
 * 于是这一份量具判的是 `presets/agenia/cordis.patch.yml`：
 *
 *   · **顶层恰好一个 `- insert:`**，直接成员 = **3 条（1 条宿主行 + 2 条预设入口）**；
 *   · 看板那一行是这个 insert 的**直接成员**、开着、`name` 指得到包；
 *   · 那个包声明 `dsh.client.platform: web` + `exports["./client"]`，且它的 **Node 入口文件在盘上**；
 *   · **两份预设体里一条客户端 UI 行都没有**（路径形名字与裸包名都算）—— 一个包只有一个 Node 写者；
 *   · `agenia-dashboard` 在整份文件里**恰好出现 1 次**（只在顶层 insert 里）。
 *
 * ── 两个入口，各判各的（不互相消费，也不用剔除名单）───────────────────────────────
 *   · `scanBundleMount()` —— **DASH-15**：顶层 insert 的形状 + 看板那一行（位置 / 行体 / 包 / Node 入口）。
 *     行**不在** ⇒ `DASH-ROW-ABSENT`（**红**：缺席是关于产品的事实，不是"我读不到"）。
 *   · `scanClientUiPlacement()` —— **DASH-16**：语义面。任何一行的 `name` 解析到盘上的
 *     `package.json`，只要那个包声明 `dsh.client.platform: "web"`，它就**不许**住在预设体里
 *     （⇒ `DASH-CLIENT-IN-PRESET`）也不许住在顶层 override 里（⇒ `DASH-CLIENT-OUTSIDE-INSERT`）；
 *     看板那一行必须**恰好一次**（⇒ `DASH-HOST-ROW-COUNT`，含文件里 `agenia-dashboard` 的文本出现次数）。
 *     两者都不读标记、不读生成器的点名表。
 *
 * 🔴 **解析面（这一格的边界，读之前先知道）** —— `name` 的两种形状：
 *   · **路径形**（`file:///…`、绝对路径）：从入口文件往上找最近的 `package.json`（真解析）；
 *   · **裸包名**（`@scope/pkg`）：在调用方给的 `manifestRoots` 里按 `package.json` 的 `name` 匹配
 *     （这棵树没有 `node_modules`；框架包在 `app.asar` 里，盘上解析不到）。
 *   两种都解析不到的裸名记进读数 `unresolved`，**不冒充"不是客户端 UI"、也不冒充判过**：
 *   住在预设体里又解析不到 ⇒ **HOLD `DASH-ROW-PACKAGE-UNRESOLVED`**（第三态，永不假绿）。
 *   只对预设体里的行开火：顶层 `- id: ui-chat` 那种 **override** 行的名字本来就在 `app.asar` 里，
 *   对它们开火会把这一格变成常驻 HOLD（`cand-20261019-0042` 那个病）。
 *
 * ── 🔴 退役的码（写清原因，不静默消失）──────────────────────────────────────────
 *   · **`DASH-PROFILE-*` 全家**（`DASH-PROFILE-MOUNT-MISSING` / `DASH-NOT-PROFILE-INSERT` /
 *     `DASH-PROFILE-ROW-HAS-ID` / `DASH-PROFILE-ROW-DISABLED` / `DASH-CLIENT-NOT-IN-PROFILE-INSERT`）：
 *     它们判的是 **profile 补丁**（`$DSH_PROFILE_DIR/cordis.patch.yml`）。挂载搬回 bundle 之后，
 *     profile 补丁里**按设计没有**看板那一行 ⇒ 留着它们就是第二套"挂载没做"的码，两套码同时
 *     声称同一件事。**判定：这一族码退役**（本条即墓碑），profile 那条路线保留为**备用**：
 *     `.tools/mount-dashboard-profile.mjs` 自己是它的检查器（`--check/--apply/--revert`），
 *     本文件只给一个**纯读数** `profileMountReading()`（`{exists, mounted, rows}`，**不产码、不进判词**）。
 *   · **`DASH-NOT-HOST-LEVEL`**：2026-11-05 晚迁到 profile 层时被退役（"bundle 层没有宿主装载层了"）。
 *     现在那个形状回来了 ⇒ **复活**，含义照旧：看板那一行在补丁里，但不是顶层 `- insert:` 的直接成员。
 *   · **`DASH-ROW-ABSENT`**：同上，**复活**；而且它是**红**（不是 HOLD）。
 *   · **`DASH-HOST-MISSING`**：仍退役。"整份补丁里没有任何 web 包"这个集合命题被 `DASH-ROW-ABSENT`
 *     （看板那一行）+ `DASH-NO-CLIENT-DECL`（包声明）各自取代；留着它只会造一条与它们重叠的红。
 *   · **`DASH-CLIENT-IN-BUNDLE-TOP`**：仍退役。它的旧含义是"客户端 UI 行住在 bundle 顶层就算错"，
 *     而顶层 insert 现在**正是**客户端 UI 行该住的地方 ⇒ 旧含义反了。新的那一半（住在顶层
 *     **override** 里 = 既不在 insert、也不在预设）由新码 `DASH-CLIENT-OUTSIDE-INSERT` 承担。
 *   · **`DASH-DISABLED-MISMATCH`**：退役。"两侧 disabled 只翻一侧"是回滚期的形状；今天那一行
 *     开着，补丁是派生物 ⇒ 两侧不一致由派生物那一腿（`DASH-PATCH-NOT-DERIVED`）抓，
 *     单独翻 `disabled` 由 `DASH-ROW-DISABLED` 抓。
 *   · **`DASH-ROW-PACKAGE-UNRESOLVED`**：退役（同一个理由的另一面）。它给"预设体里名字解析不到
 *     包的行"记 HOLD。在 **profile 补丁**里那件事偶尔发生；在 **bundle 补丁**里它是**常态**：
 *     两份预设体里六十来行全是框架裸包名（`@deepseek-ai/dsh-tool-*`，真身在 `app.asar` 里），
 *     这棵树解析不到它们 ⇒ 那条规则会让 `DASH-16` **每一次都挂起 60 条**（`cand-20261019-0042`
 *     那个病的教科书形状）。⇒ 本格把它们记成**读数** `unresolved_in_preset`（读不到 ≠ 不是），
 *     判定落在生成器那一侧（`E_BUNDLE_CLIENT_UI_UNRESOLVED` / `E_BUNDLE_CLIENT_UI_IN_PRESET`
 *     fail-closed），以及 `DASH-15` 的派生物那一腿。
 *   · **`DASH-MOUNT-DISABLED-PENDING-PROFILE-LAYER`** → 更名 **`DASH-MOUNT-DISABLED-PENDING`**：
 *     它是 `PRS-01` 回滚窗口那一条 HOLD，事实是"那一行被故意关着"，与哪一层无关。
 *
 * ⚠️ 判读边界（不归这一格）：像素 / 浏览器真的收到包归 GUI 清单与 `BOOT-02`；
 *   "生成补丁是不是生成器的派生物 / 派生物结构对不对"归 `DASH-15` 的派生物那一腿。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cfg, parseYamlSubset } from './composition.mjs'
import { PATHS } from './env.mjs'
import { problem } from './evidence.mjs'

/** 框架 `ClientModuleRegistry` 认的那个值（`processOne()` 的声明门槛）。 */
export const CLIENT_UI_PLATFORM = 'web'

/** 预设入口那一行的 `name`（两条）。 */
const REGISTRATION_NAME = '@deepseek-ai/dsh-agent-preset'
/** 顶层 insert 里应有几条预设入口（0.2.1：组长 + 通用组员）。 */
export const PRESET_ENTRY_COUNT = 2

/** 这一格的码（稳定、可 grep）。 */
export const CODES = Object.freeze({
  /** 补丁里**没有**任何一行解析到看板包 —— 挂载没做（**红**，不是 HOLD）。 */
  rowAbsent: 'DASH-ROW-ABSENT',
  /** 看板那一行在补丁里，但**不是**顶层 `- insert:` 的直接成员（宿主装载层收不到它）。 */
  notHostLevel: 'DASH-NOT-HOST-LEVEL',
  /** 看板那一行是顶层 insert 的直接成员，但 `disabled: true` —— 一行关着的不是一次挂载。 */
  rowDisabled: 'DASH-ROW-DISABLED',
  /** 顶层 insert 的形状不对：不是恰好 1 个 / 预设入口不是 2 条 / 宿主级行多于 1 条 / 多出别的成员。 */
  topInsertShape: 'DASH-TOP-INSERT-SHAPE',
  /** 那一行指不到包 / 包没声明 `dsh.client.platform: web` / 没 `exports["./client"]` / 没 `config.root` / Node 入口不在。 */
  noClientDecl: 'DASH-NO-CLIENT-DECL',
  /** 预设体（任一 `config.plugins` 子树）里有一行客户端 UI —— 一个包只有一个 Node 写者，且浏览器收不到它。 */
  clientInPreset: 'DASH-CLIENT-IN-PRESET',
  /** 客户端 UI 行住在顶层 **override** 里 —— 既不在 insert（没人装它），也不在预设（没人认它）。 */
  clientOutsideInsert: 'DASH-CLIENT-OUTSIDE-INSERT',
  /** 看板那一行在整份补丁里不是**恰好一次**（语义计数 + `agenia-dashboard` 的文本出现次数）。 */
  hostRowCount: 'DASH-HOST-ROW-COUNT',
  patchUnreadable: 'DASH-PATCH-UNREADABLE',
})

/**
 * **回滚窗口那枚第三态码** —— 今天只剩 `PRS-01` 在用。
 *
 * 一句话：看板那一行在**组合**里 `disabled: true`（老板拍的回滚）⇒ "组长块的值行与基线逐行相同"
 * 这一格在回滚窗口里量不了 ⇒ 记 HOLD（第三态）。缺行/关行本身在 `DASH-15` 里是**红的**
 * （`DASH-ROW-ABSENT` / `DASH-ROW-DISABLED`），不是 HOLD。
 * （2026-11-05 晚由 `…-PROFILE-LAYER` 更名：事实是"被故意关着"，与哪一层无关。）
 */
export const DISABLED_PENDING_CODE = 'DASH-MOUNT-DISABLED-PENDING'

const GROUP_NAME = 'cordis:group'
/** 路径形名字（与框架的 `pathLike` 同一族：`file:` / 盘符 / 斜杠 / `./` `../`）。 */
const PATH_LIKE = /^(file:|[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|\\\\)/
const relOf = (file) => path.relative(PATHS.repo, file).replace(/\\/g, '/')
const sameFile = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase()

// ── 行模型：一行的"位置"用**结构**判（节点在哪），不数缩进 ──────────────────────
/**
 * 补丁里的"行"= 带 `name` 的映射（`id` 可选）。三处位置：
 *   · `insert` —— 顶层 `- insert:` 的直接成员（**宿主装载层**，新增行的唯一入口）；
 *   · `top`    —— 顶层条目本身（`- id: ui-chat` 那种 override：改一条已存在的行）；
 *   · `nested` —— 住进别人 `config` 里的行（预设体等）。
 * `in_preset_body` = 这一行住在某条 `@deepseek-ai/dsh-agent-preset` 的 `config` 子树里。
 *
 * @param {unknown} node
 * @param {{placement:'insert'|'top'|'nested', inPreset:boolean, preset:string|null, where:string}} ctx
 * @param {object[]} out
 */
function walkRows(node, ctx, out) {
  if (Array.isArray(node)) {
    for (const item of node) walkRows(item, ctx, out)
    return out
  }
  if (!(node instanceof Map)) return out
  const name = node.get('name')
  const isRow = typeof name === 'string'
  if (isRow) {
    out.push({
      map: node,
      name,
      id: node.get('id') ?? null,
      disabled: node.get('disabled') ?? null,
      placement: ctx.placement,
      in_preset_body: ctx.inPreset,
      preset: ctx.preset,
      where: ctx.where,
    })
  }
  for (const [key, value] of node) {
    if (!(value instanceof Map || Array.isArray(value))) continue
    // 预设体从**注册行的 `config`** 开始；组行（`cordis:group`）的 `config` 只是更深一层，沿用上下文。
    const entersPreset = isRow && name === REGISTRATION_NAME && key === 'config'
    const presetId = entersPreset
      ? (cfg({ config: node.get('config') }, 'id') ?? node.get('id') ?? '?')
      : ctx.preset
    walkRows(value, {
      placement: isRow ? 'nested' : ctx.placement,
      inPreset: ctx.inPreset || entersPreset,
      preset: presetId,
      where: entersPreset ? `预设 ${presetId} 的 config` : `${ctx.where} → ${key}`,
    }, out)
  }
  return out
}

/**
 * 一份补丁的**结构读数 + 行表**（后面两个扫描器共用；纯函数，可喂夹具）。
 * @param {string} patchText
 * @param {string} label
 */
export function describePlacement(patchText, label = '补丁') {
  const doc = parseYamlSubset(patchText, `${label}·placement`)
  const rows = []
  const insert_blocks = []
  const top_level_blocks = []
  const ops = Array.isArray(doc.value) ? doc.value : []
  ops.forEach((op, index) => {
    if (!(op instanceof Map)) {
      top_level_blocks.push({ index: index + 1, kind: 'not-a-map' })
      return
    }
    const insert = op.get('insert')
    if (Array.isArray(insert)) {
      insert_blocks.push({ index: index + 1, members: insert.length })
      top_level_blocks.push({ index: index + 1, kind: 'insert' })
      for (const item of insert) {
        walkRows(item, { placement: 'insert', inPreset: false, preset: null, where: '顶层 `- insert:` 的直接成员' }, rows)
      }
      return
    }
    const isRow = typeof op.get('name') === 'string'
    const isOverride = typeof op.get('id') === 'string'
    top_level_blocks.push({ index: index + 1, kind: isRow ? 'row' : isOverride ? 'override' : 'other' })
    if (isRow || isOverride) {
      walkRows(op, { placement: 'top', inPreset: false, preset: null, where: '顶层条目（不是 `- insert:` 的直接成员）' }, rows)
    }
  })
  return { doc, rows, insert_blocks, top_level_blocks }
}

// ── 解析面：`name` → 盘上那份 `package.json` ────────────────────────────────
/** 从入口文件往上找最近的那份 `package.json`（插件身份就在它里面）。 */
function nearestPackage(entryFile) {
  let dir = path.dirname(entryFile)
  for (let i = 0; i < 10; i += 1) {
    const file = path.join(dir, 'package.json')
    if (existsSync(file)) {
      try {
        return { ok: true, how: 'nearest-package.json', file, value: JSON.parse(readFileSync(file, 'utf8')), error: null }
      } catch (err) {
        return { ok: false, how: 'package-json-unreadable', file, value: null, error: String(err?.message ?? err) }
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return { ok: false, how: 'no-package-json', file: null, value: null, error: '从入口文件往上找不到 package.json' }
}

/**
 * 给定根下所有 `package.json` 的**名字索引**（裸包名那一半的解析面）。
 * 跳过 `node_modules` / `.runtime` / `.git`；深度与份数都有上限，超了记 `truncated`（读数，不静默）。
 */
export function manifestIndexOf(roots) {
  const byName = new Map()
  const files = []
  const problems = []
  let truncated = false
  const SKIP = new Set(['node_modules', '.runtime', '.git'])
  const walk = (dir, depth) => {
    if (truncated) return
    let names
    try {
      names = readdirSync(dir).sort()
    } catch (err) {
      problems.push(`${dir}：${String(err?.message ?? err)}`)
      return
    }
    for (const name of names) {
      if (truncated) return
      if (SKIP.has(name)) continue
      const full = path.join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (depth < 6) walk(full, depth + 1)
        continue
      }
      if (!st.isFile() || name !== 'package.json') continue
      files.push(full)
      if (files.length > 500) {
        truncated = true
        return
      }
      try {
        const value = JSON.parse(readFileSync(full, 'utf8'))
        if (typeof value?.name === 'string' && !byName.has(value.name)) byName.set(value.name, { file: full, value })
      } catch (err) {
        problems.push(`${full}：${String(err?.message ?? err)}`)
      }
    }
  }
  for (const root of roots) if (existsSync(root)) walk(path.resolve(root), 0)
  return { byName, files, problems, truncated }
}

/**
 * 一行的 `name` → 盘上那份 `package.json`（解析不到就如实说哪一步断的）。
 * @param {unknown} rowName
 * @param {ReturnType<typeof manifestIndexOf>} index
 */
export function resolveRowPackage(rowName, index) {
  if (typeof rowName !== 'string' || rowName.trim() === '') {
    return { ok: false, how: 'no-name', file: null, value: null, error: '这一行没有可解析的 `name`' }
  }
  const name = rowName.trim()
  if (name === GROUP_NAME) return { ok: false, how: 'not-a-package', file: null, value: null, error: '`cordis:group` 是组，不是包' }
  if (PATH_LIKE.test(name)) {
    let entryFile = null
    try {
      entryFile = name.startsWith('file:') ? fileURLToPath(name) : path.resolve(name)
    } catch (err) {
      return { ok: false, how: 'bad-path', file: null, value: null, error: `不是可解析的路径：${String(err?.message ?? err)}` }
    }
    return nearestPackage(entryFile)
  }
  const hit = index.byName.get(name)
  if (hit !== undefined) return { ok: true, how: 'manifest-name', file: hit.file, value: hit.value, error: null }
  return {
    ok: false,
    how: 'unresolved-bare',
    file: null,
    value: null,
    error: `裸包名 ${name} 在给定根里没有 package.json（这棵树没有 node_modules）`,
  }
}

/**
 * 那个包的 **Node 入口**在不在盘上。这是"包声明齐全"之外的第六条腿：
 * 包声明了也会挂，声明不全会挂，但**入口文件不在**同样挂不起来（`main` / `exports["."]` 指空）。
 *
 * @param {{ok:boolean, file:string|null, value:any}} pkg
 * @param {string} rowName 行上的 `name`（路径形时它本身就是入口文件）
 * @returns {{ok:boolean, entry:string|null, how:string, exists:boolean}}
 */
export function nodeEntryOf(pkg, rowName) {
  if (!pkg.ok) return { ok: false, entry: null, how: 'package-unresolved', exists: false }
  const name = String(rowName).trim()
  if (PATH_LIKE.test(name)) {
    let entry = null
    try {
      entry = name.startsWith('file:') ? fileURLToPath(name) : path.resolve(name)
    } catch {
      return { ok: false, entry: null, how: 'bad-path', exists: false }
    }
    return { ok: existsSync(entry) && statSync(entry).isFile(), entry, how: 'row-name', exists: existsSync(entry) }
  }
  const dir = path.dirname(pkg.file)
  const exp = pkg.value?.exports
  const dot = exp instanceof Object && !Array.isArray(exp) ? exp['.'] : null
  const targets = []
  if (typeof dot === 'string') targets.push(dot)
  else if (dot !== null && typeof dot === 'object') {
    for (const key of ['default', 'import', 'require', 'node']) if (typeof dot[key] === 'string') targets.push(dot[key])
  }
  if (typeof pkg.value?.main === 'string') targets.push(pkg.value.main)
  targets.push('index.js')
  for (const target of targets) {
    const entry = path.resolve(dir, target)
    if (existsSync(entry) && statSync(entry).isFile()) return { ok: true, entry, how: `package-${target === 'index.js' ? 'default' : 'entry'}`, exists: true }
  }
  return { ok: false, entry: path.resolve(dir, targets[0]), how: 'entry-missing', exists: false }
}

/**
 * 一行的**语义分类**（两个扫描器共用）：它指向的包是不是客户端 UI、是不是看板那一行。
 * 看板那一行按**包的身份证**认（`dashboardManifest` 那一份 `package.json`），不按 id / 名字形状。
 * `id_is_dashboard` 另外记着"行 id 恰好是那个名字"—— 它只用来给"id 都在、包却不是那份"点名。
 */
function classifyRows(rows, { manifestRoots = [], dashboardManifest, expectedRowId = 'agenia-dashboard' }) {
  const index = manifestIndexOf(manifestRoots)
  let dashboardName = null
  let manifestError = null
  if (existsSync(dashboardManifest)) {
    try {
      dashboardName = JSON.parse(readFileSync(dashboardManifest, 'utf8')).name ?? null
    } catch (err) {
      manifestError = String(err?.message ?? err)
    }
  }
  const classified = rows.map((row) => {
    const pkg = resolveRowPackage(row.name, index)
    const platform = pkg.ok ? (pkg.value?.dsh?.client?.platform ?? null) : null
    return {
      row,
      pkg,
      platform,
      client: platform === CLIENT_UI_PLATFORM,
      is_dashboard: pkg.ok && (
        (pkg.file !== null && sameFile(pkg.file, dashboardManifest))
        || (dashboardName !== null && pkg.value?.name === dashboardName)
      ),
      id_is_dashboard: row.id === expectedRowId,
    }
  })
  return { index, dashboardName, dashboard: { manifest: dashboardManifest, name: dashboardName, error: manifestError }, classified }
}

/** 解析面的读数（每个 `how` 一个计数器 —— 求和要能对上总行数）。 */
const BUCKET = {
  'nearest-package.json': 'nearest_package',
  'manifest-name': 'manifest_name',
  'unresolved-bare': 'unresolved_bare',
  'not-a-package': 'not_a_package',
  'no-name': 'no_name',
  'bad-path': 'bad_path',
  'no-package-json': 'no_package_json',
  'package-json-unreadable': 'package_json_unreadable',
}
function resolveReading(classified) {
  const out = {
    nearest_package: 0,
    manifest_name: 0,
    unresolved_bare: 0,
    not_a_package: 0,
    no_name: 0,
    bad_path: 0,
    no_package_json: 0,
    package_json_unreadable: 0,
  }
  for (const c of classified) {
    const bucket = BUCKET[c.pkg.how] ?? c.pkg.how
    out[bucket] = (out[bucket] ?? 0) + 1
  }
  return out
}

/**
 * **`DASH-15` 的判据本体**：顶层 insert 的形状 + 看板那一行（位置 / 行体 / 包 / Node 入口）。
 *
 * @param {{patchText:string, label?:string, manifestRoots?:string[], dashboardManifest:string,
 *          expectedRowId?:string, expectedPresetEntries?:number}} input
 *   `dashboardManifest` = 看板包 `package.json` 的绝对路径（认"那一行是哪一行"靠它，不靠 id）。
 * @returns {{problems: object[], reading: object}}
 */
export function scanBundleMount({
  patchText,
  label = 'bundle 补丁',
  manifestRoots = [],
  dashboardManifest,
  expectedRowId = 'agenia-dashboard',
  expectedPresetEntries = PRESET_ENTRY_COUNT,
}) {
  const { doc, rows, insert_blocks, top_level_blocks } = describePlacement(patchText, label)
  const { index, dashboard, classified } = classifyRows(rows, { manifestRoots, dashboardManifest, expectedRowId })
  const problems = []
  const insertMembers = classified.filter((c) => c.row.placement === 'insert')
  const presetEntries = insertMembers.filter((c) => c.row.name === REGISTRATION_NAME)
  const hostMembers = insertMembers.filter((c) => c.row.name !== REGISTRATION_NAME)
  const dash = classified.filter((c) => c.is_dashboard)
  const dashById = classified.filter((c) => c.id_is_dashboard)
  // `agenia-dashboard` 的**文本**出现次数（按 `- id:` 行数；注释不算）—— 验收行的一条。
  const textHits = String(patchText).split('\n').filter((line) => line.trim() === `- id: ${expectedRowId}`).length
  const reading = {
    label,
    warnings: [...doc.warnings],
    top_level_items: Array.isArray(doc.value) ? doc.value.length : null,
    top_level_blocks,
    insert_blocks,
    insert_members: insertMembers.length,
    preset_entries: presetEntries.map((c) => ({ id: c.row.id, config_id: cfg({ config: c.row.map.get('config') }, 'id') ?? null, where: c.row.where })),
    host_members: hostMembers.map((c) => ({ id: c.row.id, name: c.row.name, where: c.row.where })),
    rows_total: rows.length,
    row_ids: rows.map((r) => r.id ?? `<${r.name}>`).sort(),
    resolve: resolveReading(classified),
    manifest_files: index.files.map(relOf),
    manifest_truncated: index.truncated,
    dashboard: {
      expected_row_id: expectedRowId,
      expected_preset_entries: expectedPresetEntries,
      manifest: dashboard.manifest,
      manifest_name: dashboard.name,
      manifest_error: dashboard.error,
      occurrences: dash.length,
      text_hits: textHits,
      id_rows: dashById.map((c) => ({ id: c.row.id, placement: c.row.placement, where: c.row.where, pkg: c.pkg.ok ? relOf(c.pkg.file) : null })),
      rows: dash.map((c) => ({
        id: c.row.id,
        name: c.row.name,
        placement: c.row.placement,
        where: c.row.where,
        in_preset_body: c.row.in_preset_body,
        disabled: c.row.disabled,
        platform: c.platform,
      })),
    },
  }
  if (reading.warnings.length > 0) {
    problems.push(problem(CODES.patchUnreadable,
      `${label} 有解析器读不懂的行（${reading.warnings.slice(0, 4).join(' / ')}）—— 层归属判不了（缺 ≠ 坏：这不是"行不在"）`,
      { scope: 'other' }))
    return { problems, reading }
  }

  // ── ① 顶层 insert 的形状（验收行：1 个 insert · 3 条直接成员 = 1 宿主 + 2 预设入口）──
  if (insert_blocks.length !== 1) {
    problems.push(problem(CODES.topInsertShape,
      `${label} 的顶层 \`- insert:\` 应恰好 1 个，实得 ${insert_blocks.length} 个`
      + `（顶层次序：${JSON.stringify(top_level_blocks)}）—— 宿主级行与两条预设入口都装在这一个 insert 里（官方形状）`,
      { scope: 'other', insert_blocks: insert_blocks.length }))
  }
  const otherTop = top_level_blocks.filter((b) => b.kind !== 'insert')
  if (otherTop.length > 0) {
    problems.push(problem(CODES.topInsertShape,
      `${label} 的顶层多出 ${otherTop.length} 个不是 \`- insert:\` 的条目（${JSON.stringify(otherTop)}）—— `
      + '这一份的顶层只有那一个 insert；override / 散行没有落点',
      { scope: 'other', top_level_blocks: otherTop }))
  }
  if (presetEntries.length !== expectedPresetEntries) {
    problems.push(problem(CODES.topInsertShape,
      `${label} 顶层 insert 里 \`${REGISTRATION_NAME}\` 应恰好 ${expectedPresetEntries} 条，实得 ${presetEntries.length}`
      + `（${JSON.stringify(presetEntries.map((c) => c.row.id))}）`,
      { scope: 'other', preset_entries: presetEntries.length }))
  }
  if (hostMembers.length > 1) {
    problems.push(problem(CODES.topInsertShape,
      `${label} 顶层 insert 里宿主级行应恰好 1 条，实得 ${hostMembers.length} 条`
      + `（${JSON.stringify(hostMembers.map((c) => ({ id: c.row.id, pkg: c.pkg.ok ? relOf(c.pkg.file) : null })))}）`,
      { scope: 'other', host_members: hostMembers.length }))
  } else if (hostMembers.length === 1 && hostMembers[0].is_dashboard !== true) {
    problems.push(problem(CODES.topInsertShape,
      `${label} 顶层 insert 里那条宿主级行不是看板那一行（${JSON.stringify({ id: hostMembers[0].row.id, pkg: hostMembers[0].pkg.ok ? relOf(hostMembers[0].pkg.file) : null })}）`
      + ' —— 验收口径要的是 1 条宿主行，而且它必须是看板包那一份',
      { scope: 'other', row_id: hostMembers[0].row.id }))
  }

  // ── ② 看板那一行自己 ────────────────────────────────────────────────────────
  if (dash.length === 0) {
    if (dashById.length > 0) {
      // id 在、包却不是看板那一份 ⇒ 行体/包的问题，不是"缺席"
      for (const c of dashById) {
        problems.push(problem(CODES.noClientDecl,
          `${label} 里 \`id: ${c.row.id}\` 那一行（${c.row.where}）解析到的包不是看板包那一份`
          + `（实得 ${c.pkg.ok ? relOf(c.pkg.file) : `${c.pkg.how}：${c.pkg.error}`}；期望 ${relOf(dashboardManifest)}）`
          + ' —— 行 id 只是名字，浏览器收的是**包**',
          { scope: 'other', row_id: c.row.id }))
      }
    } else {
      problems.push(problem(CODES.rowAbsent,
        `${label} 里没有任何一行解析到看板包（${relOf(dashboardManifest)}）—— 挂载**没做**：`
        + '生成器还没把那一行放进顶层 `- insert:`（组合里没标 `# @host-level` / 没跑生成器 / 那一行还在预设体里）。'
        + '缺席是关于产品的事实 ⇒ **红**，不是"判不了"',
        { scope: 'mount', manifest: relOf(dashboardManifest) }))
    }
  }
  for (const c of dash) {
    if (c.row.placement !== 'insert') {
      problems.push(problem(CODES.notHostLevel,
        `${label} 里看板那一行（${c.row.name}${c.row.id === null ? '' : ` · id ${c.row.id}`}）住在「${c.row.where}」`
        + `（${c.row.placement === 'nested' ? '预设体' : '顶层 override'}）—— 它必须是**顶层 \`- insert:\` 的直接成员**（宿主装载层）；`
        + '写在别处 = 宿主不会把它交给浏览器（与 `bug-20261104-02` 同一个形状）',
        { scope: 'mount', row_id: c.row.id }))
      continue
    }
    if (c.row.disabled === true) {
      problems.push(problem(CODES.rowDisabled,
        `${label} 里看板那一行是 \`disabled: true\` —— 一行关着的不是一次挂载（浏览器没有东西可收）`,
        { scope: 'mount', row_id: c.row.id }))
    }
    if (!c.pkg.ok) {
      problems.push(problem(CODES.noClientDecl,
        `${label} 里看板那一行的 \`name\` 解析不到 package.json（${c.pkg.how}：${c.pkg.error}）—— 指不到包，浏览器没有东西可收`,
        { scope: 'other', row_id: c.row.id }))
      continue
    }
    if (c.platform !== CLIENT_UI_PLATFORM) {
      problems.push(problem(CODES.noClientDecl,
        `${label} 里看板那一行指向的包（${relOf(c.pkg.file)}）没有声明 \`dsh.client.platform: web\`（实得 ${JSON.stringify(c.platform)}）—— 浏览器不会收它`,
        { scope: 'other', row_id: c.row.id }))
    }
    if (!Object.prototype.hasOwnProperty.call(c.pkg.value?.exports ?? {}, './client')) {
      problems.push(problem(CODES.noClientDecl,
        `${label} 里看板那一行指向的包（${relOf(c.pkg.file)}）没有声明 \`exports["./client"]\`（实得 ${JSON.stringify(c.pkg.value?.exports ?? null)}）—— 浏览器侧没有入口可加载`,
        { scope: 'other', row_id: c.row.id }))
    }
    const cfgMap = c.row.map.get('config')
    const root = cfgMap instanceof Map ? cfgMap.get('root') : null
    if (typeof root !== 'string' || root.trim() === '') {
      problems.push(problem(CODES.noClientDecl,
        `${label} 里看板那一行的 \`config.root\` 缺失或不是字符串（实得 ${JSON.stringify(root)}）—— 插件拿它当内容根，缺了面板读不到数据`,
        { scope: 'other', row_id: c.row.id }))
    }
    const entry = nodeEntryOf(c.pkg, c.row.name)
    reading.dashboard.node_entry = { row_id: c.row.id, entry: entry.entry === null ? null : relOf(entry.entry), how: entry.how, exists: entry.exists }
    if (!entry.ok) {
      problems.push(problem(CODES.noClientDecl,
        `${label} 里看板那一行指向的包（${relOf(c.pkg.file)}）的 **Node 入口文件**不在盘上`
        + `（${entry.how}：${entry.entry === null ? '（解析不出来）' : relOf(entry.entry)}）—— 包声明再全，入口不在也装不起来`,
        { scope: 'other', row_id: c.row.id }))
    }
  }
  reading.problems = problems.map((p) => p.code)
  return { problems, reading }
}

/**
 * **`DASH-16` 的判据本体**：语义面 —— 客户端 UI 行只许做**顶层 `- insert:` 的直接成员**。
 *
 * 判据（每条都是红，两个状态，没有第三态）：
 *   ① 任何一行的 `name` 解析到声明 `dsh.client.platform: web` 的包，而它住在**预设体**里
 *      ⇒ `DASH-CLIENT-IN-PRESET`（路径形 / 裸包名都算；`disabled: true` 也不算合规）；
 *   ② 同一类行住在**顶层 override** 里（既不在 insert、也不在预设）⇒ `DASH-CLIENT-OUTSIDE-INSERT`；
 *   ③ 看板那一行**恰好一次**（语义计数 + 文件里 `- id: agenia-dashboard` 的文本次数）
 *      ⇒ 否则 `DASH-HOST-ROW-COUNT`。
 * 名字解析不到的预设行只进读数 `unresolved_in_preset`（这棵树没有 `node_modules`，框架包在
 * `app.asar` 里）—— 对它们记 HOLD 会让本格每次挂起 60 条（见文件头墓碑）。
 *
 * @param {{patchText:string, label?:string, manifestRoots?:string[], dashboardManifest?:string,
 *          expectedRowId?:string}} input
 * @returns {{problems: object[], reading: object}}
 */
export function scanClientUiPlacement({
  patchText,
  label = 'bundle 补丁',
  manifestRoots = [],
  dashboardManifest,
  expectedRowId = 'agenia-dashboard',
}) {
  const { doc, rows } = describePlacement(patchText, label)
  const { index, dashboard, classified } = classifyRows(rows, {
    manifestRoots,
    dashboardManifest: dashboardManifest ?? path.join(PATHS.finalPreset, 'client-ui-dashboard', 'package.json'),
    expectedRowId,
  })
  const problems = []
  const clientAll = classified.filter((c) => c.client)
  const dash = classified.filter((c) => c.is_dashboard)
  const dashById = classified.filter((c) => c.id_is_dashboard)
  // `agenia-dashboard` 的**文本**出现次数（按 `- id:` 行数；注释不算）—— 验收行的一条。
  const textHits = String(patchText).split('\n').filter((line) => line.trim() === `- id: ${expectedRowId}`).length
  const reading = {
    label,
    warnings: [...doc.warnings],
    rows_total: rows.length,
    resolve: resolveReading(classified),
    manifest_files: index.files.map(relOf),
    manifest_truncated: index.truncated,
    client_ui_rows: clientAll.map((c) => ({
      id: c.row.id,
      name: c.row.name,
      placement: c.row.placement,
      in_preset_body: c.row.in_preset_body,
      preset: c.row.preset,
      where: c.row.where,
      disabled: c.row.disabled,
      pkg: c.pkg.ok ? relOf(c.pkg.file) : null,
    })),
    dashboard: {
      expected_row_id: expectedRowId,
      manifest: dashboard.manifest,
      manifest_name: dashboard.name,
      occurrences: dash.length,
      text_hits: textHits,
      placements: dash.map((c) => ({ id: c.row.id, placement: c.row.placement, where: c.row.where, in_preset_body: c.row.in_preset_body, disabled: c.row.disabled })),
      by_id_only: dashById.filter((c) => c.is_dashboard !== true).map((c) => ({ id: c.row.id, where: c.row.where, pkg: c.pkg.ok ? relOf(c.pkg.file) : null })),
    },
    violations: [],
    outside_insert: [],
  }
  if (reading.warnings.length > 0) {
    problems.push(problem(CODES.patchUnreadable,
      `${label} 有解析器读不懂的行（${reading.warnings.slice(0, 4).join(' / ')}）—— 语义面判不了这一份的形状（缺 ≠ 坏 ≠ 空）`,
      { scope: 'other' }))
    return { problems, reading }
  }

  // ── ① 预设体里不许有客户端 UI 行（路径形 / 裸包名都算；关着也不算"没有"）────────
  for (const c of classified) {
    if (!c.client || c.row.in_preset_body !== true) continue
    reading.violations.push({ preset: c.row.preset, id: c.row.id, name: c.row.name, disabled: c.row.disabled, pkg: relOf(c.pkg.file) })
    problems.push(problem(CODES.clientInPreset,
      `预设 ${c.row.preset ?? '?'} 的 plugins 里有一行（${c.row.id === null ? '（无 id）' : `\`${c.row.id}\``}）指向的包（${relOf(c.pkg.file)}）`
      + `声明了 \`dsh.client.platform: web\` —— 客户端 UI 行只许是**顶层 \`- insert:\` 的直接成员**（宿主装载层）；`
      + '住在预设里 = 浏览器永远收不到它，而且那个包会在每份预设里各起一个 Node 写者（一个包只许一个写者）'
      + `${c.row.disabled === true ? '。⚠️ 它是 `disabled: true` 也不算合规：关着只是让它不跑，不是把它装上' : ''}`,
      { scope: c.id_is_dashboard ? 'mount' : 'other', row_id: c.row.id, preset: c.row.preset }))
  }

  // ── ② 顶层 override 里的客户端 UI 行：既不在 insert、也不在预设 ⇒ 谁都不认它 ─────
  for (const c of classified) {
    if (!c.client || c.row.placement !== 'top' || c.row.in_preset_body === true) continue
    reading.outside_insert.push({ id: c.row.id, name: c.row.name, where: c.row.where, pkg: relOf(c.pkg.file) })
    problems.push(problem(CODES.clientOutsideInsert,
      `${label}：顶层 override 里有一行客户端 UI（${c.row.id === null ? '（无 id）' : `\`${c.row.id}\``} · ${relOf(c.pkg.file)}）：`
      + '既不是 `- insert:` 的直接成员（宿主装载层收不到），也不在任何预设体里（没有会话会加载它）—— 两边都不成立',
      { scope: 'other', row_id: c.row.id }))
  }

  // ── ③ 读不到的预设行：**只记读数，不记 HOLD**（理由见文件头墓碑 `DASH-ROW-PACKAGE-UNRESOLVED`）──
  //    这棵树解析不到 `app.asar` 里的框架包 ⇒ 两份预设体里六十来行裸包名永远"读不到"。
  //    对它们开火 = 每一次都挂起 60 条（判据变成装饰）。fail-closed 的判定在生成器那一侧。
  const unreadable = classified.filter((c) => c.row.in_preset_body === true && !c.pkg.ok && c.pkg.how !== 'not-a-package')
  reading.unresolved_in_preset = unreadable.map((c) => ({ name: c.row.name, where: c.row.where, how: c.pkg.how }))
  reading.unresolved_in_preset_count = unreadable.length

  // ── ④ 看板那一行必须**恰好一次**（语义计数 + 文件里的文本出现次数）──────────────
  if (dash.length !== 1) {
    problems.push(problem(CODES.hostRowCount,
      `${label} 里解析到看板包的看板那一行应恰好 1 行，实得 ${dash.length} 行`
      + `（${JSON.stringify(dash.map((c) => ({ id: c.row.id, placement: c.row.placement, where: c.row.where })))}）`
      + ' —— 一个包只有一个 Node 写者；多出来的那一份不管关没关，都让"装上了没有"没有唯一答案',
      { scope: 'mount', occurrences: dash.length }))
  }
  if (textHits !== 1 && (dash.length > 0 || textHits > 0)) {
    problems.push(problem(CODES.hostRowCount,
      `${label} 里 \`- id: ${expectedRowId}\` 这一行应恰好 1 次，实得 ${textHits} 次`
      + ' —— 验收口径：`agenia-dashboard` 在整份文件里只出现一次（只在顶层 `- insert:` 里）',
      { scope: 'mount', text_hits: textHits }))
  }
  reading.problems = problems.map((p) => p.code)
  return { problems, reading }
}

/**
 * **`BOOT-02` 的挂载行前置读数**（不是判据本体）：读 bundle 补丁文件，回答
 * "看板那一行在不在 / 住在哪 / 开没开 / 出现几次"。载体是我们自己的包
 * （`BOOT-02` 的 A/B 两条读数只在这一行**真的装上**时才有对象）。
 *
 * @param {{file:string, manifestRoots?:string[], dashboardManifest?:string, expectedRowId?:string}} input
 */
export function bundleMountReading({
  file,
  manifestRoots = [PATHS.finalPreset],
  dashboardManifest = path.join(PATHS.finalPreset, 'client-ui-dashboard', 'package.json'),
  expectedRowId = 'agenia-dashboard',
}) {
  const base = { path: file, measured_at: new Date().toISOString(), source: 'presets/agenia/cordis.patch.yml（我们自己的 bundle 补丁）' }
  if (!existsSync(file)) {
    return { ...base, exists: false, text: null, bytes: null, sha256: null, mtime: null, rows: [], mount: { present: false, why: '补丁文件不在' }, warnings: [] }
  }
  const text = readFileSync(file, 'utf8')
  const st = statSync(file)
  const { doc, rows, insert_blocks, top_level_blocks } = describePlacement(text, 'bundle 补丁')
  const { dashboard, classified } = classifyRows(rows, { manifestRoots, dashboardManifest, expectedRowId })
  const dash = classified.filter((c) => c.is_dashboard || c.id_is_dashboard)
  const inInsert = dash.filter((c) => c.row.placement === 'insert')
  const mount = dash.length === 0
    ? { present: false, why: '补丁里没有指向这个包的行（按包身份证找的）' }
    : inInsert.length > 0
      ? {
        present: true,
        placement: 'insert',
        disabled: inInsert.every((c) => c.row.disabled === true),
        row: { id: inInsert[0].row.id, name: inInsert[0].row.name, where: inInsert[0].row.where },
        duplicates: dash.length,
      }
      : {
        present: true,
        placement: dash[0].row.in_preset_body === true ? 'preset-body' : dash[0].row.placement,
        disabled: dash.some((c) => c.row.disabled === true),
        row: { id: dash[0].row.id, name: dash[0].row.name, where: dash[0].row.where },
        duplicates: dash.length,
      }
  return {
    ...base,
    exists: true,
    text,
    bytes: st.size,
    sha256: createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase(),
    mtime: new Date(st.mtimeMs).toISOString(),
    warnings: [...doc.warnings],
    rows: rows.map((r) => ({ id: r.id, name: r.name, placement: r.placement, in_preset_body: r.in_preset_body, disabled: r.disabled })),
    insert_blocks,
    top_level_blocks,
    dashboard: { manifest: dashboard.manifest, name: dashboard.name, occurrences: dash.length },
    mount,
  }
}

// `bundleMountReading()` 的摘要用 node 内置 crypto（文件头已引）。

/**
 * **profile 层的备用路线读数**（`DASH-15` 的可选腿；**不产码、不进判词**）。
 *
 * 挂载搬回 bundle 之后，profile 补丁里按设计没有看板那一行。那条路线仍然留着
 * （`.tools/mount-dashboard-profile.mjs` 的 `--check/--apply/--revert` 都验过，是第二选择），
 * 所以这里只给"它现在挂没挂"这一个读数 —— 不再有第二套"挂载没做"的码。
 *
 * @param {{patchText:string|null, manifestRoots?:string[], dashboardManifest:string, expectedRowId?:string}} input
 */
export function profileMountReading({
  patchText,
  manifestRoots = [PATHS.finalPreset],
  dashboardManifest,
  expectedRowId = 'agenia-dashboard',
}) {
  if (typeof patchText !== 'string') return { available: false, mounted: null, rows: [], warnings: [] }
  const { doc, rows } = describePlacement(patchText, 'profile 补丁（备用路线）')
  const { classified } = classifyRows(rows, { manifestRoots, dashboardManifest, expectedRowId })
  const dash = classified.filter((c) => c.is_dashboard)
  return {
    available: true,
    mounted: dash.length > 0,
    rows: dash.map((c) => ({ id: c.row.id, placement: c.row.placement, where: c.row.where, disabled: c.row.disabled })),
    warnings: [...doc.warnings],
  }
}

// ── 真字节夹具：把那一行从预设体搬进顶层 insert ──────────────────────────────
/**
 * 把一份**真**补丁原文里的看板行搬到顶层 `- insert:`（只动那一行，别的字节一律不动）。
 *
 * 这是"验收口径那一版"的夹具来源：**不是合成的草图**，是拿盘上那份 `cordis.patch.yml`
 * 的原文改出来的 —— `id` / `name` / `config.root` 三个值都从原文里读，行体不是新写的。
 *
 * 幂等：原文已经是验收形状（1 个 insert、3 条直接成员、那一行在 insert 里且开着）⇒ 原样返回。
 *
 * @param {{patchText:string, manifestRoots?:string[], dashboardManifest:string, expectedRowId?:string}} input
 * @returns {{text:string, moved:boolean, why:string|null, removed_blocks:number, added_block:string|null,
 *            before:object, after:object}}
 */
export function withHostRowInTopInsert({
  patchText,
  manifestRoots = [PATHS.finalPreset],
  dashboardManifest,
  expectedRowId = 'agenia-dashboard',
}) {
  const text = String(patchText)
  const describe = (t) => {
    const { rows } = describePlacement(t, '夹具·搬家前')
    const { classified } = classifyRows(rows, { manifestRoots, dashboardManifest, expectedRowId })
    const dash = classified.filter((c) => c.is_dashboard || c.id_is_dashboard)
    return {
      dashboard_rows: dash.map((c) => ({ id: c.row.id, name: c.row.name, placement: c.row.placement, in_preset_body: c.row.in_preset_body, disabled: c.row.disabled })),
      in_insert: dash.filter((c) => c.row.placement === 'insert').length,
      in_preset: dash.filter((c) => c.row.in_preset_body === true).length,
      row_ids: rows.map((r) => r.id ?? `<${r.name}>`).sort(),
    }
  }
  const before = describe(text)
  const already = before.in_insert === 1 && before.dashboard_rows.length === 1 && before.in_preset === 0
    && before.dashboard_rows[0].disabled !== true
  if (already) return { text, moved: false, why: '原文已经是验收形状（那一行只在顶层 insert 里、开着）', removed_blocks: 0, added_block: null, before, after: before }

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const indentOf = (line) => (/^\s*/.exec(line) ?? [''])[0].length
  // ① 找看板行体：优先按 `- id:` 行，找不到再按 `- name:` 那一行的原文值。
  const sample = before.dashboard_rows[0] ?? null
  const idLine = sample?.id == null ? null : new RegExp(`^(\\s*)- id: ${String(sample.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:#.*)?$`)
  const nameLine = sample?.name == null ? null : new RegExp(`^(\\s*)- name: '${String(sample.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*(?:#.*)?$`)
  const isRowStart = (line) => (idLine !== null && idLine.test(line)) || (nameLine !== null && nameLine.test(line))
  // ② 删掉预设体里的那些块（从行首删到下一个同级 item 之前；空行 / 更深缩进 / 注释都跟着走）。
  const deleted = new Set()
  let removedBlocks = 0
  for (let i = 0; i < lines.length; i += 1) {
    if (!isRowStart(lines[i])) continue
    const rowIndent = indentOf(lines[i])
    if (rowIndent === 0) continue // 顶层条目不是"预设体里的那一行"，不删（下面按插入处理）
    let end = i + 1
    while (end < lines.length) {
      const next = lines[end]
      if (next.trim() === '' || /^\s*#/.test(next) || indentOf(next) > rowIndent) { end += 1; continue }
      break
    }
    for (let k = i; k < end; k += 1) deleted.add(k)
    removedBlocks += 1
    i = end - 1
  }
  const kept = lines.filter((_, i) => !deleted.has(i))
  // ③ 把行体插到顶层 `- insert:` 的第一条成员位置（缩进 4）。
  const insertRow = /^- insert:\s*(?:#.*)?$/
  const at = kept.findIndex((line) => insertRow.test(line))
  const root = (() => {
    const { rows } = describePlacement(text, '夹具·取 root')
    const { classified } = classifyRows(rows, { manifestRoots, dashboardManifest, expectedRowId })
    const hit = classified.find((c) => c.is_dashboard || c.id_is_dashboard)
    const cfgMap = hit?.row?.map?.get('config')
    const value = cfgMap instanceof Map ? cfgMap.get('root') : null
    return typeof value === 'string' && value.trim() !== '' ? value : PATHS.repo.replace(/\\/g, '/')
  })()
  const name = sample?.name ?? `file:///${path.join(path.dirname(dashboardManifest), 'lib', 'index.js').replace(/\\/g, '/')}`
  const id = sample?.id ?? expectedRowId
  const block = [
    `    - id: ${id}`,
    `      # 夹具：那一行从预设体搬进顶层 insert（id / name / root 三个值都取自真补丁原文）`,
    `      name: '${name}'`,
    '      config:',
    `        root: '${root}'`,
  ]
  const out = at < 0 ? [...kept, '- insert:', ...block] : [...kept.slice(0, at + 1), ...block, ...kept.slice(at + 1)]
  const afterText = out.join('\n')
  return {
    text: afterText,
    moved: true,
    why: at < 0 ? '原文没有顶层 `- insert:` ⇒ 补了一个' : '把看板行从预设体搬到顶层 insert（其余字节不动）',
    removed_blocks: removedBlocks,
    added_block: block.join('\n'),
    before,
    after: describe(afterText),
  }
}

// ── 真字节夹具：把那一行从顶层 insert 搬**回**两份预设体 ─────────────────────
/**
 * `withHostRowInTopInsert()` 的**反向**：把顶层 `- insert:` 里的宿主级行搬回
 * **每一份预设的 `plugins` 末尾**（= 组合里删掉 `# @host-level` 标记、重跑生成器之后
 * 那一行会落到的位置 —— 组合里它排在最后一行，所以两份预设体里也在最后）。
 *
 * 为什么需要它（`BOOT-01` 的 R5 · 回滚定义"删标记 + 重跑生成器"）：
 *   R5 要判"标记不在时那一行回到两份预设体里"，而盘上现在就一份**挂载态**的补丁。
 *   办法是拿真字节造出**回滚态**：只动那一行（从 insert 摘掉、按 10 格缩进搬进两份预设体），
 *   其余字节一律不动。于是"标记 × 落点"的真值表两端都可解析、都能量。
 *   ⚠️ 这不是"合成一份好看的补丁"：`id` / `name` / `config.root` 全部来自原文，
 *   搬过去的块与 `make-bundle-patch.mjs` 的 `memberBody()` 形状同缩进（`- id` 10 格、子键 12 格）。
 *   搬的时候**去掉 `# @host-level` 那一行注释**（回滚态的组合里也没有它），其余注释照搬。
 *
 * @param {{patchText:string, hostRowIds:string[], rowIndent?:number, bodyIndent?:number}} input
 * @returns {{text:string, moved:boolean, why:string|null, removed:object[], added_into:string[],
 *            before:object, after:object}}
 */
export function withHostRowInPresetBodies({ patchText, hostRowIds, rowIndent = 4, bodyIndent = 10 }) {
  const text = String(patchText)
  const describe = (t) => {
    const { rows, insert_blocks } = describePlacement(t, '夹具·回滚投影')
    const hits = rows.filter((r) => r.id !== null && hostRowIds.includes(r.id))
    return {
      host_rows: hits.map((r) => ({ id: r.id, placement: r.placement, in_preset_body: r.in_preset_body })),
      in_insert: hits.filter((r) => r.placement === 'insert').length,
      in_preset: hits.filter((r) => r.in_preset_body === true).length,
      insert_blocks: insert_blocks.length,
      row_ids: rows.map((r) => r.id ?? `<${r.name}>`).sort(),
    }
  }
  const before = describe(text)
  if (hostRowIds.length === 0) return { text, moved: false, why: '没给宿主行 id ⇒ 没有可搬的行', removed: [], added_into: [], before, after: before }
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const indentOf = (line) => (/^[ \t]*/.exec(line) ?? [''])[0].length
  // ① 找顶层 insert 的那几个直接成员（`rowIndent` 格的 `- id: <host>`），各自成块。
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    if (indentOf(lines[i]) !== rowIndent) continue
    const m = /^\s*-\s*id:\s*(\S+)\s*(?:#.*)?$/.exec(lines[i])
    if (m === null || !hostRowIds.includes(m[1])) continue
    let end = i + 1
    while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > rowIndent)) end += 1
    let trimmed = end
    while (trimmed > i + 1 && lines[trimmed - 1].trim() === '') trimmed -= 1
    const blockLines = lines.slice(i, trimmed).map((line) => {
      if (line.trim() === '') return line
      return ' '.repeat(bodyIndent + Math.max(0, indentOf(line) - rowIndent)) + line.trimStart()
    })
    blocks.push({ id: m[1], start: i, end: trimmed, block: blockLines.filter((line) => !/^\s*#\s*@host-level\b/.test(line)) })
    i = trimmed - 1
  }
  if (blocks.length === 0) {
    return { text, moved: false, why: `顶层 insert 里没有这些宿主行（${JSON.stringify(hostRowIds)}）—— 没有可搬的块`, removed: [], added_into: [], before, after: before }
  }
  // ② 从 insert 里摘掉那些块。
  const removedIdx = new Set()
  for (const b of blocks) for (let k = b.start; k < b.end; k += 1) removedIdx.add(k)
  const kept = lines.filter((_, i) => !removedIdx.has(i))
  // ③ 找到每份预设入口的 `plugins:` 段尾，把块按 10 格缩进**最后**塞进去（自下而上插，行号不漂）。
  const entryStarts = []
  for (let i = 0; i < kept.length; i += 1) if (indentOf(kept[i]) === rowIndent && /^\s*-\s*id:\s*preset-\S+/.test(kept[i])) entryStarts.push(i)
  const out = [...kept]
  const addedInto = []
  for (let e = entryStarts.length - 1; e >= 0; e -= 1) {
    const start = entryStarts[e]
    const end = e + 1 < entryStarts.length ? entryStarts[e + 1] : out.length
    let pluginsAt = -1
    for (let i = start; i < end; i += 1) if (/^\s*plugins:\s*$/.test(out[i])) { pluginsAt = i; break }
    if (pluginsAt < 0) continue
    let at = end
    while (at > pluginsAt + 1 && out[at - 1].trim() === '') at -= 1
    const add = blocks.flatMap((b) => b.block)
    out.splice(at, 0, ...add)
    addedInto.push(/^\s*-\s*id:\s*(\S+)/.exec(out[start])?.[1] ?? `#${start}`)
  }
  const afterText = out.join('\n')
  return {
    text: afterText,
    moved: true,
    why: '把宿主行从顶层 insert 搬回每份预设体的 plugins 末尾（其余字节不动；`# @host-level` 注释跟着去掉）',
    removed: blocks.map((b) => ({ id: b.id, lines: b.end - b.start })),
    added_into: addedInto.reverse(),
    before,
    after: describe(afterText),
  }
}

// ── 合成夹具（只住调用方给的目录：用例 = 运行根，探针 = 测试抽屉）────────────────
/**
 * 一个**只在夹具里存在**的客户端 UI 包：声明 `dsh.client.platform: web` + `exports["./client"]`。
 * 它的名字 / 目录 / 行 id 在活树的任何名单里都没有 —— 这正是那把刀要证明的事。
 *
 * @param {string} dir 落点目录（必须是运行根或测试抽屉）
 * @param {{dirName?: string, pkgName?: string}} [options]
 */
export function syntheticClientUiPackage(dir, { dirName = 'client-ui-probe', pkgName = '@fixture/dsh-client-ui-probe' } = {}) {
  const pkgDir = path.join(dir, dirName)
  mkdirSync(path.join(pkgDir, 'lib'), { recursive: true })
  const manifest = {
    name: pkgName,
    version: '0.0.0',
    private: true,
    type: 'module',
    description: 'DASH-16 的合成客户端 UI 包（只住夹具）',
    main: 'lib/index.js',
    exports: {
      '.': { default: './lib/index.js' },
      './client': { default: './lib/client.js' },
    },
    dsh: { client: { platform: CLIENT_UI_PLATFORM, inject: [] } },
  }
  writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  writeFileSync(path.join(pkgDir, 'lib', 'index.js'), 'export function apply() {}\n', 'utf8')
  writeFileSync(path.join(pkgDir, 'lib', 'client.js'), '// fixture：这一份不会被装载（只用来证明包声明可解析）\n', 'utf8')
  return {
    dir: pkgDir,
    pkg_name: pkgName,
    manifest_file: path.join(pkgDir, 'package.json'),
    entry_file: path.join(pkgDir, 'lib', 'index.js'),
    name: `file:///${pkgDir.replace(/\\/g, '/')}/lib/index.js`,
  }
}

/**
 * 合成补丁（bundle 形状：**一个**顶层 `- insert:`，里面 2 条预设入口 + 放置的宿主 / 合成行）。
 * `dashboard` / `synthetic` 各自是：
 *   · `host`        —— 顶层 insert 的直接成员（正确形状）
 *   · `preset`      —— 塞进组长预设的 `plugins` 里（预设体；`disabled` 由行自己带）
 *   · `member`      —— 塞进**组员**预设的 `plugins` 里（两份预设体的另一半）
 *   · `top-override`—— 顶层 override（`- id:` 条目，既不在 insert 也不在预设）
 *   · `absent`      —— 没有这一行
 * 行对象：`{id?, name, root, disabled?}`。
 *
 * @param {{dashboard?:string, synthetic?:string, dashboardRow:object, syntheticRow:object,
 *          presetIds?:{leader:string, member:string}, withDashboardId?:boolean}} input
 */
export function clientUiPatchFixture({
  dashboard = 'host',
  synthetic = 'absent',
  dashboardRow,
  syntheticRow,
  presetIds = { leader: 'agenia', member: 'agenia-member' },
} = {}) {
  const rowBlock = (indent, row) => {
    const pad = ' '.repeat(indent)
    const lines = [row.id === undefined || row.id === null ? `${pad}- name: '${row.name}'` : `${pad}- id: ${row.id}`]
    if (row.disabled === true) lines.push(`${pad}  disabled: true`)
    lines.push(`${pad}  name: '${row.name}'`, `${pad}  config:`, `${pad}    root: '${row.root}'`)
    return lines
  }
  const presetEntry = (presetId, rows) => {
    const lines = [
      `    - id: preset-${presetId}`,
      `      name: '${REGISTRATION_NAME}'`,
      '      config:',
      `        id: ${presetId}`,
      "        name: '合成预设'",
      "        description: '只住运行根或测试抽屉'",
      '        order: 10',
      '        plugins:',
      '          - id: persona',
      "            name: '@deepseek-ai/dsh-persona'",
    ]
    for (const row of rows) lines.push(...rowBlock(10, row))
    return lines
  }
  const leaderRows = []
  if (dashboard === 'preset') leaderRows.push(dashboardRow)
  if (synthetic === 'preset') leaderRows.push(syntheticRow)
  const memberRows = []
  if (dashboard === 'member') memberRows.push(dashboardRow)
  if (synthetic === 'member') memberRows.push(syntheticRow)
  const lines = [
    '# DASH-15/16 合成补丁（阳性对照 / 刀）—— 只住运行根或测试抽屉，不是被测对象',
    '# 形状照官方那个面板的包：一个顶层 `- insert:`，直接成员 = 宿主行 + 两条预设入口',
    '- insert:',
  ]
  if (dashboard === 'host') lines.push(...rowBlock(4, dashboardRow))
  if (synthetic === 'host') lines.push(...rowBlock(4, syntheticRow))
  lines.push(...presetEntry(presetIds.leader, leaderRows))
  lines.push(...presetEntry(presetIds.member, memberRows))
  // 顶层 override：缩进 0 的 `- id:` 项，不是任何 `- insert:` 的成员，也不在预设体里。
  if (dashboard === 'top-override') lines.push(...rowBlock(0, dashboardRow))
  if (synthetic === 'top-override') lines.push(...rowBlock(0, syntheticRow))
  return `${lines.join('\n')}\n`
}
