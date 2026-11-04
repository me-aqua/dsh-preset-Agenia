/**
 * 看板 Node 半边的**端到端载具**（`DASH-11` / `DASH-12` 用；不是用例，不进分母）。
 *
 * 为什么要有它：`lib/index.js` 是 cordis 插件体（`apply(ctx, config)`），它的产出是
 * `<工作区>/presets/agenia/.runtime/state/dashboard/view.json` 这份**文件**。
 * 用例要判的是"真跑一次插件之后盘上多了什么"，所以这里用真子进程 + 假 ctx：
 *   · `ctx.effect(fn)` 立刻跑 fn（拿到 cleanup 后清掉 15 s 定时器 —— 子进程能退）；
 *   · `ctx.logger.warn` 收集成 `warnings`（新实现会把写盘失败折成一条警告：见 `lib/index.js` 的
 *     `try/catch`，所以"崩没崩"不能只看退出码，得看盘上那两份文件的形状）。
 *
 * 用法：
 *   node dash-snapshot-runner.mjs <pluginIndexAbs> <workspaceRootAbs> <normal|crash-mid-write> [clockFile]
 *
 * `crash-mid-write`：在**子进程里**把 `node:fs` 换成一个包装（`module.registerHooks` 的 resolve 钩子，
 * 不改盘上任何源码），`writeFileSync` 先写**半份**再抛 —— 模拟"写到一半进程没了"。
 * 这不是造一个假错误来让判据红：同一个现场下，原子写（写 `.tmp` 再 rename）的**活文件**一个字都不会变，
 * 直接写活文件的实现会留下**半份活文件** —— 两种实现用同一个现场分得开，判据才不是装饰。
 *
 * 输出：一行 JSON（`phase` / `ok` / `message` / `warnings` / `root`），给父进程读。
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const [pluginIndex, root, mode = 'normal', clockFile = ''] = process.argv.slice(2)
const warnings = []
const out = { phase: 'start', ok: false, mode, root, warnings, plugin: pluginIndex, clock: clockFile || null }

if (mode === 'crash-mid-write') {
  // ⚠️ 包装里那句 `// dash-crash-wrapper` 是**递归守卫**：包装自己 import `node:fs` 时不能再被换成自己。
  const wrapper = [
    'export * from "node:fs";',
    'import * as real from "node:fs";',
    'export function writeFileSync(file, data, ...rest) {',
    '  const text = String(data);',
    '  const half = text.slice(0, Math.max(1, Math.floor(text.length / 2)));',
    '  real.writeFileSync(file, half, ...rest);',
    '  throw new Error("SIMULATED-CRASH-MID-WRITE");',
    '}',
    'export default real.default ?? real;',
    '// dash-crash-wrapper',
  ].join('\n')
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const fromWrapper = String(context.parentURL ?? '').includes('dash-crash-wrapper')
      if (specifier === 'node:fs' && !fromWrapper) {
        return { url: `data:text/javascript,${encodeURIComponent(wrapper)}`, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
  })
}

try {
  const mod = await import(pathToFileURL(pluginIndex).href)
  const cleanups = []
  const ctx = {
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    },
    logger: {
      warn(message) {
        warnings.push(String(message))
      },
    },
  }
  let thrown = null
  try {
    mod.apply(ctx, { root })
  } catch (err) {
    thrown = err
  }
  for (const cleanup of cleanups) {
    try {
      cleanup()
    } catch {
      /* 定时器已经没了也不影响读数 */
    }
  }
  if (thrown !== null) {
    out.phase = 'apply-threw'
    out.message = String(thrown?.message ?? thrown)
  } else {
    out.phase = 'apply-returned'
    out.ok = true
  }
} catch (err) {
  out.phase = 'import-threw'
  out.message = String(err?.message ?? err)
}

process.stdout.write(`${JSON.stringify(out)}\n`)
