/**
 * `RCP-05` · **回执三件套进 `local-mark`**（`F-162` · 门 2 · 2026-10-24）—— 这一族的第一格判据。
 *
 * 病根（`CONTRACT.md` §12.2.4 逐字，证据 `.team/review/2026-10-24/F-162-第4关-评审.md` §7）：
 *   `local-mark --field technical` **收下**了 `receipt_path` / `receipt_sha256` / `receipt_version`、
 *   返回 `ok: true`，可 `state/local/<day>.json` 里那三格回读**全是 `null`** ⇒ 健康卡**常驻**
 *   `RED E_RECEIPT_ANCHOR`（三份产物都在盘上，卡还是红的）。
 *   第 4 关评审点名的硬门：这一族**一条判据都没量过** —— 全套 23 个 `technical` 输入一个都不带三件套，
 *   唯一的证据是开发侧的一次性探针（`.team/dev/2026-10-24/_tmp/f162-receipt-probe.mjs`，**不在套件里**）。
 *
 * 一格 · 十三种输入（键写作 `格:输入`），**全部走"必交"那一支**（先 `claim` ⇒ 节点有 `claim.job_id`；
 * 回执真的写在 `.team/leader/<day>/` 下）。老板 2026-10-24 的裁定：**删掉条件①（"回执已落盘"），
 * 留住条件②（`claim.job_id`）** ⇒ `technical` 有 claim 就必交回执三件套。
 *   `A`  三件齐全且正确（摘要 = 回执**盘上字节**的 SHA256、版本 = 回执声明的 `version`）⇒ `done`；
 *        节点三格 + `local-read` 三格都要读得到，且**摘要 ≠ 回执自报的那个值**（自报不算锚）；
 *        落盘路径必须是 **`.team` 相对**（`leader/<day>/技术复盘回执.json`，不带 `.team/`）。
 *   `B0` 一件都不给（`technical` + claim ⇒ 必交）⇒ `E_ARG_SCHEMA` · exit 2 · **零写入** · 节点仍 `running`；
 *   `B1`/`B2`/`B3` **半套**（只给 path / 只给 sha / 只给 version）⇒ 同一个 `E_ARG_SCHEMA` · exit 2 · 零写入；
 *   `C`  摘要与**盘上字节**不符（64 hex，但错）⇒ `E_ARG_HASH` · exit 2 · 零写入（自报摘要不算锚）；
 *   `D1`/`D2`/`D3` 回执**没声明整数 `version`**（缺字段 / `"2"` 字符串 / `0`）⇒ `E_DATA_CORRUPT` · exit 7 ·
 *        零写入 —— 与 findings 那一侧（"文件在盘上却读不出数组"）同一条规矩：读不出来不是"没有意见"；
 *   `E1`/`E2` `memory_review` / `conversation` **交任一件回执锚点** ⇒ `E_ARG_SCHEMA` · exit 2 · 零写入
 *        （收下再丢掉正是本节的病根）；
 *   `F`  回执落在 `<工作区>/.team/` **外面**（工作区根下）⇒ `E_DATA_MISSING` · exit 7 · 零写入
 *        （缺 / 在外 / 拼错同一个诊断，与 §12.2.2 一致）；
 *   `G`  `receipt_version` 与回执声明的 `version` **不符**（登记 3、文件 2）⇒ `E_ARG_SCHEMA` · exit 2 · 零写入。
 *
 * 阳性对照 + 三把刀（刀打在**本文件里那份照裁定写的最小实现**上，`presets/**` 一个字节都不碰）：
 *   · `REF`：`claimDoc` / `markDoc` / `readOutputOf`；`markDoc` **自己读盘**（落点、摘要、版本、档位）——
 *     证明这十三条规则**是可实现的**，不是"只有今天这份实现才过"。十三条输入喂它必须**全部**成立。
 *     档位照老板的裁定：`technical` 有 `claim.job_id` ⇒ `required`，`memory_review` / `conversation` ⇒ `forbidden`。
 *     ⚠️ 这一格**可以**这么写，是因为十三种输入的回执都真的落在盘上 ⇒ 裁定前后的两条档位规则**在每一条输入上同解**
 *     （都走 `required`）—— 所以这一格不随"条件①删不删"翻面（附读数 `readings.policy_stability`）。
 *   · `KR1`（`applyMark` 里删掉 `receipt_path` / `receipt_sha256` / `receipt_version` 三行写回）⇒ 只翻 `A`
 *     （**这就是 `F-162` 的病根本身**）；
 *   · `KR2`（档位收窄那一处恒给 `optional`）⇒ 只翻 `B0`（"该要而没给"那一格）；
 *   · `KR3`（`receipt_sha256` 不与盘上字节对账）⇒ 只翻 `C`。
 *     向量是**先按规则推、跑完再对**；对不上 ⇒ `KNIFE-WRONG-VECTOR`（多翻 = 那一支与别的规则共用判据，
 *     少翻 = 这刀没切到它）。三把刀在**全部十三种输入**上量（"只翻本格"是读数，不是声明）。
 *
 * 边界（这一格**不覆盖**什么，写清，别假装更宽）：
 *   1. **不判回执的内容对不对**（`report.sha256` / `findings_set_sha256` / 票覆盖那一套归 `receipt-check` / `VRF-02`）：
 *      本格喂的回执**结构是真的**（`schema` / `version` / `day` / `report` / `handover`），但闸只核"字节与形状"。
 *   2. **不判** `receipt_versions` 这个加性键的名字与内容（`CONTRACT.md` §12.5 明写不许断言加性键名）。
 *   3. **不判** `local-receipt-set` / `receipt-check` / 健康卡（那三处归 `RCP-03` / `VRF-02` / `HLT-01`～`HLT-03`）。
 *   4. **不判**加锁与原子写（`STO-*`）；本格只在"该被拒的那一步一个字节都没写"这一层用状态文件 SHA256 量。
 *   5. **CLI 层没有 REF 对应物**：`E_ARG_HASH` / `E_DATA_CORRUPT` / exit 7 这些"谁拒、退几"只有生产臂有；
 *      刀只能证"文档层那一半"能翻面。生产臂的判据本身来自真子进程的退出码与错误码。
 *   6. **`D` 那三条今天（实现未落地之前）是红的**（回执没声明 `version` 时闸静默跳过对账，见评审 `R6`）；
 *      这一格照**裁定**写（`E_DATA_CORRUPT`），不许为迁就现状改软。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256File, sha256Text } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { fixtureDir, q10Digest } from '../support/verify-recompute.mjs'
import { runLocal, stagingExists, stagingPath, writeFixture } from '../support/sut.mjs'

before(() => {
  preflight()
})

// ── 现场常量（都从裁定 / 契约 / 盘上事实里来，不从"我算的"里取）──────────────────────
const DAY = '2026-10-24'
const PROJECT = 'harness'
const RECEIPT_VERSION = 2
const RECEIPT_DECLARED_SHA = 'd'.repeat(64) // 回执自己声明的那个值（**故意不等于**它的字节摘要）
const WRONG_RECEIPT_SHA = 'a'.repeat(64)

/** 三个节点在文件里的键名（`LOCAL_FIELDS`）与 CLI 的 `--field` 拼法各写一份 —— 两者**故意不同**。 */
const FIELD_CLI = { conversation: 'conversation', technical: 'technical', memory_review: 'memory-review' }
const FIELDS = ['memory_review', 'conversation', 'technical']

/** 每条输入的时刻（claim / 落地**互不相同**，`liveness_at` 的读数因此能指认是哪一条）。 */
const clockAt = (i, plus) => `2026-10-24T${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 10 + plus).padStart(2, '0')}:00+08:00`

