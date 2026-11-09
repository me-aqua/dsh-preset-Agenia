/**
 * `OFL-*`（batch 15 · `bug-20261107-10`）的**夹具拓扑** + **判据侧第二读者（oracle）** + **阳性对照** + **七把刀**。
 *
 * 批次 AM（Gate 2 · `OFL-07`）追加：**读者那四面**（最后一行半截 / 中间行坏 / 干净 / 组合）的阳性对照
 * `READER_CONTROL_SOURCE` 与三把刀 `READER_KNIVES`。它们**不改**上面那份 `CONTROL_SOURCE`
 * （那一份没有 `partial_tail` 的概念，`OFL-06` 的七把刀只在它上面切）。
 *
 * 契约：`.team/test/2026-11-08/CONTRACT-batch15.md`（§一 账本形状 / §二 接口面 / §三 读数 / §四 用例与刀 / §五 边界）。
 * 定形：`.team/leader/2026-11-08/定形-batch15.md`。
 *
 * 🔴 这个模块**不 import 生产实现**：oracle / 阳性对照 / 刀都是本文件自己写的第二读者。
 *    产品只在用例文件里被 import（`importStaged('inject.js')`），本模块的断言函数拿的是"一个模块对象"。
 *
 * 🔴 为什么夹具根**不在运行根里**：运行根按守卫只能落在 `<repo>/.team/test/<日期>/_runs/<ID>`，
 *    它自己就在**真实的** `<repo>/.team` 里面 ⇒ "落点在 `.team` 外 ⇒ 拒"的那一腿造不出来
 *    （`OFL-05` 的第三探针），"异树"也会退化成"同一棵"。⇒ 树建在**仓库之外、祖先链上没有 `.team`** 的
 *    底座下（`chooseOfficeFixtureBase()`，与 batch 14 同一把尺子）。
 *
 * 🔴 删除纪律：这里**不删**任何东西。每格用 `mkdtempSync` 开一个**新**目录 ⇒ 账本天然是空的
 *    （"恰好一行"这句话才有意义）；不同 RUN_ID / 不同格各留一棵小树，与 `_runs` 同一种账。
 *
 * 一行账长什么样、码叫什么、哪一格判哪一条：**只写在契约里**，这里不重复（`cand-20261104-0020`）。
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { PATHS, FROZEN } from './env.mjs'
import {
  chooseOfficeFixtureBase, digestOf, isUnderPath, normKey, officeOfPath, officeRunId,
} from './office-fixtures.mjs'
import { decisionBody } from './office-fixtures.mjs'
import { buildCatalog, importSourceCopy, knifeReplace, withHarness } from './injector-harness.mjs'

// ── 冻结的账本口径（契约 §1.1 / §1.2 / §2.4）────────────────────────────────
/** 账本相对 `<某个 office>` 的路径 —— **冻结**（判据按名取；产品必须导出同名常量）。 */
export const LEDGER_REL = 'state/office-landings.jsonl'
/** 一行的**恰好七个键**（契约 §1.2）。多一个键就是红（`OFL-LINE-KEYS`）。 */
export const LEDGER_KEYS = ['at', 'role', 'tool', 'landing', 'office_root', 'header_office', 'tree_differs']
/** 出现这些键 = 正文进了账（`OFL-LINE-CONTENT`）。 */
export const CONTENT_KEYS = ['content', 'text', 'body', 'patch', 'old_string', 'new_string', 'payload', 'after', 'before']
export const CODES = {
  unwritable: 'E_OFFICE_LEDGER_UNWRITABLE',
  /** 一行**自己**不合契约 §1.2（键集 / 正文键 / 值类型）—— 与 IO 面分开（实现提交拆出来的）。 */
  shape: 'E_OFFICE_LEDGER_SHAPE',
  /** 读方：坏 JSON / 不合形状的行（**中间行**的码；半截尾行另有独有码，见 `HALF_LINE_CODE_CANDIDATE`）。 */
  unreadable: 'E_OFFICE_LEDGER_UNREADABLE',
  guard: 'E_GUARD_OFFICE_LEDGER',
  differs: 'OFFICE_TREE_DIFFERS',
  officeWrite: 'E_GUARD_OFFICE_WRITE',
}
/**
 * 半截尾行**独有码**的候选名（契约 `CONTRACT-f11-judge-kind.md` §1）。
 *
 * 🔴 判据**不钉这个名字**：`OFL-07` 只要求 (a) 的码 ≠ (b) 的 `E_OFFICE_LEDGER_UNREADABLE`、
 *    ≠ `E_OFFICE_LEDGER_SHAPE`、且非空。名字由实现定；这个名字只用于**对照读者**与红报文里的建议。
 */
export const HALF_LINE_CODE_CANDIDATE = 'E_OFFICE_LEDGER_PARTIAL_TAIL'
/** 一次放行的 `write` 正文里放这个标记 —— 账本里**不许**出现它（"不记内容"的阴性对照）。 */
export const CONTENT_MARKER = 'OFL-CONTENT-BODY-MUST-NOT-BE-LOGGED'

// ── 夹具 ────────────────────────────────────────────────────────────────────
/**
 * 建这一次的夹具根（**每格一个新目录**，不删、不复用）：
 *
 *   `<底座>/.agenia-office-ledger/<RUN_ID>/<caseId>-<随机>/`
 *      ├─ `T1/.team/review/seed.md` + `T1/src/keep.js`   ← 一格自己的"会话头那棵树"
 *      ├─ `T2/…`（要几棵给几棵 —— `OFL-04` 需要两个"账本不可写"的现场）
 *      └─ `X/.team/review/seed.md`                        ← "另一棵树"（异树 / 越界的目标）
 *
 * @param {{caseId:string, trees?:number}} input
 * @returns {{ok:boolean, root:string|null, trees:Array<{dir:string,office:string,seeds:string[]}>,
 *            other:{dir:string,office:string,seeds:string[]}|null, choice:object,
 *            problems:Array<{code:string,message:string}>}}
 */
