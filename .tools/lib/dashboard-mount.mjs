/**
 * 看板挂载的**唯一形状来源** —— profile 补丁里那一行、那一块、以及读它的口径。
 *
 * 为什么单独一份：这一行有两个读者 —— `.tools/mount-dashboard-profile.mjs`（写 / 撤）
 * 与 `tests/agenia-upgrade` 的启动后读数（`BOOT-01` / `BOOT-02` 判"挂上了没有"）。
 * 形状只在这里生成一次：写进去的字节、`--check` 比对的期望、验收读到的 `name` / `config.root`
 * 都从 `dashboardMountRow()` 来。判据那边要量形状，就 import 这个函数，别再抄一份字面量。
 *
 * 形状（profile 补丁的**顶层** `- insert:` 直接成员；这一行自己**不带 `id`**）：
 *
 *   - insert:
 *       - name: 'file:///<root>/presets/agenia/client-ui-dashboard/lib/index.js'
 *         config:
 *           root: '<root>'
 *
 * 为什么 `name` 是 `lib/index.js` 而不是包名：宿主按**行的模块位置**往上找最近的
 * `package.json`，包名从那份 manifest 里读（`ClientModuleRegistry.locatePkgJson()`）；
 * 这个包不在宿主的 node_modules 里，写裸包名解析不到。`name` 指到 `lib/index.js`，
 * 最近的那份 `package.json` 就是 `client-ui-dashboard/package.json`。
 *
 * 为什么宿主级行不写进 bundle 补丁：浏览器只收**宿主 Loader 树**里的条目
 * （`@deepseek-ai/dsh-client-modules` 的 `ClientModuleRegistry.processOne()` 只枚举
 * `ctx.loader.entries()`）；bundle 层在 boot 时被合成，而预设里的行由
 * `@deepseek-ai/dsh-agent-preset` 注册进它自建的 Loader 树。宿主级行住 profile 补丁，
 * 预设级行住 bundle 补丁 —— 两层各有一个落点，挂载/撤销也才是一行的事。
 *
 * 这个模块**没有加载期副作用**：CLI 的入口在 `mount-dashboard-profile.mjs`。
 *
 * @module .tools/lib/dashboard-mount
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** 看板包在仓库里的相对目录（`root` 之下）。 */
export const DASHBOARD_PACKAGE_REL = 'presets/agenia/client-ui-dashboard'
/** 这一行的模块入口（相对包目录）。 */
export const DASHBOARD_ENTRY_REL = 'lib/index.js'

/**
 * 这一块的边界标记。两条规矩：
 *  ① 标记串**不许**在块正文里出现 —— 正文里出现一次，撤掉时 `indexOf` 会命中正文，
 *     只切半块，热补丁里剩一段孤儿 YAML；
 *  ② 撤掉按**整行**认标记（`line === marker`），不是 `indexOf` —— 正文里提到标记也不误伤。
 */
export const MOUNT_MARKERS = Object.freeze({
  begin: '# >>>AGENIA-DASHBOARD-MOUNT>>>',
  end: '# <<<AGENIA-DASHBOARD-MOUNT<<<',
})

const toPosix = (value) => String(value).replace(/\\/g, '/').replace(/\/+$/, '')
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').toUpperCase()

/** 看板包目录（平台路径；`root` = 工作区根）。 */
export function dashboardPackageDir(root = 'E:/Harness') {
  return path.join(root, ...DASHBOARD_PACKAGE_REL.split('/'))
}

/** 看板包在宿主 Loader 里那一行的模块入口（绝对路径）。 */
export function dashboardEntryPath(root = 'E:/Harness') {
  return path.join(dashboardPackageDir(root), ...DASHBOARD_ENTRY_REL.split('/'))
}

/** 看板包在宿主 Loader 里那一行的 `file:///` URL（这一行形状的 `name`）。 */
export function dashboardEntryUrl(root = 'E:/Harness') {
  const dir = toPosix(root).replace(/^\/+/, '')
  return `file:///${dir}/${DASHBOARD_PACKAGE_REL}/${DASHBOARD_ENTRY_REL}`
}

/**
 * 这一行的**唯一形状**（纯对象，不含任何写盘动作）。
 *
 * 只有两个键：`name` 与 `config.root`。**不带 `id`**：这一行是 profile 补丁顶层
 * `- insert:` 的直接成员，加载器会给没有 id 的行生成一个（`EntryTree.ensureId()`）；
 * 带 id 会让"同一个 id 在宿主树里出现两次"成为可能，而没有 id 的这一行反而不参与
 * 任何 id 对账。验收清单要的形状就是"无 id"。
 *
 * @param {{root?: string}} [options] `root` = 工作区根（绝对路径）
 * @returns {{name: string, config: {root: string}}}
 */
