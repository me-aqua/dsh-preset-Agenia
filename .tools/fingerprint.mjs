#!/usr/bin/env node
/**
 * `fingerprint.mjs` —— 仓库指纹：**CODE / ALL 两套**（拍板 Q7）。
 *
 * 用途：判"**代码有没有被动过**"（派工前后、评审前后、技术作业前后各量一次）。
 * CODE **不含** `.env`；ALL **含** `.env`（老板在界面上切一次模型就写一次 `.env`，
 * 那不是"代码被动过"，是功能本身 —— 所以只有 ALL 会因此翻面）。
 *
 * ── 配方（口径 · 逐条；改任何一个字都要重新跑基线）────────────────────────────
 *  ① **输入**：一棵树，`--root <dir>`（默认 = 本脚本所在目录的上一级，即仓库根）。
 *  ② **收录**：root 下的**全部普通文件**，减去下面那张排除表。
 *     ⚠️ 不是白名单 —— 白名单一漏就静默少算（"读不到"和"没有"长得一模一样）。
 *  ③ **排除表（两套共用，逐字就是这几条）**：
 *       · 路径前缀：`.git/` · `.workbuddy/` · `CLI/` · `.team/`
 *         · `.tools/_staging/` · `.tools/_scratch/` · `.tools/_backup/`
 *         · `.runtime/`（**2026-10-22 加** —— 数据目录的**根相对**写法，见下面 ③b）
 *         · `presets/agenia/.runtime/`（**2026-10-16 加** —— **共享记忆库的数据目录**：
 *           `.gitignore:53` · `release-scan.mjs` 的 `PROTECTED_SEGMENTS` · `install.mjs` 的拒删名单
 *           **三处都当它是数据**，只有本表把它当代码 ⇒ 一次正常审计写入就让"代码有没有被动过"翻面。
 *           10-15 技术评审 F5 报的；本机实测：三分钟里 CODE 翻两次，变化的全是脑数据、**一个代码文件都没有**）
 *  ③b **排除表与 `--root` 共用同一个基准**（2026-10-22 · `F-120`）。收录时给出的相对路径是
 *     `path.relative(root, full)`；**表里每一条前缀也只能是"相对给定 root"的形状** —— 从前
 *     `presets/agenia/.runtime/` 是**仓库根相对**写法，`--root presets\agenia` 时收录的相对路径是
 *     `.runtime/…` ⇒ 那一条**永不匹配**，60 份脑数据（3.8 MB）混进 CODE，于是"代码有没有被动过"
 *     被一次正常审计写入翻面（技术评审 2026-10-22 的 `equal=false`，48 份代码一个字节没动）。
 *     ⇒ 现在根相对那一条是 `.runtime/`（**只有顶层**那一段叫 `.runtime` 才算数据：
 *     `lib/.runtime/x` 这种是代码，不许被排除 —— 所以**不是**"任何一段叫 `.runtime` 就排"）。
 *     两条并存的理由：`--root` 是自由变量，两个根（仓库根 / 预设根）各需要一条能命中的形状。
 *       · 任意一段目录名是：`node_modules`
 *       · 文件名是：`api.txt` · `.credentials.yaml` · `.credentials.yml`
 *       · 后缀是：`.log`
 *     理由：前三类是"别的东西"（版本库 / 工作台 / 桌面客户端）；`.team/` 是队伍的办公桌，
 *     **每轮都在写**，拿它当"代码动过"就是天天喊狼来了（AGENTS.md 3e ④ 的同一条判据）；
 *     三个 `.tools/_*` 是施工区与备份区（实现岗并发在写）；凭据与日志不是代码，
 *     而且它们**存在与否**都不该让"代码有没有被动过"翻面。
 *  ④ **env 类（两套的**唯一**差异）**：文件名是 `.env` 或以 `.env.` 开头的。
 *     **CODE 排除它们，ALL 收录它们** —— 除这一条之外，两套的收录集合**逐字相同**。
 *  ⑤ **排序**：按**相对路径的 UTF-8 字节序升序**（`Buffer.compare`）。
 *     ⚠️ 不许用 `localeCompare` —— 它随 locale 变，指纹就不可复跑了。
 *     相对路径一律用 `/` 分隔、不带前导 `./`、大小写照盘上。
 *  ⑥ **哈希算法**：`SHA-256`；先算每个文件的 `sha256(原始字节)`，再汇总：
 *       `digest = sha256( Σ  `${rel}\0${fileSha}\0${bytes}\n`  )`   ← 按 ⑤ 的顺序拼，UTF-8
 *     ⚠️ 这个汇总形状与 `tests/agenia-upgrade/support/evidence.mjs` 的 `treeHash()` **逐字相同**
 *     （`rel\0sha\0bytes\n`）—— 同一批文件上两个工具应当给出同一个数，可以互相校对。
 *  ⑦ **BOM / LF**：文件内容**按原始字节**参与哈希 —— **不剥 BOM、不做 CRLF→LF 归一**
 *     （归一会把"换行符被改过"这件事藏起来，而那正是要抓的）。
 *     读数里的 `lines_lf` 是**行数**，口径是：剥掉开头的 BOM 之后，数 `\n` 的个数；
 *     CRLF 只算一个换行。**行数不参与哈希**，它只是给人看的口径（AGENTS.local 一①）。
 *  ⑧ **复跑稳定**：同一棵树、同一套 ⇒ 同一个数；不读时间、不读环境变量、不看进程。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   <node> .tools/fingerprint.mjs                       # 人话：两套 + 文件数
 *   <node> .tools/fingerprint.mjs --json                # 一行 JSON（可机读）
 *   <node> .tools/fingerprint.mjs --set code --json     # 只要 CODE
 *   <node> .tools/fingerprint.mjs --save before.json    # 存基线（喂给 --compare）
 *   <node> .tools/fingerprint.mjs --compare before.json # 比一次：equal / changed[]
 *   退出码：0 成功（`--compare` 时 = 相等）· 1 `--compare` 不相等 · 2 用法错
 *   ⚠️ 默认 `--set both`：一次给两个数 —— 只报一个数最容易把两套读混。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_DEFAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 排除表（③）—— 三条形状分开写，读的人一眼能核对配方。 */
