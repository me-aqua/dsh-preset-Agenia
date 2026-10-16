#!/usr/bin/env node
/**
 * `agenia-brain.mjs` —— 共享脑 CLI（**唯一**能写长期记忆 / 快照 / 报告的入口）。
 *
 * 冻结依据：提案 §B1.3（文件名与落点）· §B1.4（**调用形状 / op 表 / 退出码**）·
 * §B3.4（四类分布）· §B3.6（state / snapshot / entry / job 的 schema）· §B3.7（原子写与锁）·
 * 追加裁定 D-B3（`init` 只在空根成功 ⇒ `E_DATA_EXISTS` + exit 7）· D-B4（`is_double_low`）·
 * E-B5 / v1.4（`redo` 要老板点名证据）· v1.10 ②（`E_ARG_SCHEMA`⇒2 / `E_TXN_IO`⇒4）。
 *
 * 六条硬口径（本文件里每一处都照它写）：
 *   ① **`--data-root` 逐次显式**：没有 env 兜底，没有默认值。省略 / 空串 / 相对 / 指真实根 /
 *      C 盘 / UNC / 越界 —— 一律非零退出且**零写入**（判定顺序由 `lib/paths.mjs` 冻结）。
 *      测试模式（`--test-mode` 或 `AGENIA_TEST_RUN_ROOT`）下还要求根带 `.agenia-test-root` 且落在运行根之下。
 *   ② **stdout 恰好一行 JSON**：`{ok:true,…}` 或 `{ok:false,error:{code,message,details}}`；
 *      人话一律走 **stderr**（受限档 + 中文编码上出过事，见 `AGENTS.local.md` 八②）。
 *   ③ **退出码只从 `lib/error-codes.mjs` 来**：`ok ? 0 : CODES[code].exit`，本文件里没有第二份码表。
 *   ④ **写面全走 `lib/state.mjs` / `lib/snapshot.mjs` / `lib/proposals.mjs`** —— 原子写、锁、CAS、
 *      事务回滚都住在那三个模块里；本文件只做"参数 → 语义 → 落盘"的翻译。
 *   ⑤ **"现在"只从 `lib/clock.mjs` 进**（`AGENIA_NOW_FILE` 优先），本文件里没有裸 `Date`。
 *   ⑥ **不知道的 op / 不成形状的入参一律拒**，不许"猜一个最像的"。
 *
 * 🔴 `health-read` 的判定**住在 `lib/health.mjs`**（追加裁定 v1.12 C-1：形状照真实入参冻结，
 *    逻辑整体搬进那个模块并导出 `healthVerdict(input)`）。本文件**只做薄调用**：装输入、转出结果、写派生卡。
 *    同一份判定还有第二个入口 `agenia-local.mjs --op health` —— 一份实现、两个入口，绝不各写一遍。
 *
 * 🔴 **唯一一个"根判定例外"：`--op init-real`。**
 *    它是"第一次开真实库"那一下 —— 走**自己的**三道硬闸（`lib/paths.mjs::realInitVerdict`），
 *    并且**只有它**能落到 `REAL_BRAIN_ROOT`。
 *    · 别的任何 op 给了真实根 ⇒ 照旧 `E_ROOT_REAL_BRAIN`（exit 3）。**这道反面对照不许退化** ——
 *      `dataRootVerdict` 的 `REAL_ROOTS` 无条件拒，就是"日常工具误写真实库"的全部防线。
 *    · 它的**实际动作**复用 `opInit`（`ensureLayout` + 常识骨架 + v0 快照 + 审计），
 *      **不另写一份"差不多"的初始化** —— 两份来源迟早不一致。
 *    · 成功之后另落一条 `audit`（kind = `init-real`），写清"根 / v0 版本 / 常识哈希 / 触发它的 op 名"。
 *
 * 🔴 **第二条窄路：`--real-mode`。** 日常 op 落真实库的那道开关（`lib/paths.mjs::realModeVerdict`）。
 *    · **不给开关 ⇒ 老行为一个字不变**（走 `resolveRoot()`，真实根照旧 `E_ROOT_REAL_BRAIN`）。
 *      靠的是"根本没执行到新的那两支"，不是靠新函数里的某个判断。
 *    · 给了 ⇒ ① `--data-root` 必须逐字等于 `REAL_BRAIN_ROOT`；② 与 `--test-mode` **互斥**；
 *      ③ 根**不必**不存在（"必须不存在"是 `init-real` 独有的语义）。
 *    · 真实模式下每个 **`writes: true`** 的 op 成功之后**多落一条** `audit`（kind = `real-mode-write`）；
 *      那份写命令名单**从 `lib/cli-inventory.mjs` 现算**，本文件不另写一份。
 *    · 🔴 **`init-real` 与 `--real-mode` 并存，不合并** —— `init-real` 比它更窄（还要求根不存在）。
 *
 * 🔴 **会话包入口：`--op session-packet`（2026-10-15 加，活二）。**
 *    它是 `lib/packet.mjs`（REV-01，v1.5/v1.6 冻结）的**壳**，不是第二份引擎：
 *      · 解帧 / 帧边界 / "坏帧不留半包" / "先分类后解压" / 原子落盘 **全部**住在那个模块里，
 *        本文件**一行都不重写**（重写第二份 = 迟早解出两个不同的包）；
 *      · 本文件只做三件事：把入参翻成那个模块的形状 · 把落点钉进
 *        `<工作区>/.team/retro/<day>/conversation-packet/` · 落完之后**再校验一遍**并把读数带出来；
 *      · 🔴 **源流目录一律只读**（真实运行 = `~\.dsh\sessions\…`）：临时件落点照那个模块头部
 *        冻死的规则走，**本文件不另选一格**、也不越过它去碰源流目录。
 *      · 🔴 **v1.8（2026-10-16）：`sources[].human` 原文透传**（"只打人话"）——
 *        判形状 / 投影 / 全部账都在 `lib/packet.mjs`；本文件只把 `human` 那把账
 *        （含**"保证降级"那句话**）记进 audit 与返回值。**manifest 那十个顶层字段一个都不动。**
 *
 * 🔴 **两个真实根怎么来的（2026-10-15 修 P1 · 技术评审 F4）**：`lib/paths.mjs` 里一条绝对路径都不写 ——
 *    脑根从"预设自己住在哪"推出来，路线根从**工作区**推出来。而工作区只有这条 CLI 手里有
 *    （`--workspace` / `payload.workspace`）⇒ 所以**根判定之前先把 payload 读出来**
 *    （`resolveRoot()` 多了一个 `realRoots` 入参，喂进去的就是那个工作区算出来的那张表）。
 *    ⚠️ 没给工作区时用 `cwd`（跑命令时站的那个工作区）；**绝不退回某个写死的路径**。
 */
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { CODES } from '../lib/error-codes.mjs'
import { dataRootVerdict, realInitVerdict, realModeVerdict, realRootsFor, TEST_ROOT_MARKER, testModeOf, workspaceWriteVerdict } from '../lib/paths.mjs'
import { acquireLock, releaseLock, writeJsonAtomic } from '../lib/atomic.mjs'
import { capacityVerdict, isCullEligible } from '../lib/memory.mjs'
import { LEASES } from '../lib/liveness.mjs'
import { validateRedoEvidence } from '../lib/evidence.mjs'
import * as S from '../lib/state.mjs'
import * as SNAP from '../lib/snapshot.mjs'
import * as PROP from '../lib/proposals.mjs'
import { healthVerdict, buildHealthCard } from '../lib/health.mjs'
import { openAdoptedTicketIds } from '../lib/tickets.mjs'
import { COMMANDS } from '../lib/cli-inventory.mjs'
import { PACKET_MANIFEST_FIELDS, buildSessionPacket, validateSessionPacket } from '../lib/packet.mjs'

const CLI_NAME = 'agenia-brain.mjs'

/** op 清单（顺序即 `--op help` 的打字顺序；新增 op 必须同批进 `lib/cli-inventory.mjs` 与冻结表）。 */
const OP_NAMES = Object.freeze([
  'init', 'init-real', 'state-read', 'daily-start', 'claim-update', 'candidates-freeze', 'judge-start',
  'judge-commit', 'review-start', 'proposal-import', 'maintenance-import', 'snapshot-read',
  'snapshot-list', 'entry-count', 'report-read', 'health-read', 'job-mark', 'audit-append',
  'snapshot-archive', 'cs-confirm', 'session-packet', 'judge-pending', 'help',
])

/**
 * 走**自己那套根判定**的 op（目前只有 `init-real`）。
 * ⚠️ 这张表是**正面清单**：不在这张表里的 op 一律走 `resolveRoot()`（`REAL_ROOTS` 无条件拒）。
 * 反过来写（"把某几个 op 排除掉"）迟早会漏一个 —— 漏出去的那一个就是真实库的后门。
 */
const OPS_WITH_OWN_ROOT_GATE = Object.freeze(['init-real'])

/**
 * 真实模式下要"多落一条审计"的 op —— **从 `lib/cli-inventory.mjs` 现算，不另写一份名单**。
 * 两份名单迟早分叉，而分叉的那一天表现是"某个写命令悄悄不记审计"，谁都不会发现。
 */
const REAL_MODE_WRITE_OPS = Object.freeze(
  COMMANDS.filter((c) => c.cli === CLI_NAME && c.writes === true).map((c) => c.op),
)

function cliError(code, message, details = null) {
  const err = new Error(message)
  err.name = 'BrainCliError'
  err.code = code
  err.details = details
  return err
}

// ── 参数 ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { op: null, dataRoot: null, workspace: null, statusRoot: null, inFile: null, testMode: false, realMode: false, forceRecover: false, unknown: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]
    const eq = raw.indexOf('=')
    const key = eq >= 0 ? raw.slice(0, eq) : raw
    const inline = eq >= 0 ? raw.slice(eq + 1) : null
    const take = () => (inline !== null ? inline : (argv[i + 1] !== undefined ? argv[(i += 1)] : null))
    switch (key) {
      case '--op': out.op = take(); break
      case '--data-root': out.dataRoot = take(); break
      case '--workspace': out.workspace = take(); break
      case '--status-root': out.statusRoot = take(); break
      case '--in': out.inFile = take(); break
      case '--test-mode': out.testMode = true; break
      case '--real-mode': out.realMode = true; break
      case '--force-recover': out.forceRecover = true; break
      default: out.unknown.push(raw); break
    }
  }
  return out
}

