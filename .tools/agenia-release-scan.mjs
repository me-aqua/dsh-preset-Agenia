#!/usr/bin/env node
/**
 * `agenia-release-scan.mjs` —— **装后 / 发布前**的五类扫描。
 *
 * ── 五类（逐条对应派工单；每一类都给**稳定码**，正例负例都能各自点名）────────
 *   ① **活体树与 staged 清单逐项相符**
 *      `SCAN-LIVE-MISSING`（发布清单里有、活体没有）· `SCAN-LIVE-DIFF`（两边 SHA 不同）·
 *      `SCAN-LIVE-EXTRA`（活体有、发布清单没有的**代码**）
 *      ⚠️ 比较时**剔掉数据目录**（`.runtime` / `.team` 那些段）—— 它们是活体上本来就有的东西，
 *         不是"多出来的代码"。
 *   ② **没有任何文件落 C 盘**
 *      `SCAN-C-DRIVE`（**代码文件**里出现 C 盘字面量：`.mjs/.js/.cjs/.ts/.yml/.json/.ps1/.sh/.cmd/.bat`）·
 *      `SCAN-TEMP-DEFAULT`（代码用了进程默认临时目录 —— 那默认在 C 盘）·
 *      `SCAN-LANDING-C`（**本次扫描自己的落点**：`--backup` 等解析到 C 盘）。
 *      ⚠️ **散文（`.md`）里的 C 盘字面量不算 finding** —— 历史记载（"全组往 `C:\dsh_*` 塞了 39.6 GB"）
 *         和落点风险是两件事。它们照记在 `info.c_drive_prose` 里，给人看。
 *   ③ **无密钥 / 凭据字样泄漏**
 *      `SCAN-SECRET`（高信号凭据形状：`sk-…` / `AKIA…` / `ghp_…` / `xox…` / `-----BEGIN … PRIVATE KEY-----`
 *      / `api_key|apikey|password|secret|Bearer` 后面跟着长字面量）·
 *      `SCAN-SECRET-FILE`（**`api.txt` 这种凭据文件出现在发布树里** —— AGENTS.md §5：它绝对不能进版本库，
 *      更不许进预设）。
 *   ④ **补丁与组合一致（结构对账）**
 *      `SCAN-PATCH-DRIFT`（`cordis.patch.yml` 里的插件行序列与 `agent.cordis.yml` 的顶格行**对不上**）·
 *      `SCAN-PATCH-ROW-TEXT`（行正文与源不一致）· `SCAN-PATCH-PATH`（两处绝对路径没指向**活体**）·
 *      `SCAN-PATCH-INCLUDE`（用了 `cordis:include` —— 实测在预设里挂不起来）·
 *      `SCAN-PATCH-REGISTRATION`（注册行 `id: agenia` / `name: @deepseek-ai/dsh-agent-preset` 不在）。
 *      🔴 **本文件绝不加载、绝不执行 `.tools/make-bundle-patch.mjs`**（A11：那个生成器**加载期就会写活体**）。
 *         这里的对账是**照着生成器的形状独立重写的**（切块 / 缩进 / 两处改写各一份），
 *         所以「两边同时错」这种镜像风险是存在的 —— 因此对账**分开报五项**，不是一句"文本相等"。
 *   ⑤ **十份注入文本齐 + 行数口径照冻结值**
 *      `SCAN-INJECT-MISSING`（少了一份）· `SCAN-INJECT-LINES`（行数与冻结表对不上）·
 *      `SCAN-INJECT-DRIFT`（staged 与活体两边内容不同）。
 *      「十份」= `team/<role>.md` 那十份**岗位说明书**（`staged.teamFiles = 10`）；组长侧那五份
 *      （`leader` / `work-guidelines` / `persona` / `me-aqua` / `style`）一并量，共 15 份。
 *      **行数口径**：剥掉开头 BOM 之后数 `\n`（CRLF 算一个换行）。改了注入文本 ⇒
 *      `--op frozen-lines` 打出新表，贴回本文件头即可（**不静默改判据**）。
 *
 * ── 退出码 / findings 的关系（说清楚，免得把"跑完了"读成"没问题"）────────────
 *   默认：跑完 ⇒ 退出 0，**findings 是数据**（`findings` 数组 + `counts.by_code`）。
 *   `--strict`：findings 非空 ⇒ 退出 5（校验拒绝族）。R1 那一档应当带 `--strict`。
 *   发布物**不存在** ⇒ 五类**一律不跑**：`checks[].status = "NOT-APPLICABLE"`、
 *   `findings: []`、退出 0 —— **"判不了"与"没问题"在报告里是两个字段**（`skips` vs `findings`）。
 *
 * ── CLI 形状 ───────────────────────────────────────────────────────────────
 *   `--release <dir>`  发布物根（可给"预设根"本身，也可给"装着 presets/agenia 的那一层"）
 *   `--staged <dir>`   源侧（默认 = 发布物根；都没给 ⇒ `<repo>/.tools/_staging/agenia-upgrade/preset`）
 *   `--live <dir>`     活体（默认 = `<repo>/presets/agenia`）
 *   `--backup <dir>`   备份落点（只**看**它合不合规，绝不写它）
 *   `--repo <dir>`     仓库根（默认 = 本脚本的上一级）
 *   `--strict`         findings 非空 ⇒ 退出 5
 *   `--op scan|frozen-lines|help`
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const REPO = path.resolve(path.dirname(SELF), '..')
const CLI_NAME = 'release-scan.mjs'
const OP_NAMES = ['scan', 'frozen-lines', 'help']
const PROTECTED_SEGMENTS = ['.runtime', '.team']

const CODES = Object.freeze({ E_USAGE: 2, E_ARG_SCHEMA: 2, E_ROOT_MISSING: 3, E_ROOT_RELATIVE: 3, E_ROOT_UNC: 3, E_ROOT_C_DRIVE: 3, E_PATH_ESCAPE: 3, E_MANIFEST_MISMATCH: 5, E_INTERNAL: 8 })

/** 九份岗位说明书（顺序照契约 §B2.3 的角色表）。`team/retro.md` 不在里面：
 *  复盘岗 2026-10-15 已撤、那份说明书已删 —— 列着它，每一轮扫描都会报一条假的"文件不存在"。 */
