/**
 * `RFG-01` · **`F-148`** —— 思考链里「≤3 单元」的段落不许进会话历史（纯函数 + 流式 + 代码块例外）。
 *
 * 被测面：`presets/agenia/lib/reasoning-filter.mjs` 的 staged 副本
 * （`.tools/_staging/agenia-upgrade/preset/lib/reasoning-filter.mjs`）——
 * 四个冻结导出：`MIN_UNITS` / `countUnits` / `stripShortParagraphs` / `createReasoningFilter`。
 *
 * 口径来源（两份，**本节一个字都不自己发明**）：
 *   · `CONTRACT.md` §10.1–§10.4（单元表 / `P0` / 段落重建 / 围栏状态机 / `push`+`flush` 不变式）；
 *   · `.team/leader/2026-10-23/spec-F-148.md`（含老板 2026-10-23 14:08 逐字补的代码块例外）。
 *
 * 四臂（**`REF` / `NULL` / 刀 三臂今天就跑**，`SUT` 臂今天缺面 ⇒ 预期红）：
 *   · `SUT`  —— 被测面。今天它不在盘上 ⇒ `SUT-SURFACE-MISSING`（判据的**当下红**）。
 *   · `REF`  —— 照契约写的**最小实现**（`support/reasoning-ref.mjs`）⇒ **必须每一格都成立**。
 *              它证明这些格"该绿时绿"：红不是用例写歪了（`mig-rules-14`）。
 *   · `NULL` —— **什么都不做**（原样放行）⇒ 该删的格必须红。它证明这些格分得出"没做"。
 *   · `KNIFE`— 把 `REF` 里围栏状态机那两行删掉 ⇒ **只有围栏格翻面**，别的格一个都不许动
 *              （`mig-rules-16`：一个变异体只证一格）。
 *
 * 边界（这一条不覆盖什么）：
 *   · 只钉**纯函数层**。接缝（`inject.js` 的 `llm/stream` 监听器）由 `RFG-02` 守着。
 *   · `\r\n` 的跨增量切分**在**这一格里（`S-CRLF-SPLIT`）：批式与流式必须说同一件事。
 *   · 不做 markdown 语义（列表 / 标题 / 引用块不认；`~~~` 不当围栏）—— 见 §10.7。
 */
import { before, describe, test } from 'node:test'
import { caseFail, preflight, problem, runCase, sha256File } from '../support/evidence.mjs'
import { loadStagedModule, stagingPath } from '../support/sut.mjs'
import {
  NULL_FILTER_SOURCE, REF_FILTER_SOURCE, importSource, knifeFence,
} from '../support/reasoning-ref.mjs'

before(() => {
  preflight()
})

const EXPORTS = ['MIN_UNITS', 'countUnits', 'stripShortParagraphs', 'createReasoningFilter']

/**
 * 一份混排夹具（**手写期望**，不从被测实现反推）：里面同时有
 * 该删的碎段（3 / 2 / 0 单元）、该留的长段、一个带语言标记的围栏块（围栏内有两段 ≤3 单元的）、
 * 以及围栏关闭之后又出现的碎段。
 */
const E1 = [
  '我应该：',       // 3 单元 ⇒ 删
  '关键：',         // 2 ⇒ 删
  '',               // 0 ⇒ 删（空段落也删 —— 定形已认）
  '四个汉字啊',      // 5 ⇒ 留
  '```js',          // 围栏开（保留）
  '}',              // 1 —— 围栏内 ⇒ 留
  'if (x)',         // 2 —— 围栏内 ⇒ 留
  '```',            // 围栏闭（保留）
  'abc',            // 1 ⇒ 删
  '我们应该走这条路', // 8 ⇒ 留（末尾没有换行）
].join('\n')
/** `E1` 的手写期望（与本文件上面那几行注释逐行对应）。 */
const E1_WANT = '四个汉字啊\n```js\n}\nif (x)\n```\n我们应该走这条路'

