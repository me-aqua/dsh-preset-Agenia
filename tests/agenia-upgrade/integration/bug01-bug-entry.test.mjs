/**
 * `BUG-01` · **bug 登记簿**（任务 B1）—— 条目准入 / open-closed 语义 / 50-30 封顶 / 两本账不互串。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）
 *   §2.3（两本账 · 对象→账 · disposition 与 assessment 两个词 · 50/30 只数 `kind=bug`）·
 *   §3.1 第 1/7 条（登记 = 现象 + 怎么撞见的 + 证据；封顶 50/30 提醒老板、**不自动动手**）·
 *   §4.1（老板报的 bug 按「现象 + 证据」登记）· §6.2「bug 登记 → 归档」「bug 开放数」两行的账本侧。
 * 契约：`.team/test/CONTRACT-B.md`（§2 账 · §3 条目准入 · §5 封顶 · §9 冻结接缝）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守的是**登记簿**那一半，五件事各一段（红的时候码上就看得出来是哪一段）：
 *
 * `A` **op 面**：九条 bug op 在 `agenia-route.mjs --op help` 里；纯函数模块 `lib/bug-ledger.mjs`
 *     导出契约 §9.2 那七个名字。缺面 ⇒ `BUG-OPS-MISSING` / `BUG-LEDGER-SURFACE-MISSING`
 *     —— **这是"功能没做"，不是"这条输入被拒"**（两种红必须分得开）。
 * `B` **登记不需要路线**：裸工作区（无 `current.json`）上 `bug-register` 必须成，
 *     而 `.team/route/` **一个字节都不许被建出来**（B1 的准入前提）。
 * `C` **条目准入**：现象 + 证据（≥1 条）是硬门；`kind` 只认 `bug` / `observation`；
 *     老板报的 bug **不要求配方**（定形 §4.1 的原话是「不适用此表」，不是「准他少填一样」）。
 * `D` **两个词不混**：assessment（真/假/重复/判不了）与 disposition（adopted/rejected/deferred）
 *     是两个集合；**open = 没有 disposition**，不是"评估为 true"。
 * `E` **封顶**：50 / 30 两个数各一条边界；`kind=observation` 不进这个数；已归档的不进；
 *     封顶红**不动手**（读数变红、条目一条不动、登记照收）。
 * `F` **两本账不互串**：路线票段里有 7 张 open 票，`counts.bug_open` 一个都不许被它影响，
 *     路线账本**一个字节都不许动**（bug 侧读写面必须不碰 `.team/route/`）。
 *
 * ── 为什么现在全红（第 2 关，功能未做）─────────────────────────────────────
 * 今天盘上：`presets/agenia/lib/` 里**没有** `bug-ledger.mjs`，`agenia-route.mjs` 的 `OP_NAMES`
 * 里**没有**任何 `bug-*`，`.team/bug/` 这个落点在整个仓库里零命中。
 * ⇒ 这一格的每一条都落在"功能还没做"那一侧；每条都点名它等的是哪个名字 / 哪份产物。
 *
 * ── 阳性对照（今天就必须绿，A 做完之后仍须绿）─────────────────────────────
 * · `lib/route.mjs` 的 `FIVE_GATES` / `TASK_STATUSES` 在里面 —— bug 任务**共用**那一套五关，
 *   所以这两个名字是 B 的地基；它们绿着，才说明下面那些红是"bug 侧没做"，不是"我把面读错了"。
 * · `--op help` 今天**能**返回信封（exit 0 + `ops` 数组）—— 证明子进程通道是通的，
 *   `bug-*` 那九条缺的是**注册**，不是"CLI 起不来"。
 */
import { before, test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { caseFail, preflight, problem, runCase, sha256File } from '../support/evidence.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import {
  BUG_KINDS, BUG_LIB, BUG_OPS, BUG_PATHS, CAP,
  bugAbs, bugEntry, fileStat, ledgerFixture, makeBareWorkspace, makeWorkspace,
  missingOpProblem, opMissing, readLedger, refusalOf, writeLedger,
} from '../support/bug-surface.mjs'

