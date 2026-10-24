/**
 * `HLT-03` · **健康卡的第二半**：`technical` 已 `done`，回执在盘上却没落锚 ⇒ `RED E_RECEIPT_ANCHOR`
 * （`F-162` · 门 2 · 2026-10-24 —— 第 4 关评审 §7 点名的硬门：票面那个红因在 `tests/**` 里**零命中**）。
 *
 * 病根（`F-162`）：`local-mark` 收下回执三件套却不写回 ⇒ 状态里 `report` / `findings` 两个锚点有值、
 * `receipt_sha256` 是 `null` ⇒ 卡上 `RED E_RECEIPT_ANCHOR`「技术复盘的三个锚点（报告 / 发现集 / 回执）不齐」，
 * 而三份产物都在盘上。`lib/health.mjs:142-154` 是**两条互补的**判据：
 *   · 回执**读不到**（`hasReceipt === false`，含"这一天的回执根本不在盘上"）且 `technical` 已 `done`
 *     ⇒ `RED E_RECEIPT_MISSING`（"缺回执不是完成"）；
 *   · 回执**读到了**、但三个锚点只齐了 1–2 个 ⇒ `RED E_RECEIPT_ANCHOR`。
 * 今天 `tests/**` 里**两半只量了一半**：`HLT-02` ⑤ 是"一份回执都没有"（落 `E_RECEIPT_MISSING`），
 * `HLT-01` 的绿格子三个锚点全齐 —— **"回执在盘上、节点上没落锚"这个形状没有任何一格构造它**，
 * 而那正是 `F-162` 从头到尾在说的病。这一格补的就是它。
 *
 * 判**哪一扇门**（第 4 关评审点名要写清）：用 **`agenia-local.mjs --op health`** —— 它就是**真实卡**那一扇
 * （`bin/agenia-local.mjs:437-488`：读四份来源 → `healthVerdict(input)` → `buildHealthCard` →
 * 原子写 `<工作区>/.team/brain/<day>/health.json`）。**不用** `--op health-read`（脑侧）：
 * 那一扇门要求脑根、对着真实根会 `E_ROOT_REAL_BRAIN`（评审 §6 的现场），而它多读的那三份判定根本不看
 * （`lib/health.mjs:96-181` 只读 `now` / `leases` / `local` / `daily` / `session_id` / `receipt` / `reads` /
 * `anchor_problems` / `open_adopted_tickets`）。⇒ 这一格判的是**写那张卡的那一扇门**，读数取
 * stdout 的 `health` 与**盘上那张 `health.json`**（两处必须同一句话）。
 *
 * 四条输入（同一扇门 · 同一份 `state/local/<day>.json` 形状，只变回执与锚点）：
 *   `A` `technical` 已 `done`、回执**在盘上**（`technical.receipt_path` 指着它）、三个锚点**缺一个**
 *       （`receipt_sha256` 是 `null`）⇒ `RED` 且 `reasons` 里有 `E_RECEIPT_ANCHOR`（**不许**是 `E_RECEIPT_MISSING`）；
 *   `B` 同 `A`、但只齐了**一个**锚点（只有 `report_sha256`）⇒ 同一个 `E_RECEIPT_ANCHOR`（"1–2 个"两个方向都量）；
 *   `C` `technical` 已 `done`、**盘上没有回执**⇒ `RED E_RECEIPT_MISSING`（这一半由 `HLT-02` ⑤ 起头，这里同格复核）；
 *   `D` 三个锚点**全齐** + 回执在盘上 ⇒ `GREEN`（**阳性对照**：没有它，A/B/C 三条红格分不出"永远红"）。
 *   每条另判：`status` 与盘上 `health.json` 的 `status` 同值、`progress` 是 3/3 与 `receipt:true/false` 对得上、
 *   `health.json` 的 `paths.local` / `paths.receipt` 指得出处（红因要能指到文件）。
 *
 * 边界（这一格**不覆盖**什么）：
 *   1. **不判** `stale` / 租约（`HLT-02`）· 不判"没开工 HOLD"与六场景矩阵（`HLT-01`）·
 *      不判未关闭采纳票（`HLT-01` / `RCP-02` 那一族）。
 *   2. **不判**回执内容对不对（`receipt-check` / `VRF-02`）；本格只判"读得到 / 读不到"与"三个锚点齐不齐"。
 *   3. **不判** `anchor_problems`（报告盘上字节 vs 状态锚点，`lib/health.mjs:237-253`）：夹具里报告真的写在盘上、
 *      `report_sha256` 就是它的字节摘要 ⇒ 这一支**不产生**额外 reason（这也是 A/B 只红 `E_RECEIPT_ANCHOR` 的前提）。
 *   4. **不判**脑侧那一扇门（`health-read`）的判词 —— 它是另一张卡（`paths.state/snapshot/report` 由脑侧填）。
 *   5. 本格是**回归锁**：今天这四条的行为就对（`lib/health.mjs:142-154` 那两条互补判据在 `F-162` 之前就在），
 *      所以首跑应当是绿的；它守的是"`E_RECEIPT_ANCHOR` 这一支不许被合进 `E_RECEIPT_MISSING`、
 *      也不许被 `F-162` 的写回改动顺手改掉"。
 */
