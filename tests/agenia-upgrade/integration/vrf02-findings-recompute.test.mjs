/**
 * `VRF-02` · **`F-121`** —— `findings_set_sha256` 必须由**校验方自己复算**。
 *
 * 病根（盘上现场，2026-10-22）：`presets/agenia/lib/receipt.mjs:184` 已经算出
 * `computed_set_sha256`，**全树零消费点**；`lib/local-state.mjs:388,390` 对
 * `findings_set_sha256` 只验"存在 / 64 hex"。⇒ 声明 `0000…0` 也 `ok=true`
 * （`cand-20261018-0113`：作业自报一个 64 hex 就过）。
 *
 * 判据（两把尺子 + 两个入口 + 一个真消费方）：
 *   A `尺子对账` 测试侧独立实现的 Q10 哈希 **必须等于** `findingsSetSha256()` 给的数
 *                （两边不一致 ⇒ "复算"这件事本身没有共同口径，后面全是空话）
 *   B `正例`     内容与声明都对得上 ⇒ `parseFindings` / `validateReceiptCoverage` 都过
 *   C `反例`     findings 内容**改一个字**、声明值不动 ⇒ 两个入口都必须拒（`E_RECEIPT_HASH`）← **今天红**
 *   D `零发现`   `[]` + 空集合哈希 ⇒ 必须过（防"复算"把空集判红）
 *   E `真消费方` `agenia-local.mjs --op receipt-check`：正例 exit 0；改一个字以后必须非 0 且点名 `E_RECEIPT_HASH` ← **今天红**
 *
 * 🔴 E 是这一票的重心：`receipt.mjs` 里加一条比对只是"能算"，
 *    只有**消费点**（`receipt-check`）拒了，`F-121` 才算真的修了。
 */
import { before, describe, test } from 'node:test'
import path from 'node:path'
import { caseFail, preflight, problem, runCase, sha256Text } from '../support/evidence.mjs'
import { loadStagedModule, runLocal, stagingExists } from '../support/sut.mjs'
import { q10Digest, writeUnder } from '../support/verify-recompute.mjs'

before(() => {
  preflight()
})

/**
 * 🔴 **日期别用 `2026-10-14`**（2026-10-22 实测撞过一次）：`RCP-04` 也在那一天、
 * 也用默认回执路径 `leader/<day>/技术复盘回执.json`，而它的第一格是"登记 v1 必须成功"。
 * 本用例会**先**往同一个 workspace 里摆一份回执 ⇒ `local-receipt-set` 读到"目标文件已存在"就
 * 判 `E_RECEIPT_OVERWRITE`，把 `RCP-04` 弄红（红因看着像被测对象的锅，其实是**用例之间抢落点**）。
 * ⇒ 本用例占一个**没有别的用例用**的日期（`10-13`～`10-19` 之外），自己的状态也另开一份。
 */
const DAY = '2026-10-08'
const REPORT_REL = `retro/${DAY}/技术评审.md`
/** 产物里**声明**的报告落点 = 规范形（`job-briefs/technical-review.md:28`：必须带 `.team/` 那一层）。 */
const REPORT_DECLARED = `.team/${REPORT_REL}`
const FINDINGS_REL = `retro/${DAY}/技术评审.findings.json`
const RECEIPT_REL = `leader/${DAY}/技术复盘回执.json`
const REPORT_TEXT = '# 技术评审（夹具）\n\n## F1\n夹具报告正文。\n'
const REPORT_SHA = sha256Text(REPORT_TEXT)

const finding = (id, over = {}) => ({
  id,
  title: `（夹具）发现 ${id}`,
  severity: 'P2',
  evidence: [{ kind: 'file', ref: 'presets/agenia/inject.js' }],
  summary: `（夹具）${id} 的一句话摘要`,
  ...over,
})

/** 两条发现（键全是 ASCII；值里有中文 —— Q10 的字节序只对键有影响）。 */
const FINDINGS = [finding('F1'), finding('F2')]
/** 声明值 = **测试侧独立算**（不是被测模块算的）。 */
const SET_SHA = q10Digest(FINDINGS)

