/**
 * **启动后读数**的量具（`BOOT-01` 身份 · `BOOT-02` 包可达）。
 *
 * 来历：2026-11-05 16:0x 那次事故 —— 面板挂错层之后客户端重启，新会话掉进窄权限
 * （`E_GUARD_NARROW_TOOL`）。**盘上所有读数都还是绿的**，因为整条链上没有任何一条读数
 * 在启动之后回答过两个问题：**预设还注册得上吗？浏览器真收到那个包了吗？**
 * 定形：`.team/leader/2026-11-05/定形-看板挂载profile层.md`（R2 / R3 / R5）。
 *
 * ── ① 身份（R2）：会话头**第一帧**里的 `agentPreset` ───────────────────────────
 * 证据源：`~/.dsh/sessions/<workspace-key>/<会话目录>/session.v4.jsonl.zstd`。
 *   · 多帧 zstd ⇒ **必须用** `.tools/asar-cli/zstd-frames.mjs` 全解（`zstdDecompressSync`
 *     只解第一帧、静默丢后面几 MB；那一句是 `REV-01` 用阳性/阴性对照实测过的，不是传说）。
 *   · 头在第一帧 —— 这是**读数**，不是假设：`readSessionHeader()` 另用
 *     `zstdDecompressSync(整份)`（= 只解第一帧）做交叉，两边解析出的头**必须逐字段相同**；
 *     不同 ⇒ `BOOT-R2-HEADER-NOT-IN-FIRST-FRAME`（尺子坏了，不是对象坏了）。
 *
 * 🔴 **锚点 = 首轮对话开始的时刻，不是 `header.createdAt`**（`bug-20261110-07`，2026-11-10）：
 *   · 这个客户端的"新建会话"**沿用空会话对象** ⇒ `header.createdAt` 是那个**空对象当初被建出来**的时刻。
 *     实测：`session-41f0e8d7`（`title = Meow access test`，`agentPreset = agenia`）11:15 建出并答了一轮，
 *     而 `createdAt` = 2026-11-06T07:03:30Z。旧锚点按 `createdAt >= T` 选 ⇒ **永远选不中**，
 *     判据永远 HOLD `BOOT-NO-SESSION-AFTER-RESTART` —— 一把"锚点选错字段"说成了"缺样本"。
 *   · 现在的锚点是 `IDENTITY_ANCHOR`：会话流里**第一条 `turn/start` 帧的 `time`**（首轮必须 `turn === 1`）。
 *     选它 / 否掉另外两个候选的理由，逐条写在 `IDENTITY_ANCHOR` 上（只此一份）。
 *   · ⇒ **只有"首轮在 T 之后"的会话才是"这一次启动之后的读数"**；首轮在 T 之前的叫 **resumed**
 *     （它进 `readings.resumed_touched_after_T`，**不当证据**）；流里读不到首轮的进
 *     `readings.anchor_unavailable`（**判不了**，不是绿）。
 *     没有"首轮在 T 之后"的会话 ⇒ `HOLD BOOT-NO-SESSION-AFTER-RESTART`（**永远不是绿**）。
 *   · ⚠️ 续跑（resume）回来的老会话仍然带着**它出生时**的 `agentPreset`（实测：`session-cc5c68d1`
 *     头写于 2026-10-19T03:03:54.661Z，`standard`；2026-11-05 16:07 续跑起来守卫读的还是 `standard`
 *     ⇒ 窄权限）。它现在是"resumed"，判法没变。
 *
 * 顶层会话（"老板新建的那个"）= `delegationDepth === 0` **且** 头里没有
 * `origin: "subagent"` / `parentSession` —— 委派出去的组员会话头是 `agenia-member` + `depth: 1`，
 * 拿它去判"预设注册没注册"会把一条**永远红**的假红焊进判据（本模块自带这一格的反向读数：
 * 同一个 T 下"不过滤"会选中组员会话，过滤后是 HOLD —— 过滤器是承重的，不是装饰）。
 *
 * ── ② 包可达（R3）：只认真能从宿主读到的两样东西 ──────────────────────────────
 * 平台侧的事实（从 `app.asar` 里 `@deepseek-ai/dsh-client-modules/lib/index.js` 读出来的，
 * 本机 `dsh` 0.2.1-rc.5）：
 *   · 表键 = **包名**（`reconcilePackage(packageName)`），不是 cordis 行 id ⇒
 *     `/plugins/agenia-dashboard/client.js` 那种写法**必然 404**（`agenia-dashboard` 是行 id）；
 *   · 单包 URL = `/plugins/<包名>/<fileName>?rev=<rev>`，`rev` = `sha1('plugin-artifact'\0 …)`
 *     前 12 hex，输入是 `[mtimeMs, ctimeMs, size]`（`artifactRevision()`）；
 *   · 未知 URL ⇒ **404**（`bundleResource()` 最后一行），而 `/` 那种页面是 **401**
 *     —— ⇒ **404 说明路由在、只是这份没挂上；401 才是"没 token 读不了"**。
 * 两条读数（定形 §五「两条读数都要有，缺一不算挂上」）：
 *   · A **boot 载荷**：页面的 `window.__DSH_BOOT__` 里有没有这个包名（`GET /` / `/index.html`）；
 *   · B **插件路由**：`GET /plugins/<包名>/client.js?rev=<rev>` 是否 200 且字节与盘上那份对得上。
 * ⚠️ 404 在 B 这一格**不构成"不在"**的证据：它同时是"没挂上"和"我这条 URL 算错了/宿主那份 rev
 *    比盘上旧"的形状。所以 B 只给三态：`200`（证据）/ `404`（**判不了**，记
 *    `BOOT-R3-ROUTE-404-AMBIGUOUS`）/ 连不上（`BOOT-R3-NO-HOST`）。**只有 A 能证"不在"**。
 * ⚠️ `rev` 的算法是从平台源码**抄**过来的（第二份真相，`cand-20261019-0030` 点过名的病）。
 *    它抄错的后果**只能是 404 ⇒ HOLD**，不会假绿：200 是它自己证明了自己算对。
 *
 * ── ③ 回滚（R5）：**撤挂载 = 删标记 + 重跑生成器**（2026-11-05 深夜 · 组长裁定"重定义，不退役"）──
 * 挂载行搬回**我们自己的包**（`presets/agenia/cordis.patch.yml` 的顶层 `- insert:`）之后，
 * "撤掉挂载"不再是"从 profile 补丁里删一行"，而是：
 *   ① 从组合（`presets/agenia/agent.cordis.yml`）里删掉那一行的 `# @host-level` 标记；
 *   ② 重跑 `.tools/make-bundle-patch.mjs`（生成器）——一条命令序列，一次提交即可回滚。
 * ⇒ R5 的判据是**两件产物 × 落点**的真值表 + 回滚后的身份读数：
 *   · 标记**在** ⇒ 那一行只住顶层 `- insert:`（预设体里 0 次）；标记**不在** ⇒ 那一行回到**两份**预设体里
 *     （顶层 insert 里 0 次）。两端都用 `composition.mjs::presetEntryProblems()` 判（同一个算式；
 *     它内部含"标记 ↔ 宿主行配对"那一段）。
 *     盘上今天只有**挂载态**（标记在）。回滚态由真字节投影出来（`withHostRowInPresetBodies()`：
 *     把那一行从 insert 搬回两份预设体、去掉标记注释），两端都必须 0 问题 —— 否则
 *     `RED BOOT-R5-ROLLBACK-CONTRACT-BROKEN`（是"回滚契约不成立"，**不是**"挂载行不在"）。
 *   · **身份**：撤掉挂载、重启之后**新建**的会话头仍必须是 `agentPreset: agenia`（撤挂载不许折掉身份）。
 *     这一半要求真的做一次"删标记 → 重跑 → 重启 → 新建会话"并留下回执：
 *     `AGENIA_R5_REMOVAL_EXERCISE=<json 路径>`（形状见 `rollbackExerciseVerdict()` 的文件头）。
 *     没有回执 ⇒ `HOLD BOOT-R5-REMOVAL-EXERCISE-MISSING`（**不是**绿，也不是"挂载行不在"）；
 *     回执说身份掉了 ⇒ `RED BOOT-R5-IDENTITY-COST`；回执自己的形状不对 ⇒
 *     `RED BOOT-R5-ROLLBACK-CONTRACT-BROKEN`。
 *   · 🔴 **旧的两条腿已退役**（不是静默消失）：`oneStepRemoval()`（"从文件里删一行"—— 那个动作
 *     在 bundle 路线上**不存在**）与 `profilePatchReading()`（profile 层降级为备用路线，
 *     它里面按设计没有那一行）。码 `BOOT-ROLLBACK-NO-MOUNT-ROW` / `BOOT-ROLLBACK-NOT-REMOVABLE` /
 *     `BOOT-ROLLBACK-DID-NOT-RESTORE` / `BOOT-MOUNT-BROKE-IDENTITY` / `BOOT-PROFILE-PATCH-MISSING`
 *     同批退役（墓碑在 `BOOT_CODES` 里）—— 尤其 `…-NO-MOUNT-ROW` 这个名字会让人把
 *     "这一格没做回滚练习"误读成"挂载行不在"，那是两个完全相反的事实。
 *
 * ── 每一条读数都带 `{树, 时刻}` ──────────────────────────────────────────────
 * `treeIdentity()` 给 `{repo, head}`；每一份文件给 `{bytes, sha256, mtime}`；每一份会话头给
 * `{第一帧字节数, sha256, createdAt, preset, 证据文件}`；`T` 给 `{at, source}`。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  hostLevelMarks,
  parseYamlSubset,
  presetEntryProblems,
  withoutHostLevelMarks,
} from './composition.mjs'
import { describePlacement, withHostRowInPresetBodies } from './client-ui-placement.mjs'
import { PATHS } from './env.mjs'

// ── 码（稳定、可 grep）──────────────────────────────────────────────────────
export const BOOT_CODES = {
  // 尺子/来源
  noSessionStore: 'BOOT-R2-NO-SESSION-STORE',
  noWorkspaceKey: 'BOOT-R2-NO-WORKSPACE-KEY',
  decompressorMissing: 'BOOT-R2-DECOMPRESSOR-MISSING',
  headerUnreadable: 'BOOT-R2-HEADER-UNREADABLE',
  headerNotFirstFrame: 'BOOT-R2-HEADER-NOT-IN-FIRST-FRAME',
  noNegativeControl: 'BOOT-R2-NO-NEGATIVE-CONTROL',
  noPositiveControl: 'BOOT-R2-NO-POSITIVE-CONTROL',
  detectorDead: 'BOOT-R2-DETECTOR-DEAD',
  selectorDead: 'BOOT-R2-SELECTOR-DEAD',
  restartTimeUnknown: 'BOOT-R2-RESTART-TIME-UNKNOWN',
  // 身份
  noSessionAfterRestart: 'BOOT-NO-SESSION-AFTER-RESTART',
  presetNotRegistered: 'BOOT-PRESET-NOT-REGISTERED',
  presetUnexpected: 'BOOT-PRESET-UNEXPECTED',
  // 回滚（R5）—— 2026-11-05 深夜重新定义：撤挂载 = 删 `# @host-level` 标记 + 重跑生成器。
  /**
   * 撤挂载的**练习回执**还没交：回滚之后重启、新建会话并读它的头 —— 这一跑没做过。
   * 🔴 名字刻意写成"练习没做"，**不是** `…-NO-MOUNT-ROW`：后者会被读成"挂载行不在"，
   * 而盘上的事实正好相反（标记在、宿主行在顶层 insert）。HOLD，不绿。
   */
  rollbackExerciseMissing: 'BOOT-R5-REMOVAL-EXERCISE-MISSING',
  /** 回滚契约不成立（两件产物的真值表 / 回执的形状不对）—— 红，不是"挂载行不在"。 */
  rollbackContractBroken: 'BOOT-R5-ROLLBACK-CONTRACT-BROKEN',
  /** 撤掉挂载 + 重启之后，新建会话的头不是 `agenia` —— 撤挂载折掉了身份。 */
  rollbackIdentityCost: 'BOOT-R5-IDENTITY-COST',
  /** R5 的尺子（回执判定器）不自证：合成的"该绿 / 该红"两份回执给不出两个不同判词。 */
  rollbackRulerDead: 'BOOT-R5-RULER-DEAD',
  /** 两件产物（组合 / bundle 补丁）有一份读不到 —— 前置失败，红（不是"这一档不适用"）。 */
  rollbackArtifactsMissing: 'BOOT-R5-ARTIFACTS-MISSING',
  /**
   * ── 退役（墓碑，2026-11-05 深夜）─────────────────────────────────────────────
   * 这几个码属于旧定义"从 profile 补丁里删一行"：`oneStepRemoval()` 找的是顶层列表里
   * 一个带看板包的 item，删掉它、再确认全文没有第二处引用。
   * 那个动作在 bundle 路线上**不存在**（撤挂载是改组合 + 重跑生成器，不是文件编辑），
   * 而 profile 层已降级为备用路线 ⇒ 留着它们只会造出第二套"挂载没做"的码。
   *   · `BOOT-ROLLBACK-NO-MOUNT-ROW`      —— 名字最危险：会被读成"挂载行不在"（实际是"没得撤"）
   *   · `BOOT-ROLLBACK-NOT-REMOVABLE`     —— "一行删不掉" 这个动作没有了
   *   · `BOOT-ROLLBACK-DID-NOT-RESTORE`   —— 旧条件式的一半（行不在 & 身份 RED）
   *   · `BOOT-MOUNT-BROKE-IDENTITY`       —— 旧条件式的另一半（行在 & 身份 RED）；身份掉了归 `BOOT-R5-IDENTITY-COST`
   *   · `BOOT-PROFILE-PATCH-MISSING`      —— R5 不再读 profile 补丁；bundle 补丁不在归 `BOOT-R5-ARTIFACTS-MISSING`
   */
  // 可达（R3）
  r3NoHostUrl: 'BOOT-R3-NO-HOST-URL',
  r3NoHost: 'BOOT-R3-NO-HOST',
  /**
   * 挂载行所在那份补丁不在。2026-11-05 深夜：那行搬回**我们自己的包**（bundle 补丁）⇒
   * 这个码从 `BOOT-R3-PROFILE-PATCH-MISSING` 改名为 `BOOT-R3-MOUNT-PATCH-MISSING`
   * （旧名指着 profile 层，那一层现在是备用路线，不是判据载体）。
   */
  r3NoMountPatch: 'BOOT-R3-MOUNT-PATCH-MISSING',
  r3MountAbsent: 'BOOT-R3-MOUNT-ABSENT',
  r3MountDisabled: 'BOOT-R3-MOUNT-DISABLED',
  r3MountNotHostLevel: 'BOOT-R3-MOUNT-NOT-TOP-LEVEL-INSERT',
  r3BootPayloadGated: 'BOOT-R3-BOOT-PAYLOAD-TOKEN-GATED',
  r3BootPayloadUnreadable: 'BOOT-R3-BOOT-PAYLOAD-UNREADABLE',
  r3EntryNotInBoot: 'BOOT-R3-ENTRY-NOT-IN-BOOT',
  r3Route404: 'BOOT-R3-ROUTE-404-AMBIGUOUS',
  r3RouteGated: 'BOOT-R3-PLUGIN-ROUTE-GATED',
  r3RouteNoBytes: 'BOOT-R3-ROUTE-BYTES-DIFFER',
  r3RevStale: 'BOOT-R3-REV-STALE-AFTER-BOOT',
  r3HalfProof: 'BOOT-R3-HALF-PROOF',
  r3PackageUnreadable: 'BOOT-R3-PACKAGE-UNREADABLE',
  // 读取器覆盖（Gate-2 缺陷：多行 plain scalar 让读取器从第 45 行起整段盲掉）
  patchReaderBlind: 'BOOT-PATCH-READER-BLIND',
  patchReaderNoFold: 'BOOT-PATCH-READER-NO-FOLD',
  patchReaderFalseAccept: 'BOOT-PATCH-READER-FALSE-ACCEPT',
  patchReaderNoLiveFile: 'BOOT-PATCH-READER-NO-LIVE-FILE',
}

