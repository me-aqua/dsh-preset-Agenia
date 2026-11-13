/**
 * `DEC-05` 的量具 —— **按形状数原子写**（构案 0007 · 史山清查 B2 · Gate 4 round-2）。
 *
 * 契约：`.team/test/2026-11-13/CONTRACT-史山清查-B2.md` §1；本轮口径修订：`.team/test/2026-11-13/PATCH-B2-gate4-口径.md`。
 * 这一份只做四件事：**造夹具树** / **读 `census --json` 的那个概念** / **核允许清单的形状** /
 * **核"这个数盖的是哪些面"**（扫描面 / 排除项 / 地板 / 单位）。
 * 数数本身**不在这里** —— 那是 `.tools` 的活（判据与生成器不许各写一份解析器，契约 §5.3）。
 *
 * 🔴 口径（一轮修订后的全文；读的人不必回推）：
 *   · **扫描面 = 仓库的代码面，不是 presets 面**：`presets/**\/*.mjs` · `presets/**\/*.js` · `.tools/**\/*.mjs`。
 *     概念名叫「原子写**剩余**实现」（= 这个概念在仓库里还剩几份实现），所以 0 也必须是**全库的 0**。
 *   · **排除项 = 非代码的施工 / 数据区**（`SHAPE_EXCLUSIONS`）：真脑数据根 `presets/agenia/.runtime`、
 *     `.tools/_scratch` / `_backup` / `_staging` / `mount-test` / `__pycache__`。
 *     排除 **必须印在读数上**（`scan_excluded`：被切掉的路径 + 那里有多少份代码文件），
 *     否则读者分不清"没有实现"和"没扫到"。⚠️ 只排**非代码**目录 —— 排掉代码面里的真目录就是缩面。
 *   · **地板是派生的，不是手写的**：`ceil(0.9 × 参照)`，参照 = min(git 跟踪的代码文件数, 盘上数出的代码文件数)。
 *     两个数都随代码走；代码加一份，地板自己跟着动。**不许再出现第二个手写的文件数**（`cand-20261109-0286`）。
 *   · **A 族（手搓文件原子写）** = 临时名上的 `writeFileSync` / `writeFile`，同一份文件里**之后**
 *     有 `renameSync(<同一个临时名>, …)`。**A 族永远不许进允许清单** —— 它就是这一票要清的东西。
 *   · **B 族（只 rename 的临时名）** = `renameSync(<临时名>, …)`，而这一份文件**没有**写那个名字
 *     （`writeFileSync` / `writeFile`）。它可能是合法的（整目录换名 / 清残渣），所以**可以**进允许清单，
 *     但每条要有名（路径 + 行）、有类别、有理由。
 *   · 临时名 = 标识符含 `tmp`（不区分大小写，`bodyTmp` 也算）或右值里有 `.tmp` / `.tmp-` / `agenia-tmp`。
 *   · 数的是**处**（site），不是份数：一个文件两处就是 2。
 *   · `count` = A 处 + 未被允许清单盖住的 B 处。**真树在全库代码面上必须是 0。**
 *   · **单位必须说清盖的是哪些面**：这一行盖两份根（`presets` + `.tools`），所以单位要么全写出来，
 *     要么写"全库 / 仓库级"。"处手搓原子写（presets 面）"这种**名字比面窄**的写法当场红（MF-1）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runCensus, sceneRoot } from './decision-ledger.mjs'

/** 概念名 —— **0007 登记时那一行的名字**（主题 = `原子写剩余实现`；INDEX 的「构案」列靠它派生）。 */
export const SHAPE_CONCEPT = '原子写剩余实现'
/** 计数口径的 token（`COUNT_RULES` 里的新键；Gate 3 落）。 */
export const SHAPE_RULE = 'atomic-write-by-shape'
/** 扫描面（三份 glob：`presets` 两份 + **`.tools` 一份**）。 */
export const SHAPE_SURFACE = Object.freeze(['presets/**/*.mjs', 'presets/**/*.js', '.tools/**/*.mjs'])
/**
 * 扫描面上的**排除项**（非代码的施工 / 数据区；相对 root 的 posix 前缀）。
 *
 * 每一条都在 `.gitignore` 里有来历 —— 它们是"换台机器重跑一次就有"的东西，不是仓库交付的代码：
 *   · `presets/agenia/.runtime` —— 真脑数据根（长期记忆快照 / 报告 / 一次性 scratch）；
 *   · `.tools/_scratch` —— 施工区（各批次量具、证据树、临时现场）；
 *   · `.tools/_staging` —— 执行一 staging（staged preset 镜像、安装/回滚演练副本）；
 *   · `.tools/_backup` —— 替换旧预设时留的整份副本；
 *   · `.tools/mount-test` —— 本机排查脚手架（探针 runner / 无头档补丁）；
 *   · `.tools/__pycache__` —— Python 字节码。
 * 读数必须把它们印出来（`scan_excluded`：路径 + 那里有多少份代码文件），否则面就说不清。
 */
