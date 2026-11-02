#!/usr/bin/env node
/**
 * `agenia-route.mjs` —— 路线 updater（**唯一**能写 `.team/route/` 的入口）。
 *
 * 冻结依据：提案 §B1.3（文件名与落点）· §B1.4（**调用形状 / op 表 / 退出码**）·
 * §B1.5（纯函数接缝：判定全在 `lib/route.mjs` / `lib/tickets.mjs` / `lib/evidence.mjs` 里）·
 * §B3.3（票）· §B3.5（老板证据 + `transition_id` 回填）· §B3.7（原子写 / 锁 / CAS / 审计链）·
 * 追加裁定 A6（`transition_id` 由 updater 在**提议切换时**生成并回填 —— 调用方不预填）。
 *
 * 七条硬口径：
 *   ① **根逐次显式**：`--workspace` 必填（`--status-root` / `--data-root` 给了就一起校验），
 *      **没有 env 兜底、没有默认值**。省略 / 空串 / 相对 / UNC / C 盘 / 指真实根 / 越界
 *      / 测试模式下不带 marker —— 一律非零退出且**零写入**（判定顺序由 `lib/paths.mjs` 冻结）。
 *      `--status-root` 给的是 `.team` 那一层（不给就取 `<workspace>/.team`）；`--data-root`
 *      只**校验**：路线侧的写面永远是工作区，脑根一个字节都不许沾（DR-03 的分舱判据）。
 *   ② **stdout 恰好一行 JSON**：`{ok:true,…}` / `{ok:false,error:{code,message,details}}`；
 *      人话一律走 **stderr**（受限档 + 中文编码上出过事，见 `AGENTS.local.md` 八②）。
 *   ③ **退出码只从 `lib/error-codes.mjs` 来**：`ok ? 0 : CODES[code].exit`，本文件里没有第二份码表。
 *   ④ **写面全走 `lib/atomic.mjs`**：临时件同目录 → `fsync` → `rename`；锁是 `wx` 独占建的真锁，
 *      僵锁**不静默抢写**（要 `--force-recover`）；CAS 认 `version`，不符**绝不覆盖**。
 *   ⑤ **读-改-写全程持锁**；读面（read / verify / summarize）**不持锁、零写入**（连目录都不建）。
 *   ⑥ **审计链只增不改**：`prev_sha256 → next_sha256` + 版本 + 写入者 + 会话 + 时间；
 *      每一条成功的写命令**恰好追加一行**，被拒的命令**一行都不加**。
 *   ⑦ **"现在"只从 `lib/clock.mjs` 进**（`AGENIA_NOW_FILE` 优先），本文件里没有裸 `Date`。
 *
 * ⚠️ **`init` 对"空路线"是可重入的**（我定的口径，已报组长）：路线已经**用起来**
 *   （有任务 / 有票 / 有切换记录 / 审计里出现过不是 init 的 op）时再 `init` ⇒ `E_ROUTE_EXISTS`
 *   （不许把历史抹掉）；但一份**只有 init 留下的空壳**（RT-06 场景⑥ 就是拿它换一张图再走的）
 *   允许重来一次，版本**继续往上走**（不回退 —— 回退会让旧调用方的 CAS 重新生效，那是 ABA）。
 *
 * ⚠️ **CAS（`version` 严格相等）只用在 `stage-enter` 与 `task-set` 上**：提案 §B1.4 的 op 表
 *   只给这两个 op 列了 `E_CAS_STALE`。`stage-graph-set` / 票那几条不拿它当门（RT-05 的正例
 *   连着两次换图用同一版），版本对不上**在 stderr 报 WARN**、变更照写 —— **不静默**。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { CODES } from '../lib/error-codes.mjs'
import { dataRootVerdict, routeDirBindingVerdict, TEST_ROOT_MARKER, testModeOf } from '../lib/paths.mjs'
import { acquireLock, readJsonFile, releaseLock, writeFileAtomic, writeJsonAtomic } from '../lib/atomic.mjs'
import { now as clockNow } from '../lib/clock.mjs'
import { validateBossEvidence, spentEvidenceRecord } from '../lib/evidence.mjs'
import * as R from '../lib/route.mjs'
import * as T from '../lib/tickets.mjs'
import * as B from '../lib/bug-ledger.mjs'

const CLI_NAME = 'agenia-route.mjs'

/**
 * op 清单（顺序即 `--op help` 的打字顺序；与提案 §B1.4 那张表逐条一致）。
 *
 * 2026-11-01（任务 B · 契约 `.team/test/CONTRACT-B.md` §9.1）：**bug 系统九个 op 落在这一支 CLI 上**，
 * 不新造 `agenia-bug.mjs` —— 新 CLI 会连带 `install.mjs` / `release-scan` / `FROZEN.binFiles` /
 * `surfaceInventory` 四张清单同批动；而"登记不需要路线"用**写面边界**就能钉住
 * （bug op 只写 `.team/bug/` 与 `.team/routing.jsonl`，`bug-register` 之后 `.team/route/` 必须不存在）。
 *
 * 2026-11-01（任务 C1 · 契约 `.team/test/CONTRACT-C1.md` §9.1）：**三个新 op 落在同一支 CLI 上** ——
 * `bootstrap`（C1a 建账 + 迁移）· `route-mark`（C1d 暂停 / 恢复）· `headline-set`（C1b 补齐第一行）。
 * 理由同 B：新 CLI 要同批动四张清单；而这三个 op 的写面**只有** `.team/route/`（外加 bootstrap
 * 那一条为 observation 迁移写的 bug 台账窄例外）。
 */
const OP_NAMES = Object.freeze([
  'init', 'stage-graph-set', 'stage-enter', 'task-set',
  'bootstrap', 'route-mark', 'headline-set',
  'ticket-open', 'ticket-update', 'ticket-close', 'ticket-void',
  'read', 'verify', 'summarize',
  'bug-register', 'bug-assess', 'bug-dispose', 'bug-batch-freeze', 'bug-samples-register',
  'bug-archive', 'bug-task-set', 'bug-route', 'bug-read',
  'help',
])

/** 只读 op（不持锁、不建目录、零写入）。 */
const READ_OPS = Object.freeze(new Set(['read', 'verify', 'summarize']))

/** 落点名（分开写，别把 `.team` 与 `route` 拼成一个字符串常量）。 */
const TEAM_DIR_NAME = '.team'
const ROUTE_DIR_NAME = 'route'
const CURRENT_FILE = 'current.json'
const AUDIT_FILE = 'audit.jsonl'
const LOCK_FILE = '.route.lock'
const EVIDENCE_DIR_NAME = 'evidence'
const USED_KEYS_FILE = 'used-keys.json'
/**
 * bug 台账的落点（契约 §9.4）：**另一本账**，与 `.team/route/` 各一个目录。
 * 两本账不互串：bug op 只写 `.team/bug/`（`bug-route` 只写 `.team/routing.jsonl`），
 * `bug-read` 一个字节都不写（连目录都不建）。
 */
const BUG_DIR_NAME = 'bug'
const BUG_LEDGER_FILE = 'ledger.json'
const BUG_LOCK_FILE = '.bug.lock'
const ROUTING_FILE = 'routing.jsonl'
/**
 * legacy 票店的落点（契约 C1 §2.1 / §4.1）：**独立存储**，C1a 的**输入**，迁完清空不删。
 * 它既不是路线账本的一段、也不是 bug 台账的一段 —— 所以它自己一个目录。
 */
const LEGACY_DIR_NAME = 'tickets'
const LEGACY_STORE_FILE = 'legacy.json'

function cliError(code, message, details = null) {
  const err = new Error(message)
  err.name = 'RouteCliError'
  err.code = code
  err.details = details
  return err
}

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex')

/** 非空白字符串（与 `lib/route.mjs` 同一条判据；本文件里几个入参判定要它）。 */
const isFilledString = (v) => typeof v === 'string' && v.trim() !== ''

// ── 参数 ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { op: null, workspace: null, statusRoot: null, routeDir: null, dataRoot: null, inFile: null, testMode: false, forceRecover: false, unknown: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]
    const eq = raw.indexOf('=')
    const key = eq >= 0 ? raw.slice(0, eq) : raw
    const inline = eq >= 0 ? raw.slice(eq + 1) : null
    const take = () => (inline !== null ? inline : (argv[i + 1] !== undefined ? argv[(i += 1)] : null))
    switch (key) {
      case '--op': out.op = take(); break
      case '--workspace': out.workspace = take(); break
      case '--status-root': out.statusRoot = take(); break
      // gate4 复审 BC-03b：`--route-dir` 是**认得的**入参（以前它落进 `unknown` 被静默丢掉），
      // 但只认"由 `--workspace` 派生出来的那一格"；指别处 ⇒ `E_ROOT_OUTSIDE`（见 `routeDirBindingVerdict`）。
      case '--route-dir': out.routeDir = take(); break
      case '--data-root': out.dataRoot = take(); break
      case '--in': out.inFile = take(); break
      case '--test-mode': out.testMode = true; break
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

/**
 * 根判定 —— 每一条 op 都先过这一关（判定顺序由 `lib/paths.mjs` 冻结）。
 * `--status-root` 指 `.team` 那一层，它的 marker 允许长在**父目录**（工作区）上：
 * 那一层本来就是"这份工作区属于某次测试运行"的凭据。
 */
function resolveRoot(args, { label, raw, markerInParent = false, containingRule }) {
  const testMode = args.testMode === true || testModeOf({}, process.env)
  const runRoot = typeof process.env.AGENIA_TEST_RUN_ROOT === 'string' && process.env.AGENIA_TEST_RUN_ROOT.trim() !== ''
    ? process.env.AGENIA_TEST_RUN_ROOT
    : null
  let markerExists = false
  if (typeof raw === 'string' && /^[A-Za-z]:[\\/]/.test(raw)) {
    const probe = (dir) => {
      try { return statSync(path.join(dir, TEST_ROOT_MARKER)).isFile() } catch { return false }
    }
    markerExists = probe(raw) || (markerInParent && probe(path.dirname(path.resolve(raw))))
  }
  // `containingRule` 不喂 ⇒ 默认 `true`（照旧判"包住"）；**只有工作区那一档传 `false`** —— 见 `resolveWorkspace`。
  const verdict = dataRootVerdict(raw, { testMode, markerExists, mustBeUnder: testMode ? runRoot : null, containingRule })
  if (!verdict.ok) throw cliError(verdict.code, `${label}：${verdict.message}`)
  return verdict.root
}

function resolveWorkspace(args, payload) {
  const raw = typeof payload?.workspace === 'string' && payload.workspace.trim() !== '' ? payload.workspace : args.workspace
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw cliError('E_ARG_SCHEMA', '缺 --workspace（路线只写它下面；这里**没有** env 兜底，每次都要显式给）')
  }
  // 🔴 工作区不判"包住真实根"（恒自拒）—— 来历见 `lib/paths.mjs` 判定处那段注释。2026-10-16 加。
  return resolveRoot(args, { label: '--workspace', raw, containingRule: false })
}

function routePaths(workspace, statusRoot) {
  const teamDir = statusRoot === null ? path.join(workspace, TEAM_DIR_NAME) : statusRoot
  const routeDir = path.join(teamDir, ROUTE_DIR_NAME)
  return {
    workspace,
    teamDir,
    routeDir,
    current: path.join(routeDir, CURRENT_FILE),
    audit: path.join(routeDir, AUDIT_FILE),
    lock: path.join(routeDir, LOCK_FILE),
    evidenceDir: path.join(routeDir, EVIDENCE_DIR_NAME),
    usedKeys: path.join(routeDir, EVIDENCE_DIR_NAME, USED_KEYS_FILE),
    /** legacy 票店（C1a 的输入；独立存储，迁完清空不删）。 */
    legacyDir: path.join(teamDir, LEGACY_DIR_NAME),
    legacyStore: path.join(teamDir, LEGACY_DIR_NAME, LEGACY_STORE_FILE),
    /** bug 台账 —— **另一本账**（C1 只在 bootstrap 的 observation 迁移里写它）。 */
    bugDir: path.join(teamDir, BUG_DIR_NAME),
    bugLedger: path.join(teamDir, BUG_DIR_NAME, BUG_LEDGER_FILE),
  }
}

// ── 读面 ───────────────────────────────────────────────────────────────────
/** 读 current.json —— **缺**与**坏**分得开（缺 ⇒ `E_ROUTE_MISSING`，坏 ⇒ `E_ROUTE_HALF_WRITTEN`）。 */
function readCurrent(paths, { required = true } = {}) {
  if (!existsSync(paths.current)) {
    if (!required) return null
    throw cliError('E_ROUTE_MISSING', `路线还没初始化（没有 ${paths.current}）—— 先跑 --op init`)
  }
  let text = null
  try {
    text = readFileSync(paths.current, 'utf8')
  } catch (err) {
    throw cliError('E_TXN_IO', `current.json 读不到（${err?.code ?? 'UNKNOWN'}）：${paths.current}`)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw cliError('E_ROUTE_HALF_WRITTEN', `current.json 解析不开（原子写没走完？）：${String(err?.message).slice(0, 120)}`)
  }
}

