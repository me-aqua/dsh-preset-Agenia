/**
 * `LED-03` · **C1c —— 单写者：`slotBusy()` 一个函数、四态、`ref` 空也是 busy**（任务 C1 的第 2 关红测试）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）
 *   §3.3（**单写者 = `slotBusy()` 一个函数**：两本账里有 `in_progress` 且未 `session_exit` 的工作写任务
 *   ⇒ busy；**活会话的事实源 = `session_ref` + `session_exit` + heartbeat + generation fence**；
 *   **四态 = busy / exited / crash / unknown**；`ref` 空也算 busy；**它自己的第一次 spawn 放行**；
 *   **心跳不可读 ⇒ 按 busy 拒 + 日志**；**stale = 心跳超过 30 分钟**（警告 + 回收候选，不自动）；
 *   **带 fence 的 paused 不算活**；**`paused` 是任务状态、不是第五态**：`paused + 活会话 = 非法（按 busy）`、
 *   `paused + session_exit = free`；**作用域 = 每工作区**（跨区各自一个写者））·
 *   §6.2 的「单写者」行（**四态**、exited free、crash ⇒ 组长回收、unknown 按 busy 拒 + 日志；
 *   **负样本：工作角色第二次 spawn ⇒ 工具返回拒**）。
 * 契约：`.team/test/CONTRACT-C1.md` §8。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守四件事（**这一格大部分是纯函数矩阵** —— 第 5 关才谈"真派工门禁"）：
 * `A` **四态闭集**：每一种输入都落进 busy / exited / crash / unknown 之一；`free` 不是第五态
 *     （它是 `exited` 的判读）；`stale` 的边界是 **严格大于 30 分钟**（整 30 分钟仍 busy）。
 * `B` **`ref` 空 = busy，但它自己的第一次 spawn 放行**：同一个输入，换 `requester_task_id`
 *     结论就翻面（别的任务看到 busy —— **不是 unknown**）。
 * `C` **两本账 + fence + paused 的三条特例**：路线任务 exited + bug 任务 busy ⇒ busy（一个工作区一个写者）；
 *     `fence` 写下的 paused 不算活；**`paused + 活会话` 是非法态，按 busy 拒**。
 * `D` **读面接缝**：`read.slot` 是卡片那两格（单写者未执行 / stale 槽）的事实源；它必须由
 *     **同一个函数**算出来（`read` 的 `slot` 与纯函数同值，空槽也一样）。
 *
 * ── 现在为什么红、红在哪（第 2 关，功能未做）────────────────────────────────────
 * · `lib/route.mjs` 没有 `slotBusy` / `SLOT_STATES` ⇒ A/B/C 全红（`C1-SURFACE-MISSING` 点名）；
 * · `read` 还没有 `slot` 块 ⇒ D 段红。
 * ⇒ 这条红**不是**"派工门禁没接上"（那是 A0a/A0b/A0d/A0f + C1c 的运行时形态，第 5 关才谈）；
 *    它只判"一个谓词、四种状态"这件事有没有载体。
 */
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import {
  BOOTSTRAP_GRAPH, C1_OPS, ROUTE_LIB, SLOT_STALE_MS, SLOT_STATES, clockEnv, envelopeProblem,
  legacyStoreFixture, makePusher, makeWorkspace, missingOpProblem, opMissing, readRoute, writeLegacy,
} from '../support/route-surface.mjs'

before(() => {
  preflight()
})

const NOW = '2026-11-01T12:00:00+08:00'
const MIN = 60 * 1000
const at = (minutesAgo) => new Date(Date.parse(NOW) - minutesAgo * MIN).toISOString()

/** 一条工作写任务的形状（`slotBusy` 的输入；事实源 = ref / exit / heartbeat / fence）。 */
function task(over = {}) {
  return {
    id: 'T1',
    kind: 'implement',
    status: 'in_progress',
    session_ref: 'sess-1',
    session_exit: null,
    heartbeat: at(5),
    fence: null,
    ...over,
  }
}

