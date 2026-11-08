/**
 * `MCR-02` · **`F-168`** —— `REV-04/E` 的针**读副本**；活树怎么动都不进这一格。
 * `MCR-03` · **`F-169`** —— 套件入口 / 尺子 / 体检脚本都指**副本**；活树变动不进读数。
 *
 * 病根（技术评审 2026-10-30 `F4` / `F5`，定形 `.team/leader/2026-11-07/定形-batch8.md` §一 #2/#3）：
 *   · `REV-04/E` 写的是 `dispatchShapes({ repo: PATHS.repo })` —— `PATHS.repo` 是**执行这一跑的那棵树**
 *     （2026-11-02 之前还是硬编码 `E:\Harness`）⇒ 拿副本跑套件时，"作业书 / 派工卡 / 契约"这一格
 *     判的是**另一棵树**。针本身读得到副本，但唯一的调用方从不要求它读。
 *   · 套件入口（`run-all.mjs` 的 `HERE`）/ 尺子（`PATHS.testRoot`）/ 体检脚本（`PATHS.checkNotes`）
 *     全部从 `REPO_ROOT` 派生；`REPO_ROOT` 一旦退回硬编码活树，`[尺子]` 与体检量的都是另一棵树。
 *
 * 两格各判三件事：
 *   `MCR-02`：① **静态**：`rev04` 的调用点参数**不是** `PATHS.repo`（把"针读副本"钉在调用方）；
 *            ② **行为**：`dispatchShapes({repo: 副本})` 三份载体都在副本里（`under_root`）且 `is_copy:true`；
 *            ③ **活树不动读数**：把**另一棵树**（与副本逐字节相同的 twin）里的三道针弄坏 ⇒
 *               副本那一次的读数**一字不变**，而 twin 自己的读数**必须红**（证明读数不是常量）。
 *   `MCR-03`：① `PATHS.{repo,testRoot,checkNotes}` 在一个导出副本里各指副本；
 *            ② 真跑 `run-all.mjs`（副本里、`--glob` 打一个不存在的文件）⇒ `[尺子]` 与 `[尺子·入口]`
 *               两行都点名副本；③ 真跑 `check-notes.mjs`（副本里）⇒ 它在**副本根**上看见一个哨兵文件
 *               （只在副本里存在）并点名它。
 *
 * 🔴 覆盖边界（这两格**不判**什么）：
 *   · 不判 `dispatchShapes` 的措辞判据本身对不对（那是 `REV-04/E` 的针；这里只判"读的是哪棵树"）；
 *   · 不判 `run-all.mjs` 的判词 / 退出码（这一跑 `--glob` 故意打一个不存在的文件，退出码必非零）；
 *   · 不判体检脚本的**结论**（它的红绿取决于机器现状；这里只判"它在哪棵树上看的"）。
 *   · 副本模式下 `PATHS.repo` **就是**副本 ⇒ "调用方退回 `PATHS.repo`"这件事**只有静态那一格抓得到**；
 *     活树模式下 `reading.root ≠ PATHS.repo` 也能抓。两种模式的抓法写在读数里。
 *
 * ## 参照树落在哪（**F1** · 技术评审 2026-11-07 `F1`；这条写在这里因为它是夹具的头号前提）
 * `MCR-02` ③ 需要"**另一棵树**"（与副本逐字节相同、被弄坏之后副本那一格不许动），`MCR-03` 需要一份
 * 可以随便写的工作副本；两者都是 `cpSync(副本, 落点)`。落点从前取 `<运行根>/fixtures/…`，而
 * **运行根必在 `<repo>/.team/` 下** —— 套件自己就是副本时（评审模式的唯一形态），源 = 整棵副本、
 * 落点 = 它自己的子目录 ⇒ `ERR_FS_CP_EINVAL`（"Cannot copy … to a subdirectory of self"）当场抛，
 * 于是票 (d)「针 / 入口 / 尺子都指副本」在**任何评审副本里都拿不到证据**。
 *
 * ⇒ 规则：**参照树只许落在被测副本之外**。落点 = `<副本的父目录>/.agenia-test-twins/<RUN_ID>/<label>`
 *   （活树模式：`<运行根>/fixtures/.agenia-test-twins/<RUN_ID>/…`；两种模式下它都在副本之外、同一块盘）；
 *   拷的时候**跳过 `.team/`** —— 那是这一跑的运行根与证据，拷进去只会把正在写的树复制一遍。
 *   ⚠️ 判断"在不在副本里"用 `canonical` + 路径分量（`isUnder`），不用字符串前缀；判到在副本里就
 *   **点名红**（`TWIN-BASE-INSIDE-COPY`），**不**去 cpSync 撞 EINVAL —— 崩溃不是判据。
 *   刀：`AGENIA_TEST_TWIN_BASE=<副本里面的某个目录>` ⇒ 那一格必须红且红在夹具上（见 log 的刀跑）。
 */