const findingsFile = (list = FINDINGS, over = {}) => ({
  schema: 1,
  day: DAY,
  report_path: REPORT_DECLARED,
  report_sha256: REPORT_SHA,
  generated_at: `${DAY}T11:00:00+08:00`,
  code_fingerprint: { before_sha256: 'c'.repeat(64), after_sha256: 'c'.repeat(64), equal: true },
  findings: list,
  findings_set_sha256: SET_SHA,
  ...over,
})

/** 内容改一个字（`F1.summary` 末尾加一个句号），**声明值一个字节不动**。 */
const TAMPERED = FINDINGS.map((row) => (row.id === 'F1' ? { ...row, summary: `${row.summary}。` } : row))

const receiptOf = (list = FINDINGS, over = {}) => ({
  schema: 1,
  version: 1,
  superseded_by: null,
  project: 'harness',
  day: DAY,
  lead: 'Agenia',
  report: { path: REPORT_REL, sha256: REPORT_SHA },
  findings_set_sha256: SET_SHA,
  findings: list.map((row) => ({
    id: row.id,
    disposition: 'rejected',
    ticket_id: null,
    reason: `第 ${row.id} 条与当前目标（先把执行二收尾）冲突，等停机安装完成后再评估。`,
  })),
  handover: { mode: 'fresh', from_receipt_version: null, statement: null },
  created_at: `${DAY}T11:05:00+08:00`,
  receipt_sha256: 'd'.repeat(64),
  ...over,
})

/** 覆盖校验的读数（只取这一票关心的几格，便于逐条断言）。 */
function coverageOf(fn, args) {
  try {
    const out = fn(...args)
    return { threw: null, ok: out?.ok ?? null, code: out?.code ?? null, anchorProblems: out?.anchorProblems ?? null }
  } catch (err) {
    return { threw: String(err?.message ?? err).slice(0, 240), ok: null, code: null, anchorProblems: null }
  }
}

