/**
 * `F-160` 的量具 —— **「派工那一刻的提交」这件事怎么量**。
 *
 * 病根（2026-10-24 11:05–11:35 实测）：技术评审的前后 CODE 指纹一直量在**活树**上，
 * 而活树里装着"别的岗位此刻正在写的文件" ⇒ `equal` 是概率不是规矩（25 分钟翻了 7 次、`changed[]` 4 → 18）。
 * 新口径：评审对象 = **派工那一刻的 git 提交（HEAD）**，评审读的是它的一份**只读副本**，
 * `equal` 量在**副本**上；活树在窗口里动了 ⇒ 与本轮无关，但报告里要点名"活树动了几处"。
 *
 * 本模块只做四件事，每件都**独立于被测对象**：
 *   ① **从 git 对象算 CODE 指纹**（`codeDigestOfCommit`）—— 与 `.tools/fingerprint.mjs` 是**两条独立的路**：
 *      它读**提交里的 blob**，另一条读**盘上的副本**。两条对上才算"副本就是那个提交"，而不是"某个目录"。
 *   ② **造夹具仓库**（`buildFixtureRepo`）—— 两次提交、可钉哈希、不看墙上时钟、不碰真实仓库。
 *   ③ **调用导出器的壳**（`runExport` / `runVerify`）—— CLI 形状与 JSON 字段写在
 *      `.team/test/2026-10-24/契约-F-160-判断形状.md` §2；这里只按那份契约调它，缺一样就点名。
 *   ④ **读三份文档里的判据针**（`dispatchShapes`）—— 派工卡怎么写、作业书怎么讲 `equal`、契约那一句。
 *
 * 🔴 排除表在这份文件里是**第二份写法**（第一份在 `.tools/fingerprint.mjs` 的文件头 ③/④）。
 *    为什么允许第二份：`①` 那条路要独立，就不能借被测工具的收录结果。**代价要认**：
 *    两边一旦分叉，`codeDigestOfCommit` 与 `fingerprintTool` 会在**同一棵树**上报不同的数 ⇒ 红（`DEVICE-MISMATCH`），
 *    不会静默放过。改这一份之前先改 `.tools/fingerprint.mjs` 的文件头，两份一起改。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { PATHS } from './env.mjs'

/** 导出器的规范落点（`F-160` 范围 #2）。换名字也行 —— 用 `AGENIA_TREE_AT_COMMIT` 指过来。 */
export const EXPORTER_REL = '.tools/tree-at-commit.mjs'

/** 三把文档面的针（见 `契约-F-160-判断形状.md` §4）。**每一格都是"任一命中即过"**：措辞是写的人的事。 */
export const NEEDLE_TABLE = {
  /** 作业书「必读输入清单」里 `代码根` 那一行：它点的必须是**副本**，不再是"绝对路径"。 */
  BRIEF_CODE_ROOT: {
    row_marker: '代码根',
    must: [['副本', 'tree-at', 'commit', '提交']],
    retired: { text: '任务书点名的绝对路径', reason: '那一行今天点的就是活树 —— 11:0x 的根因写在这一行上' },
  },
  /** 作业书「地基」一节：`equal` 量在副本上（`copy`）+ 活树变动不算你的事（`live_scope`）+ 你得报一句（`report_n`）。 */
  BRIEF_SECTION: {
    heading: /^#+\s*.*地基/,
    copy: ['副本'],
    live_scope: ['活树', '工作树'],
    out_of_scope: ['不在本轮', '与本轮无关', '与这一轮无关', '不算你的', '不算你的事', '不在你的范围', 'out of scope', 'outside this round'],
    report_n: [/[报写记][^\n]{0,24}(活树|工作树)/, /(活树|工作树)[^\n]{0,24}(处|次)/],
  },
  /** `leader.md` 第三步（派两份每日评审）：派工卡得写 `<commit>` + 副本路径 + `before_sha256`。 */
  LEADER_STEP: {
    heading: /^\*\*三、\s*派两份/,
    end: /^\*\*四、/,
    commit: ['rev-parse', 'HEAD'],
    copy: ['副本', 'tree-at'],
    before: ['before_sha256'],
  },
  /** `CONTRACT.md`：一句话 —— 评审效力的口径是**提交**，不是工作树。 */
  CONTRACT: {
    ticket: 'F-160',
    commit: ['提交', 'commit'],
    tree: ['工作树', '活树'],
    window: 25,
  },
}

// ── 哈希 ───────────────────────────────────────────────────────────────────
export const sha256Of = (buf) => createHash('sha256').update(buf).digest('hex')
export const sha256Text = (text) => sha256Of(Buffer.from(text, 'utf8'))
export const sha1Hex = (buf) => createHash('sha1').update(buf).digest('hex')

/** git blob 的 SHA-1 = `sha1("blob <字节数>\0" + 内容)` —— 用来证明"副本这一份文件的字节 = 提交里这个路径的字节"。 */
export function gitBlobSha1(buf) {
  return sha1Hex(Buffer.concat([Buffer.from(`blob ${buf.length}\u0000`, 'utf8'), buf]))
}