/** 读审计链（只读，不建目录）。半截/非 JSON 的行一律报"链条不可信"。 */
function readAudit(paths) {
  if (!existsSync(paths.audit)) return { ok: false, code: 'E_ROUTE_TAMPERED', records: [], message: `审计文件不在：${paths.audit}（current.json 在，链就断在那儿）` }
  let text = null
  try {
    text = readFileSync(paths.audit, 'utf8')
  } catch (err) {
    return { ok: false, code: 'E_TXN_IO', records: [], message: `审计文件读不到（${err?.code ?? 'UNKNOWN'}）：${paths.audit}` }
  }
  const records = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      records.push(JSON.parse(line))
    } catch {
      return { ok: false, code: 'E_ROUTE_TAMPERED', records, message: `审计有一行不是 JSON：${line.slice(0, 120)}` }
    }
  }
  return { ok: true, code: null, records, message: '' }
}

/** 链条自洽 + 末端对得上盘上这份 current.json。 */
function chainVerdict(paths, records, currentSha) {
  if (records.length === 0) return { ok: false, code: 'E_ROUTE_TAMPERED', message: '审计链是空的，而 current.json 在 —— 这份 current 不是 updater 写的' }
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i]
    if (typeof rec?.next_sha256 !== 'string' || rec.next_sha256 === '') {
      return { ok: false, code: 'E_ROUTE_TAMPERED', message: `审计第 ${i + 1} 条没有 next_sha256` }
    }
    if (i === 0) {
      if (rec.prev_sha256 !== null && rec.prev_sha256 !== undefined) {
        return { ok: false, code: 'E_ROUTE_TAMPERED', message: `审计第一条的 prev_sha256 应当是 null，实得 ${JSON.stringify(rec.prev_sha256)}` }
      }
    } else if (records[i - 1].next_sha256 !== rec.prev_sha256) {
      return { ok: false, code: 'E_ROUTE_TAMPERED', message: `审计链在第 ${i + 1} 条断了：上一条 next_sha256=${records[i - 1].next_sha256}，这一条 prev_sha256=${JSON.stringify(rec.prev_sha256)}` }
    }
  }
  const tail = records[records.length - 1]
  if (String(tail.next_sha256).toUpperCase() !== String(currentSha).toUpperCase()) {
    return { ok: false, code: 'E_ROUTE_TAMPERED', message: `current.json 的 SHA 与审计末条的 next_sha256 对不上（盘上 ${currentSha}，链上 ${tail.next_sha256}）—— 有人绕过 updater 改过它` }
  }
  return { ok: true, code: null, message: '', tail }
}

/** 每次写之前都把链条核一遍（写面只认"链还在"的路线）。 */
function assertChain(paths, records) {
  const currentSha = sha256Hex(readFileSync(paths.current))
  const verdict = chainVerdict(paths, records, currentSha)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  return { currentSha, tail: verdict.tail }
}

/** 追加一行审计（**只增不改**）。`next_sha256` 是**将要落盘那份 current.json 的字节**的 SHA。 */
function appendAudit(paths, { op, at, detail, prevSha, nextSha, version, sessionId }) {
  const records = readAudit(paths).records ?? []
  const record = {
    schema: 1,
    seq: records.length + 1,
    at,
    op,
    kind: op,
    writer: 'agenia-route',
    session_id: sessionId ?? null,
    version,
    prev_sha256: prevSha,
    next_sha256: nextSha,
    detail: detail ?? {},
  }
  try {
    mkdirSync(path.dirname(paths.audit), { recursive: true })
    appendFileSync(paths.audit, `${JSON.stringify(record)}\n`, 'utf8')
  } catch (err) {
    throw cliError('E_TXN_IO', `审计追加失败（${err?.code ?? 'UNKNOWN'}）：${err?.message}`)
  }
  return record
}

/** 已用过的证据键（`evidence/used-keys.json`；不在 ⇒ 空清单）。 */
function readUsedKeys(paths) {
  if (!existsSync(paths.usedKeys)) return []
  const read = readJsonFile(paths.usedKeys)
  if (!read.ok) return []
  const keys = read.value?.keys
  return Array.isArray(keys) ? keys.map(String) : []
}

function appendUsedKey(paths, key, at) {
  const keys = readUsedKeys(paths)
  if (keys.includes(key)) return keys.length
  const next = [...keys, key]
  const written = writeJsonAtomic(paths.usedKeys, { schema: 1, keys: next, updated_at: at })
  if (!written.ok) throw cliError(written.code, `used-keys 写入失败：${written.message}`, { path: paths.usedKeys })
  return next.length
}

// ── 事务 ───────────────────────────────────────────────────────────────────
/**
 * 持锁跑一段读-改-写。**先抢锁再读**：锁外先读会让并发的两个写者都读到同一版，
 * 然后各写一遍（"写者不唯一"）—— 与 `bin/agenia-brain.mjs` 的 `claim-update` 同一条道理。
 *
 * 🔴 锁的 `at` 是**真实此刻**，不是领域时钟。两个钟量的是两件事：
 * - `lib/atomic.mjs` 的 `judgeLockOnce` 拿真实 `Date.now()` 减锁里的 `at` 判"过期没有"
 *   （`clockNow()` 的领域钟由 `AGENIA_NOW_FILE` 注入，可以和真实钟差几十小时）⇒
 *   锁里只要写领域钟，一个**活着的**持有者写下的锁在别的进程眼里就"早已过期"（`E_LOCK_STALE`）。
 * - 领域钟是**数据**的日期（审计 `at` / `updated_at` / `closed_at` / 票号），那些由调用方用，不进锁。
 * 同一件事 `lib/local-state.mjs` 的 `acquireDayLock` 也是这么写的（`at: new Date()`）。
 *
 * ⇒ 这个函数**不接领域时钟**（第三个参数只带 `op` 与 `sessionId`）：让它在作用域里根本拿不到
 * 那个值，比在函数体里少写一处更难写回错。
 */
function withLock(paths, args, { op, sessionId }, fn) {
  const acquired = acquireLock(paths.lock, { session_id: sessionId, purpose: `route:${op}` }, { forceRecover: args.forceRecover === true, at: new Date() })
  if (!acquired.ok) throw cliError(acquired.code, acquired.message, { path: paths.lock })
  try {
    return fn()
  } finally {
    releaseLock(paths.lock)
  }
}

/** CAS：调用方带的版本必须就是盘上这一版，否则**绝不覆盖**。 */
function casVerdict(current, want) {
  if (!Number.isInteger(want)) {
    throw cliError('E_ARG_SCHEMA', `version 必填（CAS：调用方手上是哪一版），实得 ${JSON.stringify(want)}`)
  }
  if (want !== current.version) {
    throw cliError('E_CAS_STALE', `带的是 version=${want}，盘上已经是 ${current.version} —— 绝不覆盖（重新 --op read 拿新版再来）`)
  }
}

/**
 * `task-set` 的 CAS —— 三档，**每一档都要出声**（契约 C1 §7.4 / 保守读法 §13）。
 *
 * 1. **不带 `version`** ⇒ 不拦，但 stderr 一行 WARN（`LED-03` 的调用形状就是不带；
 *    与 `stage-graph-set` 同一条既有写法：**不静默**）。CAS 是保护，不是必填字段。
 * 2. **带了、而且是盘上这一版** ⇒ 正常。
 * 3. **带了、版本旧了** ⇒ 只有当这次的 `tasks` / `current_task_id` **归一化之后与盘上逐字相同**
 *    （= 幂等重放，不可能丢更新）时才放行，并且 stderr 一行 WARN；**内容不同 ⇒ `E_CAS_STALE`**。
 *    这一档的理由：CAS 挡的是"丢更新"；同样的内容重放丢不了任何东西，而 `LED-02` 三节点那三发
 *    正是这种形状（节点只改审计 `detail.node`，任务段逐字不变）。
 */
function taskSetCasVerdict(current, payload, verdict) {
  const want = payload?.version
  if (want === undefined) {
    process.stderr.write(`[${CLI_NAME}] WARN task-set：这次没带 version（跳过 CAS；要严格比对就带上）—— 变更照写\n`)
    return 'absent'
  }
  if (!Number.isInteger(want)) {
    throw cliError('E_ARG_SCHEMA', `version 要么不写，要么是整数（CAS：调用方手上是哪一版），实得 ${JSON.stringify(want)}`)
  }
  if (want === current.version) return 'match'
  const sameTasks = JSON.stringify(verdict.tasks) === JSON.stringify(Array.isArray(current.tasks) ? current.tasks : [])
  const samePointer = (verdict.current_task_id ?? null) === (current.current_task_id ?? null)
  if (sameTasks && samePointer) {
    process.stderr.write(`[${CLI_NAME}] WARN task-set：带的是 version=${want}，盘上已经是 ${current.version}；但这次是**幂等重放**（任务段逐字相同）⇒ 照写\n`)
    return 'replay'
  }
  throw cliError('E_CAS_STALE', `带的是 version=${want}，盘上已经是 ${current.version} —— 绝不覆盖（重新 --op read 拿新版再来）`)
}

/** 落盘：字节先算哈希 ⇒ 原子写 ⇒ 用**同一份字节**的哈希追加审计。 */
function commitRoute(paths, { op, at, nextRoute, prevSha, sessionId, detail }) {
  const text = `${JSON.stringify(nextRoute, null, 2)}\n`
  const nextSha = sha256Hex(text)
  const written = writeFileAtomic(paths.current, text)
  if (!written.ok) throw cliError(written.code, `current.json 写入失败：${written.message}`, { path: paths.current })
  const record = appendAudit(paths, { op, at, detail, prevSha, nextSha, version: nextRoute.version, sessionId })
  return { sha256: nextSha, audit_seq: record.seq, audit_tail_sha256: record.next_sha256 }
}

// ── op：init ───────────────────────────────────────────────────────────────
function opInit(ctx) {
  const { paths, payload, at, args, sessionId } = ctx
  const graph = R.stageGraphVerdict(payload)
  if (!graph.ok) throw cliError(graph.code, graph.message)
  const existing = readCurrent(paths, { required: false })
  let prevSha = null
  if (existing !== null) {
    const audit = readAudit(paths)
    if (!audit.ok) throw cliError(audit.code, audit.message)
    prevSha = assertChain(paths, audit.records).currentSha
    if (!R.isPristineRoute(existing, { auditOps: audit.records.map((r) => r.op ?? r.kind ?? 'unknown') })) {
      throw cliError('E_ROUTE_EXISTS', `路线已经用起来了（任务 ${(existing.tasks ?? []).length} · 票 ${(existing.tickets ?? []).length} · 切换 ${(existing.transitions ?? []).length} · 审计里出现过 ${[...new Set(audit.records.map((r) => r.op))].join('/')}）—— init 不许抹掉历史`)
    }
  }
  const route = R.newRouteObject({ goal: graph.goal, stages: graph.stages, current_stage_id: graph.current_stage_id, at, version: (existing?.version ?? 0) + 1 })
  const out = commitRoute(paths, { op: 'init', at, nextRoute: route, prevSha, sessionId, detail: { goal: route.goal.id, stages: route.stages.map((s) => s.id), reinit: existing !== null } })
  return { version: route.version, sha256: out.sha256, reinit: existing !== null, audit_seq: out.audit_seq }
}

