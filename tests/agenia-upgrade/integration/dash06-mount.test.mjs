/**
 * `DASH-15` —— 面板**装上了没有**（`bug-20261104-02`；组长 2026-11-04 收工前那一记 §十四，2026-11-05 第 2 关）。
 *
 * 病根一句话：**「写出来了」≠「装上了」**。看板那一行 `agenia-dashboard` 当时住在
 * `preset-agenia` 的 `plugins` 里（生成的 `presets/agenia/cordis.patch.yml:611`），而浏览器只收
 * **宿主装载层**里声明了 `dsh.client` 的包 —— 官方那个「智能体团队」就是 profile 补丁里
 * `- insert:` 下的一个**直接成员**（`ui-agent-team`，见设计抽屉的只读参考
 * `.team/design/2026-11-04/panel-ref/…/dsh-experimental-agent-team-profile/cordis.patch.yml`）。
 * ⇒ 当天盘上一切读数（`view.json` 469 B · 146/146 · 128/128）都是真的，界面上照样什么都没有：
 *    **十四条 DASH 用例没有一条读过这个补丁**，所以没有任何一条判据可能注意到它。
 *
 * 本格判的就是那一条**接线**（定形在 bug 台账 `bug-20261104-02` + 上面那段日志 §十四），四条腿：
 *
 *   ① **位置**：生成的 `presets/agenia/cordis.patch.yml` 里必须有 `id: agenia-dashboard` 这一行，
 *      而且它必须是**顶层 `- insert:` 的直接成员**（宿主装载层）—— 即 `id` **不在任何**预设入口的
 *      `plugins` 里（也不在任何组里）。两个失败码分开报，因为它们要的修法不同：
 *        · `DASH-NOT-HOST-LEVEL` —— 行还在，但住在预设层 / 组里（修复前的形态是**两份**：`preset-agenia`
 *          与 `preset-agenia-member` 各一份 —— 生成器把组合的全部顶格行搬进每一份预设；现在断言它必须住在顶层）；
 *        · `DASH-ROW-ABSENT` —— 这一行整个没了（不是"挪走了"，是"消失了"）。
 *   ② **行体**：这一行必须带 `name`（`file:///…/client-ui-dashboard/lib/index.js`）与 `config.root`，
 *      且它指到的那个包必须自己声明 `dsh.client.platform === "web"` 与 `exports["./client"]`
 *      —— 少一样，浏览器就没有东西可收：`DASH-NO-CLIENT-DECL`（一个码，三种缺法在报文里各自点名）。
 *   ③ **派生物**：生成补丁必须**等于** `.tools/make-bundle-patch.mjs` 从 `presets/agenia/agent.cordis.yml`
 *      造出来的那一份 ⇒ 不是手改的。**不另写一套比较逻辑**：跑仓库自己的生成器检查
 *      （`make-bundle-patch.mjs --check`，它逐字节比 `TARGET` 与 `build()` 的产物），读它的退出码与
 *      它自己那两句话（`ok` / `RED`）：`DASH-PATCH-NOT-DERIVED`。
 *      ⚠️ 跑它之前有一道**安全联锁**：只有当场证明 `--check` 分支**位于** `writeFileSync(TARGET…)`
 *      之前才跑（否则拒绝运行并记 `DASH-PATCH-CHECK-UNAVAILABLE` 的 `HOLD`）—— 一份被改成不带
 *      `--check` 的生成器会在加载期**直接写活体补丁**，那是这一格绝对不能碰的东西。
 *      跑完再量一次活体补丁的 sha256：变了 ⇒ `DASH-PATCH-CHECK-WROTE-PRESET`（红，且点名）。
 *   ④ **翻面**：这一格缺的就是"能不能翻面"，所以判据体内自带阳性对照 + 四把刀（全在运行根里合成，
 *      活树一个字节不动）：正确形状 ⇒ 干净；把那一行放回 `preset-agenia.plugins` ⇒ **只有** `DASH-NOT-HOST-LEVEL`；
 *      包去掉 `dsh.client` ⇒ **只有** `DASH-NO-CLIENT-DECL`；整行拿掉 ⇒ **只有** `DASH-ROW-ABSENT`；
 *      派生物那一腿在**生成器与预设树的副本**上改一个字节 ⇒ `--check` 必须翻成 `RED`。
 *      刀翻错面 ⇒ `DASH-KNIFE-VECTOR`；刀跑不出判词 ⇒ `DASH-KNIFE-UNREADABLE`（红：那是尺子坏了）。
 *
 * **不判什么**（写清边界，免得读到绿以为更多）：
 *   · 不判像素 / 界面（"点开有没有那块面板"归 GUI 清单，人点一次）；
 *   · 不判浏览器真的收到了包（那要真宿主；本格判的是**装载层里的那一行与包的声明**）；
 *   · 不判 `view.json` 的内容（`DASH-11` / `DASH-12` 管数据链）。
 *
 * 🔴 **读数绑在树上**：本格打的是**现役** `presets/agenia`（与 `PRS-*` / `RGATE-01` 同一个理由 ——
 * 浏览器收到的是装好的那一份）。dev 会并发改 `presets/**`，所以每个读数都带
 * `{repo, head, 文件 sha256/字节/mtime, snapshot_at}`，且**一次读到的字节从头用到尾**；
 * 读前 / 读后再各量一次身份，跑动中变过就记 `tree_changed_during_case`（**读数，不冒充判据**）。
 *
 * ── `DASH-16`（`R-1` · 2026-11-05 第 4 关评审的残余项）──────────────────────────
 * `DASH-15` 与三个生成期 throw 覆盖的是**标记与表不一致**。它们覆盖不到**两处都忘**：一行 `dsh.client`
 * 的插件进了组合、没写 `# @host-level`、也没进 `HOST_LEVEL_IDS` ⇒ 生成器把它当普通行拷进每一份预设
 * —— 与 `bug-20261104-02` 同形，而全套判据照样绿。
 * ⇒ `DASH-16` 判的是**语义**，不是命名：对每份预设 `plugins` 里的行，用 `name` 解析到盘上的
 * `package.json`；声明了 `dsh.client.platform: "web"` 却不在顶层 `- insert:` 里 ⇒ `DASH-CLIENT-IN-PRESET`
 * （**不读标记、不读 `HOST_LEVEL_IDS`、不认行 id**）。另一条是**阳性腿**：当前看板那一行必须是顶层
 * `insert` 的直接成员（语义集合为空 / 看板行不在宿主层 ⇒ `DASH-HOST-MISSING`），否则"整份补丁里
 * 一行客户端 UI 都没有"也会绿。刀：一个**只存在于夹具里**的合成包（`dsh.client.platform: web`）+ 合成行
 * 放进预设（无标记、无点名）⇒ **只有** `DASH-CLIENT-IN-PRESET`；同一行放进宿主 insert ⇒ 干净；
 * 看板行拿掉 ⇒ **只有** `DASH-HOST-MISSING`；看板行放回预设 ⇒ 两码（两种读法都成立）。
 * 判据本体与合成夹具在 `support/client-ui-placement.mjs`（探针可以拿同一份量活树）。
 * 解析面边界：路径形名字（`file:///…`）真解析；裸包名按盘上 `package.json` 的 `name` 匹配，
 * 解析不到的记 `unresolved` 读数（不冒充"不是客户端 UI"）。
 */
