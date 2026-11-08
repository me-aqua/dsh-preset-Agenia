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
 *                                        [--live-baseline <file>] [--with-staging] --json
 *      · 副本 = 提交里**全部 blob** 原样落盘（`git ls-tree -r` + `git cat-file --batch`）——
 *        **纯树**：不含 `.git`、不含任何额外文件（连一份 manifest 都不许写进去：
 *        多一份路径，"副本是不是那个提交"就永远判不绿）。⚠️ 唯一的例外是 `--with-staging` 给的
 *        显式附加（见下），**默认不开**。
 *        ⚠️ 不复用 `git archive`：它按 `.gitattributes` 的 `export-ignore` / `export-subst` 改写输出，
 *        副本会与提交**不一样**，而这一票的全部效力都挂在"副本 = 那个提交"上。
 *      · `--out` **已存在且非空 ⇒ 拒**（`REFUSE-OVERWRITE`），而且**拒在写之前**（先看目录再动手）。
 *      · `--live-baseline <file>` ⇒ 在**那一刻**用 `.tools/fingerprint.mjs --set code --save` 的形状
 *        存一份**活树**基线；不给 ⇒ 输出里 `live_baseline: null`（**不是**"没变"）。
 *      · `--with-staging` ⇒ 导完提交的 blob **之后**，再把**活的**
 *        `.tools/_staging/agenia-upgrade/{preset,oracle}` 逐字节附加进副本（`F2`：套件按
 *        `<REPO>/.tools/_staging/…` 读靶子，而这一层被 `.gitignore` 挡着、提交里没有它 ⇒
 *        不带它，副本原地跑不动 `run-all.mjs`）。
 *        **默认不带**：不给这个开关时，副本里仍然只有提交里那些 blob，这个工具的读数
 *        （`code` / `files` / `bytes` / JSON 的字段集合）与从前逐字节相同。
 *        附加只**加**不改：任何一条附加路径若已经在提交里 ⇒ 拒（`E_STAGING_SHADOWS_COMMIT`）——
 *        "副本里那几份是提交的字节"这条不因为附加而松动。`preset/` 里的 `.runtime` **跳过**
 *        （那是真实脑数据、不是代码；与 `.team/dev/…/live-vs-staged.mjs` 的同步口径同一句，
 *        跳过的那几条写进 `staging.skipped` —— 没收要看得见），
 *        目录联接 / 符号链接也**跳过**（它们会逃出副本 —— `CPY-STAGING-ESCAPES-COPY` 那条判据的同一个理由）。
 *      · stdout 最后一行 = JSON：
 *        `{ ok, commit, tree_root, code: { sha256, files, bytes }, live_baseline }`
 *        （给了 `--with-staging` 才多一段 `staging` —— 不给就没有这一段，输出与从前逐字节相同）：
 *        `staging: { root, files, bytes, readback_ok, skipped, sha256 }`，其中
 *        `sha256 = { algorithm, prefix, files, bytes, digest, list: [{rel, sha256, bytes}] }`
 *        是**内容冻结**的那一半：这 52 份的 path + sha256 + 字节数（`rel` 仓根相对），
 *        `digest = sha256(Σ `${rel}\0${sha256}\0${bytes}\n`)`。这份清单就是"一次导出的身份"，
 *        落盘（`--json > export.json`）之后可以交给任何第三方按同一公式复算。
 *
 *   ② 校验（交活时 / 任何第三方）
 *      <node> .tools/tree-at-commit.mjs --verify <副本> --repo <仓库根> --commit <40hex>
 *                                        --expect <派工卡上的 before_sha256>
 *                                        [--live-baseline <file>] [--live-root <活树>]
 *                                        [--with-staging [--staging-manifest <导出 JSON>]] --json
 *      · `equal` = **自己复算**副本的 CODE 指纹后与 `--expect` 比 —— 只回答"副本还是不是派工那一刻那份"，
 *        活树怎么动都不影响它（`REV-04`：活树动了 2 处、副本没动 ⇒ 仍然有效）。
 *        **三个值**：`true` / `false` / `null`。`null` = **量不动**（副本的 CODE 指纹算不出来，原因在
 *        `copy.problems`）—— 与 `live.moved` 同一个约定：`null` 是"判不了"，不是"没变"。
 *      · `--expect` 的形状 = **64 位小写十六进制**（就是 `fingerprint.mjs` 印出来的 sha256）。不是这个形状 ⇒
 *        拒（`E_EXPECT_SHAPE`，exit 2）：拿 40 位的提交号或截断的哈希来比，只会永远报"副本被动过"，
 *        那不是读数，是给错了尺子。
 *      · `is_that_commit` = 逐份拿副本文件的 `git blob` SHA-1 与该提交里的 blob SHA-1 比（路径集合也要一致，
 *        `.git` 在副本里出现就算不成立）—— 只回答"这份副本是不是那个提交"。它与 `equal` **互相独立**：
 *        干净的提交 A 副本 + `--commit B` ⇒ `equal:true` + `is_that_commit.ok:false`（`REV-05/D`）。
 *      · `--with-staging` ⇒ 副本里 `.tools/_staging/agenia-upgrade/{preset,oracle}` 下多出来的那几份算
 *        **声明的附加**，但**内容也要对上**（第四关复审 F2-1：只核路径时，副本里换掉一个字节仍然
 *        报 `equal:true / is_that_commit.ok:true`）：
 *          · 每份**复算** `sha256 + bytes`，与参考清单比 ⇒ 任何一处字节不同都算不成立；
 *          · 参考清单缺一份（参考里有、副本里没有）同样算不成立（自足是这一层的全部用处）；
 *          · 参考清单从哪来：默认 = **活的** staging 树（"与现在的靶子是不是同一份"）；
 *            给了 `--staging-manifest <导出 JSON>` = **导出那一刻记下的**那份清单
 *            （"副本还是不是当时那 52 份" —— 活树后来合法换版不影响这一格）。
 *        判定不过来（活树不在 / 清单读不出来）⇒ `staging.sha256: null` + 一条 problem，不许当绿。
 *        不给 `--with-staging` ⇒ 与从前相同：副本里任何"多一份"都算"不是那个提交"。
 *        `equal` **不受影响**：`.tools/_staging/` 在 CODE 排除表里（同一把尺子的名单），附加不改 CODE 指纹。
 *      · `live.moved` = **活树从派工那一刻起动了几处**（按基线逐份比，`fingerprint.mjs --compare`）。
 *        没有基线 ⇒ `null` + 非空 `detail`（**判不了要写出来，不许写 0**）。
 *        🔴 `detail` 点名**哪一种判不了**：没给基线 / 基线不在盘上 / 活树根不是目录 / **子进程超时** /
 *        退出码非 0 / 读数里没有 `compare`。超时与"没有基线"从前同形（都是 `moved: null` + "退出码 null"），
 *        读的人分不出该补基线还是该修工具（`F6`，2026-11-03 打回）。
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
 * · `--live-baseline` 这一条**由工具自己核**（`F-160` `P6`）：落点在被测根里 ⇒ 存完之后再量一次，
 *   它进了 `sets.code.list` 就**拒**（`E_BASELINE_IN_CODE`）。判据用的是**同一把尺子的名单**，
 *   本文件不另立排除表；拒的理由是"尺子自己写的文件不能进读数"，不是"这个路径不许用"。
 * · 历史只追加 ⇒ 钉住的 `<commit>` 永远导得出来；`--commit` 收完整 40 hex **或任何能解析到提交的 rev**
 *   （短哈希 / `HEAD` / 分支名都行），但**输出里永远是解析后的完整 40 hex**（短哈希不是读数）。
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 同一把尺子：CODE 收录口径 / 基线 / 比对的**唯一实现**（见文件头「CODE 收录口径只有一份」）。 */
const FINGERPRINT_TOOL = path.join(HERE, 'fingerprint.mjs')
const MAX_BUFFER = 256 * 1024 * 1024
/** `--expect` 的形状：**64 位小写十六进制**（`fingerprint.mjs` 印出来的 sha256 就是这个形状）。 */
const EXPECT_SHAPE = /^[0-9a-f]{64}$/