/** 期望的预设名（定形 R2）。 */
export const EXPECTED_PRESET = 'agenia'

/**
 * 🔴 `BOOT-01` 的**锚点**（`bug-20261110-07`）—— 常量只此一份，读数里点名的那句话就是它。
 *
 * **选的是**：`turn/start` —— 会话流里**第一轮对话开始的那一帧**的 `time`（全解后的 JSONL）。
 * **为什么不是 `identity.createdAt`**（旧锚点，错的那个）：这个客户端的"新建会话"**沿用空会话对象**
 * —— `createdAt` 是那个空对象**当初被建出来**的时刻，不是老板开始说话的時刻。
 * 2026-11-10 实测：`session-41f0e8d7`（`title = Meow access test`，`agentPreset = agenia`，depth 0，
 * cwd `E:\Harness`）11:15 建出并答了一轮，而它的 `createdAt` = `2026-11-06T07:03:30.836Z`。
 * 按旧锚点它**永远**选不中 ⇒ 判据永远 HOLD `BOOT-NO-SESSION-AFTER-RESTART`，
 * 把一个"锚点选错字段"说成了"缺样本"。
 *
 * **为什么是会话流里那一帧的 `time`**（三条都在同一份文件里，不另开证据源）：
 *   · `readSessionHeader()` 本来就要把整份流解成 JSONL（`zstd-frames.mjs --json-out`），
 *     那一帧**已经在手上** —— 不新增一次 IO、不新增一个证据载体；
 *   · 生产者是同一个（客户端写流的那一支），与头同一份文件、同一次落盘 ⇒ 不会出现"头在 A 源、时刻在 B 源"；
 *   · `turn/start` 是**行为**（老板真的开口了），不是对象被建出来的时刻 —— 与判据要问的问题同义。
 *
 * **被否掉的两个候选**（都写在这儿，省得下一个人再走一遍）：
 *   · `session_projcache` 的 `record.rows.turnOutline.turns[0]` —— ① 它是**另一份store**
 *     （`~/.dsh/storages/session_projcache/…`，与 `.zstd` 流两套落盘）；② 那个 `turn` 对象里
 *     **没有时刻**（只有 `seq`：2026-11-10 实测 `{turn:1, seq:11, prompt, response}`），
 *     要拿到时刻仍得回到流里把 `seq` 换回 `time` —— 绕一圈回到同一个答案；
 *     ③ `turns` 是**投影摘要**，长会话里可能被裁/轮转，"`turns[0]`"不等于"这个会话的第一轮"。
 *   · `session_projcache` 的 `sessionListMetadata.lastPromptAt` —— ① 同一个 projcache 依赖；
 *     ② 名字就写着 **last**（最后一次说话），多轮会话里它不是首轮；
 *     ③ 判据要能在**只读副本 / 夹具**上跑，而那份 store 不在提交里 ⇒ 每个夹具都得造两份盘。
 */
export const IDENTITY_ANCHOR = Object.freeze({
  name: 'first-turn-start',
  source: '会话流（session.v4.jsonl.zstd 全解后的 JSONL）里第一条 `turn/start` 帧的 `time`',
  field: 'firstTurnAt',
  chosen_because: '它是"老板真的开口了"这件事的时刻，与"这次重启之后有没有新会话在说话"同义；而且它与会话头同文件、同一次落盘，不新增证据源',
  rejected: Object.freeze([
    'identity.createdAt —— 客户端新建会话沿用空会话对象，这个时刻是空对象当初被建出来的时刻（bug-20261110-07）',
    'session_projcache · turnOutline.turns[0] —— 另一份 store；那个 turn 对象没有时刻（只有 seq）；投影摘要可能被裁，turns[0] 不等于首轮',
    'session_projcache · sessionListMetadata.lastPromptAt —— 另一份 store；名字写着 last（最后一次说话），多轮会话里不是首轮',
  ]),
})

/** 看板包的目录（在现役预设树里）。 */
export const DASHBOARD_PKG_DIR = () => path.join(PATHS.finalPreset, 'client-ui-dashboard')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').toUpperCase()

/** 这一跑打的是哪棵树（与 `dash06` 同一个口径：副本里没有 `.git` 就如实记 null）。 */
export function treeIdentity(repo = PATHS.repo) {
  const gitMark = path.join(repo, '.git')
  let head = null
  if (existsSync(gitMark)) {
    const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' })
    head = r.status === 0 ? String(r.stdout ?? '').trim() || null : null
  }
  return { repo, head, has_git: existsSync(gitMark), measured_at: new Date().toISOString() }
}

// ── ① 会话流 ───────────────────────────────────────────────────────────────
/**
 * 会话流的根。**故意不读 `DSH_HOME`**：唯一结算入口把 `DSH_HOME` 指到运行根里
 * （`run-all.mjs` 的 `ENV`），照着它读会读到一个空目录 —— 那是"没会话"的假象。
 * `AGENIA_SESSION_ROOT` 是显式覆盖（夹具/别的工作区用）。
 */
export function sessionRootReading(env = process.env) {
  const explicit = env.AGENIA_SESSION_ROOT ?? null
  const root = explicit === null ? path.join(os.homedir(), '.dsh', 'sessions') : path.resolve(explicit)
  return {
    root,
    source: explicit === null ? 'homedir()/.dsh/sessions' : 'AGENIA_SESSION_ROOT',
    dsh_home_env: env.DSH_HOME ?? null,
    note: '不用 DSH_HOME：唯一结算入口把它指到运行根里',
    exists: existsSync(root),
  }
}

