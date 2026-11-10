/**
 * `JUD-01` —— **维护案按池子那一行的 `kind` 分类，不按 id 前缀**（`bug-20261109-01` 的同伴格）。
 *
 * 契约：`.team/test/2026-11-09/CONTRACT-f11-judge-kind.md` §2（这一份是判据与读数的唯一出处）。
 * 被测：staged `bin/agenia-brain.mjs` 的 `judge-commit`（**真子进程**；与 `MEM-11` 的 V9 族同一具夹具序列）。
 *
 * ## 病（为什么这一格今天必须是红的）
 *   `maintenance_file` 写的 id 是 `MR-<YYYYMMDD>-<seq:04>`，而判决侧原来只按前缀 `maintenance-` 认维护案。
 *   现在 `agenia-brain.mjs::judgedRowSpecsOf` 改成**先看池子那一行的 `kind`**、前缀只作兜底（提交 `7ea32b9`）。
 *   这一格判三件事：
 *     A `kind: maintenance` 的池行 —— **哪怕 id 长得像提案**（`proposal-…`）—— 必须走维护案那条路：
 *       裁决指向它（`action:'retire'`）⇒ 已判索引里那一行记 `accepted`；没有任何裁决/接受 ⇒ 整体拒
 *       `E_ARG_SCHEMA`（"没有 verdict 来源"那道守门**必须对它生效**）。
 *     B `kind: proposal` 的池行 —— **哪怕 id 长得像 `MR-…`** —— 不许走维护案那条路：冻结了、不在
 *       `accepted` 里 ⇒ 记 `rejected`，**exit 0**（不是 `E_ARG_SCHEMA`）。
 *     C 池子**读不出来**时：分类只能退回前缀。这时 `judge-commit` 的输出必须有一读**点名**这件事
 *       （`classification.pool.ok:false` + `code` + `by_id[id].source:'id-prefix'`）—— 不许吞在
 *       `try/catch { return new Set() }` 里，让人误以为分类是靠池子的 `kind`。
 *
 * ## 读数口径（契约 §2.3；三个面都判它）
 *   `judge-commit` 成功时 stdout JSON 必须带：
 *   ```
 *   classification: {
 *     pool: { ok: boolean, code: string|null, entries: number, message: string },
 *     by_id: { <imported_id>: { source: 'pool'|'id-prefix', kind: 'maintenance'|'proposal' } }
 *   }
 *   ```
 *   · `pool.entries` = 这次真读到的池行数（读不出来 ⇒ 0）；`pool.message` 在 `ok:false` 时非空、点名池子；
 *   · `by_id` 对**每一个**被写进已判索引的 id 给一项（A/B/C 三面各判自己那一项）。
 *
 * ## 边界（这一格**不**判什么）
 *   · 不判 `maintenance_file` 该不该写 `MR-`（契约 §4.4 已冻结，`MNF-*` 守着）；
 *   · 不判池子坏行的错误**文案**（只判 `readPool` 那个码 `E_DATA_CORRUPT` 与"点名了池子"）；
 *   · 不判 GUI（判决没有界面）、不判通知、不判报告卡；
 *   · **刀**：这一格今天 A/B/C 三面本身就是红的（产品还没有这个行为）⇒ 没有另配刀；
 *     刀在 `OFL-07`（那一面产品已经实现，必须证明判据翻得动）。
 */
import { before, describe, test } from 'node:test'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, PATHS } from '../support/env.mjs'
import { caseFail, caseDir, preflight, problem, runCase } from '../support/evidence.mjs'
import { ensureMarkedDir } from '../support/root-guard.mjs'
import { brainPaths, runBrain, runCli, writeFixture } from '../support/sut.mjs'
import { knifeReplace } from '../support/injector-harness.mjs'

before(() => { preflight() })

/** 注入式时钟是 `2026-10-14T12:00`（`run-all.mjs:198`）⇒ 两个日子都不许晚于它。 */
const DAY1 = '2026-10-13'
const DAY2 = '2026-10-14'
const POOL_ID = 'proposal-20261109-0009' // 长得像提案，但池行会写 `kind: maintenance`
const MR_ID = 'MR-20261109-0001' // 长得像维护案，但池行会写 `kind: proposal`
const NO_DECISION_ID = 'proposal-20261109-0010' // `kind: maintenance` · 既不在 accepted 也没有裁决
const BROKEN_POOL_ID = 'MR-20261109-0002' // 池子读不出来时的兜底前缀

const readJsonl = (file) => {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  return text.split(/\r?\n/).filter((line) => line.trim() !== '').map((line) => JSON.parse(line))
}

/** 每格一个独立脑根（`init` 只在空根上成功；共用会让第 2 个子格假红）。 */
function caseBrainRoot(name) {
  const runRoot = process.env[ENV.RUN_ROOT]
  const root = ensureMarkedDir(path.join(runRoot, `brain-jud01-${name}`), {
    runRoot, runId: path.basename(runRoot), kind: 'agenia-test-brain-root',
  })
  return brainPaths({ ...process.env, [ENV.TEST_DATA_ROOT]: root })
}

/** entry 夹具（形状照 §B3.6；只给这一格要用的字段，不含真实私有数据）。 */
const entryOf = (n, text) => ({
  id: `m-${String(n).padStart(8, '0')}`,
  type: 'general',
  text,
  raw: 0.8,
  imp_share: 0,
  fresh_share: 0,
  double_low_streak: 0,
  last_evidence_review: '2026-10-01',
  known_from: 'fixture@2026-10-14',
  created_at: '2026-01-01T00:00:00+08:00',
  type_changed_at: null,
})

/** 池行（只给分类需要的那两个字段 + 形状字段；`readPool` 不校验 schema）。 */
const poolRowOf = (kind, importedId, seq = 1) => ({
  schema: 1,
  kind,
  imported_id: importedId,
  seq,
  day: DAY2,
  source: `jud01-fixture/${kind}`,
  sha256: 'a'.repeat(64),
  content_sha256: 'b'.repeat(64),
  base_snapshot: 'v1',
})

const writePool = (bp, rows) => {
  mkdirSync(path.dirname(bp.poolFile), { recursive: true })
  writeFileSync(bp.poolFile, `${rows.map((row) => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n')}\n`, 'utf8')
  return readFileSync(bp.poolFile, 'utf8')
}

/**
 * 默认跑法：staged `bin/agenia-brain.mjs`，`--data-root` = 这一面的脑根。
 * `JUD-02` 用同一个形状跑**副本**（`cliPath`）—— 两条腿共用 `firstRound` / `judgedRound`，不另写一份。
 */
const defaultRunner = (bp) => (op, payload) => runBrain(op, payload, { dataRoot: bp.root })

/**
 * 第 1 轮：造一个**目标条目**（后面 `retire` 裁决要它出现在基准快照里）。
 * @returns {{ok:boolean, cs:string|null, targetId:string, steps:object, codes:object}}
 */
