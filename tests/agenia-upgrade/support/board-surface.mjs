/**
 * `BRD-01` 的量具 —— **板子那一段的注入文字**（`F-152` · 2026-10-23）。
 *
 * 测的**不是** `inject.js` 的源码长得像什么，而是**那一步真的被塞进请求里的那条消息**写了什么：
 *   ① 在假 ctx 上跑 staged `inject.js` 的 `apply()`（唯一入口：`reasoning-seam.mjs` 的
 *      `loadAppliedSurface()` —— 与 `RFG-02`/`RFG-03` 共用同一套假 ctx，别处不许再建一套会话）；
 *   ② 按真 harness 的次序喂**插件事** `tools/result`（板子的账本只听这个口 —— 见 `.tools/inject-probe.mjs:657-668`）；
 *   ③ 走一次 `agent/pre-step` 瀑布（基态 `{ kind: 'enter', messages: [] }`），把返回的
 *      `decision.messages` 里**新加的那一条**正文取出来 —— 那就是"这一步送出去的请求里多出来的话"。
 *
 * 🔴 为什么只喂 `tools/result`、不喂 `session/event`：
 *   板子的账本（`inject.js` 的 `ctx.on('tools/result')`）只认插件事；`session/event` 的
 *   `tool/result` 只喂机制① 的计数，喂不出"板子变了"。这一格量的是板子，所以只走前一条。
 *   ⇒ 副产品：`pendingTail`（机制① 的挂账）永远是空的，于是"这一步为什么要贴"**只可能**是板子变了 ——
 *   与 `F-94` 的第三个触发点同形（`.tools/inject-probe.mjs` 的 `G13` 也是这么造那一格的）。
 *
 * ⚠️ **只发事件，不落盘**：`toolResult('write', { file_path: … })` 模拟的是"一次成功的写入**结果**"
 *   （账本只读 `call.name` + `call.arguments[WRITE_TARGET[name]]` + `agent.session.header.cwd`），
 *   **一个字节都不写**。所以这一格证明的是"板子怎么记账"，不是"写入工具真的写成功了"。
 *
 * ⚠️ **不跑 `system-prompt/assemble`**：那一步的作用是把"这次开口的是哪个岗位"记进 `roleOfAgent`，
 *   组员才因此整条不贴（`inject.js:2085`）。这一格造的是**组长那条路**（没有组员标记 ⇒ 不是组员），
 *   所以不登记、也不读那几份 `.md`。真 harness 里装配排在 pre-step 之前（`dsh-agent-loop` L889→L894）。
 */
import { loadAppliedSurface } from './reasoning-seam.mjs'
import { stagingRoot } from './sut.mjs'

/**
 * `delegationTools` 的**夹具值**：`apply()` 只在它缺失/非法时往 stderr 喊一句
 * （`E_GUARD_CONFIG_MISSING`）。这一格与门禁无关，所以给一份合法的最小名单把那句噪声关掉。
 * ⚠️ 它**不是**被测面的一部分：没有一条断言读它。
 */
const FIXTURE_DELEGATION = { subagent: 'one-shot', team_dev: 'one-shot', team_test: 'one-shot', team_review: 'one-shot' }

/**
 * 开一次**假的组长会话**（每个会话一份账本）。
 *
 * 每次调用都是一次新的 `apply()` —— `ledgers` / `lastBoardPosted` / `moods` 都是 `apply()` 内部的闭包状态
 * （`inject.js:1252` 起），所以三个格子互不串账。
 *
 * @param {{id: string, cwd: string}} args  `id` = 会话 id（会写进 `agent.id`）；`cwd` = 项目根（判"写的是不是 `.team/` 之外的路径"）
 * @returns {Promise<{
 *   surfaceMissing: boolean, importErrors: string[], applyError: string[],
 *   events: string[], agent: object,
 *   toolResult: (name: string, args?: object) => Promise<void>,
 *   stepBegin: () => Promise<{text: string, messages: object[]}>,
 * }>}
 */
export async function openBoardSession({ id, cwd }) {
  const surface = await loadAppliedSurface({
    config: { contentDir: stagingRoot(), delegationTools: FIXTURE_DELEGATION },
  })
  const applyError = []
  if (surface.applyError !== null) applyError.push(surface.applyError)
  if (surface.surfaceMissing) applyError.push('staged/inject.js 不在（板子没有可喂的东西）')

  const agent = { id, session: { id, header: { cwd }, appending: false } }

  /** 一条**插件事**结果。板子的账本只在 `ctx.on('tools/result')` 上（`inject.js:1438`）。 */
  const toolResult = async (name, args = {}) => {
    for (const handler of surface.handlers.get('tools/result') ?? []) {
      await handler({ name, arguments: args, agent }, undefined)
    }
  }

  /**
   * 走一次 `agent/pre-step` 瀑布（次序照 Cordis：后注册的在内层，先注册的先看到 `next()` 的结果）。
   * 基态 = `{ kind: 'enter', messages: [] }`（收件箱空、没有老板消息）⇒
   * 这一刀"要不要贴"的**唯一**可能理由是 `boardChanged`。
   */
  const stepBegin = async () => {
    const payload = { agent, messages: [], step: 1, turn: 1, signal: { aborted: false, throwIfAborted() {} } }
    const list = surface.handlers.get('agent/pre-step') ?? []
    let next = async () => ({ kind: 'enter', messages: payload.messages })
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const handler = list[i]
      const inner = next
      next = () => handler(payload, inner)
    }
    const decision = await next()
    if (decision?.kind === 'reject') return { text: '', messages: [], rejected: true }
    const messages = Array.isArray(decision?.messages) ? decision.messages : []
    const text = messages
      .map((message) => (Array.isArray(message?.content) ? message.content : [])
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join(''))
      .join('\n')
    return { text, messages }
  }

  return {
    surfaceMissing: surface.surfaceMissing,
    importErrors: surface.importErrors,
    applyError,
    events: surface.events,
    agent,
    toolResult,
    stepBegin,
  }
}

/** 尾巴正文里**板子那一段**（`【这一票的进度】` 起、到下一个空段之前）；没有 ⇒ `undefined`。 */
export function boardPartOf(text) {
  return String(text ?? '').split(/\n\n/).find((part) => part.includes('【这一票的进度】'))
}

/**
 * 板子那一段里的**告警行**（以 `⚠️` 开头的那几行，按原次序拼回去）。
 *
 * 为什么要这一层：板子的第一行是进度（`设计 0 · 开发 1 · …`），三格的判据都只关于**告警**；
 * 把进度行留在文字里会让"叫过开发"这种针在**别的格子**里被进度行意外满足（`开发 0` 不满足，
 * 但那是巧合，不是判据）。⇒ 判据只读告警行，读法写在这里一处。
 */
export function warningLinesOf(boardPart) {
  if (typeof boardPart !== 'string') return ''
  return boardPart
    .split('\n')
    .filter((line) => line.startsWith('⚠️'))
    .join('\n')
}
