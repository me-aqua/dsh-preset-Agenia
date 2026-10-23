/**
 * `F-148` 接缝的两个**量具**（`RFG-02` 与 `RFG-03` 共用，**只有一份**）：
 *
 *   ① `loadSeam()` —— 在**假 ctx** 上跑 staged `inject.js` 的 `apply()`，把注册出来的
 *      `llm/stream` 监听器取出来。假 ctx 的形状照 `.tools/inject-probe.mjs:470-489` 那套
 *      （`get` / `on` / `effect` 三样 + `baseUrl`），被测面永远是 staged 树。
 *   ② `drive()` —— **同步调用**监听器、先看返回值形状，再迭代。三件事分开记：
 *      `syncAsyncIterable`（`dsh-agent-loop` 是 `for await`，Promise 会当场 TypeError）、
 *      `calls`（`next()` 次数）、`threw`（调用期 / 迭代期冒出来的异常）。
 *
 * 为什么做成一份：两个用例判的是同一件事的两层（delta 层 / 装配层），
 * 量具抄两份的那天两份就会分叉 —— 而"分叉的量具"量出来的两个读数不能互相印证
 * （`cand-20261019-0030`）。
 */
import { sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadStagedModule, stagingRoot } from './sut.mjs'

export const EVENT = 'llm/stream'

/**
 * 在假 ctx 上跑 `apply()`，取 `llm/stream` 的监听器。
 *
 * @returns {Promise<{
 *   surfaceMissing: boolean, importErrors: string[], applyError: string|null,
 *   registrations: number, events: string[], handler: Function|null,
 * }>}
 */
export async function loadSeam() {
  const inject = await loadStagedModule('inject.js', [])
  const handlers = new Map()
  const out = {
    surfaceMissing: inject.surfaceMissing,
    importErrors: inject.errors,
    applyError: null,
    registrations: 0,
    events: [],
    handler: null,
  }
  if (inject.surfaceMissing || inject.mod === null) return out
  if (typeof inject.mod.apply !== 'function') {
    out.applyError = 'staged/inject.js 没有导出 apply()'
    return out
  }
  const ctx = {
    baseUrl: pathToFileURL(`${stagingRoot()}${sep}`).href,
    get(name) {
      if (name === 'systemPrompt') return {}
      // 门禁 / 提候选这两样与本票无关：给个不吭声的桩，免得 apply() 往 stderr 喊两句
      if (name === 'tools') return { guard: () => () => {}, register: () => () => {} }
      return undefined
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    effect(run) { return run() },
  }
  try {
    await inject.mod.apply(ctx, { contentDir: stagingRoot() })
  } catch (err) {
    out.applyError = String(err?.message ?? err).slice(0, 300)
  }
  const list = handlers.get(EVENT) ?? []
  out.registrations = list.length
  out.events = [...handlers.keys()]
  out.handler = list.length > 0 ? list[0] : null
  return out
}

/**
 * 驱动一条 `llm/stream` 监听器 —— **同步调用**，先看返回值形状，再迭代。
 *
 * `console.error` 在迭代窗口里被替换成收集器（"出声一次"那一格靠它量），`finally` 里还原。
 *
 * @param {Function} handler
 * @param {Array<object>} chunks 喂给监听器的原始流
 * @returns {Promise<{calls:number, out:object[], errors:string[], threw:string|null, syncAsyncIterable:boolean}>}
 */
export async function drive(handler, chunks) {
  let calls = 0
  const next = () => {
    calls += 1
    return (async function* () {
      for (const chunk of chunks) yield chunk
    })()
  }
  const out = []
  const errors = []
  const orig = console.error
  let returned
  let syncAsyncIterable = false
  let threw = null
  console.error = (...args) => { errors.push(args.map((a) => String(a)).join(' ')) }
  try {
    try {
      returned = handler({}, next)
      syncAsyncIterable = returned !== null
        && (typeof returned === 'object' || typeof returned === 'function')
        && typeof returned[Symbol.asyncIterator] === 'function'
    } catch (err) {
      threw = `调用监听器就抛了：${String(err?.message ?? err).slice(0, 160)}`
    }
    if (threw === null) {
      try {
        for await (const chunk of returned) out.push(chunk)
      } catch (err) {
        threw = `迭代时抛了：${String(err?.message ?? err).slice(0, 160)}`
      }
    }
  } finally {
    console.error = orig
  }
  return { calls, out, errors, threw, syncAsyncIterable }
}

/** 一条流里 `type === 'reasoning-delta'` 的文本拼接 —— **跳过指定的对象**（那几条 `.text` 会抛）。 */
export function reasoningText(out, skip = []) {
  let text = ''
  for (const chunk of out) {
    if (skip.includes(chunk)) continue
    if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') text += chunk.text
  }
  return text
}

/** 非 `reasoning-delta` 的 chunk（相对次序 + 对象身份都靠它）。 */
export const nonReasoning = (out) => out.filter((chunk) => chunk?.type !== 'reasoning-delta')

/** 第一条 `finish` 在输出里的位置（没有 ⇒ `-1`）。 */
export const firstFinishAt = (out) => out.findIndex((chunk) => chunk?.type === 'finish')
