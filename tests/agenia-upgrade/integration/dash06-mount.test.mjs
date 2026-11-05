/**
 * `DASH-15` · **面板装上了没有**（`bug-20261104-02`；2026-11-05 迁到 **profile 层**）
 * `DASH-16` · **客户端 UI 行的层归属**（第 4 关评审 `R-1` 的语义面；2026-11-05 迁到 **profile 层**）
 *
 * ── 病根（没变）────────────────────────────────────────────────────────────────
 * **「写出来了」≠「装上了」**。浏览器只收**宿主装载层**（`- insert:`）里声明了 `dsh.client` 的包；
 * 一行写在别处（预设的 `plugins` 里 / 一个顶层 override 里）看起来"配置里有"，界面上什么都没有。
 * 2026-11-04 的现场：`view.json` 469 B · 146/146 · 128/128 全绿，老板「我在客户端里点哪，i see nothing」
 * —— **十四条 DASH 用例没有一条读过装载层**，所以没有任何一条判据可能注意到它。
 *
 * ── 为什么迁（2026-11-05 · 定形「看板挂载 profile 层」）──────────────────────────
 * 这两个用例原本判的是 **bundle 补丁**（`presets/agenia/cordis.patch.yml`）里
 * "`id: agenia-dashboard` 必须是顶层 `- insert:` 的直接成员"。16:0x 实测：把那一行搬进 bundle 的
 * 宿主级 insert 会让**整个 bundle 层 boot 失败**（新会话 `agentPreset: "standard"` ⇒ 无角色 ⇒ 窄权限），
 * 于是那一天回滚成 `disabled: true`，挂载路线改成走 **profile 层**（本票）。
 * ⇒ **"bundle 补丁里有一个装着看板的宿主 insert"这个形状再也不会出现**（生成器遇到 `# @host-level`
 *    或非空 `HOST_LEVEL_IDS` 就 throw）。照旧判它 = 一条永远红的假红，等于没有判据。
 * ⇒ 迁到 profile 层。**语义面一个字没变**（"客户端 UI 行不在宿主装载层里 ⇒ 浏览器收不到"），
 *    只是载体换成 `$DSH_PROFILE_DIR/cordis.patch.yml`（今天 = `C:\Users\DAVID\.dsh\profiles\desktop\
 *    cordis.patch.yml`，`AGENIA_PROFILE_PATCH` 可覆盖）。
 * 🔴 而且**不许再认行 id**：挂载行按定形 §五**不带 `id`**（`- insert:` 是"新增"，带 `id` 的顶层条目是
 *    "改已存在的行"）。所以"那一行是哪一行"只能靠**它指向的那份 `package.json` 是不是看板包那一份**认
 *    —— 那才是语义，不是命名形状（`cand-20261021-0091`）。
 *
 * ── `DASH-15` 判什么（四条腿，缺一条就不算交活）──────────────────────────────────
 *   ⓪ **读取器覆盖**：`patchReaderVerdict()`（与 `BOOT-01` / `BOOT-02` **同一把尺子**）。它存在的理由：
 *      profile 补丁第 44–45 行那处**多行 plain scalar** 曾经让窄口径读取器从第 45 行起整段盲掉，
 *      于是"读不到"会伪装成"那一行不在"。⚠️ 本格与 BOOT 的差别只在**后果**：这里 `warnings` 非空
 *      一直是红（`DASH-PATCH-UNREADABLE`），BOOT 那边当时是静默 —— 但"最后一条顶层 item 看得见"
 *      这一条更强的性质两边都要。
 *   ① **profile 层的位置 + 行体 + 包**（`support/client-ui-placement.mjs::scanProfilePlacement()`）：
 *      · 看板那一行必须是**顶层 `- insert:` 的直接成员** ⇒ 否则 `DASH-NOT-PROFILE-INSERT`（红）；
 *      · 它自己的形状：**不带 `id`**（`DASH-PROFILE-ROW-HAS-ID`）· 不是 `disabled: true`
 *        （`DASH-PROFILE-ROW-DISABLED`）· `name` 指到包 · `config.root` 在 · 包自己声明
 *        `dsh.client.platform: web` + `exports["./client"]`（合起来一个码 `DASH-NO-CLIENT-DECL`，
 *        报文里各自点名 —— 缺一样浏览器就没有东西可收）；
 *      · **那一行不在** ⇒ **红** `DASH-PROFILE-MOUNT-MISSING`（2026-11-05 复审第 4 条：主语是
 *        "那一行**必须**在 profile 补丁里"，缺席是**关于产品的事实**（挂载没做），不是"我读不到"）。
 *        ⚠️ 第三态在这条腿上已经取消：它之前把"还没挂"记成 HOLD，等于让一条**验收要求**在
 *        产品没做的时候不出声（`cand-20261019-0042` 那个病）。今天的读数就是红，
 *        `AGENIA_PROFILE_PATCH` 指一份已挂载的副本 ⇒ 立刻绿（翻面见 ② 的夹具与真字节对照）。
 *   ② **翻面**（合成夹具 + 真字节，全在运行根里造，活树一个字节不动）：
 *      · 阳性：`insert` 形状干净 · `absent` ⇒ **红** `DASH-PROFILE-MOUNT-MISSING` ·
 *        `override` / `nested`（住错层）⇒ **只有** `DASH-NOT-PROFILE-INSERT` ·
 *        带 `id` / `disabled` / 包没声明 / 没 `root` ⇒ 各自的码 ·
 *        预设体里**裸包名**且解析得到一个 web 包 ⇒ `DASH-CLIENT-NOT-IN-PROFILE-INSERT`（第 3 条刀的阳性面）·
 *        预设体里名字**解析不到**任何包 ⇒ HOLD `DASH-ROW-PACKAGE-UNRESOLVED`（第三态，不是绿）；
 *      · **真字节阳性对照**：把真 profile 补丁原文 + **真形状的挂载块**（`appendMountBlock()`）喂一遍，
 *        必须干净 —— 修好之后它与"真文件本来就有那一行"是恒等变换，仍然要求干净。
 *   ③ **bundle 层的派生物**（这一腿**不是**挂载面，是同一份票依赖的另一条不变量，原样保留）：
 *      生成的 `presets/agenia/cordis.patch.yml` 必须**等于** `.tools/make-bundle-patch.mjs` 从
 *      `agent.cordis.yml` 造出来的那一份 —— **跑仓库自己的 `--check`**（不另写比较逻辑）。
 *      🔴 `--check` 的 **exit 1 有两个意思**（2026-11-05 复审第 1 条），本格分开报：
 *         · `E_PATCH_NOT_DERIVED`（盘上补丁 ≠ 派生物）⇒ `DASH-PATCH-NOT-DERIVED`；
 *         · 派生物**一致但结构 / 层归属不对**（`E_PATCH_TOP_INSERT_SHAPE` / `E_PATCH_HOST_ROW_IN_INSERT` /
 *           `E_PATCH_CLIENT_UI_ENABLED` / `E_PATCH_CLIENT_UI_UNLISTED`）⇒ `DASH-PATCH-STRUCTURE-WRONG`；
 *         · 组合本体过不了生成器的联锁（`E_BUNDLE_*`，`build()` 就 throw）⇒ `DASH-PATCH-COMPOSITION-REJECTED`；
 *         · 其余（带栈 / 被信号杀 / 退出码与报文打架）⇒ `DASH-PATCH-DERIVE-CRASH`（"没给出判词"）。
 *        把"派生物但结构不对"报成"不是派生物"是**诊断错了**（红对、原因错）：修的人会去找
 *        "谁手改了补丁"，而真正要修的是生成器产出的形状。
 *      跑之前一道**安全联锁**（`--check` 分支必须先于写盘，否则不跑、记
 *      `HOLD DASH-PATCH-CHECK-UNAVAILABLE` —— 生成器加载期就会写活体）；跑完再量一次活体 sha256
 *      （变了 ⇒ `DASH-PATCH-CHECK-WROTE-PRESET`）。
 *      ⚠️ 为什么它留在这一格：用例 ID 是冻结的（分母 150，不许新增），而这条不变量今天没人判。
 *        **两个主语写在这里，不藏着**：①②是 profile 层，③是 bundle 层。
 *
 * ── `DASH-16` 判什么（语义面：不读标记、不读点名表、不认行 id）──────────────────
 *   ⓪ 同一份读取器覆盖（见 `DASH-15` ⓪）。
 *   ① **profile 层的语义面**：对 profile 补丁里**每一行**（带 `name` 的映射），用 `name` 解析到盘上的
 *      `package.json`；声明了 `dsh.client.platform: web` 却**不是**顶层 `- insert:` 的直接成员 ⇒
 *      `DASH-CLIENT-NOT-IN-PROFILE-INSERT`（**红**，`scope: 'other'`）。
 *      这一条要抓的正是"作者从没登记过的新行"：它叫什么、谁点名过它，都不影响判断。
 *      🔴 **解析不到的行也要判**（复审第 3 条）：住在**预设体**（`plugins` 列表 / 组的 `config`）里、
 *      `name` 解析不到包 ⇒ HOLD `DASH-ROW-PACKAGE-UNRESOLVED`（"读不到 ≠ 不是客户端 UI"）。
 *      生成器那一侧正在用 `E_BUNDLE_CLIENT_UI_UNRESOLVED` 关同一个洞（裸包名 / 坏 manifest 不许 fail-open）。
 *      当前看板那一行自己的层归属归 `DASH-15` ①，这里只留 `scope: 'mount'` 的同一份读数。
 *   ② **bundle 层的残余腿**（**没跟着迁走的那半句话**）：bundle 层**没有**宿主装载层了 ⇒
 *      客户端 UI 行在 bundle 里只有一种合法形状：**住在预设 `plugins` 里、且 `disabled: true`**。
 *      · 行**开着** ⇒ `DASH-CLIENT-IN-PRESET`（红：那正是 2026-11-05 16:0x boot 事故的形状）；
 *      · 行住在**预设体之外**（顶层 `- insert:` 的直接成员 / 顶层 override）⇒ `DASH-CLIENT-IN-BUNDLE-TOP`（红）。
 *      · 关着的那一行（今天 = 看板）是**允许**的，但它必须**两侧都关**：组合说 `disabled: true` 而补丁里
 *        每一处出现也 `disabled: true`，只翻一侧 ⇒ `DASH-DISABLED-MISMATCH`（红：补丁是派生物）。
 *      🔴 **扫描器报的每一条本格都消费**：没有"本格不判"的剔除名单（旧版把 `DASH-HOST-MISSING` 与
 *      `DASH-CLIENT-IN-PRESET` 从消费面剔掉、再自己重推一遍——那就是"被消费者丢掉"）。
 *      尤其 `DASH-PATCH-UNREADABLE` 必须照旧红：不然"补丁读不懂"会让 `violations` 变成空数组
 *      ⇒ 看起来"没有开着的行"⇒ 静默假绿（Gate-2 那个病的同一个形状）。
 *   ③ **翻面**：只存在于夹具里的合成包（`dsh.client.platform: web`）+ 合成行 ——
 *      放进 profile 的 `- insert:` ⇒ 干净；放进 profile 的顶层 override / 更深一层 ⇒ **只有**
 *      `DASH-CLIENT-NOT-IN-PROFILE-INSERT`；**裸包名**（`manifestRoots` 索引解析得到 web 包）放进预设体
 *      ⇒ 同一个码（证明解析面不只认路径形）；名字解析不到 ⇒ HOLD `DASH-ROW-PACKAGE-UNRESOLVED`；
 *      放进 **bundle 预设且开着** ⇒ **只有** `DASH-CLIENT-IN-PRESET`；同一行放进 bundle 预设但
 *      `disabled: true` ⇒ **干净**（"关着可以留"这条规矩必须能翻面）；放进 **bundle 顶层** ⇒
 *      **只有** `DASH-CLIENT-IN-BUNDLE-TOP`。刀翻错面 ⇒ `DASH-KNIFE-VECTOR`；
 *      夹具行解析不到它自己的包 / 在生产输入里留了登记痕迹 ⇒ `DASH-KNIFE-UNREADABLE`。
 *
 * ── 退役的三个码（写清原因 + 新落点，不静默消失）─────────────────────────────────
 *   · **`DASH-NOT-HOST-LEVEL`**（bundle 补丁里那一行不是宿主级 insert 的直接成员）：
 *     bundle 层不再有宿主装载层 ⇒ 形状没有对象。替代：`DASH-NOT-PROFILE-INSERT`（profile 层，`DASH-15`）
 *     + `DASH-CLIENT-NOT-IN-PROFILE-INSERT`（profile 层，任何客户端 UI 行，`DASH-16`）。
 *   · **`DASH-ROW-ABSENT`**（bundle 补丁里那一行整个不在）：同一个理由没有对象。
 *     替代：`DASH-PROFILE-MOUNT-MISSING` —— 而且是**红**（复审第 4 条），不是 HOLD。
 *   · **`DASH-HOST-MISSING`**（"整份补丁里没有任何 web 包" / "看板行不在 bundle 宿主 insert"）：
 *     迁移之后那个形状**按设计不存在**，判它只会得到假红或永不开火。
 *     它是**退役**，不是"被消费者丢掉"：`scanClientUiPlacement()` 里那三段阳性腿**整段删除**，
 *     `client-ui-placement.mjs` 的 `CODES` 里也没有这个键（grep 得到的就是这段墓碑）。
 *     命题的两半各有新落点：①"看板行必须在新增行的唯一入口里" ⇒ `DASH-PROFILE-MOUNT-MISSING` +
 *     `DASH-NOT-PROFILE-INSERT`；②"任何客户端 UI 行不在装载层" ⇒ `DASH-CLIENT-NOT-IN-PROFILE-INSERT`
 *     + `DASH-CLIENT-IN-BUNDLE-TOP`（bundle 顶层那一半，本轮补上）。
 *
 * ── 不判什么 ────────────────────────────────────────────────────────────────────
 *   · 不判像素 / 界面（"点开有没有那块面板"归 GUI 清单，人点一次）；
 *   · 不判浏览器真的收到了包（那要真宿主；`BOOT-02` 判那两条读数）；
 *   · 不判 `view.json` 的内容（`DASH-11` / `DASH-12` 管数据链）。
 *
 * 🔴 **读数绑在树上**：每个读数带 `{repo, head, 文件 sha256/字节/mtime, snapshot_at}`；profile 补丁
 *   那一路另带**读取器覆盖**（它不在仓库里，`.git` 量不到它，只有 sha256 与覆盖读数能证明读的是哪一份）。
 */
