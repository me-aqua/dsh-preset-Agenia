/**
 * **靶子过期判据**（F-105）—— 一份量测 + 一个纯函数判定。
 *
 * 问题（2026-10-19 复量）：测试唯一被测树是 `PATHS.stagedPreset`（设计如此，不推翻），
 * 而 staged 的 `inject.js` 是 **109601 B**、现役 `presets/agenia/inject.js` 是 **129771 B** ——
 * **落后 20170 B**，少五样功能（`commonSenseOf` / `timeLineOf` / `lastBoardPosted` /
 * `proposalFileEnabled` / `boardChanged`）。于是"靠 `inject.js` 行为验的绿"测的是**没有这五样**的旧版，
 * 而**没有任何东西在盯它腐烂**。
 *
 * 契约（`F-105-契约.md` §1）：**落后允许，静默不许。**
 *   · 靶子与现役**逐字节相同** ⇒ 绿（这是目标态）；
 *   · 不一致 ⇒ 必须有一条声明，写明 **哪一份文件 · 落后多少字节 · 缺哪几样（逐字）· 谁批的 · 为什么**；
 *   · 声明与实测**任何一格对不上**（多报、少报、把相等写成落后、编一个不存在功能名）⇒ 红。
 * 两个方向都会被这条判据抓住 ⇒ 它能翻面（"永远红"和"永远绿"都不是判据）。
 *
 * 🔴 判据覆盖不到的两件事（写在明处，别指望它）：
 *   ① 声明里的 `reason` / `approved_by` 只是**非空**才收 —— 判据验不了"谁真的点了头"；
 *   ② 功能名目录之外的新功能看不见（见 `FROZEN.targetLag.markers` 的 🔴 那条）——
 *      能兜底的只有字节数/哈希（它们逐字节对得上，藏不住**改了什么**，只藏得住**叫它什么**）。
 *
 * ── `F-123`（2026-10-22）：输入口径从"名单"改成"逐树枚举" ──────────────────────
 * 从前判据只盯 `FROZEN.targetLag.watchedFiles = ['inject.js']` —— 48 份代码里 1 份。
 * 现在 `measureTarget()` 在量测那一刻把两棵树的每份文件（相对路径 + 字节 sha256）都枚举出来；
 * 名单里那些功能名（`markers`）只用来**说清差的是什么功能**，不再是"看哪几份"的口径。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { FROZEN, PATHS } from './env.mjs'

/** 判据自己的问题码（每个码一句话，测试与入口共用同一份）。 */
export const TARGET_CODES = [
  'TARGET-SURFACE-MISSING',
  'TARGET-LAG-UNDECLARED',
  'TARGET-LAG-STALE-DECLARATION',
  'TARGET-DECLARATION-SHAPE',
  'TARGET-DECLARATION-FIELD',
  'TARGET-DECLARATION-MISMATCH',
  'TARGET-MARKER-UNDERCLAIM',
  'TARGET-MARKER-OVERCLAIM',
  'TARGET-MARKER-UNKNOWN',
]

/** 声明里每一行必须写满的散文字段（空字符串 = 没写）。 */
export const DECLARATION_TEXT_FIELDS = ['reason', 'approved_by', 'approved_on', 'closes_when']

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** 量一份文件（存在性 / 字节数 / sha256 / 正文）。 */
export function measureOne(root, file) {
  const abs = path.join(root, file)
  if (!existsSync(abs)) return { file, abs, exists: false, bytes: null, sha256: null, text: '' }
  const buf = readFileSync(abs)
  return { file, abs, exists: true, bytes: buf.length, sha256: sha256(buf), text: buf.toString('utf8') }
}

/**
 * 量一对树（靶子 ↔ 现役）—— **逐文件枚举两棵树**（`F-123` · 2026-10-22）。
 *
 * 从前这里按 `FROZEN.targetLag.watchedFiles` 走一份**手维护的名单**（`['inject.js']`）：
 * 48 份代码里只盯 1 份 ⇒ 把 `lib/receipt.mjs` 的 `REJECT_REASON_MIN_CHARS` 10→999，
 * 判据照旧 `state=equal / ok=true`（2026-10-22 阳性对照实测）。
 * 现在：**每份文件的相对路径 + 字节 sha256 在量测那一刻现枚举**（两棵树取并集）——
 * 名单加长过不了"同一新路径上两棵树内容不同"那一格，枚举过得了。
 *
 * 数据目录（`FROZEN.targetLag.dataSegments`，现在是 `.runtime`）**任一段命中即跳过**：
 * 那是共享记忆库的数据，本来就不该同步进靶子；不排除 ⇒ 判据常驻红（`cand-20261019-0042`）。
 * ⚠️ 与 `.tools/fingerprint.mjs` 那把尺子的口径**故意不同**：那边判"是不是被算成代码"，
 *    所以只排**根相对**的 `.runtime/`（`lib/.runtime/…` 这种该算代码）；
 *    这里判"算不算漂移"，与 `evidence.mjs::stagedVsLiveDrift`（STAT-01 那条）逐字同口径 —— 两个读者必须说同一句话。
 *
 * 根可注入 ⇒ 阳性对照能在沙盒里跑**同一份**量测（不是另写一份）。
 */
