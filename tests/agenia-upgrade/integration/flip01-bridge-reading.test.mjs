/**
 * `FLIP-01` · **`BRG-07` 记下的翻面读数必须点名这一跑 `HEAD` 的「BRG-07 面」** —— 判的是那条修
 * **改没改**，不是"整个文件一个字节都没动"（`ticket-20261102-08` · 评审 `F7`；2026-11-08 深夜改口径）。
 *
 * ── 为什么不再钉整份文件的字节数 + sha256（三次重录之后的设计决定）──────────────
 * 旧口径：`brg01` 文件头「`BRG-07` 的翻面读数」里那行"现役 `inject.js`"必须给出**本提交整份文件**的
 * 提交号 + 字节数 + sha256。代价在 2026-11-08 现形：`inject.js` 一晚上被提交了三次
 * （`6d00d87` → `8c7cdce` → `4724312`），其中**一次只改了一条注释**，而每一次都让这一格红，
 * 唯一的解法是**人肉重跑两套刀**。判据没量错，但它量的是"文件有没有动"，不是"那条修有没有动"。
 *
 * **选了 (b)：把判据钉在「面」上**（组长 2026-11-08 给的三条路里最便宜且诚实的一条）：
 * 面 = 这把刀**切到 / 读到**的那几段代码（见下面 `FACE`）。判据变成
 *   "读数里那行点名的**面** ≡ `HEAD` 那一份的**面**"，并且"那行点名的提交里，同一份 `inject.js` 的面"也 ≡ 它。
 * ⇒ 改注释 / 改面之外的代码 ⇒ **不红**（读数不作废）；改面里的一个字节 ⇒ **红**（读数作废）。
 *
 * 🔴 **新失效模式（写在这里，别让下一个人以为它比实际更强）**：
 *   · 面之外的改动**不会**让这一格红，而那类改动**可能**让读数里那两个数（`RED 0 / GREEN 7` 与
 *     `RED 1 / GREEN 6`）失效 —— 这一格**不再测**它们，它只保证"刀切的那几段没动"。数是从
 *     点名的那一跑**继承**来的。要真正消掉这一条，得上 (a) **自量**（见下）；
 *   · 反过来，"面里的一个字节变了"必然红 —— 这一半比旧口径**更严**（旧口径里注释变了也红，
 *     新口径要求那行**必须**写出面摘要）。
 *
 * ── 为什么这一轮不上 (a)（自量：读数不匹配就自己跑一遍刀）──────────────────────
 * (a) 是长期正解，但它不是一行改动：要在格子里**嵌套跑 `run-all`**（两跑：现役 + 刀）⇒ 得处理
 * `NODE_TEST_CONTEXT` / `NODE_TEST_REPORTER` 那个坑（不摘 ⇒ exit 0 但一条不跑，batch 11 栽过）、
 * 得在 `tests/support` 里放一份**造刀器**（要自带 `lib/` + `tools/`）、还得管嵌套运行根的生命周期。
 * 那是一条独立的活，值得单开一票；这一轮先把"注释级改动也让整格红"这个代价去掉。
 *
 * 🔴 **不许"放松"成永远绿**（契约 §"FLIP-01 会过期"那一句）：面摘要必须是**逐字相等**，而且
 * 面**本身能不能翻面**由下面的 ⑤ 自己证（面外改一个字节 ⇒ 摘要不变；面内改一个字节 ⇒ 摘要变；
 * 锚点没了 ⇒ 红）。把 ⑤ 删掉，这一格就退回"抄一个十六进制串"的装饰。
 *
 * ── 这一格现在判五件事 ──────────────────────────────────────────────────────
 *   ① 读数块在（`brg01` 文件头「`BRG-07` 的翻面读数」）；
 *   ② 至少一行提到 `inject.js` 的行同时给出「本提交的**面摘要**」与「解析得出、且那一版面相同」的提交号；
 *   ③ 标着「现役」的那几行**必须**满足 ②（不许留一行旧数、新旧并排）；
 *   ④ 刀那一行（路径里带 `brg07-knife-`）记的**字节数 + sha256 前 8 位**必须与盘上那份副本逐字对上
 *      （新加：以前没人验过刀那份 artefact 是不是读数说的那一份）；
 *   ⑤ 面本身的自证：面外改一个字节 ⇒ 摘要**不变**；面内改一个字节 ⇒ 摘要**变**；锚点被删 ⇒ `FLIP-FACE-ANCHOR`。
 *
 * ── 量的是哪一份（口径不变）────────────────────────────────────────────────
 * "这一版" = **git 对象里那个 blob**（`HEAD:presets/agenia/inject.js`）+ 那一跑的 `HEAD`；
 * 盘上那一份只作读数（工作树脏不脏），不是判据。"哪一版"的锚点从"整份文件"换成"面"。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { batchBlobs, git, sha256Of as sha256Buf } from '../support/tree-at-commit.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const BRG_TEST = path.join(REPO, 'tests', 'agenia-upgrade', 'integration', 'brg01-toolname-bridge.test.mjs')
const INJECTOR_REL = 'presets/agenia/inject.js'
const INJECTOR = path.join(REPO, ...INJECTOR_REL.split('/'))
/** 读数块从这一句开始（`brg01` 文件头里那一段的小标题；markdown 反引号/加粗夹在中间也要认）。 */
const BLOCK_START_TEXT = 'BRG-07 的翻面读数'
const BLOCK_START = /BRG-07[\s`*]*的翻面读数/

/**
 * **「BRG-07 面」= 这把刀切到 / 读到的那几段代码。**
 * 每段的取法都是"唯一锚点 + 结构"（函数按**配对花括号**截，调用点按**到第二个锚点为止**截）：
 *   · `firstUserPromptOf`  —— 读子会话第一条用户消息（对号用的就是它）；
 *   · `bridgeTakeClaim`    —— 取 claim 的那一支（**刀切的就是这里**：按 prompt 对号 → 退回队首）；
 *   · `bridgeRecordClaim`  —— 父会话记 claim 时把 `prompt` 存进去（对号的另一半）；
 *   · `call-site`          —— `apply()` 里"读 prompt + 调 `bridgeTakeClaim`"那两行的**接线**。
 * 🔴 加/删面里的成员 = 改这一格的口径：同批改这里的 `FACE`、`brg01` 的读数、契约 §2.6。
 */
const FACE = [
  { id: 'firstUserPromptOf', kind: 'function', anchor: 'function firstUserPromptOf(session) {' },
  { id: 'bridgeRecordClaim', kind: 'function', anchor: 'function bridgeRecordClaim(call) {' },
  { id: 'bridgeTakeClaim', kind: 'function', anchor: 'function bridgeTakeClaim(header, pinKey, childPrompt) {' },
  { id: 'call-site', kind: 'span', anchor: 'const childPrompt = firstUserPromptOf(', until: 'bridgeTakeClaim(header, bridgeKey, childPrompt) : null' },
]

/** 从 `from` 那个 `{` 起按配对花括号截一段（引号里的花括号不算；模板串按普通串处理）。 */
function balancedBraceAt(text, from) {
  const open = text.indexOf('{', from)
  if (open < 0) return -1
  let depth = 0
  let quote = null
  for (let i = open; i < text.length; i += 1) {
    const c = text[i]
    if (quote !== null) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * 抽出「面」的正文。**抽不出来必须出声**（`ok:false` + 一句人话）：返回空面会让摘要变成常量，
 * 这一格就退回"抄一个十六进制串"。
 * @param {string} source 一份 `inject.js` 全文
 * @returns {{ok:boolean, why:string|null, regions:Array<{id:string,text:string}>}}
 */
export function brg07Face(source) {
  const text = String(source)
  const regions = []
  for (const spec of FACE) {
    const hits = text.split(spec.anchor).length - 1
    if (hits !== 1) {
      return { ok: false, why: `面「${spec.id}」的锚点 ${JSON.stringify(spec.anchor)} 命中 ${hits} 处（须恰好 1 处）—— 那段代码被改名/挪走了`, regions: [] }
    }
    const at = text.indexOf(spec.anchor)
    let end
    if (spec.kind === 'function') {
      const close = balancedBraceAt(text, at)
      if (close < 0) return { ok: false, why: `面「${spec.id}」的函数体花括号不闭合`, regions: [] }
      end = close
    } else {
      const tail = text.indexOf(spec.until, at)
      if (tail < 0) return { ok: false, why: `面「${spec.id}」的收尾锚点 ${JSON.stringify(spec.until)} 找不到`, regions: [] }
      end = tail + spec.until.length
    }
    regions.push({ id: spec.id, text: text.slice(at, end) })
  }
  if (regions.length !== FACE.length) return { ok: false, why: `面只抽到 ${regions.length}/${FACE.length} 段`, regions: [] }
  return { ok: true, why: null, regions }
}

/** 面摘要：`id:text` 逐段拼起来再 sha256（只吃内容，不吃行号；空面 ⇒ 抛，不许静默变常量）。 */
export function brg07FaceDigest(source) {
  const face = brg07Face(source)
  if (!face.ok) return { ok: false, why: face.why, digest: null, regions: [] }
  const joined = face.regions.map((r) => `${r.id}:${r.text}`).join('\n')
  return { ok: true, why: null, digest: createHash('sha256').update(joined, 'utf8').digest('hex'), regions: face.regions }
}

/** 一段文字里出现的、形如 `123456 B` 的字节数（读数里那种写法）。 */
const byteCountsIn = (text) => [...String(text).matchAll(/(\d[\d,_]*)\s*B\b/g)].map((m) => Number(String(m[1]).replace(/[,_]/g, '')))
/** 一段文字里"面摘要"的写法：`面 <8–64 位十六进制>`（大小写不敏感）。 */
const faceDigestsIn = (text) => [...String(text).matchAll(/(?:面|face)[^0-9a-f]{0,12}([0-9a-f]{8,64})/gi)].map((m) => String(m[1]).toLowerCase())
/** sha256 的前 8 位（读数里那种「8 位十六进制 + `…`」的写法）；大小写不敏感。 */
const sha8In = (text) => [...String(text).matchAll(/sha256[^0-9a-f]{0,8}([0-9a-f]{8})/gi)].map((m) => String(m[1]).toLowerCase())
/** 一行里点名的刀副本路径（`…/brg07-knife-…/inject.js`，**整条**路径，含它前面的目录）。 */
const knifePathIn = (text) => {
  const m = /((?:[^\s`'"()]*[\\/])?brg07-knife-[A-Za-z0-9._-]+[\\/]inject\.js)/i.exec(String(text))
  if (m === null) return null
  return m[1].replace(/\\/g, '/').replace(/^\.\//, '')
}

/** 读数块 = 从 `BLOCK_START` 那一行起、到头部注释的结束行（它以星号加斜杠结尾）为止。 */
function readingBlockOf(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => BLOCK_START.test(line))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].includes('*/')) { end = i + 1; break }
  }
  return { start_line: start + 1, end_line: end, lines: lines.slice(start, end), text: lines.slice(start, end).join('\n') }
}

