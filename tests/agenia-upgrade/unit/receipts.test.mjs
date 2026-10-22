/**
 * RCP-01 / RCP-02 / RCP-04 —— 技术回执、票与接手（回执层）。
 *
 * 冻结依据：契约 §6.8 + 提案 §B3.1（findings/锚点）/ §B3.2（回执 MD↔机读、覆盖校验、处置枚举）
 * / §B3.3（票的关闭证据与 void 重呈现）/ §B1.5（`receipt.mjs`/`tickets.mjs` 的签名）+ 拍板 Q10（规范化哈希）。
 *
 * 口径（A12）：本文件在**纯函数层**能验的是"判据会翻面 + 每条 finding 恰好一个落点"；
 * 回执**文件**与 health 的读取面（`local-receipt-set` / `health` / `receipt-check`）走 CLI，
 * 现在 staging 未实现 ⇒ 预期 RED-SURFACE。**父死三窗口**（报告落盘后/半份回执/present 后）
 * 需要通知与父进程生命周期接缝 ⇒ 按契约留在 R1-04/JOB-02，本文件记 `PENDING`，**不折成通过**。
 */
import { before, describe, test } from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings } from '../support/evidence.mjs'
import { loadStagedModule, runLocal, stagingExists, stagingPath } from '../support/sut.mjs'
import { q10Digest } from '../support/verify-recompute.mjs'

before(() => {
  preflight()
})