import { before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, caseHold, preflight, problem, runCase, runRoot, sha256File } from '../support/evidence.mjs'
import { noteSutOverride } from '../support/dashboard-surface.mjs'
import {
  appendMountBlock,
  clientUiPatchFixture,
  compositionRowState,
  profilePatchFixture,
  scanClientUiPlacement,
  scanProfilePlacement,
  syntheticClientUiPackage,
} from '../support/client-ui-placement.mjs'
import { patchReaderVerdict, profilePatchPath } from '../support/boot-readings.mjs'

before(() => {
  preflight()
})

// ── 落点与码（稳定、可 grep）────────────────────────────────────────────────
/** bundle 层：生成的补丁 / 组合本体 / 生成器（③ 与 ② 的残余腿）。 */
const PATCH_FILE = path.join(PATHS.finalPreset, 'cordis.patch.yml')
const COMPOSITION_FILE = path.join(PATHS.finalPreset, 'agent.cordis.yml')
const GENERATOR_FILE = PATHS.generator
/** 看板包：**行身份靠它认**（不是靠 id、不是靠名字形状）。 */
const DASHBOARD_MANIFEST = path.join(PATHS.finalPreset, 'client-ui-dashboard', 'package.json')
/** bundle 层那一行（残余腿）仍按 id 认 —— 它没迁走。 */
const ROW_ID = 'agenia-dashboard'
/**
 * 码（稳定、可 grep）。
 * ⚠️ 这里**没有** `hostMissing`：`DASH-HOST-MISSING` 已退役（原因与新落点见文件头「退役的三个码」）。
 */
const CODE = {
  patchUnreadable: 'DASH-PATCH-UNREADABLE',
  profilePatchMissing: 'DASH-PROFILE-PATCH-MISSING',
  /** 盘上补丁 ≠ 生成器从组合造出来的那一份（`--check` 的 `E_PATCH_NOT_DERIVED`）。 */
  notDerived: 'DASH-PATCH-NOT-DERIVED',
  /** 补丁**等于**派生物，但派生物自己的结构 / 层归属不对（`E_PATCH_TOP_INSERT_SHAPE` 等）。 */
  structureWrong: 'DASH-PATCH-STRUCTURE-WRONG',
  /** 组合本体过不了生成器的联锁（`build()` 就 throw，`E_BUNDLE_*`）。 */
  compositionRejected: 'DASH-PATCH-COMPOSITION-REJECTED',
  deriveUnavailable: 'DASH-PATCH-CHECK-UNAVAILABLE',
  deriveCrash: 'DASH-PATCH-DERIVE-CRASH',
  checkWrote: 'DASH-PATCH-CHECK-WROTE-PRESET',
  disabledMismatch: 'DASH-DISABLED-MISMATCH',
  knifeVector: 'DASH-KNIFE-VECTOR',
  knifeUnreadable: 'DASH-KNIFE-UNREADABLE',
  ruler: 'DASH-RULER-BROKEN',
}
const DASH16 = {
  clientInPreset: 'DASH-CLIENT-IN-PRESET',
  clientInBundleTop: 'DASH-CLIENT-IN-BUNDLE-TOP',
  clientNotInProfileInsert: 'DASH-CLIENT-NOT-IN-PROFILE-INSERT',
  rowPackageUnresolved: 'DASH-ROW-PACKAGE-UNRESOLVED',
  patchUnreadable: CODE.patchUnreadable,
  disabledMismatch: CODE.disabledMismatch,
  ruler: CODE.ruler,
  knifeVector: CODE.knifeVector,
  knifeUnreadable: CODE.knifeUnreadable,
}
/** 只存在于夹具里的行 id —— 它不许出现在生产树的任何一份文件里（`knife_registration` 盯着）。 */
const SYNTHETIC_ROW_ID = 'future-client-ui-panel'
/** 只存在于夹具里的**裸包名**（`manifestRoots` 索引解析得到；刀要用它证明解析面不只认路径形）。 */
const SYNTHETIC_BARE_NAME = '@fixture/dsh-client-ui-probe'
/** 一个**解析不到任何包**的裸名（第三态那一格的刀）。 */
const UNRESOLVABLE_BARE_NAME = '@fixture/dsh-client-ui-probe-not-built'

