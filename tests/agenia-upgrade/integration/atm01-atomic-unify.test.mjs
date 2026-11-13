/**
 * `ATM-01` —— **原子写归一**（构案 0006 · 史山清查 B1 · Gate 2）。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-史山清查-B1.md`（口径 / 七类腿 / 刀架（每腿各一把 + 腿 7 两条构造）/ 分母的唯一出处）。
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
 *   · **腿 8 · 重试预算**（评审 M-1，round-1 补）：`CLI_WRITE_MAX_ATTEMPTS` **只剩一份**且 = **6**
 *     （决定 §背景 那张表 + RC-2 那句"6 次"）· `install.mjs` / `rollback.mjs` 的**重写盘**调用点
 *     （第一个实参是 `*.dst_abs` 的那一处）都传这个常量、**不许**手抄数字 · 共享件默认仍是 **5**
 *     （只给其余调用者）· **出厂件**那一份也读 6 且它的调用点用常量。行为面另跑一次"每次都 EPERM"：
 *     不给 `maxAttempts` ⇒ 只试 5 次；给 6 ⇒ 试 6 次（不是只读文本）。
 *     **刀**：常量改 5 · 出厂件那份改 5 · 第二处定义 · 重写盘不传 · 别处手抄 6 · 重写盘手抄 6（"2 处"）。
 *   · **腿 9 · 出厂件文件头**（评审 M-2，round-1 补）：出厂件 `bin/rollback.mjs` 的**头**里
 *     (i) `import` 这个词 **0 次**（正文里的 `await import('node:…')` 与注释不算 —— 只判头）·
 *     (ii) 发布器那段**逐字**在（判据侧冻结 11 行，不从发布器读 —— 那会变成自证）·
 *     (iii) **没有** repo 自述「本文件是 repo 那一份」· (iv) 并集指纹在。
 *     **刀**：把 repo 那份当出厂件喂进去（scratch 落一份再读回）⇒ `SHIP-HEADER-PARAGRAPH-MISSING`
 *     且点名缺的段落。
 *   · **腿 10 · 注入器与共享件同源**（构案 0007 · 史山清查 B2，2026-11-13）：`inject.js` 的两处手搓写盘
 *     改造之后，注入器必须**静态 import** 共享件、或者按同名标记（`@inline-begin` / `@inline-end`）
 *     **内联同一段正文**（规范化之后逐字相同）；两种形态都要求 `writeFileAtomic(` 真调 ≥ 2 处、
 *     正文指纹两边同值（`writeSync(handle` / `fsyncSync(handle)` / `openSync(tmp, 'wx')` …）。
 *     **刀**：改内联副本 / 改共享件 / 两边都没有 / import 指到别处 —— 各咬自己的码。
 *     这一腿是**纯文本**判据（不跑注入器、不依赖客户端重启），边界见契约 §2.3。
 *   · **B2（2026-11-13）**：腿 10 在 Gate 2 是 **RED**（注入器还没有 import / 内联块）；Gate 3 转绿。
 *     分母**不变**（0007 §七「218 不破」）：B2 不新增格，按形状的普查腿并进 `DEC-05`，本腿并进本格。
 *   · **腿 6 · 既有行为不破**（不是新腿：靠既有格）—— 见 `PRESERVATION`：
 *     `INS-01`（安装正例 / 数据与未知文件逐字节保留 / 重装幂等）· `INS-02`（回滚正例 / 数据不动 /
 *     失败保留现场）· `INS-03`（备份在 E 盘带哈希清单）· `ENV-02`（删除前 marker / 临时件 / C 盘）·
 *     `STAT-01`（staged 与现役：差异已声明）。它们由**这一跑的全量入口**证明（`F57-SETTLE` 那一行 +
 *     各自 `_evidence/<RUN_ID>/<ID>/result.json`）。本格只记"依赖哪几条腿 + 在哪个文件"，并核对它们**还在**。
 *   · **腿 7 · 出厂件（staged）**（裁决 0006 第三方案之后加的；**同一格**，不是新格）：
 *     (a) 出厂件 `bin/rollback.mjs` **零静态 import** 且**含并集正文的指纹**（`fsyncSync` / `RETRYABLE_RENAME` / `wx`
 *         —— 今天那份 CLI 副本一个都没有）；(b) `<staging>/target-lag.json` 在、点名 `bin/rollback.mjs`、
 *         理由说得清"这是发布时的内联"；(c) 两棵树那处差异被判成 **declared**（`targetReport`，与入口同一份口径）。
 *     **控制**：内联版形状夹具 ⇒ 绿、准确声明 ⇒ `state=declared` 绿；
 *     **刀**（`bug-20261112-16` 的修法）：**两条独立构造** —— ①按发布器的成对标记
 *     （`// ── 出厂件内联` ←→ `// ── 内联结束 ──`）**真切片**，②`repo` 那份**逐字复制**
 *     （= 发布器没内联的世界）；两条都必须咬到 `SHIP-ROLLBACK-NO-INLINE` + `TARGET-LAG-UNDECLARED`。
 *     ⚠️ 不许再拿"出厂件原文"冒充"剥掉内联"（那样它必含三个指纹，与 `ship_artifact` 的"必须有"互斥）；内联在而声明不在 ⇒
 *     `SHIP-DECL-MISSING` + `TARGET-LAG-UNDECLARED`；静态 import 的规则本身在"一行 import"的文本上必须认出。
 *     为什么不开新格：与归一同一族（repo 一份 → 发布时内联 → 用户那份仍自足），且分母已由组长冻在 218。
 *
 * ## 期望读数
 *   · **Gate 2（今天，3 份实现）**：`ATM-01` 红在 `ATM-DEF-COUNT`（3 处）+ `ATM-DEF-CLI-COPY` ×2 +
 *     `ATM-CALLSITE-NO-IMPORT` ×2 + `ATM01-GATE-DELETED`（共享件没有删除闸）+ `ATM01-ENVELOPE-SUCCESS`
 *     （共享件的成功信封没有 `message`）+ `SHIP-ROLLBACK-NO-INLINE`（出厂件还是旧 CLI 副本）
 *     + `SHIP-DECL-MISSING`（声明还没有）⇒ 套件 `218 · RED 1 / GREEN 216 / HOLD 1`。
 *   · **Gate 3 之后**：真树 1 处定义、两个调用点读共享件、并集四条全绿、出厂件内联 + 声明准确
 *     ⇒ `218 · RED 0 / GREEN 217 / HOLD 1`。
 *     ✅ **前置裁决已下**（2026-11-12 23:1x · 决议 0006 改定段 · decision commit `8af3094`）：
 *     第三方案 —— repo 两份都 import；`publish-staged` 发布时内联；同批写 `target-lag.json`；
 *     三张卡（`INS-02 ①` / `ENV-02 ROLLBACK-IMPORT` / `STAT-01`）的判据对象 = **出厂件（staged）**。
 *     裁决与两个被否的替代（保留拷贝 / `await import` 绕字面）见 `readings.ruling_0006`（resolved）。
 */
