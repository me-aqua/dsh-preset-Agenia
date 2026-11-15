/**
 * `LDG-04` / `LDG-08` —— **构案→文件（依据）· 豁免清单**（构案 0012）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§5.3 生产面与三条红 · §6 四条具名豁免 ·
 * §9.3 级联 · §11 刀表 K6/K7/K10）。
 *
 * 🔴 **今天的预期是红**：`账本/` 与 `presets/agenia/bin/决议-check.mjs` 都还不存在（Gate 3 才建）。
 * 红因是 `TOOL-MISSING` —— Gate 2 的应有形状。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CHECK, LEDGER_REL, basisReading, basisSurface, buildScene, codesOf, copyCheckTool, eventDisposed,
  eventRegistered, expectCodes, knifeClearExemptNames, messagesOf, namedIn, productionFile, readText,
  runCheck, runIndex, runToolAt, toolPresent,
} from '../support/three-books.mjs'

before(() => {
  preflight()
})

/** 一条合法构案（每个夹具都靠它满足"依据指生效构案"）。 */
const LIVE = { id: '0012', title: '三册账本', parent: '0001', basisP: ['0001'] }
/** 一条已废构案 + 它的继任者（指针两侧都翻：`已废` 必须有 `superseded_by`，继任者必须有 `supersedes`）。 */
const RETIRED = { id: '0011', title: '旧的方案', parent: '0001', basisP: ['0001'], header: { 状态: '已废', superseded_by: '0013' } }
const SUCCESSOR = { id: '0013', title: '接替的方案', parent: '0001', basisP: ['0001'], header: { supersedes: '0011' } }
const liveScheme = (over = {}) => ({ ...LIVE, ...over })

/** 造树 → `--op index` → `--op check`。 */
function checkScene(problems, rec, { caseId, tag, spec }) {
  const scene = buildScene({ caseId, tag, ...spec })
  const idx = runIndex(scene.root)
  const run = runCheck(scene.root)
  rec.readings[tag] = {
    root: scene.root,
    surface: basisSurface(scene.root).map((f) => f.rel),
    index: { exit: idx.exit, codes: codesOf(idx.json) },
    check: {
      exit: run.exit,
      codes: codesOf(run.json),
      messages: messagesOf(run.json).map((m) => m.slice(0, 240)),
      chain_file: run.json?.chain?.file ?? null,
    },
  }
  return { scene, run }
}

/** 一个不会碰触缺陷册的合法书（`LDG-04` 只判文件面）。 */
function baseSpec(schemes = [liveScheme()], files = []) {
  return {
    products: [{ id: '0001', title: '产品口径样张' }],
    schemes,
    days: [{
      day: '2026-11-15',
      events: [eventRegistered({ seq: 1, id: 'bug-20261115-01', at: '2026-11-15T09:00:00+08:00' }),
        eventDisposed({ seq: 2, id: 'bug-20261115-01', at: '2026-11-15T10:00:00+08:00', value: 'rejected', extra: { 判假: '夹具判假' } })],
    }],
    presets: true,
    team: true,
    files,
  }
}