/** 读 git 时钉住的配置 —— 否则同一棵树会随**本机 git 配置**变（换行归一 / 中文路径转义 / 长路径）。 */
const GIT_PINNED = ['-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', '-c', 'core.safecrlf=false', '-c', 'core.longpaths=true']

const USAGE = [
  'tree-at-commit.mjs —— 「派工那一刻的提交」的只读副本（导出 / 校验；F-160）',
  '',
  '  导出：--repo <仓库根> --commit <40hex> --out <副本目录> [--live-baseline <file>] [--with-staging] [--json]',
  '  校验：--verify <副本目录> --repo <仓库根> --commit <40hex> --expect <before_sha256>',
  '        [--live-baseline <file>] [--live-root <活树>] [--with-staging [--staging-manifest <导出 JSON>]] [--json]',
  '',
  '  --out 已存在且非空 ⇒ 拒（exit 2，拒在写之前）· 没有活树基线 ⇒ live.moved = null（不是 0）',
  '  `live.moved` 判不了时 detail 点名是哪一种（没给基线 / 基线不在 / 不是目录 / 超时 / 退出码）',
  '  --expect 必须是 64 位小写十六进制（sha256）· 副本量不动 ⇒ equal = null（不是 false）',
  '  --live-baseline 落进被测的 CODE 名单 ⇒ 拒（E_BASELINE_IN_CODE）—— 挪到 .team/ 或被测根之外',
  '  --with-staging ⇒ 副本另外带上 .tools/_staging/agenia-upgrade/{preset,oracle}（F2：副本原地要跑套件）；',
  '                    导出回报 `staging.sha256` 清单（52 份的 path + sha256 + bytes），校验按它**逐字节**复算；',
  '                    不给 ⇒ 副本仍然只有提交里那些 blob（与从前逐字节相同）',
  '  --staging-manifest <导出 JSON> ⇒ 校验拿**导出那一刻**记下的清单当参考（默认参考 = 现在的活 staging 树）',
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

/**
 * 提交里的**全部文件**（`rel → {mode, blob}`）—— 只读 git 对象，不看工作树。
 *
 * 🔴 **0 条是问题，不是"空成功"**（第三轮评审 `R3-3`）：只判退出码时，0 条会一路走到"写纯树"
 * 的循环（写 0 份）、再通过读回自证，回来一个 `ok:true` —— 下游把它读成"提交里一份都没有"。
 * 同一句话在量具那一份（`tests/agenia-upgrade/support/tree-at-commit.mjs::lsTreeBlobs`）里已经写着，
 * 这里是同一个事实的第二个载体：**两个载体一个口径**，改一处必须同批改另一处。
 * （`--full-tree` 早就在：`git ls-tree -r` 不给 pathspec 时只列 cwd 前缀，从子目录调会少算。）
 */
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
  if (entries.length === 0 && problems.length === 0) {
    // ⚠️ 只在**没有别的问题**时才补这一句：有解析问题时那一条已经把原因说清了，
    //    再加"一条路径都没读到"就是**假话**（读到了，只是都不是 blob）。
    problems.push(
      `git ls-tree ${commit} 返回 **0 条**（repo=${path.resolve(repo)}）—— 0 条不是"提交是空的"，`
        + '是这个提交上一条路径都没读到：先核 `--repo` 指的是不是那个仓库、`--commit` 解析到的是不是那个提交'
        + '（量具那一份 `tests/agenia-upgrade/support/tree-at-commit.mjs::lsTreeBlobs` 同一句，`R3-3`）',
    )
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

// ── staging 附加（`--with-staging`；`F2`）────────────────────────────────────
/**
 * 套件吃的 staging 根（相对 `<repo>`）：`run-all.mjs` 把 `AGENIA_STAGING_PRESET` 拼成
 * `<REPO>/.tools/_staging/agenia-upgrade/preset`、desktop oracle 拼成它底下的
 * `oracle/standard.patch.yml`。这两条子树就是"副本原地跑得动套件"必须有的东西。
 */
const STAGING_REL = '.tools/_staging/agenia-upgrade'
const STAGING_SUBTREES = ['preset', 'oracle']
/**
 * 什么**不**附加进副本（**跳过，不判红**）：
 *   · `.runtime` —— 那是**真实脑数据**（记忆库 / 更新状态 / 报告）。口径与
 *     `.team/dev/2026-10-24/_tmp/live-vs-staged.mjs` 的同步口径同一句：数据不是代码，
 *     不进靶子、也不进评审副本。测试侧 `declaredAdditionPaths()` 同批排除它（2026-11-02 裁决）。
 *     跳过的那几条写进 `staging.skipped` —— "没收"要看得见，不许静默。
 *   · 目录联接 / 符号链接 —— 它们会**逃出副本**（"副本借活树的输入"就不是自足），
 *     与 `CPY-STAGING-ESCAPES-COPY` 那条判据同一个理由，这里不收（判据那一侧同样不收）。
 */
const STAGING_SKIP_SEGMENTS = new Set(['.runtime'])

/**
 * 活的 staging 树里那几份文件（`rel 相对 staging 根`，`/` 分隔）。
 * 这是附加与核对共用的**唯一一份清单**：导出按它写，校验按它点名"哪几份算声明的附加"。
 * 为什么不从提交里取：这一层被 `.gitignore` 挡着，提交里没有它 —— 那正是 `F2` 的红因。
 *
 * @returns {{root: string, exists: boolean, files: Array<{rel: string, abs: string}>, skipped: string[], problems: string[]}}
 */
function stagingFilesOf(repo) {
  const root = path.join(repo, ...STAGING_REL.split('/'))
  const out = { root, exists: false, files: [], skipped: [], problems: [] }
  if (!existsSync(root) || !statSync(root).isDirectory()) return out
  out.exists = true
  const walk = (relDir) => {
    const dir = relDir === '' ? root : path.join(root, ...relDir.split('/'))
    let names = []
    try {
      names = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      out.problems.push(`staging 目录读不了：${dir}（${String(err.message).slice(0, 160)}）`)
      return
    }
    for (const item of names) {
      const rel = relDir === '' ? item.name : `${relDir}/${item.name}`
      if (rel.split('/').some((seg) => STAGING_SKIP_SEGMENTS.has(seg))) {
        out.skipped.push(rel)
        continue
      }
      if (item.isSymbolicLink()) {
        out.skipped.push(rel)
        continue
      }
      if (item.isDirectory()) walk(rel)
      else if (item.isFile()) out.files.push({ rel, abs: path.join(dir, item.name) })
    }
  }
  for (const sub of STAGING_SUBTREES) walk(sub)
  out.files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  return out
}

/** 副本里那条附加路径（`<out>/.tools/_staging/agenia-upgrade/<rel>`）。 */
const stagingCopyPath = (out, rel) => path.join(out, ...`${STAGING_REL}/${rel}`.split('/'))

/**
 * 把一串 `{rel, sha256, bytes}`（`rel` 仓根相对）汇成**一份清单**：
 * `{ algorithm, prefix, files, bytes, digest, list }`，`list` 按 `rel` 的 UTF-8 字节序升序，
 * `digest = sha256( Σ `${rel}\0${sha256}\0${bytes}\n` )` —— 与
 * `tests/agenia-upgrade/support/tree-at-commit.mjs::treeDigest` 同一个公式，第三个人能自己复算。
 * 导出与校验**共用这一个函数**：两份清单的算法不许各写一份。
 */
function manifestOfEntries(entries) {
  const list = entries
    .map((e) => ({ rel: e.rel, sha256: e.sha256, bytes: e.bytes }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.rel, 'utf8'), Buffer.from(b.rel, 'utf8')))
  const h = createHash('sha256')
  for (const e of list) h.update(`${e.rel}\u0000${e.sha256}\u0000${e.bytes}\n`, 'utf8')
  return {
    algorithm: 'sha256',
    prefix: STAGING_REL,
    files: list.length,
    bytes: list.reduce((n, e) => n + e.bytes, 0),
    digest: h.digest('hex'),
    list,
  }
}

/**
 * **一份 staging 清单**（`--with-staging` 的"内容冻结"那一半）。
 *
 * 形状见 `manifestOfEntries`：`{ algorithm, prefix, files, bytes, digest, list: [{rel, sha256, bytes}] }`。
 * `rel` 是**仓根相对**（`.tools/_staging/agenia-upgrade/preset/inject.js`）—— 与 `is_that_commit`
 * 与判据那一侧报出来的路径同一个写法，读的人不用换坐标系。
 *
 * 为什么清单里要有**字节数**：只有 sha256 时，"换了字节"与"截断了"在报文里长得一样；
 * 两个数一起报，读的人一眼分得出（一个数不许担两个意思）。
 *
 * @param {Array<{rel: string, abs: string}>} files `rel` 相对 staging 根
 */
function stagingManifest(files) {
  return manifestOfEntries(files.map((f) => {
    const buf = readFileSync(f.abs)
    return { rel: `${STAGING_REL}/${f.rel}`, sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length }
  }))
}

/**
 * 读一份**已记录的**清单（`--staging-manifest <file>`）：收导出 JSON（取 `.staging.sha256`）
 * 或裸清单（本身就有 `.list`）。落点是被 `--with-staging` 导出的那份 JSON —— 于是
 * "副本还是不是导出那一刻那 52 份"可以拿**当时记下的数**核，而不是拿现在的活树核。
 * 形状不对 ⇒ `ok:false` + 一句点名的原因（拿一份读不出来的清单去比，等于没比）。
 *
 * 🔴 **清单还要自洽**（技术评审 2026-11-03 `F8`）：`files` / `bytes` / `digest` 必须与它**自己那份
 * `list`** 对得上 ——
 *   · `files` = `list.length`（不然一份被截断的清单会把"list 3 条"报成"声明了 52 份"）；
 *   · `bytes` = Σ `list[].bytes`；
 *   · `digest` = 按 `list` 现算的 `manifestOfEntries(list).digest`（同一个公式、同一套排序）；
 *   · `prefix` / `algorithm` 给了就必须是本工具那套值。
 * 三样一起查、**不在第一条上早退**（三个数各自承重：只修一个的人要看得见另外两个还在）。
 * 不自洽 ⇒ `ok:false`（`E_STAGING_MANIFEST_INCONSISTENT`）：那是"清单本身坏了"，不是"副本对不上"，
 * 两种红因分开报 —— 照着前者去改副本，只会把一份好副本改坏。
 */
function readStagingManifest(file) {
  if (!existsSync(file)) return { ok: false, code: 'E_STAGING_MANIFEST_MISSING', problems: [`--staging-manifest 不在盘上：${file}`], manifest: null }
  let raw = null
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { ok: false, code: 'E_STAGING_MANIFEST_UNREADABLE', problems: [`--staging-manifest 不是可解析 JSON：${file}（${String(err.message).slice(0, 160)}）`], manifest: null }
  }
  const manifest = raw?.staging?.sha256 ?? raw?.sha256 ?? raw
  if (manifest === null || typeof manifest !== 'object' || !Array.isArray(manifest.list)) {
    return { ok: false, code: 'E_STAGING_MANIFEST_SHAPE', problems: [`--staging-manifest 里没有清单（要 \`staging.sha256.list\` 或 \`list\`）：${file}`], manifest: null }
  }
  const bad = manifest.list.filter((e) => e === null || typeof e !== 'object'
    || typeof e.rel !== 'string' || !String(e.rel).startsWith(`${STAGING_REL}/`)
    || !/^[0-9a-f]{64}$/.test(String(e.sha256)) || !Number.isInteger(e.bytes))
  if (bad.length > 0) {
    return { ok: false, code: 'E_STAGING_MANIFEST_SHAPE', problems: [`--staging-manifest 里有 ${bad.length} 条形状不对（要 {rel: \`${STAGING_REL}/…\`, sha256: 64 位小写十六进制, bytes: 整数}）：${file}`], manifest: null }
  }
  // ── 自洽（`F8`）：files / bytes / digest 与 list 自己的对账 ────────────────────
  const computed = manifestOfEntries(manifest.list)
  const inconsistent = []
  if (manifest.files !== manifest.list.length) inconsistent.push(`files 声明 ${JSON.stringify(manifest.files)} ≠ list 条数 ${manifest.list.length}`)
  if (manifest.bytes !== computed.bytes) inconsistent.push(`bytes 声明 ${JSON.stringify(manifest.bytes)} ≠ list 的字节和 ${computed.bytes}`)
  if (manifest.digest !== computed.digest) inconsistent.push(`digest 声明 ${JSON.stringify(manifest.digest)} ≠ 按 list 复算的 ${computed.digest}`)
  if (manifest.prefix !== undefined && manifest.prefix !== STAGING_REL) inconsistent.push(`prefix 声明 ${JSON.stringify(manifest.prefix)} ≠ ${STAGING_REL}`)
  if (manifest.algorithm !== undefined && manifest.algorithm !== 'sha256') inconsistent.push(`algorithm 声明 ${JSON.stringify(manifest.algorithm)} ≠ sha256`)
  if (inconsistent.length > 0) {
    return {
      ok: false,
      code: 'E_STAGING_MANIFEST_INCONSISTENT',
      problems: [
        `E_STAGING_MANIFEST_INCONSISTENT：--staging-manifest 自己不自洽（${inconsistent.length} 处）：${inconsistent.join('；')} —— `
          + `文件 ${file}。一份被截断 / 改过的清单会被当成"声明了 ${JSON.stringify(manifest.files)} 份"照收（\`F8\`）：`
          + '清单的三个数必须与它自己那份 list 对得上，否则"拿导出那一刻的清单核副本"这句话不成立',
      ],
      manifest: null,
      computed,
    }
  }
  return { ok: true, problems: [], manifest, computed, code: 'E_STAGING_MANIFEST_OK' }
}