/** 单元数（`CONTRACT.md` §10.2 的表 + 那四条容易踩的口径）。 */
const UNITS = [
  { key: 'U-CJK', input: '我应该：', want: 3, note: '汉字 1/字；全角冒号 0' },
  { key: 'U-CJK4', input: '我们应该：', want: 4, note: '3 与 4 的边界那一侧' },
  { key: 'U-WORD', input: 'Let me check', want: 3, note: '英文单词 1/词' },
  { key: 'U-WORD4', input: 'Let me check it', want: 4, note: '英文单词 1/词' },
  { key: 'U-EMOJI3', input: '😀😀😀', want: 3, note: 'emoji 1/个' },
  { key: 'U-EMOJI4', input: '😀😀😀😀', want: 4, note: 'emoji 1/个' },
  { key: 'U-EMOJI-VS16', input: '❤️', want: 1, note: 'VS16 是修饰符 ⇒ 计 0（❤ U+2764 + U+FE0F）' },
  { key: 'U-DIGIT', input: '13:44', want: 4, note: '一个数字算一个（定形原句）' },
  { key: 'U-DIGIT2', input: '12', want: 2, note: '一个数字算一个' },
  { key: 'U-SYM', input: '→ · ≥', want: 3, note: '特殊字符 1/个，空白 0' },
  { key: 'U-SYM-PUNCTY', input: '_#/', want: 3, note: '`_` `#` `/` 在 Unicode 里是标点，但定形点名算 1' },
  { key: 'U-BULLET', input: '- M CONTRACT.md', want: 3, note: '定形样例：`-` 计 0（否则它是 4，就不再是"该删的碎片"）' },
  { key: 'U-WS', input: '   \t  ', want: 0, note: '空白 0' },
  { key: 'U-PUNCT-CN', input: '，。、：；！？（）【】「」《》', want: 0, note: '中文标点 0' },
  { key: 'U-PUNCT-ASCII', input: ',.:;!?()[]{}<>"\'-', want: 0, note: 'ASCII 标点 0（含 `-`）' },
]

/** 批式：段落重建 / `\r\n` / 3 与 4 的边界 / 空段落 / 围栏六格。 */
const STRIPS = [
  { key: 'P-EMPTY', input: '', want: '', note: '空串 ⇒ 空串' },
  { key: 'P-WS', input: '\n \n\t\n', want: '', note: '全空白 ⇒ 全是 0 单元段 ⇒ 全删' },
  { key: 'P-CRLF', input: '四个汉字啊\r\nabc\r\n', want: '四个汉字啊\n', note: '`\\r\\n` 先归一；删掉 `abc` 连同它的换行' },
  { key: 'P-BOUNDARY', input: '我应该\n我们应该', want: '我们应该', note: '3 删 / 4 留（末尾没有换行 ⇒ 不补）' },
  { key: 'P-BLANK-DROP', input: '我们应该\n\n我们应该', want: '我们应该\n我们应该', note: '空段落也删 ⇒ 中间的空行没了（定形已认）' },
  { key: 'P-TRAILING-NL', input: '四个汉字啊\nabc\n', want: '四个汉字啊\n', note: '留下的段保留它自己那个 `\\n`' },
  { key: 'P-ALL-DROP', input: '我应该：\nabc\n', want: '', note: '全删 ⇒ 空串' },
  { key: 'F-LINE', input: '```\n', want: '```\n', note: '围栏行本身保留（它只有 3 单元，靠围栏规则留）' },
  {
    key: 'F-INSIDE',
    input: '```\n}\nif (x)\n返回\n```\n',
    want: '```\n}\nif (x)\n返回\n```\n',
    note: '围栏内的 ≤3 单元段落一律保留（老板 14:08 那条）',
  },
  { key: 'F-OUTSIDE', input: '}\nif (x)\n返回\n', want: '', note: '围栏外同样的段子 ⇒ 删' },
  { key: 'F-UNCLOSED', input: '```\n}\n返回\n', want: '```\n}\n返回\n', note: '没闭合 ⇒ 从 opening 到末尾全留（宁可多留）' },
  { key: 'F-LANG', input: '```js\n}\n```\n', want: '```js\n}\n```\n', note: '带语言标记的围栏也算围栏' },
  { key: 'F-AFTER-CLOSE', input: '```\n}\n```\nabc\n', want: '```\n}\n```\n', note: '围栏关闭之后恢复按单元数判' },
  { key: 'F-TILDE', input: '~~~\n', want: '', note: '只认反引号：`~~~` 是 3 单元 ⇒ 删' },
]

