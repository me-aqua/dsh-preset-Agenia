/**
 * `MKP-01` · **生成器的安全联锁：判的是控制流，不是"词的位置"**
 *
 * 票：`ticket-20261106-01` · 定形 `.team/leader/2026-11-07/定形-ticket-20261106-01.md`（batch 12）
 * 病根（定形 §一②）：`make-bundle-patch.mjs` 的 `classifyPresetRow()` 按**裸名 + 包名族 + 白名单**判，
 * 而真正该成立的行为是：**`partitionHostLevel()` 把宿主级行摘走之后，两份预设体里一个宿主级行都不剩**。
 *
 * ── 这一格补的是**可观察性**，不是覆盖（第 4 关评审 M3）──────────────────────────────
 * 本票之前**没有一格观察生成器的控制流**：`DASH-15` / `DASH-16` 读的是**产物**（盘上那份
 * `cordis.patch.yml`）。产物级的红只会在**生成器重跑之后**才出现 —— 所以"标记与点名表一起被撤掉、
 * 让白名单接管"那个世界，在重跑之前是**全绿**的，重跑之后 DASH-16 才会红（`DASH-CLIENT-IN-PRESET`，
 * `disabled: true` 不豁免）、不重跑则 DASH-15 的派生物那一腿才会红（`E_PATCH_NOT_DERIVED`）。
 * ⇒ 本格在**同一跑里**跑真生成器、读它**吐出来的那一份**，把"重跑之后才会响"的那一步提到现在。
 * 丢掉它，坏掉的过滤条件要等下一次有人重新生成才会被发现。
 *
 * ── 判读半段**不另造尺子**（第 4 关评审 M1）────────────────────────────────────────
 * "一行住在哪一层"这件事，套件里只有一把尺子：`support/client-ui-placement.mjs`（`DASH-15`/`DASH-16` 的判据本体，
 * 文件头 `:37-52` 明写"两套码同时声称同一件事"是禁止的）。本文件**只用它的三个导出口**：
 *   · `describePlacement()` —— 结构：顶层 `- insert:` 的直接成员 / 预设体里的行（按 YAML 子树，**不数缩进**）；
 *   · `scanBundleMount()` —— 期望的宿主级行在不在 insert（`DASH-ROW-ABSENT` / `DASH-NOT-HOST-LEVEL`）；
 *   · `scanClientUiPlacement()` —— 语义：预设体里有没有客户端 UI 行（`DASH-CLIENT-IN-PRESET`）；
 *   · `withHostRowInPresetBodies()` —— "把那一行搬进两份预设体"的夹具（尺子自证用）。
 * `name` → `package.json` 的包事实也走它的 `manifestIndexOf()` / `resolveRowPackage()`。
 * 🔴 **本文件不产生任何"层归属"码**：那一族只有 `client-ui-placement.mjs` 的 `CODES`。这里自己的码只回答
 * "这次观察本身成不成立"（生成器有没有造出补丁 / 副本是不是真组合 / 样本空不空 / 刀咬没咬住）。
 *
 * ── 本票的**新东西**只有这一半：跑副本生成器 ────────────────────────────────────────
 * `import` 不了它：`.tools/make-bundle-patch.mjs` 在**加载期**就跑 `build()` 并 `writeFileSync(TARGET,…)`。
 * ⇒ 把**真组合**与**真生成器**各复制一份进运行根（逐字节；`source_is_real` 自证 sha256），跑副本，
 * 读它写出来的补丁。副本的 `REPO` 由生成器自己的位置推出 ⇒ 全部读写都在运行根里（`generator_repo` 逐格记）。
 *
 * ── 已退役的码（墓碑；写清原因与替代，不许静默消失）──────────────────────────────────
 * 第 4 关评审 M1 把判读半段换成 `client-ui-placement.mjs` 之后，本文件原先自己造的那三个"层归属"码退役 ——
 * **一个事实只许一个码**（`client-ui-placement.mjs` 文件头 `:37-52` 的规矩）。三个都还能 grep 到，去处如下：
 *   · `MKP-HOST-ROW-IN-PRESET`（2026-11-07 退役）→ **`DASH-CLIENT-IN-PRESET`**
 *     （尺子 `scanClientUiPlacement()` 的原话：预设体里有客户端 UI 行；`disabled: true` 不豁免）。
 *   · `MKP-HOST-ROW-NOT-IN-INSERT`（2026-11-07 退役）→ **`DASH-NOT-HOST-LEVEL`**
 *     （那行在、但不是顶层 `- insert:` 的直接成员）或 **`DASH-ROW-ABSENT`**（那行整个不在）——
 *     两种形状原来被这一个码合并了，现在由尺子按事实分开报。
 *   · `MKP-PARSER-BROKEN`（2026-11-07 退役）→ **`DASH-PATCH-UNREADABLE`**
 *     （两份尺子任一读不懂这份补丁时都报它；本文件不再自己判"读不懂"）。
 * 为什么不是"留着更安全"：留着就是两套码声称同一件事，而且本文件那把更弱（它钉 10 格缩进，
 * 预设体里别的缩进的宿主级行它看不见 —— 评审 M1 的原话）。
 *
 * ── 判什么（本文件的码；每条腿一个意思）─────────────────────────────────────────────
 *   · `MKP-GEN-REJECTED` —— 生成器没造出补丁（退出码非 0 / 没写文件）。这是"组合过不了联锁"，
 *     与"造出来了但放错了层"是两个诊断；
 *   · `MKP-EMPTY-SAMPLE` —— **样本下限**：产品组合里解析不出客户端 UI 行 / 产品补丁里没有期望的宿主级行
 *     ⇒ "预设体里 0 条"是**空集上的真**（0 行不算通过）；
 *   · `MKP-EMPTY-BODY` —— 某一份预设体里一行都没有（同上，空集不算通过）；
 *   · `MKP-PARSER-CONTROL` —— **尺子自证**：拿真补丁 + `withHostRowInPresetBodies()` 把那一行搬进两份预设体，
 *     尺子必须数得出"预设体里多了一条客户端 UI 行"且"insert 里没有它了"（数不出 ⇒ 尺子坏了）；
 *   · `MKP-SOURCE-NOT-REAL` / `MKP-FIXTURE-BROKEN` / `MKP-LIVE-PATCH-TOUCHED` —— 这一跑打的不是真组合 /
 *     副本布局不成立 / 读盘这一跑动了产品那三份文件；
 *   · `MKP-KNIFE-NOT-BITING` / `MKP-KNIFE-VECTOR` —— 刀没咬住（输入没变）/ 翻错面；
 *   · `MKP-LEGS-INCOMPLETE` —— **自守在块外**：`rec.readings.scenarios` 按 id 成员覆盖 `SCENARIO_IDS`。
 * 层归属的**判决**（本格真正要的那条）用的是尺子的码：
 *   · `DASH-CLIENT-IN-PRESET` —— 两份预设体里有客户端 UI 行（**这就是本票要的断言**）；
 *   · `DASH-NOT-HOST-LEVEL` / `DASH-ROW-ABSENT` —— 期望的宿主级行不是 insert 的直接成员 / 整个不在。
 * ⚠️ 本格**不**报 `DASH-HOST-ROW-COUNT` / `DASH-TOP-INSERT-SHAPE` / `DASH-CLIENT-OUTSIDE-INSERT`：
 *   那些是 DASH-15/16 的腿（同一个事实只许一个码；本格的刀 K2 会同时触发前两者，读数里照实记 `ruler_codes`）。
 *
 * ── 三把刀（都在**运行根里的副本**上做；产品零字节）──────────────────────────────────
 *   · `K1 drop-filter`：`listed = false` + 标记分支不执行（把宿主级过滤**关掉**，定形 §四点名的那把）
 *     ⇒ 那一行退回普通预设行，撞上生成器的包事实闸（实测 `E_BUNDLE_CLIENT_UI_ENABLED`）⇒ `MKP-GEN-REJECTED`；
 *   · `K2 whitelist-rollback`：**词的位置全对、行为不对** —— 组合里撤 `# @host-level`、给那一行补
 *     `disabled: true`，生成器的 `HOST_LEVEL_IDS` 清空 ⇒ 白名单三格全中、生成器**不报错**、补丁照写
 *     （这是"重跑之后才会响"的那个世界的产物）⇒ 尺子给出 `DASH-CLIENT-IN-PRESET` + `DASH-NOT-HOST-LEVEL`；
 *   · `K3 row-deleted`：把那一行从组合里整块删掉 + `HOST_LEVEL_IDS` 清空 ⇒ 预设体里**确实 0 条**
 *     （上一条腿会绿！）但 insert 里也没有它 ⇒ **只有** `DASH-ROW-ABSENT`。
 * 每把刀**只许翻它自己那几面**（期望码集合逐把钉死）。**刀证明的是判词，不是分类函数。**
 *
 * ── 今天为什么是绿的（说清楚，别当"首跑红"）──────────────────────────────────────────
 * 真组合今天**就是对的**（那一行走宿主级路线）⇒ 这一格今天 **RED 0**，它是**回归锁**。
 * 红的合法性来自 K1 / K2 / K3。缺了它们，"恒绿"和"判据死了"长得一样。
 *
 * ── 不判什么 ────────────────────────────────────────────────────────────────────
 *   · 不判生成器内部怎么写的（导出面 / 常量名 / 注释）—— 只判它吐出来的那份补丁；
 *   · 不判 `classifyPresetRow()` 该不该留（定形 §二② 允许它降级成诊断）；
 *   · 不判 insert 的形状 / 看板行的出现次数（DASH-15/16 的腿）；
 *   · 不判别的岗位的文件（`.tools/**` 一个字节都不写；跑的是副本）。
 *
 * 证据：`<run root>/_evidence/<RUN_ID>/MKP-01/result.json`（`readings.scenarios.*` 逐格带
 * `codes`（这一格**实得**的红因）/ `expected_codes`（钉死的向量）/ `ruler_codes`（尺子的原话，含被本格让给 DASH-15/16 的那几个））。
 */
