/**
 * `DASH-15` · **面板装上了没有**（`bug-20261104-02`；2026-11-05 深夜**挂回 bundle 层**）
 * `DASH-16` · **客户端 UI 行的层归属**（第 4 关评审 `R-1` 的语义面；同一批挂回 bundle 层）
 *
 * ── 病根（没变）────────────────────────────────────────────────────────────────
 * **「写出来了」≠「装上了」**。浏览器只收**宿主装载层**（顶层 `- insert:`）里声明了 `dsh.client`
 * 的包；一行写在别处（预设的 `plugins` 里 / 一个顶层 override 里）看起来"配置里有"，界面上什么都没有。
 * 2026-11-04 的现场：`view.json` 469 B · 146/146 · 128/128 全绿，老板「我在客户端里点哪，i see nothing」
 * —— **十四条 DASH 用例没有一条读过装载层**，所以没有任何一条判据可能注意到它。
 *
 * ── 为什么又搬回来（2026-11-05 深夜 · 定形「补记一」）────────────────────────────
 * 早上把这一行搬进 bundle 的宿主级 insert 之后 boot 掉进了 `standard`；那一版归因是
 * **「宿主层会把 bundle 层带塌」**，于是先回滚成 `disabled: true`、再迁到 **profile 层**。
 * 那个归因**已被证伪**（`bug-20261105-12` rejected）：官方「智能体团队」面板
 * （`@deepseek-ai/dsh-experimental-agent-team-profile`）就是挂在自己的 `dsh.bundle.patch` 的
 * **顶层 `- insert:`** 里 —— 我们自己的包 `agenia-injector` 有一模一样的 `dsh.bundle.patch`。
 * ⇒ 挂载回到**我们自己的包**，形状照官方，**C 盘一个字节都不用动**。
 * ⇒ 两个用例的载体从 profile 补丁换回 **`presets/agenia/cordis.patch.yml`**，语义一个字没变。
 *
 * ── 验收口径（与实现岗约定的那一行；两个用例合起来逐条判）──────────────────────────
 *   `顶层 - insert: 1 个 · 直接成员 3 条（1 宿主 + 2 预设入口）` · `宿主级行 1 条` ·
 *   `预设体内客户端 UI 行 0 条` · `agenia-dashboard` 在整份文件里**恰好出现 1 次**。
 *   ⇒ `DASH-15` 判"那一行在 insert 里 + 包声明齐全 + Node 入口在"；`DASH-16` 判"预设体里一条
 *     客户端 UI 行都没有 + 那一行恰好一次"。形状的四条读数在 `DASH-15` 的 `DASH-TOP-INSERT-SHAPE`。
 *
 * ── `DASH-15` 判什么（缺一条就不算交活）──────────────────────────────────────────
 *   ⓪ **读取器覆盖**（红）：`parseYamlSubset` 对这份补丁 `warnings` 必须为空，而且
 *      "最后一条顶层 item"必须与**逐行扫原文**那把独立的尺子给出同一个键（`DASH-RULER-BROKEN`）。
 *      为什么：`BOOT-02` 曾经因为一份多行 plain scalar 从第 45 行起整段盲掉 ⇒ "读不到"伪装成"不在"。
 *      那份文件不在这棵树里，但**这个洞的判法在这份补丁上同样要站住**。
 *   ① **顶层 insert 的形状**（`DASH-TOP-INSERT-SHAPE`）：恰好 1 个顶层 `- insert:`；顶层没有
 *      别的条目；里面恰好 2 条 `@deepseek-ai/dsh-agent-preset`；宿主级行**至多 1 条**，
 *      而且那一条必须是看板包那一份。
 *   ② **看板那一行**：
 *      · 整份补丁里没有任何一行解析到看板包 ⇒ `DASH-ROW-ABSENT`（**红**：缺席是关于产品的事实，
 *        不是"我读不到"）；
 *      · 它在、但不是顶层 `- insert:` 的直接成员（预设体 / 顶层 override）⇒ `DASH-NOT-HOST-LEVEL`；
 *      · 它是直接成员但 `disabled: true` ⇒ `DASH-ROW-DISABLED`；
 *      · `name` 指不到包 / 包没声明 `dsh.client.platform: web` / 没 `exports["./client"]` /
 *        没 `config.root` / **包自己的 Node 入口文件不在盘上** ⇒ `DASH-NO-CLIENT-DECL`（报文各自点名）。
 *      🔴 认它**不认 id / 名字形状** —— 靠"那份 `package.json` 是不是看板包那一份"（那才是宿主建表用的身份）。
 *   ③ **真字节阳性对照（翻面）**：拿**已提交那份**（回滚期 = 那一行 `disabled` 住在两份预设体里）
 *      当 `before`：必须是**红**；把那一行**搬进顶层 insert**（`withHostRowInTopInsert()`，只搬这一行、
 *      其余字节不动）当 `fixture`：必须是**绿**，而且四条验收读数逐条命中。
 *      → `DASH-KNIFE-VECTOR`（刀翻错面 / 夹具造不出来）。
 *   ④ **派生物**（这一腿**不是**挂载面，是同一份票依赖的另一条不变量，原样保留）：
 *      生成的 `presets/agenia/cordis.patch.yml` 必须**等于** `.tools/make-bundle-patch.mjs` 从
 *      `agent.cordis.yml` 造出来的那一份 —— **跑仓库自己的 `--check`**。
 *      🔴 `--check` 的 **exit 1 有四个意思**，本格分开报：
 *        `E_PATCH_NOT_DERIVED`（盘上 ≠ 派生物）⇒ `DASH-PATCH-NOT-DERIVED`；
 *        其余 `E_PATCH_*`（是派生物、但派生物自己的结构 / 层归属不对）⇒ `DASH-PATCH-STRUCTURE-WRONG`；
 *        `E_BUNDLE_*`（组合本体过不了生成器的联锁，`build()` 就 throw）⇒ `DASH-PATCH-COMPOSITION-REJECTED`；
 *        其余（带栈 / 被信号杀 / 退出码与报文打架）⇒ `DASH-PATCH-DERIVE-CRASH`（"没给出判词"）。
 *      跑之前一道安全联锁（`--check` 分支必须先于写盘），跑完再量一次活体 sha256（变了 ⇒ `…-CHECK-WROTE-PRESET`）。
 *      三把刀各造一个 exit 1 的原因（副本上改一个值 / 副本生成器多产一条宿主级行 / 副本组合过不了联锁）。
 *
 * ── `DASH-16` 判什么（语义面：不读标记、不读点名表、不认行 id）──────────────────
 *   ⓪ 同一份读取器覆盖（见 `DASH-15` ⓪）。
 *   ① **预设体里不许有客户端 UI 行**：对补丁里**每一行**（带 `name` 的映射）用 `name` 解析到盘上的
 *      `package.json`（路径形真解析；裸包名按 `manifestRoots` 的 `package.json.name` 匹配），
 *      只要那个包声明 `dsh.client.platform: "web"` 却住在某条预设的 `config.plugins` 子树里
 *      ⇒ `DASH-CLIENT-IN-PRESET`（**红**；`disabled: true` 也不算合规）。
 *   ② **顶层 override 里也不许有**（既不在 insert、也不在预设）⇒ `DASH-CLIENT-OUTSIDE-INSERT`。
 *   ③ **看板那一行恰好一次**：语义计数 + 文件里 `- id: agenia-dashboard` 的文本出现次数
 *      ⇒ 否则 `DASH-HOST-ROW-COUNT`（多一份就多一个 Node 写者，"装上了没有"没有唯一答案）。
 *   🔴 **解析不到的预设行只进读数**（`unresolved_in_preset`）：两份预设体里六十来行框架裸包名，
 *      真身在 `app.asar` 里，这棵树解析不到 ⇒ 对它们记 HOLD 会让本格**每一次都挂起 60 条**
 *      （`cand-20261019-0042` 那个病）。fail-closed 的判定在生成器那一侧
 *      （`E_BUNDLE_CLIENT_UI_UNRESOLVED` / `E_BUNDLE_CLIENT_UI_IN_PRESET`）。
 *   ④ **翻面**：只存在于夹具里的合成包 + 合成行 —— 放进顶层 insert ⇒ 干净；放进**任一份**预设体
 *      ⇒ **只有** `DASH-CLIENT-IN-PRESET`；**裸包名**（`manifestRoots` 索引解析得到 web 包）放进预设体
 *      ⇒ 同一个码（证明解析面不只认路径形）；放进顶层 override ⇒ **只有** `DASH-CLIENT-OUTSIDE-INSERT`；
 *      看板行缺席 ⇒ **只有** `DASH-HOST-ROW-COUNT`；看板行 insert + 预设各一份 ⇒ 同一个码 + 预设那一条。
 *      刀翻错面 ⇒ `DASH-KNIFE-VECTOR`；夹具行解析不到它自己的包 / 在生产输入里留了登记痕迹 ⇒
 *      `DASH-KNIFE-UNREADABLE`（尺子坏了不是对象坏了）。
 *
 * ── 备用路线（profile 层）：**只读数，不产码** ────────────────────────────────────
 * `.tools/mount-dashboard-profile.mjs` 留着当第二选择（`--check/--apply/--revert` 都验过）。
 * 它那条路线现在**不是**判据载体：profile 补丁里按设计没有看板那一行。这里只落一个
 * `rec.readings.alternate_route = {available, mounted}` —— 用两份合成文本证明这个读数能翻面
 * （有一行 ⇒ true，没有 ⇒ false），**不进判词**。两套码同时声称"挂载没做"是明令禁止的；
 * 那一族码的墓碑写在 `support/client-ui-placement.mjs` 的文件头。
 *
 * ── 不判什么 ────────────────────────────────────────────────────────────────────
 *   · 不判像素 / 界面（"点开有没有那块面板"归 GUI 清单，人点一次）；
 *   · 不判浏览器真的收到了包（那要真宿主；`BOOT-02` 判那两条读数）；
 *   · 不判 `view.json` 的内容（`DASH-11` / `DASH-12` 管数据链）。
 *
 * 🔴 **读数绑在树上**：每个读数带 `{repo, head, 文件 sha256/字节/mtime, snapshot_at}`。
 */
