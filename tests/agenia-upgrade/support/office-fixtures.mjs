/**
 * `OFB-*` 的**夹具拓扑** + **判据侧第二读者（oracle）** + **阳性对照** + **刀**。
 *
 * 契约：`.team/test/2026-11-07/CONTRACT-batch14.md`（§一 接口 · §二 用例 · §三 夹具拓扑 · §四 边界）。
 *
 * 🔴 为什么夹具根不在运行根里（这是本批最容易看漏的一条）：
 *    运行根按守卫只能落在 `<repo>/.team/test/<日期>/_runs/<RUN_ID>`（`support/root-guard.mjs::RUNS_PARENTS`），
 *    而新规则「从落点向上找最近的 `.team` 祖先」会先撞上**真实的 `<repo>/.team`** ⇒ 运行根里的每个落点都
 *    "在组内"，定形 ③（拒绝）与 ⑤（老越界样例仍拒绝）**造不出来**。
 *    ⇒ 两棵临时树放**同一块盘、仓库之外、祖先链上没有 `.team`** 的地方：
 *       `<盘符>\.agenia-office-fixtures\<RUN_ID>\A|B`
 *    拓扑本身是判据（`sampleProblems()` 在每一格里先跑）：根被挪进一个 `.team` 底下 ⇒ 红，不静默放过。
 *
 * 🔴 删除纪律：这里**不删**任何东西（删除只允许在运行根里，见 `root-guard.mjs::assertDeletable`）。
 *    同一个 `RUN_ID` 重复跑只覆盖种子文件；不同 `RUN_ID` 各留一棵小树（与 `_runs` 同一种账）。
 *
 * 这个模块**不 import 生产实现**：oracle / 对照 / 刀都是本文件自己写的第二读者。
 * 它只在 `tests/**` 里被 import（用例 + `static/roles.test.mjs` 的 `REV-02` 夹具基数），不进分母。
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { ENV, PATHS, optionalEnv } from './env.mjs'

// ── 路径口径 ────────────────────────────────────────────────────────────────
/** 比较用的形状：小写 + 正斜杠 + 去尾斜杠（与契约 §1.1 的 `norm` 同形；不碰盘）。 */
export function normKey(p) {
  let s = String(p ?? '').replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s.toLowerCase()
}

/** 盘符（只认 `X:`；UNC / 相对 ⇒ null）。 */
export function driveOf(p) {
  const m = /^([A-Za-z]):/.exec(String(p ?? ''))
  return m === null ? null : `${m[1].toUpperCase()}:`
}

/** `child` 是否在 `parent` 之下（含相等）。只给拓扑自检用，判据本体不用它。 */
export function isUnderPath(child, parent) {
  const c = normKey(child)
  const p = normKey(parent)
  return c === p || c.startsWith(`${p}/`)
}

/** canonical：先 resolve，盘上存在再 realpath（与生产 `canonicalPath` 同形）。 */
export function canonicalOf(p) {
  const resolved = path.resolve(p)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

/**
 * **oracle：落点属于哪棵树的 office** —— `p` 的最近一个名字恰好是 `.team` 的祖先目录（含 `p` 自己）。
 * 按**路径分量**判，不要求那个目录存在（契约 §1.3；理由：写入的是新文件，老口径也不要求它存在）。
 * @returns {string|null} 正斜杠绝对路径；没有 ⇒ null
 */
export function officeOfPath(p) {
  const parts = String(p ?? '').replace(/\\/g, '/').split('/')
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    if (parts[i].toLowerCase() === '.team') return parts.slice(0, i + 1).join('/')
  }
  return null
}

/** **oracle：会话头 cwd 的 office** —— 最近 `.team` 祖先；没有 ⇒ `<cwd>/.team`。 */
export function headerOfficeOf(cwd) {
  return officeOfPath(canonicalOf(cwd)) ?? canonicalOf(path.resolve(cwd, '.team'))
}

/**
 * **oracle：拒绝时「它本该在哪」** —— `landing` 往上最近一个**自己有 `.team` 子目录**的目录 + `/.team`。
 * 找不到 ⇒ null（报文必须说清"找不到带 `.team` 的树"）。
 */
export function expectedOfficeOf(landing) {
  const parts = String(landing ?? '').replace(/\\/g, '/').split('/')
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    const dir = parts.slice(0, i + 1).join('/')
    const candidate = `${dir}/.team`
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
  }
  return null
}

