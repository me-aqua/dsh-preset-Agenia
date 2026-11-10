/**
 * `WIT-01` —— **最后一层守卫不许与被守的东西同亡**（`bug-20261107-07`）。
 *
 * 【病】`DR-02` 的见证（`rec.readings.real_roots`）与它的最后一道守卫
 * （`DR02-WITNESS-READINGS-UNGUARDED`，住在 §④ 那段连续区域的**外面**）今天是这样：
 *   · 只删 §④（守卫留着）⇒ 守卫红（`DR02-WITNESS-READINGS-UNGUARDED`，点名 `real_roots` 缺）—— 这一半是好的；
 *   · 把**守卫也一起删掉**（刀 G）⇒ **0 红**：守卫是最后一层，它自己也在这份文件里，
 *     谁都能把它和被守的东西一起删。
 * ⇒ 修法不是再加第九格（组长 2026-11-07 的口径：「不许再加第九格」），而是让**文件外**有读者：
 *    结算侧断言"`DR-02` 写过这份读数"。这一格就是那两把**源码删除刀**的读数。
 *
 * 【两把刀】（都在**副本**上做：真 `data-root.test.mjs` 一个字节不动，副本落在运行根里）
 *   副本用 `--test-name-pattern=DR-02` 跑：真跑的是 `DR-02` **和**标题里带 `DR-02` 的 `STM-01`
 *   （`STM-01` 也读这份读数 ⇒ 它在刀下跟着红是**预期**的）。`node_exit` **不是**刀的信号 ——
 *   刀的信号是 `DR-02/result.json` 的判词码，加上**在这份证据根上跑真结算**的读数。
 *   · `judged-gone`：只删 §④（`// ── ④ 真实根的见证：` → `// ── ④ 见证的**段外兜底**`），守卫留着
 *     ⇒ `DR-02` 自己必须红，且红码**点名被判的那段没了**（`DR02-WITNESS-READINGS-UNGUARDED` + 报文提 `real_roots`）；
 *   · `guard-gone`：只删守卫（`// ── ④ 见证的**段外兜底**` → `rec.readings.controlled_env = {`），§④ 留着
 *     ⇒ `DR-02` 自己**不红**（今天的事实，读数里如实记下），**但文件外的读者必须红**：
 *     结算 `real_roots.problems` 含 `SETTLE-DR02-GUARD-READING-MISSING`、那一行 🔴、退出码非零。
 *   对照：**同一份副本不做任何删除**必须 GREEN、结算 exit 0 —— 没有这一条，"两把刀都红"可能只是副本坏了。
 *   ⚠️ **`F3`（技术评审 2026-11-09）之后**：副本上 `DR-02` 可能是**环境性 HOLD**
 *   （`DR02-EXCLUSION-NO-DATA-ROOT`：只读副本里没有 `presets/agenia/.runtime`）。
 *   ⇒ 对照那一条不再是"必须 GREEN"，而是**"必须与 DR-02 的判词同态"**：
 *   `GREEN ⇒ 绿` · `HOLD ⇒ 挂起（且点名 STM-SETUP-DR02-HOLD）` · `RED ⇒ 红`。
 *   "把环境性 HOLD 当红"正是 F3 的原形状 —— 它让副本上必红两格，红因与被测对象无关。
 *   判据本体是 `support/settlement-probe.mjs::dr02FeedVerdict`（纯函数，真跑与刀喂同一份）。
 *
 * 【刀自带尺子】期望（哪条码、报文提哪个键、结算行是不是 🔴、退出码）全部手写在下面，
 * 不 import 被切的那份文件的任何符号；副本的支撑模块 import 改成**绝对 `file://`**（否则跑不起来，
 * 那不是"刀没咬住"，是脚手架坏了 —— 分开报 `WIT-KNIFE-UNAVAILABLE`）。
 * 锚点不是恰好 1 处 ⇒ `WIT-KNIFE-ANCHOR`（实现换过写法，刀要同批更新；`cand-20261106-0140`）。
 */
import { test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENV, PATHS } from '../support/env.mjs'
import { caseFail, problem, realRootsSnapshot, runCase, runRoot } from '../support/evidence.mjs'
import { dr02FeedVerdict, evidenceDirOfRunRoot, runSettleCLI, realRootsLineOf, writeJsonFile } from '../support/settlement-probe.mjs'

