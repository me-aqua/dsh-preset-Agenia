/**
 * `PWL-01` —— **池子 / 已判索引的写盘纪律**（结构判据；`bug-20261110-10` 的判据面）。
 *
 * 契约：`.team/test/2026-11-10/CONTRACT-gate2-anchors-and-holds.md` §5（本文件是它的实现）。
 * 被测：`<staged>/lib/proposals.mjs`（**文本**，不 import、不执行）。
 *
 * ## 为什么要有这一格
 * 实现把三条入口（`appendProposal` / `appendProposalDeduped` / `appendMaintenanceDraftDeduped`）
 * 合成了一条写路径（`writePoolRowLocked`），并删掉了原来在锁外的那一条 `mkdirSync`。
 * 但那两句话**只活在注释里**：下一次"顺手加个目录"就能把锁外的裸 `EACCES`/`EEXIST` 带回来，
 * 而所有行为判据（`MNF-*` / `PFL-*` / `JUD-*`）都看不见它 —— 它们只在**跑得到**的分支上量行为。
 *
 * ## 这一格判三件事（`support/pool-writer-shape.mjs` 是判据本体，纯函数）
 *   ① `PWL-MKDIR-OUTSIDE-LOCK`：`lib/proposals.mjs` 里**不许有 `mkdirSync`**
 *      （目录由 `writeFileAtomic` 在调用方持有的锁里建；锁外那条抛出的是不以码开头的裸错误）。
 *      **宽口径**：不猜哪几行在锁里、也不只看 `proposalsDir(` —— 任何一处 `mkdirSync(` 都算。
 *   ② `PWL-POOL-WRITE-ELSEWHERE`：写**池子那一份文件**的调用只能在 `writePoolRowLocked` 里。
 *   ③ `PWL-SCAN-BLIND`：连一处 `poolPath(` / `pool.path` 都没看见 ⇒ 扫描器读错了文件，**不许**报绿。
 *
 * ## 刀（七把合成源码 + 一把真源码）
 *   · 干净样本 ⇒ 0 条（判据可满足，阳性对照）；
 *   · 锁外 `mkdirSync`（形状照 `appendJudgedRows`）⇒ **只**红 ①；
 *   · `writeFileAtomic(pool.path, …)` 放进另一个函数 ⇒ **只**红 ②；
 *   · 一份没有 `poolPath(` 的源码 ⇒ **只**红 ③；
 *   · **折行**：池实的实参跨行写（`writeFileAtomic(\n  poolPath(root),\n …)`）⇒ 仍然**只**红 ②
 *     （`bug-20261111-01` ①：判据按**调用的实参区间**判，不按"同一行"判）；
 *   · **别名**：先把池子路径绑到 `const poolFile = poolPath(root)`，再用那个名字写 ⇒ 仍然**只**红 ②
 *     （`bug-20261111-01` ①：作用域内被绑到池子路径上的名字也算池写）；
 *   · **正则字面量**：`const QUOTE_RE = /['"]/` 之后还有一条池写 ⇒ 掩码器必须认出正则、
 *     只吞它自己那一段，后文照看 ⇒ **只**红 ②，且读数里 `regex_literals` 恰好 1
 *     （`bug-20261111-01` ②：吞掉代码**必须留读数**，不许静默）；
 *   · **除号不是正则**（阴性对照）：`const half = total / 2` ⇒ `regex_literals` 必须是 0，
 *     否则"把除号当正则"会把后文整段吞掉 —— 那是同一个病的另一面；
 *   · 真 `lib/proposals.mjs` ⇒ 真读数（今天它绿：`mkdir_sites: []`，池写只有一条）。
 *
 * ## 今天的事实（**不是**预期红）
 * `9f2ca8f` 之后真源码里**零个** `mkdirSync`（`appendJudgedRows` 那一处在锁里由 `acquireLock` 建目录）；
 * 池子那一份文件只有 `writePoolRowLocked` 里那一条写。⇒ 这一格今天是绿的，
 * 它的可翻面性由上面七把刀承重（每一把只翻它自己那一条码）。
 */