import { before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FROZEN, PATHS } from '../support/env.mjs'
import { collectRows, parseYamlSubset } from '../support/composition.mjs'
import { caseFail, caseHold, preflight, problem, runCase, runRoot, sha256File } from '../support/evidence.mjs'
import { noteSutOverride } from '../support/dashboard-surface.mjs'
import { clientUiPatchFixture, scanClientUiPlacement, syntheticClientUiPackage } from '../support/client-ui-placement.mjs'

before(() => {
  preflight()
})

// ── 落点与码（稳定、可 grep）────────────────────────────────────────────────
/** 🔴 判据打的就是这一份**生成**文件（不是 staged 靶子）。 */
const PATCH_FILE = path.join(PATHS.finalPreset, 'cordis.patch.yml')
const COMPOSITION_FILE = path.join(PATHS.finalPreset, 'agent.cordis.yml')
const GENERATOR_FILE = PATHS.generator
/** 那一行的 id —— 浏览器侧要收的正是它。 */
const ROW_ID = 'agenia-dashboard'
const CODE = {
  notHostLevel: 'DASH-NOT-HOST-LEVEL',
  rowAbsent: 'DASH-ROW-ABSENT',
  noClientDecl: 'DASH-NO-CLIENT-DECL',
  patchUnreadable: 'DASH-PATCH-UNREADABLE',
  notDerived: 'DASH-PATCH-NOT-DERIVED',
  deriveUnavailable: 'DASH-PATCH-CHECK-UNAVAILABLE',
  deriveCrash: 'DASH-PATCH-DERIVE-CRASH',
  checkWrote: 'DASH-PATCH-CHECK-WROTE-PRESET',
  knifeVector: 'DASH-KNIFE-VECTOR',
  knifeUnreadable: 'DASH-KNIFE-UNREADABLE',
  ruler: 'DASH-RULER-BROKEN',
}

// ── 身份读数（树 + 时间）────────────────────────────────────────────────────
/** 一份文件在**一个时刻**的身份（字节一次读进来，后面只认这份字节）。 */
function snapshotOf(file) {
  const at = new Date().toISOString()
  if (!existsSync(file)) return { path: file, rel: relOf(file), exists: false, bytes: null, sha256: null, mtime: null, at }
  const st = statSync(file)
  return {
    path: file,
    rel: relOf(file),
    exists: true,
    bytes: st.size,
    sha256: sha256File(file),
    mtime: new Date(st.mtimeMs).toISOString(),
    at,
  }
}

const relOf = (file) => path.relative(PATHS.repo, file).replace(/\\/g, '/')

/** 这一跑打的是哪棵树（`head` 只在有 `.git` 时量；副本里如实记 null）。 */
function treeIdentity() {
  const gitMark = path.join(PATHS.repo, '.git')
  let head = null
  if (existsSync(gitMark)) {
    const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: PATHS.repo, encoding: 'utf8' })
    head = r.status === 0 ? String(r.stdout ?? '').trim() || null : null
  }
  return { repo: PATHS.repo, head, at: new Date().toISOString() }
}

/** 报红时能指到"哪一份文件、什么字节"（读数与判据必须绑同一份字节）。 */
const whereOf = (snap) => `${snap.rel}（${snap.bytes ?? '?'} B · sha256 ${String(snap.sha256 ?? '?').slice(0, 12)}… · 量于 ${snap.at}）`

// ── ① 位置：顶层 `- insert:` 的直接成员 ─────────────────────────────────────
/**
 * 空间量法（**只认结构，不认缩进数字**）：
 *   · `host`   —— 这一行是某个顶层 `- insert:` 列表里的**直接成员**（宿主装载层装的就是这些）；
 *   · `nested` —— 行在、但它**不是**任何顶层 `insert` 的直接成员 ⇒ 它住在某一份预设的 `plugins`
 *                （或某个组）里 —— 那是**预设层**，浏览器收不到。
 * 用解析器给的 `map` **对象身份**判"是不是 insert 的直接成员"：`collectRows` 包出来的行对象是新的，
 * 底层 `Map` 是同一份 —— 按身份比，不按缩进猜（缩进是可读性问题，不是语义）。
 *
 * @returns {{warnings: string[], occurrences: object[], host: object[], nested: object[]}}
 */
function placementOf(patchText) {
  const doc = parseYamlSubset(patchText, 'dash15-patch')
  const rows = collectRows(doc.value)
  const hostMaps = new Set()
  for (const op of Array.isArray(doc.value) ? doc.value : []) {
    if (!(op instanceof Map)) continue
    const insert = op.get('insert')
    if (!Array.isArray(insert)) continue
    for (const item of insert) {
      if (item instanceof Map && typeof item.get('id') === 'string') hostMaps.add(item)
    }
  }
  const occurrences = rows.filter((r) => r.id === ROW_ID)
  return {
    warnings: doc.warnings,
    occurrences,
    host: occurrences.filter((r) => hostMaps.has(r.map)),
    nested: occurrences.filter((r) => !hostMaps.has(r.map)),
  }
}

