/**
 * `LDG-05` —— **折叠对账：153/153，一条都不许丢**（构案 0012 · 本票最承重的一条）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§3 事件流 · §4 折叠与对账 · §4.3 唯一实现 ·
 * §9.3 级联 · §11 刀表 K8/K9）。
 *
 * 两条独立的读者，**两边都要成立**：
 *   ① 产品的 `--op reconcile`（被审方自报的那一份）；
 *   ② 测试自己的 `reconcileOracle`（从 `--op fold` 的读数与旧台账重算一遍）。
 * 只有 ① 绿 = 让被审方自己判自己（`cand-20261022-0151`）；两边不一致 ⇒ `FOLD-ORACLE-DISAGREES`。
 *
 * 🔴 **今天的预期是红**：`账本/`、`presets/agenia/lib/缺陷折叠.mjs`、检查器都还不存在（Gate 3 才建）。
 */
import path from 'node:path'
import { before, test } from 'node:test'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CHECK, FOLD_LIB, archiveEntry, archiveText, buildScene, checkToolFoldWiring, codesOf, eventAssessed,
  eventDisposed, eventRegistered, expectCodes, findArchive, foldImplementationReading, messagesOf, namedIn,
  readJson, readOldLedger, readerWiring, reconcileOracle, runFold, runReconcile, toolPresent,
} from '../support/three-books.mjs'

before(() => {
  preflight()
})

const BUG_A = 'bug-20261115-01'
const BUG_B = 'bug-20261115-02'
const BUG_C = 'bug-20261115-03'

/** 旧台账（expected 侧）：三条，三种处置各一条。 */
const ARCHIVE_ENTRIES = [
  archiveEntry({ id: BUG_A, phenomenon: '夹具现象甲', value: 'adopted', reason: '甲已落地' }),
  archiveEntry({ id: BUG_B, phenomenon: '夹具现象乙', value: 'rejected', reason: '乙不是缺陷' }),
  archiveEntry({ id: BUG_C, phenomenon: '夹具现象丙', value: 'deferred', reason: '丙冻结为历史' }),
]

/** 事件流（actual 侧）：三条都按"迁移"的形状写 —— disposed 带 `历史`，处置值逐字保留。 */
function migratedDay({ drop = [], change = {} } = {}) {
  const ev = (id, seq, phenomenon, value, reason) => {
    const key = `${id}`
    if (drop.includes(key)) return []
    const disposition = change[key] ?? { value, reason }
    return [
      eventRegistered({ seq, id, phenomenon, at: `2026-11-15T09:0${seq}:00+08:00` }),
      eventAssessed({ seq: seq + 1, id, verdict: 'true', at: `2026-11-15T10:0${seq}:00+08:00` }),
      eventDisposed({
        seq: seq + 2, id, value: disposition.value, reason: disposition.reason,
        extra: { 历史: disposition.value },
      }),
    ]
  }
  const events = [...ev(BUG_A, 1, '夹具现象甲', 'adopted', '甲已落地'), ...ev(BUG_B, 4, '夹具现象乙', 'rejected', '乙不是缺陷')]
  if (!drop.includes(BUG_C)) events.push(...ev(BUG_C, 7, '夹具现象丙', 'deferred', '丙冻结为历史'))
  return { day: '2026-11-15', events }
}

/** 造一棵"已迁移"的树 + 一份旧台账（对账的两侧都是夹具自己写的）。 */
function migratedScene(caseId, tag, { drop = [], change = {}, archive = true } = {}) {
  const scene = buildScene({
    caseId, tag,
    products: [{ id: '0001', title: '产品口径样张' }],
    schemes: [{ id: '0012', title: '三册账本', parent: '0001', basisP: ['0001'], basisBug: [BUG_A, BUG_B, BUG_C] }],
    days: [migratedDay({ drop, change })],
    files: archive ? [{ rel: '_fixture/ledger.json', text: archiveText(ARCHIVE_ENTRIES) }] : [],
    team: true,
  })
  return { scene, archiveFile: path.join(scene.root, '_fixture', 'ledger.json') }
}

