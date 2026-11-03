/**
 * `CPY-01` · **只读副本原地跑得动套件吗**（长期票 `ticket-20261102-03` · 技术评审 2026-11-02 `F2`）。
 *
 * 病根（评审原话）：只读副本原地跑不动检查器（staging 被 gitignore）——「124/124」量的是**活树**。
 * 契约（这一格钉的那一句）：**一个由 `.tools/tree-at-commit.mjs --with-staging` 在某个提交上导出的副本，
 * 要自足到能原地跑套件：提交里的文件逐字节都在、多出来的只有那一层"声明的追加"
 * （`.tools/_staging/agenia-upgrade/{preset,oracle}`，与活树逐字节相同），而套件跑起来必须吃的
 * 四条输入在副本里、且与活树逐字节相同。**
 * ⚠️ 这一格**不判**"副本原地跑全量 0 红"：跑一遍要几分钟，而且今天实测还有几条红来自**提交里根本没有的数据**
 * （`.git` 历史 / `.runtime/` / `AGENTS.local.md` / 三份 `.team/leader` 文档）—— 那是 `F-169`
 * （套件入口/尺子/体检脚本改指副本）那一票的事，不在本票范围（2026-11-02 `F2` 的决定）。
 *
 * ── 这一格为什么是「缺口的自检」，不是「跑一遍套件」────────────────────────────
 * 跑一遍套件要几分钟，而且它会把**两个不同的问题**混成一条红：
 *   ① 副本里**没有**套件要的输入（这一条是本票）；
 *   ② 套件自己有几处按 `import.meta.url` / 硬编码根推路径的地方（那是
 *      「套件入口/尺子/体检脚本改指副本」那一票的事，不在本票范围）。
 * 所以这一格只判**第一条**：**副本里有没有套件跑起来必须有的东西**，缺哪一条就点哪一条的**绝对路径**，
 * 并且每一条都要与活树**逐字节相同**（"有这份文件"不算数 —— 副本里睡着一份过期注入器也和活树跑的不是同一把尺子）。
 * 它把 `run-all.mjs` 与 `support/env.mjs` 的绑定关系**逐条抄下来**（下面 `REQUIRED` 的 `why` 列写了行号来历）——
 * 这份清单是"副本自足"的可判形状；三条齐了，第 ② 条才有资格单独去判（那一票的格）。
 *
 * ── 这一格怎么判"副本就是那个提交"（2026-11-02 `F2` 的决定）────────────────────
 * 导出器带 `--with-staging` 时，副本 = **提交里的全部 blob** **+** `.tools/_staging/agenia-upgrade/{preset,oracle}`
 * 那一层（活树那一层，`.gitignore` 挡着、**不在提交里**）。判定两向钉死：
 *   · 提交里的每一份：少一份 / 字节不同 ⇒ 红（**子集核对**；不要求"副本里只有这些"）；
 *   · 多出来的：只准是那一层里的路径，且每一条与活树逐字节相同；多出任何一条别的 ⇒ 红。
 * 为什么不是"副本必须与提交逐字相同"：那样 `--with-staging` 一开就必然红（副本"多"了那一层），
 * 而"副本自足"要的正是它（`support/tree-at-commit.mjs` 的 `STAGING_ADDITION` 是唯一写法）。
 *
 * 🔴 **份数一个都不许写死在这份文件里**（2026-11-03 第三轮评审 `R3-2`：同一个量在两个载体上
 *    出现过**三个互不相同的值**，而它每天都会变 —— 读的人拿旧数去核一份新副本，就会得出"副本被动过"）。
 *    份数的来源只有读数，载体是 `readings.cpy01.file_count_ledger.sources` 那几条（**各一个落点**）：
 *      · 副本里的份数 = `copy`（副本目录逐份枚举）· 其中追加那一层 = `copy_staging`；
 *      · 提交里的份数 = `commit`（`lsTreeBlobs`：`git ls-tree -r --full-tree <commit>` 的条数）；
 *      · 声明的追加 = `declared_live`（`declaredAdditionPaths()` / `declaredAdditionManifest()` 现算）；
 *      · 导出器自己记的 = `export_record_commit` / `export_record_staging`（`exp.json`）；
 *      · **派工那一刻**记的 = `pinned_declared`（`AGENIA_STAGING_MANIFEST`，可选）。
 *    `副本 = 提交 + 声明的追加` 只是这些读数之间的**一条**关系（第四轮评审 `F2`：只判它、而且三侧现算
 *    ⇒ 恒等式、响不了）；现在是**两两对账**，由 `CPY-FILE-COUNT-DRIFT` 当场判，任一来源分叉都红。
 *    ⚠️ 它跑在"副本不是那个提交就早退"**之前** —— 否则"多带/少带一份"这种最该响的事永远到不了它。
 *    文档里再抄一份数字，就是给下一次"写死了没跟上"留的位置。
 *
 * ── 这一格的现场（每一项都由这一跑现量）──────────────────────────────────────
 * `.tools/_staging/` 在 `.gitignore` 里 ⇒ 提交里 `.tools/_staging` 下的路径应当是 **0 份**
 * （读数 `readings.cpy01.commit_tree.staging_paths`）；带 `--with-staging` 导出的副本因此 = 提交 + 那层追加，
 * 四条必需输入与活树逐字节相同 ⇒ 这一格**绿**。**具体份数看读数，不看这段注释。**
 *
 * ── 什么会把它弄红（五种形状，各自一个红因码）──────────────────────────────────
 *   · 导出器不认这个开关 / 导出失败 ⇒ `CPY-EXPORT-STAGING`（红在**工具那一半**，不是副本缺件）；
 *   · **份数对账**：副本 / 提交 / 活树那一层 / 导出器记录 / 派工那份清单，任一对不上 ⇒
 *     `CPY-FILE-COUNT-DRIFT`（**跑在早退之前**：多带/少带一份正是会让 `isThatCommit.ok === false` 的事）；
 *   · 副本里缺一条必需输入 ⇒ `CPY-STAGING-NOT-IN-COPY`（点名绝对路径 + 声明的追加命中几条）；
 *   · 副本里的与活树不是同一份 ⇒ `CPY-STAGING-DIFFERS-LIVE`（副本里睡着一份过期输入）；
 *   · 副本解析后不在副本之下（链接 / junction）⇒ `CPY-STAGING-ESCAPES-COPY`；
 *     声明之外的"多一份"、以及任何链接，由 `verifyCopyIsCommit()` 报 `CPY-EXPORT-FIXTURE`。
 * 判据不关心导出器内部怎么拷贝（`REQUIRED` 里没有"怎么来的"，只有"在不在、在不在副本里、是不是同一份"）。
 *
 * ── 量的是哪棵树（口径）──────────────────────────────────────────────────────
 * 副本 = `runExport()`（真子进程跑 `.tools/tree-at-commit.mjs --commit <HEAD> --with-staging`）落出来的树；
 * `verifyCopyIsCommit({ declared: [STAGING_ADDITION] })` 逐份拿 `git blob` SHA-1 对账提交里每一份、
 * 再拿 sha256 对账那一层声明的追加 ⇒ **判据量的确实是那个提交的副本**，不是"某个目录"
 * （`cand-20261019-0033`：证据件必须自报它量的是哪一版）。
 */
