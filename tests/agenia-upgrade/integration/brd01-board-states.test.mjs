/**
 * `BRD-01` · **`F-152`** —— 板子把两种完全不同的"没验过"说成同一句话。
 *
 * 病根（`presets/agenia/inject.js::boardOf` `:1427-1431`，2026-10-23 现读）：
 * 第二个分支只看 `ledger.afterTest > 0`，**没先问"叫过测试没有"**。于是一个
 * **一次测试都没叫过**的会话（测试计数 0），只要动过项目文件，就会读到
 * 「最后一次测试之后，项目文件又动过 N 次 —— 那次测试作废，要重测。」
 * —— 可"那次测试"**从来没发生过**。2026-10-19 记的就是这句：「从没测过」和「测过之后又动了」共用一句话。
 *
 * 口径来源（两份，一份是定形、一份是契约）：
 *   · `.team/leader/2026-10-23/spec-F-152.md`「目标（三种状态、三句话）」那张表；
 *   · `CONTRACT.md` §3.3（板子告警的三态）。
 *
 * 判的是**注入文字**，不是源码长相：在假 ctx 上跑 staged `inject.js` 的 `apply()`，
 * 按真次序喂 `tools/result`（板子的账本只听这个口）再走一次 `agent/pre-step` 瀑布，
 * 读那一步真的被塞进 `decision.messages` 的那条尾巴（量具只有一份：`support/board-surface.mjs`）。
 *
 * 三格（`want` 照定形手写，不从实现反推）：
 *   A 叫过开发、从没叫过测试、项目文件**一次没动** ⇒ 「⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。」
 *   B 从没叫过测试、但**项目文件动过**（`afterTest > 0`）⇒ 一句**新的**话：说明"文件改过 + 一次测试都没叫过"；
 *      🔴 **不许**出现「最后一次测试之后」/「那次测试作废」（那是描述一次真发生过的测试）。
 *      **两种输入**（同一格，不加格、不加用例号）：
 *        B1 叫过**外聘**（`subagent`）再写文件 —— 不是因为"外聘"重要，而是因为
 *           `boardOf` 在 `counts.size === 0` 时整段不出（`inject.js:1415`）："只动过文件、一个人都没叫"
 *           的会话**没有板子**（那是触发点的现状，不归这一票）。叫外聘也正好是 2026-10-19 那个现场
 *           （组长当时叫的是外聘、不是开发）。
 *        B2 叫过**开发**再写文件（**混合现场**）—— 组长 2026-10-23 拍板的优先级：
 *           **「从没叫过测试」优先于「测试之后又动了」**。测试计数是 0 ⇒ 板子**永远**不许说
 *           「最后一次测试之后」/「那次测试作废」，不管叫没叫过开发；它必须说"文件动过 + 一次测试都没叫过"。
 *           ⇒ B2 断言与 B1 同样两条，"叫过开发"那一句（①）也**不许**在这里出现（三句互斥）。
 *   C 叫过测试、之后项目文件又动过 ⇒ 「⚠️ 最后一次测试之后，项目文件又动过 1 次 —— 那次测试作废，要重测。」（保持）
 *
 * 三条控制 —— **它们才是"红"这个字的合法性来源**：
 *   · `REF`：本文件里那份**照 §3.3 写的最小实现**（`boardWarningOf(账本形状)`）喂同样三格的账本 ⇒
 *     三格的**每一个输入**都必须成立。它证明这些格子是**可实现的**（不是"永远红"），
 *     且缺哪一句就红在哪一格（`mig-rules-14`）。
 *   · `KNIFE`：把 REF 里「从没叫过测试、但文件动过」**那一支整行删掉**再跑 ⇒ **只有 B 格的每一个输入**翻红，
 *     A / C 不动（`mig-rules-16`：一个变异体只证一格）。
 *     ⚠️ 刀打在 REF 的字节上，**不碰 `presets/**`**：生产里那一支存在之前没有字节可删；
 *     REF 是同一句话的载体，刀读数自带 `readings.knife.subject = 'reference'`。
 *     生产那一侧"这条规则在不在"由 B 格自己回答（今天它就是红的）。
 *   · `STATE`：每一格先核对板子的**进度行**（`测试 0` / `测试 1`、`开发 1`、`外聘 1`）——
 *     状态没造出来的话，后面读到的"告警"就不是这一格的告警（`BRD-STATE-SETUP`，与"句子写错了"分开报）。
 *
 * 边界（这一格**不覆盖**什么，写清，别假装更宽）：
 *   1. 只判**告警那几行**（`⚠️` 开头），不判进度行的排版、不判板子整段的长度；
 *   2. `afterTest` / `afterReview` 的记账口径、板子的段序与三个触发点**都不在这一格里**
 *      （`afterReview` 那条由探针 `G13` 那一路守着；段序是 `F-126` 的契约）；
 *   3. "叫过开发 + 动过文件 + 从没叫过测试"这一种混合现场**判了**（B2）—— 优先级由组长 2026-10-23 拍，
 *      写进 `CONTRACT.md` §3.3；本格只执行那一条，不自己另立优先级；
 *   4. 本格证明的是**板子怎么记账/怎么说**，不是"写入工具真的写成功了"（只发结果事件，不落盘）。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { caseFail, preflight, problem, runCase, sha256File } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { stagingPath } from '../support/sut.mjs'
import { boardPartOf, openBoardSession, warningLinesOf } from '../support/board-surface.mjs'
import { fixtureDir } from '../support/verify-recompute.mjs'

before(() => {
  preflight()
})

/** 三句里的前两句（逐字）—— 与 `inject.js:1428` / `inject.js:1430` 同一个写法（`${afterTest}` 换成实数）。 */
const S_DEV_ONLY = '⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。'
const S_TEST_THEN_MOVED = (n) => `⚠️ 最后一次测试之后，项目文件又动过 ${n} 次 —— 那次测试作废，要重测。`

