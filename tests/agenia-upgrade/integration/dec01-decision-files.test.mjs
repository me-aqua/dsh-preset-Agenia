/**
 * `DEC-01` / `DEC-02` / `DEC-03` / `DEC-08` —— **决议文件本身**（头块 / supersede / 指针 / 反悔条件）。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-构案.md`（§2 头块 · §2.3/§2.4 正文 · §5.1 判词 · §8.1 样本表）。
 * 定形：`.team/leader/2026-11-12/构案0001-决议账本三册制.md`。
 *
 * 🔴 **今天的预期是红**：`.tools/决议-check.mjs` 与 `决议/` 都还不存在（Gate 3 才建）。红因是
 * `TOOL-MISSING` / `TREE-MISSING` —— 这不是"判据坏了"，是 Gate 2 的应有形状。
 *
 * 每一格的刀都是**同一棵 `good` 树上只改一个变量**，并且断言**码集精确相等**：
 * 只证明"红因里有它"不算判据（`cand-20261016-promise-without-assertion-01`）。
 */
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CHECK, REAL_LEDGER, codesOf, expectCodes, goodDecision0001, goodDecisionProduct0001, goodLedger,
  messagesOf, realDecisionFiles, realTrackedFiles, runCheck, toolPresent,
} from '../support/decision-ledger.mjs'

before(() => {
  preflight()
})

/** 跑一份夹具并把读数收进 `rec.readings`（只留判据要用的几格）。 */
function runSample(problems, rec, { caseId, tag, spec, extra = [] }) {
  const scene = goodLedger({ caseId, tag, ...spec })
  const run = runCheck(scene.root, extra)
  const entry = {
    root: scene.root,
    exit: run.exit,
    ok: run.json?.ok ?? null,
    codes: codesOf(run.json),
    messages: messagesOf(run.json).map((m) => m.slice(0, 200)),
    stdout_head: run.stdout_head,
    stderr_head: run.stderr_head,
  }
  rec.readings[tag] = entry
  return { scene, run, entry, problems }
}

