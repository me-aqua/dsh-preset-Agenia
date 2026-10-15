/**
 * ENV-02 —— 静态扫描：受控路径层面的"临时件 / C 盘 / 真实根 / 删除 / 生成器禁忌"。
 *
 * 冻结依据：契约 §6.12 ENV-02 + **裁定 A11**（任何代码/测试都不许 `import`
 * `.tools/make-bundle-patch.mjs` —— 它加载期就跑 `build()`，会直接写活体 `cordis.patch.yml`）。
 *
 * ⚠️ **诚实边界**（契约 ENV-02 自己写的）：这是**受控路径层面的静态证明**，
 *    不是全机监控；它证明不了"系统上任何进程都没写 C 盘"。
 *
 * 自控（防"扫描器哑了还报绿"）：五条规则先在一份**故意违规的样例**上跑一遍 —— 五条都必须命中；
 * 任何一条没命中，这次"干净"的结论就不成立（契约 §9.5 第 1 条：判据要会翻面）。
 *
 * ⚠️ 样例里的那些违规写法是**拆开拼**的（`j(...)`）—— 不拆的话，扫描器会扫到**我自己这份源码**
 *    并报假阳性。别"顺手"把它们写成整串，那会把这条自控变成一条噪声。
 */
import { before, describe, test } from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings } from '../support/evidence.mjs'
import { stagingExists, stagingPath } from '../support/sut.mjs'

before(() => {
  preflight()
})

/** 递归列出目录下的目标扩展名文件。 */
function walkFiles(root, exts) {
  const out = []
  const go = (dir) => {
    let names = []
    try { names = readdirSync(dir).sort() } catch { return }
    for (const name of names) {
      const full = path.join(dir, name)
      let st = null
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) go(full)
      else if (st.isFile() && exts.some((e) => name.endsWith(e))) out.push(full)
    }
  }
  go(root)
  return out
}

/**
 * 注释行判定 —— 五条规则共用。
 * ⚠️ 必须含 `/**`：单行 JSDoc（`/** … *​/`）不以 `//` 开头、也不以 `*` 开头，
 *    第一版漏了它 ⇒ `root-guard.mjs` 里那句"`C:/…` 也算绝对路径"的**说明文字**被扫成了违规。
 */