test('LED-03 C1c：slotBusy 四态闭集 · ref 空也是 busy（自己的第一次 spawn 放行）· 两本账一个写者', () => {
  return runCase('LED-03', async (rec) => {
    const problems = []
    const push = makePusher(problems)

    const lib = await loadStagedModule(ROUTE_LIB, ['slotBusy', 'SLOT_STATES', 'SLOT_STALE_MS'])
    if (lib.surfaceMissing || lib.missing.length > 0) {
      push('C1-SURFACE-MISSING', `\`${ROUTE_LIB}\` 缺：${lib.missing.join(' / ') || '(整个文件不在)'}（契约 §9.2）`)
    }
    const hasSlot = !lib.surfaceMissing && typeof lib.mod.slotBusy === 'function'
    if (!lib.surfaceMissing && lib.mod.SLOT_STATES !== undefined
      && JSON.stringify(lib.mod.SLOT_STATES) !== JSON.stringify(SLOT_STATES)) {
      push('C1-SLOT-STATES', `\`SLOT_STATES\` 必须恰是四态闭集 ${JSON.stringify(SLOT_STATES)}，实得 ${JSON.stringify(lib.mod.SLOT_STATES)}`)
    }
    if (!lib.surfaceMissing && lib.mod.SLOT_STALE_MS !== undefined && lib.mod.SLOT_STALE_MS !== SLOT_STALE_MS) {
      push('C1-SLOT-STALE-DEFAULT', `\`SLOT_STALE_MS\` 的默认值必须是 30 分钟（${SLOT_STALE_MS} ms），实得 ${JSON.stringify(lib.mod.SLOT_STALE_MS)}`)
    }

    /**
     * 每一格：`{ id, tasks, requester, want: {state, allow}, why }`。
     * `state` 是**槽的状态**（四态闭集）；`allow` 是"这一次 spawn 放不放行"。
     * 两者不是一回事：`ref` 空时槽是 busy（任务持有槽），但那个任务自己的第一次 spawn 放行。
     */
    const cells = [
      { id: 'S01', tasks: [], want: { state: 'exited', allow: true }, why: '空槽 ⇒ 没有活会话持有它' },
      { id: 'S02', tasks: [task()], requester: 'T1', want: { state: 'busy', allow: false }, why: '活会话（ref + 无 exit + 心跳新）⇒ busy；**第二次** spawn 拒' },
      { id: 'S03', tasks: [task()], requester: 'T2', want: { state: 'busy', allow: false }, why: '别的任务看到忙' },
      { id: 'S04', tasks: [task({ session_ref: null, heartbeat: null })], requester: 'T1', want: { state: 'busy', allow: true }, why: 'ref 空 = busy（任务持有槽），**它自己的第一次 spawn 放行**' },
      { id: 'S05', tasks: [task({ session_ref: null, heartbeat: null })], requester: 'T2', want: { state: 'busy', allow: false }, why: 'ref 空时**别的任务看到 busy，不是 unknown**' },
      { id: 'S06', tasks: [task({ session_ref: '' })], want: { state: 'busy', allow: false }, why: '空串 ref 与缺 ref 同形（都是"还没 spawn"）' },
      { id: 'S07', tasks: [task({ session_exit: at(1) })], want: { state: 'exited', allow: true }, why: '有 exit ⇒ 已退 ⇒ free（含交活等验收）' },
      { id: 'S08', tasks: [task({ status: 'paused', session_exit: at(1) })], want: { state: 'exited', allow: true }, why: '`paused + session_exit` = free（paused 不是第五态）' },
      { id: 'S09', tasks: [task({ status: 'paused' })], want: { state: 'busy', allow: false }, why: '`paused + 活会话` = **非法** ⇒ 按 busy 拒' },
      { id: 'S10', tasks: [task({ status: 'paused', fence: 2 })], want: { state: 'exited', allow: true }, why: '带 fence：旧会话被 fence，不算活' },
      { id: 'S11', tasks: [task({ heartbeat: at(31) })], want: { state: 'crash', allow: false }, why: '心跳停了（> 30 分钟）⇒ crash；回收之前**门禁照样拒**' },
      { id: 'S12', tasks: [task({ heartbeat: at(30) })], want: { state: 'busy', allow: false }, why: '边界：**整 30 分钟仍算活**（"超过 30 分钟"才 stale）' },
      { id: 'S13', tasks: [task({ heartbeat: null })], want: { state: 'unknown', allow: false }, why: '心跳不可读 ⇒ 判不了 ⇒ 按 busy 拒（不是放行）' },
      { id: 'S14', tasks: [task({ heartbeat: 'not-a-time' })], want: { state: 'unknown', allow: false }, why: '心跳形状坏了与读不到同形' },
      { id: 'S15', tasks: [task({ status: 'done' })], want: { state: 'exited', allow: true }, why: 'done 的任务不是持有者（交活等验收 = 已退 = free）' },
      { id: 'S16', tasks: [task({ kind: 'ticket-repair', session_exit: at(1) }), task({ id: 'T2', kind: 'bug-repair' })], want: { state: 'busy', allow: false }, why: '**两本账一个写者**：路线任务已退、bug 任务还活着 ⇒ busy' },
      { id: 'S17', tasks: [{ id: 'B1', status: 'in_progress', session_ref: 'sess-bug', heartbeat: at(2) }], want: { state: 'busy', allow: false }, why: '`kind` 缺省也算工作写（**bug 台账的任务形状里没有 kind 字段**）—— 判不了就按占槽算，不许悄悄放行' },
    ]
    if (hasSlot) {
      for (const cell of cells) {
        const got = lib.mod.slotBusy({ tasks: cell.tasks, now: NOW, requester_task_id: cell.requester ?? null })
        if (got?.state !== cell.want.state) {
          push('C1-SLOT-STATE', `${cell.id}（${cell.why}）：期望 state=${JSON.stringify(cell.want.state)}，实得 ${JSON.stringify(got)}`)
        }
        if (got?.allow !== cell.want.allow) {
          push('C1-SLOT-ALLOW', `${cell.id}（${cell.why}）：期望 allow=${cell.want.allow}，实得 ${JSON.stringify(got?.allow)}`)
        }
        if (!SLOT_STATES.includes(got?.state)) {
          push('C1-SLOT-CLOSED-SET', `${cell.id}：state 落在四态闭集外（${JSON.stringify(got?.state)}）`)
        }
        if (Array.isArray(got?.holders) && got.holders.length > 0) {
          for (const h of got.holders) {
            if (!SLOT_STATES.includes(h?.state)) push('C1-SLOT-HOLDER-STATE', `${cell.id}：holders[] 里有一项的状态落在四态外（${JSON.stringify(h)}）`)
          }
        }
        // 拒的时候必须带一个码；放行的时候不许带码。
        if (cell.want.allow === false && (typeof got?.code !== 'string' || got.code === '')) {
          push('C1-SLOT-CODE', `${cell.id}：拒的时候必须带一个码（实得 ${JSON.stringify(got?.code)}）`)
        }
        if (cell.want.allow === true && got?.code !== null && got?.code !== undefined) {
          push('C1-SLOT-CODE-ALLOW', `${cell.id}：放行的时候不许带码（实得 ${JSON.stringify(got?.code)}）`)
        }
      }
      // **同一个函数**：`stale_ms` 可调，默认 30 分钟 —— 只改阈值，S11 那一刻就翻回 busy。
      const late = lib.mod.slotBusy({ tasks: [task({ heartbeat: at(31) })], now: NOW, requester_task_id: null, stale_ms: 60 * MIN })
      if (late?.state !== 'busy') push('C1-SLOT-THRESHOLD', `\`stale_ms\` 必须真的被读：把阈值调到 60 分钟之后，31 分钟前的心跳必须仍是 busy，实得 ${JSON.stringify(late)}`)
      // 只读任务不占槽（"只读 = 不写工作"；`kind` 不在工作种类里 ⇒ 不是持有者）。
      const readOnly = lib.mod.slotBusy({ tasks: [{ id: 'R1', kind: 'read-only', status: 'in_progress', session_ref: 'sess-r', heartbeat: at(1) }], now: NOW, requester_task_id: null })
      if (readOnly?.allow !== true) push('C1-SLOT-READONLY', `只读工作不占槽（定形 §5：只读工作与账写入豁免），实得 ${JSON.stringify(readOnly)}`)
    }

    // ── D · 读面接缝：`read.slot` 由同一个函数算出来 ───────────────────────────
    /**
     * 这一段**实测**读数（gate4 复审 BC-04 ③：`readings` 里不许写手打出来的 `true`）。
     * 每一格都是上面那次子进程调用真回出来的值；没走到的那一格是 `null`。
     */
    const seam = {
      empty_state: null, empty_allow: null,
      busy_state: null, busy_allow: null,
      holders: null, same_function: null,
    }
    const ws = makeWorkspace('led03', 'read-slot')
    const { env } = clockEnv(ws, NOW)
    writeLegacy(ws, legacyStoreFixture({ tickets: [] }))
    const boot = runRoute('LED-03', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: ws, env })
    if (opMissing(boot)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, boot).message)
    } else if (boot.exit_code !== 0) {
      push('C1-SLOT-SETUP', `前置不成立：bootstrap 必须能落，实得 exit=${boot.exit_code} / ${boot.json?.error?.code}`)
    } else {
      const empty = runRoute('LED-03', 'read', {}, { workspace: ws, env })
      if (empty.exit_code === 0) {
        seam.empty_state = empty.json?.slot?.state ?? null
        seam.empty_allow = empty.json?.slot?.allow ?? null
        if (empty.json?.slot?.state !== 'exited') push('C1-READ-SLOT-EMPTY', `空账本的 \`read.slot.state\` 必须是 exited（没有活会话），实得 ${JSON.stringify(empty.json?.slot)}`)
        if (empty.json?.slot?.allow !== true) push('C1-READ-SLOT-ALLOW', `空账本必须放行 spawn，实得 ${JSON.stringify(empty.json?.slot?.allow)}`)
      } else {
        push('C1-READ-SLOT', `\`read\` 必须能跑（它是 C2 那两格的事实用源），实得 exit=${empty.exit_code} / ${empty.json?.error?.code}`)
      }
      // 一个 in_progress、还没 spawn 的实现任务 ⇒ 槽 busy（ref 空 = busy）。
      const set = runRoute('LED-03', 'task-set', {
        tasks: [{ id: 'T1', stage_id: 'stage-build', title: '占槽的任务', status: 'in_progress', five_gate_state: '实现', kind: 'implement' }],
        current_task_id: 'T1',
      }, { workspace: ws, env })
      const badSet = envelopeProblem('task-set（in_progress，未 spawn）', set, 'ok')
      if (badSet !== null) {
        push('C1-SLOT-TASK-SET', `${badSet} —— 一个实现任务的开工会话还没 spawn（ref 空）也要能落盘`)
      } else {
        const read = runRoute('LED-03', 'read', {}, { workspace: ws, env })
        if (read.exit_code === 0) {
          seam.busy_state = read.json?.slot?.state ?? null
          seam.busy_allow = read.json?.slot?.allow ?? null
          seam.holders = Array.isArray(read.json?.slot?.holders) ? read.json.slot.holders.length : null
          if (read.json?.slot?.state !== 'busy') push('C1-READ-SLOT-BUSY', `有 in_progress 工作写任务时 \`read.slot.state\` 必须是 busy，实得 ${JSON.stringify(read.json?.slot)}`)
          if (read.json?.slot?.allow !== false) push('C1-READ-SLOT-DENY', `别的写者必须被拒（单写者），实得 allow=${JSON.stringify(read.json?.slot?.allow)}`)
          if (Array.isArray(read.json?.slot?.holders) && read.json.slot.holders.length === 0) push('C1-READ-SLOT-HOLDERS', '`read.slot.holders` 必须点名是谁占着槽（拒了却不说谁，读的人没法修）')
          if (hasSlot) {
            const pure = lib.mod.slotBusy({ tasks: readRoute(ws)?.tasks ?? [], now: NOW, requester_task_id: null })
            seam.same_function = pure?.state === read.json?.slot?.state
            if (pure?.state !== read.json?.slot?.state) push('C1-READ-SLOT-SAME-FUNCTION', `\`read.slot.state\`（${JSON.stringify(read.json?.slot?.state)}）与纯函数（${JSON.stringify(pure?.state)}）不一致 —— 必须是同一个谓词（"一个函数"）`)
          }
        }
      }
      // `task-set` 写 `paused` 也要过同一个谓词：活会话还在时把任务标 paused ⇒ 非法，拒。
      const paused = runRoute('LED-03', 'task-set', {
        tasks: [{ id: 'T1', stage_id: 'stage-build', title: '占槽的任务', status: 'paused', five_gate_state: '实现', kind: 'implement', session_ref: 'sess-live' }],
        current_task_id: 'T1',
      }, { workspace: ws, env })
      if (!opMissing(paused) && paused.exit_code === 0) {
        push('C1-SLOT-PAUSED-ILLEGAL', '`paused + 活会话` 是**非法**（定形 §3.3 两条分开）⇒ `task-set` 不许把它写成 paused（要写就先写 `session_exit`）')
      }
    }

    rec.readings.led03 = {
      slot_cells: cells.length,
      states_closed_set: SLOT_STATES,
      states_seen: [...new Set(cells.map((c) => c.want.state))].sort(),
      stale_ms: lib.surfaceMissing ? null : lib.mod.SLOT_STALE_MS ?? null,
      // 读面接缝的**实测**值（不是手打的 true）：空槽 / 占用 / 谁占着 / 与纯函数同值。
      read_slot: seam,
    }
    caseFail(problems)
  })
})