/**
 * 「从没叫过测试」这一句的**可接受写法**（白名单，只认它说出来了，不认措辞）：
 * 定形给的那句是「改过项目文件，但一次测试都没叫过 —— 没人验过这些改动。」，
 * 但**判据判的是语义**（"文件动过 + 一次测试都没叫过"），不是字节 ——
 * 换一句同义的话不该红（措辞自由是第 3 关的），换了**意思**才该红。
 */
const NEVER_TESTED = ['一次测试都没叫过', '一次测试也没叫过', '从没叫过测试', '没有叫过测试', '没叫过测试', '还没叫过测试']

/** 「项目文件被改/动过」这一半：**先说文件、再说动作**（只认这两样都在，不认句式）。 */
const mentionsFileChange = (text) => /(项目文件|文件)/.test(text) && /(改过|动过|又动|又改|变了|改动了)/.test(text)

/** 写文件那一步用的目标路径：**只进事件参数，不落盘**（这个文件从不被创建）。 */
const WRITE_TARGET_PATH = path.join(PATHS.repo, 'tests', 'agenia-upgrade', '_brd01-fixture-never-written.mjs')

/**
 * 三格。每格 `inputs` 是一组**同义现场**（同一句判据、不同账本形状）——
 * 现在只有 B 格有两条（外聘 / 开发），A / C 各一条（没有新开格、没有新用例号）。
 * `input.drive` 是喂给真 `apply()` 的**插件事**序列（`[工具名, 参数]`）；`input.ledger` 是喂给 REF 的账本形状
 * （`counts` = 岗位 → 次数；`afterTest` = 最后一次测试之后项目文件动过几次）；`input.progress` 是板子进度行的前置。
 */
