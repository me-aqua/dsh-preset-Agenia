/**
 * INS-01 / INS-02 / INS-03 —— 安装 / 回滚 / 发布扫描。
 *
 * 冻结依据：契约 §6.11 INS-01..03 + 提案 §B1.1（staging **安装副本区** `…\agenia-upgrade\install-copy\` 是演练现场）
 * + §B1.3（`bin/install.mjs` · `bin/rollback.mjs` · `bin/release-scan.mjs` 三个脚本名）
 * + §B1.5（`manifest.mjs` 的 `manifestFields()`）+ 拍板 **Q6**（回滚脚本**单文件自足、零 import**）
 * + 拍板 **Q3**（`.gitignore` 两行的顺序：先 `.tools/_staging/`，再在任何真实数据落盘前加 `presets/agenia/.runtime/`）
 * + §2.4 第 6 条（备份必须落 E 盘 + 带哈希清单）。
 *
 * ⚠️ 一处**未冻**：三个脚本的 **CLI 调用形状**（参数名）没写进 §B1.4 的三张 op 表（那三张只覆盖 brain/route/local）。
 *    这里按最朴素的约定调（`--manifest` / `--target` / `--backup`），**并在读数里记下** ——
 *    若实现另有形状，回组长冻，不要两边各猜一套。
 *
 * 🔴 **`INS-02` 在 2026-11-13 之后还有两条腿**（构案 0008 · 史山清查 B3；契约
 *    `.team/test/2026-11-13/CONTRACT-史山清查-B3.md` §1）：
 *   · **腿 ③ · 公共 helper 只剩一份**：8 个**逐字同体**的 helper 在 `install.mjs` / `rollback.mjs` 里各 **0 处**定义、
 *     在 `presets/agenia/lib/cli-guards.mjs` 的 `@inline-begin 公共 helper 正文` 标记块里各 **1 处**（且导出）；
 *     别处只许出现**已知同名物**（清单在 `support/cli-guards-shared.mjs::NAMESAKE_ALLOWLIST`）。
 *     另加一条**范围腿**：10 个**已分叉**的同名函数（`canonical` / `parseArgs` / `main` …）在两支 CLI 里仍各 1 处
 *     —— 它们不在本票，合并 / 删除任何一支都红。
 *   · **腿 ④ · staged 那一对：装 → 回 一轮**（行为面；RC-1 的绊线）：同一份现场先 `install` 再 `rollback`，
 *     两个 exit 0 · 代码回旧版 · **数据逐字节不动** · 未知文件在 · 目标树无 `.tmp-*` / `*.partial` 残渣。
 *     载具就是本文件既有的 `makeScene()` + `runScript()`（跑 staged 的 `bin/`）—— 不另造一套。
 */
import { before, describe, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runId, runRoot, stagingReadings, treeHash, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { loadStagedModule, readStagedText, runCli, stagingExists, stagingPath } from '../support/sut.mjs'
import { staticImportLines } from '../support/staged-artifact.mjs'
import { extractFunctionText } from '../support/atomic-writers.mjs'
import { SHARED_HELPERS, helperDefinitionVerdict, scanHelperDefinitions } from '../support/cli-guards-shared.mjs'
import { INLINE_BLOCKS, beginOf, blockOf } from '../support/injector-inline.mjs'
import { LEFTOVER_SHAPE } from '../support/temp-scan.mjs'

before(() => {
  preflight()
})

const INSTALL = 'install.mjs'
const ROLLBACK = 'rollback.mjs'
const SCAN = 'release-scan.mjs'

function caseDir(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ins-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-install-copy',
  })
}
const runScript = (cli, opts) => {
  try {
    return runCli(cli, opts, { env: process.env })
  } catch (err) {
    return { exit_code: null, json: { error: { code: err?.code ?? 'THREW' } }, stdout: '', stderr: String(err.message) }
  }
}
const requireScript = (problems, cli, why) => {
  if (stagingExists(path.join('bin', cli))) return true
  problems.push(problem('SUT-SURFACE-MISSING', `staged/bin/${cli} 不在 ⇒ ${why} 拿不到（预期的首跑红）`))
  return false
}

/** 造一个"安装现场"：目标树里既有代码、又有非空数据、还有一个未知文件。 */
function makeScene(root) {
  const code = path.join(root, 'presets', 'agenia')
  const data = path.join(code, '.runtime')
  mkdirSync(path.join(code, 'bin'), { recursive: true })
  mkdirSync(path.join(data, 'memory', 'snapshots'), { recursive: true })
  writeFileSync(path.join(code, 'inject.js'), '// （夹具）旧版注入器\n', 'utf8')
  writeFileSync(path.join(code, 'bin', 'agenia-brain.mjs'), '// （夹具）旧版 CLI\n', 'utf8')
  // **非空数据**与**未知文件**：安装/回滚都不许动它们
  writeFileSync(path.join(data, 'memory', 'snapshots', 'v7.json'), '{"（夹具）真实数据":"不许被覆盖"}\n', 'utf8')
  writeFileSync(path.join(code, 'UNKNOWN-notes.txt'), '（夹具）未知文件：安装不许删它\n', 'utf8')
  // 发布物（清单 + 新版代码）
  const release = path.join(root, 'release')
  mkdirSync(path.join(release, 'bin'), { recursive: true })
  writeFileSync(path.join(release, 'inject.js'), '// （夹具）新版注入器\n', 'utf8')
  writeFileSync(path.join(release, 'bin', 'agenia-brain.mjs'), '// （夹具）新版 CLI\n', 'utf8')
  const manifest = {
    schema: 1,
    preset: 'agenia',
    version: '（夹具）1.0.0',
    files: [
      { path: 'inject.js', sha256: 'a'.repeat(64) },
      { path: 'bin/agenia-brain.mjs', sha256: 'b'.repeat(64) },
    ],
  }
  const manifestFile = path.join(root, 'install.manifest.json')
  writeJson(manifestFile, manifest)
  return { code, data, release, manifestFile, unknown: path.join(code, 'UNKNOWN-notes.txt'), dataFile: path.join(data, 'memory', 'snapshots', 'v7.json') }
}

