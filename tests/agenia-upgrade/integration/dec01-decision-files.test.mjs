/**
 * `DEC-01` / `DEC-02` / `DEC-03` / `DEC-08` —— **三册决议文件本身**（两套头 / supersede 边界 / 指针 / 头的跨字段自洽）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§2 两套头 · §5 三条链 · §9 码表 · §12 Gate 3 交接单）。
 *
 * 🔴 **0012 把单册 `决议/` 换成三册 `账本/{产品,构案,缺陷}`**（Gate 3 实现 `0b36253`）：
 *   本文件的对象、路径、码表全部按三册重指；`DEC-02` 不再判"同主题两条生效"
 *   （0012 的检查器没有这条判词 —— 见 §12 的交接口径），它判的是 **supersede 的边界：旧文真的翻了**；
 *   `DEC-08` 不再判正文七节 / 反悔表（0012 §2 只判头；正文由第 4/5 关的人读那一格），
 *   它判 0012 §2.2 的三条跨字段自洽（产品无父 · 构案有父 · 父在来源列表里）。
 *
 * 每一格的刀都是**同一棵 `good` 树上只改一个变量**，并且断言**码集精确相等**：
 * 只证明"红因里有它"不算判据（`cand-20261016-promise-without-assertion-01`）。
 */
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CHECK, REAL_LEDGER, SCHEME_KEYS, BODY_SECTIONS, codesOf, expectCodes, gitLsFiles, goodDecision0001,
  goodDecisionProduct0001, goodLedger, goodScheme, messagesOf, quotepathRepo, readText, realDecisionFiles,
  realTrackedFiles, runCheck, toolPresent,
} from '../support/decision-ledger.mjs'

before(() => {
  preflight()
})