export function ensureLedgerFixtures({ caseId, trees = 1 }) {
  const problems = []
  const choice = chooseOfficeFixtureBase()
  const empty = { ok: false, root: null, trees: [], other: null, choice, problems }
  if (!choice.ok) {
    problems.push({ code: 'OFL-FIXTURE-BASE', message: `夹具底座选不出来：${choice.message ?? ''}` })
    return empty
  }
  let root
  try {
    const parent = path.join(choice.base, '.agenia-office-ledger', officeRunId())
    mkdirSync(parent, { recursive: true })
    root = mkdtempSync(path.join(parent, `${String(caseId).toLowerCase()}-`))
  } catch (err) {
    problems.push({ code: 'OFL-FIXTURE-MKDIR', message: `夹具根建不出来（${choice.base}）：${String(err?.message ?? err).slice(0, 240)}` })
    return empty
  }
  /** 一棵树 = 一个目录 + 它自己的 `.team`（种一份种子，证明这棵树不是空壳）。 */
  const makeTree = (name) => {
    const dir = path.join(root, name)
    const office = path.join(dir, '.team')
    const seeds = [path.join(office, 'review', 'seed.md'), path.join(dir, 'src', 'keep.js')]
    mkdirSync(path.join(office, 'review'), { recursive: true })
    mkdirSync(path.join(dir, 'src'), { recursive: true })
    for (const seed of seeds) writeFileSync(seed, `OFL 夹具种子（${path.basename(seed)}）—— 只用来证明这棵树不是空壳。\n`, 'utf8')
    return { dir, office, seeds }
  }
  try {
    const built = []
    for (let i = 0; i < Math.max(1, trees); i += 1) built.push(makeTree(`T${i + 1}`))
    const other = makeTree('X')
    return { ok: true, root, trees: built, other, choice, problems }
  } catch (err) {
    problems.push({ code: 'OFL-FIXTURE-SEED', message: `夹具建不出来（${root}）：${String(err?.message ?? err).slice(0, 240)}` })
    return { ok: false, root, trees: [], other: null, choice, problems }
  }
}

/**
 * 拓扑 / 样本自检（每一格先跑）：**空样本必须红，拓扑被挪走也必须红**。
 * 与"夹具建不出来"分开：建不出来 ⇒ 调用方记 **HOLD**（`OFL-SAMPLE-MISSING` 不走这一条）。
 * @returns {Array<[string, string]>}
 */
export function ledgerSampleProblems(fx) {
  const out = []
  const need = (ok, code, message) => { if (!ok) out.push([code, message]) }
  if (fx === null || typeof fx !== 'object' || fx.ok !== true) {
    return [['OFL-SAMPLE-MISSING', `夹具没建出来（ok=${String(fx === null ? 'null' : fx?.ok)}）—— 这一格没有样本`]]
  }
  need(existsSync(fx.root), 'OFL-SAMPLE-ROOT', `夹具根不在：${fx.root}`)
  const trees = Array.isArray(fx.trees) ? fx.trees : []
  need(trees.length > 0, 'OFL-SAMPLE-TREES', '一棵临时树都没有')
  for (const tree of trees) {
    need(existsSync(tree.office) && statSync(tree.office).isDirectory(), 'OFL-SAMPLE-OFFICE', `临时树里没有 .team：${tree.office}`)
    for (const seed of tree.seeds) need(existsSync(seed), 'OFL-SAMPLE-SEED', `种子文件不在（空壳样本不算样本）：${seed}`)
  }
  if (fx.other !== null) {
    need(existsSync(fx.other.office), 'OFL-SAMPLE-OFFICE', `另一棵树里没有 .team：${fx.other.office}`)
    for (const seed of fx.other.seeds) need(existsSync(seed), 'OFL-SAMPLE-SEED', `种子文件不在：${seed}`)
  }
  const ancestor = officeOfPath(fx.root)
  need(ancestor === null, 'OFL-SAMPLE-TOPOLOGY', `夹具根的祖先里出现了 .team：${ancestor} —— "异树 / 越界"两腿会静默变成同树/放行`)
  need(!isUnderPath(fx.root, PATHS.repo), 'OFL-SAMPLE-IN-REPO', `夹具根落在工作区里：${fx.root} ⊂ ${PATHS.repo}`)
  need(!/^c:/i.test(fx.root), 'OFL-SAMPLE-C-DRIVE', `夹具根落在 C 盘：${fx.root}（硬红线）`)
  for (const tree of trees) {
    need(!existsSync(ledgerPathOf(tree.office)), 'OFL-SAMPLE-DIRTY', `这一格的账本不是空的（${ledgerPathOf(tree.office)}）—— "恰好一行"这句话就不成立了`)
  }
  return out
}

/** 读数：这一跑量的是哪几棵树（`result.json` 里要能回推）。 */
export function fixtureReadings(fx) {
  return {
    ok: fx === null ? null : fx.ok,
    root: fx === null ? null : fx.root,
    trees: fx === null || fx.ok !== true ? [] : fx.trees.map((tree) => ({ dir: tree.dir, office: tree.office, sha256: digestOf(tree.dir).sha256 })),
    other: fx === null || fx.ok !== true || fx.other === null ? null : { dir: fx.other.dir, office: fx.other.office, sha256: digestOf(fx.other.dir).sha256 },
    base_choice: fx === null ? null : fx.choice?.source ?? null,
    problems: fx === null ? null : fx.problems,
    topology: {
      run_root: process.env.AGENIA_TEST_RUN_ROOT ?? null,
      run_root_ancestor_office: process.env.AGENIA_TEST_RUN_ROOT ? officeOfPath(process.env.AGENIA_TEST_RUN_ROOT) : null,
      note: '运行根在 <repo>/.team 里面 ⇒ "异树 / 越界"只能量在仓库之外的临时树上（契约 §四 夹具）。',
    },
  }
}

// ── 账本的读 / 种（**测试自己**当生产者，这是"读数从账上读"的证明）──────────
/** 账本路径 —— 从**冻结的相对路径**推，不调产品的 `officeLandingLedgerPath`（否则产品算错也会跟自己一致）。 */
export function ledgerPathOf(office) {
  return path.join(String(office), ...LEDGER_REL.split('/'))
}

