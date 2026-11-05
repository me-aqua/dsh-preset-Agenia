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
 *      "这个探测器会翻面"，**不是**"重启之后预设没注册"。两者别混：判据只看 `createdAt >= T`。
 *   ① **身份**：`T` = 这一次客户端启动的时刻（`AGENIA_BOOT_AT` 或宿主进程启动时刻）；
 *      取该工作区里**创建**于 `T` 之后、**顶层**（`delegationDepth === 0` 且不是委派会话）的
 *      最新一份会话，判它的 `agentPreset`：
 *        · 没有这样的会话 ⇒ `HOLD BOOT-NO-SESSION-AFTER-RESTART`（**永远不是绿**）；
 *        · `agentPreset === 'agenia'` ⇒ 这一格成立；
 *        · `'standard'` ⇒ `RED BOOT-PRESET-NOT-REGISTERED`（= 事故形态：无角色 ⇒ 窄权限）；
 *        · 别的值 ⇒ `RED BOOT-PRESET-UNEXPECTED`。
 *      同批落一份**反向读数**：同一个 `T` 下**不过滤**顶层会把谁选中（今天 = 委派出去的组员会话，
 *      `agenia-member`）—— 证明那个过滤器是承重的，不是装饰。
 *   ② **回滚（R5）**：**撤挂载 = 删 `# @host-level` 标记 + 重跑生成器**（2026-11-05 深夜组长裁定：
 *      "重定义，不退役"）。判两半，各自一个落点：
 *      · **产物 × 落点**（`rollbackRouteReading()`）：标记**在** ⇒ 那一行只住顶层 `- insert:`
 *        （预设体 0 次）；标记**不在** ⇒ 那一行回到**两份**预设体（顶层 insert 0 次）。
 *        盘上只有挂载态，回滚态由真字节投影造；任一端不合契约 ⇒
 *        `RED BOOT-R5-ROLLBACK-CONTRACT-BROKEN`（**不是**"挂载行不在"）。
 *      · **身份**（`rollbackExerciseVerdict()`）：撤掉挂载、重启之后**新建**的会话头仍须是
 *        `agentPreset: agenia` —— 撤挂载不许折掉身份。要求真的做过一次练习
 *        （`AGENIA_R5_REMOVAL_EXERCISE` 回执）；没做 ⇒ `HOLD BOOT-R5-REMOVAL-EXERCISE-MISSING`；
 *        回执说身份掉了 ⇒ `RED BOOT-R5-IDENTITY-COST`。
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
import { existsSync, readFileSync } from 'node:fs'
import { caseDir, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { bundleMountReading } from '../support/client-ui-placement.mjs'
import {
  BOOT_CODES,
  EXPECTED_PRESET,
  bootPayloadReading,
  findWorkspaceKey,
  hostBootReading,
  hostUrlReading,
  identityOf,
  listSessions,
  packageReading,
  patchReaderVerdict,
  pluginChunkReading,
  presetVerdict,
  profilePatchCoverage,
  readRollbackExercise,
  rollbackExerciseVerdict,
  rollbackRouteReading,
  readSessionHeader,
  scanHeaders,
  selectNewestAfter,
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
    if (best === null || (got.identity.createdAt ?? 0) > (best.identity.createdAt ?? 0)) best = got
  }
  return best === null ? null : { source: 'scan', ...best }
}

