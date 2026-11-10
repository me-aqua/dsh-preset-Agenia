/**
 * `RCA-01` —— **`judgement.txt` 里这一跑属于哪个提交**（`bug-20261109-08`；契约 §7.1）。
 *
 * 【病】两天的"绿"都压在一个假设上：**这一跑 = 某个提交**。技术评审两次在文字里说
 * "我无法把这一跑绑定到 `aab935a`…" —— 而 `judgement.txt` 里没有任何一行给过提交号。
 *
 * 【这一格判什么】四件事 + 三把刀，缺一不算：
 *   ① **解析器只有一份**：`support/run-anchor.mjs::readRunAnchor`。活树的顶层 == 仓库根 ⇒ `HEAD`；
 *      否则 = 副本 ⇒ **只认显式来历**（`AGENIA_COPY_COMMIT` / `AGENIA_COPY_PROVENANCE`）。
 *      静态腿：`rev-parse` + `'HEAD'` 这个组合在 `run-all.mjs` / `flip01-*.test.mjs` 里命中 **0** 处，
 *      在 `run-anchor.mjs` 里恰好 **1** 处 ⇒ `FLIP-01` 与本格用的是**同一份**判定（不是第三个解析器）。
 *   ② **量在起跑那一刻、只量一次**：`head_git_calls === 1`；渲染是纯函数 —— 读完锚点再提交一个，
 *      `git rev-parse HEAD` 变了而行**不许**跟着变（刀：`HEAD` 在渲染之前动过）。
 *   ③ **活树跑** ⇒ 行 = 起跑那一刻的 `HEAD`；落盘 `<运行根>/run-anchor.json` 与行同值；
 *      `measured_at` 早于 `stdout.txt` 的 mtime（"起跑时"不是"收口时"）。
 *   ④ **副本跑、没有来历** ⇒ 行 = `[锚] 提交 判不了` + 原因，**整行 40 位十六进制命中 0 处**；
 *      副本故意**嵌在活树里**（git 会一路走到活树的 `.git`）⇒ 解析器必须拒绝它（`is_copy:true`）。
 *   ⑤ **刀：喂一个形状合法的错提交** ⇒ 行里就是那个错值；判官拿真值比 ⇒ **红在 `RCA-COMMIT-MISMATCH`**
 *      （不是"只是不同"）。
 *
 * 【不判什么】不判工作区脏不脏（`STAT-01` / `CPY-01` 的事）；不判提交的内容对不对；
 *   不判 `[尺子] 测试树` 那一行（`MCR-03` 的事）。
 *   ⚠️ 边界：副本的来历**只有一处来源** ⇒ 被**误报**的来历无法从内部发现。
 *   ⑤ 证明的是"行与真值不符会红"，**不**证明"能识别假来历"。
 */
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseDir, caseFail, problem, runCase } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { git } from '../support/tree-at-commit.mjs'
import { spawnTestFileVariant } from '../support/settlement-probe.mjs'
import {
  COPY_COMMIT_ENV,
  COPY_PROVENANCE_ENV,
  anchorLineOf,
  anchorVerdict,
  readRunAnchor,
} from '../support/run-anchor.mjs'

/** 这一跑的那棵树（从**本文件的位置**推 —— `PATHS.repo` 是别处要钉的那一格，不拿它判"我在哪"）。 */
const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const REPO = SUITE
const RUN_ALL = path.join(SUITE, 'tests', 'agenia-upgrade', 'run-all.mjs')

/** 子进程环境：临时件全落探针目录、摘掉测试 runner 的上下文（不摘 ⇒ 嵌套 `node --test` 一条不跑却 exit 0）。 */
function childEnv(tmpDir) {
  const env = { ...process.env, TEMP: tmpDir, TMP: tmpDir }
  delete env.NODE_TEST_CONTEXT
  delete env.NODE_TEST_REPORTER
  delete env.AGENIA_REPO_ROOT
  delete env[COPY_COMMIT_ENV]
  delete env[COPY_PROVENANCE_ENV]
  return env
}