const EXCLUDE_PREFIXES = [
  '.git/', '.workbuddy/', 'CLI/', '.team/',
  '.tools/_staging/', '.tools/_scratch/', '.tools/_backup/',
  // 数据目录的**根相对**写法（③b）：`--root <预设根>` 时收录的相对路径就是 `.runtime/…`。
  // 只认**顶层**那一段：`lib/.runtime/manifest.json` 这种仍然是代码（"任何一段叫 .runtime 就排"
  // 会把真代码一起藏起来 —— 少算不是安全）。
  '.runtime/',
  // 共享记忆库的**数据目录**（写法与 `.gitignore:53` 逐字一致）。
  // 库一开就每轮都在写：一次审计追加、一次常识确认都会让它变。
  // 2026-10-16 加 —— 来历见上面 ③ 那一行（10-15 技术评审 F5）。
  // 它是"仓库根相对"的形状 ⇒ 只有 `--root` = 仓库根时才命中；预设根那一路由上面那条 `.runtime/` 管。
  'presets/agenia/.runtime/',
]
const EXCLUDE_SEGMENTS = ['node_modules']
const EXCLUDE_BASENAMES = ['api.txt', '.credentials.yaml', '.credentials.yml']
const EXCLUDE_SUFFIXES = ['.log']

/** env 类（④）—— 两套的**唯一**差异。 */
function isEnvClass(name) {
  return name === '.env' || name.startsWith('.env.')
}

/**
 * `rel` 是**相对给定 root** 的路径（`/` 分隔、无前导 `./`）—— 排除表按同一个基准比（③b）。
 * 前缀比的是**段**：`.runtime/` 只吃顶层的 `.runtime/…`，不吃 `lib/.runtime/…`。
 */