// ── 尺子（只调用 `.tools/fingerprint.mjs`，自己不实现排除表）────────────────────
/**
 * 子进程上限。`.tools/fingerprint.mjs` 剪枝之后，本工作区整根 CODE 从 **362 s** 掉到 **~0.12 s**
 * （2026-11-03 实测，`F6`），这个上限是给"别的、更大的树"留的余量 —— 它**不再**是常态。
 */
const FINGERPRINT_CAP_MS = 300000

/**
 * 尺子没跑成时的那一句 —— **超时和"退出码非 0"必须分得开**（`F6`）。
 *
 * `spawnSync` 撞上 `timeout` 时 `status` 是 `null`、`signal` 是 `SIGTERM`、`error.code` 是 `ETIMEDOUT`；
 * 从前这两种都印成"退出码 null"，于是"树太大/太慢"和"没有基线"在报文里长得一模一样，
 * 读的人分不出该补基线还是该修工具（`mig-rules-12`：没记录 ≠ 没发生）。
 */
function fingerprintFailure(r) {
  if (r.timedOut) {
    return `超时：fingerprint.mjs 在 ${FINGERPRINT_CAP_MS} ms 内没跑完（子进程被掐掉）`
      + `${r.stderr.trim() === '' ? '' : `；stderr：${r.stderr.trim().slice(0, 200)}`}`
      + ` —— 这不是"比不了"，是这一棵树在 ${FINGERPRINT_CAP_MS} ms 里量不完（F6）`
  }
  const extra = r.error === null ? '' : ` · ${r.error.code ?? 'ERROR'}：${String(r.error.message ?? '').slice(0, 200)}`
  return `退出码 ${r.status}${r.signal === null ? '' : ` · signal ${r.signal}`}${extra}`
}