/** `name` / `config.root`（行体里的两格；缺了就是"浏览器没有东西可收"）。 */
function rowFields(row) {
  // ⚠️ `cfg(row, key)` 读的是**行自己的 config 里的键**；行上的 `config` 字段要用 `row.config`
  //    （`collectRows` 已经把映射形态的 config 摊好）—— 写成 `cfg(row, 'config')` 会恒得 undefined。
  const config = row.config
  return {
    name: typeof row.name === 'string' ? row.name : null,
    root: config instanceof Map ? config.get('root') ?? null : null,
  }
}

/** 从入口文件往上找最近的那份 `package.json`（插件身份就在它里面）。 */
function packageOfEntry(entryFile) {
  let dir = path.dirname(entryFile)
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'package.json')
    if (existsSync(candidate)) {
      try {
        return { dir, file: candidate, value: JSON.parse(readFileSync(candidate, 'utf8')), error: null }
      } catch (err) {
        return { dir, file: candidate, value: null, error: String(err?.message ?? err) }
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return { dir: null, file: null, value: null, error: '找不到 package.json' }
}

const NAME_SHAPE = /^file:\/\/\/.+\/client-ui-dashboard\/lib\/index\.js$/

/**
 * 判据本体（纯函数，可喂夹具）：位置 + 行体 + 包声明。
 *
 * @param {{patchText: string, label?: string}} input
 * @returns {{problems: Array<{code:string,message:string}>, reading: object}}
 */
function mountProblems({ patchText, label = '生成补丁' }) {
  const problems = []
  const place = placementOf(patchText)
  const reading = {
    label,
    warnings: place.warnings,
    occurrences: place.occurrences.length,
    host_level: place.host.length,
    nested_in: place.nested.map((r) => r.parent),
    fields: null,
    package: null,
  }
  if (place.warnings.length > 0) {
    problems.push(problem(CODE.patchUnreadable, `${label} 有解析器读不懂的行（${place.warnings.slice(0, 4).join(' / ')}）—— 这一份的形状判不了（缺 ≠ 坏：这不是"行不在"）`))
    return { problems, reading }
  }
  if (place.occurrences.length === 0) {
    problems.push(problem(CODE.rowAbsent, `${label} 里整个没有 \`id: ${ROW_ID}\` 这一行 —— 面板这一版连"写出来"都没有；浏览器不可能收到它`))
    return { problems, reading }
  }
  if (place.nested.length > 0 || place.host.length === 0) {
    const parents = place.nested.map((r) => r.parent ?? '?')
    problems.push(problem(CODE.notHostLevel,
      `${label} 里 \`${ROW_ID}\` 出现 ${place.occurrences.length} 次，但**不是**顶层 \`- insert:\` 的直接成员`
      + `（宿主装载层）${parents.length > 0 ? `：它住在 ${parents.map((p) => `${p}.plugins`).join(' 与 ')} 里` : '：它不在任何顶层 insert 里'}`
      + ' —— 浏览器只收宿主装载层里声明了 `dsh.client` 的包，写在预设层等于没装（bug-20261104-02）'))
  }
  const chosen = place.host[0] ?? place.occurrences[0]
  const fields = rowFields(chosen)
  reading.fields = { name: fields.name, root: fields.root }
  if (typeof fields.name !== 'string' || !NAME_SHAPE.test(fields.name)) {
    problems.push(problem(CODE.noClientDecl, `${label} 里那一行的 name 不是看板包入口（应当是 \`file:///…/client-ui-dashboard/lib/index.js\`）：${JSON.stringify(fields.name)} —— 指不到包，浏览器没有东西可收`))
  } else {
    let pkg = null
    try {
      pkg = packageOfEntry(fileURLToPath(fields.name))
    } catch (err) {
      problems.push(problem(CODE.noClientDecl, `${label} 里那一行的 name 不是可解析的 \`file:///\` URL（${JSON.stringify(fields.name)}：${String(err?.message ?? err)}）—— 指不到包，浏览器没有东西可收`))
    }
    reading.package = pkg === null ? null : {
      file: pkg.file === null ? null : relOf(pkg.file),
      error: pkg.error,
      dsh_client_platform: pkg.value?.dsh?.client?.platform ?? null,
      exports_client: Object.prototype.hasOwnProperty.call(pkg.value?.exports ?? {}, './client'),
    }
    if (pkg !== null && pkg.value === null) {
      problems.push(problem(CODE.noClientDecl, `${label} 里那一行指向的包读不出来（${pkg.file ?? '找不到 package.json'}：${pkg.error}）—— 包没声明 dsh.client 就等于浏览器没有东西可收`))
    } else if (pkg !== null) {
      if (pkg.value?.dsh?.client?.platform !== 'web') {
        problems.push(problem(CODE.noClientDecl, `${label} 里那一行指向的包（${relOf(pkg.file)}）没有声明 \`dsh.client.platform: web\`（实得 ${JSON.stringify(pkg.value?.dsh?.client?.platform ?? null)}）—— 浏览器不会收它`))
      }
      if (!Object.prototype.hasOwnProperty.call(pkg.value?.exports ?? {}, './client')) {
        problems.push(problem(CODE.noClientDecl, `${label} 里那一行指向的包（${relOf(pkg.file)}）没有声明 \`exports["./client"]\`（实得 ${JSON.stringify(pkg.value?.exports ?? null)}）—— 浏览器侧没有入口可加载`))
      }
    }
  }
  if (typeof fields.root !== 'string' || fields.root.trim() === '') {
    problems.push(problem(CODE.noClientDecl, `${label} 里那一行的 \`config.root\` 缺失或不是字符串（实得 ${JSON.stringify(fields.root)}）—— 插件拿它当内容根，缺了面板读不到数据`))
  }
  return { problems, reading }
}

// ── 夹具（只住运行根；形状照官方 profile 补丁 + 我们生成补丁的现有形状）──────
const fixtureDir = (name) => {
  const dir = path.join(runRoot(), 'fixtures', `dash15-${name}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 一行 `agenia-dashboard`（`indent` 是 `- id:` 的缩进；缩进只为了让夹具像真文件，判据不读它）。 */
function rowLines({ indent, name, root }) {
  const pad = ' '.repeat(indent)
  return [
    `${pad}- id: ${ROW_ID}`,
    `${pad}  name: '${name}'`,
    `${pad}  config:`,
    `${pad}    root: '${root}'`,
  ]
}

/**
 * 合成补丁：`host` = 行在顶层 insert（正确形状）· `nested` = 行在 `preset-agenia.plugins`（刀 A）·
 * `absent` = 整行没有（刀 C）。其余结构与真补丁同形（`- insert:` + 一份预设入口 + 一条 plugins 行）。
 */
function patchFixture({ placement, name, root }) {
  const lines = [
    '# DASH-15 合成补丁（判据自证 / 刀）—— 只住运行根，不是被测对象',
    '- insert:',
  ]
  if (placement === 'host') lines.push(...rowLines({ indent: 4, name, root }))
  lines.push(
    '    - id: preset-agenia # 行名按约定写 preset-<预设 id>',
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    '        id: agenia',
    "        name: 'Agenia 模式'",
    "        description: '合成夹具（只住运行根）'",
    '        order: 10',
    '        plugins:',
    '          - id: persona',
    "            name: '@deepseek-ai/dsh-persona'",
  )
  if (placement === 'nested') lines.push(...rowLines({ indent: 10, name, root }))
  return `${lines.join('\n')}\n`
}

/** 行体两格：优先读真补丁里那一行（真字节），没有就用冻结安装落点推一个等价名字。 */
function rowFieldsForFixture(patchText) {
  const place = placementOf(patchText)
  const row = place.host[0] ?? place.occurrences[0]
  if (row !== undefined) {
    const fields = rowFields(row)
    if (typeof fields.name === 'string' && typeof fields.root === 'string') return fields
  }
  const presetDir = FROZEN.patchTargets.injectorDir.replace(/\/+$/, '')
  return {
    name: `file:///${presetDir}/client-ui-dashboard/lib/index.js`,
    root: path.resolve(presetDir, '..', '..').replace(/\\/g, '/'),
  }
}

/** 一个 `- id: …` 的**行块**（含所有缩进更深的行；与 `composition.mjs::rowBlocks` 同一个切法）。 */
function blocksOfId(text, id) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\s*)- id:\s*([^\s#]+)(?:\s+#.*)?\s*$/.exec(lines[i])
    if (m === null || m[2] !== id) continue
    const indent = m[1].length
    let end = i + 1
    while (end < lines.length) {
      if (lines[end].trim() === '') { end += 1; continue }
      if (lines[end].length - lines[end].trimStart().length <= indent) break
      end += 1
    }
    while (end > i + 1 && lines[end - 1].trim() === '') end -= 1
    blocks.push({ start: i, end, indent, lines: lines.slice(i, end) })
    i = end - 1
  }
  return { lines, blocks }
}