before(() => {
  preflight()
})

/** 注入式时钟（`AGENIA_NOW_FILE`）：30/31 天那两条边界必须**自足**，不靠真实此刻。 */
const NOW = '2026-11-01T12:00:00+08:00'
/** 30 天前（不含当天）· 31 天前 —— 边界两侧各一个。 */
const DAYS_30 = '2026-10-02T12:00:00+08:00'
const DAYS_31 = '2026-10-01T12:00:00+08:00'

/** 一条合法登记的入参（**手写自契约 §3.2**，不从实现反推）。 */
const newEntry = (over = {}) => ({
  kind: 'bug',
  phenomenon: '卡片的 bug 开放数印成 0，而账上还有 3 条没处置',
  how_seen: '组长 2026-11-01 09:4x 点开卡时看到',
  evidence: [{ kind: 'file', ref: '.team/leader/2026-11-01/log.md', note: '卡片截图那一行' }],
  reporter: '组长',
  source: { carrier: 'leader', ref: null },
  ...over,
})

/** 期望的条目必填键（契约 §3.1；**加性键不判名字**）。 */
const ENTRY_KEYS = ['id', 'kind', 'phenomenon', 'how_seen', 'evidence', 'recipe', 'reporter', 'author', 'source', 'tags', 'registered_at', 'finding_refs', 'assessment', 'disposition']