function runFingerprint(args) {
  const r = spawnSync(process.execPath, [FINGERPRINT_TOOL, ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    timeout: FINGERPRINT_CAP_MS,
    env: { ...process.env },
  })
  let json = null
  try {
    const lines = String(r.stdout ?? '').trim().split('\n').filter((l) => l.trim() !== '')
    json = lines.length === 0 ? null : JSON.parse(lines[lines.length - 1])
  } catch { json = null }
  const error = r.error === undefined || r.error === null
    ? null
    : { code: r.error.code ?? null, message: String(r.error.message ?? '') }
  return {
    status: r.status,
    signal: r.signal ?? null,
    timedOut: error?.code === 'ETIMEDOUT',
    error,
    json,
    stderr: String(r.stderr ?? ''),
    stdout: String(r.stdout ?? ''),
  }
}

/** 一棵树的 CODE 指纹（现算）。 */
function codeFingerprintOf(root) {
  const r = runFingerprint(['--root', root, '--set', 'code', '--json'])
  const code = r.json?.sets?.code
  if (r.status !== 0 || code === undefined || typeof code.sha256 !== 'string') {
    return { ok: false, sha256: null, files: null, bytes: null, problems: [`fingerprint.mjs 量不动 ${root}（${fingerprintFailure(r)}）`] }
  }
  return { ok: true, sha256: code.sha256, files: code.files, bytes: code.bytes, problems: [] }
}

/** 这棵树**现在**的 CODE 名单（`sets.code.list` 的 `rel` 那一列）；量不动 ⇒ `null`（不是空数组）。 */
function codeListOf(root) {
  const r = runFingerprint(['--root', root, '--set', 'code', '--json'])
  const list = r.json?.sets?.code?.list
  if (r.status !== 0 || !Array.isArray(list)) return null
  return list.map((f) => (typeof f === 'string' ? f : f?.rel)).filter((x) => typeof x === 'string')
}