/** 原样读回（没有 ⇒ `null`）。 */
export function readLedgerText(office) {
  const file = ledgerPathOf(office)
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** 写一份**新**账（覆盖）：`lines` 是对象数组；`raw` 给了就直接写字节（造半行用）。 */
export function seedLedger(office, { lines = [], raw = null } = {}) {
  const file = ledgerPathOf(office)
  mkdirSync(path.dirname(file), { recursive: true })
  const text = raw !== null ? raw : lines.map((line) => `${JSON.stringify(line)}\n`).join('')
  writeFileSync(file, text, 'utf8')
  return file
}

/** 造一行**合法**的账（种子用）。路径由调用方给，键恰好七个。 */
export function ledgerLine({ at = '2026-11-08T00:00:00.000Z', role = 'review', tool = 'write', landing, officeRoot, headerOffice, treeDiffers }) {
  return { at, role, tool, landing, office_root: officeRoot, header_office: headerOffice, tree_differs: treeDiffers === true }
}

/**
 * 判一行账的**值**（契约 §1.2.1 的 V1–V6 + §1.2 的七键闭集）—— oracle 的第二读者，**不 import 产品**。
 *
 * 为什么 oracle 需要它：产品读者用 `OFFICE_LEDGER_ROW_VERDICT` 判"这一行合不合规"，坏行计入
 * `unreadable`；oracle 原来只判"能 JSON.parse + `tree_differs` 是布尔" ⇒ 谁种一行"JSON 合法、值不合规"、
 * 两个读者就会以 `entries` 不一致的样子打架。这里的判词按契约那张表重写（**不是**抄产品的代码）。
 *
 * 返回 `[{ rule, message }]`；空数组 = 合规。`rule` 与产品 `officeLedgerRowRule` 同号
 * （`SHAPE` / `V1`…`V6`），便于红报文说清"哪一条"。
 *
 * @param {object} line
 * @returns {Array<{rule:string, message:string}>}
 */
export function rowValueProblems(line) {
  const fail = (rule, message) => [{ rule, message }]
  if (line === null || typeof line !== 'object' || Array.isArray(line)) return fail('SHAPE', '不是对象')
  const keys = Object.keys(line)
  const missing = LEDGER_KEYS.filter((key) => !keys.includes(key))
  if (missing.length > 0) return fail('SHAPE', `缺键 ${missing.join('/')}`)
  const lower = keys.map((key) => key.toLowerCase())
  const body = CONTENT_KEYS.filter((key) => lower.includes(key))
  if (body.length > 0) return fail('SHAPE', `有正文键 ${body.join('/')}`)
  const extra = keys.filter((key) => !LEDGER_KEYS.includes(key))
  if (extra.length > 0) return fail('SHAPE', `多键 ${extra.join('/')}`)
  // V5 · 类型（七键逐键）
  if (typeof line.at !== 'string') return fail('V5', 'at 不是字符串')
  if (typeof line.role !== 'string') return fail('V5', 'role 不是字符串')
  if (typeof line.tool !== 'string') return fail('V5', 'tool 不是字符串')
  for (const key of ['landing', 'office_root', 'header_office']) {
    if (typeof line[key] !== 'string') return fail('V5', `${key} 不是字符串`)
  }
  if (typeof line.tree_differs !== 'boolean') return fail('V5', 'tree_differs 不是布尔')
  // V3 · 空串（五样）
  for (const key of ['role', 'tool', 'landing', 'office_root', 'header_office']) {
    if (line[key].trim() === '') return fail('V3', `${key} 是空串`)
  }
  // V5 · at 可解析 / tool 枚举
  if (Number.isNaN(Date.parse(line.at))) return fail('V5', 'at 不可解析')
  if (line.tool !== 'write' && line.tool !== 'edit') return fail('V5', 'tool 不是 write/edit')
  // V1 · 绝对（盘符限定 / UNC；根相对也拒）· V4 · 长度
  for (const key of ['landing', 'office_root', 'header_office']) {
    const value = line[key]
    if (!path.isAbsolute(value) || /^[\\/](?![\\/])/.test(value)) return fail('V1', `${key} 不是绝对路径（盘符限定或 UNC）`)
    if (value.length > 4096) return fail('V4', `${key} 超过 4096 字符`)
  }
  // V2 · 在册岗位（`FROZEN.teamRoles` 是 `ROLE_TABLE` 九面的测试侧镜像；**不是** `officeBound` 在编名单）
  if (!FROZEN.teamRoles.includes(line.role)) return fail('V2', 'role 不在在册岗位里')
  // V6 · 跨字段（纯字符串 `normKey`；不碰盘）
  const same = normKey(line.office_root) === normKey(line.header_office)
  if (line.tree_differs !== !same) return fail('V6', 'tree_differs 与两个 office 不一致')
  return []
}

/**
 * **oracle（判据侧第二读者）**：自己解析一遍账本，不复用产品那个读者的任何一行。
 * 口径与契约 §2.2 逐条对齐（`entries` 只数**合规**的；坏 JSON / 值不合规的行进 `unreadable`，不许被吞）。
 *
 * `valueRules`（默认 `true`）：判不判 §1.2.1 的 V1–V6。
 *   · 对**产品**读者：必须判（产品读者就判值）—— 否则"值坏行"在两个读者之间会打架。
 *   · 对 `OFL-06` 的**最小实现**（`CONTROL_SOURCE`，契约 §2 那一层，**不含**值表）：`false` ——
 *     拿值表去要求一个"按契约 §2 写的最小实现"是拿错了尺子；那一层只判"解析得出来"。
 * @param {string} office
 * @param {{valueRules?: boolean}} [options]
 */
export function oracleLedger(office, { valueRules = true } = {}) {
  const file = ledgerPathOf(office)
  const out = { ok: true, path: file, exists: false, entries: 0, same_tree: 0, cross_tree: 0, unreadable: 0, warning: null, reason: null, lines: [], malformed: [] }
  if (!existsSync(file)) return out
  out.exists = true
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    return { ...out, ok: false, reason: `E_OFFICE_LEDGER_UNREADABLE: ${String(err?.code ?? err)}` }
  }
  for (const [index, raw] of String(text).split('\n').entries()) {
    if (raw.trim() === '') continue
    let line = null
    try { line = JSON.parse(raw) } catch { line = undefined }
    if (line === null || line === undefined) {
      out.unreadable += 1
      out.malformed.push({ line: index + 1, raw: raw.slice(0, 120), rules: ['PARSE'] })
      continue
    }
    if (!valueRules) {
      // 最小实现那一层：只判"解析得出来 + `tree_differs` 是布尔"（契约 §2 的读数口径）。
      if (typeof line !== 'object' || Array.isArray(line) || typeof line.tree_differs !== 'boolean') {
        out.unreadable += 1
        out.malformed.push({ line: index + 1, raw: raw.slice(0, 120), rules: ['SHAPE'] })
        continue
      }
    } else {
      const illegal = rowValueProblems(line)
      if (illegal.length > 0) {
        out.unreadable += 1
        out.malformed.push({ line: index + 1, raw: raw.slice(0, 120), rules: illegal.map((p) => p.rule) })
        continue
      }
    }
    out.entries += 1
    if (line.tree_differs === true) out.cross_tree += 1
    else out.same_tree += 1
    out.lines.push(line)
  }
  out.warning = out.cross_tree > 0 ? CODES.differs : null
  if (out.unreadable > 0) {
    out.ok = false
    out.reason = `E_OFFICE_LEDGER_UNREADABLE: ${out.unreadable} 行不合格（不许当成 0 行）`
  }
  return out
}

/** 种子行 / 事件行的**字节**（"只追加"那条判据量的是字节，不是"读过文件"）。 */
export const bytesOf = (text) => createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex')

