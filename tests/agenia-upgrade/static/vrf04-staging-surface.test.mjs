/**
 * `VRF-04` · **`F-123`** —— 「打的是哪棵树」必须**逐树枚举**，不是盯一份名单。
 *
 * 病根（盘上现场，2026-10-22）：`tests/agenia-upgrade/support/env.mjs:190` 是
 * `watchedFiles: ['inject.js']` —— 靶子（staged）与现役（活体）两棵树**48 份里只盯 1 份**。
 * 阳性对照：把 `lib/receipt.mjs` 的 `REJECT_REASON_MIN_CHARS` 从 10 改成 999，
 * staging 检查照旧 `state=equal / ok=true`。
 *
 * 判据（七格，全部在**夹具树**上跑 `measureTarget` / `targetVerdict` —— 根可注入，
 * 所以它是同一份量测、不是另写一份；**真 staging / 真活体一个字节都不动**）：
 *   D0 `数据不是漂移` 两棵树只在 `.runtime/` 上不同 ⇒ 必须 `equal`（数据目录排除；否则判据常驻红）
 *   D1 `非 inject.js`  `lib/receipt.mjs` 差一个字符 ⇒ 必须**非 equal** 且点名那份文件 ← **今天红的就是这一格**
 *   D2 `一模一样的树` ⇒ 必须 `equal`（防"永远非 equal"）
 *   D3 `新路径`       两棵树都在同一个**新路径**上新增文件且内容不同 ⇒ 必须非 equal ← **今天红**
 *                     （这一格是"全树枚举"与"名单加长"的分水岭：任何静态名单都过不了它）
 *   D4 `只改 mtime`   内容不变、原地重写一遍 ⇒ 必须 `equal`（身份是字节，不是时间戳）
 *   D5 `零样本`       两棵树都枚举不出普通文件（空目录 / 不存在的 root）⇒ 必须**红**，
 *                     红因点名"零样本 / 没盯任何文件"，且入口那一行**必须自己说**「🔴 零样本」+
 *                     「TARGET-ZERO-SAMPLE」这两个可指认串 ← **`F-128` 这一票**
 *   D6 `单侧空`       只有一侧枚举得出文件 ⇒ 仍走 `TARGET-SURFACE-MISSING`，
 *                     **不许**被 D5 那条顶掉（两种空的红因必须不一样）
 */
import { before, describe, test } from 'node:test'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { measureTarget, targetVerdict } from '../support/target.mjs'
import { fixtureDir, writeUnder } from '../support/verify-recompute.mjs'

before(() => {
  preflight()
})

/** 没有声明文件：任何差额都必须算"未声明"（这一票不测声明的形状，那是 `STAT-01` 的活）。 */
const NO_DECLARATION = { path: '<vrf04 夹具：无声明>', present: false, error: null, value: null }

const PAIR = {
  'inject.js': '// inject.js（夹具）\nexport const INJECT_SCHEMA = 1\n',
  'lib/receipt.mjs': '// lib/receipt.mjs（夹具）\nexport const REJECT_REASON_MIN_CHARS = 10\n',
  'bin/agenia-local.mjs': '// bin/agenia-local.mjs（夹具）\nexport const CLI_NAME = "agenia-local.mjs"\n',
  'agent.cordis.yml': '- id: fixture-composition\n',
}

/** 造一对树：`overrides` 只覆盖指定的那几份（其余逐字节相同）。 */
function buildPair(caseId, purpose, { stagedOverrides = {}, baselineOverrides = {} } = {}) {
  const root = fixtureDir(caseId, purpose)
  const stagedRoot = path.join(root, 'staged')
  const baselineRoot = path.join(root, 'baseline')
  for (const [rel, text] of Object.entries(PAIR)) {
    writeUnder(stagedRoot, rel, rel in stagedOverrides ? stagedOverrides[rel] : text)
    writeUnder(baselineRoot, rel, rel in baselineOverrides ? baselineOverrides[rel] : text)
  }
  return { stagedRoot, baselineRoot }
}

function verdictOf({ stagedRoot, baselineRoot }) {
  const measured = measureTarget({ stagedRoot, baselineRoot })
  return targetVerdict({ measured, declaration: NO_DECLARATION })
}

