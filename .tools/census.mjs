#!/usr/bin/env node
/**
 * **census —— 概念 → 几处实现**（构案 0001「决议账本三册制」的现状层读数）。**这个文件只做参数与输出**：
 * 概念表怎么读、探针怎么数、`INDEX` 怎么派生，全在 `.tools/lib/决议-ledger.mjs`（两个入口共用那一份；
 * 契约 §3.3 / §5.3 末条：判据与生成器不许各写一份解析器）。
 *
 * 规格：`.team/test/2026-11-12/CONTRACT-构案.md` §3（下称「契约」）。口径的骨架没变：
 *
 * > `count` = 在 `<root>` 下、落在该概念 `扫描` glob 里、且**按该行的「计数口径」**算出来的数。
 *
 * 四条钉死的边界（改这里之前先读契约 §3.2）：
 *   1. **按文件数，不按出现次数** —— 缺省口径 `file`：同一份文件里探针出现两次仍是 1；
 *   2. **`决议/` 下一律不算** —— 概念表自己就含探针字面量，不排除就是自吞（每行天然 +1）；
 *   3. **glob 之外不算** —— 盘上有文件、含探针、但不在 `扫描` 里 ⇒ 不计；
 *   4. **零处 ⇒ 0** —— 概念在表里、今天还没实现，是合法状态（不是缺行、不是 `—`）。
 *
 * 🔴 Gate 4 · M4：「按文件数」只是**四种口径之一**。概念表的第五列可以声明
 *    `file` / `file-code` / `site` / `site-code`（见 `lib/决议-ledger.mjs` 的 `COUNT_RULES`）——
 *    因为探针是子串，命中的天然是"**提到**"，而这一页要回答的是"**几处实现**"。
 *    单位会印在 `INDEX` 的「单位」列与这一页的每一行上：读的人不必回推工具怎么数的。
 *
 * 本脚本的 `problems[]` 只报**概念表本身**的问题（契约 §3.1 的 `CONCEPT-TABLE-*`）——
 * 决议/指针/`INDEX` 那几族是 `决议-check` 的判词，不在这里重复报。
 *
 * 命令（契约 §3.3）：
 *   node .tools/census.mjs [--root=<绝对目录>] [--json] [--concept=<概念>] [--write-index]
 *
 * 退出码：`0` 无问题 · `1` 有 problems · `3` 用法/根不成立。
 * `--write-index` 是**唯一**允许写盘的开关；不开它，本脚本一个字节都不写（契约 §5.4）。
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileAtomic } from '../presets/agenia/lib/atomic.mjs'
import { INDEX_REL, REPO_ROOT, renderIndex, relPosix, scanLedger } from './lib/决议-ledger.mjs'

/**
 * 一次 census 扫描（**不写盘**）。返回 `--json` 那份形状（契约 §3.3）。
 *
 * `concepts[]` 里的每个数都从 `scanLedger` 的派生叶里来 —— 与 `决议-check` 的 ④ **同一个函数**
 * （`deriveIndexRows`），所以"生成器"与"检查器"不会对同一棵树给出两个数、两个「构案」。
 */
export function censusReading(root) {
  const scan = scanLedger(root)
  // `problems[]` 只报**概念表本身**（含允许清单第二张表）的问题；决议/指针/`INDEX` 那几族是 `决议-check` 的判词。
  const problems = [...scan.table.problems, ...(scan.table.allowlist_problems ?? []), ...(scan.shapeProblems ?? [])]
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
    /** 这个扫描面**扫到几份文件**（"0 处"与"没扫到"必须分得开：`scan_empty` 只说是不是一份都没有）。 */
    scanned_files: c.scanned_files ?? null,
    /** 只有按形状那一条口径才有：每一处命中（`{file, line, shape: 'A'|'B'}`）与允许清单条目（它盖住了哪一处）。 */
    sites: c.sites ?? [],
    allowlist: c.allowlist ?? [],
    /** 扫描面里被**排除**的非代码区（`{path, files}`）：切掉了什么必须印出来，否则"没扫到"与"排除掉"分不开。 */
    scan_excluded: c.scan_excluded ?? [],
    decision: c.decision,
    skip_decision: c.skip_decision,
    read_failures: c.read_failures,
  }))
  return {
    ok: problems.length === 0,
    root: path.resolve(root),
    concepts,
    total_concepts: concepts.length,
    total_implementations: concepts.reduce((n, c) => n + c.count, 0),
    problems,
  }
}

/** 人读那一页（契约 §3.3：一行一个概念 + 收口一行）。**单位印在行上**（M4）。 */
export function renderCensusText(reading) {
  const lines = []
  const width = Math.max(0, ...reading.concepts.map((c) => [...c.concept].length))
  const pad = (s) => s + ' '.repeat(Math.max(0, width - [...s].length))
  for (const c of reading.concepts) {
    lines.push(`${String(c.count).padStart(2)}  ${pad(c.concept)}  ${c.unit}  (${c.owner})`)
  }
  lines.push(`census 概念 ${reading.total_concepts} · 实现合计 ${reading.total_implementations}`)
  return `${lines.join('\n')}\n`
}

/**
 * 写 `INDEX.md`（**唯一允许写盘的路径**）。
 *
 * 写盘走**共享原子写**（`presets/agenia/lib/atomic.mjs` 的 `writeFileAtomic`：同目录临时件 →
 * `writeSync` → `fsync` → `rename`）。工具不再自己拼临时名 + `rename`：那个形状在仓库里只许有一份实现
 * （`决议/概念表.md` 的「原子写剩余实现」那一行为此按形状数）。
 * `writeFileAtomic` 按判决风格返回 `{ok, code, …}`、不抛；这里把失败转成异常 —— 本函数的调用方只认"写成/抛"。
 */
export function writeIndex(root, text) {
  const file = path.join(root, INDEX_REL)
  const written = writeFileAtomic(file, text)
  if (!written.ok) throw new Error(`${written.code}：${written.message}`)
  return relPosix(root, file)
}

export function parseArgs(argv) {
  const args = { root: null, json: false, concept: null, writeIndex: false, bad: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--json') args.json = true
    else if (a === '--write-index') args.writeIndex = true
    else if (a.startsWith('--root=')) args.root = a.slice('--root='.length)
    else if (a === '--root') args.root = argv[++i] ?? ''
    else if (a.startsWith('--concept=')) args.concept = a.slice('--concept='.length)
    else if (a === '--concept') args.concept = argv[++i] ?? ''
    else args.bad.push(a)
  }
  return args
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const usage = (msg) => {
    process.stderr.write(`CENSUS-USAGE: ${msg}\n`
      + '  用法：node .tools/census.mjs [--root=<绝对目录>] [--json] [--concept=<概念>] [--write-index]\n')
    process.exit(3)
  }
  if (args.bad.length > 0) usage(`不认识的参数：${JSON.stringify(args.bad)}`)
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
    // 页面用**完整**那次扫描的行（`--concept` 只收窄打印，不收窄页面）
    const full = censusReading(root)
    const rows = full.concepts.map((c) => ({
      concept: c.concept,
      owner: c.owner,
      census: c.count,
      decision: c.decision,
      unit: c.unit,
    }))
    const rel = writeIndex(root, renderIndex(rows))
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
