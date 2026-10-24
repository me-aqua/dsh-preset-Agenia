#!/usr/bin/env node
/**
 * `tree-at-commit.mjs` —— 「派工那一刻的提交」的**只读副本**：导出 + 校验（`F-160`）。
 *
 * 病根（2026-10-24 11:05–11:35 实测）：技术评审的 `before_sha256` / `after_sha256` 一直量在**活树**上，
 * 而活树里装着"别的岗位此刻正在写的文件" ⇒ `equal` 是概率不是规矩（25 分钟翻了 7 次、`changed[]` 4 → 18），
 * 一份内容可用的评审**效力作废**。新口径：**评审对象 = 派工那一刻的 `HEAD`**，评审读它的一份只读副本，
 * `equal` 量在副本上；活树在窗口里动了 ⇒ 与本轮无关（那是并行的常态），但**必须报出来**。
 *
 * ── 两个子命令（形状由 `.team/test/2026-10-24/契约-F-160-判断形状.md` §2 钉死）───────────
 *
 *   ① 导出（派工时，组长跑一次）
 *      <node> .tools/tree-at-commit.mjs --repo <仓库根> --commit <40hex> --out <副本目录>
 *                                        [--live-baseline <file>] --json
 *      · 副本 = 提交里**全部 blob** 原样落盘（`git ls-tree -r` + `git cat-file --batch`）——
 *        **纯树**：不含 `.git`、不含任何额外文件（连一份 manifest 都不许写进去：
 *        多一份路径，"副本是不是那个提交"就永远判不绿）。
 *        ⚠️ 不复用 `git archive`：它按 `.gitattributes` 的 `export-ignore` / `export-subst` 改写输出，
 *        副本会与提交**不一样**，而这一票的全部效力都挂在"副本 = 那个提交"上。
 *      · `--out` **已存在且非空 ⇒ 拒**（`REFUSE-OVERWRITE`），而且**拒在写之前**（先看目录再动手）。
 *      · `--live-baseline <file>` ⇒ 在**那一刻**用 `.tools/fingerprint.mjs --set code --save` 的形状
 *        存一份**活树**基线；不给 ⇒ 输出里 `live_baseline: null`（**不是**"没变"）。
 *      · stdout 最后一行 = JSON：
 *        `{ ok, commit, tree_root, code: { sha256, files, bytes }, live_baseline }`
 *
 *   ② 校验（交活时 / 任何第三方）
 *      <node> .tools/tree-at-commit.mjs --verify <副本> --repo <仓库根> --commit <40hex>
 *                                        --expect <派工卡上的 before_sha256>
 *                                        [--live-baseline <file>] [--live-root <活树>] --json
 *      · `equal` = **自己复算**副本的 CODE 指纹后与 `--expect` 比 —— 只回答"副本还是不是派工那一刻那份"，
 *        活树怎么动都不影响它（`REV-04`：活树动了 2 处、副本没动 ⇒ 仍然有效）。
 *      · `is_that_commit` = 逐份拿副本文件的 `git blob` SHA-1 与该提交里的 blob SHA-1 比（路径集合也要一致，
 *        `.git` 在副本里出现就算不成立）—— 只回答"这份副本是不是那个提交"。它与 `equal` **互相独立**：
 *        干净的提交 A 副本 + `--commit B` ⇒ `equal:true` + `is_that_commit.ok:false`（`REV-05/D`）。
 *      · `live.moved` = **活树从派工那一刻起动了几处**（按基线逐份比，`fingerprint.mjs --compare`）。
 *        没有基线 ⇒ `null` + 非空 `detail`（**判不了要写出来，不许写 0**）。
 *        🔴 它不是"副本 vs 活树的分歧"：分歧里装着从没进过提交的文件（本仓库 2026-10-24 实测
 *        活树 192 份 / 提交 135 份），拿它当变动数会把"派工后动了 0 处"报成 50 多处。
 *      · 退出码：`0` = 判定成立（`ok:true` = `equal` 且 `is_that_commit.ok`）；否则非 0，但**照样印 JSON**。
 *        `ok` 是**判定**，不是"量完了"：`live.moved` 判不了**不会**让 `ok` 变 false —— 那一格由 `live.detail` 说清。
 *        用法错（缺参数 / `--commit` 解析不出 / 副本目录不在）同样是非 0 + JSON（`error.code` 点名）。
 *
 * ── CODE 收录口径只有一份（别在这里再抄一张排除表）────────────────────────────
 * 副本的 CODE 指纹**由 `.tools/fingerprint.mjs` 现算**（子进程 `--root <副本> --set code --json`）。
 * 本文件**不实现**排除表：一张手抄的表就是第二份真相，分叉以后两边都会给出"看着像读数"的数
 * （`cand-20261019-0030`）。代价要认：这个工具的刻度**等于** `fingerprint.mjs` 的刻度，它错了这里也错；
 * 但至少不会出现"两个数谁对"这种没人判得了的局面。
 * 同理，活树基线 / 比对也**只调用** `fingerprint.mjs`（`--save` / `--compare`）。
 *
 * ── 落点约束（写的人要当心）──────────────────────────────────────────────────
 * · `--out` 与 `--live-baseline` **别落在活树的 CODE 名单里**：那样导出自己写下的文件会被算成"派工后变动"。
 *   `.team/` 被排除表挡着，是合规落点（真现场就是 `--out <仓库>\.team\<角色>\<day>\tree-at-<commit>`）。
 * · 历史只追加 ⇒ 钉住的 `<commit>` 永远导得出来；`--commit` 收完整 40 hex **或任何能解析到提交的 rev**
 *   （短哈希 / `HEAD` / 分支名都行），但**输出里永远是解析后的完整 40 hex**（短哈希不是读数）。
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 同一把尺子：CODE 收录口径 / 基线 / 比对的**唯一实现**（见文件头「CODE 收录口径只有一份」）。 */
const FINGERPRINT_TOOL = path.join(HERE, 'fingerprint.mjs')
const MAX_BUFFER = 256 * 1024 * 1024

