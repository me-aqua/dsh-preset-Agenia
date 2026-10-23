/**
 * MTC-01 … MTC-03 —— `F-125`：**每条进库的正文都有 400 字上限**（`.team/leader/2026-10-22/spec-F-125.md`）。
 *
 * 口径那一句话（老板 2026-10-22「不许超」）：400 字帽由 `lib/proposals.mjs::importVerdict` 里的
 * `bodyCapVerdict` 一处判，而**两条导入 CLI 都走它** —— `importOp({…, kind})` 只按 `kind` 换称呼
 * （"维护案" / "普通提案"），**不决定闸开不开**：`--op maintenance-import` 与 `--op proposal-import`。
 *
 * 这一批钉三样（每样单独承重）：
 *   · `MTC-01` —— `payload.entry.text`（modify/merge 的目标正文，普通提案也住这一格）：
 *     **401 必拒 · 400 必过**；**两条导入 CLI 同两格**（维护案 + 普通提案各导一次）——
 *     401 ⇒ **exit 2 且池子零写入**，400 ⇒ **exit 0 且追加一行**；
 *   · `MTC-02` —— `payload.engine_ops[].entry.text`（真维护案用的就是这一格）：同样 401 必拒 · 400 必过；
 *   · `MTC-03` —— **阳性对照**（量的是**旧工具面**，不是导入面）：普通候选 401 字**仍然**被
 *     `tools/proposal-file.mjs` 拒，400 过。那道闸 2026-10-18 就装上了 —— 它的绿证明
 *     "同一台机器、同一把尺子、同一个 401"，**不是"CLI 那条路没闸"的证据**：导入面那两格
 *     在 `MTC-01`（`--op proposal-import`）与 `MTC-02`（`--op maintenance-import`）里 ——
 *     两把闸（工具的 `proposal_file` 那条 + 导入的 `importVerdict` 那条）不互相顶掉。
 *     🔴 `MTC-03` 红了 = 旧那道闸坏了或被顶掉了；那时"同一把尺子"这条旁证也没了。
 *     它绿、导入面那两格绿，才能一起说明"每条进库的正文都过了同一把 400 的尺子"（`mig-rules-14`）。
 *
 * 口径（**逐字照定形，不许自己发明**）：
 *   · 用 `lib/memory.mjs::charCountOf` **同一把尺子**（去开头 BOM → `\r\n`/`\r` 归一 → 数 code point）；
 *   · **400 = 可以，401 = 不行**；
 *   · 检查对象是**所有会进库的正文**：`payload.entry.text` **以及** `payload.engine_ops[].entry.text`。
 *
 * 每条用例都量**两个面**（两处要能互相顶住）：
 *   ① **纯函数** `importVerdict({payload, state, poolEntries, existingVersions, kind})` —— 闸本体；
 *   ② **真 CLI** `node presets/agenia/bin/agenia-brain.mjs --op <两条导入之一>` —— 老板嘴里那个"入口"；
 *      被拒那一次必须**零写入**（池子一行都不许多）。
 *
 * 🔴 落盘纪律：所有写入都在**运行根**（`AGENIA_TEST_RUN_ROOT/maintenance-cap/**`）；
 *    `presets/**` 一个字节都不写（活体只读：import 它、spawn 它）。
 *
 * 🔴 这一批打的是**现役** `presets/agenia`（不是 staged 靶子）：定形的范围写的就是那两个文件
 *    （`presets/agenia/lib/proposals.mjs` + `lib/error-codes.mjs`），与 `PFL-01…11` 同一口径。
 *    两个环境变量只给**反向量测**用（把 `git show HEAD:` 的副本指进来跑同一份用例）：
 *    合法值只有两种 —— **现役那个路径**，或**运行根之下的副本**；别处一律在用例里报红
 *    （`AGENIA_F125_SUT_PROPOSALS` / `AGENIA_F125_SUT_BRAIN`，读数记在 `readings.sut`）。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { caseFail, preflight, problem, runCase, runId, runRoot } from '../support/evidence.mjs'
import { ensureMarkedDir, TEST_ROOT_MARKER } from '../support/root-guard.mjs'
import { runCli, writeFixture } from '../support/sut.mjs'

before(() => preflight())

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 仓库根 = `integration/` 往上三层（`tests/agenia-upgrade/integration` ⇒ 仓库根）。 */
const REPO = path.resolve(HERE, '..', '..', '..')
const PRESET = path.join(REPO, 'presets', 'agenia')
const LIVE = {
  proposals: path.join(PRESET, 'lib', 'proposals.mjs'),
  memory: path.join(PRESET, 'lib', 'memory.mjs'),
  errorCodes: path.join(PRESET, 'lib', 'error-codes.mjs'),
  tool: path.join(PRESET, 'tools', 'proposal-file.mjs'),
  brain: path.join(PRESET, 'bin', 'agenia-brain.mjs'),
}
/** 400 = 可以，401 = 不行（定形逐字：不改 400 这个数）。 */
const CAP = 400
const DAY = '2026-10-22'
/** 反向量测用的两个指针（见文件头；合法值只有"现役路径"与"运行根下的副本"）。 */
const SUT_ENV = { proposals: 'AGENIA_F125_SUT_PROPOSALS', brain: 'AGENIA_F125_SUT_BRAIN' }

