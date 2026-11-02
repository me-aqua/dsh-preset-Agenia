/**
 * **bug 系统（任务 B）的被测面常量与夹具** —— 单一来源，四格用例共用。
 *
 * 契约：`.team/test/CONTRACT-B.md`（第 2 关交付物）。定形：
 * `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版，冻结）——
 * 本文件里每一个名字都能在契约的对应小节里指到出处；**不许在别处再抄一份**。
 *
 * 🔴 为什么这些名字要冻：B 的四格判的是「账上那几个对象长什么样、谁在什么模式下能开修任务」。
 *   名字不冻 ⇒ 每格都得靠猜键名，猜错一次就是一条假红或一条假绿（`mig-rules-11`）。
 *   所以：**路径 / op 名 / 两个词集 / 三条线 / 四出口 / 上限两个数** 都在这里出现一次。
 *
 * ⚠️ 本文件是**工具**，不是用例：`discover.mjs` 只数 `static|unit|integration|report` 四棵树里的
 *   `*.test.mjs`，`support/` 不进分母。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, optionalEnv } from './env.mjs'
import { canonical, ensureMarkedDir } from './root-guard.mjs'

// ── 账的落点（契约 §2）──────────────────────────────────────────────────────
/**
 * **两本账不互串**（定形 §2.3 / §2.4）：bug 台账与路线账本各一个目录。
 * - bug 台账：`<WS>/.team/bug/ledger.json`（登记簿 = 它的 `entries[]` 段，不是第三本账）
 * - 路线账本：`<WS>/.team/route/current.json`（**C1 的**，B 只读它拿模式，一个字节都不写）
 * - 分流记录：`<WS>/.team/routing.jsonl`（独立 log；既不进 bug 台账、也不进路线账本 —— 定形 §2.3）
 */
export const BUG_PATHS = Object.freeze({
  teamDir: '.team',
  bugDir: '.team/bug',
  ledger: '.team/bug/ledger.json',
  lock: '.team/bug/.bug.lock',
  routing: '.team/routing.jsonl',
  routeDir: '.team/route',
  routeCurrent: '.team/route/current.json',
})

/**
 * bug 台账的 op 名（契约 §9，**冻字面**）。
 *
 * 落点是**现有**的 `bin/agenia-route.mjs`（不新造 CLI）：理由写在契约 §9.1 ——
 * 新增一支 CLI 会连带 `install.mjs` / `release-scan` / `binFiles` / `surfaceInventory` 四张清单同批动，
 * 而"登记不需要路线"这件事**用写面边界**就能钉住（bug op 只写 `.team/bug/`，`bug-register` 之后
 * `.team/route/` 必须**不存在**）。
 *
 * ⚠️ 实现落地时**同批**要把这九个 op 加进 `support/env.mjs::FROZEN.ops['agenia-route.mjs']`
 *   与 `presets/agenia/lib/cli-inventory.mjs::ROUTE_OPS`，否则 `DR-01` 的 `CLI-INVENTORY` 会红
 *   （"新增 op 必须同批进冻结表与清单"是既有口径，见 `support/env.mjs` 那段 🔴）。
 */
export const BUG_OPS = Object.freeze([
  'bug-register',
  'bug-assess',
  'bug-dispose',
  'bug-batch-freeze',
  'bug-samples-register',
  'bug-archive',
  'bug-task-set',
  'bug-route',
  'bug-read',
])

/** 只读 op（不持锁、不建目录、零写入）—— 与 `agenia-route.mjs` 的 `READ_OPS` 同一条纪律。 */
export const BUG_READ_OPS = Object.freeze(['bug-read'])

// ── 两个词不混（定形 §2.3 末段）──────────────────────────────────────────────
/** 条目种类：**50/30 只数 `kind=bug`**；observation 是未建账期的临时载体（不计入）。 */
export const BUG_KINDS = Object.freeze(['bug', 'observation'])

/** **disposition（报告/组长的处置）**：`deferred` 是未建账期的暂缓。 */
export const DISPOSITIONS = Object.freeze(['adopted', 'rejected', 'deferred'])

/** **assessment（测试岗的评估）**：`unknown` = 判不了 ⇒ 条目**保留 open、不清零**。 */
export const ASSESSMENTS = Object.freeze(['true', 'false', 'duplicate', 'unknown'])

/** entry 的 open/closed：**open = 没有 disposition**（不是"评估为 true"）。 */
export const isEntryOpen = (entry) => (entry?.disposition ?? null) === null

// ── 封顶（定形 §3.1 第 7 条 + §4）──────────────────────────────────────────
/**
 * **50 / 30**：bug open 达 **50** ⇒ 红；最老一条超过 **30 天（日历）** ⇒ 红。
 * 两个数的读法（契约 §5.2 的保守读法，逐条可翻案）：
 *   · 50 —— 定形写的是「50 条 bug open」⇒ **达到就红**（`>= 50`）；
 *   · 30 —— 定形写的是「最老超过 30 天」⇒ **严格大于才红**（`age > 30`），第 30 天不红。
 * 边界两格（49/50 · 30/31）都在 `BUG-01` 里，谁改口径都会当场翻面。
 */