/**
 * 流式：`push` + `flush` 的拼接。`cuts` = 切点（相对整段文本的字符位置）。
 * 期望全部**手写**（与批式那几格同一个口径），不从被测实现反推。
 */
const STREAMS = [
  { key: 'S-E1-ALL', text: E1, cuts: [], want: E1_WANT, note: '一次 push 全给（没有切分）' },
  { key: 'S-E1-3CUT', text: E1, cuts: [3, 17, 26], want: E1_WANT, note: '切在碎段里 / 围栏行里 / 围栏行中间' },
  { key: 'S-E1-ONECHAR', text: E1, cuts: 'one-char', want: E1_WANT, note: '一字符一个 delta（` ``` ` 必然被切碎）' },
  { key: 'S-NO-NL', text: '我应该：\n我们应该', cuts: [4], want: '我们应该', note: '末尾没有换行 ⇒ 只能靠 `flush()` 吐出来' },
  { key: 'S-FENCE-SPLIT', text: '```\n}\n```\n', cuts: [2], want: '```\n}\n```\n', note: '围栏开 / 收被拆在不同 delta 里（` `` ` + `` `\\n ``）' },
  { key: 'S-CRLF-SPLIT', text: '我应该：\r\n我们应该\r\n', cuts: [5], want: '我们应该\n', note: '`\\r` 与 `\\n` 被拆在两个 delta 里，也必须归一对' },
]

/** `S-RESET` / `S-INDEP` 这两格是**一串调用**，单独写（不是"切分"那种形状）。 */
const SEQUENCES = [
  {
    key: 'S-RESET',
    want: ['', '', '我们应该\n', ''],
    note: '`flush()` 之后状态必须清空（否则下一段会接着上一段算）',
    run: (f) => [f.push('我应该：\n'), f.flush(), f.push('我们应该\n'), f.flush()],
  },
]

/** 跑一条流式格：按 `cuts` 把 `text` 切给同一个 filter，返回拼接结果与分段读数。 */
function runSplit(mod, cell) {
  const f = mod.createReasoningFilter()
  const cuts = cell.cuts === 'one-char'
    ? Array.from({ length: Math.max(0, cell.text.length - 1) }, (_, i) => i + 1)
    : cell.cuts
  let out = ''
  const pieces = []
  let prev = 0
  for (const at of cuts) {
    const piece = f.push(cell.text.slice(prev, at))
    pieces.push(piece)
    out += piece
    prev = at
  }
  const last = f.push(cell.text.slice(prev))
  pieces.push(last)
  out += last
  const tail = f.flush()
  return { got: out + tail, pieces: pieces.length + 1, tail }
}

/**
 * 把一个模块（`SUT` / `REF` / `NULL` / 刀）喂给**同一套格**。
 * 每行：`{kind, key, want, got, held, detail}`。
 */