// ── op：stage-graph-set ────────────────────────────────────────────────────
function opStageGraphSet(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const current = readCurrent(paths)
  if (payload?.version !== undefined && !Number.isInteger(payload.version)) {
    throw cliError('E_ARG_SCHEMA', `version 要么不写，要么是整数，实得 ${JSON.stringify(payload.version)}`)
  }
  // 🔴 **这一条不拿 `version` 当门**（与 `stage-enter` / `task-set` 不同）：提案 §B1.4 的 op 表
  //    只给那两个 op 列了 `E_CAS_STALE`，`stage-graph-set` 那两格是 `E_STAGE_MULTI_CURRENT` / `E_ARG_SCHEMA`；
  //    而 RT-05 连着两次换图用的是**同一个版本**（循环外算好的）⇒ 拿了门就会把正例判红。
  //    但**不许静默**：版本对不上就在 stderr 说一句，变更照写（版本照样 +1、审计照样追加）。
  if (Number.isInteger(payload?.version) && payload.version !== current.version) {
    process.stderr.write(`[${CLI_NAME}] WARN stage-graph-set：带的是 version=${payload.version}，盘上是 ${current.version} —— 按 op 表这一条不拦，照写；要改成拦请组长裁定\n`)
  }
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const graph = R.stageGraphVerdict(payload, { goalFallback: current.goal })
  if (!graph.ok) throw cliError(graph.code, graph.message)
  // 换了图之后，任务不许变成"无主"（属的阶段没了）。
  const stageIds = new Set(graph.stages.map((s) => s.id))
  for (const task of current.tasks ?? []) {
    if (!stageIds.has(task.stage_id)) {
      throw cliError('E_TASK_STAGE_MISMATCH', `任务 ${task.id} 属的阶段 ${task.stage_id} 在新图里没了 —— 换图不许把任务扔在半空`)
    }
  }
  const pointer = current.current_task_id ?? null
  if (pointer !== null) {
    const hit = (current.tasks ?? []).find((t) => t.id === pointer)
    if (!hit || hit.stage_id !== graph.current_stage_id) {
      throw cliError('E_TASK_STAGE_MISMATCH', `当前任务 ${pointer} 不在新图的当前阶段 ${graph.current_stage_id} 里`)
    }
  }
  const next = {
    ...current,
    goal: graph.goal,
    stages: graph.stages,
    current_stage_id: graph.current_stage_id,
    version: current.version + 1,
    updated_at: at,
  }
  const out = commitRoute(paths, { op: 'stage-graph-set', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { stages: graph.stages.map((s) => s.id), current_stage_id: graph.current_stage_id } })
  return { version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

// ── op：stage-enter ────────────────────────────────────────────────────────
/**
 * 阶段切换 —— **只认老板证据**（§B3.5 七场景）。
 *
 * 判定顺序（顺序本身就是判据，RT-06 逐条钉着）：
 *   ① 入参形状 → ② **证据唯一性/绑定/转述/时间**（在阶段图之前 —— 复用的证据哪怕 to 不在图里也要报 USED）
 *   → ③ 阶段图（from=当前、to 在图里）→ ④ 当前阶段要老板批就必须有证据 → ⑤ exit_criteria
 *   → ⑥ **先停会话**（C1d，契约 §10.5）→ ⑦ 未结任务 → ⑧ 落盘（阶段证据 → used-keys → current.json + 审计）。
 *
 * 🔴 ⑥ 的位置是**钉死**的（契约 §10.5）：证据 / 阶段图 / 老板门槛 / `exit_criteria` **之后**、
 *    **未结任务（`E_TASKS_OPEN`）之前**。理由：有活会话的任务**正是**"先停会话再切阶段"要处理的那一个；
 *    让 `E_TASKS_OPEN` 先炸，读的人会去"收任务"，而真正要做的是"停会话"。
 *    过了闸之后那些任务写 `session_exit` + `status:'paused'`（`session_ref` 不清），
 *    然后未结任务**看得是打补丁之后的那一份**（`paused` 不再算未结）。
 */
function opStageEnter(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['from', 'to', 'exit_criteria_met', 'evidence', 'sessions', 'version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `stage-enter 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)

  const met = payload?.exit_criteria_met ?? []
  if (!Array.isArray(met)) throw cliError('E_ARG_SCHEMA', `exit_criteria_met 必须是数组，实得 ${JSON.stringify(met)}`)
  const sessions = payload?.sessions === undefined ? [] : payload.sessions
  if (!Array.isArray(sessions)) throw cliError('E_ARG_SCHEMA', `sessions 必须是数组（停会话的声明），实得 ${JSON.stringify(sessions)}`)

  // ② 证据本身（唯一性 / 绑定 / 转述 / 时间形状）。
  const evidence = payload?.evidence ?? null
  let key = null
  if (evidence !== null) {
    const verdict = validateBossEvidence(evidence, {
      transition: { from_stage_id: payload?.from, to_stage_id: payload?.to },
      usedEvidenceKeys: readUsedKeys(paths),
    })
    if (!verdict.ok) throw cliError(verdict.code, verdict.message, { evidence_key: verdict.key })
    key = verdict.key
  }

  // ③ 阶段图。
  const graph = R.stageEnterGraphVerdict(current, payload?.from, payload?.to)
  if (!graph.ok) throw cliError(graph.code, graph.message)

  // ④ 老板门槛：**只约束当前阶段的关闭**（下一阶段要不要批，与这一次无关 —— §B3.5 场景⑥）。
  if (graph.currentStage.boss_gate === 'approval_required' && evidence === null) {
    throw cliError('E_EVIDENCE_MISSING', `当前大阶段「${graph.currentStage.name}」要求老板批准才能收口，但没有 evidence —— 阶段切换只认老板证据`)
  }

  // ⑤ 退出条件。
  const criteria = R.exitCriteriaVerdict(graph.currentStage, met)
  if (!criteria.ok) throw cliError(criteria.code, criteria.message)

  // ⑥ 先停会话（C1d）：有活会话没声明 ⇒ 拒 + 零写入（"停不下来 ⇒ 切阶段失败"）。
  const live = R.liveSessionTasksVerdict(current.tasks, sessions, { code: 'E_STAGE_SESSION_LIVE', kindFilter: 'implement' })
  if (!live.ok) throw cliError(live.code, live.message)
  const tasks = R.applySessionExit(current.tasks, live.live, at)

  // ⑦ 未结任务（看**打过 session_exit 补丁**的那一份：`paused` 不算未结）。
  const openTasks = R.openTasksVerdict({ ...current, tasks })
  if (!openTasks.ok) throw cliError(openTasks.code, openTasks.message)

  // ⑧ 落盘：先补出 transition_id（**调用方不预填** —— A6），再写阶段证据、再改路线。
  // `transition_id` 里的日子是**那 8 位**：它从 `dayKeyOf` 派生（`dayDigitsOf`），
  // 不是把带连字符的整串塞进去 —— 已经发出去的 `tr-<YYYYMMDD>-<NN>` 不许换形状（契约 §13.1 末两条）。
  const dayKey = R.dayDigitsOf(at)
  const transitionId = R.transitionIdOf(dayKey, audit.records.filter((r) => r.op === 'stage-enter' || r.kind === 'stage-enter').length + 1)
  const evidencePath = path.join(paths.evidenceDir, `${transitionId}.json`)
  if (evidence !== null) {
    const record = spentEvidenceRecord(evidence, { transitionId, fromStageId: current.current_stage_id, toStageId: graph.nextStage.id, spentAt: at, key })
    const written = writeJsonAtomic(evidencePath, record)
    if (!written.ok) throw cliError(written.code, `阶段证据写入失败：${written.message}`, { path: evidencePath })
    try {
      appendUsedKey(paths, key, at)
    } catch (err) {
      throw cliError(err?.code ?? 'E_TXN_IO', `used-keys 写入失败：${err?.message}`, { path: paths.usedKeys })
    }
  }
  const entered = R.applyStageEnter(current, {
    to: graph.nextStage.id,
    at,
    transitionId,
    exitCriteriaMet: met,
    evidenceKey: key,
    evidencePath: evidence === null ? null : evidencePath,
  })
  // C1d：在途实现任务 `paused` + `session_exit`（`session_ref` 不清）；C1b：**刷新第一行**。
  const next = { ...entered, tasks, headline: R.headlineOf(entered).derived }
  const out = commitRoute(paths, {
    op: 'stage-enter', at, nextRoute: next, prevSha: currentSha, sessionId,
    detail: {
      transition_id: transitionId,
      from_stage_id: current.current_stage_id,
      to_stage_id: graph.nextStage.id,
      evidence_key: key,
      evidence_path: evidence === null ? null : evidencePath,
      sessions_stopped: live.live.map((t) => t.id),
    },
  })
  return {
    version: next.version,
    from: current.current_stage_id,
    to: graph.nextStage.id,
    transition_id: transitionId,
    evidence_key: key,
    evidence_path: evidence === null ? null : evidencePath,
    audit_seq: out.audit_seq,
    sha256: out.sha256,
  }
}

// ── op：task-set ───────────────────────────────────────────────────────────
/**
 * 路线任务 upsert（**两个创建入口之一**，另一个是 `bug-task-set`）。
 *
 * C1 之后这一支多了三件事（契约 `.team/test/CONTRACT-C1.md` §5 / §7.4）：
 *   ① **节点** `node ∈ NODE_MARKS` 只进审计 `detail.node`（**不是任务字段**；收工只落当天 `log.md`）；
 *   ② **新任务过 `admitTask`**（`tasks[]` 里 id 已存在的是**更新**，不再过准入 —— 否则
 *      "维护期不新收实现"会变成"维护期不许收尾"）；
 *   ③ 路线入口**不收 `bug-repair`**（不跨账：bug 修只从 bug 入口进）。
 *
 * 判定次序：形状（`taskSetVerdict`）→ CAS（`taskSetCasVerdict`）→ 准入（逐条新任务）。
 * 形状放在 CAS 之前，是因为"这条输入本身成不成形状"与"我手上是不是旧版本"是两个理由，
 * 而前者不依赖版本（`LED-03` 那两发都不带 version）。
 */
function opTaskSet(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const current = readCurrent(paths)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const verdict = R.taskSetVerdict(payload, current)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  taskSetCasVerdict(current, payload, verdict)

  const existingIds = new Set((current.tasks ?? []).map((t) => t?.id).filter((id) => typeof id === 'string'))
  const mode = R.modeOf(current)
  const headline = R.headlineOf(current).stored
  const pauseEntryIds = R.pauseSetOf(current.pauses).entry_ids
  for (const task of verdict.tasks) {
    if (existingIds.has(task.id)) continue // 更新不过准入（契约 §7.4）
    if (task.kind === 'bug-repair') {
      // 不跨账：bug 修只从 `bug-task-set` 进（那条路会把每条 entry 都过一遍 admitTask）。
      throw cliError('E_ADMIT_KIND', `任务 ${task.id} 是 bug-repair：路线入口一律不收（不跨账）—— 修 bug 走 --op bug-task-set（写 bug 台账）`)
    }
    const admit = R.admitTask({
      mode,
      kind: task.kind,
      entry_id: task.entry_id,
      headline,
      batch_entry_ids: [],
      pause_entry_ids: pauseEntryIds,
    })
    if (!admit.ok) throw cliError(admit.code, `任务 ${task.id}（${task.kind}）：${admit.message}`)
    // 票的修：票必须真的在票段里、不是 void（判在准入**之后** —— 期先说话，再说话就是形状）。
    if (task.kind === 'ticket-repair') {
      const repair = R.ticketRepairVerdict(task, current.tickets)
      if (!repair.ok) throw cliError(repair.code, repair.message)
    }
  }

  const next = {
    ...current,
    tasks: verdict.tasks,
    current_task_id: verdict.current_task_id,
    // ⑤ 任务做完**不自动**推进大阶段：这里一个字都不动 current_stage_id。
    // C1b：`headline` 也一个字都不动（第一行只随 `stage-enter` / `headline-set` 变）。
    version: current.version + 1,
    updated_at: at,
  }
  const detail = { tasks: verdict.tasks.length, current_task_id: verdict.current_task_id }
  if (verdict.node !== null) detail.node = verdict.node
  const out = commitRoute(paths, { op: 'task-set', at, nextRoute: next, prevSha: currentSha, sessionId, detail })
  return { version: next.version, sha256: out.sha256, audit_seq: out.audit_seq, tasks: verdict.tasks.length, node: verdict.node }
}

// ── op：bootstrap（C1a）────────────────────────────────────────────────────
/**
 * **建账**（契约 C1 §3 / §4；定形 §7 的 C1a 行）—— C1 只有一个入口 = 组长。
 *
 * 它 = **现有 ledger 代码的一次建账**（`stageGraphVerdict` → `newRouteObject` → `commitRoute`）：
 * 审计链、原子写、`version`、`verify` 全都照旧成立；不另写一套写盘。
 *
 * 六条硬口径：
 *   ① `kind` 带下去 ⇒ 建完 `mode = modeOf(账本)` 已经是 `build` / `maintain`（**不先进 build**）；
 *   ② **审计链恰好一条且 `op === 'bootstrap'`**，`transitions` 空 —— **不调 `stage-enter`**；
 *   ③ **不调 `admitTask`**：建账不是开任务，它不读 batch / pause set / headline；
 *   ④ **可重入**：第二次在"建过、且没被用过"的账上照样成功 —— 按票号去重，只补缺的那些；
 *      账**已经被用过**（有任务 / 有切换 / 审计里出现过别的 op）⇒ `E_ROUTE_EXISTS`（不许抹历史）；
 *   ⑤ **回滚 = 一个字节都不写**：legacy 票店坏了 ⇒ `E_LEGACY_STORE_BAD`，`current.json` 不出现、
 *      票店 sha256 不变。**先写路线、再清票店**（中途断掉只会"票还在票店"，下一次按票号去重）；
 *   ⑥ **legacy 票店不存在 ⇒ 如实报 `present:false` / `migrated:0`**，不凭空造一个（票店是输入，不是产物）。
 *
 * observation 迁移（§4.4）是 C1a 可以写 bug 台账的**唯一窄例外**：`kind=observation` 且还没有
 * disposition 的各转一张票；**台账不存在就什么都不做，也不创建 `.team/bug/`**（B1 的准入前提）。
 *
 * ⑦ **`version` 收下但不参与**（gate4 复审 BC-06 的"静默入参"那一格）：建账是一次性的 —— 它的写面
 *    从 `prevSha` 起一条**新链**，没有"盘上那一版"可比 ⇒ 不收 CAS。别按 `init` / `stage-enter` 那种
 *    "带就必须相等"去读它（要收紧就先改契约，别让调用方以为这一发比对过）。
 */
function opBootstrap(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['goal', 'stages', 'current_stage_id', 'version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `bootstrap 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const graph = R.stageGraphVerdict(payload)
  if (!graph.ok) throw cliError(graph.code, graph.message)

  // ① 已存在的账：**只许在"没用过"的账上重来**（半跑可续），用过了就不许抹历史。
  const existing = readCurrent(paths, { required: false })
  let prevSha = null
  if (existing !== null) {
    const audit = readAudit(paths)
    if (!audit.ok) throw cliError(audit.code, audit.message)
    prevSha = assertChain(paths, audit.records).currentSha
    const auditOps = audit.records.map((r) => r.op ?? r.kind ?? 'unknown')
    const usedTasks = (existing.tasks ?? []).length
    const usedTransitions = (existing.transitions ?? []).length
    const otherOps = [...new Set(auditOps.filter((op) => op !== 'bootstrap' && op !== 'init'))]
    if (usedTasks > 0 || usedTransitions > 0 || otherOps.length > 0) {
      throw cliError(
        'E_ROUTE_EXISTS',
        `账已经被用起来了（任务 ${usedTasks} · 阶段切换 ${usedTransitions} · 审计里出现过 ${otherOps.join('/') || '（只有建账）'}）`
          + ' —— bootstrap 不许抹掉历史（契约 C1 §3.2 第 5 条）',
      )
    }
  }

  // ② legacy 票店：**先判形状，再动任何字节**（坏 ⇒ 零写入回滚）。
  const storePresent = existsSync(paths.legacyStore)
  let store = null
  if (storePresent) {
    let text = null
    try {
      text = readFileSync(paths.legacyStore, 'utf8')
    } catch (err) {
      throw cliError('E_LEGACY_STORE_BAD', `legacy 票店读不出来（${err?.code ?? 'UNKNOWN'}）：${paths.legacyStore}`)
    }
    try {
      store = JSON.parse(text)
    } catch (err) {
      throw cliError('E_LEGACY_STORE_BAD', `legacy 票店解析不开（${String(err?.message).slice(0, 120)}）：${paths.legacyStore}`)
    }
    const verdict = R.legacyTicketVerdict(store)
    if (!verdict.ok) throw cliError(verdict.code, `${verdict.message}（${paths.legacyStore}）`)
  }
  const storeSource = store?.source ?? null

  // ③ bug 台账（observation 迁移的输入）：**不存在 ⇒ 什么都不做**，也绝不创建 `.team/bug/`。
  let ledger = null
  if (existsSync(paths.bugLedger)) {
    const read = readJsonFile(paths.bugLedger)
    if (!read.ok) throw cliError(read.code, `bug 台账读不出来：${read.message}`, { path: paths.bugLedger })
    const shape = B.bugLedgerShapeVerdict(read.value)
    if (!shape.ok) throw cliError(shape.code, shape.message, { path: paths.bugLedger })
    ledger = read.value
  }

  // ④ 路线：新账 / 半跑的账（**票号沿用**、去重、只补缺的；既有票一个字节不改）。
  const tickets = existing === null ? [] : [...(existing.tickets ?? [])]
  const knownIds = new Set(tickets.map((t) => t?.id))
  let already = 0
  let migrated = 0
  for (const t of storePresent ? store.tickets : []) {
    if (knownIds.has(t.id)) {
      already += 1
      continue
    }
    tickets.push(R.migratedTicketRecord({
      id: t.id,
      title: t.title,
      source: t.source,
      next_step: t.next_step,
      acceptance: t.acceptance,
      legacy_status: t.status,
      legacy_ref: storeSource,
      at,
      finding_refs: t.finding_refs,
      created_at: t.opened_at,
    }))
    knownIds.add(t.id)
    migrated += 1
  }

  // ⑤ observation 迁移（幂等：`disposition` 非空即算已关闭；票段里已有 legacy_ref 也不重复转）。
  const observation = { present: ledger !== null, migrated: 0, closed: 0 }
  let nextLedger = null
  if (ledger !== null) {
    const entries = ledger.entries.map((e) => (e !== null && typeof e === 'object' ? { ...e } : e))
    for (const [i, entry] of entries.entries()) {
      if (entry === null || typeof entry !== 'object') continue
      if (entry.kind !== 'observation') continue
      if (entry.disposition !== null && entry.disposition !== undefined) continue
      let ticket = tickets.find((t) => t?.legacy_ref === entry.id) ?? null
      if (ticket === null) {
        const id = T.nextTicketId(tickets, R.dayDigitsOf(at))
        ticket = R.migratedTicketRecord({
          id,
          title: `observation：${entry.phenomenon ?? entry.id}`,
          source: `legacy:observation:${entry.id}`,
          next_step: '建账迁移：未建账期的 quality finding 已转成票；按票的验收口径走',
          acceptance: '票的验收口径能翻面：修完绿、不修红',
          legacy_status: 'open',
          legacy_ref: entry.id,
          at,
          // gate4 复审 BC-03a：评审 finding → 票的载体要**跟着搬**（observation 条目上的 finding_refs）；
          // 不搬 ⇒ 「票的 finding_refs[] 能查到」这条 §6.2 判据在这条路上永远查不到。
          finding_refs: entry.finding_refs,
        })
        tickets.push(ticket)
        observation.migrated += 1
      }
      entries[i] = {
        ...entry,
        disposition: { value: 'deferred', reason: '建账迁移：quality finding 已转票', by: 'leader', at },
        migrated_ticket_id: ticket.id,
      }
      observation.closed += 1
    }
    if (observation.closed > 0) nextLedger = { ...ledger, entries }
  }

  // ⑥ 落盘：**先写路线、再清票店、最后写 bug 台账**（顺序是刻意的 —— 中途断掉只会"票还在票店"）。
  let next
  if (existing === null) {
    next = R.newRouteObject({ goal: graph.goal, stages: graph.stages, current_stage_id: graph.current_stage_id, at, version: 1 })
    next.tickets = tickets
  } else {
    // 半跑可续：**图不重写**（它是老板冻的东西），只补票段、刷新第一行。
    next = { ...existing, tickets, version: existing.version + 1, updated_at: at }
  }
  next.headline = R.headlineOf(next).derived
  const out = commitRoute(paths, {
    op: 'bootstrap',
    at,
    nextRoute: next,
    prevSha,
    sessionId,
    detail: {
      goal: next.goal.id,
      stages: next.stages.map((s) => s.id),
      current_stage_id: next.current_stage_id,
      kind: next.stages.find((s) => s.id === next.current_stage_id)?.kind ?? 'build',
      migrated,
      already,
      observation_migrated: observation.migrated,
      reinit: existing !== null,
    },
  })

  if (storePresent) {
    const cleared = { schema: 1, source: storeSource, tickets: [], migrated_at: at, migrated_to: 'route.tickets' }
    const written = writeJsonAtomic(paths.legacyStore, cleared)
    if (!written.ok) throw cliError(written.code, `legacy 票店清空失败：${written.message}`, { path: paths.legacyStore })
  }
  if (nextLedger !== null) {
    const written = writeJsonAtomic(paths.bugLedger, {
      ...nextLedger,
      version: (Number.isInteger(nextLedger.version) ? nextLedger.version : 0) + 1,
      updated_at: at,
    })
    if (!written.ok) throw cliError(written.code, `bug 台账写入失败（observation 迁移）：${written.message}`, { path: paths.bugLedger })
  }

  return {
    version: next.version,
    sha256: out.sha256,
    audit_seq: out.audit_seq,
    // `mode` 只是**读数**（派生值，账上不存）。
    mode: R.modeOf(next),
    headline: next.headline,
    legacy: {
      present: storePresent,
      store_path: `${TEAM_DIR_NAME}/${LEGACY_DIR_NAME}/${LEGACY_STORE_FILE}`,
      source: storeSource,
      migrated,
      already,
      // 清空之后「0 在 legacy」这件事的读数就是 0 张（文件留着，票店不删）。
      remaining: 0,
    },
    observation,
  }
}

// ── op：route-mark（C1d）───────────────────────────────────────────────────
/**
 * **暂停 / 恢复**（契约 C1 §10；定形 §2.3 原话「暂停/恢复 = `route-mark pause|resume`（不改阶段）」）。
 *
 * 两个转场**不混**：切阶段 = `stage-enter`（改 `current_stage_id` + `transitions[]`）；
 * 暂停 / 恢复 = 这个 op（只改 `pauses[]`，**不写 `transitions[]`** —— 转场会被读成切阶段）。
 *
 * 六条语义（§10.2）：
 *   ① **暂停必须停会话**：在途**实现**任务（`in_progress` + `session_ref`）必须在 `sessions[]` 里被声明；
 *      没声明 ⇒ `E_PAUSE_SESSION_LIVE` + **零写入**（不锁死、不静默放行）；
 *   ② 声明过的 ⇒ 写 `session_exit` + `status:'paused'`，**`session_ref` 不清**；
 *   ③ **`maintain` 不支持暂停** ⇒ `E_PAUSE_NOT_SUPPORTED`（不静默忽略、不写一条没用的记录）；
 *   ④ **扩大**（默认，沿用 open 的 `pause_id` + entry 并集）vs **另开**（`new_set:true`，旧 set 关闭 + 新 id）；
 *      旧 set 关闭**不自动 free 在途修任务** —— 这个 op 一个字节都不碰 bug 台账；
 *   ⑤ 记录形状冻结（见 `R.pauseRecord`）；`by` 必须是 `leader`（停会话 = 组长执行）；
 *   ⑥ `resume` 把这个模式下**所有** open 的 set 关掉，mode 回 `build`，**不顺手改任务状态**。
 */
function opRouteMark(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['mark', 'reason', 'by', 'entry_ids', 'line', 'evidence', 'sessions', 'new_set', 'version', 'expected_version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `route-mark 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  // 组长裁定（2026-11-01 ⑥）：控制写也要 CAS —— `expected_version` 与 `version` 同义，任给一个即可。
  const wantVersion = payload?.version !== undefined ? payload.version : payload?.expected_version
  if (wantVersion === undefined) {
    throw cliError('E_ARG_SCHEMA', 'route-mark 要 version（CAS：你手上是哪一版；也认 expected_version）—— 控制写不许盲写')
  }
  casVerdict(current, wantVersion)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const mode = R.modeOf(current)

  if (payload?.mark === 'resume') {
    if (mode !== 'build-paused') {
      throw cliError('E_RESUME_NOT_PAUSED', `当前模式是 ${mode}，不是 build-paused —— 没有可恢复的暂停（不静默成功）`)
    }
    let closed = 0
    const pauses = (current.pauses ?? []).map((p) => {
      if (p?.state !== 'open') return p
      closed += 1
      return { ...p, state: 'closed', closed_at: at, closed_by: 'leader' }
    })
    const next = { ...current, pauses, version: current.version + 1, updated_at: at }
    const out = commitRoute(paths, { op: 'route-mark', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { mark: 'resume', closed } })
    return { version: next.version, sha256: out.sha256, audit_seq: out.audit_seq, mark: 'resume', mode: R.modeOf(next), closed }
  }
  if (payload?.mark !== 'pause') {
    throw cliError('E_ARG_SCHEMA', `mark 只认 pause | resume，实得 ${JSON.stringify(payload?.mark)}`)
  }

  // ③ `(maintain, pause)` ⇒ 拒，不静默忽略。
  if (mode === 'maintain') {
    throw cliError('E_PAUSE_NOT_SUPPORTED', '当前是维护期（kind=maintain）—— `maintain` 不支持暂停（定形 §2.3：`(maintain, pause)` 拒，不静默忽略）')
  }
  if (payload?.by !== 'leader') {
    throw cliError('E_ARG_SCHEMA', `by 必须是 leader（停会话 = 组长执行；定形 §3.3），实得 ${JSON.stringify(payload?.by)}`)
  }
  if (!isFilledString(payload?.reason)) {
    throw cliError('E_ARG_SCHEMA', 'pause 必须写 reason（没有理由的暂停没法复核）')
  }
  const entryIds = payload?.entry_ids === undefined ? [] : payload.entry_ids
  if (!Array.isArray(entryIds) || entryIds.some((id) => !isFilledString(id))) {
    throw cliError('E_ARG_SCHEMA', `entry_ids 必须是字符串数组（触发条 + 老板扩大范围的那些），实得 ${JSON.stringify(entryIds)}`)
  }
  const sessions = payload?.sessions === undefined ? [] : payload.sessions
  if (!Array.isArray(sessions)) throw cliError('E_ARG_SCHEMA', `sessions 必须是数组（停会话的声明），实得 ${JSON.stringify(sessions)}`)

  // ① 活会话必须被声明停过（判在**任何写之前** ⇒ 被拒 = 零写入）。
  const live = R.liveSessionTasksVerdict(current.tasks, sessions, { code: 'E_PAUSE_SESSION_LIVE', kindFilter: 'implement' })
  if (!live.ok) throw cliError(live.code, live.message)
  // ② 声明过的：写 `session_exit` + `paused`，**`session_ref` 不清**。
  const tasks = R.applySessionExit(current.tasks, live.live, at)

  // ④ 扩大 vs 另开。
  const pauses = (current.pauses ?? []).map((p) => ({ ...p }))
  const openIdx = pauses.map((p, i) => (p?.state === 'open' ? i : -1)).filter((i) => i >= 0)
  const newSet = payload?.new_set === true
  let pauseId = null
  const incoming = [...new Set(entryIds)]
  if (newSet) {
    for (const i of openIdx) pauses[i] = { ...pauses[i], state: 'closed', closed_at: at, closed_by: 'leader' }
  } else if (openIdx.length > 0) {
    const i = openIdx[openIdx.length - 1]
    const merged = [...new Set([...(Array.isArray(pauses[i].entry_ids) ? pauses[i].entry_ids : []), ...incoming])]
    pauses[i] = {
      ...pauses[i],
      entry_ids: merged,
      line: isFilledString(payload?.line) ? payload.line : pauses[i].line ?? null,
      evidence: payload?.evidence !== undefined && payload?.evidence !== null ? payload.evidence : pauses[i].evidence ?? null,
    }
    pauseId = pauses[i].pause_id ?? null
  }
  if (pauseId === null) {
    pauseId = R.nextPauseId(pauses, R.dayKeyOf(at))
    pauses.push(R.pauseRecord({ pause_id: pauseId, at, reason: payload.reason, entry_ids: incoming, line: payload.line ?? null, evidence: payload.evidence ?? null }))
  }
  const next = { ...current, tasks, pauses, version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, {
    op: 'route-mark',
    at,
    nextRoute: next,
    prevSha: currentSha,
    sessionId,
    detail: { mark: 'pause', pause_id: pauseId, entry_ids: incoming, new_set: newSet, closed_sets: newSet ? openIdx.length : 0, sessions: sessions.length },
  })
  return {
    version: next.version,
    sha256: out.sha256,
    audit_seq: out.audit_seq,
    mark: 'pause',
    mode: R.modeOf(next),
    pause_id: pauseId,
    entry_ids: R.pauseSetOf(next.pauses).entry_ids,
    sessions_stopped: live.live.map((t) => t.id),
  }
}

// ── op：headline-set（C1b 补齐）────────────────────────────────────────────
/**
 * **补齐第一行**（契约 C1 §6.2）。它只做一件事：把 `stored` 重新算成 `derived`。
 *
 * 🔴 **不接受调用方自带的一行字** —— 那会变成第二个真相（`stored` 与 `derived` 分叉）。
 * 用于 C1 之前建的老账本（没有 `headline` 字段）：`empty:true` ⇒ 卡片红 + 实现任务被拒；
 * 补齐之后同一发 `task-set` 就收。
 */
function opHeadlineSet(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) {
      throw cliError('E_ARG_SCHEMA', `headline-set 不收任何一行字（${JSON.stringify(key)}）：它只把 stored 重算成 derived（第二作者 = 第二个真相）`)
    }
  }
  const current = readCurrent(paths)
  casOptionalVerdict(current, payload, 'headline-set')
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const headline = R.headlineOf(current)
  if (headline.derived === null) {
    throw cliError('E_ARG_SCHEMA', '算不出第一行（goal.title 或当前阶段 name 缺）—— headline 只能由「目标 · 大阶段名」派生，不吃手写')
  }
  const next = { ...current, headline: headline.derived, version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, {
    op: 'headline-set',
    at,
    nextRoute: next,
    prevSha: currentSha,
    sessionId,
    detail: { previous: headline.stored, headline: headline.derived, healed: headline.empty },
  })
  return { version: next.version, sha256: out.sha256, audit_seq: out.audit_seq, headline: headline.derived, previous: headline.stored, healed: headline.empty }
}

// ── op：票 ─────────────────────────────────────────────────────────────────
function requireTicket(current, id) {
  if (typeof id !== 'string' || id.trim() === '') throw cliError('E_ARG_SCHEMA', `票号（id）必填，实得 ${JSON.stringify(id)}`)
  const hit = (current.tickets ?? []).find((t) => t.id === id)
  if (!hit) throw cliError('E_TICKET_NOT_FOUND', `票 ${id} 不在路线里（现有：${(current.tickets ?? []).map((t) => t.id).join(' / ') || '（没有票）'}）`)
  return hit
}

/**
 * 只读 op 之外的写面：`version` **可省**的那一档（`ticket-open` / `headline-set`）。
 *
 * 与 `task-set` 同一条写法：**不带 ⇒ 不拦 + stderr WARN**（CAS 是保护，不是必填字段）；
 * **带了就必须相等**（绝不覆盖）。这一档的来历：`LED-05` 的 `ticket-open` / `LED-02` 的
 * `headline-set` 调用形状都不带 `version`，而两条判据都不带它 —— 要恢复必填请组长裁。
 */
function casOptionalVerdict(current, payload, opName) {
  if (payload?.version === undefined) {
    process.stderr.write(`[${CLI_NAME}] WARN ${opName}：这次没带 version（跳过 CAS；要严格比对就带上）—— 变更照写\n`)
    return
  }
  casVerdict(current, payload.version)
}

function opTicketOpen(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['title', 'source', 'next_step', 'acceptance', 'id', 'version', 'note', 'finding_refs'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `ticket-open 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  // 形状先判（给了就必须非空、ids 唯一），再拼记录 —— 报文要点名是哪一条不成立。
  // 🔴 "给了"看的是**这个键在不在**（`[]` 也算给了）：记录里 `[]` 是"没挂 finding"的合法形态，
  //    入参里 `[]` 却是"说要挂、一条都没写" —— 两者不能同形（gate4 复审 BC-03a）。
  const refsVerdict = T.findingRefsVerdict(payload?.finding_refs, { requireNonEmpty: Object.hasOwn(payload ?? {}, 'finding_refs') })
  if (!refsVerdict.ok) throw cliError(refsVerdict.code, refsVerdict.message)
  const current = readCurrent(paths)
  casOptionalVerdict(current, payload, 'ticket-open')
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)

  const tickets = current.tickets ?? []
  // 票号那 8 位**从 `dayKeyOf` 派生**（契约 §13.1：带连字符的日子是那个函数的结果，`ticket-<8 位>-<NN>` 不跟着换形状）。
  const id = typeof payload?.id === 'string' && payload.id.trim() !== '' ? payload.id.trim() : T.nextTicketId(tickets, R.dayDigitsOf(at))
  const record = T.newTicketRecord({
    id,
    title: payload?.title,
    source: payload?.source,
    next_step: payload?.next_step,
    acceptance: payload?.acceptance,
    at,
    finding_refs: payload?.finding_refs,
  })
  const verdict = T.validateTicket(record, { existingIds: tickets.map((t) => t.id), findingsSet: null })
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  // 同一来源只许开一张（"同一来源的票重复开" ⇒ E_TICKET_DUP，B3.3/§B1.4）。
  const dupSource = tickets.find((t) => t.source === record.source)
  if (dupSource) throw cliError('E_TICKET_DUP', `来源 ${record.source} 已经开过票了（${dupSource.id}，状态 ${dupSource.status}）—— 要补差就在那张票上补`)

  const next = { ...current, tickets: [...tickets, record], version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, { op: 'ticket-open', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: record.id, source: record.source } })
  return { ticket_id: record.id, ticket: record, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

function opTicketUpdate(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['id', 'status', 'version', 'closure_evidence', 'void_reason', 're_present', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `ticket-update 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const ticket = requireTicket(current, payload?.id)

  // "重呈现之后再来一次"：票已经是 void，这一步只换/补 `re_present`（**状态机不动**，证据不丢）。
  // 🔴 判的是**投影**（gate4 复审 BC-01）：迁移票不存 `status`，读 `ticket.status` 会把"已经 void"读成"没 void"。
  const fromState = T.ticketFromStateOf(ticket, current.tasks)
  const rePresentOnly = fromState === 'void'
    && (payload?.status === undefined || payload?.status === 'void')
    && payload?.re_present !== undefined
    && payload?.closure_evidence === undefined
  if (rePresentOnly) {
    const again = T.voidRePresentVerdict(ticket, payload)
    if (!again.ok) throw cliError(again.code, again.message)
    const history = [...(ticket.re_present_history ?? []), ticket.re_present].filter((v) => v !== null && v !== undefined)
    const updated = { ...ticket, re_present: { ref: payload.re_present.ref, at: payload.re_present.at, note: payload.re_present.note ?? null }, re_present_history: history, last_update: at }
    const next = { ...current, tickets: (current.tickets ?? []).map((t) => (t.id === ticket.id ? updated : t)), version: current.version + 1, updated_at: at }
    const out = commitRoute(paths, { op: 'ticket-update', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: ticket.id, re_present: updated.re_present.ref, action: 're-present-again' } })
    return { ticket: updated, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
  }

  const status = payload?.status
  if (!T.TICKET_STATUSES.includes(status)) {
    throw cliError('E_TICKET_STATUS', `status 必须是 ${T.TICKET_STATUSES.join(' | ')}，实得 ${JSON.stringify(status)}`)
  }
  // 终态那两条路各有各的证据要求 —— 先判证据、再判状态机（"关票要证据"是前置条件）。
  let patch = null
  if (status === 'done') {
    const close = T.closeEvidenceVerdict(ticket, payload?.closure_evidence)
    if (!close.ok) throw cliError(close.code, close.message)
    patch = { closure_evidence: { ...payload.closure_evidence, closed_at: payload.closure_evidence.closed_at ?? at }, closed_at: at }
  } else if (status === 'void') {
    // 🔴 C1（契约 §7.5）：**有 live task 的票不许 void** —— 先取消任务。判在任何写之前。
    const live = R.ticketVoidVerdict(ticket, current.tasks)
    if (!live.ok) throw cliError(live.code, live.message)
    const v = T.voidVerdict(ticket, payload)
    if (!v.ok) throw cliError(v.code, v.message)
    patch = { void_reason: payload.void_reason, re_present: { ref: payload.re_present.ref, at: payload.re_present.at, note: payload.re_present.note ?? null }, closed_at: at }
  }
  // 🔴 状态机读**投影**（`ticketFromStateOf`），不读存着的 `status` —— 迁移票没有那个键（gate4 复审 BC-01）。
  const transition = T.transitionVerdict(ticket, status, current.tasks)
  if (!transition.ok) throw cliError(transition.code, transition.message)
  const updated = { ...ticket, ...(patch ?? {}), status, last_update: at }
  const next = { ...current, tickets: (current.tickets ?? []).map((t) => (t.id === ticket.id ? updated : t)), version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, { op: 'ticket-update', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: ticket.id, from_status: transition.from, to_status: status } })
  return { ticket: updated, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

/** `ticket-close`：`done` 那条路（关闭证据三非空）。 */
function opTicketClose(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['id', 'status', 'closure_evidence', 'version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `ticket-close 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const ticket = requireTicket(current, payload?.id)
  if (payload?.status !== undefined && payload.status !== 'done') {
    throw cliError('E_ARG_SCHEMA', `ticket-close 只用于 done，实得 status=${JSON.stringify(payload.status)}（要 void 走 ticket-void）`)
  }
  const close = T.closeEvidenceVerdict(ticket, payload?.closure_evidence)
  if (!close.ok) throw cliError(close.code, close.message)
  // 🔴 状态机读**投影**（gate4 复审 BC-01）：迁移票没有 `status`，但它的 `legacy_status` 就是它的 from-state。
  const transition = T.transitionVerdict(ticket, 'done', current.tasks, { hint: '不许跳过 in_progress' })
  if (!transition.ok) throw cliError(transition.code, transition.message)
  const updated = {
    ...ticket,
    status: 'done',
    closure_evidence: { ...payload.closure_evidence, closed_at: payload.closure_evidence.closed_at ?? at },
    closed_at: at,
    last_update: at,
  }
  const next = { ...current, tickets: (current.tickets ?? []).map((t) => (t.id === ticket.id ? updated : t)), version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, { op: 'ticket-close', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: ticket.id, closure_kind: updated.closure_evidence.kind } })
  return { ticket: updated, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

/** `ticket-void`：`void` 那条路（必须给理由**与**重呈现位置）。 */
function opTicketVoid(ctx) {
  const { paths, payload, at, sessionId } = ctx
  const allowed = new Set(['id', 'status', 'void_reason', 're_present', 'version', 'note'])
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) throw cliError('E_ARG_SCHEMA', `ticket-void 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowed].join(' / ')}`)
  }
  const current = readCurrent(paths)
  casVerdict(current, payload?.version)
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const { currentSha } = assertChain(paths, audit.records)
  const ticket = requireTicket(current, payload?.id)
  if (payload?.status !== undefined && payload.status !== 'void') {
    throw cliError('E_ARG_SCHEMA', `ticket-void 只用于 void，实得 status=${JSON.stringify(payload.status)}（要 done 走 ticket-close）`)
  }
  // 🔴 C1（契约 §7.5）：**有 live task 的票不许 void**（先取消任务）—— 判在任何写之前。
  const liveVerdict = R.ticketVoidVerdict(ticket, current.tasks)
  if (!liveVerdict.ok) throw cliError(liveVerdict.code, liveVerdict.message)
  const verdict = T.voidVerdict(ticket, payload)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  // 🔴 状态机读**投影**（gate4 复审 BC-01）：这 7 张迁移票就是靠这一行才能 void（它们不存 `status`）。
  const transition = T.transitionVerdict(ticket, 'void', current.tasks, { hint: 'done/void 是终态，要回退就开新票' })
  if (!transition.ok) throw cliError(transition.code, transition.message)
  const updated = {
    ...ticket,
    status: 'void',
    void_reason: payload.void_reason,
    re_present: { ref: payload.re_present.ref, at: payload.re_present.at, note: payload.re_present.note ?? null },
    closed_at: at,
    last_update: at,
  }
  const next = { ...current, tickets: (current.tickets ?? []).map((t) => (t.id === ticket.id ? updated : t)), version: current.version + 1, updated_at: at }
  const out = commitRoute(paths, { op: 'ticket-void', at, nextRoute: next, prevSha: currentSha, sessionId, detail: { ticket_id: ticket.id, re_present: updated.re_present.ref } })
  return { ticket: updated, version: next.version, sha256: out.sha256, audit_seq: out.audit_seq }
}

// ── op：读面 ───────────────────────────────────────────────────────────────
/**
 * 读面 —— **只读 op，一个字节都不写**（连目录都不建）。
 *
 * C1（契约 §2.2 / §6.1 / §8.3 / §7.5）：在原来的 `current` 之外多四块**读数**（C2 的接缝）：
 *   · `mode`     —— 四值纯派生（`uninitialized` / `build` / `build-paused` / `maintain`）；
 *   · `headline` —— `{stored, derived, empty, stale}`（唯一载体 = 账上的 `headline` 字段）；
 *   · `slot`     —— `slotBusy()` 的**同一个谓词**算出来的槽读数（两本账的任务合在一起判）；
 *   · `tickets`  —— 票状态的**投影**（`{id, status, legacy_status, source}`）。
 *
 * 🔴 `slot` 的两本账：路线 `tasks[]` + bug 台账 `tasks[]`（"一个工作区一个写者"）。
 *    bug 台账**读不出来**（坏）⇒ 槽判不了 ⇒ `state:'unknown'` + 按 busy 拒（fail-closed），
 *    **不许**把"读不到"读成"没人占"。
 */
function opRead(ctx) {
  const { paths, at } = ctx
  const current = readCurrent(paths)
  const shape = R.routeShapeVerdict(current)
  if (!shape.ok) throw cliError(shape.code, shape.message)
  const sha = sha256Hex(readFileSync(paths.current))
  const mode = R.modeOf(current)
  const headline = R.headlineOf(current)
  const routeTasks = Array.isArray(current.tasks) ? current.tasks : []

  let bugTasks = []
  let slotIssue = null
  if (existsSync(paths.bugLedger)) {
    const read = readJsonFile(paths.bugLedger)
    if (!read.ok) slotIssue = read.message
    else {
      const bugShape = B.bugLedgerShapeVerdict(read.value)
      if (!bugShape.ok) slotIssue = bugShape.message
      else bugTasks = Array.isArray(read.value.tasks) ? read.value.tasks : []
    }
  }
  const slot = slotIssue === null
    ? R.slotBusy({ tasks: [...routeTasks, ...bugTasks], now: at, requester_task_id: null })
    : {
        state: 'unknown',
        free: false,
        allow: false,
        holders: [],
        code: 'E_GUARD_SLOT_BUSY',
        message: `bug 台账读不出来 ⇒ 槽判不了（按 busy 拒，fail-closed）：${slotIssue}`,
      }

  const tickets = (Array.isArray(current.tickets) ? current.tickets : []).map((t) => ({
    id: t?.id ?? null,
    status: R.ticketStatusOf(t, routeTasks),
    legacy_status: t?.legacy_status ?? null,
    source: t?.source ?? null,
    // 「评审 finding → 票」的载体（gate4 复审 BC-03a）：读面能直接查到，不用去翻 current.json。
    finding_refs: Array.isArray(t?.finding_refs) ? [...t.finding_refs] : [],
  }))

  return { current, version: current.version, sha256: sha, path: paths.current, mode, headline, slot, tickets }
}

function opVerify(ctx) {
  const { paths } = ctx
  const current = readCurrent(paths)
  const sha = sha256Hex(readFileSync(paths.current))
  const audit = readAudit(paths)
  if (!audit.ok) throw cliError(audit.code, audit.message)
  const verdict = chainVerdict(paths, audit.records, sha)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  return {
    authoritative: true,
    sha256: sha,
    audit_tail_sha256: verdict.tail.next_sha256,
    audit_seq: verdict.tail.seq ?? audit.records.length,
    audit_records: audit.records.length,
    version: current?.version ?? null,
    path: paths.current,
  }
}

function opSummarize(ctx) {
  const { paths } = ctx
  const current = readCurrent(paths)
  const shape = R.routeShapeVerdict(current)
  if (!shape.ok) throw cliError(shape.code, shape.message)
  const sha = sha256Hex(readFileSync(paths.current))
  // C1b：首行常量一格不动（RT-08 冻结）；`headline` 是**新字段**（C2 的接缝），值取账上的载体。
  return { text: R.summarizeRoute(current), headline: R.headlineOf(current).stored, version: current.version, sha256: sha, path: paths.current }
}

// ── bug 台账（任务 B）──────────────────────────────────────────────────────
/**
 * 九个 bug op（契约 `.team/test/CONTRACT-B.md` §9.1）—— 落点是**这一支 CLI**。
 *
 * 三条硬口径（与路线侧共用同一套写法，但**两本账不互串**）：
 *   ① **写面只有两个落点**：`.team/bug/ledger.json`（条目 / 任务 / 批次 / 样本 / 归档）与
 *      `.team/routing.jsonl`（分流记录 —— 它住在两本账**之外**，定形 §2.3 的原话）；
 *   ② **`bug-read` 零写入**：不持锁、不建目录、连 `.team/bug/` 都不建（缺台账 ⇒ `E_DATA_MISSING` exit 7，
 *      **缺 ≠ 空**：静默返回 0 条会把"没建账"读成"干净"）；
 *   ③ **`bug-register` 不许建 `.team/route/`**：登记**不需要**路线（定形 §2.3）——
 *      这是 B1 的准入前提，也是"两本账"在盘上的形态。
 *
 * 🔴 「零写入」也包括**被拒的那一次**：`bug-register` / `bug-archive` / `bug-task-set` 的准入判定
 *    全部跑在**抢锁之前**（被拒 ⇒ 台账 SHA256 前后相同）。
 */

/** bug 台账的路径（从路线侧那份 `paths` 派生 —— `teamDir` 的口径只在一处算）。 */
function bugPaths(routePathSet) {
  return {
    workspace: routePathSet.workspace,
    teamDir: routePathSet.teamDir,
    bugDir: path.join(routePathSet.teamDir, BUG_DIR_NAME),
    ledger: path.join(routePathSet.teamDir, BUG_DIR_NAME, BUG_LEDGER_FILE),
    lock: path.join(routePathSet.teamDir, BUG_DIR_NAME, BUG_LOCK_FILE),
    /** 分流 log：**不进** `.team/bug/`，也不进路线账本（两本账都不是它的家）。 */
    routing: path.join(routePathSet.teamDir, ROUTING_FILE),
    routeDir: routePathSet.routeDir,
    /** 模式 (`uninitialized`) 的唯一来源：路线账本在不在。 */
    routeCurrent: routePathSet.current,
  }
}

/** 持 bug 锁跑一段读-改-写（锁在 `.team/bug/.bug.lock`，**不是**路线那把）。 */
function withBugLock(ctx, fn) {
  const acquired = acquireLock(ctx.paths.lock, { session_id: ctx.sessionId, purpose: `bug:${ctx.op}` }, {
    forceRecover: ctx.args.forceRecover === true,
    // 锁里的 `at` 是**真实此刻**（理由同 `withLock`：`judgeLockOnce` 拿真实钟判过期）。
    at: new Date(),
  })
  if (!acquired.ok) throw cliError(acquired.code, acquired.message, { path: ctx.paths.lock })
  try {
    return fn()
  } finally {
    releaseLock(ctx.paths.lock)
  }
}

/** 读 bug 台账：**缺**（`E_DATA_MISSING`）与**坏**（`E_DATA_CORRUPT`）分得开。 */
function readBugLedger(ctx, { required = true } = {}) {
  const file = ctx.paths.ledger
  if (!existsSync(file)) {
    if (!required) return null
    throw cliError(
      'E_DATA_MISSING',
      `bug 台账还没建（${file} 不在）—— 缺 ≠ 空：它由第一次登记创建（--op bug-register）；读面不许把它读成"0 条干净账"`,
      { path: file },
    )
  }
  const read = readJsonFile(file)
  if (!read.ok) throw cliError(read.code, `bug 台账读不出来：${read.message}`, { path: file })
  const shape = B.bugLedgerShapeVerdict(read.value)
  if (!shape.ok) throw cliError(shape.code, shape.message, { path: file })
  return read.value
}

/** 落盘：`version` 每次写 +1（CAS 的输入）；原子写同 `lib/atomic.mjs` 的口径。 */
function commitBugLedger(ctx, ledger) {
  const next = {
    ...ledger,
    version: (Number.isInteger(ledger?.version) ? ledger.version : 0) + 1,
    updated_at: ctx.at,
  }
  const written = writeJsonAtomic(ctx.paths.ledger, next)
  if (!written.ok) throw cliError(written.code, `bug 台账写入失败：${written.message}`, { path: ctx.paths.ledger })
  return next
}

/** `report_ref` 的落点：**工作区相对**（`.team/retro/…` 与 `retro/…` 两种写法都落对），越界 ⇒ 拒。 */
function resolveInsideWorkspace(workspace, rel) {
  const root = path.resolve(String(workspace))
  const abs = path.resolve(root, ...String(rel).split('/'))
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw cliError('E_PATH_ESCAPE', `report_ref 逃出了工作区：${JSON.stringify(rel)}（落点 ${abs}）`)
  }
  return abs
}

/** 一份样本集里某个版本的那一版（现在这版或历史留档里那一版）。 */
function sampleSetOfVersion(ledger, version) {
  const set = ledger?.severity_samples ?? null
  if (set === null) return null
  if (set.version === version) return set
  return (Array.isArray(set.history) ? set.history : []).find((h) => h?.version === version) ?? null
}

/** `a` 是不是**晚于** `b`（同一刻不算晚 —— 契约 §7.3：判据是 `registered_at > assessment.at`，不是 `>=`）。 */
function isLaterThan(a, b) {
  const x = Date.parse(String(a ?? ''))
  const y = Date.parse(String(b ?? ''))
  return Number.isFinite(x) && Number.isFinite(y) && x > y
}

// ── op：bug-register ───────────────────────────────────────────────────────
/**
 * 建条目（**第一次调用创建台账**；不建路线）。
 *
 * 准入 = **现象 + 证据（≥1 条）+ kind 闭集**（契约 §3.2）；`recipe` **从来不是门槛**
 * （定形 §4.1：老板报的 bug 按「现象 + 证据」登记，**不要求配方**）。
 * 被拒 ⇒ `E_ARG_SCHEMA` + **零写入**：判定跑在抢锁之前。
 *
 * 🔴 `author` **不是入参**（gate4 复审 BC-06 的"静默入参"那一格，写明在案的读法）：
 *    登记人恒为组长 ⇒ `composeBugEntry` 把它**强制**成 `'leader'`，调用方给什么都不认
 *    （见 `lib/bug-ledger.mjs::composeBugEntry`）。这是刻意的，不是漏判 —— 别读成"author 可被覆盖"。
 */
function opBugRegister(ctx) {
  const preview = readBugLedger(ctx, { required: false }) ?? B.newBugLedger({ at: ctx.at })
  const candidate = B.composeBugEntry(ctx.payload, { at: ctx.at, ledger: preview })
  const verdict = B.entryVerdict(candidate)
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  return withBugLock(ctx, () => {
    const ledger = readBugLedger(ctx, { required: false }) ?? B.newBugLedger({ at: ctx.at })
    const entry = B.composeBugEntry(ctx.payload, { at: ctx.at, ledger })
    const again = B.entryVerdict(entry)
    if (!again.ok) throw cliError(again.code, again.message)
    // 台账内 id 唯一（契约 §3.1）：显式给 id 的调用方也不许撞现存的（含已归档的）。
    const taken = [...ledger.entries, ...ledger.archived].some((e) => e?.id === entry.id)
    if (taken) throw cliError('E_ARG_SCHEMA', `条目 id ${JSON.stringify(entry.id)} 已经在台账里（live 或 archived）—— id 必须台账内唯一`, { id: entry.id })
    const next = commitBugLedger(ctx, { ...ledger, entries: [...ledger.entries, entry] })
    return { entry, entry_id: entry.id, ledger_version: next.version, counts: B.openCounts(next) }
  })
}

// ── op：bug-assess ─────────────────────────────────────────────────────────
/**
 * 测试岗评估（assessment / 严重线 / 代价档）；组长写 `line_decision`。
 *
 * 两个作者各一个事实（契约 §7.4）：测试岗写 `assessment` / `severity_line` / `severity_confidence` /
 * `cost` / `fix_sketch`；组长写 `line_decision` / `disposition` / 冻结 / 归档 ⇒ 跨角色写 `E_BUG_WRITER_ROLE`。
 *
 * 两个"判不了"不混（契约 §7.5）：`assessment:"unknown"` 只让条目**保留 open**；
 * 严重线的 `severity_confidence:"cannot"` / `unclassified` 必须 `escalate:true`（升级 + 卡红）。
 */
function opBugAssess(ctx) {
  const p = ctx.payload ?? {}
  const byRole = p.by_role
  if (byRole !== 'test' && byRole !== 'leader') {
    throw cliError('E_BUG_WRITER_ROLE', `by_role 只认 test（测试岗评估）/ leader（组长拍线），实得 ${JSON.stringify(byRole)}`)
  }
  const hasSeverity = p.severity_line !== undefined || p.severity_confidence !== undefined || p.hides !== undefined
  if (byRole === 'leader' && hasSeverity) {
    throw cliError('E_BUG_WRITER_ROLE', '严重度评估的写者是**测试岗**（定形 §4.2：测试岗按样本评估）；组长拍线，不写 severity_line / severity_confidence')
  }
  if (byRole === 'test' && p.line_decision !== undefined) {
    throw cliError('E_BUG_WRITER_ROLE', '拍线（line_decision）的是**组长**（定形 §4.2）；测试岗不写这一格')
  }
  if (p.assessment !== undefined && !B.ASSESSMENTS.includes(p.assessment)) {
    throw cliError('E_ARG_SCHEMA', `assessment 只认 ${B.ASSESSMENTS.join(' / ')}（闭集；unknown = 判不了 ⇒ 保留 open、不清零），实得 ${JSON.stringify(p.assessment)}`)
  }
  if (!Number.isInteger(p.sample_version) && p.sample_version !== undefined) {
    throw cliError('E_ARG_SCHEMA', `sample_version 要么不写，要么是整数，实得 ${JSON.stringify(p.sample_version)}`)
  }
  let severity = null
  if (hasSeverity) {
    severity = B.severityVerdict({ line: p.severity_line, hides: p.hides ?? null, severity_confidence: p.severity_confidence })
    if (!severity.ok) throw cliError(severity.code, severity.message)
    if (severity.escalate && p.escalate !== true) {
      throw cliError(
        'E_BUG_SEVERITY_ESCALATE_MISSING',
        `${severity.exit === B.UNCLASSIFIED ? 'unclassified（装不进样本）' : '严重线上"判不了"' } 必须升级（escalate:true）+ 卡红（定形 §4.2）—— 不许静默保留 open`,
      )
    }
  }
  if (typeof p.id !== 'string' || p.id.trim() === '') throw cliError('E_ARG_SCHEMA', 'id 必填（要评估哪一条）')
  return withBugLock(ctx, () => {
    const ledger = readBugLedger(ctx)
    const idx = ledger.entries.findIndex((e) => e?.id === p.id)
    if (idx < 0) {
      throw cliError('E_DATA_MISSING', `条目 ${p.id} 不在 live 段（现有：${ledger.entries.map((e) => e?.id).join(' / ') || '（没有条目）'}）`)
    }
    const entry = ledger.entries[idx]
    // 样本那一半（契约 §7.3）：预注册（时间序）+ 改后不许重判。
    if (severity !== null && Number.isInteger(p.sample_version)) {
      const set = sampleSetOfVersion(ledger, p.sample_version)
      if (set === null) {
        throw cliError('E_DATA_MISSING', `样本集 v${p.sample_version} 不在台账里（现在 ${JSON.stringify(ledger.severity_samples?.version ?? null)} 版；历史 ${JSON.stringify((ledger.severity_samples?.history ?? []).map((h) => h?.version))}）`)
      }
      if (isLaterThan(set.registered_at, ctx.at)) {
        throw cliError('E_BUG_SAMPLE_LATE', `样本必须**事故前预注册**（定形 §4.2）：样本 v${p.sample_version} 的 registered_at=${JSON.stringify(set.registered_at)} 晚于这次评估的时刻 ${JSON.stringify(ctx.at)} ⇒ 那次评估不可能"按样本"判过`)
      }
      const judgedUnder = entry.assessment?.sample_version
      if (Number.isInteger(judgedUnder) && judgedUnder !== p.sample_version) {
        throw cliError('E_BUG_SAMPLE_REJUDGE', `条目 ${p.id} 已经在 v${judgedUnder} 的样本下判过，现在拿 v${p.sample_version} 再判 ⇒ **改后不许重判**（定形 §6.2：改样本 = 版本 + 旧样本留档，旧结论不许被改写成新样本的结论）`)
      }
    }
    const prev = entry.assessment ?? null
    const assessment = {
      verdict: p.assessment === undefined ? (prev?.verdict ?? null) : p.assessment,
      severity_line: severity === null ? (prev?.severity_line ?? null) : severity.exit,
      severity_confidence: severity === null ? (prev?.severity_confidence ?? null) : p.severity_confidence,
      cost: p.cost === undefined ? (prev?.cost ?? null) : p.cost,
      fix_sketch: p.fix_sketch === undefined ? (prev?.fix_sketch ?? null) : p.fix_sketch,
      by_role: 'test',
      at: ctx.at,
      sample_version: p.sample_version === undefined ? (prev?.sample_version ?? null) : p.sample_version,
    }
    if (severity !== null && severity.exit === 'reading_lies') assessment.hides = p.hides
    const updated = { ...entry, assessment }
    if (severity !== null && severity.escalate) {
      // "判不了 / unclassified ⇒ 升级 + 卡红"的落点：`escalated_at` + `card_red`（读面 `bug-read.card_red`）。
      updated.escalated_at = ctx.at
      updated.card_red = true
    }
    if (byRole === 'leader') {
      // 组长只写拍线那一格；`assessment` 一个字不动（两个作者各一个事实）。
      updated.assessment = prev
      updated.line_decision = {
        value: p.line_decision === undefined ? null : p.line_decision,
        by_role: 'leader',
        at: ctx.at,
      }
    }
    const entries = [...ledger.entries]
    entries[idx] = updated
    const next = commitBugLedger(ctx, { ...ledger, entries })
    return { entry: updated, entry_id: updated.id, ledger_version: next.version, counts: B.openCounts(next) }
  })
}

// ── op：bug-dispose ────────────────────────────────────────────────────────
/** 组长处置（disposition + 理由）—— `open = 无 disposition`，这一下之后封顶读数才减一。 */
function opBugDispose(ctx) {
  const p = ctx.payload ?? {}
  if (p.by_role !== 'leader') {
    throw cliError('E_BUG_WRITER_ROLE', `处置（disposition）的写者是**组长**（定形 §3.1 第 4 条），实得 by_role=${JSON.stringify(p.by_role)}`)
  }
  if (!B.DISPOSITIONS.includes(p.disposition)) {
    throw cliError('E_ARG_SCHEMA', `disposition 只认 ${B.DISPOSITIONS.join(' / ')}（闭集；deferred = 未建账期的暂缓），实得 ${JSON.stringify(p.disposition)}`)
  }
  if (typeof p.reason !== 'string' || p.reason.trim() === '') {
    throw cliError('E_ARG_SCHEMA', '处置必须带理由（reason 非空）—— 没有理由的处置读的人没法复核')
  }
  if (typeof p.id !== 'string' || p.id.trim() === '') throw cliError('E_ARG_SCHEMA', 'id 必填（要处置哪一条）')
  return withBugLock(ctx, () => {
    const ledger = readBugLedger(ctx)
    const idx = ledger.entries.findIndex((e) => e?.id === p.id)
    if (idx < 0) {
      throw cliError('E_DATA_MISSING', `条目 ${p.id} 不在 live 段（现有：${ledger.entries.map((e) => e?.id).join(' / ') || '（没有条目）'}）`)
    }
    const updated = {
      ...ledger.entries[idx],
      disposition: { value: p.disposition, reason: p.reason, by: 'leader', at: ctx.at },
    }
    const entries = [...ledger.entries]
    entries[idx] = updated
    const next = commitBugLedger(ctx, { ...ledger, entries })
    return { entry: updated, entry_id: updated.id, ledger_version: next.version, counts: B.openCounts(next) }
  })
}

// ── op：bug-batch-freeze ───────────────────────────────────────────────────
/**
 * 冻结批：`{id, frozen_at, entry_ids[]}`（定形 §3.1 第 2 条）。
 * **冻结一次之后逐字不变**：再冻结 = 新 id、新的一条记录，旧 batch 一个字节不动。
 * **冻结之后登记的条目进不了这一批**（新条目的 `batch` 恒为 `null`，进下一批）。
 */
function opBugBatchFreeze(ctx) {
  const ids = ctx.payload?.entry_ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.trim() === '')) {
    throw cliError('E_ARG_SCHEMA', `entry_ids 必须是 ≥1 条非空 id 的数组（冻结哪几条），实得 ${JSON.stringify(ids)}`)
  }
  return withBugLock(ctx, () => {
    const ledger = readBugLedger(ctx)
    const known = new Set(ledger.entries.map((e) => e?.id))
    const missing = ids.filter((id) => !known.has(id))
    if (missing.length > 0) {
      throw cliError('E_ARG_SCHEMA', `这些条目不在 live 段，不能冻结：${missing.join(' / ')}（现有：${[...known].join(' / ') || '（没有条目）'}）`)
    }
    const batch = { id: B.nextBatchId(ledger, ctx.at), frozen_at: ctx.at, entry_ids: [...ids] }
    const next = commitBugLedger(ctx, { ...ledger, batches: [...ledger.batches, batch] })
    return { batch, batch_id: batch.id, ledger_version: next.version }
  })
}

// ── op：bug-samples-register ───────────────────────────────────────────────
/**
 * 组长**事故前**预注册严重线样本（定形 §4.2）；改样本 = **版本 + 旧样本逐字留档**（§6.2）。
 * 四个样本：正 / 负 / 第三线正 / 第三线负 —— 形状由 `sampleSetVerdict` 判（缺第三线那一对 ⇒ 拒）。
 */
function opBugSamplesRegister(ctx) {
  const p = ctx.payload ?? {}
  if (p.by_role !== 'leader') {
    throw cliError('E_BUG_WRITER_ROLE', `样本由**组长**在事故前预注册（定形 §4.2），实得 by_role=${JSON.stringify(p.by_role)}`)
  }
  const verdict = B.sampleSetVerdict({ samples: p.samples })
  if (!verdict.ok) throw cliError(verdict.code, verdict.message)
  return withBugLock(ctx, () => {
    const ledger = readBugLedger(ctx)
    const prev = ledger.severity_samples ?? { version: 0, registered_at: null, registered_by: null, samples: [], history: [] }
    const version = (Number.isInteger(prev.version) ? prev.version : 0) + 1
    const history = Array.isArray(prev.history) ? [...prev.history] : []
    if (version > 1) {
      // 旧版**逐字**留档（`samples` 直接搬数组，不重排、不重写）。
      history.push({ version: prev.version, registered_at: prev.registered_at, registered_by: prev.registered_by, samples: prev.samples })
    }
    const set = { version, registered_at: ctx.at, registered_by: 'leader', samples: p.samples, history }
    const next = commitBugLedger(ctx, { ...ledger, severity_samples: set })
    return { severity_samples: set, ledger_version: next.version }
  })
}

// ── op：bug-archive ────────────────────────────────────────────────────────
/**
 * 归档 = **同一本账的 `archived` 段**（定形 §3.1 第 6 条）。
 * **只搬带结论的**（`disposition` 非空）：条目逐字进 `archived[]` + `archived_at`；live 段只留没结论的。
 * 没结论的就归档 ⇒ `E_BUG_ARCHIVE_OPEN` + **零写入**（判定跑在抢锁之前的那一步也在锁内重判一次）。
 */
function opBugArchive(ctx) {
  const ids = ctx.payload?.entry_ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.trim() === '')) {
    throw cliError('E_ARG_SCHEMA', `entry_ids 必须是 ≥1 条非空 id 的数组（归档哪几条），实得 ${JSON.stringify(ids)}`)
  }
  return withBugLock(ctx, () => {
    const ledger = readBugLedger(ctx)
    const byId = new Map(ledger.entries.map((e) => [e?.id, e]))
    const missing = ids.filter((id) => !byId.has(id))
    if (missing.length > 0) {
      throw cliError('E_DATA_MISSING', `这些条目不在 live 段：${missing.join(' / ')}（现有：${[...byId.keys()].join(' / ') || '（没有条目）'}）`)
    }
    const open = ids.filter((id) => (byId.get(id)?.disposition ?? null) === null)
    if (open.length > 0) {
      throw cliError(
        'E_BUG_ARCHIVE_OPEN',
        `归档只搬**带结论**的条目：${open.join(' / ')} 还没有 disposition（定形 §3.1 第 6 条：簿上 live 段只留没结论的）—— 零写入`,
      )
    }
    const moved = ids.map((id) => ({ ...byId.get(id), archived_at: ctx.at }))
    const remain = ledger.entries.filter((e) => !ids.includes(e?.id))
    const next = commitBugLedger(ctx, { ...ledger, entries: remain, archived: [...ledger.archived, ...moved] })
    return { archived: moved.map((e) => e.id), ledger_version: next.version, counts: B.openCounts(next) }
  })
}

