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
 *       `<底座>\.agenia-office-fixtures\<RUN_ID>\A|B`（底座由 `chooseOfficeFixtureBase()` **逐级向上**选）。
 *    拓扑本身是判据（`sampleProblems()` 在每一格里先跑）：根被挪进一个 `.team` 底下 ⇒ 红，不静默放过。
 *
 * 🔴 **F2（技术评审 2026-11-07）· 底座要逐级向上找，搭不起来记 HOLD**：
 *    评审副本住在 `.team/review/<日期>/` 下面 ⇒ `<repo 的父目录>` **自己就在一个 `.team` 里**。
 *    旧版只看这一级、撞上 `.team` 就 `throw` ⇒ `before()` 当场死 ⇒ `OFB-01…08` 一条都没跑
 *    （结算里写成"本批未写 / pending-write"），`REV-02` 拿同一个夹具 ⇒ 替它红 ——
 *    "夹具搭不起来"被读成了"产品坏了"。现在：
 *      · 底座**从 `<repo 的父目录>` 起逐级向上**找第一个"同盘 + 不在工作区里 + 祖先链上没有 `.team`"的
 *        （在活树里选中的仍是 `E:\`，与从前**逐字符同一个落点**）；
 *      · 一个都找不到 / 建不动 ⇒ `ok:false` + 点名的 `problems[]` ⇒ 调用方记 **HOLD**（不是红、不是缺跑）；
 *      · 拓扑仍然是判据：建出来了但根在 `.team` 底下 ⇒ `OFFB-SAMPLE-TOPOLOGY` **红**。
 *    刀：`AGENIA_OFFICE_FIXTURE_BASE=<某个 .team 底下>` ⇒ 上面第 2 条（HOLD 并点名），见
 *    `.team/test/2026-11-08/log.md`。
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
/**
 * 比较用的形状：小写 + 正斜杠 + 去尾斜杠（与契约 §1.1 的 `norm` 同形；不碰盘）。
 *
 * 🔴 为什么不 import 产品导出的 `officeKey`：本模块是**第二读者**，且按本套件的规矩
 *    被测对象只能在用例体内**动态** import（缺面 ⇒ 每格红，而不是整个文件在加载期崩）。
 *    代价是两份实现 —— 所以 `OFL-09` 有一条 `OFL9-KEY` 见证：同一批字符串上
 *    `normKey(x) === mod.officeKey(x)`，两边一分叉那一格就红（不是靠注释约定）。
 */
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
 *
 * 🔴 2026-11-07 gate-4 返修 **N1**：这一条按契约 §1.1 的 `expected_office` 行改过（产物对、oracle 错）：
 *   · 契约写的是「拒绝时……`landing` **往上**……」⇒ ① 它只是**拒绝时**的字段（放行时可为 `null`、不判）；
 *     ② 「往上」= **严格祖先**，landing 自己不算自己的祖先。
 *   旧版从 landing 自己算起 ⇒ 目标**就是** `.team` 目录 / 是一棵树的根时会多给一个 `B/.team`，
 *   而产物（放行 ⇒ `null`；树根 ⇒ 严格祖先里没有 `.team` ⇒ `null`）是对的。
 *   两向的人工校准见 `oracleProblems()`（新格子里每次真跑）。
 */
export function expectedOfficeOf(landing) {
  if (officeOfPath(landing) !== null) return null
  const parts = String(landing ?? '').replace(/\\/g, '/').split('/')
  for (let i = parts.length - 2; i >= 1; i -= 1) {
    const dir = parts.slice(0, i + 1).join('/')
    const candidate = `${dir}/.team`
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
  }
  return null
}

/**
 * **oracle 自己的两向校准**（N1 的落点；`OFB-08` 每次真跑）。
 * 只判"这个函数在契约 §1.1 的两侧各给什么"，不判产物 —— 产物由 `OFB-03/05/08` 的读数对账。
 * @returns {Array<[string, string]>} `[code, message]`
 */
export function oracleProblems(fx) {
  const out = []
  const norm = (p) => normKey(p)
  const teamDir = path.join(fx.b, '.team')
  if (expectedOfficeOf(teamDir) !== null) {
    out.push(['OFFB-OFFICE-ORACLE', `目标**就是** .team 目录时 expected_office 必须是 null（契约 §1.1：拒绝时才有它），实得 ${JSON.stringify(expectedOfficeOf(teamDir))}`])
  }
  if (expectedOfficeOf(fx.b) !== null) {
    out.push(['OFFB-OFFICE-ORACLE', `目标是一棵树的根时 expected_office 必须是 null（「往上」= 严格祖先，根自己没有 .team 祖先），实得 ${JSON.stringify(expectedOfficeOf(fx.b))}`])
  }
  const srcExpected = expectedOfficeOf(path.join(fx.b, 'src', 'x.js'))
  if (norm(srcExpected) !== norm(path.join(fx.b, '.team'))) {
    out.push(['OFFB-OFFICE-ORACLE', `B/src/x.js 的 expected_office 应为 ${path.join(fx.b, '.team')}，实得 ${JSON.stringify(srcExpected)}`])
  }
  // 老越界样例：相对目标按 cwd=A 解析 ⇒ landing = `<A>/x.txt`；它**在** A 这棵树里（严格祖先是 `<A>`，
  // 而有 `.team` 子目录）⇒ expected_office = `A/.team`（"它本该待在 A 的 office 里"）。
  const escapeLanding = path.resolve(fx.a, '.team/review/../../x.txt')
  if (norm(expectedOfficeOf(escapeLanding)) !== norm(path.join(fx.a, '.team'))) {
    out.push(['OFFB-OFFICE-ORACLE', `老越界样例的落点 ${escapeLanding} 的 expected_office 应为 ${path.join(fx.a, '.team')}，实得 ${JSON.stringify(expectedOfficeOf(escapeLanding))}`])
  }
  return out
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
 * **把夹具底座钉死**（只给刀 / 复现用；正常情况下**不许设**）。
 * 名字与语义见 `chooseOfficeFixtureBase()`：一旦钉了就**不走**"逐级向上找 `.team`-free 底座"那条路，
 * 于是"钉在一个 `.team` 底下"就能把 F2 描述的旧形状原样造出来（那一跑必须 HOLD 并点名，不是红、不是缺跑）。
 */
export const OFFICE_FIXTURE_BASE_ENV = 'AGENIA_OFFICE_FIXTURE_BASE'

/**
 * 一个目录能不能当**夹具底座** —— 四个条件，缺一条返回人话（`null` = 可以）。
 * 这四条就是"这两棵临时树代表生产"的前提（同 `sampleProblems()` 那一组，但这里判的是**底座**）。
 *
 * 🔴 第三条是 F2 的病根：底座自己或它的祖先链上出现 `.team` ⇒ `A`/`B` 里那些 `.team` 就不再是
 *    "最近的那一个" ⇒ ③⑤ 的拒绝会静默变放行。评审副本正住在 `.team/review/<日期>/` 下，
 *    所以**底座要逐级向上找**，不能只看 `<repo 的父目录>`。
 */
export function officeFixtureBaseProblem(base, { repo = PATHS.repo } = {}) {
  if (typeof base !== 'string' || base.trim() === '') return '底座是空路径'
  const abs = path.resolve(base)
  if (driveOf(abs) === null) return `底座不是一个带盘符的绝对路径：${abs}`
  if (driveOf(abs) !== driveOf(repo)) return `底座与工作区不同盘（${driveOf(abs)} ≠ ${driveOf(repo)}；C 盘是硬红线）：${abs}`
  if (isUnderPath(abs, repo)) return `底座落在工作区里（${abs} ⊂ ${repo}）`
  const office = officeOfPath(abs)
  if (office !== null) return `底座的祖先链上已经有 .team（${office}）—— 拒绝那两格会静默变放行`
  return null
}

/** 候选底座：从 `from` 起**逐级向上**（`from` 自己算第一个，最后一个是盘根）。 */
export function officeFixtureBaseCandidates(from = path.dirname(PATHS.repo)) {
  const out = []
  let dir = path.resolve(from)
  for (let i = 0; i < 64; i += 1) {
    out.push(dir)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return out
}

/** 这个目录**在一个 git 工作树里**吗（它自己或任一祖先有 `.git`）。**只用于选优**，不是判据。 */
export function insideGitWorkTree(dir) {
  let cur = path.resolve(dir)
  for (let i = 0; i < 64; i += 1) {
    if (existsSync(path.join(cur, '.git'))) return true
    const parent = path.dirname(cur)
    if (parent === cur) return false
    cur = parent
  }
  return false
}

/**
 * **选夹具底座**（`F2`）：第一个「可用 且 不在任何 git 工作树里」的候选；没有就退到第一个可用的；
 * 一个可用的都没有 ⇒ `ok:false` + **点名的原因**（调用方记 HOLD，不许抛、不许让兄弟判据替它红）。
 *
 * 为什么优先"不在 git 工作树里"：底座在一个仓库根上时，`<底座>/.agenia-office-fixtures/…` 会落进
 * **那个仓库的工作树**（评审副本住在 `.team/review/…` 时，逐级向上第一站就是活树 `E:\Harness`）——
 * 夹具会往活树里扔一份没人认领的目录。这条**只影响选优**：两个候选都可用时优先不脏工作树的那个。
 *
 * 读数：`tried[]` 逐条记「哪一级、为什么不用 / 用了」，报里能回推"为什么是这个底座"。
 *
 * @param {{from?:string, repo?:string, pinned?:string|null}} [options]
 * @returns {{ok:boolean, base:string|null, root:string|null, source:string, tried:Array<object>,
 *            code:string|null, message:string|null}}
 */
export function chooseOfficeFixtureBase({ from = path.dirname(PATHS.repo), repo = PATHS.repo, pinned = optionalEnv(OFFICE_FIXTURE_BASE_ENV) } = {}) {
  const tried = []
  if (pinned !== null && String(pinned).trim() !== '') {
    const abs = path.resolve(String(pinned))
    const problem = officeFixtureBaseProblem(abs, { repo })
    tried.push({ base: abs, pinned: true, problem, inside_git_work_tree: insideGitWorkTree(abs) })
    if (problem !== null) {
      return {
        ok: false, base: null, root: null, source: `env:${OFFICE_FIXTURE_BASE_ENV}`, tried,
        code: 'OFFB-FIXTURE-BASE-PINNED-UNUSABLE',
        message: `夹具底座被 ${OFFICE_FIXTURE_BASE_ENV} 钉在 ${abs}，而它不能用：${problem} —— 这一档的夹具搭不起来（HOLD，不是产品坏了）`,
      }
    }
    return { ok: true, base: abs, root: path.join(abs, '.agenia-office-fixtures', officeRunId()), source: `env:${OFFICE_FIXTURE_BASE_ENV}`, tried, code: null, message: null }
  }
  let firstUsable = null
  for (const dir of officeFixtureBaseCandidates(from)) {
    const problem = officeFixtureBaseProblem(dir, { repo })
    const git = insideGitWorkTree(dir)
    tried.push({ base: dir, pinned: false, problem, inside_git_work_tree: git })
    if (problem !== null) continue
    if (firstUsable === null) firstUsable = dir
    if (!git) return { ok: true, base: dir, root: path.join(dir, '.agenia-office-fixtures', officeRunId()), source: 'nearest-.team-free-outside-git', tried, code: null, message: null }
  }
  if (firstUsable !== null) return { ok: true, base: firstUsable, root: path.join(firstUsable, '.agenia-office-fixtures', officeRunId()), source: 'nearest-.team-free', tried, code: null, message: null }
  return {
    ok: false, base: null, root: null, source: 'no-.team-free-base', tried,
    code: 'OFFB-FIXTURE-NO-UNIT-FREE-BASE',
    message: `从 ${from} 逐级向上找不到一个能当夹具底座的目录（要求：同盘、不在工作区里、祖先链上没有 .team）—— 这一档的夹具搭不起来（HOLD，不是产品坏了）`,
  }
}

/**
 * 夹具根 —— 底座的派生（`<底座>/.agenia-office-fixtures/<RUN_ID>`）。
 * ⚠️ 可能为 `null`（底座选不出来时）—— **调用方不许把 null 当路径用**（F2：那是 HOLD，不是红）。
 */
export function officeFixtureRoot({ from = path.dirname(PATHS.repo), repo = PATHS.repo } = {}) {
  const choice = chooseOfficeFixtureBase({ from, repo })
  return choice.root
}

/**
 * 建（幂等）两棵临时树：
 *   `<root>/A/.team/review/{seed.md}`   ← 假会话的 `header.cwd` 指向 A
 *   `<root>/B/.team/review/{seed.md}` · `<root>/B/src/keep.js`
 *
 * 🔴 **不抛**（`F2`，技术评审 2026-11-07 `F2`）：底座选不出来 / 建不动 ⇒ `ok:false` + `problems[]`，
 *    调用方把它记成 **HOLD 并点名**。从前这里在"祖先链上有 `.team`"时直接 `throw`，而那正是
 *    **评审副本的住处** ⇒ 整个文件在 `before()` 里就死了：`OFB-01…08` 一条都没跑（结算里写成
 *    "本批未写"），`REV-02` 拿同一个夹具 ⇒ 替它红。"夹具搭不起来"被读成了"产品坏了"。
 *    ⚠️ **没有放宽判据**：拓扑仍然是判据（`sampleProblems()` 照旧判，建出来但底座不对 ⇒ **红**）；
 *    这里只把"建不出来"与"建出来但不对"分开 —— 前者 HOLD，后者红。
 *
 * @param {{pinned?:string|null, from?:string, repo?:string}} [options]
 * @returns {{ok:boolean, root:string|null, a:string|null, b:string|null, aOffice:string|null,
 *            bOffice:string|null, seeds:string[], choice:object, problems:Array<{code:string,message:string}>}}
 */
export function ensureOfficeFixtures({ pinned, from, repo } = {}) {
  const options = {}
  if (pinned !== undefined) options.pinned = pinned
  if (from !== undefined) options.from = from
  if (repo !== undefined) options.repo = repo
  const choice = chooseOfficeFixtureBase(options)
  const problems = []
  const empty = { ok: false, root: null, a: null, b: null, aOffice: null, bOffice: null, seeds: [], choice, problems }
  if (!choice.ok) {
    problems.push({ code: choice.code ?? 'OFFB-FIXTURE-BASE', message: choice.message ?? '夹具底座选不出来' })
    return empty
  }
  const root = choice.root
  // 落点自检：底座过了，**派生出来的根**再判一次（同一条规则，不是第二份口径）。
  const rootProblem = officeFixtureBaseProblem(root, { repo: options.repo ?? PATHS.repo })
  if (rootProblem !== null) {
    problems.push({ code: 'OFFB-FIXTURE-BASE-UNUSABLE', message: `OFB 夹具根不能用：${root} —— ${rootProblem}` })
    return { ...empty, root, problems }
  }
  const a = path.join(root, 'A')
  const b = path.join(root, 'B')
  const aOffice = path.join(a, '.team')
  const bOffice = path.join(b, '.team')
  const seeds = [
    path.join(aOffice, 'review', 'seed.md'),
    path.join(bOffice, 'review', 'seed.md'),
    path.join(b, 'src', 'keep.js'),
  ]
  try {
    for (const dir of [path.join(aOffice, 'review'), path.join(bOffice, 'review'), path.join(b, 'src')]) {
      mkdirSync(dir, { recursive: true })
    }
    for (const file of seeds) {
      if (!existsSync(file)) writeFileSync(file, `OFB 夹具种子（${path.basename(file)}）—— 只用来证明这棵树不是空壳。\n`, 'utf8')
    }
  } catch (err) {
    problems.push({ code: 'OFFB-FIXTURE-MKDIR', message: `OFB 夹具建不出来（${root}）：${String(err?.message ?? err).slice(0, 240)}` })
    return { ok: false, root, a, b, aOffice, bOffice, seeds, choice, problems }
  }
  return { ok: true, root, a, b, aOffice, bOffice, seeds, choice, problems }
}

/**
 * **样本下限 / 拓扑自检**（每一格都先跑）：空样本必须红，拓扑被挪走也必须红。
 * 返回 `[code, message]` 清单 —— 调用方把它们推进 `problems`。
 *
 * ⚠️ 它判的是**建出来的**夹具（`fx.ok === true`）。`ok === false`（底座选不出来 / 建不动）**不是**这一条：
 *    那是"这一档不适用" ⇒ 调用方记 **HOLD**（见各用例的 `sampleGate`）。这条分工是 F2 的全部要点 ——
 *    "搭不起来"不许走红，否则兄弟判据会替它背红。
 */
export function sampleProblems(fx) {
  const out = []
  const need = (ok, code, message) => { if (!ok) out.push([code, message]) }
  if (fx === null || typeof fx !== 'object' || fx.ok !== true) {
    return [['OFFB-SAMPLE-MISSING', `夹具没建出来（ok=${String(fx === null ? 'null' : fx?.ok)}）—— 这一格没有样本；底座的原因见 ensureOfficeFixtures() 的 problems（那一档记 HOLD，不该走到这里）`]]
  }
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
  // 窄会话那一支（契约 §六）：`strict === true` ⇒ 退回最严的老 containment（只认会话头那棵树的 `.team`）。
  lines.push(
    '  if (strict === true) {',
    "    const insideStrict = (child, parent) => { const c = norm(child); const p = norm(parent); return c === p || c.startsWith(p + '/') }",
    "    const strictBase = resolve(cwd, '.team')",
    '    const allowStrict = insideStrict(landing, strictBase)',
    '    return { allow: allowStrict, landing, office_root: strictBase, header_office: header, expected_office: strictBase, differs: false, warning: null }',
    '  }',
  )
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
 * 对照模块的源码：`officeLandingVerdict`（契约 §1.2）+ `officeBoundVerdict`（冻结前缀 / 两个码 /
 * `readings` 六字段 / 拒绝报文两个路径）+ `narrowVerdict`（窄写范围走 `strict === true`）。
 * 它自带一个 `landsInOffice`（一行委托）只为"最小实现自足" —— **产物里没有这个函数**（2026-11-07
 * `9e744ec` 连同旧 docstring 一起删了），所以这里**不是**在描述产品接线，只是对照自己的零件。
 * **最小实现**：没有 shell 之外的任何东西。
 */
export const CONTROL_SOURCE = [
  "/** OFB 阳性对照：照 `.team/test/2026-11-07/CONTRACT-batch14.md` §一 写的最小实现。不是生产代码。 */",
  "import { existsSync, realpathSync } from 'node:fs'",
  "import { resolve } from 'node:path'",
  "const SHELL = ['bash', 'pwsh']",
  "const WRITE_TARGET = { write: 'file_path', edit: 'file_path' }",
  'function officeLandingVerdict(target, agent, strict) {',
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
  '// 窄权限（契约 §六）：闭三元组 —— 白名单 / 写范围 / 提案拒；写范围走 `officeLandingVerdict(…, true)`。',
  "export const NARROW_PERMISSION = Object.freeze({ tools: Object.freeze(['read', 'write', 'edit']), write_scope: 'team', proposal: 'deny' })",
  "export const NARROW_CODES = Object.freeze({ tool: 'E_GUARD_NARROW_TOOL', write: 'E_GUARD_NARROW_WRITE', proposal: 'E_GUARD_NARROW_PROPOSAL' })",
  'export function narrowVerdict(toolName, args, agent) {',
  "  const name = typeof toolName === 'string' ? toolName : ''",
  "  if (NARROW_PERMISSION.proposal === 'deny' && name === 'proposal_file') return { code: NARROW_CODES.proposal, message: '窄：提案调用被拒。' }",
  '  if (!NARROW_PERMISSION.tools.includes(name)) return { code: NARROW_CODES.tool, message: \'窄：工具不在白名单。\' }',
  '  const key = WRITE_TARGET[name]',
  "  if (NARROW_PERMISSION.write_scope === 'team' && key !== undefined) {",
  "    const target = args === null || typeof args !== 'object' ? undefined : args[key]",
  '    if (!officeLandingVerdict(target, agent, true).allow) return { code: NARROW_CODES.write, message: \'窄：只能写队伍目录。\' }',
  '  }',
  '  return null',
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
 * **窄会话那两格的刀**（契约 §六）。
 *   · `K7`：把 `strict` 当 falsy —— `if (strict === true) {` → `if (false) {`（只改这一处；
 *     strict 那一支还在，只是永远走不到）⇒ **两条**窄腿一起翻（跨树写 / `header.cwd` 在 `.team` 里的
 *     兄弟抽屉写）—— 这两条都是"这道门只认自己那棵树"的两个面。
 *     ⚠️ 2026-11-08：`want` 从一条变两条，因为 `narrowRow()` 补了 `header.cwd` 在 `.team` 里那一格
 *     （组长点名要的形状；`F6`）。
 *   · `K8`：把 strict 的**基**换回"会话头 cwd 的最近 `.team` 祖先"（`strictBase = header`）⇒
 *     **只**翻 `header.cwd` 在 `.team` 里那一格（跨树那一格照样拒：两棵树的 header 都是自己那棵）。
 *     ⇒ 两把刀的分工：`K7` 证明"这道门本身"在咬着，`K8` 证明"基是 cwd 下面那棵"在咬着。
 * 只在**基线成立**（窄会话的跨树写确实被拒）时才有可比对象；基线不成立时调用方记 skip（读数，不加红因）。
 */
export const NARROW_KNIFE = {
  id: 'K7',
  label: '把 strict 当 falsy（`if (strict === true)` → `if (false)`）',
  want: ['OFFB-NARROW-CROSS-TREE', 'OFFB-NARROW-HEADER-INSIDE-TEAM'],
}

/** 窄会话那一格的**第二把**刀（`F6`）：`strictBase = resolve(cwd, '.team')` → `strictBase = header`。 */
export const NARROW_BASE_KNIFE = {
  id: 'K8',
  label: 'strict 的基换回 header（`const strictBase = resolve(cwd, …)` → `const strictBase = header`）',
  want: ['OFFB-NARROW-HEADER-INSIDE-TEAM'],
}

/**
 * 把 strict 分支的**基**换回"会话头 cwd 的最近 `.team` 祖先"（`K8`）。
 * 两种源码各自的那一行（阳性对照 `resolve(cwd, '.team')` · 真源码 `resolve(cwd, OFFICE_DIR)`）都认；
 * 命中 **0** 处 / **> 1** 处 ⇒ `ok:false`（尺子红，不许当成"刀咬了"）。
 */
export function strictBaseOff(source) {
  const text = String(source)
  const re = /const strictBase = resolve\(cwd, (?:'\.team'|OFFICE_DIR)\)/g
  const hits = text.match(re) ?? []
  if (hits.length === 0) {
    return { ok: false, code: 'KNIFE-ANCHOR-MISSING', why: `找不到 \`const strictBase = resolve(cwd, '.team' | OFFICE_DIR)\`（strict 分支的基）`, source: null }
  }
  if (hits.length > 1) {
    return { ok: false, code: 'KNIFE-ANCHOR-AMBIGUOUS', why: `strict 基那一行出现 ${hits.length} 次（必须恰好 1 次）`, source: null }
  }
  const out = text.replace(re, 'const strictBase = header')
  if (out === text) return { ok: false, code: 'KNIFE-NO-CUT', why: '替换没改动一个字节', source: null }
  return { ok: true, code: null, why: null, source: out }
}


/**
 * @param {string} source 真源码或阳性对照
 * @returns {{ok:boolean, code:string|null, why:string|null, source:string|null}}
 */
export function strictOff(source) {
  const text = String(source)
  const needle = 'if (strict === true) {'
  const count = text.split(needle).length - 1
  if (count === 0) {
    return { ok: false, code: 'KNIFE-ANCHOR-MISSING', why: '找不到 `if (strict === true) {`（契约 §六 的那一支）', source: null }
  }
  if (count > 1) {
    return { ok: false, code: 'KNIFE-ANCHOR-AMBIGUOUS', why: `\`if (strict === true) {\` 出现 ${count} 次（必须恰好 1 次）`, source: null }
  }
  const out = text.replace(needle, 'if (false) {')
  if (out === text) return { ok: false, code: 'KNIFE-NO-CUT', why: '替换没改动一个字节', source: null }
  return { ok: true, code: null, why: null, source: out }
}


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