import { test } from 'node:test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { caseFail, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { poolWriterFindings } from '../support/pool-writer-shape.mjs'

/** 干净的合成源码：没有 `mkdirSync`，池子只在 `writePoolRowLocked` 里写一次。 */
const CLEAN = [
  'function readPool(root) { return readFileSync(poolPath(root), \'utf8\') }',
  'function writePoolRowLocked(root, spec) {',
  '  const pool = readPool(root)',
  '  return writeFileAtomic(pool.path, spec.text)',
  '}',
  'function withPoolRow(root, spec) {',
  '  const lock = acquireLock(poolLockPath(root), {})',
  '  try { return writePoolRowLocked(root, spec) } finally { releaseLock(poolLockPath(root)) }',
  '}',
  '',
].join('\n')

/** 锁外 `mkdirSync`（形状照 `appendJudgedRows`）：在 `acquireLock` **之前**建目录。 */
const MKDIR_OUTSIDE = [
  'function appendJudgedRows(root) {',
  '  mkdirSync(proposalsDir(root), { recursive: true })',
  '  const lock = acquireLock(judgedLockPath(root), {})',
  '  return writeFileAtomic(judgedPath(root), \'x\')',
  '}',
  'function readPool(root) { return poolPath(root) }',
  '',
].join('\n')

/** 池子写到了 `writePoolRowLocked` 之外。 */
const POOL_WRITE_ELSEWHERE = [
  'function writePoolRowLocked(root, spec) {',
  '  return writeFileAtomic(pool.path, spec.text)',
  '}',
  'function appendProposal(root, spec) {',
  '  return writeFileAtomic(poolPath(root), spec.text)',
  '}',
  '',
].join('\n')

/**
 * **折行**（`bug-20261111-01` ①）：池写与 `pool.path` 不在同一行 —— 旧判法按行看，这里当场溜过去。
 * 形状是"三条入口共用一条写路径"被破：`appendProposal` 自己写池子那一份文件。
 */
const WRAPPED_WRITE = [
  'function writePoolRowLocked(root, spec) {',
  '  return writeFileAtomic(pool.path, spec.text)',
  '}',
  'function appendProposal(root, spec) {',
  '  return writeFileAtomic(',
  '    poolPath(root),',
  '    spec.text,',
  '  )',
  '}',
  '',
].join('\n')

/** **别名**（`bug-20261111-01` ①）：先把池子路径绑到一个名字上，再用那个名字写。 */
const ALIASED_WRITE = [
  'function writePoolRowLocked(root, spec) {',
  '  const pool = readPool(root)',
  '  return writeFileAtomic(pool.path, spec.text)',
  '}',
  'function appendProposal(root, spec) {',
  '  const poolFile = poolPath(root)',
  '  return writeFileAtomic(poolFile, spec.text)',
  '}',
  '',
].join('\n')

/**
 * **正则字面量**（`bug-20261111-01` ②）：`/['"]/` 里的引号不是字符串的开头。
 * 不认正则 ⇒ 掩码器从那个引号一路吞到文件尾（换行留着、后文全是空白）⇒ 后面那条池写**看不见**，
 * 而 `pool_target_lines` 又不是 0（前面那条还在）⇒ 静默报绿。
 * 两种位置各一次：`=` 之后（赋值）与 `return` 之后（关键字后也是表达式位置）—— 只认前一种同样会漏。
 */
const REGEX_THEN_WRITE = [
  'function writePoolRowLocked(root, spec) {',
  '  return writeFileAtomic(pool.path, spec.text)',
  '}',
  'const QUOTE_RE = /[\'"]/',
  'function hasQuote(text) {',
  '  return /[\'"]/.test(String(text))',
  '}',
  'function appendProposal(root, spec) {',
  '  return writeFileAtomic(poolPath(root), spec.text)',
  '}',
  '',
].join('\n')