/** `E:\Harness` → `--E-Harness--`（DSH 的工作区键形状；**只是提示**，判定由头里的 cwd 决定）。 */
export function workspaceKeyHint(cwd) {
  const flat = String(cwd).replace(/:/g, '').replace(/[\\/]/g, '-').replace(/ /g, '~0020')
  return `--${flat}--`
}

/** 一个工作区键下面全部会话目录（按 `session.v4.jsonl.zstd` 的 mtime 倒序）。 */
export function listSessions(keyDir) {
  if (!existsSync(keyDir)) return []
  const out = []
  for (const name of readdirSync(keyDir)) {
    const file = path.join(keyDir, name, 'session.v4.jsonl.zstd')
    if (!existsSync(file)) continue
    const st = statSync(file)
    out.push({ dir: name, file, bytes: st.size, mtimeMs: st.mtimeMs, mtime: new Date(st.mtimeMs).toISOString() })
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return out
}

/**
 * 读一份会话流的**头**（第一帧）。
 *
 * 两把尺子，必须说同一件事：
 *   · 主尺 = `.tools/asar-cli/zstd-frames.mjs`（按 RFC 8878 算帧边界、逐帧解、拼接）；
 *   · 交叉 = `zstdDecompressSync(整份)` —— 平台自己声明它**只解第一帧**，所以这一格量的正是
 *     "头在第一帧里"这条假设（它若不成立，两个解析结果会不一样）。
 */
export function readSessionHeader(file, { tmpDir, timeoutMs = 120000 } = {}) {
  const tool = path.join(PATHS.repo, '.tools', 'asar-cli', 'zstd-frames.mjs')
  const base = {
    file,
    file_rel: path.relative(PATHS.repo, file).replace(/\\/g, '/'),
    file_bytes: existsSync(file) ? statSync(file).size : null,
    file_sha256: existsSync(file) ? sha256(readFileSync(file)) : null,
    measured_at: new Date().toISOString(),
  }
  const raw = existsSync(file) ? readFileSync(file) : null
  if (!existsSync(tool)) {
    return { ok: false, code: BOOT_CODES.decompressorMissing, why: `解压器不在盘上：${tool}`, tool: { path: tool, exists: false }, ...base }
  }
  // 🔴 临时件落**项目所在盘**（`.team/test/_tmp/…`），不走 `os.tmpdir()`（默认在 C 盘）
  const dir = tmpDir ?? path.join(PATHS.repo, '.team', 'test', '_tmp', 'boot-readings')
  mkdirSync(dir, { recursive: true })
  const outFile = path.join(dir, `${path.basename(path.dirname(file))}.jsonl`)
  const res = spawnSync(process.execPath, [tool, file, '--json-out', outFile], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 })
  const stdout = String(res.stdout ?? '')
  const frames = stdout.split(/\r?\n/).filter((l) => /^\s*帧 \d+:/.test(l)).length
  const toolReading = {
    path: tool,
    exists: true,
    exit_code: res.status,
    frames,
    out_file: outFile,
    stderr_head: String(res.stderr ?? '').slice(0, 400),
  }
  if (res.status !== 0 || !existsSync(outFile)) {
    return { ok: false, code: BOOT_CODES.headerUnreadable, why: `zstd-frames.mjs 退出码 ${res.status ?? '?'}：${String(res.stderr ?? '').slice(0, 200)}`, tool: toolReading, ...base }
  }
  const text = readFileSync(outFile, 'utf8')
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '')
  if (firstLine === undefined) {
    return { ok: false, code: BOOT_CODES.headerUnreadable, why: '解出来的文本里没有一行', tool: toolReading, ...base }
  }
  let header = null
  try {
    header = JSON.parse(firstLine)
  } catch (err) {
    return { ok: false, code: BOOT_CODES.headerUnreadable, why: `第一行不是 JSON（${String(err?.message ?? err).slice(0, 160)}）`, tool: toolReading, ...base }
  }
  if (header?.type !== 'session') {
    return { ok: false, code: BOOT_CODES.headerUnreadable, why: `第一行的 type 是 ${JSON.stringify(header?.type)}，不是 "session"`, tool: toolReading, ...base }
  }
  // 交叉：只解第一帧（平台自己说它只解第一帧）。两边解析出的头必须逐字段相同。
  let cross = { agree: null, why: null, first_frame_bytes: null }
  if (raw !== null) {
    try {
      const firstOnly = zlib.zstdDecompressSync(raw).toString('utf8')
      const line = firstOnly.split(/\r?\n/).find((l) => l.trim() !== '')
      const parsed = line === undefined ? null : JSON.parse(line)
      cross = {
        method: 'zlib.zstdDecompressSync(整份) ⇒ 只解第一帧',
        agree: JSON.stringify(parsed) === JSON.stringify(header),
        first_frame_bytes: line === undefined ? null : Buffer.byteLength(line, 'utf8'),
      }
    } catch (err) {
      cross = { method: 'zlib.zstdDecompressSync(整份)', agree: null, why: String(err?.message ?? err).slice(0, 200) }
    }
  }
  // 字节级证据：`agentPreset` 那一格在**第一行的原文**里出现在哪、原文那一段是什么。
  const field = /"agentPreset"\s*:\s*("(?:[^"\\]|\\.)*"|null)/.exec(firstLine)
  /**
   * 🔴 **锚点**（`IDENTITY_ANCHOR`）：首轮对话的时刻，从这份已经解出来的 JSONL 里取。
   * 全解的结果就在 `outFile` 里（`zstd-frames.mjs --json-out` 写的），**不再多解一遍**。
   */
  const firstTurn = firstTurnOfFile(outFile)
  return {
    ok: true,
    ...base,
    first_frame_text: firstLine,
    first_frame_bytes: Buffer.byteLength(firstLine, 'utf8'),
    first_frame_sha256: sha256(firstLine),
    first_frame_head: firstLine.slice(0, 220),
    agent_preset_literal: field === null ? null : { index: field.index, match: field[0], value_text: field[1] },
    header,
    first_turn: firstTurn,
    cross_check: cross,
    tool: toolReading,
  }
}

/**
 * **第一轮对话开始的时刻**（`IDENTITY_ANCHOR` 的实现）—— 从**已经解出来的** JSONL 里取。
 *
 * 为什么要单独一个函数、还要带 `turn === 1` 这条判据：
 *   · `turn/start` 帧带 `data.turn`；一个会话的**首轮**必须是 `turn === 1`。
 *     流若从第 5 轮才开始（被裁 / 轮转 / 续跑进来的那一段），我们**没有**它的首轮时刻
 *     ⇒ 返回 `ok:false, why:'first-turn-not-in-stream'`，调用方按"判不了"处理
 *     （**不许**拿第 5 轮的时刻冒充首轮 —— 那会把"这会话早就说过话"读成"今天才第一次说话"）。
 *   · 头写的 `createdAt` 只当**上下文**记在读数里，不参与判定。
 *
 * @param {string} file `readSessionHeader()` 的 `tool.out_file`（全解后的 JSONL）
 * @returns {{ok:boolean, time?:number, time_iso?:string, turn?:number|null, seq?:number|null,
 *            line_index?:number, frame?:string, turn_is_first?:boolean, why?:string,
 *            text_bytes?:number, how?:string, anchor?:string}}
 */
export function firstTurnOfFile(file) {
  if (typeof file !== 'string' || file === '' || !existsSync(file)) {
    return { ok: false, why: `解压后的 JSONL 不在（${String(file)}）`, anchor: IDENTITY_ANCHOR.name }
  }
  let text = null
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    return { ok: false, why: `解压后的 JSONL 读不动：${String(err?.message ?? err).slice(0, 160)}`, anchor: IDENTITY_ANCHOR.name }
  }
  let from = 0
  let lineIndex = 0
  let seenTurnStart = 0
  while (from <= text.length) {
    const at = text.indexOf('"turn/start"', from)
    if (at < 0) break
    const lineStart = text.lastIndexOf('\n', at) + 1
    const nextNl = text.indexOf('\n', at)
    const lineEnd = nextNl < 0 ? text.length : nextNl
    lineIndex = text.slice(0, lineStart).split('\n').length
    from = at + 1
    let obj = null
    try {
      obj = JSON.parse(text.slice(lineStart, lineEnd))
    } catch {
      continue
    }
    if (obj?.type !== 'turn/start') continue
    seenTurnStart += 1
    const time = typeof obj?.time === 'number' ? obj.time : null
    if (time === null) continue
    const turn = typeof obj?.data?.turn === 'number' ? obj.data.turn : null
    const base = {
      anchor: IDENTITY_ANCHOR.name,
      how: IDENTITY_ANCHOR.source,
      time,
      time_iso: new Date(time).toISOString(),
      turn,
      seq: typeof obj?.seq === 'number' ? obj.seq : null,
      line_index: lineIndex,
      frame: `turn/start（第 ${lineIndex} 行）`,
      text_bytes: Buffer.byteLength(text, 'utf8'),
    }
    if (turn !== 1) {
      return { ...base, ok: false, turn_is_first: false, why: `流里第一条 turn/start 是第 ${JSON.stringify(turn)} 轮 —— 首轮不在流里（被裁/轮转/续跑），不能拿它冒充"第一次说话"` }
    }
    return { ...base, ok: true, turn_is_first: true }
  }
  return {
    ok: false,
    why: `整份流里${seenTurnStart === 0 ? '一条 `turn/start` 帧都没有' : '的 turn/start 都读不出 time'} —— 这个会话没有"第一轮"可当锚点`,
    text_bytes: Buffer.byteLength(text, 'utf8'),
    anchor: IDENTITY_ANCHOR.name,
  }
}

/** `readSessionHeader()` 的读数 → 首轮读数（没有解出来的文件就如实说"判不了"）。 */
export function firstTurnOf(reading) {
  return firstTurnOfFile(reading?.tool?.out_file ?? null)
}

