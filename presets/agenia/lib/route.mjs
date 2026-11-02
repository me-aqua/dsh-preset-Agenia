/**
 * 路线（route）—— schema、校验、摘要投影。
 *
 * 冻结依据：提案 §B1.4（`agenia-route.mjs` 的 op 表与退出码）· §B1.5（纯函数接缝）·
 *   拍板 Q5（五关词 denylist **取并集**、bare / 仅空白 / 仅"阶段"后缀变体**硬拒**，复合名允许）·
 *   §B3.7（审计链：`prev_sha256 → next_sha256`、版本、写入者、会话、时间）。
 *
 * 七条口径（本文件里每一处都照它写）：
 *   ① **大阶段名与五关词是两套东西**：`stages[].name` 是"大阶段"的**显示名**（讨论阶段…），
 *      `tasks[].five_gate_state` 才是五关（定形/契约与测试/实现/独立评审/验收）。
 *      denylist 是**禁止大阶段名撞五关词**，不是禁止五关词存在 —— 所以任务上写
 *      `five_gate_state:'契约与测试'` 合法（RT-08 就是这么用的）。
 *   ② **归一化后才判**：trim + 去掉**恰好一个**尾缀"阶段" ⇒ `方案`/`方案阶段`/`  方案  ` 三种写法全拒；
 *      **不做子串匹配** ⇒ `老板验收阶段` 合法（拍板 Q5 原文举的例子）。
 *   ③ **同一时刻恰好一个 current 大阶段**；它必须就是 `current_stage_id` 指的那一个
 *      （没标 state 的图，由 `current_stage_id` 回填出唯一那个 current）。
 *   ④ **任务与阶段：只有"当前任务"被绑在当前阶段上**。别的阶段可以有排队任务（那是正常形态），
 *      但 `current_task_id` 一旦指向别的阶段 ⇒ `E_TASK_STAGE_MISMATCH`。
 *   ⑤ **阶段切换不自动发生**：任务做完（哪怕 `done`）不会推动大阶段；切换只能由 `stage-enter` 显式发生。
 *   ⑥ **摘要 = 投影**：`summarizeRoute` 只读路线对象，首行是**固定的**「目标 · 当前大阶段」，
 *      并把 `tasks[].five_gate_state` 渲染在任务那一层（不把大阶段名混进五关那一行）。
 *   ⑦ **纯函数**：不读盘、不写盘、不看时钟 —— 时间由调用方给。
 */

/** `current.json` 的 schema 版本。 */
export const ROUTE_SCHEMA_VERSION = 1

/**
 * 五关词表（拍板 Q5 的**并集**，与 `FROZEN.fiveGateDenylist` 逐字一致）。
 * 两个用途：① 大阶段名的 denylist；② `tasks[].five_gate_state` 的合法取值表。
 */
export const FIVE_GATES = Object.freeze(['方案', '实施', '内测', '评审', '验收', '定形', '契约与测试', '实现', '独立评审'])

/** 大阶段的三种状态。 */
export const STAGE_STATES = Object.freeze(['done', 'current', 'future'])

/** 大阶段的老板门槛（§B3.5：`approval_required` 只约束**当前阶段**的关闭）。 */
export const BOSS_GATES = Object.freeze(['none', 'approval_required'])

/**
 * **bug 任务**的三种状态（v5 的 `open | in_progress | done`）。
 *
 * 🔴 契约 `.team/test/CONTRACT-C1.md` §7.3：**路线任务**有第四态 `paused`，但那一个词
 *    **不许**塞进这张表 —— `lib/bug-ledger.mjs::bugTaskVerdict` 读的就是这一张，
 *    多一个 `paused` 会让 B 的那一列当场翻面（bug 任务没有"暂停"这个状态）。
 */
export const TASK_STATUSES = Object.freeze(['open', 'in_progress', 'done'])

// ── C1：路线账本的模式 / 阶段类型 / 工作种类 / 槽（契约 CONTRACT-C1 §2.2 / §7.3 / §8）──────────
/**
 * **模式**的四值闭集 —— **纯派生，不存值**（定形 §2.3）。
 *
 * `uninitialized` 是一个**值**（没有路线账本），不是"缺席"；`paused` **不在**这里
 * （它是**任务状态**，见 `ROUTE_TASK_STATUSES`）。派生函数是 `modeOf`。
 */
export const MODES = Object.freeze(['uninitialized', 'build', 'build-paused', 'maintain'])

/** **阶段类型**闭集（`stages[].kind`）。没声明 ⇒ 按 `build` 读（契约 §13 第 2 条）。 */
export const STAGE_KINDS = Object.freeze(['build', 'maintain'])

/** **工作种类**（不是角色、不是 toolName）：实现 / 票的修 / bug 修（定形 §3.3）。 */
export const ROUTE_TASK_KINDS = Object.freeze(['implement', 'ticket-repair', 'bug-repair'])

/** **路线任务**的四态：比 bug 任务多一个 `paused`（定形 §2.3「`paused` 是任务状态」）。 */
export const ROUTE_TASK_STATUSES = Object.freeze(['open', 'in_progress', 'paused', 'done'])

/** 槽的四态闭集（定形 §3.3）。**`free` 不是第五态** —— 它是 `exited` 的判读。 */
export const SLOT_STATES = Object.freeze(['busy', 'exited', 'crash', 'unknown'])

/** `stale` 的缺省阈值：心跳**超过** 30 分钟（严格大于；整 30 分钟仍算忙）。 */
export const SLOT_STALE_MS = 30 * 60 * 1000

/** 五个真实节点里**落 route** 的三个（开工 / 交活 / 验收）。切阶段 = `stage-enter`；收工只落当天 `log.md`。 */
export const NODE_MARKS = Object.freeze(['open', 'handoff', 'accept'])

/** 归一化时要剥掉的那一个尾缀。 */
export const STAGE_NAME_SUFFIX = '阶段'

/** 摘要的固定首行（RT-08 冻结：恰为这一行）。 */
export const SUMMARY_FIRST_LINE = '目标 · 当前大阶段'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isFilledString = (v) => typeof v === 'string' && v.trim() !== ''
const ok = () => ({ ok: true, code: null, message: '' })
const bad = (code, message) => ({ ok: false, code, message })

/** 阶段 / 任务的 id 形状：字母数字开头，允许 `.` `_` `-`。 */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * **一天的切点**（本地小时）—— 00:00–03:59 归**前一天**。
 *
 * 契约 `CONTRACT.md` §13.1（`F-158`）。老板原话（2026-10-24 01:07 记进定形）：
 * 「改成从凌晨4点切分，不要在半夜一点我正在干活的时候嚷嚷"新的一天了，得先派记忆更新呀"」。
 */
export const DAY_CUT_HOURS = 4