import { before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, caseHold, preflight, problem, runCase, runRoot, sha256File } from '../support/evidence.mjs'
import { noteSutOverride } from '../support/dashboard-surface.mjs'
import {
  CODES,
  clientUiPatchFixture,
  profileMountReading,
  scanBundleMount,
  scanClientUiPlacement,
  syntheticClientUiPackage,
  withHostRowInTopInsert,
} from '../support/client-ui-placement.mjs'
import { lastTopLevelKeyByText, profilePatchPath } from '../support/boot-readings.mjs'
import { parseYamlSubset } from '../support/composition.mjs'

before(() => {
  preflight()
})

// ── 落点与码（稳定、可 grep）────────────────────────────────────────────────
/** 挂载的载体：**我们自己的包**的 bundle 补丁。 */
const PATCH_FILE = path.join(PATHS.finalPreset, 'cordis.patch.yml')
const COMPOSITION_FILE = path.join(PATHS.finalPreset, 'agent.cordis.yml')
const GENERATOR_FILE = PATHS.generator
/** 看板包：**行身份靠它认**（不是靠 id、不是靠名字形状）。 */
const DASHBOARD_MANIFEST = path.join(PATHS.finalPreset, 'client-ui-dashboard', 'package.json')
const ROW_ID = 'agenia-dashboard'
const CODE = {
  patchUnreadable: 'DASH-PATCH-UNREADABLE',
  ruler: 'DASH-RULER-BROKEN',
  /** 盘上补丁 ≠ 生成器从组合造出来的那一份（`--check` 的 `E_PATCH_NOT_DERIVED`）。 */
  notDerived: 'DASH-PATCH-NOT-DERIVED',
  /** 补丁**等于**派生物，但派生物自己的结构 / 层归属不对（`E_PATCH_TOP_INSERT_SHAPE` 等）。 */
  structureWrong: 'DASH-PATCH-STRUCTURE-WRONG',
  /** 组合本体过不了生成器的联锁（`build()` 就 throw，`E_BUNDLE_*`）。 */
  compositionRejected: 'DASH-PATCH-COMPOSITION-REJECTED',
  deriveUnavailable: 'DASH-PATCH-CHECK-UNAVAILABLE',
  deriveCrash: 'DASH-PATCH-DERIVE-CRASH',
  checkWrote: 'DASH-PATCH-CHECK-WROTE-PRESET',
  knifeVector: 'DASH-KNIFE-VECTOR',
  knifeUnreadable: 'DASH-KNIFE-UNREADABLE',
}
/** 只存在于夹具里的行 id —— 它不许出现在生产树的任何一份文件里（`knife_registration` 盯着）。 */
const SYNTHETIC_ROW_ID = 'future-client-ui-panel'
/** 只存在于夹具里的**裸包名**（`manifestRoots` 索引解析得到；刀要用它证明解析面不只认路径形）。 */
const SYNTHETIC_BARE_NAME = '@fixture/dsh-client-ui-probe'
/** 一个**解析不到任何包**的裸名（"读不到只进读数"那一格）。 */
const UNRESOLVABLE_BARE_NAME = '@fixture/dsh-client-ui-probe-not-built'

// ── 身份读数（树 + 时间）────────────────────────────────────────────────────
const relOf = (file) => path.relative(PATHS.repo, file).replace(/\\/g, '/')

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

/**
 * ⓪ **读取器覆盖**（两个用例共用）：这份补丁必须被**读全**。
 *   · `warnings` 非空 ⇒ `DASH-PATCH-UNREADABLE`（红：读不懂 ≠ 没有）；
 *   · "最后一条顶层 item" 的两把尺子（解析器 / 逐行扫原文）必须一致 ⇒ 否则 `DASH-RULER-BROKEN`。
 */
function patchReaderReading(patchText, snap) {
  const doc = parseYamlSubset(patchText, 'bundle 补丁·reader')
  const items = Array.isArray(doc.value) ? doc.value : []
  const keyOf = (item) => {
    if (!(item instanceof Map)) return `<${Array.isArray(item) ? 'list' : typeof item}>`
    if (Array.isArray(item.get('insert'))) return 'insert'
    if (typeof item.get('id') === 'string') return `id:${item.get('id')}`
    if (typeof item.get('name') === 'string') return `name:${item.get('name')}`
    return `<map keys=${[...item.keys()].join(',')}>`
  }
  const by_parser = items.length === 0 ? null : keyOf(items[items.length - 1])
  const by_text = lastTopLevelKeyByText(patchText)
  return {
    file: snap.rel,
    bytes: snap.bytes,
    sha256: snap.sha256,
    measured_at: new Date().toISOString(),
    warnings: [...doc.warnings],
    top_level_items: items.length,
    top_level_keys: items.map(keyOf),
    last_top_level_key: { by_parser, by_text, agree: by_text !== null && by_text === by_parser },
  }
}

/** 读取器覆盖的收口（读数落盘 + 两条红）。 */
function applyReader(rec, reader) {
  rec.readings.patch_reader = reader
  if (reader.warnings.length > 0) {
    rec.problems.push(problem(CODE.patchUnreadable,
      `补丁有解析器读不懂的行（${reader.warnings.slice(0, 4).join(' / ')}）—— 层归属判不了（缺 ≠ 坏：这不是"行不在"）`))
  }
  if (reader.last_top_level_key.agree !== true) {
    rec.problems.push(problem(CODE.ruler,
      `"最后一条顶层 item"两把尺子给出不同的键（解析器 ${JSON.stringify(reader.last_top_level_key.by_parser)} · `
      + `逐行扫原文 ${JSON.stringify(reader.last_top_level_key.by_text)}）—— 尺子坏了，这一跑的"不在"不成立`))
  }
}

// ── ③ 派生物：跑仓库自己的生成器检查（不 import：它加载期会写活体）────────────
/**
 * 安全联锁：`--check` 分支必须**在**写盘那一行**之前**。
 * 为什么要有它：`.tools/make-bundle-patch.mjs` 加载期就跑 `build()`；不带 `--check` 时它会
 * `writeFileSync(TARGET)` —— import 一次 / 跑一次错的参数 = **改活体**（派工单明令禁止）。
 * 所以只有当场读到"`--check` → `isCheck` → 先于写盘"这三件事才跑；读不到就 **HOLD**、不跑。
 */
