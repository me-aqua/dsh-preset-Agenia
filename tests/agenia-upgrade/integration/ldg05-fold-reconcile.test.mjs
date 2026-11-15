/**
 * `LDG-05` —— **折叠对账：按 kind 的键宇宙，一个键都不许丢**（构案 0012 · 本票最承重的一条）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§3 事件流 · §4 折叠与对账 · §4.3 唯一实现 ·
 * §9.3 级联 · §11 刀表 K8/K8b/K9/K8c）。
 *
 * 两条独立的读者，**两边都要成立**：
 *   ① 产品的 `--op reconcile`（被审方自报的那一份）；
 *   ② 测试自己的 `reconcileOracle`（**同一规则**的独立实现：按 kind 取「旧台账视图 ∪ 事件视图」的
 *      键宇宙，逐键比 identical / missing / differing）。
 * 只有 ① 绿 = 让被审方自己判自己（`cand-20261022-0151`）；两边不一致 ⇒ `FOLD-ORACLE-DISAGREES`。
 *
 * 🔴 为什么不是"七格"（Gate 3 r4 · 2026-11-15）：手写字段表连续两轮比数据窄 ——
 *    r3 漏 `registered` 的四个字段，r4 漏 `assessed` 的 `fix_sketch` / `cost`。
 *    这一版比的是**数据自己的键宇宙**；K8c 逐键删，任何一个键被删都必须红。
 */
import path from 'node:path'
import { before, test } from 'node:test'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CHECK, FOLD_LIB, archiveEntry, archiveText, buildScene, checkToolFoldWiring, codesOf, eventAssessed,
  eventDisposed, eventRegistered, expectCodes, findArchive, foldImplementationReading, kindTableDiff,
  messagesOf, namedIn, readJson, readOldLedger, readerWiring, reconcileOracle, runFold, runReconcile,
  toolPresent, withoutEventKey,
} from '../support/three-books.mjs'

before(() => {
  preflight()
})

const BUG_A = 'bug-20261115-01'
const BUG_B = 'bug-20261115-02'
const BUG_C = 'bug-20261115-03'

const registeredAt = (seq) => `2026-11-15T09:0${seq}:00+08:00`
const assessedAt = (seq) => `2026-11-15T10:0${seq}:00+08:00`
const disposedAt = (seq) => `2026-11-15T11:0${seq}:00+08:00`

/** 三条缺陷（事件与旧台账两侧都从这一份派生 —— 夹具自己不许一边写一套）。 */
const BUGS = [
  { id: BUG_A, seq: 1, phenomenon: '夹具现象甲', value: 'adopted', reason: '甲已落地' },
  { id: BUG_B, seq: 4, phenomenon: '夹具现象乙', value: 'rejected', reason: '乙不是缺陷' },
  { id: BUG_C, seq: 7, phenomenon: '夹具现象丙', value: 'deferred', reason: '丙冻结为历史' },
]

/**
 * `registered` 那一族的全键（A 那条**每格都有真值**；B/C 同形）。
 * `reporter` / `source` / `tags` / `finding_refs` 也必须出现在夹具里，否则闸门"任何键被删都要红"
 * 就只覆盖到 A 那条带值的键（`cand-20261114-0525`：夹具的便利默认值会把刀关掉）。
 */
const REG_FIELDS = {
  reporter: '组长',
  source: { carrier: 'leader', ref: 'fixture/reg-a' },
  tags: ['ledger', 'fixture'],
  finding_refs: ['F3'],
}
const A_FIELDS = {
  ...REG_FIELDS,
  how_seen: '夹具：怎么撞见的甲（迁移来源）',
  evidence: [{ kind: 'file', ref: 'fixture/evidence-a.log', note: '夹具证据甲' }],
  recipe: { steps: ['夹具步骤一'], expected: '绿', actual: '红' },
  batch: '批-A',
}

