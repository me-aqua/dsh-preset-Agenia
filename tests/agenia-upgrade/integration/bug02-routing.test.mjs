/**
 * `BUG-02` · **五分支分流表 + 独立 routing log**（任务 B1 的另一半）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）§2.3 那张五分支表
 *   （配方 × 重复结果 × 环境相关 → 登记条目 / 评审票）· 同段「分流记录在独立 `routing` log 里
 *   （组长写，引用报告；**报告本身保持冻结、不改**）」·「SLA = 下一开工周期」·
 *   「**五分支表只用于评审 finding 的载体**；老板报的 bug 按现象 + 证据登记，**不适用此表**」·
 *   §3.4（一个开工周期 = 一次开工会话到收工；周期号只写在 routing log）。
 * 契约：`.team/test/CONTRACT-B.md` §4。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守四件事：
 * `A` **五行进位**：五条分支逐条判（同一张表，两个方向都量）——
 *     ① 有配方 + 重复成功 ⇒ **登记条目**（`env_related` 任意，**不许**因为"环境相关"就打 env 标签）；
 *     ② 有配方 + 重复失败 + 环境相关 ⇒ 条目 + `env` 标签 **+ 证据**；
 *     ③ 有配方 + 重复失败 + 与环境无关 ⇒ **评审票**；
 *     ④ 无配方（一次性 / 只有现象）⇒ 票 + `one-off` 标签；
 *     ⑤ **间歇**（有时成功）⇒ 条目 + `intermittent` 标签 + 证据。
 *     ⚠️ ①里"env_related 任意"那一格是**反例位置**：把"环境相关"当成无条件标签的实现在那里翻面。
 * `B` **判不了就不许分流**：`repeat=failure` 而环境相关**没给**（null）⇒ 拒（②③ 分不开就是猜）；
 *     配方词不在闭集（`sometimes` 之类）⇒ 拒。判不了不许静默挑一条。
 * `C` **报表冻结**：`bug-route` 必须**核**声明的 `report_sha256` = 报告盘上字节；
 *     不符 ⇒ 拒（`E_ARG_HASH`）；相符 ⇒ 记账，而**报告文件一个字节都不许变**（前后 SHA256 + 字节数）。
 * `D` **不适用此表的那一类与现场前提**：老板报的 bug 走 `bug-route` ⇒ **拒**（`E_BUG_ROUTE_NOT_APPLICABLE`）；
 *     分流**不需要 task、也不需要账先存在** ⇒ 裸工作区上必须能写，且只落 `.team/routing.jsonl`
 *     （`.team/route/` 与 `.team/bug/` 都不许被建出来）；周期号是本条唯一时钟，缺 / 非整数 ⇒ 拒。
 */
import { before, test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { caseFail, preflight, problem, runCase, sha256File, sha256Text } from '../support/evidence.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import {
  BUG_LIB, BUG_PATHS,
  bugAbs, fileStat, makeBareWorkspace, makeWorkspace, missingOpProblem, opMissing, refusalOf, writeReport,
} from '../support/bug-surface.mjs'

before(() => {
  preflight()
})

const NOW = '2026-11-01T12:00:00+08:00'
const CYCLE = 7

/** 报告正文（**真的写到盘上**）：`bug-route` 引用它，而它一个字节都不许变。 */
const REPORT_REL = 'retro/2026-11-01/技术评审.md'
const REPORT_TEXT = '# 技术评审报告（BUG-02 的产物）\n\n窗口：2026-10-31 00:00 – 24:00。\n三条发现。\n'

/**
 * 五分支表（**手写自定形 §2.3**，不从实现反推）。
 * `want` 的两格是判据的全部：`carrier` 与 `tags`（标签集合逐字）。
 */
