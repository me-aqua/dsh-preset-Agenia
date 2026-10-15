/**
 * MEM-01..09 · MEM-11 · MEM-12 —— 记忆核心（单元 + 存储面）。
 *
 * 冻结依据：契约 §6.4 + 提案 §B1.5（`lib/memory.mjs` 的签名）+ §B3.6（entry/snapshot/local-state schema）
 * + §B3.4（字符口径与四类分布）+ **追加裁定 v1.2 的 C-2**（`capacityVerdict(entries, ops)` 的 ops 形状，逐字）
 * + 拍板 Q9（`typeId` 英文）/ Q10（规范化哈希）。
 *
 * 三条口径：
 *   · **C-2 之后不许再拿 `ops=[]` 糊**：容量/增删改/合并/retag 边界一律用真实 op 形状写
 *     （省略/`[]` 只用在那条"delta 必须为 0"的规则上）。
 *   · 每个负例族都配正例；`distributionOf`/`sharesOf` 的汇总**严格相等**不是"约等于"。
 *   · 需要真子进程/事务/锁/通知的那部分（同日复核案、跨天、父死）按契约标 PENDING 或走 CLI（现在 RED）。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { brainPaths, loadStagedModule, nonCallables, runBrain, stagingExists } from '../support/sut.mjs'

before(() => {
  preflight()
})

/** 只给本文件用的小工具。 */
const readSafe = (file) => {
  try { return readFileSync(file, 'utf8') } catch { return null }
}
const sha256Of = (file) => {
  try { return createHash('sha256').update(readFileSync(file)).digest('hex') } catch { return null }
}
/** 写一份纯文本夹具（比如"旧 .team 本子"），并建好父目录。 */
const writeTextFixture = (file, text) => {
  writeJson(path.join(path.dirname(file), '.keep.json'), { note: 'mkdir 占位' })
  writeFileSync(file, text, 'utf8')
  return file
}

const DAY = '2026-10-14'

/** entry 夹具（形状照 §B3.6）；**不含真实私有数据**。 */
const entry = (n, type, text, over = {}) => ({
  id: `m-${String(n).padStart(8, '0')}`,
  type,
  text,
  raw: 0.8,
  imp_share: 0,          // 由 sharesOf 算，夹具里只作占位
  fresh_share: 0,
  double_low_streak: 0,
  last_evidence_review: '2026-10-01',
  known_from: 'fixture@2026-10-14',
  created_at: '2026-01-01T00:00:00+08:00',
  type_changed_at: null,
  ...over,
})
const addOp = (e) => ({ kind: 'add', entry: e })
const mkEntries = (n, type = 'general', chars = 4) => Array.from({ length: n }, (_, i) => entry(i + 1, type, 'x'.repeat(chars)))

/**
 * 纯函数库（`lib/memory.mjs`）——缺面就记 SUT-SURFACE-MISSING 并返回 null。
 * `fns` = 冻结签名里**必须是函数**的那些（会逐个查类型）；`consts` = 冻结签名里的**常量**
 * （只要存在，例如 `HALF_LIFE_DAYS` 对象 / `TYPE_IDS` 数组）。
 */
async function memoryLib(rec, problems, fns, consts = []) {
  const names = [...fns, ...consts]
  const lib = await loadStagedModule('lib/memory.mjs', names)
  rec.readings.memory_lib = { surfaceMissing: lib.surfaceMissing, missing: lib.missing, errors: lib.errors }
  if (lib.surfaceMissing) problems.push(problem('SUT-SURFACE-MISSING', 'staged/lib/memory.mjs 不在 —— 记忆核心拿不到（预期的首跑红）'))
  for (const n of lib.missing) problems.push(problem('SUT-SURFACE-MISSING', `staged/lib/memory.mjs 没有导出 ${n}（提案 §B1.5 冻了签名）`))
  for (const n of nonCallables(lib.mod, fns)) problems.push(problem('SUT-SURFACE-MISSING', `staged/lib/memory.mjs 导出的 ${n} 不是函数（冻结签名里它是函数）`))
  return lib.mod
}

function scenarioWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/**
 * **每例一个自己的脑数据根**（带 marker，落在运行根里）。
 * 🔴 为什么必须这样：`init` 是"只在空根上成功"的（再 init 会 `E_DATA_EXISTS`）。
 *    五个 CLI 驱动的用例（MEM-07/08/09/11/12）共用同一个 `AGENIA_TEST_DATA_ROOT` 的话，
 *    第 2 个用例起就会因为**上一个用例留下的数据**而红 —— 那是**假红**，与新功能无关。
 *    （这一条是交付前自查抓到的，记在 batch-D 基线里。）
 */