function excluded(rel) {
  const lower = rel.toLowerCase()
  for (const p of EXCLUDE_PREFIXES) if (lower.startsWith(p.toLowerCase())) return true
  const segs = lower.split('/')
  for (const s of EXCLUDE_SEGMENTS) if (segs.includes(s)) return true
  const base = segs[segs.length - 1]
  if (EXCLUDE_BASENAMES.includes(base)) return true
  for (const suf of EXCLUDE_SUFFIXES) if (base.endsWith(suf)) return true
  return false
}

/** 枚举一棵树（相对路径 + 字节 + 单文件 sha + 行数），按 UTF-8 字节序升序。 */
function walk(root) {
  const out = []
  const visit = (dir) => {
    let names
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
      if (st.isDirectory()) {
        visit(full)
      } else if (st.isFile()) {
        const rel = path.relative(root, full).replace(/\\/g, '/')
        const buf = readFileSync(full)
        out.push({
          rel,
          bytes: st.size,
          sha256: createHash('sha256').update(buf).digest('hex'),
        })
      }
    }
  }
  visit(root)
  out.sort((a, b) => Buffer.compare(Buffer.from(a.rel, 'utf8'), Buffer.from(b.rel, 'utf8')))
  return out
}

/** 行数口径：剥 BOM 之后数 `\n`；`a\nb` = 2 · `a\n` = 1 · `''` = 0（CRLF 算一个换行）。 */
function linesLf(buf) {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '')
  if (text === '') return 0
  const parts = text.split('\n')
  if (parts[parts.length - 1] === '') parts.pop()
  return parts.length
}

function collect(root, includeEnv) {
  const all = walk(root).filter((f) => !excluded(f.rel) && (includeEnv || !isEnvClass(path.basename(f.rel))))
  const digest = createHash('sha256')
  for (const f of all) digest.update(`${f.rel}\u0000${f.sha256}\u0000${f.bytes}\n`, 'utf8')
  const bytes = all.reduce((n, f) => n + f.bytes, 0)
  return { sha256: digest.digest('hex'), files: all.length, bytes, list: all }
}

function fingerprint(root, includeEnv) {
  const rows = collect(root, includeEnv)
  return {
    sha256: rows.sha256,
    files: rows.files,
    bytes: rows.bytes,
    env_files: rows.list.filter((f) => isEnvClass(path.basename(f.rel))).map((f) => f.rel),
    list: rows.list.map((f) => ({
      rel: f.rel,
      bytes: f.bytes,
      sha256: f.sha256,
      lines_lf: linesLf(readFileSync(path.join(root, f.rel))),
    })),
  }
}

function parseArgs(argv) {
  const out = { root: REPO_DEFAULT, set: 'both', json: false, save: null, compare: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--json') out.json = true
    else if (a === '--root') out.root = argv[++i]
    else if (a === '--set') out.set = argv[++i]
    else if (a === '--save') out.save = argv[++i]
    else if (a === '--compare') out.compare = argv[++i]
    else if (a === '--help' || a === '-h') out.help = true
    else return { error: `未知参数：${a}` }
  }
  if (!['code', 'all', 'both'].includes(out.set)) return { error: `--set 只认 code / all / both，实得 ${JSON.stringify(out.set)}` }
  if (out.root === undefined || String(out.root).trim() === '') return { error: '--root 不能是空串' }
  return out
}

const USAGE = [
  'fingerprint.mjs —— CODE / ALL 两套指纹（配方写在文件头）',
  '',
  '  --root <dir>        要量哪棵树（默认 = 仓库根）',
  '  --set code|all|both 量哪一套（默认 both）',
  '  --json              一行 JSON 输出（可机读）',
  '  --save <file>       把这次读数写进文件（当基线）',
  '  --compare <file>    与基线比一次：equal / changed[]（不等 ⇒ 退出码 1）',
].join('\n')

