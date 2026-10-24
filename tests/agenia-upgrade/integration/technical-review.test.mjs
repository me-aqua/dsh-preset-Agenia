/**
 * REV-03 + RCP-03 —— 技术作业产物与锚点（A3 归一：两条都落这里）。
 *
 * 冻结依据：契约 §6.7 REV-03 + §6.8 RCP-03 + 提案 §B3.1（findings 文件与**三个锚点**：`report_sha256` /
 * `findings_set_sha256` / `code_fingerprint`）+ §B3.2（回执）+ §B3.6（local-state 的 technical 节点）
 * + §B1.4（`local-mark` / `local-read` / `receipt-check` / `health`）+ 拍板 **Q7**（CODE/ALL 指纹脚本）。
 *
 * 三条口径：
 *   · **锚点来自作业产物**，不来自回执自报（B3.1 的最后一段：反例就是"改报告一字 ⇒ 状态锚点对不上"）；
 *   · `code_fingerprint.equal !== true` ⇒ **本次作废**（B3.1）；另一条由"CODE 指纹脚本"落地后补（拍板 Q7）；
 *   · REV-03 的"作业在代码副本上跑"需要真作业进程 ⇒ 那一段记 PENDING，不折成通过。
 */
import { before, describe, test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256Equal, sha256File, stagingReadings, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { loadStagedModule, runLocal, stagingExists } from '../support/sut.mjs'
import { q10Digest } from '../support/verify-recompute.mjs'

before(() => {
  preflight()
})

const DAY = '2026-10-14'
const REPORT_SHA = 'a'.repeat(64)
/**
 * `findingsFile()` 里那两条 finding 的**真值**（`F-121`：Q10 复算）。
 *
 * Q10（`CONTRACT.md §6.2` / `lib/receipt.mjs` 文件头）= `sha256(JSON.stringify(findings, 键按 UTF-8 字节序升序, 无空白))`。
 * 作业产物该声明它、校验方复算它 —— 两边是**两份来源**，所以这里写常量而不是拿被测模块算
 * （`cand-20261016-selfsourced-order-01`）。常量与内容的对账在 REV-03 ① 的 `FIXTURE-SET-SHA`。
 * 独立复算记录（两门语言各算一遍）：`.team/test/2026-10-22/_evidence/q10-recompute.out.txt`。
 */
const SET_SHA = 'aeaf9b2e39eac06b2648c761b13106c82d44b64634e875a6d4729e2494c920f3'

function caseWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}
const runLocalSoft = (caseId, op, payload, ws) => {
  try {
    return runLocal(caseId, op, payload, { workspace: ws })
  } catch (err) {
    return { exit_code: null, json: { error: { code: err?.code ?? 'THREW' } }, stdout: '', stderr: String(err.message) }
  }
}
const finding = (id, over = {}) => ({
  id,
  title: `（夹具）发现 ${id}`,
  severity: 'P2',
  evidence: [{ kind: 'file', ref: 'presets/agenia/inject.js', note: '夹具' }],
  summary: `（夹具）${id} 的一句话摘要`,
  ...over,
})
const findingsFile = (over = {}) => ({
  schema: 1,
  day: DAY,
  // 产物里声明的报告落点用**规范形**（`job-briefs/technical-review.md:28` 的例：必须带 `.team/` 那一层）。
  report_path: '.team/retro/2026-10-14/技术评审.md',
  report_sha256: REPORT_SHA,
  generated_at: '2026-10-14T11:00:00+08:00',
  code_fingerprint: { before_sha256: 'c'.repeat(64), after_sha256: 'c'.repeat(64), equal: true },
  findings: [finding('F1'), finding('F2')],
  findings_set_sha256: SET_SHA,
  ...over,
})
const receipt = (over = {}) => ({
  schema: 1,
  version: 1,
  superseded_by: null,
  project: 'harness',
  day: DAY,
  lead: 'Agenia',
  report: { path: 'retro/2026-10-14/技术评审.md', sha256: REPORT_SHA },
  findings_set_sha256: SET_SHA,
  findings: [
    { id: 'F1', disposition: 'adopted', ticket_id: 'ticket-20261014-01', reason: null },
    { id: 'F2', disposition: 'rejected', ticket_id: null, reason: '（夹具）与当前目标冲突，等停机安装完成后再评估。' },
  ],
  handover: { mode: 'fresh', from_receipt_version: null, statement: null },
  created_at: '2026-10-14T11:05:00+08:00',
  receipt_sha256: 'd'.repeat(64),
  ...over,
})
/**
 * 票夹具（§8 的采纳票）。
 * 🔴 v1.17 ④：`source` 必须用**作业产物里那个真哈希**（`art.reportSha`），不能拿常量 `'a'.repeat(64)` ——
 *    同一判据（"票的来源要能指到报告与 finding"）以前被两个夹具用了两个不同常量，
 *    于是与 RCP-01 的「票 source 不含报告 SHA ⇒ 必须拒」负例**互斥**。
 */