/** 本地日历日 `YYYY-MM-DD` —— **纯格式化**，不做切点换算（只有 `dayKeyOf` 该减那 4 小时）。 */
function localDateOf(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 契约 `CONTRACT.md` §13.1：**唯一**一处算"这一天是哪一天"。
 *
 * `dayKeyOf(instant) = 本地日期(instant − 4h)`，返回 `YYYY-MM-DD`（带连字符）——
 * 状态文件 `state/update/<day>.json`、报告 `reports/memory-update/<day>.json`、
 * `daily/<day>.json`、`local/<day>.json` 与 `isDayKey` 用的都是这一种形状。
 * 例：`2026-10-24T01:30+08:00` ⇒ `"2026-10-23"`（凌晨一点半还在干前一天的活）。
 *
 * 🔴 **谁派生谁**：带连字符的日子是**这个函数的结果**；票号 / `transition_id` 里那 8 位**从它派生**
 * （`dayDigitsOf`），不是反过来 —— 反过来的话这次收敛会改写**已经发出去**的号（§13.4 第 2 条）。
 * 🔴 凡是"今天 / 某天"的派生都走这里，别处不许再写一份 `getFullYear()+getMonth()+getDate()`。
 */
export function dayKeyOf(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  return localDateOf(new Date(d.getTime() - DAY_CUT_HOURS * 3600 * 1000))
}

/**
 * 一个**日子键** → 票号 / `transition_id` 里那 8 位（`2026-10-23` ⇒ `20261023`）。
 * 这是"谁派生谁"的**唯一**一份实现：带连字符的日子是主形，8 位是它的派生（契约 §13.1 末两条）。
 * 入参已经是 8 位时原样返回（老调用方不受影响）。
 */
export function dayDigitsOfKey(dayKey) {
  return String(dayKey ?? '').trim().replaceAll('-', '')
}

/** 某一时刻的 8 位（票号 / `transition_id` 用）—— `dayKeyOf` 之后再派生，不是另算一遍日期。 */
export function dayDigitsOf(instant) {
  return dayDigitsOfKey(dayKeyOf(instant))
}

/**
 * ISO8601 **带本地时区偏移**（`2026-10-14T12:00:00+08:00`）。
 *
 * 为什么不用 `toISOString()`（它给的是 `…Z`）：审计链、票的 `closed_at`、阶段证据的
 * `spent_at` 都是**给人对表**的，本地偏移最省一次换算；而且注入式时钟写的什么，
 * 落盘就还是什么（`AGENIA_NOW_FILE` 那一行原样出现在产物里 —— 复现时一眼能对上）。
 */
export function isoWithOffset(date) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0')
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.trunc(offsetMin / 60))}:${pad(offsetMin % 60)}`
}

/**
 * 大阶段名判定（拍板 Q5）—— 归一化后撞五关词 ⇒ `E_STAGE_NAME_FORGED`。
 *
 * 归一化：`trim` → 若以"阶段"结尾则剥掉**一个** → 再 `trim`。**不做子串匹配**。
 */
export function forgedStageNameVerdict(name) {
  if (!isFilledString(name)) return bad('E_ARG_SCHEMA', `大阶段名必填（非空字符串），实得 ${JSON.stringify(name)}`)
  const trimmed = name.trim()
  const bare = trimmed.endsWith(STAGE_NAME_SUFFIX) ? trimmed.slice(0, -STAGE_NAME_SUFFIX.length).trim() : trimmed
  if (FIVE_GATES.includes(bare)) {
    return bad('E_STAGE_NAME_FORGED', `大阶段名「${name}」撞了五关词「${bare}」—— 五关是任务那一层的东西，不许拿来当大阶段名（拍板 Q5：bare / 仅空白 / 仅"阶段"后缀变体一律硬拒）`)
  }
  return ok()
}

/** 五关状态判定（`tasks[].five_gate_state`）—— 值必须在五关词表里。 */
export function fiveGateVerdict(value) {
  if (value === undefined || value === null) return ok()
  if (!FIVE_GATES.includes(value)) {
    return bad('E_ARG_SCHEMA', `five_gate_state 必须是五关词之一（${FIVE_GATES.join(' / ')}），实得 ${JSON.stringify(value)}`)
  }
  return ok()
}

/**
 * 阶段图判定（`init` 与 `stage-graph-set` 共用）。
 *
 * @param {{goal?:object, stages:Array, current_stage_id:string}} payload
 * @param {{goalFallback?:object|null}} [options] `stage-graph-set` 不带 goal 时用现成的那个
 * @returns {{ok:boolean, code:string|null, message:string, goal?:object, stages?:Array, current_stage_id?:string}}
 */
export function stageGraphVerdict(payload, { goalFallback = null } = {}) {
  if (!isObject(payload)) return bad('E_ARG_SCHEMA', `阶段图必须是对象，实得 ${JSON.stringify(payload)}`)
  const goal = payload.goal === undefined || payload.goal === null ? goalFallback : payload.goal
  if (!isObject(goal) || !isFilledString(goal.id) || !isFilledString(goal.title)) {
    return bad('E_ARG_SCHEMA', `goal 必须带非空的 id 与 title，实得 ${JSON.stringify(goal)}`)
  }
  if (!Array.isArray(payload.stages) || payload.stages.length === 0) {
    return bad('E_ARG_SCHEMA', `stages 必须是非空数组，实得 ${JSON.stringify(payload.stages)}`)
  }
  if (!isFilledString(payload.current_stage_id)) {
    return bad('E_ARG_SCHEMA', `current_stage_id 必填（当前大阶段是哪一个），实得 ${JSON.stringify(payload.current_stage_id)}`)
  }

  const seenIds = new Set()
  const stages = []
  let declaredCurrent = []
  for (const raw of payload.stages) {
    if (!isObject(raw)) return bad('E_ARG_SCHEMA', `stages[] 里必须都是对象，实得 ${JSON.stringify(raw)}`)
    if (!isFilledString(raw.id) || !ID_RE.test(raw.id)) return bad('E_ARG_SCHEMA', `大阶段 id 形状不对：${JSON.stringify(raw.id)}`)
    if (seenIds.has(raw.id)) return bad('E_ARG_SCHEMA', `大阶段 id 重复：${raw.id}`)
    seenIds.add(raw.id)
    const forged = forgedStageNameVerdict(raw.name)
    if (!forged.ok) return forged
    if (!Number.isInteger(raw.order) || raw.order < 1) return bad('E_ARG_SCHEMA', `大阶段 ${raw.id} 的 order 必须是 ≥1 的整数，实得 ${JSON.stringify(raw.order)}`)
    if (raw.state !== undefined && !STAGE_STATES.includes(raw.state)) {
      return bad('E_ARG_SCHEMA', `大阶段 ${raw.id} 的 state 必须是 ${STAGE_STATES.join(' | ')}，实得 ${JSON.stringify(raw.state)}`)
    }
    if (raw.boss_gate !== undefined && !BOSS_GATES.includes(raw.boss_gate)) {
      return bad('E_ARG_SCHEMA', `大阶段 ${raw.id} 的 boss_gate 必须是 ${BOSS_GATES.join(' | ')}，实得 ${JSON.stringify(raw.boss_gate)}`)
    }
    // 🔴 C1（契约 §2.2 / §12 第 7 条）：**阶段类型是闭集，写面就要拒** —— 不许读的时候才炸。
    //    没声明 ⇒ 按 `build` 读（保守读法，契约 §13 第 2 条：缺 kind 就拒会让所有既有夹具当场红）。
    //    `init` / `stage-graph-set` / `bootstrap` 都走这个函数 ⇒ `kind` 在那三个写面上原样带下去。
    if (raw.kind !== undefined && !STAGE_KINDS.includes(raw.kind)) {
      return bad('E_ARG_SCHEMA', `大阶段 ${raw.id} 的 kind（阶段类型）必须是 ${STAGE_KINDS.join(' | ')}，实得 ${JSON.stringify(raw.kind)}`)
    }
    if (raw.exit_criteria !== undefined) {
      if (!Array.isArray(raw.exit_criteria) || raw.exit_criteria.some((c) => !isFilledString(c))) {
        return bad('E_ARG_SCHEMA', `大阶段 ${raw.id} 的 exit_criteria 必须是字符串数组，实得 ${JSON.stringify(raw.exit_criteria)}`)
      }
    }
    if (raw.state === 'current') declaredCurrent.push(raw.id)
    stages.push({
      id: raw.id,
      name: raw.name.trim(),
      order: raw.order,
      state: raw.state ?? null, // 回填在下面（要先把整张图看完才知道谁该是 current）
      boss_gate: raw.boss_gate ?? 'none',
      exit_criteria: raw.exit_criteria ?? [],
      // 🔴 C1：阶段类型**原样带下去**（旧写者会静默丢掉它 ⇒ `modeOf` 派生不出 build / maintain）。
      kind: raw.kind ?? 'build',
    })
  }

  // ③ 同一时刻恰好一个 current；它必须就是 current_stage_id 指的那一个。
  if (declaredCurrent.length > 1) {
    return bad('E_STAGE_MULTI_CURRENT', `同一时刻只能有一个 current 大阶段，实得 ${declaredCurrent.length} 个：${declaredCurrent.join(' / ')}`)
  }
  if (!seenIds.has(payload.current_stage_id)) {
    return bad('E_ARG_SCHEMA', `current_stage_id=${JSON.stringify(payload.current_stage_id)} 不在 stages 里（${[...seenIds].join(' / ')}）`)
  }
  if (declaredCurrent.length === 1 && declaredCurrent[0] !== payload.current_stage_id) {
    return bad('E_ARG_SCHEMA', `标了 state='current' 的是 ${declaredCurrent[0]}，而 current_stage_id 指的是 ${payload.current_stage_id} —— 两处不一致`)
  }
  for (const stage of stages) {
    if (stage.state === null) stage.state = stage.id === payload.current_stage_id ? 'current' : 'future'
  }
  stages.sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))
  return { ok: true, code: null, message: '', goal: { id: goal.id, title: goal.title }, stages, current_stage_id: payload.current_stage_id }
}

/**
 * 任务面判定（`task-set`）。
 *
 * ④ 只有"当前任务"被绑在当前阶段上；`current_task_id` 可以是 `null`（阶段有任务但没在做的）。
 * ⑤ 任务状态写成 `done` **不会**推动大阶段 —— 这个函数只看不变量，不碰 `current_stage_id`。
 *
 * @param {object} payload `{tasks, current_task_id, version}`
 * @param {{stages:Array, current_stage_id:string}} graph 现成的阶段图
 */
/**
 * 任务面判定（`task-set`）。
 *
 * ④ 只有"当前任务"被绑在当前阶段上；`current_task_id` 可以是 `null`（阶段有任务但没在做的）。
 * ⑤ 任务状态写成 `done` **不会**推动大阶段 —— 这个函数只看不变量，不碰 `current_stage_id`。
 *
 * C1（契约 `.team/test/CONTRACT-C1.md` §7.3 / §7.4 / §12 第 8 条）新增的三件事：
 *   · `status` 收**四态**（`ROUTE_TASK_STATUSES`，多一个 `paused`）—— bug 任务那张三态表一个字不动；
 *   · 认新键 `kind` / `entry_id` / `ticket_id` / `session_ref` / `session_exit` / `heartbeat` / `fence`；
 *   · **`paused + 活会话` 是非法态**（定形 §3.3）：要暂停就先写 `session_exit`，或者走 `route-mark pause`。
 *   `ticket-repair` 必须挂一张**真票**（`ticket_id` 指向 `graph.tickets` 里、且不是 `void` 的那一张）。
 *
 * ⚠️ **准入不在这里**：`admitTask`（下面那一段）按模式判"这个期收不收这种工作"；
 *    `taskSetVerdict` 只判"这条任务本身成不成形状"。两件事分开 = 两个理由各给各的码。
 *
 * @param {object} payload `{tasks, current_task_id, version, note, node}`
 * @param {{stages:Array, current_stage_id:string}} graph 现成的路线（只读阶段图）
 */
export function taskSetVerdict(payload, graph) {
  if (!isObject(payload)) return bad('E_ARG_SCHEMA', `task-set 入参必须是对象，实得 ${JSON.stringify(payload)}`)

  // ⑤ "两个当前任务"的两种形状都要**当场认出**（先于"认不认识这个键"—— 认出来才给得出准的码）。
  if (Object.hasOwn(payload, 'current_task_ids')) {
    const many = payload.current_task_ids
    if (!Array.isArray(many)) return bad('E_ARG_SCHEMA', `current_task_ids 必须是数组，实得 ${JSON.stringify(many)}`)
    if (many.length > 1) return bad('E_TASK_MULTI_CURRENT', `同一时刻只能有一个当前任务，实得 ${many.length} 个：${many.join(' / ')}`)
    return bad('E_ARG_SCHEMA', '不认 current_task_ids 这个形状 —— 用 current_task_id（`null` 或一个 id）')
  }
  if (Array.isArray(payload.tasks)) {
    const flagged = payload.tasks.filter((t) => isObject(t) && t.current === true)
    if (flagged.length > 1) {
      return bad('E_TASK_MULTI_CURRENT', `同一时刻只能有一个当前任务，实得 ${flagged.length} 个带 current:true 的任务：${flagged.map((t) => t.id).join(' / ')}`)
    }
  }

  const allowedKeys = new Set(['tasks', 'current_task_id', 'version', 'note', 'node'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return bad('E_ARG_SCHEMA', `task-set 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowedKeys].join(' / ')}`)
    }
  }
  if (!Array.isArray(payload.tasks)) return bad('E_ARG_SCHEMA', `tasks 必须是数组（可以是空数组），实得 ${JSON.stringify(payload.tasks)}`)

  // C1b：**节点只落审计 `detail.node`**（实施附注 §4）—— `close`（收工只落当天日志）与任意怪值都拒。
  let node = null
  if (payload.node !== undefined && payload.node !== null) {
    if (!NODE_MARKS.includes(payload.node)) {
      return bad('E_ARG_SCHEMA', `node 只认 ${NODE_MARKS.join(' | ')}（落 route 的三个节点；收工只落当天 log.md，不进 route），实得 ${JSON.stringify(payload.node)}`)
    }
    node = payload.node
  }

  const stageIds = new Set((graph?.stages ?? []).map((s) => s.id))
  const allowedTaskKeys = new Set([
    'id', 'stage_id', 'title', 'status', 'five_gate_state', 'note',
    // C1 的新键（契约 §12 第 8 条）：工作种类 + 票号 + 活会话的四类事实。
    'kind', 'entry_id', 'ticket_id', 'session_ref', 'session_exit', 'heartbeat', 'fence',
  ])
  const seen = new Set()
  const tasks = []
  for (const raw of payload.tasks) {
    if (!isObject(raw)) return bad('E_ARG_SCHEMA', `tasks[] 里必须都是对象，实得 ${JSON.stringify(raw)}`)
    for (const key of Object.keys(raw)) {
      if (!allowedTaskKeys.has(key)) return bad('E_ARG_SCHEMA', `任务不认识字段 ${JSON.stringify(key)}（${JSON.stringify(raw.id ?? null)}）—— 只认 ${[...allowedTaskKeys].join(' / ')}`)
    }
    if (!isFilledString(raw.id) || !ID_RE.test(raw.id)) return bad('E_ARG_SCHEMA', `任务 id 形状不对：${JSON.stringify(raw.id)}`)
    if (seen.has(raw.id)) return bad('E_ARG_SCHEMA', `任务 id 重复：${raw.id}`)
    seen.add(raw.id)
    if (!isFilledString(raw.title)) return bad('E_ARG_SCHEMA', `任务 ${raw.id} 的 title 必填且非空`)
    if (!ROUTE_TASK_STATUSES.includes(raw.status)) return bad('E_ARG_SCHEMA', `任务 ${raw.id} 的 status 必须是 ${ROUTE_TASK_STATUSES.join(' | ')}（路线任务四态），实得 ${JSON.stringify(raw.status)}`)
    if (!isFilledString(raw.stage_id) || !stageIds.has(raw.stage_id)) {
      return bad('E_TASK_STAGE_MISMATCH', `任务 ${raw.id} 属的阶段 ${JSON.stringify(raw.stage_id)} 不在阶段图里（${[...stageIds].join(' / ')}）`)
    }
    const gate = fiveGateVerdict(raw.five_gate_state)
    if (!gate.ok) return gate
    const kind = raw.kind ?? 'implement'
    if (!ROUTE_TASK_KINDS.includes(kind)) {
      return bad('E_ARG_SCHEMA', `任务 ${raw.id} 的 kind（工作种类）必须是 ${ROUTE_TASK_KINDS.join(' | ')}，实得 ${JSON.stringify(raw.kind)}`)
    }
    for (const [field, value] of [['entry_id', raw.entry_id], ['ticket_id', raw.ticket_id], ['session_ref', raw.session_ref], ['session_exit', raw.session_exit], ['heartbeat', raw.heartbeat]]) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return bad('E_ARG_SCHEMA', `任务 ${raw.id} 的 ${field} 只能是 null 或字符串，实得 ${JSON.stringify(value)}`)
      }
    }
    if (raw.fence !== undefined && raw.fence !== null && (!Number.isInteger(raw.fence) || raw.fence < 1)) {
      return bad('E_ARG_SCHEMA', `任务 ${raw.id} 的 fence 只能是 null 或 ≥1 的整数（回收写 generation fence），实得 ${JSON.stringify(raw.fence)}`)
    }
    // 票的修 = 一条路线任务，**票号挂在任务上**（定形 §3.4）—— 缺票号就投影不出来。
    // ⚠️ "这张票在不在 / 是不是 void" 是**第二个理由**（`ticketRepairVerdict`），由写面在**准入之后**判：
    //    准入先说话（"这个期收不收票的修"），否则 maintain 期拿一张不存在的票会被误报成形状错。
    const ticketId = raw.ticket_id ?? null
    if (kind === 'ticket-repair' && !isFilledString(ticketId)) {
      return bad('E_ARG_SCHEMA', `任务 ${raw.id} 是票的修（ticket-repair），必须带 ticket_id（票号挂在任务上 —— 票状态的投影只有这一个输入）`)
    }
    // 🔴 定形 §3.3：**`paused` + 活会话 = 非法**。判据与 `slotBusy` 同一个方向：
    //    写 paused 之前必须先把活会话写进 `session_exit`（或走 `route-mark pause` 那条路）。
    if (raw.status === 'paused' && isFilledString(raw.session_ref) && !isFilledString(raw.session_exit)) {
      return bad('E_ARG_SCHEMA', `任务 ${raw.id} 不能写成 paused 而会话还活着（session_ref=${JSON.stringify(raw.session_ref)} 且没有 session_exit）—— 先写 session_exit，或先 route-mark pause（定形 §3.3：paused + 活会话 = 非法）`)
    }
    tasks.push({
      id: raw.id,
      stage_id: raw.stage_id,
      title: raw.title,
      status: raw.status,
      five_gate_state: raw.five_gate_state ?? null,
      note: raw.note ?? null,
      kind,
      entry_id: raw.entry_id ?? null,
      ticket_id: ticketId,
      session_ref: raw.session_ref ?? null,
      session_exit: raw.session_exit ?? null,
      heartbeat: raw.heartbeat ?? null,
      fence: raw.fence ?? null,
    })
  }

  const pointer = payload.current_task_id ?? null
  if (pointer !== null && !isFilledString(pointer)) return bad('E_ARG_SCHEMA', `current_task_id 只能是 null 或一个任务 id，实得 ${JSON.stringify(pointer)}`)
  if (pointer !== null) {
    const hit = tasks.find((t) => t.id === pointer)
    if (!hit) return bad('E_TASK_NOT_FOUND', `current_task_id=${JSON.stringify(pointer)} 指的任务不在 tasks 里`)
    if (hit.stage_id !== graph?.current_stage_id) {
      return bad('E_TASK_STAGE_MISMATCH', `当前任务 ${hit.id} 属阶段 ${hit.stage_id}，而当前大阶段是 ${graph?.current_stage_id} —— 只有当前阶段的任务能当"当前任务"`)
    }
  }
  return { ok: true, code: null, message: '', tasks, current_task_id: pointer, node }
}

/**
 * `stage-enter` 的**图**判定（证据与 exit_criteria 另判）：
 * `from` 必须是当前大阶段、`to` 必须在图里、两者不能相同。
 */
export function stageEnterGraphVerdict(route, from, to) {
  if (!isFilledString(from) || !isFilledString(to)) return bad('E_ARG_SCHEMA', `stage-enter 要 from 与 to 两个非空 id，实得 ${JSON.stringify({ from, to })}`)
  const stages = route?.stages ?? []
  const currentStage = stages.find((s) => s.id === route?.current_stage_id) ?? null
  if (currentStage === null) return bad('E_DATA_CORRUPT', `current_stage_id=${JSON.stringify(route?.current_stage_id)} 在图里找不到`)
  if (from !== route.current_stage_id) {
    return bad('E_ARG_SCHEMA', `from=${JSON.stringify(from)} 不是当前大阶段（当前是 ${route.current_stage_id}）`)
  }
  const nextStage = stages.find((s) => s.id === to) ?? null
  if (nextStage === null) return bad('E_ARG_SCHEMA', `to=${JSON.stringify(to)} 不在阶段图里（${stages.map((s) => s.id).join(' / ')}）`)
  if (to === from) return bad('E_ARG_SCHEMA', `from 与 to 是同一个阶段（${from}）—— 那不是切换`)
  return { ok: true, code: null, message: '', currentStage, nextStage }
}

/**
 * `exit_criteria` 判定（§B3.5 场景⑦）：当前阶段**声明的**每一条都必须出现在 `exit_criteria_met` 里。
 * 没声明（或空表）⇒ 什么都不要（场景⑥就是这种：`a` 阶段没有 exit_criteria）。
 */
export function exitCriteriaVerdict(stage, met) {
  const want = Array.isArray(stage?.exit_criteria) ? stage.exit_criteria.filter(isFilledString) : []
  if (want.length === 0) return ok()
  if (!Array.isArray(met)) return bad('E_EXIT_CRITERIA', `exit_criteria_met 必须是数组（本阶段声明了 ${want.length} 条退出条件）`)
  const got = new Set(met.filter(isFilledString))
  const missing = want.filter((c) => !got.has(c))
  if (missing.length > 0) {
    return bad('E_EXIT_CRITERIA', `还有退出条件没满足就要切阶段：${missing.join(' / ')}（已满足 ${[...got].join(' / ') || '（无）'}）`)
  }
  return ok()
}

/**
 * 还有没做完的任务就要切阶段 ⇒ `E_TASKS_OPEN`（RT-04 ⑤）。
 *
 * 🔴 C1（契约 §10.5 / §12 第 9 条）：**`paused` 不算未结** —— 只看 `open` / `in_progress`。
 *    理由：定形 §4.9 那条路径就是「先把在途实现任务标 `paused` 再 `stage-enter`」；
 *    也数 `paused` 的话，那条路径会被自己的 `E_TASKS_OPEN` 挡住。
 *    ⚠️ `RT-04` ⑤ 的 `open` 任务照旧被挡（**不许一起放宽**）。
 */
export function openTasksVerdict(route) {
  const open = (route?.tasks ?? []).filter((t) => t.stage_id === route?.current_stage_id && (t.status === 'open' || t.status === 'in_progress'))
  if (open.length === 0) return ok()
  return bad('E_TASKS_OPEN', `当前大阶段还有 ${open.length} 个没做完的任务：${open.map((t) => `${t.id}(${t.status})`).join(' / ')} —— 切阶段前先收清`)
}

/**
 * `transition_id` 的形状（§B3.5：`tr-<YYYYMMDD>-<seq>`）。
 * 日子那一段**一律走 `dayDigitsOfKey`**：传进来的是带连字符的主形也照样得到 8 位 ——
 * 已经发出去的 `tr-<8 位>-<NN>` 不许因为日子换了形状而跟着变（契约 §13.1 末两条）。
 */
export function transitionIdOf(dayKey, seq) {
  return `tr-${dayDigitsOfKey(dayKey)}-${String(seq).padStart(2, '0')}`
}

/**
 * 新建一份路线对象（`init` / `bootstrap` / "空路线重来"共用）。`version` 由调用方给 —— **重来也不回退**。
 *
 * C1（契约 §6.1）：建账就带 `headline`（**唯一载体 = 这个字段**）与 `pauses: []`。
 * `headline` 由 `headlineOf` **派生**出来写死一次（`stored = derived`）；之后只有
 * `stage-enter` / `headline-set` 能改它（`task-set` 一个字都不许碰）。
 */
export function newRouteObject({ goal, stages, current_stage_id: currentStageId, at, version = 1 }) {
  const route = {
    schema: ROUTE_SCHEMA_VERSION,
    goal: { id: goal.id, title: goal.title },
    stages,
    current_stage_id: currentStageId,
    tasks: [],
    current_task_id: null,
    tickets: [],
    pauses: [],
    transitions: [],
    headline: null,
    version,
    created_at: at,
    updated_at: at,
  }
  route.headline = headlineOf(route).derived
  return route
}

/**
 * 这份路线是不是"还没用起来"（只有 init 留下的空壳）。
 *
 * 用途：`init` 只在一份**空路线**上成功（重来一次是合法的），一旦有过任务/票/切换，
 * 或者**动过任何一个不是 init 的 op**，就只许用别的 op 往前走 —— 再 init 会把历史抹掉 ⇒ `E_ROUTE_EXISTS`。
 *
 * @param {object} route 现有路线
 * @param {{auditOps?:string[]|null}} [options] 审计链上出现过的 op 序列（updater 读盘给进来）；
 *   给了就要求**每一条都是 init** —— "只换了一张阶段图"也算用起来了（图是老板要冻的东西）。
 */
export function isPristineRoute(route, { auditOps = null } = {}) {
  if (!isObject(route)) return false
  const untouched = (route.tasks ?? []).length === 0 && (route.tickets ?? []).length === 0 && (route.transitions ?? []).length === 0
  if (!untouched) return false
  if (Array.isArray(auditOps)) return auditOps.every((op) => op === 'init')
  return true
}

/**
 * `current.json` 的形状判定（**读面**用）。
 * 与"哈希对不上审计末条"（`E_ROUTE_TAMPERED`）分工：这一条管"解析得开但不成形状"。
 */
export function routeShapeVerdict(route) {
  if (!isObject(route)) return bad('E_DATA_CORRUPT', `current.json 不是一个对象：${JSON.stringify(route)?.slice(0, 120)}`)
  if (route.schema !== ROUTE_SCHEMA_VERSION) return bad('E_DATA_CORRUPT', `current.json 的 schema 应为 ${ROUTE_SCHEMA_VERSION}，实得 ${JSON.stringify(route.schema)}`)
  if (!isObject(route.goal) || !isFilledString(route.goal.id) || !isFilledString(route.goal.title)) return bad('E_DATA_CORRUPT', 'current.json 缺 goal.id / goal.title')
  if (!Array.isArray(route.stages) || route.stages.length === 0) return bad('E_DATA_CORRUPT', 'current.json 的 stages 必须是非空数组')
  if (!route.stages.some((s) => s?.id === route.current_stage_id)) return bad('E_DATA_CORRUPT', `current.json 的 current_stage_id=${JSON.stringify(route.current_stage_id)} 不在 stages 里`)
  for (const field of ['tasks', 'tickets', 'transitions']) {
    if (!Array.isArray(route[field])) return bad('E_DATA_CORRUPT', `current.json 的 ${field} 必须是数组，实得 ${JSON.stringify(route[field])}`)
  }
  // C1：`pauses` 是**新段** —— 老账本（C1 之前建的）里没有它，那是**真实的旧形状**，不是损坏。
  // 缺 ⇒ 按空数组读（`modeOf` / `pauseSetOf` 都这么读）；有但不成形状 ⇒ 才是坏。
  if (route.pauses !== undefined && !Array.isArray(route.pauses)) {
    return bad('E_DATA_CORRUPT', `current.json 的 pauses 必须是数组（缺省按空读），实得 ${JSON.stringify(route.pauses)}`)
  }
  if (route.headline !== undefined && route.headline !== null && typeof route.headline !== 'string') {
    return bad('E_DATA_CORRUPT', `current.json 的 headline 只能是字符串或 null，实得 ${JSON.stringify(route.headline)}`)
  }
  if (!Number.isInteger(route.version) || route.version < 1) return bad('E_DATA_CORRUPT', `current.json 的 version 必须是 ≥1 的整数，实得 ${JSON.stringify(route.version)}`)
  return ok()
}

/**
 * 把一次切换**应用**到路线对象上（纯函数：返回新对象，不改入参）。
 *
 * §B3.5/A6：`transition_id` 与 `used` 系列由 updater 在这一刻落定，调用方不预填。
 */
export function applyStageEnter(route, { to, at, transitionId, exitCriteriaMet = [], evidenceKey = null, evidencePath = null }) {
  const from = route.current_stage_id
  const stages = (route.stages ?? []).map((s) => {
    if (s.id === from) return { ...s, state: 'done' }
    if (s.id === to) return { ...s, state: 'current' }
    return s.state === 'current' ? { ...s, state: 'done' } : { ...s }
  })
  const transitions = [...(route.transitions ?? []), {
    transition_id: transitionId,
    from_stage_id: from,
    to_stage_id: to,
    at,
    exit_criteria_met: [...exitCriteriaMet],
    evidence_key: evidenceKey,
    evidence_path: evidencePath,
  }]
  return {
    ...route,
    stages,
    current_stage_id: to,
    transitions,
    version: route.version + 1,
    updated_at: at,
  }
}

/**
 * 摘要投影（RT-08）—— **首行固定**「目标 · 当前大阶段」，内容全部来自路线对象本身。
 *
 * 两条排版纪律：
 *   · 五关只出现在**任务那一层**（大阶段没有任务时写"不适用"）—— 大阶段名不许混进五关那一行；
 *   · 阶段一行、任务一行、票一行，都是"一眼能扫"的短行。
 */
export function summarizeRoute(route) {
  const stages = route?.stages ?? []
  const current = stages.find((s) => s.id === route?.current_stage_id) ?? null
  const tasks = (route?.tasks ?? []).filter((t) => t.stage_id === route?.current_stage_id)
  const tickets = route?.tickets ?? []
  const lines = []
  lines.push(SUMMARY_FIRST_LINE)
  lines.push('')
  lines.push(`目标：${route?.goal?.title ?? '(缺)'}（${route?.goal?.id ?? '(缺)'}）`)
  lines.push(`当前大阶段：${current ? `${current.id} · ${current.name}（第 ${current.order} 段 · 状态 ${current.state}${current.boss_gate === 'approval_required' ? ' · 要老板批' : ''}）` : '(缺)'}`)
  const next = stages.find((s) => s.order > (current?.order ?? 0)) ?? null
  if (next) lines.push(`下一段：${next.id} · ${next.name}`)
  lines.push('')
  lines.push(`任务（本阶段 ${tasks.length} 个）`)
  if (tasks.length === 0) {
    lines.push('- （本阶段没有任务） · 五关：不适用')
  } else {
    for (const t of tasks) {
      lines.push(`- ${t.id} · ${t.title} · ${t.status} · 五关：${t.five_gate_state ?? '不适用'}`)
    }
  }
  lines.push('')
  lines.push(`票（${tickets.length} 张）`)
  if (tickets.length === 0) {
    lines.push('- （没有票）')
  } else {
    // 🔴 C1（契约 §12 第 10 条）：票那一行印**投影**，不印落盘快照 ——
    //    `status` 不是权威（迁移票连 `status` 都不存），投影的唯一输入是任务段 + `legacy_status`。
    for (const t of tickets) lines.push(`- ${t.id} · ${t.title} · ${ticketStatusOf(t, route?.tasks ?? [])}`)
  }
  const transitions = route?.transitions ?? []
  if (transitions.length > 0) {
    lines.push('')
    lines.push(`阶段切换（${transitions.length} 次）`)
    for (const tr of transitions.slice(-5)) lines.push(`- ${tr.transition_id} · ${tr.from_stage_id} → ${tr.to_stage_id} · ${tr.at}`)
  }
  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// C1 · 路线账本的纯函数面（契约 `.team/test/CONTRACT-C1.md` §9.2 冻名字）
//
// 这一段的纪律与文件头那七条一样：**不读盘、不写盘、不看时钟**，时间由调用方给。
// 名字一个字都不许改（契约 §9.2："实现若要用别的形状，先改契约"）。
// ══════════════════════════════════════════════════════════════════════════════════════════

/**
 * **模式 = 四值纯派生**（契约 §2.2；定形 §2.3 末段）。`current.json` 里**不许**存它。
 *
 * | 输入 | 输出 |
 * | --- | --- |
 * | 没有路线（`null`） | `uninitialized` |
 * | 当前阶段 `kind === 'maintain'` | `maintain`（**暂停位不管用**：maintain 不支持暂停） |
 * | `kind === 'build'` + `pauses[]` 里有 `state:'open'` | `build-paused` |
 * | 其余（build / 没声明 kind） | `build` |
 */
export function modeOf(route) {
  if (!isObject(route)) return 'uninitialized'
  const stage = (route.stages ?? []).find((s) => s?.id === route.current_stage_id) ?? null
  const kind = stage?.kind ?? 'build'
  if (kind === 'maintain') return 'maintain'
  const paused = (Array.isArray(route.pauses) ? route.pauses : []).some((p) => p?.state === 'open')
  return paused ? 'build-paused' : 'build'
}

/**
 * **第一行 = 目标 · 大阶段名**（契约 §6.1；实施附注 §4 原话 `headline = <goal.title> · <stage.name>`）。
 *
 * 返回值四个字段各有读者：
 * - `derived`：派生值（两边都非空才算得出来，否则 `null`）；
 * - `stored`：账上的 `headline` 字段（非空白字符串才算有；否则 `null`）；
 * - `empty`：`stored === null` —— **卡片印「（目标未填）」+ 红条的那一格**（C2 读这个布尔）；
 * - `stale`：`stored !== derived`（读数，不是判据）。
 *
 * 🔴 **唯一载体 = `headline` 字段**：`read` / `summarize` / 卡片都从它读。
 *    写它的只有四处：`init` / `bootstrap` / `stage-enter` / `headline-set`（四处都写 `stored = derived`）。
 */
export function headlineOf(route) {
  if (!isObject(route)) return { stored: null, derived: null, empty: true, stale: false }
  const stage = (route.stages ?? []).find((s) => s?.id === route.current_stage_id) ?? null
  const goalTitle = isFilledString(route.goal?.title) ? route.goal.title.trim() : null
  const stageName = isFilledString(stage?.name) ? stage.name.trim() : null
  const derived = goalTitle !== null && stageName !== null ? `${goalTitle} · ${stageName}` : null
  const stored = isFilledString(route.headline) ? route.headline : null
  return { stored, derived, empty: stored === null, stale: stored !== derived }
}

/**
 * **一个准入函数**（契约 §7；定形 §2.3 原话「两个创建入口都调它 · 判据只有一份」）。
 *
 * 判定次序就是判据：**模式 → 工作种类 → 集合/字段** —— 不许让一个更细的检查把更前面的理由遮住。
 * 十六格各一个码：`E_ADMIT_UNINITIALIZED` / `E_ADMIT_HEADLINE` / `E_ADMIT_KIND` /
 * `E_ADMIT_SET` / `E_ADMIT_MODE` / `E_ADMIT_ENTRY`；收的时候 `code === null`。
 *
 * 「一个函数按 mode 读不同集合」：`maintain` 读 **batch**（bug 台账），`build-paused` 读 **pause set**（路线）。
 * 两个集合**不混名** —— 所以 A13（在 batch 里、不在 pause set 里）也必须拒。
 *
 * @param {{mode:string, kind:string, entry_id?:string|null, headline?:string|null,
 *          batch_entry_ids?:string[], pause_entry_ids?:string[]}} input
 * @returns {{ok:boolean, code:string|null, message:string}}
 */
export function admitTask({ mode, kind, entry_id = null, headline = null, batch_entry_ids = [], pause_entry_ids = [] } = {}) {
  if (!MODES.includes(mode)) {
    return bad('E_ADMIT_MODE', `模式必须是四值闭集（${MODES.join(' | ')}），实得 ${JSON.stringify(mode)} —— \`paused\` 是**任务状态**，不是模式`)
  }
  if (mode === 'uninitialized') {
    return bad('E_ADMIT_UNINITIALIZED', '未建账（没有路线账本）⇒ 拒一切修任务与实现任务，只能登记（定形 §2.3）—— 先 bootstrap 建账')
  }
  if (!ROUTE_TASK_KINDS.includes(kind)) {
    return bad('E_ADMIT_KIND', `工作种类必须是 ${ROUTE_TASK_KINDS.join(' | ')}，实得 ${JSON.stringify(kind)}`)
  }
  const entry = isFilledString(entry_id) ? entry_id : null
  const batch = [...new Set((Array.isArray(batch_entry_ids) ? batch_entry_ids : []).filter(isFilledString))]
  const pauseSet = [...new Set((Array.isArray(pause_entry_ids) ? pause_entry_ids : []).filter(isFilledString))]
  const hasHeadline = isFilledString(headline)

  if (mode === 'build') {
    if (kind === 'implement') {
      // A04：headline 空 ⇒ 先补第一行（headline-set），再开实现任务。
      return hasHeadline
        ? ok()
        : bad('E_ADMIT_HEADLINE', 'headline 空（账上没有第一行）⇒ 拒实现任务 —— 先 `--op headline-set` 补第一行（定形 §2.3）')
    }
    if (kind === 'ticket-repair') return ok() // A05：票的修 = build 期的路线任务
    return bad('E_ADMIT_KIND', '实现期普通 bug 只登记、不修（够线才打断实现，那走 build-paused）—— 这个工作种类只从 bug 入口进')
  }

  if (mode === 'build-paused') {
    if (kind !== 'bug-repair') {
      return bad('E_ADMIT_KIND', `build-paused 只收触发暂停的那一条 bug 修（pause set 内），不收 ${kind}`)
    }
    if (entry === null) return bad('E_ADMIT_ENTRY', 'bug 修必须点名一条 entry（entry_id）—— 不点名就不知道修的是哪一条')
    if (pauseSet.includes(entry)) return ok() // A12
    return bad('E_ADMIT_SET', `entry ${entry} 不在当前 pause set 里（${pauseSet.join(' / ') || '（空集）'}）—— build-paused 只收 pause set 内的（batch 里的也不算：两个集合不混名）`)
  }

  // maintain
  if (kind !== 'bug-repair') {
    return bad('E_ADMIT_KIND', `维护期只修批内 bug，不接 ${kind}（定形 §2.3：维护期不接新实现、不修票）`)
  }
  if (entry === null) return bad('E_ADMIT_ENTRY', 'bug 修必须点名一条 entry（entry_id）—— 不点名就不知道修的是哪一条')
  if (batch.length === 0) {
    return bad('E_ADMIT_SET', '当前没有 batch（冻结批）⇒ 维护期什么都不收 —— 先 `--op bug-batch-freeze` 冻一批')
  }
  if (batch.includes(entry)) return ok() // A09
  return bad('E_ADMIT_SET', `entry ${entry} 不在当前 batch 里（${batch.join(' / ')}）—— 维护期只修批内的`)
}

