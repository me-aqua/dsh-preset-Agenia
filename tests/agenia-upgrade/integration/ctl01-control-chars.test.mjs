/**
 * CTL-01 … CTL-05 —— `F-165`：**记忆正文（`entry.text`）里不许有控制字符**（`code < 32`，**只许 LF**；
 * CR 也禁）。定形 `.team/leader/2026-11-08/定形-batch9.md`；技术契约
 * `.team/test/2026-11-08/CONTRACT-batch9.md` §一（四条路径的清单/闸位/报文口径都写在那儿）。
 *
 * ── 四条路径（先点名，再写断言；数法见契约 §1.0）─────────────────────────────
 *   `P1` `proposal_file` 工具（`tools/proposal-file.mjs::proposalFileVerdict` → 候选池）；
 *   `P2` `--op proposal-import`（`bin/agenia-brain.mjs::importOp` → `lib/proposals.mjs::bodyCapVerdict` → 候选池）；
 *   `P3` `--op maintenance-import`（同一条 `bodyCapVerdict`；正文住 `payload.entry.text`
 *        **和** `payload.engine_ops[i].entry.text`）；
 *   `P4` `--op judge-commit`（`lib/snapshot.mjs::buildSnapshot` → 快照 = 真正进库的那一下）。
 * 第五条 `buildSnapshot` 调用者是 `opInit`，它传 `entries: []` ⇒ 不带一个字符，不算路径。
 *
 * ── 每一格怎么判（四格同一把尺子，只有 `where` 不同）────────────────────────
 *   喂五份**只差一个码点**的正文：`clean`（无控制字符）· `lf`（U+000A，**唯一**允许）·
 *   `damaged`（U+0001，1-based 码点下标 4）· `cr`（U+000D，下标 4）·
 *   `astral`（`😀` + U+0001，下标 **2**：字符单位是 **code point**，不是 UTF-16 码元 —— 与 `charCountOf` 同一把尺子）。
 *   · 收：clean / lf ⇒ 池子**恰好 1 行**且正文**逐字**等于送入的那份（P4 ⇒ 快照里逐字相同）；
 *   · 拒：damaged / cr ⇒ 不写（P1 池子 0 行 · P2/P3 池子 0 行 · P4 版本集合/current/phase 一个都不动）
 *     + 码**已登记**进 `lib/error-codes.mjs::CODES` + 报文含 `where` / `第 4 个字符` /
 *     `U+0001`（CR 格 = `U+000D`）；
 *   · **红不是邻居红的**：clean/lf 与 damaged/cr 走**同一份信封、同一组参数**，只差一个码点；
 *     clean/lf 收 ⇒ damaged 的拒只能来自那个码点。两边读数都落进 `readings`。
 *
 * ── 🔴 本格的现状（2026-11-08 15:0x 现读）────────────────────────────────────
 * 产品四个锚点已装（`controlCharVerdict` 在 `lib/memory.mjs`；P1 `proposalFileVerdict` / P2+P3 `bodyCapVerdict` /
 * P4 `buildSnapshot`），`E_PROPOSAL_CONTROL_CHAR` 已登记。**行为层已成立**：四条路对 damaged / CR / v15 真受损正文
 * 全部拒，`write_audit` 在每个拒的腿上 `clean:true`（没有"先写后拒"），CR 报 `U+000D`。
 * **唯一遗留红**：`第 <N> 个字符` 的单位 —— 现实现数 **UTF-16 码元**，`astral` 腿（`'😀\u0001'`）报"第 3 个"，
 * 按本项目冻结的字符单位（`char_metric.unit = unicode-code-point`）应是"第 2 个"。按码点迭代即修（契约 §1.7）。
 * 修完 `CTL-01…04` 必须 **GREEN**；`CTL-05`（替身）已经是绿 —— 它证明同一份判据在契约形状下可满足。
 *
 * ── 刀架（`CTL-05`）──────────────────────────────────────────────────────────
 * 用一份**测试替身**（`tests/agenia-upgrade/fixtures/ctl-sut/`：最小 brain CLI + 最小 `proposal_file` +
 * 一条码的 `CODES`；**不是产品副本**）在运行根里跑同一个 `measure()`；开跑/收口各量一次产品六份源码的
 * sha256，必须相同 ⇒ `CTL-LIVE-TOUCHED`。`AGENIA_CTL_KNIFE` 选变体：
 *   `ok`（最小实现 ⇒ 四条路全绿）· `only_tool`（只 P1 有闸 ⇒ P2/P3/P4 红）·
 *   `ban_lf`（忘了 LF 例外 ⇒ 四条路的 LF 腿红）· `allow_cr`（CR 先归一再查 ⇒ 四条路的 CR 腿红）·
 *   `first_only`（`engine_ops` 只看第 0 条 ⇒ 只 P3 的"第二位"腿红）。
 * 每把刀**只许翻它那几条**：翻多 = `CTL-KNIFE-OVERREACH`，翻少 = `CTL-KNIFE-NOT-BITING`，
 * 副本/锚点建不起来 = `CTL-CONTROL-UNAVAILABLE`；最小实现自己不绿 = `CTL-CONTROL-NOT-GREEN`。
 * 另有一把**切真源码**（组长 2026-11-08 点名）：把**已提交的产品**拷到运行根、把
 * `lib/memory.mjs::controlCharVerdict` 的 `if (cp < 32) {` 改成 `if (false) {`（锚点恰好 1 处）⇒
 * 四条路各翻四码（`DAMAGED` / `CR` / `ASTRAL` / `REAL-DAMAGED`）；**未切的同一份副本**先跑一遍必须全绿（对照）。
 * 锚点不在 ⇒ `CTL-REAL-KNIFE-ANCHOR`；切了跑不动 ⇒ `CTL-REAL-KNIFE-UNAVAILABLE`；翻错面 ⇒ `CTL-REAL-KNIFE-*`。
 *
 * ── 判什么 / 不判什么（scope note）────────────────────────────────────────────
 * **判**：四条路对"正文里有 `code<32` 且 ≠LF 的字符"的反应（收/拒 + 零写入 + 报文三样）。
 * **不判**：① `code >= 32`（含 DEL 127）与 Unicode 其它类别 —— 口径只到 `code < 32`；
 *   ② 正文超 400 字（`MTC-01…03` 那一族）、BOM / CRLF 的字数口径（`charCountOf` 那一族）；
 *   ③ 存量（库里已有的脏条目）—— 只卡入口（`F-72`）；
 *   ④ 池子行/快照的其它字段（那是 `store` / `proposal-file` 两族的格）。
 * **绿的边界**："绿 = 这四条路都会拒收并点名"；不是"库里的存量干净"。
 * **读哪棵树**：现役 `presets/agenia`（`AGENIA_CTL_SUT_PRESET` 只给反向量测用：合法值 = 现役或运行根下的副本，
 * 别处一律 `CTL-SUT-ILLEGAL`）。staged 与现役的差由入口的 `F57-TARGET` 单独管，这里不混。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { caseFail, caseHold, preflight, problem, runCase, runId, runRoot } from '../support/evidence.mjs'
import { ensureMarkedDir } from '../support/root-guard.mjs'
import { runCli, writeFixture } from '../support/sut.mjs'

before(() => preflight())

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 仓库根 = `integration/` 往上三层。 */
const REPO = path.resolve(HERE, '..', '..', '..')
const LIVE_PRESET = path.join(REPO, 'presets', 'agenia')
const SUT_ENV = 'AGENIA_CTL_SUT_PRESET'
const KNIFE_ENV = 'AGENIA_CTL_KNIFE'
const DAY = '2026-11-08'

/** 四份正文：只差一个码点（`damaged` / `cr` 的那一个字符都在 1-based 第 4 位）。 */
const BODIES = {
  clean: '甲乙丙丁',
  lf: '甲乙丙\n丁',
  damaged: '甲乙丙\u0001丁',
  cr: '甲乙丙\r丁',
  /** astral 腿：一个代理对（😀）在**码点**上只算 1 个字符 ⇒ U+0001 是第 **2** 个字符。 */
  astral: '😀\u0001',
}
const CHARACTER_INDEX = Object.freeze({ damaged: 4, cr: 4, astral: 2, real: null })