/** 读 git 时钉住的配置 —— 否则同一棵树会随**本机 git 配置**变（换行归一 / 中文路径转义 / 长路径）。 */
const GIT_PINNED = ['-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', '-c', 'core.safecrlf=false', '-c', 'core.longpaths=true']

const USAGE = [
  'tree-at-commit.mjs —— 「派工那一刻的提交」的只读副本（导出 / 校验；F-160）',
  '',
  '  导出：--repo <仓库根> --commit <40hex> --out <副本目录> [--live-baseline <file>] [--json]',
  '  校验：--verify <副本目录> --repo <仓库根> --commit <40hex> --expect <before_sha256>',
  '        [--live-baseline <file>] [--live-root <活树>] [--json]',
  '',
  '  --out 已存在且非空 ⇒ 拒（exit 2，拒在写之前）· 没有活树基线 ⇒ live.moved = null（不是 0）',
].join('\n')

// ── 输出：stdout 只放那**一行** JSON（人话一律走 stderr）────────────────────────
function emit(obj, code) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
  process.exitCode = code
}

function fail(code, message, extra = {}) {
  process.stderr.write(`tree-at-commit.mjs: ${message}\n`)
  emit({ ok: false, error: { code, message }, ...extra }, 2)
}

// ── git ────────────────────────────────────────────────────────────────────
function git(args, { cwd, input = undefined } = {}) {
  const r = spawnSync('git', [...GIT_PINNED, ...args], {
    cwd,
    input,
    encoding: input === undefined ? 'utf8' : null,
    maxBuffer: MAX_BUFFER,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (r.error) return { status: -1, stdout: input === undefined ? '' : Buffer.alloc(0), stderr: String(r.error.message) }
  return { status: r.status, stdout: r.stdout ?? (input === undefined ? '' : Buffer.alloc(0)), stderr: String(r.stderr ?? '') }
}

/** `--commit` 收任何能解析到提交的 rev，**输出永远是解析后的完整 40 hex**（短哈希不是读数）。 */
function resolveCommit(repo, rev) {
  const r = git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], { cwd: repo })
  const sha = String(r.stdout).trim()
  if (r.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
    return { ok: false, sha: null, problems: [`--commit ${JSON.stringify(rev)} 解析不出一个提交（git rev-parse 退出码 ${r.status}）${String(r.stderr).trim() === '' ? '' : `：${String(r.stderr).trim().slice(0, 300)}`}`] }
  }
  return { ok: true, sha, problems: [] }
}