export function measureTarget({
  stagedRoot = PATHS.stagedPreset,
  baselineRoot = PATHS.finalPreset,
  dataSegments = FROZEN.targetLag.dataSegments,
} = {}) {
  const stagedMap = walkTree(stagedRoot, dataSegments)
  const baselineMap = walkTree(baselineRoot, dataSegments)
  const rels = [...new Set([...stagedMap.keys(), ...baselineMap.keys()])]
    .sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
  return {
    stagedRoot,
    baselineRoot,
    data_segments: dataSegments,
    staged_files: stagedMap.size,
    baseline_files: baselineMap.size,
    files: rels.map((file) => ({ file, staged: measureOne(stagedRoot, file), baseline: measureOne(baselineRoot, file) })),
  }
}

/**
 * 枚举一棵树的普通文件（相对路径 `/` 分隔 ⇒ 绝对路径），**跳过数据目录**。
 * 只读；读不动 / 不存在的根 ⇒ 空表（"量不到"由 `actuals` 的 `missing_*` 说出来）。
 */
function walkTree(root, dataSegments) {
  const out = new Map()
  if (root === undefined || root === null || !existsSync(root)) return out
  const go = (dir) => {
    let names = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      if (dataSegments.includes(name)) continue
      const full = path.join(dir, name)
      let st = null
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) go(full)
      else if (st.isFile()) out.set(path.relative(root, full).replace(/\\/g, '/'), full)
    }
  }
  go(root)
  return out
}

/** 读声明；缺文件 / 坏 JSON 都如实回报，不抛。 */
export function readDeclaration(p = PATHS.targetLagDeclaration) {
  if (!existsSync(p)) return { path: p, present: false, error: null, value: null }
  let raw
  try {
    raw = readFileSync(p, 'utf8')
  } catch (err) {
    return { path: p, present: true, error: `读不到：${err.message}`, value: null }
  }
  try {
    return { path: p, present: true, error: null, value: JSON.parse(raw) }
  } catch (err) {
    return { path: p, present: true, error: `不是合法 JSON：${err.message}`, value: null }
  }
}

const fmt = (n) => String(n)

/**
 * 一个文件的**实测事实**。
 *
 * `state`：`equal` 逐字节相同 · `behind` 靶子更小（落后）· `ahead` 靶子更大 ·
 *          `differ` 字节数相同但内容不同 · `missing_in_target` / `missing_in_baseline` 少一边。
 * `lag_bytes` = `现役字节数 − 靶子字节数`（**正数 = 落后**；负数 = 靶子更大）。
 * `missing_markers` = 目录里那些**现役有、靶子没有**的功能名（按目录顺序）。
 */
export function actualOf(entry, markers = FROZEN.targetLag.markers) {
  const { file, staged, baseline } = entry
  const present = (side, m) => side.exists && side.text.includes(m)
  const missing = markers.filter((m) => present(baseline, m) && !present(staged, m))
  const head = {
    file,
    staged: staged.exists ? { bytes: staged.bytes, sha256: staged.sha256 } : null,
    baseline: baseline.exists ? { bytes: baseline.bytes, sha256: baseline.sha256 } : null,
    missing_markers: missing,
  }
  if (!staged.exists || !baseline.exists) {
    return {
      ...head,
      state: staged.exists ? 'missing_in_baseline' : 'missing_in_target',
      lag_bytes: null,
    }
  }
  if (staged.sha256 === baseline.sha256) return { ...head, state: 'equal', lag_bytes: 0 }
  const lag = baseline.bytes - staged.bytes
  return { ...head, state: lag > 0 ? 'behind' : lag < 0 ? 'ahead' : 'differ', lag_bytes: lag }
}

/** 人读的一行（入口的 `F57-TARGET` / 用例的读数都用它）。 */
export function describeActual(a) {
  if (a.state === 'missing_in_target') return `${a.file} 靶子里没有这份文件（现役 ${fmt(a.baseline?.bytes)} B）`
  if (a.state === 'missing_in_baseline') return `${a.file} 现役里没有这份文件（靶子 ${fmt(a.staged?.bytes)} B）`
  if (a.state === 'equal') return `${a.file} 逐字节相同（${fmt(a.staged.bytes)} B · sha256 ${a.staged.sha256.slice(0, 12)}…）`
  const tail = a.missing_markers.length === 0
    ? '功能名目录里没缺任何一样'
    : `缺 ${a.missing_markers.length} 样：${a.missing_markers.join(' / ')}`
  if (a.state === 'differ') {
    return `${a.file} 字节数相同但内容不同（${fmt(a.staged.bytes)} B 对 ${fmt(a.baseline.bytes)} B · sha256 不同）· ${tail}`
  }
  const how = a.state === 'behind' ? '落后' : '反而更大'
  return `${a.file} ${how} ${Math.abs(a.lag_bytes)} B（靶子 ${fmt(a.staged.bytes)} B → 现役 ${fmt(a.baseline.bytes)} B）· ${tail}`
}