import { before, describe, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256File, sha256Text } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { runLocal, stagingExists, stagingPath } from '../support/sut.mjs'

before(() => {
  preflight()
})

const DAY = '2026-10-24'
const PROJECT = 'harness'
const NOW = '2026-10-24T15:00:00+08:00'
const LEASE_MINUTES = FROZEN.leases.local

/** 回执的落点与内容（形状照现场那份 `.team/leader/2026-10-24/技术复盘回执.json`）。 */
const RECEIPT_REL_TEAM = `leader/${DAY}/技术复盘回执.json`
const REPORT_REL = `.team/retro/${DAY}/技术评审.md`
const REPORT_TEXT = '# 技术评审报告（HLT-03 的产物）\n\n窗口：2026-10-23 04:00 – 2026-10-24 04:00。\n正文三行。\n'
const REPORT_SHA = sha256Text(REPORT_TEXT)
const RECEIPT_TEXT = `${JSON.stringify({
  schema: 1,
  version: 2,
  day: DAY,
  project: 'harness',
  generated_at: '2026-10-24T14:40:00+08:00',
  handover: { mode: 'fresh' },
  report: { path: REPORT_REL, sha256: REPORT_SHA },
  findings_set_sha256: 'f'.repeat(64),
  findings_count: 0,
  findings: [],
  receipt_sha256: 'd'.repeat(64),
}, null, 2)}\n`

/** 卡上那两个码（`lib/health.mjs` 的 `HEALTH_REASON_CODES`，逐字 —— 判据要指得出是哪一条）。 */
const CODE_ANCHOR = 'E_RECEIPT_ANCHOR'
const CODE_MISSING = 'E_RECEIPT_MISSING'

