/**
 * `LED-05` · **`admitTask` —— 一个准入函数，十六格，两个创建入口都调它**（任务 C1 的第 2 关红测试）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）§2.3 那一段：
 *   「**一个准入函数 `admitTask`**：实现任务只在 `build` 收；**票的修 = build 期的路线任务**；
 *   **bug 修在 `maintain` 只收当前 batch 内的**，**`build-paused` 只收 pause set 内的**
 *   （**一个函数按 mode 读不同集合**：maintain 读 batch，build-paused 读 pause set）；
 *   **batch（bug 台账）与 pause set（路线）不混名**。**未建账 ⇒ 拒一切修任务（只能登记）**；
 *   **headline 空 ⇒ 拒实现任务**（先补 headline）；**两个创建入口都调它**：
 *   路线 `task-set`（实现 / 票的修）与 bug `bug-task-set`（bug 修）。**不跨账** …
 *   **判据只有一份**。」· §6.2 的「两期互斥」行（`admitTask` 拒，**两个创建入口都调它**）。
 * 契约：`.team/test/CONTRACT-C1.md` §7 / §9。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守四件事：
 * `A` **十六格矩阵**（纯函数）：四种模式 × 三种工作种类 + 四格边界。每一格**一个码 + 一句为什么**；
 *     `A10` / `A13` 还必须**点名那条 entry**（拒了却不说哪一条，读的人没法修）。
 * `B` **路线那个入口**（`task-set`）：build 收实现 / 票的修，拒 bug 修；maintain 拒实现与票的修；
 *     build-paused 拒实现；`kind` 缺省 = implement（老调用方不破）；票的修必须挂一张真票。
 * `C` **bug 那个入口**（`bug-task-set`）：build 拒 bug 修（只登记）；maintain 只收 batch 内
 *     （批外**点名**那条）；build-paused 只收 pause set 内（**即使它在 batch 里也拒** —— 两个集合不混名）；
 *     未建账拒、码不许被折成 `E_INTERNAL`、被拒时**零写入**。
 * `D` **判据一份（源码级）**：两个入口的**函数体**都调同一个导入的 `R.admitTask(`，而 `lib/route.mjs` 里
 *     `admitTask` **只有一个定义** —— 这就是"矩阵值不因入口而变"的可执行形态。
 *     ⚠️ 为什么**不是**"同一个输入打两个入口"：两个入口**按设计**收的 `kind` 不相交（路线入口只过
 *     `implement` / `ticket-repair`，bug 入口只过 `bug-repair`）⇒ 那个形状的格子**造不出来**，
 *     写出来只会在断言不到的地方恒绿（gate4 复审 BC-04 ①）。
 * `G` **迁移票的写路径**（gate4 复审 BC-01 的红先格）：`void` / `update` / `close` 的 from-state 读**投影**
 *     （`void` → 任务 → `legacy_status` → `open`）—— 迁移票不存 `status`，它照样动得动；
 *     而**存着的 `status` 不许赢过 `legacy_status`**：`ticket-update {status:'in_progress'}` 在一张
 *     `legacy_status:'open'` 的迁移票上会成功，但它的**投影仍是 `open`**（＝投影里的 no-op，按设计），
 *     所以紧接着 `ticket-close` 照样拒；迁移票要关，走**任务**把投影变成 `in_progress`。
 * `H` **`finding_refs` 载体**（BC-03a）：`ticket-open` 收它（给了就 ≥1 条、ids 唯一）、读面查得到、
 *     legacy 票店迁移与 observation 迁移都**逐字搬** —— §6.2「`adopted+ticket` ⇒ 票段有这张票」的载体。
 * `I` **跨工作区负样本**（BC-03b）：A 拿 B 的 `.team` / `route` 读或写 ⇒ 拒 `E_ROOT_OUTSIDE` + **零写入**；
 *     写得跟派生值一样 ⇒ 放行（阳性对照）；同一个 `stage id` 在两区各一份**不是**缺陷。
 *
 * ── 现在为什么红、红在哪（第 2 关，功能未做）────────────────────────────────────
 * · `lib/route.mjs` **没有** `admitTask` ⇒ A 段整段红，记 `BLOCKED-ON-C1-ADMITTASK`
 *   （这正是 `BUG-03` D 段那条依赖腿的**同一件事在 C1 这一侧的判据**：函数的作者是 C1）；
 * · `task-set` / `bug-task-set` 都还没有接这条判据 ⇒ B/C/D 段红在"该收的没收 / 该拒的没拒"上。
 * ⇒ 这一格落地之后，`BUG-03` 的 `BLOCKED-ON-C1-ADMITTASK` 必须**同批翻绿**（两个读者一份判据）。
 */
import { before, test } from 'node:test'
import path from 'node:path'
import { caseFail, preflight, runCase } from '../support/evidence.mjs'
import { loadStagedModule, readStagedText, runRoute } from '../support/sut.mjs'
import { bugEntry, fileStat, ledgerFixture, readLedger, writeLedger, BUG_PATHS, bugAbs } from '../support/bug-surface.mjs'
import {
  ADMIT_CELLS, BOOTSTRAP_GRAPH, BUILD_THEN_MAINTAIN_GRAPH, C1_OPS, E1, E2, E3, LEGACY_TICKETS, ROUTE_LIB,
  ROUTE_PATHS, clockEnv, envelopeProblem, fileStatRoute, legacyStoreFixture, makePusher,
  makeWorkspace, missingOpProblem, opMissing, readRoute, routeAbs, writeLegacy,
} from '../support/route-surface.mjs'

before(() => {
  preflight()
})

const NOW = '2026-11-01T12:00:00+08:00'
const T_REG = '2026-10-31T09:00:00+08:00'
const okOf = (label, res) => envelopeProblem(label, res, 'ok')

/** 一条 bug 任务的形状（契约 B §6.1；`batch` 必须指向真 batch）。 */
function bugTask(over = {}) {
  return {
    id: 'bugtask-1',
    title: '修「卡片不显示 bug 数」的根因',
    status: 'open',
    five_gate_state: '定形',
    batch: null,
    entry_ids: [E1],
    root_cause: '卡片读的是另一本账',
    ...over,
  }
}