function evaluate(mod) {
  const rows = []
  for (const cell of UNITS) {
    let got = null
    let threw = null
    try {
      got = mod.countUnits(cell.input)
    } catch (err) {
      threw = String(err?.message ?? err).slice(0, 160)
    }
    rows.push({ kind: 'countUnits', key: cell.key, want: String(cell.want), got: threw === null ? String(got) : `抛了 ${threw}`, held: threw === null && got === cell.want, note: cell.note })
  }
  for (const cell of STRIPS) {
    let got = null
    let threw = null
    try {
      got = mod.stripShortParagraphs(cell.input)
    } catch (err) {
      threw = String(err?.message ?? err).slice(0, 160)
    }
    rows.push({ kind: 'strip', key: cell.key, want: JSON.stringify(cell.want), got: threw === null ? JSON.stringify(got) : `抛了 ${threw}`, held: threw === null && got === cell.want, note: cell.note })
  }
  for (const cell of STREAMS) {
    let got = null
    let threw = null
    let tail = null
    try {
      const r = runSplit(mod, cell)
      got = r.got
      tail = r.tail
    } catch (err) {
      threw = String(err?.message ?? err).slice(0, 160)
    }
    rows.push({ kind: 'stream', key: cell.key, want: JSON.stringify(cell.want), got: threw === null ? JSON.stringify(got) : `抛了 ${threw}`, held: threw === null && got === cell.want, note: cell.note, flushed_tail: tail })
  }
  for (const cell of SEQUENCES) {
    let got = null
    let threw = null
    try {
      got = cell.run(mod.createReasoningFilter())
    } catch (err) {
      threw = String(err?.message ?? err).slice(0, 160)
    }
    const held = threw === null && Array.isArray(got) && got.length === cell.want.length && got.every((v, i) => v === cell.want[i])
    rows.push({ kind: 'sequence', key: cell.key, want: JSON.stringify(cell.want), got: threw === null ? JSON.stringify(got) : `抛了 ${threw}`, held, note: cell.note })
  }
  // 两个 filter 不许共享状态（`inFence` 与半行缓冲各一份）
  {
    let got = null
    let threw = null
    try {
      const a = mod.createReasoningFilter()
      const b = mod.createReasoningFilter()
      got = [a.push('```\n'), b.push('}\n'), a.push('}\n')]
    } catch (err) {
      threw = String(err?.message ?? err).slice(0, 160)
    }
    const want = ['```\n', '', '}\n']
    rows.push({
      kind: 'sequence',
      key: 'S-INDEP',
      want: JSON.stringify(want),
      got: threw === null ? JSON.stringify(got) : `抛了 ${threw}`,
      held: threw === null && Array.isArray(got) && got.every((v, i) => v === want[i]),
      note: '两个 `createReasoningFilter()` 不共享 `inFence`（`a` 开围栏不该让 `b` 也进围栏）',
    })
  }
  // `MIN_UNITS` 是唯一那个 `3`
  {
    let got = null
    let threw = null
    try {
      got = mod.MIN_UNITS
    } catch (err) {
      threw = String(err?.message ?? err).slice(0, 160)
    }
    rows.push({ kind: 'constant', key: 'S-MIN', want: '3', got: threw === null ? String(got) : `抛了 ${threw}`, held: threw === null && got === 3, note: '`3` 只有一处载体（定形「不做」第 3 条）' })
  }
  return rows
}

/** 围栏那几格（刀**必须**翻的）；外面那几格刀**不许**动。 */
const FENCE_KEYS = new Set(['F-LINE', 'F-INSIDE', 'F-UNCLOSED', 'F-LANG', 'F-AFTER-CLOSE', 'S-FENCE-SPLIT', 'S-E1-ALL', 'S-E1-3CUT', 'S-E1-ONECHAR', 'S-INDEP'])
const NOT_FENCE_KEYS = new Set(['F-OUTSIDE', 'F-TILDE'])

const BRIEF = (rows) => rows.map((r) => ({ kind: r.kind, key: r.key, want: r.want, held: r.held, got: r.got }))

