/**
 * **三册账本的夹具与量具**（`LDG-01`…`LDG-09` 共用）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（下称「契约」）。本文件是测试侧**唯一**的夹具/量具出口：
 * 每一格都从这同一份里造树、跑工具、读 JSON —— 各格自己的刀（只改一处）因此可以互相比对。
 *
 * 🔴 三条纪律（与 `support/decision-ledger.mjs` 同款，理由在那里写全了）：
 *   ① **不重复实现被测的判词**：本文件只负责"造树 / 跑命令 / 读 JSON / 比码集"。
 *      头块怎么解析、页怎么派生、链怎么算，全在 `presets/agenia/bin/决议-check.mjs` 与
 *      `presets/agenia/lib/缺陷折叠.mjs` 里 —— 测试侧再写一份解析器，两边一起错的时候谁也看不见。
 *      唯一的例外是 §4.3 / §8 那几条**静态**判据（"折叠实现只有一份" / "制度文档在注入名单里"）：
 *      它们没有产品侧的实现可调，判据就只能是测试侧读文本（`cand-20261113-0462` 的边界）。
 *   ② **夹具全部落在运行根里**（`<run-root>/three-books/<case>-<tag>/`），**不碰**仓库的 `账本/`。
 *   ③ **期望值是手写的**（取自契约的码表与样本表），不从工具的输出去反推。
 *
 * ⚠️ 2026-11-15 第 2 关：`账本/` 与 `presets/agenia/bin/决议-check.mjs` 都还不存在
 *   ⇒ 每一格的第一次跑都红在 `TOOL-MISSING` / `TREE-MISSING`。**那是 Gate 2 的应有形状**，不是判据坏了。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from './env.mjs'
import { runRoot } from './evidence.mjs'

// ── 冻结常量（契约 §1 / §5.3 / §10.2）──────────────────────────────────────

/** 账本根（相对仓库 / 相对夹具根）。 */
export const LEDGER_REL = '账本'
/** 三册（逐字，次序 = 报告里的次序）。 */
export const BOOKS = Object.freeze(['产品', '缺陷', '构案'])
/** 三张派生页（相对账本根）。 */
export const INDEX_RELS = Object.freeze(BOOKS.map((b) => `${b}/INDEX.md`))
/** 生成标记的两个针（契约 §1.3：只看这两个字面量，措辞自由）。 */
export const INDEX_MARKER_NEEDLES = Object.freeze(['生成物', '决议-check.mjs'])
/** 夹具自己写派生页时用的标记（**判据不认这一行**，只认上面两个针）。 */
export const GEN_MARKER = '<!-- 生成物 · 由 node presets/agenia/bin/决议-check.mjs --op index 生成 · 手改当场红 -->'

/** 检查器 / 折叠库 / 制度文档（契约 §0 / §8）。 */
export const CHECK = path.join(PATHS.repo, 'presets', 'agenia', 'bin', '决议-check.mjs')
export const CENSUS = path.join(PATHS.repo, 'presets', 'agenia', 'bin', 'census.mjs')
export const FOLD_LIB = path.join(PATHS.repo, 'presets', 'agenia', 'lib', '缺陷折叠.mjs')
export const ROSTER_DOC = path.join(PATHS.repo, 'presets', 'agenia', '决策账本.md')
export const CORDIS = path.join(PATHS.repo, 'presets', 'agenia', 'agent.cordis.yml')
export const INJECT_JS = path.join(PATHS.repo, 'presets', 'agenia', 'inject.js')

/** 旧账本（迁移的回滚点，契约 §4.2）。 */
export const OLD_LEDGER = path.join(PATHS.repo, '.team', 'bug', 'ledger.json')
export const ARCHIVE_DIR = path.join(PATHS.repo, '.team', '_archive')

/** 头块键（契约 §2；产品与构案两套，**次序不判**）。 */
export const PRODUCT_KEYS = Object.freeze(['层级', '主题', '日期', '拍板人', '原话', '状态', 'supersedes', 'superseded_by'])
export const SCHEME_KEYS = Object.freeze([...PRODUCT_KEYS, '父', '依据P', '依据bug'])
/** 缺陷事件流的三个 kind（闭集，契约 §3.1）。 */
export const EVENT_KINDS = Object.freeze(['registered', 'assessed', 'disposed'])

/** §5.3 的枚举面（`[dir|file, 后缀]`；新加的文件自动进面）。 */
export const BASIS_SURFACE_RULES = Object.freeze([
  { dir: 'presets/agenia/bin', ext: '.mjs', kind: 'code' },
  { dir: 'presets/agenia/lib', ext: '.mjs', kind: 'code' },
  { file: 'presets/agenia/inject.js', kind: 'code' },
  { dir: 'presets/agenia/team', ext: '.md', kind: 'doc' },
  { dir: 'presets/agenia/job-briefs', ext: '.md', kind: 'doc' },
  { file: 'presets/agenia/说明.md', kind: 'doc' },
])

/** 契约 §4.3-c 的 9 个历史读方（0012 §① 实测）。 */
export const LEDGER_READERS = Object.freeze([
  '.tools/daily-cards.py',
  'presets/agenia/bin/agenia-route.mjs',
  'presets/agenia/lib/dashboard.mjs',
  '.tools/check-notes.mjs',
  'presets/agenia/inject.js',
  'presets/agenia/lib/bug-ledger.mjs',
  'presets/agenia/lib/tickets.mjs',
  '.tools/决议-check.mjs',
  'presets/agenia/lib/cli-inventory.mjs',
])

