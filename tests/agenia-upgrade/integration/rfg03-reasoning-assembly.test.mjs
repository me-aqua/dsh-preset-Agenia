/**
 * `RFG-03` · **`F-148`** —— **落盘的那一份**（`block-end` 的 reasoning 载荷）也必须被清。
 *
 * 为什么单开一条（而不是在 `RFG-02` 里加一格）：`RFG-02` 判的是**流里的 delta**；
 * 而真机上落盘的**不是 delta**。这条用例判的是**装配之后**的文本 —— 两件事，两个承重面。
 *
 * 病根（2026-10-23 14:4x 第 2 关重开时发现，四段代码连起来读的，见 `CONTRACT.md` §10.5 那张表）：
 *   · `dsh-llm-deepseek/lib/index.js:1889-1897`：适配器**自己**把 delta 攒进 `content.text`；
 *   · 同文件 `:1981-1988`：`content_block_stop` 吐 `{type:'block-end', index, block:{...content}}` —— 那是**未过滤的全文**；
 *   · `dsh-llm/lib/index.js:991-996` / `:1020-1021`：`partial.block = chunk.block`，而 `assemble()` 第一句
 *     就是 `if (partial.block) return partial.block` ⇒ **载荷优先**，delta 攒的那一份被整份丢掉；
 *   · `dsh-agent-loop/lib/index.js:361` / `:453-454`：`blocks()` → `assembleAssistantStream` 的产物写进
 *     `assistant/message.content[]` ⇒ 落盘的就是那份载荷。
 * ⇒ **只改 `reasoning-delta` 等于什么都没改**。这条用例就是为了让那种"只改 delta"的实现当场红。
 *
 * 🔴 证据等级（照实写，**别当成"真装配器跑过"**）：
 *   装配器是 `support/reasoning-ref.mjs::assembleBlocks()` —— **按** `dsh-llm/lib/index.js:954-1123` 的
 *   `BlockAssembler` **复刻**的，不是真类。真类只在 `E:\HarnessCLI\resources\app.asar` 里；从测试树 import
 *   它要连 `@deepseek-ai/dsh-typert-protocol` / `dsh-util-values` / `dsh-util-crypto` / `dsh-brand` /
 *   `schemastery` / `dsh-timeout` 六个包一起加载（`app.asar.unpacked` 里也没有它）⇒ **测试树够不着**。
 *   复刻的**规则**由本文件的三条自控格钉住（`A-PREF` 载荷赢 · `A-ACC` 无载荷按 delta 累加 · `A-IGN`
 *   `block-end` 之后到的 delta 被忽略）；三条任一条不成立 ⇒ `ASSEMBLER-RECOMPUTE`（先查量具）。
 *   复刻与真类字节的一致性另有**一次性对账**读数（同一条流喂两边，结论逐字相同）——
 *   见 `.team/test/2026-10-23/log.md` 第五节与 `.team/test/2026-10-23/F-148-装配对账.mjs`。
 *
 * 四格（`want` 手写、不从实现反推）：
 *   `A1 真实适配器形状`  `block-start(reasoning)` → 若干 `reasoning-delta`（含 ≤3 与 ≥4 单元的段）→
 *                       `block-end`（`block.text` = 那些 delta 的**未过滤拼接**）→ `usage` → `finish`
 *                       ⇒ 装配后该 index 的 reasoning `text` 必须等于手写的清洗结果
 *   `A2 只有 block-end`  `block-start` → `block-end`（**一个 delta 都没有**，文本只在载荷里）→ `finish`
 *                       ⇒ 同样必须被清（"适配器在某些协议下就是不吐 delta"）
 *   `A3 收尾次序`        尾巴（末段没有换行那一段）必须在**第一条 `finish` 之前**出现；
 *                       `finish` 之后不许再出现任何 `reasoning-delta`
 *   `A4 正文不动`         `block-end` 的 **text 块**载荷一个字节都不许被清（它是答案正文）
 *
 * 三臂：`SUT`（今天的交付实现：只改 delta ⇒ `A1`/`A2` 红；尾巴排在 `finish` 后 ⇒ `A3` 红）·
 * `REF`（照 §10.5 写的最小接缝 ⇒ 四格全绿）· 两把刀（删载荷改写 ⇒ 只翻 `A1`/`A2`；删 `finish` 前 flush ⇒ 只翻 `A3`）。
 */