// ── op：bug-task-set ───────────────────────────────────────────────────────
/**
 * bug 任务 upsert（只写 bug 台账；**两个创建入口都调 `admitTask`** —— 判据一份）。
 *
 * C1 落地之后（契约 C1 §7.4 "两个创建入口"那一行的 bug 侧）：
 *   · `mode` = `modeOf(路线账本)`（**纯派生，不读 payload**）—— 没有账本就是 `uninitialized`；
 *   · **每条 `entry_ids` 各过一遍 `admitTask`**（`entry_id` = 那一条）；任何一条被拒 ⇒ **整条任务拒**，
 *     报文点名那条 entry（"一条一个根因，不许半收"）；
 *   · `batch_entry_ids` 取这条任务所指 batch 的 `entry_ids`（maintain 读它）；
 *     `pause_entry_ids` 取 `pauseSetOf(route.pauses).entry_ids`（build-paused 读它）—— **两个集合不混名**；
 *   · **准入判定跑在抢锁之前** ⇒ 被拒 = 零写入（台账 SHA256 前后相同）。
 *
 * ⚠️ 仍然**不许**从 payload 读 `mode`：那等于让调用方给自己发准入许可。
 */
function opBugTaskSet(ctx) {
  const payload = ctx.payload ?? {}
  if (!Array.isArray(payload.tasks)) throw cliError('E_ARG_SCHEMA', `tasks 必须是数组，实得 ${JSON.stringify(payload.tasks)}`)
  const ledger = readBugLedger(ctx)

  // 模式（纯派生）：没有路线账本就是 `uninitialized`。
  let route = null
  if (existsSync(ctx.paths.routeCurrent)) {
    const read = readJsonFile(ctx.paths.routeCurrent)
    if (!read.ok) throw cliError(read.code, `路线账本读不出来：${read.message}`, { path: ctx.paths.routeCurrent })
    const shape = R.routeShapeVerdict(read.value)
    if (!shape.ok) throw cliError(shape.code, shape.message, { path: ctx.paths.routeCurrent })
    route = read.value
  }
  const mode = R.modeOf(route)
  const headline = R.headlineOf(route).stored
  const pauseEntryIds = R.pauseSetOf(route?.pauses).entry_ids
  const existingIds = new Set((ledger.tasks ?? []).map((t) => t?.id))

  // ① 先过准入（**每条 entry 一遍**）：拒 ⇒ 整条任务拒 + 点名那条 entry。
  for (const task of payload.tasks) {
    if (!task || typeof task !== 'object') throw cliError('E_ARG_SCHEMA', `tasks[] 里必须都是对象，实得 ${JSON.stringify(task)}`)
    if (existingIds.has(task.id)) continue // 更新不过准入（契约 §7.4）
    // batch 不存在 ⇒ 形状错（先于准入说清楚；batch 为 null 是 build-paused / 未冻结的那种合法形状）。
    let batchEntryIds = []
    if (task.batch !== undefined && task.batch !== null) {
      const batch = (ledger.batches ?? []).find((b) => b?.id === task.batch) ?? null
      if (batch === null) {
        throw cliError('E_ARG_SCHEMA', `bug 任务 ${task.id} 的 batch=${JSON.stringify(task.batch)} 不在台账的 batches 里（现有：${(ledger.batches ?? []).map((b) => b?.id).join(' / ') || '（没有批次）'}）`)
      }
      batchEntryIds = Array.isArray(batch.entry_ids) ? batch.entry_ids : []
    }
    const entryIds = Array.isArray(task.entry_ids) ? task.entry_ids.filter((id) => typeof id === 'string' && id.trim() !== '') : []
    const probes = entryIds.length > 0 ? entryIds : [null]
    for (const entryId of probes) {
      const admit = R.admitTask({
        mode,
        kind: 'bug-repair',
        entry_id: entryId,
        headline,
        batch_entry_ids: batchEntryIds,
        pause_entry_ids: pauseEntryIds,
      })
      if (!admit.ok) throw cliError(admit.code, `bug 任务 ${task.id}${entryId === null ? '' : `（entry ${entryId}）`}：${admit.message}`)
    }
  }

  // ② 形状（共用 B 的五关词表；`batch` / `entry_ids` / `root_cause` 照 `bugTaskVerdict`）。
  const tasks = []
  for (const task of payload.tasks) {
    const verdict = B.bugTaskVerdict(task, { batches: ledger.batches ?? [] })
    if (!verdict.ok) throw cliError(verdict.code, verdict.message)
    tasks.push(task)
  }

  return withBugLock(ctx, () => {
    const fresh = readBugLedger(ctx)
    const merged = [...(fresh.tasks ?? []).filter((t) => !tasks.some((x) => x.id === t.id)), ...tasks]
    const next = commitBugLedger(ctx, { ...fresh, tasks: merged })
    return { tasks: merged, task_ids: merged.map((t) => t.id), ledger_version: next.version, mode }
  })
}