function readPayload(args) {
  if (args.inFile === null || String(args.inFile).trim() === '') return {}
  const file = path.resolve(String(args.inFile))
  if (!existsSync(file)) throw cliError('E_ARG_USAGE', `--in 指的入参文件不在：${file}`)
  let text = null
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    throw cliError('E_ARG_USAGE', `--in 指的入参文件读不到（${err?.code ?? 'UNKNOWN'}）：${file}`)
  }
  try {
    const parsed = JSON.parse(text)
    return parsed === null ? {} : parsed
  } catch (err) {
    throw cliError('E_ARG_SCHEMA', `--in 的文件不是合法 JSON（${String(err?.message).slice(0, 120)}）：${file}`)
  }
}

/** 测试模式（`--test-mode` 或环境里那个运行根）—— 一处说法，三处调用共用。 */
function testModeOfArgs(args) {
  return args.testMode === true || testModeOf({}, process.env)
}

/** 测试运行根（没有 ⇒ `null`）；测试模式下 `mustBeUnder` 用的就是它。 */
function runRootOfEnv() {
  return typeof process.env.AGENIA_TEST_RUN_ROOT === 'string' && process.env.AGENIA_TEST_RUN_ROOT.trim() !== ''
    ? process.env.AGENIA_TEST_RUN_ROOT
    : null
}

/**
 * 盘上那个根带不带 `.agenia-test-root`（**只探，不判**——判在 `lib/paths.mjs` 那几支里）。
 * 只有形状像绝对路径时才去 `stat`，免得把相对名解析到 cwd 上。
 */
function hasTestMarker(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z]:[\\/]/.test(raw)) return false
  try {
    return statSync(path.join(raw, TEST_ROOT_MARKER)).isFile()
  } catch {
    return false
  }
}

/**
 * 根判定 —— **每一条 op 都先过这一关**（写面与读面一视同仁；`--data-root` 缺了就当场拒）。
 * 判定顺序由 `lib/paths.mjs::dataRootVerdict` 冻结；这里只负责把盘上事实（marker 在不在）喂给它。
 *
 * `realRoots`：那张"真实根"拒绝名单（`undefined` ⇒ `dataRootVerdict` 用它自己那一份 =
 * **缺省工作区（cwd）**算出来的）。`--data-root` 那一档由 `main()` 把**本 op 的工作区**喂进来
 * （见下面的 `guardWorkspaceOf`）—— 于是"另一个工作区跑同一份代码"时，路线根那一格指的是**那个**
 * 工作区的 `.team/route`，不是写死的某一条路。
 * ⚠️ **工作区自己那一档不喂**（`resolveWorkspace` 用的是缺省表）：工作区**一定包住它自己的**
 *    `<ws>/.team/route`，拿"包住真实根"那条去判它自己，恒等于自拒。
 * ⚠️ `session-packet` 连**工作区那一档**也不走这里 —— 它走 `resolvePacketWorkspace()`（判落点）。
 */
function resolveRoot(args, { label = '--data-root', raw = args.dataRoot, realRoots, containingRule } = {}) {
  const testMode = testModeOfArgs(args)
  const verdict = dataRootVerdict(raw, {
    testMode,
    markerExists: hasTestMarker(raw),
    realRoots, // ← `undefined` ⇒ 默认表（缺省工作区那一档），判定语义一个字不动
    containingRule, // ← 同上：`undefined` ⇒ 默认 `true`（照旧判"包住"）；只有工作区那一档传 `false`
    mustBeUnder: testMode ? runRootOfEnv() : null,
  })
  if (!verdict.ok) throw cliError(verdict.code, `${label}：${verdict.message}`)
  return { root: verdict.root, testMode }
}

/**
 * 这条 op 的**工作区**（只管一件事：让"真实路线根"那一格算对）。
 *
 * 取法按序（和 `resolveWorkspace` 认的是同一个东西，只是这里**不验证**、只要那个字符串）：
 *   ① `payload.workspace`（`--in` 里那份）；② `--workspace`；③ 都没有 ⇒ `undefined` ⇒
 *   `lib/paths.mjs` 回落到 `process.cwd()`（跑命令时站的那个工作区）。
 *
 * ⚠️ 这里**不做任何路径判定**（缺 / 相对 / C 盘……一律交给 `resolveWorkspace` 去拒）——
 *    它只回答"路线根那一格该拿哪个工作区去算"。判在这儿做，等于把两条判定揉成一条。
 */
function guardWorkspaceOf(args, payload) {
  const fromPayload = typeof payload?.workspace === 'string' && payload.workspace.trim() !== '' ? payload.workspace : null
  return fromPayload ?? args.workspace ?? undefined
}

/**
 * `session-packet` 的**工作区 + 落点** —— 这条 op 不走 `resolveWorkspace()`，判的是落点。
 *
 * 🔴 为什么（2026-10-15 组长裁，别改回去）：这条 op 的写面是
 *    `<工作区>\.team\retro\<day>\conversation-packet\` **一格窄目录**，而真实库就住在工作区**里面**。
 *    拿 `dataRootVerdict` 的"包住真实根"去判工作区，等于判"工作区不许包住自己的东西" ⇒
 *    `--workspace E:\Harness` **永远自拒**（实测过：`E_ROOT_REAL_BRAIN` / `E:\Harness ⊇ …\.runtime`），
 *    那不是保护，是死锁。⇒ 改判**落点**：落点不许落在任何真实根里（含与真实根相等）。
 *    ⚠️ `--data-root` 那条判法**一个字都没动**（它要写整个根，"包住也拒"是对的）；判据住在
 *    `lib/paths.mjs::workspaceWriteVerdict`，形状（缺/相对/UNC/C 盘）与测试模式两格（marker / 越界）照旧。
 *
 * @returns {{workspace:string, target:string}} 两个都是 canonical
 */
function resolvePacketWorkspace(args, payload, relPath) {
  const raw = guardWorkspaceOf(args, payload)
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw cliError('E_ARG_SCHEMA', '缺 workspace（payload.workspace 或 --workspace 二选一）')
  }
  const testMode = testModeOfArgs(args)
  const verdict = workspaceWriteVerdict(raw, {
    relPath,
    testMode,
    markerExists: hasTestMarker(raw),
    mustBeUnder: testMode ? runRootOfEnv() : null,
    // 路线根那一格按**这个**工作区算（同一个工作区喂给 data-root 的那张表，就是这一份）
    realRoots: realRootsFor(raw),
  })
  if (!verdict.ok) throw cliError(verdict.code, `--workspace / 包落点：${verdict.message}`, { workspace: verdict.workspace, target: verdict.target })
  return { workspace: verdict.workspace, target: verdict.target }
}

/**
 * `init-real` 的根判定 —— **不走** `dataRootVerdict`，走它自己那三道硬闸。
 *
 * 为什么只能在这里绕开：`REAL_ROOTS` 无条件拒是"日常工具误写真实库"的**全部**防线。
 * 那条防线留在原处不动；开库这一个动作单独一个入口（见文件头那条 🔴）。
 *
 * @returns {{root:string, testMode:false}} `testMode` 恒为 `false`（互斥闸已经拒掉了 true）
 */
function resolveInitReal(args) {
  const testMode = args.testMode === true || testModeOf({}, process.env)
  const raw = args.dataRoot
  // `exists` 由这里探（纯函数不摸盘）。只有形状像绝对路径时才去探，免得把相对名解析到 cwd 上。
  let exists = false
  if (typeof raw === 'string' && /^[A-Za-z]:[\\/]/.test(raw)) {
    exists = existsSync(path.resolve(raw))
  }
  const verdict = realInitVerdict(raw, { exists, testMode })
  if (!verdict.ok) throw cliError(verdict.code, `--data-root：${verdict.message}`)
  return { root: verdict.root, testMode: false }
}

/**
 * `--real-mode` 的根判定 —— 日常 op 落真实库的那条窄路（**开关关着时根本不会走到这里**）。
 *
 * `main()` 里的次序是刻意的：**没给 `--real-mode` ⇒ 连这个函数都不调**，直接走老的
 * `resolveRoot()`。所以"老行为一个字不变"不是靠这个函数判断出来的，是靠**根本没执行到**。
 *
 * @returns {{root:string, testMode:false, realMode:true}} 两个模式位都是定值（互斥闸已经把可疑的组合拒了）
 */
function resolveRealMode(args) {
  const testMode = args.testMode === true || testModeOf({}, process.env)
  const raw = args.dataRoot
  let exists = false
  if (typeof raw === 'string' && /^[A-Za-z]:[\\/]/.test(raw)) {
    exists = existsSync(path.resolve(raw))
  }
  const verdict = realModeVerdict(raw, { realMode: args.realMode === true, exists, testMode })
  if (!verdict.ok) throw cliError(verdict.code, `--data-root：${verdict.message}`)
  return { root: verdict.root, testMode: false, realMode: true }
}

/**
 * 工作区（`.team` 的家）也走同一套隔离判定 —— 它同样"不许是 C 盘、不许越界"。
 * ⚠️ 它**不喂 `realRoots`**（用 `lib/paths.mjs` 的缺省表）：工作区一定包住它自己的
 *    `<ws>/.team/route`，拿"包住真实根"那条去判它自己，恒等于自拒 —— 理由见上面 `resolveRoot`。
 */
function resolveWorkspace(args, payload) {
  const raw = typeof payload?.workspace === 'string' && payload.workspace.trim() !== '' ? payload.workspace : args.workspace
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw cliError('E_ARG_SCHEMA', '缺 workspace（payload.workspace 或 --workspace 二选一）')
  }
  // 🔴 `containingRule: false` —— **工作区这一档不判"包住真实根"**：工作区一定包住它自己的
  //    `<ws>/.team/route`，拿那条判它 ⇒ **恒自拒**（本文件 L186 那句注释早写着）。
  //    "落在真实根里"照旧拒（那一条有意义）。2026-10-16 加 —— 来历见 `lib/paths.mjs` 判定处那段注释。
  return resolveRoot(args, { label: '--workspace', raw, containingRule: false }).root
}

const requireString = (value, what) => {
  if (typeof value !== 'string' || value.trim() === '') throw cliError('E_ARG_SCHEMA', `${what} 必填（非空字符串），实得 ${JSON.stringify(value)}`)
  return value
}

const mustState = (root, day) => {
  const read = S.readUpdateState(root, day)
  if (!read.ok) throw cliError(read.code, read.message, { path: read.path })
  return read.state
}

