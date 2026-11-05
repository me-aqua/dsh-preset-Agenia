/**
 * **客户端 UI 行的层归属**（`DASH-15` / `DASH-16`；第 4 关评审 2026-11-05 的 `R-1`）—— 量具 + 合成夹具。
 *
 * 一句话：**一行的层归属由"它指向的包是不是客户端 UI"决定，不由"作者记不记得写标记 / 点名表"决定。**
 *
 * 为什么要有这一格：`DASH-15` 与三个生成期 throw 覆盖的是**标记与表不一致**（标了但表里没有 /
 * 表里有但标记没了 / 标记重复或位置不对）。它们覆盖不到**两处都忘**：一行 `dsh.client` 的插件进了
 * 组合、没写 `# @host-level`、也没进 `HOST_LEVEL_IDS` ⇒ 生成器走 `marks === 0` 分支，把它当普通行
 * 拷进**每一份预设**，浏览器收不到 —— 与 `bug-20261104-02` 同一个形状，而全套判据照样绿。
 *
 * ── 🔴 2026-11-05 晚：判据的载体从 **bundle 补丁** 换成 **profile 补丁** ─────────────
 * 那一天 16:0x 实测"把看板那一行搬进 **bundle** 的宿主级 insert"会让整个 bundle 层 boot 失败
 * （新会话 `agentPreset: "standard"` ⇒ 无角色 ⇒ 窄权限）⇒ 那一行回滚成 `disabled: true`，
 * 挂载路线改成走 **profile 层**（`$DSH_PROFILE_DIR/cordis.patch.yml`）。
 * ⇒ "bundle 补丁里有一个装着看板的宿主 insert"这个形状**再也不会出现**（生成器遇到宿主级标记就 throw），
 *   照旧判它只会得到一条永远红的假红。所以这一份量具现在有两个入口：
 *   · `scanProfilePlacement()` —— **现在的主判据载体**（profile 层：`- insert:` 是新增行的唯一入口）；
 *   · `scanClientUiPlacement()` —— **bundle 层的残余量法**（只剩一句话要说：还留在预设 `plugins` 里的
 *     客户端 UI 行**只许关着**；"必须在宿主 insert"那半句话随形状一起退役）。
 *
 * 两个入口都**不读标记、不读 `HOST_LEVEL_IDS`**，认行只认"它解析到的那份 `package.json`"：
 *   ① **语义面**：行的 `name` 解析到盘上的 `package.json`；那个包声明了 `dsh.client.platform: "web"`
 *      却不在宿主装载层（bundle 入口 = 顶层 `- insert:`；profile 入口 = 顶层 `- insert:`）⇒ 红。
 *      这一行叫什么、谁登记过它、作者有没有记得 —— 都不影响这个判断。
 *   ② **阳性腿**：看板那一行自己必须在宿主装载层里。没有它，"整份补丁里一行客户端 UI 都没有"
 *      与"客户端 UI 行不在装载层"会一起绿。🔴 profile 入口认看板行**不认 id / 名字形状** ——
 *      靠"那份 `package.json` 声明的 `name` 是不是看板包那一份"（挂载行按设计不带 `id`）。
 *
 * 🔴 **解析面（这一格的边界，读之前先知道）** —— `name` 的两种形状：
 *   · **路径形**（`file:///…`、绝对路径）：从入口文件往上找最近的 `package.json`（真解析）；
 *   · **裸包名**（`@scope/pkg`）：在调用方给的 `manifestRoots` 里按 `package.json` 的 `name` 匹配
 *     （这棵树没有 `node_modules`；框架包在 `app.asar` 里，盘上解析不到）。
 *   两种都解析不到的裸名记进读数 `unresolved`，**不冒充"不是客户端 UI"、也不冒充判过**。
 *   本仓自己的客户端 UI 包是路径形（看板那一行就是 `file:///…/client-ui-dashboard/lib/index.js`），
 *   这条路径不依赖任何名单 —— 未来新加的本地客户端 UI 包只要行是路径形就同样被抓到。
 *
 * 为什么 `manifestRoots` / `dashboardManifest` 是入参：测试要量**被测的补丁**，探针要量**活树** ——
 * 根与"哪份 package.json 是看板"都是输入，不是常量。
 *
 * ⚠️ 判读边界（不归这一格）：像素 / 浏览器真的收到包归 GUI 清单与 `BOOT-02`；
 *   "生成补丁是不是生成器的派生物"归 `DASH-15` 的派生物那一腿；"标记与表一致"归生成期 throw。
 *
 * ── 🔴 "还没挂" 不是 "挂错了"（第三态）──────────────────────────────────────────
 * profile 补丁里没有看板那一行 ⇒ 目标形状**故意不在**（挂载工具还没跑）⇒ 用例把 `scope: 'mount'`
 * 那几条翻成第三态 HOLD（`DISABLED_PENDING_CODE`），**不是绿**。判据本体不知道 HOLD ——
 * 它只报形状；红/HOLD 的分流在用例里，因为那是**政策**不是**量法**（量法要能被夹具喂，政策要能被看见）。
 * 🔴 分流不能顺手放宽：`scope: 'other'` 的那些（别的客户端 UI 行 / 行体 / 包没声明 / 补丁读不懂）
 *    **任何时刻都照旧红** —— "还没挂"解释不了"包没声明 dsh.client"。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectRows, cfg, parseYamlSubset } from './composition.mjs'
import { FROZEN, PATHS } from './env.mjs'
import { problem } from './evidence.mjs'

/** 框架 `ClientModuleRegistry` 认的那个值（`processOne()` 的声明门槛）。 */
export const CLIENT_UI_PLATFORM = 'web'

