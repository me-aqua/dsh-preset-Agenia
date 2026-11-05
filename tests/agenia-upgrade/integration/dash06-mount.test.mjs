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
 *      · **还没挂**（profile 补丁里没有这一行）⇒ **HOLD `DASH-MOUNT-DISABLED-PENDING-PROFILE-LAYER`**
 *        （第三态，**不是绿**）：挂载路线今天还在搬层，`.tools/mount-dashboard-profile.mjs --apply`
 *        还没跑（客户端开着时它自己会拒写）。那一行一出现，这一格立刻回到红/绿两态。
 *        ⚠️ "还没挂"与"挂过又丢了"在本格分不开（判据没有记忆）—— 后者由 `BOOT-01` 的 R5 条件式
 *        （行不在而身份 RED ⇒ `BOOT-ROLLBACK-DID-NOT-RESTORE`）与挂载工具的 `--check` 兜；
 *        本格对这两种都只给 HOLD，**永不假绿**。
 *   ② **翻面**（合成夹具 + 真字节，全在运行根里造，活树一个字节不动）：
 *      · 阳性：`insert` 形状干净 · `absent` 形状在"不 pending"时必须红（证明 HOLD 那一半不是装饰）·
 *        `override` / `nested`（住错层）⇒ **只有** `DASH-NOT-PROFILE-INSERT` ·
 *        带 `id` / `disabled` / 包没声明 / 没 `root` ⇒ 各自的码；
 *      · **真字节阳性对照**：把真 profile 补丁原文 + **真形状的挂载块**（`appendMountBlock()`）喂一遍，
 *        必须干净 —— 修好之后它与"真文件本来就有那一行"是恒等变换，仍然要求干净。
 *   ③ **bundle 层的派生物**（这一腿**不是**挂载面，是同一份票依赖的另一条不变量，原样保留）：
 *      生成的 `presets/agenia/cordis.patch.yml` 必须**等于** `.tools/make-bundle-patch.mjs` 从
 *      `agent.cordis.yml` 造出来的那一份 —— **跑仓库自己的 `--check`**（不另写比较逻辑），
 *      不一致 ⇒ `DASH-PATCH-NOT-DERIVED`。跑之前一道**安全联锁**（`--check` 分支必须先于写盘，
 *      否则不跑、记 `HOLD DASH-PATCH-CHECK-UNAVAILABLE` —— 生成器加载期就会写活体）；跑完再量一次
 *      活体 sha256（变了 ⇒ `DASH-PATCH-CHECK-WROTE-PRESET`）。
 *      ⚠️ 为什么它留在这一格：用例 ID 是冻结的（分母 150，不许新增），而这条不变量今天没人判。
 *        **两个主语写在这里，不藏着**：①②是 profile 层，③是 bundle 层。
 *
 * ── `DASH-16` 判什么（语义面：不读标记、不读点名表、不认行 id）──────────────────
 *   ⓪ 同一份读取器覆盖（见 `DASH-15` ⓪）。
 *   ① **profile 层的语义面**：对 profile 补丁里**每一行**（带 `name` 的映射），用 `name` 解析到盘上的
 *      `package.json`；声明了 `dsh.client.platform: web` 却**不是**顶层 `- insert:` 的直接成员 ⇒
 *      `DASH-CLIENT-NOT-IN-PROFILE-INSERT`（**红**，`scope: 'other'`）。
 *      这一条要抓的正是"作者从没登记过的新行"：它叫什么、谁点名过它，都不影响判断。
 *      当前看板那一行自己的层归属归 `DASH-15` ①，这里只留 `scope: 'mount'` 的同一份读数（HOLD 口径相同）。
 *   ② **bundle 层的残余腿**（**没跟着迁走的那半句话**）：预设 `plugins` 里的客户端 UI 行**只许关着**
 *      —— 行**开着** ⇒ `DASH-CLIENT-IN-PRESET`（红：那正是 2026-11-05 16:0x boot 事故的形状）。
 *      关着的那一行（今天 = 看板）是**允许**的，但它必须**两侧都关**：组合说 `disabled: true` 而补丁里
 *      每一处出现也 `disabled: true`，只翻一侧 ⇒ `DASH-DISABLED-MISMATCH`（红：补丁是派生物）。
 *      ⇒ 这一腿一句话：**"还留着的行必须关着"**，不是"必须住在宿主 insert"（那个形状已经不存在了）。
 *   ③ **翻面**：只存在于夹具里的合成包（`dsh.client.platform: web`）+ 合成行 ——
 *      放进 profile 的 `- insert:` ⇒ 干净；放进 profile 的顶层 override / 更深一层 ⇒ **只有**
 *      `DASH-CLIENT-NOT-IN-PROFILE-INSERT`；放进 **bundle 预设且开着** ⇒ **只有** `DASH-CLIENT-IN-PRESET`；
 *      同一行放进 bundle 预设但 `disabled: true` ⇒ **干净**（"关着可以留"这条规矩必须能翻面）。
 *      刀翻错面 ⇒ `DASH-KNIFE-VECTOR`；夹具行解析不到它自己的包 / 在生产输入里留了登记痕迹
 *      ⇒ `DASH-KNIFE-UNREADABLE`（尺子坏了不是对象坏了）。
 *
 * ── 退役的码（写清原因，不静默消失）───────────────────────────────────────────────
 *   · `DASH-NOT-HOST-LEVEL` / `DASH-ROW-ABSENT`：它们断言"bundle 补丁里那一行必须住在宿主 insert /
 *     整行不许没有"。本票之后那个形状**按设计不存在**（宿主 insert 在 bundle 层是 boot 杀手）。
 *     替代：`DASH-NOT-PROFILE-INSERT` + `DASH-PROFILE-MOUNT-MISSING`（profile 层同一件事）。
 *   · `DASH-HOST-MISSING`（阳性腿"整份补丁里一行客户端 UI 都没有"）：迁到 profile 层之后，
 *     阳性腿由"看板那一行必须在 profile insert 里"承担 —— 它今天 HOLD、永不假绿，空集那半句话自动成立。
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
  DISABLED_PENDING_CODE,
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
const CODE = {
  patchUnreadable: 'DASH-PATCH-UNREADABLE',
  profilePatchMissing: 'DASH-PROFILE-PATCH-MISSING',
  notDerived: 'DASH-PATCH-NOT-DERIVED',
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
  clientNotInProfileInsert: 'DASH-CLIENT-NOT-IN-PROFILE-INSERT',
  patchUnreadable: CODE.patchUnreadable,
  disabledMismatch: CODE.disabledMismatch,
  ruler: CODE.ruler,
  knifeVector: CODE.knifeVector,
  knifeUnreadable: CODE.knifeUnreadable,
}
/** 只存在于夹具里的行 id —— 它不许出现在生产树的任何一份文件里（`knife_registration` 盯着）。 */
const SYNTHETIC_ROW_ID = 'future-client-ui-panel'

