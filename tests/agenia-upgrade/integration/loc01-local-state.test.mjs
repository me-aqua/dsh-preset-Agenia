/**
 * `LOC-01` · **`F-156`** —— 三个本地节点（`memory_review` / `conversation` / `technical`）**有确定的写者**。
 *
 * 病根（2026-10-23 现量，见定形 `.team/leader/2026-10-23/spec-F-156.md`）：
 *   `bin/agenia-local.mjs` 早就有 `local-claim` / `local-mark` / `local-fail` 三个写 op，而**没有一个执行的调用者**
 *   ⇒ `<WS>\.team\state\local\<day>.json` 最后一次落盘是 2026-10-17，健康卡于是天天说「本地双评审没启动」——
 *   **10-23 那天这句话是不实指控**（两份评审都派了、都交活了）。
 *   ⚠️ **这段证据按今天读**：三份作业书里现在有这三个 op 的名字，但那三句是在声明「**作业不调**」；
 *   组长的开工 / 收工清单里仍然没有这三个调用 ⇒ 「没有执行调用者」诊断不变，缺的是**调用者**（那属于流程）。
 *   ⇒ 结论（契约 `CONTRACT.md` §12）：**写者是组长，不是作业**。作业是一次性、可能崩的东西；
 *   把"记没记上"押在它记不记得，就是这个洞的来历。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 今天读到的情况（门 2 · 2026-10-23，**先量后写**）：**三个写 op 的行为本身已经是对的。**
 *   · `local-claim` ⇒ 该节点 `running`，兄弟节点一个字都不动；
 *   · `local-mark`  ⇒ 该节点 `done` + 产物锚点原样记下；**坏锚点（hash 与盘上字节不符）⇒ 拒 `E_ARG_HASH` · exit 2 · 零写入**；
 *   · `local-fail`  ⇒ 该节点 `failed`，`failure_reason` 原文留住（去掉首尾空白后逐字，码里 `.trim()`）；
 *   · 无 claim 时 `local-read` ⇒ **`E_DATA_MISSING`（exit 7）**，不是"静默的空文档"；
 *   · 首次 claim 之后，没被 claim 的两个节点以**文档里的空形状**（`state: 'unclaimed'` + 必填键）出现。
 *   ⇒ 本格**不是**"等实现落地的那种红"：定形「验收口径」#1 的两句话里，第二种情形成立 ——
 *   **本格断言"已经写进契约的三态语义"**，今天 **RED 0**；它红只可能是**有人把这条语义改坏了**（回归锁）。
 *   写清这一点，是因为"一条判据该红时没红"和"它本来就该绿"必须分得开（`mig-rules-11`）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 四格 **六条输入**（`want` 照契约 §12 手写，**不从实现反推**）—— 每一条守一条腿：
 *
 * 🔴 **`L1` 的两个节点是 `technical`**（三个节点里**唯一**需要 findings 产物的那一个）：
 *    报告与 findings 都是**真的写在盘上的两份文件**，`report_sha256` / `findings_set_sha256` 都由它们算出来
 *    （后者走 `support/verify-recompute.mjs::q10Digest` —— 测试侧**第二份**实现，不经被测模块）。
 *    本格**不喂任何手写摘要**：一个伪造的 64 hex 能过今天的闸，那正是这条腿本来会被骗的地方。
 *    `conversation` / `memory_review` 那两个"只交报告"的字段归 `LOC-02`（同一批，按字段的必填规则）。
 *
 *   `L1:A` `claim → mark`（`technical`）：
 *        `state: 'done'` · 五个产物锚点逐项落在节点上（`report_sha256` **必须等于报告盘上字节的 SHA256**，
 *        `findings_set_sha256` 必须等于那三条发现算出来的值，`findings_count` 必须是**真条数**，
 *        锚点来自产物、不来自回执自报 —— B3.1）· `claim` / `job_id` 仍指得出是哪一次派工 ·
 *        `liveness_at` 前进到**落地那一刻** · 兄弟两个节点一个字都不动 · `local-read` 说同一件事。
 *   `L1:B` **坏锚点反例**（同一个节点，换一个**与盘上字节不符**的 `report_sha256`）：
 *        `local-mark` 必须**拒**（`E_ARG_HASH` · exit 2 · 码取自 `FROZEN.exitCodes`）· **状态文件一个字节都不许动**
 *        （比的是那一次调用前后的文件 SHA256）· 节点仍 `running`、六个锚点一个都不许落 · claim 痕迹保持。
 *        🔴 这一条是第 4 关评审 `P2` 补的：没有它，"锚点来自产物"这半句只有"抄下"被锁、"核对"没锁
 *        —— 一个**信任调用方给的 hash** 的 `local-mark` 照样能让 `L1:A` 绿（假绿）。
 *   `L2:A` `claim → fail`（`technical`）：`state: 'failed'` · `failure_reason` 原文留住（换成 `(没给原因)` 就翻面）·
 *        claim 痕迹保留 · 兄弟节点不动 · `local-read` 的 `failure_reason` 同句。
 *   `L2:B` **带首尾空白的 reason**：喂 `'   …（attempt 2）\n  '` ⇒ 存下来的是 **`.trim()` 之后的那一段**
 *        （口径 = 去掉首尾空白，不是丢字：中间的字一个不少，长度也要对）。这是第 4 关评审 `P7` 的落地：
 *        契约写"原文留住（去掉首尾空白后逐字）"，这一条证明口径是 trim、不是 normalize 成别的。
 *   `L3:A` **两个节点真并发** claim（`conversation` + `technical`，两个**真子进程**同时起）：
 *        **谁都不许覆盖谁** —— 两节点各自 `running`、各自的 `job_id` / `attempt`；第三个节点仍是空形状。
 *        这一条是"派了没落地会留在 `running`"那条腿的现场（`running` 本身是一等状态，不许被后一个 claim 吞掉）。
 *   `L4:A` **任何 claim 之前** `local-read`：
 *        ① 文件**不在** ⇒ `E_DATA_MISSING` + exit 7 + 报错里点名那个路径（缺 ≠ 坏 ≠ 空）；
 *        ② 第一次 claim 之后，**没被 claim 的两个节点**以文档里的空形状出现
 *           （`unclaimed` + 15 个必填键 + 该为 null 的 null、该为 `[]` 的 `[]`）——
 *           形状是**读 `presets/agenia/lib/local-state.mjs::emptyNode()` 得到的**，不是我编的。
 *
 * 三条控制 —— **它们才是"绿"这个字的合法性来源**：
 *   · `REF`：本文件里那份**照契约 §12 写的最小实现**（`claimDoc` / `markDoc` / `failDoc` / `readOutputOf`；
 *     `markDoc` **自己核** `report_sha256` 与真实报告 hash）喂同样的六条输入 ⇒ 每条都必须成立。
 *     它证明这些格子**是可实现的**、且不是"只有今天这份实现才过"（`mig-rules-14`）。
 *   · `KNIFE`（五把，打在 REF 的字节上 —— **不碰 `presets/**`**，生产里没有一行"多余实现"可以拿来做变异）：
 *       ① `claim` 里丢掉按节点合并 ⇒ 只该 `L3:A` 翻面（并行那条丢一个节点）；
 *       ② `fail` 里丢掉 `reason`（写成固定的 `(没给原因)`）⇒ `L2:A` + `L2:B`（两条同住失败那一支）；
 *       ③ `mark` 不记锚点 ⇒ 只该 `L1:A` 翻面；
 *       ④ `mark` **不核锚点**（调用方说什么就是什么）⇒ 只该 `L1:B` 翻面；
 *       ⑤ `emptyNode()` 丢掉那 10 个键 ⇒ 五条输入一起翻（它切的是**所有节点共用的骨架**，没有更窄的切法）。
 *     向量是**先按契约推、跑完再对**；实测与期望不一致 ⇒ `KNIFE-WRONG-VECTOR`
 *     （一个变异体只证一格：多翻说明那一支与别的输入共用判据，少翻说明这刀没切到它）。
 *   · `STATE`：每条输入先核对**前置**（工作区是新的、状态文件**不在**）—— 前置不成立的话，
 *     下面读到的就不是这一格的东西（与"节点写错了"分开报）。
 *
 * 边界（这一格**不覆盖**什么，写清，别假装更宽）：
 *   1. **不判"谁来调"**：组长该在什么时刻调那三个 op，是**流程**（`CONTRACT.md` §12.2 + 组长那一侧），
 *      不是本格能判的。本格判的是"调了之后盘上那份文件对不对"。
 *   2. **不判 `stale` 的推导**：`running` 过期（`age >= 45` 分钟）变 `stale` 是**健康卡读的时候算出来的**
 *      （`lib/health.mjs`），`local-read` 仍返回原始 `running`；那一格归 `HLT-02` / 租约那一族。
 *      本格只把"`running` 是一等状态、不许被后一个 claim 吞掉"这一条钉在 `L3:A` 上。
 *   3. **不判"失败会不会清掉上一轮的锚点"**（第 4 关评审 `P8`）：`applyFailure` 今天只写
 *      `state` / `failure_reason` / `liveness_at`（`lib/local-state.mjs:442-449`），
 *      所以 `done → claim → fail` 会把旧 `report_path` 带进 `failed`。本格**没走**那条路径，也不判它。
 *      ⚠️ `L2:A` 里 `report_path === null` 那一格是"**从没 mark 过**的空形状读数"，
 *      不是"失败必清锚点"的判据 —— 别把它的绿读成后者（评审 `P8`：这条断言在它自己的步骤里恒真）。
 *   4. **`artifact_paths` 不是锚点**（只是一串自报路径）：锚点只认 `report_sha256` 与**盘上字节**的比对；
 *      `findings_set_sha256` 的**内容语义**归 `receipt-check` / `VRF-02`；本格判的是"抄下来的值 =
 *      那三条发现按 Q10 算出来的值"（喂进去的不是手写常量，见 `readings.fed_digests`）。
 *   5. **不判** `local-receipt-set`（回执登记那一支）、不判 `health` / `receipt-check` 的判词。
 *   6. **不判**锁的实现与原子写方式（`E_LOCK_*` / `wx` / `rename` 是 `STO-*` 的事）：
 *      `L3:A` 只判"两个真子进程同时 claim 之后**盘上那份文件**是什么样"。
 *   7. **不判**加性键的名字（`receipt_versions` / `failure_history` 是实现内部；
 *      `lib/local-state.mjs:105` 明写"测试不许断言名字"）—— 空节点只判**必填键**在不在。
 *   8. **`L4:A` 的 CLI 那一半（`E_DATA_MISSING` / exit 7）没有 REF 可打刀**：五把刀都碰不到它。
 *      它的**非恒真性**由同一跑里的两条断言合起来成立 —— `L4:A` 的 absent（exit 7 / 码 / 点名路径 / 盘上没有文件）
 *      与 `L1:A` 的 present（`readAgrees` 里的 `read.ok`）。`readings.absent_vs_present` 是这两条的读数，
 *      不是独立证据（评审 `P5` 点过：别把它当第三条）。
 *   9. **按字段的必填规则不在本格**（`technical` 要 findings、`memory_review` / `conversation` 只要报告）：
 *      那一面归同一批的 `LOC-02`；本格把 `L1` 的节点放在 `technical` 上，正是因为它要 findings 产物。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256File, sha256Text, stagingReadings } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { fixtureDir, q10Digest } from '../support/verify-recompute.mjs'
import { loadStagedModule, runCliAsync, runLocal, stagingExists, stagingPath, writeFixture } from '../support/sut.mjs'

before(() => {
  preflight()
})

// ── 现场常量（都从**契约 §12** 与盘上事实里来，不从"我算的"里取）────────────────
const DAY = '2026-10-23'
const PROJECT = 'harness'

/** 注入式时钟的九个时刻（op 自己 `toISOString()`；期望值比的是**同一个时刻**，不是同一个写法）。 */
const T_CLAIM = '2026-10-23T21:02:00+08:00'
const T_MARK = '2026-10-23T21:06:00+08:00'
const T_FAIL = '2026-10-23T21:07:00+08:00'
const T_PARALLEL = '2026-10-23T21:12:00+08:00'
const T_SINGLE = '2026-10-23T21:14:00+08:00'
const T_CLAIM_B = '2026-10-23T21:20:00+08:00'
const T_BADMARK = '2026-10-23T21:22:00+08:00'
const T_CLAIM_C = '2026-10-23T21:30:00+08:00'
const T_FAIL_PADDED = '2026-10-23T21:33:00+08:00'

