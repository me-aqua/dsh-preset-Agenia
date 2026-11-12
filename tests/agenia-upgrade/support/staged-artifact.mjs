/**
 * 量具：**出厂件（staged preset）那一侧**的两件事 —— 内联产物 + 受控差异声明。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-史山清查-B1.md` §0.5（裁决 0006 改定段）。
 * 决定：`决议/构案/0006-原子写归一.md` §决定（改定 23:1x · 第三方案）· RC-4。
 *
 * 裁决把 `rollback.mjs` 拆成两个对象，本文件只判**出厂件那一个**：
 *   · **repo 里的** `presets/agenia/bin/rollback.mjs` —— 正常 `import` 共享件（去重；
 *     由 `ATM-01` 的调用点腿 + 定义腿判）；
 *   · **出厂件（staged）** `<staging>/preset/bin/rollback.mjs` —— `publish-staged` 把
 *     `writeFileAtomic` **内联**进去，保持单文件零静态 import（Q6 的原始意图：用户跑的那一份）。
 *     两棵树因此**必然不同** ⇒ 由 `<staging>/target-lag.json` 声明成**受控差异**，
 *     `STAT-01` 判「差异已声明」而不是「分叉」。
 *
 * 三条口径（写在明处）：
 *   ① **"内联了没有"看的是并集正文的指纹**，不是字节偏移、也不是"文件变大"：
 *      `fsyncSync`（共享件独有）· `RETRYABLE_RENAME`（共享件的码集名字）· `wx`（独占建临时件）。
 *      今天那份 CLI 副本**一个都没有** ⇒ 内联前这一格红得对。
 *   ② **声明不在这里重新发明一套校验**：形状 / 字段 / 数字复现 / marker 漏报全部交给
 *      `target.mjs::targetVerdict`（入口 `F57-TARGET` 用的是同一份）。这里只补两条
 *      **原子写这一族特有**的语义：声明点名的是 `bin/rollback.mjs`、理由说的是"内联"。
 *   ③ `staticImportLines` 与 `INS-02 ①` 逐字同口径（`^\s*import\s` 或 `require(`；注释行不算）——
 *      它是**一份**规则，`INS-02` / `ENV-02` / 本文件 / 刀都读它。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from './env.mjs'
import { actualOf, measureOne, targetReport } from './target.mjs'

/** 出厂件里那份回滚脚本（相对 staged preset 根）。 */
export const SHIPPED_ROLLBACK_REL = 'bin/rollback.mjs'
/** 声明文件盯的那一份（与 `SHIPPED_ROLLBACK_REL` 同值是刻意的：声明写的就是出厂件的这一份）。 */
export const SHIPPED_ROLLBACK_FILE = 'bin/rollback.mjs'

/**
 * 并集正文的指纹（三个都来自**共享件**那一份；今天的 CLI 副本一个都没有）。
 * ⚠️ 选词的标准是"**语义**且**稳定**"：不选行号、不选字节数、不选格式相关的整行。
 */
export const INLINE_ANCHORS = ['fsyncSync', 'RETRYABLE_RENAME', 'wx']

/** 声明里那些"必须写满"的散文字段（与 `target.mjs::DECLARATION_TEXT_FIELDS` 同一份口径）。 */
export const DECLARATION_TEXT_FIELDS = ['reason', 'approved_by', 'approved_on', 'closes_when']

/**
 * 静态 import / require 的**行**（`INS-02 ①` 的同一口径；注释行不算）。
 * @param {string} text
 * @returns {Array<{line:number, text:string, kind:'import'|'require'}>}
 */
export function staticImportLines(text) {
  const out = []
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    if (/^\s*import\s/.test(line)) out.push({ line: i + 1, text: line.trim().slice(0, 160), kind: 'import' })
    else if (/require\s*\(/.test(line)) out.push({ line: i + 1, text: line.trim().slice(0, 160), kind: 'require' })
  })
  return out
}

/** 一个文件的字节 + sha256 + 正文（读不动如实回报，不抛）。 */
function readArtifact(file) {
  const out = { file, exists: false, bytes: null, sha256: null, text: '', read_error: null }
  if (!existsSync(file)) return out
  try {
    const buf = readFileSync(file)
    out.exists = true
    out.bytes = buf.length
    out.sha256 = measureOne(path.dirname(file), path.basename(file)).sha256
    out.text = buf.toString('utf8')
  } catch (err) {
    out.exists = true
    out.read_error = { code: err?.code ?? 'E_READ', message: String(err?.message ?? err) }
  }
  return out
}