describe('static · verify-recompute (VRF) · F-123 staging 树覆盖面', () => {
  test('VRF-04 两棵树的差异做在非 inject.js 文件上时，判据必须不报 equal', async () => {
    await runCase('VRF-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── D0 数据不是漂移：只在 .runtime/ 上不同 ⇒ 必须 equal ─────────────
      const d0Pair = buildPair('VRF-04', 'runtime-only')
      writeUnder(d0Pair.stagedRoot, '.runtime/memory/snapshots/v7.json', '{ "entries": [] }\n')
      writeUnder(d0Pair.baselineRoot, '.runtime/memory/snapshots/v7.json', '{ "entries": [{ "id": "x" }], "extra": 1 }\n')
      const d0 = verdictOf(d0Pair)
      rec.readings.d0_data_only = { ok: d0.ok, state: d0.state, line: d0.line, problems: d0.problems }
      if (d0.state !== 'equal' || d0.ok !== true) {
        push('TARGET-DATA-IS-NOT-DRIFT', `两棵树只在 \`.runtime/\` 上不同（数据目录：真实记忆库本来就不该同步进靶子）⇒ 判据必须报 equal，实得 state=${d0.state} / ok=${d0.ok}；红因 ${JSON.stringify(d0.problems.map((p) => p.code))} —— 这一格红了就是**常驻红**，比漏判更糟：判据会天天喊狼来了`)
      }

      // ── D1 差异做在 lib/receipt.mjs 上 ⇒ 必须非 equal 且点名那份文件 ────
      const d1Pair = buildPair('VRF-04', 'receipt-diff', {
        baselineOverrides: { 'lib/receipt.mjs': PAIR['lib/receipt.mjs'].replace('= 10', '= 999') },
      })
      const d1 = verdictOf(d1Pair)
      rec.readings.d1_receipt_diff = { ok: d1.ok, state: d1.state, line: d1.line, problems: d1.problems }
      if (d1.state === 'equal') {
        push('TARGET-ONLY-INJECTOR', `staged 与活体在 \`lib/receipt.mjs\` 上差一个字符（\`REJECT_REASON_MIN_CHARS\` 10 → 999），判据却报 state=equal / ok=${d1.ok} —— 它只盯 \`FROZEN.targetLag.watchedFiles\` 里那一份 \`inject.js\`（现役 48 份代码里的 1 份）`)
      } else if (d1.ok !== false) {
        push('TARGET-ONLY-INJECTOR', `差异被看见了（state=${d1.state}）但没有声明 ⇒ ok 必须 false，实得 ok=${d1.ok}`)
      }
      if (!d1.problems.some((p) => String(p.message).includes('lib/receipt.mjs'))) {
        push('TARGET-NAMING', `红因里必须**点名**那份文件（\`lib/receipt.mjs\`），否则读的人不知道去比哪两棵树：实得 ${JSON.stringify(d1.problems.map((p) => p.message)).slice(0, 400)}`)
      }

      // ── D2 一模一样的树 ⇒ 必须 equal（防"永远非 equal"）────────────────
      const d2Pair = buildPair('VRF-04', 'identical')
      const d2 = verdictOf(d2Pair)
      rec.readings.d2_identical = { ok: d2.ok, state: d2.state, line: d2.line }
      if (d2.state !== 'equal' || d2.ok !== true) {
        push('TARGET-NEVER-EQUAL', `两棵树逐字节相同 ⇒ 判据必须报 equal，实得 state=${d2.state} / ok=${d2.ok}；红因 ${JSON.stringify(d2.problems.map((p) => p.code))}`)
      }

      // ── D3 同一个**新路径**上新增文件且内容不同 ⇒ 必须非 equal ──────────
      const d3Pair = buildPair('VRF-04', 'new-path')
      writeUnder(d3Pair.stagedRoot, 'tools/new-thing.mjs', '// tool（staged 那一版）\nexport const NEW_THING = 1\n')
      writeUnder(d3Pair.baselineRoot, 'tools/new-thing.mjs', '// tool（活体那一版）\nexport const NEW_THING = 2\n')
      const d3 = verdictOf(d3Pair)
      rec.readings.d3_new_path = { ok: d3.ok, state: d3.state, line: d3.line, problems: d3.problems }
      if (d3.state === 'equal') {
        push('TARGET-WHITELIST-ROTS', `两棵树在**同一个新路径**（\`tools/new-thing.mjs\`）上都有文件、内容不同，判据却报 equal —— 说明它比的是"名单"不是"树"。名单会腐烂：加一份合法的新文件它永远是绿的；这一格就是"全树枚举"与"名单加长"的分水岭`)
      }

      // ── D4 只改 mtime（内容逐字节不变）⇒ 必须 equal ────────────────────
      const d4Pair = buildPair('VRF-04', 'touch-only')
      const d4Before = verdictOf(d4Pair)
      const touched = path.join(d4Pair.stagedRoot, 'inject.js')
      writeFileSync(touched, PAIR['inject.js'], 'utf8')
      const d4After = verdictOf(d4Pair)
      rec.readings.d4_touch = { before: d4Before.state, after: d4After.state, ok: d4After.ok }
      if (d4After.state !== 'equal') {
        push('TARGET-MTIME', `内容逐字节不变、只把 \`inject.js\` 原地重写了一遍（mtime 变了）⇒ 判据必须仍报 equal，实得 state=${d4After.state}；身份是**字节**，不是时间戳`)
      }

      // ── D5 零样本：两棵树都枚举不出普通文件 ⇒ 必须**红**（`F-128`）────────
      //    逐文件对账是个 `for (const a of actuals)`：`actuals` 空 ⇒ 一圈都不跑 ⇒ `problems` 空
      //    ⇒ `ok = true`、`state = 'equal'`、入口行说「这一行不算证据」却照样 `exit 0`。
      //    "没东西可判"与"都判过了"于是长得一模一样。两种造法各测一次（根在 / 根都不在）。
      const d5 = []
      for (const [label, stagedRoot, baselineRoot] of [
        ['两个空目录', fixtureDir('VRF-04', 'zero-sample-staged'), fixtureDir('VRF-04', 'zero-sample-baseline')],
        ['两个不存在的 root', path.join(fixtureDir('VRF-04', 'zero-sample-missing'), 'no-staged'), path.join(fixtureDir('VRF-04', 'zero-sample-missing'), 'no-baseline')],
      ]) {
        const measured = measureTarget({ stagedRoot, baselineRoot })
        const z = targetVerdict({ measured, declaration: NO_DECLARATION })
        d5.push({ label, files: measured.files.length, ok: z.ok, state: z.state, line: z.line, problems: z.problems })
        // 夹具自证：这一格之所以红，必须是因为"没样本"，不是因为夹具里恰好有文件。
        if (measured.files.length !== 0) {
          push('TARGET-FIXTURE-NOT-EMPTY', `D5「${label}」的夹具本该一个普通文件都没有，实测枚举出 ${measured.files.length} 份 —— 这一格的红就不是"零样本"那条了`)
          continue
        }
        if (z.ok !== false) {
          push('TARGET-ZERO-SAMPLE-GREEN', `D5「${label}」：两棵树都枚举不出普通文件（零样本）⇒ 判据必须报红，实得 ok=${z.ok} / state=${z.state} —— 逐文件对账一圈没跑，却和"都判过了"长得一样`)
        }
        if (!z.problems.some((p) => p.code === 'TARGET-ZERO-SAMPLE')) {
          push('TARGET-ZERO-SAMPLE-UNNAMED', `D5「${label}」：红因里必须有一条 \`TARGET-ZERO-SAMPLE\`（判据没盯任何文件），实得 ${JSON.stringify(z.problems.map((p) => p.code))}`)
        }
        if (!z.problems.some((p) => String(p.message).includes('零样本'))) {
          push('TARGET-ZERO-SAMPLE-UNNAMED', `D5「${label}」：红因必须**点名"零样本"**，实得 ${JSON.stringify(z.problems.map((p) => p.message)).slice(0, 400)}`)
        }
        // 🔴 入口那一行必须是**肯定式**：零样本时它**自己**要说"零样本"、要给出那个码。
        // 否定式（"不许含 `靶子=现役`" / `state === 'equal'`）在这条通道上**没有翻面能力**：
        // 未修的那一版印的是「判据没盯任何文件…… 这一行不算证据」，它两个子句都是 false ⇒ 本来就过得了；
        // 而 `state` 在零样本下一律是 `stale`（`target.mjs`：`ok=false` ⇒ `stale`），那个子句永远够不到。
        // 所以这一格只钉一样东西：**这一行里有没有那两个可指认串**。退回旧写法 ⇒ 这里当场红。
        const lineNamesZeroSample = z.line.includes('🔴 零样本') && z.line.includes('TARGET-ZERO-SAMPLE')
        if (!lineNamesZeroSample) {
          push('TARGET-ZERO-SAMPLE-LINE', `D5「${label}」：零样本时入口那一行**必须**含「🔴 零样本」与「TARGET-ZERO-SAMPLE」两个可指认串（一个说给人读的结论、一个指回 \`problems[].code\`），实得 line=${JSON.stringify(z.line)} —— 退回旧写法（"这一行不算证据"）时这一条必须红`)
        }
      }
      rec.readings.d5_zero_sample = d5

      // ── D6 相邻情形：**只有一侧**空 ⇒ 仍走 TARGET-SURFACE-MISSING ──────────
      //    这一步是"新判据别顶掉旧判据"：staged 空、现役那棵树（只读）48 份 ⇒ 每一份都是
      //    "靶子里没有这份文件"，那是**单侧空**，不是"两棵树都枚举不出" ⇒ 两种空的红因必须不一样。
      const d6Measured = measureTarget({ stagedRoot: fixtureDir('VRF-04', 'one-side-staged'), baselineRoot: PATHS.finalPreset })
      const d6 = targetVerdict({ measured: d6Measured, declaration: NO_DECLARATION })
      rec.readings.d6_one_side_empty = {
        baseline_files: d6Measured.baseline_files,
        actuals: d6.actuals.length,
        ok: d6.ok,
        state: d6.state,
        line: d6.line,
        codes: [...new Set(d6.problems.map((p) => p.code))],
        first_problem: d6.problems[0]?.message,
      }
      if (d6Measured.files.length === 0) {
        push('TARGET-FIXTURE-NOT-EMPTY', 'D6 的夹具本该"现役有文件、staged 空"，实测两边都空 —— 这一格测不到"单侧空"')
      } else if (d6.ok !== false) {
        push('TARGET-ONE-SIDE-GREEN', `D6：staged 空 / 现役 ${d6Measured.baseline_files} 份 ⇒ 每一份都量不到，判据必须报红，实得 ok=${d6.ok}`)
      }
      if (!d6.problems.some((p) => p.code === 'TARGET-SURFACE-MISSING')) {
        push('TARGET-ONE-SIDE-CODE', `D6：单侧空必须仍报 \`TARGET-SURFACE-MISSING\`（逐文件对账那条判据一条不动），实得 ${JSON.stringify([...new Set(d6.problems.map((p) => p.code))])}`)
      }
      if (d6.problems.some((p) => p.code === 'TARGET-ZERO-SAMPLE')) {
        push('TARGET-ONE-SIDE-HIJACKED', 'D6：单侧空被零样本那条顶掉了 —— 两条红因必须分得开（双侧空 = 判据没样本；单侧空 = 这一份量不到），混成一条，读的人就不知道该去补哪一边')
      }
      // 两种空的红因**不一样**（这一条是"分得开"的直接断言，不是靠上面两条加起来推的）。
      const d5Codes = [...new Set(d5.flatMap((x) => x.problems.map((p) => p.code)))].sort()
      const d6Codes = [...new Set(d6.problems.map((p) => p.code))].sort()
      if (JSON.stringify(d5Codes) === JSON.stringify(d6Codes)) {
        push('TARGET-EMPTY-INDISTINCT', `D6：双侧空与单侧空的红因码一模一样（${JSON.stringify(d5Codes)}）—— 读的人分不出"判据没样本"和"某一侧那份文件量不到"`)
      }

      // ── 读数：现役那两棵真树"今天差多少"（只读，一个字节都不动）────────
      try {
        const real = targetVerdict({ measured: measureTarget({ stagedRoot: undefined, baselineRoot: undefined }), declaration: NO_DECLARATION })
        rec.readings.real_pair = {
          state: real.state, ok: real.ok,
          actuals: real.actuals.map((a) => ({ file: a.file, state: a.state, lag_bytes: a.lag_bytes })),
          judging_files: real.actuals.length,
        }
      } catch (err) {
        rec.readings.real_pair = { error: String(err?.message ?? err).slice(0, 240) }
      }

      caseFail(problems)
    })
  })
})
