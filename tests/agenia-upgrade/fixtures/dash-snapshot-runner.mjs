/**
 * 看板 Node 半边的**端到端载具**（`DASH-11` / `DASH-12` 用；不是用例，不进分母）。
 *
 * 为什么要有它：`lib/index.js` 是 cordis 插件体（`apply(ctx, config)`），它的产出是
 * `<工作区>/presets/agenia/.runtime/state/dashboard/view.json` 这份**文件**。
 * 用例要判的是"真跑一次插件之后盘上多了什么"，所以这里用真子进程 + 假 ctx：
 *   · `ctx.effect(fn)` 立刻跑 fn（拿到 cleanup 后清掉 15 s 定时器 —— 子进程能退）；
 *   · `ctx.logger.warn` 收集成 `warnings`（写盘失败折成一条警告：见 `lib/index.js` 的
 *     `try/catch`，所以"崩没崩"不能只看退出码，得看盘上那两份文件的形状）。
 *
 * 用法：
 *   node dash-snapshot-runner.mjs <pluginIndexAbs> <workspaceRootAbs> <normal|crash-mid-write> [clockFile]
 *
 * `crash-mid-write`：在**子进程里**把 `node:fs` 换成一个包装（`module.registerHooks` 的 resolve 钩子，
 * 不改盘上任何源码），**写盘原语**（`writeFileSync` 与 `writeSync`）先写**半份**再抛 —— 模拟
 * "写到一半进程没了"。两个原语都包，是因为判据不再认"哪一种写盘写法"：手搓的写临时件走
 * `writeFileSync`，共享件 `writeFileAtomic` 走 `writeSync(handle)` —— 同一个崩溃现场下，
 * **活文件一个字都不该变**；直接写活文件的实现在两种写法下都会留下半份。
 * 灯只在**大的**写（≥ 16 字节）上亮，且不碰 fd 1 / 2（那是这个跑者自己的输出通道）。
 * 崩过之后 `crash` 读数（`primitive` / `bytes_total` / `bytes_written`）随 payload 回给父进程 ——
 * "崩真的发生了"是判据的前置，不许靠"活文件没变"倒推。
 *
 * 输出：一行 JSON（`phase` / `ok` / `message` / `warnings` / `crash` / `root`），给父进程读。
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const [pluginIndex, root, mode = 'normal', clockFile = ''] = process.argv.slice(2)
const warnings = []
const out = { phase: 'start', ok: false, mode, root, warnings, crash: null, plugin: pluginIndex, clock: clockFile || null }

if (mode === 'crash-mid-write') {
  // ⚠️ 包装里那句 `// dash-crash-wrapper` 是**递归守卫**：包装自己 import `node:fs` 时不能再被换成自己。
  //    `crash` 的读数要能区分"崩在哪个原语上、写了多少字节"—— 判据的前置就是它。
  const wrapper = [
    'export * from "node:fs";',
    'import * as real from "node:fs";',
    'const MIN = 16;',
    'let crash = null;',
    'function arm(primitive, bytesTotal) {',
    '  crash = { primitive, bytes_total: bytesTotal, bytes_written: Math.max(1, Math.floor(bytesTotal / 2)) };',
    '  return crash.bytes_written;',
    '}',
    'export function crashReading() { return crash; }',
    'export function writeFileSync(file, data, ...rest) {',
    '  const text = String(data);',
    '  if (text.length >= MIN) {',
    '    const half = text.slice(0, arm("writeFileSync", text.length));',
    '    real.writeFileSync(file, half, ...rest);',
    '    throw new Error("SIMULATED-CRASH-MID-WRITE");',
    '  }',
    '  return real.writeFileSync(file, data, ...rest);',
    '}',
    'export function writeSync(fd, data, ...rest) {',
    '  const isText = typeof data === "string" || data instanceof Uint8Array;',
    '  const bytesTotal = isText ? (typeof data === "string" ? Buffer.byteLength(data) : data.byteLength) : 0;',
    '  if (fd > 2 && bytesTotal >= MIN) {',
    '    const half = arm("writeSync", bytesTotal);',
    '    const part = typeof data === "string" ? data.slice(0, half) : data.subarray(0, half);',
    '    real.writeSync(fd, part);',
    '    throw new Error("SIMULATED-CRASH-MID-WRITE");',
    '  }',
    '  return real.writeSync(fd, data, ...rest);',
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

// `crashReading` 只在崩溃模式里存在；从撞过的那个 `node:fs` 包装里读回来（不是从错误字符串里猜）。
if (mode === 'crash-mid-write') {
  try {
    const fs = await import('node:fs')
    if (typeof fs.crashReading === 'function') out.crash = fs.crashReading()
  } catch {
    /* 读不回来就保持 null —— 判据会把"崩溃读数缺失"记成前置不成立，不记绿 */
  }
}

process.stdout.write(`${JSON.stringify(out)}\n`)