function firstRound(bp, run = defaultRunner(bp)) {
  const steps = {}
  const codes = {}
  const call = (label, op, payload) => {
    const res = run(op, payload)
    steps[label] = res.exit_code
    codes[label] = res.json?.error?.code ?? null
    return res
  }
  const init = call('init', 'init', {})
  const cs = init.json?.common_sense_sha256 ?? null
  const claim = call('claim', 'claim-update', { day: DAY1, owner_project: 'harness', owner_session: `jud01-${path.basename(bp.root)}` })
  const generation = claim.json?.generation
  const attempt = claim.json?.attempt
  call('freeze', 'candidates-freeze', { day: DAY1, generation, candidate_ids: [] })
  call('start', 'judge-start', { day: DAY1, generation, attempt, token: 'tok-1', job_id: `job-jud01-1-${path.basename(bp.root)}` })
  const target = entryOf(1, '（JUD-01 夹具）维护案要处置的目标条目')
  const commit = call('commit', 'judge-commit', {
    day: DAY1, generation, attempt, token: 'tok-1', base_snapshot: 'v0',
    entries_patch: [{ kind: 'add', entry: target }], accepted: [], maintenance_decisions: [],
    common_sense_sha256: cs, report: {},
  })
  const ok = Object.values(steps).every((code) => code === 0) && typeof cs === 'string'
  return { ok, cs, targetId: target.id, steps, codes, commit }
}

/**
 * 第 2 轮：把池子换成这一面要的样本 → claim → freeze([id]) → start → judge-commit。
 * @returns {{ok:boolean, commit:object, rows:Array, judgedText:string, steps:object, codes:object}}
 */
function judgedRound(bp, { id, rows, accepted = [], decisions = [], cs }, run = defaultRunner(bp)) {
  const poolText = writePool(bp, rows)
  const steps = {}
  const codes = {}
  const call = (label, op, payload) => {
    const res = run(op, payload)
    steps[label] = res.exit_code
    codes[label] = res.json?.error?.code ?? null
    return res
  }
  const claim = call('claim', 'claim-update', { day: DAY2, owner_project: 'harness', owner_session: `jud01-${path.basename(bp.root)}-2` })
  const generation = claim.json?.generation
  const attempt = claim.json?.attempt
  call('freeze', 'candidates-freeze', { day: DAY2, generation, candidate_ids: [id] })
  call('start', 'judge-start', { day: DAY2, generation, attempt, token: 'tok-2', job_id: `job-jud01-2-${path.basename(bp.root)}` })
  const commit = call('commit', 'judge-commit', {
    day: DAY2, generation, attempt, token: 'tok-2', base_snapshot: 'v1',
    entries_patch: [], accepted, maintenance_decisions: decisions, common_sense_sha256: cs, report: {},
  })
  // 前置不成立 ≠ 这一面判过：三条前置各自的退出码是读数，不是绿。
  const preOk = steps.claim === 0 && steps.freeze === 0 && steps.start === 0
  return { ok: preOk, poolText, commit, rows: readJsonl(bp.judgedFile), steps, codes }
}

/** 这一轮写进已判索引的那一行（没有 ⇒ `null`）。 */
const judgedRowOf = (rows, id) => rows.find((row) => row?.imported_id === id) ?? null

/**
 * 把一份 `agenia-brain.mjs` 源码落成"bin + lib"的副本（CLI 只 import `../lib/`）。
 * `JUD-01` 的 `pending_kinds` 那一面用它做刀（`T2` / `T3`）：产品不能为了这一格真去丢默认值 / 丢计数。
 */
function copyBrainInto(dir, source) {
  mkdirSync(path.join(dir, 'bin'), { recursive: true })
  writeFileSync(path.join(dir, 'bin', 'agenia-brain.mjs'), source, 'utf8')
  cpSync(path.join(PATHS.stagedPreset, 'lib'), path.join(dir, 'lib'), { recursive: true })
  return path.join(dir, 'bin', 'agenia-brain.mjs')
}

/** 读数 `classification`（缺 ⇒ `null`；形状不对由各面自己点名）。 */
const classificationOf = (commit) => commit?.json?.classification ?? null

/**
 * `JUD-RULER` —— **尺子自证**（契约 §2.4 第一条）：把池子**从盘上读回来**，断言种下去的就是设计的那一行。
 *
 * 为什么必须写在 A/B/C 三面上：`writePool` 只是把文本写下去（`:99-103` 那次读回**没有断言**），
 * 于是"夹具写歪了"会以**产品红**的样子出现 —— 分不清是产品没实现还是判据自己种错了行。
 * 这里读的是**用例自己**种的那份文件（不是产品的 `classification`），与产品的分类读数**互相独立**：
 * 只有两者同时对上，"按池行的 kind 分类"这句话才算被量到。
 *
 * @param {string} label      哪一面（红报文点名）
 * @param {string} poolText   写池子时读回来的原文（`writePool` 的返回值）
 * @param {{rows:number, id:string, kind:string}|{unparsable:true}} want
 * @returns {Array<{code:string,message:string}>}
 */
function rulerProblems(label, poolText, want) {
  const out = []
  const lines = String(poolText ?? '').split(/\r?\n/).filter((line) => line.trim() !== '')
  if (want.unparsable === true) {
    let parses = true
    try { JSON.parse(lines[0] ?? '') } catch { parses = false }
    if (parses) out.push(problem('JUD-RULER', `${label}：夹具坏了 —— 那份池子居然能 JSON.parse（"池子读不出来"这一面没造出来）`))
    return out
  }
  if (lines.length !== want.rows) {
    out.push(problem('JUD-RULER', `${label}：池子应有 ${want.rows} 行（设计如此），读回来 ${lines.length} 行：${JSON.stringify(lines.map((line) => line.slice(0, 80)))}`))
  }
  const parsed = []
  for (const line of lines) {
    try { parsed.push(JSON.parse(line)) } catch { parsed.push(null) }
  }
  const hit = parsed.find((row) => row?.imported_id === want.id)
  if (hit === undefined) {
    out.push(problem('JUD-RULER', `${label}：读回来的池子里没有 imported_id=${JSON.stringify(want.id)}（实得 ${JSON.stringify(parsed.map((row) => row?.imported_id ?? null))}）—— 尺子歪了，不是产品红`))
  } else if (hit.kind !== want.kind) {
    out.push(problem('JUD-RULER', `${label}：读回来的那一行 kind 应为 ${JSON.stringify(want.kind)}，实得 ${JSON.stringify(hit.kind)} —— 尺子歪了，不是产品红`))
  }
  return out
}

/**
 * 读数面（契约 §2.3）：`classification.by_id[id]` 必须**同时**带 `source` 与 `kind`。
 *
 * 判的是**读数**、不是退出码：`exit 0` 但 by_id 缺这一项（或两项写歪）⇒ 这一面红。
 * 没有它，"退出码碰巧是 0"就能让一格看起来通过 —— 而分类依据其实一个字都没留下。
 *
 * @param {object|null} cls   `judge-commit` 输出的 `classification`
 * @param {string} id
 * @param {{source:string, kind:string}} want
 * @param {string} code       这一面的红码（A/B/D 各自的）
 * @param {string} label
 */
