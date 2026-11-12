/**
 * `ATM-01` —— **原子写归一**（构案 0006 · 史山清查 B1 · Gate 2）。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-史山清查-B1.md`（口径 / 七类腿 / 九把刀 / 分母的唯一出处）。
 * 定形：`.team/leader/2026-11-12/定形-B1-原子写归一.md`。决定：`决议/构案/0006-原子写归一.md`。
 * 量具：`support/atomic-writers.mjs`（计数 / 落点 / 重试码 / 调用点 / 刀，全部只有那一份）。
 *
 * ## 病（2026-11-12 现量）
 * `writeFileAtomic` 在同一仓库里有 **3 份实现**：
 *   · 共享件 `presets/agenia/lib/atomic.mjs:69` —— 有 fsync / `wx` / `RETRYABLE_RENAME` / 失败清残渣 /
 *     返回 `{ok, code, path, bytes, attempts}`；**没有 allowedRoot 删除闸**；
 *   · CLI 甲 `presets/agenia/bin/install.mjs:464` —— 有 allowedRoot 删除闸（`deletableVerdict`）/
 *     清理拒绝上报 stderr / 返回 `{ok,tmp}`；**没有 fsync**、临时件用 `writeFileSync` 不是 `wx`；
 *   · CLI 乙 `presets/agenia/bin/rollback.mjs:395` —— 与甲逐字节同体。
 * ⇒ **不是"一份带守卫一份不带"，是两份各有各的强**。合并必须取并集（决定 §决定）。
 *
 * ## 腿（一条用例 = 一格；腿不是格，分母只 +1；并集四条各自单独判）
 *   · **腿 0 · 定义**：`presets/**` 里 `function writeFileAtomic` **恰好 1 处**，落在
 *     `presets/agenia/lib/atomic.mjs`；两份 CLI 副本为 0。读数印**份数 + 每个落点**（`file:line`）。
 *     **刀**：scratch 树里只有共享件 ⇒ 绿（控制）；把共享件那一段**逐字**复制成
 *     `presets/agenia/bin/install.mjs` ⇒ 红，且报文**点名两边路径**。
 *   · **腿 1（并集 a）· fsync 真的落盘**：桩住 `fsyncSync`，一次成功写必须出现 `fsyncSync`，
 *     且次序是 `writeSync` → `fsyncSync` → `renameSync`、fsync 的 fd = 打开的 fd。
 *     **刀**：把函数体里的 `fsyncSync(handle)` 删掉 ⇒ 红（`ATM01-NO-FSYNC`）。这就是旧 CLI 体缺的那一样。
 *   · **腿 2（并集 b）· 临时件 `wx` 独占建**：打开的临时件 flags 必须含 `wx`，且**不许**用
 *     `writeFileSync(tmp, …)` 建它（旧 CLI 的写法）。
 *     **刀**：`openSync(tmp, 'wx')` → `openSync(tmp, 'w')` ⇒ 红（`ATM01-NO-WX`）。
 *   · **腿 3（并集 c）· allowedRoot 删除闸**：写失败之后，闸**拒绝**清临时件时必须
 *     ①临时件**还在**（不删）②目标**没被写**③**出声**（stderr）**或**回一个具名码
 *     ④`cleanup_refused.delete_gate` 在（install/rollback 的调用点读的就是它）。
 *     反面控制：闸放行时（临时件在 allowedRoot 之下且该根带 marker）临时件**必须**被清掉
 *     —— 否则"拒绝时不删"可以用"永远不删"冒充。默认（不给 `allowedRoot`）的旧行为也要清（不变）。
 *     **刀**：把闸放宽成"临时件所在目录"（`root: allowedRoot ?? null` → `root: path.dirname(tmp)`）⇒ 红；
 *     第二把刀把拒绝分支写成 `if (false)` ⇒ 红（出声那一半）。
 *   · **腿 4（并集 d）· 重试码**：`EPERM` / `EBUSY` / `EACCES` **各重试一次都要成**（`attempts === 2`，
 *     `renameSync` 恰好 2 次）；**非重试码**（`ENOENT`）**不许**重试（1 次就放弃）。
 *     结构面：重试码只许有一份 —— `RETRYABLE_RENAME` 在、三个码齐、声明之外**没有**第二份内联数组。
 *     **刀**：把 `'EACCES'` 改名 ⇒ 那一条不再重试 ⇒ 红；往文件里追加一份内联
 *     `['EPERM','EBUSY','EACCES']` ⇒ 结构面红（`ATM01-RETRY-DUP`）。
 *     ⚠️ **现量事实**：共享件与 CLI 的两套码**成员完全相同**（`EPERM/EBUSY/EACCES`）⇒
 *     "取并集"在成员上是恒等操作；这条腿能判的是**覆盖**（三条码各重试一次）与**只剩一份**（结构），
 *     判不了"两套都留着"（那两种写法行为不可分）。契约 §0.3 写清了这条边界。
 *   · **腿 5 · 信封**：成功返回 `{ok:true, code:null, message, path, bytes, attempts}`；
 *     失败返回 `{ok:false, code, message, path}`（`attempts` 尽量有）。install / rollback 两个
 *     调用点都必须**从共享件 import**、**真调它**、且**不再读 `{ok,tmp}`**（`.tmp` 属性读 = 0 处）。
 *     **刀**：把共享件那个函数换成一个"旧 CLI 形状"的桩（返回 `{ok:true, tmp}`）⇒ 红。
 *   · **腿 6 · 既有行为不破**（不是新腿：靠既有格）—— 见 `PRESERVATION`：
 *     `INS-01`（安装正例 / 数据与未知文件逐字节保留 / 重装幂等）· `INS-02`（回滚正例 / 数据不动 /
 *     失败保留现场）· `INS-03`（备份在 E 盘带哈希清单）· `ENV-02`（删除前 marker / 临时件 / C 盘）·
 *     `STAT-01`（staged 与现役逐字节相同）。它们由**这一跑的全量入口**证明（`F57-SETTLE` 那一行 +
 *     各自 `_evidence/<RUN_ID>/<ID>/result.json`）。本格只记"依赖哪几条腿 + 在哪个文件"，并核对它们**还在**。
 *
 * ## 期望读数
 *   · **Gate 2（今天，3 份实现）**：`ATM-01` 红在 `ATM-DEF-COUNT`（3 处）+ `ATM-DEF-CLI-COPY` ×2 +
 *     `ATM-CALLSITE-NO-IMPORT` ×2 + `ATM01-GATE-DELETED`（共享件没有删除闸）+ `ATM01-ENVELOPE-SUCCESS`
 *     （共享件的成功信封没有 `message`）⇒ 套件 `218 · RED 1 / GREEN 216 / HOLD 1`。
 *   · **Gate 3 之后**：真树 1 处定义、两个调用点读共享件、并集四条全绿 ⇒ `218 · RED 0 / GREEN 217 / HOLD 1`。
 *     ⚠️ 这条期望**有一个前置裁决**（契约 §0.2）：`rollback.mjs` 今天受拍板 Q6 约束
 *     （单文件自足、零静态 import），照定形让它 import 共享件会让 `INS-02 ①` / `ENV-02 ROLLBACK-IMPORT`
 *     翻红；而 `STAT-01` 又要求 staged 与现役逐字节相同。裁决没下来之前 Gate 3 无论怎么走都会有余波 ——
 *     读数里如实记着（`collision_q6`），那不是本格的红因。
 */
import { test } from 'node:test'
import path from 'node:path'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { caseFail, problem, runCase, runId, runRoot } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { ensureMarkedDir, isUnder } from '../support/root-guard.mjs'
import { TOTAL } from '../support/registry.mjs'
import {
  ATOMIC_FN,
  CANONICAL_ATOMIC,
  CLI_COPY_FILES,
  applyMutations,
  callSiteReading,
  callSiteVerdict,
  definitionVerdict,
  extractFunctionText,
  pickMutation,
  retryReading,
  retryVerdict,
  scanWriteFileAtomicDefinitions,
} from '../support/atomic-writers.mjs'