import { before, describe, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { PATHS, optionalEnv } from '../support/env.mjs'
import { caseFail, caseHold, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { canonical, isUnder } from '../support/root-guard.mjs'
import { dispatchShapes, exporterPath, git, runExport } from '../support/tree-at-commit.mjs'

before(() => {
  preflight()
})

/**
 * **参照树的底座**（`F1`）：只在被测副本**之外**。
 *   · 缺省 = `<副本的父目录>/.agenia-test-twins/<RUN_ID>`（父目录按定义不在副本里；同盘）；
 *   · `AGENIA_TEST_TWIN_BASE` 可以钉死它 —— **只给刀用**（钉在副本里面 ⇒ 这一格红在夹具上）。
 * @returns {{base:string, under_copy:boolean, pinned:boolean, source:string}}
 */
function referenceTreeBase({ copyRoot }) {
  const pinned = optionalEnv('AGENIA_TEST_TWIN_BASE')
  const copy = canonical(copyRoot)
  const base = pinned === null
    ? path.join(path.dirname(copy), '.agenia-test-twins', path.basename(runRoot()))
    : canonical(String(pinned))
  return { base, under_copy: isUnder(base, copy), pinned: pinned !== null, source: pinned === null ? 'sibling-of-the-reviewed-copy' : 'env:AGENIA_TEST_TWIN_BASE（刀）' }
}

/**
 * 拷一份树作参照 —— **跳过 `.team/`**（运行根 / 证据根都在那里，拷进去等于把正在写的树复制一遍）。
 * `to` 必须已经在副本之外（`referenceTreeBase()` 保证；调用方另外判一次）。
 */
function copyTree(source, to) {
  cpSync(source, to, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = path.relative(source, src).replace(/\\/g, '/')
      return rel !== '.team' && !rel.startsWith('.team/')
    },
  })
  return to
}

/** 子进程环境：去掉 `AGENIA_REPO_ROOT`（否则"派生"与"显式指定"分不清），临时件落运行根。 */
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  delete env.AGENIA_REPO_ROOT
  return env
}

/**
 * 这一跑的**评审对象那份副本**：
 *   · 这一跑本身就在副本里跑（套件那棵树没有 `.git`）⇒ 它就是副本（评审就是这么跑的）；
 *   · 在活树里跑 ⇒ 把 **HEAD** 导成纯树（派工 / 交付那一刻的提交）。
 *
 * 🔴 **"这一跑在哪棵树里"从 `import.meta.url` 推，不从 `PATHS.repo` 推**：`PATHS.repo` 正是
 *    `F-169` 要钉的那一格 —— 它一旦被改回活树，拿它判"我在不在副本里"就永远答"不在"，
 *    于是这一格会导出一份**新的**干净副本、把自己该抓的那次回退绕过去。测试文件自己的位置
 *    不会撒谎（副本里跑就解析到副本）。
 * 导出落点必须在被测树之外 / `.team/` 之下（`F-166` 之后工具会拒）⇒ 用运行根。
 */