/** 树的确定性摘要（相对路径 + 每个文件 sha256 + 汇总）—— 只给读数用，不当判据。 */
export function digestOf(root) {
  const abs = canonicalOf(root)
  if (!existsSync(abs)) return { path: abs, exists: false, files: 0, sha256: null }
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) files.push({ rel: path.relative(abs, full).replace(/\\/g, '/'), bytes: st.size, sha256: createHash('sha256').update(path.relative(abs, full)).update('\u0000').update(String(st.size)).digest('hex') })
    }
  }
  walk(abs)
  const digest = createHash('sha256')
  for (const f of files) digest.update(`${f.rel}\u0000${f.bytes}\u0000${f.sha256}\n`, 'utf8')
  return { path: abs, exists: true, files: files.length, sha256: digest.digest('hex') }
}

// ── 夹具拓扑 ────────────────────────────────────────────────────────────────
/** 运行 id（`AGENIA_TEST_RUN_ROOT` 的 basename）—— 不 import `evidence.mjs`（那会拖进注册表/发现器）。 */
export function officeRunId() {
  const raw = optionalEnv(ENV.RUN_ROOT)
  if (raw === null) throw new Error(`ENV-MISSING: ${ENV.RUN_ROOT} —— OFB 的夹具根按运行 id 分账，缺了就不开工`)
  return path.basename(path.resolve(raw))
}

/**
 * 夹具根：**仓库之外**（`<repo 的父目录>/.agenia-office-fixtures/<RUN_ID>`），同一个盘符。
 * 形状的来历见文件头（运行根在 `.team` 里面 ⇒ 拒绝那两格造不出来）。
 */
export function officeFixtureRoot() {
  return path.join(path.dirname(PATHS.repo), '.agenia-office-fixtures', officeRunId())
}

/**
 * 建（幂等）两棵临时树：
 *   `<root>/A/.team/review/{seed.md}`   ← 假会话的 `header.cwd` 指向 A
 *   `<root>/B/.team/review/{seed.md}` · `<root>/B/src/keep.js`
 * @returns {{root:string, a:string, b:string, aOffice:string, bOffice:string, seeds:string[]}}
 */
export function ensureOfficeFixtures() {
  const root = officeFixtureRoot()
  // 落点自检：必须在仓库之外、同盘、祖先链上没有 `.team` —— 这几条是"这棵树代表生产"的前提。
  if (isUnderPath(root, PATHS.repo)) throw new Error(`OFB 夹具根不许落在工作区里：${root} ⊂ ${PATHS.repo}`)
  if (driveOf(root) !== driveOf(PATHS.repo)) throw new Error(`OFB 夹具根必须与工作区同盘（C 盘红线）：${root}`)
  if (officeOfPath(root) !== null) throw new Error(`OFB 夹具根的祖先里已经有 .team（拒绝那两格会变放行）：${officeOfPath(root)}`)
  const a = path.join(root, 'A')
  const b = path.join(root, 'B')
  const aOffice = path.join(a, '.team')
  const bOffice = path.join(b, '.team')
  for (const dir of [path.join(aOffice, 'review'), path.join(bOffice, 'review'), path.join(b, 'src')]) {
    mkdirSync(dir, { recursive: true })
  }
  const seeds = [
    path.join(aOffice, 'review', 'seed.md'),
    path.join(bOffice, 'review', 'seed.md'),
    path.join(b, 'src', 'keep.js'),
  ]
  for (const file of seeds) {
    if (!existsSync(file)) writeFileSync(file, `OFB 夹具种子（${path.basename(file)}）—— 只用来证明这棵树不是空壳。\n`, 'utf8')
  }
  return { root, a, b, aOffice, bOffice, seeds }
}

/**
 * **样本下限 / 拓扑自检**（每一格都先跑）：空样本必须红，拓扑被挪走也必须红。
 * 返回 `[code, message]` 清单 —— 调用方把它们推进 `problems`。
 */