function byIdProblems(cls, id, want, code, label) {
  const out = []
  if (cls === null || typeof cls !== 'object') {
    out.push(problem(code, `${label}：judge-commit 输出没有 \`classification\` 读数（契约 §2.3）—— 分类靠什么，读的人看不见`))
    return out
  }
  const byId = cls.by_id?.[id]
  if (byId === null || byId === undefined || typeof byId !== 'object') {
    out.push(problem(code, `${label}：\`classification.by_id[${JSON.stringify(id)}]\` 缺这一项（实得 ${JSON.stringify(cls.by_id ?? null)}）—— 退出码对了不算数，读数里没有它`))
    return out
  }
  if (byId.source !== want.source) out.push(problem(code, `${label}：\`classification.by_id[${JSON.stringify(id)}].source\` 应为 ${JSON.stringify(want.source)}，实得 ${JSON.stringify(byId.source)}`))
  if (byId.kind !== want.kind) out.push(problem(code, `${label}：\`classification.by_id[${JSON.stringify(id)}].kind\` 应为 ${JSON.stringify(want.kind)}，实得 ${JSON.stringify(byId.kind)}`))
  return out
}

/** 三个面各自都能用的一条读数：这一面到底量到了什么。 */
const faceReading = (bp, round, extra = {}) => ({
  root: bp.root,
  pool_text: round.poolText,
  steps: round.steps,
  step_codes: round.codes,
  pool_code: round.commit.json?.error?.code ?? null,
  commit_exit: round.commit.exit_code,
  judged_rows: round.rows.map((row) => `${row?.imported_id}:${row?.verdict}`),
  classification: classificationOf(round.commit),
  ...extra,
})

