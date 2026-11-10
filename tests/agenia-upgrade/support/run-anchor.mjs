/**
 * **这一跑属于哪个提交** —— 唯一解析器（`RCA-01`；契约 §7.1）。
 *
 * 两个消费者，一份判定：
 *   · `run-all.mjs` —— 起跑那一刻调一次，把结果落成 `<运行根>/run-anchor.json`，之后**只渲染**这份读数；
 *   · `integration/flip01-bridge-reading.test.mjs` —— 它要的"这一版是哪一份 `inject.js`"同一个入口。
 *
 * 口径（唯一一条）：
 *   · `git rev-parse --show-toplevel` 的顶层**等于**仓库根 ⇒ **活树** ⇒ `git rev-parse HEAD`；
 *   · 否则 ⇒ **副本** ⇒ **只认显式来历**：`AGENIA_COPY_COMMIT=<40 hex>` 或
 *     `AGENIA_COPY_PROVENANCE=<导出 JSON 的路径>` 的 `commit` 字段；
 *   · 副本**没有**来历 ⇒ `state: 'unknown'`（判不了）—— 🔴 **不许**落回活树的 `HEAD`：
 *     副本嵌在活树的工作树里时 git 会一路走到活树的 `.git`，"判的是哪个提交"就变成了"今天活体是哪个提交"。
 *
 * 三种输出（渲染层只看这三个字段，不再碰盘）：
 *   - `anchorLineOf()`：`[锚] 提交 <40hex> · 来源=…` / `[锚] 提交 判不了 · 来源=… · 原因=…`
 *   - `anchorVerdict()`：行 vs **读数** vs **独立量到的真值** ⇒ 码（`RCA-*`）。
 *
 * 为什么要两段式（量一次 / 渲染多次）：判据钉的是"**起跑那一刻**的 `HEAD`"。
 * 让渲染函数也能读盘，它就随时能重测一次 ⇒ 收口时的 `HEAD` 会悄悄顶替起跑时的 `HEAD`，
 * 而行看上去仍然"有提交号"。⇒ 渲染是纯函数：给什么读数就渲什么，`head_git_calls === 1` 由测量侧自报。
 */
import { readFileSync, realpathSync } from 'node:fs'
import { git as gitRunnerDefault } from './tree-at-commit.mjs'

export const COPY_COMMIT_ENV = 'AGENIA_COPY_COMMIT'
export const COPY_PROVENANCE_ENV = 'AGENIA_COPY_PROVENANCE'

/** 一个提交号的形状（小写化之后进读数；大小写不是提交号的一部分）。 */
const HEX40 = /^[0-9a-f]{40}$/i

/** 两个路径是否同一个位置（`realpath` 后再比；解析失败 ⇒ `false`，缺值不算"相同"）。 */
function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.trim() === '' || b.trim() === '') return false
  try {
    return realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase()
  } catch {
    return false
  }
}

/**
 * 显式来历（**只给副本用**）：`AGENIA_COPY_COMMIT` 先看，其次 `AGENIA_COPY_PROVENANCE` 指的那份 JSON。
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {{commit:string|null, source:string, why:string|null, tried:string[]}}
 *   `why` 非空 ⇒ 给了来历但读不出来（调用方把这句话原样带进"判不了"的原因里）。
 */
export function explicitCopyCommitOf(env = process.env) {
  const tried = []
  const rawCommit = String(env[COPY_COMMIT_ENV] ?? '').trim()
  if (rawCommit !== '') {
    tried.push(`${COPY_COMMIT_ENV}=${rawCommit}`)
    if (HEX40.test(rawCommit)) return { commit: rawCommit.toLowerCase(), source: `env:${COPY_COMMIT_ENV}`, why: null, tried }
  }
  const provFile = String(env[COPY_PROVENANCE_ENV] ?? '').trim()
  if (provFile === '') {
    return { commit: null, source: 'copy:no-provenance', why: null, tried }
  }
  tried.push(`${COPY_PROVENANCE_ENV}=${provFile}`)
  let parsed = null
  try {
    parsed = JSON.parse(readFileSync(provFile, 'utf8'))
  } catch (err) {
    return {
      commit: null,
      source: `env:${COPY_PROVENANCE_ENV}=${provFile}`,
      why: `\`${COPY_PROVENANCE_ENV}\` 指的那份文件读不出来 / 不是 JSON（${String(err?.message ?? err).slice(0, 160)}）`,
      tried,
    }
  }
  const fromFile = String(parsed?.commit ?? '').trim()
  if (!HEX40.test(fromFile)) {
    return {
      commit: null,
      source: `env:${COPY_PROVENANCE_ENV}=${provFile}`,
      why: `\`${COPY_PROVENANCE_ENV}\` 那份 JSON 里没有 40 位 \`commit\`（收到 ${JSON.stringify(String(parsed?.commit ?? ''))}）`,
      tried,
    }
  }
  return { commit: fromFile.toLowerCase(), source: `env:${COPY_PROVENANCE_ENV}=${provFile}（导出 JSON 的 commit）`, why: null, tried }
}