/** staged 全树的文本源（给"某个码只许出现在某个文件"这类静态检查用）。 */
function stagedTextSources() {
  const root = stagingPath('.')
  const out = []
  const go = (dir) => {
    let names = []
    try { names = readdirSync(dir).sort() } catch { return }
    for (const name of names) {
      const full = path.join(dir, name)
      let st = null
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) go(full)
      else if (st.isFile() && /\.(mjs|js|md|yml|yaml|json)$/.test(name)) {
        out.push({ rel: path.relative(root, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') })
      }
    }
  }
  go(root)
  return out
}

const REPORT_SHA = 'a'.repeat(64)
/**
 * `findingsFile()` 里那两条 finding 的**真值**（`F-121`：Q10 复算）。
 *
 * Q10（`CONTRACT.md §6.2` / `lib/receipt.mjs` 文件头）= `sha256(JSON.stringify(findings, 键按 UTF-8 字节序升序, 无空白))`。
 * 这里写**常量**、不在测试里现算：这是"作业产物该声明的那个值"，与校验方的复算必须是**两份来源**
 * （`cand-20261016-selfsourced-order-01`：期望与实现读同一份来源，它就不是判据）。
 * 常量与内容的对账在 RCP-01 ① 的 `FIXTURE-SET-SHA` —— 内容一改那里先红，不会静默腐烂。
 * 独立复算记录（两门语言各算一遍）：`.team/test/2026-10-22/_evidence/q10-recompute.out.txt`。
 */
const SET_SHA = 'aeaf9b2e39eac06b2648c761b13106c82d44b64634e875a6d4729e2494c920f3'
/** 零发现（`findings: []`）那格的真值 = `digest([])`。声明成别的值就是"自报值与内容不符"。 */
const ZERO_SET_SHA = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
const TICKET_ID = 'ticket-20261014-01'

/** 合成夹具（形状照提案 §B3.1/§B3.2/§B3.3 与 example JSON；**不含真实私有数据**）。 */
const finding = (id, over = {}) => ({
  id,
  title: `（夹具）发现 ${id}`,
  severity: 'P2',
  evidence: [{ kind: 'file', ref: 'presets/agenia/inject.js', note: '夹具' }],
  summary: `（夹具）${id} 的一句话摘要`,
  ...over,
})
/**
 * findings 产物夹具。
 * `setSha` 默认是那两条 finding 的 Q10 真值；**零发现那两格必须显式传 `ZERO_SET_SHA`**
 * （`[]` 的复算值与两条 finding 的不一样，默认值顶上去就变成"自报值与内容不符"）。
 */
const findingsFile = (ids = ['F1', 'F2'], setSha = SET_SHA) => ({
  schema: 1,
  day: '2026-10-14',
  report_path: 'retro/2026-10-14/技术评审.md',
  report_sha256: REPORT_SHA,
  generated_at: '2026-10-14T11:00:00+08:00',
  code_fingerprint: { before_sha256: 'c'.repeat(64), after_sha256: 'c'.repeat(64), equal: true },
  findings: ids.map((id) => finding(id)),
  findings_set_sha256: setSha,
})
const receipt = (over = {}) => ({
  schema: 1,
  version: 1,
  superseded_by: null,
  project: 'harness',
  day: '2026-10-14',
  lead: 'Agenia',
  report: { path: 'retro/2026-10-14/技术评审.md', sha256: REPORT_SHA },
  findings_set_sha256: SET_SHA,
  findings: [
    { id: 'F1', disposition: 'adopted', ticket_id: TICKET_ID, reason: null },
    { id: 'F2', disposition: 'rejected', ticket_id: null, reason: '与当前目标（先把执行一收尾）冲突，等停机安装完成后再评估。' },
  ],
  handover: { mode: 'fresh', from_receipt_version: null, statement: null },
  created_at: '2026-10-14T11:05:00+08:00',
  receipt_sha256: 'd'.repeat(64),
  ...over,
})
const ticket = (over = {}) => ({
  id: TICKET_ID,
  title: '（夹具）guard 错误文案补正确示例',
  source: `technical-review:${REPORT_SHA}#F1`,
  next_step: '实现关在 staging 改 inject.js 的拒绝文案，重跑 G5',
  acceptance: 'inject-probe 的 G5 通过，且文案含 run_in_background: true',
  status: 'open',
  created_at: '2026-10-14T11:06:00+08:00',
  last_update: '2026-10-14T11:06:00+08:00',
  closure_evidence: null,
  void_reason: null,
  re_present: null,
  closed_at: null,
  ...over,
})

/** 覆盖校验的返回形状（提案 §B3.2）：取一份"原因码 + 三张清单"的摘要，便于逐条断言。 */
function coverageOf(fn, args) {
  try {
    const out = fn(...args)
    return {
      threw: null,
      ok: out?.ok ?? null,
      code: out?.code ?? null,
      missing: out?.missing ?? null,
      duplicate: out?.duplicate ?? null,
      extra: out?.extra ?? null,
      ticketProblems: out?.ticketProblems ?? null,
      anchorProblems: out?.anchorProblems ?? null,
      raw: out,
    }
  } catch (err) {
    return { threw: String(err.message).slice(0, 240), ok: null, code: null, raw: null }
  }
}

describe('unit · receipts (RCP)', () => {
  test('RCP-01 覆盖校验正反矩阵：每条 finding 恰好一个落点、票真实且 acceptance 非空', async () => {
    await runCase('RCP-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      const receiptLib = await loadStagedModule('lib/receipt.mjs', ['parseFindings', 'validateReceiptCoverage', 'receiptAnchors'])
      const ticketLib = await loadStagedModule('lib/tickets.mjs', ['validateTicket'])
      rec.readings.receipt_lib = { surfaceMissing: receiptLib.surfaceMissing, missing: receiptLib.missing, errors: receiptLib.errors }
      if (receiptLib.surfaceMissing) push('SUT-SURFACE-MISSING', `staged/lib/receipt.mjs 不在 —— 覆盖校验拿不到（预期的首跑红）`)
      for (const n of receiptLib.missing) push('SUT-SURFACE-MISSING', `staged/lib/receipt.mjs 没有导出 ${n}（提案 §B1.5 冻了签名）`)
      if (ticketLib.surfaceMissing) push('SUT-SURFACE-MISSING', `staged/lib/tickets.mjs 不在（票校验拿不到）`)
      if (receiptLib.mod === null) caseFail(problems)

      const { parseFindings, validateReceiptCoverage, receiptAnchors } = receiptLib.mod
      const findings = findingsFile()
      const tickets = [ticket()]

      // ⓪ 夹具自证（防漂移）：两个常量必须真是它们各自内容的 Q10 复算值。
      //    用**测试侧独立实现**（`support/verify-recompute.mjs::q10Digest`，不 import 被测模块）算 ——
      //    这一格红了是"夹具内容或常量改错了"，不是 SUT 坏了。
      const setShaGuards = [
        ['两条 finding（F1+F2）', SET_SHA, q10Digest(findingsFile().findings)],
        ['零发现（[]）', ZERO_SET_SHA, q10Digest([])],
      ]
      rec.readings.fixture_set_sha = setShaGuards.map(([label, declared, computed]) => ({
        label, declared, computed, equal: declared === computed,
      }))
      for (const [label, declared, computed] of setShaGuards) {
        if (declared !== computed) {
          push('FIXTURE-SET-SHA', `夹具的 findings_set_sha256 常量与那份内容的 Q10 复算值不符（${label}：常量 ${declared.slice(0, 12)}… vs 复算 ${computed.slice(0, 12)}…）—— 先改夹具，别去动被测模块`)
        }
      }

      // ① parseFindings 正例 + findings_set_sha256 锚点
      const parsed = parseFindings(findings)
      rec.readings.parsed = { ok: parsed?.ok ?? null, count: parsed?.count ?? null, code: parsed?.code ?? null }
      if (parsed?.ok !== true || parsed?.count !== 2) push('PARSE-FINDINGS', `parseFindings(2 条) 应返回 ok:true / count:2，实得 ${JSON.stringify({ ok: parsed?.ok, count: parsed?.count, code: parsed?.code })}`)
      const anchors = receiptAnchors(receipt())
      rec.readings.anchors = anchors
      if (anchors?.report_sha256 !== REPORT_SHA || anchors?.findings_set_sha256 !== SET_SHA) {
        push('RECEIPT-ANCHORS', `receiptAnchors 必须给出 report_sha256 / findings_set_sha256 两个锚点，实得 ${JSON.stringify(anchors)}`)
      }

      // ② 正例：F1 采纳（票真实、acceptance 非空）+ F2 拒绝（原因具体）⇒ ok
      const good = coverageOf(validateReceiptCoverage, [receipt(), findings, tickets, { report_sha256: REPORT_SHA, findings_set_sha256: SET_SHA }])
      rec.readings.positive = good
      if (good.threw) push('COVERAGE-POSITIVE', `正例不该抛：${good.threw}`)
      else if (good.ok !== true || good.code !== null) push('COVERAGE-POSITIVE', `正例应 ok:true / code:null，实得 ok=${good.ok} code=${good.code}`)

      // ③ 负例矩阵 —— 每条都要给出**稳定错误码**，且三张清单不许糊在一起
      const negatives = [
        ['漏项（F2 没处置）', receipt({ findings: [receipt().findings[0]] }), 'E_COVERAGE_MISSING', 'missing'],
        ['重复（F1 两次）', receipt({ findings: [receipt().findings[0], receipt().findings[0], receipt().findings[1]] }), 'E_COVERAGE_DUP', 'duplicate'],
        ['额外 id（F9）', receipt({ findings: [...receipt().findings, { id: 'F9', disposition: 'rejected', ticket_id: null, reason: '这条 finding 根本不存在于报告里，属于额外项。' }] }), 'E_COVERAGE_EXTRA', 'extra'],
        ['采纳但无票号', receipt({ findings: [{ id: 'F1', disposition: 'adopted', ticket_id: null, reason: null }, receipt().findings[1]] }), 'E_COVERAGE_TICKET', 'ticketProblems'],
        ['采纳票不存在', receipt({ findings: [{ id: 'F1', disposition: 'adopted', ticket_id: 'ticket-20261014-99', reason: null }, receipt().findings[1]] }), 'E_COVERAGE_TICKET', 'ticketProblems'],
        ['票存在但 acceptance 为空', receipt({ findings: [receipt().findings[0], receipt().findings[1]] }), 'E_COVERAGE_TICKET', 'ticketProblems', [ticket({ acceptance: '' })]],
        ['票的 source 不含报告 SHA', receipt({ findings: [receipt().findings[0], receipt().findings[1]] }), 'E_COVERAGE_TICKET', 'ticketProblems', [ticket({ source: `technical-review:${'f'.repeat(64)}#F1` })]],
        ['拒绝但无原因', receipt({ findings: [receipt().findings[0], { id: 'F2', disposition: 'rejected', ticket_id: null, reason: '' }] }), 'E_COVERAGE_REASON', null],
        ['拒绝原因太泛（<10 字）', receipt({ findings: [receipt().findings[0], { id: 'F2', disposition: 'rejected', ticket_id: null, reason: '不做' }] }), 'E_COVERAGE_REASON', null],
      ]
      const negResults = {}
      for (const [label, rc, wantCode, wantList, tk = tickets] of negatives) {
        const out = coverageOf(validateReceiptCoverage, [rc, findings, tk, { report_sha256: REPORT_SHA, findings_set_sha256: SET_SHA }])
        negResults[label] = { ok: out.ok, code: out.code, [wantList ?? 'none']: wantList ? out[wantList] : undefined }
        if (out.threw) { push('COVERAGE-NEGATIVE', `${label} 抛错而不是返回原因码：${out.threw}`); continue }
        if (out.ok !== false) push('COVERAGE-NEGATIVE', `${label} 必须被拒（ok:false），实得 ok=${out.ok}`)
        if (out.code !== wantCode) push('COVERAGE-NEGATIVE', `${label} 的原因码应为 ${wantCode}，实得 ${out.code}`)
        // v1.14：`wantList` 那张清单**必须是数组**（形状不对时"该报出条目"这条根本判不了 ⇒ 红，不是静默通过）
        if (wantList) {
          if (!Array.isArray(out[wantList])) push('COVERAGE-NEGATIVE', `${label} 的 ${wantList} 必须是数组（那张"报出了哪些条目"的清单），实得 ${JSON.stringify(out[wantList])}`)
          else if (out[wantList].length === 0) push('COVERAGE-NEGATIVE', `${label} 应在那张清单里报出条目（${wantList}），实得空清单`)
        }
      }
      rec.readings.negatives = negResults

      // ④ 锚点不符 ⇒ E_RECEIPT_HASH（回执自报的 SHA 不许被当成锚）
      const badAnchor = coverageOf(validateReceiptCoverage, [receipt({ report: { path: 'retro/2026-10-14/技术评审.md', sha256: 'e'.repeat(64) } }), findings, tickets, { report_sha256: REPORT_SHA, findings_set_sha256: SET_SHA }])
      rec.readings.bad_anchor = badAnchor
      if (badAnchor.ok !== false || badAnchor.code !== 'E_RECEIPT_HASH') {
        push('RECEIPT-HASH', `回执的报告 SHA 与 findings 文件不一致时必须 E_RECEIPT_HASH，实得 ok=${badAnchor.ok} code=${badAnchor.code}`)
      }
      const badSet = coverageOf(validateReceiptCoverage, [receipt({ findings_set_sha256: 'f'.repeat(64) }), findings, tickets, { report_sha256: REPORT_SHA, findings_set_sha256: SET_SHA }])
      if (badSet.ok !== false) push('RECEIPT-HASH', `发现集哈希不符也必须被拒，实得 ok=${badSet.ok} code=${badSet.code}`)

      // ⑤ 零发现：findings [] + receipt findings [] ⇒ 通过（**不许**读成"缺回执"）
      //    零发现也是一份**真内容**（`[]`），所以声明值、锚点、回执三处都必须是 `digest([])` 的真值
      //    （ZERO_SET_SHA）；拿两条 finding 的 SET_SHA 顶上，就是 `F-121` 要拒的"自报值与内容不符"。
      const zeroReceipt = (over = {}) => receipt({ findings: [], findings_set_sha256: ZERO_SET_SHA, ...over })
      const zeroAnchors = { report_sha256: REPORT_SHA, findings_set_sha256: ZERO_SET_SHA }
      const zero = coverageOf(validateReceiptCoverage, [zeroReceipt(), findingsFile([], ZERO_SET_SHA), [], zeroAnchors])
      rec.readings.zero_findings = zero
      if (zero.ok !== true) push('ZERO-FINDINGS', `零发现（两边都显式空清单）必须通过，实得 ok=${zero.ok} code=${zero.code}`)
      const zeroMissing = coverageOf(validateReceiptCoverage, [zeroReceipt({ findings: undefined }), findingsFile([], ZERO_SET_SHA), [], zeroAnchors])
      if (zeroMissing.ok !== false) push('ZERO-FINDINGS', `零发现但回执里连空清单都没有 ⇒ 必须红（不许把"缺字段"当成"零发现"），实得 ok=${zeroMissing.ok}`)

      // ⑥ 回执文件面（CLI）：receipt-check 读锚点
      rec.readings.cli_note = { note: '回执/health 的读取面走 `agenia-local.mjs --op receipt-check`（提案 §B1.4）；RCP-03 会拿真实产物验它。' }

      // ⑦ C-6（追加裁定 v1.2）：`E_RECEIPT_OVERWRITE` **只许**由 `lib/receipt.mjs` 产生。
      //    做法是静态扫描 staged 全树（不自创写入函数的签名 —— C-6 没冻它的名字）。
      const overwriteSites = []
      for (const { rel, text } of stagedTextSources()) {
        text.split(/\r?\n/).forEach((line, i) => {
          if (/^\s*(\/\/|\*|#)/.test(line)) return
          if (line.includes(FROZEN.receiptOverwriteSurface.code)) overwriteSites.push(`${rel}:${i + 1}`)
        })
      }
      rec.readings.overwrite_code_sites = overwriteSites
      const outsideReceipt = overwriteSites.filter((s) => !s.startsWith(FROZEN.receiptOverwriteSurface.file))
      if (stagedTextSources().length > 0) {
        if (overwriteSites.length === 0) {
          push('RECEIPT-OVERWRITE-SURFACE', `staged 全树里找不到 ${FROZEN.receiptOverwriteSurface.code} —— C-6 要求它由 ${FROZEN.receiptOverwriteSurface.file} 的回执写入函数产生`)
        }
        for (const s of outsideReceipt) {
          push('RECEIPT-OVERWRITE-SURFACE', `C-6 说这个码**只**由 ${FROZEN.receiptOverwriteSurface.file} 产生，但 ${s} 里也出现了`)
        }
      }
      rec.readings.receipt_writer_ambiguity = {
        note: 'C-6 冻了"码从哪来"，但**没冻那个写入函数的名字与签名**（§B1.5 的 receipt.mjs 只列了 parseFindings / validateReceiptCoverage / receiptAnchors / nextReceiptVersion）⇒ 这里只做静态产生面检查 + RCP-04 的 CLI 行为检查，不猜函数名。',
      }

      caseFail(problems)
    })
  })

  test('RCP-02 票的状态机/关闭证据/void 重呈现；未关闭采纳票必须可见', async () => {
    await runCase('RCP-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      const lib = await loadStagedModule('lib/tickets.mjs', ['validateTicket', 'canTransition', 'closeEvidenceVerdict', 'voidVerdict'])
      rec.readings.tickets_lib = { surfaceMissing: lib.surfaceMissing, missing: lib.missing, errors: lib.errors }
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/tickets.mjs 不在 —— 票的状态机与关闭证据拿不到（预期的首跑红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/tickets.mjs 没有导出 ${n}（提案 §B1.5 冻了签名）`)
      if (lib.mod === null) caseFail(problems)
      const { validateTicket, canTransition, closeEvidenceVerdict, voidVerdict } = lib.mod

      // ① 状态机：合法与非法转移（**C-3 追加裁定 v1.2 冻结**：`done`/`void` 终态；`open → done` 必须 false）
      const transitions = [
        ['open', 'in_progress', true], ['in_progress', 'done', true],
        ['open', 'void', true], ['in_progress', 'void', true],
        ['open', 'done', false],   // C-3：不许跳过 in_progress（关票要证据）
        ['done', 'open', false], ['done', 'in_progress', false], ['done', 'void', false],
        ['void', 'open', false], ['void', 'done', false], ['open', 'open', false],
      ]
      const trResults = {}
      for (const [from, to, want] of transitions) {
        let got = null
        try { got = canTransition(from, to) } catch (err) { push('TICKET-TRANSITION', `canTransition(${from},${to}) 抛错：${String(err.message).slice(0, 160)}`); continue }
        trResults[`${from}->${to}`] = got
        if (Boolean(got) !== want) push('TICKET-TRANSITION', `canTransition(${from},${to}) 应为 ${want}，实得 ${got}`)
      }
      rec.readings.transitions = trResults
      rec.readings.transition_table_frozen = FROZEN.ticketStateMachine
      rec.readings.transition_note = { note: 'C-3（追加裁定 v1.2）已冻结这张表：open→in_progress|void · in_progress→done|void · done/void 终态（open→done 必须 false）。' }

      // ② done 必须有验收证据
      const noEvidence = closeEvidenceVerdict(ticket({ status: 'in_progress' }), null)
      rec.readings.close_no_evidence = noEvidence
      if (noEvidence?.ok !== false || noEvidence?.code !== 'E_TICKET_EVIDENCE_MISSING') {
        push('TICKET-EVIDENCE', `done 无关闭证据必须 E_TICKET_EVIDENCE_MISSING，实得 ${JSON.stringify(noEvidence)?.slice(0, 160)}`)
      }
      const goodEvidence = { kind: 'test-run', ref: 'tests/agenia-upgrade/unit/guard.test.mjs', sha256: 'a'.repeat(64), note: '红→绿', closed_at: '2026-10-14T12:00:00+08:00' }
      const withEvidence = closeEvidenceVerdict(ticket({ status: 'in_progress' }), goodEvidence)
      rec.readings.close_with_evidence = withEvidence
      if (withEvidence?.ok !== true) push('TICKET-EVIDENCE', `合法关闭证据必须通过（正例），实得 ${JSON.stringify(withEvidence)?.slice(0, 160)}`)
      // 三个非空字段缺一不可
      for (const miss of ['kind', 'ref', 'sha256']) {
        const broken = { ...goodEvidence, [miss]: '' }
        const out = closeEvidenceVerdict(ticket({ status: 'in_progress' }), broken)
        if (out?.ok !== false) push('TICKET-EVIDENCE', `关闭证据缺 ${miss} 必须被拒，实得 ok=${out?.ok}`)
      }
      const badKind = closeEvidenceVerdict(ticket({ status: 'in_progress' }), { ...goodEvidence, kind: '随便写的' })
      if (badKind?.ok !== false) push('TICKET-EVIDENCE', `关闭证据的 kind 必须在 code-change|test-run|receipt|doc-update|manual-verification 里，实得通过`)

      // ③ void 必须有理由与重呈现
      const noReason = voidVerdict(ticket({ status: 'in_progress' }), { void_reason: '', re_present: { ref: 'x', at: '2026-10-14T12:00:00+08:00' } })
      rec.readings.void_no_reason = noReason
      if (noReason?.ok !== false || noReason?.code !== 'E_TICKET_VOID_REASON') {
        push('TICKET-VOID', `void 无理由必须 E_TICKET_VOID_REASON，实得 ${JSON.stringify(noReason)?.slice(0, 160)}`)
      }
      const noRep = voidVerdict(ticket({ status: 'in_progress' }), { void_reason: '原票要求改的路由在方案选择里被否，改由新票承接，验收口径一并改写。' })
      rec.readings.void_no_represent = noRep
      if (noRep?.ok !== false || noRep?.code !== 'E_TICKET_VOID_REPRESENT') {
        push('TICKET-VOID', `void 无重呈现必须 E_TICKET_VOID_REPRESENT，实得 ${JSON.stringify(noRep)?.slice(0, 160)}`)
      }
      const goodVoid = voidVerdict(ticket({ status: 'in_progress' }), {
        void_reason: '原票要求改的路由在方案选择里被否，改由 ticket-20261015-01 承接，验收口径一并改写。',
        re_present: { ref: 'leader/2026-10-15/技术复盘回执.json#F2', at: '2026-10-15T09:10:00+08:00' },
      })
      if (goodVoid?.ok !== true) push('TICKET-VOID', `合法 void（理由具体 + 有重呈现）必须通过（正例），实得 ${JSON.stringify(goodVoid)?.slice(0, 160)}`)

      // ④ validateTicket：字段齐、source 形状、id 重复、acceptance 非空
      const vt = (tk, opts) => {
        try { return validateTicket(tk, opts) } catch (err) { return { ok: null, code: 'THREW', message: String(err.message).slice(0, 160) } }
      }
      const findingsSet = new Set(['F1', 'F2'])
      const results = {}
      results['正例'] = vt(ticket(), { existingIds: [], findingsSet })
      results['缺 title'] = vt(ticket({ title: '' }), { existingIds: [], findingsSet })
      results['缺 next_step'] = vt(ticket({ next_step: '' }), { existingIds: [], findingsSet })
      results['acceptance 为空'] = vt(ticket({ acceptance: '' }), { existingIds: [], findingsSet })
      results['id 重复'] = vt(ticket(), { existingIds: [TICKET_ID], findingsSet })
      results['status 非法'] = vt(ticket({ status: '待定' }), { existingIds: [], findingsSet })
      results['source 形状不对'] = vt(ticket({ source: 'technical-review:not-a-sha#F1' }), { existingIds: [], findingsSet })
      results['source 指向不存在的发现'] = vt(ticket({ source: `technical-review:${REPORT_SHA}#F9` }), { existingIds: [], findingsSet })
      rec.readings.validate_ticket = results
      if (results['正例']?.ok !== true) push('TICKET-VALIDATE', `合法票必须通过（正例），实得 ${JSON.stringify(results['正例'])}`)
      for (const label of ['缺 title', '缺 next_step', 'acceptance 为空']) {
        if (results[label]?.ok !== false) push('TICKET-VALIDATE', `${label} 必须被拒，实得 ${JSON.stringify(results[label])}`)
      }
      if (results['id 重复']?.ok !== false || results['id 重复']?.code !== 'E_TICKET_DUP') {
        push('TICKET-VALIDATE', `id 重复必须 E_TICKET_DUP，实得 ${JSON.stringify(results['id 重复'])}`)
      }
      if (results['source 形状不对']?.ok !== false || results['source 形状不对']?.code !== 'E_TICKET_SOURCE_BAD') {
        push('TICKET-VALIDATE', `source 形状不对必须 E_TICKET_SOURCE_BAD，实得 ${JSON.stringify(results['source 形状不对'])}`)
      }
      if (results['source 指向不存在的发现']?.ok !== false) {
        push('TICKET-VALIDATE', `source 指向不存在的发现（#F9）必须被拒，实得 ${JSON.stringify(results['source 指向不存在的发现'])}`)
      }

      // ⑤ 未关闭采纳票必须可见：health 的 reads 面（CLI）
      const ws = process.env.AGENIA_TEST_WORKSPACE
      const healthRes = stagingExists('bin/agenia-local.mjs')
        ? runLocal('RCP-02', 'health', { project: 'harness', day: '2026-10-14' }, { workspace: ws })
        : null
      rec.readings.health_cli = healthRes ? { exit_code: healthRes.exit_code, code: healthRes.json?.error?.code ?? null, open_adopted_tickets: healthRes.json?.health?.open_adopted_tickets ?? null } : { note: 'staged/bin/agenia-local.mjs 不在 ⇒ health 读取面无从验证（预期红）' }
      if (healthRes === null) push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 ⇒ 未关闭采纳票的可见性拿不到（预期红）')
      else if (healthRes.exit_code !== 0) {
        push('HEALTH-CLI', `health 读取面必须可用（正例），实得 exit=${healthRes.exit_code} / ${healthRes.json?.error?.code ?? '(无错误码)'}`)
      } else {
        const open = healthRes.json?.health?.open_adopted_tickets
        if (!Array.isArray(open)) push('HEALTH-CLI', `health 输出必须带 open_adopted_tickets 数组（B3.3：非空 ⇒ 卡上必须显示"仍有 N 张采纳票未关闭"），实得 ${JSON.stringify(open)}`)
        if (healthRes.json?.health?.status === 'GREEN' && Array.isArray(open) && open.length > 0) {
          push('HEALTH-COVER', `有未关闭采纳票时不许报 GREEN（"技术复盘完成" ≠ "发现已解决"），实得 status=GREEN + open=${JSON.stringify(open)}`)
        }
      }
      rec.readings.note_p2v1 = { note: 'P2-V1 的口径：health 卡的"技术复盘完成"只看覆盖 + 锚点；未关闭采纳票另立字段，不许被绿掩盖。' }

      caseFail(problems)
    })
  })

  test('RCP-04 接手：回执版本化不静默覆盖、只补差、不伪造“原组长已处置”', async () => {
    await runCase('RCP-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      const lib = await loadStagedModule('lib/receipt.mjs', ['nextReceiptVersion'])
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/receipt.mjs 不在 —— 回执版本化拿不到（预期的首跑红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/receipt.mjs 没有导出 ${n}`)
      if (lib.mod === null) caseFail(problems)
      const { nextReceiptVersion } = lib.mod

      // ① 版本递增（C-4 追加裁定 v1.2：max+1，**空洞不填**，重复 max 也 +1，无历史 ⇒ 1）
      const cases = [
        ['无历史', [], 1],
        ['已有 v1', [1], 2],
        ['已有 v1,v2', [1, 2], 3],
        ['乱序 [2,1]', [2, 1], 3],
        ['空洞 [1,3] ⇒ 4（不是 2）', [1, 3], 4],
        ['重复 max [2,2] ⇒ 3', [2, 2], 3],
      ]
      const versionResults = {}
      for (const [label, existing, want] of cases) {
        let got = null
        try { got = nextReceiptVersion(existing) } catch (err) { push('RECEIPT-VERSION', `nextReceiptVersion(${JSON.stringify(existing)}) 抛错：${String(err.message).slice(0, 160)}`); continue }
        versionResults[label] = got
        if (got !== want) push('RECEIPT-VERSION', `${label}：nextReceiptVersion 应为 ${want}，实得 ${got}`)
      }
      rec.readings.versions = versionResults
      rec.readings.version_rule_frozen = FROZEN.nextReceiptVersionRule

      // ② 同名覆盖 ⇒ 不静默（走 local-receipt-set：同一版本号再写一次）
      const ws = process.env.AGENIA_TEST_WORKSPACE
      const day = '2026-10-14'
      const setV1 = () => runLocal('RCP-04', 'local-receipt-set', {
        project: 'harness', day, snapshot: 'v7',
        receipt_path: 'leader/2026-10-14/技术复盘回执.json', receipt_sha256: 'd'.repeat(64), receipt_version: 1, ticket_ids: [TICKET_ID],
      }, { workspace: ws })
      let first = null
      try { first = setV1() } catch (err) { push('SUT-SURFACE-MISSING', `staged/bin/agenia-local.mjs 不在 ⇒ 回执登记拿不到（预期红）：${String(err.message).slice(0, 120)}`) }
      if (first) {
        rec.readings.receipt_set_v1 = { exit_code: first.exit_code, code: first.json?.error?.code ?? null }
        if (first.exit_code !== 0) push('RECEIPT-SET', `第一次登记 v1 必须成功（正例），实得 exit=${first.exit_code} / ${first.json?.error?.code ?? '(无码)'}`)
        const second = setV1()
        rec.readings.receipt_set_again = { exit_code: second.exit_code, code: second.json?.error?.code ?? null }
        if (second.exit_code === 0) {
          push('RECEIPT-OVERWRITE', '同一版本号再登记一次竟然成功 —— 回执不许被静默覆盖（B3.2：同名覆盖 ⇒ E_RECEIPT_OVERWRITE）')
        } else if (!['E_RECEIPT_OVERWRITE', 'E_ARG_SCHEMA'].includes(second.json?.error?.code)) {
          push('RECEIPT-OVERWRITE', `同一版本号再登记应被明确拒绝（E_RECEIPT_OVERWRITE），实得 ${second.json?.error?.code}`)
        }
        const nextVersion = runLocal('RCP-04', 'local-receipt-set', {
          project: 'harness', day, snapshot: 'v7',
          receipt_path: 'leader/2026-10-14/技术复盘回执.2.json', receipt_sha256: 'e'.repeat(64), receipt_version: 2, ticket_ids: [TICKET_ID],
        }, { workspace: ws })
        rec.readings.receipt_set_v2 = { exit_code: nextVersion.exit_code, code: nextVersion.json?.error?.code ?? null }
        if (nextVersion.exit_code !== 0) push('RECEIPT-SET', `下一版（v2）登记必须成功（版本化路径要通），实得 exit=${nextVersion.exit_code} / ${nextVersion.json?.error?.code ?? '(无码)'}`)
      }

      // ③ 接手声明：taken-over 必须带来源与说明；不许伪造"原组长已处置"
      const handover = { mode: 'taken-over', from_receipt_version: 1, statement: '接手自 2026-10-14 的组长；不知原组长是否已行动。' }
      const rc = receipt({ version: 2, handover })
      rec.readings.handover = rc.handover
      const forbidden = /原组长(已经|已)?(处置|处理|看过|同意了)/
      if (forbidden.test(handover.statement)) push('RECEIPT-HANDOVER', `接手声明里不许写"原组长已处置"这类伪造（B3.2），实得 ${JSON.stringify(handover.statement)}`)
      const lib2 = await loadStagedModule('lib/receipt.mjs', ['validateReceiptCoverage'])
      if (lib2.mod?.validateReceiptCoverage) {
        const out = coverageOf(lib2.mod.validateReceiptCoverage, [rc, findingsFile(), [ticket()], { report_sha256: REPORT_SHA, findings_set_sha256: SET_SHA }])
        rec.readings.handover_validated = out
        if (out.ok !== true) push('RECEIPT-HANDOVER', `带完整接手声明的回执必须能通过覆盖校验（正例），实得 ok=${out.ok} code=${out.code}`)
      }

      // ④ 重复开票 / 复用已有票
      const ticketLib = await loadStagedModule('lib/tickets.mjs', ['validateTicket'])
      if (ticketLib.mod?.validateTicket) {
        const dup = ticketLib.mod.validateTicket(ticket(), { existingIds: [TICKET_ID], findingsSet: new Set(['F1', 'F2']) })
        rec.readings.reopen = dup
        if (dup?.ok !== false || dup?.code !== 'E_TICKET_DUP') push('TICKET-REOPEN', `接手的人重复开同一张票必须 E_TICKET_DUP（B3.2/RCP-04：只能补差、复用已有票），实得 ${JSON.stringify(dup)?.slice(0, 160)}`)
      }

      rec.readings.pending_r1 = {
        status: 'PENDING',
        note: '父死三窗口（报告落盘后回执前 / 已开部分票写了半份回执 / 回执已 present 但状态未写）+ "下一 owner 接手时不丢失败原因" 需要通知与父进程生命周期接缝（bg-notify --op parent-dead + JOB-02），契约把这条放在 R1-04/JOB-02 ⇒ **本用例记 PENDING，不折成通过**。',
      }

      caseFail(problems)
    })
  })
})
