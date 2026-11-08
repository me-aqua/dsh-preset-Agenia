/**
 * `MCR-01` · **`F-166`** —— `tree-at-commit --out` 落在**被测 CODE 名单**里时，必须在**任何写之前**拒。
 *
 * 病根（技术评审 2026-10-30 `F2`；仲裁在 `.team/leader/2026-11-07/定形-batch8.md` §一 #1）：
 * 副本要是落在被测树里，导出自己写下的每一份文件都会被下一次 `--verify` 算成"动了"，
 * 而那条"动了"会挂在别人头上 —— 一条查不出是谁的假红。老工具只在 `--verify` 里报形状，
 * **导出这一侧一个字节都不拦**；`--live-baseline` 早就有对称的拒（`E_BASELINE_IN_CODE`）。
 *
 * 判据（四格，一格一条，各自能单独翻面）：
 *   ① **拒**：`--out` 指向被测 CODE 集里的落点 ⇒ 非零退出 + 码 **`E_OUT_INSIDE_AUDITED`**
 *      （不是 `REFUSE-OVERWRITE` —— 那一族是"目录已有东西"，与"落点在 CODE 集里"是两件事）；
 *      报文必须点名**落点**、**它下面的探针**（`__agenia_probe__`）与**被测根**。
 *      **四个落点**（2026-11-07 评审 `M2` + 第 2 轮 `M-2a` 之后）：
 *      **新目录** · **名字以 `.pyc` 结尾的落点**（它自己被后缀规则排除、里面的文件不排除）·
 *      **落点的 junction 别名**（前缀看着在根外、`realpath` 之后在根内）·
 *      **`--repo` 与 `--out` 都走同一个 junction 别名**（两侧只有词法形态时前缀判据根本不成立 ⇒
 *      连尺子都不问；报文要同时点名**两个规范形态**）。
 *   ② **拒在任何写之前**：被测根跑前 / 跑后**逐字节**同哈希（`treeHash`）+ **路径集合**同（`treePaths`）
 *      + 那个 `--out` **没有被创建**（**每一个**被拒的落点都判一次）。⚠️ 这一格是"拒在写之前"的
 *      **唯一**证据：只判退出码的话，"先写一半再拒"照样绿。
 *   ③ **负对照（四条都成功）**：`--out` 指到被测根**之外**（目录 / `.pyc` 两种）⇒ 写出、`code.sha256`
 *      = 从 git 对象独立算的 CODE 指纹；`--out` 指进被测根的 **`.team/`**（目录 / `.pyc` 两种，
 *      排除表挡住 ⇒ 不在 CODE 集）⇒ 同样成功。这四条是"拒的是 **CODE 集**、不是'名字以 .pyc 结尾'"的阳性对照。
 *   ④ **判定归尺子**：`.tools/fingerprint.mjs --is-code <abs> --root <root> --json` 是不写盘的一次查询；
 *      **八个落点**各问一次：CODE 内（落点 / 子路径）· `.team/` 内（落点 / 子路径）· 根外（落点 / 子路径）·
 *      `.pyc` 落点**自己**（`false`）与**它的子路径**（`true` —— `M2` 的洞就在这里）。
 *      这一格证明"算不算 CODE"只有**一份排除表**（工具那一份），工具里不复制第二张。
 *
 * 刀（退化刀，同格）：把导出器拷进运行根、只把 `if (asked.code === true) {`
 *   改成 `if (false) {` ⇒ **同一个输入**必须 `exit 0` 并把副本写进被测树（= ① 会红）。
 *   锚点找不到 / 命中不是 1 处 ⇒ `KNIFE-ANCHOR`（判据自己的刀钝了，不许静默绿）。
 *   ⚠️ 2026-11-08 换锚：生产侧加了 fail-closed 的 `if (asked === null) { return fail(…) }`（见 ⑤），
 *   旧锚 `if (asked !== null && asked.code === true) {` 已经不存在。**锚必须落在 `asked.code === true` 那一行**：
 *   刀喂的同一个输入里尺子是**好的**（`asked` 非空），`asked === null` 那一支根本不参与 ——
 *   把锚落到它上面，这一刀就切不到"这次拒"了（会变成 `KNIFE-NO-BITE`，而不是"翻面"）。
 *
 * ⑤ **尺子跑不动 ⇒ 拒 + 零写入**（2026-11-08 补；技术评审 11-07 `F5` 的**那一侧**）：
 *   `askIsCode` 以前在尺子失败时只印一句"这一条不拒"并 `return null`，调用方又不拒 ⇒ **fail-open**：
 *   尺子跑不动时副本照样写进被测树。这一格喂**同一个"落在被测树里"的落点** + **一把坏尺子**
 *   （导出器副本旁边的 `fingerprint.mjs` 恒 `exit 3`）⇒ 必须 `E_OUT_NOT_MEASURABLE` + 落点没创建 +
 *   被测树逐字节/路径集合不变。阳性对照：坏尺子自己 `--is-code` 必须 `exit 3`（否则"拒"可能来自别处）。
 *   ⚠️ 这一格与 ① 是**两侧**：① 是"尺子说在 CODE 集里 ⇒ 拒"，⑤ 是"尺子说不出话 ⇒ 也拒"。
 *   只判 ① 的实现正是这次 P1 的形状（`F-166` 名义上在、真故障时放行）。
 *
 * 🔴 覆盖边界（这一格**不判**什么）：
 *   · 不判"`--is-code` 自己判断得对不对"（那是 `fingerprint.mjs` 的排除表；这里只判三个已知落点）；
 *   · 不判 `--out` 指进 `.git`（老 `REFUSE-OVERWRITE` 那一支，早就有人守）；
 *   · 不判"拒的报文措辞好不好读"（只点名"落点 + 被测根"两样在不在）。
 */