const A_JUDGED_START = '// ── ④ 真实根的见证：'
const A_GUARD_START = '// ── ④ 见证的**段外兜底**（2026-11-07 MF-5）'
const A_AFTER_GUARD = '      rec.readings.controlled_env = {'

const countOf = (text, needle) => text.split(needle).length - 1

/** 把副本里的 `../support/*` 静态 import 与动态 import 都改成绝对 `file://`（测试树零字节）。 */
function rewriteSupportImports(text) {
  const support = path.join(PATHS.testRoot, 'support')
  let hits = 0
  let out = text.replace(/from\s+'\.\.\/support\/([^']+)'/g, (_m, rel) => {
    hits += 1
    return `from '${pathToFileURL(path.join(support, rel)).href}'`
  })
  out = out.replace(/import\('\.\.\/support\/([^']+)'\)/g, (_m, rel) => {
    hits += 1
    return `import('${pathToFileURL(path.join(support, rel)).href}')`
  })
  return { out, hits, leftover: /['"(]\.\.\/support\//.test(out) }
}

/** 删掉 `[startAnchor, endAnchor)` 这一段；两个锚点都必须**恰好 1 处**。 */
function deleteBetween(text, startAnchor, endAnchor) {
  const a = countOf(text, startAnchor)
  const b = countOf(text, endAnchor)
  if (a !== 1 || b !== 1) return { ok: false, why: `锚点计数 start=${a} end=${b}（各须恰好 1 处）`, anchor_counts: { start: a, end: b } }
  const i = text.indexOf(startAnchor)
  const j = text.indexOf(endAnchor)
  if (j <= i) return { ok: false, why: `end 锚点在 start 之前（${j} <= ${i}）`, anchor_counts: { start: a, end: b } }
  return { ok: true, removed_bytes: j - i, text: `${text.slice(0, i)}${text.slice(j)}`, anchor_counts: { start: a, end: b } }
}

/** 副本运行根的三层 marker + 环境（与 `run-all.mjs` 的注入同形；只落运行根）。 */
function envFor(runRoot) {
  for (const d of ['tmp', 'state', 'brain-root', 'workspace', 'fixtures', 'dsh-home']) mkdirSync(path.join(runRoot, d), { recursive: true })
  for (const sub of ['route', 'state', 'brain', 'leader', 'retro', 'review', 'hire']) mkdirSync(path.join(runRoot, 'workspace', '.team', sub), { recursive: true })
  const markers = [runRoot, path.join(runRoot, 'brain-root'), path.join(runRoot, 'workspace')]
  for (const m of markers) {
    if (!existsSync(path.join(m, '.agenia-test-root'))) {
      writeFileSync(path.join(m, '.agenia-test-root'), JSON.stringify({ kind: 'agenia-test-run', run_id: path.basename(runRoot), created_at: new Date().toISOString(), schema: 1 }), 'utf8')
    }
  }
  writeFileSync(path.join(runRoot, 'state', 'now.txt'), '2026-10-14T12:00:00+08:00', 'utf8')
  // 这一跑的"临时件样本"：真跑里 `RUN_ROOT/tmp` 本来就有文件（preflight / 夹具），副本里给它一份，
  // 否则 `TEMP-SCAN-NO-SAMPLE` 会合法地 HOLD —— 那是环境不同，不是刀的结果。
  writeFileSync(path.join(runRoot, 'tmp', 'knife-sample.txt'), 'sample\n', 'utf8')
  /**
   * 🔴 **嵌套跑 `node --test` 必须摘掉这两个变量**（实测）：父进程是 `node --test` 的子进程时，
   * 环境里带着 `NODE_TEST_CONTEXT`，嵌套的 `node --test` 会打印
   * 「Warning: node:test run() is being called recursively within a test file. skipping running files.」
   * 然后 **exit 0 但一条用例都不跑** —— 那种"0 红"是脚手架坏了，不是刀的结果。
   */
  const childEnv = {
    ...process.env,
    TEMP: path.join(runRoot, 'tmp'),
    TMP: path.join(runRoot, 'tmp'),
    DSH_HOME: path.join(runRoot, 'dsh-home'),
    [ENV.RUN_ROOT]: runRoot,
    [ENV.TEST_DATA_ROOT]: path.join(runRoot, 'brain-root'),
    [ENV.TEST_WORKSPACE]: path.join(runRoot, 'workspace'),
    [ENV.STATUS_ROOT]: path.join(runRoot, 'workspace', '.team'),
    [ENV.NOW_FILE]: path.join(runRoot, 'state', 'now.txt'),
  }
  delete childEnv.NODE_TEST_CONTEXT
  delete childEnv.NODE_TEST_REPORTER
  return childEnv
}

test('WIT-01 最后一层守卫不与所守同亡：只删被判那段 ⇒ 红点名；只删守卫 ⇒ 文件外读者红（两把源码删除刀 + 对照必须与 DR-02 同态，环境性 HOLD 只许挂起）', async () => {
  await runCase('WIT-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const srcFile = path.join(PATHS.testRoot, 'integration', 'data-root.test.mjs')
    const srcText = readFileSync(srcFile, 'utf8')
    const rw = rewriteSupportImports(srcText)
    rec.readings.knife_frame = { source: srcFile, source_bytes: srcText.length, support_imports_rewritten: rw.hits, relative_support_imports_left: rw.leftover }
    if (rw.leftover || rw.hits === 0) {
      push('WIT-KNIFE-UNAVAILABLE', `副本的支撑模块 import 没改干净（剩下相对 import=${rw.leftover} · 改写 ${rw.hits} 处）—— 副本跑不起来，刀量不到东西`)
      caseFail(problems)
      return
    }
    const judgedGone = deleteBetween(rw.out, A_JUDGED_START, A_GUARD_START)
    const guardGone = deleteBetween(rw.out, A_GUARD_START, A_AFTER_GUARD)
    rec.readings.knife_anchors = {
      judged_gone: judgedGone.ok ? { removed_bytes: judgedGone.removed_bytes, anchor_counts: judgedGone.anchor_counts } : { error: judgedGone.why },
      guard_gone: guardGone.ok ? { removed_bytes: guardGone.removed_bytes, anchor_counts: guardGone.anchor_counts } : { error: guardGone.why },
    }
    if (!judgedGone.ok) push('WIT-KNIFE-ANCHOR', `[judged-gone] ${judgedGone.why} —— 源码换过写法，这把刀要同批更新`)
    if (!guardGone.ok) push('WIT-KNIFE-ANCHOR', `[guard-gone] ${guardGone.why} —— 源码换过写法，这把刀要同批更新`)
    if (!judgedGone.ok || !guardGone.ok) {
      caseFail(problems)
      return
    }

    const base = path.join(runRoot(), 'wit01')
    const snapshot = realRootsSnapshot()
    /** 跑一份副本（只跑 DR-02 那条用例），再在这份证据根上跑**真结算**。 */
    const runVariant = (tag, text) => {
      const dir = path.join(base, tag)
      mkdirSync(dir, { recursive: true })
      const runId = `run-${tag}`
      const variantRoot = path.join(dir, runId)
      const env = envFor(variantRoot)
      const file = path.join(dir, `data-root.${tag}.mjs`)
      writeFileSync(file, text, 'utf8')
      const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', '--test-name-pattern=DR-02', file], {
        cwd: PATHS.repo, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 300000,
      })
      const evidenceDir = evidenceDirOfRunRoot(variantRoot)
      const resultFile = path.join(evidenceDir, 'DR-02', 'result.json')
      let dr02 = null
      try { dr02 = JSON.parse(readFileSync(resultFile, 'utf8')) } catch { dr02 = null }
      // 结算口径：补两相位 + 同文件兄弟用例的**合成**记录（只为让报告器核对闭嘴），
      // **DR-02 那一条是这份副本自己写下来的真读数**。
      // ⚠️ 只补**没写出结果**的那几条：副本里真跑过的（`DR-02` 与标题里带 `DR-02` 的 `STM-01`）
      //    一律保留它自己的结果 —— 覆盖真读数会把这个刀的证据根变成一份"看着全绿"的假现场。
      writeJsonFile(path.join(evidenceDir, '_preflight', 'real-roots.before.json'), snapshot)
      writeJsonFile(path.join(evidenceDir, '_preflight', 'real-roots.after.json'), snapshot)
      for (const id of ['DR-01', 'DR-03', 'TMP-01', 'STM-01']) {
        const file = path.join(evidenceDir, id, 'result.json')
        if (existsSync(file)) continue
        writeJsonFile(file, {
          id, group: 'data-root', file: 'integration/data-root.test.mjs', registry_status: 'written',
          result: 'GREEN', problems: [], holds: [], readings: {}, synthetic_fixture: 'WIT-01 副本结算探针',
        })
      }
      let stm01 = null
      try { stm01 = JSON.parse(readFileSync(path.join(evidenceDir, 'STM-01', 'result.json'), 'utf8')) } catch { stm01 = null }
      const settle = runSettleCLI({ runRoot: variantRoot })
      return {
        node_exit: r.status,
        evidence_dir: evidenceDir,
        evidence_found: dr02 !== null,
        dr02,
        /** 同文件里另一条也读 DR-02 读数的用例（`STM-01`）：副本里它跟着红是**预期的**，记下来当读数。 */
        stm01_result: stm01?.result ?? null,
        stm01_problems: (stm01?.problems ?? []).map((p) => p?.code ?? null),
        stm01_holds: (stm01?.holds ?? []).map((h) => h?.code ?? null),
        settle: {
          present: settle.present,
          exit: settle.exit,
          problems: (settle.settlement?.real_roots?.problems ?? []).map((x) => x.code),
          witness_ok: settle.settlement?.real_roots?.witness_ok ?? null,
          settlement_ok: settle.settlement?.real_roots?.settlement_ok ?? null,
          line: realRootsLineOf(settle.markdown),
        },
        spec_tail: String(r.stdout ?? '').split(/\r?\n/).filter((l) => l.trim() !== '').slice(-12),
      }
    }

    const control = runVariant('control', rw.out)
    const judged = runVariant('judged-gone', judgedGone.text)
    const guard = runVariant('guard-gone', guardGone.text)
    /**
     * 🔴 `F3`：对照的判词必须**与 DR-02 同态**（`GREEN ⇒ 绿` · `HOLD ⇒ 挂起` · `RED ⇒ 红`）。
     * 环境性 HOLD（`DR02-EXCLUSION-NO-DATA-ROOT`）不是这一格的失败：它证明的是"副本跑得通"，
     * 而"DR-02 判绿"本来就不是这条对照的对象。**但它也不许变成绿** —— 与 DR-02 一致才算同态。
     * 判据本体是纯函数 `dr02FeedVerdict`（与 `STM-01` 同一个）。
     */
    const controlFeed = dr02FeedVerdict(control.dr02)
    const expectStm = controlFeed.kind
    rec.readings.knife_control = {
      node_exit: control.node_exit,
      evidence_found: control.evidence_found,
      dr02_result: control.dr02?.result ?? null,
      dr02_holds: (control.dr02?.holds ?? []).map((h) => h?.code ?? null),
      feed: controlFeed,
      expect_stm01: expectStm,
      /**
       * `HOLD` 那一支（本机的活树上跑不到，因为活体预设里有 `.runtime`）由 `STM-01` 的
       * `readings.feed_variants.env_hold` 端到端证明：环境性 HOLD 记录喂进同一个用例体
       * ⇒ `result:"HOLD"` + `STM-SETUP-DR02-HOLD`。这里只负责"同态"。
       */
      hold_branch_proven_by: 'STM-01 · readings.feed_variants.env_hold（子进程 + 环境性 HOLD 记录 ⇒ result HOLD）',
      problems: (control.dr02?.problems ?? []).map((p) => p.code),
      stm01_result: control.stm01_result,
      stm01_problems: control.stm01_problems,
      stm01_holds: control.stm01_holds,
      settle: control.settle,
    }
    rec.readings.knife_judged_gone = {
      node_exit: judged.node_exit, evidence_found: judged.evidence_found, dr02_result: judged.dr02?.result ?? null,
      problems: (judged.dr02?.problems ?? []).map((p) => p.code),
      messages: (judged.dr02?.problems ?? []).map((p) => String(p.message).slice(0, 400)),
      has_real_roots_reading: judged.dr02?.readings?.real_roots !== undefined,
      stm01_result: judged.stm01_result, stm01_problems: judged.stm01_problems,
      settle: judged.settle,
    }
    rec.readings.knife_guard_gone = {
      node_exit: guard.node_exit, evidence_found: guard.evidence_found, dr02_result: guard.dr02?.result ?? null,
      problems: (guard.dr02?.problems ?? []).map((p) => p.code),
      has_real_roots_reading: guard.dr02?.readings?.real_roots !== undefined,
      has_guard_reading: guard.dr02?.readings?.dr02_witness_outside !== undefined,
      stm01_result: guard.stm01_result, stm01_problems: guard.stm01_problems,
      settle: guard.settle,
    }

    // ── 对照：同一份副本不删任何东西 ⇒ DR-02 与 STM-01 **同态**（GREEN/HOLD/RED 各归各位）──
    if (!control.evidence_found) {
      push('WIT-KNIFE-UNAVAILABLE', `[对照] 副本没写出 DR-02 的证据（node exit=${control.node_exit} · spec 尾=${JSON.stringify(control.spec_tail)}）`)
    } else {
      // ① 同态表：三个判词各有一个期望，**不许**"一律当绿"也不许"一律当红"。
      const FEED_TABLE = [
        { dr02: 'GREEN', want: 'GREEN' },
        { dr02: 'HOLD', want: 'HOLD' }, // ← F3：环境性 HOLD 只许挂起
        { dr02: 'RED', want: 'RED' }, // ← 反过来：真红不许被 HOLD 那一支吃掉
      ]
      const tableReading = FEED_TABLE.map((row) => ({ dr02: row.dr02, want: row.want, got: dr02FeedVerdict({ result: row.dr02, holds: [] }).kind }))
      rec.readings.control_feed_table = tableReading
      for (const row of tableReading) {
        if (row.got !== row.want) push('WIT-KNIFE-CONTROL', `[对照·同态表] DR-02=${row.dr02} 时期望 STM-01=${row.want}，实得 ${row.got} —— 同态表坏了，"环境性 HOLD"与"真红"又分不开了`)
      }
      if (control.dr02?.result !== 'GREEN' && control.dr02?.result !== 'HOLD') {
        push('WIT-KNIFE-CONTROL', `[对照] 未切的同一份副本上 DR-02 只许是 GREEN 或**环境性 HOLD**，实得 ${JSON.stringify(control.dr02?.result)}`
          + ` · problems=${JSON.stringify((control.dr02?.problems ?? []).map((p) => p.code))} —— 这是红（R5 之前的形状是"一律红"，F3 改的就是它）`)
      }
      if (control.dr02?.result === 'HOLD' && !(control.dr02?.holds ?? []).some((h) => String(h?.code ?? '').startsWith('DR02-'))) {
        push('WIT-KNIFE-CONTROL', `[对照] DR-02 挂起时必须点名**它自己的**成因码（DR02-…），实得 ${JSON.stringify((control.dr02?.holds ?? []).map((h) => h?.code ?? null))}`)
      }
      if (control.stm01_result !== expectStm) {
        push('WIT-KNIFE-CONTROL', `[对照] 副本里 STM-01 必须与 DR-02 同态（期望 ${expectStm}），实得 ${JSON.stringify(control.stm01_result)}`
          + ` · problems=${JSON.stringify(control.stm01_problems)} · holds=${JSON.stringify(control.stm01_holds)}`
          + ' —— 它红就说明"读同一份真读数"这条路自己坏了（F3 的原形状：环境性 HOLD 被记成红）')
      }
      if (control.stm01_result === 'HOLD' && !(control.stm01_holds ?? []).includes('STM-SETUP-DR02-HOLD')) {
        push('WIT-KNIFE-CONTROL', `[对照] STM-01 挂起时码必须是 STM-SETUP-DR02-HOLD（点名"因为 DR-02 挂起"），实得 ${JSON.stringify(control.stm01_holds)}`)
      }
      if (control.settle.problems.length > 0 || control.settle.exit !== 0) {
        push('WIT-KNIFE-CONTROL', `[对照] 未切的副本结算必须 exit 0 且无 real_roots 问题，实得 exit=${control.settle.exit} · problems=${JSON.stringify(control.settle.problems)}`)
      }
      if (control.settle.line === null || !control.settle.line.includes('DR-02')) {
        push('WIT-KNIFE-CONTROL', `[对照] 结算那一行必须点名 DR-02，实得 ${JSON.stringify(control.settle.line)}`)
      }
    }

    // ── 刀 A：只删被判的那段（§④）；守卫留着 ⇒ DR-02 自己红，且**点名被判的那段没了** ──
    if (!judged.evidence_found) {
      push('WIT-KNIFE-UNAVAILABLE', `[judged-gone] 副本没写出 DR-02 的证据（node exit=${judged.node_exit} · spec 尾=${JSON.stringify(judged.spec_tail)}）`)
    } else {
      const codes = (judged.dr02?.problems ?? []).map((p) => p.code)
      if (judged.dr02?.result !== 'RED') {
        push('WIT-KNIFE-JUDGED-NOT-BITING', `[judged-gone] 删掉 §④（守卫留着）之后 DR-02 必须红，实得 ${JSON.stringify(judged.dr02?.result)}`)
      }
      if (!codes.includes('DR02-WITNESS-READINGS-UNGUARDED')) {
        push('WIT-KNIFE-JUDGED-NOT-BITING', `[judged-gone] 红码必须点名"被判的那段没了"（DR02-WITNESS-READINGS-UNGUARDED），实得 ${JSON.stringify(codes)}`)
      }
      if (!(judged.dr02?.problems ?? []).some((p) => /real_roots/.test(String(p.message)))) {
        push('WIT-KNIFE-JUDGED-NOT-BITING', `[judged-gone] 报文必须点名丢掉的是哪份读数（\`real_roots\`），实得 ${JSON.stringify((judged.dr02?.problems ?? []).map((p) => String(p.message).slice(0, 200)))}`)
      }
      if (judged.dr02?.readings?.real_roots !== undefined) {
        push('WIT-KNIFE-JUDGED-NOT-BITING', '[judged-gone] 副本里 readings.real_roots 居然还在 —— 刀没切到被判的那段')
      }
      // 文件外的读者也必须看得见（第二载体）
      if (!judged.settle.problems.includes('SETTLE-DR02-WITNESS-READING-MISSING') || judged.settle.exit === 0) {
        push('WIT-EXTERNAL-READER-NOT-BITING', `[judged-gone] 结算必须跟着红（SETTLE-DR02-WITNESS-READING-MISSING + 非零退出），实得 exit=${judged.settle.exit} · problems=${JSON.stringify(judged.settle.problems)}`)
      }
    }

    // ── 刀 B：只删**守卫**（§④ 留着）⇒ DR-02 自己不红（病因），文件外的读者必须红 ──────
    if (!guard.evidence_found) {
      push('WIT-KNIFE-UNAVAILABLE', `[guard-gone] 副本没写出 DR-02 的证据（node exit=${guard.node_exit} · spec 尾=${JSON.stringify(guard.spec_tail)}）`)
    } else {
      if (guard.dr02?.readings?.real_roots === undefined) {
        push('WIT-KNIFE-GUARD-NOT-BITING', '[guard-gone] 副本里 readings.real_roots 不见了 —— 刀切到了 §④，不是只切守卫')
      }
      if (guard.dr02?.readings?.dr02_witness_outside !== undefined) {
        push('WIT-KNIFE-GUARD-NOT-BITING', '[guard-gone] 副本里守卫的读数居然还在 —— 守卫没被切掉')
      }
      if (!guard.settle.problems.includes('SETTLE-DR02-GUARD-READING-MISSING')) {
        push('WIT-EXTERNAL-READER-NOT-BITING', `[guard-gone] 只删守卫时，文件外的读者必须点名 SETTLE-DR02-GUARD-READING-MISSING，实得 ${JSON.stringify(guard.settle.problems)}`
          + `（DR-02 自己这一跑：${JSON.stringify(guard.dr02?.result)} / problems=${JSON.stringify((guard.dr02?.problems ?? []).map((p) => p.code))}）—— 这就是"最后一层能被一起删"的病）`)
      }
      if (guard.settle.exit === 0) {
        push('WIT-EXTERNAL-READER-NOT-BITING', '[guard-gone] 只删守卫时结算退出码仍是 0 —— 守卫丢了没有任何东西负责')
      }
      if (guard.settle.line === null || !guard.settle.line.includes('🔴')) {
        push('WIT-EXTERNAL-READER-NOT-BITING', `[guard-gone] 结算那一行必须变红，实得 ${JSON.stringify(guard.settle.line)}`)
      }
    }

    caseFail(problems)
  })
})