export const SHAPE_EXCLUSIONS = Object.freeze([
  { prefix: 'presets/agenia/.runtime', why: '真脑数据根：记忆快照 / 报告 / 一次性 scratch（换台机器重跑就有），不是代码面' },
  { prefix: '.tools/_scratch', why: '施工区：各批次量具、证据树、临时现场（不进版本库）' },
  { prefix: '.tools/_staging', why: '执行一 staging：staged preset 镜像与安装/回滚演练副本（不进版本库）' },
  { prefix: '.tools/_backup', why: '替换旧预设时留的整份副本（不进版本库）' },
  { prefix: '.tools/mount-test', why: '本机排查脚手架：探针 runner / 无头档补丁（不进版本库）' },
  { prefix: '.tools/__pycache__', why: 'Python 字节码（不进版本库）' },
])
/**
 * 扫描面的**地板比例**（不是文件数）：`floor = ceil(ratio × 参照)`。
 *
 * 为什么是比例而不是手写数：真树今天 `presets` 面 34 份、全代码面 57 份；手写任何一个数，
 * 加一份源码就得改判据（`cand-20261109-0286`）。参照取 `min(git 跟踪数, 盘上数)`：
 *   · 用 git 那一侧 ⇒ 地板随**提交**动（冻结副本 / `--with-staging` 副本里也成立）；
 *   · 取 min ⇒ 本地删掉一份**已跟踪**文件（还没提交）不会把地板抬到盘上够不着的地方（不假红）；
 *   · git 不在 / 不是仓库 ⇒ 退到盘上那一侧（副本场景），读数里写明 `source`。
 * 0.9 留的余量只吸收"两个走法对同一棵树的少量分歧"，不吸收"面被缩掉一半"。
 */
export const SHAPE_SCAN_FLOOR_RATIO = 0.9
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

/** 扫描面盖的那几个根（从 `SHAPE_SURFACE` 现推，不手写第二份）。 */
export const SHAPE_SCOPE_ROOTS = Object.freeze([...new Set(SHAPE_SURFACE.map((g) => g.split('/')[0]))])
/** 单位的"全库"写法（命中任一 ⇒ 不必逐个点根名）。 */
const SHAPE_REPO_WIDE_WORDS = /全库|全仓|全树|整个仓库|仓库级|repo[- ]?wide/i

/** glob → 正则（`**` 吃零段或多段、`*` 段内、`?` 一个字符；与 census 的 `walkGlob` 同语义）。 */
export function shapeGlobToRegExp(glob) {
  const g = String(glob).replace(/\\/g, '/')
  let out = '^'
  for (let i = 0; i < g.length; i += 1) {
    const ch = g[i]
    if (ch === '*') {
      if (g[i + 1] === '*') {
        const slash = g[i + 2] === '/'
        out += slash ? '(?:[^/]+/)*' : '.*'
        i += slash ? 2 : 1
      } else out += '[^/]*'
    } else if (ch === '?') out += '[^/]'
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`${out}$`)
}
const SURFACE_RES = SHAPE_SURFACE.map(shapeGlobToRegExp)

/** 一份相对路径在不在扫描面（三个 glob）里。 */
export function matchesShapeSurface(rel) {
  const p = String(rel).replace(/\\/g, '/')
  return SURFACE_RES.some((re) => re.test(p))
}

/** 一份相对路径在不在排除项下。 */
export function isShapeExcluded(rel) {
  const p = String(rel).replace(/\\/g, '/')
  return SHAPE_EXCLUSIONS.some((e) => p === e.prefix || p.startsWith(`${e.prefix}/`))
}

