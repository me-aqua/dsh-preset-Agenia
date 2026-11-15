/**
 * `LDG-01` / `LDG-02` / `LDG-03` —— **三册结构 · 产品→构案 · 缺陷→构案**（构案 0012）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§1 结构 · §1.3 派生页 · §2 头字段 · §3 事件流 ·
 * §5.1/§5.2 两条链 · §9.3 级联口径 · §11 刀表 K1/K2/K3/K4/K5）。
 * 派工卡：`.team/leader/2026-11-15/cards/173731-test.md`（判据 1 与判据 2 的两条链）。
 *
 * 🔴 **今天的预期是红**：`账本/` 与 `presets/agenia/bin/决议-check.mjs` 都还不存在（Gate 3 才建）。
 * 红因是 `TOOL-MISSING` —— 这不是"判据坏了"，是 Gate 2 的应有形状。
 *
 * 每一格的刀都是**同一棵 `good` 树上只改一个变量**，并且断言**码集精确相等**：
 * 只证明"红因里有它"不算判据（`cand-20261016-promise-without-assertion-01`）。
 */
import { appendFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  BOOKS, CHECK, LEDGER_REL, buildScene, codesOf, eventAssessed, eventDisposed, eventRegistered,
  expectCodes, indexMarkerReading, messagesOf, namedIn, productText, readText, runCheck, runIndex,
  schemeText, toolPresent,
} from '../support/three-books.mjs'

before(() => {
  preflight()
})

/** 一条缺陷的三种记法（同一棵树上只改一处用）。 */
const BUG = 'bug-20261115-01'
function bugDay({ id = BUG, day = '2026-11-15', disposed = { 判假: '夹具判假：不是缺陷' }, verdict = 'false' } = {}) {
  return {
    day,
    events: [
      eventRegistered({ seq: 1, id, at: `${day}T09:00:00+08:00` }),
      eventAssessed({ seq: 2, id, at: `${day}T10:00:00+08:00`, verdict }),
      eventDisposed({ seq: 3, id, at: `${day}T11:00:00+08:00`, value: 'rejected', extra: disposed }),
    ],
  }
}

/** 一棵合法的三册树（`good`；每一格都在它上面只改一处）。 */
function goodLedger(over = {}) {
  return {
    products: [{ id: '0001', title: '产品口径样张' }],
    schemes: [{ id: '0012', title: '三册账本', parent: '0001', basisP: ['0001'] }],
    days: [bugDay()],
    team: true,
    ...over,
  }
}

/** 造树 → 跑 `--op index`（派生三张页）→ 跑 `--op check`；读数收进 `rec.readings[tag]`。 */
function checkScene(problems, rec, { caseId, tag, spec, checkArgs = [] }) {
  const scene = buildScene({ caseId, tag, ...spec })
  const idx = runIndex(scene.root)
  const run = runCheck(scene.root, checkArgs)
  rec.readings[tag] = {
    root: scene.root,
    index: { exit: idx.exit, codes: codesOf(idx.json), json_error: idx.json_error },
    check: {
      exit: run.exit,
      ok: run.json?.ok ?? null,
      codes: codesOf(run.json),
      messages: messagesOf(run.json).map((m) => m.slice(0, 240)),
      chain: run.json?.chain ?? null,
      books: run.json?.books ?? null,
      legacy_disposed: run.json?.legacy_disposed ?? null,
    },
  }
  return { scene, idx, run }
}

/** 真树读数（`账本/` 在不在 · 三册在不在 · `决议/` 还在不在）。 */
function realTreeReading({ withCheck = true } = {}) {
  const ledgerDir = path.join(PATHS.repo, LEDGER_REL)
  const books = {}
  for (const book of BOOKS) {
    const dir = path.join(ledgerDir, book)
    const present = existsSync(dir)
    books[book] = {
      present,
      entries: present
        ? readdirSync(dir).filter((n) => {
          const full = path.join(dir, n)
          try {
            return statSync(full).isFile() && n !== 'INDEX.md' && n !== '.gitkeep'
          } catch {
            return false
          }
        }).length
        : 0,
    }
  }
  const out = {
    repo: PATHS.repo,
    ledger_present: existsSync(ledgerDir),
    books,
    old_tree_present: existsSync(path.join(PATHS.repo, '决议')),
  }
  if (withCheck && existsSync(CHECK)) {
    const run = runCheck(PATHS.repo)
    out.check = {
      exit: run.exit,
      codes: codesOf(run.json),
      chain: run.json?.chain ?? null,
      legacy_disposed: run.json?.legacy_disposed ?? null,
      json_error: run.json === null ? run.json_error : null,
    }
  }
  return out
}