/** 真跑一次入口（`--glob` 打一个不存在的文件：只为了读它写的 `judgement.txt` / `run-anchor.json`）。 */
function runEntry({ runRootDir, repo = null, extraEnv = {}, timeoutMs = 180000 }) {
  const tmp = path.join(path.dirname(runRootDir), 'tmp')
  mkdirSync(tmp, { recursive: true })
  mkdirSync(runRootDir, { recursive: true })
  const argv = [RUN_ALL, `--run-root=${runRootDir}`, '--glob=tests/agenia-upgrade/static/__rca01-none__.test.mjs']
  if (repo !== null) argv.push(`--repo=${repo}`)
  const r = spawnSync(process.execPath, argv, { cwd: PATHS.repo, env: { ...childEnv(tmp), ...extraEnv }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs })
  const judgementFile = path.join(runRootDir, 'judgement.txt')
  const anchorFile = path.join(runRootDir, 'run-anchor.json')
  const stdoutFile = path.join(runRootDir, 'stdout.txt')
  const readJson = (file) => {
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  }
  return {
    exit: r.status,
    stdout: String(r.stdout ?? ''),
    stderr: String(r.stderr ?? ''),
    judgement: existsSync(judgementFile) ? readFileSync(judgementFile, 'utf8') : '',
    anchor: readJson(anchorFile),
    anchor_file_mtime: existsSync(anchorFile) ? statSync(anchorFile).mtimeMs : null,
    stdout_file_mtime: existsSync(stdoutFile) ? statSync(stdoutFile).mtimeMs : null,
    run_root: runRootDir,
  }
}

/** 一份**不是 git 仓**的目录（嵌在活树里 —— git 从它出发会走到活树的 `.git`，这正是要拒绝的形状）。 */
function makeNestedCopy(where, note) {
  mkdirSync(path.join(where, 'tests', 'agenia-upgrade'), { recursive: true })
  writeFileSync(path.join(where, 'README.txt'), `${note}\n`, 'utf8')
  return where
}

/** 造一个夹具 git 仓（两个提交用得上：先读锚点，再改 `HEAD`，看行跟不跟着动）。 */
function fixtureRepo(where, message) {
  mkdirSync(where, { recursive: true })
  const init = git(['init', '-q'], { cwd: where })
  const commit = git(['commit', '-q', '--allow-empty', '-m', message], { cwd: where })
  const head = git(['rev-parse', 'HEAD'], { cwd: where })
  return {
    root: where,
    init_status: init.status,
    commit_status: commit.status,
    commit: head.status === 0 ? String(head.stdout).trim() : null,
  }
}