// ── op：bug-route ──────────────────────────────────────────────────────────
/**
 * 把一条评审 finding 的分流结论记到**独立**的 `.team/routing.jsonl`（定形 §2.3）。
 *
 * 三条只属于这个 op 的口径：
 *   ① **报表冻结**：`report_sha256` 由写入方**自己核**（不符 ⇒ `E_ARG_HASH` + 零写入）；报告只读，一个字节都不动；
 *   ② **不持两本账的锁**：它可以在一本账都不存在时写（"不需要 task / 不需要账先存在"）；
 *   ③ **周期号是本条唯一的时钟**（定形 §3.4）：缺 / 非正整数 ⇒ `E_ARG_SCHEMA`，不许被吞成 0 或"今天"。
 * 老板报的 bug **不适用五分支表** ⇒ `E_BUG_ROUTE_NOT_APPLICABLE`。
 */
function opBugRoute(ctx) {
  const p = ctx.payload ?? {}
  if (p.source === 'boss') {
    throw cliError('E_BUG_ROUTE_NOT_APPLICABLE', '老板报的 bug 按「现象 + 证据」登记，**不适用五分支表**（定形 §4.1）—— 它不许被分流到票或条目里')
  }
  if (!Number.isInteger(p.cycle) || p.cycle <= 0) {
    throw cliError('E_ARG_SCHEMA', `cycle（开工周期号）必须是正整数 —— 它是分流记录**唯一的时钟**（定形 §3.4），实得 ${JSON.stringify(p.cycle)}`)
  }
  if (typeof p.report_ref !== 'string' || p.report_ref.trim() === '') {
    throw cliError('E_ARG_SCHEMA', 'report_ref 必填（引用哪一份报告）')
  }
  if (typeof p.finding_id !== 'string' || p.finding_id.trim() === '') {
    throw cliError('E_ARG_SCHEMA', 'finding_id 必填（报告里的哪一条 finding）')
  }
  if (typeof p.report_sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(p.report_sha256)) {
    throw cliError('E_ARG_HASH', `report_sha256 必须是 64 位十六进制，实得 ${JSON.stringify(p.report_sha256)}`)
  }
  const reportAbs = resolveInsideWorkspace(ctx.paths.workspace, p.report_ref)
  if (!existsSync(reportAbs)) throw cliError('E_DATA_MISSING', `report_ref 指的报告不在盘上：${reportAbs}`)
  const actual = sha256Hex(readFileSync(reportAbs))
  if (actual.toLowerCase() !== p.report_sha256.toLowerCase()) {
    throw cliError('E_ARG_HASH', `声明的 report_sha256 与报告盘上字节不符（声明 ${p.report_sha256}，实得 ${actual}）—— 记账那一侧必须自己核，"报告冻结"只有核过才算数`)
  }
  const routing = B.routingVerdict({ recipe: p.recipe, repeat: p.repeat, env_related: p.env_related })
  if (!routing.ok) throw cliError(routing.code, routing.message)
  const row = {
    at: ctx.at,
    cycle: p.cycle,
    report_ref: p.report_ref,
    report_sha256: actual.toLowerCase(),
    finding_id: p.finding_id,
    carrier: routing.carrier,
    tags: [...routing.tags],
    entry_id: typeof p.entry_id === 'string' && p.entry_id.trim() !== '' ? p.entry_id : null,
    ticket_id: typeof p.ticket_id === 'string' && p.ticket_id.trim() !== '' ? p.ticket_id : null,
    by: 'leader',
  }
  try {
    mkdirSync(path.dirname(ctx.paths.routing), { recursive: true })
    appendFileSync(ctx.paths.routing, `${JSON.stringify(row)}\n`, 'utf8')
  } catch (err) {
    throw cliError('E_TXN_IO', `分流记录写不进去（${err?.code ?? 'UNKNOWN'}）：${err?.message}`, { path: ctx.paths.routing })
  }
  return { routing: row, carrier: routing.carrier, tags: routing.tags }
}