/**
 * **把真补丁改成"正确形状"**（阳性对照，不改盘）：把住在预设层（`indent > 4`）里的那一行整块
 * 摘掉，再按官方 profile 补丁的形状（`- insert:` 的直接成员，`indent 4`）插回去。
 * 已经是正确形状 ⇒ **原样返回**（修好之后这一格是恒等变换，仍然要求判据干净）。
 * ⚠️ 这是**夹具**：`indent 4` 只是照着真文件/官方参考写"插到哪"，判据本身只认结构（见 `placementOf`）。
 */
function correctedRealText(patchText) {
  const { lines, blocks } = blocksOfId(patchText, ROW_ID)
  const nested = blocks.filter((b) => b.indent > 4)
  if (blocks.length === 0 || nested.length === 0) return { text: patchText, moved: 0 }
  const host = nested[0].lines
    .map((line) => {
      if (line.trim() === '') return ''
      // 只剥掉**块首那一段缩进**，保留块内部的相对缩进（name / config / root 的层次）。
      return `${' '.repeat(4)}${line.slice(nested[0].indent)}`
    })
  const out = [...lines]
  for (const block of [...nested].sort((a, b) => b.start - a.start)) {
    out.splice(block.start, block.end - block.start)
  }
  const insertAt = out.findIndex((line) => /^- insert:\s*$/.test(line))
  if (insertAt < 0) return { text: patchText, moved: 0 }
  out.splice(insertAt + 1, 0, ...host)
  return { text: `${out.join('\n')}\n`, moved: nested.length }
}

/** 一个"包不声明 dsh.client"的夹具包（刀 B）—— 目录名保持 `client-ui-dashboard`，好让 name 形状仍成立。 */
function packageWithoutClientDecl() {
  const dir = fixtureDir('no-client-decl')
  const pkgDir = path.join(dir, 'client-ui-dashboard')
  mkdirSync(path.join(pkgDir, 'lib'), { recursive: true })
  const real = JSON.parse(readFileSync(path.join(PATHS.finalPreset, 'client-ui-dashboard', 'package.json'), 'utf8'))
  const { dsh, ...rest } = real
  const { client, ...dshRest } = dsh ?? {}
  writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify({ ...rest, dsh: dshRest }, null, 2)}\n`, 'utf8')
  writeFileSync(path.join(pkgDir, 'lib', 'index.js'), '// fixture: 这个包没有 dsh.client\n', 'utf8')
  return { dir: pkgDir, name: `file:///${pkgDir.replace(/\\/g, '/')}/lib/index.js` }
}

// ── ③ 派生物：跑仓库自己的生成器检查（不 import：它加载期会写活体）────────────
/**
 * 安全联锁：`--check` 分支必须**在**写盘那一行**之前**。
 * 为什么要有它：`.tools/make-bundle-patch.mjs` 加载期就跑 `build()`；不带 `--check` 时它会
 * `writeFileSync(TARGET)` —— import 一次 / 跑一次错的参数 = **改活体**（派工单明令禁止，`A11`）。
 * 所以只有当场读到"`--check` → `isCheck` → 先于写盘"这三件事才跑；读不到就 **HOLD**、不跑。
 */