// ── 产物（**真字节**）：报告 / findings / 回执 ────────────────────────────────────────
const REPORT_TEXT = '# 技术评审报告（RCP-05 的产物）\n\n窗口：2026-10-23 04:00 – 2026-10-24 04:00。\n正文三行。\n'
const REPORT_REL = '.team/retro/2026-10-24/技术评审.md'
const REPORT_SHA = sha256Text(REPORT_TEXT)
const FINDINGS_REL = '.team/retro/2026-10-24/技术评审.findings.json'
const ENTRIES = [
  {
    id: 'RCP-1',
    title: '回执三件套收下了却不落盘',
    severity: 'P1',
    evidence: [{ kind: 'file', ref: REPORT_REL }],
    summary: 'local-mark 返回 ok:true，state/local/<day>.json 里三格全是 null。',
  },
]
const SET_SHA = q10Digest(ENTRIES)
const FINDINGS_TEXT = `${JSON.stringify({
  schema: 1,
  day: DAY,
  report_path: REPORT_REL,
  report_sha256: REPORT_SHA,
  generated_at: '2026-10-24T14:50:00+08:00',
  findings: ENTRIES,
  findings_set_sha256: SET_SHA,
}, null, 2)}\n`

/** 回执的落点：`RECEIPT_REL_TEAM` = 节点里**该存**的那一种（`.team` 相对）；`RECEIPT_REL_FED` = 调用方喂的规范形。 */
const RECEIPT_REL_TEAM = `leader/${DAY}/技术复盘回执.json`
const RECEIPT_REL_FED = `.team/${RECEIPT_REL_TEAM}`
const RECEIPT_REL_OUTSIDE = 'outside-rcp05/技术复盘回执.json'

/** 一份**结构真**的回执（形状照 `.team/leader/2026-10-24/技术复盘回执.json` 那份现场产物）。 */
const receiptText = (over = {}) => `${JSON.stringify({
  schema: 1,
  version: RECEIPT_VERSION,
  day: DAY,
  project: 'harness',
  generated_at: '2026-10-24T14:40:00+08:00',
  handover: { mode: 'fresh' },
  report: { path: REPORT_REL, sha256: REPORT_SHA, findings_path: FINDINGS_REL },
  findings_set_sha256: SET_SHA,
  findings_count: ENTRIES.length,
  findings: ENTRIES.map((row) => ({ id: row.id, disposition: 'adopted', ticket_id: 'F-162', next_step: '（夹具）' })),
  receipt_sha256: RECEIPT_DECLARED_SHA,
  ...over,
}, null, 2)}\n`

/** 三份"坏版本"回执（`D` 那一族）：都没声明整数 `version`。 */
const receiptMissingVersionText = () => {
  const doc = JSON.parse(receiptText())
  delete doc.version
  return `${JSON.stringify(doc, null, 2)}\n`
}
const receiptStringVersionText = () => receiptText({ version: '2' })
const receiptZeroVersionText = () => receiptText({ version: 0 })

/**
 * 节点的 **15 个必填键**（`presets/agenia/lib/local-state.mjs` 的 `NODE_REQUIRED`，逐字抄）
 * —— 手抄是刻意的：拿被测模块的常量当期望值就是自证。
 */
const NODE_REQUIRED = [
  'claim', 'state', 'job_id', 'liveness_at', 'failure_reason',
  'report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count',
  'receipt_path', 'receipt_sha256', 'receipt_version', 'ticket_ids', 'artifact_paths',
]
const NODE_NULL_WHEN_EMPTY = [
  'claim', 'job_id', 'liveness_at', 'failure_reason',
  'report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count',
  'receipt_path', 'receipt_sha256', 'receipt_version',
]
/** 被拒的 `local-mark` 六个锚点一个都不许落。 */
const ANCHOR_KEYS = [
  'report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count',
  'receipt_path', 'receipt_sha256', 'receipt_version',
]

// ── 小工具 ────────────────────────────────────────────────────────────────
const statePathOf = (ws) => path.join(ws, '.team', 'state', 'local', `${DAY}.json`)
const statePathTail = (p) => String(p ?? '').replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean).slice(-4).join('/')
const EXPECT_STATE_TAIL = `.team/state/local/${DAY}.json`
const sameInstant = (a, b) => {
  const ta = Date.parse(String(a ?? ''))
  const tb = Date.parse(String(b ?? ''))
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb
}
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const keyOf = (input) => `${input.cell}:${input.id}`