/**
 * **量一次**：这一跑在活树上还是副本上、属于哪个提交。
 *
 * @param {object} input
 * @param {string} input.repo            这一跑的仓库根（入口的 `--repo` / 测试文件自己那棵树）
 * @param {Record<string, string|undefined>} [input.env]  来历从哪儿读（缺省 `process.env`）
 * @param {(args:string[], opts:{cwd:string}) => {status:number|null, stdout:string|Buffer, stderr:string}} [input.git]
 *   git 跑法可换（刀与夹具用假输入量翻面；真跑用 `tree-at-commit.mjs` 那一份，与全树同一个 git 封装）
 * @returns {{
 *   state:'commit'|'unknown', commit:string|null, source:string, why:string|null,
 *   is_copy:boolean, repo:string, toplevel:string|null,
 *   measured_at:string, git_calls:number, head_git_calls:number, tried:string[]
 * }}
 */
export function readRunAnchor({ repo, env = process.env, git = gitRunnerDefault } = {}) {
  const measuredAt = new Date().toISOString()
  /** 记一次 git 调用（"量一次"的读数靠它，不靠人自觉）。 */
  let gitCalls = 0
  const runGit = (args) => {
    gitCalls += 1
    return git(args, { cwd: repo })
  }
  const top = runGit(['rev-parse', '--show-toplevel'])
  const topPath = top.status === 0 ? String(top.stdout ?? '').trim() : ''
  const isCopy = !samePath(topPath, repo)
  const base = { is_copy: isCopy, repo, toplevel: topPath === '' ? null : topPath, measured_at: measuredAt, tried: [] }

  if (isCopy) {
    const explicit = explicitCopyCommitOf(env)
    const whyParts = [
      `这一跑读的是一份**副本**（\`git rev-parse --show-toplevel\` = ${JSON.stringify(topPath)} ≠ 仓库根 ${JSON.stringify(repo)}），`,
      '而"它是哪个提交导出来的"没有来历：副本必须是纯树，所以来历不能写在副本里',
    ]
    if (explicit.why !== null) whyParts.push(`；给了来历但读不出来：${explicit.why}`)
    const why = `${whyParts.join('')}；请用 \`${COPY_COMMIT_ENV}=<40 hex>\` 或 \`${COPY_PROVENANCE_ENV}=<导出 JSON 的路径>\` 指过来`
      + '（不指 ⇒ 判不了，不许猜，也不许借活树的 HEAD）'
    if (explicit.commit === null) {
      return {
        ...base,
        state: 'unknown',
        commit: null,
        source: explicit.why === null ? 'copy:no-provenance' : 'copy:provenance-unreadable',
        why,
        git_calls: gitCalls,
        head_git_calls: 0,
        tried: explicit.tried,
      }
    }
    return {
      ...base,
      state: 'commit',
      commit: explicit.commit,
      source: `copy:${explicit.source}`,
      why: null,
      git_calls: gitCalls,
      head_git_calls: 0,
      tried: explicit.tried,
    }
  }

  const head = runGit(['rev-parse', 'HEAD'])
  const headSha = head.status === 0 ? String(head.stdout ?? '').trim() : ''
  if (!HEX40.test(headSha)) {
    return {
      ...base,
      state: 'unknown',
      commit: null,
      source: 'live:head-unreadable',
      why: `活树上 \`git rev-parse HEAD\` 读不出 40 位提交号（exit=${head.status} · stderr=${JSON.stringify(String(head.stderr ?? '').trim().slice(0, 200))}）`
        + ' —— 这一跑属于哪个提交判不了',
      git_calls: gitCalls,
      head_git_calls: 1,
      tried: [],
    }
  }
  return {
    ...base,
    state: 'commit',
    commit: headSha.toLowerCase(),
    source: '现役活树的 HEAD（起跑时量一次 · git rev-parse HEAD）',
    why: null,
    git_calls: gitCalls,
    head_git_calls: 1,
    tried: [],
  }
}

/**
 * 渲染**那一行**（纯函数：不碰盘、不读 env、拿不到 `repo` ⇒ 重测不了）。
 *
 * 两种形状（同一句组里紧跟 `F57-SETTLE`）：
 *   `[锚] 提交 <40hex> · 来源=<哪一处来源>`
 *   `[锚] 提交 判不了 · 来源=<哪一处尝试过> · 原因=<为什么>（不猜）`
 *
 * @param {{state:string, commit:string|null, source:string, why:string|null}} anchor
 * @returns {string}
 */
export function anchorLineOf(anchor) {
  const source = String(anchor?.source ?? '(来源未给)')
  if (anchor?.state === 'commit' && typeof anchor.commit === 'string' && HEX40.test(anchor.commit)) {
    return `[锚] 提交 ${anchor.commit.toLowerCase()} · 来源=${source}`
  }
  const reason = String(anchor?.why ?? '').trim() === '' ? '读数里没有原因（这本身就是缺陷：判不了必须说为什么）' : String(anchor.why)
  return `[锚] 提交 判不了 · 来源=${source} · 原因=${reason}`
}

