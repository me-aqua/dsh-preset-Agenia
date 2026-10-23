/**
 * `RFG-02` · **`F-148`** —— 接缝：`inject.js` 里那条 `llm/stream` waterfall 监听器。
 *
 * 被测面：staged `inject.js` 的 `apply(ctx, config)` 注册出来的 `llm/stream` 监听器
 * （`.tools/_staging/agenia-upgrade/preset/inject.js`）。
 *
 * 接缝事实（2026-10-23 从 `E:\HarnessCLI\resources\app.asar` 解出来读的，见 `CONTRACT.md` §10.5）：
 *   · `cordis/lib/index.js:317-325` —— waterfall 的监听器签名是 `(…args, next)`，返回值原样当 `waterfall()` 的返回值；
 *   · `dsh-llm/lib/index.js:2397` —— `ctx.waterfall(this, "llm/stream", options, () => this.adapterStream(...))`；
 *   · `dsh-agent-loop/lib/index.js:1084-1090` —— `const stream = llm.stream(request)` → `for await (const chunk of stream)`。
 * ⇒ 监听器**必须同步返回 AsyncIterable**（写成 `async` 函数返回 `Promise` 会当场 `TypeError`，回答整个没了）。
 *
 * 七格（`want` 手写，不从实现反推）：
 *   `S0 注册`     `apply()` 之后 `llm/stream` 恰好一条监听器
 *   `S1 形状`     调用它是**同步**拿到 AsyncIterable（不是 Promise）· `next()` 恰好一次
 *   `S2 过滤`     `reasoning-delta` 的文本拼起来 = `stripShortParagraphs` 的结果（含跨 delta 的半行 + 围栏拆开）
 *   `S3 透传`     其它 chunk（正文 / 工具 / finish / 未知类型）**同一个对象**、相对次序不变、一个不少
 *   `S4 字段`     `reasoning-delta` 的 `index` 逐个保留（尾巴那条用最后见过的 index）
 *   `S5 尾巴`     末段没有换行 ⇒ 靠流结束时的 `flush()` 吐出来
 *   `S6 不抛`     过滤时抛错 ⇒ 不冒到流上 · 出事的 chunk 原样吐出 · 后面的照旧过滤 · `console.error` **只一次**
 *
 * 三臂：`SUT`（今天没有监听器 ⇒ 红）· `REF`（照 §10.5 写的最小接缝 ⇒ 必须全绿）·
 * 刀（删掉 REF 里那对 `try`/`catch` ⇒ **只翻 `S6`**）。
 *
 * 边界（这一条不覆盖什么）：只钉**行为**（喂假流看产出）。真机上"落盘之后看不到"那一格
 * 属于定形验收 #5（GUI，只能老板重启后点一次）；`live.blocks()` 是本用例之外的既有行为，不改。
 */