/**
 * 对账的**三族**（= 缺陷事件的三个 kind，契约 §3.1/§4.2）。
 *
 * 🔴 比对面**不手写字段表**（Gate 3 r4 · 2026-11-15）：按 kind 取「旧台账视图 ∪ 事件视图」的
 * **键宇宙**，逐键比 identical / missing / differing。上一版手写的七字段表已经两次比数据窄
 * （漏 `registered` 四字段、漏 `assessed` 的 fix_sketch / cost）。
 * 测试侧这份是**同一规则的手写实现**（不 import 产品那份）：产品那份把比对面改窄时，
 * 两边的 `kinds.*.keys` 键集合会对不上 ⇒ `FOLD-ORACLE-DISAGREES`（一把刀切"规则"，不切"值"）。
 */
export const ORACLE_KINDS = Object.freeze(['registered', 'assessed', 'disposed'])

/** 旧台账键 → 本族键（改名表；与产品侧同一张，但这里是期望侧手写的）。 */
export const ORACLE_ARCHIVE_RENAMES = Object.freeze({
  registered: Object.freeze({
    id: 'id', kind: 'entry_kind', phenomenon: 'phenomenon', reporter: 'reporter', source: 'source',
    tags: 'tags', how_seen: 'how_seen', evidence: 'evidence', recipe: 'recipe', batch: 'batch',
    finding_refs: 'finding_refs', registered_at: 'at',
  }),
})

// ── 夹具正文 ────────────────────────────────────────────────────────────

const dash = '—'

