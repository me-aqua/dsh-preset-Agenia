/**
 * `HCA-01` —— **判据自己的调用形状**：harness 不许把"我写错了"吞成"产品红了"。
 *
 * 【病】技术评审 2026-11-09 `F2`（独立于本票发现）：`caseHold(rec, code, why)` 收三个实参，
 * 而 `integration/flip01-bridge-reading.test.mjs` 里有一处写成
 * `return caseHold('FLIP-PROVENANCE-UNKNOWN', `…`)` —— **只传了两个**。
 * 那一跑的真事：`rec` 收到的是那个码字符串、`rec.holds` 是 `undefined`
 * ⇒ `Cannot read properties of undefined (reading 'push')`
 * ⇒ 一条**本来要写"这一格判不了"**的分支，被记成了 `problems[0].code = "TypeError"` 的 **RED**。
 * ⇒ 读的人看到的是"被测对象红了"，而事实是"判据自己少打了一个实参"。
 *
 * 【这一格判什么】三件事，缺一不算：
 *   ① **形状判据是纯函数**（`caseHoldCallProblem`）：六个喂法各给一个**互不相同**的答案
 *      （三参合法 / 两参少一个 / 一参 / 第 1 个不是记录 / code 空 / why 不是字符串），
 *      外加一条**边界的自述**：多于三个实参**不判**（多传是噪音，不是判错）。
 *   ② **活体闸**：`caseHold` 自己接住形状错 —— 抛 `CaseHoldShapeError`（`code` 稳定可 grep），
 *      报文点名**调用点**（file:line），且**一条 HOLD 都不许被记下来**（静默记成 HOLD 是另一种假绿）；
 *      阳性对照：合法的三参调用必须照常记一条 `{code, why, at}`。
 *   ③ **端到端**（两跑，独立运行根）：同一段用例体，`caseHold(rec,'CODE')`（两参）⇒
 *      `result.json.result === "RED"` 且 `problems[0].code === "CASE-HOLD-ARITY"`（**不是** `TypeError`）、
 *      `holds` 为空；`caseHold(rec,'CODE','why')`（三参）⇒ `result === "HOLD"`、`holds[0].code` 就是那个码。
 *      ⇒ 闸既**真的会红**，也**没有把 HOLD 这一态整个吃掉**。
 *
 * 【不判什么】不扫源码里"有没有两参的调用点"（那要一个 JS 解析器；写得不好会静默漏扫 ——
 *   一个只在某些文件里生效的静态扫描，比没有更坏）。这条闸是**运行期**的：
 *   调用点一共 67 处（2026-11-10 实测），只要**被执行到**，形状错就出声。
 *   ⚠️ 反过来说：一个**永远不被执行**的坏调用点这把闸看不见 ——
 *   `flip01-bridge-reading.test.mjs:224` 就是这种（活树上那条分支不走），
 *   它会在**副本**那一跑里以 `CASE-HOLD-ARITY` 的形状出现（不再是 `TypeError`）。
 */
import { test } from 'node:test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CaseHoldShapeError,
  caseDir,
  caseFail,
  caseHold,
  caseHoldCallProblem,
  problem,
  runCase,
} from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { spawnCaseProbe } from '../support/settlement-probe.mjs'

/** `support/evidence.mjs` 的绝对 `file://` —— 子进程里的探针只许 import **这一份**。 */
const EVIDENCE_URL = pathToFileURL(path.join(PATHS.testRoot, 'support', 'evidence.mjs')).href

/**
 * 探针源码：一整份 ESM 模块，自己调**真** `runCase`。
 * `mode: 'two-args'` = 复刻 F2 那个形状（少传一个实参）；`mode: 'three-args'` = 阳性对照。
 */
function probeSource(mode) {
  const body = mode === 'two-args'
    ? "caseHold(rec, 'HCA-KNIFE-ONLY-TWO')"
    : "caseHold(rec, 'HCA-KNIFE-HOLD', '这一档判不了（三参阳性对照）')"
  return [
    `import { caseHold, runCase } from ${JSON.stringify(EVIDENCE_URL)}`,
    `const done = await runCase('HCA-PROBE', async (rec) => {`,
    `  ${body}`,
    '})',
    "console.log('PROBE-RESULT', done.result, (done.holds ?? []).map((h) => h.code).join(','))",
    '',
  ].join('\n')
}