/** 这一格的码（稳定、可 grep）。 */
export const CODES = Object.freeze({
  clientInPreset: 'DASH-CLIENT-IN-PRESET',
  hostMissing: 'DASH-HOST-MISSING',
  patchUnreadable: 'DASH-PATCH-UNREADABLE',
  /** 那一行指不到包 / 包没声明 `dsh.client` / `config.root` 不在 —— 浏览器没有东西可收。 */
  noClientDecl: 'DASH-NO-CLIENT-DECL',
})

/**
 * **回滚期的第三态码**（2026-11-05 16:2x · 宿主层挂载被回滚之后）。
 *
 * 一句话：看板那一行在组合里 `disabled: true`（老板拍的回滚：宿主级 insert 让整个 bundle 层
 * 在 boot 时失效 ⇒ 新会话 `agentPreset: "standard"` ⇒ 无角色 ⇒ 窄权限），
 * 那么"它必须在宿主 insert"这一格的目标形状就是**故意不在**的 ——
 * 判"没装"是错的（它本来就不该装），判"装好了"更是错的。
 * ⇒ 这一格记 **HOLD**（第三态，`caseHold()`），**不是绿**：结算里单独一栏，读的人一眼看得见"这条没判"。
 * 路由重设计（走 profile 层）落地之后，那一行不再是 `disabled` ⇒ 这一格自动回到"必须住宿主 insert"。
 */
export const DISABLED_PENDING_CODE = 'DASH-MOUNT-DISABLED-PENDING-PROFILE-LAYER'

/**
 * ── 🔴 profile 层（2026-11-05 迁移）─────────────────────────────────────────────
 * `DASH-15` / `DASH-16` 原本判的是**bundle 补丁**（`presets/agenia/cordis.patch.yml`）里
 * "看板那一行必须是顶层 `- insert:` 的直接成员"。本票把挂载搬到 **profile 层**
 * （`$DSH_PROFILE_DIR/cordis.patch.yml`，今天 = `C:\Users\DAVID\.dsh\profiles\desktop\cordis.patch.yml`）
 * ⇒ "bundle 补丁里有一个宿主级 insert 装着看板"这个形状**再也不会出现**（生成器现在遇到 `# @host-level`
 * 就 throw）；照旧判它只会得到一条永远红的假红。
 *
 * 迁过去之后，两件事没变，只是换了载体：
 *   ① **层归属**：`- insert:` 是**新增**行的唯一入口（`- id:` 那些是"改已存在的行"的 override）；
 *      一行装在 insert 外面 = 宿主装载层收不到它 = 浏览器没有东西可收。这一条在 profile 补丁里
 *      同样成立，所以 `scanProfilePlacement()` 判它。
 *   ② **行的身份按包认，不按名字形状认**：profile 补丁里挂载行**按设计不带 `id`**（定形 §五），
 *      所以不能再拿 `id: agenia-dashboard` 找它 —— 这里靠"它解析到的那份 `package.json` 是不是
 *      看板包那一份"来认（`dashboardManifest` 是入参，不是常量）。
 *
 * 🔴 **"还没挂" 不是 "挂错了"**：profile 补丁里没有看板那一行 ⇒ 这一格记第三态
 * **HOLD `DASH-MOUNT-DISABLED-PENDING-PROFILE-LAYER`**（不是绿）。它一旦出现，本格立刻回到
 * 红/绿两态（形状对 ⇒ 绿；住错层 / 行体不对 / 包没声明 ⇒ 红）—— 翻面靠合成夹具与真文件各证一次。
 */
