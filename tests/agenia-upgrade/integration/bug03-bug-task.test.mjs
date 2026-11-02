/**
 * `BUG-03` · **bug 任务 + 五关 + 批次 + 归档 + 准入**（任务 B2）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）
 *   §2.3（对象→账：bug 任务住 bug 台账；**五关节点住任务段、不跨路线**；批次是台账里的记录
 *   `{id, frozen_at, entry_ids[]}`）· §3.1 第 2/5/6 条（冻结批 = 准入集合；一个根因一个 bug 任务，
 *   走五关、与路线任务**共用同一套五关状态机**；归档 = 同一本账的 `archived` 段）·
 *   §3.1 「一个准入函数 `admitTask`」那一段（两个创建入口都调它、不跨账、判据只有一份）。
 * 契约：`.team/test/CONTRACT-B.md` §6。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守五件事：
 * `A` **批次的形状与冻结语义**：`{id, frozen_at, entry_ids[]}`；冻结一次之后**逐字不变**；
 *     再冻结 = 新 id（旧 batch 一个字节不动）；**冻结之后登记的条目进不了这一批**（定形 §3.1 第 2 条）。
 * `B` **归档是同一条账的 `archived` 段**：带结论的搬走（条目**逐字**留住 + `archived_at`），
 *     没结论的**不许归档**（`E_BUG_ARCHIVE_OPEN`，零写入）——"簿上 live 段只留没结论的"。
 * `C` **任务形状**（纯函数 `bugTaskVerdict`）：三态 + 五关**共用** `FIVE_GATES`（`方案` 这种
 *     "并集里有、五个正名里没有"的值也必须收 —— 另抄一份 5 词表就是第二个真相）+ `batch` + `entry_ids`。
 * `D` **准入矩阵**（纯函数 `admitTask`，**作者是 C1**，见契约 §6.4）：四种模式 × 三种工作种类逐格进位
 *     （`ADMIT_CELLS` **十六**格 = 正交格 + 四格边界：headline 空 / 集合外 / `paused` 不是模式 / `entry_id` 缺）。
 *     没有它，"两期互斥"就只是一句话；有它，16 格各自能翻面。
 * `E` **运行时那一支（不依赖 C1 的那一半）**：没有路线账本 ⇒ 模式 = `uninitialized` ⇒
 *     `bug-task-set` **拒一切修任务**（"只能登记"），且 bug 台账一个字节不动。
 *
 * ── 现在为什么红、红在哪（第 2 关，功能未做）────────────────────────────────────
 * · `lib/bug-ledger.mjs` **不存在** ⇒ `bugTaskVerdict` / 批次 / 归档那一半没有载体；
 * · `lib/route.mjs` **没有导出 `admitTask`** ⇒ D 段整段红（这是**任务 B 依赖 C1** 的那一格：
 *   契约 §11 把它记成 `BLOCKED-ON-C1`（`C1b` 节点/headline + `C1d` 暂停集合），**不是 B 的缺陷**）；
 * · `agenia-route.mjs` 没有 `bug-batch-freeze` / `bug-archive` / `bug-task-set` 三个 op ⇒ A/B/E 段红。
 * ⇒ 每一段都点名它等的是哪个名字；`import` 崩不算红（`loadStagedModule` 把缺面与 import 失败分开）。
 */