// ── CODE 收录口径（第二份写法，见文件头 🔴）──────────────────────────────────
const EXCLUDE_PREFIXES = [
  '.git/', '.workbuddy/', 'CLI/', '.team/',
  '.tools/_staging/', '.tools/_scratch/', '.tools/_backup/',
  '.runtime/',
  'presets/agenia/.runtime/',
]
const EXCLUDE_SEGMENTS = ['node_modules']
const EXCLUDE_BASENAMES = ['api.txt', '.credentials.yaml', '.credentials.yml']
const EXCLUDE_SUFFIXES = ['.log']

const isEnvClass = (base) => base === '.env' || base.startsWith('.env.')

/**
 * 这个**相对路径**在 CODE 那一套里排不排 —— 逐条对着 `.tools/fingerprint.mjs` 文件头的 ③ / ③b / ④ 写。
 * `rel` 一律 `/` 分隔、相对给定 root（与那个工具的基准一致）。
 */
export function excludedFromCode(rel) {
  const lower = rel.toLowerCase()
  for (const p of EXCLUDE_PREFIXES) if (lower.startsWith(p.toLowerCase())) return true
  const segs = lower.split('/')
  for (const s of EXCLUDE_SEGMENTS) if (segs.includes(s)) return true
  const base = segs[segs.length - 1]
  if (EXCLUDE_BASENAMES.includes(base)) return true
  for (const suf of EXCLUDE_SUFFIXES) if (base.endsWith(suf)) return true
  return isEnvClass(base)
}

/** 汇总形状：`sha256( Σ  `${rel}\0${fileSha}\0${bytes}\n`  )`，按相对路径的 UTF-8 字节序升序。 */
export function treeDigest(entries) {
  const sorted = [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.rel, 'utf8'), Buffer.from(b.rel, 'utf8')))
  const h = createHash('sha256')
  for (const e of sorted) h.update(`${e.rel}\u0000${e.sha256}\u0000${e.bytes}\n`, 'utf8')
  return {
    sha256: h.digest('hex'),
    files: sorted.length,
    bytes: sorted.reduce((n, e) => n + e.bytes, 0),
    list: sorted.map((e) => ({ rel: e.rel, sha256: e.sha256, bytes: e.bytes })),
  }
}

/** 盘上**一棵目录**的 CODE 指纹（这条路读盘）。
 *  ⚠️ 走目录时要**剪枝**：`.team/` / `.runtime/` / `node_modules` 这些前缀下的文件一概不收，
 *  还往里走就是白读几万份（真仓库的 `.team/test/…/_runs/…` 实测能把一次量测拖到两分钟）。 */
export function codeDigestOfDir(root) {
  const out = []
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      const full = path.join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      const rel = path.relative(root, full).replace(/\\/g, '/')
      if (st.isDirectory()) {
        if (excludedFromCode(`${rel}/`)) continue
        walk(full)
      } else if (st.isFile()) {
        if (excludedFromCode(rel)) continue
        const buf = readFileSync(full)
        out.push({ rel, sha256: sha256Of(buf), bytes: buf.length })
      }
    }
  }
  walk(root)
  return treeDigest(out)
}

// ── git ────────────────────────────────────────────────────────────────────
/**
 * 每一次 git 调用都钉住这几样 —— 否则夹具仓库的字节会随**本机的 git 配置**变：
 * `core.autocrlf`（换行归一）、`core.quotepath`（中文路径转义）、作者 / 提交时刻。
 * ⚠️ 这几项只影响**夹具**；真实仓库的 blob 本来就是 LF（`.gitattributes: * text=auto eol=lf`）。
 */
const GIT_PINNED = ['-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', '-c', 'core.safecrlf=false', '-c', 'init.defaultBranch=main']

function gitEnv(extra = {}) {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'agenia-test',
    GIT_AUTHOR_EMAIL: 'test@agenia.local',
    GIT_COMMITTER_NAME: 'agenia-test',
    GIT_COMMITTER_EMAIL: 'test@agenia.local',
    // 夹具提交的时刻钉死 ⇒ 同一份夹具在任何一天跑都得到同一棵树（哈希本身不靠它，但读数可复现）。
    GIT_AUTHOR_DATE: '2026-10-24T00:00:00+0800',
    GIT_COMMITTER_DATE: '2026-10-24T00:00:00+0800',
    ...extra,
  }
}

/** 跑一次 git：`{status, stdout, stderr, error}` —— 失败**不抛**（调用方要把退出码写进读数）。 */
export function git(args, { cwd, input, maxBuffer = 256 * 1024 * 1024 } = {}) {
  const r = spawnSync('git', [...GIT_PINNED, ...args], {
    cwd,
    input,
    encoding: input === undefined ? 'utf8' : null,
    maxBuffer,
    env: gitEnv(),
  })
  if (input !== undefined) {
    return { status: r.status, stdout: r.stdout ?? Buffer.alloc(0), stderr: (r.stderr ?? Buffer.alloc(0)).toString('utf8'), error: r.error ?? null }
  }
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ?? null }
}