import { before, describe, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  REF_FILTER_SOURCE, REF_LISTENER_SOURCE, assembleBlocks, assembledReasoningText,
  importSource, knifeFinishFlush, knifePayload,
} from '../support/reasoning-ref.mjs'
import { drive, firstFinishAt, loadSeam } from '../support/reasoning-seam.mjs'

before(() => {
  preflight()
})

/**
 * `A1` 的夹具：**照真适配器的形状**。
 *
 * `RAW_A` = 那三条 delta 的拼接（真适配器 `content.text` 就是它）；`block-end.block.text` 用的正是这一份
 * ——**未过滤**，所以它带着 `嗯。` 这种碎段与 `ok` 这种围栏内的短段。
 */
const DELTAS_A = ['先摆事实：\n嗯。\n', '```\nok\n', '```\n我们应该走这条路']
const RAW_A = DELTAS_A.join('')
/** 手写期望：`嗯。`（1 单元）删；围栏块整块留；末段（没有换行）留。 */
const CLEAN_A = '先摆事实：\n```\nok\n```\n我们应该走这条路'
/** 末段（没有换行）—— 它只能靠 `flush()` 以一条自己的 `reasoning-delta` 出现。 */
const TAIL_A = '我们应该走这条路'

/** `A2` 的夹具：**文本只在 `block-end` 的载荷里**（一个 delta 都没有）。 */
const RAW_B = ['嗯。', '我们应该走这条路', '```', 'ok', '```'].join('\n')
const CLEAN_B = '我们应该走这条路\n```\nok\n```'

/** `A4` 的夹具：**正文（text 块）** 里故意放一个碎段 —— 它**不许**被清（那是答案正文）。 */
const TEXT_BLOCK = '答案正文：四个汉字啊\n嗯。\n'

const chunksA = () => ([
  { type: 'block-start', index: 1, blockType: 'reasoning' },
  ...DELTAS_A.map((text) => ({ type: 'reasoning-delta', index: 1, text })),
  { type: 'block-end', index: 1, block: { type: 'reasoning', text: RAW_A } },
  { type: 'usage', usage: { inputTokens: 11, outputTokens: 22 } },
  { type: 'finish', reason: { kind: 'stop' } },
])

const chunksB = () => ([
  { type: 'block-start', index: 2, blockType: 'reasoning' },
  { type: 'block-end', index: 2, block: { type: 'reasoning', text: RAW_B } },
  { type: 'finish', reason: { kind: 'stop' } },
])

/**
 * `A3` 的夹具：**delta-only**（没有 `block-end`）＋ 末段没有换行 ⇒ 尾巴只能等 `finish` 那一刻吐。
 * 为什么不用 `chunksA` 判次序：那条流里 `block-end` 先到、尾巴在**那里**就吐了 ——
 * 那样一来"`finish` 前 flush"这条契约**没有证人**（删掉它，`A3` 照样绿）。这一格要的是纯 delta 那条路。
 */
const chunksC = () => ([
  { type: 'block-start', index: 3, blockType: 'reasoning' },
  { type: 'reasoning-delta', index: 3, text: '先摆事实：\n嗯。\n' },
  { type: 'reasoning-delta', index: 3, text: TAIL_A },
  { type: 'usage', usage: { inputTokens: 3, outputTokens: 4 } },
  { type: 'finish', reason: { kind: 'stop' } },
])

const chunksD = () => ([
  { type: 'block-start', index: 9, blockType: 'text' },
  { type: 'text-delta', index: 9, text: '答案正文：四个汉字啊\n' },
  { type: 'text-delta', index: 9, text: '嗯。\n' },
  { type: 'block-end', index: 9, block: { type: 'text', text: TEXT_BLOCK } },
  { type: 'finish', reason: { kind: 'stop' } },
])