/**
 * **真受损正文**（定形「拿一份真受损正文喂进去必须红」）：从真实脑的 `v15` 快照里取一条
 * `entry.text` 里真有 `code<32 且 ≠LF` 的条目（2026-10-29 那一批：`v15` 三条正文共 12 个控制字符）。
 * 读数：`{ok, id, text, offenders:[{index, cp}], source, why}`。
 * 数据不在（副本 / 换机器）⇒ `ok:false` ⇒ 这一腿 **HOLD**（`CTL-REAL-DAMAGE-NO-DATA`），不算绿。
 */
function loadRealDamage() {
  const file = path.join(REPO, 'presets', 'agenia', '.runtime', 'memory', 'snapshots', 'v15.json')
  if (!existsSync(file)) return { ok: false, id: null, text: null, offenders: [], source: file, why: 'v15 快照不在（真实脑的数据不随副本走）' }
  try {
    const snap = JSON.parse(readFileSync(file, 'utf8'))
    const entries = Array.isArray(snap?.entries) ? snap.entries : []
    /** 先按 id 取那三条里的最后一条（13 个码点下标里有 7 个脏字符，最能代表"多个"）；取不到再扫第一条。 */
    const preferred = entries.find((e) => e?.id === 'cand-20261027-0416' && typeof e.text === 'string')
      ?? entries.find((e) => typeof e?.text === 'string' && hasLoneControl(e.text))
    if (preferred === undefined) return { ok: false, id: null, text: null, offenders: [], source: file, why: 'v15 里没有带控制字符的字符串条目（存量已经干净）' }
    const offenders = offendersOf(preferred.text)
    if (offenders.length === 0) return { ok: false, id: preferred.id, text: preferred.text, offenders: [], source: file, why: `${preferred.id} 里没有控制字符` }
    return { ok: true, id: preferred.id, text: preferred.text, offenders, source: file, why: null }
  } catch (error) {
    return { ok: false, id: null, text: null, offenders: [], source: file, why: `v15 读不动：${String(error?.message ?? error)}` }
  }
}

/** `code<32 且 ≠LF` 的码点：返回 1-based 下标 + 码点（按出现顺序）。 */
function offendersOf(text) {
  const out = []
  let i = 0
  for (const ch of String(text ?? '')) {
    const cp = ch.codePointAt(0)
    i += 1
    if (cp < 32 && cp !== 10) out.push({ index: i, cp })
  }
  return out
}

const hasLoneControl = (text) => offendersOf(text).length > 0

const REAL_DAMAGE = loadRealDamage()
if (REAL_DAMAGE.ok) BODIES.real = REAL_DAMAGE.text
const CODE_POINT = Object.freeze({ damaged: 1, cr: 13, astral: 1 })
/**
 * 报文里必须点名的"位置"（`where`）——每条路径/每一格一个**可接受集合**。
 * 首选是契约 §1.2 的名字；产品用同义词（`text` / `entries[i].text`）也认 —— 这一格判的是
 * "报文能定位到哪一格"，不是"措辞与契约逐字相同"。**路径**由上面的 `path` 读数说，不靠报文措辞。
 */
const PLACE = Object.freeze({
  P1: ['proposal_file', 'text'],
  P2: ['payload.entry.text'],
  P3a: ['payload.entry.text'],
  P3b: ['payload.engine_ops[1].entry.text'],
  P4: ['entries_patch[0].entry.text', 'entries[0].text'],
})
const ACCEPT_LEGS = Object.freeze(['clean', 'lf'])