/** 一条产品决议的正文（契约 §2.1）。`drop` 删一个键；`headerLines` 直接给整段头块。 */
export function productText({ id = '0001', title = '产品口径样张', header = {}, drop = [], headerLines = null, body = null, h1 = null, h1Extra = null }) {
  const merged = {
    层级: '产品',
    主题: title,
    日期: '2026-11-15',
    拍板人: '老板',
    原话: '「产品册要能一眼看懂我要什么」',
    状态: '生效',
    supersedes: dash,
    superseded_by: dash,
    ...header,
  }
  // `header` 里多出来的键（例如产品那条**不该有**的 `父`）也要写进盘上的文件 ——
  // 否则那一格的夹具写出来的是一份合法产品，而用例期望 `PRODUCT-HAS-PARENT`：**期望值在盘上没有对象**
  // （2026-11-15 实测：`product-parent` 那一格实得 []、期望 [PRODUCT-HAS-PARENT]）。
  const keys = headerLines ?? [...new Set([...PRODUCT_KEYS, ...Object.keys(header)])].filter((k) => !drop.includes(k))
  const lines = headerLines ?? keys.map((k) => `${k}: ${merged[k]}`)
  const out = [`${h1 ?? `# 产品 ${id} · ${title}`}`, '', ...lines, '', body ?? '## 需求\n这一份是夹具。\n']
  if (h1Extra !== null) out.push(h1Extra)
  return `${out.join('\n')}\n`
}

/** 一条构案的正文（契约 §2.2）。 */
export function schemeText({
  id = '0012', title = '三册账本', parent = '0001', basisP = ['0001'], basisBug = [dash],
  header = {}, drop = [], headerLines = null, body = null, h1 = null,
}) {
  const merged = {
    层级: '构案',
    主题: title,
    日期: '2026-11-15',
    拍板人: '老板',
    原话: '「这条这样落地」',
    状态: '生效',
    supersedes: dash,
    superseded_by: dash,
    父: parent,
    依据P: basisP.join(','),
    依据bug: basisBug.join(','),
    ...header,
  }
  const lines = headerLines ?? SCHEME_KEYS.filter((k) => !drop.includes(k)).map((k) => `${k}: ${merged[k]}`)
  return [`${h1 ?? `# 构案 ${id} · ${title}`}`, '', ...lines, '', body ?? defaultSchemeBody()].join('\n')
}

/** 构案正文（七节；夹具只判"在不在"，与单册契约 §2.3 同一形状）。 */
export function defaultSchemeBody() {
  return [
    '## ① 背景', '这一份是夹具。', '',
    '## ② 决定', '照契约写。', '',
    '## ③ 复用什么', '没有现成的。', '',
    '## ④ 不复用什么', '不新造一套账。', '',
    '## ⑤ 新增什么', '三件。', '',
    '## ⑥ 公共化时点', '第三次出现时。', '',
    '## ⑦ 反悔条件',
    '| 编号 | 条件 | 触发时动作 | 状态 |',
    '| --- | --- | --- | --- |',
    '| RC-1 | 同概念第 3 处实现 | supersede 到新编号 | 未触发 |',
    '',
  ].join('\n')
}

/** 一条缺陷事件（契约 §3.1）。三种 kind 各一个构造器，免得夹具里手拼错格。 */
export function eventRegistered({ seq = 1, id, at = '2026-11-15T09:00:00+08:00', phenomenon = '夹具现象', entryKind = 'bug', extra = {} }) {
  return { seq, kind: 'registered', id, at, entry_kind: entryKind, phenomenon, ...extra }
}
export function eventAssessed({ seq = 2, id, at = '2026-11-15T10:00:00+08:00', verdict = 'true', extra = {} }) {
  return { seq, kind: 'assessed', id, at, verdict, ...extra }
}
export function eventDisposed({ seq = 3, id, at = '2026-11-15T11:00:00+08:00', value = 'adopted', reason = '夹具处置理由', by = 'leader', extra = {} }) {
  return {
    seq, kind: 'disposed', id, at,
    disposition: { value, reason, by, at },
    ...extra,
  }
}

/** 一天的 JSON（契约 §3.1）。`events` 原样写进去（夹具自己保证 seq）。 */
export function dayFileText({ day, events }) {
  return `${JSON.stringify({ schema: 1, day, events }, null, 2)}\n`
}

/** 旧 `ledger.json` 的一份（对账的 expected 侧；只带对账要的三格 + 折叠要的形状）。 */
export function archiveText(entries) {
  return `${JSON.stringify({
    schema: 1, version: 1, entries, tasks: [], batches: [], severity_samples: [], archived: [],
    created_at: '2026-11-01T00:00:00+08:00', updated_at: '2026-11-15T00:00:00+08:00',
  }, null, 2)}\n`
}

/** 旧台账的一条（对账的 expected 侧；`extra` 原样并进条目 —— `assessment` / `line_decision` / `escalated_at` / `card_red` 也走它）。 */
export function archiveEntry({ id, phenomenon = '夹具现象', value = 'adopted', reason = '夹具处置理由', at = '2026-11-15T11:00:00+08:00', extra = {} }) {
  return { id, kind: 'bug', phenomenon, disposition: { value, reason, by: 'leader', at }, ...extra }
}

/** 从一天的事件里删掉某一条的**一个键**（刀：只动一个键；不改原数组）。 */
export function withoutEventKey(events, { id, kind, key }) {
  return events.map((event) => {
    if (event.id !== id || event.kind !== kind) return event
    if (!Object.prototype.hasOwnProperty.call(event, key)) {
      throw new Error(`夹具里没有 ${id} 的 \`${kind}.${key}\` —— 刀切不到对象`)
    }
    const copy = { ...event }
    delete copy[key]
    return copy
  })
}

/**
 * 工具与 oracle 的 `kinds` 读数是不是**同一张表**（键集合 + 四数 + 记录数）。
 * 这是"一个规则，不是两个"的证人：产品侧把比对面改窄时键集合先对不上。
 */
export function kindTableDiff(toolKinds, oracleKinds) {
  const out = []
  for (const kind of ORACLE_KINDS) {
    const a = toolKinds?.[kind]
    const b = oracleKinds?.[kind]
    if (a === undefined || b === undefined) { out.push({ kind, why: 'kind 不在读数里' }); continue }
    const ak = Object.keys(a.keys ?? {}).sort()
    const bk = Object.keys(b.keys ?? {}).sort()
    if (JSON.stringify(ak) !== JSON.stringify(bk)) out.push({ kind, why: '键集合', tool: ak, oracle: bk })
    for (const field of ['archive_records', 'compared']) {
      if (a[field] !== b[field]) out.push({ kind, field, tool: a[field], oracle: b[field] })
    }
    for (const key of ak) {
      if (b.keys?.[key] === undefined) continue
      for (const field of ['identical', 'missing', 'differing']) {
        if ((a.keys[key]?.[field] ?? null) !== (b.keys[key]?.[field] ?? null)) {
          out.push({ kind, key, field, tool: a.keys[key]?.[field] ?? null, oracle: b.keys[key]?.[field] ?? null })
        }
      }
    }
  }
  return out
}

/** 派工卡正文（契约 §7；H1 → 空行 → 头块 → 空行 → 正文）。 */
export function cardText({ kind = null, product = undefined, scheme = undefined, basis = undefined, headerLines = null, extraHeaderLines = [], body = null }) {
  const lines = ['# 派工卡 · 测试岗', '']
  if (headerLines !== null) lines.push(...headerLines)
  else {
    if (kind !== null) lines.push(`票类: ${kind}`)
    if (product !== undefined) lines.push(`产品: ${product}`)
    if (scheme !== undefined) lines.push(`构案: ${scheme}`)
    if (basis !== undefined) lines.push(`依据: ${basis}`)
    lines.push(...extraHeaderLines)
  }
  if (body !== null) lines.push('', body)
  return `${lines.join('\n')}\n`
}

/** 一份 `依据:` 行的两种合法形状（契约 §5.3）。`kind` = `code` / `doc`。 */
export function basisLine(id, kind = 'code') {
  return kind === 'code' ? `// 依据: ${id}` : `依据: ${id}`
}

/** 一份夹具生产文件（带头注释 + 可选 `依据`）。 */
export function productionFile({ id = '0012', kind = 'code', name = 'sample', without = false }) {
  const basis = without ? '' : `${basisLine(id, kind)}\n`
  if (kind === 'code') return `${basis}// 夹具：${name}\nexport const ${name.replace(/[^\w]/g, '_')} = 1\n`
  return `${basis}# ${name}\n\n夹具正文。\n`
}

// ── 造树 ────────────────────────────────────────────────────────────────

/**
 * 这一格的夹具根（**每次清空**）。删除前两道闸（与 `decision-ledger.sceneRoot` 同一份口径）：
 *   ① 运行根必须有 `.agenia-test-root` marker；
 *   ② 解析后的绝对路径必须在运行根**之下**（不是前缀相等）。
 */
export function sceneRoot(caseId, tag) {
  const base = path.resolve(runRoot())
  const marker = path.join(base, '.agenia-test-root')
  if (!existsSync(marker)) {
    throw new Error(`拒绝清空：${base} 没有运行根 marker（${path.basename(marker)}）—— 不是测试运行根，一个字节都不动`)
  }
  const leaf = `${String(caseId).toLowerCase()}-${String(tag)}`
  const resolved = path.resolve(base, 'three-books', leaf)
  if (resolved !== path.join(base, 'three-books', leaf)) throw new Error(`夹具根不是纯拼出来的：${resolved}`)
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error(`夹具根跑到运行根之外了：${resolved}`)
  rmSync(resolved, { recursive: true, force: true })
  mkdirSync(resolved, { recursive: true })
  return resolved
}

/**
 * 造一棵三册树。
 *
 * @param {{caseId:string, tag:string,
 *          products?: Array<object>, schemes?: Array<object>, days?: Array<{day:string, events:Array}>,
 *          files?: Array<{rel:string, text:string}>,
 *          team?: boolean, presets?: boolean, index?: 'none'|'all'|'产品'|'构案'|'缺陷',
 *          rootExtras?: Array<{rel:string, text:string}>}} spec
 *   `presets:true` ⇒ 造两份夹具生产文件（一份代码 / 一份说明书）—— `LDG-04` 的面上样本。
 *   `index` 给了就**手写**一张派生页（只给"页已在盘上、还没被工具写过"的样本用）。
 */
export function buildScene({
  caseId, tag, products = [], schemes = [], days = [], files = [],
  team = false, presets = false, index = 'none', rootExtras = [], withLedger = true, withoutBooks = [],
}) {
  const root = sceneRoot(caseId, tag)
  const writes = []
  const write = (rel, text) => {
    const file = path.join(root, rel)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text, 'utf8')
    writes.push(rel.replace(/\\/g, '/'))
    return file
  }
  // 三册目录**永远在**（空册也是合法的骨架；要造"某册不在"的样本，用 `withoutBooks` —— 不删，只是不建）。
  if (withLedger) {
    for (const book of BOOKS) {
      if (withoutBooks.includes(book)) continue
      mkdirSync(path.join(root, LEDGER_REL, book), { recursive: true })
    }
  }
  for (const p of products) write(`${LEDGER_REL}/产品/${p.id}-${p.title ?? '产品口径样张'}.md`, productText(p))
  for (const s of schemes) write(`${LEDGER_REL}/构案/${s.id}-${s.title ?? '三册账本'}.md`, schemeText(s))
  for (const d of days) write(`${LEDGER_REL}/缺陷/${d.day}.json`, d.text ?? dayFileText(d))
  if (index === 'all' || index === '产品' || index === '构案' || index === '缺陷') {
    const which = index === 'all' ? [...INDEX_RELS] : [`${index}/INDEX.md`]
    for (const rel of which) write(`${LEDGER_REL}/${rel}`, `${GEN_MARKER}\n\n# ${path.basename(path.dirname(rel))}册（夹具手写页）\n`)
  }
  if (team) mkdirSync(path.join(root, '.team', 'leader', '2026-11-15', 'cards'), { recursive: true })
  if (presets) {
    write('presets/agenia/lib/fixture-a.mjs', productionFile({ id: '0012', kind: 'code', name: 'fixture_a' }))
    write('presets/agenia/team/fixture-manual.md', productionFile({ id: '0012', kind: 'doc', name: '夹具说明书' }))
  }
  for (const f of files) write(f.rel, f.text)
  for (const f of rootExtras) write(f.rel, f.text)
  return { root, writes }
}

/** 往一棵（已建好的）夹具树里补一份文件（造刀的夹具时用；不做根守卫 —— 路径由调用方给）。 */
export function writeSceneFile(root, rel, text) {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
  return file
}

// ── 跑工具（cwd 固定仓库根；临时件由入口的 ENV 管）────────────────────────

function runNode(argv) {
  const r = spawnSync(process.execPath, argv, { cwd: PATHS.repo, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return {
    argv,
    exit: r.status,
    signal: r.signal ?? null,
    spawn_error: r.error === undefined ? null : String(r.error?.code ?? r.error),
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  }
}

/** 子进程读数归一（与 `decision-ledger.summarize` 同一份口径，不 import 它以免两处漂）。 */
export function summarize(run, label) {
  let json = null
  let jsonError = null
  const text = String(run.stdout).trim()
  if (text !== '') {
    try {
      json = JSON.parse(text)
    } catch (err) {
      jsonError = `${err.name}: ${String(err.message).slice(0, 160)}`
    }
  } else if (run.exit === 0) {
    jsonError = 'stdout 是空的（契约 §10：--json 时 stdout 只有 JSON）'
  }
  return {
    label,
    exit: run.exit,
    spawn_error: run.spawn_error,
    stderr_head: String(run.stderr).trim().split(/\r?\n/).slice(0, 4).join('\n').slice(0, 600),
    stdout_head: text.split(/\r?\n/).slice(0, 4).join('\n').slice(0, 600),
    json,
    json_error: jsonError,
  }
}

/** 跑**任意一份**检查器（刀用：副本的路径 + 同一个 `--root`；口径与 `runCheck` 完全一样）。 */
export function runToolAt(tool, root, extra = []) {
  return summarize(runNode([tool, `--root=${root}`, '--json', ...extra]), `${path.basename(tool)} ${extra.join(' ')}`.trim())
}

/** `--op check`（缺省 op）。 */
export function runCheck(root, extra = []) {
  return summarize(runNode([CHECK, `--root=${root}`, '--json', ...extra]), `check ${extra.join(' ')}`.trim())
}
/** `--op init`（建三册骨架 + 三张派生页）。 */
export function runInit(root, extra = []) {
  return summarize(runNode([CHECK, `--root=${root}`, '--json', '--op', 'init', ...extra]), `init ${extra.join(' ')}`.trim())
}
/** `--op index`（重写三张派生页 —— 唯一写页的 op）。 */
export function runIndex(root, extra = []) {
  return summarize(runNode([CHECK, `--root=${root}`, '--json', '--op', 'index', ...extra]), `index ${extra.join(' ')}`.trim())
}
/** `--op fold`（折叠缺陷册）。 */
export function runFold(root, extra = []) {
  return summarize(runNode([CHECK, `--root=${root}`, '--json', '--op', 'fold', ...extra]), `fold ${extra.join(' ')}`.trim())
}
/** `--op reconcile --archive=<旧 ledger.json>`。 */
export function runReconcile(root, { archive, extra = [] }) {
  return summarize(
    runNode([CHECK, `--root=${root}`, '--json', '--op', 'reconcile', `--archive=${archive}`, ...extra]),
    `reconcile --archive=${path.basename(archive)}`,
  )
}
/** `--op gate2-card --card=<路径>`（只判、不落盘）。 */
export function runGate2Card(root, { card, extra = [] }) {
  return summarize(runNode([CHECK, `--root=${root}`, '--json', '--op', 'gate2-card', `--card=${card}`, ...extra]), 'gate2-card')
}
/** `--op card-land --card=… --day=… --role=…`（先落盘、再过闸）。 */
export function runCardLand(root, { card, day = '2026-11-15', role = 'test', extra = [] }) {
  return summarize(
    runNode([CHECK, `--root=${root}`, '--json', '--op', 'card-land', `--card=${card}`, `--day=${day}`, `--role=${role}`, ...extra]),
    'card-land',
  )
}

// ── 读数小工具（与 `decision-ledger.mjs` 同形；那边是单册的出口，这里不 import 它以免两处漂）──

export function codesOf(json) {
  return [...new Set((json?.problems ?? []).map((p) => String(p.code ?? '?')))].sort()
}

export function messagesOf(json) {
  return (json?.problems ?? []).map((p) => String(p.message ?? ''))
}

/**
 * 断言：这一跑**成功解析出 JSON**，且**码集与期望精确相等**（多一个少一个都红）。
 * `codes` 用 `[]` = 必须绿（无 problems）。
 */
export function expectCodes(problems, run, want, push, { label } = {}) {
  const tag = label ?? run.label
  if (run.spawn_error !== null) {
    push('TOOL-MISSING', `[${tag}] 跑不起来（${run.spawn_error}）—— 契约 §0/§10 的入口不在盘上或不可执行`)
    return false
  }
  if (run.json === null) {
    push('JSON-UNPARSEABLE', `[${tag}] --json 的输出解析不了（${run.json_error}）· stdout 头=${JSON.stringify(run.stdout_head)} · stderr=${JSON.stringify(run.stderr_head)}`)
    return false
  }
  const got = codesOf(run.json)
  const expected = [...want].sort()
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    push('CODE-SET-DRIFT', `[${tag}] 码集实得 ${JSON.stringify(got)}，期望 ${JSON.stringify(expected)}`
      + `（报文：${JSON.stringify(messagesOf(run.json).slice(0, 6))}）—— 多报/少报都算没判准`)
    return false
  }
  const wantOk = expected.length === 0
  if (Boolean(run.json.ok) !== wantOk) {
    push('OK-DRIFT', `[${tag}] \`ok\` 实得 ${JSON.stringify(run.json.ok)}，期望 ${JSON.stringify(wantOk)}（码集=${JSON.stringify(got)}）`)
    return false
  }
  const wantExit = wantOk ? 0 : 1
  if (run.exit !== wantExit) {
    push('EXIT-DRIFT', `[${tag}] 退出码实得 ${JSON.stringify(run.exit)}，期望 ${wantExit}（契约 §10：有 problems ⇒ 1）`)
    return false
  }
  return true
}

/** 工具是否在盘上（不在就推一条 `TOOL-MISSING`，返回 false）。 */
export function toolPresent(problems, file, note) {
  if (existsSync(file)) return true
  problems.push({
    code: 'TOOL-MISSING',
    message: `${file} 不在盘上 —— ${note}（契约 §0；Gate 3 之前这一格**必须**红）`,
    detail: { tool: file },
  })
  return false
}

/** 报文里有没有点名这个串（判"点名"那一面用）。 */
export function namedIn(json, needle) {
  return messagesOf(json).some((m) => m.includes(String(needle)))
}

/** 读文本（不在 ⇒ `null`）。 */
export function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** 读 JSON（不在 / 解析不了 ⇒ `{ok:false, json:null, error}`）。 */
export function readJson(file) {
  const text = readText(file)
  if (text === null) return { ok: false, json: null, error: '文件不在', bytes: 0 }
  try {
    return { ok: true, json: JSON.parse(text), error: null, bytes: Buffer.byteLength(text) }
  } catch (err) {
    return { ok: false, json: null, error: `${err.name}: ${String(err.message).slice(0, 160)}`, bytes: Buffer.byteLength(text) }
  }
}

/** 一棵树的确定性摘要（证明跑检查器一个字节都没改）。 */
export function treeDigest(root) {
  const files = []
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) {
        files.push({
          rel: path.relative(root, full).replace(/\\/g, '/'),
          bytes: st.size,
          sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
        })
      }
    }
  }
  walk(root)
  const digest = createHash('sha256').update(files.map((f) => `${f.rel}\u0000${f.sha256}`).join('\n')).digest('hex')
  return { digest, files }
}

