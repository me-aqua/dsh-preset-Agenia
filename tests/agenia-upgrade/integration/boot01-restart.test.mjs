/**
 * `BOOT-01` · **启动后读数 A（身份）** —— 新建会话的头 `agentPreset === 'agenia'`。
 * `BOOT-02` · **启动后读数 B（包可达）** —— 宿主能不能把这份 `client.js` 交给浏览器。
 *
 * 来历：`.team/leader/2026-11-05/定形-看板挂载profile层.md`（R2 / R3 / R5）+ 当天 log §十三
 * （16:0x 客户端重启后新会话掉进窄权限 `E_GUARD_NARROW_TOOL`，而盘上读数全绿）。
 * 量具在 `support/boot-readings.mjs`（口径与为什么长这样，全写在那个文件头）。
 *
 * ── `BOOT-01` 判什么（三层，**缺一层就不许绿**）────────────────────────────────
 *   ⓪ **尺子自证**：拿盘上**真实**的两份会话流各喂一次 ——
 *      · 阴性 = `agentPreset: "standard"` 的那一份（事故现场那份）；必须判 `RED`；
 *      · 阳性 = `agenia` 的那一份（重启之后新建的那一份）；必须判 `GREEN`；
 *      两边判词**必须不同**，否则 `BOOT-R2-DETECTOR-DEAD`（"红"这个字没有合法性来源）。
 *      同时两条交叉必须成立：`zstd-frames.mjs` 全解出来的头 = `zstdDecompressSync`（只解第一帧）
 *      解出来的头；不等 ⇒ `BOOT-R2-HEADER-NOT-IN-FIRST-FRAME`（尺子坏了）。
 *      🔴 **阴性的那一份是"续跑回来的老会话"**（头写于 2026-10-19T03:03:54.661Z）—— 它证明的是
 *      "这个探测器会翻面"，**不是**"重启之后预设没注册"。
 *   ⓪' **锚点翻面（合成会话流）**：`bug-20261110-07` 之后，这一格比的时刻是
 *      **首轮对话开始的时刻**（`IDENTITY_ANCHOR`：会话流里第一条 `turn/start` 帧的 `time`），
 *      不是 `header.createdAt`。三条合成流各喂一次真读取器（`readSessionHeader`）：
 *      · **A 建于 11-06、今天才第一次说话** ⇒ 必须算"T 之后的新会话"（**GREEN**，这是负控①）；
 *      · **B 建于 11-06、11-06 就说过话** ⇒ **不许**算（负控②；它进 `resumed`，不当证据）；
 *      · **C 今天建、今天说话** ⇒ 算（阳性对照）；
 *      外加两把刀：**旧锚点刀**（按 `createdAt >= T` 选 ⇒ A 必须选不中 —— 那就是本病的形状）
 *      与 **T 翻面**（把 T 挪到 A 的首轮之后 ⇒ 一个都选不中 ⇒ 判词必须变 HOLD）。
 *      ⇒ 这一格既证明"新锚点选得中"，也证明"它选得中**是因为**首轮那个时刻"。
 *   ① **身份**：`T` = 这一次客户端启动的时刻（`AGENIA_BOOT_AT` 或宿主进程启动时刻）；
 *      取该工作区里**首轮对话在 `T` 之后**、**顶层**（`delegationDepth === 0` 且不是委派会话）的
 *      最新一份会话，判它的 `agentPreset`：
 *        · 有样本：`'agenia'` ⇒ 这一格成立 · `'standard'` ⇒ `RED BOOT-PRESET-NOT-REGISTERED`
 *          （= 事故形态：无角色 ⇒ 窄权限）· 别的值 ⇒ `RED BOOT-PRESET-UNEXPECTED`。
 *        · **没有样本**（`bug-20261113-18`，老板 2026-11-13 原话：「不要再搞这种需要我开新会话的
 *          判据了，偶尔一次还行，如果每天都需要我开新会话那就是这个条目本身有问题」）⇒ 判词读的是
 *          **距上次重启多久了**，不是"请你去开个新会话"：
 *          `restart_age_days < 3` ⇒ `HOLD BOOT-NO-SESSION-AFTER-RESTART`（读数带 `restart_age_days`
 *          + 具名 owner + 到期时刻，报文里**不催人**）；
 *          `>= 3` ⇒ `RED BOOT-NO-SESSION-AFTER-RESTART-EXPIRED`，报文点名年龄与到期时刻。
 *          ⇒ "没有样本"**不是**永久 HOLD，也**不是**恒绿：它买 3 天，第 3 天起自己变红。
 *          🔴 阈值只作用于**没有样本**那一支；有样本时年龄只当上下文（判词仍由 `presetVerdict()` 给）。
 *          为什么"没有样本"是常态而不是缺口：顶层会话只有客户端「新建会话」能建出来 —— 盘上 111/111
 *          份顶层会话 `origin` 全是 null，机器建的 1856 份都带 `origin: subagent`。
 *      同批落 `readings.identity.post_restart`（`selectPostRestartSample()` 的整份读数）：样本的
 *      **出处**（哪条流 / 头里声明了什么 / `creator_kind`）、放宽入口（`createdAt >= T`，**只在主锚点
 *      空着时**顶上）、以及 `machine_created_after_T`（T 之后的组员会话 —— 只记**不判**）。
 *      ⚠️ 读数里**两个时刻都给**（`createdAt` 只当上下文）：`readings.identity.anchor` 点名用的
 *      是哪个锚点，`readings.identity.selected_anchor` 写出**比的那个时刻**（`firstTurnAt >= T`）。
 *      同批落一份**反向读数**：同一个 `T` 下**不过滤**顶层会把谁选中（今天 = 委派出去的组员会话，
 *      `agenia-member`）—— 证明那个过滤器是承重的，不是装饰。
 *   ①' **年龄判词 + 放宽样本面 的自证（刀）**：`postRestartRulerLeg()` —— 同一把尺子喂七组合成读数（与
 *      盘上有没有活会话无关），必须各自给出**预期的那一格**：
 *        · `0 天` 无样本 ⇒ **HOLD** 且 `restart_age_days === 0`（卡上的刀①：0 天必须是 HOLD，不是红）；
 *        · `4 天` 无样本 ⇒ **RED `…-EXPIRED`**（卡上的刀②：4 天必须红，并点名年龄）；
 *        · 边界两侧 `2.999 天` ⇒ HOLD / `3 天` ⇒ RED（阈值只有一个意思）；
 *        · **有样本时年龄不许说话**：`0 天` 有样本 ⇒ GREEN；`30 天` 有样本 ⇒ **GREEN**（不是超期红）；
 *        · 两条红**必须分得开**：`4 天` 无样本 ⇒ `…-EXPIRED`，`4 天` 有样本而 preset=`standard`
 *          ⇒ `BOOT-PRESET-NOT-REGISTERED`（两个红混成一个码，就把"该催人"与"该修产品"读成同一句话）；
 *        · `ask` 的口径：HOLD 那一支必须是 `none`（阈值内不许把 HOLD 变成每日功课），
 *          超期 RED 那一支是 `boss-once`；
 *        · `T` 读不出来 ⇒ HOLD `BOOT-R2-RESTART-TIME-UNKNOWN` 且 `restart_age_days === null`
 *          （没有年龄就如实写 null，不许写 0）。
 *      外加 ①'' `selectPostRestartSample()` 的四把刀：`createdAt` 入口**只在主锚点空着时**顶上（两份都在
 *      ⇒ `picked_by === 'firstTurnAt'`）· 只有组员会话 ⇒ `newest === null` 但 `machine_created_after_T`
 *      有记录 · 出处点名 **哪条流 + `creator_kind`**（顶层 `origin: null` ⇒ `undeclared-top-level`，
 *      **不许读成"老板亲手开的"**）。
 *   ② **回滚（R5）**：**撤挂载 = 删 `# @host-level` 标记 + 重跑生成器**（2026-11-05 深夜组长裁定：
 *      "重定义，不退役"）。判两半，各自一个落点：
 *      · **产物 × 落点**（`rollbackRouteReading()`）：标记**在** ⇒ 那一行只住顶层 `- insert:`
 *        （预设体 0 次）；标记**不在** ⇒ 那一行回到**两份**预设体（顶层 insert 0 次）。
 *        盘上只有挂载态，回滚态由真字节投影造；任一端不合契约 ⇒
 *        `RED BOOT-R5-ROLLBACK-CONTRACT-BROKEN`（**不是**"挂载行不在"）。
 *      · **身份**（`rollbackExerciseVerdict()`）：撤掉挂载、重启之后**新建**的会话头仍须是
 *        `agentPreset: agenia` —— 撤挂载不许折掉身份。要求真的做过一次练习
 *        （练习回执；三种来源：`AGENIA_R5_REMOVAL_EXERCISE` / 默认落点
 *        `<workspace>/.team/leader/_r5/receipt.json`（其次日期抽屉里那份）/ 没有）；
 *        两处都没有 ⇒ `HOLD BOOT-R5-REMOVAL-EXERCISE-MISSING`（报文点名来源 `none`）；
 *        回执说身份掉了 ⇒ `RED BOOT-R5-IDENTITY-COST`；有回执但读不出来 ⇒ 红（**不论**来自哪一处）。
 *        回执还须量 `row_disabled`（**那一行是关着的**，`bug-20261110-17`）：`false` ⇒ 红；缺 / `null`
 *        ⇒ `HOLD BOOT-R5-ROW-DISABLED-UNMEASURED`（没量，不绿；补量后重交回执，契约 §3.7.2）。
 *      🔴 旧的两条腿（`oneStepRemoval()` 的"从文件里删一行"、`profilePatchReading()` 的 profile
 *      条件式）**退役**：那个动作在 bundle 路线上不存在，profile 层已是备用路线。
 *      码 `BOOT-ROLLBACK-NO-MOUNT-ROW` 等五个同批退役（墓碑在 `BOOT_CODES` 里）——
 *      尤其那个名字会把"练习没做"读成"挂载行不在"，正好相反。
 *
 * ── `BOOT-02` 判什么（定形 §五：**两条读数都要有，缺一不算挂上**）────────────────
 *   A **boot 载荷**：页面里 `window.__DSH_BOOT__` 的 entry 表有没有这个**包名**
 *     （200 才读得到；401 = token 门禁 = **读不到**，不是"不在"）；
 *   B **插件路由**：`GET /plugins/<包名>/client.js?rev=<rev>` 是否 200 **且**字节与盘上那份对得上。
 *   三态：`200`（证据）/ `404`（**判不了** —— 它同时是"没挂上"和"URL/rev 不对"的形状）/ 连不上。
 *   ⇒ GREEN 只在 A、B **都**拿到证据时；任一条读不到 ⇒ `HOLD BOOT-R3-HALF-PROOF`（带两条各自的码）；
 *     只有 A 读到 200 而表里没有这个包 ⇒ `RED BOOT-R3-ENTRY-NOT-IN-BOOT`。
 *   挂载行（2026-11-05 深夜挂回**我们自己的包**：`presets/agenia/cordis.patch.yml` 的顶层 `- insert:`）
 *   不在 / 关着 / 住错层 ⇒ `HOLD BOOT-R3-MOUNT-ABSENT` / `HOLD BOOT-R3-MOUNT-DISABLED` /
 *   `RED BOOT-R3-MOUNT-NOT-TOP-LEVEL-INSERT`；那份补丁不在 ⇒ `HOLD BOOT-R3-MOUNT-PATCH-MISSING`。
 *   ⚠️ A 腿的 401 口径不变：**401 = 读不到**（token 门禁），不是"不在"。
 *
 * ── 不判什么 ────────────────────────────────────────────────────────────────
 *   · 不判像素（"点开有没有那块面板"归 GUI 清单，人点一次）；
 *   · 不判浏览器真的执行了那份 JS（那是 GUI 那一格）；
 *   · 不替 R1 写 profile 补丁（那是实现岗的活，且只能在客户端关着的时候写）。
 *
 * ── 🔴 读取器覆盖（Gate-2 缺陷 · 2026-11-05 · 两条用例共用）────────────────────
 * 上面**每一条**判词都建立在"读取器看得见整份 profile 补丁"之上。现役补丁第 44–45 行是一处
 * **多行 plain scalar**，窄口径读取器曾经读不懂它 ⇒ 从第 45 行起整段盲掉（18 条未被吃掉的行），
 * 于是 `BOOT-02` 只能永远报 `BOOT-R3-MOUNT-ABSENT`、`BOOT-01` 也会对好文件报"撤不掉"。
 * ⇒ 两条用例都在最前面跑 `patchReaderVerdict()`（`support/boot-readings.mjs`），三段缺一不算自证：
 *   ① **阳性（盘上真实文件）**：这一跑读的那一份 **与** 现役那一份，未解析条数必须 `0`，
 *      且"最后一条顶层 item"必须与**逐行扫原文**那把独立的尺子给出同一个键 ⇒ 否则
 *      `RED BOOT-PATCH-READER-BLIND`（尺子瞎了；底下"不在 / 撤不掉"的判词一律不成立）；
 *   ② **功能阳性（合成）**：多行 plain scalar 必须真被折成一个空格、且它后面那一行还读得到
 *      ⇒ 否则 `RED BOOT-PATCH-READER-NO-FOLD`；
 *   ③ **阴性（合成）**：三种**真坏**的行（标量后跟更深的 `key:` / 引号标量后跟缩进行 /
 *      标量后跟 `- ` 序列项）必须**仍然出声** ⇒ 否则 `RED BOOT-PATCH-READER-FALSE-ACCEPT`
 *      （"什么都肯吃"不许与"读得懂"同形）。
 * 现役文件不在（别的机器 / 干净 clone）⇒ `HOLD BOOT-PATCH-READER-NO-LIVE-FILE`，不绿。
 *
 * 🔴 判据打的是**现役** `presets/agenia` 与**客户端自己那份** profile 补丁；每一条读数都带
 *    `{树, head, measured_at, 文件 bytes/sha256/mtime, T 与 T 的来源}`（定形 §五「命名树与时刻」）。
 */
