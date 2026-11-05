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
 * 🔴 **会话头是"创建那一刻"的快照** —— 这条口径是本票的关键，也是 §十三 那次误判的判别面：
 *   · `header.createdAt` = 那次会话**被创建**的时刻，不是它最后一次被写的时刻；
 *   · 客户端的 profile 补丁是**热重载层**，重启后**续跑（resume）回来的老会话仍然带着它出生时的
 *     `agentPreset`**（实测：`session-cc5c68d1` 头写于 2026-10-19T03:03:54.661Z，`standard`；
 *     它在 2026-11-01 有过一次 `agent-preset/selected → agenia`，**但那一帧不改头**；
 *     2026-11-05 16:07 它续跑起来，守卫读的还是 `standard` ⇒ 窄权限）。
 *   ⇒ **只有 `createdAt >= T` 的会话才是"这一次启动之后的读数"**；`mtime` 晚但 `createdAt` 早的
 *     会话叫 **resumed**，它进 `readings.resumed_touched_after_T`，**不当证据**。
 *     没有 `createdAt >= T` 的会话 ⇒ `HOLD BOOT-NO-SESSION-AFTER-RESTART`（**永远不是绿**）。
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
 * ── ③ 挂载行与回滚（R5）──────────────────────────────────────────────────────
 * `profilePatchReading()` 读的是**客户端自己那份**补丁（`$DSH_PROFILE_DIR/cordis.patch.yml`，
 * 今天是 `C:\Users\DAVID\.dsh\profiles\desktop\cordis.patch.yml`）—— R1 要写的就是它。
 * `oneStepRemoval()` 判"那一行能不能**一步**撤掉"：它必须是顶层列表里的**一个** item，
 * 整块拿掉之后剩下的文本仍然解析得干净、且再没有别处引用这个包。
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
import { parseYamlSubset } from './composition.mjs'
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
  // 回滚（R5）
  rollbackNoMountRow: 'BOOT-ROLLBACK-NO-MOUNT-ROW',
  rollbackNotRemovable: 'BOOT-ROLLBACK-NOT-REMOVABLE',
  rollbackRulerDead: 'BOOT-ROLLBACK-RULER-DEAD',
  rollbackDidNotRestore: 'BOOT-ROLLBACK-DID-NOT-RESTORE',
  mountBrokeIdentity: 'BOOT-MOUNT-BROKE-IDENTITY',
  noProfilePatch: 'BOOT-PROFILE-PATCH-MISSING',
  // 可达（R3）
  r3NoHostUrl: 'BOOT-R3-NO-HOST-URL',
  r3NoHost: 'BOOT-R3-NO-HOST',
  r3NoProfilePatch: 'BOOT-R3-PROFILE-PATCH-MISSING',
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
}

/** 期望的预设名（定形 R2）。 */
export const EXPECTED_PRESET = 'agenia'
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
  return {
    ok: true,
    ...base,
    first_frame_text: firstLine,
    first_frame_bytes: Buffer.byteLength(firstLine, 'utf8'),
    first_frame_sha256: sha256(firstLine),
    first_frame_head: firstLine.slice(0, 220),
    agent_preset_literal: field === null ? null : { index: field.index, match: field[0], value_text: field[1] },
    header,
    cross_check: cross,
    tool: toolReading,
  }
}