// ── 行形状（`OFL-LINE-*`）────────────────────────────────────────────────────
/**
 * 判一行账的形状与值。**所有比较都过 `normKey`**（反斜杠 / 大小写不参与判等）。
 * @param {object} line
 * @param {{tool:string, landing:string, officeRoot:string, headerOffice:string, treeDiffers:boolean,
 *          role?:string, marker?:string, already?:string}} want
 * @returns {Array<[string, string]>}
 */
export function lineProblems(line, want) {
  const out = []
  if (line === null || typeof line !== 'object' || Array.isArray(line)) {
    return [['OFL-LINE-SHAPE', `账上那一行不是一个对象：${JSON.stringify(line)?.slice(0, 120)}`]]
  }
  const keys = Object.keys(line)
  const missing = LEDGER_KEYS.filter((k) => !keys.includes(k))
  const extra = keys.filter((k) => !LEDGER_KEYS.includes(k))
  if (missing.length > 0) out.push(['OFL-LINE-KEYS', `账上那一行少了键 ${JSON.stringify(missing)}（契约 §1.2 七个键）实得 ${JSON.stringify(keys)}`])
  if (extra.length > 0) out.push(['OFL-LINE-KEYS', `账上那一行多了键 ${JSON.stringify(extra)}（契约 §1.2 恰好七个键）—— 多出来的键没有地方放正文，也不会被任何判据读到`])
  const bad = CONTENT_KEYS.filter((k) => keys.map((x) => x.toLowerCase()).includes(k))
  if (bad.length > 0) out.push(['OFL-LINE-CONTENT', `账上那一行带了正文类的键 ${JSON.stringify(bad)} —— 定形 §三：账本不是日志倾倒场`])
  if (want.marker !== undefined && want.marker !== null && String(JSON.stringify(line)).includes(String(want.marker))) {
    out.push(['OFL-LINE-CONTENT', `账上那一行里出现了写正文的标记「${want.marker}」—— 只许记落点与两棵树`])
  }
  if (want.role !== undefined && line.role !== want.role) out.push(['OFL-LINE-VALUES', `role 应为 ${JSON.stringify(want.role)}，实得 ${JSON.stringify(line.role)}`])
  if (line.tool !== want.tool) out.push(['OFL-LINE-VALUES', `tool 应为 ${JSON.stringify(want.tool)}，实得 ${JSON.stringify(line.tool)}`])
  if (typeof line.at !== 'string' || Number.isNaN(Date.parse(line.at))) out.push(['OFL-LINE-VALUES', `at 必须是一个可解析的时刻，实得 ${JSON.stringify(line.at)}`])
  if (normKey(line.landing) !== normKey(want.landing)) out.push(['OFL-LINE-VALUES', `landing 应为 ${want.landing}，实得 ${JSON.stringify(line.landing)}`])
  if (normKey(line.office_root) !== normKey(want.officeRoot)) out.push(['OFL-LINE-VALUES', `office_root 应为 ${want.officeRoot}，实得 ${JSON.stringify(line.office_root)}`])
  if (normKey(line.header_office) !== normKey(want.headerOffice)) out.push(['OFL-LINE-VALUES', `header_office 应为 ${want.headerOffice}，实得 ${JSON.stringify(line.header_office)}`])
  if (line.tree_differs !== want.treeDiffers) out.push(['OFL-LINE-VALUES', `tree_differs 应为 ${String(want.treeDiffers)}（office_root ≠ header_office 时才是 true），实得 ${JSON.stringify(line.tree_differs)}`])
  if (want.already !== undefined && want.already !== null && JSON.stringify(line) === want.already) out.push(['OFL-LINE-VALUES', '账上那一行与种子行逐字相同 —— 这次放行没有追加新行'])
  return out
}

/** 一次 guard 调用的读数（`result.json.readings.guard_calls`）。 */
export function callReading(label, guarded) {
  if (guarded === null || guarded === undefined) return { label, mounted: false, allowed: null, reason: null }
  return {
    label,
    mounted: guarded.ok === true,
    allowed: guarded.ok === true && (guarded.reason === undefined || guarded.reason === null),
    reason: guarded.ok === true ? String(guarded.reason ?? '') : String(guarded.why ?? ''),
  }
}

/**
 * 跑一次 `apply()` 并在里面调若干次门禁。`subject.ask(label, call)` 是给行函数用的那一层。
 * @param {{mod:object, config:object, header:object, id:string, catalog:object[], contentDir:string}} subject
 * @param {(h:{ask:Function, logs:string[]}) => Promise<void>} fn
 */
export async function withGuardSubject(subject, fn) {
  await withHarness(subject.mod, {
    contentDir: subject.contentDir,
    config: subject.config,
    header: subject.header,
    id: subject.id,
    catalog: subject.catalog,
  }, async (h) => {
    await h.assemble()
    const ask = (call) => h.guard(call)
    await fn({ ask, logs: h.logs, harness: h })
  })
}

/** 一条假会话（`header.cwd` 决定 `header_office`，`header.toolName` 决定岗位）。 */
export const agentIn = (id, cwd, toolName = 'team_review') => ({ id, session: { header: { cwd, toolName } } })

// ── 阳性对照：照契约写的最小实现（**不是**生产代码，也不 import 生产代码）────
/**
 * 对照的源码。为什么要有它：判据必须证明**自己翻得动面** —— 同一段断言喂给它必须全绿，
 * 否则"红"可能只是判据不可满足（`OFB-06` 的同一课）。
 *
 * 结构：
 *   · `officeLandingVerdict` 的函数体**复用** `decisionBody({})`（batch 14 那一份生成器）——
 *     "落点规则只有一份"这句话在判据侧也成立；
 *   · `recordOfficeLanding` / `officeLandingLedger` / `OFFICE_LANDING_LEDGER_REL` = 契约 §2 的接口面；
 *   · `apply`：注册一个只有"office 边界 + 账本"两条判定的门禁（够本批的量，不多写一条）。
 * 刀的每一把只切**这一份源码**里的一个开关（`KNIVES`）。
 */