export const PROFILE_CODES = Object.freeze({
  /** 看板那一行在 profile 补丁里，但**不是**顶层 `- insert:` 的直接成员（宿主装载层收不到它）。 */
  notProfileInsert: 'DASH-NOT-PROFILE-INSERT',
  /** profile 补丁里**没有**看板那一行（今天是"还没挂"⇒ HOLD；这条码本身只作读数/报文用）。 */
  profileMountMissing: 'DASH-PROFILE-MOUNT-MISSING',
  /** 挂载行带了 `id`：`- insert:` 是新增，带 `id` 的顶层条目是"改已存在的行"，两者不该混。 */
  profileRowHasId: 'DASH-PROFILE-ROW-HAS-ID',
  /** 挂载行 `disabled: true`：一行关着的不是一次挂载。 */
  profileRowDisabled: 'DASH-PROFILE-ROW-DISABLED',
  /** 别的客户端 UI 行装在 `- insert:` 外面（任何行，不只当前看板）。 */
  clientNotInProfileInsert: 'DASH-CLIENT-NOT-IN-PROFILE-INSERT',
})

/**
 * profile 补丁里的"行"= 带 `name` 的映射（`id` 可选）。
 * `in_top_level_insert` 用**结构**判（节点身份是不是某个顶层 `- insert:` 列表的成员），不数缩进。
 *
 * @param {unknown} node
 * @param {string} where 人话的落点（报文里要能指出来）
 * @param {boolean} inInsert 这一层是不是"顶层 `- insert:` 的直接成员"
 * @param {object[]} out
 */
function collectProfileRows(node, where, inInsert, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectProfileRows(item, where, false, out)
    return out
  }
  if (!(node instanceof Map)) return out
  const name = node.get('name')
  const isRow = typeof name === 'string'
  if (isRow) {
    out.push({ map: node, where, in_top_level_insert: inInsert === true, id: node.get('id') ?? null, name, disabled: node.get('disabled') ?? null })
  }
  for (const [key, value] of node) {
    if (value instanceof Map || Array.isArray(value)) collectProfileRows(value, isRow ? `${name} → ${key}` : `${where} → ${key}`, false, out)
  }
  return out
}

const sameFile = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase()

/**
 * **profile 层的层归属扫描**（`DASH-15` / `DASH-16` 共用的判据本体；纯函数，可喂夹具）。
 *
 * @param {{patchText: string, label?: string, manifestRoots?: string[],
 *          dashboardManifest: string, requireDashboard?: boolean}} input
 *   `dashboardManifest` = 看板包 `package.json` 的绝对路径（用来认"那一行是哪一行"，**不认 id / 名字形状**）；
 *   `requireDashboard` = 缺了看板那一行时是否报 `profileMountMissing`（用例按"还没挂"把它记 HOLD）。
 * @returns {{problems: object[], reading: object}}
 */