/**
 * **槽 = 一个谓词**（契约 §8；定形 §3.3「单写者 = `slotBusy()` 一个函数」）。
 *
 * 四态闭集（`SLOT_STATES`）+ 两个**不同**的字段：
 * - `state` 是**槽的状态**（`busy` / `exited` / `crash` / `unknown`）；`free = state === 'exited'`；
 * - `allow` 是**这一次 spawn 放不放行** —— `ref` 空时槽是 `busy`（任务持有槽），
 *   但**那个任务自己的第一次 spawn 放行**（`state` 仍是 busy）。
 *
 * 判定顺序即判据（契约 §8.2）：`session_exit` → `fence` → `ref` 空 → 心跳不可读 → 心跳停 → 活会话。
 * `unknown`（心跳读不出来）在聚合里**按 busy 拒**，但 `holders[]` 里如实写 `unknown`（读数不撒谎）。
 *
 * @param {{tasks?:Array, now?:string, requester_task_id?:string|null, stale_ms?:number}} input
 */
export function slotBusy({ tasks = [], now = null, requester_task_id = null, stale_ms = SLOT_STALE_MS } = {}) {
  const nowMs = Date.parse(String(now ?? ''))
  const threshold = Number.isInteger(stale_ms) && stale_ms >= 0 ? stale_ms : SLOT_STALE_MS
  const holders = []
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!isObject(task)) continue
    // ① 持有者候选：工作写任务（`in_progress` / `paused`）；`open` / `done` 不占槽。
    if (!(task.status === 'in_progress' || task.status === 'paused')) continue
    const declaredKind = task.kind === undefined || task.kind === null ? null : task.kind
    // `kind` 缺省 = 算工作写（fail-closed：bug 台账的任务形状里没有 `kind`）；
    // 显式写成别的值（如 `read-only`）⇒ 不占槽（定形 §5：只读工作与账写入豁免）。
    if (declaredKind !== null && !ROUTE_TASK_KINDS.includes(declaredKind)) continue
    const holder = { task_id: task.id ?? null, kind: declaredKind, state: null, why: null }
    if (isFilledString(task.session_exit)) {
      holder.state = 'exited'; holder.why = 'session-exit'
    } else if (Number.isInteger(task.fence) && task.fence >= 1) {
      holder.state = 'exited'; holder.why = 'fenced'
    } else if (!isFilledString(task.session_ref)) {
      holder.state = 'busy'; holder.why = 'ref-empty'
    } else if (!Number.isFinite(nowMs)) {
      holder.state = 'unknown'; holder.why = 'clock-unreadable'
    } else {
      const heartbeatMs = Date.parse(String(task.heartbeat ?? ''))
      if (!Number.isFinite(heartbeatMs)) {
        holder.state = 'unknown'; holder.why = 'heartbeat-unreadable'
      } else if ((nowMs - heartbeatMs) > threshold) {
        holder.state = 'crash'; holder.why = 'heartbeat-stale'
      } else {
        holder.state = 'busy'
        // `paused + 活会话` 是**非法态**（定形 §3.3）—— 照样按 busy 拒，但读数里说得出为什么。
        holder.why = task.status === 'paused' ? 'paused-with-live-session' : 'live'
      }
    }
    holders.push(holder)
  }

  let state
  // 聚合次序：**busy 先、unknown 次之、crash 再次、否则 exited**。
  // ⚠️ `unknown` 单独成格（不是并进 busy）：槽的**判读**是"判不了"，而**决定**与 busy 一样 ——
  //    `allow:false` + `E_GUARD_SLOT_BUSY`（"按 busy 拒 + 日志"）。把它印成 busy 会把
  //    "读不到心跳"粉饰成"有人在忙"，卡上那一格就再也修不回来了。
  if (holders.some((h) => h.state === 'busy')) state = 'busy'
  else if (holders.some((h) => h.state === 'unknown')) state = 'unknown'
  else if (holders.some((h) => h.state === 'crash')) state = 'crash'
  else state = 'exited'

  // ④ `allow`：exited ⇒ 放行；否则**只有一种例外** —— 唯一的持有者是 requester 自己、且是 `ref-empty`。
  let allow = state === 'exited'
  if (!allow && state === 'busy' && requester_task_id !== null && holders.length === 1) {
    const only = holders[0]
    allow = only.task_id === requester_task_id && only.state === 'busy' && only.why === 'ref-empty'
  }
  const free = state === 'exited'
  const code = allow ? null : 'E_GUARD_SLOT_BUSY'
  let message
  if (allow) {
    message = free
      ? '槽是空的（没有活会话持有它）'
      : `放行：唯一的持有者是它自己（${String(requester_task_id)}），还没 spawn 过（ref 空）—— 第一次 spawn`
  } else {
    const names = holders.filter((h) => h.task_id !== requester_task_id).map((h) => `${h.task_id}(${h.state}/${h.why})`)
    message = `槽被占（${state}）：${names.join(' / ') || holders.map((h) => `${h.task_id}(${h.state}/${h.why})`).join(' / ')} —— 单写者：一个工作区同时最多一个工作写`
  }
  return { state, free, allow, holders, code, message }
}

