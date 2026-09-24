/**
 * 尾巴提醒的**控频探针** —— 不重启 harness 就能验 inject.js 的第 ⑤ 件事。
 *
 * 为什么要它：⑤ 是"每步都贴"翻过车的那一段（2026-09-24：老板在 GUI 里看到一串
 * 「上下文注入」当场喊停；同一段还出过"提醒被当成老板开口、模型回它两条"）。
 * 这两件事都靠**机制**保证，不靠读代码保证 —— 所以得有支探针把它按住。
 *
 * 跑法：<node.exe> .tools/inject-probe.mjs     退出码 0 = 六条全过 / 1 = 有红
 *
 * ⚠️ 它在一个**假的 ctx** 上挂真 `inject.js`（不碰真 harness、不起会话、不花 token）。
 *    验的是"这段逻辑有没有按我想的跑"，**不代替**挂载测试（见 .tools/mount-test/README.md）。
 */

import { fileURLToPath, pathToFileURL } from 'node:url'

const PRESET_DIR = fileURLToPath(new URL('../presets/agenia/', import.meta.url))
const PRESET_ENTRY = fileURLToPath(new URL('../presets/agenia/inject.js', import.meta.url))

const handlers = new Map()
const injected = []
const registry = new Map()
const makeAgent = (id) => ({ id, inject: (m) => injected.push({ owner: id, text: m.content[0].text }) })
registry.set('s1', makeAgent('s1'))

const ctx = {
  baseUrl: pathToFileURL(PRESET_DIR).href,
  get(name) {
    if (name === 'systemPrompt') return {}
    if (name === 'agents') return { get: (id) => registry.get(id) }
    return undefined
  },
  on(event, handler) {
    if (!handlers.has(event)) handlers.set(event, [])
    handlers.get(event).push(handler)
  },
  effect(run) { run() },
}

const mod = await import(pathToFileURL(PRESET_ENTRY).href)
await mod.apply(ctx, { contentDir: PRESET_DIR })

const fire = (event, ...args) => (handlers.get(event) ?? []).forEach((h) => h(...args))
const assemble = async () => {
  const assembly = { sections: [{ name: 'x', text: '没有标记' }], contexts: [], tools: [], variables: {} }
  await handlers.get('system-prompt/assemble')[0](assembly, { scope: { id: 's1' } }, async () => assembly)
  return injected.length
}
const seq = { n: 0 }
const bump = (type, kind) => fire(
  'session/event',
  { id: 's1' },
  kind === undefined ? { seq: ++seq.n, type } : { seq: ++seq.n, type, data: { source: { kind } } },
)
const bossSpeaks = () => bump('user/message', 'user')

let failures = 0
const check = (label, got, want) => {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'RED '} ${label}  ·  实测 ${got} / 期望 ${want}`)
}

// ① 回合开头：老板开口 ⇒ 下一个组装必贴一句
bossSpeaks()
check('回合开头贴一句（老板开口 ⇒ 必贴）', await assemble(), 1)

// ② 往后走 7 步：一步都不许再贴（这就是"降频"）
for (let k = 0; k < 7; k++) { bump('step/start'); bump('tool/result'); await assemble() }
check('过了 7 步还是那一句（不许每步都贴）', await assemble(), 1)

// ③ 第 8 步：隔够步数，补一句
bump('step/start'); bump('tool/result')
check('第 8 步补一句（隔够 every 步）', await assemble(), 2)

// ④ 同一个刻度重复组装：不许重复贴
check('同一 seq 重复组装不重复贴', await assemble(), 2)

// ⑤ 老板又开口：下一句必贴
bossSpeaks()
check('老板再开口 ⇒ 再贴一句', await assemble(), 3)

// ⑥ 提醒自己（plugin）不许把它点亮 —— 否则就是自己喂自己
for (let k = 0; k < 3; k++) { bump('user/message', 'plugin'); await assemble() }
check('连来 3 条 plugin 消息仍不贴（防自己喂自己）', await assemble(), 3)

console.log(`\n${failures === 0 ? '6/6 条通过' : `${failures} 条红`}`)
console.log('贴出去的那一句长这样：\n' + (injected[0]?.text ?? '(空)').slice(0, 140))
process.exit(failures === 0 ? 0 : 1)