/**
 * 🔴 **第三态的分流政策**（2026-11-05 · 复审第 3/4 条之后）。
 *
 * 第三态（HOLD）**只**留给"我读不到"：`detail.scope === 'unreadable'` 的那几条
 * （预设体里名字解析不到包的行 / profile 补丁文件本身不在）。**每条带自己的码**，不合并成一个。
 * 其余全部是红 —— 尤其**看板那一行缺席**：主语是"那一行必须在这里"，缺席是产品事实，不是读不到。
 * 🔴 这条政策自己必须能被量（两个用例各有一组 `policy_grid` 刀）：缺席 ⇒ RED 0→1；
 *    `unreadable` ⇒ HOLD 1 且**不许吞掉**同时存在的红。
 */
function mountVerdict({ problems }) {
  const unreadable = problems.filter((p) => p.detail?.scope === 'unreadable')
  const red = problems.filter((p) => p.detail?.scope !== 'unreadable')
  return {
    red,
    holds: unreadable.map((p) => ({ code: p.code, why: p.message })),
  }
}

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

/** 读取器覆盖的收口（与 `BOOT-01` / `BOOT-02` 同一个口径）。 */
function applyReader(rec, reader) {
  rec.readings.patch_reader = {
    measured_at: reader.measured_at,
    where: reader.where,
    effective: reader.effective,
    live: reader.live,
    proof: reader.proof,
    red_codes: reader.problems.map((p) => p.code),
    hold_codes: reader.holds.map((h) => h.code),
  }
  for (const p of reader.problems) rec.problems.push(problem(p.code, p.message))
  for (const h of reader.holds) caseHold(rec, h.code, h.why)
}

/**
 * 读 profile 补丁（**一次读字节，从头用到尾**）。
 * 文件不在 ⇒ 不抛、给 `HOLD DASH-PROFILE-PATCH-MISSING`（别的机器 / 干净 clone 上没有它）。
 */
function readProfilePatch() {
  const where = profilePatchPath()
  const snap = { path: where.path, source: where.source, exists: existsSync(where.path), bytes: null, sha256: null, mtime: null, at: new Date().toISOString() }
  if (snap.exists) {
    const st = statSync(where.path)
    snap.bytes = st.size
    snap.sha256 = sha256File(where.path)
    snap.mtime = new Date(st.mtimeMs).toISOString()
  }
  return { where, snap, text: snap.exists ? readFileSync(where.path, 'utf8') : null }
}

/** 包声明里"浏览器到底有没有东西可收"的三格（夹具与真文件共用同一份检查）。 */
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

/**
 * 跑一次生成器检查（只读；`--check` 分支在写盘之前已被联锁证明）。
 *
 * 🔴 **`exit 1` 有四个意思，必须分开**（2026-11-05 复审第 1 条）—— 判词读法（退出码是主信号，
 * 生成器打出来的**具名码**是分类依据）：
 *   · `exit 0` ⇒ 一致且结构对（`derived`）；
 *   · `exit 1` + `E_PATCH_NOT_DERIVED` ⇒ 盘上补丁**不是**派生物（`not_derived`）；
 *   · `exit 1` + `E_PATCH_TOP_INSERT_SHAPE` / `E_PATCH_HOST_ROW_IN_INSERT` /
 *     `E_PATCH_CLIENT_UI_ENABLED` / `E_PATCH_CLIENT_UI_UNLISTED` ⇒ **是**派生物，但派生物自己的
 *     结构 / 层归属不对（`structure_wrong`）—— 这一格以前被误标成"不是派生物"（红对、诊断错）；
 *   · `exit 1` + `E_BUNDLE_*` ⇒ 组合本体过不了生成器的联锁（`composition_rejected`，`build()` 就 throw）；
 *   · 其余（带栈 / 被信号杀 / 退出码与报文打架）⇒ **没给出判词**（`crashed`）。
 * 只有具名码能分这四种；只按退出码分会把两种不同的病报成同一个码。
 */
const PATCH_STRUCTURE_CODES = ['E_PATCH_TOP_INSERT_SHAPE', 'E_PATCH_HOST_ROW_IN_INSERT', 'E_PATCH_CLIENT_UI_ENABLED', 'E_PATCH_CLIENT_UI_UNLISTED']
function runGeneratorCheck(generatorFile, cwd) {
  const startedAt = new Date().toISOString()
  const r = spawnSync(process.execPath, [generatorFile, '--check'], {
    cwd,
    env: { ...process.env, TEMP: path.join(runRoot(), 'tmp'), TMP: path.join(runRoot(), 'tmp') },
    encoding: 'utf8',
  })
  const stdout = String(r.stdout ?? '')
  const stderr = String(r.stderr ?? '')
  const codeHit = (code) => new RegExp(`\\b${code}\\b`).test(stdout)
  const patchCodes = [...PATCH_STRUCTURE_CODES, 'E_PATCH_NOT_DERIVED'].filter((code) => codeHit(code))
  const bundleCodes = [...new Set(stdout.match(/E_BUNDLE_[A-Z0-9_]+/g) ?? [])]
  const exit = r.status
  /** 退出码说绿、报文说 RED ⇒ 两个信号打架（不替它选）。 */
  const contradiction = exit === 0 && /\bRED\b/.test(stdout)
  const derived = exit === 0 && !contradiction
  const cleanExit1 = exit === 1 && stderr.trim() === '' && /\bRED\b/.test(stdout)
  const notDerived = cleanExit1 && codeHit('E_PATCH_NOT_DERIVED')
  const structureWrong = cleanExit1 && !notDerived && patchCodes.some((code) => code !== 'E_PATCH_NOT_DERIVED')
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
    patch_codes: patchCodes,
    bundle_codes: bundleCodes,
    word_ok: /\bok\b/.test(stdout),
  }
}

/**
 * **一次 `--check` 结果 → 这一格的判词**（纯函数：活体检查与两把刀走同一条映射，
 * 所以"刀证明了分类会翻面"这句话是关于**判词**的，不只是关于分类函数的）。
 *
 * @param {ReturnType<typeof runGeneratorCheck>} check
 * @param {{patch?: object, composition?: object}} [snaps] 报文里要指到"哪一份文件、什么字节"
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
      + `${JSON.stringify(check.patch_codes)}${where} —— 这不是"谁手改了补丁"（那是 \`${CODE.notDerived}\`），`
      + '是生成器产出的形状坏了（顶层 insert 形状 / 宿主级行混进 bundle / 预设体里开着的客户端 UI 行 / 白名单外的行）')]
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
 * 为什么拷整棵树（而不是三份文件）：修好之后的生成器可能去看包声明 / 别的输入 ——
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
 * 🔴 **刀 E：派生物但结构不对**（2026-11-05 复审第 1 条）—— 造一份"生成器自己产出的坏形状"。
 *
 * 为什么必须造在**生成器**上、而不是手改补丁：`--check` 的两个 exit 1 原因是
 *   · `same = false`（盘上 ≠ 派生物）⇒ `E_PATCH_NOT_DERIVED`
 *   · `same = true && fileProblems > 0`（**盘上就是派生物，而派生物自己结构不对**）
 * 手改补丁永远落在第一种（它改完就不是派生物了）⇒ 手改**分不开**这两个原因，也就证不了"分开"这件事。
 * 所以这一把刀改的是**副本生成器**：让它的 `build()` 在顶层 insert 里多产出一条宿主级行
 * （= 2026-11-05 迁移前那个形状），再把**同一段文本**写进副本补丁 —— 于是 `--check` 看见
 * `same = true`、`fileProblems > 0` ⇒ 那正是第二种。
 *
 * 夹具的保真度自证：`same` 只有在我们算出来的文本与生成器**逐字**相同时才成立；
 * 若两处插的不是同一段（或生成器模板变了），`--check` 会退成 `not_derived` ——
 * 那时这一格报 `DASH-KNIFE-UNREADABLE`（**尺子坏了不是对象坏了**），绝不假装翻面。
 *
 * @param {{patchText: string}} input 活树那份补丁原文（派生物；`derived === true` 时才用它）
 */