import { before, test } from 'node:test'
import path from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import zlib from 'node:zlib'
import { caseDir, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { bundleMountReading } from '../support/client-ui-placement.mjs'
import {
  BOOT_CODES,
  EXPECTED_PRESET,
  IDENTITY_ANCHOR,
  POST_RESTART_SAMPLE,
  bootPayloadReading,
  findWorkspaceKey,
  hostBootReading,
  hostUrlReading,
  identityOf,
  listSessions,
  packageReading,
  patchReaderVerdict,
  pluginChunkReading,
  postRestartSampleVerdict,
  presetVerdict,
  profilePatchCoverage,
  readRollbackExercise,
  rollbackExerciseCaseVerdict,
  rollbackExerciseVerdict,
  rollbackRouteReading,
  readSessionHeader,
  restartAgeDays,
  scanHeaders,
  selectNewestAfter,
  selectPostRestartSample,
  sessionRootReading,
  treeIdentity,
} from '../support/boot-readings.mjs'
import { DASHBOARD_PKG_DIR } from '../support/boot-readings.mjs'

before(() => {
  preflight()
})

/** 读一份会话流的头（`session.file` 就是那一份 `.zstd`）；失败由调用方处置。 */
function readHeader(session, tmpDir) {
  const r = readSessionHeader(session.file, { tmpDir })
  return r.ok ? { ok: true, reading: r, identity: identityOf(r) } : { ok: false, reading: r }
}

/** 补丁读数**落盘时别把整份正文塞进去**（只有 `bundleMountReading` 的正文要用来复核字节）。 */
function patchSummary(patch) {
  const { text, ...rest } = patch
  return { ...rest, text_chars: text === null ? null : text.length }
}

/** 一条失败/挂起报文里要带得走的身份（id / 时刻 / preset / 字节 / sha）。 */
const whereOf = (x) =>
  `${x.id ?? x.dir}（建于 ${x.createdAt_iso ?? '?'} · preset=${JSON.stringify(x.agentPreset)} · `
  + `${x.file_bytes ?? '?'} B · sha256 ${String(x.file_sha256 ?? '?').slice(0, 12)}… · 首帧 sha256 ${String(x.first_frame_sha256 ?? '?').slice(0, 12)}…）`

/**
 * 读取器覆盖的收口（`BOOT-01` / `BOOT-02` 共用同一个口径）：
 * 红的进 `problems`、判不了的进 `HOLD`，读数整份落盘（连三组阴性夹具的原文一起，读的人不用猜）。
 */
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

// ── 尺子自证：两份**真实**会话流（阴性 / 阳性）────────────────────────────────
/**
 * 阴性优先按"盘上那份事故现场"的目录名**提示**去找（`session-cc5c68d1…`），
 * 找不到就按**属性**扫（"`createdAt < T` 且 preset ≠ agenia 的顶层会话"）——
 * 提示只是省时间，判定永远靠读出来的字节（`cand-20261021-0091`：不许拿命名形状当全集）。
 */
function findNegativeControl({ sessions, tmpDir, T, hintPrefix = 'session-cc5c68d1', scanLimit = 40 }) {
  const hint = sessions.find((s) => s.dir.startsWith(hintPrefix))
  if (hint !== undefined) {
    const got = readHeader(hint, tmpDir)
    if (got.ok && got.identity.agentPreset !== EXPECTED_PRESET) return { source: 'hint', ...got }
  }
  // 先找**事故那种形状**（`standard`），找不到再退到"任何 ≠ agenia" ——
  // 两种都能自证探测器会翻面，但只有 `standard` 那一种对得上 §十三 的现场。
  let anyWrong = null
  for (const s of sessions.slice(0, scanLimit)) {
    const got = readHeader(s, tmpDir)
    if (!got.ok || got.identity.agentPreset === EXPECTED_PRESET) continue
    if (got.identity.agentPreset === 'standard') return { source: 'scan', ...got }
    if (anyWrong === null) anyWrong = got
  }
  return anyWrong === null ? null : { source: 'scan', ...anyWrong }
}

/** 阳性：`createdAt` 最晚的、顶层、`preset === expected` 的那一份（提示 `session-e0ed642a`，同上）。 */
function findPositiveControl({ sessions, tmpDir, hintPrefix = 'session-e0ed642a', scanLimit = 40 }) {
  const hint = sessions.find((s) => s.dir.startsWith(hintPrefix))
  if (hint !== undefined) {
    const got = readHeader(hint, tmpDir)
    if (got.ok && got.identity.agentPreset === EXPECTED_PRESET && got.identity.is_top_level) return { source: 'hint', ...got }
  }
  let best = null
  for (const s of sessions.slice(0, scanLimit)) {
    const got = readHeader(s, tmpDir)
    if (!got.ok) continue
    if (got.identity.agentPreset !== EXPECTED_PRESET || !got.identity.is_top_level) continue
    if (best === null || (got.identity.firstTurnAt ?? 0) > (best.identity.firstTurnAt ?? 0)) best = got
  }
  return best === null ? null : { source: 'scan', ...best }
}

// ── ⓪' 锚点翻面：三条**合成**会话流（与盘上有没有活会话无关）────────────────────
/**
 * 造一份最小的会话流（`session.v4.jsonl.zstd`）：头 + 一条 `turn/start` + 一条 `turn/end`。
 * **一份 zstd 帧**就够 —— 头在第一帧，`readSessionHeader()` 的交叉尺子（只解第一帧）与
 * `zstd-frames.mjs`（全解）会给出同一个头（这正是我们要的那条等式）。
 */
function writeFixtureStream(dir, { id, createdAt, firstTurnAt, agentPreset = EXPECTED_PRESET, cwd = PATHS.repo }) {
  const sub = path.join(dir, id)
  mkdirSync(sub, { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', version: 4, id, createdAt, cwd, agentPreset, delegationDepth: 0, origin: null, parentSession: null }),
    JSON.stringify({ type: 'turn/start', seq: 1, time: firstTurnAt, data: { turn: 1 } }),
    JSON.stringify({ type: 'turn/end', seq: 2, time: firstTurnAt + 8000, data: { turn: 1, reason: { kind: 'completed' } } }),
  ].join('\n') + '\n'
  const file = path.join(sub, 'session.v4.jsonl.zstd')
  writeFileSync(file, zlib.zstdCompressSync(Buffer.from(lines, 'utf8')))
  return file
}

/**
 * `bug-20261110-07` 的翻面读数。**两条负控是这一格的必需品**（少了它们，"选得中"只是运气）：
 *   · A `created-1106-spoken-today`：头建于 11-06、**今天**才第一次说话 ⇒ **必须**算 T 之后的新会话；
 *   · B `created-1106-spoken-1106`：头建于 11-06、**11-06** 就说过话 ⇒ **必须不**算（进 resumed）；
 *   · C `created-today-spoken-today`：今天建、今天说话 ⇒ 算（阳性对照，证明规则不是"凡是 11-06 建的都算"）。
 * 两把刀：
 *   · **旧锚点刀**：同一批读数按 `createdAt >= T` 选 ⇒ A 必须**选不中**（那就是本病的形状）；
 *   · **T 翻面**：把 T 挪到 A 的首轮之后 ⇒ 一个都选不中 ⇒ 判词必须变 `HOLD`（证明"之后"是时间关系）。
 */
function firstTurnAnchorLeg({ tmpDir }) {
  const dir = tmpDir
  const T = Date.parse('2026-11-10T03:00:00.000Z') // 本地 11-10 11:00
  const FIXTURES = [
    { key: 'A-created-1106-spoken-today', id: 'session-fixture-a', createdAt: Date.parse('2026-11-06T07:03:30.836Z'), firstTurnAt: Date.parse('2026-11-10T03:15:10.565Z'), want: 'selected' },
    { key: 'B-created-1106-spoken-1106', id: 'session-fixture-b', createdAt: Date.parse('2026-11-06T07:03:30.836Z'), firstTurnAt: Date.parse('2026-11-06T07:10:00.000Z'), want: 'not-selected' },
    { key: 'C-created-today-spoken-today', id: 'session-fixture-c', createdAt: Date.parse('2026-11-10T03:05:00.000Z'), firstTurnAt: Date.parse('2026-11-10T03:06:00.000Z'), want: 'selected' },
  ]
  const problems = []
  const rows = FIXTURES.map((f) => {
    const file = writeFixtureStream(dir, f)
    const reading = readSessionHeader(file, { tmpDir: path.join(dir, '_jsonl') })
    if (!reading.ok) {
      problems.push(problem(BOOT_CODES.headerUnreadable, `[⓪'] 合成会话流读不动（${f.key}）：${reading.code} · ${reading.why}`))
      return { ...f, file, ok: false }
    }
    const identity = identityOf(reading)
    return {
      key: f.key,
      id: f.id,
      file,
      ok: true,
      created_at_ms: identity.createdAt,
      first_turn_at_ms: identity.firstTurnAt,
      header_created_at_iso: identity.createdAt_iso,
      first_turn_at_iso: identity.firstTurnAt_iso,
      first_turn_turn: identity.firstTurn_turn,
      first_turn_is_first: identity.firstTurn_is_first,
      first_turn_why: identity.firstTurn_why,
      cross_check_agree: reading.cross_check?.agree ?? null,
      agent_preset: identity.agentPreset,
      want: f.want,
      identity,
    }
  })
  for (const row of rows) {
    if (!row.ok) continue
    if (row.first_turn_is_first !== true) {
      problems.push(problem(BOOT_CODES.headerUnreadable, `[⓪'] ${row.key} 的首轮读数不成立（${row.first_turn_why}）—— 锚点在这一份流上取不到时刻`))
    }
    if (row.cross_check_agree !== true) {
      problems.push(problem(BOOT_CODES.headerNotFirstFrame, `[⓪'] ${row.key} 的两把尺子不一致（${JSON.stringify(row.cross_check_agree)}）—— 合成流的头不在第一帧里，这一格不能用来量锚点`))
    }
  }
  const identities = rows.filter((r) => r.ok).map((r) => r.identity)
  const pick = selectNewestAfter(identities, { T, mode: 'top-level' })
  const legacy = identities
    .filter((x) => typeof x.createdAt === 'number' && x.createdAt >= T)
    .filter((x) => x.is_top_level)
    .sort((a, b) => b.createdAt - a.createdAt)
  const legacyIds = legacy.map((x) => x.id)
  const pickId = pick.newest?.id ?? null

  // ① 锚点自己点名（读数里要写出"比的是哪个时刻"）
  if (pick.anchor !== IDENTITY_ANCHOR.name || pick.anchor_field !== IDENTITY_ANCHOR.field) {
    problems.push(problem(BOOT_CODES.selectorDead, `[⓪'] 选择器没说自己用的锚点（anchor=${JSON.stringify(pick.anchor)} · field=${JSON.stringify(pick.anchor_field)}），`
      + `期望 \`${IDENTITY_ANCHOR.name}\` / \`${IDENTITY_ANCHOR.field}\` —— 下一个人没法知道它比的是哪个时刻`))
  }
  // ② 负控①：11-06 建、今天第一次说话 ⇒ 必须被选中
  const a = rows.find((r) => r.id === 'session-fixture-a')
  if (pickId !== 'session-fixture-a') {
    problems.push(problem(BOOT_CODES.noSessionAfterRestart, `[⓪' 负控①] 建于 11-06、**今天**才第一次说话的会话（firstTurnAt=${a?.first_turn_at_iso}）必须算"T 之后的新会话"（T=${new Date(T).toISOString()}），`
      + `实得选中 ${JSON.stringify(pickId)} —— 锚点没在看首轮时刻（这正是 bug-20261110-07 的形状）`))
  }
  const pickedVersion = pickId === 'session-fixture-a' ? presetVerdict(pick.newest) : null
  if (pickedVersion !== null && pickedVersion.verdict !== 'GREEN') {
    problems.push(problem(BOOT_CODES.presetNotRegistered, `[⓪' 负控①] 负控①的判词必须是 GREEN（预设 agenia），实得 ${pickedVersion.verdict}（${pickedVersion.code ?? '—'}）`))
  }
  // ③ 负控②：11-06 建、11-06 就说过话 ⇒ 不许算
  const b = rows.find((r) => r.id === 'session-fixture-b')
  if (pickId === 'session-fixture-b' || (pick.candidates ?? []).some((c) => c.id === 'session-fixture-b')) {
    problems.push(problem(BOOT_CODES.selectorDead, `[⓪' 负控②] 11-06 就说过话的会话（firstTurnAt=${b?.first_turn_at_iso}）**不许**算"T 之后的新会话"——它已经进过候选集了`))
  }
  if (!(pick.resumed_touched_after_T ?? []).some((x) => x.id === 'session-fixture-b')) {
    problems.push(problem(BOOT_CODES.selectorDead, `[⓪' 负控②] 11-06 说过话的那一份必须出现在 \`resumed_touched_after_T\` 里（它是"早就说过话、之后又被碰过"），`
      + `实得 ${JSON.stringify((pick.resumed_touched_after_T ?? []).map((x) => x.id))}`))
  }
  // ④ 阳性对照：今天建、今天说话的那一份也必须算（规则不是"只认 11-06"）
  if (!(pick.candidates ?? []).some((c) => c.id === 'session-fixture-c')) {
    problems.push(problem(BOOT_CODES.selectorDead, `[⓪' 阳性对照] 今天建、今天说话的那一份也必须进候选集，实得 ${JSON.stringify((pick.candidates ?? []).map((c) => c.id))}`))
  }
  // ⑤ 旧锚点刀：同一批读数按 `createdAt >= T` 选 ⇒ A 必须选不中
  if (legacyIds.includes('session-fixture-a')) {
    problems.push(problem(BOOT_CODES.selectorDead, '[⓪\' 旧锚点刀] 按 `createdAt >= T` 居然也能选中负控①——那这把刀切不开新旧两个锚点，这一格证明不了锚点换了'))
  }
  if (a?.ok && !(typeof a.created_at_ms === 'number' && a.created_at_ms < T && typeof a.first_turn_at_ms === 'number' && a.first_turn_at_ms >= T)) {
    problems.push(problem(BOOT_CODES.selectorDead, `[⓪' 负控①] 这一份的前提不成立：它的 header.createdAt 必须早于 T 而首轮晚于 T（createdAt=${a.header_created_at_iso} · firstTurn=${a.first_turn_at_iso} · T=${new Date(T).toISOString()}）`))
  }
  // ⑥ T 翻面：把 T 挪到 A 的首轮之后 ⇒ 一个都选不中 ⇒ HOLD
  const laterT = Date.parse('2026-11-10T04:00:00.000Z')
  const flipped = selectNewestAfter(identities, { T: laterT, mode: 'top-level' })
  const flippedVerdict = presetVerdict(flipped.newest)
  if (flipped.newest !== null || flippedVerdict.verdict !== 'HOLD' || flippedVerdict.code !== BOOT_CODES.noSessionAfterRestart) {
    problems.push(problem(BOOT_CODES.selectorDead, `[⓪' T 翻面] T 挪到 ${new Date(laterT).toISOString()}（晚于每一份的首轮）之后必须一个都选不中、判词变 HOLD，`
      + `实得 ${JSON.stringify(flipped.newest?.id ?? null)} / ${flippedVerdict.verdict}`))
  }
  return {
    readings: {
      measured_at: new Date().toISOString(),
      anchor: { name: IDENTITY_ANCHOR.name, source: IDENTITY_ANCHOR.source, field: IDENTITY_ANCHOR.field, chosen_because: IDENTITY_ANCHOR.chosen_because, rejected: IDENTITY_ANCHOR.rejected },
      T,
      T_iso: new Date(T).toISOString(),
      fixtures_dir: dir,
      pool: rows.map(({ identity, ...rest }) => rest),
      selected: pickId,
      selected_anchor_compared: pick.newest === null ? null : {
        session_id: pick.newest.id,
        first_turn_at: pick.newest.firstTurnAt,
        first_turn_at_iso: pick.newest.firstTurnAt_iso,
        T,
        T_iso: new Date(T).toISOString(),
        comparison: 'firstTurnAt >= T',
      },
      verdict: pickedVersion === null ? null : { verdict: pickedVersion.verdict, code: pickedVersion.code ?? null },
      candidates: pick.candidates,
      resumed: (pick.resumed_touched_after_T ?? []).map((x) => ({ id: x.id, firstTurnAt_iso: x.firstTurnAt_iso, createdAt_iso: x.createdAt_iso })),
      anchor_unavailable: pick.anchor_unavailable,
      legacy_anchor: { rule: 'header.createdAt >= T', picked_ids: legacyIds, newest: legacy[0] === undefined ? null : { id: legacy[0].id, createdAt_iso: legacy[0].createdAt_iso } },
      t_flip: { T: laterT, T_iso: new Date(laterT).toISOString(), picked: flipped.newest?.id ?? null, verdict: flippedVerdict.verdict, code: flippedVerdict.code ?? null },
    },
    problems,
  }
}

// ── ①' 年龄判词 + 放宽样本面 的**刀**（`bug-20261113-18`，纯函数、与盘上无关）────────────
/**
 * 七组读数喂 `postRestartSampleVerdict()`，必须各自落在**预期那一格**上。
 *
 * 卡上的两把刀是头两行（`0 天 ⇒ HOLD` / `4 天 ⇒ RED`）；其余五行是让这两把刀**站得住**的东西：
 *   · 边界两侧（`2.999` / `3`）—— 阈值只有一个意思，且边界那一侧归 RED；
 *   · **有样本时年龄不许说话**（`0 天` / `30 天` 有样本都必须是 GREEN）—— 否则"重启 30 天后补上的
 *     那份样本"会被读成超期红，那等于把一条真判据换成了日历；
 *   · 两条红**必须分得开**（`…-EXPIRED` vs `BOOT-PRESET-NOT-REGISTERED`）—— 合成同一个码就是把
 *     "该催人"与"该修产品"读成同一句话，读的人会去催人而不是去修产品；
 *   · `T` 读不出来那一格 —— 没有年龄就写 `null`，不许写 0（0 与"没量"是两件事）。
 *
 * 外加 `selectPostRestartSample()` 的四把刀（放宽入口**只加不减** + 组员会话**只记不判** +
 * 出处点名哪条流与 `creator_kind`）。
 */
function postRestartRulerLeg({ now }) {
  const DAY = 86400000
  const problems = []
  const sampleOf = (preset) => ({
    id: 'session-fixture-sample',
    dir: 'session-fixture-sample',
    file: '（合成读数，没有文件）',
    agentPreset: preset,
    createdAt: now - 1 * DAY,
    createdAt_iso: new Date(now - 1 * DAY).toISOString(),
    firstTurnAt: now - 1 * DAY,
    firstTurnAt_iso: new Date(now - 1 * DAY).toISOString(),
    is_top_level: true,
    is_subagent: false,
    delegationDepth: 0,
    origin: null,
    parentSession: null,
  })
  const FIXTURES = [
    {
      key: 'knife-0d-no-sample',
      T: now,
      sample: null,
      want: { verdict: 'HOLD', code: BOOT_CODES.noSessionAfterRestart, age: 0, ask: 'none' },
      what: '刀①（卡上）：重启 0 天、没有样本 ⇒ **HOLD**（不是红），读数里带 `restart_age_days`',
    },
    {
      key: 'knife-4d-no-sample',
      T: now - 4 * DAY,
      sample: null,
      want: { verdict: 'RED', code: BOOT_CODES.noSessionAfterRestartExpired, age: 4, ask: 'boss-once' },
      what: '刀②（卡上）：重启 4 天、没有样本 ⇒ **RED** 并点名年龄',
    },
    {
      key: 'boundary-2.999d-no-sample',
      T: now - 2.999 * DAY,
      sample: null,
      want: { verdict: 'HOLD', code: BOOT_CODES.noSessionAfterRestart, age: 2.999, ask: 'none' },
      what: '边界下方：阈值是闭区间右端的对侧，2.999 天仍是 HOLD',
    },
    {
      key: 'boundary-3d-no-sample',
      T: now - 3 * DAY,
      sample: null,
      want: { verdict: 'RED', code: BOOT_CODES.noSessionAfterRestartExpired, age: 3, ask: 'boss-once' },
      what: '边界点上：满 3 天就红（`>=` 归 RED）',
    },
    {
      key: 'sample-0d',
      T: now,
      sample: sampleOf(EXPECTED_PRESET),
      want: { verdict: 'GREEN', code: null, age: 0, ask: 'none' },
      what: '有样本 ⇒ 绿（照旧）：阈值不许把一份真样本变成红',
    },
    {
      key: 'sample-30d',
      T: now - 30 * DAY,
      sample: sampleOf(EXPECTED_PRESET),
      want: { verdict: 'GREEN', code: null, age: 30, ask: 'none' },
      what: '**年龄不许说话**：30 天后才出现的样本仍然判 green 不判超期',
    },
    {
      key: 'sample-standard-4d',
      T: now - 4 * DAY,
      sample: sampleOf('standard'),
      want: { verdict: 'RED', code: BOOT_CODES.presetNotRegistered, age: 4, ask: 'none' },
      what: '两条红分得开：同样 4 天，有样本而 preset=standard ⇒ 红在 `BOOT-PRESET-NOT-REGISTERED`（不是超期）',
    },
  ]
  const rows = FIXTURES.map((f) => {
    const got = postRestartSampleVerdict({ sample: f.sample, T: f.T, now })
    return {
      key: f.key,
      what: f.what,
      T_iso: new Date(f.T).toISOString(),
      want: f.want,
      got: {
        verdict: got.verdict,
        code: got.code ?? null,
        restart_age_days: got.restart_age_days,
        threshold_days: got.threshold_days,
        expires_at_iso: got.expires_at_iso,
        owner: got.owner,
        ask: got.ask,
        decided_by: got.decided_by,
        why: got.why,
      },
    }
  })

  for (const row of rows) {
    const want = row.want
    const got = row.got
    if (got.verdict !== want.verdict || got.code !== want.code) {
      problems.push(problem(BOOT_CODES.selectorDead,
        `[①' 刀 ${row.key}] ${row.what}：期望 ${want.verdict}/${JSON.stringify(want.code)}，`
        + `实得 ${got.verdict}/${JSON.stringify(got.code)}（decided_by=${JSON.stringify(got.decided_by)}）`))
    }
    // `restart_age_days` 必须**每一支都带**，且与刀自己从 T 算出来的那个数同值（不是"有个字段就行"）。
    const wantAge = restartAgeDays(Math.max(0, now - Date.parse(row.T_iso)))
    if (got.restart_age_days !== want.age) {
      problems.push(problem(BOOT_CODES.selectorDead,
        `[①' 刀 ${row.key}] \`restart_age_days\` 必须印 ${want.age}，实得 ${JSON.stringify(got.restart_age_days)}`
        + ' —— 这一格最容易出的错不是判错，是读数里没有年龄（人还得自己去减两个时刻）'))
    }
    // 夹具自己也得站得住：从 T 算出来的天数必须就是这一行写的那个数。
    if (wantAge !== want.age) {
      problems.push(problem(BOOT_CODES.selectorDead,
        `[①\\' 刀的夹具自己写歪了] ${row.key}：\`restartAgeDays()\` 从 T 算出 ${wantAge}，而这一行写的是 ${want.age}`))
    }
    if (got.ask !== want.ask) {
      problems.push(problem(BOOT_CODES.selectorDead,
        `[①' 刀 ${row.key}] \`ask\` 必须是 ${JSON.stringify(want.ask)}（阈值内的 HOLD 不许变成每日功课；超期那一支才点名人），实得 ${JSON.stringify(got.ask)}`))
    }
    if (typeof got.expires_at_iso !== 'string' || !Number.isFinite(Date.parse(got.expires_at_iso))) {
      problems.push(problem(BOOT_CODES.selectorDead, `[①' 刀 ${row.key}] 读数里没有可解析的 \`expires_at_iso\`（实得 ${JSON.stringify(got.expires_at_iso)}）—— 阈值必须带一个到得了的时刻，不许只写一个天数`))
    }
  }
  // 报文里必须**印出**那个字段名与那个数（卡上的验收是"读数带 restart_age_days"，不是"结构体里有"）。
  const holdRow = rows.find((r) => r.key === 'knife-0d-no-sample')
  if (!String(holdRow.got.why).includes('restart_age_days')) {
    problems.push(problem(BOOT_CODES.selectorDead, `[①' 刀①] HOLD 的报文里必须印 \`restart_age_days\` 这个名字（它就是这个读数的键），实得 ${JSON.stringify(holdRow.got.why)}`))
  }
  const redRow = rows.find((r) => r.key === 'knife-4d-no-sample')
  if (!String(redRow.got.why).includes('4 天') && !String(redRow.got.why).includes('4天')) {
    problems.push(problem(BOOT_CODES.selectorDead, `[①' 刀②] 超期红必须**点名年龄**（报文里要出现 4 天），实得 ${JSON.stringify(redRow.got.why)}`))
  }
  // 两条红必须是两个码（同一份尺子的两个红不许塌成一个）。
  if (BOOT_CODES.noSessionAfterRestartExpired === BOOT_CODES.presetNotRegistered) {
    problems.push(problem(BOOT_CODES.selectorDead, '[①\' 刀] 超期红与 preset 红用了同一个码 —— 读的人分不出"该催人"与"该修产品"'))
  }
  // `T` 读不出来：`restart_age_days` 必须是 null，不许是 0。
  const noT = postRestartSampleVerdict({ sample: null, T: null, now })
  if (noT.verdict !== 'HOLD' || noT.code !== BOOT_CODES.restartTimeUnknown || noT.restart_age_days !== null) {
    problems.push(problem(BOOT_CODES.selectorDead, `[①' 刀] 没有 T ⇒ 必须 HOLD \`${BOOT_CODES.restartTimeUnknown}\` 且 \`restart_age_days: null\`（"没量"与"0 天"是两件事），实得 ${JSON.stringify({ verdict: noT.verdict, code: noT.code, age: noT.restart_age_days })}`))
  }

  // ── `selectPostRestartSample()` 的四把刀 ──────────────────────────────────
  const topLevelOldFirstTurn = {
    id: 'session-fixture-widened',
    dir: 'session-fixture-widened',
    file: '（合成读数，没有文件）',
    agentPreset: EXPECTED_PRESET,
    createdAt: now - 60 * 1000,
    createdAt_iso: new Date(now - 60 * 1000).toISOString(),
    firstTurnAt: null,
    firstTurnAt_iso: null,
    firstTurn_is_first: false,
    firstTurn_why: 'first-turn-not-in-stream',
    is_top_level: true,
    is_subagent: false,
    delegationDepth: 0,
    origin: null,
    parentSession: null,
  }
  const topLevelOldHeaderFreshTurn = {
    ...topLevelOldFirstTurn,
    id: 'session-fixture-primary',
    dir: 'session-fixture-primary',
    createdAt: now - 10 * DAY,
    createdAt_iso: new Date(now - 10 * DAY).toISOString(),
    firstTurnAt: now - 60 * 1000,
    firstTurnAt_iso: new Date(now - 60 * 1000).toISOString(),
    firstTurn_is_first: true,
    firstTurn_why: null,
  }
  const delegatedFresh = {
    ...topLevelOldFirstTurn,
    id: 'session-fixture-member',
    dir: 'session-fixture-member',
    agentPreset: 'agenia-member',
    is_top_level: false,
    is_subagent: true,
    delegationDepth: 1,
    origin: 'subagent',
    parentSession: 'session-fixture-primary',
    firstTurnAt: now - 30 * 1000,
    firstTurnAt_iso: new Date(now - 30 * 1000).toISOString(),
    firstTurn_is_first: true,
    firstTurn_why: null,
  }
  const both = selectPostRestartSample([topLevelOldFirstTurn, topLevelOldHeaderFreshTurn, delegatedFresh], { T: now - 3600 * 1000 })
  const widenedOnly = selectPostRestartSample([topLevelOldFirstTurn, delegatedFresh], { T: now - 3600 * 1000 })
  const delegatedOnly = selectPostRestartSample([delegatedFresh], { T: now - 3600 * 1000 })
  const widenedRows = {
    both: {
      picked_by: both.picked_by,
      id: both.newest?.id ?? null,
      widened_used: both.widened.used,
      provenance: both.provenance,
      machine_count: both.machine_created_after_T.count,
      machine_counts_as_sample: both.machine_created_after_T.counts_as_sample,
    },
    widened_only: { picked_by: widenedOnly.picked_by, id: widenedOnly.newest?.id ?? null, widened_used: widenedOnly.widened.used },
    delegated_only: {
      id: delegatedOnly.newest?.id ?? null,
      picked_by: delegatedOnly.picked_by,
      machine_count: delegatedOnly.machine_created_after_T.count,
      machine_counts_as_sample: delegatedOnly.machine_created_after_T.counts_as_sample,
    },
  }
  // 刀③：主锚点选得中就用它（`createdAt` 那一支**不许**顶掉它）。
  if (both.picked_by !== 'firstTurnAt' || both.newest?.id !== 'session-fixture-primary') {
    problems.push(problem(BOOT_CODES.selectorDead, `[①'' 刀③] 放宽入口**只加不减**：主锚点选得中时必须用它，实得 picked_by=${JSON.stringify(both.picked_by)} id=${JSON.stringify(both.newest?.id ?? null)}`))
  }
  if (both.widened.used === true) {
    problems.push(problem(BOOT_CODES.selectorDead, '[①\'\' 刀③] 主锚点已经有样本时 `widened.used` 必须是 false —— 否则读数会让人以为两份都在用'))
  }
  // 刀④：主锚点空着时，`createdAt` 入口顶上（这就是"放宽"本身有对象的证明）。
  if (widenedOnly.picked_by !== 'createdAt' || widenedOnly.newest?.id !== 'session-fixture-widened' || widenedOnly.widened.used !== true) {
    problems.push(problem(BOOT_CODES.selectorDead, `[①'' 刀④] 主锚点空着时 \`createdAt >= T\` 那一支必须顶上（这就是放宽），实得 ${JSON.stringify({ picked_by: widenedOnly.picked_by, id: widenedOnly.newest?.id ?? null, used: widenedOnly.widened.used })}`))
  }
  // 刀⑤：只有组员会话 ⇒ 一个样本都没有（但它要被**记下来**）。
  if (delegatedOnly.newest !== null || delegatedOnly.picked_by !== null) {
    problems.push(problem(BOOT_CODES.selectorDead, `[①'' 刀⑤] 只有 T 之后的**组员会话**时必须一个样本都没有（它的 preset 从父会话那条路来，不是等价证据），实得 ${JSON.stringify(delegatedOnly.newest?.id ?? null)}`))
  }
  if (delegatedOnly.machine_created_after_T.count !== 1 || delegatedOnly.machine_created_after_T.counts_as_sample !== false) {
    problems.push(problem(BOOT_CODES.selectorDead, `[①'' 刀⑤] T 之后的组员会话必须**记下来**且明写 \`counts_as_sample: false\`，实得 ${JSON.stringify({ count: delegatedOnly.machine_created_after_T.count, counts: delegatedOnly.machine_created_after_T.counts_as_sample })}`))
  }
  // 刀⑥：出处必须点名**哪条流**与 `creator_kind`，且顶层 `origin: null` **不许**被读成"老板亲手开的"。
  const prov = both.provenance
  if (prov === null || typeof prov.stream?.file !== 'string' || typeof prov.creator_kind !== 'string') {
    problems.push(problem(BOOT_CODES.selectorDead, `[①'' 刀⑥] 样本必须带出处（哪条流 + \`creator_kind\`），实得 ${JSON.stringify(prov)}`))
  }
  if (prov?.creator_kind !== 'undeclared-top-level') {
    problems.push(problem(BOOT_CODES.selectorDead, `[①'' 刀⑥] 顶层会话头里 \`origin: null\` ⇒ \`creator_kind\` 必须是 \`undeclared-top-level\`（"谁建的读不出来"），不许编一个人出来；实得 ${JSON.stringify(prov?.creator_kind)}`))
  }
  if (prov?.creator_kind === 'undeclared-top-level' && String(prov.creator_note ?? '').includes('老板')) {
    problems.push(problem(BOOT_CODES.selectorDead, '[①\'\' 刀⑥] `creator_kind: undeclared-top-level` 的说明里不许出现"老板"——那是替一个没量过的字段编一个值'))
  }

  return {
    readings: {
      measured_at: new Date(now).toISOString(),
      now,
      now_iso: new Date(now).toISOString(),
      policy: {
        threshold_days: POST_RESTART_SAMPLE.threshold_days,
        owner: POST_RESTART_SAMPLE.owner,
        owner_key: POST_RESTART_SAMPLE.owner_key,
        clear_condition: POST_RESTART_SAMPLE.clear_condition,
        why_only_the_boss: POST_RESTART_SAMPLE.why_only_the_boss,
        one_time_note: POST_RESTART_SAMPLE.one_time_note,
      },
      rows,
      no_T: { verdict: noT.verdict, code: noT.code, restart_age_days: noT.restart_age_days },
      widened_rows: widenedRows,
    },
    problems,
  }
}

test('BOOT-01 启动后读数 A（身份）：重启之后**首轮对话**在 T 之后的会话，头里 agentPreset 必须是 agenia（锚点 = 会话流 turn/start）；standard ⇒ 塌了；R5 撤挂载 = 删标记 + 重跑生成器', async () => {
  await runCase('BOOT-01', async (rec) => {
    const tmpDir = path.join(caseDir('BOOT-01'), 'tmp')
    const tree = treeIdentity()
    const store = sessionRootReading()
    const boot = hostBootReading()
    rec.readings.tree = tree
    rec.readings.session_root = store
    rec.readings.restart = { ok: boot.ok, at: boot.at, at_iso: boot.at_iso, source: boot.source, host: boot.host ?? null, chain: boot.chain, why: boot.why ?? null, measured_at: new Date().toISOString() }
    // 🔴 读取器自证（Gate-2 缺陷）：先验"整份补丁都被读到了"。
    //    ⚠️ 2026-11-05 深夜：BOOT-01 不再读 profile 补丁（挂载搬回 bundle 层 ⇒ profile 里按设计没有那一行，
    //    它是备用路线）。`patchReaderVerdict()` 留在这里，是因为 R5 的产物读数也走同一份窄口径解析器 ——
    //    它读不懂组合 / 补丁时，"那一行落在哪"的读数同样不能信。
    applyReader(rec, patchReaderVerdict())
    rec.readings.package = (() => {
      const p = packageReading(DASHBOARD_PKG_DIR())
      return { name: p.name ?? null, dir: p.dir, client_exists: p.client_exists ?? false, client_sha256: p.client_sha256 ?? null, platform: p.platform ?? null }
    })()

    /**
     * ── ⓪' **锚点翻面**（`bug-20261110-07`）────────────────────────────────────
     * 与"盘上有没有活会话"无关：三条**合成**会话流各喂一次真读取器。
     * 两条负控（11-06 建、今天才说话 ⇒ 必须是新会话 · 11-06 建、11-06 说过话 ⇒ 必须不是）
     * + 阳性对照 + 两把刀（旧锚点刀 / T 翻面）。**这一层不过，下面的身份读数没意义** ——
     * 它证明的是"比的是哪个时刻"，而上一版正是错在这里。
     */
    const anchorLeg = firstTurnAnchorLeg({ tmpDir: path.join(caseDir('BOOT-01'), 'anchor-fixtures') })
    rec.readings.anchor_leg = anchorLeg.readings
    for (const p of anchorLeg.problems) rec.problems.push(problem(p.code, p.message))

    /**
     * ── ①' **年龄判词的刀**（`bug-20261113-18`）────────────────────────────────
     * 卡上的两把刀打在 `postRestartSampleVerdict()` 上：`0 天` 无样本 ⇒ HOLD（带 `restart_age_days`）、
     * `4 天` 无样本 ⇒ RED。与"盘上有没有活会话"无关 —— **这一层不过，下面那句"HOLD 是因为还没到期"
     * 就没有合法性来源**（它可能只是"这一格只会 HOLD"）。
     */
    const ruleLeg = postRestartRulerLeg({ now: Date.now() })
    rec.readings.post_restart_ruler = ruleLeg.readings
    for (const p of ruleLeg.problems) rec.problems.push(problem(p.code, p.message))

    // ── 0 前置：会话流根 + 工作区键 + 启动时刻 ────────────────────────────────
    if (!store.exists) {
      caseHold(rec, BOOT_CODES.noSessionStore, `会话流的根不在：${store.root}（来源 ${store.source}）⇒ 这一格判不了 —— 不是"没有会话"，也不是"预设没注册"`)
      return
    }
    const key = findWorkspaceKey({ root: store.root, cwd: tree.repo, tmpDir })
    rec.readings.workspace_key = { ok: key.ok, key: key.key ?? null, key_dir: key.keyDir ?? null, hint: key.hint, verified_cwd: key.verifiedBy?.header?.cwd ?? null, tried: key.tried }
    if (!key.ok) {
      caseHold(rec, BOOT_CODES.noWorkspaceKey, `在 ${store.root} 下找不到 cwd = ${tree.repo} 的工作区键（试过 ${key.tried.length} 个键：${JSON.stringify(key.tried.slice(0, 4))}）⇒ 判不了`)
      return
    }
    const sessions = listSessions(key.keyDir)
    rec.readings.sessions = { count: sessions.length, newest: sessions.slice(0, 3).map((s) => ({ dir: s.dir, mtime: s.mtime, bytes: s.bytes })) }
    if (!boot.ok) {
      caseHold(rec, BOOT_CODES.restartTimeUnknown, `量不到这一次客户端启动的时刻（${boot.source}：${boot.why}）⇒ "之后"没有定义 —— 不许绿。给 \`AGENIA_BOOT_AT=<ISO>\` 或在一台跑着客户端的机器上跑`)
      return
    }
    const T = boot.at

    // ── ⓪ 尺子自证：两份真实会话流，判词必须不同 ──────────────────────────────
    const negative = findNegativeControl({ sessions, tmpDir, T })
    const positive = findPositiveControl({ sessions, tmpDir })
    rec.readings.controls = {
      negative: negative === null ? null : { source: negative.source, ...negative.identity, agent_preset_literal: negative.reading.agent_preset_literal, cross_check: negative.reading.cross_check, first_frame_head: negative.reading.first_frame_head, verdict: presetVerdict(negative.identity).verdict, code: presetVerdict(negative.identity).code },
      positive: positive === null ? null : { source: positive.source, ...positive.identity, agent_preset_literal: positive.reading.agent_preset_literal, cross_check: positive.reading.cross_check, first_frame_head: positive.reading.first_frame_head, verdict: presetVerdict(positive.identity).verdict, code: presetVerdict(positive.identity).code },
    }
    if (negative === null || positive === null) {
      caseHold(rec, negative === null ? BOOT_CODES.noNegativeControl : BOOT_CODES.noPositiveControl,
        `盘上找不到${negative === null ? `一份 \`agentPreset ≠ ${EXPECTED_PRESET}\`` : `一份顶层 \`agentPreset === ${EXPECTED_PRESET}\``} 的真实会话头 ⇒ 这个探测器的"翻面"没有被证明过，这一格记 HOLD（不是绿）`)
    }
    if (negative !== null && positive !== null) {
      const nv = presetVerdict(negative.identity)
      const pv = presetVerdict(positive.identity)
      if (nv.verdict !== 'RED' || pv.verdict !== 'GREEN' || nv.code === pv.code) {
        rec.problems.push(problem(BOOT_CODES.detectorDead, `尺子不自证：阴性那份判成 ${nv.verdict}（${nv.code ?? '—'}）、阳性那份判成 ${pv.verdict}（${pv.code ?? '—'}）—— 两条判词必须一个是 RED 一个是 GREEN；探测器不翻面 ⇒ 它读到的绿是装饰`))
      }
      for (const [label, c] of [['阴性', negative], ['阳性', positive]]) {
        if (c.reading.cross_check?.agree !== true) {
          rec.problems.push(problem(BOOT_CODES.headerNotFirstFrame, `${label}对照（${c.identity.id}）的两把尺子不一致：\`zstd-frames.mjs\` 全解的头 ≠ \`zstdDecompressSync\`（只解第一帧）的头（${JSON.stringify(c.reading.cross_check)}）—— 头不在第一帧里，或者解压器坏了`))
        }
      }
      // 阴性的那一份**必须是"续跑回来的老会话"**：这样读的人不会拿它当"重启后的读数"。
      //   锚点换了之后仍然成立 —— 它**首轮**在 T 之前（不再是"createdAt 在 T 之前"）。
      rec.readings.controls.negative_is_resumed = negative.identity.firstTurnAt !== null && negative.identity.firstTurnAt < T
      rec.readings.controls.negative_first_turn_before_restart_ms = negative.identity.firstTurnAt === null ? null : T - negative.identity.firstTurnAt
      rec.readings.controls.negative_created_before_restart_ms = negative.identity.createdAt === null ? null : T - negative.identity.createdAt
    }

    // ── ① 身份：**T 之后的顶层会话**（主锚点 `IDENTITY_ANCHOR`；放宽入口 `createdAt` 只加不减）──
    // 只看"文件 mtime ≥ T"的那一小把（T 之后的会话，文件 mtime 必然也 ≥ T）——
    // 这样不必扫整棵树；上限自报。
    const pool = sessions.filter((s) => s.mtimeMs >= T)
    const scan = scanHeaders(pool, { tmpDir, limit: 20 })
    const identities = scan.identities
    const pick = selectPostRestartSample(identities, { T })
    const primaryPick = selectNewestAfter(identities, { T, mode: 'top-level' })
    const naive = selectNewestAfter(identities, { T, mode: 'all' })
    /** 🔴 没有样本时判的是**年龄**（`bug-20261113-18`）：这一格会翻面，两把刀打在上面。 */
    const sampleVerdict = postRestartSampleVerdict({ sample: pick.newest, T, now: Date.now() })
    rec.readings.identity = {
      measured_at: new Date().toISOString(),
      T,
      T_iso: new Date(T).toISOString(),
      T_source: boot.source,
      /** 🔴 这一格比的是**哪个时刻** —— 点名，别让下一个人去猜（`bug-20261110-07`）。 */
      anchor: {
        name: IDENTITY_ANCHOR.name,
        source: IDENTITY_ANCHOR.source,
        field: IDENTITY_ANCHOR.field,
        chosen_because: IDENTITY_ANCHOR.chosen_because,
        rejected: IDENTITY_ANCHOR.rejected,
        comparison: 'firstTurnAt >= T',
      },
      pool: { sessions_with_mtime_ge_T: pool.length, scanned: scan.scanned, capped: scan.capped, limit: scan.limit, failures: scan.failures },
      /** ⚠️ **上下文，不是判据**：`header.createdAt >= T` 的会话（旧锚点会选的那一批）。 */
      header_created_after_T: identities.filter((x) => typeof x.createdAt === 'number' && x.createdAt >= T)
        .map((x) => ({ id: x.id, createdAt_iso: x.createdAt_iso, firstTurnAt_iso: x.firstTurnAt_iso, agentPreset: x.agentPreset, is_top_level: x.is_top_level })),
      first_turn_after_T: identities.filter((x) => x.firstTurn_is_first === true && typeof x.firstTurnAt === 'number' && x.firstTurnAt >= T)
        .map((x) => ({ id: x.id, firstTurnAt_iso: x.firstTurnAt_iso, created_at_iso: x.createdAt_iso, turn: x.firstTurn_turn, seq: x.firstTurn_seq, agentPreset: x.agentPreset, is_top_level: x.is_top_level, file_sha256: x.file_sha256, first_frame_sha256: x.first_frame_sha256 })),
      anchor_unavailable: primaryPick.anchor_unavailable,
      resumed_touched_after_T: primaryPick.resumed_touched_after_T,
      resumed_count: primaryPick.resumed_count,
      selected: pick.newest === null ? null : whereOf(pick.newest),
      /** 🔴 判词**比的那个时刻**（一个数、一个来源、一个会话 id）—— 下一句就能重复这一跑的比较。 */
      selected_anchor: pick.newest === null ? null : {
        session_id: pick.newest.id,
        anchor: IDENTITY_ANCHOR.name,
        first_turn_at: pick.newest.firstTurnAt,
        first_turn_at_iso: pick.newest.firstTurnAt_iso,
        first_turn_turn: pick.newest.firstTurn_turn,
        first_turn_seq: pick.newest.firstTurn_seq,
        header_created_at_iso: pick.newest.createdAt_iso,
        T,
        T_iso: new Date(T).toISOString(),
        comparison: pick.picked_by === 'firstTurnAt'
          ? `firstTurnAt(${pick.newest.firstTurnAt_iso}) >= T(${new Date(T).toISOString()})`
          : `createdAt(${pick.newest.createdAt_iso}) >= T(${new Date(T).toISOString()})〔放宽入口：主锚点在这一跑没选中任何一份〕`,
      },
      selected_detail: pick.newest,
      /**
       * 🔴 **样本面**（`bug-20261113-18` 的 ②）：哪条入口给的样本、它的出处（哪条流 / 谁建的 /
       * 头里声明了什么），以及"T 之后的组员会话"那一份**只记不判**的旁证。
       */
      post_restart: {
        picked_by: pick.picked_by,
        primary: pick.primary,
        widened: { by: pick.widened.by, role: pick.widened.role, why_safe: pick.widened.why_safe, count: pick.widened.count, used: pick.widened.used, candidates: pick.widened.candidates },
        provenance: pick.provenance,
        machine_created_after_T: pick.machine_created_after_T,
      },
      /**
       * 🔴 **没有样本时读年龄**（`bug-20261113-18` 的 ①）：`restart_age_days` + owner + 到期时刻。
       * 有样本时这一块仍落盘（年龄是上下文），但**判词不读它** —— `decided_by` 会说出判词是谁给的。
       */
      post_restart_verdict: sampleVerdict,
      naive_selection: naive.newest === null ? null : { id: naive.newest.id, agentPreset: naive.newest.agentPreset, is_top_level: naive.newest.is_top_level, why: '不过滤顶层 ⇒ 会选中委派出去的组员会话' },
      filter_is_load_bearing: naive.newest?.agentPreset !== pick.newest?.agentPreset,
    }
    // **选择器自证**：同一条选择规则，换一个 `T` 就应该换一个判词 —— 否则"现在 HOLD"读起来像"它只会 HOLD"。
    // `T` 取阳性对照的首轮之前 1 秒；pool 只含**这一跑已经读过**的那几份（不是全树，标签写清）。
    if (positive !== null) {
      const probeBase = typeof positive.identity.firstTurnAt === 'number' ? positive.identity.firstTurnAt : positive.identity.createdAt
      const probeT = probeBase - 1000
      const probePool = [positive.identity, negative?.identity, ...identities].filter((x) => x !== null && x !== undefined)
      const probe = selectNewestAfter(probePool, { T: probeT, mode: 'top-level' })
      const probeVerdict = presetVerdict(probe.newest)
      rec.readings.identity.selection_flip_probe = {
        T: probeT,
        T_iso: new Date(probeT).toISOString(),
        anchor: IDENTITY_ANCHOR.name,
        pool_ids: probePool.map((x) => x.id),
        pool_note: '只含这一跑已经读过的那几份（阳性 / 阴性 / T 之后那几份）—— 不是全树',
        picked: probe.newest === null ? null : { id: probe.newest.id, firstTurnAt_iso: probe.newest.firstTurnAt_iso, createdAt_iso: probe.newest.createdAt_iso, agentPreset: probe.newest.agentPreset },
        verdict: probeVerdict.verdict,
        code: probeVerdict.code ?? null,
      }
      if (probeVerdict.verdict !== 'GREEN') {
        rec.problems.push(problem(BOOT_CODES.selectorDead, `选择器换一个 T 也给不出 GREEN：T=${new Date(probeT).toISOString()} 时选中 ${JSON.stringify(probe.newest?.id ?? null)}（${JSON.stringify(probe.newest?.agentPreset ?? null)}），判成 ${probeVerdict.verdict} —— 那"现在 HOLD"就不是"没有新会话"，是选择器坏了`))
      }
    }
    rec.readings.identity.verdict = { verdict: sampleVerdict.verdict, code: sampleVerdict.code ?? null, decided_by: sampleVerdict.decided_by, restart_age_days: sampleVerdict.restart_age_days }
    if (sampleVerdict.verdict === 'HOLD') {
      /**
       * **没有样本、但还没到期** ⇒ HOLD，读数带年龄。报文里**不催人**：
       * 阈值内这一格自己挂着（"不要你动手"），到期那一刻它自己变红。
       * 真要他动手时，卡上要求的那两句必须同句出现：**就这一次** + **为什么只有他能做**。
       */
      caseHold(rec, sampleVerdict.code,
        `工作区 ${key.key} 里**没有** T（= ${new Date(T).toISOString()}，${boot.source}）**之后**的顶层会话 `
          + `（主锚点 = ${IDENTITY_ANCHOR.name}：${IDENTITY_ANCHOR.source}；放宽入口 \`createdAt >= T\` 也没选中任何一份）—— `
          + `**restart_age_days = ${sampleVerdict.restart_age_days}**（阈值 ${sampleVerdict.threshold_days} 天 · `
          + `到期 ${sampleVerdict.expires_at_iso} · owner = ${sampleVerdict.owner}）。`
          + `这一跑扫了 ${identities.length} 份会话（池子 = 文件 mtime ≥ T 的那 ${pool.length} 份，全工作区共 ${sessions.length} 份）：`
          + `${primaryPick.resumed_count} 份的首轮在 T 之前（早就说过话、之后又被碰过，`
          + `例如 ${JSON.stringify((primaryPick.resumed_touched_after_T ?? []).slice(0, 2).map((x) => ({ id: x.id, firstTurnAt_iso: x.firstTurnAt_iso })))}），`
          + `${primaryPick.anchor_unavailable_count} 份**读不到首轮**；T 之后建出来的组员会话 ${pick.machine_created_after_T.count} 份`
          + `（**只记不判**：它的 preset 从父会话那条路来，不是这一格的证据）。`
          + ` ⇒ 阈值内**不要你做任何事**；就是真需要的那一次也只是「就这一次、为什么只有他能做」：`
          + `顶层会话只有客户端「新建会话」能建出来（盘上顶层会话的 \`origin\` 全是 null，机器侧没有这条入口），`
          + `所以清空它的动作 = ${POST_RESTART_SAMPLE.clear_condition}。`
          + `${sampleVerdict.restart_age_days >= sampleVerdict.threshold_days ? '' : `超过 ${sampleVerdict.threshold_days} 天仍没有样本，这一格会自己变红（不是绿）。`}`)
    } else if (sampleVerdict.verdict === 'RED') {
      rec.problems.push(problem(sampleVerdict.code,
        sampleVerdict.decided_by === 'restart_age_days >= threshold_days'
          /**
           * **超期红**：报文点名年龄、到期时刻、owner，与"样本在那儿而 preset 不对"那条红**分开写**。
           */
          ? `[缺样本超期] ${sampleVerdict.why}（工作区 ${key.key} · 主锚点 ${IDENTITY_ANCHOR.name} · `
            + `放宽入口 \`createdAt >= T\` 也没选中任何一份 · owner = ${sampleVerdict.owner} · `
            + `清空动作 = ${POST_RESTART_SAMPLE.clear_condition}）`
          : `${sampleVerdict.why}（${whereOf(pick.newest)}；锚点 ${sampleVerdict.decided_by === 'sample.agentPreset' ? rec.readings.identity.selected_anchor?.comparison : '—'}；`
            + `样本由 ${JSON.stringify(pick.picked_by)} 那条入口选中；出处 ${JSON.stringify(pick.provenance?.creator_kind)} @ ${JSON.stringify(pick.provenance?.stream?.file)}；`
            + `T 来源 ${boot.source}；restart_age_days = ${sampleVerdict.restart_age_days}）`))
    }

    // ── ② R5 回滚：**撤挂载 = 删标记 + 重跑生成器**（2026-11-05 深夜 · 组长裁定"重定义，不退役"）──
    // 【这条路为什么不再读 profile 补丁】挂载行搬回我们自己的 bundle 补丁 ⇒ profile 层按设计没有那一行
    //   （它已降级为备用路线），"从 profile 里删一行"这个动作在产品里不存在了。
    // 【判据一：产物 × 落点】两件产物，两端都要合契约：
    //   · 挂载态（标记**在**）：那一行只住顶层 `- insert:`（预设体里 0 次）；
    //   · 回滚态（标记**不在**）：那一行回到**两份**预设体里（顶层 insert 里 0 次）。
    //   盘上今天只有挂载态 ⇒ 回滚态由**真字节投影**造（删标记 + 把那一行搬回两份预设体，
    //   其余字节不动）。两端走同一个算式（`rollbackRouteReading()`）；一端不成立 ⇒
    //   RED `BOOT-R5-ROLLBACK-CONTRACT-BROKEN`（"回滚契约不成立"，**不是**"挂载行不在"）。
    // 【判据二：身份】撤掉挂载、重启之后**新建**的会话头仍须是 `agentPreset: agenia`
    //   —— 撤挂载不许折掉身份。这一半必须真的做过一次练习（删标记 → 重跑 → 重启 → 新建会话），
    //   回执由 `AGENIA_R5_REMOVAL_EXERCISE` 指过来；没做 ⇒ **HOLD**
    //   `BOOT-R5-REMOVAL-EXERCISE-MISSING`（名字刻意不是 `…-NO-MOUNT-ROW`：那个名字会被读成
    //   "挂载行不在"，而盘上的事实正好相反）。
    // 旧的两条腿（`oneStepRemoval()` 的"删一行"、`profilePatchReading()` 的 profile 条件式）同批退役。
    const rollbackArtifacts = rollbackRouteReading({
      compositionText: existsSync(PATHS.liveComposition) ? readFileSync(PATHS.liveComposition, 'utf8') : null,
      patchText: existsSync(PATHS.livePatch) ? readFileSync(PATHS.livePatch, 'utf8') : null,
    })
    rec.readings.rollback_artifacts = rollbackArtifacts.readings
    for (const p of rollbackArtifacts.problems) rec.problems.push(problem(p.code, p.message))

    // 先给**回执判定器**做自证：同一把尺子喂三份合成输入，必须给出三个互相分得开的判词
    // （该绿的绿 / 身份掉了红到 `IDENTITY-COST` / 回执形状坏了红到 `CONTRACT-BROKEN`）。
    const EXERCISE_FIXTURES = {
      green: {
        at: '2026-11-05T12:00:00.000Z',
        marker_removed: true,
        regenerated: true,
        row_landing: { insert: 0, preset_bodies: 2 },
        row_disabled: true,
        restart_at: '2026-11-05T12:05:00.000Z',
        new_session: { created_at: '2026-11-05T12:06:11.000Z', agentPreset: EXPECTED_PRESET },
      },
      identityLost: {
        at: '2026-11-05T12:00:00.000Z',
        marker_removed: true,
        regenerated: true,
        row_landing: { insert: 0, preset_bodies: 2 },
        row_disabled: true,
        restart_at: '2026-11-05T12:05:00.000Z',
        new_session: { created_at: '2026-11-05T12:06:11.000Z', agentPreset: 'standard' },
      },
      contractBroken: {
        at: '2026-11-05T12:00:00.000Z',
        marker_removed: false,
        regenerated: true,
        row_landing: { insert: 1, preset_bodies: 0 },
        row_disabled: true,
        restart_at: '2026-11-05T12:05:00.000Z',
        new_session: { created_at: '2026-11-05T12:06:11.000Z', agentPreset: EXPECTED_PRESET },
      },
    }
    const goodVerdict = rollbackExerciseVerdict(EXERCISE_FIXTURES.green)
    const lostVerdict = rollbackExerciseVerdict(EXERCISE_FIXTURES.identityLost)
    const brokenVerdict = rollbackExerciseVerdict(EXERCISE_FIXTURES.contractBroken)
    rec.readings.rollback_ruler = {
      green: { verdict: goodVerdict.verdict, code: goodVerdict.code },
      identity_lost: { verdict: lostVerdict.verdict, code: lostVerdict.code },
      contract_broken: { verdict: brokenVerdict.verdict, code: brokenVerdict.code },
    }
    if (goodVerdict.verdict !== 'GREEN' || lostVerdict.verdict !== 'RED' || lostVerdict.code !== BOOT_CODES.rollbackIdentityCost
      || brokenVerdict.verdict !== 'RED' || brokenVerdict.code !== BOOT_CODES.rollbackContractBroken) {
      rec.problems.push(problem(BOOT_CODES.rollbackRulerDead,
        '回执判定器不翻面 / 两个红分不开：合成的三份回执判成 '
        + `${JSON.stringify({ green: [goodVerdict.verdict, goodVerdict.code], identity_lost: [lostVerdict.verdict, lostVerdict.code], contract_broken: [brokenVerdict.verdict, brokenVerdict.code] })}`
        + `；期望 GREEN/— · RED/${BOOT_CODES.rollbackIdentityCost} · RED/${BOOT_CODES.rollbackContractBroken}`
        + ' —— 那"回滚这一格现在是 HOLD"就不是"练习没做"，是判定器坏了'))
    }

    // 身份那一半：今天有没有"练习回执"（**三种来源**：env / 默认落点 / 没有）。
    // 🔴 `bug-20261110-17`：回执还要证明"那一行是**关着**的"（`row_disabled: true`）。老格式回执缺这一格
    // ⇒ 判词是 HOLD `BOOT-R5-ROW-DISABLED-UNMEASURED`（缺一个读数，不是失败；补量后重交回执，契约 §3.7.2）。
    const exercise = readRollbackExercise()
    const exerciseVerdict = rollbackExerciseCaseVerdict(exercise)
    const r2 = sampleVerdict.verdict
    rec.readings.rollback_exercise = {
      path: exercise.path,
      supplied: exercise.supplied,
      source: exercise.source,
      checked: exercise.checked ?? [],
      read_error: exercise.error,
      row_disabled: exercise.receipt?.row_disabled ?? 'ABSENT',
      identity_today: r2,
      ...exerciseVerdict,
    }
    if (exerciseVerdict.verdict === 'HOLD') {
      caseHold(rec, exerciseVerdict.code, exerciseVerdict.why
        + `（今天的身份读数 = ${r2}，但那是**没撤挂载**的读数：它不回答"撤掉之后身份还在不在"）`)
    } else if (exerciseVerdict.verdict === 'RED') {
      rec.problems.push(problem(exerciseVerdict.code, exerciseVerdict.why))
    }
  })
})