// ── 小工具 ───────────────────────────────────────────────────────────────────
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const sha256Text = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const readText = (p) => {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

/** 被测那份 preset 的落点（现役 / 运行根副本）。 */
function sutFiles(preset) {
  const root = path.resolve(preset)
  return {
    preset: root,
    brain: path.join(root, 'bin', 'agenia-brain.mjs'),
    tool: path.join(root, 'tools', 'proposal-file.mjs'),
    proposals: path.join(root, 'lib', 'proposals.mjs'),
    snapshot: path.join(root, 'lib', 'snapshot.mjs'),
    memory: path.join(root, 'lib', 'memory.mjs'),
    errorCodes: path.join(root, 'lib', 'error-codes.mjs'),
  }
}

/** 这一跑量的是哪一版（`AGENIA_CTL_SUT_PRESET` 缺省 = 现役）。 */
function sutPreset() {
  const raw = process.env[SUT_ENV]
  if (raw === undefined || String(raw).trim() === '') return LIVE_PRESET
  return path.resolve(String(raw))
}

/** 🔴 量测自证：只许现役或运行根之下的副本（别的仓库 / 别人的树 ⇒ `CTL-SUT-ILLEGAL`）。 */
function sutLegal(preset) {
  const abs = path.resolve(preset).toLowerCase()
  const root = path.resolve(runRoot()).toLowerCase()
  return abs === path.resolve(LIVE_PRESET).toLowerCase() || abs.startsWith(`${root}${path.sep}`)
}

let importSeq = 0
/** 同一个文件也要拿新实例（反向量测会在同一个进程里换树）。 */
async function importFresh(file) {
  importSeq += 1
  return import(`${pathToFileURL(file).href}?ctl=${importSeq}`)
}

let dirSeq = 0
/** 每一格一个**新的**、带 marker 的落点（CLI 的根判定要 marker）。 */
function freshDir(tag, leg) {
  dirSeq += 1
  const stamp = `${process.pid}-${dirSeq}-${Date.now().toString(36)}`
  const dir = path.join(runRoot(), 'ctl', String(tag), `${leg}-${stamp}`)
  const root = ensureMarkedDir(dir, { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-brain-root' })
  if (!existsSync(path.join(root, '.agenia-test-root'))) throw new Error(`E_NO_MARKER: ${root}`)
  return root
}

/** 池子行（文件不在 = 0 行；坏行 ⇒ `rows:null` + `corruptLine`）。 */
function poolRows(root) {
  const file = path.join(root, 'proposals', 'pool.jsonl')
  const text = readText(file)
  if (text === null) return { exists: false, rows: [], corruptLine: null, file }
  const rows = []
  let corruptLine = null
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue
    try { rows.push(JSON.parse(line)) } catch { corruptLine = i + 1; break }
  }
  return { exists: true, rows: corruptLine === null ? rows : null, corruptLine, file }
}

/** 快照侧：版本集合（升序）/ `current` / 每个版本的正文 / `phase`。 */
function snapshotState(root) {
  const dir = path.join(root, 'memory', 'snapshots')
  const versions = existsSync(dir)
    ? readdirSync(dir).filter((n) => /^v\d+\.json$/.test(n)).map((n) => n.slice(0, -5)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    : []
  const currentRaw = readText(path.join(dir, 'current'))
  const texts = {}
  for (const v of versions) {
    try { texts[v] = (JSON.parse(readFileSync(path.join(dir, `${v}.json`), 'utf8')).entries ?? []).map((e) => e?.text) } catch { texts[v] = null }
  }
  let phase = null
  try { phase = JSON.parse(readFileSync(path.join(root, 'state', 'update', `${DAY}.json`), 'utf8')).phase ?? null } catch { phase = null }
  return { versions, current: currentRaw === null ? null : currentRaw.trim(), texts, phase }
}

/**
 * 从一句拒绝报文里读出三样：位置（`places` 里任意一个标签）/ 1-based 字符下标 / 码点。
 * 认的形状（契约 §1.2）：`第 <N> 个字符`（或 `字符索引 N`）· `U+0001`（或 `码点 1`）。
 * **读不出就是 `null`** —— 不替实现猜。
 */
function parseReading(message, places) {
  const text = String(message ?? '')
  const labels = Array.isArray(places) ? places : [places]
  const indexMatch = /第\s*(\d+)\s*个字符/.exec(text) ?? /字符(?:索引|位置)[：:\s]*(\d+)/.exec(text)
  let codePoint = null
  const hexMatch = /U\+([0-9A-Fa-f]{2,6})/.exec(text)
  if (hexMatch !== null) codePoint = Number.parseInt(hexMatch[1], 16)
  else {
    const decMatch = /(?:码点|code\s*point)[：:\s]*(0x[0-9A-Fa-f]+|\d+)/i.exec(text)
    if (decMatch !== null) codePoint = decMatch[1].toLowerCase().startsWith('0x') ? Number.parseInt(decMatch[1], 16) : Number(decMatch[1])
  }
  const hitLabel = labels.find((l) => text.includes(l)) ?? null
  return {
    where_hit: hitLabel !== null,
    where_label: hitLabel,
    index: indexMatch === null ? null : Number(indexMatch[1]),
    code_point: codePoint,
    message: text.slice(0, 400),
  }
}

/** 码点 ⇒ `U+XXXX`（**十六进制**；CR = U+000D，不是 U+0013）。 */
const hex4 = (cp) => cp.toString(16).padStart(4, '0').toUpperCase()

/** 判据只要求"码是登记过的"（`E_PROPOSAL_CONTROL_CHAR` 是建议名，不强制）。 */
function codeRegistered(codes, code) {
  return codes !== null && typeof code === 'string' && Object.hasOwn(codes.CODES ?? {}, code)
}

/**
 * 一条腿的判定（收/拒两向；四格共用）。
 * @param {object} ctx `{push, readings, codes, pathId}`
 * @param {{expectLeg:'clean'|'lf'|'damaged'|'cr', label:string, where:string}} spec
 * @param {{accepted:boolean, code?:string|null, message?:string|null, wroteCount?:number|null, wroteTexts?:string[]|undefined}} actual
 */
function judgeLeg(ctx, spec, actual) {
  const { push, readings, codes, pathId } = ctx
  const { expectLeg, label, where } = spec
  const places = Array.isArray(where) ? where : [where]
  const body = BODIES[expectLeg]
  /** `real` 腿：正文里有**多个**脏字符 ⇒ 报文点名其中**任意一个**（index+cp 成对）就合格。 */
  const offenders = expectLeg === 'real'
    ? (ctx.realOffenders ?? [])
    : [{ index: CHARACTER_INDEX[expectLeg], cp: CODE_POINT[expectLeg] }]
  const first = offenders[0] ?? { index: null, cp: null }
  const read = {
    leg: label,
    expect: expectLeg,
    where: places,
    body: JSON.stringify(body),
    character_index: first.index,
    code_point: first.cp,
    ...(expectLeg === 'real' ? { offenders: offenders.slice(0, 12), offender_count: offenders.length, real_id: ctx.realId ?? null } : {}),
    ...actual,
  }
  readings.legs[label] = read
  if (ACCEPT_LEGS.includes(expectLeg)) {
    if (actual.accepted === false) {
      push(`CTL-${pathId}-${expectLeg === 'clean' ? 'CLEAN' : 'LF'}-REJECTED`,
        `[${pathId}/${label}] **阳性对照被拒**：这份正文只含 ${expectLeg === 'clean' ? '汉字' : 'LF（U+000A，唯一允许的控制字符）'}，`
        + `应当收下，实得拒（code=${JSON.stringify(actual.code ?? null)}）—— 那么 damaged 那一格的"拒"分不出是不是同一把尺子：${String(actual.message ?? '').slice(0, 240)}`)
      return
    }
    if (typeof actual.wroteCount === 'number' && actual.wroteCount !== 1) {
      push(`CTL-${pathId}-READ-UNREADABLE`,
        `[${pathId}/${label}] 收下了，但落点应当**恰好 1 条**、实得 ${actual.wroteCount} 条 —— "收下"这件事没有可读的落点`)
      return
    }
    if (Array.isArray(actual.wroteTexts) && (actual.wroteTexts.length !== 1 || actual.wroteTexts[0] !== body)) {
      push(`CTL-${pathId}-TEXT-MUTATED`,
        `[${pathId}/${label}] 收下的正文必须**逐字**等于送入的那份（不 trim / 不归一换行），实得 ${JSON.stringify(actual.wroteTexts)}`)
    }
    return
  }
  // damaged / cr / astral / real：必须拒。
  if (actual.accepted !== false) {
    const tag = expectLeg === 'real' ? 'REAL-DAMAGED' : expectLeg === 'damaged' ? 'DAMAGED' : expectLeg === 'cr' ? 'CR' : 'ASTRAL-INDEX'
    push(`CTL-${pathId}-${tag}-ACCEPTED`,
      `[${pathId}/${label}] **收下了** —— 这条路径没有控制字符闸（应当拒，并点名 ${places.join(' 或 ')} / `
      + (expectLeg === 'real'
        ? `任意一个脏字符（这条真受损正文有 ${offenders.length} 个：${offenders.slice(0, 6).map((o) => `第 ${o.index} 个 U+${hex4(o.cp)}`).join(' / ')}…）`
        : `第 ${first.index} 个字符 / U+${hex4(first.cp)}）`)
      + `。${expectLeg === 'real' ? '这份正文来自真实脑 v15（不是夹具拼的）' : '同一份正文去掉那个码点（clean）是收的 ⇒ 红因只可能是这个码点'}`
      + `${actual.wroteTexts === undefined ? '' : `；落点正文 ${JSON.stringify(actual.wroteTexts).slice(0, 200)}`}`)
    return
  }
  if (!codeRegistered(codes, actual.code)) {
    push(`CTL-${pathId}-CODE-UNREGISTERED`,
      `[${pathId}/${label}] 拒了，但码 ${JSON.stringify(actual.code ?? null)} 不在 \`lib/error-codes.mjs::CODES\` 里 —— `
      + '没登记的码会被 CLI 折成 `E_INTERNAL`，"正文脏"与"程序有 bug"在报文里长得一模一样')
  }
  const parsed = parseReading(actual.message, places)
  read.reading = parsed
  if (!parsed.where_hit || !offenders.some((o) => parsed.index === o.index && parsed.code_point === o.cp)) {
    push(`CTL-${pathId}-READING-MISSING`,
      `[${pathId}/${label}] 拒了，但报文读不出三样：要 \`where ∈ ${JSON.stringify(places)}\`、`
      + (expectLeg === 'real'
        ? `\`第 <N> 个字符\` + \`U+XXXX\` 命中这条真受损正文里**任意一个**脏字符（${offenders.slice(0, 6).map((o) => `${o.index}/U+${hex4(o.cp)}`).join(' · ')}…）`
        : `\`第 ${first.index} 个字符\` + \`U+${hex4(first.cp)}\`（1-based 码点）`)
      + `；实得 where_hit=${parsed.where_hit}（${JSON.stringify(parsed.where_label)}）/ index=${JSON.stringify(parsed.index)} / code_point=${JSON.stringify(parsed.code_point)}；报文：${parsed.message}`)
  }
}

/**
 * 数据根的文件事实：`{files:{rel:sha256}, dirs:{rel:mtimeMs}}`（只读；不改任何东西）。
 * 用途：**"拒"必须发生在任何写之前** —— 文件集合 / 内容变了，或**已存在的目录** mtime 变了
 * （含"写了又删"：建了再删会把目录 mtime 推后）⇒ 这一格先写后拒。
 */
function rootFacts(root) {
  const files = {}
  const dirs = {}
  const go = (dir, rel) => {
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name)
      const r = rel === '' ? ent.name : `${rel}/${ent.name}`
      if (ent.isDirectory()) {
        try { dirs[r] = statSync(abs).mtimeMs } catch { /* 读不到就不记（不把"读不到"当"没变"） */ }
        go(abs, r)
      } else if (ent.isFile()) {
        try { files[r] = sha256File(abs) } catch { files[r] = null }
      }
    }
  }
  go(root, '')
  return { files, dirs }
}

/** `locks/` 是基础设施（抢锁会建/删锁文件），不进"先写后拒"的判据；marker 是夹具自己建的。 */
const auditIgnored = (rel) => rel === '.agenia-test-root' || rel === 'locks' || rel.startsWith('locks/')

/** 两次事实的差；`clean:true` = 拒之前一个字节都没写。 */
function writeAudit(before, after) {
  const added = Object.keys(after.files).filter((r) => !(r in before.files) && !auditIgnored(r))
  const removed = Object.keys(before.files).filter((r) => !(r in after.files) && !auditIgnored(r))
  const changed = Object.keys(after.files).filter((r) => r in before.files && after.files[r] !== before.files[r] && !auditIgnored(r))
  const dirTouched = Object.keys(after.dirs).filter((r) => r in before.dirs && after.dirs[r] !== before.dirs[r] && !auditIgnored(r))
  const newDirs = Object.keys(after.dirs).filter((r) => !(r in before.dirs) && !auditIgnored(r))
  return {
    added, removed, changed, dirTouched, newDirs,
    clean: added.length + removed.length + changed.length + dirTouched.length + newDirs.length === 0,
  }
}

// ── 四条路径的测量（同一个 `measure` 两个读者：路径用例 + 刀架）────────────────────
async function measureP1(ctx) {
  const { sut, tag, legs, push, readings } = ctx
  let tool = null
  try { tool = await importFresh(sut.tool) } catch (error) {
    push('CTL-P1-READ-UNREADABLE', `[P1] 载入 ${sut.tool} 失败：${String(error?.message ?? error)}`)
    return
  }
  if (typeof tool.proposalFileVerdict !== 'function' || typeof tool.proposalFileRun !== 'function') {
    push('CTL-P1-READ-UNREADABLE', `[P1] ${sut.tool} 缺导出 proposalFileVerdict / proposalFileRun`)
    return
  }
  for (const leg of legs) {
    const body = BODIES[leg]
    const source = `ctl-${tag}-p1-${leg}`
    let verdict
    try {
      verdict = tool.proposalFileVerdict({ args: { text: body, source, kind: 'general' }, poolEntries: [] })
    } catch (error) {
      verdict = { ok: false, code: error?.code ?? 'THROWN', message: `THROWN: ${String(error?.message ?? error)}` }
    }
    const root = freshDir(tag, `p1-${leg}`)
    const auditBefore = rootFacts(root)
    let run
    try {
      const out = await tool.proposalFileRun({ text: body, source: `${source}-run`, kind: 'general' }, { root, at: `${DAY}T12:00:00+08:00`, day: DAY })
      run = { ok: true, proposal_id: out?.proposal_id ?? null, code: null, message: null }
    } catch (error) {
      run = { ok: false, proposal_id: null, code: error?.code ?? 'THROWN', message: String(error?.message ?? error) }
    }
    const audit = writeAudit(auditBefore, rootFacts(root))
    const pool = poolRows(root)
    readings.roots[`p1-${leg}`] = root
    readings.write_audit = readings.write_audit ?? {}
    readings.write_audit[`p1-${leg}`] = audit
    readings.verdicts[`p1-${leg}`] = { ok: verdict?.ok === true, code: verdict?.code ?? null, message: verdict?.ok === true ? null : String(verdict?.message ?? '').slice(0, 400) }
    if (verdict?.ok === false && run.ok) {
      push('CTL-P1-ZERO-WRITE-VIOLATED', `[P1/${leg}] proposalFileVerdict 拒了，但 proposalFileRun 仍然追加了一行 —— 主路没走那道判决`)
    }
    // `verdict.ok:true` 而主路拒：**合法**（闸可能只装在主路那一层）。记读数，不判红 ——
    // 这一格要的是"主路拒得对"，不是"纯函数也得拒"（两者都拒是推荐形状，契约 §1.1）。
    readings.verdicts[`p1-${leg}`].verdict_run_split = verdict?.ok === true && run.ok === false
    const accepted = run.ok
    judgeLeg(ctx, { expectLeg: leg, label: leg, where: PLACE.P1 }, {
      accepted,
      code: accepted ? null : (run.code ?? verdict?.code ?? null),
      message: accepted ? null : String(run.message ?? verdict?.message ?? ''),
      wroteCount: pool.rows === null ? null : pool.rows.length,
      wroteTexts: pool.rows === null ? undefined : pool.rows.map((r) => r?.payload?.entry?.text),
    })
    if (!accepted && pool.rows !== null && pool.rows.length !== 0) {
      push('CTL-P1-ZERO-WRITE-VIOLATED', `[P1/${leg}] 拒了却写了 ${pool.rows.length} 行 —— 拒绝必须零写入`)
    }
    if (!accepted && !audit.clean) {
      push('CTL-P1-WROTE-BEFORE-REFUSAL', `[P1/${leg}] 拒了，但拒之前已经写过（闸在写之后）：${JSON.stringify(audit)} —— 这条路径必须先判后写`)
    }
    if (pool.rows === null) push('CTL-P1-READ-UNREADABLE', `[P1/${leg}] 池子有坏行（第 ${pool.corruptLine} 行）`)
  }
}

async function measureP2(ctx) {
  const { sut, tag, legs, push, readings } = ctx
  for (const leg of legs) {
    const body = BODIES[leg]
    const root = freshDir(tag, `p2-${leg}`)
    const envelope = {
      day: DAY,
      source: `ctl-${tag}-p2-${leg}`,
      sha256: sha256Text(`${tag}-p2-${leg}-${body}`),
      base_snapshot: 'v0',
      update_generation: 1,
      review_attempt: 1,
      payload: { entry: { id: 'cand-ctl-p2', type: 'general', text: body } },
    }
    const inFile = writeFixture(`ctl-${tag}-p2`, leg, envelope)
    const auditBefore = rootFacts(root)
    const res = runCli('agenia-brain.mjs', { op: 'proposal-import', dataRoot: root, inFile, testMode: true }, { env: process.env, cliPath: sut.brain })
    const audit = writeAudit(auditBefore, rootFacts(root))
    const pool = poolRows(root)
    readings.roots[`p2-${leg}`] = root
    readings.write_audit = readings.write_audit ?? {}
    readings.write_audit[`p2-${leg}`] = audit
    readings.cli[`p2-${leg}`] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null, message: String(res.json?.error?.message ?? res.stderr ?? '').slice(0, 400) }
    const accepted = res.exit_code === 0
    judgeLeg(ctx, { expectLeg: leg, label: leg, where: PLACE.P2 }, {
      accepted,
      code: accepted ? null : (res.json?.error?.code ?? null),
      message: accepted ? null : String(res.json?.error?.message ?? res.stderr ?? ''),
      wroteCount: pool.rows === null ? null : pool.rows.length,
      wroteTexts: pool.rows === null ? undefined : pool.rows.map((r) => r?.payload?.entry?.text),
    })
    if (!accepted && pool.rows !== null && pool.rows.length !== 0) {
      push('CTL-P2-ZERO-WRITE-VIOLATED', `[P2/${leg}] exit=${res.exit_code} 拒了却写了 ${pool.rows.length} 行 —— 拒绝必须零写入`)
    }
    if (!accepted && !audit.clean) {
      push('CTL-P2-WROTE-BEFORE-REFUSAL', `[P2/${leg}] 拒了，但拒之前已经写过（闸在写之后）：${JSON.stringify(audit)} —— 这条路径必须先判后写`)
    }
    if (pool.rows === null) push('CTL-P2-READ-UNREADABLE', `[P2/${leg}] 池子有坏行（第 ${pool.corruptLine} 行）`)
  }
}