export const CONTROL_SOURCE = [
  '/** OFL 阳性对照：照 `.team/test/2026-11-08/CONTRACT-batch15.md` 写的最小实现。不是生产代码。 */',
  "import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'",
  "import { dirname, join, resolve } from 'node:path'",
  '',
  "const WRITE_TARGET = { write: 'file_path', edit: 'file_path' }",
  'const TEAM_TOOL = /^team[_-]([a-z0-9][a-z0-9-]*)$/',
  "export const OFFICE_LANDING_LEDGER_REL = 'state/office-landings.jsonl'",
  '',
  "const norm = (p) => { let s = String(p ?? '').replace(/\\\\/g, '/'); while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1); return s.toLowerCase() }",
  "const partsOf = (p) => String(p ?? '').replace(/\\\\/g, '/').split('/')",
  "const officeOf = (p) => { const parts = partsOf(p); for (let i = parts.length - 1; i >= 1; i -= 1) { if (parts[i].toLowerCase() === '.team') return parts.slice(0, i + 1).join('/') } return null }",
  'function headerOf(agent) {',
  '  const header = agent === null || agent === undefined ? undefined : (agent.session === null || agent.session === undefined ? undefined : agent.session.header)',
  "  const raw = header === null || header === undefined ? undefined : header.cwd",
  "  return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined",
  '}',
  'function roleOf(agent) {',
  '  const header = agent === null || agent === undefined ? undefined : (agent.session === null || agent.session === undefined ? undefined : agent.session.header)',
  '  const name = header === null || header === undefined ? undefined : header.toolName',
  "  const hit = typeof name === 'string' ? TEAM_TOOL.exec(name) : null",
  '  return hit === null ? null : hit[1]',
  '}',
  '',
  'function officeLandingVerdict(target, agent, strict) {',
  decisionBody({}),
  '}',
  '',
  "export function officeLandingLedgerPath(officeRoot) { return join(String(officeRoot), 'state', 'office-landings.jsonl') }",
  '',
  'export function recordOfficeLanding(officeRoot, line) {',
  '  const path = officeLandingLedgerPath(officeRoot)',
  '  try {',
  '    mkdirSync(dirname(path), { recursive: true })',
  '    appendFileSync(path, JSON.stringify(line) + "\\n", "utf8")',
  '    return { ok: true, code: null, path, reason: null }',
  '  } catch (err) {',
  "    return { ok: false, code: 'E_OFFICE_LEDGER_UNWRITABLE', path, reason: String(err?.code ?? 'UNKNOWN') + ': ' + String(err?.message ?? err) }",
  '  }',
  '}',
  '',
  'export function officeLandingLedger(officeRoot) {',
  '  const path = officeLandingLedgerPath(officeRoot)',
  '  const out = { ok: true, path, exists: false, entries: 0, same_tree: 0, cross_tree: 0, unreadable: 0, warning: null, reason: null, lines: [] }',
  '  if (!existsSync(path)) return out',
  '  out.exists = true',
  '  let text = ""',
  '  try { text = readFileSync(path, "utf8") } catch (err) { out.ok = false; out.reason = "E_OFFICE_LEDGER_UNREADABLE: " + String(err?.code ?? err); return out }',
  '  for (const raw of String(text).split("\\n")) {',
  '    if (raw.trim() === "") continue',
  '    let line = null',
  '    try { line = JSON.parse(raw) } catch (err) { line = null }',
  '    if (line === null || typeof line !== "object" || Array.isArray(line) || typeof line.tree_differs !== "boolean") { out.unreadable += 1; continue }',
  '    out.entries += 1',
  '    if (line.tree_differs === true) out.cross_tree += 1',
  '    else out.same_tree += 1',
  '    out.lines.push(line)',
  '  }',
  '  out.warning = out.cross_tree > 0 ? "OFFICE_TREE_DIFFERS" : null',
  '  if (out.unreadable > 0) { out.ok = false; out.reason = "E_OFFICE_LEDGER_UNREADABLE: " + out.unreadable + " 行解析不了" }',
  '  return out',
  '}',
  '',
  "export const BASE_TOOL_SET = ['read', 'write', 'edit']",
  '',
  'export async function apply(ctx, config) {',
  '  const bound = new Set(config !== null && config !== undefined && Array.isArray(config.officeBound) ? config.officeBound : ["review"])',
  '  const tools = ctx.get("tools")',
  '  if (tools === undefined || tools === null || typeof tools.guard !== "function") return',
  '  ctx.effect(() => tools.guard((call) => {',
  '    const name = call === null || call === undefined ? undefined : call.name',
  '    const key = WRITE_TARGET[name]',
  '    if (key === undefined) return undefined',
  '    const args = call.arguments',
  '    const target = args === null || typeof args !== "object" ? undefined : args[key]',
  '    const role = roleOf(call.agent)',
  '    const v = officeLandingVerdict(target, call.agent)',
  '    if (!v.allow) {',
  '      if (role === null || !bound.has(role)) return undefined',
  '      return "E_GUARD_OFFICE_WRITE：你的岗位（" + role + "）只能写项目里 .team/ 下面的东西。落点「" + String(v.landing) + "」不在一棵树的 .team 里。"',
  '    }',
  '    if (v.office_root === null) return undefined',
  '    const line = { at: new Date().toISOString(), role: String(role), tool: name, landing: v.landing, office_root: v.office_root, header_office: v.header_office, tree_differs: v.differs === true }',
  '    const written = recordOfficeLanding(v.header_office, line)',
  '    if (written.ok !== true) {',
  '      console.error("[agenia] E_GUARD_OFFICE_LEDGER：这次写被拒 —— 账写不进去（" + written.path + "）：" + written.reason)',
  '      return "E_GUARD_OFFICE_LEDGER：账写不进去，这次写被拒。账本「" + written.path + "」原因：" + written.reason',
  '    }',
  '    if (line.tree_differs === true) {',
  '      console.error("[agenia] OFFICE_TREE_DIFFERS：这次写的树与会话头不是同一棵（落点「" + line.landing + "」· 那棵树的 office「" + line.office_root + "」· 会话头那棵树的 office「" + line.header_office + "」）—— 放行了，但你确认一下是不是想写这棵树。")',
  '    }',
  '    return undefined',
  '  }), "OFL 控制：office 账本")',
  '}',
  '',
].join('\n')

// ── `OFL-07`（F11 · `partial_tail`）的**阳性对照**与**三把刀** ─────────────────
/**
 * `OFL-07` 的对照读者：照 `.team/test/2026-11-09/CONTRACT-f11-judge-kind.md` §1 写的最小实现。
 *
 * 为什么单独一份、不改 `CONTROL_SOURCE`：那一份的读者（`OFL-06` 的七把刀切它）**只数 `unreadable`**，
 * 没有 `partial_tail` 这个概念。把 F11 的面塞进同一份，会让 `OFL-06` 的七把刀凭空多出一种行为
 * （刀不咬的句子就变成"看起来咬到了"）。⇒ 这一格自带读者：**同一段断言喂给它必须四面全绿**。
 */
