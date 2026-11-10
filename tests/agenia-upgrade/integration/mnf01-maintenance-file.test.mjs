/**
 * `MNF-01` … `MNF-06` —— **`maintenance_file`：给复核岗一个"提维护案"的工具**（第 2 关，红测试）。
 *
 * 定形：`.team/leader/2026-11-09/定形-maintenance-file.md`（绑定范围）
 * 契约：`.team/test/2026-11-09/CONTRACT-maintenance-file.md`
 * 夹具 / 参照实现 / 刀架：`tests/agenia-upgrade/support/maintenance-file-fixtures.mjs`
 *
 * ── 病（老板原话：「这不是知识层面的事，应该给他对的工具」）────────────────────
 * 2026-11-08 的记忆复核手里只有 `read`/`write`/`edit`，于是**手写 27 份维护案文件**落进它当时
 * 所在的那个工作区（`…\Escape from Duckov\RealisticAccessories\.team\memory-review\2026-11-08\maintenance\`）。
 * 判决侧唯一入口是数据根的 `proposals/pool.jsonl`：那天池子 57 行**全是 `proposal`**、`MR-` **0 条**
 * ⇒ 判决岗**结构上看不见**那 27 份；而 `claim → 冻结池 → judge` 一路绿灯，**没有任何读数说少了 27 份**。
 *
 * ── 这六格判什么（每一格自带刀；刀翻哪几格是**实测读数**，写在 `readings.flip` 里）──────────
 *   `MNF-01` 一次调用 = 文件 + 池行（+ 跨 kind 号段 + 池子读不了 ⇒ IO 且零草稿）
 *   `MNF-02` 落点与调用方工作区无关（**定形点名"这一条最重要"**）
 *   `MNF-03` 形状不对要拒，且零写入（末尾一份合法案当尺子）
 *   `MNF-04` 重复要拒，池子仍只有一行（换一字必须收，当尺子）
 *   `MNF-05` 下一轮看得见（先造"昨天那个现场"⇒ 读数必须是 0；再经工具提 ⇒ 必须 ≥ 1）
 *   `MNF-06` 可达性：判**组合**（`ROLE_TABLE` / `BASE_TOOL_SET` / 实际注册）不判散文 + 体检同伴同批
 *
 * ── 今天为什么该红、红在哪 ──────────────────────────────────────────────────
 * 工具还不存在（`presets/agenia/tools/maintenance-file.mjs` 不在盘上）⇒ `MNF-01`…`MNF-05` 红在
 * `SUT-SURFACE-MISSING`；`MNF-06` 红在 `MNF-C6-TOOL-FACE` / `MNF-C6-REGISTER` / `MNF-C6-CHECK-NOTES`
 * （那个岗位的工具面里没有它、`apply()` 没有注册它、体检没有点名它）。
 * 🔴 **控制面今天是跑得起来的**：`tests/` 自带一份照契约写的最小实现（阳性对照必须绿）与六把刀
 * （各自必须只切自己那一格的主要断言）—— 于是"红"与"判据可满足"是两件事，读数里分开写。
 *
 * ── 纪律 ────────────────────────────────────────────────────────────────────
 * · 所有写入都在**运行根**（`AGENIA_TEST_RUN_ROOT/maintenance-file/**`）：`presets/**` 一个字节不写。
 * · 期望值**手写在用例里**（码 / 落点式子 / 键集合 / 号段），不 import 被测文件的符号
 *   （`cand-20261106-0140`：刀锚在对方字节上时，谁改谁同批改刀）。
 * · 缺面 ⇒ `SUT-SURFACE-MISSING`，**不许**悄悄绿。
 */
import { test } from 'node:test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { caseFail, caseHold, problem, runCase, runRoot, preflight } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import {
  buildCatalog, buildContentRoot, configFromComposition, loadInjector, withHarness,
} from '../support/injector-harness.mjs'
import * as F from '../support/maintenance-file-fixtures.mjs'