// ── 派生页判据（`LDG-01`）─────────────────────────────────────────────────

/** 一份 `INDEX.md` 的生成标记读数（契约 §1.3：首行非空行 + 两个针）。 */
export function indexMarkerReading(text) {
  if (typeof text !== 'string') return { present: false, first_line: null, ok: false }
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const ok = firstLine.trim().startsWith('<!--') && INDEX_MARKER_NEEDLES.every((n) => firstLine.includes(n))
  return { present: true, first_line: firstLine.slice(0, 200), ok }
}

// ── 折叠对账的**测试侧 oracle**（`LDG-05`）──────────────────────────────────
/** 一个值的规范形（对象 / 数组按键排序；`undefined` 与 `null` 同义）。 */
function canonicalFieldValue(value) {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalFieldValue).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalFieldValue(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const hasOwnKey = (value, key) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.prototype.hasOwnProperty.call(value, key)

/** 旧台账一条在某个 kind 下的视图（**只搬键**，不补默认值；presence 是数据）。 */
function oracleArchiveView(entry, kind) {
  const view = {}
  if (entry === null || typeof entry !== 'object') return view
  if (kind === 'registered') {
    for (const [from, to] of Object.entries(ORACLE_ARCHIVE_RENAMES.registered)) {
      if (hasOwnKey(entry, from)) view[to] = entry[from]
    }
    return view
  }
  if (kind === 'assessed') {
    if (!hasOwnKey(entry, 'assessment') || entry.assessment === null) return view
    if (hasOwnKey(entry, 'id')) view.id = entry.id
    for (const [k, v] of Object.entries(entry.assessment)) view[k] = v
    for (const k of ['line_decision', 'escalated_at', 'card_red']) if (hasOwnKey(entry, k)) view[k] = entry[k]
    return view
  }
  if (hasOwnKey(entry, 'id')) view.id = entry.id
  if (hasOwnKey(entry, 'disposition')) {
    view.disposition = entry.disposition
    if (entry.disposition !== null && hasOwnKey(entry.disposition, 'value')) view['历史'] = entry.disposition.value
  }
  return view
}

/** 折叠状态在某个 kind 下的视图（载荷原件在 state 上；disposed 由 disposition + chain 还原）。 */
function oracleEventView(state, kind) {
  if (state === null || typeof state !== 'object') return null
  if (kind === 'registered' || kind === 'assessed') {
    const payload = kind === 'registered' ? state.registered_payload : state.assessed_payload
    if (payload === null || typeof payload !== 'object') return null
    const view = {}
    for (const [k, v] of Object.entries(payload)) {
      if (k === 'seq' || k === 'kind') continue
      view[k] = v
    }
    return view
  }
  if (state.disposition === null || state.disposition === undefined) return null
  const view = { id: state.id, disposition: state.disposition }
  const chain = state.chain ?? { kind: null }
  if (chain.kind === 'legacy') view['历史'] = chain.ref
  if (chain.kind === 'scheme') view['构案'] = chain.ref
  if (chain.kind === 'judged_false') view['判假'] = chain.ref
  return view
}

/** 逐 kind 的键宇宙比对（与产品侧同一规则；期望侧独立实现）。 */
function oracleCompareKind(kind, entries, states, archiveIds, presentIds, archiveUpdatedAt) {
  const want = new Map()
  for (const entry of entries) {
    const view = oracleArchiveView(entry, kind)
    if (Object.keys(view).length > 0) want.set(String(entry.id), view)
  }
  const got = new Map()
  for (const state of states) {
    const view = oracleEventView(state, kind)
    if (view !== null) got.set(String(state.id), view)
  }
  const keys = new Set()
  for (const view of want.values()) for (const k of Object.keys(view)) keys.add(k)
  for (const view of got.values()) for (const k of Object.keys(view)) keys.add(k)
  const table = {}
  for (const k of [...keys].sort()) table[k] = { identical: 0, missing: 0, differing: 0, absent: 0 }
  const diffs = []
  const missingKeys = []
  const missingKinds = []
  const postMigrationKinds = []
  let compared = 0
  for (const id of [...new Set([...want.keys(), ...got.keys()])].sort()) {
    if (!archiveIds.has(id)) continue
    // 整条记录丢了由 `missing` 点名（外层）；族级缺失只在"记录在、这一族不在"时报。
    if (!presentIds.has(id)) continue
    const a = want.get(id)
    const b = got.get(id)
    if (a === undefined) {
      const at = Date.parse(b?.at ?? '')
      if (Number.isFinite(archiveUpdatedAt) && Number.isFinite(at) && at > archiveUpdatedAt) {
        postMigrationKinds.push({ id, kind })
        continue
      }
      missingKinds.push({ id, kind, side: 'archive' })
      continue
    }
    if (b === undefined) {
      missingKinds.push({ id, kind, side: 'event' })
      continue
    }
    compared += 1
    for (const k of keys) {
      const ah = hasOwnKey(a, k)
      const bh = hasOwnKey(b, k)
      if (!ah && !bh) { table[k].absent += 1; continue }
      if (ah !== bh) {
        table[k].missing += 1
        missingKeys.push({ id, kind, field: k, side: ah ? 'event' : 'archive' })
        continue
      }
      if (canonicalFieldValue(a[k]) === canonicalFieldValue(b[k])) { table[k].identical += 1; continue }
      table[k].differing += 1
      diffs.push({ id, kind, field: k, expected: canonicalFieldValue(a[k]), actual: canonicalFieldValue(b[k]) })
    }
  }
  return { kind, archive_records: want.size, event_records: got.size, compared, keys: table, diffs, missing_keys: missingKeys, missing_kinds: missingKinds, post_migration_kinds: postMigrationKinds }
}

/**
 * 独立于工具的一份对账：拿旧台账（expected）与 `--op fold` 出来的 states（actual），**按 kind 比键宇宙**。
 * 🔴 为什么测试要自己算一遍：工具的 `ok` 是**被审方自报**（`cand-20261022-0151`）；
 *    两侧不一致时这一格必须红 `FOLD-ORACLE-DISAGREES`，而不是让"工具说绿"单独成立。
 *    `kinds.*.keys` 的**键集合**也要两边相等：产品侧把比对面改窄（手写回七个字段）时，
 *    键集合会对不上 —— 那是"规则被改窄"的证人，值全对也照样红。
 */
export function reconcileOracle({ entries, states, archiveUpdatedAt = null }) {
  const archiveIds = new Set(entries.map((e) => String(e.id)))
  const stateIds = new Set(states.map((s) => String(s.id)))
  const missingRecords = [...archiveIds].filter((id) => !stateIds.has(id)).sort()
  const extra = [...stateIds].filter((id) => !archiveIds.has(id)).sort()
  const updatedMs = typeof archiveUpdatedAt === 'string' ? Date.parse(archiveUpdatedAt) : Number.NaN
  const postMigration = []
  const unexpected = []
  for (const id of extra) {
    const state = states.find((s) => String(s.id) === id)
    const at = Date.parse(state?.registered_at ?? '')
    if (Number.isFinite(updatedMs) && Number.isFinite(at) && at > updatedMs) postMigration.push({ id, registered_at: state.registered_at })
    else unexpected.push(id)
  }
  const kinds = {}
  const diffs = []
  const missingKindRecords = []
  const missingKeys = []
  for (const kind of ORACLE_KINDS) {
    const result = oracleCompareKind(kind, entries, states, archiveIds, stateIds, updatedMs)
    kinds[kind] = result
    diffs.push(...result.diffs)
    missingKindRecords.push(...result.missing_kinds)
    missingKeys.push(...result.missing_keys)
  }
  return {
    ok: missingRecords.length === 0 && unexpected.length === 0 && diffs.length === 0
      && missingKindRecords.length === 0 && missingKeys.length === 0,
    archive_entries: archiveIds.size,
    folded_states: stateIds.size,
    compared: [...archiveIds].filter((id) => stateIds.has(id)).length,
    missing: missingRecords,
    missing_kind_records: missingKindRecords,
    missing_keys: missingKeys,
    extra: unexpected,
    post_migration: postMigration,
    kinds,
    diffs,
  }
}

// ── 旧台账 / 归档（`LDG-05`）───────────────────────────────────────────────

/** 读旧 `ledger.json`（`.team/bug/ledger.json`）。 */
export function readOldLedger(file = OLD_LEDGER) {
  const r = readJson(file)
  const entries = Array.isArray(r.json?.entries) ? r.json.entries : null
  return { ...r, entries, count: entries?.length ?? 0 }
}

/**
 * 找迁移归档（契约 §4.2：`FOLD-ARCHIVE-MISSING` 的反面）。
 * 口径：`.team/_archive/` **下三层内**的 `*.json`，能解析出 `entries` 数组的那些；
 * 多个候选时优先 **153 条**、其次最新的 mtime。找不到 ⇒ `{ok:false, candidates:[]}`。
 */
export function findArchive({ dir = ARCHIVE_DIR, depth = 3 } = {}) {
  const candidates = []
  const walk = (current, level) => {
    if (level > depth) return
    let names = []
    try {
      names = readdirSync(current).sort()
    } catch {
      return
    }
    for (const name of names) {
      const full = path.join(current, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full, level + 1)
        continue
      }
      if (!name.endsWith('.json')) continue
      const r = readJson(full)
      if (!Array.isArray(r.json?.entries)) continue
      candidates.push({ file: full, entries: r.json.entries.length, mtime: st.mtimeMs })
    }
  }
  walk(dir, 1)
  if (candidates.length === 0) return { ok: false, candidates: [] }
  const full = candidates.find((c) => c.entries === 153) ?? [...candidates].sort((a, b) => b.mtime - a.mtime)[0]
  return { ok: true, file: full.file, entries: full.entries, candidates }
}