/** 六条输入各自的派工 id（**互不相同** —— `L3:A` 那两条要能证明"各自指得出哪次派工"）。 */
const JOB_CONV = 'job-loc01-conv-0001'
const JOB_TECH = 'job-loc01-tech-0002'
const JOB_TECH_MARK = 'job-loc01-tech-0003'
const JOB_CONV2 = 'job-loc01-conv-0004'
const JOB_TECH2 = 'job-loc01-tech-0005'
const JOB_TECH_BAD = 'job-loc01-tech-0006'
const JOB_TECH_B = 'job-loc01-tech-0007'

/** 失败原因（**原文**判它是"被留住"还是"被换成别的话"）。 */
const REASON_TECH = '子进程退出 1：抓不到会话包（attempt 1，10:5x 重试两次都空）'
/** 带首尾空白的 reason：存下来的应该是它 `.trim()` 之后的那一段（口径 = 去首尾空白，不是丢字）。 */
const REASON_PADDED = '   子进程退出 1：抓不到会话包（attempt 2）\n  '
const REASON_PADDED_TRIMMED = REASON_PADDED.trim()

/**
 * `L1` 的产物（相对**工作区**）：**真的写到盘上的两份文件**。
 * `report_sha256` = 报告正文的 SHA256；`findings_set_sha256` = 三条发现按 Q10 算出来的值
 * （`support/verify-recompute.mjs::q10Digest`）—— 两个都由本文件自己算，不经被测对象、也不是手写常量。
 */
const REPORT_TEXT = '# 技术评审报告（LOC-01 的产物）\n\n窗口：2026-10-22 00:00 – 24:00。\n三行正文。\n'
const REPORT_REL = '.team/retro/2026-10-23/技术评审.md'
const FINDINGS_REL = '.team/retro/2026-10-23/技术评审.findings.json'
const EXPECT_REPORT_SHA = sha256Text(REPORT_TEXT)
/** 三条**真的**发现（形状照 `lib/receipt.mjs::parseFindings` 吃的那个产物）。 */
const FINDINGS_ENTRIES = [
  {
    id: 'LOC1-1',
    title: '报告窗口与节点绑的日子对不上',
    severity: 'P2',
    evidence: [{ kind: 'file', ref: REPORT_REL }],
    summary: '窗口写的是 10-22，本地节点绑的是 10-23。',
  },
  {
    id: 'LOC1-2',
    title: '产物路径混用两种写法',
    severity: 'P3',
    evidence: [{ kind: 'cmd', ref: 'agenia-local.mjs --op local-mark --field technical' }],
    summary: '同一份产物在文档里写过反斜杠，落盘用的是正斜杠。',
  },
  {
    id: 'LOC1-3',
    title: '重试没有换 attempt',
    severity: 'P3',
    evidence: [{ kind: 'log', ref: 'state/local/2026-10-23.json' }],
    summary: '第二次派工仍写成 attempt 1，claim 痕迹指不出是第几次。',
  },
]
const EXPECT_SET_SHA = q10Digest(FINDINGS_ENTRIES)
/** findings 产物的盘上字节（它自己声明 `report_sha256` 与 `findings_set_sha256`，与真实作业产物同形）。 */
const FINDINGS_TEXT = `${JSON.stringify({
  schema: 1,
  day: DAY,
  report_path: REPORT_REL,
  report_sha256: EXPECT_REPORT_SHA,
  generated_at: '2026-10-23T21:05:00+08:00',
  findings: FINDINGS_ENTRIES,
  findings_set_sha256: EXPECT_SET_SHA,
}, null, 2)}\n`
/** `L1:B` 的坏锚点：64 hex，且**故意不等于**报告盘上字节的 SHA256（这一腿要喂的**就是**一个错锚点）。 */
const BAD_REPORT_SHA = '0badc0de'.repeat(8)
/**
 * `L1` 的**回执**（`F-162` 落地之后 `technical` 有 `claim` 就要交回执三件套；老板 2026-10-24 删掉条件①、
 * 留住②`claim.job_id`）。回执真的写在 `.team/leader/<day>/` 下、字节就是下面这一份；
 * `receipt_sha256` 喂的是**它盘上字节**的 SHA256，`receipt_version` 是它声明的 `version`。
 * ⚠️ 节点里存的是 **`.team` 相对**那一种（`leader/<day>/技术复盘回执.json`）—— 两扇读者只认它（§12.2.4）。
 */
const RECEIPT_REL_TEAM = `leader/${DAY}/技术复盘回执.json`
const RECEIPT_VERSION = 1
const RECEIPT_TEXT = `${JSON.stringify({
  schema: 1,
  version: RECEIPT_VERSION,
  day: DAY,
  project: 'harness',
  generated_at: '2026-10-23T21:05:00+08:00',
  handover: { mode: 'fresh' },
  report: { path: REPORT_REL, sha256: sha256Text(REPORT_TEXT), findings_path: FINDINGS_REL },
  findings_set_sha256: null,
  findings_count: null,
  findings: [],
}, null, 2)}\n`
const EXPECT_RECEIPT_SHA = sha256Text(RECEIPT_TEXT)
const ART_TECH = {
  report_path: REPORT_REL,
  findings_path: FINDINGS_REL,
  findings_set_sha256: EXPECT_SET_SHA,
  findings_count: FINDINGS_ENTRIES.length,
  receipt_path: `.team/${RECEIPT_REL_TEAM}`,
  receipt_sha256: EXPECT_RECEIPT_SHA,
  receipt_version: RECEIPT_VERSION,
  artifact_paths: [REPORT_REL, FINDINGS_REL],
}

/**
 * 节点的 **15 个必填键**（`presets/agenia/lib/local-state.mjs:45-49` 的 `NODE_REQUIRED`，逐字抄）
 * —— 手抄是刻意的：拿被测模块的常量当期望值就是自证（`cand-20261016-selfsourced-order-01`）。
 * ⚠️ 加性键（`receipt_versions` / `failure_history`）**不在这里**：那一行注释明写"测试不许断言名字"。
 */
const NODE_REQUIRED = [
  'claim', 'state', 'job_id', 'liveness_at', 'failure_reason',
  'report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count',
  'receipt_path', 'receipt_sha256', 'receipt_version', 'ticket_ids', 'artifact_paths',
]

/** 空节点的"该是空的"那几格（`emptyNode()` 逐字：null / `[]`）。 */
const NODE_NULL_WHEN_EMPTY = [
  'claim', 'job_id', 'liveness_at', 'failure_reason',
  'report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count',
  'receipt_path', 'receipt_sha256', 'receipt_version',
]

/** 三个节点在文件里的键名（`LOCAL_FIELDS`）与 CLI 的 `--field` 拼法（`FIELD_ALIASES`）各写一份 —— 两者**故意不同**。 */
const FIELD_CLI = { conversation: 'conversation', technical: 'technical', memory_review: 'memory-review' }