/**
 * 判定（纯函数）：实测 + 声明 → `{ok, state, line, actuals, problems}`。
 *
 * @param {object} input
 * @param {ReturnType<typeof measureTarget>|{files: Array<{file:string,staged:object,baseline:object}>}} input.measured
 * @param {{path?:string,present:boolean,error?:string|null,value:object|null}} [input.declaration]
 * @param {string[]} [input.markers]
 * @param {number} [input.schema]
 * @returns {{ok:boolean,state:'equal'|'declared'|'stale',line:string,actuals:object[],problems:{code:string,message:string}[]}}
 */
export function targetVerdict({
  measured,
  declaration = { path: PATHS.targetLagDeclaration, present: false, error: null, value: null },
  markers = FROZEN.targetLag.markers,
  schema = FROZEN.targetLag.schema,
} = {}) {
  const problems = []
  const push = (code, message) => problems.push({ code, message })
  const actuals = measured.files.map((e) => actualOf(e, markers))
  const dpath = declaration.path ?? PATHS.targetLagDeclaration

  // ── ① 声明本身：在不在、读不读得动、形状对不对 ────────────────────────────
  let entries = []
  if (declaration.present) {
    if (declaration.error !== null && declaration.error !== undefined) {
      push('TARGET-DECLARATION-SHAPE', `声明文件读不动：${dpath} —— ${declaration.error}`)
    } else {
      const d = declaration.value
      if (d === null || typeof d !== 'object' || Array.isArray(d)) {
        push('TARGET-DECLARATION-SHAPE', `声明文件不是对象：${dpath}`)
      } else if (d.schema !== schema) {
        push('TARGET-DECLARATION-SHAPE', `声明文件的 schema 应为 ${schema}，实得 ${JSON.stringify(d.schema)}（${dpath}）`)
      } else if (!Array.isArray(d.entries)) {
        push('TARGET-DECLARATION-SHAPE', `声明文件缺 entries 数组（${dpath}）`)
      } else {
        entries = d.entries
      }
    }
  }

  // ── ② 声明的每一行：字段齐不齐、盯的是不是判据范围内的文件 ────────────────
  const watched = new Set(actuals.map((a) => a.file))
  const byFile = new Map()
  for (const [i, e] of entries.entries()) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) {
      push('TARGET-DECLARATION-SHAPE', `entries[${i}] 不是对象`)
      continue
    }
    if (typeof e.file !== 'string' || e.file.trim() === '') {
      push('TARGET-DECLARATION-SHAPE', `entries[${i}] 缺 file`)
      continue
    }
    if (!watched.has(e.file)) {
      push('TARGET-DECLARATION-SHAPE', `声明盯了一个判据不管的文件：entries[${i}].file = ${JSON.stringify(e.file)}（判据逐树枚举 ${watched.size} 份，里面没有它）`)
      continue
    }
    if (byFile.has(e.file)) {
      push('TARGET-DECLARATION-SHAPE', `同一个文件被声明了两次：${e.file}`)
      continue
    }
    byFile.set(e.file, e)
    for (const f of DECLARATION_TEXT_FIELDS) {
      if (typeof e[f] !== 'string' || e[f].trim() === '') {
        push('TARGET-DECLARATION-FIELD', `声明 ${e.file} 的 ${f} 是空的 —— 落后要有人认领、有理由、有收口条件`)
      }
    }
    if (!Array.isArray(e.missing_markers)) {
      push('TARGET-DECLARATION-SHAPE', `声明 ${e.file} 的 missing_markers 不是数组`)
    } else {
      if (new Set(e.missing_markers).size !== e.missing_markers.length) {
        push('TARGET-DECLARATION-SHAPE', `声明 ${e.file} 的 missing_markers 有重复项`)
      }
      for (const m of e.missing_markers) {
        if (!markers.includes(m)) {
          push('TARGET-MARKER-UNKNOWN', `声明 ${e.file} 说缺「${m}」，可它不在冻结的功能名目录里（${markers.join(' / ')}）—— 编出来的名字既看不见也证不了`)
        }
      }
    }
  }

  // ── ③ 逐文件对账：差一点都要点名 ────────────────────────────────────────
  for (const a of actuals) {
    const e = byFile.get(a.file)
    if (a.state === 'missing_in_target' || a.state === 'missing_in_baseline') {
      push('TARGET-SURFACE-MISSING', `量不到 ${a.file}：${describeActual(a)} —— 判据没法判，先把它放回盘上`)
      continue
    }
    if (a.state === 'equal') {
      if (e !== undefined) {
        push('TARGET-LAG-STALE-DECLARATION', `声明说 ${a.file} 落后，实测却与现役逐字节相同（${fmt(a.staged.bytes)} B）—— 声明过期了，删掉它（${dpath}）`)
      }
      continue
    }
    if (e === undefined) {
      push('TARGET-LAG-UNDECLARED', `${describeActual(a)} —— 而 ${dpath} 没有这一份（或整份不存在）：靶子落后本身不算错，**没声明的落后**才是`)
      continue
    }
    // 声明在：状态 / 字节 / 双向哈希逐项对
    const mismatches = []
    if (e.state !== a.state) mismatches.push(`state 应为 ${a.state}，实得 ${JSON.stringify(e.state)}`)
    if (e.lag_bytes !== a.lag_bytes) mismatches.push(`lag_bytes 应为 ${a.lag_bytes}，实得 ${JSON.stringify(e.lag_bytes)}`)
    if (e.sha256 !== a.staged.sha256) mismatches.push(`sha256（靶子）应为 ${a.staged.sha256}，实得 ${JSON.stringify(e.sha256)}`)
    if (e.baseline_sha256 !== a.baseline.sha256) mismatches.push(`baseline_sha256 应为 ${a.baseline.sha256}，实得 ${JSON.stringify(e.baseline_sha256)}`)
    if (mismatches.length > 0) {
      push('TARGET-DECLARATION-MISMATCH', `声明 ${a.file} 与实测对不上：${mismatches.join(' · ')} —— 声明的每一个数都必须能复现（${dpath}）`)
    }
    // 功能名：少报 / 多报
    const declared = Array.isArray(e.missing_markers) ? e.missing_markers.filter((m) => markers.includes(m)) : []
    const under = a.missing_markers.filter((m) => !declared.includes(m))
    if (under.length > 0) {
      push('TARGET-MARKER-UNDERCLAIM', `声明 ${a.file} 漏报 ${under.length} 样：${under.join(' / ')} —— 现役有、靶子没有的，必须逐字点名`)
    }
    const over = declared.filter((m) => !a.missing_markers.includes(m))
    if (over.length > 0) {
      push('TARGET-MARKER-OVERCLAIM', `声明 ${a.file} 多报 ${over.length} 样：${over.join(' / ')} —— 它们在靶子里本来就在（声明会把"已经补上的"说成"还缺"）`)
    }
  }

  const ok = problems.length === 0
  const state = !ok ? 'stale' : entries.length > 0 ? 'declared' : 'equal'
  const line = describeLine(state, actuals, dpath, measured)
  return { ok, state, line, actuals, problems }
}

