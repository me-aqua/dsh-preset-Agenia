/**
 * ENV-01 —— runner 自检与受控环境（集成层）。
 *
 * 冻结依据：契约 §6.12 ENV-01 + §2.2（运行入口）+ §2.4 第 1/2/3/8 条（data-root 硬规则 + **runner 自检**）
 * + 提案 §B1.2（env 变量表与"缺席即拒绝开工"）+ §B1.7（marker 三层 / 判定顺序 / canonical 解析）。
 *
 * 这一条查的是**两条腿**：
 *   ① **runner 自检**（今天就已经存在 —— `support/root-guard.mjs` 的 `enforceOrExit()`）：
 *      非法环境必须**在写任何被测文件之前**拒绝开工（非 0 退出），合法环境放行；
 *   ② **被测子进程继承的环境与产物路径**：子进程必须拿到 E 盘的 TEMP/TMP，且 CLI 自己也要拒 C 盘根
 *      （这一半要 staged CLI ⇒ 今天预期 RED）。
 *
 * ⚠️ 口径（契约 §2.4 第 8 条自己写的）：C 盘零写入只有"配置/受控路径 + 现场观察"支持，
 *    **不宣称**有 OS 级全盘写入监控。
 */
import { before, describe, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir, driveOf, isUnc, runsParentOf, REAL_BRAIN_ROOT, TEST_ROOT_MARKER } from '../support/root-guard.mjs'
import { childEnv, runBrain, stagingExists, writeFixture, writeFixtureText } from '../support/sut.mjs'

before(() => {
  preflight()
})

const GUARD_URL = 'file:///E:/Harness/tests/agenia-upgrade/support/root-guard.mjs'