describe('unit · judge classification by pool kind (JUD) · bug-20261109-01', () => {
  test('JUD-01 池行的 `kind` 决定分类（不是 id 前缀）：maintenance 的 proposal 形 id 走维护案路 · proposal 的 MR 形 id 不走 · 池子读不出来必须留读数', async () => {
    await runCase('JUD-01', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      const cells = (rec.readings.cells = {})

      /**
       * 一面 = 一个独立脑根 + 第 1 轮目标条目 + 第 2 轮分类提交。
       * 前置（init/claim/freeze/start）不成立 ⇒ 这一面**判不了**：记红（不许当通过）。
       */
      const prepare = (name) => {
        const bp = caseBrainRoot(name)
        const r1 = firstRound(bp)
        if (!r1.ok) {
          push('JUD-PREREQ', `${name}：第 1 轮起不来（steps=${JSON.stringify(r1.steps)} codes=${JSON.stringify(r1.codes)}）—— 这一面判不了，**不是通过**`)
          return null
        }
        return { bp, cs: r1.cs, targetId: r1.targetId }
      }
      const judge = (name, ctx, spec) => {
        const round = judgedRound(ctx.bp, { ...spec, cs: ctx.cs })
        if (!round.ok) {
          push('JUD-PREREQ', `${name}：第 2 轮前置失败（steps=${JSON.stringify(round.steps)} codes=${JSON.stringify(round.codes)}）—— 这一面判不了，**不是通过**`)
          return null
        }
        return round
      }

      // ── A · `kind: maintenance` + 提案形 id + 一条指向它的裁决（`action:'retire'`）──
      //    期望：走**维护案**那条路 ⇒ verdict 来自裁决 ⇒ `accepted`。按前缀判会记 `rejected`（今天的读数）。
      {
        const name = 'A kind=maintenance / proposal 形 id'
        const ctx = prepare('a-kind-maintenance')
        if (ctx !== null) {
          const round = judge(name, ctx, {
            id: POOL_ID,
            rows: [poolRowOf('maintenance', POOL_ID)],
            decisions: [{ maintenance_id: POOL_ID, action: 'retire', target_id: ctx.targetId, reason: '（JUD-01 夹具）' }],
          })
          if (round !== null) {
            const row = judgedRowOf(round.rows, POOL_ID)
            const cls = classificationOf(round.commit)
            cells.A = faceReading(ctx.bp, round, { row: row === null ? null : `${row.imported_id}:${row.verdict}` })
            // JUD-RULER：池子**读回来**真的是 `kind:maintenance` + 这个 id（不是"我以为我种了"）。
            const ruler = (rec.readings.ruler ??= {})
            ruler.A = rulerProblems(name, round.poolText, { rows: 1, id: POOL_ID, kind: 'maintenance' })
            out.push(...ruler.A)
            if (round.commit.exit_code !== 0) {
              push('JUD-KIND-MAINTENANCE', `A：kind=maintenance 的池行 + 指向它的裁决 ⇒ judge-commit 必须成功（维护案路径），实得 exit=${round.commit.exit_code} / ${round.commit.json?.error?.code ?? '(无码)'} —— 按 proposal- 前缀判会把它当普通提案`)
            } else {
              if (row === null) push('JUD-KIND-MAINTENANCE', 'A：已判索引里没有这一行（冻结了却没写索引）')
              else if (row.verdict !== 'accepted') {
                push('JUD-KIND-MAINTENANCE', `A：裁决 {maintenance_id:"${POOL_ID}", action:"retire"} 指向它 ⇒ verdict 必须来自**维护案路径**记 \`accepted\`，实得 ${JSON.stringify(row.verdict)} —— 池子说它是 maintenance，id 前缀说什么都不算`)
              }
              if (cls === null) push('JUD-KIND-MAINTENANCE', 'A：judge-commit 输出没有 `classification` 读数（契约 §2.3）—— 分类靠什么，读的人看不见')
              else {
                if (cls.pool?.ok !== true) push('JUD-KIND-MAINTENANCE', `A：池子可读 ⇒ classification.pool.ok 应为 true，实得 ${JSON.stringify(cls.pool)}`)
                if (cls.pool?.entries !== 1) push('JUD-KIND-MAINTENANCE', `A：池子恰好一行 ⇒ classification.pool.entries 应为 1，实得 ${JSON.stringify(cls.pool?.entries)}`)
                // 读数面（不是退出码）：by_id 必须**同时**带 source 与 kind。
                out.push(...byIdProblems(cls, POOL_ID, { source: 'pool', kind: 'maintenance' }, 'JUD-KIND-MAINTENANCE', 'A'))
              }
            }
          }
        }
      }

      // ── B · `kind: proposal` + `MR-` 形 id + 没有裁决 ──────────────────────
      //    期望：**提案**那条路 ⇒ 冻结了但不在 accepted ⇒ `rejected`、exit 0。按 `MR-` 前缀判会走维护案路 ⇒
      //    `E_ARG_SCHEMA`（"没有 verdict 来源"）—— 今天红的就是这一条。
      {
        const name = 'B kind=proposal / MR 形 id'
        const ctx = prepare('b-kind-proposal')
        if (ctx !== null) {
          const round = judge(name, ctx, { id: MR_ID, rows: [poolRowOf('proposal', MR_ID)] })
          if (round !== null) {
            const row = judgedRowOf(round.rows, MR_ID)
            const cls = classificationOf(round.commit)
            cells.B = faceReading(ctx.bp, round, { row: row === null ? null : `${row.imported_id}:${row.verdict}` })
            // JUD-RULER：池子读回来真的是 `kind:proposal`（与 A 的 maintenance 行对照）。
            const ruler = (rec.readings.ruler ??= {})
            ruler.B = rulerProblems(name, round.poolText, { rows: 1, id: MR_ID, kind: 'proposal' })
            out.push(...ruler.B)
            if (round.commit.exit_code !== 0) {
              push('JUD-KIND-PROPOSAL', `B：kind=proposal 的池行（id=\`${MR_ID}\`）冻结后不在 accepted 里 ⇒ 必须按**提案**路径记 rejected、exit 0，实得 exit=${round.commit.exit_code} / ${round.commit.json?.error?.code ?? '(无码)'} —— 它被 \`MR-\\d{8}-\\d+\` 那个前缀兜底抓去当维护案了`)
            } else if (row === null || row.verdict !== 'rejected') {
              push('JUD-KIND-PROPOSAL', `B：已判索引那一行应为 \`rejected\`，实得 ${JSON.stringify(row?.verdict ?? null)}`)
            }
            if (cls === null) push('JUD-KIND-PROPOSAL', 'B：judge-commit 输出没有 `classification` 读数（契约 §2.3）')
            else {
              if (cls.pool?.ok !== true) push('JUD-KIND-PROPOSAL', `B：池子可读 ⇒ classification.pool.ok 应为 true，实得 ${JSON.stringify(cls.pool)}`)
              // 读数面（不是退出码）：by_id 必须**同时**带 source 与 kind。
              out.push(...byIdProblems(cls, MR_ID, { source: 'pool', kind: 'proposal' }, 'JUD-KIND-PROPOSAL', 'B'))
            }
          }
        }
      }

      // ── C · `kind: maintenance` + 提案形 id + **既不在 accepted、也没有裁决** ──
      //    期望：整体拒 `E_ARG_SCHEMA`（bug-20261109-01 的第 ② 半：那道守门必须对 MR 形 id 生效）。
      {
        const name = 'C kind=maintenance / 没有裁决'
        const ctx = prepare('c-no-decision')
        if (ctx !== null) {
          const round = judge(name, ctx, { id: NO_DECISION_ID, rows: [poolRowOf('maintenance', NO_DECISION_ID)] })
          if (round !== null) {
            const row = judgedRowOf(round.rows, NO_DECISION_ID)
            cells.C = faceReading(ctx.bp, round, { row: row === null ? null : `${row.imported_id}:${row.verdict}` })
            // JUD-RULER：池子读回来真的是 `kind:maintenance` —— 这一面**拒**它，理由是"维护案没有 verdict 来源"；
            // 池行若写成 proposal，这一面就变成"提案没判"，红因会指错地方。
            const ruler = (rec.readings.ruler ??= {})
            ruler.C = rulerProblems(name, round.poolText, { rows: 1, id: NO_DECISION_ID, kind: 'maintenance' })
            out.push(...ruler.C)
            // C 是**拒绝面**：契约 §2.3 明写它读 `error.message`（点名 id + "维护案"），**不要求** `classification`。
            // 所以这一面的"读数"就是拒绝报文本身（下面两个 `includes`）+ "零已判行" —— 不是退出码一项。
            // 若产品将来在拒绝输出里也带 `classification`，它必须说对（source/kind）；今天不带 ⇒ 不触发。
            if (classificationOf(round.commit) !== null) {
              out.push(...byIdProblems(classificationOf(round.commit), NO_DECISION_ID, { source: 'pool', kind: 'maintenance' }, 'JUD-RULER', 'C（拒绝输出里带了 classification）'))
            }
            if (round.commit.exit_code !== 2 || round.commit.json?.error?.code !== 'E_ARG_SCHEMA') {
              push('JUD-KIND-NO-VERDICT', `C：维护案 ${NO_DECISION_ID} 既不在 accepted、也没有任何裁决指向它 ⇒ 必须整体拒 exit 2 / E_ARG_SCHEMA（不许替它猜 verdict），实得 exit=${round.commit.exit_code} / ${round.commit.json?.error?.code ?? '(无码)'}`)
            } else {
              const message = String(round.commit.json?.error?.message ?? '')
              if (!message.includes(NO_DECISION_ID)) push('JUD-KIND-NO-VERDICT', `C：拒绝报文没点名 ${NO_DECISION_ID}：${JSON.stringify(message.slice(0, 200))}`)
              if (!message.includes('维护案')) push('JUD-KIND-NO-VERDICT', `C：拒绝报文没说这一条走的是**维护案**路径：${JSON.stringify(message.slice(0, 200))}`)
            }
            if (row !== null) push('JUD-KIND-NO-VERDICT', `C：整体拒的那一轮不许写已判索引，实得 ${JSON.stringify(row)}`)
          }
        }
      }

      // ── D · 池子**读不出来**：分类只能退回前缀 —— 但这件事必须在读数里看得见 ──
      //    期望：exit 0（裁决 `action:null` 明确"这次不处置" ⇒ 维护案路径有 verdict 来源）、
      //    那一行 `rejected`；同时 `classification.pool.ok:false` + 码 + `by_id[id].source:'id-prefix'`。
      {
        const name = 'D 池子读不出来'
        const ctx = prepare('d-pool-unreadable')
        if (ctx !== null) {
          const raw = '{"broken pool row'
          const round = judge(name, ctx, {
            id: BROKEN_POOL_ID,
            rows: [raw],
            decisions: [{ maintenance_id: BROKEN_POOL_ID, action: null }],
          })
          if (round !== null) {
            const row = judgedRowOf(round.rows, BROKEN_POOL_ID)
            const cls = classificationOf(round.commit)
            cells.D = faceReading(ctx.bp, round, { row: row === null ? null : `${row.imported_id}:${row.verdict}` })
            // JUD-RULER：这份池子**真的**读不出来（不是我写错了而它其实能 parse）。
            const ruler = (rec.readings.ruler ??= {})
            ruler.D = rulerProblems(name, raw, { unparsable: true })
            out.push(...ruler.D)
            if (round.commit.exit_code !== 0) {
              push('JUD-POOL-UNREADABLE', `D：池子坏 + 裁决 action:null ⇒ 维护案路径有 verdict 来源 ⇒ 必须成功（exit 0），实得 exit=${round.commit.exit_code} / ${round.commit.json?.error?.code ?? '(无码)'}`)
            } else if (row === null || row.verdict !== 'rejected') {
              push('JUD-POOL-UNREADABLE', `D：那一行应为 \`rejected\`（action:null = 明确不处置），实得 ${JSON.stringify(row?.verdict ?? null)}`)
            }
            if (cls === null) {
              push('JUD-POOL-UNREADABLE', 'D：池子读不出来时，`judge-commit` 输出必须带 `classification` 读数 —— 现在退回前缀这件事被 `try/catch { return new Set() }` 吞了，读的人会以为分类靠的是池子的 `kind`（契约 §2.3）')
            } else {
              if (cls.pool?.ok !== false) push('JUD-POOL-UNREADABLE', `D：池子读不出来 ⇒ classification.pool.ok 必须 false，实得 ${JSON.stringify(cls.pool)}`)
              if (cls.pool?.code !== 'E_DATA_CORRUPT') push('JUD-POOL-UNREADABLE', `D：classification.pool.code 应点名 \`E_DATA_CORRUPT\`（\`readPool\` 给的码），实得 ${JSON.stringify(cls.pool?.code)}`)
              const poolMessage = String(cls.pool?.message ?? '')
              if (poolMessage === '') push('JUD-POOL-UNREADABLE', 'D：classification.pool.message 空 —— 读不出来却没说是哪份池子')
              else if (!/pool\.jsonl|候选池/i.test(poolMessage)) push('JUD-POOL-UNREADABLE', `D：classification.pool.message 没点名池子：${JSON.stringify(poolMessage.slice(0, 200))}`)
              if (cls.pool?.entries !== 0) push('JUD-POOL-UNREADABLE', `D：读不出来 ⇒ classification.pool.entries 应为 0，实得 ${JSON.stringify(cls.pool?.entries)}`)
              // 读数面（不是退出码）：池子读不出来时来源必须是 `id-prefix`，且 kind 说得出来。
              out.push(...byIdProblems(cls, BROKEN_POOL_ID, { source: 'id-prefix', kind: 'maintenance' }, 'JUD-POOL-UNREADABLE', 'D'))
            }
          }
        }
      }

      /**
       * ── E · `judge-pending` 的 `pending_kinds` / `kind_missing`（`bug-20261110-03` 的判据面）────────
       * `judge-commit` 按池行 `kind` 分类；只给 id 会让下游去猜（猜错那一轮整轮被 `E_ARG_SCHEMA` 拒）。
       * 这一面判**读数本身**，四件事各自承重：
       *   ① `pending_kinds` 的键集合与**次序** = `pending_ids`（键顺序是输出的合同，不是巧合）；
       *   ② `kind` 说的是池行那一个，**id 前缀说什么都不算**（`proposal-` 形 id 也可以是 maintenance）；
       *   ③ `kind` 缺失 / 第三个值 ⇒ **缺省 `proposal`** 且进 `kind_missing` 计数（"它本来就是提案"
       *      与"它没写 kind"必须在读数上分得开 —— 静默缺省就是上一轮错 kind 的老路）；
       *   ④ 判过一条之后 `pending_ids` 少一条、`pending_kinds` 跟着少那个键（**按差集现算**，不是常量）。
       * 两把刀（`T2` 丢缺省值 / `T3` 丢计数）各切一份副本：`T2` ⇒ ③ 的缺省值那一半红；`T3` ⇒ 计数那一半红。
       */
      {
        const name = 'E judge-pending 的逐 id kind'
        const bp = caseBrainRoot('e-pending-kinds')
        const ID_MAINT = 'proposal-20261109-0101' // 提案形 id · kind=maintenance
        const ID_PROP = 'MR-20261109-0102' // 维护案形 id · kind=proposal
        const ID_MISSING = 'MR-20261109-0103' // **没有** kind
        const ID_BOGUS = 'proposal-20261109-0104' // kind='delete'（第三个值）
        const missingRow = poolRowOf('proposal', ID_MISSING, 3)
        delete missingRow.kind
        const rows = [
          poolRowOf('maintenance', ID_MAINT, 1),
          poolRowOf('proposal', ID_PROP, 2),
          missingRow,
          poolRowOf('delete', ID_BOGUS, 4),
        ]
        const poolText = writePool(bp, rows)
        const ruler = (rec.readings.ruler ??= {})
        ruler.E = (() => {
          const got = readJsonl(bp.poolFile)
          const out = []
          if (got.length !== 4) out.push(problem('JUD-RULER', `E：池子应有 4 行（设计如此），读回来 ${got.length} 行`))
          const byId = new Map(got.map((row) => [row?.imported_id, row]))
          for (const [id, kind] of [[ID_MAINT, 'maintenance'], [ID_PROP, 'proposal'], [ID_BOGUS, 'delete']]) {
            if (!byId.has(id)) out.push(problem('JUD-RULER', `E：读回来的池子里没有 ${id}`))
            else if (byId.get(id)?.kind !== kind) out.push(problem('JUD-RULER', `E：${id} 的 kind 应为 ${JSON.stringify(kind)}，实得 ${JSON.stringify(byId.get(id)?.kind)}`))
          }
          if (byId.has(ID_MISSING) && Object.prototype.hasOwnProperty.call(byId.get(ID_MISSING), 'kind')) {
            out.push(problem('JUD-RULER', `E：${ID_MISSING} 这一行**不该有** kind 键（它就是"缺 kind"那一份）`))
          }
          return out
        })()
        out.push(...ruler.E)

        const pendingOf = (cliPath = null) => runCli('agenia-brain.mjs', {
          op: 'judge-pending', dataRoot: bp.root, inFile: writeFixture('JUD-01', 'judge-pending', {}), testMode: true,
        }, cliPath === null ? {} : { cliPath })
        const decode = (res) => ({
          exit: res.exit_code,
          code: res.json?.error?.code ?? null,
          ids: Array.isArray(res.json?.pending_ids) ? res.json.pending_ids : null,
          kinds: res.json?.pending_kinds ?? null,
          kindKeys: res.json?.pending_kinds !== null && typeof res.json?.pending_kinds === 'object' ? Object.keys(res.json.pending_kinds) : null,
          kindMissing: res.json?.kind_missing ?? null,
          count: res.json?.count ?? null,
        })
        const base = pendingOf()
        const b = decode(base)
        cells.E = { pool_text: poolText, first: b }
        if (b.exit !== 0) {
          push('JUD-JUDGE-PENDING-KINDS', `E：judge-pending 必须 exit 0，实得 exit=${b.exit} / ${b.code ?? '(无码)'}`)
        } else {
          const wantIds = [ID_MAINT, ID_PROP, ID_MISSING, ID_BOGUS]
          if (JSON.stringify(b.ids) !== JSON.stringify(wantIds)) {
            push('JUD-JUDGE-PENDING-KINDS', `E：pending_ids 应为 ${JSON.stringify(wantIds)}（按 seq），实得 ${JSON.stringify(b.ids)}`)
          }
          if (JSON.stringify(b.kindKeys) !== JSON.stringify(b.ids)) {
            push('JUD-JUDGE-PENDING-KINDS', `E：\`pending_kinds\` 的**键集合与次序**必须等于 \`pending_ids\`，实得 ${JSON.stringify(b.kindKeys)} vs ${JSON.stringify(b.ids)}`
              + ' —— 键顺序是输出的合同（下游按它对齐 id 与 kind）')
          }
          if (b.kinds?.[ID_MAINT] !== 'maintenance') {
            push('JUD-JUDGE-PENDING-KINDS', `E：\`pending_kinds[${JSON.stringify(ID_MAINT)}]\` 应为 'maintenance'（池行说的），实得 ${JSON.stringify(b.kinds?.[ID_MAINT])} —— 按 id 前缀猜会猜成 proposal`)
          }
          if (b.kinds?.[ID_PROP] !== 'proposal') {
            push('JUD-JUDGE-PENDING-KINDS', `E：\`pending_kinds[${JSON.stringify(ID_PROP)}]\` 应为 'proposal'（池行说的），实得 ${JSON.stringify(b.kinds?.[ID_PROP])} —— 按 \`MR-\` 前缀猜会猜成 maintenance`)
          }
          // ③ 缺省 `proposal` + 计数：两半各判一次（缺省值看得见，计数也在）。
          if (b.kinds?.[ID_MISSING] !== 'proposal' || b.kinds?.[ID_BOGUS] !== 'proposal') {
            push('JUD-JUDGE-PENDING-KINDS', `E：kind 缺失 / 第三个值的那两条必须缺省成 'proposal'，实得 ${JSON.stringify({ [ID_MISSING]: b.kinds?.[ID_MISSING] ?? null, [ID_BOGUS]: b.kinds?.[ID_BOGUS] ?? null })}`
              + ' —— 缺省值必须给出来，否则下游拿不到 kind')
          }
          if (b.kindMissing !== 2) {
            push('JUD-JUDGE-PENDING-KINDS', `E：\`kind_missing\` 应为 2（缺 kind 1 条 + 第三个值 1 条），实得 ${JSON.stringify(b.kindMissing)}`
              + ' —— 静默缺省 = "它本来就是提案"与"它没写 kind"在读数上同形（上一轮错 kind 的老路）')
          }
          if (b.count !== 4) push('JUD-JUDGE-PENDING-KINDS', `E：\`count\` 应为 4，实得 ${JSON.stringify(b.count)}`)
        }

        // ④ 判过一条：`pending_ids` 少一条、`pending_kinds` 跟着少那个键（按差集现算）。
        writeFileSync(bp.judgedFile, `${JSON.stringify({ imported_id: ID_PROP, verdict: 'rejected', seq: 1 })}\n`, 'utf8')
        const after = decode(pendingOf())
        cells.E.after_one_judged = after
        const wantAfter = [ID_MAINT, ID_MISSING, ID_BOGUS]
        if (JSON.stringify(after.ids) !== JSON.stringify(wantAfter)) {
          push('JUD-JUDGE-PENDING-KINDS', `E：判过 ${ID_PROP} 之后 \`pending_ids\` 应为 ${JSON.stringify(wantAfter)}，实得 ${JSON.stringify(after.ids)}`)
        }
        if (JSON.stringify(after.kindKeys) !== JSON.stringify(after.ids)) {
          push('JUD-JUDGE-PENDING-KINDS', `E：判过一条之后 \`pending_kinds\` 的键仍须与 \`pending_ids\` 逐位相同，实得 ${JSON.stringify(after.kindKeys)} vs ${JSON.stringify(after.ids)}`
            + ' —— 多留一个键说明它印的是"池子里的全部"而不是"还没判的"')
        }
        if (after.kindMissing !== 2) {
          push('JUD-JUDGE-PENDING-KINDS', `E：判掉的那一条是 proposal（有 kind）⇒ \`kind_missing\` 仍应为 2，实得 ${JSON.stringify(after.kindMissing)}`)
        }

        // ── 两把刀：T2 丢缺省值 / T3 丢计数 ──────────────────────────────────
        const srcPath = path.join(PATHS.stagedPreset, 'bin', 'agenia-brain.mjs')
        const src = readFileSync(srcPath, 'utf8')
        const t2 = knifeReplace({
          source: src,
          find: "    pendingKinds[id] = kind ?? 'proposal'",
          replace: '    pendingKinds[id] = kind',
        })
        const t3 = knifeReplace({
          source: src,
          find: '    if (kind === null) kindMissing += 1',
          replace: '    if (false) kindMissing += 1',
        })
        rec.readings.knives_pending = {
          T2: { label: '丢缺省值（pendingKinds[id] = kind）', ok: t2.ok, code: t2.code, why: t2.why },
          T3: { label: '丢计数（kindMissing 不再 ++）', ok: t3.ok, code: t3.code, why: t3.why },
        }
        if (!t2.ok) push('JUD01-KNIFE-ANCHOR', `T2 在 staged 源码上没有落点：${t2.code} ${t2.why} —— 尺子坏了，不许当成"刀咬了"`)
        if (!t3.ok) push('JUD01-KNIFE-ANCHOR', `T3 在 staged 源码上没有落点：${t3.code} ${t3.why} —— 尺子坏了，不许当成"刀咬了"`)
        const legOfKnife = (tag, source) => {
          const cp = copyBrainInto(path.join(caseDir('JUD-01'), 'pending-knife', tag), source)
          const res = decode(pendingOf(cp))
          return { exit: res.exit, kinds: res.kinds, kindMissing: res.kindMissing, ids: res.ids, cli: cp }
        }
        if (t2.ok) {
          const k2 = legOfKnife('T2', t2.source)
          cells.E.knife_T2 = k2
          if (k2.exit !== 0 || k2.kinds?.[ID_MISSING] !== null || k2.kinds?.[ID_BOGUS] !== null) {
            push('JUD01-KNIFE-NOT-BITING', `[T2 丢缺省值] 副本必须把缺 kind 的两条给成 \`null\`（缺省值没了），实得 ${JSON.stringify({ [ID_MISSING]: k2.kinds?.[ID_MISSING] ?? null, [ID_BOGUS]: k2.kinds?.[ID_BOGUS] ?? null })}`
              + ' —— 这一刀没切开"缺省值"那一半')
          }
        }
        if (t3.ok) {
          const k3 = legOfKnife('T3', t3.source)
          cells.E.knife_T3 = k3
          if (k3.exit !== 0 || k3.kindMissing !== 0) {
            push('JUD01-KNIFE-NOT-BITING', `[T3 丢计数] 副本必须把 \`kind_missing\` 报成 0（计数没了），实得 ${JSON.stringify(k3.kindMissing)}`
              + ' —— 这一刀没切开"计数"那一半')
          }
          if (k3.kinds?.[ID_MISSING] !== 'proposal') {
            push('JUD01-KNIFE-NOT-BITING', `[T3 对照] 丢计数**不该**改变缺省值：\`pending_kinds[${JSON.stringify(ID_MISSING)}]\` 仍应是 'proposal'，实得 ${JSON.stringify(k3.kinds?.[ID_MISSING])}`)
          }
        }
      }

      rec.readings.summary = {
        A_ok: Array.isArray(cells.A?.judged_rows) && cells.A.judged_rows.join('') === `${POOL_ID}:accepted`,
        B_ok: Array.isArray(cells.B?.judged_rows) && cells.B.judged_rows.join('') === `${MR_ID}:rejected`,
        C_ok: cells.C?.pool_code === 'E_ARG_SCHEMA',
        D_has_reading: cells.D?.classification != null,
      }
      caseFail(out)
    })
  })

  /**
   * `JUD-02` —— **一个 `catch` 把编程错误吞成"空池子"**（`bug-20261109-01` 的同胞，组长 2026-11-09 点名）。
   *
   * 病：`judgedRowSpecsOf` 里曾经是 `readPool(root)`，而 `root` 是**模块作用域里不存在的自由变量** ⇒
   * `ReferenceError` 被 `catch { return new Set() }` 吞掉 ⇒ 池子这一路从来没读到过东西，分类只靠前缀，
   * 而账上一句话都不说。修好之后（实现已落 staging）这里判三件事：
   *   · **坏字节**（池子一行坏 JSON）⇒ `classification.pool.code === 'E_DATA_CORRUPT'`（**不是**空池子）；
   *   · **抛出**（`readPool` 自己坏了：TypeError / 未定义变量 / 错参数）⇒ `pool.ok:false` + **非空码**（且
   *     ≠ `E_DATA_CORRUPT`，坏字节与代码坏必须分得开）+ `message` 带着抛出的原文 + `entries:0`；
   *     分类退回前缀（`by_id.source:'id-prefix'`），提交不崩、那一行照常 `rejected`；
   *   · **把它改回"吞成空"**（刀 `T2`：catch 返回 `{ok:true, rows:[], ...}`）⇒ 本格的判据必须红。
   *
   * 为什么用**副本 + 刀**：产品不能为了这一格真去抛异常（那是改产品）。副本只改 `readPool` 那一处调用
   * （刀 `T1`），其余逐字来自 staged；`T1` 的读数证明"抛出被看见"，`T2` 的读数证明"吞成空会被判红"。
   */
  test('JUD-02 池子读失败不许吞成"空池子"：坏字节 ⇒ E_DATA_CORRUPT · 抛出的编程错误 ⇒ 非空码 + 抛出原文 + 前缀兜底 · 把 catch 改成吞成空 ⇒ 本格红', async () => {
    await runCase('JUD-02', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))
      const ID = 'MR-20261109-0003'
      const THROWN = 'JUD-02-KNIFE-THROWN'
      const base = path.join(caseDir('JUD-02'), 'judge-copy')
      const srcPath = path.join(PATHS.stagedPreset, 'bin', 'agenia-brain.mjs')

      // ── 两把刀：T1 让 `readPool` 抛一个**非 IO** 的 TypeError；T2 再把 catch 改成"吞成空"。──
      const src = readFileSync(srcPath, 'utf8')
      const throwCut = knifeReplace({
        source: src,
        find: '      const read = PROP.readPool(root)',
        replace: `      const read = (() => { throw new TypeError('${THROWN}') })()`,
      })
      const swallowCut = throwCut.ok
        ? knifeReplace({
            source: throwCut.source,
            find: /return \{ ok: false, code: 'E_TXN_IO', rows: \[\], message: .* \}/,
            replace: "return { ok: true, code: null, rows: [], message: '' }",
          })
        : { ok: false, code: throwCut.code, why: throwCut.why, source: null }
      const knifeReadings = (rec.readings.knives = {
        T1: { label: 'readPool 抛 TypeError', find: '      const read = PROP.readPool(root)', ok: throwCut.ok, code: throwCut.code, why: throwCut.why },
        T2: { label: 'catch 返回 {ok:true, rows:[]}', ok: swallowCut.ok, code: swallowCut.code, why: swallowCut.why },
      })
      if (!throwCut.ok) push('JUD02-KNIFE-ANCHOR', `T1 在 staged 源码上没有落点：${throwCut.code} ${throwCut.why} —— 尺子坏了，不许当成"刀咬了"`)
      if (throwCut.ok && !swallowCut.ok) push('JUD02-KNIFE-ANCHOR', `T2 在 T1 的副本上没有落点：${swallowCut.code} ${swallowCut.why}`)

      /** 把一份源码落成"bin + lib"的副本（脑 CLI 只 import `../lib/`）。 */
      const copyOf = (dir, source) => {
        mkdirSync(path.join(dir, 'bin'), { recursive: true })
        writeFileSync(path.join(dir, 'bin', 'agenia-brain.mjs'), source, 'utf8')
        cpSync(path.join(PATHS.stagedPreset, 'lib'), path.join(dir, 'lib'), { recursive: true })
        return path.join(dir, 'bin', 'agenia-brain.mjs')
      }
      const controlCopy = copyOf(path.join(base, 'control'), src)
      const throwCopy = throwCut.ok ? copyOf(path.join(base, 'knife-T1'), throwCut.source) : null
      const swallowCopy = swallowCut.ok ? copyOf(path.join(base, 'knife-T2'), swallowCut.source) : null
      rec.readings.copies = { control: controlCopy, T1: throwCopy, T2: swallowCopy, source: srcPath }

      /** 副本跑法：与 `runBrain` 同形，只是 `cliPath` 指到副本的 bin。 */
      const runnerAt = (cliPath, bp) => (op, payload) => runCli('agenia-brain.mjs', {
        op, dataRoot: bp.root, inFile: writeFixture('JUD-02', op, payload), testMode: true,
      }, { cliPath })

      /**
       * 一腿 = 一个独立脑根 + 第 1 轮目标条目 + 第 2 轮分类提交。
       * @returns {{ok:boolean, where:string, steps:object, codes:object,
       *            classification:object|null, row:object|null, commit:object|null}}
       */
      const legOf = (name, cliPath, { rows, decisions }) => {
        const bp = caseBrainRoot(`jud02-${name}`)
        const run = runnerAt(cliPath, bp)
        const r1 = firstRound(bp, run)
        if (!r1.ok) return { ok: false, where: 'first', steps: r1.steps, codes: r1.codes, classification: null, row: null, commit: null }
        const r2 = judgedRound(bp, { id: ID, rows, decisions, cs: r1.cs }, run)
        if (!r2.ok) return { ok: false, where: 'second', steps: r2.steps, codes: r2.codes, classification: null, row: null, commit: r2.commit }
        return {
          ok: true, where: null, steps: r2.steps, codes: r2.codes,
          classification: classificationOf(r2.commit),
          row: judgedRowOf(r2.rows, ID),
          commit: r2.commit,
          root: bp.root,
        }
      }

      const normalRows = [poolRowOf('maintenance', ID)]
      const declined = [{ maintenance_id: ID, action: null }]
      const badBytesRows = ['{"broken pool row']
      const legs = (rec.readings.legs = {})
      const record = (name, leg) => {
        legs[name] = leg === null ? null : {
          ok: leg.ok, where: leg.where, steps: leg.steps, codes: leg.codes,
          commit_exit: leg.commit?.exit_code ?? null,
          classification: leg.classification,
          row: leg.row === null ? null : `${leg.row?.imported_id}:${leg.row?.verdict}`,
        }
        return leg
      }

      /** 控制腿（未切的副本 + 正常池子）：副本本身是一个能跑的判官（否则后面的红是假红）。 */
      const controlLeg = record('control', legOf('control', controlCopy, { rows: normalRows, decisions: declined }))
      const controlProblems = (() => {
        const d = []
        if (!controlLeg.ok) d.push(`控制腿前置失败（${controlLeg.where}，steps=${JSON.stringify(controlLeg.steps)} codes=${JSON.stringify(controlLeg.codes)}）`)
        else {
          const cls = controlLeg.classification
          if (cls === null) d.push('没有 `classification` 读数（副本不是这一版判官？）')
          else {
            if (cls.pool?.ok !== true) d.push(`池子可读 ⇒ pool.ok 应 true，实得 ${JSON.stringify(cls.pool)}`)
            if (cls.pool?.code !== null) d.push(`池子可读 ⇒ pool.code 应 null，实得 ${JSON.stringify(cls.pool?.code)}`)
            if (cls.pool?.entries !== 1) d.push(`池子一行 ⇒ pool.entries 应 1，实得 ${JSON.stringify(cls.pool?.entries)}`)
            if (cls.by_id?.[ID]?.source !== 'pool') d.push(`by_id["${ID}"].source 应 pool，实得 ${JSON.stringify(cls.by_id?.[ID] ?? null)}`)
          }
          if (controlLeg.row?.verdict !== 'rejected') d.push(`那一行应 rejected，实得 ${JSON.stringify(controlLeg.row?.verdict ?? null)}`)
        }
        return d.length === 0 ? [] : [problem('JUD02-CONTROL', `控制腿：${d.join(' · ')}`)]
      })()

      /** 坏字节腿：池子一行坏 JSON ⇒ `E_DATA_CORRUPT`（这是"字节坏了"，不是"代码坏了"）。 */
      const badLeg = record('bad_bytes', legOf('bad-bytes', controlCopy, { rows: badBytesRows, decisions: declined }))
      const badProblems = (() => {
        const d = []
        if (!badLeg.ok) d.push(`前置失败（${badLeg.where}，steps=${JSON.stringify(badLeg.steps)} codes=${JSON.stringify(badLeg.codes)}）`)
        else {
          const cls = badLeg.classification
          if (cls === null) d.push('没有 `classification` 读数')
          else {
            if (cls.pool?.ok !== false) d.push(`坏字节 ⇒ pool.ok 应 false，实得 ${JSON.stringify(cls.pool?.ok)}`)
            if (cls.pool?.code !== 'E_DATA_CORRUPT') d.push(`坏字节 ⇒ pool.code 应 E_DATA_CORRUPT，实得 ${JSON.stringify(cls.pool?.code)}`)
            const msg = String(cls.pool?.message ?? '')
            if (!/候选池|pool\.jsonl/i.test(msg)) d.push(`坏字节 ⇒ message 应点名池子，实得 ${JSON.stringify(msg.slice(0, 160))}`)
            if (cls.pool?.entries !== 0) d.push(`坏字节 ⇒ entries 应 0，实得 ${JSON.stringify(cls.pool?.entries)}`)
            if (cls.by_id?.[ID]?.source !== 'id-prefix') d.push(`坏字节 ⇒ 分类退回前缀，by_id.source 应 id-prefix，实得 ${JSON.stringify(cls.by_id?.[ID] ?? null)}`)
          }
          if (badLeg.row?.verdict !== 'rejected') d.push(`那一行应 rejected，实得 ${JSON.stringify(badLeg.row?.verdict ?? null)}`)
        }
        return d.length === 0 ? [] : [problem('JUD02-BAD-BYTES', `坏字节腿：${d.join(' · ')}`)]
      })()

      /** 同一段断言喂给"抛出"那一腿（T1）与"吞成空"那一腿（T2）。 */
      const thrownProblems = (leg, label) => {
        const d = []
        if (leg === null) return [problem('JUD02-THROWN-NOT-READ', `${label}：这一腿没有读数（副本建不出来）`)]
        if (!leg.ok) d.push(`前置失败（${leg.where}，steps=${JSON.stringify(leg.steps)} codes=${JSON.stringify(leg.codes)}）`)
        else {
          if (leg.commit.exit_code !== 0) d.push(`commit exit=${leg.commit.exit_code} / ${leg.commit.json?.error?.code ?? '(无码)'} —— 池子读失败不许把提交打崩`)
          const cls = leg.classification
          if (cls === null) d.push('没有 `classification` 读数 —— 抛出被吞成了"什么都没发生"')
          else {
            if (cls.pool?.ok !== false) d.push(`抛出的读失败 ⇒ pool.ok 应 false，实得 ${JSON.stringify(cls.pool?.ok)}（这就是"吞成 empty/ok"）`)
            if (cls.pool?.code === null || cls.pool?.code === undefined || cls.pool?.code === '') d.push('pool.code 空 —— 读失败没有码，"代码坏了"与"池子本来就空"分不开')
            if (cls.pool?.code === 'E_DATA_CORRUPT') d.push('pool.code 用了坏字节的码 E_DATA_CORRUPT —— 抛出（代码坏了）与坏字节没分开')
            const msg = String(cls.pool?.message ?? '')
            if (msg === '') d.push('pool.message 空 —— 抛出的原文没留下')
            else if (!msg.includes(THROWN)) d.push(`pool.message 没带抛出的特征串「${THROWN}」：${JSON.stringify(msg.slice(0, 200))}`)
            if (cls.pool?.entries !== 0) d.push(`抛出的读失败 ⇒ entries 应 0，实得 ${JSON.stringify(cls.pool?.entries)}`)
            if (cls.by_id?.[ID]?.source !== 'id-prefix') d.push(`抛出的读失败 ⇒ 分类退回前缀，by_id.source 应 id-prefix，实得 ${JSON.stringify(cls.by_id?.[ID] ?? null)}`)
          }
          if (leg.row?.verdict !== 'rejected') d.push(`那一行应 rejected（action:null），实得 ${JSON.stringify(leg.row?.verdict ?? null)}`)
        }
        return d.length === 0 ? [] : [problem('JUD02-THROWN-NOT-READ', `${label}：${d.join(' · ')}`)]
      }

      const throwLeg = record('thrown', throwCopy === null ? null : legOf('thrown', throwCopy, { rows: normalRows, decisions: declined }))
      if (throwCut.ok) {
        const problems = thrownProblems(throwLeg, 'T1 抛出腿')
        out.push(...problems)
      }

      // ── T2（负控）：把 catch 改回"吞成空" ⇒ 同一段断言必须红，且只翻这一个码 ──
      const swallowLeg = record('swallowed', swallowCopy === null ? null : legOf('swallowed', swallowCopy, { rows: normalRows, decisions: declined }))
      if (swallowCut.ok) {
        const codes = thrownProblems(swallowLeg, 'T2 吞成空腿').map((p) => p.code)
        const want = ['JUD02-THROWN-NOT-READ']
        rec.readings.swallow_codes = codes
        rec.readings.swallow_want = want
        if (JSON.stringify([...new Set(codes)].sort()) !== JSON.stringify(want)) {
          push('JUD02-KNIFE-VECTOR', `T2（catch 吞成空）翻面集与期望不同：实测 ${JSON.stringify(codes)}，期望 ${JSON.stringify(want)} —— 多翻 = 刀切宽了，少翻 = 那一面没人守`)
        }
      }

      out.push(...controlProblems, ...badProblems)
      rec.readings.summary = {
        control_ok: controlProblems.length === 0,
        bad_bytes_ok: badProblems.length === 0,
        thrown_ok: throwCut.ok ? thrownProblems(throwLeg, 'T1').length === 0 : null,
        swallow_red: swallowCut.ok ? JSON.stringify([...new Set(thrownProblems(swallowLeg, 'T2').map((p) => p.code))].sort()) === JSON.stringify(['JUD02-THROWN-NOT-READ']) : null,
      }
      caseFail(out)
    })
  })
})