async function measureP3(ctx) {
  const { sut, tag, legs, push, readings } = ctx
  const entryOf = (id, text) => ({ id, type: 'general', text, last_evidence_review: DAY })
  /**
   * 一条腿 = 一份信封（`entry.text` 与 `engine_ops` 两处都在；脏字符只放一处）。
   * `expectLeg` 决定"该收还是该拒"（`damaged-*` 两腿都按 `damaged` 判）。
   */
  const legSpec = {
    clean: { expectLeg: 'clean', entry: BODIES.clean, ops: ['第一处干净正文', '第二处干净正文'], where: PLACE.P3a },
    lf: { expectLeg: 'lf', entry: BODIES.lf, ops: ['第一处干净正文', '第二处干净正文'], where: PLACE.P3a },
    'damaged-entry': { expectLeg: 'damaged', entry: BODIES.damaged, ops: ['第一处干净正文', '第二处干净正文'], where: PLACE.P3a },
    'damaged-ops1': { expectLeg: 'damaged', entry: BODIES.clean, ops: ['第一处干净正文', BODIES.damaged], where: PLACE.P3b },
    cr: { expectLeg: 'cr', entry: BODIES.cr, ops: ['第一处干净正文', '第二处干净正文'], where: PLACE.P3a },
    astral: { expectLeg: 'astral', entry: BODIES.astral, ops: ['第一处干净正文', '第二处干净正文'], where: PLACE.P3a },
    real: { expectLeg: 'real', entry: BODIES.real, ops: ['第一处干净正文', '第二处干净正文'], where: PLACE.P3a },
  }
  for (const leg of legs) {
    const spec = legSpec[leg]
    if (spec === undefined) { push('CTL-P3-READ-UNREADABLE', `[P3] 不认识的腿 ${JSON.stringify(leg)}`); continue }
    const root = freshDir(tag, `p3-${leg}`)
    const envelope = {
      day: DAY,
      source: `ctl-${tag}-p3-${leg}`,
      sha256: sha256Text(`${tag}-p3-${leg}`),
      base_snapshot: 'v0',
      update_generation: 1,
      review_attempt: 1,
      payload: {
        entry: entryOf('cand-ctl-entry', spec.entry),
        engine_ops: spec.ops.map((text, i) => ({ kind: 'modify', id: `cand-ctl-${i === 0 ? 'a' : 'b'}`, entry: entryOf(`cand-ctl-${i === 0 ? 'a' : 'b'}`, text) })),
      },
    }
    const inFile = writeFixture(`ctl-${tag}-p3`, leg, envelope)
    const auditBefore = rootFacts(root)
    const res = runCli('agenia-brain.mjs', { op: 'maintenance-import', dataRoot: root, inFile, testMode: true }, { env: process.env, cliPath: sut.brain })
    const audit = writeAudit(auditBefore, rootFacts(root))
    const pool = poolRows(root)
    readings.roots[`p3-${leg}`] = root
    readings.write_audit = readings.write_audit ?? {}
    readings.write_audit[`p3-${leg}`] = audit
    readings.cli[`p3-${leg}`] = { exit_code: res.exit_code, code: res.json?.error?.code ?? null, message: String(res.json?.error?.message ?? res.stderr ?? '').slice(0, 400) }
    const accepted = res.exit_code === 0
    const row = pool.rows?.[0]
    const textOfLeg = (r) => (leg === 'damaged-ops1'
      ? r?.payload?.engine_ops?.[1]?.entry?.text
      : r?.payload?.entry?.text)
    if (accepted && row !== undefined && row !== null) {
      // 同一份行里两处都要逐字（正控那两格）：`payload.entry.text` = 送入的 entry；
      // `payload.engine_ops[1].entry.text` = 送入的第二处（两处各一格，别只看一处）。
      if (row?.payload?.entry?.text !== spec.entry) {
        push('CTL-P3-TEXT-MUTATED', `[P3/${leg}] 池子行里 \`payload.entry.text\` 必须逐字是送入的那份，实得 ${JSON.stringify(row?.payload?.entry?.text)}`)
      }
      const opsText = row?.payload?.engine_ops?.[1]?.entry?.text
      if (opsText !== spec.ops[1]) {
        push('CTL-P3-TEXT-MUTATED', `[P3/${leg}] 池子行里 \`payload.engine_ops[1].entry.text\` 必须逐字是送入的那份，实得 ${JSON.stringify(opsText)}`)
      }
    }
    judgeLeg(ctx, { expectLeg: spec.expectLeg, label: leg, where: spec.where }, {
      accepted,
      code: accepted ? null : (res.json?.error?.code ?? null),
      message: accepted ? null : String(res.json?.error?.message ?? res.stderr ?? ''),
      wroteCount: pool.rows === null ? null : pool.rows.length,
      wroteTexts: pool.rows === null ? undefined : pool.rows.map(textOfLeg),
    })
    if (!accepted && pool.rows !== null && pool.rows.length !== 0) {
      push('CTL-P3-ZERO-WRITE-VIOLATED', `[P3/${leg}] exit=${res.exit_code} 拒了却写了 ${pool.rows.length} 行 —— 拒绝必须零写入`)
    }
    if (!accepted && !audit.clean) {
      push('CTL-P3-WROTE-BEFORE-REFUSAL', `[P3/${leg}] 拒了，但拒之前已经写过（闸在写之后）：${JSON.stringify(audit)} —— 这条路径必须先判后写`)
    }
    if (pool.rows === null) push('CTL-P3-READ-UNREADABLE', `[P3/${leg}] 池子有坏行（第 ${pool.corruptLine} 行）`)
  }
}

