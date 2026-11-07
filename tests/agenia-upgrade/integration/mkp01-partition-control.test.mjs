/**
 * `MKP-01` · **生成器的安全联锁：判的是控制流，不是"词的位置"**
 *
 * 票：`ticket-20261106-01` · 定形 `.team/leader/2026-11-07/定形-ticket-20261106-01.md`（batch 12）
 * 病根（定形 §一②）：`make-bundle-patch.mjs` 的 `classifyPresetRow()` 按**裸名 + 包名族 + 白名单**判，
 * 而真正该成立的行为是：**`partitionHostLevel()` 把宿主级行摘走之后，两份预设体里一个宿主级行都不剩**。
 * 今天"真组合里它到不了这里"只写在一句**注释**里（`:139-141`）—— 谁把过滤条件改坏 / 把点名表和标记一起撤掉
 * 并让白名单接管，**没有一格会红**，而界面上的症状是"面板写完了，浏览器收不到"。
 *
 * ── 判什么（对**真组合**跑真生成器，读它**吐出来的那份补丁**）──────────────────────────
 * 被测对象是 `partitionHostLevel(真组合)` 的**结果**，不是它内部的常量表：
 *   · 输入侧：`presets/agenia/agent.cordis.yml` 的**逐字节副本**（`source_is_real` 自证：sha256 = 产品那份）；
 *   · 生成器：`presets/agenia/cordis.patch.yml` 的**生产者**的逐字节副本（跑在运行根里，产品零字节）；
 *   · 输出侧：它写出来的那份补丁 —— 用**本文件自己的**解析器把"顶层 `- insert:` 的直接成员"与
 *     "两份预设体的行"分开，再按**包事实**（`name` → 最近的 `package.json` → `dsh.client.platform === 'web'`）
 *     数一遍。**不读 `HOST_LEVEL_IDS`、不读 `# @host-level`、不认行 id** —— 那三样都是"词的位置"。
 *
 * 四条腿（每一条都能单独翻面；红因码互相独立）：
 *   · `MKP-GEN-REJECTED` —— 生成器没造出补丁（退出码非 0 / 没写文件）。这是"组合过不了联锁"，
 *     与"造出来了但放错了层"是两个诊断；
 *   · `MKP-HOST-ROW-IN-PRESET` —— **两份预设体里出现了客户端 UI 行**（这就是本票要的那条断言）；
 *   · `MKP-HOST-ROW-NOT-IN-INSERT` —— 期望的宿主级行**没有恰好一次**住在顶层 insert 的直接成员里
 *     （"靠删掉那一行让上一条变绿"当场翻红 —— 0 行不算通过）；
 *   · `MKP-EMPTY-SAMPLE` / `MKP-EMPTY-BODY` —— **样本下限**：组合里必须真有客户端 UI 行、两份预设体必须
 *     真的非空；否则"预设体里 0 条宿主级行"是**空集上的真**（0 行快照 ≠ 通过）。
 * 另加 `MKP-PARSER-BROKEN`（这份补丁的结构读不懂：不是 1 个 insert / 2 份预设 —— 判不了不是绿）与
 * `MKP-PARSER-CONTROL`（**尺子自证**：把同一行塞进一份预设体，解析器必须数得出来）。
 *
 * ── 三把刀（都在**运行根里的副本**上做；产品零字节）──────────────────────────────────
 *   · `K1 drop-filter`：删掉 `partitionHostLevel()` 里宿主级分支的 `continue`（**"把它的过滤条件删掉"**，
 *     定形 §四点名的那把）⇒ 生成器当场拒（`E_BUNDLE_CLIENT_UI_IN_PRESET`）⇒ `MKP-GEN-REJECTED`；
 *   · `K2 whitelist-rollback`：**词的位置全对、行为不对**的那个世界 —— 组合里撤掉 `# @host-level` 标记、
 *     给那一行补 `disabled: true`，生成器的 `HOST_LEVEL_IDS` 清空 ⇒ 白名单三格全中、生成器**不报错**
 *     ⇒ 两份预设体里各多一条客户端 UI 行 ⇒ `MKP-HOST-ROW-IN-PRESET` + `MKP-HOST-ROW-NOT-IN-INSERT`；
 *   · `K3 row-deleted`：把那一行从组合里整块删掉 + `HOST_LEVEL_IDS` 清空 ⇒ 预设体里**确实 0 条**
 *     （上一条腿会绿！）但 insert 里也没有它 ⇒ **只有** `MKP-HOST-ROW-NOT-IN-INSERT`。
 * 每把刀**只许翻它自己那几面**（期望的码集合逐把钉死）；刀没咬住（输入没变）⇒ `MKP-KNIFE-NOT-BITING`，
 * 翻错面 ⇒ `MKP-KNIFE-VECTOR`。**刀证明的是判词，不是分类函数。**
 *
 * ── 今天为什么是绿的（说清楚，别当"首跑红"）──────────────────────────────────────────
 * 真组合今天**就是对的**（那一行走宿主级路线）⇒ 这一格今天 **RED 0**，它是**回归锁**。
 * 红的合法性来自 K1 / K2 / K3：三把刀各证明"这一格会翻面"。缺了它们，"恒绿"和"判据死了"长得一样。
 *
 * ── 自守在块外（防"把一段判据删掉，读数照旧绿"）────────────────────────────────────
 * `MKP-LEGS-INCOMPLETE`：`rec.readings.scenarios` 必须**按 id 成员**覆盖 `SCENARIO_IDS`，
 * 且每格都有 `measured:true` 与 `codes` 数组；这一段在每条腿**外面**，读的是"这一跑真的量了哪几格"。
 *
 * ── 不判什么 ────────────────────────────────────────────────────────────────────
 *   · 不判生成器内部怎么写的（导出面 / 常量名 / 注释）—— 只判它吐出来的那份补丁；
 *   · 不判 `classifyPresetRow()` 该不该留（定形 §二② 允许它降级成诊断）；
 *   · 不判别的岗位的文件（`.tools/**` 一个字节都不写；跑的是副本）。
 *
 * 证据：`<run root>/_evidence/<RUN_ID>/MKP-01/result.json`（`readings.scenarios.*.codes` 逐格可拆）。
 */