function wrongShapeDerivativeFixture({ patchText }) {
  const dir = fixtureDir('derive-wrong-shape')
  const copied = copyTree(PATHS.finalPreset, path.join(dir, 'presets', 'agenia'))
  mkdirSync(path.join(dir, '.tools'), { recursive: true })
  const generator = path.join(dir, '.tools', 'make-bundle-patch.mjs')
  /**
   * 两处**同一段**文本：
   *   · 生成器模板：紧跟在顶层 `- insert:` 那一行后面（它的产物里就是顶层 insert 的第一条成员）；
   *   · 补丁原文：同样跟在那个唯一的顶层 `- insert:` 后面。
   * `./client-ui-dashboard/lib/index.js` 是**相对 `presets/agenia`** 的路径形（`rowPackage()` 会真解析），
   * 所以这条成员会被 `describePatch()` 认成"顶层 insert 里的宿主级行"。
   */
  const KNIFE_ROW = [
    '    - id: knife-host-row',
    "      name: './client-ui-dashboard/lib/index.js'",
  ].join('\n')
  const source = readFileSync(GENERATOR_FILE, 'utf8')
  const anchor = '\n- insert:\n'
  const hits = source.split(anchor).length - 1
  const patchHits = String(patchText).split('\n- insert:\n').length - 1
  writeFileSync(generator, source.split(anchor).join(`\n- insert:\n${KNIFE_ROW}\n`), 'utf8')
  const target = path.join(dir, 'presets', 'agenia', 'cordis.patch.yml')
  writeFileSync(target, String(patchText).split('\n- insert:\n').join(`\n- insert:\n${KNIFE_ROW}\n`), 'utf8')
  return {
    dir,
    generator,
    copied,
    target,
    mutation: {
      how: '副本生成器的 build() 在顶层 insert 里多产出一条宿主级行（迁移前那个形状），并把同一段文本写进副本补丁',
      row: KNIFE_ROW,
      generator_anchor_hits: hits,
      patch_anchor_hits: patchHits,
      /** 两处各**恰好**一处才算"夹具的 two sides 是同一段"；否则这把刀量不了（报 UNREADABLE）。 */
      usable: hits === 1 && patchHits === 1,
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

/**
 * 🔴 **刀 F：组合本体过不了联锁**（`E_BUNDLE_*`）—— 这一类**也**曾被报成"不是派生物"。
 *
 * 手法：在**副本组合**末尾加一条**路径形客户端 UI 行**（不带标记、不在白名单）⇒ 副本生成器的
 * `build()` 在 `partitionHostLevel()` 里 throw `E_BUNDLE_CLIENT_UI_IN_PRESET`，
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

// ── 用例 ────────────────────────────────────────────────────────────────────
test('DASH-15 面板装上了没有（profile 层）：顶层 insert 里那一行 + 行体/包声明 + 派生物；还没挂 ⇒ HOLD，形状不对 ⇒ 红', async () => {
  await runCase('DASH-15', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    rec.readings.tree = treeIdentity()
    rec.readings.profile_patch_path = profilePatchPath()
    applyReader(rec, patchReaderVerdict())

    // ── ⓪ 文件身份：bundle 层两份（③ 用）+ profile 补丁一份（①② 用）────────────────
    const patchSnap = snapshotOf(PATCH_FILE)
    const compositionSnap = snapshotOf(COMPOSITION_FILE)
    const generatorSnap = snapshotOf(GENERATOR_FILE)
    const profile = readProfilePatch()
    rec.readings.files = { patch: patchSnap, composition: compositionSnap, generator: generatorSnap, profile_patch: profile.snap }
    rec.readings.dashboard_package = dashboardPackageFacts(DASHBOARD_MANIFEST)

    if (!profile.snap.exists) {
      caseHold(rec, CODE.profilePatchMissing,
        `客户端那份 profile 补丁不在（${profile.where.path}，来源 ${profile.where.source}）⇒ 挂载形状判不了 —— HOLD（不是绿）。`
        + '别的机器 / 干净 clone 上它本来就不在；这一格只能在装着客户端的那台机器上量')
      // 没有文件 = **读不到**（第三态唯一的合法理由之一）；文件在 ⇒ 一条 HOLD 都不给。
    } else {
      // ── ① profile 层：位置 + 行体 + 包 ──────────────────────────────────────
      const real = scanProfilePlacement({
        patchText: profile.text,
        label: 'profile 补丁',
        manifestRoots: [PATHS.finalPreset],
        dashboardManifest: DASHBOARD_MANIFEST,
      })
      rec.readings.profile_mount = real.reading
      for (const p of real.problems) problems.push(p)

      // ── ② 翻面：合成夹具 + 真字节阳性对照 ────────────────────────────────────
      const realPkg = dashboardPackageFacts(DASHBOARD_MANIFEST)
      const goodRow = {
        name: `file:///${path.join(PATHS.finalPreset, 'client-ui-dashboard', 'lib', 'index.js').replace(/\\/g, '/')}`,
        root: path.resolve(PATHS.repo).replace(/\\/g, '/'),
      }
      rec.readings.fixture_row = goodRow
      // 🔴 这一格**没有** pending 了：看板行缺席是红（`DASH-PROFILE-MOUNT-MISSING`）。
      //    第三态只留给 `scope: 'unreadable'`（读不到），由 `mountVerdict()` 统一分流。
      try {
        const scan = (text, label, extraRoots = []) => scanProfilePlacement({
          patchText: text, label, manifestRoots: [PATHS.finalPreset, ...extraRoots], dashboardManifest: DASHBOARD_MANIFEST,
        })
        const noDecl = packageWithoutClientDecl()
        const fixtures = {
          // 阳性：真形状 ⇒ 干净
          control: scan(profilePatchFixture({ placement: 'insert', row: goodRow }), '夹具·正确形状'),
          // 住错层：顶层 override（`- name:`）· 塞进另一行的 config.plugins
          override: scan(profilePatchFixture({ placement: 'override', row: goodRow }), '夹具·顶层 override（不是 insert 的直接成员）'),
          nested: scan(profilePatchFixture({ placement: 'nested', row: goodRow }), '夹具·塞进别人 config.plugins'),
          // 行体：带 id · disabled · 包没声明 · 没 root
          withId: scan(profilePatchFixture({ placement: 'insert', row: { ...goodRow, id: 'agenia-dashboard' } }), '夹具·挂载行带了 id'),
          disabled: scan(profilePatchFixture({ placement: 'insert', row: { ...goodRow, disabled: true } }), '夹具·挂载行 disabled'),
          noDecl: scan(
            profilePatchFixture({ placement: 'insert', row: { name: noDecl.name, root: goodRow.root } }),
            '夹具·包没有 dsh.client',
            [noDecl.dir],
          ),
          noRoot: scan(profilePatchFixture({ placement: 'insert', row: { name: goodRow.name, root: '' } }), '夹具·没有 config.root'),
          // 还没挂：整行没有（这一格今天就是真树的形状）⇒ **红**，不是 HOLD
          absent: scan(profilePatchFixture({ placement: 'absent', row: goodRow }), '夹具·整行没有'),
        }
        /**
         * 第 3 条的两把刀（2026-11-05 复审）—— **解析面**必须能被量：
         *   · `bareInPreset`：预设体里一行**裸包名**，`manifestRoots` 索引解析得到 web 包 ⇒ **红**
         *     （证明"按包认行"不只认路径形名字）；`manifestRoots` 不含它、或者解析失败 ⇒ **不红但不是绿**；
         *   · `unresolvedNested`：同一个位置，名字**解析不到任何包** ⇒ HOLD `DASH-ROW-PACKAGE-UNRESOLVED`
         *     （"读不到 ≠ 不是客户端 UI"）。
         */
        const probePkgDir = fixtureDir('bare-name', 'dash15')
        const probePkg = syntheticClientUiPackage(probePkgDir, { pkgName: SYNTHETIC_BARE_NAME })
        fixtures.bareInPreset = scan(
          profilePatchFixture({
            placement: 'insert',
            row: goodRow,
            nestedRow: { id: SYNTHETIC_ROW_ID, name: probePkg.pkg_name, root: goodRow.root },
          }),
          '夹具·预设体里的裸包名（解析得到 web 包）',
          [probePkgDir],
        )
        fixtures.unresolvedNested = scan(
          profilePatchFixture({
            placement: 'insert',
            row: goodRow,
            nestedRow: { id: SYNTHETIC_ROW_ID, name: UNRESOLVABLE_BARE_NAME, root: goodRow.root },
          }),
          '夹具·预设体里的裸包名（解析不到任何包）',
          [probePkgDir],
        )
        rec.readings.fixtures = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [
          k, { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), reading: v.reading },
        ]))
        rec.readings.fixture_probe_package = { dir: probePkg.dir, pkg_name: probePkg.pkg_name, manifest: probePkg.manifest_file }

        // 真字节阳性对照：真补丁原文 + 真形状的挂载块 ⇒ 必须干净（真文件的形状与夹具同形）
        // ⚠️ 真文件里**已经有**那一行时，"追加"这件事不适用：那一跑的真扫描自己就是阳性/阴性面，
        //    再加一块只会得到两份行。所以这一格只在"还没挂"时跑，并且把"没跑"如实写进读数。
        const realHasRow = real.reading.dashboard.occurrences > 0
        const appended = appendMountBlock(profile.text, goodRow, realHasRow)
        const realMounted = realHasRow ? null : scan(appended.text, '真补丁 + 挂载块')
        rec.readings.fixtures.real_with_mount = {
          skipped: realHasRow,
          appended: appended.appended,
          why: realHasRow ? '真文件里已经有看板那一行 ⇒ 追加式阳性对照不适用（真扫描自己就是阳性面）' : null,
          codes: realMounted === null ? null : realMounted.problems.map((p) => p.code),
          messages: realMounted === null ? null : realMounted.problems.map((p) => p.message),
          reading: realMounted === null ? null : realMounted.reading,
        }

        const codesOf = (name) => fixtures[name].problems.map((p) => p.code)
        const onlyOne = (name, code) => JSON.stringify(codesOf(name)) === JSON.stringify([code])
        if (codesOf('control').length !== 0) {
          problems.push(problem(CODE.ruler, `合成的"正确形状"（挂载行在顶层 insert 里、包声明齐全）被判出 ${JSON.stringify(codesOf('control'))} —— 判据连正确形状都过不了：先修尺子`))
        }
        if (realMounted !== null && realMounted.problems.length !== 0) {
          problems.push(problem(CODE.ruler,
            `真补丁原文 + 真形状的挂载块被判出 ${JSON.stringify(realMounted.problems.map((p) => p.code))}`
            + `（${realMounted.problems.map((p) => p.message).join(' / ')}）—— 修好之后也过不了：先修尺子`))
        }
        if (!onlyOne('override', 'DASH-NOT-PROFILE-INSERT')) {
          problems.push(problem(CODE.knifeVector, `刀（顶层 override，不带 insert）翻出来的面是 ${JSON.stringify(codesOf('override'))}，应当只有 ${JSON.stringify(['DASH-NOT-PROFILE-INSERT'])}`))
        }
        if (!onlyOne('nested', 'DASH-NOT-PROFILE-INSERT')) {
          problems.push(problem(CODE.knifeVector, `刀（把挂载行塞进别人 config.plugins）翻出来的面是 ${JSON.stringify(codesOf('nested'))}，应当只有 ${JSON.stringify(['DASH-NOT-PROFILE-INSERT'])}`))
        }
        if (!onlyOne('withId', 'DASH-PROFILE-ROW-HAS-ID')) {
          problems.push(problem(CODE.knifeVector, `刀（挂载行带 id）翻出来的面是 ${JSON.stringify(codesOf('withId'))}，应当只有 ${JSON.stringify(['DASH-PROFILE-ROW-HAS-ID'])}`))
        }
        if (!onlyOne('disabled', 'DASH-PROFILE-ROW-DISABLED')) {
          problems.push(problem(CODE.knifeVector, `刀（挂载行 disabled）翻出来的面是 ${JSON.stringify(codesOf('disabled'))}，应当只有 ${JSON.stringify(['DASH-PROFILE-ROW-DISABLED'])}`))
        }
        if (!onlyOne('noDecl', 'DASH-NO-CLIENT-DECL')) {
          problems.push(problem(CODE.knifeVector, `刀（包去掉 dsh.client）翻出来的面是 ${JSON.stringify(codesOf('noDecl'))}，应当只有 ${JSON.stringify(['DASH-NO-CLIENT-DECL'])}`))
        }
        if (!onlyOne('noRoot', 'DASH-NO-CLIENT-DECL')) {
          problems.push(problem(CODE.knifeVector, `刀（行上没有 config.root）翻出来的面是 ${JSON.stringify(codesOf('noRoot'))}，应当只有 ${JSON.stringify(['DASH-NO-CLIENT-DECL'])}`))
        }
        if (!onlyOne('absent', 'DASH-PROFILE-MOUNT-MISSING')) {
          problems.push(problem(CODE.knifeVector, `夹具（整行没有）翻出来的面是 ${JSON.stringify(codesOf('absent'))}，应当只有 ${JSON.stringify(['DASH-PROFILE-MOUNT-MISSING'])}`))
        }
        // 🔴 第 3 条的阳性面：裸包名**解析得到 web 包** ⇒ 必须红（解析面不只认路径形）
        if (!onlyOne('bareInPreset', 'DASH-CLIENT-NOT-IN-PROFILE-INSERT')) {
          problems.push(problem(CODE.knifeVector,
            `刀（预设体里放一行**裸包名**，解析到 ${SYNTHETIC_BARE_NAME} 这个声明了 web 的包）翻出来的面是 ${JSON.stringify(codesOf('bareInPreset'))}，`
            + `应当只有 ${JSON.stringify(['DASH-CLIENT-NOT-IN-PROFILE-INSERT'])} —— 否则就是"裸名 fail-open"（与生成器侧 E_BUNDLE_CLIENT_UI_UNRESOLVED 同一个洞）`))
        }
        // 🔴 第 3 条的第三态面：名字解析不到 ⇒ HOLD（不是绿、也不是红）
        if (!onlyOne('unresolvedNested', 'DASH-ROW-PACKAGE-UNRESOLVED')) {
          problems.push(problem(CODE.knifeVector,
            `刀（预设体里放一行解析不到的裸包名 ${UNRESOLVABLE_BARE_NAME}）翻出来的面是 ${JSON.stringify(codesOf('unresolvedNested'))}，`
            + '应当只有 DASH-ROW-PACKAGE-UNRESOLVED —— 读不到不许静默算进"不是客户端 UI"')); // eslint-disable-line no-irregular-whitespace
        }
        // 夹具自己必须解析得动（不然刀量的是夹具坏，不是判据坏）
        for (const [name, v] of Object.entries(fixtures)) {
          if (v.reading.warnings.length > 0) {
            problems.push(problem(CODE.ruler, `夹具 ${name} 有解析器读不懂的行（${v.reading.warnings.slice(0, 3).join(' / ')}）—— 这一跑的翻面证据不成立`))
          }
        }
        // 阳性腿：prereq（真包那三格）必须真的在，否则"包声明"那一刀没有对象
        if (realPkg.exists !== true || realPkg.platform !== 'web' || realPkg.exports_client !== true) {
          problems.push(problem(CODE.ruler, `看板包自己的声明读不到（${JSON.stringify(realPkg)}）—— 行体那一刀的阳性面不成立`))
        }
        // 解析面的阳性腿：那把裸名刀之所以能红，是因为 `manifestRoots` 里真的有那份 package.json
        if (typeof probePkg.manifest_file !== 'string' || !existsSync(probePkg.manifest_file)) {
          problems.push(problem(CODE.ruler, `裸名刀的合成包没落盘（${String(probePkg.manifest_file)}）—— 那把刀量不到解析面`))
        }

        /**
         * 🔴 **分流政策自己的刀**（`mountVerdict()` 只把 `scope: 'unreadable'` 翻成 HOLD，所以它必须能被量）。
         *   · 看板行**缺席** ⇒ **RED 1 / HOLD 0**（今天真树的形状：挂载没做就是红）；
         *   · 住错层 ⇒ **RED 1 / HOLD 0**；
         *   · 预设体里**读不到**的行 ⇒ **RED 0 / HOLD 1**（码是它自己的，不是合并成一个 pending 码）；
         *   · 两者同时出现 ⇒ **RED 1 + HOLD 1**（第三态**不许**吞掉红，红也**不许**吞掉第三态）。
         */
        const policyGrid = {
          absent: mountVerdict({ problems: fixtures.absent.problems }),
          override: mountVerdict({ problems: fixtures.override.problems }),
          unreadable: mountVerdict({ problems: fixtures.unresolvedNested.problems }),
          mixed: mountVerdict({
            problems: [
              problem('DASH-PROFILE-MOUNT-MISSING', '合成的 mount 面问题（缺席 ⇒ 红）', { scope: 'mount' }),
              problem('DASH-ROW-PACKAGE-UNRESOLVED', '合成的 unreadable 面问题（⇒ HOLD，且不许吞红）', { scope: 'unreadable' }),
            ],
          }),
        }
        rec.readings.policy_grid = Object.fromEntries(Object.entries(policyGrid).map(([k, v]) => [
          k, { red: v.red.map((p) => p.code), hold: v.holds.map((h) => h.code) },
        ]))
        const gridOf = (k) => ({ red: policyGrid[k].red.map((p) => p.code), hold: policyGrid[k].holds.map((h) => h.code) })
        const expectGrid = (k, want) => {
          const got = gridOf(k)
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            problems.push(problem(CODE.knifeVector, `分流政策的刀 ${k} 翻出来的面是 ${JSON.stringify(got)}，应当是 ${JSON.stringify(want)} —— HOLD 那一半没有翻面（政策死 / 政策漏 / 放得太宽）`))
          }
        }
        expectGrid('absent', { red: ['DASH-PROFILE-MOUNT-MISSING'], hold: [] })
        expectGrid('override', { red: ['DASH-NOT-PROFILE-INSERT'], hold: [] })
        expectGrid('unreadable', { red: [], hold: ['DASH-ROW-PACKAGE-UNRESOLVED'] })
        expectGrid('mixed', { red: ['DASH-PROFILE-MOUNT-MISSING'], hold: ['DASH-ROW-PACKAGE-UNRESOLVED'] })
      } catch (err) {
        problems.push(problem(CODE.ruler, `合成夹具造不出来：${String(err?.message ?? err)} —— 这一跑的翻面证据不成立`))
      }
    }

    // ── ③ bundle 层的派生物（真补丁 = 生成器从组合造出来的那一份）──────────────────
    let derivationVerdict = null
    if (!generatorSnap.exists) {
      caseHold(rec, CODE.deriveUnavailable, `生成器不在盘上（${whereOf(generatorSnap)}）—— "补丁是派生物"这一格判不了；它缺失本身由体检管`)
    } else if (!compositionSnap.exists) {
      caseHold(rec, CODE.deriveUnavailable, `组合本体不在盘上（${whereOf(compositionSnap)}）—— 没有源就没有"派生物"可判`)
    } else if (!patchSnap.exists) {
      problems.push(problem(CODE.patchUnreadable, `生成补丁不在盘上（${whereOf(patchSnap)}）—— "派生物"这一格没有对象（缺 ≠ 坏 ≠ 空）`))
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
        // 期望态（`derived`）⇒ 空数组；其余四种各有自己的码（`derivationProblems()` 是唯一映射）。
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
         * 🔴 **两把刀，各造一个 exit 1 的原因**（2026-11-05 复审第 1 条）：
         *   · 刀 D（`notDerived`）：在副本上**手改一个值** ⇒ `same = false` ⇒ `E_PATCH_NOT_DERIVED`
         *     ⇒ 判词必须是 `DASH-PATCH-NOT-DERIVED`；
         *   · 刀 E（`structureWrong`）：改**副本生成器**让它产出一个坏形状、并把同一段文本写进副本补丁
         *     ⇒ `same = true`、`fileProblems > 0` ⇒ `E_PATCH_TOP_INSERT_SHAPE` 等
         *     ⇒ 判词必须是 `DASH-PATCH-STRUCTURE-WRONG`，**且不许**是 `DASH-PATCH-NOT-DERIVED`。
         * 两把刀**都必须走 `derivationProblems()`**（不是只看分类字段）—— 证的是**判词**会翻面。
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
            /**
             * **对照读数（不是判据）**：旧读法 `exit 1 && stderr 空 && RED` 会把这个结果报成什么。
             * 同一个 `--check` 结果、两种读法 ⇒ 这就是第 1 条那个"红对、诊断错"的 before/after。
             */
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
              `刀 E（副本生成器产出一条宿主级行在顶层 insert）没有让 \`--check\` 报"是派生物、但结构不对"：`
              + `exit ${String(shapeCheck.exit)} · not_derived=${shapeCheck.not_derived} · codes=${JSON.stringify(shapeCheck.patch_codes)}`
              + ` · stdout=${JSON.stringify(shapeCheck.stdout.slice(0, 300))} —— 两处插的不是同一段文本，或者生成器的 "--check" 判法变了`))
          } else {
            const codes = derivationProblems(shapeCheck).map((p) => p.code)
            if (JSON.stringify(codes) !== JSON.stringify([CODE.structureWrong])) {
              problems.push(problem(CODE.knifeVector,
                `刀 E（派生物但结构不对）经判词映射得到 ${JSON.stringify(codes)}，应当只有 ${JSON.stringify([CODE.structureWrong])}`
                + ' —— 这一格正是 2026-11-05 复审第 1 条：不许把"结构不对"报成"不是派生物"'))
            }
          }

          // 刀 F：组合本体过不了联锁 ⇒ 第三个原因（也曾经被报成"不是派生物"）
          const compFix = deriveFixture()
          const compMutation = compositionRejectedFixture(compFix)
          const compCheck = runGeneratorCheck(compFix.generator, compFix.dir)
          const compCodes = derivationProblems(compCheck).map((p) => p.code)
          rec.readings.derivation.knife_composition = {
            fixture: compFix.dir,
            mutation: compMutation,
            check: compCheck,
            verdict_codes: compCodes,
          }
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

    // ── 读数收口：跑动中活树有没有被人动过（读数，不冒充判据）──────────────
    const afterAll = {
      patch: snapshotOf(PATCH_FILE),
      composition: snapshotOf(COMPOSITION_FILE),
      generator: snapshotOf(GENERATOR_FILE),
      profile_patch: snapshotOf(profile.snap.path),
    }
    rec.readings.after = afterAll
    rec.readings.tree_changed_during_case = {
      patch: afterAll.patch.sha256 !== patchSnap.sha256,
      composition: afterAll.composition.sha256 !== compositionSnap.sha256,
      generator: afterAll.generator.sha256 !== generatorSnap.sha256,
      profile_patch: afterAll.profile_patch.sha256 !== profile.snap.sha256,
    }
    // ── 出口：`scope: 'unreadable'` 那几条记 HOLD，其余**全部**照旧红 ──────────
    const verdict = mountVerdict({ problems })
    rec.readings.verdict = {
      profile_mount_present: profile.snap.exists ? rec.readings.profile_mount?.dashboard?.occurrences > 0 : null,
      derived: derivationVerdict === null ? null : derivationVerdict.derived,
      derivation_outcome: derivationVerdict === null ? null : Object.fromEntries(['derived', 'not_derived', 'structure_wrong', 'composition_rejected', 'crashed']
        .filter((k) => derivationVerdict[k] === true).map((k) => [k, true])),
      red_codes: verdict.red.map((p) => p.code),
      hold_codes: verdict.holds.map((h) => h.code),
    }
    for (const h of verdict.holds) caseHold(rec, h.code, h.why)
    caseFail(verdict.red)
  })
})