// ── 小工具 ───────────────────────────────────────────────────────────────────
const sha256Text = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const readText = (p) => {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

/**
 * 交给人读的一段正文：`charCountOf` 恰好 n 个字。
 * 用全角汉字（1 字 = 1 code point = 1 个 `String.length`），"字数"与"码点数"在它上面重合 ——
 * 这样 401 / 400 这两个数**不是**靠 `.length` 与 `charCountOf` 的差凑出来的
 * （那种差另有两格专判：BOM 那一格与 CRLF 那一格）。
 */
const cjk = (n) => '字'.repeat(n)

let importSeq = 0
/** 动态 import（同一个文件也要拿新实例 —— 反向量测会在同一进程里换树）。 */
async function importFresh(file) {
  importSeq += 1
  return import(`${pathToFileURL(file).href}?f125=${importSeq}`)
}

/** 这一批要量的那一份被测模块（缺省 = 现役；反向量测时才走 env）。 */
function sutPath(which) {
  const raw = process.env[SUT_ENV[which]]
  if (raw === undefined || String(raw).trim() === '') return LIVE[which]
  return path.resolve(String(raw))
}

/**
 * 🔴 量测自证：**它量的是哪一版**。
 * `AGENIA_F125_SUT_*` 只许指到现役那几个路径、或运行根之下的副本 —— 别处（别的仓库、别人的树）
 * 一律在用例里报红，否则"这一跑打的是哪棵树"就成了没人负责的一句话。
 */
function sutLegal(file) {
  const abs = path.resolve(file).toLowerCase()
  const root = path.resolve(runRoot()).toLowerCase()
  const isLive = Object.values(LIVE).some((p) => path.resolve(p).toLowerCase() === abs)
  return isLive || abs.startsWith(`${root}${path.sep}`)
}

let dirSeq = 0
/**
 * 每个格一个**新的**落点（带 marker：CLI 的根判定要它；缺了会读成 `E_ROOT_NO_MARKER`，
 * 那条红说的就不是"太长"这件事了）。
 * ⚠️ 用**唯一名**而不是"先删再建"：删除要 marker 先存在，而这里的目标目录本来就是新的 ——
 *    为了删它去凑 marker，只会把"删错东西"的风险引进来。
 */
function freshDir(caseId, tag) {
  dirSeq += 1
  const stamp = `${process.pid}-${dirSeq}-${Date.now().toString(36)}`
  const dir = path.join(runRoot(), 'maintenance-cap', caseId, `${tag}-${stamp}`)
  mkdirSync(dir, { recursive: true })
  const marked = ensureMarkedDir(dir, { runRoot: runRoot(), runId: runId() })
  if (!existsSync(path.join(marked, TEST_ROOT_MARKER))) throw new Error(`E_NO_MARKER: ${marked} 没长出 ${TEST_ROOT_MARKER}`)
  return marked
}

/** 池子行（文件不在 = 0 行，合法空态）；一行坏 ⇒ `rows: null`。 */
function poolRows(root) {
  const file = path.join(root, 'proposals', 'pool.jsonl')
  const text = readText(file)
  if (text === null) return { exists: false, file, rows: [], corruptLine: null }
  const rows = []
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue
    try { rows.push(JSON.parse(line)) } catch { return { exists: true, file, rows: null, corruptLine: i + 1 } }
  }
  return { exists: true, file, rows, corruptLine: null }
}

/** 维护案信封（`--op maintenance-import` 的 `--in` 那份；`importVerdict` 收到的也是它）。 */
function envelopeOf(source, payload) {
  return {
    day: DAY,
    source,
    sha256: sha256Text(`（F-125 夹具）${source}`),
    base_snapshot: 'v0',
    update_generation: 1,
    review_attempt: 1,
    payload,
  }
}

/**
 * 跑一次闸本体。**抛出也算一种结果**：一个读 `entry.text` 却不看有没有 `entry` 的实现，
 * 会在"只有 retire 操作"的案上当场 TypeError —— 那不是这道闸的红，但也不许静默当成"放行"。
 */
function gate(mod, envelope, kind = 'maintenance') {
  try {
    return { thrown: false, value: mod.importVerdict({ payload: envelope, state: null, poolEntries: [], existingVersions: [], kind }) }
  } catch (error) {
    return { thrown: true, code: error?.code ?? error?.name ?? null, message: String(error?.message ?? error) }
  }
}

/** "太长"那个码要能一眼看出来：名字里有 `TOO_LONG`（复用 `E_PROPOSAL_TOO_LONG` 也行）。 */
const looksTooLong = (code) => typeof code === 'string' && /TOO_LONG/.test(code)

/**
 * "太长"这个拒绝的退出码（`CONTRACT.md` §8.2 ⑤：401 ⇒ **exit 2**；`E_PROPOSAL_TOO_LONG`）。
 * 这个数在这里写死，**不从被测的 `CODES` 表里读**：从被测读，实现把退出码改掉这一格也不会红。
 */
const LENGTH_REJECT_EXIT = 2

/**
 * 纯谓词：**这一次读数算不算一次合格的"太长"拒绝**。
 * 输入只有退出码与 stderr 尾巴两样 —— 不碰盘、不 spawn、不看池子 ⇒ 拿**合成读数**喂它也能判
 * （`MTC-01` 第 4 段的谓词自控就是这么喂的）；真那一格与自控读的是**同一个**谓词（一把尺子，两个读者）。
 *
 * 判定只分三种，第二种是这一格的病根：
 *   · `0`        ⇒ 它收下了 ⇒ 没有"拒绝"可读；
 *   · 非零但 ≠ 2 ⇒ **别的入参错也是非零** —— 只判"非零"分不出"这道闸在"与"别的错先炸了"；
 *   · `2`        ⇒ 合格。
 * `stderrText` **不参与判定**（只进红因）：退出码是契约，报文可以被人改 —— 拿报文当判据，等于把契约交给散文。
 */
function lengthRejectionVerdict(exitCode, stderrText = '') {
  if (exitCode === LENGTH_REJECT_EXIT) return { ok: true, why: '' }
  const base = exitCode === 0
    ? '它收下了（exit 0）—— 这条入口没有闸，没有"拒绝"可读'
    : `非零但不是 ${LENGTH_REJECT_EXIT}（实得 exit ${JSON.stringify(exitCode)}）—— 别的入参错也是非零，那种非零说明不了这道闸在`
  const tail = String(stderrText ?? '').trim()
  return { ok: false, why: tail === '' ? base : `${base}；stderr：${tail}` }
}

/**
 * 真 CLI 跑一次导入（老板嘴里那个"入口"）。
 * `op` 缺省 `maintenance-import`；另一条合法值是 `proposal-import` —— 两条都走 `importOp`，
 * 差的只是 `kind`（见文件头）。拒绝码先读 stdout 的错误信封，取不到再退回 stderr 那一行。
 */