async function measureP4(ctx) {
  const { sut, tag, legs, push, readings } = ctx
  const entryOf = (text) => ({
    id: 'cand-ctl-p4', type: 'general', text, raw: 0.5, imp_share: 1, fresh_share: 1,
    double_low_streak: 0, is_double_low: false, last_evidence_review: DAY,
    known_from: 'ctl-fixture', created_at: '2026-11-08T00:00:00+08:00', type_changed_at: null,
  })
  for (const leg of legs) {
    const body = BODIES[leg]
    const root = freshDir(tag, `p4-${leg}`)
    const init = runCli('agenia-brain.mjs', { op: 'init', dataRoot: root, testMode: true }, { env: process.env, cliPath: sut.brain })
    if (init.exit_code !== 0) { push('CTL-P4-SETUP', `[P4/${leg}] init 必须先成功（夹具前置），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`); continue }
    const claimFile = writeFixture(`ctl-${tag}-p4`, `${leg}-claim`, { day: DAY, owner_project: 'ctl', owner_session: `ctl-${tag}-${leg}` })
    const claim = runCli('agenia-brain.mjs', { op: 'claim-update', dataRoot: root, inFile: claimFile, testMode: true }, { env: process.env, cliPath: sut.brain })
    if (claim.exit_code !== 0) { push('CTL-P4-SETUP', `[P4/${leg}] claim-update 必须先成功，实得 exit=${claim.exit_code} / ${claim.json?.error?.code ?? '(无码)'}`); continue }
    const generation = claim.json?.generation ?? null
    const attempt = claim.json?.attempt ?? null
    const token = claim.json?.token ?? null
    const freezeFile = writeFixture(`ctl-${tag}-p4`, `${leg}-freeze`, { generation, candidate_ids: ['cand-ctl-p4'] })
    const freeze = runCli('agenia-brain.mjs', { op: 'candidates-freeze', dataRoot: root, inFile: freezeFile, testMode: true }, { env: process.env, cliPath: sut.brain })
    const startFile = writeFixture(`ctl-${tag}-p4`, `${leg}-start`, { generation, attempt, token, job_id: `job-ctl-${tag}-${leg}` })
    const start = runCli('agenia-brain.mjs', { op: 'judge-start', dataRoot: root, inFile: startFile, testMode: true }, { env: process.env, cliPath: sut.brain })
    if (freeze.exit_code !== 0 || start.exit_code !== 0) {
      push('CTL-P4-SETUP', `[P4/${leg}] 判决前置必须成功：freeze exit=${freeze.exit_code} / start exit=${start.exit_code}（${freeze.json?.error?.code ?? '-'} / ${start.json?.error?.code ?? '-'}）`)
      continue
    }
    const before = snapshotState(root)
    const commitFile = writeFixture(`ctl-${tag}-p4`, `${leg}-commit`, {
      generation,
      attempt,
      token,
      base_snapshot: 'v0',
      entries_patch: [{ kind: 'add', entry: entryOf(body) }],
      accepted: ['cand-ctl-p4'],
      maintenance_decisions: [],
      common_sense_sha256: init.json?.common_sense_sha256 ?? 'a'.repeat(64),
      report: { memory_update: `reports/memory-update/${DAY}.json` },
    })
    const auditBefore = rootFacts(root)
    const commit = runCli('agenia-brain.mjs', { op: 'judge-commit', dataRoot: root, inFile: commitFile, testMode: true }, { env: process.env, cliPath: sut.brain })
    const after = snapshotState(root)
    const audit = writeAudit(auditBefore, rootFacts(root))
    readings.roots[`p4-${leg}`] = root
    readings.write_audit = readings.write_audit ?? {}
    readings.write_audit[`p4-${leg}`] = audit
    readings.cli[`p4-${leg}`] = {
      setup: { init: init.exit_code, claim: claim.exit_code, freeze: freeze.exit_code, start: start.exit_code },
      commit_exit: commit.exit_code,
      code: commit.json?.error?.code ?? null,
      message: String(commit.json?.error?.message ?? commit.stderr ?? '').slice(0, 400),
    }
    readings.snapshots[`p4-${leg}`] = { before, after }
    const accepted = commit.exit_code === 0
    const texts = accepted ? (after.texts[after.current] ?? []) : []
    judgeLeg(ctx, { expectLeg: leg, label: leg, where: PLACE.P4 }, {
      accepted,
      code: accepted ? null : (commit.json?.error?.code ?? null),
      message: accepted ? null : String(commit.json?.error?.message ?? commit.stderr ?? ''),
      wroteCount: accepted ? texts.length : (after.versions.length === before.versions.length ? 0 : after.versions.length),
      wroteTexts: accepted ? texts : undefined,
    })
    if (!accepted) {
      if (JSON.stringify(after.versions) !== JSON.stringify(before.versions)) {
        push('CTL-P4-ZERO-WRITE-VIOLATED', `[P4/${leg}] 拒了却动了快照版本：before=${JSON.stringify(before.versions)} after=${JSON.stringify(after.versions)}`)
      }
      if (after.current !== before.current) push('CTL-P4-ZERO-WRITE-VIOLATED', `[P4/${leg}] 拒了却动了 current 指针：before=${JSON.stringify(before.current)} after=${JSON.stringify(after.current)}`)
      if (after.phase !== 'judging') push('CTL-P4-ZERO-WRITE-VIOLATED', `[P4/${leg}] 拒了却动了 phase：期望仍 "judging"，实得 ${JSON.stringify(after.phase)}`)
      if (!audit.clean) {
        push('CTL-P4-WROTE-BEFORE-REFUSAL', `[P4/${leg}] 拒了，但拒之前已经写过（闸在写之后）：${JSON.stringify(audit)} —— 报告/快照/指针/状态必须都在闸之后才动`)
      }
    }
  }
}

