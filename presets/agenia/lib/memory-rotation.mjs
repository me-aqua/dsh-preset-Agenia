/**
 * 记忆库的**循环插入**（老板 2026-11-08 18:1x 定）。
 *
 * 口径（逐字）：「『轮』就是按现在贴语气和常识的那个 **every=10** 的标准，从 200 条里把**通用的**和
 * **属于当前会话项目的**挑出来，然后**轮转**往上贴，**一次 10 个**」。
 *
 * 这个模块**只做取块**（纯函数式：输入快照 + 游标 + 项目名，输出一段文本与新游标），
 * 贴的时机与位置由 `inject.js::tailBodyOf` 决定（和语气同一个尾块）。
 *
 * 🔴 三条口径边界（写在这里，省得下一个读的人去猜）：
 *   · **不许静默变空**：挑不到 / 快照读不到 / 游标坏了 ⇒ **出声**并给一段说得清的兜底块；
 *   · **"本项目"只能靠正文点名** —— 快照条目里**没有** project 字段（`type` 只有 general/boss/machine/project），
 *     所以拿项目名去匹配 `text` + `known_from`；**正文没点名的项目条目永远不会被挑中**（这是数据形状，不是判据选择）；
 *   · **一次 10 条、按 id 排序轮转**，本项目不足就由 general 补齐，**补齐事实写进块尾**。
 */

/** 一次贴几条（老板定的数）。 */
export const ROTATION_SIZE = 10

/**
 * 每轮本品类条目的**名额上限**（不是"固定掺这么多"）：实际取 `min(上限, max(1, 池长-1))`。
 * 为什么是"上限"而不是"固定值"：按 id 排序的合并池会让项目条目排到第 17 轮（那是缺陷不是设计），
 * 所以要**每轮掺**；但池子只有 2 条时固定掺 2 条 ⇒ `(0+2)%2 = 0` 游标恒 0，相邻两轮贴的是同两条。
 * ⇒ 池 ≤ 名额时取"池长 − 1"，游标才会动（2 条 ⇒ 每轮 1 条，0→1→0）。
 */
export const PROJECT_SLOTS = 2

/** 单条正文裁到这个长度（记忆库自己的上限就是 400 字/条，超了才裁并留记号）。 */
const ENTRY_CAP = 400

/** 游标文件的相对路径（相对**数据根**）。 */
export const CURSOR_REL = ['state', 'memory', 'rotation-cursor.json']

/** 从工作区路径取项目名（`E:\Harness` → `Harness`）。 */
export function projectNameOf(workspacePath) {
  const text = String(workspacePath ?? '').trim()
  if (text === '') return ''
  const parts = text.replace(/[\\/]+$/, '').split(/[\\/]+/)
  return parts[parts.length - 1] ?? ''
}

/**
 * 挑出可参与轮转的条目：**general 全部** + **正文/来历里点名了本项目的 project**。
 * ⚠️ `boss` / `machine` 不进这一轮（老板没让；它们各有各的注入面）。
 */
export function rotationPool(entries, project) {
  const list = Array.isArray(entries) ? entries : []
  const needle = String(project ?? '').trim().toLowerCase()
  const general = list.filter((e) => e?.type === 'general' && typeof e.text === 'string')
  const projectOnes = needle === '' ? [] : list.filter((e) => {
    if (e?.type !== 'project' || typeof e.text !== 'string') return false
    const hay = `${e.text}\n${typeof e.known_from === 'string' ? e.known_from : ''}`.toLowerCase()
    return hay.includes(needle)
  })
  const byId = (a, b) => String(a.id ?? '').localeCompare(String(b.id ?? ''))
  return { general: general.sort(byId), project: projectOnes.sort(byId) }
}

/** 从 `cursor` 开始环状取 `size` 条。 */
export function rotateFrom(list, cursor, size = ROTATION_SIZE) {
  const arr = Array.isArray(list) ? list : []
  if (arr.length === 0) return []
  const start = ((Number.isInteger(cursor) ? cursor : 0) % arr.length + arr.length) % arr.length
  const take = Math.min(size, arr.length)
  return Array.from({ length: take }, (_, i) => arr[(start + i) % arr.length])
}

function clip(text) {
  const s = String(text ?? '').trim()
  if (s.length <= ENTRY_CAP) return s
  return `${s.slice(0, ENTRY_CAP - 1)}…`
}

/**
 * 组一段"这一轮贴什么"。**纯函数**：游标由调用方读、写。
 *
 * @param {object} input
 * @param {object|null} input.snapshot 快照对象（`{version, entries}`）；`null` ⇒ 出声 + 兜底块
 * @param {string} input.project 项目名（工作区目录名）
 * @param {number} input.cursor 游标（从 0 开始）
 * @param {number} [input.size]
 * @returns {{text: string, nextCursor: number, picked: number, general: number, project: number, note: string}}
 */