export function sampleProblems(fx) {
  const out = []
  const need = (ok, code, message) => { if (!ok) out.push([code, message]) }
  need(fx !== null && typeof fx === 'object', 'OFFB-SAMPLE-MISSING', '夹具对象没建出来（before() 挂了？）')
  if (fx === null || typeof fx !== 'object') return out
  need(existsSync(fx.root), 'OFFB-SAMPLE-ROOT', `夹具根不在：${fx.root}`)
  need(existsSync(fx.a) && existsSync(fx.b), 'OFFB-SAMPLE-TREES', `两棵临时树不在：${fx.a} / ${fx.b}`)
  for (const office of [fx.aOffice, fx.bOffice]) {
    need(existsSync(office) && statSync(office).isDirectory(), 'OFFB-SAMPLE-OFFICE', `临时树里没有 .team 目录：${office}`)
  }
  for (const seed of fx.seeds ?? []) need(existsSync(seed), 'OFFB-SAMPLE-SEED', `种子文件不在（空壳样本不算样本）：${seed}`)
  const ancestor = officeOfPath(fx.root)
  need(ancestor === null, 'OFFB-SAMPLE-TOPOLOGY', `夹具根的祖先里出现了 .team：${ancestor} —— 拒绝那两格会静默变放行（契约 §三）`)
  need(!isUnderPath(fx.root, PATHS.repo), 'OFFB-SAMPLE-IN-REPO', `夹具根落在工作区里：${fx.root} ⊂ ${PATHS.repo}`)
  need(driveOf(fx.root) !== 'C:', 'OFFB-SAMPLE-C-DRIVE', `夹具根落在 C 盘：${fx.root}（硬红线）`)
  return out
}

// ── 阳性对照：照契约写的最小实现（**不是**生产代码，也不 import 生产代码）──────────
/**
 * 判定函数的**函数体**（生成器）。每把刀改的是**一个开关**，其余逐字相同 ——
 * 这样"翻面集"只可能来自那一处（读数里记 `knife.body_delta`）。
 *
 * 只用 `resolve` / `join` / `isAbsolute` / `existsSync` / `realpathSync` —— 这五样在被插入的两份文件
 * （生产 `inject.js` 与本模块的对照）里都有，所以同一段 body 两边都能跑。
 *
 * @param {{rule?:'office'|'header', relativeBase?:'header'|'process', dropDriveGuard?:boolean,
 *          dropEmptyGuard?:boolean, dropCwdGuard?:boolean, nullExpected?:boolean, substringBoltOn?:boolean}} [opts]
 * @returns {string} 直接塞进 `function officeLandingVerdict(target, agent) { … }` 的花括号里
 */
export function decisionBody(opts = {}) {
  const {
    rule = 'office',
    relativeBase = 'header',
    dropDriveGuard = false,
    dropEmptyGuard = false,
    dropCwdGuard = false,
    nullExpected = false,
    substringBoltOn = false,
  } = opts
  const lines = [
    "  const norm = (p) => { let s = String(p ?? '').replace(/\\\\/g, '/'); while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1); return s.toLowerCase() }",
    "  const canon = (p) => { const r = resolve(p); try { return realpathSync.native(r) } catch (err) { return r } }",
    "  const driveOf = (p) => { const m = /^([A-Za-z]):/.exec(String(p ?? '')); return m === null ? null : m[1].toUpperCase() + ':' }",
    "  const partsOf = (p) => String(p ?? '').replace(/\\\\/g, '/').split('/')",
    "  const officeOf = (p) => { const parts = partsOf(p); for (let i = parts.length - 1; i >= 1; i -= 1) { if (parts[i].toLowerCase() === '.team') return parts.slice(0, i + 1).join('/') } return null }",
    "  const expectedOf = (landing) => { const parts = partsOf(landing); for (let i = parts.length - 1; i >= 1; i -= 1) { const dir = parts.slice(0, i + 1).join('/'); if (existsSync(dir + '/.team')) return dir + '/.team' } return null }",
    "  const headerOfficeOf = (cwd) => { const hit = officeOf(canon(cwd)); return hit === null ? resolve(cwd, '.team') : hit }",
    "  const headerOf = (agent) => { const raw = agent === null || agent === undefined ? undefined : (agent.session === null || agent.session === undefined ? undefined : (agent.session.header === null || agent.session.header === undefined ? undefined : agent.session.header.cwd)); return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined }",
    "  const refuse = (landing, header) => ({ allow: false, landing, office_root: null, header_office: header, expected_office: null, differs: false, warning: null })",
    '  const cwdRaw = headerOf(agent)',
  ]
  if (dropCwdGuard) lines.push("  const cwd = typeof cwdRaw === 'string' && cwdRaw.trim().length > 0 ? cwdRaw : resolve('.')")
  else lines.push('  if (cwdRaw === undefined) return refuse(null, null)', '  const cwd = cwdRaw')
  lines.push('  const header = headerOfficeOf(cwd)')
  if (dropEmptyGuard) lines.push("  const targetText = typeof target === 'string' ? target : ''")
  else lines.push("  if (typeof target !== 'string' || target.length === 0) return refuse(null, header)", "  const targetText = target")
  lines.push(`  const base = ${relativeBase === 'process' ? "resolve('.')" : 'cwd'}`)
  lines.push('  const landing = canon(resolve(base, targetText))')
  if (!dropDriveGuard) lines.push("  if (driveOf(landing) === 'C:') return refuse(landing, header)")
  if (rule === 'header') {
    lines.push(
      "  const inside = (child, parent) => { const c = norm(child); const p = norm(parent); return c === p || c.startsWith(p + '/') }",
      '  const allow = inside(landing, header)',
      '  return { allow, landing, office_root: header, header_office: header, expected_office: header, differs: false, warning: null }',
    )
  } else {
    lines.push('  const office = officeOf(landing)')
    lines.push(`  const bolted = ${substringBoltOn ? "/(^|[\\\\/])\\.team([\\\\/]|$)/.test(String(targetText))" : 'false'}`)
    lines.push('  const allow = office !== null || bolted')
    lines.push('  const differs = office !== null && norm(office) !== norm(header)')
    lines.push(`  const expected = ${nullExpected ? 'null' : 'office === null ? expectedOf(landing) : null'}`)
    lines.push('  return { allow, landing, office_root: office, header_office: header, expected_office: expected, differs, warning: differs ? \'OFFICE_TREE_DIFFERS\' : null }')
  }
  return lines.join('\n')
}