/** 一个提交里的**全部 blob**（`rel → blob sha`）—— 只读 git 对象，不看工作树。 */
export function lsTreeBlobs(repo, commit) {
  const r = git(['ls-tree', '-r', '-z', commit], { cwd: repo })
  if (r.status !== 0) return { ok: false, entries: [], problems: [`git ls-tree ${commit} 退出码 ${r.status}：${String(r.stderr).trim().slice(0, 300)}`] }
  const entries = []
  const problems = []
  for (const item of String(r.stdout).split('\u0000')) {
    if (item === '') continue
    const tab = item.indexOf('\t')
    if (tab < 0) { problems.push(`ls-tree 一行认不出来：${item.slice(0, 120)}`); continue }
    const meta = item.slice(0, tab).split(/\s+/)
    const rel = item.slice(tab + 1)
    const [mode, type, sha] = meta
    if (type !== 'blob') { problems.push(`${rel} 在提交里不是 blob（${type}）—— 夹具不支持子模块 / 目录项`); continue }
    entries.push({ rel, mode, sha })
  }
  return { ok: problems.length === 0, entries, problems }
}

/** 一次 `git cat-file --batch` 把一堆 blob 的字节读出来（照请求次序）。 */
export function batchBlobs(repo, shas) {
  const map = new Map()
  if (shas.length === 0) return map
  const r = spawnSync('git', [...GIT_PINNED, 'cat-file', '--batch'], {
    cwd: repo,
    input: `${shas.join('\n')}\n`,
    maxBuffer: 256 * 1024 * 1024,
    env: gitEnv(),
  })
  const buf = r.stdout ?? Buffer.alloc(0)
  let off = 0
  for (const sha of shas) {
    const nl = buf.indexOf(0x0a, off)
    if (nl < 0) break
    const header = buf.subarray(off, nl).toString('utf8')
    const parts = header.split(' ')
    if (parts[1] === 'missing') { off = nl + 1; continue }
    const size = Number(parts[2])
    const start = nl + 1
    map.set(sha, buf.subarray(start, start + size))
    off = start + size + 1
  }
  return map
}

/** **提交**的 CODE 指纹（这条路读 git 对象；与 `codeDigestOfDir` 互不知道对方）。 */
export function codeDigestOfCommit(repo, commit) {
  const tree = lsTreeBlobs(repo, commit)
  if (!tree.ok) return { ok: false, problems: tree.problems, sha256: null, files: 0, bytes: 0, list: [] }
  const code = tree.entries.filter((e) => !excludedFromCode(e.rel))
  const bytesBySha = batchBlobs(repo, [...new Set(code.map((e) => e.sha))])
  const problems = []
  const rows = []
  for (const e of code) {
    const buf = bytesBySha.get(e.sha)
    if (buf === undefined) { problems.push(`blob 读不出来：${e.rel}（${e.sha}）`); continue }
    rows.push({ rel: e.rel, sha256: sha256Of(buf), bytes: buf.length, blob: e.sha })
  }
  const d = treeDigest(rows)
  return { ok: problems.length === 0, problems, ...d, blobs: new Map(rows.map((r) => [r.rel, r.blob])), excluded: tree.entries.filter((e) => excludedFromCode(e.rel)).map((e) => e.rel) }
}

/** `.tools/fingerprint.mjs` 的 CODE 读数（这一跑最硬的"盘上那棵树"那个数）。 */
export function fingerprintTool(root, { repo = PATHS.repo, timeoutMs = 120000 } = {}) {
  const file = path.join(repo, '.tools', 'fingerprint.mjs')
  if (!existsSync(file)) return { ok: false, problems: [`尺子不在：${file}`], sha256: null, files: null, bytes: null, list: [] }
  const r = spawnSync(process.execPath, [file, '--root', root, '--set', 'code', '--json'], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env },
  })
  if (r.status !== 0) return { ok: false, problems: [`fingerprint.mjs 退出码 ${r.status}：${String(r.stderr).trim().slice(0, 300)}`], sha256: null, files: null, bytes: null, list: [] }
  let parsed
  try {
    parsed = JSON.parse(String(r.stdout).trim().split('\n').pop())
  } catch (err) {
    return { ok: false, problems: [`fingerprint.mjs 的输出不是 JSON：${String(err.message).slice(0, 160)}`], sha256: null, files: null, bytes: null, list: [] }
  }
  const code = parsed?.sets?.code
  if (!code || typeof code.sha256 !== 'string') return { ok: false, problems: ['fingerprint.mjs 的读数里没有 sets.code.sha256'], sha256: null, files: null, bytes: null, list: [] }
  return { ok: true, problems: [], sha256: code.sha256, files: code.files, bytes: code.bytes, list: code.list ?? [], root: parsed.root }
}

/**
 * 用现成的那把尺子给**活树**存一份 CODE 基线（`.tools/fingerprint.mjs --save`）——
 * 组长今天在派工前干的就是这件事（11:05 那次基线）。它是 `fingerprintCompare` 的输入。
 */