test('BOOT-01 启动后读数 A（身份）：重启之后新建的会话头 agentPreset 必须是 agenia，standard ⇒ 塌了；R5 撤挂载 = 删标记 + 重跑生成器', async () => {
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
      rec.readings.controls.negative_is_resumed = negative.identity.createdAt !== null && negative.identity.createdAt < T
      rec.readings.controls.negative_created_before_restart_ms = negative.identity.createdAt === null ? null : T - negative.identity.createdAt
    }

    // ── ① 身份：T 之后**新建**的顶层会话 ───────────────────────────────────────
    // 只看"文件 mtime ≥ T"的那一小把（创建于 T 之后的会话，文件 mtime 必然也 ≥ T）——
    // 这样不必扫整棵树；上限自报。
    const pool = sessions.filter((s) => s.mtimeMs >= T)
    const scan = scanHeaders(pool, { tmpDir, limit: 20 })
    const identities = scan.identities
    const pick = selectNewestAfter(identities, { T, mode: 'top-level' })
    const naive = selectNewestAfter(identities, { T, mode: 'all' })
    rec.readings.identity = {
      measured_at: new Date().toISOString(),
      T,
      T_iso: new Date(T).toISOString(),
      T_source: boot.source,
      pool: { sessions_with_mtime_ge_T: pool.length, scanned: scan.scanned, capped: scan.capped, limit: scan.limit, failures: scan.failures },
      created_after_T: identities.filter((x) => x.createdAt >= T).map((x) => ({ id: x.id, createdAt_iso: x.createdAt_iso, agentPreset: x.agentPreset, is_top_level: x.is_top_level, file_sha256: x.file_sha256, first_frame_sha256: x.first_frame_sha256 })),
      resumed_touched_after_T: pick.resumed_touched_after_T,
      resumed_count: pick.resumed_count,
      selected: pick.newest === null ? null : whereOf(pick.newest),
      selected_detail: pick.newest,
      naive_selection: naive.newest === null ? null : { id: naive.newest.id, agentPreset: naive.newest.agentPreset, is_top_level: naive.newest.is_top_level, why: '不过滤顶层 ⇒ 会选中委派出去的组员会话' },
      filter_is_load_bearing: naive.newest?.agentPreset !== pick.newest?.agentPreset,
    }
    // **选择器自证**：同一条选择规则，换一个 `T` 就应该换一个判词 —— 否则"现在 HOLD"读起来像"它只会 HOLD"。
    // `T` 取阳性对照（16:15 那份新建会话）之前 1 秒；pool 只含**这一跑已经读过**的那几份（不是全树，标签写清）。
    if (positive !== null) {
      const probeT = positive.identity.createdAt - 1000
      const probePool = [positive.identity, negative?.identity, ...identities].filter((x) => x !== null && x !== undefined)
      const probe = selectNewestAfter(probePool, { T: probeT, mode: 'top-level' })
      const probeVerdict = presetVerdict(probe.newest)
      rec.readings.identity.selection_flip_probe = {
        T: probeT,
        T_iso: new Date(probeT).toISOString(),
        pool_ids: probePool.map((x) => x.id),
        pool_note: '只含这一跑已经读过的那几份（阳性 / 阴性 / T 之后那几份）—— 不是全树',
        picked: probe.newest === null ? null : { id: probe.newest.id, createdAt_iso: probe.newest.createdAt_iso, agentPreset: probe.newest.agentPreset },
        verdict: probeVerdict.verdict,
        code: probeVerdict.code ?? null,
      }
      if (probeVerdict.verdict !== 'GREEN') {
        rec.problems.push(problem(BOOT_CODES.selectorDead, `选择器换一个 T 也给不出 GREEN：T=${new Date(probeT).toISOString()} 时选中 ${JSON.stringify(probe.newest?.id ?? null)}（${JSON.stringify(probe.newest?.agentPreset ?? null)}），判成 ${probeVerdict.verdict} —— 那"现在 HOLD"就不是"没有新会话"，是选择器坏了`))
      }
    }
    const v = presetVerdict(pick.newest)
    rec.readings.identity.verdict = v
    if (pick.newest === null) {
      caseHold(rec, BOOT_CODES.noSessionAfterRestart,
        `工作区 ${key.key} 里**没有**创建于 ${new Date(T).toISOString()}（${boot.source}）之后的顶层会话 —— 最近被写过的是 ${pick.resumed_count} 份**续跑回来的老会话**`
          + `${pick.resumed_touched_after_T.length === 0 ? '' : `（例如 ${JSON.stringify(pick.resumed_touched_after_T.slice(0, 2))}）`}：它们的头写于**启动之前**，不是这一次启动的读数。`
          + ' ⇒ 请老板在客户端里**新建一个会话**，再跑这一条；在那之前这一格是 HOLD（**不是绿**）')
    } else if (v.verdict === 'RED') {
      rec.problems.push(problem(v.code, `${v.why}（${whereOf(pick.newest)}；T = ${new Date(T).toISOString()}，来源 ${boot.source}）`))
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
        restart_at: '2026-11-05T12:05:00.000Z',
        new_session: { created_at: '2026-11-05T12:06:11.000Z', agentPreset: EXPECTED_PRESET },
      },
      identityLost: {
        at: '2026-11-05T12:00:00.000Z',
        marker_removed: true,
        regenerated: true,
        row_landing: { insert: 0, preset_bodies: 2 },
        restart_at: '2026-11-05T12:05:00.000Z',
        new_session: { created_at: '2026-11-05T12:06:11.000Z', agentPreset: 'standard' },
      },
      contractBroken: {
        at: '2026-11-05T12:00:00.000Z',
        marker_removed: false,
        regenerated: true,
        row_landing: { insert: 1, preset_bodies: 0 },
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

    // 身份那一半：今天有没有"练习回执"。
    const exercise = readRollbackExercise()
    const exerciseVerdict = exercise.supplied && exercise.receipt === null
      ? {
        verdict: 'RED',
        code: BOOT_CODES.rollbackContractBroken,
        why: `给了 \`AGENIA_R5_REMOVAL_EXERCISE\` 却读不出回执（${exercise.path}）：${exercise.error} —— 回执坏了，不是"练习没做"`,
        readings: { supplied: true, path: exercise.path },
      }
      : rollbackExerciseVerdict(exercise.receipt)
    const r2 = pick.newest === null ? 'HOLD' : v.verdict
    rec.readings.rollback_exercise = {
      path: exercise.path,
      supplied: exercise.supplied,
      read_error: exercise.error,
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