// ── DASH-16（第 4 关评审 2026-11-05 的 R-1）：语义面 ───────────────────────────
test('DASH-16 客户端 UI 行的层归属（语义面）：profile 补丁里按包清单判 + bundle 层残余腿（开着的行必须红）', async () => {
  await runCase('DASH-16', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    rec.readings.tree = treeIdentity()
    rec.readings.profile_patch_path = profilePatchPath()
    applyReader(rec, patchReaderVerdict())

    const patchSnap = snapshotOf(PATCH_FILE)
    const compositionSnap = snapshotOf(COMPOSITION_FILE)
    const profile = readProfilePatch()
    rec.readings.files = { patch: patchSnap, composition: compositionSnap, profile_patch: profile.snap }

    // ── ① profile 层的语义面 ──────────────────────────────────────────────────
    if (!profile.snap.exists) {
      caseHold(rec, CODE.profilePatchMissing,
        `客户端那份 profile 补丁不在（${profile.where.path}，来源 ${profile.where.source}）⇒ 层归属判不了 —— HOLD（不是绿）`)
    } else {
      const real = scanProfilePlacement({
        patchText: profile.text,
        label: 'profile 补丁',
        manifestRoots: [PATHS.finalPreset],
        dashboardManifest: DASHBOARD_MANIFEST,
      })
      rec.readings.profile = real.reading
      // 全部消费：`scope: 'unreadable'` 的由 `mountVerdict()` 记 HOLD（带它自己的码），其余是红。
      // 🔴 这里**没有**"本格不判"的剔除名单 —— 一个码要么被判，要么退役并从扫描器里删掉。
      for (const p of real.problems) problems.push(p)
    }

    // ── ② bundle 层的残余腿：预设 plugins 里的客户端 UI 行**只许关着** ────────────
    let bundleText = null
    if (!patchSnap.exists) {
      problems.push(problem(DASH16.patchUnreadable, `生成补丁不在盘上：${whereOf(patchSnap)} —— 残余腿判不了（缺 ≠ 坏 ≠ 空）`))
    } else {
      try {
        bundleText = readFileSync(PATCH_FILE, 'utf8')
      } catch (err) {
        problems.push(problem(DASH16.patchUnreadable, `生成补丁读不出来：${whereOf(patchSnap)}（${String(err?.message ?? err)}）`))
      }
    }
    let compositionText = null
    try {
      compositionText = compositionSnap.exists ? readFileSync(COMPOSITION_FILE, 'utf8') : null
    } catch (err) {
      rec.readings.composition_read_error = String(err?.message ?? err)
    }
    const residual = bundleText === null ? null : scanClientUiPlacement({
      patchText: bundleText, rowId: ROW_ID, label: '生成补丁', manifestRoots: [PATHS.finalPreset],
    })
    if (residual !== null) {
      rec.readings.bundle = residual.reading
      /**
       * 🔴 **扫描器报的每一条都消费**（2026-11-05 复审第 2 条）。
       *
       * 旧版把 `DASH-HOST-MISSING` 与 `DASH-CLIENT-IN-PRESET` 从消费面**剔掉**，再自己用
       * `reading.violations` 重推一遍"开着的才红" —— 那正是"被消费者丢掉"：扫描器还在发，
       * 生产判词不用它，谁也不知道它算不算数。现在：
       *   · `DASH-HOST-MISSING` **退役了**（扫描器里整段删除，理由与新落点见文件头）；
       *   · `DASH-CLIENT-IN-PRESET` / `DASH-CLIENT-IN-BUNDLE-TOP` / `DASH-PATCH-UNREADABLE`
       *     全部原样进判词 —— 尤其 `DASH-PATCH-UNREADABLE`：不然"补丁读不懂"会让
       *     `violations` 变成空数组 ⇒ 看起来"没有开着的行"⇒ 静默假绿（Gate-2 那个病的同一个形状）。
       */
      rec.readings.bundle.scanner_codes = residual.problems.map((p) => p.code)
      for (const p of residual.problems) problems.push(p)
      // 读数（不是判据）：哪几行开着 / 哪几行在 bundle 顶层 —— 判词已经在上面那一步里了。
      const enabledInPreset = residual.reading.violations.filter((v) => v.disabled !== true)
      rec.readings.bundle.enabled_in_preset = enabledInPreset
      // 两侧一致：组合说 disabled ⇒ 补丁每一处出现也必须 disabled（补丁是派生物）
      const compRow = compositionText === null
        ? { found: false, occurrences: 0, disabled: false, disabled_values: [], error: '组合读不出来' }
        : compositionRowState(compositionText, ROW_ID)
      const patchOff = residual.reading.dashboard.disabled_flags.length > 0 && residual.reading.dashboard.disabled_flags.every(Boolean)
      rec.readings.disabled_state = {
        composition: compRow,
        patch_all_disabled: patchOff,
        patch_disabled_flags: residual.reading.dashboard.disabled_flags,
        occurrences: residual.reading.dashboard.occurrences,
      }
      if (residual.reading.dashboard.occurrences > 0 && compRow.found === true && compRow.disabled !== patchOff) {
        problems.push(problem(DASH16.disabledMismatch,
          `看板那一行的 \`disabled\` 两侧不一致：组合说 ${compRow.disabled ? '`disabled: true`' : '开着'}（${JSON.stringify(compRow.disabled_values)}）`
          + `，补丁里每一处出现说 ${patchOff ? '`disabled: true`' : '开着'}（${JSON.stringify(residual.reading.dashboard.disabled_flags)}）`
          + ' —— 补丁是派生物（改了 .yml 就跑生成器）；这一格不许拿"关着"当借口',
          { scope: 'other' }))
      }
    }

    // ── ③ 翻面：合成包 + 合成行（只住运行根；活树一个字节不动）────────────────
    try {
      const pkgDir = fixtureDir('client-in-preset', 'dash16')
      const syntheticPkg = syntheticClientUiPackage(pkgDir)
      const realPkgDir = path.join(PATHS.finalPreset, 'client-ui-dashboard')
      const dashboardRow = {
        name: `file:///${path.join(realPkgDir, 'lib', 'index.js').replace(/\\/g, '/')}`,
        root: path.resolve(PATHS.repo).replace(/\\/g, '/'),
      }
      const syntheticRow = { id: SYNTHETIC_ROW_ID, name: syntheticPkg.name, root: path.resolve(pkgDir, '..').replace(/\\/g, '/') }
      /** 同一个合成包的**裸包名**那一半（解析面：`manifestRoots` 按 `package.json.name` 索引）。 */
      const syntheticBareRow = { id: SYNTHETIC_ROW_ID, name: syntheticPkg.pkg_name, root: syntheticRow.root }
      /** 一个解析不到任何包的裸名（第三态那一格）。 */
      const unresolvableRow = { id: SYNTHETIC_ROW_ID, name: UNRESOLVABLE_BARE_NAME, root: syntheticRow.root }

      // ③a profile 层：合成行放在哪儿都能被认出来（靠它自己的 package.json）
      const scanProfile = (text, label) => scanProfilePlacement({
        patchText: text, label, manifestRoots: [PATHS.finalPreset, pkgDir], dashboardManifest: DASHBOARD_MANIFEST,
      })
      const profileScans = {
        control: scanProfile(profilePatchFixture({ placement: 'insert', row: dashboardRow, otherRow: syntheticRow }), '夹具·profile·两行都在 insert'),
        syntheticInOverride: scanProfile(profilePatchFixture({ placement: 'insert', row: dashboardRow, otherRow: null }).replace(
          '- id: web-search-deepseek',
          `- name: '${syntheticRow.name}'\n  config:\n    root: '${syntheticRow.root}'\n- id: web-search-deepseek`,
        ), '夹具·profile·合成行写成顶层 override'),
        syntheticNested: scanProfile(profilePatchFixture({ placement: 'nested', row: dashboardRow, otherRow: null }), '夹具·profile·看板行塞进别人 config.plugins'),
        // 🔴 第 3 条的两把裸名刀：**看板行照常住在 insert 里**，只把被测的那一行放进预设体
        //    （同一个位置、同一行，只换 `name` 的写法 —— 这样"看板缺席"不会混进判词）
        bareInPreset: scanProfile(profilePatchFixture({ placement: 'insert', row: dashboardRow, nestedRow: syntheticBareRow }), '夹具·profile·预设体里的裸包名（解析得到 web 包）'),
        unresolvedInPreset: scanProfile(profilePatchFixture({ placement: 'insert', row: dashboardRow, nestedRow: unresolvableRow }), '夹具·profile·预设体里的裸包名（解析不到任何包）'),
      }
      rec.readings.fixtures_profile = Object.fromEntries(Object.entries(profileScans).map(([k, v]) => [
        k, { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), reading: v.reading },
      ]))

      // ③b bundle 层残余腿：合法形状 = **只在预设体里、且关着**；开着的 / 写在顶层的都红
      const bundleScan = (text, label) => scanClientUiPlacement({ patchText: text, rowId: ROW_ID, label, manifestRoots: [pkgDir] })
      const dashOff = { ...dashboardRow, disabled: true }
      const bundleScans = {
        control: bundleScan(clientUiPatchFixture({ dashboard: 'preset', synthetic: 'absent', dashboardRow: dashOff }), '夹具·bundle·正确形状（看板行在预设体里、关着）'),
        dashInPresetOn: bundleScan(clientUiPatchFixture({ dashboard: 'preset', synthetic: 'absent', dashboardRow, syntheticRow }), '夹具·bundle·看板行在预设层、开着'),
        syntheticInPresetOn: bundleScan(clientUiPatchFixture({ dashboard: 'preset', synthetic: 'preset', dashboardRow: dashOff, syntheticRow }), '夹具·bundle·合成行放进预设（开着）'),
        syntheticInPresetOff: bundleScan(clientUiPatchFixture({
          dashboard: 'preset', synthetic: 'preset', dashboardRow: dashOff, syntheticRow: { ...syntheticRow, disabled: true },
        }), '夹具·bundle·合成行放进预设但 disabled'),
        syntheticInBundleTop: bundleScan(clientUiPatchFixture({ dashboard: 'preset', synthetic: 'bundle-top', dashboardRow: dashOff, syntheticRow }), '夹具·bundle·合成行写在顶层 override'),
        dashInBundleInsert: bundleScan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'absent', dashboardRow, syntheticRow }), '夹具·bundle·看板行在顶层 insert（迁移前那个形状）'),
      }
      rec.readings.fixtures_bundle = Object.fromEntries(Object.entries(bundleScans).map(([k, v]) => [
        k, { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), reading: v.reading },
      ]))

      // 判据（残余腿）三把刀：开着的预设行 ⇒ 红；关着的 ⇒ 干净；bundle 顶层的 ⇒ 红
      const scannerCodes = (text) => {
        const scan = scanClientUiPlacement({ patchText: text, rowId: ROW_ID, label: '刀', manifestRoots: [pkgDir] })
        return scan.problems.map((p) => p.code)
      }
      const knifePresetOn = scannerCodes(clientUiPatchFixture({ dashboard: 'preset', synthetic: 'preset', dashboardRow: dashOff, syntheticRow }))
      const knifePresetOff = scannerCodes(clientUiPatchFixture({
        dashboard: 'preset', synthetic: 'preset', dashboardRow: dashOff, syntheticRow: { ...syntheticRow, disabled: true },
      }))
      const knifeBundleTop = scannerCodes(clientUiPatchFixture({ dashboard: 'preset', synthetic: 'bundle-top', dashboardRow: dashOff, syntheticRow }))
      rec.readings.bundle_knife = { on_codes: knifePresetOn, off_codes: knifePresetOff, bundle_top_codes: knifeBundleTop }

      const pCodesOf = (name) => profileScans[name].problems.map((p) => p.code)
      const bCodesOf = (name) => bundleScans[name].problems.map((p) => p.code)
      const exactly = (got, want) => JSON.stringify([...got].sort()) === JSON.stringify([...want].sort())
      if (pCodesOf('control').length !== 0) {
        problems.push(problem(DASH16.ruler, `profile 夹具的"正确形状"（两行都在顶层 insert）被判出 ${JSON.stringify(pCodesOf('control'))} —— 判据连正确形状都过不了：先修尺子`))
      }
      if (!exactly(pCodesOf('syntheticInOverride'), [DASH16.clientNotInProfileInsert])) {
        problems.push(problem(DASH16.knifeVector,
          `刀（合成行写成 profile 顶层 override，无标记、无点名）翻出来的面是 ${JSON.stringify(pCodesOf('syntheticInOverride'))}，`
          + `应当只有 ${JSON.stringify([DASH16.clientNotInProfileInsert])} —— 这一把刀必须能抓住"作者从没登记过"的行`))
      }
      if (!exactly(pCodesOf('syntheticNested'), ['DASH-NOT-PROFILE-INSERT'])) {
        problems.push(problem(DASH16.knifeVector,
          `刀（看板行塞进别人 config.plugins）翻出来的面是 ${JSON.stringify(pCodesOf('syntheticNested'))}，应当只有 ${JSON.stringify(['DASH-NOT-PROFILE-INSERT'])}`))
      }
      if (!exactly(knifePresetOn, [DASH16.clientInPreset])) {
        problems.push(problem(DASH16.knifeVector, `残余腿的刀（开着的预设行）翻出来的面是 ${JSON.stringify(knifePresetOn)}，应当只有 ${JSON.stringify([DASH16.clientInPreset])}`))
      }
      if (knifePresetOff.length !== 0) {
        problems.push(problem(DASH16.knifeVector, `残余腿的刀（同一行但 \`disabled: true\`）还判出 ${JSON.stringify(knifePresetOff)} —— "关着的行可以留"这条规矩不成立，那把刀量的不是"开关"`))
      }
      // 🔴 第 2 条的刀：bundle 顶层（不是 insert、不是预设）的客户端 UI 行 ⇒ 自己的码（那条旧码 `DASH-HOST-MISSING` 的替代面之一）
      if (!exactly(knifeBundleTop, [DASH16.clientInBundleTop])) {
        problems.push(problem(DASH16.knifeVector,
          `刀（合成行写在 bundle 顶层 override —— 不是 "- insert:" 的直接成员、也不在预设里）翻出来的面是 ${JSON.stringify(knifeBundleTop)}，`
          + `应当只有 ${JSON.stringify([DASH16.clientInBundleTop])} —— bundle 层没有宿主装载层了，写在顶层的那一行没有人管`))
      }
      // 🔴 第 3 条的两把裸名刀：同一个位置，只换 `name` 的写法
      if (!exactly(pCodesOf('bareInPreset'), [DASH16.clientNotInProfileInsert])) {
        problems.push(problem(DASH16.knifeVector,
          `刀（预设体里一行**裸包名**，解析到 ${syntheticPkg.pkg_name} 这个声明了 web 的包）翻出来的面是 ${JSON.stringify(pCodesOf('bareInPreset'))}，`
          + `应当只有 ${JSON.stringify([DASH16.clientNotInProfileInsert])} —— 否则裸名 fail-open`))
      }
      if (!exactly(pCodesOf('unresolvedInPreset'), [DASH16.rowPackageUnresolved])) {
        problems.push(problem(DASH16.knifeVector,
          `刀（预设体里一行解析不到的裸包名 ${UNRESOLVABLE_BARE_NAME}）翻出来的面是 ${JSON.stringify(pCodesOf('unresolvedInPreset'))}，`
          + `应当只有 ${JSON.stringify([DASH16.rowPackageUnresolved])}`))
      }
      // 扫描器必须**还**能对"看板行开着住在预设层"出声（新码；旧 `DASH-HOST-MISSING` 已退役，见文件头）
      if (!bundleScans.dashInPresetOn.problems.some((p) => p.code === DASH16.clientInPreset)) {
        problems.push(problem(DASH16.knifeUnreadable,
          `\`scanClientUiPlacement()\` 对"看板行在预设层、开着"的夹具报不出 \`${DASH16.clientInPreset}\`（实得 ${JSON.stringify(bundleScans.dashInPresetOn.problems.map((p) => p.code))}）`
          + ' —— 残余腿借的那台扫描器自己哑了，它报的"没有开着的行"就不能当读数'))
      }
      // 🔴 迁移前那个形状（看板行住在 **bundle 顶层 insert**）现在必须是红 —— 它取代的正是旧码的命题
      if (!exactly(bCodesOf('dashInBundleInsert'), [DASH16.clientInBundleTop])) {
        problems.push(problem(DASH16.knifeVector,
          `刀（看板行住在 bundle 顶层 insert —— 2026-11-05 迁移前那个形状）翻出来的面是 ${JSON.stringify(bCodesOf('dashInBundleInsert'))}，`
          + `应当只有 ${JSON.stringify([DASH16.clientInBundleTop])}`))
      }
      if (bCodesOf('control').length !== 0) {
        problems.push(problem(DASH16.ruler,
          `bundle 夹具的"正确形状"（客户端 UI 行只在预设体里、且 \`disabled: true\`）被判出 ${JSON.stringify(bCodesOf('control'))} —— 判据连正确形状都过不了：先修尺子`))
      }
      if (bundleScans.control.reading.warnings.length > 0 || profileScans.control.reading.warnings.length > 0) {
        problems.push(problem(DASH16.ruler, '合成夹具自己就有解析器读不懂的行 —— 这一跑的翻面证据不成立'))
      }
      // 刀的"语义成立"自证：合成行必须靠**它自己的 package.json** 被认出来（不是靠名字像 / id 熟）
      const classified = profileScans.syntheticInOverride.reading.client_ui_rows.find((r) => String(r.name) === syntheticPkg.name)
      if (classified === undefined || !String(classified.pkg).endsWith('client-ui-probe/package.json')) {
        problems.push(problem(DASH16.knifeUnreadable,
          `profile 侧的扫描器没有把合成行解析到它自己的包（实得 ${JSON.stringify(classified ?? null)}）—— 这把刀量不到"语义"那一面`))
      }
      // 证据（不是判据）：这把刀的那一行在两个生产输入里**都没有**任何登记痕迹
      const markerLines = (clientUiPatchFixture({ dashboard: 'host', synthetic: 'preset', dashboardRow, syntheticRow }).match(/#\s*@host-level/g) ?? []).length
      const registration = {
        synthetic_row_id: SYNTHETIC_ROW_ID,
        synthetic_pkg_name: syntheticPkg.pkg_name,
        fixture_marker_lines: markerLines,
        in_real_patch: bundleText === null ? null : bundleText.includes(SYNTHETIC_ROW_ID),
        in_profile_patch: profile.text === null ? null : profile.text.includes(SYNTHETIC_ROW_ID),
        in_real_profile: profile.text === null ? null : profile.text.includes(syntheticPkg.pkg_name),
      }
      rec.readings.knife_registration = registration
      if (registration.fixture_marker_lines !== 0 || registration.in_real_patch === true
        || registration.in_profile_patch === true || registration.in_real_profile === true) {
        problems.push(problem(DASH16.knifeUnreadable,
          `这把刀的夹具行不再是"谁都没登记过的行"（marker 行 ${registration.fixture_marker_lines} · 真补丁 ${String(registration.in_real_patch)}`
          + ` · profile 补丁 ${String(registration.in_profile_patch)} · 真实 profile 里的包名 ${String(registration.in_real_profile)}）—— 刀的命题不成立`))
      }
      /**
       * 🔴 **分流政策的刀**（`mountVerdict()` 只把 `scope: 'unreadable'` 翻成 HOLD，所以它必须能被量）：
       *   · 看板行**缺席** ⇒ **RED 1 / HOLD 0**（今天真树的形状：挂载没做就是红，第三态不再吸收它）；
       *   · **别的**客户端 UI 行（合成行，`scope: 'other'`）放进 profile 的 override ⇒ **RED 1 / HOLD 0**；
       *   · 预设体里**读不到**的行 ⇒ **RED 0 / HOLD 1**（码是它自己的）；
       *   · 缺席 + 读不到同时出现 ⇒ **RED 1 + HOLD 1**（第三态不许吞红，红也不许吞第三态）。
       */
      const absent = scanProfile(profilePatchFixture({ placement: 'absent', row: dashboardRow }), '夹具·看板行还没挂')
      const policyGrid = {
        absent: mountVerdict({ problems: absent.problems }),
        otherRow: mountVerdict({ problems: profileScans.syntheticInOverride.problems }),
        unreadable: mountVerdict({ problems: profileScans.unresolvedInPreset.problems }),
        mixed: mountVerdict({
          problems: [
            problem('DASH-PROFILE-MOUNT-MISSING', '合成的缺席问题（⇒ 红）', { scope: 'mount' }),
            problem('DASH-ROW-PACKAGE-UNRESOLVED', '合成的读不到问题（⇒ HOLD，且不许吞红）', { scope: 'unreadable' }),
          ],
        }),
      }
      rec.readings.policy_grid = Object.fromEntries(Object.entries(policyGrid).map(([k, v]) => [
        k, { red: v.red.map((p) => p.code), hold: v.holds.map((h) => h.code) },
      ]))
      const gridOf = (k) => ({ red: [...policyGrid[k].red.map((p) => p.code)].sort(), hold: [...policyGrid[k].holds.map((h) => h.code)].sort() })
      const expectGrid = (k, want) => {
        const got = gridOf(k)
        const wanted = { red: [...want.red].sort(), hold: [...want.hold].sort() }
        if (JSON.stringify(got) !== JSON.stringify(wanted)) {
          problems.push(problem(DASH16.knifeVector, `分流政策的刀 ${k} 翻出来的面是 ${JSON.stringify(got)}，应当是 ${JSON.stringify(wanted)} —— HOLD 那一半没有翻面（政策死 / 政策漏 / 放得太宽）`))
        }
      }
      expectGrid('absent', { red: ['DASH-PROFILE-MOUNT-MISSING'], hold: [] })
      expectGrid('otherRow', { red: [DASH16.clientNotInProfileInsert], hold: [] })
      expectGrid('unreadable', { red: [], hold: [DASH16.rowPackageUnresolved] })
      expectGrid('mixed', { red: ['DASH-PROFILE-MOUNT-MISSING'], hold: ['DASH-ROW-PACKAGE-UNRESOLVED'] })
    } catch (err) {
      problems.push(problem(DASH16.ruler, `合成夹具造不出来：${String(err?.message ?? err)} —— 这一跑的翻面证据不成立`))
    }

    // ── 读数收口：跑动中活树有没有被人动过（读数，不冒充判据）──────────────
    const after = snapshotOf(PATCH_FILE)
    const afterProfile = snapshotOf(profile.snap.path)
    rec.readings.after = { patch: after, profile_patch: afterProfile }
    rec.readings.tree_changed_during_case = {
      patch: after.sha256 !== patchSnap.sha256,
      profile_patch: afterProfile.sha256 !== profile.snap.sha256,
    }
    // ── 出口：`scope: 'unreadable'` 那几条记 HOLD（带自己的码），其余**全部**照旧红 ──────────
    const verdict = mountVerdict({ problems })
    rec.readings.verdict = {
      profile_mount_present: profile.snap.exists ? rec.readings.profile?.dashboard?.occurrences > 0 : null,
      bundle_semantic_client_rows: residual === null ? null : residual.reading.client_ui_rows.length,
      bundle_enabled_in_preset: residual === null ? null : residual.reading.violations.filter((v) => v.disabled !== true).length,
      red_codes: verdict.red.map((p) => p.code),
      hold_codes: verdict.holds.map((h) => h.code),
    }
    for (const h of verdict.holds) caseHold(rec, h.code, h.why)
    caseFail(verdict.red)
  })
})