export function saveCodeBaseline(root, file, { repo = PATHS.repo, timeoutMs = 120000 } = {}) {
  const tool = path.join(repo, '.tools', 'fingerprint.mjs')
  mkdirSync(path.dirname(file), { recursive: true })
  const r = spawnSync(process.execPath, [tool, '--root', root, '--set', 'code', '--save', file, '--json'], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env },
  })
  if (r.status !== 0) return { ok: false, problems: [`fingerprint.mjs --save 退出码 ${r.status}：${String(r.stderr).trim().slice(0, 300)}`], file }
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { ok: false, problems: [`写出来的基线不是可解析 JSON：${String(err.message).slice(0, 160)}`], file }
  }
  const list = raw?.sets?.code?.list
  if (!Array.isArray(list) || list.length === 0) return { ok: false, problems: ['基线里 sets.code.list 不是非空数组（"变了 0 处"会是一个空读数）'], file }
  return { ok: true, problems: [], file, sha256: raw.sets.code.sha256, files: raw.sets.code.files }
}

/**
 * 拿一份 `fingerprint.mjs --save` 形状的基线，比**现在的这棵树**：`{ok, equal, changed[]}`。
 * 退出码 1 是"不等"（不是失败）—— 只有 2 才是"比不了"（基线不在 / 里面没有这一套）。
 * 🔴 **基线里没有 `list` 时 `changed[]` 必然是空的** ⇒ 那是"比不了"，不许读成"没变"：本函数把它单独报出来。
 */
export function fingerprintCompare(root, baselineFile, { repo = PATHS.repo, timeoutMs = 120000 } = {}) {
  if (!existsSync(baselineFile)) return { ok: false, equal: null, changed: [], problems: [`基线不在：${baselineFile}`] }
  let raw
  try {
    raw = JSON.parse(readFileSync(baselineFile, 'utf8'))
  } catch (err) {
    return { ok: false, equal: null, changed: [], problems: [`基线不是可解析 JSON：${String(err.message).slice(0, 160)}`] }
  }
  const list = raw?.sets?.code?.list
  const problems = []
  if (!Array.isArray(list) || list.length === 0) problems.push(`基线的 sets.code.list 不是非空数组 —— 没有它就没法逐份算 \`changed[]\`，"变了 0 处"会是一个空读数`)
  if (typeof raw?.sets?.code?.sha256 !== 'string') problems.push('基线的 sets.code.sha256 不是字符串')
  const file = path.join(repo, '.tools', 'fingerprint.mjs')
  const r = spawnSync(process.execPath, [file, '--root', root, '--set', 'code', '--compare', baselineFile, '--json'], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env },
  })
  if (r.status !== 0 && r.status !== 1) {
    problems.push(`fingerprint.mjs --compare 退出码 ${r.status}：${String(r.stderr).trim().slice(0, 300)}`)
    return { ok: false, equal: null, changed: [], problems }
  }
  let parsed
  try {
    parsed = JSON.parse(String(r.stdout).trim().split('\n').pop())
  } catch (err) {
    problems.push(`fingerprint.mjs --compare 的输出不是 JSON：${String(err.message).slice(0, 160)}`)
    return { ok: false, equal: null, changed: [], problems }
  }
  const cmp = parsed?.compare
  if (!cmp || typeof cmp.equal !== 'boolean' || !Array.isArray(cmp.changed)) {
    problems.push('fingerprint.mjs --compare 的读数里没有 compare.equal / compare.changed')
    return { ok: false, equal: null, changed: [], problems }
  }
  return { ok: problems.length === 0, problems, equal: cmp.equal, changed: cmp.changed, exit: r.status, per_set: cmp.per_set ?? null }
}

/** 两棵 CODE 名单（`[{rel, sha256, bytes}]`）的差集 —— **只看名单，不跑 git**。 */
export function codeListDiff(aList, bList) {
  const a = new Map(aList.map((f) => [f.rel, f.sha256]))
  const b = new Map(bList.map((f) => [f.rel, f.sha256]))
  const out = []
  for (const [rel, sha] of b) {
    if (!a.has(rel)) out.push({ rel, kind: 'added' })
    else if (a.get(rel) !== sha) out.push({ rel, kind: 'modified' })
  }
  for (const rel of a.keys()) if (!b.has(rel)) out.push({ rel, kind: 'removed' })
  out.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0))
  return out
}