/**
 * **阴性对照**：除号不是正则。`total / 2` 若被当成正则的开头，后文会被整段吞掉 ——
 * 那是同一个病的另一面，所以这一份必须 `regex_literals: 0` 且**看得见**后面那条池写。
 */
const DIVISION_CONTROL = [
  'function writePoolRowLocked(root, spec) {',
  '  return writeFileAtomic(pool.path, spec.text)',
  '}',
  'function halfOf(total) {',
  '  const half = total / 2',
  '  return half',
  '}',
  'function appendProposal(root, spec) {',
  '  return writeFileAtomic(poolPath(root), spec.text)',
  '}',
  '',
].join('\n')

/** 扫描器瞎了：整份源码里没有池子路径。 */
const BLIND = [
  'function nothing() {',
  '  return 42',
  '}',
  '',
].join('\n')

test('PWL-01 池子/已判索引的写盘纪律：`lib/proposals.mjs` 不许有 mkdirSync · 池子只能由 writePoolRowLocked 写 · 扫描器看不见要出声', async () => {
  await runCase('PWL-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    // ── ① 判据本体：合成源码各切一刀（+ 干净样本当阳性对照）───────────────────
    const fixtures = [
      { key: 'clean', source: CLEAN, want: [] },
      { key: 'mkdir-outside-lock', source: MKDIR_OUTSIDE, want: ['PWL-MKDIR-OUTSIDE-LOCK'] },
      { key: 'pool-write-elsewhere', source: POOL_WRITE_ELSEWHERE, want: ['PWL-POOL-WRITE-ELSEWHERE'] },
      { key: 'blind', source: BLIND, want: ['PWL-SCAN-BLIND'] },
      { key: 'wrapped-write', source: WRAPPED_WRITE, want: ['PWL-POOL-WRITE-ELSEWHERE'] },
      { key: 'aliased-write', source: ALIASED_WRITE, want: ['PWL-POOL-WRITE-ELSEWHERE'] },
      { key: 'regex-then-write', source: REGEX_THEN_WRITE, want: ['PWL-POOL-WRITE-ELSEWHERE'] },
      { key: 'division-control', source: DIVISION_CONTROL, want: ['PWL-POOL-WRITE-ELSEWHERE'] },
    ]
    rec.readings.fixtures = fixtures.map((f) => {
      const got = poolWriterFindings({ source: f.source, rel: `fixture:${f.key}` })
      const codes = got.findings.map((x) => x.code)
      return { key: f.key, want: f.want, got: codes, ok: got.ok, sites: got.readings }
    })
    for (let i = 0; i < fixtures.length; i += 1) {
      const row = rec.readings.fixtures[i]
      if (JSON.stringify(row.got) !== JSON.stringify(fixtures[i].want)) {
        push('PWL-FIXTURE', `[①] 合成源码 ${fixtures[i].key} 判成 ${JSON.stringify(row.got)}，期望 ${JSON.stringify(fixtures[i].want)}`
          + ' —— 判据本体不翻面（干净样本必须 0 条，每一刀只翻它自己那一条）')
      }
      if (row.sites.pool_target_lines === undefined || row.sites.raw_mkdir_occurrences === undefined) {
        push('PWL-FIXTURE', `[①] 合成源码 ${fixtures[i].key} 的读数里没有"看到了几处"（pool_target_lines / raw_mkdir_occurrences）—— 瞎子也能报 0 条`)
      }
      // 🔴 掩码器必须自报"我把几段正则当成了代码的形状"（`bug-20261111-01` ②：吞掉代码要留读数）。
      if (!Array.isArray(row.sites.regex_literals)) {
        push('PWL-FIXTURE', `[①] 合成源码 ${fixtures[i].key} 的读数里没有 \`regex_literals\` —— 掩码器吞了什么，读数里看不出来`)
      }
      // 每条写调用都要自报"池子路径是怎么认出来的"（行内 / 别名 / 不是池写），否则折行/别名溜过去没人知道。
      for (const s of row.sites.write_sites ?? []) {
        if (!('pool_via' in s) || !('args_lines' in s)) {
          push('PWL-FIXTURE', `[①] 合成源码 ${fixtures[i].key} 的写调用读数里没有 \`pool_via\` / \`args_lines\`：${JSON.stringify(s)}`
            + ' —— "这条写算不算池写、它跨了几行"必须读得出来')
        }
      }
    }
    // 刀的"只翻自己那一条"是分开判的：上面逐条比的是**完整**码集合，所以多翻也红。
    // 额外一条：`mkdir-outside-lock` 那一份必须点名**函数**与**行号**（红要能落到行上）。
    const mk = rec.readings.fixtures[1]?.got ?? []
    const mkFinding = poolWriterFindings({ source: MKDIR_OUTSIDE, rel: 'fixture:mkdir-outside-lock' }).findings[0] ?? null
    rec.readings.mkdir_finding = mkFinding
    if (mk.includes('PWL-MKDIR-OUTSIDE-LOCK')) {
      if (mkFinding?.line !== 2 || mkFinding?.fn !== 'appendJudgedRows') {
        push('PWL-FIXTURE', `[①] 锁外 mkdir 那一条必须点名 \`appendJudgedRows:2\`，实得 ${JSON.stringify({ line: mkFinding?.line, fn: mkFinding?.fn })} —— 红必须落得到行上`)
      }
    }

    // ── ①′ 折行 / 别名 / 正则那三把刀：红必须落得到行与函数上，读数必须说得出是怎么认出来的 ──
    const poolViaOf = (key) => {
      const got = poolWriterFindings({ source: fixtures.find((f) => f.key === key).source, rel: `fixture:${key}` })
      const finding = got.findings.find((x) => x.code === 'PWL-POOL-WRITE-ELSEWHERE') ?? null
      const site = (got.readings.write_sites ?? []).find((s) => s.writes_pool && s.fn !== 'writePoolRowLocked') ?? null
      return { finding, site, readings: got.readings }
    }
    // 折行：函数必须是 `appendProposal`，而且那一条写调用的**实参区间跨了行**（`args_lines > 1`）。
    const wrapped = poolViaOf('wrapped-write')
    rec.readings.wrapped = { finding: wrapped.finding, site: wrapped.site }
    if (wrapped.finding !== null && wrapped.finding.fn !== 'appendProposal') {
      push('PWL-FIXTURE', `[①′] 折行那一刀必须点名函数 \`appendProposal\`，实得 ${JSON.stringify(wrapped.finding.fn)}`)
    }
    if (wrapped.site === null || !(wrapped.site.args_lines > 1)) {
      push('PWL-FIXTURE', `[①′] 折行那一刀的写调用必须报出"实参跨了行"（\`args_lines > 1\`），实得 ${JSON.stringify(wrapped.site)}`
        + ' —— 折行溜过去，等于这一格只能抓同一行的写法')
    }
    // 别名：认出来的路径必须是"别名"，而且点名那个别名（否则改天别名换了名字，读数也说不清）。
    const aliased = poolViaOf('aliased-write')
    rec.readings.aliased = { finding: aliased.finding, site: aliased.site }
    if (aliased.site === null || !String(aliased.site.pool_via ?? '').startsWith('alias')) {
      push('PWL-FIXTURE', `[①′] 别名那一刀的写调用必须报 \`pool_via\` 以 \`alias\` 开头，实得 ${JSON.stringify(aliased.site?.pool_via ?? null)}`
        + ' —— 别名变量能把池写藏起来，这一格就只认"同一行"')
    }
    if (aliased.site !== null && String(aliased.site.pool_via ?? '').includes('poolFile') === false) {
      push('PWL-FIXTURE', `[①′] 别名那一刀的 \`pool_via\` 必须点名那个别名（\`poolFile\`），实得 ${JSON.stringify(aliased.site.pool_via)}`)
    }
    // 正则：掩码器必须**认出**那一段并留读数；认不出 ⇒ 后文被静默吞掉（这一份正是"假绿"的现场）。
    const regexRow = rec.readings.fixtures.find((r) => r.key === 'regex-then-write')
    rec.readings.regex_knife = {
      regex_literals: regexRow?.sites?.regex_literals ?? null,
      write_sites: regexRow?.sites?.write_sites ?? null,
    }
    if ((regexRow?.sites?.regex_literals ?? []).length !== 2) {
      push('PWL-FIXTURE', `[①′] \`/['"]/\` 那一份的读数里 \`regex_literals\` 必须恰好 2 条（\`=\` 之后一次、\`return\` 之后一次），`
        + `实得 ${JSON.stringify(regexRow?.sites?.regex_literals ?? null)} —— 认不出就会把后文整段吞掉，而读数一点都没变`)
    }
    if ((regexRow?.sites?.write_sites ?? []).filter((s) => s.writes_pool).length !== 2) {
      push('PWL-FIXTURE', `[①′] \`/['"]/\` 那一份里有**两条**池写（掩码器自己在 writer 里一条 + 后文一条），`
        + `实得 ${JSON.stringify((regexRow?.sites?.write_sites ?? []).map((s) => ({ line: s.line, fn: s.fn, writes_pool: s.writes_pool })))}`
        + ' —— 只看见一条，说明后文被那一段正则吞掉了')
    }
    // 阴性对照：除号不许被当成正则（否则同一个吞代码的病从另一边进来）。
    const divisionRow = rec.readings.fixtures.find((r) => r.key === 'division-control')
    if ((divisionRow?.sites?.regex_literals ?? []).length !== 0) {
      push('PWL-FIXTURE', `[①′] 阴性对照 \`total / 2\` 的 \`regex_literals\` 必须是 0，实得 ${JSON.stringify(divisionRow?.sites?.regex_literals ?? null)}`
        + ' —— 把除号当正则会把后文整段吞掉（同一个病的另一面）')
    }

    // ── ② 真源码：`<staged>/lib/proposals.mjs`（**这一格的产品面**）────────────────
    const rel = path.join('lib', 'proposals.mjs')
    const abs = path.join(PATHS.stagedPreset, rel)
    let source = null
    try {
      source = readFileSync(abs, 'utf8')
    } catch (err) {
      push('PWL-SURFACE-MISSING', `盘上没有 ${abs}（${String(err?.code ?? 'THREW')}: ${String(err?.message ?? err)}）—— 这一格判不了`)
    }
    if (source !== null) {
      const real = poolWriterFindings({ source, rel })
      rec.readings.real = { file: abs, ok: real.ok, findings: real.findings, readings: real.readings }
      for (const f of real.findings) push(f.code, `[② ${rel}] ${f.detail}`)
      // 自报"我看到了几处"：真源码里必然有池子路径（它是池子模块）——
      // 看不见 ⇒ 扫描器瞎了（`PWL-SCAN-BLIND` 已经会红；这一条把"看见了但数不对"也钉住）。
      if (real.readings.pool_target_lines === 0) {
        push('PWL-SCAN-BLIND', `[②] ${rel} 里一处 \`poolPath(\` / \`pool.path\` 都没看见 —— 扫描器读错了文件，这一格不许绿`)
      }
      const writeSites = real.readings.write_sites ?? []
      if (writeSites.filter((s) => s.writes_pool).length === 0) {
        push('PWL-SCAN-BLIND', `[②] ${rel} 里没有一处"写池子"的调用被认出来（write_sites=${JSON.stringify(writeSites)}）—— 判据没看见那条写路径`)
      }
    }

    caseFail(problems)
  })
})