/** 头 → 一份可比的会话身份读数（**不猜**：字段不在就写 null）。 */
export function identityOf(reading) {
  const h = reading.header ?? {}
  const depth = typeof h.delegationDepth === 'number' ? h.delegationDepth : null
  const origin = h.origin ?? null
  const parentSession = h.parentSession ?? null
  const isSubagent = (depth !== null && depth > 0) || origin === 'subagent' || parentSession !== null
  const firstTurn = reading.first_turn ?? null
  return {
    id: h.id ?? null,
    dir: path.basename(path.dirname(reading.file)),
    createdAt: typeof h.createdAt === 'number' ? h.createdAt : null,
    createdAt_iso: typeof h.createdAt === 'number' ? new Date(h.createdAt).toISOString() : null,
    /**
     * 🔴 **锚点**（`IDENTITY_ANCHOR`）：首轮对话开始的时刻。`createdAt` 只当上下文，
     * 与判定无关（`bug-20261110-07`）。读数里两个都给 —— 读的人不必回推"它用的是哪一个"。
     */
    anchor: IDENTITY_ANCHOR.name,
    firstTurnAt: firstTurn?.ok === true ? firstTurn.time : null,
    firstTurnAt_iso: firstTurn?.ok === true ? firstTurn.time_iso : null,
    firstTurn_turn: typeof firstTurn?.turn === 'number' ? firstTurn.turn : null,
    firstTurn_seq: typeof firstTurn?.seq === 'number' ? firstTurn.seq : null,
    /** `true` = 流里第一条 `turn/start` 就是第 1 轮（锚点成立）；`false`/`null` = 判不了。 */
    firstTurn_is_first: firstTurn?.ok === true ? firstTurn.turn_is_first === true : (firstTurn === null ? null : false),
    firstTurn_why: firstTurn?.ok === true ? null : (firstTurn?.why ?? 'not-measured'),
    agentPreset: typeof h.agentPreset === 'string' ? h.agentPreset : null,
    cwd: h.cwd ?? null,
    delegationDepth: depth,
    origin,
    parentSession,
    is_subagent: isSubagent,
    is_top_level: !isSubagent,
    file: reading.file,
    file_bytes: reading.file_bytes,
    /** 文件 mtime（eadSessionHeader 已经在 base 里量了；缺就是 null，不许让排序抛错）。 */
    mtime: reading.mtime ?? (reading.file !== undefined && existsSync(reading.file) ? new Date(statSync(reading.file).mtimeMs).toISOString() : null),
    file_sha256: reading.file_sha256,
    first_frame_bytes: reading.first_frame_bytes ?? null,
    first_frame_sha256: reading.first_frame_sha256 ?? null,
  }
}

/** 找一个工作区键：先按 `workspaceKeyHint` 试一个，再用头里的 `cwd` **验证**；不对就扫别的键。 */
export function findWorkspaceKey({ root, cwd, tmpDir, maxScan = 24 }) {
  const hint = workspaceKeyHint(cwd)
  const tried = []
  const verify = (key) => {
    const keyDir = path.join(root, key)
    const sessions = listSessions(keyDir)
    if (sessions.length === 0) return null
    for (const s of sessions.slice(0, 3)) {
      const r = readSessionHeader(s.file, { tmpDir })
      tried.push({ key, file: s.file, ok: r.ok, cwd: r.ok ? r.header?.cwd ?? null : null })
      if (r.ok && String(r.header?.cwd ?? '').toLowerCase() === String(cwd).toLowerCase()) return { key, keyDir, verifiedBy: r }
    }
    return null
  }
  if (existsSync(path.join(root, hint))) {
    const hit = verify(hint)
    if (hit !== null) return { ok: true, ...hit, hint, tried }
  }
  for (const key of readdirSync(root).slice(0, maxScan)) {
    if (key === hint) continue
    const hit = verify(key)
    if (hit !== null) return { ok: true, ...hit, hint, tried }
  }
  return { ok: false, hint, tried, keys: existsSync(root) ? readdirSync(root) : [] }
}

/**
 * 扫一批会话的头（**有上限，且上限会自报**）。
 * `sinceMs`：只读 mtime ≥ 它 的会话（创建时间晚于 T 的会话，其文件 mtime 必然也 ≥ T）。
 */
export function scanHeaders(sessions, { tmpDir, sinceMs = null, limit = 40 }) {
  const pool = sinceMs === null ? sessions : sessions.filter((s) => s.mtimeMs >= sinceMs)
  const picked = pool.slice(0, limit)
  const out = []
  const failures = []
  for (const s of picked) {
    const r = readSessionHeader(s.file, { tmpDir })
    if (!r.ok) {
      failures.push({ file: s.file, code: r.code, why: r.why })
      continue
    }
    out.push({ ...identityOf(r), mtime: s.mtime, reading: r })
  }
  return {
    scanned: out.length,
    pool: pool.length,
    capped: pool.length > picked.length,
    limit,
    sinceMs,
    failures,
    identities: out,
  }
}

/**
 * "最近一次**首轮对话**发生在 T 之后"的会话（R2 的选择器，锚点见 `IDENTITY_ANCHOR`）。
 * `mode: 'top-level'`（默认，老板新建的那个）/ `'all'`（不过滤 —— 只用来当**反向读数**）。
 *
 * 四类，各自有名字（读的人不必回推）：
 *   · `eligible` / `newest` —— 首轮在 T 之后（`firstTurnAt >= T`）、且是顶层 ⇒ 这一次启动的读数；
 *   · `resumed_touched_after_T` —— 首轮在 T **之前**（这个会话**早就说过话**，之后又被碰过）⇒ **不当证据**；
 *   · `anchor_unavailable` —— 流里读不到首轮（没有 `turn/start` / 首轮被裁）⇒ **判不了**，既不是证据也不是绿；
 *   · 其余（`firstTurnAt < T` 且 mtime < T 的）不在这一跑的样本里，**不列**。
 */
export function selectNewestAfter(identities, { T, mode = 'top-level' }) {
  const list = Array.isArray(identities) ? identities : []
  const judged = list.filter((x) => x.firstTurn_is_first === true && typeof x.firstTurnAt === 'number')
  const anchorUnavailable = list.filter((x) => x.firstTurn_is_first !== true)
  const after = judged.filter((x) => x.firstTurnAt >= T)
  const eligible = mode === 'top-level' ? after.filter((x) => x.is_top_level) : after
  const resumed = judged.filter((x) => x.firstTurnAt < T)
  eligible.sort((a, b) => b.firstTurnAt - a.firstTurnAt)
  // `mtime` 可能缺（只在"扫过目录"的那条路上有）—— 缺就沉到最后，**不许**让排序抛错
  const mtimeOf = (x) => (typeof x.mtime === 'string' ? x.mtime : '')
  resumed.sort((a, b) => mtimeOf(b).localeCompare(mtimeOf(a)))
  return {
    T,
    T_iso: new Date(T).toISOString(),
    mode,
    /** 🔴 这一格比的是**哪个时刻** —— 读数自己说出来，不让下一个人猜。 */
    anchor: IDENTITY_ANCHOR.name,
    anchor_source: IDENTITY_ANCHOR.source,
    anchor_field: IDENTITY_ANCHOR.field,
    first_turn_after_T: after.length,
    eligible: eligible.length,
    newest: eligible[0] ?? null,
    candidates: eligible.slice(0, 5).map((x) => ({ id: x.id, firstTurnAt_iso: x.firstTurnAt_iso, agentPreset: x.agentPreset, is_top_level: x.is_top_level })),
    resumed_touched_after_T: resumed.slice(0, 10).map((x) => ({
      id: x.id,
      firstTurnAt_iso: x.firstTurnAt_iso,
      createdAt_iso: x.createdAt_iso,
      agentPreset: x.agentPreset,
      mtime: x.mtime,
    })),
    resumed_count: resumed.length,
    anchor_unavailable_count: anchorUnavailable.length,
    anchor_unavailable: anchorUnavailable.slice(0, 10).map((x) => ({ id: x.id, createdAt_iso: x.createdAt_iso, why: x.firstTurn_why ?? null })),
    /** ⚠️ 只当**上下文**：`createdAt` 是旧锚点，今天它一个判词都不决定（`bug-20261110-07`）。 */
    header_created_after_T: list.filter((x) => typeof x.createdAt === 'number' && x.createdAt >= T).length,
  }
}

/** 头里的 `agentPreset` 对期望值 ⇒ `GREEN` / `RED`（纯函数；**这是会翻面的那一格**）。 */
export function presetVerdict(identity, expected = EXPECTED_PRESET) {
  if (identity === null || identity === undefined) return { verdict: 'HOLD', code: BOOT_CODES.noSessionAfterRestart }
  if (identity.agentPreset === expected) {
    return { verdict: 'GREEN', code: null, why: `会话头 \`agentPreset\` = ${JSON.stringify(identity.agentPreset)}` }
  }
  const code = identity.agentPreset === 'standard' ? BOOT_CODES.presetNotRegistered : BOOT_CODES.presetUnexpected
  return {
    verdict: 'RED',
    code,
    why: `会话 ${identity.id}（首轮 ${identity.firstTurnAt_iso ?? '?'} · 头里的 createdAt ${identity.createdAt_iso ?? '?'}）`
      + `头里的 \`agentPreset\` 是 ${JSON.stringify(identity.agentPreset)}，`
      + `期望 ${JSON.stringify(expected)} ⇒ ${identity.agentPreset === 'standard' ? '预设没注册上（标准档 = 无角色 ⇒ 窄权限）' : '注册成了别的预设'}`,
  }
}

// ── ② 启动时刻 T ───────────────────────────────────────────────────────────
/**
 * 这一次客户端启动的时刻。
 *   · `AGENIA_BOOT_AT`（显式，ISO）优先 —— 老板重启之后由人写进来，**不许猜**；
 *   · 否则量**宿主进程的启动时刻**：从本进程一路往上爬，取最老的那个 `DeepSeek Harness`
 *     —— 它就是这个客户端的 boot（profile/bundle 层就是在它启动时合成的）；
 *   · 两条都拿不到 ⇒ `HOLD BOOT-R2-RESTART-TIME-UNKNOWN`（没有 T 就没有"之后"，不许绿）。
 */