/**
 * 派工那一刻的**活树** CODE 基线（`.tools/fingerprint.mjs --save` 的形状）。
 *
 * 🔴 基线文件**不许落进被测的那份 CODE 名单**：它会被算成"派工后变动"（`changed[]` 里一个 `added`，
 * 而那一份是尺子自己刚写的）。判据用**同一把尺子的名单**，没有第二张排除表：
 *   落点在被测根里 ⇒ 存完之后再量一次（这时基线文件已经在盘上）⇒ 它在 `sets.code.list` 里就**拒**
 *   （`E_BASELINE_IN_CODE`），并说清能挪去哪（`.team/` 被排除表挡着，或者被测根之外）。
 * ⚠️ 只有落点**确实在被测根里**才多走这一次；常见落点 `.team/<角色>/<day>/live-before.json` 不触发。
 * 量不动（`fingerprint.mjs` 非 0）⇒ `E_LIVE_BASELINE` 那一支，不许把"判不了"写成"没变"。
 */
/**
 * 问一次尺子：`abs` 这个落点在 `root` 里算不算 CODE？（`F-166`）
 *
 * 为什么要走子进程而不是自己比：排除表只有 `fingerprint.mjs` 那一份。
 * 量不出来（工具不在 / 退出码非 0 / 输出不是 JSON）⇒ 返回 `null` —— **判不了**，
 * 调用方不许把它当成"算 CODE"去拒，也不许当成"不算"去放行：这一句要出声。
 */
/**
 * 落点的**规范形态**：存在的走 `realpathSync`（吃掉 junction / 短名），
 * 不存在的取**最近存在祖先**的 realpath + 余下那段（`M2`：junction 别名必须被解开，
 * 否则"根外路径其实指到根内"这种写法会让前缀闸根本不去问尺子）。
 */
function canonicalOut(abs) {
  const tail = []
  let cur = abs
  for (let i = 0; i < 64; i += 1) {
    if (existsSync(cur)) {
      let real = cur
      try { real = realpathSync.native(cur) } catch (err) { real = cur }
      return tail.length === 0 ? real : path.join(real, ...tail.reverse())
    }
    const parent = path.dirname(cur)
    if (parent === cur) return abs
    tail.push(path.basename(cur))
    cur = parent
  }
  return abs
}

function askIsCode(root, abs) {
  const r = spawnSync(process.execPath, [FINGERPRINT_TOOL, '--is-code', abs, '--root', root, '--json'], {
    cwd: HERE, encoding: 'utf8', timeout: 60000,
  })
  if (r.status !== 0) {
    // 🔴 F5（技术评审 11-07）：这里以前只印一句话然后 `return null`，调用方又不拒 ⇒ **fail-open**：
    //    尺子跑不动时副本照样写进被测树。判不了**不等于**可以放行 —— 这一路必须让调用方拒。
    process.stderr.write(`[tree-at-commit] 判不了「--out 算不算 CODE」：fingerprint.mjs --is-code 退出码 ${r.status}`
      + `（${String(r.stderr ?? '').trim().slice(0, 200)}）\n`)
    return null
  }
  try {
    const parsed = JSON.parse(String(r.stdout).trim().split('\n')[0])
    return parsed?.ok === true ? parsed : null
  } catch (err) {
    process.stderr.write('[tree-at-commit] 判不了「--out 算不算 CODE」：--is-code 的输出读不出 JSON\n')
    return null
  }
}

function saveLiveBaseline(liveRoot, file) {
  mkdirSync(path.dirname(file), { recursive: true })
  const r = runFingerprint(['--root', liveRoot, '--set', 'code', '--save', file, '--json'])
  if (r.status !== 0) return { ok: false, problems: [`fingerprint.mjs --save 没跑成（${fingerprintFailure(r)}）`] }
  let raw = null
  try { raw = JSON.parse(readFileSync(file, 'utf8')) } catch (err) { return { ok: false, problems: [`写出来的基线不是可解析 JSON：${String(err.message).slice(0, 160)}`] } }
  const list = raw?.sets?.code?.list
  if (!Array.isArray(list) || list.length === 0) return { ok: false, problems: ['基线的 sets.code.list 不是非空数组 —— 没有它就算不出 changed[]（"0 处"会是一个空读数）'] }

  // P6：基线自己有没有混进名单。`--save` 的名单是在**写文件之前**走出来的 ⇒ 第一次跑时它不可能在名单里
  //     ⇒ 落点在被测根里就再量一次（这一次文件已在盘上），由同一把尺子回答"它算不算 CODE"。
  const rel = path.relative(liveRoot, file).replace(/\\/g, '/')
  const insideRoot = rel !== '' && rel !== '..' && !rel.startsWith('../') && !path.isAbsolute(rel)
  if (insideRoot) {
    const now = codeListOf(liveRoot)
    if (now === null) {
      return { ok: false, problems: [`基线存下来了，但量不出 ${liveRoot} 现在的 CODE 名单 ⇒ 判不了"基线自己算不算 CODE"（不猜）`] }
    }
    if (now.includes(rel)) {
      return {
        ok: false,
        code: 'E_BASELINE_IN_CODE',
        problems: [
          `活树基线落在被测的 CODE 名单里：${rel}（根 ${liveRoot}）—— 这一份是尺子自己写的文件，`
            + '下一次 `--compare` 会把它算成"派工后变动"（一条假 `added`）。'
            + '把 `--live-baseline` 挪到被测根之外，或者挪进 `.team/`（排除表挡着这个前缀）',
        ],
      }
    }
  }
  return { ok: true, problems: [], sha256: raw.sets.code.sha256, files: raw.sets.code.files }
}