/** 从一份 `judgement.txt`（或任何行数组）里挑出锚点行与结算行（行首匹配，不猜位置）。 */
export function anchorLinesIn(lines) {
  const all = Array.isArray(lines) ? lines : String(lines ?? '').split(/\r?\n/)
  const at = []
  all.forEach((line, index) => { if (String(line).startsWith('[锚] ')) at.push({ index, line: String(line) }) })
  const settle = all.findIndex((line) => String(line).startsWith('F57-SETTLE '))
  return { anchor: at, settle_index: settle }
}

/**
 * **锚点这一格判什么**（纯函数；真跑与刀喂同一份）。
 *
 * 三件事各自承重：
 *   ① 行在、只有一行、且紧跟 `F57-SETTLE`（同一句组）；
 *   ② 行**是那份读数的渲染**（`anchorLineOf(anchor)` 逐字相同）⇒ 不是收口时重测的、也不是手打的；
 *   ③ 行与**独立量到的真值**同值 ⇒ 猜的（unknown 却带哈希）与错的（哈希 ≠ 真值）都红。
 *
 * @param {object} input
 * @param {string[]|string} input.lines        `judgement.txt` 的行（或全文）
 * @param {object} input.anchor               起跑那一刻落盘的那份读数（`run-anchor.json`）
 * @param {{state:'commit'|'unknown', commit:string|null, source:string}} input.truth 判据自己独立量到的真值
 * @returns {{ok:boolean, codes:string[], problems:Array<{code:string,message:string}>, line:string|null}}
 */
export function anchorVerdict({ lines, anchor, truth } = {}) {
  const problems = []
  const push = (code, message) => problems.push({ code, message })
  const { anchor: anchors, settle_index: settleIndex } = anchorLinesIn(lines)
  const line = anchors.length > 0 ? anchors[0].line : null

  if (anchors.length === 0) {
    push('RCA-LINE-MISSING', '`judgement.txt` 里没有 `[锚] 提交 …` 那一行 —— 这一跑属于哪个提交仍然只是一句假设')
  } else if (anchors.length > 1) {
    push('RCA-LINE-DUPLICATE', `\`[锚]\` 行出现了 ${anchors.length} 次（第 ${anchors.map((a) => a.index + 1).join(' / ')} 行）—— 一份读数只许有一个提交号`)
  }
  if (settleIndex < 0) {
    push('RCA-GROUP-MISSING', '`judgement.txt` 里没有 `F57-SETTLE` 行 ⇒ "同一句组"没有落点')
  } else if (anchors.length === 1 && anchors[0].index !== settleIndex + 1) {
    push('RCA-NOT-IN-GROUP', `\`[锚]\` 行在第 ${anchors[0].index + 1} 行、\`F57-SETTLE\` 在第 ${settleIndex + 1} 行`
      + ' —— 它必须是结算行的**下一行**（同一句组；挪到别处就不是这一跑的锚）')
  }

  if (line !== null && anchor !== undefined && anchor !== null) {
    const want = anchorLineOf(anchor)
    if (line !== want) {
      push('RCA-NOT-FROM-READING', `\`[锚]\` 行与起跑那一刻落盘的读数渲染出来的那一行不同：行 ${JSON.stringify(line)} ≠ 读数 ${JSON.stringify(want)}`
        + ' —— 行不是由那份读数渲染的（收口时重测 / 手打 / 读数被换掉，三者都长这样）')
    }
  }

  const hashed = line === null ? [] : [...line.matchAll(/[0-9a-f]{40}/gi)].map((m) => m[0].toLowerCase())
  const saysCannotJudge = line !== null && line.includes('判不了')
  if (truth !== undefined && truth !== null) {
    if (truth.state === 'unknown') {
      if (hashed.length > 0) {
        push('RCA-GUESSED-HASH', `真值说"判不了"（${truth.source ?? 'unknown'}），而行里带着提交号 ${JSON.stringify(hashed)} —— 判不了的时候一个哈希都不许出现`)
      }
      if (!saysCannotJudge) push('RCA-NOT-CANNOT-JUDGE', `真值说"判不了"，行里却没有「判不了」三个字：${JSON.stringify(line)}`)
      if (line !== null && !/原因=/.test(line)) push('RCA-SOURCE-UNNAMED', `"判不了"那一行必须写出**原因**（\`原因=\`）：${JSON.stringify(line)}`)
    } else if (truth.state === 'commit') {
      const want = String(truth.commit ?? '').toLowerCase()
      if (hashed.length === 0) {
        push('RCA-COMMIT-MISMATCH', `真值是提交 ${want}，而行里没有提交号：${JSON.stringify(line)}`)
      } else if (!hashed.includes(want)) {
        push('RCA-COMMIT-MISMATCH', `行里的提交号 ${JSON.stringify(hashed)} ≠ 真值 ${want} —— 这一跑被记到了**另一个提交**头上`)
      }
      if (line !== null && !/来源=/.test(line)) push('RCA-SOURCE-UNNAMED', `带提交号的那一行必须写出**来源**（\`来源=\`）：${JSON.stringify(line)}`)
    }
  }

  const codes = problems.map((p) => p.code)
  return { ok: codes.length === 0, codes, problems, line }
}