/** 一条排除项下有几份代码文件（判据侧自己的走法；用来核读数里的 `files` 数）。 */
export function countShapeCodeFilesUnder(root, prefix) {
  const base = path.join(root, ...String(prefix).split('/'))
  let n = 0
  const walk = (abs) => {
    let entries = []
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const child = path.join(abs, e.name)
      if (e.isDirectory()) walk(child)
      else if (e.isFile() && matchesShapeSurface(path.relative(root, child))) n += 1
    }
  }
  if (existsSync(base)) walk(base)
  return n
}

/**
 * **判据侧自己的扫描面走法**（不复用 census 的 walker —— 那样两个走法一起坏就没人看得见）。
 *
 * @returns {{root:string, files:string[], excluded:Array<{prefix:string, files:number}>, total:number}}
 *   `files` = 会进扫描面的代码文件（相对 posix，升序）；
 *   `excluded` = 被切掉的路径 + 那里有多少份代码文件（**读数必须印出来**的那一格）。
 */
export function shapeSurfaceReading(root) {
  const base = path.resolve(root)
  const files = []
  const walk = (abs) => {
    let entries = []
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const child = path.join(abs, e.name)
      const rel = path.relative(base, child).replace(/\\/g, '/')
      if (isShapeExcluded(rel)) continue
      if (e.isDirectory()) walk(child)
      else if (e.isFile() && matchesShapeSurface(rel)) files.push(rel)
    }
  }
  for (const top of SHAPE_SCOPE_ROOTS) {
    const abs = path.join(base, ...top.split('/'))
    if (existsSync(abs)) walk(abs)
  }
  const excluded = SHAPE_EXCLUSIONS
    .filter((e) => existsSync(path.join(base, ...e.prefix.split('/'))))
    .map((e) => ({ prefix: e.prefix, files: countShapeCodeFilesUnder(base, e.prefix) }))
  return { root: base, files: files.sort(), excluded, total: files.length }
}

/** git 跟踪 ∩ 扫描面（排掉排除项）。`-z` 免 quoting；`core.quotepath=false` 让中文名不被转义。 */
export function shapeTrackedCodeFiles(root) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], {
    cwd: path.resolve(root), encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  })
  if (r.status !== 0 || typeof r.stdout !== 'string') {
    return { files: null, error: `${r.error?.code ?? ''} ${String(r.stderr ?? '').trim()}`.trim() || `git exit ${JSON.stringify(r.status)}` }
  }
  const files = r.stdout.split('\u0000').filter((s) => s !== '')
    .map((s) => s.replace(/\\/g, '/'))
    .filter((rel) => matchesShapeSurface(rel) && !isShapeExcluded(rel))
  return { files: files.sort(), error: null }
}

/**
 * **派生的地板**（不许再手写文件数）。
 *
 * `参照 = min(git 跟踪数, 盘上数)`（git 那侧拿不到 ⇒ 只用盘上那侧）；`floor = ceil(ratio × 参照)`。
 * @returns {{floor:number, ratio:number, reference:number, source:'git+disk'|'disk',
 *            git:number|null, git_error:string|null, disk:number, presets_only:number, tools_only:number}}
 */
export function shapeScanFloor(root, { surface = null } = {}) {
  const s = surface ?? shapeSurfaceReading(root)
  const tracked = shapeTrackedCodeFiles(root)
  const disk = s.total
  /**
   * git 那侧**0 份 ⇒ 当作拿不到**：夹具根住在仓库里（`.team/` 被 gitignore），
   * 从那个子目录跑 `git ls-files` 只会列出它自己下面被跟踪的文件 —— 0 份不是"代码面是空的"，
   * 而是"这个参照对这一棵树没有意义"。退到盘上那侧，`source` 里写明。
   */
  const usable = tracked.files !== null && tracked.files.length > 0
  const reference = usable ? Math.min(tracked.files.length, disk) : disk
  return {
    floor: Math.ceil(reference * SHAPE_SCAN_FLOOR_RATIO),
    ratio: SHAPE_SCAN_FLOOR_RATIO,
    reference,
    source: usable ? 'git+disk' : 'disk',
    git: usable ? tracked.files.length : null,
    git_error: usable ? null : (tracked.error ?? (tracked.files === null ? null : 'git 那侧 0 份（子目录 / 夹具根，参照不成立）')),
    disk,
    presets_only: s.files.filter((f) => f.startsWith('presets/')).length,
    tools_only: s.files.filter((f) => f.startsWith('.tools/')).length,
  }
}