/** 提交里的**全部文件**（`rel → {mode, blob}`）—— 只读 git 对象，不看工作树。 */
function lsTree(repo, commit) {
  const r = git(['ls-tree', '-r', '-z', '--full-tree', commit], { cwd: repo })
  if (r.status !== 0) return { ok: false, entries: [], problems: [`git ls-tree ${commit} 退出码 ${r.status}：${String(r.stderr).trim().slice(0, 300)}`] }
  const entries = []
  const problems = []
  for (const item of String(r.stdout).split('\u0000')) {
    if (item === '') continue
    const tab = item.indexOf('\t')
    if (tab < 0) { problems.push(`ls-tree 一行认不出来：${item.slice(0, 120)}`); continue }
    const [mode, type, blob] = item.slice(0, tab).split(/\s+/)
    const rel = item.slice(tab + 1)
    if (type !== 'blob') { problems.push(`${rel} 在提交里不是 blob（${type}）—— 子模块 / 目录项不支持`); continue }
    if (rel === '.git' || rel.startsWith('.git/')) { problems.push(`提交里的路径带着 .git：${rel}`); continue }
    if (rel.split('/').includes('..')) { problems.push(`提交里的路径带 ..：${rel}`); continue }
    entries.push({ rel, mode, blob })
  }
  return { ok: problems.length === 0, entries, problems }
}