test('BUG-01 bug 登记簿：九个 op · 登记不建路线 · 现象+证据准入 · open=无 disposition · 50/30 封顶 · 票不串进来', async () => {
  await runCase('BUG-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    const nowFile = `${makeWorkspace('bug01', 'clock')}/.team-now.txt`
    writeFileSync(nowFile, `${NOW}\n`, 'utf8')
    const env = { ...process.env, AGENIA_NOW_FILE: nowFile }

    // ── A · op 面 + 纯函数面 ────────────────────────────────────────────────
    const help = await runRoute('bug01', 'help', undefined, { workspace: makeWorkspace('bug01', 'help'), env })
    if (help.exit_code !== 0 || !Array.isArray(help.json?.ops)) {
      push('BUG-OP-HELP-MISSING', `\`--op help\` 必须返回 {ok:true, ops:[…]}（exit 0），实得 exit=${help.exit_code} / ${JSON.stringify(help.json)?.slice(0, 200)}`)
    } else {
      const missing = BUG_OPS.filter((op) => !help.json.ops.includes(op))
      if (missing.length > 0) {
        push('BUG-OPS-MISSING', `\`--op help\` 里少了 ${missing.length}/${BUG_OPS.length} 条 bug op：${missing.join(' / ')} —— 契约 §9.1 冻的九个 op 一个都还没有（这是"功能没做"那一侧的红）`)
      }
      // 阳性对照：今天这一支必须成立 —— CLI 通道通着，缺的是注册。
      for (const must of ['init', 'task-set', 'read', 'help']) {
        if (!help.json.ops.includes(must)) push('BUG-OP-HELP-CONTROL', `阳性对照：\`--op help\` 里连既有的 ${must} 都没有 ⇒ 这一跑读的不是那份 CLI（ops=${JSON.stringify(help.json.ops).slice(0, 200)}）`)
      }
    }

    const lib = await loadStagedModule(BUG_LIB, ['BUG_LEDGER_SCHEMA', 'entryVerdict', 'openCounts', 'capVerdict'])
    const routeLib = await loadStagedModule('lib/route.mjs', ['FIVE_GATES', 'TASK_STATUSES'])
    // 阳性对照：这条今天必须绿（bug 任务共用那一套五关 / 三态）。
    if (routeLib.surfaceMissing || routeLib.missing.length > 0) {
      push('BUG-SHARED-STATE-MACHINE-MISSING', `\`lib/route.mjs\` 必须导出 FIVE_GATES / TASK_STATUSES（bug 任务与路线任务共用同一套五关与三态）—— 缺：${routeLib.missing.join(' / ')}`)
    } else if (!Array.isArray(routeLib.mod.FIVE_GATES) || !routeLib.mod.FIVE_GATES.includes('实现') || !routeLib.mod.TASK_STATUSES.includes('in_progress')) {
      push('BUG-SHARED-STATE-MACHINE-SHAPE', `阳性对照：FIVE_GATES=${JSON.stringify(routeLib.mod.FIVE_GATES)} / TASK_STATUSES=${JSON.stringify(routeLib.mod.TASK_STATUSES)} —— 这两个面不是契约说的那样`)
    }
    if (lib.surfaceMissing || lib.missing.length > 0) {
      push('BUG-LEDGER-SURFACE-MISSING', `契约 §9.2 的纯函数面还不存在 —— ${BUG_LIB} 缺：${lib.missing.join(' / ')}${lib.errors.length > 0 ? `（${lib.errors.join(' / ')}）` : ''}`)
    }

    // ── B · 登记不需要路线；读面缺 ≠ 空 ──────────────────────────────────────
    const bare = makeBareWorkspace('bug01', 'bare')
    const readBare = await runRoute('bug01', 'bug-read', undefined, { workspace: bare.workspace, env })
    if (opMissing(readBare)) {
      push(missingOpProblem('bug-read', readBare).code, missingOpProblem('bug-read', readBare).message)
    } else {
      const bad = refusalOf('bug-read（没有台账）', readBare, 'E_DATA_MISSING')
      if (bad !== null) push('BUG-READ-MISSING-NOT-EMPTY', `${bad} —— 缺 ≠ 空：没有台账时必须 exit 7 / E_DATA_MISSING（不许静默返回 0 条，那会把"没建账"读成"干净"）`)
      if (existsSync(bare.ledger)) push('BUG-READ-WROTE', `只读 op 不许建台账：${BUG_PATHS.ledger} 在读完之后出现在盘上`)
      if (existsSync(bare.routeDir)) push('BUG-READ-MADE-ROUTE', `只读 op 不许建 \`${BUG_PATHS.routeDir}/\``)
    }

    // ── C1 · 裸工作区登记（两期都开；不需要路线）───────────────────────────────
    const reg = await runRoute('bug01', 'bug-register', newEntry(), { workspace: bare.workspace, env })
    if (opMissing(reg)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-register', reg).message)
    } else if (reg.exit_code !== 0) {
      push('BUG-REGISTER-REFUSED', `裸工作区（没有路线账本）上登记必须成功（定形 §2.3：bug 台账由第一次登记创建，登记不需要路线），实得 exit=${reg.exit_code} / ${reg.json?.error?.code}：${String(reg.stderr).trim().slice(0, 240)}`)
    } else {
      const ledger = readLedger(bare.workspace)
      if (ledger === null) {
        push('BUG-LEDGER-NOT-CREATED', `第一次登记之后 ${BUG_PATHS.ledger} 必须在盘上`)
      } else {
        for (const key of ['entries', 'tasks', 'batches', 'severity_samples', 'archived', 'version']) {
          if (!(key in ledger)) push('BUG-LEDGER-SHAPE', `台账缺段 \`${key}\`（契约 §2.2：bug 台账 = entries + tasks + batches + 严重线样本 + archived）`)
        }
        const entry = (ledger.entries ?? [])[0] ?? reg.json?.entry ?? null
        if (entry === null) {
          push('BUG-ENTRY-NOT-STORED', '登记成功但台账 `entries[]` 是空的（也不在信封里）')
        } else {
          const absent = ENTRY_KEYS.filter((k) => !(k in entry))
          if (absent.length > 0) push('BUG-ENTRY-SHAPE', `条目缺键：${absent.join(' / ')}（契约 §3.1；加性键不判名字）`)
          if (entry.author !== 'leader') push('BUG-ENTRY-AUTHOR', `条目的作者必须是组长（定形 §3.1 第 1 条：登记人 = 组长（代报告人）；entry 作者 = 组长），实得 ${JSON.stringify(entry.author)}`)
          if (entry.phenomenon !== newEntry().phenomenon) push('BUG-ENTRY-PHENOMENON', '条目里的 phenomenon 必须逐字是登记时给的那一句')
          if (!Array.isArray(entry.evidence) || entry.evidence.length !== 1) push('BUG-ENTRY-EVIDENCE', `条目必须留住证据（给了 1 条），实得 ${JSON.stringify(entry.evidence)}`)
          if ((entry.disposition ?? null) !== null) push('BUG-ENTRY-OPEN', `刚登记的条目 disposition 必须是 null（open = 无 disposition），实得 ${JSON.stringify(entry.disposition)}`)
        }
      }
      if (existsSync(bare.routeDir)) push('BUG-REGISTER-MADE-ROUTE', `登记不许建 \`${BUG_PATHS.routeDir}/\`（定形 §2.3："登记**不需要**路线"）—— 它现在在盘上`)
    }

    // ── C2 · 准入拒法：现象 / 证据 / kind 三扇门 + 老板报的 bug 不要求配方 ────────
    const beforeRefusals = fileStat(bare.ledger)
    const refusals = [
      ['缺现象', newEntry({ phenomenon: '   ' })],
      ['证据空表', newEntry({ evidence: [] })],
      ['kind 不在闭集', newEntry({ kind: '缺陷' })],
    ]
    for (const [label, payload] of refusals) {
      const res = await runRoute('bug01', 'bug-register', payload, { workspace: bare.workspace, env })
      if (opMissing(res)) { push('BUG-OP-MISSING', missingOpProblem('bug-register', res).message); break }
      const bad = refusalOf(`bug-register（${label}）`, res, 'E_ARG_SCHEMA')
      if (bad !== null) push('BUG-ENTRY-ADMISSION', `${bad} —— 契约 §3.2：现象 + 证据（≥1 条）是硬门，kind 只认 ${BUG_KINDS.join(' / ')}`)
    }
    const afterRefusals = fileStat(bare.ledger)
    if (beforeRefusals.sha256 !== afterRefusals.sha256) {
      push('BUG-ENTRY-REFUSAL-WROTE', '被拒的登记**零写入**（台账 SHA256 前后相同），实得变了')
    }
    const boss = await runRoute('bug01', 'bug-register', newEntry({
      phenomenon: '老板：修完那个 bug 之后卡片整个不出来了',
      how_seen: '老板 2026-11-01 10:2x 说的话',
      evidence: [{ kind: 'log', ref: '会话：老板原话那一行' }],
      reporter: '老板',
      source: { carrier: 'boss', ref: '会话 2026-11-01 10:2x' },
      recipe: null,
    }), { workspace: bare.workspace, env })
    if (opMissing(boss)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-register', boss).message)
    } else if (boss.exit_code !== 0) {
      push('BUG-BOSS-NO-RECIPE', `老板报的 bug 不要求配方（定形 §4.1）：给现象 + 证据、recipe=null 必须收，实得 exit=${boss.exit_code} / ${boss.json?.error?.code}：${String(boss.stderr).trim().slice(0, 200)}`)
    }

    // ── D · 两个词不混（assessment vs disposition）────────────────────────────
    const led = readLedger(bare.workspace)
    const bugId = (led?.entries ?? []).find((e) => e.kind === 'bug')?.id ?? null
    if (bugId === null) {
      push('BUG-NO-ENTRY-TO-ASSESS', '台账里没有 kind=bug 的条目 —— 下面 D/E 两段判不了（登记那一段已经红在上面）')
    } else {
      const badWord = await runRoute('bug01', 'bug-assess', { id: bugId, assessment: 'maybe', by_role: 'test' }, { workspace: bare.workspace, env })
      if (!opMissing(badWord)) {
        const bad = refusalOf('bug-assess（assessment=maybe）', badWord, 'E_ARG_SCHEMA')
        if (bad !== null) push('BUG-ASSESS-SET', `${bad} —— assessment 只认 ${['true', 'false', 'duplicate', 'unknown'].join(' / ')}（契约 §4.1）`)
      }
      const okAssess = await runRoute('bug01', 'bug-assess', { id: bugId, assessment: 'duplicate', by_role: 'test' }, { workspace: bare.workspace, env })
      if (opMissing(okAssess)) push('BUG-OP-MISSING', missingOpProblem('bug-assess', okAssess).message)
      else if (okAssess.exit_code !== 0) push('BUG-ASSESS-REFUSED', `合法评估（duplicate）必须收，实得 exit=${okAssess.exit_code} / ${okAssess.json?.error?.code}`)

      const afterAssess = await runRoute('bug01', 'bug-read', undefined, { workspace: bare.workspace, env })
      if (!opMissing(afterAssess)) {
        const counts = afterAssess.json?.counts ?? null
        if (counts === null) {
          push('BUG-COUNTS-MISSING', '`bug-read` 的信封里必须有 `counts`（契约 §5.3：bug_open 只数 kind=bug 且无 disposition）')
        } else {
          const want = ['entry_open', 'bug_open', 'observation_open', 'archived']
          const extra = Object.keys(counts).filter((k) => !want.includes(k))
          if (extra.length > 0) push('BUG-COUNTS-EXTRA', `counts 只许这四格 ${want.join(' / ')}（**票 open 不在这个数里**），多出：${extra.join(' / ')}`)
          if (counts.bug_open !== 2) push('BUG-OPEN-IGNORES-ASSESSMENT', `账上两条 kind=bug 都还没有 disposition ⇒ bug_open 必须是 2（**评估不等于处置**），实得 ${JSON.stringify(counts)}`)
        }
      }

      const badDispose = await runRoute('bug01', 'bug-dispose', { id: bugId, disposition: 'closed', reason: 'x', by_role: 'leader' }, { workspace: bare.workspace, env })
      if (!opMissing(badDispose)) {
        const bad = refusalOf('bug-dispose（disposition=closed）', badDispose, 'E_ARG_SCHEMA')
        if (bad !== null) push('BUG-DISPOSITION-SET', `${bad} —— disposition 只认 adopted / rejected / deferred（契约 §4.1）`)
      }
      const dispose = await runRoute('bug01', 'bug-dispose', { id: bugId, disposition: 'rejected', reason: '复现不了，按重复关', by_role: 'leader' }, { workspace: bare.workspace, env })
      if (opMissing(dispose)) push('BUG-OP-MISSING', missingOpProblem('bug-dispose', dispose).message)
      else if (dispose.exit_code !== 0) push('BUG-DISPOSE-REFUSED', `合法处置必须收，实得 exit=${dispose.exit_code} / ${dispose.json?.error?.code}`)
      const afterDispose = await runRoute('bug01', 'bug-read', undefined, { workspace: bare.workspace, env })
      if (!opMissing(afterDispose) && afterDispose.json?.counts?.bug_open !== 1) {
        push('BUG-OPEN-SEMANTICS', `关掉一条之后 bug_open 必须是 1（open = 无 disposition），实得 ${JSON.stringify(afterDispose.json?.counts)}`)
      }

      // kind=observation 不进这个数
      const obs = await runRoute('bug01', 'bug-register', newEntry({ kind: 'observation', phenomenon: '质量观察：说明书里那一句可以再短一点', recipe: null }), { workspace: bare.workspace, env })
      if (!opMissing(obs) && obs.exit_code === 0) {
        const readObs = await runRoute('bug01', 'bug-read', undefined, { workspace: bare.workspace, env })
        const c = readObs.json?.counts ?? {}
        if (c.bug_open !== 1) push('BUG-OBS-IN-COUNTS', `observation 不许进 bug_open（定形 §3.1 第 7 条），实得 ${JSON.stringify(c)}`)
        if (c.observation_open !== 1) push('BUG-OBS-SEPARATE', `observation 要有自己的数（observation_open=1），实得 ${JSON.stringify(c)}`)
      }
    }

    // ── E · 封顶 50/30（夹具台账直喂 —— 判的是**读面**，不是写 op）────────────────
    // 只许有**一条单调规则**：red = (bug_open ≥ 50) || (oldest_age_days > 30)，两处越界任一为真即红。
    // ⇒ 每一格只动**一个**变量：计数边界（cap49/cap50）固定最老 = 30 天（30 天本身不红），
    //    年龄边界（cap30/cap31）固定 bug_open = 1（计数那一侧不红）。
    // ⚠️ 2026-11-01（第 3 关）：原来 cap49 是 49 条 @**31** 天却要 red:false，而 cap31 是 1 条 @31 天要
    //    red:true —— 两者年龄相同、计数都没到 50，**任何单调实现都过不了**（要过只能让"条数多"吞掉年龄
    //    预警，那是反的）。是**夹具**错，不是口径错：把 cap49/cap50 挪到同在 30 天，边界才重新只差"计数"。
    // 🔴 cap49age 是**单调性那一格**（不是第五条边界）：49 条老 bug 比 1 条老 bug 更该红，不许更不红 ——
    //    它正是"条数一多就把年龄预警关掉"那种假绿的探针。
    const capCells = [
      { tag: 'cap49', entries: Array.from({ length: 49 }, (_, i) => bugEntry(`bug-fixture-${i}`, DAYS_30)), want: { red: false, key: null } },
      { tag: 'cap50', entries: Array.from({ length: 50 }, (_, i) => bugEntry(`bug-fixture-${i}`, DAYS_30)), want: { red: true, key: 'count' } },
      { tag: 'cap30', entries: [bugEntry('bug-age30', DAYS_30)], want: { red: false, key: null } },
      { tag: 'cap31', entries: [bugEntry('bug-age31', DAYS_31)], want: { red: true, key: 'age' } },
      { tag: 'cap49age', entries: Array.from({ length: 49 }, (_, i) => bugEntry(`bug-age49-${i}`, DAYS_31)), want: { red: true, key: 'age' } },
      { tag: 'capobs', entries: Array.from({ length: 50 }, (_, i) => bugEntry(`obs-fixture-${i}`, DAYS_31, { kind: 'observation' })), want: { red: false, key: null } },
      { tag: 'caparch', entries: [], archived: Array.from({ length: 60 }, (_, i) => bugEntry(`bug-arch-${i}`, DAYS_31, { disposition: { value: 'adopted', reason: '已修', by: 'leader', at: DAYS_31 } })), want: { red: false, key: null } },
    ]
    for (const cell of capCells) {
      const ws = makeWorkspace('bug01', cell.tag)
      writeLedger(ws, ledgerFixture({ entries: cell.entries, archived: cell.archived ?? [] }))
      const res = await runRoute('bug01', 'bug-read', undefined, { workspace: ws, env })
      if (opMissing(res)) { push('BUG-OP-MISSING', missingOpProblem('bug-read', res).message); break }
      if (res.exit_code !== 0) {
        push('BUG-CAP-READ-FAILED', `封顶那一格 ${cell.tag}：\`bug-read\` 必须能把夹具台账读出来，实得 exit=${res.exit_code} / ${res.json?.error?.code}`)
        continue
      }
      const cap = res.json?.cap ?? null
      if (cap === null) { push('BUG-CAP-MISSING', `\`bug-read\` 的信封里必须有 \`cap\`（契约 §5.3），${cell.tag} 这一格拿不到`); continue }
      if (cap.threshold !== CAP.bug_open || cap.days !== CAP.days) {
        push('BUG-CAP-CONSTANTS', `cap 的两个数必须逐字是 ${CAP.bug_open} / ${CAP.days}，实得 ${JSON.stringify({ threshold: cap.threshold, days: cap.days })}`)
      }
      if (cap.red !== cell.want.red) {
        push('BUG-CAP-BOUNDARY', `${cell.tag}：cap.red 必须是 ${cell.want.red}，实得 ${cap.red}（${JSON.stringify(cap)}）—— 只有一条单调规则：red = bug_open ≥ ${CAP.bug_open} 或 最老 > ${CAP.days} 天；条数多不许吞掉年龄预警（29/30/31 天与 49/50/51 条都只许沿一个方向翻面）`)
      }
      if (cell.want.key !== null) {
        const reasons = Array.isArray(cap.reasons) ? cap.reasons : []
        const hit = reasons.some((r) => String(typeof r === 'string' ? r : r?.code ?? r?.kind ?? '').includes(cell.want.key))
        if (!hit) push('BUG-CAP-REASON', `${cell.tag}：cap.reasons 必须点名是哪一条越界（要含 ${JSON.stringify(cell.want.key)}），实得 ${JSON.stringify(cap.reasons)}`)
      }
      if (cell.tag === 'cap30' && cap.oldest_age_days !== 30) {
        push('BUG-CAP-AGE', `cap30：oldest_age_days 必须是 30（按日历算，注入时钟 ${NOW} 减登记时刻），实得 ${JSON.stringify(cap.oldest_age_days)}`)
      }
      // 封顶红**不动手**：读数变红、条目一条不动（"不自动动手"是定形 §3.1 第 7 条的原话）。
      const led2 = readLedger(ws)
      if (cell.want.red) {
        const touched = (led2?.entries ?? []).filter((e) => (e.disposition ?? null) !== null).length
        if (touched !== 0) push('BUG-CAP-ACTED', `${cell.tag}：封顶红不许改任何条目的 disposition（"不自动动手"），实得 ${touched} 条被动了`)
      }
    }

    // ── F · 两本账不互串（票 open 不进这个数；路线账本一个字节不动）───────────────
    const ws = makeWorkspace('bug01', 'two-ledgers')
    const init = await runRoute('bug01', 'init', {
      goal: { id: 'bug01-goal', title: '两本账不互串（BUG-01 夹具）' },
      stages: [{ id: 'bootstrap', name: '讨论阶段', order: 1 }],
      current_stage_id: 'bootstrap',
    }, { workspace: ws, env })
    if (init.exit_code !== 0) {
      push('BUG-ROUTE-FIXTURE', `阳性对照：路线 \`init\` 今天就该能跑（它是 C1 的地基），实得 exit=${init.exit_code} / ${init.json?.error?.code}`)
    } else {
      const current = bugAbs(ws, BUG_PATHS.routeCurrent)
      // 手写 7 张 open 票进票段（夹具；不走 ticket-open —— 那要 acceptance 三件套，与这一格无关）
      const route = JSON.parse(readFileSync(current, 'utf8'))
      route.tickets = Array.from({ length: 7 }, (_, i) => ({ id: `ticket-20261101-${String(i + 1).padStart(2, '0')}`, title: `旧票 ${i + 1}`, status: i % 2 === 0 ? 'open' : 'in_progress' }))
      writeFileSync(current, `${JSON.stringify(route, null, 2)}\n`, 'utf8')
      const routeSha = sha256File(current)
      writeLedger(ws, ledgerFixture({ entries: [bugEntry('bug-two-ledgers', DAYS_30)] }))
      const res = await runRoute('bug01', 'bug-read', undefined, { workspace: ws, env })
      if (opMissing(res)) {
        push('BUG-OP-MISSING', missingOpProblem('bug-read', res).message)
      } else if (res.exit_code !== 0) {
        push('BUG-CROSS-READ', `两份账并存时 \`bug-read\` 必须照样读得出来，实得 exit=${res.exit_code} / ${res.json?.error?.code}`)
      } else {
        if (res.json?.counts?.bug_open !== 1) {
          push('BUG-TICKETS-IN-COUNT', `路线票段里 7 张 open 票**不许**进 bug_open（定形 §3.1 第 7 条：票 open 不在这个数里），实得 ${JSON.stringify(res.json?.counts)}`)
        }
      }
      if (sha256File(current) !== routeSha) push('BUG-WROTE-ROUTE', '`bug-read` 动了路线账本（`current.json` SHA256 变了）—— 两本账不互串')
    }

    // ── G · `how_seen` = **记录**，不是准入闸（组长裁定 · gate4 复审 BC-05）────────
    // 契约 §3.2：登记的三样事实都**记下来**，但**准入只认两样**（现象 + 证据）。
    // ⇒ 这一格要量三件事：① 省略 `how_seen` 照样收（不设闸）；② 台账里"没人问"（`null`）与
    //    "答了空"（`''`）**分得开**；③ 给了就逐字留住。
    const wsSeen = makeBareWorkspace('bug01', 'how-seen')
    const seenCells = [
      { tag: 'omitted', payload: newEntry({ phenomenon: '省略 how_seen 的那一条（"没人问"）', how_seen: undefined }), want: null },
      { tag: 'empty', payload: newEntry({ phenomenon: 'how_seen 答了空串的那一条', how_seen: '' }), want: '' },
      { tag: 'filled', payload: newEntry({ phenomenon: 'how_seen 有正文的那一条', how_seen: '组长 2026-11-01 09:5x 在卡片上撞见' }), want: '组长 2026-11-01 09:5x 在卡片上撞见' },
    ]
    const seenStored = {}
    for (const cell of seenCells) {
      const res = await runRoute('bug01', 'bug-register', cell.payload, { workspace: wsSeen.workspace, env })
      if (opMissing(res)) { push('BUG-OP-MISSING', missingOpProblem('bug-register', res).message); break }
      // 这一格要的是**收**（不设闸），所以直接看退出码 —— 不用 `refusalOf` 那套"该被拒"的判读。
      if (res.exit_code !== 0) {
        push('BUG-HOW-SEEN-GATED', `how_seen 不是准入闸（契约 §3.2 只认现象 + 证据）：how_seen=${JSON.stringify(cell.payload.how_seen)} 这一发竟然被拒了（exit=${res.exit_code} / ${res.json?.error?.code}）`)
        continue
      }
      const led = readLedger(wsSeen.workspace)
      const hit = (led?.entries ?? []).find((e) => e.phenomenon === cell.payload.phenomenon) ?? null
      seenStored[cell.tag] = hit === null ? null : (hit.how_seen ?? null)
      if (hit === null) {
        push('BUG-HOW-SEEN-NOT-STORED', `登记成功了但台账里找不到那一条（${cell.tag}）—— 记录不下来就分不开"没人问"与"答了空"`)
        continue
      }
      if (!('how_seen' in hit)) push('BUG-HOW-SEEN-KEY', `条目必须**带上** \`how_seen\` 这个键（${cell.tag}）—— 缺键与空值是两件事`)
      if (hit.how_seen !== cell.want) {
        push('BUG-HOW-SEEN-VALUE', `how_seen 必须逐字留住：${cell.tag} 期望 ${JSON.stringify(cell.want)}，实得 ${JSON.stringify(hit.how_seen)}`)
      }
    }
    if (seenStored.omitted === '' && seenStored.empty === '') {
      push('BUG-HOW-SEEN-COLLAPSED', '省略 how_seen 与给空串在台账里**必须分得开**（省略 ⇒ null；空串 ⇒ ""），实得两者都是空串')
    }

    caseFail(problems)
    rec.readings.bug01 = {
      ops_expected: BUG_OPS.length,
      entry_keys: ENTRY_KEYS,
      cap: CAP,
      shared_state_machine: routeLib.surfaceMissing ? null : { gates: routeLib.mod.FIVE_GATES, statuses: routeLib.mod.TASK_STATUSES },
      boundary_cells: capCells.map((c) => c.tag),
      // how_seen 三态**跑出来的**台账值（"没人问" / "答了空" / "有正文"）。
      how_seen_cells: seenStored,
    }
  })
})