// ── LDG-01 ──────────────────────────────────────────────────────────────
test('LDG-01 三册结构：三册在 / 一条一 md / 一天一 JSON / 三张派生页手改当场红', async () => {
  await runCase('LDG-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const hasTool = toolPresent(problems, CHECK, '契约 §0/§10 的检查器（三册结构只能由它判）')

    // ── ① 真树那一腿：三册在、旧树不在（Gate 3 之后才有）────────────────────────
    const real = realTreeReading({ withCheck: hasTool })
    rec.readings.real = real
    if (real.ledger_present) {
      for (const book of BOOKS) {
        if (!real.books[book].present) push('BOOK-MISSING', `[真树] 账本/${book}/ 不在盘上（实得 ${JSON.stringify(real.books)}）`)
      }
      if (real.old_tree_present) push('LEDGER-OLD-TREE-PRESENT', '[真树] 决议/ 还在 —— 迁移没做完（契约 §1.1）')
    } else if (hasTool) {
      push('LEDGER-NOT-INITIALISED', `[真树] ${path.join(PATHS.repo, LEDGER_REL)} 不在 —— 三册结构还没建（这一格在 Gate 3 之后必须绿）`)
    }

    if (!hasTool) {
      caseFail(problems)
      return
    }

    // ── ② good：三册 + 一条一 md + 一天一 JSON + 三张页 ⇒ 绿 ────────────────────
    {
      const { scene, idx, run } = checkScene(problems, rec, { caseId: 'LDG-01', tag: 'good', spec: goodLedger() })
      if (expectCodes(problems, run, [], push, { label: 'LDG-01/good' })) {
        if (idx.exit !== 0) push('INDEX-WRITE-FAILED', `[LDG-01/good] --op index 退出码 ${idx.exit}（码集 ${JSON.stringify(codesOf(idx.json))}）—— 派生页是这一格的被测对象`)
        for (const rel of BOOKS) {
          const page = readText(path.join(scene.root, LEDGER_REL, rel, 'INDEX.md'))
          const marker = indexMarkerReading(page)
          rec.readings[`good_page_${rel}`] = marker
          if (!marker.present) {
            push('INDEX-MISSING', `[LDG-01/good] 账本/${rel}/INDEX.md 没被 --op index 写出来`)
          } else if (!marker.ok) {
            push('INDEX-NOT-GENERATED', `[LDG-01/good] 账本/${rel}/INDEX.md 的首行不是生成标记：${JSON.stringify(marker.first_line)}（契约 §1.3 要含 ${JSON.stringify(['生成物', '决议-check.mjs'])}）`)
          }
        }
        const productPage = readText(path.join(scene.root, LEDGER_REL, '产品', 'INDEX.md')) ?? ''
        const schemePage = readText(path.join(scene.root, LEDGER_REL, '构案', 'INDEX.md')) ?? ''
        const bugPage = readText(path.join(scene.root, LEDGER_REL, '缺陷', 'INDEX.md')) ?? ''
        if (!productPage.includes('0001')) push('INDEX-ROW-MISSING', '[LDG-01/good] 产品页上没有 0001（每一条生效产品都要找得到）')
        if (!schemePage.includes('0012')) push('INDEX-ROW-MISSING', '[LDG-01/good] 构案页上没有 0012')
        if (!bugPage.includes(BUG)) push('INDEX-ROW-MISSING', `[LDG-01/good] 缺陷页上没有 ${BUG}（折叠出来的现状必须印在页上）`)
        // 幂等：派生页再写一次必须逐字节相同（否则"页 = 派生物"这句话不成立）
        const before = Object.fromEntries(BOOKS.map((b) => [b, readText(path.join(scene.root, LEDGER_REL, b, 'INDEX.md'))]))
        const idx2 = runIndex(scene.root)
        const after = Object.fromEntries(BOOKS.map((b) => [b, readText(path.join(scene.root, LEDGER_REL, b, 'INDEX.md'))]))
        rec.readings['good_index_twice'] = { exit: idx2.exit, same: BOOKS.map((b) => before[b] === after[b]) }
        const drifted = BOOKS.filter((b) => before[b] !== after[b])
        if (drifted.length > 0) {
          push('INDEX-NOT-IDEMPOTENT', `[LDG-01/good] 第二次 --op index 改写了这三张页：${JSON.stringify(drifted)} —— 派生页必须是同一个输入算出同一份字节（契约 §1.3）`)
        }
      }
    }

    // ── ③ 一把刀一个变量（每个样本一棵新树）──────────────────────────────────
    const samples = [
      // 册不在（契约 §1.1 + §9.3-1：只报 BOOK-MISSING）
      {
        tag: 'book-missing',
        spec: goodLedger({ days: [], withoutBooks: ['缺陷'] }),
        want: ['BOOK-MISSING'],
        mustName: '缺陷',
      },
      // 缺陷册里放一份不是"一天一个 JSON"的文件
      {
        tag: 'stray-md',
        spec: goodLedger({ days: [] }),
        files: [{ rel: `${LEDGER_REL}/缺陷/2026-11-15.json.bak.md`, text: '# 手抄的缺陷\n' }],
        want: ['BOOK-STRAY-FILE'],
        mustName: '2026-11-15.json.bak.md',
      },
      // 一条一 md：一份 md 里两条决议
      {
        tag: 'two-per-md',
        spec: goodLedger({
          products: [{
            id: '0001',
            headerLines: ['层级: 产品', '主题: 产品口径样张', '日期: 2026-11-15', '拍板人: 老板', '原话: 「一」', '状态: 生效', 'supersedes: —', 'superseded_by: —'],
            h1Extra: ['', '# 产品 0002 · 第二条', '', '层级: 产品', '主题: 第二条', '日期: 2026-11-15', '拍板人: 老板', '原话: 「二」', '状态: 生效', 'supersedes: —', 'superseded_by: —', ''].join('\n'),
          }],
        }),
        want: ['DEC-MULTI-PER-FILE'],
        mustName: '0001-产品口径样张.md',
      },
      // 产品不许有父
      {
        tag: 'product-parent',
        spec: goodLedger({ products: [{ id: '0001', header: { 父: '0000' } }] }),
        want: ['PRODUCT-HAS-PARENT'],
        mustName: '0001-产品口径样张.md',
      },
      // 构案：父必填 / 至少一栏依据 / 父必须是依据的成员
      {
        tag: 'scheme-parent-missing',
        spec: goodLedger({ schemes: [{ id: '0012', parent: '0001', drop: ['父'] }] }),
        want: ['SCHEME-PARENT-MISSING'],
        mustName: '0012-三册账本.md',
      },
      {
        tag: 'scheme-no-basis',
        spec: goodLedger({ schemes: [{ id: '0012', parent: '0001', basisP: ['—'], basisBug: ['—'] }] }),
        want: ['SCHEME-NO-BASIS'],
        mustName: '0012-三册账本.md',
      },
      {
        // 父 是一个**真实存在**的 id（缺陷 id），但它不在两张依据表里 ⇒ 只红自洽那一条
        tag: 'scheme-parent-inconsistent',
        spec: goodLedger({ schemes: [{ id: '0012', parent: BUG, basisP: ['0001'], basisBug: ['—'] }] }),
        want: ['SCHEME-PARENT-INCONSISTENT'],
        mustName: BUG,
      },
      // 旧树还在
      {
        tag: 'old-tree',
        spec: goodLedger(),
        rootExtras: [{ rel: '决议/INDEX.md', text: '# 旧账本（迁移没做完）\n' }],
        want: ['LEDGER-OLD-TREE-PRESENT'],
        mustName: '决议/',
      },
    ]
    for (const s of samples) {
      const scene = buildScene({ caseId: 'LDG-01', tag: s.tag, ...s.spec, files: s.files ?? [], rootExtras: s.rootExtras ?? [] })
      const idx = runIndex(scene.root)
      const run = runCheck(scene.root)
      rec.readings[s.tag] = {
        root: scene.root,
        index: { exit: idx.exit, codes: codesOf(idx.json) },
        check: { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 240)) },
      }
      const parsed = expectCodes(problems, run, s.want, push, { label: `LDG-01/${s.tag}` })
      if (parsed && s.mustName !== undefined && !namedIn(run.json, s.mustName)) {
        push('NOT-NAMED', `[LDG-01/${s.tag}] 报文没有点名 ${JSON.stringify(s.mustName)}：${JSON.stringify(messagesOf(run.json).slice(0, 3))}`)
      }
    }

    // ── ④ 派生页的三把刀（K1 删标记 / K2 加行 / K3 改一格）+ 两格正样本 ────────────
    {
      // K1：删掉 产品/INDEX.md 的首行标记
      const scene = buildScene({ caseId: 'LDG-01', tag: 'k1-marker', ...goodLedger() })
      runIndex(scene.root)
      const file = path.join(scene.root, LEDGER_REL, '产品', 'INDEX.md')
      const lines = (readText(file) ?? '').split(/\r?\n/)
      const at = lines.findIndex((l) => l.trim() !== '')
      if (at < 0) {
        push('INDEX-MISSING', '[LDG-01/k1-marker] --op index 之后 产品/INDEX.md 是空的 —— 无法造"删标记"的刀')
      } else {
        lines.splice(at, 1)
        writeFileSync(file, lines.join('\n'), 'utf8')
        const run = runCheck(scene.root)
        rec.readings['k1-marker'] = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 240)) }
        expectCodes(problems, run, ['INDEX-NOT-GENERATED'], push, { label: 'LDG-01/k1-marker' })
      }
    }
    {
      // K2：往 构案/INDEX.md 加一行手抄
      const scene = buildScene({ caseId: 'LDG-01', tag: 'k2-extra', ...goodLedger() })
      runIndex(scene.root)
      appendFileSync(path.join(scene.root, LEDGER_REL, '构案', 'INDEX.md'), '| 9999 | 手抄的一行 |\n', 'utf8')
      const run = runCheck(scene.root)
      rec.readings['k2-extra'] = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 240)) }
      if (expectCodes(problems, run, ['INDEX-ROW-EXTRA'], push, { label: 'LDG-01/k2-extra' })) {
        if (!namedIn(run.json, '9999')) push('NOT-NAMED', '[LDG-01/k2-extra] INDEX-ROW-EXTRA 必须点名 9999')
      }
    }
    {
      // K3：改 产品/INDEX.md 里 0001 那一行的**最后一格**（第一格仍是编号 ⇒ 归类为 MISMATCH）
      const scene = buildScene({ caseId: 'LDG-01', tag: 'k3-cell', ...goodLedger() })
      runIndex(scene.root)
      const file = path.join(scene.root, LEDGER_REL, '产品', 'INDEX.md')
      const rows = (readText(file) ?? '').split(/\r?\n/)
      const at = rows.findIndex((l) => l.includes('0001'))
      if (at < 0) {
        push('INDEX-ROW-MISSING', '[LDG-01/k3-cell] 产品页上找不到含 0001 的那一行 —— 无法造"改一格"的刀')
      } else {
        rows[at] = `${rows[at]} 手改`
        writeFileSync(file, rows.join('\n'), 'utf8')
        const run = runCheck(scene.root)
        rec.readings['k3-cell'] = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 240)) }
        if (expectCodes(problems, run, ['INDEX-ROW-MISMATCH'], push, { label: 'LDG-01/k3-cell' })) {
          if (!namedIn(run.json, '0001')) push('NOT-NAMED', '[LDG-01/k3-cell] INDEX-ROW-MISMATCH 必须点名 0001')
        }
      }
    }
    {
      // 正样本：手改之后 --op index 一跑就绿（页是派生物，不是账本）
      const scene = buildScene({ caseId: 'LDG-01', tag: 'k1-restore', ...goodLedger() })
      runIndex(scene.root)
      const file = path.join(scene.root, LEDGER_REL, '产品', 'INDEX.md')
      const lines = (readText(file) ?? '').split(/\r?\n/)
      const at = lines.findIndex((l) => l.trim() !== '')
      if (at >= 0) lines.splice(at, 1)
      writeFileSync(file, lines.join('\n'), 'utf8')
      runIndex(scene.root)
      const run = runCheck(scene.root)
      rec.readings['k1-restore'] = { exit: run.exit, codes: codesOf(run.json) }
      expectCodes(problems, run, [], push, { label: 'LDG-01/k1-restore' })
    }
    {
      // 正样本（反面）：跑完 index 之后再落一条产品 ⇒ 页上没有它（派生页必须跟着账本走）
      // ⚠️ 新落的产品也要有一条子构案，否则这一格会同时红产品链（那就不是"只判页"了）
      const scene = buildScene({ caseId: 'LDG-01', tag: 'stale-page', ...goodLedger() })
      runIndex(scene.root)
      writeFileSync(path.join(scene.root, LEDGER_REL, '产品', '0002-第二条.md'), productText({ id: '0002', title: '第二条' }), 'utf8')
      writeFileSync(
        path.join(scene.root, LEDGER_REL, '构案', '0013-第二条的方案.md'),
        schemeText({ id: '0013', title: '第二条的方案', parent: '0002', basisP: ['0002'] }),
        'utf8',
      )
      const run = runCheck(scene.root)
      rec.readings['stale-page'] = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 240)) }
      if (expectCodes(problems, run, ['INDEX-ROW-MISSING'], push, { label: 'LDG-01/stale-page' })) {
        if (!namedIn(run.json, '0002')) push('NOT-NAMED', '[LDG-01/stale-page] INDEX-ROW-MISSING 必须点名 0002')
      }
    }

    caseFail(problems)
  })
})