function cliImport(caseId, tag, envelope, op = 'maintenance-import') {
  const dir = freshDir(caseId, tag)
  const inFile = writeFixture(caseId, tag, envelope)
  const brain = sutPath('brain')
  if (!sutLegal(brain)) return { dir, illegalBrain: brain }
  if (!existsSync(brain)) return { dir, missingBrain: brain }
  const res = runCli('agenia-brain.mjs', {
    op, dataRoot: dir, inFile, testMode: true,
  }, { env: process.env, cliPath: brain })
  const pool = poolRows(dir)
  const stderr = String(res.stderr ?? '')
  const codeLine = /^\[[^\]]+\]\s+(E_[A-Z0-9_]+)/m.exec(stderr)
  const stderrCode = codeLine === null ? null : codeLine[1]
  const jsonCode = typeof res.json?.error?.code === 'string' ? res.json.error.code : null
  return {
    dir,
    brain,
    op,
    args: res.args,
    exit_code: res.exit_code,
    code: jsonCode ?? stderrCode,
    stderr_code: stderrCode,
    json_code: jsonCode,
    stderr: stderr.trim().split(/\r?\n/).slice(-2).join(' ⏎ '),
    stdout_tail: String(res.stdout ?? '').trim().split(/\r?\n/).slice(-1)[0] ?? '',
    json_ok: res.json?.ok ?? null,
    pool_exists: pool.exists,
    pool_rows: pool.rows === null ? `corrupt@${pool.corruptLine}` : pool.rows.length,
    pool_texts: pool.rows === null ? null : pool.rows.map((r) => ({
      ops: (r?.payload?.engine_ops ?? []).map((op) => ({
        kind: op?.kind,
        chars: typeof op?.entry?.text === 'string' ? [...op.entry.text].length : null,
      })),
      entry_chars: typeof r?.payload?.entry?.text === 'string' ? [...r.payload.entry.text].length : null,
    })),
  }
}

