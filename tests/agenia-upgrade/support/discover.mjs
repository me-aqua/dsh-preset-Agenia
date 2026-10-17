/**
 * 用例发现器 —— **分母的唯一来源**（F-57）。
 *
 * 分母从哪来：**盘上的 `test('<ID> …')` 有多少个**。不是表里有多少行。
 * 理由：`node --test` 跑的是源码里的那些调用；表只是"登记"，它自己不会因为
 * 盘上多一个文件、少一个文件而变。过去分母是表长 ⇒ 盘上多出来的用例能跑却不进分母，
 * 删掉一个已登记的用例文件时分母静默缩水（两件事都没人喊）。
 *
 * 口径（**唯一一份**，别处不许再写一遍）：
 *   · 根：`<tests>/agenia-upgrade/` 下这四棵 —— `static` / `unit` / `integration` / `report`；
 *     **不含** `support/`（它是工具，不是用例），**不含** 仓库根
 *     （`.team/` 里那份同名证据因此天然不被捡起）。
 *   · 文件：`*.test.mjs`，在每棵根下**递归**（与 `node --test "tests/agenia-upgrade/**\/*.test.mjs"`
 *     的覆盖面同形 —— 跑到的和数到的不许分家）。
 *   · 用例：源码里 `test('<ID> …')` 这一形状的调用，`<ID>` 必须匹配 `^[A-Z]+-\d{2}$`。
 *   · 注释行（`//` / `*` / `/*` 开头）不算 —— 与本项目其余静态判据同口径。
 *
 * 🔴 本模块**不 import 注册表**：发现与登记是两个事实，谁先读谁就造出"唯一来源"的假象。
 *    把两边对起来的是 `consistency()`；它报的每一条都**点名文件与 ID**。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 发现范围（四棵用例根；顺序即报告里的顺序）。 */
export const CASE_ROOTS = ['static', 'unit', 'integration', 'report']
export const CASE_FILE_SUFFIX = '.test.mjs'
/** `test()` 标题里的 ID 形状。 */
export const ID_SHAPE = /^[A-Z]+-\d{2}$/

/**
 * 被发现的树的根：**由本文件的位置推出来**（不写绝对路径）。
 * ⇒ 换机器、clone 一份、或在一份沙盒副本里跑，分母自动跟着那棵树走。
 */
export function testsRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

const isCommentLine = (line) => /^\s*(\/\/|\*|\/\*)/.test(line)
const TEST_CALL = /^\s*test\(\s*(['"`])(.*?)\1/

/** 递归列出 `dir` 下的 `*.test.mjs`（相对 `root` 的 posix 路径，按名字排序 ⇒ 读数可复现）。 */
function listCaseFiles(root, dirName) {
  const out = []
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile() && name.endsWith(CASE_FILE_SUFFIX)) {
        out.push(path.relative(root, full).replace(/\\/g, '/'))
      }
    }
  }
  walk(path.join(root, dirName))
  return out
}

/**
 * 树里**所有** `*.test.mjs`（相对 `root`，含计入口径之外的）。
 * 用途：`node --test "tests/agenia-upgrade/**\/*.test.mjs"` 会跑到的每一个文件，都必须有一个说法 ——
 * 要么计入分母，要么被点名（`DISC-OUT-OF-ROOT`）。
 */
function listAllTestFiles(root) {
  const out = []
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile() && name.endsWith(CASE_FILE_SUFFIX)) out.push(path.relative(root, full).replace(/\\/g, '/'))
    }
  }
  walk(root)
  return out
}

/**
 * 扫一遍盘上，得到分母。
 *
 * @param {{root?: string}} [options]  root 缺省 = 本文件所在的那棵树（`testsRoot()`）
 * @returns {{
 *   root: string, matcher: string, roots: string[],
 *   files: Array<{rel: string, cases: string[]}>,
 *   cases: Array<{id: string, file: string, line: number}>,
 *   ids: string[],
 *   anonymous: Array<{file: string, line: number, title: string}>,
 *   duplicates: Array<{id: string, where: string[]}>,
 *   outOfRoot: string[],
 *   problems: Array<{code: string, message: string, detail?: object}>,
 * }}
 */
