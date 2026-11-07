/**
 * `MCR-05` · **`bug-20261107-02`** —— 两个树读者对"**读不到**"必须说同一句话。
 *
 * 病根（技术评审 2026-11-06 `F4`）：`support/target.mjs::walkTree`（靶子过期判据）遇到读不动的子树 /
 * 单文件**静默丢掉**；`support/evidence.mjs::stagedVsLiveDrift`（`STAT-01` 的两棵树比）**直接抛**。
 * 同一条深度规则、同一份数据段来源，**对失败却有两种形态** ⇒ 注释里承诺的 `missing_*` 报不出
 * 枚举阶段已经丢掉的东西：「读不到」与「那里没有」长得一样。
 *
 * 修法（本批）：两个读者都从 `support/tree-read.mjs` 取同一个形状
 * `{rel, kind: 'dir'|'stat'|'file', code, message}`，折成同一组字段（`read_failures` /
 * `missing_dirs` / `missing_files` / `missing_paths` / `read_ok`）；读者自己把失败**报出去**
 * （`targetVerdict` ⇒ `TARGET-READ-FAILED`；`stagedVsLiveDrift` ⇒ `same:false`）。
 *
 * 判据（四格，一格一条）：
 *   ① **真现场**：一棵树里放一个**悬空 junction**（`stat` ⇒ ENOENT、`readdir` ⇒ ENOENT）——
 *      两个读者**都不许抛**，且都必须点名 `a/ghost`（同一个 `rel`、同一个 `code`）；
 *   ② **判决真的出去了**：`targetVerdict` 的红因里必须有 `TARGET-READ-FAILED` 且报文点名那条路径；
 *      `stagedVsLiveDrift.same` 必为 `false`（"有一块我没看见"不是"没发现差异"）；
 *   ③ **"读不到" ≠ "那里没有"**：把一条**真的少了的文件**与那条悬空链接分开 —— 少了的那份进
 *      `only_staged/only_live`，读不到的那条进 `read_failures`，两者**不互相顶替**；
 *   ④ **不是空样本**：干净的一对树 ⇒ 两个读者 `read_ok:true`、`missing_*` 空、`same:true`、
 *      `targetVerdict.ok:true`（这一格两边都翻得动）。
 *
 * 刀（退化刀，两条 —— 它们就是"回退会是什么样"）：
 *   · `measureTarget({..., onReadError:'drop'})` ⇒ **旧的静默形态**：`read_ok:true`、`missing_*` 空、
 *     枚举份数变短；这一刀不咬 ⇒ `KNIFE-NO-BITE`（说明"记录失败"那一条不是判据给的红）。
 *   · `stagedVsLiveDrift(..., {onReadError:'throw'})` ⇒ **旧的抛形态**：必须抛出 `ENOENT`；
 *     不抛 ⇒ `KNIFE-NO-BITE`。
 *
 * 🔴 覆盖边界（这一格**不判**什么）：
 *   · 不判"那个路径该不该在"（悬空链接是**夹具**，不是被测对象的缺陷）；
 *   · 不判读失败时两棵树的内容差异（看不见的那一块不进比较 —— 这正是要**说出来**、而不是猜的）；
 *   · 不判 `readdirSync` 权限失败那一支（这一台机器上造不出一条**可靠**的权限拒绝；
 *     悬空链接走的是同一条 `stat` 失败分支，`missing_dirs` 分支由代码与读数覆盖、这里不伪造样本）。
 */
import { before, describe, test } from 'node:test'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { stagedVsLiveDrift } from '../support/evidence.mjs'
import { measureTarget, targetVerdict } from '../support/target.mjs'

before(() => {
  preflight()
})

/** 造一棵小树：`files` 逐份写；`dangling` 那一条做成悬空 junction（Windows 上不需要管理员权限）。 */
function makeTree(dir, { files = [], dangling = null } = {}) {
  mkdirSync(dir, { recursive: true })
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, text, 'utf8')
  }
  if (dangling !== null) {
    const abs = path.join(dir, dangling)
    mkdirSync(path.dirname(abs), { recursive: true })
    symlinkSync(path.join(dir, 'this-target-does-not-exist'), abs, 'junction')
  }
  return dir
}