function readJsonOrNull(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** 一个文件的 SHA256（不在盘上 ⇒ `null`）—— 被拒的那一步"零写入"靠它量。 */
function fileShaOrNull(file) {
  try {
    return sha256File(file)
  } catch {
    return null
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

/** 跑一节时把**注入式时钟**挪到 `iso`，跑完（**无论成不成**）还原 —— 运行根那一份是共享的。 */
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

/** 落一份源码到运行根之下并 import 它（URL 带哈希 ⇒ 同一进程里不会拿到缓存里的旧字节）。 */
async function importSource(dir, name, source) {
  const sub = path.join(dir, name)
  mkdirSync(sub, { recursive: true })
  const file = path.join(sub, 'receipt-trio.mjs')
  writeFileSync(file, source, 'utf8')
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex')
  const mod = await import(`${pathToFileURL(file).href}?sha256=${sha256}`)
  return { mod, file, sha256, bytes: Buffer.byteLength(source, 'utf8') }
}

/** 在 `ws` 下写一份文件（`rel` 用 `/`，相对**工作区**）。 */
function writeUnder(ws, rel, text) {
  const abs = path.join(ws, ...String(rel).split('/'))
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')
  return abs
}

// ── 真 CLI 调用 ────────────────────────────────────────────────────────────
let fixtureSeq = 0
function payloadFile(label, payload) {
  fixtureSeq += 1
  return writeFixture('RCP-05', `in-${label}-${fixtureSeq}`, payload)
}

/** 一次写 op（真子进程 · 注入式时钟）。返回 `{ok, exit, code, message, policy, stderr_head}`。 */
function localWrite(ws, op, payload, atIso) {
  const inFile = payloadFile(op, payload)
  let res = null
  withClock(atIso, () => {
    res = runLocal('RCP-05', op, undefined, { workspace: ws, inFile })
  })
  return {
    ok: res !== null && res.exit_code === 0 && res.json?.ok === true,
    exit: res?.exit_code ?? null,
    code: res?.json?.error?.code ?? null,
    message: String(res?.json?.error?.message ?? ''),
    policy: res?.json?.receipt_policy ?? res?.json?.error?.details?.receipt_policy ?? null,
    anchors_out: res?.json?.anchors ?? null,
    ignored_keys: res?.json?.ignored_keys ?? null,
    stderr_head: String(res?.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' | '),
  }
}

/** 一次 `local-read`（真子进程）。返回信封的几格 + 盘上那份文档（**一扇门两个读数**）。 */
function localRead(ws) {
  const res = runLocal('RCP-05', 'local-read', { day: DAY }, { workspace: ws })
  return {
    ok: res.exit_code === 0 && res.json?.ok === true,
    exit: res.exit_code,
    code: res.json?.error?.code ?? null,
    state: res.json?.state ?? null,
    state_path: res.json?.state_path ?? null,
    summary: res.json?.summary ?? null,
    project: res.json?.project ?? null,
    day: res.json?.day ?? null,
    stderr_head: String(res.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' | '),
    on_disk: readJsonOrNull(statePathOf(ws)),
  }
}

// ── 断言小工具：每条返回 `{code, message}`，`null` 表示成立 ──────────────────────
const eq = (code, got, want, why) => (JSON.stringify(got) === JSON.stringify(want)
  ? null
  : { code, message: `${why}：期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}` })

const instant = (code, got, want, why) => (sameInstant(got, want)
  ? null
  : { code, message: `${why}：期望与 ${JSON.stringify(want)} 同一个时刻，实得 ${JSON.stringify(got)}` })

const compacts = (list) => list.filter((p) => p !== null)

/** 一个**没跑过**的节点必须是文档里的空形状（15 个必填键、该 null 的 null、该 `[]` 的 `[]`）。 */
function emptyNodeProblems(where, node) {
  if (!isObject(node)) return [{ code: 'RCP-NODE-SHAPE', message: `${where}：节点不是一个对象（${JSON.stringify(node)}）` }]
  const keys = Object.keys(node)
  const missing = NODE_REQUIRED.filter((k) => !keys.includes(k))
  return compacts([
    missing.length === 0 ? null : { code: 'RCP-NODE-SHAPE', message: `${where}：空节点缺必填键 ${JSON.stringify(missing)}` },
    eq('RCP-NODE-SHAPE', node.state, 'unclaimed', `${where}：没被 claim 过的节点 state 必须是 unclaimed`),
    ...NODE_NULL_WHEN_EMPTY.map((k) => eq('RCP-NODE-SHAPE', node[k], null, `${where}：空节点的 ${k} 必须是 null`)),
    eq('RCP-NODE-SHAPE', node.ticket_ids, [], `${where}：空节点的 ticket_ids 必须是 []`),
    eq('RCP-NODE-SHAPE', node.artifact_paths, [], `${where}：空节点的 artifact_paths 必须是 []`),
  ])
}

/** 兄弟两个节点一个字都不许动。 */
function siblingProblems(where, doc, field) {
  return FIELDS.filter((f) => f !== field).flatMap((f) => emptyNodeProblems(`${where}/${f}`, doc?.[f]))
}

/** 跑过的节点：状态 + claim 痕迹（`claim` / `job_id` 不许被落地动作抹掉）。 */
function claimTraceProblems(where, node, { jobId, attempt, at: claimedAt }) {
  if (!isObject(node)) return [{ code: 'RCP-CLAIM-TRACE', message: `${where}：节点不是一个对象` }]
  return compacts([
    eq('RCP-CLAIM-TRACE', node.job_id, jobId, `${where}：节点的 job_id 必须指得出是哪一次派工`),
    isObject(node.claim) ? null : { code: 'RCP-CLAIM-TRACE', message: `${where}：节点的 claim 不是一个对象（${JSON.stringify(node.claim)}）—— claim 痕迹被抹掉了` },
    isObject(node.claim) ? eq('RCP-CLAIM-TRACE', node.claim.job_id, jobId, `${where}：claim.job_id`) : null,
    isObject(node.claim) ? eq('RCP-CLAIM-TRACE', node.claim.attempt, attempt, `${where}：claim.attempt`) : null,
    isObject(node.claim) ? instant('RCP-CLAIM-TRACE', node.claim.claimed_at, claimedAt, `${where}：claim.claimed_at 是**claim 那一刻**，落地动作不许改写它`) : null,
  ])
}

/** `local-read` 那一扇门与盘上那份文件必须说同一件事。 */
function readAgrees(where, doc, read) {
  if (read === null) return [{ code: 'RCP-READ', message: `${where}：没有 local-read 的读数` }]
  return compacts([
    read.ok ? null : { code: 'RCP-READ', message: `${where}：local-read 必须可用（正例），实得 exit=${read.exit} code=${read.code ?? '(无)'} · ${read.stderr_head}` },
    eq('RCP-READ', statePathTail(read.state_path), EXPECT_STATE_TAIL, `${where}：local-read 的 state_path 必须指着这一天那个文件（尾巴）`),
    doc === null ? null : eq('RCP-READ-DISAGREE', read.state, doc, `${where}：local-read 的 state 与盘上那份文件必须是同一份`),
    eq('RCP-READ', read.project, PROJECT, `${where}：local-read 的 project`),
    eq('RCP-READ', read.day, DAY, `${where}：local-read 的 day`),
  ])
}

/**
 * 一步的**期望**：`ok` 必须成功；`reject` 必须被拒、码对、退出码对、**而且一个字节都不许写**
 * （`wrote` 由两条臂各自量：生产臂比状态文件的 SHA256，REF 臂比序列化后的文档）。
 */
function judgeStep({ where, step, got, wrote }) {
  const expect = step.expect ?? 'ok'
  if (expect === 'reject') {
    const wantCode = step.rejectCode
    const wantExit = FROZEN.exitCodes[wantCode]
    return compacts([
      got.ok === false ? null : { code: 'RCP-REJECT', message: `${where}：这一步必须被拒（${wantCode}），实得成功（exit=${got.exit}）—— 闸没拦住` },
      got.ok === false ? eq('RCP-REJECT', got.code, wantCode, `${where}：拒绝码必须是 ${wantCode}`) : null,
      got.ok === false && got.exit !== undefined && got.exit !== null ? eq('RCP-REJECT-EXIT', got.exit, wantExit, `${where}：拒绝的退出码（FROZEN.exitCodes.${wantCode}）`) : null,
      wrote === false ? null : { code: 'RCP-REJECT-NO-WRITE', message: `${where}：被拒的这一步**一个字节都不许写**，实得状态文件/文档变了（wrote=${JSON.stringify(wrote)}）` },
    ])
  }
  return compacts([
    got.ok === true ? null : { code: 'RCP-CLI', message: `${where}：这一步必须成功，实得 exit=${got.exit} code=${got.code ?? '(无)'} · ${got.stderr_head ?? ''}` },
  ])
}

/**
 * `A`（三件齐全）的判据 —— **逐字比，不是"有值就算过"**：
 *   ① 节点三格有值；② 摘要 = **回执盘上字节**的 SHA256（在 check 里**现读盘重算**，不信 payload）；
 *   ③ 摘要 **≠** 回执自己声明的那个值（自报不算锚）；④ 路径是 **`.team` 相对**那一种；
 *   ⑤ 版本 = 回执声明的 `version`；⑥ `local-read` 三格与盘上同值；⑦ 报告 / findings 五个锚点仍在。
 */
function fullTrioProblems(where, doc, read, { field, receiptAbs, jobId, claimAt, markAt }) {
  const node = doc?.[field]
  const actualSha = fileShaOrNull(receiptAbs)
  return compacts([
    doc === null ? { code: 'RCP-NO-FILE', message: `${where}：mark 成功之后读不到状态文件 —— 写面没落盘` } : null,
    eq('RCP-STATE-SHAPE', doc?.day, DAY, `${where}：状态文件的 day`),
    isObject(node) ? eq('RCP-DONE', node.state, 'done', `${where}：mark 之后 ${field} 必须是 done`) : { code: 'RCP-NODE-SHAPE', message: `${where}：${field} 节点不是一个对象` },
    isObject(node) ? eq('RCP-TRIO', node.receipt_path, RECEIPT_REL_TEAM, `${where}：节点里的 receipt_path 必须是 **.team 相对**那一种（不带 .team/）—— 两扇读者（lib/health.mjs / receipt-check）只认它`) : null,
    isObject(node) ? eq('RCP-TRIO', node.receipt_sha256, actualSha, `${where}：节点里的 receipt_sha256 必须等于**回执盘上字节**的 SHA256（现读盘重算）`) : null,
    isObject(node) ? (node.receipt_sha256 === RECEIPT_DECLARED_SHA ? { code: 'RCP-TRIO-SELFREPORT', message: `${where}：节点里的 receipt_sha256 是**回执自报**的那个值（${RECEIPT_DECLARED_SHA.slice(0, 12)}…）—— 自报的摘要不算锚` } : null) : null,
    isObject(node) ? eq('RCP-TRIO', node.receipt_version, RECEIPT_VERSION, `${where}：节点里的 receipt_version 必须是回执声明的那个整数版本`) : null,
    isObject(node) ? eq('RCP-TRIO-SHAPE', Number.isInteger(node.receipt_version), true, `${where}：receipt_version 必须是整数（不是字符串）`) : null,
    isObject(node) ? eq('RCP-DONE', node.report_sha256, REPORT_SHA, `${where}：报告锚点必须仍在（回执三件套不许把别的锚点顶掉）`) : null,
    isObject(node) ? eq('RCP-DONE', node.findings_set_sha256, SET_SHA, `${where}：findings 锚点必须仍在`) : null,
    isObject(node) ? eq('RCP-DONE', node.failure_reason, null, `${where}：done 的节点不许留着失败原因`) : null,
    isObject(node) ? instant('RCP-DONE', node.liveness_at, markAt, `${where}：done 的 liveness_at 必须是**落地那一刻**（不是 claim 那一刻）`) : null,
    ...claimTraceProblems(`${field}.claim`, node, { jobId, attempt: 1, at: claimAt }),
    ...siblingProblems(where, doc, field),
    ...readAgrees(where, doc, read),
    eq('RCP-READ', read?.state?.[field]?.receipt_path, RECEIPT_REL_TEAM, `${where}：local-read 的 receipt_path 必须读得到（且是 .team 相对那一种）`),
    eq('RCP-READ', read?.state?.[field]?.receipt_sha256, actualSha, `${where}：local-read 的 receipt_sha256 必须等于盘上字节的 SHA256`),
    eq('RCP-READ', read?.state?.[field]?.receipt_version, RECEIPT_VERSION, `${where}：local-read 的 receipt_version`),
    eq('RCP-READ', read?.summary?.nodes?.[field]?.state, 'done', `${where}：local-read 的摘要里 ${field} 也必须是 done`),
  ])
}

/** 被拒的 mark：节点仍 `running`、六个锚点一个都不许落、`artifact_paths` 仍是 `[]`、落地时刻没动。 */
function rejectedProblems(where, doc, read, { field, jobId, claimAt }) {
  const node = doc?.[field]
  return compacts([
    doc === null ? { code: 'RCP-NO-FILE', message: `${where}：被拒之后状态文件不见了 —— 它该保持 claim 写完的那一份` } : null,
    isObject(node) ? eq('RCP-REJECT', node.state, 'running', `${where}：被拒之后 ${field} 必须仍是 running（拒绝不是落地）`) : { code: 'RCP-NODE-SHAPE', message: `${where}：${field} 节点不是一个对象` },
    ...ANCHOR_KEYS.map((k) => (isObject(node) ? eq('RCP-REJECT', node[k], null, `${where}：被拒的 mark 不许在节点上留下 ${k}`) : null)),
    isObject(node) ? eq('RCP-REJECT', node.artifact_paths, [], `${where}：被拒的 mark 不许写 artifact_paths`) : null,
    isObject(node) ? instant('RCP-REJECT', node.liveness_at, claimAt, `${where}：被拒之后 liveness_at 必须还是 claim 那一刻`) : null,
    ...claimTraceProblems(`${field}.claim`, node, { jobId, attempt: 1, at: claimAt }),
    ...readAgrees(where, doc, read),
    eq('RCP-REJECT', read?.summary?.nodes?.[field]?.state, 'running', `${where}：local-read 的摘要里也必须是 running`),
  ])
}

// ═════════════════════════════════════════════════════════════════════════════
// 十三种输入 · 一格
// ═════════════════════════════════════════════════════════════════════════════

/** mark 的 payload（`day` / `project` / `field` 由跑的人补；这里只放这一条输入自己的锚点）。 */
function markPayload({ field, receiptPath = null, receiptSha = null, receiptVersion = null }) {
  const payload = {
    report_path: REPORT_REL,
    report_sha256: REPORT_SHA,
  }
  // `memory_review` / `conversation` 不交 findings（按字段：只有 technical 要发现集）
  if (field === 'technical') {
    payload.findings_path = FINDINGS_REL
    payload.findings_set_sha256 = SET_SHA
    payload.findings_count = ENTRIES.length
  }
  if (receiptPath !== null) payload.receipt_path = receiptPath
  if (receiptSha !== null) payload.receipt_sha256 = receiptSha
  if (receiptVersion !== null) payload.receipt_version = receiptVersion
  return payload
}

/** 每个输入自己那三样产物的写法（报告 / findings 一律先落；回执按各自的形状落）。 */
function baseArtifacts(ws) {
  writeUnder(ws, REPORT_REL, REPORT_TEXT)
  writeUnder(ws, FINDINGS_REL, FINDINGS_TEXT)
}

/**
 * 十三条输入。`writeReceipt(ws)` 返回回执的**绝对路径**（A 那一格要拿它现读盘重算摘要）。
 * `receipt` 那一栏是"这条输入的回执文本"，`null` = 这条输入不落回执。
 */
const INPUTS = [
  {
    cell: 'RCP-05',
    id: 'A',
    title: '三件齐全且正确 ⇒ done；节点三格 = 盘上字节的 SHA256 / .team 相对路径 / 回执声明的版本；local-read 读得到',
    field: 'technical',
    expect: 'ok',
    writeReceipt: () => receiptText(),
    payloadFor: (receiptAbs) => markPayload({
      field: 'technical',
      receiptPath: RECEIPT_REL_FED,
      receiptSha: fileShaOrNull(receiptAbs),
      receiptVersion: RECEIPT_VERSION,
    }),
    check(doc, read, input) {
      return fullTrioProblems(keyOf(input), doc, read, {
        field: 'technical',
        receiptAbs: path.join(input.workspace, ...RECEIPT_REL_FED.split('/')),
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'RCP-05',
    id: 'B0',
    title: 'technical + claim（必交那一支）却一件都不给 ⇒ E_ARG_SCHEMA · 零写入 · 节点仍 running',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    writeReceipt: () => receiptText(),
    payloadFor: () => markPayload({ field: 'technical' }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'B1',
    title: '半套（只给 receipt_path）⇒ E_ARG_SCHEMA · 零写入 · 节点仍 running',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    writeReceipt: () => receiptText(),
    payloadFor: () => markPayload({ field: 'technical', receiptPath: RECEIPT_REL_FED }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'B2',
    title: '半套（只给 receipt_sha256）⇒ E_ARG_SCHEMA · 零写入 · 节点仍 running',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    writeReceipt: () => receiptText(),
    payloadFor: (receiptAbs) => markPayload({ field: 'technical', receiptSha: fileShaOrNull(receiptAbs) }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'B3',
    title: '半套（只给 receipt_version）⇒ E_ARG_SCHEMA · 零写入 · 节点仍 running',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    writeReceipt: () => receiptText(),
    payloadFor: () => markPayload({ field: 'technical', receiptVersion: RECEIPT_VERSION }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'C',
    title: '摘要与回执**盘上字节**不符（自报 aaaa…）⇒ E_ARG_HASH · 零写入 · 节点仍 running',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_HASH',
    writeReceipt: () => receiptText(),
    payloadFor: () => markPayload({ field: 'technical', receiptPath: RECEIPT_REL_FED, receiptSha: WRONG_RECEIPT_SHA, receiptVersion: RECEIPT_VERSION }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'D1',
    title: '回执**没有** version 字段 ⇒ E_DATA_CORRUPT · exit 7 · 零写入（读不出来不是"没有意见"）',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_CORRUPT',
    writeReceipt: () => receiptMissingVersionText(),
    payloadFor: (receiptAbs) => markPayload({ field: 'technical', receiptPath: RECEIPT_REL_FED, receiptSha: fileShaOrNull(receiptAbs), receiptVersion: RECEIPT_VERSION }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'D2',
    title: '回执的 version 写成字符串 "2"（不是整数）⇒ E_DATA_CORRUPT · exit 7 · 零写入',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_CORRUPT',
    writeReceipt: () => receiptStringVersionText(),
    payloadFor: (receiptAbs) => markPayload({ field: 'technical', receiptPath: RECEIPT_REL_FED, receiptSha: fileShaOrNull(receiptAbs), receiptVersion: RECEIPT_VERSION }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'D3',
    title: '回执的 version 是 0（不是 ≥1 的整数）⇒ E_DATA_CORRUPT · exit 7 · 零写入',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_CORRUPT',
    writeReceipt: () => receiptZeroVersionText(),
    payloadFor: (receiptAbs) => markPayload({ field: 'technical', receiptPath: RECEIPT_REL_FED, receiptSha: fileShaOrNull(receiptAbs), receiptVersion: 1 }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'E1',
    title: 'memory_review 交**全套**回执锚点 ⇒ E_ARG_SCHEMA · 零写入（收下再丢掉正是本节的病根）',
    field: 'memory_review',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    writeReceipt: () => receiptText(),
    payloadFor: (receiptAbs) => markPayload({ field: 'memory_review', receiptPath: RECEIPT_REL_FED, receiptSha: fileShaOrNull(receiptAbs), receiptVersion: RECEIPT_VERSION }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'memory_review', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'E2',
    title: 'conversation 只交 receipt_path ⇒ 同一个 E_ARG_SCHEMA · 零写入',
    field: 'conversation',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    writeReceipt: () => receiptText(),
    payloadFor: () => markPayload({ field: 'conversation', receiptPath: RECEIPT_REL_FED }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'conversation', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'F',
    title: '回执落在 <工作区>/.team/ 外面（工作区根下）⇒ E_DATA_MISSING · exit 7 · 零写入',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_MISSING',
    writeReceipt: () => receiptText(),
    receiptRelOverride: RECEIPT_REL_OUTSIDE,
    payloadFor: (receiptAbs) => markPayload({ field: 'technical', receiptPath: RECEIPT_REL_OUTSIDE, receiptSha: fileShaOrNull(receiptAbs), receiptVersion: RECEIPT_VERSION }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'RCP-05',
    id: 'G',
    title: 'receipt_version 与回执声明的 version 不符（登记 3、文件 2）⇒ E_ARG_SCHEMA · 零写入',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    writeReceipt: () => receiptText(),
    payloadFor: (receiptAbs) => markPayload({ field: 'technical', receiptPath: RECEIPT_REL_FED, receiptSha: fileShaOrNull(receiptAbs), receiptVersion: RECEIPT_VERSION + 1 }),
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
]

const inputsOf = (cell) => INPUTS.filter((input) => input.cell === cell)

// ═════════════════════════════════════════════════════════════════════════════
// REF：照（回执三件套 + 白名单写回 + 老板 2026-10-24 的裁定）写的**最小实现**
//      （阳性对照 + 三把刀的载体；不是生产代码，只住在运行根里）
// ═════════════════════════════════════════════════════════════════════════════
const REF_SOURCE = `// RCP-05 的阳性对照：照 CONTRACT.md §12.2.4 写的**最小实现**（不是生产代码，只住在运行根里）。
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const FIELDS = ['memory_review', 'conversation', 'technical']
/** 回执三件套的档位表（一处）：技术复盘那一场是唯一要回执的字段。 */
const RECEIPT_FORBIDDEN = { memory_review: true, conversation: true, technical: false }
/** findings 三件套按字段：只有 technical 必填。 */
const REQUIRES_FINDINGS = { memory_review: false, conversation: false, technical: true }
const SHA_RE = /^[0-9a-f]{64}$/
const isFilled = (v) => typeof v === 'string' && v.trim() !== ''
const isSha = (v) => SHA_RE.test(String(v === null || v === undefined ? '' : v).trim().toLowerCase())

function emptyNode() {
  return {
    claim: null, state: 'unclaimed', job_id: null, liveness_at: null, failure_reason: null,
    report_path: null, report_sha256: null, findings_path: null, findings_set_sha256: null, findings_count: null,
    receipt_path: null, receipt_sha256: null, receipt_version: null, ticket_ids: [], artifact_paths: [],
  }
}

function emptyDoc(call) {
  const doc = { schema: 1, day: call.day, project: call.project, snapshot: 'v0', local_lease_minutes: 45, imported_proposal_ids: [], updated_at: call.at }
  for (const f of FIELDS) doc[f] = emptyNode()
  return doc
}

export function claimDoc(prev, call) {
  const state = prev === null || prev === undefined ? emptyDoc(call) : prev
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

/** \`abs\` 在 \`<工作区>/.team/\` 里吗（用 path.relative 判 —— 跟着平台路径语义走）。 */
function insideTeam(teamRoot, abs) {
  const delta = path.relative(teamRoot, abs)
  if (delta === '' || path.isAbsolute(delta)) return false
  return delta !== '..' && !delta.startsWith('..' + path.sep)
}

/** 一个锚点路径 → 绝对路径：只要它解析到 \`<工作区>/.team/\` 里的一个真文件就收，否则 null。 */
function resolveAnchor(workspace, rel) {
  if (!isFilled(rel)) return null
  const text = String(rel).trim()
  const root = path.resolve(workspace)
  const teamRoot = path.join(root, '.team')
  const candidates = path.isAbsolute(text) ? [text] : [path.resolve(root, text), path.resolve(teamRoot, text)]
  for (const candidate of candidates) {
    const abs = path.resolve(candidate)
    if (!insideTeam(teamRoot, abs)) continue
    if (!existsSync(abs) || !statSync(abs).isFile()) continue
    return abs
  }
  return null
}

/** 回执里声明的整数版本（≥1）；读不出来 / 没有那个字段 ⇒ null。 */
function declaredVersionOf(abs) {
  let doc = null
  try {
    doc = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (err) {
    return null
  }
  return Number.isInteger(doc?.version) && doc.version >= 1 ? doc.version : null
}

export function markDoc(prev, call) {
  const p = call.payload || {}
  const field = call.field
  const problems = []
  const bad = (code, detail) => problems.push({ code: code, detail: detail })

  // ── 报告锚点（三个字段都要）──
  const reportAbs = resolveAnchor(call.workspace, p.report_path)
  if (reportAbs === null) bad('E_DATA_MISSING', 'report_path 必须解析到 <工作区>/.team/ 里的一个真文件')
  if (!isSha(p.report_sha256)) bad('E_ARG_HASH', 'report_sha256 必须是 64 hex')

  // ── findings 三件套（按字段）──
  const needFindings = REQUIRES_FINDINGS[field] === true
  const findingsGiven = isFilled(p.findings_path)
  if (needFindings && !findingsGiven) bad('E_ARG_SCHEMA', 'technical 必须交 findings 产物（findings_path 必填）')
  else if (!findingsGiven && ((p.findings_set_sha256 !== undefined && p.findings_set_sha256 !== null) || (p.findings_count !== undefined && p.findings_count !== null))) {
    bad('E_ARG_SCHEMA', 'findings 三个锚点要么都给、要么都不给')
  }
  let findingsAbs = null
  if (findingsGiven) {
    findingsAbs = resolveAnchor(call.workspace, p.findings_path)
    if (findingsAbs === null) bad('E_DATA_MISSING', 'findings_path 必须解析到 <工作区>/.team/ 里的一个真文件')
    else {
      let count = null
      try {
        const obj = JSON.parse(readFileSync(findingsAbs, 'utf8'))
        if (Array.isArray(obj.findings)) count = obj.findings.length
      } catch (err) {
        count = null
      }
      if (count === null) bad('E_DATA_CORRUPT', 'findings 文件里没有 findings 数组')
      else if (p.findings_count !== count) bad('E_ARG_SCHEMA', 'findings_count 与 findings 文件的条数对不上')
    }
    if (!isSha(p.findings_set_sha256)) bad('E_ARG_HASH', 'findings_set_sha256 必须是 64 hex')
    if (!Number.isInteger(p.findings_count) || p.findings_count < 0) bad('E_ARG_SCHEMA', 'findings_count 必须是 >=0 的整数')
  }

  // ── 回执三件套（按字段 + 老板 2026-10-24 的裁定：有 claim 就必交）──
  const pathGiven = isFilled(p.receipt_path)
  const shaGiven = p.receipt_sha256 !== undefined && p.receipt_sha256 !== null
  const verGiven = p.receipt_version !== undefined && p.receipt_version !== null
  const anyGiven = pathGiven || shaGiven || verGiven
  const dispatched = isFilled(p.__claim_job_id)
  // 🔴 刀 KR2 的落点就在这一行：档位收窄（required | optional）。forbidden 那一档不在它的作用域里。
  const policy = RECEIPT_FORBIDDEN[field] === true ? 'forbidden' : (dispatched ? 'required' : 'optional')
  const missing = [pathGiven ? null : 'receipt_path', shaGiven ? null : 'receipt_sha256', verGiven ? null : 'receipt_version'].filter((k) => k !== null)
  if (policy === 'forbidden') {
    if (anyGiven) bad('E_ARG_SCHEMA', (field || '这一场') + ' 不收回执锚点，却给了回执三件套里的一件或多件')
  } else if (!anyGiven) {
    if (policy === 'required') bad('E_ARG_SCHEMA', (field || '这一场') + ' 必须交回执三件套：receipt_path / receipt_sha256 / receipt_version 三个都要')
  } else {
    if (missing.length > 0) bad('E_ARG_SCHEMA', '回执三件套要么都给、要么都不给（缺 ' + missing.join(' + ') + '）')
    if (pathGiven && resolveAnchor(call.workspace, p.receipt_path) === null) bad('E_DATA_MISSING', 'receipt_path 必须解析到 <工作区>/.team/ 里的一个真文件')
    if (shaGiven && !isSha(p.receipt_sha256)) bad('E_ARG_HASH', 'receipt_sha256 必须是 64 hex')
    if (verGiven && (!Number.isInteger(p.receipt_version) || p.receipt_version < 1)) bad('E_ARG_SCHEMA', 'receipt_version 必须是 >=1 的整数')
  }

  if (problems.length > 0) return { ok: false, code: problems[0].code, detail: problems[0].detail, doc: prev }

  // ── 形状都对：摘要必须与**盘上字节**逐字相同；回执没声明整数版本 ⇒ 数据坏了 ──
  const actualReport = createHash('sha256').update(readFileSync(reportAbs)).digest('hex')
  if (actualReport !== String(p.report_sha256).trim().toLowerCase()) {
    return { ok: false, code: 'E_ARG_HASH', detail: 'report_sha256 与报告盘上字节对不上', doc: prev }
  }
  let receiptAbs = null
  let actualReceipt = null
  let declared = null
  if (pathGiven) {
    receiptAbs = resolveAnchor(call.workspace, p.receipt_path)
    if (receiptAbs !== null) {
      actualReceipt = createHash('sha256').update(readFileSync(receiptAbs)).digest('hex')
      if (actualReceipt !== String(p.receipt_sha256).trim().toLowerCase()) {
        return { ok: false, code: 'E_ARG_HASH', detail: 'receipt_sha256 与回执盘上字节对不上（自报的摘要不算锚）', doc: prev }
      }
      declared = declaredVersionOf(receiptAbs)
      if (declared === null) return { ok: false, code: 'E_DATA_CORRUPT', detail: '回执里没有整数 version（读不出来或形状不对）', doc: prev }
      if (declared !== p.receipt_version) return { ok: false, code: 'E_ARG_SCHEMA', detail: 'receipt_version 与回执里声明的 version 对不上', doc: prev }
    }
  }

  const node = prev[field]
  const next = { ...prev, updated_at: call.at }
  next[field] = {
    ...node,
    state: 'done',
    report_path: '.team/' + path.relative(path.join(path.resolve(call.workspace), '.team'), reportAbs).split(path.sep).join('/'),
    report_sha256: String(p.report_sha256).trim().toLowerCase(),
    findings_path: findingsAbs === null ? null : '.team/' + path.relative(path.join(path.resolve(call.workspace), '.team'), findingsAbs).split(path.sep).join('/'),
    findings_set_sha256: findingsAbs === null ? null : String(p.findings_set_sha256).trim().toLowerCase(),
    findings_count: findingsAbs === null ? null : p.findings_count,
    artifact_paths: Array.isArray(p.artifact_paths) ? p.artifact_paths.map(String) : node.artifact_paths,
    liveness_at: call.at,
    failure_reason: null,
  }
  // ── 回执三件套：写回的是**闸核过**的那一份（路径按 .team 相对、摘要取盘上字节、版本取声明的那个）──
  if (receiptAbs !== null) {
    next[field].receipt_path = path.relative(path.join(path.resolve(call.workspace), '.team'), receiptAbs).split(path.sep).join('/')
    next[field].receipt_sha256 = actualReceipt
    next[field].receipt_version = declared
  }
  return { ok: true, code: null, doc: next }
}

export function readOutputOf(doc, statePath) {
  const nodes = {}
  for (const f of FIELDS) {
    nodes[f] = { state: doc[f].state, job_id: doc[f].job_id, liveness_at: doc[f].liveness_at, failure_reason: doc[f].failure_reason }
  }
  return { ok: true, state: doc, state_path: statePath, summary: { project: doc.project, day: doc.day, snapshot: doc.snapshot, nodes: nodes }, project: doc.project, day: doc.day }
}
`

/**
 * 三把刀：`find` 必须在 `REF_SOURCE` 里**逐字**存在（找不到 ⇒ 这一刀没有落点）。
 * 期望向量是**从规则推出来的**（不是跑完再抄），按 `格:输入` 记；跑出来不一致 ⇒ `KNIFE-WRONG-VECTOR`。
 * 向量在**全部十三种输入**上量 ⇒ "只翻本格"是读数，不是声明。
 */
const KNIVES = [
  {
    id: 'KR1-NO-TRIO-WRITE',
    title: 'KR1 · `applyMark` 里删掉 `receipt_path` / `receipt_sha256` / `receipt_version` 三行写回（`F-162` 的病根本身）',
    cell: 'RCP-05',
    find: `  if (receiptAbs !== null) {
    next[field].receipt_path = path.relative(path.join(path.resolve(call.workspace), '.team'), receiptAbs).split(path.sep).join('/')
    next[field].receipt_sha256 = actualReceipt
    next[field].receipt_version = declared
  }`,
    replace: `  // KR1：收下三件套、一个都不写回（这就是 F-162 的病根）`,
    want: ['RCP-05:A'],
  },
  {
    id: 'KR2-POLICY-OPTIONAL',
    title: 'KR2 · 档位收窄那一处恒给 `optional`（该要的不要了）',
    cell: 'RCP-05',
    find: `  const policy = RECEIPT_FORBIDDEN[field] === true ? 'forbidden' : (dispatched ? 'required' : 'optional')`,
    replace: `  const policy = RECEIPT_FORBIDDEN[field] === true ? 'forbidden' : 'optional'`,
    want: ['RCP-05:B0'],
  },
  {
    id: 'KR3-NO-DIGEST-CHECK',
    title: 'KR3 · `receipt_sha256` 不与回执盘上字节对账（自报的摘要也算锚）',
    cell: 'RCP-05',
    find: `      if (actualReceipt !== String(p.receipt_sha256).trim().toLowerCase()) {
        return { ok: false, code: 'E_ARG_HASH', detail: 'receipt_sha256 与回执盘上字节对不上（自报的摘要不算锚）', doc: prev }
      }`,
    replace: `      // KR3：不拿 receipt_sha256 与盘上字节对账（收下自报的那个值）`,
    want: ['RCP-05:C'],
  },
]

// ── 生产臂 / REF 臂 ────────────────────────────────────────────────────────
/** 生产臂：一条输入一个**新**工作区，claim → 落产物 → mark，逐步真跑；最后读盘 + `local-read`。 */
function runInputProduction(input, index) {
  const where = keyOf(input)
  const ws = makeWorkspace(input.cell, `${input.cell.toLowerCase()}-${input.id.toLowerCase()}`)
  input.workspace = ws
  const claimAt = clockAt(index, 0)
  const markAt = clockAt(index, 4)
  input.claimAt = claimAt
  input.markAt = markAt
  input.jobId = `job-rcp05-${String(input.id).toLowerCase()}`
  const row = { key: where, cell: input.cell, input: input.id, title: input.title, field: input.field, workspace: ws, steps: [], problems: [] }
  if (existsSync(statePathOf(ws))) {
    row.problems.push(problem('RCP-STALE-WS', `${where}：工作区里**已经有**状态文件（${statePathOf(ws)}）—— 这一条要的是"从零开始"`))
  }
  const claim = localWrite(ws, 'local-claim', { day: DAY, project: PROJECT, field: FIELD_CLI[input.field], attempt: 1, job_id: input.jobId }, claimAt)
  row.steps.push({ kind: 'claim', at: claimAt, expect: 'ok', exit: claim.exit, code: claim.code, ok: claim.ok, state_sha_after: fileShaOrNull(statePathOf(ws)) })
  row.problems.push(...judgeStep({ where: `${where}/claim`, step: { kind: 'claim', expect: 'ok' }, got: claim, wrote: null }))

  baseArtifacts(ws)
  const receiptBody = input.writeReceipt()
  const receiptAbs = writeUnder(ws, input.receiptRelOverride ?? RECEIPT_REL_FED, receiptBody)
  row.receipt = {
    file: receiptAbs,
    on_disk_bytes: receiptAbs === null ? null : readFileSync(receiptAbs).length,
    on_disk_sha256: receiptAbs === null ? null : sha256File(receiptAbs),
    self_declared_sha256: RECEIPT_DECLARED_SHA,
    declared_version_in_file: (() => {
      if (receiptAbs === null) return null
      try {
        return readJsonOrNull(receiptAbs)?.version ?? null
      } catch {
        return null
      }
    })(),
  }
  const payload = input.payloadFor(receiptAbs)
  row.payload = payload
  const before = fileShaOrNull(statePathOf(ws))
  const marked = localWrite(ws, 'local-mark', { day: DAY, project: PROJECT, field: FIELD_CLI[input.field], ...payload }, markAt)
  const after = fileShaOrNull(statePathOf(ws))
  row.steps.push({
    kind: 'mark', at: markAt, expect: input.expect, reject_code: input.rejectCode ?? null,
    exit: marked.exit, code: marked.code, ok: marked.ok, message: String(marked.message).slice(0, 160),
    receipt_policy: marked.policy, state_sha_before: before, state_sha_after: after, state_written: before !== after,
  })
  row.problems.push(...judgeStep({ where: `${where}/mark`, step: { expect: input.expect, rejectCode: input.rejectCode }, got: marked, wrote: before !== after }))

  const doc = readJsonOrNull(statePathOf(ws))
  const read = localRead(ws)
  const verdict = row.problems.length === 0 ? input.check(doc, read, input) : []
  row.doc = doc
  row.read = { exit: read.exit, ok: read.ok, code: read.code, state_path: read.state_path, summary: read.summary, agrees: JSON.stringify(read.state) === JSON.stringify(doc) }
  row.verdict = verdict
  row.held = row.problems.length === 0 && verdict.length === 0
  row.failed = [...row.problems, ...verdict].map((p) => p.code)
  return row
}

/** REF 臂 / 刀臂：同一套输入喂 REF（或它的变异体）；REF **自己读盘**。 */
function runInputOnRef(mod, input, index) {
  const where = keyOf(input)
  const ws = makeWorkspace(input.cell, `ref-${input.cell.toLowerCase()}-${input.id.toLowerCase()}`)
  const claimAt = clockAt(index, 0)
  const markAt = clockAt(index, 4)
  const jobId = `job-rcp05-ref-${String(input.id).toLowerCase()}`
  const problems = []
  const steps = []
  let doc = null

  let got = mod.claimDoc(doc, { field: input.field, attempt: 1, jobId, at: claimAt, project: PROJECT, day: DAY })
  if (got.ok) doc = got.doc
  steps.push({ kind: 'claim', ok: got.ok === true, code: got.code ?? null })
  problems.push(...judgeStep({ where: `${where}/claim`, step: { kind: 'claim', expect: 'ok' }, got: { ok: got.ok === true, code: got.code ?? null, stderr_head: '' }, wrote: null }))

  baseArtifacts(ws)
  const receiptTextOfInput = input.writeReceipt()
  const receiptAbs = writeUnder(ws, input.receiptRelOverride ?? RECEIPT_REL_FED, receiptTextOfInput)
  // 👇 REF 的档位输入：**claim.job_id**（老板的裁定留住的第②条）。REF 不读盘也能拿到它。
  const payload = input.payloadFor(receiptAbs)
  payload.__claim_job_id = jobId
  const before = doc === null ? null : JSON.stringify(doc)
  got = mod.markDoc(doc, { field: input.field, at: markAt, payload: { day: DAY, project: PROJECT, ...payload }, workspace: ws })
  if (got.ok) doc = got.doc
  const after = doc === null ? null : JSON.stringify(doc)
  steps.push({ kind: 'mark', expect: input.expect, ok: got.ok === true, code: got.code ?? null, wrote: before !== after })
  problems.push(...judgeStep({ where: `${where}/mark`, step: { expect: input.expect, rejectCode: input.rejectCode }, got: { ok: got.ok === true, code: got.code ?? null, exit: null, stderr_head: '' }, wrote: before !== after }))

  const plain = doc === null ? null : JSON.parse(JSON.stringify(doc))
  const read = mod.readOutputOf(plain, statePathOf(ws))
  const verdict = problems.length === 0 ? input.check(plain, read, { ...input, workspace: ws, jobId, claimAt, markAt }) : []
  return { key: where, cell: input.cell, input: input.id, workspace: ws, steps, problems, verdict, held: problems.length === 0 && verdict.length === 0, failed: [...problems, ...verdict].map((p) => p.code) }
}

/**
 * 控制块（**一次跑里只算一次**）：基线 REF 十三条 + 三把刀在十三条上的向量。
 * 刀只写盘到运行根，`presets/**` 一个字节都不碰。
 */
let CONTROL = null
async function control() {
  if (CONTROL !== null) return CONTROL
  const dir = fixtureDir('RCP-05', 'receipt-trio-ref')
  const ref = await importSource(dir, 'ref', REF_SOURCE)
  const base = INPUTS.map((input, index) => {
    const r = runInputOnRef(ref.mod, input, index)
    return { key: r.key, cell: r.cell, input: r.input, held: r.held, steps: r.steps, failed: r.failed, problems: [...r.problems, ...r.verdict].map((p) => `${p.code} ${p.message}`) }
  })
  const knives = []
  for (const knife of KNIVES) {
    if (!REF_SOURCE.includes(knife.find)) {
      knives.push({ id: knife.id, title: knife.title, cell: knife.cell, find_present: false, want: knife.want, flipped: [], details: [] })
      continue
    }
    const mutated = REF_SOURCE.replace(knife.find, knife.replace)
    const mod = await importSource(dir, knife.id.toLowerCase(), mutated)
    const flipped = []
    for (const [index, input] of INPUTS.entries()) {
      const r = runInputOnRef(mod.mod, input, index)
      if (!r.held) flipped.push({ key: r.key, codes: r.failed })
    }
    knives.push({ id: knife.id, title: knife.title, cell: knife.cell, find_present: true, file: mod.file, sha256: mod.sha256, want: knife.want, flipped: flipped.map((f) => f.key), details: flipped })
  }
  CONTROL = { ref, base, knives }
  return CONTROL
}

/** 本格自己的那三把刀（别的刀只当读数，不在这里报红）。 */
function knifeProblems(knives, ids) {
  const out = []
  for (const knife of knives) {
    if (!ids.includes(knife.id)) continue
    if (knife.find_present === false) {
      out.push(problem('KNIFE-LINE-MISSING', `${knife.id}：REF 里找不到要切的那几行（这一刀没有落点，证明不了任何事）`))
      continue
    }
    if (JSON.stringify(knife.flipped) !== JSON.stringify(knife.want)) {
      out.push(problem('KNIFE-WRONG-VECTOR',
        `${knife.id}（${knife.title}）：翻面的输入是 ${JSON.stringify(knife.flipped)}，规则推出的是 ${JSON.stringify(knife.want)}`
        + ' —— 一个变异体只证一格（mig-rules-16）：多翻说明那一支与别的规则共用同一处判据，少翻说明这刀没切到它'))
    }
  }
  return out
}

// ═════════════════════════════════════════════════════════════════════════════
describe('integration · local-mark 的回执三件套 (RCP-05) · F-162', () => {
  test('RCP-05 回执三件套：齐全且正确 ⇒ done（三格 = 盘上字节的 SHA256 / .team 相对路径 / 回执声明的版本，local-read 读得到）；必交却没给与半套 ⇒ E_ARG_SCHEMA；摘要与盘上字节不符 ⇒ E_ARG_HASH；回执没声明整数 version ⇒ E_DATA_CORRUPT；另两个字段交回执 ⇒ E_ARG_SCHEMA；落在 .team 外 ⇒ E_DATA_MISSING；版本不符 ⇒ E_ARG_SCHEMA —— 被拒的每一步零写入、节点仍 running', async () => {
    await runCase('RCP-05', async (rec) => {
      const problems = []
      const push = (code, msg) => problems.push(problem(code, msg))

      // ① 这一跑打的是哪一版（读数；判据在断言里）
      rec.readings.sut = {}
      for (const rel of ['bin/agenia-local.mjs', 'lib/local-state.mjs']) {
        const abs = stagingExists(rel) ? stagingPath(rel) : null
        rec.readings.sut[rel] = abs === null ? { missing: true } : { file: abs, bytes: readFileSync(abs).length, sha256: sha256File(abs) }
      }
      if (!stagingExists('bin/agenia-local.mjs')) push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 —— 回执三件套这一个 op 量不到（预期的首跑红）')

      // ② 喂进去的摘要是**算出来的**（报告正文 / 真实发现集 / 回执字节），没有手写当锚的 64 hex
      rec.readings.fed_digests = {
        report_sha256: { value: REPORT_SHA, from: 'sha256Text(REPORT_TEXT)' },
        findings_set_sha256: { value: SET_SHA, from: 'q10Digest(ENTRIES)（support/verify-recompute.mjs，测试侧第二份实现）', entries: ENTRIES.length },
        receipt_sha256: { value: '每条输入现读回执盘上字节算（fileShaOrNull）', from: 'sha256File(<回执>)' },
        receipt_self_declared: { value: RECEIPT_DECLARED_SHA, note: '回执**自己声明**的那个值 —— 故意与字节摘要不同：节点里必须存字节那一份（自报不算锚）' },
        wrong_receipt_sha256: { value: WRONG_RECEIPT_SHA, note: 'C 那一格喂的错摘要（64 hex，但不是那份文件的字节摘要）' },
        why: '喂进去的每个摘要都是算出来的；本文件没有任何手写 64 hex 当"正确锚点"。',
      }

      const control_ = await control()
      const own = inputsOf('RCP-05')

      // ③ 生产臂：十三条输入，每条一个**新**工作区
      const rows = own.map((input, index) => {
        const row = runInputProduction(input, index)
        for (const p of [...row.problems, ...row.verdict]) push(p.code, `${row.key}（${input.title}）：${p.message}`)
        return row
      })
      rec.readings.production = rows.map((r) => ({
        key: r.key, title: r.title, field: r.field, workspace: r.workspace, receipt: r.receipt,
        steps: r.steps, payload: r.payload ?? null, doc: r.doc, read: r.read, held: r.held, failed: r.failed,
      }))

      // ④ 今天逐条是什么下场（读的人一眼看得出"哪一条红、为什么"）
      rec.readings.today = rows.map((r) => {
        const mark = r.steps.find((s) => s.kind === 'mark') ?? null
        const node = r.doc?.[r.field] ?? null
        return {
          key: r.key,
          expect: own.find((x) => keyOf(x) === r.key)?.expect ?? null,
          mark_exit: mark?.exit ?? null,
          mark_code: mark?.code ?? null,
          receipt_policy: mark?.receipt_policy ?? null,
          state_written: mark?.state_written ?? null,
          node_state: node?.state ?? null,
          node_receipt_path: node?.receipt_path ?? null,
          node_receipt_sha256: node?.receipt_sha256 ?? null,
          node_receipt_version: node?.receipt_version ?? null,
          held: r.held,
        }
      })
      rec.readings.red_today = rows.filter((r) => !r.held).map((r) => ({ key: r.key, failed: r.failed }))

      // ⑤ 阳性对照：同一批输入喂 REF（照裁定写的最小实现）必须全部成立
      for (const r of control_.base) {
        if (!r.held) push('CONTROL-REF-CELL', `阳性对照（照裁定写的最小实现）在 ${r.key} 没成立：${r.problems.join(' · ')} —— 要么这一条写得不可实现，要么最小实现写错了`)
      }
      rec.readings.ref = { file: control_.ref.file, sha256: control_.ref.sha256, bytes: control_.ref.bytes, rows: control_.base }

      // ⑥ 三把刀（各自只该翻一格）
      for (const p of knifeProblems(control_.knives, ['KR1-NO-TRIO-WRITE', 'KR2-POLICY-OPTIONAL', 'KR3-NO-DIGEST-CHECK'])) push(p.code, p.message)
      rec.readings.knives = {
        subject: 'reference',
        scope: '三把刀都在**全部十三种输入**上量（向量 = 翻面的那些 `格:输入`），所以"只翻本格"是读数不是声明',
        rows: control_.knives,
      }

      // ⑦ 这一格为什么不随"条件①删不删"翻面（档位稳定性的读数，不是断言）
      rec.readings.policy_stability = {
        note: '十三条输入的回执**都真的落在** `<工作区>/.team/leader/<day>/` 下、并且都先 claim ⇒ 按"①已落盘 ∧ ②有 claim"算与按"只有②"算，**每一条都同解**（`required`）。'
          + '所以这一格在老板删掉条件①之前与之后都成立；它判的是"必交那一支的规则"，不是"哪一档才算必交"。',
        receipt_on_disk_all_inputs: true,
        all_inputs_claimed: true,
      }

      // ⑧ 边界（这一格不覆盖什么）
      rec.readings.boundary = {
        receipt_content_not_judged: '回执**内容**对不对（`report.sha256` / `findings_set_sha256` / 票覆盖）归 `receipt-check` / `VRF-02`；本格只核"字节与形状"。',
        additive_keys_not_judged: '`receipt_versions` 是加性键，按 §12.5 不判名字与内容。',
        not_here: '不判 `local-receipt-set` / `receipt-check` / 健康卡（`RCP-03` / `VRF-02` / `HLT-01`～`HLT-03`）；不判锁与原子写（`STO-*`）。',
        cli_layer_has_no_ref: '`E_ARG_HASH` / `E_DATA_CORRUPT` / exit 7 这些"谁拒、退几"只有生产臂有；刀只能证"规则那一半"能翻面。',
        d_family_red_until_landed: '`D1`/`D2`/`D3` 在实现落地"回执没声明整数 version ⇒ `E_DATA_CORRUPT`"之前是**红的**（评审 `R6`）；这一格照裁定写，不许为迁就现状改软。',
        reject_codes: '拒绝码是**判据的一部分**：半套 / 必交没给 / 另两个字段交回执 / 版本不符 ⇒ `E_ARG_SCHEMA`（exit 2）；摘要不符 ⇒ `E_ARG_HASH`（exit 2）；回执在 `.team` 外 ⇒ `E_DATA_MISSING`（exit 7）；回执没声明整数 version ⇒ `E_DATA_CORRUPT`（exit 7）。',
      }

      rec.readings.situation = {
        measured_at_note: 'F-162 门 2 · 2026-10-24（本次运行现量）',
        rule: '`technical` 有 `claim.job_id` ⇒ 回执三件套必交；`memory_review` / `conversation` 交了就拒；三件要么都给、要么都不给；摘要 = 回执**盘上字节**；版本 = 回执声明的整数 version；节点里存 `.team` 相对路径。',
        why_red_today: '红不红只看 `red_today`。这一族在立格之前**一条判据都没有**（评审 §7）：全套 23 个 technical 输入一个都不带三件套，唯一的证据是开发侧一次性探针（不在套件里）。',
      }
      caseFail(problems)
    })
  })
})
