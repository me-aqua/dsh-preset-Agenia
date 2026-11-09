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
 *
 * ## 🔴 `F-135` 那一格（2026-10-25；**2026-11-09 重瞄成二选一**）：真那份常识在不在 / 空不空
 *
 * 病（重瞄前）：`presets/agenia/.runtime/common-sense.md`（常识正文）**没有任何一条套件判据**问过它在不在；
 * 注入器读不到 / 读到空文件时只**出声一次、这一节不注入** ⇒ 包静默薄成「style + 时间行」，全套照旧绿。
 * **2026-11-09 老板「常识可以整个撤了」`036f38f`**：那一节整体撤掉 ⇒ 旧断言（`warnOnce('tail-common-sense', …)`）
 * 所守的代码**已经不存在**。这一格不能删，只能**重瞄**：它现在只认**两个合法状态**，并点名落在哪一个。
 *
 * | 状态 | 代码信号 | 还要成立的 |
 * | --- | --- | --- |
 * | **(a) 注入** | 代码面（去注释）里还有那一节（`共享记忆 · 常识` / `commonSenseOf(` / `tail-common-sense`） | 读不到 / 空文件时**出声**（三条针）+ 文件在盘上且非空 |
 * | **(b) 撤注入** | 代码里声明了撤：`老板 2026-11-09：「常识可以整个撤了」` + `替代载体 = <反引号里的模块路径>` + `common-sense.md` 留在盘上 | 三样齐全 + 载体**真在盘上** + 文件在盘上且非空 |
 *
 * 两个信号同时在 ⇒ `SURF-COMMON-SENSE-AMBIGUOUS`；都没有 ⇒ `SURF-COMMON-SENSE-DECL-MISSING`；
 * 状态 (b) 声明缺一样 ⇒ `-DECL-MISSING`；载体不在 ⇒ `-CARRIER-MISSING`；文件不在 ⇒ `-MISSING`。
 * **不并进 13 份名单**：根不同（那一份在 `.runtime/` 数据段），混在一起会弄坏"同一张表"。
 *
 * 这一格钉三样（每样各报各的）：
 * 1. **活体那份在盘上 + 去掉空白后非空**（与 `SURF-03` 同一把尺子）—— 不在 / 空壳 / 读不出是三句话；
 * 2. **抽走对照**：运行根里放一份**活体正文的逐字节副本**，把副本改名搬开 ⇒ 必须报 `-MISSING` 并点名；
 *    搬回来 ⇒ 重新绿且逐字节相同（老板那份正文一个字节不碰 —— 只读它的字节）；
 * 3. **两个状态二选一**：`commonSenseCarrierVerdict({src, fileFact, carrierExists})`
 *    —— 状态 (a) 要三句出声；状态 (b) 要声明齐全 + 载体在盘上。控制面 `commonSenseCarrierControls()`
 *    带**三条刀**：K1 撤注入但声明删掉 ⇒ `-DECL-MISSING`；K2 状态 (b) 但文件不在 ⇒ `-MISSING`；
 *    K3 状态 (a) 但尾巴 warn 删掉 ⇒ `-SILENT`；另 K4 两边同时在 ⇒ `-AMBIGUOUS`、K5 载体不在 ⇒ `-CARRIER-MISSING`。
 *   ⚠️ (a) 的出声是**文本针**（证"字在"），不是行为证明 —— 行为那一半归探针的 `I3` / `I18`。
 *   ⚠️ 代码信号里的 `共享记忆 · 常识` 只扫**尾巴那一条载体**：`memory` 那一节（`sharedMemoryText`，
 *   组员侧照旧拼、由 `presets-two` 的 `SIDE-MEMORY` 单独要求）是另一条载体，理由写在
 *   `declared-surface.mjs::stripMemberMemoryCarrier` 上。
 */