function checkBranchSafe(generatorText) {
  const checkArg = generatorText.indexOf('--check')
  const isCheck = generatorText.indexOf('isCheck')
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

/**
 * 跑一次生成器检查（只读；`--check` 分支在写盘之前已被联锁证明）。
 *
 * 🔴 **`exit 1` 有四个意思**，判词读法（退出码是主信号，生成器打出来的**具名码**是分类依据）：
 *   · `exit 0` ⇒ 一致且结构对（`derived`）；
 *   · `exit 1` + `E_PATCH_NOT_DERIVED` ⇒ 盘上补丁**不是**派生物（`not_derived`）；
 *   · `exit 1` + **其余任何 `E_PATCH_*`** ⇒ **是**派生物，但派生物自己的结构 / 层归属不对
 *     （`structure_wrong`）。⚠️ 这里**不列具体码**：生成器的结构码会随形状改（`E_PATCH_TOP_INSERT_SHAPE`
 *     的参数从"2 条成员"变成"3 条"，新码也会长出来），列清单会让"结构不对"在换版那天静默退化成
 *     `DASH-PATCH-DERIVE-CRASH`。
 *   · `exit 1` + `E_BUNDLE_*` ⇒ 组合本体过不了生成器的联锁（`composition_rejected`）；
 *   · 其余（带栈 / 被信号杀 / 退出码与报文打架）⇒ **没给出判词**（`crashed`）。
 */
function runGeneratorCheck(generatorFile, cwd) {
  const startedAt = new Date().toISOString()
  const r = spawnSync(process.execPath, [generatorFile, '--check'], {
    cwd,
    env: { ...process.env, TEMP: path.join(runRoot(), 'tmp'), TMP: path.join(runRoot(), 'tmp') },
    encoding: 'utf8',
  })
  const stdout = String(r.stdout ?? '')
  const stderr = String(r.stderr ?? '')
  const allPatchCodes = [...new Set(stdout.match(/E_PATCH_[A-Z0-9_]+/g) ?? [])]
  const structureCodes = allPatchCodes.filter((code) => code !== 'E_PATCH_NOT_DERIVED')
  const bundleCodes = [...new Set(stdout.match(/E_BUNDLE_[A-Z0-9_]+/g) ?? [])]
  const exit = r.status
  /** 退出码说绿、报文说 RED ⇒ 两个信号打架（不替它选）。 */
  const contradiction = exit === 0 && /\bRED\b/.test(stdout)
  const derived = exit === 0 && !contradiction
  const cleanExit1 = exit === 1 && stderr.trim() === '' && /\bRED\b/.test(stdout)
  const notDerived = cleanExit1 && allPatchCodes.includes('E_PATCH_NOT_DERIVED')
  const structureWrong = cleanExit1 && !notDerived && structureCodes.length > 0
  const compositionRejected = cleanExit1 && !notDerived && !structureWrong && bundleCodes.length > 0
  return {
    generator: generatorFile,
    cwd,
    exit,
    signal: r.signal ?? null,
    stdout: stdout.trim().slice(0, 2000),
    stderr: stderr.trim().slice(0, 2000),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    derived,
    not_derived: notDerived,
    structure_wrong: structureWrong,
    composition_rejected: compositionRejected,
    contradiction,
    crashed: !derived && !notDerived && !structureWrong && !compositionRejected,
    patch_codes: allPatchCodes,
    structure_codes: structureCodes,
    bundle_codes: bundleCodes,
    word_ok: /\bok\b/.test(stdout),
  }
}

/**
 * **一次 `--check` 结果 → 这一格的判词**（纯函数：活体检查与三把刀走同一条映射，
 * 所以"刀证明了分类会翻面"这句话是关于**判词**的，不只是关于分类函数的）。
 *
 * @returns {{code: string, message: string}[]}  空数组 = 补丁是派生物且结构对
 */
function derivationProblems(check, snaps = {}) {
  const where = snaps.patch === undefined ? '' : `（${whereOf(snaps.patch)}）`
  const compositionRel = snaps.composition?.rel ?? 'agent.cordis.yml'
  if (check.derived) return []
  if (check.not_derived) {
    return [problem(CODE.notDerived,
      `生成补丁与生成器从 \`${compositionRel}\` 造出来的那一份**不一致**（\`make-bundle-patch.mjs --check\` exit ${check.exit} · E_PATCH_NOT_DERIVED）`
      + `：${check.stdout.split('\n')[0]} —— 补丁是派生物，改了 .yml 就跑生成器，别手改${where}`)]
  }
  if (check.structure_wrong) {
    return [problem(CODE.structureWrong,
      `生成补丁**等于**生成器从 \`${compositionRel}\` 造出来的那一份，但那份派生物自己的**结构 / 层归属不对**：`
      + `${JSON.stringify(check.structure_codes)}${where} —— 这不是"谁手改了补丁"（那是 \`${CODE.notDerived}\`），`
      + '是生成器产出的形状坏了（顶层 insert 形状 / 宿主级行的位置与次数 / 预设体里开着的客户端 UI 行 / 白名单外的行）')]
  }
  if (check.composition_rejected) {
    return [problem(CODE.compositionRejected,
      `组合本体过不了生成器的联锁（\`build()\` 就 throw：${JSON.stringify(check.bundle_codes)}）—— 补丁根本造不出来。`
      + `stdout=${JSON.stringify(check.stdout.slice(0, 400))}`)]
  }
  return [problem(CODE.deriveCrash,
    `生成器检查没给出判词（exit ${String(check.exit)}${check.signal ? ` · signal ${check.signal}` : ''}${check.contradiction ? ' · 退出码说绿、报文里却有 RED' : ''}）：`
    + `stdout=${JSON.stringify(check.stdout.slice(0, 400))} stderr=${JSON.stringify(check.stderr.slice(0, 400))} —— 判不了不是绿`)]
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

/** 夹具目录（只住运行根）。 */
const fixtureDir = (name, prefix = 'dash15') => {
  const dir = path.join(runRoot(), 'fixtures', `${prefix}-${name}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 造一份"生成器 + 预设树"的副本夹具，供**这一格的刀**用（活树一个字节不动）。
 * 为什么拷整棵树（而不是三份文件）：生成器可能去看包声明 / 别的输入 ——
 * 副本的保真度越高，刀量的越真是"`--check` 会不会翻面"，不是"夹具缺没缺输入"。
 */
function deriveFixture() {
  const dir = fixtureDir('derive')
  const copied = copyTree(PATHS.finalPreset, path.join(dir, 'presets', 'agenia'))
  mkdirSync(path.join(dir, '.tools'), { recursive: true })
  const generator = path.join(dir, '.tools', 'make-bundle-patch.mjs')
  writeFileSync(generator, readFileSync(GENERATOR_FILE))
  return {
    dir,
    generator,
    copied,
    target: path.join(dir, 'presets', 'agenia', 'cordis.patch.yml'),
    composition: path.join(dir, 'presets', 'agenia', 'agent.cordis.yml'),
  }
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

/**
 * 🔴 **刀 E：派生物但结构不对** —— 造一份"生成器自己产出的坏形状"。
 *
 * 为什么必须造在**生成器**上、而不是手改补丁：`--check` 的两个 exit 1 原因是
 *   · `same = false`（盘上 ≠ 派生物）⇒ `E_PATCH_NOT_DERIVED`
 *   · `same = true && fileProblems > 0`（**盘上就是派生物，而派生物自己结构不对**）
 * 手改补丁永远落在第一种 ⇒ 手改**分不开**这两个原因，也就证不了"分开"这件事。
 *
 * 造法：在**副本生成器**的 `preset()` 模板里、`plugins:` 之后插一条**解析不到包的预设行**
 * （裸包名 `@fixture/…`），并把**同一段文本**按同一位置写进副本补丁的两份预设体。
 *   · `build()` 的产物侧计数**不受影响**（1 个 insert / 3 条直接成员 / 2 条预设入口 / 宿主行 1 次）
 *     ⇒ 生成器**造得出**这份派生物；
 *   · `--check` 的 `describePatch()` 会看见"预设体里有一条包解析不出来的行"
 *     ⇒ `E_PATCH_CLIENT_UI_UNRESOLVED` ⇒ 正是"是派生物、但派生物自己结构不对"。
 *
 * ⚠️ 不要改成"往顶层 insert 多插一条宿主行"（前一版就是那么写的）：生成器的**产物侧联锁**
 * 会先 throw（"直接成员应有 3 条，实得 4"），`--check` 于是报"组合过不了联锁"，
 * 这一刀就退化成 `DASH-PATCH-COMPOSITION-REJECTED` —— 量不到 `structure_wrong` 那一格。
 *
 * 夹具的保真度自证：`same` 只有在我们算出来的文本与生成器**逐字**相同时才成立；
 * 若两处插的不是同一段（或生成器模板变了），`--check` 会退成 `not_derived` / 别的分类 ——
 * 那时这一格报 `DASH-KNIFE-UNREADABLE`（**尺子坏了不是对象坏了**），绝不假装翻面。
 *
 * @param {{patchText: string}} input 活树那份补丁原文（派生物；`derived === true` 时才用它）
 */
function wrongShapeDerivativeFixture({ patchText }) {
  const dir = fixtureDir('derive-wrong-shape')
  const copied = copyTree(PATHS.finalPreset, path.join(dir, 'presets', 'agenia'))
  mkdirSync(path.join(dir, '.tools'), { recursive: true })
  const generator = path.join(dir, '.tools', 'make-bundle-patch.mjs')
  /** 两条 10 格缩进的行（预设体里的一行）；裸包名 = 解析不到包。 */
  const KNIFE_ROW_LINES = [
    '          - id: knife-client-row',
    "            name: '@fixture/knife-unresolved-row'",
  ]
  const KNIFE_BLOCK = KNIFE_ROW_LINES.join('\n')
  const source = readFileSync(GENERATOR_FILE, 'utf8')
  /** 生成器模板：`preset()` 里 `'        plugins:',` 与 `body,` 之间（两份预设都走这个 helper）。 */
  const GENERATOR_ANCHOR = "    '        plugins:',\n    body,\n"
  const PATCH_ANCHOR = '\n        plugins:\n'
  const generatorHits = source.split(GENERATOR_ANCHOR).length - 1
  const patchHits = String(patchText).split(PATCH_ANCHOR).length - 1
  const usable = generatorHits === 1 && patchHits === 2
  let generatorText = source
  let patchOut = String(patchText)
  if (usable) {
    generatorText = source
      .replace('const preset = (id, name, description, order, body) => [', `const KNIFE_ROW_LINES = ${JSON.stringify(KNIFE_ROW_LINES)}\n\n  const preset = (id, name, description, order, body) => [`)
      .replace(GENERATOR_ANCHOR, `    '        plugins:',\n    ...KNIFE_ROW_LINES,\n    body,\n`)
    patchOut = String(patchText).split(PATCH_ANCHOR).join(`${PATCH_ANCHOR}${KNIFE_BLOCK}\n`)
  }
  writeFileSync(generator, generatorText, 'utf8')
  const target = path.join(dir, 'presets', 'agenia', 'cordis.patch.yml')
  writeFileSync(target, patchOut, 'utf8')
  return {
    dir,
    generator,
    copied,
    target,
    mutation: {
      how: '副本生成器的两份预设里各多产一条"包解析不出来"的行（裸包名），并把同一段文本写进副本补丁的两份预设体',
      row: KNIFE_BLOCK,
      generator_anchor_hits: generatorHits,
      patch_anchor_hits: patchHits,
      /** 模板各**恰好**一处、补丁**恰好**两处（两份预设）才算"两处是同一段"；否则这把刀量不了。 */
      usable,
    },
  }
}

/** 一个"包不声明 dsh.client"的夹具包（刀）—— 目录名保持 `client-ui-dashboard`，好让路径形 name 仍成立。 */
function packageWithoutClientDecl() {
  const dir = fixtureDir('no-client-decl')
  const pkgDir = path.join(dir, 'client-ui-dashboard')
  mkdirSync(path.join(pkgDir, 'lib'), { recursive: true })
  const real = JSON.parse(readFileSync(DASHBOARD_MANIFEST, 'utf8'))
  const { dsh, ...rest } = real
  writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify({ ...rest, dsh: {} }, null, 2)}\n`, 'utf8')
  writeFileSync(path.join(pkgDir, 'lib', 'index.js'), '// fixture: 这个包没有 dsh.client\n', 'utf8')
  return { dir: pkgDir, manifest: path.join(pkgDir, 'package.json'), name: `file:///${pkgDir.replace(/\\/g, '/')}/lib/index.js` }
}

/** 一个声明了 `dsh.client.platform: web` 但**没有** `exports["./client"]` 的夹具包（刀）。 */
function packageWithoutClientExport() {
  const dir = fixtureDir('no-client-export')
  const pkgDir = path.join(dir, 'client-ui-dashboard')
  mkdirSync(path.join(pkgDir, 'lib'), { recursive: true })
  const real = JSON.parse(readFileSync(DASHBOARD_MANIFEST, 'utf8'))
  const { ['./client']: dropped, ...exportsRest } = real.exports ?? {}
  writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify({ ...real, exports: exportsRest }, null, 2)}\n`, 'utf8')
  writeFileSync(path.join(pkgDir, 'lib', 'index.js'), '// fixture: 这个包没有 exports["./client"]\n', 'utf8')
  return { dir: pkgDir, manifest: path.join(pkgDir, 'package.json'), name: `file:///${pkgDir.replace(/\\/g, '/')}/lib/index.js` }
}

/** 一个声明齐全、但 **Node 入口文件不在盘上**的夹具包（刀）。 */
function packageWithoutEntry() {
  const dir = fixtureDir('no-entry')
  const pkgDir = path.join(dir, 'client-ui-dashboard')
  mkdirSync(path.join(pkgDir, 'lib'), { recursive: true })
  const real = JSON.parse(readFileSync(DASHBOARD_MANIFEST, 'utf8'))
  writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify(real, null, 2)}\n`, 'utf8')
  // 故意不写 lib/index.js —— 包声明说入口在那，盘上没有。
  return { dir: pkgDir, manifest: path.join(pkgDir, 'package.json'), name: `file:///${pkgDir.replace(/\\/g, '/')}/lib/index.js` }
}

/**
 * 🔴 **刀 F：组合本体过不了联锁**（`E_BUNDLE_*`）—— 这一类**也**会被旧读法报成"不是派生物"。
 *
 * 手法：在**副本组合**末尾加一条**路径形客户端 UI 行**（不带标记、不在白名单）⇒ 副本生成器的
 * `build()` 在摘宿主级行 / 组装预设时 throw `E_BUNDLE_CLIENT_UI_IN_PRESET`，
 * 而 `--check` 把 throw 变成 `RED …` + `exit 1`（stderr 为空）⇒ 旧读法（`exit 1 && stderr 空 && RED`）
 * 会把它报成 `DASH-PATCH-NOT-DERIVED`；新读法按具名码报 `DASH-PATCH-COMPOSITION-REJECTED`。
 *
 * @param {{dir: string, composition: string}} fixture `deriveFixture()` 的产物
 */
function compositionRejectedFixture(fixture) {
  const text = readFileSync(fixture.composition, 'utf8')
  const injected = `${text.endsWith('\n') ? text : `${text}\n`}- id: knife-bundle-client-ui\n  name: './client-ui-dashboard/lib/index.js'\n`
  writeFileSync(fixture.composition, injected, 'utf8')
  return { how: '副本组合末尾加一条路径形客户端 UI 行（不带标记、不在白名单）⇒ build() throw', bytes_delta: Buffer.byteLength(injected, 'utf8') - Buffer.byteLength(text, 'utf8') }
}

// ── 历史字节：回滚期那一版补丁（"before" 的真字节来源）──────────────────────────
/**
 * 找**最近一次提交里、看板那一行还没住进顶层 insert 的那一版**补丁。
 *
 * 为什么这样做：`before` 必须是**真字节**，而且必须是"挂载还没做"的那个形状 —— 不能靠
 * "我看了一眼现在的树"（实现岗随时会落地，落地之后那个形状就没了）。判据只看形状性质
 * （那一行不是顶层 insert 的直接成员），不看提交标题，也不挑"哪一版会红"。
 *
 * 只在有 `.git` 的树上可用；副本里如实记 `available: false`（`before` 那一腿记 HOLD，不当绿）。
 */
function preChangePatch({ limit = 6 } = {}) {
  const gitMark = path.join(PATHS.repo, '.git')
  if (!existsSync(gitMark)) return { available: false, why: '这棵树没有 .git（副本）⇒ 拿不到历史字节' }
  const log = spawnSync('git', ['log', `-${limit}`, '--format=%H', '--', 'presets/agenia/cordis.patch.yml'], { cwd: PATHS.repo, encoding: 'utf8' })
  if (log.status !== 0) return { available: false, why: `git log 失败：${String(log.stderr ?? '').trim()}` }
  const shas = String(log.stdout ?? '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '')
  const tried = []
  for (const sha of shas) {
    const show = spawnSync('git', ['show', `${sha}:presets/agenia/cordis.patch.yml`], { cwd: PATHS.repo, encoding: 'utf8' })
    if (show.status !== 0) {
      tried.push({ sha, ok: false, why: String(show.stderr ?? '').trim().slice(0, 160) })
      continue
    }
    const text = String(show.stdout ?? '')
    const probe = scanBundleMount({ patchText: text, label: `HEAD~${tried.length}·探针`, manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID })
    const dash = probe.reading.dashboard
    const isPreShape = dash.occurrences > 0 && !dash.rows.some((r) => r.placement === 'insert')
    tried.push({ sha, ok: isPreShape, occurrences: dash.occurrences, placements: dash.rows.map((r) => r.placement) })
    if (isPreShape) return { available: true, sha, text, tried }
  }
  return { available: false, why: `最近 ${shas.length} 次提交里没有"那一行不在顶层 insert"的版本`, tried }
}

// ═══════════════════════════════════════════════════════════════════════════
// DASH-15
// ═══════════════════════════════════════════════════════════════════════════
test('DASH-15 面板装上了没有（bundle 层）：顶层 insert 里那一行 + 行体/包/Node 入口 + 真字节翻面 + 派生物', async () => {
  await runCase('DASH-15', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    rec.readings.tree = treeIdentity()

    // ── ⓪ 文件身份 ─────────────────────────────────────────────────────────────
    const patchSnap = snapshotOf(PATCH_FILE)
    const compositionSnap = snapshotOf(COMPOSITION_FILE)
    const generatorSnap = snapshotOf(GENERATOR_FILE)
    rec.readings.files = { patch: patchSnap, composition: compositionSnap, generator: generatorSnap }
    rec.readings.dashboard_package = dashboardPackageFacts(DASHBOARD_MANIFEST)
    if (!patchSnap.exists) {
      problems.push(problem(CODE.patchUnreadable, `bundle 补丁不在盘上（${whereOf(patchSnap)}）—— 挂载面没有对象（缺 ≠ 坏 ≠ 空）`))
      caseFail(problems)
      return
    }
    const liveText = readFileSync(PATCH_FILE, 'utf8')
    rec.readings.patch_sha256 = patchSnap.sha256
    applyReader(rec, patchReaderReading(liveText, patchSnap))

    // ── ① 活树：这一行现在到底装上了没有 ───────────────────────────────────────
    const live = scanBundleMount({
      patchText: liveText, label: 'bundle 补丁（活树）', manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
    })
    rec.readings.mount = live.reading
    rec.readings.live_codes = live.problems.map((p) => p.code)
    for (const p of live.problems) problems.push(p)

    // ── ② 真字节翻面：回滚期那版（before ⇒ 红）→ 把那一行搬进顶层 insert（fixture ⇒ 绿）──
    try {
      const pre = preChangePatch()
      rec.readings.before = pre.available
        ? { sha: pre.sha, tried: pre.tried, note: '最近一次"那一行还没住进顶层 insert"的提交（真字节）' }
        : { available: false, why: pre.why, tried: pre.tried ?? null }
      if (!pre.available) {
        caseHold(rec, CODE.knifeUnreadable, `"before" 那一腿拿不到真字节（${pre.why}）—— 翻面只在合成刀上证过；这一格记 HOLD（不是绿）`)
      } else {
        const beforeScan = scanBundleMount({
          patchText: pre.text, label: 'before（回滚期那版真字节）', manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
        })
        const fixture = withHostRowInTopInsert({
          patchText: pre.text, manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
        })
        const fixtureFile = path.join(fixtureDir('acceptance', 'dash15'), 'cordis.patch.yml')
        writeFileSync(fixtureFile, fixture.text, 'utf8')
        const fixtureSnap = snapshotOf(fixtureFile)
        const afterScan = scanBundleMount({
          patchText: fixture.text, label: 'fixture（before + 那一行搬进顶层 insert）', manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
        })
        rec.readings.flip = {
          before: {
            text_chars: pre.text.length,
            codes: beforeScan.problems.map((p) => p.code),
            shape: shapeOf(beforeScan.reading),
            note: beforeScan.problems.length > 0 ? '回滚期形状 ⇒ 红' : '⚠️ 这一版竟然是绿（历史字节选错了）',
          },
          fixture: {
            path: fixtureFile, rel: fixtureSnap.rel, bytes: fixtureSnap.bytes, sha256: fixtureSnap.sha256,
            moved: fixture.moved, why: fixture.why, removed_blocks: fixture.removed_blocks, added_block: fixture.added_block,
            codes: afterScan.problems.map((p) => p.code),
            shape: shapeOf(afterScan.reading),
          },
          /** 只搬了这一行：**非看板行**的 id 多重集必须逐字相同（其余字节不动的证据）。 */
          other_rows_unchanged: JSON.stringify(stripDashboard(beforeScan.reading.row_ids)) === JSON.stringify(stripDashboard(afterScan.reading.row_ids)),
        }
        if (!(beforeScan.problems.length > 0)) {
          problems.push(problem(CODE.knifeVector,
            `"before"（提交 ${pre.sha.slice(0, 12)}…，回滚期那版真字节）居然是绿的 —— 这一格选错了历史字节，翻面证据不成立`))
        }
        if (afterScan.problems.length > 0) {
          problems.push(problem(CODE.knifeVector,
            `"fixture"（before + 那一行搬进顶层 insert）应当干净，实得 ${JSON.stringify(afterScan.problems.map((p) => p.code))}`
            + `（${afterScan.problems.map((p) => p.message).join(' / ')}）—— 验收形状过不了自己的判据：先修尺子`))
        }
        const acceptance = shapeOf(afterScan.reading)
        const want = { insert_blocks: 1, insert_members: 3, preset_entries: 2, host_members: 1, dashboard_in_insert: 1, dashboard_in_preset: 0, text_hits: 1 }
        rec.readings.acceptance = { want, got: acceptance }
        if (JSON.stringify(acceptance) !== JSON.stringify(want)) {
          problems.push(problem(CODE.knifeVector,
            `"fixture"的验收读数与约定的那一行不一致：实得 ${JSON.stringify(acceptance)}，应当是 ${JSON.stringify(want)}`))
        }
        if (rec.readings.flip.other_rows_unchanged !== true) {
          problems.push(problem(CODE.knifeVector,
            '"fixture" 动了看板行以外的东西（非看板行的 id 多重集变了）—— 那不是"把这一行搬上去"，是重写了一份补丁'))
        }
      }
    } catch (err) {
      problems.push(problem(CODE.knifeUnreadable, `真字节翻面跑不起来：${String(err?.message ?? err)}`))
    }

    // ── ③ 合成刀：每一条红都得能被单独造出来（否则"红"只是装饰）────────────────
    try {
      const pkgDir = fixtureDir('knives', 'dash15')
      const realRow = {
        id: ROW_ID,
        name: `file:///${path.join(PATHS.finalPreset, 'client-ui-dashboard', 'lib', 'index.js').replace(/\\/g, '/')}`,
        root: path.resolve(PATHS.repo).replace(/\\/g, '/'),
      }
      const scan = (text, label) => scanBundleMount({
        patchText: text, label, manifestRoots: [PATHS.finalPreset, pkgDir], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
      })
      const noDecl = packageWithoutClientDecl()
      const noExport = packageWithoutClientExport()
      const noEntry = packageWithoutEntry()
      const fixtures = {
        control: scan(clientUiPatchFixture({ dashboard: 'host', dashboardRow: realRow }), '夹具·正确形状'),
        absent: scan(clientUiPatchFixture({ dashboard: 'absent', dashboardRow: realRow }), '夹具·整行没有'),
        inLeaderPreset: scan(clientUiPatchFixture({ dashboard: 'preset', dashboardRow: { ...realRow, disabled: true } }), '夹具·住进组长预设（关着）'),
        inMemberPreset: scan(clientUiPatchFixture({ dashboard: 'member', dashboardRow: realRow }), '夹具·住进组员预设'),
        topOverride: scan(clientUiPatchFixture({ dashboard: 'top-override', dashboardRow: realRow }), '夹具·顶层 override'),
        disabled: scan(clientUiPatchFixture({ dashboard: 'host', dashboardRow: { ...realRow, disabled: true } }), '夹具·insert 里但关着'),
        noDecl: scan(clientUiPatchFixture({ dashboard: 'host', dashboardRow: { ...realRow, name: noDecl.name } }), '夹具·包没声明 dsh.client'),
        noExport: scan(clientUiPatchFixture({ dashboard: 'host', dashboardRow: { ...realRow, name: noExport.name } }), '夹具·包没 exports["./client"]'),
        noRoot: scan(clientUiPatchFixture({ dashboard: 'host', dashboardRow: { ...realRow, root: '' } }), '夹具·没有 config.root'),
        noEntry: scan(clientUiPatchFixture({ dashboard: 'host', dashboardRow: { ...realRow, name: noEntry.name } }), '夹具·Node 入口文件不在'),
        extraHost: scan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'host', dashboardRow: realRow, syntheticRow: { id: SYNTHETIC_ROW_ID, name: '@deepseek-ai/dsh-persona', root: realRow.root } }), '夹具·insert 里多一条宿主级行'),
        extraTopLevel: scan(`${clientUiPatchFixture({ dashboard: 'host', dashboardRow: realRow })}- id: ui-chat\n  name: "@deepseek-ai/dsh-client-ui-chat"\n  config:\n    transcriptView: detailed\n`, '夹具·顶层多一个 override 条目'),
      }
      rec.readings.fixtures = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [
        k, { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), shape: shapeOf(v.reading) },
      ]))
      const codesOf = (name) => fixtures[name].problems.map((p) => p.code)
      if (codesOf('control').length !== 0) {
        problems.push(problem(CODE.ruler, `合成的"正确形状"被判出 ${JSON.stringify(codesOf('control'))} —— 判据连正确形状都过不了：先修尺子`))
      }
      const expect = [
        ['absent', CODES.rowAbsent],
        ['inLeaderPreset', CODES.notHostLevel],
        ['inMemberPreset', CODES.notHostLevel],
        // 顶层 override **同时**是两个事实：顶层多出一个不是 insert 的条目 + 那一行不在宿主装载层。
        ['topOverride', [CODES.topInsertShape, CODES.notHostLevel]],
        ['disabled', CODES.rowDisabled],
        ['noDecl', CODES.noClientDecl],
        ['noExport', CODES.noClientDecl],
        ['noRoot', CODES.noClientDecl],
        ['noEntry', CODES.noClientDecl],
        ['extraHost', CODES.topInsertShape],
        ['extraTopLevel', CODES.topInsertShape],
      ]
      for (const [name, code] of expect) {
        const want = Array.isArray(code) ? code : [code]
        const got = [...codesOf(name)].sort()
        if (JSON.stringify(got) !== JSON.stringify([...want].sort())) {
          problems.push(problem(CODE.knifeVector, `刀 ${name} 翻出来的面是 ${JSON.stringify(codesOf(name))}，应当是 ${JSON.stringify(want)}`))
        }
      }
      // 夹具自己必须解析得动（不然刀量的是夹具坏，不是判据坏）
      for (const [name, v] of Object.entries(fixtures)) {
        if (v.reading.warnings.length > 0) {
          problems.push(problem(CODE.ruler, `夹具 ${name} 有解析器读不懂的行（${v.reading.warnings.slice(0, 3).join(' / ')}）—— 这一跑的翻面证据不成立`))
        }
      }
      // 阳性腿：真包那三格必须真的在，否则"包声明 / 入口"那几刀没有对象
      const realPkg = rec.readings.dashboard_package
      if (realPkg.exists !== true || realPkg.platform !== 'web' || realPkg.exports_client !== true) {
        problems.push(problem(CODE.ruler, `看板包自己的声明读不到（${JSON.stringify(realPkg)}）—— 行体那几刀的阳性面不成立`))
      }
      rec.readings.fixture_packages = {
        no_decl: noDecl.manifest, no_export: noExport.manifest, no_entry: noEntry.manifest,
        entries_exist: { no_decl: existsSync(path.join(noDecl.dir, 'lib', 'index.js')), no_export: existsSync(path.join(noExport.dir, 'lib', 'index.js')), no_entry: existsSync(path.join(noEntry.dir, 'lib', 'index.js')) },
      }
    } catch (err) {
      problems.push(problem(CODE.ruler, `合成夹具造不出来：${String(err?.message ?? err)} —— 这一跑的翻面证据不成立`))
    }

    // ── ④ 派生物（活树 = 生成器从组合造出来的那一份）────────────────────────────
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
        for (const p of derivationProblems(liveCheck, { patch: patchSnap, composition: compositionSnap })) problems.push(p)
        // 跑完再量一次：这一格绝对不能写活体（写了就是最坏的那件事）。
        const after = snapshotOf(PATCH_FILE)
        rec.readings.derivation.patch_after = after
        if (after.sha256 !== patchSnap.sha256) {
          problems.push(problem(CODE.checkWrote,
            `生成器检查跑完之后活体补丁变了：${patchSnap.bytes} B/${String(patchSnap.sha256).slice(0, 12)}… → ${after.bytes} B/${String(after.sha256).slice(0, 12)}…`
            + ' —— 这个用例只许只读；先查生成器的 `--check` 分支（安全联锁没拦住）'))
        }

        /**
         * 🔴 **三把刀，各造一个 exit 1 的原因**：
         *   · 刀 D（`notDerived`）：在副本上**手改一个值** ⇒ `same = false`；
         *   · 刀 E（`structureWrong`）：改**副本生成器**让它在顶层 insert 多产一条宿主级行、
         *     并把同一段文本写进副本补丁 ⇒ `same = true`、`fileProblems > 0`；
         *   · 刀 F（`compositionRejected`）：副本组合过不了 `build()` 的联锁。
         * 三把刀**都必须走 `derivationProblems()`** —— 证的是**判词**会翻面。
         */
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
            } else if (JSON.stringify(derivationProblems(flipped).map((p) => p.code)) !== JSON.stringify([CODE.notDerived])) {
              problems.push(problem(CODE.knifeVector,
                `刀 D（手改一个值）经判词映射得到 ${JSON.stringify(derivationProblems(flipped).map((p) => p.code))}，应当只有 ${JSON.stringify([CODE.notDerived])}`))
            }
          } else {
            caseHold(rec, CODE.knifeUnreadable, '这一跑的补丁本来就不是派生物（真补丁已经红了）⇒ 刀 D 分不清"手改"与"还没重跑生成器"，不拿它当证据')
          }

          // 刀 E：派生物**一致**但结构不对 ⇒ 必须是 structureWrong，不许是 notDerived。
          const shapeFix = wrongShapeDerivativeFixture({ patchText: readFileSync(PATCH_FILE, 'utf8') })
          const shapeCheck = shapeFix.mutation.usable ? runGeneratorCheck(shapeFix.generator, shapeFix.dir) : null
          rec.readings.derivation.knife_structure = {
            fixture: shapeFix.dir,
            mutation: shapeFix.mutation,
            check: shapeCheck,
            verdict_codes: shapeCheck === null ? null : derivationProblems(shapeCheck).map((p) => p.code),
            /** **对照读数（不是判据）**：旧读法 `exit 1 && stderr 空 && RED` 会把这个结果报成什么。 */
            legacy_rule: shapeCheck === null ? null : {
              rule: 'exit === 1 && stderr.trim() === "" && /\\bRED\\b/ ⇒ not_derived',
              would_report: shapeCheck.exit === 1 && shapeCheck.stderr.trim() === '' && /\bRED\b/.test(shapeCheck.stdout)
                ? CODE.notDerived
                : '(没给出判词)',
            },
          }
          if (!shapeFix.mutation.usable) {
            problems.push(problem(CODE.knifeUnreadable,
              `刀 E 的夹具造不出来：两处锚点（副本生成器的模板 / 补丁原文的顶层 \`- insert:\`）各应恰好 1 处，`
              + `实得 ${shapeFix.mutation.generator_anchor_hits} / ${shapeFix.mutation.patch_anchor_hits} —— 这一把刀量不了`))
          } else if (!shapeCheck.structure_wrong) {
            problems.push(problem(CODE.knifeUnreadable,
              `刀 E（副本生成器在两份预设里各多产一条解析不到包的行）没有让 \`--check\` 报"是派生物、但结构不对"：`
              + `exit ${String(shapeCheck.exit)} · not_derived=${shapeCheck.not_derived} · codes=${JSON.stringify(shapeCheck.patch_codes)}`
              + ` · stdout=${JSON.stringify(shapeCheck.stdout.slice(0, 300))} —— 两处插的不是同一段文本，或者生成器的 "--check" 判法变了`))
          } else {
            const codes = derivationProblems(shapeCheck).map((p) => p.code)
            if (JSON.stringify(codes) !== JSON.stringify([CODE.structureWrong])) {
              problems.push(problem(CODE.knifeVector,
                `刀 E（派生物但结构不对）经判词映射得到 ${JSON.stringify(codes)}，应当只有 ${JSON.stringify([CODE.structureWrong])}`
                + ' —— 不许把"结构不对"报成"不是派生物"'))
            }
          }

          // 刀 F：组合本体过不了联锁 ⇒ 第三个原因（也曾经被报成"不是派生物"）
          const compFix = deriveFixture()
          const compMutation = compositionRejectedFixture(compFix)
          const compCheck = runGeneratorCheck(compFix.generator, compFix.dir)
          const compCodes = derivationProblems(compCheck).map((p) => p.code)
          rec.readings.derivation.knife_composition = { fixture: compFix.dir, mutation: compMutation, check: compCheck, verdict_codes: compCodes }
          if (!compCheck.composition_rejected) {
            problems.push(problem(CODE.knifeUnreadable,
              `刀 F（${compMutation.how}）没有让 \`--check\` 报"组合过不了联锁"：exit ${String(compCheck.exit)}`
              + ` · not_derived=${compCheck.not_derived} · bundle_codes=${JSON.stringify(compCheck.bundle_codes)}`
              + ` · stdout=${JSON.stringify(compCheck.stdout.slice(0, 300))} —— 这一把刀量不了`))
          } else if (JSON.stringify(compCodes) !== JSON.stringify([CODE.compositionRejected])) {
            problems.push(problem(CODE.knifeVector,
              `刀 F（组合过不了联锁）经判词映射得到 ${JSON.stringify(compCodes)}，应当只有 ${JSON.stringify([CODE.compositionRejected])}`))
          }
        } catch (err) {
          problems.push(problem(CODE.knifeUnreadable, `派生刀跑不起来：${String(err?.message ?? err)}`))
        }
      }
    }

    // ── 备用路线：profile 层只读数、不产码（两份合成文本证明它能翻面）────────────
    try {
      const profilePath = profilePatchPath()
      const profileText = existsSync(profilePath.path) ? readFileSync(profilePath.path, 'utf8') : null
      const dashName = rec.readings.dashboard_package?.name ?? null
      const rowName = live.reading.dashboard.rows[0]?.name ?? (dashName === null ? null : `file:///${path.join(PATHS.finalPreset, 'client-ui-dashboard', 'lib', 'index.js').replace(/\\/g, '/')}`)
      const synth = rowName === null ? null : {
        mounted: `- id: ui-chat\n  name: "@deepseek-ai/dsh-client-ui-chat"\n  config:\n    transcriptView: detailed\n- insert:\n    - name: '${rowName}'\n      config:\n        root: '${path.resolve(PATHS.repo).replace(/\\/g, '/')}'\n`,
        absent: '- id: ui-chat\n  name: "@deepseek-ai/dsh-client-ui-chat"\n  config:\n    transcriptView: detailed\n',
      }
      rec.readings.alternate_route = {
        tool: '.tools/mount-dashboard-profile.mjs（第二选择；它自己的 --check 是那条路线的检查器）',
        verdict_power: 'none（不进判词：profile 补丁里按设计没有看板那一行；两套码同时声称"挂载没做"是禁止的）',
        live: profileMountReading({ patchText: profileText, dashboardManifest: DASHBOARD_MANIFEST }),
        synth_mounted: synth === null ? null : profileMountReading({ patchText: synth.mounted, dashboardManifest: DASHBOARD_MANIFEST }),
        synth_absent: synth === null ? null : profileMountReading({ patchText: synth.absent, dashboardManifest: DASHBOARD_MANIFEST }),
      }
      const flipOk = rec.readings.alternate_route.synth_mounted?.mounted === true
        && rec.readings.alternate_route.synth_absent?.mounted === false
      if (synth !== null && !flipOk) {
        problems.push(problem(CODE.ruler, '备用路线的读数翻不动面（合成一份有那一行 ⇒ 应为 true；没有 ⇒ 应为 false）—— 那个读数没有信息量'))
      }
    } catch (err) {
      problems.push(problem(CODE.ruler, `备用路线读数跑不起来：${String(err?.message ?? err)}`))
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
      live_mount_ok: live.problems.length === 0,
      live_codes: live.problems.map((p) => p.code),
      derived: derivationVerdict === null ? null : derivationVerdict.derived,
      derivation_outcome: derivationVerdict === null ? null : Object.fromEntries(['derived', 'not_derived', 'structure_wrong', 'composition_rejected', 'crashed']
        .filter((k) => derivationVerdict[k] === true).map((k) => [k, true])),
    }
    caseFail(problems)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DASH-16（第 4 关评审 2026-11-05 的 R-1）：语义面