import { test } from 'node:test'
import path from 'node:path'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { caseFail, problem, runCase, runId, runRoot } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { ensureMarkedDir, isUnder } from '../support/root-guard.mjs'
import { stagingRoot } from '../support/sut.mjs'
import { TOTAL } from '../support/registry.mjs'
import { actualOf, measureOne } from '../support/target.mjs'
import {
  INLINE_ANCHORS,
  SHIPPED_ROLLBACK_FILE,
  artifactReading,
  artifactVerdict,
  declarationReading,
  declarationVerdict,
  declaredDifference,
  retryBudgetReading,
  retryBudgetVerdict,
  shippedHeaderReading,
  shippedHeaderVerdict,
  staticImportLines,
} from '../support/staged-artifact.mjs'
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
import { BLOCK_BEGIN, BLOCK_END, INJECTOR_REL, SHARED_REL, blockOf, inlineSourceProblems, injectorInlineReading } from '../support/injector-inline.mjs'

const LIVE = PATHS.repo
const LIB_REL = 'presets/agenia/lib'
const STAGING_ADDITION_PREFIX = '.tools/_staging/agenia-upgrade'
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

/** 出厂件里那段内联正文的**成对标记**（发布器写进去的；这里只当切片的锚点，不当判据）。 */
const INLINE_BEGIN_MARKER = '// ── 出厂件内联'
const INLINE_END_MARKER = '// ── 内联结束 ──'

/**
 * 从一份出厂件正文里**真把内联那一段切掉**（`bug-20261112-16` 的修法）。
 *
 * 为什么不能拿"出厂件原文"当"剥掉内联"的夹具：出厂件一旦真内联，原文里就有那三个指纹，
 * 于是"缺指纹"这条判词永远不成立 —— 同一份字节被要求既含指纹又缺指纹（两向互斥）。
 * 切片必须**按标记**（语义锚点，不是字节偏移），并且把"切了几行 / 剩下多少字节"记进读数。
 *
 * @returns {{ok:true, text:string, removed_lines:number, bytes_before:number, bytes_after:number}|{ok:false, reason:string}}
 */
function stripInlinedBlock(text) {
  const lines = String(text).split(/\r?\n/)
  const begin = lines.findIndex((l) => l.includes(INLINE_BEGIN_MARKER))
  if (begin < 0) return { ok: false, reason: `找不到内联起点（含「${INLINE_BEGIN_MARKER}」的行）` }
  let end = -1
  for (let i = begin + 1; i < lines.length; i += 1) {
    if (lines[i].includes(INLINE_END_MARKER)) { end = i; break }
  }
  if (end < 0) return { ok: false, reason: `找不到内联终点（含「${INLINE_END_MARKER}」的行）` }
  const kept = [...lines.slice(0, begin), ...lines.slice(end + 1)]
  return {
    ok: true,
    text: kept.join('\n'),
    removed_lines: end - begin + 1,
    bytes_before: Buffer.byteLength(text, 'utf8'),
    bytes_after: Buffer.byteLength(kept.join('\n'), 'utf8'),
  }
}

/**
 * **出厂件形状夹具**：`<fixture>/staged-preset`（用户拿到的那一份）与 `<fixture>/live-preset`（repo 那一份）。
 *
 * `mode` 三种（三种都是"出厂件**该长什么样 / 不该长什么样**"的文本，永不执行）：
 *   · `'artifact'`  —— staged = **真出厂件原文**（内联在）。控制面：判词必须认得出"内联了"。
 *   · `'sliced'`    —— staged = 真出厂件**按标记切掉内联那一段**（零静态 import 仍在，但并集指纹没了）。
 *   · `'repo-copy'` —— staged = **repo 那份**逐字复制（= 发布器没做内联的世界：有静态 import、没有并集正文）。
 * live 侧一律是 repo 那一份 + 一行（模拟"提交那一份 + 它自己的差异"，让两棵树必然不同）。
 * 两边都放一份逐字节相同的 `inject.js`：差集才不会是"整棵树都不同"。
 *
 * ⚠️ 这是**判词的形状夹具**，不是第二份实现 —— 真正的出厂件由腿 7 的读数判；这里只回答
 * "判词在**该红**的字节上会不会红、在**该绿**的字节上会不会绿"。
 */
function shippedPair(tag, { mode, liveExtra = true }) {
  const root = fixtureRoot(tag)
  const staged = path.join(root, 'staged-preset')
  const live = path.join(root, 'live-preset')
  const shipped = readFileSync(path.join(stagingRoot(), 'bin', 'rollback.mjs'), 'utf8')
  const repoText = readFileSync(path.join(LIVE, 'presets', 'agenia', 'bin', 'rollback.mjs'), 'utf8')
  const stripped = mode === 'sliced' ? stripInlinedBlock(shipped) : null
  const stagedText = mode === 'artifact'
    ? shipped
    : mode === 'sliced'
      ? (stripped.ok ? stripped.text : shipped)
      : repoText
  const liveText = liveExtra ? `${repoText}\n// fixture: 提交那一份（这一行只为让两棵树必然不同）\n` : repoText
  put(root, 'staged-preset/bin/rollback.mjs', stagedText)
  put(root, 'live-preset/bin/rollback.mjs', liveText)
  const same = '// fixture: 两边逐字节相同的一份（证明差集不是"整棵树都不同"）\n'
  put(root, 'staged-preset/inject.js', same)
  put(root, 'live-preset/inject.js', same)
  return {
    root,
    staged,
    live,
    mode,
    strip: stripped === null ? null : { ok: stripped.ok, reason: stripped.reason ?? null, removed_lines: stripped.removed_lines ?? null, bytes_before: stripped.bytes_before ?? null, bytes_after: stripped.bytes_after ?? null },
  }
}

