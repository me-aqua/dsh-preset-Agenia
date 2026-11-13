/**
 * `lib/cli-harness.mjs` —— CLI 的**入口骨架**：`parseArgs` / `cliError` / `emit`（构案 0009 · 史山清查 B4）。
 *
 * 这三样过去在 20 支 CLI 里各写一套（`parseArgs` 11 种写法、`cliError` 7 种、`emit` 3 种）。后果不是
 * "代码长"，是**参数形式不统一**：`bug-20261113-19`（`--backup-dir=<dir>` 被静默忽略、回落默认目录）
 * 就是这族的一个实例 —— 11 套解析器、11 种对"未知参数"的态度。现在只剩这一份。
 *
 * ## 对外就三个名字
 *   · `parseArgs(argv, spec)` —— **同时接受** `--k v` 与 `--k=v`；不认识的参数（含裸位置参数）
 *     **抛 `E_ARG_USAGE`**，不静默、不回落默认值；
 *   · `cliError(code, message, details)` —— 统一的 `{code, message, details}` 错误信封；
 *   · `emit(envelope)` —— **一行 JSON 到 stdout**。它的**定义**不在这里：唯一定义在
 *     `lib/cli-guards.mjs`（B3）的标记块里，本文件只**转出**（`export { emit } from …`）。
 *     两块各写一个 `emit` 就是"同一件事两份正文" —— 正是这一票要清的病，不许边清边造。
 *
 * ## 参数表（`spec`）：每支 CLI 只交一张**声明**，不写逻辑
 * ```js
 * parseArgs(argv, {
 *   value: { '--op': 'op', '--data-root': 'dataRoot' },   // --k v / --k=v ⇒ 属性 = 值
 *   flag:  { '--test-mode': 'testMode' },                 // 开关 ⇒ 属性 = true
 *   defaults: { op: 'install' },                          // 没给时的默认值
 *   positional: false,                                    // 裸位置参数：哪些 CLI 收（缺省不收）
 * })
 * ```
 * 值缺失（`--op` 后面没有下一个 token，或下一个 token 是另一个 `--` 参数）⇒ `E_ARG_USAGE`
 * —— 少了值却当成"没有这个参数"，落点会静默回落到默认值，那是 `-19` 的同一种病。
 *
 * ## 逐字内联（构案 0008 · 拍板 Q6 的同一套机制）
 * `bin/rollback.mjs` 是单文件出厂件（零静态 import）。它 import 本文件之后，发布器
 * （`bin/install.mjs --op publish-staged`）要把下面那一对标记之间的正文**逐字内联**进出厂件。
 * ⚠️ 本注释里刻意**不写**那一对标记的完整字面量：发布器与判据都按行找标记，
 *    注释里再写一遍就会被当成真的标记行（切出来的正文会从注释开始）—— 与 `cli-guards.mjs` 同一条规矩。
 * 块里只有这两个函数：除了彼此与内建（`Error` / `Object`）之外不引用块外的东西，也不声明模块级 `const`
 * —— 出厂件里这一块要与「原子写并集正文」「公共 helper 正文」拼进同一个模块作用域（多一样会撞名）。
 *
 * ## 刀锚
 * "未知参数出声"那一行**单独成行、带刀锚**（契约 §3.4）：阳性对照的做法是把整行换成
 * `void 0`，未知参数于是被静默跳过 —— 判据必须当场红并点名那一支。刀锚在哪个函数的字节上，
 * 谁改那个函数谁同批改刀（`cand-20261106-0140`）。
 */
// @inline-begin CLI 骨架正文（11 支 CLI 的 parseArgs / cliError；发布时逐字内联进出厂件，边界由这一对标记定）
export function cliError(code, message, details = null) {
  const err = new Error(message)
  err.name = 'CliHarnessError'
  err.code = code
  err.details = details
  return err
}

export function parseArgs(argv, spec = {}) {
  const value = spec.value ?? {}
  const flag = spec.flag ?? {}
  const out = {}
  for (const name of Object.values(value)) out[name] = null
  for (const name of Object.values(flag)) out[name] = false
  Object.assign(out, spec.defaults ?? {})
  const positional = []
  const list = argv ?? []
  for (let i = 0; i < list.length; i += 1) {
    const raw = String(list[i])
    const eq = raw.indexOf('=')
    const key = eq >= 0 ? raw.slice(0, eq) : raw
    const inline = eq >= 0 ? raw.slice(eq + 1) : null
    if (Object.hasOwn(value, key)) {
      const next = inline !== null ? inline : list[i + 1]
      if (inline === null && (next === undefined || String(next).startsWith('--'))) {
        throw cliError('E_ARG_USAGE', `${key} 后面要跟一个值（收到 ${next === undefined ? '行尾' : JSON.stringify(String(next))}）`)
      }
      out[value[key]] = inline !== null ? inline : String(list[(i += 1)])
      continue
    }
    if (Object.hasOwn(flag, key)) {
      if (inline !== null) throw cliError('E_ARG_USAGE', `${key} 是开关参数，不带值（收到 ${JSON.stringify(raw)}）`)
      out[flag[key]] = true
      continue
    }
    if (spec.positional === true && !key.startsWith('-')) {
      positional.push(raw)
      continue
    }
    throw cliError('E_ARG_USAGE', `未知参数：${raw}`) // B4-KNIFE-ANCHOR
  }
  out.positional = positional
  return out
}
// @inline-end CLI 骨架正文（这一行与上面那条 begin 标记成对；缺一条 ⇒ 发布拒跑）
export { emit } from './cli-guards.mjs'
