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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { ensureMarkedDir } from '../support/root-guard.mjs'
import { brainPaths, runBrain } from '../support/sut.mjs'

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
 * 第 1 轮：造一个**目标条目**（后面 `retire` 裁决要它出现在基准快照里）。
 * @returns {{ok:boolean, cs:string|null, targetId:string, steps:object, codes:object}}
 */
function firstRound(bp) {
  const steps = {}
  const codes = {}
  const call = (label, op, payload) => {
    const res = runBrain(op, payload, { dataRoot: bp.root })
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
function judgedRound(bp, { id, rows, accepted = [], decisions = [], cs }) {
  const poolText = writePool(bp, rows)
  const steps = {}
  const codes = {}
  const call = (label, op, payload) => {
    const res = runBrain(op, payload, { dataRoot: bp.root })
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

/** 读数 `classification`（缺 ⇒ `null`；形状不对由各面自己点名）。 */
const classificationOf = (commit) => commit?.json?.classification ?? null

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
                const byId = cls.by_id?.[POOL_ID]
                if (byId?.source !== 'pool' || byId?.kind !== 'maintenance') {
                  push('JUD-KIND-MAINTENANCE', `A：classification.by_id["${POOL_ID}"] 应为 {source:'pool', kind:'maintenance'}，实得 ${JSON.stringify(byId ?? null)}`)
                }
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
            if (round.commit.exit_code !== 0) {
              push('JUD-KIND-PROPOSAL', `B：kind=proposal 的池行（id=\`${MR_ID}\`）冻结后不在 accepted 里 ⇒ 必须按**提案**路径记 rejected、exit 0，实得 exit=${round.commit.exit_code} / ${round.commit.json?.error?.code ?? '(无码)'} —— 它被 \`MR-\\d{8}-\\d+\` 那个前缀兜底抓去当维护案了`)
            } else if (row === null || row.verdict !== 'rejected') {
              push('JUD-KIND-PROPOSAL', `B：已判索引那一行应为 \`rejected\`，实得 ${JSON.stringify(row?.verdict ?? null)}`)
            }
            if (cls === null) push('JUD-KIND-PROPOSAL', 'B：judge-commit 输出没有 `classification` 读数（契约 §2.3）')
            else {
              const byId = cls.by_id?.[MR_ID]
              if (cls.pool?.ok !== true) push('JUD-KIND-PROPOSAL', `B：池子可读 ⇒ classification.pool.ok 应为 true，实得 ${JSON.stringify(cls.pool)}`)
              if (byId?.source !== 'pool' || byId?.kind !== 'proposal') {
                push('JUD-KIND-PROPOSAL', `B：classification.by_id["${MR_ID}"] 应为 {source:'pool', kind:'proposal'}，实得 ${JSON.stringify(byId ?? null)}`)
              }
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
            // 尺子自证：这份池子**真的**读不出来（不是我写错了而它其实能 parse）。
            let poolParses = true
            try { JSON.parse(raw) } catch { poolParses = false }
            if (poolParses) push('JUD-RULER', 'D：夹具坏了 —— 那份池子居然能 JSON.parse（"读不出来"这一面没造出来）')
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
              const byId = cls.by_id?.[BROKEN_POOL_ID]
              if (byId?.source !== 'id-prefix' || byId?.kind !== 'maintenance') {
                push('JUD-POOL-UNREADABLE', `D：classification.by_id["${BROKEN_POOL_ID}"] 应写 {source:'id-prefix', kind:'maintenance'}（池子读不出来、只能靠 \`MR-\` 前缀），实得 ${JSON.stringify(byId ?? null)}`)
              }
            }
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
})