/**
 * **票的修必须挂一张真票**（契约 §7.4 第 2 条）—— 判在准入**之后**（写面调用），
 * 因为"这个期收不收票的修"是更前面的理由（A08 的码必须是 `E_ADMIT_KIND`，不是形状错）。
 *
 * 票号挂在任务上 = 票状态投影的**唯一输入**，所以票必须真的在票段里、且不是 `void`（终态）。
 */
export function ticketRepairVerdict(task, tickets) {
  const id = task?.id ?? '(未知任务)'
  const ticketId = isFilledString(task?.ticket_id) ? task.ticket_id : null
  if (ticketId === null) {
    return bad('E_ARG_SCHEMA', `任务 ${id} 是票的修（ticket-repair），必须带 ticket_id（票号挂在任务上）`)
  }
  const list = Array.isArray(tickets) ? tickets : []
  const ticket = list.find((t) => t?.id === ticketId) ?? null
  if (ticket === null) {
    return bad('E_ARG_SCHEMA', `任务 ${id} 的 ticket_id=${JSON.stringify(ticketId)} 不在路线票段里（现有：${list.map((t) => t?.id).join(' / ') || '（没有票）'}）`)
  }
  if (isFilledString(ticket.void_reason) || ticket.status === 'void') {
    return bad('E_ARG_SCHEMA', `票 ${ticketId} 已经是 void（终态）—— void 的票不能再挂修任务`)
  }
  return ok()
}