export function discoverCases({ root = testsRoot() } = {}) {
  const files = []
  const cases = []
  const anonymous = []
  for (const dirName of CASE_ROOTS) {
    for (const rel of listCaseFiles(root, dirName)) {
      const full = path.join(root, rel)
      const inFile = []
      readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (isCommentLine(line)) return
        const m = TEST_CALL.exec(line)
        if (m === null) return
        const title = m[2].trim()
        const id = title.split(/\s+/)[0]
        if (ID_SHAPE.test(id)) {
          cases.push({ id, file: rel, line: i + 1 })
          inFile.push(id)
        } else {
          // 它会跑，但拿不到 ID ⇒ 不进分母。这种"分母之外的真用例"必须出声（DISC-ANON）。
          anonymous.push({ file: rel, line: i + 1, title: title.slice(0, 80) })
        }
      })
      files.push({ rel, cases: inFile })
    }
  }

  const ids = cases.map((c) => c.id)
  const counts = new Map()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  const duplicates = [...counts]
    .filter(([, n]) => n > 1)
    .map(([id]) => ({ id, where: cases.filter((c) => c.id === id).map((c) => `${c.file}:${c.line}`) }))

  const problems = []
  for (const d of duplicates) {
    problems.push({ code: 'DISC-DUP', message: `同一个 ID 出现在多个 test()：${d.id}（${d.where.join(' · ')}）`, detail: d })
  }
  for (const a of anonymous) {
    problems.push({
      code: 'DISC-ANON',
      message: `${a.file}:${a.line} 的 test() 标题没有 ID 前缀 —— 它会跑、但不进分母（${a.title}）`,
      detail: a,
    })
  }
  // 计入口径之外的文件：跑法的 glob 是 `**`，所以它会跑；不进分母就必须被点名（否则又是一处"跑得到、进不了分母"）。
  const counted = new Set(files.map((f) => f.rel))
  const outOfRoot = listAllTestFiles(root).filter((rel) => !counted.has(rel))
  for (const rel of outOfRoot) {
    problems.push({
      code: 'DISC-OUT-OF-ROOT',
      message: `${rel} 在计入口径之外（只数 ${CASE_ROOTS.join(' / ')} 这四棵）—— 全量 glob 会跑到它，但它不进分母：挪进四棵树之一，或者把它改名成不是 *.test.mjs`,
      detail: { file: rel },
    })
  }

  return {
    root,
    matcher: `{${CASE_ROOTS.join(',')}}/**${CASE_FILE_SUFFIX}`,
    roots: [...CASE_ROOTS],
    files,
    cases,
    ids,
    anonymous,
    duplicates,
    outOfRoot,
    problems,
  }
}

/**
 * 登记 ↔ 发现 的对账。**四个方向都查**，外加冻结清单与"没 ID 的 test()"。
 *
 * 问题码（稳定、可 grep）：
 *   · `DISC-IN-REGISTRY` —— 盘上有、登记里没有（"没登记的文件被 glob 捡起来"）
 *   · `DISC-ON-DISK`     —— 登记里有、盘上没有（"表写 N 条、盘上其实少了"）
 *   · `DISC-FILE`        —— 同一 ID 两处登记不同文件（表说 A 文件、盘上在 B 文件）
 *   · `DISC-FROZEN`      —— 冻结清单里的 ID 从登记表里消失了（一条都不许少）
 *
 * @param {{registry: Array<{id: string, file?: string}>, discovery: object, frozenIds?: string[]}} input
 * @returns {{ok: boolean, problems: Array<{code: string, message: string, detail?: object}>}}
 */
export function consistency({ registry, discovery, frozenIds = [] }) {
  const problems = []
  const reg = new Map(registry.map((r) => [r.id, r]))
  const disk = new Map(discovery.cases.map((c) => [c.id, c]))
  for (const c of discovery.cases) {
    const r = reg.get(c.id)
    if (r === undefined) {
      problems.push({
        code: 'DISC-IN-REGISTRY',
        message: `盘上有、登记里没有：${c.id}（${c.file}:${c.line}）—— 它会跑、也计入分母，而表里没有它`,
        detail: { id: c.id, file: c.file, line: c.line },
      })
    } else if (r.file !== c.file) {
      problems.push({
        code: 'DISC-FILE',
        message: `同一 ID 两处登记不同文件：${c.id}（表=${r.file} · 盘=${c.file}）`,
        detail: { id: c.id, registry_file: r.file, disk_file: c.file },
      })
    }
  }
  for (const r of registry) {
    if (!disk.has(r.id)) {
      problems.push({
        code: 'DISC-ON-DISK',
        message: `登记里有、盘上没有：${r.id}（表=${r.file}）—— 分母会静默缩水，而报告照写"分母 N"`,
        detail: { id: r.id, file: r.file },
      })
    }
  }
  for (const id of frozenIds) {
    if (!reg.has(id)) {
      problems.push({ code: 'DISC-FROZEN', message: `冻结 ID 从登记表里消失了：${id}（冻结清单一条不许少）`, detail: { id } })
    }
  }
  return { ok: problems.length === 0, problems }
}