/**
 * 对照模块的源码：`officeLandingVerdict`（契约 §1.2）+ `landsInOffice`（委托）+ `officeBoundVerdict`
 * （冻结前缀 / 两个码 / `readings` 六字段 / 拒绝报文两个路径）。**最小实现**：没有 shell 之外的任何东西。
 */
export const CONTROL_SOURCE = [
  "/** OFB 阳性对照：照 `.team/test/2026-11-07/CONTRACT-batch14.md` §一 写的最小实现。不是生产代码。 */",
  "import { existsSync, realpathSync } from 'node:fs'",
  "import { resolve } from 'node:path'",
  "const SHELL = ['bash', 'pwsh']",
  "const WRITE_TARGET = { write: 'file_path', edit: 'file_path' }",
  'function officeLandingVerdict(target, agent) {',
  decisionBody({}),
  '}',
  'export function landsInOffice(target, agent) { return officeLandingVerdict(target, agent).allow }',
  'export function officeBoundVerdict(role, toolName, args, agent, officeBoundSet, readings) {',
  "  const bound = officeBoundSet instanceof Set ? officeBoundSet : new Set(Array.isArray(officeBoundSet) ? officeBoundSet : ['review'])",
  "  if (typeof role !== 'string' || !bound.has(role)) return null",
  "  if (SHELL.includes(toolName)) return { code: 'E_GUARD_OFFICE_SHELL', message: '你的岗位（' + role + '）没有命令行。' }",
  '  const key = WRITE_TARGET[toolName]',
  '  if (key === undefined) return null',
  "  const target = args === null || typeof args !== 'object' ? undefined : args[key]",
  '  const verdict = officeLandingVerdict(target, agent)',
  "  if (readings !== null && readings !== undefined && typeof readings === 'object') {",
  '    readings.landing = verdict.landing',
  '    readings.office_root = verdict.office_root',
  '    readings.header_office = verdict.header_office',
  '    readings.expected_office = verdict.expected_office',
  '    readings.differs = verdict.differs',
  '    readings.warning = verdict.warning',
  '  }',
  '  if (verdict.allow) return null',
  '  const prefix = \'你的岗位（\' + role + \'）只能写项目里 .team/ 下面的东西。\'',
  '  if (verdict.landing === null) {',
  '    return { code: \'E_GUARD_OFFICE_WRITE\', message: prefix + \'你这次要写的是「\' + String(target) + \'」，按落点算在你的地盘外面。\' }',
  '  }',
  '  const tail = verdict.expected_office === null',
  '    ? \'往上找不到带 .team 的树（期望的 office 路径判不出来）。\'',
  '    : \'期望的 office 是「\' + verdict.expected_office + \'」。\'',
  "  return { code: 'E_GUARD_OFFICE_WRITE', message: prefix + '落点「' + verdict.landing + '」不在一棵树的 .team 里；' + tail + '要改什么，写成意见交回组长。' }",
  '}',
  '',
].join('\n')

/**
 * 刀的清单。`want` 是**必须翻的码集合**（`OFB-06` 用它比实测翻面集；多一个少一个都算刀翻错了面）。
 * 每一把只改 `decisionBody` 的**一个开关**（`body_delta` 记的是哪一个）——
 * 翻面集因此只可能来自那一处。码名见用例文件头。
 */