/**
 * **票状态 = 投影**（契约 §7.5；定形 §3.4「票状态 = 每次读任务算出来的投影（不存值）」）。
 *
 * 判定顺序：**先 `void`（唯一存下的终态）→ 再任务 → 最后 `legacy_status`**。
 * 🔴 **存着的 `status` 不是权威**：一张 `status:'done'`、没有任务、没有 `legacy_status` 的票，投影是 `open`。
 */
export function ticketStatusOf(ticket, tasks) {
  if (!isObject(ticket)) return 'open'
  if (isFilledString(ticket.void_reason) || ticket.status === 'void') return 'void'
  const mine = (Array.isArray(tasks) ? tasks : []).filter((t) => isObject(t) && t.ticket_id === ticket.id)
  if (mine.length > 0) {
    if (mine.some((t) => t.status === 'in_progress' || t.status === 'paused')) return 'in_progress'
    if (mine.every((t) => t.status === 'done')) return 'done'
    return 'open'
  }
  // 迁移票没有任务时用 `legacy_status`（定形 §2.3 原话「迁移票的投影用 `legacy_status` 直到有任务」）。
  if (TASK_STATUSES.includes(ticket.legacy_status)) return ticket.legacy_status
  return 'open'
}

/**
 * **唯一的一条不变量**：有 live task（`status !== 'done'`）的票不许 `void`（契约 §7.5）。
 * `paused` 也算 live（否则暂停中的票能被 void，任务回来就悬空）。
 */