/**
 * 读出**出厂件**里那份回滚脚本：静态 import 行 · 并集正文指纹 · 与 repo 那份是不是同一份字节。
 *
 * @param {{presetRoot: string, repoRollback?: string|null}} input
 *        `repoRollback` 只作读数（"出厂件与 repo 是不是同一份字节"）——判词不看它。
 */
export function artifactReading({ presetRoot, repoRollback = null }) {
  const file = path.join(presetRoot, ...SHIPPED_ROLLBACK_REL.split('/'))
  const reading = {
    preset_root: path.resolve(presetRoot),
    file,
    exists: false,
    bytes: null,
    sha256: null,
    read_error: null,
    static_import_lines: [],
    inline_anchors: {},
    missing_inline_anchors: [...INLINE_ANCHORS],
    own_atomic_definitions: 0,
    repo_rollback: repoRollback === null ? null : path.resolve(repoRollback),
    identical_to_repo: null,
    line: '',
  }
  const art = readArtifact(file)
  reading.exists = art.exists
  reading.bytes = art.bytes
  reading.sha256 = art.sha256
  reading.read_error = art.read_error
  if (!art.exists) {
    reading.line = `出厂件 ${SHIPPED_ROLLBACK_REL} 不在：${file}`
    return reading
  }
  if (art.read_error !== null) {
    reading.line = `出厂件 ${SHIPPED_ROLLBACK_REL} 读不动：${art.read_error.code} —— ${file}`
    return reading
  }
  reading.static_import_lines = staticImportLines(art.text)
  for (const anchor of INLINE_ANCHORS) {
    const count = art.text.split(anchor).length - 1
    reading.inline_anchors[anchor] = count
    if (count > 0) reading.missing_inline_anchors = reading.missing_inline_anchors.filter((a) => a !== anchor)
  }
  reading.own_atomic_definitions = (art.text.match(/\bfunction\s+writeFileAtomic\s*\(/g) ?? []).length
  if (repoRollback !== null) {
    const repo = readArtifact(path.resolve(repoRollback))
    reading.identical_to_repo = repo.exists && repo.sha256 !== null && repo.sha256 === art.sha256
  }
  reading.line = `出厂件 ${SHIPPED_ROLLBACK_REL}：${art.bytes} B · 静态 import/require ${reading.static_import_lines.length} 行`
    + ` · 并集指纹 ${INLINE_ANCHORS.map((a) => `${a}×${reading.inline_anchors[a]}`).join(' ')}`
    + ` · 内联正文定义 ${reading.own_atomic_definitions} 处`
    + (reading.identical_to_repo === null ? '' : ` · 与 repo 那份${reading.identical_to_repo ? '逐字节相同（= 没内联）' : '不同（= 内联过）'}`)
  return reading
}

/**
 * 出厂件判词：**单文件零静态 import** + **并集正文在内**。
 * @returns {{verdict:'GREEN'|'RED', problems:Array<{code:string,message:string,detail?:object}>}}
 */
export function artifactVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  if (!reading.exists) {
    push('SHIP-ROLLBACK-MISSING', `出厂件里没有 ${SHIPPED_ROLLBACK_REL}：${reading.file} —— 用户拿不到回滚脚本`)
    return { verdict: 'RED', problems }
  }
  if (reading.read_error !== null) {
    push('SHIP-ROLLBACK-READ', `出厂件 ${SHIPPED_ROLLBACK_REL} 读不动（${reading.read_error.code}）：${reading.file}`)
    return { verdict: 'RED', problems }
  }
  if (reading.static_import_lines.length > 0) {
    push('SHIP-ROLLBACK-STATIC-IMPORT',
      `出厂件 ${SHIPPED_ROLLBACK_REL} 有 ${reading.static_import_lines.length} 行静态 import/require（Q6：单文件可直接跑）`
      + `：${reading.static_import_lines.map((x) => `:${x.line} ${x.text}`).join(' · ')}`)
  }
  if (reading.missing_inline_anchors.length > 0) {
    push('SHIP-ROLLBACK-NO-INLINE',
      `出厂件 ${SHIPPED_ROLLBACK_REL} 缺并集正文的指纹 ${reading.missing_inline_anchors.join(' / ')}`
      + `（内联没发生，或内联的不是共享件那一份）—— 实得 ${JSON.stringify(reading.inline_anchors)}`)
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

/**
 * 读受控差异声明（缺文件 / 坏 JSON 如实回报）。
 * @param {{path?:string, file?:string}} [input]
 */
export function declarationReading({ path: declPath = PATHS.targetLagDeclaration, file = SHIPPED_ROLLBACK_FILE } = {}) {
  const abs = path.resolve(declPath)
  const reading = {
    path: abs,
    file,
    present: false,
    parse_error: null,
    schema: null,
    entries: null,
    entry: null,
    text_fields: {},
    reason_mentions_transform: null,
    line: '',
  }
  if (!existsSync(abs)) {
    reading.line = `受控差异声明不在：${abs}`
    return reading
  }
  reading.present = true
  let doc = null
  try {
    doc = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (err) {
    reading.parse_error = String(err?.message ?? err)
    reading.line = `受控差异声明不是合法 JSON：${abs} —— ${reading.parse_error}`
    return reading
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    reading.parse_error = '不是对象'
    reading.line = `受控差异声明不是对象：${abs}`
    return reading
  }
  reading.schema = doc.schema ?? null
  reading.entries = Array.isArray(doc.entries) ? doc.entries : null
  reading.entry = reading.entries === null
    ? null
    : reading.entries.find((e) => e !== null && typeof e === 'object' && e.file === file) ?? null
  if (reading.entry !== null) {
    for (const f of DECLARATION_TEXT_FIELDS) reading.text_fields[f] = reading.entry[f] ?? null
    const reason = typeof reading.entry.reason === 'string' ? reading.entry.reason : ''
    reading.reason_mentions_transform = /writeFileAtomic/.test(reason) && /(内联|inline|embed|捆绑|并进)/i.test(reason)
  }
  reading.line = `受控差异声明 ${abs}：${reading.entries === null ? '缺 entries' : `${reading.entries.length} 条`}`
    + ` · 点名 ${file}：${reading.entry === null ? '**没有**' : '有'}`
    + (reading.entry === null ? '' : ` · 理由提内联：${reading.reason_mentions_transform ? '是' : '**不是**'}`)
  return reading
}

/**
 * 声明判词（只判**原子写这一族特有**的两条；形状 / 字段 / 数字复现交给 `targetVerdict`）。
 */
export function declarationVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  if (!reading.present) {
    push('SHIP-DECL-MISSING', `受控差异声明不在：${reading.path} —— 出厂件与 repo 必然不同（内联），没有声明就是"分叉"`)
    return { verdict: 'RED', problems }
  }
  if (reading.parse_error !== null || reading.entries === null) {
    push('SHIP-DECL-SHAPE', `受控差异声明读不懂：${reading.path} —— ${reading.parse_error ?? '缺 entries 数组'}`)
    return { verdict: 'RED', problems }
  }
  if (reading.entry === null) {
    push('SHIP-DECL-NO-ENTRY', `受控差异声明没有点名 ${SHIPPED_ROLLBACK_FILE}（现有：${reading.entries.map((e) => e?.file ?? '?').join(' / ') || '（空）'}）`)
    return { verdict: 'RED', problems }
  }
  if (reading.reason_mentions_transform !== true) {
    push('SHIP-DECL-REASON',
      `声明的理由没说清这处差异是什么：要同时提到 \`writeFileAtomic\` 与"内联"（实得 ${JSON.stringify(reading.text_fields.reason)}）`
      + ' —— 声明不是免责条款，它得让下一个人知道这是**发布时的内联**，不是分叉')
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

/**
 * **一对树 + 一份声明**的判定（`STAT-01` 与刀共用同一份规则）。
 *
 * 返回 `targetReport()` 的全部读数 + 两条人读的结论：
 *   · `equal`  —— 两棵树逐字节相同（不需要声明）；
 *   · `declared` —— 不同，但每一处差异都被声明**准确**覆盖（`state === 'declared'`）；
 *   · 其余 —— 未声明 / 声明不符 / 读不动 / 零样本 / 缩水（`problems` 逐条带 `TARGET-*` 码）。
 */
export function declaredDifference({ stagedRoot, baselineRoot, declarationPath = PATHS.targetLagDeclaration } = {}) {
  const report = targetReport({ stagedRoot, baselineRoot, declarationPath })
  return {
    ...report,
    equal: report.state === 'equal',
    declared: report.state === 'declared',
    line: report.line,
    problems: report.problems,
  }
}
