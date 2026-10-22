/**
 * `SURF-01` / `SURF-03` —— **注入面清单「声明了就必须在盘上，且不许是空壳」**（`F-112` ① · 2026-10-22）。
 *
 * ## 这一格治的是什么
 *
 * `support/env.mjs` 里那张 `FROZEN.staged.injectedMarkdownFiles` 是**声明**：
 * 「这 13 份 `.md` 会被注入」。`STAT-03` 只把它与**组合**对过账（声明 ↔ 声明），
 * **全 `tests/` 里没有一个 `existsSync` 问过盘上有没有** ——
 * ⇒ 删掉 `persona.md` / `style.md`，整套 70 条**一声不响**（2026-10-22 审计的现场）。
 * 那就是"在假账上签字"：注入器读不到那一份，这一份等于没注入，而判据全绿。
 *
 * 而"在盘上"只是第一根轴。第二根轴是**内容**：文件在、但只有 1 个字节（`AGENTS.md` 就是这种
 * 1 字节占位）—— 注入器读到的是一段空正文，这一份同样等于没注入，而"在不在"那条判据照样绿。
 * ⇒ 两根轴拆成两条用例，**各报各的**（"只红那一条"的结构保证）：
 *
 * ## 判据（两格，各管一根轴）
 *
 * 1. **`SURF-01` 声明 ↔ 盘上**：名单里每一份都必须在**被测 staging 树**上存在；
 *    缺一份 ⇒ 红，**红因点名那一份**（`SURF-FILE-MISSING`），并说清两个合法修法。
 *    另有 **名单 ↔ 份数**（`SURF-DECL-COUNT`）：只钉名单会被"划一条进、划一条出"骗过去；
 *    只钉份数会被"一进一出"骗过去（`env.mjs` 那条 🔴）。
 * 2. **`SURF-03` 声明 ↔ 不是空壳**：每一份**去掉空白后必须还有字**（口径 = `nonWhitespaceLength`，
 *    空格 / 制表 / 换行 / 回车 / 全角空格 / BOM 都算空白）。空壳 ⇒ 红，**点名那一份**
 *    （`SURF-FILE-EMPTY`）；读不出正文 ⇒ 红并点名（`SURF-FILE-UNREADABLE`，不许把"读不到"当没事）。
 *    🔴 口径选的是「**去掉空白后非空**」，不是 `bytes >= 2` —— 理由与控制面见
 *    `support/declared-surface.mjs` 的 `nonWhitespaceLength` / `nonemptyControls`（契约 §7.1.1 同一份）。
 *
 * ## 两根轴的分工（同一份文件不许被两条判据同时报）
 *
 * · 抽走 `persona.md` ⇒ `SURF-01` 红、`SURF-03` **绿**（缺的那份不归它管）；
 * · 把 `persona.md` 写成 1 字节 ⇒ `SURF-03` 红、`SURF-01` **绿**（文件还在）。
 * 两个方向都量过（`.team/test/2026-10-22/log.md` 第二十一 / 二十五节）。
 *
 * ## 控制面（每一格自己能不能翻面）
 *
 * 用例内部再把同一份判据喂**合成**事实 —— `SURF-01` 五组（三份都在 / 少一份 / 少两份 / 一份都不在 / 空表）、
 * `SURF-03` 九组（三份都有正文 / 1 字节 / 2 字节 CRLF / 3 字节 BOM / 只剩空白 / 读不出来 /
 * 缺一份不归它管 / 两份空壳 / 空表），每一组都要求**恰好**命中它该命中的码、并点名该点名的那几份。
 * ⇒ "这次是绿的"不等于"它会红"：控制面失败时那一格必红（`SURF-EXISTS-CONTROL` / `SURF-NONEMPTY-CONTROL`）。
 *
 * ## 边界（写清，别假装覆盖得更宽）
 *
 * · 只看**被测 staging 树**（`AGENIA_STAGING_PRESET`）—— 活体 `presets/agenia/**` 不是靶子
 *   （那棵树由 `STAT-01` 的「staged vs 活体」漂移判据守）。
 * · `SURF-03` 不判"正文写得对不对 / 有没有被截断成半份" —— 它只回答「有没有字」。
 *   `bytes` 与"非空白字符数"只当读数落盘（用来一眼看出"1 字节"），不是判据。
 */
import { before, describe, test } from 'node:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { stagingExists, stagingPath, stagingRoot } from '../support/sut.mjs'
import {
  CODES,
  declaredFilesControls,
  declaredFilesNonemptyProblems,
  declaredFilesProblems,
  nonWhitespaceLength,
  nonemptyControls,
} from '../support/declared-surface.mjs'

before(() => {
  preflight()
})

/** 一份文件的字节数（读不到 ⇒ `null`；只当读数，不判红）。 */
function bytesOf(rel) {
  try {
    return statSync(stagingPath(rel)).size
  } catch {
    return null
  }
}

/**
 * 一份文件的**事实**（`SURF-03` 的输入）：`{status:'ok', text, bytes}` /
 * `{status:'missing'}` / `{status:'unreadable', error, bytes?}`。
 *
 * 判据函数不自己摸盘 —— 它要的只是这三种事实（控制面里换成一组合成的，就能证明它会翻面）。
 */