export function ticketVoidVerdict(ticket, tasks) {
  const live = (Array.isArray(tasks) ? tasks : []).filter((t) => isObject(t) && t.ticket_id === ticket?.id && t.status !== 'done')
  if (live.length > 0) {
    return bad('E_TICKET_LIVE_TASK', `票 ${ticket?.id} 还有 ${live.length} 条没 done 的任务（${live.map((t) => `${t.id}(${t.status})`).join(' / ')}）—— 有 live task 的票不许 void，先取消任务`)
  }
  return ok()
}

/** **pause set 的解析**（契约 §10.4）：只并 `state:'open'` 的那些，`entry_ids` 去重；closed 的不算。 */
export function pauseSetOf(pauses) {
  const list = (Array.isArray(pauses) ? pauses : []).filter(isObject)
  const open = list.filter((p) => p.state === 'open')
  const entryIds = [...new Set(open.flatMap((p) => (Array.isArray(p.entry_ids) ? p.entry_ids : [])).filter(isFilledString))]
  const idsOf = (rows) => rows.map((p) => p.pause_id).filter(isFilledString)
  return {
    entry_ids: entryIds,
    open_pause_ids: idsOf(open),
    closed_pause_ids: idsOf(list.filter((p) => p.state === 'closed')),
  }
}