function checkBranchSafe(generatorText) {
  const checkArg = generatorText.indexOf('--check')
  const isCheck = generatorText.indexOf('isCheck')
  // `writeFileSync(TARGET…)` 的写法可能被重排（换行 / 别名）⇒ 找第一个**参数里带 TARGET** 的写盘点。
  let write = -1
  const re = /writeFileSync\s*\(/g
  let m
  while ((m = re.exec(generatorText)) !== null) {
    if (generatorText.slice(m.index, m.index + 240).includes('TARGET')) { write = m.index; break }
  }
  return {
    check_arg: checkArg,
    is_check: isCheck,
    write,
    safe: checkArg >= 0 && isCheck >= 0 && write >= 0 && isCheck < write,
  }
}

/** 跑一次生成器检查（只读；`--check` 分支在写盘之前已被联锁证明）。 */
function runGeneratorCheck(generatorFile, cwd) {
  const startedAt = new Date().toISOString()
  const r = spawnSync(process.execPath, [generatorFile, '--check'], {
    cwd,
    env: { ...process.env, TEMP: path.join(runRoot(), 'tmp'), TMP: path.join(runRoot(), 'tmp') },
    encoding: 'utf8',
  })
  const stdout = String(r.stdout ?? '')
  const stderr = String(r.stderr ?? '')
  /**
   * 判词读法（**退出码是主信号，字只是旁证**）：
   *   · `exit 0` ⇒ 生成器说"一致"；
   *   · `exit 1` **且 stderr 为空** ⇒ 生成器说"对不上"（它自己 `--check` 那一支的约定）；
   *   · 其余（含 `exit 1` 带栈 / 被信号杀）⇒ **没给出判词**，那是另一件事（崩 ≠ 不一致）。
   *   `contradiction` 抓"退出码说绿、报文说 RED"这种自相矛盾（两个信号打架时不替它选）。
   */
  const derived = r.status === 0
  const notDerived = r.status === 1 && stderr.trim() === '' && /\bRED\b/.test(stdout)
  const contradiction = derived && /\bRED\b/.test(stdout)
  return {
    generator: generatorFile,
    cwd,
    exit: r.status,
    signal: r.signal ?? null,
    stdout: stdout.trim().slice(0, 2000),
    stderr: stderr.trim().slice(0, 2000),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    derived: derived && !contradiction,
    not_derived: notDerived,
    crashed: !derived && !notDerived,
    contradiction,
    word_ok: /\bok\b/.test(stdout),
  }
}

/** 递归拷一棵树（跳过数据段 / 依赖 / VCS；只往运行根写）。 */
function copyTree(src, dst, skip = new Set(['.runtime', 'node_modules', '.git'])) {
  mkdirSync(dst, { recursive: true })
  let files = 0
  for (const name of readdirSync(src).sort()) {
    if (skip.has(name)) continue
    const full = path.join(src, name)
    const st = statSync(full)
    const target = path.join(dst, name)
    if (st.isDirectory()) files += copyTree(full, target, skip)
    else if (st.isFile()) {
      writeFileSync(target, readFileSync(full))
      files += 1
    }
  }
  return files
}

/**
 * 造一份"生成器 + 预设树"的副本夹具，供**这一格的刀**用（活树一个字节不动）。
 * 为什么拷整棵树（而不是三份文件）：修好之后的生成器可能去看包声明 / 别的输入 ——
 * 副本的保真度越高，刀量的越真是"`--check` 会不会翻面"，不是"夹具缺没缺输入"。
 */
function deriveFixture() {
  const dir = fixtureDir('derive')
  const copied = copyTree(PATHS.finalPreset, path.join(dir, 'presets', 'agenia'))
  mkdirSync(path.join(dir, '.tools'), { recursive: true })
  const generator = path.join(dir, '.tools', 'make-bundle-patch.mjs')
  writeFileSync(generator, readFileSync(GENERATOR_FILE))
  return { dir, generator, copied, target: path.join(dir, 'presets', 'agenia', 'cordis.patch.yml') }
}

/** 在副本补丁上改**一个值行**（手改形态）；找不到就看板那一行；都没有就追加一行注释。 */
function mutateCopyPatch(file) {
  const text = readFileSync(file, 'utf8')
  const rowAt = text.indexOf(`- id: ${ROW_ID}`)
  let mutated = null
  let how = null
  if (rowAt >= 0) {
    const rootAt = text.indexOf('root:', rowAt)
    if (rootAt >= 0) {
      const lineEnd = text.indexOf('\n', rootAt)
      const line = text.slice(rootAt, lineEnd < 0 ? text.length : lineEnd)
      mutated = text.slice(0, rootAt) + line.replace(/'([^']*)'/, "'$1/'") + text.slice(lineEnd < 0 ? text.length : lineEnd)
      how = '把看板那一行的 config.root 加了一个斜杠（手改一个值）'
    }
  }
  if (mutated === null || mutated === text) {
    mutated = `${text}\n# knife: 手改的一行注释\n`
    how = '在补丁末尾追加一行注释（手改一个字节）'
  }
  writeFileSync(file, mutated, 'utf8')
  return { how, bytes_delta: Buffer.byteLength(mutated, 'utf8') - Buffer.byteLength(text, 'utf8') }
}

