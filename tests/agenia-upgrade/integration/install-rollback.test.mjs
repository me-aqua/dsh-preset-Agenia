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
 */
import { before, describe, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings, treeHash, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { loadStagedModule, readStagedText, runCli, stagingExists } from '../support/sut.mjs'

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

  test('INS-02 回滚只回代码不回数据；脚本零 import；失败保留现场', async () => {
    await runCase('INS-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const root = caseDir('INS-02', 'scene')
      const scene = makeScene(root)
      const dataBefore = treeHash(scene.data)
      if (!requireScript(problems, ROLLBACK, '回滚演练')) caseFail(problems)

      // ① Q6：回滚脚本**单文件自足、零 import**（静态）
      const src = readStagedText(path.join('bin', ROLLBACK))
      rec.readings.rollback_bytes = src.length
      const imports = src.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => /^\s*import\s|require\s*\(/.test(l) && !/^\s*(\/\/|\*)/.test(l))
      rec.readings.rollback_imports = imports.map(([n, l]) => `${n}: ${l.trim().slice(0, 100)}`)
      if (imports.length > 0) {
        push('INS02-ZERO-IMPORT', `回滚脚本里有 ${imports.length} 处 import/require —— 拍板 Q6：**单文件自足、零 import**（宁可重复三个小工具，也不让回滚依赖新代码）`)
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