const ROLE_TEXTS = [
  'team/design.md', 'team/dev.md', 'team/test.md', 'team/review.md', 'team/hire.md',
  'team/memory-judge.md', 'team/memory-review.md', 'team/conversation-review.md', 'team/technical-review.md',
]
/** 组长侧那几份（`leaderOrder` 里的 .md 键）—— ⚠️ 不含 `me-aqua.md`：它 2026-10-17 已归档出预设
 *  （关于老板的事实改由共享记忆 `boss` 类承载）。 */
const LEADER_TEXTS = ['leader.md', 'work-guidelines.md', 'persona.md', 'style.md']

/**
 * 冻结行数表（口径：剥 BOM 后数 `\n`；CRLF 算一个换行）。
 * 🔴 **基准树 = `presets/agenia`（发布出去的那一棵）**，量于 2026-10-17。
 *    · 为什么不是 `.tools/_staging/agenia-upgrade/preset/`：那是一份**升级演练副本**，
 *      它跟着演练走、不跟着发布走 —— 2026-10-17 实测它里面还是 208 行的旧 `leader.md`，
 *      而发布出去的是 98 行。拿它当尺子 ⇒ 每改一次正文就报一堆"行数不符"，而真正被改的那个文件反而是"对"的。
 *    · 这张表要保的是「**注入正文被人偷偷改了，得发现**」—— 那就只能钉在**发出去的那一份**上。
 * 改了注入文本 ⇒ `<node> .tools/agenia-release-scan.mjs --op frozen-lines --release <根>` 打新表贴回来。
 */
const FROZEN_LINES = Object.freeze({
  'leader.md': 98,
  'work-guidelines.md': 123,
  'persona.md': 19,
  'style.md': 99,
  'team/design.md': 11,
  'team/dev.md': 11,
  'team/test.md': 13,
  'team/review.md': 69,
  'team/hire.md': 18,
  'team/memory-judge.md': 53,
  'team/memory-review.md': 67,
  'team/conversation-review.md': 66,
  'team/technical-review.md': 44,
})

/** 两处绝对路径的**目标**（与 `FROZEN.patchTargets` 同值）：补丁指的是**装好之后**那个位置。 */
const CODE_EXT = /\.(mjs|cjs|js|mts|cts|ts|yml|yaml|json|ps1|sh|cmd|bat)$/i
const PROSE_EXT = /\.(md|markdown|txt)$/i

function cliError(code, message) {
  const err = new Error(message)
  err.name = 'ScanCliError'
  err.code = code
  return err
}

// ── 参数 ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { op: 'scan', release: null, staged: null, live: null, backup: null, repo: REPO, strict: false }
  const takesValue = new Set(['--op', '--release', '--staged', '--live', '--backup', '--repo'])
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) throw cliError('E_USAGE', `不认这个位置参数：${JSON.stringify(a)}`)
    if (takesValue.has(a)) {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) throw cliError('E_USAGE', `${a} 后面要跟一个值`)
      i += 1
      if (a === '--op') out.op = v
      else if (a === '--release') out.release = v
      else if (a === '--staged') out.staged = v
      else if (a === '--live') out.live = v
      else if (a === '--backup') out.backup = v
      else if (a === '--repo') out.repo = v
      continue
    }
    if (a === '--strict') out.strict = true
    else throw cliError('E_USAGE', `未知参数：${a}`)
  }
  return out
}

