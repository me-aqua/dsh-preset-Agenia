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
 *   · 真实库前后**内容**随每个会碰它的子用例量（§2.4 第 5 条）：树哈希 + `audit.jsonl` 行数
 *     + `v0.json` 哈希；任何变化 = **安全违规**，不是普通红。
 *     ⚠️ 判据**不是**"它必须不存在"。旧断言 `existsSync(REAL_BRAIN_ROOT) ⇒ SECURITY-VIOLATION`
 *     的前提（"本轮真实根必须不存在"）**2026-10-15 已作废**：真实库那天起就是**真数据**。
 *     留着那条会变成"每天都红、而红的原因与有没有人写它无关"的假红。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 **死命令 —— 想给这个文件加用例的人，先读完这一段再动手**
 *
 *   **任何用例都不许让 `--real-mode`（或 `--op init-real`）+ 真实根 + `writes: true` 的 op 真跑起来。**
 *
 *   · 真实库 `E:\Harness\presets\agenia\.runtime` 是**真数据**：2026-10-15 有人亲手用 `--op init-real`
 *     把它开出来（exit 0），`.runtime\audit.jsonl` 里那两条 `init` / `init-real` 就是凭据。**它不是演练。**
 *   · `audit-append` 那种 op **光落一条审计**就把这个库的事写进去了；`init` 会把它重开一遍。
 *     一次"顺手加个用例"就能把真库烧掉，而且烧掉之后**看不出是测试干的**。
 *   · ⇒ **真实根那一侧只许跑只读 op**：`entry-count` / `state-read` / `health-read`。
 *   · ⇒ 写 op 只许出现在**「没给开关」**或**「根不是真实根」**的格子里；
 *     真要在一个"给了开关 + 真实根"的格子里放写 op，那是把真实库押在"闸不会坏"上 —— **禁止**。
 *   · ⇒ 那几条闸里，凡是"必须亲手碰真实根才看得见"的那一档，**一律改成纯函数断言**
 *     （`realInitVerdict` / `realModeVerdict` 都是**不摸盘**的纯函数，见下面的 ②b）。
 *     例：`init-real` 的「根必须不存在」那条一次性保护 ⇒ 纯函数注入 `exists:true` 来钉，
 *     绝不许拿盘上那个真根去撞。
 *   · 🔴 万一哪天真跑上了：**立即停测、如实报现场、别自己清理**（清理才是把它写坏的那一下）。
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
import { before, describe, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN, PATHS, requireEnv } from '../support/env.mjs'
import {
  caseFail,
  caseHold,
  preflight,
  problem,
  realRootContent,
  realRootContentDiff,
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

/**
 * 非法根姿势表（§2.4 第 3 条 + §B1.7 第 4 条：大小写/尾斜杠/`..`/junction 都要先 canonical 再判）。
 * 🔴 `realRoot` **由调用方给**，必须是**被测代码自己算出来的那个真实脑根**（`T-TEST-02` 的口径：
 *    靶子不许由用例注入）。以前这里写死 `PATHS.realBrainRoot`（活体那个）⇒ 被测树在 staging 时
 *    那些"真实脑根"格**判的不是同一个对象**，而且它们当时之所以安全，只因为"与 `--test-mode` 互斥"
 *    —— 那是"碰巧对"。换成 SUT 自己的根之后，拒它们的是**真实根那道闸本身**（不是 test-mode 那条）。
 */
function badRootPostures(realRoot) {
  const real = realRoot
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
      // 真实库的**内容级**读数（树哈希 + audit 行数 + v0 哈希）—— 只读，见 support/evidence.mjs。
      // 🔴 **这一个根是"写保护见证"，不是"靶子"**（2026-10-16 分清，技术评审 F2 / 票 `T-TEST-02`）：
      //    · **见证**：它是**活体**那个真库（`E:\Harness\presets\agenia\.runtime`），跑前跑后逐字比
      //      ⇒ 判"有没有人把它写坏"。它**永远**是活体那个，不跟着被测树走。
      //    · **靶子**：根判定那几组要喂进去的根，必须是**被测代码自己算出来的**那个
      //      （`<staging>/.runtime`，从 staged `lib/paths.mjs` 的 `REAL_BRAIN_ROOT` 读）
      //      —— 口径由组长拍死：**不许由用例注入**。让用例把活体那个根喂进去，
      //      等于**把答案告诉被测者**；那样就算绿了，也证明不了"它在自己的位置上算得对"。
      //    ⇒ 两者**不是同一个对象**，别再合并成一个常量。
      const realRoot = PATHS.realBrainRoot
      const realBefore = realRootContent(realRoot)

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

      // ── ①b V7（T-MEM-07）：新 op `judge-pending` 三处必须**同批** ─────────────
      // 定形 V7 逐字：「`cli-inventory` 与测试侧 `FROZEN.ops` **都**含 `judge-pending`（少一处就是常驻红）」。
      // 第三处是**实现**（`--op help` 的 `ops`）—— 少它的话，清单与冻结表都在宣布一个不存在的 op，
      // 那是**最坏的一种绿**：三张表对得上，而命令跑不起来。
      // 契约：`.team/test/2026-10-16/契约-T-MEM-07.md` §三。
      const frozenBrainOps = FROZEN.ops['agenia-brain.mjs'] ?? []
      const frozenRow = frozenBrainOps.find((o) => o.op === 'judge-pending') ?? null
      const invRow = commands === null ? null : (commands.find((c) => c.cli === 'agenia-brain.mjs' && c.op === 'judge-pending') ?? null)
      let helpOps = null
      let helpExit = null
      if (stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        const helpRes = runCli('agenia-brain.mjs', { op: 'help' }, { env: process.env })
        helpExit = helpRes.exit_code
        helpOps = Array.isArray(helpRes.json?.ops) ? helpRes.json.ops : null
      }
      rec.readings.v7_sites = {
        frozen_ops: frozenRow !== null,
        inventory: commands === null ? null : invRow !== null,
        op_help: helpOps === null ? null : helpOps.includes('judge-pending'),
        op_help_exit: helpExit,
        op_help_count: helpOps === null ? null : helpOps.length,
      }
      if (frozenRow === null) {
        push('V7-FROZEN-OPS', '测试侧 `FROZEN.ops`（`support/env.mjs`）里没有 `agenia-brain.mjs#judge-pending` —— 那张表就是"新增 op 必须同批补"的载体，少它就是常驻红')
      }
      if (commands !== null && invRow === null) {
        push('V7-INVENTORY', '生产侧 `lib/cli-inventory.mjs` 的 `COMMANDS` 里没有 `agenia-brain.mjs#judge-pending` —— 清单就是分母；op 不进清单等于假装它不存在')
      }
      if (helpOps === null) {
        push('V7-OP-HELP', `拿不到 \`--op help\` 的 ops 列表（exit=${helpExit}）⇒ 「实现里到底有没有这个 op」判不了`)
      } else if (!helpOps.includes('judge-pending')) {
        push('V7-OP-HELP', '`--op help` 的 ops 列表里没有 `judge-pending` ⇒ **这个 op 还没实现**（`bin/agenia-brain.mjs` 的 `OP_NAMES` / `OPS` 分派里都没有它；V1–V6/V8/V9 全部判不了，缺的就是 op 本身）')
      }
      if (frozenRow !== null && frozenRow.writes !== false) {
        push('V7-FLAGS', `冻结表里 \`judge-pending\` 的 \`writes\` 必须是 \`false\`（只读：不改权威状态），实得 ${JSON.stringify(frozenRow.writes)}`)
      }
      if (invRow !== null && invRow.writes !== false) {
        push('V7-FLAGS', `清单里 \`judge-pending\` 的 \`writes\` 必须是 \`false\`（只读），实得 ${JSON.stringify(invRow.writes)}`)
      }
      if (invRow !== null && invRow.needsDataRoot !== true) {
        push('V7-FLAGS', `清单里 \`judge-pending\` 的 \`needsDataRoot\` 必须是 \`true\`（根是共享脑根），实得 ${JSON.stringify(invRow.needsDataRoot)}`)
      }

      // ── ② 纯函数：dataRootVerdict 的判定顺序 + canonical 解析 ───────────
      const pathLib = await loadStagedModule('lib/paths.mjs', ['dataRootVerdict', 'resolveWithin', 'testModeOf', 'realInitVerdict', 'realModeVerdict', 'REAL_BRAIN_ROOT'])
      if (pathLib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/paths.mjs 不在 —— 根判定拿不到（预期的首跑红）')
      for (const n of pathLib.missing) push('SUT-SURFACE-MISSING', `staged/lib/paths.mjs 没有导出 ${n}`)

      // ── 🎯 靶子（`T-TEST-02` / 技术评审 F2）：**被测代码自己算出来的那个真实脑根** ──────────
      // 口径（组长拍死）：**不许由用例注入**。所以这里只**读** SUT 的常量，不往它里面喂任何根。
      // 形状（F4 的不变量，2026-10-15 技术评审）：脑根 = `<预设目录>/.runtime`，预设目录由**本文件自己的位置**推
      // ⇒ 被测树在 staging ⇒ 靶子就是 `<staging>/.runtime`。这一条本身就是判据：它哪天不再跟着预设走
      //   （比如又改回写死的本机绝对路径），下面的断言会当场红 —— 那正是 F4 要挡的 fail-open。
      const sutRealBrain = pathLib.mod?.REAL_BRAIN_ROOT ?? null
      rec.readings.sut_real_brain = sutRealBrain
      rec.readings.sut_real_brain_expected = path.join(canonical(requireEnv(ENV.STAGING_PRESET)), '.runtime')
      if (typeof sutRealBrain !== 'string' || sutRealBrain === '') {
        push('SUT-REAL-ROOT', 'staged/lib/paths.mjs 没有导出 REAL_BRAIN_ROOT —— 靶子算不出来（F4 那条不变量也没了）')
      } else if (canonical(sutRealBrain) !== canonical(path.join(canonical(requireEnv(ENV.STAGING_PRESET)), '.runtime'))) {
        push('SUT-REAL-ROOT', `真实脑根必须**跟着预设目录走**（F4 的不变量）：实得 ${sutRealBrain}，应为 <AGENIA_STAGING_PRESET>/.runtime = ${path.join(canonical(requireEnv(ENV.STAGING_PRESET)), '.runtime')}`)
      }
      // 见证侧：活体那个根**依然**必须是活体那个（不许跟着被测树漂 —— 它是"有没有被写坏"的锚）。
      const witnessExpected = path.join(PATHS.finalPreset, '.runtime')
      if (canonical(realRoot) !== canonical(witnessExpected)) {
        push('SUT-REAL-ROOT', `写保护见证必须是**活体**那个根（${witnessExpected}），实得 ${realRoot}`)
      }
      // 🔴 两条语义不许混：靶子 ≠ 见证。相等的唯一情形是"预设就装在活体位置上"（装好之后）——
      //    在 staging 里跑时它们**必须**不同；相同 ⇒ 说明靶子又漂回活体了（F2 复发）。
      rec.readings.target_vs_witness = { target: sutRealBrain, witness: realRoot, same: canonical(sutRealBrain ?? '') === canonical(realRoot) }

      if (pathLib.mod?.dataRootVerdict) {
        const v = pathLib.mod.dataRootVerdict
        // 🔴 **不注入 `realRoots`**：让它用**自己那一份**（`REAL_ROOTS`，由模块位置 + cwd 算出来）。
        //    用例往里喂一张"拒绝名单"，等于把答案告诉被测者 —— 拍板口径明令禁止。
        const opts = { testMode: true, markerExists: true, driveOf }
        const markerless = path.join(canonical(requireEnv(ENV.RUN_ROOT)), 'agenia-dr-markless')
        const cases = [
          ['缺失', undefined, 'E_ROOT_MISSING', { ...opts, markerExists: false }],
          ['空串', '', 'E_ROOT_MISSING', { ...opts, markerExists: false }],
          ['相对', 'brain-root', 'E_ROOT_RELATIVE', { ...opts, markerExists: false }],
          ['UNC', '\\\\server\\share', 'E_ROOT_UNC', { ...opts, markerExists: false }],
          ['C 盘（非法姿势）', 'C:\\Temp\\agenia', 'E_ROOT_C_DRIVE', { ...opts, markerExists: false }],
          ['真实脑根（**靶子** = SUT 自己算的那个）', sutRealBrain, 'E_ROOT_REAL_BRAIN', opts],
          ['真实脑根（`.team/review/../../` 绕）', `${sutRealBrain}\\..\\.runtime`, 'E_ROOT_REAL_BRAIN', opts],
          // ⚠️ 落点换到运行根之下：`PATHS.stagedPreset` **包住** 靶子（`<staging>/.runtime` 就在它里面）
          //    ⇒ 拿它当"无 marker"那一格会先撞 `E_ROOT_REAL_BRAIN`（判定顺序：REAL_BRAIN 在 NO_MARKER 之前）。
          ['测试模式无 marker', markerless, 'E_ROOT_NO_MARKER', { ...opts, markerExists: false }],
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
        const twice = [v(sutRealBrain, opts)?.code, v(sutRealBrain, opts)?.code]
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

      // ── ②b 两道新闸的**纯函数**面：`init-real` 与 `--real-mode` ────────────────
      // 🔴 为什么这一半必须走纯函数（而不是真跑 CLI）：它们各有几档"只有**真碰真实库**才看得见"，
      //    而真碰就是事故（见文件头那条死命令）。两个函数都**不摸盘**（`exists` 由调用方注入）
      //    ⇒ 能把"根必须不存在"这种一次性保护**在盘外**钉死，一个字节都不冒险。
      // 【钉什么】闸的**码**与**判定次序**：形状 → 测试模式互斥 → 专名（逐字相等）→ 一次性。
      // 【怎么翻面】① 把 `realModeVerdict` 里"必须显式给开关"那条删掉 ⇒ 「真实根 + 没给开关」那一格
      //            从 `E_ROOT_REAL_BRAIN` 变成 ok ⇒ 当场红（那正是"真实库后门"的形状）；
      //            ② 把测试模式互斥闸删掉 ⇒ 两处 `E_ARG_SCHEMA` 变 `E_DATA_EXISTS`/ok ⇒ 红；
      //            ③ 把"逐字相等"改成"落在里面就算" ⇒ 「子路径」那一格从 `E_ROOT_OUTSIDE` 变 ok ⇒ 红。
      if (pathLib.mod?.realInitVerdict) {
        const v = pathLib.mod.realInitVerdict
        const cases = [
          ['省略根', undefined, 'E_ROOT_MISSING', { exists: false, testMode: false }],
          ['相对路径', 'brain-root', 'E_ROOT_RELATIVE', { exists: false, testMode: false }],
          ['UNC', '\\\\server\\share', 'E_ROOT_UNC', { exists: false, testMode: false }],
          ['C 盘（非法姿势）', 'C:\\Temp\\agenia', 'E_ROOT_C_DRIVE', { exists: false, testMode: false }],
          // 🔴 互斥闸：带测试模式 ⇒ 一律 E_ARG_SCHEMA（**不是** E_ROOT_REAL_BRAIN —— 那是日常 op 的码）
          ['真实根 + 测试模式', sutRealBrain, 'E_ARG_SCHEMA', { exists: false, testMode: true }],
          ['真实根 + 测试模式（根已存在也还是先报互斥）', sutRealBrain, 'E_ARG_SCHEMA', { exists: true, testMode: true }],
          // 一次性保护 —— **注入** `exists:true` 来钉，绝不许拿盘上那个真根去撞
          ['真实根（已经在盘上 ⇒ 一次性保护）', sutRealBrain, 'E_DATA_EXISTS', { exists: true, testMode: false }],
          // 专名闸：**是相等，不是"落在里面"**
          ['真实根的子路径', `${sutRealBrain}\\sub`, 'E_ROOT_OUTSIDE', { exists: false, testMode: false }],
          ['真实根的父目录', path.dirname(sutRealBrain), 'E_ROOT_OUTSIDE', { exists: false, testMode: false }],
          // ★ 正例：**只做纯函数**。真开库那一下永远不许在测试里跑（真库已经在盘上了）。
          //    ⚠️ 这里注入 `exists:false` 钉的是**判定逻辑**，不是盘上事实 —— 盘上事实是 exists:true
          //    （读数见 DR-01 ④ 的 `real_brain`）。
          ['真实根 + 还不存在（正例）', sutRealBrain, null, { exists: false, testMode: false }],
        ]
        const got = {}
        for (const [label, raw, wantCode, o] of cases) {
          let out = null
          try { out = v(raw, o) } catch (err) { push('INIT-REAL-VERDICT', `realInitVerdict(${label}) 抛错：${String(err.message).slice(0, 160)}`); continue }
          got[label] = { ok: out?.ok ?? null, code: out?.code ?? null }
          if (wantCode === null) {
            if (out?.ok !== true) push('INIT-REAL-VERDICT', `${label} 应当通过，实得 ok=${out?.ok} code=${out?.code}`)
          } else if (out?.ok !== false || out?.code !== wantCode) {
            push('INIT-REAL-VERDICT', `${label} 应为 ${wantCode}，实得 ok=${out?.ok} code=${out?.code}`)
          }
        }
        rec.readings.init_real_verdict = got
        // 次序冻结：同一输入两次同一个码
        const twice = [v(sutRealBrain, { exists: true, testMode: true })?.code, v(sutRealBrain, { exists: true, testMode: true })?.code]
        if (twice[0] !== twice[1]) push('INIT-REAL-VERDICT-ORDER', `realInitVerdict 同一输入两次得到不同码：${JSON.stringify(twice)}（判定次序必须冻结）`)
      }
      if (pathLib.mod?.realModeVerdict) {
        const v = pathLib.mod.realModeVerdict
        const nonReal = `${PATHS.repo}\\.tools\\_scratch\\agenia-dr-outside`
        const cases = [
          ['省略根', undefined, 'E_ROOT_MISSING', { realMode: true }],
          ['相对路径', 'brain-root', 'E_ROOT_RELATIVE', { realMode: true }],
          ['UNC', '\\\\server\\share', 'E_ROOT_UNC', { realMode: true }],
          ['C 盘（非法姿势）', 'C:\\Temp\\agenia', 'E_ROOT_C_DRIVE', { realMode: true }],
          // **命门**：与测试模式互斥（"给开关 + 真实根 + --test-mode" 就是撞这一条）
          ['真实根 + 开关 + 测试模式', sutRealBrain, 'E_ARG_SCHEMA', { realMode: true, testMode: true }],
          // 老行为不许退化：没给开关 ⇒ 真实根照旧无条件拒
          ['真实根 + 没给开关', sutRealBrain, 'E_ROOT_REAL_BRAIN', { realMode: false }],
          // 专名闸：**是相等，不是"落在里面"**
          ['非真实根 + 开关', nonReal, 'E_ROOT_OUTSIDE', { realMode: true }],
          ['真实根的子路径 + 开关', `${sutRealBrain}\\sub`, 'E_ROOT_OUTSIDE', { realMode: true }],
          // ★ 正例（纯函数）：开关真的能把那道门打开
          ['真实根 + 开关（正例）', sutRealBrain, null, { realMode: true }],
        ]
        const got = {}
        for (const [label, raw, wantCode, o] of cases) {
          let out = null
          try { out = v(raw, o) } catch (err) { push('REAL-MODE-VERDICT', `realModeVerdict(${label}) 抛错：${String(err.message).slice(0, 160)}`); continue }
          got[label] = { ok: out?.ok ?? null, code: out?.code ?? null }
          if (wantCode === null) {
            if (out?.ok !== true) push('REAL-MODE-VERDICT', `${label} 应当通过，实得 ok=${out?.ok} code=${out?.code}`)
          } else if (out?.ok !== false || out?.code !== wantCode) {
            push('REAL-MODE-VERDICT', `${label} 应为 ${wantCode}，实得 ok=${out?.ok} code=${out?.code}`)
          }
        }
        rec.readings.real_mode_verdict = got
      }

      // ── ②c 工作区那一档的 `containingRule`（2026-10-16 组长批 · 承重函数）────────
      // 【钉什么】`dataRootVerdict` 多了一个**可选**键 `containingRule`（默认 `true` = 照旧判"包住真实根"）。
      //   只有**工作区**那一档传 `false`（三份 CLI 的 `resolveWorkspace`）；`--data-root` / `--status-root`
      //   **照旧**用默认值。三条判据：
      //     ① **默认值不许变** —— 同一个根，不传 `containingRule` 与传 `false` ⇒ **结论相反**（这就是翻面）；
      //     ② **老防线一条都不许退化** —— C 盘 / 相对 / UNC / 缺 / marker / 越界 / `⊆` 那半条，
      //        逐格跑**两遍**（不传 vs `false`），两遍结论必须**逐字相同**；
      //     ③ **三份 `resolveWorkspace`**（brain / local / route）都要覆盖，外加 `--status-root` 那条路。
      // 【怎么翻面】
      //   · 把三处 `containingRule: false` 删掉 ⇒ 下面 `WSV-ACCEPT` 那三格从"放行"变回 `E_ROOT_REAL_BRAIN`；
      //   · 把默认值改成 `false` ⇒ ② 每一格的"不传"那一遍当场变结论（`WSV-DEFAULT`）；
      //   · 让 `--status-root` 也传 `false` ⇒ `WSV-STATUS-ROOT` 那两格红。
      // ⚠️ 靶子**按被测树自己算**（`pathLib.mod.REAL_BRAIN_ROOT`）—— 不许拿活体那个绝对路径当靶子：
      //    被测代码从 staging 载入 ⇒ 它算出来的真实脑根是 `<staging>/.runtime`（2026-10-16 技术评审 F2）。
      if (pathLib.mod?.dataRootVerdict) {
        const sutRealBrain = pathLib.mod.REAL_BRAIN_ROOT ?? null
        rec.readings.wsv_sut_real_brain = sutRealBrain
        if (typeof sutRealBrain !== 'string' || sutRealBrain === '') {
          push('WSV-SURFACE', 'staged/lib/paths.mjs 没有导出 REAL_BRAIN_ROOT —— 工作区那档的靶子算不出来')
        } else {
          const wsRealRoots = [sutRealBrain, path.join(PATHS.repo, '.team', 'route')]
          const containerRoot = PATHS.repo // E:\Harness ⊇ <staging>/.runtime，也 ⊇ E:\Harness\.team\route
          const outsideRoot = path.join(PATHS.repo, '.tools', '_scratch', 'agenia-wsv-outside')
          const markerlessRoot = path.join(PATHS.repo, '.tools', '_scratch', 'agenia-wsv-marker')
          const runRoot = canonical(process.env[ENV.RUN_ROOT])
          /** 同一个根跑两遍：**不传** `containingRule` 与传 `false`。 */
          const pair = (label, raw, o = {}) => {
            const base = { testMode: false, markerExists: false, driveOf, realRoots: wsRealRoots, ...o }
            let d = null
            let f = null
            try { d = pathLib.mod.dataRootVerdict(raw, base) } catch (err) { d = { ok: null, code: `THREW:${String(err.message).slice(0, 80)}` } }
            try { f = pathLib.mod.dataRootVerdict(raw, { ...base, containingRule: false }) } catch (err) { f = { ok: null, code: `THREW:${String(err.message).slice(0, 80)}` } }
            return { label, default: { ok: d?.ok ?? null, code: d?.code ?? null }, false: { ok: f?.ok ?? null, code: f?.code ?? null } }
          }

          // ① 翻面那一格：容器根（包住两个真实根）。
          const flip = pair('工作区容器根（E:\\Harness ⊇ 两个真实根）', containerRoot)
          rec.readings.wsv_flip = flip
          if (!(flip.default.ok === false && flip.default.code === 'E_ROOT_REAL_BRAIN')) {
            push('WSV-DEFAULT', `${flip.label} **不传** containingRule 应为 E_ROOT_REAL_BRAIN（默认照旧判"包住"），实得 ok=${flip.default.ok} code=${flip.default.code}`)
          }
          if (flip.false.ok !== true) {
            push('WSV-FLIP', `${flip.label} 传 containingRule:false 应当放行（工作区那一档的正题），实得 ok=${flip.false.ok} code=${flip.false.code}`)
          }
          if (!(flip.default.ok !== flip.false.ok)) {
            push('WSV-FLIP', `${flip.label} 传/不传 containingRule 得到**同一个**结论（ok=${flip.default.ok}）—— 那这条判据翻不了面，等于没测`)
          }

          // ② 老防线：逐格两遍，结论必须逐字相同（`containingRule` 只该关掉"包住"那半条）。
          const legacy = [
            ['C 盘', 'C:\\Windows\\Temp\\agenia-wsv', 'E_ROOT_C_DRIVE'],
            ['相对路径', 'brain-root', 'E_ROOT_RELATIVE'],
            ['UNC', '\\\\127.0.0.1\\share\\agenia-wsv', 'E_ROOT_UNC'],
            ['缺（undefined）', undefined, 'E_ROOT_MISSING'],
            ['空串', '', 'E_ROOT_MISSING'],
            ['落在真实根里（⊆ 那半条，关不掉）', path.join(sutRealBrain, 'memory'), 'E_ROOT_REAL_BRAIN'],
            ['测试模式无 marker', markerlessRoot, 'E_ROOT_NO_MARKER'],
            ['越界', outsideRoot, 'E_ROOT_OUTSIDE'],
          ]
          const legacyRows = []
          for (const [label, raw, want] of legacy) {
            const o = label === '测试模式无 marker'
              ? { testMode: true, markerExists: false }
              : label === '越界'
                ? { testMode: true, markerExists: true, mustBeUnder: runRoot }
                : {}
            const r = pair(label, raw, o)
            legacyRows.push({ ...r, want })
            for (const side of ['default', 'false']) {
              if (r[side].ok !== false || r[side].code !== want) {
                push('WSV-LEGACY', `${label}（${side === 'default' ? '不传' : 'containingRule:false'}）应为 ${want}，实得 ok=${r[side].ok} code=${r[side].code}`)
              }
            }
            if (r.default.code !== r.false.code || r.default.ok !== r.false.ok) {
              push('WSV-LEGACY', `${label} 在"不传"与"传 false"两种姿势下结论不同（${r.default.code} vs ${r.false.code}）—— 老防线退化了`)
            }
          }
          rec.readings.wsv_legacy = legacyRows

          // ③ 三份 `resolveWorkspace`（真子进程）+ `--status-root` 那条**不在改动范围内**的路。
          //    🔴 全部用**只读 op**（health-read / health / read），一个字节都不写工作区。
          //    🔴 「放行」那几格必须**剥掉 `AGENIA_TEST_RUN_ROOT`**：测试模式下 `mustBeUnder = 运行根`，
          //       容器根 `E:\Harness` 会先撞 `E_ROOT_OUTSIDE`，那样读到的就不是"工作区那一档"的结论了。
          const emptyPayload = writeFixture('DR-01', 'wsv-empty', {})
          const testDataRoot = process.env[ENV.TEST_DATA_ROOT]
          const cliCells = [
            ['brain · --workspace <容器根>（放行）', 'agenia-brain.mjs', { op: 'health-read', dataRoot: testDataRoot, workspace: containerRoot, inFile: emptyPayload }, true, null],
            ['local · --workspace <容器根>（放行）', 'agenia-local.mjs', { op: 'health', workspace: containerRoot, inFile: emptyPayload }, true, null],
            ['route · --workspace <容器根>（放行）', 'agenia-route.mjs', { op: 'read', workspace: containerRoot, inFile: emptyPayload }, true, null],
            ['brain · --workspace <真实根\\memory>（⊆ 照旧拒）', 'agenia-brain.mjs', { op: 'health-read', dataRoot: testDataRoot, workspace: path.join(sutRealBrain, 'memory'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['local · --workspace <真实根\\memory>（⊆ 照旧拒）', 'agenia-local.mjs', { op: 'health', workspace: path.join(sutRealBrain, 'memory'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['route · --workspace <真实根\\memory>（⊆ 照旧拒）', 'agenia-route.mjs', { op: 'read', workspace: path.join(sutRealBrain, 'memory'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['brain · --data-root <真实根>（不给 --real-mode ⇒ 照旧拒）', 'agenia-brain.mjs', { op: 'health-read', dataRoot: sutRealBrain, inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['local · --status-root <包住路线根的那层>（默认值不许被顺手改掉）', 'agenia-local.mjs', { op: 'health', workspace: containerRoot, statusRoot: path.join(PATHS.repo, '.team'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
            ['route · --status-root <包住路线根的那层>（默认值不许被顺手改掉）', 'agenia-route.mjs', { op: 'read', workspace: containerRoot, statusRoot: path.join(PATHS.repo, '.team'), inFile: emptyPayload }, true, 'E_ROOT_REAL_BRAIN'],
          ]
          const cliRows = []
          for (const [label, cli, opts, strip, want] of cliCells) {
            if (!stagingExists(path.join('bin', cli))) { cliRows.push({ label, surfaceMissing: true }); continue }
            let res = null
            try {
              res = runCli(cli, opts, { env: process.env, ...(strip ? { stripEnv: [ENV.RUN_ROOT] } : {}) })
            } catch (err) {
              cliRows.push({ label, threw: String(err.message).slice(0, 120) })
              push('WSV-CLI-THREW', `${label}：跑不起来 —— ${String(err.message).slice(0, 160)}`)
              continue
            }
            const code = res.json?.error?.code ?? null
            cliRows.push({ label, exit_code: res.exit_code, code })
            if (want === null) {
              if (code === 'E_ROOT_REAL_BRAIN') {
                push('WSV-ACCEPT', `${label} 仍然被 E_ROOT_REAL_BRAIN 拒了（工作区那一档的 containingRule 没生效）：${res.stdout.trim().slice(0, 200)}`)
              }
            } else if (code !== want) {
              push('WSV-CODE', `${label} 应为 ${want}，实得 ${code ?? '(无码)'} / exit=${res.exit_code}：${res.stdout.trim().slice(0, 200)}`)
            }
          }
          rec.readings.wsv_cli = cliRows
        }
      }

      // ── ③ 逐命令 × 逐姿势（真子进程）────────────────────────────────────
      if (!stagingExists(path.join('bin', 'agenia-brain.mjs'))) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 逐命令的 data-root 矩阵跑不起来（预期的首跑红）')
      }
      // 🔴 `init-real` **不进这张矩阵**（单列在下面的 ③a）。
      //    理由：矩阵里「真实脑根（原样）」那一格会把真实根**原样**交给它。那一格现在之所以安全，
      //    只因为"`init-real` 与 `--test-mode` 互斥"那一道闸 —— 派工单的定性是：
      //    那是"碰巧对"，不是"看得出来在护什么"（真漏了闸，这一格会**当场把真实库开一遍**）。
      // ⇒ 单列一组：码钉死（E_ARG_SCHEMA）、跑前跑后真实库内容钉死。
      // ⚠️ 它也因此没有"合法测试根"那一条正向对照 —— `init-real` 在测试模式下**永远**是 E_ARG_SCHEMA，
      //    它的正例只存在于纯函数那一档（②b 的「真实根 + 还不存在」）。
      const writeCommands = (commands ?? []).filter((c) => c.writes === true && c.needsDataRoot === true && c.op !== 'init-real')
      rec.readings.write_commands = writeCommands.map((c) => `${c.cli}#${c.op}`)
      // 分母不许空：`init-real` 若从清单里消失，③a 那一组就会**空着一路绿**（"清单就是分母"）。
      const initRealRows = (commands ?? []).filter((c) => c.cli === 'agenia-brain.mjs' && c.op === 'init-real')
      rec.readings.init_real_row = initRealRows.map((c) => ({ writes: c.writes, needsDataRoot: c.needsDataRoot }))
      if (commands !== null && initRealRows.length === 0) {
        push('CLI-INVENTORY', '清单里没有 `agenia-brain.mjs#init-real` —— ③a 那一组的分母是空的（它在不在盘上都必须被清点点名）')
      }
      const postureResults = {}
      for (const cmd of writeCommands) {
        for (const { label, spec } of badRootPostures(sutRealBrain)) {
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

      // ── ③a `init-real`：**单列一组**（它已经不在上面那张矩阵里了）──────────────────
      // 【钉什么】
      //   ① 「真实根姿势」那四格（原样 / 大写盘符 / 尾斜杠 / `..` 绕）⇒ **E_ARG_SCHEMA**（互斥闸），
      //      **不是** E_ROOT_REAL_BRAIN —— 后者是"日常 op 误写真实库"那个码，`init-real` 不走那张表。
      //   ② 非真实根姿势的码各自钉死（缺失 / 相对 / C 盘 / UNC / 专名闸 E_ROOT_OUTSIDE）。
      //   ③ 这一组跑前跑后，真实库**内容一字未变**：`audit.jsonl` 行数 / `v0.json` 哈希 / 整树哈希。
      // 【怎么翻面】
      //   · 把 `realInitVerdict` 的测试模式互斥闸删掉 ⇒ 四格的真实根姿势从 E_ARG_SCHEMA 变成
      //     E_DATA_EXISTS（真库已在盘上）⇒ ① 当场红；真让它写进去 ⇒ ③ 红（而且那是**安全违规**级别的红）。
      //   · 把"逐字相等"放宽成"落在里面就算" ⇒ 「运行根之外」那一格的 E_ROOT_OUTSIDE 会变 ok ⇒ 红。
      //   · 把 `init-real` 从清单里删掉 ⇒ 分母空了 ⇒ 上面的 `CLI-INVENTORY` 红（不许空着一路绿）。
      const initRealBefore = realRootContent(realRoot)
      // 缺面时别在这里刷一串"跑不起来"：`③` 开头那条 `SUT-SURFACE-MISSING` 已经把缺面报红了，
      // 这里再报 7 条只会把"被测对象没实现"读成一堆噪声。
      const brainCliOk = stagingExists(path.join('bin', 'agenia-brain.mjs'))
      rec.readings.brain_cli_present = brainCliOk
      const initRealShapeCodes = {
        '省略 --data-root': 'E_ROOT_MISSING',
        '空串': 'E_ROOT_MISSING',
        '相对路径': 'E_ROOT_RELATIVE',
        'C 盘（非法姿势）': 'E_ROOT_C_DRIVE',
        'UNC': 'E_ROOT_UNC',
      }
      const initRealCases = []
      for (const { label, spec } of badRootPostures(sutRealBrain)) {
        const touchesReal = /^真实/.test(label)
        const want = touchesReal ? 'E_ARG_SCHEMA' : (initRealShapeCodes[label] ?? null)
        if (want === null) continue // 「运行根之外」在下面单独跑（要剥测试模式才看得到专名闸）
        initRealCases.push({ label, extra: spec.mode === 'value' ? ['--data-root', spec.value] : [], want, strip: false, touchesReal })
      }
      const outsidePosture = badRootPostures(sutRealBrain).find(({ label }) => label === '运行根之外')
      // 专名闸要**不带测试模式**才看得到（带测试模式时先撞互斥闸，永远只看到 E_ARG_SCHEMA）。
      // 剥 `AGENIA_TEST_RUN_ROOT` 是安全的：根判定跑在 op 分派**之前**，被拒的那一次不写盘；
      // 而且这一格的根是运行根之外的 `_scratch` 子目录，**不是**真实根。
      initRealCases.push({
        label: '运行根之外（不带测试模式）',
        extra: ['--data-root', outsidePosture.spec.value],
        want: 'E_ROOT_OUTSIDE',
        strip: true,
        touchesReal: false,
      })
      const initRealResults = {}
      for (const c of initRealCases) {
        if (!brainCliOk) break
        let res = null
        try {
          res = runCli('agenia-brain.mjs', { op: 'init-real', testMode: !c.strip, extra: c.extra }, {
            env: process.env,
            ...(c.strip ? { stripEnv: [ENV.RUN_ROOT] } : {}),
          })
        } catch (err) {
          initRealResults[c.label] = { threw: String(err.message).slice(0, 160) }
          push('INIT-REAL-THREW', `init-real 用「${c.label}」跑不起来（连拒绝都没给出来）：${String(err.message).slice(0, 160)}`)
          continue
        }
        const code = res.json?.error?.code ?? null
        const wantExit = FROZEN.exitCodes[c.want]
        initRealResults[c.label] = { exit_code: res.exit_code, code, want: c.want, touches_real_root: c.touchesReal }
        if (res.exit_code === 0) {
          push('INIT-REAL-ACCEPTED', `init-real 用「${c.label}」竟然 exit 0 —— 这一格必须被拒：${res.stdout.trim().slice(0, 200)}`)
          continue
        }
        if (code !== c.want) {
          push('INIT-REAL-CODE', `init-real 用「${c.label}」应报 ${c.want}，实得 ${code ?? '(无码)'}：${res.stdout.trim().slice(0, 240)}`)
        }
        if (typeof wantExit === 'number' && res.exit_code !== wantExit) {
          push('INIT-REAL-EXIT', `init-real 用「${c.label}」的 ${c.want} 应配退出码 ${wantExit}，实得 ${res.exit_code}`)
        }
      }
      const initRealAfter = realRootContent(realRoot)
      const initRealDiff = realRootContentDiff(initRealBefore, initRealAfter)
      rec.readings.init_real = { before: initRealBefore, after: initRealAfter, diff: initRealDiff, cases: initRealResults }
      if (initRealDiff.length > 0) {
        push('SECURITY-VIOLATION', `真实库在 init-real 那一组里被改动了（${initRealDiff.join('；')}）—— 立即停测并报事故，不许自行清理现场`)
      }
      if (!initRealAfter.exists && initRealBefore.exists) {
        push('SECURITY-VIOLATION', `真实库在 init-real 之后不见了（${initRealAfter.root}）—— 它在盘上是既定事实，测试不许把它拿走`)
      }
      if (!initRealBefore.exists) {
        // 空对空永远"前后同值" ⇒ 这一组此刻**判不了**。挂起（HOLD）而不是绿，也不是红：
        // 真库还没开出来这一档本来就无从判（换台机器 / 重新克隆时就是这种态）。
        caseHold(rec, 'INIT-REAL-VACUOUS', `真实库 ${initRealBefore.root} 不在盘上 ⇒ 「跑前跑后同值」这一组判不了（空对空永远相等）。**这一格不是绿。**`)
      }

      // ── ③b `--real-mode`（**开关**，不是 op）：三条 + 一条只读正例 ──────────────
      // 它不在冻结 op 表里（`--op help` 照样 21 个），但"有行为就必须有用例"照样成立。
      // 🔴 死命令（文件头）：这几格里**任何一格**都不许让 `--real-mode` + 真实根 + 写 op 真跑起来。
      //    ⇒ 真实根那一侧**只用只读 op**（`entry-count`）；互斥闸是 **op 无关**的（跑在 op 分派之前），
      //      所以用只读 op 钉到的正是同一件事，却不用把真库押在"闸不会坏"上。
      const realModeBefore = realRootContent(realRoot)
      const realModeResults = {}
      const runRealMode = (label, opts, strip) => {
        if (!brainCliOk) return null // 缺面已由 ③ 那条 SUT-SURFACE-MISSING 报过（同上）
        try {
          const res = runCli('agenia-brain.mjs', opts, { env: process.env, ...(strip ? { stripEnv: [ENV.RUN_ROOT] } : {}) })
          realModeResults[label] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null, args: res.args.join(' ') }
          return res
        } catch (err) {
          realModeResults[label] = { threw: String(err.message).slice(0, 160) }
          push('REAL-MODE-THREW', `${label}：跑不起来（连拒绝都没给出来）：${String(err.message).slice(0, 160)}`)
          return null
        }
      }
      const expectReject = (label, res, want) => {
        if (res === null) return
        if (res.exit_code === 0) {
          push('REAL-MODE-ACCEPTED', `${label} 竟然 exit 0 —— 这一格必须被 ${want} 拒：${res.stdout.trim().slice(0, 200)}`)
          return
        }
        const code = res.json?.error?.code ?? null
        if (code !== want) push('REAL-MODE-CODE', `${label} 应报 ${want}，实得 ${code ?? '(无码)'}：${res.stdout.trim().slice(0, 240)}`)
        const wantExit = FROZEN.exitCodes[want]
        if (typeof wantExit === 'number' && res.exit_code !== wantExit) {
          push('REAL-MODE-EXIT', `${label} 的 ${want} 应配退出码 ${wantExit}，实得 ${res.exit_code}`)
        }
      }

      // ① 不给开关 + 真实根 + **写 op** ⇒ `E_ROOT_REAL_BRAIN`（老行为没退化）
      //    🔴 两个写 op 都是**结构上写不出去**的（就算根判定那一道闸坏了，也写不进真实库）：
      //      · `init`：真实库非空 ⇒ op 自己就 `E_DATA_EXISTS`（D-B3），一个字节不写；
      //      · `audit-append`：空载荷缺 `kind` ⇒ 在 `appendAudit` **之前**被 `E_ARG_SCHEMA` 拒
      //        （这一只正是派工单点名的"光落一条审计就把真库写了"那条 op）。
      for (const op of ['init', 'audit-append']) {
        const label = `不给开关 · 真实根 · ${op}`
        expectReject(label, runRealMode(label, { op, testMode: true, extra: ['--data-root', sutRealBrain] }, false), 'E_ROOT_REAL_BRAIN')
      }

      // ② 给开关 + 真实根 + `--test-mode` ⇒ `E_ARG_SCHEMA`（**命门**：互斥闸）
      {
        const label = '给了开关 · 真实根 · --test-mode'
        expectReject(label, runRealMode(label, { op: 'entry-count', testMode: true, extra: ['--data-root', sutRealBrain, '--real-mode'] }, false), 'E_ARG_SCHEMA')
      }

      // ③ 给开关 + **非**真实根 ⇒ `E_ROOT_OUTSIDE`（专名闸：只认那一个根）
      //    必须剥 `AGENIA_TEST_RUN_ROOT`：留着它 ⇒ testMode 恒 true ⇒ 先撞互斥闸 ⇒ 永远看不到这一格。
      {
        const label = '给了开关 · 非真实根'
        const nonReal = scenarioWorkspace('DR-01', 'real-mode-nonreal')
        expectReject(label, runRealMode(label, { op: 'entry-count', testMode: false, extra: ['--data-root', nonReal, '--real-mode'] }, true), 'E_ROOT_OUTSIDE')
      }

      // ★ 正例（只读 op）：开关真能把门打开。
      //   没有这一条，上面那三条"被拒"就可能是"命令坏了蒙对"（§9.5 第 1 条：正例必须存在）。
      //   `entry-count` 是**只读**的 ⇒ 真实库一个字节都不会变（死命令允许的正是这一类）。
      //   🔴 `T-TEST-02`：靶子 = **SUT 自己那个**真实根，而它在**开发副本（staging）里不存在**
      //      （staging 不是装好的库）⇒ 这一格**判不了**：不是绿、也不是红，是 **HOLD**（第三态，明写）。
      //      「开关真能把门打开」那半由**纯函数正例**（`REAL-MODE-VERDICT` 的「真实根 + 开关（正例）」）覆盖；
      //      这里要补的是**端到端**那一格，它需要盘上真有一个装好的库 —— 换到装好的位置上它自己会绿。
      //      🔴 **不许**为了让它绿而在 staging 里造一个假 `.runtime`（那会把后续每一跑都污染）。
      {
        const label = '给了开关 · 真实根 · 只读 op（正例）'
        if (!existsSync(sutRealBrain)) {
          caseHold(rec, 'REAL-MODE-POSITIVE-VACUOUS',
            `SUT 自己那个真实根 ${sutRealBrain} **不在盘上** ⇒ 端到端正例判不了（staging 是开发副本、不是装好的库）。`
            + '**这一格不是绿**；开关那半由纯函数正例覆盖。')
          realModeResults[label] = { held: `SUT 真实根不在盘上：${sutRealBrain}` }
        } else {
          const res = runRealMode(label, { op: 'entry-count', testMode: false, extra: ['--data-root', sutRealBrain, '--real-mode'] }, true)
          if (res !== null) {
            if (res.exit_code !== 0) {
              push('REAL-MODE-POSITIVE', `${label} 必须成功（开关真能把门打开），实得 exit=${res.exit_code} / ${res.json?.error?.code ?? '(无码)'}：${res.stdout.trim().slice(0, 240)}`)
            } else if (res.json?.ok !== true) {
              push('REAL-MODE-POSITIVE', `${label} 的 stdout 信封必须 ok=true，实得 ${JSON.stringify(res.json)?.slice(0, 240)}`)
            } else {
              realModeResults[label].count = res.json.count ?? null
              realModeResults[label].snapshot = res.json.snapshot ?? null
            }
          }
        }
      }
      const realModeAfter = realRootContent(realRoot)
      const realModeDiff = realRootContentDiff(realModeBefore, realModeAfter)
      rec.readings.real_mode = { before: realModeBefore, after: realModeAfter, diff: realModeDiff, cases: realModeResults }
      if (realModeDiff.length > 0) {
        push('SECURITY-VIOLATION', `真实库在 --real-mode 那一组里被改动了（${realModeDiff.join('；')}）—— 立即停测并报事故`)
      }

      // ── ④ 零写入 / 真实库内容不变 ──────────────────────────────────────
      // 🔴 判据是「**前后同值**」，**不是**"它必须不存在"。
      //    旧断言 `existsSync(REAL_BRAIN_ROOT) ⇒ SECURITY-VIOLATION` 的前提（"本轮真实根必须不存在"）
      //    2026-10-15 已作废：真实库那天起就是**真数据**（`--op init-real` 亲手开过，exit 0）。
      //    留着它 = 每天都红、而红的原因跟"有没有人写它"无关 —— 假红比不红更坏（AGENTS.md §6）。
      const realAfter = realRootContent(realRoot)
      const realDiff = realRootContentDiff(realBefore, realAfter)
      rec.readings.real_brain = { before: realBefore, after: realAfter, diff: realDiff, exists: realBefore.exists }
      if (realDiff.length > 0) {
        push('SECURITY-VIOLATION', `真实库在 DR-01 期间被改动（${realDiff.join('；')}）—— 立即停测并报事故，不许自行清理现场`)
      }

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