test('DEC-01 决议文件的固定七键头：缺一个键 ⇒ 红且点名那个键；真树 0001 的七键可解析', async () => {
  await runCase('DEC-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    // ── ① 真树那一腿（Gate 3 才可能有；今天红在"文件不在"）──────────────────────
    const hasCheck = toolPresent(problems, CHECK, '契约 §5.1 的检查器（真树七键只能由它解析）')
    const files = realDecisionFiles()
    rec.readings.real = { ledger: REAL_LEDGER, decision_files: files }
    const first = files.find((rel) => path.basename(rel).startsWith('0001-'))
    if (first === undefined) {
      push('TREE-MISSING', `${path.join(REAL_LEDGER, '构案')} 下没有 \`0001-*.md\`（今天 ${JSON.stringify(files)}）`
        + ' —— 构案 0001 自己就是第一份决议（定形 §一）；它不在盘上，这一格就没有被测对象')
    } else if (hasCheck) {
      const run = runCheck(path.dirname(REAL_LEDGER))
      rec.readings.real.check = { exit: run.exit, codes: codesOf(run.json), ok: run.json?.ok ?? null }
      if (run.json === null) {
        push('JSON-UNPARSEABLE', `[真树] 检查器 --json 解析不了（${run.json_error}）· stdout=${JSON.stringify(run.stdout_head)}`)
      } else {
        const d = (run.json.decisions ?? []).find((x) => x.series === '构案' && x.id === '0001')
        rec.readings.real.decision_0001 = d ?? null
        if (d === undefined) {
          push('DEC-0001-NOT-PARSED', `[真树] 检查器的 decisions[] 里没有 构案/0001（实得 ${JSON.stringify((run.json.decisions ?? []).map((x) => `${x.series}/${x.id}`))}）`)
        } else {
          const empty = ['status', 'topic', 'date', 'decider', 'quote'].filter((k) => typeof d[k] !== 'string' || d[k].trim() === '')
          if (empty.length > 0) push('DEC-0001-KEYS', `[真树] 0001 的这几格没解析出值：${JSON.stringify(empty)}（头块七键必须都可读）`)
          if (d.status !== '生效') push('DEC-0001-KEYS', `[真树] 0001 的状态必须是 生效，实得 ${JSON.stringify(d.status)}`)
          if (!Array.isArray(d.body_sections) || d.body_sections.length === 0) {
            push('BODY-SECTION-MISSING', '[真树] 0001 的正文七节一格都没解析出来（契约 §2.3）')
          }
        }
        const onThis = (run.json.problems ?? []).filter((p) => String(p.file ?? '').includes('0001'))
        if (onThis.length > 0) {
          push('DEC-0001-PROBLEMS', `[真树] 检查器对 0001 报了 ${onThis.length} 条：${JSON.stringify(onThis.map((p) => `${p.code}:${p.message}`).slice(0, 4))}`)
        }
      }
    }

    // ── ② 它在 git 里吗（没有 .git 的只读副本 ⇒ HOLD，不记红）────────────────────
    const tracked = realTrackedFiles()
    rec.readings.real.tracked = tracked
    if (!tracked.git) {
      caseHold(rec, 'DEC-GIT-COPY', '这一格跑在没有 .git 的只读副本里 ⇒ "决议/ 在不在 git 里"判不了（不是红）')
    } else {
      const want = ['决议/INDEX.md', '决议/概念表.md', ...(first === undefined ? [] : [`决议/${first}`])]
      const missing = want.filter((rel) => !tracked.files.includes(rel))
      if (missing.length > 0) {
        push('TREE-NOT-IN-GIT', `[真树] \`git ls-files -- 决议\` 少了 ${JSON.stringify(missing)}（实得 ${tracked.files.length} 条）`
          + ' —— 决定是项目资产，必须进 git（定形 §三.1）')
      }
    }

    // ── ③ 夹具：good 绿 + 六把"只改一处"的刀 ───────────────────────────────────
    if (hasCheck) {
      const samples = [
        { tag: 'good', spec: {}, want: [] },
        { tag: 'missing-key', spec: { decisions: [goodDecision0001({}), goodDecisionProduct0001()].map((d) => (d.id === '0001' && d.series === '构案' ? { ...d, drop: ['原话'] } : d)) }, want: ['DEC-MISSING-KEY'], mustName: '原话' },
        {
          tag: 'dup-key',
          spec: {
            decisions: [
              { ...goodDecision0001(), headerLines: ['状态: 生效', '状态: 生效', '主题: 决议账本三册制', '日期: 2026-11-12', '拍板人: 老板', '原话: 「账本要能自己长」', 'supersedes: —', 'superseded_by: —'] },
              goodDecisionProduct0001(),
            ],
          },
          want: ['DEC-DUP-KEY'],
          mustName: '状态',
        },
        {
          tag: 'unknown-key',
          spec: {
            decisions: [
              { ...goodDecision0001(), headerLines: ['状态: 生效', '主题: 决议账本三册制', '日期: 2026-11-12', '拍板人: 老板', '原话: 「账本要能自己长」', 'supersedes: —', 'superseded_by: —', '状态x: 生效'] },
              goodDecisionProduct0001(),
            ],
          },
          want: ['DEC-UNKNOWN-KEY'],
          mustName: '状态x',
        },
        { tag: 'bad-status', spec: { decisions: [goodDecision0001({ 状态: '有效' }), goodDecisionProduct0001()] }, want: ['DEC-BAD-VALUE'], mustName: '状态' },
        { tag: 'bad-quote', spec: { decisions: [goodDecision0001({ 原话: '账本要能自己长' }), goodDecisionProduct0001()] }, want: ['DEC-BAD-VALUE'], mustName: '原话' },
        { tag: 'bad-date', spec: { decisions: [goodDecision0001({ 日期: '2026-13-01' }), goodDecisionProduct0001()] }, want: ['DEC-BAD-VALUE'], mustName: '日期' },
        {
          tag: 'header-missing',
          spec: {
            decisions: [
              { ...goodDecision0001(), headerLines: [], body: '## ① 背景\n直接就是正文，没有头块。\n' },
              goodDecisionProduct0001(),
            ],
          },
          want: ['DEC-HEADER-MISSING'],
        },
        {
          tag: 'title-mismatch',
          spec: {
            decisions: [
              { ...goodDecision0001(), h1: '# 构案 0009 · 决议账本三册制' },
              goodDecisionProduct0001(),
            ],
          },
          want: ['DEC-TITLE-MISMATCH'],
          mustName: '0009',
        },
      ]
      for (const s of samples) {
        const { run, entry } = runSample(problems, rec, { caseId: 'DEC-01', tag: s.tag, spec: s.spec })
        const parsed = expectCodes(problems, run, s.want, push, { label: `DEC-01/${s.tag}` })
        if (parsed && s.want.length > 0 && s.mustName !== undefined) {
          const named = messagesOf(run.json).some((m) => m.includes(s.mustName))
          if (!named) push('NOT-NAMED', `[DEC-01/${s.tag}] 报文没有点名 ${JSON.stringify(s.mustName)}：${JSON.stringify(entry.messages.slice(0, 3))}`)
        }
      }
      // 🔴 七键的**次序不判**：把 0002·7 键倒着写，仍须绿（契约 §2.1-3）。
      {
        const reordered = {
          ...goodDecision0001(),
          headerLines: ['superseded_by: —', 'supersedes: —', '原话: 「账本要能自己长」', '拍板人: 老板', '日期: 2026-11-12', '主题: 决议账本三册制', '状态: 生效'],
        }
        const { run } = runSample(problems, rec, { caseId: 'DEC-01', tag: 'reordered', spec: { decisions: [reordered, goodDecisionProduct0001()] } })
        expectCodes(problems, run, [], push, { label: 'DEC-01/reordered' })
      }
    }

    caseFail(problems)
  })
})