import { before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runRoot, sha256File, sha256Text } from '../support/evidence.mjs'
import {
  CODES as PLACEMENT,
  describePlacement,
  manifestIndexOf,
  resolveRowPackage,
  scanBundleMount,
  scanClientUiPlacement,
  withHostRowInPresetBodies,
} from '../support/client-ui-placement.mjs'

before(() => {
  preflight()
})

/** 产品侧的三个落点（**只读**）。 */
const GENERATOR = PATHS.generator
const COMPOSITION = PATHS.liveComposition
const PATCH = PATHS.livePatch
/** 路径形 `name` 的解析基准（与生成器同一份口径：预设目录）。 */
const PRESET_ROOT = PATHS.finalPreset
/** 裸包名的解析面（尺子自己的索引；这棵树里只有预设目录那一份 package.json 需要它）。 */
const MANIFEST_ROOTS = [PATHS.finalPreset]
/**
 * 看板包那份 manifest：尺子认"那一行是哪一行"靠的就是它（**不靠 id**）。
 * 🔴 `scanBundleMount()` 的这个参数**没有缺省值**（`scanClientUiPlacement()` 才有）——
 *    漏给时每一行都会落进"id 在、包不是看板那一份"那一支，2026-11-07 实测在 `relOf(undefined)` 上崩。
 */