// ── LDG-05 ──────────────────────────────────────────────────────────────
test('LDG-05 折叠对账：与旧 ledger.json 逐条对（id + 现象 + 处置）153/153；改一条事件值 ⇒ 点名', async () => {
  await runCase('LDG-05', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const hasTool = toolPresent(problems, CHECK, '契约 §4 的检查器（对账的 op 只能由它跑）')
    const hasLib = toolPresent(problems, FOLD_LIB, '契约 §4.1 的唯一实现（折叠库）')
    if (!hasTool || !hasLib) {
      // 唯一实现那两条静态腿今天也要红：库不在 = 折叠还没有唯一出口。
      const impl = foldImplementationReading()
      const wiring = checkToolFoldWiring()
      rec.readings.single_impl = { impl, wiring, readers: readerWiring() }
      if (impl.hits.length !== 1) {
        push('FOLD-IMPL-DUPLICATED', `[本票] 全仓 \`function foldBugBook\` 实得 ${impl.hits.length} 处（${JSON.stringify(impl.hits)}），期望恰好 1 处且在 ${impl.lib}（契约 §4.3-a）`)
      }
      if (!wiring.present) push('FOLD-IMPL-DUPLICATED', '[本票] presets/agenia/bin/决议-check.mjs 不在盘上 —— 折叠没有调用方（契约 §4.3-b）')
      else if (!wiring.imports_lib) push('FOLD-IMPL-DUPLICATED', '[本票] 检查器没有 import 缺陷折叠库 —— 折叠逻辑很可能又写了一份（契约 §4.3-b）')
      caseFail(problems)
      return
    }

    // ── ① 夹具：三格逐条对上 ⇒ 工具与 oracle 都绿 ──────────────────────────────
    {
      const { scene, archiveFile } = migratedScene('LDG-05', 'good')
      const fold = runFold(scene.root)
      const rec0 = runReconcile(scene.root, { archive: archiveFile })
      rec.readings.good = {
        root: scene.root,
        fold: { exit: fold.exit, codes: codesOf(fold.json), states: Array.isArray(fold.json?.states) ? fold.json.states.length : null },
        reconcile: {
          exit: rec0.exit, ok: rec0.json?.ok ?? null, compared: rec0.json?.compared ?? null,
          archive_entries: rec0.json?.archive_entries ?? null, folded_states: rec0.json?.folded_states ?? null,
          diffs: rec0.json?.diffs ?? null, legacy_disposed: rec0.json?.legacy_disposed ?? null,
        },
      }
      if (expectCodes(problems, fold, [], push, { label: 'LDG-05/good · fold' }) && expectCodes(problems, rec0, [], push, { label: 'LDG-05/good · reconcile' })) {
        const oracle = reconcileOracle({ entries: ARCHIVE_ENTRIES, states: fold.json?.states ?? [] })
        rec.readings.good.oracle = oracle
        if (!oracle.ok) {
          push('FOLD-ORACLE-DISAGREES', `[LDG-05/good] 测试自己的对账不成立：${JSON.stringify({ missing: oracle.missing, extra: oracle.extra, diffs: oracle.diffs })} —— 夹具自己就没对上，后面的刀不作数`)
        }
        if (rec0.json?.compared !== 3) push('FOLD-TOTAL-MISMATCH', `[LDG-05/good] reconcile.compared 实得 ${JSON.stringify(rec0.json?.compared)}，期望 3`)
        if (rec0.json?.legacy_disposed !== 3) push('LEGACY-COUNT-DRIFT', `[LDG-05/good] legacy_disposed 实得 ${JSON.stringify(rec0.json?.legacy_disposed)}，期望 3`)
      }
    }
    // ── ② 刀 K8：改一条事件的处置值 ⇒ 恰好 FOLD-DIFF，点名那个 id；oracle 也要看见 ────────
    {
      const { scene, archiveFile } = migratedScene('LDG-05', 'k8-value', { change: { [BUG_B]: { value: 'adopted', reason: '乙不是缺陷' } } })
      const fold = runFold(scene.root)
      const rec1 = runReconcile(scene.root, { archive: archiveFile })
      const oracle = reconcileOracle({ entries: ARCHIVE_ENTRIES, states: fold.json?.states ?? [] })
      rec.readings['k8-value'] = {
        fold: { exit: fold.exit, codes: codesOf(fold.json) },
        reconcile: { exit: rec1.exit, codes: codesOf(rec1.json), diffs: rec1.json?.diffs ?? null, messages: messagesOf(rec1.json).map((m) => m.slice(0, 240)) },
        oracle,
      }
      if (expectCodes(problems, rec1, ['FOLD-DIFF'], push, { label: 'LDG-05/k8-value' })) {
        if (!namedIn(rec1.json, BUG_B)) push('NOT-NAMED', `[LDG-05/k8-value] FOLD-DIFF 必须点名被改的那条 ${BUG_B}`)
        if (namedIn(rec1.json, BUG_A) || namedIn(rec1.json, BUG_C)) push('NOT-NAMED', '[LDG-05/k8-value] 报文点名了没动过的 A/C —— 刀切宽了')
        const hit = oracle.diffs.find((d) => d.id === BUG_B && d.field === 'disposition')
        if (hit === undefined) push('FOLD-ORACLE-DISAGREES', `[LDG-05/k8-value] 测试自己的 oracle 没看见处置值被动：${JSON.stringify(oracle.diffs)}`)
      }
    }
    // ── ③ 刀 K9：删掉一条缺陷的整天事件 ⇒ 对账必须点名"少了哪一条"（不许只报少 1 条）──────
    {
      const { scene, archiveFile } = migratedScene('LDG-05', 'k9-lost', { drop: [BUG_C] })
      const fold = runFold(scene.root)
      const rec2 = runReconcile(scene.root, { archive: archiveFile })
      const oracle = reconcileOracle({ entries: ARCHIVE_ENTRIES, states: fold.json?.states ?? [] })
      rec.readings['k9-lost'] = {
        fold: { exit: fold.exit, states: Array.isArray(fold.json?.states) ? fold.json.states.length : null, codes: codesOf(fold.json) },
        reconcile: { exit: rec2.exit, codes: codesOf(rec2.json), messages: messagesOf(rec2.json).map((m) => m.slice(0, 240)) },
        oracle,
      }
      if (expectCodes(problems, rec2, ['FOLD-TOTAL-MISMATCH'], push, { label: 'LDG-05/k9-lost' })) {
        if (!namedIn(rec2.json, BUG_C)) push('NOT-NAMED', `[LDG-05/k9-lost] FOLD-TOTAL-MISMATCH 必须点名丢掉的那条 ${BUG_C}（"少了 1 条"不算）`)
      }
      if (!oracle.missing.includes(BUG_C)) push('FOLD-ORACLE-DISAGREES', `[LDG-05/k9-lost] 测试自己的 oracle 没看见丢的那条：${JSON.stringify(oracle.missing)}`)
    }
    // ── ④ 唯一实现（静态腿 + 自己的阴性对照）──────────────────────────────────
    {
      const impl = foldImplementationReading()
      const wiring = checkToolFoldWiring()
      const readers = readerWiring()
      rec.readings.single_impl = { impl, wiring, readers, wired: readers.wired }
      if (impl.hits.length !== 1) {
        push('FOLD-IMPL-DUPLICATED', `[本票] 全仓 \`function foldBugBook\` 实得 ${impl.hits.length} 处（${JSON.stringify(impl.hits)}），期望恰好 1 处（契约 §4.3-a）`)
      } else if (impl.hits[0].file !== impl.lib) {
        push('FOLD-IMPL-DUPLICATED', `[本票] 唯一那份折叠实现在 ${impl.hits[0].file}，契约 §4.1 要它在 ${impl.lib}`)
      }
      if (!wiring.imports_lib) push('FOLD-IMPL-DUPLICATED', '[本票] presets/agenia/bin/决议-check.mjs 没有 import 缺陷折叠库（契约 §4.3-b）')
      if (wiring.local_defs !== 0) push('FOLD-IMPL-DUPLICATED', `[本票] 检查器自己定义了 ${wiring.local_defs} 处 foldBugBook（契约 §4.3-b 要 0 处）`)
      if (readers.wired < 2) {
        push('FOLD-IMPL-DUPLICATED', `[本票] 9 个历史读方里接上共享库/CLI 的只有 ${readers.wired} 个（下限 2；读数 ${JSON.stringify(readers.rows)}）`)
      }
      // 阴性对照：一份"写了两处折叠"的假仓库必须让同一条判据红（证明它判的是实现份数，不是路径存在）
      const fake = buildScene({
        caseId: 'LDG-05', tag: 'dup-impl',
        files: [
          { rel: 'presets/agenia/lib/缺陷折叠.mjs', text: 'export function foldBugBook({ root }) { return { ok: true, states: [], problems: [] } }\n' },
          { rel: 'presets/agenia/lib/second-fold.mjs', text: 'export function foldBugBook({ root }) { return { ok: true, states: [], problems: [] } }\n' },
        ],
        withLedger: false,
      })
      const dup = foldImplementationReading({ repo: fake.root })
      rec.readings.dup_impl = dup
      if (dup.hits.length !== 2) push('KNIFE-NO-BITE', `[LDG-05/dup-impl] 假仓库里放了两处定义，判据实得 ${dup.hits.length} 处 —— 这条静态腿不咬（契约 §4.3-a）`)
    }
    // ── ⑤ 真树：153 条逐条对上（工具 + oracle 两边）+ 归档在盘上 ──────────────────
    {
      // expected 侧：**归档优先**（0012 §⑤ 说旧台账归档留回滚点；活的那份删没删不判，
      // 契约 §13 —— 但"能对账的那一份"必须在）。
      const archive = findArchive()
      const archived = archive.ok ? readJson(archive.file) : { ok: false, json: null, error: '归档不在' }
      const old = archive.ok && Array.isArray(archived.json?.entries)
        ? { ok: true, entries: archived.json.entries, count: archived.json.entries.length, error: null, source: archive.file }
        : { ...readOldLedger(), source: '.team/bug/ledger.json' }
      rec.readings.real_archive = {
        archive,
        old_ledger: { ok: old.ok, count: old.count, error: old.error, source: old.source },
        live_old_ledger: (() => { const l = readOldLedger(); return { ok: l.ok, count: l.count, error: l.error } })(),
      }
      const fold = runFold(PATHS.repo)
      rec.readings.real_fold = {
        exit: fold.exit,
        codes: codesOf(fold.json),
        states: Array.isArray(fold.json?.states) ? fold.json.states.length : null,
        json_error: fold.json === null ? fold.json_error : null,
      }
      if (fold.json === null) {
        push('JSON-UNPARSEABLE', `[真树] --op fold 的 --json 解析不了（${fold.json_error}）`)
      } else {
        const states = fold.json?.states ?? []
        if (old.count !== 153) push('FOLD-TOTAL-MISMATCH', `[真树] 旧台账实得 ${old.count} 条，期望 153（${old.error ?? '读得到'}）`)
        if (states.length !== 153) push('FOLD-TOTAL-MISMATCH', `[真树] 折叠状态实得 ${states.length} 条，期望 153`)
        const oracle = reconcileOracle({ entries: old.entries ?? [], states })
        rec.readings.real_oracle = {
          ok: oracle.ok, archive_entries: oracle.archive_entries, folded_states: oracle.folded_states,
          compared: oracle.compared, missing: oracle.missing.slice(0, 20), extra: oracle.extra.slice(0, 20),
          diffs: oracle.diffs.slice(0, 20), diff_count: oracle.diffs.length,
        }
        if (!oracle.ok) {
          push('FOLD-ORACLE-DISAGREES', `[真树] 测试自己的对账不成立：compared ${oracle.compared}/153 · missing ${JSON.stringify(oracle.missing.slice(0, 10))} · extra ${JSON.stringify(oracle.extra.slice(0, 10))} · diffs ${JSON.stringify(oracle.diffs.slice(0, 10))}`)
        }
        if (!archive.ok) {
          push('FOLD-ARCHIVE-MISSING', `[真树] .team/_archive/ 下找不到能解析出 entries 的旧账本（候选 ${JSON.stringify(archive.candidates)}）—— 迁移的回滚点必须在（0012 §⑤）`)
        } else {
          const rec3 = runReconcile(PATHS.repo, { archive: archive.file })
          rec.readings.real_reconcile = {
            archive: archive.file, exit: rec3.exit, ok: rec3.json?.ok ?? null,
            compared: rec3.json?.compared ?? null, archive_entries: rec3.json?.archive_entries ?? null,
            folded_states: rec3.json?.folded_states ?? null, legacy_disposed: rec3.json?.legacy_disposed ?? null,
            diffs: (rec3.json?.diffs ?? []).slice(0, 20), codes: codesOf(rec3.json),
          }
          if (expectCodes(problems, rec3, [], push, { label: 'LDG-05/真树 · reconcile' })) {
            if (rec3.json?.compared !== 153) push('FOLD-TOTAL-MISMATCH', `[真树] reconcile.compared 实得 ${JSON.stringify(rec3.json?.compared)}，期望 153`)
            if ((rec3.json?.diffs ?? []).length !== 0) push('FOLD-DIFF', `[真树] reconcile.diffs 非空：${JSON.stringify((rec3.json.diffs ?? []).slice(0, 10))}`)
            if (rec3.json?.legacy_disposed !== 153) push('LEGACY-COUNT-DRIFT', `[真树] legacy_disposed 实得 ${JSON.stringify(rec3.json?.legacy_disposed)}，期望 153`)
          }
        }
      }
    }

    caseFail(problems)
  })
})