test('DEC-02 同一 主题 两条 生效 ⇒ 红；只加 supersedes 不够（旧文没翻仍红）；旧文真翻 ⇒ 绿', async () => {
  await runCase('DEC-02', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §5.1 的检查器')) {
      caseFail(problems)
      return
    }

    const second = (header = {}) => ({ series: '构案', id: '0002', title: '决议账本三册制', header: { 主题: '决议账本三册制', ...header } })
    const index = (decision) => ({ rows: [{ concept: '决议账本三册制', owner: '组长', census: 2, decision }, { concept: '双写者', owner: '实现岗', census: 1, decision: '—' }] })

    // ① 两条 生效、没有任何指针 ⇒ 只有"同主题两条生效"这一条
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-02', tag: 'dup',
        spec: { decisions: [goodDecision0001(), second(), goodDecisionProduct0001()], index: index('0002') },
      })
      if (expectCodes(problems, run, ['DUPLICATE-LIVE-TOPIC'], push, { label: 'DEC-02/dup' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes('0001') && msg.includes('0002'))) {
          push('NOT-NAMED', `[DEC-02/dup] 报文必须同时点名 0001 与 0002（两条同主题生效），实得 ${JSON.stringify(msg.slice(0, 200))}`)
        }
      }
    }

    // ② 刀：只给新的那条加上 supersedes —— 旧文还是 生效 ⇒ **不许绿**
    {
      const half = [goodDecision0001(), second({ supersedes: '0001' }), goodDecisionProduct0001()]
      const { run } = runSample(problems, rec, { caseId: 'DEC-02', tag: 'half', spec: { decisions: half, index: index('0002') } })
      const wantHalf = ['DUPLICATE-LIVE-TOPIC', 'POINTER-ASYMMETRIC', 'SUPERSEDED-BUT-LIVE']
      if (expectCodes(problems, run, wantHalf, push, { label: 'DEC-02/half' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!msg.includes('0001')) {
          push('NOT-NAMED', `[DEC-02/half] 三条红都必须点名旧文 0001（它才是没翻的那一条），实得 ${JSON.stringify(msg.slice(0, 240))}`)
        }
      }
    }

    // ③ 旧文真翻成 已废 + 双向指针 ⇒ 绿；并且 0001 的正文（七节）**不许**被 supersede 改掉
    {
      const done = [
        goodDecision0001({ 状态: '已废', superseded_by: '0002' }),
        second({ supersedes: '0001' }),
        goodDecisionProduct0001(),
      ]
      const { run } = runSample(problems, rec, { caseId: 'DEC-02', tag: 'done', spec: { decisions: done, index: index('0002') } })
      if (expectCodes(problems, run, [], push, { label: 'DEC-02/done' })) {
        const d = (run.json.decisions ?? []).find((x) => x.series === '构案' && x.id === '0001')
        rec.readings.done_0001 = d ?? null
        if (d?.status !== '已废') push('FLIP-NOT-READ', `[DEC-02/done] 0001 的状态必须是 已废，实得 ${JSON.stringify(d?.status)}`)
        if (JSON.stringify(d?.superseded_by) !== JSON.stringify(['0002'])) {
          push('FLIP-NOT-READ', `[DEC-02/done] 0001 的 superseded_by 必须解析成 ["0002"]，实得 ${JSON.stringify(d?.superseded_by)}`)
        }
        if (!Array.isArray(d?.body_sections) || d.body_sections.length !== 7) {
          push('FLIP-BODY-LOST', `[DEC-02/done] 0001 的正文七节必须还在（supersede 只许动头块两个字段），实得 ${JSON.stringify(d?.body_sections)}`)
        }
      }
    }

    caseFail(problems)
  })
})