/** 一次 `git cat-file --batch` 读出全部 blob 字节（照请求次序；键 = blob sha）。 */
function readBlobs(repo, shas) {
  const out = new Map()
  if (shas.length === 0) return out
  const r = spawnSync('git', [...GIT_PINNED, 'cat-file', '--batch'], {
    cwd: repo,
    input: `${shas.join('\n')}\n`,
    maxBuffer: MAX_BUFFER,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  const buf = r.stdout ?? Buffer.alloc(0)
  let off = 0
  for (const sha of shas) {
    const nl = buf.indexOf(0x0a, off)
    if (nl < 0) break
    const parts = buf.subarray(off, nl).toString('utf8').split(' ')
    if (parts[1] === 'missing') { off = nl + 1; continue }
    const size = Number(parts[2])
    const start = nl + 1
    out.set(sha, buf.subarray(start, start + size))
    off = start + size + 1
  }
  return out
}

/** `git blob` 的 SHA-1 = `sha1("blob <字节数>\0" + 内容)` —— 与提交里那个 blob 直接可比。 */
function gitBlobSha1(buf) {
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\u0000`, 'utf8'), buf])).digest('hex')
}

// ── 尺子（只调用 `.tools/fingerprint.mjs`，自己不实现排除表）────────────────────
function runFingerprint(args) {
  const r = spawnSync(process.execPath, [FINGERPRINT_TOOL, ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    timeout: 300000,
    env: { ...process.env },
  })
  let json = null
  try {
    const lines = String(r.stdout ?? '').trim().split('\n').filter((l) => l.trim() !== '')
    json = lines.length === 0 ? null : JSON.parse(lines[lines.length - 1])
  } catch { json = null }
  return { status: r.status, json, stderr: String(r.stderr ?? ''), stdout: String(r.stdout ?? '') }
}

/** 一棵树的 CODE 指纹（现算）。 */
function codeFingerprintOf(root) {
  const r = runFingerprint(['--root', root, '--set', 'code', '--json'])
  const code = r.json?.sets?.code
  if (r.status !== 0 || code === undefined || typeof code.sha256 !== 'string') {
    return { ok: false, sha256: null, files: null, bytes: null, problems: [`fingerprint.mjs 量不动 ${root}（退出码 ${r.status}）：${r.stderr.trim().slice(0, 300)}`] }
  }
  return { ok: true, sha256: code.sha256, files: code.files, bytes: code.bytes, problems: [] }
}

/** 派工那一刻的**活树** CODE 基线（`.tools/fingerprint.mjs --save` 的形状）。 */
function saveLiveBaseline(liveRoot, file) {
  mkdirSync(path.dirname(file), { recursive: true })
  const r = runFingerprint(['--root', liveRoot, '--set', 'code', '--save', file, '--json'])
  if (r.status !== 0) return { ok: false, problems: [`fingerprint.mjs --save 退出码 ${r.status}：${r.stderr.trim().slice(0, 300)}`] }
  let raw = null
  try { raw = JSON.parse(readFileSync(file, 'utf8')) } catch (err) { return { ok: false, problems: [`写出来的基线不是可解析 JSON：${String(err.message).slice(0, 160)}`] } }
  const list = raw?.sets?.code?.list
  if (!Array.isArray(list) || list.length === 0) return { ok: false, problems: ['基线的 sets.code.list 不是非空数组 —— 没有它就算不出 changed[]（"0 处"会是一个空读数）'] }
  return { ok: true, problems: [], sha256: raw.sets.code.sha256, files: raw.sets.code.files }
}

/**
 * 活树**从基线那一刻起**动了几处：`{ok, moved, places, detail}`。
 * 没有基线 / 比不了 ⇒ `moved: null` + 非空 `detail`（判不了要写出来，**不许**写 0）。
 */
function liveMoved(liveRoot, baselineFile) {
  if (!baselineFile) {
    return { ok: false, moved: null, places: [], detail: '没有给活树基线（`--live-baseline`）⇒ 派工后活树动了几处判不了；这不是"没动"' }
  }
  if (!existsSync(baselineFile)) {
    return { ok: false, moved: null, places: [], detail: `活树基线不在盘上：${baselineFile} ⇒ 变动数判不了（不是"没动"）` }
  }
  if (!existsSync(liveRoot) || !statSync(liveRoot).isDirectory()) {
    return { ok: false, moved: null, places: [], detail: `活树根不是一个目录：${liveRoot} ⇒ 变动数判不了` }
  }
  const r = runFingerprint(['--root', liveRoot, '--set', 'code', '--compare', baselineFile, '--json'])
  if (r.status !== 0 && r.status !== 1) {
    return { ok: false, moved: null, places: [], detail: `基线比不了（fingerprint.mjs --compare 退出码 ${r.status}）：${r.stderr.trim().slice(0, 200)}` }
  }
  const cmp = r.json?.compare
  if (!cmp || typeof cmp.equal !== 'boolean' || !Array.isArray(cmp.changed)) {
    return { ok: false, moved: null, places: [], detail: 'fingerprint.mjs --compare 的读数里没有 compare.equal / compare.changed ⇒ 变动数判不了' }
  }
  const places = cmp.changed.map((c) => ({ rel: c.rel, kind: c.kind }))
  return { ok: true, moved: places.length, places, detail: '' }
}

// ── 参数 ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { mode: null, repo: null, commit: null, out: null, verify: null, expect: null, liveBaseline: null, liveRoot: null, json: false }
  const missingValue = []
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    const next = () => {
      const v = argv[i + 1]
      i += 1
      // 少了值（或者把下一个 `--flag` 当成了值）也要走"印 JSON + 非 0"那条路 ——
      // `path.resolve(undefined)` 抛出来的是一段栈，不是读数，而且"`--commit --out x`"会静默把 `--out` 吃掉。
      if (v === undefined || v.startsWith('--')) {
        missingValue.push(a)
        if (v !== undefined) i -= 1
        return null
      }
      return v
    }
    if (a === '--json') out.json = true
    else if (a === '--repo') out.repo = next()
    else if (a === '--commit') out.commit = next()
    else if (a === '--out') out.out = next()
    else if (a === '--verify') out.verify = next()
    else if (a === '--expect') out.expect = next()
    else if (a === '--live-baseline') out.liveBaseline = next()
    else if (a === '--live-root') out.liveRoot = next()
    else if (a === '--help' || a === '-h') out.help = true
    else return { error: `未知参数：${a}` }
  }
  if (missingValue.length > 0) return { error: `这些参数少了值：${missingValue.join(' · ')}` }
  if (out.help) return out
  if (out.repo === undefined || out.repo === null || String(out.repo).trim() === '') return { error: '--repo 不能是空串' }
  if (out.commit === undefined || out.commit === null || String(out.commit).trim() === '') return { error: '--commit 不能是空串' }
  if (out.verify !== null) {
    out.mode = 'verify'
    if (out.expect === undefined || out.expect === null || String(out.expect).trim() === '') return { error: '校验模式要 --expect <派工卡上的 before_sha256>（校验方自己复算，不是照抄它）' }
  } else {
    out.mode = 'export'
    if (out.out === undefined || out.out === null || String(out.out).trim() === '') return { error: '导出模式要 --out <副本目录>' }
  }
  return out
}

// ── 导出 ───────────────────────────────────────────────────────────────────
function doExport(args) {
  const repo = path.resolve(args.repo)
  if (!existsSync(repo) || !statSync(repo).isDirectory()) return fail('E_USAGE', `--repo 不是一个目录：${repo}`)
  const gitDirProbe = git(['rev-parse', '--git-dir'], { cwd: repo })
  if (gitDirProbe.status !== 0) return fail('E_USAGE', `--repo 不是一个 git 仓库：${repo}（${String(gitDirProbe.stderr).trim().slice(0, 200)}）`)
  if (!existsSync(FINGERPRINT_TOOL)) return fail('E_USAGE', `同一把尺子不在：${FINGERPRINT_TOOL} —— CODE 指纹算不出来，副本就不能当读数用`)

  const out = path.resolve(args.out)
  const repoAbs = path.resolve(repo)
  const outLower = out.toLowerCase()
  if (outLower === path.join(repoAbs, '.git').toLowerCase() || outLower.startsWith(`${path.join(repoAbs, '.git').toLowerCase()}${path.sep}`)) {
    return fail('REFUSE-OVERWRITE', `--out 落在 ${repoAbs}\\.git 里面：${out} —— 副本必须是纯树，不许写进版本库`)
  }
  // 🔴 拒在写之前：**先看目录**，随后才创建 / 写第一份文件。
  if (existsSync(out)) {
    const st = statSync(out)
    if (!st.isDirectory()) return fail('REFUSE-OVERWRITE', `--out 已存在且不是目录：${out} —— 读数不许原地覆盖，换一个落点`)
    let names = []
    try { names = readdirSync(out) } catch (err) { return fail('E_USAGE', `--out 读不了：${out}（${String(err.message).slice(0, 160)}）`) }
    if (names.length > 0) {
      return fail('REFUSE-OVERWRITE', `--out 已存在且非空（${names.length} 项）：${out} —— 读数不许原地覆盖；换一个落点，或者自己先确认旧的没用了再删它`)
    }
  }

  const resolved = resolveCommit(repo, String(args.commit))
  if (!resolved.ok) return fail('E_COMMIT_UNRESOLVED', resolved.problems[0], { commit: null })

  // 派工那一刻的活树基线（一旦给了就**在写副本之前**量：那一刻的活树是派工时的活树）。
  const baselineFile = args.liveBaseline === null ? null : path.resolve(args.liveBaseline)
  let baseline = { ok: true, problems: [] }
  if (baselineFile !== null) {
    baseline = saveLiveBaseline(path.resolve(args.liveRoot ?? repo), baselineFile)
    if (!baseline.ok) {
      return fail('E_LIVE_BASELINE', `活树基线存不下来：${baseline.problems.join('；')} —— 没有它，"派工后活树动了几处"就判不了（不许读成 0）`, { commit: resolved.sha, live_baseline: baselineFile })
    }
  }

  const tree = lsTree(repo, resolved.sha)
  if (!tree.ok) return fail('E_GIT_LS_TREE', tree.problems.slice(0, 3).join('；'), { commit: resolved.sha, live_baseline: baselineFile })
  const blobs = readBlobs(repo, [...new Set(tree.entries.map((e) => e.blob))])
  const missing = tree.entries.filter((e) => !blobs.has(e.blob))
  if (missing.length > 0) {
    return fail('E_BLOB_MISSING', `${missing.length} 份 blob 读不出来（例：${missing.slice(0, 3).map((e) => e.rel).join(' · ')}）—— 副本会是残的`, { commit: resolved.sha, live_baseline: baselineFile })
  }

  // 写纯树：只写提交里的 blob，一个字节都不多。
  // ⚠️ 只搬 blob 字节：`100755` 的可执行位在 Windows 上不落盘（副本是**读**的对象，不是拿去跑的）；
  //    "副本是不是那个提交"由逐份 `git blob` SHA-1 判，与 mode 无关 —— CODE 指纹本来也不含 mode。
  let written = 0
  let bytes = 0
  for (const e of tree.entries) {
    const buf = blobs.get(e.blob)
    const full = path.join(out, ...e.rel.split('/'))
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, buf)
    written += 1
    bytes += buf.length
  }

  // 写后读回来自证：盘上那几份文件的字节必须还是提交里那几份（截断 / 换行归一 / 编码都会在这一步露出来）。
  const bad = []
  for (const e of tree.entries) {
    const full = path.join(out, ...e.rel.split('/'))
    let got = null
    try { got = gitBlobSha1(readFileSync(full)) } catch { got = null }
    if (got !== e.blob) bad.push(`${e.rel}（提交 ${e.blob.slice(0, 12)}… / 盘上 ${got === null ? '读不出来' : `${got.slice(0, 12)}…`}）`)
  }
  if (bad.length > 0) {
    return fail('E_COPY_VERIFY', `副本写完读回来对不上（${bad.length} 份）：${bad.slice(0, 5).join('；')}`, { commit: resolved.sha, tree_root: out, live_baseline: baselineFile })
  }

  const code = codeFingerprintOf(out)
  if (!code.ok) return fail('E_FINGERPRINT', code.problems.join('；'), { commit: resolved.sha, tree_root: out, live_baseline: baselineFile })

  emit({
    ok: true,
    commit: resolved.sha,
    tree_root: out,
    code: { sha256: code.sha256, files: code.files, bytes: code.bytes },
    live_baseline: baselineFile,
    files: written,
    bytes,
  }, 0)
}

// ── 校验 ───────────────────────────────────────────────────────────────────
function doVerify(args) {
  const repo = path.resolve(args.repo)
  if (!existsSync(repo) || !statSync(repo).isDirectory()) return fail('E_USAGE', `--repo 不是一个目录：${repo}`)
  const copy = path.resolve(args.verify)
  if (!existsSync(copy) || !statSync(copy).isDirectory()) {
    return fail('E_COPY_MISSING', `副本目录不在：${copy} —— 校验的对象是"派工那一刻那份副本"，没有它就没有读数`, { commit: null })
  }
  if (!existsSync(FINGERPRINT_TOOL)) return fail('E_USAGE', `同一把尺子不在：${FINGERPRINT_TOOL}`)

  const resolved = resolveCommit(repo, String(args.commit))
  if (!resolved.ok) return fail('E_COMMIT_UNRESOLVED', resolved.problems[0], { commit: null })

  // ① 副本现在还是不是派工那一刻那份：**自己复算**（不读、不抄 --expect）。
  const code = codeFingerprintOf(copy)
  const expect = String(args.expect).trim().toLowerCase()
  const equal = code.ok && typeof code.sha256 === 'string' && code.sha256.toLowerCase() === expect

  // ② 副本是不是那个提交：逐份 blob SHA-1 + 路径集合（`.git` 在副本里出现也算不成立）。
  const tree = lsTree(repo, resolved.sha)
  const problems = []
  let files = 0
  if (!tree.ok) {
    problems.push(...tree.problems.slice(0, 5))
  } else {
    files = tree.entries.length
    const expected = new Map(tree.entries.map((e) => [e.rel, e.blob]))
    const actual = new Map()
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        const st = statSync(full)
        const rel = path.relative(copy, full).replace(/\\/g, '/')
        if (st.isDirectory()) walk(full)
        else if (st.isFile()) actual.set(rel, full)
      }
    }
    walk(copy)
    for (const rel of actual.keys()) {
      if (rel === '.git' || rel.startsWith('.git/')) problems.push(`副本里带着 \`.git\`：${rel} —— 副本必须是纯树（它是一条指向真实仓库的活链）`)
    }
    for (const rel of expected.keys()) if (!actual.has(rel)) problems.push(`副本少一份（提交里有、副本里没有）：${rel}`)
    for (const rel of actual.keys()) {
      if (expected.has(rel) || rel === '.git' || rel.startsWith('.git/')) continue
      problems.push(`副本多一份（副本里有、提交里没有）：${rel}`)
    }
    for (const [rel, abs] of actual) {
      if (!expected.has(rel)) continue
      const got = gitBlobSha1(readFileSync(abs))
      if (got !== expected.get(rel)) problems.push(`副本这一份的字节不是该提交里的那一份：${rel}（提交 ${expected.get(rel).slice(0, 12)}… / 副本 ${got.slice(0, 12)}…）`)
    }
  }
  const isThatCommit = { ok: problems.length === 0, files, problems }

  // ③ 活树从派工那一刻起动了几处（判不了 ⇒ null + 一句说法）。
  const baselineFile = args.liveBaseline === null ? null : path.resolve(args.liveBaseline)
  const live = liveMoved(path.resolve(args.liveRoot ?? repo), baselineFile)

  const ok = equal === true && isThatCommit.ok === true
  emit({
    ok,
    commit: resolved.sha,
    copy: { root: copy, code_sha256: code.ok ? code.sha256 : null, files: code.files, bytes: code.bytes, problems: code.problems },
    equal,
    is_that_commit: isThatCommit,
    live: { baseline: baselineFile, moved: live.moved, places: live.places, detail: live.detail },
  }, ok ? 0 : 1)
}

// ── 入口 ───────────────────────────────────────────────────────────────────
function main(argv) {
  const args = parseArgs(argv)
  if (args.error) return fail('E_USAGE', `${args.error}\n${USAGE}`)
  if (args.help) {
    process.stderr.write(`${USAGE}\n`)
    return
  }
  if (args.mode === 'export') return doExport(args)
  return doVerify(args)
}

main(process.argv.slice(2))
