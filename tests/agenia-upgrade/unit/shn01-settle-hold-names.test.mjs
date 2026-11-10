/**
 * `SHN-01` —— **`F57-SETTLE` 报 `HOLD 2` 却不点名**（`bug-20261110-05`；契约 §7.2）。
 *
 * 【病】11-10 那天为一个问题跑了三次都没答上来："哪两条挂着？" —— 结算行给了数，没给名字，
 * 而盘上那些 `_evidence/<ID>/result.json` 也没有任何一行指过去。数能数出来，人读不到。
 *
 * 【这一格判什么】四件事 + 四把刀，缺一不算：
 *   ① **逐条点名**：结算行之后 `HOLD <id> <code> env|case` / `RED <id> <code>`，一行 = 一个（用例 × 成因码）；
 *      一个用例两个码就两行（只留第一个 = "数对得上、名字少一个"的老病）。行序按成因分组。
 *   ② **成因直方图**：`[结算·成因] 非绿 <n> 条 = HOLD <h> / RED <r> · 成因 <code>=<条数> … · 环境性 <e> 条`。
 *   ③ **数与名不许分家**（判据 `settleGroupVerdict` 双向对账）：盘上每条非绿都有名 / 每个名都在盘上 /
 *      行的码集 = `result.json` 的码集 / 直方图条数 = 行数 / 每个 verdict 的不同 id 数 = **结算行里的数**
 *      （从行里解析，不只看结算 JSON）/ kind 词与 `holds[].kind` 同值 / 不许重复名 / 不许空名。
 *   ④ **环境性 HOLD**（DR02 的形状）仍然出现，且标成 `env`。
 *   ⇒ 三把"改一处"的刀各红**一个**码：抹掉一个名字 ⇒ `SHN-NAME-MISSING`；改结算行的 `HOLD 2` ⇒
 *      `SHN-COUNTS-DISAGREE`；改直方图一个数 ⇒ `SHN-HISTOGRAM-DRIFT`。第四把刀在**副本**里切产品
 *      （少发一行）⇒ 用**同一段用例体**跑出 `RED`，且红码正是 `SHN-NAME-MISSING`（"少一行"与"这一格红"是同一条腿）。
 *
 * 【不判什么】不判 HOLD 该不该挂起（各格自己的判据）；不判成因码的措辞；不判 `F57-FAIL` 那几行（`verdict.mjs`）。
 *   ⚠️ 直方图数的是**条**（= 行数），不是"用例数"；口径写在那一行自己身上。
 */
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseDir, caseFail, problem, runCase, realRootsSnapshot } from '../support/evidence.mjs'
import { spawnTestFileVariant } from '../support/settlement-probe.mjs'
import { anchorLineOf } from '../support/run-anchor.mjs'
import {
  countsOfSettleLine,
  histogramOf,
  parseSettleGroup,
  settleGroupLines,
  settleGroupVerdict,
} from '../support/settle-reading.mjs'

/** 本文件在 `<repo>/tests/agenia-upgrade/unit/` 下 ⇒ 上两级是测试树、上四级是仓库根（从自己位置推，不读配置）。 */
const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(SUITE, '..', '..')
const RUN_ALL = path.join(SUITE, 'run-all.mjs')
const DR_ROOT_TEST = path.join(SUITE, 'integration', 'data-root.test.mjs')
const FLIP_TEST = path.join(SUITE, 'integration', 'flip01-bridge-reading.test.mjs')

/** 一条 `result.json` 形状的记录（合成证据根用；`synthetic_fixture` 明写它是夹具）。 */
function recordOf({ id, runId, result, codes = [] }) {
  return {
    id,
    registry_status: 'written',
    run_id: runId,
    result,
    problems: result === 'RED' ? codes.map((c) => ({ code: c.code, message: `（合成夹具）${c.code}`, detail: null })) : [],
    holds: result === 'HOLD' ? codes.map((c) => ({ code: c.code, kind: c.kind ?? 'case', why: `（合成夹具）${c.code}`, at: '2026-11-10T00:00:00.000Z' })) : [],
    readings: {},
    synthetic_fixture: 'SHN-01 的合成证据根（不是"这几条真的跑过了"的声明）',
  }
}