export function rotationBlockOf({ snapshot, project, cursor = 0, cursorGeneral, cursorProject, size = ROTATION_SIZE } = {}) {
  const cursorG0 = Number.isInteger(cursorGeneral) ? cursorGeneral : cursor
  const cursorP0 = Number.isInteger(cursorProject) ? cursorProject : 0
  if (snapshot === null || snapshot === undefined || !Array.isArray(snapshot.entries)) {
    return {
      text: '## 记忆轮转\n\n⚠️ 这一轮**挑不出来**：共享记忆快照读不到或形状不对 ⇒ 记忆这一节暂时空着（不是"没有记忆"，是读不到）。',
      nextCursor: 0, picked: 0, general: 0, project: 0, note: 'snapshot-unavailable',
    }
  }
  const version = String(snapshot.version ?? '?')
  const pool = rotationPool(snapshot.entries, project)
  const merged = [...pool.general, ...pool.project]
  if (merged.length === 0) {
    return {
      text: `## 记忆轮转（快照 ${version}）\n\n⚠️ 这一轮**没有可挑的条目**（general 与「${project || '本项目'}」都是空）—— 这是读数，不是"记忆是空的"。`,
      nextCursor: 0, picked: 0, general: 0, project: 0, note: 'empty-pool',
    }
  }
  // 🔴 配比：先掺**最多** `PROJECT_SLOTS` 条本项目，其余用通用补齐 —— 两条腿各转各的游标。
  // 🔴 F3（第 4 关打回）：只改说法不算修 —— 池子 2 条、名额 2 条时 `(0+2)%2=0` 游标恒 0，
  //    相邻两轮贴的是同两条。名额取 `min(PROJECT_SLOTS, max(1, 池长-1))`：池 2 条 ⇒ 每轮取 1 条、游标 0→1→0，
  //    这样"相邻两轮不重复"（定形 Ⅳ）在池子最小的时候也成立。
  const projectTake = Math.min(PROJECT_SLOTS, Math.max(1, pool.project.length - 1))
  const generalTake = Math.max(0, size - projectTake)
  const cursorP = Number.isInteger(cursorP0) ? cursorP0 : 0
  const cursorG = Number.isInteger(cursorG0) ? cursorG0 : 0
  const pickedProject = rotateFrom(pool.project, cursorP, projectTake)
  const pickedGeneral = rotateFrom(pool.general, cursorG, generalTake)
  const picked = [...pickedGeneral, ...pickedProject]
  const nextCursorP = pool.project.length === 0 ? 0 : (cursorP + pickedProject.length) % pool.project.length
  const nextCursorG = pool.general.length === 0 ? 0 : (cursorG + pickedGeneral.length) % pool.general.length
  // 两个游标各存各的（拼成一个数会在「通用变多 / 项目变少」时错位，而且读数里分不开）
  const nextCursor = nextCursorG



  const fromProject = picked.filter((e) => e.type === 'project').length
  const lines = picked.map((e) => `- \`${e.id ?? '?'}\` · ${clip(e.text)}`)
  const projectNote = pool.project.length === 0
    ? `⚠️ 库里**没有点名「${project || '本项目'}」的条目** ⇒ 这一轮全是通用条目。`
    : pool.project.length === 1
      // 只有一条 ⇒ 无法轮转，只能重复，明说
      ? '本项目只有 1 条，每轮都会重复这一条（换不了，库里没有第二条）。'
      : `本项目条目 ${pool.project.length} 条 · 本轮挑中 ${fromProject} 条`
        + `${pool.project.length <= PROJECT_SLOTS ? `（名额 ${projectTake}：池子只比名额多一点点，取池长−1 才能保证相邻两轮不重复）` : ''}`
        + `${picked.length < size ? '，不足的用通用补齐' : ''}。`
  const text = [
    `## 记忆轮转（快照 ${version} · 本轮 ${picked.length} 条）`,
    '',
    ...lines,
    '',
    `> 可用：通用 ${pool.general.length} 条 + 本项目 ${pool.project.length} 条；本轮掺本项目 ${pickedProject.length} 条；游标 通用 ${cursorG} → ${nextCursorG} · 本项目 ${cursorP} → ${nextCursorP}。`,
    `> ${projectNote}`,
  ].join('\n')
  return {
    text, nextCursor, nextCursorGeneral: nextCursorG, nextCursorProject: nextCursorP,
    picked: picked.length, general: pool.general.length, project: pool.project.length, note: 'ok',
  }
}