/**
 * 活树**从基线那一刻起**动了几处：`{ok, moved, places, detail}`。
 * 没有基线 / 比不了 ⇒ `moved: null` + 非空 `detail`（判不了要写出来，**不许**写 0）。
 * 🔴 `detail` 必须**说得清是哪一种判不了**（`F6`）：没给基线 / 基线不在盘上 / 活树根不是目录 /
 *    **超时** / 退出码非 0 / 读数里没有 `compare` —— 六种各有各的句子。从前"超时"印成
 *    "退出码 null"，与"没有基线"同形，读的人分不出该补基线还是该修工具。
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
    return { ok: false, moved: null, places: [], detail: `基线比不了（fingerprint.mjs --compare ${fingerprintFailure(r)}）` }
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
  const out = { mode: null, repo: null, commit: null, out: null, verify: null, expect: null, liveBaseline: null, liveRoot: null, withStaging: false, stagingManifest: null, json: false }
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
    else if (a === '--with-staging') out.withStaging = true
    else if (a === '--staging-manifest') out.stagingManifest = next()
    else if (a === '--help' || a === '-h') out.help = true
    else return { error: `未知参数：${a}` }
  }
  if (missingValue.length > 0) return { error: `这些参数少了值：${missingValue.join(' · ')}` }
  if (out.help) return out
  if (out.stagingManifest !== null && !out.withStaging) {
    return { error: '--staging-manifest 只在 --verify --with-staging 下有意义（它是那一层的参考清单；不给 --with-staging 时这一层根本不在判据面上）' }
  }
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
  // 🔴 `--out` 落在**被测的 CODE 名单**里 ⇒ 拒在**任何写之前**（`ticket-20261106-01` 的姐妹项 `F-166`，与 `--live-baseline` 对称）。
  //    怎么判"算不算 CODE"由尺子自己回答（`fingerprint.mjs --is-code`）——**表只有一份**，这里不复制。
  //    为什么必须拒：副本要是落在被测树里，导出自己写下的每一份文件都会被下一次 `--verify` 算成"动了"，
  //    而那份"动了"会挂在别人头上（一条假红，而且查不出是谁的）。
  const outCanon = canonicalOut(out)
  // 🔴 两侧都要规范化（M-2a）：`repoAbs` 只有词法形态时，`--repo` 走 junction、`--out` 走同一个 junction
  //    会让前缀判据不成立 ⇒ 连尺子都不问就把副本写进被测树（那是本轮引入的回归）。
  const repoCanon = canonicalOut(repoAbs)
  const outCanonLower = outCanon.toLowerCase()
  const repoCanonLower = repoCanon.toLowerCase()
  if (outCanonLower.startsWith(`${repoCanonLower}${path.sep}`) || outCanonLower === repoCanonLower) {
    // 🔴 问的**不是落点自己**，而是"它下面的文件算不算" —— 落点可能恰好叫 `x.pyc`，
    //    它自己被后缀规则排除，可它**里面**的文件不排除（M2 的 (A)）。
    const probeChild = path.join(outCanon, '__agenia_probe__')
    const asked = askIsCode(repoCanon, probeChild)
    if (asked === null) {
      // 🔴 fail-closed（F5）：判不了不许放行。真因在上面的 stderr 里（尺子跑不动 / 输出读不出）。
      return fail('E_OUT_NOT_MEASURABLE',
        `判不了「--out 会不会落进被测树 ${repoCanon} 的 CODE 名单」—— 尺子（fingerprint.mjs --is-code）跑不动。`
        + '这一路**不猜**：判不了就拒。先把尺子修好（它自己会印真因），或者把 `--out` 写到被测树之外。')
    }
    if (asked.code === true) {
      return fail('E_OUT_INSIDE_AUDITED',
        `--out 落在被测树 ${repoAbs} 的 CODE 名单里：${asked.rel}（${asked.why}；落点规范形态 ${outCanon}；被测根规范形态 ${repoCanon}）。`
        + '副本必须写在被测树之外，或者写进 `.team/` 这种被排除表挡住的前缀；'
        + '否则导出自己写下的文件会被下一次 `--verify` 算成"动了"，那一条红会挂在别人头上。')
    }
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
  // 🔴 F3（技术评审 11-07 · P2）：`--with-staging` 会让副本带着**两个时间点**
  //    （presets 取自提交、staging 取自导出时刻）⇒ 副本里 `STAT-01`（staged vs live）永远红，
  //    而那条差是导出器造的。⇒ **一个副本只能是一个时间点**；不一致就拒，而且**拒在任何写之前**
  //    （F-166 的同一条纪律：我第一版把这段放在写完之后，负对照里 206 份已经落盘了）。
  if (args.withStaging) {
    const tree = git(['ls-tree', '-r', '--name-only', resolved.sha, '--', 'presets/agenia'], { cwd: repo })
    if (tree.status !== 0) return fail('E_COMMIT_UNRESOLVED', `读不出 ${resolved.sha} 的 presets/agenia 清单`, { commit: resolved.sha })
    const commitPreset = new Map()
    for (const rel of String(tree.stdout).split('\n').map((x) => x.trim()).filter((x) => x !== '')) {
      const blob = git(['cat-file', 'blob', `${resolved.sha}:${rel}`], { cwd: repo, encoding: 'buffer' })
      if (blob.status === 0) commitPreset.set(rel.slice('presets/agenia/'.length), blob.stdout)
    }
    const liveNow = stagingFilesOf(repo)
    const stagingPreset = new Map(liveNow.files.filter((f) => f.rel.startsWith('preset/')).map((f) => [f.rel.slice('preset/'.length), null]))
    const onlyCommit = [...commitPreset.keys()].filter((rel) => !stagingPreset.has(rel)).sort()
    const onlyStaging = [...stagingPreset.keys()].filter((rel) => !commitPreset.has(rel)).sort()
    const diff = []
    for (const [rel, buf] of commitPreset) {
      if (!stagingPreset.has(rel)) continue
      let other = null
      try { other = readFileSync(path.join(liveNow.root, 'preset', ...rel.split('/'))) } catch { other = null }
      if (other === null || !other.equals(Buffer.from(buf))) diff.push(rel)
    }
    if (onlyCommit.length > 0 || onlyStaging.length > 0 || diff.length > 0) {
      return fail('E_STAGING_TIME_MISMATCH',
        '`--with-staging` 会让副本带着**两个时间点**：提交里的 presets/agenia 与导出时刻的 staging/preset 不一致'
        + `（只在提交里 ${onlyCommit.length} 份 · 只在 staging 里 ${onlyStaging.length} 份 · 内容不同 ${diff.length} 份`
        + `${diff.length > 0 ? '：' + diff.slice(0, 3).join(' · ') : ''}）。`
        + '副本必须是**一个**时间点，否则副本里 `STAT-01`（staged vs live）永远红，而那条差是导出器造的。'
        + '两条出路：**先把 presets 提交**再导出；或者这次**不要** `--with-staging`。'
        + '（这一拒发生在写第一个字节之前 —— 盘上什么都没多。）',
        { commit: resolved.sha, tree_root: null })
    }
  }

  if (!resolved.ok) return fail('E_COMMIT_UNRESOLVED', resolved.problems[0], { commit: null })

  // 派工那一刻的活树基线（一旦给了就**在写副本之前**量：那一刻的活树是派工时的活树）。
  const baselineFile = args.liveBaseline === null ? null : path.resolve(args.liveBaseline)
  let baseline = { ok: true, problems: [] }
  if (baselineFile !== null) {
    baseline = saveLiveBaseline(path.resolve(args.liveRoot ?? repo), baselineFile)
    if (!baseline.ok) {
      return fail(
        baseline.code ?? 'E_LIVE_BASELINE',
        `活树基线这一步不成立：${baseline.problems.join('；')} —— 这一次不导出（\`--out\` 一个字节都没写）；`
          + '没有一份不污染读数的基线，"派工后活树动了几处"就只能判不了（不许读成 0）',
        { commit: resolved.sha, live_baseline: baselineFile },
      )
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

  // ── staging 附加（`--with-staging`；`F2`）────────────────────────────────────
  // 🔴 位置固定在**提交那一层的读回自证之后**：先证明"副本里那几份 = 提交的字节"，再往上加东西。
  //    附加只**加**不改 —— 任何一条附加路径已经在提交里就**拒**（E_STAGING_SHADOWS_COMMIT），
  //    所以上一步的自证不会因为这一步失效。
  let staging = null
  if (args.withStaging) {
    const live = stagingFilesOf(repo)
    if (live.problems.length > 0) return fail('E_STAGING_UNREADABLE', live.problems.join('；'), { commit: resolved.sha, tree_root: out, live_baseline: baselineFile })
    if (!live.exists) {
      return fail('E_STAGING_MISSING', `要求带 staging，而 ${live.root} 不在 —— 这样导出的副本不自足（套件按 <REPO>/.tools/_staging/… 读靶子）`, { commit: resolved.sha, tree_root: out, live_baseline: baselineFile })
    }
    if (live.files.length === 0) {
      return fail('E_STAGING_EMPTY', `${live.root} 下一份文件都没有（${STAGING_SUBTREES.join(' / ')}）—— "带了 staging"会是一句空话`, { commit: resolved.sha, tree_root: out, live_baseline: baselineFile })
    }
    const commitPaths = new Set(tree.entries.map((e) => e.rel))
    const shadows = live.files.filter((f) => commitPaths.has(`${STAGING_REL}/${f.rel}`))
    if (shadows.length > 0) {
      return fail('E_STAGING_SHADOWS_COMMIT',
        `${shadows.length} 条附加路径已经在提交里（例：${shadows.slice(0, 3).map((f) => f.rel).join(' · ')}）—— `
          + '附加只许**加**：写上它会盖掉提交的字节，"副本里那几份 = 提交的字节"这条就没了',
        { commit: resolved.sha, tree_root: out, live_baseline: baselineFile })
    }
    // 清单在**写之前**算：它就是"这一次导出的是哪 52 份字节"的读数（写盘顺序不影响它）。
    const manifest = stagingManifest(live.files)
    const stagingBad = []
    for (const f of live.files) {
      const buf = readFileSync(f.abs)
      const dst = stagingCopyPath(out, f.rel)
      mkdirSync(path.dirname(dst), { recursive: true })
      writeFileSync(dst, buf)
      let back = null
      try { back = readFileSync(dst) } catch { back = null }
      if (back === null || !back.equals(buf)) stagingBad.push(f.rel)
    }
    if (stagingBad.length > 0) {
      return fail('E_STAGING_VERIFY', `附加写完读回来对不上（${stagingBad.length} 份）：${stagingBad.slice(0, 5).join(' · ')}`, { commit: resolved.sha, tree_root: out, live_baseline: baselineFile })
    }
    staging = {
      root: live.root,
      files: manifest.files,
      bytes: manifest.bytes,
      readback_ok: true,
      skipped: live.skipped,
      // 🔴 **内容冻结**：这 52 份的 path + sha256 + bytes（第四关复审 F2-1）。
      //    `--verify --with-staging` 拿它对账；人也能拿这份 JSON 自己复算。
      sha256: manifest,
    }
  }

  const code = codeFingerprintOf(out)
  if (!code.ok) return fail('E_FINGERPRINT', code.problems.join('；'), { commit: resolved.sha, tree_root: out, live_baseline: baselineFile })

  // `staging` 那一段**只有给了 `--with-staging` 才出现** —— 不给时输出与从前逐字节相同。
  emit({
    ok: true,
    commit: resolved.sha,
    tree_root: out,
    code: { sha256: code.sha256, files: code.files, bytes: code.bytes },
    live_baseline: baselineFile,
    files: written,
    bytes,
    ...(staging === null ? {} : { staging }),
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
  //    `equal` 有三个值：`true` / `false` / **`null` = 量不动**（副本的 CODE 指纹算不出来，原因在
  //    `copy.problems`）—— 与 `live.moved` 同一个约定：`null` 是"判不了"，不是"没变"。
  const code = codeFingerprintOf(copy)
  const expect = String(args.expect).trim()
  // `--expect` 先过形状：拿 40 位的提交号（或截断的哈希）来比，只会永远报"副本被动过" ——
  // 那不是读数，是给错了尺子（同一个毛病：判据钉在一个填错的输入上，红绿都不再说明任何事）。
  if (!EXPECT_SHAPE.test(expect)) {
    return fail(
      'E_EXPECT_SHAPE',
      `--expect 不是 64 位小写十六进制的 sha256：${JSON.stringify(expect.length > 80 ? `${expect.slice(0, 80)}…` : expect)}`
        + `（实得 ${expect.length} 个字符）—— 派工卡上的 before_sha256 是 64 位（就是导出时 \`code.sha256\` 那一串）；`
        + '40 位的提交号 / 截断的哈希 / 大写的副本都不是它，拿它们来比永远报"副本被动过"',
      { commit: resolved.sha, equal: null },
    )
  }
  const equal = !code.ok ? null : (typeof code.sha256 === 'string' && code.sha256.toLowerCase() === expect)

  // ② 副本是不是那个提交：逐份 blob SHA-1 + 路径集合（`.git` 在副本里出现也算不成立）。
  const tree = lsTree(repo, resolved.sha)
  const problems = []
  let files = 0
  /**
   * `--with-staging` 的"声明的附加"**参考清单**（第四关复审 F2-1：路径对不算数，**字节**也要对）。
   *   · 默认：**活的** staging 树（与导出同一个 `stagingFilesOf`）—— 回答"副本与**现在的**靶子是不是同一份"；
   *   · 给了 `--staging-manifest <导出 JSON>`：**导出那一刻记下的清单** —— 回答"副本还是不是当时那 52 份"
   *     （活树后来合法地换版也不影响这一格）。
   * `reference === null` = 判不了（活树不在 / 清单读不出来）⇒ 报一条 problem，不许把附加静默放过去。
   */
  let reference = null
  const referenceProblems = []
  let referenceSource = 'live'
  if (args.withStaging) {
    if (args.stagingManifest === null) {
      const liveStaging = stagingFilesOf(repo)
      referenceProblems.push(...liveStaging.problems)
      if (liveStaging.exists && liveStaging.problems.length === 0) {
        reference = { root: liveStaging.root, skipped: liveStaging.skipped, manifest: stagingManifest(liveStaging.files) }
      }
    } else {
      referenceSource = path.resolve(args.stagingManifest)
      const read = readStagingManifest(referenceSource)
      referenceProblems.push(...read.problems)
      if (read.ok) reference = { root: null, skipped: [], manifest: read.manifest }
    }
  }
  const refByRel = new Map(reference === null ? [] : reference.manifest.list.map((e) => [e.rel, e]))
  /** 副本里那几份额外的 staging 附加（只有 `--with-staging` 才非空；否则 null = 这一版没有这个概念）。 */
  let isThatStaging = null
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
    /** 多出来的那些：`--with-staging` 时把**逐条点名通过**的 staging 附加摘出去，其余照旧算不成立。 */
    const added = []
    for (const rel of actual.keys()) {
      if (expected.has(rel) || rel === '.git' || rel.startsWith('.git/')) continue
      // 🔴 只有**明确要了** `--with-staging` 才谈"声明的附加"：不开这个开关时，
      //    副本里任何"多一份"（包括 `.tools/_staging/…` 下的）都算"不是那个提交"—— 与从前逐字节相同。
      if (args.withStaging && rel.startsWith(`${STAGING_REL}/`)) {
        if (reference === null) continue   // 判不了 ⇒ 下面统一报一条，不许在这里静默当绿
        if (refByRel.has(rel)) { added.push(rel); continue }
      }
      problems.push(`副本多一份（副本里有、提交里没有）：${rel}`)
    }
    for (const [rel, abs] of actual) {
      if (!expected.has(rel)) continue
      const got = gitBlobSha1(readFileSync(abs))
      if (got !== expected.get(rel)) problems.push(`副本这一份的字节不是该提交里的那一份：${rel}（提交 ${expected.get(rel).slice(0, 12)}… / 副本 ${got.slice(0, 12)}…）`)
    }
    if (args.withStaging) {
      if (reference === null) {
        problems.push(`\`--with-staging\`：判不了"多出来的那几份算不算声明的 staging 附加"—— `
          + `${referenceProblems.length > 0 ? referenceProblems.join('；') : `活的 staging 树不在：${path.join(repo, ...STAGING_REL.split('/'))}`}。`
          + '没有那一份清单，任何一条"多一份"都可能被当成附加混过去（判不了不是绿）')
        isThatStaging = { root: null, reference: referenceSource, declared: null, added: added.sort(), missing: null, mismatched: null, skipped: [], sha256: null }
      } else {
        /**
         * 🔴 **内容冻结**（复审 F2-1）：逐份复算副本里那 52 份的 `sha256 + bytes`，与参考清单比。
         * 只核"路径在不在"时，副本里换掉一个字节仍然报 `equal:true / is_that_commit.ok:true` ——
         * 那正是复审拿一把翻字节的副本戳中的洞（"有这份文件"≠"是这一份字节"）。
         */
        const copyEntries = []
        const mismatched = []
        for (const rel of [...added].sort()) {
          const buf = readFileSync(actual.get(rel))
          const entry = { rel, sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length }
          copyEntries.push(entry)
          const want = refByRel.get(rel)
          if (entry.sha256 !== want.sha256 || entry.bytes !== want.bytes) {
            mismatched.push({ rel, want: { sha256: want.sha256, bytes: want.bytes }, got: { sha256: entry.sha256, bytes: entry.bytes } })
            problems.push(`副本的 staging 附加不是参考清单里的那一份：${rel}`
              + `（参考 ${want.sha256.slice(0, 12)}… / ${want.bytes} B · 副本 ${entry.sha256.slice(0, 12)}… / ${entry.bytes} B）—— `
              + '路径对上不算数：内容冻结要的是**字节**也对上')
          }
        }
        // 参考清单里有、副本里没有 ⇒ 不是"带 staging 的副本"（自足是这一层的全部用处）
        const missing = reference.manifest.list.map((e) => e.rel).filter((rel) => !actual.has(rel)).sort()
        for (const rel of missing) problems.push(`副本少一份声明的 staging 附加（参考清单里有、副本里没有）：${rel}`)
        isThatStaging = {
          root: reference.root,
          reference: referenceSource,
          declared: reference.manifest.files,
          added: added.sort(),
          missing,
          mismatched,
          skipped: reference.skipped,
          // 副本这一侧**现算**的清单（导出那一侧记的是"写下去的是什么"，这里记的是"现在盘上是什么"）
          sha256: manifestOfEntries(copyEntries),
        }
      }
    }
  }
  const isThatCommit = { ok: problems.length === 0, files, problems }

  // ③ 活树从派工那一刻起动了几处（判不了 ⇒ null + 一句说法）。
  const baselineFile = args.liveBaseline === null ? null : path.resolve(args.liveBaseline)
  const live = liveMoved(path.resolve(args.liveRoot ?? repo), baselineFile)

  const ok = equal === true && isThatCommit.ok === true
  // `staging` 那一段**只有给了 `--with-staging` 才出现** —— 不给时输出与从前逐字节相同。
  emit({
    ok,
    commit: resolved.sha,
    copy: { root: copy, code_sha256: code.ok ? code.sha256 : null, files: code.files, bytes: code.bytes, problems: code.problems },
    equal,
    // 🔴 `equal` 只覆盖 **CODE 集里**的字节。它**不覆盖**：副本里多出来的、被排除表挡掉的文件（交给 `is_that_commit`），
    //    以及 CODE 集之外的任何路径。读 `equal:true` 的人必须同时看 `is_that_commit` —— 两个都 ok 才叫"副本还是那一份"。
    equal_scope: {
      covers: 'CODE set only (exclusion table applied)',
      does_not_cover: [
        'extra files inside the copy that the exclusion table drops (e.g. __pycache__/*.pyc)',
        'any path outside the CODE set',
      ],
    },
    is_that_commit: isThatCommit,
    live: { baseline: baselineFile, moved: live.moved, places: live.places, detail: live.detail },
    ...(args.withStaging ? { staging: isThatStaging } : {}),
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