const BRANCH_CELLS = [
  { id: 'R1-env-true', input: { recipe: 'yes', repeat: 'success', env_related: true }, want: { carrier: 'entry', tags: [] }, note: '①「有配方 + 成功 + 环境相关」—— 方向仍必须是条目，且**不加** env 标签' },
  { id: 'R1-env-unknown', input: { recipe: 'yes', repeat: 'success', env_related: null }, want: { carrier: 'entry', tags: [] }, note: '①「任意」那一格：环境相关没给也不改去向、不加标签' },
  { id: 'R2-env', input: { recipe: 'yes', repeat: 'failure', env_related: true }, want: { carrier: 'entry', tags: ['env'] }, note: '② 条目 + env 标签 + 证据' },
  { id: 'R3-not-env', input: { recipe: 'yes', repeat: 'failure', env_related: false }, want: { carrier: 'ticket', tags: [] }, note: '③ 评审票（与环境无关的失败 ⇒ 不是登记簿的事）' },
  { id: 'R4-no-recipe', input: { recipe: 'no', repeat: null, env_related: null }, want: { carrier: 'ticket', tags: ['one-off'] }, note: '④ 票 + one-off（一次性 / 只有现象）' },
  { id: 'R5-intermittent', input: { recipe: 'intermittent', repeat: null, env_related: null }, want: { carrier: 'entry', tags: ['intermittent'] }, note: '⑤ 条目 + intermittent + 证据' },
]

/** 判不了的两格（**不是五分支的第六行**，是"这一行判不了"）。 */
const UNDECIDABLE_CELLS = [
  { id: 'U1-env-missing', input: { recipe: 'yes', repeat: 'failure', env_related: null }, why: '②③ 靠"环境相关"分叉；没给就分不开 ⇒ 不许猜' },
  { id: 'U2-recipe-word', input: { recipe: 'sometimes', repeat: null, env_related: null }, why: '配方词只认 yes / no / intermittent（闭集）' },
]