/** 造一份**准确**的受控差异声明（字段与数字都从同一个读者 `actualOf/measureOne` 来）。 */
function declarationFor({ staged, live }) {
  const a = actualOf({
    file: SHIPPED_ROLLBACK_FILE,
    staged: measureOne(staged, SHIPPED_ROLLBACK_FILE),
    baseline: measureOne(live, SHIPPED_ROLLBACK_FILE),
  })
  return {
    schema: 1,
    entries: [{
      file: SHIPPED_ROLLBACK_FILE,
      state: a.state,
      lag_bytes: a.lag_bytes,
      sha256: a.staged.sha256,
      baseline_sha256: a.baseline.sha256,
      missing_markers: a.missing_markers,
      reason: 'publish-staged 在发布时把 writeFileAtomic 内联进出厂件（内联），出厂件因此保持单文件零静态 import',
      approved_by: 'atm01-fixture',
      approved_on: '2026-11-12',
      closes_when: 'ATM-01 腿 7 的夹具 —— 真声明由 publish-staged 写',
    }],
  }
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
async function runFailure(root, tag, { plan = {}, allowedRoot = null, name = 'fail', targetDir = null, extra = {} } = {}) {
  const { spy, mod } = await loadImpl(root, tag)
  spy.__reset(plan)
  const target = targetDir === null
    // ⚠️ 目标**只隔一层**（`<root>/<name>/target.txt`）：`markerOf` 只往上找 5 层 ——
    //    埋太深会让"身份闸"先拒（`E_ROOT_NO_MARKER`），量到的就不是"落点不在 allowedRoot 之下"那一条了。
    ? path.join(root, name, 'target.txt')
    : path.join(targetDir, 'target.txt')
  const options = { ...(allowedRoot === null ? {} : { allowedRoot }), ...extra }
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
    const primaryHits = defs.primary_hits ?? defs.hits
    rec.readings.definitions = {
      scan_root: defs.scan_root,
      scanned_files: defs.scanned_files,
      count: defs.count,
      raw_count: defs.raw_count ?? defs.hits.length,
      primary_hits: primaryHits.map((h) => ({ file: h.file, line: h.line, kind: h.kind, exported: h.exported, classification: h.classification ?? 'primary' })),
      derived_inline_spans: defs.derived_inline_spans ?? [],
      mismatch_spans: defs.derived_inline_mismatch_spans ?? [],
      shared_block: defs.shared_block ?? null,
      marker_literals: defs.marker_literals ?? null,
      line: defs.line,
      verdict: defVerdict.verdict,
      problem_codes: codesOf(defVerdict.problems),
    }
    recordLeg({ id: 'def', label: '腿0 定义（presets/** 恰好 1 处实现：源 + 逐字同源的派生内联 · 落在共享件 · CLI 副本 0）', want: 'GREEN', list: defVerdict.problems })
    forward(defVerdict.problems, '腿0 定义')
    const unique = defs.count === 1 ? primaryHits[0] : null
    const subjectRel = unique === null ? CANONICAL_ATOMIC : unique.file
    rec.readings.subject = {
      rel: subjectRel,
      unique: unique !== null,
      note: unique === null
        ? `定义 ${defs.count} 处 ⇒ 并集腿在共享件（${CANONICAL_ATOMIC}）上量 —— 那是合并的候选；定义腿自己带红`
        : '唯一那份定义就是并集腿的被测面',
    }

    // 两条腿读的是**同一对字面量**：腿 10 的 blockOf 与腿 0 的 markedSpans 必须看到同一段（一处来源）
    {
      const injectorAbs = path.join(LIVE, ...INJECTOR_REL.split('/'))
      const injectorSource = existsSync(injectorAbs) ? readFileSync(injectorAbs, 'utf8') : null
      const span10 = injectorSource === null ? { found: false, begin_line: null, end_line: null } : blockOf(injectorSource)
      const span0 = (defs.derived_inline_spans ?? []).find((s) => s.file === INJECTOR_REL) ?? null
      rec.readings.marker_pair = {
        injector: INJECTOR_REL,
        leg10: span10.found ? { begin_line: span10.begin_line, end_line: span10.end_line } : null,
        leg0: span0,
        literals: defs.marker_literals ?? null,
      }
      if (span10.found) {
        if (span0 === null) {
          push('ATM-DEF-DERIVED-SPAN-MISSING', `腿 10 在 ${INJECTOR_REL} 读到一段内联正文（${span10.begin_line}…${span10.end_line}），腿 0 的读数里却没有把它点名成"派生内联"—— 跳过要看得见，否则"跳过了"和"没看见"同形`)
        } else if (span0.begin_line !== span10.begin_line || span0.end_line !== span10.end_line) {
          push('ATM-DEF-MARKER-SPLIT', `两条腿认的标记跨度不是同一段（腿 10：${span10.begin_line}…${span10.end_line}；腿 0：${span0.begin_line}…${span0.end_line}）—— 必须从同一处读标记字面量`)
        }
      }
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

      // 标记块的正文 = **共享件那一对标记之间的整段**（不是 `writeFileAtomic` 一个函数）——
      // §0.7 的豁免条件是"那段正文逐字等于共享件那一对标记之间的正文"，刀 / 控制必须拿同一段来构造。
      const canonicalBlock = blockOf(canonicalSource)
      if (!canonicalBlock.found) {
        push('ATM-DEF-KNIFE-ANCHOR', '共享件里没有 `@inline-begin` / `@inline-end` 那一对标记 —— 标记块的刀 / 控制没有正文可取')
      } else {
        // 刀 b：同一对标记里放**不同正文** ⇒ 仍必须是第二份实现（不许靠"打个标记"免检）
        {
          const scene = fixtureRoot('def-knife-marked-mismatch')
          put(scene, CANONICAL_ATOMIC, canonicalSource)
          const mutated = canonicalBlock.text.replace("openSync(tmp, 'wx')", "openSync(tmp, 'w')")
          if (mutated === canonicalBlock.text) {
            push('ATM-DEF-KNIFE-ANCHOR', '[刀 marked-mismatch] 改不动函数体（`openSync(tmp, \'wx\')` 锚点不在）')
          } else {
            put(scene, INJECTOR_REL, `// ${BLOCK_BEGIN}\n${mutated}\n// ${BLOCK_END}\n`)
            const read = scanWriteFileAtomicDefinitions({ root: scene })
            const verdict = definitionVerdict(read)
            const codes = codesOf(verdict.problems)
            rec.readings.definitions_knife_mismatch = {
              count: read.count, raw_count: read.raw_count, derived_inline_spans: read.derived_inline_spans, mismatch_spans: read.derived_inline_mismatch_spans, codes, line: read.line,
            }
            if (read.count !== 2) push('ATM-DEF-KNIFE-DEAD', `[刀 marked-mismatch] 标记块里的不同正文必须被数成第二处（count 2），实得 ${read.count}（raw ${read.raw_count}）`)
            if (!codes.includes('ATM-DEF-COUNT')) push('ATM-DEF-KNIFE-DEAD', `[刀 marked-mismatch] 必须报 \`ATM-DEF-COUNT\`，实得 ${JSON.stringify(codes)}`)
            if (!codes.includes('ATM-DEF-DERIVED-MISMATCH')) push('ATM-DEF-KNIFE-DEAD', `[刀 marked-mismatch] 必须报 \`ATM-DEF-DERIVED-MISMATCH\`，实得 ${JSON.stringify(codes)}`)
          }
        }
        // 控制 c：同一对标记里放**逐字同源**的正文 ⇒ 只算一处、无红（这是作用域修正，不是放宽）
        {
          const scene = fixtureRoot('def-knife-marked-same')
          put(scene, CANONICAL_ATOMIC, canonicalSource)
          put(scene, INJECTOR_REL, `// ${BLOCK_BEGIN}\n${canonicalBlock.text}\n// ${BLOCK_END}\n`)
          const read = scanWriteFileAtomicDefinitions({ root: scene })
          const verdict = definitionVerdict(read)
          const codes = codesOf(verdict.problems)
          rec.readings.definitions_control_marked = { count: read.count, raw_count: read.raw_count, derived_inline_spans: read.derived_inline_spans, codes, line: read.line }
          if (read.count !== 1 || codes.length > 0) {
            push('ATM-DEF-KNIFE-CONTROL', `[控制 marked-same] 逐字同源的派生内联必须只算一处且无红（实得 count ${read.count} · codes ${JSON.stringify(codes)}）—— 否则这不是"作用域修正"，是放宽`)
          }
          if ((read.derived_inline_spans ?? []).length !== 1) {
            push('ATM-DEF-KNIFE-CONTROL', `[控制 marked-same] 读数必须点名跳过的那一段（derived_inline_spans），实得 ${JSON.stringify(read.derived_inline_spans)}`)
          }
        }
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

    // ══ 腿 7 · 出厂件（staged）：内联 + 受控差异声明（裁决 0006 第三方案 · 2026-11-12 23:1x）══════
    // 判据对象 = **用户拿到的那一份**：`<staging>/preset/bin/rollback.mjs`。repo 里那一份从 Gate 3 起
    // 正常 import 共享件（腿 5 判它），出厂件则由 `publish-staged` 在发布时内联 —— 两件事**同时成立**。
    const stagedPresetRoot = stagingRoot()
    const livePresetRoot = path.join(LIVE, 'presets', 'agenia')
    const repoRollbackAbs = path.join(LIVE, 'presets', 'agenia', 'bin', 'rollback.mjs')
    const art = artifactReading({ presetRoot: stagedPresetRoot, repoRollback: repoRollbackAbs })
    const artV = artifactVerdict(art)
    recordLeg({ id: 'ship_artifact', label: '腿7 出厂件（零静态 import + 并集正文指纹在出厂件里）', want: 'GREEN', list: artV.problems })
    rec.readings.ship_artifact = { ...art, verdict: artV.verdict, problem_codes: codesOf(artV.problems) }
    forward(artV.problems, '腿7 出厂件')

    const decl = declarationReading({})
    const declV = declarationVerdict(decl)
    recordLeg({ id: 'ship_declaration', label: '腿7 受控差异声明（在 · 点名 bin/rollback.mjs · 理由说得出内联）', want: 'GREEN', list: declV.problems })
    rec.readings.ship_declaration = { ...decl, verdict: declV.verdict, problem_codes: codesOf(declV.problems) }
    forward(declV.problems, '腿7 声明')

    const judgedShip = declaredDifference({ stagedRoot: stagedPresetRoot, baselineRoot: livePresetRoot })
    const judgedShipProblems = judgedShip.ok
      ? []
      : [problem('SHIP-DIFFERENCE-UNDECLARED',
        `出厂件与 repo 的差异没有被声明**准确**覆盖（state=${JSON.stringify(judgedShip.state)}）：`
        + `${judgedShip.problems.map((p) => `${p.code}: ${p.message}`).join(' · ')}`)]
    recordLeg({ id: 'ship_declared_difference', label: '腿7 受控差异（STAT-01 的判据对象：差异已声明，不是分叉）', want: 'GREEN', list: judgedShipProblems })
    rec.readings.ship_declared_difference = {
      state: judgedShip.state,
      ok: judgedShip.ok,
      equal: judgedShip.equal,
      declared: judgedShip.declared,
      line: judgedShip.line,
      declaration_path: judgedShip.declaration?.path ?? null,
      declaration_present: judgedShip.declaration?.present === true,
      actuals: judgedShip.actuals.map((a) => ({ file: a.file, state: a.state, lag_bytes: a.lag_bytes })),
      target_codes: judgedShip.problems.map((p) => p.code),
    }
    forward(judgedShipProblems, '腿7 受控差异')

    // 腿 7 的**判词控制 + 两把刀**（全部在 scratch 树上跑；不碰真出厂件）
    const shipKnives = []
    const shipNote = (id, want, got, ok, detail) => {
      const entry = { id, want, got, status: ok ? 'bit' : 'dead', detail: detail ?? null }
      shipKnives.push(entry)
      return entry
    }
    const requireCode = (codes, code) => codes.includes(code)

    // 控制 1 · 形状夹具（**真出厂件原文**）⇒ 出厂件判词必须**绿**（证明它认得出"内联了"，不是永红）
    const inlinedPair = shippedPair('ship-inlined', { mode: 'artifact' })
    const inlinedArt = artifactReading({ presetRoot: inlinedPair.staged })
    const inlinedV = artifactVerdict(inlinedArt)
    shipNote('control-inlined-artifact', 'GREEN', codesOf(inlinedV.problems), inlinedV.verdict === 'GREEN',
      { line: inlinedArt.line, anchors: inlinedArt.inline_anchors, mode: inlinedPair.mode })
    if (inlinedV.verdict !== 'GREEN') {
      push('SHIP-KNIFE-CONTROL', `刀的控制面不成立：真出厂件原文应当绿（它就是"内联过"的那一份），实得 ${inlinedV.verdict}（${codesOf(inlinedV.problems).join(' / ')}）—— ${inlinedArt.line}`)
    }

    // 刀 1 · **按标记真剥掉内联** ⇒ 出厂件判词红（`SHIP-ROLLBACK-NO-INLINE`）**且**受控差异那边是"未声明"
    //   修 `bug-20261112-16`：夹具**不能**再拿出厂件原文冒充"剥掉内联"的那一份（那样它必含三个指纹，
    //   与 `ship_artifact` 的"必须有"互斥）。这里按 `// ── 出厂件内联` ←→ `// ── 内联结束 ──` 切片，
    //   并另加一份"**repo 那份逐字复制**"（= 发布器没做内联的世界）当第二把刀 —— 两条独立构造，任一条咬住即算。
    const slicedPair = shippedPair('ship-stripped', { mode: 'sliced' })
    const stripInfo = slicedPair.strip
    if (stripInfo === null || stripInfo.ok !== true) {
      push('SHIP-KNIFE-ANCHOR', `[刀 strip-inlining] 出厂件里切不出内联那一段（${stripInfo?.reason ?? '夹具不是 sliced 模式'}）—— 没有标记就没有切片，刀不咬`)
    }
    const repoCopyPair = shippedPair('ship-repo-copy', { mode: 'repo-copy' })
    const stripVariants = [
      { id: 'sliced', pair: slicedPair, label: '按标记切掉内联段' },
      { id: 'repo-copy', pair: repoCopyPair, label: 'repo 那份逐字复制（发布器没内联）' },
    ]
    const stripResults = []
    for (const variant of stripVariants) {
      const art = artifactReading({ presetRoot: variant.pair.staged })
      const v = artifactVerdict(art)
      const codes = codesOf(v.problems)
      const judged = declaredDifference({
        stagedRoot: variant.pair.staged,
        baselineRoot: variant.pair.live,
        declarationPath: path.join(variant.pair.root, 'target-lag.json'),
      })
      const targetCodes = judged.problems.map((p) => p.code)
      const ok = requireCode(codes, 'SHIP-ROLLBACK-NO-INLINE') && requireCode(targetCodes, 'TARGET-LAG-UNDECLARED')
      stripResults.push({ variant: variant.id, codes, target_codes: targetCodes, judged_state: judged.state, line: art.line, ok })
      shipNote(`knife-strip-inlining:${variant.id}`, 'SHIP-ROLLBACK-NO-INLINE + TARGET-LAG-UNDECLARED', { artifact: codes, target: targetCodes }, ok,
        { variant: variant.label, line: art.line, judged_state: judged.state, strip: variant.pair.strip })
      if (!requireCode(codes, 'SHIP-ROLLBACK-NO-INLINE')) {
        push('SHIP-KNIFE-DEAD', `[刀 strip-inlining:${variant.id}] ${variant.label}之後出厂件判词必须红 \`SHIP-ROLLBACK-NO-INLINE\`，实得 ${codes.join(' / ') || '（一条都没有）'} —— 刀不咬（${art.line}）`)
      }
      if (!requireCode(targetCodes, 'TARGET-LAG-UNDECLARED')) {
        push('SHIP-KNIFE-DEAD', `[刀 strip-inlining:${variant.id}] ${variant.label}之後两棵树仍然不同、而声明不在 ⇒ 受控差异必须报 \`TARGET-LAG-UNDECLARED\`，实得 ${targetCodes.join(' / ') || '（一条都没有）'}（state=${judged.state}）`)
      }
    }
    rec.readings.ship_strip = {
      slice: stripInfo,
      variants: stripResults,
      note: '两条独立构造：①按发布器的成对标记切片（零静态 import 仍在，只少并集正文）②repo 那份逐字复制（发布器没内联的世界）',
    }

    // 控制 2 · **准确的声明**存在 ⇒ 受控差异绿（state=declared）—— 证明"声明得对"这条路走得通
    const declaredPair = shippedPair('ship-declared', { mode: 'artifact' })
    const declPath = put(declaredPair.root, 'target-lag.json', `${JSON.stringify(declarationFor(declaredPair), null, 2)}\n`)
    const withDecl = declaredDifference({ stagedRoot: declaredPair.staged, baselineRoot: declaredPair.live, declarationPath: declPath })
    const declRead = declarationReading({ path: declPath })
    const declReadV = declarationVerdict(declRead)
    shipNote('control-declared', 'GREEN + state=declared', { state: withDecl.state, target: withDecl.problems.map((p) => p.code), decl: codesOf(declReadV.problems) },
      withDecl.ok === true && withDecl.state === 'declared' && declReadV.verdict === 'GREEN',
      { line: withDecl.line, decl_line: declRead.line })
    if (!(withDecl.ok === true && withDecl.state === 'declared')) {
      push('SHIP-KNIFE-CONTROL', `控制面不成立：一份**准确**的声明应当让受控差异绿且 state=declared，实得 ok=${withDecl.ok} / state=${JSON.stringify(withDecl.state)}（${withDecl.problems.map((p) => `${p.code}: ${p.message}`).join(' · ') || '无红因'}）`)
    }
    if (declReadV.verdict !== 'GREEN') {
      push('SHIP-KNIFE-CONTROL', `控制面不成立：一份**合格**的声明应当让声明判词绿，实得 ${declReadV.verdict}（${codesOf(declReadV.problems).join(' / ')}）—— ${declRead.line}`)
    }

    // 刀 2 · **内联在、声明不在** ⇒ 声明判词红（`SHIP-DECL-MISSING`）**且**受控差异报"未声明"
    const missingDeclPath = path.join(declaredPair.root, 'target-lag.absent.json')
    const missingDeclV = declarationVerdict(declarationReading({ path: missingDeclPath }))
    const withoutDecl = declaredDifference({ stagedRoot: declaredPair.staged, baselineRoot: declaredPair.live, declarationPath: missingDeclPath })
    const withoutTargetCodes = withoutDecl.problems.map((p) => p.code)
    const dropOk = requireCode(codesOf(missingDeclV.problems), 'SHIP-DECL-MISSING') && requireCode(withoutTargetCodes, 'TARGET-LAG-UNDECLARED')
    shipNote('knife-drop-declaration', 'SHIP-DECL-MISSING + TARGET-LAG-UNDECLARED',
      { declaration: codesOf(missingDeclV.problems), target: withoutTargetCodes }, dropOk,
      { state: withoutDecl.state })
    if (!requireCode(codesOf(missingDeclV.problems), 'SHIP-DECL-MISSING')) {
      push('SHIP-KNIFE-DEAD', `[刀 drop-declaration] 声明不在时声明判词必须红 \`SHIP-DECL-MISSING\`，实得 ${codesOf(missingDeclV.problems).join(' / ') || '（一条都没有）'}`)
    }
    if (!requireCode(withoutTargetCodes, 'TARGET-LAG-UNDECLARED')) {
      push('SHIP-KNIFE-DEAD', `[刀 drop-declaration] 内联在、声明不在 ⇒ 受控差异必须报 \`TARGET-LAG-UNDECLARED\`，实得 ${withoutTargetCodes.join(' / ') || '（一条都没有）'}（state=${withoutDecl.state}）`)
    }

    // 刀 3 · 静态 import 的**规则本身**：一份带 `import` 的文本必须被认出；出厂件那一份必须 0 行
    {
      const ruleProbe = staticImportLines("import { writeFileAtomic } from '../lib/atomic.mjs'\nconst x = 1\n")
      const shippedImports = staticImportLines(readFileSync(path.join(stagedPresetRoot, 'bin', 'rollback.mjs'), 'utf8'))
      const ruleOk = ruleProbe.length === 1 && ruleProbe[0].kind === 'import'
      shipNote('knife-static-import-rule', '认出 1 行 import · 出厂件 0 行',
        { probe: ruleProbe.length, shipped: shippedImports.length }, ruleOk && shippedImports.length === 0,
        { probe_line: ruleProbe[0]?.text ?? null })
      if (!ruleOk) push('SHIP-KNIFE-DEAD', `[刀 static-import] \`staticImportLines\` 认不出一行静态 import（实得 ${JSON.stringify(ruleProbe)}）—— INS-02 ① 的规则是哑的`)
      if (shippedImports.length !== 0) push('SHIP-KNIFE-DEAD', `[刀 static-import] 今天那份出厂件本该 0 行静态 import，实得 ${shippedImports.length} 行`)
    }
    rec.readings.ship_knives = shipKnives

    // ══ 腿 8 · 重试预算（评审 M-1）═════════════════════════════════════════════════════════
    // 病：决定 §背景 那张表写 CLI 甲"按 EPERM/EBUSY/EACCES 重试 **6** 次"、RC-2 写"6 次不够"；
    // 合并体把 `maxAttempts` 的默认取成 5，两处调用点都没传 ⇒ 实际生效 5，**磁盘上没有任何读数写这个数**。
    // 这一腿钉四件：常量只剩一份且 = 6 · 两处**重写盘**调用点传它 · 共享件默认仍是 5 · 出厂件也读 6。
    const libSourceForBudget = readFileSync(path.join(LIVE, ...CANONICAL_ATOMIC.split('/')), 'utf8')
    const installSourceForBudget = readFileSync(path.join(LIVE, 'presets', 'agenia', 'bin', 'install.mjs'), 'utf8')
    const rollbackSourceForBudget = readFileSync(path.join(LIVE, 'presets', 'agenia', 'bin', 'rollback.mjs'), 'utf8')
    const artifactSourceForBudget = readFileSync(path.join(stagedPresetRoot, 'bin', 'rollback.mjs'), 'utf8')
    const budgetFiles = ({ lib = libSourceForBudget, install = installSourceForBudget, rollback = rollbackSourceForBudget, artifact = artifactSourceForBudget } = {}) => [
      { rel: CANONICAL_ATOMIC, text: lib },
      { rel: 'presets/agenia/bin/install.mjs', text: install },
      { rel: 'presets/agenia/bin/rollback.mjs', text: rollback },
      { rel: `${STAGING_ADDITION_PREFIX}/preset/bin/rollback.mjs`, text: artifact, is_artifact: true },
    ]
    const budget = retryBudgetReading({ files: budgetFiles() })
    const budgetV = retryBudgetVerdict(budget)
    recordLeg({ id: 'retry_budget', label: '腿8 重试预算（M-1）：常量只剩一份且=6 · 两处重写盘调用点传常量 · 共享件默认 5 · 出厂件也读 6', want: 'GREEN', list: budgetV.problems })
    forward(budgetV.problems, '腿8 重试预算（文本面）')
    // 行为面：不给 `maxAttempts` ⇒ 只试 5 次；给了 6 ⇒ 试 6 次（桩把每一次 rename 都打回 EPERM）
    const exhaustDefault = await runFailure(base.root, 'base', { plan: { rename_codes: Array(12).fill('EPERM') }, name: 'exhaust-default' })
    const exhaustSix = await runFailure(base.root, 'base', { plan: { rename_codes: Array(12).fill('EPERM') }, name: 'exhaust-six', extra: { maxAttempts: 6 } })
    const renamesOf = (r) => r.calls.filter((c) => c.op === 'renameSync').length
    const budgetBehaviourProblems = []
    if (renamesOf(exhaustDefault) !== 5 || exhaustDefault.result?.attempts !== 5) {
      budgetBehaviourProblems.push(problem('ATM-RETRY-BUDGET-DEFAULT',
        `不给 \`maxAttempts\` 时共享件必须只试 **5** 次（其它老调用者的默认），实得 renameSync ${renamesOf(exhaustDefault)} 次 / attempts=${JSON.stringify(exhaustDefault.result?.attempts)}`))
    }
    if (renamesOf(exhaustSix) !== 6 || exhaustSix.result?.attempts !== 6) {
      budgetBehaviourProblems.push(problem('ATM-RETRY-BUDGET-SIX',
        `给 \`maxAttempts: 6\` 时必须真试 **6** 次，实得 renameSync ${renamesOf(exhaustSix)} 次 / attempts=${JSON.stringify(exhaustSix.result?.attempts)}`))
    }
    recordLeg({ id: 'retry_budget_behaviour', label: '腿8b 重试预算（行为面）：默认 5 · 传 6 则 6（桩让每次 rename 都 EPERM）', want: 'GREEN', list: budgetBehaviourProblems })
    rec.readings.retry_budget = {
      ...budget,
      behaviour: {
        default: { renames: renamesOf(exhaustDefault), attempts: exhaustDefault.result?.attempts ?? null, code: exhaustDefault.result?.code ?? null },
        six: { renames: renamesOf(exhaustSix), attempts: exhaustSix.result?.attempts ?? null, code: exhaustSix.result?.code ?? null },
      },
      text_codes: codesOf(budgetV.problems),
      behaviour_codes: codesOf(budgetBehaviourProblems),
    }
    forward(budgetBehaviourProblems, '腿8b 重试预算（行为面）')

    // ══ 腿 9 · 出厂件文件头（评审 M-2）═════════════════════════════════════════════════════
    // 病：出厂件里还留着 repo 那一份的自述（"本文件是 repo 那一份，引用了 ../lib/atomic.mjs"），
    // 而它正是出厂件、静态 import 数 = 0 —— 同一份文件里两句话互相打脸。
    // 这一腿不读发布器（那会变成自证）：判据侧**冻结**那段逐字要求，让真出厂件去对。
    const headerRead = shippedHeaderReading({ artifactSource: artifactSourceForBudget, repoSource: rollbackSourceForBudget })
    const headerV = shippedHeaderVerdict(headerRead)
    recordLeg({ id: 'ship_header', label: '腿9 出厂件文件头（M-2）：头里 0 个 import 词 · 发布器段落逐字在 · 无 repo 自述 · 指纹在', want: 'GREEN', list: headerV.problems })
    rec.readings.ship_header = { ...headerRead, text_codes: codesOf(headerV.problems) }
    forward(headerV.problems, '腿9 出厂件文件头')

    // ══ 腿 10 · 注入器与共享件同源（构案 0007 · 史山清查 B2）═══════════════════════════════
    // 病：`inject.js` 是注入器（宿主加载、ESM 缓存），它可能没法静态 import `lib/atomic.mjs`；
    // Gate 3 若把正文内联进去，就出现第二份正文 —— 两份各自被改，谁也看不见。
    // 这一腿钉"同源"：① 静态 import（解析后 = `lib/atomic.mjs`）**或** ② 一对同名标记之间放
    // **同一段正文**（规范化之后逐字相同）；两种形态都要求真调（≥2 处）与正文指纹两边同值。
    const injectRead = injectorInlineReading({ repoRoot: LIVE })
    const injectProblems = injectRead.problems.map((p) => problem(p.code, p.message))
    recordLeg({ id: 'injector_inline', label: '腿10 注入器与共享件同源（静态 import 或内联同一段正文 + 指纹 + ≥2 个调用点）', want: 'GREEN', list: injectProblems })
    rec.readings.injector_inline = injectRead
    forward(injectProblems, '腿10 注入器同源')
    // 刀：合成的两段正文（不碰真树）—— 改内联副本 / 改共享件 / 两边都没有
    const syntheticInjector = (block, { marker = true } = {}) => [
      '/**',
      ' * 注入器（刀夹具）：内联自 lib/atomic.mjs（v0.2.2-rc.1）—— 这一行是来源 / 版本注明。',
      ' */',
      marker ? `// ${BLOCK_BEGIN}` : '// （没有内联标记）',
      block,
      marker ? `// ${BLOCK_END}` : '// （没有内联标记）',
      'writeFileAtomic(tmpA, textA)',
      'writeFileAtomic(tmpB, textB)',
      '',
    ].join('\n')
    const realShared = readFileSync(path.join(LIVE, ...SHARED_REL.split('/')), 'utf8')
    const sharedBlock = blockOf(realShared)
    const inlineKnives = []
    const judgeInline = (id, want, input) => {
      const v = inlineSourceProblems(input)
      const codes = codesOf(v.problems)
      const ok = codes.includes(want)
      inlineKnives.push({ id, want, mode: v.mode, codes, status: ok ? 'bit' : 'dead', problems: v.problems.map((p) => `${p.code}: ${p.message}`).slice(0, 4) })
      return { ok, codes }
    }
    if (!sharedBlock.found) {
      push('ATM01-INJECT-SHARED-BLOCK-MISSING', '共享件里没有 `@inline-begin` / `@inline-end` 那一对标记 —— 腿 10 的锚点不在')
    } else {
      // 控制：真共享正文 + 同名标记 + 来源/版本注明 + 两个调用点 ⇒ 必须绿
      const control = inlineSourceProblems({ sharedSource: realShared, injectorSource: syntheticInjector(sharedBlock.text) })
      rec.readings.injector_inline_control = { mode: control.mode, codes: codesOf(control.problems), readings: control.readings }
      if (control.problems.length > 0) push('ATM01-INJECT-KNIFE-CONTROL', `刀的控制面不成立：真共享正文放进内联块之后仍然红 ${JSON.stringify(codesOf(control.problems))} —— 刀分不清"同源"与"不同源"`)
      // 刀 ①：内联副本改一处（`'wx'` → `'w'`）⇒ 两边正文不再相同
      judgeInline('inline-drift-injector', 'ATM01-INJECT-INLINE-DRIFT', {
        sharedSource: realShared,
        injectorSource: syntheticInjector(sharedBlock.text.replace("openSync(tmp, 'wx')", "openSync(tmp, 'w')")),
      })
      // 刀 ②：共享件改一处（同一处）⇒ 也必须红（改哪边都咬）
      judgeInline('inline-drift-shared', 'ATM01-INJECT-INLINE-DRIFT', {
        sharedSource: realShared.replace("openSync(tmp, 'wx')", "openSync(tmp, 'w')"),
        injectorSource: syntheticInjector(sharedBlock.text),
      })
      // 刀 ③：没有 import、没有内联块 ⇒ 注入器的写盘仍是自己那一份
      judgeInline('no-shared-writer', 'ATM01-INJECT-NO-SHARED-WRITER', {
        sharedSource: realShared,
        injectorSource: syntheticInjector('', { marker: false }),
      })
    }
    // 静态 import 那一支的控制：解析后 = 共享件 ⇒ 绿；指到别处 ⇒ NOT-LIB
    //    （`inject.js` 在 `presets/agenia/` 下，所以正确写法是 `./lib/atomic.mjs`）
    const importControl = "import { writeFileAtomic } from './lib/atomic.mjs'\nwriteFileAtomic(a, b)\nwriteFileAtomic(c, d)\n"
    const importWrong = "import { writeFileAtomic } from './other.mjs'\nwriteFileAtomic(a, b)\nwriteFileAtomic(c, d)\n"
    const importVerdict = inlineSourceProblems({ sharedSource: realShared, injectorSource: importControl })
    const importWrongVerdict = inlineSourceProblems({ sharedSource: realShared, injectorSource: importWrong })
    rec.readings.injector_import_control = { mode: importVerdict.mode, codes: codesOf(importVerdict.problems), wrong_codes: codesOf(importWrongVerdict.problems) }
    if (importVerdict.mode !== 'static-import' || importVerdict.problems.length > 0) {
      push('ATM01-INJECT-KNIFE-CONTROL', `静态 import 的控制面不成立（mode=${importVerdict.mode} · ${JSON.stringify(codesOf(importVerdict.problems))}）`)
    }
    if (!codesOf(importWrongVerdict.problems).includes('ATM01-INJECT-STATIC-IMPORT-NOT-LIB')) {
      push('ATM01-INJECT-KNIFE-DEAD', '把 import 指到别处之后必须报 `ATM01-INJECT-STATIC-IMPORT-NOT-LIB`')
    }
    rec.readings.injector_inline_knives = inlineKnives
    for (const k of inlineKnives) {
      if (k.status !== 'bit') push('ATM01-INJECT-KNIFE-DEAD', `[刀 ${k.id}] 必须报 ${k.want}，实得 ${JSON.stringify(k.codes)}`)
    }

    // ══ 刀架（L-1 / L-2）：每条子断言各自"单独会红"——纯文本构造，不碰真树 ═══════════════════
    const l1l2 = []
    const mutation = (text, find, replace, id) => {
      const count = text.split(find).length - 1
      return { id, ok: count === 1, count, text: count === 1 ? text.replace(find, replace) : text }
    }
    const budgetKnife = (id, want, mutated, mustName = null) => {
      const v = retryBudgetVerdict(retryBudgetReading({ files: budgetFiles(mutated) }))
      const codes = codesOf(v.problems)
      const text = v.problems.map((p) => `${p.code}: ${p.message}`).join(' | ')
      const ok = codes.includes(want) && (mustName === null || text.includes(mustName))
      l1l2.push({ id, want, codes, named: mustName === null ? null : text.includes(mustName), status: ok ? 'bit' : 'dead',
        problems: v.problems.map((p) => `${p.code}: ${p.message}`).slice(0, 4) })
      return { ok, codes }
    }
    // (b) 值改成 5 ⇒ `ATM-RETRY-BUDGET-CONST`（单独一条）
    {
      const m = mutation(libSourceForBudget, 'const CLI_WRITE_MAX_ATTEMPTS = 6', 'const CLI_WRITE_MAX_ATTEMPTS = 5', 'const-value-5')
      if (!m.ok) push('ATM-KNIFE-ANCHOR', `[刀 const-value-5] 锚点命中 ${m.count} 次（要 1）—— 刀不咬`)
      const r = budgetKnife('const-value-5', 'ATM-RETRY-BUDGET-CONST', { lib: m.text })
      if (!r.ok) push('ATM-KNIFE-DEAD', `[刀 const-value-5] 常量改成 5 之后必须红 \`ATM-RETRY-BUDGET-CONST\`，实得 ${r.codes.join(' / ') || '（一条都没有）'}`)
    }
    // (b′) 出厂件那一份改成 5 ⇒ `SHIP-RETRY-BUDGET-VALUE`
    {
      const m = mutation(artifactSourceForBudget, 'const CLI_WRITE_MAX_ATTEMPTS = 6', 'const CLI_WRITE_MAX_ATTEMPTS = 5', 'artifact-value-5')
      if (!m.ok) push('ATM-KNIFE-ANCHOR', `[刀 artifact-value-5] 锚点命中 ${m.count} 次（要 1）—— 刀不咬`)
      const r = budgetKnife('artifact-value-5', 'SHIP-RETRY-BUDGET-VALUE', { artifact: m.text })
      if (!r.ok) push('ATM-KNIFE-DEAD', `[刀 artifact-value-5] 出厂件那份常量改成 5 之后必须红 \`SHIP-RETRY-BUDGET-VALUE\`，实得 ${r.codes.join(' / ') || '（一条都没有）'}`)
    }
    // (b″) 第二处定义 ⇒ `ATM-RETRY-BUDGET-CONST`（"只剩一份"）
    {
      const dup = `${installSourceForBudget}\nconst CLI_WRITE_MAX_ATTEMPTS = 6\n`
      const r = budgetKnife('duplicate-definition', 'ATM-RETRY-BUDGET-CONST', { install: dup })
      if (!r.ok) push('ATM-KNIFE-DEAD', `[刀 duplicate-definition] 在 install.mjs 里再写一份常量之后必须红 \`ATM-RETRY-BUDGET-CONST\`，实得 ${r.codes.join(' / ') || '（一条都没有）'}`)
    }
    // (a) 重写盘那一处**不传** ⇒ `ATM-RETRY-BUDGET-CALLSITE` 且点名那个文件
    {
      const m = mutation(installSourceForBudget, ', maxAttempts: CLI_WRITE_MAX_ATTEMPTS', '', 'drop-option-install')
      if (!m.ok) push('ATM-KNIFE-ANCHOR', `[刀 drop-option-install] 锚点命中 ${m.count} 次（要 1）—— 刀不咬（重写盘那一处的选项写法变了？）`)
      const r = budgetKnife('drop-option-install', 'ATM-RETRY-BUDGET-CALLSITE', { install: m.text }, 'install.mjs')
      if (!r.ok) push('ATM-KNIFE-DEAD', `[刀 drop-option-install] 去掉 install 重写盘调用点的 \`maxAttempts\` 之后必须红 \`ATM-RETRY-BUDGET-CALLSITE\` 且点名 install.mjs，实得 ${r.codes.join(' / ') || '（一条都没有）'}`)
    }
    // (a′) 别处手抄一个 6 ⇒ 只有 `ATM-RETRY-BUDGET-LITERAL`（"同一个数两处"）
    {
      const target = 'const r = writeFileAtomic(to, bytes, { allowedRoot: presetRoot })'
      const m = mutation(installSourceForBudget, target, 'const r = writeFileAtomic(to, bytes, { allowedRoot: presetRoot, maxAttempts: 6 })', 'literal-elsewhere')
      if (!m.ok) push('ATM-KNIFE-ANCHOR', `[刀 literal-elsewhere] 锚点命中 ${m.count} 次（要 1）—— 发布那处调用点的写法变了？刀不咬`)
      const r = budgetKnife('literal-elsewhere', 'ATM-RETRY-BUDGET-LITERAL', { install: m.text })
      if (!r.ok) push('ATM-KNIFE-DEAD', `[刀 literal-elsewhere] 在另一处调用点手抄 \`maxAttempts: 6\` 之后必须红 \`ATM-RETRY-BUDGET-LITERAL\`，实得 ${r.codes.join(' / ') || '（一条都没有）'}`)
    }
    // (a″) 重写盘那一处手抄 6（而不是传常量）⇒ 字面 + 调用点两条一起红（"两处"）
    {
      const m = mutation(rollbackSourceForBudget, 'maxAttempts: CLI_WRITE_MAX_ATTEMPTS', 'maxAttempts: 6', 'handcopy-rollback')
      if (!m.ok) push('ATM-KNIFE-ANCHOR', `[刀 handcopy-rollback] 锚点命中 ${m.count} 次（要 1）—— 刀不咬`)
      const r = budgetKnife('handcopy-rollback', 'ATM-RETRY-BUDGET-LITERAL', { rollback: m.text }, '2 处')
      if (!r.ok) push('ATM-KNIFE-DEAD', `[刀 handcopy-rollback] 把 rollback 那一处手抄成 6 之后必须红 \`ATM-RETRY-BUDGET-LITERAL\` 且报文说"同一个数出现在 2 处"，实得 ${r.codes.join(' / ') || '（一条都没有）'}`)
    }
    // (L-2) 拿 repo 那份当出厂件（scratch 落一份再读回来）⇒ `SHIP-HEADER-PARAGRAPH-MISSING` 且点名缺的那段
    {
      const scratchRoot = fixtureRoot('l2-header-knife')
      const scratchFile = put(scratchRoot, 'bin/rollback.mjs', rollbackSourceForBudget)
      const asShipped = readFileSync(scratchFile, 'utf8')
      if (asShipped !== rollbackSourceForBudget) push('ATM-KNIFE-ANCHOR', '[刀 repo-as-shipped] scratch 副本读回来与 repo 那份不一致 —— 刀不咬')
      const h = shippedHeaderReading({ artifactSource: asShipped, repoSource: rollbackSourceForBudget })
      const hv = shippedHeaderVerdict(h)
      const codes = codesOf(hv.problems)
      const text = hv.problems.map((p) => `${p.code}: ${p.message}`).join(' | ')
      const namesParagraph = text.includes('缺 11 行') || text.includes('单文件自足、零静态引用')
      const ok = codes.includes('SHIP-HEADER-PARAGRAPH-MISSING') && namesParagraph
      l1l2.push({ id: 'repo-as-shipped', want: 'SHIP-HEADER-PARAGRAPH-MISSING（点名缺的那段）', codes, named: namesParagraph, status: ok ? 'bit' : 'dead',
        problems: hv.problems.map((p) => `${p.code}: ${p.message}`).slice(0, 4) })
      if (!ok) push('ATM-KNIFE-DEAD', `[刀 repo-as-shipped] 把 repo 那份当出厂件喂进去之后必须红 \`SHIP-HEADER-PARAGRAPH-MISSING\` 且点名缺的那段，实得 ${codes.join(' / ') || '（一条都没有）'}`)
    }
    rec.readings.l1l2_knives = {
      knives: l1l2,
      note: 'L-1 六把（值 5 · 出厂件值 5 · 第二处定义 · 重写盘不传 · 别处手抄 · 重写盘手抄）+ L-2 一把（repo 当出厂件）；全是纯文本/scratch 构造，不碰真树',
    }

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
      denominator_after: 'TOTAL（盘上发现）—— B1 只 +1（217 → 218）；B2 **不新增格**（0007 §七：218 不破），腿 10 并进本格、普查腿并进 `DEC-05`',
      denominator_note: '为什么出厂件那几条不再开一格：它们与"归一"是**同一族判据**（repo 一份实现 → 发布时内联 → 用户拿到的那一份仍自足），'
        + '拆成新格会让"归一这一票"跨两格，也会把组长冻住的分母顶上去；腿不是格（项目口径），所以并进 ATM-01。'
        + 'B2 的腿 10 同样并进本格（同一个定义的第二个载体）；B2 的**普查口径**（按形状数）并进 `DEC-05`（census 的计数口径那一格）—— 两者都不是新格。',
      gate2: 'RED：定义 3 处（ATM-DEF-COUNT）+ CLI 副本 ×2 + 调用点无 import ×2 + 闸缺失（ATM01-GATE-DELETED）+ 成功信封无 message'
        + ' + 出厂件没内联（SHIP-ROLLBACK-NO-INLINE）+ 没有受控差异声明（SHIP-DECL-MISSING）+ 注入器没有共享件（ATM01-INJECT-NO-SHARED-WRITER）',
      gate3: 'GREEN：定义 1 处 · 两个调用点读共享件 · 并集四条全绿（并集 c 的基线到那一刻才转绿，刀也随之必须咬）'
        + ' · 出厂件内联（零静态 import + 并集指纹在）· 受控差异声明准确（state=declared）· 注入器静态 import 或内联同一段正文（腿 10）',
      caveat: '并集 d 的"两套码取并集"在成员上是恒等操作（两套都是 EPERM/EBUSY/EACCES）⇒ 判的是覆盖与"只剩一份"，判不了"两套都留"',
      ruling: '裁决 0006 第三方案（2026-11-12 23:1x，decision commit 8af3094）：repo 两份都 import 共享件；publish-staged 在发布时内联；'
        + '同批写 target-lag.json；三张卡的判据对象 = 出厂件（staged）。见 readings.ruling_0006（resolved）',
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
    rec.readings.ruling_0006 = {
      status: 'resolved',
      decision: '决议/构案/0006-原子写归一.md §决定（改定 · 2026-11-12 23:1x）+ RC-4',
      decided_by: '组长（第 2 关发现相撞之后裁决）',
      decision_commit: '8af3094',
      adopted: '第三方案 —— repo 里 install/rollback 都 import 共享件；publish-staged 在发布时把 writeFileAtomic 内联进出厂件；'
        + '同批落 target-lag.json 声明这处受控差异；三张卡（INS-02 ① / ENV-02 ROLLBACK-IMPORT / STAT-01）的判据对象 = 出厂件（staged）',
      rejected: [
        '否「rollback 保留自己那份拷贝」—— 那就是两套实现，本票目的就是删掉它',
        '否「rollback 用 await import 绕过静态 import 检查」—— 拿冻结约束的字面当漏洞钻，Q6 的意图是"单文件可直接跑"',
      ],
      before_ruling_measurements: {
        rollback_static_import_lines: staticImports,
        staged_rollback_identical_to_live: stagedIdentical,
        ins02_zero_import_rule: lookup('integration/install-rollback.test.mjs', 'INS02-ZERO-IMPORT'),
        env02_rollback_import_rule: lookup('static/env-scan.test.mjs', "'ROLLBACK-IMPORT'"),
        stat01_two_tree_rule: lookup('static/composition.test.mjs', 'STAGED-LIVE-DRIFT'),
        target_lag_declaration_present: existsSync(path.join(LIVE, '.tools', '_staging', 'agenia-upgrade', 'target-lag.json')),
      },
      no_longer_a_collision_because: '三个约束各自只钉**一个对象**：Q6 钉出厂件（用户跑的那一份）、定义腿/信封腿钉 repo（一份实现）、'
        + 'STAT-01 钉"两棵树的差异已声明"。上面的数值是同一天裁决之前的现场（那时 repo 与出厂件逐字节相同），留作"裁决从哪来"的凭据。',
    }

    caseFail(problems)
  })
})
