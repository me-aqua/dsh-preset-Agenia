/**
 * 量具：**出厂件（staged preset）那一侧**的三件事 —— 内联产物 · 受控差异声明 · 声明算术。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-史山清查-B1.md` §0.5（裁决 0006 改定段）·
 * `.team/test/2026-11-13/CONTRACT-史山清查-B3.md` §2（两块内联 + 单条声明复现）。
 * 决定：`决议/构案/0006-原子写归一.md` §决定（改定 23:1x · 第三方案）· RC-4 ·
 * `决议/构案/0008-install-rollback-公共-helper.md` §决定 ②（两块内联）。
 *
 * 裁决把 `rollback.mjs` 拆成两个对象，本文件只判**出厂件那一个**：
 *   · **repo 里的** `presets/agenia/bin/rollback.mjs` —— 正常 `import` 共享件（去重；
 *     由 `ATM-01` 的调用点腿 + 定义腿判）；
 *   · **出厂件（staged）** `<staging>/preset/bin/rollback.mjs` —— `publish-staged` 把
 *     `writeFileAtomic` **内联**进去，保持单文件零静态 import（Q6 的原始意图：用户跑的那一份）。
 *     两棵树因此**必然不同** ⇒ 由 `<staging>/target-lag.json` 声明成**受控差异**，
 *     `STAT-01` 判「差异已声明」而不是「分叉」。
 *
 * 🔴 **2026-11-13（构案 0008 · B3）起，出厂件里内联的是"共享正文"那几块**：`原子写并集正文`（B1）+
 *     `公共 helper 正文`（8 个 install/rollback 共用 helper）。块的字面量与指纹都在
 *     `injector-inline.mjs::INLINE_BLOCKS` 里（**一份**来源），本文件只判"出厂件里那几段
 *     与 `lib/` 里那几段是同一段正文"。
 *
 * 三条口径（写在明处）：
 *   ① **"内联了没有"看的是正文同源**（`normalizeBlock` 之后逐字相等），不是字节偏移、
 *      也不是"文件变大"：出厂件的包装段里**只许放逐字正文**（内建绑定那几行放在起点标记之前），
 *      这样"同一段正文"才是一条能翻面的判据。指纹另作一条辅助读数（每条两边同值且 > 0）。
 *   ② **声明不在这里重新发明一套校验**：形状 / 字段 / 数字复现 / marker 漏报全部交给
 *      `target.mjs::targetVerdict`（入口 `F57-TARGET` 用的是同一份）。这里只补三条
 *      **这一族特有**的语义：声明点名的是 `bin/rollback.mjs`、理由说的是"内联"、**只此一条**。
 *   ③ `staticImportLines` 与 `INS-02 ①` 逐字同口径（`^\s*import\s` 或 `require(`；注释行不算）——
 *      它是**一份**规则，`INS-02` / `ENV-02` / 本文件 / 刀都读它。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from './env.mjs'
import { actualOf, measureOne, targetReport, targetVerdict } from './target.mjs'
import {
  INLINE_BLOCKS,
  beginOf,
  blockDigest,
  fingerprintCountsOf,
  markedSpans,
  normalizeBlock,
  shippedBlockOf,
} from './injector-inline.mjs'

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

// ── 出厂件的**文件头**（评审 M-2）与**重试预算**（评审 M-1）────────────────────────────
/**
 * 出厂件文件头里那段**逐字要求**（评审 M-2 · 契约 §1 腿 8；构案 0008 起是**两块**内联）。
 *
 * 🔴 这是判据侧的**冻结期望**，不是从发布器 `install.mjs::shippedHeaderLines()` 读出来的副本 ——
 *    刻意写成第二处：发布器改了这段话，这里就红，**由人**决定"改判据还是改发布器"。
 *    （若从发布器读，两边一起改就永远绿 —— 那正是"自证"的病。）
 * 判据只认**块注释里逐行相等**（` * ` 前缀原样），不认行号：行号会漂。
 *
 * ⚠️ 这段里**不许出现 `import` 这个词**（`shippedHeaderVerdict` 那一条）：出厂件零静态引用，
 *    头里说"引用了什么"就是假话。要说共享件，就说"源 / 内联 / 受控差异"。
 */