const CELLS = [
  {
    key: 'A',
    code: 'BRD-DEV-NO-TEST',
    title: '叫过开发、从没叫过测试、项目文件一次没动过',
    inputs: [
      {
        label: '只叫过开发，一次文件都没写',
        drive: [['team_dev', {}]],
        ledger: { counts: { dev: 1 }, afterTest: 0 },
        progress: ['开发 1', '测试 0'],
      },
    ],
    holds: [['那一句（逐字）', (t) => t.includes(S_DEV_ONLY)]],
    forbids: ['最后一次测试之后', '那次测试作废', '一次测试都没叫过'],
  },
  {
    key: 'B',
    code: 'BRD-NEVER-TESTED-FILES-MOVED',
    title: '从没叫过测试、项目文件动过一次（外聘 / 开发 两种叫法都要说同一句）',
    inputs: [
      {
        label: 'B1 外聘叫过 + 文件动过一次（板子才在）',
        drive: [['subagent', {}], ['write', { file_path: WRITE_TARGET_PATH }]],
        ledger: { counts: { hire: 1 }, afterTest: 1 },
        progress: ['测试 0', '外聘 1'],
      },
      {
        // 组长 2026-10-23 拍板：**「从没叫过测试」优先于「测试之后又动了」** ——
        // 测试计数是 0 ⇒ 不管叫没叫过开发，都不许说「最后一次测试之后」/「那次测试作废」；
        // 必须说"文件动过 + 一次测试都没叫过"。这一条输入就是那一条裁决的判据。
        label: 'B2 开发叫过 + 文件动过一次（混合现场：从没叫过测试优先）',
        drive: [['team_dev', {}], ['write', { file_path: WRITE_TARGET_PATH }]],
        ledger: { counts: { dev: 1 }, afterTest: 1 },
        progress: ['开发 1', '测试 0'],
      },
    ],
    holds: [
      ['说明"一次测试都没叫过"', (t) => NEVER_TESTED.some((p) => t.includes(p))],
      ['说明项目文件被改/动过', mentionsFileChange],
    ],
    forbids: ['最后一次测试之后', '那次测试作废', '叫过开发'],
  },
  {
    key: 'C',
    code: 'BRD-TEST-THEN-MOVED',
    title: '叫过测试、之后项目文件又动过一次',
    inputs: [
      {
        label: '叫过测试，之后又写了一次文件',
        drive: [['team_test', {}], ['write', { file_path: WRITE_TARGET_PATH }]],
        ledger: { counts: { test: 1 }, afterTest: 1 },
        progress: ['测试 1'],
      },
    ],
    holds: [['那一句（逐字，N=1）', (t) => t.includes(S_TEST_THEN_MOVED(1))]],
    forbids: ['叫过开发', '还没叫过测试', '一次测试都没叫过'],
  },
]

/**
 * 照 `CONTRACT.md` §3.3 写的**最小实现**（阳性对照 + 刀的载体）。
 * 三支各一行、各返一句；`afterTest` 与 `counts` 都由调用方喂（它不读盘、不建会话）。
 * ⚠️ 第二支是**单独一整行** —— 反向刀一删的就是这一行；删掉之后同一格会落到第三支（说"一次真发生过的测试"）。
 */
const REF_SOURCE = `// BRD-01 的阳性对照：照 CONTRACT.md §3.3 写的最小实现（**不是生产代码**，只住在运行根里）。
const S_DEV = '⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。'
const S_NEVER = '⚠️ 改过项目文件，但一次测试都没叫过 —— 没人验过这些改动。'

export function boardWarningOf(state) {
  const counts = state === null || state === undefined ? {} : (state.counts ?? {})
  const afterTest = state === null || state === undefined ? 0 : (state.afterTest ?? 0)
  const called = (role) => (counts[role] ?? 0) > 0
  if (!called('test') && called('dev') && afterTest === 0) return S_DEV
  if (!called('test') && afterTest > 0) return S_NEVER
  if (afterTest > 0) return '⚠️ 最后一次测试之后，项目文件又动过 ' + afterTest + ' 次 —— 那次测试作废，要重测。'
  return ''
}
`

