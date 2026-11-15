/**
 * `DEC-01` / `DEC-02` / `DEC-03` / `DEC-08` —— **三册决议文件本身**（两套头 / supersede 边界 / 指针 / 头的跨字段自洽）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§2 两套头 · §5 三条链 · §9 码表 · §12 Gate 3 交接单）。
 *
 * 🔴 **0012 把单册 `决议/` 换成三册 `账本/{产品,构案,缺陷}`**（Gate 3 实现 `0b36253`）：
 *   本文件的对象、路径、码表全部按三册重指；`DEC-02` 判 **supersede 的边界：旧文真的翻了**。
 *   Gate 3 r2（`194709-dev`）恢复了 **`DUPLICATE-LIVE-TOPIC`**（同一册同一主题两条 `生效` ⇒ 红，点名两号）——
 *   所以 `half` / `live-with-successor` 这两格**同时**有"两条同主题生效"这一条：期望码集里两条都在
 *   （只报指针那条 = 恢复后的不变式又掉了；只报重复那条 = 指针那条没人管）。
 *   `DEC-08` 判 0012 §2.2 的三条跨字段自洽（产品无父 · 构案有父 · 父在来源列表里）；
 *   正文七节 / 反悔表在 Gate 3 r2 归**检查器**（构案册）—— 本文件的真树读数仍逐份量它。
 *
 * 每一格的刀都是**同一棵 `good` 树上只改一个变量**，并且断言**码集精确相等**：
 * 只证明"红因里有它"不算判据（`cand-20261016-promise-without-assertion-01`）。
 */
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CHECK, REAL_LEDGER, SCHEME_KEYS, BODY_SECTIONS, codesOf, expectCodes, gitLsFiles, goodDecision0001,
  goodDecisionProduct0001, goodLedger, goodProduct, goodScheme, messagesOf, quotepathRepo, readText, realDecisionFiles,
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

/** 一份真实文件里 `## ①`…`## ⑦` 七节各在不在（**真树静态读数**：这一条不经过检查器；
 *  检查器那一族由下面 DEC-08 的 `body_shape` 夹具读数单独证）。 */