// ── LDG-02 ──────────────────────────────────────────────────────────────
test('LDG-02 产品→构案：生效产品必须有生效子构案（刀：删掉全部子构案 ⇒ 红且点名产品）', async () => {
  await runCase('LDG-02', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §5.1 的检查器（产品→构案这一条链只能由它判）')) {
      caseFail(problems)
      return
    }

    const twoProducts = [
      { id: '0001', title: '产品一' },
      { id: '0002', title: '产品二' },
    ]
    const childFor = (product, { id = '0012', over = {} } = {}) => ({ id, title: `落产品${product}的方案`, parent: product, basisP: [product], ...over })

    // ① 两个产品各有子 ⇒ 绿
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-02', tag: 'good',
        spec: goodLedger({ products: twoProducts, schemes: [childFor('0001'), childFor('0002', { id: '0013' })] }),
      })
      expectCodes(problems, run, [], push, { label: 'LDG-02/good' })
    }
    // ② 刀 K4：删掉 0002 的全部子构案 ⇒ 恰好一条、点名 0002
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-02', tag: 'k4-no-child',
        spec: goodLedger({ products: twoProducts, schemes: [childFor('0001')] }),
      })
      if (expectCodes(problems, run, ['CHAIN-PRODUCT-NO-CHILD'], push, { label: 'LDG-02/k4-no-child' })) {
        if (!namedIn(run.json, '0002')) push('NOT-NAMED', '[LDG-02/k4-no-child] 报文必须点名没子构案的那个产品 0002')
        if (namedIn(run.json, '0001')) push('NOT-NAMED', '[LDG-02/k4-no-child] 报文点名了 0001 —— 它有子构案，不该被点名')
      }
    }
    // ③ 已废构案不算子（只改状态那一格；指针两侧都翻，免得先红自洽）
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-02', tag: 'retired-child',
        spec: goodLedger({
          products: twoProducts,
          schemes: [
            childFor('0001'),
            { id: '0013', title: '被替的方案', parent: '0002', basisP: ['0002'], header: { 状态: '已废', superseded_by: '0014' } },
            { id: '0014', title: '接替的方案', parent: '0001', basisP: ['0001'], header: { supersedes: '0013' } },
          ],
        }),
      })
      if (expectCodes(problems, run, ['CHAIN-PRODUCT-NO-CHILD'], push, { label: 'LDG-02/retired-child' })) {
        if (!namedIn(run.json, '0002')) push('NOT-NAMED', '[LDG-02/retired-child] 已废的 0013 不算 0002 的子 ⇒ 必须点名 0002')
      }
    }
    // ④ 编号写在错的栏里：头自洽（§2.2-3）与链是两件事，两条各自成立、互不吞
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-02', tag: 'basis-wrong-column',
        spec: goodLedger({
          products: twoProducts,
          schemes: [childFor('0001'), { id: '0013', title: '写错栏的方案', parent: '0002', basisP: ['0001'], basisBug: ['—'] }],
        }),
      })
      if (expectCodes(problems, run, ['CHAIN-PRODUCT-NO-CHILD', 'SCHEME-PARENT-INCONSISTENT'], push, { label: 'LDG-02/basis-wrong-column' })) {
        if (!namedIn(run.json, '0002')) push('NOT-NAMED', '[LDG-02/basis-wrong-column] 两条红都必须点名 0002')
      }
    }
    // ⑤ 真树那一腿：读数里 unresolved 必须是 0，且没有本族的码
    {
      const real = realTreeReading({ withCheck: false })
      const run = runCheck(PATHS.repo)
      rec.readings.real = { tree: real, exit: run.exit, codes: codesOf(run.json), chain_product: run.json?.chain?.product ?? null }
      if (run.json !== null) {
        const chain = run.json?.chain?.product ?? null
        if (chain === null) push('CHAIN-READING-MISSING', '[真树] check 的读数里没有 chain.product（契约 §10.1：链的读数必须在）')
        else if (chain.unresolved !== 0) push('CHAIN-PRODUCT-NO-CHILD', `[真树] chain.product.unresolved = ${JSON.stringify(chain.unresolved)}（实得 ${JSON.stringify(chain)}）`)
        const bad = codesOf(run.json).filter((c) => c.startsWith('CHAIN-PRODUCT'))
        if (bad.length > 0) push('CHAIN-PRODUCT-NO-CHILD', `[真树] 产品链上还有 ${JSON.stringify(bad)}`)
      }
    }

    caseFail(problems)
  })
})

