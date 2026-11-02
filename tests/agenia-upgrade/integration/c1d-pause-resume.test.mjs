/**
 * `LED-04` · **C1d —— 暂停 / 恢复（`build-paused` 的那条路）**（任务 C1 的第 2 关红测试）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）
 *   §2.3（「**`maintain` 不支持暂停**（`(maintain, pause)` **拒，不静默忽略**）」；
 *   「暂停/恢复 = `route-mark pause|resume`（**不改阶段**）」；
 *   「**决定记录 = `pauses`**（绑 **entry id 集合**：触发条 + 老板扩大范围的那些；+ 按哪条线 / 谁的证据 / 谁拍的）；
 *   **解析 pause set 时读 live + archived 两段**」）·
 *   §3.3（「**暂停必须停会话**（写 `session_exit`，**不清 `session_ref`**；`paused` + 活会话 = 非法）；
 *   **停会话 = 组长执行**；**停不下来 ⇒ 暂停失败 + 卡红**（不锁死、不静默放行）」）·
 *   §4.1（**扩大 = 同一个 pause set 加 entry；另开 = 新 pause set，旧 set 关闭**；
 *   「**旧 set 关闭 ⇒ 在途修任务照旧占槽、不自动 free**」）·
 *   §4.9（「切阶段那一刻：**先停会话**、在途实现任务标 `paused`（写 `session_exit`，不清 `session_ref`）；
 *   再 `stage-enter`；**停会话失败 ⇒ 切阶段失败 + 卡红**」）· §6.2 的「严重 bug 暂停」行。
 * 契约：`.team/test/CONTRACT-C1.md` §10。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守六件事：
 * `A` **暂停 = 停会话 + 记一条决定**：没有声明的活会话 ⇒ 拒（`E_PAUSE_SESSION_LIVE`）+ **零写入**，
 *     mode 还是 `build`（"不锁死、不静默放行"）；声明了 ⇒ 任务写 `session_exit` + 标 `paused`，
 *     **`session_ref` 不清**，mode 变 `build-paused`。
 * `B` **`maintain` 不支持暂停**：拒 `E_PAUSE_NOT_SUPPORTED`，不是静默忽略、不是写一条没用的记录。
 * `C` **扩大 vs 另开**：默认扩大（同一个 `pause_id`、entry 集合取并集）；`new_set:true` ⇒ 旧 set
 *     `closed` + 新 set `open`；**旧 set 关闭不自动 free 在途修任务**。
 * `D` **恢复**：关掉 open 的 set、mode 回 `build`；**不顺手改任务状态**（那是第二作者）；
 *     不在 `build-paused` 时 resume ⇒ 拒 `E_RESUME_NOT_PAUSED`。
 * `E` **pause set 解析**：`pauseSetOf` 只认 open 的集合；`pauseEntriesVerdict` **live + archived 两段都查**
 *     （已归档的条目仍然解得出 —— 和 finding 查找同一条规则）；解不出的 id 要点名。
 * `F` **切阶段要先停会话**：有活会话且没声明 ⇒ 拒 `E_STAGE_SESSION_LIVE` + 零写入；
 *     声明了 ⇒ 过（在途实现任务变 `paused` + `session_exit`，`session_ref` 不变）。
 *
 * ── 现在为什么红、红在哪（第 2 关，功能未做）────────────────────────────────────
 * · `--op route-mark` 不存在 ⇒ A/B/C/D 全红（`C1-OP-MISSING`）；
 * · `lib/route.mjs` 没有 `pauseSetOf` / `pauseEntriesVerdict` ⇒ E 段红（`C1-SURFACE-MISSING`）；
 * · `stage-enter` 今天还不管会话（它只看证据 / 退出条件 / 未结任务）⇒ F 段红在"没拒"上。
 */
import { before, test } from 'node:test'
import { caseFail, preflight, runCase } from '../support/evidence.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import { bugEntry, ledgerFixture, readLedger, writeLedger } from '../support/bug-surface.mjs'
import {
  BOOTSTRAP_GRAPH, BUILD_THEN_MAINTAIN_GRAPH, C1_OPS, E1, E2, E3, ROUTE_LIB,
  clockEnv, envelopeProblem, fileStatRoute, legacyStoreFixture, makePusher, makeWorkspace,
  missingOpProblem, opMissing, readRoute, routeAbs, writeLegacy, ROUTE_PATHS,
} from '../support/route-surface.mjs'