// ── 静态判据：折叠实现只有一份（`LDG-05` §4.3）────────────────────────────

const walkFiles = (root, { depth = 4, skip = new Set(['node_modules', '.git', '_archive', '.runtime']) } = {}) => {
  const out = []
  const walk = (dir, level) => {
    if (level > depth) return
    let names = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      if (skip.has(name)) continue
      const full = path.join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full, level + 1)
      else if (st.isFile() && (name.endsWith('.mjs') || name.endsWith('.js') || name.endsWith('.py'))) out.push(full)
    }
  }
  walk(root, 1)
  return out
}

/**
 * `foldBugBook` 在全仓的定义点（契约 §4.3-a）。
 * 认两种写法：`function foldBugBook` / `foldBugBook = (`；测试文件自己不算（`tests/**` 不在这棵树下）。
 */
export function foldImplementationReading({ repo = PATHS.repo } = {}) {
  const roots = ['presets', '.tools']
  const hits = []
  for (const relRoot of roots) {
    for (const file of walkFiles(path.join(repo, relRoot))) {
      const text = readText(file) ?? ''
      const lines = text.split(/\r?\n/)
      lines.forEach((line, idx) => {
        if (/function\s+foldBugBook\s*\(/.test(line) || /(?:const|let|var)\s+foldBugBook\s*=/.test(line)) {
          hits.push({ file: path.relative(repo, file).replace(/\\/g, '/'), line: idx + 1 })
        }
      })
    }
  }
  return { hits, lib: 'presets/agenia/lib/缺陷折叠.mjs' }
}

/** `决议-check.mjs` 有没有 import 折叠库、自己有没有定义一个（契约 §4.3-b）。 */
export function checkToolFoldWiring({ repo = PATHS.repo } = {}) {
  const rel = 'presets/agenia/bin/决议-check.mjs'
  const text = readText(path.join(repo, rel))
  if (text === null) return { present: false, imports_lib: false, local_defs: 0 }
  const importsLib = /from\s+['"][^'"]*缺陷折叠\.mjs['"]/.test(text)
  const localDefs = (text.match(/function\s+foldBugBook\s*\(/g) ?? []).length
  return { present: true, imports_lib: importsLib, local_defs: localDefs }
}

/** 9 个历史读方里，哪几个接上了共享库 / CLI（契约 §4.3-c 的读数；不断言 9/9）。 */
export function readerWiring({ repo = PATHS.repo } = {}) {
  const rows = []
  for (const rel of LEDGER_READERS) {
    const text = readText(path.join(repo, rel))
    if (text === null) {
      rows.push({ rel, present: false, wired: false, how: null })
      continue
    }
    const importsLib = /缺陷折叠\.mjs/.test(text)
    const callsCli = /--op\s+fold|op:?\s*'fold'/.test(text)
    rows.push({ rel, present: true, wired: importsLib || callsCli, how: importsLib ? 'import' : callsCli ? 'cli' : null })
  }
  return { rows, wired: rows.filter((r) => r.wired).length, present: rows.filter((r) => r.present).length }
}

// ── 静态判据：依据面（`LDG-04` / `LDG-08`）──────────────────────────────────

/** §5.3 的生产面（机器枚举；新加的文件自动进面）。 */
export function basisSurface(root) {
  const out = []
  for (const rule of BASIS_SURFACE_RULES) {
    if (rule.file !== undefined) {
      const full = path.join(root, rule.file)
      if (existsSync(full)) out.push({ rel: rule.file, kind: rule.kind })
      continue
    }
    const dir = path.join(root, rule.dir)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(rule.ext)) continue
      const full = path.join(dir, name)
      try {
        if (!statSync(full).isFile()) continue
      } catch {
        continue
      }
      out.push({ rel: `${rule.dir}/${name}`, kind: rule.kind })
    }
  }
  return out
}

