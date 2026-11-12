/**
 * `DUP-01` 的量具 —— **同一个工具的第二个拷贝**（`.tools/*.mjs` vs `presets/agenia/bin/*.mjs`）。
 *
 * 病（史山清查 A1，2026-11-12 现量）：`.tools/agenia-install.mjs` · `.tools/agenia-rollback.mjs` 是
 * `presets/agenia/bin/install.mjs` / `rollback.mjs` 的**逐字节副本**；`.tools/agenia-release-scan.mjs`
 * 是 `bin/release-scan.mjs` 的**陈旧副本**（已分叉：36,104 B vs 38,749 B）。活引用 0 —— 三份都是死拷贝
 * （Gate 3 已删；这一格守的是"**删完之后不许再长出第二份**"，不是"删"本身）。
 *
 * ## 判什么（口径，只有这一份）
 *   ① **扫描面** = 两个目录的**顶层** `*.mjs`：
 *        `<root>/.tools` 与 `<root>/presets/agenia/bin`。
 *      子目录（`.tools/lib` / `.tools/_staging` / `.tools/_backup`）**不在**扫描面：
 *      它们是库 / 测试靶子 / 安装备份，`bin/` 里的同名件在那里是**合法**的，扫进去只会造出假红。
 *      非 `.mjs` 文件（`.tools/daily-cards.py`）也不在扫描面 —— 这不是"所有文件都不许重名"。
 *   ② **工具键** = 文件名，**`.tools` 那一侧再按历史前缀 `agenia-` 归一一次**（通用规则，没有第二份
 *      手写名字表）：`.tools/agenia-install.mjs` 与 `presets/agenia/bin/install.mjs` 是**同一个工具**的
 *      旧名 / 新名。这条口径的唯一出处是契约 §0.3；三对旧名作为"Gate 2 那三份"的来历见定形 §一 与
 *      Gate 2 的机器读数（`dup01-gate2-full4` 的 `readings.real_tree`）。
 *      ⇒ 这一条判的是**工具身份**，不是"字面同名"：`.tools/agenia-X.mjs` 与 `bin/X.mjs` 撞上就是第二份拷贝。
 *   ③ **一对就是红**，两种形状都红：**逐字节相同**（第二份拷贝）与**同名但已分叉**（陈旧副本）。
 *      分叉那种更要红：跑老那份就少一截行为，而它看上去还是"那个工具"。
 *   ④ **读数必须自证扫描面**：两个目录的绝对路径 + 各几份 `*.mjs`。少了这两个数，"0 对"是真空真
 *      （目录不在 / 一份都没有的时候，"没有重复"什么都不证明）⇒ 那两种情形是**红**，不是绿。
 *
 * ## 不判什么（边界）
 *   · 不判内容对不对、不判该不该有 `.tools` 这一层、不判 `bin/` 里两个工具彼此像不像；
 *   · 不判 `.tools` 之外（仓库根、`tests/`、`.team/` 历史档案里的旧路径是**记录**，不是引用）；
 *   · 不判 `publish-staged` 跑起来对不对（那是发布路径的活）：腿 E 只钉"**op 体内不许再出现 `.tools` 段**、
 *     它列的源名字都在 live `bin/` 里"。跑这个 op 本身归发布侧的探针。
 *
 * 判词只有一处：`toolCopyVerdict()`（用例与将来的读者都读它，不许各写一份）。腿 E 的判词同理只在
 * `publishStagedSourceVerdict()` 一处。
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** 扫描面（顺序即读数顺序；`id` 是稳定标签，`rel` 是打印给人看的那一段）。 */
export const TOOL_COPY_SCAN = [
  { id: 'tools', rel: '.tools', role: '工作区脚本（旧名侧）' },
  { id: 'bin', rel: 'presets/agenia/bin', role: '现役工具（新名侧）' },
]

/** 只认这个后缀（`.tools/daily-cards.py` 是另一族，不在本判据的面上）。 */
export const TOOL_FILE_SUFFIX = '.mjs'

/** 旧名前缀 —— `.tools/<前缀>X.mjs` 与 `bin/X.mjs` 是同一个工具（来历见模块头 ②）。 */
export const LEGACY_PREFIX = 'agenia-'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const posix = (p) => String(p).replace(/\\/g, '/')