/**
 * 量具自控：**先证明这台装配器按真类的三条规则工作**，再去判实现。
 * 三条都要成立；任何一条不成立 = 量具坏了（报 `ASSEMBLER-RECOMPUTE`，**别去改实现**）。
 */
const CONTROLS = [
  {
    key: 'A-PREF',
    want: '载荷赢（`block-end` 的 text 与 delta 拼接不同时，取载荷）',
    run: () => assembledReasoningText([
      { type: 'block-start', index: 5, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 5, text: '我们应该\n' },
      { type: 'block-end', index: 5, block: { type: 'reasoning', text: '完全不同的载荷内容' } },
    ], 5),
    expect: '完全不同的载荷内容',
    why: '真类 `assemble()` 第一句就是 `if (partial.block) return partial.block`（`dsh-llm/lib/index.js:1020-1021`）',
  },
  {
    key: 'A-ACC',
    want: '没有载荷 ⇒ 按 delta 累加（delta-only 协议那一支）',
    run: () => assembledReasoningText([
      { type: 'block-start', index: 6, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 6, text: '我们应该\n' },
      { type: 'reasoning-delta', index: 6, text: '走这条路' },
    ], 6),
    expect: '我们应该\n走这条路',
    why: '真类 `case "reasoning-delta"` ⇒ `partial.text += chunk.text`（`:976-981`）',
  },
  {
    key: 'A-IGN',
    want: '`block-end` 之后到的 delta 被忽略',
    run: () => assembledReasoningText([
      { type: 'block-start', index: 7, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 7, text: 'A' },
      { type: 'block-end', index: 7, block: { type: 'reasoning', text: '载荷' } },
      { type: 'reasoning-delta', index: 7, text: 'XYZ' },
    ], 7),
    expect: '载荷',
    why: '真类 `if (partial.block) return`（`:979` / `:985` / `:993`）⇒ 载荷之后来的 delta 不参与拼装',
  },
]

/**
 * 把一个监听器喂给四格 —— 返回 `{ key, held, want, got, note }[]`。
 * 量具（`drive()` / `assembleBlocks()`）与 `RFG-02` **共用一份**。
 */
async function evaluateAssembly(handler) {
  const rows = []
  const row = (key, held, want, got, note) => rows.push({ key, held, want, got, note })
  if (handler === null) return rows

  // A1：真实适配器形状（载荷 = 未过滤全文）
  const r1 = await drive(handler, chunksA())
  const gotA1 = r1.threw === null ? assembledReasoningText(r1.out, 1) : r1.threw
  row('A1', r1.threw === null && gotA1 === CLEAN_A,
    JSON.stringify(CLEAN_A), r1.threw === null ? JSON.stringify(gotA1) : r1.threw,
    '`block-end` 的载荷是落盘的那一份 —— 它必须被清（只清 delta 会被它整份覆盖）')

  // A3：尾巴在 finish 之前；finish 之后不再有 reasoning（夹具是 delta-only，见 chunksC 的注释）
  const r3 = await drive(handler, chunksC())
  const finishAt = firstFinishAt(r3.out)
  const tailAt = r3.out.findIndex((c) => c?.type === 'reasoning-delta' && c.text === TAIL_A)
  const afterFinish = finishAt >= 0 && r3.out.slice(finishAt + 1).some((c) => c?.type === 'reasoning-delta')
  row('A3', r3.threw === null && finishAt >= 0 && tailAt >= 0 && tailAt < finishAt && !afterFinish,
    `尾巴「${TAIL_A}」出现在第一条 finish 之前 · finish 之后没有 reasoning-delta`,
    `finish@${finishAt} · 尾巴@${tailAt} · finish 之后还有 reasoning-delta=${afterFinish}`,
    '`dsh-agent-loop` 拿到 finish 之后不会再要 chunk —— 尾巴排在它后面等于没吐（delta-only 那条路上尤其致命）')

  // A2：只有 block-end、一个 delta 都没有
  const r2 = await drive(handler, chunksB())
  const gotA2 = r2.threw === null ? assembledReasoningText(r2.out, 2) : r2.threw
  row('A2', r2.threw === null && gotA2 === CLEAN_B,
    JSON.stringify(CLEAN_B), r2.threw === null ? JSON.stringify(gotA2) : r2.threw,
    '适配器在某些协议下只给载荷、不吐 delta —— 那一条路也得清')

  // A4：正文（text 块）载荷一个字节都不许动
  const r4 = await drive(handler, chunksD())
  const textBlock = r4.out.find((c) => c?.type === 'block-end' && c.block?.type === 'text')
  row('A4', r4.threw === null && textBlock !== undefined && textBlock.block.text === TEXT_BLOCK,
    JSON.stringify(TEXT_BLOCK),
    r4.threw !== null ? r4.threw : (textBlock === undefined ? '（输出里找不到 text 块的 block-end）' : JSON.stringify(textBlock.block.text)),
    '定形："答案正文 … 一个字节不动" —— 清思考链不许波及正文')

  return rows
}