/** 两个读者的失败列表里"同一条"的公共形状（报文带绝对路径，比 `rel/kind/code` 三样）。 */
const shapeOf = (list) => (Array.isArray(list) ? list : []).map((f) => ({ rel: f.rel, kind: f.kind, code: f.code })).sort((a, b) => (a.rel < b.rel ? -1 : 1))

describe('integration · measuring/copy (MCR) · bug-20261107-02 两个读者说同一句话', () => {
  test('MCR-05 读不到的子树在两个读者的读数里都有名字（字面量 / 静默丢 / 抛 三种形态分得开）', async () => {
    await runCase('MCR-05', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const root = runRoot()
      const base = path.join(root, 'fixtures', 'mcr05')

      // ── 夹具：干净的一对树 + 一棵带悬空链接的树 ────────────────────────────────
      const files = {
        'top.txt': 'top\n',
        'a/keep.mjs': "export const KEEP = 'a'\n",
        'b/nested/keep.mjs': "export const KEEP = 'b'\n",
      }
      const cleanA = makeTree(path.join(base, 'clean-staged'), { files })
      const cleanB = makeTree(path.join(base, 'clean-live'), { files })
      const brokenA = makeTree(path.join(base, 'broken-staged'), { files, dangling: 'a/ghost' })
      const brokenB = makeTree(path.join(base, 'broken-live'), { files })
      // 第三棵树：真的少一份（"那里没有"），用来与"读不到"分开
      const missingA = makeTree(path.join(base, 'missing-staged'), {
        files: Object.fromEntries(Object.entries(files).filter(([rel]) => rel !== 'b/nested/keep.mjs')),
      })
      rec.readings.fixtures = { clean: [cleanA, cleanB], broken: [brokenA, brokenB], missing: [missingA, cleanB] }

      // ── ① 真现场：两个读者都不许抛，且都点名 a/ghost ─────────────────────────────
      const measuredBroken = measureTarget({ stagedRoot: brokenA, baselineRoot: brokenB })
      let driftBroken = null
      let driftThrew = null
      try {
        driftBroken = stagedVsLiveDrift({ ...process.env, AGENIA_STAGING_PRESET: brokenA }, { liveRoot: brokenB })
      } catch (err) {
        driftThrew = { code: err?.code ?? err?.name ?? null, message: String(err?.message ?? err).slice(0, 300) }
      }
      const targetFailures = shapeOf(measuredBroken.read_failures?.staged?.list ?? [])
      const driftFailures = driftThrew === null ? shapeOf(driftBroken?.read_failures?.staged?.list ?? []) : []
      rec.readings.readers_on_broken_tree = {
        measured: {
          staged_files: measuredBroken.staged_files,
          baseline_files: measuredBroken.baseline_files,
          read_ok: measuredBroken.read_ok,
          read_failures: measuredBroken.read_failures,
        },
        drift: {
          threw: driftThrew,
          read_ok: driftBroken?.read_ok ?? null,
          same: driftBroken?.same ?? null,
          only_staged: driftBroken?.only_staged ?? null,
          read_failures: driftBroken?.read_failures ?? null,
          missing_paths: (driftBroken?.missing_paths ?? []).map((f) => f.rel),
        },
      }
      if (driftThrew !== null) {
        push('DRIFT-THREW', `\`stagedVsLiveDrift\` 在一棵有读不动的树的输入上**抛了**（${driftThrew.code}：${driftThrew.message}）—— 它与 \`measureTarget\` 对失败必须说同一句话（旧形态在这里，不许回来）`)
      }
      const want = [{ rel: 'a/ghost', kind: 'stat', code: 'ENOENT' }]
      if (JSON.stringify(targetFailures) !== JSON.stringify(want)) {
        push('TARGET-READ-UNRECORDED', `\`measureTarget\` 的失败读数应是 ${JSON.stringify(want)}，实得 ${JSON.stringify(targetFailures)} —— 读不到的那一块被静默丢了（样本变短、差集照旧全空）`)
      }
      if (driftThrew === null && JSON.stringify(driftFailures) !== JSON.stringify(want)) {
        push('DRIFT-READ-UNRECORDED', `\`stagedVsLiveDrift\` 的失败读数应是 ${JSON.stringify(want)}，实得 ${JSON.stringify(driftFailures)}`)
      }
      if (driftThrew === null && JSON.stringify(targetFailures) !== JSON.stringify(driftFailures)) {
        push('READERS-DISAGREE', `两个读者对同一个现场说的不是同一句话：\`measureTarget\` = ${JSON.stringify(targetFailures)} · \`stagedVsLiveDrift\` = ${JSON.stringify(driftFailures)}`)
      }
      if (measuredBroken.read_ok !== false) push('TARGET-READ-OK-WRONG', `\`measureTarget().read_ok\` = ${JSON.stringify(measuredBroken.read_ok)}（期望 false）—— 读不到一块却报"读得动"`)
      if (driftBroken !== null && driftBroken.read_ok !== false) push('DRIFT-READ-OK-WRONG', `\`stagedVsLiveDrift().read_ok\` = ${JSON.stringify(driftBroken.read_ok)}（期望 false）`)
      if (driftBroken !== null && driftBroken.same !== false) push('DRIFT-SAME-WITH-BLIND-SPOT', `有读不到的一块，\`stagedVsLiveDrift().same\` 却是 ${JSON.stringify(driftBroken.same)} —— "有一块我没看见"被读成了"没发现差异"`)

      // ── ② 判决真的出去了：targetVerdict 的码 + 报文 ─────────────────────────────
      const verdictBroken = targetVerdict({ measured: measuredBroken })
      const readCode = verdictBroken.problems.find((p) => p.code === 'TARGET-READ-FAILED') ?? null
      rec.readings.target_verdict = {
        ok: verdictBroken.ok,
        state: verdictBroken.state,
        codes: verdictBroken.problems.map((p) => p.code),
        line: verdictBroken.line,
      }
      if (readCode === null) {
        push('TARGET-READ-UNREPORTED', `\`targetVerdict\` 的红因里没有 \`TARGET-READ-FAILED\`（实得 ${JSON.stringify(verdictBroken.problems.map((p) => p.code))}）—— 读到了失败却不报，等于没记`)
      } else if (!String(readCode.message).includes('a/ghost')) {
        push('TARGET-READ-UNNAMED', `\`TARGET-READ-FAILED\` 的报文没有点名 \`a/ghost\`：${String(readCode.message).slice(0, 300)}`)
      }
      if (verdictBroken.ok !== false) push('TARGET-READ-GREEN', `有读不到的一块，\`targetVerdict().ok\` 却是 true —— "逐字节相同"这句话不覆盖看不见的那一块`)
      if (!verdictBroken.line.includes('读不到')) push('TARGET-READ-LINE', `\`F57-TARGET\` 那一行没有说"读不到"（实得：${verdictBroken.line.slice(0, 240)}）—— 入口那一行会把"漏一块"印成"靶子=现役"`)

      // ── ③ "读不到" ≠ "那里没有" ───────────────────────────────────────────────
      const measuredMissing = measureTarget({ stagedRoot: missingA, baselineRoot: cleanB })
      const driftMissing = stagedVsLiveDrift({ ...process.env, AGENIA_STAGING_PRESET: missingA }, { liveRoot: cleanB })
      rec.readings.missing_vs_unreadable = {
        missing: {
          read_ok: driftMissing.read_ok,
          only_staged: driftMissing.only_staged,
          only_live: driftMissing.only_live,
          read_failures: shapeOf(driftMissing.read_failures?.staged?.list ?? []),
          measured_files: measuredMissing.staged_files,
        },
        unreadable: {
          read_ok: driftBroken?.read_ok ?? null,
          only_staged: driftBroken?.only_staged ?? null,
          read_failures: driftFailures,
        },
      }
      if (driftMissing.read_ok !== true) push('MISSING-READ-OK', `一对**真的少了一份**的树应当是"读得动"的（少 ≠ 读不到），\`read_ok\` 实得 ${JSON.stringify(driftMissing.read_ok)}：${driftMissing.read_failures_line}`)
      if (!driftMissing.only_live.includes('b/nested/keep.mjs')) push('MISSING-NOT-NAMED', `少了一份的那棵树（staged 里没有那份），\`only_live\` 没点名它：${JSON.stringify(driftMissing.only_live)} —— "那里没有"必须由差集说，不许与"读不到"混成一句`)
      if ((driftBroken?.only_live ?? []).includes('a/ghost') || (driftBroken?.only_staged ?? []).includes('a/ghost')) push('UNREADABLE-AS-MISSING', `悬空链接 \`a/ghost\` 被算进了差集（only_staged=${JSON.stringify(driftBroken?.only_staged ?? null)} · only_live=${JSON.stringify(driftBroken?.only_live ?? null)}）—— 读不到的东西不许冒充"有一份、另一边没有"`)
      if ((driftMissing.read_failures?.staged?.list ?? []).length !== 0) push('MISSING-AS-UNREADABLE', `"少了一份"那一格不该有读失败：${driftMissing.read_failures_line}`)

      // ── ④ 干净的一对树：两边都翻得动（空样本的反面）──────────────────────────────
      const measuredClean = measureTarget({ stagedRoot: cleanA, baselineRoot: cleanB })
      const driftClean = stagedVsLiveDrift({ ...process.env, AGENIA_STAGING_PRESET: cleanA }, { liveRoot: cleanB })
      const verdictClean = targetVerdict({ measured: measuredClean })
      rec.readings.clean_pair = {
        measured: { files: measuredClean.staged_files, read_ok: measuredClean.read_ok },
        drift: { same: driftClean.same, read_ok: driftClean.read_ok, only_staged: driftClean.only_staged, only_live: driftClean.only_live, different: driftClean.different },
        verdict: { ok: verdictClean.ok, state: verdictClean.state, codes: verdictClean.problems.map((p) => p.code) },
      }
      if (measuredClean.read_ok !== true || (measuredClean.read_failures?.staged?.list ?? []).length !== 0 || (measuredClean.read_failures?.baseline?.list ?? []).length !== 0) {
        push('CLEAN-PAIR-READ-FAILED', `干净的一对树报了读失败：${JSON.stringify(measuredClean.read_failures)} —— 这一格不是"永远有失败"`)
      }
      if (driftClean.same !== true) push('CLEAN-PAIR-NOT-SAME', `干净且逐字节相同的一对树，\`same\` = ${JSON.stringify(driftClean.same)}（期望 true）—— 判据不许退化成"永远不 same"`)
      if (verdictClean.ok !== true) push('CLEAN-PAIR-VERDICT', `干净的一对树 \`targetVerdict().ok\` = ${JSON.stringify(verdictClean.ok)}（红因 ${JSON.stringify(verdictClean.problems.map((p) => p.code))}）`)

      // ── 刀：两个读者各自退回旧形态 ──────────────────────────────────────────────
      const dropped = measureTarget({ stagedRoot: brokenA, baselineRoot: brokenB, onReadError: 'drop' })
      let thrown = null
      try {
        stagedVsLiveDrift({ ...process.env, AGENIA_STAGING_PRESET: brokenA }, { liveRoot: brokenB, onReadError: 'throw' })
      } catch (err) {
        thrown = { code: err?.code ?? err?.name ?? null }
      }
      rec.readings.knives = {
        drop: { read_ok: dropped.read_ok, failures: shapeOf(dropped.read_failures?.staged?.list ?? []), staged_files: dropped.staged_files },
        throw: thrown,
      }
      if (dropped.read_ok !== true || (dropped.read_failures?.staged?.list ?? []).length !== 0) {
        push('KNIFE-NO-BITE', `\`onReadError:'drop'\`（旧的静默形态）没有把失败藏起来：read_ok=${JSON.stringify(dropped.read_ok)} / ${JSON.stringify(shapeOf(dropped.read_failures?.staged?.list ?? []))} —— 那 ①② 的红不是"记录失败"这一条给的`)
      }
      if (thrown === null || thrown.code !== 'ENOENT') {
        push('KNIFE-NO-BITE', `\`onReadError:'throw'\`（旧的抛形态）没有抛出 ENOENT（实得 ${JSON.stringify(thrown)}）—— 两种旧形态分不开，修法就没有被证明`)
      }

      caseFail(problems)
    })
  })
})
