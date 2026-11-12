/**
 * `DEC-06` / `DEC-07` —— **第 2 关那道硬门**（新机制票无构案编号 ⇒ 拒）与它的**人读载体**
 * （三份岗位说明书各一行）。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-构案.md`（§6 拒接闸 · §0.3-`D5` 为什么必须做成命令级 ·
 * §8.1 的七个卡片样本与三份说明书的期望）。
 *
 * 🔴 这一格判的是**会响的闸**，不是散文：
 *   · `DEC-06` 打 `决议-check.mjs --op gate2-card`，七张卡（无号 / 缺行 / 有号 / 数据票 / 废号 / 悬空号 / 缺票类），
 *     拒的 exit 1 且码对、过的 exit 0 且 `problems: []` —— 闸若"永远拒"或"永远过"，两边都有样本咬住；
 *   · `DEC-07` 判三份说明书里**那一行**在不在（纯函数，三份各一条红因），外加**方案岗不动**。
 *   ⚠️ 若 Gate 3 把闸挪进派工路径（真拒接），契约 §0.3-`D5` 要求保留同一个命令入口 ——
 *      判据的指向那时可以改，但**同一张票里**改，不许让这一格变成"读不到就跳过"。
 */
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import {
  CHECK, DESIGN_FILE, ROLE_CLAUSES, buildScene, clauseProblems, codesOf, designProblems, expectCodes,
  goodDecision0001, goodDecisionProduct0001, goodLedger, messagesOf, readText, runCheck, toolPresent,
} from '../support/decision-ledger.mjs'

before(() => {
  preflight()
})