// ── op：bug-read（只读）────────────────────────────────────────────────────
/**
 * 读：`{ledger, counts, cap, card_red, sla}`（`counts` / `cap` / `card_red` 是契约 §5.3 冻结的；
 * `sla` 是契约 C2 §3.7.1 那一段）。**一个字节都不写**（连目录都不建）。
 * 缺台账 ⇒ `E_DATA_MISSING` + exit 7 —— 缺 ≠ 空。
 *
 * `sla.cycle` = **开工周期号** = `dayKeyOf(ctx.at)`（本地 04:00 切那一份，与卡上的 `<day>` 同一个键）：
 * 卡那一格与这里必须同值，所以周期号只从这一处派生，不在调用方另算。
 */
function opBugRead(ctx) {
  const ledger = readBugLedger(ctx)
  return {
    ledger,
    counts: B.openCounts(ledger),
    cap: B.capVerdict(ledger, { now: ctx.at }),
    card_red: B.cardRedVerdict(ledger),
    sla: B.slaVerdict(ledger, { cycle: R.dayKeyOf(ctx.at) }),
  }
}

/**
 * bug 那一族 op 的分派表（与路线侧分开写：两本账不互串，分派也不混）。
 *
 * 🔴 **锁在哪一把由 op 自己决定**（不在 `main()` 里统一包）：
 *    · `bug-register` / `bug-assess` / `bug-dispose` / `bug-batch-freeze` / `bug-samples-register` /
 *      `bug-archive` / `bug-task-set` 在**判定之后**才抢 `.team/bug/.bug.lock`（被拒 ⇒ 零写入）；
 *    · `bug-read` 不持锁、不建目录（零写入）；
 *    · `bug-route` 只 append 一行到 `.team/routing.jsonl`，**不持两本账的锁**（定形 §2.3）。
 */