// ── 夹具：一个能被"钉哈希"的小仓库 ────────────────────────────────────────────
/**
 * 造一个夹具仓库，**两次提交**：
 *   · `A`：CODE 5 份（`lib/alpha.mjs` / `lib/beta.mjs` / `presets/agenia/lib/gamma.mjs` / `README.md` / `notes/plan.md`）
 *     + 两份**进了提交但不进 CODE** 的文件（`notes/run.log` 后缀被排、`.env` 是 env 类）
 *     ⇒ 副本里 7 份文件、CODE 名单 5 份 —— 排除表在副本上一样要生效（"副本 = 目录"不算证据）。
 *   · `B`：改 `lib/alpha.mjs`、加 `lib/delta.mjs`（CODE 7 份）—— 用来证明"核对提交"这一腿真的在读提交。
 * 工作树里**另外**放一份**没进提交**的 `lib/work-in-progress.mjs`（真实现场：别的岗位刚落的文件）——
 * 它让"副本 vs 活树的分歧"从第一秒起就 **≠ 0**：谁把"分歧"当"变动"，读数就会多出来（`LIVE-COUNT-INFLATED`）。
 */
export function buildFixtureRepo(runRoot, name) {
  const dir = path.join(runRoot, 'fixtures', `f160-${name}`)
  const repo = path.join(dir, 'repo')
  mkdirSync(repo, { recursive: true })
  const write = (rel, text) => {
    const full = path.join(repo, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, text, 'utf8')
  }
  const A = {
    'README.md': '# 夹具（F-160）\n\n两份提交：`A` 与 `B`。\n',
    'lib/alpha.mjs': "export const ALPHA = 'a1'\n",
    'lib/beta.mjs': "export const BETA = 'b1'\n",
    'presets/agenia/lib/gamma.mjs': "export const GAMMA = 'g1'\n",
    'notes/plan.md': '- 第一步\n- 第二步\n',
    // 进提交、不进 CODE（后缀 / env 类）—— 副本里必须在，CODE 名单里必须不在
    'notes/run.log': '2016-10-24T11:05:00+08:00 一位读数\n',
    '.env': 'AGENIA_FAKE=1\n',
  }
  for (const [rel, text] of Object.entries(A)) write(rel, text)
  const run = (args) => {
    const r = git(args, { cwd: repo })
    if (r.status !== 0) throw new Error(`夹具 git ${args.join(' ')} 失败（${r.status}）：${String(r.stderr).trim().slice(0, 400)}`)
    return String(r.stdout).trim()
  }
  run(['init', '--quiet'])
  run(['add', '-A'])
  run(['commit', '--quiet', '-m', 'A：夹具第一次提交'])
  const commitA = run(['rev-parse', 'HEAD'])
  write('lib/alpha.mjs', "export const ALPHA = 'a2'\n")
  write('lib/delta.mjs', "export const DELTA = 'd1'\n")
  run(['add', '-A'])
  run(['commit', '--quiet', '-m', 'B：夹具第二次提交'])
  const commitB = run(['rev-parse', 'HEAD'])
  // 回到 A：**活树**停在 B，但我们导的是 A ⇒ "副本是哪个提交"这一腿有东西可核。
  // 另外放一份**没进提交**的工作树文件（活树里有、两个提交里都没有）。
  write('lib/work-in-progress.mjs', "export const WIP = 'wip'\n")
  return { dir, repo, commitA, commitB, filesA: Object.keys(A), filesB: [...Object.keys(A), 'lib/delta.mjs'] }
}

// ── 副本核对（"它是那个提交"，不是"某个目录"）────────────────────────────────
/**
 * 逐条核：副本里的**每一个**文件，其 `git blob` SHA-1 必须等于该路径在该提交里的 blob SHA-1；
 * 路径集合也必须一致（多一份 / 少一份都报）；副本里不许有 `.git`（文件或目录 ——
 * `git worktree add` 会留一个 `.git` 文件，那个文件本身就是一条指向真实仓库的活链）。
 */
export function verifyCopyIsCommit({ repo, commit, copyRoot }) {
  const problems = []
  const tree = lsTreeBlobs(repo, commit)
  if (!tree.ok) return { ok: false, problems: tree.problems, expected: [], actual: [], mismatched: [] }
  const expected = new Map(tree.entries.map((e) => [e.rel, e.sha]))
  const actual = new Map()
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = statSync(full)
      const rel = path.relative(copyRoot, full).replace(/\\/g, '/')
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) actual.set(rel, full)
    }
  }
  walk(copyRoot)
  for (const rel of actual.keys()) {
    if (rel === '.git' || rel.startsWith('.git/')) problems.push(`副本里带着 \`.git\`：${rel} —— 副本必须是**纯树**（用 \`git archive\`，或把 worktree 的 \`.git\` 文件去掉）`)
  }
  const missing = [...expected.keys()].filter((rel) => !actual.has(rel)).sort()
  const extra = [...actual.keys()].filter((rel) => !expected.has(rel) && rel !== '.git' && !rel.startsWith('.git/')).sort()
  const mismatched = []
  for (const [rel, abs] of actual) {
    if (!expected.has(rel)) continue
    const got = gitBlobSha1(readFileSync(abs))
    if (got !== expected.get(rel)) mismatched.push({ rel, expected: expected.get(rel), actual: got })
  }
  for (const rel of missing) problems.push(`副本少一份（提交里有、副本里没有）：${rel}`)
  for (const rel of extra) problems.push(`副本多一份（副本里有、提交里没有）：${rel}`)
  for (const m of mismatched) problems.push(`副本这一份的字节不是该提交里的那一份：${m.rel}（提交 ${m.expected.slice(0, 12)}… / 副本 ${m.actual.slice(0, 12)}…）`)
  return { ok: problems.length === 0, problems, expected: [...expected.keys()].sort(), actual: [...actual.keys()].sort(), missing, extra, mismatched }
}