/**
 * pause set 里的 id 能不能在 bug 台账里**解出来**（契约 §10.4）。
 *
 * 🔴 **live + archived 两段都查**（"和 finding 查找同一条规则"）：已归档的触发条仍然解得出 ——
 *    它进过 batch、修完归档，pause set 的账不因此失忆。
 * 两段都找不到的 id ⇒ `ok:false` + `missing` **点名**（卡片上要能红；C2 读这一格）。
 */
export function pauseEntriesVerdict({ pause_entry_ids, ledger } = {}) {
  const wanted = [...new Set((Array.isArray(pause_entry_ids) ? pause_entry_ids : []).filter(isFilledString))]
  const known = new Set([
    ...(Array.isArray(ledger?.entries) ? ledger.entries : []),
    ...(Array.isArray(ledger?.archived) ? ledger.archived : []),
  ].map((e) => (isObject(e) ? e.id : null)).filter(isFilledString))
  const resolved = wanted.filter((id) => known.has(id))
  const missing = wanted.filter((id) => !known.has(id))
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'E_DATA_MISSING',
      message: `pause set 里这些 id 在 bug 台账的 live + archived 两段都找不到：${missing.join(' / ')}`,
      resolved,
      missing,
    }
  }
  return { ok: true, code: null, message: '', resolved, missing: [] }
}