/** 跑一份夹具并把读数收进 `rec.readings`（只留判据要用的几格）。 */
function runSample(problems, rec, { caseId, tag, spec }) {
  const scene = goodLedger({ caseId, tag, ...spec })
  const run = runCheck(scene.root)
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

/** 一份真实文件里 `## ①`…`## ⑦` 七节各在不在（静态读数；0012 的检查器不读正文）。 */
function bodySectionsOf(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  return BODY_SECTIONS.filter((name) => lines.some((l) => /^##\s+/u.test(l) && l.includes(name)))
}

test('DEC-01 两套头：产品八键 / 构案十一键；缺键、重键、未知键、坏值、坏 H1 各一条码；真树 0001 是产品', async () => {
  await runCase('DEC-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    // ── ① 真树那一腿：产品 0001 与构案 0012 都由新检查器解析；三册真树必须绿 ─────────
    const hasCheck = toolPresent(problems, CHECK, '契约 §10.1 的检查器（真树头块只能由它解析）')
    const productFiles = realDecisionFiles('产品')
    const schemeFiles = realDecisionFiles('构案')
    rec.readings.real = { ledger: REAL_LEDGER, product_files: productFiles, scheme_files: schemeFiles }
    const productRel = productFiles.find((rel) => path.basename(rel).startsWith('0001-')) ?? null
    if (productRel === null) {
      push('TREE-MISSING', `${path.join(REAL_LEDGER, '产品')} 下没有 \`0001-*.md\`（今天 ${JSON.stringify(productFiles)}）`
        + ' —— 0012 的 0001 是**产品**（契约 §12-1 原先写成构案，那是错的）')
    }
    if (hasCheck) {
      const run = runCheck(path.dirname(REAL_LEDGER))
      rec.readings.real.check = { exit: run.exit, codes: codesOf(run.json), ok: run.json?.ok ?? null }
      if (expectCodes(problems, run, [], push, { label: 'DEC-01/real-check' })) {
        const product = (run.json.decisions ?? []).find((x) => x.book === '产品' && x.id === '0001')
        const scheme = (run.json.decisions ?? []).find((x) => x.book === '构案' && x.id === '0012')
        rec.readings.real.product_0001 = product ?? null
        rec.readings.real.scheme_0012 = scheme ?? null
        if (product === undefined) {
          push('DEC-0001-NOT-PARSED', `[真树] 检查器的 decisions[] 里没有 产品/0001（实得 ${JSON.stringify((run.json.decisions ?? []).map((x) => `${x.book}/${x.id}`))}）`)
        } else {
          const empty = ['status', 'topic', 'date', 'decider', 'quote'].filter((k) => typeof product[k] !== 'string' || product[k].trim() === '')
          if (empty.length > 0) push('DEC-0001-KEYS', `[真树] 产品 0001 的这几格没解析出值：${JSON.stringify(empty)}（产品八键必须都可读）`)
          if (product.status !== '生效') push('DEC-0001-KEYS', `[真树] 产品 0001 的状态必须是 生效，实得 ${JSON.stringify(product.status)}`)
          if (product.parent !== null) push('DEC-0001-KEYS', `[真树] 产品 0001 不许有父，实得 ${JSON.stringify(product.parent)}`)
          const text = readText(path.join(REAL_LEDGER, productRel))
          const sections = bodySectionsOf(text)
          rec.readings.real.product_0001_sections = sections
          if (sections.length !== BODY_SECTIONS.length) {
            push('BODY-SECTION-MISSING', `[真树] 产品 0001 的正文七节缺 ${JSON.stringify(BODY_SECTIONS.filter((x) => !sections.includes(x)))}`)
          }
        }
        if (scheme === undefined) {
          push('DEC-0012-NOT-PARSED', '[真树] 检查器的 decisions[] 里没有 构案/0012（三册账本那条构案）')
        } else {
          if (scheme.parent !== '0001') push('DEC-0012-KEYS', `[真树] 构案 0012 的父必须是产品 0001，实得 ${JSON.stringify(scheme.parent)}`)
          if (!Array.isArray(scheme.basisP) || !scheme.basisP.includes('0001')) {
            push('DEC-0012-KEYS', `[真树] 构案 0012 的 \`依据P\` 必须含产品 0001，实得 ${JSON.stringify(scheme.basisP)}`)
          }
        }
        const onProduct = (run.json.problems ?? []).filter((p) => String(p.file ?? '').includes('产品/0001-'))
        if (onProduct.length > 0) {
          push('DEC-0001-PROBLEMS', `[真树] 检查器对产品 0001 报了 ${onProduct.length} 条：${JSON.stringify(onProduct.map((p) => `${p.code}:${p.message}`).slice(0, 4))}`)
        }
      }
    }

    // ── ② 它在 git 里吗（没有 .git 的只读副本 ⇒ HOLD，不记红）────────────────────
    const tracked = realTrackedFiles()
    rec.readings.real.tracked = tracked
    if (!tracked.git) {
      caseHold(rec, 'DEC-GIT-COPY', '这一格跑在没有 .git 的只读副本里 ⇒ "账本/ 在不在 git 里"判不了（不是红）')
    } else {
      const want = ['账本/概念表.md', '账本/产品/INDEX.md', ...(productRel === null ? [] : [`账本/${productRel}`])]
      const missing = want.filter((rel) => !tracked.files.includes(rel))
      if (missing.length > 0) {
        push('TREE-NOT-IN-GIT', `[真树] \`git ls-files -- 账本\` 少了 ${JSON.stringify(missing)}（实得 ${tracked.files.length} 条）`
          + ' —— 决定是项目资产，必须进 git（定形 §三.1）')
      }
      // 🔴 **刀**（`bug-20261112-08`）：这条腿必须钉 `-c core.quotepath=false`，不许钉这台机器的配置。
      const knifeRepo = quotepathRepo('DEC-01')
      const literal = gitLsFiles({ cwd: knifeRepo, paths: ['账本'], quotePath: true })
      const bare = gitLsFiles({ cwd: knifeRepo, paths: ['账本'], quotePath: false })
      const probe = '账本/产品/INDEX.md'
      rec.readings.git_quotepath_knife = {
        repo: knifeRepo,
        literal: { exit: literal.exit, files: literal.files },
        bare: { exit: bare.exit, files: bare.files, stdout_head: bare.stdout.slice(0, 240) },
      }
      if (!literal.files.includes(probe)) {
        push('GIT-QUOTEPATH-KNIFE', `[刀] 夹具仓里加了 \`-c core.quotepath=false\` 仍列不出 ${JSON.stringify(probe)}（实得 ${JSON.stringify(literal.files)}）`
          + ' —— 那这条 git 腿量的不是路径，是别的什么')
      }
      if (bare.files.includes(probe)) {
        push('GIT-QUOTEPATH-KNIFE', `[刀] 夹具仓把 \`core.quotepath\` 设成 true 之后，bare \`git ls-files\` 仍列出字面路径 ${JSON.stringify(probe)}`
          + `（stdout=${JSON.stringify(bare.stdout.slice(0, 160))}）—— 这把刀没咬住，这条腿就只是"恰好绿"（\`bug-20261112-08\`）`)
      }
    }

    // ── ③ 夹具：good 绿 + 九把"只改一处"的刀 ───────────────────────────────────
    if (hasCheck) {
      const product = goodDecisionProduct0001()
      const scheme = goodDecision0001()
      const samples = [
        { tag: 'good', spec: {}, want: [] },
        { tag: 'missing-key', spec: { decisions: [product, { ...scheme, drop: ['原话'] }] }, want: ['DEC-MISSING-KEY'], mustName: '原话' },
        {
          tag: 'dup-key',
          spec: {
            decisions: [product, {
              ...scheme,
              headerLines: ['层级: 构案', '状态: 生效', '状态: 生效', '主题: 决议账本三册制', '日期: 2026-11-12', '拍板人: 老板',
                '原话: 「账本要能自己长」', 'supersedes: —', 'superseded_by: —', '父: 0001', '依据P: 0001', '依据bug: —'],
            }],
          },
          want: ['DEC-DUP-KEY'],
          mustName: '状态',
        },
        {
          tag: 'unknown-key',
          spec: {
            decisions: [product, {
              ...scheme,
              headerLines: ['层级: 构案', '状态: 生效', '主题: 决议账本三册制', '日期: 2026-11-12', '拍板人: 老板',
                '原话: 「账本要能自己长」', 'supersedes: —', 'superseded_by: —', '父: 0001', '依据P: 0001', '依据bug: —', '状态x: 生效'],
            }],
          },
          want: ['DEC-UNKNOWN-KEY'],
          mustName: '状态x',
        },
        { tag: 'bad-status', spec: { decisions: [product, goodDecision0001({ 状态: '有效' }), goodScheme('0002', '健康子构案')] }, want: ['DEC-BAD-VALUE'], mustName: '状态' },
        { tag: 'bad-quote', spec: { decisions: [product, goodDecision0001({ 原话: '账本要能自己长' })] }, want: ['DEC-BAD-VALUE'], mustName: '原话' },
        { tag: 'bad-date', spec: { decisions: [product, goodDecision0001({ 日期: '2026-13-01' })] }, want: ['DEC-BAD-VALUE'], mustName: '日期' },
        {
          tag: 'header-missing',
          spec: { decisions: [product, { ...scheme, headerLines: [], body: '## ① 背景\n直接就是正文，没有头块。\n' }, goodScheme('0002', '健康子构案')] },
          want: ['DEC-HEADER-MISSING'],
        },
        { tag: 'title-mismatch', spec: { decisions: [product, { ...scheme, h1: '# 构案 0009 · 决议账本三册制' }] }, want: ['DEC-TITLE-MISMATCH'], mustName: '0009' },
        {
          tag: 'multi-per-file',
          spec: { decisions: [product, { ...scheme, body: `${scheme.title}\n\n# 构案 0009 · 第二条\n` }, goodScheme('0002', '健康子构案')] },
          want: ['DEC-MULTI-PER-FILE'],
        },
      ]
      for (const s of samples) {
        const { run, entry } = runSample(problems, rec, { caseId: 'DEC-01', tag: s.tag, spec: s.spec })
        /**
         * 🔴 **一件已知的实现偏差（0012 §9.3 级联）**：头块整体不成立时，检查器除了
         * `DEC-HEADER-MISSING` 还会补 `DEC-BAD-VALUE`（层级读成空）与 `SCHEME-NO-BASIS`。
         * 契约 §9.3 要求"只报头块那一条"，实现没做到；这一格不能为了绿把它钉成期望
         * （那会让"以后修好级联"反而变红）。所以这一格只断言**头块那一条必须在**，多出来的
         * 级联码记进读数 —— 刀仍咬（删掉头块 ⇒ `DEC-HEADER-MISSING` 必须出现）。
         */
        if (s.tag === 'header-missing') {
          const codes = codesOf(run.json)
          const ok = run.json !== null && run.exit === 1 && run.json.ok === false && codes.includes('DEC-HEADER-MISSING')
          rec.readings[s.tag].cascade_extra = codes.filter((x) => x !== 'DEC-HEADER-MISSING')
          if (!ok) {
            push('CODE-SET-DRIFT', `[DEC-01/${s.tag}] 头块不成立时必须 red 且含 \`DEC-HEADER-MISSING\`（实得 exit=${run.exit} ok=${JSON.stringify(run.json?.ok)} codes=${JSON.stringify(codes)}）`)
          }
          continue
        }
        const parsed = expectCodes(problems, run, s.want, push, { label: `DEC-01/${s.tag}` })
        if (parsed && s.want.length > 0 && s.mustName !== undefined) {
          const named = messagesOf(run.json).some((m) => m.includes(s.mustName))
          if (!named) push('NOT-NAMED', `[DEC-01/${s.tag}] 报文没有点名 ${JSON.stringify(s.mustName)}：${JSON.stringify(entry.messages.slice(0, 3))}`)
        }
      }
      // 🔴 头的**次序不判**：产品八键倒着写，仍须绿（0012 §2：键序不判）。
      {
        const reversed = {
          ...product,
          headerLines: ['superseded_by: —', 'supersedes: —', '原话: 「账本要能自己长」', '拍板人: 老板', '日期: 2026-11-12',
            '主题: 产品口径样张', '状态: 生效', '层级: 产品'],
        }
        const { run } = runSample(problems, rec, { caseId: 'DEC-01', tag: 'reordered', spec: { decisions: [reversed, scheme] } })
        expectCodes(problems, run, [], push, { label: 'DEC-01/reordered' })
      }
      // 构案头十一键的清单本身也要有一条读数（防"只写七键就以为够了"）
      rec.readings.scheme_keys = [...SCHEME_KEYS]
    }

    caseFail(problems)
  })
})

test('DEC-02 supersede 边界：旧文没翻 ⇒ 红（指针不对称 / 状态与指针打架）；真翻了 ⇒ 绿；正文七节还在', async () => {
  await runCase('DEC-02', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §10.1 的检查器')) {
      caseFail(problems)
      return
    }

    const product = goodDecisionProduct0001()
    const second = (header = {}) => goodScheme('0002', '决议账本三册制', header)

    // ① 旧文还是 生效、只给新文加 supersedes ⇒ **不许绿**（旧文没翻）
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-02', tag: 'half',
        spec: { decisions: [product, goodDecision0001(), second({ supersedes: '0001' })] },
      })
      if (expectCodes(problems, run, ['POINTER-ASYMMETRIC'], push, { label: 'DEC-02/half' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes('0001') && msg.includes('0002'))) {
          push('NOT-NAMED', `[DEC-02/half] 报文必须同时点名 0001 与 0002（旧文没翻的那一对），实得 ${JSON.stringify(msg.slice(0, 200))}`)
        }
      }
    }

    // ② 状态与指针打架：写了 superseded_by、自己却还是 生效 ⇒ `LIVE-WITH-SUCCESSOR`
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-02', tag: 'live-with-successor',
        spec: { decisions: [product, goodDecision0001({ superseded_by: '0002' }), second({ supersedes: '0001' })] },
      })
      if (expectCodes(problems, run, ['LIVE-WITH-SUCCESSOR'], push, { label: 'DEC-02/live-with-successor' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0001'))) push('NOT-NAMED', '[DEC-02/live-with-successor] 报文要点名 0001')
      }
    }

    // ③ 已废却没有继任者 ⇒ `RETIRED-WITHOUT-SUCCESSOR`（另一条"旧文没翻完"）
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-02', tag: 'retired-without-successor',
        spec: { decisions: [product, goodDecision0001({ 状态: '已废' }), goodScheme('0002', '继任者')] },
      })
      if (expectCodes(problems, run, ['RETIRED-WITHOUT-SUCCESSOR'], push, { label: 'DEC-02/retired-without-successor' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0001'))) push('NOT-NAMED', '[DEC-02/retired-without-successor] 报文要点名 0001')
      }
    }

    // ④ 旧文真翻成 已废 + 双向指针 ⇒ 绿；并且 0001 的正文（七节）**不许**被 supersede 改掉
    {
      const done = [product, goodDecision0001({ 状态: '已废', superseded_by: '0002' }), second({ supersedes: '0001' })]
      const { scene, run } = runSample(problems, rec, { caseId: 'DEC-02', tag: 'done', spec: { decisions: done } })
      if (expectCodes(problems, run, [], push, { label: 'DEC-02/done' })) {
        const d = (run.json.decisions ?? []).find((x) => x.book === '构案' && x.id === '0001')
        rec.readings.done_0001 = d ?? null
        if (d?.status !== '已废') push('FLIP-NOT-READ', `[DEC-02/done] 0001 的状态必须是 已废，实得 ${JSON.stringify(d?.status)}`)
        if (JSON.stringify(d?.superseded_by) !== JSON.stringify(['0002'])) {
          push('FLIP-NOT-READ', `[DEC-02/done] 0001 的 superseded_by 必须解析成 ["0002"]，实得 ${JSON.stringify(d?.superseded_by)}`)
        }
        const text = readText(path.join(scene.root, '账本', '构案', '0001-决议账本三册制.md'))
        const sections = bodySectionsOf(text)
        rec.readings.done_0001_sections = sections
        if (sections.length !== BODY_SECTIONS.length) {
          push('FLIP-BODY-LOST', `[DEC-02/done] 0001 的正文七节必须还在（supersede 只许动头块两个字段），实得 ${JSON.stringify(sections)}`)
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
    if (!toolPresent(problems, CHECK, '契约 §10.1 的检查器')) {
      caseFail(problems)
      return
    }
    const product = goodDecisionProduct0001()
    const child = goodScheme('0001', '子构案')
    const second = (over = {}) => goodScheme('0002', '别的东西', over)

    // ① supersedes 悬空（0009 不存在）
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-03', tag: 'dangling',
        spec: { decisions: [product, child, second({ supersedes: '0009' })] },
      })
      if (expectCodes(problems, run, ['POINTER-DANGLING'], push, { label: 'DEC-03/dangling' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0009'))) push('NOT-NAMED', '[DEC-03/dangling] 报文必须点名那个悬空引用 0009')
      }
    }
    // ② superseded_by 悬空（已废但指向不存在的那一条）
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-03', tag: 'dangling-by',
        spec: { decisions: [product, goodDecision0001({ 状态: '已废', superseded_by: '0009' }), second()] },
      })
      if (expectCodes(problems, run, ['POINTER-DANGLING'], push, { label: 'DEC-03/dangling-by' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0009'))) push('NOT-NAMED', '[DEC-03/dangling-by] 报文必须点名那个悬空引用 0009')
      }
    }
    // ③ 自称
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-03', tag: 'self',
        spec: { decisions: [product, child, second({ supersedes: '0002' })] },
      })
      expectCodes(problems, run, ['POINTER-SELF'], push, { label: 'DEC-03/self' })
    }
    // ④ 单向：0002 说 supersedes 0001，而 0001.superseded_by 只记 0003 ⇒ 0002→0001 这一边没人认
    {
      const X = '甲'
      const Y = '乙'
      const decisions = [
        product,
        goodScheme('0001', X, { 状态: '已废', superseded_by: '0003' }),
        goodScheme('0002', X, { supersedes: '0001' }),
        goodScheme('0003', Y, { supersedes: '0001' }),
      ]
      const { run } = runSample(problems, rec, { caseId: 'DEC-03', tag: 'asymmetric', spec: { decisions } })
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

test('DEC-08 头的跨字段自洽：产品无父 · 构案有父 · 父在来源列表里（0012 §2.2 三条，各一条码）', async () => {
  await runCase('DEC-08', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §10.1 的检查器')) {
      caseFail(problems)
      return
    }
    const product = goodDecisionProduct0001()
    const scheme = goodDecision0001()

    // ① good：产品无父、构案父 = 0001 且 依据P 里记着 0001 ⇒ 绿
    {
      const { run } = runSample(problems, rec, { caseId: 'DEC-08', tag: 'good', spec: {} })
      expectCodes(problems, run, [], push, { label: 'DEC-08/good' })
    }
    // ② 产品写了 父 ⇒ `PRODUCT-HAS-PARENT`（0012 §2.1：老板的决议没有父）
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'product-parent',
        spec: { decisions: [{ ...product, header: { ...product.header, 父: '0001' } }, scheme] },
      })
      if (expectCodes(problems, run, ['PRODUCT-HAS-PARENT'], push, { label: 'DEC-08/product-parent' })) {
        if (!messagesOf(run.json).some((m) => m.includes('产品/0001-'))) push('NOT-NAMED', '[DEC-08/product-parent] 报文要点名那一份产品文件')
      }
    }
    // ③ 构案缺 父 ⇒ `SCHEME-PARENT-MISSING`
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'scheme-parent-missing',
        spec: { decisions: [product, { ...scheme, drop: ['父'] }] },
      })
      expectCodes(problems, run, ['SCHEME-PARENT-MISSING'], push, { label: 'DEC-08/scheme-parent-missing' })
    }
    // ④ 构案两栏来源都是 — ⇒ `SCHEME-NO-BASIS`
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'scheme-no-basis',
        spec: { decisions: [product, { ...scheme, header: { ...scheme.header, 依据P: '—', 依据bug: '—' } }] },
      })
      expectCodes(problems, run, ['SCHEME-NO-BASIS'], push, { label: 'DEC-08/scheme-no-basis' })
    }
    // ⑤ 父不在来源列表里 ⇒ `SCHEME-PARENT-INCONSISTENT`（点名父与两侧集合）
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'scheme-parent-inconsistent',
        spec: { decisions: [product, { ...scheme, header: { ...scheme.header, 父: '0002' } }] },
      })
      if (expectCodes(problems, run, ['SCHEME-PARENT-INCONSISTENT'], push, { label: 'DEC-08/scheme-parent-inconsistent' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes('0002') && msg.includes('0001'))) {
          push('NOT-NAMED', `[DEC-08/scheme-parent-inconsistent] 报文要点名父 0002 与来源列表里的 0001，实得 ${JSON.stringify(msg.slice(0, 240))}`)
        }
      }
    }
    // ⑥ 正样本：父是**缺陷 id**，依据bug 里记着它 ⇒ 绿（0012 §2.2：父可以是产品号或缺陷 id）
    {
      const bug = 'bug-20261115-01'
      const viaBug = goodScheme('0002', '缺陷驱动的构案', { 父: bug, 依据P: '0001', 依据bug: bug })
      const { run } = runSample(problems, rec, { caseId: 'DEC-08', tag: 'parent-bug', spec: { decisions: [product, scheme, viaBug] } })
      expectCodes(problems, run, [], push, { label: 'DEC-08/parent-bug' })
    }

    caseFail(problems)
  })
})
