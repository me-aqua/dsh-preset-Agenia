/**
 * DR-01 / DR-02 / DR-03 —— data-root 隔离与两根分舱（集成层）。
 *
 * 冻结依据：契约 §6.10 + §2.4（data-root 硬规则八条）+ 提案 §B1.4（三个 CLI 的 op 表 +
 * `--data-root` 必填 / `--workspace` / `--test-mode`）+ §B1.5（`dataRootVerdict` / `resolveWithin` / `testModeOf`）
 * + §B1.7（marker 三层 + 判定顺序 + canonical 解析）+ §B1.6（`bg-notify` 四个作业的投递接缝）。
 *
 * 三条口径：
 *   · **分母是清单**（`lib/cli-inventory.mjs` 的 `COMMANDS`）：清单没列的共享写命令不许存在；
 *     清单与冻结 op 表对不上也要红（新增 op 必须同批进清单、进测试）。
 *   · **正例必须存在**：只有"合法测试根写成功"这一侧过了，"拒绝"才不是"命令坏掉蒙对"（§9.5 第 1 条）。
 *   · 真实根前后哈希随每个会写盘的子用例记（§2.4 第 5 条）；任何变化 = **安全违规**，不是普通红。
 */
import { before, describe, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN, PATHS } from '../support/env.mjs'
import {
  caseFail,
  preflight,
  problem,
  realRootsSnapshot,
  runCase,
  sha256File,
  stagingReadings,
  treeHash,
} from '../support/evidence.mjs'
import { canonical, driveOf, ensureMarkedDir, isUnc, REAL_BRAIN_ROOT, REAL_ROUTE_ROOT } from '../support/root-guard.mjs'
import { brainPaths, loadStagedModule, routePaths, runBrain, runCli, runRoute, stagingExists, writeFixture } from '../support/sut.mjs'

before(() => {
  preflight()
})

/** 冻结 op 表 → `[{cli, op, writes, needsDataRoot}]`（DR-01 的第二个分母）。 */
const FROZEN_COMMANDS = Object.entries(FROZEN.ops).flatMap(([cli, ops]) =>
  ops.map(({ op, writes }) => ({ cli, op, writes, needsDataRoot: cli === 'agenia-brain.mjs' })),
)

function scenarioWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/** 非法根的姿势表（§2.4 第 3 条 + §B1.7 第 4 条：大小写/尾斜杠/`..`/junction 都要先 canonical 再判）。 */
function badRootPostures() {
  const real = PATHS.realBrainRoot
  const reg = PATHS.stagedPreset
  const outside = path.join(PATHS.repo, '.tools', '_scratch', 'agenia-dr-outside')
  return [
    ['省略 --data-root', { mode: 'omit' }],
    ['空串', { mode: 'value', value: '' }],
    ['相对路径', { mode: 'value', value: 'brain-root' }],
    ['真实脑根（原样）', { mode: 'value', value: real }],
    ['真实脑根（大写盘符）', { mode: 'value', value: real.replace(/^E:/, 'e:') }],
    ['真实脑根（尾斜杠）', { mode: 'value', value: `${real}\\` }],
    ['真实脑根（`..` 绕一下）', { mode: 'value', value: path.join(real, '..', '.runtime') }],
    ['C 盘（非法姿势）', { mode: 'value', value: 'C:\\Windows\\Temp\\agenia-dr' }],
    ['UNC', { mode: 'value', value: '\\\\127.0.0.1\\share\\agenia-dr' }],
    ['运行根之外', { mode: 'value', value: outside }],
  ].map(([label, spec]) => ({ label, spec, real, reg }))
}

