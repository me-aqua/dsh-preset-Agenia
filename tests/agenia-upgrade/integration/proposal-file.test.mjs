/**
 * PFL-01 … PFL-11 —— `proposal_file` 这 11 条用例（F-53 写在 `.team/` 里的真身，F-57 搬进项目）。
 *
 * 为什么现在能进来：过去注册表自己钉着"总数 === 55 ⇒ 不许加 ID"，那 11 条只好住 `.team/`，
 * 于是"跑得到"与"结算看得见"是两套读数（`node --test` 跑 11 条，结算写 0 条）。
 * F-57 之后分母由盘上推出、`55` 退成 `FROZEN_IDS` 清单 ⇒ 加 11 个新 ID 是"盘上 + 登记 + 一处同批"的正规动作。
 * 它们与其余 55 条同形：`node:test` + 项目的 `runCase`（不走 `runCase` 的话结算面看不见它们）。
 *
 * 被测对象：`<repo>/presets/agenia/tools/proposal-file.mjs`，以及同树的 `agent.cordis.yml` / `inject.js`。
 * 为什么用**相对仓库根**的活体路径、而不是 `AGENIA_STAGING_PRESET`：这 11 条要能在"整棵 tests 树被拷到
 * 别处"时照样跑（F-57 的沙盒就是那样），而 staging 那棵树不随 tests 走 ⇒ 落点跟着树走，不跟 env 走。
 *
 * 🔴 落盘纪律：所有写入都在**运行根**（`AGENIA_TEST_RUN_ROOT/proposal-file/**`）里，
 *    `presets/**` 一个字节都不写 —— PFL-01 量这一条。
 */
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { caseFail, caseHold, problem, runCase, runRoot } from '../support/evidence.mjs'
import { DISCOVERY, FROZEN_IDS, REGISTRY } from '../support/registry.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 仓库根 = `integration/` 往上三层（`tests/agenia-upgrade/integration` ⇒ 仓库根）。 */
const REPO = path.resolve(HERE, '..', '..', '..')
const PRESET = path.join(REPO, 'presets', 'agenia')
const TOOL = path.join(PRESET, 'tools', 'proposal-file.mjs')
const YML = path.join(PRESET, 'agent.cordis.yml')
const INJECT = path.join(PRESET, 'inject.js')
const CHECK_NOTES = path.join(REPO, '.tools', 'check-notes.mjs')
const PROPOSALS_DIR = path.join(PRESET, '.runtime', 'proposals')
/** 契约 §1 冻结的工具名，§2.2 冻结的四个码（形状与重复必须分开）。 */
const TOOL_NAME = 'proposal_file'
const CODES = {
  SHAPE: 'E_PROPOSAL_SHAPE',
  HASH: 'E_PROPOSAL_HASH_MISMATCH',
  DUP: 'E_PROPOSAL_DUPLICATE',
  IO: 'E_PROPOSAL_IO',
}
/** 历史冻结的条数（**冻结清单的长度**，不是分母；分母是 `TOTAL` = 盘上条数）。 */
const FROZEN_COUNT = 55
const AT = '2026-10-17T04:00:00.000Z'
const DAY = '2026-10-17'

// ── 小工具 ───────────────────────────────────────────────────────────────────
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const hex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s)
const readText = (p) => {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

/** 运行根的 marker（`run-all.mjs` 在运行根/brain-root/workspace 三处各放一份）。 */
const RUN_MARKER = '.agenia-test-root'

/**
 * 删除前的三道校验（契约 §2.5 同口径）：解析绝对路径 → 必须在运行根之下 → 运行根必须带 marker。
 * 为什么必须有：`makeRoot` 会 `recursive` 删掉上一个同名目录，落点算错一次就删到别人的东西。
 */
function assertDeletable(target) {
  const abs = path.resolve(target)
  const root = path.resolve(runRoot())
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`E_NOT_DELETABLE: ${abs} 不在运行根之下（${root}）`)
  }
  if (!existsSync(path.join(root, RUN_MARKER))) {
    throw new Error(`E_NO_MARKER: 运行根没有 ${RUN_MARKER}（${root}）—— 删除前必须先证明这是测试根`)
  }
  return abs
}

/**
 * 一个用例的落盘根（脑根那一层）。两条安全门：
 *   ① 绝不落在 `presets/agenia` 里（那是真实预设，只读）；
 *   ② 绝不落在 C 盘（临时件一律在项目所在盘）。
 */
function makeRoot(caseId) {
  const dir = path.join(runRoot(), 'proposal-file', caseId)
  const resolved = path.resolve(dir)
  if (resolved.toLowerCase().startsWith(path.resolve(PRESET).toLowerCase() + path.sep)) {
    throw new Error(`落点不许在真实预设目录里：${resolved}`)
  }
  if (path.parse(resolved).root.slice(0, 1).toUpperCase() === 'C') {
    throw new Error(`落点不许在 C 盘：${resolved}`)
  }
  rmSync(assertDeletable(dir), { recursive: true, force: true })
  const root = path.join(dir, 'brain-root')
  mkdirSync(root, { recursive: true })
  return root
}

/** 读池子：文件不在 = 合法空态；一行坏 ⇒ `rows: null` + 行号（半写要被看见）。 */
function poolRows(root) {
  const file = path.join(root, 'proposals', 'pool.jsonl')
  const text = readText(file)
  if (text === null) return { rows: [], text: '', file, exists: false }
  const rows = []
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue
    try { rows.push(JSON.parse(line)) } catch { return { rows: null, text, file, exists: true, corruptLine: i + 1 } }
  }
  return { rows, text, file, exists: true }
}

let importSeq = 0
const importFresh = (file) => import(`${pathToFileURL(file).href}?pfl=${importSeq += 1}`)
let toolCache
/** 动态取被测模块（取不到 = 缺面，不是测试崩了 —— 首跑的红要能读）。 */
async function loadTool() {
  if (toolCache !== undefined) return toolCache
  try {
    toolCache = { mod: await importFresh(TOOL), error: null }
  } catch (error) {
    toolCache = { mod: null, error: String(error?.message ?? error) }
  }
  return toolCache
}

/** 跑主路并统一成 `{ok, value}` / `{ok:false, code, message}`（抛出也算一种结果，不许漏判）。 */
async function callRun(mod, args, options) {
  try {
    return { ok: true, value: await mod.proposalFileRun(args, options) }
  } catch (error) {
    return { ok: false, code: error?.code ?? null, message: String(error?.message ?? error) }
  }
}

