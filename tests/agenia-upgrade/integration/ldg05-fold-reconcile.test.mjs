/**
 * `LDG-05` —— **折叠对账：按 kind 的键宇宙，一个键都不许丢**（构案 0012 · 本票最承重的一条）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§3 事件流 · §4 折叠与对账 · §4.3 唯一实现 ·
 * §9.3 级联 · §11 刀表 K8/K8b/K8c/K8d/K8e/K8f/K8g/K8h/K9）。
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
 * 🔴 r5 补的是**同一句话的四条腿**（第 4 关 r3 · M-2）：`disposed` 的事件键原先在折叠那一刻就被丢掉
 *    （产品视图与 oracle 同时看不见 ⇒ 加一个 `note` 是绿的）；`assessment === null` 时条目级
 *    `line_decision` 被分类却不进视图；`bookkeeping` 是个自由槽（现在钉成 `['author']` 并进比对面）；
 *    两个新码原先**没有刀**（删掉代码套件仍绿）。
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runId, runRoot } from '../support/evidence.mjs'
import { ensureMarkedDir } from '../support/root-guard.mjs'
import {
  CHECK, FOLD_LIB, archiveEntry, archiveText, buildScene, checkToolFoldWiring, codesOf, eventAssessed,
  eventDisposed, eventRegistered, expectCodes, findArchive, foldImplementationReading, kindTableDiff,
  messagesOf, namedIn, readJson, readOldLedger, readerWiring, reconcileOracle, runBugRead, runFold, runReconcile,
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
    // 兜底那一族（bookkeeping）的 `author`：旧账 153 条每条都有它，读面按写者身份写死 `'leader'`。
    // 夹具**显式**写出来（不用构造器的默认值）—— 否则 K8h 删它的刀会被便利默认值关掉。
    author: 'leader',
  },
}))

/**
 * 事件流（actual 侧）。`drop` 删一整天；`change` 换一条处置；`registeredFields` 换 A 的登记字段；
 * `dropKey` = 刀 K8c：从某条事件的 `{kind,key}` 删**一个**键；
 * `dropEvent` = 刀 K8f：把某条的某一整族事件（`{id,kind}`）删掉；`disposedExtra` = 刀 K8d：往 A 的
 * `disposed` 事件加一个键（r5 的比对面必须看得见它）。
 */
function migratedDay({ drop = [], change = {}, registeredFields = {}, dropKey = null, dropEvent = null, disposedExtra = {} } = {}) {
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
        extra: { 历史: disposition.value, ...(bug.id === BUG_A ? disposedExtra : {}) },
      }),
    )
  }
  const kept = dropEvent === null ? events : events.filter((e) => !(e.id === dropEvent.id && e.kind === dropEvent.kind))
  const sliced = dropKey === null ? kept : withoutEventKey(kept, dropKey)
  return { day: '2026-11-15', events: sliced }
}

/**
 * 刀 K8h：旧台账里 A 那一条**删一个键**（书签族的 `author` 只能在旧账侧删 —— 事件载荷里本来就没有它）。
 * 其余两条不动：切宽了会同时红别的东西，归因就糊了。
 */
function archiveWithDroppedKey(keys) {
  return ARCHIVE_ENTRIES.map((entry) => {
    if (entry.id !== BUG_A) return entry
    const copy = { ...entry }
    for (const k of keys) delete copy[k]
    return copy
  })
}