export function scanProfilePlacement({ patchText, label = 'profile 补丁', manifestRoots = [], dashboardManifest, requireDashboard = true }) {
  const doc = parseYamlSubset(patchText, `${label}·profile`)
  const reading = {
    label,
    warnings: [...doc.warnings],
    top_level_items: Array.isArray(doc.value) ? doc.value.length : null,
    top_level_kinds: (Array.isArray(doc.value) ? doc.value : []).map((op) => {
      if (!(op instanceof Map)) return `<${Array.isArray(op) ? 'list' : typeof op}>`
      if (Array.isArray(op.get('insert'))) return 'insert'
      if (typeof op.get('id') === 'string') return `override:${op.get('id')}`
      if (typeof op.get('name') === 'string') return `row:${op.get('name')}`
      return `<map keys=${[...op.keys()].join(',')}>`
    }),
    rows: [],
    insert_members: 0,
    client_ui_rows: [],
    violations: [],
    dashboard: null,
  }
  const problems = []
  if (reading.warnings.length > 0) {
    problems.push(problem(CODES.patchUnreadable,
      `${label} 有解析器读不懂的行（${reading.warnings.slice(0, 4).join(' / ')}）—— 层归属判不了（缺 ≠ 坏：这不是"行不在"）`,
      { scope: 'other' }))
    return { problems, reading }
  }

  const rows = []
  for (const op of Array.isArray(doc.value) ? doc.value : []) {
    if (!(op instanceof Map)) continue
    const insert = op.get('insert')
    if (Array.isArray(insert)) {
      for (const item of insert) collectProfileRows(item, '顶层 `- insert:` 的直接成员', true, rows)
    } else {
      collectProfileRows(op, '顶层条目（不是 `- insert:` 的直接成员）', false, rows)
    }
  }
  reading.rows = rows.map((r) => ({ name: r.name, id: r.id, disabled: r.disabled, where: r.where, in_top_level_insert: r.in_top_level_insert }))
  reading.insert_members = rows.filter((r) => r.in_top_level_insert).length

  const index = manifestIndexOf(manifestRoots)
  reading.manifest_files = index.files.map(relOf)
  /**
   * 「哪一行是看板那一行」= **它解析到的那份 `package.json` 声明的 `name`**（宿主建表用的就是这个键，
   * `BOOT-02` 的 A 腿读的也是它）或者是那份 `package.json` 本身。
   * 🔴 不认行 id（挂载行按设计不带 id）、不认名字形状（`file:///…` 只是当前写法，不是身份）。
   */
  let dashboardName = null
  if (existsSync(dashboardManifest)) {
    try {
      dashboardName = JSON.parse(readFileSync(dashboardManifest, 'utf8')).name ?? null
    } catch (err) {
      dashboardName = null
      reading.dashboard_manifest_error = String(err?.message ?? err)
    }
  }
  reading.dashboard_name = dashboardName
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
    }
  })
  reading.client_ui_rows = classified.filter((c) => c.client).map((c) => ({
    name: c.row.name,
    id: c.row.id,
    where: c.row.where,
    in_top_level_insert: c.row.in_top_level_insert,
    pkg: relOf(c.pkg.file),
  }))
  /**
   * 🔴 解析面**必须留读数**：`name` 解析不到的裸名（框架包在 `app.asar` 里 / 这棵树没有 `node_modules`）
   * 不许静默算进"不是客户端 UI" —— 那会把"读不到"伪装成"判过了"（Gate-2 那个病的同一个形状）。
   */
  reading.resolve = {
    ok: classified.filter((c) => c.pkg.ok).length,
    unresolved_bare: classified.filter((c) => !c.pkg.ok && c.pkg.how === 'unresolved-bare').length,
    not_a_package: classified.filter((c) => !c.pkg.ok && c.pkg.how === 'not-a-package').length,
    no_name: classified.filter((c) => !c.pkg.ok && c.pkg.how === 'no-name').length,
    bad_path: classified.filter((c) => !c.pkg.ok && c.pkg.how === 'bad-path').length,
    no_package_json: classified.filter((c) => !c.pkg.ok && c.pkg.how === 'no-package-json').length,
    package_json_unreadable: classified.filter((c) => !c.pkg.ok && c.pkg.how === 'package-json-unreadable').length,
  }
  reading.unresolved = classified
    .filter((c) => !c.pkg.ok && c.pkg.how === 'unresolved-bare')
    .map((c) => ({ name: c.row.name, where: c.row.where }))

  // ① 语义面：客户端 UI 行只许住 `- insert:` 里（任何行，不只当前看板）
  for (const c of classified) {
    if (!c.client || c.row.in_top_level_insert) continue
    const isDash = c.is_dashboard === true
    reading.violations.push({ name: c.row.name, id: c.row.id, where: c.row.where, pkg: relOf(c.pkg.file), dashboard: isDash })
    problems.push(problem(isDash ? PROFILE_CODES.notProfileInsert : PROFILE_CODES.clientNotInProfileInsert,
      `${label} 里有一行（${c.row.name}${c.row.id === null ? '' : ` · id ${c.row.id}`}）指向的包（${relOf(c.pkg.file)}）声明了 \`dsh.client.platform: web\`，`
      + `但它住在「${c.row.where}」—— 客户端 UI 行必须是**顶层 \`- insert:\` 的直接成员**（宿主装载层），`
      + '写在别处 = 宿主不会把它交给浏览器（与 `bug-20261104-02` 同一个形状）',
      { scope: isDash ? 'mount' : 'other', row_name: c.row.name }))
  }

  // ② 阳性腿：看板那一行自己
  const dash = classified.filter((c) => c.is_dashboard)
  reading.dashboard = {
    manifest: dashboardManifest,
    occurrences: dash.length,
    in_top_level_insert: dash.filter((c) => c.row.in_top_level_insert).length,
    rows: dash.map((c) => ({ name: c.row.name, id: c.row.id, where: c.row.where, in_top_level_insert: c.row.in_top_level_insert, disabled: c.row.disabled, platform: c.platform })),
    disabled_flags: dash.map((c) => c.row.disabled === true),
  }
  if (dash.length === 0) {
    if (requireDashboard) {
      problems.push(problem(PROFILE_CODES.profileMountMissing,
        `${label} 里没有任何一行解析到看板包（${relOf(dashboardManifest)}）—— 这一格的目标形状（"那一行装在顶层 \`- insert:\` 里"）`
        + '现在**还没有对象**：挂载路线正在从 bundle 层搬到 profile 层，`.tools/mount-dashboard-profile.mjs --apply` 还没跑。记 HOLD（不是绿），'
        + '那一行出现之后这一格自动回到红/绿两态',
        { scope: 'mount', manifest: relOf(dashboardManifest) }))
    }
  } else {
    for (const c of dash) {
      if (c.row.id !== null) {
        problems.push(problem(PROFILE_CODES.profileRowHasId,
          `${label} 里看板那一行带了 \`id: ${c.row.id}\` —— 挂载行的形状是"新增一行"（顶层 \`- insert:\` 的直接成员、**不带 id**，定形 §五）；`
          + '带 `id` 的顶层条目是"改已存在的行"（override），两者的语义不同',
          { scope: 'other', row_name: c.row.name }))
      }
      if (c.row.disabled === true) {
        problems.push(problem(PROFILE_CODES.profileRowDisabled,
          `${label} 里看板那一行是 \`disabled: true\` —— 一行关着的不是一次挂载（浏览器没有东西可收）`,
          { scope: 'other', row_name: c.row.name }))
      }
      if (!c.pkg.ok) {
        problems.push(problem(CODES.noClientDecl,
          `${label} 里看板那一行的 \`name\` 解析不到 package.json（${c.pkg.how}：${c.pkg.error}）—— 指不到包，浏览器没有东西可收`,
          { scope: 'other', row_name: c.row.name }))
      } else {
        if (c.platform !== CLIENT_UI_PLATFORM) {
          problems.push(problem(CODES.noClientDecl,
            `${label} 里看板那一行指向的包（${relOf(c.pkg.file)}）没有声明 \`dsh.client.platform: web\`（实得 ${JSON.stringify(c.platform)}）—— 浏览器不会收它`,
            { scope: 'other', row_name: c.row.name }))
        }
        if (!Object.prototype.hasOwnProperty.call(c.pkg.value?.exports ?? {}, './client')) {
          problems.push(problem(CODES.noClientDecl,
            `${label} 里看板那一行指向的包（${relOf(c.pkg.file)}）没有声明 \`exports["./client"]\`（实得 ${JSON.stringify(c.pkg.value?.exports ?? null)}）—— 浏览器侧没有入口可加载`,
            { scope: 'other', row_name: c.row.name }))
        }
      }
      const cfgMap = c.row.map.get('config')
      const root = cfgMap instanceof Map ? cfgMap.get('root') : null
      if (typeof root !== 'string' || root.trim() === '') {
        problems.push(problem(CODES.noClientDecl,
          `${label} 里看板那一行的 \`config.root\` 缺失或不是字符串（实得 ${JSON.stringify(root)}）—— 插件拿它当内容根，缺了面板读不到数据`,
          { scope: 'other', row_name: c.row.name }))
      }
    }
  }
  return { problems, reading }
}