test('HCA-01 判据自己的调用形状：caseHold 少传实参 ⇒ 点名 CASE-HOLD-ARITY 的红，不许变成 TypeError / 不许静默记成 HOLD', async () => {
  await runCase('HCA-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    // ── ① 形状判据（纯函数）：六个喂法，六个答案 ────────────────────────────────
    const okRec = { holds: [] }
    const table = [
      { name: '三参合法', input: { argc: 3, rec: okRec, code: 'SOME-CODE', why: '为什么' }, want: null },
      { name: '两参（F2 的形状：rec 位置收到的是码字符串）', input: { argc: 2, rec: 'SOME-CODE', code: '为什么', why: undefined }, want: 'CASE-HOLD-ARITY' },
      { name: '一参', input: { argc: 1, rec: 'SOME-CODE', code: undefined, why: undefined }, want: 'CASE-HOLD-ARITY' },
      { name: '第 1 个不是 runCase 的记录', input: { argc: 3, rec: {}, code: 'SOME-CODE', why: '为什么' }, want: 'CASE-HOLD-REC' },
      { name: 'code 是空串', input: { argc: 3, rec: { holds: [] }, code: '', why: '为什么' }, want: 'CASE-HOLD-CODE' },
      { name: 'why 不是字符串', input: { argc: 3, rec: { holds: [] }, code: 'SOME-CODE', why: null }, want: 'CASE-HOLD-WHY' },
      // 🔴 边界自述：多于 3 个实参**不判**（多传是噪音，不是"这一格判错了"）。
      { name: '四参（边界：不判）', input: { argc: 4, rec: { holds: [] }, code: 'SOME-CODE', why: '为什么' }, want: null },
    ]
    const tableReading = table.map((row) => {
      const got = caseHoldCallProblem(row.input)
      return { name: row.name, code: got?.code ?? null, want: row.want }
    })
    rec.readings.shape_table = tableReading
    for (let i = 0; i < table.length; i += 1) {
      const got = tableReading[i].code
      if (got !== table[i].want) {
        push('HCA-SHAPE-TABLE', `[①] ${table[i].name}：判成 ${JSON.stringify(got)}，期望 ${JSON.stringify(table[i].want)}`
          + `（喂的是 ${JSON.stringify(table[i].input)}）—— 形状判据不翻面，这一格没有意义`)
      }
    }
    // 这一格里**四类**形状错必须各有一个码（ARITY / REC / CODE / WHY）——
    // 少一个码，就有一类笔误读起来和另一类一样。两个"少参数"的喂法**共用** ARITY，这是设计：
    // 少一个和少两个是同一件事（`caseHold` 没有默认值可补）。
    const distinct = new Set(tableReading.map((r) => r.code).filter((c) => c !== null))
    if (distinct.size !== 4) {
      push('HCA-SHAPE-TABLE', `[①] 四类形状错只给出 ${distinct.size} 个互不相同的码（${JSON.stringify([...distinct])}）—— `
        + '少一个码，就有一类笔误读起来和另一类一样')
    }

    // ── ② 活体闸：形状错就抛，且**一条 HOLD 都不许被记下来** ──────────────────
    const liveOf = (fn) => {
      const target = { holds: [] }
      try {
        const entry = fn(target)
        return { threw: false, entry, recorded: target.holds.length }
      } catch (err) {
        return {
          threw: true,
          is_shape_error: err instanceof CaseHoldShapeError,
          name: err?.name ?? null,
          code: err?.code ?? null,
          message: String(err?.message ?? err),
          call_site: err?.call_site ?? null,
          recorded: target.holds.length,
        }
      }
    }
    const liveTwo = liveOf((target) => caseHold(target, 'HCA-LIVE-TWO'))
    const liveGood = liveOf((target) => caseHold(target, 'HCA-LIVE-GOOD', '三参必须被收下'))
    rec.readings.live_guard = {
      two_args: { threw: liveTwo.threw, is_shape_error: liveTwo.is_shape_error ?? false, name: liveTwo.name ?? null, code: liveTwo.code ?? null, recorded: liveTwo.recorded, call_site: liveTwo.call_site, message_head: (liveTwo.message ?? '').slice(0, 200) },
      three_args: { threw: liveGood.threw, code: liveGood.entry?.code ?? null, recorded: liveGood.recorded, has_at: typeof liveGood.entry?.at === 'string' },
    }
    if (liveTwo.threw !== true) {
      push('HCA-GUARD-DEAD', '[②] 两参调用**没有抛**（`caseHold` 静默收下了它）—— harness 又把"我写错了"吞成了一条 HOLD')
    } else {
      if (liveTwo.code !== 'CASE-HOLD-ARITY') push('HCA-GUARD-CODE', `[②] 两参调用抛了，但码是 ${JSON.stringify(liveTwo.code)}，不是 \`CASE-HOLD-ARITY\``)
      if (liveTwo.is_shape_error !== true || liveTwo.name !== 'CaseHoldShapeError') {
        push('HCA-GUARD-CODE', `[②] 抛出来的不是 \`CaseHoldShapeError\`（实得 ${JSON.stringify(liveTwo.name)}，instanceof=${String(liveTwo.is_shape_error)}）—— 结算里会与程序崩溃同形`)
      }
      if (liveTwo.recorded !== 0) push('HCA-GUARD-SILENT-RECORD', `[②] 形状错的调用居然记下了 ${liveTwo.recorded} 条 HOLD —— "判不了"与"我写错了"必须分得开`)
      if (!/\d+ 个实参/.test(liveTwo.message ?? '')) push('HCA-GUARD-MESSAGE', `[②] 报文没点名"只收到几个实参"：${JSON.stringify((liveTwo.message ?? '').slice(0, 160))}`)
      if (!/hca01-hold-call-shape\.test\.mjs:\d+/.test(liveTwo.call_site ?? '')) {
        push('HCA-GUARD-MESSAGE', `[②] 报文没点名调用点（要 file:line，且指向本文件）：${JSON.stringify(liveTwo.call_site)}`)
      }
    }
    if (liveGood.threw !== false || liveGood.entry?.code !== 'HCA-LIVE-GOOD' || liveGood.recorded !== 1 || typeof liveGood.entry?.at !== 'string') {
      push('HCA-GUARD-OVEREACH', `[②] 合法的三参调用被闸挡住了（threw=${liveGood.threw} · code=${JSON.stringify(liveGood.entry?.code)} · 记下 ${liveGood.recorded} 条）`
        + ' —— 闸把 HOLD 这一态整个吃掉，与"闸太松"一样坏')
    }

    // ── ③ 端到端：同一段用例体，两参 ⇒ 命名红；三参 ⇒ HOLD ─────────────────────
    const base = path.join(path.dirname(caseDir('HCA-01')), '_probe')
    const bad = spawnCaseProbe({ baseDir: base, name: 'two-args', source: probeSource('two-args'), id: 'HCA-PROBE', runRootName: 'run-two-args' })
    const good = spawnCaseProbe({ baseDir: base, name: 'three-args', source: probeSource('three-args'), id: 'HCA-PROBE', runRootName: 'run-three-args' })
    const summarize = (p) => ({
      exit: p.exit,
      evidence: p.record !== null,
      result: p.record?.result ?? null,
      problems: (p.record?.problems ?? []).map((x) => ({ code: x.code, message: String(x.message ?? '').slice(0, 240) })),
      holds: (p.record?.holds ?? []).map((x) => x.code),
      stdout_tail: p.stdout.split(/\r?\n/).filter((l) => l.trim() !== '').slice(-3),
      stderr_head: p.stderr.slice(0, 200),
    })
    rec.readings.end_to_end = { two_args: summarize(bad), three_args: summarize(good) }
    const b = rec.readings.end_to_end.two_args
    if (b.evidence !== true) {
      push('HCA-PROBE-UNAVAILABLE', `[③] 两参那跑的探针没写出结果（exit=${b.exit} · stderr=${JSON.stringify(b.stderr_head)}）`)
    } else {
      if (b.result !== 'RED') push('HCA-E2E-NOT-RED', `[③] 两参的用例体必须判 RED，实得 ${JSON.stringify(b.result)} —— 形状错被当成了"判不了"`)
      if (b.problems[0]?.code !== 'CASE-HOLD-ARITY') {
        push('HCA-E2E-NOT-NAMED', `[③] 两参那跑的红码必须是 \`CASE-HOLD-ARITY\`，实得 ${JSON.stringify(b.problems.map((p) => p.code))}`
          + ' —— 记成 `TypeError` 就是"判据崩了"冒充"产品红了"（F2 的原形状）')
      }
      if (!/\d+ 个实参/.test(b.problems[0]?.message ?? '')) {
        push('HCA-E2E-NOT-NAMED', `[③] 红报文没点名"只收到几个实参"：${JSON.stringify(b.problems[0]?.message ?? '')}`)
      }
      if (b.holds.length !== 0) push('HCA-E2E-NOT-NAMED', `[③] 两参那跑不许留下 HOLD（实得 ${JSON.stringify(b.holds)}）`)
    }
    const g = rec.readings.end_to_end.three_args
    if (g.evidence !== true) {
      push('HCA-PROBE-UNAVAILABLE', `[③] 三参那跑的探针没写出结果（exit=${g.exit} · stderr=${JSON.stringify(g.stderr_head)}）`)
    } else {
      if (g.result !== 'HOLD') push('HCA-E2E-HOLD-LOST', `[③] 三参的用例体必须判 HOLD，实得 ${JSON.stringify(g.result)} —— 闸坏了，或者 HOLD 这一态没了`)
      if (JSON.stringify(g.holds) !== JSON.stringify(['HCA-KNIFE-HOLD'])) {
        push('HCA-E2E-HOLD-LOST', `[③] 三参那跑的 holds 必须恰好是 ["HCA-KNIFE-HOLD"]，实得 ${JSON.stringify(g.holds)}`)
      }
    }

    caseFail(problems)
  })
})