const LIVE = PATHS.repo
const LIB_REL = 'presets/agenia/lib'
const SPY_FILE = 'spy-fs.mjs'
const PAYLOAD = 'ATM01-PAYLOAD'
const RETRY_CODES = ['EPERM', 'EBUSY', 'EACCES']

/**
 * 既有格 / 既有腿 —— 本格**依赖**它们把"装上 / 回得去 / 闸还在 / 两棵树同版"这几件事钉住。
 * 只列 ID + 腿 + 落点；它们绿不绿由**这一跑**的入口结算证明，本格不代替它们判（也不重跑它们的现场）。
 */
const PRESERVATION = [
  { id: 'INS-01', file: 'integration/install-rollback.test.mjs', legs: '安装正例 · 非空数据与未知文件逐字节保留 · 重装幂等' },
  { id: 'INS-02', file: 'integration/install-rollback.test.mjs', legs: '回滚正例（代码回退 / 数据不动）· 失败保留现场' },
  { id: 'INS-03', file: 'integration/install-rollback.test.mjs', legs: '备份落 E 盘 + 哈希清单 · 三个脚本无 C 盘默认临时' },
  { id: 'ENV-02', file: 'static/env-scan.test.mjs', legs: '删除前 marker / 临时件默认落点 / C 盘 / 真实根默认值（含扫描器自控）' },
  { id: 'STAT-01', file: 'static/composition.test.mjs', legs: 'staged 与现役两棵树逐字节相同（含零样本 / 缩水两支）' },
]

/**
 * **桩 fs**：把被测模块的 `node:fs` 换成这一份 —— 记录调用 / 计划好第 N 次 rename 抛什么码。
 * 语义仍然是真文件系统（临时件真的被建出来、真的被删），只有"哪一次抛"是注入的。
 * 只用于 scratch 副本；真树一个字节都不碰。
 */
const SPY_SOURCE = `import * as real from 'node:fs'
export * from 'node:fs'
export default real
export const __calls = []
export const __plan = { rename_codes: [], unlink_code: null, write_code: null, open_code: null }
export function __reset(plan = {}) {
  __calls.length = 0
  __plan.rename_codes = [...(plan.rename_codes ?? [])]
  __plan.unlink_code = plan.unlink_code ?? null
  __plan.write_code = plan.write_code ?? null
  __plan.open_code = plan.open_code ?? null
  return __calls
}
const boom = (op, code) => {
  const err = new Error('spy ' + op + ' ' + code)
  err.code = code
  return err
}
export function openSync(p, flags, mode) {
  const rec = { op: 'openSync', path: String(p), flags: String(flags), fd: null }
  __calls.push(rec)
  if (__plan.open_code !== null) {
    const code = __plan.open_code
    __plan.open_code = null
    throw boom('open', code)
  }
  rec.fd = real.openSync(p, flags, mode)
  return rec.fd
}
export function writeSync(fd, data, ...rest) {
  __calls.push({ op: 'writeSync', fd })
  if (__plan.write_code !== null) {
    const code = __plan.write_code
    __plan.write_code = null
    throw boom('write', code)
  }
  return real.writeSync(fd, data, ...rest)
}
export function writeFileSync(p, data, ...rest) {
  __calls.push({ op: 'writeFileSync', path: String(p) })
  return real.writeFileSync(p, data, ...rest)
}
export function fsyncSync(fd) {
  __calls.push({ op: 'fsyncSync', fd })
  return real.fsyncSync(fd)
}
export function closeSync(fd) {
  __calls.push({ op: 'closeSync', fd })
  return real.closeSync(fd)
}
export function renameSync(from, to) {
  __calls.push({ op: 'renameSync', from: String(from), to: String(to) })
  const code = __plan.rename_codes.length > 0 ? __plan.rename_codes.shift() : null
  if (code !== null) throw boom('rename', code)
  return real.renameSync(from, to)
}
export function unlinkSync(p) {
  __calls.push({ op: 'unlinkSync', path: String(p) })
  if (__plan.unlink_code !== null) {
    const code = __plan.unlink_code
    __plan.unlink_code = null
    throw boom('unlink', code)
  }
  return real.unlinkSync(p)
}
export function mkdirSync(...args) {
  __calls.push({ op: 'mkdirSync' })
  return real.mkdirSync(...args)
}
`

/** 旧 CLI 的信封形状（腿 5 的刀：把共享件那个函数整个换掉）。 */
const OLD_CLI_SHAPE_STUB = `export function ${ATOMIC_FN}(dest, buf, options = {}) {
  const target = path.resolve(String(dest))
  mkdirSync(path.dirname(target), { recursive: true })
  const handle = openSync(target, 'w')
  writeSync(handle, buf)
  closeSync(handle)
  return { ok: true, tmp: target + '.tmp' }
}`