before(() => {
  preflight()
})

test('FLIP-01 BRG-07 的翻面读数点名本提交的「面」（面摘要 + 提交号 + 刀副本的身份；面自己会翻面）', async () => {
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

    // ── ② 本提交那一份（git 对象）与它的「面」 ─────────────────────────────────
    const head = git(['rev-parse', 'HEAD'], { cwd: REPO })
    const commit = head.status === 0 ? String(head.stdout).trim() : ''
    const revParse = git(['rev-parse', `HEAD:${INJECTOR_REL}`], { cwd: REPO })
    const blobSha = revParse.status === 0 ? String(revParse.stdout).trim() : ''
    const blobs = /^[0-9a-f]{40}$/.test(blobSha) ? batchBlobs(REPO, [blobSha]) : new Map()
    const buf = blobs.get(blobSha) ?? null
    const committed = buf === null ? null : { bytes: buf.length, sha256: sha256Buf(buf), text: buf.toString('utf8') }
    const onDisk = existsSync(INJECTOR)
      ? { bytes: statSync(INJECTOR).size, sha256: createHash('sha256').update(readFileSync(INJECTOR)).digest('hex') }
      : null
    if (committed === null) {
      push('FLIP-FIXTURE',
        `读不出提交里那份 ${INJECTOR_REL} 的字节（commit=${JSON.stringify(commit)} · blob=${JSON.stringify(blobSha)}）—`
        + ' —— 没有它就没有"本提交那一份"这把尺子')
      return caseFail(problems)
    }
    const headFace = brg07FaceDigest(committed.text)
    readings.injector = {
      file: INJECTOR, rel: INJECTOR_REL,
      commit: /^[0-9a-f]{40}$/.test(commit) ? commit : null,
      blob: /^[0-9a-f]{40}$/.test(blobSha) ? blobSha : null,
      committed: { bytes: committed.bytes, sha256: committed.sha256 },
      on_disk: onDisk,
      disk_equals_commit: onDisk !== null && committed.bytes === onDisk.bytes && committed.sha256 === onDisk.sha256,
      /** 🔴 判据钉的就是这个（不是整份文件的 sha256）。 */
      face: { ok: headFace.ok, why: headFace.why, digest: headFace.digest, digest16: headFace.digest === null ? null : headFace.digest.slice(0, 16), regions: headFace.regions.map((r) => ({ id: r.id, bytes: r.text.length })) },
      /** 面之外还有多少字节（读数：告诉读的人"面只占整份文件的一小部分"）。 */
      face_bytes: headFace.regions.reduce((sum, r) => sum + r.text.length, 0),
    }
    if (!headFace.ok) {
      push('FLIP-FACE-ANCHOR', `本提交那一份 inject.js 的「BRG-07 面」抽不出来：${headFace.why}`
        + ' —— 面都抽不出来，"读数点名的是不是这一版"就没有可比之物（改口径要同批改 `FACE` / 读数 / 契约 §2.6）')
      return caseFail(problems)
    }
    const wantFace = headFace.digest.slice(0, 16)

    // ── ③ 读数块里提到 inject.js 的那几行 ─────────────────────────────────────
    const injectorLines = block.lines
      .map((line, index) => ({ line: block.start_line + index, text: line }))
      .filter((item) => item.text.toLowerCase().includes('inject.js'))
    readings.injector_lines = injectorLines
    if (injectorLines.length === 0) {
      push('FLIP-READING-NO-INJECTOR-LINE', `「${BLOCK_START_TEXT}」那一段里没有一行提到 \`inject.js\` —— 读数没点名它量的是哪个文件`)
    }

    /** 一行文字里**挂在「提交」这个词后面的**哈希（短 / 长都认）。 */
    const commitLabelsIn = (text) => [...String(text).matchAll(/(?:提交|commit)[^0-9a-f\n]{0,8}([0-9a-f]{7,40})/gi)]
      .map((m) => String(m[1]).toLowerCase())
    /** 提交号 → 那个提交里这份 `inject.js` 的**面摘要**（缓存；一处标签量一次）。 */
    const labelFaceCache = new Map()
    const labelFace = (label) => {
      if (labelFaceCache.has(label)) return labelFaceCache.get(label)
      const rev = git(['rev-parse', '--verify', '--quiet', `${label}^{commit}`], { cwd: REPO })
      const resolved = rev.status === 0 ? String(rev.stdout).trim() : ''
      const out = { label, commit: /^[0-9a-f]{40}$/.test(resolved) ? resolved : null, face: null, face16: null, resolves: /^[0-9a-f]{40}$/.test(resolved) }
      if (out.commit !== null) {
        const b = git(['rev-parse', '--verify', '--quiet', `${out.commit}:${INJECTOR_REL}`], { cwd: REPO })
        const blob = b.status === 0 ? String(b.stdout).trim() : ''
        if (/^[0-9a-f]{40}$/.test(blob)) {
          const fileBuf = batchBlobs(REPO, [blob]).get(blob) ?? null
          if (fileBuf !== null) {
            const d = brg07FaceDigest(fileBuf.toString('utf8'))
            out.face = d.ok ? d.digest : null
            out.face16 = out.face === null ? null : out.face.slice(0, 16)
          }
        }
      }
      out.carries_head_face = out.face !== null && out.face === headFace.digest
      labelFaceCache.set(label, out)
      return out
    }
    /**
     * 一行里的**面**判定：
     *   · `faceOk`  = 这一行写着本提交的面摘要（逐字，16 位小写）；
     *   · `commitOk`= 这一行的提交标签里**有一个**能解析、且它那一版 `inject.js` 的面与 HEAD 相同。
     */
    const lineFace = (item) => {
      const lower = item.text.toLowerCase()
      const digests = faceDigestsIn(item.text)
      const faceOk = digests.includes(wantFace)
      const labels = commitLabelsIn(item.text)
      const labelFaces = labels.map((label) => labelFace(label))
      const commitOk = labelFaces.some((v) => v.carries_head_face)
      return { faceOk, commitOk, digests, labels, labelFaces, ok: faceOk && commitOk }
    }
    const matches = injectorLines.map((item) => ({ ...item, match: lineFace(item) }))
    readings.injector_line_matches = matches.map((item) => ({
      line: item.line,
      face_ok: item.match.faceOk,
      commit_ok: item.match.commitOk,
      face_digests_in_line: item.match.digests,
      commit_labels: item.match.labelFaces.map((v) => ({ label: v.label, resolves: v.resolves, face16: v.face16, carries_head_face: v.carries_head_face })),
    }))
    readings.want = {
      commit: readings.injector.commit, commit_short: readings.injector.commit === null ? null : readings.injector.commit.slice(0, 7),
      blob_sha1: readings.injector.blob, face_digest16: wantFace,
      note: '判据钉「面」：面摘要逐字相等 + 提交标签那一版的面也相同（`FLIP-READING-STALE`）；'
        + '整份文件的字节数 / sha256 只作**来历**，不进判据（见文件头：新失效模式）',
    }

    // 判据 ①：**至少一行**同时给出本提交的**面摘要**与一个"面相同"的提交标签
    if (!matches.some((item) => item.match.ok)) {
      push('FLIP-READING-STALE',
        `「${BLOCK_START_TEXT}」里没有一行同时给出**这一版**的「面摘要」与提交号：`
        + `HEAD（${String(readings.injector.commit).slice(0, 12)} · blob ${String(readings.injector.blob).slice(0, 12)}）那一份的面是 `
        + `\`${wantFace}…\`（面占 ${readings.injector.face_bytes} 字节），而那段读数里出现的面摘要 `
        + `${JSON.stringify([...new Set(matches.flatMap((m) => m.match.digests))])}、`
        + `与它同行的判定 ${JSON.stringify(matches.map((item) => ({ line: item.line, face_ok: item.match.faceOk, commit_ok: item.match.commitOk })))}`
        + ' —— 读数点名的不是这一版的「BRG-07 面」（`ticket-20261102-08` / `F7`）',
        { want_face16: wantFace, lines: matches.map((item) => ({ line: item.line, text: item.text.trim().slice(0, 160) })) })
    }

    // 判据 ②：写着"现役"的那几行**必须**是这一版的面（不许留一行旧数，新旧并排）
    const current = matches.filter((item) => item.text.includes('现役'))
    readings.current_lines = current.map((item) => ({ line: item.line, ok: item.match.ok, face_ok: item.match.faceOk, commit_ok: item.match.commitOk }))
    const staleCurrent = current.filter((item) => !item.match.ok)
    if (staleCurrent.length > 0) {
      push('FLIP-READING-STALE',
        `「${BLOCK_START_TEXT}」里标着「现役」的那 ${staleCurrent.length} 行不是这一版的面：`
        + staleCurrent.map((item) => `第 ${item.line} 行「${item.text.trim().slice(0, 140)}」（这一版的面是 \`${wantFace}…\`，`
          + `提交号还要指得出同一份面；这一行的面 ${JSON.stringify(item.match.digests)} · 提交号 ${JSON.stringify(item.match.labelFaces.map((v) => v.label))}）`).join(' · ')
        + ' —— 新旧两个读数并排放在同一段里，读的人分不清哪个是这一版的')
    }

    // 判据 ③：刀那一行记的字节数 + sha256 前 8 位必须与**盘上那份副本**逐字对上
    //    （新加：以前没人验过"读数说的刀"是不是盘上那一份；换了刀而忘改读数，这一条会喊）
    const knifeLines = block.lines
      .map((line, index) => ({ line: block.start_line + index, text: line }))
      .filter((item) => knifePathIn(item.text) !== null)
    readings.knife_lines = knifeLines.map((item) => {
      const rel = knifePathIn(item.text)
      const abs = path.join(REPO, ...rel.split('/'))
      const exists = existsSync(abs)
      const bytes = byteCountsIn(item.text)
      const sha8s = sha8In(item.text)
      const actual = exists ? { bytes: statSync(abs).size, sha256: createHash('sha256').update(readFileSync(abs)).digest('hex') } : null
      return {
        line: item.line, rel, abs, exists,
        bytes_in_line: bytes, sha8_in_line: sha8s,
        actual: actual === null ? null : { bytes: actual.bytes, sha256_8: actual.sha256.slice(0, 8) },
        ok: actual !== null && bytes.includes(actual.bytes) && sha8s.includes(actual.sha256.slice(0, 8)),
      }
    })
    if (knifeLines.length === 0) {
      push('FLIP-KNIFE-ARTEFACT', `「${BLOCK_START_TEXT}」那一段里没有一行给出刀副本的路径（\`…/brg07-knife-…/inject.js\`）—— 刀那一侧的读数没有落点`)
    }
    for (const k of readings.knife_lines) {
      if (!k.exists) {
        push('FLIP-KNIFE-ARTEFACT', `第 ${k.line} 行点名的刀副本不在盘上：${k.abs} —— 读数说的那一份刀已经没了（重造刀要同批改读数）`)
      } else if (!k.ok) {
        push('FLIP-KNIFE-ARTEFACT',
          `第 ${k.line} 行记的刀副本身份与盘上那份不符：行里 bytes=${JSON.stringify(k.bytes_in_line)} / sha256 前 8 位=${JSON.stringify(k.sha8_in_line)}，`
          + `盘上 ${k.actual.bytes} B · ${k.actual.sha256_8}… —— 换了刀而读数没改（或反过来）`)
      }
    }

    /**
     * ── ⑤ **面本身的自证**（`mig-rules-14`：判据自己得先能翻面）─────────────────────────
     * 三条控制，都是纯文本操作（不跑任何东西）：
     *   `a` **面外改一个字节**（在文件末尾追加一行注释）⇒ 面摘要必须**不变**（这就是选 (b) 的收益）；
     *   `b` **面内改一个字节**（`bridgeTakeClaim` 里 `fresh.findIndex` → `fresh.findLastIndex`… 取一个确定的替换）⇒ 必须**变**；
     *   `c` **删掉面里的一段**（调用点那一行）⇒ 抽取必须**失败**（`ok:false`，`FLIP-FACE-ANCHOR` 那一侧）。
     * 期望值全部来自本提交的正文（不是手抄常量）⇒ `inject.js` 一变，控制跟着变。
     */
    const outsideEdit = `${committed.text}\n// FLIP-01 控制面：面外追加的一行注释\n`
    const outsideFace = brg07FaceDigest(outsideEdit)
    const insideAnchor = '      index = fresh.findIndex((item) => typeof item.prompt === \'string\' && item.prompt === prompt)'
    const insideHits = committed.text.split(insideAnchor).length - 1
    const insideEdit = insideHits === 1
      ? committed.text.replace(insideAnchor, '      index = fresh.findLastIndex((item) => typeof item.prompt === \'string\' && item.prompt === prompt)')
      : null
    const insideFace = insideEdit === null ? null : brg07FaceDigest(insideEdit)
    const cutFace = brg07FaceDigest(committed.text.replace('const claimedToolName = headerToolName === null ? bridgeTakeClaim(header, bridgeKey, childPrompt) : null', ''))
    const controls = {
      a: {
        id: 'a', why: '面外改一个字节（文件末尾追加注释）⇒ 面摘要**不变**',
        want: { ok: true, digestEqualsHead: true },
        got: { ok: outsideFace.ok, digestEqualsHead: outsideFace.ok && outsideFace.digest === headFace.digest },
        pass: outsideFace.ok && outsideFace.digest === headFace.digest,
      },
      b: {
        id: 'b', why: `面内改一个字节（\`findIndex\` → \`findLastIndex\`）⇒ 面摘要必须**变**（锚点命中 ${insideHits} 处）`,
        want: { ok: true, digestDiffers: true },
        got: insideFace === null ? { ok: false, digestDiffers: false } : { ok: insideFace.ok, digestDiffers: insideFace.digest !== headFace.digest },
        pass: insideHits === 1 && insideFace !== null && insideFace.ok && insideFace.digest !== headFace.digest,
      },
      c: {
        id: 'c', why: '删掉面里的一段（调用点那一行）⇒ 抽取必须失败',
        want: { ok: false },
        got: { ok: cutFace.ok },
        pass: cutFace.ok === false,
      },
    }
    readings.face_control = controls
    for (const key of ['a', 'b', 'c']) {
      if (!controls[key].pass) {
        push('FLIP-FACE-CONTROL',
          `面的自证「${key}」不成立（${controls[key].why}）：期望 ${JSON.stringify(controls[key].want)}，实得 ${JSON.stringify(controls[key].got)}`
          + ' —— 面摘要翻不了面，这一格就没有在判"那条修改没改"（`mig-rules-14`）')
      }
    }

    caseFail(problems)
  })
})