test('BUG-02 五分支分流表：五行进位 · 判不了不许猜 · 报告冻结 · 老板那不适用 · 裸工作区只落 routing.jsonl', async () => {
  await runCase('BUG-02', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    const clockWs = makeWorkspace('bug02', 'clock')
    const nowFile = `${clockWs}/.team-now.txt`
    writeFileSync(nowFile, `${NOW}\n`, 'utf8')
    const env = { ...process.env, AGENIA_NOW_FILE: nowFile }

    // ── A · 五分支（纯函数：判的是"这张表有没有被实现成一张表"）─────────────────
    const lib = await loadStagedModule(BUG_LIB, ['routingVerdict'])
    if (lib.surfaceMissing || lib.missing.length > 0) {
      push('BUG-ROUTING-SURFACE-MISSING', `${BUG_LIB} 还没有 routingVerdict ⇒ 五分支表没有可判的载体（契约 §9.2）`)
    } else {
      const verdict = lib.mod.routingVerdict
      for (const cell of BRANCH_CELLS) {
        const got = verdict(cell.input)
        if (got?.ok !== true) {
          push('BUG-ROUTING-BRANCH', `${cell.id}（${cell.note}）：必须能分流，实得 ok=${JSON.stringify(got)}`)
          continue
        }
        if (got.carrier !== cell.want.carrier) {
          push('BUG-ROUTING-CARRIER', `${cell.id}：carrier 必须是 ${cell.want.carrier}，实得 ${JSON.stringify(got.carrier)}（${cell.note}）`)
        }
        const tags = Array.isArray(got.tags) ? [...got.tags].sort() : null
        const wantTags = [...cell.want.tags].sort()
        if (tags === null || JSON.stringify(tags) !== JSON.stringify(wantTags)) {
          push('BUG-ROUTING-TAGS', `${cell.id}：tags 必须恰好是 ${JSON.stringify(wantTags)}，实得 ${JSON.stringify(got.tags)}（${cell.note}）`)
        }
      }
      for (const cell of UNDECIDABLE_CELLS) {
        const got = verdict(cell.input)
        if (got?.ok !== false || typeof got.code !== 'string' || got.code === '') {
          push('BUG-ROUTING-UNDECIDABLE', `${cell.id}（${cell.why}）：必须**拒**（ok:false + 一个码），实得 ${JSON.stringify(got)}`)
        }
      }
    }

    // ── C/D · 报表冻结 · 老板不适用 · 裸工作区（分流不需要账先存在）────────────────
    const bare = makeBareWorkspace('bug02', 'bare')
    const report = writeReport(bare.workspace, REPORT_REL, REPORT_TEXT)
    const repBefore = fileStat(report.file)

    const basePayload = {
      cycle: CYCLE,
      report_ref: REPORT_REL,
      report_sha256: report.sha256,
      finding_id: 'F-3',
      recipe: 'yes',
      repeat: 'failure',
      env_related: false,
      source: 'review',
    }

    const first = await runRoute('bug02', 'bug-route', basePayload, { workspace: bare.workspace, env })
    if (opMissing(first)) {
      const miss = missingOpProblem('bug-route', first)
      push(miss.code, miss.message)
    } else if (first.exit_code !== 0) {
      push('BUG-ROUTE-REFUSED', `裸工作区上分流必须能写（"不需要 task / 不需要账先存在"），实得 exit=${first.exit_code} / ${first.json?.error?.code}：${String(first.stderr).trim().slice(0, 240)}`)
    } else {
      const routed = bugAbs(bare.workspace, BUG_PATHS.routing)
      if (!existsSync(routed)) {
        push('BUG-ROUTE-LOG-MISSING', `分流记录必须落在独立 log \`${BUG_PATHS.routing}\`（定形 §2.3）—— 它不在盘上`)
      }
      if (existsSync(bare.routeDir)) push('BUG-ROUTE-MADE-ROUTE', `分流不需要路线账本：\`${BUG_PATHS.routeDir}/\` 不许被建出来`)
      if (existsSync(bare.ledger)) push('BUG-ROUTE-MADE-LEDGER', `分流到"票"这一支不该建 bug 台账（\`${BUG_PATHS.ledger}\` 出现了）`)
      if (existsSync(routed)) {
        const lines = readFileSync(routed, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '')
        if (lines.length !== 1) push('BUG-ROUTE-APPEND', `第一次分流之后 routing log 必须恰好 1 行，实得 ${lines.length} 行`)
        let row = null
        try { row = JSON.parse(lines[0]) } catch { push('BUG-ROUTE-JSONL', `routing log 每一行必须是 JSON：${lines[0]?.slice(0, 160)}`) }
        if (row !== null) {
          const want = { cycle: CYCLE, finding_id: 'F-3', carrier: 'ticket', by: 'leader' }
          for (const [k, v] of Object.entries(want)) {
            if (row[k] !== v) push('BUG-ROUTE-RECORD', `routing 记录里 \`${k}\` 必须是 ${JSON.stringify(v)}，实得 ${JSON.stringify(row[k])}`)
          }
          if (row.report_ref !== REPORT_REL) push('BUG-ROUTE-REF', `记录必须引用那份报告（report_ref=${JSON.stringify(REPORT_REL)}），实得 ${JSON.stringify(row.report_ref)}`)
          if (row.report_sha256 !== report.sha256) push('BUG-ROUTE-REF-SHA', `记录必须留住报告的 SHA256（供后来人复算"报告没被改过"），实得 ${JSON.stringify(row.report_sha256)}`)
          if (!Array.isArray(row.tags)) push('BUG-ROUTE-TAGS', `记录里 tags 必须是数组（这一支是 []），实得 ${JSON.stringify(row.tags)}`)
        }
      }
      // ② 追加而不是覆盖（"一次分流一条记录"）
      const second = await runRoute('bug02', 'bug-route', { ...basePayload, finding_id: 'F-4', recipe: 'no', repeat: null, env_related: null }, { workspace: bare.workspace, env })
      if (second.exit_code === 0) {
        const lines = readFileSync(bugAbs(bare.workspace, BUG_PATHS.routing), 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '')
        if (lines.length !== 2) push('BUG-ROUTE-APPEND', `第二次分流之后必须 2 行（append-only），实得 ${lines.length} 行`)
        const last = JSON.parse(lines[lines.length - 1])
        if (last.carrier !== 'ticket' || !(last.tags ?? []).includes('one-off')) {
          push('BUG-ROUTE-BRANCH-WRITE', `④ 那一支落盘时 carrier 必须是 ticket + tags 含 one-off，实得 ${JSON.stringify({ carrier: last.carrier, tags: last.tags })}`)
        }
      } else if (!opMissing(second)) {
        push('BUG-ROUTE-SECOND', `第二次分流也必须成功，实得 exit=${second.exit_code} / ${second.json?.error?.code}`)
      }
    }

    // 报告冻结：前后 SHA256 + 字节数必须相同（"报告本身保持冻结、不改"）
    const repAfter = fileStat(report.file)
    if (repAfter.sha256 !== repBefore.sha256 || repAfter.bytes !== repBefore.bytes) {
      push('BUG-REPORT-MUTATED', `分流**不许改报告**：${REPORT_REL} 的 SHA256/字节数在分流前后变了（${repBefore.sha256} → ${repAfter.sha256}）`)
    }

    // 声明的摘要不符 ⇒ 拒（`E_ARG_HASH`），且 routing log 不许多写一行
    const beforeBad = existsSync(bugAbs(bare.workspace, BUG_PATHS.routing))
      ? readFileSync(bugAbs(bare.workspace, BUG_PATHS.routing), 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').length
      : 0
    const badHash = await runRoute('bug02', 'bug-route', { ...basePayload, finding_id: 'F-5', report_sha256: sha256Text('不是那份报告') }, { workspace: bare.workspace, env })
    if (!opMissing(badHash)) {
      const bad = refusalOf('bug-route（报告摘要不符）', badHash, 'E_ARG_HASH')
      if (bad !== null) push('BUG-ROUTE-HASH', `${bad} —— 记账那一侧必须**自己核**报告的字节（"报告冻结"只有核过才算数）`)
      const afterBad = existsSync(bugAbs(bare.workspace, BUG_PATHS.routing))
        ? readFileSync(bugAbs(bare.workspace, BUG_PATHS.routing), 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').length
        : 0
      if (afterBad !== beforeBad) push('BUG-ROUTE-HASH-WROTE', '被拒的分流**零写入**（routing log 行数不许变）')
    }

    // 老板报的 bug：不适用五分支表
    const boss = await runRoute('bug02', 'bug-route', { ...basePayload, finding_id: 'F-6', source: 'boss' }, { workspace: bare.workspace, env })
    if (!opMissing(boss)) {
      const bad = refusalOf('bug-route（source=boss）', boss, 'E_BUG_ROUTE_NOT_APPLICABLE')
      if (bad !== null) push('BUG-ROUTE-BOSS', `${bad} —— 定形 §4.1：老板报的 bug 按「现象 + 证据」登记，**不适用此表**；它不许被分流到票或条目里`)
    }

    // 周期号是本条唯一的时钟：缺 / 非整数 ⇒ 拒
    for (const [label, cycle] of [['缺', undefined], ['字符串', '7'], ['0', 0]]) {
      const res = await runRoute('bug02', 'bug-route', { ...basePayload, finding_id: `F-cycle-${label}`, cycle }, { workspace: bare.workspace, env })
      if (opMissing(res)) break
      const bad = refusalOf(`bug-route（cycle=${label}）`, res, 'E_ARG_SCHEMA')
      if (bad !== null) push('BUG-ROUTE-CYCLE', `${bad} —— 开工周期号是分流记录的唯一时钟（定形 §3.4），缺/坏值不许被吞成 0 或"今天"`)
    }

    caseFail(problems)
    rec.readings.bug02 = {
      branches: BRANCH_CELLS.map((c) => ({ id: c.id, want: c.want })),
      undecidable: UNDECIDABLE_CELLS.map((c) => c.id),
      report_sha256: report.sha256,
      report_bytes: report.bytes,
    }
  })
})
