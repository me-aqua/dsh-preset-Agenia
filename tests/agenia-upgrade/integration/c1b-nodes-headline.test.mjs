/**
 * `LED-02` · **C1b —— 节点留痕 + headline + 建账之后的第一行**（任务 C1 的第 2 关红测试）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）
 *   §3.2（**节点 = 路线 stage 的 `stage-enter` / `route-mark` 事件**；卡上路线格第一行 = 目标 · 大阶段名；
 *   **headline 空 = 第一行印「（目标未填）」+ 红条**；**第一行只随 `stage-enter` 或 headline 补齐而变**）
 *   · §2.3 的 t0 三态（「路线在、票在、**headline 空**」那一行）· §3.4（票状态 = 投影；这一格只判 headline / 节点）
 *   · §6.2 的「路线格」行（**未建账只印未建账；headline 空印（目标未填）+ 红条；暂停 = 第二行徽标**）。
 * 实施附注 `.team/leader/2026-10-31/实施附注-拆账并员通电.md` §4：
 *   **`headline = <goal.title> · <stage.name>`**；`summarize` 新增 `headline` 字段（**不动 RT-08 的首行常量**）；
 *   **唯一载体 = `headline` 字段，卡片只读它**；节点 × op：开工 / 交活 / 验收 = `task-set` 的
 *   **审计 `detail.node`**（**`node` 只在审计 detail，不是任务字段**），切阶段 = `stage-enter`，
 *   **收工不落 route，只落 `log.md`**。
 * 契约：`.team/test/CONTRACT-C1.md` §5 / §6。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守五件事：
 * `A` **建账就带第一行**：`init` / `bootstrap` 之后 `headline` 就在账上（stored = derived，一个真相）。
 * `B` **三个落 route 的节点**：`task-set` 的 `node ∈ {open, handoff, accept}` 只进**审计 detail**；
 *     任务对象上**不许**出现 `node`；`close`（收工）与任意怪值都拒。
 * `C` **切阶段改第一行**：`stage-enter` 之后 stored 换成新阶段名、`stale:false`；
 *     **RT-08 的首行常量一格不动**；`summarize` 的 `headline` 字段是 C2 的接缝。
 * `D` **headline 空是一个真实形态**（C1 之前建的老账本）：空 ⇒ `read.headline.empty:true`、
 *     `task-set` 的**实现任务被拒**（`E_ADMIT_HEADLINE`）+ **零写入**；任务照样 0 个。
 * `E` **补齐**：`headline-set` 把 stored 重新算成 derived（**不接受调用方自带一行字** ——
 *     那会变成第二个真相）；补齐之后同一发 `task-set` 就收。
 *
 * ── 现在为什么红、红在哪（第 2 关，功能未做）────────────────────────────────────
 * · `--op headline-set` 不存在 ⇒ E 段红（`C1-OP-MISSING`）；
 * · `lib/route.mjs` 没有 `headlineOf` / `NODE_MARKS` ⇒ 纯函数那几格红（`C1-SURFACE-MISSING`）；
 * · `task-set` 还不认识 `node`、`read` 还没有 `headline` 块、`summarize` 还没有 `headline` 字段
 *   ⇒ A/B/C/D 段各红在自己的码上（都点名"缺哪一格"）。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, preflight, runCase } from '../support/evidence.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import {
  BOOTSTRAP_GRAPH, BOOTSTRAP_HEADLINE, BUILD_THEN_MAINTAIN_GRAPH, C1_OPS, NODE_MARKS,
  ROUTE_LIB, ROUTE_PATHS, clockEnv, envelopeProblem, fileStatRoute, legacyStoreFixture,
  makePusher, makeWorkspace, missingOpProblem, opMissing, readAudit, readRoute, routeAbs, writeLegacy,
} from '../support/route-surface.mjs'

before(() => {
  preflight()
})

const NOW = '2026-11-01T12:00:00+08:00'
const okOf = (label, res) => envelopeProblem(label, res, 'ok')

/**
 * 老账本（C1 之前的 `init` 写的形状：没有 `headline` 字段，审计链一条 `init`）。
 *
 * 🔴 这不是"手改一份合法账本"，是**复刻旧写者的输出**：`current.json` 的字节 + 一条
 *    `prev_sha256:null → next_sha256:<那份字节的 sha256>` 的审计记录。C1 之前的 `init`
 *    落盘的就是这两样（`commitRoute` 的顺序：先算字节 → 原子写 → 用同一份字节追加审计）。
 *    别的老工作区升上来就是这个形态 —— 定形 §2.3 的 t0 第三行正是指它。
 */
