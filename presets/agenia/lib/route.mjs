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

/** 任务的三种状态（v5 的 `open | in_progress | done`）。 */
export const TASK_STATUSES = Object.freeze(['open', 'in_progress', 'done'])

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

  const allowedKeys = new Set(['tasks', 'current_task_id', 'version', 'note'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return bad('E_ARG_SCHEMA', `task-set 不认识入参里的 ${JSON.stringify(key)} —— 只认 ${[...allowedKeys].join(' / ')}`)
    }
  }
  if (!Array.isArray(payload.tasks)) return bad('E_ARG_SCHEMA', `tasks 必须是数组（可以是空数组），实得 ${JSON.stringify(payload.tasks)}`)

  const stageIds = new Set((graph?.stages ?? []).map((s) => s.id))
  const allowedTaskKeys = new Set(['id', 'stage_id', 'title', 'status', 'five_gate_state', 'note'])
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
    if (!TASK_STATUSES.includes(raw.status)) return bad('E_ARG_SCHEMA', `任务 ${raw.id} 的 status 必须是 ${TASK_STATUSES.join(' | ')}，实得 ${JSON.stringify(raw.status)}`)
    if (!isFilledString(raw.stage_id) || !stageIds.has(raw.stage_id)) {
      return bad('E_TASK_STAGE_MISMATCH', `任务 ${raw.id} 属的阶段 ${JSON.stringify(raw.stage_id)} 不在阶段图里（${[...stageIds].join(' / ')}）`)
    }
    const gate = fiveGateVerdict(raw.five_gate_state)
    if (!gate.ok) return gate
    tasks.push({
      id: raw.id,
      stage_id: raw.stage_id,
      title: raw.title,
      status: raw.status,
      five_gate_state: raw.five_gate_state ?? null,
      note: raw.note ?? null,
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
  return { ok: true, code: null, message: '', tasks, current_task_id: pointer }
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

/** 还有没做完的任务就要切阶段 ⇒ `E_TASKS_OPEN`（RT-04 ⑤）。 */
export function openTasksVerdict(route) {
  const open = (route?.tasks ?? []).filter((t) => t.stage_id === route?.current_stage_id && t.status !== 'done')
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

/** 新建一份路线对象（`init` 与"空路线重来"共用）。`version` 由调用方给 —— **重来也不回退**。 */
export function newRouteObject({ goal, stages, current_stage_id: currentStageId, at, version = 1 }) {
  return {
    schema: ROUTE_SCHEMA_VERSION,
    goal: { id: goal.id, title: goal.title },
    stages,
    current_stage_id: currentStageId,
    tasks: [],
    current_task_id: null,
    tickets: [],
    transitions: [],
    version,
    created_at: at,
    updated_at: at,
  }
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
    for (const t of tickets) lines.push(`- ${t.id} · ${t.title} · ${t.status}`)
  }
  const transitions = route?.transitions ?? []
  if (transitions.length > 0) {
    lines.push('')
    lines.push(`阶段切换（${transitions.length} 次）`)
    for (const tr of transitions.slice(-5)) lines.push(`- ${tr.transition_id} · ${tr.from_stage_id} → ${tr.to_stage_id} · ${tr.at}`)
  }
  return lines.join('\n')
}