export function dashboardMountRow({ root = 'E:/Harness' } = {}) {
  return {
    name: dashboardEntryUrl(root),
    config: { root: toPosix(root) },
  }
}

const yamlScalar = (value) => `'${String(value).replace(/'/g, "''")}'`

/** 把形状对象渲染成 YAML 行（`- insert:` 的直接成员，4 格缩进）。 */
export function dashboardMountRowYaml(row = dashboardMountRow()) {
  return [
    `    - name: ${yamlScalar(row.name)}`,
    '      config:',
    `        root: ${yamlScalar(row.config.root)}`,
  ].join('\n')
}

/**
 * 写进 profile 补丁的那一整块（含边界标记；**块正文里不出现标记串**）。
 * 末尾带一个换行 —— `dashboardMountPayload()` 在它前面再加一个换行，`--revert` 就切同一段字节。
 */
export function dashboardMountBlock({ root = 'E:/Harness' } = {}) {
  return [
    MOUNT_MARKERS.begin,
    '# 让「看板」成为宿主 Loader 树的一行：Node 侧每 15 秒写一份快照，浏览器侧读它。',
    '# 由 .tools/mount-dashboard-profile.mjs 写入；撤掉用它的 --revert（别手删，删漏一行就变成孤儿 YAML）。',
    '- insert:',
    dashboardMountRowYaml(dashboardMountRow({ root })),
    MOUNT_MARKERS.end,
    '',
  ].join('\n')
}

/** `--apply` 追加的那段字节（`\n` + 块）—— `--revert` 精确切掉同一段。 */
export function dashboardMountPayload({ root = 'E:/Harness' } = {}) {
  return `\n${dashboardMountBlock({ root })}`
}

// ── 读：profile 补丁里那一行在哪、是不是顶层、开没开 ─────────────────────────
const PACKAGE_NEEDLE = 'client-ui-dashboard'