/**
 * 一把尺子量一条路径。返回 `{problems, readings}`；**不抛**（抛了也算红，由调用方落进 problems）。
 * `legs` 是本跑要量的腿（刀架按变体收窄）。
 */
async function measure(pathId, { sut, tag, legs, knifeMode = null, realDamage = null }) {
  const problems = []
  const push = (code, message, detail) => problems.push(problem(code, message, detail))
  const readings = { path: pathId, sut_preset: sut.preset, legs: {}, roots: {}, verdicts: {}, cli: {}, snapshots: {} }
  let codesMod = null
  if (existsSync(sut.errorCodes)) {
    try { codesMod = await importFresh(sut.errorCodes) } catch { codesMod = null }
  }
  const ctx = {
    pathId, sut, tag, legs, push, readings, codes: codesMod,
    realOffenders: realDamage?.offenders ?? [],
    realId: realDamage?.id ?? null,
  }
  if (!sutLegal(sut.preset)) {
    push('CTL-SUT-ILLEGAL', `AGENIA_CTL_SUT_PRESET=${JSON.stringify(sut.preset)} 不是现役也不是运行根下的副本 —— 这一跑"量的是哪棵树"不成立`)
    return { problems, readings }
  }
  const previous = process.env[KNIFE_ENV]
  if (knifeMode !== null) process.env[KNIFE_ENV] = knifeMode
  else delete process.env[KNIFE_ENV]
  try {
    if (pathId === 'P1') await measureP1(ctx)
    else if (pathId === 'P2') await measureP2(ctx)
    else if (pathId === 'P3') await measureP3(ctx)
    else if (pathId === 'P4') await measureP4(ctx)
    else push(`CTL-${pathId}-READ-UNREADABLE`, `不认识的路径 ${JSON.stringify(pathId)}`)
  } finally {
    if (previous === undefined) delete process.env[KNIFE_ENV]
    else process.env[KNIFE_ENV] = previous
  }
  return { problems, readings }
}

// ── 路径用例：CTL-01 … CTL-04（首跑预期红；装好闸后必须绿）──────────────────────
// 🔴 每条必须是**字面** `test('CTL-0x …')`：分母是盘上发现器（`test('<ID> …')`）数出来的，
//    模板串拼出来的标题会"跑了但不进分母"（`preflight` 的 REGISTRY-SHAPE 会当场红）。
function pathCase(caseId, pathId, legs) {
  return async () => {
    await runCase(caseId, async (rec) => {
      const sut = sutFiles(sutPreset())
      rec.readings.sut = { preset: sut.preset, legal: sutLegal(sut.preset), env: process.env[SUT_ENV] ?? null }
      rec.readings.contract = '.team/test/2026-11-08/CONTRACT-batch9.md §1.1/§1.2'
      rec.readings.real_damage = {
        ok: REAL_DAMAGE.ok, id: REAL_DAMAGE.id, source: REAL_DAMAGE.source, why: REAL_DAMAGE.why,
        offenders: REAL_DAMAGE.offenders.slice(0, 12), offender_count: REAL_DAMAGE.offenders.length,
      }
      if (!REAL_DAMAGE.ok) {
        // 数据不在（副本 / 换机器）⇒ 这一腿**判不了**，不许当成"真受损正文也拒了"的绿。
        caseHold(rec, 'CTL-REAL-DAMAGE-NO-DATA', `真受损正文（v15）取不到：${REAL_DAMAGE.why} —— 这一腿挂起；合成四份正文那几腿照常判`)
      }
      rec.readings.sources = Object.fromEntries(['brain', 'tool', 'proposals', 'snapshot', 'memory', 'errorCodes']
        .filter((k) => existsSync(sut[k]))
        .map((k) => [k, { path: sut[k], sha256: sha256File(sut[k]) }]))
      const out = await measure(pathId, { sut, tag: caseId, legs, realDamage: REAL_DAMAGE.ok ? REAL_DAMAGE : null })
      Object.assign(rec.readings, out.readings)
      caseFail(out.problems)
    })
  }
}

test('CTL-01 `proposal_file` 工具：控制字符必拒 · 干净/LF 必收（池子恰好一行、正文逐字）', pathCase('CTL-01', 'P1', ['clean', 'lf', 'damaged', 'cr', 'astral', ...(REAL_DAMAGE.ok ? ['real'] : [])]))
test('CTL-02 `--op proposal-import`：`payload.entry.text` 有控制字符必拒（exit≠0 + 零写入）· 干净/LF 必收', pathCase('CTL-02', 'P2', ['clean', 'lf', 'damaged', 'cr', 'astral', ...(REAL_DAMAGE.ok ? ['real'] : [])]))
test('CTL-03 `--op maintenance-import`：`payload.entry.text` **与** `engine_ops[1].entry.text` 两处各拒一次 · 干净/LF 必收', pathCase('CTL-03', 'P3', ['clean', 'lf', 'damaged-entry', 'damaged-ops1', 'cr', 'astral', ...(REAL_DAMAGE.ok ? ['real'] : [])]))
test('CTL-04 `--op judge-commit`：`entries_patch[0].entry.text` 有控制字符必拒（版本集合/current/phase 不动）· 干净/LF 必进快照', pathCase('CTL-04', 'P4', ['clean', 'lf', 'damaged', 'cr', 'astral', ...(REAL_DAMAGE.ok ? ['real'] : [])]))

