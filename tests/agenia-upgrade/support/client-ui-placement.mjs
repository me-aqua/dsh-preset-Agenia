/**
 * **客户端 UI 行的层归属**（`DASH-16`；第 4 关评审 2026-11-05 的 `R-1`）—— 量具 + 合成夹具。
 *
 * 一句话：**一行的层归属由"它指向的包是不是客户端 UI"决定，不由"作者记不记得写标记 / 点名表"决定。**
 *
 * 为什么要有这一格：`DASH-15` 与三个生成期 throw 覆盖的是**标记与表不一致**（标了但表里没有 /
 * 表里有但标记没了 / 标记重复或位置不对）。它们覆盖不到**两处都忘**：一行 `dsh.client` 的插件进了
 * 组合、没写 `# @host-level`、也没进 `HOST_LEVEL_IDS` ⇒ 生成器走 `marks === 0` 分支，把它当普通行
 * 拷进**每一份预设**，浏览器收不到 —— 与 `bug-20261104-02` 同一个形状，而全套判据照样绿。
 *
 * 所以这里**不读标记、不读 `HOST_LEVEL_IDS`、不认行 id**（唯一例外是阳性腿点的"当前看板那一行"）：
 *   ① **语义面**：对**每份预设 `plugins` 里**的行，用行的 `name` 解析到盘上的 `package.json`；
 *      若那个包声明了 `dsh.client.platform: "web"` ⇒ `DASH-CLIENT-IN-PRESET`。
 *      这一行叫什么、谁登记过它、作者有没有记得 —— 都不影响这个判断。
 *   ② **阳性腿**：语义集合（整份补丁里解析到 web 包的行）必须**非空**，且当前看板那一行必须是
 *      **顶层 `- insert:` 的直接成员**；否则 ⇒ `DASH-HOST-MISSING`。
 *      没有它，"整份补丁里一行客户端 UI 都没有"与"客户端 UI 行不在宿主层"会一起绿。
 *
 * 🔴 **解析面（这一格的边界，读之前先知道）** —— `name` 的两种形状：
 *   · **路径形**（`file:///…`、绝对路径）：从入口文件往上找最近的 `package.json`（真解析）；
 *   · **裸包名**（`@scope/pkg`）：在调用方给的 `manifestRoots` 里按 `package.json` 的 `name` 匹配
 *     （这棵树没有 `node_modules`；框架包在 `app.asar` 里，盘上解析不到）。
 *   两种都解析不到的裸名记进读数 `unresolved`，**不冒充"不是客户端 UI"、也不冒充判过**。
 *   本仓自己的客户端 UI 包是路径形（看板那一行就是 `file:///…/client-ui-dashboard/lib/index.js`），
 *   这条路径不依赖任何名单 —— 未来新加的本地客户端 UI 包只要行是路径形就同样被抓到。
 *
 * 为什么 `manifestRoots` 是入参：测试要量**被测的预设树**，探针要量**活树** —— 根是输入，不是常量。
 *
 * ⚠️ 判读边界（不归这一格）：像素 / 浏览器真的收到包归 GUI 清单；"生成补丁是不是生成器的派生物"
 *   归 `DASH-15` 的 ③；"标记与表一致"归生成期 throw 与 `DASH-15` 的 ①。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectRows, cfg, parseYamlSubset } from './composition.mjs'
import { FROZEN, PATHS } from './env.mjs'
import { problem } from './evidence.mjs'

/** 框架 `ClientModuleRegistry` 认的那个值（`processOne()` 的声明门槛）。 */
export const CLIENT_UI_PLATFORM = 'web'

/** 这一格的三个码（稳定、可 grep）。 */
export const CODES = Object.freeze({
  clientInPreset: 'DASH-CLIENT-IN-PRESET',
  hostMissing: 'DASH-HOST-MISSING',
  patchUnreadable: 'DASH-PATCH-UNREADABLE',
})

