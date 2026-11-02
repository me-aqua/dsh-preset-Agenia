/**
 * `FLIP-01` · **`BRG-07` 记下的翻面读数必须点名本提交的 `inject.js`**（长期票 `ticket-20261102-08` · 评审 `F7`）。
 *
 * 病根（评审原话）：`BRG-07` 记录的翻面读数不是本提交的 `inject.js`。
 * 契约（这一格钉的那一句）：`brg01-toolname-bridge.test.mjs` 文件头那段**翻面读数**
 * 里，"现役 `inject.js`"那一行必须给出**这一次提交里那份 `inject.js` 的字节数 + sha256**。
 *
 * ── 为什么读数必须点名是哪一版 ─────────────────────────────────────────────
 * 那段文字是 `BRG-07` 那把修**唯一**的翻面证据（"现役 RED 0 / GREEN 7；修前那一份 RED 1 / GREEN 6"）。
 * 它一旦跟不上 `inject.js`，"绿的那一跑"量的就是**另一份代码**，而读数看起来完全正常 ——
 * 证据件必须自报它实际量的是哪一版（`cand-20261019-0033` / `ticket-20261102-08`）。
 *
 * ── 量的是哪一份（口径）──────────────────────────────────────────────────
 * "本提交的 `inject.js`" = **git 对象里那个 blob**（`HEAD:presets/agenia/inject.js`）：
 *   · 字节数 + sha256 都从 `cat-file` 的字节算（不是从工作树）；
 *   · 另外照实记一份**盘上**那一份（若工作树脏，两个数会不同 —— 那是读数，不是判据）：
 *     判的是"读数点名**提交**那一份"，因为"派工那一刻的提交"才是这一票的对象（`F-160` 的口径）。
 *
 * ── 现在是什么状态（2026-11-02 重录之后）──────────────────────────────────
 * `brg01` 文件头那段读数已按本提交重录（字节数与 sha256 只写在那一段里，这里不复述 ——
 * 同一个数两份载体，改一处就等于没改）；所以这一格今天**绿**（收窄跑的 RUN_ID 与结算记在
 * `.team/test/2026-11-02/log.md`）。它按设计**会过期**：`inject.js` 一变，
 * 提交里那一份就与文件头那行对不上 ⇒ `FLIP-READING-STALE` 当场响。
 *
 * ── 这一格怎么变绿 ───────────────────────────────────────────────────────
 * 把那段读数按本提交重录（字节数 + sha256 前缀都换成本提交的值）。
 * ⚠️ 这是一条**会过期的判据**：`inject.js` 一变，它就该红 —— 这正是它的用处
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

test('FLIP-01 BRG-07 的翻面读数点名本提交的 inject.js：字节数 + sha256 都对得上 HEAD 那一份', async () => {
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
    const lineMatches = (item) => {
      const lower = item.text.toLowerCase()
      const shaOk = lower.includes(wantSha8)
      const bytesOk = byteCountsIn(item.text).includes(committed.bytes) || item.text.includes(`${wantBytes} B`)
      return { shaOk, bytesOk, ok: shaOk && bytesOk, full_sha: lower.includes(committed.sha256.toLowerCase()) }
    }
    const matches = injectorLines.map((item) => ({ ...item, match: lineMatches(item) }))
    readings.injector_line_matches = matches.map((item) => ({ line: item.line, bytes_ok: item.match.bytesOk, sha_ok: item.match.shaOk, full_sha: item.match.full_sha }))

    // 判据 ①：**至少一行**同时带本提交的字节数 + sha256 前缀
    if (!matches.some((item) => item.match.ok)) {
      push('FLIP-READING-STALE',
        `「${BLOCK_START_TEXT}」里没有一行同时给出**本提交**那份 \`inject.js\` 的字节数与 sha256：`
        + `本提交（${readings.injector.commit.value?.slice(0, 12)} · blob ${readings.injector.blob.sha1?.slice(0, 12)}）是 `
        + `${committed.bytes} B · sha256 ${wantSha8}…，而那段读数里出现的字节数 ${JSON.stringify(byteCountsIn(block.text))}、`
        + `与它同行的 sha 片段 ${JSON.stringify(matches.map((item) => ({ line: item.line, bytes_ok: item.match.bytesOk, sha_ok: item.match.shaOk })))}`
        + ' —— 绿的那一跑量的是另一份代码（`ticket-20261102-08` / `F7`）',
        { committed, want_sha8: wantSha8, lines: matches.map((item) => ({ line: item.line, text: item.text.trim().slice(0, 160) })) })
    }

    // 判据 ②：写着"现役"的那几行**必须**是本提交那一份（不许留一行旧数，新旧并排在那一段里）
    const current = matches.filter((item) => item.text.includes('现役'))
    readings.current_lines = current.map((item) => ({ line: item.line, ok: item.match.ok, bytes_ok: item.match.bytesOk, sha_ok: item.match.shaOk }))
    const staleCurrent = current.filter((item) => !item.match.ok)
    if (staleCurrent.length > 0) {
      push('FLIP-READING-STALE',
        `「${BLOCK_START_TEXT}」里标着「现役」的那 ${staleCurrent.length} 行不是本提交那一份：`
        + staleCurrent.map((item) => `第 ${item.line} 行「${item.text.trim().slice(0, 140)}」（本提交该是 ${committed.bytes} B · ${wantSha8}…）`).join(' · ')
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

    caseFail(problems)
  })
})