const DASHBOARD_MANIFEST = path.join(PATHS.finalPreset, 'client-ui-dashboard', 'package.json')

const CODE = {
  genRejected: 'MKP-GEN-REJECTED',
  emptySample: 'MKP-EMPTY-SAMPLE',
  emptyBody: 'MKP-EMPTY-BODY',
  parserControl: 'MKP-PARSER-CONTROL',
  sourceNotReal: 'MKP-SOURCE-NOT-REAL',
  liveTouched: 'MKP-LIVE-PATCH-TOUCHED',
  fixtureBroken: 'MKP-FIXTURE-BROKEN',
  knifeNotBiting: 'MKP-KNIFE-NOT-BITING',
  knifeVector: 'MKP-KNIFE-VECTOR',
  legsIncomplete: 'MKP-LEGS-INCOMPLETE',
}

/**
 * 本格**允许**出场的层归属码（全部来自 `client-ui-placement.mjs` 的 `CODES`，一个都不许另造）。
 * 三个各有自己的事实：进错了层 / 整个不在 / 在但不是 insert 的直接成员。
 */
const LAYER_CODES = [PLACEMENT.clientInPreset, PLACEMENT.rowAbsent, PLACEMENT.notHostLevel]

/** 这一跑量了哪几格 —— **显式清单**（自守在块外读它）。 */
const SCENARIO_IDS = ['real', 'parser-control', 'knife-drop-filter', 'knife-whitelist-rollback', 'knife-row-deleted']