describe('integration · install-rollback (INS)', () => {
  test('INS-01 只按清单覆盖代码；非空数据与未知文件逐字节保留；重装幂等', async () => {
    await runCase('INS-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const root = caseDir('INS-01', 'scene')
      const scene = makeScene(root)
      const dataBefore = treeHash(scene.data)
      const unknownBefore = readFileSync(scene.unknown, 'utf8')
      rec.readings.data_before = { sha256: dataBefore.sha256, count: dataBefore.count }
      if (!requireScript(problems, INSTALL, '安装演练')) caseFail(problems)

      // ① 装一次
      const first = runScript(INSTALL, { op: 'install', extra: ['--manifest', scene.manifestFile, '--target', scene.code, '--release', scene.release] })
      rec.readings.install_1 = { exit_code: first.exit_code, code: first.json?.error?.code ?? null }
      if (first.exit_code !== 0) push('INS01-INSTALL', `install 必须成功（正例），实得 exit=${first.exit_code} / ${first.json?.error?.code ?? '(无码)'}：${String(first.stdout).slice(0, 200)}`)
      else {
        // 数据与未知文件必须一字不变
        const dataAfter = treeHash(scene.data)
        rec.readings.data_after = { sha256: dataAfter.sha256, count: dataAfter.count }
        if (dataAfter.sha256 !== dataBefore.sha256) push('INS01-DATA', `安装改动了非空数据目录（${dataBefore.sha256} → ${dataAfter.sha256}）—— 安装只许动代码`)
        if (readFileSync(scene.unknown, 'utf8') !== unknownBefore) push('INS01-UNKNOWN', '安装动了未知文件 —— 清单外的文件必须保留')
        if (!existsSync(scene.unknown)) push('INS01-UNKNOWN', '安装把未知文件删掉了')
        // 代码确实被换了（正例的另一半）：新版本的内容应当在
        const injected = readFileSync(path.join(scene.code, 'inject.js'), 'utf8')
        rec.readings.injector_after = injected.trim()
        if (!injected.includes('新版')) push('INS01-CODE', '安装之后代码没被换成新版（清单里的那两份应当被覆盖）')
        // ② 幂等：再装一次，目标树哈希不变
        const treeOnce = treeHash(scene.code)
        const second = runScript(INSTALL, { op: 'install', extra: ['--manifest', scene.manifestFile, '--target', scene.code, '--release', scene.release] })
        const treeTwice = treeHash(scene.code)
        rec.readings.install_2 = { exit_code: second.exit_code, code: second.json?.error?.code ?? null, tree_changed: treeOnce.sha256 !== treeTwice.sha256 }
        if (second.exit_code !== 0) push('INS01-IDEMPOTENT', `重装必须也能成功（幂等），实得 exit=${second.exit_code} / ${second.json?.error?.code ?? '(无码)'}`)
        else if (treeOnce.sha256 !== treeTwice.sha256) push('INS01-IDEMPOTENT', `重装之后目标树变了（${treeOnce.sha256} → ${treeTwice.sha256}）—— 重装必须幂等`)
      }
      rec.readings.cli_shape_unfrozen = {
        note: '三个脚本的 CLI 参数名没写进 §B1.4 的三张 op 表 ⇒ 本用例按 `--manifest/--target/--release` 试；若实现另有形状，回组长冻（别两边各猜一套）。',
      }
      caseFail(problems)
    })
  })

  test('INS-02 回滚只回代码不回数据；脚本零 import；失败保留现场；公共 helper 只剩一份；staged 对装→回一轮', async () => {
    await runCase('INS-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const root = caseDir('INS-02', 'scene')
      const scene = makeScene(root)
      const dataBefore = treeHash(scene.data)
      if (!requireScript(problems, ROLLBACK, '回滚演练')) caseFail(problems)

      // ① Q6：回滚脚本**单文件自足、零 import**（静态）
      //
      // 🔴 **判据对象 = 出厂件（staged）**，不是 repo 文件（2026-11-12 构案 0006 裁决 · 第三方案）：
      //    repo 里的 `presets/agenia/bin/rollback.mjs` 正常 import 共享件（去重是本票目的）；
      //    `publish-staged` 在发布时把 `writeFileAtomic` **内联**进出厂件，让它仍是单文件零静态 import。
      //    ⇒ Q6 的原始意图（用户跑的那一份能直接跑）保住了，而 repo 那一份有 import **不算红**。
      //    这一条只读出厂件；repo 那一份的 import 数只作读数（`rec.readings.q6_subjects`），不参与判词。
      const subject = stagingPath(path.join('bin', ROLLBACK))
      const repoRollback = path.join(PATHS.repo, 'presets', 'agenia', 'bin', ROLLBACK)
      const src = readStagedText(path.join('bin', ROLLBACK))
      const imports = staticImportLines(src)
      const repoImports = staticImportLines(readFileSync(repoRollback, 'utf8'))
      rec.readings.rollback_bytes = src.length
      rec.readings.rollback_imports = imports.map((x) => `${x.line}: ${x.text}`)
      rec.readings.q6_subjects = {
        judged: subject,
        judged_kind: '出厂件（staged preset）—— 用户拿到的那一份',
        repo_file: path.resolve(repoRollback),
        repo_static_imports: repoImports.length,
        shipped_static_imports: imports.length,
        note: 'repo 那一份**有** import（去重之后）、出厂件**零**静态 import —— 两者同时成立才是裁决要的形状；'
          + '本判据只看出厂件（repo 的 import 数只作读数）',
      }
      if (path.resolve(subject) === path.resolve(repoRollback)) {
        push('INS02-SUBJECT-REPO', `判据对象指回了 repo 文件（${subject}）—— 裁决之后 Q6 判的是**出厂件**，不是 repo 文件`)
      }
      if (imports.length > 0) {
        push('INS02-ZERO-IMPORT', `出厂件（staged）的回滚脚本里有 ${imports.length} 处 import/require —— 拍板 Q6：`
          + `**单文件自足、零 import**（宁可重复三个小工具，也不让回滚依赖新代码）；判据对象 = ${subject}：`
          + imports.map((x) => `:${x.line} ${x.text}`).join(' · '))
      }
      // ② 回滚：代码回到旧版、数据不动
      const rb = runScript(ROLLBACK, { op: 'rollback', extra: ['--target', scene.code, '--backup', path.join(root, 'backup')] })
      rec.readings.rollback = { exit_code: rb.exit_code, code: rb.json?.error?.code ?? null }
      if (rb.exit_code !== 0) {
        push('INS02-ROLLBACK', `rollback 必须成功（正例），实得 exit=${rb.exit_code} / ${rb.json?.error?.code ?? '(无码)'}：${String(rb.stdout).slice(0, 200)}`)
      } else {
        const dataAfter = treeHash(scene.data)
        rec.readings.data_after = { sha256: dataAfter.sha256 }
        if (dataAfter.sha256 !== dataBefore.sha256) push('INS02-DATA', `回滚动了数据（${dataBefore.sha256} → ${dataAfter.sha256}）—— 回滚**只回代码不回数据**`)
        if (!existsSync(scene.dataFile)) push('INS02-DATA', '回滚把真实数据文件删掉了')
        const injected = readFileSync(path.join(scene.code, 'inject.js'), 'utf8')
        rec.readings.injector_after_rollback = injected.trim()
        if (injected.includes('新版')) push('INS02-CODE', '回滚之后代码还是新版 —— 回滚必须把代码退回去')
        if (!existsSync(scene.unknown)) push('INS02-UNKNOWN', '回滚把未知文件删掉了 —— 现场必须保留')
      }
      // ③ 失败保留现场：给一个不存在的目标 ⇒ 必须失败且不许"清空再报错"
      const bad = runScript(ROLLBACK, { op: 'rollback', extra: ['--target', path.join(root, 'not-there'), '--backup', path.join(root, 'backup2')] })
      rec.readings.rollback_bad = { exit_code: bad.exit_code, code: bad.json?.error?.code ?? null }
      if (bad.exit_code === 0) push('INS02-FAIL-SCENE', '目标不存在时回滚竟然报成功 —— 失败必须非 0 且保留现场')
      if (!existsSync(scene.code)) push('INS02-FAIL-SCENE', '一次失败的回滚把目标目录清掉了 —— 失败不许毁现场')

      // ══ 腿 ③ · 公共 helper 只剩一份（构案 0008 · 史山清查 B3）══════════════════════════════
      // 病：两支 CLI 各揣一份**逐字同体**的 8 个 helper（2,194 字符）—— 改一边不会有任何判据变红。
      // 这一腿判三件：8 个在 `presets/**` 各**恰好 1 处**（在 `lib/cli-guards.mjs` 的标记块里、且导出）·
      // 两支 CLI 里各 **0 处** · 10 个**已分叉**的仍在两支 CLI 里各 1 处（防"顺手合并"的范围蔓延）。
      const census = scanHelperDefinitions({ root: PATHS.repo })
      const censusV = helperDefinitionVerdict(census)
      rec.readings.helper_definitions = {
        scan_root: census.scan_root,
        scanned_files: census.scanned_files,
        blocks: census.blocks,
        per_name: Object.fromEntries(Object.entries(census.names).map(([name, row]) => [name, {
          role: row.role,
          counted: row.counted,
          hits: row.hits.map((h) => `${h.file}:${h.line}（${h.kind} · ${h.classification}${h.exported ? ' · exported' : ''}）`),
        }])),
        derived_inline_spans: census.derived_inline_spans,
        mismatch_spans: census.mismatch_spans,
        line: census.line,
        verdict: censusV.verdict,
        problem_codes: censusV.problems.map((p) => p.code),
      }
      for (const p of censusV.problems) push(p.code, `[腿③ 定义] ${p.message}`, p.detail)

      // 腿 ③ 的**控制 + 五把刀**（scratch 树里跑同一份量具；真树一个字节都不碰）
      const censusKnives = []
      const censusNote = (id, want, got, ok, detail) => {
        const entry = { id, want, got, status: ok ? 'bit' : 'dead', detail: detail ?? null }
        censusKnives.push(entry)
        return entry
      }
      /** 把 8 个 helper 从一份 CLI 正文里删掉（按各自那一整段正文逐字删）。 */
      const withoutHelpers = (text, names) => {
        let out = text
        const removed = []
        for (const name of names) {
          const fn = extractFunctionText(out, name)
          if (fn === null) continue
          out = `${out.slice(0, fn.start)}${out.slice(fn.end)}`
          removed.push(name)
        }
        return { text: out, removed }
      }
      const pairFiles = { install: readFileSync(path.join(PATHS.repo, 'presets', 'agenia', 'bin', INSTALL), 'utf8'), rollback: readFileSync(repoRollback, 'utf8') }
      /**
       * 公共 helper 正文的**来源**：共享件在就用共享件那一块（Gate 3 之后的真身），
       * 不在才从 repo `rollback.mjs` 里逐段抠（Gate 3 之前那一版）。
       * 🔴 只认 rollback 会在实现落地那一刻"抠不出正文 ⇒ 刀建不起来"（判据自己先红）—— 别踩这个坑。
       */
      const sharedGuardsAbs = path.join(PATHS.repo, ...INLINE_BLOCKS.guards.sourceRel.split('/'))
      const sharedGuardsText = existsSync(sharedGuardsAbs) ? readFileSync(sharedGuardsAbs, 'utf8') : null
      const sharedGuardsSpan = sharedGuardsText === null ? { found: false, text: '' } : blockOf(sharedGuardsText, beginOf(INLINE_BLOCKS.guards))
      const helperBodies = []
      const missingBodies = []
      for (const name of SHARED_HELPERS) {
        const fn = extractFunctionText(pairFiles.rollback, name)
        if (fn === null) missingBodies.push(name)
        else helperBodies.push(fn.text.replace(/^function\s/, 'export function '))
      }
      const guardsBody = sharedGuardsSpan.found ? sharedGuardsSpan.text : helperBodies.join('\n\n')
      if (!sharedGuardsSpan.found && missingBodies.length > 0) {
        push('CG-KNIFE-ANCHOR', `[腿③ 控制] 共享件不在、又从句 repo rollback 里抠不出这些 helper 的正文：${missingBodies.join(' / ')} —— 合成对照树建不起来`)
      }
      const controlRoot = ensureMarkedDir(path.join(runRoot(), 'fixtures', 'ins02', 'census-control'), { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
      const putCensus = (rel, text) => {
        const file = path.join(controlRoot, ...rel.split('/'))
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, text, 'utf8')
        return file
      }
      const guardsSource = sharedGuardsText === null
        ? [
          '/** （夹具）公共 helper 正文：从真 repo rollback 里逐段抠出来，按标记包起来 —— 不是手写的近似体。 */',
          `// ${beginOf(INLINE_BLOCKS.guards)}`,
          guardsBody,
          `// @inline-end ${INLINE_BLOCKS.guards.label}`,
          '',
        ].join('\n')
        : sharedGuardsText
      const cliAfter = {
        install: withoutHelpers(pairFiles.install, SHARED_HELPERS),
        rollback: withoutHelpers(pairFiles.rollback, SHARED_HELPERS),
      }
      putCensus('presets/agenia/lib/cli-guards.mjs', guardsSource)
      putCensus('presets/agenia/bin/install.mjs', cliAfter.install.text)
      putCensus('presets/agenia/bin/rollback.mjs', cliAfter.rollback.text)
      rec.readings.helper_definitions_control = {
        root: controlRoot,
        guards_from: sharedGuardsSpan.found ? `共享件那一块（${INLINE_BLOCKS.guards.sourceRel}）` : 'repo rollback 里逐段抠出来再按标记包起来',
        removed: { install: cliAfter.install.removed, rollback: cliAfter.rollback.removed },
        note: '合成对照树：8 个 helper 从两份 CLI 里逐段删掉、按标记放进 lib/cli-guards.mjs；10 个已分叉的原地留着'
          + '（Gate 3 之后两份 CLI 本来就没有它们 ⇒ 那一侧删掉 0 段是正常的，不是刀没做）',
      }
      {
        const read = scanHelperDefinitions({ root: controlRoot })
        const v = helperDefinitionVerdict(read)
        const codes = v.problems.map((p) => p.code)
        censusNote('control-after-extraction', 'GREEN', codes, v.verdict === 'GREEN', { line: read.line })
        if (v.verdict !== 'GREEN') {
          push('CG-KNIFE-CONTROL', `腿③ 的控制面不成立：一份"抽完之后"的合成树应当绿（8 个在共享块里、两支 CLI 里 0、10 个已分叉各 1），`
            + `实得 ${v.verdict}（${codes.join(' / ') || '无红因'}）—— ${read.line}`)
        }
        if (cliAfter.install.removed.length !== 0 && cliAfter.install.removed.length !== SHARED_HELPERS.length) {
          push('CG-KNIFE-ANCHOR', `[腿③ 控制] install 那 8 个 helper 的正文只抠掉 ${cliAfter.install.removed.length}/8 —— 抠了一半，合成树不成立`)
        }
        if (cliAfter.rollback.removed.length !== 0 && cliAfter.rollback.removed.length !== SHARED_HELPERS.length) {
          push('CG-KNIFE-ANCHOR', `[腿③ 控制] rollback 那 8 个 helper 的正文只抠掉 ${cliAfter.rollback.removed.length}/8 —— 抠了一半，合成树不成立`)
        }
      }
      /** 在对照树上改一处，跑同一份量具，返回 `{codes, messages, line, read}`。 */
      const judgeCensus = (tag, mutate) => {
        const root = ensureMarkedDir(path.join(runRoot(), 'fixtures', 'ins02', `census-${tag}`), { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
        const write = (rel, text) => {
          const file = path.join(root, ...rel.split('/'))
          mkdirSync(path.dirname(file), { recursive: true })
          writeFileSync(file, text, 'utf8')
        }
        write('presets/agenia/lib/cli-guards.mjs', guardsSource)
        write('presets/agenia/bin/install.mjs', cliAfter.install.text)
        write('presets/agenia/bin/rollback.mjs', cliAfter.rollback.text)
        mutate({ root, write })
        const read = scanHelperDefinitions({ root })
        const v = helperDefinitionVerdict(read)
        return { codes: v.problems.map((p) => p.code), messages: v.problems.map((p) => p.message), line: read.line, read }
      }
      // 刀 ①（本票点名的那把）· 手抄一份回 install ⇒ 红，且报文**点名两边**
      {
        const fn = extractFunctionText(pairFiles.rollback, 'pathVerdict')
        if (fn === null) {
          push('CG-KNIFE-ANCHOR', '[刀 copy-back] 抠不出 `pathVerdict` 那一整段 —— 手抄这一刀建不起来')
        } else {
          const got = judgeCensus('copy-back', ({ write }) => {
            write('presets/agenia/bin/install.mjs', `${cliAfter.install.text}\n${fn.text}\n`)
          })
          const namedBoth = got.messages.some((m) => m.includes('presets/agenia/bin/install.mjs') && m.includes('presets/agenia/lib/cli-guards.mjs'))
          const ok = got.codes.includes('CG-DEF-PAIR-COPY') && namedBoth
          censusNote('knife-copy-back', 'CG-DEF-PAIR-COPY（点名两边）', got.codes, ok, { named_both: namedBoth })
          if (!got.codes.includes('CG-DEF-PAIR-COPY')) {
            push('CG-KNIFE-DEAD', `[刀 copy-back] 把 ` + '`pathVerdict`' + ` 那段逐字抄回 install.mjs 之後必须红 \`CG-DEF-PAIR-COPY\`，实得 ${got.codes.join(' / ') || '（一条都没有）'}`)
          } else if (!namedBoth) {
            push('CG-KNIFE-NAMES', `[刀 copy-back] 红报文没同时点名两支文件（要出现 presets/agenia/bin/install.mjs 与 presets/agenia/lib/cli-guards.mjs）：${got.messages.join(' | ').slice(0, 400)}`)
          }
        }
      }
      // 刀 ② · 删掉共享件里的一个定义 ⇒ **红**（不是崩）
      {
        const withoutSlug = guardsSource.replace(/export function slugOf\([\s\S]*?\n}\n/, '')
        const broken = withoutSlug === guardsSource
        if (broken) {
          push('CG-KNIFE-ANCHOR', '[刀 drop-shared] 合成共享件里删不掉 `slugOf` —— 刀建不起来')
        } else {
          let got = null
          try {
            got = judgeCensus('drop-shared', ({ write }) => write('presets/agenia/lib/cli-guards.mjs', withoutSlug))
          } catch (err) {
            push('CG-KNIFE-CRASH', `[刀 drop-shared] 删掉共享件里的一个定义之后量具**抛了**（${String(err?.message ?? err).slice(0, 200)}）—— 判据必须红，不许崩`)
          }
          if (got !== null) {
            const ok = got.codes.includes('CG-DEF-SHARED-COUNT')
            censusNote('knife-drop-shared', 'CG-DEF-SHARED-COUNT（红，不崩）', got.codes, ok)
            if (!ok) push('CG-KNIFE-DEAD', `[刀 drop-shared] 删掉 \`slugOf\` 的共享定义之後必须红 \`CG-DEF-SHARED-COUNT\`，实得 ${got.codes.join(' / ') || '（一条都没有）'}`)
          }
        }
      }
      // 刀 ③ · 把**已分叉**的一个（`canonical`）合进共享件 ⇒ 范围腿必须红
      {
        const fn = extractFunctionText(pairFiles.install, 'canonical')
        if (fn === null) {
          push('CG-KNIFE-ANCHOR', '[刀 merge-forked] 抠不出 `canonical` 那一整段 —— 刀建不起来')
        } else {
          const got = judgeCensus('merge-forked', ({ write }) => {
            write('presets/agenia/bin/install.mjs', cliAfter.install.text.replace(fn.text, ''))
            write('presets/agenia/lib/cli-guards.mjs', `${guardsSource}\nexport ${fn.text.trim()}\n`)
          })
          const ok = got.codes.includes('CG-FORK-COUNT')
          censusNote('knife-merge-forked', 'CG-FORK-COUNT（10 个已分叉的不许被合并）', got.codes, ok)
          if (!ok) push('CG-KNIFE-DEAD', `[刀 merge-forked] 把已分叉的 \`canonical\` 从 install 挪进共享件之後必须红 \`CG-FORK-COUNT\`，实得 ${got.codes.join(' / ') || '（一条都没有）'}`)
        }
      }
      // 刀 ④ · 把某个 helper 抄进**清单之外**的文件 ⇒ `CG-DEF-NAMESAKE`（允许清单不是"哪儿都行"）
      {
        const got = judgeCensus('namesake', ({ write }) => {
          write('presets/agenia/lib/other.mjs', 'function emit(envelope) {\n  return envelope\n}\n')
        })
        const ok = got.codes.includes('CG-DEF-NAMESAKE')
        censusNote('knife-namesake', 'CG-DEF-NAMESAKE（清单之外的一处）', got.codes, ok)
        if (!ok) push('CG-KNIFE-DEAD', `[刀 namesake] 把 \`emit\` 抄进 \`lib/other.mjs\` 之後必须红 \`CG-DEF-NAMESAKE\`，实得 ${got.codes.join(' / ') || '（一条都没有）'}`)
      }
      // 控制 ② · 标记块里放**逐字同源**的一份（派生副本不算第二处）⇒ 仍绿、且读数点名跳过的跨度
      {
        const got = judgeCensus('derived-same', ({ write }) => {
          write('presets/agenia/inject.js', `// ${beginOf(INLINE_BLOCKS.guards)}\n${guardsBody}\n// @inline-end ${INLINE_BLOCKS.guards.label}\n`)
        })
        const spans = got.read.derived_inline_spans ?? []
        const ok = got.codes.length === 0 && spans.length === 1
        censusNote('control-derived-same', 'GREEN + 点名跳过那一段', got.codes, ok, { spans })
        if (!ok) push('CG-KNIFE-CONTROL', `[控制 derived-same] 逐字同源的派生内联必须只算一处、无红，且读数点名跳过的跨度；实得 codes=${JSON.stringify(got.codes)} spans=${JSON.stringify(spans)}`)
      }
      // 刀 ⑤ · 标记块里放**改过**的一份 ⇒ `CG-DEF-DERIVED-MISMATCH`（"打个标记"不是免检章）
      {
        const mutated = guardsBody.replace('function pathVerdict(', 'function pathVerdictX(')
        const got = judgeCensus('derived-mismatch', ({ write }) => {
          write('presets/agenia/inject.js', `// ${beginOf(INLINE_BLOCKS.guards)}\n${mutated}\n// @inline-end ${INLINE_BLOCKS.guards.label}\n`)
        })
        const ok = got.codes.includes('CG-DEF-DERIVED-MISMATCH')
        censusNote('knife-derived-mismatch', 'CG-DEF-DERIVED-MISMATCH', got.codes, ok)
        if (!ok) push('CG-KNIFE-DEAD', `[刀 derived-mismatch] 标记块里放改过的正文之後必须红 \`CG-DEF-DERIVED-MISMATCH\`，实得 ${got.codes.join(' / ') || '（一条都没有）'}`)
      }
      rec.readings.helper_definitions_knives = censusKnives

      // ══ 腿 ④ · staged 那**一对**：装 → 回 一轮（行为面；构案 0008 RC-1 的绊线）══════════════
      // 为什么在 INS-02：这一格的判据对象就是"两支 CLI"，而 B3 之后**出厂件里那 8 个 helper 来自内联块** ——
      // 内联块坏了 / 发布时少带了模块，第一现场会出现在"装完再回"这条路上（RC-1：「行为与今天不等」）。
      // 载具 = 本文件既有的那套（`makeScene()` 造现场 + `runScript()` 跑 staged 的 bin/），不另造一份。
      const seqRoot = caseDir('INS-02', 'staged-pair')
      const seq = makeScene(seqRoot)
      const seqDataBefore = treeHash(seq.data)
      const seqUnknownBefore = readFileSync(seq.unknown, 'utf8')
      const seqProblems = []
      const seqPush = (code, msg, detail) => seqProblems.push(problem(code, msg, detail))
      const inst = runScript(INSTALL, { op: 'install', extra: ['--manifest', seq.manifestFile, '--target', seq.code, '--release', seq.release] })
      const injectedAfterInstall = existsSync(path.join(seq.code, 'inject.js')) ? readFileSync(path.join(seq.code, 'inject.js'), 'utf8') : ''
      const rbSeq = runScript(ROLLBACK, { op: 'rollback', extra: ['--target', seq.code] })
      const injectedAfterRollback = existsSync(path.join(seq.code, 'inject.js')) ? readFileSync(path.join(seq.code, 'inject.js'), 'utf8') : ''
      const seqDataAfter = treeHash(seq.data)
      const seqTree = treeHash(seq.code)
      const remnants = (seqTree.files ?? []).map((f) => f.rel).filter((rel) => LEFTOVER_SHAPE.test(rel))
      const seqReading = {
        root: seqRoot,
        harness: 'integration/install-rollback.test.mjs::makeScene() + runScript()（跑的是 staged 的 bin/）',
        install: { exit_code: inst.exit_code, code: inst.json?.error?.code ?? null },
        rollback: { exit_code: rbSeq.exit_code, code: rbSeq.json?.error?.code ?? null, status: rbSeq.json?.status ?? null, applied: rbSeq.json?.applied ?? null },
        data_before: { sha256: seqDataBefore.sha256, count: seqDataBefore.count },
        data_after: { sha256: seqDataAfter.sha256, count: seqDataAfter.count },
        unknown_kept: existsSync(seq.unknown) && readFileSync(seq.unknown, 'utf8') === seqUnknownBefore,
        injector_after_install: injectedAfterInstall.trim().slice(0, 80),
        injector_after_rollback: injectedAfterRollback.trim().slice(0, 80),
        code_files: seqTree.files?.length ?? null,
        temp_remnants: remnants,
      }
      if (inst.exit_code !== 0) seqPush('INS02-PAIR-INSTALL', `staged 的 install 必须成功（正例），实得 exit=${inst.exit_code} / ${inst.json?.error?.code ?? '(无码)'}：${String(inst.stdout).slice(0, 200)}`)
      else if (!injectedAfterInstall.includes('新版')) seqPush('INS02-PAIR-INSTALL', `装完之后代码没被换掉（inject.js = ${JSON.stringify(injectedAfterInstall.trim().slice(0, 60))}）—— 后面那条"回滚把代码退回去"就没有对照`)
      if (rbSeq.exit_code !== 0) seqPush('INS02-PAIR-ROLLBACK', `staged 的 rollback 必须成功，实得 exit=${rbSeq.exit_code} / ${rbSeq.json?.error?.code ?? '(无码)'}：${String(rbSeq.stdout).slice(0, 200)}`)
      else {
        if (rbSeq.json?.applied !== true) seqPush('INS02-PAIR-ROLLBACK', `回滚没有真还原（applied=${JSON.stringify(rbSeq.json?.applied)} / status=${JSON.stringify(rbSeq.json?.status)}）—— 装→回一轮走成了空操作`)
        if (injectedAfterRollback.includes('新版')) seqPush('INS02-PAIR-CODE', `回滚之后代码还是新版（inject.js = ${JSON.stringify(injectedAfterRollback.trim().slice(0, 60))}）—— 回滚必须把代码退回去`)
        if (seqDataAfter.sha256 !== seqDataBefore.sha256) seqPush('INS02-PAIR-DATA', `装→回一轮把数据动了（${seqDataBefore.sha256} → ${seqDataAfter.sha256}）—— 回滚**只回代码不回数据**`)
        if (!existsSync(seq.dataFile)) seqPush('INS02-PAIR-DATA', '装→回一轮之后真实数据文件不见了')
        if (!seqReading.unknown_kept) seqPush('INS02-PAIR-UNKNOWN', '装→回一轮动了未知文件 —— 现场必须保留')
        if (remnants.length > 0) seqPush('INS02-PAIR-TEMP', `装→回一轮之后目标树里有临时件残渣（${remnants.join(' / ')}）—— 原子写的临时件必须清干净（按前缀扫，不钉死 \`.tmp\`）`)
      }
      // 控制 · 同一套载具**能报非 0**：`--require-backup` 指到一个不存在的备份 ⇒ 必须拒（exit != 0）
      const refusal = runScript(ROLLBACK, { op: 'rollback', extra: ['--target', seq.code, '--backup', path.join(seqRoot, 'no-such-backup'), '--require-backup'] })
      seqReading.refusal_control = { exit_code: refusal.exit_code, code: refusal.json?.error?.code ?? null }
      if (refusal.exit_code === 0) {
        seqPush('INS02-PAIR-CONTROL', '`--require-backup` 指到一个不存在的备份时竟然报成功 —— 这条腿的两个"exit 0"就是没有牙齿的')
      }
      seqReading.injector_after_refusal = existsSync(path.join(seq.code, 'inject.js')) ? readFileSync(path.join(seq.code, 'inject.js'), 'utf8').trim().slice(0, 80) : null
      if (seqReading.injector_after_refusal !== null && seqReading.injector_after_refusal.includes('新版')) {
        seqPush('INS02-PAIR-CONTROL', '被拒的那一次回滚把代码改回了新版（现场被动过）—— 拒必须零写入')
      }
      rec.readings.staged_pair_roundtrip = { ...seqReading, problem_codes: seqProblems.map((p) => p.code) }
      for (const p of seqProblems) push(p.code, `[腿④ 装→回一轮] ${p.message}`, p.detail)

      caseFail(problems)
    })
  })

  test('INS-03 发布物不含真实数据；备份在 E 盘带哈希清单；脚本无 C 盘默认临时', async () => {
    await runCase('INS-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const root = caseDir('INS-03', 'scan')
      if (!requireScript(problems, SCAN, '发布扫描')) caseFail(problems)

      // ① 发布扫描：发布物里不许有 .runtime / 私有数据；备份必须落 E 盘并带哈希清单
      const out = runScript(SCAN, { op: 'scan', extra: ['--release', root, '--backup', path.join(root, 'backup')] })
      rec.readings.scan = { exit_code: out.exit_code, code: out.json?.error?.code ?? null }
      if (out.exit_code !== 0) {
        push('INS03-SCAN', `release-scan 必须成功（正例），实得 exit=${out.exit_code} / ${out.json?.error?.code ?? '(无码)'}：${String(out.stdout).slice(0, 200)}`)
      } else {
        const findings = out.json?.findings ?? out.json?.problems ?? null
        rec.readings.scan_findings = findings
        const asText = JSON.stringify(findings ?? {})
        if (/\.runtime/.test(asText)) push('INS03-PRIVATE', `扫描把 .runtime 报成发布物里该有的东西：${asText.slice(0, 200)}`)
      }
      // ② 备份落点与哈希清单（§2.4 第 6 条）
      const backup = out.json?.backup ?? null
      rec.readings.backup = backup
      if (backup && backup.path && !String(backup.path).toUpperCase().startsWith('E:')) {
        push('INS03-BACKUP', `备份路径必须落 E 盘，实得 ${backup.path}`)
      }
      if (backup && !('manifest_path' in backup) && !('hash_manifest' in backup)) {
        push('INS03-BACKUP', '备份必须带**哈希清单**（§2.4 第 6 条），实得 ' + JSON.stringify(backup).slice(0, 160))
      }
      // ③ 三个脚本里不许有 C 盘默认临时/默认根（ENV-02 的规则在 staged 侧的那一半，这里就近再钉一次）
      let scanned = 0
      for (const cli of [INSTALL, ROLLBACK, SCAN]) {
        if (!stagingExists(path.join('bin', cli))) continue
        scanned += 1
        const text = readStagedText(path.join('bin', cli))
        text.split(/\r?\n/).forEach((line, i) => {
          if (/^\s*(\/\/|\*|#)/.test(line)) return
          if (/['"`]C:[\\/]/.test(line) && !/\.exe['"`]$/i.test(line)) push('INS03-C-DRIVE', `bin/${cli}:${i + 1} 出现 C 盘硬编码：${line.trim().slice(0, 120)}`)
          if (/tmpdir\s*\(\)/.test(line)) push('INS03-TEMP', `bin/${cli}:${i + 1} 用了默认 tmpdir()（默认在 C 盘）：${line.trim().slice(0, 120)}`)
        })
      }
      rec.readings.scanned_scripts = scanned
      // ④ Q3：`.gitignore` 两**条规则行**的顺序（先 staging，再在任何真实数据落盘前加 .runtime）
      // 🔴 v1.18 ⑤：**判据只许看规则行、不许看注释** ——
      //    原来直接对整份文本 `indexOf`，而 `.gitignore` L44 的**注释**里就写着 `presets/agenia/.runtime/`
      //    ⇒ 注释被算进了位置比较（注释一动判据就翻脸）。这里先剔掉注释行与空行，再定位。
      const gitignore = existsSync(path.join(PATHS.repo, '.gitignore')) ? readFileSync(path.join(PATHS.repo, '.gitignore'), 'utf8') : null
      const giRuleLines = gitignore === null
        ? []
        : gitignore.split(/\r?\n/).map((line, i) => ({ line, no: i + 1 })).filter((x) => x.line.trim() !== '' && !/^\s*#/.test(x.line))
      const giRules = giRuleLines.map((x) => x.line).join('\n')
      const findRule = (needle) => giRuleLines.find((x) => x.line.trim() === needle || x.line.trim().startsWith(needle)) ?? null
      const stagingRule = findRule('.tools/_staging/')
      const runtimeRule = findRule('presets/agenia/.runtime/')
      rec.readings.gitignore = {
        exists: gitignore !== null,
        rule_lines: giRuleLines.length,
        has_staging: stagingRule !== null,
        has_runtime: runtimeRule !== null,
        staging_rule_line: stagingRule?.no ?? null,
        runtime_rule_line: runtimeRule?.no ?? null,
        note: '只数**规则行**（剔掉注释与空行）；行号是 `.gitignore` 里的原始行号，便于人去核对',
      }
      if (gitignore !== null) {
        const stagingAt = stagingRule?.no ?? -1
        const runtimeAt = runtimeRule?.no ?? -1
        if (stagingAt >= 0 && runtimeAt >= 0 && stagingAt > runtimeAt) {
          push('INS03-GITIGNORE-ORDER', `拍板 Q3 冻了顺序：**先**加「.tools/_staging/」（规则行），**再**加「presets/agenia/.runtime/」—— 实得规则行 ${runtimeAt} 在 ${stagingAt} 之前（顺序相反）`)
        }
        if (runtimeAt >= 0 && !existsSync(path.join(PATHS.repo, 'presets', 'agenia', '.runtime'))) {
          rec.readings.gitignore_note = { note: '`.runtime` 那条**规则行**已加上，而真实 `.runtime` 仍不存在 ⇒ 顺序要求（"在任何真实数据落盘前"）成立。' }
        }
        // 自控：**注释里那个字面量不许影响判据**（v1.18 ⑤ 的复现）
        const commentOnly = gitignore.split(/\r?\n/).filter((l) => /^\s*#/.test(l)).some((l) => l.includes('presets/agenia/.runtime/'))
        rec.readings.gitignore_comment_trap = { comment_mentions_runtime: commentOnly, judged_on_rules_only: true }
      } else {
        push('INS03-GITIGNORE', '读不到 .gitignore —— Q3 的两行顺序无从检查')
      }
      caseFail(problems)
    })
  })
})