/**
 * **profile 形状的合成补丁**（夹具；只住调用方给的目录）。
 *
 * 形状照**真** profile 补丁：顶层是一串 item —— `- id: <行 id>` + `name` + `config`（改已存在的行）
 * 与 `- insert:`（新增行）。挂载行按定形 §五：`- insert:` 的直接成员、**不带 id**、`name` 是路径形、
 * `config.root` 在。
 *
 * @param {{placement: 'insert'|'override'|'nested'|'absent', row: object, otherRow?: object}} input
 *   `row`  = `{id?, name, root, disabled?}`；`id` 给了才会写出来（量"带 id"那一格）。
 *   `placement`：`insert`（正确）· `override`（顶层 `- id:` 条目，住错层）· `nested`（塞进另一行的
 *   `config.plugins` 里，更深的错层）· `absent`（整行没有）。
 */
export function profilePatchFixture({ placement = 'insert', row, otherRow = null } = {}) {
  const rowBlock = (indent, r) => {
    const pad = ' '.repeat(indent)
    const lines = [r.id === undefined || r.id === null ? `${pad}- name: '${r.name}'` : `${pad}- id: ${r.id}`]
    if (r.id !== undefined && r.id !== null) lines.push(`${pad}  name: '${r.name}'`)
    if (r.disabled === true) lines.push(`${pad}  disabled: true`)
    lines.push(`${pad}  config:`, `${pad}    root: '${r.root}'`)
    return lines
  }
  const lines = [
    '# DASH-15/16 · profile 形状的合成补丁（阳性对照 / 刀）—— 只住运行根或测试抽屉，不是被测对象',
    '- id: ui-chat',
    '  name: "@deepseek-ai/dsh-client-ui-chat"',
    '  config:',
    '    transcriptView: detailed',
  ]
  if (placement === 'insert') {
    lines.push('- insert:')
    lines.push(...rowBlock(4, row))
    if (otherRow !== null) lines.push(...rowBlock(4, otherRow))
  }
  if (placement === 'override') lines.push(...rowBlock(0, row))
  if (placement === 'nested') {
    lines.push('- id: ui-conversation', '  name: "@deepseek-ai/dsh-client-ui-conversation"', '  config:', '    busyEnter: steer', '    plugins:')
    lines.push(...rowBlock(6, row))
  }
  lines.push('- id: web-search-deepseek', '  name: "@deepseek-ai/dsh-web-search-deepseek"', '  config:', '    apiKeyEnv: DEEPSEEK_API_KEY')
  return `${lines.join('\n')}\n`
}