export function hostBootReading({ env = process.env, timeoutMs = 30000 } = {}) {
  const now = Date.now()
  if (typeof env.AGENIA_BOOT_AT === 'string' && env.AGENIA_BOOT_AT.trim() !== '') {
    const at = Date.parse(env.AGENIA_BOOT_AT)
    if (Number.isFinite(at)) {
      return {
        ok: at <= now + 5 * 60 * 1000,
        at,
        at_iso: new Date(at).toISOString(),
        source: 'AGENIA_BOOT_AT',
        chain: [],
        why: at <= now + 5 * 60 * 1000 ? null : 'AGENIA_BOOT_AT 在未来',
      }
    }
    return { ok: false, at: null, source: 'AGENIA_BOOT_AT', chain: [], why: `AGENIA_BOOT_AT 不是时间：${env.AGENIA_BOOT_AT}` }
  }
  const script = `
$p = ${process.pid}
$rows = @()
for ($i = 0; $i -lt 12 -and $p -ne 0; $i++) {
  $x = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
  if ($null -eq $x) { break }
  $rows += ("{0}|{1}|{2}" -f $x.ProcessId, $x.Name, $x.CreationDate.ToString('yyyy-MM-ddTHH:mm:ss.fffzzz'))
  $p = [int]$x.ParentProcessId
}
$rows -join "\`n"
`
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: timeoutMs })
  if (res.status !== 0) {
    return { ok: false, at: null, source: 'host-process-chain', chain: [], why: `进程链读不到（powershell exit ${res.status ?? '?'}）：${String(res.stderr ?? '').slice(0, 200)}` }
  }
  const chain = String(res.stdout ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '').map((l) => {
    const [pid, name, when] = l.split('|')
    return { pid: Number(pid), name, createdAt: when, at: Date.parse(when) }
  })
  const hosts = chain.filter((x) => /DeepSeek Harness/i.test(String(x.name)) && Number.isFinite(x.at))
  if (hosts.length === 0) {
    return { ok: false, at: null, source: 'host-process-chain', chain, why: '父进程链里没有 DeepSeek Harness 进程（不是在客户端里跑的）' }
  }
  const oldest = hosts.reduce((a, b) => (a.at <= b.at ? a : b))
  return {
    ok: oldest.at <= now + 5 * 60 * 1000,
    at: oldest.at,
    at_iso: new Date(oldest.at).toISOString(),
    source: 'host-process-chain',
    host: { pid: oldest.pid, name: oldest.name, created_at: oldest.createdAt },
    chain,
    why: oldest.at <= now + 5 * 60 * 1000 ? null : '量到的启动时刻在未来',
  }
}

// ── ③ profile 补丁（R1 的落点 · R5 的两个 artifacts 之一）────────────────────
/** 客户端**自己那份** profile 补丁的路径（R1 要写的就是它）。 */
export function profilePatchPath(env = process.env) {
  const explicit = env.AGENIA_PROFILE_PATCH ?? null
  if (explicit !== null) return { path: path.resolve(explicit), source: 'AGENIA_PROFILE_PATCH' }
  const dir = env.DSH_PROFILE_DIR ?? null
  if (dir !== null) return { path: path.join(dir, 'cordis.patch.yml'), source: 'DSH_PROFILE_DIR' }
  const profile = env.DSH_PROFILE ?? 'desktop'
  return { path: path.join(os.homedir(), '.dsh', 'profiles', profile, 'cordis.patch.yml'), source: 'homedir()/.dsh/profiles/<DSH_PROFILE>' }
}

/**
 * 🔴 **读取器覆盖**（Gate-2 缺陷 · 2026-11-05）——
 * 这一节回答一个问题：**这一跑的结论是"那行不在"，还是"读取器没看见"？**
 *
 * 缺陷形状：现役 profile 补丁第 44–45 行是一处**多行 plain scalar**（`description: …` + 更深缩进的续行）。
 * 窄口径读取器 `parseYamlSubset` 当时读不懂它 ⇒ 从第 45 行起**整段盲掉**（18 条「未被解析器吃掉的行」，
 * 最后一条顶层 item `- id: web-search-deepseek` 根本看不见）。后果不是红，是**静默**：
 * `BOOT-02` 只能永远报 `BOOT-R3-MOUNT-ABSENT`（"挂载行不在"），R5 也会对一份好文件报"撤不掉"。
 * （2026-11-05 深夜：R5 已改成"删标记 + 重跑生成器"，`oneStepRemoval()` 退役；这条自证保留 ——
 *  R5 的产物读数与 BOOT-02 的挂载读数都走同一个窄口径解析器。）
 * **"读不到"与"不在"长得一模一样** ⇒ 这一格必须有它自己的读数。
 *
 * 三段，缺一不算自证：
 *   ① **阳性对照（盘上真实文件）**：`profilePatchCoverage()` 对**这一跑真正读的那一份**与**现役那一份**
 *      各量一次 —— 未解析条数必须 `0`，且**最后一条顶层 item 的键**必须与"逐行扫原文"那一把**独立的**
 *      尺子给出同一个键（`cand-20261021-0091`：期望侧不许拿同一份来源）。对不上 ⇒
 *      `BOOT-PATCH-READER-BLIND`（红：尺子瞎了，不是对象坏了）。
 *   ② **功能阳性对照（合成）**：多行 plain scalar 必须真的被**折成一个空格**（不是被跳过、不是原样留着），
 *      而且它后面那一行必须照旧读得到 ⇒ 否则 `BOOT-PATCH-READER-NO-FOLD`。
 *   ③ **阴性对照（合成）**：三种**真坏**的行（plain scalar 后面跟更深的 `key:` / 引号标量后面跟缩进行 /
 *      标量后面跟 `- ` 序列项）必须**仍然出声**（`warnings` 非空且点到那一行）⇒
 *      否则 `BOOT-PATCH-READER-FALSE-ACCEPT`（"读取器什么都肯吃"与"读得懂"不许同形）。
 *      这一格是"不许用跳过未知行来支持新语法"的机械保证。
 *
 * 现役文件不在（别的机器 / 干净 clone）⇒ **HOLD `BOOT-PATCH-READER-NO-LIVE-FILE`**，不绿。
 */

/** 顶层 item 的**键**（`insert` / `id:<x>` / `name:<y>`）—— 解析侧用。 */
function topLevelKeyOfItem(item) {
  if (!(item instanceof Map)) return `<${Array.isArray(item) ? 'list' : typeof item}>`
  if (Array.isArray(item.get('insert'))) return 'insert'
  for (const k of ['id', 'name', 'group']) {
    const v = item.get(k)
    if (typeof v === 'string' && v !== '') return `${k}:${v}`
  }
  return `<map keys=${[...item.keys()].join(',')}>`
}

/**
 * 顶层 item 的键 —— **逐行扫原文**的那一把尺子（与解析器无关，用来交叉验"最后一条顶层 item 看得见"）。
 * 只认行首顶格的 `- insert:` / `- id:` / `- name:`，与 `profilePatchPath` 那一族补丁的形状一致。
 * ⚠️ 引号在这里剥掉（解析器给的是**值**，不是原文）—— 两边必须都拿"值"来比，否则会造出假分歧。
 */