const CASE_IDS = ['MNF-01', 'MNF-02', 'MNF-03', 'MNF-04', 'MNF-05', 'MNF-06']
const PRESET = path.join(PATHS.repo, 'presets', 'agenia')
const INJECT = path.join(PRESET, 'inject.js')

/**
 * 预检（`support/evidence.mjs::preflight`）：落 `_preflight/preflight.<pid>.json`。
 * 没有它，入口那一行 `[尺子] 测试树 …` 只能印"判不了"（`test_tree.preflight_*` 全是 null）——
 * 而"这一跑打的是哪一版测试代码"是这一跑该有的读数（`R-5`）。与同族用例同口径：模块加载时跑一次。
 */
preflight()

// ── 共同件 ─────────────────────────────────────────────────────────────────
/**
 * 一份**合成注入器**（C6 的尺子）：只保留 `apply()` 注册工具这一条行为，别的都不做。
 * `withTool:false` = 契约的反面（工具面与注册都没有它）⇒ `MNF-06` 必须红。
 * 为什么用"跑一次 apply 量注册名"而不是直接写一个数组：`registerNames` 必须是**跑出来的**，
 * 否则"实际注册"这一格又退回自报。
 */
async function syntheticInjectorInputs({ withTool }) {
  const names = ['read', 'write', 'edit', 'proposal_file', ...(withTool ? [F.TOOL_NAME] : [])]
  const registered = []
  const ctx = {
    baseUrl: pathToFileURL(`${runRoot()}${path.sep}`).href,
    get(name) {
      if (name === 'tools') return { guard: () => () => {}, register: (d) => { registered.push(d?.name ?? '(no-name)'); return () => {} } }
      if (name === 'systemPrompt') return {}
      if (name === 'agents') return { get: () => ({ id: 'synthetic', session: { id: 'synthetic' } }) }
      return undefined
    },
    on() {},
    effect(fn) {
      const off = fn()
      return typeof off === 'function' ? off : () => {}
    },
  }
  const mod = {
    async apply(c) {
      const tools = c.get('tools')
      for (const name of ['proposal_file', ...(withTool ? [F.TOOL_NAME] : [])]) tools.register({ name })
    },
  }
  await mod.apply(ctx)
  return {
    roleTable: [{ toolName: 'job_memory_review', role: 'memory-review', tools: [...names], deny: [] }],
    baseToolSet: [...names],
    registerNames: [...registered],
    checkNotesText: null,
    ymlText: null,
  }
}

/** 真组合那一侧的三样（`ROLE_TABLE` / `BASE_TOOL_SET` / 实际注册名）+ 两个静态文件。 */
async function realInjectorInputs(dir) {
  const loaded = await loadInjector(INJECT)
  if (!loaded.ok) return { error: `${loaded.code}: ${loaded.why}`, inputs: null, loaded: null }
  const ymlText = F.readCompositionYml()
  let registerNames = null
  let harnessError = null
  if (ymlText !== null) {
    try {
      const contentDir = path.join(dir, 'content')
      buildContentRoot({ root: contentDir, presetDir: PRESET, runRoot: runRoot() })
      const conf = configFromComposition({ ymlText, contentDir })
      if (!conf.ok) throw new Error(`configFromComposition: ${conf.why}`)
      const base = Array.isArray(loaded.mod?.BASE_TOOL_SET) ? loaded.mod.BASE_TOOL_SET : null
      await withHarness(loaded.mod, {
        contentDir,
        config: { ...conf.config, defaultRole: 'member' },
        header: { id: 'mnf06-session', cwd: contentDir, agentPreset: 'member' },
        id: 'mnf06-session',
        catalog: base === null ? [] : buildCatalog(base),
      }, async (harness) => {
        registerNames = harness.registered()
      })
    } catch (error) {
      harnessError = `${error?.code ?? 'THREW'}: ${String(error?.message ?? error)}`
    }
  }
  return {
    error: harnessError,
    loaded,
    inputs: {
      roleTable: loaded.mod?.ROLE_TABLE ?? null,
      baseToolSet: loaded.mod?.BASE_TOOL_SET ?? null,
      registerNames,
      checkNotesText: F.readCheckNotes(),
      ymlText,
    },
  }
}