describe('unit · reasoning-filter (RFG) · F-148 思考链 ≤3 单元的段落', () => {
  test('RFG-01 单元表 / 段落重建 / 围栏例外 / push+flush 与批式逐字节等价', async () => {
    await runCase('RFG-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── ⓪ 被测面（缺面 = 预期的红）────────────────────────────────────────
      const lib = await loadStagedModule('lib/reasoning-filter.mjs', EXPORTS)
      rec.readings.sut = {
        surfaceMissing: lib.surfaceMissing,
        missing: lib.missing,
        errors: lib.errors,
        file: (() => { try { return stagingPath('lib/reasoning-filter.mjs') } catch { return null } })(),
        sha256: null,
      }
      if (lib.surfaceMissing) {
        push('SUT-SURFACE-MISSING',
          `staged/lib/reasoning-filter.mjs 不在 —— 四个冻结导出（${EXPORTS.join(' / ')}）一个都喂不到（第 3 关实现落地后这一格才会绿）`)
      } else {
        // 文件在、导出缺：逐个点名（与"整份不在"分得开 —— 那是两种不同的半修形态）
        for (const name of lib.missing) {
          push('SUT-SURFACE-MISSING', `staged/lib/reasoning-filter.mjs 没有导出 ${name}（冻结签名见 CONTRACT.md §10.1）`)
        }
      }
      if (lib.mod !== null && rec.readings.sut.file !== null) {
        try { rec.readings.sut.sha256 = sha256File(rec.readings.sut.file) } catch { rec.readings.sut.sha256 = null }
      }

      // ── ① 被测面：同一套格 ────────────────────────────────────────────────
      if (lib.mod === null) {
        rec.readings.sut_cells = 'NOT-EVALUATED（被测面不在盘上）'
      } else {
        const rows = evaluate(lib.mod)
        rec.readings.sut_cells = BRIEF(rows)
        rec.readings.sut_cells_held = rows.filter((r) => r.held).length
        rec.readings.sut_cells_total = rows.length
        for (const row of rows) {
          if (row.held) continue
          push(`RFG-${row.key}`,
            `[${row.kind}] ${row.key}：want ${row.want}，实得 ${row.got} —— ${row.note}`,
            { cell: row.key, want: row.want, got: row.got })
        }
      }

      // ── ② 阳性对照：照契约写的最小实现，同一套格必须全部成立 ────────────────
      let ref = null
      let refRows = null
      try {
        ref = await importSource('RFG-01', 'ref', { 'reasoning-filter.mjs': REF_FILTER_SOURCE }, 'reasoning-filter.mjs')
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小实现 import 失败（阳性对照这一格不成立）：${String(err?.message ?? err).slice(0, 200)}`)
      }
      if (ref !== null) {
        const rows = evaluate(ref.mod)
        refRows = rows
        rec.readings.ref = {
          file: ref.entry,
          bytes: ref.bytes['reasoning-filter.mjs'],
          sha256: ref.sha256['reasoning-filter.mjs'],
          held: rows.filter((r) => r.held).length,
          total: rows.length,
          cells: BRIEF(rows),
        }
        for (const row of rows) {
          if (row.held) continue
          push('CONTROL-REF-CELL',
            `阳性对照（照 CONTRACT.md §10 写的最小实现）在 ${row.key} 没成立：want ${row.want}，实得 ${row.got}`
            + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理，不许拿"实现还没做"糊过去')
        }
      }

      // ── ③ 「什么都不做」那一臂：该删的格必须红 ────────────────────────────
      if (ref === null) {
        push('CONTROL-NO-BASELINE', '阳性对照没起来 ⇒ 「什么都不做」那一臂没有可比的对象（两臂缺一条，这一票的翻面证据就不成立）')
      } else {
        const nul = await importSource('RFG-01', 'null', { 'reasoning-filter.mjs': NULL_FILTER_SOURCE }, 'reasoning-filter.mjs')
        const rows = evaluate(nul.mod)
        const red = rows.filter((r) => !r.held)
        rec.readings.null = {
          file: nul.entry,
          sha256: nul.sha256['reasoning-filter.mjs'],
          red: red.length,
          total: rows.length,
          red_cells: red.map((r) => r.key),
        }
        // 两件事分开判：①"什么都不做"整体必须红；②**该删的那几格**必须红（否则这些格只是在数"有没有抛"）
        if (red.length === 0) {
          push('CONTROL-NULL-NOT-RED', `「什么都不做」那一臂（原样放行）居然 ${rows.length} 格全绿 ⇒ 这些格分不出"做了"与"没做"，红就不是判据`)
        }
        for (const key of ['P-ALL-DROP', 'F-OUTSIDE', 'S-NO-NL', 'U-CJK']) {
          const row = rows.find((r) => r.key === key)
          if (row !== undefined && row.held) {
            push('CONTROL-NULL-CELL', `「什么都不做」那一臂在 ${key} 上竟然成立（${row.got}）⇒ 这一格没有在量"删没删"`)
          }
        }
      }

      // ── ④ 反向刀：删掉围栏状态机那两行 ⇒ 只有围栏格翻面 ────────────────────
      const cut = knifeFence(REF_FILTER_SOURCE)
      if (ref === null) {
        push('KNIFE-NO-BASELINE', '阳性对照没起来 ⇒ 这一刀没有可比的对象（刀与基线是两件事）')
      } else if (cut === null) {
        push('KNIFE-LINE-MISSING',
          'REF 里找不到围栏状态机那两整行（正则 `^ *if \\(inFence\\) \\{.*$` / `^ *if \\(isFence\\(line\\)\\) \\{.*$`）'
          + ' —— 这一刀没有落点，证明不了任何事')
      } else {
        const knife = await importSource('RFG-01', 'knife', { 'reasoning-filter.mjs': cut.source }, 'reasoning-filter.mjs')
        const rows = evaluate(knife.mod)
        const flipped = rows.filter((r) => !r.held)
        const fenceFlipped = flipped.filter((r) => FENCE_KEYS.has(r.key))
        const otherFlipped = flipped.filter((r) => !FENCE_KEYS.has(r.key))
        rec.readings.knife = {
          file: knife.entry,
          sha256: knife.sha256['reasoning-filter.mjs'],
          removed_lines: cut.removed,
          flipped: flipped.map((r) => r.key),
        }
        if (fenceFlipped.length === 0) {
          push('KNIFE-NOT-FLIPPED',
            '把围栏状态机那两行删掉之后，**一张围栏格都没翻面** ⇒ 这一刀没让任何一格变红'
            + '（"删了也全绿"的刀）⇒ 那几格不成立在守"代码块例外"')
        }
        for (const row of otherFlipped) {
          push('KNIFE-SIDE-EFFECT',
            `${row.key} 在这一刀下也翻面了（want ${row.want}，实得 ${row.got}）—— 删围栏状态机不该动到它；`
            + '一个变异体只证一格，它翻面说明刀切到了别处，或者这一格与围栏共用同一处判据')
        }
        // 反面那两格（围栏外 / `~~~`）必须**不动** —— 它们是"刀没切宽"的证人
        for (const key of NOT_FENCE_KEYS) {
          const now = rows.find((r) => r.key === key)
          const before = refRows.find((r) => r.key === key)
          if (now.held !== before.held) {
            push('KNIFE-SIDE-EFFECT', `${key} 不该受这把刀影响，但它的成立与否变了（${before.held} → ${now.held}）`)
          }
        }
      }

      // ── ⑤ 写清"哪里判不了"（这一格不假装覆盖得更宽）─────────────────────
      rec.readings.boundary = {
        pure_function_only: '只钉 lib/reasoning-filter.mjs 的纯函数与流式层；inject.js 的 llm/stream 接缝由 RFG-02 守。',
        not_covered: '不做 markdown 语义（列表/标题/引用块不认）；`~~~` 不当围栏；行内反引号不改变判定（CONTRACT.md §10.7）。',
        expect_today: '今天 SUT 臂 NOT-EVALUATED（缺面）+ 1 条 SUT-SURFACE-MISSING；REF 全绿、NULL 该红、刀只翻围栏格。',
      }

      caseFail(problems)
    })
  })
})