describe('integration · verify-recompute (VRF) · F-121 findings 复算', () => {
  test('VRF-02 findings_set_sha256 必须由校验方复算，不采信自报值', async () => {
    await runCase('VRF-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      const lib = await loadStagedModule('lib/receipt.mjs', ['parseFindings', 'validateReceiptCoverage', 'findingsSetSha256'])
      rec.readings.receipt_lib = { surfaceMissing: lib.surfaceMissing, missing: lib.missing, errors: lib.errors }
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/receipt.mjs 不在 —— findings 复算拿不到（预期红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/receipt.mjs 没有导出 ${n}`)
      if (lib.mod === null) caseFail(problems)
      const { parseFindings, validateReceiptCoverage, findingsSetSha256 } = lib.mod

      // ── A 两把尺子对同一个数 ────────────────────────────────────────────
      let sutDigest = null
      try {
        sutDigest = String(findingsSetSha256(FINDINGS)).toLowerCase()
      } catch (err) {
        push('SUT-DIGEST-THREW', `findingsSetSha256 抛错：${String(err?.message ?? err).slice(0, 200)}`)
      }
      rec.readings.digest = { independent: SET_SHA, sut: sutDigest, canonical_sample: q10Digest(FINDINGS.slice(0, 1)).slice(0, 12) }
      if (sutDigest !== null && sutDigest !== SET_SHA) {
        push('DIGEST-CALIBER', `Q10 规范化哈希两边不一致：被测模块算 ${sutDigest}，测试侧独立实现算 ${SET_SHA} —— 口径没对齐之前，"复算"比对本身没有意义`)
      }

      // ── B 正例 ─────────────────────────────────────────────────────────
      const good = parseFindings(findingsFile())
      rec.readings.positive = { ok: good?.ok ?? null, code: good?.code ?? null, computed: good?.computed_set_sha256 ?? null, declared: good?.declared_set_sha256 ?? null }
      if (good?.ok !== true) push('FINDINGS-POSITIVE', `内容与声明对得上 ⇒ parseFindings 必须 ok:true，实得 ok=${good?.ok} code=${good?.code ?? null}`)
      if (good?.computed_set_sha256 !== SET_SHA || good?.declared_set_sha256 !== SET_SHA) {
        push('FINDINGS-POSITIVE', `parseFindings 必须同时给出"算出来的"与"声明的"两个值且都等于 ${SET_SHA.slice(0, 12)}…，实得 computed=${String(good?.computed_set_sha256).slice(0, 12)}… declared=${String(good?.declared_set_sha256).slice(0, 12)}…`)
      }
      const goodCov = coverageOf(validateReceiptCoverage, [receiptOf(), findingsFile(), null, { report_sha256: REPORT_SHA }])
      rec.readings.positive_coverage = goodCov
      if (goodCov.threw !== null) push('FINDINGS-POSITIVE', `正例覆盖校验不该抛：${goodCov.threw}`)
      else if (goodCov.ok !== true) push('FINDINGS-POSITIVE', `正例覆盖校验必须 ok:true，实得 ok=${goodCov.ok} code=${goodCov.code}`)

      // ── C 反例：内容改一个字、声明不动 ⇒ 必须拒 ────────────────────────
      const tamperedDigest = q10Digest(TAMPERED)
      rec.readings.tamper = { declared: SET_SHA, actual_content_digest: tamperedDigest }
      if (tamperedDigest === SET_SHA) {
        push('FIXTURE-BAD', '夹具坏了：把 summary 改了一个字，独立算出来的集合哈希居然没变 ⇒ 这一格恒真，量不到任何东西')
      }
      const tampered = parseFindings(findingsFile(TAMPERED))
      rec.readings.tampered_parse = {
        ok: tampered?.ok ?? null, code: tampered?.code ?? null,
        computed: tampered?.computed_set_sha256 ?? null, declared: tampered?.declared_set_sha256 ?? null,
      }
      if (tampered?.ok !== false) {
        push('FINDINGS-RECOMPUTE', `findings 内容改了一个字（${tamperedDigest.slice(0, 12)}…）而声明的 findings_set_sha256 还是 ${SET_SHA.slice(0, 12)}… ⇒ parseFindings 必须拒，实得 ok=${tampered?.ok} code=${tampered?.code ?? null}（第 184 行算出来的 computed_set_sha256 没有人比）`)
      } else if (tampered?.code !== 'E_RECEIPT_HASH') {
        push('FINDINGS-RECOMPUTE', `这一格的原因码应为 E_RECEIPT_HASH（回执族的锚点码），实得 ${tampered?.code ?? null}`)
      }
      if (tampered?.computed_set_sha256 != null && tampered?.declared_set_sha256 != null
        && String(tampered.computed_set_sha256).toLowerCase() === String(tampered.declared_set_sha256).toLowerCase()) {
        push('FINDINGS-RECOMPUTE', '自相矛盾：算出来的值等于声明值，却仍被判拒 —— 报出来的两个数必须能让人看出差在哪')
      }
      const tamperedCov = coverageOf(validateReceiptCoverage, [receiptOf(), findingsFile(TAMPERED), null, { report_sha256: REPORT_SHA }])
      rec.readings.tampered_coverage = tamperedCov
      if (tamperedCov.threw !== null) push('FINDINGS-RECOMPUTE', `反例覆盖校验不该抛：${tamperedCov.threw}`)
      else if (tamperedCov.ok !== false) {
        push('FINDINGS-RECOMPUTE', `回执门（validateReceiptCoverage）也必须复算并拒，实得 ok=${tamperedCov.ok} code=${tamperedCov.code} —— 只把复算做在 parseFindings 里，回执门这一侧照旧是"信自报"`)
      } else if (tamperedCov.code !== 'E_RECEIPT_HASH') {
        push('FINDINGS-RECOMPUTE', `回执门这一格的原因码应为 E_RECEIPT_HASH，实得 ${tamperedCov.code}`)
      }

      // ── D 零发现正例（防"复算"把空集判红）──────────────────────────────
      const emptyDigest = q10Digest([])
      const emptyFile = findingsFile([], { findings_set_sha256: emptyDigest })
      const emptyParse = parseFindings(emptyFile)
      rec.readings.zero = { digest: emptyDigest, parse_ok: emptyParse?.ok ?? null, parse_code: emptyParse?.code ?? null }
      if (emptyParse?.ok !== true) push('FINDINGS-ZERO', `零发现（\`[]\` + 空集合哈希 ${emptyDigest.slice(0, 12)}…）必须过，实得 ok=${emptyParse?.ok} code=${emptyParse?.code ?? null}`)
      const emptyCov = coverageOf(validateReceiptCoverage, [
        receiptOf([], { findings_set_sha256: emptyDigest }),
        emptyFile, null, { report_sha256: REPORT_SHA, findings_set_sha256: emptyDigest },
      ])
      rec.readings.zero_coverage = emptyCov
      if (emptyCov.ok !== true) push('FINDINGS-ZERO', `零发现的覆盖校验必须过，实得 ok=${emptyCov.ok} code=${emptyCov.code}`)

      // ── E 真消费方：receipt-check（读面；正例过、改一个字必须拒）────────
      if (!stagingExists('bin/agenia-local.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 ⇒ `--op receipt-check` 这个消费点量不到（预期红）')
        caseFail(problems)
      }
      const ws = process.env.AGENIA_TEST_WORKSPACE
      if (typeof ws !== 'string' || ws.trim() === '') {
        push('ENV-MISSING', 'AGENIA_TEST_WORKSPACE 没给 —— receipt-check 的落点无从摆（runner 必须先导出它）')
        caseFail(problems)
      }
      // 作业产物写在 `.team/` 下（`job-briefs/technical-review.md:13` 的落点；`report_path` 用 `.team` 相对的
      // `retro/<day>/…`，`local-mark` 收下之后节点里记的是规范形 `.team/retro/<day>/…`）。
      writeUnder(path.join(ws, '.team'), REPORT_REL, REPORT_TEXT)
      writeUnder(path.join(ws, '.team'), FINDINGS_REL, `${JSON.stringify(findingsFile(), null, 2)}\n`)
      writeUnder(path.join(ws, '.team'), RECEIPT_REL, `${JSON.stringify(receiptOf(), null, 2)}\n`)

      const mark = runLocal('VRF-02', 'local-mark', {
        project: 'harness',
        day: DAY,
        field: 'technical',
        state: 'done',
        report_path: REPORT_REL,
        report_sha256: REPORT_SHA,
        findings_path: FINDINGS_REL,
        findings_set_sha256: SET_SHA,
        findings_count: FINDINGS.length,
      }, { workspace: ws })
      rec.readings.local_mark = { exit_code: mark.exit_code, code: mark.json?.error?.code ?? null }
      if (mark.exit_code !== 0) {
        push('LOCAL-MARK', `摆锚点失败（local-mark exit=${mark.exit_code} / ${mark.json?.error?.code ?? '(无码)'}）—— 这一格判不了回执门：${String(mark.json?.error?.message ?? mark.stderr).slice(0, 240)}`)
      }

      const checkPayload = { project: 'harness', day: DAY, receipt_path: RECEIPT_REL }
      const positive = runLocal('VRF-02', 'receipt-check', checkPayload, { workspace: ws })
      rec.readings.cli_positive = { exit_code: positive.exit_code, code: positive.json?.error?.code ?? null, stderr: positive.stderr.trim().slice(0, 200) }
      if (positive.exit_code !== 0) {
        push('CLI-POSITIVE', `正例 receipt-check 必须 exit 0（否则"改一个字要拒"这一格量的是别的东西），实得 exit=${positive.exit_code} / ${positive.json?.error?.code ?? '(无码)'}；${String(positive.json?.error?.message ?? positive.stderr).slice(0, 240)}`)
      }

      // 改的是**同一份** findings 文件（`.team/` 下那一份）：改一个字，声明的集合摘要不动。
      writeUnder(path.join(ws, '.team'), FINDINGS_REL, `${JSON.stringify(findingsFile(TAMPERED), null, 2)}\n`)
      const negative = runLocal('VRF-02', 'receipt-check', checkPayload, { workspace: ws })
      rec.readings.cli_negative = { exit_code: negative.exit_code, code: negative.json?.error?.code ?? null }
      if (negative.exit_code === 0) {
        push('CLI-RECOMPUTE', `findings 内容改了一个字、声明的 findings_set_sha256 没变 ⇒ receipt-check 必须拒，实得 exit 0 / ok=true（回执门照旧信自报）`)
      } else if (negative.json?.error?.code !== 'E_RECEIPT_HASH') {
        push('CLI-RECOMPUTE', `这一格的原因码应为 E_RECEIPT_HASH，实得 ${negative.json?.error?.code ?? '(stdout 不是错误信封)'}；stdout=${negative.stdout.trim().slice(0, 200)}`)
      }

      caseFail(problems)
    })
  })
})