function writeLegacyRoute(workspace, { goal, stages, current_stage_id: currentStageId, tickets = [] }) {
  const current = {
    schema: 1,
    goal,
    stages: stages.map((s) => ({ ...s, state: s.id === currentStageId ? 'current' : 'future' })),
    current_stage_id: currentStageId,
    tasks: [],
    current_task_id: null,
    tickets,
    transitions: [],
    version: 1,
    created_at: NOW,
    updated_at: NOW,
  }
  const text = `${JSON.stringify(current, null, 2)}\n`
  const sha = createHash('sha256').update(text, 'utf8').digest('hex')
  const audit = {
    schema: 1, seq: 1, at: NOW, op: 'init', kind: 'init', writer: 'agenia-route',
    session_id: null, version: 1, prev_sha256: null, next_sha256: sha, detail: {},
  }
  const currentFile = routeAbs(workspace, ROUTE_PATHS.current)
  const auditFile = routeAbs(workspace, ROUTE_PATHS.audit)
  mkdirSync(path.dirname(currentFile), { recursive: true })
  writeFileSync(currentFile, text, 'utf8')
  writeFileSync(auditFile, `${JSON.stringify(audit)}\n`, 'utf8')
  return { currentFile, auditFile, sha }
}

test('LED-02 C1b：三节点只进审计 detail + headline 唯一载体 + 空 headline 拒实现任务 + 补齐', () => {
  return runCase('LED-02', async (rec) => {
    const problems = []
    const push = makePusher(problems)

    const lib = await loadStagedModule(ROUTE_LIB, ['headlineOf', 'NODE_MARKS'])
    if (lib.surfaceMissing || lib.missing.length > 0) {
      push('C1-SURFACE-MISSING', `\`${ROUTE_LIB}\` 缺：${lib.missing.join(' / ') || '(整个文件不在)'}（契约 §9.2）`)
    }
    const hasHeadlineOf = !lib.surfaceMissing && typeof lib.mod.headlineOf === 'function'
    if (!lib.surfaceMissing && lib.mod.NODE_MARKS !== undefined
      && JSON.stringify(lib.mod.NODE_MARKS) !== JSON.stringify(NODE_MARKS)) {
      push('C1-NODE-MARKS', `\`NODE_MARKS\` 必须恰是 ${JSON.stringify(NODE_MARKS)}（收工不在其中），实得 ${JSON.stringify(lib.mod.NODE_MARKS)}`)
    }

    // ── A · 建账就带第一行（init 与 bootstrap 都要写）──────────────────────────
    for (const [label, op, payload] of [
      ['init', 'init', { ...BOOTSTRAP_GRAPH }],
      ['bootstrap', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }],
    ]) {
      const ws = makeWorkspace('led02', `headline-${label}`)
      const { env } = clockEnv(ws, NOW)
      if (op === C1_OPS.bootstrap) writeLegacy(ws, legacyStoreFixture({ tickets: [] }))
      const res = runRoute('LED-02', op, payload, { workspace: ws, env })
      if (opMissing(res)) {
        push('C1-OP-MISSING', missingOpProblem(op, res).message)
        continue
      }
      const bad = okOf(`${label}`, res)
      if (bad !== null) {
        push('C1-HEADLINE-WRITE', `${bad} —— 新账本必须带第一行（headline = 目标 · 大阶段名）`)
        continue
      }
      const route = readRoute(ws)
      if (route?.headline !== BOOTSTRAP_HEADLINE) {
        push('C1-HEADLINE-WRITE', `${label} 之后 \`headline\` 必须是「${BOOTSTRAP_HEADLINE}」，实得 ${JSON.stringify(route?.headline)}`)
      }
      const read = runRoute('LED-02', 'read', {}, { workspace: ws, env })
      if (read.exit_code === 0) {
        const h = read.json?.headline ?? null
        if (h?.stored !== BOOTSTRAP_HEADLINE || h?.derived !== BOOTSTRAP_HEADLINE) push('C1-HEADLINE-READ', `${label}：\`read.headline\` 的 stored / derived 都必须是「${BOOTSTRAP_HEADLINE}」，实得 ${JSON.stringify(h)}`)
        if (h?.empty !== false) push('C1-HEADLINE-READ-EMPTY', `${label}：有第一行的账本 \`headline.empty\` 必须是 false，实得 ${JSON.stringify(h?.empty)}`)
        if (h?.stale !== false) push('C1-HEADLINE-READ-STALE', `${label}：stored 与 derived 必须同值，实得 ${JSON.stringify(h)}`)
      }
      if (hasHeadlineOf) {
        const pure = lib.mod.headlineOf(route)
        if (pure?.stored !== BOOTSTRAP_HEADLINE || pure?.empty !== false) push('C1-HEADLINE-PURE', `\`headlineOf(账本)\` 必须是 {stored:「${BOOTSTRAP_HEADLINE}」, empty:false}，实得 ${JSON.stringify(pure)}`)
        if (pure?.derived !== BOOTSTRAP_HEADLINE) push('C1-HEADLINE-DERIVED', `\`headlineOf\` 的 derived 必须是「目标 · 大阶段名」=「${BOOTSTRAP_HEADLINE}」，实得 ${JSON.stringify(pure?.derived)}`)
      }
    }

    // ── B · 三个落 route 的节点：只进审计 detail ───────────────────────────────
    const wsB = makeWorkspace('led02', 'nodes')
    const { env: envB } = clockEnv(wsB, NOW)
    writeLegacy(wsB, legacyStoreFixture({ tickets: [] }))
    const bootB = runRoute('LED-02', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsB, env: envB })
    if (opMissing(bootB)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootB).message)
    } else if (bootB.exit_code !== 0) {
      push('C1-NODES-SETUP', `前置不成立：bootstrap 必须能落，实得 exit=${bootB.exit_code} / ${bootB.json?.error?.code}`)
    } else {
      const taskBase = { id: 'T-nodes', stage_id: 'stage-build', title: '节点留痕', status: 'in_progress', five_gate_state: '实现' }
      const nodes = ['open', 'handoff', 'accept']
      for (const node of nodes) {
        const before = readAudit(wsB).length
        const res = runRoute('LED-02', 'task-set', { tasks: [taskBase], current_task_id: 'T-nodes', node, version: bootB.json?.version }, { workspace: wsB, env: envB })
        if (opMissing(res)) {
          push('C1-OP-MISSING', missingOpProblem('task-set', res).message)
          break
        }
        const bad = okOf(`task-set（node=${node}）`, res)
        if (bad !== null) {
          push('C1-NODE-WRITE', `${bad} —— 五个真实节点里落 route 的三个：${NODE_MARKS.join(' / ')}`)
          continue
        }
        const audit = readAudit(wsB)
        if (audit.length !== before + 1) push('C1-NODE-AUDIT-COUNT', `task-set（node=${node}）必须恰好追加一条审计，实得 ${audit.length - before} 条`)
        const tail = audit[audit.length - 1] ?? {}
        if (tail.detail?.node !== node) push('C1-NODE-AUDIT-DETAIL', `节点必须落在**审计** \`detail.node\`（实施附注 §4），期望 ${JSON.stringify(node)}，实得 ${JSON.stringify(tail.detail)}`)
        const route = readRoute(wsB)
        const task = (route?.tasks ?? []).find((t) => t.id === 'T-nodes')
        if (task === undefined) {
          push('C1-NODE-TASK-MISSING', `task-set（node=${node}）之后账上没有 T-nodes`)
        } else if ('node' in task) {
          push('C1-NODE-IS-NOT-A-TASK-FIELD', `\`node\` 不是任务字段（实施附注 §4）：任务上出现了 ${JSON.stringify(task.node)}`)
        }
      }
      // 收工只落当天日志 ⇒ `close` 不许被 task-set 收下；怪值同理。
      for (const badNode of ['close', 'finish', 'weird']) {
        const res = runRoute('LED-02', 'task-set', { tasks: [taskBase], current_task_id: 'T-nodes', node: badNode, version: readRoute(wsB)?.version }, { workspace: wsB, env: envB })
        if (opMissing(res)) break
        const bad = envelopeProblem(`task-set（node=${badNode}）`, res, 'E_ARG_SCHEMA')
        if (bad !== null) push('C1-NODE-UNKNOWN', `${bad} —— 落 route 的节点只有 ${NODE_MARKS.join(' / ')}；**收工只落当天日志**，不进 route`)
      }
    }

    // ── C · 切阶段改第一行；RT-08 的首行常量一格不动 ──────────────────────────
    const wsC = makeWorkspace('led02', 'stage-enter')
    const { env: envC } = clockEnv(wsC, NOW)
    writeLegacy(wsC, legacyStoreFixture({ tickets: [] }))
    const bootC = runRoute('LED-02', C1_OPS.bootstrap, { ...BUILD_THEN_MAINTAIN_GRAPH }, { workspace: wsC, env: envC })
    if (opMissing(bootC)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootC).message)
    } else if (bootC.exit_code !== 0) {
      push('C1-STAGE-SETUP', `前置不成立：bootstrap 必须能落，实得 exit=${bootC.exit_code} / ${bootC.json?.error?.code}`)
    } else {
      const before = readRoute(wsC)
      const beforeHeadline = before?.headline
      // 先加一个已验收的任务（切阶段不许被"未结任务"挡住 —— 那不是这一格的事）。
      const t = runRoute('LED-02', 'task-set', { tasks: [{ id: 'T1', stage_id: 'stage-build', title: '做完了', status: 'done', five_gate_state: '验收' }], current_task_id: null, version: before?.version }, { workspace: wsC, env: envC })
      if (okOf('task-set（done）', t) !== null) push('C1-STAGE-TASK', `切阶段前置：一个 done 的任务必须能落（${okOf('task-set（done）', t)}）`)
      const afterTask = readRoute(wsC)
      if (afterTask?.headline !== beforeHeadline) push('C1-HEADLINE-CHANGED-BY-TASK', '第一行**不许**因为 task-set 而变（定形 §3.2：只随 stage-enter 或 headline 补齐而变）')
      const se = runRoute('LED-02', 'stage-enter', { from: 'stage-build', to: 'stage-maintain', exit_criteria_met: [], version: afterTask?.version }, { workspace: wsC, env: envC })
      const badSe = okOf('stage-enter build→maintain', se)
      if (badSe !== null) {
        push('C1-STAGE-ENTER', `${badSe} —— 切阶段 = ` + '`stage-enter`' + '（老板原话），它要能走通')
      } else {
        const route = readRoute(wsC)
        const want = `${BUILD_THEN_MAINTAIN_GRAPH.goal.title} · ${BUILD_THEN_MAINTAIN_GRAPH.stages[1].name}`
        if (route?.headline !== want) push('C1-HEADLINE-STAGE-ENTER', `切阶段之后 headline 必须换成「${want}」，实得 ${JSON.stringify(route?.headline)}`)
        if ((route?.transitions ?? []).length !== 1) push('C1-STAGE-TRANSITION', `stage-enter 必须留下一条 transition，实得 ${(route?.transitions ?? []).length}`)
        const read = runRoute('LED-02', 'read', {}, { workspace: wsC, env: envC })
        if (read.exit_code === 0) {
          if (read.json?.headline?.stored !== want) push('C1-HEADLINE-STAGE-READ', `切阶段后 \`read.headline.stored\` 必须是「${want}」，实得 ${JSON.stringify(read.json?.headline)}`)
          if (read.json?.headline?.stale !== false) push('C1-HEADLINE-STAGE-STALE', `切阶段后 stored 与 derived 必须同值，实得 ${JSON.stringify(read.json?.headline)}`)
          if (read.json?.mode !== 'maintain') push('C1-STAGE-MODE', `切到 maintain 段之后 \`read.mode\` 必须是 maintain，实得 ${JSON.stringify(read.json?.mode)}`)
        }
        // RT-08 的冻结常量：首行**永远**是这七个字，加字段不许把它挤掉。
        const sum = runRoute('LED-02', 'summarize', {}, { workspace: wsC, env: envC })
        if (sum.exit_code === 0) {
          const first = String(sum.json?.text ?? '').split(/\r?\n/)[0]?.trim() ?? ''
          if (first !== '目标 · 当前大阶段') push('C1-SUMMARY-FIRSTLINE', `摘要首行必须仍是「目标 · 当前大阶段」（RT-08 冻结），实得 ${JSON.stringify(first)}`)
          if (sum.json?.headline !== want) push('C1-SUMMARY-HEADLINE', `\`summarize\` 必须带一个 \`headline\` 字段（C2 的接缝）＝「${want}」，实得 ${JSON.stringify(sum.json?.headline)}`)
        } else {
          push('C1-SUMMARY', `切阶段之后 summarize 必须能跑，实得 exit=${sum.exit_code} / ${sum.json?.error?.code}`)
        }
      }
    }

    // ── D · headline 空（老账本）：读面空态 + 实现任务被拒 + 零写入 ──────────────
    const wsD = makeWorkspace('led02', 'headline-empty')
    const { env: envD } = clockEnv(wsD, NOW)
    const legacyRoute = writeLegacyRoute(wsD, {
      goal: { id: 'old-goal', title: '老账本的目标' },
      stages: [{ id: 'old-stage', name: '讨论阶段', order: 1, boss_gate: 'none', exit_criteria: [] }],
      current_stage_id: 'old-stage',
      tickets: [{ id: 'F-165', title: '老票', source: `technical-review:${'a'.repeat(64)}#F1`, legacy_status: 'open' }],
    })
    const readD = runRoute('LED-02', 'read', {}, { workspace: wsD, env: envD })
    if (readD.exit_code !== 0) {
      push('C1-EMPTY-READ', `老账本必须读得出来（它是一份**合法**的旧形状），实得 exit=${readD.exit_code} / ${readD.json?.error?.code}`)
    } else {
      const h = readD.json?.headline ?? null
      if (h?.empty !== true) push('C1-EMPTY-READ-EMPTY', `没有 headline 字段的老账本：\`read.headline.empty\` 必须是 true（卡片要能印「（目标未填）」+ 红条），实得 ${JSON.stringify(h)}`)
      if (h?.stored !== null) push('C1-EMPTY-READ-STORED', `空态的 \`stored\` 必须是 null（不许拿 derived 冒充），实得 ${JSON.stringify(h?.stored)}`)
      if (typeof h?.derived !== 'string' || h.derived.trim() === '') push('C1-EMPTY-READ-DERIVED', `空态的 \`derived\` 照样要算得出来（「老账本的目标 · 讨论阶段」），实得 ${JSON.stringify(h?.derived)}`)
      if (hasHeadlineOf) {
        const pure = lib.mod.headlineOf(readD.json?.current)
        if (pure?.empty !== true) push('C1-EMPTY-PURE', `\`headlineOf(老账本).empty\` 必须是 true，实得 ${JSON.stringify(pure)}`)
      }
    }
    const beforeD = fileStatRoute(legacyRoute.currentFile).sha256
    const taskD = runRoute('LED-02', 'task-set', {
      tasks: [{ id: 'T-empty', stage_id: 'old-stage', title: '实现任务', status: 'in_progress', kind: 'implement' }],
      current_task_id: 'T-empty',
      version: 1,
    }, { workspace: wsD, env: envD })
    if (opMissing(taskD)) {
      push('C1-OP-MISSING', missingOpProblem('task-set', taskD).message)
    } else {
      const bad = envelopeProblem('headline 空 + implement', taskD, 'E_ADMIT_HEADLINE')
      if (bad !== null) push('C1-EMPTY-REFUSES-IMPLEMENT', `${bad} —— 定形 §2.3：「headline 空 ⇒ 拒实现任务（先补 headline）」`)
      if (fileStatRoute(legacyRoute.currentFile).sha256 !== beforeD) push('C1-EMPTY-ZERO-WRITE', '被拒的实现任务**零写入**（current.json 的 sha256 前后相同）')
      const route = readRoute(wsD)
      if ((route?.tasks ?? []).length !== 0) push('C1-EMPTY-NO-TASKS', `被拒之后任务段必须还是空的（"不许开实现任务"），实得 ${JSON.stringify((route?.tasks ?? []).map((t) => t.id))}`)
    }

    // ── E · 补齐：headline-set 把 stored 重算成 derived（不接受自带一行字）────────
    const setHeadline = runRoute('LED-02', C1_OPS.headlineSet, {}, { workspace: wsD, env: envD })
    if (opMissing(setHeadline)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.headlineSet, setHeadline).message)
    } else {
      const bad = okOf(C1_OPS.headlineSet, setHeadline)
      if (bad !== null) {
        push('C1-HEADLINE-SET', `${bad} —— 「headline 补齐」是定形 §3.2 明写的一个入口（第一行只随它或 stage-enter 变）`)
      } else {
        const route = readRoute(wsD)
        if (route?.headline !== '老账本的目标 · 讨论阶段') push('C1-HEADLINE-SET-VALUE', `补齐之后 stored 必须重算成「老账本的目标 · 讨论阶段」，实得 ${JSON.stringify(route?.headline)}`)
        if (route?.headline !== route?.goal?.title + ' · ' + (route?.stages?.find((s) => s.id === route?.current_stage_id)?.name ?? '')) {
          push('C1-HEADLINE-SET-DERIVED', '补齐写下来的必须就是 `headlineOf` 的 derived（派生值只有一个作者）')
        }
        const read = runRoute('LED-02', 'read', {}, { workspace: wsD, env: envD })
        if (read.exit_code === 0 && read.json?.headline?.stale !== false) push('C1-HEADLINE-SET-STALE', `补齐之后不许 stale，实得 ${JSON.stringify(read.json?.headline)}`)
        // 补齐之后同一发 task-set 就收（"先补 headline"这条路的另一半）。
        const again = runRoute('LED-02', 'task-set', {
          tasks: [{ id: 'T-empty', stage_id: 'old-stage', title: '实现任务', status: 'in_progress', kind: 'implement' }],
          current_task_id: 'T-empty',
          version: readRoute(wsD)?.version,
        }, { workspace: wsD, env: envD })
        const badAgain = okOf('补齐后 task-set（implement）', again)
        if (badAgain !== null) push('C1-HEADLINE-HEALED', `${badAgain} —— 补齐 headline 之后实现任务必须收了（A03 在真账本上的形态）`)
      }
    }

    rec.readings.led02 = {
      headline_carrier: ['headline'],
      nodes: NODE_MARKS,
      // 现量（不是手写的两个 true）：空态那一格读面回了什么、实现任务那一发收没收。
      empty_state: {
        read_empty: readD.exit_code === 0 ? (readD.json?.headline?.empty ?? null) : null,
        admits_implement: opMissing(taskD) ? null : taskD.exit_code === 0,
      },
      heal_op: C1_OPS.headlineSet,
    }
    caseFail(problems)
  })
})