const BUG_OPS = Object.freeze({
  'bug-register': opBugRegister,
  'bug-assess': opBugAssess,
  'bug-dispose': opBugDispose,
  'bug-batch-freeze': opBugBatchFreeze,
  'bug-samples-register': opBugSamplesRegister,
  'bug-archive': opBugArchive,
  'bug-task-set': opBugTaskSet,
  'bug-route': opBugRoute,
  'bug-read': opBugRead,
})

// ── 入口 ───────────────────────────────────────────────────────────────────
const OPS = {
  init: opInit,
  'stage-graph-set': opStageGraphSet,
  'stage-enter': opStageEnter,
  'task-set': opTaskSet,
  // C1（契约 C1 §9.1）：三个新 op；写面只有 `.team/route/`（外加 bootstrap 那一条观察迁移窄例外）。
  bootstrap: opBootstrap,
  'route-mark': opRouteMark,
  'headline-set': opHeadlineSet,
  'ticket-open': opTicketOpen,
  'ticket-update': opTicketUpdate,
  'ticket-close': opTicketClose,
  'ticket-void': opTicketVoid,
  read: opRead,
  verify: opVerify,
  summarize: opSummarize,
  ...BUG_OPS,
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
      process.stderr.write(`agenia-route.mjs 的 op 清单（${OP_NAMES.length} 个）：\n  ${OP_NAMES.join('\n  ')}\n`)
      emit({ ok: true, op: 'help', cli: CLI_NAME, ops: [...OP_NAMES] })
      return 0
    }
    if (!Object.hasOwn(OPS, op)) throw cliError('E_USAGE', `未知 op：${JSON.stringify(op)}；可用：${OP_NAMES.join(' / ')}`)
    const payload = readPayload(args)
    const workspace = resolveWorkspace(args, payload)
    const statusRoot = args.statusRoot === null || args.statusRoot === undefined || String(args.statusRoot).trim() === ''
      ? null
      : resolveRoot(args, { label: '--status-root', raw: args.statusRoot, markerInParent: true })
    // `--data-root` 只**校验**（路线侧的写面永远是工作区）：给了非法根照样拒，但一个字节都不写它。
    if (args.dataRoot !== null && args.dataRoot !== undefined && String(args.dataRoot).trim() !== '') {
      resolveRoot(args, { label: '--data-root', raw: args.dataRoot })
    }
    // 🔴 gate4 复审 BC-03b：路线账本**一个工作区一份**（`<WS>/.team/route`）。`--status-root` / `--route-dir`
    //    指到别的工作区 ⇒ 拒 `E_ROOT_OUTSIDE` + 零写入。判在 root 的三道闸**之后**（C 盘 / 真实根 / marker
    //    的码比它先出，老判据一个不动），判在任何读写**之前**（连接口都不碰）。
    const binding = routeDirBindingVerdict({ workspace, statusRoot, routeDir: args.routeDir, teamDirName: TEAM_DIR_NAME, routeDirName: ROUTE_DIR_NAME })
    if (!binding.ok) throw cliError(binding.code, binding.message)
    const paths = routePaths(workspace, statusRoot)
    const at = R.isoWithOffset(clockNow())
    const sessionId = typeof payload?.session_id === 'string' && payload.session_id.trim() !== '' ? payload.session_id : null
    if (Object.hasOwn(BUG_OPS, op)) {
      // bug 那一族：另一本账、另一把锁、另一组落点（两本账不互串）。锁由各 op 自己拿（见 `BUG_OPS` 那段）。
      const bug = bugPaths(paths)
      const ctx = { paths: bug, payload, at, args, sessionId, op, workspace }
      emit({ ok: true, op, workspace, bug_dir: bug.bugDir, ...BUG_OPS[op](ctx) })
      return 0
    }
    const ctx = { paths, payload, at, args, sessionId, op }
    const out = READ_OPS.has(op) ? OPS[op](ctx) : withLock(paths, args, { op, sessionId }, () => OPS[op](ctx))
    emit({ ok: true, op, workspace, route_dir: paths.routeDir, ...out })
    return 0
  } catch (err) {
    const code = typeof err?.code === 'string' && Object.hasOwn(CODES, err.code) ? err.code : 'E_INTERNAL'
    process.stderr.write(`[${CLI_NAME}] ${code} ${String(err?.message ?? err)}\n`)
    emit({ ok: false, op, error: { code, message: String(err?.message ?? err), details: err?.details ?? null } })
    return CODES[code].exit
  }
}

process.exitCode = main(process.argv.slice(2))