export function lastTopLevelKeyByText(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  let last = null
  for (const line of lines) {
    const m = /^- (?:insert:[ \t]*$|id:[ \t]*([^\s#]+)|name:[ \t]*([^\s#]+))/.exec(line)
    if (m === null) continue
    const value = (m[1] ?? m[2] ?? '').replace(/^['"]|['"]$/g, '')
    last = m[1] !== undefined ? `id:${value}` : m[2] !== undefined ? `name:${value}` : 'insert'
  }
  return last
}

/**
 * 一份补丁的**覆盖读数**：解析器吃掉了多少、最后一条顶层 item 是哪一个、两把尺子同不同意。
 * @param {string} file
 */
export function profilePatchCoverage(file) {
  const out = { path: file, exists: existsSync(file), measured_at: new Date().toISOString() }
  if (!out.exists) return { ...out, items: null, unparsed_count: null, warnings: [], last_top_level_key: null, covers: false }
  const text = readFileSync(file, 'utf8')
  const st = statSync(file)
  const doc = parseYamlSubset(text, `coverage:${path.basename(file)}`)
  const items = Array.isArray(doc.value) ? doc.value : []
  const names = items.map(topLevelKeyOfItem)
  const byText = lastTopLevelKeyByText(text)
  const byParser = names.length === 0 ? null : names[names.length - 1]
  out.bytes = st.size
  out.sha256 = sha256(Buffer.from(text, 'utf8'))
  out.mtime = new Date(st.mtimeMs).toISOString()
  out.lines = text.replace(/\r\n/g, '\n').split('\n').length
  out.items = names.length
  out.top_level_keys = names
  out.warnings = doc.warnings
  out.unparsed_count = doc.warnings.length
  out.last_top_level_key = {
    by_text: byText,
    by_parser: byParser,
    agree: byText !== null && byText === byParser,
    why: byText === null ? '原文里找不到顶格 `- id:` / `- insert:` 行' : byText === byParser ? null : '两把尺子给出不同的最后一条顶层 item',
  }
  out.covers = out.unparsed_count === 0 && out.last_top_level_key.agree === true
  return out
}

/**
 * 读取器自证的三组**合成**夹具（只住内存，不写盘）：
 *   · `multiline`          —— 多行 plain scalar（阳性：必须折成一个空格，且后面的行还读得到）
 *   · `multilineInList`    —— 序列项里的多行 plain scalar（同上，另一条代码路径）
 *   · `nestedKeyAfterScalar` / `strayAfterQuote` / `sequenceAfterScalar` —— 三种**真坏**的行（阴性：必须出声）
 * 判据：阳性两条 `warnings` 必须为 0 且值对得上；阴性三条 `warnings` 必须非空且点到第 2 行。
 */
export const READER_FIXTURES = Object.freeze({
  multiline: [
    'top: 1',
    'description: Stronger agentic coding, knowledge, and difficult reasoning; suited',
    '  to complex or quality-critical tasks at higher cost.',
    'after: 2',
    '',
  ].join('\n'),
  multilineInList: [
    'list:',
    '  - first item text',
    '    continued on the next line',
    '  - second',
    '',
  ].join('\n'),
  nestedKeyAfterScalar: ['a: plain value', '  nestedKey: oops', ''].join('\n'),
  strayAfterQuote: ['b: \'quoted\'', '  stray-after-quote', ''].join('\n'),
  sequenceAfterScalar: ['c: plain value', '  - item', ''].join('\n'),
})

/**
 * 读取器自证（纯函数，可复算）：跑那五组合成夹具，返回读数与**不成立的原因**（不 push，调用方决定红）。
 */
export function patchReaderSelfProof() {
  const parse = (key) => {
    const doc = parseYamlSubset(READER_FIXTURES[key], `fixture:${key}`)
    return { warnings: doc.warnings, value: doc.value instanceof Map ? doc.value : doc.value }
  }
  const foldedDescription = 'Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at higher cost.'
  const multiline = parse('multiline')
  const multilineInList = parse('multilineInList')
  const negatives = {
    nestedKeyAfterScalar: parse('nestedKeyAfterScalar').warnings,
    strayAfterQuote: parse('strayAfterQuote').warnings,
    sequenceAfterScalar: parse('sequenceAfterScalar').warnings,
  }
  const listValue = Array.isArray(multilineInList.value) ? null : multilineInList.value?.get?.('list')
  const reading = {
    measured_at: new Date().toISOString(),
    fixtures: READER_FIXTURES,
    multiline: {
      warnings: multiline.warnings,
      description: multiline.value instanceof Map ? multiline.value.get('description') : null,
      after: multiline.value instanceof Map ? multiline.value.get('after') : null,
      expected_description: foldedDescription,
    },
    multiline_in_list: {
      warnings: multilineInList.warnings,
      value: listValue ?? null,
    },
    negatives: Object.fromEntries(Object.entries(negatives).map(([k, w]) => [k, { warnings: w, reported: w.length > 0, names_line_2: w.some((x) => /行 2|line 2/.test(x)) }])),
  }
  const problems = []
  if (reading.multiline.warnings.length !== 0 || reading.multiline.description !== foldedDescription || reading.multiline.after !== 2) {
    problems.push({ code: BOOT_CODES.patchReaderNoFold, message:
      `多行 plain scalar 的合成夹具没读对（warnings=${JSON.stringify(reading.multiline.warnings)} · description=${JSON.stringify(reading.multiline.description)} · after=${JSON.stringify(reading.multiline.after)}）`
      + ` —— 期望折成一个空格（${JSON.stringify(foldedDescription)}）且它后面那一行照旧读得到。读取器要么没折、要么把后面的行吞了：那不是"支持多行"，那是把"读不到"换成"读错"` })
  }
  const listOk = Array.isArray(reading.multiline_in_list.value) && reading.multiline_in_list.value[0] === 'first item text continued on the next line'
    && reading.multiline_in_list.value[1] === 'second' && reading.multiline_in_list.warnings.length === 0
  if (!listOk) {
    problems.push({ code: BOOT_CODES.patchReaderNoFold, message:
      `序列项里的多行 plain scalar 没读对（value=${JSON.stringify(reading.multiline_in_list.value)} · warnings=${JSON.stringify(reading.multiline_in_list.warnings)}）`
      + ` —— 期望 ${JSON.stringify(['first item text continued on the next line', 'second'])}` })
  }
  const silent = Object.entries(reading.negatives).filter(([, v]) => v.reported !== true)
  if (silent.length > 0) {
    problems.push({ code: BOOT_CODES.patchReaderFalseAccept, message:
      `${silent.map(([k]) => k).join(' / ')} 这三组**真坏**的合成夹具里，有 ${silent.length} 组**没有出声**（${JSON.stringify(silent.map(([k, v]) => ({ [k]: v.warnings })))}）`
      + ' —— 读取器把坏行也吃下去了：那"零未解析"就不是"读得懂"，这个判据也就不许绿' })
  }
  return { reading, problems }
}

/**
 * 把"读取器覆盖"收成判词。**BOOT-01 / BOOT-02 都调它**（两条都靠读 profile 补丁下结论）。
 *
 * 两条阳性对照组：
 *   · `effective` = 这一跑**真正**读的那一份（`AGENIA_PROFILE_PATCH` / `DSH_PROFILE_DIR` / homedir 那条链）；
 *   · `live` = **现役**那一份（同一条链，只是不认 `AGENIA_PROFILE_PATCH`）——
 *     用处是：拿一份"折叠过的副本"跑绿，不能替现役文件的那个盲区作证（实现岗的绕行动作正是这个形状）。
 * 现役那一份不在 ⇒ `HOLD BOOT-PATCH-READER-NO-LIVE-FILE`（不绿）。
 *
 * @returns {{where: object, effective: object, live: object, proof: object, problems: object[], holds: object[]}}
 */
export function patchReaderVerdict({ env = process.env } = {}) {
  const where = profilePatchPath(env)
  const liveEnv = { ...env }
  delete liveEnv.AGENIA_PROFILE_PATCH
  const liveWhere = profilePatchPath(liveEnv)
  const effective = profilePatchCoverage(where.path)
  const live = liveWhere.path === where.path ? { ...effective, same_as_effective: true } : { ...profilePatchCoverage(liveWhere.path), same_as_effective: false }
  const proof = patchReaderSelfProof()
  const problems = []
  const holds = []
  const describe = (c) => `${c.path}（${c.bytes ?? '?'} B · sha256 ${String(c.sha256 ?? '?').slice(0, 12)}… · ${c.lines ?? '?'} 行）`
  for (const [label, c] of [['这一跑读的那一份', effective], ['现役那一份', live]]) {
    if (!c.exists) continue
    if (c.unparsed_count !== 0 || c.last_top_level_key.agree !== true) {
      problems.push({
        code: BOOT_CODES.patchReaderBlind,
        message: `${label}（${describe(c)}）**没有被解析器覆盖**：未解析 ${c.unparsed_count} 条`
          + `${c.warnings.length > 0 ? `（${c.warnings.slice(0, 3).join(' / ')}）` : ''}`
          + `；最后一条顶层 item：原文扫 = ${JSON.stringify(c.last_top_level_key.by_text)} 而解析器 = ${JSON.stringify(c.last_top_level_key.by_parser)}`
          + `（${c.last_top_level_key.by_text === null ? '原文里找不到顶格 item' : '两把尺子必须给出同一个键'}）`
          + ' —— 这份补丁里**有读取器看不见的东西** ⇒ 底下所有"那一行不在 / 撤不掉"的判词都不成立（缺 ≠ 坏 ≠ 盲）；'
          + '这是**尺子**的问题（`parseYamlSubset` 的多行 plain scalar），不是挂载形状的问题',
      })
    }
  }
  if (!live.exists) {
    holds.push({
      code: BOOT_CODES.patchReaderNoLiveFile,
      why: `现役 profile 补丁不在（${liveWhere.path}，来源 ${liveWhere.source}）⇒ 读取器对**这一台机器的现役文件**覆盖没被验过`
        + '（别的机器 / 干净 clone 上没有它）—— 这一格记 HOLD（不是绿）；给 `AGENIA_PROFILE_PATCH` 指的副本只能替它自己作证',
    })
  }
  for (const p of proof.problems) problems.push(p)
  return {
    measured_at: new Date().toISOString(),
    where: { effective: where, live: liveWhere },
    effective,
    live,
    proof: proof.reading,
    problems,
    holds,
  }
}

/**
 * **R5 的产物侧（两件产物 × 落点）** —— 撤挂载的定义是"删 `# @host-level` 标记 + 重跑生成器"，
 * 所以判据不是"能不能从文件里删一行"，而是**真值表的两端都成立**：
 *
 *   | 组合里的标记 | 那一行应当住在   | 预设体里的次数 |
 *   | 在           | 顶层 `- insert:` | 0              |
 *   | 不在         | 两份预设体       | 每个宿主行 2 次（组长份 + 组员份）|
 *
 * 盘上今天只有**挂载态**（标记在）。回滚态由**真字节投影**造出来：
 * `withoutHostLevelMarks()` 删掉标记行 + `withHostRowInPresetBodies()` 把那一行从顶层 insert
 * 搬回两份预设体的末尾（其余字节不动）—— 那正是"删标记 + 重跑生成器"会产出的形状。
 * 两端都用**同一个算式**判（`presetEntryProblems()`：标记 + 顶层形状 + 配对 + 每份行集 + 行数闭合），
 * 只要有一端不干净 ⇒ `BOOT-R5-ROLLBACK-CONTRACT-BROKEN`（**不是**"挂载行不在"）。
 *
 * 🔴 **盘上若已经是回滚态**（标记不在 —— 练习正做到一半 / 有人刚撤掉），这一格不红：
 *    它改判那一端（顶层 insert 里 0 条宿主行 + 两份预设体各含那一行），`readings.state = 'rolled-back'`。
 *    两端都合法 —— 这正是"标记 × 落点"真值表存在的意义：一列是产品该在的状态，另一列是撤掉之后该在的状态。
 *
 * ⚠️ 投影是**夹具**，不是"生成器真的跑过"：`DASH-15` 的派生物那一腿（`make-bundle-patch.mjs --check`）
 *    才是"盘上这份补丁是不是生成器的派生物"。这一格只回答"两端形状是否与契约一致"。
 *
 * @param {{compositionText: string|null, patchText: string|null}} input
 * @returns {{problems: {code: string, message: string}[], readings: object}}
 */
export function rollbackRouteReading({ compositionText, patchText }) {
  const problems = []
  const readings = { measured_at: new Date().toISOString() }
  if (typeof compositionText !== 'string' || typeof patchText !== 'string') {
    problems.push({
      code: BOOT_CODES.rollbackArtifactsMissing,
      message: `组合 / bundle 补丁有一份读不到（composition=${typeof compositionText} · patch=${typeof patchText}）`
        + ' —— 回滚契约与身份都无从判：这两份是产品的一部分，缺了是**红**，不是"这一档不适用"',
    })
    return { problems, readings }
  }
  const marks = hostLevelMarks(compositionText)
  const hostIds = marks.ids
  const fmt = (p) => (typeof p === 'string' ? p : `[${p.code}] ${p.message}`)
  const placement = describePlacement(patchText, 'bundle 补丁')
  const inInsertOf = (id) => placement.rows.filter((r) => r.id === id && r.placement === 'insert').length
  const inPresetOf = (id) => placement.rows.filter((r) => r.id === id && r.in_preset_body === true).length
  /**
   * 盘上现在是**哪一端**：标记在 ⇒ 挂载态；标记不在 ⇒ 回滚态（那一行按普通预设行住在两份预设体里）。
   * 两端都是**合法状态**：R5 要的就是"标记 × 落点"这张表的两行都成立。区别在判法：
   *   · 挂载态：判这一行 + 把回滚态**投影**出来判；
   *   · 回滚态：直接判这一端（挂载那一端由别的跑 / 别的用例覆盖；这一格不造"正向投影"）。
   */
  const state = hostIds.length > 0 ? 'mounted' : 'rolled-back'
  readings.state = state
  readings.marks = marks.marks.map((m) => ({ id: m.id, line: m.line, row_exists: m.row_exists }))
  readings.host_level_ids = hostIds
  /**
   * 两端用的是**同一个算式**：`presetEntryProblems()`（它内部已经含 `hostLevelMarks()` +
   * `topLevelInserts()` + 标记↔宿主行配对 + 每份行集 + 行数闭合）。⚠️ 不再单独调
   * `hostLevelPairingProblems()` 再拼一遍 —— 那会让同一粒事实报两次（配对问题出现两行）。
   */
  const entries = presetEntryProblems(compositionText, patchText)
  const nameOfState = state === 'mounted' ? '挂载态（标记在）' : '回滚态（标记不在）'
  readings[state === 'mounted' ? 'mounted' : 'rolled_back'] = {
    problems: entries.problems,
    landing: {
      // `in_insert` 从**行表**数（不是从"应该有"推）；看板那一行按组合里的 id 认得出来时再点名。
      in_insert: placement.rows.filter((r) => r.placement === 'insert' && r.name !== '@deepseek-ai/dsh-agent-preset').length,
      per_id: Object.fromEntries(hostIds.map((id) => [id, { insert: inInsertOf(id), preset_bodies: inPresetOf(id) }])),
    },
    entry_row_counts: entries.readings.patch_preset_row_counts ?? null,
  }
  for (const p of entries.problems) {
    problems.push({
      code: BOOT_CODES.rollbackContractBroken,
      message: `${nameOfState}本身就不合契约：${fmt(p)}`
        + (state === 'mounted'
          ? '（同一个事实也由 `PRS-01` / `STAT-*` 那一族判；这里出现它只说明 R5 的前提不成立）'
          : '（回滚态是"删标记 + 重跑生成器"的产物 ⇒ 它也得合契约，否则撤挂载这条路本身不成立）'),
    })
  }
  if (state === 'rolled-back') {
    // 回滚态：那一行应当住在**两份**预设体里（`presetEntryProblems()` 的行集已按组合判过）；
    // 顶层 insert 里一条宿主行都不许剩（`hostLevelPairingProblems()` 的 `ROW-UNMARKED` 已按同一事实判过）。
    readings.rolled_back.expected_preset_bodies_per_row = 2
    readings.ok = problems.length === 0
    return { problems, readings }
  }
  // ── 挂载态：把回滚态**投影**出来（真字节变换：删标记 + 把那一行搬回两份预设体）──────────
  const stripped = withoutHostLevelMarks(compositionText)
  const projection = withHostRowInPresetBodies({ patchText, hostRowIds: hostIds })
  readings.rollback_projection = {
    moved: projection.moved,
    why: projection.why,
    added_into: projection.added_into,
    before: projection.before === null ? null : { in_insert: projection.before.in_insert, in_preset: projection.before.in_preset },
    after: projection.after === null ? null : { in_insert: projection.after.in_insert, in_preset: projection.after.in_preset },
    marks_after_strip: hostLevelMarks(stripped).marks.length,
    expected_preset_body_hits: hostIds.length * 2,
  }
  if (!projection.moved || projection.after === null) {
    problems.push({
      code: BOOT_CODES.rollbackContractBroken,
      message: `回滚态投影造不出来（${String(projection.why ?? '没有原因')}）—— 那么"删标记之后那一行回到两份预设体里"这一句**没有被量到**`,
    })
    return { problems, readings }
  }
  if (projection.after.in_insert !== 0 || projection.after.in_preset !== hostIds.length * 2) {
    problems.push({
      code: BOOT_CODES.rollbackContractBroken,
      message: `回滚态投影的落点不对：顶层 insert 里 ${projection.after.in_insert} 次（应 0）、`
        + `预设体里 ${projection.after.in_preset} 次（应 ${hostIds.length * 2} = 每个宿主行两份预设各一次）`
        + ' —— "撤掉挂载之后那一行回到预设体"是回滚的定义，落点不对就不是回滚',
    })
  }
  const rolled = presetEntryProblems(stripped, projection.text)
  readings.rollback_projection.problems = rolled.problems
  readings.rollback_projection.entry_row_counts = rolled.readings.patch_preset_row_counts ?? null
  for (const p of rolled.problems) {
    problems.push({
      code: BOOT_CODES.rollbackContractBroken,
      message: `回滚态（删标记 + 那一行搬回预设体）不合契约：${fmt(p)}`
        + ' —— 这一半只有 R5 判；它红了说明"撤挂载"这条路本身不成立',
    })
  }
  readings.ok = problems.length === 0
  return { problems, readings }
}

/**
 * **R5 的身份侧**：撤掉挂载、重启之后新建的会话头仍是 `agentPreset: agenia`。
 *
 * 这一半**必须真的做过一次**才有读数，所以它认一份**练习回执**（JSON）：
 * ```json
 * {
 *   "at": "2026-11-05T12:00:00.000Z",      // 这一次练习的起点（删标记之前）
 *   "marker_removed": true,                 // 组合里的 # @host-level 删掉了
 *   "regenerated": true,                    // 重跑了 .tools/make-bundle-patch.mjs
 *   "row_landing": {"insert": 0, "preset_bodies": 2},   // 产物读数：那一行回到两份预设体
 *   "restart_at": "2026-11-05T12:05:00.000Z",           // 之后那次客户端重启
 *   "new_session": {"created_at": "2026-11-05T12:06:11.000Z", "agentPreset": "agenia"}
 * }
 * ```
 * 路径由 `AGENIA_R5_REMOVAL_EXERCISE` 指过来（与 `AGENIA_BOOT_AT` 同一族的可选 env，不进冻结表）。
 * 没给 ⇒ `HOLD BOOT-R5-REMOVAL-EXERCISE-MISSING`（**不是**绿，也**不是**"挂载行不在"）；
 * 给了但形状 / 时序 / 落点不对 ⇒ `RED BOOT-R5-ROLLBACK-CONTRACT-BROKEN`；
 * 身份值不对 ⇒ `RED BOOT-R5-IDENTITY-COST`（撤挂载折掉了身份 —— 这正是这一格要抓的那件事）。
 *
 * 🔴 纯函数（不读盘）：回执由调用方读进来。这样"该绿 / 该红"两份合成回执能当**尺子自证**喂它。
 *
 * @param {object|null} receipt
 * @param {{expectedPreset?: string}} [options]
 * @returns {{verdict: 'GREEN'|'RED'|'HOLD', code: string|null, why: string, readings: object}}
 */
export function rollbackExerciseVerdict(receipt, { expectedPreset = EXPECTED_PRESET } = {}) {
  if (receipt === null || receipt === undefined) {
    return {
      verdict: 'HOLD',
      code: BOOT_CODES.rollbackExerciseMissing,
      why: '还没有人做过"删标记 → 重跑生成器 → 重启 → 新建会话"这一次练习'
        + '（`AGENIA_R5_REMOVAL_EXERCISE` 没给）—— 撤挂载之后身份会不会掉，今天**没有读数**；'
        + '记 HOLD（**不是**"挂载行不在"，也不是绿）',
      readings: { supplied: false },
    }
  }
  const contract = []
  const identity = []
  const iso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null)
  const land = receipt.row_landing !== null && typeof receipt.row_landing === 'object' ? receipt.row_landing : null
  const session = receipt.new_session !== null && typeof receipt.new_session === 'object' ? receipt.new_session : null
  if (iso(receipt.at) === null) contract.push('回执缺 `at`（练习开始的 ISO 时刻）或它不是合法时间')
  if (receipt.marker_removed !== true) contract.push('回执说组合里的 `# @host-level` **没有**删掉（`marker_removed` 不是 true）')
  if (receipt.regenerated !== true) contract.push('回执说生成器**没有**重跑（`regenerated` 不是 true）')
  if (land === null) contract.push('回执缺 `row_landing`（产物读数：那一行落在哪）')
  else {
    if (land.insert !== 0) contract.push(`回执说顶层 insert 里还有 ${JSON.stringify(land.insert)} 次（撤掉之后应 0）`)
    if (!(typeof land.preset_bodies === 'number' && land.preset_bodies >= 2)) {
      contract.push(`回执说预设体里只有 ${JSON.stringify(land.preset_bodies)} 次（两份预设各一次，应 ≥ 2）`)
    }
  }
  if (iso(receipt.restart_at) === null) contract.push('回执缺 `restart_at`（之后那次客户端重启的 ISO 时刻）或它不是合法时间')
  if (session === null) contract.push('回执缺 `new_session`（重启之后新建的那个会话）')
  else {
    if (iso(session.created_at) === null) contract.push('回执缺 `new_session.created_at` 或它不是合法时间')
    if (typeof session.agentPreset !== 'string' || session.agentPreset === '') contract.push('回执缺 `new_session.agentPreset`')
  }
  const at = iso(receipt.at)
  const restartAt = iso(receipt.restart_at)
  const created = session === null ? null : iso(session.created_at)
  if (at !== null && restartAt !== null && restartAt < at) contract.push('回执里 `restart_at` 早于 `at`（重启不可能早于练习开始）')
  if (restartAt !== null && created !== null && created < restartAt) {
    contract.push('回执选的那个会话**不是重启之后新建的**（`created_at` 早于 `restart_at`）—— 续跑回来的老会话不算这一类读数')
  }
  if (contract.length === 0 && session.agentPreset !== expectedPreset) {
    identity.push(`撤掉挂载 + 重启之后新建的会话头是 ${JSON.stringify(session.agentPreset)}，不是 ${JSON.stringify(expectedPreset)}`
      + ' —— 撤挂载把预设身份带塌了（回滚不许折掉身份）')
  }
  const readings = {
    supplied: true,
    at: receipt.at ?? null,
    restart_at: receipt.restart_at ?? null,
    new_session: session === null ? null : { created_at: session.created_at ?? null, agentPreset: session.agentPreset ?? null },
    row_landing: land,
    contract_problems: contract,
  }
  if (contract.length > 0) {
    return { verdict: 'RED', code: BOOT_CODES.rollbackContractBroken, why: contract.join('；'), readings }
  }
  if (identity.length > 0) {
    return { verdict: 'RED', code: BOOT_CODES.rollbackIdentityCost, why: identity.join('；'), readings }
  }
  return {
    verdict: 'GREEN',
    code: null,
    why: `撤挂载之后重启、新建的会话头 = ${JSON.stringify(session.agentPreset)}（${session.created_at}），`
      + '且产物那一侧那一行回到了两份预设体里 —— 撤挂载没有折掉身份',
    readings,
  }
}

/**
 * 读 `AGENIA_R5_REMOVAL_EXERCISE` 指的那份回执（**只读**）。
 *   · env 没给 ⇒ `{receipt: null, supplied: false}`（调用方记 HOLD）；
 *   · env 给了但文件不在 / 不是 JSON ⇒ `{receipt: null, supplied: true, error}`（调用方记红：
 *     给了路径却读不出来，是回执坏了，不是"练习没做"）。
 *
 * @param {object} [env]
 */
export function readRollbackExercise({ env = process.env } = {}) {
  const raw = typeof env.AGENIA_R5_REMOVAL_EXERCISE === 'string' ? env.AGENIA_R5_REMOVAL_EXERCISE.trim() : ''
  if (raw === '') return { supplied: false, path: null, receipt: null, error: null }
  const file = path.resolve(raw)
  if (!existsSync(file)) return { supplied: true, path: file, receipt: null, error: `回执文件不在：${file}` }
  try {
    return { supplied: true, path: file, receipt: JSON.parse(readFileSync(file, 'utf8')), error: null }
  } catch (err) {
    return { supplied: true, path: file, receipt: null, error: `回执不是合法 JSON：${String(err?.message ?? err)}` }
  }
}

/**
 * 🔴 **`profilePatchReading()` 已退役**（2026-11-05 深夜，随 R5 重定义）。
 *
 * 它读到的是**客户端自己那份** profile 补丁（`$DSH_PROFILE_DIR/cordis.patch.yml`）。
 * 挂载搬回我们自己的 bundle 补丁之后，那条路线降级为**备用**（`.tools/mount-dashboard-profile.mjs`
 * 自己的 `--check/--apply/--revert` 是它的检查器），R5 不再从它里面找那一行。
 * `BOOT-02` 的挂载前置读数早一步换成了 `client-ui-placement.mjs::bundleMountReading()`（bundle 补丁）。
 * ⇒ 这个函数没有读者了；留着它 = 一份"按设计永远找不到行"的读数。
 * （`profilePatchPath()` / `patchReaderVerdict()` 仍在：前者给 `DASH-06` 的夹具指路，
 * 后者是"读取器看得见整份补丁"的自证，与 R5 无关。）
 */

/**
 * 🔴 **`oneStepRemoval()` 已退役**（2026-11-05 深夜，随 R5 重定义）。
 *
 * 它判的是"那一行能不能从**一个文件**里整块删掉"（找顶层 `- insert:` 里提到看板包的 item，
 * 删掉那一行、再确认全文没有第二处引用）。挂载搬回 bundle 层之后，"撤掉挂载"这个动作
 * **不是文件编辑**，而是"改组合（删标记）+ 重跑生成器"——一条命令序列、一次提交可回滚。
 * ⇒ 那个函数量的动作在产品里不存在了；R5 的产物侧换成 `rollbackRouteReading()`
 *   （两件产物 × 落点的真值表），身份侧换成 `rollbackExerciseVerdict()`（练习回执）。
 * 名字 `BOOT-ROLLBACK-NOT-REMOVABLE` 同批退役（墓碑见 `BOOT_CODES`）。
 */

// ── ④ 包（R3 两腿的输入）─────────────────────────────────────────────────────
/** 看板包自己声明了什么（`name` / `exports["./client"]` / `dsh.client.platform`）。 */
export function packageReading(pkgDir = DASHBOARD_PKG_DIR()) {
  const manifestFile = path.join(pkgDir, 'package.json')
  const out = { dir: pkgDir, manifest: manifestFile, exists: existsSync(manifestFile), problems: [] }
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
  const clientRel = typeof pkg?.exports?.['./client'] === 'string'
    ? pkg.exports['./client']
    : pkg?.exports?.['./client']?.default ?? null
  const clientPath = clientRel === null ? null : path.resolve(pkgDir, clientRel)
  out.name = typeof pkg.name === 'string' ? pkg.name : null
  out.version = pkg.version ?? null
  out.exports_client = clientRel
  out.client_path = clientPath
  out.client_exists = clientPath !== null && existsSync(clientPath)
  out.client_bytes = out.client_exists ? statSync(clientPath).size : null
  out.client_sha256 = out.client_exists ? sha256(readFileSync(clientPath)) : null
  out.platform = pkg?.dsh?.client?.platform ?? null
  out.manifest_bytes = statSync(manifestFile).size
  out.manifest_sha256 = sha256(readFileSync(manifestFile))
  if (out.name === null) out.problems.push('package.json 没有 name（宿主按**包名**建表 ⇒ 没有 name 就没有 URL）')
  if (out.platform !== 'web') out.problems.push(`\`dsh.client.platform\` 是 ${JSON.stringify(out.platform)}，不是 "web"（浏览器不会收它）`)
  if (!out.client_exists) out.problems.push(`client 入口不在盘上：${clientPath}`)
  return out
}

/** 平台那把尺子：`rev = sha1('plugin-artifact'\\0 …)[0..12]`，输入 `[mtimeMs, ctimeMs, size]`。 */
export function artifactRevision(clientPath) {
  const st = statSync(clientPath)
  const parts = [String(st.mtimeMs), String(st.ctimeMs), String(st.size)]
  const h = createHash('sha1').update('plugin-artifact').update('\0')
  for (const part of parts) h.update(`${String(Buffer.byteLength(part))}:`).update(part)
  return {
    rev: h.digest('hex').slice(0, 12),
    inputs: { mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, size: st.size },
    mtime: new Date(st.mtimeMs).toISOString(),
  }
}

// ── ⑤ HTTP（宿主侧）──────────────────────────────────────────────────────────
export function httpGet(url, { timeoutMs = 8000, method = 'GET' } = {}) {
  return new Promise((resolve) => {
    let target = null
    try {
      target = new URL(url)
    } catch (err) {
      resolve({ ok: false, url, error: `URL 不合法：${String(err?.message ?? err)}`, status: null })
      return
    }
    const req = http.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      // 路径按原文递（包名里带 `/` 和 `@`，编码过就不是宿主认识的那个 URL 了）
      path: `${target.pathname}${target.search}`,
      method,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = []
      let bytes = 0
      res.on('data', (c) => {
        bytes += c.length
        if (bytes <= 4 * 1024 * 1024) chunks.push(c)
      })
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        resolve({
          ok: true,
          url,
          status: res.statusCode,
          headers: res.headers,
          body_bytes: bytes,
          body_truncated: bytes > body.length,
          body_text: body.toString('utf8'),
          body_sha256: sha256(body),
        })
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error(`超时 ${timeoutMs}ms`))
    })
    req.on('error', (err) => resolve({ ok: false, url, status: null, error: String(err?.message ?? err) }))
    req.end()
  })
}

/** 宿主地址：`DSH_WEB_URL`（宿主自己发布的那一个）；没有 ⇒ 没有可信来源。 */
export function hostUrlReading(env = process.env) {
  const url = env.DSH_WEB_URL ?? null
  return { url, source: url === null ? null : 'DSH_WEB_URL', env_keys: Object.keys(env).filter((k) => /DSH_.*URL|AGENIA.*URL/.test(k)) }
}

/**
 * **读数 A**：boot 载荷里有没有这个包名。
 * 页面是 token 门禁的（`/` 会 401）—— 401 是"读不到"，**不是"不在"**。
 */
export async function bootPayloadReading({ baseUrl, pkgName, timeoutMs = 8000 }) {
  const attempts = []
  for (const p of ['/', '/index.html']) {
    const r = await httpGet(`${baseUrl}${p}`, { timeoutMs })
    const record = { path: p, status: r.status, ok: r.ok, error: r.error ?? null, body_bytes: r.body_bytes ?? null, body_head: (r.body_text ?? '').slice(0, 160) }
    if (r.ok && r.status === 200) {
      const m = /__DSH_BOOT__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/.exec(r.body_text) ?? /__DSH_BOOT__\s*=\s*(\{[\s\S]*\})/.exec(r.body_text)
      let graph = null
      let parse_error = null
      if (m !== null) {
        try {
          graph = JSON.parse(m[1])
        } catch (err) {
          parse_error = String(err?.message ?? err).slice(0, 200)
        }
      }
      const ids = []
      for (const batch of graph?.batches ?? []) for (const entry of batch.entries ?? []) ids.push(entry.id ?? entry)
      const flat = JSON.stringify(graph ?? null)
      record.graph_found = graph !== null
      record.graph_parse_error = parse_error
      record.entry_count = ids.length
      record.entries_sample = ids.slice(0, 12)
      record.contains_package = flat.includes(JSON.stringify(pkgName)) || ids.includes(pkgName)
      return { ok: true, readable: graph !== null, attempts: [...attempts, record], graph_found: graph !== null, contains_package: record.contains_package, entry_count: ids.length, entries_sample: record.entries_sample, parse_error }
    }
    attempts.push(record)
    if (r.ok && r.status === 401) {
      return { ok: true, readable: false, gated: true, attempts, note: '页面要 token（401）：这一条**读不到**，不是"不在"' }
    }
  }
  return { ok: true, readable: false, gated: false, attempts, note: '页面两条路都不是 200/401 —— 判不了' }
}

/**
 * **读数 B**：宿主按插件路径能不能取到这份 `client.js`。
 * 三态：`200`（证据）/ `404`（判不了：同时是"没挂上"和"URL/rev 不对"）/ 连不上。
 * 三个对照同批落盘：**未知包名**（404 ⇒ 路由在、这一格不是门禁）、**错 rev**（404 ⇒ rev 被校验）、
 * **根页面**（401 ⇒ 门禁在，而 `/plugins` 不归它管）。
 */
export async function pluginChunkReading({ baseUrl, pkgName, clientPath, bootAt = null, timeoutMs = 8000 }) {
  const rev = artifactRevision(clientPath)
  const ourUrl = `${baseUrl}/plugins/${pkgName}/client.js?rev=${rev.rev}`
  const controls = {
    unknownPackage: await httpGet(`${baseUrl}/plugins/@agenia/definitely-not-loaded-${Date.now()}/client.js?rev=${rev.rev}`, { timeoutMs }),
    wrongRev: await httpGet(`${baseUrl}/plugins/${pkgName}/client.js?rev=000000000000`, { timeoutMs }),
    root: await httpGet(`${baseUrl}/`, { timeoutMs }),
    ticketShape: await httpGet(`${baseUrl}/plugins/agenia-dashboard/client.js`, { timeoutMs }),
  }
  const ours = await httpGet(ourUrl, { timeoutMs })
  // `405` 在这台宿主上**不区分路由**（连不存在的路径也回 405）—— 它不能当"路由在"的证据，
  // 但"它不区分"这件事本身必须落进读数（不然下一个人会以为 405 = 路由在）。
  const methodProbe = {
    post_plugins: (await httpGet(`${baseUrl}/plugins/whatever/client.js`, { timeoutMs, method: 'POST' })).status,
    post_non_route: (await httpGet(`${baseUrl}/definitely-not-a-route-boot02`, { timeoutMs, method: 'POST' })).status,
    note: '两边同码 ⇒ 405 不是"路由在"的证据（这台宿主对所有 POST 都回它）',
  }
  methodProbe.discriminates = methodProbe.post_plugins !== methodProbe.post_non_route
  const fileBytes = readFileSync(clientPath)
  const body = ours.ok && ours.status === 200 ? Buffer.from(ours.body_text, 'utf8') : null
  const bytesMatch = body === null ? null : body.subarray(0, fileBytes.length).equals(fileBytes)
  const stale = bootAt !== null && rev.inputs && Date.parse(rev.mtime) > bootAt
  return {
    measured_at: new Date().toISOString(),
    url: ourUrl,
    rev,
    stale_after_boot: stale,
    our: { status: ours.status, ok: ours.ok, error: ours.error ?? null, body_bytes: ours.body_bytes ?? null, body_sha256: ours.body_sha256 ?? null, body_head: ours.ok ? ours.body_text.slice(0, 120) : null, bytes_match_disk: bytesMatch },
    method_probe: methodProbe,
    controls: Object.fromEntries(Object.entries(controls).map(([k, v]) => [k, { url: v.url, status: v.status, ok: v.ok, error: v.error ?? null, body_bytes: v.body_bytes ?? null, body_head: (v.body_text ?? '').slice(0, 120) }])),
  }
}
