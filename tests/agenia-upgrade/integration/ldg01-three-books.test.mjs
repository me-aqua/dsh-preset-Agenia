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
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { before, test } from 'node:test'
import { FROZEN, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runId, runRoot } from '../support/evidence.mjs'
import { ensureMarkedDir } from '../support/root-guard.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import {
  BOOKS, CHECK, LEDGER_REL, buildScene, codesOf, eventAssessed, eventDisposed, eventRegistered,
  expectCodes, indexMarkerReading, messagesOf, namedIn, productText, readJson, readText, runBugRead, runCheck, runFold,
  runIndex, schemeText, toolPresent,
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

/** 真 CLI 的夹具时钟：`registered` / `disposed` 的 `at` 全钉在同一天（过期判据另给 `--today`）。 */
const CLI_NOW = '2026-11-15T12:00:00+08:00'

/**
 * 给 `agenia-route.mjs` 的夹具根补 marker + 注入时钟。
 * 真 CLI 在测试模式里只认带 marker 的根（根守卫）；时钟文件让 `at` / `registered_at` 可复现。
 */
function bookCliScene(caseId, tag, spec) {
  const scene = buildScene({ caseId, tag, ...spec })
  ensureMarkedDir(scene.root, { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
  const nowFile = path.join(scene.root, '.team-now.txt')
  writeFileSync(nowFile, `${CLI_NOW}\n`, 'utf8')
  return { scene, nowFile, env: { ...process.env, AGENIA_NOW_FILE: nowFile } }
}

/** 一天的原始事件（读不出来 ⇒ `null`，刀会当场红）。 */
function dayEventsOf(root) {
  const file = path.join(root, LEDGER_REL, '缺陷', '2026-11-15.json')
  const read = readJson(file)
  return read.ok && Array.isArray(read.json?.events) ? read.json.events : null
}

/**
 * **整棵 `账本/缺陷/` 的字节快照**（rel → sha256，含 `INDEX.md` 与子目录）。
 *
 * 零写入刀只量一个日文件时，「别的日文件被写」与「什么都没写」同形（第 4 关 r5 · N-11）；
 * 这里量的是整棵树 —— 被拒的那一次只要动了任何一份，快照就不同。
 */
function bugBookSnapshot(root) {
  const dir = path.join(root, LEDGER_REL, '缺陷')
  const files = {}
  const walk = (abs, prefix) => {
    if (!existsSync(abs)) return
    for (const name of readdirSync(abs).sort()) {
      const child = path.join(abs, name)
      const rel = prefix === '' ? name : `${prefix}/${name}`
      if (statSync(child).isDirectory()) walk(child, rel)
      else files[rel] = createHash('sha256').update(readFileSync(child)).digest('hex')
    }
  }
  walk(dir, '')
  return files
}
const sameSnapshot = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 落地计划三格**只有一个定义**（`LANDING_PLAN_KEYS` 在折叠库导出，写入口 import）。
 *
 * 两处各写一份键表时，改一处 = 没改：写入口收、折叠不收（或反过来），而今天不会有任何读数变红。
 * 判三件：折叠库里恰好一处 `export const LANDING_PLAN_KEYS`（值 = 契约的三格）· 写入口没有第二份
 * 定义 · 写入口确实从折叠库 import 它。刀：往写入口插一份定义 / 改折叠那份的值 ⇒ 各红一处。
 */
function landingPlanSingleSourceProblems({ foldText, routeText }) {
  const problems = []
  const frozenKeys = ['due_at', 'owner', 'next_step']
  const defs = [...foldText.matchAll(/LANDING_PLAN_KEYS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/gu)]
  if (defs.length !== 1) problems.push(`折叠库里 \`LANDING_PLAN_KEYS\` 定义应恰好 1 处，实得 ${defs.length} 处`)
  const exported = /export const LANDING_PLAN_KEYS = Object\.freeze\(\[([^\]]*)\]\)/u.exec(foldText)
  if (exported === null) {
    problems.push('折叠库没有 `export const LANDING_PLAN_KEYS`（写入口没有可 import 的真源）')
  } else {
    const keys = exported[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/gu, '')).filter(Boolean)
    if (JSON.stringify(keys) !== JSON.stringify(frozenKeys)) {
      problems.push(`折叠库的 \`LANDING_PLAN_KEYS\` 实得 ${JSON.stringify(keys)}，期望 ${JSON.stringify(frozenKeys)}（契约 §5.2.1）`)
    }
  }
  if (/const\s+LANDING_PLAN_KEYS\s*=/u.test(routeText)) problems.push('写入口又在本地定义了一份 `LANDING_PLAN_KEYS`（要 import，不许抄）')
  if (!/import\s*\{[^}]*LANDING_PLAN_KEYS[^}]*\}\s*from\s*'\.\.\/lib\/缺陷折叠\.mjs'/u.test(routeText)) {
    problems.push('写入口没有从 `../lib/缺陷折叠.mjs` import `LANDING_PLAN_KEYS`')
  }
  return problems
}

