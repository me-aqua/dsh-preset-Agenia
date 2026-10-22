/**
 * `VRF-03` · **`F-122`** —— `code_fingerprint` 的 `equal` 是**作业自报**，校验方必须自己判。
 *
 * 病根（盘上现场，2026-10-22）：`presets/agenia/lib/receipt.mjs:131-133,266-274` ——
 * 只要求 `code_fingerprint` 带一个 **boolean** 的 `equal`；`validateReceiptCoverage` 唯一看的是
 * `equal !== true`。于是两个方向都能过：
 *   ① `before ≠ after` 却写 `equal:true` ⇒ 过；
 *   ② **只写 `{equal:true}`、连哈希都不给** ⇒ 过（校验方连"能不能复核"都不问）。
 *
 * 判据（六格；`before_sha256`/`after_sha256` 的"真值"由 `.tools/fingerprint.mjs` 对
 * **两棵真夹具树**量出来 —— 不是手写的 64 hex）：
 *   P `正例`      `equal:true` + 两个哈希**彼此相同且等于盘面复算** + `anchors` 复算一致 ⇒ 必须过
 *   N1 `①形`     `before ≠ after` 却 `equal:true` ⇒ 必须拒（`E_CODE_FINGERPRINT_MOVED`）← **今天红**
 *   N2 `②形`     只有 `{equal:true}`、没有两个哈希 ⇒ 必须拒（`E_ARG_SCHEMA`：不可复核就等于没声明）← **今天红**
 *   N2b `半形`   两个哈希在，但不是 64 hex ⇒ 必须拒（同上）← **今天红**
 *   N3 `③形`     `equal:true`、两哈希自洽，但 `anchors.code_fingerprint` 的**盘面复算**对不上 ⇒ 必须拒 ← **今天红**
 *   R `防退化`   `equal:false` ⇒ 必须拒（这一格今天就绿，`F-122` 不许把它弄丢）
 *
 * ⚠️ **N3 的边界（写清，别假装覆盖得更宽）**：校验方手里没有那棵树就算不出来。
 *    本格钉的是**接缝**：`anchors.code_fingerprint` 一旦给了，必须逐项比对。
 *    "谁去哪棵树量、什么时候量"是下一票（`receipt-check` 目前没有 `code_root` 这个入参）。
 */
import { before, describe, test } from 'node:test'
import { caseFail, preflight, problem, runCase, sha256Text } from '../support/evidence.mjs'
import { loadStagedModule } from '../support/sut.mjs'
import { buildPresetTree, fingerprintCode, q10Digest, FIXTURE_RECEIPT_999 } from '../support/verify-recompute.mjs'

before(() => {
  preflight()
})

const DAY = '2026-10-14'
const REPORT_REL = `retro/${DAY}/技术评审.md`
const REPORT_SHA = sha256Text('# 技术评审（夹具）\n')
const ZERO = '0'.repeat(64)
/**
 * 本文件 `findingsFile()` 那条 finding（`[F1]`）的**真值**（`F-121`：Q10 复算）——
 * 正例格要靠它过：`parseFindings` 现在会自己复算集合哈希再跟声明值比。
 *
 * Q10（`CONTRACT.md §6.2`）= `sha256(JSON.stringify(findings, 键按 UTF-8 字节序升序, 无空白))`。
 * 写常量而不是现算：声明值与校验方的复算必须是**两份来源**。常量与内容的对账见下面的 `FIXTURE-SET-SHA`。
 * 独立复算记录：`.team/test/2026-10-22/_evidence/q10-recompute.out.txt`。
 */
const SET_SHA = 'cfe753430d2904c2b2280aafbfaef56ccf7f4655dbd29da690459fb531bd6393'

const finding = (id) => ({
  id,
  title: `（夹具）发现 ${id}`,
  severity: 'P2',
  evidence: [{ kind: 'file', ref: 'presets/agenia/inject.js' }],
  summary: `（夹具）${id} 的一句话摘要`,
})

const findingsFile = (fingerprint, over = {}) => ({
  schema: 1,
  day: DAY,
  report_path: REPORT_REL,
  report_sha256: REPORT_SHA,
  generated_at: `${DAY}T11:00:00+08:00`,
  code_fingerprint: fingerprint,
  findings: [finding('F1')],
  findings_set_sha256: SET_SHA,
  ...over,
})