// ═══════════════════════════════════════════════════════════════════════════
test('DASH-16 客户端 UI 行的层归属（语义面 · bundle 层）：预设体里一条都不许有 + 看板行恰好一次', async () => {
  await runCase('DASH-16', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    rec.readings.tree = treeIdentity()

    const patchSnap = snapshotOf(PATCH_FILE)
    const compositionSnap = snapshotOf(COMPOSITION_FILE)
    rec.readings.files = { patch: patchSnap, composition: compositionSnap }
    if (!patchSnap.exists) {
      problems.push(problem(CODE.patchUnreadable, `bundle 补丁不在盘上：${whereOf(patchSnap)} —— 语义面判不了（缺 ≠ 坏 ≠ 空）`))
      caseFail(problems)
      return
    }
    const liveText = readFileSync(PATCH_FILE, 'utf8')
    applyReader(rec, patchReaderReading(liveText, patchSnap))

    // ── ① 活树：语义面 ─────────────────────────────────────────────────────────
    const live = scanClientUiPlacement({
      patchText: liveText, label: 'bundle 补丁（活树）', manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
    })
    rec.readings.semantics = live.reading
    rec.readings.live_codes = live.problems.map((p) => p.code)
    for (const p of live.problems) problems.push(p)

    // ── ② 真字节阳性对照：同一份"搬上去之后"的补丁，语义面必须干净 ────────────────
    try {
      const pre = preChangePatch()
      const baseText = pre.available ? pre.text : liveText
      const beforeScan = pre.available
        ? scanClientUiPlacement({
          patchText: pre.text, label: 'before（回滚期那版真字节）', manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
        })
        : null
      const fixture = withHostRowInTopInsert({
        patchText: baseText, manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
      })
      const fixtureFile = path.join(fixtureDir('acceptance', 'dash16'), 'cordis.patch.yml')
      writeFileSync(fixtureFile, fixture.text, 'utf8')
      const fixtureSnap = snapshotOf(fixtureFile)
      const afterScan = scanClientUiPlacement({
        patchText: fixture.text, label: 'fixture（before + 那一行搬进顶层 insert）', manifestRoots: [PATHS.finalPreset], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
      })
      rec.readings.before = beforeScan === null
        ? { available: false, why: pre.why, tried: pre.tried ?? null }
        : {
          available: true,
          sha: pre.sha,
          codes: beforeScan.problems.map((p) => p.code),
          dashboard: beforeScan.reading.dashboard,
          note: beforeScan.problems.length > 0 ? '回滚期形状（那一行 disabled 住在两份预设体里）⇒ 红' : '⚠️ 这一版竟然是绿（历史字节选错了）',
        }
      rec.readings.fixture = {
        path: fixtureFile, rel: fixtureSnap.rel, bytes: fixtureSnap.bytes, sha256: fixtureSnap.sha256,
        from: pre.available ? `提交 ${pre.sha.slice(0, 12)}… 那版真字节 + 搬家` : '活树那一份（历史字节不可用）',
        moved: fixture.moved, why: fixture.why,
        codes: afterScan.problems.map((p) => p.code),
        dashboard: afterScan.reading.dashboard,
        client_ui_rows: afterScan.reading.client_ui_rows,
        unresolved_in_preset_count: afterScan.reading.unresolved_in_preset_count,
      }
      if (afterScan.problems.length > 0) {
        problems.push(problem(CODE.knifeVector,
          `"fixture"（验收形状）在语义面上应当干净，实得 ${JSON.stringify(afterScan.problems.map((p) => p.code))}`
          + `（${afterScan.problems.map((p) => p.message).join(' / ')}）—— 先修尺子`))
      }
      if (afterScan.reading.dashboard.occurrences !== 1 || afterScan.reading.dashboard.text_hits !== 1) {
        problems.push(problem(CODE.knifeVector,
          `"fixture" 里看板行的计数不是 1（语义 ${afterScan.reading.dashboard.occurrences} · 文本 ${afterScan.reading.dashboard.text_hits}）—— 验收形状不对`))
      }
    } catch (err) {
      problems.push(problem(CODE.knifeUnreadable, `真字节阳性对照跑不起来：${String(err?.message ?? err)}`))
    }

    // ── ③ 翻面：合成包 + 合成行（只住运行根；活树一个字节不动）────────────────
    try {
      const pkgDir = fixtureDir('client-in-preset', 'dash16')
      const syntheticPkg = syntheticClientUiPackage(pkgDir)
      const realRow = {
        id: ROW_ID,
        name: `file:///${path.join(PATHS.finalPreset, 'client-ui-dashboard', 'lib', 'index.js').replace(/\\/g, '/')}`,
        root: path.resolve(PATHS.repo).replace(/\\/g, '/'),
      }
      const syntheticRow = { id: SYNTHETIC_ROW_ID, name: syntheticPkg.name, root: path.resolve(pkgDir, '..').replace(/\\/g, '/') }
      /** 同一个合成包的**裸包名**那一半（解析面：`manifestRoots` 按 `package.json.name` 索引）。 */
      const syntheticBareRow = { ...syntheticRow, name: syntheticPkg.pkg_name }
      const unresolvableRow = { ...syntheticRow, name: UNRESOLVABLE_BARE_NAME }
      const scan = (text, label) => scanClientUiPlacement({
        patchText: text, label, manifestRoots: [PATHS.finalPreset, pkgDir], dashboardManifest: DASHBOARD_MANIFEST, expectedRowId: ROW_ID,
      })
      const fixtures = {
        control: scan(clientUiPatchFixture({ dashboard: 'host', dashboardRow: realRow }), '夹具·正确形状'),
        syntheticInLeaderPreset: scan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'preset', dashboardRow: realRow, syntheticRow }), '夹具·合成行放进组长预设'),
        syntheticInMemberPreset: scan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'member', dashboardRow: realRow, syntheticRow }), '夹具·合成行放进组员预设'),
        syntheticInTopOverride: scan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'top-override', dashboardRow: realRow, syntheticRow }), '夹具·合成行写成顶层 override'),
        dashboardInLeaderPreset: scan(clientUiPatchFixture({ dashboard: 'preset', dashboardRow: { ...realRow, disabled: true } }), '夹具·看板行在预设体里（关着）'),
        dashboardInMemberPreset: scan(clientUiPatchFixture({ dashboard: 'member', dashboardRow: realRow }), '夹具·看板行在组员预设里'),
        dashboardAbsent: scan(clientUiPatchFixture({ dashboard: 'absent', dashboardRow: realRow }), '夹具·看板行整行没有'),
        dashboardTwice: scan(clientUiPatchFixture({ dashboard: 'preset', synthetic: 'host', dashboardRow: { ...realRow, disabled: true }, syntheticRow: { ...realRow, id: ROW_ID } }), '夹具·看板行 insert 里一份、预设里又一份'),
        bareInLeaderPreset: scan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'preset', dashboardRow: realRow, syntheticRow: syntheticBareRow }), '夹具·预设体里的裸包名（解析得到 web 包）'),
        unresolvedInLeaderPreset: scan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'preset', dashboardRow: realRow, syntheticRow: unresolvableRow }), '夹具·预设体里的裸包名（解析不到任何包）'),
      }
      rec.readings.fixtures = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [
        k, {
          codes: v.problems.map((p) => p.code),
          messages: v.problems.map((p) => p.message),
          dashboard: v.reading.dashboard,
          unresolved_in_preset_count: v.reading.unresolved_in_preset_count,
        },
      ]))
      const codesOf = (name) => fixtures[name].problems.map((p) => p.code)
      const exactly = (got, want) => JSON.stringify([...got].sort()) === JSON.stringify([...want].sort())
      if (codesOf('control').length !== 0) {
        problems.push(problem(CODE.ruler, `合成的"正确形状"被判出 ${JSON.stringify(codesOf('control'))} —— 判据连正确形状都过不了：先修尺子`))
      }
      if (!exactly(codesOf('syntheticInLeaderPreset'), [CODES.clientInPreset])) {
        problems.push(problem(CODE.knifeVector, `刀（合成行放进组长预设）翻出来的面是 ${JSON.stringify(codesOf('syntheticInLeaderPreset'))}，应当只有 ${JSON.stringify([CODES.clientInPreset])}`))
      }
      if (!exactly(codesOf('syntheticInMemberPreset'), [CODES.clientInPreset])) {
        problems.push(problem(CODE.knifeVector, `刀（合成行放进组员预设）翻出来的面是 ${JSON.stringify(codesOf('syntheticInMemberPreset'))}，应当只有 ${JSON.stringify([CODES.clientInPreset])} —— 两份预设体都要算`))
      }
      if (!exactly(codesOf('syntheticInTopOverride'), [CODES.clientOutsideInsert])) {
        problems.push(problem(CODE.knifeVector, `刀（合成行写成顶层 override）翻出来的面是 ${JSON.stringify(codesOf('syntheticInTopOverride'))}，应当只有 ${JSON.stringify([CODES.clientOutsideInsert])}`))
      }
      if (!exactly(codesOf('dashboardInLeaderPreset'), [CODES.clientInPreset])) {
        problems.push(problem(CODE.knifeVector, `刀（看板行在组长预设里、关着）翻出来的面是 ${JSON.stringify(codesOf('dashboardInLeaderPreset'))}，应当只有 ${JSON.stringify([CODES.clientInPreset])} —— "关着"不是合规`))
      }
      if (!exactly(codesOf('dashboardInMemberPreset'), [CODES.clientInPreset])) {
        problems.push(problem(CODE.knifeVector, `刀（看板行在组员预设里）翻出来的面是 ${JSON.stringify(codesOf('dashboardInMemberPreset'))}，应当只有 ${JSON.stringify([CODES.clientInPreset])}`))
      }
      if (!exactly(codesOf('dashboardAbsent'), [CODES.hostRowCount])) {
        problems.push(problem(CODE.knifeVector, `刀（看板行整行没有）翻出来的面是 ${JSON.stringify(codesOf('dashboardAbsent'))}，应当只有 ${JSON.stringify([CODES.hostRowCount])}`))
      }
      if (!exactly(codesOf('dashboardTwice'), [CODES.hostRowCount, CODES.hostRowCount, CODES.clientInPreset])) {
        problems.push(problem(CODE.knifeVector, `刀（看板行 insert 一份 + 预设一份）翻出来的面是 ${JSON.stringify(codesOf('dashboardTwice'))}，应当是 ${JSON.stringify([CODES.hostRowCount, CODES.clientInPreset])}`))
      }
      // 🔴 解析面不只认路径形：**裸包名**解析得到 web 包 ⇒ 同一个码
      if (!exactly(codesOf('bareInLeaderPreset'), [CODES.clientInPreset])) {
        problems.push(problem(CODE.knifeVector,
          `刀（预设体里一行**裸包名**，解析到 ${syntheticPkg.pkg_name} 这个声明了 web 的包）翻出来的面是 ${JSON.stringify(codesOf('bareInLeaderPreset'))}，`
          + `应当只有 ${JSON.stringify([CODES.clientInPreset])} —— 否则裸名就 fail-open`))
      }
      // 🔴 读不到只进读数：不红、不 HOLD，但必须被数出来（否则"没红"就是一个假读数）
      if (codesOf('unresolvedInLeaderPreset').length !== 0) {
        problems.push(problem(CODE.knifeVector,
          `刀（预设体里一行解析不到的裸包名 ${UNRESOLVABLE_BARE_NAME}）判出了 ${JSON.stringify(codesOf('unresolvedInLeaderPreset'))} —— 它应当只进读数、不产码`))
      }
      const unresolvedNames = (fixtures.unresolvedInLeaderPreset.reading.unresolved_in_preset ?? []).map((r) => r.name)
      if (!unresolvedNames.includes(UNRESOLVABLE_BARE_NAME)) {
        problems.push(problem(CODE.knifeUnreadable,
          `解析不到的那一行没有进 \`unresolved_in_preset\` 读数（实得 ${JSON.stringify(unresolvedNames.slice(0, 6))}）—— "读不到"被静默当成"不是客户端 UI"了`))
      }
      if (fixtures.control.reading.warnings.length > 0) {
        problems.push(problem(CODE.ruler, '合成夹具自己就有解析器读不懂的行 —— 这一跑的翻面证据不成立'))
      }
      // 刀的"语义成立"自证：合成行必须靠**它自己的 package.json** 被认出来（不是靠名字像 / id 熟）
      const classified = fixtures.syntheticInLeaderPreset.reading.client_ui_rows.find((r) => String(r.name) === syntheticPkg.name)
      if (classified === undefined || !String(classified.pkg).endsWith('client-ui-probe/package.json')) {
        problems.push(problem(CODE.knifeUnreadable, `扫描器没有把合成行解析到它自己的包（实得 ${JSON.stringify(classified ?? null)}）—— 这把刀量不到"语义"那一面`))
      }
      // 证据（不是判据）：这把刀的那一行在两个生产输入里**都没有**任何登记痕迹
      const registration = {
        synthetic_row_id: SYNTHETIC_ROW_ID,
        synthetic_pkg_name: syntheticPkg.pkg_name,
        in_real_patch: liveText.includes(SYNTHETIC_ROW_ID) || liveText.includes(syntheticPkg.pkg_name),
        in_real_composition: compositionSnap.exists ? readFileSync(COMPOSITION_FILE, 'utf8').includes(SYNTHETIC_ROW_ID) : null,
      }
      rec.readings.knife_registration = registration
      if (registration.in_real_patch === true || registration.in_real_composition === true) {
        problems.push(problem(CODE.knifeUnreadable,
          `这把刀的夹具行不再是"谁都没登记过的行"（真补丁 ${String(registration.in_real_patch)} · 真组合 ${String(registration.in_real_composition)}）—— 刀的命题不成立`))
      }
    } catch (err) {
      problems.push(problem(CODE.ruler, `合成夹具造不出来：${String(err?.message ?? err)} —— 这一跑的翻面证据不成立`))
    }

    // ── 读数收口：跑动中活树有没有被人动过（读数，不冒充判据）──────────────
    const after = snapshotOf(PATCH_FILE)
    rec.readings.after = { patch: after }
    rec.readings.tree_changed_during_case = { patch: after.sha256 !== patchSnap.sha256 }
    rec.readings.verdict = {
      live_semantics_ok: live.problems.length === 0,
      live_codes: live.problems.map((p) => p.code),
      enabled_in_preset: live.reading.violations.filter((v) => v.disabled !== true).length,
      unresolved_in_preset_count: live.reading.unresolved_in_preset_count,
    }
    caseFail(problems)
  })
})