/** 把真树的 `账本/` 逐文件拷进一棵夹具根（对照刀要在**真数据的形状**上跑，而不写活树）。 */
function copyRealBook(caseId, tag) {
  const scene = buildScene({ caseId, tag, team: true })
  const copyDir = (src, dst) => {
    mkdirSync(dst, { recursive: true })
    for (const name of readdirSync(src).sort()) {
      const from = path.join(src, name)
      const to = path.join(dst, name)
      if (statSync(from).isDirectory()) copyDir(from, to)
      else copyFileSync(from, to)
    }
  }
  copyDir(path.join(PATHS.repo, LEDGER_REL), path.join(scene.root, LEDGER_REL))
  ensureMarkedDir(scene.root, { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
  const nowFile = path.join(scene.root, '.team-now.txt')
  writeFileSync(nowFile, '2026-11-16T09:00:00+08:00\n', 'utf8')
  return { scene, env: { ...process.env, AGENIA_NOW_FILE: nowFile } }
}

/** 一条「有落地计划的暂缓」（重开刀与 reopen-without-dispose 的起点）。 */
function plannedDeferred({ due = '2026-11-20', id = BUG } = {}) {
  return {
    days: [{
      day: '2026-11-15',
      events: [
        eventRegistered({
          seq: 1, id, at: '2026-11-15T09:00:00+08:00',
          extra: {
            reporter: '组长',
            source: { carrier: 'leader', ref: 'fixture/reg' },
            tags: ['ledger'],
            how_seen: '夹具：怎么撞见的',
            evidence: [{ kind: 'file', ref: 'fixture/evidence.log' }],
          },
        }),
        eventAssessed({ seq: 2, id, at: '2026-11-15T10:00:00+08:00', verdict: 'true' }),
        eventDisposed({
          seq: 3, id, at: '2026-11-15T11:00:00+08:00', value: 'deferred', reason: '夹具：暂缓（有落地计划）',
          extra: { due_at: due, owner: '实现岗', next_step: '先给契约加一行，再实现' },
        }),
      ],
    }],
  }
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
        // 这棵树三条结论：A 悬空 / B 判假 / C 历史 ⇒ closed 只数 B、C 两条
        if (chain?.closed !== 2) push('CHAIN-READING-MISSING', `[LDG-03/dangling] chain.bug.closed 实得 ${JSON.stringify(chain?.closed ?? null)}，期望 2（B 判假 + C 历史；A 悬空进 unresolved）`)
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
    // ⑤'' 刀（r5/r6）：新 `deferred` 缺 `due_at` / `owner` / `next_step` 任一格 ⇒ 折叠红
    // （三条腿都要；只测一格会让"漏另一格"静默绿 —— `cand-20261107-0222` 的负控口径）
    const PLAN = { due_at: '2026-11-20', owner: '实现岗', next_step: '先给契约加一行，再实现' }
    rec.readings.deferred_missing = {}
    for (const missingKey of ['due_at', 'owner', 'next_step']) {
      const extra = { ...PLAN }
      delete extra[missingKey]
      const spec = {
        days: [{
          day: '2026-11-15',
          events: [
            eventRegistered({ seq: 1, id: bugA }),
            eventAssessed({ seq: 2, id: bugA, verdict: 'true' }),
            eventDisposed({ seq: 3, id: bugA, value: 'deferred', reason: '到期 2026-11-20 · 暂缓', extra }),
          ],
        }],
      }
      const tag = `deferred-missing-${missingKey}`
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-03', tag, spec: goodLedger({ schemes: schemeKillsA, ...spec }),
        checkArgs: ['--today=2026-11-15'],
      })
      rec.readings.deferred_missing[missingKey] = {
        exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 240)),
      }
      if (expectCodes(problems, run, ['DEFERRED-NO-LANDING-PLAN'], push, { label: `LDG-03/${tag}` })) {
        if (!namedIn(run.json, bugA)) push('NOT-NAMED', `[LDG-03/${tag}] 报文必须点名缺 ${missingKey} 的那条缺陷`)
        const p = (run.json?.problems ?? []).find((x) => x.code === 'DEFERRED-NO-LANDING-PLAN')
        if (JSON.stringify(p?.missing) !== JSON.stringify([missingKey])) {
          push('NOT-NAMED', `[LDG-03/${tag}] 报文要点名缺的那一格 ${missingKey}，实得 ${JSON.stringify(p?.missing ?? null)}`)
        }
      }
    }
    // ⑤''' 刀（r6·写入口）：同一件事走真 CLI —— 缺任一格 ⇒ `E_ARG_SCHEMA` + **零写入**。
    // 只判校验器那一半不够：写入口放行时，人写得出一个必然红的 deferred（规则与工具互相打脸）。
    rec.readings.dispose_missing_cli = {}
    for (const missingKey of ['due_at', 'owner', 'next_step']) {
      const tag = `cli-deferred-missing-${missingKey}`
      const { scene, env } = bookCliScene('LDG-03', tag, goodLedger({
        days: [{
          day: '2026-11-15',
          events: [
            eventRegistered({ seq: 1, id: bugA, at: '2026-11-15T09:00:00+08:00' }),
            eventAssessed({ seq: 2, id: bugA, at: '2026-11-15T10:00:00+08:00', verdict: 'true' }),
          ],
        }],
      }))
      runIndex(scene.root)
      // 零写入量的**整棵 `账本/缺陷/`**（含 `INDEX.md` 与别的日文件）—— 不是只量这一个日文件。
      const before = bugBookSnapshot(scene.root)
      const payload = { id: bugA, disposition: 'deferred', reason: '夹具：暂缓', by_role: 'leader', ...PLAN }
      delete payload[missingKey]
      const res = await runRoute('LDG-03', 'bug-dispose', payload, { workspace: scene.root, env })
      const after = bugBookSnapshot(scene.root)
      const code = res?.json?.error?.code ?? null
      rec.readings.dispose_missing_cli[missingKey] = {
        exit: res?.exit_code ?? null, code, event_written: !sameSnapshot(before, after),
        files: Object.keys(before).length,
        events: dayEventsOf(scene.root)?.length ?? null,
      }
      if (res?.exit_code !== 2 || code !== 'E_ARG_SCHEMA') {
        push('KNIFE-NO-BITE', `[LDG-03/${tag}] 新 deferred 缺 ${missingKey} 时 CLI 必须拒（exit 2 / E_ARG_SCHEMA），实得 exit=${res?.exit_code} / ${JSON.stringify(code)} / ${JSON.stringify(messagesOf(res?.json ?? {}).slice(0, 2))}`)
      }
      if (!sameSnapshot(before, after)) {
        push('KNIFE-WROTE', `[LDG-03/${tag}] 被拒的那一次改写了 \`账本/缺陷/\` —— fail-closed 要求零写入（改动 ${JSON.stringify(Object.keys(after).filter((k) => before[k] !== after[k]).slice(0, 6))}）`)
      }
    }
    // ⑤'''' 刀（r6）：重开再处置 —— `bug-reopen` 追加 `registered`，之后 `bug-dispose` 才允许；
    // 折叠不报 `BUG-FOLD-CONFLICT`，新 disposed 带齐落地计划三格。
    {
      const { scene, env } = bookCliScene('LDG-03', 'reopen-then-dispose', goodLedger({ schemes: schemeKillsA, ...plannedDeferred() }))
      runIndex(scene.root)
      const before = bugBookSnapshot(scene.root)
      // 重开之前直接再处置 ⇒ 写入口先挡（不写一条必然冲突的流）
      const blocked = await runRoute('LDG-03', 'bug-dispose', {
        id: bugA, disposition: 'deferred', reason: '夹具：没重开就再处置', by_role: 'leader',
        due_at: '2026-11-21', owner: '实现岗', next_step: '不该写进去',
      }, { workspace: scene.root, env })
      const blockedCode = blocked?.json?.error?.code ?? null
      const afterBlocked = bugBookSnapshot(scene.root)
      const reopened = await runRoute('LDG-03', 'bug-reopen', {
        id: bugA, reason: '夹具：重开后重新规划落地', by_role: 'leader',
      }, { workspace: scene.root, env })
      const disposed = await runRoute('LDG-03', 'bug-dispose', {
        id: bugA, disposition: 'deferred', reason: '夹具：重开后的新落地计划', by_role: 'leader',
        due_at: '2026-11-21', owner: '实现岗', next_step: '重开后再做一次',
      }, { workspace: scene.root, env })
      const run = runCheck(scene.root, ['--today=2026-11-15'])
      const events = dayEventsOf(scene.root) ?? []
      const seqReopen = events.find((e) => e.seq === 4)
      const seqDispose = events.find((e) => e.seq === 5)
      rec.readings.reopen_then_dispose = {
        root: scene.root,
        blocked: { exit: blocked?.exit_code ?? null, code: blockedCode, events_unchanged: JSON.stringify(before) === JSON.stringify(afterBlocked) },
        reopen: { exit: reopened?.exit_code ?? null, ok: reopened?.json?.ok ?? null, event_seq: reopened?.json?.event_seq ?? null, voided_due_at: reopened?.json?.voided_due_at ?? null },
        dispose: { exit: disposed?.exit_code ?? null, ok: disposed?.json?.ok ?? null },
        check: { exit: run.exit, codes: codesOf(run.json), chain: run.json?.chain?.bug ?? null },
        seq4: seqReopen === undefined ? null : { kind: seqReopen.kind, reopened: seqReopen.reopened, phenomenon: seqReopen.phenomenon, reopen_reason: seqReopen.reopen_reason },
        seq5: seqDispose === undefined ? null : { kind: seqDispose.kind, due_at: seqDispose.due_at, owner: seqDispose.owner, next_step: seqDispose.next_step },
      }
      if (blocked?.exit_code !== 2 || blockedCode !== 'E_ARG_SCHEMA') {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-then-dispose] 没重开就再处置必须被写入口拒（exit 2 / E_ARG_SCHEMA），实得 exit=${blocked?.exit_code} / ${JSON.stringify(blockedCode)}`)
      }
      if (JSON.stringify(before) !== JSON.stringify(afterBlocked)) {
        push('KNIFE-WROTE', '[LDG-03/reopen-then-dispose] 被拒的第二次处置改写了事件流 —— 应零写入')
      }
      if (reopened?.exit_code !== 0 || reopened?.json?.event_seq !== 4) {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-then-dispose] bug-reopen 必须成功并落 seq 4，实得 exit=${reopened?.exit_code} / event_seq=${JSON.stringify(reopened?.json?.event_seq ?? null)} / ${JSON.stringify(reopened?.json ?? null)?.slice(0, 240)}`)
      } else if (reopened?.json?.voided_due_at !== '2026-11-20') {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-then-dispose] 重开要报出被作废的旧 due_at 2026-11-20，实得 ${JSON.stringify(reopened?.json?.voided_due_at ?? null)}`)
      }
      if (disposed?.exit_code !== 0) {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-then-dispose] 重开之后 bug-dispose 必须成功，实得 exit=${disposed?.exit_code} / ${JSON.stringify(disposed?.json ?? null)?.slice(0, 240)}`)
      }
      if (seqReopen === undefined || seqReopen.kind !== 'registered' || seqReopen.reopened !== true) {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-then-dispose] 重开事件必须是 registered 且 reopened:true，实得 ${JSON.stringify(seqReopen ?? null)}`)
      } else {
        // 原 phenomenon 逐字带过来（重开不许改写现象）
        if (seqReopen.phenomenon !== '夹具现象') push('NOT-NAMED', `[LDG-03/reopen-then-dispose] 重开事件的 phenomenon 必须逐字带原值「夹具现象」，实得 ${JSON.stringify(seqReopen.phenomenon)}`)
        if (typeof seqReopen.reopen_reason !== 'string' || seqReopen.reopen_reason.trim() === '') push('NOT-NAMED', '[LDG-03/reopen-then-dispose] 重开事件缺 reopen_reason')
      }
      if (seqDispose === undefined || seqDispose.kind !== 'disposed' || seqDispose.due_at !== '2026-11-21' || seqDispose.owner !== '实现岗' || seqDispose.next_step !== '重开后再做一次') {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-then-dispose] 重开后的 disposed 必须把三格写进事件顶层，实得 ${JSON.stringify(seqDispose ?? null)}`)
      }
      if (expectCodes(problems, run, [], push, { label: 'LDG-03/reopen-then-dispose' })) {
        if (run.json?.chain?.bug?.deferred !== 1) push('CHAIN-READING-MISSING', `[LDG-03/reopen-then-dispose] chain.bug.deferred 实得 ${JSON.stringify(run.json?.chain?.bug?.deferred ?? null)}，期望 1`)
      }
    }
    // ⑤''''' 刀（r6）：重开但不处置 ⇒ 读数如实（不是关着）：折叠 disposition=null、链不计暂缓、读面 open。
    {
      const { scene, env } = bookCliScene('LDG-03', 'reopen-without-dispose', goodLedger({ schemes: schemeKillsA, ...plannedDeferred() }))
      runIndex(scene.root)
      const reopened = await runRoute('LDG-03', 'bug-reopen', { id: bugA, reason: '夹具：只重开、不处置', by_role: 'leader' }, { workspace: scene.root, env })
      runIndex(scene.root) // 派生页必须跟着新现状走（重开之后页上不能还印着旧处置）
      const fold = runFold(scene.root)
      const run = runCheck(scene.root, ['--today=2026-11-15'])
      const read = runBugRead(scene.root)
      const state = Array.isArray(fold.json?.states) ? fold.json.states.find((s) => s.id === bugA) : undefined
      const entry = Array.isArray(read.json?.ledger?.entries) ? read.json.ledger.entries.find((e) => e.id === bugA) : undefined
      rec.readings.reopen_without_dispose = {
        root: scene.root,
        reopen: { exit: reopened?.exit_code ?? null, ok: reopened?.json?.ok ?? null, event_seq: reopened?.json?.event_seq ?? null },
        fold: {
          exit: fold.exit, codes: codesOf(fold.json),
          disposition: state?.disposition ?? null, disposed_payload: state?.disposed_payload ?? null, chain: state?.chain ?? null,
        },
        check: { exit: run.exit, codes: codesOf(run.json), chain: run.json?.chain?.bug ?? null },
        read: { exit: read.exit, counts: read.json?.counts ?? null, disposition: entry?.disposition ?? null, how_seen: entry?.how_seen ?? null },
      }
      if (reopened?.exit_code !== 0 || reopened?.json?.event_seq !== 4) {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-without-dispose] bug-reopen 必须成功并落 seq 4，实得 exit=${reopened?.exit_code} / event_seq=${JSON.stringify(reopened?.json?.event_seq ?? null)}`)
      }
      if (state === undefined || state.disposition !== null || state.disposed_payload !== null || state.chain?.kind !== null) {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-without-dispose] 重开不处置时折叠必须把旧处置清空（disposition=null / disposed_payload=null / chain.kind=null），实得 ${JSON.stringify({ disposition: state?.disposition ?? null, disposed_payload: state?.disposed_payload ?? null, chain: state?.chain ?? null })}`)
      }
      if (expectCodes(problems, run, [], push, { label: 'LDG-03/reopen-without-dispose' })) {
        if (run.json?.chain?.bug?.deferred !== 0) push('CHAIN-READING-MISSING', `[LDG-03/reopen-without-dispose] 重开不处置时 chain.bug.deferred 实得 ${JSON.stringify(run.json?.chain?.bug?.deferred ?? null)}，期望 0（不许假装关着）`)
        if (run.json?.chain?.bug?.closed !== 0) push('CHAIN-READING-MISSING', `[LDG-03/reopen-without-dispose] chain.bug.closed 实得 ${JSON.stringify(run.json?.chain?.bug?.closed ?? null)}，期望 0`)
      }
      if (entry === undefined || entry.disposition !== null || (entry?.how_seen ?? '') === '') {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-without-dispose] 读面必须把重开的票读成 open（disposition=null）且保留登记字段，实得 ${JSON.stringify({ disposition: entry?.disposition ?? null, how_seen: entry?.how_seen ?? null })}`)
      }
      if (read.json?.counts?.bug_open !== 1) {
        push('KNIFE-NO-BITE', `[LDG-03/reopen-without-dispose] bug-read 的 counts.bug_open 实得 ${JSON.stringify(read.json?.counts?.bug_open ?? null)}，期望 1`)
      }
    }
    // ⑤''''''' 刀（r7）：`dueOk` 判**整串**（不是前 10 字符）—— `2026-11-1` 与 `2026-11-16` 不是同一天；
    // 带杂尾巴 / 25 点的 ISO 必须拒；写入口同批拒（`E_ARG_SCHEMA` + 整棵 `账本/缺陷/` 零写入），有效日期照收。
    {
      const foldLib = await loadStagedModule('lib/缺陷折叠.mjs', ['dueOk', 'LANDING_PLAN_KEYS'])
      const dueOk = foldLib.mod?.dueOk ?? null
      const cases = [
        ['2026-11-16', true],
        ['2026-11-16T09:00:00+08:00', true],
        ['2026-11-1', false],
        ['2026-11-16junk', false],
        ['2026-11-16T25:00:00Z', false],
      ]
      rec.readings.due_ok = { surface_missing: foldLib.surfaceMissing, missing: foldLib.missing, cases: [] }
      if (typeof dueOk !== 'function') {
        push('SUT-SURFACE-MISSING', `[LDG-03/due-ok] staged \`lib/缺陷折叠.mjs\` 没导出 \`dueOk\`（缺：${JSON.stringify(foldLib.missing)}）`)
      } else {
        for (const [value, want] of cases) {
          const got = dueOk(value)
          rec.readings.due_ok.cases.push({ value, want, got })
          if (got !== want) push('KNIFE-NO-BITE', `[LDG-03/due-ok] \`dueOk(${JSON.stringify(value)})\` 实得 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}（整串校验，契约 §5.2.1）`)
        }
        // 组长那张卡的原话刀：这两个**不许判成同一天**。
        if (dueOk('2026-11-1') === dueOk('2026-11-16')) {
          push('KNIFE-NO-BITE', '[LDG-03/due-ok] `2026-11-1` 与 `2026-11-16` 被判成了同一格 —— `dueOk` 还在只看前 10 字符')
        }
      }
      // 写入口那一半：同一个槽位，junk 拒 + 有效日期收（同一棵树，先拒后收）。
      const { scene, env } = bookCliScene('LDG-03', 'due-ok-cli', goodLedger({
        days: [{
          day: '2026-11-15',
          events: [
            eventRegistered({ seq: 1, id: bugA, at: '2026-11-15T09:00:00+08:00' }),
            eventAssessed({ seq: 2, id: bugA, at: '2026-11-15T10:00:00+08:00', verdict: 'true' }),
          ],
        }],
      }))
      const before = bugBookSnapshot(scene.root)
      const junk = await runRoute('LDG-03', 'bug-dispose', {
        id: bugA, disposition: 'deferred', reason: '夹具：junk 日期', by_role: 'leader',
        due_at: '2026-11-16junk', owner: '实现岗', next_step: '不该写进去',
      }, { workspace: scene.root, env })
      const afterJunk = bugBookSnapshot(scene.root)
      const ok = await runRoute('LDG-03', 'bug-dispose', {
        id: bugA, disposition: 'deferred', reason: '夹具：有效日期', by_role: 'leader',
        due_at: '2026-11-16', owner: '实现岗', next_step: '收',
      }, { workspace: scene.root, env })
      const afterOk = bugBookSnapshot(scene.root)
      rec.readings.due_ok.cli = {
        junk: { exit: junk?.exit_code ?? null, code: junk?.json?.error?.code ?? null, wrote: !sameSnapshot(before, afterJunk) },
        ok: { exit: ok?.exit_code ?? null, wrote: !sameSnapshot(afterJunk, afterOk) },
      }
      if (junk?.exit_code !== 2 || (junk?.json?.error?.code ?? null) !== 'E_ARG_SCHEMA') {
        push('KNIFE-NO-BITE', `[LDG-03/due-ok-cli] \`due_at: "2026-11-16junk"\` 必须被写入口拒（exit 2 / E_ARG_SCHEMA），实得 exit=${junk?.exit_code} / ${JSON.stringify(junk?.json?.error?.code ?? null)}`)
      }
      if (!sameSnapshot(before, afterJunk)) {
        push('KNIFE-WROTE', `[LDG-03/due-ok-cli] 被拒的 junk 日期改写了 \`账本/缺陷/\`（改动 ${JSON.stringify(Object.keys(afterJunk).filter((k) => before[k] !== afterJunk[k]).slice(0, 6))}）`)
      }
      if (ok?.exit_code !== 0 || sameSnapshot(afterJunk, afterOk)) {
        push('KNIFE-NO-BITE', `[LDG-03/due-ok-cli] 同一条票带有效日期必须照收（exit 0 且写盘），实得 exit=${ok?.exit_code} / wrote=${!sameSnapshot(afterJunk, afterOk)}`)
      }
    }
    // ⑤'''''''' 刀（r7）：落地计划三格**单一来源**（折叠导出 `LANDING_PLAN_KEYS`，写入口 import）；
    // 刀：往写入口插一份定义 / 改折叠那份的值 ⇒ 各红一处。
    {
      const foldText = readText(path.join(PATHS.repo, 'presets', 'agenia', 'lib', '缺陷折叠.mjs'))
      const routeText = readText(path.join(PATHS.repo, 'presets', 'agenia', 'bin', 'agenia-route.mjs'))
      const clean = landingPlanSingleSourceProblems({ foldText, routeText })
      const dupRoute = landingPlanSingleSourceProblems({
        foldText,
        routeText: routeText.replace('function landingPlanOf(payload) {', "const LANDING_PLAN_KEYS = Object.freeze(['due_at', 'owner'])\nfunction landingPlanOf(payload) {"),
      })
      const shortFold = landingPlanSingleSourceProblems({
        foldText: foldText.replace("export const LANDING_PLAN_KEYS = Object.freeze(['due_at', 'owner', 'next_step'])", "export const LANDING_PLAN_KEYS = Object.freeze(['due_at', 'owner'])"),
        routeText,
      })
      rec.readings.landing_plan_single_source = { clean, dup_route: dupRoute, short_fold: shortFold }
      if (clean.length > 0) push('LANDING-PLAN-NOT-SINGLE-SOURCE', `[LDG-03/landing-plan] 三格键表不是单一来源：${JSON.stringify(clean)}`)
      if (dupRoute.length === 0) push('KNIFE-NO-BITE', '[LDG-03/landing-plan] 往写入口插一份 `LANDING_PLAN_KEYS` 定义后判据没红（刀不咬）')
      if (shortFold.length === 0) push('KNIFE-NO-BITE', '[LDG-03/landing-plan] 把折叠那份键表改成两格后判据没红（刀不咬）')
    }
    // ⑤'''''' 刀（r7）：**迁移 legacy 票重开必须被写入口拒**（具名码 + 整棵 `账本/缺陷/` 零写入）；
    // 对照 = 迁移后的 `-06` 照旧能重开、再处置。判定跑在抢锁前 ⇒ 连锁文件都不该出现。
    {
      const legacyOnly = {
        days: [{
          day: '2026-11-15',
          events: [
            eventRegistered({ seq: 1, id: bugA, at: '2026-11-15T09:00:00+08:00' }),
            eventAssessed({ seq: 2, id: bugA, at: '2026-11-15T10:00:00+08:00', verdict: 'true' }),
            eventDisposed({ seq: 3, id: bugA, at: '2026-11-15T11:00:00+08:00', value: 'adopted', extra: { 历史: 'adopted' } }),
          ],
        }],
      }
      const { scene, env } = bookCliScene('LDG-03', 'legacy-reopen', goodLedger({ schemes: schemeKillsA, ...legacyOnly }))
      runIndex(scene.root)
      const before = bugBookSnapshot(scene.root)
      const beforeCheck = runCheck(scene.root, ['--today=2026-11-15'])
      const res = await runRoute('LDG-03', 'bug-reopen', {
        id: bugA, reason: '夹具：legacy 票重开必须被拒', by_role: 'leader',
      }, { workspace: scene.root, env })
      const after = bugBookSnapshot(scene.root)
      const code = res?.json?.error?.code ?? null
      const lock = path.join(scene.root, '.team', 'bug', '.bug.lock')
      rec.readings.legacy_reopen = {
        root: scene.root,
        book_files: Object.keys(before).length,
        check: { exit: beforeCheck.exit, codes: codesOf(beforeCheck.json), legacy_disposed: beforeCheck.json?.legacy_disposed ?? null },
        exit: res?.exit_code ?? null,
        code,
        events_unchanged: sameSnapshot(before, after),
        lock_left: existsSync(lock),
        error_head: messagesOf(res?.json ?? {}).map((m) => m.slice(0, 240)),
      }
      if (Object.keys(before).length === 0) push('KNIFE-NO-BITE', '[LDG-03/legacy-reopen] 量具没读到任何事件流文件 —— 这把刀什么都没量')
      if (beforeCheck.json?.legacy_disposed !== 1) {
        push('LEGACY-COUNT-DRIFT', `[LDG-03/legacy-reopen] 夹具的 legacy_disposed 实得 ${JSON.stringify(beforeCheck.json?.legacy_disposed ?? null)}，期望 1（刀要站在一条真的 legacy 票上）`)
      }
      if (res?.exit_code !== FROZEN.exitCodes.E_BUG_REOPEN_LEGACY || code !== 'E_BUG_REOPEN_LEGACY') {
        push('KNIFE-NO-BITE', `[LDG-03/legacy-reopen] legacy 票重开必须被拒（exit ${FROZEN.exitCodes.E_BUG_REOPEN_LEGACY} / E_BUG_REOPEN_LEGACY），实得 exit=${res?.exit_code} / ${JSON.stringify(code)} / ${JSON.stringify(messagesOf(res?.json ?? {}).slice(0, 2))}`)
      }
      if (!sameSnapshot(before, after)) {
        push('KNIFE-WROTE', `[LDG-03/legacy-reopen] 被拒的重开改写了 \`账本/缺陷/\` —— 零写入是这条拒的卖点（改动 ${JSON.stringify(Object.keys(after).filter((k) => before[k] !== after[k]).slice(0, 6))}）`)
      }
      if (existsSync(lock)) push('KNIFE-WROTE', '[LDG-03/legacy-reopen] 被拒的重开留下了 `.team/bug/.bug.lock` —— 判定必须在抢锁之前')
      // 量具自检：**别的日文件**被改必须让快照变（只量一个日文件时这一格是死的）。
      {
        const probe = buildScene({
          caseId: 'LDG-03', tag: 'zero-write-scope-probe',
          days: [
            { day: '2026-11-14', events: [eventRegistered({ seq: 1, id: 'bug-20261114-01', at: '2026-11-14T09:00:00+08:00' })] },
            { day: '2026-11-15', events: [eventRegistered({ seq: 1, id: bugA, at: '2026-11-15T09:00:00+08:00' })] },
          ],
        })
        const p0 = bugBookSnapshot(probe.root)
        appendFileSync(path.join(probe.root, LEDGER_REL, '缺陷', '2026-11-14.json'), '\n')
        const p1 = bugBookSnapshot(probe.root)
        rec.readings.zero_write_scope = { files: Object.keys(p0).length, caught_other_day: !sameSnapshot(p0, p1) }
        if (Object.keys(p0).length < 2) push('KNIFE-NO-BITE', `[LDG-03/legacy-reopen] 零写入量具只覆盖 ${Object.keys(p0).length} 份文件，量不到「别的日文件」`)
        if (sameSnapshot(p0, p1)) push('KNIFE-NO-BITE', '[LDG-03/legacy-reopen] 改掉另一天的事件流后快照没变 —— 零写入量具只盯着一个日文件')
      }
    }
    // 对照（r7）：真书副本里 `bug-20261115-06`（迁移后）照旧能重开、再处置，check 绿。
    {
      const { scene, env } = copyRealBook('LDG-03', 'legacy-reopen-control-06')
      const reopened = await runRoute('LDG-03', 'bug-reopen', {
        id: 'bug-20261115-06', reason: '夹具：迁移后的票照旧可重开（对照）', by_role: 'leader',
      }, { workspace: scene.root, env })
      const disposed = await runRoute('LDG-03', 'bug-dispose', {
        id: 'bug-20261115-06', disposition: 'deferred', reason: '夹具：对照重开后的再处置', by_role: 'leader',
        due_at: '2026-11-18', owner: '实现岗', next_step: '夹具：对照的下一步',
      }, { workspace: scene.root, env })
      runIndex(scene.root)
      const run = runCheck(scene.root, ['--today=2026-11-16'])
      rec.readings.legacy_reopen_control = {
        root: scene.root,
        reopen: { exit: reopened?.exit_code ?? null, event_seq: reopened?.json?.event_seq ?? null },
        dispose: { exit: disposed?.exit_code ?? null, event_seq: disposed?.json?.event_seq ?? null },
        check: { exit: run.exit, codes: codesOf(run.json), legacy_disposed: run.json?.legacy_disposed ?? null, chain_bug: run.json?.chain?.bug ?? null },
      }
      if (reopened?.exit_code !== 0) {
        push('KNIFE-NO-BITE', `[LDG-03/legacy-reopen-control-06] 迁移后的 \`-06\` 必须照旧能重开，实得 exit=${reopened?.exit_code} / ${JSON.stringify(messagesOf(reopened?.json ?? {}).slice(0, 2))}`)
      }
      if (disposed?.exit_code !== 0) {
        push('KNIFE-NO-BITE', `[LDG-03/legacy-reopen-control-06] 重开后必须能再处置，实得 exit=${disposed?.exit_code} / ${JSON.stringify(messagesOf(disposed?.json ?? {}).slice(0, 2))}`)
      }
      if (run.exit !== 0) {
        push('KNIFE-NO-BITE', `[LDG-03/legacy-reopen-control-06] 对照树在重开+再处置之后必须仍绿，实得 exit=${run.exit} / ${JSON.stringify(codesOf(run.json))}`)
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
        // 五组真树读数（契约 §10.1 r5/r6）：157 = 52 结论（全是 legacy）+ 105 暂缓
        // （4 新票带结构化字段 + 43 冻结 + 58 legacy 散文到期日）
        if (chain !== null) {
          const want = {
            closed_by_scheme: 0, closed_judged_false: 0, legacy_closed: 52,
            deferred_open: 62, legacy_frozen: 43, deferred_open_structured: 4,
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
          if (chain.closed + chain.deferred !== 157) {
            push('CHAIN-READING-MISSING', `[真树] closed ${chain.closed} + deferred ${chain.deferred} 实得 ${chain.closed + chain.deferred}，期望 157（每一条处置都在某一组里）`)
          }
        }
      }
    }

    caseFail(problems)
  })
})