// ── op：init ───────────────────────────────────────────────────────────────
/**
 * D-B3：**只在空根上成功**。非空根 ⇒ `E_DATA_EXISTS`（exit 7）。
 * `.agenia-test-root` 不算"东西"（测试根一建出来就带着它）。
 */
function opInit({ root }) {
  const at = S.nowIso()
  const empty = S.rootIsEmpty(root)
  if (!empty.empty) {
    throw cliError('E_DATA_EXISTS', `init 只在空根上成功：${root} 里已经有 ${empty.entries.length} 项（${empty.entries.slice(0, 5).join(' / ')}）`)
  }
  S.ensureLayout(root)
  const cs = S.writeCommonSenseText(root, S.COMMON_SENSE_TEMPLATE)
  S.writeCommonSenseConfirmation(root, { sha256: cs.sha256, confirmedBy: null, confirmedAt: at })

  const snapshot = SNAP.buildSnapshot({
    version: 'v0',
    parentVersion: null,
    entries: [],
    commonSenseSha256: cs.sha256,
    generatedAt: at,
  })
  const snapFile = SNAP.snapshotPath(root, 'v0')
  const written = writeJsonAtomic(snapFile, snapshot)
  if (!written.ok) throw cliError(written.code, `v0 快照写入失败：${written.message}`, { path: snapFile })
  try {
    SNAP.writeCurrentVersion(root, 'v0')
  } catch (err) {
    // 指针写不进去 ⇒ 把刚落的 v0 撤掉（"半个 init"比"没 init"更难收拾）
    try { unlinkSync(snapFile) } catch { /* 已在失败路径上 */ }
    throw err
  }
  S.appendAudit(root, { kind: 'init', detail: { snapshot_version: 'v0', common_sense_sha256: cs.sha256 }, at })
  return {
    data_root: root,
    snapshot_version: 'v0',
    common_sense_sha256: cs.sha256,
    snapshot_path: snapFile,
  }
}

// ── op：init-real（**唯一**能落真实库的那一下）────────────────────────────────
/**
 * `init-real`：第一次开真实库。
 *
 * **三道硬闸住 `lib/paths.mjs::realInitVerdict`**（纯函数，可脱盘测）：
 *   ① 根必须**逐字等于** `REAL_INIT_ROOT`（相等，不是"落在里面"）；
 *   ② 根必须**还不存在** ⇒ 这是"一次性"保护，开过就再也开不了第二次；
 *   ③ C 盘 / 相对 / UNC 照旧拒，且**不接受测试模式**（互斥）。
 *
 * 🔴 **实际动作就是 `opInit`** —— 一行不多写。两份"初始化"迟早不一致，
 *    而不一致的后果是"真实库和测试库长得不一样"，那种毛病只有在真出事那天才看得见。
 *
 * 成功之后**另外**落一条 `audit`（kind = `init-real`）：`opInit` 自己已经记了 `kind:'init'`，
 * 这一条记的是"**是谁、从哪个 op 开的库**"——审计链上那份"第一次写入"的可读证据。
 */
function opInitReal({ root }) {
  const out = opInit({ root }) // ← 复用：ensureLayout + 常识骨架 + v0 快照 + audit(init)
  // ⚠️ `at` 必须在 `opInit` **之后**取：审计链是按 `seq` 递增的，而人读的是 `at`。
  //    先取 `at` 会让"seq 2 比 seq 1 更早"，读起来像被人改写过分（实测真实根第一次开库就这样）。
  const at = S.nowIso()
  const audit = S.appendAudit(root, {
    kind: 'init-real',
    detail: {
      data_root: root,
      snapshot_version: out.snapshot_version,
      common_sense_sha256: out.common_sense_sha256,
      triggered_by_op: 'init-real',
    },
    at,
  })
  return {
    ...out,
    initiated_via: 'init-real',
    init_real_audit: { seq: audit.seq, audit_path: audit.audit_path },
  }
}

// ── op：读面 ───────────────────────────────────────────────────────────────
function opStateRead({ root, payload }) {
  const { day, source } = S.resolveDay(root, payload?.day)
  const read = S.readUpdateState(root, day)
  if (!read.ok) throw cliError(read.code, read.message, { path: read.path, day })
  return { state: read.state, state_path: read.path, day, day_source: source }
}

function opSnapshotRead({ root, payload }) {
  const wanted = typeof payload?.version === 'string' && payload.version.trim() !== '' ? payload.version.trim() : null
  let version = wanted
  if (version === null) {
    const pointer = SNAP.readCurrentVersion(root)
    if (!pointer.ok) throw cliError(pointer.code, pointer.message, { path: pointer.path })
    version = pointer.version
  }
  const read = SNAP.readSnapshot(root, version)
  if (!read.ok) throw cliError(read.code, read.message, { path: read.path, version })
  return { snapshot: read.snapshot, version, snapshot_path: read.path }
}

function opSnapshotList({ root }) {
  const pointer = SNAP.readCurrentVersion(root)
  return {
    versions: SNAP.listVersions(root),
    current: pointer.ok ? pointer.version : null,
    current_pointer_ok: pointer.ok,
    current_pointer_problem: pointer.ok ? null : pointer.message,
  }
}

function opEntryCount({ root }) {
  const read = SNAP.readCurrentSnapshot(root)
  if (!read.ok) throw cliError(read.code, read.message, { path: read.path })
  const entries = read.snapshot.entries ?? []
  const counts = SNAP.currentCounts(root)
  return {
    count: counts.count,
    chars: counts.chars,
    distribution: read.snapshot.distribution,
    totals: read.snapshot.totals,
    snapshot: read.version,
  }
}

function opReportRead({ root, payload }) {
  const { day } = S.resolveDay(root, payload?.day)
  const read = SNAP.readReport(root, day)
  if (!read.ok) throw cliError(read.code, read.message, { path: read.path, day })
  return { report: read.report, path: read.path, day, derived: read.report?.derived === true, note: read.message || null }
}

// ── op：写面（每日状态 / 派工 / 判决）──────────────────────────────────────
/**
 * `daily-start`：每一天一行"今天开工了"（`<WS>\state\daily\<day>.json`）。
 * 它是**派生副本**（§B3.4：不另立权威）—— 四类分布从当前快照抄一份，方便人读。
 */
function opDailyStart({ root, args, payload }) {
  const ws = resolveWorkspace(args, payload)
  const at = S.nowIso()
  const { day } = S.resolveDay(root, payload?.day)
  const sessionId = typeof payload?.session_id === 'string' && payload.session_id.trim() !== '' ? payload.session_id : null
  const current = SNAP.readCurrentSnapshot(root)
  const report = SNAP.readReport(root, day)
  const file = path.join(ws, '.team', 'state', 'daily', `${day}.json`)
  mkdirSync(path.dirname(file), { recursive: true })
  const written = writeJsonAtomic(file, {
    schema: 1,
    day,
    project: typeof payload?.project === 'string' && payload.project.trim() !== '' ? payload.project : null,
    workspace: ws,
    session_id: sessionId,
    snapshot: current.ok ? current.version : null,
    distribution: report.ok ? report.report.distribution : SNAP.reportOf(null, { day }).distribution,
    totals: report.ok ? report.report.totals : SNAP.reportOf(null, { day }).totals,
    char_metric: { ...SNAP.CHAR_METRIC },
    updated_at: at,
  })
  if (!written.ok) throw cliError(written.code, `每日状态写入失败：${written.message}`, { path: file })
  S.appendAudit(root, { kind: 'daily-start', detail: { day, workspace: ws, session_id: sessionId }, at })
  return { status_path: file, at, day }
}

/**
 * `claim-update`：抢当天的唯一写者。
 *
 * 次序：**先抢锁 → 锁内读状态 → 落盘**（B3.7 的"读-改-写全程持锁"）。
 * - 锁：`<dataRoot>/locks/update-<day>.lock`（`lib/atomic.mjs`；僵锁不静默抢写 ⇒ `E_LOCK_STALE`，
 *   要显式 `--force-recover`）；
 * - 状态：这一天已经有 claim（且没带老板点名证据）⇒ `E_LOCK_HELD`（同一天只许一个写者）；
 * - `redo:true` 必须同时带 `previous_attempt_id` 与 `boss_redo_evidence`（E-B5 ⇒ `E_REDO_NOT_AUTHORIZED`）。
 *
 * ⚠️ **读状态必须在锁里**：锁外先读会让两个并发 claim 都读到"还没人 claim"，然后各写一遍 ——
 * 写者就不唯一了（探针 A/J 两格当场量出来的）。
 *
 * `--force-recover` 的语义 = **显式接手**（上一任死了）：generation 递增，旧 token 当场失效。
 */