/**
 * 一个文件名在"工具身份"上的全部键（**只在 `.tools` 那一侧用**）：
 *   · 字面名本身（`.tools/install.mjs` 与 `bin/install.mjs`）；
 *   · 去掉旧名前缀之后的名字（`.tools/agenia-install.mjs` 与 `bin/install.mjs`）。
 * `bin` 那一侧只用字面名 —— 新名就是它自己的身份，不归一。
 *
 * @param {string} name  `.mjs` 文件名
 * @returns {string[]} 至少一项；顺序 = 先字面、后归一
 */
export function toolKeysOf(name) {
  const keys = [name]
  if (name.startsWith(LEGACY_PREFIX) && name.length > LEGACY_PREFIX.length) {
    keys.push(name.slice(LEGACY_PREFIX.length))
  }
  return keys
}

/**
 * 一个扫描面：目录在不在、读不读得动、顶层有几份 `*.mjs`（按名字排序 ⇒ 读数可复现）。
 * 目录不在 / 读不动 / 一份都没有，都由判词记红；这里只如实记读数，不替判词下结论。
 *
 * @param {string} scanRoot
 * @param {{id:string, rel:string, role:string}} spec
 */
function readScanDir(scanRoot, spec) {
  const abs = path.join(scanRoot, ...spec.rel.split('/'))
  const out = { id: spec.id, rel: spec.rel, role: spec.role, abs: posix(abs), exists: false, read_error: null, mjs_count: 0, mjs_names: [] }
  try {
    const st = statSync(abs)
    if (!st.isDirectory()) return out
    out.exists = true
    const files = readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(TOOL_FILE_SUFFIX))
      .map((e) => e.name)
      .sort()
    out.mjs_names = files
    out.mjs_count = files.length
  } catch (err) {
    // `ENOENT` / `ENOTDIR` 就是"目录不在"（exists:false）；其它错误是"在但读不动"（exists:true + read_error）。
    const code = err !== null && typeof err === 'object' ? err.code : null
    if (code === 'ENOENT' || code === 'ENOTDIR') return out
    out.exists = true
    out.read_error = String(err?.message ?? err)
  }
  return out
}

/**
 * 扫一棵树：两个扫描面各数一遍，再把 `.tools` 的每个键与 `bin` 的名字对一次。
 *
 * @param {{root: string}} input  `root` = 被扫的树根（真树 = `PATHS.repo`；夹具 = 运行根里的 scratch）
 * @returns {{
 *   root: string,
 *   rule: {suffix: string, legacy_prefix: string, top_level_only: true, dirs: string[]},
 *   dirs: Array<{id:string, rel:string, role:string, abs:string, exists:boolean, read_error:string|null, mjs_count:number, mjs_names:string[]}>,
 *   copies: Array<{key:string, match:'exact-name'|'legacy-prefix',
 *     tools:{rel:string, path:string, name:string, size:number, sha256:string},
 *     bin:{rel:string, path:string, name:string, size:number, sha256:string},
 *     bytes_equal:boolean, sizes_equal:boolean}>,
 *   counts: {tools_mjs:number, bin_mjs:number, keys_compared:number, copies:number},
 *   line: string,
 * }}
 */