test('DEC-06 新机制票无构案编号 ⇒ 拒（exit 1 + GATE2-NO-DECISION）；有号且生效 ⇒ 过；数据票无号 ⇒ 过', async () => {
  await runCase('DEC-06', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §6.2 的拒接闸（`--op gate2-card`）')) {
      caseFail(problems)
      return
    }

    /** 造一棵只够闸用的树（只判卡 + 卡上那个编号指向的决议）。 */
    const gateScene = (tag, { decisions, card, concepts = null, index = null }) => {
      const scene = buildScene({ caseId: 'DEC-06', tag, decisions, concepts, impls: [], index, card })
      const cardFile = path.join(scene.root, 'card.md')
      const run = runCheck(scene.root, ['--op=gate2-card', `--card=${cardFile}`])
      rec.readings[tag] = {
        root: scene.root, exit: run.exit, ok: run.json?.ok ?? null,
        verdict: run.json?.verdict ?? null, code: run.json?.code ?? null,
        ticket_kind: run.json?.ticket_kind ?? null,
        codes: codesOf(run.json),
        messages: messagesOf(run.json).map((m) => m.slice(0, 200)),
        stderr_head: run.stderr_head,
      }
      return { run, entry: rec.readings[tag] }
    }
    const live = [goodDecision0001(), goodDecisionProduct0001()]
    const retired = [
      goodDecision0001({ 状态: '已废', superseded_by: '0002' }),
      { series: '构案', id: '0002', title: '决议账本三册制', header: { 主题: '决议账本三册制', supersedes: '0001' } },
      goodDecisionProduct0001(),
    ]

    const refusal = (tag, spec, wantCode, mustName = null) => {
      const { run } = gateScene(tag, spec)
      if (!expectCodes(problems, run, [wantCode], push, { label: `DEC-06/${tag}` })) return
      if (run.json.verdict !== 'refuse') push('GATE-VERDICT', `[DEC-06/${tag}] verdict 必须是 \`refuse\`，实得 ${JSON.stringify(run.json.verdict)}`)
      if (run.json.code !== wantCode) push('GATE-CODE', `[DEC-06/${tag}] code 必须是 ${JSON.stringify(wantCode)}，实得 ${JSON.stringify(run.json.code)}`)
      if ((run.json.problems ?? []).length !== 1) push('GATE-PROBLEMS', `[DEC-06/${tag}] 拒的时候 problems 必须恰好一条，实得 ${JSON.stringify(run.json.problems)}`)
      if (mustName !== null && !messagesOf(run.json).some((m) => m.includes(mustName))) {
        push('NOT-NAMED', `[DEC-06/${tag}] 报文要点名 ${JSON.stringify(mustName)}`)
      }
    }
    const pass = (tag, spec) => {
      const { run } = gateScene(tag, spec)
      if (!expectCodes(problems, run, [], push, { label: `DEC-06/${tag}` })) return
      if (run.json.verdict !== 'pass') push('GATE-VERDICT', `[DEC-06/${tag}] verdict 必须是 \`pass\`，实得 ${JSON.stringify(run.json.verdict)}`)
      if (run.json.code !== null && run.json.code !== undefined) push('GATE-CODE', `[DEC-06/${tag}] 过的时候 code 必须是 null，实得 ${JSON.stringify(run.json.code)}`)
    }

    // 拒：新机制票、编号那一格是 —
    refusal('no-number', { decisions: live, card: { ticket_kind: '新机制', decision: '—' } }, 'GATE2-NO-DECISION')
    // 拒：新机制票、整行缺（漏写一格不许绕过闸）
    refusal('no-number-line', { decisions: live, card: { ticket_kind: '新机制' } }, 'GATE2-NO-DECISION')
    // 过：编号指向一条 生效 的构案
    pass('with-number', { decisions: live, card: { ticket_kind: '新机制', decision: '0001' } })
    // 过：数据票（定形 §一·五：纯数据票不竞标、不写构案）
    pass('data-ticket', { decisions: live, card: { ticket_kind: '数据', decision: '—' } })
    // 拒：编号指向一条 已废 的构案
    refusal('retired-number', { decisions: retired, card: { ticket_kind: '新机制', decision: '0001' } }, 'GATE2-DECISION-NOT-LIVE', '0001')
    // 拒：编号解析不到
    refusal('dangling-number', { decisions: live, card: { ticket_kind: '新机制', decision: '0009' } }, 'GATE2-DANGLING-DECISION', '0009')
    // 拒：票类缺（fail-closed）
    refusal('kind-missing', { decisions: live, card: { ticket_kind: null, decision: '0001' } }, 'GATE2-TICKET-KIND-MISSING')
    // ── M3 的五种"豁免不许自封"形状（每个一份卡、一个码；契约 §6.2 的五码）────────────────
    // 拒：票类只写在正文里（头块里没有）—— 正文里的一句不许替闸做主
    refusal('kind-not-structured', {
      decisions: live,
      card: { headerLines: ['构案: 0001'], body: '票类: 新机制' },
    }, 'GATE2-TICKET-KIND-NOT-STRUCTURED')
    // 拒：头块里两行 `票类` —— 谁也不知道按哪一条走
    refusal('kind-ambiguous', {
      decisions: live,
      card: { headerLines: ['票类: 新机制', '票类: 数据', '构案: 0001'] },
    }, 'GATE2-TICKET-KIND-AMBIGUOUS')
    // 拒：头块里两行 `构案` —— 一张卡两个编号
    refusal('decision-ambiguous', {
      decisions: live,
      card: { headerLines: ['票类: 新机制', '构案: 0001', '构案: 0001'] },
    }, 'GATE2-DECISION-AMBIGUOUS')
    // 拒：数据票缺 `构案` 那一行（缺行 ≠ 零个编号：豁免要写出来）
    refusal('exemption-not-explicit', {
      decisions: live,
      card: { headerLines: ['票类: 数据'] },
    }, 'GATE2-EXEMPTION-NOT-EXPLICIT')
    // 拒：数据票却声明要改机制代码面（自相矛盾）
    refusal('exemption-contradicted', {
      decisions: live,
      card: { headerLines: ['票类: 数据', '构案: —', '改动面: presets/agenia/lib/memory.mjs'] },
    }, 'GATE2-EXEMPTION-CONTRADICTED')
    // 过：数据票 + 改动面全在数据面上（豁免成立，且读数带名字）—— 证明上一条不是"数据票一律拒"
    pass('exemption-data-surface', {
      decisions: live,
      card: { headerLines: ['票类: 数据', '构案: —', '改动面: .team/数据/x.json'] },
    })

    caseFail(problems)
  })
})