function opClaimUpdate({ root, args, payload }) {
  const at = S.nowIso()
  const day = requireString(payload?.day, 'day')
  if (!S.isDayKey(day)) throw cliError('E_ARG_SCHEMA', `day 必须是 YYYY-MM-DD，实得 ${JSON.stringify(day)}`)
  const ownerProject = requireString(payload?.owner_project, 'owner_project')
  const ownerSession = requireString(payload?.owner_session, 'owner_session')
  const forceRecover = args.forceRecover === true
  const redo = payload?.redo === true

  if (redo) {
    // E-B5 的形状判定只有一处来源：`lib/evidence.mjs`（老板点名证据那一族）。
    const authorized = validateRedoEvidence({ previous_attempt_id: payload?.previous_attempt_id, boss_redo_evidence: payload?.boss_redo_evidence })
    if (!authorized.ok) {
      throw cliError(authorized.code, `手动重做必须同时带 \`previous_attempt_id\` 与 \`boss_redo_evidence\`（原话/动作 + source_session_id + occurred_at）—— 缺一样都不许重做：${authorized.message}`)
    }
  }

  const lockPath = S.updateLockPath(root, day)
  // ① **先抢锁**，再读状态 —— 读-改-写全程持锁（B3.7）。
  //    两个原因，都是探针当场量出来的：
  //    · 锁外先读状态 ⇒ 两个并发 claim 都会读到"还没人 claim"，然后先后把状态各写一遍（写者不唯一）；
  //    · 僵锁要能报出 `E_LOCK_STALE`（"不许静默抢写"）—— 状态层那句 `E_LOCK_HELD` 会把它盖掉。
  const acquired = acquireLock(lockPath, { session_id: ownerSession, purpose: 'update-state' }, { forceRecover })
  if (!acquired.ok) throw cliError(acquired.code, acquired.message, { path: lockPath })
  try {
    // ② 锁内读状态（此刻的读才是有效的那一次读）
    const read = S.readUpdateState(root, day)
    if (!read.ok && read.code !== 'E_DATA_MISSING') throw cliError(read.code, read.message, { path: read.path })
    const previous = read.ok ? read.state : null
    if (previous && previous.owner_project !== null && !redo && !forceRecover) {
      throw cliError('E_LOCK_HELD', `这一天（${day}）已经被 ${previous.owner_project}/${previous.owner_session} claim 过（phase=${previous.phase}）—— 同一天只许一个写者；重做要走 redo + 老板点名证据，接手要显式 --force-recover`)
    }

    const generation = previous === null ? 1 : (redo || forceRecover ? previous.generation + 1 : previous.generation)
    const attempt = previous === null ? 1 : previous.judge_attempt + 1
    const token = typeof payload?.token === 'string' && payload.token.trim() !== '' ? payload.token : S.mintToken()

    const state = S.newUpdateState({
      day,
      ownerProject,
      ownerSession,
      commonSenseSha256: S.readCommonSense(root).sha256,
      generation,
      judgeAttempt: attempt,
      judgeToken: S.hashToken(token),
      at,
    })
    state.last_liveness_event_at = at
    if (previous !== null && previous.snapshot_available === true && !redo) {
      // 接手（上一任死了）时，已经发布过的快照仍然可用 —— 失败不许把快照锁死。
      state.snapshot_available = true
      state.new_snapshot = previous.new_snapshot
      state.snapshot_ready_at = previous.snapshot_ready_at
    }
    S.writeUpdateState(root, day, state)
    const intent = S.writeLaunchIntent(root, { day, generation, attempt, role: 'memory-judge', ownerProject, ownerSession, at })
    S.writeCurrentDay(root, day)
    S.appendAudit(root, { kind: 'claim-update', detail: { day, generation, attempt, owner_project: ownerProject, owner_session: ownerSession, redo, force_recover: forceRecover, previous_attempt_id: payload?.previous_attempt_id ?? null }, at })
    return {
      generation,
      attempt,
      token,
      job_intent_path: intent.path,
      state_path: S.updateStatePath(root, day),
      day,
      phase: state.phase,
    }
  } finally {
    releaseLock(lockPath)
  }
}

/** `candidates-freeze`：把这一轮的输入清单冻下来（CAS：generation 不符 ⇒ `E_CAS_STALE`）。 */
function opCandidatesFreeze({ root, payload }) {
  const at = S.nowIso()
  const { day } = S.resolveDay(root, payload?.day)
  const state = mustState(root, day)
  const generation = payload?.generation
  if (!Number.isInteger(generation)) throw cliError('E_ARG_SCHEMA', `generation 必须是整数，实得 ${JSON.stringify(generation)}`)
  if (generation !== state.generation) throw cliError('E_CAS_STALE', `generation=${generation} 与当前那一轮（${state.generation}）不符 —— 绝不覆盖`)
  const ids = payload?.candidate_ids
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id === '')) {
    throw cliError('E_ARG_SCHEMA', 'candidate_ids 必须是非空字符串数组')
  }
  const next = { ...state, frozen_proposal_ids: [...ids], last_liveness_event_at: at }
  S.writeUpdateState(root, day, next)
  S.appendAudit(root, { kind: 'candidates-freeze', detail: { day, generation, count: ids.length }, at })
  return { frozen_proposal_ids: next.frozen_proposal_ids, count: ids.length, day }
}

/**
 * `judge-start`：**先把 launch intent 落成作业记录，再让作业跑**（JOB-01 ①）。
 * 同时把这一轮的 token 绑到实际那次判决上（claim 铸的那个可以先给出去，这里以调用方给的为准）。
 */
function opJudgeStart({ root, payload }) {
  const at = S.nowIso()
  const { day } = S.resolveDay(root, payload?.day)
  const state = mustState(root, day)
  if (!Number.isInteger(payload?.generation)) throw cliError('E_ARG_SCHEMA', 'generation 必须是整数')
  if (payload.generation !== state.generation) throw cliError('E_CAS_STALE', `generation=${payload.generation} 与当前那一轮（${state.generation}）不符`)
  if (!Number.isInteger(payload?.attempt)) throw cliError('E_ARG_SCHEMA', 'attempt 必须是整数')
  if (payload.attempt !== state.judge_attempt) throw cliError('E_TXN_TOKEN', `attempt=${payload.attempt} 不是当前这一次判决（${state.judge_attempt}）—— 旧 attempt 不许再起作业`)
  if (!S.PHASES_FOR_JUDGE_START.includes(state.phase)) {
    throw cliError('E_STATE_PHASE', `phase=${state.phase} 不允许起判决作业`)
  }
  const jobId = requireString(payload?.job_id, 'job_id')

  const job = S.newJobRecord({
    jobId,
    role: 'memory-judge',
    attempt: state.judge_attempt,
    generation: state.generation,
    parentSessionId: state.owner_session,
    parentState: 'alive',
    state: 'running',
    at,
  })
  S.writeJob(root, job) // ← launch intent **先**落盘

  const next = {
    ...state,
    phase: 'judging',
    snapshot_available: false,
    judge_token: typeof payload?.token === 'string' && payload.token.trim() !== '' ? S.hashToken(payload.token) : state.judge_token,
    last_liveness_event_at: at,
  }
  S.writeUpdateState(root, day, next)
  S.appendAudit(root, { kind: 'judge-start', detail: { day, generation: state.generation, attempt: state.judge_attempt, job_id: jobId }, at })
  return {
    judge_job_id: jobId,
    judge_job_state: job.state,
    job_path: S.jobPath(root, jobId),
    last_liveness_event_at: job.last_liveness_event_at,
    day,
  }
}

/**
 * `judge-commit`：判决落库 —— 一并发布快照、写报告、推状态（**一个事务**，见 `SNAP.publishUpdate`）。
 *
 * 拒绝次序是**刻意**的（STO-03 钉的就是第一条）：
 *   token → generation/attempt → phase → 常识三处核对 → 基准快照（CAS）→ 维护案资格 → 容量/op 形状 → 落盘。
 * 前六条一条都不许写盘。
 */
