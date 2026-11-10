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
 * ## 刀（三把合成源码 + 一把真源码）
 *   · 干净样本 ⇒ 0 条（判据可满足）；
 *   · 锁外 `mkdirSync`（形状照 `appendJudgedRows`）⇒ **只**红 ①；
 *   · `writeFileAtomic(pool.path, …)` 放进另一个函数 ⇒ **只**红 ②；
 *   · 一份没有 `poolPath(` 的源码 ⇒ **只**红 ③；
 *   · 真 `lib/proposals.mjs` ⇒ 真读数（今天它红，见下面的读数）。
 *
 * ## 预期红（写这一格时的事实，**不是**回归）
 * 真源码里还有一处 `mkdirSync`：`appendJudgedRows`（在 judged 锁**之前**建目录）。
 * 那是组长登记的 `bug-20261110-10`：这一格按"宽口径"要求写成能抓它的形状，所以**它红是对的**。
 * 那一行修掉（交给 `writeFileAtomic` 建目录）之后本格即绿。
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

    // ── ① 判据本体：三份合成源码各切一刀（+ 干净样本当阳性对照）───────────────
    const fixtures = [
      { key: 'clean', source: CLEAN, want: [] },
      { key: 'mkdir-outside-lock', source: MKDIR_OUTSIDE, want: ['PWL-MKDIR-OUTSIDE-LOCK'] },
      { key: 'pool-write-elsewhere', source: POOL_WRITE_ELSEWHERE, want: ['PWL-POOL-WRITE-ELSEWHERE'] },
      { key: 'blind', source: BLIND, want: ['PWL-SCAN-BLIND'] },
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