export const READER_CONTROL_SOURCE = [
  '/** OFL-07 阳性对照：账本读者（最后一行半截 / 中间行坏 / 干净 / 组合 四面）。不是生产代码。 */',
  "import { existsSync, readFileSync } from 'node:fs'",
  "import { join } from 'node:path'",
  '',
  "export const OFFICE_LANDING_LEDGER_REL = 'state/office-landings.jsonl'",
  '',
  'export function officeLandingLedgerPath(officeRoot) {',
  "  return join(String(officeRoot), 'state', 'office-landings.jsonl')",
  '}',
  '',
  'export function officeLandingLedger(officeRoot) {',
  '  const path = officeLandingLedgerPath(officeRoot)',
  '  const out = { ok: true, path, exists: false, entries: 0, same_tree: 0, cross_tree: 0, unreadable: 0, partial_tail: 0, warning: null, reason: null, lines: [] }',
  '  if (!existsSync(path)) return out',
  '  out.exists = true',
  '  let text = ""',
  '  try { text = readFileSync(path, "utf8") } catch (err) { out.ok = false; out.reason = "E_OFFICE_LEDGER_UNREADABLE: 读不动（" + String(err?.code ?? err) + "）"; return out }',
  '  const raw = String(text).split("\\n")',
  '  const nonEmpty = raw.filter((line) => line.trim() !== "")',
  '  const bad = []',
  '  const partial = []',
  '  for (let index = 0; index < raw.length; index += 1) {',
  '    const line = raw[index]',
  '    if (line.trim() === "") continue',
  '    let row = null',
  '    try { row = JSON.parse(line) } catch { row = null }',
  '    const isLast = index === raw.length - 1',
  '    if (row === null) {',
  '      if (isLast && nonEmpty.length > 1) { partial.push(index + 1); continue }',
  '      out.unreadable += 1',
  '      bad.push(index + 1)',
  '      continue',
  '    }',
  '    if (typeof row !== "object" || Array.isArray(row) || typeof row.tree_differs !== "boolean") { out.unreadable += 1; bad.push(index + 1); continue }',
  '    out.entries += 1',
  '    if (row.tree_differs === true) out.cross_tree += 1',
  '    else out.same_tree += 1',
  '    out.lines.push(row)',
  '  }',
  '  out.warning = out.cross_tree > 0 ? "OFFICE_TREE_DIFFERS" : null',
  '  if (partial.length > 0) {',
  '    out.partial_tail = partial.length',
  '    out.ok = false',
  '    out.reason = "E_OFFICE_LEDGER_PARTIAL_TAIL: 最后一行写了一半（第 " + partial.join("、") + " 行）"',
  '  }',
  '  if (bad.length > 0) {',
  '    out.ok = false',
  '    out.reason = "E_OFFICE_LEDGER_UNREADABLE: " + bad.length + " 行不合格（第 " + bad.join("、") + " 行）"',
  '  }',
  '  return out',
  '}',
  '',
].join('\n')

/**
 * `OFL-07` 的三把刀：**同一段四面断言**喂给切过的读者，必须各翻自己那一面。
 *
 * 刀只切**对照**（`READER_CONTROL_SOURCE`）—— 这一点与 `OFL-06` 的七把刀同一个口径：
 * 判据翻得动面，才谈得上"产品这一面被守住了"。`want` 是**精确集合**（多翻 = 刀切宽了）。
 */
export const READER_KNIVES = [
  {
    id: 'R1',
    label: '每一行解析不了都算 `partial_tail`（把中间坏行也算成"写了一半"）',
    delta: '`if (isLast && nonEmpty.length > 1) { partial.push(index + 1); continue }` → `{ partial.push(index + 1); continue }`',
    find: '      if (isLast && nonEmpty.length > 1) { partial.push(index + 1); continue }',
    replace: '      { partial.push(index + 1); continue }',
    // 组合面（d）也读这两个计数 ⇒ 它也会被这一刀翻；不是刀切宽了，是同一把尺子的两个面。
    want: ['OFL7-COMBINED', 'OFL7-MIDDLE-CORRUPT'],
  },
  {
    id: 'R2',
    label: '一行 `partial_tail` 都不数（半截最后一行退化成 `unreadable`）',
    delta: '`if (isLast && nonEmpty.length > 1) { ... }` → `if (false && isLast && ...)`',
    find: '      if (isLast && nonEmpty.length > 1) { partial.push(index + 1); continue }',
    replace: '      if (false && isLast && nonEmpty.length > 1) { partial.push(index + 1); continue }',
    want: ['OFL7-COMBINED', 'OFL7-LAST-HALF'],
  },
  {
    id: 'R3',
    label: '组合面把半截也写进 `reason`（**设计 1**，而不是声明的设计 2）',
    delta: '坏行 `reason` 末尾追加 `；另有 N 行写了一半`（仅在 `partial.length > 0` 时）',
    find: '    out.reason = "E_OFFICE_LEDGER_UNREADABLE: " + bad.length + " 行不合格（第 " + bad.join("、") + " 行）"',
    replace: '    out.reason = "E_OFFICE_LEDGER_UNREADABLE: " + bad.length + " 行不合格（第 " + bad.join("、") + " 行）" + (partial.length > 0 ? "；另有 " + partial.length + " 行写了一半" : "")',
    want: ['OFL7-COMBINED'],
  },
]

/**
 * 七把刀（契约 §4.3）。每把**只切一个开关**；锚点必须恰好命中 1 处（`knifeReplace` 判）。
 * `want` = 这一刀**必须翻出来的码集合**（多翻 = 刀切宽了，少翻 = 那一面没人守）。
 */