import { before, describe, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runRoot, treeHash, treePaths } from '../support/evidence.mjs'
import {
  buildFixtureRepo, codeDigestOfCommit, exporterPath, runExport, verifyCopyIsCommit,
} from '../support/tree-at-commit.mjs'

before(() => {
  preflight()
})

/** 一次 `fingerprint.mjs --is-code`（不写盘的查询）。失败 ⇒ `{ok:false, problems}`，调用方点名红。 */
function isCodeProbe(tool, abs, root) {
  const r = spawnSync(process.execPath, [tool, '--is-code', abs, '--root', root, '--json'], {
    encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  })
  const line = String(r.stdout ?? '').trim().split('\n').filter((l) => l.trim() !== '').pop() ?? ''
  let json = null
  try { json = JSON.parse(line) } catch { json = null }
  return { exit: r.status, json, stdout: String(r.stdout ?? '').slice(-400), stderr: String(r.stderr ?? '').slice(-400) }
}

describe('integration · measuring/copy (MCR) · F-166 副本不许落在被测 CODE 集里', () => {
  test('MCR-01 --out 落在被测 CODE 名单里 ⇒ 写之前拒；指到根外 / .team/ ⇒ 成功；尺子坏了也拒（刀 + 坏尺子两格）', async () => {
    await runCase('MCR-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const root = runRoot()

      const ex = exporterPath()
      rec.readings.exporter = { file: ex.file, exists: ex.exists, source: ex.source }
      if (!ex.exists) {
        push('EXPORTER-MISSING', `导出器不在：${ex.file}（来源 ${ex.source}）—— 这一格判不了"拒在写之前"（没有可拒的那条路）`)
        caseFail(problems)
        return
      }

      // ── 夹具：一个真的有 `.git` 的仓库（`--out` 的判定要看仓库根，不能拿纯树冒充）──
      const fx = buildFixtureRepo(root, 'mcr01')
      rec.readings.fixture = { repo: fx.repo, commit: fx.commitA, files_A: fx.filesA }
      const audited = fx.repo
      const beforeTree = treeHash(audited)
      const beforePaths = treePaths(audited)
      rec.readings.audited_tree = {
        before: { sha256: beforeTree.sha256, count: beforeTree.count },
        paths_before: beforePaths.count,
      }

      // ── ① 拒：`--out` 落在被测 CODE 集里 —— 四个落点，**每个都要"写之前拒"** ────────────
      /**
       * 🔴 四个落点各自堵一条"看起来不算 CODE / 看起来在根外"的写法（2026-11-07 评审 `M2` / 第 2 轮 `M-2a`）：
       *   1. **新目录** `<repo>/presets/agenia/_probe_copy_mcr01` —— 最朴素的那种；
       *   2. **名字以 `.pyc` 结尾的落点** `<repo>/presets/agenia/_probe.pyc` —— 它**自己被排除表挡住**
       *      （`*.pyc` 那条后缀），可它**里面**的文件不排除 ⇒ 出口必须问"它下面的文件算不算"；
       *   3. **落点的 junction 别名**：`<runRoot>/fixtures/mcr01-alias` → `<repo>/presets`，
       *      `--out <别名>/agenia/_probe_copy_alias` —— 路径前缀看着在根外，`realpath` 之后在根内
       *      ⇒ 落点这一侧必须先规范化再问；
       *   4. **`--repo` 与 `--out` 都走同一个 junction 别名**（`M-2a` 的那一对）：
       *      `--repo <别名→repo>` + `--out <别名>\presets\agenia\_probe_copy3`
       *      —— 两侧只有词法形态时前缀判据**根本不成立**（连尺子都不问），副本就写进被测树了
       *      ⇒ 两侧必须在**同一个坐标系**里比（`repoCanon` / `outCanon`），报文要同时点名**两个规范形态**。
       */
      const junctionRoot = path.join(root, 'fixtures', 'mcr01-alias')
      let aliasReady = null
      try {
        symlinkSync(path.join(audited, 'presets'), junctionRoot, 'junction')
        aliasReady = { link: junctionRoot, target: path.join(audited, 'presets'), ok: true }
      } catch (err) {
        aliasReady = { link: junctionRoot, target: path.join(audited, 'presets'), ok: false, error: `${err.code ?? ''} ${String(err.message).slice(0, 160)}` }
      }
      rec.readings.junction_alias = aliasReady
      const repoAlias = path.join(root, 'fixtures', 'mcr01-repo-alias')
      let repoAliasReady = null
      try {
        symlinkSync(audited, repoAlias, 'junction')
        repoAliasReady = { link: repoAlias, target: audited, ok: true }
      } catch (err) {
        repoAliasReady = { link: repoAlias, target: audited, ok: false, error: `${err.code ?? ''} ${String(err.message).slice(0, 160)}` }
      }
      rec.readings.repo_junction_alias = repoAliasReady
      const refusedCases = [
        {
          id: 'fresh-dir', repo: audited,
          out: path.join(audited, 'presets', 'agenia', '_probe_copy_mcr01'),
          canonicalOut: path.join(audited, 'presets', 'agenia', '_probe_copy_mcr01'),
          mustName: ['_probe_copy_mcr01', '__agenia_probe__'], mustRoots: [audited],
        },
        {
          id: 'pyc-named-landing', repo: audited,
          out: path.join(audited, 'presets', 'agenia', '_probe.pyc'),
          canonicalOut: path.join(audited, 'presets', 'agenia', '_probe.pyc'),
          mustName: ['_probe.pyc', '__agenia_probe__'], mustRoots: [audited],
        },
        ...(aliasReady.ok
          ? [{
              id: 'out-junction-alias', repo: audited,
              out: path.join(junctionRoot, 'agenia', '_probe_copy_alias'),
              canonicalOut: path.join(audited, 'presets', 'agenia', '_probe_copy_alias'),
              mustName: ['_probe_copy_alias', '__agenia_probe__'], mustRoots: [audited],
            }]
          : []),
        ...(repoAliasReady.ok
          ? [{
              id: 'repo-and-out-junction (M-2a)', repo: repoAlias,
              out: path.join(repoAlias, 'presets', 'agenia', '_probe_copy3'),
              canonicalOut: path.join(audited, 'presets', 'agenia', '_probe_copy3'),
              mustName: ['_probe_copy3', '__agenia_probe__'], mustRoots: [audited, repoAlias],
            }]
          : []),
      ]
      const refusedReadings = []
      for (const c of refusedCases) {
        const r = runExport({ exporter: ex.file, repo: c.repo, commit: fx.commitA, out: c.out })
        const code = r.json?.error?.code ?? null
        const msg = String(r.json?.error?.message ?? '')
        const afterTree = treeHash(audited)
        const afterPaths = treePaths(audited)
        const pathsEqual = afterPaths.count === beforePaths.count && afterPaths.paths.every((p, i) => p === beforePaths.paths[i])
        const reading = {
          id: c.id, repo: c.repo, out: c.out, canonical_out: c.canonicalOut, exit: r.exit, code, message: msg.slice(0, 800),
          stderr: String(r.stderr ?? '').slice(-400),
          audited_equal: afterTree.sha256 === beforeTree.sha256,
          audited_paths_equal: pathsEqual,
          out_created: existsSync(c.out) || existsSync(c.canonicalOut),
          names_landing: c.mustName.every((n) => msg.includes(n)),
          names_roots: c.mustRoots.map((root) => ({ root, named: msg.includes(root) })),
          folded_into_overwrite: code === 'REFUSE-OVERWRITE',
        }
        refusedReadings.push(reading)
        if (r.exit === 0) {
          push('REFUSE-NOT-REFUSED', `[${c.id}] \`--out\` 落在被测 CODE 集里（${c.out}）竟然 exit 0 —— 副本会写进被测树，下一次 --verify 会把导出自己写下的文件算成"动了"`)
        } else if (code !== 'E_OUT_INSIDE_AUDITED') {
          push('REFUSE-WRONG-CODE', `[${c.id}] 应报 \`E_OUT_INSIDE_AUDITED\`，实得 ${JSON.stringify(code)}（stderr：${String(r.stderr ?? '').trim().slice(0, 240)}）`)
        }
        if (reading.folded_into_overwrite) {
          push('REFUSE-FOLDED-INTO-OVERWRITE', `[${c.id}] 这条拒被折进了 \`REFUSE-OVERWRITE\`（"目录已有东西"）—— 两件事必须两个码：一个是"落点已有内容"，一个是"落点本身在被测 CODE 名单里"`)
        }
        if (r.exit !== 0 && msg !== '' && !reading.names_landing) {
          push('REFUSE-MESSAGE-NO-LANDING', `[${c.id}] 拒的报文没有把落点和"它下面的探针"都点名（要 ${JSON.stringify(c.mustName)}）：${msg.slice(0, 300)}`)
        }
        if (r.exit !== 0 && msg !== '' && reading.names_roots.some((x) => !x.named)) {
          push('REFUSE-MESSAGE-NO-ROOT', `[${c.id}] 拒的报文没有点名这些根：${JSON.stringify(reading.names_roots.filter((x) => !x.named).map((x) => x.root))}（全文：${msg.slice(0, 300)}）`)
        }
        if (!reading.audited_equal) {
          push('REFUSE-WROTE-BEFORE', `[${c.id}] 被拒之后被测根**变了**（${beforeTree.count} 份/${String(beforeTree.sha256).slice(0, 16)}… → ${afterTree.count} 份/${String(afterTree.sha256).slice(0, 16)}…）—— "拒在任何写之前"不成立：先写了再拒也是拒`)
        }
        if (!reading.audited_paths_equal) {
          push('REFUSE-WROTE-PATHS', `[${c.id}] 被拒之后被测根的**路径集合**变了（${beforePaths.count} → ${afterPaths.count} 条）—— 有东西被创建/删除了`)
        }
        if (reading.out_created) {
          push('REFUSE-CREATED-OUT', `[${c.id}] 被拒了，但落点（或它的规范形态）已经被创建：${c.out} / ${c.canonicalOut} —— 拒必须发生在**第一个字节**之前`)
        }
      }
      const afterTree = treeHash(audited)
      const afterPaths = treePaths(audited)
      rec.readings.out_inside_audited = refusedReadings
      rec.readings.audited_tree.after = { sha256: afterTree.sha256, count: afterTree.count }
      rec.readings.audited_tree.paths_after = afterPaths.count
      rec.readings.audited_tree.equal = afterTree.sha256 === beforeTree.sha256
      rec.readings.audited_tree.paths_equal = afterPaths.count === beforePaths.count && afterPaths.paths.every((p, i) => p === beforePaths.paths[i])
      rec.readings.audited_tree.outs_created = refusedReadings.filter((r) => r.out_created).map((r) => r.out)

      // ── ③ 负对照：根外 ⇒ 成功；被测根的 `.team/`（排除表挡住）⇒ 也成功 ──────────
      const commitDigest = codeDigestOfCommit(fx.repo, fx.commitA)
      rec.readings.commit_code = { ok: commitDigest.ok, sha256: commitDigest.sha256, files: commitDigest.files }
      const outOutside = path.join(root, 'fixtures', 'mcr01-outside', 'tree-at-a')
      const expOutside = runExport({ exporter: ex.file, repo: fx.repo, commit: fx.commitA, out: outOutside })
      const outsideIdentity = expOutside.exit === 0 && existsSync(outOutside)
        ? verifyCopyIsCommit({ repo: fx.repo, commit: fx.commitA, copyRoot: outOutside })
        : null
      rec.readings.positives = {
        outside: {
          out: outOutside, exit: expOutside.exit, ok: expOutside.json?.ok ?? null,
          code: expOutside.json?.code ?? null, stderr: String(expOutside.stderr ?? '').slice(-300),
          identity: outsideIdentity === null ? null : { ok: outsideIdentity.ok, files: outsideIdentity.actual.length, problems: outsideIdentity.problems.slice(0, 4) },
        },
      }
      if (expOutside.exit !== 0 || expOutside.json === null) {
        push('POSITIVE-OUTSIDE-FAILED', `\`--out\` 指到被测根之外（${outOutside}）应当成功，却 exit=${expOutside.exit}：${String(expOutside.stderr ?? '').trim().slice(0, 240)}`)
      } else {
        if (expOutside.json.ok !== true) push('POSITIVE-OUTSIDE-FAILED', `根外导出的读数 \`ok\` 不是 true：${JSON.stringify(expOutside.json.ok)}`)
        if (!commitDigest.ok || String(expOutside.json.code?.sha256 ?? '').toLowerCase() !== commitDigest.sha256) {
          push('POSITIVE-OUTSIDE-CODE', `根外导出的 \`code.sha256\` ${String(expOutside.json.code?.sha256 ?? '').slice(0, 12)}… ≠ 从 git 对象独立算的 ${String(commitDigest.sha256).slice(0, 12)}…（"成功写出"必须是一份**对**的副本）`)
        }
        if (outsideIdentity !== null && !outsideIdentity.ok) {
          push('POSITIVE-OUTSIDE-IDENTITY', `根外副本不是提交 ${fx.commitA.slice(0, 12)}…：${outsideIdentity.problems.slice(0, 4).join('；')}`)
        }
      }

      const outInTeam = path.join(audited, '.team', 'probe_copy_mcr01')
      const expTeam = runExport({ exporter: ex.file, repo: fx.repo, commit: fx.commitA, out: outInTeam })
      rec.readings.positives.inside_team = {
        out: outInTeam, exit: expTeam.exit, ok: expTeam.json?.ok ?? null,
        error: expTeam.json?.error?.code ?? null, stderr: String(expTeam.stderr ?? '').slice(-300),
      }
      if (expTeam.exit !== 0 || expTeam.json === null || expTeam.json.ok !== true) {
        push('POSITIVE-INSIDE-TEAM-FAILED', `\`--out\` 指进被测根的 \`.team/\`（排除表挡着 ⇒ 不在 CODE 集）应当成功，却 exit=${expTeam.exit} / ${expTeam.json?.error?.code ?? '(无码)'} —— 这条拒的应当是"CODE 集"，不是"路径里有没有 repo"`)
      }
      /**
       * 🔴 **评审 `M2` 的两个正对照**（被测者自己给的读数，原样再跑一遍）：
       *   · 落点叫 `_p.pyc`、但在 `.team/` 下 ⇒ 排除表挡着 ⇒ 成功；
       *   · 落点叫 `x.pyc`、但在被测根之外 ⇒ 成功。
       * 这两条与"`.pyc` 落在 CODE 集里必须拒"是**同一把尺子的两个方向** —— 只判前者的实现
       * 会把所有 `.pyc` 落点都拒掉（过度拒绝），只判后者的实现会把这一格放过去。
       */
      const outTeamPyc = path.join(audited, '.team', 'leader', '_p.pyc')
      const expTeamPyc = runExport({ exporter: ex.file, repo: fx.repo, commit: fx.commitA, out: outTeamPyc })
      rec.readings.positives.pyc_under_team = {
        out: outTeamPyc, exit: expTeamPyc.exit, ok: expTeamPyc.json?.ok ?? null,
        error: expTeamPyc.json?.error?.code ?? null, stderr: String(expTeamPyc.stderr ?? '').slice(-300),
      }
      if (expTeamPyc.exit !== 0 || expTeamPyc.json?.ok !== true) {
        push('POSITIVE-INSIDE-TEAM-FAILED', `\`--out <repo>/.team/leader/_p.pyc\` 应当成功（`.team/` 在排除表里），却 exit=${expTeamPyc.exit} / ${expTeamPyc.json?.error?.code ?? '(无码)'} —— 拒的应当是"CODE 集里的文件"，不是"名字以 .pyc 结尾"`)
      }
      const outOutsidePyc = path.join(root, 'fixtures', 'mcr01-outside2', 'x.pyc')
      const expOutsidePyc = runExport({ exporter: ex.file, repo: fx.repo, commit: fx.commitA, out: outOutsidePyc })
      rec.readings.positives.pyc_outside = {
        out: outOutsidePyc, exit: expOutsidePyc.exit, ok: expOutsidePyc.json?.ok ?? null,
        error: expOutsidePyc.json?.error?.code ?? null, stderr: String(expOutsidePyc.stderr ?? '').slice(-300),
      }
      if (expOutsidePyc.exit !== 0 || expOutsidePyc.json?.ok !== true) {
        push('POSITIVE-OUTSIDE-FAILED', `\`--out <根外>/x.pyc\` 应当成功，却 exit=${expOutsidePyc.exit} / ${expOutsidePyc.json?.error?.code ?? '(无码)'} —— 根外落点一个都不该被这条闸拦`)
      }

      // ── ④ 判定归尺子：一次不写盘的查询，**落点与"它下面的探针"都问**（`M2`）──────────────
      const tool = path.join(PATHS.repo, '.tools', 'fingerprint.mjs')
      const probes = {
        inside_code: isCodeProbe(tool, path.join(audited, 'presets', 'agenia', '_probe_copy_mcr01'), audited),
        inside_code_child: isCodeProbe(tool, path.join(audited, 'presets', 'agenia', '_probe_copy_mcr01', '__agenia_probe__'), audited),
        inside_team: isCodeProbe(tool, path.join(audited, '.team', 'probe_copy_mcr01'), audited),
        inside_team_child: isCodeProbe(tool, path.join(audited, '.team', 'leader', '_p.pyc', '__agenia_probe__'), audited),
        pyc_landing: isCodeProbe(tool, path.join(audited, 'presets', 'agenia', '_probe.pyc'), audited),
        pyc_landing_child: isCodeProbe(tool, path.join(audited, 'presets', 'agenia', '_probe.pyc', '__agenia_probe__'), audited),
        outside: isCodeProbe(tool, path.join(root, 'fixtures', 'mcr01-outside', 'x'), audited),
        outside_child: isCodeProbe(tool, path.join(root, 'fixtures', 'mcr01-outside2', 'x.pyc', '__agenia_probe__'), audited),
      }
      rec.readings.is_code_probe = Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, {
        exit: v.exit, ok: v.json?.ok ?? null, code: v.json?.code ?? null, why: v.json?.why ?? null,
        abs: v.json?.abs ?? null, raw: v.json === null ? v.stdout : undefined,
      }]))
      const want = {
        inside_code: true,
        inside_code_child: true,
        inside_team: false,
        inside_team_child: false,
        /** 落点**自己**是 `.pyc` ⇒ 被后缀规则排除（`false`）—— 这正是 `M2` 的洞：只看这一格会放行。 */
        pyc_landing: false,
        /** 但**它下面的文件**不排除 ⇒ `true` —— 出口问的必须是这一格。 */
        pyc_landing_child: true,
        outside: false,
        outside_child: false,
      }
      for (const [key, w] of Object.entries(want)) {
        const got = probes[key]
        if (got.exit !== 0 || got.json === null) {
          push('PRE-CHECK-DEVICE', `\`fingerprint.mjs --is-code\` 问不出来（${key}）：exit=${got.exit} · ${String(got.stderr || got.stdout).slice(0, 200)}`)
          continue
        }
        if (got.json.code !== w) push('PRE-CHECK-DEVICE', `\`--is-code\` 对 ${key} 的回答应是 ${w}，实得 ${JSON.stringify(got.json.code)}（why：${String(got.json.why ?? '').slice(0, 160)}）—— 排除表分叉了，上面那条拒的落点也就不可信`)
        if (typeof got.json.why !== 'string' || got.json.why.trim() === '') push('PRE-CHECK-DEVICE', `\`--is-code\` 对 ${key} 没给理由（\`why\` 空）—— 读的人不知道它凭哪一条判的`)
      }

      // ── ⑤ 尺子跑不动 ⇒ **拒**（fail-closed）+ 零写入 ────────────────────────────────
      //   病根（技术评审 2026-11-07 `F5`）：`askIsCode` 失败时只印一句"这一条不拒"就 `return null`，
      //   调用方又不拒 ⇒ 尺子坏了副本照样写进被测树（实测 3 份落在 CODE 集里）。
      //   这一格喂**同一个"落在被测树里"的落点** + 一把**坏尺子**（恒 exit 3）⇒ 必须拒、且一个字节都不写。
      //   阳性对照：坏尺子自己 `--is-code` 必须 exit 3 —— 否则"拒"可能来自别处，因果就不成立。
      const brokenDir = path.join(root, 'fixtures', 'mcr01-broken-ruler')
      mkdirSync(brokenDir, { recursive: true })
      const brokenTool = path.join(brokenDir, 'tree-at-commit.mjs')
      const brokenFingerprint = path.join(brokenDir, 'fingerprint.mjs')
      copyFileSync(ex.file, brokenTool)
      writeFileSync(brokenFingerprint, [
        '#!/usr/bin/env node',
        '// 坏尺子（MCR-01 ⑤ 的夹具）：任何调用都 exit 3 —— 模拟"尺子跑不动"。',
        "process.stderr.write('坏尺子（夹具）：exit 3\\n')",
        'process.exit(3)',
        '',
      ].join('\n'), 'utf8')
      const rulerProbe = spawnSync(process.execPath, [
        brokenFingerprint, '--is-code', path.join(audited, 'presets', 'agenia', 'probe.txt'), '--root', audited, '--json',
      ], { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
      const brokenBefore = treeHash(audited)
      const brokenBeforePaths = treePaths(audited)
      const outBroken = path.join(audited, 'presets', 'agenia', '_probe_copy_mcr01_unmeasurable')
      const broken = spawnSync(process.execPath, [brokenTool, '--repo', audited, '--commit', fx.commitA, '--out', outBroken, '--json'], {
        encoding: 'utf8', timeout: 180000, maxBuffer: 128 * 1024 * 1024, env: { ...process.env },
      })
      const brokenAfter = treeHash(audited)
      const brokenAfterPaths = treePaths(audited)
      const brokenCode = (() => {
        try { return JSON.parse(String(broken.stdout).trim().split('\n').pop())?.error?.code ?? null } catch { return null }
      })()
      rec.readings.broken_ruler = {
        ruler_exit: rulerProbe.status,
        ruler_stderr: String(rulerProbe.stderr ?? '').slice(-200),
        exit: broken.status,
        code: brokenCode,
        out: outBroken,
        out_created: existsSync(outBroken),
        audited_equal: brokenAfter.sha256 === brokenBefore.sha256,
        audited_paths_equal: brokenAfterPaths.count === brokenBeforePaths.count
          && brokenAfterPaths.paths.every((p, i) => p === brokenBeforePaths.paths[i]),
        stderr: String(broken.stderr ?? '').slice(-400),
      }
      if (rulerProbe.status !== 3) {
        push('BROKEN-RULER-NOT-BROKEN', `坏尺子夹具自己应 \`exit 3\`，实得 ${rulerProbe.status}（stderr：${String(rulerProbe.stderr ?? '').trim().slice(0, 200)}）—— 这一格的"拒"就可能来自别处，因果不成立`)
      }
      if (broken.status === 0) {
        push('FAIL-OPEN', `尺子跑不动（\`exit 3\`）时导出器仍然 \`exit 0\`（--out=${outBroken}）—— **判不了被当成放行**：副本会写进被测树（技术评审 11-07 \`F5\` 的形状）`)
      } else if (brokenCode !== 'E_OUT_NOT_MEASURABLE') {
        push('FAIL-OPEN-WRONG-CODE', `尺子跑不动时应报 \`E_OUT_NOT_MEASURABLE\`，实得 ${JSON.stringify(brokenCode)}（stderr：${String(broken.stderr ?? '').trim().slice(0, 240)}）`)
      }
      if (existsSync(outBroken)) {
        push('FAIL-OPEN-WROTE', `尺子跑不动时落点已经被创建：${outBroken} —— fail-closed 要求第一个字节之前拒`)
      }
      if (brokenAfter.sha256 !== brokenBefore.sha256) {
        push('FAIL-OPEN-WROTE-TREE', `尺子跑不动这一跑之后被测根**变了**（${String(brokenBefore.sha256).slice(0, 16)}… → ${String(brokenAfter.sha256).slice(0, 16)}…）—— "拒在任何写之前"在 fail-closed 这一支上不成立`)
      }
      if (!(brokenAfterPaths.count === brokenBeforePaths.count && brokenAfterPaths.paths.every((p, i) => p === brokenBeforePaths.paths[i]))) {
        push('FAIL-OPEN-WROTE-PATHS', `尺子跑不动这一跑之后被测根的**路径集合**变了（${brokenBeforePaths.count} → ${brokenAfterPaths.count} 条）`)
      }

      // ── 刀：把"拒"那一条关掉 ⇒ 同一个输入必须写进被测树（= ① 会红）───────────
      const knifeDir = path.join(root, 'fixtures', 'mcr01-knife')
      mkdirSync(knifeDir, { recursive: true })
      const knifeTool = path.join(knifeDir, 'tree-at-commit.mjs')
      const knifeFingerprint = path.join(knifeDir, 'fingerprint.mjs')
      copyFileSync(ex.file, knifeTool)
      copyFileSync(path.join(path.dirname(ex.file), 'fingerprint.mjs'), knifeFingerprint)
      const src = readFileSync(knifeTool, 'utf8')
      /**
       * 锚点：`if (asked.code === true) {`（**不是** `if (asked === null) {`）。
       * 2026-11-08 生产侧加了 fail-closed 分支后，旧锚 `if (asked !== null && asked.code === true) {` 消失。
       * 选这一行的理由：刀喂的**同一个输入**里尺子是好的（`asked` 非空）⇒ 拦住它的就是这一行；
       * 把 `asked === null` 那一支切成 `false` 只会让"判不了"的路更松，对这一刀要翻的那一格没有任何作用。
       */
      const anchor = 'if (asked.code === true) {'
      const hits = src.split(anchor).length - 1
      const patched = src.split(anchor).join('if (false) {')
      writeFileSync(knifeTool, patched, 'utf8')
      let knifeReading = { file: knifeTool, anchor, anchor_hits: hits, exit: null, copy_created: null, code: null }
      if (hits !== 1) {
        push('KNIFE-ANCHOR', `退化刀的锚点 "${anchor}" 在导出器里命中 ${hits} 处（应恰好 1 处）—— 刀钝了：这一格现在是"改回去也不会红"的绿`)
      } else {
        const outKnife = path.join(audited, 'presets', 'agenia', '_probe_copy_mcr01_knife')
        const knifed = spawnSync(process.execPath, [knifeTool, '--repo', audited, '--commit', fx.commitA, '--out', outKnife, '--json'], {
          encoding: 'utf8', timeout: 180000, maxBuffer: 128 * 1024 * 1024,
          env: { ...process.env },
        })
        knifeReading = {
          file: knifeTool, anchor, anchor_hits: hits, exit: knifed.status,
          copy_created: existsSync(outKnife), code: (() => {
            try { return JSON.parse(String(knifed.stdout).trim().split('\n').pop())?.error?.code ?? null } catch { return null }
          })(),
          stderr: String(knifed.stderr ?? '').slice(-300),
        }
        if (knifed.status === 0 && !knifeReading.copy_created) {
          push('KNIFE-NO-BITE', `把"拒"那一条关掉之后，同一个输入 exit 0 却没写出副本（${outKnife}）—— 这一刀没咬到"写进被测树"这件事，① 的翻面证据不成立`)
        } else if (knifed.status !== 0) {
          push('KNIFE-NO-BITE', `把"拒"那一条关掉之后，同一个输入仍然被拒（exit=${knifed.status} / ${knifeReading.code ?? '(无码)'}）—— 说明拦住它的**不是**这一条（① 的绿不是这一条给的）`)
        }
      }
      rec.readings.knife = knifeReading

      caseFail(problems)
    })
  })
})