/** 反向刀要删的那一行（在 `REF_SOURCE` 里逐字存在；找不到就当场报 `KNIFE-LINE-MISSING`）。 */
const KNIFE_LINE = /^ *if \(!called\('test'\) && afterTest > 0\) return S_NEVER$/m

/** 一格在**一段文字**上成不成立：`holds` 全过、`forbids` 一个都不许命中。 */
function judgeText(cell, text) {
  const missed = cell.holds.filter(([, ok]) => !ok(text)).map(([label]) => label)
  const hit = cell.forbids.filter((phrase) => text.includes(phrase))
  return { held: missed.length === 0 && hit.length === 0, missed, hit }
}

/**
 * 跑一个**输入**：建一个**新的**假会话（`apply()` 一次 ⇒ 自己那份账本）⇒ 按 `input.drive` 喂插件事
 * ⇒ 走一次 pre-step ⇒ 从尾巴里取板子段与告警行。板子没出现（整段没贴 / 段找不到）也如实回报，不抛。
 *
 * @param {object} cell   那一格（读 `key`）
 * @param {object} input  那一条输入（读 `label` / `drive`）
 * @param {number} index  同一格内第几条输入（会话 id 靠它分开 ⇒ 账本不串）
 */
async function runCell(cell, input, index) {
  const session = await openBoardSession({ id: `brd01-${cell.key}-${index + 1}`, cwd: PATHS.repo })
  if (session.surfaceMissing || session.applyError.length > 0 || !session.events.includes('agent/pre-step')) {
    return { session, board: undefined, warnings: '', stepped: null, problems: session.applyError }
  }
  for (const [name, args] of input.drive) await session.toolResult(name, args)
  const stepped = await session.stepBegin()
  const board = boardPartOf(stepped.text)
  return { session, board, warnings: warningLinesOf(board), stepped, problems: [] }
}

/** 落一份源码到运行根之下并 import 它（URL 带哈希 ⇒ 同一进程里不会拿到缓存里的旧字节）。 */
async function importSource(dir, name, source) {
  const sub = path.join(dir, name)
  mkdirSync(sub, { recursive: true })
  const file = path.join(sub, 'board.mjs')
  writeFileSync(file, source, 'utf8')
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex')
  const mod = await import(`${pathToFileURL(file).href}?sha256=${sha256}`)
  return { mod, file, sha256, bytes: Buffer.byteLength(source, 'utf8') }
}