// ── 路径小工具 ─────────────────────────────────────────────────────────────
function canonical(p) {
  const abs = path.resolve(String(p))
  try {
    return realpathSync.native(abs)
  } catch {
    return abs
  }
}
function driveOf(p) {
  const m = /^([A-Za-z]):/.exec(String(p ?? ''))
  return m ? m[1].toUpperCase() : null
}
function isAbsoluteish(s) {
  return /^[A-Za-z]:[\\/]/.test(String(s ?? '')) || /^\\\\/.test(String(s ?? '')) || /^\/\//.test(String(s ?? ''))
}
function posixOf(p) {
  return canonical(p).replace(/\\/g, '/')
}
function isProtectedRel(rel) {
  return rel.replace(/\\/g, '/').split('/').some((s) => PROTECTED_SEGMENTS.includes(s.toLowerCase()))
}
function sha256Text(t) {
  return createHash('sha256').update(t, 'utf8').digest('hex')
}
const sha256File = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
function walkFiles(root, { skipProtected = false } = {}) {
  const out = []
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) visit(full)
      else if (st.isFile()) {
        const rel = path.relative(root, full).replace(/\\/g, '/')
        if (skipProtected && isProtectedRel(rel)) continue
        out.push({ rel, bytes: st.size, sha256: sha256File(full) })
      }
    }
  }
  visit(root)
  out.sort((a, b) => Buffer.compare(Buffer.from(a.rel, 'utf8'), Buffer.from(b.rel, 'utf8')))
  return out
}
function treeHashOf(root, only = null) {
  const all = walkFiles(root)
  const picked = only === null ? all : all.filter((f) => only.has(f.rel))
  const digest = createHash('sha256')
  for (const f of picked) digest.update(`${f.rel}\u0000${f.sha256}\u0000${f.bytes}\n`, 'utf8')
  return { sha256: digest.digest('hex'), files: picked.length }
}
function linesLf(buf) {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '')
  if (text === '') return 0
  const parts = text.split('\n')
  if (parts[parts.length - 1] === '') parts.pop()
  return parts.length
}

/** 判定一个"预设根"：要么它自己就是，要么它下面 `presets/agenia`。 */
function resolvePresetRoot(dir) {
  const abs = canonical(dir)
  if (!existsSync(abs)) return { root: abs, exists: false, how: 'missing' }
  if (existsSync(path.join(abs, 'agent.cordis.yml'))) return { root: abs, exists: true, how: 'self' }
  const nested = path.join(abs, 'presets', 'agenia')
  if (existsSync(path.join(nested, 'agent.cordis.yml'))) return { root: nested, exists: true, how: 'presets/agenia' }
  return { root: abs, exists: false, how: 'no-composition' }
}

// ── 注释剥离（只给"代码文件"用；散文不剥）──────────────────────────────────
function stripComments(text, ext) {
  if (/\.(mjs|cjs|js|mts|cts|ts)$/i.test(ext)) {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n')
  }
  if (/\.(yml|yaml|sh|ps1)$/i.test(ext)) {
    return text.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n')
  }
  return text
}

// ── ① 活体 ↔ 发布清单 ──────────────────────────────────────────────────────
function checkLiveMatches(releaseRoot, liveRoot) {
  const findings = []
  const release = walkFiles(releaseRoot, { skipProtected: true })
  const live = walkFiles(liveRoot, { skipProtected: true })
  const relMap = new Map(release.map((f) => [f.rel, f.sha256]))
  const liveMap = new Map(live.map((f) => [f.rel, f.sha256]))
  const missing = [...relMap.keys()].filter((r) => !liveMap.has(r)).sort()
  const diff = [...relMap.keys()].filter((r) => liveMap.has(r) && liveMap.get(r) !== relMap.get(r)).sort()
  const extra = [...liveMap.keys()].filter((r) => !relMap.has(r)).sort()
  if (missing.length > 0) findings.push({ code: 'SCAN-LIVE-MISSING', message: `发布清单里有 ${missing.length} 个文件活体上没有`, list: missing })
  if (diff.length > 0) findings.push({ code: 'SCAN-LIVE-DIFF', message: `发布清单与活体有 ${diff.length} 个文件 SHA 不同`, list: diff.map((r) => ({ path: r, release: relMap.get(r), live: liveMap.get(r) })) })
  if (extra.length > 0) findings.push({ code: 'SCAN-LIVE-EXTRA', message: `活体上有 ${extra.length} 个文件不在发布清单里（**代码**面）`, list: extra })
  return { findings, readings: { release_files: relMap.size, live_files: liveMap.size, missing, diff: diff.length, extra, note: '两侧都**剔掉数据目录**（.runtime / .team 那些段）—— 它们是活体上本来就有的东西，不是"多出来的代码"' } }
}