test('DEC-03 指针：悬空 / 单向不对称 / 自称 各是一条自己的红（且只报那一条）', async () => {
  await runCase('DEC-03', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §5.1 的检查器')) {
      caseFail(problems)
      return
    }

    // ① supersedes 悬空（0009 不存在）
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-03', tag: 'dangling',
        spec: { decisions: [goodDecision0001({ supersedes: '0009' }), goodDecisionProduct0001()] },
      })
      if (expectCodes(problems, run, ['POINTER-DANGLING'], push, { label: 'DEC-03/dangling' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0009'))) push('NOT-NAMED', '[DEC-03/dangling] 报文必须点名那个悬空引用 0009')
      }
    }
    // ② superseded_by 悬空（已废但指向不存在的那一条）
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-03', tag: 'dangling-by',
        spec: { decisions: [goodDecision0001({ 状态: '已废', superseded_by: '0009' }), goodDecisionProduct0001()] },
      })
      if (expectCodes(problems, run, ['POINTER-DANGLING'], push, { label: 'DEC-03/dangling-by' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0009'))) push('NOT-NAMED', '[DEC-03/dangling-by] 报文必须点名那个悬空引用 0009')
      }
    }
    // ③ 自称
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-03', tag: 'self',
        spec: { decisions: [goodDecision0001({ supersedes: '0001' }), goodDecisionProduct0001()] },
      })
      expectCodes(problems, run, ['POINTER-SELF'], push, { label: 'DEC-03/self' })
    }
    // ④ 单向：0002 说 supersedes 0001，而 0001.superseded_by 只记 0003 ⇒ 0002→0001 这一边没人认
    {
      const X = '决议账本三册制'
      const Y = '双写者'
      const decisions = [
        { series: '构案', id: '0001', title: X, header: { 主题: X, 状态: '已废', superseded_by: '0003' } },
        { series: '构案', id: '0002', title: X, header: { 主题: X, supersedes: '0001' } },
        { series: '构案', id: '0003', title: Y, header: { 主题: Y, supersedes: '0001' } },
      ]
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-03', tag: 'asymmetric',
        spec: {
          decisions,
          index: { rows: [{ concept: X, owner: '组长', census: 2, decision: '0002' }, { concept: Y, owner: '实现岗', census: 1, decision: '0003' }] },
        },
      })
      if (expectCodes(problems, run, ['POINTER-ASYMMETRIC'], push, { label: 'DEC-03/asymmetric' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes('0001') && msg.includes('0002'))) {
          push('NOT-NAMED', `[DEC-03/asymmetric] 报文必须点名这一对（0002 → 0001），实得 ${JSON.stringify(msg.slice(0, 240))}`)
        }
      }
    }

    caseFail(problems)
  })
})