/** 子进程环境（摘掉测试 runner 的上下文；临时件落探针目录）。 */
function childEnv(tmp) {
  const env = { ...process.env, TEMP: tmp, TMP: tmp }
  delete env.NODE_TEST_CONTEXT
  delete env.NODE_TEST_REPORTER
  delete env.AGENIA_REPO_ROOT
  return env
}

/** `…\_runs\<RUN_ID>` ⇒ `…\_evidence\<RUN_ID>`（与 `evidence.mjs::evidenceRoot()` 同一条规则，**自己复算**）。 */
function evidenceOfRunRoot(runRoot) {
  const abs = path.resolve(runRoot)
  return path.join(path.dirname(path.dirname(abs)), '_evidence', path.basename(abs))
}

/**
 * 一次**合成跑**：先在它的证据根里放好记录（含两相位"真实根"快照），再真跑入口，
 * 读回 `judgement.txt`（这一跑一个测试文件都不跑 —— 结算读的就是我放进去的那几份）。
 */
function syntheticRun({ label, records, base }) {
  const runRoot = path.join(base, 'runs', label)
  const evidence = evidenceOfRunRoot(runRoot)
  const tmp = path.join(base, 'tmp')
  mkdirSync(path.join(evidence, '_preflight'), { recursive: true })
  mkdirSync(path.join(runRoot, 'tmp'), { recursive: true })
  mkdirSync(tmp, { recursive: true })
  const snapshot = realRootsSnapshot()
  writeFileSync(path.join(evidence, '_preflight', 'real-roots.before.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  writeFileSync(path.join(evidence, '_preflight', 'real-roots.after.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  for (const rec of records) {
    const dir = path.join(evidence, rec.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'result.json'), `${JSON.stringify(rec, null, 2)}\n`, 'utf8')
  }
  const r = spawnSync(process.execPath, [RUN_ALL, `--run-root=${runRoot}`, '--glob=tests/agenia-upgrade/static/__shn01-none__.test.mjs'], {
    cwd: REPO, env: childEnv(tmp), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 240000,
  })
  const jf = path.join(runRoot, 'judgement.txt')
  const sf = path.join(evidence, 'settlement.json')
  const af = path.join(runRoot, 'run-anchor.json')
  const readJson = (file) => {
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  }
  /** 判据自己去盘上读每一份 `result.json`（不从结算的副本里拿）。 */
  const evidenceOnDisk = {}
  for (const rec of records) evidenceOnDisk[rec.id] = readJson(path.join(evidence, rec.id, 'result.json'))
  return {
    label,
    run_root: runRoot,
    evidence_root: evidence,
    exit: r.status,
    stdout: String(r.stdout ?? ''),
    stderr: String(r.stderr ?? ''),
    judgement: existsSync(jf) ? readFileSync(jf, 'utf8') : '',
    anchor: readJson(af),
    settlement: readJson(sf),
    evidence: evidenceOnDisk,
  }
}

test('SHN-01 F57-SETTLE 的非绿逐条点名 + 成因直方图：2 条 HOLD 都点名、环境性带 env、数与名不许分家（刀：抹一个名字必红）', async () => {
  await runCase('SHN-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const base = path.join(path.dirname(caseDir('SHN-01')), '_probe', 'shn01')
    mkdirSync(base, { recursive: true })

    // ── ① 纯函数：两档 kind / 一行一个成因 / 直方图按条数 ────────────────────
    const anchorReading = {
      state: 'commit', commit: 'c'.repeat(40), source: '现役活树的 HEAD（起跑时量一次 · git rev-parse HEAD）',
      why: null, is_copy: false,
    }
    const syntheticTwo = [
      { id: 'DR-01', result: 'HOLD', codes: [{ code: 'DR01-BRAIN-KNIFE-UNJUDGED', kind: 'case' }] },
      { id: 'DR-02', result: 'HOLD', codes: [{ code: 'DR02-EXCLUSION-NO-DATA-ROOT', kind: 'environment' }] },
    ]
    const settleTwo = {
      denominator: 5, discovered: 5, ranFiles: 1, settled: 5, fullScope: false, scopeCases: 0,
      red: 0, green: 3, hold: 2, consistent: true, diffCount: 0,
      nodeExit: 1, nodeTests: 0, nodeFail: 0, settleExit: 0,
    }
    const groupTwo = settleGroupLines({ settle: settleTwo, anchor: anchorReading, nonGreen: syntheticTwo })
    const parsedTwo = parseSettleGroup(groupTwo)
    const histTwo = histogramOf(parsedTwo.histogram)
    rec.readings.pure_group = { lines: groupTwo, names: parsedTwo.names.map((n) => `${n.verdict} ${n.id} ${n.code} ${n.kind ?? ''}`.trim()), histogram: parsedTwo.histogram, histogram_total: histTwo === null ? null : histTwo.total }
    if (groupTwo[0] !== `F57-SETTLE 分母 5 · 盘上发现 5 · 跑到 1 文件/5 条（scope 0/5） · RED 0 / GREEN 3 / HOLD 2 · 登记=盘上 ✓ · node --test exit 1（tests 0 · fail 0） · settle exit 0`) {
      push('SHN-SETTLE-LINE-CHANGED', `结算行不再是原来那一句（契约 §7.2 要求逐字不变）：${JSON.stringify(groupTwo[0])}`)
    }
    if (groupTwo[1] !== anchorLineOf(anchorReading)) push('SHN-GROUP-ORDER', `锚点行不是紧跟结算行：${JSON.stringify(groupTwo.slice(0, 2))}`)
    if (parsedTwo.names.length !== 2) push('SHN-NAME-MISSING', `两条非绿应当各一行名字，实得 ${parsedTwo.names.length} 行（${JSON.stringify(parsedTwo.names.map((n) => n.line))}）`)
    if (!parsedTwo.names.some((n) => n.id === 'DR-02' && n.code === 'DR02-EXCLUSION-NO-DATA-ROOT' && n.kind === 'environment')) {
      push('SHN-ENV-MISLABELED', `环境性 HOLD 必须点名且标 \`env\`：${JSON.stringify(parsedTwo.names.map((n) => n.line))}`)
    }
    if (!parsedTwo.names.some((n) => n.id === 'DR-01' && n.code === 'DR01-BRAIN-KNIFE-UNJUDGED' && n.kind === 'case')) {
      push('SHN-ENV-MISLABELED', `非环境性 HOLD 必须标 \`case\`：${JSON.stringify(parsedTwo.names.map((n) => n.line))}`)
    }
    if (histTwo === null || histTwo.total !== 2) push('SHN-HISTOGRAM-DRIFT', `两条 HOLD 的直方图求和应为 2，实得 ${JSON.stringify(histTwo === null ? null : histTwo.total)}`)

    // ── ② 判官的四个"改一处"刀（同一份行，各改一处 ⇒ 各红一个码）────────────
    const evidenceTwo = {
      'DR-01': recordOf({ id: 'DR-01', runId: 'synthetic', result: 'HOLD', codes: [{ code: 'DR01-BRAIN-KNIFE-UNJUDGED' }] }),
      'DR-02': recordOf({ id: 'DR-02', runId: 'synthetic', result: 'HOLD', codes: [{ code: 'DR02-EXCLUSION-NO-DATA-ROOT', kind: 'environment' }] }),
    }
    const clean = settleGroupVerdict({ lines: groupTwo, settleCounts: { red: 0, hold: 2 }, evidence: evidenceTwo })
    const dropName = settleGroupVerdict({ lines: groupTwo.filter((l) => !l.startsWith('HOLD DR-02 ')), settleCounts: { red: 0, hold: 2 }, evidence: evidenceTwo })
    const wrongCount = settleGroupVerdict({
      lines: groupTwo.map((l) => (l.startsWith('F57-SETTLE ') ? l.replace('HOLD 2 ·', 'HOLD 1 ·') : l)),
      settleCounts: { red: 0, hold: 2 },
      evidence: evidenceTwo,
    })
    const wrongHistogram = settleGroupVerdict({
      lines: groupTwo.map((l) => (l.startsWith('[结算·成因] ') ? l.replace('DR02-EXCLUSION-NO-DATA-ROOT=1', 'DR02-EXCLUSION-NO-DATA-ROOT=2') : l)),
      settleCounts: { red: 0, hold: 2 },
      evidence: evidenceTwo,
    })
    const wrongKind = settleGroupVerdict({
      lines: groupTwo.map((l) => (l.startsWith('HOLD DR-02 ') ? l.replace(/ env$/, ' case') : l)),
      settleCounts: { red: 0, hold: 2 },
      evidence: evidenceTwo,
    })
    rec.readings.judge_knives = {
      clean: clean.codes,
      drop_name: dropName.codes,
      wrong_count: wrongCount.codes,
      wrong_histogram: wrongHistogram.codes,
      wrong_kind: wrongKind.codes,
    }
    if (!clean.ok) push('SHN-JUDGE-FALSE-RED', `干净的输入被判红：${JSON.stringify(clean.problems)}`)
    /**
     * 每把刀**精确**的翻面集（多翻/少翻都红）：抹掉一个名字会同时违反三条不变量 ——
     * 名字少一条、数与名分家、直方图与名单分家 —— 三条都是从**同一份行**各自算出来的，
     * 所以那三码一起红是**对的**（不是"刀切了两处"）。别的码一起出现才是刀切歪了。
     */
    const wantKnife = (label, got, want) => {
      const missing = want.filter((code) => !got.includes(code))
      const extra = got.filter((code) => !want.includes(code))
      if (missing.length > 0) push('SHN-KNIFE-NOT-BITING', `[${label}] 应当红 ${JSON.stringify(missing)}，实得 ${JSON.stringify(got)}`)
      if (extra.length > 0) push('SHN-KNIFE-WRONG-VECTOR', `[${label}] 多红了 ${JSON.stringify(extra)}（应恰好 ${JSON.stringify(want)}）`)
    }
    wantKnife('抹掉一个名字', dropName.codes, ['SHN-NAME-MISSING', 'SHN-COUNTS-DISAGREE', 'SHN-HISTOGRAM-DRIFT'])
    wantKnife('把结算行的 HOLD 2 改成 1', wrongCount.codes, ['SHN-COUNTS-DISAGREE'])
    wantKnife('把直方图一个数改大', wrongHistogram.codes, ['SHN-HISTOGRAM-DRIFT'])
    wantKnife('把 env 改成 case', wrongKind.codes, ['SHN-ENV-MISLABELED'])

    // ── ③ 一个用例两个码 ⇒ 两行（不许只留第一个）─────────────────────────────
    const multi = [{ id: 'DR-03', result: 'RED', codes: [{ code: 'DR03-A-SHAPE' }, { code: 'DR03-B-VALUE' }] }]
    const groupMulti = settleGroupLines({
      settle: { denominator: 1, discovered: 1, ranFiles: 1, settled: 1, fullScope: true, scopeCases: 1, red: 1, green: 0, hold: 0, consistent: true, diffCount: 0, nodeExit: 1, nodeTests: 1, nodeFail: 1, settleExit: 0 },
      anchor: anchorReading,
      nonGreen: multi,
    })
    const parsedMulti = parseSettleGroup(groupMulti)
    const histMulti = histogramOf(parsedMulti.histogram)
    const multiEvidence = { 'DR-03': recordOf({ id: 'DR-03', runId: 'synthetic', result: 'RED', codes: [{ code: 'DR03-A-SHAPE' }, { code: 'DR03-B-VALUE' }] }) }
    const multiVerdict = settleGroupVerdict({ lines: groupMulti, settleCounts: { red: 1, hold: 0 }, evidence: multiEvidence })
    rec.readings.multi_code = {
      names: parsedMulti.names.map((n) => n.line), histogram_total: histMulti === null ? null : histMulti.total,
      distinct_ids: new Set(parsedMulti.names.map((n) => n.id)).size, verdict: multiVerdict.codes,
    }
    if (parsedMulti.names.length !== 2) push('SHN-CODE-MISSING', `一个用例两个码必须是两行（不许只留第一个），实得 ${parsedMulti.names.length} 行：${JSON.stringify(parsedMulti.names.map((n) => n.line))}`)
    if (histMulti === null || histMulti.total !== 2) push('SHN-HISTOGRAM-DRIFT', `两行的直方图求和应为 2，实得 ${JSON.stringify(histMulti === null ? null : histMulti.total)}`)
    if (!multiVerdict.ok) push('SHN-JUDGE-FALSE-RED', `一个用例两个码的干净输入被判红：${JSON.stringify(multiVerdict.problems)}`)

    // ── ④ 生产侧的 kind 从哪儿来（静态腿：不是这个测试自己编的）────────────
    const sourceOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '')
    const drSrc = sourceOf(DR_ROOT_TEST)
    const flipSrc = sourceOf(FLIP_TEST)
    const needles = {
      dr02_env_kind: (drSrc.match(/code: 'DR02-EXCLUSION-NO-DATA-ROOT',\s*\n?\s*\/\*\*[\s\S]{0,200}?\*\/\s*\n?\s*kind: 'environment'/g) ?? []).length,
      dr01_env_kind: (drSrc.match(/caseHold\(rec, 'DR01-BRAIN-WITNESS-ABSENT',[\s\S]{0,400}?\{ kind: 'environment' \}\)/g) ?? []).length,
      flip_env_kind: (flipSrc.match(/caseHold\(rec, 'FLIP-PROVENANCE-UNKNOWN',[\s\S]{0,200}?\{ kind: 'environment' \}\)/g) ?? []).length,
    }
    rec.readings.producer_needles = needles
    if (needles.dr02_env_kind !== 1) push('SHN-ENV-KIND-NOT-DECLARED', `\`data-root.test.mjs\` 里 DR02 那个 HOLD 没有在产出它的地方声明 \`kind: 'environment'\`（命中 ${needles.dr02_env_kind} 处）—— kind 会退回测试自己编的`)
    if (needles.dr01_env_kind !== 1) push('SHN-ENV-KIND-NOT-DECLARED', `\`data-root.test.mjs\` 里 \`DR01-BRAIN-WITNESS-ABSENT\` 没声明 \`kind: 'environment'\`（命中 ${needles.dr01_env_kind} 处）`)
    if (needles.flip_env_kind !== 1) push('SHN-ENV-KIND-NOT-DECLARED', `\`flip01-bridge-reading.test.mjs\` 里 \`FLIP-PROVENANCE-UNKNOWN\` 没声明 \`kind: 'environment'\`（命中 ${needles.flip_env_kind} 处）`)

    // ── ⑤ 真跑（合成证据根）：2 条 HOLD 都点名、直方图求和 2、逐份 result.json 对上 ──
    const realDr02 = (() => {
      const file = path.join(path.dirname(caseDir('SHN-01')), 'DR-02', 'result.json')
      try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
    })()
    const dr02Base = realDr02 === null ? null : JSON.parse(JSON.stringify(realDr02))
    const dr02Hold = {
      ...(dr02Base ?? { id: 'DR-02', registry_status: 'written', run_id: null, readings: {} }),
      result: 'HOLD',
      problems: [],
      holds: [{ code: 'DR02-EXCLUSION-NO-DATA-ROOT', kind: 'environment', why: '（合成夹具）只读副本里没有数据根', at: '2026-11-10T00:00:00.000Z' }],
      synthetic_fixture: 'SHN-01 的合成证据根（DR-02 的读数取自本跑那一格，结论换成 HOLD）',
    }
    const twoHolds = [
      recordOf({ id: 'DR-01', runId: 'shn01-two-holds', result: 'HOLD', codes: [{ code: 'DR01-BRAIN-KNIFE-UNJUDGED' }] }),
      dr02Hold,
      recordOf({ id: 'DR-03', runId: 'shn01-two-holds', result: 'GREEN' }),
      recordOf({ id: 'TMP-01', runId: 'shn01-two-holds', result: 'GREEN' }),
      recordOf({ id: 'STM-01', runId: 'shn01-two-holds', result: 'GREEN' }),
    ]
    const runA = syntheticRun({ label: 'two-holds', records: twoHolds, base })
    const linesA = runA.judgement.split(/\r?\n/)
    const groupA = parseSettleGroup(linesA)
    const histA = histogramOf(groupA.histogram)
    const verdictA = settleGroupVerdict({
      lines: linesA,
      settleCounts: { red: runA.settlement?.settled?.red ?? null, hold: runA.settlement?.settled?.holds ?? null },
      evidence: runA.evidence,
      anchor: runA.anchor,
    })
    rec.readings.synthetic_two_holds = {
      run_root: runA.run_root, evidence_root: runA.evidence_root, exit: runA.exit,
      judgement: linesA,
      names: groupA.names.map((n) => n.line),
      histogram: groupA.histogram,
      histogram_total: histA === null ? null : histA.total,
      settle_counts: countsOfSettleLine(groupA.settle),
      settlement_counts: runA.settlement === null ? null : { red: runA.settlement.settled.red, green: runA.settlement.settled.green, hold: runA.settlement.settled.holds },
      dr02_source: realDr02 === null ? 'synthetic-minimal（本跑 DR-02 还没写出来）' : 'current-run-DR-02',
      verdict: { ok: verdictA.ok, codes: verdictA.codes, problems: verdictA.problems.map((p) => `${p.code}: ${String(p.message).slice(0, 200)}`) },
      evidence_files: Object.fromEntries(twoHolds.map((r) => [r.id, path.join(runA.evidence_root, r.id, 'result.json')])),
    }
    const readingA = rec.readings.synthetic_two_holds
    if (runA.settlement === null) {
      push('SHN-SETTLE-UNAVAILABLE', `合成证据根上跑不出结算（exit=${runA.exit} · stderr=${runA.stderr.slice(0, 300)}）—— 这一格判不了`)
    } else {
      if (readingA.settle_counts === null || readingA.settle_counts.hold !== 2) {
        push('SHN-COUNTS-DISAGREE', `合成跑的结算行 HOLD 数应为 2，实得 ${JSON.stringify(readingA.settle_counts)}`)
      }
      if (groupA.names.length !== 2) push('SHN-NAME-MISSING', `合成跑有 2 条 HOLD，句组只点了 ${groupA.names.length} 行名字：${JSON.stringify(groupA.names.map((n) => n.line))}`)
      for (const want of [
        { id: 'DR-01', code: 'DR01-BRAIN-KNIFE-UNJUDGED', kind: 'case' },
        { id: 'DR-02', code: 'DR02-EXCLUSION-NO-DATA-ROOT', kind: 'environment' },
      ]) {
        const hit = groupA.names.find((n) => n.id === want.id && n.code === want.code)
        if (hit === undefined) {
          push('SHN-NAME-MISSING', `合成跑里 \`${want.id}\`（\`${want.code}\`）没有被点名：${JSON.stringify(groupA.names.map((n) => n.line))}`)
          continue
        }
        if (hit.verdict !== 'HOLD') push('SHN-CODE-MISSING', `\`${want.id}\` 那一行应当以 \`HOLD\` 开头：${JSON.stringify(hit.line)}`)
        if (hit.kind !== want.kind) push('SHN-ENV-MISLABELED', `\`${want.id}\` 的 kind 应为 \`${want.kind === 'environment' ? 'env' : 'case'}\`，实得 \`${hit.kind === 'environment' ? 'env' : 'case'}\`：${JSON.stringify(hit.line)}`)
      }
      if (histA === null || histA.total !== 2) push('SHN-HISTOGRAM-DRIFT', `合成跑的直方图求和应为 2，实得 ${JSON.stringify(histA === null ? null : histA.total)}：${JSON.stringify(groupA.histogram)}`)
      if (!verdictA.ok) {
        for (const p of verdictA.problems) push(p.code, `[合成跑] ${p.message}`)
      }
      /** 判词必须**逐份**在盘上：行里点的每一个（id, code）都要能在 `_evidence/<ID>/result.json` 里读到。 */
      const traceable = []
      for (const n of groupA.names) {
        const disk = runA.evidence[n.id]
        const codes = disk === null ? [] : ((disk.result === 'HOLD' ? disk.holds : disk.problems) ?? []).map((x) => x.code)
        traceable.push({ id: n.id, code: n.code, on_disk: codes.includes(n.code), file: path.join(runA.evidence_root, n.id, 'result.json') })
      }
      rec.readings.synthetic_two_holds.traceable = traceable
      for (const t of traceable) {
        if (!t.on_disk) push('SHN-EVIDENCE-MISSING', `句组点了 \`${t.id} ${t.code}\`，但 \`${t.file}\` 里读不到这个码 —— 名字追不回盘上判词`)
      }
    }

    // ── ⑥ 刀（端到端）：副本里少发一行 ⇒ **同一段用例体**判 RED，码是 SHN-NAME-MISSING ──
    const depth = Number(process.env.AGENIA_PROBE_DEPTH ?? 0)
    if (depth > 0) {
      rec.readings.knife_e2e = { skipped: `AGENIA_PROBE_DEPTH=${depth} > 0（本进程是别的格的探针副本；"少发一行"那把刀在主跑里量，这里不套娃）` }
    } else {
      /**
       * 副本只拷**测试树**（`tests/agenia-upgrade`）—— 不拷整仓：
       *   · 整仓拷进自己的子目录会 `ERR_FS_CP_EINVAL`（副本落点在 `.team/` 之下，属于仓内）；
       *   · 这一格要的是"同一段用例体 + 少一行的产品"，`presets/` / `.tools/` 缺席只会让 `F57-TARGET`
       *     记红（与这一格无关，读数里留着它的退出码）。
       */
      const copyRoot = path.join(base, 'fixtures', 'suite-copy')
      const copySuite = path.join(copyRoot, 'tests', 'agenia-upgrade')
      mkdirSync(path.dirname(copySuite), { recursive: true })
      cpSync(path.join(REPO, 'tests', 'agenia-upgrade'), copySuite, { recursive: true, force: true })
      const target = path.join(copySuite, 'support', 'settle-reading.mjs')
      const original = readFileSync(target, 'utf8')
      const anchor = "  for (const row of rows) lines.push(nameLineOf(row))\n"
      const hits = original.split(anchor).length - 1
      let patched = null
      if (hits !== 1) {
        push('SHN-KNIFE-ANCHOR', `刀的锚点在 \`settle-reading.mjs\` 里命中 ${hits} 处（应恰好 1 处）—— 刀钝了：少发一行也不会红`)
      } else {
        writeFileSync(target, original.replace(anchor, '  for (const row of rows.slice(0, -1)) lines.push(nameLineOf(row))\n'), 'utf8')
        const testFile = path.join(copySuite, 'unit', 'shn01-settle-hold-names.test.mjs')
        const knifeRun = spawnTestFileVariant({
          baseDir: path.join(base, 'knife'),
          name: 'drop-one-name',
          file: testFile,
          testNamePattern: '^SHN-01',
          timeoutMs: 600000,
        })
        const knifeRec = knifeRun.results['SHN-01'] ?? null
        patched = {
          copy_root: copyRoot,
          exit: knifeRun.exit,
          result: knifeRec === null ? null : knifeRec.result,
          codes: knifeRec === null ? null : (knifeRec.problems ?? []).map((p) => p.code),
          holds: knifeRec === null ? null : (knifeRec.holds ?? []).map((h) => h.code),
          first_problem: knifeRec === null ? null : String((knifeRec.problems ?? [])[0]?.message ?? '').slice(0, 300),
        }
        writeFileSync(target, original, 'utf8')
        if (knifeRec === null) {
          push('SHN-KNIFE-UNAVAILABLE', `副本那一跑没写出 \`SHN-01\` 的判词（exit=${knifeRun.exit} · stderr=${knifeRun.stderr.slice(0, 300)}）`)
        } else if (knifeRec.result !== 'RED') {
          push('SHN-KNIFE-NOT-BITING', `副本里少发一行，这一格却判 \`${knifeRec.result}\` —— "少一行"不是"这一格红"`)
        } else if (!(knifeRec.problems ?? []).some((p) => p.code === 'SHN-NAME-MISSING')) {
          push('SHN-KNIFE-NOT-BITING', `副本里少发一行，红因却没有 \`SHN-NAME-MISSING\`（实得 ${JSON.stringify((knifeRec.problems ?? []).map((p) => p.code))}）—— 红在别处不说明这条腿在承重`)
        }
      }
      rec.readings.knife_e2e = { anchor, hits, patched }
    }

    caseFail(problems)
  })
})