const receipt = () => ({
  schema: 1,
  version: 1,
  superseded_by: null,
  project: 'harness',
  day: DAY,
  lead: 'Agenia',
  report: { path: REPORT_REL, sha256: REPORT_SHA },
  findings_set_sha256: SET_SHA,
  findings: [{ id: 'F1', disposition: 'rejected', ticket_id: null, reason: '这一条与当前目标冲突，等停机安装完成后再评估。' }],
  handover: { mode: 'fresh', from_receipt_version: null, statement: null },
  created_at: `${DAY}T11:05:00+08:00`,
  receipt_sha256: 'd'.repeat(64),
})

function coverageOf(fn, args) {
  try {
    const out = fn(...args)
    return { threw: null, ok: out?.ok ?? null, code: out?.code ?? null, fingerprintProblems: out?.fingerprintProblems ?? null }
  } catch (err) {
    return { threw: String(err?.message ?? err).slice(0, 240), ok: null, code: null, fingerprintProblems: null }
  }
}

function parseOf(fn, arg) {
  try {
    const out = fn(arg)
    return { threw: null, ok: out?.ok ?? null, code: out?.code ?? null }
  } catch (err) {
    return { threw: String(err?.message ?? err).slice(0, 240), ok: null, code: null }
  }
}

describe('unit · verify-recompute (VRF) · F-122 指纹 equal 自报', () => {
  test('VRF-03 code_fingerprint 的三种形状必须拒；真 equal 且可复算才过', async () => {
    await runCase('VRF-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      const lib = await loadStagedModule('lib/receipt.mjs', ['parseFindings', 'validateReceiptCoverage'])
      rec.readings.receipt_lib = { surfaceMissing: lib.surfaceMissing, missing: lib.missing, errors: lib.errors }
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/receipt.mjs 不在 —— 指纹自报那三格拿不到（预期红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/receipt.mjs 没有导出 ${n}`)
      if (lib.mod === null) caseFail(problems)
      const { parseFindings, validateReceiptCoverage } = lib.mod

      // ⓪ 夹具自证（防漂移）：本文件那份 `[F1]` 的声明值必须真是它的 Q10 复算值。
      //    这一格红了 = 夹具内容或常量改错了（例如又有人拿 `'b'.repeat(64)` 顶上），不是 SUT 坏了。
      const setShaTruth = q10Digest(findingsFile({ equal: true }).findings)
      rec.readings.fixture_set_sha = { constant: SET_SHA, q10_truth: setShaTruth, equal: SET_SHA === setShaTruth }
      if (SET_SHA !== setShaTruth) {
        push('FIXTURE-SET-SHA', `夹具的 findings_set_sha256 常量 ${SET_SHA.slice(0, 12)}… 与那条 finding 的 Q10 复算值 ${setShaTruth.slice(0, 12)}… 不符 —— 先改夹具，别去动被测模块`)
      }

      // ── 两棵真夹具树：只有 lib/receipt.mjs 差一个字节 ──────────────────
      const treeA = buildPresetTree('VRF-03', 'code-a')
      const treeB = buildPresetTree('VRF-03', 'code-b', { receipt: FIXTURE_RECEIPT_999 })
      const realA = fingerprintCode(treeA)
      const realB = fingerprintCode(treeB)
      rec.readings.code_trees = {
        a: { root: treeA, ok: realA.ok, sha256: realA.code?.sha256 ?? null, files: realA.code?.files ?? null },
        b: { root: treeB, ok: realB.ok, sha256: realB.code?.sha256 ?? null, files: realB.code?.files ?? null },
      }
      if (!realA.ok || !realB.ok) {
        push('FINGERPRINT-TOOL', `量夹具树失败（这一格的"真值"来自这把尺子）：${[...realA.problems, ...realB.problems].join('；')}`)
        caseFail(problems)
      }
      const SHA_A = realA.code.sha256
      const SHA_B = realB.code.sha256
      if (SHA_A === SHA_B) {
        push('FIXTURE-BAD', '两棵夹具树只改了 lib/receipt.mjs 一个常数，CODE 指纹居然相同 ⇒ 阳性对照失效，这一格量不到任何东西')
        caseFail(problems)
      }

      // ── P 正例：equal:true + 两哈希相同 + 盘面复算一致 ─────────────────
      const goodFp = { before_sha256: SHA_A, after_sha256: SHA_A, equal: true }
      const goodAnchors = { report_sha256: REPORT_SHA, code_fingerprint: { before_sha256: SHA_A, after_sha256: SHA_A } }
      const goodParse = parseOf(parseFindings, findingsFile(goodFp))
      rec.readings.positive_parse = goodParse
      if (goodParse.threw !== null) push('FINGERPRINT-POSITIVE', `正例 parseFindings 不该抛：${goodParse.threw}`)
      else if (goodParse.ok !== true) push('FINGERPRINT-POSITIVE', `正例（equal:true · 两哈希相同且等于盘面 ${SHA_A.slice(0, 12)}…）必须过，实得 ok=${goodParse.ok} code=${goodParse.code}`)
      const goodCov = coverageOf(validateReceiptCoverage, [receipt(), findingsFile(goodFp), null, goodAnchors])
      rec.readings.positive_coverage = goodCov
      if (goodCov.threw !== null) push('FINGERPRINT-POSITIVE', `正例覆盖校验不该抛：${goodCov.threw}`)
      else if (goodCov.ok !== true) push('FINGERPRINT-POSITIVE', `正例覆盖校验必须 ok:true，实得 ok=${goodCov.ok} code=${goodCov.code}`)

      // ── N1 `before ≠ after` 却 `equal:true` ⇒ 必须拒 ───────────────────
      const n1Fp = { before_sha256: SHA_A, after_sha256: SHA_B, equal: true }
      const n1Parse = parseOf(parseFindings, findingsFile(n1Fp))
      rec.readings.n1_parse = n1Parse
      if (n1Parse.ok !== false) {
        push('FP-EQUAL-LIES', `①形：before=${SHA_A.slice(0, 12)}… ≠ after=${SHA_B.slice(0, 12)}… 却写 equal:true ⇒ parseFindings 必须拒，实得 ok=${n1Parse.ok} code=${n1Parse.code}`)
      } else if (n1Parse.code !== 'E_CODE_FINGERPRINT_MOVED') {
        push('FP-EQUAL-LIES', `①形的原因码应为 E_CODE_FINGERPRINT_MOVED，实得 ${n1Parse.code}`)
      }
      const n1Cov = coverageOf(validateReceiptCoverage, [receipt(), findingsFile(n1Fp), null, { report_sha256: REPORT_SHA }])
      rec.readings.n1_coverage = n1Cov
      if (n1Cov.ok !== false) {
        push('FP-EQUAL-LIES', `①形在回执门（validateReceiptCoverage）也必须拒，实得 ok=${n1Cov.ok} code=${n1Cov.code} —— 今天它只看 \`equal !== true\`，两个哈希对不上照样过`)
      } else if (n1Cov.code !== 'E_CODE_FINGERPRINT_MOVED') {
        push('FP-EQUAL-LIES', `①形在回执门的原因码应为 E_CODE_FINGERPRINT_MOVED，实得 ${n1Cov.code}`)
      }

      // ── N2 只有 {equal:true}（连哈希都不给）⇒ 必须拒 ───────────────────
      const n2Parse = parseOf(parseFindings, findingsFile({ equal: true }))
      rec.readings.n2_parse = n2Parse
      if (n2Parse.ok !== false) {
        push('FP-ONLY-BOOLEAN', `②形：只写 \`{equal:true}\`、两个哈希一个都不给 ⇒ 校验方无从复核，必须拒（E_ARG_SCHEMA），实得 ok=${n2Parse.ok} code=${n2Parse.code}`)
      } else if (n2Parse.code !== 'E_ARG_SCHEMA') {
        push('FP-ONLY-BOOLEAN', `②形的原因码应为 E_ARG_SCHEMA，实得 ${n2Parse.code}`)
      }
      const n2Cov = coverageOf(validateReceiptCoverage, [receipt(), findingsFile({ equal: true }), null, { report_sha256: REPORT_SHA }])
      rec.readings.n2_coverage = n2Cov
      if (n2Cov.ok !== false) {
        push('FP-ONLY-BOOLEAN', `②形在回执门也必须拒，实得 ok=${n2Cov.ok} code=${n2Cov.code}`)
      } else if (n2Cov.code !== 'E_ARG_SCHEMA') {
        push('FP-ONLY-BOOLEAN', `②形在回执门的原因码应为 E_ARG_SCHEMA，实得 ${n2Cov.code}`)
      }

      // ── N2b 半形：两个哈希在，但不是 64 hex ⇒ 必须拒 ───────────────────
      const n2bFp = { before_sha256: 'abc', after_sha256: 'abc', equal: true }
      const n2bParse = parseOf(parseFindings, findingsFile(n2bFp))
      rec.readings.n2b_parse = n2bParse
      if (n2bParse.ok !== false) {
        push('FP-HALF-SHAPE', `半形：两个哈希都不是 64 hex（'abc'）却写 equal:true ⇒ 必须拒，实得 ok=${n2bParse.ok} code=${n2bParse.code}`)
      } else if (n2bParse.code !== 'E_ARG_SCHEMA') {
        push('FP-HALF-SHAPE', `半形的原因码应为 E_ARG_SCHEMA，实得 ${n2bParse.code}`)
      }

      // ── N3 `equal:true`、两哈希自洽，但盘面复算对不上 ⇒ 必须拒 ─────────
      const n3Fp = { before_sha256: SHA_B, after_sha256: SHA_B, equal: true }
      const n3Cov = coverageOf(validateReceiptCoverage, [
        receipt(), findingsFile(n3Fp), null,
        { report_sha256: REPORT_SHA, code_fingerprint: { before_sha256: SHA_A, after_sha256: SHA_A } },
      ])
      rec.readings.n3_coverage = n3Cov
      if (n3Cov.ok !== false) {
        push('FP-RECOMPUTE', `③形：声明（${SHA_B.slice(0, 12)}…，自洽）与盘面复算（${SHA_A.slice(0, 12)}…）不符 ⇒ 回执门必须拒，实得 ok=${n3Cov.ok} code=${n3Cov.code}（\`anchors.code_fingerprint\` 今天被整个忽略）`)
      } else if (n3Cov.code !== 'E_CODE_FINGERPRINT_MOVED') {
        push('FP-RECOMPUTE', `③形的原因码应为 E_CODE_FINGERPRINT_MOVED，实得 ${n3Cov.code}`)
      }

      // ── R 防退化：equal:false ⇒ 必须拒（今天就绿，不许被弄丢）──────────
      const rFp = { before_sha256: SHA_A, after_sha256: SHA_B, equal: false }
      const rCov = coverageOf(validateReceiptCoverage, [receipt(), findingsFile(rFp), null, { report_sha256: REPORT_SHA }])
      rec.readings.equal_false = rCov
      if (rCov.ok !== false || rCov.code !== 'E_CODE_FINGERPRINT_MOVED') {
        push('FP-EQUAL-FALSE', `equal:false（作业自己说了"不等 ⇒ 本次作废"）必须拒 E_CODE_FINGERPRINT_MOVED，实得 ok=${rCov.ok} code=${rCov.code} —— 这条今天就成立，F-122 不许把它改坏`)
      }

      // ── 读数：这一格今天"谎报成什么样"、以及哪儿判不了 ────────────────
      rec.readings.note = {
        three_shapes: ['before≠after + equal:true', '只有 {equal:true}', 'equal:true 但声明与盘面复算不符'],
        /** 🔴 **判不了的那一格**（写在这儿，别让它假装被覆盖）：自洽但编造的 64 hex + 没给盘面复算。 */
        unjudgeable: {
          fingerprint: { before_sha256: ZERO, after_sha256: ZERO, equal: true },
          why: '两个哈希自洽、形状合法、而调用方没给 anchors.code_fingerprint ⇒ 校验方手里没有那棵树，无法判它是真是假。这一格只能由"谁去量那棵树"来关上（receipt-check 目前没有 code_root 入参）。',
        },
        boundary: '本格钉的是接缝：anchors.code_fingerprint 一旦给出，必须逐项比对；没给时不假装判过（也不许把"没给"读成"相等"）。',
      }

      caseFail(problems)
    })
  })
})