function resolveReviewedCopy({ root, exporter, withStaging = false, label }) {
  const suiteTree = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  if (!existsSync(path.join(suiteTree, '.git'))) {
    return { root: suiteTree, source: 'suite-tree-is-a-copy (no .git)', problems: [], is_copy: true, suite_tree: suiteTree }
  }
  if (!exporter.exists) return { root: null, source: 'exporter-missing', problems: [`导出器不在：${exporter.file}`], is_copy: null, suite_tree: suiteTree }
  const head = git(['rev-parse', 'HEAD'], { cwd: suiteTree })
  if (head.status !== 0) return { root: null, source: 'head-unresolved', problems: [`git rev-parse HEAD 失败：${String(head.stderr).trim().slice(0, 200)}`], is_copy: null, suite_tree: suiteTree }
  const sha = String(head.stdout).trim()
  const out = path.join(root, 'fixtures', `mcr-${label}-copy`)
  const exp = runExport({ exporter: exporter.file, repo: suiteTree, commit: sha, out, withStaging })
  if (exp.exit !== 0 || exp.json === null) {
    return { root: null, source: `export-failed (exit=${exp.exit})`, problems: [`导出副本失败：${String(exp.stderr).trim().slice(0, 200)}`], is_copy: null, suite_tree: suiteTree }
  }
  return { root: out, source: `export HEAD ${sha.slice(0, 12)}…${withStaging ? ' + staging' : ''}`, commit: sha, problems: [], is_copy: true, suite_tree: suiteTree }
}

/** 把 `dispatchShapes` 的读数里"哪份载体在哪棵树上"提出来（结构格，不靠调用方自觉）。 */
function shapeRootReading(shapes) {
  return {
    root: shapes.readings.root,
    is_copy: shapes.readings.is_copy,
    files: Object.fromEntries(Object.entries(shapes.readings.files).map(([k, v]) => [k, { file: v.file, under_root: v.under_root, exists: v.exists }])),
    missing: shapes.readings.missing,
    problems: shapes.problems.map((p) => p.code),
  }
}

