/**
 * **「装好的预设」场景** —— 端到端正例要的那一档：盘上真有一个装好的库。
 *
 * 为什么要造这一档（来历）：
 *   `DR-01` 的端到端正例原先打的靶子是 **staging 里那份 preset** 的 `REAL_BRAIN_ROOT`，
 *   而 staging 是**开发副本**（没有 `.runtime`）⇒ 那一格只能是 HOLD（`REAL-MODE-POSITIVE-VACUOUS`）。
 *   文件头那条死命令不许在 staging 里造假库（会污染后续每一跑）。两件事同时成立时的**唯一解**：
 *   把"装好的位置"搬到**运行根里**来 —— 拷一份副本、在副本自己的 `.runtime` 上放数据段、
 *   跑副本的 CLI。staging 与 `presets/agenia` 一个字节都不动。
 *
 * 这一档为什么仍然是**真的**端到端（不是把答案喂给被测者）：
 *   · `REAL_BRAIN_ROOT` 由**副本自己的 `lib/paths.mjs`** 算出来（`PRESET_DIR/.runtime`），本模块不写死它；
 *   · 跑的是**真子进程**（`bin/agenia-brain.mjs`），走真参数解析、真根判定、真 op；
 *   · 判据不看"本模块的安排"，看 exit code / stdout 信封 / 盘上读数（`integration/data-root.test.mjs`）。
 *
 * 🔴 只落在**运行根**之下：`ensureMarkedDir` 自己会拒掉运行根之外的目录。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertDeletable, canonical, ensureMarkedDir, TEST_ROOT_MARKER } from './root-guard.mjs'
import { ENV, requireEnv } from './env.mjs'

/**
 * 把 staged preset 拷成"装好的预设"。
 *
 * 目录形状：
 *   ```
 *   <run-root>/ws-<caseid>-<purpose>/            ← 带 `.agenia-test-root` marker 的场景根
 *   └─ preset/                                    ← staged preset 的整棵副本（**就是**"装好的预设"）
 *      ├─ bin/ lib/ ...                           （逐字节来自 staging）
 *      └─ .runtime/                               ← 由用例放（本函数**不**造它）
 *   ```
 *
 * 🔴 两处刻意的"不"：
 *   · **不从源里拷 `.runtime`**（`cpSync` 的 `filter` 把它整棵跳过）：装好的那一瞬还没有库，
 *     数据段只由 `min-runtime.mjs` 摆。源里若真有一个库，读数里会写 `source_runtime_present:true`，
 *     由读的人判断"是不是有人往 staging 里放了不该放的东西"。
 *   · **上一跑的残件删不删，先过 `assertDeletable`**（契约 §2.5：解析绝对路径 → 校验 marker →
 *     校验在 RUN_ID 之下 → 拒真实根 / 拒 C 盘）。没有 marker 的目录一律不删 —— 先看现场。
 *
 * @returns {{dir:string, presetRoot:string, brainCli:string, source:string, source_runtime_present:boolean}}
 */
export function installedPreset(caseId, purpose, env = process.env) {
  const runRoot = canonical(requireEnv(ENV.RUN_ROOT, env))
  const runId = path.basename(runRoot)
  const dir = path.join(runRoot, `ws-${String(caseId).toLowerCase()}-${purpose}`)
  if (existsSync(dir)) {
    if (!existsSync(path.join(dir, TEST_ROOT_MARKER))) {
      throw new Error(`E_ROOT_NO_MARKER: ${dir} 在盘上但没有 ${TEST_ROOT_MARKER} —— 不是本用例建的那一棵，拒绝删除（先看现场）`)
    }
    // 删除前置校验（marker 在、在运行根之下、不是真实根、不在 C 盘）—— 校验不过就抛，绝不"先删了再说"。
    assertDeletable(dir, { runRoot })
    rmSync(dir, { recursive: true, force: true })
  }
  const marked = ensureMarkedDir(dir, { runRoot, runId, kind: 'agenia-test-workspace' })
  const source = canonical(requireEnv(ENV.STAGING_PRESET, env))
  const sourceRuntime = path.join(source, '.runtime')
  const presetRoot = path.join(marked, 'preset')
  mkdirSync(presetRoot, { recursive: true })
  cpSync(source, presetRoot, { recursive: true, filter: (src) => path.basename(src) !== '.runtime' })
  return {
    dir: marked,
    presetRoot,
    brainCli: path.join(presetRoot, 'bin', 'agenia-brain.mjs'),
    source,
    source_runtime_present: existsSync(sourceRuntime),
  }
}

/**
 * 载入**副本**里的一个模块（与 `support/sut.mjs::loadStagedModule` 同形，但不抛）。
 *
 * 为什么不复用 `loadStagedModule`：那个函数把根钉在 `AGENIA_STAGING_PRESET` 上，
 * 而这里要载的正是**另一棵树**（装好的副本）—— 两个根各有各的用途，别混。
 *
 * @returns {{rel:string, surfaceMissing:boolean, mod:object|null, missing:string[], errors:string[]}}
 */
export async function loadInstalledModule(installed, rel, names = []) {
  const abs = path.resolve(installed.presetRoot, rel)
  if (!existsSync(abs)) return { rel, surfaceMissing: true, mod: null, missing: [...names], errors: [`装好的副本里没有 ${rel}`] }
  try {
    const mod = await import(pathToFileURL(abs).href)
    return { rel, surfaceMissing: false, mod, missing: names.filter((n) => !(n in mod) || typeof mod[n] === 'undefined'), errors: [] }
  } catch (err) {
    return {
      rel,
      surfaceMissing: err?.code === 'ERR_MODULE_NOT_FOUND',
      mod: null,
      missing: [...names],
      errors: [String(err?.message ?? err).slice(0, 240)],
    }
  }
}