import { before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runRoot, sha256File, sha256Text } from '../support/evidence.mjs'

before(() => {
  preflight()
})

/** 产品侧的三个落点（**只读**）。 */
const GENERATOR = PATHS.generator
const COMPOSITION = PATHS.liveComposition
const PATCH = PATHS.livePatch
/** 路径形 `name` 的解析基准（与生成器同一份口径：预设目录）。 */
const PRESET_ROOT = PATHS.finalPreset

const CODE = {
  genRejected: 'MKP-GEN-REJECTED',
  hostRowInPreset: 'MKP-HOST-ROW-IN-PRESET',
  hostRowNotInInsert: 'MKP-HOST-ROW-NOT-IN-INSERT',
  emptySample: 'MKP-EMPTY-SAMPLE',
  emptyBody: 'MKP-EMPTY-BODY',
  parserBroken: 'MKP-PARSER-BROKEN',
  parserControl: 'MKP-PARSER-CONTROL',
  sourceNotReal: 'MKP-SOURCE-NOT-REAL',
  liveTouched: 'MKP-LIVE-PATCH-TOUCHED',
  fixtureBroken: 'MKP-FIXTURE-BROKEN',
  knifeNotBiting: 'MKP-KNIFE-NOT-BITING',
  knifeVector: 'MKP-KNIFE-VECTOR',
  legsIncomplete: 'MKP-LEGS-INCOMPLETE',
}

/** 这一跑量了哪几格 —— **显式清单**（自守在块外读它）。 */
const SCENARIO_IDS = ['real', 'parser-control', 'knife-drop-filter', 'knife-whitelist-rollback', 'knife-row-deleted']

// ── 组合行（真组合与刀的组合共用同一把尺子）───────────────────────────────────
/** 顶格行块（与生成器的 `splitRows` 同口径：只认行首 `- `）。 */
function splitRows(text) {
  const blocks = []
  let cur = null
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    if (/^- /.test(line)) {
      if (cur !== null) blocks.push(cur)
      cur = [line]
    } else if (cur !== null) cur.push(line)
  }
  if (cur !== null) blocks.push(cur)
  return blocks.map((block) => {
    while (block.length > 0 && block[block.length - 1].trim() === '') block.pop()
    return block.join('\n')
  })
}