/** 本格的 scratch 树全部住运行根里（`<run-root>/fixtures/atm01/<tag>`）—— 不碰真树。 */
function fixtureRoot(tag) {
  const dir = path.join(runRoot(), 'fixtures', 'atm01', tag)
  const base = path.resolve(runRoot())
  const made = ensureMarkedDir(dir, { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
  if (!isUnder(made, base)) throw new Error(`ATM01-FIXTURE-ESCAPE: 夹具根跑到运行根之外：${made}（运行根 ${base}）`)
  return made
}

/** 往 scratch 树里写一份文件（自动建父目录）。 */
function put(root, rel, bytes) {
  const file = path.join(root, ...rel.split('/'))
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  return file
}

/**
 * 造一份**被测实现的 scratch 副本**：`<root>/lib/*.mjs` 全量复制（合并之后它可能 import 兄弟模块），
 * 逐份把 `node:fs` 换成同名目录里的桩；`lib/atomic.mjs` 是入口。
 *
 * 刀分两层：
 *   · `fileMutations` —— 改**整个文件**（例如模块级的 `RETRYABLE_RENAME`）；
 *   · `mutations` —— 只改**那个函数内部**（脚本里同名的 `fsyncSync(handle)` 在锁那一支也有一个，
 *     不圈定作用域就会改错地方）。
 *   · `replaceFunction` —— 整段换掉。
 * 一处都对不上 ⇒ `error:'ATM-KNIFE-ANCHOR'`（**不许静默**）。
 */
function buildImplCopy(tag, { source, mutations = [], fileMutations = [], replaceFunction = null, append = null } = {}) {
  const root = fixtureRoot(tag)
  const srcLib = path.join(LIVE, ...LIB_REL.split('/'))
  const destLib = path.join(root, 'lib')
  mkdirSync(destLib, { recursive: true })
  for (const name of readdirSync(srcLib)) {
    if (!name.endsWith('.mjs') || name === 'atomic.mjs') continue
    writeFileSync(path.join(destLib, name), readFileSync(path.join(srcLib, name)))
  }
  const applied = []
  let text = source
  if (fileMutations.length > 0) {
    const res = applyMutations(text, fileMutations)
    text = res.text
    applied.push(...res.applied.map((a) => ({ ...a, scope: 'file' })))
  }
  const fn = extractFunctionText(text, ATOMIC_FN)
  if (fn === null) {
    applied.push({ id: 'find-function', ok: false, reason: 'anchor-missing', scope: 'function' })
  } else if (replaceFunction !== null) {
    text = `${text.slice(0, fn.start)}${replaceFunction}${text.slice(fn.end)}`
    applied.push({ id: 'replace-function', ok: true, count: 1, scope: 'function' })
  } else if (mutations.length > 0) {
    const res = applyMutations(fn.text, mutations)
    text = `${text.slice(0, fn.start)}${res.text}${text.slice(fn.end)}`
    applied.push(...res.applied.map((a) => ({ ...a, scope: 'function' })))
  }
  if (append !== null) text += append
  writeFileSync(path.join(destLib, 'atomic.mjs'), text)
  writeFileSync(path.join(destLib, SPY_FILE), SPY_SOURCE)
  for (const name of readdirSync(destLib)) {
    if (!name.endsWith('.mjs') || name === SPY_FILE) continue
    const file = path.join(destLib, name)
    const body = readFileSync(file, 'utf8')
    const next = body.replace(/(\bfrom\s*)['"]node:fs['"]/g, "$1'./spy-fs.mjs'")
    if (next !== body) writeFileSync(file, next)
  }
  return { root, applied, error: applied.some((a) => a.ok === false) ? 'ATM-KNIFE-ANCHOR' : null }
}

/** 载入一份 scratch 副本（桩 + 被改过的那份实现）。同一个 root 只会有一份模块实例。 */
async function loadImpl(root, tag) {
  const spy = await import(pathToFileURL(path.join(root, 'lib', SPY_FILE)).href)
  const mod = await import(`${pathToFileURL(path.join(root, 'lib', 'atomic.mjs')).href}?v=${encodeURIComponent(tag)}`)
  return { spy, mod }
}

/** 抓一次调用的 stderr（同步实现 ⇒ 同步抓；抓完立刻还原）。 */
function captureStderr(fn) {
  const writes = []
  const original = process.stderr.write
  process.stderr.write = (chunk) => {
    writes.push(String(chunk))
    return true
  }
  try {
    return { value: fn(), writes }
  } finally {
    process.stderr.write = original
  }
}

/** 桩记下来的临时件路径：第一个"不是目标"的 open / writeFileSync 落点。 */
function tempPathOf(calls, target) {
  const wanted = path.resolve(target).toLowerCase()
  const hit = calls.find(
    (c) => (c.op === 'openSync' || c.op === 'writeFileSync') && path.resolve(c.path ?? '').toLowerCase() !== wanted,
  )
  return hit === undefined ? null : hit.path
}

/** 写一次（成功场景）。 */
async function runSuccess(root, tag) {
  const { spy, mod } = await loadImpl(root, tag)
  spy.__reset({})
  const target = path.join(root, 'scene', `${tag}-ok`, 'target.txt')
  const result = mod.writeFileAtomic(target, PAYLOAD)
  const calls = spy.__calls.map((c) => ({ ...c }))
  let onDisk = null
  try {
    onDisk = readFileSync(target, 'utf8')
  } catch {
    onDisk = null
  }
  return { tag, root, target, result, calls, tmp: tempPathOf(calls, target), onDisk }
}

/** 写一次（失败场景）：`plan.rename_codes` 决定第几次 rename 抛什么码。 */
async function runFailure(root, tag, { plan = {}, allowedRoot = null, name = 'fail', targetDir = null } = {}) {
  const { spy, mod } = await loadImpl(root, tag)
  spy.__reset(plan)
  const target = targetDir === null
    // ⚠️ 目标**只隔一层**（`<root>/<name>/target.txt`）：`markerOf` 只往上找 5 层 ——
    //    埋太深会让"身份闸"先拒（`E_ROOT_NO_MARKER`），量到的就不是"落点不在 allowedRoot 之下"那一条了。
    ? path.join(root, name, 'target.txt')
    : path.join(targetDir, 'target.txt')
  const options = allowedRoot === null ? {} : { allowedRoot }
  const cap = captureStderr(() => mod.writeFileAtomic(target, PAYLOAD, options))
  const calls = spy.__calls.map((c) => ({ ...c }))
  const tmp = tempPathOf(calls, target)
  return {
    tag,
    root,
    target,
    result: cap.value,
    stderr: cap.writes,
    calls,
    tmp,
    tmp_exists: tmp === null ? null : existsSync(tmp),
    target_exists: existsSync(target),
  }
}

/** 腿 1 / 腿 2 / 信封成功面 —— 一次成功写。 */
function checkSuccess(read) {
  const problems = []
  const push = (code, message, detail) => problems.push(problem(code, message, detail))
  const r = read.result ?? {}
  for (const key of ['ok', 'code', 'message', 'path', 'bytes', 'attempts']) {
    if (!(key in r)) push('ATM01-ENVELOPE-SUCCESS', `成功信封缺 \`${key}\`（决定 §新增什么：\`{ok, code, message, path, bytes, attempts}\`）：${JSON.stringify(r)}`)
  }
  if (r.ok !== true) push('ATM01-ENVELOPE-SUCCESS', `一次成功的写必须 ok:true，实得 ${JSON.stringify(r.ok)}`)
  if (r.code !== null) push('ATM01-ENVELOPE-SUCCESS', `成功信封的 code 必须是 null，实得 ${JSON.stringify(r.code)}`)
  if (typeof r.path !== 'string' || path.resolve(r.path).toLowerCase() !== path.resolve(read.target).toLowerCase()) {
    push('ATM01-ENVELOPE-SUCCESS', `成功信封的 path 必须是被写的那个文件：${JSON.stringify(r.path)}（要 ${read.target}）`)
  }
  if (r.bytes !== Buffer.byteLength(PAYLOAD)) push('ATM01-ENVELOPE-SUCCESS', `成功信封的 bytes 必须是 ${Buffer.byteLength(PAYLOAD)}，实得 ${JSON.stringify(r.bytes)}`)
  if (r.attempts !== 1) push('ATM01-ENVELOPE-SUCCESS', `一次就成的写，attempts 必须是 1，实得 ${JSON.stringify(r.attempts)}`)
  if (read.onDisk !== PAYLOAD) push('ATM01-WROTE', `盘上内容不是写进去的那份：${JSON.stringify(read.onDisk)}`)
  // 腿 1 · fsync
  const idx = (op) => read.calls.findIndex((c) => c.op === op)
  const opens = read.calls.filter((c) => c.op === 'openSync')
  const fsyncs = read.calls.filter((c) => c.op === 'fsyncSync')
  if (fsyncs.length === 0) {
    push('ATM01-NO-FSYNC', '成功写里**一次 fsyncSync 都没有**（临时件写完没落盘就 rename）—— 旧 CLI 体缺的就是这一样')
  } else {
    if (!Number.isInteger(fsyncs[0].fd)) push('ATM01-FSYNC-ORDER', `fsyncSync 拿到的不是句柄：${JSON.stringify(fsyncs[0])}`)
    if (idx('writeSync') >= 0 && idx('fsyncSync') < idx('writeSync')) push('ATM01-FSYNC-ORDER', '`fsyncSync` 在 `writeSync` 之前 —— 先落盘后写字的顺序反了')
    if (idx('renameSync') >= 0 && idx('fsyncSync') > idx('renameSync')) push('ATM01-FSYNC-ORDER', '`fsyncSync` 在 `renameSync` 之后 —— 落盘没有挡在改名前面')
    if (opens.length > 0 && fsyncs[0].fd !== opens[0].fd) {
      push('ATM01-FSYNC-ORDER', `fsyncSync 的句柄 ${JSON.stringify(fsyncs[0].fd)} 不是打开临时件的那个句柄 ${JSON.stringify(opens[0].fd)}`)
    }
  }
  // 腿 2 · wx
  if (read.tmp === null) {
    push('ATM01-NO-WX', '读不到临时件的建法（没有 openSync / writeFileSync 落点）—— 这一条判不了，不许当绿')
  } else {
    const tmpOpen = opens.find((c) => path.resolve(c.path).toLowerCase() === path.resolve(read.tmp).toLowerCase()) ?? null
    if (tmpOpen === null || typeof tmpOpen.flags !== 'string' || !tmpOpen.flags.includes('wx')) {
      push('ATM01-NO-WX', `临时件不是独占建的：flags=${JSON.stringify(tmpOpen?.flags ?? null)}（要含 \`wx\`）—— 旧残留 / 符号链接会被覆盖`)
    }
    const writeFileTmp = read.calls.filter(
      (c) => c.op === 'writeFileSync' && path.resolve(c.path).toLowerCase() === path.resolve(read.tmp).toLowerCase(),
    )
    if (writeFileTmp.length > 0) {
      push('ATM01-TMP-VIA-WRITEFILESYNC', `临时件是用 \`writeFileSync\` 建的（${writeFileTmp.length} 次）—— 旧 CLI 的写法，不是 \`openSync(…,'wx')\` + \`writeSync\``)
    }
    if (path.dirname(read.tmp).toLowerCase() !== path.dirname(read.target).toLowerCase()) {
      push('ATM01-TMP-DIR', `临时件不在目标同目录：${read.tmp} vs ${read.target}（同卷 rename 才原子）`)
    }
  }
  return problems
}

/** 腿 3 的拒绝面。 */
function checkGateRefused(read) {
  const problems = []
  const push = (code, message, detail) => problems.push(problem(code, message, detail))
  const r = read.result ?? {}
  if (r.ok !== false) push('ATM01-GATE-CODE', `写失败必须 ok:false，实得 ${JSON.stringify(r.ok)}`)
  if (typeof r.code !== 'string' || r.code === '') push('ATM01-GATE-CODE', `写失败必须给一个具名码，实得 ${JSON.stringify(r.code)}`)
  if (typeof r.message !== 'string' || r.message === '') push('ATM01-GATE-CODE', `写失败必须有一句能读的 message，实得 ${JSON.stringify(r.message)}`)
  if (read.tmp === null) {
    push('ATM01-GATE-NO-TMP', '读不到临时件落点 —— 这一条判不了，不许当绿')
  } else if (read.tmp_exists !== true) {
    push('ATM01-GATE-DELETED', `闸**拒绝**清临时件时，那个临时件必须还在（不删 = 不静默），实得它已经不在：${read.tmp}`)
  }
  if (read.target_exists) push('ATM01-GATE-WROTE', `写失败的那一次把目标写出来了：${read.target} —— 半截写不许落盘`)
  const refused = r.cleanup_refused ?? null
  const namedCode = typeof refused?.code === 'string' && refused.code !== ''
  const spoke = Array.isArray(read.stderr) && read.stderr.join('').trim() !== ''
  if (!spoke && !namedCode) {
    push('ATM01-GATE-SILENT', '闸拒绝清临时件，却**既没出声（stderr）也没回一个具名码** —— 静默的"没清掉"和"清干净了"长得一模一样')
  }
  if (refused !== null && refused.delete_gate === undefined) {
    push('ATM01-GATE-NO-DELETE-GATE', '`cleanup_refused` 少了 `delete_gate`（裁定 v1.20 ②：拒删不许只有一行；install/rollback 的调用点读的就是它）')
  }
  return problems
}

/** 腿 3 的放行面（反面控制：闸放行时必须真删）。 */
function checkGateAllowed(read) {
  const problems = []
  const push = (code, message, detail) => problems.push(problem(code, message, detail))
  if (read.tmp === null) {
    push('ATM01-GATE-NO-TMP', '读不到临时件落点 —— 这一条判不了，不许当绿')
    return problems
  }
  if (read.tmp_exists === true) push('ATM01-GATE-NOT-DELETED', `闸放行时临时件必须被清掉（否则"拒绝时不删"是空话），实得它还在：${read.tmp}`)
  if (Array.isArray(read.stderr) && read.stderr.join('').trim() !== '') {
    push('ATM01-GATE-NOISE', `闸放行时不该往 stderr 说话，实得：${read.stderr.join('').slice(0, 200)}`)
  }
  return problems
}

/** 腿 4 · 一次"先抛一次再成"的写。 */
async function runRetry(root, tag, code) {
  const { spy, mod } = await loadImpl(root, tag)
  spy.__reset({ rename_codes: [code] })
  const target = path.join(root, 'scene', `${tag}-retry-${code}`, 'target.txt')
  const result = mod.writeFileAtomic(target, PAYLOAD)
  const calls = spy.__calls.map((c) => ({ ...c }))
  return {
    code,
    result,
    renames: calls.filter((c) => c.op === 'renameSync').length,
    attempts: result?.attempts ?? null,
    onDisk: existsSync(target) ? readFileSync(target, 'utf8') : null,
  }
}

function checkRetry(read) {
  const problems = []
  const push = (code, message, detail) => problems.push(problem(code, message, detail))
  if (read.result?.ok !== true) {
    push('ATM01-RETRY-CODE', `${read.code} 是可重试码（Windows 上被占用的句柄），第一次 rename 抛它之后必须重试成功，实得 ${JSON.stringify(read.result)}`)
    return problems
  }
  if (read.renames !== 2) push('ATM01-RETRY-CODE', `${read.code} 之后应当恰好 rename 2 次（1 失败 + 1 成功），实得 ${read.renames}`)
  if (read.attempts !== 2) push('ATM01-RETRY-CODE', `${read.code} 之后 attempts 应当是 2，实得 ${JSON.stringify(read.attempts)}`)
  if (read.onDisk !== PAYLOAD) push('ATM01-RETRY-CODE', `${read.code} 重试之后盘上内容不对：${JSON.stringify(read.onDisk)}`)
  return problems
}

function checkNoRetry(read) {
  const problems = []
  const push = (code, message, detail) => problems.push(problem(code, message, detail))
  if (read.result?.ok !== false) push('ATM01-RETRY-ALL', `\`${read.code}\` 不是重试码 —— 不许重试，必须当场失败，实得 ${JSON.stringify(read.result)}`)
  if (read.renames !== 1) push('ATM01-RETRY-ALL', `\`${read.code}\` 只能 rename 1 次，实得 ${read.renames} 次（不分码地重试 = 把闸拆了）`)
  return problems
}

const codesOf = (problems) => problems.map((p) => p.code)

test('ATM-01 原子写归一：presets/** 只剩一份定义（fsync · wx · allowedRoot 删除闸 · 两套重试码）· 统一信封 · 既有装/回滚行为不破', async () => {
  await runCase('ATM-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const forward = (list, leg) => {
      for (const p of list) push(p.code, `[${leg}] ${p.message}`, p.detail)
    }
    const legs = []
    /** 记一条腿：`{id, label, want, problems}` —— `id` 是刀找"基线绿不绿"的键（不许靠 label 前缀）。 */
    const recordLeg = ({ id, label, want, list }) => {
      const entry = {
        id,
        label,
        want,
        verdict: list.length === 0 ? 'GREEN' : 'RED',
        problem_codes: codesOf(list),
        problems: list.map((p) => `${p.code}: ${p.message}`),
      }
      legs.push(entry)
      return entry
    }
    const baselineOf = (id) => legs.find((l) => l.id === id)?.verdict ?? 'UNKNOWN'

    // ══ 腿 0 · 定义：presets/** 恰好一份 ═══════════════════════════════════════════════════
    const defs = scanWriteFileAtomicDefinitions({ root: LIVE })
    const defVerdict = definitionVerdict(defs)
    rec.readings.definitions = {
      scan_root: defs.scan_root,
      scanned_files: defs.scanned_files,
      count: defs.count,
      hits: defs.hits.map((h) => ({ file: h.file, line: h.line, kind: h.kind, exported: h.exported })),
      line: defs.line,
      verdict: defVerdict.verdict,
      problem_codes: codesOf(defVerdict.problems),
    }
    recordLeg({ id: 'def', label: '腿0 定义（presets/** 恰好 1 处 · 落在共享件 · CLI 副本 0）', want: 'GREEN', list: defVerdict.problems })
    forward(defVerdict.problems, '腿0 定义')
    const unique = defs.count === 1 ? defs.hits[0] : null
    const subjectRel = unique === null ? CANONICAL_ATOMIC : unique.file
    rec.readings.subject = {
      rel: subjectRel,
      unique: unique !== null,
      note: unique === null
        ? `定义 ${defs.count} 处 ⇒ 并集腿在共享件（${CANONICAL_ATOMIC}）上量 —— 那是合并的候选；定义腿自己带红`
        : '唯一那份定义就是并集腿的被测面',
    }

    // 腿 0 的刀：scratch 树里只有共享件 ⇒ 绿；把共享件那一段逐字复制进 CLI ⇒ 红（点名两边）
    const defScene = fixtureRoot('def-knife')
    const canonicalSource = readFileSync(path.join(LIVE, ...CANONICAL_ATOMIC.split('/')), 'utf8')
    put(defScene, CANONICAL_ATOMIC, canonicalSource)
    const cleanRead = scanWriteFileAtomicDefinitions({ root: defScene })
    const cleanVerdict = definitionVerdict(cleanRead)
    rec.readings.definitions_control = { count: cleanRead.count, verdict: cleanVerdict.verdict, line: cleanRead.line }
    if (cleanRead.count !== 1 || cleanVerdict.verdict !== 'GREEN') {
      push('ATM-DEF-KNIFE-CONTROL', `刀的控制面不成立：scratch 树里只放共享件时应当恰好 1 处定义且绿，实得 ${cleanRead.count} 处 / ${cleanVerdict.verdict}：${cleanRead.line}`)
    }
    const fnText = extractFunctionText(canonicalSource, ATOMIC_FN)
    if (fnText === null) {
      push('ATM-DEF-KNIFE-ANCHOR', `在共享件里抠不出 \`${ATOMIC_FN}\` 那一整段（刀的锚点不在）—— 刀不咬`)
    } else {
      put(defScene, 'presets/agenia/bin/install.mjs',
        `#!/usr/bin/env node\n// ATM-01 刀：把共享件那一段逐字复制进 CLI（第二份实现）\n${fnText.text}\n`)
      const knifeRead = scanWriteFileAtomicDefinitions({ root: defScene })
      const knifeVerdict = definitionVerdict(knifeRead)
      const named = knifeVerdict.problems.map((p) => p.message).join('\n')
      const namesBoth = named.includes(CANONICAL_ATOMIC) && named.includes('presets/agenia/bin/install.mjs')
      const knifeOk = knifeVerdict.verdict === 'RED' && namesBoth
      rec.readings.definitions_knife = {
        count: knifeRead.count,
        line: knifeRead.line,
        verdict: knifeVerdict.verdict,
        problem_codes: codesOf(knifeVerdict.problems),
        names_both_files: namesBoth,
      }
      recordLeg({
        id: 'def-knife',
        label: '腿0 刀（把共享件那一段复制成 CLI 的第二份）',
        want: 'RED · 点名两边',
        list: knifeOk ? [] : [problem('ATM-DEF-KNIFE-DEAD', '刀不咬')],
      })
      if (knifeVerdict.verdict !== 'RED') {
        push('ATM-DEF-KNIFE-DEAD', `[腿0 刀] 把共享件那一段复制进 \`presets/agenia/bin/install.mjs\` 之后必须红，实得 ${knifeVerdict.verdict} —— 刀不咬，这一格守不住"副本再长出来"`)
      } else if (!namesBoth) {
        push('ATM-DEF-KNIFE-NAMES', `[腿0 刀] 红报文没点名两边路径（要同时出现 ${CANONICAL_ATOMIC} 与 presets/agenia/bin/install.mjs）：${named.slice(0, 400)}`)
      }
    }

    // ══ 被测面 ═════════════════════════════════════════════════════════════════════════════
    const subjectAbs = path.join(LIVE, ...subjectRel.split('/'))
    if (!existsSync(subjectAbs)) {
      push('ATM-SUBJECT-MISSING', `被测面不在盘上：${subjectAbs} —— 后面的并集腿拿不到读数（预期红）`)
      caseFail(problems)
    }
    const subjectSource = readFileSync(subjectAbs, 'utf8')
    const base = buildImplCopy('impl-base', { source: subjectSource })
    rec.readings.impl_copy = {
      root: base.root,
      entry: 'lib/atomic.mjs',
      source: subjectRel,
      mutations: base.applied.map((a) => `${a.id}:${a.ok ? 'ok' : a.reason}`),
      error: base.error,
      note: 'scratch 副本：lib/*.mjs 全量复制 + node:fs 换成桩；真树一个字节都不碰',
    }
    if (base.error !== null) push('ATM01-IMPL-COPY', `基线副本没造出来：${JSON.stringify(base.applied)}`)

    // 腿 1 + 腿 2 + 信封成功面（基线）
    const okRead = await runSuccess(base.root, 'base')
    const okProblems = checkSuccess(okRead)
    const fsyncProblems = okProblems.filter((p) => p.code === 'ATM01-NO-FSYNC' || p.code === 'ATM01-FSYNC-ORDER')
    const wxProblems = okProblems.filter((p) => ['ATM01-NO-WX', 'ATM01-TMP-VIA-WRITEFILESYNC', 'ATM01-TMP-DIR'].includes(p.code))
    const envelopeProblems = okProblems.filter((p) => ['ATM01-ENVELOPE-SUCCESS', 'ATM01-WROTE'].includes(p.code))
    recordLeg({ id: 'fsync', label: '腿1 fsync（writeSync → fsyncSync → renameSync，fd 同一个）', want: 'GREEN', list: fsyncProblems })
    recordLeg({ id: 'wx', label: '腿2 wx（临时件独占建 · 不用 writeFileSync · 同目录）', want: 'GREEN', list: wxProblems })
    recordLeg({ id: 'envelope', label: '腿5 信封成功面（ok/code/message/path/bytes/attempts）', want: 'GREEN', list: envelopeProblems })
    rec.readings.success_baseline = {
      result: okRead.result,
      tmp: okRead.tmp,
      calls: okRead.calls.map((c) => (c.op === 'openSync' ? `${c.op}(${JSON.stringify(c.flags)})` : c.op)),
      on_disk: okRead.onDisk,
      problem_codes: codesOf(okProblems),
      problems: okProblems.map((p) => `${p.code}: ${p.message}`),
    }
    forward(fsyncProblems, '腿1 fsync')
    forward(wxProblems, '腿2 wx')
    forward(envelopeProblems, '腿5 信封')

    // 腿 3 · 默认（不给 allowedRoot）：失败之后临时件必须被清（旧行为不变）
    const defaultFail = await runFailure(base.root, 'base', { plan: { rename_codes: ['ENOENT'] }, name: 'default-fail' })
    const defaultProblems = []
    if (defaultFail.result?.ok !== false) defaultProblems.push(problem('ATM01-DEFAULT-FAIL', `rename 抛非重试码 ⇒ 必须 ok:false，实得 ${JSON.stringify(defaultFail.result)}`))
    if (defaultFail.tmp === null) defaultProblems.push(problem('ATM01-GATE-NO-TMP', '读不到临时件落点'))
    else if (defaultFail.tmp_exists !== false) defaultProblems.push(problem('ATM01-DEFAULT-CLEANUP', `不给 allowedRoot 时失败清残渣是旧行为（默认不变），实得临时件还在：${defaultFail.tmp}`))
    if (defaultFail.target_exists) defaultProblems.push(problem('ATM01-GATE-WROTE', `失败的那一次把目标写出来了：${defaultFail.target}`))
    recordLeg({ id: 'default', label: '腿3 反面控制（默认没给 allowedRoot ⇒ 失败清残渣，旧行为不变）', want: 'GREEN', list: defaultProblems })
    rec.readings.default_failure = {
      tmp: defaultFail.tmp,
      tmp_exists: defaultFail.tmp_exists,
      target_exists: defaultFail.target_exists,
      result: defaultFail.result,
      problem_codes: codesOf(defaultProblems),
    }
    forward(defaultProblems, '腿3 默认')

    // 腿 3 · 闸拒绝：allowedRoot 是**兄弟目录**（临时件不在它之下）⇒ 拒删 + 出声 / 具名码
    const gateSceneRoot = fixtureRoot('impl-gate')
    const gateAllowed = ensureMarkedDir(path.join(gateSceneRoot, 'allowed'), { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
    mkdirSync(path.join(gateSceneRoot, 'elsewhere'), { recursive: true })
    const refused = await runFailure(base.root, 'base', { plan: { rename_codes: ['ENOENT'] }, allowedRoot: gateAllowed, name: 'gate-refused' })
    const refusedProblems = checkGateRefused(refused)
    recordLeg({ id: 'gate_refused', label: '腿3 闸拒绝（临时件不在 allowedRoot 之下 ⇒ 不删 · 不出事 · 出声或具名码）', want: 'GREEN', list: refusedProblems })
    rec.readings.gate_refused = {
      allowed_root: gateAllowed,
      tmp: refused.tmp,
      tmp_exists: refused.tmp_exists,
      target_exists: refused.target_exists,
      stderr: refused.stderr,
      cleanup_refused: refused.result?.cleanup_refused ?? null,
      result_code: refused.result?.code ?? null,
      problem_codes: codesOf(refusedProblems),
      problems: refusedProblems.map((p) => `${p.code}: ${p.message}`),
    }
    forward(refusedProblems, '腿3 闸拒绝')

    // 腿 3 · 闸放行（反面控制）：allowedRoot 罩住临时件 ⇒ 必须真删（否则"拒绝时不删"是空话）
    const allowedSceneRoot = fixtureRoot('impl-gate-allowed')
    const allowedRoot = ensureMarkedDir(path.join(allowedSceneRoot, 'root'), { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
    const allowed = await runFailure(base.root, 'base', {
      plan: { rename_codes: ['ENOENT'] },
      allowedRoot,
      name: 'gate-allowed',
      targetDir: allowedRoot,
    })
    const allowedProblems = checkGateAllowed(allowed)
    recordLeg({ id: 'gate_allowed', label: '腿3 闸放行（反面控制：allowedRoot 罩住临时件 ⇒ 必须真删）', want: 'GREEN', list: allowedProblems })
    rec.readings.gate_allowed = {
      allowed_root: allowedRoot,
      tmp: allowed.tmp,
      tmp_exists: allowed.tmp_exists,
      stderr: allowed.stderr,
      problem_codes: codesOf(allowedProblems),
    }
    forward(allowedProblems, '腿3 闸放行')

    // 腿 4 · 三条重试码各一次 + 非重试码一次就放弃
    const retryReads = []
    for (const code of RETRY_CODES) retryReads.push(await runRetry(base.root, 'base', code))
    const noRetry = await runRetry(base.root, 'base', 'ENOENT')
    const retryProblems = [...retryReads.flatMap(checkRetry), ...checkNoRetry(noRetry)]
    recordLeg({ id: 'retry', label: '腿4 重试码（EPERM / EBUSY / EACCES 各重试一次；ENOENT 不重试）', want: 'GREEN', list: retryProblems })
    rec.readings.retry = {
      per_code: retryReads.map((r) => ({ code: r.code, ok: r.result?.ok ?? null, attempts: r.attempts, renames: r.renames })),
      non_retryable: { code: noRetry.code, ok: noRetry.result?.ok ?? null, renames: noRetry.renames },
      problem_codes: codesOf(retryProblems),
      problems: retryProblems.map((p) => `${p.code}: ${p.message}`),
    }
    forward(retryProblems, '腿4 重试码')

    // 腿 4 · 结构面：重试码只许有一份
    const retryStruct = retryReading({ file: subjectAbs })
    const retryStructVerdict = retryVerdict(retryStruct)
    recordLeg({ id: 'retry_structure', label: '腿4 结构（重试码只剩一份：RETRYABLE_RENAME 在 · 三码齐 · 无内联第二份）', want: 'GREEN', list: retryStructVerdict.problems })
    rec.readings.retry_structure = {
      line: retryStruct.line,
      set_declared: retryStruct.set_declared,
      set_members: retryStruct.set_members,
      inline_literals: retryStruct.inline_literals,
      predicate_lines: retryStruct.predicate_lines,
      verdict: retryStructVerdict.verdict,
      problem_codes: codesOf(retryStructVerdict.problems),
    }
    forward(retryStructVerdict.problems, '腿4 结构')

    // 腿 5 · 调用点
    const canonicalAbs = path.join(LIVE, ...CANONICAL_ATOMIC.split('/'))
    const callReads = CLI_COPY_FILES.map((rel) => callSiteReading({ file: path.join(LIVE, ...rel.split('/')) }))
    const callProblems = callReads.flatMap((r) => callSiteVerdict(r, { canonicalAbs }).problems)
    recordLeg({ id: 'callsite', label: '腿5 调用点（install / rollback：import 共享件 + 真调 + 不读 .tmp）', want: 'GREEN', list: callProblems })
    rec.readings.call_sites = callReads.map((r) => ({
      file: r.rel,
      defines: r.defines,
      calls: r.calls,
      import_specifier: r.import_specifier,
      import_kind: r.import_kind,
      import_resolves_to: r.import_resolves_to,
      tmp_reads: r.tmp_reads,
      line: r.line,
    }))
    forward(callProblems, '腿5 调用点')

    // ══ 判词自控：每一份"红"都要有一个"它认得出绿"的对照（判据自己不许是永红的）══════════════
    // 这一节测的是**判词**，不是被测对象：喂一份形状合法、物理上也说得通的读数，判词必须**一条都不报**。
    // 它红的含义是"判据写成了永远不成立"，不是"产品坏了"。
    const checkerControls = []
    const control = (id, label, list) => {
      checkerControls.push({ id, label, verdict: list.length === 0 ? 'GREEN' : 'RED', problem_codes: codesOf(list) })
      if (list.length > 0) {
        push('ATM01-CHECKER-UNSATISFIABLE', `判词自控失败：${id} 对一份合法读数据报了 ${list.length} 条（${codesOf(list).join(' / ')}）—— 这一格会永远红，红就不再是证据`)
      }
    }
    const okTmp = path.join(base.root, 'scene', 'control', 'target.txt.tmp-1')
    control('success', '成功读数（六键齐 · writeSync→fsyncSync→renameSync · wx · 同目录）', checkSuccess({
      target: path.join(base.root, 'scene', 'control', 'target.txt'),
      tmp: okTmp,
      calls: [
        { op: 'openSync', path: okTmp, flags: 'wx', fd: 7 },
        { op: 'writeSync', fd: 7 },
        { op: 'fsyncSync', fd: 7 },
        { op: 'closeSync', fd: 7 },
        { op: 'renameSync', from: okTmp, to: path.join(base.root, 'scene', 'control', 'target.txt') },
      ],
      onDisk: PAYLOAD,
      result: { ok: true, code: null, message: '', path: path.join(base.root, 'scene', 'control', 'target.txt'), bytes: Buffer.byteLength(PAYLOAD), attempts: 1 },
    }))
    control('gate_refused', '闸拒绝读数（临时件还在 · 目标没写 · 出声 + 具名码 + delete_gate）', checkGateRefused({
      target: path.join(base.root, 'scene', 'control', 'target.txt'),
      tmp: okTmp,
      tmp_exists: true,
      target_exists: false,
      stderr: ['[install.mjs] E_ROOT_OUTSIDE 拒绝删除：临时件不在任何允许删的根之下 —— 临时件留着，不静默\n'],
      result: {
        ok: false,
        code: 'E_TXN_IO',
        message: '原子替换失败（ENOENT）：…',
        path: path.join(base.root, 'scene', 'control', 'target.txt'),
        cleanup_refused: { code: 'E_ROOT_OUTSIDE', message: '拒绝删除：…', delete_gate: { verdict: 'deny', code: 'E_ROOT_OUTSIDE' } },
      },
    }))
    control('gate_allowed', '闸放行读数（临时件被清 · 不出声）', checkGateAllowed({ tmp: okTmp, tmp_exists: false, stderr: [] }))
    rec.readings.checker_control = {
      cells: checkerControls,
      note: '这一节测判词自己（喂合法读数必须不报红）；它红了 = 判据写成永红，不是产品坏了',
    }

    // ══ 刀（每条腿各一把；基线不绿 ⇒ pending-baseline，不重复记红）══════════════════════════
    const knives = []
    /** 记一把"锚点没命中的刀"：**它咬不咬**要看基线那一腿在不在 —— 守卫还没写的时候，锚点当然不在。 */
    const anchorMissingKnife = (id, want, anchors) => {
      const entry = {
        id,
        want,
        anchors,
        status: 'anchor-missing',
        applied: [],
        problem_codes: [],
        problems: [],
        hit: false,
        anchor_missing: true,
      }
      knives.push(entry)
      return entry
    }
    const judgeKnife = (entry, baselineId) => {
      if (entry === null) return
      if (entry.hit) return
      const baseline = baselineOf(baselineId)
      if (entry.anchor_missing === true) {
        if (baseline === 'GREEN') {
          push('ATM01-KNIFE-ANCHOR', `[刀 ${entry.id}] 基线是绿的（守卫在），但这一刀的锚点一个都没命中（试过：${(entry.anchors ?? []).join(' / ')}）—— 刀过期了，这一腿的绿不算数`)
          entry.status = 'dead'
        } else {
          entry.status = 'pending-baseline'
        }
        return
      }
      if (baseline === 'GREEN') {
        push('ATM01-KNIFE-DEAD', `[刀 ${entry.id}] 基线是绿的，这一刀却没有咬到 \`${entry.want}\`（实得 ${entry.problem_codes.join(' / ') || '（一条都没有）'}）—— 刀不咬，这一腿的绿就不算数`)
        entry.status = 'dead'
      } else {
        entry.status = 'pending-baseline'
      }
    }
    const runKnife = async ({ id, want, build, run, check }) => {
      const made = await build()
      if (made.error !== null) {
        knives.push({ id, want, status: 'anchor-missing', applied: made.applied, problem_codes: [], problems: [], hit: false, anchor_missing: true })
        return knives[knives.length - 1]
      }
      const read = await run(made)
      const found = check(read)
      const entry = {
        id,
        want,
        root: made.root,
        applied: made.applied.map((a) => `${a.id}:${a.ok ? 'ok' : a.reason}`),
        problem_codes: codesOf(found),
        problems: found.map((p) => `${p.code}: ${p.message}`).slice(0, 6),
        status: codesOf(found).includes(want) ? 'bit' : 'dead',
        hit: codesOf(found).includes(want),
      }
      knives.push(entry)
      return entry
    }

    // 刀 a · 删掉函数体里的 fsyncSync(handle)
    judgeKnife(await runKnife({
      id: 'no-fsync',
      want: 'ATM01-NO-FSYNC',
      build: async () => buildImplCopy('knife-no-fsync', { source: subjectSource, mutations: [{ id: 'drop-fsync', find: 'fsyncSync(handle)', replace: '', expect: 1 }] }),
      run: async (made) => runSuccess(made.root, 'knife-no-fsync'),
      check: checkSuccess,
    }), 'fsync')

    // 刀 b · openSync(tmp,'wx') → openSync(tmp,'w')
    judgeKnife(await runKnife({
      id: 'w-flag',
      want: 'ATM01-NO-WX',
      build: async () => buildImplCopy('knife-w-flag', { source: subjectSource, mutations: [{ id: 'wx-to-w', find: "openSync(tmp, 'wx')", replace: "openSync(tmp, 'w')", expect: 1 }] }),
      run: async (made) => runSuccess(made.root, 'knife-w-flag'),
      check: checkSuccess,
    }), 'wx')

    // 刀 a+b · 旧 CLI 的临时件机制（非 wx + writeFileSync + 无 fsync）
    const oldCliKnife = await runKnife({
      id: 'old-cli-temp-write',
      want: 'ATM01-NO-FSYNC',
      build: async () => buildImplCopy('knife-old-cli', {
        source: subjectSource,
        mutations: [
          { id: 'old-cli-open', find: "openSync(tmp, 'wx')", replace: "openSync(tmp, 'w')", expect: 1 },
          { id: 'old-cli-write', find: 'writeSync(handle, buf)', replace: '__knifeWriteFileSync(tmp, buf)', expect: 1 },
          { id: 'old-cli-fsync', find: 'fsyncSync(handle)', replace: '', expect: 1 },
        ],
        // 旧 CLI 的建法要 `writeFileSync`；共享件没 import 它 ⇒ 这一行是**刀的一部分**（不是基线的一部分）
        append: "\nimport { writeFileSync as __knifeWriteFileSync } from 'node:fs'\n",
      }),
      run: async (made) => runSuccess(made.root, 'knife-old-cli'),
      check: checkSuccess,
    })
    judgeKnife(oldCliKnife, 'fsync')
    if (oldCliKnife !== null && oldCliKnife.status === 'bit' && !oldCliKnife.problem_codes.includes('ATM01-NO-WX')) {
      push('ATM01-KNIFE-OLD-CLI', `[刀 old-cli-temp-write] 旧 CLI 的建法（writeFileSync + 非 wx + 无 fsync）必须同时红 ATM01-NO-FSYNC 与 ATM01-NO-WX，实得 ${oldCliKnife.problem_codes.join(' / ')}`)
    }

    // 刀 c1 · 把闸放宽成"临时件所在目录"
    const gateCandidates = [
      { id: 'blind-gate-1', find: 'root: allowedRoot ?? null', replace: 'root: path.dirname(tmp)', expect: 1 },
      { id: 'blind-gate-2', find: 'root: allowedRoot,', replace: 'root: path.dirname(tmp),', expect: 1 },
    ]
    const pickedGate = pickMutation(subjectSource, gateCandidates)
    const knifeGate = pickedGate === null
      ? anchorMissingKnife('blind-gate', 'ATM01-GATE-DELETED', gateCandidates.map((c) => c.id))
      : await runKnife({
          id: pickedGate.id,
          want: 'ATM01-GATE-DELETED',
          // 闸可能被搬进 `lib/` 的**一个辅助函数**里（决定 §复用什么：「把这块移进 lib」）⇒ 刀按**整个文件**改，
          // 不圈在 `writeFileAtomic` 体内（锚点 `root: allowedRoot ?? null` 在整份文件里也只该有一处）。
          build: async () => buildImplCopy('knife-gate-blind', { source: subjectSource, fileMutations: [{ id: pickedGate.id, find: pickedGate.find, replace: pickedGate.replace, expect: 1 }] }),
          run: async (made) => runFailure(made.root, 'knife-gate-blind', { plan: { rename_codes: ['ENOENT'] }, allowedRoot: gateAllowed, name: 'gate-refused' }),
          check: checkGateRefused,
        })
    judgeKnife(knifeGate, 'gate_refused')

    // 刀 c2 · 拒绝分支写成 if (false)
    const silentCandidates = [
      { id: 'silent-refuse-1', find: 'if (!cleanup.ok) {', replace: 'if (false) {', expect: 1 },
      { id: 'silent-refuse-2', find: 'if (cleanup.ok === false) {', replace: 'if (false) {', expect: 1 },
    ]
    const pickedSilent = pickMutation(subjectSource, silentCandidates)
    const knifeSilent = pickedSilent === null
      ? anchorMissingKnife('silent-refuse', 'ATM01-GATE-SILENT', silentCandidates.map((c) => c.id))
      : await runKnife({
        id: pickedSilent.id,
        want: 'ATM01-GATE-SILENT',
        // 同 c1：拒绝分支也可能被搬进辅助函数 ⇒ 按整个文件改
        build: async () => buildImplCopy('knife-gate-silent', { source: subjectSource, fileMutations: [{ id: pickedSilent.id, find: pickedSilent.find, replace: pickedSilent.replace, expect: 1 }] }),
        run: async (made) => runFailure(made.root, 'knife-gate-silent', { plan: { rename_codes: ['ENOENT'] }, allowedRoot: gateAllowed, name: 'gate-refused' }),
        check: checkGateRefused,
      })
    judgeKnife(knifeSilent, 'gate_refused')

    // 刀 d1 · 把 'EACCES' 改名（模块级码集）
    const dropCandidates = [
      { id: 'drop-eacces-sq', find: "'EACCES'", replace: "'EACCES_KNIFE'", expect: 1 },
      { id: 'drop-eacces-dq', find: '"EACCES"', replace: '"EACCES_KNIFE"', expect: 1 },
    ]
    const pickedDrop = pickMutation(subjectSource, dropCandidates)
    if (pickedDrop === null) {
      push('ATM01-KNIFE-ANCHOR', `[刀 drop-eacces] 找不到 \`'EACCES'\` 那一条（${dropCandidates.map((c) => c.id).join(' / ')}）`)
      knives.push({ id: 'drop-eacces', want: 'ATM01-RETRY-CODE', status: 'anchor-missing', applied: [] })
    } else {
      judgeKnife(await runKnife({
        id: pickedDrop.id,
        want: 'ATM01-RETRY-CODE',
        build: async () => buildImplCopy('knife-drop-eacces', { source: subjectSource, fileMutations: [{ id: pickedDrop.id, find: pickedDrop.find, replace: pickedDrop.replace, expect: 1 }] }),
        run: async (made) => runRetry(made.root, 'knife-drop-eacces', 'EACCES'),
        check: checkRetry,
      }), 'retry')
    }

    // 刀 d2 · 追加一份内联重试码数组 ⇒ 结构面红
    judgeKnife(await runKnife({
      id: 'inline-retry-dup',
      want: 'ATM-RETRY-DUP',
      build: async () => buildImplCopy('knife-inline-dup', { source: subjectSource, append: "\n// ATM-01 刀：第二份内联码集（合并之后不许再有）\nconst KNIFE_INLINE_RETRY = ['EPERM', 'EBUSY', 'EACCES']\n" }),
      run: async (made) => ({ file: path.join(made.root, 'lib', 'atomic.mjs') }),
      check: (read) => retryVerdict(retryReading({ file: read.file })).problems,
    }), 'retry_structure')

    // 刀 e · 信封：把共享件那个函数换成"旧 CLI 形状"（返回 {ok,tmp}）
    judgeKnife(await runKnife({
      id: 'old-cli-envelope',
      want: 'ATM01-ENVELOPE-SUCCESS',
      build: async () => buildImplCopy('knife-envelope', { source: subjectSource, replaceFunction: OLD_CLI_SHAPE_STUB }),
      run: async (made) => runSuccess(made.root, 'knife-envelope'),
      check: checkSuccess,
    }), 'envelope')

    rec.readings.knives = knives
    rec.readings.legs = legs

    // ══ 腿 6 · 既有行为不破：点名既有格，核对它们还在 ═════════════════════════════════════
    const preservationReads = PRESERVATION.map((p) => {
      const abs = path.join(LIVE, 'tests', 'agenia-upgrade', ...p.file.split('/'))
      let exists = false
      let mentionsId = false
      try {
        exists = statSync(abs).isFile()
        mentionsId = readFileSync(abs, 'utf8').includes(p.id)
      } catch {
        exists = false
      }
      return { ...p, exists, mentions_id: mentionsId }
    })
    rec.readings.preservation = {
      cells: preservationReads,
      proven_by: '这一跑的全量入口：`F57-SETTLE 分母 <n> … RED/GREEN/HOLD` + `_evidence/<RUN_ID>/<ID>/result.json`（逐格）',
      note: '本格不重跑它们的现场；它们绿不绿以入口的结算行为准（契约 §3.3）',
    }
    for (const p of preservationReads) {
      if (!p.exists) push('ATM01-PRESERVE-MISSING', `依赖的既有格文件不在：${p.file}（${p.id}）`)
      else if (!p.mentions_id) push('ATM01-PRESERVE-STALE', `${p.file} 里找不到 ${p.id} —— 这一格的"依赖"已经过期，读数作废`)
    }

    // ══ 读数：口径 / 分母 / 冲突（Q6 ⟂ 定义腿）══════════════════════════════════════════════
    rec.readings.expected = {
      denominator_today: TOTAL,
      denominator_after: 'TOTAL（盘上发现）—— 本票只 +1（217 → 218），腿不是格',
      gate2: 'RED：定义 3 处（ATM-DEF-COUNT）+ CLI 副本 ×2 + 调用点无 import ×2 + 闸缺失（ATM01-GATE-DELETED）+ 成功信封无 message',
      gate3: 'GREEN：定义 1 处 · 两个调用点读共享件 · 并集四条全绿（并集 c 的基线到那一刻才转绿，刀也随之必须咬）',
      caveat: '并集 d 的"两套码取并集"在成员上是恒等操作（两套都是 EPERM/EBUSY/EACCES）⇒ 判的是覆盖与"只剩一份"，判不了"两套都留"',
    }
    const rollbackAbs = path.join(LIVE, 'presets', 'agenia', 'bin', 'rollback.mjs')
    const rollbackLines = readFileSync(rollbackAbs, 'utf8').split(/\r?\n/)
    const staticImports = rollbackLines
      .map((l, i) => ({ line: i + 1, text: l.trim() }))
      .filter((x) => /^\s*import\s/.test(x.text) && !/^\s*(\/\/|\*)/.test(x.text))
    const lookup = (file, needle) => {
      try {
        const lines = readFileSync(path.join(LIVE, 'tests', 'agenia-upgrade', ...file.split('/')), 'utf8').split(/\r?\n/)
        const idx = lines.findIndex((l) => l.includes(needle))
        return idx < 0 ? null : { file, line: idx + 1, text: lines[idx].trim().slice(0, 140) }
      } catch {
        return null
      }
    }
    const stagedRollback = path.join(LIVE, '.tools', '_staging', 'agenia-upgrade', 'preset', 'bin', 'rollback.mjs')
    let stagedIdentical = null
    try {
      stagedIdentical = readFileSync(stagedRollback).equals(readFileSync(rollbackAbs))
    } catch {
      stagedIdentical = null
    }
    rec.readings.collision_q6 = {
      rollback_static_import_lines: staticImports,
      ins02_zero_import_rule: lookup('integration/install-rollback.test.mjs', 'INS02-ZERO-IMPORT'),
      env02_rollback_import_rule: lookup('static/env-scan.test.mjs', "'ROLLBACK-IMPORT'"),
      stat01_two_tree_rule: lookup('static/composition.test.mjs', 'STAGED-LIVE-DRIFT'),
      staged_rollback_identical_to_live: stagedIdentical,
      target_lag_declaration_present: existsSync(path.join(LIVE, '.tools', '_staging', 'agenia-upgrade', 'target-lag.json')),
      note: '定形让 rollback.mjs import 共享件；拍板 Q6（回滚单文件自足、零静态 import）与两条既有判据'
        + '（INS-02 ① / ENV-02 ROLLBACK-IMPORT）钉的是反面；STAT-01 又要求 staged 与现役逐字节相同。'
        + '⇒ 三条硬约束相撞，Gate 3 之前要组长裁决（契约 §0.2 给了三个选项）。这是读数，不是本格的红因。',
    }

    caseFail(problems)
  })
})