/**
 * 入口那一行（`F57-TARGET`）—— 绿的时候也要说清打的是哪棵树、差多少。
 * 逐树枚举之后**相同的那一堆只报一句汇总**（48 份逐字节相同），**差的逐份点名**（差在哪是这一行的用处）。
 */
function describeLine(state, actuals, dpath, measured = null) {
  if (actuals.length === 0) return 'F57-TARGET 判据没盯任何文件（两棵树都枚举不出普通文件）—— 这一行不算证据'
  const diffs = actuals.filter((a) => a.state !== 'equal')
  const data = Array.isArray(measured?.data_segments) && measured.data_segments.length > 0
    ? `（任一段 ${measured.data_segments.join(' / ')} 是数据，不参与）`
    : ''
  const summary = diffs.length === 0
    ? `${actuals.length} 份逐字节相同${data}`
    : `逐树枚举 ${actuals.length} 份 · 差 ${diffs.length} 份：${diffs.map(describeActual).join(' · ')}`
  if (state === 'equal') return `F57-TARGET 靶子=现役 · ${summary}`
  if (state === 'declared') return `F57-TARGET 靶子落后（已声明）· ${summary} · 声明 ${dpath}`
  return `F57-TARGET 靶子落后（未声明或不符）· ${summary} · 声明应在 ${dpath}`
}

/** 一次跑完（入口与用例共用）：量测 → 读声明 → 判定。 */
export function targetReport({
  stagedRoot = PATHS.stagedPreset,
  baselineRoot = PATHS.finalPreset,
  declarationPath = PATHS.targetLagDeclaration,
} = {}) {
  const measured = measureTarget({ stagedRoot, baselineRoot })
  const declaration = readDeclaration(declarationPath)
  const verdict = targetVerdict({ measured, declaration })
  return { ...verdict, measured, declaration }
}