test('RCA-01 结算组带「这一跑是哪个提交」：起跑那一刻量一次、活树读 HEAD、副本无来历判不了、喂错提交必红', async () => {
  await runCase('RCA-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const base = path.join(path.dirname(caseDir('RCA-01')), '_probe', 'rca01')
    mkdirSync(base, { recursive: true })

    // ── ① 静态：解析器只有一份（`rev-parse` + `HEAD` 这个组合的命中数）──────
    const readText = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null)
    const NEEDLE = /\[\s*'rev-parse'\s*,\s*'HEAD'\s*\]/g
    const hitsIn = (file) => {
      const text = readText(file)
      if (text === null) return null
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
      return (stripped.match(NEEDLE) ?? []).length
    }
    const flipFile = path.join(PATHS.testRoot, 'integration', 'flip01-bridge-reading.test.mjs')
    const resolverFile = path.join(PATHS.testRoot, 'support', 'run-anchor.mjs')
    const entryFile = path.join(PATHS.testRoot, 'run-all.mjs')
    const needle = {
      resolver: hitsIn(resolverFile),
      entry: hitsIn(entryFile),
      flip01: hitsIn(flipFile),
      needle: String(NEEDLE),
    }
    rec.readings.single_resolver = needle
    if (needle.resolver !== 1) {
      push('RCA-RESOLVER-SHAPE', `\`support/run-anchor.mjs\` 里 \`['rev-parse','HEAD']\` 命中 ${needle.resolver} 处（应恰好 1 处）—— 解析器不是一份`)
    }
    if (needle.entry !== 0) {
      push('RCA-SECOND-RESOLVER', `\`run-all.mjs\` 里还有 ${needle.entry} 处自己跑 \`rev-parse HEAD\` —— 结算行会与解析器各说各的`)
    }
    if (needle.flip01 !== 0) {
      push('RCA-SECOND-RESOLVER', `\`flip01-bridge-reading.test.mjs\` 里还有 ${needle.flip01} 处自己跑 \`rev-parse HEAD\` —— 那是第二个解析器（本批要求一份）`)
    }

    // ── ② 起跑那一刻量一次：再提交一个，行不许跟着动（纯函数渲染）──────────
    const fx = fixtureRepo(path.join(base, 'fixtures', 'moving-head'), 'A')
    const first = readRunAnchor({ repo: fx.root })
    const afterCommit = fixtureRepoInPlace(fx.root, 'B')
    const lineFromFirst = anchorLineOf(first)
    const lineAgain = anchorLineOf({ ...first })
    rec.readings.moving_head = {
      repo: fx.root,
      commit_a: fx.commit,
      commit_b: afterCommit,
      anchor_commit: first.commit,
      head_git_calls: first.head_git_calls,
      line: lineFromFirst,
      line_stable: lineFromFirst === lineAgain,
    }
    if (fx.init_status !== 0 || fx.commit_status !== 0 || fx.commit === null) {
      push('RCA-FIXTURE', `夹具仓造不出来（init=${fx.init_status} · commit=${fx.commit_status} · commit=${JSON.stringify(fx.commit)}）—— 这一格判不了`)
    } else {
      if (first.state !== 'commit' || first.commit !== fx.commit) {
        push('RCA-READING-WRONG', `夹具仓第一次读锚点得到 ${JSON.stringify({ state: first.state, commit: first.commit })}，期望 \`commit ${fx.commit}\`（来源 ${first.source}）`)
      }
      if (first.head_git_calls !== 1) {
        push('RCA-MEASURED-TWICE', `\`head_git_calls = ${first.head_git_calls}\`（应为 1）—— 读数不是"量一次"`)
      }
      if (afterCommit === null || afterCommit === fx.commit) {
        push('RCA-FIXTURE', `夹具仓的第二个提交没造出来（HEAD 仍是 ${JSON.stringify(afterCommit)}）—— "HEAD 动了行不许动"这条腿没有对照`)
      } else if (!lineFromFirst.includes(fx.commit)) {
        push('RCA-NOT-FROM-READING', `第二个提交之后渲染出来的行里没有**第一次**量到的提交 ${fx.commit}：${JSON.stringify(lineFromFirst)} —— 行不是由那份读数渲染的`)
      } else if (lineFromFirst.includes(afterCommit)) {
        push('RCA-NOT-AT-START', `第二个提交之后渲染出来的行里出现了**新**提交 ${afterCommit}：${JSON.stringify(lineFromFirst)} —— 行跟着收口时的 HEAD 动了（量在起跑那一刻这条腿不成立）`)
      }
      const moved = anchorVerdict({
        lines: [`F57-SETTLE 分母 199 · …`, lineFromFirst],
        anchor: first,
        truth: { state: 'commit', commit: afterCommit, source: '夹具仓现在的 HEAD' },
      })
      rec.readings.moving_head.verdict_against_new_head = moved.codes
      if (!moved.codes.includes('RCA-COMMIT-MISMATCH')) {
        push('RCA-KNIFE-NOT-BITING', `\`HEAD\` 已经变成 ${afterCommit}，而行里是 ${fx.commit}，判官却没有红在 \`RCA-COMMIT-MISMATCH\`（实得 ${JSON.stringify(moved.codes)}）`)
      }
    }

    // ── ③ 这一跑的树是活树还是副本（两种模式都要判；评审副本里跑时不许红）──
    //    · 活树（这一跑就在自己那个仓里）⇒ 行 = 起跑那一刻的 HEAD；
    //    · 副本（评审副本就是这种）⇒ 行 = **声明的来历**（没有来历 ⇒ 判不了，下面 ④）。
    //    "我在哪"从**本文件的位置**推（`REPO`），不读 `PATHS.repo` —— 那一格别的用例在钉。
    const thisRun = readRunAnchor({ repo: REPO })
    const liveMode = thisRun.state === 'commit' && thisRun.is_copy !== true
    rec.readings.mode = { repo: REPO, live_mode: liveMode, state: thisRun.state, is_copy: thisRun.is_copy, toplevel: thisRun.toplevel }
    const headBefore = liveMode ? git(['rev-parse', 'HEAD'], { cwd: REPO }) : null
    const headBeforeSha = headBefore !== null && headBefore.status === 0 ? String(headBefore.stdout).trim() : null
    /** 副本模式里"这一跑自己声明"的来历（活树模式没有它）。 */
    const declaredHere = liveMode ? null : 'e'.repeat(40)
    const ownTruth = liveMode
      ? { state: 'commit', commit: headBeforeSha, source: '测试在 spawn 之前量的 HEAD' }
      : { state: 'commit', commit: declaredHere, source: `这一跑声明的来历（${COPY_COMMIT_ENV}）` }
    const own = runEntry({
      runRootDir: path.join(base, 'runs', 'own'),
      repo: liveMode ? null : REPO,
      extraEnv: declaredHere === null ? {} : { [COPY_COMMIT_ENV]: declaredHere },
    })
    const headAfter = liveMode ? git(['rev-parse', 'HEAD'], { cwd: REPO }) : null
    const headAfterSha = headAfter !== null && headAfter.status === 0 ? String(headAfter.stdout).trim() : null
    const ownLines = own.judgement.split(/\r?\n/)
    const ownVerdict = anchorVerdict({ lines: ownLines, anchor: own.anchor, truth: ownTruth })
    rec.readings.own_run = {
      run_root: own.run_root, exit: own.exit, live_mode: liveMode,
      truth: ownTruth, head_after_run: headAfterSha,
      anchor_file: own.anchor,
      judgement: ownLines,
      verdict: { ok: ownVerdict.ok, codes: ownVerdict.codes },
      stdout_has_group_consecutively: (() => {
        const out = own.stdout.split(/\r?\n/)
        const i = out.findIndex((l) => l.startsWith('F57-SETTLE '))
        return i >= 0 && (out[i + 1] ?? '').startsWith('[锚] 提交 ')
      })(),
      anchor_measured_before_stdout: own.anchor_file_mtime !== null && own.stdout_file_mtime !== null && own.anchor_file_mtime <= own.stdout_file_mtime,
    }
    if (own.anchor === null) {
      push('RCA-ANCHOR-READING-MISSING', `这一跑没写出 \`run-anchor.json\`（run root ${own.run_root} · exit=${own.exit}）—— 起跑那一刻的读数没有落点`)
    } else if (own.anchor.commit !== ownTruth.commit) {
      push('RCA-COMMIT-MISMATCH', `\`run-anchor.json\` 的提交 ${JSON.stringify(own.anchor.commit)} ≠ 真值 ${ownTruth.commit}（${ownTruth.source}）`)
    }
    for (const p of ownVerdict.problems) push(p.code, `[这一跑] ${p.message}`)
    if (!rec.readings.own_run.stdout_has_group_consecutively) {
      push('RCA-GROUP-NOT-ON-CONSOLE', '控制台上 `[锚]` 不是结算行的下一行 —— 控制台与 `judgement.txt` 必须是同一份文字（同一组）')
    }
    if (!rec.readings.own_run.anchor_measured_before_stdout) {
      push('RCA-NOT-AT-START', `\`run-anchor.json\` 的时刻不晚于 \`stdout.txt\` 的 mtime（anchor=${own.anchor_file_mtime} · stdout=${own.stdout_file_mtime}）—— 锚点不是起跑那一刻量的`)
    }
    if (liveMode && headBeforeSha !== null && headAfterSha !== null && headBeforeSha !== headAfterSha) {
      // 跑的过程中真有人提交了：这一腿的"真值"仍是起跑前那一个（锚点钉的就是它）。
      rec.readings.own_run.head_moved_during_run = true
    }

    // ── ④ 副本跑、无来历：判不了 + 原因，整行一个哈希都不许有（且不许借活树的 HEAD）──
    const nestedCopy = makeNestedCopy(path.join(base, 'fixtures', 'no-git-copy'), '一份纯树（故意嵌在活树里；没有 .git）')
    const copyReading = readRunAnchor({ repo: nestedCopy })
    const copyLine = anchorLineOf(copyReading)
    const copyRun = runEntry({ runRootDir: path.join(base, 'runs', 'copy-no-provenance'), repo: nestedCopy })
    const copyLines = copyRun.judgement.split(/\r?\n/)
    const copyVerdict = anchorVerdict({ lines: copyLines, anchor: copyRun.anchor, truth: { state: 'unknown', source: '副本 + 没给来历' } })
    rec.readings.copy_no_provenance = {
      copy_root: nestedCopy,
      reading: { state: copyReading.state, commit: copyReading.commit, source: copyReading.source, is_copy: copyReading.is_copy, toplevel: copyReading.toplevel },
      line: copyLine,
      hashes_in_line: (copyLine.match(/[0-9a-f]{40}/gi) ?? []).length,
      run: { run_root: copyRun.run_root, exit: copyRun.exit, anchor: copyRun.anchor, judgement: copyRun.judgement.split(/\r?\n/), codes: copyVerdict.codes },
    }
    if (copyReading.state !== 'unknown' || copyReading.commit !== null) {
      push('RCA-COPY-GUESSED', `副本（无来历）读成了 ${JSON.stringify({ state: copyReading.state, commit: copyReading.commit })} —— 判不了就是判不了，不许落回一个方便的值`)
    }
    if (copyReading.is_copy !== true) {
      push('RCA-COPY-CLIMBED', `副本被当成了它自己的仓（is_copy=${copyReading.is_copy}，顶层=${JSON.stringify(copyReading.toplevel)}）—— git 会一路走到活树的 .git`)
    }
    if ((copyLine.match(/[0-9a-f]{40}/gi) ?? []).length !== 0) {
      push('RCA-GUESSED-HASH', `"判不了"那一行里出现了 40 位十六进制：${JSON.stringify(copyLine)}`)
    }
    if (!copyLine.includes('判不了') || !copyLine.includes('原因=')) {
      push('RCA-SOURCE-UNNAMED', `"判不了"那一行必须写出「判不了」与「原因=」：${JSON.stringify(copyLine)}`)
    }
    if (!copyVerdict.ok) {
      for (const p of copyVerdict.problems) push(p.code, `[副本跑] ${p.message}`)
    }

    // ── ⑤ 刀 A：喂一个形状合法的**错**提交 ⇒ 行里就是那个错值，判官必须红 ─────
    const wrong = `${'0'.repeat(39)}1`
    /** 这一刀要的"真值"：活树模式 = 真 HEAD；副本模式里没有第二个真值来源 ⇒ 用一个**不同的值**当对照（边界写在这里）。 */
    const knifeTruth = liveMode
      ? { state: 'commit', commit: headBeforeSha, source: '活树的 HEAD（这一跑是从它复制的）' }
      : { state: 'commit', commit: 'f'.repeat(40), source: '副本模式：没有第二个真值来源，用另一个值当对照' }
    const knifeRun = runEntry({ runRootDir: path.join(base, 'runs', 'copy-wrong-commit'), repo: nestedCopy, extraEnv: { [COPY_COMMIT_ENV]: wrong } })
    const knifeAnchorLine = knifeRun.judgement.split(/\r?\n/).find((l) => l.startsWith('[锚] ')) ?? null
    const knifeVerdict = anchorVerdict({ lines: knifeRun.judgement.split(/\r?\n/), anchor: knifeRun.anchor, truth: knifeTruth })
    rec.readings.wrong_commit_knife = {
      fed: wrong, truth: knifeTruth,
      run_root: knifeRun.run_root,
      anchor_line: knifeAnchorLine,
      anchor_reading: knifeRun.anchor,
      codes: knifeVerdict.codes,
      problems: knifeVerdict.problems.map((p) => p.code),
    }
    if (knifeAnchorLine === null) {
      push('RCA-KNIFE-UNAVAILABLE', '那把刀那一跑没写出 `[锚]` 行（或入口根本没跑起来）—— 刀没有落点')
    } else {
      if (!knifeAnchorLine.includes(wrong)) {
        push('RCA-KNIFE-NOT-FED', `喂进去的提交 ${wrong} 没有出现在行里：${JSON.stringify(knifeAnchorLine)} —— 副本的显式来历没被读到`)
      }
      if (!knifeVerdict.codes.includes('RCA-COMMIT-MISMATCH')) {
        push('RCA-KNIFE-NOT-BITING', `行里是错的提交 ${wrong}、真值是 ${knifeTruth.commit}，判官却没有红在 \`RCA-COMMIT-MISMATCH\`（实得 ${JSON.stringify(knifeVerdict.codes)}）—— "只是不同"不算判据`)
      }
      if (knifeVerdict.codes.includes('RCA-NOT-FROM-READING')) {
        push('RCA-KNIFE-NOT-BITING', '那把刀喂进去之后判官还报"行不是读数的渲染" —— 刀把两条腿搅在一起了（这一刀切的是**真假**，不是**同源**）')
      }
    }
    // 正面对照：同一份副本 + **对**的来历 ⇒ 判官必须绿（否则上面那把刀的红是"永远红"）。
    const goodProv = runEntry({ runRootDir: path.join(base, 'runs', 'copy-right-commit'), repo: nestedCopy, extraEnv: { [COPY_COMMIT_ENV]: knifeTruth.commit } })
    const goodVerdict = anchorVerdict({
      lines: goodProv.judgement.split(/\r?\n/),
      anchor: goodProv.anchor,
      truth: knifeTruth,
    })
    rec.readings.right_commit_control = {
      fed: knifeTruth.commit,
      anchor_line: goodProv.judgement.split(/\r?\n/).find((l) => l.startsWith('[锚] ')) ?? null,
      codes: goodVerdict.codes,
    }
    for (const p of goodVerdict.problems) push(p.code, `[正面对照] ${p.message}`)

    // ── ⑥ 来历的两条通道 + 坏来历不许猜（纯读数，不跑入口）──────────────────
    const hexA = 'a'.repeat(40)
    const hexB = 'b'.repeat(40)
    const provFile = path.join(base, 'fixtures', 'export.json')
    writeFileSync(provFile, `${JSON.stringify({ schema: 1, commit: hexB })}\n`, 'utf8')
    const provReading = readRunAnchor({ repo: nestedCopy, env: { [COPY_PROVENANCE_ENV]: provFile } })
    const badProvFile = path.join(base, 'fixtures', 'export-broken.json')
    writeFileSync(badProvFile, 'not json\n', 'utf8')
    const badCommitEnv = readRunAnchor({ repo: nestedCopy, env: { [COPY_COMMIT_ENV]: 'deadbeef' } })
    const badProvReading = readRunAnchor({ repo: nestedCopy, env: { [COPY_PROVENANCE_ENV]: badProvFile } })
    const bothEnv = readRunAnchor({ repo: nestedCopy, env: { [COPY_COMMIT_ENV]: 'deadbeef', [COPY_PROVENANCE_ENV]: provFile } })
    rec.readings.provenance_channels = {
      commit_env: { state: readRunAnchor({ repo: nestedCopy, env: { [COPY_COMMIT_ENV]: hexA } }).commit, want: hexA },
      provenance_file: { state: provReading.state, commit: provReading.commit, want: hexB },
      bad_commit_env: { state: badCommitEnv.state, commit: badCommitEnv.commit, source: badCommitEnv.source },
      bad_provenance_file: { state: badProvReading.state, commit: badProvReading.commit, why_has_reason: String(badProvReading.why ?? '').includes('读不出来') },
      bad_commit_then_good_file: { state: bothEnv.state, commit: bothEnv.commit, want: hexB },
    }
    const channels = rec.readings.provenance_channels
    if (channels.commit_env.state !== hexA) push('RCA-PROVENANCE-CHANNEL', `\`${COPY_COMMIT_ENV}\` 没被读成提交号（实得 ${JSON.stringify(channels.commit_env.state)}）`)
    if (channels.provenance_file.state !== 'commit' || channels.provenance_file.commit !== hexB) {
      push('RCA-PROVENANCE-CHANNEL', `\`${COPY_PROVENANCE_ENV}\` 那份 JSON 的 \`commit\` 没被读成提交号（实得 ${JSON.stringify({ state: channels.provenance_file.state, commit: channels.provenance_file.commit })}）`)
    }
    if (channels.bad_commit_env.state !== 'unknown' || channels.bad_commit_env.commit !== null) {
      push('RCA-PROVENANCE-GUESSED', `\`${COPY_COMMIT_ENV}=deadbeef\`（不是 40 位）被当成了来历（实得 ${JSON.stringify(channels.bad_commit_env)}）—— 坏来历必须判不了`)
    }
    if (channels.bad_provenance_file.state !== 'unknown' || channels.bad_provenance_file.why_has_reason !== true) {
      push('RCA-PROVENANCE-GUESSED', `\`${COPY_PROVENANCE_ENV}\` 指到一份坏 JSON 时判不了，但原因里没写"读不出来"（实得 ${JSON.stringify(channels.bad_provenance_file)}）`)
    }
    if (channels.bad_commit_then_good_file.state !== 'commit' || channels.bad_commit_then_good_file.commit !== hexB) {
      push('RCA-PROVENANCE-CHANNEL', `\`${COPY_COMMIT_ENV}\` 是坏值时应当继续看 \`${COPY_PROVENANCE_ENV}\`（实得 ${JSON.stringify(channels.bad_commit_then_good_file)}）`)
    }

    // ── ⑦ 刀 B（端到端）：产品给一份**没有来历的副本**编一个提交号 ⇒ 这一格必须红 ──
    //    刀切的是"猜"这个形状（副本的来历只有一处来源 ⇒ 拿另一个值当"错值"是量不到它的）：
    //    把解析器里 `state:'unknown'` 那一支改成"报一个提交号"，再用**同一段用例体**跑一遍。
    const depth = Number(process.env.AGENIA_PROBE_DEPTH ?? 0)
    if (depth > 0) {
      rec.readings.knife_e2e = { skipped: `AGENIA_PROBE_DEPTH=${depth} > 0（本进程是别的格的探针副本；端到端那把刀在主跑里量，这里不套娃）` }
    } else {
      const copyRoot = path.join(base, 'fixtures', 'suite-copy')
      const copySuite = path.join(copyRoot, 'tests', 'agenia-upgrade')
      mkdirSync(path.dirname(copySuite), { recursive: true })
      cpSync(path.join(REPO, 'tests', 'agenia-upgrade'), copySuite, { recursive: true, force: true })
      const cellFile = path.join(copySuite, 'unit', 'rca01-run-commit-anchor.test.mjs')
      const target = path.join(copySuite, 'support', 'run-anchor.mjs')
      const original = readFileSync(target, 'utf8')
      const anchorText = "        state: 'unknown',\n        commit: null,\n"
      const hits = original.split(anchorText).length - 1
      /** 对照：同一份副本、**不切**产品 ⇒ 这一格必须绿（否则下面那把刀的红是"永远红"）。 */
      const control = spawnTestFileVariant({
        baseDir: path.join(base, 'knife'), name: 'control', file: cellFile, testNamePattern: '^RCA-01', timeoutMs: 600000,
      })
      const controlRec = control.results['RCA-01'] ?? null
      let patched = null
      if (hits !== 1) {
        push('RCA-KNIFE-ANCHOR', `刀的锚点在 \`run-anchor.mjs\` 里命中 ${hits} 处（应恰好 1 处）—— 刀钝了：给副本编一个提交号也不会红`)
      } else {
        writeFileSync(target, original.replace(anchorText, `        state: 'commit',\n        commit: '${'d'.repeat(40)}',\n`), 'utf8')
        const knifed = spawnTestFileVariant({
          baseDir: path.join(base, 'knife2'), name: 'guessed-hash', file: cellFile, testNamePattern: '^RCA-01', timeoutMs: 600000,
        })
        writeFileSync(target, original, 'utf8')
        const recKnifed = knifed.results['RCA-01'] ?? null
        patched = {
          copy_root: copyRoot,
          exit: knifed.exit,
          result: recKnifed === null ? null : recKnifed.result,
          codes: recKnifed === null ? null : (recKnifed.problems ?? []).map((p) => p.code),
          first_problem: recKnifed === null ? null : String((recKnifed.problems ?? [])[0]?.message ?? '').slice(0, 300),
        }
        if (recKnifed === null) {
          push('RCA-KNIFE-UNAVAILABLE', `副本那一跑没写出 \`RCA-01\` 的判词（exit=${knifed.exit} · stderr=${knifed.stderr.slice(0, 300)}）`)
        } else if (recKnifed.result !== 'RED') {
          push('RCA-KNIFE-NOT-BITING', `产品给没有来历的副本编了一个提交号，这一格却判 \`${recKnifed.result}\` —— "猜"不是"这一格红"`)
        } else if (!(recKnifed.problems ?? []).some((p) => p.code === 'RCA-GUESSED-HASH')) {
          push('RCA-KNIFE-NOT-BITING', `产品编了一个提交号，红因里却没有 \`RCA-GUESSED-HASH\`（实得 ${JSON.stringify((recKnifed.problems ?? []).map((p) => p.code))}）—— 红在别处不说明这条腿在承重`)
        }
      }
      rec.readings.knife_e2e = {
        anchor_text: anchorText, hits,
        control: { exit: control.exit, result: controlRec === null ? null : controlRec.result, codes: controlRec === null ? null : (controlRec.problems ?? []).map((p) => p.code) },
        patched,
      }
      if (controlRec === null || controlRec.result !== 'GREEN') {
        push('RCA-KNIFE-CONTROL', `未切产品的同一份副本里这一格判 ${JSON.stringify(controlRec === null ? null : controlRec.result)}`
          + `（codes=${JSON.stringify(controlRec === null ? null : (controlRec.problems ?? []).map((p) => p.code))}）—— 那样下面那把刀的红证明不了任何事`)
      }
    }

    caseFail(problems)
  })
})

/** 在同一个夹具仓里再提交一个（`git` 的封装已把作者/时刻钉死 ⇒ 提交号可复现）。 */
function fixtureRepoInPlace(root, message) {
  const commit = git(['commit', '-q', '--allow-empty', '-m', message], { cwd: root })
  const head = git(['rev-parse', 'HEAD'], { cwd: root })
  return commit.status === 0 && head.status === 0 ? String(head.stdout).trim() : null
}