describe('integration · measuring/copy (MCR) · F-168 针读副本', () => {
  test('MCR-02 REV-04/E 的针读的是副本：静态调用点 + 副本读数 + 活树 twin 不动它', async () => {
    await runCase('MCR-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const root = runRoot()

      // ── ① 静态：唯一的调用点**不许**是 `PATHS.repo` ─────────────────────────
      /** 这一跑在哪棵树里（从测试文件自己的位置推；`PATHS.repo` 正是被钉的那一格，不能拿它判）。 */
      const suiteTree = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
      const rev04File = path.join(suiteTree, 'tests', 'agenia-upgrade', 'integration', 'rev04-review-copy-valid.test.mjs')
      const raw = existsSync(rev04File) ? readFileSync(rev04File, 'utf8') : null
      /**
       * ⚠️ 搜之前先**去注释**：REV-04 的文件头里就写着"从前这里写的是 `dispatchShapes({ repo: PATHS.repo })`"
       * —— 拿整份源码搜，命中的是**那句注释**（"这个词没了"变成假红；反过来，只搜带空格的写法也会假绿，
       * 2026-11-07 组长在 `resolve(cwd,'.team')` 上踩过同一脚）。这里两种写法都去注释后再搜。
       */
      const src = raw === null ? null : raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
      const callSites = src === null ? [] : [...src.matchAll(/dispatchShapes\(\{([^}]*)\}\)/g)].map((m) => m[1].replace(/\s+/g, ' ').trim())
      /**
       * 搜串**只钉针的那一处**：`PATHS.repo` 在 REV-04 里还有另外 3 处，它们是导出器 / 校验器的
       * `--repo`（**被读的那个 git 仓库**）—— 那 3 处是对的，拿一个宽搜串会把它们一起判红
       * （"同一个词两个意思"，`cand-20261023-0249`）。所以钉的是 `dispatchShapes({ … repo: PATHS.repo … })`。
       */
      const liveNeedleHits = src === null ? null : (src.match(/dispatchShapes\(\{[^}]*repo:\s*PATHS\.repo/g) ?? []).length
      const allRepoHits = src === null ? null : (src.match(/repo:\s*PATHS\.repo/g) ?? []).length
      rec.readings.call_site = {
        file: rev04File,
        exists: raw !== null,
        comments_stripped: raw !== null,
        call_sites: callSites,
        /** 搜的串（"这个词没了"要贴搜串）：去注释后的源码里 `dispatchShapes({…repo: PATHS.repo})` 出现几处。 */
        searched: 'dispatchShapes\\(\\{[^}]*repo:\\s*PATHS\\.repo',
        dispatch_shapes_live_hits: liveNeedleHits,
        /** 宽搜串的命中数（**读数**，不是判据）：那 3 处是 exporter 的 `--repo`，本来就该是活树。 */
        all_repo_paths_repo_hits: allRepoHits,
      }
      if (src === null) {
        push('CALL-SITE-UNREADABLE', `读不到 REV-04 的源码：${rev04File} —— "针读副本"这条口径就没有可核的落点`)
      } else {
        if (callSites.length !== 1) push('CALL-SITE-SHAPE', `REV-04 里 \`dispatchShapes({...})\` 的调用点应恰好 1 处，实得 ${callSites.length} 处：${JSON.stringify(callSites)}`)
        if (liveNeedleHits !== 0) {
          push('CALL-SITE-STILL-LIVE', `REV-04 里仍有 \`dispatchShapes({... repo: PATHS.repo})\`（搜串 \`dispatchShapes\\(\\{[^}]*repo:\\s*PATHS\\.repo\` 命中 ${liveNeedleHits} 处）—— 针读的是**执行这一跑的那棵树**，拿副本跑套件时这一格就判另一棵树（F-168 原样回来）`)
        }
        if (callSites.length === 1 && /^repo:\s*PATHS\.repo$/.test(callSites[0])) {
          push('CALL-SITE-STILL-LIVE', `REV-04 的调用点参数就是 \`PATHS.repo\`：${JSON.stringify(callSites[0])}`)
        }
      }

      // ── ② 行为：针在副本上读（三份载体都在副本里）────────────────────────────
      const ex = exporterPath()
      const copy = resolveReviewedCopy({ root, exporter: ex, label: 'mcr02' })
      rec.readings.reviewed_copy = copy
      if (copy.root === null) {
        caseHold(rec, 'F168-NO-COPY', `造不出"评审对象那份副本"（${copy.source}）：${copy.problems.join('；')} —— 这一格判不了（不拿活树顶替）`)
        caseFail(problems)
        return
      }
      const shapes = dispatchShapes({ repo: copy.root })
      const copyRoot = path.resolve(copy.root)
      const first = shapeRootReading(shapes)
      rec.readings.dispatch_shapes_copy = first
      for (const p of shapes.problems) problems.push(p)
      if (first.is_copy !== true) push('NEEDLE-NOT-A-COPY', `\`dispatchShapes\` 读的那棵树没有 \`.git\` 才算副本，它报 \`is_copy=${JSON.stringify(first.is_copy)}\`（root=${first.root}）`)
      if (path.resolve(first.root) !== path.resolve(copy.root)) {
        push('NEEDLE-READ-OTHER-TREE', `\`dispatchShapes\` 读的根 ${first.root} ≠ 这一跑钉住的副本 ${copy.root}`)
      }
      for (const [key, f] of Object.entries(first.files)) {
        if (f.under_root !== true) push('NEEDLE-FILE-OUTSIDE', `载体 ${key}（${f.file}）不在副本 ${copy.root} 里 —— 这一针读的是另一棵树`)
      }
      /**
       * ⚠️ **不要**用"路径落在 `PATHS.repo` 之下"判"读的是活树"：副本按 `F-166` 必须落进
       * 被测根之外 **或** `.team/` 这种被排除表挡住的前缀 —— 而运行根就在 `<repo>/.team/` 里，
       * 所以**合法的副本**天然在活树路径之下。判"读的是哪棵树"只用 `readings.root` 与 `under_root`：
       * 那两样钉的是"就是这份副本"，不是字符串前缀。
       */
      if (copyRoot !== path.resolve(PATHS.repo) && path.resolve(first.root) === path.resolve(PATHS.repo)) {
        push('NEEDLE-READ-LIVE', `副本那一次读数的 \`root\` 就是活树 ${PATHS.repo} —— 指针没有落在副本上`)
      }

      // ── ③ 活树 twin：另一棵树被弄坏，副本这一格**不动**；twin 自己必须红 ─────────
      // 🔴 `F1`：twin 的落点**必须在副本之外**（拷进自己的子目录 = `ERR_FS_CP_EINVAL`；
      //    而套件自己就是副本时，运行根必在它里面 —— 那正是评审模式的唯一形态）。
      const twinBase = referenceTreeBase({ copyRoot: copy.root })
      rec.readings.twin_base = twinBase
      if (twinBase.under_copy) {
        push('TWIN-BASE-INSIDE-COPY', `参照树（twin）的落点会落在被测副本里面：${twinBase.base} ⊂ ${canonical(copy.root)}（来源 ${twinBase.source}）`
          + ' —— 拷进自己的子目录必然 ERR_FS_CP_EINVAL，这一格就不再有样本（F1 的原样）。参照树只许落在副本之外')
      }
      const twin = path.join(twinBase.base, 'mcr02-live-twin')
      let stable = false
      let stepHits = -1
      let twinReading = null
      if (!twinBase.under_copy) {
        mkdirSync(twinBase.base, { recursive: true })
        copyTree(copy.root, twin)
        const leaderFile = path.join(twin, 'presets', 'agenia', 'leader.md')
        const contractFile = path.join(twin, 'CONTRACT.md')
        const leaderSrc = readFileSync(leaderFile, 'utf8')
        const stepAnchor = '**三、'
        stepHits = leaderSrc.split(stepAnchor).length - 1
        writeFileSync(leaderFile, leaderSrc.split(stepAnchor).join('**第三、'), 'utf8')
        const contractSrc = readFileSync(contractFile, 'utf8')
        const dropped = contractSrc.split(/\r?\n/).filter((l) => !l.includes('F-160'))
        writeFileSync(contractFile, dropped.join('\n'), 'utf8')
        const second = shapeRootReading(dispatchShapes({ repo: copy.root }))
        twinReading = shapeRootReading(dispatchShapes({ repo: twin }))
        stable = JSON.stringify({ ...first, root: '<same>' }) === JSON.stringify({ ...second, root: '<same>' })
        rec.readings.live_movement = {
          twin,
          twin_mutations: { leader_step_heading_hits: stepHits, contract_f160_lines_dropped: contractSrc.split(/\r?\n/).length - dropped.length },
          reading_stable: stable,
          copy_before: first,
          copy_after: second,
          twin_reading: twinReading,
        }
        if (!stable) push('LIVE-MOVED-THE-READING', '把**另一棵树**（twin）里的载体弄坏之后，副本那一次的读数变了 —— 这一格读的不是副本，是"别的什么树"（活树一动手它就翻）')
        if (stepHits !== 1) push('TWIN-FIXTURE', `twin 的 fixtures：\`${stepAnchor}\` 在 leader.md 里命中 ${stepHits} 处（应恰好 1 处）—— twin 造坏了，"twin 必须红"那一格就没样本`)
        for (const code of ['CARD-STEP-MISSING', 'CONTRACT-F160-SENTENCE-MISSING']) {
          if (!twinReading.problems.includes(code)) push('TWIN-NOT-RED', `twin（三道针被弄坏的那棵树）应当红 \`${code}\`，实得 ${JSON.stringify(twinReading.problems)} —— 针在"指到坏树"时不红，那"副本不动"也就是一句空话`)
        }
      }

      caseFail(problems)
    })
  })
})