// ── 共用小工具 ───────────────────────────────────────────────────────────────
/** 验收口径那四条读数（从 `scanBundleMount()` 的读数里取）。 */
function shapeOf(reading) {
  const dashboardRows = reading.dashboard.rows ?? []
  return {
    insert_blocks: reading.insert_blocks.length,
    insert_members: reading.insert_members,
    preset_entries: reading.preset_entries.length,
    host_members: reading.host_members.length,
    dashboard_in_insert: dashboardRows.filter((r) => r.placement === 'insert').length,
    dashboard_in_preset: dashboardRows.filter((r) => r.in_preset_body === true).length,
    text_hits: reading.dashboard.text_hits ?? null,
  }
}

function stripDashboard(ids) {
  return (ids ?? []).filter((id) => id !== ROW_ID)
}

/** 看板包的声明读数（"浏览器有没有东西可收"的三格 + Node 入口）。 */
function dashboardPackageFacts(manifestFile) {
  if (!existsSync(manifestFile)) return { exists: false, platform: null, exports_client: false, file: manifestFile }
  const value = JSON.parse(readFileSync(manifestFile, 'utf8'))
  return {
    exists: true,
    file: manifestFile,
    name: value.name ?? null,
    version: value.version ?? null,
    platform: value?.dsh?.client?.platform ?? null,
    exports_client: Object.prototype.hasOwnProperty.call(value?.exports ?? {}, './client'),
    exports_client_target: typeof value?.exports?.['./client'] === 'string' ? value.exports['./client'] : value?.exports?.['./client']?.default ?? null,
  }
}

/** profile 补丁路径不再在本文件里定义：备用路线那一格用 `boot-readings.mjs` 的同一把尺子（`BOOT-01` 同口径）。 */