export function scanToolCopies({ root } = {}) {
  if (typeof root !== 'string' || root.trim() === '') throw new Error('DUP-SCAN-ROOT: scanToolCopies 必须给 root（被扫的树根）')
  const scanRoot = path.resolve(root)
  const dirs = TOOL_COPY_SCAN.map((spec) => readScanDir(scanRoot, spec))
  const toolsDir = dirs[0]
  const binDir = dirs[1]

  const binByName = new Map(binDir.mjs_names.map((name) => [name, name]))
  const copies = []
  const seen = new Set()
  for (const toolsName of toolsDir.mjs_names) {
    for (const key of toolKeysOf(toolsName)) {
      const binName = binByName.get(key)
      if (binName === undefined) continue
      const pairId = `${toolsName}=>${binName}`
      if (seen.has(pairId)) continue // `.tools/agenia-install.mjs` 的两个键撞同一份 bin 文件 ⇒ 只记一对
      seen.add(pairId)
      const toolsPath = path.join(toolsDir.abs, toolsName)
      const binPath = path.join(binDir.abs, binName)
      let aBuf = null
      let bBuf = null
      let error = null
      try {
        aBuf = readFileSync(toolsPath)
        bBuf = readFileSync(binPath)
      } catch (err) {
        error = String(err?.message ?? err)
      }
      const aSha = aBuf === null ? null : sha256(aBuf)
      const bSha = bBuf === null ? null : sha256(bBuf)
      copies.push({
        key: binName,
        match: key === toolsName ? 'exact-name' : 'legacy-prefix',
        tools: { rel: posix(path.relative(scanRoot, toolsPath)), path: posix(toolsPath), name: toolsName, size: aBuf === null ? null : aBuf.length, sha256: aSha },
        bin: { rel: posix(path.relative(scanRoot, binPath)), path: posix(binPath), name: binName, size: bBuf === null ? null : bBuf.length, sha256: bSha },
        bytes_equal: aSha !== null && bSha !== null ? aSha === bSha : null,
        sizes_equal: aBuf !== null && bBuf !== null ? aBuf.length === bBuf.length : null,
        ...(error === null ? {} : { error }),
      })
    }
  }
  copies.sort((a, b) => (a.key === b.key ? a.tools.name.localeCompare(b.tools.name) : a.key.localeCompare(b.key)))

  const counts = {
    tools_mjs: toolsDir.mjs_count,
    bin_mjs: binDir.mjs_count,
    keys_compared: toolsDir.mjs_names.reduce((n, name) => n + toolKeysOf(name).length, 0),
    copies: copies.length,
  }
  const line = renderScanLine({ scanRoot, dirs, copies })
  return {
    root: posix(scanRoot),
    rule: {
      suffix: TOOL_FILE_SUFFIX,
      legacy_prefix: LEGACY_PREFIX,
      top_level_only: true,
      dirs: TOOL_COPY_SCAN.map((spec) => spec.rel),
      /** 工具键的读法（**没有第二份名字表**；唯一出处 = 契约 §0.3）。 */
      tool_key: 'basename；.tools 侧再剥一次历史前缀 `agenia-`（bin 侧不剥）',
      provenance: '口径唯一出处：契约 §0.3（旧名三对的来历见定形 §一 与 Gate 2 读数 dup01-gate2-full4）',
    },
    dirs,
    copies,
    counts,
    line,
  }
}

/** 一行人话：扫了哪棵树、两个目录各几份、几对 —— 「0 对」必须和这两个数一起出现。 */
function renderScanLine({ scanRoot, dirs, copies }) {
  const face = dirs
    .map((d) => {
      if (!d.exists) return `${d.rel}（目录不在）`
      if (d.read_error !== null) return `${d.rel}（读不动：${d.read_error.slice(0, 80)}）`
      return `${d.rel}（${d.mjs_count} 份 ${TOOL_FILE_SUFFIX}）`
    })
    .join(' · ')
  const head = `扫描 ${posix(scanRoot)}：${face} ⇒ 同名工具的第二个拷贝 ${copies.length} 对`
  if (copies.length === 0) return head
  const body = copies
    .map((c) => `${c.key}（${c.tools.path} ${c.tools.size} B / ${c.bin.path} ${c.bin.size} B · ${c.bytes_equal === true ? '逐字节相同' : c.bytes_equal === false ? '已分叉' : '读不出'}）`)
    .join(' · ')
  return `${head}：${body}`
}

/**
 * 判词（**唯一一处**）：扫描面缺 / 空 / 读不动 ⇒ 红（"没量到"不许写绿）；一对拷贝 ⇒ 红。
 * 报文一律点名**两边的路径与大小**（谁、多大、是不是逐字节相同）。
 *
 * @param {object} reading  `scanToolCopies()` 的返回
 * @returns {{verdict:'GREEN'|'RED', problems: Array<{code:string, message:string, detail?:object}>, line:string|null}}
 */