// ── 校验侧 ──────────────────────────────────────────────────────────────────
/**
 * **参照实现**：把提交的 blob 原样写成一份纯树（`git archive` 的等价物，但只走 `cat-file`，不装 tar 依赖）。
 *
 * 🔴 它的身份是**量具的阳性对照**（`mig-rules-14`），**不是被测对象**：
 *    · 判据里凡是关于"导出器"的断言，一律喂 `.tools/tree-at-commit.mjs`（`runExport`）；
 *    · 这里这一份只回答一个问题：「**副本这条口径本身能不能翻面**」——
 *      活树动了它不变（`REV-04`）、副本被动过它变（`REV-05`）。
 *      ⇒ 它绿不等于导出器写对了；它红了说明**这一票的形状根本立不住**（那时候先改契约，不是改工具）。
 *    · 实现岗**不许 import 它**（`tests/**` 不是生产代码的来源）。
 */
export function exportCommitReference(repo, commit, outDir) {
  const tree = lsTreeBlobs(repo, commit)
  if (!tree.ok) return { ok: false, problems: tree.problems, files: 0 }
  const bytesBySha = batchBlobs(repo, [...new Set(tree.entries.map((e) => e.sha))])
  const problems = []
  let files = 0
  for (const e of tree.entries) {
    const buf = bytesBySha.get(e.sha)
    if (buf === undefined) { problems.push(`blob 读不出来：${e.rel}`); continue }
    const full = path.join(outDir, e.rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, buf)
    files += 1
  }
  return { ok: problems.length === 0, problems, files }
}

// ── 导出器（`.tools/tree-at-commit.mjs`）的调用壳 ────────────────────────────
/** 导出器在哪：`AGENIA_TREE_AT_COMMIT` > `<仓库>/.tools/tree-at-commit.mjs`。**不存在也要报**，不许兜底。 */
export function exporterPath(env = process.env) {
  const override = env.AGENIA_TREE_AT_COMMIT
  if (override !== undefined && String(override).trim() !== '') {
    const file = path.resolve(String(override))
    return { file, exists: existsSync(file), source: 'AGENIA_TREE_AT_COMMIT' }
  }
  const file = path.join(PATHS.repo, EXPORTER_REL)
  return { file, exists: existsSync(file), source: 'repo-default' }
}

/** 一次子进程：`{exit, json, stdout, stderr}`；`json` 只认**最后一行**可解析的对象。 */
function runJsonCli(file, args, { cwd = PATHS.repo, timeoutMs = 180000, env = process.env } = {}) {
  const r = spawnSync(process.execPath, [file, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...env },
  })
  const stdout = String(r.stdout ?? '')
  const stderr = String(r.stderr ?? '')
  let json = null
  let jsonError = null
  const lines = stdout.trim().split('\n').filter((l) => l.trim() !== '')
  try {
    json = lines.length === 0 ? null : JSON.parse(lines[lines.length - 1])
  } catch (err) {
    jsonError = String(err.message).slice(0, 200)
  }
  return { exit: r.status ?? (r.error ? -1 : 1), json, json_error: jsonError, stdout, stderr }
}

/** 导出：`--repo <root> --commit <sha> --out <dir> [--live-baseline <file>] --json`
 *  ⇒ 副本 + 读数；给了 `--live-baseline` 才量活树那一刻（否则 `live_baseline: null`，**不是**"没变"）。 */
export function runExport({ exporter, repo, commit, out, liveBaseline = null, timeoutMs } = {}) {
  const args = ['--repo', repo, '--commit', commit, '--out', out, '--json']
  if (liveBaseline) args.push('--live-baseline', liveBaseline)
  return runJsonCli(exporter, args, { timeoutMs })
}

/**
 * 校验：`--verify <副本> --repo <root> --commit <sha> --expect <before_sha256> --live-baseline <file> --json`。
 * **它必须自己复算**：`equal` 读的是副本现在的字节与 `--expect` 的比，不是照抄卡上的值。
 */
export function runVerify({ exporter, copy, repo, commit, expect, liveBaseline, liveRoot, timeoutMs } = {}) {
  const args = ['--verify', copy, '--repo', repo, '--commit', commit, '--expect', expect, '--json']
  if (liveBaseline) args.push('--live-baseline', liveBaseline)
  if (liveRoot) args.push('--live-root', liveRoot)
  return runJsonCli(exporter, args, { timeoutMs })
}

/** 导出/校验两次读数的形状闸（字段缺一个就点名，不让"读不出来"退化成"没问题"）。
 *  ⚠️ `live_baseline` / `live.moved` **允许是 `null`**（= 没给基线 ⇒ 变动数判不了），
 *     但**键必须在**：`null` 是"判不了"，缺键是"这一版没有这个概念"。 */