export const KNIVES = [
  {
    id: 'K1',
    label: '退化刀（定形 §五.1）：只跟会话头 cwd 的 `.team` 比',
    delta: "rule: 'header'（老 containment；读数仍填，office_root = header office）",
    opts: { rule: 'header' },
    want: ['OFFB-ROW2-WRITE', 'OFFB-ROW2-EDIT', 'OFFB-ROW3-EXPECTED', 'OFFB-ROW3-MESSAGE-EXPECTED'],
  },
  {
    id: 'K2',
    label: '串匹配放行（定形 §三 明令禁止的形状）：raw target 里含 `.team` 就算',
    delta: 'substringBoltOn: true（C 盘闸排在它前面 ⇒ ④-C 不动，只翻相对那条越界）',
    opts: { substringBoltOn: true },
    want: ['OFFB-ROW5-ALLOWED'],
  },
  {
    id: 'K3',
    label: '去掉 C 盘闸',
    delta: 'dropDriveGuard: true',
    opts: { dropDriveGuard: true },
    want: ['OFFB-ROW4-C-DRIVE'],
  },
  {
    id: 'K4',
    label: '相对目标按 process.cwd() 解析（不是会话头 cwd）—— ① 与 ⑤ 都是相对目标',
    delta: "relativeBase: 'process'",
    opts: { relativeBase: 'process' },
    want: [
      'OFFB-ROW1-LANDING', 'OFFB-ROW1-OFFICE', 'OFFB-ROW1-DIFFERS', 'OFFB-ROW1-WARNING',
      'OFFB-ROW1-OFFICE-DIFFERS', 'OFFB-ROW5-LANDING',
    ],
  },
  {
    id: 'K5',
    label: 'expected_office 恒 null（报文少一个路径）',
    delta: 'nullExpected: true',
    opts: { nullExpected: true },
    want: ['OFFB-ROW3-EXPECTED', 'OFFB-ROW3-MESSAGE-EXPECTED'],
  },
  {
    id: 'K6',
    label: '去掉空目标闸 + cwd 不可用闸',
    delta: 'dropEmptyGuard: true · dropCwdGuard: true',
    opts: { dropEmptyGuard: true, dropCwdGuard: true },
    want: ['OFFB-ROW4-EMPTY', 'OFFB-ROW4-CWD'],
  },
]

/**
 * 把 `officeLandingVerdict` 的**函数体**换成 `body`（其余字节一个不动）。
 *
 * 锚：`function officeLandingVerdict(…) {` 的 `{` → **下一行顶格 `}`**（本仓每个顶层函数都这样收尾；
 * 嵌套块的 `}` 是缩进的）。切完做一次**花括号配平**自检（忽略字符串/注释的粗配平）——
 * 配不平 / 锚不在 ⇒ `ok:false`（**尺子红**，不许当成"刀咬了"）。
 * 切错还有一种兜底：副本 import 会失败，调用方必须把它记成 `KNIFE-IMPORT-FAILED`。
 *
 * @param {string} source
 * @param {string} body 不带外层花括号
 * @returns {{ok:boolean, code:string|null, why:string|null, source:string|null}}
 */
export function swapDecisionBody(source, body) {
  const text = String(source)
  const header = /(^|\n)[ \t]*(?:export[ \t]+)?function[ \t]+officeLandingVerdict[ \t]*\([^)]*\)[ \t]*\{/.exec(text)
  if (header === null) {
    return { ok: false, code: 'KNIFE-ANCHOR-MISSING', why: '找不到顶层 `function officeLandingVerdict(...)`（契约 §1.2 冻了这个名字）', source: null }
  }
  const open = header.index + header[0].length - 1
  const closeMatch = /(^|\n)\}[ \t]*(\r?\n|$)/.exec(text.slice(open + 1))
  if (closeMatch === null) {
    return { ok: false, code: 'KNIFE-ANCHOR-UNBALANCED', why: '函数体后面找不到顶格 `}`', source: null }
  }
  const close = open + 1 + closeMatch.index + (closeMatch[1] === '' ? 0 : 1)
  const region = text.slice(open, close + 1)
  let depth = 0
  for (let i = 0; i < region.length; i += 1) {
    if (region[i] === '{') depth += 1
    else if (region[i] === '}') depth -= 1
    if (depth < 0) break
  }
  if (depth !== 0) {
    return { ok: false, code: 'KNIFE-ANCHOR-UNBALANCED', why: `切出来的函数体花括号不配平（depth=${depth}）—— 刀没有落点`, source: null }
  }
  const out = `${text.slice(0, open + 1)}\n${body}\n${text.slice(close)}`
  return { ok: true, code: null, why: null, source: out }
}