import { before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { caseFail, ensureDir, preflight, problem, runCase, runRoot, writeJson } from '../support/evidence.mjs'
import { ROOT_SOURCE, canonical, isUnder } from '../support/root-guard.mjs'
import {
  EXPORT_FIELDS, STAGING_ADDITION, VERIFY_FIELDS, buildFixtureRepo, declaredAdditionManifest, declaredManifestOnDisk,
  fileCountDrift, fingerprintTool, git, lsTreeBlobs, exporterPath, missingFields, runExport, runVerify, treeDigest, verifyCopyIsCommit,
} from '../support/tree-at-commit.mjs'
import { ENV, PATHS, optionalEnv } from '../support/env.mjs'

before(() => {
  preflight()
})

const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * **副本的自证**（评审 2026-11-02 打回项 2）：问"这份副本是谁写的"，而不是"某个目录像不像它"。
 *
 * 两问，都从**副本里**发出去（`cwd = 副本根`）：
 *   ① 拿**副本里那份** `support/root-guard.mjs` 问它"你的仓库根是谁" —— 必须解析成副本自己
 *      （否则副本原地跑套件时，套件判的是**另一棵树**，绿不在副本上）；
 *   ② 在副本里问 git"你的仓库在哪" —— 今天会指回**活树**（副本嵌在活树的工作树里、`.git` 在上一层）。
 *      这一问是**读数不是判据**：它正是"在副本里跑套件会静默认证活树"那个坑，所以本文件
 *      **一次都不在副本里调 git** —— 所有 git 调用都显式钉 `cwd: PATHS.repo`（期望那一侧）。
 */
function copyAuthorship(copyRoot) {
  const moduleUrl = pathToFileURL(path.join(copyRoot, 'tests', 'agenia-upgrade', 'support', 'root-guard.mjs')).href
  const code = `
    import { execFileSync } from 'node:child_process'
    const mod = await import(${JSON.stringify(moduleUrl)})
    let top = null, err = null
    try { top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.env.CPY_PROBE_CWD, encoding: 'utf8' }).trim() } catch (e) { err = String(e.message).slice(0, 200) }
    console.log(JSON.stringify({ cwd: process.cwd(), repo_root: mod.REPO_ROOT, root_source: mod.ROOT_SOURCE, git_toplevel: top, git_error: err }))
  `
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: copyRoot, encoding: 'utf8', timeout: 60000, env: { ...process.env, CPY_PROBE_CWD: copyRoot },
  })
  const last = String(r.stdout ?? '').trim().split('\n').filter((line) => line.trim() !== '').pop()
  let json = null
  try { json = last === undefined ? null : JSON.parse(last) } catch { json = null }
  return { exit: r.status, json, stderr: String(r.stderr ?? '').slice(0, 300) }
}

/**
 * 套件跑起来**必须有**的四条（路径相对**副本根**；`why` 写清"哪一行把它绑上去的"）。
 *
 * 为什么是这四条、不是"整个 staging 目录"：判据要能红在一个**可指认的路径**上。
 * 整目录比一句"staging 不在"更没用 —— 老板要的是"缺哪一份"。
 * 这四条各自绑着一处真消费点：
 *   · `preset/inject.js` —— `AGENIA_STAGING_PRESET`（`run-all.mjs:201`）下的靶子；
 *     它是几十条用例的被测面（`support/sut.mjs` 从 staged preset 取注入器）。
 *   · `preset/agent.cordis.yml` / `preset/lib/route.mjs` —— 同一个靶子根的另两份；
 *     `PRS-01` / `LED-*` 那一族按它们读组合与常量（少一份 = 那几条当场红）。
 *   · `oracle/standard.patch.yml` —— `AGENIA_DESKTOP_ORACLE_STANDARD`（`run-all.mjs:206`），
 *     `STAT-0x` 的 desktop oracle 对账（`support/composition.mjs` 的冻结表）读它。
 */
const STAGING_REL = path.join('.tools', '_staging', 'agenia-upgrade')
const REQUIRED = [
  ['preset/inject.js', 'run-all.mjs:201 的 AGENIA_STAGING_PRESET 指向它；几十条用例的被测面'],
  ['preset/agent.cordis.yml', '同一个靶子根：组合本体（PRS-01…PRS-04 读它）'],
  ['preset/lib/route.mjs', '同一个靶子根：路线常量（LED-* / DBY-* 读它）'],
  ['oracle/standard.patch.yml', 'run-all.mjs:206 的 AGENIA_DESKTOP_ORACLE_STANDARD（STAT-0x 读它）'],
]

/** `realpath` 之后还在不在 `root` 之下（防"副本里放一个指向活树的 junction"这种假绿）。 */
function escapes(root, target) {
  try {
    const realRoot = realpathSync(root).toLowerCase()
    const realTarget = realpathSync(target).toLowerCase()
    return !(realTarget === realRoot || realTarget.startsWith(`${realRoot}${path.sep}`))
  } catch {
    return true
  }
}

/** 某个目录下有多少份文件（读数：活树 staging 有多少东西是副本里没有的）。 */
function countFiles(dir) {
  if (!existsSync(dir)) return 0
  let n = 0
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name)
      if (statSync(full).isDirectory()) walk(full)
      else n += 1
    }
  }
  walk(dir)
  return n
}