export const EXPORT_FIELDS = ['ok', 'commit', 'tree_root', 'code', 'live_baseline']
export const VERIFY_FIELDS = ['ok', 'commit', 'copy', 'equal', 'is_that_commit', 'live']

export function missingFields(obj, fields) {
  if (obj === null || typeof obj !== 'object') return [...fields]
  return fields.filter((f) => !(f in obj) || obj[f] === undefined)
}

// ── 文档面的针（派工卡怎么教、作业书怎么讲、契约那一句）──────────────────────────
const readTextIfExists = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null)

/** 在 `text` 里找 `[start, end)` 那一段（按行号找标题，找不到返回 null）。 */
function sectionOf(text, startRe, endRe = null) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => startRe.test(l))
  if (start < 0) return null
  let end = lines.length
  if (endRe !== null) {
    for (let i = start + 1; i < lines.length; i += 1) {
      if (endRe.test(lines[i])) { end = i; break }
    }
  }
  return { start_line: start + 1, end_line: end, text: lines.slice(start, end).join('\n'), lines: lines.slice(start, end) }
}

const hasAny = (text, needles) => needles.some((n) => (n instanceof RegExp ? n.test(text) : text.includes(n)))

/**
 * 三份载体上那几针（形状见 `NEEDLE_TABLE`）：**每针报"命中了哪一句"，不报"绿了"**。
 * 红因码：`BRIEF-CODE-ROOT-STILL-LIVE-PATH` · `BRIEF-COPY-ANCHOR-MISSING` ·
 * `BRIEF-LIVE-SCOPE-MISSING` · `BRIEF-REPORT-N-MISSING` · `CARD-COMMIT-ANCHOR-MISSING` ·
 * `CARD-COPY-ANCHOR-MISSING` · `CARD-BEFORE-ANCHOR-MISSING` · `CONTRACT-F160-SENTENCE-MISSING`
 */