// ── 小工具 ────────────────────────────────────────────────────────────────
const statePathOf = (ws) => path.join(ws, '.team', 'state', 'local', `${DAY}.json`)
const localDirOf = (ws) => path.join(ws, '.team', 'state', 'local')
/** 路径的**尾巴**（只比最后四段）：运行根不同不算差，但"是不是这一天的那个文件"必须能对。 */
const statePathTail = (p) => String(p ?? '').replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean).slice(-4).join('/')
const EXPECT_STATE_TAIL = `.team/state/local/${DAY}.json`
const sameInstant = (a, b) => {
  const ta = Date.parse(String(a ?? ''))
  const tb = Date.parse(String(b ?? ''))
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb
}
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function readJsonOrNull(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** 一个文件的 SHA256（不在盘上 ⇒ `null`）—— `L1:B` 用它证明"被拒的那一步零写入"。 */
function fileShaOrNull(file) {
  try {
    return sha256File(file)
  } catch {
    return null
  }
}

/**
 * 跑一节时把**注入式时钟**挪到 `iso`，跑完（**无论成不成**）还原 —— 运行根那一份是共享的，
 * 留在别人那一格里会让后面每一格的时间读数跟着漂（与 `DLY-01` 同一处接缝、同一套还原）。
 */
function withClock(iso, fn) {
  const file = process.env[ENV.NOW_FILE]
  if (!file) throw new Error(`AGENIA_NOW_FILE 没设置 —— 这一票的时间读数全靠它（${file}）`)
  const prior = existsSync(file) ? readFileSync(file, 'utf8') : null
  writeFileSync(file, `${iso}\n`, 'utf8')
  try {
    return fn()
  } finally {
    writeFileSync(file, prior === null ? '' : prior, 'utf8')
  }
}

/** `withClock` 的异步版（**真并发**那一条要 `await` 两个子进程，时钟必须整段罩住）。 */
async function withClockAsync(iso, fn) {
  const file = process.env[ENV.NOW_FILE]
  if (!file) throw new Error(`AGENIA_NOW_FILE 没设置 —— 这一票的时间读数全靠它（${file}）`)
  const prior = existsSync(file) ? readFileSync(file, 'utf8') : null
  writeFileSync(file, `${iso}\n`, 'utf8')
  try {
    return await fn()
  } finally {
    writeFileSync(file, prior === null ? '' : prior, 'utf8')
  }
}

/** 每条输入一个**带 marker 的**临时工作区（`.team` 由 CLI 自己在该目录下建）。 */
function makeWorkspace(caseId, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${caseId.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/** 落一份源码到运行根之下并 import 它（URL 带哈希 ⇒ 同一进程里不会拿到缓存里的旧字节）。 */
async function importSource(dir, name, source) {
  const sub = path.join(dir, name)
  mkdirSync(sub, { recursive: true })
  const file = path.join(sub, 'local-state.mjs')
  writeFileSync(file, source, 'utf8')
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex')
  const mod = await import(`${pathToFileURL(file).href}?sha256=${sha256}`)
  return { mod, file, sha256, bytes: Buffer.byteLength(source, 'utf8') }
}

/** 把 `L1` 的产物真的写到工作区里（`local-mark` 的锚点必须来自**盘上字节**）。 */
function writeArtifacts(ws) {
  const reportAbs = path.join(ws, REPORT_REL.split('/').join(path.sep))
  const findingsAbs = path.join(ws, FINDINGS_REL.split('/').join(path.sep))
  const receiptAbs = path.join(ws, '.team', ...RECEIPT_REL_TEAM.split('/'))
  mkdirSync(path.dirname(reportAbs), { recursive: true })
  mkdirSync(path.dirname(receiptAbs), { recursive: true })
  writeFileSync(reportAbs, REPORT_TEXT, 'utf8')
  writeFileSync(findingsAbs, FINDINGS_TEXT, 'utf8')
  writeFileSync(receiptAbs, RECEIPT_TEXT, 'utf8')
  return { reportAbs, findingsAbs, receiptAbs }
}

// ── 真 CLI 调用 ────────────────────────────────────────────────────────────
let fixtureSeq = 0
function payloadFile(label, payload) {
  fixtureSeq += 1
  const purpose = `in-${label}-${fixtureSeq}`
  return writeFixture('LOC-01', purpose, payload)
}

/** 一次写 op（真子进程 · 注入式时钟）。返回 `{ok, exit, code, stderr_head}`。 */
function localWrite(ws, op, payload, at) {
  const inFile = payloadFile(op, payload)
  let res = null
  withClock(at, () => {
    res = runLocal('LOC-01', op, undefined, { workspace: ws, inFile })
  })
  return {
    ok: res !== null && res.exit_code === 0 && res.json?.ok === true,
    exit: res?.exit_code ?? null,
    code: res?.json?.error?.code ?? null,
    stderr_head: String(res?.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' | '),
  }
}

/** 一次 `local-read`（真子进程）。返回信封的几格 + 盘上那份文档（**一扇门两个读数**）。 */
function localRead(ws) {
  const res = runLocal('LOC-01', 'local-read', { day: DAY }, { workspace: ws })
  return {
    ok: res.exit_code === 0 && res.json?.ok === true,
    exit: res.exit_code,
    code: res.json?.error?.code ?? null,
    message: String(res.json?.error?.message ?? ''),
    state: res.json?.state ?? null,
    state_path: res.json?.state_path ?? null,
    summary: res.json?.summary ?? null,
    project: res.json?.project ?? null,
    day: res.json?.day ?? null,
    stderr_head: String(res.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' | '),
    on_disk: readJsonOrNull(statePathOf(ws)),
  }
}

/** 两个**真子进程**同时 claim（`runCliAsync`：同一个进程里两次调用不算并发，契约 §9.5）。 */
async function localClaimParallel(ws, pairs, at) {
  const fixtures = pairs.map((p) => payloadFile(`par-${p.field}`, {
    day: DAY, project: PROJECT, field: FIELD_CLI[p.field] ?? p.field, attempt: p.attempt, job_id: p.jobId,
  }))
  const results = await withClockAsync(at, () => Promise.all(pairs.map((_, i) => runCliAsync('agenia-local.mjs', {
    op: 'local-claim',
    workspace: ws,
    inFile: fixtures[i],
    testMode: true,
  }))))
  return results.map((res, i) => ({
    field: pairs[i].field,
    ok: res.exit_code === 0 && res.json?.ok === true,
    exit: res.exit_code,
    code: res.json?.error?.code ?? null,
    ms: res.ms,
    stderr_head: String(res.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' | '),
  }))
}

// ── 断言小工具：每条返回 `{code, message}`，`null` 表示成立 ──────────────────────
const eq = (code, got, want, why) => (JSON.stringify(got) === JSON.stringify(want)
  ? null
  : { code, message: `${why}：期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}` })

const instant = (code, got, want, why) => (sameInstant(got, want)
  ? null
  : { code, message: `${why}：期望与 ${JSON.stringify(want)} 同一个时刻，实得 ${JSON.stringify(got)}` })

const compacts = (list) => list.filter((p) => p !== null)

/**
 * 一个**没被 claim 过**的节点必须是文档里的空形状。
 * `where` = `节点键.claim` 这种位置串（红的时候一眼看得出是哪一格、哪个节点）。
 */
function emptyNodeProblems(where, node) {
  if (!isObject(node)) return [{ code: 'LOC-NODE-SHAPE', message: `${where}：节点不是一个对象（${JSON.stringify(node)}）` }]
  const keys = Object.keys(node)
  const missing = NODE_REQUIRED.filter((k) => !keys.includes(k))
  return compacts([
    missing.length === 0 ? null : { code: 'LOC-NODE-SHAPE', message: `${where}：空节点缺必填键 ${JSON.stringify(missing)}（lib/local-state.mjs::emptyNode() 的 15 个必填键，B3.6）` },
    eq('LOC-NODE-SHAPE', node.state, 'unclaimed', `${where}：没被 claim 过的节点 state 必须是 unclaimed`),
    ...NODE_NULL_WHEN_EMPTY.map((k) => eq('LOC-NODE-SHAPE', node[k], null, `${where}：空节点的 ${k} 必须是 null`)),
    eq('LOC-NODE-SHAPE', node.ticket_ids, [], `${where}：空节点的 ticket_ids 必须是 []`),
    eq('LOC-NODE-SHAPE', node.artifact_paths, [], `${where}：空节点的 artifact_paths 必须是 []`),
  ])
}

/** 一个**跑过**的节点：状态 + claim 痕迹（`claim` / `job_id` 不许被落地动作抹掉）。 */
function claimTraceProblems(where, node, { jobId, attempt, at }) {
  if (!isObject(node)) return [{ code: 'LOC-CLAIM-TRACE', message: `${where}：节点不是一个对象` }]
  return compacts([
    eq('LOC-CLAIM-TRACE', node.job_id, jobId, `${where}：节点的 job_id 必须指得出是哪一次派工`),
    isObject(node.claim) ? null : { code: 'LOC-CLAIM-TRACE', message: `${where}：节点的 claim 不是一个对象（${JSON.stringify(node.claim)}）—— claim 痕迹被抹掉了` },
    isObject(node.claim) ? eq('LOC-CLAIM-TRACE', node.claim.job_id, jobId, `${where}：claim.job_id`) : null,
    isObject(node.claim) ? eq('LOC-CLAIM-TRACE', node.claim.attempt, attempt, `${where}：claim.attempt`) : null,
    isObject(node.claim) ? instant('LOC-CLAIM-TRACE', node.claim.claimed_at, at, `${where}：claim.claimed_at 是**claim 那一刻**，落地动作不许改写它`) : null,
  ])
}

/** `local-read` 那一扇门与盘上那份文件必须说同一件事（两扇门对不上 = 比"都错"更难发现）。 */
function readAgrees(where, doc, read) {
  if (read === null) return [{ code: 'LOC-READ', message: `${where}：没有 local-read 的读数` }]
  return compacts([
    read.ok ? null : { code: 'LOC-READ', message: `${where}：local-read 必须可用（正例），实得 exit=${read.exit} code=${read.code ?? '(无)'} · ${read.stderr_head}` },
    eq('LOC-READ', statePathTail(read.state_path), EXPECT_STATE_TAIL, `${where}：local-read 的 state_path 必须指着这一天那个文件（尾巴）`),
    doc === null ? null : eq('LOC-READ-DISAGREE', read.state, doc, `${where}：local-read 的 state 与盘上那份文件必须是同一份（逐字节等价的 JSON）`),
    eq('LOC-READ', read.project, PROJECT, `${where}：local-read 的 project`),
    eq('LOC-READ', read.day, DAY, `${where}：local-read 的 day`),
  ])
}

/**
 * 一步的**期望**（两条臂共用）：`expect: 'ok'` 必须成功；`expect: 'reject'` 必须被拒、码对、退出码对、
 * **而且一个字节都不许写**（`wrote` 由两条臂各自量：生产臂比状态文件的 SHA256，REF 臂比序列化后的文档）。
 */
function judgeStep({ where, step, got, wrote }) {
  if ((step.expect ?? 'ok') === 'reject') {
    const wantCode = step.rejectCode ?? 'E_ARG_HASH'
    const wantExit = FROZEN.exitCodes[wantCode]
    return compacts([
      got.ok === false ? null : { code: 'LOC-REJECT', message: `${where}：这一步必须被拒（${wantCode}），实得成功（exit=${got.exit}）—— 锚点没核` },
      got.ok === false ? eq('LOC-REJECT', got.code, wantCode, `${where}：拒绝码必须是 ${wantCode}`) : null,
      got.ok === false && got.exit !== undefined && got.exit !== null ? eq('LOC-REJECT-EXIT', got.exit, wantExit, `${where}：拒绝的退出码（FROZEN.exitCodes.${wantCode}）`) : null,
      wrote === false ? null : { code: 'LOC-REJECT-NO-WRITE', message: `${where}：被拒的这一步**一个字节都不许写**，实得状态文件/文档变了（wrote=${JSON.stringify(wrote)}）` },
    ])
  }
  return compacts([
    got.ok === true ? null : { code: 'LOC-CLI', message: `${where}：这一步必须成功，实得 exit=${got.exit} code=${got.code ?? '(无)'} · ${got.stderr_head ?? ''}` },
  ])
}

// ═════════════════════════════════════════════════════════════════════════════
// REF：照 `CONTRACT.md` §12 写的**最小实现**（阳性对照 + 五把刀的载体）
// ═════════════════════════════════════════════════════════════════════════════
const REF_SOURCE = `// LOC-01 的阳性对照：照 CONTRACT.md §12 写的**最小实现**（**不是生产代码**，只住在运行根里）。
const FIELDS = ['memory_review', 'conversation', 'technical']

function emptyNode() {
  return {
    claim: null, state: 'unclaimed', job_id: null, liveness_at: null, failure_reason: null,
    report_path: null, report_sha256: null, findings_path: null, findings_set_sha256: null, findings_count: null,
    receipt_path: null, receipt_sha256: null, receipt_version: null, ticket_ids: [], artifact_paths: [],
  }
}

function emptyDoc({ project, day, snapshot, at }) {
  const doc = { schema: 1, day, project, snapshot, local_lease_minutes: 45, imported_proposal_ids: [], updated_at: at }
  for (const f of FIELDS) doc[f] = emptyNode()
  return doc
}

/** §12.1：claim 只动**它自己那个节点**（其余两个原样带过去）。 */
export function claimDoc(prev, call) {
  const state = prev === null || prev === undefined ? emptyDoc({ project: call.project, day: call.day, snapshot: 'v0', at: call.at }) : prev
  const next = { ...state, updated_at: call.at }
  next[call.field] = {
    ...state[call.field],
    claim: { attempt: call.attempt, job_id: call.jobId, claimed_at: call.at },
    state: 'running',
    job_id: call.jobId,
    liveness_at: call.at,
    failure_reason: null,
  }
  return { ok: true, code: null, doc: next }
}

/**
 * §12.2：落地（done）—— **先核产物锚点**（调用方给的 report_sha256 必须等于报告盘上字节的 SHA256），
 * 核不上 ⇒ 拒 \`E_ARG_HASH\`、**一个字节都不写**；核上了才落，claim 痕迹保留。
 */
export function markDoc(prev, call) {
  const want = String(call.payload.report_sha256 ?? '').toLowerCase()
  const actual = String(call.actualReportSha ?? '').toLowerCase()
  if (want === '' || want !== actual) return { ok: false, code: 'E_ARG_HASH', doc: prev }
  const next = { ...prev, updated_at: call.at }
  next[call.field] = {
    ...prev[call.field],
    state: 'done',
    report_path: call.payload.report_path,
    report_sha256: call.payload.report_sha256,
    findings_path: call.payload.findings_path,
    findings_set_sha256: call.payload.findings_set_sha256,
    findings_count: call.payload.findings_count,
    artifact_paths: call.payload.artifact_paths,
    liveness_at: call.at,
    failure_reason: null,
  }
  return { ok: true, code: null, doc: next }
}

/** §12.2：失败 ⇒ 原因**原文留住**（去掉首尾空白后逐字，与 \`lib/local-state.mjs:444\` 的 \`.trim()\` 同口径）。 */
export function failDoc(prev, call) {
  const next = { ...prev, updated_at: call.at }
  next[call.field] = { ...prev[call.field], state: 'failed', failure_reason: String(call.reason ?? '').trim(), liveness_at: call.at }
  return { ok: true, code: null, doc: next }
}

/** §12.3：读面 —— 三节点 + 一行摘要（形状与 \`--op local-read\` 的信封一致）。 */
export function readOutputOf(doc, statePath) {
  const nodes = {}
  for (const f of FIELDS) {
    nodes[f] = {
      state: doc[f].state,
      job_id: doc[f].job_id,
      liveness_at: doc[f].liveness_at,
      failure_reason: doc[f].failure_reason,
    }
  }
  return { ok: true, state: doc, state_path: statePath, summary: { project: doc.project, day: doc.day, snapshot: doc.snapshot, nodes }, project: doc.project, day: doc.day }
}
`

/**
 * 五把刀：`find` 必须在 `REF_SOURCE` 里**逐字**存在（找不到 ⇒ `KNIFE-LINE-MISSING`，这一刀没有落点）。
 * 期望向量是**从契约推出来的**（不是跑完再抄），**按输入**（`格:输入`）记；跑出来不一致就报 `KNIFE-WRONG-VECTOR`。
 *
 * ①「claim 丢掉按节点合并」：每次 claim 把三个节点重置成空、只填自己那个。
 *    `L1:A`/`L1:B`（先 claim 再 mark 同一个节点）里兄弟节点**本来就是空的** ⇒ 不受影响；`L2:A`/`L2:B`（claim 一个再 fail 同一个）同理；
 *    `L4:A`（只 claim 一个）同理 ⇒ **只有 `L3:A`**（两个节点各 claim 一次）会丢一个。
 * ②「fail 丢掉 reason」：只有失败那一支判 `failure_reason` 的取值 ⇒ `L2:A` + `L2:B`（两条同住一格的输入一起翻）。
 * ③「mark 不记锚点」：只有 `L1:A` 判 mark 的产物；`L1:B` 的 mark 在**核锚点那一步就被拒**，走不到赋值 ⇒ 只翻 `L1:A`。
 * ④「mark 不核锚点」：只有 `L1:B` 喂坏 hash ⇒ 只翻 `L1:B`（`L1:A` 的 hash 是对的，核了也过）。
 * ⑤「`emptyNode()` 丢掉那 10 个键」：它切的是**所有节点共用的骨架** ⇒ 每一条读节点键的输入都会翻
 *    （`L1:A`/`L1:B`/`L2:A`/`L3:A`/`L4:A`）；`L2:B` 只读 `state` / `failure_reason` / claim 痕迹，不看那 10 个键 ⇒ 它是唯一幸存的那条。
 */
const KNIVES = [
  {
    id: 'K1-CLAIM-NO-PER-NODE-MERGE',
    title: '刀① claim 丢掉按节点合并（每次把三个节点重置成空、只填自己那个）',
    find: `  const next = { ...state, updated_at: call.at }
  next[call.field] = {
    ...state[call.field],`,
    replace: `  const next = { ...state, updated_at: call.at }
  for (const f of FIELDS) next[f] = emptyNode()
  next[call.field] = {
    ...emptyNode(),`,
    want: ['L3:A'],
  },
  {
    id: 'K2-FAIL-DROPS-REASON',
    title: '刀② fail 丢掉原因（写成固定的「(没给原因)」）',
    find: `  next[call.field] = { ...prev[call.field], state: 'failed', failure_reason: String(call.reason ?? '').trim(), liveness_at: call.at }`,
    replace: `  next[call.field] = { ...prev[call.field], state: 'failed', failure_reason: '(没给原因)', liveness_at: call.at }`,
    want: ['L2:A', 'L2:B'],
  },
  {
    id: 'K3-MARK-WITHOUT-ANCHORS',
    title: '刀③ mark 不记锚点（产物路径 / SHA / 发现集 / artifact_paths 一律不写）',
    find: `    state: 'done',
    report_path: call.payload.report_path,
    report_sha256: call.payload.report_sha256,
    findings_path: call.payload.findings_path,
    findings_set_sha256: call.payload.findings_set_sha256,
    findings_count: call.payload.findings_count,
    artifact_paths: call.payload.artifact_paths,
    liveness_at: call.at,`,
    replace: `    state: 'done',
    liveness_at: call.at,`,
    want: ['L1:A'],
  },
  {
    id: 'K4-MARK-SKIPS-VERIFICATION',
    title: '刀④ mark 不核锚点（调用方说什么就是什么 —— `P2` 那一颗齿）',
    find: `  const want = String(call.payload.report_sha256 ?? '').toLowerCase()
  const actual = String(call.actualReportSha ?? '').toLowerCase()
  if (want === '' || want !== actual) return { ok: false, code: 'E_ARG_HASH', doc: prev }`,
    replace: `  // 刀④：不核锚点（调用方说什么就是什么）`,
    want: ['L1:B'],
  },
  {
    id: 'K5-EMPTY-NODE-SKELETON',
    title: '刀⑤ 空节点丢掉那 10 个键（`emptyNode()` 只剩 claim/state/job_id/liveness_at/failure_reason 五个）',
    find: `    report_path: null, report_sha256: null, findings_path: null, findings_set_sha256: null, findings_count: null,
    receipt_path: null, receipt_sha256: null, receipt_version: null, ticket_ids: [], artifact_paths: [],`,
    replace: `    // 刀⑤：剩下那 10 个键整段不写（空节点退回"只有 5 个键"的形状）`,
    want: ['L1:A', 'L1:B', 'L2:A', 'L3:A', 'L4:A'],
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// 四格 · 六条输入
// ═════════════════════════════════════════════════════════════════════════════
const CELLS = [
  {
    key: 'L1',
    title: 'claim → mark（成功一腿 + 坏锚点一腿；节点是 `technical` —— 唯一要 findings 产物的字段）',
    inputs: [
      {
        id: 'A',
        title: 'claim → mark：节点落到 done，五个产物锚点原样记下（报告与 findings 都是盘上真文件）',
        steps: [
          { kind: 'claim', field: 'technical', attempt: 1, jobId: JOB_TECH_MARK, at: T_CLAIM },
          { kind: 'mark', field: 'technical', at: T_MARK, payload: ART_TECH, reportSha: EXPECT_REPORT_SHA, writeArtifacts: true },
        ],
        check(doc, read) {
          const node = doc?.technical
          return compacts([
            doc === null ? { code: 'LOC-NO-FILE', message: 'claim → mark 之后读不到状态文件 —— 写面没落盘' } : null,
            eq('LOC-STATE-SHAPE', doc?.schema, 1, 'schema'),
            eq('LOC-STATE-SHAPE', doc?.day, DAY, 'day'),
            eq('LOC-STATE-SHAPE', doc?.project, PROJECT, 'project'),
            isObject(node) ? eq('LOC-RUNNING', node.state, 'done', 'claim → mark 之后该节点必须是 done') : { code: 'LOC-NODE-SHAPE', message: 'technical 节点不是一个对象' },
            isObject(node) ? eq('LOC-DONE-ANCHOR', node.report_path, ART_TECH.report_path, 'done 节点必须记下报告路径（相对工作区）') : null,
            isObject(node) ? eq('LOC-DONE-ANCHOR', node.report_sha256, EXPECT_REPORT_SHA, 'report_sha256 必须等于**报告盘上字节**的 SHA256（锚点来自作业产物，不来自回执自报）') : null,
            isObject(node) ? eq('LOC-DONE-ANCHOR', node.findings_path, ART_TECH.findings_path, 'done 节点必须记下 findings 路径') : null,
            isObject(node) ? eq('LOC-DONE-ANCHOR', node.findings_set_sha256, EXPECT_SET_SHA, 'findings_set_sha256 必须等于**那三条发现按 Q10 算出来**的值（不是手写常量、不是文件字节哈希）') : null,
            isObject(node) ? eq('LOC-DONE-ANCHOR', node.findings_count, FINDINGS_ENTRIES.length, 'findings_count 必须是**真条数**（三条发现 ⇒ 3）') : null,
            isObject(node) ? eq('LOC-DONE-ANCHOR', node.artifact_paths, ART_TECH.artifact_paths, 'artifact_paths 必须原样记下（那是**抄写**，不是锚点核对）') : null,
            isObject(node) ? eq('LOC-DONE-ANCHOR', node.failure_reason, null, 'done 的节点不许留着失败原因') : null,
            isObject(node) ? instant('LOC-DONE-ANCHOR', node.liveness_at, T_MARK, 'done 的 liveness_at 必须是**落地那一刻**（不是 claim 那一刻）') : null,
            ...claimTraceProblems('technical.claim', node, { jobId: JOB_TECH_MARK, attempt: 1, at: T_CLAIM }),
            ...emptyNodeProblems('conversation', doc?.conversation),
            ...emptyNodeProblems('memory_review', doc?.memory_review),
            ...readAgrees('L1:A', doc, read),
            eq('LOC-READ', read?.summary?.nodes?.technical?.state, 'done', 'local-read 的摘要里 technical 也必须是 done'),
            eq('LOC-READ', read?.summary?.nodes?.technical?.job_id, JOB_TECH_MARK, 'local-read 的摘要里 technical 的 job_id'),
          ])
        },
      },
      {
        id: 'B',
        title: '坏锚点反例：report_sha256 与报告盘上字节不符 ⇒ 拒 E_ARG_HASH，节点不许变 done',
        steps: [
          { kind: 'claim', field: 'technical', attempt: 1, jobId: JOB_TECH_BAD, at: T_CLAIM_B },
          { kind: 'mark', field: 'technical', at: T_BADMARK, payload: ART_TECH, reportSha: BAD_REPORT_SHA, writeArtifacts: true, expect: 'reject', rejectCode: 'E_ARG_HASH' },
        ],
        check(doc, read) {
          const node = doc?.technical
          return compacts([
            doc === null ? { code: 'LOC-NO-FILE', message: '坏锚点被拒之后状态文件不见了 —— 它该保持 claim 写完的那一份' } : null,
            isObject(node) ? eq('LOC-BAD-HASH', node.state, 'running', '坏锚点被拒之后，节点必须仍是 running（不许变成 done）') : { code: 'LOC-NODE-SHAPE', message: 'technical 节点不是一个对象' },
            isObject(node) ? eq('LOC-BAD-HASH', node.report_path, null, '被拒的 mark 不许在节点上留下报告路径') : null,
            isObject(node) ? eq('LOC-BAD-HASH', node.report_sha256, null, '被拒的 mark 不许在节点上留下 report_sha256（更不许留下**错的那个**）') : null,
            isObject(node) ? eq('LOC-BAD-HASH', node.findings_path, null, '被拒的 mark 不许在节点上留下 findings 路径') : null,
            isObject(node) ? eq('LOC-BAD-HASH', node.findings_set_sha256, null, '被拒的 mark 不许在节点上留下 findings_set_sha256') : null,
            isObject(node) ? eq('LOC-BAD-HASH', node.findings_count, null, '被拒的 mark 不许在节点上留下 findings_count（连 0 都不许写 —— 那是落地的痕迹）') : null,
            isObject(node) ? eq('LOC-BAD-HASH', node.artifact_paths, [], '被拒的 mark 不许写 artifact_paths') : null,
            isObject(node) ? instant('LOC-BAD-HASH', node.liveness_at, T_CLAIM_B, '被拒之后 liveness_at 必须还是 claim 那一刻（拒绝不是落地）') : null,
            ...claimTraceProblems('technical.claim', node, { jobId: JOB_TECH_BAD, attempt: 1, at: T_CLAIM_B }),
            ...readAgrees('L1:B', doc, read),
            eq('LOC-BAD-HASH', read?.summary?.nodes?.technical?.state, 'running', 'local-read 的摘要里也必须是 running'),
          ])
        },
      },
    ],
  },
  {
    key: 'L2',
    title: 'claim → fail（原文一腿 + 带首尾空白一腿）',
    inputs: [
      {
        id: 'A',
        title: 'claim → fail：节点落到 failed，reason 原文留住',
        steps: [
          { kind: 'claim', field: 'technical', attempt: 1, jobId: JOB_TECH, at: T_CLAIM },
          { kind: 'fail', field: 'technical', at: T_FAIL, reason: REASON_TECH },
        ],
        check(doc, read) {
          const node = doc?.technical
          return compacts([
            doc === null ? { code: 'LOC-NO-FILE', message: 'claim → fail 之后读不到状态文件 —— 写面没落盘' } : null,
            eq('LOC-STATE-SHAPE', doc?.day, DAY, 'day'),
            isObject(node) ? eq('LOC-RUNNING', node.state, 'failed', 'claim → fail 之后该节点必须是 failed') : { code: 'LOC-NODE-SHAPE', message: 'technical 节点不是一个对象' },
            isObject(node) ? eq('LOC-FAIL-REASON', node.failure_reason, REASON_TECH, 'failed 必须把 reason **原文**留住（换成"(没给原因)"就是这一格翻面）') : null,
            isObject(node) ? instant('LOC-FAIL-REASON', node.liveness_at, T_FAIL, 'failed 的 liveness_at 必须是失败那一刻') : null,
            // ⚠️ 下面这一格是**空形状读数**（这个节点从没 mark 过），不是"失败必清锚点"的判据：
            //    `applyFailure` 今天不清旧锚点 ⇒ `done → claim → fail` 会把旧 report_path 带进 failed（§12.5 第 5 条）。
            isObject(node) ? eq('LOC-NODE-SHAPE', node.report_path, null, '这个节点从没 mark 过 ⇒ report_path 是空形状的 null（**不是**"失败必清锚点"的判据）') : null,
            ...claimTraceProblems('technical.claim', node, { jobId: JOB_TECH, attempt: 1, at: T_CLAIM }),
            ...emptyNodeProblems('conversation', doc?.conversation),
            ...emptyNodeProblems('memory_review', doc?.memory_review),
            ...readAgrees('L2:A', doc, read),
            eq('LOC-READ', read?.summary?.nodes?.technical?.state, 'failed', 'local-read 的摘要里 technical 也必须是 failed'),
            eq('LOC-FAIL-REASON', read?.summary?.nodes?.technical?.failure_reason, REASON_TECH, 'local-read 的摘要里 failure_reason 必须与盘上同句'),
          ])
        },
      },
      {
        id: 'B',
        title: '带首尾空白的 reason：存下来的是 trim 之后的那一段（口径 = 去首尾空白，不是丢字）',
        steps: [
          { kind: 'claim', field: 'technical', attempt: 1, jobId: JOB_TECH_B, at: T_CLAIM_C },
          { kind: 'fail', field: 'technical', at: T_FAIL_PADDED, reason: REASON_PADDED },
        ],
        check(doc, read) {
          const node = doc?.technical
          return compacts([
            doc === null ? { code: 'LOC-NO-FILE', message: 'claim → fail（带空白）之后读不到状态文件' } : null,
            isObject(node) ? eq('LOC-RUNNING', node.state, 'failed', '带首尾空白的 reason 也要把节点落到 failed') : { code: 'LOC-NODE-SHAPE', message: 'technical 节点不是一个对象' },
            isObject(node) ? eq('LOC-FAIL-TRIM', node.failure_reason, REASON_PADDED_TRIMMED, '喂的首尾空白被 trim 掉之后，正文必须逐字相等（口径 = 去掉首尾空白，不是丢字、也不是 normalize 成别的话）') : null,
            isObject(node) && typeof node.failure_reason === 'string' ? eq('LOC-FAIL-TRIM', node.failure_reason.length, REASON_PADDED_TRIMMED.length, '存下来的长度必须等于 trim 之后的长度（多一个字符都不行）') : null,
            isObject(node) ? instant('LOC-FAIL-TRIM', node.liveness_at, T_FAIL_PADDED, 'failed 的 liveness_at 必须是失败那一刻') : null,
            ...claimTraceProblems('technical.claim', node, { jobId: JOB_TECH_B, attempt: 1, at: T_CLAIM_C }),
            ...readAgrees('L2:B', doc, read),
            eq('LOC-FAIL-TRIM', read?.summary?.nodes?.technical?.failure_reason, REASON_PADDED_TRIMMED, 'local-read 的摘要里也是 trim 之后那一段'),
          ])
        },
      },
    ],
  },
  {
    key: 'L3',
    title: '两个节点真并发 claim：谁都不许覆盖谁',
    inputs: [
      {
        id: 'A',
        title: '两个真子进程同时 claim conversation + technical',
        steps: [
          { kind: 'claim-parallel', at: T_PARALLEL, pairs: [
            { field: 'conversation', attempt: 1, jobId: JOB_CONV2 },
            { field: 'technical', attempt: 1, jobId: JOB_TECH2 },
          ] },
        ],
        check(doc, read) {
          const conv = doc?.conversation
          const tech = doc?.technical
          return compacts([
            doc === null ? { code: 'LOC-NO-FILE', message: '两个并行 claim 之后读不到状态文件 —— 写面没落盘' } : null,
            isObject(conv) ? eq('LOC-PARALLEL-LOST', conv.state, 'running', '并行 claim 之后 conversation 必须是 running（没落地就留在 running，不许消失）') : { code: 'LOC-PARALLEL-LOST', message: 'conversation 节点整个不见了 —— 被另一个 claim 覆盖掉了' },
            isObject(tech) ? eq('LOC-PARALLEL-LOST', tech.state, 'running', '并行 claim 之后 technical 必须是 running') : { code: 'LOC-PARALLEL-LOST', message: 'technical 节点整个不见了 —— 被另一个 claim 覆盖掉了' },
            isObject(conv) ? eq('LOC-PARALLEL-LOST', conv.job_id, JOB_CONV2, 'conversation 的 job_id 必须是它自己那一次派工（被覆盖就会变成别人的）') : null,
            isObject(tech) ? eq('LOC-PARALLEL-LOST', tech.job_id, JOB_TECH2, 'technical 的 job_id 必须是它自己那一次派工（被覆盖就会变成别人的）') : null,
            isObject(conv) ? instant('LOC-PARALLEL-LOST', conv.claim?.claimed_at, T_PARALLEL, 'conversation 的 claim 时刻') : null,
            isObject(tech) ? instant('LOC-PARALLEL-LOST', tech.claim?.claimed_at, T_PARALLEL, 'technical 的 claim 时刻') : null,
            ...emptyNodeProblems('memory_review', doc?.memory_review),
            ...readAgrees('L3:A', doc, read),
            eq('LOC-PARALLEL-LOST', read?.summary?.nodes?.conversation?.state, 'running', 'local-read 的摘要里 conversation 也是 running'),
            eq('LOC-PARALLEL-LOST', read?.summary?.nodes?.technical?.state, 'running', 'local-read 的摘要里 technical 也是 running'),
            eq('LOC-PARALLEL-LOST', read?.summary?.nodes?.memory_review?.state, 'unclaimed', 'local-read 的摘要里 memory_review 仍是 unclaimed'),
          ])
        },
      },
    ],
  },
  {
    key: 'L4',
    title: '任何 claim 之前 local-read：三节点"不在"，首个 claim 之后另外两个是空形状',
    inputs: [
      {
        id: 'A',
        title: '无 claim 的一读（E_DATA_MISSING）+ 首个 claim 之后的空形状',
        /**
         * 生产臂专有的那一半：**没有 REF 对应物**（REF 不是 CLI，它没有"文件不存在怎么报"这一层）。
         * 刀只能打在文档层那一半上 —— 这一点写进读数，不假装覆盖更宽。
         */
        beforeAnyClaim(ws) {
          const read = localRead(ws)
          const problems = compacts([
            read.exit === FROZEN.exitCodes.E_DATA_MISSING ? null : {
              code: 'LOC-ABSENT',
              message: `任何 claim 之前 local-read 必须报 E_DATA_MISSING（exit ${FROZEN.exitCodes.E_DATA_MISSING}），实得 exit=${read.exit} code=${read.code ?? '(无)'}${read.ok ? '（它 ok:true 了 —— "读不到"被当成"没有"）' : ''}`,
            },
            read.code === 'E_DATA_MISSING' ? null : { code: 'LOC-ABSENT', message: `任何 claim 之前的错误码必须是 E_DATA_MISSING，实得 ${JSON.stringify(read.code)}` },
            read.message.includes(statePathOf(ws)) ? null : { code: 'LOC-ABSENT', message: `报错必须点名那个路径（缺 ≠ 坏 ≠ 空）：期望含 ${JSON.stringify(statePathOf(ws))}，实得 ${JSON.stringify(read.message)}` },
            existsSync(statePathOf(ws)) ? { code: 'LOC-ABSENT', message: `任何 claim 之前不许有状态文件（读面零写入），实得在盘上：${statePathOf(ws)}` } : null,
          ])
          return { read, problems }
        },
        steps: [{ kind: 'claim', field: 'conversation', attempt: 1, jobId: JOB_CONV, at: T_SINGLE }],
        check(doc, read) {
          return compacts([
            doc === null ? { code: 'LOC-NO-FILE', message: '首个 claim 之后读不到状态文件' } : null,
            isObject(doc) ? eq('LOC-RUNNING', doc.conversation?.state, 'running', '首个 claim 之后 conversation 是 running') : null,
            // 文档里的空形状：**这两个节点从来没被 claim 过**，它们不是"不存在"，而是"已申报为空"
            ...emptyNodeProblems('technical', doc?.technical),
            ...emptyNodeProblems('memory_review', doc?.memory_review),
            ...readAgrees('L4:A', doc, read),
            eq('LOC-READ', read?.summary?.nodes?.technical?.state, 'unclaimed', '摘要里 technical 是 unclaimed'),
            eq('LOC-READ', read?.summary?.nodes?.technical?.job_id, null, '摘要里 technical 的 job_id 是 null'),
            eq('LOC-READ', read?.summary?.nodes?.memory_review?.state, 'unclaimed', '摘要里 memory_review 是 unclaimed'),
          ])
        },
      },
    ],
  },
]

/** 一条输入在读数/向量里的键：`格:输入`。 */
const inputKey = (cellKey, inputId) => `${cellKey}:${inputId}`

/** 一步该发的 payload（claim / fail / mark）；`mark` 的 payload 由产物常量 + 这一条输入自己的 hash 拼出来。 */
function payloadOf(step) {
  if (step.kind === 'claim') {
    return { day: DAY, project: PROJECT, field: FIELD_CLI[step.field] ?? step.field, attempt: step.attempt, job_id: step.jobId }
  }
  if (step.kind === 'fail') return { day: DAY, field: FIELD_CLI[step.field] ?? step.field, failure_reason: step.reason }
  if (step.kind === 'mark') {
    return {
      day: DAY,
      project: PROJECT,
      field: FIELD_CLI[step.field] ?? step.field,
      report_path: step.payload.report_path,
      report_sha256: step.reportSha ?? EXPECT_REPORT_SHA,
      findings_path: step.payload.findings_path,
      findings_set_sha256: step.payload.findings_set_sha256,
      findings_count: step.payload.findings_count,
      // 回执三件套（`F-162`）：有 `claim` 的 `technical` 必交（老板 2026-10-24 删掉了条件①）。
      receipt_path: step.payload.receipt_path,
      receipt_sha256: step.payload.receipt_sha256,
      receipt_version: step.payload.receipt_version,
      artifact_paths: step.payload.artifact_paths,
    }
  }
  return null
}

/** 生产臂：一条输入一个**新**工作区，逐步真跑；最后读盘 + `local-read`。 */
async function runInputProduction(cellKey, input) {
  const where = inputKey(cellKey, input.id)
  const ws = makeWorkspace('LOC-01', `${cellKey.toLowerCase()}-${input.id.toLowerCase()}`)
  const row = { cell: cellKey, input: input.id, key: where, title: input.title, workspace: ws, steps: [], problems: [] }
  if (existsSync(statePathOf(ws))) {
    row.problems.push({ code: 'LOC-STALE-WS', message: `${where}：工作区里**已经有**状态文件（${statePathOf(ws)}）—— 这一条要的是"从零开始"；读数会变成"上一跑留下的"，所以每条输入必须是一个全新的运行根（_runs\\<RUN_ID>）` })
  }
  if (input.beforeAnyClaim) {
    const pre = input.beforeAnyClaim(ws)
    row.pre_claim = { exit: pre.read.exit, code: pre.read.code, message: pre.read.message, state_path: pre.read.state_path, file_present: existsSync(statePathOf(ws)), dir_present: existsSync(localDirOf(ws)) }
    for (const p of pre.problems) row.problems.push(p)
  }
  for (const step of input.steps) {
    if (step.kind === 'mark' && step.writeArtifacts) {
      const files = writeArtifacts(ws)
      row.artifacts = {
        report: files.reportAbs,
        report_bytes: readFileSync(files.reportAbs).length,
        report_sha256_on_disk: sha256File(files.reportAbs),
        findings: files.findingsAbs,
        findings_bytes: readFileSync(files.findingsAbs).length,
        findings_sha256_on_disk: sha256File(files.findingsAbs),
        findings_entries: FINDINGS_ENTRIES.length,
        findings_set_sha256_fed: step.payload.findings_set_sha256,
        findings_count_fed: step.payload.findings_count,
        fed_sha256: step.reportSha ?? EXPECT_REPORT_SHA,
        // 回执（`F-162`）：喂的是**盘上字节**的 SHA256；节点里该存 `.team` 相对那一种路径。
        receipt: files.receiptAbs,
        receipt_bytes: readFileSync(files.receiptAbs).length,
        receipt_sha256_on_disk: sha256File(files.receiptAbs),
        receipt_sha256_fed: step.payload.receipt_sha256,
        receipt_version_fed: step.payload.receipt_version,
        receipt_path_fed: step.payload.receipt_path,
        receipt_path_expected_in_node: RECEIPT_REL_TEAM,
        note: '喂给 `local-mark` 的 `findings_set_sha256` 是**那三条发现的 Q10 摘要**，与 findings 文件字节的 SHA256 不是同一个值（两个都记在这儿，别互相冒充）；`receipt_sha256` 则是**回执盘上字节**的 SHA256（§12.2.4）。',
      }
    }
    if (step.kind === 'claim-parallel') {
      const before = fileShaOrNull(statePathOf(ws))
      const results = await localClaimParallel(ws, step.pairs, step.at)
      const after = fileShaOrNull(statePathOf(ws))
      for (const r of results) {
        row.steps.push({ kind: 'claim', field: r.field, at: step.at, expect: 'ok', exit: r.exit, code: r.code, ok: r.ok, parallel: true, ms: r.ms, stderr_head: r.stderr_head, state_sha_before: before, state_sha_after: after })
        row.problems.push(...judgeStep({ where: `${where}/${r.field}`, step: { kind: 'claim', expect: 'ok' }, got: r, wrote: null }))
      }
      if (row.problems.length > 0) break
      continue
    }
    const before = fileShaOrNull(statePathOf(ws))
    const res = localWrite(ws, `local-${step.kind}`, payloadOf(step), step.at)
    const after = fileShaOrNull(statePathOf(ws))
    row.steps.push({
      kind: step.kind, field: step.field, at: step.at, expect: step.expect ?? 'ok',
      exit: res.exit, code: res.code, ok: res.ok, stderr_head: res.stderr_head,
      state_sha_before: before, state_sha_after: after,
    })
    row.problems.push(...judgeStep({ where, step, got: res, wrote: before !== after }))
    if (row.problems.length > 0) break
  }
  const doc = readJsonOrNull(statePathOf(ws))
  const read = localRead(ws)
  const verdict = row.problems.length === 0 ? input.check(doc, read) : []
  row.doc = doc
  row.read = { exit: read.exit, ok: read.ok, code: read.code, state_path: read.state_path, summary: read.summary, agrees: JSON.stringify(read.state) === JSON.stringify(doc) }
  row.verdict = verdict
  row.held = row.problems.length === 0 && verdict.length === 0
  row.failed = [...row.problems, ...verdict].map((p) => p.code)
  return row
}

/** 阳性对照臂 / 刀臂：同一套 `steps`，喂 REF（或它的变异体）。 */
function runInputOnRef(mod, cellKey, input) {
  const where = inputKey(cellKey, input.id)
  let doc = null
  const steps = []
  const problems = []
  for (const step of input.steps) {
    const before = doc === null ? null : JSON.stringify(doc)
    let got = { ok: true, code: null }
    if (step.kind === 'claim') {
      got = mod.claimDoc(doc, { field: step.field, attempt: step.attempt, jobId: step.jobId, at: step.at, project: PROJECT, day: DAY })
      if (got.ok) doc = got.doc
    } else if (step.kind === 'claim-parallel') {
      // 两个进程在锁里一前一后落盘 ⇒ 后一个读到的是前一个写完的那一份
      for (const pair of step.pairs) {
        const r = mod.claimDoc(doc, { field: pair.field, attempt: pair.attempt, jobId: pair.jobId, at: step.at, project: PROJECT, day: DAY })
        if (!r.ok) { got = r; break }
        doc = r.doc
      }
    } else if (step.kind === 'mark') {
      // `actualReportSha` = 报告**盘上字节**的 hash（本文件从常量正文自己算出来，与生产臂写进盘的是同一份）
      got = mod.markDoc(doc, { field: step.field, at: step.at, payload: payloadOf(step), actualReportSha: EXPECT_REPORT_SHA })
      if (got.ok) doc = got.doc
    } else if (step.kind === 'fail') {
      got = mod.failDoc(doc, { field: step.field, at: step.at, reason: step.reason })
      if (got.ok) doc = got.doc
    }
    const after = doc === null ? null : JSON.stringify(doc)
    steps.push({ kind: step.kind, expect: step.expect ?? 'ok', ok: got.ok === true, code: got.code ?? null, wrote: before !== after })
    problems.push(...judgeStep({ where, step, got: { ok: got.ok === true, code: got.code ?? null }, wrote: before !== after }))
    if (!got.ok) break
  }
  const read = mod.readOutputOf(doc, statePathOf('<ref-ws>'))
  const plain = doc === null ? null : JSON.parse(JSON.stringify(doc))
  const verdict = problems.length === 0 ? input.check(plain, read) : []
  return { doc: plain, read, steps, problems, verdict, held: problems.length === 0 && verdict.length === 0, failed: [...problems, ...verdict].map((p) => p.code) }
}

// ═════════════════════════════════════════════════════════════════════════════
describe('integration · local state (LOC) · F-156 三个本地节点有确定的写者', () => {
  test('LOC-01 三节点五值（claim → running / mark → done + 产物锚点 / fail → failed + reason 原文 / 无 claim ⇒ E_DATA_MISSING）+ 坏锚点反例 + 阳性对照 + 五把刀', async () => {
    await runCase('LOC-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ── ⓪ 被测面读数（"我量的是哪一版"）──────────────────────────────────────
      rec.readings.sut = {}
      for (const rel of ['bin/agenia-local.mjs', 'lib/local-state.mjs', 'lib/atomic.mjs', 'lib/clock.mjs']) {
        const abs = stagingExists(rel) ? stagingPath(rel) : null
        rec.readings.sut[rel] = abs === null ? { missing: true } : { file: abs, bytes: readFileSync(abs).length, sha256: sha256File(abs) }
      }
      if (!stagingExists('bin/agenia-local.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 —— 三个写 op 与读面一个都拿不到（预期的首跑红）')
      }
      if (!process.env[ENV.NOW_FILE]) {
        push('LOC-CLOCK', 'AGENIA_NOW_FILE 没设置 —— 这一票的时间读数全靠注入式时钟（运行根会写一行）')
      }

      // ── ⓪' 喂给 `local-mark` 的两个 64 hex 是**算出来的**，不是手写的 ─────────────────
      /**
       * `report_sha256` = 报告正文的 SHA256（`sha256Text`）；`findings_set_sha256` = 三条发现的 Q10 摘要
       * （`support/verify-recompute.mjs::q10Digest`，测试侧**第二份**实现）。
       * 这里再拿**仓库里那把尺子**（`lib/receipt.mjs::findingsSetSha256`）核一次：
       * 两个值不同 ⇒ 我造的 findings 产物在 `VRF-02` / `receipt-check` 眼里不是同一份，这一格的读数就没有意义。
       */
      {
        const receipt = await loadStagedModule('lib/receipt.mjs', ['findingsSetSha256'])
        const stagedValue = typeof receipt.mod?.findingsSetSha256 === 'function'
          ? receipt.mod.findingsSetSha256(FINDINGS_ENTRIES)
          : null
        rec.readings.fed_digests = {
          report_sha256: { value: EXPECT_REPORT_SHA, from: 'sha256Text(REPORT_TEXT)', text_bytes: Buffer.byteLength(REPORT_TEXT, 'utf8') },
          findings_set_sha256: {
            value: EXPECT_SET_SHA,
            from: 'q10Digest(FINDINGS_ENTRIES)（`support/verify-recompute.mjs`，测试侧第二份实现）',
            entries: FINDINGS_ENTRIES.length,
            findings_file_bytes_sha256: sha256Text(FINDINGS_TEXT),
            staged_lib_value: stagedValue,
            staged_lib_file: receipt.mod === null ? null : stagingPath('lib/receipt.mjs'),
            staged_lib_note: stagedValue === null
              ? `判不了（${[...(receipt.missing ?? []), ...(receipt.errors ?? [])].join(' | ')}）：只记测试侧那个值`
              : '两个独立实现逐字相同',
          },
          why: '本格**没有任何手写摘要**：两个值都由真实内容算出来（一个伪造的 64 hex 照样能让旧版这一格全绿 —— 那正是这一条的来历）',
        }
        if (stagedValue !== null && stagedValue !== EXPECT_SET_SHA) {
          push('LOC-SET-DIGEST-SELFCHECK', `测试侧算出的 findings_set_sha256=${EXPECT_SET_SHA} ≠ 仓库 lib/receipt.mjs::findingsSetSha256=${stagedValue} —— 两套 Q10 实现不一致，喂进去的那个摘要不能代表这三条发现`)
        }
      }

      // ── ① 生产臂：六条输入，每条一个**新**工作区；L3:A 那一条是真并发 ──────────────
      const prodRows = []
      for (const cell of CELLS) {
        for (const input of cell.inputs) {
          const row = await runInputProduction(cell.key, input)
          prodRows.push(row)
          for (const p of [...row.problems, ...row.verdict]) push(p.code, `${row.key}（${input.title}）：${p.message}`)
        }
      }
      rec.readings.production = prodRows.map((r) => ({
        key: r.key,
        cell: r.cell,
        input: r.input,
        title: r.title,
        workspace: r.workspace,
        pre_claim: r.pre_claim ?? null,
        steps: r.steps,
        artifacts: r.artifacts ?? null,
        doc: r.doc,
        read: r.read,
        held: r.held,
        failed: r.failed,
        problems: [...r.problems, ...r.verdict].map((p) => p.message),
      }))
      /**
       * `L4:A` 的 CLI 层断言（`E_DATA_MISSING` + exit 7）**没有 REF 对应物**（REF 不是 CLI）。
       * 它能翻面的证据只能靠这一跑里的**两条断言**：文件不在（`L4:A` 的 `beforeAnyClaim`）⇒ exit 7 / 码 / 点名路径；
       * 文件在（`L1:A` 的 `readAgrees` 里 `read.ok === true`）⇒ exit 0。这一节只是那两条的**读数**，不是第三条证据。
       */
      {
        const absent = prodRows.find((r) => r.key === 'L4:A')?.pre_claim ?? null
        const present = prodRows.find((r) => r.key === 'L1:A')?.read ?? null
        rec.readings.absent_vs_present = {
          same_tool: 'localRead(ws)（同一个读面调用器）',
          absent: absent === null ? null : { exit: absent.exit, code: absent.code, file_present: absent.file_present, message: absent.message },
          present: present === null ? null : { exit: present.exit, ok: present.ok, code: present.code },
          distinguish: absent !== null && present !== null && absent.exit !== present.exit,
          why: 'L4:A 的 CLI 层没有 REF 可打刀 ⇒ 它能不能翻面只能由两条**断言**合起来证（`beforeAnyClaim` + `readAgrees`）；这一节只记那两条的读数',
        }
      }

      // ── ② 阳性对照：照 §12 写的最小实现，六条输入必须**全部**成立 ─────────────────
      let ref = null
      const refRows = []
      try {
        ref = await importSource(fixtureDir('LOC-01', 'local-ref'), 'ref', REF_SOURCE)
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小实现 import 失败（阳性对照这一条不成立）：${String(err?.message ?? err).slice(0, 200)}`)
      }
      if (ref !== null) {
        for (const cell of CELLS) {
          for (const input of cell.inputs) {
            const r = runInputOnRef(ref.mod, cell.key, input)
            refRows.push({ key: inputKey(cell.key, input.id), held: r.held, steps: r.steps, failed: r.failed, problems: [...r.problems, ...r.verdict].map((p) => `${p.code} ${p.message}`) })
            for (const p of [...r.problems, ...r.verdict]) {
              push('CONTROL-REF-CELL',
                `阳性对照（照 §12 的最小实现）在 ${inputKey(cell.key, input.id)} 没成立：${p.message}`
                + ' —— 要么这一条写得不可实现，要么最小实现写错了；这两件事必须分开处理，不许拿"实现还没做"糊过去')
            }
          }
        }
        rec.readings.ref = {
          kind: 'reference',
          file: ref.file,
          bytes: ref.bytes,
          sha256: ref.sha256,
          rows: refRows,
          covers: '文档层（盘上那份文件 + local-read 的 state/summary）与**两步的期望**（成功 / 被拒）；'
            + '**不覆盖** CLI 层（"文件不在怎么报"那一半只有生产臂有）',
        }
      }

      // ── ③ 五把刀：每把只该翻**契约推出**的那几条输入 ─────────────────────────────
      const knifeRows = []
      for (const knife of KNIVES) {
        if (ref === null) {
          push('KNIFE-NO-BASELINE', `${knife.id}：阳性对照没起来 ⇒ 这一刀没有可比的对象（刀与基线是两件事，缺一条这一票不算数）`)
          continue
        }
        if (!REF_SOURCE.includes(knife.find)) {
          push('KNIFE-LINE-MISSING', `${knife.id}：REF 里找不到要切的那几行（这一刀没有落点，证明不了任何事）：${JSON.stringify(knife.find.slice(0, 140))}`)
          continue
        }
        const mutated = REF_SOURCE.replace(knife.find, knife.replace)
        let mod = null
        try {
          mod = await importSource(fixtureDir('LOC-01', 'local-ref'), knife.id.toLowerCase(), mutated)
        } catch (err) {
          push('KNIFE-IMPORT', `${knife.id}：刀出了 import 失败（那不是"变红"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`)
          continue
        }
        const flipped = []
        for (const cell of CELLS) {
          for (const input of cell.inputs) {
            const r = runInputOnRef(mod.mod, cell.key, input)
            if (!r.held) flipped.push({ key: inputKey(cell.key, input.id), codes: r.failed })
          }
        }
        const got = flipped.map((f) => f.key)
        knifeRows.push({ id: knife.id, title: knife.title, file: mod.file, sha256: mod.sha256, flipped: got, details: flipped, want: knife.want })
        if (JSON.stringify(got) !== JSON.stringify(knife.want)) {
          push('KNIFE-WRONG-VECTOR',
            `${knife.id}（${knife.title}）：翻面的输入是 ${JSON.stringify(got)}，契约推出的是 ${JSON.stringify(knife.want)}`
            + ' —— 一个变异体只证一格（mig-rules-16）：多翻说明那一支与别的输入共用同一处判据，少翻说明这刀没切到它')
        }
      }
      rec.readings.knives = {
        subject: 'reference',
        scope: '只在**文档层 + 两步期望**上量（盘上那份文件、local-read 的 state/summary、成功/被拒两种期望）；'
          + 'CLI 层（`E_DATA_MISSING` / exit 7）没有 REF 对应物 ⇒ 刀碰不到它',
        why: '刀打在最小实现的字节上，**不碰 `presets/**`**：生产里那三个 op 已经是对的（见 `situation`）',
        rows: knifeRows,
      }

      // ── ④ 今天读到的情况（这一格为什么该绿、绿在哪，写清楚）──────────────────────
      const prodHeld = prodRows.filter((r) => r.held).length
      const totalInputs = CELLS.reduce((n, c) => n + c.inputs.length, 0)
      rec.readings.situation = {
        measured_at_note: '门 2 第 2 关 + 第 4 关复审后返修 · 2026-10-23（读数见 `production` 六条与 `ref` 六条）',
        ops_already_correct: prodHeld === totalInputs,
        cells_held: prodHeld,
        cells_total: totalInputs,
        red_today: totalInputs - prodHeld,
        why_this_ticket_is_not_a_first_run_red: '定形「验收口径」#1 说"功能还没做时测试必须是红的"；这一票要补的是**调用者**（组长流程），'
          + '而 `bin/agenia-local.mjs` 的三个写 op **本来就对**（今天现量）⇒ 按 #1 的第二种情形办：断言"已写入契约的三态语义"，'
          + '今天 RED 0。它红只可能是**有人把这条语义改坏了**（回归锁）。',
        what_is_still_missing_outside_this_case: '**没有一个执行的调用者**：三份作业书里现在有这三个 op 的名字，但那三句声明的是「**作业不调**」；'
          + '组长的开工 / 收工清单里仍然没有这三个调用 —— 那一半是流程（`CONTRACT.md` §12.2 + 组长那一侧），测试判不了"谁记不记得"。',
        gate4_rework: '第 4 关评审（🟠 有条件）的 `P2` / `P7` 落在本文件：`L1:B` 坏锚点反例（+ 刀④）· `L2:B` 带首尾空白的 reason；'
          + '`P8` 记进边界（失败不清旧锚点；`L2:A` 那一格是空形状读数）；`P9` 不在这里 —— 它另落了一份读数'
          + '（`f156-cli-reading-2.txt`：三节点三个不同 job_id），旧那份保留原样。',
      }

      // ── ⑤ 边界 ────────────────────────────────────────────────────────────
      rec.readings.boundary = {
        who_writes: '**不判"谁来调"**：写者是组长（§12.2），那属于流程；本格判的是"调了之后盘上那份文件对不对"。',
        stale_not_judged: '`running` 过期变 `stale` 是**健康卡读的时候算出来的**（`age >= 45` 分钟，`lib/health.mjs`），'
          + '`local-read` 仍返回原始 `running`；那一格归 `HLT-02` / 租约那一族。本格只把"`running` 是一等状态、不许被后一个 claim 吞掉"钉在 `L3:A` 上。',
        failure_does_not_clear_anchors: '**不判"失败会不会清掉上一轮的锚点"**（评审 `P8`）：`applyFailure` 今天只写 state / failure_reason / liveness_at，'
          + '所以 `done → claim → fail` 会把旧 report_path 带进 failed；本格没走那条路径。`L2:A` 里 `report_path === null` 是"**从没 mark 过**的空形状读数"，不是"失败必清锚点"的判据。',
        additive_keys: '加性键（`receipt_versions` / `failure_history`）**不判名字**（`lib/local-state.mjs:105` 明写"测试不许断言名字"）—— 空节点只判 15 个必填键。',
        artifact_paths: '`artifact_paths` 不是锚点（只是自报路径）：锚点只认 `report_sha256` 与**盘上字节**的比对；`findings_set_sha256` 的**内容语义**归 `receipt-check` / `VRF-02`，本格只判"抄下来的值 = 那三条发现算出来的值"。',
        fed_digests: '本格喂的两个 64 hex **都是算出来的**：`report_sha256` 来自报告正文、`findings_set_sha256` 来自三条真实发现的 Q10 摘要（测试侧第二份实现，另用 `lib/receipt.mjs` 复核一次）。**没有任何手写摘要** —— 伪造的 64 hex 能过闸，那正是这条腿的来历。',
        per_field_rule_not_here: '**按字段的必填规则不在本格**（老板 2026-10-24 的裁定：`technical` 要 findings，`memory_review` / `conversation` 只要报告）：'
          + '本格把 `L1` 的节点放在 `technical` 上，是因为它是唯一需要 findings 产物的字段；另外两个字段的"只交报告 ⇒ `done`"归同一批的 `LOC-02`。',
        anchor_verification: '`L1:B` 锁的是**核对**（喂一个与盘上字节不符的 hash ⇒ 必须拒 + 零写入），`L1:A` 锁的是**抄写**（记下的值等于盘上字节的 hash）—— 两条合起来才等于 §12.2 那半句。',
        reason_trim: '`failure_reason` 的口径 = **去掉首尾空白后逐字**（`lib/local-state.mjs:444` 的 `.trim()`）：`L2:B` 喂带首尾空白的原文，判存下来的是 trim 之后那一段（长度也要对）。',
        clock: '时间全部取**注入式时钟**（`AGENIA_NOW_FILE`），比的是**同一个时刻**（`Date.parse`），不是同一个写法。',
        locks: '**不判**锁与原子写的实现（`E_LOCK_*` / `wx` / `rename` = `STO-*` 的事）：`L3:A` 只判"两个真子进程同时 claim 之后盘上那份文件是什么样"。',
        read_side_zero_write: '`L4:A` 判的是"读面不建那份文件"（它今天也不建目录）—— 目录存在与否只记读数，不当判据。',
      }

      caseFail(problems)
    })
  })
})