// ── 刀架：CTL-05（合成最小实现 + 四把刀；产品零字节）────────────────────────────
/**
 * 合成最小实现 = **测试替身**（`tests/agenia-upgrade/fixtures/ctl-sut/`：一个最小 brain CLI +
 * 一个最小 `proposal_file` + 一张只有一条码的 `CODES`）。**不是产品副本、不是产品代码。**
 *
 * 为什么不是"拷一份产品 + 打补丁"：刀不能和它守的东西共用一个坟 —— 产品按契约装好闸之后，
 * 副本上的锚点会消失（或闸被装两遍），刀架就会以"尺子坏了"的样子红，而红的不是判据。
 * **真实四条入库路径由 `CTL-01`…`CTL-04` 量**；这一格只证明判据本身"该绿时绿、该红时红、
 * 每把刀只翻它那一面"。
 */
const FIXTURE_SUT = path.join(HERE, '..', 'fixtures', 'ctl-sut')
const FIXTURE_FILES = ['bin/agenia-brain.mjs', 'tools/proposal-file.mjs', 'lib/error-codes.mjs', 'lib/gate.mjs']

/**
 * 把替身拷到运行根（每一跑一个新目录；**从不删除**任何东西 —— 删除要 marker + 落点校验，
 * 这里不需要冒那个险）。返回 `{ok, sut, source, files, problems}`。
 */
function buildSynthetic(tag) {
  const problems = []
  const push = (code, message, detail) => problems.push(problem(code, message, detail))
  const dest = path.join(runRoot(), 'ctl-knife', `${tag}-sut-${process.pid}-${Date.now().toString(36)}`)
  const missing = FIXTURE_FILES.filter((rel) => !existsSync(path.join(FIXTURE_SUT, rel)))
  if (missing.length > 0) {
    push('CTL-CONTROL-UNAVAILABLE', `替身不完整（缺 ${missing.join(' / ')}）：${FIXTURE_SUT}`)
    return { ok: false, sut: sutFiles(dest), source: FIXTURE_SUT, files: FIXTURE_FILES, problems }
  }
  try {
    if (existsSync(dest)) {
      push('CTL-CONTROL-UNAVAILABLE', `替身落点已经存在（拒绝覆盖）：${dest}`)
      return { ok: false, sut: sutFiles(dest), source: FIXTURE_SUT, files: FIXTURE_FILES, problems }
    }
    cpSync(FIXTURE_SUT, dest, { recursive: true })
  } catch (error) {
    push('CTL-CONTROL-UNAVAILABLE', `替身拷不出来（${FIXTURE_SUT} → ${dest}）：${String(error?.message ?? error)}`)
    return { ok: false, sut: sutFiles(dest), source: FIXTURE_SUT, files: FIXTURE_FILES, problems }
  }
  return { ok: problems.length === 0, sut: sutFiles(dest), source: FIXTURE_SUT, files: FIXTURE_FILES, problems }
}

/**
 * **真源码刀**（组长 2026-11-08 点名）：把**已提交的产品**拷到运行根，再把
 * `lib/memory.mjs::controlCharVerdict` 的 `if (cp < 32) {` 改成 `if (false) {`。
 * 锚点须**恰好 1 处**（不是 ⇒ `CTL-REAL-KNIFE-ANCHOR`，附计数）；副本建不起来 ⇒ `CTL-REAL-KNIFE-UNAVAILABLE`。
 * 返回 `{ok, sut, file, anchor_count, code, message}`；**只写运行根**。
 */
function buildRealKnife(tag) {
  const base = path.join(runRoot(), 'ctl-real-knife', `${tag}-${process.pid}-${Date.now().toString(36)}`)
  const destControl = path.join(base, 'control')
  const destMutant = path.join(base, 'mutant')
  const copy = (dest) => {
    if (existsSync(dest)) throw new Error(`落点已存在（拒绝覆盖）：${dest}`)
    cpSync(LIVE_PRESET, dest, {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(LIVE_PRESET, src)
        if (rel === '') return true
        const parts = rel.split(path.sep)
        return !parts.includes('.runtime') && !parts.includes('client-ui-dashboard')
      },
    })
  }
  try {
    copy(destControl)
    copy(destMutant)
  } catch (error) {
    return { ok: false, code: 'CTL-REAL-KNIFE-UNAVAILABLE', message: `副本建不起来（${LIVE_PRESET} → ${base}）：${String(error?.message ?? error)}` }
  }
  const file = path.join(destMutant, 'lib', 'memory.mjs')
  const text = readText(file)
  if (text === null) return { ok: false, code: 'CTL-REAL-KNIFE-UNAVAILABLE', message: `副本里缺 ${file}` }
  const anchor = 'if (cp < 32) {'
  const count = text.split(anchor).length - 1
  if (count !== 1) {
    return { ok: false, code: 'CTL-REAL-KNIFE-ANCHOR', anchor_count: count, file, message: `锚点 ${JSON.stringify(anchor)} 在 ${file} 里出现 ${count} 次（必须恰好 1 次）—— 产品换过写法，这把刀要同批更新（cand-20261106-0140）` }
  }
  writeFileSync(file, text.replace(anchor, 'if (false) {'), 'utf8')
  return { ok: true, sut: sutFiles(destMutant), controlSut: sutFiles(destControl), file, anchor_count: count, code: null, message: '' }
}

/** 刀架期望的翻面集（case 内 problem code 的**精确**集合；多一个少一个都算刀切错了）。 */
const KNIFE_VECTORS = [
  { mode: 'only_tool', p3Legs: ['damaged-entry', 'damaged-ops1'], legs: ['damaged'], expect: { P2: ['CTL-P2-DAMAGED-ACCEPTED'], P3: ['CTL-P3-DAMAGED-ACCEPTED'], P4: ['CTL-P4-DAMAGED-ACCEPTED'] } },
  { mode: 'ban_lf', legs: ['lf'], expect: { P1: ['CTL-P1-LF-REJECTED'], P2: ['CTL-P2-LF-REJECTED'], P3: ['CTL-P3-LF-REJECTED'], P4: ['CTL-P4-LF-REJECTED'] } },
  { mode: 'allow_cr', legs: ['cr'], expect: { P1: ['CTL-P1-CR-ACCEPTED'], P2: ['CTL-P2-CR-ACCEPTED'], P3: ['CTL-P3-CR-ACCEPTED'], P4: ['CTL-P4-CR-ACCEPTED'] } },
  { mode: 'first_only', legs: ['damaged-ops1'], expect: { P3: ['CTL-P3-DAMAGED-ACCEPTED'] } },
]

