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
 *   ② **回滚（R5）**：两个 artifacts 的**条件式**，不是故事 ——
 *      `profile 补丁里那一行` × `BOOT-01① 的判词`：
 *        · 行**不在** 且 ①判 `RED` ⇒ `RED BOOT-ROLLBACK-DID-NOT-RESTORE`（撤了还没恢复 = 真坏）；
 *        · 行**在**   且 ①判 `RED` ⇒ `RED BOOT-MOUNT-BROKE-IDENTITY`（挂上把身份带塌了）；
 *        · 行不在 ⇒ `HOLD BOOT-ROLLBACK-NO-MOUNT-ROW`（这一格现在没得撤，"能不能一步撤"也无从量）；
 *        · 行在 ⇒ 必须能**一步撤掉**（`oneStepRemoval()`：顶层 `- insert:` 一个 item、整块拿掉后
 *          仍然解析干净、文件里再无第二处引用），撤不掉 ⇒ `RED BOOT-ROLLBACK-NOT-REMOVABLE`。
 *
 * ── `BOOT-02` 判什么（定形 §五：**两条读数都要有，缺一不算挂上**）────────────────
 *   A **boot 载荷**：页面里 `window.__DSH_BOOT__` 的 entry 表有没有这个**包名**
 *     （200 才读得到；401 = token 门禁 = **读不到**，不是"不在"）；
 *   B **插件路由**：`GET /plugins/<包名>/client.js?rev=<rev>` 是否 200 **且**字节与盘上那份对得上。
 *   三态：`200`（证据）/ `404`（**判不了** —— 它同时是"没挂上"和"URL/rev 不对"的形状）/ 连不上。
 *   ⇒ GREEN 只在 A、B **都**拿到证据时；任一条读不到 ⇒ `HOLD BOOT-R3-HALF-PROOF`（带两条各自的码）；
 *     只有 A 读到 200 而表里没有这个包 ⇒ `RED BOOT-R3-ENTRY-NOT-IN-BOOT`。
 *   挂载行不在 / 关着 / 住错层 ⇒ `HOLD BOOT-R3-MOUNT-ABSENT` / `…-DISABLED` / `RED …-NOT-TOP-LEVEL-INSERT`。
 *
 * ── 不判什么 ────────────────────────────────────────────────────────────────
 *   · 不判像素（"点开有没有那块面板"归 GUI 清单，人点一次）；
 *   · 不判浏览器真的执行了那份 JS（那是 GUI 那一格）；
 *   · 不替 R1 写 profile 补丁（那是实现岗的活，且只能在客户端关着的时候写）。
 *
 * 🔴 判据打的是**现役** `presets/agenia` 与**客户端自己那份** profile 补丁；每一条读数都带
 *    `{树, head, measured_at, 文件 bytes/sha256/mtime, T 与 T 的来源}`（定形 §五「命名树与时刻」）。
 */
