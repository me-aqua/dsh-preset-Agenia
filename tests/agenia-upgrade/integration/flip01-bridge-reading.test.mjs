/**
 * `FLIP-01` · **`BRG-07` 记下的翻面读数必须点名这一跑 `HEAD` 的提交号 + 那一份 `inject.js` 的字节数 + sha256**
 * （长期票 `ticket-20261102-08` · 评审 `F7` 第一轮；第三轮评审 `R3-5` 收紧）。
 *
 * 病根（评审原话）：`BRG-07` 记录的翻面读数不是本提交的 `inject.js`。
 * 契约（这一格钉的那一句）：`brg01-toolname-bridge.test.mjs` 文件头那段**翻面读数**里，
 * "现役 `inject.js`"那一行必须给出**三个数，而且三个数属于同一个提交**：
 * 提交号（短哈希，挂在「提交」那个词后面）+ 那一份 blob 的字节数 + 它的 sha256 前缀。
 *
 * ── 为什么读数必须点名是哪一版 ─────────────────────────────────────────────
 * 那段文字是 `BRG-07` 那把修**唯一**的翻面证据（"现役 RED 0 / GREEN 7；修前那一份 RED 1 / GREEN 6"）。
 * 它一旦跟不上 `inject.js`，"绿的那一跑"量的就是**另一份代码**，而读数看起来完全正常 ——
 * 证据件必须自报它实际量的是哪一版（`cand-20261019-0033` / `ticket-20261102-08`）。
 *
 * 🔴 **只钉字节 + sha256 不够**（2026-11-03 第三轮评审 `R3-5`）：只要 `inject.js` 的字节没变，
 *    提交号写错也照样绿。而"哪一版"这件事在这里是**三个数**（提交号 / 字节数 / sha256）——
 *    `inject.js` 的字节可能跨提交不变（改别的文件重新提交），所以提交号是**独立的一格**，
 *    不许由另外两个数替它作证。三个数任一变化 ⇒ 这一格当场红（它按设计会过期，`cand-20261019-0042`）。
 *
 * ── 量的是哪一份（口径）──────────────────────────────────────────────────
 * "这一版" = **git 对象里那个 blob**（`HEAD:presets/agenia/inject.js`）+ **那一跑的 `HEAD`**：
 *   · 提交号 / 字节数 / sha256 都从 git 对象与 `rev-parse` 现取（不是从工作树）；
 *   · 另外照实记一份**盘上**那一份（若工作树脏，两个数会不同 —— 那是读数，不是判据）：
 *     判的是"读数点名**提交**那一份"，因为"派工那一刻的提交"才是这一票的对象（`F-160` 的口径）。
 *
 * ── 现在是什么状态（第三轮重录之后）──────────────────────────────────────
 * `brg01` 文件头那段读数已按本提交重录（三个数只写在那一段里，这里不复述 ——
 * 同一个数两份载体，改一处就等于没改）；所以这一格今天**绿**。
 *
 * ── 这一格怎么变绿 ───────────────────────────────────────────────────────
 * 把那段读数按本提交重录：提交号（短哈希）+ 字节数 + sha256 前缀三个一起换。
 * ⚠️ 这是一条**会过期的判据**：`inject.js` 一变、或 HEAD 一换，它就该红 —— 这正是它的用处
 * （"读数点名的是哪一版"不能靠人记；`cand-20261019-0042`：常驻绿/常驻红都不行，这条是**该红时红**）。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { batchBlobs, git, sha256Of as sha256Buf } from '../support/tree-at-commit.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const BRG_TEST = path.join(REPO, 'tests', 'agenia-upgrade', 'integration', 'brg01-toolname-bridge.test.mjs')
const INJECTOR_REL = 'presets/agenia/inject.js'
const INJECTOR = path.join(REPO, ...INJECTOR_REL.split('/'))
/** 读数块从这一句开始（`brg01` 文件头里那一段的小标题；markdown 反引号/加粗夹在中间也要认）。 */
const BLOCK_START_TEXT = 'BRG-07 的翻面读数'
const BLOCK_START = /BRG-07[\s`*]*的翻面读数/

/** 读数块 = 从 `BLOCK_START` 那一行起、到头部注释的结束行（它以星号加斜杠结尾）为止。 */
function readingBlockOf(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => BLOCK_START.test(line))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].includes('*/')) { end = i + 1; break }
  }
  return {
    start_line: start + 1,
    end_line: end,
    lines: lines.slice(start, end),
    text: lines.slice(start, end).join('\n'),
  }
}

/** 一段文字里出现的、形如 `123456 B` 的字节数（读数里那种写法）。 */
const byteCountsIn = (text) => [...String(text).matchAll(/(\d[\d,_]*)\s*B\b/g)].map((m) => Number(String(m[1]).replace(/[,_]/g, '')))

before(() => {
  preflight()
})

test('FLIP-01 BRG-07 的翻面读数点名这一版：提交号 + 字节数 + sha256 三个数对得上 HEAD（任一变化即红）', async () => {
  await runCase('FLIP-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {}
    rec.readings.flip01 = readings

    // ── ① 被读的那份文档 ───────────────────────────────────────────────────────
    let doc = null
    try {
      doc = readFileSync(BRG_TEST, 'utf8')
    } catch (err) {
      push('FLIP-FIXTURE', `读不到 ${BRG_TEST}：${String(err?.message ?? err)}`)
      return caseFail(problems)
    }
    const block = readingBlockOf(doc)
    readings.block = block === null ? null : { start_line: block.start_line, end_line: block.end_line, lines: block.lines.length, text: block.text }
    if (block === null) {
      push('FLIP-BLOCK-MISSING',
        `\`brg01\` 文件头里找不到「${BLOCK_START_TEXT}」这一段 —— 翻面读数没有落点了`
        + '（它不能只活在评审单 / 会话里：那种读数下一个人读不到）')
      return caseFail(problems)
    }

    // ── ② 本提交的那一份（git 对象）────────────────────────────────────────────
    const head = git(['rev-parse', 'HEAD'], { cwd: REPO })
    const commit = head.status === 0 ? String(head.stdout).trim() : ''
    const revParse = git(['rev-parse', `HEAD:${INJECTOR_REL}`], { cwd: REPO })
    const blobSha = revParse.status === 0 ? String(revParse.stdout).trim() : ''
    const blobs = /^[0-9a-f]{40}$/.test(blobSha) ? batchBlobs(REPO, [blobSha]) : new Map()
    const buf = blobs.get(blobSha) ?? null
    const committed = buf === null
      ? null
      : { bytes: buf.length, sha256: sha256Buf(buf) }
    // 盘上那一份：读数（工作树脏不脏），不是判据。
    const onDisk = existsSync(INJECTOR)
      ? { bytes: statSync(INJECTOR).size, sha256: createHash('sha256').update(readFileSync(INJECTOR)).digest('hex') }
      : null
    readings.injector = {
      file: INJECTOR,
      rel: INJECTOR_REL,
      commit: { value: /^[0-9a-f]{40}$/.test(commit) ? commit : null, stderr: String(head.stderr ?? '').slice(0, 200) },
      blob: { sha1: /^[0-9a-f]{40}$/.test(blobSha) ? blobSha : null, stderr: String(revParse.stderr ?? '').slice(0, 200) },
      committed,
      on_disk: onDisk,
      /**
       * 工作树与提交**同不同**：只作读数。
       * ⚠️ 不同的时候判据仍然按"提交"判 —— 但读的人要知道自己看到的两个数为什么会不一样。
       */
      disk_equals_commit: committed !== null && onDisk !== null
        && committed.bytes === onDisk.bytes && committed.sha256 === onDisk.sha256,
    }
    if (committed === null) {
      push('FLIP-FIXTURE',
        `读不出提交里那份 ${INJECTOR_REL} 的字节（commit=${JSON.stringify(readings.injector.commit)} · blob=${JSON.stringify(readings.injector.blob)}）`
        + ' —— 没有它就没有"本提交那一份"这把尺子')
      return caseFail(problems)
    }

    // ── ③ 读数块里的"现役 inject.js"那一行 ────────────────────────────────────
    const injectorLines = block.lines
      .map((line, index) => ({ line: block.start_line + index, text: line }))
      .filter((item) => item.text.toLowerCase().includes('inject.js'))
    readings.injector_lines = injectorLines
    if (injectorLines.length === 0) {
      push('FLIP-READING-NO-INJECTOR-LINE',
        `「${BLOCK_START_TEXT}」那一段里没有一行提到 \`inject.js\` —— 读数没点名它量的是哪个文件`)
    }

    /** sha256 的前 8 位（读数里那种「8 位十六进制 + `…`」的写法）；大小写不敏感。 */
    const wantSha8 = committed.sha256.slice(0, 8).toLowerCase()
    const wantBytes = String(committed.bytes)
    /** 这一跑 `HEAD` 的短哈希（30 位十六进制里取前 7 位）—— 三个数里的第三个，独立一格。 */
    const wantShort = readings.injector.commit.value === null ? null : readings.injector.commit.value.slice(0, 7).toLowerCase()
    /**
     * 一行文字里**挂在「提交」这个词后面的**哈希（短的 / 长的都认）。
     * 为什么限定在"提交/commit 后面"：裸的 7 位十六进制在字节数、sha256 前缀、文件名里都可能撞上，
     * 那样"提交号对不对"就会以"碰巧命中"的样子变绿（`cand-20261016-selfsourced-order-01` 那一族）。
     * 写法见 `brg01:49`：``（提交 `6a5d27b` · 222455 B · sha256 `37D63DAA…`）``。
     */
    const commitLabelsIn = (text) => [...String(text).matchAll(/(?:提交|commit)[^0-9a-f\n]{0,8}([0-9a-f]{7,40})/gi)]
      .map((m) => String(m[1]).toLowerCase())
    /**
     * 提交号 → **那个提交里这份 `inject.js` 的 blob SHA-1**（缓存；一处标签量一次）。
     *
     * 口径（第三轮评审 `R3-5`）：三个数必须属于**同一份文件** —— 行里写的提交号必须解析得出、
     * 而且那一版 `presets/agenia/inject.js` 的 blob SHA-1 必须**等于 HEAD 那一份**。
     * 为什么不是死抠"必须等于 HEAD 的短哈希"：HEAD 可能因为改了**别的文件**而前进，那时 `inject.js`
     * 逐字节没变、这一行的读数仍然说的是同一份代码；把那种前进判红只会训练人"不必要地重录"
     * （`cand-20261020-0032`：判据要能单独翻面，不要当变更探测器）。而"标签指向一个 `inject.js`
     * 不是这一份的提交"（写错号 / 抄了上一版的号）**当场红** —— 那才是 `R3-5` 点的那件事。
     */
    const headBlob = readings.injector.blob.sha1
    const labelVerdictCache = new Map()
    const labelVerdict = (label) => {
      if (labelVerdictCache.has(label)) return labelVerdictCache.get(label)
      const rev = git(['rev-parse', '--verify', '--quiet', `${label}^{commit}`], { cwd: REPO })
      const resolved = rev.status === 0 ? String(rev.stdout).trim() : ''
      const out = { label, commit: /^[0-9a-f]{40}$/.test(resolved) ? resolved : null, blob: null, resolves: /^[0-9a-f]{40}$/.test(resolved) }
      if (out.commit !== null) {
        const b = git(['rev-parse', '--verify', '--quiet', `${out.commit}:${INJECTOR_REL}`], { cwd: REPO })
        const blob = b.status === 0 ? String(b.stdout).trim() : ''
        out.blob = /^[0-9a-f]{40}$/.test(blob) ? blob : null
      }
      out.carries_head_blob = out.blob !== null && headBlob !== null && out.blob === headBlob
      labelVerdictCache.set(label, out)
      return out
    }
    const lineMatches = (item) => {
      const lower = item.text.toLowerCase()
      const shaOk = lower.includes(wantSha8)
      const bytesOk = byteCountsIn(item.text).includes(committed.bytes) || item.text.includes(`${wantBytes} B`)
      // 提交号：行里每一个"挂在提交后面的哈希"都去 git 里问一句"你那一版 inject.js 是不是这一份"，
      // 有**一个**通过就算这一格成立（一条读数里可能同时点到好几个提交，例如"修前那一份来自 6c848dd"）。
      const labels = commitLabelsIn(item.text)
      const labelVerdicts = labels.map((label) => labelVerdict(label))
      const commitOk = labelVerdicts.some((v) => v.carries_head_blob)
      return {
        shaOk, bytesOk, commitOk, labels, labelVerdicts,
        ok: shaOk && bytesOk && commitOk,
        full_sha: lower.includes(committed.sha256.toLowerCase()),
      }
    }
    const matches = injectorLines.map((item) => ({ ...item, match: lineMatches(item) }))
    readings.injector_line_matches = matches.map((item) => ({
      line: item.line, bytes_ok: item.match.bytesOk, sha_ok: item.match.shaOk,
      commit_ok: item.match.commitOk,
      commit_labels: item.match.labelVerdicts.map((v) => ({
        label: v.label, resolves: v.resolves, blob: v.blob === null ? null : v.blob.slice(0, 12), carries_head_blob: v.carries_head_blob,
      })),
      full_sha: item.match.full_sha,
    }))
    readings.want = {
      commit: readings.injector.commit.value, commit_short: wantShort,
      blob_sha1: headBlob, bytes: committed.bytes, sha256: committed.sha256,
      note: '三个数属于**同一份注入器**：标签那个提交里 `presets/agenia/inject.js` 的 blob 必须 = HEAD 那一份（`FLIP-READING-COMMIT-STALE`）',
    }

    // 判据 ①：**至少一行**同时带本提交的提交号 + 字节数 + sha256 前缀（三个数是**同一版**的三面）
    if (!matches.some((item) => item.match.ok)) {
      push('FLIP-READING-STALE',
        `「${BLOCK_START_TEXT}」里没有一行同时给出**这一版** \`inject.js\` 的提交号、字节数与 sha256：`
        + `HEAD（${readings.injector.commit.value?.slice(0, 12)} · blob ${readings.injector.blob.sha1?.slice(0, 12)}）那一份是 `
        + `${committed.bytes} B · sha256 ${wantSha8}…，而那段读数里出现的字节数 ${JSON.stringify(byteCountsIn(block.text))}、`
        + `与它同行的三者 ${JSON.stringify(matches.map((item) => ({ line: item.line, commit_ok: item.match.commitOk, bytes_ok: item.match.bytesOk, sha_ok: item.match.shaOk })))}`
        + ' —— 绿的那一跑量的是另一份代码（`ticket-20261102-08` / `F7`）',
        { committed, want_sha8: wantSha8, want_short: wantShort, lines: matches.map((item) => ({ line: item.line, text: item.text.trim().slice(0, 160) })) })
    }

    // 判据 ②：写着"现役"的那几行**必须**是这一版（三个数都要对；不许留一行旧数，新旧并排在那一段里）
    const current = matches.filter((item) => item.text.includes('现役'))
    readings.current_lines = current.map((item) => ({
      line: item.line, ok: item.match.ok, commit_ok: item.match.commitOk, bytes_ok: item.match.bytesOk, sha_ok: item.match.shaOk,
      labels: item.match.labelVerdicts.map((v) => ({ label: v.label, resolves: v.resolves, carries_head_blob: v.carries_head_blob })),
    }))
    const staleCurrent = current.filter((item) => !item.match.ok)
    if (staleCurrent.length > 0) {
      push('FLIP-READING-STALE',
        `「${BLOCK_START_TEXT}」里标着「现役」的那 ${staleCurrent.length} 行不是这一版：`
        + staleCurrent.map((item) => `第 ${item.line} 行「${item.text.trim().slice(0, 140)}」（这一版该是 ${committed.bytes} B · ${wantSha8}…，`
          + `提交号还要指得出这一份 blob；这一行的提交号 ${JSON.stringify(item.match.labelVerdicts.map((v) => v.label))} · `
          + `字节 ${item.match.bytesOk ? '对' : '不对'} · sha ${item.match.shaOk ? '对' : '不对'} · 提交号 ${item.match.commitOk ? '对' : '不对'}）`).join(' · ')
        + ' —— 新旧两个读数并排放在同一段里，读的人分不清哪个是这一版的')
    }

    // 判据 ③：读数**自己说的字节数**不许与它自己那一行的 sha 打架（"改了 sha 忘了改字节"那种半修）
    for (const item of matches) {
      const counts = byteCountsIn(item.text)
      if (counts.length === 0) continue
      const shaOk = item.text.toLowerCase().includes(wantSha8)
      const bytesOk = counts.includes(committed.bytes)
      if (shaOk !== bytesOk) {
        push('FLIP-READING-INCONSISTENT',
          `第 ${item.line} 行：sha 与字节数只说对了一半（sha ${shaOk ? '对' : '不对'} · 字节 ${bytesOk ? '对' : '不对'}，`
          + `行里的字节数 ${JSON.stringify(counts)}，本提交 ${committed.bytes}）—— 「${item.text.trim().slice(0, 120)}」`)
      }
    }

    // 判据 ④：**字节与 sha 都对、提交号却指不出这一份** ⇒ 单独一条红（第三轮评审 `R3-5`）。
    //    只钉字节时，`inject.js` 跨提交不变（改别的文件重新提交）就会让一个**写错的提交号**照样绿；
    //    提交号是独立的一格，不许由另外两个数替它作证。两种坏法分开说：
    //      · 标签解析不出一个提交（写错号 / 抄了不存在的号）；
    //      · 标签是个真提交，但它那一版 `inject.js` 不是这一份（抄了上一版的号 —— 最像"对"的那一种）。
    for (const item of matches) {
      if (!(item.match.bytesOk && item.match.shaOk) || item.match.commitOk) continue
      const detail = item.match.labelVerdicts.length === 0
        ? '这一行压根没写提交号（读数只说"字节 + sha"，没说这些字节属于哪个提交）'
        : item.match.labelVerdicts.map((v) => (v.resolves
          ? `「${v.label}」那一版 inject.js 的 blob 是 ${v.blob === null ? '(读不出)' : `${v.blob.slice(0, 12)}…`}（≠ HEAD 的 ${String(headBlob).slice(0, 12)}…）`
          : `「${v.label}」解析不出一个提交`)).join(' · ')
      push('FLIP-READING-COMMIT-STALE',
        `第 ${item.line} 行：字节数与 sha256 都是这一份，**提交号却指不出这一份**（${detail}）`
        + `—— 「${item.text.trim().slice(0, 140)}」`)
    }

    /**
     * ── 判据 ⑤ **控制面**（判据自己得先能翻面，`mig-rules-14`）─────────────────────────
     * 上面四条如果只会"照着这一跑的样子绿"，它们跟装饰没区别。这里喂**合成行**（照真实写法拼，
     * 只有"哪一位是错的"在变），四种形状各要一个结果：
     *   `a` 三个都对 ⇒ 成立；
     *   `b` 提交号写成**一个不存在的号** ⇒ ④ 那条码必须响（`commit_ok` 假）；
     *   `c` 提交号写成一个**真提交、但它那一版 inject.js 不是这一份** ⇒ ④ 也响（这条最容易假绿：
     *       号是真号，只是抄了上一版）；
     *   `d` 压根不写提交号（只有字节 + sha）⇒ ④ 也响（"字节就是身份"这句话正是 `R3-5` 要拦的）。
     * 期望值来自**这一跑现量的** `committed` / `headBlob`（不是手抄常量），所以 `inject.js` 一变，
     * 这四条控制跟着变而不是变成新的假绿。
     */
    const synth = (labelPart) => `*   · 现役 \`inject.js\`（${labelPart}${committed.bytes} B · sha256 \`${wantSha8.toUpperCase()}…\`）⇒ **RED 0 / GREEN 7**`
    const oldCommit = '0c352f2'
    const oldVerdict = labelVerdict(oldCommit)
    const controls = [
      { id: 'a', why: '三个都对 ⇒ 成立', line: synth(`提交 \`${readings.injector.commit.value.slice(0, 7)}\` · `), want: { ok: true, commitOk: true } },
      { id: 'b', why: '提交号是个不存在的号 ⇒ 提交号那一格假', line: synth('提交 `deadbee` · '), want: { ok: false, commitOk: false } },
      {
        id: 'c',
        why: `提交号是个真提交、但它那一版 inject.js 不是这一份（${oldCommit}）⇒ 提交号那一格假`,
        line: oldVerdict.resolves && !oldVerdict.carries_head_blob ? synth(`提交 \`${oldCommit}\` · `) : null,
        want: { ok: false, commitOk: false },
      },
      { id: 'd', why: '没写提交号（只有字节 + sha）⇒ 提交号那一格假', line: synth(''), want: { ok: false, commitOk: false } },
    ].filter((c) => c.line !== null)
    readings.control = controls.map((c) => {
      const got = lineMatches({ line: 0, text: c.line })
      return { id: c.id, why: c.why, want: c.want, got: { ok: got.ok, commit_ok: got.commitOk }, line: c.line.trim().slice(0, 160), pass: got.ok === c.want.ok && got.commitOk === c.want.commitOk }
    })
    for (const c of readings.control) {
      if (!c.pass) {
        push('FLIP-CONTROL',
          `控制面「${c.id}」不成立（${c.why}）：期望 ok=${c.want.ok} / commit_ok=${c.want.commitOk}，`
          + `实得 ok=${c.got.ok} / commit_ok=${c.got.commit_ok} —— 合成行：${c.line}。判据翻不了面，这一跑的绿不算数`)
      }
    }
    readings.control_skipped = controls.length === 4 ? [] : [`c：${oldCommit} 解析不出（或它那一版恰好就是这一份）⇒ 这一组跳过（读数，不是绿）`]

    caseFail(problems)
  })
})