export const SHIPPED_HEADER_PARAGRAPH = Object.freeze([
  ' * 🔴 **单文件自足、零静态引用**（拍板 Q6）：回滚的适用场合正是"刚装上去的那一版是坏的" ——',
  ' *    所以本文件**不依赖任何新装上去的东西**（新 `lib/`、新 `bin/`、新模块）。',
  ' *    ⚠️ **本文件是出厂件（用户跑的那一份）**：文件名与 repo 里的 `presets/agenia/bin/rollback.mjs`',
  ' *    相同，但正文不同 —— **两段**正文都是发布时**逐字内联**进来的（发布者：`presets/agenia/bin/install.mjs`',
  ' *    的 `--op publish-staged`）：① 原子写并集正文（fsync · `wx` 独占临时件 · 重试码 · `allowedRoot` 删除闸 ·',
  ' *    统一信封），源 `presets/agenia/lib/atomic.mjs` 里 `@inline-begin 原子写并集正文` 那一段；',
  ' *    ② 公共 helper 正文（路径判据 · 删除三闸 · 安装现场 · 备份根 · 输出信封 —— 与 `install.mjs` 共用的',
  ' *    那 8 个），源 `presets/agenia/lib/cli-guards.mjs` 里 `@inline-begin 公共 helper 正文` 那一段。',
  ' *    内建模块**运行时**取得 —— 那不是对已装代码的依赖。',
  ' *    重试上限 **6 次**（`CLI_WRITE_MAX_ATTEMPTS`，随原子写正文一起进来）—— 与 repo 那一份同一个数。',
  ' *    两棵树的这处差是**受控差异**，由 `<staging>/target-lag.json` 声明（点名 `bin/rollback.mjs`）。',
  ' *    ⇒ 要改回滚脚本：改 repo 那一份，再 `--op publish-staged` 重发；**别直接改本文件**。',
])

/** repo 那一份的自述（评审 M-2）：出厂件里**不许**出现这一句 —— 它是假话（出厂件零静态引用）。 */
export const REPO_SELF_DESCRIPTION = '本文件是 repo 那一份'

/** 取一份正文里**头一个块注释**（`/**` 到配对的 `*​/`）；没有 ⇒ `null`。断言只对这一段。 */
export function leadingHeaderComment(text) {
  const src = String(text)
  const start = src.indexOf('/**')
  if (start < 0) return null
  const end = src.indexOf('*/', start + 3)
  if (end < 0) return null
  return src.slice(start, end + 2)
}

/**
 * 出厂件**文件头**的读数（评审 M-2 的四条）：头里有没有 `import` 这个词 · 发布器那段逐字在不在 ·
 * repo 自述在不在 · 并集指纹在不在。
 *
 * 口径边界（写在明处）：
 *   · `import` 这个词只判**头**（块注释）：正文里 `await import('node:fs')`（Q6 允许的运行时取内建）
 *     和注释里提到这个词都是合法的 ⇒ 拿整份文件查那个词会把合法写法判红。整份文件的
 *     **静态 import 行数**由 `staticImportLines()` 单独判（`ship_artifact` 那条腿已经在判）。
 *   · "逐字"= 块注释里**按顺序逐行相等**（` * ` 前缀原样）；差一行 ⇒ 点名第一处缺的行。
 *   · `repoSource` 只用来证明"这句自述**确实**是 repo 那一份的"（刀要它）；判词不依赖它。
 *
 * @param {{artifactSource:string, repoSource?:string|null}} input
 */
export function shippedHeaderReading({ artifactSource, repoSource = null }) {
  const text = String(artifactSource)
  const header = leadingHeaderComment(text)
  const headerLines = header === null ? [] : header.split(/\r?\n/)
  const reading = {
    header_found: header !== null,
    header_lines: headerLines.length,
    header_first_line: headerLines[0] ?? null,
    import_word_in_header: (header === null ? 0 : (header.match(/import/g) ?? []).length),
    import_word_in_file: (text.match(/import/g) ?? []).length,
    static_import_lines: staticImportLines(text).length,
    paragraph: { present: false, missing_lines: [], first_missing: null, matched_lines: 0 },
    repo_self_description: { present: text.includes(REPO_SELF_DESCRIPTION), source_has_it: repoSource === null ? null : String(repoSource).includes(REPO_SELF_DESCRIPTION) },
    fingerprints: {},
    missing_fingerprints: [...INLINE_ANCHORS],
    line: '',
  }
  if (header === null) {
    reading.line = '出厂件没有文件头（读不出块注释）—— 这一格判不了，不许当绿'
    return reading
  }
  // 逐字段落（按顺序逐行找；缺哪一行点名哪一行）
  let cursor = 0
  for (const want of SHIPPED_HEADER_PARAGRAPH) {
    let found = -1
    for (let i = cursor; i < headerLines.length; i += 1) {
      if (headerLines[i] === want) { found = i; break }
    }
    if (found < 0) reading.paragraph.missing_lines.push(want)
    else { reading.paragraph.matched_lines += 1; cursor = found + 1 }
  }
  reading.paragraph.first_missing = reading.paragraph.missing_lines[0] ?? null
  reading.paragraph.present = reading.paragraph.missing_lines.length === 0
  for (const anchor of INLINE_ANCHORS) {
    const count = text.split(anchor).length - 1
    reading.fingerprints[anchor] = count
    if (count > 0) reading.missing_fingerprints = reading.missing_fingerprints.filter((a) => a !== anchor)
  }
  reading.line = `出厂件文件头：${reading.header_lines} 行 · 头里 \`import\` ${reading.import_word_in_header} 次 · `
    + `发布器段落 ${reading.paragraph.matched_lines}/${SHIPPED_HEADER_PARAGRAPH.length} 行`
    + `${reading.paragraph.present ? '（逐字在）' : `（缺 ${reading.paragraph.missing_lines.length} 行，第一处：${JSON.stringify(reading.paragraph.first_missing)}）`}`
    + ` · repo 自述 ${reading.repo_self_description.present ? '**在**（假话）' : '不在'}`
    + ` · 并集指纹 ${INLINE_ANCHORS.map((a) => `${a}×${reading.fingerprints[a]}`).join(' ')}`
  return reading
}