import { before, describe, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FROZEN, PATHS } from '../support/env.mjs'
import { caseFail, caseHold, commitCopyReading, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { readStagedText, stagingExists, stagingPath, stagingRoot } from '../support/sut.mjs'
import {
  CODES,
  COMMON_SENSE_CODES,
  commonSenseCarrierControls,
  commonSenseCarrierVerdict,
  commonSenseControls,
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

/**
 * 一份**绝对路径**文件的事实（与 `inspect` 同形，只是不经过 staging 根）——
 * `F-135` 那一格要读的是**活体** `.runtime/common-sense.md` 与运行根里的夹具副本。
 */
function inspectAbs(abs) {
  try {
    if (!existsSync(abs)) return { status: 'missing' }
    const st = statSync(abs)
    if (!st.isFile()) return { status: 'unreadable', error: st.isDirectory() ? '它是个目录（不是文件）' : '它不是普通文件', bytes: st.size }
    return { status: 'ok', text: readFileSync(abs, 'utf8'), bytes: st.size }
  } catch (err) {
    return { status: 'unreadable', error: String(err?.message ?? err) }
  }
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

      // ── 🔴 `F-135` 格（2026-11-09 重瞄）：**两个合法状态二选一** ────────────────────────
      //    (a) 注入：代码面里那一节还在 ⇒ 读不到 / 空文件必须**出声**（三条针）+ 文件在盘上且非空；
      //    (b) 撤注入：代码里声明了「老板 2026-11-09：常识可以整个撤了」+ 替代载体（模块路径）+
      //        `common-sense.md` 留在盘上 ⇒ 三样齐全 + 载体真在盘上 + 文件在盘上且非空。
      //    两个信号同时在 ⇒ AMBIGUOUS；都没有 ⇒ DECL-MISSING；声明缺一样 ⇒ DECL-MISSING；载体不在 ⇒ CARRIER-MISSING。
      //    控制面 `commonSenseCarrierControls()` 带三条刀（K1 声明删 / K2 文件删 / K3 warn 删）+ K4 两边同 in + K5 载体不在。
      {
        const csPath = path.join(PATHS.finalPreset, '.runtime', 'common-sense.md')
        const where = '真那份常识（presets/agenia/.runtime/common-sense.md）'

        // ② 控制面：文件事实五组（旧 `commonSenseControls`：有正文 / 不在 / 1 字节 / 只剩空白 / 读不出）
        //    + 两个状态与三条刀（`commonSenseCarrierControls`）—— 判据自己先翻面
        const csControls = commonSenseControls()
        rec.readings.common_sense_file_controls = csControls.controls
        for (const f of csControls.failures) push(COMMON_SENSE_CODES.control, f)
        const carrierControls = commonSenseCarrierControls()
        rec.readings.common_sense_controls = carrierControls.controls
        for (const f of carrierControls.failures) push(COMMON_SENSE_CODES.control, f)

        // ① 主判据：真那份文件 + 真 inject.js（哪个合法状态，读数里点名）
        let injectorSrc = null
        try {
          injectorSrc = readStagedText('inject.js')
        } catch (err) {
          push(err?.code ?? 'SUT-SURFACE-MISSING', `读不到 staged 的 \`inject.js\`，常识那一侧的二选一判不了：${String(err?.message ?? err)}`)
        }
        const live = injectorSrc === null
          ? { problems: [], readings: { state: null, why: 'inject.js 读不到' } }
          : commonSenseCarrierVerdict({
            src: injectorSrc,
            fileFact: inspectAbs(csPath),
            carrierExists: (rel) => stagingExists(rel),
            where,
            filePath: csPath,
          })
        rec.readings.common_sense = live.readings
        /**
         * 🔴 技术评审 2026-11-03 `F4`：这份常识住在**数据段**（`presets/agenia/.runtime/`），不随提交走
         * ⇒ 从提交导出的只读副本里它必然不在。那时这一格**判不了**（`HOLD`），不是"常识没了"那种红；
         * 红只留给活树（活树里它不在 ⇒ 老板那份正文真的没了，`F-135` 的病）。
         * ⚠️ 空壳 / 读不出 / 状态坏了**照旧红**：副本里若真有人放了一份空文件，那是真缺陷，不是"副本答不了"。
         */
        const copyTree = commitCopyReading()
        rec.readings.copy_tree = copyTree
        const missingOnly = live.problems.length > 0 && live.problems.every((p) => p.code === COMMON_SENSE_CODES.missing)
        if (missingOnly && copyTree.is_copy) {
          caseHold(rec, 'SURF-COMMON-SENSE-NOT-IN-COPY',
            `这棵树是**提交的只读副本**（\`${copyTree.git_mark}\` 不在）⇒ \`${csPath}\` 是数据段（\`.runtime/\`），`
            + '不随提交走、本来就不该在副本里 ⇒ "常识在不在"这一格判不了。**不是绿**：要在活树上跑同一条判据'
            + '（`F4`：副本答不了的记 HOLD，不记红）')
        } else {
          for (const p of live.problems) push(p.code, p.message, p.detail)
        }

        // ② 抽走 / 还原对照（夹具副本，落在**运行根**里）：证明"这份文件没了 ⇒ 这一格真的红"。
        //    副本正文 = **活体那份的逐字节副本**（读它的字节，绝不改它）；活体那份已经坏了就用合成正文。
        //    🔴 这是组长点名的 **K2**：状态 (b) 声明它留在盘上，而它不在 ⇒ 必须是 `-MISSING`。
        if (injectorSrc !== null) {
          const fixtureDir = path.join(runRoot(), 'ws-surf-03-common-sense')
          mkdirSync(fixtureDir, { recursive: true })
          const fixtureFile = path.join(fixtureDir, 'common-sense.md')
          const liveFact = inspectAbs(csPath)
          const liveUsable = liveFact.status === 'ok' && nonWhitespaceLength(liveFact.text) > 0
          const fixtureText = liveUsable
            ? liveFact.text
            : '# 常识（SURF-03 夹具 · 不是老板那份）\n\n- 这条只用来证明"抽走那份文件 ⇒ 这一格会红"。\n'
          writeFileSync(fixtureFile, fixtureText, 'utf8')
          const verdictOf = (fileFact) => commonSenseCarrierVerdict({
            src: injectorSrc, fileFact, carrierExists: (rel) => stagingExists(rel), where: '<抽走对照>', filePath: fixtureFile,
          })
          const factOf = (p) => (existsSync(p)
            ? { status: 'ok', text: readFileSync(p, 'utf8'), bytes: statSync(p).size }
            : { status: 'missing' })
          const freshV = verdictOf(factOf(fixtureFile))
          renameSync(fixtureFile, `${fixtureFile}.off`) // 只改名搬开，**从不删除**
          const goneV = verdictOf(factOf(fixtureFile))
          renameSync(`${fixtureFile}.off`, fixtureFile)
          const backV = verdictOf(factOf(fixtureFile))
          const codes = (v) => v.problems.map((p) => p.code)
          const restoredSame = existsSync(fixtureFile) && readFileSync(fixtureFile, 'utf8') === fixtureText
          rec.readings.common_sense_ablation = {
            fixture: fixtureFile,
            state: freshV.readings.state,
            fresh: codes(freshV),
            without_file: codes(goneV),
            restored: codes(backV),
            restored_byte_identical: restoredSame,
          }
          if (freshV.problems.length !== 0) {
            push(COMMON_SENSE_CODES.control, `抽走对照的**起点**不绿（${JSON.stringify(codes(freshV))}）—— 那个夹具副本本应有正文，`
              + '所以"抽走它 ⇒ 红"这句话不能成立')
          }
          const gone = codes(goneV)
          if (JSON.stringify(gone) !== JSON.stringify([COMMON_SENSE_CODES.missing])) {
            push(COMMON_SENSE_CODES.control, `把常识**抽走**之后这一格必须报 \`${COMMON_SENSE_CODES.missing}\`，实得 ${JSON.stringify(gone)}`
              + ' —— 抽走还不红，说明"文件没了"这件事根本没人判（`F-135` 的病）')
          }
          if (backV.problems.length !== 0 || !restoredSame) {
            push(COMMON_SENSE_CODES.control, `把常识**放回原位**之后必须重新绿且逐字节相同，实得 ${JSON.stringify(codes(backV))} / 逐字节相同=${restoredSame}`)
          }
        }
      }

      caseFail(problems)
    })
  })
})