export function dispatchShapes({ repo = PATHS.repo } = {}) {
  const problems = []
  const readings = { files: {}, missing: [] }
  const briefFile = path.join(repo, 'presets', 'agenia', 'job-briefs', 'technical-review.md')
  const leaderFile = path.join(repo, 'presets', 'agenia', 'leader.md')
  const contractFile = path.join(repo, 'CONTRACT.md')
  const brief = readTextIfExists(briefFile)
  const leader = readTextIfExists(leaderFile)
  const contract = readTextIfExists(contractFile)
  for (const [key, file, text] of [['brief', briefFile, brief], ['leader', leaderFile, leader], ['contract', contractFile, contract]]) {
    readings.files[key] = { file, exists: text !== null, bytes: text === null ? 0 : Buffer.byteLength(text, 'utf8') }
    if (text === null) readings.missing.push(file)
  }

  // ① 作业书「必读输入清单」里 `代码根` 那一行 —— 点的必须是副本，不再是活树的绝对路径。
  if (brief !== null) {
    const rowRe = new RegExp(NEEDLE_TABLE.BRIEF_CODE_ROOT.row_marker)
    const row = brief.split(/\r?\n/).find((l) => rowRe.test(l)) ?? null
    readings.brief_code_root_row = row
    if (row === null) {
      problems.push({ code: 'BRIEF-CODE-ROOT-ROW-MISSING', message: `作业书 ${briefFile} 里找不到「代码根」那一行 —— 必读输入清单的第 1 行是这一票的落点，它不在就等于没改` })
    } else {
      const copyHit = hasAny(row, NEEDLE_TABLE.BRIEF_CODE_ROOT.must[0])
      if (!copyHit) {
        problems.push({ code: 'BRIEF-CODE-ROOT-STILL-LIVE-PATH', message: `作业书的「代码根」那一行还没有副本：${row.trim().slice(0, 200)}\n      ⇒ 应点名 \`<commit>\` 的只读副本（任一即可：${NEEDLE_TABLE.BRIEF_CODE_ROOT.must[0].join(' / ')}）；今天这一行点的还是活树 —— 11:0x 的根因就写在这一行上` })
      }
    }

    // ② 地基一节：equal 量在副本上 + 活树变动不算你的事 + 你得报一句
    const section = sectionOf(brief, NEEDLE_TABLE.BRIEF_SECTION.heading)
    readings.brief_section = section === null ? null : { start_line: section.start_line, end_line: section.end_line, lines: section.lines.length }
    if (section === null) {
      problems.push({ code: 'BRIEF-SECTION-MISSING', message: `作业书 ${briefFile} 里找不到「地基」那一节（标题须匹配 ${String(NEEDLE_TABLE.BRIEF_SECTION.heading)}）—— 这一票要改的就是那一节` })
    } else {
      const copyHit = section.lines.find((l) => hasAny(l, NEEDLE_TABLE.BRIEF_SECTION.copy)) ?? null
      readings.brief_section.copy_line = copyHit
      if (copyHit === null) {
        problems.push({ code: 'BRIEF-COPY-ANCHOR-MISSING', message: `作业书「地基」一节（第 ${section.start_line}–${section.end_line} 行）没有把 equal / after_sha256 钉在**副本**上（一节里 ${NEEDLE_TABLE.BRIEF_SECTION.copy.join(' / ')} 一个都没有）—— 量在活树上就是今天那个"注定失败"的口径` })
      }
      const liveHit = section.lines.find((l) => hasAny(l, NEEDLE_TABLE.BRIEF_SECTION.live_scope)) ?? null
      const scopeHit = section.lines.find((l) => hasAny(l, NEEDLE_TABLE.BRIEF_SECTION.out_of_scope)) ?? null
      readings.brief_section.live_line = liveHit
      readings.brief_section.scope_line = scopeHit
      if (liveHit === null || scopeHit === null) {
        problems.push({ code: 'BRIEF-LIVE-SCOPE-MISSING', message: `作业书「地基」一节没有写清"活树在动不算你的事"（活树线：${liveHit === null ? '缺' : '有'} · 口径线：${scopeHit === null ? '缺' : '有'}；口径任一即可：${NEEDLE_TABLE.BRIEF_SECTION.out_of_scope.join(' / ')}）` })
      }
      const reportHit = section.lines.find((l) => hasAny(l, NEEDLE_TABLE.BRIEF_SECTION.report_n)) ?? null
      readings.brief_section.report_line = reportHit
      if (reportHit === null) {
        problems.push({ code: 'BRIEF-REPORT-N-MISSING', message: `作业书「地基」一节没有"你得报一句活树动了几处"（任一即可：${NEEDLE_TABLE.BRIEF_SECTION.report_n.map(String).join(' · ')}）—— 活树变动不进效力，但它必须出现在报告里，否则读的人分不出"没动"与"没人看"` })
      }
    }
  }

  // ③ `leader.md` 第三步：派工卡写 `<commit>` + 副本路径 + `before_sha256`
  if (leader !== null) {
    const step = sectionOf(leader, NEEDLE_TABLE.LEADER_STEP.heading, NEEDLE_TABLE.LEADER_STEP.end)
    readings.leader_step = step === null ? null : { start_line: step.start_line, end_line: step.end_line, lines: step.lines.length }
    if (step === null) {
      problems.push({ code: 'CARD-STEP-MISSING', message: `leader.md 里找不到第三步（标题须匹配 ${String(NEEDLE_TABLE.LEADER_STEP.heading)}）—— 派工卡的写法就写在那一步` })
    } else {
      for (const [key, code, why] of [
        ['commit', 'CARD-COMMIT-ANCHOR-MISSING', '派工卡里没有"派工那一刻的提交"（`git rev-parse HEAD` 那一步）—— 评审对象仍然是活树'],
        ['copy', 'CARD-COPY-ANCHOR-MISSING', '派工卡里没有"只读副本"（评审读哪棵树没写下来）'],
        ['before', 'CARD-BEFORE-ANCHOR-MISSING', '派工卡里没有 `before_sha256`（评审拿什么当"派工那一刻"的读数）'],
      ]) {
        const hit = hasAny(step.text, NEEDLE_TABLE.LEADER_STEP[key])
        readings.leader_step[key] = hit
        if (!hit) problems.push({ code, message: `leader.md 第三步（第 ${step.start_line}–${step.end_line} 行）：${why}（任一即可：${NEEDLE_TABLE.LEADER_STEP[key].join(' / ')}）` })
      }
    }
  }

  // ④ `CONTRACT.md`：一句话 —— 评审效力的口径是提交，不是工作树
  if (contract !== null) {
    const lines = contract.split(/\r?\n/)
    const hits = []
    lines.forEach((l, i) => { if (l.includes(NEEDLE_TABLE.CONTRACT.ticket)) hits.push(i) })
    readings.contract = { ticket_lines: hits.map((i) => i + 1) }
    let ok = false
    for (const i of hits) {
      const win = lines.slice(Math.max(0, i - NEEDLE_TABLE.CONTRACT.window), i + NEEDLE_TABLE.CONTRACT.window + 1).join('\n')
      if (hasAny(win, NEEDLE_TABLE.CONTRACT.commit) && hasAny(win, NEEDLE_TABLE.CONTRACT.tree)) { ok = true; break }
    }
    readings.contract.sentence_ok = ok
    if (!ok) {
      problems.push({ code: 'CONTRACT-F160-SENTENCE-MISSING', message: `CONTRACT.md 里没有 ${NEEDLE_TABLE.CONTRACT.ticket} 那一句（口径 = 提交 / commit，不是工作树 / 活树）：命中 ${NEEDLE_TABLE.CONTRACT.ticket} 的行 ${hits.length === 0 ? '一条都没有' : `有 ${hits.length} 条（第 ${hits.map((i) => i + 1).join(', ')} 行）但前后 ${NEEDLE_TABLE.CONTRACT.window} 行里凑不齐两样`}` })
    }
  }

  return { problems, readings }
}