const ticket = (reportSha = REPORT_SHA) => ({
  id: 'ticket-20261014-01',
  title: '（夹具）guard 错误文案补正确示例',
  source: `technical-review:${reportSha}#F1`,
  next_step: '实现关在 staging 改文案并重跑 G5',
  acceptance: 'inject-probe 的 G5 通过',
  status: 'open',
  created_at: '2026-10-14T11:06:00+08:00',
  last_update: '2026-10-14T11:06:00+08:00',
  closure_evidence: null,
  void_reason: null,
  re_present: null,
  closed_at: null,
})

/** 把作业产物（报告 + findings）真写进测试工作区的 `.team/` 下，并返回它们的真实哈希。 */
function writeArtifacts(ws) {
  const reportPath = path.join(ws, '.team', 'retro', DAY, '技术评审.md')
  writeJson(path.join(path.dirname(reportPath), '.keep.json'), { note: 'mkdir 占位' })
  writeFileSync(reportPath, '# 技术评审（夹具）\n\n- F1：（夹具）一条发现\n- F2：（夹具）另一条发现\n', 'utf8')
  const reportSha = sha256File(reportPath)
  const findingsPath = path.join(ws, '.team', 'retro', DAY, '技术评审.findings.json')
  // 🔴 作业产物写的声明值必须是 **Q10 复算值**（`SET_SHA`，那份 2 条 finding 内容的真值）。
  //    以前这里写的是 `sha256Text(JSON.stringify(…))` —— 键没排序，是"自报值与内容不符"的一个形状，
  //    正是 `F-121` 要拒的（`receipt-check` 会读这份文件并自己复算）。
  const ff = findingsFile({ report_sha256: reportSha })
  writeJson(findingsPath, ff)
  return { reportPath, reportSha, findingsPath, findingsSha: sha256File(findingsPath), findingsSetSha: ff.findings_set_sha256 }
}