function main(argv) {
  const args = parseArgs(argv)
  if (args.error) {
    process.stderr.write(`fingerprint.mjs: ${args.error}\n${USAGE}\n`)
    return 2
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  const root = path.resolve(args.root)
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    process.stderr.write(`fingerprint.mjs: --root 不是一个目录：${root}\n`)
    return 2
  }

  const want = args.set
  const sets = {}
  if (want === 'code' || want === 'both') sets.code = fingerprint(root, false)
  if (want === 'all' || want === 'both') sets.all = fingerprint(root, true)

  // 基线：`--save` 存、`--compare` 比。**只比同名的那一套**，缺了就报错，不静默跳过。
  const report = {
    ok: true,
    tool: 'fingerprint.mjs',
    root,
    caliber: {
      include: 'root 下全部普通文件 − 排除表（见文件头 ③；表里每一条前缀都相对给定 root，③b）',
      env_class: 'CODE 排除 `.env` / `.env.*`；ALL 收录它们 —— 两套的唯一差异',
      order: '相对路径的 UTF-8 字节序升序（Buffer.compare）',
      hash: 'sha256( Σ `${rel}\\0${fileSha}\\0${bytes}\\n` )，UTF-8',
      bytes: '原始字节（不剥 BOM、不做 CRLF→LF 归一）',
      lines_lf: '剥 BOM 后数 `\\n`；CRLF 算一个换行；行数不参与哈希',
    },
    sets,
  }

  if (args.compare !== null) {
    const baseFile = path.resolve(args.compare)
    if (!existsSync(baseFile)) {
      process.stderr.write(`fingerprint.mjs: 基线不在：${baseFile}\n`)
      return 2
    }
    let base
    try {
      base = JSON.parse(readFileSync(baseFile, 'utf8'))
    } catch (err) {
      process.stderr.write(`fingerprint.mjs: 基线不是可解析 JSON：${baseFile} —— ${String(err.message)}\n`)
      return 2
    }
    const cmp = { baseline: baseFile, equal: true, per_set: {}, changed: [] }
    for (const [name, cur] of Object.entries(sets)) {
      const before = base?.sets?.[name]
      if (!before || typeof before.sha256 !== 'string') {
        process.stderr.write(`fingerprint.mjs: 基线里没有 ${name.toUpperCase()} 这一套 —— 不许把"比不了"读成"没变"\n`)
        return 2
      }
      const same = before.sha256 === cur.sha256
      const changed = []
      const beforeMap = new Map((before.list ?? []).map((f) => [f.rel, f.sha256]))
      const curMap = new Map(cur.list.map((f) => [f.rel, f.sha256]))
      for (const [rel, sha] of curMap) {
        if (!beforeMap.has(rel)) changed.push({ rel, kind: 'added' })
        else if (beforeMap.get(rel) !== sha) changed.push({ rel, kind: 'modified' })
      }
      for (const rel of beforeMap.keys()) if (!curMap.has(rel)) changed.push({ rel, kind: 'removed' })
      changed.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
      cmp.per_set[name] = { before_sha256: before.sha256, after_sha256: cur.sha256, before_files: before.files, after_files: cur.files, equal: same }
      if (!same) {
        cmp.equal = false
        cmp.changed.push(...changed.map((c) => ({ ...c, set: name })))
      }
    }
    report.compare = cmp
    report.ok = cmp.equal
  }

  if (args.save !== null) {
    const saveFile = path.resolve(args.save)
    writeFileSync(saveFile, `${JSON.stringify({ ok: true, tool: 'fingerprint.mjs', root, caliber: report.caliber, sets }, null, 2)}\n`, 'utf8')
    report.saved = saveFile
    process.stderr.write(`fingerprint.mjs: 基线已写 ${saveFile}\n`)
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`)
  } else {
    for (const [name, v] of Object.entries(sets)) {
      process.stdout.write(`${name.toUpperCase().padEnd(4)}  ${v.sha256}  files=${v.files} bytes=${v.bytes}${v.env_files.length ? ` env=${v.env_files.join(',')}` : ''}\n`)
    }
    process.stdout.write(`root  ${root}\n`)
    if (report.compare) {
      process.stdout.write(report.compare.equal
        ? `compare  equal —— 与 ${report.compare.baseline} 逐套相同\n`
        : `compare  NOT EQUAL —— ${report.compare.changed.length} 处变化：${report.compare.changed.map((c) => `${c.set}:${c.rel}(${c.kind})`).join(' · ')}\n`)
    }
  }
  if (report.compare && !report.compare.equal) return 1
  return 0
}

process.exitCode = main(process.argv.slice(2))