describe('integration · measuring/copy (MCR) · F-169 入口/尺子/体检指副本', () => {
  test('MCR-03 套件入口 / 尺子 / 体检脚本都指副本：真跑三处 + 把根打回活树的刀', async () => {
    await runCase('MCR-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const root = runRoot()
      const ex = exporterPath()
      const copy = resolveReviewedCopy({ root, exporter: ex, withStaging: true, label: 'mcr03' })
      rec.readings.reviewed_copy = copy
      if (copy.root === null) {
        caseHold(rec, 'F169-NO-COPY', `造不出"评审对象那份副本"（${copy.source}）：${copy.problems.join('；')} —— 这一格判不了（不拿活树顶替）`)
        caseFail(problems)
        return
      }
      /**
       * 🔴 **这一格会写东西**（哨兵 / 运行根 / 跑一次 `run-all`）⇒ 一律写在一份**工作副本**上，
       *    绝不动"评审对象那份副本"：评审期间那份副本必须**逐字不变**（否则这次评审作废）。
       *    活树模式：`resolveReviewedCopy` 已经导出了一份（它是副本）；
       *    副本模式：那一份**就是评审对象** ⇒ 再拷一份（跳过 `.team`，否则运行根会被自己递归拷进去）。
       *
       * 🔴 `F1`：工作副本的落点**必须在被测副本之外** —— 拷进自己的子目录 = `ERR_FS_CP_EINVAL`，
       *    而"套件自己就是副本"正是评审模式的唯一形态。落点规则与 `MCR-02` 的参照树同一条
       *    （`referenceTreeBase()`：`<副本的父目录>/.agenia-test-twins/<RUN_ID>/…`）。
       */
      const suiteTree = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
      let copyRoot = path.resolve(copy.root)
      const workingBase = referenceTreeBase({ copyRoot })
      rec.readings.working_base = workingBase
      if (workingBase.under_copy) {
        push('WORKING-BASE-INSIDE-COPY', `工作副本的落点会落在被测副本里面：${workingBase.base} ⊂ ${canonical(copyRoot)}（来源 ${workingBase.source}）`
          + ' —— 拷进自己的子目录必然 ERR_FS_CP_EINVAL（F1 的原样）；工作副本只许落在副本之外')
        caseFail(problems)
        return
      }
      if (copyRoot === suiteTree) {
        mkdirSync(workingBase.base, { recursive: true })
        const working = path.join(workingBase.base, 'mcr03-working-copy')
        copyTree(copyRoot, working)
        copyRoot = working
        rec.readings.working_copy = { root: working, source: 'copy-of-the-suite-tree (excluding .team/) · outside the reviewed copy' }
      }
      const under = (p) => {
        const rel = path.relative(copyRoot, path.resolve(p))
        return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
      }

      // ── ① 尺子 / 体检脚本：从副本里 import 一次，看它自己报哪棵树 ────────────────
      const envFile = path.join(copyRoot, 'tests', 'agenia-upgrade', 'support', 'env.mjs')
      const probeCode = 'import(process.argv[1]).then((m) => console.log(JSON.stringify({'
        + 'repo: m.PATHS.repo, testRoot: m.PATHS.testRoot, checkNotes: m.PATHS.checkNotes,'
        + 'stagingRoot: m.PATHS.stagingRoot, livePreset: m.PATHS.finalPreset, source: m.ROOT_SOURCE })))'
      const probe = spawnSync(process.execPath, ['-e', probeCode, pathToFileURL(envFile).href], {
        cwd: root, encoding: 'utf8', timeout: 120000, env: cleanEnv(),
      })
      let paths = null
      try { paths = JSON.parse(String(probe.stdout).trim().split('\n').pop()) } catch { paths = null }
      rec.readings.paths_probe = { file: envFile, exit: probe.status, paths, stderr: String(probe.stderr ?? '').slice(-400) }
      if (probe.status !== 0 || paths === null) {
        push('PATHS-PROBE-FAILED', `从副本里 import \`support/env.mjs\` 读不出 \`PATHS\`：exit=${probe.status} · ${String(probe.stderr ?? '').slice(-300)}`)
      } else {
        if (!under(paths.repo)) push('RULER-NOT-COPY', `\`PATHS.repo\` = ${paths.repo} 不在副本 ${copyRoot} 里（来源 ${paths.source}）—— 尺子的根又钉回活树了`)
        if (!under(paths.testRoot)) push('RULER-NOT-COPY', `\`PATHS.testRoot\` = ${paths.testRoot} 不在副本里 —— \`[尺子]\` 量的会是活树那棵测试树`)
        if (!under(paths.checkNotes)) push('RULER-NOT-COPY', `\`PATHS.checkNotes\` = ${paths.checkNotes} 不在副本里 —— 体检脚本会去量另一棵树`)
        if (!existsSync(paths.checkNotes)) push('HEALTH-SCRIPT-MISSING', `副本里没有体检脚本：${paths.checkNotes}`)
        /**
         * ⚠️ **"读的是活树"不许用路径前缀判**：运行根就在 `<repo>/.team/` 里，副本按 `F-166` 的规矩
         * 只能落在被测根之外或 `.team/` 之下 ⇒ 合法副本的路径**天然**在活树路径之下。判据是**同值/不同值**：
         * 三处都不许**等于**活树那三处（同时 `under(copyRoot)` 已经钉住"在副本里"）。
         */
        if (copyRoot !== path.resolve(PATHS.repo)) {
          for (const [key, live] of [['repo', PATHS.repo], ['testRoot', PATHS.testRoot], ['checkNotes', PATHS.checkNotes]]) {
            if (path.resolve(paths[key]).toLowerCase() === path.resolve(live).toLowerCase()) {
              push('RULER-READ-LIVE', `\`PATHS.${key}\` 与活树那一处**同值**（${paths[key]}）—— 这一跑量的是活树`)
            }
          }
        }
      }

      // ── ② 套件入口：真跑一次（`--glob` 打一个不存在的文件；只看它报的是哪棵树）────────
      const entryFile = path.join(copyRoot, 'tests', 'agenia-upgrade', 'run-all.mjs')
      const entryRunRoot = path.join(copyRoot, '.team', 'test', '2026-11-07', '_runs', 'mcr03-entry')
      mkdirSync(entryRunRoot, { recursive: true })
      const entry = spawnSync(process.execPath, [entryFile, `--run-root=${entryRunRoot}`, '--glob=tests/agenia-upgrade/static/__mcr03-none__.test.mjs'], {
        cwd: copyRoot, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024,
        env: cleanEnv({ TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp') }),
      })
      const judgement = existsSync(path.join(entryRunRoot, 'judgement.txt'))
        ? readFileSync(path.join(entryRunRoot, 'judgement.txt'), 'utf8')
        : ''
      const rulerLine = judgement.split(/\r?\n/).find((l) => l.startsWith('[尺子] 覆盖：')) ?? null
      const entryLine = judgement.split(/\r?\n/).find((l) => l.startsWith('[尺子·入口] run-all.mjs')) ?? null
      rec.readings.entry_run = {
        file: entryFile, run_root: entryRunRoot, exit: entry.status,
        ruler_line: rulerLine, entry_line: entryLine,
        stdout_tail: String(entry.stdout ?? '').slice(-1200), stderr_tail: String(entry.stderr ?? '').slice(-400),
      }
      const copyTests = path.join(copyRoot, 'tests', 'agenia-upgrade')
      if (rulerLine === null) {
        push('ENTRY-RULER-LINE-MISSING', `\`run-all.mjs\` 的 judgement.txt 里没有 \`[尺子] 覆盖：\` 那一行（exit=${entry.status}）—— 这一跑的"尺子量的是哪棵树"没有落点`)
      } else if (!rulerLine.includes(copyTests)) {
        push('ENTRY-RULER-NOT-COPY', `\`[尺子]\` 那一行没有点名副本的测试树 ${copyTests}：${rulerLine.slice(0, 300)}`)
      } else if (copyRoot !== path.resolve(PATHS.repo) && rulerLine.includes(PATHS.testRoot)) {
        push('ENTRY-RULER-NOT-COPY', `\`[尺子]\` 那一行里有**活树那棵测试树**的路径 ${PATHS.testRoot}：${rulerLine.slice(0, 300)}`)
      }
      if (entryLine === null) {
        push('ENTRY-IDENTITY-LINE-MISSING', `\`[尺子·入口]\` 那一行不在 judgement.txt 里（exit=${entry.status}）—— "跑的是哪一份入口"没有落点`)
      } else if (!entryLine.includes(path.join(copyTests, 'run-all.mjs'))) {
        push('ENTRY-IDENTITY-NOT-COPY', `\`[尺子·入口]\` 没有点名副本的入口 ${path.join(copyTests, 'run-all.mjs')}：${entryLine.slice(0, 300)}`)
      }

      // ── ③ 体检脚本：在副本根上放一个哨兵，它必须看见（且只在副本里）──────────────
      const sentinel = 'mcr03-root-sentinel.txt'
      writeFileSync(path.join(copyRoot, sentinel), 'sentinel（只在副本根上；活树没有这一份）\n', 'utf8')
      const health = spawnSync(process.execPath, [path.join(copyRoot, '.tools', 'check-notes.mjs')], {
        cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024, env: cleanEnv(),
      })
      const healthOut = String(health.stdout ?? '')
      rec.readings.health_run = {
        file: path.join(copyRoot, '.tools', 'check-notes.mjs'), exit: health.status,
        sentinel, names_sentinel: healthOut.includes(sentinel),
        stray_line: healthOut.split(/\r?\n/).find((l) => l.includes('仓库根只许出现白名单里的条目')) ?? null,
        stderr_tail: String(health.stderr ?? '').slice(-400),
      }
      if (!healthOut.includes(sentinel)) {
        push('HEALTH-NOT-ON-COPY', `\`check-notes.mjs\`（副本里那一份）没有看见副本根上的哨兵 \`${sentinel}\`（exit=${health.status}）—— 它量的不是副本那棵树，或者它压根没跑到"仓库根白名单"那一条`)
      }

      // ── 刀：把根打回活树 ⇒ 上面两条必须**看得见**这个差别 ──────────────────────
      const guardFile = path.join(copyRoot, 'tests', 'agenia-upgrade', 'support', 'root-guard.mjs')
      const guardSrc = readFileSync(guardFile, 'utf8')
      const guardAnchor = /return \{ root: path\.resolve\(here, '\.\.', '\.\.', '\.\.'\), source: 'derived:import\.meta\.url' \}/
      const guardHits = guardSrc.split(guardAnchor).length - 1
      let guardPatched = null
      if (guardHits !== 1) {
        push('KNIFE-ANCHOR', `刀的锚点在 root-guard.mjs 里命中 ${guardHits} 处（应恰好 1 处）—— 刀钝了：把根钉回活树也不会红`)
      } else {
        writeFileSync(guardFile, guardSrc.replace(guardAnchor, `return { root: ${JSON.stringify(path.resolve(PATHS.repo))}, source: 'knifed-hardcoded' }`), 'utf8')
        const probe2 = spawnSync(process.execPath, ['-e', probeCode, pathToFileURL(envFile).href], {
          cwd: root, encoding: 'utf8', timeout: 120000, env: cleanEnv(),
        })
        let paths2 = null
        try { paths2 = JSON.parse(String(probe2.stdout).trim().split('\n').pop()) } catch { paths2 = null }
        guardPatched = { exit: probe2.status, paths: paths2 }
        writeFileSync(guardFile, guardSrc, 'utf8')
        if (paths2 === null) {
          push('KNIFE-NO-BITE', `把副本里的 \`root-guard.mjs\` 钉回活树之后，\`PATHS\` 探针读不出东西（exit=${probe2.status}）—— 这一刀没量到差别`)
        } else if (path.resolve(paths2.testRoot ?? '').toLowerCase() !== path.resolve(PATHS.testRoot).toLowerCase()) {
          push('KNIFE-NO-BITE', `把副本里的 \`root-guard.mjs\` 钉回活树之后，\`PATHS.testRoot\` 仍是 ${paths2.testRoot}（期望回到活树 ${PATHS.testRoot}）—— 探针分辨不出两棵树，"指副本"这条判据就是空话`)
        }
      }
      rec.readings.knife_root = { file: guardFile, anchor: String(guardAnchor), anchor_hits: guardHits, patched: guardPatched }

      const healthKnifeFile = path.join(copyRoot, '.tools', 'check-notes.mjs')
      const healthSrc = readFileSync(healthKnifeFile, 'utf8')
      const healthAnchor = "const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')"
      const healthHits = healthSrc.split(healthAnchor).length - 1
      let healthKnife = null
      if (healthHits !== 1) {
        push('KNIFE-ANCHOR', `体检脚本那把刀的锚点命中 ${healthHits} 处（应恰好 1 处）`)
      } else {
        writeFileSync(healthKnifeFile, healthSrc.replace(healthAnchor, `const REPO = ${JSON.stringify(path.resolve(PATHS.repo))}`), 'utf8')
        const health2 = spawnSync(process.execPath, [healthKnifeFile], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024, env: cleanEnv() })
        const out2 = String(health2.stdout ?? '')
        writeFileSync(healthKnifeFile, healthSrc, 'utf8')
        healthKnife = { exit: health2.status, names_sentinel: out2.includes(sentinel) }
        if (out2.includes(sentinel)) {
          push('KNIFE-NO-BITE', `把体检脚本的根钉回活树之后，它仍然点名了只在副本里存在的哨兵 \`${sentinel}\` —— 那一格量的不是它自己的根`)
        }
      }
      rec.readings.knife_health = { file: healthKnifeFile, anchor: healthAnchor, anchor_hits: healthHits, patched: healthKnife }

      caseFail(problems)
    })
  })
})