// ── `agent.cordis.yml` 的行块读取（窄口径：只认这一种形状，认不出就报，不静默）──
function rowBlocks(ymlText) {
  const lines = ymlText.split(/\r?\n/)
  const starts = []
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\s*)-\s*id:\s*([A-Za-z0-9_.-]+)\s*$/.exec(lines[i])
    if (m !== null) starts.push({ i, indent: m[1].length, id: m[2] })
  }
  return starts.map((s, k) => {
    const nextStart = k + 1 < starts.length ? starts[k + 1].i : lines.length
    return { id: s.id, lines: lines.slice(s.i, nextStart) }
  })
}

/** 行块里的 `deny: [a, b]`（行内列表；作业行与岗位行都是这个形状）。 */
function denyOf(block) {
  for (const line of block.lines) {
    const m = /^\s*deny:\s*\[([^\]]*)\]\s*$/.exec(line)
    if (m !== null) return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  return null
}

const isDisabled = (block) => block.lines.some((l) => /^\s*disabled:\s*true\s*$/.test(l))

/** `persona-injector` 那一行的 `officeBound:` 块序列。 */
function officeBoundOf(blocks) {
  const inj = blocks.find((b) => b.id === 'persona-injector')
  if (inj === undefined) return null
  const at = inj.lines.findIndex((l) => /^\s*officeBound:\s*$/.test(l))
  if (at < 0) return null
  const baseIndent = inj.lines[at].length - inj.lines[at].trimStart().length
  const out = []
  for (let i = at + 1; i < inj.lines.length; i += 1) {
    const line = inj.lines[i]
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    const indent = line.length - line.trimStart().length
    const m = /^\s*-\s*(.+?)\s*$/.exec(line)
    if (m !== null && indent > baseIndent) { out.push(m[1].replace(/^['"]|['"]$/g, '')); continue }
    if (indent <= baseIndent) break
  }
  return out
}

/** 真实候选池的逐文件快照（`presets/agenia/.runtime/proposals/`：只读，只量）。 */
function realProposalsSnapshot() {
  const out = { dir: PROPOSALS_DIR, files: {}, sha256: null }
  if (!existsSync(PROPOSALS_DIR)) return out
  for (const name of readdirSync(PROPOSALS_DIR).sort()) {
    const p = path.join(PROPOSALS_DIR, name)
    try {
      const buf = readFileSync(p)
      out.files[name] = `${buf.length}:${sha256(buf.toString('utf8'))}`
    } catch { out.files[name] = 'unreadable' }
  }
  out.sha256 = sha256(JSON.stringify(out.files))
  return out
}

/**
 * 隔离子进程（PFL-10 的并发那一格用）：真进程 + `stdio: 'ignore'`，结果落文件。
 * worker 的源码现写到运行根里再 spawn —— 不把自己这份 `*.test.mjs` 当入口跑（那会把 11 条再注册一遍）。
 */
const WORKER_SRC = `
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const args = JSON.parse(process.env.PFL_WORKER_ARGS)
const out = process.env.PFL_WORKER_OUT
let result
try {
  // 裸 Windows 路径不是合法 ESM 说明符（会 ERR_UNSUPPORTED_ESM_URL_SCHEME）⇒ 必须过 pathToFileURL。
  const mod = await import(pathToFileURL(process.env.PFL_WORKER_MODULE).href)
  result = { ok: true, value: await mod.proposalFileRun({ text: args.text, source: args.source }, { root: args.root, at: args.at, day: args.day }) }
} catch (error) {
  result = { ok: false, code: error?.code ?? null, message: String(error?.message ?? error) }
}
writeFileSync(out, JSON.stringify(result), 'utf8')
`
async function runWorker(args) {
  const dir = path.join(runRoot(), 'proposal-file', '_workers')
  mkdirSync(dir, { recursive: true })
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const workerFile = path.join(dir, `worker-${stamp}.mjs`)
  const outFile = path.join(dir, `out-${stamp}.json`)
  writeFileSync(workerFile, WORKER_SRC, 'utf8')
  const child = spawn(process.execPath, [workerFile], {
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PFL_WORKER_MODULE: TOOL, PFL_WORKER_ARGS: JSON.stringify(args), PFL_WORKER_OUT: outFile },
  })
  const code = await new Promise((resolve) => child.on('exit', (c) => resolve(c)))
  const text = readText(outFile)
  rmSync(assertDeletable(workerFile), { force: true })
  rmSync(assertDeletable(outFile), { force: true })
  if (text === null) return null
  try { return { ...JSON.parse(text), exit: code } } catch { return null }
}

// ═════════════════════════════════════════════════════════════════════════════
// PFL-01 · 安全不变量：工具活动之后，真实候选池一个字节不变
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-01 安全：工具活动之后，真实候选池一个字节不变', async () => {
  await runCase('PFL-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const before = realProposalsSnapshot()
    rec.readings.before = before.sha256
    rec.readings.files = Object.keys(before.files)

    // 把这一套用例对真实树做的事都做一遍：导入工具 + 一次成功的提 + 一次被拒的提（落点都在运行根里）。
    const loaded = await loadTool()
    if (loaded.mod === null) {
      push('SUT-SURFACE-MISSING', `工具模块取不到：${TOOL}（${loaded.error}）`)
    } else {
      const root = makeRoot('PFL-01')
      const ok = await callRun(loaded.mod, { text: 'PFL-01 的一条候选', source: 'PFL-01 的出处' }, { root, at: AT, day: DAY })
      rec.readings.propose = ok.ok ? { seq: ok.value?.seq, proposal_id: ok.value?.proposal_id } : { code: ok.code, message: ok.message }
      if (!ok.ok) push('PROPOSE-FAILED', `提一条候选必须成功（它落在运行根里，不碰真实池子），实得 ${ok.code}: ${ok.message}`)
      const rejected = await callRun(loaded.mod, { text: 'PFL-01 的第二次' }, { root, at: AT, day: DAY })
      if (rejected.ok) push('SHAPE-ACCEPTED', '不给 source 竟然成功了 —— 静默补空是明令禁止的那一条')
    }

    const after = realProposalsSnapshot()
    rec.readings.after = after.sha256
    if (before.sha256 !== after.sha256) {
      const changed = Object.keys({ ...before.files, ...after.files }).filter((k) => before.files[k] !== after.files[k])
      push('REAL-ROOTS', `真实候选池被动了：${changed.join(', ') || '(目录本身)'}`, { before, after })
    }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-02 · 一次调用 = 一条候选 + 一句出处（正向 + 反向零写入）
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-02 一次调用 = 一条候选 + 一句出处（正向全套 + 反向零写入）', async () => {
  await runCase('PFL-02', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const root = makeRoot('PFL-02')
    const loaded = await loadTool()
    if (loaded.mod === null) { push('SUT-SURFACE-MISSING', `工具模块取不到：${TOOL}（${loaded.error}）`); return caseFail(problems) }
    const mod = loaded.mod

    // 导出面先过（否则下面每条红都在说同一件"模块不在"）
    for (const name of ['PROPOSAL_FILE_TOOL_NAME', 'PROPOSAL_FILE_CODES', 'proposalFileVerdict', 'proposalFileRun']) {
      if (mod[name] === undefined) push('EXPORT-MISSING', `冻结导出 ${name} 不在模块里`)
    }
    if (mod.PROPOSAL_FILE_TOOL_NAME !== TOOL_NAME) {
      push('TOOL-NAME', `工具名必须是 ${JSON.stringify(TOOL_NAME)}，实得 ${JSON.stringify(mod.PROPOSAL_FILE_TOOL_NAME)}`)
    }
    if (problems.length > 0) return caseFail(problems)

    const TEXT = '  一条候选：句首有两个空格，句尾有一个换行\n'
    const SOURCE = '老板 2026-10-17 原话（逐字）：「我感觉得有工具啊」'
    const r = await callRun(mod, { text: TEXT, source: SOURCE }, { root, at: AT, day: DAY })
    rec.readings.first_call = r.ok ? r.value : { code: r.code, message: r.message }
    if (!r.ok) { push('FIRST-CALL-FAILED', `第一次调用就必须成功，实得 ${r.code}: ${r.message}`); return caseFail(problems) }

    const v = r.value
    if (v?.ok !== true) push('OUT-SHAPE', `返回值缺 ok:true，实得 ${JSON.stringify(v?.ok)}`)
    if (!/^proposal-\d{8}-\d{4}$/.test(String(v?.proposal_id))) push('OUT-ID', `proposal_id 形状不对：${JSON.stringify(v?.proposal_id)}`)
    if (!/^cand-\d{8}-\d{4}$/.test(String(v?.entry_id))) push('OUT-ID', `entry_id 形状不对：${JSON.stringify(v?.entry_id)}`)
    if (String(v?.proposal_id).slice(-4) !== String(v?.entry_id).slice(-4)) push('OUT-ID', '两个 id 必须同号（一个号一处来源）')
    if (path.resolve(String(v?.pool_path)) !== path.resolve(path.join(root, 'proposals', 'pool.jsonl'))) {
      push('OUT-PATH', `pool_path 必须指到 <脑根>/proposals/pool.jsonl，实得 ${JSON.stringify(v?.pool_path)}`)
    }
    if (v?.seq !== 1) push('OUT-SEQ', `第一条的 seq 必须是 1，实得 ${JSON.stringify(v?.seq)}`)
    if (!hex64(v?.content_sha256)) push('OUT-HASH', `content_sha256 必须是 64 hex，实得 ${JSON.stringify(v?.content_sha256)}`)
    if (v?.sha256 !== sha256(TEXT)) push('OUT-HASH', `sha256 必须是 sha256(text)`)
    if (v?.source !== SOURCE) push('OUT-ECHO', 'source 必须原样回显')
    if (v?.kind !== 'general') push('OUT-KIND', `缺省 kind 必须是 general，实得 ${JSON.stringify(v?.kind)}`)
    if (String(v?.imported_at) !== AT) push('OUT-TIME', `imported_at 必须等于传进去的 at（可复跑），实得 ${JSON.stringify(v?.imported_at)}`)

    const pool = poolRows(root)
    rec.readings.pool_rows = pool.rows === null ? `corrupt@${pool.corruptLine}` : pool.rows.length
    if (pool.rows === null) { push('POOL-CORRUPT', `池子第 ${pool.corruptLine} 行不是合法 JSON（半写？）`); return caseFail(problems) }
    if (pool.rows.length !== 1) { push('POOL-COUNT', `一次调用必须只多一行，实得 ${pool.rows.length} 行`); return caseFail(problems) }
    const row = pool.rows[0]
    rec.readings.row = row
    const NEED = ['schema', 'kind', 'imported_id', 'imported_at', 'seq', 'source', 'sha256', 'content_sha256', 'payload']
    for (const key of NEED) if (!(key in row)) push('ROW-FIELD', `池子那一行缺字段 ${key}`)
    for (const key of ['base_snapshot', 'update_generation', 'review_attempt']) {
      if (!(key in row)) push('ROW-FIELD', `池子那一行缺字段 ${key}（fence 三格：没有也要显式 null）`)
      else if (row[key] !== null) push('ROW-FENCE', `fence 三格必须是 null（工具没有轮次，编一个 = 替调用方挑轮次），实得 ${key}=${JSON.stringify(row[key])}`)
    }
    if (row.kind !== 'proposal') push('ROW-KIND', `kind 必须是 proposal，实得 ${JSON.stringify(row.kind)}`)
    if (row.schema !== 1) push('ROW-SCHEMA', `schema 必须是 1，实得 ${JSON.stringify(row.schema)}`)
    if (row.source !== SOURCE) push('ROW-SOURCE', '池子那一行的 source 必须**逐字**等于调用方给的那句')
    if (row.sha256 !== sha256(TEXT)) push('ROW-HASH', '池子那一行的 sha256 必须是 sha256(text)')
    if (row.content_sha256 !== v.content_sha256) push('ROW-HASH', '回包里的 content_sha256 必须与落到盘上的那一格相同')
    if (row.payload?.entry?.text !== TEXT) push('ROW-TEXT', `payload.entry.text 必须逐字等于 text（不许 trim / 归一换行），实得 ${JSON.stringify(row.payload?.entry?.text)}`)
    if (row.payload?.entry?.type !== 'general') push('ROW-TYPE', `payload.entry.type 必须是 kind，实得 ${JSON.stringify(row.payload?.entry?.type)}`)
    if (row.payload?.entry?.id !== v.entry_id) push('ROW-ID', 'payload.entry.id 必须等于回包里的 entry_id')
    if (row.imported_id !== v.proposal_id) push('ROW-ID', 'imported_id 必须等于回包里的 proposal_id')

    // 反向：不给 source ⇒ 必须拒，而且池子一行都不许多（不许静默补空）
    const before = poolRows(root).rows.length
    const bad = await callRun(mod, { text: '换一条不重复的正文' }, { root, at: AT, day: DAY })
    rec.readings.no_source = bad.ok ? 'ACCEPTED(!!)' : { code: bad.code, message: bad.message }
    if (bad.ok) push('SHAPE-ACCEPTED', '不给 source 竟然成功了 —— 静默补空是明令禁止的那一条')
    else if (bad.code !== CODES.SHAPE) push('SHAPE-CODE', `不给 source 必须回 ${CODES.SHAPE}，实得 ${JSON.stringify(bad.code)}`)
    if (poolRows(root).rows.length !== before) push('PARTIAL-WRITE', '被拒的那次调用改了池子 —— 拒绝必须零写入')
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-03 · 形状错五格各拒一次，且拒绝 = 零写入
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-03 形状错五格各拒一次，且拒绝 = 零写入（与"内容重复"分开报）', async () => {
  await runCase('PFL-03', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const root = makeRoot('PFL-03')
    const loaded = await loadTool()
    if (loaded.mod === null) { push('SUT-SURFACE-MISSING', `工具模块取不到：${TOOL}（${loaded.error}）`); return caseFail(problems) }
    const mod = loaded.mod
    if (typeof mod.proposalFileVerdict !== 'function') { push('EXPORT-MISSING', '缺纯函数 proposalFileVerdict'); return caseFail(problems) }

    const rows = []
    const check = (label, args, why) => {
      const v = mod.proposalFileVerdict({ args, poolEntries: rows })
      rec.readings[label] = v?.ok === true ? 'ACCEPTED' : v?.code
      if (v?.ok === true) push('SHAPE-ACCEPTED', `${label} 竟然通过了 —— ${why}`)
      else if (v.code !== CODES.SHAPE) push('SHAPE-CODE', `${label} 必须回 ${CODES.SHAPE}（形状错），实得 ${JSON.stringify(v.code)}`)
      else if (typeof v.message !== 'string' || v.message.trim() === '') push('SHAPE-MESSAGE', `${label} 的报文是空的`)
    }
    check('no_text', { source: 'x' }, 'text 必填')
    check('empty_text', { text: '   \n\t ', source: 'x' }, 'text strip 后为空算没给')
    check('no_source', { text: '一条正文' }, 'source 必填，不许静默补空')
    check('empty_source', { text: '一条正文', source: '  \t ' }, 'source strip 后为空算没给')
    check('bad_kind', { text: '一条正文', source: 'x', kind: 'rule' }, 'kind 只许四类')
    check('bad_sha_shape', { text: '一条正文', source: 'x', sha256: 'abc' }, 'sha256 必须是 64 hex')
    check('unknown_key', { text: '一条正文', source: 'x', foo: 1 }, '多给字段要拒（静默忽略 = 让调用方以为它生效了）')

    // 报文必须点名出问题的那个字段（不许一句"失败了"）
    const named = [
      ['no_source', 'source'], ['no_text', 'text'], ['bad_kind', 'kind'], ['bad_sha_shape', 'sha256'], ['unknown_key', 'foo'],
    ]
    for (const [label, needle] of named) {
      const args = label === 'no_source' ? { text: '一条正文' }
        : label === 'no_text' ? { source: 'x' }
          : label === 'bad_kind' ? { text: '一条正文', source: 'x', kind: 'rule' }
            : label === 'bad_sha_shape' ? { text: '一条正文', source: 'x', sha256: 'abc' }
              : { text: '一条正文', source: 'x', foo: 1 }
      const v = mod.proposalFileVerdict({ args, poolEntries: rows })
      if (v?.ok !== false) continue
      if (!String(v.message).includes(needle)) push('SHAPE-NAME', `${label} 的报文里必须点名 ${JSON.stringify(needle)}，实得 ${JSON.stringify(v.message)}`)
    }

    // 形状错不许落盘：真跑一次主路，池子必须还是空的
    const r = await callRun(mod, { text: '一条正文' }, { root, at: AT, day: DAY })
    rec.readings.run_no_source = r.ok ? 'ACCEPTED(!!)' : r.code
    if (r.ok) push('SHAPE-ACCEPTED', '主路也不许接受没有 source 的调用')
    const pool = poolRows(root)
    if (pool.rows === null) push('POOL-CORRUPT', `池子第 ${pool.corruptLine} 行不是合法 JSON`)
    else if (pool.rows.length !== 0) push('PARTIAL-WRITE', `形状错的那次调用写了 ${pool.rows.length} 行 —— 拒绝必须零写入`)
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-04 · 判重键 = (source, sha256)：同源同文拒 · 同源换文收 · 换出处收
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-04 判重键 = (source, sha256)：同源同文拒 · 同源换文收 · 换出处收', async () => {
  await runCase('PFL-04', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const root = makeRoot('PFL-04')
    const loaded = await loadTool()
    if (loaded.mod === null) { push('SUT-SURFACE-MISSING', `工具模块取不到：${TOOL}（${loaded.error}）`); return caseFail(problems) }
    const mod = loaded.mod
    const SOURCE = '同一句出处'
    const T1 = '第一条正文'
    const T2 = '第二条正文（同一句出处，内容换了）'

    const a = await callRun(mod, { text: T1, source: SOURCE }, { root, at: AT, day: DAY })
    if (!a.ok) { push('FIRST-CALL-FAILED', `第一次必须成功，实得 ${a.code}: ${a.message}`); return caseFail(problems) }

    // ① 同源同文再来一次 ⇒ 必拒（拒的是重复，不是内容）
    const b = await callRun(mod, { text: T1, source: SOURCE }, { root, at: AT, day: DAY })
    rec.readings.repeat = b.ok ? 'ACCEPTED(!!)' : { code: b.code, message: b.message }
    if (b.ok) push('DUP-ACCEPTED', '同源同文第二次竟然成功了 —— 池子会长出两条同源候选')
    else if (b.code !== CODES.DUP) push('DUP-CODE', `同源同文第二次必须回 ${CODES.DUP}，实得 ${JSON.stringify(b.code)}`)

    let pool = poolRows(root)
    if (pool.rows === null) { push('POOL-CORRUPT', `池子第 ${pool.corruptLine} 行不是合法 JSON`); return caseFail(problems) }
    if (pool.rows.length !== 1) push('POOL-COUNT', `被拒之后池子必须仍是 1 行，实得 ${pool.rows.length} 行`)

    // ② 同源 + 换了内容 ⇒ 必成（"拒的是重复、不是内容"的对照）
    const c = await callRun(mod, { text: T2, source: SOURCE }, { root, at: AT, day: DAY })
    rec.readings.changed_content = c.ok ? { seq: c.value?.seq, proposal_id: c.value?.proposal_id } : { code: c.code, message: c.message }
    if (!c.ok) push('CHANGED-REJECTED', `同源换了内容必须成功，实得 ${c.code}: ${c.message}`)

    pool = poolRows(root)
    rec.readings.pool_rows = pool.rows === null ? 'corrupt' : pool.rows.length
    if (pool.rows !== null) {
      if (pool.rows.length !== 2) push('POOL-COUNT', `两次成功调用之后必须是 2 行，实得 ${pool.rows.length} 行`)
      if (pool.rows.length === 2) {
        if (pool.rows[0].payload?.entry?.text !== T1) push('ROW-TEXT', '第 1 行必须是 T1')
        if (pool.rows[1].payload?.entry?.text !== T2) push('ROW-TEXT', '第 2 行必须是 T2')
        if (pool.rows[1].seq !== 2) push('ROW-SEQ', `第 2 行的 seq 必须是 2，实得 ${JSON.stringify(pool.rows[1].seq)}`)
      }
    }

    // ③ 反向的另一半：同内容、**不同出处** ⇒ 收（判重不越过出处）
    const d = await callRun(mod, { text: T1, source: '另一句出处' }, { root, at: AT, day: DAY })
    rec.readings.other_source_same_text = d.ok ? 'ACCEPTED' : { code: d.code, message: d.message }
    if (!d.ok) push('OTHER-SOURCE-REJECTED', `同内容不同出处按契约要收，实得 ${d.code}: ${d.message}`)
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-05 · 报文能指名：两个码（来源重了 / 内容哈希不符），不许一句"失败了"
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-05 报文能指名：来源重了 / 内容哈希不符是两个码，各自点名', async () => {
  await runCase('PFL-05', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const root = makeRoot('PFL-05')
    const loaded = await loadTool()
    if (loaded.mod === null) { push('SUT-SURFACE-MISSING', `工具模块取不到：${TOOL}（${loaded.error}）`); return caseFail(problems) }
    const m = loaded.mod
    const SOURCE = '出处：老板 2026-10-17 的某一句'
    const TEXT = '会被提两次的那一条'

    const first = await callRun(m, { text: TEXT, source: SOURCE }, { root, at: AT, day: DAY })
    if (!first.ok) { push('FIRST-CALL-FAILED', `第一次必须成功，实得 ${first.code}: ${first.message}`); return caseFail(problems) }

    // ① 「来源重了」：主路 + 纯函数两个面都要能看见，而且码必须是 DUP
    const dup = await callRun(m, { text: TEXT, source: SOURCE }, { root, at: AT, day: DAY })
    rec.readings.dup = dup.ok ? 'ACCEPTED(!!)' : { code: dup.code, message: dup.message }
    const pure = m.proposalFileVerdict({ args: { text: TEXT, source: SOURCE }, poolEntries: [{ source: SOURCE, sha256: sha256(TEXT) }] })
    rec.readings.pure_verdict = pure
    if (dup.ok) push('DUP-ACCEPTED', '同源同文第二次竟然成功了')
    // 纯函数与主路必须说同一个码（判重只有一份口径）。
    if (pure?.ok !== false || pure.code !== m.PROPOSAL_FILE_CODES.DUP) push('DUP-PURE', `纯函数也必须回 ${m.PROPOSAL_FILE_CODES.DUP}，实得 ${JSON.stringify(pure)}`)
    // 🔴 这一行同时是主路的判据：拒绝时码必须是 DUP（不是 IO、不是 SHAPE）。
    if (dup.ok !== false || dup.code !== m.PROPOSAL_FILE_CODES.DUP) push('PFL-DUP', `同源同文必须 DUP，实得 ${JSON.stringify(dup)}`)
    if (!dup.ok) {
      const msg = String(dup.message ?? '')
      if (!msg.includes(SOURCE)) push('DUP-NAME', '报文必须带上调用方那句 source 原文')
      if (!msg.includes(String(first.value?.proposal_id))) push('DUP-NAME', `报文必须指出池子里那一行（${first.value?.proposal_id}）`)
      if (!msg.includes(CODES.DUP)) push('DUP-CODE-IN-MSG', '报文必须含码（工具失败的文本只有 message 一定到得了模型）')
      if (!/重复/.test(msg)) push('DUP-WORD', '报文里要有"重复"两个字（人一眼能懂）')
    }

    // ② 「内容哈希不符」：声明一个别的哈希
    const wrongSha = sha256('另一段文字的哈希')
    const mismatch = await callRun(m, { text: TEXT, source: '另一句出处', sha256: wrongSha }, { root, at: AT, day: DAY })
    rec.readings.mismatch = mismatch.ok ? 'ACCEPTED(!!)' : { code: mismatch.code, message: mismatch.message }
    if (mismatch.ok) push('HASH-ACCEPTED', '声明哈希与内容不符竟然成功了 —— 那一行的 sha256 从此是假话')
    else {
      if (mismatch.code !== CODES.HASH) push('HASH-CODE', `必须是 ${CODES.HASH}，实得 ${JSON.stringify(mismatch.code)}`)
      const msg = String(mismatch.message ?? '')
      if (!msg.includes(wrongSha.slice(0, 12))) push('HASH-NAME', `报文必须给声明哈希前 12 位（${wrongSha.slice(0, 12)}）`)
      if (!msg.includes(sha256(TEXT).slice(0, 12))) push('HASH-NAME', `报文必须给实际哈希前 12 位（${sha256(TEXT).slice(0, 12)}）`)
      if (!/不符/.test(msg)) push('HASH-WORD', '报文里要有"不符"两个字')
    }

    // ③ 🔴 两个码必须**不同**（这一条就是"两种拒绝分得开"的判据本身）
    if (!dup.ok && !mismatch.ok && dup.code === mismatch.code) {
      push('CODES-COLLIDE', `"来源重了"与"内容哈希不符"必须是两个不同的码，实得都是 ${dup.code}`)
    }

    // ④ 对的那一对：声明哈希正确 ⇒ 必须放行（"该绿时绿"）
    const right = await callRun(m, { text: '第三条正文', source: '第三句出处', sha256: sha256('第三条正文') }, { root, at: AT, day: DAY })
    rec.readings.declared_ok = right.ok ? 'ACCEPTED' : { code: right.code, message: right.message }
    if (!right.ok) push('DECLARED-REJECTED', `声明哈希对的时候必须成功，实得 ${right.code}: ${right.message}`)
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-06 · 判决岗的工具集里没有它（配置层判据 + 阳性对照）
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-06 判决岗看不见它：那一行 deny 里必须写着 proposal_file（阳性对照先过）', async () => {
  await runCase('PFL-06', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const yml = readText(YML)
    if (yml === null) { push('SUT-SURFACE-MISSING', `读不到 ${YML}`); return caseFail(problems) }
    const blocks = rowBlocks(yml)
    rec.readings.rows = blocks.length
    const judge = blocks.find((b) => b.id === 'tool-job-memory-judge')
    if (judge === undefined) { push('ROW-MISSING', '找不到 `- id: tool-job-memory-judge` 那一行'); return caseFail(problems) }
    const deny = denyOf(judge)
    rec.readings.judge_deny = deny
    if (deny === null) { push('ROW-SHAPE', '判决行里没有 `deny: [...]` 这一格'); return caseFail(problems) }

    // ① 阳性对照：这一格现在就该找得到 workflow / ralph（证明提取器读的是**那一行**，不是随便一行）
    for (const needle of ['workflow', 'ralph']) {
      if (!deny.includes(needle)) {
        push('PRECONDITION-CONTROL', `阳性对照失败：判决行的 deny 里本来就应该有 ${needle}（现量 ${JSON.stringify(deny)}）`
          + ' —— 这不是被测对象红了，是提取器读错了格子')
      }
    }

    // ② 主判据：deny 里有 proposal_file ⇒ 它的工具集里根本没有这个工具（结构性，不是"调用被拒"）
    if (!deny.includes(TOOL_NAME)) {
      push('DENY-MISSING', `判决行的 toolFilter.deny 里没有 ${TOOL_NAME}（现量 ${JSON.stringify(deny)}）`
        + ' —— 「判决岗不许提」在配置层根本没落：它照样看得见这个工具')
    }

    // ③ 反例：deny 里不许写"继承不到"的名字（那会让整行起不来，比漏挡更糟）
    if (deny.includes('pwsh') || deny.includes('bash')) push('DENY-PLATFORM', 'deny 里不许写 pwsh/bash（平台二选一，写错那个整行启动失败）')
    if (deny.includes('subagent_fork')) push('DENY-DEAD-NAME', 'deny 里不许写已关掉的行里的工具名（subagent_fork 不再注册）')
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-07 · 除判决岗外都看得见（含 review）；且它真的注册上了
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-07 除判决岗外所有岗位都看得见它（含 review）；且它真的注册上了', async () => {
  await runCase('PFL-07', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const yml = readText(YML)
    if (yml === null) { push('SUT-SURFACE-MISSING', `读不到 ${YML}`); return caseFail(problems) }
    const blocks = rowBlocks(yml)

    // ① 除了判决那一行，任何一行都不许 deny 它
    const leaking = []
    for (const b of blocks) {
      if (b.id === 'tool-job-memory-judge') continue
      const deny = denyOf(b)
      if (deny !== null && deny.includes(TOOL_NAME)) leaking.push(b.id)
    }
    rec.readings.deny_leak = leaking
    if (leaking.length > 0) push('DENY-LEAK', `这些行 deny 了 ${TOOL_NAME}，它们就看不见工具了：${leaking.join(', ')}（只有判决岗该被挡）`)

    // ② review 是唯一受限岗位 —— 这一格必须显式读出来
    const reviewRow = blocks.find((b) => b.id === 'team-review')
    if (reviewRow === undefined) push('ROW-MISSING', '找不到 `- id: team-review` 那一行')
    else {
      const deny = denyOf(reviewRow)
      rec.readings.review_deny = deny
      if (deny !== null && deny.includes(TOOL_NAME)) {
        push('REVIEW-BLOCKED', 'review 这一行 deny 了它 —— review 恰恰最需要这个工具（它没有命令行）')
      }
    }

    // ③ 它必须真的注册上了（两条落法之一；都没有 ⇒ 红）
    const injectSrc = readText(INJECT) ?? ''
    const injectDecl = /export const inject\s*=\s*\[([^\]]*)\]/.exec(injectSrc)
    const declaredServices = injectDecl === null ? [] : injectDecl[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    const branchA = declaredServices.includes('tools') && /\.register\s*\(/.test(injectSrc)
    const newRow = blocks.find((b) => b.id === 'tool-proposal-file')
    const branchB = newRow !== undefined && !isDisabled(newRow)
    rec.readings.registration = {
      inject_services: declaredServices,
      inject_calls_register: /\.register\s*\(/.test(injectSrc),
      yml_row: newRow === undefined ? null : { disabled: isDisabled(newRow) },
    }
    if (!branchA && !branchB) {
      push('REGISTRATION-MISSING', `这个工具一处注册都没有：inject.js 的 inject 数组是 ${JSON.stringify(declaredServices)}、`
        + '里面没有 register 调用，cordis 里也没有 `tool-proposal-file` 这一行')
    }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-08 · 不依赖 shell · 不拆 review 的写边界 · inject 顶层不 import 脑库
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-08 不依赖 shell · 不拆 review 的写边界 · inject 顶层不 import 脑库', async () => {
  await runCase('PFL-08', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const src = readText(TOOL)
    if (src === null) push('SUT-SURFACE-MISSING', `读不到工具模块：${TOOL}`)
    else {
      // ① 一个动作不许变成一条命令行（受限岗位没有 shell ⇒ 工具本身也不能靠 shell）
      const shellNeedles = ['child_process', 'spawnSync', 'spawn(', 'execSync', 'execFile']
      const hit = shellNeedles.filter((n) => src.includes(n))
      rec.readings.shell_needles = hit
      if (hit.length > 0) push('SHELL-ROUTE', `工具实现里出现了 ${JSON.stringify(hit)} —— 一条命令行就是一条绕过写边界的正门`)
      // ② 也不许自己拼一次"追加"（会留半行 ⇒ 整池 E_DATA_CORRUPT）
      if (src.includes('appendFileSync')) push('HALF-LINE', '用了 appendFileSync —— 崩溃时会留半行，半行让整份池子变成 E_DATA_CORRUPT')
      // ③ 落点必须复用脑库的路径常量，不许自己拼一遍
      if (/proposals['"`]\s*,\s*['"`]pool\.jsonl/.test(src) || /['"`]proposals\/pool\.jsonl['"`]/.test(src)) {
        push('PATH-SECOND-SOURCE', '模块里自己拼了 proposals/pool.jsonl —— 路径常量要用 lib/state.mjs 的 poolPath()')
      }
    }

    // ④ review 的写边界一步都不许退（唯一的受限岗位）
    const yml = readText(YML)
    if (yml === null) push('SUT-SURFACE-MISSING', `读不到 ${YML}`)
    else {
      const bound = officeBoundOf(rowBlocks(yml))
      rec.readings.officeBound = bound
      if (bound === null) push('OFFICE-BOUND-SHAPE', '读不出 persona-injector 行的 officeBound 名单（形状变了？）')
      else if (bound.length !== 1 || bound[0] !== 'review') {
        push('OFFICE-BOUND-CHANGED', `officeBound 必须恰为 ['review']，实得 ${JSON.stringify(bound)}`
          + ' —— 让受限岗位拿到一个工具的正路是 deny 名单，不是拆写边界')
      }
    }

    // ⑤ inject.js 顶层不许静态 import 脑库（那会让"脑库一坏 ⇒ 人格注入 0 字符"）
    const injectSrc = readText(INJECT)
    if (injectSrc === null) push('SUT-SURFACE-MISSING', `读不到 ${INJECT}`)
    else {
      const bad = injectSrc.split(/\r?\n/).filter((l) => /^import\s/.test(l) && /\.\/lib\//.test(l))
      rec.readings.inject_toplevel_lib_imports = bad
      if (bad.length > 0) push('LOADABILITY', `inject.js 顶层静态 import 了脑库：${bad.join(' | ')}（要用就 await import()）`)
    }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-09 · 冻结契约同步：冻结 ID 一条不少 · 体检指名 · 增量常量对账
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-09 冻结契约同步：冻结 ID 一条不少 · 体检指名 · 增量常量对账', async () => {
  await runCase('PFL-09', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    // ① 冻结清单：55 条（**历史冻结的条数**，不是分母）+ 每一条都在登记表里 + 每一条都在盘上。
    //    判据要能翻面：删掉一条登记行、或盘上删一个 test() ⇒ 这里必须红。
    const frozen = [...FROZEN_IDS]
    const dupIds = frozen.filter((id, i) => frozen.indexOf(id) !== i)
    const registered = new Set(REGISTRY.map((r) => r.id))
    const onDisk = new Set(DISCOVERY.cases.map((c) => c.id))
    const missingReg = frozen.filter((id) => !registered.has(id))
    const missingDisk = frozen.filter((id) => !onDisk.has(id))
    rec.readings.frozen = { count: frozen.length, duplicates: dupIds, missing_in_registry: missingReg, missing_on_disk: missingDisk }
    if (frozen.length !== FROZEN_COUNT) push('FROZEN-COUNT', `冻结清单 ${frozen.length} 条 ≠ ${FROZEN_COUNT}（历史冻结一条不许少）`)
    if (dupIds.length > 0) push('FROZEN-DUP', `冻结清单里有重复 ID：${dupIds.join(', ')}`)
    if (missingReg.length > 0) push('FROZEN-MISSING', `冻结 ID 从登记表里消失了：${missingReg.join(', ')}`)
    if (missingDisk.length > 0) push('FROZEN-OFF-DISK', `冻结 ID 在盘上找不到对应的用例：${missingDisk.join(', ')}`)

    // ②–④ 要读 `.tools/check-notes.mjs`（组长的格子，**不随 tests 树走**）：
    //     这棵树里没有它 ⇒ 判不了，记 HOLD 并写明理由（不许拿树外那一份冒充本树的读数）。
    const notes = readText(CHECK_NOTES)
    if (notes === null) {
      caseHold(rec, 'CHECK-NOTES-ABSENT', `.tools/check-notes.mjs 不在这棵树里（${CHECK_NOTES}）—— 那份体检脚本不随 tests 树走；②③④ 在本树里判不了`)
      return caseFail(problems)
    }
    const named = notes.includes(TOOL_NAME) || notes.includes('tool-proposal-file')
    rec.readings.check_notes_names_it = named
    if (!named) {
      push('CHECK-NOTES-MISSING', `体检脚本里一个字都没提 ${TOOL_NAME} —— 「同批更新」没做：这个工具加进去之后，没有任何体检判据盯着它`)
    }

    // ③ 增量常量对账：若加了 cordis 行，EXPECTED_ONLY_AGENIA 必须同批 +1
    const yml = readText(YML)
    if (yml === null) push('SUT-SURFACE-MISSING', `读不到 ${YML}`)
    else {
      const newRow = rowBlocks(yml).find((b) => b.id === 'tool-proposal-file')
      const m = /const EXPECTED_ONLY_AGENIA\s*=\s*(\d+)/.exec(notes)
      const expected = m === null ? null : Number(m[1])
      rec.readings.expected_only_agenia = expected
      rec.readings.has_proposal_row = newRow !== undefined
      if (expected === null) push('CONST-MISSING', '读不出体检里的 EXPECTED_ONLY_AGENIA 常量')
      else {
        const want = newRow === undefined ? 10 : 11
        if (expected !== want) {
          push('CONST-DRIFT', `EXPECTED_ONLY_AGENIA 应为 ${want}（${newRow === undefined ? '还没加行 ⇒ 保持 10' : '加了 tool-proposal-file 行 ⇒ 必须 11'}），实得 ${expected}`)
        }
      }
      // ④ 委派名单的反例：它不是 dsh-tool-subagent 实例 ⇒ 放进 delegationTools 会让体检红
      if (newRow !== undefined) {
        const inj = rowBlocks(yml).find((b) => b.id === 'persona-injector')
        const dtAt = inj === undefined ? -1 : inj.lines.findIndex((l) => /^\s*delegationTools:\s*$/.test(l))
        if (dtAt >= 0) {
          const dtLines = []
          const base = inj.lines[dtAt].length - inj.lines[dtAt].trimStart().length
          for (let i = dtAt + 1; i < inj.lines.length; i += 1) {
            const line = inj.lines[i]
            if (line.trim() === '' || /^\s*#/.test(line)) continue
            if (line.length - line.trimStart().length <= base) break
            dtLines.push(line.trim())
          }
          rec.readings.delegationTools = dtLines
          if (dtLines.some((l) => l.startsWith(`${TOOL_NAME}:`))) {
            push('DELEGATION-NAME', `delegationTools 里出现了 ${TOOL_NAME} —— 它不是 dsh-tool-subagent 实例，体检那条「名单 = 组合自己」会因此红`)
          }
        }
      }
    }
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-10 · 落点：判重与追加在同一把锁里（持锁时不写 · 两进程只进一条）
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-10 落点：判重与追加在同一把锁里（持锁时不写 · 两进程只进一条）', async () => {
  await runCase('PFL-10', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!existsSync(TOOL)) { push('SUT-SURFACE-MISSING', `读不到工具模块：${TOOL}`); return caseFail(problems) }
    const root = makeRoot('PFL-10')

    // ── ① 确定性那一半：池子锁被别人（我这个进程）持着 ⇒ 它必须报 E_PROPOSAL_IO，且零写入
    const atomic = await importFresh(path.join(PRESET, 'lib', 'atomic.mjs'))
    const state = await importFresh(path.join(PRESET, 'lib', 'state.mjs'))
    const lockPath = state.poolLockPath(root)
    mkdirSync(path.dirname(lockPath), { recursive: true })
    const held = atomic.acquireLock(lockPath, { purpose: 'pfl-10-case-holds-it' })
    rec.readings.lock_held = held.ok === true
    if (held.ok !== true) { push('SCAFFOLD-LOCK', `测试自己没拿到锁：${held.code} ${held.message}`); return caseFail(problems) }
    let locked = null
    try {
      locked = await runWorker({ root, at: AT, day: DAY, text: '锁被别人握着时提的那一条', source: '出处 A' })
    } finally {
      atomic.releaseLock(lockPath)
    }
    rec.readings.locked_result = locked
    if (locked === null) push('THROWN', '持锁时那次调用没跑出结果（子进程没留下读数）')
    else {
      if (locked.ok === true) push('LOCK-IGNORED', '锁被别人握着，它照样写进去了 —— 说明它根本没走池子锁')
      else {
        if (locked.code !== CODES.IO) push('LOCK-CODE', `锁拿不到应当回 ${CODES.IO}（报文里带 E_LOCK_HELD），实得 ${JSON.stringify(locked.code)}`)
        if (!String(locked.message ?? '').includes('E_LOCK_HELD')) push('LOCK-NAME', `报文里必须给出底层码 E_LOCK_HELD，实得 ${JSON.stringify(locked.message)}`)
      }
      const pool = poolRows(root)
      if (pool.rows === null) push('POOL-CORRUPT', `池子第 ${pool.corruptLine} 行不是合法 JSON`)
      else if (pool.rows.length !== 0) push('PARTIAL-WRITE', `拿不到锁的那次调用写了 ${pool.rows.length} 行 —— 拒绝必须零写入`)
    }

    // ── ② 机会性那一半：两个**真进程**同时提同一条 ⇒ 一个成功 + 一个 DUPLICATE，池子只进一条
    //    ⚠️ 照实说：两个进程不一定真重叠，承重的是 ①；这一格抓的是"先无锁判重、再追加"那种写法。
    const rounds = []
    for (let n = 1; n <= 3; n += 1) {
      const args = { root, at: AT, day: DAY, text: `并发样本 #${n}`, source: `并发出处 #${n}` }
      const [x, y] = await Promise.all([runWorker(args), runWorker(args)])
      const pool = poolRows(root)
      rounds.push({
        n,
        a: x?.ok === true ? 'OK' : x?.code ?? null,
        b: y?.ok === true ? 'OK' : y?.code ?? null,
        rows: pool.rows === null ? `corrupt@${pool.corruptLine}` : pool.rows.length,
      })
      if (x === null || y === null) { push('THROWN', `第 ${n} 轮有子进程没留下读数`); continue }
      const oks = [x, y].filter((r) => r.ok === true).length
      const dups = [x, y].filter((r) => r.ok !== true && r.code === CODES.DUP).length
      if (oks !== 1) push('RACE-SUCCESS', `第 ${n} 轮成功次数必须是 1，实得 ${oks}`)
      if (dups !== 1) push('RACE-DUP', `第 ${n} 轮必须恰好一个是 ${CODES.DUP}，实得 ${dups}（另一个的码：${[x, y].filter((r) => r.ok !== true).map((r) => r.code).join('/')}）`)
      if (pool.rows === null) push('POOL-CORRUPT', `第 ${n} 轮之后池子第 ${pool.corruptLine} 行不是合法 JSON`)
      else if (pool.rows.length !== n) push('POOL-COUNT', `第 ${n} 轮之后池子必须恰好 ${n} 行，实得 ${pool.rows.length} 行`)
    }
    rec.readings.race_rounds = rounds
    caseFail(problems)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PFL-11 · 不许按人拒绝：主路不吃身份也照样能提
// ═════════════════════════════════════════════════════════════════════════════
test('PFL-11 不许按人拒绝：主路不吃身份也照样能提（正门在配置里，不在代码里）', async () => {
  await runCase('PFL-11', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const root = makeRoot('PFL-11')
    const loaded = await loadTool()
    if (loaded.mod === null) { push('SUT-SURFACE-MISSING', `工具模块取不到：${TOOL}（${loaded.error}）`); return caseFail(problems) }

    // ① 行为：完全不提供身份，一次调用必须成功（"主路不吃身份"是这套设计成立的必要条件）
    const r = await callRun(loaded.mod, { text: '不带任何身份的调用', source: '出处：无身份' }, { root, at: AT, day: DAY })
    rec.readings.no_identity = r.ok ? 'ACCEPTED' : { code: r.code, message: r.message }
    if (!r.ok) push('IDENTITY-REQUIRED', `不带身份的调用竟然被拒（${r.code}: ${r.message}）—— 说明它在按人判`)

    // ② 辅证（黑名单型）：模块源码里不许出现"按人判"的名字
    const src = readText(TOOL) ?? ''
    const needles = ['memory-judge', 'memory_judge', 'officeBound', 'roleOfAgent', '【组员']
    const hit = needles.filter((n) => src.includes(n))
    rec.readings.identity_needles = hit
    if (hit.length > 0) {
      push('IDENTITY-SNIFF', `工具模块里出现了 ${JSON.stringify(hit)} —— 这像是"认出判决岗再拒绝"。真要挡就在 toolFilter.deny 里挡`)
    }
    caseFail(problems)
  })
})