test('DEC-07 三份说明书各一行（测试 / 实现 / 评审），且 team/design.md 一个字节不动', async () => {
  await runCase('DEC-07', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    const texts = {}
    for (const spec of ROLE_CLAUSES) {
      const text = readText(path.join(PATHS.repo, spec.file))
      texts[spec.role] = text
      rec.readings[spec.role] = { file: spec.file, present: text !== null, has_clause: text !== null && text.includes(spec.clause) }
    }
    // 三份一份都不许缺：少读一份，"三份都加了"就变成一句空话。
    for (const p of clauseProblems(texts)) {
      push(p.code, p.message, { role: p.role })
    }
    if (Object.keys(texts).length !== ROLE_CLAUSES.length) {
      push('CLAUSE-ROSTER', `这一格要读 ${ROLE_CLAUSES.length} 份说明书，实得 ${Object.keys(texts).length} 份`)
    }

    // ── 刀：同一段判据喂"有那一行"的合成文本 ⇒ 绿；喂"断成两行"的 ⇒ 仍红（"一行"是判据的一部分）──
    const synthetic = Object.fromEntries(ROLE_CLAUSES.map((s) => [s.role, `# 岗位\n\n${s.clause}\n`]))
    const green = clauseProblems(synthetic)
    rec.readings.knife_with_clause = green
    if (green.length !== 0) push('CLAUSE-KNIFE', `[刀] 三份都给那一行时不许有红，实得 ${JSON.stringify(green)}`)
    // 旧措辞（评审岗"跑 census"）**不再算数**：新判据钉的是"向组长要读数（带单位）"。这一条证明没放宽。
    const oldReview = clauseProblems({
      ...synthetic,
      review: '# 伊莫金 · 独立评审\n\n**三段核 + 跑 census** —— 构案 ③ 点的那条路在代码里真的在跑吗（给 file:line）。\n',
    })
    if (oldReview.length !== 1 || oldReview[0].role !== 'review' || oldReview[0].code !== 'CLAUSE-MISSING') {
      push('CLAUSE-KNIFE', `[刀] 只写旧措辞（\`三段核 + 跑 census\`）时必须红 review 一条，实得 ${JSON.stringify(oldReview)}`
        + ' —— 否则"没有命令行却被要求跑 census"这句话被放过了（T2）')
    }
    const broken = { ...synthetic }
    const testSpec = ROLE_CLAUSES.find((s) => s.role === 'test')
    broken.test = `# 岗位\n\n${testSpec.clause.slice(0, 3)}\n${testSpec.clause.slice(3)}\n`
    const brokenOut = clauseProblems(broken)
    rec.readings.knife_split_line = brokenOut
    if (brokenOut.length !== 1 || brokenOut[0].code !== 'CLAUSE-MISSING' || brokenOut[0].role !== 'test') {
      push('CLAUSE-KNIFE', `[刀] 把 test 那一行断成两行时，必须恰好红 test 一条，实得 ${JSON.stringify(brokenOut)}`)
    }
    // 刀：只缺 dev 那一份里的那一行（文件在、行不在）⇒ 只红 dev
    const onlyDev = { ...synthetic, dev: '# 佐西亚 · 实现\n\n（这一份还没加那一行）\n' }
    const onlyDevOut = clauseProblems(onlyDev)
    if (onlyDevOut.length !== 1 || onlyDevOut[0].role !== 'dev' || onlyDevOut[0].code !== 'CLAUSE-MISSING') {
      push('CLAUSE-KNIFE', `[刀] 只缺 dev 那一份时必须恰好红 dev，实得 ${JSON.stringify(onlyDevOut)}`)
    }
    // 刀：整份文件读不到 ⇒ 另一个码（`CLAUSE-FILE-MISSING`），不许与"行不在"混成一条
    const missingFile = clauseProblems({ ...synthetic, review: undefined })
    if (missingFile.length !== 1 || missingFile[0].role !== 'review' || missingFile[0].code !== 'CLAUSE-FILE-MISSING') {
      push('CLAUSE-KNIFE', `[刀] 读不到 review 那一份时必须恰好红 CLAUSE-FILE-MISSING，实得 ${JSON.stringify(missingFile)}`)
    }

    // ── 方案岗：搁置（老板 2026-11-12 11:39）—— `team/design.md` 里本族字面量必须 0 处 ──────────
    const design = readText(path.join(PATHS.repo, DESIGN_FILE))
    rec.readings.design = { file: DESIGN_FILE, present: design !== null }
    for (const p of designProblems(design)) push(p.code, p.message)
    // 刀：把本族字面量塞进去 ⇒ 必须红（证明这条不是"永远绿"）
    if (design !== null && !design.includes('构案')) {
      const touched = designProblems(`${design}\n\n（构案）\n`)
      if (touched.length !== 1 || touched[0].code !== 'DESIGN-TOUCHED') {
        push('DESIGN-KNIFE', `[刀] 往 design.md 的文本里塞 \`构案\` 必须恰好红一条 DESIGN-TOUCHED，实得 ${JSON.stringify(touched)}`)
      }
    }

    caseFail(problems)
  })
})
