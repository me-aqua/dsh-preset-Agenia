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
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

/**
 * 一个 JSONL 文件的"有没有被动过"三件套：**sha256 + 字节数 + 非空行数**。
 *
 * 🔴 为什么三样都要（T-MEM-07 · V6）：只比 sha256 的话，"没人去读那个文件"和"文件真的没变"
 * 在读数上长得一模一样 —— 少一个维度就没法把"没变"证伪。三样一起钉，
 * 任一维度动了都会当场翻面；文件不存在时三样都记 `null` + `exists:false`（不抛）。
 */
const fileFacts = (file) => {
  let buf = null
  try {
    buf = readFileSync(file)
  } catch {
    return { exists: false, bytes: null, rows: null, sha256: null }
  }
  const text = buf.toString('utf8')
  return {
    exists: true,
    bytes: buf.length,
    rows: text.split(/\r?\n/).filter((l) => l.trim() !== '').length,
    sha256: createHash('sha256').update(buf).digest('hex'),
  }
}

/**
 * 一个**目录**的"有没有被动过"三件套（V6 · 契约 §3.1 的"不推状态"）。
 *
 * 为什么不钉 `state/update/<day>.json` 那一个文件：那是**挑了一天**当靶子 ——
 * 写到别的 day 里就逃过去了，而 `judge-pending` 连 day 都不收（契约 §3.2）。
 * ⇒ 钉**整个目录**：名字 + 每个文件的字节数与 sha256 汇总成一个聚合 sha256，多一个文件、少一个文件、
 * 任何一个字节变了，都会当场翻面。
 *
 * 🔴 第三样叫 **`parts_len`**，不叫 `bytes`（T-MEM-12 · R3）：它算的是
 * `parts.join('\n').length` = **那份聚合文本的字符数**，不是真字节数。
 * 同文件的 `fileFacts.bytes` 才是 `buf.length`（真字节）。同一个名字担两个意思
 * （`mig-rules-18` 的第一次形态）会让"拿它跟真字节比"的人撞一个假差 ——
 * 现在只因为前后都是这一个函数算的才没出事，不是它对了。
 */
const dirFacts = (dir) => {
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return { exists: false, entries: 0, parts_len: null, sha256: null }
  }
  const sorted = [...names].sort()
  const parts = sorted.map((name) => {
    const file = path.join(dir, name)
    let buf = null
    try {
      buf = readFileSync(file)
    } catch {
      return `${name}:unreadable`
    }
    return `${name}:${buf.length}:${createHash('sha256').update(buf).digest('hex')}`
  })
  return {
    exists: true,
    entries: sorted.length,
    parts_len: parts.join('\n').length,
    sha256: createHash('sha256').update(parts.join('\n')).digest('hex'),
  }
}