export const KNIVES = [
  {
    id: 'K1',
    label: '不写账（把 `recordOfficeLanding(...)` 的调用换成常量 `{ok:true}`）',
    delta: 'guard 里的 `const written = recordOfficeLanding(v.header_office, line)` → `const written = { ok: true, code: null, path: "" , reason: null }`',
    find: '    const written = recordOfficeLanding(v.header_office, line)',
    replace: '    const written = { ok: true, code: null, path: "", reason: null }',
    want: ['OFL-CROSS-TREE', 'OFL-EXACTLY-TWO', 'OFL-FAIL-CLOSED-ALLOWED', 'OFL-LEDGER-ABSENT', 'OFL-LINE-VALUES', 'OFL-ONE-LINE'],
  },
  {
    id: 'K2',
    label: '行里 `tree_differs` 恒 false（异树那一行不再自证）',
    delta: '`tree_differs: v.differs === true` → `tree_differs: false`',
    find: 'tree_differs: v.differs === true',
    replace: 'tree_differs: false',
    want: ['OFL-CROSS-TREE', 'OFL-EXACTLY-TWO', 'OFL-LINE-VALUES', 'OFL-WARN-MISSING'],
  },
  {
    id: 'K3',
    label: '账写不进去时 **fail-open**（`return undefined` ⇒ 放行）',
    delta: '`return "E_GUARD_OFFICE_LEDGER：账写不进去…"` → `return undefined`',
    find: '      return "E_GUARD_OFFICE_LEDGER：账写不进去，这次写被拒。账本「" + written.path + "」原因：" + written.reason',
    replace: '      return undefined',
    want: ['OFL-FAIL-CLOSED-ALLOWED'],
  },
  {
    id: 'K4',
    label: '读者把**坏行**静默跳过（`unreadable` 不 +1）',
    delta: '`{ out.unreadable += 1; continue }` → `{ continue }`',
    find: '    if (line === null || typeof line !== "object" || Array.isArray(line) || typeof line.tree_differs !== "boolean") { out.unreadable += 1; continue }',
    replace: '    if (line === null || typeof line !== "object" || Array.isArray(line) || typeof line.tree_differs !== "boolean") { continue }',
    want: ['OFL-READER-BAD-LINE', 'OFL-READER-DISAGREE'],
  },
  {
    id: 'K5',
    label: '读者的 `warning` 恒 null（不数异树）',
    delta: '`out.warning = out.cross_tree > 0 ? "OFFICE_TREE_DIFFERS" : null` → `out.warning = null`',
    find: '  out.warning = out.cross_tree > 0 ? "OFFICE_TREE_DIFFERS" : null',
    replace: '  out.warning = null',
    want: ['OFL-CROSS-TREE', 'OFL-READER-WARNING'],
  },
  {
    id: 'K6',
    label: '账写到**落点树**（`office_root`）而不是会话头那棵树',
    delta: '`recordOfficeLanding(v.header_office, line)` → `recordOfficeLanding(v.office_root, line)`',
    find: '    const written = recordOfficeLanding(v.header_office, line)',
    replace: '    const written = recordOfficeLanding(v.office_root, line)',
    want: ['OFL-CROSS-TREE', 'OFL-EXACTLY-TWO', 'OFL-LEDGER-ABSENT'],
  },
  {
    id: 'K7',
    label: '行里多一个 `content` 键（正文进账）',
    delta: '行对象里加 `content: String(args.content ?? "")`',
    find: 'tree_differs: v.differs === true }',
    replace: 'tree_differs: v.differs === true, content: String(args.content ?? "") }',
    want: ['OFL-LINE-KEYS', 'OFL-LINE-CONTENT'],
  },
]

/**
 * 把某一刀切到 `source` 上（**只切一处**）。0 处 / 多处 ⇒ `ok:false`（尺子坏了，不许当成"刀咬了"）。
 * @param {string} source
 * @param {{find:string, replace:string, id:string}} knife
 */
export function applyKnife(source, knife) {
  return knifeReplace({ source, find: knife.find, replace: knife.replace })
}

/**
 * 真源码那一侧的一把刀（`K1` 的函数体级切法）：把 `recordOfficeLanding` 的**函数体**换成"什么都不写"。
 *
 * 为什么用函数体而不是文本锚：实现怎么写那一行还没定，钉文本形状会变成"实现必须长得跟我猜的一样"
 * （那种刀会在换版之后静默不咬）。钉的是**契约里冻结的名字**（§2.1），改实现不改名字 ⇒ 刀照样咬。
 *
 * 🔴 **这一刀该翻的是一组六码**：`OFL-CROSS-TREE` · `OFL-EXACTLY-TWO` · `OFL-FAIL-CLOSED-ALLOWED` ·
 * `OFL-LEDGER-ABSENT` · `OFL-LINE-VALUES` · `OFL-ONE-LINE` —— `OFL-ONE-LINE`（行数 ≠ 2）与
 * `OFL-LINE-VALUES`（最后一行逐字等于种子行）是**同一条事实的两句话**：没有追加行时最后一行就是种子行
 * ⇒ 「有 `ONE-LINE` 而没有 `LINE-VALUES`」这种形状不存在。与对照侧 `KNIVES[K1].want` 逐字相同。
 *
 * @param {string} source 真 `inject.js` 全文
 * @returns {{ok:boolean, code:string|null, why:string|null, source:string|null}}
 */
export function dropLedgerWrite(source) {
  const text = String(source)
  const needle = 'export function recordOfficeLanding('
  const at = text.indexOf(needle)
  if (at < 0) return { ok: false, code: 'KNIFE-ANCHOR-MISSING', why: `真源码里没有 \`${needle}\`（契约 §2.1 的冻结面）`, source: null }
  if (text.indexOf(needle, at + 1) >= 0) return { ok: false, code: 'KNIFE-ANCHOR-AMBIGUOUS', why: `\`${needle}\` 出现不止一次`, source: null }
  const open = text.indexOf('{', at)
  if (open < 0) return { ok: false, code: 'KNIFE-ANCHOR-MISSING', why: '函数声明后面没有函数体', source: null }
  let depth = 0
  let close = -1
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) { close = i; break }
    }
  }
  if (close < 0) return { ok: false, code: 'KNIFE-ANCHOR-MISSING', why: '函数体的花括号不闭合', source: null }
  const body = '\n  return { ok: true, code: null, path: officeLandingLedgerPath(officeRoot), reason: null }\n'
  const out = `${text.slice(0, open)}{${body}${text.slice(close)}`
  if (out === text) return { ok: false, code: 'KNIFE-NO-CUT', why: '替换没改动一个字节', source: null }
  return { ok: true, code: null, why: null, source: out }
}

/**
 * 把一份切过的真 `inject.js` 落成**自足副本**：`inject.js` 旁边必须有 `lib/` 与 `tools/`。
 * 🔴 不带齐这两个目录，`apply()` 里的懒加载会以"找不到 `route.mjs`"的样子假红（batch 13 的教训）。
 * @param {{dir:string, presetDir:string, source:string}} input
 */
export function writeStandaloneCopy({ dir, presetDir, source }) {
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'inject.knife.mjs')
  writeFileSync(file, source, 'utf8')
  for (const sub of ['lib', 'tools']) {
    const from = path.join(presetDir, sub)
    if (existsSync(from)) cpSync(from, path.join(dir, sub), { recursive: true })
  }
  return file
}

/** 合成工具目录（对照的 `apply` 不裁工具，喂一个最小的就够）。 */
export const controlCatalog = () => buildCatalog(['read', 'write', 'edit'])