const isCommentLine = (line) => /^\s*(\/\/|\/\*|\*|#)/.test(line)

/**
 * "**检查别人的文本**"那一类行 —— 五条规则共用，判到就跳过。
 * 判据：这一行在做 `/\…/.test(…)` / `new RegExp(…)` / `includes(…)` / `.match(…)`，
 * 也就是它在**读别的字符串**，不是在给自己兜底、也不是在写盘。
 * 来历：批次 E/F 里踩到两次 —— 测试自己写"扫别人代码"的规则时，规则里的 `tmpdir()`、`.runtime`
 * 被同一条扫描器当成了违规。⚠️ 这不是放行通道：真违规不会长在 `.test(...)` 调用里，
 * 而且扫描器自控仍要求五条规则在违规样例上**全部命中**。
 */
const isInspectionLine = (line) => /(\.test\s*\(|new RegExp\(|includes\s*\(|\.match\s*\()/.test(line)

/** 一条规则 = 一个纯函数：`(rel, text) => 命中清单`。 */
const RULES = [
  {
    id: 'TEMP-DEFAULT',
    why: '未显式指定落点的临时目录（默认 %TEMP% 在 C 盘 —— 全组最容易漏的一处）',
    scan(rel, text) {
      const out = []
      text.split(/\r?\n/).forEach((line, i) => {
        if (isCommentLine(line)) return
        if (isInspectionLine(line)) return // 这一行在读别人的文本（扫别人代码的规则自己）
        // 只认"真的在用临时目录"的三种形状。
        // ⚠️ 曾经把 `%TEMP%` 单独当命中 ⇒ 把**这条规则自己的说明文字**也扫成了违规（假阳性）。
        if (/tmpdir\s*\(/.test(line) && !/dir\s*:/.test(line)) out.push({ line: i + 1, text: line.trim().slice(0, 140) })
        else if (/mkdtemp\s*\(/.test(line) && !/(join|resolve)\s*\(/.test(line)) out.push({ line: i + 1, text: line.trim().slice(0, 140) })
        else if (/(\$env:TEMP|%TEMP%)\s*=/.test(line)) out.push({ line: i + 1, text: line.trim().slice(0, 140) })
      })
      return out
    },
  },
  {
    id: 'C-DRIVE',
    why: '硬编码的 C 盘路径（跳过注释行；"解释器"与"负例输入"两类显式豁免，豁免项记进读数）',
    scan(rel, text) {
      const out = []
      text.split(/\r?\n/).forEach((line, i) => {
        if (isCommentLine(line)) return // 注释不写盘
        if (isInspectionLine(line)) return // 这一行在读别人的文本
        // 豁免一：解释器路径（AGENTS.local §七 那只 node 是冻结值，不是可写落点）
        // 豁免二：**负例输入**（喂给被测对象、期望被拒的路径 —— 它不是本代码要写的地方）。
        //         标记词必须**写在那一行上**（reject / 负例 / 非法 / 姿势 / 期望错误码 E_ROOT_C_DRIVE 之类），
        //         而且豁免项一律记进读数（`test_exemptions`）—— 不许悄悄放过。
        if (/\breject\b|负例|非法|姿势|posture|fixture|expect\s*:|E_ROOT_C_DRIVE/.test(line)) {
          const exempt = line.match(/['"`]C:[\\/][^'"`]*['"`]/gi) ?? []
          for (const e of exempt) out.push({ line: i + 1, exempt: true, text: e.slice(0, 140) })
          return
        }
        const hits = line.match(/['"`]C:[\\/][^'"`]*['"`]/gi) ?? []
        for (const h of hits) {
          if (/\.exe['"`]$/i.test(h)) { out.push({ line: i + 1, exempt: true, text: h.slice(0, 140) }); continue }
          out.push({ line: i + 1, exempt: false, text: h.slice(0, 140) })
        }
      })
      return out
    },
  },
  {
    id: 'REAL-ROOT-DEFAULT',
    why: '把真实脑根/真实路线当**默认值**（兜底写法 `?? realRoot` / `|| realRoot` / `default: realRoot`）',
    scan(rel, text) {
      const out = []
      text.split(/\r?\n/).forEach((line, i) => {
        if (isCommentLine(line)) return
        if (isInspectionLine(line)) return // 这一行在读别人的文本（例如检查 .gitignore 里有没有那一行）
        if (!/presets[\\/]agenia[\\/]\.runtime|\.team[\\/]route/.test(line)) return
        if (/\?\?|\|\||default\s*[:=]/.test(line)) out.push({ line: i + 1, text: line.trim().slice(0, 140) })
      })
      return out
    },
  },
  {
    id: 'DELETE-NO-MARKER',
    why: '删除/递归操作前没有 marker/落点校验（契约 §2.5：先解析绝对路径 → 校验 marker → 校验在 RUN_ID 之下）',
    scan(rel, text) {
      const out = []
      const lines = text.split(/\r?\n/)
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return
        if (!/rmSync\s*\(|rmdirSync\s*\(|rm\s+-rf|Remove-Item\s+.*-Recurse/i.test(line)) return
        const window = lines.slice(Math.max(0, i - 12), i + 3).join('\n')
        if (!/assertDeletable|TEST_ROOT_MARKER|agenia-test-root|marker/i.test(window)) out.push({ line: i + 1, text: line.trim().slice(0, 140) })
      })
      return out
    },
  },
  {
    id: 'GENERATOR-IMPORT',
    why: '裁定 A11：不许 import `.tools/make-bundle-patch.mjs` —— 它加载期就跑 build()，会 writeFileSync 活体的 cordis.patch.yml',
    scan(rel, text) {
      const out = []
      text.split(/\r?\n/).forEach((line, i) => {
        if (isCommentLine(line)) return // 注释里提到它（解释为什么禁用）是允许的
        // 只认**真的 import/require 语句**。⚠️ 曾经按"这一行出现 make-bundle-patch"判 ⇒
        // 把这条规则自己的 why 文字与它自己的正则字面量都扫成了违规（两个假阳性，跑出来才发现）。
        if (!/(?:^|[\s;{(])(?:import|require)\s*[({'"]/.test(line)) return
        if (!/make-bundle-patch/.test(line)) return
        out.push({ line: i + 1, text: line.trim().slice(0, 140) })
      })
      return out
    },
  },
]

function scanSources(sources) {
  const findings = []
  for (const src of sources) {
    for (const rule of RULES) {
      for (const hit of rule.scan(src.rel, src.text)) findings.push({ rule: rule.id, file: src.rel, ...hit })
    }
  }
  return findings
}

/** 命中的分账：豁免项**明写在读数里**（不是悄悄放过）。 */
export function splitFindings(findings) {
  return {
    problems: findings.filter((f) => f.exempt !== true),
    exemptions: findings.filter((f) => f.exempt === true),
  }
}

/** 拆开拼（原因见文件头）。 */
const j = (...parts) => parts.join('')
/** 故意违规的样例：五条规则各命中一次。 */
const SAMPLE = [
  j('import { ', 'os', " } from 'node:os'"),
  j('const d = os.', 'tmp', "dir()"),
  j("const p = 'C", ':', "\\\\Temp\\\\out.json'"),
  // ⚠️ 这里必须拼出**一个**反斜杠（`\.runtime`）—— 拼成两个反斜杠的话，REAL-ROOT-DEFAULT 那条规则
  //    在样例上不会命中，自控会当场报"扫描器是哑的"（跑了两轮才拼对，读数留在红基线里）。
  j("const root = opts.dataRoot ?? 'E:\\Harness\\presets\\agenia", '\\.runtime', "'"),
  j('rm', 'Sync(target, { recursive: true, force: true })'),
  j("import { build } from '../../.tools/make-", 'bundle-patch.mjs', "'"),
].join('\n')

describe('static · env-scan (ENV-02)', () => {
  test('ENV-02 静态扫描：临时件/C 盘/真实根/删除/生成器禁忌（含扫描器自控）', async () => {
    await runCase('ENV-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ── ⓪ 自控：五条规则在违规样例上必须全部命中 ───────────────────────
      const control = scanSources([{ rel: '<self-control-sample>', text: SAMPLE }])
      const controlRules = [...new Set(control.map((f) => f.rule))].sort()
      rec.readings.self_control = { expected: RULES.map((r) => r.id).sort(), got: controlRules, findings: control }
      const missingRules = RULES.map((r) => r.id).filter((id) => !controlRules.includes(id))
      if (missingRules.length > 0) {
        push('SCANNER-CONTROL', `扫描器自控失败：故意违规的样例里这几条规则没命中 ${missingRules.join(', ')} —— 这次"没命中"的结论不成立`)
      }

      // ── ① 测试自己的源码（今天就存在 ⇒ 必须干净）──────────────────────
      const testsRoot = path.join(PATHS.repo, 'tests')
      const testFiles = walkFiles(testsRoot, ['.mjs', '.js', '.ps1'])
      rec.readings.scanned_tests_files = testFiles.map((f) => path.relative(PATHS.repo, f).replace(/\\/g, '/'))
      const testSplit = splitFindings(scanSources(testFiles.map((f) => ({ rel: path.relative(PATHS.repo, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }))))
      rec.readings.test_findings = testSplit.problems
      rec.readings.test_exemptions = testSplit.exemptions
      for (const f of testSplit.problems) {
        push('ENV-SCAN', `${f.file}:${f.line} 命中 ${f.rule}（${RULES.find((r) => r.id === f.rule).why}）：${f.text}`)
      }
      if (testFiles.length === 0) push('ENV-SCAN-COVERAGE', '一个测试文件都没扫到 —— 扫描范围是空的，这个"干净"没有意义')

      // ── ② staged 实现（bin/ + lib/）：不在盘 ⇒ RED-SURFACE ─────────────
      const stagedFiles = []
      for (const rel of ['bin', 'lib']) {
        if (!stagingExists(rel)) continue
        stagedFiles.push(...walkFiles(stagingPath(rel), ['.mjs', '.js']))
      }
      rec.readings.scanned_staged_files = stagedFiles.map((f) => path.relative(stagingPath('.'), f).replace(/\\/g, '/'))
      if (!stagingExists('bin') && !stagingExists('lib')) {
        push('SUT-SURFACE-MISSING', 'staged 还没有 bin/ 与 lib/ —— 实现侧的静态扫描无从做起（预期的首跑红）')
      } else {
        const stagedSources = stagedFiles.map((f) => ({ rel: path.relative(stagingPath('.'), f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }))
        const stagedSplit = splitFindings(scanSources(stagedSources))
        rec.readings.staged_findings = stagedSplit.problems
        rec.readings.staged_exemptions = stagedSplit.exemptions
        for (const f of stagedSplit.problems) {
          push('ENV-SCAN', `staged/${f.file}:${f.line} 命中 ${f.rule}（${RULES.find((r) => r.id === f.rule).why}）：${f.text}`)
        }
        if (stagedSources.length === 0) push('ENV-SCAN-COVERAGE', 'bin/ 与 lib/ 在盘上但一个脚本都没扫到')
        // 回滚脚本必须单文件自足（拍板 Q6）：不许出现 import
        const rollback = stagedSources.find((s) => s.rel.endsWith('rollback.mjs'))
        if (rollback && /^\s*import\s/m.test(rollback.text)) {
          push('ROLLBACK-IMPORT', `staged/${rollback.rel} 里有 import —— 拍板 Q6 冻结为"单文件自足、零 import"（宁可重复三个小工具，也不让回滚依赖新代码）`)
        }
      }

      // ── ③ 受控路径读数（守卫已在预检里强制 E 盘）──────────────────────
      rec.readings.controlled_paths = {
        run_root: process.env.AGENIA_TEST_RUN_ROOT ?? null,
        temp: process.env.TEMP ?? null,
        tmp: process.env.TMP ?? null,
        data_root: process.env.AGENIA_TEST_DATA_ROOT ?? null,
        workspace: process.env.AGENIA_TEST_WORKSPACE ?? null,
      }
      rec.readings.caveat = { note: '受控路径层面的静态证明；不是全机监控（契约 §11.4 第 2 条）' }

      caseFail(problems)
    })
  })
})