describe('integration · board states (BRD) · F-152 板子把两种"没验过"说成同一句话', () => {
  test('BRD-01 板子三态三句：叫过开发 / 从没叫过测试但文件动过 / 叫过测试之后又动了；阳性对照 + 反向刀', async () => {
    await runCase('BRD-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── ⓪ 被测面的读数（缺面 = 预期红）────────────────────────────────────
      let sutFile = null
      try {
        sutFile = stagingPath('inject.js')
      } catch {
        sutFile = null
      }
      rec.readings.sut = {
        file: sutFile,
        sha256: sutFile === null ? null : sha256File(sutFile),
        bytes: sutFile === null ? null : statSync(sutFile).size,
        note: '被测面 = staged 的 inject.js；板子三态读的是**它真的注入出去的那条尾巴**（support/board-surface.mjs）',
      }

      // ── ① 三格 × 每格的输入：每条输入建一个新会话，读注入文字里的告警行 ──────────
      //    ⚠️ 红因报文里**点名是哪一条输入**（同一格的两条输入形状不同：B1 外聘 / B2 开发）。
      const sutRows = []
      for (const cell of CELLS) {
        for (const [index, input] of cell.inputs.entries()) {
          const row = await runCell(cell, input, index)
          const text = row.warnings
          const verdict = judgeText(cell, text)
          const where = `${cell.key}/${input.label}`
          const progressHit = row.board === undefined
            ? []
            : input.progress.filter((needle) => !row.board.includes(needle))
          sutRows.push({
            cell: cell.key,
            input: input.label,
            title: cell.title,
            board_found: row.board !== undefined,
            progress_ok: row.board !== undefined && progressHit.length === 0,
            progress_missing: progressHit,
            warnings: text,
            held: verdict.held,
            missed: verdict.missed,
            forbidden: verdict.hit,
          })
          if (row.problems.length > 0) {
            push('SUT-SURFACE-MISSING', `staged/inject.js 喂不起来（板子三态拿不到）：${row.problems.join('；').slice(0, 300)}`)
            continue
          }
          if (row.board === undefined) {
            push('BRD-NO-BOARD',
              `${where}（${cell.title}）：这一格**根本没有板子段**（尾巴里找不到「【这一票的进度】」）`
              + '—— 板子整段没贴，三句话一句都读不到（这一格的"不该出现"会平凡成立，所以必须单独报）')
            continue
          }
          if (progressHit.length > 0) {
            push('BRD-STATE-SETUP',
              `${where}（${cell.title}）：板子的**进度行**不是这一格的状态（缺 ${progressHit.map((n) => `「${n}」`).join('、')}）`
              + `—— 状态没造出来，下面读到的告警就不是这一格的告警。实得进度行：${row.board.split('\n')[0]}`)
          }
          if (verdict.missed.length > 0) {
            push(cell.code,
              `${where}（${cell.title}）：该出现的那一句没出现（缺 ${verdict.missed.join('、')}）。`
              + `实得告警：${JSON.stringify(text)}`)
          }
          if (verdict.hit.length > 0) {
            push('BRD-FORBIDDEN',
              `${where}（${cell.title}）：出现了**这一格不该出现**的话：${verdict.hit.map((p) => `「${p}」`).join('、')}。`
              + `实得告警：${JSON.stringify(text)}`)
          }
        }
      }
      rec.readings.cells = sutRows

      // ── ② 阳性对照：照 §3.3 写的最小实现，每格**每一条输入**都必须成立 ──────────
      let ref = null
      let refRows = null
      try {
        ref = await importSource(fixtureDir('BRD-01', 'board-ref'), 'ref', REF_SOURCE)
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小实现 import 失败（阳性对照这一格不成立）：${String(err?.message ?? err).slice(0, 200)}`)
      }
      if (ref !== null) {
        refRows = CELLS.flatMap((cell) => cell.inputs.map((input) => {
          const text = String(ref.mod.boardWarningOf(input.ledger) ?? '')
          const verdict = judgeText(cell, text)
          return { cell: cell.key, input: input.label, text, held: verdict.held, missed: verdict.missed, forbidden: verdict.hit }
        }))
        rec.readings.ref = { file: ref.file, bytes: ref.bytes, sha256: ref.sha256, cells: refRows }
        for (const row of refRows) {
          if (row.held) continue
          push('CONTROL-REF-CELL',
            `阳性对照（照 §3.3 的最小实现）在 ${row.cell}/${row.input} 没成立：缺 ${row.missed.join('、') || '（无）'}`
            + ` · 不该出现的 ${row.forbidden.join('、') || '（无）'} · 实得 ${JSON.stringify(row.text)}`
            + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理，不许拿"实现还没做"糊过去')
        }
      }

      // ── ③ 反向刀：删掉「从没叫过测试、但文件动过」那一支 ⇒ 只该 B 格翻红 ──
      const cut = REF_SOURCE.match(KNIFE_LINE)
      if (ref === null || refRows === null) {
        push('KNIFE-NO-BASELINE', '阳性对照没起来 ⇒ 这一刀没有可比的对象（刀与基线是两件事，缺一条这一票不算数）')
      } else if (cut === null) {
        push('KNIFE-LINE-MISSING',
          `REF 里找不到「从没叫过测试、但文件动过」那一支（这把刀真正用的正则是 \`${KNIFE_LINE.source}\`）—— `
          + '这一刀没有落点，证明不了任何事')
      } else {
        const knifed = REF_SOURCE.replace(KNIFE_LINE, '')
        let knife = null
        try {
          knife = await importSource(fixtureDir('BRD-01', 'board-ref'), 'knife', knifed)
        } catch (err) {
          push('KNIFE-IMPORT', `刀出了 import 失败（那不是"变红"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`)
        }
        if (knife !== null) {
          const knifeRows = CELLS.flatMap((cell) => cell.inputs.map((input) => {
            const text = String(knife.mod.boardWarningOf(input.ledger) ?? '')
            const verdict = judgeText(cell, text)
            return { cell: cell.key, input: input.label, text, held: verdict.held, missed: verdict.missed, forbidden: verdict.hit }
          }))
          const flippedRows = knifeRows.filter((r) => !r.held)
          const flippedCells = [...new Set(flippedRows.map((r) => r.cell))]
          const bInputs = CELLS.find((cell) => cell.key === 'B').inputs.length
          rec.readings.knife = {
            subject: 'reference',
            why: '刀删的是最小实现里那一行；被测面（staged/inject.js）里那一支在不在由 B 格自己回答',
            removed_line: cut[0].trim(),
            file: knife.file,
            sha256: knife.sha256,
            flipped_cells: flippedCells,
            flipped_inputs: flippedRows.map((r) => `${r.cell}/${r.input}`),
            vector: knifeRows,
          }
          // 只该 B 格的**每一条输入**翻红（B1 与 B2 形状不同，两条都得翻）；A / C 一条都不许动。
          if (flippedCells.length !== 1 || flippedCells[0] !== 'B' || flippedRows.length !== bInputs) {
            push('KNIFE-WRONG-VECTOR',
              `删掉「从没叫过测试、但文件动过」那一支之后，翻红的集合是 ${JSON.stringify(flippedRows.map((r) => `${r.cell}/${r.input}`))}`
              + `（按格：${JSON.stringify(flippedCells)}）—— 期望**只有 B 格的 ${bInputs} 条输入**。`
              + '一个变异体只证一格（mig-rules-16）：多翻说明那一支与别的格子共用同一处判据，'
              + '少翻说明这一刀没切到它（B 格的红就不是它守着的）')
          }
        }
      }

      // ── ④ 写清边界（这一格不假装覆盖得更宽）──────────────────────────────
      rec.readings.boundary = {
        injected_text_only: '只判那一步**真的注入出去**的告警行（`⚠️` 开头）；进度行只当前置（`BRD-STATE-SETUP`），不判排版。',
        mixed_state: '「叫过开发 + 动过文件 + 从没叫过测试」这一种混合现场**判了**（B2）：组长 2026-10-23 拍板 —— **「从没叫过测试」优先于「测试之后又动了」**；'
          + '测试计数 0 ⇒ 不管叫没叫过开发，都不许说「最后一次测试之后」/「那次测试作废」，必须说"文件动过 + 一次测试都没叫过"。'
          + '口径落在 `CONTRACT.md` §3.3；本格只执行它，不自己另立优先级。',
        no_ledger_alone: '只动过文件、一个人都没叫过的会话**没有板子**（`boardOf` 在 `counts.size === 0` 时整段不出）—— 那是触发点的现状，不归这一票；B1 因此先叫外聘。',
        no_disk_write: '`write` 只发一条**结果事件**（账本只读 `call.name` + `file_path` + `cwd`），一个字节都不写。',
        counting_untouched: '`afterTest` / `afterReview` 的记账口径、板子的段序、三个触发点都不在这一格里（`afterReview` 那条归探针 `G13` 那一路）。',
        wording_freedom: 'A / C 两格的那两句是**逐字**判的（定形要求"保持"）；B 格的新句子按**语义**判（"文件动过 + 一次测试都没叫过"），措辞自由（点名"动过几次"也行）。',
      }

      caseFail(problems)
    })
  })
})