function opJudgeCommit({ root, payload }) {
  const at = S.nowIso()
  const { day } = S.resolveDay(root, payload?.day)
  const state = mustState(root, day)

  // ① 旧 attempt 的 token **第一个**被挡住（不然会以"版本不对"报错，把真正的根因藏起来）
  if (!S.tokenMatches(state, payload?.token)) {
    throw cliError('E_TXN_TOKEN', '旧 attempt 的 token 已失效 —— 这次提交不属于当前那一轮判决')
  }
  if (payload?.generation !== state.generation) throw cliError('E_CAS_STALE', `generation=${payload?.generation} 与当前那一轮（${state.generation}）不符 —— 绝不覆盖`)
  if (payload?.attempt !== state.judge_attempt) throw cliError('E_TXN_TOKEN', `attempt=${payload?.attempt} 不是当前这一次判决（${state.judge_attempt}）`)
  if (state.phase !== 'judging') throw cliError('E_STATE_PHASE', `phase=${state.phase} 不允许提交判决（要 judging）`)

  // ② 常识三处核对：开工那一刻 / 现在 / 提交声明
  const cs = S.readCommonSense(root)
  if (!cs.ok) throw cliError(cs.code, cs.message, { path: cs.path })
  if (state.common_sense_sha256 !== cs.sha256) {
    throw cliError('E_CS_CHANGED', `判决运行期间常识被改过（开工时 ${state.common_sense_sha256}，现在 ${cs.sha256}）⇒ 拒提交`)
  }
  if (String(payload?.common_sense_sha256 ?? '').toLowerCase() !== cs.sha256) {
    throw cliError('E_CS_UNCONFIRMED', `提交声明的常识哈希（${payload?.common_sense_sha256}）与当前确认的（${cs.sha256}）对不上 —— 改了常识却没有老板确认`)
  }

  // ③ 基准快照 = CAS 令牌
  const baseVersion = typeof payload?.base_snapshot === 'string' && payload.base_snapshot.trim() !== ''
    ? payload.base_snapshot.trim()
    : (state.base_snapshot ?? 'v0')
  const base = SNAP.readSnapshot(root, baseVersion)
  if (!base.ok) throw cliError(base.code, `基准快照读不到：${base.message}`, { path: base.path, version: baseVersion })
  const current = SNAP.readCurrentVersion(root)
  if (current.ok && current.version !== baseVersion) {
    throw cliError('E_CAS_STALE', `基准快照 ${baseVersion} 不是当前版本（${current.version}）—— 绝不覆盖`)
  }

  // ④ 报告落点只许是那一个（写歪了就不是"唯一权威"了）
  if (payload?.report !== null && typeof payload?.report === 'object' && payload.report.memory_update !== undefined && payload.report.memory_update !== null) {
    const want = S.reportRelPath(day)
    const got = String(payload.report.memory_update).replace(/\\/g, '/')
    if (got !== want) throw cliError('E_ARG_SCHEMA', `report.memory_update 只许是 ${want}，实得 ${got}`)
  }

  // ⑤ 维护案裁决：斩杀的资格只看**已发布 N 的那两个字段**（D-B4，绝不进程内重算）
  const decisions = payload?.maintenance_decisions === undefined || payload?.maintenance_decisions === null ? [] : payload.maintenance_decisions
  if (!Array.isArray(decisions)) throw cliError('E_ARG_SCHEMA', 'maintenance_decisions 必须是数组')
  for (const decision of decisions) {
    if (decision === null || typeof decision !== 'object') throw cliError('E_ARG_SCHEMA', 'maintenance_decisions 的每一项必须是对象')
    const action = decision.action ?? null
    if (action === null) continue
    if (!['cull', 'retire', 'merge', 'modify', 'retag'].includes(action)) {
      throw cliError('E_ARG_SCHEMA', `未知的维护动作：${JSON.stringify(action)}`)
    }
    const target = (base.snapshot.entries ?? []).find((e) => e?.id === decision.target_id)
    if (action === 'cull') {
      if (!target || !isCullEligible(target)) {
        throw cliError('E_STREAK_NOT_ELIGIBLE', `斩杀目标 ${decision.target_id} 不在 N 的资格集合里（要 is_double_low 且连续双低 K=3）`)
      }
    } else if (!target) {
      throw cliError('E_OP_INVALID', `维护目标 ${decision.target_id} 不在基准快照 ${baseVersion} 里`)
    }
  }

  // ⑥ 容量与 op 形状：权威是 `capacityVerdict`（本模块只在它放行之后才落地）
  const ops = payload?.entries_patch === undefined || payload?.entries_patch === null ? [] : payload.entries_patch
  if (!Array.isArray(ops)) throw cliError('E_ARG_SCHEMA', 'entries_patch 必须是数组')
  const verdict = capacityVerdict(base.snapshot.entries ?? [], ops)
  if (!verdict.ok) {
    const code = verdict.rejectCode === 'E_CAP_COUNT' || verdict.rejectCode === 'E_CAP_CHARS' || verdict.rejectCode === 'E_OP_INVALID'
      ? verdict.rejectCode
      : 'E_ARG_SCHEMA'
    throw cliError(code, `判决被拒：${verdict.reason}`)
  }
  const patched = SNAP.applyEntriesPatch(base.snapshot.entries ?? [], ops)
  SNAP.assertPatchMatchesVerdict(patched, verdict)

  // ⑦ 发布（事务）
  const archived = [...(base.snapshot.archived ?? [])]
  for (const op of ops) {
    if (op.kind === 'retire' || op.kind === 'cull') archived.push({ entry_id: op.id, disposition: op.kind === 'cull' ? 'culled' : 'retired', to: null })
    if (op.kind === 'merge') for (const id of op.ids ?? []) archived.push({ entry_id: id, disposition: 'merged', to: op.entry?.id ?? null })
  }
  const version = SNAP.nextVersion(current.ok ? current.version : 'v0')
  for (const row of archived) if (row.to === null && row.disposition !== 'merged') row.to = version

  const snapshot = SNAP.buildSnapshot({
    version,
    parentVersion: baseVersion,
    entries: patched,
    commonSenseSha256: cs.sha256,
    acceptedProposalIds: Array.isArray(payload?.accepted) ? payload.accepted : [],
    acceptedMaintenanceIds: decisions.map((d) => d?.target_id).filter((id) => typeof id === 'string'),
    archived,
    generatedAt: at,
  })
  const report = SNAP.reportOf(snapshot, { day, baseSnapshot: baseVersion, maintenanceDecisions: decisions, generatedAt: at })
  const nextState = {
    ...state,
    phase: 'awaiting_review_start',
    snapshot_available: true,
    snapshot_ready_at: at,
    base_snapshot: baseVersion,
    new_snapshot: version,
    reports: { memory_update: S.reportRelPath(day) },
    last_liveness_event_at: at,
    failure_reason: null,
  }
  const published = SNAP.publishUpdate(root, { snapshot, report, day, nextState })
  S.appendAudit(root, {
    kind: 'judge-commit',
    detail: { day, generation: state.generation, attempt: state.judge_attempt, base_snapshot: baseVersion, new_snapshot: version, count: snapshot.totals.count, chars: snapshot.totals.chars },
    at,
  })
  // ⑧ 「已判」索引（T-MEM-07）：**只在这里写** —— 上面那七道拒绝与整段事务都在这一行之前返回，
  //    所以 `judged.jsonl` 只可能跟着一次**真成功**的提交长行（V8 的判据就是这个次序）。
  const judgedSpecs = judgedRowSpecsOf({ state, accepted: payload?.accepted, day, snapshot: version, at })
  if (judgedSpecs.length > 0) {
    try {
      PROP.appendJudgedRows(root, judgedSpecs)
    } catch (err) {
      // 已发布的快照 / 报告 / 状态**不回滚**（`publishUpdate` 已经落盘）—— 报文必须把这件事说明白，
      // 否则下一个人会以为"报错了 = 什么都没发生"。
      throw cliError('E_TXN_IO', `快照 ${version} 已发布、索引未追加（${err?.code ?? 'UNKNOWN'}：${String(err?.message ?? err)}）—— 已发布的事务不回滚`, { path: S.judgedPath(root), snapshot: version })
    }
  }
  return {
    new_snapshot: version,
    base_snapshot: baseVersion,
    report_path: published.report_path,
    snapshot_path: published.snapshot_path,
    snapshot_available: true,
    phase: nextState.phase,
    distribution: snapshot.distribution,
    totals: snapshot.totals,
  }
}

/**
 * 一串行里出现过的 `imported_id`，**按行顺序去重**（首次出现的位置留下）。
 * 池子理论上不该有重复 id，但判据不许假设它没有（契约 §3.3）。
 */