/**
 * **legacy 票店的形状判定**（契约 §4.1；定形 §2.3「legacy 票店 = 独立存储」）。
 *
 * 拒的时候要**点名是第几条、哪个字段** —— 坏了就明确拒，不许半信半疑地搬一半。
 */
export function legacyTicketVerdict(store) {
  if (!isObject(store)) return bad('E_LEGACY_STORE_BAD', `legacy 票店必须是一个对象，实得 ${JSON.stringify(store)?.slice(0, 120)}`)
  if (store.schema !== 1) return bad('E_LEGACY_STORE_BAD', `legacy 票店的 schema 必须是 1，实得 ${JSON.stringify(store.schema)}`)
  if (!Array.isArray(store.tickets)) return bad('E_LEGACY_STORE_BAD', `legacy 票店的 tickets 必须是数组，实得 ${JSON.stringify(store.tickets)?.slice(0, 120)}`)
  const seen = new Set()
  for (const [i, ticket] of store.tickets.entries()) {
    const head = `legacy 票店第 ${i + 1} 条`
    if (!isObject(ticket)) return bad('E_LEGACY_STORE_BAD', `${head} 不是对象：${JSON.stringify(ticket)?.slice(0, 120)}`)
    const where = `${head}${isFilledString(ticket.id) ? `（${ticket.id}）` : ''}`
    if (!isFilledString(ticket.id)) return bad('E_LEGACY_STORE_BAD', `${where} 的 id 必填且非空`)
    if (seen.has(ticket.id)) return bad('E_LEGACY_STORE_BAD', `${where} 的票号 ${ticket.id} 在票店里重复了（票号必须店内唯一）`)
    seen.add(ticket.id)
    if (!isFilledString(ticket.title)) return bad('E_LEGACY_STORE_BAD', `${where} 的 title 必填且非空`)
    if (!TASK_STATUSES.includes(ticket.status)) {
      return bad('E_LEGACY_STORE_BAD', `${where} 的 status 必须是 ${TASK_STATUSES.join(' | ')}，实得 ${JSON.stringify(ticket.status)}`)
    }
    if (!isFilledString(ticket.source)) return bad('E_LEGACY_STORE_BAD', `${where} 的 source 必填且非空（这批票是从哪来的）`)
    if (/^bug:/i.test(ticket.source.trim())) {
      return bad('E_LEGACY_STORE_BAD', `${where} 的 source=${JSON.stringify(ticket.source)} —— 两本账不串：票的 source 不许 \`bug:\` 开头`)
    }
    if (!isFilledString(ticket.next_step)) return bad('E_LEGACY_STORE_BAD', `${where} 的 next_step 必填且非空（票的下一步）`)
    if (!isFilledString(ticket.acceptance)) return bad('E_LEGACY_STORE_BAD', `${where} 的 acceptance 必填且非空（票的验收口径）`)
  }
  return ok()
}

/**
 * **迁移后的票记录**（契约 §4.2 冻形状）。
 *
 * 🔴 **不存 `status`**：迁移票的状态是**投影**，没有任务时用 `legacy_status`；存一个 `status` 就是第二个真相。
 * 票号**沿用** legacy 票号（"两套票号并存"：新票 = `ticket-YYYYMMDD-NN`）。
 */
export function migratedTicketRecord({
  id, title, source, next_step, acceptance,
  legacy_status, legacy_ref, at, finding_refs = [], created_at = null,
}) {
  return {
    id,
    title,
    source,
    next_step,
    acceptance,
    legacy_status,
    legacy_ref,
    migrated_at: at,
    finding_refs: Array.isArray(finding_refs) ? [...finding_refs] : [],
    created_at: isFilledString(created_at) ? created_at : at,
    last_update: at,
    closure_evidence: null,
    void_reason: null,
    re_present: null,
    re_present_history: [],
    closed_at: null,
  }
}

/** 下一个 `pause_id`（`pause-<YYYYMMDD>-<NN>`；与票号 / `transition_id` 同一个 8 位派生）。 */
export function nextPauseId(pauses, dayKey) {
  const prefix = `pause-${dayDigitsOfKey(dayKey)}-`
  const taken = new Set((Array.isArray(pauses) ? pauses : []).map((p) => p?.pause_id))
  let seq = (Array.isArray(pauses) ? pauses : []).filter((p) => typeof p?.pause_id === 'string' && p.pause_id.startsWith(prefix)).length + 1
  while (taken.has(`${prefix}${String(seq).padStart(2, '0')}`)) seq += 1
  return `${prefix}${String(seq).padStart(2, '0')}`
}

/**
 * **活会话必须被声明停过**（`route-mark pause` 与 `stage-enter` 共用的那一条判据）。
 *
 * 范围 = `status === 'in_progress'` **且** 工作种类 `implement`（`bug-repair` 的在途任务**照旧占槽**：
 * "旧 set 关闭 ⇒ 在途修任务照旧占槽、不自动 free"），`session_ref` 非空、`session_exit` 为空。
 * 每一条都必须在 `sessions[]` 里被声明（`task_id` 对得上、`session_id` **逐字等于** `session_ref`）。
 *
 * @param {Array} tasks 路线任务段
 * @param {Array} sessions 声明：`[{task_id, session_id, at?}]`
 * @param {{code?:string, kindFilter?:string}} [options] 拒的时候用哪个码（两个 op 各一个）
 */
export function liveSessionTasksVerdict(tasks, sessions, { code = 'E_PAUSE_SESSION_LIVE', kindFilter = 'implement' } = {}) {
  const declared = new Map(
    (Array.isArray(sessions) ? sessions : [])
      .filter((s) => isObject(s) && isFilledString(s.task_id))
      .map((s) => [s.task_id, s]),
  )
  const live = (Array.isArray(tasks) ? tasks : []).filter((t) => isObject(t)
    && t.status === 'in_progress'
    && (t.kind ?? 'implement') === kindFilter
    && isFilledString(t.session_ref)
    && !isFilledString(t.session_exit))
  const problems = []
  for (const task of live) {
    const decl = declared.get(task.id) ?? null
    if (decl === null) {
      problems.push({ task_id: task.id, session_ref: task.session_ref, reason: 'missing' })
      continue
    }
    if (decl.session_id !== task.session_ref) {
      problems.push({ task_id: task.id, session_ref: task.session_ref, declared: decl.session_id, reason: 'session-mismatch' })
    }
  }
  if (problems.length > 0) {
    const named = problems.map((p) => (p.reason === 'missing'
      ? `${p.task_id}（活会话 ${p.session_ref} 没在 sessions[] 里声明）`
      : `${p.task_id}（声明的 session_id=${JSON.stringify(p.declared)} 与它的 session_ref=${JSON.stringify(p.session_ref)} 对不上）`))
    return {
      ok: false,
      code,
      message: `还有 ${problems.length} 个活会话没声明停过：${named.join(' / ')} —— 停会话由组长执行；停不下来就失败（不锁死、不静默放行）`,
      problems,
      live,
    }
  }
  return { ok: true, code: null, message: '', problems: [], live }
}

/** 把 `session_exit` + `paused` 写到那些**被声明停过**的在途实现任务上（`session_ref` **不清**）。 */
export function applySessionExit(tasks, liveTasks, at) {
  const ended = new Set((Array.isArray(liveTasks) ? liveTasks : []).map((t) => t?.id).filter(isFilledString))
  return (Array.isArray(tasks) ? tasks : []).map((t) => (isObject(t) && ended.has(t.id)
    ? { ...t, session_exit: at, status: 'paused' }
    : t))
}

/** 一次暂停记录（契约 §10.2 第 5 条的冻结形状）。 */
export function pauseRecord({
  pause_id, at, reason, entry_ids = [], line = null, evidence = null,
}) {
  return {
    pause_id,
    state: 'open',
    opened_at: at,
    by: 'leader',
    reason,
    entry_ids: [...new Set((Array.isArray(entry_ids) ? entry_ids : []).filter(isFilledString))],
    line: isFilledString(line) ? line : null,
    evidence: isObject(evidence) ? { ref: evidence.ref ?? null, at: evidence.at ?? null } : null,
    closed_at: null,
    closed_by: null,
  }
}