export const CAP = Object.freeze({ bug_open: 50, days: 30 })

// ── 严重三条线 + 四出口（定形 §4.2）─────────────────────────────────────────
/**
 * **三条线**（判「够不够线」，不是分类学）：
 *   1. `data_broken`             —— 数据 / 库坏了
 *   2. `function_broken_repro`   —— 产品功能坏了 = **一个用户可见功能失败 + 复现步骤**
 *   3. `reading_lies`            —— 「读数说假话」**只有掩盖前两条时才算**
 * 第四个出口 `unclassified` = **装不进样本 ⇒ 升级老板**（不是第五桶）。
 */
export const SEVERITY_LINES = Object.freeze(['data_broken', 'function_broken_repro', 'reading_lies'])
export const UNCLASSIFIED = 'unclassified'
export const SEVERITY_EXITS = Object.freeze([...SEVERITY_LINES, UNCLASSIFIED])

/**
 * 样本四个（定形 §4.2 / §6.2：**正 / 负 / 第三线正 / 第三线负**，组长**事故前预注册**）。
 * 「第三线正 / 负只代表它自己的线，不给未采样线赋值」⇒ 第二条线（功能坏）**没被采样**，
 * 它那一格在读数里必须是 `calibrated: false`（`BUG-04` 钉这一格）。
 */
export const SAMPLE_SET = Object.freeze([
  Object.freeze({ line: 'data_broken', polarity: 'positive' }),
  Object.freeze({ line: 'data_broken', polarity: 'negative' }),
  Object.freeze({ line: 'reading_lies', polarity: 'positive' }),
  Object.freeze({ line: 'reading_lies', polarity: 'negative' }),
])

/** 被采样过的线（`calibrated` 判据的输入）。 */
export const SAMPLED_LINES = Object.freeze([...new Set(SAMPLE_SET.map((s) => s.line))])

// ── 纯函数接缝（契约 §9.2）─────────────────────────────────────────────────
/**
 * **B 自己的**纯函数模块：`presets/agenia/lib/bug-ledger.mjs`。
 * - `entryVerdict(entry)` → `{ok, code, message}`
 * - `openCounts(ledger)` → `{entry_open, bug_open, observation_open, archived}`
 * - `capVerdict(ledger, {now})` → `{bug_open, threshold, days, over_count, oldest_age_days, over_age, red, reasons}`
 * - `routingVerdict({recipe, repeat, env_related})` → `{ok, code, carrier, tags}`
 * - `bugTaskVerdict(task, {batches, gateWords})` → `{ok, code, message}`（五关**共用** `FIVE_GATES`）
 * - `sampleSetVerdict(sampleSet)` → `{ok, code, message}`
 * - `severityVerdict(assessment)` → `{ok, code, exit, calibrated, escalate}`
 * - `BUG_LEDGER_SCHEMA`
 */
export const BUG_LIB = 'lib/bug-ledger.mjs'
/** 准入函数**一份**（定形 §2.3："两个创建入口都调它"）—— 作者是 **C1**（§6.2「两期互斥」那一路）。 */
export const ADMIT_LIB = 'lib/route.mjs'

// ── 现场：工作区 / 台账夹具 ─────────────────────────────────────────────────
/** 运行根（`run-all.mjs` 建的；每条用例都在它下面建自己的工作区）。 */
export function runRootPath() {
  const raw = optionalEnv(ENV.RUN_ROOT)
  if (raw === null) throw new Error('ENV-MISSING: AGENIA_TEST_RUN_ROOT 没设置（先跑 run-all.mjs；它建运行根）')
  return canonical(raw)
}

/**
 * 建一个**带 marker 的**工作区（`--workspace` 的合法姿势：测试模式下必须落在运行根之下，
 * 且那一层自己有 `.agenia-test-root`）。`tag` 进目录名 ⇒ 每一格一个根，互不污染。
 */
export function makeWorkspace(caseId, tag) {
  const runRoot = runRootPath()
  const dir = path.join(runRoot, 'workspace', `${String(caseId).toLowerCase()}-${tag}`)
  return ensureMarkedDir(dir, { runRoot, runId: path.basename(runRoot) })
}

/** 工作区里的绝对落点。 */
export function bugAbs(workspace, rel) {
  return path.join(workspace, ...String(rel).split('/'))
}

