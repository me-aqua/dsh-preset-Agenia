/**
 * `DEC-05` 的量具 —— **按形状数原子写**（构案 0007 · 史山清查 B2 · Gate 2）。
 *
 * 契约：`.team/test/2026-11-13/CONTRACT-史山清查-B2.md` §1。决定：`决议/构案/0007-原子写剩余实现.md`。
 * 这一份只做三件事：**造夹具树** / **读 `census --json` 的那个概念** / **核允许清单的形状**。
 * 数数本身**不在这里** —— 那是 `.tools` 的活（判据与生成器不许各写一份解析器，契约 §5.3）。
 *
 * 🔴 口径（与契约 §1.1 逐字一致；读的人不必回推）：
 *   · **A 族（手搓文件原子写）** = 临时名上的 `writeFileSync` / `writeFile`，同一份文件里**之后**
 *     有 `renameSync(<同一个临时名>, …)`。**A 族永远不许进允许清单** —— 它就是这一票要清的东西。
 *   · **B 族（只 rename 的临时名）** = `renameSync(<临时名>, …)`，而这一份文件**没有**写那个名字
 *     （`writeFileSync` / `writeFile`）。它可能是合法的（整目录换名 / 清残渣），所以**可以**进允许清单，
 *     但每条要有名（路径 + 行）、有类别、有理由。
 *   · 临时名 = 标识符含 `tmp`（不区分大小写，`bodyTmp` 也算）或右值里有 `.tmp` / `.tmp-` / `agenia-tmp`。
 *   · 数的是**处**（site），不是份数：一个文件两处就是 2。
 *   · `count` = A 处 + 未被允许清单盖住的 B 处。**真树在 Gate 3 之后必须是 0。**
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runCensus, sceneRoot } from './decision-ledger.mjs'

/** 概念名 —— **0007 登记时那一行的名字**（主题 = `原子写剩余实现`；INDEX 的「构案」列靠它派生）。 */
export const SHAPE_CONCEPT = '原子写剩余实现'
/** 计数口径的 token（`COUNT_RULES` 里的新键；Gate 3 落）。 */
export const SHAPE_RULE = 'atomic-write-by-shape'
/** 扫描面（两份 glob；与 `ATM-01` 定义腿同一个面）。 */
export const SHAPE_SURFACE = Object.freeze(['presets/**/*.mjs', 'presets/**/*.js'])
/**
 * 扫描面的**文件数下限**（不是精确值）：真树今天 43 份；低于 40 ⇒ 面塌了，"0 处"不作数。
 * 用下限不用精确值的理由：多一份源码是合法变化，精确值会让这一格每次加文件都假红。
 */
export const SHAPE_SCAN_FLOOR = 40
/** 允许清单那两列 / 类别闭集。 */
export const ALLOWLIST_COLUMNS = Object.freeze(['路径', '行', '类别', '理由'])
export const ALLOWLIST_KINDS = Object.freeze(['shared-implementation', 'non-atomic-rename'])
/** 理由的占位值（写了等于没写）。 */
export const ALLOWLIST_PLACEHOLDERS = Object.freeze(['—', '-', '?', 'TODO', 'TBD', '待补'])
/** 理由的最小长度（「一句能读的话」，不是「一个词」）。 */
export const ALLOWLIST_MIN_REASON = 12
/**
 * 共享件正文的指纹（**与 `ATM-01` 腿 10 同一组针**）。
 * 允许清单里 `shared-implementation` 这一类要证明"被点名的那份真的是共享正文"，就靠它。
 */
export const SHARED_BODY_NEEDLES = Object.freeze(['writeSync(handle', 'fsyncSync', "openSync(tmp, 'wx')"])

/** 允许清单里"整目录换名"那类理由里必须说清的词（文件级 ≠ 目录级）。 */
const DIR_SWAP_WORDS = /(目录|整目录|dir|directory)/i