/** 一份文件里的 `依据:` 行（第一行；`kind` = code 只认行首注释）。 */
export function basisReading(file, { kind = 'code' } = {}) {
  const text = readText(file)
  if (text === null) return { present: false, line: null, id: null }
  const lines = text.split(/\r?\n/)
  const re = kind === 'code' ? /^\s*(?:\/\/|\*)\s*依据\s*[:：]\s*(\S+)/ : /^\s*依据\s*[:：]\s*(\S+)/
  for (let i = 0; i < lines.length; i += 1) {
    const m = re.exec(lines[i])
    if (m !== null) return { present: true, line: i + 1, id: m[1], text: lines[i].trim().slice(0, 160) }
  }
  return { present: false, line: null, id: null }
}

// ── 静态判据：注入名单（`LDG-09` §8）───────────────────────────────────────

/**
 * 制度文档在不在注入名单里（两处载体都要）+ 文档不是空壳。
 *
 * 🔴 **这一格判配置，不判注入结果**：`scope_line` 是给下一个人读的——
 *    它必须能自己说出"要真会话才算数"，否则这一格的绿会被当成"已经注入了"。
 */
export function injectionReading({ repo = PATHS.repo } = {}) {
  const docFile = path.join(repo, 'presets', 'agenia', '决策账本.md')
  const docText = readText(docFile)
  const docChars = docText === null ? 0 : docText.replace(/\s+/g, '').length
  const cordis = readText(path.join(repo, 'presets', 'agenia', 'agent.cordis.yml'))
  const inject = readText(path.join(repo, 'presets', 'agenia', 'inject.js'))
  const cordisHit = typeof cordis === 'string' ? cordis.split(/\r?\n/).find((l) => /^\s*-\s*决策账本\s*(#.*)?$/.test(l)) ?? null : null
  const injectConst = typeof inject === 'string' ? /DEFAULT_LEADER_ORDER\s*=\s*\[([^\]]*)\]/.exec(inject) : null
  const injectConstHit = injectConst !== null && /'决策账本'|"决策账本"/.test(injectConst[1])
  const rosterLine = typeof inject === 'string'
    ? inject.split(/\r?\n/).find((l) => l.includes('@roster') && l.includes('决策账本=present')) ?? null
    : null
  return {
    doc_present: docText !== null,
    doc_chars: docChars,
    doc_ok: docText !== null && docChars >= 200,
    cordis_hit: cordisHit,
    cordis_ok: cordisHit !== null,
    inject_const_hit: injectConstHit,
    roster_decl_hit: rosterLine,
    roster_decl_ok: rosterLine !== null,
    /** 两处载体都要（契约 §8）。 */
    roster_ok: cordisHit !== null && injectConstHit,
    scope_line: '这一格判配置、不是注入结果：只证明文件在盘上且在注入名单里；'
      + '真起会话读到它要重启客户端后由人点一次（0012 §⑥ · 验收表「注入」那一行）',
  }
}

// ── 拷工具做刀（`LDG-08` 的 K10）────────────────────────────────────────────

/**
 * 把检查器的运行集拷到 `<destRoot>/presets/agenia/{bin,lib}` + `inject.js`
 * —— 刀要在**副本**上切，产品零字节（契约 §11 K10）。
 *
 * 返回 `{root, files}`；调用方自己决定切哪一行（锚点必须恰好 1 处）。
 */
export function copyCheckTool(destRoot, { repo = PATHS.repo } = {}) {
  const out = []
  const copyFile = (rel) => {
    const src = path.join(repo, rel)
    const dst = path.join(destRoot, rel)
    mkdirSync(path.dirname(dst), { recursive: true })
    writeFileSync(dst, readFileSync(src))
    out.push(rel)
  }
  for (const dir of ['bin', 'lib']) {
    const full = path.join(repo, 'presets', 'agenia', dir)
    if (!existsSync(full)) continue
    for (const name of readdirSync(full).sort()) {
      if (!name.endsWith('.mjs')) continue
      copyFile(`presets/agenia/${dir}/${name}`)
    }
  }
  if (existsSync(path.join(repo, 'presets', 'agenia', 'inject.js'))) copyFile('presets/agenia/inject.js')
  return { root: destRoot, files: out }
}

/**
 * 刀：把 `BASIS_EXEMPT_NAMES` 的数组清空（豁免改成"什么都不免"）。
 * 🔴 锚点必须**恰好 1 处**（找不到 / 多于一处 ⇒ 返回 `anchor` 说明，调用方记 `KNIFE-NO-BITE`）。
 */
export function knifeClearExemptNames(copyRoot) {
  const files = []
  for (const dir of ['bin', 'lib']) {
    const full = path.join(copyRoot, 'presets', 'agenia', dir)
    if (!existsSync(full)) continue
    for (const name of readdirSync(full).sort()) if (name.endsWith('.mjs')) files.push(path.join(full, name))
  }
  const hits = []
  const re = /BASIS_EXEMPT_NAMES\s*=\s*\[[^\]]*\]/g
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const m = text.match(re)
    if (m !== null) hits.push({ file, count: m.length, text })
  }
  if (hits.length !== 1 || hits[0].count !== 1) {
    return { ok: false, anchor: hits.map((h) => ({ file: path.basename(h.file), count: h.count })), files: hits.map((h) => h.file) }
  }
  const { file, text } = hits[0]
  writeFileSync(file, text.replace(re, 'BASIS_EXEMPT_NAMES = []'), 'utf8')
  return { ok: true, file, files: [file] }
}