/**
 * 把一段挂载块**追加**到一份真补丁文本后面（阳性对照用：真字节 + 真形状的行）。
 * 已经有看板行时**原样返回**（修好之后这一格是恒等变换，仍然要求判据干净）—— 与 `DASH-15`
 * 旧的 `correctedRealText()` 同一个口径。
 *
 * @param {string} text 真补丁原文
 * @param {{name: string, root: string}} row
 * @param {boolean} alreadyPresent 调用方已经量过"那一行在不在"
 */
export function appendMountBlock(text, { name, root }, alreadyPresent = false) {
  if (alreadyPresent) return { text, appended: false }
  const block = [
    '',
    '# >>>AGENIA-DASHBOARD-MOUNT>>>',
    '- insert:',
    `    - name: '${name}'`,
    '      config:',
    `        root: '${root}'`,
    '# <<<AGENIA-DASHBOARD-MOUNT<<<',
    '',
  ].join('\n')
  const base = String(text).endsWith('\n') ? String(text) : `${text}\n`
  return { text: `${base}${block}`, appended: true }
}

/**
 * 组合原文里某一行自己的状态（**只看组合，不看补丁** —— 组合是源，补丁是派生物）。
 *
 * @param {string} compositionText `agent.cordis.yml` 原文
 * @param {string} rowId
 * @returns {{found: boolean, occurrences: number, disabled: boolean, disabled_values: any[]}}
 *   `disabled` = 出现过的每一行都是字面 `true`（`disabledKind() === 'literal-true'`）；
 *   一行都没有 ⇒ `found: false`（"行不在"与"行开着"是两件事，不合并）。
 */
export function compositionRowState(compositionText, rowId) {
  const rows = collectRows(parseYamlSubset(compositionText, `${rowId}·composition`).value).filter((r) => r.id === rowId)
  return {
    found: rows.length > 0,
    occurrences: rows.length,
    disabled: rows.length > 0 && rows.every((r) => r.disabled === true),
    disabled_values: rows.map((r) => r.disabled ?? null),
  }
}