describe('integration · data-root (DR)', () => {
  test('DR-01 命令清单 × 五种姿势：非法一律非零退出零写入（合法根必须写成功）', async () => {
    await runCase('DR-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const realBefore = treeHash(REAL_BRAIN_ROOT)

      // ── ① 清单本身（分母）：必须存在、必须与冻结 op 表一致 ──────────────
      const inv = await loadStagedModule('lib/cli-inventory.mjs', [])
      let commands = null
      if (inv.surfaceMissing) {
        push('SUT-SURFACE-MISSING', 'staged/lib/cli-inventory.mjs 不在 —— DR 的分母（命令清单）拿不到（预期的首跑红）')
      } else if (inv.mod === null) {
        push('CLI-INVENTORY', `lib/cli-inventory.mjs 载入失败：${inv.errors.join(' / ')}`)
      } else if (!Array.isArray(inv.mod.COMMANDS)) {
        push('CLI-INVENTORY', 'lib/cli-inventory.mjs 必须导出 COMMANDS 数组（提案 §B1.4 口径）')
      } else {
        commands = inv.mod.COMMANDS
        rec.readings.inventory_count = commands.length
        const shapeBad = commands.filter((c) => typeof c?.cli !== 'string' || typeof c?.op !== 'string' || typeof c?.writes !== 'boolean' || typeof c?.needsDataRoot !== 'boolean')
        if (shapeBad.length > 0) push('CLI-INVENTORY', `清单条目必须形如 {cli, op, writes, needsDataRoot}，这些不合格：${JSON.stringify(shapeBad.slice(0, 3))}`)
        const frozenKey = (c) => `${c.cli}#${c.op}`
        const got = new Set(commands.map(frozenKey))
        const want = new Set(FROZEN_COMMANDS.map(frozenKey))
        const missingInInventory = FROZEN_COMMANDS.filter((c) => !got.has(frozenKey(c))).map(frozenKey)
        const extraInInventory = commands.filter((c) => !want.has(frozenKey(c))).map(frozenKey)
        rec.readings.inventory_diff = { missing: missingInInventory, extra: extraInInventory }
        if (missingInInventory.length > 0) push('CLI-INVENTORY', `清单漏了冻结 op 表里的命令：${missingInInventory.join(', ')}`)
        if (extraInInventory.length > 0) push('CLI-INVENTORY', `清单里多出冻结 op 表没有的命令（新增 op 必须同批进冻结表与测试）：${extraInInventory.join(', ')}`)
        for (const c of commands) {
          const want0 = FROZEN_COMMANDS.find((f) => frozenKey(f) === frozenKey(c))
          if (!want0) continue
          if (c.writes !== want0.writes) push('CLI-INVENTORY', `${frozenKey(c)} 的 writes 实得 ${c.writes}，冻结 ${want0.writes}`)
          if (c.needsDataRoot !== want0.needsDataRoot) push('CLI-INVENTORY', `${frozenKey(c)} 的 needsDataRoot 实得 ${c.needsDataRoot}，冻结 ${want0.needsDataRoot}`)
        }
      }

      // ── ② 纯函数：dataRootVerdict 的判定顺序 + canonical 解析 ───────────
      const pathLib = await loadStagedModule('lib/paths.mjs', ['dataRootVerdict', 'resolveWithin', 'testModeOf'])
      if (pathLib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/paths.mjs 不在 —— 根判定拿不到（预期的首跑红）')
      for (const n of pathLib.missing) push('SUT-SURFACE-MISSING', `staged/lib/paths.mjs 没有导出 ${n}`)
      if (pathLib.mod?.dataRootVerdict) {
        const v = pathLib.mod.dataRootVerdict
        const opts = { testMode: true, markerExists: true, realRoots: [REAL_BRAIN_ROOT, REAL_ROUTE_ROOT], driveOf }
        const cases = [
          ['缺失', undefined, 'E_ROOT_MISSING', { ...opts, markerExists: false }],
          ['空串', '', 'E_ROOT_MISSING', { ...opts, markerExists: false }],
          ['相对', 'brain-root', 'E_ROOT_RELATIVE', { ...opts, markerExists: false }],
          ['UNC', '\\\\server\\share', 'E_ROOT_UNC', { ...opts, markerExists: false }],
          ['C 盘（非法姿势）', 'C:\\Temp\\agenia', 'E_ROOT_C_DRIVE', { ...opts, markerExists: false }],
          ['真实脑根', REAL_BRAIN_ROOT, 'E_ROOT_REAL_BRAIN', opts],
          ['真实脑根（`.team/review/../../` 绕）', `${REAL_BRAIN_ROOT}\\..\\.runtime`, 'E_ROOT_REAL_BRAIN', opts],
          ['测试模式无 marker', PATHS.stagedPreset, 'E_ROOT_NO_MARKER', { ...opts, markerExists: false }],
          ['合法测试根', `${PATHS.repo}\\.team\\test\\2026-10-14\\_runs\\20261014-red-x`, null, opts],
        ]
        const got = {}
        for (const [label, raw, wantCode, o] of cases) {
          let out = null
          try { out = v(raw, o) } catch (err) { push('ROOT-VERDICT', `dataRootVerdict(${label}) 抛错：${String(err.message).slice(0, 160)}`); continue }
          got[label] = { ok: out?.ok ?? null, code: out?.code ?? null }
          if (wantCode === null) {
            if (out?.ok !== true) push('ROOT-VERDICT', `${label} 应当通过，实得 ok=${out?.ok} code=${out?.code}`)
          } else if (out?.ok !== false || out?.code !== wantCode) {
            push('ROOT-VERDICT', `${label} 应为 ${wantCode}，实得 ok=${out?.ok} code=${out?.code}`)
          }
        }
        rec.readings.root_verdict = got
        // 顺序冻结：同一输入必须每次同一个码（不许"有时报这个有时报那个"）
        const twice = [v(REAL_BRAIN_ROOT, opts)?.code, v(REAL_BRAIN_ROOT, opts)?.code]
        if (twice[0] !== twice[1]) push('ROOT-VERDICT-ORDER', `同一输入两次得到不同码：${JSON.stringify(twice)}（判定顺序必须冻结）`)
      }
      if (pathLib.mod?.resolveWithin) {
        const base = `${PATHS.repo}\\.team\\test`
        const cases = [
          ['普通子路径', 'a/b.json', true],
          ['`..` 穿越', '..\\..\\AGENTS.md', false],
          ['绝对逃逸', 'E:\\Harness\\AGENTS.md', false],
        ]
        const got = {}
        for (const [label, target, wantOk] of cases) {
          let out = null
          try { out = pathLib.mod.resolveWithin(base, target) } catch (err) { push('RESOLVE-WITHIN', `resolveWithin(${label}) 抛错：${String(err.message).slice(0, 140)}`); continue }
          got[label] = { ok: out?.ok ?? null, code: out?.code ?? null }
          if (Boolean(out?.ok) !== wantOk) push('RESOLVE-WITHIN', `${label} 应当 ok=${wantOk}，实得 ok=${out?.ok} code=${out?.code}`)
          if (wantOk === false && out?.code !== 'E_PATH_ESCAPE') push('RESOLVE-WITHIN', `${label} 的码应为 E_PATH_ESCAPE，实得 ${out?.code}`)
        }
        rec.readings.resolve_within = got
      }
      if (pathLib.mod?.testModeOf) {
        const got = {}
        try {
          got['{testMode:true}'] = pathLib.mod.testModeOf({ testMode: true })
          got['{}（本进程有 AGENIA_TEST_RUN_ROOT）'] = pathLib.mod.testModeOf({})
        } catch (err) { push('TEST-MODE', `testModeOf 抛错：${String(err.message).slice(0, 140)}`) }
        rec.readings.test_mode = got
        if (got['{testMode:true}'] !== true) push('TEST-MODE', `testModeOf({testMode:true}) 必须为 true，实得 ${got['{testMode:true}']}`)
      }

      // ── ③ 逐命令 × 逐姿势（真子进程）────────────────────────────────────
      if (!stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 逐命令的 data-root 矩阵跑不起来（预期的首跑红）')
      }
      const writeCommands = (commands ?? []).filter((c) => c.writes === true && c.needsDataRoot === true)
      rec.readings.write_commands = writeCommands.map((c) => `${c.cli}#${c.op}`)
      const postureResults = {}
      for (const cmd of writeCommands) {
        for (const { label, spec } of badRootPostures()) {
          const payloadFile = writeFixture('DR-01', `${cmd.op}-${label.replace(/[^\w]/g, '')}`.slice(0, 40), {})
          const extra = spec.mode === 'value' ? ['--data-root', spec.value] : []
          let res = null
          try {
            res = runCli(cmd.cli, { op: cmd.op, dataRoot: undefined, inFile: payloadFile, testMode: true, extra }, { env: process.env })
          } catch (err) {
            postureResults[`${cmd.op}/${label}`] = { threw: String(err.message).slice(0, 120) }
            continue
          }
          postureResults[`${cmd.op}/${label}`] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
          if (res.exit_code === 0) {
            push('DR-ILLEGAL-ACCEPTED', `${cmd.cli}#${cmd.op} 用「${label}」竟然成功了（exit 0）—— 非法根必须非零退出、零写入`)
          } else if (!res.json?.error?.code) {
            push('DR-ILLEGAL-NOCODE', `${cmd.cli}#${cmd.op} 用「${label}」被拒但没给稳定错误码（stdout=${res.stdout.trim().slice(0, 160)}）`)
          }
        }
        // 正向对照（§2.4 第 4 条）：合法测试根必须**不被当成根问题拒掉**。
        // 🔴 这里**不能**要求"每个写命令都 exit 0"：同一个根上连跑 `init`/`judge-commit`/`claim-update`…
        //    本来就会因为**状态次序**失败（`E_DATA_EXISTS`/`E_DATA_MISSING`）—— 那是**假红**，
        //    与"根合法不合法"无关（这一条是交付前自查抓到的）。
        //    所以判据是：① 干净的合法根上 `init` 必须成功（硬正例，证明命令本身可用、根被接受）；
        //              ② 其余命令只要**不是**被 `E_ROOT_*`/`E_PATH_ESCAPE` 拒的就算过。
        const okFile = writeFixture('DR-01', `${cmd.op}-legal`.slice(0, 40), {})
        const okRes = runCli(cmd.cli, { op: cmd.op, dataRoot: process.env[ENV.TEST_DATA_ROOT], inFile: okFile, testMode: true }, { env: process.env })
        const okCode = okRes.json?.error?.code ?? null
        postureResults[`${cmd.op}/合法测试根`] = { exit_code: okRes.exit_code, code: okCode }
        if (okRes.exit_code !== 0 && /^E_ROOT_|^E_PATH_/.test(String(okCode))) {
          push('DR-POSITIVE', `${cmd.cli}#${cmd.op} 在合法测试根上被**根判定**拒了（${okCode}）—— 合法根不许被当成隔离问题：${okRes.stdout.trim().slice(0, 200)}`)
        }
      }
      // 硬正例：干净的合法根上 init 必须成功
      const freshRoot = scenarioWorkspace('DR-01', 'positive-root')
      const initRes = runCli('agenia-brain.mjs', { op: 'init', dataRoot: freshRoot, inFile: writeFixture('DR-01', 'init-legal', {}), testMode: true }, { env: process.env })
      rec.readings.positive_init = { exit_code: initRes.exit_code, code: initRes.json?.error?.code ?? null }
      if (initRes.exit_code !== 0) {
        push('DR-POSITIVE', `干净合法根上的 init 必须成功（正向对照），实得 exit=${initRes.exit_code} / ${initRes.json?.error?.code ?? '(无码)'}：${initRes.stdout.trim().slice(0, 200)}`)
      }
      rec.readings.postures = postureResults

      // ── ④ 零写入 / 真实根不变 ──────────────────────────────────────────
      const realAfter = treeHash(REAL_BRAIN_ROOT)
      rec.readings.real_brain = { before: realBefore, after: realAfter }
      if (realBefore.exists !== realAfter.exists || (realBefore.exists && realBefore.sha256 !== realAfter.sha256)) {
        push('SECURITY-VIOLATION', `真实脑根在 DR-01 期间被改动（${realBefore.exists ? realBefore.sha256 : '不存在'} → ${realAfter.exists ? realAfter.sha256 : '不存在'}）—— 立即停测并报事故，不许自行清理现场`)
      }
      if (existsSync(REAL_BRAIN_ROOT)) push('SECURITY-VIOLATION', `真实脑根 ${REAL_BRAIN_ROOT} 竟然存在了 —— 本轮它必须是不存在的状态`)

      caseFail(problems)
    })
  })

  test('DR-02 所有可写命令只落测试根；真实根逐字节不变；临时件全在 E 盘', async () => {
    await runCase('DR-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const before = realRootsSnapshot()

      const bp = brainPaths()
      const inv = await loadStagedModule('lib/cli-inventory.mjs', [])
      const commands = Array.isArray(inv.mod?.COMMANDS) ? inv.mod.COMMANDS : null
      if (commands === null) {
        push('SUT-SURFACE-MISSING', 'staged/lib/cli-inventory.mjs（或它的 COMMANDS）不在 ⇒ DR-02 的清单分母拿不到（预期的首跑红）')
      }

      // ① 每个 needsDataRoot 的命令在合法测试根上跑一遍，产物必须全在测试根里
      const runResults = {}
      for (const cmd of (commands ?? []).filter((c) => c.needsDataRoot === true)) {
        const payloadFile = writeFixture('DR-02', cmd.op.slice(0, 40), {})
        let res = null
        try {
          res = runCli(cmd.cli, { op: cmd.op, dataRoot: bp.root, inFile: payloadFile, testMode: true }, { env: process.env })
        } catch (err) {
          runResults[cmd.op] = { threw: String(err.message).slice(0, 120) }
          continue
        }
        runResults[cmd.op] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
      }
      rec.readings.command_runs = runResults
      const bpAfter = treeHash(bp.root)
      rec.readings.test_root_tree = { exists: bpAfter.exists, count: bpAfter.count, sha256: bpAfter.sha256 }
      // 正向对照（§2.4 第 4 条）：干净的合法测试根上 `init` 必须成功，而且在测试根里**留下产物**。
      // 🔴 不要求"每个写命令都成功"：同一个根上按任意顺序连跑，状态次序本身就会让一部分失败
      //    （`E_DATA_EXISTS`/`E_DATA_MISSING`）—— 那是假红（交付前自查抓到的一条）。
      const freshRoot = scenarioWorkspace('DR-02', 'all-commands')
      const initRes = runCli('agenia-brain.mjs', { op: 'init', dataRoot: freshRoot, inFile: writeFixture('DR-02', 'init-legal', {}), testMode: true }, { env: process.env })
      rec.readings.positive_init = { exit_code: initRes.exit_code, code: initRes.json?.error?.code ?? null }
      if (initRes.exit_code !== 0) {
        push('DR-POSITIVE', `干净合法根上的 init 必须成功（正向对照），实得 exit=${initRes.exit_code} / ${initRes.json?.error?.code ?? '(无码)'}：${initRes.stdout.trim().slice(0, 200)}`)
      }
      const freshTree = treeHash(freshRoot)
      rec.readings.positive_root_tree = { exists: freshTree.exists, count: freshTree.count }
      if (freshTree.count === 0) push('DR-POSITIVE', '合法测试根上跑完 init 之后一个产物都没有 —— 正例不成立（"没写出去"和"写对了地方"必须分得开）')
      if (bpAfter.count === 0) push('DR-POSITIVE', `共享测试根 ${bp.root} 上一个产物都没有 —— 清单里的命令没在测试根里落下东西`)

      // ② 临时件落点：运行根 tmp 里不许留 .tmp-* 残渣；真实预设目录里也不许有
      const leftovers = []
      for (const dir of [path.join(PATHS.repo, '.team', 'test', '2026-10-14', '_runs'), PATHS.finalPreset]) {
        const t = treeHash(dir)
        for (const f of t.files ?? []) if (/\.tmp-|\.partial$/i.test(f.rel)) leftovers.push(`${dir}\\${f.rel}`)
      }
      rec.readings.temp_leftovers = leftovers
      if (leftovers.length > 0) push('TEMP-LEFTOVER', `发现临时件残渣（原子写的临时文件必须同目录 rename 掉）：${leftovers.slice(0, 5).join(', ')}`)

      // ③ 四个作业以测试根输入：投递必须只改测试根
      const notifyOk = stagingExists(path.join('bin', 'bg-notify.mjs'))
      if (!notifyOk) {
        push('SUT-SURFACE-MISSING', 'staged/bin/bg-notify.mjs 不在 ⇒ 四作业以测试根输入的接缝拿不到（预期的首跑红）')
      } else {
        const ws = scenarioWorkspace('DR-02', 'jobs')
        const jobResults = {}
        for (const job of FROZEN.jobs) {
          const resultFile = writeFixture('DR-02', `${job.role}-result`.slice(0, 40), { ok: true, role: job.role })
          const res = runCli('bg-notify.mjs', {
            op: 'deliver', dataRoot: bp.root,
            extra: ['--status-root', path.join(ws, '.team'), '--job', job.role, '--job-id', `job-${job.role}-1`, '--state', 'done', '--result-file', resultFile],
          }, { env: process.env })
          jobResults[job.role] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
        }
        rec.readings.job_deliveries = jobResults
        for (const [role, r] of Object.entries(jobResults)) {
          if (r.exit_code !== 0) push('NOTIFY', `bg-notify deliver（${role}）必须成功（接缝正例），实得 exit=${r.exit_code} / ${r.code ?? '(无码)'}`)
        }
      }

      // ④ 真实根逐字节不变（安全不变量）
      const after = realRootsSnapshot()
      rec.readings.real_roots = { before, after }
      for (const key of ['brain', 'route']) {
        const b = before[key]
        const a = after[key]
        if (b.exists !== a.exists || (b.exists && b.sha256 !== a.sha256)) {
          push('SECURITY-VIOLATION', `真实根 ${key} 在 DR-02 期间被改动（${b.exists ? b.sha256 : '不存在'} → ${a.exists ? a.sha256 : '不存在'}）—— 立即停测并报事故`)
        }
      }
      if (before.livePreset.sha256 !== after.livePreset.sha256) {
        push('SECURITY-VIOLATION', `活体预设树哈希在 DR-02 期间变了（${before.livePreset.sha256} → ${after.livePreset.sha256}）`)
      }
      rec.readings.controlled_env = {
        temp: process.env.TEMP ?? null,
        tmp: process.env.TMP ?? null,
        run_root: process.env[ENV.RUN_ROOT] ?? null,
        data_root: process.env[ENV.TEST_DATA_ROOT] ?? null,
      }
      for (const [k, v] of Object.entries(rec.readings.controlled_env)) {
        if (!v) continue
        if (isUnc(v) || driveOf(v) !== 'E:') push('ENV-DRIVE', `${k} 不在 E 盘：${v}`)
      }
      rec.readings.caveat = { note: '受控路径层面的证明；不是全机监控（契约 §11.4 第 2 条）。' }

      caseFail(problems)
    })
  })

  test('DR-03 脑根与路线工作区分舱：票写测试工作区、脑命令不产路线产物、错根被拒', async () => {
    await runCase('DR-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const realRouteBefore = treeHash(REAL_ROUTE_ROOT)

      const ws = scenarioWorkspace('DR-03', 'split')
      const rp = routePaths({ ...process.env, [ENV.TEST_WORKSPACE]: ws })
      const bp = brainPaths()

      // ① 路线侧：updater 写测试工作区的 .team/route，脑根不许因此起变化
      const brainBefore = treeHash(bp.root)
      if (!stagingExists(path.join('bin', 'agenia-route.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-route.mjs 不在 ⇒ 路线侧写面拿不到（预期的首跑红）')
      } else {
        const init = runRoute('DR-03', 'init', {
          goal: { id: 'agenia-upgrade', title: 'Agenia 升级' },
          stages: [{ id: 'plan', name: '计划阶段', order: 1, state: 'current' }],
          current_stage_id: 'plan',
        }, { workspace: ws })
        rec.readings.route_init = { exit_code: init.exit_code, code: init.json?.error?.code ?? null }
        if (init.exit_code !== 0) push('ROUTE-WRITE', `路线 init 必须写进测试工作区（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
        else {
          if (!existsSync(rp.current)) push('ROUTE-LOCATION', `路线 current.json 没落在 ${rp.current}（票只许写测试工作区的 .team/route）`)
          if (existsSync(path.join(bp.root, 'route'))) push('ROUTE-LOCATION', '路线产物出现在了脑根里（两根混写 —— P2-V6 的残余项）')
          if (existsSync(path.join(ws, '.team', 'route', 'current.json'))) {
            const t = runRoute('DR-03', 'ticket-open', {
              title: '（夹具）分舱验证', source: `technical-review:${'a'.repeat(64)}#F1`, next_step: '无', acceptance: '票落在测试工作区',
              version: init.json.version,
            }, { workspace: ws })
            rec.readings.ticket_open = { exit_code: t.exit_code, code: t.json?.error?.code ?? null }
            if (t.exit_code === 0) {
              const cur = JSON.parse(readFileSync(rp.current, 'utf8'))
              if (!Array.isArray(cur.tickets) || cur.tickets.length === 0) push('ROUTE-TICKET', '成功开票之后 current.json.tickets 里没有票')
              if (existsSync(path.join(bp.root, 'tickets'))) push('ROUTE-LOCATION', '票出现在了脑根里')
            } else {
              push('ROUTE-TICKET', `ticket-open 必须成功（正例），实得 exit=${t.exit_code} / ${t.json?.error?.code ?? '(无码)'}`)
            }
          }
        }
      }
      const brainAfterRoute = treeHash(bp.root)
      rec.readings.brain_tree = { before: brainBefore, after_route_ops: brainAfterRoute }
      if (brainBefore.exists !== brainAfterRoute.exists || (brainBefore.exists && brainBefore.sha256 !== brainAfterRoute.sha256)) {
        push('ROOT-MIX', `路线操作改动了脑根（${brainBefore.sha256} → ${brainAfterRoute.sha256}）—— 两根必须分舱`)
      }

      // ② 脑侧：共享脑命令写 data-root，路线工作区不许因此起变化
      const routeBefore = treeHash(path.join(ws, '.team', 'route'))
      if (!stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 脑侧写面拿不到（预期的首跑红）')
      } else {
        // 🔴 v1.17 ②：**自己的空脑根**（照 DR-01/02 的 `scenarioWorkspace` 一行）。
        //    根因：本批补上 `cli-inventory.mjs` 之后 DR-01 的矩阵才真跑，共享脑根已被它 `init` 占掉 ⇒
        //    这里再 `init` 必撞 D-B3（"init 只在空根成功"）⇒ 硬正例假红。
        const brainRoot03 = scenarioWorkspace('DR-03', 'own-brain-root')
        const init = runBrain('init', {}, { dataRoot: brainRoot03 })
        rec.readings.brain_init = { exit_code: init.exit_code, code: init.json?.error?.code ?? null, root: brainRoot03 }
        if (init.exit_code !== 0) push('BRAIN-WRITE', `脑 init 必须写进 data-root（正例，独立空根），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
        if (existsSync(path.join(ws, '.team', 'route', 'current.json')) === false && existsSync(ws)) {
          // 路线没被脑命令创建出来即可
          rec.readings.route_untouched_by_brain = true
        }
      }
      const routeAfter = treeHash(path.join(ws, '.team', 'route'))
      if (routeBefore.exists && routeAfter.exists && routeBefore.sha256 !== routeAfter.sha256) {
        push('ROOT-MIX', `脑侧命令改动了路线工作区（${routeBefore.sha256} → ${routeAfter.sha256}）—— 两根必须分舱`)
      }

      // ③ 错根读取：拿另一个根去读预期产物必须明确失败，不许"读到一个像样的空结果"
      if (stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        const wrongRead = runCli('agenia-brain.mjs', { op: 'state-read', dataRoot: ws, inFile: writeFixture('DR-03', 'wrong-root', {}), testMode: true }, { env: process.env })
        rec.readings.wrong_root_read = { exit_code: wrongRead.exit_code, code: wrongRead.json?.error?.code ?? null }
        if (wrongRead.exit_code === 0) push('WRONG-ROOT', `用路线工作区当脑根去读状态竟然成功 —— 错根必须被拒（或明确 E_DATA_MISSING）`)
      }
      if (stagingExists(path.join('bin', 'agenia-route.mjs'))) {
        const wrongRoute = runCli('agenia-route.mjs', { op: 'read', workspace: bp.root, inFile: writeFixture('DR-03', 'wrong-route', {}), testMode: true }, { env: process.env })
        rec.readings.wrong_route_read = { exit_code: wrongRoute.exit_code, code: wrongRoute.json?.error?.code ?? null }
        if (wrongRoute.exit_code === 0) push('WRONG-ROOT', `用脑根当路线工作区去读路线竟然成功 —— 错根必须被拒（或明确 E_ROUTE_MISSING）`)
      }

      // ④ 真实路线前后不变
      const realRouteAfter = treeHash(REAL_ROUTE_ROOT)
      rec.readings.real_route = { before: realRouteBefore, after: realRouteAfter }
      if (realRouteBefore.exists !== realRouteAfter.exists || (realRouteBefore.exists && realRouteBefore.sha256 !== realRouteAfter.sha256)) {
        push('SECURITY-VIOLATION', `真实路线在 DR-03 期间被改动（${realRouteBefore.exists ? realRouteBefore.sha256 : '不存在'} → ${realRouteAfter.exists ? realRouteAfter.sha256 : '不存在'}）—— 立即停测`)
      }
      if (existsSync(REAL_ROUTE_ROOT)) push('SECURITY-VIOLATION', `真实路线 ${REAL_ROUTE_ROOT} 竟然存在了 —— 本轮它必须是不存在的状态`)

      caseFail(problems)
    })
  })
})