// ── LDG-04 ──────────────────────────────────────────────────────────────
test('LDG-04 构案→文件：生产代码与说明书/作业书都写 依据 且指生效构案（刀：指废号/悬空号 ⇒ 红）', async () => {
  await runCase('LDG-04', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §5.3 的检查器（文件级依据只能由它判）')) {
      caseFail(problems)
      return
    }

    // ① good：两份夹具文件（代码 + 说明书）都写 `依据: 0012` ⇒ 绿；面里恰好这两份
    {
      const { scene, run } = checkScene(problems, rec, { caseId: 'LDG-04', tag: 'good', spec: baseSpec() })
      if (expectCodes(problems, run, [], push, { label: 'LDG-04/good' })) {
        const surface = basisSurface(scene.root)
        const chainFile = run.json?.chain?.file ?? null
        if (surface.length !== 2) push('SURFACE-DRIFT', `[LDG-04/good] 夹具面实得 ${JSON.stringify(surface.map((f) => f.rel))}，期望 2 份`)
        if (chainFile === null) push('CHAIN-READING-MISSING', '[LDG-04/good] 读数里没有 chain.file（契约 §10.1）')
        else if (chainFile.checked !== 2) push('SURFACE-DRIFT', `[LDG-04/good] chain.file.checked 实得 ${JSON.stringify(chainFile.checked)}，期望 2（面里两份都要核）`)
      }
    }
    // ② 缺依据 ⇒ CHAIN-FILE-NO-BASIS，点名文件
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-04', tag: 'no-basis',
        spec: baseSpec([liveScheme()], [{ rel: 'presets/agenia/lib/fixture-a.mjs', text: productionFile({ kind: 'code', name: 'fixture_a', without: true }) }]),
      })
      if (expectCodes(problems, run, ['CHAIN-FILE-NO-BASIS'], push, { label: 'LDG-04/no-basis' })) {
        if (!namedIn(run.json, 'fixture-a.mjs')) push('NOT-NAMED', '[LDG-04/no-basis] 报文必须点名缺依据的那份文件')
      }
    }
    // ③ 刀 K6：指到不存在的编号 ⇒ BASIS-DANGLING，点名文件与编号
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-04', tag: 'k6-dangling',
        spec: baseSpec([liveScheme()], [{ rel: 'presets/agenia/lib/fixture-a.mjs', text: productionFile({ id: '9999', kind: 'code', name: 'fixture_a' }) }]),
      })
      if (expectCodes(problems, run, ['CHAIN-FILE-BASIS-DANGLING'], push, { label: 'LDG-04/k6-dangling' })) {
        if (!(namedIn(run.json, 'fixture-a.mjs') && namedIn(run.json, '9999'))) push('NOT-NAMED', '[LDG-04/k6-dangling] 报文必须点名文件与 9999')
      }
    }
    // ④ 刀 K7：指到已废构案 ⇒ BASIS-NOT-LIVE
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-04', tag: 'k7-not-live',
        spec: baseSpec([liveScheme(), RETIRED, SUCCESSOR], [{ rel: 'presets/agenia/lib/fixture-a.mjs', text: productionFile({ id: '0011', kind: 'code', name: 'fixture_a' }) }]),
      })
      if (expectCodes(problems, run, ['CHAIN-FILE-BASIS-NOT-LIVE'], push, { label: 'LDG-04/k7-not-live' })) {
        if (!(namedIn(run.json, 'fixture-a.mjs') && namedIn(run.json, '0011'))) push('NOT-NAMED', '[LDG-04/k7-not-live] 报文必须点名文件与已废编号 0011')
      }
    }
    // ⑤ 指到产品号（活着，但不是构案）⇒ 同样是 NOT-LIVE
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-04', tag: 'points-at-product',
        spec: baseSpec([liveScheme()], [{ rel: 'presets/agenia/team/fixture-manual.md', text: productionFile({ id: '0001', kind: 'doc', name: '夹具说明书' }) }]),
      })
      if (expectCodes(problems, run, ['CHAIN-FILE-BASIS-NOT-LIVE'], push, { label: 'LDG-04/points-at-product' })) {
        if (!namedIn(run.json, '0001')) push('NOT-NAMED', '[LDG-04/points-at-product] 报文必须点名 0001（它在产品册里，不是生效构案）')
      }
    }
    // ⑥ 面在而一份都没有 ⇒ EMPTY-SURFACE（空集合不许恒真）
    {
      const scene = buildScene({
        caseId: 'LDG-04', tag: 'empty-surface',
        ...baseSpec(), presets: false,
        files: [{ rel: 'presets/agenia/bin/README.txt', text: '只有一份非面文件\n' }],
      })
      mkdirSync(path.join(scene.root, 'presets', 'agenia', 'bin'), { recursive: true })
      const idx = runIndex(scene.root)
      const run = runCheck(scene.root)
      rec.readings['empty-surface'] = { root: scene.root, index: { exit: idx.exit }, check: { exit: run.exit, codes: codesOf(run.json), messages: messagesOf(run.json).map((m) => m.slice(0, 240)) } }
      expectCodes(problems, run, ['CHAIN-FILE-EMPTY-SURFACE'], push, { label: 'LDG-04/empty-surface' })
    }
    // ⑦ 真树：面里的每一份都被核过（checked = 测试自己数出来的面长），且本族 0 码
    {
      const surface = basisSurface(PATHS.repo)
      const run = runCheck(PATHS.repo)
      rec.readings.real = {
        surface_count: surface.length,
        surface_missing_basis: surface.filter((f) => basisReading(path.join(PATHS.repo, f.rel), { kind: f.kind }).present === false).length,
        exit: run.exit,
        chain_file: run.json?.chain?.file ?? null,
        codes: codesOf(run.json).filter((c) => c.startsWith('CHAIN-FILE')),
      }
      if (surface.length < 45) {
        push('SURFACE-DRIFT', `[真树] 生产面实得 ${surface.length} 份，少于第 2 关测到的 45 份（契约 §5.3；面只会增）`)
      }
      if (run.json === null) {
        push('JSON-UNPARSEABLE', `[真树] check 的 --json 解析不了（${run.json_error}）`)
      } else {
        const chainFile = run.json?.chain?.file ?? null
        if (chainFile === null) push('CHAIN-READING-MISSING', '[真树] 读数里没有 chain.file')
        else if (chainFile.checked !== surface.length) {
          push('SURFACE-DRIFT', `[真树] chain.file.checked = ${JSON.stringify(chainFile.checked)}，测试数出来的面 = ${surface.length}（两处枚举口径必须同一份，契约 §5.3）`)
        }
        const bad = codesOf(run.json).filter((c) => c.startsWith('CHAIN-FILE'))
        if (bad.length > 0) push('CHAIN-FILE-NO-BASIS', `[真树] 文件依据链上还有 ${JSON.stringify(bad)}（Gate 3 要把 45 份的 依据 补齐）`)
      }
    }

    caseFail(problems)
  })
})