/** 载入一把尺子（`lib/memory.mjs::charCountOf`）—— 缺面就说清，别让"尺子不在"读成"字数都合格"。 */
async function loadRuler() {
  const abs = path.resolve(LIVE.memory)
  if (!existsSync(abs)) return { mod: null, error: `读不到 ${abs}` }
  try {
    const mod = await importFresh(abs)
    return typeof mod.charCountOf === 'function' ? { mod, error: null } : { mod: null, error: 'lib/memory.mjs 里没有导出 charCountOf' }
  } catch (error) {
    return { mod: null, error: String(error?.message ?? error) }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MTC-01 · `payload.entry.text`：401 必拒 · 400 必过（纯函数 + 真 CLI）
// ═════════════════════════════════════════════════════════════════════════════
test('MTC-01 payload.entry.text：401 字必拒 · 400 字必过（两条导入 CLI 同两格：拒=exit 2 且零写入、400=追加一行）', async () => {
  await runCase('MTC-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    // ── 0. 量测自证：这一跑读的是哪一版（反向量测靠它）──────────────────────────
    const proposalsFile = sutPath('proposals')
    rec.readings.sut = {
      proposals: proposalsFile,
      proposals_sha256: existsSync(proposalsFile) ? sha256File(proposalsFile) : null,
      brain: sutPath('brain'),
      overridden: { proposals: Boolean(process.env[SUT_ENV.proposals]), brain: Boolean(process.env[SUT_ENV.brain]) },
    }
    if (!sutLegal(proposalsFile)) {
      push('SUT-ILLEGAL-MODULE', `${proposalsFile} 既不是现役那个文件、也不在运行根之下 —— 这一跑打的是哪棵树说不清，不许当读数`)
      return caseFail(problems)
    }
    if (!existsSync(proposalsFile)) { push('SUT-SURFACE-MISSING', `读不到 ${proposalsFile}`); return caseFail(problems) }

    const ruler = await loadRuler()
    rec.readings.ruler_error = ruler.error
    if (ruler.mod === null) { push('SUT-SURFACE-MISSING', `尺子取不到：${ruler.error}`); return caseFail(problems) }
    const count = ruler.mod.charCountOf

    const T401 = cjk(401)
    const T400 = cjk(400)
    /** 去掉开头 BOM 之后 400 字：`String.length` 是 401，`charCountOf` 是 400。 */
    const BOM400 = `\uFEFF${cjk(400)}`
    /** `\r\n` 归一之后 400 字：`String.length` 是 500，`charCountOf` 是 400。 */
    const CRLF400 = `${cjk(300)}${'\r\n'.repeat(100)}`
    rec.readings.ruler = {
      chars: { t401: count(T401), t400: count(T400), bom400: count(BOM400), crlf400: count(CRLF400) },
      raw_lengths: { t401: T401.length, t400: T400.length, bom400: BOM400.length, crlf400: CRLF400.length },
    }
    if (count(T401) !== 401 || count(T400) !== 400 || count(BOM400) !== 400 || count(CRLF400) !== 400) {
      push('RULER-SELFCHECK', `尺子自证失败：${JSON.stringify(rec.readings.ruler)} —— 红的是夹具，不是被测对象`)
      return caseFail(problems)
    }

    const mod = await importFresh(proposalsFile)
    if (typeof mod.importVerdict !== 'function') {
      push('SUT-SURFACE-MISSING', `${proposalsFile} 没有导出 importVerdict —— 维护案这道闸无从判`)
      return caseFail(problems)
    }
    const codes = (await importFresh(path.join(path.dirname(proposalsFile), 'error-codes.mjs'))).CODES ?? {}

    /** 一格：跑闸本体并按 `want`（reject / accept）解释结果。 */
    const cell = (label, text, want) => {
      const payload = { maintenance: 'modify', base_snapshot: 'v0', target_entry_id: 'cand-x', entry: { id: 'cand-x', type: 'general', text } }
      const r = gate(mod, envelopeOf(`（F-125·MTC-01）${label}`, payload))
      const n = count(text)
      rec.readings[label] = r.thrown
        ? { chars: n, raw_length: text.length, thrown: r.code, message: r.message }
        : { chars: n, raw_length: text.length, ok: r.value?.ok, code: r.value?.code ?? null, message: r.value?.message ?? '' }
      if (r.thrown) {
        push('MTC-ENTRY-THROWN', `闸本体在「${label}」这一格直接抛了（${r.code}: ${r.message}）—— 拒绝不许用抛出去表达`)
        return
      }
      if (want === 'reject') {
        if (r.value?.ok === true) {
          push('MTC-ENTRY-401-ACCEPTED', `[${label}] payload.entry.text ${n} 字（上限 ${CAP}）竟然**收下了** —— 维护案入口没有这道闸，401 字直接进库`)
          return
        }
        if (!looksTooLong(r.value?.code)) {
          push('MTC-ENTRY-401-CODE', `正文 ${n} 字被拒了，但码是 ${JSON.stringify(r.value?.code)} —— 它要能一眼看出"太长"（名字里带 TOO_LONG）`)
        } else if (!Object.hasOwn(codes, r.value.code)) {
          push('MTC-ENTRY-401-CODE-UNREGISTERED', `码 ${r.value.code} 不在 lib/error-codes.mjs 的 CODES 表里 —— CLI 的 catch 只认表里的码，它会被折成 E_INTERNAL`)
        }
        const msg = String(r.value?.message ?? '')
        if (!msg.includes('401')) push('MTC-ENTRY-401-MESSAGE', `报文必须给出实测字数 401，实得 ${JSON.stringify(msg.slice(0, 160))}`)
        if (!msg.includes('400')) push('MTC-ENTRY-401-MESSAGE', `报文必须给出上限 400，实得 ${JSON.stringify(msg.slice(0, 160))}`)
        if (!/entry|正文/.test(msg)) push('MTC-ENTRY-401-MESSAGE', `报文必须点名出问题的那一格（entry / 正文），实得 ${JSON.stringify(msg.slice(0, 160))}`)
        if (!/维护|maintenance/i.test(msg)) push('MTC-ENTRY-401-MESSAGE', `报文必须说清这是**维护案**正文（复用 E_PROPOSAL_TOO_LONG 时尤其要），实得 ${JSON.stringify(msg.slice(0, 160))}`)
      } else if (r.value?.ok !== true) {
        push('MTC-ENTRY-400-REJECTED', `正文 ${n} 字（≤ ${CAP}）必须收，实得 ${JSON.stringify({ code: r.value?.code, message: r.value?.message })}`)
      }
    }

    // ── 1. 字数两头（承重）────────────────────────────────────────────────────
    cell('entry_401', T401, 'reject')
    cell('entry_400', T400, 'accept')
    // ── 2. 同一把尺子（两格）──────────────────────────────────────────────────
    //    BOM400 / CRLF400 的 `String.length` 分别是 401 / 500 —— 一个按 `.length` 判的实现会把它们
    //    判成"超了"，而 `charCountOf` 说 400 ⇒ 必须收。这两格是"同一把尺子"的**唯一**证据。
    cell('entry_bom400', BOM400, 'accept')
    cell('entry_crlf400', CRLF400, 'accept')

    // ── 3. 普通提案（`kind: 'proposal'`）：闸**同一条**，不是另一条 ────────────────
    //    两条导入 CLI 都走 `importVerdict`；`kind` 只决定报文怎么称呼这份案（"普通提案" / "维护案"），
    //    不决定闸开不开。这一段的纯函数面钉 401 拒 / 400 过，真 CLI 那两格在下一段。
    const proposalCell = (label, text, want) => {
      const r = gate(mod, envelopeOf(`（F-125·MTC-01）普通提案 ${label}`, { op: 'add', entry: { id: null, type: 'general', text } }), 'proposal')
      const n = count(text)
      rec.readings[label] = r.thrown
        ? { chars: n, raw_length: text.length, thrown: r.code, message: r.message }
        : { chars: n, raw_length: text.length, ok: r.value?.ok, code: r.value?.code ?? null, message: r.value?.message ?? '' }
      if (r.thrown) {
        push('MTC-PROP-THROWN', `闸本体在「${label}」这一格直接抛了（${r.code}: ${r.message}）—— 拒绝不许用抛出去表达`)
        return
      }
      if (want === 'reject') {
        if (r.value?.ok === true) {
          push('MTC-PROP-401-ACCEPTED', `[${label}] 普通提案 payload.entry.text ${n} 字（上限 ${CAP}）竟然**收下了** —— \`--op proposal-import\` 这条入口没有这道闸`)
          return
        }
        if (!looksTooLong(r.value?.code)) {
          push('MTC-PROP-401-CODE', `普通提案 ${n} 字被拒了，但码是 ${JSON.stringify(r.value?.code)} —— 它要能一眼看出"太长"（名字里带 TOO_LONG）`)
        } else if (!Object.hasOwn(codes, r.value.code)) {
          push('MTC-PROP-401-CODE-UNREGISTERED', `码 ${r.value.code} 不在 lib/error-codes.mjs 的 CODES 表里 —— CLI 的 catch 只认表里的码，它会被折成 E_INTERNAL`)
        }
        const msg = String(r.value?.message ?? '')
        if (!msg.includes('401')) push('MTC-PROP-401-MESSAGE', `报文必须给出实测字数 401，实得 ${JSON.stringify(msg.slice(0, 160))}`)
        if (!msg.includes('400')) push('MTC-PROP-401-MESSAGE', `报文必须给出上限 400，实得 ${JSON.stringify(msg.slice(0, 160))}`)
        if (!/entry|正文/.test(msg)) push('MTC-PROP-401-MESSAGE', `报文必须点名出问题的那一格（entry / 正文），实得 ${JSON.stringify(msg.slice(0, 160))}`)
      } else if (r.value?.ok !== true) {
        push('MTC-PROP-400-REJECTED', `普通提案 ${n} 字（≤ ${CAP}）必须收，实得 ${JSON.stringify({ code: r.value?.code, message: r.value?.message })}`)
      }
    }
    proposalCell('proposal_entry_401', T401, 'reject')
    proposalCell('proposal_entry_400', T400, 'accept')

    // ── 4. 真 CLI：老板嘴里那个"入口"（维护案这一条）────────────────────────────
    //    ⓪ 谓词自控（喂**合成读数**）：这一格钉的是"**只有 exit 2** 才算一次合格的'太长'拒绝"，
    //      那句判断住在 `lengthRejectionVerdict()` 里。谓词翻不了面时，下面那一格的绿只是装饰
    //      （`mig-rules-11`；同款做法见 `integration/packet.test.mjs` 的 `FAIL-SHAPE-CONTROL`）。
    const EXIT_PREDICATE_CONTROL = [
      { label: '照契约该接受的（E_PROPOSAL_TOO_LONG 的退出码）', exit_code: 2, stderr: '[2026-10-22T04:00:00+08:00] E_PROPOSAL_TOO_LONG 维护案正文 401 字，上限 400', want: true },
      { label: '别的入参错（非零但不是 2）', exit_code: 1, stderr: '[2026-10-22T04:00:00+08:00] E_ARG_HASH 哈希形状不合', want: false },
      { label: '它收下了（exit 0，没有拒绝报文）', exit_code: 0, stderr: '', want: false },
    ]
    rec.readings.cli401_exit_predicate_control = EXIT_PREDICATE_CONTROL.map((c) => {
      const v = lengthRejectionVerdict(c.exit_code, c.stderr)
      return { label: c.label, exit_code: c.exit_code, stderr: c.stderr, want: c.want, got: v.ok, why: v.why }
    })
    for (const c of rec.readings.cli401_exit_predicate_control) {
      if (c.got === c.want) continue
      // 红因必须点到**是哪个退出码过去了**：只说"自控失败"读不出它把哪一格当成了合格拒绝。
      push('MTC-CLI-401-EXIT-CONTROL', c.want
        ? `「太长」谓词自控：「${c.label}」喂 exit ${c.exit_code} **应当**被接受，实判**不接受**（${c.why}）—— 真的 exit ${c.exit_code} 也会被这一格判红`
        : `「太长」谓词自控：「${c.label}」喂 exit ${c.exit_code} **不**应当被接受，实判**接受** —— 它把 exit ${c.exit_code} 也当成了合格的"太长"拒绝`)
    }

    const payload401 = { maintenance: 'modify', base_snapshot: 'v0', target_entry_id: 'cand-x', entry: { id: 'cand-x', type: 'general', text: T401 } }
    const cli401 = cliImport('MTC-01', 'cli-entry-401', envelopeOf('（F-125·MTC-01）CLI 401', payload401))
    rec.readings.cli_entry_401 = cli401
    if (cli401.illegalBrain !== undefined) push('SUT-ILLEGAL-MODULE', `CLI 指到的 ${cli401.illegalBrain} 不在合法范围（现役 / 运行根之下）`)
    else if (cli401.missingBrain !== undefined) push('SUT-SURFACE-MISSING', `读不到 ${cli401.missingBrain}`)
    else {
      // 一条红只报一件事：**收下了** ⇒ 就已经说明"没有这道闸"（那时谈"码对不对 / 有没有零写入"没有对象）。
      // "算不算一次合格的'太长'拒绝"**只**由 `lengthRejectionVerdict()` 判 —— 钉的是 `exit 2`，
      // 不是"非零"：别的入参错也是非零（本用例第 5 段那三行说的就是这个病）。
      const verdict = lengthRejectionVerdict(cli401.exit_code, cli401.stderr)
      if (!verdict.ok) push('MTC-CLI-401-EXIT', `--op maintenance-import 导 401 字的维护案必须 exit ${LENGTH_REJECT_EXIT}（"太长"那个码的退出码）：${verdict.why}`)
      else {
        if (!looksTooLong(cli401.code)) push('MTC-CLI-401-CODE', `CLI 的拒绝码必须一眼看出"太长"（带 TOO_LONG），实得 ${JSON.stringify(cli401.code)}；stderr：${cli401.stderr}`)
        if (cli401.pool_rows !== 0) push('MTC-CLI-401-WRITE', `被拒的那一次改了池子（${JSON.stringify(cli401.pool_rows)} 行）—— 拒绝必须零写入`)
      }
    }

    const payload400 = { maintenance: 'modify', base_snapshot: 'v0', target_entry_id: 'cand-x', entry: { id: 'cand-x', type: 'general', text: T400 } }
    const cli400 = cliImport('MTC-01', 'cli-entry-400', envelopeOf('（F-125·MTC-01）CLI 400', payload400))
    rec.readings.cli_entry_400 = cli400
    if (cli400.illegalBrain === undefined && cli400.missingBrain === undefined) {
      if (cli400.exit_code !== 0) push('MTC-CLI-400-EXIT', `400 字的维护案必须收（上限是"超过 400 才拒"），实得 exit ${cli400.exit_code}；stderr：${cli400.stderr}`)
      if (cli400.pool_rows !== 1) push('MTC-CLI-400-WRITE', `400 字那一次必须恰好追加一行，实得 ${JSON.stringify(cli400.pool_rows)} 行`)
      else if (cli400.pool_texts?.[0]?.entry_chars !== 400) {
        push('MTC-CLI-400-TEXT', `池子里那一行的正文必须是 400 字（原文逐字入池），实得 ${JSON.stringify(cli400.pool_texts?.[0]?.entry_chars)}`)
      }
    }

    // ── 5. 另一条导入 CLI：`--op proposal-import`（同一个 400，整条路不许绕过去）──────
    //    判据（定形那句「不许超」落到两条入口上）：**401 ⇒ exit 2 且池子零写入 · 400 ⇒ exit 0 且追加一行**。
    //    exit 2 是 `E_PROPOSAL_TOO_LONG` 的退出码（`lib/error-codes.mjs`）；只判"非零"不够 ——
    //    别的入参错也是非零，那种非零说明不了这道闸在。
    const prop401 = { op: 'add', entry: { id: null, type: 'general', text: T401 } }
    const cliProp401 = cliImport('MTC-01', 'cli-proposal-401', envelopeOf('（F-125·MTC-01）CLI 普通提案 401', prop401), 'proposal-import')
    rec.readings.cli_proposal_401 = cliProp401
    if (cliProp401.illegalBrain !== undefined) push('SUT-ILLEGAL-MODULE', `CLI 指到的 ${cliProp401.illegalBrain} 不在合法范围（现役 / 运行根之下）`)
    else if (cliProp401.missingBrain !== undefined) push('SUT-SURFACE-MISSING', `读不到 ${cliProp401.missingBrain}`)
    else if (cliProp401.exit_code !== 2) {
      push('MTC-CLI-PROP-401-EXIT', `--op proposal-import 导 401 字必须 exit 2（"太长"那个码的退出码），实得 exit ${JSON.stringify(cliProp401.exit_code)}`
        + `${cliProp401.exit_code === 0 ? ' —— 它收下了，这条入口没有闸' : `；stderr：${cliProp401.stderr}`}`)
    } else {
      if (!looksTooLong(cliProp401.code)) push('MTC-CLI-PROP-401-CODE', `CLI 的拒绝码必须一眼看出"太长"（带 TOO_LONG），实得 ${JSON.stringify(cliProp401.code)}；stderr：${cliProp401.stderr}`)
      if (cliProp401.pool_rows !== 0) push('MTC-CLI-PROP-401-WRITE', `被拒的那一次改了池子（${JSON.stringify(cliProp401.pool_rows)} 行，pool_exists=${JSON.stringify(cliProp401.pool_exists)}）—— 拒绝必须零写入`)
    }

    const prop400 = { op: 'add', entry: { id: null, type: 'general', text: T400 } }
    const cliProp400 = cliImport('MTC-01', 'cli-proposal-400', envelopeOf('（F-125·MTC-01）CLI 普通提案 400', prop400), 'proposal-import')
    rec.readings.cli_proposal_400 = cliProp400
    if (cliProp400.illegalBrain === undefined && cliProp400.missingBrain === undefined) {
      if (cliProp400.exit_code !== 0) push('MTC-CLI-PROP-400-EXIT', `400 字的普通提案必须收（上限是"超过 400 才拒"），实得 exit ${cliProp400.exit_code}；stderr：${cliProp400.stderr}`)
      if (cliProp400.pool_rows !== 1) push('MTC-CLI-PROP-400-WRITE', `400 字那一次必须恰好追加一行，实得 ${JSON.stringify(cliProp400.pool_rows)} 行`)
      else if (cliProp400.pool_texts?.[0]?.entry_chars !== 400) {
        push('MTC-CLI-PROP-400-TEXT', `池子里那一行的正文必须是 400 字（原文逐字入池），实得 ${JSON.stringify(cliProp400.pool_texts?.[0]?.entry_chars)}`)
      }
    }

    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// MTC-02 · `payload.engine_ops[].entry.text`：401 必拒 · 400 必过（不许只查 payload.entry）
// ═════════════════════════════════════════════════════════════════════════════
test('MTC-02 维护案 engine_ops[].entry.text：401 字必拒 · 400 字必过（retire 案不许被误伤）', async () => {
  await runCase('MTC-02', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    const proposalsFile = sutPath('proposals')
    rec.readings.sut = {
      proposals: proposalsFile,
      proposals_sha256: existsSync(proposalsFile) ? sha256File(proposalsFile) : null,
      brain: sutPath('brain'),
      overridden: { proposals: Boolean(process.env[SUT_ENV.proposals]), brain: Boolean(process.env[SUT_ENV.brain]) },
    }
    if (!sutLegal(proposalsFile)) {
      push('SUT-ILLEGAL-MODULE', `${proposalsFile} 既不是现役那个文件、也不在运行根之下 —— 这一跑打的是哪棵树说不清，不许当读数`)
      return caseFail(problems)
    }
    if (!existsSync(proposalsFile)) { push('SUT-SURFACE-MISSING', `读不到 ${proposalsFile}`); return caseFail(problems) }

    const ruler = await loadRuler()
    if (ruler.mod === null) { push('SUT-SURFACE-MISSING', `尺子取不到：${ruler.error}`); return caseFail(problems) }
    const count = ruler.mod.charCountOf
    const T401 = cjk(401)
    const T400 = cjk(400)
    rec.readings.ruler = { chars: { t401: count(T401), t400: count(T400) } }
    if (count(T401) !== 401 || count(T400) !== 400) {
      push('RULER-SELFCHECK', `尺子自证失败：401 段量出 ${count(T401)}、400 段量出 ${count(T400)}`)
      return caseFail(problems)
    }

    const mod = await importFresh(proposalsFile)
    if (typeof mod.importVerdict !== 'function') { push('SUT-SURFACE-MISSING', `${proposalsFile} 没有导出 importVerdict`); return caseFail(problems) }
    const codes = (await importFresh(path.join(path.dirname(proposalsFile), 'error-codes.mjs'))).CODES ?? {}

    /** 真维护案形状：`engine_ops` 里 retire（无正文）+ modify（有正文）。 */
    const opsOf = (text) => ([
      { kind: 'retire', id: 'cand-retired' },
      { kind: 'modify', id: 'cand-target', entry: { id: 'cand-target', type: 'general', text } },
    ])
    const cell = (label, payloadOf, want, { needsEngineName = true } = {}) => {
      const r = gate(mod, envelopeOf(`（F-125·MTC-02）${label}`, payloadOf()))
      rec.readings[label] = r.thrown
        ? { thrown: r.code, message: r.message }
        : { ok: r.value?.ok, code: r.value?.code ?? null, message: r.value?.message ?? '' }
      if (r.thrown) {
        push('MTC-ENGINE-THROWN', `闸本体在「${label}」这一格直接抛了（${r.code}: ${r.message}）—— 读 engine_ops 时不许假设每一格都带 entry`)
        return
      }
      if (want === 'reject') {
        if (r.value?.ok === true) {
          push('MTC-ENGINE-401-ACCEPTED', `[${label}] engine_ops[].entry.text 401 字竟然**收下了** —— 说明只查了 payload.entry（或哪儿都没查）；真维护案就是这一格在进库`)
          return
        }
        if (!looksTooLong(r.value?.code)) push('MTC-ENGINE-401-CODE', `必须用"太长"那个码，实得 ${JSON.stringify(r.value?.code)}`)
        else if (!Object.hasOwn(codes, r.value.code)) push('MTC-ENGINE-401-CODE-UNREGISTERED', `码 ${r.value.code} 不在 CODES 表里 ⇒ CLI 会把它折成 E_INTERNAL`)
        const msg = String(r.value?.message ?? '')
        if (!msg.includes('401')) push('MTC-ENGINE-401-MESSAGE', `报文必须给出实测字数 401，实得 ${JSON.stringify(msg.slice(0, 160))}`)
        if (!msg.includes('400')) push('MTC-ENGINE-401-MESSAGE', `报文必须给出上限 400，实得 ${JSON.stringify(msg.slice(0, 160))}`)
        // 「点名哪一族」只在**超长的那一段确实在 engine_ops 里**时才要求 ——
        // 两处都超的时候，实现先报 entry 那一段是对的（次序不是契约，别把判据钉在实现的选择上）。
        if (needsEngineName && !msg.includes('engine_ops')) push('MTC-ENGINE-401-MESSAGE', `报文必须点名 engine_ops（哪一族被查出来超长），实得 ${JSON.stringify(msg.slice(0, 160))}`)
        if (!/维护|maintenance/i.test(msg)) push('MTC-ENGINE-401-MESSAGE', `报文必须说清这是维护案正文，实得 ${JSON.stringify(msg.slice(0, 160))}`)
      } else if (r.value?.ok !== true) {
        push('MTC-ENGINE-400-REJECTED', `这一格必须收，实得 ${JSON.stringify({ code: r.value?.code, message: r.value?.message })}（「${label}」）`)
      }
    }

    // ── 1. 承重：engine_ops 里 401 ⇒ 必拒；400 ⇒ 必过 ─────────────────────────
    cell('engine_401', () => ({ maintenance: 'modify', base_snapshot: 'v0', target_entry_id: 'cand-target', engine_ops: opsOf(T401) }), 'reject')
    cell('engine_400', () => ({ maintenance: 'modify', base_snapshot: 'v0', target_entry_id: 'cand-target', engine_ops: opsOf(T400) }), 'accept')
    // ── 2. 不许被"只看第一条"骗过去：超长的那一条在**第二位** ──────────────────
    cell('engine_401_second', () => ({
      maintenance: 'merge',
      base_snapshot: 'v0',
      target_entry_id: 'cand-target',
      engine_ops: [
        { kind: 'modify', id: 'cand-ok', entry: { id: 'cand-ok', type: 'general', text: T400 } },
        { kind: 'modify', id: 'cand-target', entry: { id: 'cand-target', type: 'general', text: T401 } },
      ],
    }), 'reject')
    // ── 3. 不许误伤：纯 retire 案没有正文，必须照样能导（每天的退休案就长这样）────
    cell('engine_retire_only', () => ({
      maintenance: 'retire',
      base_snapshot: 'v0',
      target_entry_id: 'cand-retired',
      engine_ops: [{ kind: 'retire', id: 'cand-retired' }],
    }), 'accept')
    // ── 4. 两处都超 ⇒ 也拒（次序不做判据，只判"拒了而且码对"）──────────────────
    cell('engine_both_401', () => ({
      maintenance: 'modify',
      base_snapshot: 'v0',
      target_entry_id: 'cand-target',
      entry: { id: 'cand-target', type: 'general', text: T401 },
      engine_ops: opsOf(T401),
    }), 'reject', { needsEngineName: false })

    // ── 5. 真 CLI：engine_ops 401 / 400 各跑一次 ──────────────────────────────
    const payload401 = { maintenance: 'modify', base_snapshot: 'v0', target_entry_id: 'cand-target', engine_ops: opsOf(T401) }
    const cli401 = cliImport('MTC-02', 'cli-engine-401', envelopeOf('（F-125·MTC-02）CLI engine_ops 401', payload401))
    rec.readings.cli_engine_401 = cli401
    if (cli401.illegalBrain !== undefined) push('SUT-ILLEGAL-MODULE', `CLI 指到的 ${cli401.illegalBrain} 不在合法范围`)
    else if (cli401.missingBrain !== undefined) push('SUT-SURFACE-MISSING', `读不到 ${cli401.missingBrain}`)
    else {
      if (cli401.exit_code === 0) push('MTC-CLI-ENGINE-401-EXIT', 'CLI 收下了 engine_ops 里 401 字的维护案（exit 0）')
      else {
        if (!looksTooLong(cli401.code)) push('MTC-CLI-ENGINE-401-CODE', `CLI 的拒绝码必须带 TOO_LONG，实得 ${JSON.stringify(cli401.code)}；stderr：${cli401.stderr}`)
        if (cli401.pool_rows !== 0) push('MTC-CLI-ENGINE-401-WRITE', `被拒的那一次改了池子（${JSON.stringify(cli401.pool_rows)} 行）—— 拒绝必须零写入`)
      }
    }

    const payload400 = { maintenance: 'modify', base_snapshot: 'v0', target_entry_id: 'cand-target', engine_ops: opsOf(T400) }
    const cli400 = cliImport('MTC-02', 'cli-engine-400', envelopeOf('（F-125·MTC-02）CLI engine_ops 400', payload400))
    rec.readings.cli_engine_400 = cli400
    if (cli400.illegalBrain === undefined && cli400.missingBrain === undefined) {
      if (cli400.exit_code !== 0) push('MTC-CLI-ENGINE-400-EXIT', `400 字的维护案必须收，实得 exit ${cli400.exit_code}；stderr：${cli400.stderr}`)
      if (cli400.pool_rows !== 1) push('MTC-CLI-ENGINE-400-WRITE', `400 字那一次必须恰好追加一行，实得 ${JSON.stringify(cli400.pool_rows)} 行`)
      else {
        const ops = cli400.pool_texts?.[0]?.ops ?? []
        const modify = ops.find((o) => o.kind === 'modify')
        if (modify === undefined || modify.chars !== 400) push('MTC-CLI-ENGINE-400-TEXT', `池子里那个 modify 操作的正文必须是 400 字，实得 ${JSON.stringify(ops)}`)
      }
    }

    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// MTC-03 · 阳性对照：普通候选 401 字**仍然**被 `proposal_file` 拒（两把闸不互相顶掉）
// ═════════════════════════════════════════════════════════════════════════════
test('MTC-03 阳性对照：普通候选 401 字仍被 proposal_file 拒（400 过 · 同一把尺子 · 拒=零写入）', async () => {
  await runCase('MTC-03', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    // 🔴 这一条量的是**旧闸**（`tools/proposal-file.mjs`，2026-10-18 就装上的那道）。
    //    它的绿是 `MTC-01/02` 那些红的合法性来源：同一台机器、同一把尺子、同一个 401 —— 旧的拒、新的不拒。
    const tool = path.resolve(LIVE.tool)
    rec.readings.sut = { tool, tool_sha256: existsSync(tool) ? sha256File(tool) : null }
    if (!existsSync(tool)) { push('SUT-SURFACE-MISSING', `读不到 ${tool}`); return caseFail(problems) }
    const mod = await importFresh(tool)
    if (typeof mod.proposalFileVerdict !== 'function' || typeof mod.proposalFileRun !== 'function') {
      push('SUT-SURFACE-MISSING', `${tool} 缺 proposalFileVerdict / proposalFileRun`)
      return caseFail(problems)
    }
    const tooLongCode = mod.PROPOSAL_FILE_CODES?.TOO_LONG

    const ruler = await loadRuler()
    if (ruler.mod === null) { push('SUT-SURFACE-MISSING', `尺子取不到：${ruler.error}`); return caseFail(problems) }
    const count = ruler.mod.charCountOf
    const T401 = cjk(401)
    const T400 = cjk(400)
    const BOM400 = `\uFEFF${cjk(400)}`
    const CRLF400 = `${cjk(300)}${'\r\n'.repeat(100)}`
    rec.readings.ruler = {
      chars: { t401: count(T401), t400: count(T400), bom400: count(BOM400), crlf400: count(CRLF400) },
      raw_lengths: { bom400: BOM400.length, crlf400: CRLF400.length },
    }
    if (count(T401) !== 401 || count(T400) !== 400 || count(BOM400) !== 400 || count(CRLF400) !== 400) {
      push('RULER-SELFCHECK', `尺子自证失败：${JSON.stringify(rec.readings.ruler)}`)
      return caseFail(problems)
    }

    const codes = (await importFresh(LIVE.errorCodes)).CODES ?? {}
    /** 纯函数那一面（不碰盘）。 */
    const verify = (label, text, want) => {
      let v = null
      try {
        v = mod.proposalFileVerdict({ args: { text, source: '（F-125·MTC-03）出处' }, poolEntries: [] })
      } catch (error) {
        push('MTC-CAND-THROWN', `${label}：纯函数抛了（${error?.code}: ${error?.message}）`)
        return
      }
      const n = count(text)
      rec.readings[label] = { chars: n, ok: v?.ok, code: v?.code ?? null, message: v?.message ?? '' }
      if (want === 'reject') {
        if (v?.ok === true) {
          push('MTC-CAND-401-ACCEPTED', `${label}：普通候选 ${n} 字被**收下**了 —— 旧那道 400 闸坏了（两把闸之间不该互相顶掉）`)
          return
        }
        if (v?.code !== tooLongCode) push('MTC-CAND-401-CODE', `${label}：码必须是 ${JSON.stringify(tooLongCode)}，实得 ${JSON.stringify(v?.code)}`)
        if (!Object.hasOwn(codes, String(v?.code))) push('MTC-CAND-401-CODE-UNREGISTERED', `${label}：码 ${v?.code} 不在 CODES 表里`)
        const msg = String(v?.message ?? '')
        if (!msg.includes('401') || !msg.includes('400')) push('MTC-CAND-401-MESSAGE', `${label}：报文必须给出实测字数 401 与上限 400，实得 ${JSON.stringify(msg.slice(0, 160))}`)
      } else if (v?.ok !== true) {
        push('MTC-CAND-400-REJECTED', `${label}：${n} 字必须收，实得 ${JSON.stringify({ code: v?.code, message: v?.message })}`)
      }
    }

    // ── 1. 旧闸的两头仍在（承重）────────────────────────────────────────────
    verify('cand_401', T401, 'reject')
    verify('cand_400', T400, 'accept')
    // ── 2. 同一把尺子：BOM / CRLF 归一后都是 400 ⇒ 也必须收（与 MTC-01 同口径）────
    verify('cand_bom400', BOM400, 'accept')
    verify('cand_crlf400', CRLF400, 'accept')

    // ── 3. 主路那一面：401 被拒且**零写入**（不是只有纯函数在拒）───────────────
    const root401 = freshDir('MTC-03', 'run-401')
    let run401 = null
    try {
      run401 = await mod.proposalFileRun({ text: T401, source: '（F-125·MTC-03）主路 401' }, { root: root401, at: `${DAY}T04:00:00.000Z`, day: DAY })
    } catch (error) {
      run401 = { threw: true, code: error?.code ?? null, message: String(error?.message ?? error) }
    }
    const pool401 = poolRows(root401)
    rec.readings.run_401 = {
      ok: run401?.ok ?? null,
      code: run401?.code ?? null,
      message: run401?.message ?? null,
      pool_rows: pool401.rows === null ? `corrupt@${pool401.corruptLine}` : pool401.rows.length,
    }
    if (run401?.ok === true) push('MTC-CAND-401-ACCEPTED', '主路：401 字竟然提成功了')
    else if (run401?.code !== tooLongCode) push('MTC-CAND-401-CODE', `主路：码必须是 ${JSON.stringify(tooLongCode)}，实得 ${JSON.stringify(run401?.code)}`)
    if (pool401.rows !== null && pool401.rows.length !== 0) push('MTC-CAND-401-WRITE', `主路被拒的那一次写了 ${pool401.rows.length} 行 —— 拒绝必须零写入`)

    // ── 4. 400 走主路必须成（"该绿时绿"：否则"拒一切"也能让上面几格全绿）─────────
    const root400 = freshDir('MTC-03', 'run-400')
    let run400 = null
    try {
      run400 = await mod.proposalFileRun({ text: T400, source: '（F-125·MTC-03）主路 400' }, { root: root400, at: `${DAY}T04:10:00.000Z`, day: DAY })
    } catch (error) {
      run400 = { threw: true, code: error?.code ?? null, message: String(error?.message ?? error) }
    }
    const pool400 = poolRows(root400)
    rec.readings.run_400 = {
      ok: run400?.ok ?? null,
      code: run400?.code ?? null,
      pool_rows: pool400.rows === null ? `corrupt@${pool400.corruptLine}` : pool400.rows.length,
      text_chars: pool400.rows?.[0]?.payload?.entry?.text === undefined ? null : count(pool400.rows[0].payload.entry.text),
    }
    if (run400?.ok !== true) push('MTC-CAND-400-REJECTED', `主路：400 字必须提得成，实得 ${JSON.stringify({ code: run400?.code, message: run400?.message })}`)
    if (pool400.rows === null) push('MTC-CAND-POOL-CORRUPT', `池子第 ${pool400.corruptLine} 行不是合法 JSON`)
    else if (pool400.rows.length !== 1) push('MTC-CAND-400-WRITE', `400 字那一次必须恰好追加一行，实得 ${pool400.rows.length} 行`)
    else if (rec.readings.run_400.text_chars !== 400) push('MTC-CAND-400-TEXT', `池子里那一行的正文必须是 400 字，实得 ${JSON.stringify(rec.readings.run_400.text_chars)}`)

    // ── 5. 这一条不许变成"按人拒"（工具不吃身份；`PFL-11` 已钉过，这里只留读数）──────
    rec.readings.identity_note = '工具不吃身份：本用例全程没给 role / agent / session 任何一格'

    caseFail(problems)
  })
})