function inspect(rel) {
  let abs
  try {
    abs = stagingPath(rel)
  } catch (err) {
    return { status: 'unreadable', error: String(err?.message ?? err) }
  }
  try {
    if (!existsSync(abs)) return { status: 'missing' }
    const st = statSync(abs)
    if (!st.isFile()) return { status: 'unreadable', error: st.isDirectory() ? '它是个目录（不是文件）' : '它不是普通文件', bytes: st.size }
    return { status: 'ok', text: readFileSync(abs, 'utf8'), bytes: st.size }
  } catch (err) {
    return { status: 'unreadable', error: String(err?.message ?? err) }
  }
}

/**
 * 被测树在不在 —— 不在就**一条**问题、并告诉调用方"这一格判不了"（别逐份报 13 条假红）。
 * @returns {{judgeable: boolean, problems: Array<{code:string,message:string,detail:object|null}>}}
 */
function stagingLane() {
  const problems = []
  let root = null
  let present = false
  try {
    root = stagingRoot()
    present = stagingExists('.')
  } catch (err) {
    problems.push(problem('ENV-MISSING', `AGENIA_STAGING_PRESET 拿不到（${err?.message ?? err}）—— 注入面清单无从对账`))
    return { judgeable: false, root, problems }
  }
  if (!present) {
    problems.push(problem('SUT-SURFACE-MISSING', `被测 staging 不在盘上：${root} —— 注入面清单无从对账（预期的首跑红）`))
    return { judgeable: false, root, problems }
  }
  return { judgeable: true, root, problems }
}

describe('static · surface-declared', () => {
  test('SURF-01 注入面声明的每一份 .md 必须在盘上（删任一份 ⇒ 红并点名那份）', async () => {
    await runCase('SURF-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── 控制面先跑：判据自己翻不了面时，下面那个"绿"没有意义 ──────────────
      const controls = declaredFilesControls()
      rec.readings.controls = controls.controls
      for (const f of controls.failures) push(CODES.existsControl, f)

      const declared = FROZEN.staged.injectedMarkdownFiles
      const where = 'FROZEN.staged.injectedMarkdownFiles（support/env.mjs）'
      rec.readings.declaration = { where, declared }

      // 被测树在不在（不在 ⇒ 这一格判不了；这是预期的 RED-SURFACE，不是"绿"）
      const lane = stagingLane()
      rec.readings.staging_root = { path: lane.root, exists: lane.judgeable }
      for (const p of lane.problems) push(p.code, p.message, p.detail)

      // ── 名单 ↔ 份数（两个都是声明；两个一起钉才翻得了面）──────────────────
      if (!Array.isArray(declared)) {
        push(CODES.declCount, '`FROZEN.staged.injectedMarkdownFiles` 不是数组 —— 名单本身没有形状，判不了')
      } else if (declared.length !== FROZEN.staged.injectedMarkdownClasses) {
        push(CODES.declCount, `注入面名单 ${declared.length} 份 ≠ 冻结份数 ${FROZEN.staged.injectedMarkdownClasses} 份 —— `
          + '两个都是声明，必须同批改（名单少了但份数还在 = 下一份文件静默离开判据的视野）')
      }

      // ── 主判据：声明 ↔ 盘上 ─────────────────────────────────────────────
      const verdict = declaredFilesProblems({
        declared: Array.isArray(declared) ? declared : [],
        exists: (rel) => stagingExists(rel),
        where,
      })
      for (const p of verdict.problems) push(p.code, p.message, p.detail)
      rec.readings.files = Object.fromEntries(
        (Array.isArray(declared) ? declared : []).map((rel) => [rel, {
          exists: stagingExists(rel),
          bytes: bytesOf(rel),
        }]),
      )
      rec.readings.summary = verdict.readings

      caseFail(problems)
    })
  })

  test('SURF-03 注入面声明的每一份 .md 不许是空壳（去掉空白后必须非空；1 字节占位 ⇒ 红并点名那份）', async () => {
    await runCase('SURF-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── 控制面先跑（九组；含"CRLF 2 字节"与"缺一份不归这一格"两格）──────────
      const controls = nonemptyControls()
      rec.readings.controls = controls.controls
      for (const f of controls.failures) push(CODES.nonemptyControl, f)

      const declared = FROZEN.staged.injectedMarkdownFiles
      const where = 'FROZEN.staged.injectedMarkdownFiles（support/env.mjs）'
      rec.readings.declaration = { where, declared, criterion: '去掉空白后非空（非空白字符 >= 1）' }

      // 被测树不在 ⇒ 一条问题、这一格判不了（不逐份报 13 条）
      const lane = stagingLane()
      rec.readings.staging_root = { path: lane.root, exists: lane.judgeable }
      for (const p of lane.problems) push(p.code, p.message, p.detail)

      if (lane.judgeable) {
        const verdict = declaredFilesNonemptyProblems({
          declared: Array.isArray(declared) ? declared : [],
          read: inspect,
          where,
        })
        for (const p of verdict.problems) push(p.code, p.message, p.detail)
        // 读数：每份的 bytes / 非空白字符数（**不是判据**，是让"1 字节"一眼可读）
        rec.readings.files = Object.fromEntries(
          (Array.isArray(declared) ? declared : []).map((rel) => {
            const r = inspect(rel)
            return [rel, {
              status: r.status,
              bytes: typeof r.bytes === 'number' ? r.bytes : null,
              chars: r.status === 'ok' ? nonWhitespaceLength(r.text) : null,
            }]
          }),
        )
        rec.readings.summary = verdict.readings
      } else {
        rec.readings.summary = { judged: false, why: '被测 staging 不在盘上（见上面那条问题）' }
      }

      caseFail(problems)
    })
  })
})