/** 地板那一句人话（报文 / 读数共用；**来历**必须能读出来）。 */
export function shapeScanFloorText(calc) {
  const side = calc.source === 'git+disk'
    ? `git 跟踪 ${calc.git} 份 / 盘上 ${calc.disk} 份，取较小者`
    : `盘上 ${calc.disk} 份（git 那侧拿不到：${JSON.stringify(calc.git_error ?? null)}）`
  return `下限 ${calc.floor} = ceil(${calc.ratio} × ${calc.reference})（参照：${side}）`
}

/**
 * **单位盖的面对不对**（MF-1：名字 / 单位比它量的面窄 = 同一族病）。
 *
 * 判据从 `SHAPE_SURFACE` 现推（`presets` + `.tools`）：单位要么把每个根都点名，
 * 要么写"全库 / 仓库级"。`处手搓原子写（presets 面）` ⇒ 红。
 */
export function shapeUnitProblems(concept) {
  const out = []
  const push = (code, message) => out.push({ code, message })
  const unit = typeof concept?.unit === 'string' ? concept.unit : ''
  if (unit.trim() === '') {
    push('DEC05-SHAPE-UNIT', `「${SHAPE_CONCEPT}」没有单位 —— 数不带单位就只是一个数`)
    return out
  }
  if (!unit.includes('处')) {
    push('DEC05-SHAPE-UNIT', `「${SHAPE_CONCEPT}」的单位要说清是"处"（实得 ${JSON.stringify(unit)}，rule=${JSON.stringify(concept?.rule)}）—— 单位不写，读的人会把"处"当"份"`)
  }
  const named = SHAPE_SCOPE_ROOTS.filter((r) => unit.includes(r))
  if (!SHAPE_REPO_WIDE_WORDS.test(unit) && named.length !== SHAPE_SCOPE_ROOTS.length) {
    push('DEC05-SHAPE-UNIT-SCOPE', `「${SHAPE_CONCEPT}」的单位 ${JSON.stringify(unit)} 没说清这个数盖的是**哪些**代码面：`
      + `扫描面是 ${JSON.stringify([...SHAPE_SCOPE_ROOTS])}，单位要么把每个根都点名（${SHAPE_SCOPE_ROOTS.map((r) => r).join(' / ')}），`
      + '要么写"全库 / 仓库级"。只写其中一个根 = 名字比面窄：读者会把 0 读成"全库只有一份实现"（MF-1 就是这个病）')
  }
  return out
}

/**
 * **这个 0 是不是"全库的 0"**：`count > 0` ⇒ 红，并**逐处点名**（刀：留一处不改，红必须点出那一处）。
 * `sites` 里还包含被允许清单放行的 B 族，所以点名用算数的那些处（`implementations`）。
 */
export function shapeCountZeroProblems(concept) {
  if (concept === null || concept === undefined) return []
  const count = concept.count
  if (count === 0) return []
  const sites = Array.isArray(concept.sites) ? concept.sites : []
  const impls = Array.isArray(concept.implementations) ? concept.implementations : []
  const label = (pathLine) => {
    const hit = sites.find((s) => `${s.file}:${s.line}` === pathLine)
    return hit === undefined ? String(pathLine) : `${pathLine}（${hit.shape} 族）`
  }
  const where = impls.map(label).join(' · ')
  return [{
    code: 'DEC05-SHAPE-COUNT-ZERO',
    message: `真树还有 ${JSON.stringify(count)} 处手搓原子写（按形状、在**全库代码面**上数的）：${where || '（implementations 为空但 count 非 0）'}`
      + ' —— 这一票要把 A 族接到共享件（合法 B 族进允许清单）；改完这一格才转绿',
  }]
}

/**
 * **排除项与读数对不对得上**（MF-2：面被切掉了什么，必须印出来，而且只许切非代码区）。
 *
 * 四条（每条都能单独翻面）：
 *   ① 读数里有 `scan_excluded`（本轮的契约字段：被切掉的路径 + 代码文件份数）；
 *   ② 每一条排除路径都是**声明过的**排除前缀（偷偷缩面 ⇒ 红）；
 *   ③ 盘上存在、且下面有代码文件的声明前缀，必须**逐条出现在读数里，份数相等**；
 *   ④ 任何一处命中（A / B）都不许落在排除前缀下（排除是为了甩掉非代码区，不是为了藏实现）。
 */