const GROUP_NAME = 'cordis:group'
/** 路径形名字（与框架的 `pathLike` 同一族：`file:` / 盘符 / 斜杠 / `./` `../`）。 */
const PATH_LIKE = /^(file:|[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|\\\\)/
const relOf = (file) => path.relative(PATHS.repo, file).replace(/\\/g, '/')

/**
 * 顶层 `- insert:` 的直接成员（宿主装载层装的就是这些）—— 用**结构**判，不数缩进。
 * 0 条宿主级行时生成器只留一个空壳 `- insert:`（YAML 读出来是 `null`）⇒ 记成 `kind: 'empty'`，
 * 不当错误（`presetEntryProblems()` 那一侧同理：0 个宿主 insert 是合法形状）。
 * @returns {{hostMaps: Set<Map>, blocks: Array<{insert:number, ids:string[], kind:string}>}}
 */
function topLevelHostMaps(doc) {
  const hostMaps = new Set()
  const blocks = []
  const ops = Array.isArray(doc.value) ? doc.value : []
  ops.forEach((op, index) => {
    if (!(op instanceof Map)) {
      blocks.push({ insert: index + 1, ids: [], kind: 'not-a-map' })
      return
    }
    const insert = op.get('insert')
    if (insert === null && [...op.keys()].length === 1) {
      blocks.push({ insert: index + 1, ids: [], kind: 'empty' })
      return
    }
    if (!Array.isArray(insert)) {
      blocks.push({ insert: index + 1, ids: [], kind: 'not-insert' })
      return
    }
    const ids = []
    for (const item of insert) {
      if (item instanceof Map && typeof item.get('id') === 'string') {
        hostMaps.add(item)
        ids.push(item.get('id'))
      }
    }
    blocks.push({ insert: index + 1, ids, kind: ids.length === 0 ? 'empty' : 'insert' })
  })
  return { hostMaps, blocks }
}

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
 * 判据本体（纯函数，可喂夹具）：语义面 + 阳性腿。
 *
 * @param {{patchText: string, rowId: string, label?: string, manifestRoots?: string[],
 *          registrationName?: string}} input
 * @returns {{problems: Array<{code:string,message:string}>, reading: object}}
 */
export function scanClientUiPlacement({
  patchText,
  rowId,
  label = '补丁',
  manifestRoots = [],
  registrationName = FROZEN.oracle.registrationName,
}) {
  const problems = []
  const doc = parseYamlSubset(patchText, `${label}·DASH-16`)
  const reading = {
    label,
    warnings: [...doc.warnings],
    manifest_roots: manifestRoots.map((root) => relOf(path.resolve(root))),
    top_level_blocks: [],
    rows_total: 0,
    preset_entries: [],
    preset_rows: 0,
    resolve: {
      nearest_package: 0,
      manifest_name: 0,
      unresolved_bare: 0,
      not_a_package: 0,
      no_name: 0,
      bad_path: 0,
      no_package_json: 0,
      package_json_unreadable: 0,
    },
    unresolved: [],
    client_ui_rows: [],
    violations: [],
    dashboard: null,
  }
  if (reading.warnings.length > 0) {
    problems.push(problem(CODES.patchUnreadable,
      `${label} 有解析器读不懂的行（${reading.warnings.slice(0, 4).join(' / ')}）—— 语义面判不了这一份的形状（缺 ≠ 坏 ≠ 空）`,
      { scope: 'other' }))
    return { problems, reading }
  }

  const { hostMaps, blocks } = topLevelHostMaps(doc)
  reading.top_level_blocks = blocks
  const rows = collectRows(doc.value)
  reading.rows_total = rows.length

  // 预设体 = 每个注册行 `config.plugins` 的整棵子树（含组里的行）；行对象身份 → 哪一份预设。
  const presetOfMap = new Map()
  for (const reg of rows.filter((r) => r.name === registrationName)) {
    const presetId = cfg(reg, 'id') ?? reg.id
    const plugins = cfg(reg, 'plugins')
    reading.preset_entries.push({ id: presetId, plugins: Array.isArray(plugins) ? plugins.length : null })
    if (!Array.isArray(plugins)) continue
    for (const r of collectRows(plugins)) {
      if (!presetOfMap.has(r.map)) presetOfMap.set(r.map, presetId)
    }
  }
  reading.preset_rows = presetOfMap.size

  const index = manifestIndexOf(manifestRoots)
  reading.manifest_files = index.files.map(relOf)
  reading.manifest_truncated = index.truncated
  if (index.problems.length > 0) reading.manifest_problems = index.problems

  const unresolved = new Map()
  /** `resolveRowPackage()` 的 `how` → 读数计数器（`how` 是给人和报文看的形状，计数器要能稳定求和）。 */
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
  const classified = rows.map((row) => {
    const pkg = resolveRowPackage(row.name, index)
    const bucket = BUCKET[pkg.how] ?? pkg.how
    reading.resolve[bucket] = (reading.resolve[bucket] ?? 0) + 1
    if (!pkg.ok && pkg.how === 'unresolved-bare') {
      const hit = unresolved.get(row.name) ?? { name: row.name, count: 0, where: new Set() }
      hit.count += 1
      hit.where.add(presetOfMap.get(row.map) ?? 'host/top')
      unresolved.set(row.name, hit)
    }
    const platform = pkg.ok ? (pkg.value?.dsh?.client?.platform ?? null) : null
    return { row, pkg, platform, client: platform === CLIENT_UI_PLATFORM }
  })
  reading.unresolved = [...unresolved.values()]
    .map((x) => ({ name: x.name, count: x.count, where: [...x.where].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const clientAll = classified.filter((c) => c.client)
  reading.client_ui_rows = clientAll.map((c) => ({
    id: c.row.id,
    name: c.row.name,
    platform: c.platform,
    how: c.pkg.how,
    pkg: c.pkg.ok ? relOf(c.pkg.file) : null,
    placement: hostMaps.has(c.row.map) ? 'host' : presetOfMap.has(c.row.map) ? 'preset' : 'other',
    ...(presetOfMap.has(c.row.map) ? { preset: presetOfMap.get(c.row.map) } : {}),
    parent: typeof c.row.parent === 'string' ? c.row.parent : null,
    disabled: c.row.disabled ?? null,
  }))

  // ① 语义面：预设体里不许有解析到客户端 UI 包的行
  for (const c of classified) {
    if (!c.client || !presetOfMap.has(c.row.map)) continue
    const presetId = presetOfMap.get(c.row.map)
    const isDash = c.row.id === rowId
    reading.violations.push({ preset: presetId, id: c.row.id, name: c.row.name, pkg: relOf(c.pkg.file), disabled: c.row.disabled ?? null })
    problems.push(problem(CODES.clientInPreset,
      `预设 ${presetId} 的 plugins 里有一行 \`${c.row.id}\` 指向的包（${relOf(c.pkg.file)}）声明了 \`dsh.client.platform: web\``
      + ' —— 客户端 UI 行只许住补丁**顶层 `- insert:`**（宿主装载层）；装进预设 = 浏览器收不到它（与 bug-20261104-02 同形）。'
      + (c.row.disabled === true
        ? '这一行现在是 `disabled: true`（回滚期：挂载路线待重设计，走 profile 层）——\n'
          + '        **不要**照着"加 `# @host-level` + 进 `HOST_LEVEL_IDS`"去修：那条路 2026-11-05 实测会让整个 bundle 层 boot 失败。'
        : '修法：在 `agent.cordis.yml` 给这一行加 `# @host-level`、并把 id 加进生成器的 `HOST_LEVEL_IDS`，然后重跑生成器'),
      { scope: isDash ? 'mount' : 'other', row_id: c.row.id, preset: presetId }))
  }

  // ② 阳性腿：语义集合非空，且当前看板那一行是顶层 insert 的直接成员
  //    🔴 这一腿**整条**都是"看板那一行的层归属"这一个问题 ⇒ 它报的每一条都带 `scope: 'mount'`
  //       （回滚期由用例按"这一行是不是 disabled"把它记成 HOLD，而不是红）。
  const dashRows = rows.filter((r) => r.id === rowId)
  const dashOutside = dashRows.filter((r) => !hostMaps.has(r.map))
  const dashDisabledFlags = dashRows.map((r) => r.disabled === true)
  reading.dashboard = {
    id: rowId,
    occurrences: dashRows.length,
    host_members: dashRows.length - dashOutside.length,
    outside: dashOutside.map((r) => ({ parent: typeof r.parent === 'string' ? r.parent : null, preset: presetOfMap.get(r.map) ?? null, disabled: r.disabled ?? null })),
    semantic_client_rows: clientAll.length,
    disabled_flags: dashDisabledFlags,
    all_disabled: dashRows.length > 0 && dashDisabledFlags.every(Boolean),
  }
  if (clientAll.length === 0) {
    problems.push(problem(CODES.hostMissing,
      `整份补丁里没有任何一行解析到声明 \`dsh.client.platform: web\` 的包 —— 这一格的阳性腿没有对象：`
      + '"客户端 UI 行必须住宿主 insert"无从成立。缺 ≠ 挪（行整个不在时由 `DASH-15` 的 `DASH-ROW-ABSENT` 报）',
      { scope: 'mount', row_id: rowId }))
  } else if (dashRows.length === 0) {
    problems.push(problem(CODES.hostMissing,
      `语义集合里有 ${clientAll.length} 行客户端 UI（${clientAll.map((c) => c.row.id).join(', ')}），但当前看板那一行 \`${rowId}\` `
      + '整个不在补丁里 —— 宿主 insert 没装它（阳性腿不成立）',
      { scope: 'mount', row_id: rowId }))
  } else if (dashOutside.length > 0) {
    const where = dashOutside.map((r) => (presetOfMap.has(r.map) ? `预设 ${presetOfMap.get(r.map)}` : (r.parent ?? '顶层之外'))).join(' / ')
    problems.push(problem(CODES.hostMissing,
      `当前看板那一行 \`${rowId}\` 在补丁里出现 ${dashRows.length} 次，但只有 ${dashRows.length - dashOutside.length} 次是顶层 \`- insert:\` 的直接成员`
      + `；其余住在 ${where} —— 宿主装载层没装它（浏览器收不到）`,
      { scope: 'mount', row_id: rowId }))
  }

  return { problems, reading }
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
 * 合成补丁：`dashboard` / `synthetic` 各自是 `host`（顶层 insert 直接成员）/ `preset`（预设 plugins 里）/
 * `absent`（没有这一行）。其余结构与真补丁同形（`- insert:` + 一条注册行 + plugins）。
 * 行对象带 `disabled: true` 时那一行会写出 `disabled: true`（分流政策那几格用它量"关着"这一态）。
 *
 * @param {{dashboard?: 'host'|'preset'|'absent', synthetic?: 'host'|'preset'|'absent',
 *          dashboardRow: object, syntheticRow: object, presetId?: string}} input
 */
export function clientUiPatchFixture({ dashboard = 'host', synthetic = 'absent', dashboardRow, syntheticRow, presetId = 'agenia' } = {}) {
  const rowBlock = (indent, row) => {
    const pad = ' '.repeat(indent)
    const lines = [`${pad}- id: ${row.id}`]
    if (row.disabled === true) lines.push(`${pad}  disabled: true`)
    lines.push(
      `${pad}  name: '${row.name}'`,
      `${pad}  config:`,
      `${pad}    root: '${row.root}'`,
    )
    return lines
  }
  const lines = [
    '# DASH-16 合成补丁（阳性对照 / 刀）—— 只住运行根或测试抽屉，不是被测对象',
    '- insert:',
  ]
  if (dashboard === 'host') lines.push(...rowBlock(4, dashboardRow))
  if (synthetic === 'host') lines.push(...rowBlock(4, syntheticRow))
  lines.push(
    `    - id: preset-${presetId} # 行名按约定写 preset-<预设 id>`,
    `      name: '${FROZEN.oracle.registrationName}'`,
    '      config:',
    `        id: ${presetId}`,
    "        name: '合成预设'",
    "        description: '只住运行根或测试抽屉'",
    '        order: 10',
    '        plugins:',
    '          - id: persona',
    "            name: '@deepseek-ai/dsh-persona'",
  )
  if (dashboard === 'preset') lines.push(...rowBlock(10, dashboardRow))
  if (synthetic === 'preset') lines.push(...rowBlock(10, syntheticRow))
  return `${lines.join('\n')}\n`
}