/** 一行自己的三个字段（只认行自己的两格键；嵌套 `config` 里的同名键不算）。 */
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
  const scalar = (raw) => {
    if (raw === null) return null
    const v = String(raw).trim()
    if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'")
    if (v.startsWith('"') && v.endsWith('"')) { try { return JSON.parse(v) } catch { return v.slice(1, -1) } }
    return v.replace(/\s+#.*$/, '').trim()
  }
  return {
    id: scalar(id),
    name: scalar(name),
    disabled: scalar(disabled),
    host_mark_line: lines.findIndex((line) => /^ {2}#\s*@host-level\b/.test(line)),
  }
}

const PATH_LIKE = /^(file:|[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|\\\\)/
const BARE_CLIENT_UI_FAMILY = /^@deepseek-ai\/dsh-client-ui-/

/** `file:` URL → 盘上路径（只认本地盘符那种形状）。 */
function fileUrlToPath(url) {
  const raw = String(url).replace(/^file:\/\//i, '')
  const m = /^\/?([A-Za-z]:[\\/].*)$/.exec(raw)
  return m === null ? null : m[1].replace(/\//g, '\\')
}

/** 从某个文件往上找最近的 `package.json`（判不了 ⇒ `null`，**不当成 false**）。 */
function nearestPackage(file) {
  let dir = path.dirname(file)
  for (;;) {
    const manifest = path.join(dir, 'package.json')
    if (existsSync(manifest)) {
      try {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
        return { manifest, name: typeof pkg.name === 'string' ? pkg.name : null, platform: pkg?.dsh?.client?.platform ?? null, broken: false }
      } catch {
        return { manifest, name: null, platform: null, broken: true }
      }
    }
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

/**
 * 一行的 `name` 解析到哪个包。**"判不了"是一个独立的态**（`platform: null`），不是 `false`。
 * @returns {{kind:string, name:string|null, platform:string|null, manifest:string|null, file:string|null, broken:boolean}}
 */
function packageFactOf(name) {
  const raw = typeof name === 'string' ? name.trim() : ''
  if (raw === '') return { kind: 'none', name: null, platform: null, manifest: null, file: null, broken: false }
  if (BARE_CLIENT_UI_FAMILY.test(raw)) {
    return { kind: 'bare', name: raw, platform: 'web', manifest: null, file: null, broken: false }
  }
  let file = null
  if (/^file:/i.test(raw)) file = fileUrlToPath(raw)
  else if (PATH_LIKE.test(raw)) file = path.resolve(PRESET_ROOT, raw)
  if (file === null) return { kind: 'bare', name: raw, platform: null, manifest: null, file: null, broken: false }
  const found = nearestPackage(file)
  if (found === null) return { kind: 'path-no-manifest', name: null, platform: null, manifest: null, file, broken: false }
  return { kind: 'package', name: found.name, platform: found.platform, manifest: found.manifest, file, broken: found.broken }
}

/**
 * 一份组合里**该住宿主层**的行（按包事实）：`dsh.client.platform === 'web'` 的那些。
 * 这是"期望侧"—— 从**产品那份组合**算出来（不是从生成器的点名表读）。
 */
function clientUiRowsOf(compositionText) {
  const rows = []
  const unresolved = []
  for (const block of splitRows(compositionText)) {
    const facts = rowFacts(block)
    if (facts.name === null) continue
    const pkg = packageFactOf(facts.name)
    if (pkg.platform === 'web') rows.push({ id: facts.id ?? '（没有 - id:）', name: facts.name, package: pkg.name, manifest: pkg.manifest, host_mark: facts.host_mark_line === 1 })
    else if (pkg.platform === null) unresolved.push({ id: facts.id, name: facts.name, kind: pkg.kind })
  }
  return { rows, unresolved }
}

// ── 补丁（产物）解析：顶层 insert 的直接成员 / 两份预设体里的行 ────────────────────
/** 补丁里一个标量（去掉引号与行尾注释）。 */
const patchScalar = (raw) => String(raw).replace(/\s+#.*$/, '').trim().replace(/^['"]|['"]$/g, '').trim()

/**
 * 把一份 bundle 补丁切成"顶层 insert 的直接成员"与"每份预设体的行"。
 * 只认**缩进**（这一份补丁的形状：顶层 `- insert:` / 成员 4 格 / 预设体行 10 格 / 行的 `name` 12 格）。
 *
 * @returns {{inserts:number, insert_members:{type:string,id:string|null,name:string|null}[],
 *   presets:{member_id:string, preset_id:string|null, rows:{id:string|null,name:string|null}[]}[],
 *   problems:{code:string,message:string}[]}}
 */
function parsePatch(text) {
  const problems = []
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const members = []
  const presets = []
  let inserts = 0
  let inInsert = false
  let current = null
  let last = null
  const pushProblem = (message) => problems.push(problem(CODE.parserBroken, message))
  for (const line of lines) {
    if (/^- insert:\s*(?:#.*)?$/.test(line)) { inserts += 1; inInsert = true; current = null; last = null; continue }
    if (/^- /.test(line)) { inInsert = false; current = null; last = null; continue }
    if (!inInsert) continue
    const member = /^ {4}- id:\s*(.+?)\s*$/.exec(line)
    if (member !== null) {
      const id = patchScalar(member[1])
      const kind = id.startsWith('preset-') ? 'preset' : 'row'
      members.push({ type: kind, id, name: null })
      last = members[members.length - 1]
      if (kind === 'preset') {
        current = { member_id: id, preset_id: null, rows: [] }
        presets.push(current)
      } else {
        current = null
      }
      continue
    }
    const memberName = /^ {4}- name:\s*(.+?)\s*$/.exec(line)
    if (memberName !== null && last !== null && last.type === 'row') {
      last.name = patchScalar(memberName[1])
      continue
    }
    if (current !== null) {
      const presetId = /^ {8}id:\s*(.+?)\s*$/.exec(line)
      if (presetId !== null && current.preset_id === null) { current.preset_id = patchScalar(presetId[1]); continue }
      const bodyRow = /^ {10}- id:\s*(.+?)\s*$/.exec(line)
      if (bodyRow !== null) {
        current.rows.push({ id: patchScalar(bodyRow[1]), name: null })
        continue
      }
      const bodyName = /^ {12}name:\s*(.+?)\s*$/.exec(line)
      if (bodyName !== null && current.rows.length > 0 && current.rows[current.rows.length - 1].name === null) {
        current.rows[current.rows.length - 1].name = patchScalar(bodyName[1])
      }
    }
  }
  if (inserts !== 1) pushProblem(`顶层 \`- insert:\` 应当恰好 1 个，实得 ${inserts} —— 这份补丁的结构读不懂`)
  if (presets.length !== 2) pushProblem(`预设入口应当恰好 2 条（组长 + 通用组员），实得 ${presets.length}`)
  return { inserts, insert_members: members, presets, problems }
}

/** 解析结果 → 四条腿的读数（纯函数：真组合与三把刀走**同一份**判读）。 */
function judgePatch(patchText, expectedClientUi) {
  const parsed = parsePatch(patchText)
  const codes = []
  const details = []
  const add = (code, message) => { codes.push(code); details.push({ code, message }) }
  if (parsed.problems.length > 0) {
    for (const p of parsed.problems) add(p.code, p.message)
    return { parsed, codes: [...new Set(codes)], details, host_rows_in_preset: null, insert_ids: parsed.insert_members.filter((m) => m.type === 'row').map((m) => m.id) }
  }
  const insertIds = parsed.insert_members.filter((m) => m.type === 'row').map((m) => m.id)
  const insertPresetIds = parsed.insert_members.filter((m) => m.type === 'preset').map((m) => m.id)
  const hostRowsInPreset = []
  for (const preset of parsed.presets) {
    const label = preset.preset_id ?? preset.member_id
    if (preset.rows.length === 0) {
      add(CODE.emptyBody, `预设体「${label}」里一行都没有 —— "预设体里 0 条宿主级行"在空集上恒真（0 行不算通过）`)
    }
    for (const row of preset.rows) {
      const pkg = packageFactOf(row.name)
      if (pkg.platform === 'web') {
        hostRowsInPreset.push({ preset: label, id: row.id, name: row.name, package: pkg.name, manifest: pkg.manifest })
      }
    }
  }
  if (hostRowsInPreset.length > 0) {
    add(CODE.hostRowInPreset,
      `**预设体里出现了客户端 UI 行**（${hostRowsInPreset.length} 条）：`
      + hostRowsInPreset.map((row) => `${row.preset} / ${row.id} → ${row.package ?? row.name}`).join(' · ')
      + ' —— 宿主级行只许住顶层 `- insert:` 的直接成员：放进预设体 = 浏览器收不到（预设里的行进的是另一棵 Loader 树），'
      + '且两份预设各起一个 Node 写者')
  }
  if (expectedClientUi.length === 0) {
    add(CODE.emptySample, '产品那份组合里一条客户端 UI 行都解析不出来 —— "预设体里 0 条宿主级行"没有样本（不是通过）')
  }
  for (const expected of expectedClientUi) {
    const hits = insertIds.filter((id) => id === expected.id).length
    if (hits !== 1) {
      add(CODE.hostRowNotInInsert,
        `期望的宿主级行 ${expected.id}（→ ${expected.package ?? expected.name}）在顶层 insert 的直接成员里出现 **${hits}** 次（应当恰好 1 次）`
        + ` —— 它是那份补丁里唯一一条"宿主层"证据；0 次 = 靠删掉它让上一条变绿，多次 = 两个 Node 写者。`
        + ` insert 里现有的行：${JSON.stringify(insertIds)} · 预设入口：${JSON.stringify(insertPresetIds)}`)
    }
  }
  return {
    parsed,
    codes: [...new Set(codes)],
    details,
    host_rows_in_preset: hostRowsInPreset.length,
    host_rows_in_preset_detail: hostRowsInPreset,
    insert_ids: insertIds,
    insert_preset_ids: insertPresetIds,
    preset_rows: parsed.presets.map((p) => ({ preset: p.preset_id ?? p.member_id, rows: p.rows.length })),
  }
}

// ── 夹具：生成器 + 预设树的副本（只落运行根；产品零字节）─────────────────────────
const SKIP = new Set(['.runtime', 'node_modules', '.git'])
function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true })
  let files = 0
  for (const name of readdirSync(src).sort()) {
    if (SKIP.has(name)) continue
    const full = path.join(src, name)
    const st = statSync(full)
    const target = path.join(dst, name)
    if (st.isDirectory()) files += copyTree(full, target)
    else if (st.isFile()) { writeFileSync(target, readFileSync(full)); files += 1 }
  }
  return files
}

/**
 * 造一份"生成器 + 预设树"的运行根副本。生成器按**自己所在位置**推 `REPO`
 * （`resolve(dirname(fileURLToPath(import.meta.url)), '..')`）⇒ 副本的读写全落在副本里。
 *
 * @param {string} name
 */
function makeFixture(name) {
  const root = path.join(runRoot(), 'fixtures', `mkp01-${name}`)
  mkdirSync(root, { recursive: true })
  const generator = path.join(root, 'tools', 'make-bundle-patch.mjs')
  mkdirSync(path.dirname(generator), { recursive: true })
  writeFileSync(generator, readFileSync(GENERATOR))
  const copied = copyTree(PRESET_ROOT, path.join(root, 'presets', 'agenia'))
  const composition = path.join(root, 'presets', 'agenia', 'agent.cordis.yml')
  const patch = path.join(root, 'presets', 'agenia', 'cordis.patch.yml')
  // 复制过来的产物**先删掉**：留着它，"生成器没写出补丁"会被一份旧文件冒充成"写出来了"。
  const copiedPatchRemoved = existsSync(patch)
  if (copiedPatchRemoved) unlinkSync(patch)
  const repoOfCopy = path.resolve(path.dirname(generator), '..')
  const layoutOk = repoOfCopy === path.resolve(root)
  return { root, generator, composition, patch, copied, copied_patch_removed: copiedPatchRemoved, layout_ok: layoutOk }
}

/** 跑一次副本生成器（**默认模式**：它会写 `<副本>/presets/agenia/cordis.patch.yml`）。 */
function runGenerator(fixture) {
  const r = spawnSync(process.execPath, [fixture.generator], {
    cwd: fixture.root,
    env: { ...process.env, TEMP: path.join(runRoot(), 'tmp'), TMP: path.join(runRoot(), 'tmp') },
    encoding: 'utf8',
  })
  const stdout = String(r.stdout ?? '')
  const stderr = String(r.stderr ?? '')
  const codeOf = (text) => [...new Set(text.match(/E_BUNDLE_[A-Z0-9_]+/g) ?? [])]
  const patchExists = existsSync(fixture.patch)
  return {
    exit: r.status,
    signal: r.signal ?? null,
    stdout: stdout.trim().slice(0, 1500),
    stderr: stderr.trim().slice(0, 1500),
    bundle_codes: [...new Set([...codeOf(stdout), ...codeOf(stderr)])],
    patch_exists: patchExists,
    patch_text: patchExists ? readFileSync(fixture.patch, 'utf8') : null,
    at: new Date().toISOString(),
  }
}

/**
 * 一个现场 → 读数 + 码。
 * @param {{label:string, fixture:object, expectRealSource:boolean, expectedClientUi:object[]}} input
 */
function measure({ label, fixture, expectRealSource, expectedClientUi }) {
  const fixtureComposition = readFileSync(fixture.composition, 'utf8')
  const productComposition = readFileSync(COMPOSITION, 'utf8')
  const run = runGenerator(fixture)
  const reading = {
    label,
    exit: run.exit,
    signal: run.signal,
    bundle_codes: run.bundle_codes,
    patch_exists: run.patch_exists,
    patch_lines: run.patch_text === null ? null : run.patch_text.split('\n').length,
    patch_sha256: run.patch_text === null ? null : sha256Text(run.patch_text),
    source_sha256: sha256Text(fixtureComposition),
    source_is_real: fixtureComposition === productComposition,
    expected_client_ui: expectedClientUi.map((row) => ({ id: row.id, package: row.package ?? null, name: row.name })),
    stdout_first: run.stdout.split('\n')[0] ?? '',
    stderr_first: run.stderr.split('\n')[0] ?? '',
    at: run.at,
  }
  const codes = []
  if (!run.patch_exists || run.exit !== 0) {
    codes.push(CODE.genRejected)
    reading.codes = [CODE.genRejected]
    reading.patch_text = null
    reading.details = [{
      code: CODE.genRejected,
      message: `生成器没有造出补丁（exit ${String(run.exit)}${run.signal ? ` · signal ${run.signal}` : ''} · patch_exists=${String(run.patch_exists)}`
        + `${run.bundle_codes.length === 0 ? '' : ` · ${JSON.stringify(run.bundle_codes)}`}）：`
        + `stdout=${JSON.stringify(run.stdout.slice(0, 300))} stderr=${JSON.stringify(run.stderr.slice(0, 300))}`,
    }]
    return reading
  }
  if (expectRealSource && !reading.source_is_real) codes.push(CODE.sourceNotReal)
  const judged = judgePatch(run.patch_text, expectedClientUi)
  reading.patch_text = run.patch_text
  reading.host_rows_in_preset = judged.host_rows_in_preset
  reading.host_rows_in_preset_detail = judged.host_rows_in_preset_detail ?? null
  reading.insert_ids = judged.insert_ids
  reading.insert_preset_ids = judged.insert_preset_ids
  reading.preset_rows = judged.preset_rows
  reading.parser_problems = judged.parsed.problems.map((p) => p.message)
  reading.codes = [...new Set([...codes, ...judged.codes])]
  reading.details = judged.details
  if (codes.includes(CODE.sourceNotReal)) {
    reading.details = [...reading.details, { code: CODE.sourceNotReal, message: `这一格喂的不是产品那份组合（fixture sha256 ${String(reading.source_sha256).slice(0, 12)}… ≠ 产品 ${sha256Text(productComposition).slice(0, 12)}…）` }]
  }
  return reading
}

/** 刀：把一个锚点替换掉（锚点必须**恰好命中一次**，否则这把刀量不了）。 */
function replaceOnce(text, from, to, { label }) {
  const hits = text.split(from).length - 1
  if (hits !== 1) return { ok: false, text, hits, label, how: `${label}：锚点命中 ${hits} 次（要求恰好 1 次）` }
  return { ok: true, text: text.replace(from, to), hits, label, how: label }
}

// ── 用例 ───────────────────────────────────────────────────────────────────
test('MKP-01 生成器的安全联锁：两份预设体里宿主级行 = 0（对真组合跑 partitionHostLevel）', async () => {
  await runCase('MKP-01', async (rec) => {
    const problems = []
    const scenarios = {}
    const fixtures = {}
    /** 每个副本的布局自证：生成器的 `REPO` 必须落在这份副本里（否则它会去写产品那棵树）。 */
    const recordFixture = (id, fixture) => {
      fixtures[id] = {
        root: fixture.root,
        generator: path.relative(PATHS.repo, fixture.generator).replace(/\\/g, '/'),
        files_copied: fixture.copied,
        copied_patch_removed: fixture.copied_patch_removed,
        layout_ok: fixture.layout_ok,
      }
      if (fixture.layout_ok !== true) {
        problems.push(problem(CODE.fixtureBroken,
          `副本「${id}」的布局不成立：生成器按自己所在位置推出来的 REPO 不是这份副本（${fixture.generator}）—— 这一跑会去写产品那棵树，拒绝用它当证据`))
      }
      return fixture
    }
    const runScenario = (id, spec) => {
      const got = measure(spec)
      // `patch_text` 只在这一跑里用（尺子自证要在它的副本上做手脚），不进 result.json（67 KB 的正文不是读数）。
      const { patch_text: patchText, ...rest } = got
      scenarios[id] = { ...rest, patch_text_available: typeof patchText === 'string', expected_codes: [...spec.expectedCodes].sort(), measured: true }
      return got
    }
    /** 期望 vs 实得（逐格钉死：**只许翻它自己那几面**）。 */
    const assertVector = (id, got, expectedCodes, extra = []) => {
      const want = [...expectedCodes].sort()
      const actual = [...got.codes].sort()
      if (JSON.stringify(actual) !== JSON.stringify(want)) {
        problems.push(problem(CODE.knifeVector,
          `「${id}」翻出来的面是 ${JSON.stringify(actual)}，应当恰好 ${JSON.stringify(want)}`
          + `${extra.length === 0 ? '' : `（${extra.join(' · ')}）`} —— 刀翻错面：这一格的红不是你要证明的那件事`))
      }
    }

    // ── ⓪ 身份：产品那三份文件在这一跑里的字节（跑前 / 跑后各量一次）────────────
    const before = {
      patch: { exists: existsSync(PATCH), sha256: existsSync(PATCH) ? sha256File(PATCH) : null },
      composition: { sha256: sha256File(COMPOSITION) },
      generator: { sha256: sha256File(GENERATOR) },
    }
    rec.readings.subject = {
      generator: path.relative(PATHS.repo, GENERATOR).replace(/\\/g, '/'),
      generator_sha256: before.generator.sha256,
      composition: path.relative(PATHS.repo, COMPOSITION).replace(/\\/g, '/'),
      composition_sha256: before.composition.sha256,
      patch: path.relative(PATHS.repo, PATCH).replace(/\\/g, '/'),
      patch_sha256: before.patch.sha256,
      measured_at: new Date().toISOString(),
    }

    // ── 期望侧：产品那份组合里"该住宿主层"的行（按包事实，不读点名表）──────────
    const productComposition = readFileSync(COMPOSITION, 'utf8')
    const expected = clientUiRowsOf(productComposition)
    rec.readings.expected = {
      client_ui_rows: expected.rows,
      unresolved_rows: expected.unresolved.length,
      unresolved_sample: expected.unresolved.slice(0, 5),
    }
    if (expected.rows.length === 0) {
      problems.push(problem(CODE.emptySample,
        '产品那份组合里一条客户端 UI 行都解析不出来 —— 这一格的"宿主级行 = 0"会在空集上恒真（先证明样本非空）'))
    }

    // ── ① 真组合（回归锁；今天应当是绿的）──────────────────────────────────
    const real = runScenario('real', {
      label: '真组合 + 真生成器（副本）',
      fixture: recordFixture('real', makeFixture('real')),
      expectRealSource: true,
      expectedClientUi: expected.rows,
      expectedCodes: [],
    })
    for (const d of real.details ?? []) problems.push(problem(d.code, d.message))
    if (!real.source_is_real) {
      problems.push(problem(CODE.sourceNotReal, `真组合那一格喂的不是产品那份组合（fixture ${String(real.source_sha256).slice(0, 12)}…）—— 这一格的绿不是关于产品的`))
    }
    rec.readings.real_shape = {
      insert_ids: real.insert_ids ?? null,
      insert_preset_ids: real.insert_preset_ids ?? null,
      preset_rows: real.preset_rows ?? null,
      host_rows_in_preset: real.host_rows_in_preset ?? null,
    }

    // ── ② 尺子自证：把同一行塞进一份预设体，解析器必须数得出来 ─────────────────
    if (real.patch_exists !== true || typeof real.patch_text !== 'string') {
      // 真组合都造不出补丁 ⇒ 后面的刀没有底子可改；照实报（不是"跳过"）。
      problems.push(problem(CODE.parserControl, '真组合没造出补丁 ⇒ 尺子自证没有底子（这一跑判不了"数得出来"）'))
      scenarios['parser-control'] = { measured: true, codes: [CODE.parserControl], expected_codes: [], label: 'parser-control' }
    } else {
      const hostRow = expected.rows[0] ?? null
      const anchor = '\n        plugins:\n'
      const anchorHits = real.patch_text.split(anchor).length - 1
      let controlText = real.patch_text
      let controlHow = null
      if (hostRow !== null && anchorHits >= 1) {
        const injected = `${anchor}          - id: ${hostRow.id}\n            name: '${hostRow.name}'\n`
        controlText = real.patch_text.replace(anchor, injected)
        controlHow = `把 ${hostRow.id} 那一行按同一份字节塞进第一份预设体（10 格缩进）`
      }
      const control = hostRow === null ? null : judgePatch(controlText, expected.rows)
      const controlOk = control !== null
        && controlHow !== null
        && control.codes.includes(CODE.hostRowInPreset)
        && control.host_rows_in_preset === 1
      scenarios['parser-control'] = {
        measured: true,
        label: '尺子自证：同一行塞进预设体',
        how: controlHow,
        anchor_hits: anchorHits,
        host_rows_in_preset: control === null ? null : control.host_rows_in_preset,
        codes: controlOk ? [CODE.hostRowInPreset] : [CODE.parserControl],
        expected_codes: [CODE.hostRowInPreset],
      }
      if (!controlOk) {
        problems.push(problem(CODE.parserControl,
          `尺子自证没成立：把 ${hostRow === null ? '（没有宿主级行）' : hostRow.id} 塞进预设体之后，解析器数出来 `
          + `host_rows_in_preset=${JSON.stringify(control === null ? null : control.host_rows_in_preset)}、码 ${JSON.stringify(control === null ? null : control.codes)}`
          + `（锚点 ${anchorHits} 处）—— 尺子坏了，这一跑的"0 条"不成立`))
      }
    }

    // ── ③ 刀 K1：把宿主级过滤那道分支关掉（"过滤条件删掉"）────────────────────
    {
      const fixture = makeFixture('knife-drop-filter')
      recordFixture('knife-drop-filter', fixture)
      const source = readFileSync(fixture.generator, 'utf8')
      /**
       * 两道锚点（每一道都要求恰好命中一次）：
       *   · `const listed = …` ⇒ `false`（点名表不再把这一行认成宿主级）；
       *   · `if (markIndex >= 0) {` ⇒ `if (false) {`（标记分支整段不再执行）。
       * ⇒ 那一行退回普通预设行，撞上 `classifyPresetRow()` 的包事实闸
       *   （`E_BUNDLE_CLIENT_UI_IN_PRESET`）—— 这正是"过滤条件删掉之后第一道接住它的闸"，
       *   也正是"没有这一格就没人喊"的那个世界。
       */
      const e1 = replaceOnce(source, 'const listed = facts.id !== null && named.includes(facts.id)', 'const listed = false', { label: 'K1a：listed 恒 false' })
      const e2 = e1.ok ? replaceOnce(e1.text, 'if (markIndex >= 0) {', 'if (false) {', { label: 'K1b：标记分支关掉' }) : e1
      if (!e2.ok) {
        scenarios['knife-drop-filter'] = { measured: true, label: 'K1', codes: [CODE.knifeNotBiting], expected_codes: [CODE.genRejected], how: e2.how }
        problems.push(problem(CODE.knifeNotBiting, `刀 K1 量不了：${e2.how} —— 生成器那段代码已经长成别的样子了，改这把刀的人要同批改这里`))
      } else {
        writeFileSync(fixture.generator, e2.text)
        const got = runScenario('knife-drop-filter', {
          label: 'K1：宿主级过滤分支关掉（listed=false + 标记分支不执行）',
          fixture,
          expectRealSource: true,
          expectedClientUi: expected.rows,
          expectedCodes: [CODE.genRejected],
        })
        assertVector('knife-drop-filter', got, [CODE.genRejected],
          [`bundle 码 ${JSON.stringify(got.bundle_codes)}；生成器那一条必须点名"客户端 UI 行想进预设体"`])
        // 刀口必须是"组合过不了联锁"，不是随便一个崩
        // （今天实测：这一行退回去之后第一道接住它的是白名单那条**另一格** ——
        //  `E_BUNDLE_CLIENT_UI_ENABLED`「在白名单里、但没写 disabled: true」；K2 里补上 disabled 就变成静默放行。
        //  两把刀合起来证明的是同一件事：**层归属靠"词的位置"判，最终会漏**。）
        const named = (got.bundle_codes ?? []).some((code) => code.startsWith('E_BUNDLE_CLIENT_UI_'))
        if (!named) {
          problems.push(problem(CODE.knifeVector,
            `刀 K1 让生成器失败了，但没有落进"客户端 UI 行想进预设体"那一族闸（实得 ${JSON.stringify(got.bundle_codes)}）—— `
            + '这一刀证明不了"过滤条件删掉 ⇒ 有一道闸接着"，只证明它崩了'))
        }
      }
    }

    // ── ④ 刀 K2：词的位置全对、行为不对（白名单接管）────────────────────────
    {
      const fixture = recordFixture('knife-whitelist-rollback', makeFixture('knife-whitelist-rollback'))
      const compositionText = readFileSync(fixture.composition, 'utf8')
      const generatorText = readFileSync(fixture.generator, 'utf8')
      /** 组合：删掉标记 + 补 `disabled: true`（白名单三格全中的那个形状）。 */
      const markFrom = '  # @host-level\n'
      const markHits = compositionText.split(markFrom).length - 1
      const rowAnchor = "  name: 'file:///E:/Harness/presets/agenia/client-ui-dashboard/lib/index.js'\n"
      const rowHits = compositionText.split(rowAnchor).length - 1
      const listFrom = "const HOST_LEVEL_IDS = Object.freeze(['agenia-dashboard'])"
      const listHits = generatorText.split(listFrom).length - 1
      const canMutate = markHits === 1 && rowHits === 1 && listHits === 1
      if (!canMutate) {
        scenarios['knife-whitelist-rollback'] = {
          measured: true, label: 'K2', codes: [CODE.knifeNotBiting],
          expected_codes: [CODE.hostRowInPreset, CODE.hostRowNotInInsert],
          how: `锚点命中：标记 ${markHits} · 行名 ${rowHits} · HOST_LEVEL_IDS ${listHits}（各要求恰好 1）`,
        }
        problems.push(problem(CODE.knifeNotBiting,
          `刀 K2 量不了：锚点命中 标记 ${markHits} / 行名 ${rowHits} / HOST_LEVEL_IDS ${listHits}（各要求恰好 1）`
          + ' —— 组合或生成器那段已经长成别的样子了，改这把刀的人要同批改这里'))
      } else {
        writeFileSync(fixture.composition, compositionText
          .replace(markFrom, '')
          .replace(rowAnchor, `${rowAnchor}  disabled: true\n`))
        writeFileSync(fixture.generator, generatorText.replace(listFrom, 'const HOST_LEVEL_IDS = Object.freeze([])'))
        const got = runScenario('knife-whitelist-rollback', {
          label: 'K2：撤标记 + disabled:true + 点名表清空（白名单接管）',
          fixture,
          expectRealSource: false,
          expectedClientUi: expected.rows,
          expectedCodes: [CODE.hostRowInPreset, CODE.hostRowNotInInsert],
        })
        assertVector('knife-whitelist-rollback', got, [CODE.hostRowInPreset, CODE.hostRowNotInInsert],
          [`这一刀的生成器必须**成功**（exit=${String(got.exit)}）—— 它是"没有任何格子会红"的那个世界`])
        if (got.exit !== 0 || got.patch_exists !== true) {
          problems.push(problem(CODE.knifeVector,
            `刀 K2 应当让生成器**成功**并写出补丁（这个词的位置全对的世界正是本票的病根），实得 exit=${String(got.exit)} · patch_exists=${String(got.patch_exists)}`
            + ` · bundle 码 ${JSON.stringify(got.bundle_codes)}`))
        }
        if (got.host_rows_in_preset !== 2) {
          problems.push(problem(CODE.knifeVector,
            `刀 K2 应当在**两份**预设体里各多一条客户端 UI 行（实得 ${JSON.stringify(got.host_rows_in_preset)} 条）：`
            + '只翻一份 = 那条判据只量了其中一份预设体'))
        }
      }
    }

    // ── ⑤ 刀 K3：删掉那一行（"靠缺席让 0 条变绿"的那个形状）──────────────────
    {
      const fixture = recordFixture('knife-row-deleted', makeFixture('knife-row-deleted'))
      const compositionText = readFileSync(fixture.composition, 'utf8')
      const generatorText = readFileSync(fixture.generator, 'utf8')
      const listFrom = "const HOST_LEVEL_IDS = Object.freeze(['agenia-dashboard'])"
      const listHits = generatorText.split(listFrom).length - 1
      /** 整块删掉：那一行块的原文逐字从组合里摘走（其余字节不动）。 */
      const blocks = splitRows(compositionText)
      const target = blocks.filter((block) => /^- id: agenia-dashboard\s*$/m.test(block))
      const removed = target.length
      const canMutate = listHits === 1 && removed === 1 && target[0] !== undefined && compositionText.includes(target[0])
      if (!canMutate) {
        scenarios['knife-row-deleted'] = {
          measured: true, label: 'K3', codes: [CODE.knifeNotBiting], expected_codes: [CODE.hostRowNotInInsert],
          how: `HOST_LEVEL_IDS 命中 ${listHits} · 被删掉的行块 ${removed}（各要求恰好 1）`,
        }
        problems.push(problem(CODE.knifeNotBiting,
          `刀 K3 量不了：HOST_LEVEL_IDS 命中 ${listHits}、被删掉的行块 ${removed}（各要求恰好 1）`
          + ' —— 组合或生成器那段已经长成别的样子了，改这把刀的人要同批改这里'))
      } else {
        writeFileSync(fixture.composition, compositionText.replace(target[0], ''))
        writeFileSync(fixture.generator, generatorText.replace(listFrom, 'const HOST_LEVEL_IDS = Object.freeze([])'))
        const got = runScenario('knife-row-deleted', {
          label: 'K3：那一行整块删掉 + 点名表清空',
          fixture,
          expectRealSource: false,
          expectedClientUi: expected.rows,
          expectedCodes: [CODE.hostRowNotInInsert],
        })
        assertVector('knife-row-deleted', got, [CODE.hostRowNotInInsert],
          [`这一刀预设体里应当**真的** 0 条（host_rows_in_preset=${JSON.stringify(got.host_rows_in_preset)}）—— 它是"0 条不算通过"的证人`])
        if (got.host_rows_in_preset !== 0) {
          problems.push(problem(CODE.knifeVector,
            `刀 K3 的预设体里应当是 0 条客户端 UI 行（实得 ${JSON.stringify(got.host_rows_in_preset)}）—— `
            + '如果不是 0，这一刀证明的不是"缺席也会红"，而是另一件事'))
        }
      }
    }

    // ── ⑥ 收口：产品那两份文件在这一跑里一个字节都不许动 ──────────────────────
    const after = {
      patch: { exists: existsSync(PATCH), sha256: existsSync(PATCH) ? sha256File(PATCH) : null },
      composition: { sha256: sha256File(COMPOSITION) },
      generator: { sha256: sha256File(GENERATOR) },
    }
    rec.readings.subject.after = after
    for (const [name, pair] of [['bundle 补丁', [before.patch, after.patch]], ['组合', [before.composition, after.composition]], ['生成器', [before.generator, after.generator]]]) {
      if (JSON.stringify(pair[0]) !== JSON.stringify(pair[1])) {
        problems.push(problem(CODE.liveTouched, `读盘这一跑把产品那份${name}动了：${JSON.stringify(pair[0])} ⇒ ${JSON.stringify(pair[1])}`))
      }
    }
    rec.readings.fixtures = fixtures

    // ── ⑦ 自守（**在每条腿外面**）：这一跑真的量了哪几格 ──────────────────────
    const seen = Object.keys(scenarios)
    const missing = SCENARIO_IDS.filter((id) => !seen.includes(id))
    const extra = seen.filter((id) => !SCENARIO_IDS.includes(id))
    const malformed = seen.filter((id) => scenarios[id].measured !== true || !Array.isArray(scenarios[id].codes))
    if (missing.length > 0) problems.push(problem(CODE.legsIncomplete, `这一跑缺了 ${missing.length} 格：${missing.join(' / ')} —— 删掉一条腿没有别人会喊`))
    if (extra.length > 0) problems.push(problem(CODE.legsIncomplete, `这一跑多出没登记的格：${extra.join(' / ')} —— 加一条腿要同批登记进 SCENARIO_IDS`))
    if (malformed.length > 0) problems.push(problem(CODE.legsIncomplete, `这几格没有"量过"的落点（measured / codes）：${malformed.join(' / ')}`))
    rec.readings.scenarios = scenarios
    rec.readings.scenarios_coverage = { expected: SCENARIO_IDS, seen, missing, extra, malformed, at: new Date().toISOString() }
    rec.readings.verdict = { red: problems.length, codes: [...new Set(problems.map((p) => p.code))], at: new Date().toISOString() }
    caseFail(problems)
  })
})