test('BOOT-02 启动后读数 B（包可达）：宿主 boot 载荷登记这个包 + /plugins 路由取得到 client.js，缺一不算挂上', async () => {
  await runCase('BOOT-02', async (rec) => {
    const tree = treeIdentity()
    const pkg = packageReading(DASHBOARD_PKG_DIR())
    /**
     * 🔴 2026-11-05 深夜：挂载行搬回**我们自己的包**（`presets/agenia/cordis.patch.yml` 的顶层
     * `- insert:`）。所以这一格的"那一行在不在 / 住在哪 / 开没开"读的是**那份补丁**，
     * 不是 profile 补丁（那一层现在是备用路线，里面按设计没有这一行）。
     * A / B 两条读数、`404` 的三态、`HALF-PROOF` 一个字没改。
     */
    const mountPatchFile = path.join(PATHS.finalPreset, 'cordis.patch.yml')
    const patch = bundleMountReading({ file: mountPatchFile })
    const coverage = profilePatchCoverage(mountPatchFile)
    const host = hostUrlReading()
    const boot = hostBootReading()
    const T = boot.ok ? boot.at : null
    rec.readings.tree = tree
    rec.readings.package = {
      dir: pkg.dir,
      exists: pkg.exists,
      name: pkg.name ?? null,
      version: pkg.version ?? null,
      exports_client: pkg.exports_client ?? null,
      client_path: pkg.client_path ?? null,
      client_exists: pkg.client_exists ?? false,
      client_bytes: pkg.client_bytes ?? null,
      client_sha256: pkg.client_sha256 ?? null,
      platform: pkg.platform ?? null,
      manifest_sha256: pkg.manifest_sha256 ?? null,
      problems: pkg.problems,
      measured_at: new Date().toISOString(),
    }
    rec.readings.mount_patch = patchSummary(patch)
    /**
     * 🔴 读取器自证（**挂载行所在的那份补丁**）：`profilePatchCoverage()` 量的是"解析器吃掉了多少 /
     * 最后一条顶层 item 两把尺子同不同意"——它对这个文件同样成立。`warnings` 非空或两把尺子打架
     * ⇒ `BOOT-PATCH-READER-BLIND`（尺子瞎了，"不在 / 撤不掉"的判词一律不成立）。
     * ⚠️ 三组**合成**读取器夹具（多行 plain scalar 折行 / 三种真坏行）不在这里跑第二遍：
     *    它们在 `BOOT-01` 那一格跑（同一个 `patchReaderVerdict()`），同一个尺子不重复自证。
     */
    rec.readings.patch_reader = { file: mountPatchFile, source: 'bundle 补丁（挂载行所在的那份）', ...coverage }
    if (coverage.exists && (coverage.unparsed_count !== 0 || coverage.last_top_level_key.agree !== true)) {
      rec.problems.push(problem(BOOT_CODES.patchReaderBlind,
        `挂载行所在那份补丁没被读全（未解析 ${coverage.unparsed_count} 行 · 最后一条顶层 item `
        + `解析器 ${JSON.stringify(coverage.last_top_level_key.by_parser)} / 逐行扫原文 ${JSON.stringify(coverage.last_top_level_key.by_text)}）`
        + ' ⇒ 尺子瞎了：底下"那一行在不在 / 住哪"的判词一律不成立'))
      return
    }
    rec.readings.host = { ...host, measured_at: new Date().toISOString() }
    rec.readings.restart = { ok: boot.ok, at: boot.at, at_iso: boot.at_iso, source: boot.source, why: boot.why ?? null }

    // 包自己先得成立（不成立 ⇒ 后面的 URL/boot 都是空谈）
    if (pkg.problems.length > 0) {
      rec.problems.push(problem(BOOT_CODES.r3PackageUnreadable, `看板包自己没立住：${pkg.problems.join('；')}`))
      return
    }
    if (host.url === null) {
      caseHold(rec, BOOT_CODES.r3NoHostUrl, '宿主地址没有可信来源（`DSH_WEB_URL` 不在环境里）⇒ 两条读数都读不到 —— HOLD（不是绿）')
      return
    }

    // ── 两条读数**都跑**（挂载行不在也跑）：将来对比"挂之前/挂之后"要看的就是这四个状态码 ──
    const legA = await bootPayloadReading({ baseUrl: host.url, pkgName: pkg.name })
    const legB = await pluginChunkReading({ baseUrl: host.url, pkgName: pkg.name, clientPath: pkg.client_path, bootAt: T })
    rec.readings.legA_boot_payload = legA
    rec.readings.legB_plugin_route = legB

    /** A 的三态。 */
    const aState = legA.readable
      ? (legA.contains_package ? { state: 'green', code: null, why: `页面里的 \`__DSH_BOOT__\` 表里有 ${pkg.name}（${legA.entry_count} 条 entry）` }
        : { state: 'red', code: BOOT_CODES.r3EntryNotInBoot, why: `页面读得到（200）但 \`__DSH_BOOT__\` 的 entry 表里没有 ${pkg.name}（${legA.entry_count} 条：${JSON.stringify(legA.entries_sample)}）⇒ 浏览器**不会**去取这个包` })
      : { state: 'unreadable', code: legA.gated ? BOOT_CODES.r3BootPayloadGated : BOOT_CODES.r3BootPayloadUnreadable, why: legA.gated
        ? `页面要 token（401）：${JSON.stringify(legA.attempts.map((a) => ({ path: a.path, status: a.status, head: a.body_head && a.body_head.slice(0, 80) })))} ⇒ 这一条**读不到**，不是"不在"`
        : `页面两条路都读不到：${JSON.stringify(legA.attempts.map((a) => ({ path: a.path, status: a.status, error: a.error })))}` }
    /** B 的三态。 */
    const bState = legB.our.status === 200
      ? (legB.our.bytes_match_disk
        ? { state: 'green', code: null, why: `路由 200 · ${legB.our.body_bytes} B · sha256 ${String(legB.our.body_sha256).slice(0, 12)}…，且前 ${pkg.client_bytes} B 与盘上那份逐字节相同` }
        : { state: 'red', code: BOOT_CODES.r3RouteNoBytes, why: `路由 200 但字节与盘上那份对不上（body ${legB.our.body_bytes} B · sha256 ${String(legB.our.body_sha256).slice(0, 12)}… vs 盘上 ${pkg.client_bytes} B · ${String(pkg.client_sha256).slice(0, 12)}…）` })
      : legB.our.status === 404
        ? (legB.stale_after_boot
          ? { state: 'unreadable', code: BOOT_CODES.r3RevStale, why: `404，而且那份 client.js 的 mtime（${legB.rev.mtime}）晚于宿主启动（${boot.at_iso}）—— 宿主手里的 rev 可能还是旧的 ⇒ 这个 404 判不了` }
          : { state: 'unreadable', code: BOOT_CODES.r3Route404, why: `404（rev=${legB.rev.rev}）—— 这一格**不是"不在"的证据**：未知包名也 404（${legB.controls.unknownPackage.status}）、错 rev 也 404（${legB.controls.wrongRev.status}）、而根页面是 ${legB.controls.root.status}（门禁在，说明 \`/plugins\` 不归它管）；404 同时是"没挂上"和"URL/rev 算错"的形状` })
        : legB.our.ok
          ? (legB.our.status === 401 || legB.our.status === 403
            ? { state: 'unreadable', code: BOOT_CODES.r3RouteGated, why: `路由要 token（${legB.our.status}）⇒ 读不到` }
            : { state: 'unreadable', code: BOOT_CODES.r3Route404, why: `路由回了 ${legB.our.status}，不是 200/404` })
          : { state: 'unreadable', code: BOOT_CODES.r3NoHost, why: `连不上宿主 ${host.url}：${legB.our.error}（宿主没起来？）` }
    rec.readings.legs = { A: aState, B: bState }

    // ── 分流：先看挂载行，再看两条读数 ────────────────────────────────────────
    if (!patch.exists) {
      caseHold(rec, BOOT_CODES.r3NoMountPatch, `挂载行所在那份补丁不在（${patch.path}）⇒ 挂载行不存在，两条读数没有对象 —— HOLD`)
      return
    }
    if (!patch.mount.present) {
      caseHold(rec, BOOT_CODES.r3MountAbsent,
        `bundle 补丁（${patch.path} · ${patch.bytes} B · sha256 ${String(patch.sha256).slice(0, 12)}…）里没有指向 ${pkg.name} 的行 `
          + `⇒ 挂载还没落地，两条读数都**不许**当绿：A=${aState.state}${aState.code ? `（${aState.code}）` : ''} · B=${bState.state}${bState.code ? `（${bState.code}）` : ''}。`
          + '（"那一行缺席"是**产品事实**，红的那一条归 `DASH-15`；这一格只记"两条读数没有对象"）')
      return
    }
    if (patch.mount.placement !== 'insert') {
      rec.problems.push(problem(BOOT_CODES.r3MountNotHostLevel,
        `那一行在补丁里，但住在 ${patch.mount.placement}（${patch.mount.row?.where ?? '?'}）—— 不是顶层 \`- insert:\` 的直接成员 ⇒ 宿主装载层收不到它（${patch.path}）`))
      return
    }
    if (patch.mount.disabled) {
      caseHold(rec, BOOT_CODES.r3MountDisabled, `那一行在顶层 insert 里，但 \`disabled: true\` ⇒ 功能是故意关着的，两条读数没有对象 —— HOLD（不是绿）`)
      return
    }
    if (aState.state === 'red') rec.problems.push(problem(aState.code, aState.why))
    else if (bState.state === 'red') rec.problems.push(problem(bState.code, bState.why))
    if (aState.state !== 'green' || bState.state !== 'green') {
      caseHold(rec, BOOT_CODES.r3HalfProof,
        `定形 §五：两条读数都要有，缺一不算挂上 —— A=${aState.state}${aState.code ? `（${aState.code}）` : ''} · B=${bState.state}${bState.code ? `（${bState.code}）` : ''}。`
          + `A：${aState.why}；B：${bState.why}`)
    }
  })
})