function uniqueIdsOf(records) {
  const seen = new Set()
  const out = []
  for (const record of Array.isArray(records) ? records : []) {
    const id = record?.imported_id
    if (typeof id !== 'string' || id === '') continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * 这一轮该往「已判」索引写哪几行（**纯函数**，不写盘；形状见契约 §2.2/§2.3）。
 *
 * 行集合 = 本轮冻结清单（`state.frozen_proposal_ids`，按它的顺序）
 *          + `payload.accepted` 里不在清单里的 id（按 accepted 的顺序排在后面），
 * 同一个 id 只出一行（首次出现的位置）。`verdict = accepted` ⇔ id ∈ `payload.accepted`。
 *
 * 为什么必须补上 `payload.accepted` 那一段：报告的 `accepted_proposal_ids` 直接取自它
 * （`lib/snapshot.mjs::buildSnapshot`）—— 不补，"索引 = 报告的派生"就不是恒等式（V9）。
 * 维护案的 `target_id` 是**快照条目 id**（`m-…`），不是池子 id ⇒ 一个都不记（记了会全变孤儿）。
 */
function judgedRowSpecsOf({ state, accepted, day, snapshot, at }) {
  const acceptedIds = new Set(Array.isArray(accepted) ? accepted.filter((id) => typeof id === 'string' && id !== '') : [])
  const frozen = Array.isArray(state?.frozen_proposal_ids) ? state.frozen_proposal_ids : []
  const ids = uniqueIdsOf([...frozen, ...(Array.isArray(accepted) ? accepted : [])].map((id) => ({ imported_id: id })))
  return ids.map((importedId) => ({
    schema: PROP.JUDGED_SCHEMA,
    imported_id: importedId,
    day,
    verdict: acceptedIds.has(importedId) ? 'accepted' : 'rejected',
    snapshot,
    generation: state.generation,
    attempt: state.judge_attempt,
    at,
  }))
}

/**
 * `judge-pending`：**机械算「池子 − 已判」**（T-MEM-07）—— "还有哪些候选没判过"一条命令能查。
 *
 * 只读（`writes: false`）：不写池子、不写索引、不推状态、**不落审计**。
 * 语义与出参见契约 §3.3 / §3.4，四个边界是刻意写死的：
 *   · **顺序 = 池子行的 `seq` 数值升序**（稳定：`seq` 相同就保持文件行序）；同一个 `imported_id`
 *     只出一次，位置取 `seq` 最小的那一次出现；`seq` 并列（含都认不出）时取**文件行序在前**的那一次。
 *     这一次序**真排**，不拿"文件行序"顶替：池子**只由 `appendProposal` 写**时两者确实同序，
 *     但**手改过的池子会让它们分叉**（契约 §3.3 亲口认这来历）—— 而"按文件行序出"的判据
 *     只能从同一份文件的行序推期望值，那种判据**永远红不了 = 自证**。
 *   · ⚠️ `seq` **可能是字符串**（老数据 / 手改的池子）：比较前一律过 `Number()`，绝不拿字符串比
 *     （`'10' < '9'` 会为真，那样 10 会排到 9 前面）。
 *   · ⚠️ **`seq` 缺失、或不是有限数的行不丢**：排在所有有效 `seq` **之后**，彼此保持文件行序。
 *     两条理由：① 这个 op 的全部职责就是"把还没判过的一条不漏地说出来"，静默少一条等于谎报池子内容；
 *     ② 契约 §3.5 的错误面里没有"某行 `seq` 坏"这一格（它只管"不是合法 JSON"），
 *     在这里抛错等于让一个只读查询整体不可用 —— 而缺 `seq` 恰恰是手改最可能留下的形状。
 *     放**末尾**而不放开头：那是"位置未知"的自然位置，也不会让它们冒充"最早的一批"挤到已知序号之前。
 *   · **孤儿不静默**：索引里有、池子里没有的 id 进 `orphan_ids`（按索引行顺序去重）+ `orphan_count`，
 *     照常 exit 0 —— 池子被换过 / 索引来自另一个根 / 有人手改，哪一种都要说出来，不许吞掉；
 *   · **两个文件都不存在不是错误**（根上还没导入过任何候选）⇒ `pending_ids: []` / `count: 0`；
 *   · 🔴 **输出里没有任何时钟字段** —— 同一份输入两次跑必须逐字节相同（V1 的稳定口径）。
 * 坏行一律整体拒（`E_DATA_CORRUPT`），**不跳过坏行再算**。
 */
function opJudgePending({ root }) {
  const pool = PROP.readPool(root)
  if (!pool.ok) throw cliError(pool.code, pool.message, { path: pool.path })
  const judged = PROP.readJudged(root)
  if (!judged.ok) throw cliError(judged.code, judged.message, { path: judged.path })

  // 一行的排序键 = `seq` 的**数值**（`'3'` 与 `3` 同键）；认不出的一律 `+∞`（排在末尾，不丢）。
  const seqKeyOf = (record) => {
    const raw = record?.seq
    const num = typeof raw === 'number'
      ? raw
      : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN)
    return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY
  }
  // 稳定排序：键相同（含两个都认不出）就按原下标 ⇒ 保持文件行序。写死下标比较，
  // 不依赖引擎 `sort` 的稳定性（换引擎、换形状都不会悄悄变次序）。
  const orderedPoolEntries = pool.entries
    .map((entry, index) => ({ entry, index, key: seqKeyOf(entry) }))
    .sort((a, b) => (a.key === b.key ? a.index - b.index : a.key < b.key ? -1 : 1))
    .map((decorated) => decorated.entry)
  const poolIds = uniqueIdsOf(orderedPoolEntries)
  const judgedIds = uniqueIdsOf(judged.rows)
  const judgedSet = new Set(judgedIds)
  const poolSet = new Set(poolIds)
  const pendingIds = poolIds.filter((id) => !judgedSet.has(id))
  const orphanIds = judgedIds.filter((id) => !poolSet.has(id))
  return {
    pending_ids: pendingIds,
    count: pendingIds.length,
    // `pool_count` / `judged_rows` 是**行数**，`judged_ids` 是**去重后的 id 数** —— 两者不许混着用。
    pool_count: pool.entries.length,
    judged_rows: judged.rows.length,
    judged_ids: judgedIds.length,
    orphan_ids: orphanIds,
    orphan_count: orphanIds.length,
  }
}

/**
 * `review-start`：快照已发布、开一场记忆复核（phase 只能从 `awaiting_review_start` 进 `reviewing`）。
 * 它是**本地两场评审之前**的那一场，产物落脑侧（维护候选由组长 append-only 导入）。
 */
function opReviewStart({ root, payload }) {
  const at = S.nowIso()
  const { day } = S.resolveDay(root, payload?.day)
  const state = mustState(root, day)
  if (payload?.generation !== undefined && payload.generation !== state.generation) {
    throw cliError('E_CAS_STALE', `generation=${payload.generation} 与当前那一轮（${state.generation}）不符`)
  }
  if (!['awaiting_review_start', 'reviewing'].includes(state.phase)) {
    throw cliError('E_STATE_PHASE', `phase=${state.phase} 不允许起复核（要 awaiting_review_start）`)
  }
  const reviewAttempt = Number.isInteger(payload?.review_attempt) ? payload.review_attempt : state.review_attempt + 1
  if (reviewAttempt !== state.review_attempt + 1) {
    throw cliError('E_CAS_STALE', `review_attempt=${reviewAttempt} 不是下一轮（${state.review_attempt + 1}）`)
  }
  const jobId = requireString(payload?.job_id, 'job_id')
  const job = S.newJobRecord({
    jobId,
    role: 'memory-review',
    attempt: reviewAttempt,
    generation: state.generation,
    parentSessionId: state.owner_session,
    parentState: 'alive',
    state: 'running',
    at,
  })
  S.writeJob(root, job)
  const next = { ...state, phase: 'reviewing', review_attempt: reviewAttempt, last_liveness_event_at: at }
  S.writeUpdateState(root, day, next)
  S.appendAudit(root, { kind: 'review-start', detail: { day, generation: state.generation, review_attempt: reviewAttempt, job_id: jobId }, at })
  return { review_job_id: jobId, phase: next.phase, review_attempt: reviewAttempt, job_path: S.jobPath(root, jobId), day }
}

/** `job-mark`：作业结果落库（**只前进**liveness；失败把原因写进状态，下一任 owner 看得见）。 */
function opJobMark({ root, payload }) {
  const at = S.nowIso()
  const jobId = requireString(payload?.job_id, 'job_id')
  const read = S.readJob(root, jobId)
  if (!read.ok) throw cliError(read.code === 'E_DATA_MISSING' ? 'E_JOB_UNKNOWN' : read.code, `作业记录读不到：${read.message}`, { path: read.path, job_id: jobId })
  const job = read.job
  const stateWanted = requireString(payload?.state, 'state')
  if (!['done', 'failed'].includes(stateWanted)) throw cliError('E_ARG_SCHEMA', `job-mark 的 state 只许 done / failed，实得 ${JSON.stringify(stateWanted)}`)
  if (typeof payload?.job === 'string' && payload.job.trim() !== '') {
    const role = S.ROLE_ALIASES[payload.job.trim()]
    if (role === undefined) throw cliError('E_ARG_SCHEMA', `不认识的角色简称：${JSON.stringify(payload.job)}`)
    if (role !== job.role) throw cliError('E_JOB_FENCE_STALE', `作业 ${jobId} 的角色是 ${job.role}，调用方写的是 ${role}`)
  }
  const attempt = job.attempt
  const generation = job.generation
  const nextJob = {
    ...job,
    state: stateWanted,
    finished_at: at,
    result_path: payload?.result_path === undefined ? job.result_path : payload.result_path,
    failure_reason: stateWanted === 'failed' ? (payload?.failure_reason ?? job.failure_reason ?? null) : null,
    exit_code: Number.isInteger(payload?.exit_code) ? payload.exit_code : null,
    last_liveness_event_at: at,
  }
  // liveness 只前进（迟到的完成事件不许把时间戳往回写）
  if (typeof job.last_liveness_event_at === 'string' && Date.parse(job.last_liveness_event_at) > Date.parse(at)) {
    nextJob.last_liveness_event_at = job.last_liveness_event_at
  }
  S.writeJob(root, nextJob)

  const { day } = S.resolveDay(root, payload?.day)
  const stateRead = S.readUpdateState(root, day)
  if (stateRead.ok) {
    const state = stateRead.state
    const next = { ...state, last_liveness_event_at: at }
    if (job.role === 'memory-judge' && generation === state.generation && attempt === state.judge_attempt) {
      if (stateWanted === 'failed') {
        next.phase = 'failed'
        next.failure_reason = nextJob.failure_reason
        next.finished_at = at
      } else if (state.phase === 'judging') {
        next.phase = 'unclaimed' // 判决跑完了但还没提交：回到"这一天还没定"，提交那一步才推 phase
      }
    }
    if (next.phase === 'judging' && next.snapshot_available === true) next.snapshot_available = false
    S.writeUpdateState(root, day, next)
  }
  S.appendAudit(root, { kind: 'job-mark', detail: { job_id: jobId, role: job.role, state: stateWanted, generation, attempt }, at })
  return { job_state: nextJob.state, last_liveness_event_at: nextJob.last_liveness_event_at, job_path: read.path, day }
}

function opAuditAppend({ root, payload }) {
  const at = S.nowIso()
  const kind = requireString(payload?.kind, 'kind')
  const detail = payload?.detail === undefined || payload?.detail === null ? {} : payload.detail
  if (typeof detail !== 'object' || Array.isArray(detail)) throw cliError('E_ARG_SCHEMA', 'detail 必须是对象')
  const written = S.appendAudit(root, { kind, detail, at })
  return { audit_path: written.audit_path, seq: written.seq, next_sha256: written.next_sha256 }
}

/** `snapshot-archive`：**只记去向，不动本体**（旧快照永远只读 —— MEM-09）。 */
function opSnapshotArchive({ root, payload }) {
  const at = S.nowIso()
  const version = requireString(payload?.version, 'version')
  const reason = requireString(payload?.reason, 'reason')
  const archived = SNAP.archiveSnapshot(root, version, reason, at)
  if (!archived.ok) throw cliError(archived.code, archived.message, { path: archived.archive_path })
  S.appendAudit(root, { kind: 'snapshot-archive', detail: { version, reason, archive_path: archived.archive_path }, at })
  return { archive_path: archived.archive_path, version, snapshot_unchanged: true, archive: archived.record }
}

function opCsConfirm({ root, payload }) {
  const at = S.nowIso()
  const sha256 = requireString(payload?.sha256, 'sha256')
  const written = S.writeCommonSenseConfirmation(root, {
    sha256,
    confirmedBy: typeof payload?.confirmed_by === 'string' && payload.confirmed_by.trim() !== '' ? payload.confirmed_by : 'boss',
    confirmedAt: typeof payload?.confirmed_at === 'string' && payload.confirmed_at.trim() !== '' ? payload.confirmed_at : at,
  })
  S.appendAudit(root, { kind: 'cs-confirm', detail: { common_sense_sha256: written.common_sense_sha256, confirmed_by: payload?.confirmed_by ?? 'boss' }, at })
  return { common_sense_sha256: written.common_sense_sha256, record_path: written.path }
}

// ── op：候选导入 ───────────────────────────────────────────────────────────
function importOp({ root, payload, kind }) {
  const at = S.nowIso()
  const { day } = S.resolveDay(root, payload?.day)
  const stateRead = S.readUpdateState(root, day)
  if (!stateRead.ok && stateRead.code !== 'E_DATA_MISSING') throw cliError(stateRead.code, stateRead.message, { path: stateRead.path })
  const state = stateRead.ok ? stateRead.state : null
  const pool = PROP.readPool(root)
  if (!pool.ok) throw cliError(pool.code, pool.message, { path: pool.path })
  const verdict = PROP.importVerdict({
    payload,
    state,
    poolEntries: pool.entries,
    existingVersions: SNAP.listVersions(root),
    kind,
  })
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  const appended = PROP.appendProposal(root, {
    kind,
    source: payload.source,
    sha256: payload.sha256,
    contentSha256: verdict.contentSha256,
    baseSnapshot: payload.base_snapshot,
    updateGeneration: payload.update_generation,
    reviewAttempt: payload.review_attempt,
    payload: payload.payload,
    day,
    at,
  })
  S.appendAudit(root, { kind: `${kind}-import`, detail: { imported_id: appended.imported_id, source: payload.source, base_snapshot: payload.base_snapshot, update_generation: payload.update_generation, review_attempt: payload.review_attempt }, at })
  return { imported_id: appended.imported_id, imported_at: appended.imported_at, pool_path: appended.path, seq: appended.seq, day }
}

const opProposalImport = (ctx) => importOp({ ...ctx, kind: 'proposal' })

/** `maintenance-import`：维护案不受"普通提案只许 add/modify"那条白名单约束（它本来就干这个）。 */
const opMaintenanceImport = (ctx) => importOp({ ...ctx, kind: 'maintenance' })

// ── op：brain-health（判定住在 lib/health.mjs；这里只做薄调用）──────────────
/**
 * 判一份 brain-health。**入参形状**（提案 §B1.4 + 追加裁定 v1.12 **C-1** 冻结）：
 *
 * ```
 * { project, day, now, leases:{update,local},
 *   state,    // <dataRoot>/state/update/<day>.json          缺 ⇒ null
 *   snapshot, // <dataRoot>/memory/snapshots/<current>.json   缺 ⇒ null
 *   report,   // <dataRoot>/reports/memory-update/<day>.json（由 readReport 派生；缺 ⇒ 由 snapshot 现算）
 *   local,    // <WS>/state/local/<day>.json                  缺 ⇒ null
 *   receipt,  // <WS>/leader/<day>/技术复盘回执.json           缺 ⇒ null
 *   daily,    // <WS>/state/daily/<day>.json                  缺 ⇒ null
 *   route,    // <WS>/route/current.json                      缺 ⇒ null
 *   reads }   // 每个来源的 {ok, code, path} —— 判红要给得出处
 * ```
 *
 * 判定（红/绿/在跑/挂起 + 每条 reason）全在 `lib/health.mjs`；这里只负责把盘上那几份读出来、
 * 把未关闭的采纳票算出来（B3.3：那件事**不许**被"技术复盘完成"盖住），再把派生卡落盘。
 */
function opHealthRead({ root, args, payload }) {
  const ws = resolveWorkspace(args, payload)
  const { day } = S.resolveDay(root, payload?.day)
  const project = typeof payload?.project === 'string' && payload.project.trim() !== '' ? payload.project : null
  const at = S.nowIso()

  const readJsonAt = (file) => {
    if (!existsSync(file)) return { ok: false, code: 'E_DATA_MISSING', value: null, path: file }
    try {
      return { ok: true, code: null, value: JSON.parse(readFileSync(file, 'utf8')), path: file }
    } catch (err) {
      return { ok: false, code: 'E_DATA_CORRUPT', value: null, path: file, message: String(err?.message ?? err).slice(0, 120) }
    }
  }
  const localRead = readJsonAt(path.join(ws, '.team', 'state', 'local', `${day}.json`))
  const receiptRead = readJsonAt(path.join(ws, '.team', 'leader', day, '技术复盘回执.json'))
  const dailyRead = readJsonAt(path.join(ws, '.team', 'state', 'daily', `${day}.json`))
  const routeRead = readJsonAt(path.join(ws, '.team', 'route', 'current.json'))
  const stateRead = S.readUpdateState(root, day)
  const snapshotRead = SNAP.readCurrentSnapshot(root)
  const reportRead = SNAP.readReport(root, day)

  const route = routeRead.ok ? routeRead.value : null
  const openTickets = openAdoptedTicketIds(route?.tickets ?? [])
  const input = {
    project,
    day,
    now: at,
    leases: { update: LEASES.update, local: LEASES.local },
    state: stateRead.ok ? stateRead.state : null,
    snapshot: snapshotRead.ok ? snapshotRead.snapshot : null,
    // report 缺 ⇒ 由 snapshot 现算（C-1 逐字：**不是 null**）
    report: reportRead.ok ? reportRead.report : SNAP.reportOf(snapshotRead.ok ? snapshotRead.snapshot : null, { day }),
    local: localRead.ok ? localRead.value : null,
    receipt: receiptRead.ok ? receiptRead.value : null,
    daily: dailyRead.ok ? dailyRead.value : null,
    route,
    reads: {
      state: { ok: stateRead.ok, code: stateRead.code, path: stateRead.path },
      snapshot: { ok: snapshotRead.ok, code: snapshotRead.code, path: snapshotRead.path },
      report: { ok: reportRead.ok, code: reportRead.code, path: reportRead.path },
      local: { ok: localRead.ok, code: localRead.code, path: localRead.path },
      receipt: { ok: receiptRead.ok, code: receiptRead.code, path: receiptRead.path },
      daily: { ok: dailyRead.ok, code: dailyRead.code, path: dailyRead.path },
      route: { ok: routeRead.ok, code: routeRead.code, path: routeRead.path },
    },
    open_adopted_tickets: openTickets,
  }
  const verdict = healthVerdict(input)
  const healthFile = path.join(ws, '.team', 'brain', day, 'health.json')
  const health = buildHealthCard({
    input,
    verdict,
    extra: {
      open_adopted_tickets: openTickets,
      distribution: input.report?.distribution,
      health_path: healthFile,
    },
  })
  mkdirSync(path.dirname(healthFile), { recursive: true })
  const written = writeJsonAtomic(healthFile, health)
  if (!written.ok) throw cliError(written.code, `health.json 写入失败：${written.message}`, { path: healthFile })
  return { health, health_path: healthFile, workspace: ws, day, input_shape: Object.keys(input) }
}

// ── op：冻结会话包（`lib/packet.mjs` 的**入口**，不是第二份引擎）─────────────────────
/**
 * `session-packet`：给**哪一天 / 哪个窗口**，就在 `<工作区>/.team/retro/<day>/conversation-packet/`
 * 落一个冻结会话包，落完之后**自己再校验一遍**并把读数带回 stdout。
 *
 * 🔴 **本函数是壳。** 解帧 / 帧边界（子进程调 `.tools/asar-cli/zstd-frames.mjs`）/ 坏帧不留半包 /
 *    先分类后解压 / 原子改名 —— **全部**住在 `lib/packet.mjs::buildSessionPacket` 里（v1.5/v1.6 冻结）。
 *    这里**一行都不重写**：两份实现迟早解出两个不同的包，而"哪个才是评审看过的那一版"就再也说不清了。
 * 🔴 **源流目录一律只读。** 临时件落点照那个模块头部冻死的规则走（`outDir` 内的 token 格 /
 *    `AGENIA_SCRATCH_DIR`），**本文件不另选一格**，也不替它往源流目录里写任何东西
 *    （包括帧工具的 `--json-out` 与首帧那一段的切件）。
 *
 * 入参（`--in` 那份 JSON）：
 * ```
 * { day: "YYYY-MM-DD",                                  // 必填。抽屉日期 = 落点日期
 *   sources: [{session_id, project, file, last_event_at,   // 必填数组（v1.6 ②：空源也要显式给 []）
 *              window?,                                   // v1.7：可选的**单源裁剪窗口**
 *              human?}],                                  // v1.8：可选的**人话过滤**（true / false）
 *   project?: "…",              // 缺省 = 工作区目录名（`sources[].project` 拿它比 ⇒ 别的项目一律排除）
 *   now?: "ISO8601",            // 窗口**上界**；缺省 = 本机时钟（lib/clock.mjs）
 *   status_root?: "绝对路径",    // 路线在哪（`<它>/route/current.json`）；缺省 = `<工作区>/.team`
 *   exclude_session_ids?: ["…"] }  // 本次 / 历史评审自己的会话（v1.6 ② 的 `self_review` 那一类）
 * ```
 * 🔴 **v1.7（2026-10-15）：`sources[].window` 是这条源的可选裁剪窗口** —— 形状
 *    `{from?: ISO8601|null, to?: ISO8601}`，语义是"**只把这条流里落在这段窗口内的事件放进包**"。
 *    本 op **原文透传** `sources`（一个键都不碰）：判形状 / 与包窗口求交 / 逐行裁，
 *    全部住在 `lib/packet.mjs`（文件头追加裁定 v1.7 写明改了什么、什么没动）。
 *    ⇒ 一句话：**"换一个窗口"仍然是"换 `now` + 推进路线"**（`from` 的来路没变，v1.6 ①）；
 *    而 `sources[].window` 是调用方对**单条流**再加一道下界/上界，用来把"跨天的长流"切成一天。
 *    不给这个键 ⇒ 与 v1.6 逐字相同（向后兼容的判据在 `lib/packet.mjs` 文件头）。
 * 🔴 **v1.8（2026-10-16）：`sources[].human: true` = 这条源"只打人话"** —— 只留两类行：
 *    **老板的行**（`source.kind === 'user'`，**原样进包、一个字都不投影**）+
 *    **每个 turn 的最后一条 `assistant`**（**投影到 D 档**）。与 `window` **正交**（可以同时给）。
 *    不给 / 给 `false` ⇒ 与 v1.7 **逐字相同**。
 *    🔴🔴 **这是"保证的降级"**：v1.5~v1.7 那句"**包里的字节 = 流里的原样字节**"，
 *    在开了 `human` 的源上**不成立了** —— 降成两条：**① 每行的 `text` 段逐字等于原流里那一行的
 *    `text` 段**；**② 每行带 `seq` + `time` ⇒ 可回查**。语出组长 2026-10-15 的裁定
 *    （`.team/dev/2026-10-15/log.md` §32.7），**逐条写在 `lib/packet.mjs` 文件头 v1.8 那一节**。
 *    ⇒ 报告里说"包里有 16.8 M 字符"与"包里有 20 万字节"**不是同一件事**：人话包里，
 *    组长的行是投影，**引用包里的字节之前先知道这一条**。
 *    三条边界（照拍，不许重新想）：**未闭合 turn 不取**（账上写明）· **组长的行投影到 D 档** ·
 *    **没 text 的 turn 记 0 条、不占位**。账走返回值的 `human`（逐源 + 合计 + `projection`）。
 *    ⚠️ 操作纪律：**造包要在"会话空着"的时候**（别在对话进行中造包 —— 那会撞上"未闭合 turn"）。
 * ⚠️ 窗口的 `from` **不由本 op 决定**（v1.6 ①：取 `route/current.json` 里最近一次 review **完成事件**）。
 *    ⇒ "换一个窗口"= 换 `now` **加**让组长先推进路线；想凭一个参数改写 `from` 是做不到的，也不该做到。
 *
 * 返回值里三样是**必核读数**：包的落点 · manifest 必填字段齐不齐 · `validateSessionPacket` 的读数。
 *
 * 🔴 **工作区与落点由 `resolvePacketWorkspace()` 判**（`lib/paths.mjs::workspaceWriteVerdict`）：
 *    判的是"**我会写到哪里**"，不是"我在哪儿开工" —— 理由见那个函数上面的 🔴（工作区包住真实库是设计如此）。
 */
function opSessionPacket({ root, args, payload }) {
  const day = requireString(payload?.day, 'day')
  if (!S.isDayKey(day)) throw cliError('E_ARG_SCHEMA', `day 必须是 YYYY-MM-DD，实得 ${JSON.stringify(day)}`)
  // `sources` 是**必填数组**（v1.6 ②）：本 op 不替调用方去会话目录里"猜有哪些流" ——
  // 猜出来的源 id 与评审报告里写的那个必须逐字相同，猜错就是"评了别的会话还以为评了这一段"。
  const sources = payload?.sources
  if (!Array.isArray(sources)) {
    throw cliError('E_ARG_SCHEMA', 'sources 必填数组（v1.6 ②；空源请显式给 []）—— 本 op 不自己挑源会话')
  }
  // 工作区 + 包落点：**判据在 `lib/paths.mjs`，这里只把"落到哪一格"告诉它**。
  const { workspace: ws, target: outDir } = resolvePacketWorkspace(args, payload, path.join('.team', 'retro', day, 'conversation-packet'))
  const projectRaw = typeof payload?.project === 'string' ? payload.project.trim() : ''
  const project = projectRaw === '' ? path.basename(ws) : projectRaw
  const statusRootRaw = typeof payload?.status_root === 'string' ? payload.status_root.trim() : ''
  if (statusRootRaw !== '' && !/^[A-Za-z]:[\\/]/.test(statusRootRaw) && !/^\\\\/.test(statusRootRaw)) {
    throw cliError('E_ARG_SCHEMA', `status_root 给了就必须是绝对路径（相对路径会按 cwd 解析，那是个说不清的地方）：${statusRootRaw}`)
  }
  const statusRoot = statusRootRaw === '' ? path.join(ws, '.team') : path.resolve(statusRootRaw)
  const nowRaw = typeof payload?.now === 'string' ? payload.now.trim() : ''
  if (nowRaw !== '' && Number.isNaN(Date.parse(nowRaw))) {
    throw cliError('E_ARG_SCHEMA', `now 必须是 ISO8601（窗口上界），实得 ${JSON.stringify(payload.now)}`)
  }
  const excludeSessionIds = Array.isArray(payload?.exclude_session_ids) ? payload.exclude_session_ids.map(String) : []

  // ↓ 引擎在这儿。本文件只交三样东西：入参形状 / 落点 / 之后那一次校验。
  //   v1.7（2026-10-15）：`sources` 每项多一个**可选**的 `window: {from,to}`（裁剪窗口）——
  //   本文件**原文透传**（一个键都不删、不改名）：判形状、求交、逐行裁全在 `lib/packet.mjs` 里，
  //   这里只把引擎回来的那把账（`cropped`）记进 audit 与返回值 —— 因为那十个 manifest 字段不许动，
  //   盘上要能查到"这份包被裁过、裁掉了多少"。
  //   v1.8（2026-10-16）：`sources` 每项再多一个**可选**的 `human: true`（只打人话）—— 同样**原文透传**，
  //   同样只把账（`human`）带走。⚠️ 那把账里带着 **`projection`（含"保证降级"那句话）**：
  //   `manifest` 十个字段不许动 ⇒ **"这是投影版"这句话的落点就是 audit 与返回值**，别把它裁掉。
  const built = buildSessionPacket({
    project,
    outDir,
    statusRoot,
    now: nowRaw === '' ? undefined : nowRaw, // undefined ⇒ 走 lib/clock.mjs 的可注入时钟
    sources,
    excludeSessionIds,
  })

  const check = validateSessionPacket(built.dir)
  if (check.ok !== true) {
    // 走到这里说明"自己产的包没过自己的校验" —— 那是内部 bug，不许当成功报回去。
    throw cliError(check.code ?? 'E_INTERNAL', `包落盘之后再校验没过（${check.code ?? 'E_INTERNAL'}）：${JSON.stringify(check.problems).slice(0, 240)}`, { packet_dir: built.dir })
  }
  const manifest = check.manifest ?? {}
  const present = PACKET_MANIFEST_FIELDS.filter((key) => Object.hasOwn(manifest, key))
  const missing = PACKET_MANIFEST_FIELDS.filter((key) => !Object.hasOwn(manifest, key))

  const at = S.nowIso()
  const audit = S.appendAudit(root, {
    kind: 'session-packet',
    detail: {
      day,
      workspace: ws,
      packet_id: built.packet_id,
      packet_dir: built.dir,
      content_sha256: built.content_sha256,
      window: manifest.window ?? null,
      source_ids: manifest.source_ids ?? [],
      excluded: (manifest.excluded ?? []).map((item) => item?.session_id ?? null),
      validation_ok: check.ok === true,
      // v1.7：裁剪的账落在这里（manifest 那十个字段不能动）—— 没裁时恒为空数组。
      cropped: (built.cropped ?? []).map((item) => ({
        session_id: item.session_id,
        window: item.window,
        kept_events: item.kept_events,
        dropped_events: item.dropped_events,
        untimed_lines: item.untimed_lines,
        frames: item.frames,
      })),
      // v1.8：人话过滤的账（逐源 + 合计 + `projection`）。**一条都没开 ⇒ `null`**。
      // 🔴 `projection` 里那句"保证降级"必须原样带着：它是这份包"字节不再等于原流字节"的唯一书面凭据
      //   （manifest 十个字段不许动 ⇒ 它只能住在这儿）。
      human: built.human === null || built.human === undefined
        ? null
        : {
            projection: built.human.projection,
            sources: built.human.sources,
            totals: built.human.totals,
          },
    },
    at,
  })

  return {
    packet_dir: built.dir,
    packet_id: built.packet_id,
    manifest_path: built.manifest_path,
    content_sha256: built.content_sha256,
    frames: built.frames,
    excluded: built.excluded,
    // v1.7：裁剪的账（每源生效窗口 / 留了几条 / 丢了几条 / 几行没有时间戳 / 有贡献的帧数）。
    // 没给裁剪窗口时恒为 `[]` —— 旧调用方看到的东西一个字段都没变。
    cropped: built.cropped ?? [],
    // v1.8：人话过滤的账（`{projection, sources[], totals}`；`projection` 带**降级声明**）。
    // 一条源都没开 `human` ⇒ `null`。（`cropped` 给的是空数组、这里给的是 `null`：
    // "没裁"与"没筛"是两件事，用两种空值区分开 —— 免得把"没开"读成"筛完一条不剩"。）
    human: built.human ?? null,
    window: manifest.window ?? null,
    source_ids: manifest.source_ids ?? [],
    // 「manifest 必填字段齐不齐」这里给的是**字段表本身**的读数（表里有几个、缺哪几个），不另立一份名单。
    manifest_fields: { required: PACKET_MANIFEST_FIELDS.length, present: present.length, missing },
    validation: {
      ok: check.ok === true,
      code: check.code ?? null,
      problems: check.problems ?? [],
      content_sha256: check.content_sha256 ?? null,
    },
    audit: { seq: audit.seq, audit_path: audit.audit_path },
    workspace: ws,
    day,
    out_dir: outDir,
  }
}

// ── 入口 ───────────────────────────────────────────────────────────────────
const OPS = {
  init: opInit,
  'init-real': opInitReal,
  'state-read': opStateRead,
  'daily-start': opDailyStart,
  'claim-update': opClaimUpdate,
  'candidates-freeze': opCandidatesFreeze,
  'judge-start': opJudgeStart,
  'judge-commit': opJudgeCommit,
  'review-start': opReviewStart,
  'proposal-import': opProposalImport,
  'maintenance-import': opMaintenanceImport,
  'snapshot-read': opSnapshotRead,
  'snapshot-list': opSnapshotList,
  'entry-count': opEntryCount,
  'report-read': opReportRead,
  'health-read': opHealthRead,
  'job-mark': opJobMark,
  'audit-append': opAuditAppend,
  'snapshot-archive': opSnapshotArchive,
  'cs-confirm': opCsConfirm,
  'session-packet': opSessionPacket,
  'judge-pending': opJudgePending,
}

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
}