// ── 组合行：只用来**改**组合（刀），不用来判补丁 ──────────────────────────────
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

// ── 判读：全部交给 `client-ui-placement.mjs`（本文件不解析补丁、不算包事实）──────────
/**
 * 产品侧的**期望**：今天哪几行是宿主级行 —— 由尺子读**产品那份补丁**的 insert 直接成员得出
 * （`host_members` 不含两条预设入口）。这是"契约那一侧"，三把刀上都不变。
 *
 * @param {string} productPatchText
 */
function expectedHostRowsOf(productPatchText) {
  const mount = scanBundleMount({ patchText: productPatchText, label: '产品补丁', manifestRoots: MANIFEST_ROOTS, dashboardManifest: DASHBOARD_MANIFEST })
  const ids = (mount.reading.host_members ?? []).map((row) => row.id).filter((id) => typeof id === 'string' && id !== '')
  return { ids, problems: mount.problems, insert_members: mount.reading.insert_members ?? null, warnings: mount.reading.warnings ?? [] }
}

/**
 * 产品**组合**里"该住宿主层"的行 —— 用尺子的结构 + 包事实读（`describePlacement` + `resolveRowPackage`）。
 * 只作**样本下限**（`MKP-EMPTY-SAMPLE`）：组合里要真有客户端 UI 行，否则"预设体里 0 条"是空集上的真。
 *
 * @param {string} compositionText
 */
function compositionClientUiRows(compositionText) {
  const { rows, doc } = describePlacement(compositionText, '产品组合')
  const index = manifestIndexOf(MANIFEST_ROOTS)
  const hits = []
  const unresolved = []
  for (const row of rows) {
    const pkg = resolveRowPackage(row.name, index)
    if (pkg.ok && pkg.value?.dsh?.client?.platform === 'web') hits.push({ id: row.id, name: row.name, pkg: path.relative(PATHS.repo, pkg.file).replace(/\\/g, '/') })
    else if (!pkg.ok) unresolved.push({ id: row.id, name: row.name, how: pkg.how })
  }
  return { rows: hits, unresolved: unresolved.length, warnings: [...doc.warnings] }
}

/**
 * 判一份**派生物**补丁（纯函数：真组合与三把刀走同一份判读）。
 *
 * @param {{label:string, patchText:string, expectedIds:string[]}} input
 * @returns {{problems:object[], codes:string[], reading:object}}
 */