// ── 小工具 ────────────────────────────────────────────────────────────────
function scenarioWorkspace(name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-hlt03-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

function writeUnder(ws, rel, text) {
  const abs = path.join(ws, ...String(rel).split('/'))
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')
  return abs
}

function setNow(iso) {
  const file = process.env[ENV.NOW_FILE]
  if (!file) throw new Error(`AGENIA_NOW_FILE 没设置 —— 这一格的时间读数全靠它（${file}）`)
  const prior = existsSync(file) ? readFileSync(file, 'utf8') : null
  writeFileSync(file, `${iso}\n`, 'utf8')
  return () => writeFileSync(file, prior === null ? '' : prior, 'utf8')
}

/** 一个节点（15 个必填键，`lib/local-state.mjs::emptyNode()` 的形状）。 */
const node = (over = {}) => ({
  claim: { attempt: 1, job_id: `job-hlt03-${over.__name ?? 'x'}`, claimed_at: '2026-10-24T13:00:00+08:00' },
  state: 'done',
  job_id: `job-hlt03-${over.__name ?? 'x'}`,
  liveness_at: '2026-10-24T14:30:00+08:00',
  failure_reason: null,
  report_path: null,
  report_sha256: null,
  findings_path: null,
  findings_set_sha256: null,
  findings_count: null,
  receipt_path: null,
  receipt_sha256: null,
  receipt_version: null,
  ticket_ids: [],
  artifact_paths: [],
  ...over,
})

const statePathOf = (ws) => path.join(ws, '.team', 'state', 'local', `${DAY}.json`)
const healthPathOf = (ws) => path.join(ws, '.team', 'brain', DAY, 'health.json')
const readJsonOrNull = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
const eq = (code, got, want, why) => (JSON.stringify(got) === JSON.stringify(want)
  ? null
  : { code, message: `${why}：期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}` })
const compacts = (list) => list.filter((p) => p !== null)
const isFilled = (v) => typeof v === 'string' && v.trim() !== ''

/** 一次真 `--op health`（**真实卡那一扇门**）：stdout 的信封 + 盘上那张 `health.json`。 */
function healthCall(ws) {
  const restore = setNow(NOW)
  let res = null
  try {
    res = runLocal('HLT-03', 'health', { project: PROJECT, day: DAY }, { workspace: ws })
  } finally {
    restore()
  }
  return {
    exit: res?.exit_code ?? null,
    code: res?.json?.error?.code ?? null,
    status: res?.json?.health?.status ?? null,
    reasons: res?.json?.health?.reasons ?? null,
    progress: res?.json?.progress ?? null,
    health_path: res?.json?.health_path ?? null,
    on_disk: readJsonOrNull(healthPathOf(ws)),
    stderr_head: String(res?.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' | '),
  }
}

/** 四条输入：只变"回执在不在盘上"与"三个锚点齐不齐"，别的（三节点都 done、时间新鲜、报告在盘上）不动。 */
const INPUTS = [
  {
    id: 'A',
    title: 'technical done + 回执在盘上、三个锚点缺一个（receipt_sha256 是 null）⇒ RED E_RECEIPT_ANCHOR',
    wantStatus: 'RED',
    wantCode: CODE_ANCHOR,
    forbidCode: CODE_MISSING,
    receiptOnDisk: true,
    anchors: { report_path: REPORT_REL, report_sha256: REPORT_SHA, findings_set_sha256: 'f'.repeat(64), receipt_path: RECEIPT_REL_TEAM },
    wantProgress: { done: 3, total: 3, receipt: true },
  },
  {
    id: 'B',
    title: 'technical done + 回执在盘上、只齐了一个锚点（只有 report_sha256）⇒ 同一个 RED E_RECEIPT_ANCHOR',
    wantStatus: 'RED',
    wantCode: CODE_ANCHOR,
    forbidCode: CODE_MISSING,
    receiptOnDisk: true,
    anchors: { report_path: REPORT_REL, report_sha256: REPORT_SHA, receipt_path: RECEIPT_REL_TEAM },
    wantProgress: { done: 3, total: 3, receipt: true },
  },
  {
    id: 'C',
    title: 'technical done + 盘上没有回执 ⇒ RED E_RECEIPT_MISSING（缺回执不是完成）',
    wantStatus: 'RED',
    wantCode: CODE_MISSING,
    forbidCode: CODE_ANCHOR,
    receiptOnDisk: false,
    anchors: { report_path: REPORT_REL, report_sha256: REPORT_SHA, findings_set_sha256: 'f'.repeat(64) },
    wantProgress: { done: 3, total: 3, receipt: false },
  },
  {
    id: 'D',
    title: '三个锚点全齐 + 回执在盘上 ⇒ GREEN（阳性对照：前三条红格不是"永远红"）',
    wantStatus: 'GREEN',
    wantCode: null,
    forbidCode: null,
    receiptOnDisk: true,
    anchors: {
      report_path: REPORT_REL,
      report_sha256: REPORT_SHA,
      findings_set_sha256: 'f'.repeat(64),
      receipt_path: RECEIPT_REL_TEAM,
      receipt_sha256: 'e'.repeat(64),
      receipt_version: 2,
    },
    wantProgress: { done: 3, total: 3, receipt: true },
  },
]

/** 一个场景工作区：三节点全 `done`（兄弟两场不带锚点 —— 卡对它们只判"痕迹在不在"）、报告真的写在盘上。 */
function buildWorkspace(input) {
  const ws = scenarioWorkspace(String(input.id).toLowerCase())
  writeUnder(ws, REPORT_REL, REPORT_TEXT)
  if (input.receiptOnDisk) writeUnder(ws, `.team/${RECEIPT_REL_TEAM}`, RECEIPT_TEXT)
  const technical = node({ ...input.anchors, __name: 'technical' })
  delete technical.__name
  const doc = {
    schema: 1,
    day: DAY,
    project: PROJECT,
    snapshot: 'v9',
    local_lease_minutes: LEASE_MINUTES,
    imported_proposal_ids: [],
    updated_at: '2026-10-24T14:30:00+08:00',
    memory_review: node({ __name: 'memory-review' }),
    conversation: node({ __name: 'conversation' }),
    technical,
  }
  for (const f of ['memory_review', 'conversation', 'technical']) delete doc[f].__name
  writeUnder(ws, `.team/state/local/${DAY}.json`, `${JSON.stringify(doc, null, 2)}\n`)
  return ws
}

describe('report · health 的第二半 (HLT-03) · F-162', () => {
  test('HLT-03 technical done 的三分支：回执在盘上但锚点只齐 1–2 个 ⇒ RED E_RECEIPT_ANCHOR（缺一个 / 只齐一个两种写法）；盘上没有回执 ⇒ RED E_RECEIPT_MISSING；三个锚点全齐 + 回执在盘上 ⇒ GREEN —— 四条都判真实卡那一扇门（--op health）与盘上那份 health.json', async () => {
    await runCase('HLT-03', async (rec) => {
      const problems = []
      const push = (code, msg) => problems.push(problem(code, msg))

      rec.readings.sut = {}
      for (const rel of ['bin/agenia-local.mjs', 'lib/health.mjs']) {
        const abs = stagingExists(rel) ? stagingPath(rel) : null
        rec.readings.sut[rel] = abs === null ? { missing: true } : { file: abs, bytes: readFileSync(abs).length, sha256: sha256File(abs) }
      }
      if (!stagingExists('bin/agenia-local.mjs')) push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 —— 真实卡那一扇门量不到（预期的首跑红）')

      // 🔴 判的是**哪一扇门**（评审点名要写清）：真实卡 = `--op health`（本地侧），不是脑侧 `health-read`。
      rec.readings.door = {
        used: 'agenia-local.mjs --op health',
        why: '真实卡就是这一扇门写的（bin/agenia-local.mjs:437-488：readWorkspaceHealthSources → healthVerdict → buildHealthCard → 原子写 <ws>/.team/brain/<day>/health.json）',
        not_used: 'agenia-local.mjs --op health-read（脑侧）—— 它要脑根、对真实根会 E_ROOT_REAL_BRAIN（评审 §6 的现场）；判定纯函数不看它多读的那三份（lib/health.mjs:96-181）',
        state_path: statePathOf(scenarioWorkspace('door-skeleton')),
        health_path_pattern: `<工作区>/.team/brain/${DAY}/health.json`,
      }

      const rows = []
      for (const input of INPUTS) {
        const ws = buildWorkspace(input)
        const beforeState = sha256File(statePathOf(ws))
        const out = healthCall(ws)
        const afterState = sha256File(statePathOf(ws))
        const row = {
          key: `HLT-03:${input.id}`,
          title: input.title,
          workspace: ws,
          want_status: input.wantStatus,
          want_code: input.wantCode,
          got: { exit: out.exit, code: out.code, status: out.status, reasons: (out.reasons ?? []).map((r) => r.code), progress: out.progress, health_path: out.health_path },
          on_disk: out.on_disk === null ? null : { status: out.on_disk.status, reasons: (out.on_disk.reasons ?? []).map((r) => r.code), paths: out.on_disk.paths, checked_at: out.on_disk.checked_at },
          state_sha_before: beforeState,
          state_sha_after: afterState,
        }
        rows.push(row)

        // ① 读面必须可用（红因要能指到文件；不能"读不出来"被当成"红"）
        const where = row.key
        const codes = row.got.reasons
        for (const p of compacts([
          out.exit === 0 ? null : { code: 'HLT03-CARD-UNREADABLE', message: `${where}：\`--op health\` 必须能读出来（真实卡那一扇门），实得 exit=${out.exit} code=${out.code ?? '(无)'} · ${out.stderr_head}` },
          out.status === input.wantStatus ? null : { code: 'HLT03-STATUS', message: `${where}：卡上 status 应为 ${input.wantStatus}，实得 ${JSON.stringify(out.status)}（reasons=${JSON.stringify(row.got.reasons)}）` },
          Array.isArray(out.reasons) ? null : { code: 'HLT03-SHAPE', message: `${where}：health.reasons 必须是数组，实得 ${typeof out.reasons}` },
          // ② 每一档都要带 progress（"今天到哪一步了"），且 3/3、回执那一格与 `hasReceipt` 同值
          eq('HLT03-PROGRESS', out.progress, input.wantProgress, `${where}：progress（done/3 · 回执读到了没有）`),
          // ③ 盘上那张 `health.json` 与 stdout 必须同一句话（两处读数，不是一个）
          out.on_disk === null ? { code: 'HLT03-NO-FILE', message: `${where}：盘上没有 \`health.json\`（${healthPathOf(ws)}）—— 卡必须落盘` } : null,
          out.on_disk === null || out.on_disk.status === out.status ? null : { code: 'HLT03-FILE-DISAGREE', message: `${where}：盘上 status=${out.on_disk.status} 与 stdout 的 ${out.status} 不一致` },
          out.on_disk === null || JSON.stringify((out.on_disk.reasons ?? []).map((r) => r.code)) === JSON.stringify(codes) ? null : {
            code: 'HLT03-FILE-DISAGREE',
            message: `${where}：盘上 reasons=${JSON.stringify((out.on_disk.reasons ?? []).map((r) => r.code))} 与 stdout 的 ${JSON.stringify(codes)} 不一致`,
          },
          input.wantCode === null || out.on_disk === null ? null : (
            isFilled(out.on_disk.paths?.local) && isFilled(out.on_disk.paths?.receipt)
              ? null
              : {
                code: 'HLT03-FILE-PATHS',
                message: `${where}：盘上那张卡要给出处（红因要能指到文件）：local=${JSON.stringify(out.on_disk.paths?.local)} receipt=${JSON.stringify(out.on_disk.paths?.receipt)}`,
              }
          ),
          // ④ 读面零写入：这一扇门只落**派生卡**，状态文件一个字节都不许动
          beforeState === afterState ? null : { code: 'HLT03-WROTE-STATE', message: `${where}：\`--op health\` 改了状态文件（读面不许写状态；它只落派生卡 brain/<day>/health.json）` },
        ])) push(p.code, p.message)
        if (input.wantCode !== null) {
          for (const p of compacts([
            codes.includes(input.wantCode) ? null : {
              code: 'HLT03-MISSING-CODE',
              message: `${where}：${input.title} —— reasons 里必须有 ${input.wantCode}，实得 ${JSON.stringify(codes)}（这一条就是 F-162 票面上那个红因）`,
            },
            input.forbidCode === null || !codes.includes(input.forbidCode) ? null : {
              code: 'HLT03-WRONG-BRANCH',
              message: `${where}：这一格**不许**报 ${input.forbidCode}（两个分支说的是两件事：读不到回执 vs 回执读到了但锚点不齐），实得 ${JSON.stringify(codes)}`,
            },
          ])) push(p.code, p.message)
        } else {
          for (const p of compacts([
            (out.reasons ?? []).length === 0 ? null : { code: 'HLT03-REASONS', message: `${where}：阳性对照（三个锚点全齐 + 回执在盘上）不许带任何 reason，实得 ${JSON.stringify(out.reasons)}` },
          ])) push(p.code, p.message)
        }
      }
      rec.readings.cases = rows

      // ⑤ 两个分支必须**分得开**（同一个形状只改"回执在不在盘上"，码不许一样）
      const branchA = rows.find((r) => r.key === 'HLT-03:A')?.got.reasons ?? []
      const branchC = rows.find((r) => r.key === 'HLT-03:C')?.got.reasons ?? []
      if (branchA.includes(CODE_MISSING) || branchC.includes(CODE_ANCHOR)) {
        push('HLT03-BRANCH-COLLAPSE', `两个分支被合成一条了（A=${JSON.stringify(branchA)} · C=${JSON.stringify(branchC)}）—— "回执在盘上没落锚"与"回执根本不在"说的是两件事，老板要能一眼分出来`)
      }
      rec.readings.branch_split = {
        anchor_branch: { key: 'HLT-03:A', reasons: branchA },
        missing_branch: { key: 'HLT-03:C', reasons: branchC },
        why: '这两条必须是**不同的码**：`E_RECEIPT_ANCHOR` = 回执读到了、三个锚点不齐（F-162 的病）；`E_RECEIPT_MISSING` = 回执根本读不到。合成一条就再也看不出"是缺回执"还是"收下了没落锚"。',
      }

      // ⑥ 边界 + 今天读到的情况
      rec.readings.boundary = {
        stale_not_judged: '不判 `stale` / 租约（`HLT-02`）；不判"没开工 HOLD"与六场景矩阵（`HLT-01`）；不判未关闭采纳票。',
        receipt_content_not_judged: '不判回执内容（`receipt-check` / `VRF-02`）—— 本格只判"读得到 / 读不到"与"三个锚点齐不齐"。',
        anchor_problems_not_judged: '`anchor_problems`（报告盘上字节 vs 状态锚点）不在本格：夹具里报告真的写在盘上、`report_sha256` 就是它的字节摘要 ⇒ 那一支不产生额外 reason。',
        brain_door_not_judged: '脑侧 `health-read` 的判词不在本格（它是另一张卡）。',
        regression_lock: '这一格今天是**回归锁**（`lib/health.mjs:142-154` 的两条互补判据在 F-162 之前就在）⇒ 首跑应当是绿的；它守的是这两个分支不许被合并、也不许被写回改动顺手改掉。',
      }
      rec.readings.situation = {
        measured_at_note: 'F-162 门 2 · 2026-10-24（本次运行现量）',
        why_this_cell: '第 4 关评审 §7：`E_RECEIPT_ANCHOR` 在 `tests/**` 里**零命中** —— 而它正是 F-162 从头到尾在说的病；`HLT-02` ⑤ 只覆盖了"一份回执都没有"那一半。',
      }
      caseFail(problems)
    })
  })
})