/**
 * `assessed` 那一族的全键（`verdict` / `at` 由构造器给）。
 * 故意留两个 **null 值**（`sample_version` / `hides`）：删掉"值为 null 的键"只有 presence 判得了。
 */
const ASSESSED_FIELDS = {
  verdict: 'true',
  severity_line: 'function_broken_repro',
  severity_confidence: 'yes',
  cost: 'medium —— 夹具成本（2 小时）',
  fix_sketch: '夹具修法：只改一处（这条在 r4 之前是 null）',
  sample_version: null,
  by_role: 'test',
  hides: null,
  line_decision: null,
  escalated_at: null,
  card_red: false,
}

/** 旧台账（expected 侧）：三族字段都齐（与事件侧同一份常量派生）。 */
const ARCHIVE_ENTRIES = BUGS.map((bug) => archiveEntry({
  id: bug.id,
  phenomenon: bug.phenomenon,
  value: bug.value,
  reason: bug.reason,
  at: disposedAt(bug.seq),
  extra: {
    ...(bug.id === BUG_A ? A_FIELDS : REG_FIELDS),
    registered_at: registeredAt(bug.seq),
    assessment: { ...ASSESSED_FIELDS, at: assessedAt(bug.seq) },
    line_decision: null,
    escalated_at: null,
    card_red: false,
  },
}))

/**
 * 事件流（actual 侧）。`drop` 删一整天；`change` 换一条处置；`registeredFields` 换 A 的登记字段；
 * `dropKey` = 刀 K8c：从某条事件的 `{kind,key}` 删**一个**键。
 */
function migratedDay({ drop = [], change = {}, registeredFields = {}, dropKey = null } = {}) {
  const events = []
  for (const bug of BUGS) {
    if (drop.includes(bug.id)) continue
    const disposition = change[bug.id] ?? { value: bug.value, reason: bug.reason }
    events.push(
      eventRegistered({
        seq: bug.seq, id: bug.id, phenomenon: bug.phenomenon, at: registeredAt(bug.seq),
        extra: registeredFields[bug.id] ?? (bug.id === BUG_A ? A_FIELDS : REG_FIELDS),
      }),
      eventAssessed({
        seq: bug.seq + 1, id: bug.id, at: assessedAt(bug.seq), verdict: ASSESSED_FIELDS.verdict,
        extra: Object.fromEntries(Object.entries(ASSESSED_FIELDS).filter(([k]) => k !== 'verdict')),
      }),
      eventDisposed({
        seq: bug.seq + 2, id: bug.id, at: disposedAt(bug.seq), value: disposition.value, reason: disposition.reason,
        extra: { 历史: disposition.value },
      }),
    )
  }
  const sliced = dropKey === null ? events : withoutEventKey(events, dropKey)
  return { day: '2026-11-15', events: sliced }
}

/** 造一棵"已迁移"的树 + 一份旧台账（对账的两侧都是夹具自己写的）。 */
function migratedScene(caseId, tag, { drop = [], change = {}, archive = true, registeredFields = {}, dropKey = null } = {}) {
  const scene = buildScene({
    caseId, tag,
    products: [{ id: '0001', title: '产品口径样张' }],
    schemes: [{ id: '0012', title: '三册账本', parent: '0001', basisP: ['0001'], basisBug: [BUG_A, BUG_B, BUG_C] }],
    days: [migratedDay({ drop, change, registeredFields, dropKey })],
    files: archive ? [{ rel: '_fixture/ledger.json', text: archiveText(ARCHIVE_ENTRIES) }] : [],
    team: true,
  })
  return { scene, archiveFile: path.join(scene.root, '_fixture', 'ledger.json') }
}

/** 读数里的 kinds 摘要（证据文件里别塞整张表）。 */
function kindsBrief(json) {
  return Object.fromEntries(Object.entries(json?.kinds ?? {}).map(([kind, v]) => [kind, {
    archive_records: v.archive_records, event_records: v.event_records, compared: v.compared,
    keys: Object.keys(v.keys ?? {}).length,
    bad: Object.entries(v.keys ?? {}).filter(([, n]) => n.missing > 0 || n.differing > 0).map(([k, n]) => `${k}:m${n.missing}/d${n.differing}`),
  }]))
}