/**
 * 造一份概念表（+ 可选的允许清单第二张表）。
 * 表头**逐字**是 census 认的那五列（`契约 §3.1`）；允许清单是**第二张**表，第一张表的解析不受影响。
 */
export function conceptTableText({ concept = SHAPE_CONCEPT, probe = SHAPE_RULE, scan = SHAPE_SURFACE.join(','), owner = '实现岗', rule = SHAPE_RULE } = {}, allowlist = []) {
  const lines = [
    '<!-- 概念表：census 的唯一概念源；改这一行 = 改 census 的口径 -->',
    '# 概念表',
    '',
    '| 概念 | 实现探针 | 扫描 | 归属 | 计数口径 |',
    '| --- | --- | --- | --- | --- |',
    `| ${concept} | ${probe} | ${scan} | ${owner} | ${rule} |`,
    '',
  ]
  if (allowlist !== null) {
    lines.push('## 原子写形状允许清单', '', '| 路径 | 行 | 类别 | 理由 |', '| --- | --- | --- | --- |')
    for (const e of allowlist) lines.push(`| ${e.file} | ${e.line} | ${e.kind} | ${e.why} |`)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * 造一棵夹具树（**每次清空**；`sceneRoot` 带 marker 两道闸）。
 *
 * @param {{caseId?:string, tag:string, files?:Array<{rel:string,text:string}>, allowlist?:Array<object>|null,
 *          concept?:object}} spec
 */
export function shapeScene({ caseId = 'DEC-05', tag, files = [], allowlist = null, concept = {} }) {
  const root = sceneRoot(caseId, tag)
  const write = (rel, text) => {
    const file = path.join(root, ...rel.split('/'))
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text, 'utf8')
  }
  write('决议/概念表.md', conceptTableText(concept, allowlist))
  for (const f of files) write(f.rel, f.text)
  return { root, files: files.map((f) => f.rel), allowlist }
}

/**
 * 读一份夹具 / 真树的那个概念（`census --json` 的读数）。
 *
 * 只读**工具给的**字段；判据不许自己再扫一遍源码（那是第二份解析器）。
 * 缺字段 ⇒ `missing_fields`（Gate 3 之前就是这样；**不许**当成 0）。
 */
export function shapeReading(root) {
  const run = runCensus(root)
  const concepts = Array.isArray(run.json?.concepts) ? run.json.concepts : []
  const concept = concepts.find((c) => c.concept === SHAPE_CONCEPT) ?? null
  const problems = Array.isArray(run.json?.problems) ? run.json.problems : []
  const fields = ['count', 'implementations', 'unit', 'rule', 'scan', 'scan_empty', 'sites', 'allowlist', 'scanned_files']
  const missing = concept === null ? fields : fields.filter((f) => concept[f] === undefined)
  return {
    run,
    exit: run.exit,
    root,
    concept,
    problems,
    problem_codes: problems.map((p) => p.code),
    missing_fields: missing,
  }
}

/** 一份允许清单条目的形状 / 证据问题（纯函数；夹具与真树共用这一份）。 */
export function allowlistEntryProblems(entry, { root, relPaths }) {
  const problems = []
  const push = (code, message) => problems.push({ code, message })
  const file = typeof entry?.file === 'string' ? entry.file.replace(/\\/g, '/') : ''
  if (file === '') {
    push('DEC05-SHAPE-ALLOWLIST-SHAPE', `允许清单条目缺「路径」（实得 ${JSON.stringify(entry?.file)}）`)
    return problems
  }
  if (/[*?]/.test(file)) {
    push('DEC05-SHAPE-ALLOWLIST-SHAPE', `允许清单的「路径」是通配 ${JSON.stringify(file)} —— 允许清单只许点名**一处**，不许一次盖一片`)
  }
  if (relPaths !== undefined && !relPaths.includes(file)) {
    push('DEC05-SHAPE-ALLOWLIST-SHAPE', `允许清单点名的 ${JSON.stringify(file)} 不在扫描面里（它永远不会被扫到）`)
  }
  if (!existsSync(path.join(root, ...file.split('/')))) {
    push('DEC05-SHAPE-ALLOWLIST-SHAPE', `允许清单点名的 ${JSON.stringify(file)} 不在盘上`)
  }
  if (!Number.isInteger(entry?.line) || entry.line <= 0) {
    push('DEC05-SHAPE-ALLOWLIST-SHAPE', `允许清单条目 ${JSON.stringify(file)} 缺行号（实得 ${JSON.stringify(entry?.line)}）—— 不允许"整份文件"进清单`)
  }
  if (!ALLOWLIST_KINDS.includes(entry?.kind)) {
    push('DEC05-SHAPE-ALLOWLIST-SHAPE', `允许清单条目 ${JSON.stringify(file)} 的类别是 ${JSON.stringify(entry?.kind)}，只认 ${JSON.stringify(ALLOWLIST_KINDS)}`)
  }
  const why = typeof entry?.why === 'string' ? entry.why.trim() : ''
  if (why === '' || ALLOWLIST_PLACEHOLDERS.includes(why)) {
    push('DEC05-SHAPE-ALLOWLIST-SHAPE', `允许清单条目 ${JSON.stringify(file)} 的「理由」是空的 / 占位值（实得 ${JSON.stringify(entry?.why)}）`)
  } else if ([...why].length < ALLOWLIST_MIN_REASON) {
    push('DEC05-SHAPE-ALLOWLIST-SHAPE', `允许清单条目 ${JSON.stringify(file)} 的「理由」只有 ${[...why].length} 个字（至少 ${ALLOWLIST_MIN_REASON}）—— 读的人要能据它判"该不该留"`)
  }
  // 证据面：两个类别各自要证明的东西（**内容锚，不是行号**）
  let text = null
  try {
    text = readFileSync(path.join(root, ...file.split('/')), 'utf8')
  } catch {
    text = null
  }
  if (text !== null) {
    const hasBody = SHARED_BODY_NEEDLES.every((n) => text.includes(n))
    const definesShared = /\b(?:export\s+)?(?:async\s+)?function\s+writeFileAtomic\s*\(/.test(text)
    if (entry?.kind === 'shared-implementation' && !(hasBody || definesShared)) {
      push('DEC05-SHAPE-ALLOWLIST-EVIDENCE', `允许清单把 ${JSON.stringify(file)} 当成「共享实现本体」，但那份文件里既没有 \`writeFileAtomic\` 的定义、也没有共享正文指纹 ${JSON.stringify(SHARED_BODY_NEEDLES)} —— 类别是自报的，判据不认`)
    }
    if (entry?.kind === 'non-atomic-rename' && (hasBody || definesShared)) {
      push('DEC05-SHAPE-ALLOWLIST-EVIDENCE', `允许清单把 ${JSON.stringify(file)} 当成「非原子 rename」，但那份文件里就是共享实现（\`writeFileAtomic\` / 正文指纹）—— 类别写反了`)
    }
  }
  if (entry?.kind === 'non-atomic-rename') {
    const lines = text === null ? [] : text.split(/\r?\n/)
    const cited = Number.isInteger(entry.line) && entry.line > 0 ? lines[entry.line - 1] : undefined
    if (cited !== undefined && !/renameSync\s*\(/.test(cited)) {
      push('DEC05-SHAPE-ALLOWLIST-EVIDENCE', `允许清单把 ${JSON.stringify(file)}:${entry.line} 当成「非原子 rename」，但那一行不是 \`renameSync(\`（实得 ${JSON.stringify(String(cited).trim().slice(0, 120))}）`)
    }
    if (!DIR_SWAP_WORDS.test(why)) {
      push('DEC05-SHAPE-ALLOWLIST-EVIDENCE', `允许清单条目 ${JSON.stringify(file)} 的类别是「非原子 rename」，理由里没说清它换的是什么（要提到目录 / 整目录 / dir）—— 实得 ${JSON.stringify(why)}`)
    }
  }
  return problems
}

/** 读数里的人话一句（报文 / `result.json` 共用）。 */
export function shapeSummary(concept) {
  if (concept === null || concept === undefined) return '（读不到那个概念）'
  const sites = Array.isArray(concept.sites) ? concept.sites : []
  const allow = Array.isArray(concept.allowlist) ? concept.allowlist : []
  return `${concept.count} 处（sites ${sites.length}：A ${sites.filter((s) => s?.shape === 'A').length} / B ${sites.filter((s) => s?.shape === 'B').length}`
    + ` · 允许清单 ${allow.length} 条 · 扫描面 ${concept.scanned_files} 份文件）`
}

/**
 * 夹具源码（**正/负对照的唯一一份**；判据与探针都从这里取，别在各处再抄一遍）。
 * 每个字符串都是一份完整的 `*.mjs`，写在 `<夹具根>/presets/agenia/lib/` 下。
 */
export const SHAPE_FIXTURES = Object.freeze({
  /** A 族：`<file>.tmp`。 */
  handrolledTmp: [
    '// 夹具：手搓的文件原子写（A 族）',
    'export function writeIt(file, text) {',
    '  const tmp = `${file}.tmp`',
    '  writeFileSync(tmp, text, "utf8")',
    '  renameSync(tmp, file)',
    '}',
    '',
  ].join('\n'),
  /** A 族：`<file>.tmp-<pid>`（`inject.js:2794` 那个形状）。 */
  handrolledPid: [
    'export function writeCursor(file, value) {',
    '  const tmp = `${file}.tmp-${process.pid}`',
    '  writeFileSync(tmp, JSON.stringify(value))',
    '  renameSync(tmp, file)',
    '}',
    '',
  ].join('\n'),
  /** A 族：用 `writeFile`（异步 API 的名字也算同一个形状）+ `.agenia-tmp` 命名。 */
  handrolledWriteFile: [
    'export async function writeIt(file, text) {',
    '  const tmp = `${file}.agenia-tmp`',
    '  await writeFile(tmp, text)',
    '  renameSync(tmp, file)',
    '}',
    '',
  ].join('\n'),
  /** B 族：只 rename 一个临时名（整目录换名）—— 合法形态的候选。 */
  tempRenameOnly: [
    '// 夹具：整目录换名（文件先写进临时目录，最后整目录 rename）',
    'export function publish(dir, stamp) {',
    '  const finalDir = path.join(dir, `packet-${stamp}`)',
    "  const bodyTmp = path.join(tokenDir, 'packet')",
    '  writeFileSync(path.join(bodyTmp, "manifest.json"), "{}")',
    '  renameSync(bodyTmp, finalDir)',
    '}',
    '',
  ].join('\n'),
  /** 负对照：只 rename（没有临时名）。 */
  renameOnly: ['export function move(from, to) {', '  renameSync(from, to)', '}', ''].join('\n'),
  /** 负对照：只读。 */
  readOnly: ['export function readIt(file) {', '  return readFileSync(file, "utf8")', '}', ''].join('\n'),
  /** 负对照：直接写活文件（没有 rename —— 不是"第二份原子写"，是"根本没想原子"）。 */
  directWrite: ['export function writeIt(file, text) {', '  writeFileSync(file, text, "utf8")', '}', ''].join('\n'),
  /** 共享实现本体（`shared-implementation` 允许清单条目的证据面）。 */
  sharedBody: [
    'export function writeFileAtomic(file, data) {',
    '  const tmp = `${file}.tmp-${process.pid}-${rand}`',
    "  const handle = openSync(tmp, 'wx')",
    '  writeSync(handle, data)',
    '  fsyncSync(handle)',
    '  renameSync(tmp, file)',
    '}',
    '',
  ].join('\n'),
})