export function toolCopyVerdict(reading) {
  const problems = []
  const dirs = reading?.dirs ?? []
  for (const d of dirs) {
    if (!d.exists) {
      problems.push({
        code: 'DUP-SCAN-DIR',
        message: `扫描面不在：${d.abs}（${d.rel}）—— 目录没了还报"0 对"就是真空真（这一格不判"那边该不该有这棵树"，只判"量过了没有"）`,
        detail: { dir: d.rel, abs: d.abs },
      })
    } else if (d.read_error !== null) {
      problems.push({
        code: 'DUP-SCAN-READ',
        message: `扫描面读不动：${d.abs}（${d.rel}）—— ${d.read_error}`,
        detail: { dir: d.rel, abs: d.abs, read_error: d.read_error },
      })
    } else if (d.mjs_count === 0) {
      problems.push({
        code: 'DUP-SCAN-EMPTY',
        message: `扫描面一份 ${TOOL_FILE_SUFFIX} 都没有：${d.abs}（${d.rel}）—— "0 对"在这种扫描面上什么都不证明`,
        detail: { dir: d.rel, abs: d.abs },
      })
    }
  }
  for (const c of reading?.copies ?? []) {
    const shape = c.bytes_equal === true
      ? '逐字节相同（第二份拷贝）'
      : c.bytes_equal === false
        ? '同名但已分叉（陈旧副本：跑老那份就少一截行为）'
        : '读不出（无法证明两边相同或不同）'
    problems.push({
      code: 'DUP-TOOL-COPY',
      message: `同名工具的第二个拷贝：${c.tools.path}（${c.tools.size} B）与 ${c.bin.path}（${c.bin.size} B）—— ${shape}`,
      detail: c,
    })
  }
  return {
    verdict: problems.length > 0 ? 'RED' : 'GREEN',
    problems,
    line: typeof reading?.line === 'string' ? reading.line : null,
  }
}

// ── 腿 E · `publish-staged` 的源名单只许指向 live `bin/` ─────────────────────────
//
// 命名的裁定（工具键 = `.tools` 侧剥历史前缀）不需要第二份名字表；但**发布路径**有一份源名单：
// `install.mjs` 的 `opPublishStaged` 把三支脚本逐字节拷进 staged 的 `bin/`。Gate 3 之前它从
// `<repo>/.tools/agenia-*.mjs` 取源；本票（d91ba39）把它重指到 `<repo>/presets/agenia/bin/<name>`。
// 这条腿钉住那个不变量：**op 体内不许再出现 `.tools` 段**，且它列出的源名字都能在 live `bin/` 里找到。
// 判据只读源码文本，不跑这个 op（跑它要写 staged，归发布侧的探针）。