// ── LDG-05 ──────────────────────────────────────────────────────────────
test('LDG-05 折叠对账：按 kind 的键宇宙（registered/assessed/disposed）逐键比 · 153/153 与 122/122 · 删任意一个键 ⇒ 红', async () => {
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

    // ── ① 夹具：三族全键逐条对上（A 那条每格有真值，含两个 null 值键）⇒ 工具与 oracle 都绿 ──
    {
      const { scene, archiveFile } = migratedScene('LDG-05', 'good')
      const fold = runFold(scene.root)
      const rec0 = runReconcile(scene.root, { archive: archiveFile })
      const oracle = reconcileOracle({ entries: ARCHIVE_ENTRIES, states: fold.json?.states ?? [] })
      rec.readings.good = {
        root: scene.root,
        fold: { exit: fold.exit, codes: codesOf(fold.json), states: Array.isArray(fold.json?.states) ? fold.json.states.length : null },
        reconcile: {
          exit: rec0.exit, ok: rec0.json?.ok ?? null, compared: rec0.json?.compared ?? null,
          archive_entries: rec0.json?.archive_entries ?? null, folded_states: rec0.json?.folded_states ?? null,
          kinds: kindsBrief(rec0.json), codes: codesOf(rec0.json),
        },
        oracle: { ok: oracle.ok, kinds: kindsBrief(oracle), diffs: oracle.diffs, missing: oracle.missing },
      }
      if (expectCodes(problems, fold, [], push, { label: 'LDG-05/good · fold' }) && expectCodes(problems, rec0, [], push, { label: 'LDG-05/good · reconcile' })) {
        if (!oracle.ok) {
          push('FOLD-ORACLE-DISAGREES', `[LDG-05/good] 测试自己的对账不成立：${JSON.stringify({ missing: oracle.missing, extra: oracle.extra, diffs: oracle.diffs, missing_keys: oracle.missing_keys })} —— 夹具自己就没对上，后面的刀不作数`)
        }
        if (rec0.json?.compared !== 3) push('FOLD-TOTAL-MISMATCH', `[LDG-05/good] reconcile.compared 实得 ${JSON.stringify(rec0.json?.compared)}，期望 3`)
        const drift = kindTableDiff(rec0.json?.kinds, oracle.kinds)
        if (drift.length > 0) push('FOLD-ORACLE-DISAGREES', `[LDG-05/good] 工具与 oracle 的 kinds 不是同一张表：${JSON.stringify(drift.slice(0, 6))}（契约 §4.2-4）`)
        // 三族各自的记录数（旧台账侧）：3 / 3 / 3
        for (const kind of ['registered', 'assessed', 'disposed']) {
          const n = rec0.json?.kinds?.[kind]?.compared ?? null
          if (n !== 3) push('FOLD-TOTAL-MISMATCH', `[LDG-05/good] kinds.${kind}.compared 实得 ${JSON.stringify(n)}，期望 3`)
        }
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
        oracle: { ok: oracle.ok, diffs: oracle.diffs },
      }
      if (expectCodes(problems, rec1, ['FOLD-DIFF'], push, { label: 'LDG-05/k8-value' })) {
        if (!namedIn(rec1.json, BUG_B)) push('NOT-NAMED', `[LDG-05/k8-value] FOLD-DIFF 必须点名被改的那条 ${BUG_B}`)
        if (namedIn(rec1.json, BUG_A) || namedIn(rec1.json, BUG_C)) push('NOT-NAMED', '[LDG-05/k8-value] 报文点名了没动过的 A/C —— 刀切宽了')
        const hit = oracle.diffs.find((d) => d.id === BUG_B && d.field === 'disposition')
        if (hit === undefined) push('FOLD-ORACLE-DISAGREES', `[LDG-05/k8-value] 测试自己的 oracle 没看见处置值被动：${JSON.stringify(oracle.diffs)}`)
      }
    }
    // ── ②' 刀 K8b（r3）：改一条事件的 `evidence` ⇒ 恰好 `FOLD-DIFF`，点名那个 id ─────────
    {
      const altered = { ...A_FIELDS, evidence: [{ kind: 'file', ref: 'fixture/evidence-a.log', note: '被改过的证据' }] }
      const { scene, archiveFile } = migratedScene('LDG-05', 'k8b-evidence', { registeredFields: { [BUG_A]: altered } })
      const fold = runFold(scene.root)
      const recEv = runReconcile(scene.root, { archive: archiveFile })
      const oracle = reconcileOracle({ entries: ARCHIVE_ENTRIES, states: fold.json?.states ?? [] })
      rec.readings['k8b-evidence'] = {
        fold: { exit: fold.exit, codes: codesOf(fold.json) },
        reconcile: { exit: recEv.exit, codes: codesOf(recEv.json), diffs: recEv.json?.diffs ?? null, messages: messagesOf(recEv.json).map((m) => m.slice(0, 240)) },
        oracle: { ok: oracle.ok, diffs: oracle.diffs },
      }
      if (expectCodes(problems, recEv, ['FOLD-DIFF'], push, { label: 'LDG-05/k8b-evidence' })) {
        if (!namedIn(recEv.json, BUG_A)) push('NOT-NAMED', `[LDG-05/k8b-evidence] FOLD-DIFF 必须点名被改的那条 ${BUG_A}`)
        if (namedIn(recEv.json, BUG_B) || namedIn(recEv.json, BUG_C)) push('NOT-NAMED', '[LDG-05/k8b-evidence] 报文点名了没动过的 B/C —— 刀切宽了')
        const hit = oracle.diffs.find((d) => d.id === BUG_A && d.field === 'evidence')
        if (hit === undefined) push('FOLD-ORACLE-DISAGREES', `[LDG-05/k8b-evidence] 测试自己的 oracle 没看见 evidence 被动：${JSON.stringify(oracle.diffs)}`)
      }
    }
    // ── ②'' 刀 K8c（r4）：**逐键删** —— 比对面覆盖的每一个键，删掉都必须红 ─────────────────
    // 只跑「折叠的形状不要求」的键：`id` / `at` / `entry_kind` / `phenomenon` / `disposition`
    // / `seq` / `kind` 被删时折叠自己报 `BUG-EVENT-SHAPE`（另一道闸，不是比对面），其余键唯一的守门人
    // 就是这张键宇宙。删的是 A 那条（三族都有真值）—— 每个键一次 reconcile。
    const knifeKeys = [
      ...['reporter', 'source', 'tags', 'how_seen', 'evidence', 'recipe', 'batch', 'finding_refs']
        .map((key) => ({ kind: 'registered', key })),
      ...['verdict', 'severity_line', 'severity_confidence', 'cost', 'fix_sketch', 'sample_version', 'by_role', 'hides', 'line_decision', 'escalated_at', 'card_red']
        .map((key) => ({ kind: 'assessed', key })),
      { kind: 'disposed', key: '历史' },
    ]
    rec.readings.k8c = {}
    for (const { kind, key } of knifeKeys) {
      const tag = `k8c-${kind}-${key.replace(/[^\w]/g, '_')}`
      const { scene, archiveFile } = migratedScene('LDG-05', tag, { dropKey: { id: BUG_A, kind, key } })
      const rec2 = runReconcile(scene.root, { archive: archiveFile })
      rec.readings.k8c[`${kind}.${key}`] = { exit: rec2.exit, codes: codesOf(rec2.json), messages: messagesOf(rec2.json).map((m) => m.slice(0, 200)) }
      if (rec2.exit !== 1) {
        push('KNIFE-NO-BITE', `[LDG-05/k8c ${kind}.${key}] 删掉这一个键后 reconcile exit 实得 ${JSON.stringify(rec2.exit)}，期望 1 —— 这个键不在比对面里`)
        continue
      }
      const namedField = (rec2.json?.problems ?? []).some((p) => p.code === 'FOLD-FIELD-MISSING'
        && p.field === key && String(p.id) === BUG_A && p.kind === kind)
      if (!namedField) {
        push('NOT-NAMED', `[LDG-05/k8c ${kind}.${key}] 红了但不是 \`FOLD-FIELD-MISSING\` 点名 ${BUG_A}/${kind}.${key}：${JSON.stringify(codesOf(rec2.json))} ${JSON.stringify(messagesOf(rec2.json).slice(0, 3))}`)
      }
      // 刀只切一处：B/C 不许被点名
      if (namedIn(rec2.json, BUG_B) || namedIn(rec2.json, BUG_C)) {
        push('NOT-NAMED', `[LDG-05/k8c ${kind}.${key}] 报文点名了没动过的 B/C —— 刀切宽了`)
      }
    }
    // ── ③ 刀 K9：删掉一条缺陷的整天事件 ⇒ 对账必须点名"少了哪一条"（不许只报少 1 条）──────
    {
      const { scene, archiveFile } = migratedScene('LDG-05', 'k9-lost', { drop: [BUG_C] })
      const fold = runFold(scene.root)
      const rec3 = runReconcile(scene.root, { archive: archiveFile })
      const oracle = reconcileOracle({ entries: ARCHIVE_ENTRIES, states: fold.json?.states ?? [] })
      rec.readings['k9-lost'] = {
        fold: { exit: fold.exit, states: Array.isArray(fold.json?.states) ? fold.json.states.length : null, codes: codesOf(fold.json) },
        reconcile: { exit: rec3.exit, codes: codesOf(rec3.json), messages: messagesOf(rec3.json).map((m) => m.slice(0, 240)) },
        oracle: { ok: oracle.ok, missing: oracle.missing },
      }
      if (expectCodes(problems, rec3, ['FOLD-TOTAL-MISMATCH'], push, { label: 'LDG-05/k9-lost' })) {
        if (!namedIn(rec3.json, BUG_C)) push('NOT-NAMED', `[LDG-05/k9-lost] FOLD-TOTAL-MISMATCH 必须点名丢掉的那条 ${BUG_C}（"少了 1 条"不算）`)
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
    // ── ⑤ 真树：153 条逐条对上（工具 + oracle 两边）+ 三族全键 + 归档在盘上 ──────────────
    {
      const archive = findArchive()
      const archived = archive.ok ? readJson(archive.file) : { ok: false, json: null, error: '归档不在' }
      const old = archive.ok && Array.isArray(archived.json?.entries)
        ? { ok: true, entries: archived.json.entries, count: archived.json.entries.length, error: null, source: archive.file, updatedAt: archived.json?.updated_at ?? null }
        : { ...readOldLedger(), updatedAt: null }
      rec.readings.real_archive = {
        archive,
        old_ledger: { ok: old.ok, count: old.count, error: old.error, source: old.source, updated_at: old.updatedAt },
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
        const oracle = reconcileOracle({ entries: old.entries ?? [], states, archiveUpdatedAt: old.updatedAt })
        rec.readings.real_oracle = {
          ok: oracle.ok, archive_entries: oracle.archive_entries, folded_states: oracle.folded_states,
          compared: oracle.compared, missing: oracle.missing.slice(0, 20), extra: oracle.extra.slice(0, 20),
          post_migration: oracle.post_migration, missing_keys: oracle.missing_keys.slice(0, 20),
          diffs: oracle.diffs.slice(0, 20), diff_count: oracle.diffs.length, kinds: kindsBrief(oracle),
        }
        if (!oracle.ok) {
          push('FOLD-ORACLE-DISAGREES', `[真树] 测试自己的对账不成立：compared ${oracle.compared}/153 · missing ${JSON.stringify(oracle.missing.slice(0, 10))} · extra ${JSON.stringify(oracle.extra.slice(0, 10))} · missing_keys ${JSON.stringify(oracle.missing_keys.slice(0, 5))} · diffs ${JSON.stringify(oracle.diffs.slice(0, 5))}`)
        }
        // 迁移之后新登记的（事件流 append-only）不是损失，也不是"153"里的一员 —— 单列读数，别把它读成 0。
        if (states.length !== old.count + oracle.post_migration.length) {
          push('FOLD-TOTAL-MISMATCH', `[真树] 折叠状态 ${states.length} ≠ 旧台账 ${old.count} + 迁移后新登记 ${oracle.post_migration.length} —— 有一层对不上`)
        }
        if (!archive.ok) {
          push('FOLD-ARCHIVE-MISSING', `[真树] .team/_archive/ 下找不到能解析出 entries 的旧账本（候选 ${JSON.stringify(archive.candidates)}）—— 迁移的回滚点必须在（0012 §⑤）`)
        } else {
          const rec4 = runReconcile(PATHS.repo, { archive: archive.file })
          rec.readings.real_reconcile = {
            archive: archive.file, exit: rec4.exit, ok: rec4.json?.ok ?? null,
            compared: rec4.json?.compared ?? null, archive_entries: rec4.json?.archive_entries ?? null,
            folded_states: rec4.json?.folded_states ?? null, legacy_disposed: rec4.json?.legacy_disposed ?? null,
            post_migration: rec4.json?.post_migration ?? null, kinds: kindsBrief(rec4.json),
            diffs: (rec4.json?.diffs ?? []).slice(0, 20), codes: codesOf(rec4.json),
          }
          if (expectCodes(problems, rec4, [], push, { label: 'LDG-05/真树 · reconcile' })) {
            if (rec4.json?.compared !== 153) push('FOLD-TOTAL-MISMATCH', `[真树] reconcile.compared 实得 ${JSON.stringify(rec4.json?.compared)}，期望 153`)
            if ((rec4.json?.diffs ?? []).length !== 0) push('FOLD-DIFF', `[真树] reconcile.diffs 非空：${JSON.stringify((rec4.json.diffs ?? []).slice(0, 10))}`)
            if (rec4.json?.legacy_disposed !== 153) push('LEGACY-COUNT-DRIFT', `[真树] legacy_disposed 实得 ${JSON.stringify(rec4.json?.legacy_disposed)}，期望 153`)
            // 三族的旧台账侧计数（归档是回滚点，计数不随事件流增长而变）
            const need = { registered: 153, assessed: 122, disposed: 153 }
            for (const [kind, count] of Object.entries(need)) {
              const got = rec4.json?.kinds?.[kind]?.archive_records ?? null
              if (got !== count) push('FOLD-TOTAL-MISMATCH', `[真树] kinds.${kind}.archive_records 实得 ${JSON.stringify(got)}，期望 ${count}`)
            }
            // 每族每个键：missing = 0 / differing = 0（**100%** 就是这两列全零，不是"总体 ok"）
            for (const [kind, reading] of Object.entries(rec4.json?.kinds ?? {})) {
              for (const [key, cell] of Object.entries(reading.keys ?? {})) {
                if ((cell.missing ?? 0) > 0) push('FOLD-FIELD-MISSING', `[真树] kinds.${kind}.${key} 有 ${cell.missing} 条缺键`)
                if ((cell.differing ?? 0) > 0) push('FOLD-DIFF', `[真树] kinds.${kind}.${key} 有 ${cell.differing} 条值不同`)
              }
            }
            const drift = kindTableDiff(rec4.json?.kinds, oracle.kinds)
            if (drift.length > 0) {
              push('FOLD-ORACLE-DISAGREES', `[真树] 工具与 oracle 的 kinds 不是同一张表（比对面被改窄/改宽了）：${JSON.stringify(drift.slice(0, 8))}`)
            }
          }
        }
      }
    }

    caseFail(problems)
  })
})