/** 台账在不在 / 在的话读出来（**缺 ≠ 坏**：坏这里不判，读不出来就是 null + 抛给调用方）。 */
export function readLedger(workspace) {
  const file = bugAbs(workspace, BUG_PATHS.ledger)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * 一份**照契约 §2.2 写**的台账夹具（用于"封顶读数"这类**不需要走写 op** 的格子）。
 *
 * 🔴 夹具是**手写形状**，不是从实现反推的：`entries` 里每条都带 `kind` / `disposition` /
 *    `registered_at` 三样（封顶只读这三样 + `disposition` 的存在性）。
 */
export function ledgerFixture({ entries = [], tasks = [], batches = [], severity_samples = null, archived = [] } = {}) {
  const now = '2026-11-01T10:00:00+08:00'
  return {
    schema: 1,
    entries,
    tasks,
    batches,
    severity_samples: severity_samples ?? { version: 0, registered_at: null, registered_by: null, samples: [], history: [] },
    archived,
    version: 1,
    created_at: now,
    updated_at: now,
  }
}

/** 一条 open 的 bug 条目（`registered_at` 由调用方给 ⇒ 30 天那一格能造出来）。 */
export function bugEntry(id, registeredAt, over = {}) {
  return {
    id,
    kind: 'bug',
    phenomenon: `现象 ${id}`,
    how_seen: '测试夹具',
    evidence: [{ kind: 'file', ref: `.team/test/fixtures/${id}.txt` }],
    recipe: null,
    reporter: 'fixture',
    author: 'leader',
    source: { carrier: 'leader', ref: null },
    tags: [],
    registered_at: registeredAt,
    finding_refs: [],
    assessment: null,
    disposition: null,
    escalated_at: null,
    card_red: false,
    ...over,
  }
}

/** 把一份台账写进工作区（**先建 `.team/bug/`**；这是夹具，不是被测对象的写路径）。 */
export function writeLedger(workspace, ledger) {
  const file = bugAbs(workspace, BUG_PATHS.ledger)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  return file
}

/** 一份"技术评审报告"夹具（`bug-route` 要引用它，且**报告一个字节都不许被改**）。 */
export function writeReport(workspace, rel, text) {
  const file = bugAbs(workspace, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
  return { rel, file, sha256: sha256OfText(text), bytes: Buffer.byteLength(text, 'utf8') }
}

export function sha256OfText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function sha256OfFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** 文件在不在 + 字节数（"零写入"那一族判据的读数）。 */
export function fileStat(file) {
  try {
    const st = statSync(file)
    return { exists: true, bytes: st.size, sha256: sha256OfFile(file) }
  } catch {
    return { exists: false, bytes: null, sha256: null }
  }
}

// ── 信封判读（三个小工具，四格共用）────────────────────────────────────────
/**
 * 这一次调用是不是"**这个 op 根本还没有**"（不是"op 拒了这条输入"）。
 *
 * 两种形状都算，各自点名：
 *   · `E_USAGE` + stderr 里那句 `未知 op` —— `agenia-route.mjs` 的 `OP_NAMES` / `OPS` 里没有它；
 *   · `SUT-SURFACE-MISSING` —— 连 CLI 都不在盘上（这不是本票的形态，但读的人要能分开）。
 * 🔴 这就是"功能没做"那一侧的红因；它与"op 拒了这条输入"（`E_ARG_SCHEMA` …）**必须分得开**。
 */
export function opMissing(res) {
  if (res?.spawn_error) return false
  const code = res?.json?.error?.code ?? null
  if (code === 'E_USAGE') return true
  return String(res?.stderr ?? '').includes('SUT-SURFACE-MISSING')
}

/** op 缺失时的那条 problem（点名 op 与它该在哪一份 `--op help` 里）。 */
export function missingOpProblem(op, res) {
  return {
    code: 'BUG-OP-MISSING',
    message: `\`agenia-route.mjs\` 没有 \`--op ${op}\`（exit=${res?.exit_code ?? '?'} · `
      + `code=${res?.json?.error?.code ?? '(无)'}）—— 契约 §9.1 的九个 bug op 一个都还没有；`
      + `这一格判的是"功能没做"，不是"这条输入被拒"`,
    detail: { op, exit_code: res?.exit_code ?? null, stderr: String(res?.stderr ?? '').slice(0, 300) },
  }
}

/** 期望"被拒"：退出码非零 + 码逐字等于 `wantCode`（`E_ARG_SCHEMA` 这一类是契约冻的字面）。 */
export function refusalOf(label, res, wantCode) {
  if (res?.spawn_error) return `${label}：spawn 失败（${res.spawn_error}）`
  if (res?.timed_out) return `${label}：超时（${res.ms} ms）`
  if (res.exit_code === 0) {
    return `${label}：期望被拒（${wantCode}），实得 exit=0 / ${JSON.stringify(res.json)?.slice(0, 240)}`
  }
  const got = res.json?.error?.code ?? '(stdout 不是错误信封)'
  if (got !== wantCode) {
    return `${label}：期望错误码 ${wantCode}，实得 ${got}；stderr=${String(res.stderr ?? '').trim().slice(0, 240)}`
  }
  return null
}

/**
 * 一个"裸工作区"：**没有路线账本、没有 bug 台账**。
 * B1 的登记必须在这种现场就能做（定形 §2.3："bug 台账由第一次登记创建，登记**不需要**路线"）。
 */
export function makeBareWorkspace(caseId, tag) {
  const ws = makeWorkspace(caseId, tag)
  return {
    workspace: ws,
    routeCurrent: bugAbs(ws, BUG_PATHS.routeCurrent),
    routeDir: bugAbs(ws, BUG_PATHS.routeDir),
    ledger: bugAbs(ws, BUG_PATHS.ledger),
    routing: bugAbs(ws, BUG_PATHS.routing),
  }
}