// ── LDG-08 ──────────────────────────────────────────────────────────────
test('LDG-08 豁免清单：now.md/log.md/账本/.team 不要求依据（刀：把豁免清空 ⇒ now.md 当场红）', async () => {
  await runCase('LDG-08', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §6 的检查器（豁免只能由它判）')) {
      caseFail(problems)
      return
    }

    /** 四个豁免形状摆在**面里**（team/*.md 与 job-briefs/*.md 在面上），四份都不写依据。 */
    const exemptFiles = [
      { rel: 'presets/agenia/team/now.md', text: '# now（夹具）\n\n没有依据，也不该红。\n' },
      { rel: 'presets/agenia/job-briefs/log.md', text: '# log（夹具）\n\n没有依据，也不该红。\n' },
      { rel: 'presets/agenia/lib/fixture-a.mjs', text: productionFile({ id: '0012', kind: 'code', name: 'fixture_a' }) },
    ]
    /** 账本本身与 `.team/**`：各放一份不写依据的 md（它们的豁免由"不在面里"承重）。 */
    const outOfSurface = [
      { rel: `${LEDGER_REL}/产品/0001-已有一条.md`, text: '# 产品 0001\n\n账本是账本，不需要自己给自己写出处。\n' },
      { rel: '.team/dev/report.md', text: '# 报告（夹具）\n\n.team 的产物不要求依据。\n' },
    ]

    // ① 豁免真生效：同一棵树里"面上那两份 now/log 写了不写都绿" + "面外的两份不红"
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-08', tag: 'exempt',
        spec: baseSpec([liveScheme()], [...exemptFiles, ...outOfSurface]),
      })
      expectCodes(problems, run, [], push, { label: 'LDG-08/exempt' })
    }
    // ② 反面控制：同一棵树里加一份**非豁免**的面上文件（不写依据）⇒ 恰好一条、点名它
    {
      const { run } = checkScene(problems, rec, {
        caseId: 'LDG-08', tag: 'non-exempt-red',
        spec: baseSpec([liveScheme()], [...exemptFiles, ...outOfSurface, { rel: 'presets/agenia/team/fixture-extra.md', text: '# 夹具说明书\n\n没写依据。\n' }]),
      })
      if (expectCodes(problems, run, ['CHAIN-FILE-NO-BASIS'], push, { label: 'LDG-08/non-exempt-red' })) {
        if (!namedIn(run.json, 'fixture-extra.md')) push('NOT-NAMED', '[LDG-08/non-exempt-red] 必须点名那一份没豁免的文件')
        if (namedIn(run.json, 'now.md') || namedIn(run.json, 'log.md')) {
          push('NOT-NAMED', '[LDG-08/non-exempt-red] 报文点名了 now.md / log.md —— 它们豁免了，不该被要求依据')
        }
      }
    }
    // ③ 刀 K10：拷一份检查器，把 BASIS_EXEMPT_NAMES 清空 ⇒ 同一棵树（①那棵）现在必须红两份名字
    {
      const scene = buildScene({ caseId: 'LDG-08', tag: 'k10-copy', ...baseSpec([liveScheme()], [...exemptFiles, ...outOfSurface]) })
      const copy = copyCheckTool(path.join(scene.root, '_tool'))
      rec.readings['k10-copy_files'] = { files: copy.files.length, root: copy.root }
      const tool = path.join(copy.root, 'presets', 'agenia', 'bin', '决议-check.mjs')
      const before = runToolAt(tool, scene.root, ['--op', 'index'])
      const clean = runToolAt(tool, scene.root)
      rec.readings['k10-copy_before'] = { index_exit: before.exit, exit: clean.exit, codes: codesOf(clean.json) }
      // 未切的那一份必须绿（阳性对照：刀不是靠"副本本来就坏"咬住的）
      expectCodes(problems, clean, [], push, { label: 'LDG-08/k10-uncut' })
      const knife = knifeClearExemptNames(copy.root)
      rec.readings['k10-copy_knife'] = knife
      if (!knife.ok) {
        push('KNIFE-NO-BITE', `[LDG-08/k10] 切不动 BASIS_EXEMPT_NAMES：${JSON.stringify(knife.anchor)} —— 锚点必须恰好 1 处（契约 §10.2/§11 K10）`)
      } else {
        const cut = runToolAt(tool, scene.root)
        rec.readings['k10-copy_cut'] = { exit: cut.exit, codes: codesOf(cut.json), messages: messagesOf(cut.json).map((m) => m.slice(0, 240)) }
        if (expectCodes(problems, cut, ['CHAIN-FILE-NO-BASIS'], push, { label: 'LDG-08/k10-cut' })) {
          if (!(namedIn(cut.json, 'now.md') && namedIn(cut.json, 'log.md'))) {
            push('KNIFE-NO-BITE', `[LDG-08/k10] 清空豁免之后必须点名 now.md 与 log.md，实得 ${JSON.stringify(messagesOf(cut.json).slice(0, 4))}`)
          }
          if (namedIn(cut.json, 'fixture-a.mjs')) push('KNIFE-NO-BITE', '[LDG-08/k10] 刀切宽了：那份写了 依据 的文件也红了')
        }
      }
    }

    caseFail(problems)
  })
})