// ── 账本码位表（`OFL-08`；契约 §2.4 + `CONTRACT-f11-judge-kind.md` §5）──────────
/**
 * **本族四个码**的登记表 —— `OFL-08` 的**唯一来源**（不在用例里再抄一份）。
 *
 * 为什么单独一格判它：四个码的**行为**已经由 `OFL-01…07` 分开判了（写面 / 读面 / 半截 / 组合），
 * 但"码有没有进 `CODES`、退出码表里有没有它"是**另一件事** —— 行为对、码没登记，
 * 读数照样会被 CLI 的 catch 折成 `E_INTERNAL`（"该拒"和"程序有 bug"长得一模一样）。
 * `STAT-02` 的退出码对账对两个方向都只记读数（`mine_only` / `impl_only`）⇒ 缺码、值不等
 * 必须由 `OFL-08` 的红码说（判词见 `CONTRACT-f11-judge-kind.md` §5）。
 *
 * ⚠️ `E_OFFICE_LEDGER_PARTIAL_TAIL` 的**名字**按契约 §1 是"实现定"；产品现在用的这个名字
 * 就是本表的登记名。改名要同批改契约 §2.4 那一行与本表，不许只改代码。
 * ⚠️ `E_GUARD_OFFICE_LEDGER`（门禁那一侧）**不在本表**：它不是 `E_OFFICE_LEDGER_*` 族
 * （门禁另发、也不走 CLI catch）；它的登记状态只进读数（`gate_code_in_codes`），不在这里判。
 */
export const LEDGER_CODE_TABLE = [
  {
    code: CODES.shape,
    face: '写：这一行自己不合契约 §1.2（键集 / 正文键 / 值）',
    who: 'recordOfficeLanding',
    exit: 5,
    contract: 'CONTRACT-batch15.md §2.4',
  },
  {
    code: CODES.unwritable,
    face: '写：盘写不进去（权限 / 盘满 / 路径被目录占着）',
    who: 'recordOfficeLanding',
    exit: 5,
    contract: 'CONTRACT-batch15.md §2.4',
  },
  {
    code: CODES.unreadable,
    face: '读：中间行坏 / 整本读不动',
    who: 'officeLandingLedger',
    exit: 5,
    contract: 'CONTRACT-batch15.md §2.4',
  },
  {
    code: HALF_LINE_CODE_CANDIDATE,
    face: '读：最后一行写了一半',
    who: 'officeLandingLedger',
    exit: 5,
    contract: 'CONTRACT-batch15.md §2.4 + CONTRACT-f11-judge-kind.md §1',
  },
]

/**
 * 把**产品码表**（`lib/error-codes.mjs` 的 `CODES`）与**测试侧退出码表**（`FROZEN.exitCodes`）
 * 逐条对到 `LEDGER_CODE_TABLE` 上。三个方向都报：
 *   · 表里的码在产品 `CODES` 缺席 / 退出码 ≠ 表 ⇒ `OFL8-CODES-MISSING` / `OFL8-EXIT-MISMATCH`；
 *   · 表里的码在测试侧 `exitCodes` 缺席 / 退出码 ≠ 表 ⇒ `OFL8-EXITCODES-MISSING` / `OFL8-EXIT-MISMATCH`；
 *   · 两张表里**多出**本族的码（`E_OFFICE_LEDGER_*`）而不在表里 ⇒ `OFL8-UNLISTED`（登记面走样）。
 *
 * @param {{codes: object|null, exitCodes: object|null}} input
 * @returns {{problems: Array<[string,string]>, readings: object}}
 */
export function ledgerCodeBookProblems({ codes, exitCodes }) {
  const problems = []
  const product = codes !== null && typeof codes === 'object' ? codes : {}
  const mine = exitCodes !== null && typeof exitCodes === 'object' ? exitCodes : {}
  const wanted = new Set(LEDGER_CODE_TABLE.map((row) => row.code))
  const familyOf = (table) => Object.keys(table).filter((key) => key.startsWith('E_OFFICE_LEDGER_')).sort()
  const readings = {
    table: LEDGER_CODE_TABLE.map((row) => ({ code: row.code, face: row.face, who: row.who, exit: row.exit, contract: row.contract })),
    codes_family: familyOf(product),
    exitCodes_family: familyOf(mine),
    gate_code_in_codes: Object.prototype.hasOwnProperty.call(product, CODES.guard),
    /** `E_GUARD_OFFICE_LEDGER` 只记读数（见上表注释）。 */
    gate_code_in_exitCodes: Object.prototype.hasOwnProperty.call(mine, CODES.guard),
    missing_in_codes: [],
    missing_in_exitCodes: [],
    mismatched: [],
  }
  for (const row of LEDGER_CODE_TABLE) {
    const entry = product[row.code]
    if (entry === undefined || entry === null) {
      readings.missing_in_codes.push(row.code)
      problems.push(['OFL8-CODES-MISSING', `\`CODES\` 里没有 \`${row.code}\`（${row.face}；契约 ${row.contract}）—— CLI 的 catch 只认表里有的码，漏登记 ⇒ 它会被折成 \`E_INTERNAL\`，"该拒"和"程序有 bug"长得一模一样`])
    } else if (entry.exit !== row.exit) {
      readings.mismatched.push({ code: row.code, source: 'CODES', want: row.exit, got: entry.exit })
      problems.push(['OFL8-EXIT-MISMATCH', `\`CODES\` 里 \`${row.code}.exit\` 应为 ${row.exit}（校验拒绝族），实得 ${JSON.stringify(entry.exit)}`])
    }
    if (!Object.prototype.hasOwnProperty.call(mine, row.code)) {
      readings.missing_in_exitCodes.push(row.code)
      problems.push(['OFL8-EXITCODES-MISSING', `测试侧 \`FROZEN.exitCodes\` 里没有 \`${row.code}\`（契约 ${row.contract}）—— 这张表是期望值；缺码时"查不到期望 ⇒ 静默空过"，比红更坏`])
    } else if (mine[row.code] !== row.exit) {
      readings.mismatched.push({ code: row.code, source: 'exitCodes', want: row.exit, got: mine[row.code] })
      problems.push(['OFL8-EXIT-MISMATCH', `\`FROZEN.exitCodes\` 里 \`${row.code}\` 应为 ${row.exit}，实得 ${JSON.stringify(mine[row.code])}`])
    }
  }
  for (const extra of readings.codes_family.filter((code) => !wanted.has(code))) {
    problems.push(['OFL8-UNLISTED', `\`CODES\` 里多了一个本族的码 \`${extra}\`，但 \`LEDGER_CODE_TABLE\` 里没有它 —— 新增/改名本族码要同批改契约 §2.4 与本表`])
  }
  for (const extra of readings.exitCodes_family.filter((code) => !wanted.has(code))) {
    problems.push(['OFL8-UNLISTED', `\`FROZEN.exitCodes\` 里多了一个本族的码 \`${extra}\`，但 \`LEDGER_CODE_TABLE\` 里没有它 —— 期望表与码位表已经分叉`])
  }
  return { problems, readings }
}