// ── 用例 ────────────────────────────────────────────────────────────────────
test('DASH-15 面板装上了没有：宿主层顶层 insert 的 agenia-dashboard + dsh.client 声明 + 派生自 agent.cordis.yml（放回预设层必须红）', async () => {
  await runCase('DASH-15', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    rec.readings.tree = treeIdentity()

    // ── 一次读字节，从头用到尾（读数与判据绑同一份字节）────────────────────
    const patchSnap = snapshotOf(PATCH_FILE)
    const compositionSnap = snapshotOf(COMPOSITION_FILE)
    const generatorSnap = snapshotOf(GENERATOR_FILE)
    rec.readings.files = { patch: patchSnap, composition: compositionSnap, generator: generatorSnap }

    let patchText = null
    if (!patchSnap.exists) {
      problems.push(problem(CODE.patchUnreadable, `生成补丁不在盘上：${whereOf(patchSnap)} —— 行在不在、装没装上都判不了（缺 ≠ 坏 ≠ 空）`))
    } else {
      try {
        patchText = readFileSync(PATCH_FILE, 'utf8')
      } catch (err) {
        problems.push(problem(CODE.patchUnreadable, `生成补丁读不出来：${whereOf(patchSnap)}（${String(err?.message ?? err)}）`))
      }
    }

    // ── ② 位置 + 行体 + 包声明（真补丁）──────────────────────────────────
    if (patchText !== null) {
      const real = mountProblems({ patchText, label: '生成补丁' })
      rec.readings.mount = real.reading
      for (const p of real.problems) problems.push(p)

      // ── ④ 翻面：阳性对照 + 三把刀（位置 / 包声明 / 整行；派生那把刀在 ③ 里）──────────
      const fields = rowFieldsForFixture(patchText)
      rec.readings.fixture_fields = fields
      try {
        const fixtures = {
          control: mountProblems({ patchText: patchFixture({ placement: 'host', ...fields }), label: '夹具·正确形状' }),
          moved: mountProblems({ patchText: patchFixture({ placement: 'nested', ...fields }), label: '夹具·放回预设层' }),
          absent: mountProblems({ patchText: patchFixture({ placement: 'absent', ...fields }), label: '夹具·整行拿掉' }),
        }
        const noDeclPkg = packageWithoutClientDecl()
        fixtures.noDecl = mountProblems({ patchText: patchFixture({ placement: 'host', ...fields, name: noDeclPkg.name }), label: '夹具·包没有 dsh.client' })
        // 阳性对照（真字节）：只把那一行**挪到**宿主层，行体一个字不改 ⇒ 判据必须干净。
        // 今天这一格是"修好之后应该长什么样"的机器证据；修好之后它是恒等变换，仍然要求干净。
        const corrected = correctedRealText(patchText)
        fixtures.realCorrected = mountProblems({ patchText: corrected.text, label: '真补丁·只挪位置' })
        fixtures.realCorrected.moved_blocks = corrected.moved
        rec.readings.fixtures = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), reading: v.reading, moved_blocks: v.moved_blocks ?? null }]))

        const codesOf = (name) => fixtures[name].problems.map((p) => p.code)
        const onlyOne = (name, code) => JSON.stringify(codesOf(name)) === JSON.stringify([code])

        if (codesOf('control').length !== 0) {
          problems.push(problem(CODE.ruler, `合成的"正确形状"（行在顶层 insert、包声明齐全）被判出 ${JSON.stringify(codesOf('control'))} —— 判据连正确形状都过不了：先修尺子`))
        }
        if (codesOf('realCorrected').length !== 0) {
          problems.push(problem(CODE.ruler, `真补丁只把那 ${corrected.moved} 处行块挪到顶层 insert（行体不动）就被判出 ${JSON.stringify(codesOf('realCorrected'))} —— 修好之后也过不了：先修尺子`))
        }
        if (!onlyOne('moved', CODE.notHostLevel)) {
          problems.push(problem(CODE.knifeVector, `刀 A（把看板那一行放回 preset-agenia.plugins）翻出来的面是 ${JSON.stringify(codesOf('moved'))}，应当只有 ${JSON.stringify([CODE.notHostLevel])}`))
        }
        if (!onlyOne('absent', CODE.rowAbsent)) {
          problems.push(problem(CODE.knifeVector, `刀 C（整行拿掉）翻出来的面是 ${JSON.stringify(codesOf('absent'))}，应当只有 ${JSON.stringify([CODE.rowAbsent])}`))
        }
        if (!onlyOne('noDecl', CODE.noClientDecl)) {
          problems.push(problem(CODE.knifeVector, `刀 B（包去掉 dsh.client）翻出来的面是 ${JSON.stringify(codesOf('noDecl'))}，应当只有 ${JSON.stringify([CODE.noClientDecl])}`))
        }
      } catch (err) {
        problems.push(problem(CODE.ruler, `合成夹具造不出来：${String(err?.message ?? err)} —— 这一跑的翻面证据不成立`))
      }
    }

    // ── ③ 派生物（跑仓库自己的 `--check`）──────────────────────────────────
    let derivationVerdict = null
    if (!generatorSnap.exists) {
      caseHold(rec, CODE.deriveUnavailable, `生成器不在盘上（${whereOf(generatorSnap)}）—— "补丁是派生物"这一格判不了；它缺失本身由体检管`)
    } else if (!compositionSnap.exists) {
      caseHold(rec, CODE.deriveUnavailable, `组合本体不在盘上（${whereOf(compositionSnap)}）—— 没有源就没有"派生物"可判`)
    } else {
      let interlock = null
      try {
        interlock = checkBranchSafe(readFileSync(GENERATOR_FILE, 'utf8'))
      } catch (err) {
        interlock = { check_arg: -1, is_check: -1, write: -1, safe: false, read_error: String(err?.message ?? err) }
      }
      rec.readings.derivation = { interlock, snapshots: { generator: generatorSnap, composition: compositionSnap, patch: patchSnap } }
      if (!interlock.safe) {
        caseHold(rec, CODE.deriveUnavailable,
          `生成器的 \`--check\` 分支没有落在写盘之前（--check@${interlock.check_arg} · isCheck@${interlock.is_check} · writeFileSync(…TARGET…)@${interlock.write}${interlock.read_error ? ` · 读不出来：${interlock.read_error}` : ''}）`
          + ' —— 不敢跑（它加载期就写活体），这一格判不了；这是安全联锁，不是判据放宽')
      } else {
        const liveCheck = runGeneratorCheck(GENERATOR_FILE, PATHS.repo)
        derivationVerdict = liveCheck
        rec.readings.derivation.live = liveCheck
        if (liveCheck.derived) {
          // 期望态：补丁 = 生成器从 agent.cordis.yml 造出来的那一份。
        } else if (liveCheck.not_derived) {
          problems.push(problem(CODE.notDerived,
            `生成补丁与生成器从 \`${compositionSnap.rel}\` 造出来的那一份**不一致**（\`make-bundle-patch.mjs --check\` exit ${liveCheck.exit}）`
            + `：${liveCheck.stdout.split('\n')[0]} —— 补丁是派生物，改了 .yml 就跑生成器，别手改（${whereOf(patchSnap)}）`))
        } else {
          problems.push(problem(CODE.deriveCrash,
            `生成器检查没给出判词（exit ${String(liveCheck.exit)}${liveCheck.signal ? ` · signal ${liveCheck.signal}` : ''}${liveCheck.contradiction ? ' · 退出码说绿、报文里却有 RED' : ''}）：`
            + `stdout=${JSON.stringify(liveCheck.stdout.slice(0, 400))} stderr=${JSON.stringify(liveCheck.stderr.slice(0, 400))} —— 判不了不是绿`))
        }
        // 跑完再量一次：这一格绝对不能写活体（写了就是最坏的那件事）。
        const after = snapshotOf(PATCH_FILE)
        rec.readings.derivation.patch_after = after
        if (after.sha256 !== patchSnap.sha256) {
          problems.push(problem(CODE.checkWrote,
            `生成器检查跑完之后活体补丁变了：${patchSnap.bytes} B/${String(patchSnap.sha256).slice(0, 12)}… → ${after.bytes} B/${String(after.sha256).slice(0, 12)}…`
            + ' —— 这个用例只许只读；先查生成器的 `--check` 分支（安全联锁没拦住）'))
        }

        // 刀 D：在**副本**上改一个值行 ⇒ `--check` 必须翻成 RED（判据得翻得动面）。
        try {
          const fix = deriveFixture()
          const silent = runGeneratorCheck(fix.generator, fix.dir)
          const mutation = mutateCopyPatch(fix.target)
          const flipped = runGeneratorCheck(fix.generator, fix.dir)
          rec.readings.derivation.knife = { fixture: fix.dir, copied_files: fix.copied, silent, mutation, flipped }
          if (liveCheck.derived) {
            if (!silent.derived) {
              problems.push(problem(CODE.knifeUnreadable,
                `副本（未改）就跑不出"一致"（exit ${String(silent.exit)} · word_ok=${silent.word_ok}：${JSON.stringify(silent.stdout.slice(0, 200))}）`
                + ' —— 这一把刀量不了；生成器可能把"自己所在的位置"写进了产物，或者副本缺输入'))
            } else if (!flipped.not_derived) {
              problems.push(problem(CODE.knifeUnreadable,
                `刀 D（${mutation.how}）没有让 \`--check\` 翻成 RED（exit ${String(flipped.exit)} · stdout=${JSON.stringify(flipped.stdout.slice(0, 200))}`
                + ` · stderr=${JSON.stringify(flipped.stderr.slice(0, 200))}）—— 死判据：手改补丁也照绿`))
            }
          } else {
            caseHold(rec, CODE.knifeUnreadable, '这一跑的补丁本来就不是派生物（真补丁已经红了）⇒ 刀 D 分不清"手改"与"还没重跑生成器"，不拿它当证据')
          }
        } catch (err) {
          problems.push(problem(CODE.knifeUnreadable, `派生刀跑不起来：${String(err?.message ?? err)}`))
        }
      }
    }

    // ── 读数收口：跑动中活树有没有被人动过（读数，不冒充判据）──────────────
    const afterAll = {
      patch: snapshotOf(PATCH_FILE),
      composition: snapshotOf(COMPOSITION_FILE),
      generator: snapshotOf(GENERATOR_FILE),
    }
    rec.readings.after = afterAll
    rec.readings.tree_changed_during_case = {
      patch: afterAll.patch.sha256 !== patchSnap.sha256,
      composition: afterAll.composition.sha256 !== compositionSnap.sha256,
      generator: afterAll.generator.sha256 !== generatorSnap.sha256,
    }
    rec.readings.verdict = {
      mount: patchText === null ? null : placementOf(patchText).nested.map((r) => r.parent),
      derived: derivationVerdict === null ? null : derivationVerdict.derived,
      problem_codes: problems.map((p) => p.code),
    }

    caseFail(problems)
  })
})