/** 造一棵"已迁移"的树 + 一份旧台账（对账的两侧都是夹具自己写的）。 */
function migratedScene(caseId, tag, {
  drop = [], change = {}, archive = true, registeredFields = {}, dropKey = null, dropEvent = null,
  disposedExtra = {}, archiveEntries = null,
} = {}) {
  const scene = buildScene({
    caseId, tag,
    products: [{ id: '0001', title: '产品口径样张' }],
    schemes: [{ id: '0012', title: '三册账本', parent: '0001', basisP: ['0001'], basisBug: [BUG_A, BUG_B, BUG_C] }],
    days: [migratedDay({ drop, change, registeredFields, dropKey, dropEvent, disposedExtra })],
    files: archive ? [{ rel: '_fixture/ledger.json', text: archiveText(archiveEntries ?? ARCHIVE_ENTRIES) }] : [],
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
        // 四族各自的记录数（旧台账侧）：3 / 3 / 3 / 3（兜底那一族也是 3）
        for (const kind of ['registered', 'assessed', 'disposed', 'bookkeeping']) {
          const n = rec0.json?.kinds?.[kind]?.compared ?? null
          if (n !== 3) push('FOLD-TOTAL-MISMATCH', `[LDG-05/good] kinds.${kind}.compared 实得 ${JSON.stringify(n)}，期望 3`)
        }
        // 分类表：`bookkeeping` 必须是钉死的一格（不是自由槽）——把兜底族印出来，读的人不用猜
        const partition = rec0.json?.archive_key_partition ?? null
        rec.readings.good.partition = partition
        if (JSON.stringify(partition?.bookkeeping) !== JSON.stringify(['author'])) {
          push('FOLD-ARCHIVE-KEY-UNCLASSIFIED', `[LDG-05/good] 旧账分类表的 bookkeeping 实得 ${JSON.stringify(partition?.bookkeeping ?? null)}，期望 ["author"] —— 它是自由槽的话，新键塞进去就不在比对面里了`)
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
    // ── ②''' 刀 K8d（r5）：往 `disposed` 事件加一个键 ⇒ 比对面必须看得见它 ─────────────
    // 这条腿钉的是 2026-11-15 第 4 关 r3 · M-2：折叠只留 `disposition` 四格 + `chain` 时，事件的其它键
    // 在产品视图与测试 oracle 里**同时**消失 —— 那时这一格是绿的（"比数据窄"的原样复发）。
    {
      const { scene, archiveFile } = migratedScene('LDG-05', 'k8d-disposed-extra', { disposedExtra: { note: '刀：这一格不许在折叠时丢掉' } })
      const fold = runFold(scene.root)
      const recD = runReconcile(scene.root, { archive: archiveFile })
      const oracle = reconcileOracle({ entries: ARCHIVE_ENTRIES, states: fold.json?.states ?? [] })
      rec.readings['k8d-disposed-extra'] = {
        fold: { exit: fold.exit, codes: codesOf(fold.json) },
        reconcile: { exit: recD.exit, codes: codesOf(recD.json), messages: messagesOf(recD.json).map((m) => m.slice(0, 240)) },
        oracle: { ok: oracle.ok, missing_keys: oracle.missing_keys },
      }
      if (expectCodes(problems, recD, ['FOLD-FIELD-MISSING'], push, { label: 'LDG-05/k8d-disposed-extra' })) {
        const namedField = (recD.json?.problems ?? []).some((p) => p.code === 'FOLD-FIELD-MISSING'
          && p.field === 'note' && p.kind === 'disposed' && String(p.id) === BUG_A)
        if (!namedField) push('NOT-NAMED', `[LDG-05/k8d-disposed-extra] 红了但不是 \`FOLD-FIELD-MISSING\` 点名 ${BUG_A}/disposed.note：${JSON.stringify(codesOf(recD.json))}`)
        if (namedIn(recD.json, BUG_B) || namedIn(recD.json, BUG_C)) push('NOT-NAMED', '[LDG-05/k8d-disposed-extra] 报文点名了没动过的 B/C —— 刀切宽了')
        if (!oracle.missing_keys.some((k) => k.id === BUG_A && k.field === 'note' && k.kind === 'disposed')) {
          push('FOLD-ORACLE-DISAGREES', `[LDG-05/k8d-disposed-extra] 测试自己的 oracle 没看见 disposed 少了一个键：${JSON.stringify(oracle.missing_keys)}`)
        }
      }
    }
    // ── ②'''' 刀 K8e（r5）：旧台账出现一个**没分类**的键 ⇒ 恰好 `FOLD-ARCHIVE-KEY-UNCLASSIFIED` ──
    // 两个样本：`foo`（随便一个新键）与 `author_note`（往**书签那个槽**里塞 —— 槽被钉死成 `['author']`，
    // 所以它照样是"没分类"，不许因为长得像 bookkeeping 就静默进兜底）。
    rec.readings['k8e-unclassified'] = {}
    for (const extraKey of ['foo', 'author_note']) {
      const altered = ARCHIVE_ENTRIES.map((entry) => (entry.id === BUG_A ? { ...entry, [extraKey]: '刀：这个键没分类' } : entry))
      const { scene, archiveFile } = migratedScene('LDG-05', `k8e-${extraKey}`, { archiveEntries: altered })
      const recE = runReconcile(scene.root, { archive: archiveFile })
      rec.readings['k8e-unclassified'][extraKey] = {
        exit: recE.exit, codes: codesOf(recE.json), messages: messagesOf(recE.json).map((m) => m.slice(0, 200)),
      }
      if (expectCodes(problems, recE, ['FOLD-ARCHIVE-KEY-UNCLASSIFIED'], push, { label: `LDG-05/k8e-${extraKey}` })) {
        const namedKey = (recE.json?.problems ?? []).some((p) => p.code === 'FOLD-ARCHIVE-KEY-UNCLASSIFIED' && p.field === extraKey)
        if (!namedKey) push('NOT-NAMED', `[LDG-05/k8e-${extraKey}] 报文没有点名没分类的那个键 ${extraKey}`)
        if (!namedIn(recE.json, BUG_A)) push('NOT-NAMED', `[LDG-05/k8e-${extraKey}] 报文没有点名带这个键的那条 ${BUG_A}`)
      }
    }
    // ── ②''''' 刀 K8f（r5）：删掉 A 的**一整族**（`assessed` 事件）⇒ 恰好 `FOLD-KIND-MISSING` ───
    // 整族丢不是"某个键丢"：`FOLD-TOTAL-MISMATCH` 不许跟着红（记录还在，族没了）。
    {
      const { scene, archiveFile } = migratedScene('LDG-05', 'k8f-missing-assessed', { dropEvent: { id: BUG_A, kind: 'assessed' } })
      const recF = runReconcile(scene.root, { archive: archiveFile })
      rec.readings['k8f-missing-assessed'] = {
        exit: recF.exit, codes: codesOf(recF.json), messages: messagesOf(recF.json).map((m) => m.slice(0, 240)),
      }
      if (expectCodes(problems, recF, ['FOLD-KIND-MISSING'], push, { label: 'LDG-05/k8f-missing-assessed' })) {
        const namedKind = (recF.json?.problems ?? []).some((p) => p.code === 'FOLD-KIND-MISSING'
          && p.kind === 'assessed' && String(p.id) === BUG_A)
        if (!namedKind) push('NOT-NAMED', `[LDG-05/k8f-missing-assessed] 报文没有点名 ${BUG_A}/assessed（"少了一族"不算）`)
        if (namedIn(recF.json, BUG_B) || namedIn(recF.json, BUG_C)) push('NOT-NAMED', '[LDG-05/k8f-missing-assessed] 报文点名了没动过的 B/C —— 刀切宽了')
      }
    }
    // ── ②'''''' 刀 K8g（r5）：`assessment: null` + 条目级 `line_decision` ⇒ 那一格**在比对面里** ──
    // 旧实现在 `assessment === null` 时提前 return：条目级 `line_decision` 被分类却永远看不到
    // ⇒ 这一格当时是绿的。现在它必须在（`assessed` 视图存在、事件流没有这一族 ⇒ `FOLD-KIND-MISSING`）。
    {
      const entry = archiveEntry({
        id: BUG_A, phenomenon: '夹具现象甲', value: 'adopted', reason: '甲已落地', at: disposedAt(1),
        extra: {
          registered_at: registeredAt(1),
          assessment: null,
          line_decision: { value: null, by_role: 'leader', at: '2026-11-15T12:00:00+08:00' },
          escalated_at: null,
          card_red: false,
          author: 'leader',
        },
      })
      const scene = buildScene({
        caseId: 'LDG-05', tag: 'k8g-null-assessment',
        days: [{
          day: '2026-11-15',
          events: [
            eventRegistered({ seq: 1, id: BUG_A, phenomenon: '夹具现象甲', at: registeredAt(1) }),
            eventDisposed({ seq: 2, id: BUG_A, at: disposedAt(1), value: 'adopted', reason: '甲已落地', extra: { 历史: 'adopted' } }),
          ],
        }],
        files: [{ rel: '_fixture/ledger.json', text: archiveText([entry]) }],
        team: true,
      })
      const archiveFile = path.join(scene.root, '_fixture', 'ledger.json')
      const recG = runReconcile(scene.root, { archive: archiveFile })
      rec.readings['k8g-null-assessment'] = {
        root: scene.root, exit: recG.exit, codes: codesOf(recG.json), messages: messagesOf(recG.json).map((m) => m.slice(0, 240)),
      }
      if (expectCodes(problems, recG, ['FOLD-KIND-MISSING'], push, { label: 'LDG-05/k8g-null-assessment' })) {
        const namedKind = (recG.json?.problems ?? []).some((p) => p.code === 'FOLD-KIND-MISSING'
          && p.kind === 'assessed' && String(p.id) === BUG_A)
        if (!namedKind) push('NOT-NAMED', `[LDG-05/k8g-null-assessment] 条目级 line_decision 没有进比对面（报文：${JSON.stringify(messagesOf(recG.json).slice(0, 4))}）`)
      }
    }
    // ── ②''''''' 刀 K8h（r5）：旧账删掉书签族的 `author` ⇒ `FOLD-FIELD-MISSING` 点名 bookkeeping.author ──
    // 兜底那一族进了比对面，删它必须红 —— 否则它只是换了个名字的自由槽。
    {
      const { scene, archiveFile } = migratedScene('LDG-05', 'k8h-bookkeeping-author', { archiveEntries: archiveWithDroppedKey(['author']) })
      const recH = runReconcile(scene.root, { archive: archiveFile })
      rec.readings['k8h-bookkeeping-author'] = {
        exit: recH.exit, codes: codesOf(recH.json), messages: messagesOf(recH.json).map((m) => m.slice(0, 240)),
      }
      if (expectCodes(problems, recH, ['FOLD-FIELD-MISSING'], push, { label: 'LDG-05/k8h-bookkeeping-author' })) {
        const namedField = (recH.json?.problems ?? []).some((p) => p.code === 'FOLD-FIELD-MISSING'
          && p.kind === 'bookkeeping' && p.field === 'author' && String(p.id) === BUG_A)
        if (!namedField) push('NOT-NAMED', `[LDG-05/k8h-bookkeeping-author] 红了但不是 \`FOLD-FIELD-MISSING\` 点名 ${BUG_A}/bookkeeping.author：${JSON.stringify(codesOf(recH.json))}`)
        if (namedIn(recH.json, BUG_B) || namedIn(recH.json, BUG_C)) push('NOT-NAMED', '[LDG-05/k8h-bookkeeping-author] 报文点名了没动过的 B/C —— 刀切宽了')
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
    // ── ④' `bug-read` 的**读回腿**（r5）：真 CLI → 折叠 → `assessed_payload`，三条抽样非空 ──────────
    // 为什么走真 CLI：`cost` / `fix_sketch` 之前只被静态核过（`ledgerFromBugBook:580-588` 从
    // `assessed_payload` 取），盘上三份 `_tmp/bug-read-real*.json` 快照里那两格还是 `null`
    // —— "数据里有键"与"读面真返回"是两件事（2026-11-15 第 4 关 r3 · N-2）。
    // 为什么把真账本拷进夹具根：`bug-read` 在测试模式里只认带 marker 的根（根守卫），而它又是
    // **零写入**的只读入口 —— 拷一份 12 个事件流文件进运行根，跑的仍是真 CLI + 真折叠 + 真数据。
    {
      const samples = ['bug-20261103-01', 'bug-20261103-02', 'bug-20261103-03']
      const scene = buildScene({ caseId: 'LDG-05', tag: 'bug-read', team: true })
      ensureMarkedDir(scene.root, { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
      const srcDir = path.join(PATHS.repo, '账本', '缺陷')
      const dstDir = path.join(scene.root, '账本', '缺陷')
      mkdirSync(dstDir, { recursive: true })
      const copied = []
      for (const name of readdirSync(srcDir).sort()) {
        if (!name.endsWith('.json')) continue
        copyFileSync(path.join(srcDir, name), path.join(dstDir, name))
        copied.push(name)
      }
      const run = runBugRead(scene.root)
      const entries = Array.isArray(run.json?.ledger?.entries) ? run.json.ledger.entries : null
      rec.readings.bug_read = {
        root: scene.root,
        copied_days: copied.length,
        exit: run.exit,
        json_error: run.json_error,
        stdout_head: run.stdout_head,
        entries: entries === null ? null : entries.length,
        samples: entries === null ? null : samples.map((id) => {
          const e = entries.find((x) => x.id === id)
          return {
            id,
            found: e !== undefined,
            cost: e?.assessment?.cost === null || e?.assessment?.cost === undefined ? null : 'non-null',
            fix_sketch: e?.assessment?.fix_sketch === null || e?.assessment?.fix_sketch === undefined ? null : 'non-null',
            how_seen: typeof e?.how_seen === 'string' && e.how_seen.trim() !== '',
            evidence: Array.isArray(e?.evidence) && e.evidence.length > 0,
          }
        }),
      }
      if (run.json === null) {
        push('JSON-UNPARSEABLE', `[LDG-05/bug-read] 真 CLI 的 \`--op bug-read\` 输出解析不了（${run.json_error}）· stderr=${JSON.stringify(run.stderr_head)}`)
      } else if (entries === null) {
        push('FOLD-TOTAL-MISMATCH', `[LDG-05/bug-read] 输出里没有 \`ledger.entries\`（${JSON.stringify(run.stdout_head)}）—— 读面没有走折叠（契约 §4.3）`)
      } else {
        for (const id of samples) {
          const e = entries.find((x) => x.id === id)
          if (e === undefined) {
            push('FOLD-TOTAL-MISMATCH', `[LDG-05/bug-read] 抽样 ${id} 不在读面的 ${entries.length} 条里 —— 记录丢了`)
            continue
          }
          const assessment = e.assessment ?? null
          if (assessment === null) {
            push('FOLD-FIELD-MISSING', `[LDG-05/bug-read] ${id} 的 \`assessment\` 是 null —— assessed 那一族没进读面`)
            continue
          }
          if (assessment.cost === null || assessment.cost === undefined) push('FOLD-FIELD-MISSING', `[LDG-05/bug-read] ${id} 的 \`assessment.cost\` 是 null —— 122 条逐字回填没到读面`)
          if (assessment.fix_sketch === null || assessment.fix_sketch === undefined) push('FOLD-FIELD-MISSING', `[LDG-05/bug-read] ${id} 的 \`assessment.fix_sketch\` 是 null —— 122 条逐字回填没到读面`)
          if (typeof e.how_seen !== 'string' || e.how_seen.trim() === '') push('FOLD-FIELD-MISSING', `[LDG-05/bug-read] ${id} 的 \`how_seen\` 读回来是空的`)
          if (!Array.isArray(e.evidence) || e.evidence.length === 0) push('FOLD-FIELD-MISSING', `[LDG-05/bug-read] ${id} 的 \`evidence\` 读回来是空的`)
        }
      }
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
            // 四族的旧台账侧计数（归档是回滚点，计数不随事件流增长而变）
            const need = { registered: 153, assessed: 122, disposed: 153, bookkeeping: 153 }
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