import { before, describe, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { REF_FILTER_SOURCE, REF_LISTENER_SOURCE, importSource, knifeCatch } from '../support/reasoning-ref.mjs'
import { EVENT, drive, loadSeam, nonReasoning, reasoningText } from '../support/reasoning-seam.mjs'

before(() => {
  preflight()
})

/** `RFG-02` 的夹具：三个 reasoning delta 把一行切碎 + 围栏开/收被拆在两个 delta 里 + 末段没有换行。 */
const SEAM_CHUNKS = () => ([
  { type: 'text-delta', index: 0, text: '先说话' },
  { type: 'reasoning-delta', index: 3, text: '我应该：\n' },        // 3 单元 ⇒ 删
  { type: 'reasoning-delta', index: 3, text: '关键：\n' },          // 2 ⇒ 删
  { type: 'reasoning-delta', index: 3, text: '四个汉字啊\n' },       // 5 ⇒ 留
  { type: 'reasoning-delta', index: 3, text: '```js\n' },          // 围栏开
  { type: 'tool-call', index: 0, id: 't1', name: 'read' },
  { type: 'reasoning-delta', index: 3, text: '}\n``' },            // 围栏内的 `}`（1 单元，靠围栏留）
  { type: 'tool-call-delta', index: 0, id: 't1', argumentsText: '{"a":1}' },
  { type: 'reasoning-delta', index: 3, text: '`\n' },              // 围栏闭（被切在上一条里）
  { type: 'reasoning-delta', index: 3, text: 'abc\n' },            // 1 ⇒ 删
  { type: 'reasoning-delta', index: 3, text: '我们应该走这条路' },     // 8 ⇒ 留，末尾没有换行 ⇒ 靠 flush
  { type: 'usage', usage: { promptTokens: 1, completionTokens: 2 } },
  { type: 'finish', reason: { kind: 'stop' } },
])
/** 手写期望：围栏内那两段留着、围栏外碎段删掉、末段由 `flush()` 吐出。 */
const SEAM_WANT = '四个汉字啊\n```js\n}\n```\n我们应该走这条路'
const SEAM_TAIL = '我们应该走这条路'

/** 出错那一组：两条 `text` 取值就抛的 `reasoning-delta`，中间夹着一条正常段（证明"流继续"）。 */
const BOOM = (marker) => ({
  type: 'reasoning-delta',
  index: 3,
  get text() {
    throw new Error(marker)
  },
})
const ERROR_CHUNKS = () => {
  const boom1 = BOOM('E148-A')
  const boom2 = BOOM('E148-A')
  const chunks = [
    { type: 'reasoning-delta', index: 3, text: '我应该：\n' },   // 删
    boom1,
    { type: 'reasoning-delta', index: 3, text: '我们应该\n' },   // 留（出错之后照旧过滤）
    boom2,
    { type: 'reasoning-delta', index: 3, text: '关键：\n' },     // 删
    { type: 'text-delta', index: 0, text: '正文不动' },
  ]
  return { chunks, boom1, boom2 }
}

/**
 * 把一个监听器喂给七格 —— 返回 `{ key, held, got, want, note }[]`。
 * `S0` 只有 `SUT` 那一臂能判（`REF` 是一条裸监听器，没有"注册"这件事）。
 * ⚠️ 量具（`loadSeam()` / `drive()`）住 `support/reasoning-seam.mjs` —— `RFG-03` 用的是**同一份**。
 */
async function evaluateListener(handler, { checkRegistration = false, registration = 0 } = {}) {
  const rows = []
  const row = (key, held, want, got, note) => rows.push({ key, held, want, got, note })

  if (checkRegistration) {
    row('S0', registration === 1, '恰好 1 条 llm/stream 监听器', `${registration} 条`, '`apply()` 之后注册了几条 `ctx.on(\'llm/stream\')`')
  }
  if (handler === null) {
    // 没有监听器 ⇒ 只有"注册"这一格可判（上面已经记了）；其余六格**没得喂**（如实写，不假装量过）
    return rows
  }

  const chunks = SEAM_CHUNKS()
  const r1 = await drive(handler, chunks)
  row('S1', r1.syncAsyncIterable && r1.calls === 1 && r1.threw === null,
    '同步返回 AsyncIterable · next() 恰好一次 · 不抛',
    `syncAsyncIterable=${r1.syncAsyncIterable} next=${r1.calls} threw=${r1.threw ?? '无'}`,
    '`dsh-agent-loop` 是 `for await (… of llm.stream(request))` —— Promise 会当场 TypeError')

  row('S2', r1.threw === null && reasoningText(r1.out) === SEAM_WANT,
    JSON.stringify(SEAM_WANT), r1.threw === null ? JSON.stringify(reasoningText(r1.out)) : r1.threw,
    '碎段删掉（含跨 delta 的半行）、围栏内保留、围栏开/收被拆在两个 delta 里也认得出')

  const srcSide = nonReasoning(chunks)
  const outSide = nonReasoning(r1.out)
  const sameOrder = srcSide.length === outSide.length && srcSide.every((chunk, i) => chunk === outSide[i])
  row('S3', sameOrder, `${srcSide.length} 条原样透传（同对象、同次序）`,
    `${outSide.length} 条；逐条同对象=${sameOrder}`, '正文 / 工具调用 / usage / finish 一个字节不动')

  const reasoningOut = r1.out.filter((chunk) => chunk?.type === 'reasoning-delta')
  const indexOk = reasoningOut.length > 0 && reasoningOut.every((chunk) => chunk.index === 3)
  row('S4', indexOk, '每条 reasoning-delta 的 index 都是 3（含 flush 吐的尾巴）',
    reasoningOut.map((chunk) => `${chunk.type}#${String(chunk.index)}`).join('·'), '尾巴那条也要带上最后见过的 index')

  // 尾巴那一格（`S5`）：末段没有换行 ⇒ 它只能靠 `flush()` 以**一条自己的 reasoning-delta** 出现。
  // ⚠️ 次序（"排在 `finish` 之前"）**不在这一格** —— 那是 §10.5 重开时新加的契约，由 `RFG-03` 的 `A3` 单独承重。
  //    这一格不兼管次序：把两件事塞进一格，改次序的那天会看起来像"尾巴没了"。
  const tailChunkAt = r1.out.findIndex((chunk) => chunk?.type === 'reasoning-delta' && chunk.text === SEAM_TAIL)
  row('S5', r1.threw === null && tailChunkAt >= 0,
    `存在一条 reasoning-delta 的文本恰好是尾巴「${SEAM_TAIL}」`,
    tailChunkAt >= 0 ? `在第 ${tailChunkAt} 条` : `没有这条（拼接=${JSON.stringify(reasoningText(r1.out))}）`,
    '末段没有换行 ⇒ 只能靠 `flush()` 把它吐出来（次序那一格在 RFG-03 的 A3）')

  const { chunks: errChunks, boom1, boom2 } = ERROR_CHUNKS()
  const r2 = await drive(handler, errChunks)
  const contained = r2.threw === null
    && r2.out.includes(boom1) && r2.out.includes(boom2)
    && r2.errors.length === 1
    && reasoningText(r2.out, [boom1, boom2]) === '我们应该\n'
  row('S6', contained,
    '不抛 · 出事的 chunk 原样吐出 · 后面的照旧过滤 · console.error 恰好 1 次',
    `threw=${r2.threw ?? '无'} · 原对象在输出里=${r2.out.includes(boom1)}/${r2.out.includes(boom2)}`
    + ` · console.error=${r2.errors.length} 次 · 过滤后的文本=${JSON.stringify(reasoningText(r2.out, [boom1, boom2]))}`,
    '过滤器住在每一条模型调用的内侧：抛一次 = 整条流断，答案正文跟着一起没')

  return rows
}

describe('integration · reasoning seam (RFG) · F-148 llm/stream 监听器', () => {
  test('RFG-02 inject.js 的 llm/stream 监听器：只改 reasoning-delta、不许抛；阳性对照 + 刀', async () => {
    await runCase('RFG-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── ⓪ 被测面：staged inject.js 的 apply()（量具与 `RFG-03` 共用一份）────────
      const seam = await loadSeam()
      const applyError = seam.applyError
      if (seam.surfaceMissing) {
        push('SUT-SURFACE-MISSING', `staged/inject.js 不在 —— 接缝那一半拿不到（第 3 关落地方向见 CONTRACT.md §10.5）`)
      } else if (seam.importErrors.length > 0 && seam.registrations === 0 && applyError !== null) {
        push('SUT-SURFACE-MISSING', `staged/inject.js 用不了：${seam.importErrors.join('；').slice(0, 200)}`)
      } else if (applyError !== null) {
        push('SEAM-APPLY-FAILED', `apply() 在假 ctx 上抛了：${applyError} —— 连注册都走不到（这一格红了先查 apply 的依赖面）`)
      }
      const list = seam.registrations > 0 ? [seam.handler] : []
      rec.readings.sut = {
        surfaceMissing: seam.surfaceMissing,
        applyError,
        registrations: seam.registrations,
        events: seam.events,
      }
      const surfaceUsable = !seam.surfaceMissing && applyError === null
      if (surfaceUsable && seam.registrations === 0) {
        push('SEAM-NOT-REGISTERED',
          'staged/inject.js 的 apply() 没有注册 `llm/stream` 监听器 —— 思考链在落盘之前没有任何东西在清'
          + '（这一条就是本票第 3 关要装的那一句；契约 §10.5）')
      }
      if (seam.registrations > 1) {
        push('SEAM-MULTI-REGISTERED', `\`llm/stream\` 注册了 ${seam.registrations} 条监听器 —— 契约要求恰好一条（多一条就是两条过滤叠着跑）`)
      }

      // ── ① 被测面：七格 ────────────────────────────────────────────────────
      const sutHandler = list.length > 0 ? list[0] : null
      if (!surfaceUsable) {
        rec.readings.sut_cells = 'NOT-EVALUATED（apply() 没走到 / 模块不在 —— 连注册都看不到）'
      } else {
        const rows = await evaluateListener(sutHandler, { checkRegistration: true, registration: list.length })
        rec.readings.sut_cells = rows.map((r) => ({ key: r.key, want: r.want, held: r.held, got: r.got }))
        if (sutHandler === null) rec.readings.sut_cells_not_evaluated = 'S1..S6 没得喂（没有监听器）；那一条红由 SEAM-NOT-REGISTERED 说'
        for (const r of rows) {
          if (r.held) continue
          // `S0` 已经在上面按"注册了几条"报过了（`SEAM-NOT-REGISTERED`），别重复报同一件事
          if (r.key === 'S0') continue
          push(`RFG-${r.key}`, `[接缝] ${r.key}：want ${r.want}，实得 ${r.got} —— ${r.note}`, { cell: r.key, want: r.want, got: r.got })
        }
      }

      // ── ② 阳性对照：照 §10.5 写的最小接缝 ⇒ 七格（除 S0）必须全部成立 ────────
      let knifeSource = null
      try {
        const ref = await importSource('RFG-02', 'ref', {
          'reasoning-filter.mjs': REF_FILTER_SOURCE,
          'listener.mjs': REF_LISTENER_SOURCE,
        }, 'listener.mjs')
        knifeSource = REF_LISTENER_SOURCE
        const rows = await evaluateListener(ref.mod.llmStreamListener)
        rec.readings.ref = {
          file: ref.entry,
          sha256: ref.sha256['listener.mjs'],
          filter_sha256: ref.sha256['reasoning-filter.mjs'],
          held: rows.filter((r) => r.held).length,
          total: rows.length,
          cells: rows.map((r) => ({ key: r.key, want: r.want, held: r.held, got: r.got })),
        }
        for (const r of rows) {
          if (r.held) continue
          push('CONTROL-REF-CELL',
            `阳性对照（照 CONTRACT.md §10.5 写的最小接缝）在 ${r.key} 没成立：want ${r.want}，实得 ${r.got}`
            + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理')
        }
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小接缝 import/驱动失败：${String(err?.message ?? err).slice(0, 200)}`)
      }

      // ── ③ 反向刀：删掉 REF 里那对 try/catch ⇒ 只翻 S6 ──────────────────────
      const cut = knifeSource === null ? null : knifeCatch(knifeSource)
      if (knifeSource === null) {
        push('KNIFE-NO-BASELINE', '阳性对照没起来 ⇒ 这一刀没有可比的对象（刀与基线是两件事）')
      } else if (cut === null) {
        push('KNIFE-LINE-MISSING',
          'REF 里找不到那对 `try` / `} catch (err) { … }`（正则 `^ *try \\{\\n` 与 `^ *\\} catch \\(err\\) \\{\\n[\\s\\S]*?\\n *\\}\\n`）'
          + ' —— 这一刀没有落点，证明不了任何事')
      } else {
        try {
          const knife = await importSource('RFG-02', 'knife', {
            'reasoning-filter.mjs': REF_FILTER_SOURCE,
            'listener.mjs': cut.source,
          }, 'listener.mjs')
          const rows = await evaluateListener(knife.mod.llmStreamListener)
          const flipped = rows.filter((r) => !r.held).map((r) => r.key)
          rec.readings.knife = { file: knife.entry, sha256: knife.sha256['listener.mjs'], removed: cut.removed, flipped }
          if (!flipped.includes('S6')) {
            push('KNIFE-NOT-FLIPPED',
              '把 `try`/`catch` 整块删掉之后 S6（出错不抛）**仍然成立** ⇒ 这一刀没让任何一格翻面 ⇒ S6 不是靠那段代码成立的')
          }
          for (const key of flipped) {
            if (key === 'S6') continue
            push('KNIFE-SIDE-EFFECT',
              `${key} 在这一刀下也翻面了 —— 删"出错兜住"那段不该动到它；一个变异体只证一格（见 mig-rules-16）`)
          }
        } catch (err) {
          push('KNIFE-IMPORT', `刀出了 import/驱动失败（那不是"翻面"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`)
        }
      }

      // ── ④ 写清"哪里判不了" ────────────────────────────────────────────────
      rec.readings.boundary = {
        harness: '假 ctx：`get(systemPrompt)= {}` · `get(tools) = {guard, register}` 桩 · `on` 收监听器 · `effect(run)= run()`；被测面是 staged 树。',
        not_covered: '落盘之后/GUI 那一格（定形验收 #5）不在本用例里：`inject.js` 只在 apply() 里读一次 ⇒ 生效要重启客户端，只能老板点一次。',
        expect_today: '今天 S0 红（`SEAM-NOT-REGISTERED`：staged inject.js 里没有那条监听器）；REF 六格全绿；刀只翻 S6。',
      }

      caseFail(problems)
    })
  })
})