const GROUP_NAME = 'cordis:group'
/** 路径形名字（与框架的 `pathLike` 同一族：`file:` / 盘符 / 斜杠 / `./` `../`）。 */
const PATH_LIKE = /^(file:|[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|\\\\)/
const relOf = (file) => path.relative(PATHS.repo, file).replace(/\\/g, '/')

/**
 * 顶层 `- insert:` 的直接成员（宿主装载层装的就是这些）—— 用**结构**判，不数缩进。
 * @returns {{hostMaps: Set<Map>, blocks: Array<{insert:number, ids:string[]}>}}
 */
function topLevelHostMaps(doc) {
  const hostMaps = new Set()
  const blocks = []
  const ops = Array.isArray(doc.value) ? doc.value : []
  ops.forEach((op, index) => {
    if (!(op instanceof Map) || !Array.isArray(op.get('insert'))) {
      blocks.push({ insert: index + 1, ids: [] })
      return
    }
    const ids = []
    for (const item of op.get('insert')) {
      if (item instanceof Map && typeof item.get('id') === 'string') {
        hostMaps.add(item)
        ids.push(item.get('id'))
      }
    }
    blocks.push({ insert: index + 1, ids })
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
      `${label} 有解析器读不懂的行（${reading.warnings.slice(0, 4).join(' / ')}）—— 语义面判不了这一份的形状（缺 ≠ 坏 ≠ 空）`))
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
    reading.violations.push({ preset: presetId, id: c.row.id, name: c.row.name, pkg: relOf(c.pkg.file) })
    problems.push(problem(CODES.clientInPreset,
      `预设 ${presetId} 的 plugins 里有一行 \`${c.row.id}\` 指向的包（${relOf(c.pkg.file)}）声明了 \`dsh.client.platform: web\``
      + ' —— 客户端 UI 行只许住补丁**顶层 `- insert:`**（宿主装载层）；装进预设 = 浏览器收不到它（与 bug-20261104-02 同形）。'
      + '修法：在 `agent.cordis.yml` 给这一行加 `# @host-level`、并把 id 加进生成器的 `HOST_LEVEL_IDS`，然后重跑生成器'))
  }

  // ② 阳性腿：语义集合非空，且当前看板那一行是顶层 insert 的直接成员
  const dashRows = rows.filter((r) => r.id === rowId)
  const dashOutside = dashRows.filter((r) => !hostMaps.has(r.map))
  reading.dashboard = {
    id: rowId,
    occurrences: dashRows.length,
    host_members: dashRows.length - dashOutside.length,
    outside: dashOutside.map((r) => ({ parent: typeof r.parent === 'string' ? r.parent : null, preset: presetOfMap.get(r.map) ?? null })),
    semantic_client_rows: clientAll.length,
  }
  if (clientAll.length === 0) {
    problems.push(problem(CODES.hostMissing,
      `整份补丁里没有任何一行解析到声明 \`dsh.client.platform: web\` 的包 —— 这一格的阳性腿没有对象：`
      + '"客户端 UI 行必须住宿主 insert"无从成立。缺 ≠ 挪（行整个不在时由 `DASH-15` 的 `DASH-ROW-ABSENT` 报）'))
  } else if (dashRows.length === 0) {
    problems.push(problem(CODES.hostMissing,
      `语义集合里有 ${clientAll.length} 行客户端 UI（${clientAll.map((c) => c.row.id).join(', ')}），但当前看板那一行 \`${rowId}\` `
      + '整个不在补丁里 —— 宿主 insert 没装它（阳性腿不成立）'))
  } else if (dashOutside.length > 0) {
    const where = dashOutside.map((r) => (presetOfMap.has(r.map) ? `预设 ${presetOfMap.get(r.map)}` : (r.parent ?? '顶层之外'))).join(' / ')
    problems.push(problem(CODES.hostMissing,
      `当前看板那一行 \`${rowId}\` 在补丁里出现 ${dashRows.length} 次，但只有 ${dashRows.length - dashOutside.length} 次是顶层 \`- insert:\` 的直接成员`
      + `；其余住在 ${where} —— 宿主装载层没装它（浏览器收不到）`))
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
 *
 * @param {{dashboard?: 'host'|'preset'|'absent', synthetic?: 'host'|'preset'|'absent',
 *          dashboardRow: object, syntheticRow: object, presetId?: string}} input
 */
export function clientUiPatchFixture({ dashboard = 'host', synthetic = 'absent', dashboardRow, syntheticRow, presetId = 'agenia' } = {}) {
  const rowBlock = (indent, row) => {
    const pad = ' '.repeat(indent)
    return [
      `${pad}- id: ${row.id}`,
      `${pad}  name: '${row.name}'`,
      `${pad}  config:`,
      `${pad}    root: '${row.root}'`,
    ]
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