test('LED-05 admitTask：十六格矩阵 + task-set 与 bug-task-set 两个入口都按同一份判据收/拒', () => {
  return runCase('LED-05', async (rec) => {
    const problems = []
    const push = makePusher(problems)

    // ── A · 十六格（纯函数）────────────────────────────────────────────────────
    const lib = await loadStagedModule(ROUTE_LIB, ['admitTask', 'ROUTE_TASK_KINDS', 'ROUTE_TASK_STATUSES', 'TASK_STATUSES'])
    if (lib.surfaceMissing || lib.missing.length > 0 || typeof lib.mod?.admitTask !== 'function') {
      push('BLOCKED-ON-C1-ADMITTASK', `\`${ROUTE_LIB}\` 还没有导出 \`admitTask\`（契约 §9.2 / §7）⇒ 十六格判不了；`
        + `缺：${lib.missing.join(' / ') || '(整个文件不在)'}`)
    } else {
      // 两个词集**不合并**：`paused` 只是**路线任务**的第四态；bug 任务照旧三态（否则 B 的那一列当场翻面）。
      if (JSON.stringify(lib.mod.ROUTE_TASK_KINDS) !== JSON.stringify(['implement', 'ticket-repair', 'bug-repair'])) {
        push('C1-TASK-KINDS', `\`ROUTE_TASK_KINDS\` 必须恰是三种工作种类，实得 ${JSON.stringify(lib.mod.ROUTE_TASK_KINDS)}`)
      }
      if (JSON.stringify(lib.mod.ROUTE_TASK_STATUSES) !== JSON.stringify(['open', 'in_progress', 'paused', 'done'])) {
        push('C1-ROUTE-TASK-STATUSES', `\`ROUTE_TASK_STATUSES\` 必须恰是四态（含 paused），实得 ${JSON.stringify(lib.mod.ROUTE_TASK_STATUSES)}`)
      }
      if (JSON.stringify(lib.mod.TASK_STATUSES) !== JSON.stringify(['open', 'in_progress', 'done'])) {
        push('C1-TASK-STATUSES-UNTOUCHED', `\`TASK_STATUSES\` 必须仍是**三态**（bug 任务读它；把 paused 塞进去 = 两个词集合并），实得 ${JSON.stringify(lib.mod.TASK_STATUSES)}`)
      }
      const admit = lib.mod.admitTask
      for (const cell of ADMIT_CELLS) {
        const got = admit(cell.input)
        if (got?.ok !== cell.want) {
          push('C1-ADMIT-MATRIX', `${cell.id}（${cell.note}）：期望 ok=${cell.want}，实得 ${JSON.stringify(got)}`)
          continue
        }
        if (cell.want === false) {
          if (got.code !== cell.code) push('C1-ADMIT-CODE', `${cell.id}（${cell.note}）：期望码 ${cell.code}，实得 ${JSON.stringify(got.code)} —— 码要能说清"为什么拒"（十六格至少六种理由）`)
          if (typeof got.message !== 'string' || got.message.trim() === '') push('C1-ADMIT-MESSAGE', `${cell.id}：拒的时候必须说一句为什么，实得 ${JSON.stringify(got.message)}`)
          if (cell.names !== undefined && !String(got.message).includes(cell.names)) push('C1-ADMIT-NAMES', `${cell.id}：拒的理由必须点名那条 entry（${cell.names}），实得 ${JSON.stringify(got.message)}`)
        } else if (got.code !== null && got.code !== undefined) {
          push('C1-ADMIT-CODE-OK', `${cell.id}：收的时候不许带拒码（实得 ${JSON.stringify(got.code)}）`)
        }
      }
      // `mode` 是四值闭集：`paused` 只是其中一格（A15），别的怪值同理。
      const weird = admit({ ...ADMIT_CELLS[0].input, mode: 'paused-' })
      if (weird?.ok !== false || weird?.code !== 'E_ADMIT_MODE') push('C1-ADMIT-MODE', `未知模式必须拒 \`E_ADMIT_MODE\`，实得 ${JSON.stringify(weird)}`)
    }

    // ── B · 路线入口：`task-set` ─────────────────────────────────────────────
    const ws = makeWorkspace('led05', 'task-set')
    const { env } = clockEnv(ws, NOW)
    /** 票号（B4 开的那一张；F 段拿它判"有 live task 不许 void"）。 */
    let ticketId = null
    writeLegacy(ws, legacyStoreFixture({ tickets: [] }))
    const boot = runRoute('LED-05', C1_OPS.bootstrap, { ...BUILD_THEN_MAINTAIN_GRAPH }, { workspace: ws, env })
    if (opMissing(boot)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, boot).message)
    } else if (boot.exit_code !== 0) {
      push('C1-ADMIT-SETUP', `前置不成立：bootstrap 必须能落（exit=${boot.exit_code} / ${boot.json?.error?.code}）`)
    } else {
      /** 一次 task-set；返回 `{res, label}`。`tasks` 只放一条。 */
      const setTask = (label, task) => runRoute('LED-05', 'task-set', { tasks: [task], current_task_id: null, version: readRoute(ws)?.version }, { workspace: ws, env })
      const impl = { id: 'T-impl', stage_id: 'stage-build', title: '实现一件', status: 'in_progress', five_gate_state: '实现', kind: 'implement' }
      // B1 build + implement ⇒ 收（A03）
      const b1 = setTask('build + implement', impl)
      const badB1 = okOf('task-set（build + implement）', b1)
      if (badB1 !== null) push('C1-ADMIT-BUILD-IMPLEMENT', `${badB1} —— A03：实现任务只在 build 收`)
      const landed = readRoute(ws)?.tasks ?? []
      const implTask = landed.find((t) => t.id === 'T-impl') ?? null
      if (implTask === null) {
        push('C1-ADMIT-TASK-LANDED', '被收下的实现任务必须落在路线任务段里')
      } else if (implTask.kind !== 'implement') {
        push('C1-ADMIT-TASK-KIND', `收下的实现任务必须带 kind=implement（工作种类），实得 ${JSON.stringify(implTask.kind)}`)
      }
      // B2 build + bug-repair ⇒ 拒（A06；不跨账：bug 修只从 bug 入口进）
      const b2 = setTask('build + bug-repair', { ...impl, id: 'T-bug', kind: 'bug-repair', entry_id: E1 })
      if (!opMissing(b2)) {
        const bad = envelopeProblem('task-set（build + bug-repair）', b2, 'E_ADMIT_KIND')
        if (bad !== null) push('C1-ADMIT-ROUTE-BUGREPAIR', `${bad} —— A06：实现期普通 bug 只登记、不修；且 ` + '`task-set` 只写路线（不跨账）')
      }
      // B3 build + ticket-repair 缺票号 ⇒ 拒
      const b3 = setTask('build + ticket-repair（无票号）', { ...impl, id: 'T-ticket', kind: 'ticket-repair' })
      if (!opMissing(b3)) {
        const bad = envelopeProblem('task-set（ticket-repair 无票号）', b3, 'E_ARG_SCHEMA')
        if (bad !== null) push('C1-ADMIT-TICKET-ID', `${bad} —— 票的修 = 一条路线任务，**票号挂在任务上**（定形 §3.4）；缺票号就没法投影`)
      }
      // B4 build + ticket-repair 带一张真票 ⇒ 收（A05）
      const opened = runRoute('LED-05', 'ticket-open', {
        title: '把 guard 的错误文案补上示例',
        source: `technical-review:${'a'.repeat(64)}#F1`,
        next_step: '在 staging 改文案，重跑 G5',
        acceptance: 'inject-probe 的 G5 通过',
      }, { workspace: ws, env })
      ticketId = opened.json?.ticket_id ?? null
      if (okOf('ticket-open', opened) !== null || ticketId === null) {
        push('C1-ADMIT-TICKET-SETUP', `前置不成立：ticket-open 必须能开一张票（${okOf('ticket-open', opened)}）`)
      } else {
        const b4 = runRoute('LED-05', 'task-set', {
          tasks: [{ ...impl, id: 'T-ticket', kind: 'ticket-repair', ticket_id: ticketId }],
          current_task_id: null,
          version: readRoute(ws)?.version,
        }, { workspace: ws, env })
        const bad = okOf('task-set（build + ticket-repair）', b4)
        if (bad !== null) push('C1-ADMIT-ROUTE-TICKET', `${bad} —— A05：票的修 = build 期的路线任务，必须收`)
        const t = (readRoute(ws)?.tasks ?? []).find((x) => x.id === 'T-ticket')
        if (t !== undefined && t.ticket_id !== ticketId) push('C1-ADMIT-TICKET-LINK', `票号必须挂在任务上（唯一载体 = 任务的 ticket_id），实得 ${JSON.stringify(t.ticket_id)}`)
        // 票的投影：任务 in_progress ⇒ 票 in_progress（不存值）
        const read = runRoute('LED-05', 'read', {}, { workspace: ws, env })
        if (read.exit_code === 0) {
          const projected = (read.json?.tickets ?? []).find((x) => x.id === ticketId)
          if (projected?.status !== 'in_progress') push('C1-TICKET-PROJECTION', `有 in_progress 任务的票必须投影成 in_progress，实得 ${JSON.stringify(projected)}`)
        }
      }
      // B5 build-paused + implement ⇒ 拒（A14）
      const paused = runRoute('LED-05', C1_OPS.routeMark, { mark: 'pause', reason: '一条够线的 bug 打断实现', entry_ids: [E1], by: 'leader', version: readRoute(ws)?.version }, { workspace: ws, env })
      if (okOf('route-mark pause', paused) !== null) {
        push('C1-ADMIT-PAUSE-SETUP', `前置不成立：暂停必须能落（${okOf('route-mark pause', paused)}）`)
      } else {
        const b5 = setTask('build-paused + implement', { ...impl, id: 'T-impl2' })
        if (!opMissing(b5)) {
          const bad = envelopeProblem('task-set（build-paused + implement）', b5, 'E_ADMIT_KIND')
          if (bad !== null) push('C1-ADMIT-PAUSED-IMPLEMENT', `${bad} —— A14：build-paused 只收触发的那一条，不收实现任务`)
        }
      }
      // B6/B7 maintain ⇒ 实现 / 票的修都拒（A07 / A08）：另起一个工作区，**切完 maintain 再加任务**
      // （`openTasksVerdict` 不许被放宽 —— 当前阶段有没做完的任务时切阶段照旧是 `E_TASKS_OPEN`）。
      const wsM = makeWorkspace('led05', 'maintain')
      const { env: envM } = clockEnv(wsM, NOW)
      writeLegacy(wsM, legacyStoreFixture({ tickets: [] }))
      const bootM = runRoute('LED-05', C1_OPS.bootstrap, { ...BUILD_THEN_MAINTAIN_GRAPH }, { workspace: wsM, env: envM })
      if (bootM.exit_code === 0) {
        const se = runRoute('LED-05', 'stage-enter', { from: 'stage-build', to: 'stage-maintain', exit_criteria_met: [], version: readRoute(wsM)?.version }, { workspace: wsM, env: envM })
        if (okOf('stage-enter build→maintain', se) !== null) {
          push('C1-ADMIT-MAINTAIN-SETUP', `前置不成立：切到 maintain 必须能落（${okOf('stage-enter build→maintain', se)}）`)
        } else {
          const b6 = runRoute('LED-05', 'task-set', {
            tasks: [{ ...impl, id: 'T-impl3', stage_id: 'stage-maintain' }], current_task_id: null, version: readRoute(wsM)?.version,
          }, { workspace: wsM, env: envM })
          if (!opMissing(b6)) {
            const bad = envelopeProblem('task-set（maintain + implement）', b6, 'E_ADMIT_KIND')
            if (bad !== null) push('C1-ADMIT-MAINTAIN-IMPLEMENT', `${bad} —— A07：维护期不接新实现`)
          }
          const b7 = runRoute('LED-05', 'task-set', {
            tasks: [{ ...impl, id: 'T-ticket2', stage_id: 'stage-maintain', kind: 'ticket-repair', ticket_id: ticketId ?? 'ticket-20261101-01' }],
            current_task_id: null,
            version: readRoute(wsM)?.version,
          }, { workspace: wsM, env: envM })
          if (!opMissing(b7)) {
            const bad = envelopeProblem('task-set（maintain + ticket-repair）', b7, 'E_ADMIT_KIND')
            if (bad !== null) push('C1-ADMIT-MAINTAIN-TICKET', `${bad} —— A08：维护期只修批内 bug，不修票`)
          }
        }
      }
      // B8 kind 缺省 = implement（老调用方不破；在 build 里收）
      const wsDef = makeWorkspace('led05', 'kind-default')
      const { env: envDef } = clockEnv(wsDef, NOW)
      writeLegacy(wsDef, legacyStoreFixture({ tickets: [] }))
      const bootDef = runRoute('LED-05', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsDef, env: envDef })
      if (bootDef.exit_code === 0) {
        const def = runRoute('LED-05', 'task-set', {
          tasks: [{ id: 'T-def', stage_id: 'stage-build', title: '不写 kind 的老调用方', status: 'in_progress', five_gate_state: '实现' }],
          current_task_id: null,
          version: readRoute(wsDef)?.version,
        }, { workspace: wsDef, env: envDef })
        const bad = okOf('task-set（kind 缺省）', def)
        if (bad !== null) push('C1-ADMIT-KIND-DEFAULT', `${bad} —— \`kind\` 缺省按 \`implement\` 读（老调用方不破；缺省不是"免准入"）`)
        const t = (readRoute(wsDef)?.tasks ?? []).find((x) => x.id === 'T-def')
        if (t !== undefined && t.kind !== 'implement') push('C1-ADMIT-KIND-DEFAULT-VALUE', `缺省写下来的 kind 必须是 implement，实得 ${JSON.stringify(t.kind)}`)
      }
    }

    // ── C · bug 入口：`bug-task-set` ─────────────────────────────────────────
    /** 一份三条目 + 一个冻结批的 bug 台账（batch = {id, frozen_at, entry_ids:[E1,E2]}）。 */
    const seedBugLedger = (workspace) => {
      writeLedger(workspace, ledgerFixture({
        entries: [bugEntry(E1, T_REG), bugEntry(E2, T_REG), bugEntry(E3, T_REG)],
        batches: [{ id: 'batch-1', frozen_at: NOW, entry_ids: [E1, E2] }],
      }))
      return bugAbs(workspace, BUG_PATHS.ledger)
    }
    const wsC = makeWorkspace('led05', 'bug-entry')
    const { env: envC } = clockEnv(wsC, NOW)
    writeLegacy(wsC, legacyStoreFixture({ tickets: [] }))
    const ledgerFile = seedBugLedger(wsC)
    const bootC = runRoute('LED-05', C1_OPS.bootstrap, { ...BUILD_THEN_MAINTAIN_GRAPH }, { workspace: wsC, env: envC })
    if (opMissing(bootC)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootC).message)
    } else if (bootC.exit_code !== 0) {
      push('C1-BUGENTRY-SETUP', `前置不成立：bootstrap 必须能落（exit=${bootC.exit_code} / ${bootC.json?.error?.code}）`)
    } else {
      // C1 build + bug-repair ⇒ 拒（A06），零写入
      const sha0 = fileStat(ledgerFile).sha256
      const c1 = runRoute('LED-05', 'bug-task-set', { tasks: [bugTask({ batch: 'batch-1' })], current_task_id: null }, { workspace: wsC, env: envC })
      if (opMissing(c1)) {
        push('C1-OP-MISSING', missingOpProblem('bug-task-set', c1).message)
      } else {
        const bad = envelopeProblem('bug-task-set（build + bug-repair）', c1, 'E_ADMIT_KIND')
        if (bad !== null) push('C1-ADMIT-BUILD-BUG', `${bad} —— A06：实现期普通 bug 只登记、不修（这条路要等切 maintain / 打断到 build-paused）`)
        if (fileStat(ledgerFile).sha256 !== sha0) push('C1-ADMIT-BUILD-BUG-WROTE', '被拒的 bug 修任务**零写入**（台账 sha256 前后相同）')
      }
      // C2 切 maintain ⇒ 批内收（A09）
      const se2 = runRoute('LED-05', 'stage-enter', { from: 'stage-build', to: 'stage-maintain', exit_criteria_met: [], version: readRoute(wsC)?.version }, { workspace: wsC, env: envC })
      if (okOf('stage-enter build→maintain', se2) !== null) {
        push('C1-BUGENTRY-MAINTAIN-SETUP', `前置不成立：切到 maintain 必须能落（${okOf('stage-enter build→maintain', se2)}）`)
      } else {
        const c2 = runRoute('LED-05', 'bug-task-set', { tasks: [bugTask({ batch: 'batch-1' })], current_task_id: null }, { workspace: wsC, env: envC })
        const bad = okOf('bug-task-set（maintain + 批内）', c2)
        if (bad !== null) push('C1-ADMIT-MAINTAIN-BATCH', `${bad} —— A09：maintain 读 batch，批内要收（定形 §3.1 第 2 条）`)
        if ((readLedger(wsC)?.tasks ?? []).length !== 1) push('C1-ADMIT-BUG-LANDED', `收下的 bug 修任务必须落在 bug 台账的 tasks[] 里（不跨账），实得 ${(readLedger(wsC)?.tasks ?? []).length} 条`)
        // C3 批外 ⇒ 拒 + 点名那条 entry（A10）
        const sha1 = fileStat(ledgerFile).sha256
        const c3 = runRoute('LED-05', 'bug-task-set', { tasks: [bugTask({ id: 'bugtask-2', batch: 'batch-1', entry_ids: [E3] })], current_task_id: null }, { workspace: wsC, env: envC })
        const bad3 = envelopeProblem('bug-task-set（maintain + 批外）', c3, 'E_ADMIT_SET')
        if (bad3 !== null) push('C1-ADMIT-MAINTAIN-OUTSIDE', `${bad3} —— A10：batch 外的 bug 不在 maintain 修`)
        if (!String(c3.json?.error?.message ?? '').includes(E3)) push('C1-ADMIT-MAINTAIN-OUTSIDE-NAMES', `A10 拒的时候必须**点名**那条 entry（${E3}），实得 ${JSON.stringify(c3.json?.error?.message)}`)
        if (fileStat(ledgerFile).sha256 !== sha1) push('C1-ADMIT-MAINTAIN-OUTSIDE-WROTE', '批外被拒时**零写入**')
        // C4 混合 entry_ids：一条批内一条批外 ⇒ 整条任务拒，且点名批外那条
        const c4 = runRoute('LED-05', 'bug-task-set', { tasks: [bugTask({ id: 'bugtask-3', batch: 'batch-1', entry_ids: [E1, E3] })], current_task_id: null }, { workspace: wsC, env: envC })
        const bad4 = envelopeProblem('bug-task-set（批内+批外混装）', c4, 'E_ADMIT_SET')
        if (bad4 !== null) push('C1-ADMIT-MIXED-ENTRIES', `${bad4} —— 一条 bug 任务的 entry_ids 里有任何一条不该修 ⇒ 整条拒（一条一个根因，不许半收）`)
        if (!String(c4.json?.error?.message ?? '').includes(E3)) push('C1-ADMIT-MIXED-NAMES', `混装被拒时必须点名那条**集合外**的 entry（${E3}），实得 ${JSON.stringify(c4.json?.error?.message)}`)
      }
    }

    // C5 空 batch ⇒ 拒（A11）：另起一个工作区，台账里一个批次都没有，直接进 maintain
    const wsE = makeWorkspace('led05', 'bug-empty-batch')
    const { env: envE } = clockEnv(wsE, NOW)
    writeLegacy(wsE, legacyStoreFixture({ tickets: [] }))
    writeLedger(wsE, ledgerFixture({ entries: [bugEntry(E1, T_REG)], batches: [] }))
    const bootE = runRoute('LED-05', C1_OPS.bootstrap, { ...BUILD_THEN_MAINTAIN_GRAPH, current_stage_id: 'stage-maintain' }, { workspace: wsE, env: envE })
    if (bootE.exit_code === 0) {
      const c5 = runRoute('LED-05', 'bug-task-set', { tasks: [bugTask({ batch: null })], current_task_id: null }, { workspace: wsE, env: envE })
      if (!opMissing(c5)) {
        const bad = envelopeProblem('bug-task-set（maintain + 没有 batch）', c5, 'E_ADMIT_SET')
        if (bad !== null) push('C1-ADMIT-EMPTY-BATCH', `${bad} —— A11：没有 batch ⇒ 维护期什么都不收`)
      }
    }

    // C6 build-paused：只收 pause set 内；**在 batch 内但在 pause set 外也拒**（A12 / A13）
    const wsP = makeWorkspace('led05', 'bug-paused')
    const { env: envP } = clockEnv(wsP, NOW)
    writeLegacy(wsP, legacyStoreFixture({ tickets: [] }))
    const ledgerP = seedBugLedger(wsP)
    const bootP = runRoute('LED-05', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsP, env: envP })
    if (bootP.exit_code === 0) {
      const pause = runRoute('LED-05', C1_OPS.routeMark, { mark: 'pause', reason: 'E1 够线，打断实现', entry_ids: [E1], by: 'leader', version: readRoute(wsP)?.version }, { workspace: wsP, env: envP })
      if (okOf('route-mark pause', pause) !== null) {
        push('C1-ADMIT-PAUSED-SETUP', `前置不成立：暂停必须能落（${okOf('route-mark pause', pause)}）`)
      } else {
        const c6 = runRoute('LED-05', 'bug-task-set', { tasks: [bugTask({ batch: 'batch-1', entry_ids: [E1] })], current_task_id: null }, { workspace: wsP, env: envP })
        const bad = okOf('bug-task-set（build-paused + pause set 内）', c6)
        if (bad !== null) push('C1-ADMIT-PAUSED-INSIDE', `${bad} —— A12：build-paused 读 pause set，触发条要收`)
        const sha2 = fileStat(ledgerP).sha256
        const c7 = runRoute('LED-05', 'bug-task-set', { tasks: [bugTask({ id: 'bugtask-9', batch: 'batch-1', entry_ids: [E2] })], current_task_id: null }, { workspace: wsP, env: envP })
        const bad7 = envelopeProblem('bug-task-set（build-paused + batch 内 / pause set 外）', c7, 'E_ADMIT_SET')
        if (bad7 !== null) push('C1-ADMIT-PAUSED-OUTSIDE', `${bad7} —— A13：**即使它在 batch 里也拒**（两个集合不混名：build-paused 读 pause set）`)
        if (!String(c7.json?.error?.message ?? '').includes(E2)) push('C1-ADMIT-PAUSED-NAMES', `A13 拒的时候必须点名那条 entry（${E2}），实得 ${JSON.stringify(c7.json?.error?.message)}`)
        if (fileStat(ledgerP).sha256 !== sha2) push('C1-ADMIT-PAUSED-WROTE', 'pause set 外被拒时**零写入**')
      }
    }

    // C7 未建账 ⇒ 拒一切修任务（A01）；码不许折成 E_INTERNAL
    const wsU = makeWorkspace('led05', 'uninitialized')
    const { env: envU } = clockEnv(wsU, NOW)
    writeLedger(wsU, ledgerFixture({ entries: [bugEntry(E1, T_REG)], batches: [{ id: 'batch-1', frozen_at: NOW, entry_ids: [E1] }] }))
    const ledgerU = bugAbs(wsU, BUG_PATHS.ledger)
    const shaU = fileStat(ledgerU).sha256
    const c8 = runRoute('LED-05', 'bug-task-set', { tasks: [bugTask({ batch: 'batch-1' })], current_task_id: null }, { workspace: wsU, env: envU })
    if (!opMissing(c8)) {
      const bad = envelopeProblem('bug-task-set（未建账）', c8, 'E_ADMIT_UNINITIALIZED')
      if (bad !== null) push('C1-ADMIT-UNINITIALIZED', `${bad} —— A01：未建账 ⇒ 拒一切修任务（只能登记）；码不许被折成 E_INTERNAL`)
      if (fileStat(ledgerU).sha256 !== shaU) push('C1-ADMIT-UNINITIALIZED-WROTE', '未建账被拒时**零写入**')
    }

    // ── F · 票的状态是**投影**（不存值）+ `void` 是唯一存下的终态 + 有 live task 不许 void ──
    const projLib = await loadStagedModule(ROUTE_LIB, ['ticketStatusOf', 'ticketVoidVerdict'])
    if (projLib.surfaceMissing || projLib.missing.length > 0) {
      push('C1-SURFACE-MISSING', `\`${ROUTE_LIB}\` 缺：${projLib.missing.join(' / ') || '(整个文件不在)'}（票状态投影 / void 不变量）`)
    }
    if (typeof projLib.mod?.ticketStatusOf === 'function') {
      const t = { id: 'ticket-20261101-01' }
      const cells = [
        ['没有任务 ⇒ open', t, [], 'open'],
        ['迁移票：没有任务 ⇒ `legacy_status` 当投影', { id: 'F-165', legacy_status: 'in_progress' }, [], 'in_progress'],        ['任务 doing ⇒ in_progress', t, [{ ticket_id: t.id, status: 'in_progress' }], 'in_progress'],
        ['任务 paused 仍算 doing ⇒ in_progress', t, [{ ticket_id: t.id, status: 'paused' }], 'in_progress'],
        ['任务全 done ⇒ done', t, [{ ticket_id: t.id, status: 'done' }], 'done'],
        ['void（存值）优先于任务投影', { ...t, void_reason: '这条路在方案选择里被否了', re_present: { ref: 'r', at: '2026-11-01T10:00:00+08:00' } }, [{ ticket_id: t.id, status: 'in_progress' }], 'void'],
        ['存了 status:done 但没有任务 ⇒ **仍是 open**（投影不存值）', { ...t, status: 'done' }, [], 'open'],
      ]
      for (const [label, ticket, tasks, want] of cells) {
        const got = projLib.mod.ticketStatusOf(ticket, tasks)
        if (got !== want) push('C1-TICKET-PROJECTION', `ticketStatusOf（${label}）：期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}`)
      }
    }
    if (typeof projLib.mod?.ticketVoidVerdict === 'function') {
      const live = projLib.mod.ticketVoidVerdict({ id: 'ticket-20261101-01' }, [{ ticket_id: 'ticket-20261101-01', status: 'in_progress' }])
      if (live?.ok !== false || live?.code !== 'E_TICKET_LIVE_TASK') push('C1-TICKET-VOID-LIVE', `有 live task 的票不许 void ⇒ 拒 \`E_TICKET_LIVE_TASK\`，实得 ${JSON.stringify(live)}`)
      const closed = projLib.mod.ticketVoidVerdict({ id: 'ticket-20261101-01' }, [{ ticket_id: 'ticket-20261101-01', status: 'done' }])
      if (closed?.ok !== true) push('C1-TICKET-VOID-OK', `任务都 done 了的票可以 void（先取消任务这条已经满足），实得 ${JSON.stringify(closed)}`)
    }
    // 写面：有在途任务的票被 void ⇒ 拒 + 零写入（真账本上再走一遍）
    if (ticketId !== null && readRoute(ws) !== null) {
      const sha = fileStatRoute(routeAbs(ws, ROUTE_PATHS.current)).sha256
      const badVoid = runRoute('LED-05', 'ticket-void', {
        id: ticketId, status: 'void', void_reason: '这条路在方案选择里被否掉了，改由新票承接。',
        re_present: { ref: '记忆更新报告 2026-11-01 的票区', at: NOW }, version: readRoute(ws)?.version,
      }, { workspace: ws, env })
      if (!opMissing(badVoid)) {
        const bad = envelopeProblem('ticket-void（有 live task）', badVoid, 'E_TICKET_LIVE_TASK')
        if (bad !== null) push('C1-TICKET-VOID-WRITE', `${bad} —— 「有 live task 的票不许 void（先取消任务）」这一条不变量要落在写面上`)
        if (fileStatRoute(routeAbs(ws, ROUTE_PATHS.current)).sha256 !== sha) push('C1-TICKET-VOID-WROTE', '被拒的 void **零写入**')
      }
    }

    // ── D · 判据一份（源码级）：两个入口都调同一个函数、函数只有一个定义 ─────────
    // gate4 复审 BC-04 ①：原来这一段许的是「同一个输入在两个入口上给出同一个结论」——
    // 那个形状**造不出来**（两个入口收的 `kind` 按设计不相交），写出来只会在断言不到的地方恒绿。
    // 改成源码级：少一处调用 / 多一份定义，这一格当场翻面。
    let admitCallSites = 0
    let admitDefinitions = 0
    try {
      const binText = readStagedText('bin/agenia-route.mjs')
      const libText = readStagedText(ROUTE_LIB)
      /** 一个 `function name(...)` 的函数体（到下一个顶层 `function ` 为止）。 */
      const bodyOf = (name) => {
        const start = binText.indexOf(`function ${name}(`)
        if (start < 0) return null
        const next = binText.indexOf('\nfunction ', start + 1)
        return binText.slice(start, next < 0 ? binText.length : next)
      }
      const routeBody = bodyOf('opTaskSet')
      const bugBody = bodyOf('opBugTaskSet')
      if (routeBody === null || bugBody === null) {
        push('C1-SAME-PREDICATE-SURFACE', `\`bin/agenia-route.mjs\` 里找不到 ${routeBody === null ? 'opTaskSet' : 'opBugTaskSet'} 的函数体 —— 两个入口是不是被改名了？`)
      } else {
        if (!routeBody.includes('R.admitTask(')) push('C1-SAME-PREDICATE-ROUTE', '路线入口 `task-set` 的函数体里没有 `R.admitTask(` —— 它自己又写了一份矩阵？')
        else admitCallSites += 1
        if (!bugBody.includes('R.admitTask(')) push('C1-SAME-PREDICATE-BUG', 'bug 入口 `bug-task-set` 的函数体里没有 `R.admitTask(` —— 两处判据开始分叉了')
        else admitCallSites += 1
      }
      admitDefinitions = (libText.match(/export function admitTask\s*\(/g) ?? []).length
      if (admitDefinitions !== 1) {
        push('C1-SAME-PREDICATE-DEF', `\`${ROUTE_LIB}\` 里 \`export function admitTask\` 必须**恰好一个定义**（判据一份），实得 ${admitDefinitions} 处`)
      }
    } catch (err) {
      push('C1-SAME-PREDICATE-SURFACE', `读不到源码（${String(err?.message ?? err).slice(0, 160)}）—— 这一格判不了"判据一份"`)
    }

    /** 上面几段**实际跑出来的**读数（没走到的那一格写 null，不写 true）。 */
    const measured = { migrated: {}, refs: {}, cross: {} }

    // ── G · 迁移票的写路径（BC-01）：`void` / `update` / `close` 的 from-state 读**投影** ──
    // 现场就是真实工作区那一态：`bootstrap` 迁进来的 7 张票**不存 `status`**（契约 §4.2）。
    // 修之前：三个写 op 把 `ticket.status`（undefined）喂给 `canTransition()` ⇒ 一张都动不了。
    const wsG = makeWorkspace('led05', 'migrated')
    const { env: envG } = clockEnv(wsG, NOW)
    writeLegacy(wsG, legacyStoreFixture())
    const bootG = runRoute('LED-05', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsG, env: envG })
    if (opMissing(bootG)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootG).message)
    } else if (bootG.exit_code !== 0) {
      push('C1-MIGRATED-SETUP', `前置不成立：bootstrap 必须能落（exit=${bootG.exit_code} / ${bootG.json?.error?.code}）`)
    } else {
      const routeG = readRoute(wsG)
      const versionOf = () => readRoute(wsG)?.version
      const shaOfRoute = () => fileStatRoute(routeAbs(wsG, ROUTE_PATHS.current)).sha256
      /** `read.tickets[]` 里那一张票的**投影**（票段唯一的读面）。 */
      const projectionOf = (id) => {
        const res = runRoute('LED-05', 'read', {}, { workspace: wsG, env: envG })
        if (res.exit_code !== 0) return { ok: false, status: null, refs: null }
        const hit = (res.json?.tickets ?? []).find((t) => t.id === id) ?? null
        return { ok: hit !== null, status: hit?.status ?? null, refs: hit?.finding_refs ?? null }
      }
      const storedOf = (id) => (readRoute(wsG)?.tickets ?? []).find((t) => t.id === id) ?? null

      // 前提阳性对照：7 张迁移票**都不存 `status`**（不成立的话，下面几格判的不是那件事）。
      const missingIds = LEGACY_TICKETS.map((t) => t.id).filter((id) => storedOf(id) === null)
      measured.migrated.migrated_tickets = (routeG?.tickets ?? []).length
      if (missingIds.length > 0) push('C1-MIGRATED-PREMISE', `前置不成立：路线票段里少了迁移票 ${JSON.stringify(missingIds)}`)
      const storedStatusIds = LEGACY_TICKETS.map((t) => t.id).filter((id) => storedOf(id) !== null && 'status' in storedOf(id))
      if (storedStatusIds.length > 0) push('C1-MIGRATED-PREMISE-STATUS', `迁移票不许**存** \`status\`（契约 §4.2：投影读 \`legacy_status\`），实得有：${JSON.stringify(storedStatusIds)}`)

      // G1 迁移票可以 void：from-state = `legacy_status:'open'`（唯一存下的终态必须可达）。
      const g1before = shaOfRoute()
      const voided = runRoute('LED-05', 'ticket-void', {
        id: 'F-165', status: 'void',
        void_reason: '这条路在方案选择里被否掉了，改由新票承接。',
        re_present: { ref: '记忆更新报告 2026-11-01 的票区', at: NOW },
        version: versionOf(),
      }, { workspace: wsG, env: envG })
      measured.migrated.void_exit = voided.exit_code
      const badVoid = okOf('ticket-void（迁移票 F-165，无任务）', voided)
      if (badVoid !== null) {
        push('C1-MIGRATED-VOID', `${badVoid} —— BC-01：迁移票不存 \`status\`，from-state 必须读**投影**（legacy_status='open'）；void 这条唯一的控制写必须可达`)
      }
      const voidRec = storedOf('F-165') ?? {}
      measured.migrated.void_stored_status = voidRec.status ?? null
      if (voidRec.status !== 'void') push('C1-MIGRATED-VOID-STORED', `void 是**唯一存下的终态**：F-165 的记录里必须写 \`status:"void"\`，实得 ${JSON.stringify(voidRec.status)}`)
      const voidProj = projectionOf('F-165')
      measured.migrated.void_projection = voidProj.status
      if (voidProj.status !== 'void') push('C1-MIGRATED-VOID-PROJECTION', `\`read.tickets[]\` 的投影必须是 \`void\`（void 优先于一切），实得 ${JSON.stringify(voidProj.status)}`)
      if (shaOfRoute() === g1before) push('C1-MIGRATED-VOID-WROTE', 'void 成功之后 `current.json` 必须变（这一格是"写面真的动了"的阳性对照）')

      // G2 再 void 一次 ⇒ 终态（`E_TICKET_TRANSITION`）+ 零写入（投影 = void，不是"没状态就随便转"）。
      const g2before = shaOfRoute()
      const voidAgain = runRoute('LED-05', 'ticket-void', {
        id: 'F-165', status: 'void',
        void_reason: '再写一次，看看终态守不守得住。',
        re_present: { ref: '记忆更新报告 2026-11-01 的票区', at: NOW },
        version: versionOf(),
      }, { workspace: wsG, env: envG })
      measured.migrated.second_void_code = voidAgain.json?.error?.code ?? null
      const badAgain = envelopeProblem('ticket-void（已经 void 的迁移票）', voidAgain, 'E_TICKET_TRANSITION')
      if (badAgain !== null) push('C1-MIGRATED-VOID-TERMINAL', `${badAgain} —— void 是终态：投影是 void ⇒ 状态机必须拒（不许把"再写一次"读成合法）`)
      if (shaOfRoute() !== g2before) push('C1-MIGRATED-VOID-TERMINAL-WROTE', '被拒的 void **零写入**')

      // G3 `ticket-update {status:'in_progress'}` 在迁移票上：状态机按**投影**放行，但投影**不跟着走**
      //    （契约 §7.5 第 5 格：没有任务时 `legacy_status` 说了算）—— 这就是"写了一个不进投影的 status"。
      const updated = runRoute('LED-05', 'ticket-update', {
        id: 'F-166', status: 'in_progress', version: versionOf(),
      }, { workspace: wsG, env: envG })
      measured.migrated.update_exit = updated.exit_code
      const badUpdate = okOf('ticket-update（迁移票 F-166：open→in_progress）', updated)
      if (badUpdate !== null) push('C1-MIGRATED-UPDATE', `${badUpdate} —— BC-01：迁移票的 update 也要按投影判 from-state（open→in_progress 是合法转场）`)
      const updRec = storedOf('F-166') ?? {}
      measured.migrated.update_stored_status = updRec.status ?? null
      if (updRec.status !== 'in_progress') push('C1-MIGRATED-UPDATE-STORED', `update 要把新状态写进记录（这是那次写的事实），实得 ${JSON.stringify(updRec.status)}`)
      const updProj = projectionOf('F-166')
      measured.migrated.update_projection = updProj.status
      if (updProj.status !== 'open') {
        push('C1-MIGRATED-UPDATE-PROJECTION', `**存着的 \`status\` 不许赢过 \`legacy_status\`**：F-166 的 \`legacy_status\` 还是 open、又没有任务 ⇒ 投影必须仍是 \`open\`（实得 ${JSON.stringify(updProj.status)}）`)
      }

      // G4 紧接着 close 那张票 ⇒ 仍拒（投影是 open；open→done 不许跳过 in_progress）+ 零写入。
      const g4before = shaOfRoute()
      const closeAfterUpdate = runRoute('LED-05', 'ticket-close', {
        id: 'F-166', status: 'done',
        closure_evidence: { kind: 'test-run', ref: 'tests/agenia-upgrade/integration/c1e-admit-matrix.test.mjs', sha256: 'b'.repeat(64) },
        version: versionOf(),
      }, { workspace: wsG, env: envG })
      measured.migrated.close_after_update_code = closeAfterUpdate.json?.error?.code ?? null
      const badCloseAfterUpdate = envelopeProblem('ticket-close（投影仍 open 的迁移票）', closeAfterUpdate, 'E_TICKET_TRANSITION')
      if (badCloseAfterUpdate !== null) {
        push('C1-MIGRATED-CLOSE-NOT-VIA-STATUS', `${badCloseAfterUpdate} —— 一张 \`legacy_status:'open'\` 的迁移票，写了一个 \`status:'in_progress'\` 也**关不掉**：投影不认那个值（组长裁定）`)
      }
      if (shaOfRoute() !== g4before) push('C1-MIGRATED-CLOSE-NOT-VIA-STATUS-WROTE', '被拒的 close **零写入**')

      // G5 迁移票要关，**走任务**：挂一条 live 修任务 ⇒ 投影 in_progress ⇒ close 收；
      //    任务 done 之后投影才是 done（投影跟任务走，不跟存着的 status 走）。
      const repairTask = {
        id: 'T-repair-168', stage_id: 'stage-build', title: '修 F-168（票的修 = build 期的路线任务）',
        status: 'in_progress', five_gate_state: '实现', kind: 'ticket-repair', ticket_id: 'F-168',
      }
      const setRepair = runRoute('LED-05', 'task-set', { tasks: [repairTask], current_task_id: 'T-repair-168', version: versionOf() }, { workspace: wsG, env: envG })
      const badSetRepair = okOf('task-set（F-168 的票的修）', setRepair)
      if (badSetRepair !== null) {
        push('C1-MIGRATED-CLOSE-SETUP', `${badSetRepair} —— 前置不成立：票的修任务必须能挂到迁移票上`)
      } else {
        const projByTask = projectionOf('F-168')
        measured.migrated.projection_by_task = projByTask.status
        if (projByTask.status !== 'in_progress') push('C1-MIGRATED-PROJECTION-BY-TASK', `有 in_progress 修任务的迁移票 ⇒ 投影必须是 \`in_progress\`，实得 ${JSON.stringify(projByTask.status)}`)
        const closed = runRoute('LED-05', 'ticket-close', {
          id: 'F-168', status: 'done',
          closure_evidence: { kind: 'test-run', ref: 'tests/agenia-upgrade/integration/c1e-admit-matrix.test.mjs', sha256: 'c'.repeat(64) },
          version: versionOf(),
        }, { workspace: wsG, env: envG })
        measured.migrated.close_via_task_exit = closed.exit_code
        const badClosed = okOf('ticket-close（投影已是 in_progress 的迁移票）', closed)
        if (badClosed !== null) push('C1-MIGRATED-CLOSE-VIA-TASK', `${badClosed} —— 迁移票要关得走**任务**：修任务把投影变成 in_progress，close 才合法（组长裁定）`)
        const doneTask = { ...repairTask, status: 'done' }
        const setDone = runRoute('LED-05', 'task-set', { tasks: [doneTask], current_task_id: 'T-repair-168', version: versionOf() }, { workspace: wsG, env: envG })
        if (okOf('task-set（修任务 done）', setDone) !== null) {
          push('C1-MIGRATED-CLOSE-VIA-TASK-SETUP', `前置不成立：把修任务标 done 必须能落（${okOf('task-set（修任务 done）', setDone)}）`)
        } else {
          const projDone = projectionOf('F-168')
          measured.migrated.projection_after_task_done = projDone.status
          if (projDone.status !== 'done') push('C1-MIGRATED-PROJECTION-AFTER-TASK', `任务全 done ⇒ 投影才是 \`done\`（投影跟任务走），实得 ${JSON.stringify(projDone.status)}`)
        }
      }

      // G6 迁移票的 `legacy_status:'done'` 也是终态（F-170）⇒ close 必须拒 + 零写入。
      const g6before = shaOfRoute()
      const closeDone = runRoute('LED-05', 'ticket-close', {
        id: 'F-170', status: 'done',
        closure_evidence: { kind: 'doc-update', ref: '.team/leader/2026-10-31/findings-map.json', sha256: 'd'.repeat(64) },
        version: versionOf(),
      }, { workspace: wsG, env: envG })
      measured.migrated.close_legacy_done_code = closeDone.json?.error?.code ?? null
      const badCloseDone = envelopeProblem('ticket-close（legacy_status 已是 done 的迁移票）', closeDone, 'E_TICKET_TRANSITION')
      if (badCloseDone !== null) push('C1-MIGRATED-CLOSE-DONE-TERMINAL', `${badCloseDone} —— \`legacy_status:'done'\` 也是终态：done/void 要回退就开新票`)
      if (shaOfRoute() !== g6before) push('C1-MIGRATED-CLOSE-DONE-TERMINAL-WROTE', '被拒的 close **零写入**')
    }

    // ── H · `finding_refs` 载体（BC-03a）：`ticket-open` 收它、读面查得到、两条迁移路都搬 ──
    const wsH = makeWorkspace('led05', 'finding-refs')
    const { env: envH } = clockEnv(wsH, NOW)
    writeLegacy(wsH, legacyStoreFixture({ tickets: [] }))
    const bootH = runRoute('LED-05', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsH, env: envH })
    if (opMissing(bootH)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootH).message)
    } else if (bootH.exit_code !== 0) {
      push('C1-REFS-SETUP', `前置不成立：bootstrap 必须能落（exit=${bootH.exit_code} / ${bootH.json?.error?.code}）`)
    } else {
      const srcOf = (ch) => `technical-review:${ch.repeat(64)}#F1`
      const opened = runRoute('LED-05', 'ticket-open', {
        title: '把「读数说假话」那一条接住', source: srcOf('e'),
        next_step: '改读面并重跑那一条', acceptance: 'LED-05 H 段绿', finding_refs: ['F1', 'F2'],
      }, { workspace: wsH, env: envH })
      measured.refs.open_exit = opened.exit_code
      const badOpen = okOf('ticket-open（带 finding_refs）', opened)
      if (badOpen !== null) push('C1-REFS-OPEN', `${badOpen} —— BC-03a：` + '`ticket-open` 必须收 `finding_refs`（§6.2「adopted+ticket ⇒ 票段有这张票」的载体）')
      const refTicketId = opened.json?.ticket_id ?? null
      const refRec = refTicketId === null ? null : (readRoute(wsH)?.tickets ?? []).find((t) => t.id === refTicketId) ?? null
      measured.refs.stored = refRec?.finding_refs ?? null
      if (refRec === null) {
        push('C1-REFS-NOT-STORED', '`ticket-open` 说成功了，票段里却没有这张票')
      } else if (JSON.stringify(refRec.finding_refs) !== JSON.stringify(['F1', 'F2'])) {
        push('C1-REFS-STORED', `票的记录里必须留住 \`finding_refs:["F1","F2"]\`，实得 ${JSON.stringify(refRec.finding_refs)}`)
      }
      const readH = runRoute('LED-05', 'read', {}, { workspace: wsH, env: envH })
      const readHit = readH.exit_code === 0 ? (readH.json?.tickets ?? []).find((t) => t.id === refTicketId) ?? null : null
      measured.refs.read_face = readHit?.finding_refs ?? null
      if (readHit === null) {
        push('C1-REFS-READ-FACE', `\`read.tickets[]\` 里查不到那张票（exit=${readH.exit_code} / ${readH.json?.error?.code}）—— 载体必须能从读面查到`)
      } else if (JSON.stringify(readHit.finding_refs) !== JSON.stringify(['F1', 'F2'])) {
        push('C1-REFS-READ-FACE-VALUE', `\`read.tickets[].finding_refs\` 必须逐字是 ["F1","F2"]（读面能直接查到），实得 ${JSON.stringify(readHit.finding_refs)}`)
      }
      // 两个负样本：给了空表 / 重复 id —— 都拒 `E_ARG_SCHEMA` + 零写入（**没有新增错误码**）。
      const shaH = fileStatRoute(routeAbs(wsH, ROUTE_PATHS.current)).sha256
      const refusals = [
        ['空表（"给了"与"没给"不是一件事）', { title: '空表那一格', source: srcOf('f'), next_step: '无', acceptance: '被拒', finding_refs: [] }],
        ['重复 id', { title: '重复 id 那一格', source: srcOf('0'), next_step: '无', acceptance: '被拒', finding_refs: ['F1', 'F1'] }],
      ]
      for (const [label, payload] of refusals) {
        const res = runRoute('LED-05', 'ticket-open', payload, { workspace: wsH, env: envH })
        if (opMissing(res)) { push('C1-OP-MISSING', missingOpProblem('ticket-open', res).message); break }
        const bad = envelopeProblem(`ticket-open（finding_refs ${label}）`, res, 'E_ARG_SCHEMA')
        if (bad !== null) push('C1-REFS-REFUSE', `${bad} —— 给了就必须 ≥1 条、ids 唯一（码用既有的 \`E_ARG_SCHEMA\`，不许新增码）`)
      }
      if (fileStatRoute(routeAbs(wsH, ROUTE_PATHS.current)).sha256 !== shaH) push('C1-REFS-REFUSE-WROTE', '被拒的 `ticket-open` **零写入**')
    }

    // H2 两条迁移路都要**逐字搬** `finding_refs`：legacy 票店那条 + observation 那条。
    const wsH2 = makeWorkspace('led05', 'refs-migrate')
    const { env: envH2 } = clockEnv(wsH2, NOW)
    const OBS = 'obs-20261101-01'
    writeLegacy(wsH2, legacyStoreFixture({ tickets: [{ ...LEGACY_TICKETS[0], finding_refs: ['F9'] }] }))
    writeLedger(wsH2, ledgerFixture({ entries: [bugEntry(OBS, '2026-10-31T09:00:00+08:00', { kind: 'observation', finding_refs: ['F7'] })] }))
    const bootH2 = runRoute('LED-05', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsH2, env: envH2 })
    if (opMissing(bootH2)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootH2).message)
    } else if (bootH2.exit_code !== 0) {
      push('C1-REFS-MIGRATE-SETUP', `前置不成立：带 finding_refs 的两条迁移路必须能落（exit=${bootH2.exit_code} / ${bootH2.json?.error?.code}）`)
    } else {
      const ticketsH2 = readRoute(wsH2)?.tickets ?? []
      const fromStore = ticketsH2.find((t) => t.id === LEGACY_TICKETS[0].id) ?? null
      const fromObs = ticketsH2.find((t) => t.legacy_ref === OBS) ?? null
      measured.refs.from_legacy_store = fromStore?.finding_refs ?? null
      measured.refs.from_observation = fromObs?.finding_refs ?? null
      if (JSON.stringify(fromStore?.finding_refs) !== JSON.stringify(['F9'])) {
        push('C1-REFS-MIGRATE-STORE', `legacy 票店那条迁移路必须搬 \`finding_refs\`（期望 ["F9"]），实得 ${JSON.stringify(fromStore?.finding_refs)}`)
      }
      if (fromObs === null) {
        push('C1-REFS-MIGRATE-OBS-MISSING', `observation 迁移没有转出票（票段：${JSON.stringify(ticketsH2.map((t) => [t.id, t.legacy_ref]))}）`)
      } else if (JSON.stringify(fromObs.finding_refs) !== JSON.stringify(['F7'])) {
        push('C1-REFS-MIGRATE-OBS', `observation 迁移必须搬条目上的 \`finding_refs\`（期望 ["F7"]），实得 ${JSON.stringify(fromObs.finding_refs)}`)
      }
    }

    // ── I · 跨工作区负样本（BC-03b）：A 不许读/写 B 的路线账 ─────────────────────
    // 口径：路线账本**一个工作区一份**（`<WS>/.team/route`）。同一个 `stage id` 在两区各一份**不是**缺陷；
    // 跨区读/写才是。写得跟派生值一样 ⇒ 放行（老调用方不破）。
    const wsXA = makeWorkspace('led05', 'cross-a')
    const { env: envXA } = clockEnv(wsXA, NOW)
    const wsXB = makeWorkspace('led05', 'cross-b')
    const { env: envXB } = clockEnv(wsXB, NOW)
    writeLegacy(wsXA, legacyStoreFixture({ tickets: [] }))
    writeLegacy(wsXB, legacyStoreFixture({ tickets: [] }))
    const bootXA = runRoute('LED-05', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsXA, env: envXA })
    const bootXB = runRoute('LED-05', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsXB, env: envXB })
    if (opMissing(bootXA) || opMissing(bootXB)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootXA).message)
    } else if (bootXA.exit_code !== 0 || bootXB.exit_code !== 0) {
      push('C1-CROSS-SETUP', `前置不成立：两个工作区都要能建账（A=${bootXA.exit_code}/${bootXA.json?.error?.code} · B=${bootXB.exit_code}/${bootXB.json?.error?.code}）`)
    } else {
      const shaXA = () => fileStatRoute(routeAbs(wsXA, ROUTE_PATHS.current)).sha256
      const shaXB = () => fileStatRoute(routeAbs(wsXB, ROUTE_PATHS.current)).sha256
      // 隔离的阳性面：A 开一张票 ⇒ B 的读面里查不到它（各一份账）。
      const aOpen = runRoute('LED-05', 'ticket-open', {
        title: 'A 区的票（跨区负样本的阳性面）', source: `technical-review:${'1'.repeat(64)}#F1`,
        next_step: '只许出现在 A 区', acceptance: 'B 区读不到它',
      }, { workspace: wsXA, env: envXA })
      const aTicket = aOpen.json?.ticket_id ?? null
      const readB0 = runRoute('LED-05', 'read', {}, { workspace: wsXB, env: envXB })
      const bIds = (readB0.json?.tickets ?? []).map((t) => t.id)
      const readA0 = runRoute('LED-05', 'read', {}, { workspace: wsXA, env: envXA })
      const aIds = (readA0.json?.tickets ?? []).map((t) => t.id)
      measured.cross.isolation = { a_tickets: aIds, b_tickets: bIds }
      if (aTicket === null) {
        push('C1-CROSS-TICKET-SETUP', `前置不成立：A 区必须能开一张票（${okOf('ticket-open（A 区）', aOpen)}）`)
      } else {
        if (!aIds.includes(aTicket)) push('C1-CROSS-A-OWNS', `A 区的票必须出现在 A 区的读面里（实得 ${JSON.stringify(aIds)}）`)
        if (bIds.includes(aTicket)) push('C1-CROSS-B-LEAK', `A 区的票出现在了 B 区的读面里（${aTicket}）—— 一个工作区一份账`)
        if (aIds.length === bIds.length) push('C1-CROSS-SAME-SHAPE', `两区的票段不该长得一样（A 多了一张）：A=${JSON.stringify(aIds)} · B=${JSON.stringify(bIds)}`)
      }
      // 阳性对照：**显式写成派生值**（同一个工作区的 `.team` / `.team/route`）⇒ 放行。
      const ownExplicit = runRoute('LED-05', 'read', {}, {
        workspace: wsXA, env: envXA,
        extra: ['--status-root', routeAbs(wsXA, ROUTE_PATHS.teamDir), '--route-dir', routeAbs(wsXA, ROUTE_PATHS.routeDir)],
      })
      measured.cross.own_explicit_ok = ownExplicit.exit_code === 0
      const badOwn = okOf('read（显式写成自己的派生值）', ownExplicit)
      if (badOwn !== null) push('C1-CROSS-OWN-VALUES', `${badOwn} —— 写得跟派生值一样必须放行（老调用方不破；这条是负样本的**阳性对照**）`)

      // 负样本 ①：A 拿 `--status-root B/.team` 去**读** B 的路线 ⇒ 拒 `E_ROOT_OUTSIDE` + 两边零写入。
      const crossShaA = shaXA()
      const crossShaB = shaXB()
      const crossRead = runRoute('LED-05', 'read', {}, {
        workspace: wsXA, env: envXA, extra: ['--status-root', routeAbs(wsXB, ROUTE_PATHS.teamDir)],
      })
      measured.cross.read_code = crossRead.json?.error?.code ?? null
      const badCrossRead = envelopeProblem('read（A 用 --status-root 指 B 的 .team）', crossRead, 'E_ROOT_OUTSIDE')
      if (badCrossRead !== null) push('C1-CROSS-READ', `${badCrossRead} —— 路线目录只许由 \`--workspace\` 派生；跨工作区读必须是 \`E_ROOT_OUTSIDE\``)
      if (shaXA() !== crossShaA || shaXB() !== crossShaB) push('C1-CROSS-READ-WROTE', '跨区读被拒时**两边都零写入**（A / B 的 current.json sha256 前后相同）')

      // 负样本 ②：A 拿 `--route-dir B/.team/route` 去**写** B 的路线 ⇒ 拒 `E_ROOT_OUTSIDE` + 零写入。
      const crossWrite = runRoute('LED-05', 'ticket-open', {
        title: 'A 想写进 B 区的票', source: `technical-review:${'2'.repeat(64)}#F1`, next_step: '只许被拒', acceptance: '被拒',
      }, { workspace: wsXA, env: envXA, extra: ['--route-dir', routeAbs(wsXB, ROUTE_PATHS.routeDir)] })
      measured.cross.write_code = crossWrite.json?.error?.code ?? null
      const badCrossWrite = envelopeProblem('ticket-open（A 用 --route-dir 指 B 的 route）', crossWrite, 'E_ROOT_OUTSIDE')
      if (badCrossWrite !== null) push('C1-CROSS-WRITE', `${badCrossWrite} —— 跨工作区写必须是 \`E_ROOT_OUTSIDE\` + 零写入（账本一个工作区一份）`)
      if (shaXA() !== crossShaA || shaXB() !== crossShaB) push('C1-CROSS-WRITE-WROTE', '跨区写被拒时**两边都零写入**（A / B 的 current.json sha256 前后相同）')
      // 拒了之后本区照旧能写（不是"一刀切禁写"）：A 再开一张票必须收。
      const aStillWorks = runRoute('LED-05', 'ticket-open', {
        title: '被拒之后 A 区照旧能写', source: `technical-review:${'3'.repeat(64)}#F1`, next_step: '写进 A 区', acceptance: 'A 区多一张票',
      }, { workspace: wsXA, env: envXA })
      measured.cross.own_write_after_refusal = aStillWorks.exit_code === 0
      if (okOf('ticket-open（跨区被拒之后，A 区自己照写）', aStillWorks) !== null) {
        push('C1-CROSS-OWN-WRITE', `跨区被拒**不是**一刀切禁写：本区的写面必须照旧能落（${okOf('ticket-open（A 区）', aStillWorks)}）`)
      }
    }

    rec.readings.led05 = {
      admit_cells: ADMIT_CELLS.length,
      reject_codes: [...new Set(ADMIT_CELLS.filter((c) => c.code).map((c) => c.code))],
      entries: ['task-set', 'bug-task-set'],
      // 🔴 下面每一格都是**跑出来的**（gate4 复审 BC-04 ③）；没走到的那一格是 `null`，不是 `true`。
      same_predicate: { definitions: admitDefinitions, call_sites: admitCallSites },
      migrated_ticket_writes: measured.migrated,
      finding_refs: measured.refs,
      cross_workspace: measured.cross,
    }
    caseFail(problems)
  })
})