/** 读一个 JSONL；坏行**不跳过**（如实报第几行坏），文件不在算"空"（合法态：还没写过）。 */
const readJsonl = (file) => {
  let text = null
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    return { exists: err?.code !== 'ENOENT', rows: [], bad: err?.code === 'ENOENT' ? [] : [{ line: 0, message: String(err?.code ?? err) }] }
  }
  const rows = []
  const bad = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (line === '') continue
    try {
      rows.push(JSON.parse(line))
    } catch (err) {
      bad.push({ line: i + 1, message: String(err?.message).slice(0, 120) })
    }
  }
  return { exists: true, rows, bad }
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
      // ═══════════════════════════════════════════════════════════════════════
      // T-MEM-07「候选池的『已判』索引」—— V1–V6 + V9
      //   定形：`.team/leader/2026-10-16/定形-T-MEM-07.md` · 契约：`.team/test/2026-10-16/契约-T-MEM-07.md`
      //   · 为什么挂在本用例：注册表 `TOTAL === 55` 是**冻结契约**（不许加新用例 ID —— 加了会跑到分母之外），
      //     所以新判据并进最贴的那一条。先例：会话包 → REV-01 · data-root 判定 → DR-01。
      //   · 本块用**自己的脑根**（`init` 只许空根，复用上面那个会撞 `E_DATA_EXISTS`）。
      //   · 本块此刻应当是**红的**：`judge-pending` 这个 op 与 `judged.jsonl` 都还没实现。
      //     每一条红都点名"现在缺的是哪一样"，**不许 skip**。
      // ═══════════════════════════════════════════════════════════════════════
      const jbp = caseBrainRoot('MEM-11', 'judged')
      const jInit = runBrain('init', {}, { dataRoot: jbp.root })
      if (jInit.exit_code !== 0) {
        push('V1-DIFF', `「已判索引」那一路的独立脑根 init 必须成功（V1–V6/V9 的读数全押在它上面），实得 exit=${jInit.exit_code} / ${jInit.json?.error?.code ?? '(无码)'}`)
        caseFail(problems)
      }
      const jCs = jInit.json?.common_sense_sha256 ?? 'a'.repeat(64)
      const helpRes = runBrain('help', {}, { dataRoot: jbp.root })
      const helpOps = Array.isArray(helpRes.json?.ops) ? helpRes.json.ops : null
      const opPresent = helpOps !== null && helpOps.includes('judge-pending')
      const missingOpNote = opPresent
        ? ''
        : '【现在缺的是 `judge-pending` **这个 op 本身**：`--op help` 的 ops 里没有它（`bin/agenia-brain.mjs` 的 OP_NAMES / OPS 分派与 `lib/cli-inventory.mjs` 三处都还没有）】'
      const rp = (rec.readings.judge_pending = {
        root: jbp.root,
        op_present: opPresent,
        help_exit: helpRes.exit_code,
        help_ops_count: helpOps === null ? null : helpOps.length,
        runs: {},
      })

      const mkEntry = (n, text) => ({
        id: `m-${String(n).padStart(8, '0')}`,
        type: 'general',
        text,
        raw: 0.5,
        imp_share: 1,
        fresh_share: 1,
        double_low_streak: 0,
        is_double_low: false,
        last_evidence_review: '2026-10-14',
        known_from: 'fixture@T-MEM-07',
        created_at: '2026-10-14T00:00:00+08:00',
        type_changed_at: null,
      })
      // 导入一条候选（`bp` 是哪一个脑根就导到哪一个 —— K1/K2/K4 各有自己的根，互不串味）。
      const importCandInto = (bp, n, text, tag = '') => runBrain('proposal-import', {
        source: `dev/2026-10-14/T-MEM-07-${tag}候选-${n}.json`,
        sha256: String(n).repeat(64),
        base_snapshot: 'v0', update_generation: 1, review_attempt: 1,
        payload: { entry: mkEntry(n, text) },
      }, { dataRoot: bp.root })
      const importCand = (n, text) => importCandInto(jbp, n, text)
      const idsOfPool = () => {
        const pool = readJsonl(jbp.poolFile)
        return { pool, ids: pool.rows.map((r) => r?.imported_id) }
      }
      /**
       * 跑一次 `judge-pending` 并把"这一次有没有动盘"记下来（V6 就钉在这里）。
       * 只读 op 的判据**不是**"它说自己只读"，而是**跑前跑后四样的读数**：
       * `pool.jsonl` / `judged.jsonl`（sha256 + 字节 + 非空行数）· `audit.jsonl`（同三样）·
       * `state/update/` 整个目录（名字 + 逐文件 sha256 的聚合）。
       * 🔴 后两样是 2026-10-16 补的（评审 B2）：契约 §3.1 的 `writes:false` 含"不推状态、不落审计"，
       *    原来只钉了两个 jsonl ⇒ 顺手写一条 audit / 推一次状态，V6 照样绿。
       * @param {string} label 这一次的记忆名（读数与红报文里点名它）
       * @param {object} [opts] `{ bp }` —— 换一个脑根跑（K1/K2/K4 各有自己的根）
       */
      const pendingRunOn = (bp, label) => {
        const facts = () => ({
          pool: fileFacts(bp.poolFile),
          judged: fileFacts(bp.judgedFile),
          audit: fileFacts(bp.auditFile),
          updateDir: dirFacts(bp.updateDir),
        })
        const before = facts()
        const res = runBrain('judge-pending', {}, { dataRoot: bp.root })
        const after = facts()
        const row = {
          root: bp.root,
          exit_code: res.exit_code,
          code: res.json?.error?.code ?? null,
          count: res.json?.count ?? null,
          pending_ids: res.json?.pending_ids ?? null,
          pool_count: res.json?.pool_count ?? null,
          judged_rows: res.json?.judged_rows ?? null,
          judged_ids: res.json?.judged_ids ?? null,
          orphan_ids: res.json?.orphan_ids ?? null,
          orphan_count: res.json?.orphan_count ?? null,
          stdout: res.stdout,
          before,
          after,
          pool_moved: JSON.stringify(before.pool) !== JSON.stringify(after.pool),
          judged_moved: JSON.stringify(before.judged) !== JSON.stringify(after.judged),
          audit_moved: JSON.stringify(before.audit) !== JSON.stringify(after.audit),
          state_moved: JSON.stringify(before.updateDir) !== JSON.stringify(after.updateDir),
        }
        rp.runs[label] = row
        if (row.pool_moved) {
          push('V6-POOL-UNCHANGED', `跑完 judge-pending「${label}」之后 \`pool.jsonl\` 变了：${JSON.stringify(before.pool)} → ${JSON.stringify(after.pool)} —— 只读 op 不许动池子（sha256 / 字节数 / 行数三样都要同）`)
        }
        if (row.judged_moved) {
          push('V6-JUDGED-UNCHANGED', `跑完 judge-pending「${label}」之后 \`judged.jsonl\` 变了：${JSON.stringify(before.judged)} → ${JSON.stringify(after.judged)} —— 只读 op 不许动索引`)
        }
        if (row.audit_moved) {
          push('V6-AUDIT-UNCHANGED', `跑完 judge-pending「${label}」之后 \`audit.jsonl\` 变了：${JSON.stringify(before.audit)} → ${JSON.stringify(after.audit)} —— 契约 §3.1 的 \`writes:false\` 含"不落审计"，只读 op 一条都不许写`)
        }
        if (row.state_moved) {
          push('V6-STATE-UNCHANGED', `跑完 judge-pending「${label}」之后 \`state/update/\` 这个目录变了：${JSON.stringify(before.updateDir)} → ${JSON.stringify(after.updateDir)} —— 契约 §3.1 的 \`writes:false\` 含"不推状态"，只读 op 一个字节都不许推`)
        }
        return row
      }
      const pendingRun = (label, opts = {}) => pendingRunOn(opts.bp ?? jbp, label)

      // ═══ 契约 §3.3 最后一格：**两个文件都不存在**是合法空态（评审 K5）═══
      //   病根：原来第一次 `judge-pending` 排在三次导入**之后** ⇒ "根上什么都没有"这个真实开局
      //   在整个套件里从没被调用过 ⇒ 那一格没有任何能红的断言。
      //   现在它在 `init` 之后、第一次导入之前跑 —— 此刻 `proposals/` 里一个文件都没有。
      const r0 = pendingRun('v0_empty')
      rp.empty_state = { exit_code: r0.exit_code, code: r0.code, pending_ids: r0.pending_ids, count: r0.count, pool_count: r0.pool_count, judged_rows: r0.judged_rows, judged_ids: r0.judged_ids, orphan_count: r0.orphan_count }
      if (r0.exit_code !== 0) {
        push('JP-EMPTY', `池子与索引**都不存在**是合法空态（契约 §3.3 最后一格），必须 exit 0，实得 exit=${r0.exit_code} / ${r0.code ?? '(无码)'}${missingOpNote}`)
      } else {
        if (!Array.isArray(r0.pending_ids) || r0.pending_ids.length !== 0) {
          push('JP-EMPTY', `池子与索引都不存在时 \`pending_ids\` 必须是空数组（根上还没导入过任何候选），实得 ${JSON.stringify(r0.pending_ids)}`)
        }
        if (r0.count !== 0) push('JP-EMPTY', `空态 \`count\` 必须是 0，实得 ${JSON.stringify(r0.count)}`)
        if (r0.pool_count !== 0) push('JP-EMPTY', `空态 \`pool_count\` 必须是 0（池子文件不存在 ⇒ 0 行），实得 ${JSON.stringify(r0.pool_count)}`)
        if (r0.judged_rows !== 0) push('JP-EMPTY', `空态 \`judged_rows\` 必须是 0（索引文件不存在 ⇒ 0 行），实得 ${JSON.stringify(r0.judged_rows)}`)
        if (r0.judged_ids !== 0) push('JP-EMPTY', `空态 \`judged_ids\` 必须是 0，实得 ${JSON.stringify(r0.judged_ids)}`)
      }

      // ── 输入：三条候选入池（池子的 seq 顺序 = 导入顺序，V1 的"稳定顺序"就按它）──
      const imp1 = importCand(1, '（夹具·T-MEM-07）候选一')
      const imp2 = importCand(2, '（夹具·T-MEM-07）候选二')
      const imp3 = importCand(3, '（夹具·T-MEM-07）候选三')
      const pool0 = idsOfPool()
      const DAY_J = imp1.json?.day ?? null
      rp.pool_ids = pool0.ids
      rp.day = DAY_J
      if (pool0.ids.length !== 3 || pool0.pool.bad.length > 0 || typeof DAY_J !== 'string') {
        push('V1-DIFF', `池子里必须正好 3 条候选（V1 的输入），实得 ${JSON.stringify(pool0.ids)}；三次导入退出码=${[imp1, imp2, imp3].map((r) => r.exit_code).join('/')} 码=${[imp1, imp2, imp3].map((r) => r.json?.error?.code ?? '-').join('/')} · day=${JSON.stringify(DAY_J)}`)
        caseFail(problems)
      }
      const [cA, cB, cC] = pool0.ids

      // ── V1 差集算得对 + 顺序稳定（此刻 judged 一行都没有 ⇒ 差集 = 池子本身）──
      const r1 = pendingRun('v1_first')
      const r2 = pendingRun('v1_second')
      if (r1.exit_code !== 0) {
        push('V1-DIFF', `judge-pending 必须能在"池子 3 条 / 索引一行都没有"的根上成功（正例），实得 exit=${r1.exit_code} / ${r1.code ?? '(无码)'}${missingOpNote}`)
      } else {
        if (JSON.stringify(r1.pending_ids) !== JSON.stringify(pool0.ids)) {
          push('V1-DIFF', `pending_ids 必须 = 池子 − 已判 = ${JSON.stringify(pool0.ids)}（按池子 seq 顺序），实得 ${JSON.stringify(r1.pending_ids)}`)
        }
        if (r1.count !== (r1.pending_ids ?? []).length) {
          push('V1-DIFF', `count=${JSON.stringify(r1.count)} 与 pending_ids.length=${(r1.pending_ids ?? []).length} 对不上 —— 两个名字必须担同一个意思`)
        }
        if (r1.pool_count !== pool0.ids.length) {
          push('V1-DIFF', `pool_count=${JSON.stringify(r1.pool_count)} 与池子行数 ${pool0.ids.length} 对不上`)
        }
        if (r1.judged_rows !== 0) {
          push('V1-DIFF', `索引还一行都没写过，judged_rows 应为 0，实得 ${JSON.stringify(r1.judged_rows)}`)
        }
      }
      if (r1.exit_code === 0 && r2.exit_code === 0 && r1.stdout !== r2.stdout) {
        push('V1-STABLE', `同一份输入跑两次，输出必须**逐字节相同**；实得两次 stdout 不同：${JSON.stringify(r1.stdout).slice(0, 240)} vs ${JSON.stringify(r2.stdout).slice(0, 240)}（⇒ 输出里不许有时钟字段，如 at / now / generated_at）`)
      }

      // ═══════════════════════════════════════════════════════════════════════
      // V1「顺序 = 池子行的 `seq` 升序」—— K1：**一份「文件行序 ≠ seq 序」的池子**（2026-10-16 返修）
      //
      // 🔴 病根（评审报告 K1）：上面那一格的期望值 `pool0.ids` 是**读池子文件的行序**得来的，
      //    而实现也是按文件行序出 ⇒ 两边取自同一个来源 ⇒ **它不可能红**。
      //    而且那批 id 是零填充的 `…-0001…0003` ⇒ 字典序 == 数值序 == 文件序，
      //    "改成字典序就翻红"这句承诺根本不成立。
      //
      // ⇒ 这一格的**期望值只从两处来，一处都不是"那份池子文件的行序"**：
      //    ① 导入命令**返回**的 `imported_id`（另一个来源）；
      //    ② **我这里手工指定**的 `seq` 值（写下去的就是我定的，不是从文件里读回来的）。
      // ⇒ 池子是**手改过的**（契约 §3.3 亲口承认这是真实来历之一）：合法 JSON、`imported_id` 都在，
      //    但**文件行序 ≠ seq 序**。
      // ═══════════════════════════════════════════════════════════════════════
      const k1 = caseBrainRoot('MEM-11', 'seq-order')
      const k1Init = runBrain('init', {}, { dataRoot: k1.root })
      if (k1Init.exit_code !== 0) {
        push('V1-SEQ-ORDER', `「顺序按 seq」这一格的独立脑根 init 必须成功，实得 exit=${k1Init.exit_code} / ${k1Init.json?.error?.code ?? '(无码)'}`)
      } else {
        const k1Imports = [1, 2, 3].map((n) => importCandInto(k1, n, `（夹具·T-MEM-07·seq）候选${n}`, 'seq-'))
        const k1Ids = k1Imports.map((r) => r.json?.imported_id ?? null)
        const k1RowsById = new Map(readJsonl(k1.poolFile).rows.map((r) => [r?.imported_id, r])) // 只用来取"那三行原文"
        const [idA, idB, idC] = k1Ids
        const k1Ready = k1Ids.every((id) => typeof id === 'string') && k1Ids.every((id) => k1RowsById.has(id))
        rp.seq_order = {
          ids_from_import: k1Ids,
          imports_exit: k1Imports.map((r) => r.exit_code),
          note: '期望值取自"导入命令返回的 imported_id" + "我手工写下去的 seq 值" —— 两处都不是池子文件的行序。',
        }
        if (!k1Ready) {
          push('V1-SEQ-ORDER', `前置：三条候选必须导进 seq-order 根，实得 imported_id=${JSON.stringify(k1Ids)}（退出码 ${k1Imports.map((r) => r.exit_code).join('/')}，码 ${k1Imports.map((r) => r.json?.error?.code ?? '-').join('/')}）${missingOpNote}`)
        } else {
          // 文件行序固定为 **B、C、A**；`seq` 值由我指定（不读文件里的值）
          const k1FileOrder = [idB, idC, idA]
          const writeK1Pool = (seqOf) => writeFileSync(
            k1.poolFile,
            `${k1FileOrder.map((id) => JSON.stringify({ ...k1RowsById.get(id), seq: seqOf[id] })).join('\n')}\n`,
            'utf8',
          )
          const bySeq = (seqOf) => [...k1Ids].sort((x, y) => seqOf[x] - seqOf[y])

          // ① 第一版 seq：A→2 · B→3 · C→1 ⇒ 按 seq 升序应是 [C, A, B]（**与文件行序 B,C,A 不同**）
          const seq1 = { [idA]: 2, [idB]: 3, [idC]: 1 }
          writeK1Pool(seq1)
          const want1 = bySeq(seq1)
          const k1r1 = pendingRun('k1_file_order_ne_seq_order', { bp: k1 })
          rp.seq_order.run1 = { file_order: k1FileOrder, seq: seq1, want_by_seq: want1, got: k1r1.pending_ids, exit_code: k1r1.exit_code, code: k1r1.code }
          if (k1r1.exit_code !== 0) {
            push('V1-SEQ-ORDER', `手改过的池子（合法 JSON、imported_id 都在）上 \`judge-pending\` 必须照常成功，实得 exit=${k1r1.exit_code} / ${k1r1.code ?? '(无码)'}${missingOpNote}`)
          } else {
            if (k1r1.pool_count !== 3) {
              push('V1-SEQ-ORDER', `夹具：手改过的池子必须仍是 3 条，实得 pool_count=${JSON.stringify(k1r1.pool_count)}`)
            }
            if (JSON.stringify(k1FileOrder) === JSON.stringify(want1)) {
              push('V1-SEQ-ORDER', `夹具失效：这一版 seq 赋值让"文件行序"与"seq 序"恰好相同（${JSON.stringify(want1)}）⇒ 这一格又变成自证，必须重排——不是通过`)
            }
            if (JSON.stringify(k1r1.pending_ids) !== JSON.stringify(want1)) {
              push('V1-SEQ-ORDER', `\`pending_ids\` 必须按池子行的 **\`seq\` 数值升序** = ${JSON.stringify(want1)}（seq=${JSON.stringify(seq1)}；文件行序是 ${JSON.stringify(k1FileOrder)}），实得 ${JSON.stringify(k1r1.pending_ids)} —— 现在缺的是"按 \`seq\` 排序"这一半：实现直接按**文件行序**出（池子被手改过时两个答案会分叉，而契约 §3.3 亲口承认池子会被手改）`)
            }
          }

          // ② **翻面实测（写在套件里）**：文件行序一个字不动，只把 seq 重新分配（→ A→1 · B→2 · C→3）。
          //    输出必须跟着 seq 变。若两次输出逐字相同 ⇒ 排序根本没看 seq（这也是一条真判据）。
          const seq2 = { [idA]: 1, [idB]: 2, [idC]: 3 }
          writeK1Pool(seq2)
          const want2 = bySeq(seq2)
          const k1r2 = pendingRun('k1_same_file_order_other_seq', { bp: k1 })
          rp.seq_order.run2 = { file_order: k1FileOrder, seq: seq2, want_by_seq: want2, got: k1r2.pending_ids, exit_code: k1r2.exit_code, code: k1r2.code }
          if (k1r2.exit_code !== 0) {
            push('V1-SEQ-ORDER', `第二次（同一份文件行序、另一套 seq）\`judge-pending\` 必须成功，实得 exit=${k1r2.exit_code} / ${k1r2.code ?? '(无码)'}${missingOpNote}`)
          } else if (JSON.stringify(k1r2.pending_ids) !== JSON.stringify(want2)) {
            push('V1-SEQ-ORDER', `只把 \`seq\` 重新分配之后，\`pending_ids\` 必须跟着变成 ${JSON.stringify(want2)}（seq=${JSON.stringify(seq2)}），实得 ${JSON.stringify(k1r2.pending_ids)}`)
          }
          if (k1r1.exit_code === 0 && k1r2.exit_code === 0 && JSON.stringify(k1r1.pending_ids) === JSON.stringify(k1r2.pending_ids)) {
            push('V1-SEQ-ORDER', `**同一份文件行序**、只把 \`seq\` 重新分配（${JSON.stringify(seq1)} → ${JSON.stringify(seq2)}），两次输出却逐字相同（${JSON.stringify(k1r1.pending_ids)}）⇒ 排序根本没看 \`seq\`：缺的就是"按 \`seq\` 数值升序"这一半`)
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 定形 T-MEM-12 · R2a / R2b / R1 —— 三格都钉 `opJudgePending` 的**排序键**与**去重位置**
      //   定形：`.team/leader/2026-10-16/定形-T-MEM-12.md` §五 W1 / W2 / W3
      //   契约更正：`.team/test/2026-10-16/契约-T-MEM-07.md` §七（R1 那一句）
      //   R2b 那一格 2026-10-16 二次返修（定形 T-MEM-13 · F-1）：`rowsB` 从"一行缺 `seq`"扩成
      //   **四行坏 `seq`**（缺键 / `null` / `""` / `true`）—— 理由在那一格自己的块注释里。
      //
      // 🔴 为什么必须新造夹具（不是"顺手补一格"）：K1 写下去的 `seq` **是 `number` 类型**
      //    （`seq: seqOf[id]`，其中 `seqOf` 的值就是 2 / 3 / 1 这几个数字，见下面 K1 那一段）
      //    ⇒ `seqKeyOf` 的第一支 `typeof raw === 'number'` 接住它、**字符串分支根本走不到**
      //    ⇒ 把 `seqKeyOf` 里的 `Number()` 删掉，**那个变异体照样绿**（T-MEM-12 的 `w1` 变异体实测：K1 那格 want == got）。
      //    ⚠️ 所以"把 K1 的 `seq` 改成多位数"**依然抓不到** —— 换成 10 / 2 / 3 它还是 `number`，走的还是同一支。
      //    R2a 要让"数值序 / 字典序 / 文件序"三种口径产出**三种不同结果**；
      //    R2b 要让**四行坏 `seq`** 处在**只可能靠排序才落到末尾**的位置（文件行序把它们夹在有效行中间）；
      //    W3 要让"同一个 id 出现两次、两条 `seq` 与文件序相反" —— 两种去重口径**集合相同、只差顺序**。
      // 🔴 期望值一律**从我手工写下去的 `seq` 算**（另一处来源是导入命令返回的 `imported_id`），
      //    一处都不取"那份池子文件的行序" —— 那是 K1 那条教训。
      // ═══════════════════════════════════════════════════════════════════════

      /**
       * 把一份**手改过的池子**写回某个脑根（契约 §3.3 亲口承认"池子会被手改"这个来历）。
       *
       * @param {object} brain `brainPaths(...)` 那一份（`brain.poolFile`）
       * @param {Array<[string, (string|number|boolean|null|symbol)]>} rows **文件行序 = 数组顺序**；每项 `[imported_id, seq]`：
       *   · `seq === SEQ_ABSENT` ⇒ 那一行**根本没有 `seq` 键**（定形 T-MEM-13 · F-1 的"缺键"那一支）；
       *   · `seq === null` ⇒ 那一行写着 **`seq: null`**（"不是有限数"那一类：**键在、值认不出**）；
       *   · 其它值原样写进去（`''` / `true` / 字符串 `'9'` / 数字 2 —— 全是手改池子里真会出现的形状）。
       *   同一个 id 可以出现两次（W3 要的形状）。
       * 🔴 `null` 与 `SEQ_ABSENT` **必须分开** —— 但**不是**因为它们是两条代码路径：`seqKeyOf` 对这两样
       *   落在**同一个** `Number.NaN`（`typeof raw === 'string'` 那一问对缺键与 `null` 都是假，
       *   `raw.trim()` 那道守卫**根本没被问**；那个函数体里也没有 `raw === undefined` 这个判定）。
       *   分开的理由是**两种输入形状**：契约 §7.3 点的是两个词（**缺失** / **不是有限数**）。
       *   混成一个（`null` 也走"删键"）⇒ 夹具里就只剩"缺键"一种形状 ⇒ `null-as-zero` 那种错法
       *   （`+∞` 只认缺键、`null` 交给 `Number()` ⇒ 0）**再也咬不住** —— 而它正是被 `null` 那一行
       *   咬红的（那一跑的"实得"第一个就是 `…0003`，即 `seq: null` 那行）。
       * @returns {boolean} 每个 `imported_id` 都在池子里 ⇒ true；否则 false（调用方记"夹具失效"，不许当通过）
       */
      const SEQ_ABSENT = Symbol('没有 `seq` 键')
      const writeHandEditedPool = (brain, rows) => {
        const byId = new Map(readJsonl(brain.poolFile).rows.map((r) => [r?.imported_id, r]))
        if (!rows.every(([id]) => typeof id === 'string' && byId.has(id))) return false
        const lines = rows.map(([id, seq]) => {
          const row = { ...byId.get(id) }
          if (seq === SEQ_ABSENT) delete row.seq
          else row.seq = seq
          return JSON.stringify(row)
        })
        writeFileSync(brain.poolFile, `${lines.join('\n')}\n`, 'utf8')
        return true
      }
      /** 一份**全新**脑根 + N 条候选（`init` 只许空根 ⇒ 三格各用一个独立根，不许复用） */
      const seedRoot = (name, tag, n = 3) => {
        const brain = caseBrainRoot('MEM-11', name)
        const init = runBrain('init', {}, { dataRoot: brain.root })
        const imports = []
        for (let i = 1; i <= n; i += 1) imports.push(importCandInto(brain, i, `（夹具·T-MEM-12·${tag}）候选${i}`, `${tag}-`))
        return { brain, init, imports, ids: imports.map((r) => r.json?.imported_id ?? null), exits: imports.map((r) => r.exit_code) }
      }
      const sameList = (x, y) => JSON.stringify(x) === JSON.stringify(y)

      // ── R2a（W1）：`seq` 是**字符串** `"9"` / `"10"` / `"2"` ⇒ 必须按**数值** 2 < 9 < 10 ──
      //    三种口径在这一份夹具上互不相同：
      //      数值序 [seq 2, seq 9, seq 10]  ← 实现现在这样（`seqKeyOf` 先过 `Number()`）
      //      字典序 [seq 10, seq 2, seq 9]  ← 把 `Number()` 删掉就是这个（'10' < '2' < '9'）
      //      文件序 [seq 9, seq 2, seq 10]  ← 根本没用 `seq` 就是这个
      //    ⚠️ 老数据 / 手改的池子里 `seq` 真的可能是字符串 —— 这不是造出来的病。
      const r2a = seedRoot('seq-string', 'strseq')
      if (r2a.init.exit_code !== 0 || !r2a.ids.every((id) => typeof id === 'string')) {
        push('V1-SEQ-STRING', `「\`seq\` 是字符串时必须按数值比」这一格的前置不成立：init=${r2a.init.exit_code} / ids=${JSON.stringify(r2a.ids)}（三次导入退出码 ${r2a.exits.join('/')}）${missingOpNote}`)
      } else {
        const [idS9, idS2, idS10] = r2a.ids
        const fileOrderA = [[idS9, '9'], [idS2, '2'], [idS10, '10']] // 文件行序 = 9 → 2 → 10
        const wantNumeric = [idS2, idS9, idS10]                       // **数值**：2 < 9 < 10
        const wantLexicographic = [idS10, idS2, idS9]                 // 字符串比：'10' < '2' < '9'
        const fileOrderAIds = fileOrderA.map(([id]) => id)
        rp.seq_string = { file_order: fileOrderAIds, seq: Object.fromEntries(fileOrderA), want_numeric: wantNumeric, want_lexicographic: wantLexicographic }
        if (!writeHandEditedPool(r2a.brain, fileOrderA)) {
          push('V1-SEQ-STRING', '夹具失效：strseq 根里找不到那三条 `imported_id` ⇒ 这一格判不了（**不是通过**）')
        } else if (sameList(wantNumeric, wantLexicographic) || sameList(wantNumeric, fileOrderAIds) || sameList(wantLexicographic, fileOrderAIds)) {
          push('V1-SEQ-STRING', `夹具失效：三种口径没能区分开（数值序 ${JSON.stringify(wantNumeric)} / 字典序 ${JSON.stringify(wantLexicographic)} / 文件序 ${JSON.stringify(fileOrderAIds)}）⇒ 这一格又变成自证 —— **不是通过**`)
        } else {
          const rowA = pendingRunOn(r2a.brain, 'r2a_string_seq')
          rp.seq_string.exit_code = rowA.exit_code
          rp.seq_string.code = rowA.code
          rp.seq_string.got = rowA.pending_ids
          if (rowA.exit_code !== 0) {
            push('V1-SEQ-STRING', `手改过的池子（合法 JSON、\`imported_id\` 都在、\`seq\` 是字符串）上 \`judge-pending\` 必须照常成功，实得 exit=${rowA.exit_code} / ${rowA.code ?? '(无码)'}${missingOpNote}`)
          } else {
            if (rowA.pool_count !== 3) {
              push('V1-SEQ-STRING', `夹具：strseq 根必须仍是 3 条，实得 pool_count=${JSON.stringify(rowA.pool_count)}`)
            }
            if (!sameList(rowA.pending_ids, wantNumeric)) {
              push('V1-SEQ-STRING', `\`seq\` 是**字符串**时 \`pending_ids\` 必须按 **\`seq\` 的数值**升序 = ${JSON.stringify(wantNumeric)}（写下去的是 ${JSON.stringify(Object.fromEntries(fileOrderA))} ⇒ 2 < 9 < 10），实得 ${JSON.stringify(rowA.pending_ids)} —— 按字符串比会得到 ${JSON.stringify(wantLexicographic)}（'10' < '2' < '9'），按文件行序会得到 ${JSON.stringify(fileOrderAIds)}：三种口径三个答案，只有"先过 \`Number()\` 再比数值"这一种是对的（\`seqKeyOf\`）`)
            }
          }
        }
      }

      // ── R2b（W2 / F-1）：**坏 `seq` 的行**不丢，且排在所有有效 `seq` **之后**、彼此保持文件行序 ──
      //    定形 T-MEM-13 · F-1：契约 §7.3 那一格承诺的是「`seq` **缺失** / **不是有限数**」**一整类**。
      //    ⚠️ 但两半处境不同：「**缺失**」那半 `T-MEM-12` 已有一格；**一格判据都没有的是「不是有限数」那半**。
      //    🔴 但**别按分支数数**：`seqKeyOf` 只有一个嵌套三元，**没有 `raw === undefined` 这个判定**
      //    （实测：那个函数体里 `undefined` 出现 **0** 次）⇒ 真实形状是**四种坏法、两条路**：
      //      · **缺键 / `null` / `true`** —— `typeof raw === 'string'` 那一问就是假 ⇒ `raw.trim()` 那道守卫
      //        **根本没被问**；前两支都没进，直接落到**共用的那个 `else`**（`Number.NaN`）⇒ `+∞`（三样**同一条路**）
      //      · **`""`** —— 字符串那一支进了，但被 `raw.trim() !== ''` 这道**专属守卫**挡下 ⇒ `Number.NaN` ⇒ `+∞`
      //    ⇒ 所以四行是**四种输入形状**，不是四条分支；`""` 是唯一有专属守卫的那一行。
      //    ⚠️ `true` 那一行**按分支论不算一条**，但它**有自己的活儿**（不是摆设）：专属变异体
      //    `boolean-as-number`（`typeof raw === 'boolean' ? Number(raw) : …`，见 `.tools/_scratch/test/tmem13/mutate.mjs`）
      //    **只被它一只咬住** —— `Number(true) === 1` ⇒ 它从 `+∞` 组搬进有效 `seq` 组、其余五行的键一个不动。
      //    ⇒ 行留着，理由是"**输入形状覆盖**"，不是"分支覆盖"。
      //    文件行序刻意把四行坏 `seq` **夹在**有效行中间（第 1 / 3 / 4 / 5 行）⇒
      //      · "按文件行序出" ⇒ 第一个就是坏行（位置错）
      //      · "丢掉认不出 `seq` 的行" ⇒ 它们整个不见（"一条不漏"这一条的翻面）
      //      · "认不出 ⇒ 当最小的" ⇒ 四行一起跑到最前面（位置错，方向相反）
      //      · "`null` / `""` 当 0"（`Number(null) === 0` · `Number('') === 0`）⇒ 它跑到有效行之前
      //      · "把并列键的次序交给引擎" ⇒ 四行之间的相对次序会翻
      //    ⇒ 只有"排末尾 **且** 彼此保持文件行序 **且** 一条不丢"能过。
      const r2b = seedRoot('seq-missing', 'noseq', 6)
      if (r2b.init.exit_code !== 0 || !r2b.ids.every((id) => typeof id === 'string')) {
        push('V1-SEQ-MISSING', `「坏 \`seq\` 的行不丢、排末尾」这一格的前置不成立：init=${r2b.init.exit_code} / ids=${JSON.stringify(r2b.ids)}（六次导入退出码 ${r2b.exits.join('/')}）${missingOpNote}`)
      } else {
        const [idM, idN2, idZ, idE, idT, idN1] = r2b.ids
        // idM = **没有 `seq` 键** · idZ = `seq: null` · idE = `seq: ""` · idT = `seq: true`
        const rowsB = [
          [idM, SEQ_ABSENT], [idN2, 2], [idZ, null], [idE, ''], [idT, true], [idN1, 1],
        ] // 文件行序：缺键 → seq 2 → null → "" → true → seq 1
        const badIds = [idM, idZ, idE, idT]   // 四行坏 `seq`，**按文件行序** —— 期望里末四行必须是这个次序
        const wantB = [idN1, idN2, ...badIds] // 有效 seq 升序 1 < 2，然后四行"位置未知"按文件行序
        const fileOrderBIds = rowsB.map(([id]) => id)
        rp.seq_missing = {
          file_order: fileOrderBIds,
          no_seq_id: idM,
          not_finite_ids: [idZ, idE, idT],
          seq: { [idN2]: 2, [idN1]: 1 },
          want: wantB,
        }
        /** 只给报文用：这一行的 `seq` 写成了什么（`(缺键)` 与 `null` 必须能分开） */
        const seqAsWritten = (row) => (Object.hasOwn(row ?? {}, 'seq') ? JSON.stringify(row.seq) : '(缺键)')
        const written = writeHandEditedPool(r2b.brain, rowsB)
        const readBack = readJsonl(r2b.brain.poolFile).rows
        const rowWritten = (id) => readBack.find((r) => r?.imported_id === id)
        // 夹具守卫①：写进去的**形状**必须真是那四种坏 `seq`（否则"它认不出"可能是夹具写坏了，不是实现错）
        const shapesOk = written && readBack.length === 6
          && rowWritten(idM) !== undefined && !Object.hasOwn(rowWritten(idM), 'seq')
          && rowWritten(idZ) !== undefined && Object.hasOwn(rowWritten(idZ), 'seq') && rowWritten(idZ).seq === null
          && rowWritten(idE) !== undefined && rowWritten(idE).seq === ''
          && rowWritten(idT) !== undefined && rowWritten(idT).seq === true
          && rowWritten(idN2) !== undefined && rowWritten(idN2).seq === 2
          && rowWritten(idN1) !== undefined && rowWritten(idN1).seq === 1
        if (!written) {
          push('V1-SEQ-MISSING', '夹具失效：noseq 根里找不到那六条 `imported_id` ⇒ 这一格判不了（**不是通过**）')
        } else if (!shapesOk) {
          push('V1-SEQ-MISSING', `夹具失效：写回池子的**形状**不是这一格要的四种坏 \`seq\` —— 读回来是 ${JSON.stringify(readBack.map((r) => `${r?.imported_id}@${seqAsWritten(r)}`))}（要的是：缺键一行 + \`null\` / \`""\` / \`true\` 各一行 + 两行有效 2 与 1）⇒ 这一格判不了（**不是通过**）`)
        } else if (sameList(wantB, fileOrderBIds) || sameList(fileOrderBIds.slice(-badIds.length), badIds)) {
          push('V1-SEQ-MISSING', `夹具失效：这一格要的是"四行坏 \`seq\` 必须靠排序才落到末尾、且彼此保持文件行序"（文件行序 ${JSON.stringify(fileOrderBIds)} / 期望 ${JSON.stringify(wantB)} / 坏行 ${JSON.stringify(badIds)}）⇒ 现在不排序也对 —— **不是通过**`)
        } else {
          const rowB = pendingRunOn(r2b.brain, 'r2b_missing_seq')
          rp.seq_missing.exit_code = rowB.exit_code
          rp.seq_missing.code = rowB.code
          rp.seq_missing.got = rowB.pending_ids
          if (rowB.exit_code !== 0) {
            push('V1-SEQ-MISSING', `池子里有坏 \`seq\`（缺键 / \`null\` / \`""\` / \`true\`）时 \`judge-pending\` 必须照常成功（契约 §3.5 的错误面里没有这一格），实得 exit=${rowB.exit_code} / ${rowB.code ?? '(无码)'}${missingOpNote}`)
          } else {
            const got = Array.isArray(rowB.pending_ids) ? rowB.pending_ids : null
            if (rowB.pool_count !== 6) {
              push('V1-SEQ-MISSING', `夹具：noseq 根必须仍是 **6 条**（坏 \`seq\` 不等于少一行），实得 pool_count=${JSON.stringify(rowB.pool_count)}`)
            }
            const gone = badIds.filter((id) => got === null || !got.includes(id))
            if (gone.length > 0) {
              push('V1-SEQ-MISSING', `池子里那四行**坏 \`seq\`**（缺键 ${idM} · \`null\` ${idZ} · \`""\` ${idE} · \`true\` ${idT}）⇒ 它们**必须还在** \`pending_ids\` 里（这个 op 的职责是"一条不漏"；静默少一条 = 谎报池子内容）—— 不见的是 ${JSON.stringify(gone)}，实得 ${JSON.stringify(got)}`)
            }
            const tailOk = got !== null && sameList(got.slice(-badIds.length), badIds)
            if (got !== null && !tailOk) {
              push('V1-SEQ-MISSING', `四行坏 \`seq\`（按文件行序 ${JSON.stringify(badIds)}）必须一起排在**所有有效 \`seq\` 之后**、且**彼此保持文件行序** = ${JSON.stringify(wantB)}（两行有效 seq 是 2 / 1），实得 ${JSON.stringify(got)} —— 认不出的行放**末尾**是"位置未知"的自然位置（放开头会让它们冒充"最早的一批"；把并列键的次序交给引擎，它们之间就会翻）`)
            }
            if (got !== null && tailOk && !sameList(got, wantB)) {
              push('V1-SEQ-MISSING', `\`pending_ids\` 应为 ${JSON.stringify(wantB)}（有效 \`seq\` 升序 1 < 2，四行坏 \`seq\` 排末尾并保持文件行序），实得 ${JSON.stringify(got)}`)
            }
          }
        }
      }

      // ── R1（W3 · 契约 §3.3 的更正）：**同一个 id 出现两次、两条 `seq` 与文件序相反** ──
      //    ⇒ 位置取 **`seq` 最小**的那一次出现（不是"首次出现那一行"）。
      //    ⚠️ 这一格的两种口径**集合相同、只差顺序** ⇒ 断言必须落在**顺序**上，落在集合上抓不到。
      //      ① 现状（契约更正之后）：X(seq 1) 在 Y(seq 5) 之前 ⇒ [X, Y]
      //      ② 旧契约那半句（首次出现那一行）：X 首次出现在文件第 1 行、那一刻 seq=10 ⇒ [Y, X]
      const r1d = seedRoot('dup-id', 'dupid', 2)
      if (r1d.init.exit_code !== 0 || !r1d.ids.every((id) => typeof id === 'string')) {
        push('V1-DUP-ID-POS', `「同 id 两次出现取 \`seq\` 最小那一次」这一格的前置不成立：init=${r1d.init.exit_code} / ids=${JSON.stringify(r1d.ids)}（两次导入退出码 ${r1d.exits.join('/')}）${missingOpNote}`)
      } else {
        const [idX, idY] = r1d.ids
        const rowsD = [[idX, 10], [idY, 5], [idX, 1]] // 文件行序：X(seq 10) → Y(seq 5) → X(seq 1)
        const wantSeqMin = [idX, idY]                  // 取 seq 最小那一次 ⇒ X(1) 在 Y(5) 之前
        const wantFirstAppearance = [idY, idX]         // 取首次出现那一行 ⇒ Y(5) 在 X(10) 之前
        rp.dup_id = { file_order: rowsD, want_seq_min: wantSeqMin, want_first_appearance: wantFirstAppearance }
        if (!writeHandEditedPool(r1d.brain, rowsD)) {
          push('V1-DUP-ID-POS', '夹具失效：dupid 根里找不到那两条 `imported_id` ⇒ 这一格判不了（**不是通过**）')
        } else if (sameList(wantSeqMin, wantFirstAppearance)) {
          push('V1-DUP-ID-POS', `夹具失效：两种去重口径给出了同一个顺序（${JSON.stringify(wantSeqMin)}）⇒ 这一格抓不到差别 —— **不是通过**`)
        } else {
          const rowD = pendingRunOn(r1d.brain, 'r1_dup_id_seq_min')
          rp.dup_id.exit_code = rowD.exit_code
          rp.dup_id.code = rowD.code
          rp.dup_id.got = rowD.pending_ids
          rp.dup_id.count = rowD.count
          if (rowD.exit_code !== 0) {
            push('V1-DUP-ID-POS', `池子里同一个 id 出现两次时 \`judge-pending\` 必须照常成功（去重、不崩），实得 exit=${rowD.exit_code} / ${rowD.code ?? '(无码)'}${missingOpNote}`)
          } else {
            const got = Array.isArray(rowD.pending_ids) ? rowD.pending_ids : null
            if (rowD.pool_count !== 3) {
              push('V1-DUP-ID-POS', `夹具：dupid 根必须仍是 3 行（同一个 id 两行 + 另一条一行），实得 pool_count=${JSON.stringify(rowD.pool_count)}`)
            }
            if (got !== null && got.length !== 2) {
              push('V1-DUP-ID-POS', `同一个 id 出现两次只许出**一次**：应恰 2 条，实得 ${JSON.stringify(got)}`)
            }
            if (rowD.count !== (got ?? []).length) {
              push('V1-DUP-ID-POS', `count=${JSON.stringify(rowD.count)} 与 pending_ids.length=${(got ?? []).length} 对不上 —— 两个名字必须担同一个意思`)
            }
            if (got !== null && !sameList(got, wantSeqMin)) {
              push('V1-DUP-ID-POS', `同一个 id 出现两次时，位置取 **\`seq\` 最小**的那一次出现 ⇒ \`pending_ids\` = ${JSON.stringify(wantSeqMin)}（文件行序是 ${JSON.stringify(rowsD.map(([id, s]) => `${id}@${s}`))}），实得 ${JSON.stringify(got)} —— 按"首次出现那一行"去重会给 ${JSON.stringify(wantFirstAppearance)}：两者**集合相同、只差顺序**，所以这一格只钉顺序（契约 §3.3 的更正句 + §七 那条口径）`)
            }
          }
        }
      }

      // ── V2 判一条 ⇒ 少一条（索引只在真事务成功之后长出来）──
      const claim1 = runBrain('claim-update', { day: DAY_J, owner_project: 'harness', owner_session: 'session-tmem07-a' }, { dataRoot: jbp.root })
      const gen1 = claim1.json?.generation ?? 1
      const att1 = claim1.json?.attempt ?? 1
      const freeze1 = runBrain('candidates-freeze', { generation: gen1, candidate_ids: [cA, cB] }, { dataRoot: jbp.root })
      const start1 = runBrain('judge-start', { generation: gen1, attempt: att1, token: 'tok-j1', job_id: 'job-memory-judge-tmem07-1' }, { dataRoot: jbp.root })
      const commit1 = runBrain('judge-commit', {
        generation: gen1, attempt: att1, token: 'tok-j1', base_snapshot: 'v0',
        entries_patch: [{ kind: 'add', entry: mkEntry(1, '（夹具·T-MEM-07）第 1 轮判决写进去的一条记忆') }],
        accepted: [cA], maintenance_decisions: [], common_sense_sha256: jCs, report: {},
      }, { dataRoot: jbp.root })
      rp.round1 = {
        claim: claim1.exit_code, freeze: freeze1.exit_code, start: start1.exit_code,
        commit: commit1.exit_code, commit_code: commit1.json?.error?.code ?? null,
        new_snapshot: commit1.json?.new_snapshot ?? null,
        accepted: [cA], frozen: [cA, cB],
      }
      const judgedAfter1 = readJsonl(jbp.judgedFile)
      rp.judged_after_round1 = judgedAfter1
      if (commit1.exit_code !== 0) {
        push('V2-SHRINK', `第 1 轮 judge-commit 必须成功（V2 的前置：索引只在**真事务成功之后**才追加），实得 exit=${commit1.exit_code} / ${commit1.json?.error?.code ?? '(无码)'}（claim=${claim1.exit_code} freeze=${freeze1.exit_code} start=${start1.exit_code}）`)
      } else {
        const got = judgedAfter1.rows.map((r) => `${r?.imported_id}:${r?.verdict}`)
        const want = [`${cA}:accepted`, `${cB}:rejected`]
        if (judgedAfter1.rows.length !== 2) {
          push('V2-SHRINK', `本轮冻了 2 条候选（${JSON.stringify([cA, cB])}）⇒ \`judged.jsonl\` 必须多 2 行 ${JSON.stringify(want)}，实得 ${judgedAfter1.rows.length} 行 ${JSON.stringify(got)}${missingOpNote}`)
        } else if (JSON.stringify(got) !== JSON.stringify(want)) {
          push('V2-SHRINK', `两条候选的判决行应为 ${JSON.stringify(want)}（按冻结顺序；accepted 记 accepted、其余记 rejected），实得 ${JSON.stringify(got)}`)
        }
        if (judgedAfter1.bad.length > 0) {
          push('V2-SHRINK', `\`judged.jsonl\` 有坏行（${JSON.stringify(judgedAfter1.bad)}）—— 索引必须每行都是合法 JSON`)
        }
      }
      const r3 = pendingRun('v2_after_commit1')
      if (r3.exit_code !== 0) {
        push('V2-SHRINK', `判完之后再查 pending 必须成功，实得 exit=${r3.exit_code} / ${r3.code ?? '(无码)'}${missingOpNote}`)
      } else if (JSON.stringify(r3.pending_ids) !== JSON.stringify([cC])) {
        push('V2-SHRINK', `判掉 ${JSON.stringify([cA, cB])} 之后 pending 应只剩 ${JSON.stringify([cC])}，实得 ${JSON.stringify(r3.pending_ids)}`)
      }

      /**
       * V9：**从报告重建**（索引是派生的，不是独立真相）。
       *
       * 口径写死：取 `state/update/<day>.json` 的 `(generation, judge_attempt)` = 当前那一轮，
       * 把 `judged.jsonl` 里同 day + 同 generation + 同 attempt 的行分两组对账：
       *   · `accepted` 组 必须 **等于** 报告里的 `accepted_proposal_ids`（双向，去重后比）；
       *   · 全部行       必须 **等于** 该轮冻结清单 ∪ 报告 accepted（双向）。
       * ⇒ 报告 + 冻结清单 = 索引的全部真相；索引不许自带额外真相。
       * ⚠️ 同一天 redo 两次时，报告只保留**最后一轮**的 accepted（`reportOf` 是当前快照的投影）
       *    ⇒ 所以口径按"当前那一轮"取，不是"这一天所有轮次"。
       *
       * 🔴 **行形状要钉"值"，不是"字段在"**（评审 K3）：只查 `Object.hasOwn` 的话，
       *    `schema` / `snapshot` / `at` / `seq` 四个值填什么都绿（`snapshot` 更是完全没人查）。
       *    四个值的期望来源都**不是**这几行本身：
       *      · `schema`   = 契约 §2.2 写死的 `1`；
       *      · `snapshot` = **状态文件**里的 `new_snapshot`（L736 那一格），不是从行里读回来的；
       *      · `seq`      = 契约 §2.1「从 1 起、跨文件连续」⇒ 整份文件的第 i 行必须是 i；
       *      · `at`       = 能 `Date.parse` 且带时区（`Z` 或 `±hh:mm`）。
       *
       * @param {string} label 这一轮的读数目（红报文里点名它）
       * @param {object} [opts] `{ bp, day, snapshot }` —— 换一个脑根/一天来查（K2 用）
       */
      const checkV9 = (label, opts = {}) => {
        const target = opts.bp ?? jbp
        const day = opts.day ?? DAY_J
        const stateFile = target.updateState(day)
        const stateText = readSafe(stateFile)
        if (stateText === null) {
          push('V9-REBUILD', `「${label}」：\`${stateFile}\` 读不到 ⇒ 重建无从谈起`)
          return
        }
        let st = null
        try {
          st = JSON.parse(stateText)
        } catch (err) {
          push('V9-REBUILD', `「${label}」：状态文件不是合法 JSON（${String(err?.message).slice(0, 120)}）`)
          return
        }
        const reportRes = runBrain('report-read', {}, { dataRoot: target.root })
        const judged = readJsonl(target.judgedFile)
        const rows = judged.rows.filter((r) => r?.day === day && r?.generation === st.generation && r?.attempt === st.judge_attempt)
        const accepted = rows.filter((r) => r?.verdict === 'accepted').map((r) => r?.imported_id)
        const all = rows.map((r) => r?.imported_id)
        const reportAccepted = reportRes.json?.report?.accepted_proposal_ids ?? null
        // `snapshot` 的期望值 = **状态文件**里的那一格（另一个来源），不是从判决行里读回来的
        const wantSnapshot = st.new_snapshot ?? null
        rp[`v9_${label}`] = {
          generation: st.generation, attempt: st.judge_attempt, frozen: st.frozen_proposal_ids,
          rows: rows.length, accepted, all, report_accepted: reportAccepted,
          report_derived: reportRes.json?.derived ?? null,
          state_new_snapshot: wantSnapshot,
        }
        if (typeof opts.snapshot === 'string' && opts.snapshot !== wantSnapshot) {
          push('V9-ROW-SHAPE', `「${label}」：夹具不一致 —— \`judge-commit\` 返回的 new_snapshot=${opts.snapshot}，而状态文件里的 new_snapshot=${JSON.stringify(wantSnapshot)}（两个来源必须同值）`)
        }
        if (rows.length === 0) {
          push('V9-REBUILD', `「${label}」：\`judged.jsonl\` 里没有第 ${st.generation} 轮 / attempt ${st.judge_attempt} 的任何行 ⇒ 索引根本没落（缺的是 opJudgeCommit 事务成功之后那段追加）${missingOpNote}`)
        }
        if (reportRes.exit_code !== 0) {
          push('V9-REBUILD', `「${label}」：report-read 必须成功（V9 拿报告当基准），实得 exit=${reportRes.exit_code} / ${reportRes.json?.error?.code ?? '(无码)'}`)
          return
        }
        if (!Array.isArray(reportAccepted)) {
          push('V9-REBUILD', `「${label}」：报告里必须有 accepted_proposal_ids 数组，实得 ${JSON.stringify(reportAccepted)}`)
          return
        }
        if (reportRes.json?.derived === true) {
          push('V9-DERIVED', `「${label}」：报告是从当前快照现算的（derived=true）—— judge-commit 必须把报告**真的落盘**，否则"从报告重建"没有独立输入`)
        }
        const shapeProblems = []
        for (const row of rows) {
          for (const key of ['schema', 'imported_id', 'day', 'verdict', 'snapshot', 'generation', 'attempt', 'at', 'seq']) {
            if (!Object.hasOwn(row ?? {}, key)) shapeProblems.push(`${row?.imported_id ?? '(无 id)'} 缺字段 ${key}`)
          }
          if (!['accepted', 'rejected'].includes(row?.verdict)) shapeProblems.push(`${row?.imported_id} 的 verdict=${JSON.stringify(row?.verdict)} 不在 accepted/rejected 里`)
          // ── 以下是"值"的断言（K3：只查"字段在"是假绿）──
          if (row?.schema !== 1) shapeProblems.push(`${row?.imported_id} 的 schema=${JSON.stringify(row?.schema)}，契约 §2.2 写死是 1`)
          if (wantSnapshot === null) {
            shapeProblems.push(`状态文件里没有 new_snapshot ⇒ "snapshot 该等于这一轮产出的新版本"这一格判不了（这一轮事务没成功？）`)
          } else if (row?.snapshot !== wantSnapshot) {
            shapeProblems.push(`${row?.imported_id} 的 snapshot=${JSON.stringify(row?.snapshot)}，必须等于这一轮事务产出的 new_snapshot=${JSON.stringify(wantSnapshot)}`)
          }
          if (!Number.isInteger(row?.seq) || row.seq < 1) shapeProblems.push(`${row?.imported_id} 的 seq=${JSON.stringify(row?.seq)}，契约 §2.1 要求 ≥1 的整数`)
          if (typeof row?.at !== 'string' || !Number.isFinite(Date.parse(row.at)) || !/(Z|[+-]\d{2}:\d{2})$/.test(row.at)) {
            shapeProblems.push(`${row?.imported_id} 的 at=${JSON.stringify(row?.at)}，必须是能 \`Date.parse\` 且**带时区**（Z 或 ±hh:mm）的 ISO8601`)
          }
        }
        // `seq` 的口径是**跨文件**的：第 i 个非空行的 seq 必须是 i（契约 §2.1「从 1 起、跨文件连续」）
        for (let i = 0; i < judged.rows.length; i += 1) {
          if (judged.rows[i]?.seq !== i + 1) {
            shapeProblems.push(`\`judged.jsonl\` 第 ${i + 1} 个非空行的 seq=${JSON.stringify(judged.rows[i]?.seq)}，契约 §2.1 要求从 1 起跨文件连续（这里应为 ${i + 1}）`)
            break
          }
        }
        if (shapeProblems.length > 0) {
          push('V9-ROW-SHAPE', `「${label}」：判决行的形状不合契约 —— ${shapeProblems.slice(0, 6).join('；')}`)
        }
        const setOf = (arr) => [...new Set(arr)].sort()
        const wantAll = setOf([...(st.frozen_proposal_ids ?? []), ...reportAccepted])
        if (setOf(all).join('\n') !== wantAll.join('\n')) {
          push('V9-REBUILD', `「${label}」：本轮行集合应 = 冻结清单 ∪ 报告 accepted = ${JSON.stringify(wantAll)}，实得 ${JSON.stringify(setOf(all))}`)
        }
        if (setOf(accepted).join('\n') !== setOf(reportAccepted).join('\n')) {
          push('V9-REBUILD', `「${label}」：accepted 行集合应 **等于** 报告 accepted_proposal_ids = ${JSON.stringify(setOf(reportAccepted))}，实得 ${JSON.stringify(setOf(accepted))} —— 索引是报告的派生，不许自带额外真相`)
        }
      }
      checkV9('round1', { snapshot: commit1.json?.new_snapshot })

      // ── V3 提一条 ⇒ 多一条（反翻面）──
      const imp4 = importCand(4, '（夹具·T-MEM-07）候选四')
      const pool1 = idsOfPool()
      const cD = pool1.ids[3] ?? null
      rp.pool_ids_after_import4 = pool1.ids
      const r4 = pendingRun('v3_after_import4')
      if (imp4.exit_code !== 0 || cD === null) {
        push('V3-GROW', `第 4 条候选导入必须成功（V3 的前置），实得 exit=${imp4.exit_code} / ${imp4.json?.error?.code ?? '(无码)'}；池子=${JSON.stringify(pool1.ids)}`)
      } else if (r4.exit_code !== 0) {
        push('V3-GROW', `池子新提一条之后 judge-pending 必须成功，实得 exit=${r4.exit_code} / ${r4.code ?? '(无码)'}${missingOpNote}`)
      } else if (JSON.stringify(r4.pending_ids) !== JSON.stringify([cC, cD])) {
        push('V3-GROW', `池子新提 ${cD} 之后 pending 应为 ${JSON.stringify([cC, cD])}（池子 seq 顺序），实得 ${JSON.stringify(r4.pending_ids)}`)
      }

      // ── V4 幂等：同一个 (imported_id, day) 再追加一次 ⇒ 集合结果不变 ──
      //   （a）**真事务**那一侧：第 2 轮把同样两条候选再判一次
      const claim2 = runBrain('claim-update', {
        day: DAY_J, owner_project: 'harness', owner_session: 'session-tmem07-a',
        redo: true, previous_attempt_id: 'attempt-0001',
        boss_redo_evidence: {
          kind: 'quote',
          verbatim: '（夹具·T-MEM-07）重做一次，把上一轮的判决作废',
          source_session_id: 'session-c0dabefd-13fe-4380-abdf-1cc1e52ea89a',
          occurred_at: '2026-10-14T13:00:00+08:00',
        },
      }, { dataRoot: jbp.root })
      const gen2 = claim2.json?.generation ?? gen1 + 1
      const att2 = claim2.json?.attempt ?? att1 + 1
      const freeze2 = runBrain('candidates-freeze', { generation: gen2, candidate_ids: [cA, cB] }, { dataRoot: jbp.root })
      const start2 = runBrain('judge-start', { generation: gen2, attempt: att2, token: 'tok-j2', job_id: 'job-memory-judge-tmem07-2' }, { dataRoot: jbp.root })
      const commit2 = runBrain('judge-commit', {
        generation: gen2, attempt: att2, token: 'tok-j2',
        base_snapshot: commit1.json?.new_snapshot ?? 'v1',
        entries_patch: [], accepted: [], maintenance_decisions: [],
        common_sense_sha256: jCs, report: {},
      }, { dataRoot: jbp.root })
      const judgedAfter2 = readJsonl(jbp.judgedFile)
      rp.round2 = {
        claim: claim2.exit_code, claim_code: claim2.json?.error?.code ?? null,
        freeze: freeze2.exit_code, start: start2.exit_code,
        commit: commit2.exit_code, commit_code: commit2.json?.error?.code ?? null,
        generation: gen2, attempt: att2, rows: judgedAfter2.rows.length,
        rows_detail: judgedAfter2.rows.map((r) => `${r?.imported_id}:${r?.verdict}@g${r?.generation}a${r?.attempt}`),
      }
      if (commit2.exit_code !== 0) {
        push('V4-IDEMPOTENT', `第 2 轮（同一 (imported_id, day) 再判一次）judge-commit 必须成功，实得 exit=${commit2.exit_code} / ${commit2.json?.error?.code ?? '(无码)'}（claim=${claim2.exit_code}(/${claim2.json?.error?.code ?? '-'}) freeze=${freeze2.exit_code} start=${start2.exit_code}）`)
      } else {
        const dupRows = judgedAfter2.rows.filter((r) => r?.imported_id === cA || r?.imported_id === cB)
        const dupKeys = new Set(dupRows.map((r) => `${r?.imported_id}@${r?.day}`))
        if (dupKeys.size !== 2 || dupRows.length < 4) {
          push('V4-IDEMPOTENT', `同一个 (imported_id, day) 追加两次 ⇒ \`judged.jsonl\` **允许有重复行**（append-only 不改老行）：应看到 ${cA} 与 ${cB} 各有 2 行、键集合 2 个；实得键=${JSON.stringify([...dupKeys])} 行数=${dupRows.length}`)
        }
        if (judgedAfter2.rows.length !== 4) {
          push('V4-IDEMPOTENT', `两轮各 2 行 ⇒ \`judged.jsonl\` 应有 4 行（重复行是允许的，不是 bug），实得 ${judgedAfter2.rows.length} 行：${JSON.stringify(rp.round2.rows_detail)}`)
        }
      }
      const r5 = pendingRun('v4_after_round2')
      if (r5.exit_code !== 0) {
        push('V4-IDEMPOTENT', `第 2 轮之后查 pending 必须成功，实得 exit=${r5.exit_code} / ${r5.code ?? '(无码)'}${missingOpNote}`)
      } else if (JSON.stringify(r5.pending_ids) !== JSON.stringify([cC, cD])) {
        push('V4-IDEMPOTENT', `同一个 (imported_id, day) 追加两次之后，pending **不许重复扣**：应仍为 ${JSON.stringify([cC, cD])}，实得 ${JSON.stringify(r5.pending_ids)}`)
      }
      checkV9('round2', { snapshot: commit2.json?.new_snapshot })
      //   （b）**读者**那一侧：文件里再抄一遍老行（append-only 的真实形状）⇒ 集合结果不变
      const firstJudgedRow = readJsonl(jbp.judgedFile).rows[0]
      if (firstJudgedRow) {
        appendFileSync(jbp.judgedFile, `${JSON.stringify(firstJudgedRow)}\n`)
        const r6 = pendingRun('v4_after_dup_append')
        if (r6.exit_code !== 0) {
          push('V4-READER-DEDUPE', `索引里有重复行时 judge-pending 必须照常成功，实得 exit=${r6.exit_code} / ${r6.code ?? '(无码)'}${missingOpNote}`)
        } else if (JSON.stringify(r6.pending_ids) !== JSON.stringify([cC, cD])) {
          push('V4-READER-DEDUPE', `索引里出现重复行之后 pending 必须按**集合**算（重复行只扣一次）：应仍为 ${JSON.stringify([cC, cD])}，实得 ${JSON.stringify(r6.pending_ids)}`)
        }
        // ── B1（评审 §三 B1）：`judged_rows` / `judged_ids` 只被记录、从没被断言过 ──
        //   契约 §3.4：`judged_rows` = 非空**行数**（含重复行），`judged_ids` = **去重后**的 id 数，
        //   且「`judged_rows ≥ judged_ids`，两者不许混着用」。
        //   期望值**不取 SUT 自己说的数**，而是我们从同一份文件独立数一遍：
        //   行数 = 非空行数；id 数 = 去重后的 `imported_id` 个数。
        //   现场：两轮各 2 行 + 刚抄的这 1 行 = 5 行；去重后只有 cA / cB 两个 id。
        const nowRows = readJsonl(jbp.judgedFile).rows
        const rowsSeen = nowRows.length
        const idsSeen = new Set(nowRows.map((r) => r?.imported_id)).size
        const expectRows = 2 /*round1*/ + 2 /*round2*/ + 1 /*刚抄的那一行*/
        rp.judged_count_witness = { rows_seen: rowsSeen, ids_seen: idsSeen, expect_rows: expectRows, sut: { judged_rows: r6.judged_rows, judged_ids: r6.judged_ids } }
        if (rowsSeen !== expectRows || idsSeen >= rowsSeen) {
          push('V1-COUNT', `夹具失效：这一格要的是"有重复行"的现场（行数 ${expectRows}、去重后更少），实得 rows=${rowsSeen} / ids=${idsSeen} ⇒ \`judged_rows\` 与 \`judged_ids\` 分不开，这一格判不了 —— 不是通过`)
        } else {
          if (r6.judged_rows !== rowsSeen) {
            push('V1-COUNT', `\`judged_rows\` 必须 = 索引的**非空行数**（含重复行）= ${rowsSeen}，实得 ${JSON.stringify(r6.judged_rows)} —— 契约 §3.4：它是行数，不是去重后的 id 数`)
          }
          if (r6.judged_ids !== idsSeen) {
            push('V1-COUNT', `\`judged_ids\` 必须 = **去重后**的 id 数 = ${idsSeen}（实得 ${JSON.stringify(r6.judged_ids)}）—— 契约 §3.4：它与 \`judged_rows\`=${rowsSeen} 不是同一个数，两个名字不许混用`)
          }
        }
      } else {
        push('V4-READER-DEDUPE', `索引里一行都没有 ⇒ 「重复行不重复扣」这一格判不了（前置没成立：judge-commit 也没写出索引）${missingOpNote}`)
      }

      // ── V5 孤儿不许被静默吞掉 ──
      const orphanId = 'proposal-19990101-9999'
      const judgedNow = readJsonl(jbp.judgedFile)
      const lastSeq = judgedNow.rows.reduce((m, r) => Math.max(m, Number(r?.seq) || 0), 0)
      appendFileSync(jbp.judgedFile, `${JSON.stringify({
        schema: 1,
        imported_id: orphanId,
        day: DAY_J,
        verdict: 'rejected',
        snapshot: commit1.json?.new_snapshot ?? 'v0',
        generation: gen1,
        attempt: att1,
        at: '2026-10-14T13:05:00+08:00',
        seq: lastSeq + 1,
      })}\n`)
      const r7 = pendingRun('v5_orphan')
      if (r7.exit_code !== 0) {
        push('V5-ORPHAN', `索引里有一条池子里没有的 id 时，judge-pending 必须**照常成功**（不崩、不静默），实得 exit=${r7.exit_code} / ${r7.code ?? '(无码)'}${missingOpNote}`)
      } else {
        if (!Array.isArray(r7.orphan_ids) || !r7.orphan_ids.includes(orphanId)) {
          push('V5-ORPHAN', `孤儿 id ${orphanId} 必须出现在 \`orphan_ids\` 里（点名 + 明细，不许静静吞掉），实得 ${JSON.stringify(r7.orphan_ids)}`)
        }
        if (r7.orphan_count !== (r7.orphan_ids ?? []).length) {
          push('V5-ORPHAN', `orphan_count=${JSON.stringify(r7.orphan_count)} 与 orphan_ids.length=${(r7.orphan_ids ?? []).length} 对不上 —— 两个名字必须担同一个意思`)
        }
        if (JSON.stringify(r7.pending_ids) !== JSON.stringify([cC, cD])) {
          push('V5-ORPHAN', `孤儿不许影响 pending 集合：应仍为 ${JSON.stringify([cC, cD])}，实得 ${JSON.stringify(r7.pending_ids)}`)
        }
      }
      rp.final_pending = r7.pending_ids

      // ═══════════════════════════════════════════════════════════════════════
      // V9 的支点（评审 K2）：**`accepted` 里有、冻结清单里没有的 id 也必须落一行**
      //
      // 🔴 病根：上面两个写入点全是 `accepted ⊆ frozen` ⇒ `wantAll = 冻结清单 ∪ 报告 accepted`
      //    退化成 `冻结清单` ⇒ 把实现里"补上 payload.accepted"那半段删掉，V9 依然全绿。
      // ⇒ 这一轮刻意 `freeze [X, Y]` 之后提交 `accepted: [Z]`，而 **Z 不在冻结清单里**
      //    （`opJudgeCommit` 不校验子集：契约 §2.3 第 2 条要的正是"报告 accepted 里不在清单里的 id
      //      也要出一行" —— 不补它，"索引 = 报告的派生"就不是恒等式）。
      // ═══════════════════════════════════════════════════════════════════════
      const k2 = caseBrainRoot('MEM-11', 'spur')
      const k2Init = runBrain('init', {}, { dataRoot: k2.root })
      const k2Cs = k2Init.json?.common_sense_sha256 ?? 'a'.repeat(64)
      const k2Imports = [1, 2, 3].map((n) => importCandInto(k2, n, `（夹具·T-MEM-07·spur）候选${n}`, 'spur-'))
      const k2Ids = k2Imports.map((r) => r.json?.imported_id ?? null)
      const k2Day = k2Imports[0].json?.day ?? null
      if (k2Init.exit_code !== 0 || !k2Ids.every((id) => typeof id === 'string') || typeof k2Day !== 'string') {
        push('V9-SPUR', `前置：spur 根必须 init 成功并导入 3 条候选，实得 init=${k2Init.exit_code} / ids=${JSON.stringify(k2Ids)} / day=${JSON.stringify(k2Day)}${missingOpNote}`)
      } else {
        const [cX, cY, cZ] = k2Ids // 冻 X、Y；**只提交 Z**
        const k2Claim = runBrain('claim-update', { day: k2Day, owner_project: 'harness', owner_session: 'session-tmem07-spur' }, { dataRoot: k2.root })
        const k2Gen = k2Claim.json?.generation ?? 1
        const k2Att = k2Claim.json?.attempt ?? 1
        const k2Freeze = runBrain('candidates-freeze', { generation: k2Gen, candidate_ids: [cX, cY] }, { dataRoot: k2.root })
        const k2Start = runBrain('judge-start', { generation: k2Gen, attempt: k2Att, token: 'tok-spur', job_id: 'job-memory-judge-tmem07-spur' }, { dataRoot: k2.root })
        const k2Commit = runBrain('judge-commit', {
          generation: k2Gen, attempt: k2Att, token: 'tok-spur', base_snapshot: 'v0',
          entries_patch: [], accepted: [cZ], maintenance_decisions: [],
          common_sense_sha256: k2Cs, report: {},
        }, { dataRoot: k2.root })
        const k2Rows = readJsonl(k2.judgedFile)
        const gotSpur = k2Rows.rows.map((r) => `${r?.imported_id}:${r?.verdict}`)
        rp.spur = {
          frozen: [cX, cY], accepted: [cZ],
          claim: k2Claim.exit_code, freeze: k2Freeze.exit_code, start: k2Start.exit_code,
          commit: k2Commit.exit_code, commit_code: k2Commit.json?.error?.code ?? null,
          new_snapshot: k2Commit.json?.new_snapshot ?? null,
          rows: gotSpur,
        }
        if (k2Commit.exit_code !== 0) {
          push('V9-SPUR', `「accepted 里有冻结清单外的 id」那一轮 judge-commit 必须成功（V9 支点的前置），实得 exit=${k2Commit.exit_code} / ${k2Commit.json?.error?.code ?? '(无码)'}（claim=${k2Claim.exit_code} freeze=${k2Freeze.exit_code} start=${k2Start.exit_code}）`)
        } else {
          const wantSpur = [`${cX}:rejected`, `${cY}:rejected`, `${cZ}:accepted`]
          if (JSON.stringify(gotSpur) !== JSON.stringify(wantSpur)) {
            push('V9-SPUR', `冻结 ${JSON.stringify([cX, cY])} 之后提交 accepted=${JSON.stringify([cZ])}（**${cZ} 不在冻结清单里**）⇒ 索引必须多出 3 行 ${JSON.stringify(wantSpur)}，实得 ${JSON.stringify(gotSpur)} —— 缺的是 \`judgedRowSpecsOf\` 里"补上 \`payload.accepted\` 中不在清单里的 id"那半段（契约 §2.3 第 2 条）`)
          }
        }
        // 支点必须**真的非退化**：报告 accepted ⊄ 冻结清单。否则这一格又退回恒等式（那就是假绿）。
        const k2Report = runBrain('report-read', {}, { dataRoot: k2.root })
        const k2ReportAccepted = k2Report.json?.report?.accepted_proposal_ids ?? null
        rp.spur.report_accepted = k2ReportAccepted
        if (!Array.isArray(k2ReportAccepted) || !k2ReportAccepted.includes(cZ)) {
          push('V9-SPUR', `夹具失效：报告 \`accepted_proposal_ids\` 必须含有冻结清单外的 ${cZ}（否则"∪ 报告 accepted"又退化成恒等式），实得报告=${JSON.stringify(k2ReportAccepted)}`)
        }
        checkV9('spur', { bp: k2, day: k2Day, snapshot: k2Commit.json?.new_snapshot })
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 契约 §3.5 的两条负例（评审 K4）—— 这一族在 `tests/**` 里**一条断言都没有**过
      //
      // 为什么必须能翻面：`E_DATA_CORRUPT` 护的是"**坏行整体拒，不许跳过坏行再算**"。
      // 跳过坏行的后果正是本票要治的病 —— 把"少判了一条"读成"本来就没判过"。
      // ⚠️ 全在**测试根副本**里造（`caseBrainRoot` 落在 `_runs/<RUN_ID>/` 之下），一个字节都不碰活体库。
      // ═══════════════════════════════════════════════════════════════════════

      // ① `judged.jsonl` 里有一行半截 JSON ⇒ `E_DATA_CORRUPT` / exit 7
      //    故意先放一行**合法**判决：若实现"跳过坏行再算"，它会 exit 0 并给出 pending=[第二条] ⇒ 这一格才咬得住。
      const k4a = caseBrainRoot('MEM-11', 'judged-corrupt')
      const k4aInit = runBrain('init', {}, { dataRoot: k4a.root })
      const k4aImports = [1, 2].map((n) => importCandInto(k4a, n, `（夹具·T-MEM-07·corrupt）候选${n}`, 'corrupt-'))
      const k4aIds = k4aImports.map((r) => r.json?.imported_id ?? null)
      if (k4aInit.exit_code !== 0 || !k4aIds.every((id) => typeof id === 'string')) {
        push('JP-CORRUPT', `前置：corrupt 根必须 init 成功并导入 2 条候选，实得 init=${k4aInit.exit_code} / ids=${JSON.stringify(k4aIds)}${missingOpNote}`)
      } else {
        writeFileSync(k4a.judgedFile, `${JSON.stringify({
          schema: 1,
          imported_id: k4aIds[0],
          day: DAY,
          verdict: 'accepted',
          snapshot: 'v1',
          generation: 1,
          attempt: 1,
          at: '2026-10-14T12:00:00+08:00',
          seq: 1,
        })}\n{"schema":1,"imported_id":"proposal-20261014-00`, 'utf8')
        const k4aRun = pendingRunOn(k4a, 'k4_judged_corrupt')
        rp.err_corrupt = { exit_code: k4aRun.exit_code, code: k4aRun.code, pending_ids: k4aRun.pending_ids, want: { exit_code: 7, code: 'E_DATA_CORRUPT' } }
        if (k4aRun.exit_code !== 7) {
          const skipped = k4aRun.exit_code === 0
            ? `（它 exit 0 且 pending=${JSON.stringify(k4aRun.pending_ids)} ⇒ **跳过了坏行再算**，那正是把"索引少了一条"读成"本来就没判过"）`
            : ''
          push('JP-CORRUPT', `\`judged.jsonl\` 里有一行半截 JSON 时 \`judge-pending\` 必须**整体拒**：exit 7 / \`E_DATA_CORRUPT\`（契约 §3.5），实得 exit=${k4aRun.exit_code} / ${k4aRun.code ?? '(无码)'}${skipped}`)
        } else if (k4aRun.code !== 'E_DATA_CORRUPT') {
          push('JP-CORRUPT', `坏行的错误码必须是 \`E_DATA_CORRUPT\`（契约 §3.5），实得 ${JSON.stringify(k4aRun.code)}`)
        }
      }

      // ② 另一个根把 `proposals/judged.jsonl` **建成目录** ⇒ 读失败（不是 ENOENT）⇒ `E_TXN_IO` / exit 4
      const k4b = caseBrainRoot('MEM-11', 'judged-dir')
      const k4bInit = runBrain('init', {}, { dataRoot: k4b.root })
      if (k4bInit.exit_code !== 0) {
        push('JP-IO', `前置：judged-dir 根必须 init 成功，实得 exit=${k4bInit.exit_code} / ${k4bInit.json?.error?.code ?? '(无码)'}`)
      } else {
        mkdirSync(k4b.judgedFile, { recursive: true }) // ← 那一格现在是**目录**
        const k4bRun = pendingRunOn(k4b, 'k4_judged_is_dir')
        rp.err_io = { exit_code: k4bRun.exit_code, code: k4bRun.code, want: { exit_code: 4, code: 'E_TXN_IO' } }
        const readAsEmpty = k4bRun.exit_code === 0
          ? '（读不到却 exit 0 ⇒ 把"读失败"读成了"索引是空的"，那会把全部候选都报成没判过）'
          : ''
        if (k4bRun.exit_code !== 4 || k4bRun.code !== 'E_TXN_IO') {
          push('JP-IO', `\`proposals/judged.jsonl\` 那一格是**目录**（读失败、不是 ENOENT）⇒ 必须 exit 4 / \`E_TXN_IO\`（契约 §3.5），实得 exit=${k4bRun.exit_code} / ${k4bRun.code ?? '(无码)'}${readAsEmpty}`)
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 定形 T-MEM-12 · 残余（W5）：**池子**侧坏行也必须整体拒（契约 §3.5 **第二个**格子）
      //
      // 🔴 病根：上面 K4① 只钉了 `judged.jsonl` 那一侧；「池子坏行 ⇒ `E_DATA_CORRUPT`」这一格
      //    在 `tests/**` 里**一条断言都没有**过（全库 `E_DATA_CORRUPT` 只有快照那 2 处 + 上面 K4① 那 1 处）。
      //    同一族只补了一半 —— 抓不住"池子读法改成跳过坏行再算"那个变异体。
      // ⚠️ 照 K4① 的形状：**先放一行合法数据**，再在末尾塞一行半截 JSON。
      //    为什么非这样不可：池子里若只有坏行，"跳过坏行再算"会给出 `exit 0 / pending []`，
      //    那种答案与"本来就空"分不开；先有合法行，跳行之后它会给出一个**看起来对**的答案
      //    （`exit 0` + `pending=[那两条合法的]`）—— 那才是这一格要咬住的东西。
      // ═══════════════════════════════════════════════════════════════════════
      const pc = caseBrainRoot('MEM-11', 'pool-corrupt')
      const pcInit = runBrain('init', {}, { dataRoot: pc.root })
      const pcImports = [1, 2].map((n) => importCandInto(pc, n, `（夹具·T-MEM-12·poolcorrupt）候选${n}`, 'poolcorrupt-'))
      const pcIds = pcImports.map((r) => r.json?.imported_id ?? null)
      if (pcInit.exit_code !== 0 || !pcIds.every((id) => typeof id === 'string')) {
        push('JP-POOL-CORRUPT', `前置：pool-corrupt 根必须 init 成功并导入 2 条候选，实得 init=${pcInit.exit_code} / ids=${JSON.stringify(pcIds)}（退出码 ${pcImports.map((r) => r.exit_code).join('/')}）${missingOpNote}`)
      } else {
        // 追加半截 JSON（**不加换行**：接在最后一条合法行的 LF 之后，成为第 3 行的半截）
        appendFileSync(pc.poolFile, '{"schema":1,"imported_id":"proposal-20261014-00')
        const pcRun = pendingRunOn(pc, 'r5_pool_corrupt')
        rp.err_pool_corrupt = {
          exit_code: pcRun.exit_code,
          code: pcRun.code,
          pending_ids: pcRun.pending_ids,
          legal_ids: pcIds,
          want: { exit_code: 7, code: 'E_DATA_CORRUPT' },
        }
        if (pcRun.exit_code !== 7) {
          const skipped = pcRun.exit_code === 0
            ? `（它 exit 0 且 pending=${JSON.stringify(pcRun.pending_ids)} ⇒ **跳过了坏行再算**：把"池子里少了一条"读成"本来就没有那一条"）`
            : ''
          push('JP-POOL-CORRUPT', `\`proposals/pool.jsonl\` 里有一行半截 JSON 时 \`judge-pending\` 必须**整体拒**：exit 7 / \`E_DATA_CORRUPT\`（契约 §3.5 第二个格子），实得 exit=${pcRun.exit_code} / ${pcRun.code ?? '(无码)'}${skipped}`)
        } else if (pcRun.code !== 'E_DATA_CORRUPT') {
          push('JP-POOL-CORRUPT', `池子坏行的错误码必须是 \`E_DATA_CORRUPT\`（契约 §3.5），实得 ${JSON.stringify(pcRun.code)}`)
        }
      }

      // ── V6 的**空对空守卫** ──
      // "池子没被动过"只有在 op **真的跑成功过**之后才有意义：一次都没跑成功 ⇒ 池子当然没动
      // ⇒ 那是空对空，**不是通过**（与 V8 的 `V8-PRECONDITION` 同一条纪律）。
      const okPendingRuns = Object.values(rp.runs).filter((r) => r.exit_code === 0).length
      rp.successful_runs = okPendingRuns
      if (okPendingRuns === 0) {
        push('V6-VACUOUS', 'V6 这一格**现在判不了**：`judge-pending` 一次都没跑成功（每一次都 exit≠0）⇒ "跑完池子没被动过"是空对空 —— 没跑过当然没动。**这不是通过。**')
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