// ── LDG-03 ──────────────────────────────────────────────────────────────
test('LDG-03 缺陷→构案：关上的缺陷要么有构案引用、要么显式判假（刀：删引用 ⇒ 红且点名缺陷）', async () => {
  await runCase('LDG-03', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §5.2 的检查器（缺陷→构案这一条链只能由它判）')) {
      caseFail(problems)
      return
    }

    const bugA = 'bug-20261115-01'
    const bugB = 'bug-20261115-02'
    const bugC = 'bug-20261115-03'
    /** 三只缺陷：A 由构案关掉 / B 显式判假 / C 迁移历史。 */
    const threeBugs = () => ({
      days: [{
        day: '2026-11-15',
        events: [
          eventRegistered({ seq: 1, id: bugA }), eventAssessed({ seq: 2, id: bugA, verdict: 'true' }),
          eventDisposed({ seq: 3, id: bugA, value: 'adopted', extra: { 构案: '0012' } }),
          eventRegistered({ seq: 4, id: bugB }), eventAssessed({ seq: 5, id: bugB, verdict: 'false' }),
          eventDisposed({ seq: 6, id: bugB, value: 'rejected', extra: { 判假: '不是缺陷：夹具' } }),
          eventRegistered({ seq: 7, id: bugC }), eventAssessed({ seq: 8, id: bugC, verdict: 'true' }),
          eventDisposed({ seq: 9, id: bugC, value: 'adopted', extra: { 历史: 'adopted' } }),
        ],
      }],
    })
    const schemeKillsA = [{ id: '0012', title: '关掉 A 的方案', parent: '0001', basisP: ['0001'], basisBug: [bugA] }]

    // ① 三种记账各一条 ⇒ 绿；legacy_disposed 只数 C
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-03', tag: 'good',
        spec: goodLedger({ schemes: schemeKillsA, ...threeBugs() }),
      })
      if (expectCodes(problems, run, [], push, { label: 'LDG-03/good' })) {
        if (run.json?.legacy_disposed !== 1) push('LEGACY-COUNT-DRIFT', `[LDG-03/good] legacy_disposed 实得 ${JSON.stringify(run.json?.legacy_disposed)}，期望 1（只有 C 是历史）`)
      }
    }
    // ② 刀 K5：把 A 的 `构案` 那一格删掉 ⇒ 恰好一条 CHAIN-BUG-NO-SCHEME，点名 A（不许先红 BUG-EVENT-SHAPE）
    {
      const spec = goodLedger({ schemes: schemeKillsA, ...threeBugs() })
      spec.days[0].events[2] = eventDisposed({ seq: 3, id: bugA, value: 'adopted' }) // 三格全空
      const { run } = checkScene(problems, rec, { caseId: 'LDG-03', tag: 'k5-no-ref', spec })
      if (expectCodes(problems, run, ['CHAIN-BUG-NO-SCHEME'], push, { label: 'LDG-03/k5-no-ref' })) {
        if (!namedIn(run.json, bugA)) push('NOT-NAMED', '[LDG-03/k5-no-ref] 报文必须点名没着落的缺陷 A')
        if (namedIn(run.json, bugB) || namedIn(run.json, bugC)) push('NOT-NAMED', '[LDG-03/k5-no-ref] 报文点名了 B/C —— 它们各自有着落（判假 / 历史）')
      }
    }
    // ③ `构案` 指向不存在的编号 ⇒ DANGLING，点名两边
    // 同批：悬空的"结论"**不算关上了** —— `closed_by_scheme` 必须 0、`unresolved` 必须 1
    // （五组读数里把悬空算进 closed，等于让"关上了多少"比实际高）。
    {
      const spec = goodLedger({ schemes: schemeKillsA, ...threeBugs() })
      spec.days[0].events[2] = eventDisposed({ seq: 3, id: bugA, value: 'adopted', extra: { 构案: '9999' } })
      const { run } = checkScene(problems, rec, { caseId: 'LDG-03', tag: 'dangling', spec })
      if (expectCodes(problems, run, ['CHAIN-BUG-SCHEME-DANGLING'], push, { label: 'LDG-03/dangling' })) {
        if (!(namedIn(run.json, bugA) && namedIn(run.json, '9999'))) push('NOT-NAMED', '[LDG-03/dangling] 报文必须点名缺陷 A 与那个悬空编号 9999')
        const chain = run.json?.chain?.bug ?? null
        rec.readings.dangling = chain
        if (chain?.closed_by_scheme !== 0) push('CHAIN-READING-MISSING', `[LDG-03/dangling] chain.bug.closed_by_scheme 实得 ${JSON.stringify(chain?.closed_by_scheme ?? null)}，期望 0（悬空不算关上了）`)
        if (chain?.unresolved !== 1) push('CHAIN-READING-MISSING', `[LDG-03/dangling] chain.bug.unresolved 实得 ${JSON.stringify(chain?.unresolved ?? null)}，期望 1`)
        if (chain?.closed !== 0) push('CHAIN-READING-MISSING', `[LDG-03/dangling] chain.bug.closed 实得 ${JSON.stringify(chain?.closed ?? null)}，期望 0`)
      }
    }
    // ④ 构案没在 依据bug 里反向记着它 ⇒ NOT-RECIPROCAL，点名两边
    {
      const spec = goodLedger({ schemes: [{ id: '0012', title: '关掉 A 的方案', parent: '0001', basisP: ['0001'], basisBug: ['—'] }], ...threeBugs() })
      const { run } = checkScene(problems, rec, { caseId: 'LDG-03', tag: 'not-reciprocal', spec })
      if (expectCodes(problems, run, ['CHAIN-BUG-SCHEME-NOT-RECIPROCAL'], push, { label: 'LDG-03/not-reciprocal' })) {
        if (!(namedIn(run.json, bugA) && namedIn(run.json, '0012'))) push('NOT-NAMED', '[LDG-03/not-reciprocal] 报文必须点名缺陷 A 与构案 0012')
      }
    }
    // ⑤ 两个 disposed 没有重开 ⇒ BUG-FOLD-CONFLICT（"只追加"机器判得了的那一半）
    {
      const spec = goodLedger({ schemes: schemeKillsA, ...threeBugs() })
      spec.days[0].events.push(eventDisposed({ seq: 10, id: bugA, value: 'deferred', extra: { 构案: '0012' } }))
      const { run } = checkScene(problems, rec, { caseId: 'LDG-03', tag: 'double-dispose', spec })
      if (expectCodes(problems, run, ['BUG-FOLD-CONFLICT'], push, { label: 'LDG-03/double-dispose' })) {
        if (!namedIn(run.json, bugA)) push('NOT-NAMED', '[LDG-03/double-dispose] 报文必须点名重复处置的那条缺陷 A')
      }
    }
    // ⑤' `deferred`（暂缓）是**未结**：没有 `构案` / `判假` / `历史` 也不许红。
    // 但一张暂缓必须是**可执行的延期**（结构化 `due_at` + `owner` + `next_step`）。
    // 时钟注入：`--today=2026-11-15` 钉住「过期」判据的输入，不然这条夹具在 11-21 之后会自己变红。
    {
      const deferredOnly = {
        days: [{
          day: '2026-11-15',
          events: [
            eventRegistered({ seq: 1, id: bugA }),
            eventAssessed({ seq: 2, id: bugA, verdict: 'true' }),
            eventDisposed({
              seq: 3, id: bugA, value: 'deferred', reason: '到期 2026-11-20 · 暂缓，落点见结构字段',
              extra: { due_at: '2026-11-20', owner: '实现岗', next_step: '先给契约加一行，再实现' },
            }),
          ],
        }],
      }
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-03', tag: 'deferred-open', spec: goodLedger({ schemes: schemeKillsA, ...deferredOnly }),
        checkArgs: ['--today=2026-11-15'],
      })
      if (expectCodes(problems, run, [], push, { label: 'LDG-03/deferred-open' })) {
        const chain = run.json?.chain?.bug ?? null
        rec.readings.deferred_open = chain
        if (chain?.deferred !== 1) push('CHAIN-READING-MISSING', `[LDG-03/deferred-open] chain.bug.deferred 实得 ${JSON.stringify(chain?.deferred)}，期望 1（暂缓单独数，不算关上了）`)
        if (chain?.closed !== 0) push('CHAIN-READING-MISSING', `[LDG-03/deferred-open] chain.bug.closed 实得 ${JSON.stringify(chain?.closed)}，期望 0（deferred 不是结论）`)
        // 五组读数（契约 §10.1 r5）：这一棵树只有一条暂缓、没有结论
        const want = { closed_by_scheme: 0, closed_judged_false: 0, legacy_closed: 0, deferred_open: 1, legacy_frozen: 0 }
        for (const [k, v] of Object.entries(want)) {
          if (chain?.[k] !== v) push('CHAIN-READING-MISSING', `[LDG-03/deferred-open] chain.bug.${k} 实得 ${JSON.stringify(chain?.[k] ?? null)}，期望 ${v}`)
        }
        if (chain?.deferred_open_structured !== 1) push('CHAIN-READING-MISSING', `[LDG-03/deferred-open] chain.bug.deferred_open_structured 实得 ${JSON.stringify(chain?.deferred_open_structured ?? null)}，期望 1`)
      }
    }
    // ⑤'' 刀（r5）：暂缓缺 `owner` ⇒ 恰好 `DEFERRED-NO-LANDING-PLAN`（不许静默通过）
    {
      const spec = {
        days: [{
          day: '2026-11-15',
          events: [
            eventRegistered({ seq: 1, id: bugA }),
            eventAssessed({ seq: 2, id: bugA, verdict: 'true' }),
            eventDisposed({
              seq: 3, id: bugA, value: 'deferred', reason: '到期 2026-11-20 · 暂缓',
              extra: { due_at: '2026-11-20', next_step: '先给契约加一行，再实现' },
            }),
          ],
        }],
      }
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-03', tag: 'deferred-no-owner', spec: goodLedger({ schemes: schemeKillsA, ...spec }),
        checkArgs: ['--today=2026-11-15'],
      })
      rec.readings.deferred_no_owner = { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 240)) }
      if (expectCodes(problems, run, ['DEFERRED-NO-LANDING-PLAN'], push, { label: 'LDG-03/deferred-no-owner' })) {
        if (!namedIn(run.json, bugA)) push('NOT-NAMED', '[LDG-03/deferred-no-owner] 报文必须点名缺 owner 的那条缺陷')
        const p = (run.json?.problems ?? []).find((x) => x.code === 'DEFERRED-NO-LANDING-PLAN')
        if (JSON.stringify(p?.missing) !== JSON.stringify(['owner'])) push('NOT-NAMED', `[LDG-03/deferred-no-owner] 报文要点名缺的那一格 owner，实得 ${JSON.stringify(p?.missing ?? null)}`)
      }
    }
    // ⑤''' 刀（r5）：`due_at` 已过且之后没人动 ⇒ 恰好 `CHAIN-BUG-DEFERRED-OVERDUE`，点名 id + due_at
    {
      const overdue = {
        days: [{
          day: '2026-11-10',
          events: [
            eventRegistered({ seq: 1, id: bugA, at: '2026-11-10T09:00:00+08:00' }),
            eventAssessed({ seq: 2, id: bugA, at: '2026-11-10T10:00:00+08:00', verdict: 'true' }),
            eventDisposed({
              seq: 3, id: bugA, at: '2026-11-10T11:00:00+08:00', value: 'deferred', reason: '到期 2026-11-12 · 暂缓',
              extra: { due_at: '2026-11-12', owner: '实现岗', next_step: '先给契约加一行，再实现' },
            }),
          ],
        }],
      }
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-03', tag: 'deferred-overdue', spec: goodLedger({ schemes: schemeKillsA, ...overdue }),
        checkArgs: ['--today=2026-11-15'],
      })
      rec.readings.deferred_overdue = { exit: run.exit, codes: codesOf(run.json), chain_bug: run.json?.chain?.bug ?? null }
      if (expectCodes(problems, run, ['CHAIN-BUG-DEFERRED-OVERDUE'], push, { label: 'LDG-03/deferred-overdue' })) {
        const p = (run.json?.problems ?? []).find((x) => x.code === 'CHAIN-BUG-DEFERRED-OVERDUE')
        if (!namedIn(run.json, bugA)) push('NOT-NAMED', '[LDG-03/deferred-overdue] 报文必须点名过期的那条缺陷')
        if (p?.due_at !== '2026-11-12') push('NOT-NAMED', `[LDG-03/deferred-overdue] 报文要点名 due_at 2026-11-12，实得 ${JSON.stringify(p?.due_at ?? null)}`)
      }
    }
    // ⑤'''' 阳性格（r5）：同一棵树把今天拨回到到期日之前 ⇒ 不许红（刀不许永远红）
    {
      const overdue = {
        days: [{
          day: '2026-11-10',
          events: [
            eventRegistered({ seq: 1, id: bugA, at: '2026-11-10T09:00:00+08:00' }),
            eventAssessed({ seq: 2, id: bugA, at: '2026-11-10T10:00:00+08:00', verdict: 'true' }),
            eventDisposed({
              seq: 3, id: bugA, at: '2026-11-10T11:00:00+08:00', value: 'deferred', reason: '到期 2026-11-12 · 暂缓',
              extra: { due_at: '2026-11-12', owner: '实现岗', next_step: '先给契约加一行，再实现' },
            }),
          ],
        }],
      }
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-03', tag: 'deferred-not-yet-due', spec: goodLedger({ schemes: schemeKillsA, ...overdue }),
        checkArgs: ['--today=2026-11-12'],
      })
      rec.readings.deferred_not_yet_due = { exit: run.exit, codes: codesOf(run.json) }
      if (expectCodes(problems, run, [], push, { label: 'LDG-03/deferred-not-yet-due' })) {
        // 到期的**当天**不算过期（日期比较是 `<`），过期那一天起才红
        const chain = run.json?.chain?.bug ?? null
        if (chain?.deferred_open !== 1) push('CHAIN-READING-MISSING', `[LDG-03/deferred-not-yet-due] chain.bug.deferred_open 实得 ${JSON.stringify(chain?.deferred_open ?? null)}，期望 1`)
      }
    }
    // ⑥ 真树：legacy_disposed = 153（旧台账的每一条处置都显式标成历史）+ 本族 0 码
    {
      const run = runCheck(PATHS.repo)
      rec.readings.real = {
        exit: run.exit, codes: codesOf(run.json), chain_bug: run.json?.chain?.bug ?? null,
        legacy_disposed: run.json?.legacy_disposed ?? null,
      }
      if (run.json !== null) {
        if (run.json?.legacy_disposed !== 153) {
          push('LEGACY-COUNT-DRIFT', `[真树] legacy_disposed 实得 ${JSON.stringify(run.json?.legacy_disposed)}，期望 153（旧台账 153 条全部带处置；迁移必须逐条标成历史，契约 §3.2/§12-2）`)
        }
        const chain = run.json?.chain?.bug ?? null
        if (chain === null) push('CHAIN-READING-MISSING', '[真树] check 的读数里没有 chain.bug')
        else if (chain.unresolved !== 0) push('CHAIN-BUG-NO-SCHEME', `[真树] chain.bug.unresolved = ${JSON.stringify(chain.unresolved)}（实得 ${JSON.stringify(chain)}）`)
        // 五组真树读数（契约 §10.1 r5）：156 = 52 结论（全是 legacy）+ 104 暂缓（3 新 + 43 冻结 + 58 legacy 散文）
        if (chain !== null) {
          const want = {
            closed_by_scheme: 0, closed_judged_false: 0, legacy_closed: 52,
            deferred_open: 61, legacy_frozen: 43, deferred_open_structured: 3,
          }
          for (const [k, v] of Object.entries(want)) {
            if (chain[k] !== v) push('CHAIN-READING-MISSING', `[真树] chain.bug.${k} 实得 ${JSON.stringify(chain[k] ?? null)}，期望 ${v}`)
          }
          // 算术闭合：closed = 前三组；deferred = 后两组；两数和 = 有处置的条数
          if (chain.closed !== chain.closed_by_scheme + chain.closed_judged_false + chain.legacy_closed) {
            push('CHAIN-READING-MISSING', `[真树] chain.bug.closed ${JSON.stringify(chain.closed)} ≠ 三组之和 ${chain.closed_by_scheme + chain.closed_judged_false + chain.legacy_closed}`)
          }
          if (chain.deferred !== chain.deferred_open + chain.legacy_frozen) {
            push('CHAIN-READING-MISSING', `[真树] chain.bug.deferred ${JSON.stringify(chain.deferred)} ≠ deferred_open + legacy_frozen ${chain.deferred_open + chain.legacy_frozen}`)
          }
          if (chain.closed + chain.deferred !== 156) {
            push('CHAIN-READING-MISSING', `[真树] closed ${chain.closed} + deferred ${chain.deferred} 实得 ${chain.closed + chain.deferred}，期望 156（每一条处置都在某一组里）`)
          }
        }
      }
    }

    caseFail(problems)
  })
})