before(() => {
  preflight()
})

const NOW = '2026-11-01T12:00:00+08:00'
const okOf = (label, res) => envelopeProblem(label, res, 'ok')

/** 一条在途实现任务（活会话；停不下来就是它）。 */
const LIVE_TASK = { id: 'T-live', stage_id: 'stage-build', title: '在途实现', status: 'in_progress', five_gate_state: '实现', kind: 'implement', session_ref: 'sess-live-1', heartbeat: '2026-11-01T11:55:00+08:00' }

test('LED-04 C1d：暂停必须停会话 · maintain 不许暂停 · 扩大/另开 · resume · pause set 读 live+archived · 切阶段先停会话', () => {
  return runCase('LED-04', async (rec) => {
    const problems = []
    const push = makePusher(problems)
    /**
     * 每一段**实测**读数（gate4 复审 BC-04 ③：`readings` 里不许写手打出来的 `true`）。
     * 取值点就在下面各自的格子里；没走到的那一格留 `null`（"判不了"与"判过了"长得不一样）。
     */
    const facts = {
      pause_refusal_code: null, pause_refused_zero_write: null, pause_mode_after_refusal: null,
      maintain_pause_code: null,
      extended_pause_id_same: null, new_set: null,
      resume_task: null, resume_open_left: null,
      pause_set_resolved: null,
      stage_enter_refusal_code: null,
    }

    const lib = await loadStagedModule(ROUTE_LIB, ['pauseSetOf', 'pauseEntriesVerdict', 'modeOf'])
    if (lib.surfaceMissing || lib.missing.length > 0) {
      push('C1-SURFACE-MISSING', `\`${ROUTE_LIB}\` 缺：${lib.missing.join(' / ') || '(整个文件不在)'}（契约 §9.2）`)
    }
    const hasPauseSet = !lib.surfaceMissing && typeof lib.mod.pauseSetOf === 'function'
    const hasPauseEntries = !lib.surfaceMissing && typeof lib.mod.pauseEntriesVerdict === 'function'

    // ── A · 暂停 = 停会话 + 记一条决定 ────────────────────────────────────────
    const ws = makeWorkspace('led04', 'pause')
    const { env } = clockEnv(ws, NOW)
    writeLegacy(ws, legacyStoreFixture({ tickets: [] }))
    const boot = runRoute('LED-04', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: ws, env })
    if (opMissing(boot)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, boot).message)
    } else if (boot.exit_code !== 0) {
      push('C1-PAUSE-SETUP', `前置不成立：bootstrap 必须能落，实得 exit=${boot.exit_code} / ${boot.json?.error?.code}`)
    } else {
      const addTask = runRoute('LED-04', 'task-set', { tasks: [LIVE_TASK], current_task_id: 'T-live' }, { workspace: ws, env })
      if (okOf('task-set（在途实现任务）', addTask) !== null) {
        push('C1-PAUSE-TASK-SETUP', `前置不成立：在途实现任务必须能落（${okOf('task-set（在途实现任务）', addTask)}）`)
      }
      const shaBeforeRefuse = fileStatRoute(routeAbs(ws, ROUTE_PATHS.current)).sha256
      const refused = runRoute('LED-04', C1_OPS.routeMark, { mark: 'pause', reason: '一条够线的 bug 打断实现', entry_ids: [E1], by: 'leader', version: readRoute(ws)?.version }, { workspace: ws, env })
      if (opMissing(refused)) {
        push('C1-OP-MISSING', missingOpProblem(C1_OPS.routeMark, refused).message)
      } else {
        facts.pause_refusal_code = refused.json?.error?.code ?? null
        const bad = envelopeProblem('pause（有活会话、没声明停）', refused, 'E_PAUSE_SESSION_LIVE')
        if (bad !== null) push('C1-PAUSE-SESSION-LIVE', `${bad} —— 定形 §3.3：暂停必须停会话；**停不下来 ⇒ 暂停失败**（不锁死、不静默放行）`)
        facts.pause_refused_zero_write = fileStatRoute(routeAbs(ws, ROUTE_PATHS.current)).sha256 === shaBeforeRefuse
        if (facts.pause_refused_zero_write !== true) push('C1-PAUSE-REFUSED-WROTE', '暂停失败时**零写入**（current.json 的 sha256 前后相同）')
        const readAfter = runRoute('LED-04', 'read', {}, { workspace: ws, env })
        if (readAfter.exit_code === 0) {
          facts.pause_mode_after_refusal = readAfter.json?.mode ?? null
          if (readAfter.json?.mode !== 'build') push('C1-PAUSE-FAILED-MODE', `暂停失败之后 mode 必须还是 build（不许静默进 build-paused），实得 ${JSON.stringify(readAfter.json?.mode)}`)
        }
      }

      // 声明"这个会话已经停了"⇒ 收；任务写 exit、标 paused，ref **不清**。
      const sessions = [{ task_id: 'T-live', session_id: 'sess-live-1', at: NOW }]
      const pause = runRoute('LED-04', C1_OPS.routeMark, { mark: 'pause', reason: '一条够线的 bug 打断实现', entry_ids: [E1], by: 'leader', sessions, version: readRoute(ws)?.version }, { workspace: ws, env })
      const badPause = okOf('pause（已停会话）', pause)
      if (badPause !== null) {
        push('C1-PAUSE', `${badPause} —— 停会话之后暂停必须能落`)
      } else {
        const route = readRoute(ws)
        const pauses = route?.pauses ?? []
        if (pauses.length !== 1) push('C1-PAUSE-RECORD', `一次暂停必须留一条 \`pauses\` 记录，实得 ${pauses.length} 条`)
        const p = pauses[0] ?? {}
        if (p.state !== 'open') push('C1-PAUSE-STATE', `暂停记录的状态必须是 open，实得 ${JSON.stringify(p.state)}`)
        if (p.by !== 'leader') push('C1-PAUSE-BY', `暂停的"谁拍的"必须是 leader（定形 §3.3：停会话 = 组长执行），实得 ${JSON.stringify(p.by)}`)
        if (typeof p.reason !== 'string' || p.reason.trim() === '') push('C1-PAUSE-REASON', '暂停必须写理由（没有理由的暂停没法复核）')
        if (p.opened_at !== NOW) push('C1-PAUSE-AT', `暂停记录的时刻必须取注入时钟那一刻（${NOW}），实得 ${JSON.stringify(p.opened_at)}`)
        if (JSON.stringify(p.entry_ids) !== JSON.stringify([E1])) push('C1-PAUSE-ENTRIES', `暂停记录要绑 entry id 集合（触发条），期望 ["${E1}"]，实得 ${JSON.stringify(p.entry_ids)}`)
        if ((route?.transitions ?? []).length !== 0) push('C1-PAUSE-NOT-A-TRANSITION', '暂停/恢复**不改阶段**：`transitions` 不许出现（那是 `stage-enter` 的地盘）')
        const task = (route?.tasks ?? []).find((t) => t.id === 'T-live') ?? {}
        if (task.session_exit !== NOW) push('C1-PAUSE-EXIT', `暂停必须给在途实现任务写 \`session_exit\`（${NOW}），实得 ${JSON.stringify(task.session_exit)}`)
        if (task.session_ref !== 'sess-live-1') push('C1-PAUSE-REF-KEPT', `停会话**不清** \`session_ref\`（定形 §3.3 原话），实得 ${JSON.stringify(task.session_ref)}`)
        if (task.status !== 'paused') push('C1-PAUSE-TASK-STATUS', `在途实现任务必须标 paused，实得 ${JSON.stringify(task.status)}`)
        const read = runRoute('LED-04', 'read', {}, { workspace: ws, env })
        if (read.exit_code === 0) {
          if (read.json?.mode !== 'build-paused') push('C1-PAUSE-MODE', `暂停之后 \`read.mode\` 必须是 build-paused，实得 ${JSON.stringify(read.json?.mode)}`)
          if (read.json?.slot?.state === 'busy') push('C1-PAUSE-SLOT-FREE', `停完会话的 paused 任务必须 free（\`paused + session_exit\` = free），实得 ${JSON.stringify(read.json?.slot)}`)
        }
        if (lib.surfaceMissing === false && typeof lib.mod.modeOf === 'function' && lib.mod.modeOf(route) !== 'build-paused') {
          push('C1-PAUSE-MODE-PURE', `\`modeOf(暂停中的账本)\` 必须是 build-paused，实得 ${JSON.stringify(lib.mod.modeOf(route))}`)
        }
      }
    }

    // ── B · maintain 不支持暂停 ───────────────────────────────────────────────
    const wsM = makeWorkspace('led04', 'maintain')
    const { env: envM } = clockEnv(wsM, NOW)
    writeLegacy(wsM, legacyStoreFixture({ tickets: [] }))
    const bootM = runRoute('LED-04', C1_OPS.bootstrap, { ...BUILD_THEN_MAINTAIN_GRAPH, current_stage_id: 'stage-maintain' }, { workspace: wsM, env: envM })
    if (opMissing(bootM)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootM).message)
    } else if (bootM.exit_code === 0) {
      const sha = fileStatRoute(routeAbs(wsM, ROUTE_PATHS.current)).sha256
      const badPause = runRoute('LED-04', C1_OPS.routeMark, { mark: 'pause', reason: '维护期想暂停', entry_ids: [E1], by: 'leader', version: readRoute(wsM)?.version }, { workspace: wsM, env: envM })
      const bad = envelopeProblem('pause（maintain）', badPause, 'E_PAUSE_NOT_SUPPORTED')
      facts.maintain_pause_code = badPause.json?.error?.code ?? null
      if (bad !== null) push('C1-PAUSE-MAINTAIN', `${bad} —— 定形 §2.3：「\`maintain\` 不支持暂停（\`(maintain, pause)\` **拒，不静默忽略**）」`)
      if (fileStatRoute(routeAbs(wsM, ROUTE_PATHS.current)).sha256 !== sha) push('C1-PAUSE-MAINTAIN-WROTE', 'maintain 下的暂停被拒时**零写入**')
      const read = runRoute('LED-04', 'read', {}, { workspace: wsM, env: envM })
      if (read.exit_code === 0 && read.json?.mode !== 'maintain') push('C1-PAUSE-MAINTAIN-MODE', `维护段的 mode 必须是 maintain，实得 ${JSON.stringify(read.json?.mode)}`)
    } else {
      push('C1-PAUSE-MAINTAIN-SETUP', `前置不成立：直建 maintain 必须能落（exit=${bootM.exit_code} / ${bootM.json?.error?.code}）`)
    }

    // ── C · 扩大 vs 另开（+ 旧 set 关闭不自动 free 在途修任务）──────────────────
    const wsC = makeWorkspace('led04', 'extend-newset')
    const { env: envC } = clockEnv(wsC, NOW)
    writeLegacy(wsC, legacyStoreFixture({ tickets: [] }))
    writeLedger(wsC, ledgerFixture({ entries: [bugEntry(E1, '2026-10-31T09:00:00+08:00'), bugEntry(E2, '2026-10-31T09:01:00+08:00'), bugEntry(E3, '2026-10-31T09:02:00+08:00')] }))
    const bootC = runRoute('LED-04', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsC, env: envC })
    if (opMissing(bootC)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootC).message)
    } else if (bootC.exit_code === 0) {
      // 🔴 gate4 复审 BC-04 ②：这里先挂一条**真在途**的实现任务，再用「声明停会话」的暂停把它停下。
      //    原来 wsC 里一条路线任务都没有，下面 D 段那句「resume 不顺手改任务」是**空转**的
      //    （`task !== undefined` 的守卫让它从不观察任何任务）。现在它有一条真的 `paused` 任务可看。
      const addLive = runRoute('LED-04', 'task-set', { tasks: [LIVE_TASK], current_task_id: 'T-live', version: readRoute(wsC)?.version }, { workspace: wsC, env: envC })
      if (okOf('task-set（wsC 的在途实现任务）', addLive) !== null) {
        push('C1-EXTEND-LIVE-SETUP', `前置不成立：wsC 的在途实现任务必须能落（${okOf('task-set（wsC 的在途实现任务）', addLive)}）`)
      }
      const p1 = runRoute('LED-04', C1_OPS.routeMark, {
        mark: 'pause', reason: '第一条够线的 bug', entry_ids: [E1], by: 'leader',
        sessions: [{ task_id: 'T-live', session_id: 'sess-live-1', at: NOW }],
        version: readRoute(wsC)?.version,
      }, { workspace: wsC, env: envC })
      if (okOf('pause（第一条）', p1) !== null) push('C1-EXTEND-SETUP', `前置不成立：第一条暂停必须能落（${okOf('pause（第一条）', p1)}）`)
      const id1 = readRoute(wsC)?.pauses?.[0]?.pause_id ?? null
      const p2 = runRoute('LED-04', C1_OPS.routeMark, { mark: 'pause', reason: '老板扩大范围到第二条', entry_ids: [E2], by: 'leader', version: readRoute(wsC)?.version }, { workspace: wsC, env: envC })
      const badP2 = okOf('pause（扩大）', p2)
      if (badP2 !== null) {
        push('C1-EXTEND', `${badP2} —— 「扩大 = 同一个 pause set 加 entry」（定形 §4.1）`)
      } else {
        const pauses = readRoute(wsC)?.pauses ?? []
        facts.extended_pause_id_same = pauses[0]?.pause_id === id1
        if (pauses.length !== 1) push('C1-EXTEND-COUNT', `扩大**不是**新开一条：open 的 set 仍应只有 1 条，实得 ${pauses.length} 条`)
        if (pauses[0]?.pause_id !== id1) push('C1-EXTEND-ID', `扩大必须沿用同一个 \`pause_id\`（期望 ${JSON.stringify(id1)}，实得 ${JSON.stringify(pauses[0]?.pause_id)}）`)
        if (JSON.stringify([...(pauses[0]?.entry_ids ?? [])].sort()) !== JSON.stringify([E1, E2].sort())) {
          push('C1-EXTEND-ENTRIES', `扩大之后集合必须是并集 ${JSON.stringify([E1, E2])}，实得 ${JSON.stringify(pauses[0]?.entry_ids)}`)
        }
      }
      // 在途修任务（住在 **bug 台账**）照旧占槽：pause --new_set 不许碰它。
      const bugLedger = readLedger(wsC)
      bugLedger.tasks = [{
        id: 'bugtask-1', title: '修 E1 的根因', status: 'in_progress', five_gate_state: '实现',
        batch: null, entry_ids: [E1], root_cause: '夹具', session_ref: 'sess-bug-1', heartbeat: '2026-11-01T11:58:00+08:00',
      }]
      writeLedger(wsC, bugLedger)
      const p3 = runRoute('LED-04', C1_OPS.routeMark, { mark: 'pause', reason: '另开一个 set（第二条线）', entry_ids: [E3], by: 'leader', new_set: true, version: readRoute(wsC)?.version }, { workspace: wsC, env: envC })
      const badP3 = okOf('pause（另开）', p3)
      if (badP3 !== null) {
        push('C1-NEWSET', `${badP3} —— 「另开 = 新 pause set，旧 set 关闭」（定形 §4.1）`)
      } else {
        const pauses = readRoute(wsC)?.pauses ?? []
        const open = pauses.filter((p) => p.state === 'open')
        const closed = pauses.filter((p) => p.state === 'closed')
        facts.new_set = { open: open.length, closed: closed.length }
        if (open.length !== 1) push('C1-NEWSET-OPEN', `另开之后只许有 1 条 open 的 set，实得 ${open.length}`)
        if (closed.length !== 1) push('C1-NEWSET-CLOSED', `旧 set 必须被关掉（state=closed + closed_at），实得 ${closed.length} 条 closed`)
        if (closed[0]?.pause_id === open[0]?.pause_id) push('C1-NEWSET-ID', '另开必须换一个 `pause_id`（同一 id 就还是扩大）')
        if (typeof closed[0]?.closed_at !== 'string' || closed[0].closed_at === '') push('C1-NEWSET-CLOSED-AT', '旧 set 关闭必须记 closed_at')
        if (JSON.stringify(open[0]?.entry_ids) !== JSON.stringify([E3])) push('C1-NEWSET-ENTRIES', `新的 set 只带它自己的 entry（[${E3}]），实得 ${JSON.stringify(open[0]?.entry_ids)}`)
        // 旧 set 关闭 ⇒ 在途修任务照旧占槽、不自动 free。
        const route = readRoute(wsC)
        const read = runRoute('LED-04', 'read', {}, { workspace: wsC, env: envC })
        if (read.exit_code === 0) {
          if (read.json?.slot?.state !== 'busy') push('C1-NEWSET-SLOT', `旧 set 关闭**不自动 free 在途修任务**（它照旧占槽）⇒ \`read.slot.state\` 必须是 busy，实得 ${JSON.stringify(read.json?.slot)}`)
          if (read.json?.slot?.allow !== false) push('C1-NEWSET-SLOT-ALLOW', '在途修任务占着槽 ⇒ 别的写者必须被拒')
        }
        const pausedRefs = (route?.tasks ?? []).filter((t) => t.status === 'paused')
        if (pausedRefs.some((t) => t.id === 'bugtask-1')) push('C1-NEWSET-TOUCHED-BUGTASK', 'pause 不许去改 bug 台账里的任务（两本账不互串：route-mark 只写路线）')
        if ((readLedger(wsC)?.tasks ?? [])[0]?.status !== 'in_progress') push('C1-NEWSET-BUGTASK', '旧 set 关闭之后 bug 台账里那条在途修任务必须原样（status=in_progress）')
      }
      // D · resume
      const beforeResume = readRoute(wsC)
      const resume = runRoute('LED-04', C1_OPS.routeMark, { mark: 'resume', reason: '修完了，回实现期', by: 'leader', version: beforeResume?.version }, { workspace: wsC, env: envC })
      const badResume = okOf('resume', resume)
      if (badResume !== null) {
        push('C1-RESUME', `${badResume} —— 恢复重开会话、重验当前关；账本这一侧至少要能把 open 的 set 关掉`)
      } else {
        const route = readRoute(wsC)
        const openLeft = (route?.pauses ?? []).filter((p) => p.state === 'open').length
        facts.resume_open_left = openLeft
        if (openLeft > 0) push('C1-RESUME-OPEN-LEFT', 'resume 之后不许再有 open 的 pause set')
        const read = runRoute('LED-04', 'read', {}, { workspace: wsC, env: envC })
        if (read.exit_code === 0 && read.json?.mode !== 'build') push('C1-RESUME-MODE', `resume 之后 mode 必须回 build，实得 ${JSON.stringify(read.json?.mode)}`)
        // 不顺手改任务状态（第二作者）：paused 的那个任务还在，ref 还在。
        // 🔴 这一段**必须观察到一条真任务**（BC-04 ②）：所以"找不到"本身就算不成立，不再用 `task !== undefined` 放行。
        const task = (route?.tasks ?? []).find((t) => t.id === 'T-live') ?? null
        facts.resume_task = task === null ? null : { status: task.status, session_ref: task.session_ref ?? null, session_exit: task.session_exit ?? null }
        if (task === null) {
          push('C1-RESUME-TASK-OBSERVED', 'resume 这一格要观察的那条在途任务不在路线任务段里（`T-live`）—— 没有样本时这一格证明不了"resume 不顺手动任务"')
        } else if (task.status !== 'paused' || task.session_ref !== 'sess-live-1') {
          push('C1-RESUME-TOUCHED-TASK', `resume 不许顺手改任务状态（那是第二作者）；期望 paused + ref 不变，实得 ${JSON.stringify({ status: task.status, session_ref: task.session_ref })}`)
        }
        const again = runRoute('LED-04', C1_OPS.routeMark, { mark: 'resume', reason: '再恢复一次', by: 'leader', version: readRoute(wsC)?.version }, { workspace: wsC, env: envC })
        if (!opMissing(again)) {
          const bad = envelopeProblem('resume（本来就没暂停）', again, 'E_RESUME_NOT_PAUSED')
          if (bad !== null) push('C1-RESUME-NOT-PAUSED', `${bad} —— 不在 build-paused 时 resume 要明确拒（不许静默成功）`)
        }
      }
    } else {
      push('C1-EXTEND-SETUP-BOOT', `前置不成立：bootstrap 必须能落（exit=${bootC.exit_code}）`)
    }

    // ── E · pause set 解析：只认 open；条目 live + archived 两段都查 ─────────────
    const pauses = [
      { pause_id: 'p1', state: 'open', entry_ids: [E1, E2], by: 'leader' },
      { pause_id: 'p0', state: 'closed', entry_ids: [E3], by: 'leader' },
    ]
    if (hasPauseSet) {
      const got = lib.mod.pauseSetOf(pauses)
      const ids = [...(got?.entry_ids ?? [])].sort()
      if (JSON.stringify(ids) !== JSON.stringify([E1, E2].sort())) {
        push('C1-PAUSE-SET', `\`pauseSetOf\` 只认 **open** 的 set（closed 的不算）：期望 ${JSON.stringify([E1, E2])}，实得 ${JSON.stringify(got)}`)
      }
      if (JSON.stringify((got?.open_pause_ids ?? []).sort()) !== JSON.stringify(['p1'])) push('C1-PAUSE-SET-OPEN', `\`open_pause_ids\` 必须是 open 的那些，实得 ${JSON.stringify(got?.open_pause_ids)}`)
    }
    if (hasPauseEntries) {
      const ledger = ledgerFixture({
        entries: [bugEntry(E1, '2026-10-31T09:00:00+08:00')],
        archived: [{ ...bugEntry(E2, '2026-10-31T09:01:00+08:00'), disposition: { value: 'adopted', reason: '同根因', by: 'leader', at: '2026-11-01T10:00:00+08:00' }, archived_at: '2026-11-01T10:00:00+08:00' }],
      })
      const two = lib.mod.pauseEntriesVerdict({ pause_entry_ids: [E1, E2], ledger })
      if (two?.ok !== true) push('C1-PAUSE-RESOLVE', `pause set 里的一条在 live、一条已归档 ⇒ 两条都解得出（**live + archived 两段都查**），实得 ${JSON.stringify(two)}`)
      if (JSON.stringify([...(two?.resolved ?? [])].sort()) !== JSON.stringify([E1, E2].sort())) push('C1-PAUSE-RESOLVE-IDS', `解析出来的 id 必须是 ${JSON.stringify([E1, E2])}，实得 ${JSON.stringify(two?.resolved)}`)
      const missing = lib.mod.pauseEntriesVerdict({ pause_entry_ids: [E1, E3], ledger })
      facts.pause_set_resolved = { live_and_archived: two?.ok === true, missing_named: missing?.missing ?? null }
      if (missing?.ok !== false) push('C1-PAUSE-RESOLVE-MISSING', `两段都找不到的 id 必须判不成立（卡片上要能红），实得 ${JSON.stringify(missing)}`)
      if (JSON.stringify(missing?.missing ?? []) !== JSON.stringify([E3])) push('C1-PAUSE-RESOLVE-NAMES', `判不成立时必须**点名**那个 id，实得 ${JSON.stringify(missing?.missing)}`)
    }

    // ── F · 切阶段要先停会话 ──────────────────────────────────────────────────
    const wsF = makeWorkspace('led04', 'stage-sessions')
    const { env: envF } = clockEnv(wsF, NOW)
    writeLegacy(wsF, legacyStoreFixture({ tickets: [] }))
    const bootF = runRoute('LED-04', C1_OPS.bootstrap, { ...BUILD_THEN_MAINTAIN_GRAPH }, { workspace: wsF, env: envF })
    if (opMissing(bootF)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootF).message)
    } else if (bootF.exit_code === 0) {
      const liveInBuild = { ...LIVE_TASK, stage_id: 'stage-build' }
      const add = runRoute('LED-04', 'task-set', { tasks: [liveInBuild], current_task_id: 'T-live' }, { workspace: wsF, env: envF })
      if (okOf('task-set（在途）', add) !== null) push('C1-STAGE-SESSION-SETUP', `前置不成立：在途实现任务必须能落（${okOf('task-set（在途）', add)}）`)
      const sha = fileStatRoute(routeAbs(wsF, ROUTE_PATHS.current)).sha256
      const refuse = runRoute('LED-04', 'stage-enter', { from: 'stage-build', to: 'stage-maintain', exit_criteria_met: [], version: readRoute(wsF)?.version }, { workspace: wsF, env: envF })
      if (opMissing(refuse)) {
        push('C1-OP-MISSING', missingOpProblem('stage-enter', refuse).message)
      } else {
        facts.stage_enter_refusal_code = refuse.json?.error?.code ?? null
        const bad = envelopeProblem('stage-enter（有活会话、没声明停）', refuse, 'E_STAGE_SESSION_LIVE')
        if (bad !== null) push('C1-STAGE-SESSION-LIVE', `${bad} —— 定形 §4.9：先停会话、在途实现任务标 paused，再 stage-enter；**停会话失败 ⇒ 切阶段失败**（不静默过去）`)
        if (fileStatRoute(routeAbs(wsF, ROUTE_PATHS.current)).sha256 !== sha) push('C1-STAGE-SESSION-ZERO-WRITE', '切阶段失败时**零写入**')
      }
      const ok = runRoute('LED-04', 'stage-enter', {
        from: 'stage-build', to: 'stage-maintain', exit_criteria_met: [],
        sessions: [{ task_id: 'T-live', session_id: 'sess-live-1', at: NOW }],
        version: readRoute(wsF)?.version,
      }, { workspace: wsF, env: envF })
      const badOk = okOf('stage-enter（已停会话）', ok)
      if (badOk !== null) {
        push('C1-STAGE-SESSION-OK', `${badOk} —— 声明停会话之后切阶段必须能过`)
      } else {
        const route = readRoute(wsF)
        const task = (route?.tasks ?? []).find((t) => t.id === 'T-live') ?? {}
        if (task.status !== 'paused') push('C1-STAGE-ENTER-PAUSES', `切阶段时在途实现任务必须标 paused，实得 ${JSON.stringify(task.status)}`)
        if (task.session_exit !== NOW) push('C1-STAGE-ENTER-EXIT', `切阶段时在途实现任务必须写 \`session_exit\`（${NOW}），实得 ${JSON.stringify(task.session_exit)}`)
        if (task.session_ref !== 'sess-live-1') push('C1-STAGE-ENTER-REF', `写 \`session_exit\` **不清** \`session_ref\`，实得 ${JSON.stringify(task.session_ref)}`)
        const read = runRoute('LED-04', 'read', {}, { workspace: wsF, env: envF })
        if (read.exit_code === 0 && read.json?.mode !== 'maintain') push('C1-STAGE-ENTER-MODE', `切到 maintain 段之后 mode 必须是 maintain，实得 ${JSON.stringify(read.json?.mode)}`)
      }
    } else {
      push('C1-STAGE-SESSION-SETUP-BOOT', `前置不成立：bootstrap 必须能落（exit=${bootF.exit_code}）`)
    }

    rec.readings.led04 = {
      // 🔴 每一格都是上面跑出来的事实（不是手打的 true）：没走到的那一格是 null。
      pause_requires_stopped_sessions: {
        refusal_code: facts.pause_refusal_code,
        refused_zero_write: facts.pause_refused_zero_write,
        mode_after_refusal: facts.pause_mode_after_refusal,
      },
      maintain_pause_code: facts.maintain_pause_code,
      extend_vs_new_set: { same_pause_id: facts.extended_pause_id_same, new_set: facts.new_set },
      resume: { open_sets_left: facts.resume_open_left, task: facts.resume_task },
      pause_set_resolved: facts.pause_set_resolved,
      stage_enter_refusal_code: facts.stage_enter_refusal_code,
    }
    caseFail(problems)
  })
})