/** YAML 标量（这一份补丁里出现的形状：单/双引号、裸值、行尾注释）。 */
function parseScalar(raw) {
  let value = String(raw).trim()
  if (value.startsWith("'")) {
    let out = ''
    for (let i = 1; i < value.length; i += 1) {
      if (value[i] === "'" && value[i + 1] === "'") {
        out += "'"
        i += 1
        continue
      }
      if (value[i] === "'") return out
      out += value[i]
    }
    return out
  }
  if (value.startsWith('"')) {
    let end = 1
    while (end < value.length) {
      if (value[end] === '\\') {
        end += 2
        continue
      }
      if (value[end] === '"') break
      end += 1
    }
    const literal = value.slice(0, Math.min(end + 1, value.length))
    try {
      return JSON.parse(literal)
    } catch {
      return literal.slice(1, -1)
    }
  }
  return value.replace(/\s+#.*$/, '').trim()
}

const indentOf = (line) => (/^[ ]*/.exec(line) ?? [''])[0].length
const isBlank = (line) => line.trim() === ''
const isComment = (line) => /^\s*#/.test(line)

/** 找一行里 `key:` 的值（只认同一个缩进；行块的第一行认 `- key:` 形式）。 */
function fieldAt(lines, start, end, key, indent, { rowStart = start } = {}) {
  const plain = new RegExp(`^ {${indent}}${key}:\\s*(.*?)\\s*$`)
  const list = new RegExp(`^ {${Math.max(indent - 2, 0)}}- ${key}:\\s*(.*?)\\s*$`)
  for (let i = start; i < end; i += 1) {
    if (isComment(lines[i]) || isBlank(lines[i])) continue
    const hit = (i === rowStart ? list.exec(lines[i]) : null) ?? plain.exec(lines[i])
    if (hit !== null) return { index: i, raw: hit[1], value: parseScalar(hit[1]) }
  }
  return null
}

/** 一个行块里的 `config.root`（`config:` 下的 `root:`；也认内联 `{…}`）。 */
function rootOf(lines, start, end, keyIndent) {
  const config = fieldAt(lines, start, end, 'config', keyIndent)
  if (config === null) return null
  const inline = /^\s*\{(.*)\}\s*$/.exec(config.raw)
  if (inline !== null) {
    const hit = /(?:^|,)\s*root:\s*(.+?)\s*(?:,|$)/.exec(inline[1])
    return hit === null ? null : parseScalar(hit[1])
  }
  const child = fieldAt(lines, config.index + 1, end, 'root', keyIndent + 2)
  return child === null ? null : child.value
}

/** 一行里 `disabled` 的读数：`true` / `false` / `!!js` / 没写。 */
function disabledOf(lines, start, end, keyIndent) {
  const hit = fieldAt(lines, start, end, 'disabled', keyIndent)
  if (hit === null) return { raw: null, value: null, is_true: false }
  if (hit.value === 'true') return { raw: hit.raw, value: true, is_true: true }
  if (hit.value === 'false') return { raw: hit.raw, value: false, is_true: false }
  return { raw: hit.raw, value: hit.value, is_true: false, conditional: true }
}

/**
 * profile 补丁里**所有**指向看板包的 `name:` 行，以及每一行的位置 / 开关 / 行体。
 *
 * 位置只按结构判（顶层 `- insert:` 的直接成员是 4 格缩进子项；别处的同名行归 `nested`），
 * 不按行号猜。`name` 是唯一的身份：行 id 可以变，包目录名不会。
 *
 * @param {string} text profile 补丁全文
 * @returns {{present: boolean, rows: object[], mount: object|null, nested: object[], duplicates: number, markers: object}}
 */
export function readDashboardMount(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const rows = []
  const seenLines = new Set()

  const takeRow = ({ placement, line, keyIndent, parent = null, blockEnd }) => {
    if (seenLines.has(line)) return
    const end = blockEnd ?? line + 1
    const name = fieldAt(lines, line, end, 'name', keyIndent)
    if (name === null || typeof name.value !== 'string' || !name.value.includes(PACKAGE_NEEDLE)) return
    const id = fieldAt(lines, line, end, 'id', keyIndent)
    const disabled = disabledOf(lines, line, end, keyIndent)
    const root = rootOf(lines, line, end, keyIndent)
    seenLines.add(line)
    rows.push({
      placement,
      line: line + 1,
      indent: keyIndent,
      parent,
      id: id === null ? null : id.value,
      name: name.value,
      root,
      disabled: disabled.value,
      disabled_raw: disabled.raw,
      disabled_conditional: disabled.conditional === true,
    })
  }

  // 顶层 item：列 0 的 `- ` 行。顶层 `- insert:` 的直接成员 = 恰好 4 格缩进的 `- ` 行。
  const topStarts = []
  for (let i = 0; i < lines.length; i += 1) if (/^- /.test(lines[i])) topStarts.push(i)
  const topBlocks = topStarts.map((start, index) => ({
    start,
    end: index + 1 < topStarts.length ? topStarts[index + 1] : lines.length,
  }))
  for (const block of topBlocks) {
    const first = lines[block.start]
    if (/^- insert:\s*(?:#.*)?$/.test(first)) {
      const childStarts = []
      for (let i = block.start + 1; i < block.end; i += 1) {
        if (/^ {4}- /.test(lines[i])) childStarts.push(i)
      }
      for (let c = 0; c < childStarts.length; c += 1) {
        const start = childStarts[c]
        const end = c + 1 < childStarts.length ? childStarts[c + 1] : block.end
        // 只认 `- insert:` 的**直接**成员：4 格缩进。组/预设块里的行缩进更深，落到下面的兜底。
        takeRow({ placement: 'insert', line: start, keyIndent: 6, blockEnd: end })
      }
      continue
    }
    if (/^- /.test(first)) {
      // 顶层 override（`- id: …`）—— 它有 name 也不是宿主插入块。
      takeRow({ placement: 'top-level-override', line: block.start, keyIndent: 2, blockEnd: block.end })
    }
  }

  // 兜底：任何缩进深于 4 的 `name:` 行（预设的 `plugins`、组的 `config` 里）。
  for (let i = 0; i < lines.length; i += 1) {
    if (seenLines.has(i) || isComment(lines[i])) continue
    const listHit = /^(\s*)- name:\s*(.*)$/.exec(lines[i])
    const plainHit = listHit === null ? /^(\s+)name:\s*(.*)$/.exec(lines[i]) : null
    const hit = listHit ?? plainHit
    if (hit === null) continue
    const dashIndent = listHit === null ? null : listHit[1].length
    const keyIndent = listHit === null ? plainHit[1].length : dashIndent + 2
    if (keyIndent <= 4) continue
    const value = parseScalar(hit[2])
    if (!String(value).includes(PACKAGE_NEEDLE)) continue
    let blockEnd = i + 1
    while (blockEnd < lines.length) {
      if (isBlank(lines[blockEnd]) || isComment(lines[blockEnd])) {
        blockEnd += 1
        continue
      }
      if (indentOf(lines[blockEnd]) <= (dashIndent ?? keyIndent)) break
      blockEnd += 1
    }
    const disabled = disabledOf(lines, i, blockEnd, keyIndent)
    let parent = null
    for (let j = i - 1; j >= 0; j -= 1) {
      const id = /^(\s*)- id:\s*(\S+)\s*(?:#.*)?$/.exec(lines[j])
      if (id !== null && id[1].length < (dashIndent ?? keyIndent)) {
        parent = id[2]
        break
      }
    }
    seenLines.add(i)
    rows.push({
      placement: 'nested',
      line: i + 1,
      indent: keyIndent,
      parent,
      id: null,
      name: String(value),
      root: rootOf(lines, i, blockEnd, keyIndent),
      disabled: disabled.value,
      disabled_raw: disabled.raw,
      disabled_conditional: disabled.conditional === true,
    })
  }

  const insertRows = rows.filter((row) => row.placement === 'insert')
  const mount = insertRows[0] ?? rows[0] ?? null
  const markers = markerReading(text)
  return {
    present: rows.length > 0,
    rows,
    mount,
    nested: rows.filter((row) => row.placement !== 'insert'),
    duplicates: rows.length,
    markers,
  }
}

/** 边界标记的读数（只认整行；正文里提到标记不算）。 */
export function markerReading(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const begins = []
  const ends = []
  lines.forEach((line, index) => {
    if (line === MOUNT_MARKERS.begin) begins.push(index + 1)
    if (line === MOUNT_MARKERS.end) ends.push(index + 1)
  })
  return {
    block: begins.length === 1 && ends.length === 1,
    begin_lines: begins,
    end_lines: ends,
    begin_inside_body: begins.length > 0 && !(begins.length === 1 && ends.length === 1),
    end_inside_body: ends.length > 0 && !(begins.length === 1 && ends.length === 1),
  }
}

/**
 * 实际那一行 vs `dashboardMountRow()` 的逐格对照。
 * @returns {{ok: boolean, checks: object, expected: object, actual: object|null}}
 */
export function compareDashboardMount(mount, { root = 'E:/Harness' } = {}) {
  const expected = dashboardMountRow({ root })
  if (mount === null || mount === undefined) {
    return { ok: false, checks: { present: false }, expected, actual: null }
  }
  const checks = {
    present: true,
    top_level_insert: mount.placement === 'insert',
    enabled: mount.disabled !== true,
    name: mount.name === expected.name,
    root: mount.root === expected.config.root,
    no_id: mount.id === null,
  }
  return {
    ok: checks.present && checks.top_level_insert && checks.enabled && checks.name && checks.root && checks.no_id,
    checks,
    expected,
    actual: { placement: mount.placement, line: mount.line, name: mount.name, root: mount.root, disabled: mount.disabled, id: mount.id, parent: mount.parent },
  }
}

// ── 撤：只切掉自己写进去的那一段 ─────────────────────────────────────────────
/**
 * 把 `--apply` 追加的那一段（`\n` + 块）切掉，**逐字节回到 apply 之前**。
 *
 * 只认**整行**标记（`line === marker`）：正文里提到标记不会误伤；标记恰好各一次，
 * 否则拒绝（不是猜一个切点）。切点：块前那一个换行（apply 加的）+ 块尾那一行换行。
 * 块后面若被别的东西追加过，只删自己的字节，后面的内容原样留下。
 *
 * @returns {{removed: boolean, text: string, begin_line?: number, end_line?: number, removed_bytes?: number, error?: string}}
 */
export function stripDashboardMount(text) {
  const source = String(text)
  const rawLines = source.split('\n')
  const lines = rawLines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
  const begins = []
  const ends = []
  lines.forEach((line, index) => {
    if (line === MOUNT_MARKERS.begin) begins.push(index)
    if (line === MOUNT_MARKERS.end) ends.push(index)
  })
  if (begins.length === 0 && ends.length === 0) return { removed: false, text: source }
  if (begins.length !== 1 || ends.length !== 1) {
    return {
      removed: false,
      text: source,
      error: `边界标记不是恰好各一行（BEGIN ${begins.length} 处 · END ${ends.length} 处）—— 文件被动过，拒绝盲改`,
    }
  }
  const b = begins[0]
  const e = ends[0]
  if (b >= e) return { removed: false, text: source, error: `END 在 BEGIN 之前（BEGIN 第 ${b + 1} 行 · END 第 ${e + 1} 行）—— 拒绝盲改` }

  // 字符偏移：按原文的 `\n` 切（行内可能带 `\r`），切点落在行边界上，CRLF 不会留下孤儿 `\r`。
  const starts = []
  let offset = 0
  for (const line of rawLines) {
    starts.push(offset)
    offset += line.length + 1
  }
  const beginStart = starts[b]
  const endStart = starts[e]
  const endLineEnd = endStart + rawLines[e].length
  // apply 写的是 `'\n' + block`；BEGIN 前那一个 `\n` 是我们加的（原文件没有它）。
  const cutStart = beginStart > 0 && source[beginStart - 1] === '\n' ? beginStart - 1 : beginStart
  // 块尾那个换行也是我们加的（block 以 `\n` 收尾）；END 后若有内容，只删这一个换行。
  const cutEnd = source[endLineEnd] === '\n' ? endLineEnd + 1 : endLineEnd
  const next = source.slice(0, cutStart) + source.slice(cutEnd)
  return {
    removed: true,
    text: next,
    begin_line: b + 1,
    end_line: e + 1,
    removed_bytes: Buffer.byteLength(source, 'utf8') - Buffer.byteLength(next, 'utf8'),
  }
}

/** 文本里还有没有指向看板包的 `name:` 行（注释不算）。 */
export function remainingDashboardReferences(text) {
  return readDashboardMount(text).rows
}

// ── 包侧事实（BOOT-02 要的三格：name / dsh.client / exports["./client"]）──────
/**
 * 看板包自己声明了什么。宿主侧的事实都在这里，`--check` 与判据读同一把。
 *
 * @param {string} root 工作区根
 * @returns {object} `name` / `version` / `dsh_client` / `exports_client` / `client_path` /
 *   `client_exists` / `client_bytes` / `client_sha256` / `entry_path` / `entry_exists` / `problems`
 */
export function dashboardPackageFacts(root = 'E:/Harness') {
  const dir = dashboardPackageDir(root)
  const manifestFile = path.join(dir, 'package.json')
  const entryPath = dashboardEntryPath(root)
  const out = {
    dir,
    manifest: manifestFile,
    exists: existsSync(manifestFile),
    entry_path: entryPath,
    entry_exists: existsSync(entryPath),
    problems: [],
  }
  if (!out.exists) {
    out.problems.push(`包的 package.json 不在：${manifestFile}`)
    return out
  }
  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(manifestFile, 'utf8'))
  } catch (err) {
    out.problems.push(`package.json 解析失败：${String(err?.message ?? err).slice(0, 160)}`)
    return out
  }
  const exportsRaw = pkg?.exports?.['./client']
  const exportsClient = typeof exportsRaw === 'string' ? exportsRaw : exportsRaw?.default ?? null
  const dshClient = pkg?.dsh?.client ?? null
  const clientPath = exportsClient === null ? null : path.resolve(dir, exportsClient)
  out.name = typeof pkg.name === 'string' ? pkg.name : null
  out.version = pkg.version ?? null
  out.dsh_client = dshClient
  out.platform = dshClient?.platform ?? null
  out.inject = Array.isArray(dshClient?.inject) ? dshClient.inject : null
  out.exports_client = exportsClient
  out.client_path = clientPath
  out.client_exists = clientPath !== null && existsSync(clientPath)
  out.client_bytes = out.client_exists ? statSync(clientPath).size : null
  out.client_sha256 = out.client_exists ? sha256(readFileSync(clientPath)) : null
  out.manifest_bytes = statSync(manifestFile).size
  out.manifest_sha256 = sha256(readFileSync(manifestFile))
  if (out.name === null) out.problems.push('package.json 没有 name（宿主按包名建表 ⇒ 没有 name 就没有 URL）')
  if (out.platform !== 'web') out.problems.push(`dsh.client.platform 是 ${JSON.stringify(out.platform)}，不是 "web"（浏览器不会收它）`)
  if (exportsClient === null) out.problems.push('package.json 没有 exports["./client"]（浏览器侧没有入口可加载）')
  if (!out.client_exists) out.problems.push(`client 入口不在盘上：${clientPath}`)
  if (!out.entry_exists) out.problems.push(`这一行指向的入口不在盘上：${entryPath}`)
  return out
}