function bodySectionsOf(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  return BODY_SECTIONS.filter((name) => lines.some((l) => /^##\s+/u.test(l) && l.includes(name)))
}

/** 七节的序号（夹具正文用；组名与检查器同一份 `BODY_SECTIONS`）。 */
const BODY_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦']

/**
 * 构案正文（七节模板）。带三格变量：
 *   · `drop` —— 删掉某一节（造 `BODY-SECTION-MISSING`）；
 *   · `reversalTable` —— 直接给 ⑦ 的表行；`null` = 这一节没有表（造 `REVERSAL-TABLE-MISSING`）；
 *   · 缺省 = 合法的四列表（动作格含 `supersede`）。
 */
function schemeBody({ drop = null, reversalTable = undefined } = {}) {
  const out = []
  BODY_SECTIONS.forEach((name, i) => {
    if (name === drop) return
    out.push(`## ${BODY_NUMBERS[i]} ${name}`, '')
    if (name !== '反悔条件') {
      out.push('这一节是夹具。', '')
      return
    }
    if (reversalTable === null) return
    const table = reversalTable ?? [
      '| 编号 | 条件 | 触发时动作 | 状态 |',
      '| --- | --- | --- | --- |',
      '| RC-1 | 同概念第 3 处实现 | supersede 到新编号 | 未触发 |',
    ]
    out.push(...table, '')
  })
  return out.join('\n')
}

/** 一份缺陷日文件（`父` 指缺陷 id 的正样本要有一条**真的**缺陷记录）。 */
function bugDayFile(id) {
  return {
    rel: '账本/缺陷/2026-11-15.json',
    text: `${JSON.stringify({
      schema: 1,
      day: '2026-11-15',
      events: [{ seq: 1, kind: 'registered', id, at: '2026-11-15T09:00:00+08:00', entry_kind: 'bug', phenomenon: '夹具缺陷（DEC-08 的父）' }],
    }, null, 2)}\n`,
  }
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
      if (expectCodes(problems, run, ['DUPLICATE-LIVE-TOPIC', 'POINTER-ASYMMETRIC'], push, { label: 'DEC-02/half' })) {
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
      if (expectCodes(problems, run, ['DUPLICATE-LIVE-TOPIC', 'LIVE-WITH-SUCCESSOR'], push, { label: 'DEC-02/live-with-successor' })) {
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

test('DEC-08 头的跨字段自洽 + 构案正文形态：产品无父 · 构案有父 · 父在来源列表里 · 父解析得到且生效（三码）· 七节 / 反悔表（五把刀，各只红一个码）', async () => {
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
    // 父必须**指得到一条生效产品**，否则会同时红 `SCHEME-PARENT-DANGLING` —— 这一格的变量只有一个：
    // "父活着但不在来源列表里"。所以给 0002 一个真产品，并给它一条子构案（否则产品链跟着红）。
    {
      const otherProduct = goodProduct('0002', '另一个产品')
      const otherChild = goodScheme('0002', '另一个产品的方案', { 父: '0002', 依据P: '0002' })
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'scheme-parent-inconsistent',
        spec: { decisions: [product, otherProduct, scheme, otherChild, { ...scheme, id: '0003', title: '指错父的构案', header: { ...scheme.header, 主题: '指错父的构案', 父: '0002' } }] },
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
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'parent-bug',
        spec: { decisions: [product, scheme, viaBug], extraFiles: [bugDayFile(bug)] },
      })
      expectCodes(problems, run, [], push, { label: 'DEC-08/parent-bug' })
    }
    // ⑦ 父解析不到（产品册 / 缺陷册都没有 0099）⇒ `SCHEME-PARENT-DANGLING` 且点名 0099。
    // 0099 同时写在 依据P 里 ⇒ 主父仍是来源列表成员，**不**叠加 `SCHEME-PARENT-INCONSISTENT`（刀只切一处）。
    {
      const ghost = goodScheme('0002', '悬空父的构案', { 父: '0099', 依据P: '0099' })
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'parent-dangling',
        spec: { decisions: [product, scheme, ghost] },
      })
      if (expectCodes(problems, run, ['SCHEME-PARENT-DANGLING'], push, { label: 'DEC-08/parent-dangling' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0099'))) push('NOT-NAMED', '[DEC-08/parent-dangling] 报文必须点名那个解析不到的父 0099')
      }
    }
    // ⑧ 父指到**已废**产品 ⇒ 自己的码 `SCHEME-PARENT-RETIRED`（与"解析不到"分开）
    {
      const retiredProduct = goodProduct('0002', '旧产品', { 状态: '已废', superseded_by: '0001' })
      const successorProduct = { ...product, header: { ...product.header, supersedes: '0002' } }
      const childOfRetired = goodScheme('0002', '指废父的构案', { 父: '0002', 依据P: '0002' })
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'parent-retired',
        spec: { decisions: [successorProduct, retiredProduct, scheme, childOfRetired] },
      })
      if (expectCodes(problems, run, ['SCHEME-PARENT-RETIRED'], push, { label: 'DEC-08/parent-retired' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0002'))) push('NOT-NAMED', '[DEC-08/parent-retired] 报文必须点名那个已废产品 0002')
      }
    }
    // ⑨ 父指到**构案**（存在且生效，但不是产品 / 缺陷）⇒ `SCHEME-PARENT-NOT-PRODUCT`（契约 §2.2 的父只认两种形状）
    {
      const liveScheme = goodScheme('0002', '活着但被当成父的构案')
      const childOfScheme = goodScheme('0003', '指构案当父的构案', { 父: '0002', 依据P: '0002' })
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'parent-not-product',
        spec: { decisions: [product, scheme, liveScheme, childOfScheme] },
      })
      if (expectCodes(problems, run, ['SCHEME-PARENT-NOT-PRODUCT'], push, { label: 'DEC-08/parent-not-product' })) {
        if (!messagesOf(run.json).some((m) => m.includes('0002'))) push('NOT-NAMED', '[DEC-08/parent-not-product] 报文必须点名那个构案编号 0002')
      }
    }
    // ⑨' 父**显式写成 `构案/0001`**（号上同时有一条活着的产品 0001）⇒ 仍必须是 `SCHEME-PARENT-NOT-PRODUCT`。
    // 这一格的变量只有"系列前缀"：id 解析得到产品、来源列表也自洽 ⇒ 只看 `ref.series` 这一条判不判得出来。
    {
      const childOfScheme = goodScheme('0002', '显式指构案的父', { 父: '构案/0001', 依据P: '0001' })
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'parent-series-scheme',
        spec: { decisions: [product, scheme, childOfScheme] },
      })
      if (expectCodes(problems, run, ['SCHEME-PARENT-NOT-PRODUCT'], push, { label: 'DEC-08/parent-series-scheme' })) {
        const msg = messagesOf(run.json).join(' ')
        if (!(msg.includes('构案/0001') && msg.includes('0001'))) {
          push('NOT-NAMED', `[DEC-08/parent-series-scheme] 报文必须点名父的原值 \`构案/0001\`，实得 ${JSON.stringify(msg.slice(0, 240))}`)
        }
      }
    }
    // ⑨'' 缺产品册 ⇒ **只红 `BOOK-MISSING`**，不许把"判不了"读成 `SCHEME-PARENT-DANGLING`
    // （卡上「缺册不许读成悬空」那把刀：夹具里构案的父是产品号 0001，正好走进产品父分支）。
    {
      const { run } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: 'parent-book-missing',
        spec: { decisions: [scheme], withoutBooks: ['产品'] },
      })
      if (expectCodes(problems, run, ['BOOK-MISSING'], push, { label: 'DEC-08/parent-book-missing' })) {
        if (!messagesOf(run.json).some((m) => m.includes('产品'))) push('NOT-NAMED', '[DEC-08/parent-book-missing] BOOK-MISSING 报文必须点名缺的是产品册')
        if (messagesOf(run.json).some((m) => m.includes('父: 0001'))) push('NOT-NAMED', '[DEC-08/parent-book-missing] 缺册时不许再点名 `父: 0001`（判不了 ≠ 悬空）')
      }
    }

    // ⑩ 正文形态（0012 §③）—— **每一格都走检查器**（`决定-text` 的 `body` 只改正文一处）；
    //    真树那一条静态读数留在 `DEC-01`（`rec.readings.real.product_0001_sections`），与这里分开印。
    const bodyRows = (action = 'supersede 到新编号', idCell = 'RC-1') => [
      '| 编号 | 条件 | 触发时动作 | 状态 |',
      '| --- | --- | --- | --- |',
      `| ${idCell} | 同概念第 3 处实现 | ${action} | 未触发 |`,
    ]
    const bodySamples = [
      { tag: 'body-good', body: schemeBody(), want: [] },
      { tag: 'body-missing-7', body: schemeBody({ drop: '反悔条件' }), want: ['BODY-SECTION-MISSING'], mustName: '反悔条件' },
      { tag: 'body-missing-5', body: schemeBody({ drop: '新增什么' }), want: ['BODY-SECTION-MISSING'], mustName: '新增什么' },
      { tag: 'reversal-table-missing', body: schemeBody({ reversalTable: null }), want: ['REVERSAL-TABLE-MISSING'] },
      {
        tag: 'reversal-3col',
        body: schemeBody({ reversalTable: ['| 编号 | 条件 | 触发时动作 |', '| --- | --- | --- |', '| RC-1 | 同概念第 3 处实现 | supersede 到新编号 |'] }),
        want: ['REVERSAL-ROW-SHAPE'],
        mustName: '触发时动作',
      },
      {
        tag: 'reversal-action-word',
        body: schemeBody({ reversalTable: bodyRows('按上面的说法办') }),
        want: ['REVERSAL-ROW-SHAPE'],
        mustName: 'RC-1',
      },
      { tag: 'reversal-words', body: schemeBody({ reversalTable: bodyRows('重开一张新票') }), want: [] },
    ]
    rec.readings.body_shape = {}
    for (const s of bodySamples) {
      const { run, entry } = runSample(problems, rec, {
        caseId: 'DEC-08', tag: s.tag,
        spec: { decisions: [product, { ...scheme, body: s.body }] },
      })
      rec.readings.body_shape[s.tag] = {
        root: entry.root,
        exit: entry.exit,
        ok: entry.ok,
        codes: entry.codes,
        messages: entry.messages.slice(0, 3),
      }
      const parsed = expectCodes(problems, run, s.want, push, { label: `DEC-08/${s.tag}` })
      if (parsed && s.mustName !== undefined && !messagesOf(run.json).some((m) => m.includes(s.mustName))) {
        push('NOT-NAMED', `[DEC-08/${s.tag}] 报文必须点名 ${JSON.stringify(s.mustName)}：${JSON.stringify(entry.messages.slice(0, 3))}`)
      }
    }

    caseFail(problems)
  })
})