/** 出厂件文件头的判词（评审 M-2 的四条各一个码）。 */
export function shippedHeaderVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  if (reading.header_found !== true) {
    push('SHIP-HEADER-MISSING', '出厂件读不出文件头（块注释）—— 这一格判不了，不许当绿')
    return { verdict: 'RED', problems }
  }
  if (reading.import_word_in_header > 0) {
    push('SHIP-HEADER-IMPORT-WORD',
      `出厂件**头**里出现了 ${reading.import_word_in_header} 次 \`import\` 这个词 —— 这一份零静态引用，`
      + '头里说"引用了什么"就是假话（正文里的 `await import(\'node:…\')` 不算，那是 Q6 允许的运行时取内建）')
  }
  if (!reading.paragraph.present) {
    push('SHIP-HEADER-PARAGRAPH-MISSING',
      `出厂件头里缺发布器那段**逐字**正文（缺 ${reading.paragraph.missing_lines.length} 行）：`
      + `第一处是 ${JSON.stringify(reading.paragraph.first_missing)} —— 出厂件的头必须描述**出厂件**，`
      + '不能是 repo 那一份的自述')
  }
  if (reading.repo_self_description.present) {
    push('SHIP-HEADER-REPO-SELF-DESC',
      `出厂件头里还留着 repo 那一份的自述「${REPO_SELF_DESCRIPTION}」—— 它是出厂件，零静态引用，`
      + '这句话在这份文件里是假话（下一个人照它"补回一条 import"就会被它背书）')
  }
  if (reading.missing_fingerprints.length > 0) {
    push('SHIP-HEADER-NO-FINGERPRINTS', `出厂件缺并集正文的指纹 ${reading.missing_fingerprints.join(' / ')}（实得 ${JSON.stringify(reading.fingerprints)}）`)
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

/** 重试预算的常量名（与 `lib/atomic.mjs` 里的那一份同名；这是**判据侧**要盯的那个名字）。 */
export const CLI_RETRY_BUDGET_NAME = 'CLI_WRITE_MAX_ATTEMPTS'

/**
 * **重试预算**的读数（评审 M-1）：install / rollback 那一跑最多试几次、这个数有几处、共享件默认几。
 *
 * 三条口径：
 *   · 预算只许有一个**来源**：`lib/atomic.mjs` 里的 `const CLI_WRITE_MAX_ATTEMPTS = N`；
 *     两处重写盘调用点必须**传这个常量**（`maxAttempts: CLI_WRITE_MAX_ATTEMPTS`），
 *     **不许**把数字手抄成 `maxAttempts: 6`（那就有两处"6"，改一处 = 没改）。
 *   · 共享件的**默认**（`writeFileAtomic` 解构里的 `maxAttempts = 5`）只留给其余调用者。
 *   · **出厂件**自己那一份（内联正文里的常量 + 调用点）也必须读 6 —— 它是用户真正跑的那一份。
 *
 * @param {{files: Array<{rel:string, text:string}>}} input  `lib/atomic.mjs` / 两处 CLI / 出厂件
 */
export function retryBudgetReading({ files }) {
  const defRe = new RegExp(`const\\s+${CLI_RETRY_BUDGET_NAME}\\s*=\\s*(\\d+)`)
  const callRe = /writeFileAtomic\s*\(/g
  const reading = {
    name: CLI_RETRY_BUDGET_NAME,
    definitions: [],
    value_places: [],
    call_sites: [],
    literal_max_attempts: [],
    shared_default: { value: null, rel: null, line: null },
    artifact: { present: false, value: null, call_sites_using_constant: 0 },
    line: '',
  }
  const lineOf = (text, idx) => String(text).slice(0, idx).split(/\r?\n/).length
  for (const f of files) {
    const rel = f.rel
    const text = String(f.text)
    const isArtifact = f.is_artifact === true
    // ① 常量定义 —— **只数 repo 那一侧**（`presets/**`）；出厂件那份内联副本在 ④ 单独判，
    //    否则"恰好一处定义"会被自己数成两处（出厂件必然带着一份）。
    const dm = defRe.exec(text)
    if (dm !== null && !isArtifact) {
      reading.definitions.push({ rel, line: lineOf(text, dm.index), value: Number(dm[1]) })
      reading.value_places.push({ rel, line: lineOf(text, dm.index), kind: 'constant', value: Number(dm[1]) })
    }
    // ② 调用点：`writeFileAtomic(` 后面 200 字符内的选项对象
    let m
    const re = new RegExp(callRe.source, 'g')
    while ((m = re.exec(text)) !== null) {
      const tail = text.slice(m.index, m.index + 400)
      const usesConstant = new RegExp(`maxAttempts\\s*:\\s*${CLI_RETRY_BUDGET_NAME}\\b`).test(tail)
      const literal = new RegExp(`maxAttempts\\s*:\\s*(\\d+)`).exec(tail)
      const hasAllowedRoot = /allowedRoot\s*:/.test(tail)
      /**
       * **重写盘**那一处 = 第一个实参是 `*.dst_abs`（逐文件替换循环里的落点）。
       * 为什么不用 `allowedRoot` 认它：`publish-staged` 那几处写也带 `allowedRoot`（写预设树）——
       * 拿它当"重写盘"的键，会把"重写盘没传预算"判成绿（M-1 正是这么丢的）。
       */
      const firstArg = (/^writeFileAtomic\s*\(\s*([^,]+),/.exec(tail) ?? [null, ''])[1].trim()
      const heavy = /\.dst_abs$/.test(firstArg)
      const line = lineOf(text, m.index)
      reading.call_sites.push({ rel, line, first_arg: firstArg, heavy, uses_constant: usesConstant, literal: literal === null ? null : Number(literal[1]), has_allowed_root: hasAllowedRoot })
      if (literal !== null) {
        reading.literal_max_attempts.push({ rel, line: lineOf(text, m.index + tail.indexOf(literal[0])), value: Number(literal[1]) })
        reading.value_places.push({ rel, line: lineOf(text, m.index + tail.indexOf(literal[0])), kind: 'literal', value: Number(literal[1]) })
      }
    }
    // ③ 共享件默认 —— 只从**共享件那一份**读（出厂件里也有同一个默认值，但那是内联副本，不是"其余调用者"的默认）
    if (!isArtifact && /(^|\/)lib\/atomic\.mjs$/.test(rel) && new RegExp(`function\\s+writeFileAtomic`).test(text)) {
      const def = /maxAttempts\s*=\s*(\d+)/.exec(text)
      if (def !== null) reading.shared_default = { value: Number(def[1]), rel, line: lineOf(text, def.index) }
    }
    // ④ 出厂件那一份（由调用方用 `is_artifact: true` 明确标记）
    if (isArtifact) {
      const dm2 = defRe.exec(text)
      reading.artifact = {
        present: dm2 !== null,
        value: dm2 === null ? null : Number(dm2[1]),
        line: dm2 === null ? null : lineOf(text, dm2.index),
        call_sites_using_constant: (text.match(new RegExp(`maxAttempts\\s*:\\s*${CLI_RETRY_BUDGET_NAME}\\b`, 'g')) ?? []).length,
        literal_max_attempts: (text.match(/maxAttempts\s*:\s*\d+/g) ?? []),
      }
    }
  }
  const values = [...new Set(reading.definitions.map((d) => d.value))]
  reading.line = `重试预算 ${CLI_RETRY_BUDGET_NAME}：定义 ${reading.definitions.map((d) => `${d.rel}:${d.line}=${d.value}`).join(' · ') || '（没有）'}`
    + ` · 调用点 ${reading.call_sites.map((c) => `${c.rel}:${c.line}${c.uses_constant ? `=常量` : c.literal === null ? '=没传' : `=字面${c.literal}`}`).join(' · ')}`
    + ` · 手抄字面 ${reading.literal_max_attempts.length} 处`
    + ` · 共享件默认 ${JSON.stringify(reading.shared_default.value)}（${reading.shared_default.rel ?? '?'}:${reading.shared_default.line ?? '?'}）`
    + ` · 出厂件 ${reading.artifact.present ? `${reading.artifact.value}（${reading.artifact.line} 行 · 调用点用常量 ${reading.artifact.call_sites_using_constant} 处）` : '**没有**'}`
  return reading
}

/** 重试预算的判词（评审 M-1 的四条各一个码）。 */
export function retryBudgetVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  // (b) 常量恰好一处、值为 6
  if (reading.definitions.length !== 1) {
    push('ATM-RETRY-BUDGET-CONST', `${CLI_RETRY_BUDGET_NAME} 必须**恰好一处**定义，实得 ${reading.definitions.length} 处：`
      + `${reading.definitions.map((d) => `${d.rel}:${d.line}=${d.value}`).join(' · ') || '（没有）'}`)
  } else if (reading.definitions[0].value !== 6) {
    push('ATM-RETRY-BUDGET-CONST', `${CLI_RETRY_BUDGET_NAME} 必须是 **6**（决定 §背景 那张表 + RC-2 那句"6 次"），`
      + `实得 ${reading.definitions[0].value}（${reading.definitions[0].rel}:${reading.definitions[0].line}）`)
  }
  // (a) 两处重写盘调用点都传这个常量
  for (const rel of ['install.mjs', 'rollback.mjs']) {
    const heavy = reading.call_sites.filter((c) => c.rel.endsWith(rel) && c.heavy === true)
    const using = heavy.filter((c) => c.uses_constant)
    if (heavy.length === 0) {
      push('ATM-RETRY-BUDGET-CALLSITE', `${rel} 里找不到"重写盘"那个调用点（第一个实参是 \`*.dst_abs\` 的那一处）—— 这一条判不了，不许当绿`)
    } else if (using.length !== heavy.length) {
      push('ATM-RETRY-BUDGET-CALLSITE', `${rel} 的重写盘调用点必须传 \`maxAttempts: ${CLI_RETRY_BUDGET_NAME}\`，`
        + `实得 ${heavy.length} 处里只有 ${using.length} 处用常量（${heavy.map((c) => `:${c.line}${c.uses_constant ? '✓' : c.literal === null ? '（没传）' : `（字面 ${c.literal}）`}`).join(' · ')}）`)
    }
  }
  // (a′) 不许手抄数字
  if (reading.literal_max_attempts.length > 0) {
    push('ATM-RETRY-BUDGET-LITERAL', `不许把预算手抄成字面量：`

      + `${reading.literal_max_attempts.map((x) => `${x.rel}:${x.line}=${x.value}`).join(' · ')} —— `
      + `同一个数出现在 ${reading.value_places.filter((p) => p.value === 6).length} 处（常量 + 字面），改一处 = 没改；要传就传 \`${CLI_RETRY_BUDGET_NAME}\``)
  }
  // (c) 共享件默认仍是 5
  if (reading.shared_default.value !== 5) {
    push('ATM-RETRY-BUDGET-DEFAULT', `共享件的默认重试上限必须仍是 **5**（只给其余调用者；6 只属于两条重写盘路径），`
      + `实得 ${JSON.stringify(reading.shared_default.value)}（${reading.shared_default.rel ?? '?'}:${reading.shared_default.line ?? '?'}）`)
  }
  // (d) 出厂件那一份也读 6，且它的调用点用常量
  if (reading.artifact.present !== true) {
    push('SHIP-RETRY-BUDGET-VALUE', `出厂件里没有 \`const ${CLI_RETRY_BUDGET_NAME} = 6\`（内联正文里应该带着它）—— 用户跑的那一份拿不到那个数`)
  } else {
    if (reading.artifact.value !== 6) {
      push('SHIP-RETRY-BUDGET-VALUE', `出厂件里 \`${CLI_RETRY_BUDGET_NAME}\` 读 ${reading.artifact.value}（第 ${reading.artifact.line} 行），必须是 **6** —— 与 repo 那一份同一个数`)
    }
    if (reading.artifact.call_sites_using_constant < 1) {
      push('SHIP-RETRY-BUDGET-VALUE', `出厂件的重写盘调用点没有传 \`${CLI_RETRY_BUDGET_NAME}\`（实得 ${JSON.stringify(reading.artifact.literal_max_attempts)}）—— 那个 6 在出厂件里没被用到`)
    }
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

// ── 腿 7b · 出厂件里的**每块**内联（构案 0008 · 史山清查 B3）────────────────────────
/**
 * 读出**每一块**内联的读数：每块一行，说清"共享件那一块在第几行 / 出厂件那一块在第几行 /
 * 规范化之后是不是同一段 / 每条指纹两边各出现几次"。
 *
 * 判据对象只有**出厂件**（`<staging>/preset/bin/rollback.mjs`）与**共享件**（`INLINE_BLOCKS` 的
 * `sourceRel` 那几份）；repo 那一份 `bin/rollback.mjs` 不在这里判（它 import 共享件，由 `INS-02 ③`
 * 的普查腿与 `cli-harness-shared.mjs` 的骨架腿判）。
 *
 * @param {{presetRoot?: string, repoRoot?: string}} [input]
 */
export function inlineBlocksReading({ presetRoot = PATHS.stagedPreset, repoRoot = PATHS.repo } = {}) {
  const file = path.join(presetRoot, ...SHIPPED_ROLLBACK_REL.split('/'))
  const art = readArtifact(file)
  const reading = {
    preset_root: path.resolve(presetRoot),
    repo_root: path.resolve(repoRoot),
    file,
    exists: art.exists,
    bytes: art.bytes,
    sha256: art.sha256,
    read_error: art.read_error,
    static_import_lines: art.exists && art.read_error === null ? staticImportLines(art.text).length : null,
    blocks: [],
    line: '',
  }
  for (const block of Object.values(INLINE_BLOCKS)) {
    const sourceFile = path.join(repoRoot, ...block.sourceRel.split('/'))
    const src = readArtifact(sourceFile)
    const srcSpan = src.exists && src.read_error === null
      ? markedSpans(src.text, beginOf(block)).find((s) => s.label === block.label) ?? null
      : null
    const shippedSpan = art.exists && art.read_error === null
      ? shippedBlockOf(art.text, block)
      : { found: false, begin_line: null, end_line: null, text: '', reason: `出厂件不在或读不动：${JSON.stringify(art.read_error)}` }
    const row = {
      id: block.id,
      label: block.label,
      source_rel: block.sourceRel,
      source: {
        file: path.resolve(sourceFile),
        exists: src.exists,
        read_error: src.read_error,
        block: srcSpan === null
          ? { found: false, begin_line: null, end_line: null, lines: 0, digest: null, reason: `共享件里没有 \`${beginOf(block)}\` 那一段` }
          : { found: true, begin_line: srcSpan.begin_line, end_line: srcSpan.end_line, lines: srcSpan.text === '' ? 0 : srcSpan.text.split('\n').length, digest: blockDigest(srcSpan.text) },
      },
      shipped: shippedSpan.found
        ? { found: true, begin_line: shippedSpan.begin_line, end_line: shippedSpan.end_line, lines: shippedSpan.text === '' ? 0 : shippedSpan.text.split('\n').length, digest: blockDigest(shippedSpan.text), reason: null }
        : { found: false, begin_line: shippedSpan.begin_line ?? null, end_line: shippedSpan.end_line ?? null, lines: 0, digest: null, reason: shippedSpan.reason ?? null },
      same: null,
      fingerprints: {},
      definitions_in_artifact: {},
      verdict: 'RED',
    }
    if (row.source.block.found && row.shipped.found) {
      row.same = row.source.block.digest === row.shipped.digest
      const srcNorm = normalizeBlock(srcSpan.text)
      const shippedNorm = normalizeBlock(shippedSpan.text)
      row.fingerprints = fingerprintCountsOf(block, srcNorm, shippedNorm)
    } else {
      row.fingerprints = fingerprintCountsOf(block, '', '')
    }
    for (const name of block.definitions) {
      row.definitions_in_artifact[name] = (art.text.match(new RegExp(`\\bfunction\\s+${name}\\s*\\(`, 'g')) ?? []).length
    }
    reading.blocks.push(row)
  }
  reading.line = `出厂件 ${SHIPPED_ROLLBACK_REL}：${art.exists ? `${art.bytes} B · 静态 import/require ${reading.static_import_lines} 行` : '不在'}`
    + ` · ` + reading.blocks.map((b) => {
      const where = (x) => (x.found ? `${x.begin_line}…${x.end_line}（${x.lines} 行 · ${String(x.digest).slice(0, 12)}…）` : `**没有**（${x.reason}）`)
      return `[${b.label}] 共享件 ${where(b.source.block)} 对 出厂件 ${where(b.shipped)}${b.same === null ? '' : b.same ? ' ⇒ 同源' : ' ⇒ **不同源**'}`
    }).join(' · ')
  return reading
}

/**
 * 腿 7b 的判词：**每一块都在** · **每一块都与共享件同源** · 每块指纹两边同值 · 不许留下第二份定义。
 *
 * 码的分工（红的时候读得出"是哪一块、缺还是漂"）：
 *   · `SHIP-INLINE-SOURCE-MISSING` —— 共享件那一块都不在（发布器的源没了，判不了同源）；
 *   · `SHIP-INLINE-MISSING` —— 出厂件里没有那一块的包装段（**哪一块**在报文里点名）；
 *   · `SHIP-INLINE-DRIFT` —— 包装段里那段正文与共享件那一块**不是同一段**；
 *   · `SHIP-INLINE-FINGERPRINT` —— 某条指纹两边次数不同（或为 0）；
 *   · `SHIP-INLINE-DUP` —— 出厂件里同一个 helper 有多份定义（发布时旧副本没删干净）。
 */
export function inlineBlocksVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  if (!reading.exists) {
    push('SHIP-ROLLBACK-MISSING', `出厂件里没有 ${SHIPPED_ROLLBACK_REL}：${reading.file} —— 内联块无从判起`)
    return { verdict: 'RED', problems }
  }
  if (reading.read_error !== null) {
    push('SHIP-ROLLBACK-READ', `出厂件 ${SHIPPED_ROLLBACK_REL} 读不动（${reading.read_error.code}）：${reading.file}`)
    return { verdict: 'RED', problems }
  }
  for (const row of reading.blocks) {
    if (row.source.block.found !== true) {
      push('SHIP-INLINE-SOURCE-MISSING',
        `共享件 ${row.source_rel} 里没有 \`${beginOf({ label: row.label })}\` … \`@inline-end ${row.label}\` 这一段`
        + `（${row.source.block.reason ?? '找不到'}）—— 出厂件里那块正文没有来源，同源与否判不了`)
    }
    if (row.shipped.found !== true) {
      push('SHIP-INLINE-MISSING',
        `出厂件的 \`${row.label}\` 那一段包装不在（${JSON.stringify(row.shipped.reason)}）—— 发布器要把每块共享正文都内联进去：`
        + `单文件自足 + 零静态引用（Q6）靠的就是"用户那一份里什么都有"；缺 @${row.label} 这一块，`
        + `出厂件里的 helper 只能来自旧副本（那是这一票要清掉的第二份实现）`)
    } else if (row.source.block.found === true && row.same !== true) {
      push('SHIP-INLINE-DRIFT',
        `出厂件的 \`${row.label}\` 那段正文与共享件**不是同一段**（共享 ${row.source_rel}:${row.source.block.begin_line}…${row.source.block.end_line}`
        + ` 摘要 ${String(row.source.block.digest).slice(0, 12)}… / 出厂件 :${row.shipped.begin_line}…${row.shipped.end_line}`
        + ` 摘要 ${String(row.shipped.digest).slice(0, 12)}…）—— 改了一边没改另一边，或者包装段里夹了别的东西`
        + `（内建绑定那几行要放在起点标记**之前**）`)
    }
    if (row.source.block.found === true && row.shipped.found === true) {
      for (const [needle, counts] of Object.entries(row.fingerprints)) {
        const a = counts.shared
        const b = counts.shipped
        if (a !== b || a === 0) {
          push('SHIP-INLINE-FINGERPRINT',
            `\`${row.label}\` 的正文指纹 \`${needle}\` 两边不同值（共享 ${a} 次 / 出厂件 ${b} 次）—— 内联的不是同一段正文`)
        }
      }
    }
    for (const [name, count] of Object.entries(row.definitions_in_artifact)) {
      if (count > 1) {
        push('SHIP-INLINE-DUP',
          `出厂件里 \`function ${name}(\` 出现了 ${count} 次（要 1）—— 内联块与旧副本同时在，等于同一份实现有两处`
          + `（发布时要先把 repo 那一份里的定义删掉，再内联）`)
      }
    }
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}

// ── 腿 7c · 声明算术（单条 · 数字复现 · 说得出第二块）──────────────────────────────
/**
 * 声明算术的读数。**数字复现交给 `targetVerdict`**（与入口 `F57-TARGET` 同一份判定体），
 * 这里只补这一族特有的两条：**只此一条**（`entries.length === 1`）与**理由说得出第二块**。
 *
 * 为什么把数字复现交出去：那套口径（state / lag_bytes / 双 sha256 逐项对、过期声明也要红）
 * 在 `target.mjs` 里已经有一份，还有 `self-check` 的 `T-06`（`lag_bytes` 差 1 ⇒ 红）守着 ——
 * 再写第二份就是"一个数两个载体"（`cand-20261104-0020`）。
 *
 * @param {{declarationPath?: string, file?: string, stagedRoot?: string, baselineRoot?: string}} [input]
 */
export function declarationArithmeticReading({
  declarationPath = PATHS.targetLagDeclaration,
  file = SHIPPED_ROLLBACK_FILE,
  stagedRoot = PATHS.stagedPreset,
  baselineRoot = PATHS.finalPreset,
} = {}) {
  const decl = declarationReading({ path: declarationPath, file })
  const staged = measureOne(stagedRoot, file)
  const baseline = measureOne(baselineRoot, file)
  const measured = { files: [{ file, staged, baseline }] }
  const entryCount = decl.entries === null ? null : decl.entries.length
  const entriesFiles = decl.entries === null ? null : decl.entries.map((e) => (e !== null && typeof e === 'object' ? e.file ?? '?' : '?'))
  const reading = {
    path: decl.path,
    file,
    present: decl.present,
    parse_error: decl.parse_error,
    entry_count: entryCount,
    entries_files: entriesFiles,
    entry: decl.entry,
    text_fields: decl.text_fields,
    reason_mentions_helper: null,
    measured: {
      staged: { exists: staged.exists, bytes: staged.bytes, sha256: staged.sha256 },
      baseline: { exists: baseline.exists, bytes: baseline.bytes, sha256: baseline.sha256 },
      state: actualOf({ file, staged, baseline }).state,
      lag_bytes: actualOf({ file, staged, baseline }).lag_bytes,
    },
    /** 🔴 数字复现的判词 = `targetVerdict` 对**这一条**的结论（原码照转，不另起炉灶）。 */
    reproduce: null,
    line: '',
  }
  if (decl.entry !== null) {
    const reason = typeof decl.entry.reason === 'string' ? decl.entry.reason : ''
    reading.reason_mentions_helper = /cli-guards/.test(reason) && /(内联|inline|embed|捆绑|并进)/i.test(reason)
    reading.reproduce = targetVerdict({
      measured,
      declaration: { path: decl.path, present: true, error: null, value: { schema: decl.schema, entries: [decl.entry] } },
    })
  }
  reading.line = `声明算术 ${decl.path}：${entryCount === null ? '缺 entries' : `${entryCount} 条`}`
    + `（${entriesFiles === null ? '?' : entriesFiles.join(' / ')}）· 点名 ${file}：${decl.entry === null ? '**没有**' : '有'}`
    + ` · 实测 ${reading.measured.state} / lag_bytes ${JSON.stringify(reading.measured.lag_bytes)}`
    + (decl.entry === null ? '' : ` / 声明 ${JSON.stringify(decl.entry.state)} / ${JSON.stringify(decl.entry.lag_bytes)}`)
    + ` · 理由提第二块：${reading.reason_mentions_helper === true ? '是' : '**不是**'}`
    + (reading.reproduce === null ? '' : ` · 数字复现 ${reading.reproduce.ok ? '对上' : `**对不上**（${reading.reproduce.problems.map((p) => p.code).join(' / ')}）`}`)
  return reading
}

/** 腿 7c 的判词。 */
export function declarationArithmeticVerdict(reading) {
  const problems = []
  const push = (code, message, detail) => problems.push({ code, message, detail: detail ?? null })
  if (!reading.present || reading.parse_error !== null || reading.entry === null) {
    push('SHIP-DECL-ARITH-UNJUDGED',
      `声明算术判不了：${reading.present ? (reading.parse_error ?? `没有点名 ${reading.file} 的那一条（现有 ${JSON.stringify(reading.entries_files)}）`) : '声明不在'}`
      + ` —— 这一格判不了，不许当绿（形状那几条由声明判词报）`)
    return { verdict: 'RED', problems }
  }
  if (reading.entry_count !== 1) {
    push('SHIP-DECL-ENTRY-COUNT',
      `受控差异声明必须**只此一条**（点 ${reading.file}），实得 ${reading.entry_count} 条：${JSON.stringify(reading.entries_files)}`
      + ' —— 多出来的每一条都是"多一棵树在漂"，而漂的那棵树没有票')
  }
  for (const p of reading.reproduce?.problems ?? []) {
    push(p.code, `[数字复现] ${p.message}`)
  }
  if (reading.reason_mentions_helper !== true) {
    push('SHIP-DECL-HELPER',
      `声明的理由没说清**第二块**内联：要同时提到 \`cli-guards\`（源）与"内联"（实得 ${JSON.stringify(reading.text_fields.reason)}）`
      + ' —— 声明不是免责条款，它得让下一个人知道这处受控差异是"发布时内联了两段正文"，不是分叉')
  }
  return { verdict: problems.length === 0 ? 'GREEN' : 'RED', problems }
}