import { before, test } from 'node:test'
import path from 'node:path'
import { caseDir, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  BOOT_CODES,
  EXPECTED_PRESET,
  bootPayloadReading,
  findWorkspaceKey,
  hostBootReading,
  hostUrlReading,
  identityOf,
  listSessions,
  oneStepRemoval,
  packageReading,
  pluginChunkReading,
  presetVerdict,
  profilePatchReading,
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

/** 补丁读数**落盘时别把整份正文塞进去**（只有 `oneStepRemoval` 需要正文）。 */
function patchSummary(patch) {
  const { text, ...rest } = patch
  return { ...rest, text_chars: text === null ? null : text.length }
}

/** 一条失败/挂起报文里要带得走的身份（id / 时刻 / preset / 字节 / sha）。 */
const whereOf = (x) =>
  `${x.id ?? x.dir}（建于 ${x.createdAt_iso ?? '?'} · preset=${JSON.stringify(x.agentPreset)} · `
  + `${x.file_bytes ?? '?'} B · sha256 ${String(x.file_sha256 ?? '?').slice(0, 12)}… · 首帧 sha256 ${String(x.first_frame_sha256 ?? '?').slice(0, 12)}…）`

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

test('BOOT-01 启动后读数 A（身份）：重启之后新建的会话头 agentPreset 必须是 agenia，standard ⇒ 塌了；R5 回滚条件式同批', async () => {
  await runCase('BOOT-01', async (rec) => {
    const tmpDir = path.join(caseDir('BOOT-01'), 'tmp')
    const tree = treeIdentity()
    const store = sessionRootReading()
    const boot = hostBootReading()
    const patch = profilePatchReading()
    rec.readings.tree = tree
    rec.readings.session_root = store
    rec.readings.restart = { ok: boot.ok, at: boot.at, at_iso: boot.at_iso, source: boot.source, host: boot.host ?? null, chain: boot.chain, why: boot.why ?? null, measured_at: new Date().toISOString() }
    rec.readings.profile_patch = patchSummary(patch)
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

    // ── ② R5 回滚：两个 artifacts 的条件式 ────────────────────────────────────
    // 先给**"一步撤掉"这把尺子**做自证：盘上现在没有那一行（R1 还没落地），所以只能拿
    // **三种合成形状**量它 —— 三种都是"R1 落地之后可能长成的样子"，不是编出来的现实：
    //   ① 正确形状（顶层 insert 里只有看板这一行）⇒ 删得掉，`whole-insert-item`；
    //   ② 同一块里还有一行官方插件 ⇒ 删得掉，`row-inside-insert`，**别人那行不许跟着没**；
    //   ③ 住错层（顶层 override，不是 insert）⇒ 删不掉，且要说出"不是顶层 `- insert:`"。
    // ⚠️ 形状**照抄官方 profile 补丁**（`@deepseek-ai/dsh-experimental-agent-team-profile/cordis.patch.yml`：
    //    子项 4 空格缩进、每行 `name` + `config`）；看板这一行按定形 §五 的要求**不带 `id`**。
    const REMOVAL_FIXTURES = {
      good: [
        '- id: ui-chat',
        '  name: "@deepseek-ai/dsh-client-ui-chat"',
        '  config:',
        '    transcriptView: detailed',
        '- insert:',
        '    - name: file:///E:/Harness/presets/agenia/client-ui-dashboard/lib/index.js',
        '      config:',
        '        root: E:/Harness',
        '',
      ].join('\n'),
      withSibling: [
        '- insert:',
        '    - name: file:///E:/Harness/presets/agenia/client-ui-dashboard/lib/index.js',
        '      config:',
        '        root: E:/Harness',
        '    - id: ui-agent-team',
        '      name: "@deepseek-ai/dsh-experimental-client-ui-agent-team"',
        '',
      ].join('\n'),
      wrongPlacement: [
        '- id: agenia-dashboard',
        '  name: file:///E:/Harness/presets/agenia/client-ui-dashboard/lib/index.js',
        '  config:',
        '    root: E:/Harness',
        '',
      ].join('\n'),
    }
    const removalGood = oneStepRemoval({ text: REMOVAL_FIXTURES.good, path: '<fixture:good>' })
    const removalSibling = oneStepRemoval({ text: REMOVAL_FIXTURES.withSibling, path: '<fixture:withSibling>' })
    const removalWrong = oneStepRemoval({ text: REMOVAL_FIXTURES.wrongPlacement, path: '<fixture:wrongPlacement>' })
    rec.readings.removal_ruler = {
      measured_at: new Date().toISOString(),
      good: { ok: removalGood.ok, kind: removalGood.readings?.removal_kind ?? null, problems: removalGood.problems },
      with_sibling: { ok: removalSibling.ok, kind: removalSibling.readings?.removal_kind ?? null, problems: removalSibling.problems },
      wrong_placement: { ok: removalWrong.ok, problems: removalWrong.problems },
    }
    if (!removalGood.ok || removalGood.readings?.removal_kind !== 'whole-insert-item') {
      rec.problems.push(problem(BOOT_CODES.rollbackRulerDead, `"一步撤掉"这把尺子对**正确形状**不成立：${removalGood.problems.join('；') || `kind=${removalGood.readings?.removal_kind}`}`))
    }
    if (!removalSibling.ok || removalSibling.readings?.removal_kind !== 'row-inside-insert') {
      rec.problems.push(problem(BOOT_CODES.rollbackRulerDead, `同一块 insert 里还有别的行时，尺子没能做到"只删那一行"：${removalSibling.problems.join('；') || `kind=${removalSibling.readings?.removal_kind}`}`))
    }
    if (removalWrong.ok || !removalWrong.problems.some((p) => p.includes('不是顶层 `- insert:`'))) {
      rec.problems.push(problem(BOOT_CODES.rollbackRulerDead, `住错层（顶层 override）的形状**没有**被尺子拒掉（problems=${JSON.stringify(removalWrong.problems)}）—— 那它认不出"住错层"`))
    }
    const removal = patch.mount.present ? oneStepRemoval(patch) : null
    const r2 = pick.newest === null ? 'HOLD' : v.verdict
    const rollback = {
      measured_at: new Date().toISOString(),
      mount: patch.mount,
      r2_verdict: r2,
      one_step_removal: removal === null ? null : { ok: removal.ok, problems: removal.problems, readings: removal.readings },
      invariant: null,
    }
    if (!patch.exists) {
      caseHold(rec, BOOT_CODES.noProfilePatch, `客户端那份 profile 补丁不在（${patch.path}，来源 ${patch.source}）⇒ 挂载行与回滚都无从量 —— HOLD（不是绿）`)
      rollback.invariant = 'profile patch missing'
    } else if (!patch.mount.present) {
      caseHold(rec, BOOT_CODES.rollbackNoMountRow, `profile 补丁里没有指向这个包的行（按包名找的；${patch.path} · ${patch.bytes} B · sha256 ${String(patch.sha256).slice(0, 12)}…）⇒ "能不能一步撤掉"现在没有对象 —— HOLD；`
        + '这一格要等 R1 把那一行挂上之后才量得到')
      if (r2 === 'RED') {
        rec.problems.push(problem(BOOT_CODES.rollbackDidNotRestore, `那一行**不在**（${patch.path}），可身份读数还是 RED：${whereOf(pick.newest)} —— 撤掉挂载并没有把预设注册恢复回来`))
      }
      rollback.invariant = `row absent & R2=${r2} ⇒ ${r2 === 'RED' ? 'RED' : 'holds'}`
    } else {
      if (removal !== null && !removal.ok) {
        rec.problems.push(problem(BOOT_CODES.rollbackNotRemovable, `那一行挂在 ${patch.path} 里，但**撤不掉一步**：${removal.problems.join('；')}`))
      }
      if (r2 === 'RED') {
        rec.problems.push(problem(BOOT_CODES.mountBrokeIdentity, `那一行**在**（${patch.mount.placement}${patch.mount.disabled ? ' · disabled' : ''}），而身份读数是 RED：${whereOf(pick.newest)} —— 挂上把身份带塌了`))
      }
      rollback.invariant = `row present (${patch.mount.placement}${patch.mount.disabled ? ', disabled' : ''}) & R2=${r2} ⇒ ${r2 === 'RED' ? 'RED' : 'holds'}`
    }
    rec.readings.rollback = rollback
  })
})

test('BOOT-02 启动后读数 B（包可达）：宿主 boot 载荷登记这个包 + /plugins 路由取得到 client.js，缺一不算挂上', async () => {
  await runCase('BOOT-02', async (rec) => {
    const tree = treeIdentity()
    const pkg = packageReading(DASHBOARD_PKG_DIR())
    const patch = profilePatchReading()
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
    rec.readings.profile_patch = patchSummary(patch)
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
      caseHold(rec, BOOT_CODES.r3NoProfilePatch, `客户端那份 profile 补丁不在（${patch.path}）⇒ 挂载行不存在，两条读数没有对象 —— HOLD`)
      return
    }
    if (!patch.mount.present) {
      caseHold(rec, BOOT_CODES.r3MountAbsent,
        `profile 补丁（${patch.path} · ${patch.bytes} B · sha256 ${String(patch.sha256).slice(0, 12)}…）里没有指向 ${pkg.name} 的行 `
          + `⇒ R1 还没落地，两条读数都**不许**当绿：A=${aState.state}${aState.code ? `（${aState.code}）` : ''} · B=${bState.state}${bState.code ? `（${bState.code}）` : ''}。`
          + '这一格要等 profile 层那一行挂上之后才量得到')
      return
    }
    if (patch.mount.placement !== 'insert') {
      rec.problems.push(problem(BOOT_CODES.r3MountNotHostLevel,
        `那一行在补丁里，但住在 ${patch.mount.placement}（不是顶层 \`- insert:\` 的直接成员）⇒ 宿主装载层收不到它（${patch.path}）`))
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