/** 起一个**只跑守卫**的子进程（`enforceOrExit()`），把环境变量按场景覆盖。 */
function runGuardWith(envOverrides, { sink } = {}) {
  const script = [
    `import { enforceOrExit } from '${GUARD_URL}'`,
    'try { const r = enforceOrExit(); console.log(JSON.stringify({ ok: true, run_root: r.run_root ?? null })) }',
    "catch (err) { console.error(String(err && err.message)); process.exit(9) }",
  ].join('\n')
  const file = writeFixtureText('ENV-01', `guard-${Math.random().toString(36).slice(2, 8)}`, script, 'mjs')
  const res = spawnSync(process.execPath, [file], {
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  })
  if (sink !== undefined) writeFileSync(sink, `${res.stdout ?? ''}\n--- stderr ---\n${res.stderr ?? ''}\n`, 'utf8')
  return { exit_code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

describe('integration · env (ENV-01)', () => {
  test('ENV-01 非法环境在写任何 SUT 文件前被拒；合法环境全落 E；控制路径解析到 C 立刻红', async () => {
    await runCase('ENV-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const runRoot = canonical(process.env[ENV.RUN_ROOT])
      const runId = path.basename(runRoot)

      // ── ① runner 自检：合法环境必须放行（**先钉正例**）──────────────────
      const good = runGuardWith({})
      rec.readings.guard_good = { exit_code: good.exit_code, stdout: good.stdout.trim().slice(0, 200) }
      if (good.exit_code !== 0) {
        push('ENV01-POSITIVE', `合法环境跑守卫必须放行（正例），实得 exit=${good.exit_code}：${(good.stderr || good.stdout).trim().slice(0, 240)}`)
      }

      // ── ② runner 自检：四种非法环境**各自**必须先失败 ────────────────────
      //    （契约 §2.4 第 8 条：TEMP/TMP 不在 E 盘、或把 C 盘设成任何测试/临时根 ⇒ runner 先失败）
      //    ⚠️ 下面这些 C 盘字面量都是**负例输入**（喂给守卫、期望被拒），不是本代码要写的地方 ——
      //       标签里写明"非法"，ENV-02 的 C-DRIVE 规则按标记豁免并把它记进读数。
      const cases = [
        ['（非法）TEMP 指到 C 盘', { TEMP: 'C:\\Windows\\Temp', TMP: 'C:\\Windows\\Temp' }],
        ['（非法）TEMP/TMP 缺失', { TEMP: '', TMP: '' }],
        ['（非法）运行根指到 C 盘', { AGENIA_TEST_RUN_ROOT: 'C:\\agenia-run' }],
        ['（非法）运行根指到真实脑根', { AGENIA_TEST_RUN_ROOT: REAL_BRAIN_ROOT }],
        ['（非法）data-root 指到 C 盘', { AGENIA_TEST_DATA_ROOT: 'C:\\agenia-data' }],
        ['（非法）data-root 越界（运行根之外）', { AGENIA_TEST_DATA_ROOT: path.join(PATHS.repo, '.tools', '_scratch', 'env-01-outside') }],
        ['（非法）staging 指到活体预设', { AGENIA_STAGING_PRESET: PATHS.finalPreset }],
        ['（非法）运行根缺 marker', { AGENIA_TEST_RUN_ROOT: mkdirNoMarker('no-marker') }],
      ]
      const results = {}
      for (const [label, over] of cases) {
        const sink = path.join(runRoot, 'tmp', `guard-${label.replace(/[^\w]/g, '_')}.txt`)
        const res = runGuardWith(over, { sink })
        results[label] = { exit_code: res.exit_code, first_line: (res.stderr || res.stdout).trim().split(/\r?\n/)[0]?.slice(0, 160) ?? '' }
        if (res.exit_code === 0) push('ENV01-REJECT', `「${label}」必须**拒绝开工**（非 0 退出），实得 exit=0`)
      }
      rec.readings.guard_cases = results

      // ── ③ 拒绝必须发生在**写任何被测文件之前** ─────────────────────────
      //    （同样是非法姿势：TEMP 故意指到 C 盘 + 运行根故意缺 marker）
      const probeDir = mkdirNoMarker('probe')
      const res = runGuardWith({ AGENIA_TEST_RUN_ROOT: probeDir, TEMP: 'C:\\Windows\\Temp', TMP: 'C:\\Windows\\Temp' }) // （非法姿势：TEMP 指 C 盘 + 运行根缺 marker）
      const wrote = existsSync(path.join(probeDir, TEST_ROOT_MARKER))
      rec.readings.no_write_before_reject = { exit_code: res.exit_code, marker_written: wrote }
      if (res.exit_code === 0) push('ENV01-ORDER', '非法环境没有拦住开工')
      if (wrote) push('ENV01-ORDER', '守卫在拒绝之前就往运行根写了 marker —— 拒绝必须在**写任何东西之前**')

      // ── ④ 被测子进程继承的环境：TEMP/TMP 必须落 E 盘的运行根 tmp ─────────
      const inherited = childEnv()
      const tmp = inherited.TEMP
      rec.readings.child_env = { TEMP: inherited.TEMP, TMP: inherited.TMP, run_root: inherited[ENV.RUN_ROOT] ?? null }
      if (!tmp || isUnc(tmp) || driveOf(tmp) !== 'E:') push('ENV01-CHILD-ENV', `子进程的 TEMP 必须在 E 盘，实得 ${JSON.stringify(tmp)}`)
      if (!String(tmp).toLowerCase().includes(runId.toLowerCase())) {
        push('ENV01-CHILD-ENV', `子进程的 TEMP 应当落在本次运行根里（${runId}），实得 ${tmp}`)
      }

      // ── ⑤ CLI 那一半：被测命令自己也要拒 C 盘根（要 staged CLI ⇒ 预期 RED）──
      if (!stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ "被测子进程拒 C 盘根 / 产物全落受控根"这一半拿不到（预期的首跑红）')
      } else {
        // 非法姿势：把 C 盘当 data-root 喂给被测 CLI（期望它非 0 退出、零写入）
        const bad = runBrain('init', {}, { dataRoot: 'C:\\agenia-env-01' }) // （非法姿势：C 盘 data-root，期望被测 CLI 拒绝）
        rec.readings.cli_c_drive = { exit_code: bad.exit_code, code: bad.json?.error?.code ?? null }
        if (bad.exit_code === 0) push('ENV01-CLI', 'CLI 用 C 盘 data-root 竟然成功 —— 必须非 0 退出零写入')
        const legal = runBrain('init', {}, { dataRoot: ensureMarkedDir(path.join(runRoot, 'env01-legal'), { runRoot, runId, kind: 'agenia-test-brain-root' }) })
        rec.readings.cli_legal = { exit_code: legal.exit_code, code: legal.json?.error?.code ?? null }
        if (legal.exit_code !== 0) push('ENV01-CLI', `CLI 在合法 E 根上必须成功（正例），实得 ${legal.exit_code} / ${legal.json?.error?.code ?? '(无码)'}`)
      }

      // ── ⑥ "日志明示根路径" ─────────────────────────────────────────────
      const stderrText = `${good.stderr}${good.stdout}`
      rec.readings.log_lines = stderrText.trim().split(/\r?\n/).slice(0, 6)
      if (good.exit_code !== 0 || !stderrText.includes(runRoot)) {
        // 守卫成功时不一定打印（它是"静默放行"）；这一条只在拒绝时必须明示根路径
        rec.readings.log_note = { note: '守卫**放行**时不强求打印；但**拒绝**时必须把出问题的路径写出来（下面按 case 的首行读数检查）。' }
      }
      const rejectLines = Object.entries(results).filter(([, r]) => r.exit_code !== 0).map(([label, r]) => `${label}: ${r.first_line}`)
      rec.readings.reject_lines = rejectLines
      for (const [label, r] of Object.entries(results)) {
        if (r.exit_code !== 0 && r.first_line === '') push('ENV01-LOG', `「${label}」被拒但没打印任何原因 —— 拒绝要说清是哪条路径不合法`)
      }
      // ── ⑦ 运行根的**格子白名单**：两个格子都认，别处仍拒 ─────────────────────
      //    被测：`runsParentOf()`（纯字符串判定，不摸盘）—— 合法运行根的父目录只有
      //    `.team\test`（测试岗）与 `.team\retro`（技术评审岗），各写各的 `<日期>\_runs\<RUN_ID>`。
      //    ⚠️ 为什么单独量它：`guardVerdict()` 里**格子判定在 marker 判定下游** —— 根没 marker 时
      //    它先返回 `E_ROOT_NO_MARKER`，`_runs`/格子那一段根本不进。所以"越界的根被拒了"这句话
      //    只有**带 marker** 的根才说明是格子那一关拒的（那份读数在 `.team/test/2026-10-21/F3-rootcells/`）。
      const cellRows = [
        ['测试岗格子', path.join(PATHS.repo, '.team', 'test', '2026-10-21', '_runs', 'env01-cell'), path.join(PATHS.repo, '.team', 'test')],
        ['技术评审格子', path.join(PATHS.repo, '.team', 'retro', '2026-10-21', '_runs', 'env01-cell'), path.join(PATHS.repo, '.team', 'retro')],
        ['（非法）两格之外：.tools/_scratch', path.join(PATHS.repo, '.tools', '_scratch', '_runs', 'env01-cell'), null],
        ['（非法）隔壁抽屉：.team/leader', path.join(PATHS.repo, '.team', 'leader', '2026-10-21', '_runs', 'env01-cell'), null],
        ['（非法）前缀不算：.team/test-evil', `${path.join(PATHS.repo, '.team')}\\test-evil\\2026-10-21\\_runs\\env01-cell`, null],
        ['（非法）前缀不算：.team/retro2', `${path.join(PATHS.repo, '.team')}\\retro2\\2026-10-21\\_runs\\env01-cell`, null],
      ]
      rec.readings.runs_parents = cellRows.map(([label, root, want]) => ({ label, root, got: runsParentOf(root), want }))
      for (const [label, root, want] of cellRows) {
        const got = runsParentOf(root)
        const same = want === null ? got === null : String(got).toLowerCase() === want.toLowerCase()
        if (!same) push('ENV01-RUN-CELL', `「${label}」的运行根格子判定错了：${root} ⇒ 实得 ${JSON.stringify(got)} / 期望 ${JSON.stringify(want)}`)
      }

      rec.readings.caveat = { note: 'C 盘零写入只有"配置/受控路径 + 现场观察"支持；不宣称 OS 级全盘监控（契约 §2.4 第 8 条）。' }

      caseFail(problems)
    })
  })
})

/**
 * 造一个**不带 marker**的运行根样本（用来验 `E_ROOT_NO_MARKER`）。
 * 🔴 **绝不许碰运行根自己**：第一版写成 `mkdirNoMarker(runId)`，它解析出来就是**当前运行根**，
 *    然后把这个活着的运行根的 marker 删掉了 ⇒ 后面每个测试文件的预检全部 `E_ROOT_NO_MARKER`、
 *    整轮被取消（RUN_ID `20261014-red-13` 就是这么废掉的）。所以这里显式挡住"样本 == 运行根"。
 */
function mkdirNoMarker(suffix) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const dir = path.join(path.dirname(runRoot), `${path.basename(runRoot)}-${suffix}`)
  if (canonical(dir) === runRoot) throw new Error('拒绝：不许拿当前运行根本身当"缺 marker"样本')
  mkdirSync(dir, { recursive: true })
  const marker = path.join(dir, TEST_ROOT_MARKER)
  if (existsSync(marker)) rmSync(marker, { force: true })
  return dir
}