// ── DASH-16（第 4 关评审 2026-11-05 的 R-1）：语义面 ───────────────────────────
const DASH16 = {
  clientInPreset: 'DASH-CLIENT-IN-PRESET',
  hostMissing: 'DASH-HOST-MISSING',
  patchUnreadable: 'DASH-PATCH-UNREADABLE',
  ruler: 'DASH-RULER-BROKEN',
  knifeVector: 'DASH-KNIFE-VECTOR',
  knifeUnreadable: 'DASH-KNIFE-UNREADABLE',
}
/** 只存在于夹具里的行 id —— 它不许出现在生产树的任何一份文件里（`knife_registration` 读数盯着）。 */
const SYNTHETIC_ROW_ID = 'future-client-ui-panel'

/** DASH-16 的夹具目录（与 DASH-15 的分开，免得两格在同一次跑里互相覆盖）。 */
const fixtureDir16 = (name) => {
  const dir = path.join(runRoot(), 'fixtures', `dash16-${name}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

test('DASH-16 客户端 UI 行必须在宿主 insert：按包清单语义扫描（不看标记/点名表）+ 阳性腿 + 未登记行的刀', async () => {
  await runCase('DASH-16', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    rec.readings.tree = treeIdentity()
    const patchSnap = snapshotOf(PATCH_FILE)
    const compositionSnap = snapshotOf(COMPOSITION_FILE)
    const generatorSnap = snapshotOf(GENERATOR_FILE)
    rec.readings.files = { patch: patchSnap, composition: compositionSnap, generator: generatorSnap }

    let patchText = null
    if (!patchSnap.exists) {
      problems.push(problem(DASH16.patchUnreadable, `生成补丁不在盘上：${whereOf(patchSnap)} —— 语义面判不了（缺 ≠ 坏 ≠ 空）`))
      caseFail(problems)
      return
    }
    try {
      patchText = readFileSync(PATCH_FILE, 'utf8')
    } catch (err) {
      problems.push(problem(DASH16.patchUnreadable, `生成补丁读不出来：${whereOf(patchSnap)}（${String(err?.message ?? err)}）`))
      caseFail(problems)
      return
    }

    // ── ① 判据本体：现役补丁的语义面 + 阳性腿 ──────────────────────────────
    const real = scanClientUiPlacement({ patchText, rowId: ROW_ID, label: '生成补丁', manifestRoots: [PATHS.finalPreset] })
    rec.readings.real = real.reading
    for (const p of real.problems) problems.push(p)

    // ── ② 翻面：合成包 + 合成补丁（只住运行根；活树一个字节不动）──────────────
    try {
      const pkgDir = fixtureDir16('client-in-preset')
      const syntheticPkg = syntheticClientUiPackage(pkgDir)
      const fields = rowFieldsForFixture(patchText)
      const dashboardRow = { id: ROW_ID, name: fields.name, root: fields.root }
      const syntheticRow = { id: SYNTHETIC_ROW_ID, name: syntheticPkg.name, root: path.resolve(pkgDir, '..').replace(/\\/g, '/') }
      const variants = {
        control: { dashboard: 'host', synthetic: 'absent', label: '夹具·正确形状' },
        syntheticInPreset: { dashboard: 'host', synthetic: 'preset', label: '夹具·合成行放进预设（无标记、无点名）' },
        syntheticInHost: { dashboard: 'host', synthetic: 'host', label: '夹具·同一行放进宿主 insert' },
        dashAbsent: { dashboard: 'absent', synthetic: 'absent', label: '夹具·看板行拿掉' },
        dashInPreset: { dashboard: 'preset', synthetic: 'absent', label: '夹具·看板行放回预设' },
      }
      const scans = {}
      for (const [name, variant] of Object.entries(variants)) {
        const text = clientUiPatchFixture({ ...variant, dashboardRow, syntheticRow })
        scans[name] = {
          text,
          scan: scanClientUiPlacement({ patchText: text, rowId: ROW_ID, label: variant.label, manifestRoots: [pkgDir] }),
        }
      }
      const codesOf = (name) => scans[name].scan.problems.map((p) => p.code)
      const exactly = (name, want) => JSON.stringify([...codesOf(name)].sort()) === JSON.stringify([...want].sort())
      rec.readings.fixtures = Object.fromEntries(Object.entries(scans).map(([name, v]) => [name, {
        codes: v.scan.problems.map((p) => p.code),
        messages: v.scan.problems.map((p) => p.message),
        reading: v.scan.reading,
      }]))

      // 夹具自己必须解析得动（不然刀量的是夹具坏，不是判据坏）
      for (const [name, v] of Object.entries(scans)) {
        if (v.scan.reading.warnings.length > 0) {
          problems.push(problem(DASH16.ruler, `夹具 ${name} 有解析器读不懂的行（${v.scan.reading.warnings.slice(0, 3).join(' / ')}）—— 这一跑的翻面证据不成立`))
        }
      }
      if (codesOf('control').length !== 0) {
        problems.push(problem(DASH16.ruler, `合成的"正确形状"被判出 ${JSON.stringify(codesOf('control'))} —— 判据连正确形状都过不了：先修尺子`))
      }
      if (!exactly('syntheticInPreset', [DASH16.clientInPreset])) {
        problems.push(problem(DASH16.knifeVector,
          `刀（合成行放进预设：无 \`# @host-level\`、无点名表）翻出来的面是 ${JSON.stringify(codesOf('syntheticInPreset'))}，`
          + `应当只有 ${JSON.stringify([DASH16.clientInPreset])} —— 这一把刀必须能抓住"作者从没登记过"的行`))
      }
      if (codesOf('syntheticInHost').length !== 0) {
        problems.push(problem(DASH16.knifeVector, `同一个合成行放进宿主 insert 之后仍被判出 ${JSON.stringify(codesOf('syntheticInHost'))} —— 判据量的不是"层"，是别的东西`))
      }
      if (!exactly('dashAbsent', [DASH16.hostMissing])) {
        problems.push(problem(DASH16.knifeVector, `刀（看板行拿掉）翻出来的面是 ${JSON.stringify(codesOf('dashAbsent'))}，应当只有 ${JSON.stringify([DASH16.hostMissing])}`))
      }
      if (!exactly('dashInPreset', [DASH16.clientInPreset, DASH16.hostMissing])) {
        problems.push(problem(DASH16.knifeVector,
          `刀（看板行放回预设）翻出来的面是 ${JSON.stringify(codesOf('dashInPreset'))}，`
          + `应当恰好 ${JSON.stringify([DASH16.clientInPreset, DASH16.hostMissing])}（语义面与阳性腿各报一次，修法不同）`))
      }
      // 刀的"语义成立"自证：合成行必须靠**它自己的 package.json** 被认出来（不是靠名字像 / id 熟）
      const classified = scans.syntheticInPreset.scan.reading.client_ui_rows.find((r) => r.id === SYNTHETIC_ROW_ID)
      if (classified === undefined || classified.pkg === null || !String(classified.pkg).endsWith('client-ui-probe/package.json')) {
        problems.push(problem(DASH16.knifeUnreadable,
          `扫描器没有把合成行解析到它自己的包（实得 ${JSON.stringify(classified ?? null)}）—— 这把刀量不到"语义"那一面`))
      }

      // 证据（不是判据）：这把刀的那一行在两个生产输入里**都没有**任何登记痕迹
      const compositionText = compositionSnap.exists ? readFileSync(COMPOSITION_FILE, 'utf8') : null
      const generatorText = generatorSnap.exists ? readFileSync(GENERATOR_FILE, 'utf8') : null
      const markerLines = (scans.syntheticInPreset.text.match(/#\s*@host-level/g) ?? []).length
      const registration = {
        synthetic_row_id: SYNTHETIC_ROW_ID,
        synthetic_pkg_name: syntheticPkg.pkg_name,
        fixture_marker_lines: markerLines,
        in_real_patch: patchText.includes(SYNTHETIC_ROW_ID),
        in_composition: compositionText === null ? null : compositionText.includes(SYNTHETIC_ROW_ID),
        in_generator_text: generatorText === null ? null : generatorText.includes(SYNTHETIC_ROW_ID),
      }
      rec.readings.knife_registration = registration
      if (markerLines !== 0 || registration.in_real_patch
        || registration.in_composition === true || registration.in_generator_text === true) {
        problems.push(problem(DASH16.knifeUnreadable,
          `这把刀的夹具行不再是"谁都没登记过的行"（marker 行 ${markerLines} · 真补丁 ${registration.in_real_patch}`
          + ` · 组合 ${String(registration.in_composition)} · 生成器 ${String(registration.in_generator_text)}）—— 刀的命题不成立`))
      }
    } catch (err) {
      problems.push(problem(DASH16.ruler, `合成夹具造不出来：${String(err?.message ?? err)} —— 这一跑的翻面证据不成立`))
    }

    // ── 读数收口：跑动中活树有没有被人动过（读数，不冒充判据）──────────────
    const after = snapshotOf(PATCH_FILE)
    rec.readings.after = after
    rec.readings.tree_changed_during_case = { patch: after.sha256 !== patchSnap.sha256 }
    rec.readings.verdict = {
      semantic_client_rows: real.reading.client_ui_rows.length,
      preset_violations: real.reading.violations.length,
      problem_codes: problems.map((p) => p.code),
    }

    caseFail(problems)
  })
})