/**
 * **刀下的翻面矩阵**（一行）：`tool` / `injectorInputs` 是"这一刀切过之后的那套东西"，
 * 把六格全跑一遍，记下哪几格红。规则：本格必须红；**不许六格全红**（那样这把刀没有分辨力）。
 */
async function flipRow({ tool, injectorInputs, dir }) {
  const row = {}
  // 🔴 **cwd 沙盒**：翻面矩阵里 `MNF-01` 会在"入口 cwd"上落草稿（`path-from-cwd` 那把刀）——
  //    不在沙盒里跑，那几份会落到仓库根（第一版就漏到了 `E:\Harness\state\…`）。见 `withCwdSandbox`。
  await F.withCwdSandbox(dir, async () => {
    for (const id of CASE_IDS) {
      if (id === 'MNF-06') {
        row[id] = F.checkC6(injectorInputs).problems.map((p) => p.code)
      } else {
        const r = await F.CHECKS[id]({ tool, dir: path.join(dir, id.toLowerCase()), withChain: false })
        row[id] = r.problems.map((p) => p.code)
      }
    }
  })
  return row
}

/** 断言"这一刀切对了"：本格红 + 别的格至少有一格绿 + 没写到运行根外面。 */
function assertKnife({ id, push, row, label }) {
  const own = row[id] ?? []
  if (own.length === 0) {
    push(`MNF-KNIFE-NOT-BITING`, `[${label}] 这一刀切下去，${id} **必须**红（它守的那条不变量被破坏了），实得 GREEN —— 这把刀没咬住`)
  }
  const others = CASE_IDS.filter((x) => x !== id && (row[x] ?? []).length === 0)
  if (others.length === 0) {
    push('MNF-KNIFE-BLANKET', `[${label}] 六格全红 —— 这把刀切宽了：它不指向"${id} 守的那条不变量"，只是把整套东西弄坏了`)
  }
  // 🔴 刀只能在**运行根**里切：落点跟 cwd 的那种缺陷最容易把证据写到仓库根
  //    （2026-11-09 实测：第一版这一格把三份草稿写到了 `E:\Harness\state\maintenance-drafts\…`）。
  const leaks = F.repoLeaks()
  if (leaks.length > 0) {
    push('MNF-KNIFE-OUTSIDE', `[${label}] 刀把证据写到了运行根之外：${JSON.stringify(leaks)} —— 测试自己越界（不许拿"产品反正也不该这么写"糊过去）`)
  }
  return { own, green_elsewhere: others, repo_leaks: leaks }
}

/** 跑本格的真工具那一侧（缺面 ⇒ 一条 `SUT-SURFACE-MISSING`，不是测试崩）。 */
async function runRealCheck({ id, dir, push, rec }) {
  const real = await F.loadRealTool()
  if (real.mod === null) {
    push('SUT-SURFACE-MISSING', `盘上没有 ${F.TOOL_REL} —— 这一格判不了（${real.error}）。这份红是预期的：工具还不存在`)
    rec.readings.real = { surface_missing: true, file: F.TOOL_REL, why: real.error }
    return null
  }
  const tool = F.realToolAdapter(real.mod)
  const readings = {
    file: F.TOOL_REL,
    tool_name: tool.name,
    codes: tool.codes,
    has_run: tool.hasRun,
    has_verdict: tool.hasVerdict,
  }
  const missing = [
    tool.name === F.TOOL_NAME ? null : `MAINTENANCE_FILE_TOOL_NAME=${JSON.stringify(tool.name)}`,
    tool.codes === null || tool.codes === undefined ? 'MAINTENANCE_FILE_CODES 缺' : null,
    tool.hasRun ? null : 'maintenanceFileRun 缺',
    tool.hasVerdict ? null : 'maintenanceFileVerdict 缺',
  ].filter(Boolean)
  if (missing.length > 0) {
    push('SUT-SURFACE-MISSING', `工具模块在，但冻结的四个名字不齐：${missing.join(' · ')}（契约 §1）`)
  }
  const r = await F.CHECKS[id]({ tool, dir: path.join(dir, 'real') })
  rec.readings.real = { ...readings, ...r.readings, problems: r.problems.map((p) => p.code) }
  for (const p of r.problems) push(p.code, p.message, p.detail)
  return r
}