test('CPY-01 提交导出的只读副本要能原地跑套件：套件吃的四条输入必须都在副本里（缺哪条点哪条）', async () => {
  await runCase('CPY-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {}
    rec.readings.cpy01 = readings

    // ── ① 量具：导出器在不在（不在 ⇒ 这一格量不了；那是夹具红，不是功能红）────────────
    const exporter = exporterPath()
    readings.exporter = { file: exporter.file, exists: exporter.exists, source: exporter.source }
    if (!exporter.exists) {
      push('CPY-EXPORT-FIXTURE', `导出器不在：${exporter.file}（来源 ${exporter.source}）—— 没有它就没有"派工那一刻的副本"这回事`)
      return caseFail(problems)
    }

    // ── ② 钉住提交：HEAD 解析成完整 40 hex（短哈希不是读数）──────────────────────────
    const head = git(['rev-parse', 'HEAD'], { cwd: PATHS.repo })
    const commit = head.status === 0 ? String(head.stdout).trim() : ''
    readings.commit = {
      ok: head.status === 0,
      status: head.status,
      value: commit,
      error: head.error === null || head.error === undefined ? null : String(head.error?.message ?? head.error),
      stderr: String(head.stderr ?? '').slice(0, 200),
    }
    if (!/^[0-9a-f]{40}$/.test(commit)) {
      push('CPY-EXPORT-FIXTURE', `\`git rev-parse HEAD\` 没给出完整 40 hex 提交（status=${head.status} · 实得 ${JSON.stringify(commit)} · stderr=${JSON.stringify(String(head.stderr ?? '').slice(0, 200))}）—— 这一格量不了"某个提交的副本"`)
      return caseFail(problems)
    }

    /**
     * ③ 提交里 `.tools/_staging` 下有几份 —— **这一格的红因证据**。
     * 它把"副本里缺"这件事钉在**提交**上：不是导出器漏拷，是提交里本来就没有。
     */
    const tree = lsTreeBlobs(PATHS.repo, commit)
    const stagingInCommit = tree.ok ? tree.entries.filter((e) => e.rel.startsWith('.tools/_staging/')).map((e) => e.rel) : null
    readings.commit_tree = {
      ok: tree.ok,
      files_total: tree.ok ? tree.entries.length : null,
      staging_paths: stagingInCommit === null ? null : stagingInCommit.length,
      problems: tree.ok ? [] : tree.problems,
    }

    /**
     * ③b **量具自证：`lsTreeBlobs` 不许被 cwd 前缀裁空**（技术评审 2026-11-03 `F3`）。
     *
     * 病：`git ls-tree -r <commit>` **不给 pathspec 时只列当前 cwd 前缀**。从副本里调它（副本没有
     * `.git`，git 走到活树那个仓、前缀是副本在活树里的相对路径）⇒ **0 条**；旧代码把 0 条当成
     * `ok:true` ⇒ 提交里那 175 份全成了"多一份"，这一格报"227 份 extras"并在下面提前 return，
     * 三条后来的腿（根钉死 / 内容冻结 / 前后 equal）一次都没跑到。
     * 两条腿各量一次，缺一条这句话都不成立：
     *   · **正向**：从仓库**子目录**调一次 ⇒ 必须与仓根那次**同一份清单**（前缀裁剪当场露出来）；
     *   · **反向**：一个**空树提交**（0 条 blob，造在运行根的夹具仓库里）⇒ 必须 `ok:false` 并点名"0 条"
     *     （0 条 ≠ "提交是空的也可以"）。
     */
    const nestedCwd = path.join(PATHS.repo, 'tests', 'agenia-upgrade')
    const nested = lsTreeBlobs(PATHS.repo, commit, { cwd: nestedCwd })
    const rootRels = tree.ok ? tree.entries.map((e) => e.rel) : null
    const nestedRels = nested.ok ? nested.entries.map((e) => e.rel) : null
    const fxEmpty = buildFixtureRepo(runRoot(), 'cpy01-empty-tree')
    const emptyTreeSha = String(git(['mktree'], { cwd: fxEmpty.repo, input: '' }).stdout).trim()
    const emptyCommit = String(git(['commit-tree', emptyTreeSha, '-m', '空树提交（0 条 blob）'], { cwd: fxEmpty.repo }).stdout).trim()
    const emptyRead = /^[0-9a-f]{40}$/.test(emptyCommit)
      ? lsTreeBlobs(fxEmpty.repo, emptyCommit)
      : { ok: null, entries: [], problems: ['夹具里没造出空树提交（commit-tree 输出不是 40 hex）'], toplevel: null }
    readings.ls_tree_scope = {
      repo: PATHS.repo,
      from_repo_root: { ok: tree.ok, files: rootRels === null ? null : rootRels.length, toplevel: tree.toplevel ?? null },
      from_nested_cwd: {
        cwd: nestedCwd, ok: nested.ok,
        files: nestedRels === null ? null : nestedRels.length,
        toplevel: nested.toplevel ?? null,
        problems: nestedRels === null ? nested.problems.slice(0, 3) : [],
      },
      same_list: rootRels !== null && nestedRels !== null && JSON.stringify(rootRels) === JSON.stringify(nestedRels),
      empty_tree_control: {
        fixture_repo: fxEmpty.repo,
        commit: /^[0-9a-f]{40}$/.test(emptyCommit) ? emptyCommit : null,
        ok: emptyRead.ok,
        entries: emptyRead.entries.length,
        problems: emptyRead.problems.slice(0, 3),
      },
      note: '正向：从子目录调必须与仓根同一份清单；反向：空树提交必须 ok:false（0 条不是"没问题"）',
    }
    if (!nested.ok) {
      push('CPY-LS-TREE-SCOPE',
        `从仓库子目录（${nestedCwd}）调 \`lsTreeBlobs\` 读不出来：${nested.problems.slice(0, 3).join(' / ')} —— `
        + '`git ls-tree -r` 不给 pathspec 时**只列 cwd 前缀**（`F3`）；这一格量的必须是整个提交')
    } else if (!readings.ls_tree_scope.same_list) {
      push('CPY-LS-TREE-SCOPE',
        `从仓根与从子目录调 \`lsTreeBlobs\` 得到的清单不一致（仓根 ${rootRels?.length ?? '?'} 条 / 子目录 ${nestedRels.length} 条）—— `
        + '提交那棵树与 cwd 无关；两个数不同就是前缀裁剪又回来了（`F3`：从副本里调会拿到 0 条）')
    }
    if (emptyRead.ok !== false) {
      push('CPY-LS-TREE-EMPTY-OK',
        `一个 **0 条 blob 的空树提交**被 \`lsTreeBlobs\` 判成 ok=${JSON.stringify(emptyRead.ok)}（${emptyRead.entries.length} 条）—— `
        + '0 条不是"提交是空的也可以"，是**这一问没落到那个提交上**（`F3`：下游会把副本里每一份都算成"多一份"）')
    } else if (!emptyRead.problems.some((p) => String(p).includes('0 条'))) {
      push('CPY-LS-TREE-EMPTY-OK',
        `空树提交红了，但没有一句点名"0 条"：${JSON.stringify(emptyRead.problems.slice(0, 3))} —— 读的人分不出是"空"还是"读错了地方"`)
    }

    // ── ④ 导出副本（落在运行根里；`.team/` 不在 CODE 名单里，不会把这条写进读数）──────
    // `withStaging` ⇒ 导出器要把声明的追加（活树那一层）一起带进副本；没有它，副本永远缺输入。
    const copyRoot = path.join(runRoot(), 'review-copy', 'cpy01-head')
    const exp = runExport({ exporter: exporter.file, repo: PATHS.repo, commit, out: copyRoot, withStaging: true })
    readings.export = {
      exit: exp.exit,
      json_error: exp.json_error,
      missing_fields: missingFields(exp.json, EXPORT_FIELDS),
      stderr: String(exp.stderr).slice(0, 400),
      ok: exp.json?.ok ?? null,
      error: exp.json?.error ?? null,
      tree_root: exp.json?.tree_root ?? null,
      code: exp.json?.code ?? null,
      with_staging_requested: true,
      copy_root: copyRoot,
    }
    if (exp.json === null || readings.export.missing_fields.length > 0 || exp.json?.ok !== true) {
      // 这一条是**工具那一半没到**，不是"副本缺件"：两种红因分开报，读的人才知道该找谁。
      push('CPY-EXPORT-STAGING',
        `导出器没能在带 \`--with-staging\` 的情况下导出提交 ${commit.slice(0, 12)} 的副本`
        + `（exit=${exp.exit} · ok=${JSON.stringify(exp.json?.ok ?? null)} · `
        + `error=${JSON.stringify(readings.export.error ?? null)} · stderr=${JSON.stringify(String(exp.stderr).slice(0, 240))}`
        + `${readings.export.missing_fields.length > 0 ? ` · 缺字段 ${JSON.stringify(readings.export.missing_fields)}` : ''}）`
        + ' —— 这一格判的是"副本带不带那一层声明的追加"；导出器不认这个开关就产不出那种副本，'
        + '现在红在**工具那一半**（`ticket-20261102-03` 的实现侧），不是副本缺件')
      return caseFail(problems)
    }

    /**
     * ⑤ 量具自证：**副本就是那个提交**（+ 恰好那一层声明的追加）。
     * 判定两向钉死：提交里每一份子集核对；多出来的只准是声明的追加，且与活树逐字节相同。
     *
     * ⚠️ **这里只算、不早退**（技术评审 2026-11-03 第四轮 `F2`）：下面 ⑤a 的份数对账要用
     * 「副本自己的枚举」与另外几份独立读数对账，而"多带 / 少带一份"恰恰就是让 `isThatCommit.ok === false`
     * 的那类事 —— 早年退的话，份数那条判据在**它本该响的场景里永远到不了**（评审原话：垫在早退后面 = 装饰）。
     * 早退挪到 ⑤a 之后：两种红因（`CPY-EXPORT-FIXTURE` + `CPY-FILE-COUNT-DRIFT`）同一次交活都看得见。
     */
    const isThatCommit = verifyCopyIsCommit({ repo: PATHS.repo, commit, copyRoot, declared: [STAGING_ADDITION] })
    const copyPaths = Array.isArray(isThatCommit.actual) ? isThatCommit.actual : []
    /** 副本里落在"声明的追加"那两棵子树下的路径（前缀与 `declaredAdditionPaths()` 同一份 `STAGING_ADDITION`）。 */
    const STAGING_PATH_RE = new RegExp(`^\\.tools/_staging/agenia-upgrade/(${STAGING_ADDITION.dirs.join('|')})/`)
    const copyStagingPaths = copyPaths.filter((rel) => STAGING_PATH_RE.test(rel))
    readings.copy_is_commit = {
      ok: isThatCommit.ok,
      files: copyPaths.length,
      staging_files: copyStagingPaths.length,
      commit_part: copyPaths.length - copyStagingPaths.length,
      missing: isThatCommit.missing.slice(0, 5),
      extra: isThatCommit.extra.length,
      undeclared_extra: (isThatCommit.undeclared_extra ?? []).slice(0, 5),
      declared: isThatCommit.declared ?? null,
      problems: isThatCommit.problems.slice(0, 5),
    }

    /**
     * ── ⑤a **份数对账：几条各自独立的读数两两对账**（技术评审 2026-11-03 第四轮 `F2`）────────────
     *
     * 病历（第三轮 `R3-2` 的修法在第四轮被打回）：那一版判 `副本 = 提交 + 声明`，但三个数**全部从这一跑
     * 现算**，而副本又正是拿**同一棵树**导出来的 ⇒ 等式是恒等式（评审两把刀 +1 / −1 都绿、判据一声不响）。
     * 现在改成**几个各自独立的来源**，成对对账，任何一对不等都当场红：
     *   · `copy`               —— 副本目录**逐份枚举**（`verifyCopyIsCommit().actual`，测试侧读盘）；
     *   · `commit`             —— `git ls-tree -r --full-tree <commit>`（测试侧读 **git 对象**，不看工作树）；
     *   · `declared_live`      —— `declaredAdditionPaths()` / `declaredAdditionManifest()`（测试侧现走活树那一层）；
     *   · `export_record`      —— 导出器**自己写下的** `exp.json.files` + `exp.json.staging.sha256`（另一个进程、另一条代码路）；
     *   · `copy_staging`       —— 副本里那两棵追加子树自己的枚举（与 `copy` 分开，单独对账）；
     *   · `pinned_declared`    —— **派工那一刻**记下的清单（`AGENIA_STAGING_MANIFEST`；见 `support/env.mjs`）。
     * `副本 = 提交 + 声明` 只是**其中一条**关系（它现在有独立的两侧可对）；其余每一对都能在"没有恒等式保护"
     * 的情况下分叉：副本被谁写过 · 导出之后 HEAD 前进 · 活树那一层在导出之后被同步过 · 导出记录与它写下的
     * 字节对不上 · **派工那份声明与这一跑的活树不是同一份**。
     * ⚠️ 判不了（某一侧读数为 `null`）要**写出来**（`judged:false` + 原因），不许当绿。
     * ⚠️ 无 `AGENIA_STAGING_MANIFEST` 时 `pinned` 记 `null` —— "这一格没配"是读数，不是"对上了"。
     */
    const liveManifest = declaredAdditionManifest(PATHS.repo, STAGING_ADDITION)
    readings.declared_staging = {
      dirs: STAGING_ADDITION.dirs,
      prefix: STAGING_ADDITION.prefix,
      live_paths: liveManifest.files,
    }
    const exportManifest = exp.json?.staging?.sha256 ?? null
    const exportSkipped = exp.json?.staging?.skipped ?? null
    const exportCommitFiles = typeof exp.json?.files === 'number' ? exp.json.files : null
    /**
     * 导出记录里的追加份数 = **清单条数**（`list.length`），不是 `files` 那个自报值 ——
     * 自报值只用来判清单自洽（`same_files` / `F8` 那一侧）：拿一个"声明 53 条、list 只有 52 条"的
     * 清单当份数依据，就是让被对账的那个数自己说了算。
     */
    const exportStagingFiles = exportManifest === null
      ? null
      : (Array.isArray(exportManifest.list)
        ? exportManifest.list.length
        : (typeof exportManifest.files === 'number' ? exportManifest.files : null))
    const pinnedFileRaw = optionalEnv(ENV.STAGING_MANIFEST)
    const pinned = pinnedFileRaw === null
      ? { given: false }
      : { given: true, file: path.resolve(pinnedFileRaw), ...declaredManifestOnDisk(path.resolve(pinnedFileRaw)) }
    const pinnedUsable = pinned.given === true && pinned.ok === true && pinned.consistent === true

    const ledgerSources = {
      copy: { value: copyPaths.length, source: '副本目录逐份枚举（`verifyCopyIsCommit().actual`）' },
      commit: { value: readings.commit_tree.files_total, source: '`git ls-tree -r --full-tree <commit>`（读 git 对象，不看工作树）' },
      declared_live: { value: liveManifest.files, source: '`declaredAdditionPaths()`（活树那一层逐份走，测试侧现算）' },
      export_record_commit: { value: exportCommitFiles, source: '导出器记录 `exp.json.files`（它写了几份提交 blob）' },
      export_record_staging: { value: exportStagingFiles, source: '导出器记录 `exp.json.staging.sha256.list` 的条数（它写了几份追加；`files` 是自报值，只进 `same_files`）' },
      copy_staging: { value: copyStagingPaths.length, source: '副本里 `.tools/_staging/agenia-upgrade/{preset,oracle}` 的逐份枚举' },
      pinned_declared: pinned.given === false
        ? { value: null, source: '没给 `AGENIA_STAGING_MANIFEST`（这一格没配）' }
        : (pinnedUsable
          ? { value: pinned.entries, source: `派工那一刻记下的清单 ${pinned.file}（${pinned.entries} 条，` + '`list.length` 为准）' }
          : { value: null, source: `派工那一刻记下的清单 ${pinned.file}（读不出来 / 不自洽：${(pinned.problems ?? []).slice(0, 2).join(' / ') || `files 声明 ${JSON.stringify(pinned.declared_files ?? null)} ≠ list ${JSON.stringify(pinned.entries ?? null)} 条`}）` }),
    }
    /**
     * 判据本体在 `support/tree-at-commit.mjs::fileCountDrift`（**纯函数**：只吃读数，不碰盘）；
     * 这里只负责把"每一对读数各自从哪来 / 不等说明什么"写成人话。纯函数那一侧有一张
     * 阳性对照矩阵（`_probe/r4-f2-ledger.mjs`：副本 +1 / −1 · 声明层 +1 / −1 · 派工清单 +1 · 判不了）
     * —— 每一对都能翻面，不是"永远不会不等的等式"。
     */
    const ledger = fileCountDrift({
      copy: ledgerSources.copy.value,
      copyStaging: ledgerSources.copy_staging.value,
      commit: ledgerSources.commit.value,
      declaredLive: ledgerSources.declared_live.value,
      exportCommit: ledgerSources.export_record_commit.value,
      exportStaging: ledgerSources.export_record_staging.value,
      pinned: ledgerSources.pinned_declared.value,
      pinnedGiven: pinned.given,
    })
    /**
     * 每一对的**两侧**各自指回 `ledgerSources` 里的一个来源；两条"和"（导出记录两项之和 / 提交 + 声明）
     * 在 `sources` 里没有单独的键 ⇒ 这里给它们一句说明（`pairSourceText`），别让报文里出现 `?`。
     */
    const pairSourceText = (key) => ledgerSources[key]?.source ?? (
      key === 'export_record_commit + export_record_staging'
        ? '导出器记下的两份数之和（`exp.json.files` + `exp.json.staging.sha256.list`）'
        : key === 'commit + declared_live'
          ? '提交清单 + 声明的追加（两条独立读数相加）'
          : '?')
    const PAIR_TEXT = {
      copy_vs_export_record: {
        got: 'copy', want: 'export_record_commit + export_record_staging',
        why: '副本盘上的份数 ≠ 导出器自己记下的"提交 + 追加" —— 导出之后有人往副本里写过 / 少过一份，或者导出器记的数与它写下的字节对不上',
      },
      commit_now_vs_export_record: {
        got: 'commit', want: 'export_record_commit',
        why: '提交**现在**的清单 ≠ 导出那一刻的清单 —— 导出之后 `HEAD` 前进 / 退回了，这份副本不对着现在这个提交',
      },
      declared_live_vs_export_record: {
        got: 'declared_live', want: 'export_record_staging',
        why: '活树那一层**现在**的份数 ≠ 导出器那一刻写下的份数 —— 导出之后那一层被同步过：副本里的追加不是现在这一份',
      },
      copy_vs_commit_plus_declared: {
        got: 'copy', want: 'commit + declared_live',
        why: '副本 ≠ 提交 + 声明的追加：多带 / 少带了一份（这一条**不是**恒等式了 —— 两侧各有独立来源）',
      },
      copy_staging_vs_declared_live: {
        got: 'copy_staging', want: 'declared_live',
        why: '副本里那两棵追加子树的份数 ≠ 活树那一层的份数 —— 副本里的追加与现在这一份不是同一批路径',
      },
      copy_staging_vs_export_record: {
        got: 'copy_staging', want: 'export_record_staging',
        why: '副本里那两棵追加子树的份数 ≠ 导出器记下的份数 —— 副本里的追加与导出记录不是同一批',
      },
      declared_live_vs_pinned: {
        got: 'declared_live', want: 'pinned_declared',
        why: '这一跑活树那一层的份数 ≠ **派工那一刻**记下的清单条数 —— 派工之后那一层被加过 / 删过（副本里的追加也不是派工那一批）',
      },
    }
    readings.file_count_ledger = {
      sources: ledgerSources,
      pairs: ledger.pairs.map((p) => ({
        ...p,
        got_source: pairSourceText(PAIR_TEXT[p.id].got),
        want_source: pairSourceText(PAIR_TEXT[p.id].want),
      })),
      /** 全部对账对都**判得了**（没有 `null` 那条边）—— `false` 时看 `unjudged` 是哪一对。 */
      judged: ledger.judged,
      all_ok: ledger.allOk,
      unjudged: ledger.pairs.filter((p) => p.ok === null).map((p) => p.id),
      pinned: pinned.given === false
        ? null
        : { file: pinned.file, ok: pinned.ok === true, consistent: pinned.consistent ?? null, entries: pinned.entries ?? null, declared_files: pinned.declared_files ?? null },
      note: '副本 / 提交 / 活树那一层 / 导出器记录 / 派工那份清单 —— 各自一个来源，两两对账（第四轮 `F2`）；'
        + '`pinned: null` = 没给 `AGENIA_STAGING_MANIFEST`（那一条没判，不是绿）',
    }
    for (const pair of ledger.pairs) {
      if (pair.ok !== false) continue
      const text = PAIR_TEXT[pair.id]
      push('CPY-FILE-COUNT-DRIFT',
        `份数对账不过（${pair.id}）：**左边** ${pair.got}（${pairSourceText(text.got)}）`
        + ` ≠ **右边** ${pair.want}（${pairSourceText(text.want)}）—— ${text.why}。`
        + (pair.id === 'declared_live_vs_pinned'
          ? ` 这一跑的副本里有 ${ledgerSources.copy_staging.value} 份追加，` + '派工那一刻的声明是另一个数 ⇒ 副本里的那一层已经不是派工那一批。'
          : '')
        + ' ⚠️ 这几个数各有独立来源（`readings.cpy01.file_count_ledger.sources`），不是同一棵树现算两遍。')
    }
    /**
     * ⚠️ **判不了不是绿**：某一对读数的某一侧是 `null`（提交清单读不出来 / 导出记录没有 `staging` 清单 /
     * 派工那份清单给了但读不出来或不自洽）⇒ 这一条要单独红、点名是哪一对，不许让它静悄悄地"跳过"。
     * （`cand-20261019-0042`：判据钉在一个读不到的东西上，绿和"没判"长得一模一样。）
     */
    if (!ledger.judged) {
      push('CPY-FILE-COUNT-UNJUDGED',
        `份数对账有 ${ledger.pairs.filter((p) => p.ok === null).length} 对**判不了**（${ledger.pairs.filter((p) => p.ok === null).map((p) => p.id).join(' · ')}）：`
        + `各对的读数 ${JSON.stringify(ledger.pairs.filter((p) => p.ok === null).map((p) => ({ id: p.id, got: p.got, want: p.want })))}，`
        + `来源 ${JSON.stringify(ledgerSources)} —— 判不了不是绿：先把缺的那一侧读出来（导出记录有没有 \`staging\` 清单 / 提交清单读得出来吗 / 派工那份清单能不能用），再谈对账`)
    }

    // ── ⑤a' 声明那一层的**清单**：三份（活树 / 导出记录 / 副本字节）必须同一个摘要 ────────────
    const copyEntries = liveManifest.list.map((entry) => {
      const copyFile = path.join(copyRoot, ...entry.rel.split('/'))
      if (!existsSync(copyFile)) return { rel: entry.rel, sha256: null, bytes: null }
      const buf = readFileSync(copyFile)
      return { rel: entry.rel, sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length }
    })
    const copyDigest = copyEntries.every((entry) => typeof entry.sha256 === 'string')
      ? treeDigest(copyEntries).sha256
      : null
    const liveSkipped = (liveManifest.skipped ?? []).map((item) => `${item.rel}:${item.reason}`).sort()
    const exportSkippedNorm = (Array.isArray(exportSkipped) ? exportSkipped : []).map(String).sort()
    readings.declared_staging = {
      ...readings.declared_staging,
      in_copy: isThatCommit.declared?.in_copy ?? null,
      missing: isThatCommit.declared?.missing ?? null,
      mismatched: isThatCommit.declared?.mismatched ?? null,
      manifest: {
        mine: { files: liveManifest.files, bytes: liveManifest.bytes, digest: liveManifest.digest, skipped: liveSkipped },
        exported: exportManifest === null
          ? null
          : { files: exportManifest.files, bytes: exportManifest.bytes, digest: exportManifest.digest, skipped: exportSkippedNorm },
        copy: { files: copyEntries.filter((e) => e.sha256 !== null).length, digest: copyDigest },
        same_digest: exportManifest !== null && liveManifest.digest === exportManifest.digest && copyDigest === liveManifest.digest,
        same_files: exportManifest !== null && liveManifest.files === exportManifest.files,
        same_bytes: exportManifest !== null && liveManifest.bytes === exportManifest.bytes,
        note: '导出器那份是它 `stagingFilesOf()` 的清单（跳 `.runtime` + 链接）；我这份是 `declaredAdditionPaths()`；'
          + '副本那份是从副本字节现算的。三个摘要同一个数 = 两边规则一致、且副本就是那一层。',
      },
    }
    if (exportManifest === null) {
      push('CPY-STAGING-MANIFEST',
        '导出 JSON 里没有 `staging.sha256` 清单（`--with-staging` 的"内容冻结"那一半）—— '
        + `实得 staging=${JSON.stringify(exp.json?.staging ?? null).slice(0, 240)}；`
        + '没有这份清单，"两边是同一份规则"就只能靠两段代码各自自报')
    } else if (liveManifest.digest !== exportManifest.digest || liveManifest.files !== exportManifest.files
      || liveManifest.bytes !== exportManifest.bytes) {
      push('CPY-STAGING-MANIFEST',
        `测试侧的声明清单与导出器记下的那份**不是同一份**（我：${liveManifest.files} 份 / ${liveManifest.bytes} B / ${liveManifest.digest.slice(0, 16)}…`
        + ` · 导出器：${exportManifest.files} 份 / ${exportManifest.bytes} B / ${String(exportManifest.digest).slice(0, 16)}…）—— `
        + '导出器与 `declaredAdditionPaths()` 各写了一份"什么算追加"：任一方的跳过规则/排序/条目公式变了，这一条就红'
        + `（今天两边都跳过 ${JSON.stringify(liveSkipped)}；导出器记录的 skipped=${JSON.stringify(exportSkippedNorm)}）`)
    } else if (copyDigest !== liveManifest.digest) {
      push('CPY-STAGING-MANIFEST',
        `副本里那几份追加的**摘要**与活树清单不同（副本 ${String(copyDigest).slice(0, 16)}… / 清单 ${liveManifest.digest.slice(0, 16)}…）—— `
        + '路径齐了但字节不是同一批：内容冻结的要的是"同一份清单"')
    }

    if (!isThatCommit.ok) {
      push('CPY-EXPORT-FIXTURE',
        `导出的副本不是"提交 ${commit.slice(0, 12)} + 声明的追加"（${isThatCommit.problems.slice(0, 3).join(' / ')}）—— `
        + '先修导出，再判"副本够不够用"（份数对账**已经在它之前**判过：见 `file_count_ledger` / `CPY-FILE-COUNT-DRIFT`）')
      return caseFail(problems)
    }

    /**
     * ⑤b **根钉死 + 副本自证**（评审 2026-11-02 打回项 2）。
     *
     * 病根：副本里没有 `.git`，而它嵌在**活树的工作树**里 ⇒ 从副本里调 git 会一路走到活树的 `.git`，
     * 于是"在副本里跑出来 0 红"可能只是"套件读了活树"。所以这一格把两件事落成读数：
     *   · **根是钉死的**：判据只用 `PATHS.repo`（来源 `ROOT_SOURCE` 自报），副本必须在运行根之下；
     *   · **副本自证**：拿副本里那份 `root-guard.mjs` 问它"你的仓库根是谁" ⇒ 必须解析成副本自己。
     *     （`git rev-parse --show-toplevel` 在副本里会指回活树 —— 这一格把它记成读数，
     *      并因此**不在副本里调 git**；所有 git 调用都显式钉 `cwd: PATHS.repo`。）
     */
    const runRootDir = runRoot()
    const authorship = copyAuthorship(copyRoot)
    const copyCanon = canonical(copyRoot)
    const probeRoot = authorship.json?.repo_root === undefined || authorship.json?.repo_root === null
      ? null
      : canonical(authorship.json.repo_root)
    const gitTop = authorship.json?.git_toplevel === undefined || authorship.json?.git_toplevel === null
      ? null
      : canonical(authorship.json.git_toplevel)
    readings.roots = {
      repo: PATHS.repo,
      repo_source: ROOT_SOURCE,
      run_root: runRootDir,
      copy_root: copyRoot,
      copy_under_run_root: isUnder(copyCanon, canonical(runRootDir)),
      copy_has_git: existsSync(path.join(copyRoot, '.git')),
      test_file: fileURLToPath(import.meta.url),
      test_file_under_repo: isUnder(canonical(fileURLToPath(import.meta.url)), canonical(PATHS.repo)),
      note: '判据只用 PATHS.repo（期望那一侧）；副本里的一切用副本自己的文件量',
    }
    readings.authorship = {
      probe_exit: authorship.exit,
      probe_error: authorship.json === null ? authorship.stderr : null,
      copy_cwd: authorship.json?.cwd ?? null,
      copy_repo_root: authorship.json?.repo_root ?? null,
      copy_root_source: authorship.json?.root_source ?? null,
      copy_is_own_root: probeRoot !== null && probeRoot === copyCanon,
      git_toplevel_from_copy: authorship.json?.git_toplevel ?? null,
      git_from_copy_is_live_repo: gitTop !== null && gitTop === canonical(PATHS.repo),
      note: '`git_from_copy_is_live_repo:true` 是**已知的坑**（副本嵌在活树里）——所以本文件不在副本里调 git；'
        + '副本的身份只由副本自己的字节 + 副本自己那份 root-guard 说',
    }
    if (!readings.roots.copy_under_run_root) {
      push('CPY-COPY-OUTSIDE-RUNROOT',
        `副本落在运行根之外（copy=${copyRoot} · run_root=${runRootDir}）—— 证据落点不分开的话，`
        + '「副本里量到的」与「运行根里量到的」会混成一件事')
    }
    if (readings.roots.copy_has_git) {
      push('CPY-COPY-HAS-GIT', `副本里带着 \`.git\`（${path.join(copyRoot, '.git')}）—— 那等于把活仓库带进副本，副本不是纯树`)
    }
    if (!readings.authorship.copy_is_own_root) {
      push('CPY-COPY-NOT-SELFROOT',
        `拿副本里那份 \`support/root-guard.mjs\` 问"仓库根是谁"，它答的是 ${JSON.stringify(authorship.json?.repo_root ?? null)}，`
        + `不是副本自己（${copyRoot}）—— 副本原地跑套件时，套件判的是**另一棵树**，那个绿不在副本上`
        + '（`ROOT_SOURCE` = ' + JSON.stringify(authorship.json?.root_source ?? null) + '；'
        + `probe exit=${authorship.exit}${authorship.json === null ? ` · stderr=${JSON.stringify(authorship.stderr)}` : ''}）`)
    }

    /**
     * ⑤c **副本在这一轮里没被动过**：`equal` 的前后两次读数（评审 2026-11-02 打回项 3）。
     *
     * 两把尺子各量一次，缺一把都不算：
     *   · 我这边：`.tools/fingerprint.mjs --root <副本> --set code` 开跑 / 收口各一次 ⇒ sha256 必须相同；
     *   · **导出器自己**：`--verify <副本> --expect <before_sha256> --with-staging` ⇒ `equal` 必须 `true`
     *     （它读的是副本现在的字节与 `--expect` 的比，不是照抄我给的数）。
     * 另外记 `countFiles()`：**任何**写入（含运行根 / 探针文件）都会让收口的份数变——这一格也判它。
     */
    const copyFilesBefore = countFiles(copyRoot)
    const copyBefore = fingerprintTool(copyRoot, { repo: PATHS.repo })
    const expectSha = String(copyBefore.sha256 ?? '').toLowerCase()
    const expectOk = /^[0-9a-f]{64}$/.test(expectSha)
    const verify = expectOk
      ? runVerify({ exporter: exporter.file, copy: copyRoot, repo: PATHS.repo, commit, expect: expectSha, withStaging: true })
      : { exit: null, json: null, json_error: 'before_sha256 不是 64 位小写 hex', stdout: '', stderr: '' }
    readings.copy_equal = {
      with_staging: true,
      before_files: copyFilesBefore,
      before: { ok: copyBefore.ok, sha256: copyBefore.sha256, files: copyBefore.files, bytes: copyBefore.bytes, problems: copyBefore.problems },
      expect: expectOk ? expectSha : null,
      verify: {
        exit: verify.exit,
        ok: verify.json?.ok ?? null,
        equal: verify.json?.equal ?? null,
        is_that_commit: verify.json?.is_that_commit ?? null,
        live: verify.json?.live ?? null,
        missing_fields: missingFields(verify.json, VERIFY_FIELDS),
        json_error: verify.json_error ?? null,
        stderr: String(verify.stderr).slice(0, 300),
      },
      note: 'before 在导出之后立刻量；after 在全部判据跑完之后量 —— 两次相同 ⇒ 这一轮没有往副本里写东西',
    }
    if (!copyBefore.ok) {
      push('CPY-COPY-FINGERPRINT', `副本的 CODE 指纹量不出来（${(copyBefore.problems ?? []).join(' / ').slice(0, 300)}）—— 没有它，"副本没被动过"就没有读数`)
    }
    if (verify.json === null || readings.copy_equal.verify.missing_fields.length > 0) {
      push('CPY-VERIFY-SURFACE',
        `导出器的 \`--verify\` 没有给出可解析的读数（exit=${verify.exit} · 缺字段 ${JSON.stringify(readings.copy_equal.verify.missing_fields)} · `
        + `stderr=${JSON.stringify(String(verify.stderr).slice(0, 240))}）—— "副本前后逐字不变"这一格判不了`)
    } else if (verify.json.equal !== true) {
      push('CPY-VERIFY-NOT-EQUAL',
        `导出器对副本复算的 \`equal\` 不是 \`true\`（实得 ${JSON.stringify(verify.json.equal)} · expect=${expectSha.slice(0, 16)}…）—— `
        + '副本的字节在这一轮里不是原来那一份（`F-160` 的 equal 口径：量在副本上，不量活树）')
    }
    // 第二个读者：导出器自己的 `--verify --with-staging` 也必须认"副本 = 提交 + 声明的追加"。
    // 它和上面 `verifyCopyIsCommit()` 是两条独立的路（一条读副本字节 + 声明层清单；一条读导出器自己的账），
    // 两个都 ok 才叫"副本就是那个提交"（`cand-20261016-selfsourced-order-01` 的反面：两份来源互相对账）。
    if (verify.json !== null && verify.json.ok === true && verify.json.is_that_commit?.ok !== true) {
      push('CPY-VERIFY-NOT-THAT-COMMIT',
        '导出器自己复算的 `is_that_commit.ok` 不是 `true`（'
        + JSON.stringify(verify.json.is_that_commit ?? null).slice(0, 300) + '）—— 和 `verifyCopyIsCommit()` 的结论打架：'
        + '同一个 `--with-staging` 声明，两条路必须都认这份副本')
    }

    // ── ⑤b' **清单自洽**（技术评审 2026-11-03 `F8`）──────────────────────────────
    /**
     * `--staging-manifest` 的三个数（`files` / `bytes` / `digest`）必须与它**自己那份 `list`** 对得上。
     * 病：`readStagingManifest` 只逐条校验条目形状、不校验清单自洽 ⇒ 一份被截断的清单
     * （`list` 3 条、`files` 却写着别的数）会被当成"声明了那一份数"照收，而"拿导出那一刻的清单核副本"这句话
     * 就变成了"信任何一份 JSON"。
     * 正反两侧各跑一次**真校验**（同一份副本、同一个 `--expect`；校验是只读的）：
     *   · **正样本**：导出那一刻记下的那份 JSON **原样** ⇒ 必须照收 —— 没有它，下面那条红不成立
     *     （红了可能只是"这条路本来就不通"）；
     *   · **负样本**：同一份 JSON、把 `files` / `bytes` / `digest` 各改一处 ⇒ 必须拒，且**三个不符项
     *     都要被点名**（只修一个的人要看得见另外两个还在）。
     */
    if (expectOk) {
      const manifestDir = ensureDir(path.join(runRoot(), 'tmp', 'cpy01-manifest'))
      const goodManifest = path.join(manifestDir, 'export-as-is.json')
      writeJson(goodManifest, exp.json)
      const badJson = JSON.parse(JSON.stringify(exp.json))
      const declaredFiles = badJson?.staging?.sha256?.files ?? null
      badJson.staging.sha256.files = 3
      badJson.staging.sha256.bytes = 1
      badJson.staging.sha256.digest = '0'.repeat(64)
      const badManifest = path.join(manifestDir, 'export-truncated.json')
      writeJson(badManifest, badJson)
      const verifyWith = (file) => runVerify({
        exporter: exporter.file, copy: copyRoot, repo: PATHS.repo, commit, expect: expectSha,
        withStaging: true, stagingManifest: file,
      })
      const goodRun = verifyWith(goodManifest)
      const badRun = verifyWith(badManifest)
      const badProblems = Array.isArray(badRun.json?.is_that_commit?.problems) ? badRun.json.is_that_commit.problems : []
      const named = ['files', 'bytes', 'digest'].filter((k) => badProblems.some((p) => String(p).includes(`${k} 声明`)))
      readings.manifest_selfcheck = {
        good: {
          manifest: goodManifest, exit: goodRun.exit, ok: goodRun.json?.ok ?? null,
          equal: goodRun.json?.equal ?? null, is_that_commit_ok: goodRun.json?.is_that_commit?.ok ?? null,
          json_error: goodRun.json_error ?? null,
        },
        bad: {
          manifest: badManifest, exit: badRun.exit, ok: badRun.json?.ok ?? null,
          equal: badRun.json?.equal ?? null, is_that_commit_ok: badRun.json?.is_that_commit?.ok ?? null,
          json_error: badRun.json_error ?? null,
          problems: badProblems.slice(0, 4),
        },
        tampered: { declared_files_was: declaredFiles, files: 3, bytes: 1, digest: `${'0'.repeat(8)}…` },
        named_inconsistencies: named,
        note: '正样本（原样清单）必须照收；负样本（files/bytes/digest 各改一处）必须拒，且三个不符项都被点名',
      }
      if (goodRun.json === null || goodRun.json?.ok !== true) {
        const goodProblems = Array.isArray(goodRun.json?.is_that_commit?.problems) ? goodRun.json.is_that_commit.problems : []
        push('CPY-MANIFEST-CONTROL',
          `导出那一刻记下的那份清单（原样交给 \`--staging-manifest\`）被拒了：exit=${goodRun.exit} · `
          + `ok=${JSON.stringify(goodRun.json?.ok ?? null)} · ${JSON.stringify(goodProblems.slice(0, 2))} —— `
          + '这一条是控制面的**起点**：它不绿，"改动过的清单必须被拒"那条红就不说明任何事')
      }
      if (badRun.json === null || badRun.json?.ok !== false) {
        push('CPY-MANIFEST-SELFCHECK',
          `一份 \`files\`/\`bytes\`/\`digest\` 与它自己那份 \`list\` 对不上的清单被**照收**了`
          + `（ok=${JSON.stringify(badRun.json?.ok ?? null)} · exit=${badRun.exit}）—— `
          + '`readStagingManifest` 只校验条目形状、不校验清单自洽（`F8`）：一份被截断的清单会变成"声明了 N 份"')
      } else if (named.length !== 3) {
        push('CPY-MANIFEST-SELFCHECK',
          `被改过的清单确实红了，但没有把三个不符项**都**点名（点到 ${JSON.stringify(named)}）：`
          + `${JSON.stringify(badProblems.slice(0, 3))} —— 三个数各自承重，只报一个会让"另外两个还没修"看不见（\`F8\`）`)
      }
    }

    // ── ⑥ 判据：套件要的四条输入，副本里有没有、是不是副本自己的、是不是活树那一份 ────────
    const inCopy = REQUIRED.map(([rel, why]) => {
      const file = path.join(copyRoot, STAGING_REL, ...rel.split('/'))
      const live = path.join(PATHS.repo, STAGING_REL, ...rel.split('/'))
      const present = existsSync(file)
      const livePresent = existsSync(live)
      const sha = present ? sha256Of(file) : null
      const liveSha = livePresent ? sha256Of(live) : null
      return {
        rel: `${STAGING_REL.replace(/\\/g, '/')}/${rel}`,
        abs: file,
        live_abs: live,
        why,
        present,
        live_present: livePresent,
        // ⚠️ 只有"在"才谈得上方不在副本里；不在的那条由 `present:false` 说，别让它同时报两条。
        escapes_copy: present ? escapes(copyRoot, file) : null,
        bytes: present ? statSync(file).size : null,
        sha256: sha,
        live_sha256: liveSha,
        // 两向都"在"才谈得上相同；缺的那一侧由上面两个 flag 说。
        same_as_live: present && livePresent ? sha === liveSha : null,
      }
    })
    readings.required = inCopy
    readings.live_staging = {
      root: path.join(PATHS.repo, STAGING_REL),
      exists: existsSync(path.join(PATHS.repo, STAGING_REL)),
      files: countFiles(path.join(PATHS.repo, STAGING_REL)),
    }
    readings.gap = {
      missing_in_copy: inCopy.filter((item) => !item.present).map((item) => item.rel),
      differs_from_live: inCopy.filter((item) => item.same_as_live === false).map((item) => item.rel),
      staging_paths_in_commit: readings.commit_tree.staging_paths,
      commit: commit.slice(0, 12),
      note: '提交里 `.tools/_staging` 下的路径数 = 0（那一层被 .gitignore 挡着）；'
        + '副本要自足，只能靠导出器 `--with-staging` 把活树那一层带进来，且必须与活树逐字节相同。',
    }

    for (const item of inCopy) {
      if (!item.present) {
        push('CPY-STAGING-NOT-IN-COPY',
          `只读副本里没有 \`${item.rel}\`（找的是 ${item.abs}）—— 副本原地跑 \`run-all.mjs\` 就卡在这一条上`
          + `（它的用处：${item.why}）。`
          + `提交 ${commit.slice(0, 12)} 里 \`.tools/_staging\` 下的路径 ${readings.commit_tree.staging_paths} 份`
          + `，而副本里声明的追加命中 ${readings.declared_staging.in_copy} / 活树 ${readings.declared_staging.live_paths} 份`
          + '（导出器 `--with-staging` 要么没开、要么没把它带上）⇒ 副本**不自足**（`ticket-20261102-03`）',
          { rel: item.rel, abs: item.abs })
      } else if (item.escapes_copy === true) {
        push('CPY-STAGING-ESCAPES-COPY',
          `副本里的 \`${item.rel}\` ${item.abs} 解析之后**不在副本之下**（指向副本外，很可能是活树的 junction / 符号链接）—— `
          + '那样"副本原地能跑"就变成了"副本借活树的输入能跑"，与"不读活树"直接冲突')
      } else if (item.same_as_live === false) {
        push('CPY-STAGING-DIFFERS-LIVE',
          `副本里的 \`${item.rel}\` 与活树那一份**不是同一份**（副本 ${item.bytes} B · sha256 ${String(item.sha256).slice(0, 16)}… / `
          + `活树 ${statSync(item.live_abs).size} B · sha256 ${String(item.live_sha256).slice(0, 16)}…）—— `
          + '副本里睡着一份过期输入，"副本原地跑"跑的不是现在这一套（`ticket-20261102-03`）',
          { rel: item.rel, copy: item.sha256, live: item.live_sha256 })
      }
    }

    // ── ⑥b 判据读的那几份文件，**都从副本里读**（不是从活树借）──────────────────
    const judgedUnderCopy = inCopy.filter((item) => item.present && item.escapes_copy === false).length
    readings.authorship.judged_files = inCopy.map((item) => ({ rel: item.rel, under_copy: item.present && item.escapes_copy === false }))
    readings.authorship.judged_files_under_copy = `${judgedUnderCopy}/${inCopy.length}`
    if (judgedUnderCopy !== inCopy.length) {
      push('CPY-COPY-NOT-SELFROOT',
        `四条必需输入里只有 ${judgedUnderCopy}/${inCopy.length} 条是从**副本自己**读到的（其余解析到了副本之外）—— `
        + '那几格量的不是这份副本')
    }

    // ── ⑦ 收口：副本在这一轮里没被动过（`equal` 的第二半 + 份数）─────────────────────
    const copyFilesAfter = countFiles(copyRoot)
    const copyAfter = fingerprintTool(copyRoot, { repo: PATHS.repo })
    readings.copy_equal.after_files = copyFilesAfter
    readings.copy_equal.after = { ok: copyAfter.ok, sha256: copyAfter.sha256, files: copyAfter.files, bytes: copyAfter.bytes }
    readings.copy_equal.equal = copyBefore.ok && copyAfter.ok
      && String(copyBefore.sha256 ?? '').toLowerCase() === String(copyAfter.sha256 ?? '').toLowerCase()
    readings.copy_equal.files_equal = copyFilesBefore === copyFilesAfter
    if (!readings.copy_equal.equal) {
      push('CPY-COPY-CHANGED',
        `副本在这一轮里被改过：CODE 指纹 before ${String(copyBefore.sha256).slice(0, 16)}… / after ${String(copyAfter.sha256).slice(0, 16)}…`
        + `（份数 ${copyFilesBefore} → ${copyFilesAfter}）—— 副本必须是只读的：谁往里写（运行根 / 探针 / 缓存），`
        + '那次"副本里跑出来的绿"就不在原来那份字节上（`F-160` 的 equal 口径）')
    } else if (!readings.copy_equal.files_equal) {
      push('CPY-COPY-CHANGED',
        `副本的文件份数变了（${copyFilesBefore} → ${copyFilesAfter}）而 CODE 指纹没变 —— 写进来的东西落在 CODE 排除表里`
        + '（例如 `.runtime/`）：那也算往副本里写了东西，副本不再"只读"')
    }

    caseFail(problems)
  })
})