function caseBrainRoot(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const root = ensureMarkedDir(path.join(runRoot, `brain-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-brain-root',
  })
  return brainPaths({ ...process.env, [ENV.TEST_DATA_ROOT]: root })
}

/** 调一个纯函数并把异常变成读数（不许让整条用例因为一次抛错就只剩一条原因）。 */
function call(fn, args, problems, label) {
  try {
    return { threw: null, value: fn(...args) }
  } catch (err) {
    problems.push(problem('PURE-THREW', `${label} 抛错：${String(err.message).slice(0, 180)}`))
    return { threw: String(err.message).slice(0, 180), value: null }
  }
}

describe('unit · memory (MEM)', () => {
  test('MEM-01 半衰期 / freshness / 全库份额（含空库与新增后重算）', async () => {
    await runCase('MEM-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const mod = await memoryLib(rec, problems, ['halfLifeOf', 'freshnessOf', 'sharesOf'], ['HALF_LIFE_DAYS'])
      if (mod === null) caseFail(problems)

      // ① T 映射（未知类型必须 undefined —— 不许兜底）
      const tResults = {}
      for (const [typeId, T] of Object.entries(FROZEN.halfLifeDays)) {
        const r = call(mod.halfLifeOf, [typeId], problems, `halfLifeOf(${typeId})`)
        tResults[typeId] = r.value
        if (r.value !== T) push('HALF-LIFE', `halfLifeOf(${typeId}) 应为 ${T}，实得 ${JSON.stringify(r.value)}`)
      }
      const unknown = call(mod.halfLifeOf, ['not-a-type'], problems, 'halfLifeOf(未知)')
      tResults['not-a-type'] = unknown.value
      if (unknown.value !== undefined) push('HALF-LIFE', `halfLifeOf(未知类型) 必须是 undefined（调用方自己报错，不许兜底），实得 ${JSON.stringify(unknown.value)}`)
      rec.readings.half_life = tResults
      if (mod.HALF_LIFE_DAYS && JSON.stringify(mod.HALF_LIFE_DAYS) !== JSON.stringify(FROZEN.halfLifeDays)) {
        push('HALF-LIFE', `HALF_LIFE_DAYS 实得 ${JSON.stringify(mod.HALF_LIFE_DAYS)}，冻结 ${JSON.stringify(FROZEN.halfLifeDays)}`)
      }

      // ② freshnessOf（`2^(-days/T)`；**不夹逼** —— 负数天给 >1、由断言层判）
      const fresh = [
        ['0 天', 0, 365, 1],
        ['365 天 / T=365', 365, 365, 0.5],
        ['180 天 / T=180', 180, 180, 0.5],
        ['90 天 / T=90', 90, 90, 0.5],
        ['365 天 / T=90', 365, 90, 2 ** (-365 / 90)],
      ]
      const freshResults = {}
      for (const [label, days, T, want] of fresh) {
        const r = call(mod.freshnessOf, [days, T], problems, `freshnessOf(${days},${T})`)
        freshResults[label] = r.value
        if (r.value === null || Math.abs(r.value - want) > 1e-9) push('FRESHNESS', `${label}：期望 ${want}，实得 ${JSON.stringify(r.value)}`)
      }
      const neg = call(mod.freshnessOf, [-1, 365], problems, 'freshnessOf(-1,365)')
      freshResults['-1 天（未来）'] = neg.value
      if (neg.value !== null && !(neg.value > 1)) push('FRESHNESS', `负天数应当给出 >1 的值（函数不夹逼，由断言层判），实得 ${neg.value}`)
      rec.readings.freshness = freshResults

      // ③ 全库份额：非空 sum=1；空库有明确空态（不除零）
      const entries = [entry(1, 'general', 'aaaa'), entry(2, 'boss', 'bbbb'), entry(3, 'machine', 'cccc')]
      const shares = call(mod.sharesOf, [entries], problems, 'sharesOf(3 条)')
      rec.readings.shares = shares.value
      if (shares.value) {
        if (shares.value.empty === true) push('SHARES', '3 条非空库的 empty 不该是 true')
        const imp = [...(shares.value.imp?.values?.() ?? [])]
        const fr = [...(shares.value.fresh?.values?.() ?? [])]
        if (imp.length !== 3 || fr.length !== 3) push('SHARES', `份额表必须覆盖全部 3 条（imp=${imp.length} fresh=${fr.length}）`)
        for (const [label, arr] of [['imp', imp], ['fresh', fr]]) {
          const sum = arr.reduce((a, b) => a + b, 0)
          if (Math.abs(sum - 1) > 1e-9) push('SHARES', `${label} 份额之和应为 1，实得 ${sum}`)
        }
      }
      const empty = call(mod.sharesOf, [[]], problems, 'sharesOf([])')
      rec.readings.shares_empty = empty.value
      if (empty.value && empty.value.empty !== true) push('SHARES', '空库必须 empty=true')
      if (empty.value) {
        const anyNonZero = [...(empty.value.imp?.values?.() ?? []), ...(empty.value.fresh?.values?.() ?? [])].some((v) => v !== 0)
        if (anyNonZero) push('SHARES', '空库的份额必须全 0（不许除零得到 NaN/Infinity）')
      }
      // 新增一条 ⇒ 旧条的份额**全都变**
      if (shares.value) {
        const after = call(mod.sharesOf, [[...entries, entry(4, 'project', 'dddd')]], problems, 'sharesOf(4 条)')
        rec.readings.shares_after_add = after.value
        if (after.value) {
          const before1 = shares.value.imp?.get?.(entries[0].id)
          const after1 = after.value.imp?.get?.(entries[0].id)
          if (before1 === after1) push('SHARES', `新增一条之后老条目的 imp 份额没变（${before1}）—— 全库归一必须重算所有旧份额`)
        }
      }

      caseFail(problems)
    })
  })

  test('MEM-02 类型内低线：n=4 不判 / n=5 一名（并列全计入）/ n=6 两名 / 空类型 / 只单侧低不算双低', async () => {
    await runCase('MEM-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const mod = await memoryLib(rec, problems, ['lowLineOf', 'isDoubleLow', 'sharesOf'])
      if (mod === null) caseFail(problems)

      /** 造 n 条同类型条目，并给出指定的份额（直接构造 shares 表，绕开 sharesOf 的自由度）。 */
      const lowCase = (n, impValues, freshValues = impValues) => {
        const ents = Array.from({ length: n }, (_, i) => entry(i + 1, 'general', 'xxxx'))
        const shares = { imp: new Map(), fresh: new Map(), empty: false }
        ents.forEach((e, i) => {
          shares.imp.set(e.id, impValues[i])
          shares.fresh.set(e.id, freshValues[i])
        })
        return { ents, shares }
      }
      const runLow = (label, n, impValues, freshValues) => {
        const { ents, shares } = lowCase(n, impValues, freshValues)
        const r = call(mod.lowLineOf, [ents, shares], problems, `lowLineOf(${label})`)
        return { label, n, out: r.value }
      }
      const results = {}
      const r4 = runLow('n=4', 4, [0.1, 0.2, 0.3, 0.4])
      results['n=4'] = r4.out
      if (r4.out && r4.out.lowIds !== null) push('LOW-LINE', `n=4 不该判低（n<5 不判），实得 lowIds=${JSON.stringify([...(r4.out.lowIds ?? [])])}`)
      const r5 = runLow('n=5', 5, [0.1, 0.2, 0.3, 0.4, 0.5])
      results['n=5'] = r5.out
      if (r5.out) {
        if (r5.out.quota !== 1) push('LOW-LINE', `n=5 的名额应为 ceil(0.2*5)=1，实得 ${r5.out.quota}`)
        const low = [...(r5.out.lowIds ?? [])]
        if (low.length !== 1 || !low.includes(entry(1, 'general', '').id)) push('LOW-LINE', `n=5 应当只有份额最低那一条判低，实得 ${JSON.stringify(low)}`)
      }
      const r6 = runLow('n=6', 6, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
      results['n=6'] = r6.out
      if (r6.out) {
        if (r6.out.quota !== 2) push('LOW-LINE', `n=6 的名额应为 ceil(0.2*6)=2，实得 ${r6.out.quota}`)
        const low = [...(r6.out.lowIds ?? [])]
        if (low.length !== 2) push('LOW-LINE', `n=6 应有 2 条判低，实得 ${low.length}`)
      }
      // 并列：两条并列最低而名额只有 1 ⇒ 两条都算低
      const tie = runLow('n=5 并列最低', 5, [0.1, 0.1, 0.4, 0.5, 0.6])
      results['并列'] = tie.out
      if (tie.out) {
        const low = [...(tie.out.lowIds ?? [])]
        if (low.length !== 2) push('LOW-LINE', `并列最低必须**都**计入（名额 1 但两条并列），实得 ${low.length} 条`)
      }
      // 空类型
      const emptyType = call(mod.lowLineOf, [[], { imp: new Map(), fresh: new Map(), empty: true }], problems, 'lowLineOf(空类型)')
      results['空类型'] = emptyType.value
      if (emptyType.value && emptyType.value.lowIds !== null) push('LOW-LINE', '空类型不该判低（lowIds 必须是 null）')
      rec.readings.low_line = results

      // 双低：只有两侧都低才算
      const dbl = {}
      dbl['两侧都低'] = call(mod.isDoubleLow, [entry(1, 'general', '').id, new Set([entry(1, 'general', '').id]), new Set([entry(1, 'general', '').id])], problems, 'isDoubleLow(两侧低)').value
      dbl['只 imp 低'] = call(mod.isDoubleLow, [entry(1, 'general', '').id, new Set([entry(1, 'general', '').id]), new Set()], problems, 'isDoubleLow(单侧低)').value
      dbl['都不低'] = call(mod.isDoubleLow, [entry(1, 'general', '').id, new Set(), new Set()], problems, 'isDoubleLow(都不低)').value
      rec.readings.double_low = dbl
      if (dbl['两侧都低'] !== true) push('DOUBLE-LOW', '两侧都低必须为 true')
      if (dbl['只 imp 低'] !== false) push('DOUBLE-LOW', '**只一侧低不算双低**（这是 MEM-02 的核心），实得 true')
      if (dbl['都不低'] !== false) push('DOUBLE-LOW', '都不低必须为 false')

      rec.readings.quota_rule = { quotaRule: FROZEN.lowLineQuotaRule, minN: FROZEN.lowLineMinN }
      caseFail(problems)
    })
  })

  test('MEM-03 streak 推进与斩杀资格（K=3；非双低清零；类型变更重置；读发布值）', async () => {
    await runCase('MEM-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const mod = await memoryLib(rec, problems, ['nextStreak', 'isCullEligible'])
      if (mod === null) caseFail(problems)

      // ① streak 推进
      const streaks = [
        [0, true, 1], [1, true, 2], [2, true, 3], [3, true, 4],
        [5, false, 0], [1, false, 0], [0, false, 0],
      ]
      const sResults = {}
      for (const [prev, dbl, want] of streaks) {
        const r = call(mod.nextStreak, [prev, dbl], problems, `nextStreak(${prev},${dbl})`)
        sResults[`${prev}+${dbl}`] = r.value
        if (r.value !== want) push('STREAK', `nextStreak(${prev}, ${dbl}) 应为 ${want}，实得 ${JSON.stringify(r.value)}`)
      }
      rec.readings.streaks = sResults
      rec.readings.streak_k = FROZEN.streakK

      // ② 斩杀资格：streak>=3 **且** 在 N 里双低（K=3 才够格）
      //    **D-B4（追加裁定 v1.3）冻结了字段形状**：`is_double_low` + `double_low_streak`，
      //    两个都是**已发布 N 快照里的记录值**（不许当前进程重算）⇒ 只用 `is_double_low`，**三键试探已删**。
      const eligible = (streak, isDoubleLow) => ({
        ...entry(1, 'general', 'x'),
        [FROZEN.cullEligibleShape.streakField]: streak,
        [FROZEN.cullEligibleShape.flagField]: isDoubleLow,
      })
      const cullCases = [
        ['streak=3 + 双低', eligible(3, true), true],
        ['streak=4 + 双低', eligible(4, true), true],
        ['streak=2 + 双低', eligible(2, true), false],
        ['streak=3 + 不双低', eligible(3, false), false],
        ['streak=0', eligible(0, false), false],
      ]
      const cullResults = {}
      for (const [label, e, want] of cullCases) {
        const r = call(mod.isCullEligible, [e], problems, `isCullEligible(${label})`)
        cullResults[label] = r.value
        if (r.value !== want) push('CULL-ELIGIBLE', `${label}：应为 ${want}，实得 ${JSON.stringify(r.value)}（K=3：第 1/2 天不可提斩杀）`)
      }
      rec.readings.cull_eligible = cullResults
      rec.readings.cull_shape = FROZEN.cullEligibleShape
      rec.readings.cull_shape_note = { note: 'D-B4 冻结：判定 = `is_double_low === true && double_low_streak >= 3`，两个都是已发布 N 的字段；快照条目 schema 必须加 `is_double_low`。' }

      // ③ 类型变更 ⇒ streak 清零（记 `type_changed_at`），且**旧归档不被追溯抹掉**
      rec.readings.retag_reset = {
        note: '类型变更把 streak 清零、并在新类型下用新 T/低线重算：这条要 `retag` op + 发布面（走 MEM-05/MEM-12 的 op 路径与 judge-commit），纯函数层只能验 nextStreak 的重置语义（上面 5+false ⇒ 0）。',
      }
      rec.readings.archive_untouched = { note: '旧归档不许被追溯抹掉 —— 由 MEM-09 的快照归档只读断言兜。' }

      caseFail(problems)
    })
  })

  test('MEM-04 前一日复核提维护案、次日基于 N 判决：不隔天失效、不拿临时份额追溯、无冷却', async () => {
    await runCase('MEM-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const mod = await memoryLib(rec, problems, ['isCullEligible', 'nextStreak', 'capacityVerdict'])

      // ① 纯函数层：资格只看"已发布的 N"那条 streak（不是进程内重算）
      if (mod) {
        const published = {
          ...entry(1, 'general', 'x'),
          [FROZEN.cullEligibleShape.streakField]: FROZEN.cullEligibleShape.minStreak,
          [FROZEN.cullEligibleShape.flagField]: true,
        }
        const r = call(mod.isCullEligible, [published], problems, 'isCullEligible(已发布 streak=3)')
        rec.readings.published_streak = r.value
        if (r.value !== true) push('MEM04-ELIGIBLE', `已发布 streak=3 且双低 ⇒ 有斩杀资格，实得 ${JSON.stringify(r.value)}`)
      }

      // ② CLI 层：维护案导入与"不 eligible 的斩杀被拒"
      const bp = caseBrainRoot('MEM-04', 'maintenance')
      if (!stagingExists('bin/agenia-brain.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 维护案/判决的流程面拿不到（预期的首跑红）')
      } else {
        // ②-a 维护案导入（前一日复核提出的那种）
        const importPayload = {
          source: 'retro/2026-10-13/记忆复核.md',
          sha256: 'a'.repeat(64),
          base_snapshot: 'v6',
          update_generation: 1,
          review_attempt: 1,
          kind: 'maintenance',
          payload: { target_id: entry(1, 'general', 'x').id, action: 'cull', reason: '连续 3 个已发布快照双低' },
        }
        const imp = runBrain('maintenance-import', importPayload, { dataRoot: bp.root })
        rec.readings.maintenance_import = { exit_code: imp.exit_code, code: imp.json?.error?.code ?? null }
        if (imp.exit_code !== 0) push('MEM04-IMPORT', `维护案导入必须成功（正例），实得 exit=${imp.exit_code} / ${imp.json?.error?.code ?? '(无码)'}`)
        // ②-b 不 eligible 的斩杀：判决提交必须被拒
        const ineligible = {
          generation: 1, attempt: 1, token: 'tok',
          base_snapshot: 'v6',
          entries_patch: [],
          accepted: [],
          maintenance_decisions: [{ target_id: entry(9, 'general', 'x').id, action: 'cull' }],
          common_sense_sha256: 'b'.repeat(64),
          report: {},
        }
        const res = runBrain('judge-commit', ineligible, { dataRoot: bp.root })
        rec.readings.ineligible_cull = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
        if (res.exit_code === 0) push('MEM04-INELIGIBLE', '不 eligible 的斩杀目标竟然被批准了 —— 必须拒绝（E_STREAK_NOT_ELIGIBLE）')
        else if (!['E_STREAK_NOT_ELIGIBLE', 'E_TXN_TOKEN', 'E_CS_UNCONFIRMED', 'E_DATA_MISSING'].includes(res.json?.error?.code)) {
          push('MEM04-INELIGIBLE', `不 eligible 的斩杀应以 E_STREAK_NOT_ELIGIBLE 拒绝，实得 ${res.json?.error?.code}`)
        }
      }

      // ③ 跨天/同日/冷却这些"流程"语义只在 CLI 状态机里能验 —— 记 PENDING 说明，不折成通过
      rec.readings.flow_pending = {
        status: 'PENDING',
        note: '「同日复核案当天不生效 / 跨天不失效 / 无冷却」这三条要靠 `state/update/<day>.json` 的 generation+attempt 与两次 CLI 调用（真子进程、真日历）⇒ 本用例只覆盖"资格只看已发布 N"与"不 eligible 被拒"两侧；其余在 STO-03/JOB 批与 R1。',
      }

      caseFail(problems)
    })
  })

  test('MEM-05 存活集重算 N+1 份额；不追溯改本轮资格；纯函数不改入参', async () => {
    await runCase('MEM-05', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const mod = await memoryLib(rec, problems, ['capacityVerdict', 'sharesOf'])
      if (mod === null) caseFail(problems)

      const entries = [entry(1, 'general', 'aaaa'), entry(2, 'general', 'bbbb'), entry(3, 'machine', 'cccc'), entry(4, 'project', 'dddd')]
      const beforeSnapshot = JSON.stringify(entries)
      const beforeShares = call(mod.sharesOf, [entries], problems, 'sharesOf(before)').value

      const ops = [
        { kind: 'retire', id: entries[0].id },
        { kind: 'add', entry: entry(5, 'boss', 'eeee') },
        { kind: 'merge', ids: [entries[1].id, entries[2].id], entry: entry(6, 'general', 'bbbbcccc') },
      ]
      const out = call(mod.capacityVerdict, [entries, ops], problems, 'capacityVerdict(存活集重算)')
      rec.readings.recompute = out.value
      if (out.value) {
        // 4 条 - 1 retire - 2 merge + 1 merge 产物 + 1 add = 3 条
        if (out.value.count !== 3) push('MEM05-COUNT', `最终存活集应为 3 条（4 -1 retire -2 merge +1 merge +1 add），实得 ${out.value.count}`)
        if (out.value.deltaCount !== -1) push('MEM05-DELTA', `deltaCount 应为 -1，实得 ${out.value.deltaCount}`)
        const dist = out.value.distribution
        if (!Array.isArray(dist) || dist.length !== 4) push('MEM05-DIST', `distribution 必须恰 4 项，实得 ${JSON.stringify(dist)?.slice(0, 160)}`)
        else {
          const sc = dist.reduce((a, d) => a + (d.count ?? 0), 0)
          if (sc !== out.value.count) push('MEM05-DIST', `sum(distribution.count)=${sc} ≠ count=${out.value.count}（§B3.4 的严格相等）`)
        }
      }
      // 纯函数：不改入参（C-2 规则 2）
      if (JSON.stringify(entries) !== beforeSnapshot) push('MEM05-PURITY', 'capacityVerdict 修改了入参 entries —— C-2 规则 2：纯函数、不改入参、不写盘')
      // N+1 重算之后老条的份额变了
      const survivors = [entry(3, 'machine', 'cccc'), entry(6, 'general', 'bbbbcccc'), entry(5, 'boss', 'eeee')]
      const afterShares = call(mod.sharesOf, [survivors], problems, 'sharesOf(after)').value
      rec.readings.shares_before = beforeShares ? Object.fromEntries(beforeShares.imp ?? []) : null
      rec.readings.shares_after = afterShares ? Object.fromEntries(afterShares.imp ?? []) : null
      if (beforeShares && afterShares) {
        const shared = [entry(3, 'machine', 'cccc').id]
        for (const id of shared) {
          if (beforeShares.imp?.get?.(id) === afterShares.imp?.get?.(id)) push('MEM05-SHARES', `存活集变了之后 ${id} 的份额没变 —— N+1 必须重算全库份额`)
        }
      }
      rec.readings.no_retro = {
        note: '「不追溯改变本轮斩杀资格」= 本轮资格只看已发布的 N（MEM-03/04 已钉）；capacityVerdict 只算最终存活集，不碰任何 streak（C-2 规则 4 的返回里没有 streak 字段）。',
      }
      const hasStreakField = out.value && Object.keys(out.value).some((k) => /streak/i.test(k))
      if (hasStreakField) push('MEM05-STREAK', 'capacityVerdict 的返回值里出现了 streak 字段 —— 它只该算容量/分布，不该动 streak（C-2 规则 4）')

      caseFail(problems)
    })
  })

  test('MEM-06 边界容量 199/200/201 · 60000/60001 · 偏科不拒；非法 op 不产生部分结果', async () => {
    await runCase('MEM-06', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const mod = await memoryLib(rec, problems, ['capacityVerdict'])
      if (mod === null) caseFail(problems)

      const one = (text = 'x') => entry(999, 'general', text)
      const cases = [
        ['199 + 1 条 ⇒ 200（恰好允许）', mkEntries(199), [addOp(one())], true, null],
        ['200 + 1 条 ⇒ 201（越界）', mkEntries(200), [addOp(one())], false, 'E_CAP_COUNT'],
        ['恰好 60000 字符', [entry(1, 'general', 'x'.repeat(59999))], [addOp(entry(2, 'general', 'x'))], true, null],
        ['60001 字符（越界）', [entry(1, 'general', 'x'.repeat(60000))], [addOp(entry(2, 'general', 'x'))], false, 'E_CAP_CHARS'],
        ['省略 ops ⇒ 只看当前集合（delta 0）', mkEntries(3), undefined, true, null],
        ['空 ops ⇒ 同上', mkEntries(3), [], true, null],
      ]
      const results = {}
      for (const [label, ents, ops, wantOk, wantCode] of cases) {
        const r = call(mod.capacityVerdict, ops === undefined ? [ents] : [ents, ops], problems, `capacityVerdict(${label})`)
        results[label] = { ok: r.value?.ok ?? null, rejectCode: r.value?.rejectCode ?? null, count: r.value?.count ?? null, chars: r.value?.chars ?? null, deltaCount: r.value?.deltaCount ?? null }
        if (r.value === null) continue
        if (r.value.ok !== wantOk) push('CAPACITY', `${label}：ok 应为 ${wantOk}，实得 ${r.value.ok}（rejectCode=${r.value.rejectCode}）`)
        if (wantCode !== null && r.value.rejectCode !== wantCode) push('CAPACITY', `${label}：rejectCode 应为 ${wantCode}，实得 ${r.value.rejectCode}`)
        if (wantOk && (ops === undefined || ops.length === 0)) {
          if (r.value.deltaCount !== 0) push('CAPACITY', `${label}：C-2 规则 1 —— deltaCount 必须为 0，实得 ${r.value.deltaCount}`)
        }
      }
      rec.readings.capacity = results

      // 偏科：200 条全在一类，仍然允许（**四类不设硬帽**）
      const skewed = call(mod.capacityVerdict, [mkEntries(199, 'general'), [addOp(entry(999, 'general', 'x'))]], problems, 'capacityVerdict(偏科 200)')
      rec.readings.skewed = { ok: skewed.value?.ok ?? null, rejectCode: skewed.value?.rejectCode ?? null }
      if (skewed.value && skewed.value.ok !== true) push('CAPACITY-SKEW', `四类偏科不该被拒（无四类硬帽）——199+1 条全是 general 也必须通过，实得 ok=${skewed.value.ok} rejectCode=${skewed.value.rejectCode}`)

      // 非法 op ⇒ E_OP_INVALID 且**不产生部分结果**（入参一字不动）
      const legal = mkEntries(2)
      const legalSnapshot = JSON.stringify(legal)
      const badOps = [
        ['未知 kind', [{ kind: 'explode', id: legal[0].id }]],
        ['id 不存在（retire）', [{ kind: 'retire', id: 'm-deadbeef' }]],
        ['add 重复 id', [addOp({ ...legal[0] })]],
        ['modify 的 entry.id 与 id 不符', [{ kind: 'modify', id: legal[0].id, entry: { ...legal[0], id: 'm-ffffffff' } }]],
        ['merge 冲突（产物 id 与现存撞）', [{ kind: 'merge', ids: [legal[0].id, legal[1].id], entry: { ...legal[0] } }]],
        ['retag 的 typeId 非法', [{ kind: 'retag', id: legal[0].id, typeId: 'not-a-type' }]],
        ['合法 op 后面跟一个非法 op（不许产生部分结果）', [addOp(entry(500, 'general', 'x')), { kind: 'retire', id: 'm-deadbeef' }]],
      ]
      const badResults = {}
      for (const [label, ops] of badOps) {
        const r = call(mod.capacityVerdict, [legal, ops], problems, `capacityVerdict(${label})`)
        badResults[label] = { ok: r.value?.ok ?? null, rejectCode: r.value?.rejectCode ?? null }
        if (r.value === null) continue
        if (r.value.ok !== false || r.value.rejectCode !== FROZEN.capacityOps.rejectCode) {
          push('OP-INVALID', `${label}：应返回 ok:false / rejectCode=${FROZEN.capacityOps.rejectCode}，实得 ok=${r.value.ok} / ${r.value.rejectCode}`)
        }
      }
      rec.readings.bad_ops = badResults
      if (JSON.stringify(legal) !== legalSnapshot) push('OP-PARTIAL', '非法 op 之后入参 entries 被改动了 —— C-2 规则 3：**不产生部分结果**（纯函数，入参一字不动）')

      // 逐类硬帽键名扫描（返回对象里不许有）
      const capKeyRe = /(^|_)(cap|limit|max|quota)_?(count|chars|entries)?$/i
      const found = Object.keys(skewed.value ?? {}).filter((k) => capKeyRe.test(k))
      rec.readings.cap_keys = found
      if (found.length > 0) push('TYPE-CAP', `capacityVerdict 的返回里出现逐类上限字段：${found.join(', ')}（四类不设硬帽）`)
      rec.readings.ops_shape_frozen = FROZEN.capacityOps

      caseFail(problems)
    })
  })

  test('MEM-07 v0 初始化/缺失/损坏；旧 .team 记忆不自动导入；空候选也出报告', async () => {
    await runCase('MEM-07', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('MEM-07', 'v0')
      if (!stagingExists('bin/agenia-brain.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 初始化/快照读取拿不到（预期的首跑红）')
        caseFail(problems)
      }
      // ① 初始化空 v0
      const init = runBrain('init', {}, { dataRoot: bp.root })
      rec.readings.init = { exit_code: init.exit_code, code: init.json?.error?.code ?? null, snapshot_version: init.json?.snapshot_version ?? null }
      if (init.exit_code !== 0) push('INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
      else {
        if (init.json?.snapshot_version !== 'v0') push('INIT', `初始快照版本应为 v0，实得 ${JSON.stringify(init.json?.snapshot_version)}`)
        if (typeof init.json?.common_sense_sha256 !== 'string' || init.json.common_sense_sha256.length !== 64) push('INIT', `init 必须给常识哈希（64 hex），实得 ${JSON.stringify(init.json?.common_sense_sha256)}`)
      }
      // ② 缺失 / 损坏
      //    **D-B3（追加裁定 v1.3）**：`init` 只在**空根**成功；非空根 ⇒ `E_DATA_EXISTS`（exit 7）。
      const again = runBrain('init', {}, { dataRoot: bp.root })
      rec.readings.init_twice = { exit_code: again.exit_code, code: again.json?.error?.code ?? null }
      if (again.exit_code === 0) push('INIT-NONEMPTY', '非空根上再 init 竟然成功了 —— D-B3 冻结：非空根必须 `E_DATA_EXISTS`（exit 7）')
      else {
        if (again.json?.error?.code !== FROZEN.initRequiresEmptyRoot.code) push('INIT-NONEMPTY', `非空根上再 init 的错误码应为 ${FROZEN.initRequiresEmptyRoot.code}，实得 ${again.json?.error?.code}`)
        if (again.exit_code !== FROZEN.initRequiresEmptyRoot.exit) push('INIT-NONEMPTY', `非空根上再 init 的退出码应为 ${FROZEN.initRequiresEmptyRoot.exit}，实得 ${again.exit_code}`)
      }
      const missing = runBrain('snapshot-read', { version: 'v99' }, { dataRoot: bp.root })
      rec.readings.missing_snapshot = { exit_code: missing.exit_code, code: missing.json?.error?.code ?? null }
      if (missing.exit_code === 0) push('SNAPSHOT-MISSING', '读不存在的快照必须失败（E_DATA_MISSING），不许返回空快照')
      const snapFile = path.join(bp.snapshotsDir, 'v0.json')
      if (stagingExists('bin/agenia-brain.mjs') && readSafe(snapFile) !== null) {
        // 半截快照夹具：用**本文件这个 2 参**本地助手（`writeTextFixture`）。
        // ⚠️ 原先写成了 `writeFixtureText` —— 那是 `support/sut.mjs` 的 **3+ 参**助手、而且这里**根本没 import 它**
        //    ⇒ 一旦 `bin/agenia-brain.mjs` 到位、这一支真的跑起来，就是 `ReferenceError`（红在脚手架而不是被测对象上）。
        writeTextFixture(snapFile, '{ "schema": 1, "version": "v0", "entries": [')
        const corrupt = runBrain('snapshot-read', { version: 'v0' }, { dataRoot: bp.root })
        rec.readings.corrupt_snapshot = { exit_code: corrupt.exit_code, code: corrupt.json?.error?.code ?? null }
        if (corrupt.exit_code === 0) push('SNAPSHOT-CORRUPT', '半截快照必须 E_DATA_CORRUPT，不许当成空库')
        else if (corrupt.json?.error?.code !== 'E_DATA_CORRUPT') push('SNAPSHOT-CORRUPT', `半截快照应以 E_DATA_CORRUPT 拒绝，实得 ${corrupt.json?.error?.code}`)
      }
      // ③ 旧 .team 记忆不许被自动导入
      // 🔴 裁定 v1.13 ①：**换独立空脑根**。原先借的是上面那个"已经被我写坏半截快照"的根 ⇒ `entry-count` 必然退 7、
      //    这条断言 `if (exit_code === 0 && …)` **恒不触发**（"没检查"长得像"检查过了"）。
      //    断言内容照旧：旧 `.team` 记忆不自动导入 ⇒ `count` 必须是 0。
      const ws = scenarioWorkspace('MEM-07', 'legacy-team')
      writeTextFixture(path.join(ws, '.team', 'test', 'memory.md'), '- （夹具）旧本子里的一条经验：谁验过才算数。\n')
      const lbp = caseBrainRoot('MEM-07', 'legacy')
      const linit = runBrain('init', {}, { dataRoot: lbp.root })
      writeTextFixture(path.join(lbp.root, '.team', 'test', 'memory.md'), '- （夹具）躺在数据根里的旧本子：更要紧，绝不许被自动导入。\n')
      const count = runBrain('entry-count', {}, { dataRoot: lbp.root })
      rec.readings.legacy_root = { root: lbp.root, init_exit: linit.exit_code, init_code: linit.json?.error?.code ?? null }
      rec.readings.entry_count = { exit_code: count.exit_code, code: count.json?.error?.code ?? null, count: count.json?.count ?? null }
      // 「期望必须存在」前置（裁定 v1.13 ②③）：读数拿不到 ⇒ **红**，不许静默跳过
      if (linit.exit_code !== 0) push('LEGACY-ROOT-INIT', `独立空脑根的 init 必须成功（否则下面"条数为 0"根本读不到），实得 exit=${linit.exit_code} / ${linit.json?.error?.code ?? '(无码)'}`)
      if (count.exit_code !== 0) {
        push('ENTRY-COUNT-UNREADABLE', `entry-count 必须能读出来（"旧记忆不自动导入"这条全押在它上面），实得 exit=${count.exit_code} / ${count.json?.error?.code ?? '(无码)'}`)
      } else if (count.json?.count !== 0) {
        push('NO-AUTO-IMPORT', `v0 空库的条数应为 0，实得 ${count.json?.count} —— 旧 .team 记忆**不许**被自动导入（要走提案）`)
      }
      // ④ 第一天空候选批照常判决出报告
      rec.readings.empty_batch = {
        note: '「空候选批也照常判决出报告」要 judge-commit + report-read 两跳（STO/JOB 批的主场）⇒ 本用例只断言 init 之后的空库读数与"缺快照不静默"。',
      }
      caseFail(problems)
    })
  })

  test('MEM-08 常识 SHA 三处核对：无确认停更、确认后记人/时间、运行中再改拒提交', async () => {
    await runCase('MEM-08', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('MEM-08', 'cs')
      if (!stagingExists('bin/agenia-brain.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 常识哈希核对拿不到（预期的首跑红）')
        caseFail(problems)
      }
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) {
        push('MEM08-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
        caseFail(problems)
      }
      // ① 无老板确认的常识改动 ⇒ 判决提交必须被拒
      const unconfirmed = runBrain('judge-commit', {
        generation: 1, attempt: 1, token: 'tok', base_snapshot: 'v0',
        entries_patch: [{ kind: 'add', entry: entry(1, 'general', '（夹具）一条') }],
        accepted: [], maintenance_decisions: [],
        common_sense_sha256: 'c'.repeat(64), // 与 init 记下的那个不同，且没人确认过
        report: {},
      }, { dataRoot: bp.root })
      rec.readings.unconfirmed = { exit_code: unconfirmed.exit_code, code: unconfirmed.json?.error?.code ?? null }
      if (unconfirmed.exit_code === 0) push('CS-UNCONFIRMED', '常识改了却没有老板确认 ⇒ 提交必须被拒（E_CS_UNCONFIRMED）')
      // ② 老板确认 ⇒ 记新哈希 + 确认人 + 时间
      const confirm = runBrain('cs-confirm', { sha256: 'c'.repeat(64), confirmed_by: 'boss', confirmed_at: '2026-10-14T10:05:00+08:00' }, { dataRoot: bp.root })
      rec.readings.cs_confirm = { exit_code: confirm.exit_code, code: confirm.json?.error?.code ?? null, sha: confirm.json?.common_sense_sha256 ?? null }
      if (confirm.exit_code !== 0) push('CS-CONFIRM', `cs-confirm 必须成功（正例），实得 exit=${confirm.exit_code} / ${confirm.json?.error?.code ?? '(无码)'}`)
      else if (confirm.json?.common_sense_sha256 !== 'c'.repeat(64)) push('CS-CONFIRM', `确认后必须回新的常识哈希，实得 ${JSON.stringify(confirm.json?.common_sense_sha256)}`)
      // ③ 运行中再改 ⇒ 拒提交（E_CS_CHANGED）
      rec.readings.cs_changed_note = {
        note: '「判决运行中再改常识 ⇒ 拒提交（E_CS_CHANGED）」需要 judge-start 与 judge-commit 之间的时间窗 + 真子进程（STO-01/03 批的主场）；这里只钉"无确认必拒 + 确认记人/时间"两侧。',
      }
      rec.readings.cli_note = { note: '三处核对（启动 / 判决开始 / 提交）都带 common_sense_sha256：本用例覆盖了提交这一处的两个方向。' }
      caseFail(problems)
    })
  })

  test('MEM-09 快照发布字段齐全/原子/损坏可检测/旧快照只读', async () => {
    await runCase('MEM-09', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('MEM-09', 'snapshot')
      if (!stagingExists('bin/agenia-brain.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 快照发布/归档拿不到（预期的首跑红）')
        caseFail(problems)
      }
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) {
        push('MEM09-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
        caseFail(problems)
      }
      const read = runBrain('snapshot-read', {}, { dataRoot: bp.root })
      rec.readings.snapshot_read = { exit_code: read.exit_code, code: read.json?.error?.code ?? null }
      if (read.exit_code !== 0) push('SNAPSHOT-READ', `snapshot-read（current）必须成功（正例），实得 exit=${read.exit_code} / ${read.json?.error?.code ?? '(无码)'}`)
      else {
        const snap = read.json?.snapshot ?? {}
        for (const key of ['schema', 'version', 'parent_version', 'generated_at', 'common_sense_sha256', 'entries', 'distribution', 'totals', 'char_metric', 'accepted_proposal_ids', 'accepted_maintenance_ids', 'archived', 'publication_version']) {
          if (!(key in snap)) push('SNAPSHOT-FIELDS', `快照缺字段 ${key}（提案 §B3.6 的必填表）`)
        }
        if (Array.isArray(snap.distribution) && snap.distribution.length !== 4) push('SNAPSHOT-FIELDS', `distribution 必须恰 4 项，实得 ${snap.distribution.length}`)
        if (snap.totals && Array.isArray(snap.distribution)) {
          const sc = snap.distribution.reduce((a, d) => a + (d.count ?? 0), 0)
          if (sc !== snap.totals.count) push('SNAPSHOT-FIELDS', `sum(distribution.count)=${sc} ≠ totals.count=${snap.totals.count}`)
        }
        if (snap.version === 'v0' && snap.parent_version !== null) push('SNAPSHOT-FIELDS', `v0 的 parent_version 必须是 null，实得 ${JSON.stringify(snap.parent_version)}`)
        // D-B4：快照条目必须带 `is_double_low`（发布值），否则斩杀资格没法判
        const entries = Array.isArray(snap.entries) ? snap.entries : []
        for (const field of FROZEN.snapshotEntryExtraFields) {
          const missingField = entries.filter((e) => !(field in e))
          if (missingField.length > 0) push('SNAPSHOT-ENTRY-FIELDS', `快照条目缺 ${field}（D-B4 要求它进 schema）：${missingField.length}/${entries.length} 条没有`)
        }
        for (const e of entries) {
          if ('is_double_low' in e && typeof e.is_double_low !== 'boolean') push('SNAPSHOT-ENTRY-FIELDS', `${e.id ?? '(无 id)'} 的 is_double_low 必须是 boolean，实得 ${JSON.stringify(e.is_double_low)}`)
        }
        rec.readings.snapshot = { version: snap.version, parent_version: snap.parent_version, publication_version: snap.publication_version, entry_count: entries.length, fields: Object.keys(snap) }
      }
      // 旧快照只读：归档之后 v0 的内容哈希不许变
      const snapFile = path.join(bp.snapshotsDir, 'v0.json')
      const before = sha256Of(snapFile)
      const archive = runBrain('snapshot-archive', { version: 'v0', reason: '（夹具）归档只读检查' }, { dataRoot: bp.root })
      rec.readings.archive = { exit_code: archive.exit_code, code: archive.json?.error?.code ?? null }
      if (archive.exit_code === 0) {
        const after = sha256Of(snapFile)
        rec.readings.archive_hash = { before, after }
        if (before !== after) push('ARCHIVE-READONLY', '归档改动（或删除）了被归档的快照本体 —— 旧快照必须只读')
      } else {
        push('ARCHIVE', `snapshot-archive 必须成功（正例），实得 exit=${archive.exit_code} / ${archive.json?.error?.code ?? '(无码)'}`)
      }
      rec.readings.atomic_note = {
        note: '「原子发布 / 直写 / 半写」的写面在 STO-01（事务）与 DR-02（临时件落点）里正面测；本用例只钉"发布字段齐全 + 归档只读 + 缺/坏快照不静默"。',
      }
      caseFail(problems)
    })
  })

  test('MEM-11 提案导入：schema/基准版本/来源/内容 SHA/fence；旧 attempt 拒收；不许改原文', async () => {
    await runCase('MEM-11', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('MEM-11', 'import')
      if (!stagingExists('bin/agenia-brain.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 提案导入拿不到（预期的首跑红）')
        caseFail(problems)
      }
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) {
        push('MEM11-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
        caseFail(problems)
      }
      const payload = { entry: entry(1, 'general', '（夹具）一条经验：没人验过的改动不算完成。') }
      const base = { source: 'dev/2026-10-14/提案草稿.json', sha256: 'd'.repeat(64), base_snapshot: 'v0', update_generation: 1, review_attempt: 1, payload }
      // ① 正例
      const ok = runBrain('proposal-import', base, { dataRoot: bp.root })
      rec.readings.import_ok = { exit_code: ok.exit_code, code: ok.json?.error?.code ?? null, imported_id: ok.json?.imported_id ?? null }
      if (ok.exit_code !== 0) push('MEM11-IMPORT', `合法导入必须成功（正例），实得 exit=${ok.exit_code} / ${ok.json?.error?.code ?? '(无码)'}`)
      // ② 负例：缺字段 / 基准版本不对 / 哈希不符 / fence 过期
      const negatives = [
        ['缺 source', { ...base, source: '' }, ['E_ARG_SCHEMA']],
        ['缺 sha256', { ...base, sha256: '' }, ['E_ARG_SCHEMA', 'E_ARG_HASH']],
        ['sha256 形状不对', { ...base, sha256: 'not-a-hash' }, ['E_ARG_HASH', 'E_ARG_SCHEMA']],
        ['基准版本不存在', { ...base, base_snapshot: 'v99' }, ['E_FENCE_STALE', 'E_DATA_MISSING']],
        ['generation 过期', { ...base, update_generation: 0 }, ['E_FENCE_STALE', 'E_ARG_SCHEMA']],
        ['review_attempt 过期', { ...base, review_attempt: 99 }, ['E_FENCE_STALE']],
      ]
      const negResults = {}
      for (const [label, pl, codes] of negatives) {
        const res = runBrain('proposal-import', pl, { dataRoot: bp.root })
        negResults[label] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
        if (res.exit_code === 0) push('MEM11-NEGATIVE', `${label} 必须被拒，实得 exit=0`)
        else if (!codes.includes(res.json?.error?.code)) push('MEM11-NEGATIVE', `${label} 的码应在 ${codes.join('|')} 里，实得 ${res.json?.error?.code}`)
      }
      rec.readings.import_negatives = negResults
      // ③ 组长不得修改原文：内容 SHA 必须与导入时一致（改一个字 ⇒ 再导入同 id/同内容应被拒或记为另一条）
      const tampered = { ...base, payload: { entry: { ...payload.entry, text: '（夹具）被改过的一个字。' } } }
      const res2 = runBrain('proposal-import', tampered, { dataRoot: bp.root })
      rec.readings.import_tampered = { exit_code: res2.exit_code, code: res2.json?.error?.code ?? null }
      if (res2.exit_code === 0) {
        push('MEM11-TAMPER', '内容改了却用同一个 sha256 导入竟然成功 —— 内容 SHA 必须真的校验（组长不得修改原文）')
      }
      rec.readings.draft_paths = {
        note: '「有 shell 的岗位用 appending 命令、无 shell 的岗位写自己区草稿后组长导入」= 工具面/流程面（REV-02 已钉无 shell；导入面就是本用例的 proposal-import）。',
      }
      caseFail(problems)
    })
  })

  test('MEM-12 普通提案不许删/并/退/改类型；斩杀只经复核→次日判决；归档可查回', async () => {
    await runCase('MEM-12', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('MEM-12', 'ordinary')
      if (!stagingExists('bin/agenia-brain.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 处置矩阵拿不到（预期的首跑红）')
        caseFail(problems)
      }
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) {
        push('MEM12-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`)
        caseFail(problems)
      }
      // ① 普通提案只能新增/修改（**正例先钉住**，否则下面的"一律拒"可能只是命令坏了）
      const legalImport = runBrain('proposal-import', {
        source: 'dev/2026-10-14/提案草稿.json', sha256: 'c1'.repeat(32),
        base_snapshot: 'v0', update_generation: 1, review_attempt: 1,
        payload: { entry: entry(1, 'general', '（夹具）一条合法的新增提案') },
      }, { dataRoot: bp.root })
      rec.readings.legal_import = { exit_code: legalImport.exit_code, code: legalImport.json?.error?.code ?? null }
      if (legalImport.exit_code !== 0) push('MEM12-POSITIVE', `普通提案（纯新增）必须能导入（正例），实得 exit=${legalImport.exit_code} / ${legalImport.json?.error?.code ?? '(无码)'}`)

      // ② 普通提案带删/并/退/改类型/斩杀 ⇒ 一律拒
      const illegalKinds = ['delete', 'remove', 'merge', 'retire', 'retag', 'cull']
      const results = {}
      for (const kind of illegalKinds) {
        const pl = {
          source: 'dev/2026-10-14/提案草稿.json', sha256: 'e'.repeat(64),
          base_snapshot: 'v0', update_generation: 1, review_attempt: 1,
          payload: { entry: entry(1, 'general', '（夹具）'), op: kind, kind, target_id: entry(1, 'general', '').id },
        }
        const res = runBrain('proposal-import', pl, { dataRoot: bp.root })
        results[kind] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
        if (res.exit_code === 0) push('MEM12-ORDINARY', `普通提案带 kind=${kind}（删/并/退/改类型/斩杀）必须被拒 —— 这些只能走复核→次日判决`)
        else if (!['E_ARG_SCHEMA', 'E_FENCE_STALE'].includes(res.json?.error?.code)) {
          push('MEM12-ORDINARY', `kind=${kind} 的拒绝码应是 E_ARG_SCHEMA（形状层），实得 ${res.json?.error?.code}`)
        }
      }
      rec.readings.illegal_kinds = results
      // ③ 斩杀目标超出 N 中资格集合 ⇒ E_STREAK_NOT_ELIGIBLE
      const cull = runBrain('judge-commit', {
        generation: 1, attempt: 1, token: 'tok', base_snapshot: 'v0',
        entries_patch: [], accepted: [],
        maintenance_decisions: [{ target_id: 'm-deadbeef', action: 'cull' }],
        common_sense_sha256: 'f'.repeat(64), report: {},
      }, { dataRoot: bp.root })
      rec.readings.cull_out_of_set = { exit_code: cull.exit_code, code: cull.json?.error?.code ?? null }
      if (cull.exit_code === 0) push('MEM12-CULL', '斩杀目标不在 N 的资格集合里却被批准了')
      // ③ 归档可查回 + 不自动删除
      rec.readings.archive_retrievable = {
        note: '已归档条目的"查回"路径依赖归档文件读取面（§B3.6 的 `archived[{entry_id, disposition, to}]` + 旧快照只读）；本用例钉"旧快照仍可读"（MEM-09 已做）与"没有自动删除"。',
      }
      rec.readings.no_cooldown = {
        note: '「同一审核无冷却 / 不限制数量」= 没有这类拒绝码；本用例**反向**断言：连着两次合法导入不许因为"太快"被拒。',
      }
      const twice = runBrain('proposal-import', {
        source: 'dev/2026-10-14/提案草稿.2.json', sha256: 'a1'.repeat(32),
        base_snapshot: 'v0', update_generation: 1, review_attempt: 1,
        payload: { entry: entry(2, 'general', '（夹具）第二条') },
      }, { dataRoot: bp.root })
      rec.readings.second_import = { exit_code: twice.exit_code, code: twice.json?.error?.code ?? null }
      // v1.14：这是**反向断言**，前置不能空转 ——
      //   ① 出现冷却/频率类拒绝码 ⇒ 红（冻结："无冷却、不限制数量"）；
      //   ② 因为**别的**原因失败 ⇒ 也红（"不限制数量"要求第二次合法导入照常成立；若实现另有口径请回组长）。
      if (twice.exit_code !== 0 && ['E_RATE_LIMIT', 'E_COOLDOWN'].includes(twice.json?.error?.code)) {
        push('MEM12-COOLDOWN', '出现了冷却/频率类的拒绝码 —— 冻结口径是"无冷却、不限制数量"')
      } else if (twice.exit_code !== 0) {
        push('MEM12-SECOND-IMPORT', `第二次**合法**导入必须成功（"无冷却、不限制数量"），实得 exit=${twice.exit_code} / ${twice.json?.error?.code ?? '(无码)'} —— 否则"没有冷却码"这条是空转`)
      }
      caseFail(problems)
    })
  })
})

// ── 小工具已提到文件顶部（保持 ESM：不许 require）──────────────────────────