/**
 * 🔴 **"还没挂" 的分流政策**（2026-11-05 · 挂载路线搬到 profile 层之后）。
 *
 * 只有**一个**理由能把红翻成 HOLD：**目标形状故意不在**（`pending = true`，= profile 补丁里
 * 还没有看板那一行）。而且只对 `detail.scope === 'mount'` 那几条生效 ——
 *   ① **"还没挂"**（`pending`）⇒ 层归属那几条记 **HOLD**（第三态，**不是绿**）；
 *   ② `pending = false`（那一行在）⇒ 一条都不动：**该红就红**（这是刀要量的一半，不许放宽）；
 *   ③ 行体 / 包声明 / 读取器 / 派生物（`scope: 'other'`）**任何时候都照旧红** ——
 *      "还没挂"解释不了"包没声明 dsh.client"，也解释不了"生成的补丁不是派生物"。
 */
function mountVerdict({ problems, pending, why = null }) {
  if (!pending) return { red: problems, holds: [] }
  const red = problems.filter((p) => p.detail?.scope !== 'mount')
  const mount = problems.filter((p) => p.detail?.scope === 'mount')
  return {
    red,
    holds: [{
      code: DISABLED_PENDING_CODE,
      why: why ?? `挂载路线正在从 bundle 层搬到 **profile 层**（2026-11-05 定形）：profile 补丁里**还没有**看板那一行，`
        + '所以"它必须住在顶层 `- insert:` 里"这一格的目标形状**故意不在** —— 这一格不判对错，记 HOLD（不是绿）。'
        + '`.tools/mount-dashboard-profile.mjs --apply` 跑完（那一行出现）之后，这一格自动回到红/绿两态。'
        + (mount.length > 0
          ? `本来会报的层归属码：${JSON.stringify([...new Set(mount.map((p) => p.code))])}（${mount.length} 条；明细见 result.json 的 readings.profile_mount / fixtures）`
          : '（这一跑本来没有层归属可报：读取器没读到任何一行）'),
    }],
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

    let profilePending = false
    if (!profile.snap.exists) {
      caseHold(rec, CODE.profilePatchMissing,
        `客户端那份 profile 补丁不在（${profile.where.path}，来源 ${profile.where.source}）⇒ 挂载形状判不了 —— HOLD（不是绿）。`
        + '别的机器 / 干净 clone 上它本来就不在；这一格只能在装着客户端的那台机器上量')
      profilePending = true // 没有文件 = 目标形状不在（不许把"判不了"读成"红"）
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
      profilePending = real.reading.dashboard.occurrences === 0

      // ── ② 翻面：合成夹具 + 真字节阳性对照 ────────────────────────────────────
      const realPkg = dashboardPackageFacts(DASHBOARD_MANIFEST)
      const goodRow = {
        name: `file:///${path.join(PATHS.finalPreset, 'client-ui-dashboard', 'lib', 'index.js').replace(/\\/g, '/')}`,
        root: path.resolve(PATHS.repo).replace(/\\/g, '/'),
      }
      rec.readings.fixture_row = goodRow
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
          // 还没挂：整行没有（这一格今天就是真树的形状）
          absent: scan(profilePatchFixture({ placement: 'absent', row: goodRow }), '夹具·整行没有'),
        }
        rec.readings.fixtures = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [
          k, { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), reading: v.reading },
        ]))

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

        /**
         * 🔴 **分流政策自己的刀**（`mountVerdict()` 能把红翻成 HOLD，所以它必须能被量）。三格：
         *   · 整行没有 + `pending` ⇒ **HOLD 1 / RED 0**（这正是今天真树的形状）；
         *   · 同一份夹具但 `pending=false` ⇒ **RED 1 / HOLD 0**（🔴 那一行在就必须红 —— 政策不许放宽）；
         *   · 住错层 + `pending=false` ⇒ **RED 1 / HOLD 0**；住错层 + `pending` ⇒ 也 HOLD（目标形状不在，
         *     层归属本来就判不了）；而 `disabled` 那一格（`scope: 'other'`）**即使 pending 也照旧红**。
         */
        const policyGrid = {
          absentPending: mountVerdict({ problems: fixtures.absent.problems, pending: true }),
          absentOn: mountVerdict({ problems: fixtures.absent.problems, pending: false }),
          overridePending: mountVerdict({ problems: fixtures.override.problems, pending: true }),
          overrideOn: mountVerdict({ problems: fixtures.override.problems, pending: false }),
          disabledOn: mountVerdict({ problems: fixtures.disabled.problems, pending: false }),
          // 纯函数级的刀：`pending` 只许吸收 `scope: 'mount'` 那几条，`scope: 'other'` 一条都不许吞
          mixedScopePending: mountVerdict({
            problems: [
              problem('DASH-PROFILE-MOUNT-MISSING', '合成的 mount 面问题（本来会报）', { scope: 'mount' }),
              problem('DASH-NO-CLIENT-DECL', '合成的 other 面问题（绝不许被 HOLD 吞掉）', { scope: 'other' }),
            ],
            pending: true,
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
        expectGrid('absentPending', { red: [], hold: [DISABLED_PENDING_CODE] })
        expectGrid('absentOn', { red: ['DASH-PROFILE-MOUNT-MISSING'], hold: [] })
        expectGrid('overridePending', { red: [], hold: [DISABLED_PENDING_CODE] })
        expectGrid('overrideOn', { red: ['DASH-NOT-PROFILE-INSERT'], hold: [] })
        expectGrid('disabledOn', { red: ['DASH-PROFILE-ROW-DISABLED'], hold: [] })
        expectGrid('mixedScopePending', { red: ['DASH-NO-CLIENT-DECL'], hold: [DISABLED_PENDING_CODE] })
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
      profile_patch: snapshotOf(profile.snap.path),
    }
    rec.readings.after = afterAll
    rec.readings.tree_changed_during_case = {
      patch: afterAll.patch.sha256 !== patchSnap.sha256,
      composition: afterAll.composition.sha256 !== compositionSnap.sha256,
      generator: afterAll.generator.sha256 !== generatorSnap.sha256,
      profile_patch: afterAll.profile_patch.sha256 !== profile.snap.sha256,
    }
    // ── 出口：把"还没挂"那几条翻成 HOLD（`mountVerdict()`），其余照旧红 ──────────
    const verdict = mountVerdict({ problems, pending: profilePending })
    rec.readings.verdict = {
      profile_mount_pending: profilePending,
      derived: derivationVerdict === null ? null : derivationVerdict.derived,
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
    let profilePending = false
    if (!profile.snap.exists) {
      caseHold(rec, CODE.profilePatchMissing,
        `客户端那份 profile 补丁不在（${profile.where.path}，来源 ${profile.where.source}）⇒ 层归属判不了 —— HOLD（不是绿）`)
      profilePending = true
    } else {
      const real = scanProfilePlacement({
        patchText: profile.text,
        label: 'profile 补丁',
        manifestRoots: [PATHS.finalPreset],
        dashboardManifest: DASHBOARD_MANIFEST,
      })
      rec.readings.profile = real.reading
      for (const p of real.problems) problems.push(p)
      profilePending = real.reading.dashboard.occurrences === 0
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
       * 残余腿只消费 `reading.violations`（换成"开着的才红"），所以扫描器自己报的那两条
       * **本格不判**的码要显式剔掉：`DASH-HOST-MISSING`（"看板必须在 bundle 宿主 insert"——形状已退役）
       * 与 `DASH-CLIENT-IN-PRESET`（本格只认"开着的"那一半）。
       * 🔴 其余一律照旧红 —— 尤其 `DASH-PATCH-UNREADABLE`：不然"补丁读不懂"会让
       * `violations` 变成空数组 ⇒ 看起来"没有开着的行"⇒ 静默假绿（Gate-2 那个病的同一个形状）。
       */
      const NOT_JUDGED_HERE = new Set(['DASH-HOST-MISSING', 'DASH-CLIENT-IN-PRESET'])
      rec.readings.bundle.scanner_codes = residual.problems.map((p) => p.code)
      for (const p of residual.problems) {
        if (NOT_JUDGED_HERE.has(p.code)) continue
        problems.push(p)
      }
      // 语义面：装在预设层里、**开着**的客户端 UI 行 = 2026-11-05 16:0x boot 事故的形状 ⇒ 红
      const enabledInPreset = residual.reading.violations.filter((v) => v.disabled !== true)
      rec.readings.bundle.enabled_in_preset = enabledInPreset
      for (const v of enabledInPreset) {
        problems.push(problem(DASH16.clientInPreset,
          `生成的 bundle 补丁里，预设层那一行 \`${v.id ?? v.name}\` 指向的包（${v.pkg}）声明了 \`dsh.client.platform: web\` 而它是**开着**的`
          + ` —— 预设层的客户端 UI 行宿主装载层收不到，而这一行开着就是 2026-11-05 16:0x 那个 boot 事故的形状（整层 boot 失败 ⇒ 新会话窄权限）。`
          + '挂载走 profile 层之后，这一行只许保持 `disabled: true`（或者整行删掉）',
          { scope: 'other', row_id: v.id ?? null }))
      }
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
      }
      rec.readings.fixtures_profile = Object.fromEntries(Object.entries(profileScans).map(([k, v]) => [
        k, { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), reading: v.reading },
      ]))

      // ③b bundle 层残余腿：合成行放进预设（开着 ⇒ 红；关着 ⇒ 干净）
      const bundleScan = (text, label) => scanClientUiPlacement({ patchText: text, rowId: ROW_ID, label, manifestRoots: [pkgDir] })
      const bundleScans = {
        control: bundleScan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'absent', dashboardRow, syntheticRow }), '夹具·bundle·正确形状'),
        syntheticInPresetOn: bundleScan(clientUiPatchFixture({ dashboard: 'host', synthetic: 'preset', dashboardRow, syntheticRow }), '夹具·bundle·合成行放进预设（开着）'),
        syntheticInPresetOff: bundleScan(clientUiPatchFixture({
          dashboard: 'host', synthetic: 'preset', dashboardRow, syntheticRow: { ...syntheticRow, disabled: true },
        }), '夹具·bundle·合成行放进预设但 disabled'),
        dashInPreset: bundleScan(clientUiPatchFixture({ dashboard: 'preset', synthetic: 'absent', dashboardRow, syntheticRow }), '夹具·bundle·看板行在预设层'),
      }
      rec.readings.fixtures_bundle = Object.fromEntries(Object.entries(bundleScans).map(([k, v]) => [
        k, { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), reading: v.reading },
      ]))

      // 判据（残余腿）要把"开着的预设行"翻成红、"关着的"放过去
      const residualCodes = (text) => {
        const scan = scanClientUiPlacement({ patchText: text, rowId: ROW_ID, label: '刀', manifestRoots: [pkgDir] })
        return scan.reading.violations.filter((v) => v.disabled !== true).map(() => DASH16.clientInPreset)
      }
      const knifePresetOn = residualCodes(clientUiPatchFixture({ dashboard: 'host', synthetic: 'preset', dashboardRow, syntheticRow }))
      const knifePresetOff = residualCodes(clientUiPatchFixture({
        dashboard: 'host', synthetic: 'preset', dashboardRow, syntheticRow: { ...syntheticRow, disabled: true },
      }))
      rec.readings.bundle_knife = { on_codes: knifePresetOn, off_codes: knifePresetOff }

      const pCodesOf = (name) => profileScans[name].problems.map((p) => p.code)
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
      // 扫描器自己那半条阳性腿（本格不拿它判词，但它必须还能翻面 —— 否则残余腿借的是死代码）
      if (!bundleScans.dashInPreset.problems.some((p) => p.code === 'DASH-HOST-MISSING')) {
        problems.push(problem(DASH16.knifeUnreadable,
          `\`scanClientUiPlacement()\` 对"看板行在预设层"的夹具已经报不出 \`DASH-HOST-MISSING\`（实得 ${JSON.stringify(bundleScans.dashInPreset.problems.map((p) => p.code))}）`
          + ' —— 残余腿借的那台扫描器自己哑了，它报的"没有开着的行"就不能当读数'))
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
       * 🔴 **分流政策的刀**（`mountVerdict()` 能把红翻成 HOLD，所以它自己必须能被量）。三格：
       *   · 看板行还没挂 + `pending` ⇒ **HOLD 1 / RED 0**（今天真树的形状；`scope: 'mount'` 才翻）；
       *   · 同一份夹具但 `pending=false` ⇒ **RED 1 / HOLD 0**（🔴 那一行在就必须红）；
       *   · **别的**客户端 UI 行（合成行，`scope: 'other'`）放进 profile 的 override + `pending=true`
       *     ⇒ **RED 1 + HOLD 1** —— 🔴 这一格最容易被放宽：HOLD 只解释"看板那一行还没挂"，
       *     **不许**把别的客户端 UI 行的红一起吞掉。
       */
      const absent = scanProfile(profilePatchFixture({ placement: 'absent', row: dashboardRow }), '夹具·看板行还没挂')
      const policyGrid = {
        absentPending: mountVerdict({ problems: absent.problems, pending: true }),
        absentOn: mountVerdict({ problems: absent.problems, pending: false }),
        otherRowPending: mountVerdict({ problems: profileScans.syntheticInOverride.problems, pending: true }),
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
      expectGrid('absentPending', { red: [], hold: [DISABLED_PENDING_CODE] })
      expectGrid('absentOn', { red: ['DASH-PROFILE-MOUNT-MISSING'], hold: [] })
      expectGrid('otherRowPending', { red: [DASH16.clientNotInProfileInsert], hold: [DISABLED_PENDING_CODE] })
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
    // ── 出口：把"还没挂"那条看板层归属翻成 HOLD；别的客户端 UI 行照旧红 ──────────
    const verdict = mountVerdict({ problems, pending: profilePending })
    rec.readings.verdict = {
      profile_mount_pending: profilePending,
      bundle_semantic_client_rows: residual === null ? null : residual.reading.client_ui_rows.length,
      bundle_enabled_in_preset: residual === null ? null : residual.reading.violations.filter((v) => v.disabled !== true).length,
      red_codes: verdict.red.map((p) => p.code),
      hold_codes: verdict.holds.map((h) => h.code),
    }
    for (const h of verdict.holds) caseHold(rec, h.code, h.why)
    caseFail(verdict.red)
  })
})
