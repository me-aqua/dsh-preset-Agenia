/**
 * `CPY-01` · **只读副本原地跑得动套件吗**（长期票 `ticket-20261102-03` · 技术评审 2026-11-02 `F2`）。
 *
 * 病根（评审原话）：只读副本原地跑不动检查器（staging 被 gitignore）——「124/124」量的是**活树**。
 * 契约（这一格钉的那一句）：**一个由 `.tools/tree-at-commit.mjs --with-staging` 在某个提交上导出的副本，
 * 要自足到能原地跑套件：提交里的文件逐字节都在、多出来的只有那 52 份"声明的追加"
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
 * 导出器带 `--with-staging` 时，副本 = 提交里的 164 份 **+** `.tools/_staging/agenia-upgrade/{preset,oracle}`
 * 这 **52 份**（活树那一层，`.gitignore` 挡着、不在提交里）。判定两向钉死：
 *   · 提交里的 164 份：少一份 / 字节不同 ⇒ 红（**子集核对**；不要求"副本里只有这些"）；
 *   · 多出来的：只准是那 52 条路径，且每一条与活树逐字节相同；多出任何一条别的 ⇒ 红。
 * 为什么不是"副本必须与提交逐字相同"：那样 `--with-staging` 一开就必然红（副本"多"了 52 份），
 * 而"副本自足"要的正是这 52 份（`support/tree-at-commit.mjs` 的 `STAGING_ADDITION` 是唯一写法）。
 *
 * ── 今天的量（2026-11-02 23:36 现量）──────────────────────────────────────────
 * `.tools/_staging/` 在 `.gitignore` 里，`git ls-tree -r HEAD` 里 `.tools/_staging` 下的路径 **0 份**；
 * 导出器已有 `--with-staging` ⇒ 副本 = **216 份**（提交 164 + 活树那 52 份追加），
 * 四条必需输入与活树逐字节相同 ⇒ 这一格**绿**。
 *
 * ── 什么会把它弄红（四种形状，各自一个红因码）──────────────────────────────────
 *   · 导出器不认这个开关 / 导出失败 ⇒ `CPY-EXPORT-STAGING`（红在**工具那一半**，不是副本缺件）；
 *   · 副本里缺一条必需输入 ⇒ `CPY-STAGING-NOT-IN-COPY`（点名绝对路径 + 声明的追加命中几条）；
 *   · 副本里的与活树不是同一份 ⇒ `CPY-STAGING-DIFFERS-LIVE`（副本里睡着一份过期输入）；
 *   · 副本解析后不在副本之下（链接 / junction）⇒ `CPY-STAGING-ESCAPES-COPY`；
 *     声明之外的"多一份"、以及任何链接，由 `verifyCopyIsCommit()` 报 `CPY-EXPORT-FIXTURE`。
 * 判据不关心导出器内部怎么拷贝（`REQUIRED` 里没有"怎么来的"，只有"在不在、在不在副本里、是不是同一份"）。
 *
 * ── 量的是哪棵树（口径）──────────────────────────────────────────────────────
 * 副本 = `runExport()`（真子进程跑 `.tools/tree-at-commit.mjs --commit <HEAD> --with-staging`）落出来的树；
 * `verifyCopyIsCommit({ declared: [STAGING_ADDITION] })` 逐份拿 `git blob` SHA-1 对账提交那 164 份、
 * 再拿 sha256 对账那 52 份声明的追加 ⇒ **判据量的确实是那个提交的副本**，不是"某个目录"
 * （`cand-20261019-0033`：证据件必须自报它量的是哪一版）。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import {
  EXPORT_FIELDS, STAGING_ADDITION, declaredAdditionPaths, git, lsTreeBlobs, exporterPath, missingFields,
  runExport, verifyCopyIsCommit,
} from '../support/tree-at-commit.mjs'
import { PATHS } from '../support/env.mjs'

before(() => {
  preflight()
})

const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

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

    // ── ④ 导出副本（落在运行根里；`.team/` 不在 CODE 名单里，不会把这条写进读数）──────
    // `withStaging` ⇒ 导出器要把声明的追加（活树那 52 份）一起带进副本；没有它，副本永远缺输入。
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
        + ' —— 这一格判的是"副本带不带那 52 份声明的追加"；导出器不认这个开关就产不出那种副本，'
        + '现在红在**工具那一半**（`ticket-20261102-03` 的实现侧），不是副本缺件')
      return caseFail(problems)
    }

    /**
     * ⑤ 量具自证：**副本就是那个提交**（+ 恰好那 52 份声明的追加）。
     * 判定两向钉死：提交那 164 份子集核对；多出来的只准是声明的追加，且与活树逐字节相同。
     */
    const isThatCommit = verifyCopyIsCommit({ repo: PATHS.repo, commit, copyRoot, declared: [STAGING_ADDITION] })
    readings.copy_is_commit = {
      ok: isThatCommit.ok,
      files: isThatCommit.actual.length,
      missing: isThatCommit.missing.slice(0, 5),
      extra: isThatCommit.extra.length,
      undeclared_extra: (isThatCommit.undeclared_extra ?? []).slice(0, 5),
      declared: isThatCommit.declared ?? null,
      problems: isThatCommit.problems.slice(0, 5),
    }
    if (!isThatCommit.ok) {
      push('CPY-EXPORT-FIXTURE', `导出的副本不是"提交 ${commit.slice(0, 12)} + 声明的追加"（${isThatCommit.problems.slice(0, 3).join(' / ')}）—— 先修导出，再判"副本够不够用"`)
      return caseFail(problems)
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
    readings.declared_staging = {
      dirs: STAGING_ADDITION.dirs,
      prefix: STAGING_ADDITION.prefix,
      live_paths: declaredAdditionPaths(PATHS.repo, STAGING_ADDITION).length,
      in_copy: isThatCommit.declared?.in_copy ?? null,
      missing: isThatCommit.declared?.missing ?? null,
      mismatched: isThatCommit.declared?.mismatched ?? null,
    }
    readings.gap = {
      missing_in_copy: inCopy.filter((item) => !item.present).map((item) => item.rel),
      differs_from_live: inCopy.filter((item) => item.same_as_live === false).map((item) => item.rel),
      staging_paths_in_commit: readings.commit_tree.staging_paths,
      commit: commit.slice(0, 12),
      note: '提交里 `.tools/_staging` 下的路径数 = 0（那一层被 .gitignore 挡着）；'
        + '副本要自足，只能靠导出器 `--with-staging` 把活树那 52 份带进来，且必须与活树逐字节相同。',
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

    caseFail(problems)
  })
})