/** 哪些格是"载荷改写"那把刀该翻的、哪些是"finish 前 flush"那把刀该翻的。 */
const PAYLOAD_CELLS = new Set(['A1', 'A2'])
const FINISH_CELLS = new Set(['A3'])

describe('integration · reasoning assembly (RFG) · F-148 落盘的那一份（block-end 载荷）', () => {
  test('RFG-03 装配之后 reasoning 必须是清完的；block-end 载荷 + finish 前 flush', async () => {
    await runCase('RFG-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── ① 量具自控（先跑：量具坏了先报它，别去怪实现）─────────────────────
      const controlRows = []
      for (const control of CONTROLS) {
        let got = null
        let threw = null
        try {
          got = control.run()
        } catch (err) {
          threw = String(err?.message ?? err).slice(0, 160)
        }
        const held = threw === null && got === control.expect
        controlRows.push({ key: control.key, want: control.want, expect: control.expect, got: threw ?? got, held })
        if (!held) {
          push('ASSEMBLER-RECOMPUTE',
            `量具自控 ${control.key} 不成立（${control.want}）：期望 ${JSON.stringify(control.expect)}，实得 ${threw !== null ? `抛了 ${threw}` : JSON.stringify(got)}`
            + ` —— 这是**量具**（复刻的装配器）坏了，不是实现坏了；真类依据：${control.why}`)
        }
      }
      rec.readings.controls = controlRows

      // ── ② 被测面：staged inject.js 的 llm/stream 监听器（与 RFG-02 同一份量具）──
      const seam = await loadSeam()
      rec.readings.sut = {
        surfaceMissing: seam.surfaceMissing, applyError: seam.applyError,
        registrations: seam.registrations, events: seam.events,
      }
      const usable = !seam.surfaceMissing && seam.applyError === null && seam.handler !== null
      if (!usable) {
        push('SUT-NO-LISTENER',
          seam.surfaceMissing ? 'staged/inject.js 不在 —— 装配那一层没得喂'
            : (seam.applyError !== null ? `apply() 抛了：${seam.applyError}`
              : 'staged/inject.js 的 apply() 没注册 `llm/stream` 监听器 —— 装配那一层没得喂'))
        rec.readings.sut_cells = 'NOT-EVALUATED（没有监听器可喂）'
      } else {
        const rows = await evaluateAssembly(seam.handler)
        rec.readings.sut_cells = rows.map((r) => ({ key: r.key, want: r.want, held: r.held, got: r.got }))
        for (const r of rows) {
          if (r.held) continue
          push(`RFG-${r.key}`, `[装配] ${r.key}：want ${r.want}，实得 ${r.got} —— ${r.note}`, { cell: r.key, want: r.want, got: r.got })
        }
      }

      // ── ③ 阳性对照：照 §10.5 写的最小接缝 ⇒ 四格必须全绿 ────────────────────
      let ref = null
      let refRows = null
      try {
        ref = await importSource('RFG-03', 'ref', {
          'reasoning-filter.mjs': REF_FILTER_SOURCE,
          'listener.mjs': REF_LISTENER_SOURCE,
        }, 'listener.mjs')
        refRows = await evaluateAssembly(ref.mod.llmStreamListener)
        rec.readings.ref = {
          file: ref.entry,
          sha256: ref.sha256['listener.mjs'],
          filter_sha256: ref.sha256['reasoning-filter.mjs'],
          held: refRows.filter((r) => r.held).length,
          total: refRows.length,
          cells: refRows.map((r) => ({ key: r.key, want: r.want, held: r.held, got: r.got })),
        }
        for (const r of refRows) {
          if (r.held) continue
          push('CONTROL-REF-CELL',
            `阳性对照（照 CONTRACT.md §10.5 写的最小接缝）在 ${r.key} 没成立：want ${r.want}，实得 ${r.got}`
            + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理')
        }
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小接缝 import/驱动失败：${String(err?.message ?? err).slice(0, 200)}`)
      }

      // ── ④ 两把刀：一把只翻载荷那两格，一把只翻次序那一格 ────────────────────
      const knives = [
        { tag: 'knife-payload', cut: knifePayload(REF_LISTENER_SOURCE), own: PAYLOAD_CELLS, label: '载荷改写那一行' },
        { tag: 'knife-finish', cut: knifeFinishFlush(REF_LISTENER_SOURCE), own: FINISH_CELLS, label: '`finish` 前 flush 那一行' },
      ]
      rec.readings.knives = []
      if (ref === null || refRows === null) {
        push('KNIFE-NO-BASELINE', '阳性对照没起来 ⇒ 两把刀都没有可比的对象（刀与基线是两件事）')
      }
      for (const knife of knives) {
        if (ref === null || refRows === null) break
        if (knife.cut === null) {
          push('KNIFE-LINE-MISSING', `REF 里找不到${knife.label}（这一刀没有落点，证明不了任何事）`)
          continue
        }
        const built = await importSource('RFG-03', knife.tag, {
          'reasoning-filter.mjs': REF_FILTER_SOURCE,
          'listener.mjs': knife.cut.source,
        }, 'listener.mjs')
        const rows = await evaluateAssembly(built.mod.llmStreamListener)
        const flipped = rows.filter((r) => !r.held).map((r) => r.key)
        rec.readings.knives.push({ tag: knife.tag, removed: knife.cut.removed, flipped })
        for (const key of knife.own) {
          if (flipped.includes(key)) continue
          push('KNIFE-NOT-FLIPPED',
            `刀（删掉${knife.label}）没让 ${key} 翻面 ⇒ 那一格不是靠这段代码成立的（"删了也全绿"的刀）`)
        }
        for (const key of flipped) {
          if (knife.own.has(key)) continue
          push('KNIFE-SIDE-EFFECT',
            `刀（删掉${knife.label}）把 ${key} 也翻面了 —— 一个变异体只证一格，翻到别处说明刀切宽了`)
        }
      }

      // ── ⑤ 边界（这一条不覆盖什么，照实写）───────────────────────────────────
      rec.readings.boundary = {
        evidence_grade: '装配器是**复刻**（support/reasoning-ref.mjs::assembleBlocks，按 dsh-llm/lib/index.js:954-1123 写），不是真类：真类在 app.asar 里、测试树 import 不到（要连 6 个包）。复刻的规则由 A-PREF / A-ACC / A-IGN 三条自控钉住；另有一次性对账读数（log.md 第五节）。',
        not_covered: '真机上"落盘之后 GUI 里看到什么"（定形验收 #5）不在这一格：`inject.js` 只在 apply() 里读一次 ⇒ 只能老板重启后点一次。',
        expect_today: '今天（交付的实现只改 delta）⇒ A1 / A2 / A3 红、A4 绿；REF 四格全绿；两把刀各翻各的。',
      }

      caseFail(problems)
    })
  })
})