import { before, test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import {
  BUG_LIB, ADMIT_LIB,
  bugAbs, bugEntry, fileStat, ledgerFixture, makeBareWorkspace, makeWorkspace, missingOpProblem,
  opMissing, readLedger, refusalOf, writeLedger, BUG_PATHS,
} from '../support/bug-surface.mjs'

before(() => {
  preflight()
})

const NOW = '2026-11-01T12:00:00+08:00'
const T_REG = '2026-10-31T09:00:00+08:00'

/** 四个批内 id（登记时刻都早于冻结时刻）。 */
const E1 = 'bug-20261031-01'
const E2 = 'bug-20261031-02'
const E3 = 'bug-20261031-03'

/** 一条处置好的条目（归档那一支的输入）。 */
const CLOSED = {
  disposition: { value: 'adopted', reason: '同一根因，已在 bug 任务里修掉', by: 'leader', at: '2026-11-01T09:30:00+08:00' },
}

/**
 * 准入矩阵（**手写自定形 §2.3 / §4.1**，不从实现反推）。每一格一句为什么。
 * `kind` 三种工作种类是定形里的词；`batch_entry_ids` / `pause_entry_ids` 两个集合**不混名**。
 */
const ADMIT_CELLS = [
  { id: 'A01', input: { mode: 'uninitialized', kind: 'bug-repair', entry_id: E1, headline: null, batch_entry_ids: [], pause_entry_ids: [] }, want: false, note: '未建账 ⇒ 拒一切修任务（只能登记）' },
  { id: 'A02', input: { mode: 'uninitialized', kind: 'implement', entry_id: null, headline: '有目标', batch_entry_ids: [], pause_entry_ids: [] }, want: false, note: '未建账 ⇒ 不开实现任务' },
  { id: 'A03', input: { mode: 'build', kind: 'implement', entry_id: null, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [] }, want: true, note: '实现任务只在 build 收' },
  { id: 'A04', input: { mode: 'build', kind: 'implement', entry_id: null, headline: '   ', batch_entry_ids: [], pause_entry_ids: [] }, want: false, note: 'headline 空 ⇒ 拒实现任务（先补 headline）' },
  { id: 'A05', input: { mode: 'build', kind: 'ticket-repair', entry_id: null, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [] }, want: true, note: '票的修 = build 期的路线任务' },
  { id: 'A06', input: { mode: 'build', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [] }, want: false, note: '实现期普通 bug 只登记、不修（够线才打断，那走 build-paused）' },
  { id: 'A07', input: { mode: 'maintain', kind: 'implement', entry_id: null, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [] }, want: false, note: '维护期不接新实现' },
  { id: 'A08', input: { mode: 'maintain', kind: 'ticket-repair', entry_id: null, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [] }, want: false, note: '维护期只修批内 bug，不修票' },
  { id: 'A09', input: { mode: 'maintain', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [E1, E2], pause_entry_ids: [] }, want: true, note: 'maintain 读 batch：批内收' },
  { id: 'A10', input: { mode: 'maintain', kind: 'bug-repair', entry_id: E3, headline: '本票目标', batch_entry_ids: [E1, E2], pause_entry_ids: [] }, want: false, note: 'batch 外的 bug 不在 maintain 修（点名那条 entry）', names: E3 },
  { id: 'A11', input: { mode: 'maintain', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [] }, want: false, note: '没有 batch ⇒ 维护期什么都不收' },
  { id: 'A12', input: { mode: 'build-paused', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [E1] }, want: true, note: 'build-paused 读 pause set：触发条收' },
  { id: 'A13', input: { mode: 'build-paused', kind: 'bug-repair', entry_id: E2, headline: '本票目标', batch_entry_ids: [E2], pause_entry_ids: [E1] }, want: false, note: 'pause set 外的拒（**即使它在 batch 里** —— 两个集合不混名）', names: E2 },
  { id: 'A14', input: { mode: 'build-paused', kind: 'implement', entry_id: null, headline: '本票目标', batch_entry_ids: [], pause_entry_ids: [E1] }, want: false, note: 'build-paused 只收触发的那一条，不收实现任务' },
  { id: 'A15', input: { mode: 'paused', kind: 'bug-repair', entry_id: E1, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [E1] }, want: false, note: '模式是四值闭集（paused 是任务状态，不是模式）' },
  { id: 'A16', input: { mode: 'maintain', kind: 'bug-repair', entry_id: null, headline: '本票目标', batch_entry_ids: [E1], pause_entry_ids: [] }, want: false, note: 'bug 修必须点名一条 entry' },
]

/**
 * 任务形状的格（纯函数 `bugTaskVerdict`）。`方案` 那一格是**这条判据的反向面**：
 * `FIVE_GATES` 是九词并集（含历史同义词），bug 任务与路线任务共用它 —— 另抄 5 正名就翻面。
 */
const TASK_CELLS = [
  { id: 'T1', over: {}, want: true, note: '合法：open + 定形 + 批内两条 entry + 一个根因' },
  { id: 'T2', over: { five_gate_state: '方案' }, want: true, note: '并集里的同义词（`方案`）必须收 —— 共用同一张表，不是另抄五个正名' },
  { id: 'T3', over: { five_gate_state: '状态未知' }, want: false, note: '五关词表外 ⇒ 拒' },
  { id: 'T4', over: { status: 'done-ish' }, want: false, note: '三态（open/in_progress/done）外 ⇒ 拒' },
  { id: 'T5', over: { batch: 'batch-不存在' }, want: false, note: '任务必须指一个真 batch' },
  { id: 'T6', over: { entry_ids: [] }, want: false, note: '一个根因一个 bug 任务 ⇒ 至少要有一条 entry' },
]

test('BUG-03 bug 任务：批次冻结一次 · 归档只搬带结论的 · 五关共用一张表 · admitTask 十六个模式格 · 未建账只许登记', async () => {
  await runCase('BUG-03', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    const clockWs = makeWorkspace('bug03', 'clock')
    const nowFile = `${clockWs}/.team-now.txt`
    writeFileSync(nowFile, `${NOW}\n`, 'utf8')
    const env = { ...process.env, AGENIA_NOW_FILE: nowFile }

    // ── A · 批次（冻结一次、之后只有新 id，不回头改）──────────────────────────
    const wsBatch = makeWorkspace('bug03', 'batch')
    writeLedger(wsBatch, ledgerFixture({
      entries: [bugEntry(E1, T_REG), bugEntry(E2, T_REG), bugEntry(E3, T_REG)],
      severity_samples: { version: 1, registered_at: T_REG, registered_by: 'leader', samples: [], history: [] },
    }))
    const freeze = await runRoute('bug03', 'bug-batch-freeze', { entry_ids: [E1, E2] }, { workspace: wsBatch, env })
    if (opMissing(freeze)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-batch-freeze', freeze).message)
    } else if (freeze.exit_code !== 0) {
      push('BUG-BATCH-FREEZE-REFUSED', `冻结批必须能落（定形 §3.1 第 2 条），实得 exit=${freeze.exit_code} / ${freeze.json?.error?.code}：${String(freeze.stderr).trim().slice(0, 240)}`)
    } else {
      const led = readLedger(wsBatch)
      const batches = led?.batches ?? []
      if (batches.length !== 1) {
        push('BUG-BATCH-COUNT', `冻结一次 ⇒ 台账里恰好 1 条 batch，实得 ${batches.length}`)
      } else {
        const b = batches[0]
        for (const key of ['id', 'frozen_at', 'entry_ids']) {
          if (!(key in b)) push('BUG-BATCH-SHAPE', `batch 必须带 \`${key}\`（定形 §2.3：{id, frozen_at, entry_ids[]}）`)
        }
        if (b.frozen_at !== NOW) push('BUG-BATCH-FROZEN-AT', `frozen_at 必须取注入时钟那一刻（${NOW}），实得 ${JSON.stringify(b.frozen_at)}`)
        if (JSON.stringify(b.entry_ids) !== JSON.stringify([E1, E2])) push('BUG-BATCH-ENTRIES', `entry_ids 必须逐字是冻结时给的那一组，实得 ${JSON.stringify(b.entry_ids)}`)
      }

      // 冻结之后登记的条目进不了这一批（"之后登记的 batch 为空、进下一批"）
      const reg = await runRoute('bug03', 'bug-register', {
        kind: 'bug', phenomenon: '冻结之后才报的第三条', how_seen: '夹具', reporter: '组长',
        evidence: [{ kind: 'log', ref: '夹具' }], source: { carrier: 'leader', ref: null },
      }, { workspace: wsBatch, env })
      const batchesAfterReg = readLedger(wsBatch)?.batches ?? []
      if (JSON.stringify(batchesAfterReg[0]?.entry_ids) !== JSON.stringify([E1, E2])) {
        push('BUG-BATCH-GREW', `冻结之后登记的条目**不许**自动进这一批（定形 §3.1 第 2 条），实得 ${JSON.stringify(batchesAfterReg[0]?.entry_ids)}`)
      }
      if (!opMissing(reg) && reg.exit_code === 0 && (reg.json?.entry?.batch ?? null) !== null) {
        push('BUG-BATCH-ENTRY-BATCH', `新登记的条目 batch 必须是 null（它进**下一批**，不是这一批），实得 ${JSON.stringify(reg.json?.entry?.batch)}`)
      }

      // 再冻结 ⇒ 新 id，旧 batch 逐字不变
      const snapshot = JSON.stringify(readLedger(wsBatch)?.batches?.[0] ?? null)
      const freeze2 = await runRoute('bug03', 'bug-batch-freeze', { entry_ids: [E3] }, { workspace: wsBatch, env })
      if (!opMissing(freeze2) && freeze2.exit_code === 0) {
        const now = readLedger(wsBatch)?.batches ?? []
        if (now.length !== 2) push('BUG-BATCH-SECOND', `再冻结一次必须多一条 batch（共 2 条），实得 ${now.length}`)
        if (JSON.stringify(now[0] ?? null) !== snapshot) push('BUG-BATCH-REWROTE', '第二条 batch 不许改写第一条（冻结 = 逐字不变）')
        if ((now[1]?.id ?? null) === (now[0]?.id ?? null)) push('BUG-BATCH-ID-DUP', '两次冻结的 batch id 不许相同')
      } else if (!opMissing(freeze2)) {
        push('BUG-BATCH-SECOND-FAILED', `第二次冻结也必须能落，实得 exit=${freeze2.exit_code} / ${freeze2.json?.error?.code}`)
      }
    }

    // ── B · 归档（同一本账的 archived 段；没结论的不许搬）────────────────────────
    const wsArch = makeWorkspace('bug03', 'archive')
    writeLedger(wsArch, ledgerFixture({ entries: [bugEntry(E1, T_REG, CLOSED), bugEntry(E2, T_REG)] }))
    const ledgerFile = bugAbs(wsArch, BUG_PATHS.ledger)
    const beforeOpen = fileStat(ledgerFile)
    const archOpen = await runRoute('bug03', 'bug-archive', { entry_ids: [E2] }, { workspace: wsArch, env })
    if (!opMissing(archOpen)) {
      const bad = refusalOf('bug-archive（没结论的条目）', archOpen, 'E_BUG_ARCHIVE_OPEN')
      if (bad !== null) push('BUG-ARCHIVE-OPEN', `${bad} —— 归档只搬带结论的（定形 §3.1 第 6 条：簿上 live 段只留没结论的）`)
      if (fileStat(ledgerFile).sha256 !== beforeOpen.sha256) {
        push('BUG-ARCHIVE-OPEN-WROTE', '被拒的归档**零写入**（台账 SHA256 前后相同）')
      }
    }
    const arch = await runRoute('bug03', 'bug-archive', { entry_ids: [E1] }, { workspace: wsArch, env })
    if (opMissing(arch)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-archive', arch).message)
    } else if (arch.exit_code !== 0) {
      push('BUG-ARCHIVE-REFUSED', `带结论的条目必须能归档，实得 exit=${arch.exit_code} / ${arch.json?.error?.code}`)
    } else {
      const led = readLedger(wsArch)
      const archived = (led?.archived ?? []).find((a) => a.id === E1) ?? null
      if (archived === null) {
        push('BUG-ARCHIVE-NOT-MOVED', `归档之后 \`archived[]\` 里必须有 ${E1}（同一本账的 archived 段，不是另一本）`)
      } else {
        if (archived.disposition?.value !== 'adopted') push('BUG-ARCHIVE-LOST-DISPOSITION', `归档必须**带结论**搬走（disposition 逐字留住），实得 ${JSON.stringify(archived.disposition)}`)
        if (typeof archived.archived_at !== 'string' || archived.archived_at !== NOW) push('BUG-ARCHIVE-AT', `归档必须记下那一刻（${NOW}），实得 ${JSON.stringify(archived.archived_at)}`)
      }
      const live = (led?.entries ?? []).map((e) => e.id)
      if (live.includes(E1)) push('BUG-ARCHIVE-STILL-LIVE', `归档之后 live 段不许再留 ${E1}（实得 ${JSON.stringify(live)}）`)
      if (!live.includes(E2)) push('BUG-ARCHIVE-ATE-OPEN', `没结论的 ${E2} 必须留在 live 段（实得 ${JSON.stringify(live)}）`)
    }

    // ── C · 任务形状（共用五关那一张表）────────────────────────────────────────
    const lib = await loadStagedModule(BUG_LIB, ['bugTaskVerdict', 'entryVerdict', 'openCounts', 'capVerdict', 'routingVerdict'])
    if (lib.surfaceMissing || lib.missing.length > 0) {
      push('BUG-TASK-SURFACE-MISSING', `${BUG_LIB} 还不全 —— 缺：${lib.missing.join(' / ')}（契约 §9.2）`)
    }
    const batches = [{ id: 'batch-1', frozen_at: NOW, entry_ids: [E1, E2] }]
    const taskBase = { id: 'bugtask-1', title: '修「卡片不显示 bug 数」的根因', status: 'open', five_gate_state: '定形', batch: 'batch-1', entry_ids: [E1, E2], root_cause: '卡片读的是另一本账' }
    if (!lib.surfaceMissing && typeof lib.mod.bugTaskVerdict === 'function') {
      for (const cell of TASK_CELLS) {
        const got = lib.mod.bugTaskVerdict({ ...taskBase, ...cell.over }, { batches })
        const ok = got?.ok === true
        if (ok !== cell.want) push('BUG-TASK-SHAPE', `${cell.id}（${cell.note}）：期望 ok=${cell.want}，实得 ${JSON.stringify(got)}`)
      }
    }

    // ── D · 准入矩阵（`admitTask` 一份判据；**C1 的作者，B 的判据**）─────────────────
    const routeLib = await loadStagedModule(ADMIT_LIB, ['admitTask'])
    if (routeLib.surfaceMissing || routeLib.missing.length > 0) {
      push('BLOCKED-ON-C1-ADMITTASK', `\`${ADMIT_LIB}\` 还没有导出 \`admitTask\` ⇒ 契约 §6.4 的准入矩阵判不了。`
        + `这是**任务 B 依赖 C1**（C1b 节点/headline + C1d 暂停集合）的那一格，不是 B 的缺陷 —— 契约 §11 记作 BLOCKED-ON-C1。`
        + `缺：${routeLib.missing.join(' / ')}`)
    } else if (typeof routeLib.mod.admitTask !== 'function') {
      push('BLOCKED-ON-C1-ADMITTASK', `\`${ADMIT_LIB}\` 的 \`admitTask\` 不是函数（实得 ${typeof routeLib.mod.admitTask}）`)
    } else {
      const admit = routeLib.mod.admitTask
      for (const cell of ADMIT_CELLS) {
        const got = admit(cell.input)
        const ok = got?.ok === true
        if (ok !== cell.want) {
          push('BUG-ADMIT-MATRIX', `${cell.id}（${cell.note}）：期望 ok=${cell.want}，实得 ${JSON.stringify(got)}`)
          continue
        }
        if (!ok) {
          if (typeof got.code !== 'string' || got.code === '') push('BUG-ADMIT-CODE', `${cell.id}：拒的时候必须带一个码，实得 ${JSON.stringify(got)}`)
          if (typeof got.message !== 'string' || got.message.trim() === '') push('BUG-ADMIT-MESSAGE', `${cell.id}：拒的时候必须说一句为什么，实得 ${JSON.stringify(got)}`)
          if (cell.names !== undefined && !String(got.message ?? '').includes(cell.names)) {
            push('BUG-ADMIT-NAMES', `${cell.id}：拒的理由必须点名那条 entry（${cell.names}），实得 ${JSON.stringify(got.message)}`)
          }
        }
      }
    }

    // ── E · 运行时那一支：没有路线账本 ⇒ 只许登记（不依赖 C1 的那一半）─────────────
    const bare = makeBareWorkspace('bug03', 'bare')
    const reg = await runRoute('bug03', 'bug-register', {
      kind: 'bug', phenomenon: '裸工作区里的第一条', how_seen: '夹具', reporter: '组长',
      evidence: [{ kind: 'log', ref: '夹具' }], source: { carrier: 'leader', ref: null },
    }, { workspace: bare.workspace, env })
    const beforeTask = fileStat(bare.ledger)
    const taskOnBare = await runRoute('bug03', 'bug-task-set', { tasks: [{ ...taskBase, batch: null, entry_ids: [] }], current_task_id: null }, { workspace: bare.workspace, env })
    if (opMissing(taskOnBare)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-task-set', taskOnBare).message)
    } else if (taskOnBare.exit_code === 0) {
      push('BUG-UNINITIALIZED-REPAIR', '未建账（没有路线账本）时必须**拒**修任务、只能登记（定形 §2.3：未建账 ⇒ 拒一切修任务；写角色 spawn 无 task id 会被门禁拒，这是正确的）')
    } else {
      const code = taskOnBare.json?.error?.code ?? null
      if (code === 'E_INTERNAL') push('BUG-UNINITIALIZED-CODE', `被拒的码被折成了 E_INTERNAL —— 新码必须登记进 \`lib/error-codes.mjs\` 的 CODES（不然"该拒"和"程序有 bug"长得一模一样）`)
      if (fileStat(bare.ledger).sha256 !== beforeTask.sha256) push('BUG-UNINITIALIZED-WROTE', '被拒的修任务**零写入**（bug 台账 SHA256 前后相同）')
      if (!opMissing(reg) && reg.exit_code === 0 && (readLedger(bare.workspace)?.tasks ?? []).length !== 0) {
        push('BUG-UNINITIALIZED-TASK-WRITTEN', '未建账的现场里 bug 台账的 `tasks[]` 必须还是空的')
      }
    }

    caseFail(problems)
    rec.readings.bug03 = {
      admit_cells: ADMIT_CELLS.length,
      task_cells: TASK_CELLS.length,
      batch_shape: ['id', 'frozen_at', 'entry_ids'],
      archive_rule: 'only concluded entries move; live keeps the rest',
    }
  })
})