function judgeDerived({ label, patchText, expectedIds }) {
  const mount = scanBundleMount({ patchText, label, manifestRoots: MANIFEST_ROOTS, dashboardManifest: DASHBOARD_MANIFEST })
  const placement = scanClientUiPlacement({ patchText, label, manifestRoots: MANIFEST_ROOTS })
  const structure = describePlacement(patchText, label)
  const problems = []
  const rulerCodes = [...new Set([...mount.problems, ...placement.problems].map((p) => p.code))].sort()
  const unreadable = [...mount.problems, ...placement.problems].filter((p) => p.code === PLACEMENT.patchUnreadable)
  if (unreadable.length > 0) {
    problems.push(unreadable[0])
    return {
      problems,
      codes: [PLACEMENT.patchUnreadable],
      reading: { label, rule: 'patch-unreadable', ruler_codes: rulerCodes, rows_total: structure.rows.length },
    }
  }

  // ── ① 本票要的那条断言：预设体里有没有客户端 UI 行（尺子的码，不另造）────────────
  for (const p of placement.problems) if (p.code === PLACEMENT.clientInPreset) problems.push(p)

  // ── ② 期望的宿主级行必须是顶层 insert 的直接成员（零次 / 在别处，两种都由尺子的码说）──
  for (const p of mount.problems) {
    if (p.code === PLACEMENT.rowAbsent || p.code === PLACEMENT.notHostLevel) problems.push(p)
  }

  // ── ③ 样本下限：两份预设体必须真的非空（"0 条"不许在空集上成立）──────────────────
  const bodyRows = structure.rows.filter((row) => row.in_preset_body === true)
  const presetEntries = mount.reading.preset_entries ?? []
  const perPreset = presetEntries.map((entry) => ({
    preset: entry.config_id ?? entry.id,
    rows: bodyRows.filter((row) => row.preset === (entry.config_id ?? entry.id)).length,
  }))
  for (const item of perPreset) {
    if (item.rows === 0) {
      problems.push(problem(CODE.emptyBody,
        `预设 ${item.preset} 的 plugins 里一行都没有 —— "预设体里 0 条客户端 UI 行"在空集上恒真（0 行不算通过）`))
    }
  }
  if (presetEntries.length === 0) {
    problems.push(problem(CODE.emptyBody, `${label} 里一条预设入口都没有 —— 没有预设体可判`))
  }
  const insertIds = (mount.reading.host_members ?? []).map((row) => row.id)
  const insertCounts = Object.fromEntries(expectedIds.map((id) => [id, (mount.reading.host_members ?? []).filter((row) => row.id === id).length]))

  return {
    problems,
    codes: [...new Set(problems.map((p) => p.code))],
    reading: {
      label,
      ruler_codes: rulerCodes,
      insert_ids: insertIds,
      expected_ids: expectedIds,
      insert_counts: insertCounts,
      preset_rows: perPreset,
      body_rows_total: bodyRows.length,
      client_ui_in_preset: placement.problems.filter((p) => p.code === PLACEMENT.clientInPreset).length,
      outside_insert_reading_only: (placement.reading.outside_insert ?? []).length,
      host_row_count_reading_only: placement.reading.dashboard?.occurrences ?? null,
      host_row_text_hits_reading_only: placement.reading.dashboard?.text_hits ?? null,
      unresolved_in_preset: placement.reading.unresolved_in_preset_count ?? null,
      rows_total: structure.rows.length,
    },
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

const isInside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * 造一份"生成器 + 预设树"的运行根副本。生成器按**自己所在位置**推 `REPO`
 * （`resolve(dirname(fileURLToPath(import.meta.url)), '..')`）⇒ 副本的读写全落在副本里。
 * 🔴 那条"落在副本里"由 `generator_repo_inside_run_root` **现算**（不是拿两个同源表达式对等）——
 *    评审 §5 点过前一版的 `layout_ok` 恒真。
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
  /** 生成器按自己位置推出来的 `REPO`（= 它会读写的那棵树）。 */
  const generatorRepo = path.resolve(path.dirname(generator), '..')
  return {
    root,
    generator,
    composition,
    patch,
    copied,
    copied_patch_removed: copiedPatchRemoved,
    generator_repo: generatorRepo,
    generator_repo_inside_run_root: isInside(generatorRepo, runRoot()),
  }
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
 * 一个现场 → 读数 + 码（"跑副本生成器"那半段；判读交给 `judgeDerived`）。
 * @param {{label:string, fixture:object, expectRealSource:boolean, expectedIds:string[]}} input
 */
function measure({ label, fixture, expectRealSource, expectedIds }) {
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
    generator_repo: fixture.generator_repo,
    generator_repo_inside_run_root: fixture.generator_repo_inside_run_root,
    stdout_first: run.stdout.split('\n')[0] ?? '',
    stderr_first: run.stderr.split('\n')[0] ?? '',
    at: run.at,
  }
  if (!run.patch_exists || run.exit !== 0) {
    return {
      ...reading,
      patch_text: null,
      codes: [CODE.genRejected],
      details: [{
        code: CODE.genRejected,
        message: `生成器没有造出补丁（exit ${String(run.exit)}${run.signal ? ` · signal ${run.signal}` : ''} · patch_exists=${String(run.patch_exists)}`
          + `${run.bundle_codes.length === 0 ? '' : ` · ${JSON.stringify(run.bundle_codes)}`}）：`
          + `stdout=${JSON.stringify(run.stdout.slice(0, 300))} stderr=${JSON.stringify(run.stderr.slice(0, 300))}`,
      }],
    }
  }
  const judged = judgeDerived({ label, patchText: run.patch_text, expectedIds })
  const details = [...judged.problems]
  if (expectRealSource && !reading.source_is_real) {
    details.push(problem(CODE.sourceNotReal,
      `这一格喂的不是产品那份组合（fixture sha256 ${String(reading.source_sha256).slice(0, 12)}… ≠ 产品 ${sha256Text(productComposition).slice(0, 12)}…）`))
  }
  return {
    ...reading,
    patch_text: run.patch_text,
    ruler: judged.reading,
    codes: [...new Set(details.map((p) => p.code))],
    details,
  }
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
    /** 每个副本的布局自证：生成器的 `REPO` 必须落在**这一跑的运行根**里（否则它会去写产品那棵树）。 */
    const recordFixture = (id, fixture) => {
      fixtures[id] = {
        root: fixture.root,
        generator: path.relative(PATHS.repo, fixture.generator).replace(/\\/g, '/'),
        generator_repo: fixture.generator_repo,
        generator_repo_inside_run_root: fixture.generator_repo_inside_run_root,
        files_copied: fixture.copied,
        copied_patch_removed: fixture.copied_patch_removed,
      }
      if (fixture.generator_repo_inside_run_root !== true) {
        problems.push(problem(CODE.fixtureBroken,
          `副本「${id}」的生成器按自己位置推出的 REPO（${fixture.generator_repo}）不在运行根里 —— 这一跑会去写产品那棵树，拒绝用它当证据`))
      }
      return fixture
    }
    /** 一格现场：跑副本 → 判读 → 记读数（`codes` = 这一格**实得**的红因）。 */
    const runScenario = (id, spec) => {
      const got = measure(spec)
      const { patch_text: patchText, ...rest } = got
      scenarios[id] = { ...rest, patch_text_available: typeof patchText === 'string', expected_codes: [...(spec.expectedCodes ?? [])].sort(), measured: true }
      return got
    }
    /** 刀的向量（**只许翻它自己那几面**）。 */
    const assertVector = (id, got, expectedCodes, extra = []) => {
      const want = [...expectedCodes].sort()
      const actual = [...got.codes].sort()
      if (JSON.stringify(actual) !== JSON.stringify(want)) {
        problems.push(problem(CODE.knifeVector,
          `「${id}」翻出来的面是 ${JSON.stringify(actual)}，应当恰好 ${JSON.stringify(want)}`
          + `${extra.length === 0 ? '' : `（${extra.join(' · ')}）`} —— 刀翻错面：这一格的红不是你要证明的那件事`))
      }
    }

    // ── ⓪ 身份 + 期望侧（都是产品那三份文件的**读数**，跑前量一次）───────────────────
    const productPatchText = readFileSync(PATCH, 'utf8')
    const before = {
      patch: { exists: existsSync(PATCH), sha256: sha256File(PATCH) },
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
    const expected = expectedHostRowsOf(productPatchText)
    const compositionRows = compositionClientUiRows(readFileSync(COMPOSITION, 'utf8'))
    rec.readings.expected = {
      host_row_ids: expected.ids,
      insert_members: expected.insert_members,
      composition_client_ui_rows: compositionRows.rows,
      composition_unresolved_rows: compositionRows.unresolved,
      composition_warnings: compositionRows.warnings,
      expected_problems: expected.problems.map((p) => p.code),
    }
    if (expected.ids.length === 0) {
      problems.push(problem(CODE.emptySample,
        '产品补丁里没有期望的宿主级行（顶层 insert 的直接成员里只有预设入口）—— 没有对象可判，"预设体里 0 条"在空集上恒真'))
    }
    if (compositionRows.rows.length === 0) {
      problems.push(problem(CODE.emptySample,
        '产品组合里一条客户端 UI 行都解析不出来 —— 这一格的样本是空的（先证明样本非空，再谈"0 条"）'))
    }

    // ── ① 真组合（回归锁；今天应当是绿的）──────────────────────────────────
    const real = runScenario('real', {
      label: '真组合 + 真生成器（副本）',
      fixture: recordFixture('real', makeFixture('real')),
      expectRealSource: true,
      expectedIds: expected.ids,
      expectedCodes: [],
    })
    for (const d of real.details ?? []) problems.push(d)
    if (!real.source_is_real) {
      problems.push(problem(CODE.sourceNotReal, `真组合那一格喂的不是产品那份组合（fixture ${String(real.source_sha256).slice(0, 12)}…）—— 这一格的绿不是关于产品的`))
    }

    // ── ② 尺子自证：拿真补丁 + 尺子自己的夹具，把那一行搬进两份预设体 ─────────────
    if (real.patch_exists !== true || typeof real.patch_text !== 'string') {
      problems.push(problem(CODE.parserControl, '真组合没造出补丁 ⇒ 尺子自证没有底子（这一跑判不了"数得出来"）'))
      scenarios['parser-control'] = { measured: true, label: 'parser-control', codes: [], expected_codes: [], note: 'no-derivative' }
    } else {
      const moved = withHostRowInPresetBodies({ patchText: real.patch_text, hostRowIds: expected.ids })
      const beforeCounts = {
        client_in_preset: (real.ruler?.client_ui_in_preset ?? 0),
        insert_host_rows: (real.ruler?.insert_ids ?? []).length,
      }
      const after = judgeDerived({ label: '尺子自证·搬进两份预设体', patchText: moved.text, expectedIds: expected.ids })
      const afterMount = scanBundleMount({ patchText: moved.text, label: '尺子自证·搬进两份预设体', manifestRoots: MANIFEST_ROOTS, dashboardManifest: DASHBOARD_MANIFEST })
      const deltaClientInPreset = (after.reading.client_ui_in_preset ?? 0) - beforeCounts.client_in_preset
      const notHostLevel = after.problems.filter((p) => p.code === PLACEMENT.notHostLevel).length
      const ok = moved.moved === true
        && (moved.added_into ?? []).length === 2
        && deltaClientInPreset >= 2
        && notHostLevel >= 1
        && (afterMount.reading.host_members ?? []).length === 0
      scenarios['parser-control'] = {
        measured: true,
        label: '尺子自证：把那一行搬进两份预设体',
        how: moved.why ?? null,
        fixture_added_into: moved.added_into ?? null,
        fixture_before: moved.before ?? null,
        fixture_after: moved.after ?? null,
        delta_client_in_preset: deltaClientInPreset,
        not_host_level: notHostLevel,
        insert_host_rows_after: (afterMount.reading.host_members ?? []).length,
        codes: ok ? [] : [CODE.parserControl],
        expected_codes: [],
        ruler_codes: after.reading.ruler_codes ?? null,
      }
      for (const p of ok ? [] : [problem(CODE.parserControl,
        `尺子自证没成立：拿真补丁把 ${JSON.stringify(expected.ids)} 搬进两份预设体之后，`
        + `客户端 UI 行增量 ${deltaClientInPreset}（应 ≥2）· NOT-HOST-LEVEL ${notHostLevel}（应 ≥1）· insert 里宿主行 `
        + `${(afterMount.reading.host_members ?? []).length}（应 0）· moved=${String(moved.moved)} —— 尺子看不见那一行，这一跑的"0 条"不成立`)]) problems.push(p)
    }

    // ── ③ 刀 K1：把宿主级过滤那道分支关掉（"过滤条件删掉"）────────────────────
    {
      const fixture = recordFixture('knife-drop-filter', makeFixture('knife-drop-filter'))
      const source = readFileSync(fixture.generator, 'utf8')
      /**
       * 两道锚点（每一道都要求恰好命中一次）：
       *   · `const listed = …` ⇒ `false`（点名表不再把这一行认成宿主级）；
       *   · `if (markIndex >= 0) {` ⇒ `if (false) {`（标记分支整段不再执行）。
       * ⇒ 那一行退回普通预设行，撞上 `classifyPresetRow()` 的包事实闸
       *   （实测 `E_BUNDLE_CLIENT_UI_ENABLED` —— 白名单 id 在、但没写 `disabled: true`）。
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
          expectedIds: expected.ids,
          expectedCodes: [CODE.genRejected],
        })
        assertVector('knife-drop-filter', got, [CODE.genRejected],
          [`bundle 码 ${JSON.stringify(got.bundle_codes)}；生成器那一条必须点名"客户端 UI 行想进预设体"`])
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
          expected_codes: [PLACEMENT.clientInPreset, PLACEMENT.notHostLevel],
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
          expectedIds: expected.ids,
          expectedCodes: [PLACEMENT.clientInPreset, PLACEMENT.notHostLevel],
        })
        assertVector('knife-whitelist-rollback', got, [PLACEMENT.clientInPreset, PLACEMENT.notHostLevel],
          [`这一刀的生成器必须**成功**（exit=${String(got.exit)}）—— 它是"产物级要等重跑才响"的那个世界`])
        if (got.exit !== 0 || got.patch_exists !== true) {
          problems.push(problem(CODE.knifeVector,
            `刀 K2 应当让生成器**成功**并写出补丁（词的位置全对的世界正是本票的病根），实得 exit=${String(got.exit)} · patch_exists=${String(got.patch_exists)}`
            + ` · bundle 码 ${JSON.stringify(got.bundle_codes)}`))
        }
        if (got.ruler?.client_ui_in_preset !== 2) {
          problems.push(problem(CODE.knifeVector,
            `刀 K2 应当在**两份**预设体里各多一条客户端 UI 行（尺子数出 ${JSON.stringify(got.ruler?.client_ui_in_preset)} 条，应 2）：`
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
          measured: true, label: 'K3', codes: [CODE.knifeNotBiting], expected_codes: [PLACEMENT.rowAbsent],
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
          expectedIds: expected.ids,
          expectedCodes: [PLACEMENT.rowAbsent],
        })
        assertVector('knife-row-deleted', got, [PLACEMENT.rowAbsent],
          [`这一刀预设体里应当**真的** 0 条（client_ui_in_preset=${JSON.stringify(got.ruler?.client_ui_in_preset)}）—— 它是"0 条不算通过"的证人`])
        if (got.ruler?.client_ui_in_preset !== 0) {
          problems.push(problem(CODE.knifeVector,
            `刀 K3 的预设体里应当是 0 条客户端 UI 行（尺子数出 ${JSON.stringify(got.ruler?.client_ui_in_preset)}）—— `
            + '如果不是 0，这一刀证明的不是"缺席也会红"，而是另一件事'))
        }
      }
    }

    // ── ⑥ 收口：产品那三份文件在这一跑里**字节相同**（同字节重写在这里看不见，别的写路径由副本布局那条腿兜）──
    const after = {
      patch: { exists: existsSync(PATCH), sha256: sha256File(PATCH) },
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