export function shapeExclusionProblems({ root, concept, surface = null }) {
  const out = []
  const push = (code, message) => out.push({ code, message })
  if (concept === null || concept === undefined) return out
  const s = surface ?? shapeSurfaceReading(root)
  const excluded = concept.scan_excluded
  if (!Array.isArray(excluded)) {
    push('DEC05-SHAPE-SCAN-EXCLUDED', `读数里没有 \`scan_excluded\`（被排除的路径 + 那里有多少份代码文件）—— `
      + `"面切掉了什么"不印出来，读者就分不清"没扫到"和"排除掉"（盘上今天有 ${s.excluded.length} 个排除项、`
      + `共 ${s.excluded.reduce((n, e) => n + e.files, 0)} 份代码文件）`)
    return out
  }
  const read = new Map()
  for (const e of excluded) {
    const prefix = typeof e?.path === 'string' ? e.path.replace(/\\/g, '/') : (typeof e?.prefix === 'string' ? e.prefix.replace(/\\/g, '/') : '')
    const files = e?.files
    if (prefix === '') {
      push('DEC05-SHAPE-SCAN-EXCLUDED', `\`scan_excluded\` 里有一条没有路径（实得 ${JSON.stringify(e)}）`)
      continue
    }
    if (!SHAPE_EXCLUSIONS.some((d) => d.prefix === prefix)) {
      push('DEC05-SHAPE-SCAN-EXCLUDED', `\`scan_excluded\` 把 ${JSON.stringify(prefix)} 这块排掉了，而它不是声明过的非代码区：`
        + `只认 ${JSON.stringify(SHAPE_EXCLUSIONS.map((d) => d.prefix))} —— 排掉代码面里的真目录就是缩面（那正是这一票要治的病）`)
    }
    if (!Number.isInteger(files) || files < 0) {
      push('DEC05-SHAPE-SCAN-EXCLUDED', `\`scan_excluded\` 的 ${JSON.stringify(prefix)} 没写"那里有几份代码文件"（实得 ${JSON.stringify(files)}）`)
    }
    read.set(prefix, files)
  }
  for (const e of s.excluded) {
    if (e.files === 0) continue // 空目录：排不排都不影响读数
    if (!read.has(e.prefix)) {
      push('DEC05-SHAPE-SCAN-EXCLUDED', `盘上 ${e.prefix} 下有 ${e.files} 份代码文件，而读数里没有这一条排除项 —— `
        + '要么它们被扫进了面（那是数据/施工区，不是代码），要么被默默排掉了（读者看不出来）')
      continue
    }
    if (read.get(e.prefix) !== e.files) {
      push('DEC05-SHAPE-SCAN-EXCLUDED', `读数说 ${e.prefix} 排掉了 ${JSON.stringify(read.get(e.prefix))} 份，盘上是 ${e.files} 份 —— `
        + '排除项的份数必须现算（排除项的"面"也要可复现）')
    }
  }
  const sites = Array.isArray(concept.sites) ? concept.sites : []
  const hidden = sites.filter((x) => isShapeExcluded(String(x?.file ?? '')))
  if (hidden.length > 0) {
    push('DEC05-SHAPE-SCAN-EXCLUDED', `这些命中落在排除前缀下：${JSON.stringify(hidden.map((x) => `${x.file}:${x.line}`))} —— `
      + '排除是为了甩掉非代码区，不是为了把实现藏起来（A 族/ B 族的每一处都必须在代码面上数得到）')
  }
  return out
}

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
  const fields = ['count', 'implementations', 'unit', 'rule', 'scan', 'scan_empty', 'sites', 'allowlist', 'scanned_files', 'scan_excluded']
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
  const excluded = Array.isArray(concept.scan_excluded) ? concept.scan_excluded : []
  const cut = excluded.reduce((n, e) => n + (Number.isInteger(e?.files) ? e.files : 0), 0)
  return `${concept.count} 处（sites ${sites.length}：A ${sites.filter((s) => s?.shape === 'A').length} / B ${sites.filter((s) => s?.shape === 'B').length}`
    + ` · 允许清单 ${allow.length} 条 · 扫描面 ${concept.scanned_files} 份文件 · 排除 ${excluded.length} 处 / ${cut} 份非代码文件）`
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