test('DEC-08 反悔条件核：⑦ 逐行逐格可读；已触发而没废/没 supersede ⇒ 红且点名 RC-n', async () => {
  await runCase('DEC-08', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §5.1 的检查器')) {
      caseFail(problems)
      return
    }

    const second = (header = {}) => ({ series: '构案', id: '0002', title: '决议账本三册制', header: { 主题: '决议账本三册制', ...header } })
    const index = (decision) => ({ rows: [{ concept: '决议账本三册制', owner: '组长', census: 2, decision }, { concept: '双写者', owner: '实现岗', census: 1, decision: '—' }] })

    // ① good：两行、四格都在（"逐格"的落点）
    {
      const { run } = runSample(problems, rec, { caseId: 'DEC-08', tag: 'good', spec: {} })
      if (expectCodes(problems, run, [], push, { label: 'DEC-08/good' })) {
        const rows = (run.json.decisions ?? []).find((x) => x.series === '构案' && x.id === '0001')?.reversal_rows ?? []
        rec.readings.reversal_rows = rows
        if (rows.length !== 2) push('REVERSAL-NOT-PARSED', `[DEC-08/good] 0001 的 reversal_rows 必须是 2 行，实得 ${JSON.stringify(rows)}`)
        const missing = rows.flatMap((r, i) => ['id', 'condition', 'action', 'status'].filter((k) => typeof r[k] !== 'string' || r[k].trim() === '').map((k) => `row${i}.${k}`))
        if (missing.length > 0) push('REVERSAL-NOT-PARSED', `[DEC-08/good] 这几格没读出来：${JSON.stringify(missing)} —— 四列必须逐格可读（契约 §2.4）`)
        if (!rows.every((r) => r.status === '未触发')) push('REVERSAL-NOT-PARSED', `[DEC-08/good] 夹具里两行都是 未触发，实得 ${JSON.stringify(rows.map((r) => r.status))}`)
      }
    }
    // ② 已触发、决议仍生效 ⇒ 红，点名 RC-2
    {
      const reversal = [
        { id: 'RC-1', condition: '同概念第 3 处实现', action: 'supersede 到新编号', status: '未触发' },
        { id: 'RC-2', condition: '两个岗位各自实现同一件事', action: '打回并抽公共件', status: '已触发' },
      ]
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'triggered-live',
        spec: { decisions: [{ ...goodDecision0001(), reversal }, goodDecisionProduct0001()] },
      })
      if (expectCodes(problems, run, ['REVERSAL-TRIGGERED-NOT-SUPERSEDED'], push, { label: 'DEC-08/triggered-live' })) {
        if (!messagesOf(run.json).some((m) => m.includes('RC-2'))) push('NOT-NAMED', '[DEC-08/triggered-live] 报文必须点名触发的那个 RC 编号（RC-2）')
      }
    }
    // ③ 已触发 + 旧文已废 + 指向 0002 ⇒ 绿
    {
      const reversal = [
        { id: 'RC-1', condition: '同概念第 3 处实现', action: 'supersede 到新编号', status: '未触发' },
        { id: 'RC-2', condition: '两个岗位各自实现同一件事', action: '打回并抽公共件', status: '已触发' },
      ]
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'triggered-superseded',
        spec: {
          decisions: [{ ...goodDecision0001({ 状态: '已废', superseded_by: '0002' }), reversal }, second({ supersedes: '0001' }), goodDecisionProduct0001()],
          index: index('0002'),
        },
      })
      expectCodes(problems, run, [], push, { label: 'DEC-08/triggered-superseded' })
    }
    // ④ 一格空着（RC-3 的状态）⇒ 点名行与格
    {
      const reversal = [
        { id: 'RC-1', condition: '同概念第 3 处实现', action: 'supersede 到新编号', status: '未触发' },
        { id: 'RC-3', condition: '某个条件', action: '打回', status: '' },
      ]
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'row-missing-field',
        spec: { decisions: [{ ...goodDecision0001(), reversal }, goodDecisionProduct0001()] },
      })
      if (expectCodes(problems, run, ['REVERSAL-ROW-SHAPE'], push, { label: 'DEC-08/row-missing-field' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes('RC-3') && msg.includes('状态'))) {
          push('NOT-NAMED', `[DEC-08/row-missing-field] 报文要点名 rc=RC-3 且那一格是 状态，实得 ${JSON.stringify(msg.slice(0, 200))}`)
        }
      }
    }
    // ⑤ ⑦ 节没有表 / 七节里少一节
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'table-missing',
        spec: { decisions: [{ ...goodDecision0001(), reversal: null }, goodDecisionProduct0001()] },
      })
      expectCodes(problems, run, ['REVERSAL-TABLE-MISSING'], push, { label: 'DEC-08/table-missing' })
    }
    {
      const body = ['## ① 背景', 'x', '## ② 决定', 'x', '## ③ 复用什么', 'x', '## ④ 不复用什么', 'x', '## ⑥ 公共化时点', 'x', '## ⑦ 反悔条件', '| 编号 | 条件 | 触发时动作 | 状态 |', '| --- | --- | --- | --- |', '| RC-1 | c | supersede 到新编号 | 未触发 |'].join('\n')
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'section-missing',
        spec: { decisions: [{ ...goodDecision0001(), body }, goodDecisionProduct0001()] },
      })
      if (expectCodes(problems, run, ['BODY-SECTION-MISSING'], push, { label: 'DEC-08/section-missing' })) {
        if (!messagesOf(run.json).some((m) => m.includes('新增什么'))) push('NOT-NAMED', '[DEC-08/section-missing] 报文要点名缺的那一节（新增什么）')
      }
    }

    caseFail(problems)
  })
})