/** 头 → 一份可比的会话身份读数（**不猜**：字段不在就写 null）。 */
export function identityOf(reading) {
  const h = reading.header ?? {}
  const depth = typeof h.delegationDepth === 'number' ? h.delegationDepth : null
  const origin = h.origin ?? null
  const parentSession = h.parentSession ?? null
  const isSubagent = (depth !== null && depth > 0) || origin === 'subagent' || parentSession !== null
  return {
    id: h.id ?? null,
    dir: path.basename(path.dirname(reading.file)),
    createdAt: typeof h.createdAt === 'number' ? h.createdAt : null,
    createdAt_iso: typeof h.createdAt === 'number' ? new Date(h.createdAt).toISOString() : null,
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
 * "最近一次**创建**于 T 之后"的会话（R2 的选择器）。
 * `mode: 'top-level'`（默认，老板新建的那个）/ `'all'`（不过滤 —— 只用来当**反向读数**）。
 */
export function selectNewestAfter(identities, { T, mode = 'top-level' }) {
  const after = identities.filter((x) => typeof x.createdAt === 'number' && x.createdAt >= T)
  const eligible = mode === 'top-level' ? after.filter((x) => x.is_top_level) : after
  const resumed = identities.filter((x) => typeof x.createdAt === 'number' && x.createdAt < T)
  eligible.sort((a, b) => b.createdAt - a.createdAt)
  // `mtime` 可能缺（只在"扫过目录"的那条路上有）—— 缺就沉到最后，**不许**让排序抛错
  const mtimeOf = (x) => (typeof x.mtime === 'string' ? x.mtime : '')
  resumed.sort((a, b) => mtimeOf(b).localeCompare(mtimeOf(a)))
  return {
    T,
    T_iso: new Date(T).toISOString(),
    mode,
    created_after_T: after.length,
    eligible: eligible.length,
    newest: eligible[0] ?? null,
    candidates: eligible.slice(0, 5),
    resumed_touched_after_T: resumed.slice(0, 10).map((x) => ({ id: x.id, createdAt_iso: x.createdAt_iso, agentPreset: x.agentPreset, mtime: x.mtime })),
    resumed_count: resumed.length,
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
    why: `会话 ${identity.id}（建于 ${identity.createdAt_iso}）头里的 \`agentPreset\` 是 ${JSON.stringify(identity.agentPreset)}，`
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
 * 读那份补丁，并判看板那一行**在不在、住在哪、开没开**。
 * 形状（R1 的验收）：顶层 `- insert:` 的**直接成员**、这一行自己不带 `id`；
 * 而我们仍然按**包名**认它（`@agenia/dsh-client-ui-dashboard`）—— 行 id 可以变，包名不会。
 */
export function profilePatchReading({ env = process.env, pkgName = null } = {}) {
  const where = profilePatchPath(env)
  const base = { ...where, exists: existsSync(where.path), measured_at: new Date().toISOString() }
  if (!base.exists) return { ...base, text: null, bytes: null, sha256: null, mtime: null, rows: [], mount: { present: false, why: '补丁文件不在' }, warnings: [] }
  const text = readFileSync(where.path, 'utf8')
  const st = statSync(where.path)
  const doc = parseYamlSubset(text, 'boot-profile-patch')
  const items = Array.isArray(doc.value) ? doc.value : []
  const rows = []
  const wanted = pkgName ?? packageReading(DASHBOARD_PKG_DIR()).name ?? 'client-ui-dashboard'
  const matches = (name) => typeof name === 'string' && (name.includes('client-ui-dashboard') || name === wanted)
  for (const item of items) {
    if (!(item instanceof Map)) continue
    const insert = item.get('insert')
    if (Array.isArray(insert)) {
      for (const row of insert) {
        if (!(row instanceof Map)) continue
        const name = row.get('name')
        rows.push({ placement: 'insert', id: row.get('id') ?? null, name: name ?? null, disabled: row.get('disabled') ?? null, ours: matches(name) })
      }
      continue
    }
    const name = item.get('name')
    rows.push({ placement: 'top-level-override', id: item.get('id') ?? null, name: name ?? null, disabled: item.get('disabled') ?? null, ours: matches(name) })
  }
  const ours = rows.filter((r) => r.ours)
  const inInsert = ours.filter((r) => r.placement === 'insert')
  const mount = inInsert.length > 0
    ? { present: true, placement: 'insert', disabled: inInsert.every((r) => r.disabled === true), row: inInsert[0], duplicates: inInsert.length }
    : ours.length > 0
      ? { present: true, placement: ours[0].placement, disabled: ours.some((r) => r.disabled === true), row: ours[0], duplicates: ours.length }
      : { present: false, why: '补丁里没有指向这个包的行（按包名找的）' }
  return {
    ...base,
    text,
    bytes: st.size,
    sha256: sha256(Buffer.from(text, 'utf8')),
    mtime: new Date(st.mtimeMs).toISOString(),
    warnings: doc.warnings ?? [],
    rows,
    mount,
  }
}

/**
 * "一步撤掉"—— 判据不是"有人说能删"，是**那一行能不能整块拿掉**：
 *   · 它必须住在**顶层** `- insert:` 里（宿主装载层），而且它是那一块里的**一行**；
 *   · **就删那一行**（行级删除，不是"把整块 insert 删了"）：行首缩进固定的那一项，
 *     从它那一行删到下一个同级项之前；
 *   · 删完剩下的文本仍然解析得干净（没有 warnings）；
 *   · 剩下的文本里再没有这个包名（删干净了，没留"第二处引用"）；
 *   · 顶层 item 数**不变**（那一块 insert 还在）—— 除非它本来就只有这一行，
 *     那就连空壳一起去掉（`removal_kind` 会自报是哪一种，读的人不用猜）。
 */
export function oneStepRemoval(patchReading) {
  const out = { ok: false, at: new Date().toISOString(), problems: [], readings: null }
  if (!patchReading?.text) {
    out.problems.push('补丁读不到（或那一行不在）—— 没有可撤的东西')
    return out
  }
  const lines = patchReading.text.replace(/\r\n/g, '\n').split('\n')
  const isTop = (l) => /^- /.test(l)
  const indentOf = (l) => (/^\s*/.exec(l) ?? [''])[0].length
  const isRow = (l) => /^\s*- (\S|$)/.test(l)
  // 顶层 item 的边界
  const topStarts = []
  for (let i = 0; i < lines.length; i += 1) if (isTop(lines[i])) topStarts.push(i)
  const topBlocks = topStarts.map((start, idx) => ({ start, end: idx + 1 < topStarts.length ? topStarts[idx + 1] : lines.length }))
  const home = topBlocks.find((b) => lines.slice(b.start, b.end).some((l) => l.includes('client-ui-dashboard')))
  if (home === undefined) {
    out.problems.push('顶层列表里没有任何一块提到这个包 —— 那一行不在（或不在顶层）')
    return out
  }
  if (!/^- insert:/.test(lines[home.start])) {
    out.problems.push(`那一块的第一行是 ${JSON.stringify(lines[home.start].slice(0, 60))}，不是顶层 \`- insert:\``)
    return out
  }
  // 那一块里的行（同级 `- ` 子项）
  const childStarts = []
  for (let i = home.start + 1; i < home.end; i += 1) if (isRow(lines[i]) && indentOf(lines[i]) > 0) childStarts.push(i)
  const children = childStarts.map((start, idx) => ({ start, end: idx + 1 < childStarts.length ? childStarts[idx + 1] : home.end }))
  const row = children.find((c) => lines.slice(c.start, c.end).some((l) => l.includes('client-ui-dashboard')))
  out.readings = { top_level_items: topBlocks.length, insert_item_children: children.length, row_line: row === undefined ? null : row.start + 1 }
  if (row === undefined) {
    out.problems.push(`\`- insert:\` 那一块里没有一行提到这个包（子项 ${children.length} 个）—— 那它是挂在别处的半行，不是"一行"`)
    return out
  }
  if (children.filter((c) => lines.slice(c.start, c.end).some((l) => l.includes('client-ui-dashboard'))).length !== 1) {
    out.problems.push('同一个 insert 块里指向这个包的行不止一行 —— 删一行删不干净')
    return out
  }
  // 就删这一行；如果删完 insert 块空了，把空壳也去掉（自报是哪种）
  const rowRemoved = [...lines.slice(0, row.start), ...lines.slice(row.end)]
  const childless = children.length === 1
  const rest = childless
    ? [...lines.slice(0, home.start), ...lines.slice(home.end)].join('\n')
    : rowRemoved.join('\n')
  const removalKind = childless ? 'whole-insert-item' : 'row-inside-insert'
  if (rest.includes('client-ui-dashboard')) {
    out.problems.push('拿掉那一行之后，文件里**还有**这个包名（第二处引用 ⇒ 不是一步）')
    return out
  }
  const doc = parseYamlSubset(rest, 'boot-profile-patch-after-removal')
  if ((doc.warnings ?? []).length > 0) {
    out.problems.push(`拿掉之后解析器出声了（${doc.warnings.length} 条）：${doc.warnings.slice(0, 2).join(' / ')}`)
    return out
  }
  const expectedItems = removalKind === 'whole-insert-item' ? topBlocks.length - 1 : topBlocks.length
  if (!Array.isArray(doc.value) || doc.value.length !== expectedItems) {
    out.problems.push(`拿掉之后顶层 item 数从 ${topBlocks.length} 变成 ${Array.isArray(doc.value) ? doc.value.length : '?'}（应为 ${expectedItems}）`)
    return out
  }
  out.ok = true
  out.readings = {
    ...out.readings,
    removal_kind: removalKind,
    removed_lines: row.end - row.start,
    removed_first_line: lines[row.start],
    after_sha256: sha256(Buffer.from(rest, 'utf8')),
    after_items: doc.value.length,
  }
  return out
}

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