describe('integration · technical-review (REV-03 / RCP-03)', () => {
  test('REV-03 技术作业产物：CODE 前后哈希、findings 稳定 id、报告/发现集哈希可独立校验', async () => {
    await runCase('REV-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ① 纯函数层：findings 的解析与锚点（提案 §B1.5 的签名）
      const lib = await loadStagedModule('lib/receipt.mjs', ['parseFindings', 'receiptAnchors', 'validateReceiptCoverage'])
      rec.readings.receipt_lib = { surfaceMissing: lib.surfaceMissing, missing: lib.missing, errors: lib.errors }
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/receipt.mjs 不在 —— 作业产物的锚点面拿不到（预期的首跑红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/receipt.mjs 没有导出 ${n}`)

      if (lib.mod) {
        const ws = caseWorkspace('REV-03', 'artifacts')
        const art = writeArtifacts(ws)
        rec.readings.artifacts = { report_sha256: art.reportSha, findings_sha256: art.findingsSha, findings_set_sha256: art.findingsSetSha }

        // ①b 夹具自证（防漂移）：盘上那份产物声明的必须是**它自己内容的** Q10 复算值。
        //     用测试侧独立实现算（不 import 被测模块）—— 这一格红了是夹具改错了，不是 SUT 坏了。
        const setShaTruth = q10Digest([finding('F1'), finding('F2')])
        const declaredOnDisk = JSON.parse(readFileSync(art.findingsPath, 'utf8')).findings_set_sha256
        rec.readings.fixture_set_sha = { constant: SET_SHA, q10_truth: setShaTruth, declared_on_disk: declaredOnDisk }
        if (SET_SHA !== setShaTruth) {
          push('FIXTURE-SET-SHA', `夹具常量 SET_SHA=${SET_SHA.slice(0, 12)}… 与那两条 finding 的 Q10 复算值 ${setShaTruth.slice(0, 12)}… 不符 —— 先改夹具，别去动被测模块`)
        }
        if (declaredOnDisk !== setShaTruth) {
          push('FIXTURE-SET-SHA', `盘上的 findings 产物声明 ${String(declaredOnDisk).slice(0, 12)}…，而它自己内容的 Q10 复算值是 ${setShaTruth.slice(0, 12)}… —— 这份产物自带"自报值与内容不符"，校验方会（也该）拒它`)
        }

        // ② 报告与发现集的哈希必须**各自可独立校验**（改报告一字 ⇒ 锚点对不上）
        const before = sha256File(art.reportPath)
        writeFileSync(art.reportPath, `${readFileSync(art.reportPath, 'utf8')}（改了一个字）\n`, 'utf8')
        const after = sha256File(art.reportPath)
        rec.readings.report_tamper = { before, after }
        if (before === after) push('REV03-HASH', '改报告一字之后哈希没变 —— 报告的独立哈希算错了')
        writeFileSync(art.reportPath, '# 技术评审（夹具）\n\n- F1：（夹具）一条发现\n- F2：（夹具）另一条发现\n', 'utf8')

        // ③ `code_fingerprint.equal !== true` ⇒ **本次作废**（B3.1 逐字），来源是作业产物而不是回执
        const voidFindings = findingsFile({ report_sha256: art.reportSha, code_fingerprint: { before_sha256: 'c'.repeat(64), after_sha256: 'e'.repeat(64), equal: false } })
        let coverage = null
        try {
          coverage = lib.mod.validateReceiptCoverage(receipt({ report: { path: 'retro/2026-10-14/技术评审.md', sha256: art.reportSha } }), voidFindings, [ticket(art.reportSha)], { report_sha256: art.reportSha, findings_set_sha256: SET_SHA })
        } catch (err) {
          push('REV03-VOID', `code_fingerprint.equal=false 时校验器抛错而不是返回失败：${String(err.message).slice(0, 160)}`)
        }
        rec.readings.void_run = coverage
        if (coverage && coverage.ok !== false) {
          push('REV03-VOID', '`code_fingerprint.equal === false`（代码被动过）时覆盖校验必须失败 —— B3.1：不等 ⇒ 本次作废')
        }
        // 正例：equal=true 时同一条链路必须通过
        const goodCoverage = (() => {
          try {
            return lib.mod.validateReceiptCoverage(receipt({ report: { path: 'retro/2026-10-14/技术评审.md', sha256: art.reportSha } }), findingsFile({ report_sha256: art.reportSha }), [ticket(art.reportSha)], { report_sha256: art.reportSha, findings_set_sha256: SET_SHA })
          } catch (err) {
            return { threw: String(err.message).slice(0, 160) }
          }
        })()
        rec.readings.good_run = goodCoverage
        if (goodCoverage?.ok !== true) push('REV03-POSITIVE', `equal=true 的那份产物必须能通过覆盖校验（正例），实得 ${JSON.stringify(goodCoverage)?.slice(0, 160)}`)

        // ④ findings 的 id 稳定（同一份产物两次解析给出同一组 id）——"稳定 id"是回执覆盖的前提
        const parse = (ff) => { try { return lib.mod.parseFindings(ff) } catch (err) { return { threw: String(err.message).slice(0, 140) } } }
        const p1 = parse(findingsFile({ report_sha256: art.reportSha }))
        const p2 = parse(findingsFile({ report_sha256: art.reportSha }))
        rec.readings.parse_ids = { first: p1?.count ?? null, second: p2?.count ?? null }
        if (p1?.ok !== true || p2?.ok !== true) push('REV03-IDS', `同一份 findings 两次解析都该成功，实得 ${JSON.stringify({ a: p1?.ok, b: p2?.ok })}`)
        const anchors = (() => { try { return lib.mod.receiptAnchors(receipt({ report: { path: 'retro/2026-10-14/技术评审.md', sha256: art.reportSha } })) } catch (err) { return { threw: String(err.message).slice(0, 140) } } })()
        rec.readings.anchors = anchors
        if (anchors?.report_sha256 !== art.reportSha) push('REV03-ANCHORS', 'receiptAnchors 必须给出作业产物里那个 report_sha256')
      }

      // ⑤ CODE/ALL 指纹脚本（拍板 Q7；v1.18 ⑥ 把路径改到**已交付**的 `.tools/fingerprint.mjs`）
      //    🔴 先判存在性再说话 —— 原来那一下不判 `existsSync`、**无条件** push ⇒ "文件在也报缺"。
      const fp = 'E:\\Harness\\.tools\\fingerprint.mjs'
      const FROZEN_FP_SHA = 'FE15C0FEF566F8CAD0A331CD7ABA3CD91A58D46F6BF9FAAB0619C7BFE27FFD3E'
      const fpExists = existsSync(fp)
      const fpText = fpExists ? readFileSync(fp, 'utf8') : null
      const fpSha = fpExists ? sha256File(fp) : null
      rec.readings.fingerprint = {
        path: fp,
        exists: fpExists,
        sha256: fpSha,
        declared_sha256: FROZEN_FP_SHA,
        code_fingerprint_expected: true,
      }
      if (!fpExists) {
        push('FINGERPRINT-SCRIPT-MISSING', `CODE/ALL 指纹脚本不在（${fp}）—— 拍板 Q7：必须提供可复现的指纹脚本/配方并把 CODE 与 ALL 分开；在它落地前，指纹类断言按 RED 处理，**不许用别的读数冒充**。`)
      } else {
        // Q7 要的三件（v1.18 ⑥ 逐字点名）：配方在文件头 · CODE/ALL 分开 · `--compare` 出 `equal`
        const header = fpText.split(/\r?\n/).slice(0, 60).join('\n')
        if (!/配方/.test(header)) push('FINGERPRINT-SHAPE', '`.tools/fingerprint.mjs` 的**文件头**里没有"配方"（Q7：口径与配方必须跟着数一起传）')
        if (!/CODE/.test(header) || !/ALL/.test(header)) push('FINGERPRINT-SHAPE', '文件头里没有把 **CODE / ALL** 两套写清（Q7）')
        if (!fpText.includes('--compare')) push('FINGERPRINT-SHAPE', '脚本不支持 `--compare`（Q7：要比一次并给出 equal）')
        if (!/equal/.test(fpText)) push('FINGERPRINT-SHAPE', '脚本里没有 `equal` 这个读数（Q7：`--compare` 要出 equal / changed[]）')
        rec.readings.fingerprint_sha_matches_declared = sha256Equal(fpSha, FROZEN_FP_SHA)
        if (!sha256Equal(fpSha, FROZEN_FP_SHA)) {
          rec.readings.fingerprint_sha_note = { note: `脚本 SHA 与组长声明的 ${FROZEN_FP_SHA} 不同 —— 只记读数（脚本被改过是可能的）；要重新冻 SHA 请回组长。` }
        }
      }
      rec.readings.pending_r1 = {
        status: 'PENDING',
        note: '"作业在**代码副本**上跑、跑测试但前后 CODE 哈希必须相同、不许写生产" 需要真作业进程（R1-03）；本用例只钉"产物的三个锚点 + 作废规则 + id 稳定"这一层。',
      }
      caseFail(problems)
    })
  })

  test('RCP-03 health 以作业产物为锚：改报告一字即红，回执自报 SHA 不算锚', async () => {
    await runCase('RCP-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const ws = caseWorkspace('RCP-03', 'anchor')
      if (!stagingExists('bin/agenia-local.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 ⇒ `local-mark` / `receipt-check` / `health` 拿不到（预期的首跑红）')
        caseFail(problems)
      }
      const art = writeArtifacts(ws)

      // ① 组长把作业产物的三个锚点登记进本地状态（`local-mark`，提案 §B1.4 的冻结 op）
      const mark = runLocalSoft('RCP-03', 'local-mark', {
        project: 'harness', day: DAY, field: 'technical',
        report_path: 'retro/2026-10-14/技术评审.md', report_sha256: art.reportSha,
        findings_path: 'retro/2026-10-14/技术评审.findings.json', findings_set_sha256: art.findingsSetSha, findings_count: 2,
        artifact_paths: ['retro/2026-10-14/技术评审.md', 'retro/2026-10-14/技术评审.findings.json'],
      }, ws)
      rec.readings.local_mark = { exit_code: mark.exit_code, code: mark.json?.error?.code ?? null }
      if (mark.exit_code !== 0) push('RCP03-MARK', `local-mark 登记作业产物必须成功（正例），实得 exit=${mark.exit_code} / ${mark.json?.error?.code ?? '(无码)'}`)

      const read = runLocalSoft('RCP-03', 'local-read', { project: 'harness', day: DAY }, ws)
      const node = read.json?.state?.technical ?? null
      rec.readings.local_state = node
      if (read.exit_code === 0) {
        for (const key of ['report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count']) {
          if (node === null || !(key in node)) push('RCP03-ANCHORS', `本地状态的 technical 节点缺 ${key}（B3.1：三个锚点必须来自作业产物）`)
        }
        if (node && node.report_sha256 !== art.reportSha) push('RCP03-ANCHORS', `状态里的 report_sha256=${node.report_sha256} 与盘上报告的实际哈希 ${art.reportSha} 不一致`)
      }

      // ② 回执对得上 ⇒ receipt-check 通过（正例）
      const okReceipt = receipt({ report: { path: 'retro/2026-10-14/技术评审.md', sha256: art.reportSha }, findings_set_sha256: art.findingsSetSha })
      writeJson(path.join(ws, '.team', 'leader', DAY, '技术复盘回执.json'), okReceipt)
      const good = runLocalSoft('RCP-03', 'receipt-check', { project: 'harness', day: DAY }, ws)
      rec.readings.receipt_check_ok = { exit_code: good.exit_code, code: good.json?.error?.code ?? null }
      if (good.exit_code !== 0) push('RCP03-CHECK', `回执与作业产物一致时必须通过（正例），实得 exit=${good.exit_code} / ${good.json?.error?.code ?? '(无码)'}`)

      // ③ 改报告一字 ⇒ **health/校验必须红**（锚点来自产物，不是回执自报）
      writeFileSync(art.reportPath, `${readFileSync(art.reportPath, 'utf8')}（改动一字）\n`, 'utf8')
      const tampered = runLocalSoft('RCP-03', 'receipt-check', { project: 'harness', day: DAY }, ws)
      rec.readings.receipt_check_tampered = { exit_code: tampered.exit_code, code: tampered.json?.error?.code ?? null }
      if (tampered.exit_code === 0) push('RCP03-TAMPER', '报告被改了一字竟然还通过 —— 锚点必须来自作业产物（B3.1 的反例）')
      else if (tampered.json?.error?.code !== 'E_RECEIPT_HASH') push('RCP03-TAMPER', `改报告之后的错误码应为 E_RECEIPT_HASH，实得 ${tampered.json?.error?.code}`)
      const health = runLocalSoft('RCP-03', 'health', { project: 'harness', day: DAY }, ws)
      rec.readings.health_after_tamper = { exit_code: health.exit_code, code: health.json?.error?.code ?? null, status: health.json?.health?.status ?? null }
      // 🔴 裁定 v1.13 ②③：「期望必须存在」前置 —— health 读不出来时，"锚点对不上不许绿"这条**不许静默跳过**
      if (health.exit_code !== 0 || typeof health.json?.health?.status !== 'string') {
        push('RCP03-HEALTH-UNREADABLE', `报告被改之后 health 必须能读出来（"锚点对不上就不许绿"这条全押在它上面），实得 exit=${health.exit_code} / status=${JSON.stringify(health.json?.health?.status)} / code=${health.json?.error?.code ?? '(无码)'}`)
      } else if (health.json.health.status === 'GREEN') {
        push('RCP03-TAMPER', '报告被改之后 health 仍然 GREEN —— 锚点对不上就不许绿')
      }
      // ④ 回执自报的 SHA 与锚点不一致 ⇒ 也是红（自报不算锚）
      const lying = receipt({ report: { path: 'retro/2026-10-14/技术评审.md', sha256: 'f'.repeat(64) }, findings_set_sha256: art.findingsSetSha })
      writeJson(path.join(ws, '.team', 'leader', DAY, '技术复盘回执.json'), lying)
      const lieCheck = runLocalSoft('RCP-03', 'receipt-check', { project: 'harness', day: DAY }, ws)
      rec.readings.receipt_check_lying = { exit_code: lieCheck.exit_code, code: lieCheck.json?.error?.code ?? null }
      if (lieCheck.exit_code === 0) push('RCP03-SELF-REPORT', '回执自报一个假 SHA 竟然通过了 —— 校验必须用作业产物的锚点')

      rec.readings.pending_r1 = {
        status: 'PENDING',
        note: '"报告 SHA + 发现集版本在状态中**独立保存**、health 重读" 这一条在自动层已钉到 receipt-check/health；真作业进程产出的那份归 R1-03。',
      }
      caseFail(problems)
    })
  })
})