function main(argv) {
  let op = null
  try {
    const args = parseArgs(argv)
    op = args.op
    if (op === null || String(op).trim() === '') throw cliError('E_USAGE', `缺 --op；可用：${OP_NAMES.join(' / ')}`)
    if (op === 'help') {
      process.stderr.write(`agenia-brain.mjs 的 op 清单（${OP_NAMES.length} 个）：\n  ${OP_NAMES.join('\n  ')}\n`)
      emit({ ok: true, op: 'help', cli: CLI_NAME, ops: [...OP_NAMES] })
      return 0
    }
    if (!Object.hasOwn(OPS, op)) throw cliError('E_USAGE', `未知 op：${JSON.stringify(op)}；可用：${OP_NAMES.join(' / ')}`)
    // 🔴 **先读 payload、再做根判定**（2026-10-15 改的次序，理由只有一个）：
    //    "真实路线根"那一格要拿**这条 op 的工作区**去算（`lib/paths.mjs::realRootsFor`），
    //    而工作区可能住在 payload 里（`payload.workspace` 优先于 `--workspace`）——
    //    所以根判定之前必须先把 payload 读出来。
    //    ⚠️ 代价（照实写）：`--in` 那份文件坏掉时，现在会**先报 `E_ARG_USAGE`/`E_ARG_SCHEMA`**，
    //       而不是先报根的问题。两条都是非零退出 + 零写入，谁先谁后都不写盘。
    const payload = readPayload(args)
    // 根判定三档，次序是刻意的：
    //   ① 正面清单里的 op（`init-real`）⇒ 自己那套闸（还要求根必须不存在）；
    //   ② **显式给了 `--real-mode`** ⇒ 真实模式那道闸；
    //   ③ 其余一切（含**没给** `--real-mode` 的全部情形）⇒ 老的 `resolveRoot()`，
    //      **判定语义一个字不变**；唯一多出来的是"真实根那张表按本 op 的工作区算"。
    // ⇒ "老行为没退化"靠的是**根本没执行到新的那两支**，不是靠新函数里的某个判断。
    const guardWorkspace = guardWorkspaceOf(args, payload)
    const rootCtx = OPS_WITH_OWN_ROOT_GATE.includes(op)
      ? resolveInitReal(args)
      : (args.realMode === true ? resolveRealMode(args) : resolveRoot(args, { realRoots: realRootsFor(guardWorkspace) }))
    const { root } = rootCtx
    const out = OPS[op]({ root, args, payload, op })
    // 真实模式下：`writes:true` 的 op 成功之后**多落一条**审计（只读 op 不落 —— 它们不改变权威状态）。
    // 🔴 它写在 op 成功之后：失败的那一次已经被 op 自己的失败路径记过（或它压根没写盘），
    //    这里再记一条会让人误以为"写过一次"。
    let auditSuffix = null
    if (rootCtx.realMode === true && REAL_MODE_WRITE_OPS.includes(op)) {
      const audit = S.appendAudit(root, {
        kind: 'real-mode-write',
        detail: { op, data_root: root },
        at: S.nowIso(),
      })
      auditSuffix = { kind: 'real-mode-write', seq: audit.seq, audit_path: audit.audit_path }
    }
    emit({ ok: true, op, ...out, ...(auditSuffix === null ? {} : { real_mode_audit: auditSuffix }) })
    return 0
  } catch (err) {
    const code = typeof err?.code === 'string' && Object.hasOwn(CODES, err.code) ? err.code : 'E_INTERNAL'
    process.stderr.write(`[${CLI_NAME}] ${code} ${String(err?.message ?? err)}\n`)
    emit({ ok: false, op, error: { code, message: String(err?.message ?? err), details: err?.details ?? null } })
    return CODES[code].exit
  }
}

process.exitCode = main(process.argv.slice(2))