/** 那个唯一的发布 op（名字写在这里，别处不许再拼一遍）。 */
export const PUBLISH_OP_NAME = 'opPublishStaged'
/** `.tools` 作为**引号里的路径段**出现（`'.tools'` / `'.tools/'` / 反引号 / 双引号都算）。 */
export const TOOLS_SEGMENT_RE = /(['"`])\.tools(?:\/|\1)/g

/** 从源码里切一个顶层函数体：`function <name>(` 到第一个列 0 的 `}`（本仓库的缩进风格保证内层 `}` 都缩进）。 */
export function extractFunctionBody(text, name) {
  const start = text.indexOf(`function ${name}(`)
  if (start < 0) return null
  const close = text.indexOf('\n}', start)
  if (close < 0) return null
  return { start, end: close + 2, body: text.slice(start, close + 2) }
}

/**
 * 读一份 `install.mjs`（可以是 scratch 副本），量 `opPublishStaged` 的源名单。
 *
 * @param {{file: string, liveBinDir: string}} input
 * @returns {{
 *   file: string, live_bin_dir: string, read_error: string|null,
 *   function_found: boolean, body_lines: number,
 *   tools_segments: Array<{at:number, text:string}>,
 *   source_names: string[], live_bin_names: string[], missing_live: string[],
 *   has_bin_segment: boolean, line: string,
 * }}
 */
export function publishStagedSourceReading({ file, liveBinDir } = {}) {
  if (typeof file !== 'string' || file.trim() === '') throw new Error('DUP-PUBLISH-READ: 必须给 file（要读的 install.mjs）')
  if (typeof liveBinDir !== 'string' || liveBinDir.trim() === '') throw new Error('DUP-PUBLISH-READ: 必须给 liveBinDir（活体 bin 目录）')
  const fileAbs = path.resolve(file)
  const binAbs = path.resolve(liveBinDir)
  let text = null
  let readError = null
  try {
    text = readFileSync(fileAbs, 'utf8')
  } catch (err) {
    readError = String(err?.message ?? err)
  }
  let liveBinNames = []
  try {
    liveBinNames = readdirSync(binAbs, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(TOOL_FILE_SUFFIX))
      .map((e) => e.name)
      .sort()
  } catch {
    liveBinNames = []
  }
  const out = {
    file: posix(fileAbs),
    live_bin_dir: posix(binAbs),
    read_error: readError,
    function_found: false,
    body_lines: 0,
    tools_segments: [],
    source_names: [],
    live_bin_names: liveBinNames,
    missing_live: [],
    has_bin_segment: false,
    line: '',
  }
  if (text === null) {
    out.line = `读不出 ${out.file}（${readError}）`
    return out
  }
  const fn = extractFunctionBody(text, PUBLISH_OP_NAME)
  if (fn === null) {
    out.line = `${out.file} 里找不到 function ${PUBLISH_OP_NAME}( —— 源名单读不出来`
    return out
  }
  out.function_found = true
  out.body_lines = fn.body.split(/\r?\n/).length
  const segments = []
  TOOLS_SEGMENT_RE.lastIndex = 0
  let m
  while ((m = TOOLS_SEGMENT_RE.exec(fn.body)) !== null) segments.push({ at: m.index, text: m[0] })
  out.tools_segments = segments
  // 源名字 = op 体内所有 `'…'` 的 `.mjs` 字面量（映射表 / names 数组 / 内联列表都认；去重排序）。
  out.source_names = [...new Set([...fn.body.matchAll(/'([A-Za-z0-9._-]+\.mjs)'/g)].map((x) => x[1]))].sort()
  out.missing_live = out.source_names.filter((name) => !liveBinNames.includes(name))
  out.has_bin_segment = fn.body.includes("'bin'")
  out.line = renderPublishLine(out)
  return out
}

function renderPublishLine(r) {
  const names = r.source_names.length === 0 ? '（空）' : r.source_names.join(' · ')
  const segs = r.tools_segments.length === 0 ? '0 处' : `${r.tools_segments.length} 处（${r.tools_segments.map((s) => s.text).join(' · ')}）`
  const live = r.missing_live.length === 0 ? `名字都在 ${r.live_bin_dir}` : `缺：${r.missing_live.join(' · ')}（${r.live_bin_dir}）`
  return `${r.file} 的 ${PUBLISH_OP_NAME}：源名单 [${names}] · .tools 段 ${segs} · ${live}`
}

/**
 * 腿 E 的判词（唯一一处）：读不出 / 找不到 op / 出现 `.tools` 段 / 源名单读不出 / 名字不在 live bin ⇒ 红。
 *
 * @param {object} reading  `publishStagedSourceReading()` 的返回
 * @returns {{verdict:'GREEN'|'RED', problems: Array<{code:string, message:string, detail?:object}>, line:string|null}}
 */
export function publishStagedSourceVerdict(reading) {
  const problems = []
  const file = reading?.file ?? '(file?)'
  if (reading?.read_error !== null && reading?.read_error !== undefined) {
    problems.push({
      code: 'DUP-PUBLISH-READ',
      message: `读不出 ${file}：${reading.read_error}`,
      detail: { file, read_error: reading.read_error },
    })
  } else if (!reading?.function_found) {
    problems.push({
      code: 'DUP-PUBLISH-OP',
      message: `${file} 里找不到 \`function ${PUBLISH_OP_NAME}(\` —— 发布 op 没了 / 改名了，这一腿判不了，不许绿`,
      detail: { file },
    })
  } else {
    for (const seg of reading.tools_segments) {
      problems.push({
        code: 'DUP-PUBLISH-TOOLS',
        message: `${file} 的 ${PUBLISH_OP_NAME} 体内还有 \`.tools\` 段（${seg.text}，body 偏移 ${seg.at}）—— 源必须只从 live \`presets/agenia/bin/\` 取（Gate 3 的 repoint 被改回去了）`,
        detail: { file, at: seg.at, text: seg.text },
      })
    }
    if (reading.source_names.length === 0) {
      problems.push({
        code: 'DUP-PUBLISH-MAP',
        message: `${file} 的 ${PUBLISH_OP_NAME} 体内读不出任何 \`*.mjs\` 源名字 —— 发布名单读不出来，"没有 .tools 段"就没有意义`,
        detail: { file },
      })
    } else if (reading.missing_live.length > 0) {
      problems.push({
        code: 'DUP-PUBLISH-NAME',
        message: `${file} 的 ${PUBLISH_OP_NAME} 列的源名字不都在 live bin 里：${reading.missing_live.join(' · ')}（${reading.live_bin_dir}）`,
        detail: { file, missing: reading.missing_live, live_bin_dir: reading.live_bin_dir },
      })
    }
  }
  return {
    verdict: problems.length > 0 ? 'RED' : 'GREEN',
    problems,
    line: typeof reading?.line === 'string' ? reading.line : null,
  }
}