// ── ② 没有任何文件落 C 盘 ──────────────────────────────────────────────────
const TEMP_PATTERNS = [/\btmpdir\s*\(/, /\bmkdtemp\w*\s*\(/, /process\.env\.TEMP\b/, /process\.env\.TMP\b/, /%TEMP%/i, /\$env:TEMP\b/i]
function checkNoCDrive(roots, backupPath) {
  const findings = []
  const prose = []
  let scanned = 0
  for (const { label, root } of roots) {
    if (!existsSync(root)) continue
    for (const f of walkFiles(root)) {
      const ext = path.extname(f.rel)
      const isCode = CODE_EXT.test(f.rel)
      const isProse = PROSE_EXT.test(f.rel)
      if (!isCode && !isProse) continue
      scanned += 1
      const raw = readFileSync(path.join(root, f.rel), 'utf8')
      const text = isCode ? stripComments(raw, ext) : raw
      text.split(/\r?\n/).forEach((line, i) => {
        const hits = (line.match(/[A-Za-z]:[\\/]/g) ?? []).filter((m) => m[0].toUpperCase() === 'C')
        if (hits.length === 0) return
        const row = { where: `${label}:${f.rel}:${i + 1}`, line: line.trim().slice(0, 140) }
        if (isCode) findings.push({ code: 'SCAN-C-DRIVE', message: `代码里出现 C 盘字面量（${row.where}）`, ...row })
        else prose.push(row)
      })
      if (isCode) {
        text.split(/\r?\n/).forEach((line, i) => {
          if (TEMP_PATTERNS.some((re) => re.test(line))) {
            findings.push({ code: 'SCAN-TEMP-DEFAULT', message: `代码用了进程默认临时目录（默认在 C 盘）（${label}:${f.rel}:${i + 1}）`, where: `${label}:${f.rel}:${i + 1}`, line: line.trim().slice(0, 140) })
          }
        })
      }
    }
  }
  /** 落点：本次扫描**自己的**路径（它们不该在 C 盘上）。 */
  const landing = []
  if (backupPath !== null) landing.push({ what: '--backup', path: backupPath, drive: driveOf(backupPath), exists: existsSync(backupPath) })
  for (const { label, root } of roots) landing.push({ what: label, path: root, drive: driveOf(root), exists: existsSync(root) })
  for (const row of landing) {
    if (row.drive === 'C') findings.push({ code: 'SCAN-LANDING-C', message: `${row.what} 落在 C 盘：${row.path}`, where: row.what })
  }
  return { findings, readings: { files_scanned: scanned, landing, info_c_drive_prose: prose, prose_note: '散文（.md/.txt）里的 C 盘字面量**不算 finding** —— 历史记载与落点风险是两件事' } }
}

// ── ③ 无密钥 / 凭据字样 ───────────────────────────────────────────────────
const SECRET_PATTERNS = [
  { code: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { code: 'aws-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: 'github-token', re: /\b(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{16,}/ },
  { code: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { code: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { code: 'bearer-literal', re: /\bBearer\s+[A-Za-z0-9._-]{20,}/ },
  { code: 'api-key-assignment', re: /\b(api[_-]?key|apikey)\b\s*[:=]\s*['"][^'"]{12,}['"]/i },
  { code: 'password-assignment', re: /\b(passwd|password|passphrase)\b\s*[:=]\s*['"][^'"]{6,}['"]/i },
  { code: 'secret-assignment', re: /\b(client[_-]?secret|secret[_-]?key)\b\s*[:=]\s*['"][^'"]{8,}['"]/i },
]
const CREDENTIAL_FILENAMES = ['api.txt', 'apikey.txt', '.credentials.yaml', '.credentials.yml', 'credentials.json']
function checkNoSecrets(roots) {
  const findings = []
  let scanned = 0
  for (const { label, root } of roots) {
    if (!existsSync(root)) continue
    for (const f of walkFiles(root)) {
      const base = path.basename(f.rel).toLowerCase()
      if (CREDENTIAL_FILENAMES.includes(base)) {
        findings.push({ code: 'SCAN-SECRET-FILE', message: `发布树里出现凭据文件（${label}:${f.rel}）—— AGENTS.md §5：它绝对不能进版本库，更不许进预设`, where: `${label}:${f.rel}` })
        continue
      }
      if (!CODE_EXT.test(f.rel) && !PROSE_EXT.test(f.rel)) continue
      scanned += 1
      const raw = readFileSync(path.join(root, f.rel), 'utf8')
      const text = CODE_EXT.test(f.rel) ? stripComments(raw, path.extname(f.rel)) : raw
      text.split(/\r?\n/).forEach((line, i) => {
        for (const p of SECRET_PATTERNS) {
          if (p.re.test(line)) {
            findings.push({ code: 'SCAN-SECRET', message: `命中凭据形状「${p.code}」（${label}:${f.rel}:${i + 1}）`, where: `${label}:${f.rel}:${i + 1}`, pattern: p.code, line: line.trim().slice(0, 100).replace(/[A-Za-z0-9_-]{16,}/g, '«红act»') })
            break
          }
        }
      })
    }
  }
  return { findings, readings: { files_scanned: scanned, patterns: SECRET_PATTERNS.length, credential_filenames: CREDENTIAL_FILENAMES } }
}

// ── ④ 补丁 ↔ 组合（结构对账；**不加载生成器**）────────────────────────────
/** 顶格 `- ` 行块（与生成器同一条切法：只认行首的 `- `）。 */
function splitRows(text) {
  const blocks = []
  let cur = null
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^- /.test(line)) {
      if (cur !== null) blocks.push(cur)
      cur = [line]
    } else if (cur !== null) cur.push(line)
  }
  if (cur !== null) blocks.push(cur)
  return blocks.map((b) => {
    while (b.length > 0 && b[b.length - 1].trim() === '') b.pop()
    return b.join('\n')
  })
}
const idOfBlock = (block) => {
  const m = /^- id:\s*(.+?)\s*$/m.exec(block)
  return m ? m[1] : null
}
function checkPatchMatchesComposition(presetRoot, liveRoot) {
  const findings = []
  const srcFile = path.join(presetRoot, 'agent.cordis.yml')
  const patchFile = path.join(presetRoot, 'cordis.patch.yml')
  if (!existsSync(srcFile) || !existsSync(patchFile)) {
    return { findings: [{ code: 'SCAN-PATCH-DRIFT', message: `组合或补丁不在（${srcFile} / ${patchFile}）`, where: presetRoot }], readings: { skipped: 'missing-file' } }
  }
  const src = readFileSync(srcFile, 'utf8')
  const patch = readFileSync(patchFile, 'utf8')
  const srcBlocks = splitRows(src)
  const srcIds = srcBlocks.map(idOfBlock)
  const patchLines = patch.replace(/\r\n/g, '\n').split('\n')
  const bodyIds = patchLines.filter((l) => /^ {10}- id: /.test(l)).map((l) => l.trim().slice(6).trim())
  const readings = { source_rows: srcIds.length, patch_rows: bodyIds.length, live_root: liveRoot === null ? null : posixOf(liveRoot) }

  if (srcIds.length !== bodyIds.length || srcIds.some((id, i) => id !== bodyIds[i])) {
    const firstDiff = srcIds.findIndex((id, i) => id !== bodyIds[i])
    findings.push({
      code: 'SCAN-PATCH-DRIFT',
      message: `补丁里的插件行序列与组合的顶格行对不上（源 ${srcIds.length} 条 / 补丁 ${bodyIds.length} 条，第一处不同在第 ${firstDiff < 0 ? '—' : firstDiff + 1} 条）`,
      source_ids: srcIds, patch_ids: bodyIds,
    })
  }

  if (!/^ {8}plugins:\s*$/m.test(patch)) {
    findings.push({ code: 'SCAN-PATCH-DRIFT', message: '补丁里找不到 `plugins:` 那一层 —— 形状不合，后面的结构对账无从谈起' })
    return { findings, readings }
  }
  const at = patchLines.findIndex((l) => /^ {8}plugins:\s*$/.test(l))
  const bodyText = patchLines.slice(at + 1).join('\n').replace(/\n+$/, '')

  if (liveRoot !== null && existsSync(liveRoot)) {
    const livePosix = posixOf(liveRoot)
    const wantInjector = `file:///${livePosix}/inject.js`
    const wantContentDir = livePosix
    readings.expected_injector = wantInjector
    readings.expected_content_dir = wantContentDir
    const injBlock = srcBlocks.find((b) => idOfBlock(b) === 'persona-injector')
    let expected = injBlock
      .replace(/^(\s*name:\s*)'\.\/inject\.js'\s*$/m, `$1'${wantInjector}'`)
      .replace(/^(\s*)leaderOrder:\s*$/m, (m, indent) => `${indent}contentDir: '${wantContentDir}'\n${m}`)
    const expectedBody = srcBlocks
      .map((b) => (idOfBlock(b) === 'persona-injector' ? expected : b))
      .map((b) => b.split('\n').map((l) => (l.trim() === '' ? '' : ' '.repeat(10) + l)).join('\n'))
      .join('\n')
    if (expectedBody !== bodyText) {
      const want = expectedBody.split('\n')
      const got = bodyText.split('\n')
      const idx = want.findIndex((l, i) => l !== got[i])
      findings.push({
        code: 'SCAN-PATCH-ROW-TEXT',
        message: `补丁正文与"照组合重算一遍"的结果不一致（第一处不同在第 ${idx < 0 ? '—(行长不同)' : idx + 1} 行）`,
        expected_line: idx < 0 ? null : want[idx], actual_line: idx < 0 ? null : (got[idx] ?? null),
      })
    }
    if (!patch.includes(`'${wantInjector}'`)) findings.push({ code: 'SCAN-PATCH-PATH', message: `补丁里注入器的行名不是活体位置 ${wantInjector} —— 写成 staging 路径的话，装完那一行 never started`, where: 'persona-injector.name' })
    if (!new RegExp(`contentDir:\\s*'${wantContentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(patch)) findings.push({ code: 'SCAN-PATCH-PATH', message: `补丁里没有 contentDir（或不是活体位置 ${wantContentDir}）—— 不写它那些 .md 全读不到而且不报错`, where: 'persona-injector.contentDir' })
  } else {
    readings.path_check = 'SKIP（活体根不存在 ⇒ 两处绝对路径的目标判不了）'
  }

  /** 注释行不算 —— `cordis:include` 这五个字在文件头的说明里出现过（讲"为什么不用它"）。 */
  const codeLines = stripComments(patch, '.yml')
  if (/cordis:include/.test(codeLines)) findings.push({ code: 'SCAN-PATCH-INCLUDE', message: '补丁的**非注释行**里出现了 `cordis:include` —— 实测在预设里挂不起来（整份 broken），出厂四份预设没有一份用它' })
  if (!/^\s*id:\s*agenia\b/m.test(codeLines) || !/^\s*name:\s*'?@deepseek-ai\/dsh-agent-preset'?\s*(#.*)?$/m.test(codeLines)) {
    findings.push({ code: 'SCAN-PATCH-REGISTRATION', message: '补丁里没有注册行（`id: agenia` + `name: @deepseek-ai/dsh-agent-preset`）—— 那一行就是这份预设的注册入口' })
  }
  return { findings, readings }
}

// ── ⑤ 注入文本齐 + 行数 ───────────────────────────────────────────────────
function injectedTexts(root) {
  const out = []
  for (const rel of [...ROLE_TEXTS, ...LEADER_TEXTS]) {
    const abs = path.join(root, ...rel.split('/'))
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      out.push({ rel, exists: false })
      continue
    }
    const buf = readFileSync(abs)
    out.push({ rel, exists: true, bytes: buf.length, lines_lf: linesLf(buf), sha256: sha256Text(buf.toString('utf8')) })
  }
  return out
}
function checkInjectedTexts(releaseRoot, liveRoot) {
  const findings = []
  const release = injectedTexts(releaseRoot)
  const live = existsSync(liveRoot) ? injectedTexts(liveRoot) : null
  const liveMap = live === null ? null : new Map(live.map((r) => [r.rel, r]))
  const rows = []
  for (const r of release) {
    const frozen = FROZEN_LINES[r.rel] ?? null
    const l = liveMap === null ? null : liveMap.get(r.rel) ?? null
    const row = { rel: r.rel, release_lines_lf: r.lines_lf ?? null, frozen_lines_lf: frozen, live_lines_lf: l?.lines_lf ?? null, release_sha256: r.sha256 ?? null, live_sha256: l?.sha256 ?? null }
    rows.push(row)
    if (!r.exists) {
      findings.push({ code: 'SCAN-INJECT-MISSING', message: `注入文本缺了这一份：${r.rel}`, where: r.rel })
      continue
    }
    if (frozen !== null && r.lines_lf !== frozen) {
      findings.push({ code: 'SCAN-INJECT-LINES', message: `${r.rel} 的行数与冻结表对不上（实得 ${r.lines_lf} / 冻结 ${frozen}）—— 口径：剥 BOM 后数 \\n；改了正文就 --op frozen-lines 更新那张表`, where: r.rel })
    }
    if (liveMap !== null) {
      if (l === null || !l.exists) findings.push({ code: 'SCAN-INJECT-MISSING', message: `活体上缺了这一份注入文本：${r.rel}`, where: r.rel })
      else if (l.sha256 !== r.sha256) findings.push({ code: 'SCAN-INJECT-DRIFT', message: `${r.rel} 在发布侧与活体上内容不同（${r.sha256.slice(0, 12)}… vs ${l.sha256.slice(0, 12)}…）`, where: r.rel })
    }
  }
  return { findings, readings: { roles: ROLE_TEXTS.length, leader_side: LEADER_TEXTS.length, total: ROLE_TEXTS.length + LEADER_TEXTS.length, rows, line_caliber: '剥 BOM 后数 \\n；CRLF 算一个换行' } }
}

// ── 备份（只看，不写）──────────────────────────────────────────────────────
function backupReadings(backupPath) {
  if (backupPath === null) return { path: null, exists: false, manifest_path: null, hash_manifest: null, files: null, on_e_drive: null, note: '本次没给 --backup' }
  const abs = canonical(backupPath)
  const manifest = path.join(abs, 'hash-manifest.json')
  const exists = existsSync(abs)
  let files = null
  let hashManifest = null
  if (exists && existsSync(manifest)) {
    hashManifest = sha256File(manifest)
    try {
      const doc = JSON.parse(readFileSync(manifest, 'utf8'))
      files = Array.isArray(doc.files) ? doc.files.length : null
    } catch {
      files = null
    }
  }
  return {
    path: abs,
    exists,
    manifest_path: manifest,
    hash_manifest: hashManifest,
    files,
    on_e_drive: driveOf(abs) === 'E',
    note: exists
      ? (hashManifest === null ? '备份目录在，但没有 hash-manifest.json ⇒ 这份备份**没法验**（不是"没有备份"）' : '备份目录在，带 SHA 清单')
      : '备份目录还不存在（还没装过 / 还没备份）—— 这不是 finding，是"这次没有备份可查"',
  }
}

// ── op: scan ───────────────────────────────────────────────────────────────
function opScan(args) {
  const repoRoot = canonical(args.repo)
  const mode = args.release !== null ? 'release' : 'tree'
  const release = args.release === null ? null : resolvePresetRoot(args.release)
  const stagedInput = args.staged ?? (release !== null && release.exists ? release.root : path.join(repoRoot, '.tools', '_staging', 'agenia-upgrade', 'preset'))
  const stagedAbs = canonical(stagedInput)
  const liveAbs = canonical(args.live ?? path.join(repoRoot, 'presets', 'agenia'))
  const subjectRoot = release !== null ? release.root : stagedAbs
  const subjectExists = release !== null ? release.exists : existsSync(stagedAbs)

  const checks = []
  const findings = []
  const pushCheck = (id, title, result) => {
    checks.push({ id, title, status: 'RUN', findings: result.findings, readings: result.readings })
    findings.push(...result.findings.map((f) => ({ ...f, check: id })))
  }

  /** 扫描自己必须是只读的 —— 前后各量一次活体与源侧，变了就是扫描闯祸了。 */
  const before = {
    live: existsSync(liveAbs) ? treeHashOf(liveAbs, new Set([...walkFiles(liveAbs, { skipProtected: true }).map((f) => f.rel)])) : null,
    staged: existsSync(stagedAbs) ? treeHashOf(stagedAbs, new Set([...walkFiles(stagedAbs, { skipProtected: true }).map((f) => f.rel)])) : null,
  }

  const backup = backupReadings(args.backup)
  if (subjectExists) {
    pushCheck('live-matches-release', '① 活体树与发布清单逐项相符', checkLiveMatches(subjectRoot, liveAbs))
    pushCheck('no-c-drive', '② 没有任何文件落 C 盘', checkNoCDrive([
      { label: 'release', root: subjectRoot },
      { label: 'live', root: liveAbs },
    ], args.backup === null ? null : canonical(args.backup)))
    pushCheck('no-secrets', '③ 无密钥/凭据字样泄漏', checkNoSecrets([
      { label: 'release', root: subjectRoot },
      { label: 'live', root: liveAbs },
    ]))
    pushCheck('patch-matches-composition', '④ 补丁与组合一致（结构对账）', checkPatchMatchesComposition(subjectRoot, existsSync(liveAbs) ? liveAbs : null))
    pushCheck('injected-texts', '⑤ 十份注入文本齐 + 行数口径照冻结值', checkInjectedTexts(subjectRoot, liveAbs))
  } else {
    const why = release !== null
      ? `发布物不存在（--release ${canonical(args.release)} 里既没有 agent.cordis.yml，也没有 presets/agenia/agent.cordis.yml）⇒ 这一档本来就不适用`
      : `源侧不存在（${stagedAbs}）⇒ 这一档本来就不适用`
    for (const [id, title] of [
      ['live-matches-release', '① 活体树与发布清单逐项相符'],
      ['no-c-drive', '② 没有任何文件落 C 盘'],
      ['no-secrets', '③ 无密钥/凭据字样泄漏'],
      ['patch-matches-composition', '④ 补丁与组合一致（结构对账）'],
      ['injected-texts', '⑤ 十份注入文本齐 + 行数口径照冻结值'],
    ]) {
      checks.push({ id, title, status: 'NOT-APPLICABLE', findings: [], readings: { reason: why } })
    }
  }

  // 备份落点这一条**与发布物在不在无关**：它查的是操作者自己的路径
  const backupFindings = []
  if (backup.exists && backup.hash_manifest === null) backupFindings.push({ code: 'SCAN-BACKUP-NO-MANIFEST', message: `备份目录在，但里面没有 hash-manifest.json ⇒ 这份备份没法验：${backup.path}`, where: backup.path })
  if (backup.path !== null && backup.on_e_drive === false) backupFindings.push({ code: 'SCAN-BACKUP-NOT-E', message: `备份落点不在 E 盘：${backup.path}`, where: backup.path })
  checks.push({ id: 'backup', title: '备份落点与哈希清单', status: 'RUN', findings: backupFindings, readings: backup })
  findings.push(...backupFindings.map((f) => ({ ...f, check: 'backup' })))

  const after = {
    live: existsSync(liveAbs) ? treeHashOf(liveAbs, new Set([...walkFiles(liveAbs, { skipProtected: true }).map((f) => f.rel)])) : null,
    staged: existsSync(stagedAbs) ? treeHashOf(stagedAbs, new Set([...walkFiles(stagedAbs, { skipProtected: true }).map((f) => f.rel)])) : null,
  }
  const readOnly = (before.live?.sha256 ?? null) === (after.live?.sha256 ?? null) && (before.staged?.sha256 ?? null) === (after.staged?.sha256 ?? null)

  const byCode = {}
  for (const f of findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1

  return {
    mode,
    strict: args.strict,
    subject: {
      mode,
      release_input: args.release === null ? null : canonical(args.release),
      release_root: release === null ? null : release.root,
      release_how: release === null ? null : release.how,
      release_exists: release === null ? null : release.exists,
      staged_root: stagedAbs,
      staged_exists: existsSync(stagedAbs),
      live_root: liveAbs,
      live_exists: existsSync(liveAbs),
      subject_root: subjectRoot,
      subject_exists: subjectExists,
    },
    checks,
    findings,
    counts: { findings: findings.length, by_code: byCode, checks_run: checks.filter((c) => c.status === 'RUN').length, checks_not_applicable: checks.filter((c) => c.status === 'NOT-APPLICABLE').length },
    skips: checks.filter((c) => c.status === 'NOT-APPLICABLE').map((c) => ({ check: c.id, reason: c.readings.reason })),
    backup,
    read_only_proof: {
      live_before: before.live?.sha256 ?? null,
      live_after: after.live?.sha256 ?? null,
      staged_before: before.staged?.sha256 ?? null,
      staged_after: after.staged?.sha256 ?? null,
      scan_is_read_only: readOnly,
      note: '扫描前后各量一次（**剔掉数据目录**）—— 两次不同就说明扫描自己写了盘',
    },
    notes: [
      'findings 是**数据**：默认退出 0；要"有发现就不算过"请给 --strict（退出 5）',
      'NOT-APPLICABLE ≠ 通过：发布物不在时五类一律不跑，理由逐条写在 skips 里',
      '本文件**不加载、不执行** .tools/make-bundle-patch.mjs（A11：那个生成器加载期就写活体）',
    ],
  }
}

// ── op: frozen-lines ───────────────────────────────────────────────────────
function opFrozenLines(args) {
  const root = canonical(args.staged ?? args.release ?? path.join(canonical(args.repo), '.tools', '_staging', 'agenia-upgrade', 'preset'))
  if (!existsSync(root)) throw cliError('E_ROOT_MISSING', `量行数的根不在：${root}`)
  const rows = injectedTexts(root)
  const table = {}
  for (const r of rows) if (r.exists) table[r.rel] = r.lines_lf
  const body = JSON.stringify(table, null, 2).replace(/"([^"]+)":/g, "'$1':")
  return {
    root,
    caliber: '剥 BOM 后数 \\n；CRLF 算一个换行',
    table,
    paste: `const FROZEN_LINES = Object.freeze(${body})`,
  }
}

// ── 入口 ───────────────────────────────────────────────────────────────────
function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
}
const OPS = { scan: opScan, 'frozen-lines': opFrozenLines }

function main(argv) {
  let op = 'scan'
  try {
    const args = parseArgs(argv)
    op = args.op
    if (op === null || String(op).trim() === '') throw cliError('E_USAGE', `缺 --op；可用：${OP_NAMES.join(' / ')}`)
    if (op === 'help') {
      process.stderr.write(`${CLI_NAME} 的 op（${OP_NAMES.length} 个）：\n  ${OP_NAMES.join('\n  ')}\n`)
      emit({ ok: true, op: 'help', cli: CLI_NAME, ops: [...OP_NAMES] })
      return 0
    }
    if (!Object.hasOwn(OPS, op)) throw cliError('E_USAGE', `未知 op：${JSON.stringify(op)}；可用：${OP_NAMES.join(' / ')}`)
    const out = OPS[op](args)
    const envelope = { ok: true, op, cli: CLI_NAME, ...out }
    if (op === 'scan') {
      emit(envelope)
      return args.strict && out.findings.length > 0 ? CODES.E_MANIFEST_MISMATCH : 0
    }
    emit(envelope)
    return 0
  } catch (err) {
    const code = typeof err?.code === 'string' && Object.hasOwn(CODES, err.code) ? err.code : 'E_INTERNAL'
    process.stderr.write(`[${CLI_NAME}] ${code} ${String(err?.message ?? err)}\n`)
    emit({ ok: false, op, cli: CLI_NAME, error: { code, message: String(err?.message ?? err), details: null } })
    return CODES[code]
  }
}

process.exitCode = main(process.argv.slice(2))
