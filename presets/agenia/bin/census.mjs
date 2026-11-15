#!/usr/bin/env node
/**
 * **census —— 概念 → 几处实现**（构案 0001「决议账本三册制」的现状层读数）。**这个文件只做参数与输出**：
 * 概念表怎么读、探针怎么数、派生页怎么渲染，全在 `../lib/决议-ledger.mjs`
 * （`决议-check` 与 `census` 共用那一份；契约 §5.3 末条：判据与生成器不许各写一份解析器）。
 *
 * `count` = 在 `<root>` 下、落在该概念 `扫描` glob 里、且**按该行的「计数口径」**算出来的数。
 *
 * 四条钉死的边界：
 *   1. **按文件数，不按出现次数** —— 缺省口径 `file`：同一份文件里探针出现两次仍是 1；
 *   2. **`账本/` 下一律不算** —— 概念表自己就含探针字面量，不排除就是自吞（每行天然 +1）；
 *   3. **glob 之外不算** —— 盘上有文件、含探针、但不在 `扫描` 里 ⇒ 不计；
 *   4. **零处 ⇒ 0** —— 概念在表里、今天还没实现，是合法状态（不是缺行、不是 `—`）。
 *
 * `--write-index` 写的是**构案册那张派生页**（`账本/构案/INDEX.md`）：它与
 * `决议-check --op index` 走**同一个渲染器**，所以两边写出来的字节必须相同 —— 这一页是
 * "生成器与检查器不分叉"的落点，不是第二条写页的路。
 *
 * 命令：`node presets/agenia/bin/census.mjs [--root=<目录>] [--json] [--concept=<概念>] [--write-index]`
 * 退出码：`0` 无问题 · `1` 有 problems · `3` 用法/根不成立。
 * `--write-index` 是**唯一**允许写盘的开关；不开它，本脚本一个字节都不写。
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileAtomic } from '../lib/atomic.mjs'
import { emit, parseArgs } from '../lib/cli-harness.mjs'
import { BOOKS, INDEX_REL_OF, REPO_ROOT, renderIndexPage, scanLedger } from '../lib/决议-ledger.mjs'

/** 一次 census 扫描（**不写盘**）。返回 `--json` 那份形状。 */
export function censusReading(root) {
  const scan = scanLedger(root)
  const concepts = scan.concepts.map((c) => ({
    concept: c.concept,
    owner: c.owner,
    count: c.census,
    unit: c.unit,
    rule: c.rule,
    implementations: c.implementations,
    files: c.files,
    scan: c.scan,
    scan_empty: c.scan_empty,
    scanned_files: c.scanned_files ?? null,
    sites: c.sites ?? [],
    allowlist: c.allowlist ?? [],
    scan_excluded: c.scan_excluded ?? [],
    decision: c.decision,
    skip_decision: c.decision === null,
    read_failures: c.read_failures,
  }))
  // `problems[]` 只报**概念表本身**的问题；三册结构 / 三条链是 `决议-check` 的判词，不在这里重复报。
  const problems = [...(scan.table?.problems ?? [])]
  return {
    ok: problems.length === 0,
    root: path.resolve(root),
    concepts,
    total_concepts: concepts.length,
    total_implementations: concepts.reduce((n, c) => n + c.count, 0),
    problems,
  }
}

/** 人读那一页（一行一个概念 + 收口一行）。**单位印在行上**。 */
export function renderCensusText(reading) {
  const lines = []
  const width = Math.max(0, ...reading.concepts.map((c) => [...c.concept].length))
  const pad = (s) => s + ' '.repeat(Math.max(0, width - [...s].length))
  for (const c of reading.concepts) lines.push(`${String(c.count).padStart(2)}  ${pad(c.concept)}  ${c.unit}  (${c.owner})`)
  lines.push(`census 概念 ${reading.total_concepts} · 实现合计 ${reading.total_implementations}`)
  return `${lines.join('\n')}\n`
}

export const ARG_SPEC = {
  value: { '--root': 'root', '--concept': 'concept' },
  flag: { '--json': 'json', '--write-index': 'writeIndex' },
}

export function main(argv = process.argv.slice(2)) {
  let args
  try {
    args = parseArgs(argv, ARG_SPEC)
  } catch (err) {
    emit({ ok: false, error: { code: err?.code ?? 'E_ARG_USAGE', message: String(err?.message ?? err), details: err?.details ?? null } })
    process.exit(2)
  }
  const usage = (msg) => {
    process.stderr.write(`CENSUS-USAGE: ${msg}\n`
      + '  用法：node presets/agenia/bin/census.mjs [--root=<目录>] [--json] [--concept=<概念>] [--write-index]\n')
    process.exit(3)
  }
  const root = args.root === null ? REPO_ROOT : path.resolve(args.root)
  let isDirRoot = true
  try {
    isDirRoot = statSync(root).isDirectory()
  } catch {
    isDirRoot = false
  }
  if (!existsSync(root) || !isDirRoot) usage(`--root 不是目录：${root}`)

  const reading = censusReading(root)
  if (args.concept !== null) {
    reading.concepts = reading.concepts.filter((c) => c.concept === args.concept)
    reading.total_concepts = reading.concepts.length
    reading.total_implementations = reading.concepts.reduce((n, c) => n + c.count, 0)
  }

  if (args.writeIndex) {
    if (reading.problems.length > 0) {
      // 概念表坏了就不生成：派生页只能从干净的概念表派生（否则会写出一页错的"现状"）
      if (args.json) process.stdout.write(`${JSON.stringify(reading, null, 2)}\n`)
      else process.stderr.write(`${reading.problems.map((p) => `CENSUS-PROBLEM ${p.code}: ${p.message}`).join('\n')}\n`)
      process.exit(1)
    }
    // 页面用**完整**那次扫描（`--concept` 只收窄打印，不收窄页面），渲染器与 `--op index` 共用
    const full = scanLedger(root)
    if (!BOOKS.includes('构案')) usage('构案册不在这一份实现里 —— 渲染器坏了')
    const rel = INDEX_REL_OF('构案')
    const written = writeFileAtomic(path.join(root, rel), renderIndexPage('构案', { decisions: full.decisions, conceptRows: full.concepts }))
    if (!written.ok) {
      process.stderr.write(`CENSUS-WRITE-FAILED ${written.code}: ${written.message}\n`)
      process.exit(1)
    }
    if (args.json) process.stdout.write(`${JSON.stringify({ ...reading, written: rel }, null, 2)}\n`)
    else process.stdout.write(`${renderCensusText(reading)}INDEX 已生成：${rel}\n`)
    process.exit(0)
  }

  if (args.json) process.stdout.write(`${JSON.stringify(reading, null, 2)}\n`)
  else if (reading.problems.length === 0) process.stdout.write(renderCensusText(reading))
  else process.stderr.write(`${reading.problems.map((p) => `CENSUS-PROBLEM ${p.code}: ${p.message}`).join('\n')}\n`)
  process.exit(reading.problems.length === 0 ? 0 : 1)
}

const invokedDirectly = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()
// 依据: 0012