/** 跑"参照实现/合成注入器"那一侧（阳性对照 或 刀）。C6 走 `checkC6`，别的走 `CHECKS[id]`。
 *  ⚠️ 一律在 **cwd 沙盒**里跑：`path-from-cwd` 那把刀会在入口 cwd 上落草稿，沙盒保证它落在运行根里。 */
async function runSide({ id, dir, tool, injectorInputs, tag }) {
  if (id === 'MNF-06') return F.checkC6(injectorInputs)
  return F.withCwdSandbox(dir, () => F.CHECKS[id]({ tool, dir, tag }))
}

// ═════════════════════════════════════════════════════════════════════════════
// MNF-01 · 一次调用 = 文件 + 池行（+ 跨 kind 号段 + 池子读不了 ⇒ IO 且零草稿）
// ═════════════════════════════════════════════════════════════════════════════
test('MNF-01 提一份案 ⇒ 数据根下有一份草稿、池子末行 kind: maintenance 且 imported_id 相同（+ 跨 kind 号段）', async () => {
  await runCase('MNF-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const dir = F.caseDir('MNF-01')

    await runRealCheck({ id: 'MNF-01', dir, push, rec })

    // ── 尺子 1：阳性对照（tests/ 自带的参照实现必须全绿）──
    const control = await runSide({ id: 'MNF-01', dir: path.join(dir, 'control'), tool: F.referenceTool() })
    rec.readings.control = { problems: control.problems.map((p) => p.code), readings: control.readings }
    if (control.problems.length > 0) {
      push('MNF-CONTROL-NOT-GREEN', `阳性对照没成立：同一份检查跑在参照实现上应当全绿，实得 ${control.problems.length} 条 —— ${JSON.stringify(control.problems.map((p) => `${p.code}: ${String(p.message).slice(0, 160)}`))}`
        + '（那是判据不可满足，不是产品的问题）')
    }

    // ── 尺子 2：刀（把发号改成"按行数发号" ⇒ 号段那一格必须红）──
    const knife = F.KNIVES['MNF-01']
    const knifedTool = F.referenceTool({ defect: knife.defect })
    const knifed = await runSide({ id: 'MNF-01', dir: path.join(dir, 'knife'), tool: knifedTool })
    const row = await flipRow({ tool: knifedTool, injectorInputs: await syntheticInjectorInputs({ withTool: true }), dir: path.join(dir, 'knife-flip') })
    const verdict = assertKnife({ id: 'MNF-01', push, row, label: knife.defect })
    rec.readings.knife = {
      defect: knife.defect,
      own_problems: knifed.problems.map((p) => p.code),
      seq_reading: knifed.readings?.seq_ceiling ?? null,
      flip: row,
      ...verdict,
    }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// MNF-02 · 落点与调用方工作区无关（**定形："这一条最重要"**）
// ═════════════════════════════════════════════════════════════════════════════
test('MNF-02 在另一个工作区里调 ⇒ 草稿只落数据根、那个工作区的 .team/ 零新增；相对 root 当场拒且零写入（两把刀：落点跟调用方 / 收下相对 root）', async () => {
  await runCase('MNF-02', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const dir = F.caseDir('MNF-02')

    await runRealCheck({ id: 'MNF-02', dir, push, rec })

    const control = await runSide({ id: 'MNF-02', dir: path.join(dir, 'control'), tool: F.referenceTool() })
    rec.readings.control = { problems: control.problems.map((p) => p.code), readings: control.readings }
    if (control.problems.length > 0) {
      push('MNF-CONTROL-NOT-GREEN', `阳性对照没成立：参照实现（落点由 root 决定）应当全绿，实得 ${JSON.stringify(control.problems.map((p) => `${p.code}: ${String(p.message).slice(0, 160)}`))}`)
    }

    const knife = F.KNIVES['MNF-02']
    const knifedTool = F.referenceTool({ defect: knife.defect })
    const knifed = await runSide({ id: 'MNF-02', dir: path.join(dir, 'knife'), tool: knifedTool })
    const row = await flipRow({ tool: knifedTool, injectorInputs: await syntheticInjectorInputs({ withTool: true }), dir: path.join(dir, 'knife-flip') })
    const verdict = assertKnife({ id: 'MNF-02', push, row, label: knife.defect })
    rec.readings.knife = {
      defect: knife.defect,
      own_problems: knifed.problems.map((p) => p.code),
      workspace_new: knifed.readings?.new_paths_in_workspace ?? null,
      flip: row,
      ...verdict,
    }

    /**
     * ── 刀 2：**收下相对 root**（`bug-20261110-01` 的判据面）────────────────────────────────
     * 参照实现里那四行 `path.isAbsolute` 拿掉 ⇒ 相对 root 会被收下、按 cwd 折进去、
     * 建出 `state/maintenance-drafts/` 并写一份草稿 ⇒ 本格的相对 root 那一组断言必须红，
     * 而且红的必须是**那一组**（`MNF-C2-RELATIVE-ROOT*`）——不是"整套坏了"。
     */
    const relDefect = 'relative-root-accepted'
    if (!F.referenceTool().defects.includes(relDefect)) {
      push('MNF-KNIFE-ANCHOR', `参照实现的刀清单里没有 ${JSON.stringify(relDefect)} —— 刀换过写法，这把要同批更新`)
    } else {
      const relKnifeTool = F.referenceTool({ defect: relDefect })
      const relKnifed = await runSide({ id: 'MNF-02', dir: path.join(dir, 'knife-relative'), tool: relKnifeTool })
      const relCodes = relKnifed.problems.map((p) => p.code)
      const relRow = await flipRow({ tool: relKnifeTool, injectorInputs: await syntheticInjectorInputs({ withTool: true }), dir: path.join(dir, 'knife-relative-flip') })
      const relVerdict = assertKnife({ id: 'MNF-02', push, row: relRow, label: relDefect })
      rec.readings.knife_relative_root = {
        defect: relDefect,
        must_include: ['MNF-C2-RELATIVE-ROOT'],
        own_problems: relCodes,
        receipt: relKnifed.readings?.relative_root?.p2_zero_write?.receipt ?? null,
        drafts_dir_in_sent_root: relKnifed.readings?.relative_root?.p2_zero_write?.drafts_dir_in_sent_root ?? null,
        new_paths: relKnifed.readings?.relative_root?.p2_zero_write?.new_paths ?? null,
        flip: relRow,
        ...relVerdict,
      }
      if (!relCodes.includes('MNF-C2-RELATIVE-ROOT')) {
        push('MNF-KNIFE-NOT-BITING', `[${relDefect}] 去掉"root 必须是绝对路径"那一道之后，本格必须红 \`MNF-C2-RELATIVE-ROOT\`，`
          + `实得 ${JSON.stringify(relCodes)} —— 相对 root 这一格没有判据（或者判据只看了码、没看它写没写盘）`)
      }
      const wrote = relKnifed.readings?.relative_root?.p2_zero_write
      if (wrote?.drafts_dir_in_sent_root !== true || (wrote?.new_paths ?? []).length === 0) {
        push('MNF-KNIFE-NOT-BITING', `[${relDefect}] 刀切过之后，相对 root 的调用**应当**在 cwd 折出来的那个根里建出 \`state/maintenance-drafts/\` 并写一份草稿`
          + `（实得 目录=${JSON.stringify(wrote?.drafts_dir_in_sent_root)} · 新增=${JSON.stringify(wrote?.new_paths)}）`
          + ' —— 刀没复现那个形状，本格的"零写入"断言就没被它量到')
      }
    }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// MNF-03 · 形状不对要拒，且零写入（末尾一份合法案当尺子）
// ═════════════════════════════════════════════════════════════════════════════
test('MNF-03 形状拒绝四格（缺原文 / 认不出的 op / 目标不在快照 / 多给字段）⇒ 点名 + 零写入；合法案必须收', async () => {
  await runCase('MNF-03', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const dir = F.caseDir('MNF-03')

    await runRealCheck({ id: 'MNF-03', dir, push, rec })

    const control = await runSide({ id: 'MNF-03', dir: path.join(dir, 'control'), tool: F.referenceTool() })
    rec.readings.control = { problems: control.problems.map((p) => p.code), readings: control.readings }
    if (control.problems.length > 0) {
      push('MNF-CONTROL-NOT-GREEN', `阳性对照没成立：参照实现应当把四格都拒掉、末尾收下合法案，实得 ${JSON.stringify(control.problems.map((p) => `${p.code}: ${String(p.message).slice(0, 160)}`))}`)
    }

    const knife = F.KNIVES['MNF-03']
    const knifedTool = F.referenceTool({ defect: knife.defect })
    const knifed = await runSide({ id: 'MNF-03', dir: path.join(dir, 'knife'), tool: knifedTool })
    const row = await flipRow({ tool: knifedTool, injectorInputs: await syntheticInjectorInputs({ withTool: true }), dir: path.join(dir, 'knife-flip') })
    const verdict = assertKnife({ id: 'MNF-03', push, row, label: knife.defect })
    rec.readings.knife = { defect: knife.defect, own_problems: knifed.problems.map((p) => p.code), flip: row, ...verdict }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// MNF-04 · 重复要拒（同一天 / 换一天都拒），池子仍只有一行；换一字 ⇒ 收
// ═════════════════════════════════════════════════════════════════════════════
test('MNF-04 同 content_sha256 再提 ⇒ E_MAINTENANCE_DUPLICATE，池子仍一行（换一字必须收）', async () => {
  await runCase('MNF-04', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const dir = F.caseDir('MNF-04')

    await runRealCheck({ id: 'MNF-04', dir, push, rec })

    const control = await runSide({ id: 'MNF-04', dir: path.join(dir, 'control'), tool: F.referenceTool() })
    rec.readings.control = { problems: control.problems.map((p) => p.code), readings: control.readings }
    if (control.problems.length > 0) {
      push('MNF-CONTROL-NOT-GREEN', `阳性对照没成立：参照实现应当拒掉两次重复、收下换过字的那一份，实得 ${JSON.stringify(control.problems.map((p) => `${p.code}: ${String(p.message).slice(0, 160)}`))}`)
    }

    const knife = F.KNIVES['MNF-04']
    const knifedTool = F.referenceTool({ defect: knife.defect })
    const knifed = await runSide({ id: 'MNF-04', dir: path.join(dir, 'knife'), tool: knifedTool })
    const row = await flipRow({ tool: knifedTool, injectorInputs: await syntheticInjectorInputs({ withTool: true }), dir: path.join(dir, 'knife-flip') })
    const verdict = assertKnife({ id: 'MNF-04', push, row, label: knife.defect })
    rec.readings.knife = {
      defect: knife.defect,
      own_problems: knifed.problems.map((p) => p.code),
      rows_after_dup: knifed.readings?.dup ?? null,
      flip: row,
      ...verdict,
    }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// MNF-05 · 下一轮看得见（**这是昨天那一整天的病**）
// ═════════════════════════════════════════════════════════════════════════════
test('MNF-05 提完 ⇒ 下一轮 claim-update + candidates-freeze 的读数里 kind: maintenance ≥ 1（昨天的现场必须是 0）', async () => {
  await runCase('MNF-05', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const dir = F.caseDir('MNF-05')

    // 真工具那一侧（缺面 ⇒ 一条 SUT-SURFACE-MISSING；读数链仍由参照实现那一侧跑通）
    await runRealCheck({ id: 'MNF-05', dir, push, rec })

    // ── 阳性对照：**真 CLI 三连**（claim-update → judge-pending → candidates-freeze），跑在参照实现上 ──
    const control = await F.checkC5({ tool: F.referenceTool(), dir: path.join(dir, 'control'), withChain: true })
    rec.readings.control = { problems: control.problems.map((p) => p.code), readings: control.readings }
    if (control.problems.length > 0) {
      push('MNF-CONTROL-NOT-GREEN', `阳性对照没成立：参照实现 + 真 CLI 三连应当全绿，实得 ${JSON.stringify(control.problems.map((p) => `${p.code}: ${String(p.message).slice(0, 200)}`))}`)
    }

    const knife = F.KNIVES['MNF-05']
    const knifedTool = F.referenceTool({ defect: knife.defect })
    const knifed = await F.checkC5({ tool: knifedTool, dir: path.join(dir, 'knife'), withChain: true })
    const row = await flipRow({ tool: knifedTool, injectorInputs: await syntheticInjectorInputs({ withTool: true }), dir: path.join(dir, 'knife-flip') })
    const verdict = assertKnife({ id: 'MNF-05', push, row, label: knife.defect })
    rec.readings.knife = {
      defect: knife.defect,
      own_problems: knifed.problems.map((p) => p.code),
      filed_pool_maintenance_rows: knifed.readings?.filed?.pool_maintenance_rows ?? null,
      chain: knifed.readings?.chain ?? null,
      flip: row,
      ...verdict,
    }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// MNF-06 · 可达性：判组合（不判散文）+ 体检同伴同批
// ═════════════════════════════════════════════════════════════════════════════
test('MNF-06 工具在 agenia-member 的工具面上（ROLE_TABLE / 实际注册）+ 体检点名（刀：合成注入器去掉它 ⇒ 本格红）', async () => {
  await runCase('MNF-06', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const dir = F.caseDir('MNF-06')

    // ── 真组合那一侧 ──
    const real = await realInjectorInputs(dir)
    if (real.inputs === null) {
      push('SUT-SURFACE-MISSING', `读不到现役注入器（${INJECT}）：${real.error}`)
      rec.readings.real = { surface_missing: true, why: real.error }
    } else {
      if (real.inputs.checkNotesText === null) {
        caseHold(rec, 'CHECK-NOTES-ABSENT', `.tools/check-notes.mjs 不在这棵树里（${path.join(PATHS.repo, '.tools', 'check-notes.mjs')}）—— 体检同伴那一格在本树里判不了；不是绿`)
      }
      if (real.error !== null) push('MNF-C6-HARNESS', `真跑 \`apply()\` 失败：${real.error} —— 注册面判不了（不许当绿）`)
      const r = F.checkC6(real.inputs)
      rec.readings.real = r.readings
      for (const p of r.problems) push(p.code, p.message, p.detail)
    }

    // ── 尺子 1：合成注入器**带着它** ⇒ 必须绿（证明这一格可满足）──
    const withTool = await syntheticInjectorInputs({ withTool: true })
    const control = F.checkC6(withTool)
    rec.readings.control = { problems: control.problems.map((p) => p.code), readings: control.readings }
    if (control.problems.length > 0) {
      push('MNF-CONTROL-NOT-GREEN', `阳性对照没成立：合成注入器（工具面与注册都带它）应当全绿，实得 ${JSON.stringify(control.problems.map((p) => `${p.code}: ${String(p.message).slice(0, 160)}`))}`)
    }

    // ── 尺子 2：刀 = 合成注入器**去掉它** ⇒ 本格必须红、别的五格必须绿 ──
    const withoutTool = await syntheticInjectorInputs({ withTool: false })
    const row = await flipRow({ tool: F.referenceTool(), injectorInputs: withoutTool, dir: path.join(dir, 'knife-flip') })
    const verdict = assertKnife({ id: 'MNF-06', push, row, label: 'face-without-tool' })
    rec.readings.knife = {
      defect: 'face-without-tool',
      own_problems: F.checkC6(withoutTool).problems.map((p) => p.code),
      flip: row,
      ...verdict,
    }
    caseFail(problems)
  })
})