test('CTL-05 刀架：合成最小实现四条路全绿 + 四把刀各只翻自己那一面 + 一把切真源码（副本里跑，产品零字节）', async () => {
  await runCase('CTL-05', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const liveSut = sutFiles(LIVE_PRESET)
    const liveKeys = ['brain', 'tool', 'proposals', 'snapshot', 'memory', 'errorCodes']
    const liveBefore = Object.fromEntries(liveKeys.map((k) => [path.relative(REPO, liveSut[k]), sha256File(liveSut[k])]))
    rec.readings.live_before = liveBefore
    rec.readings.contract = '.team/test/2026-11-08/CONTRACT-batch9.md §1.4'

    // ① 真产品：四条路的 damaged 腿必须**拒**（闸已落 ⇒ 这一节应为空；若红 = 产品那条路没闸/闸位错）。
    const real = {}
    for (const pathId of ['P1', 'P2', 'P3', 'P4']) {
      const legs = pathId === 'P3' ? ['damaged-entry'] : ['damaged']
      const out = await measure(pathId, { sut: liveSut, tag: 'CTL-05-real', legs })
      real[pathId] = { codes: out.problems.map((p) => p.code) }
    }
    rec.readings.real_product = real

    // ② 合成最小实现（测试替身）：照契约装好闸 ⇒ 四条路全绿。
    const syn = buildSynthetic('syn')
    rec.readings.synthetic = { ok: syn.ok, sut: syn.sut.preset, source: syn.source, files: syn.files }
    if (!syn.ok) {
      for (const p of syn.problems) problems.push(p)
      caseFail(problems)
    }
    const syntheticOk = {}
    for (const pathId of ['P1', 'P2', 'P3', 'P4']) {
      const legs = pathId === 'P3' ? ['clean', 'lf', 'damaged-entry', 'damaged-ops1', 'cr'] : ['clean', 'lf', 'damaged', 'cr']
      const out = await measure(pathId, { sut: syn.sut, tag: 'CTL-05-syn', legs, knifeMode: 'ok' })
      syntheticOk[pathId] = { codes: out.problems.map((p) => p.code) }
      if (out.problems.length > 0) {
        push('CTL-CONTROL-NOT-GREEN', `[合成最小实现/${pathId}] 照契约写的最小实现必须让这条路径全绿，实得 ${out.problems.length} 条：${out.problems.map((p) => `[${p.code}] ${p.message}`).join(' | ')}`)
      }
    }
    rec.readings.synthetic_ok = syntheticOk

    // ③ 四把刀：各只翻自己那一面。
    for (const knife of KNIFE_VECTORS) {
      const got = {}
      for (const pathId of Object.keys(knife.expect)) {
        const legs = pathId === 'P3' ? knife.p3Legs ?? knife.legs : knife.legs
        const out = await measure(pathId, { sut: syn.sut, tag: `CTL-05-${knife.mode}`, legs, knifeMode: knife.mode })
        got[pathId] = [...new Set(out.problems.map((p) => p.code))].sort()
        if (out.problems.some((p) => /^CTL-.*-(CODE-UNREGISTERED|READING-MISSING|READ-UNREADABLE|SETUP|TEXT-MUTATED)$/.test(p.code))) {
          push('CTL-KNIFE-VECTOR', `[刀 ${knife.mode}/${pathId}] 刀架上出现了"尺子/夹具坏了"的码：${JSON.stringify(got[pathId])}`)
        }
      }
      rec.readings[`knife_${knife.mode}`] = got
      for (const pathId of Object.keys(knife.expect)) {
        const want = [...knife.expect[pathId]].sort()
        const have = got[pathId] ?? []
        const missing = want.filter((c) => !have.includes(c))
        const extra = have.filter((c) => !want.includes(c))
        if (missing.length > 0) push('CTL-KNIFE-NOT-BITING', `[刀 ${knife.mode}/${pathId}] 该翻的没翻：缺 ${JSON.stringify(missing)}（实得 ${JSON.stringify(have)}）`)
        if (extra.length > 0) push('CTL-KNIFE-OVERREACH', `[刀 ${knife.mode}/${pathId}] 翻了不该翻的：多 ${JSON.stringify(extra)}（实得 ${JSON.stringify(have)}，期望 ${JSON.stringify(want)}）`)
      }
    }
    // `only_tool` 那一把还要求 P1 **仍然绿**（翻面集里没有 P1 = 它没翻；这里显式再量一次并记读数）。
    const onlyToolP1 = await measure('P1', { sut: syn.sut, tag: 'CTL-05-only_tool-p1', legs: ['damaged'], knifeMode: 'only_tool' })
    rec.readings.knife_only_tool_p1 = { codes: onlyToolP1.problems.map((p) => p.code) }
    if (onlyToolP1.problems.length > 0) {
      push('CTL-KNIFE-OVERREACH', `[刀 only_tool/P1] 这一把只该关掉 P2/P3/P4 的闸，P1 必须仍绿；实得 ${onlyToolP1.problems.map((p) => p.code).join(',')}`)
    }

    // ③b **真源码刀**（组长 2026-11-08 点名：闸落了之后刀架要有一把切**产品源码**）：
    //    在运行根里拷一份**已提交的产品**（不含 `.runtime`），先把 `controlCharVerdict` 的
    //    `if (cp < 32) {` 改成 `if (false) {`（锚点须恰好 1 处）⇒ 四条路必须**各自**翻四码
    //    （damaged / CR / astral / v15 真受损）；未变的同一份副本先跑一遍必须全绿（对照：红是刀造出来的）。
    const realKnife = buildRealKnife('real')
    rec.readings.real_knife = { ok: realKnife.ok, code: realKnife.code ?? null, sut: realKnife.sut?.preset ?? null, control_sut: realKnife.controlSut?.preset ?? null, anchor_count: realKnife.anchor_count ?? null, file: realKnife.file ?? null }
    if (!realKnife.ok) {
      push(realKnife.code, `[真源码刀] ${realKnife.message}`)
    } else {
      // 对照：**另一份未切的**副本 ⇒ 四条路必须全绿（不然红因里混着"副本坏了"）。
      const control = {}
      for (const pathId of ['P1', 'P2', 'P3', 'P4']) {
        const legs = pathId === 'P3' ? ['clean', 'lf', 'damaged-entry', 'damaged-ops1', 'cr', 'astral'] : ['clean', 'lf', 'damaged', 'cr', 'astral']
        const out = await measure(pathId, { sut: realKnife.controlSut, tag: 'CTL-05-real-knife-control', legs })
        control[pathId] = out.problems.map((p) => p.code)
        if (out.problems.length > 0) {
          push('CTL-REAL-KNIFE-CONTROL', `[真源码刀/对照/${pathId}] 未切的同一份副本必须全绿，实得 ${JSON.stringify(control[pathId])}`)
        }
      }
      rec.readings.real_knife_control = control
      // 切完那一刀 ⇒ 四条路各翻四码（真受损正文有数据时才有第四码）。
      const mutant = {}
      for (const pathId of ['P1', 'P2', 'P3', 'P4']) {
        const legs = pathId === 'P3'
          ? ['damaged-entry', 'damaged-ops1', 'cr', 'astral', ...(REAL_DAMAGE.ok ? ['real'] : [])]
          : ['damaged', 'cr', 'astral', ...(REAL_DAMAGE.ok ? ['real'] : [])]
        const out = await measure(pathId, { sut: realKnife.sut, tag: 'CTL-05-real-knife-mutant', legs })
        mutant[pathId] = [...new Set(out.problems.map((p) => p.code))].sort()
        const want = [
          `CTL-${pathId}-DAMAGED-ACCEPTED`,
          `CTL-${pathId}-CR-ACCEPTED`,
          `CTL-${pathId}-ASTRAL-INDEX-ACCEPTED`,
          ...(REAL_DAMAGE.ok ? [`CTL-${pathId}-REAL-DAMAGED-ACCEPTED`] : []),
        ].sort()
        const missing = want.filter((c) => !mutant[pathId].includes(c))
        const extra = mutant[pathId].filter((c) => !want.includes(c))
        if (missing.length > 0) push('CTL-REAL-KNIFE-NOT-BITING', `[真源码刀/${pathId}] 该翻的没翻：缺 ${JSON.stringify(missing)}（实得 ${JSON.stringify(mutant[pathId])}）`)
        if (extra.length > 0) push('CTL-REAL-KNIFE-VECTOR', `[真源码刀/${pathId}] 翻了不该翻的：多 ${JSON.stringify(extra)}（期望 ${JSON.stringify(want)}）`)
      }
      rec.readings.real_knife_mutant = mutant
    }

    // ④ 产品零字节：六份源码跑前跑后逐字节相同。
    const liveAfter = Object.fromEntries(liveKeys.map((k) => [path.relative(REPO, liveSut[k]), sha256File(liveSut[k])]))
    rec.readings.live_after = liveAfter
    if (JSON.stringify(liveBefore) !== JSON.stringify(liveAfter)) {
      push('CTL-LIVE-TOUCHED', `刀架改了产品树：before=${JSON.stringify(liveBefore)} after=${JSON.stringify(liveAfter)}`)
    }
    caseFail(problems)
  })
})
