/**
 * `LED-01` · **C1a —— 建账 + bootstrap 阶段 + 7 张旧票迁移**（任务 C1 的第 2 关红测试）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）
 *   §2.3（模式四值 = **纯派生**、不存值；未建账 = 没有路线账本）· t0 三态那张表
 *   （「无路线、7 张旧票在 legacy 票店 ⇒ 未建账 ⇒ **C1a 迁移旧票到路线票段**」；
 *   「**legacy 票店 = 独立存储**」；「7 张迁移票带 `legacy_status`（迁移字段，不是票状态）」；
 *   「迁移票的投影用 `legacy_status` 直到有任务」）· §7 的 C1a 行
 *   （**kind=build**，建完 mode 已是 `build`；**不调 `stage-enter`**；**可重入：半跑可续 / 回滚**）
 *   · §6.2 的「7 张旧票」行（**C1a 前：7 在 legacy + 0 在路线；C1a 后：0 在 legacy + 7 在路线**）。
 * 契约：`.team/test/CONTRACT-C1.md` §3 / §4。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守五件事：
 * `A` **建账**：一次 `bootstrap` 落下带 `kind=build` 的 bootstrap 阶段；**mode 立刻就是 `build`**；
 *     `headline` = 目标 · 大阶段名（唯一载体 = 账上的字段）；**审计链恰好一条且是 `bootstrap`**
 *     （⇒ 证明"用现有 ledger 代码"：原子写 + 审计链 + `verify` 都成立）。
 * `B` **迁移**：7 张旧票从 legacy 票店进路线票段（**票号沿用**、`legacy_status` 留住、
 *     **不存 `status`**）；legacy 侧清空并写下 `migrated_at` / `migrated_to`；**前后计数**是读数。
 * `C` **可重入**：半跑（路线 3 张 + legacy 剩 4 张）再跑一次 ⇒ 只补 4 张、不重复；store 再脏一次
 *     （route 7 + store 又有 7）⇒ 加 0 张。**没有一次是"重来一遍把账抹了"**。
 * `D` **回滚 = 一个字节都不写**：legacy 票店坏了（重复 id / 状态越界 / schema 不对）⇒
 *     拒 `E_LEGACY_STORE_BAD`，`current.json` 不出现、store 的 sha256 逐字不变。
 * `E` **两期都能建**：老板说「进入维护」⇒ 直接建 `kind=maintain`（不先进 build），迁移照跑；
 *     **没建 bug 台账的工作区，`bootstrap` 不许把 `.team/bug/` 建出来**（B1 的准入前提）。
 *
 * ── 现在为什么红、红在哪（第 2 关，功能未做）────────────────────────────────────
 * · `--op bootstrap` 不存在 ⇒ A/B/C/D/E 全红（`C1-OP-MISSING`，判的是"功能没做"不是"输入被拒"）；
 * · `lib/route.mjs` **没有** `modeOf` / `legacyTicketVerdict` 等导出 ⇒ `C1-SURFACE-MISSING`
 *   （点名缺哪几个），`modeOf` 那几格一起红。
 * ⇒ 每条红都点名它等的是哪个名字；**import 崩不算红**（`loadStagedModule` 把缺面与 import 失败分开）。
 */
import { before, test } from 'node:test'
import { caseFail, preflight, runCase } from '../support/evidence.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import { bugEntry, ledgerFixture, readLedger, writeLedger } from '../support/bug-surface.mjs'
import {
  BOOTSTRAP_GRAPH, BOOTSTRAP_HEADLINE, BUILD_THEN_MAINTAIN_GRAPH, C1_OPS, LEGACY_TICKETS,
  ROUTE_LIB, ROUTE_PATHS, ROUTE_EXPORTS, clockEnv, envelopeProblem, fileStatRoute,
  legacyStoreFixture, makePusher, makeWorkspace, missingOpProblem, opMissing, readAudit, readLegacy,
  readRoute, routeAbs, writeLegacy,
} from '../support/route-surface.mjs'

before(() => {
  preflight()
})

const NOW = '2026-11-01T12:00:00+08:00'

/** 一次"成功"的判读（`ok` 或一句人话）。 */
const okOf = (label, res) => envelopeProblem(label, res, 'ok')

test('LED-01 C1a：bootstrap 建账（kind=build→mode=build）+ 7 张旧票 legacy→路线 + 半跑可续 + 坏了零写入', () => {
  return runCase('LED-01', async (rec) => {
    const problems = []
    const push = makePusher(problems)

    // ── 纯函数面：先点名缺哪几个导出（功能没做的那一侧）────────────────────────
    const lib = await loadStagedModule(ROUTE_LIB, ROUTE_EXPORTS)
    if (lib.surfaceMissing || lib.missing.length > 0) {
      push('C1-SURFACE-MISSING', `\`${ROUTE_LIB}\` 还不全 —— 缺：${lib.missing.join(' / ') || '(整个文件不在)'}（契约 §9.2）`)
    }
    const hasMode = !lib.surfaceMissing && typeof lib.mod.modeOf === 'function'
    const hasLegacy = !lib.surfaceMissing && typeof lib.mod.legacyTicketVerdict === 'function'

    if (hasMode) {
      // 模式是**纯派生**的四个值；`uninitialized` 是"没有账本"，不是缺席。
      const cells = [
        ['没有账本', null, 'uninitialized'],
        ['build 段', { current_stage_id: 's1', stages: [{ id: 's1', kind: 'build' }], pauses: [] }, 'build'],
        ['maintain 段', { current_stage_id: 's1', stages: [{ id: 's1', kind: 'maintain' }], pauses: [] }, 'maintain'],
        ['build + 一个 open 暂停', { current_stage_id: 's1', stages: [{ id: 's1', kind: 'build' }], pauses: [{ state: 'open', entry_ids: ['e1'] }] }, 'build-paused'],
        ['maintain + 一个 open 暂停（暂停位不管用）', { current_stage_id: 's1', stages: [{ id: 's1', kind: 'maintain' }], pauses: [{ state: 'open', entry_ids: ['e1'] }] }, 'maintain'],
        ['build + 只有已关闭的暂停', { current_stage_id: 's1', stages: [{ id: 's1', kind: 'build' }], pauses: [{ state: 'closed', entry_ids: ['e1'] }] }, 'build'],
        ['阶段没声明 kind ⇒ 按 build 读（保守读法）', { current_stage_id: 's1', stages: [{ id: 's1' }], pauses: [] }, 'build'],
      ]
      for (const [label, input, want] of cells) {
        const got = lib.mod.modeOf(input)
        if (got !== want) push('C1-MODE', `modeOf（${label}）：期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}`)
      }
      // `paused` **不是**模式：把任务状态喂进去只可能得到闭集里的四个值之一。
      if (lib.mod.MODES !== undefined && JSON.stringify(lib.mod.MODES) !== JSON.stringify(['uninitialized', 'build', 'build-paused', 'maintain'])) {
        push('C1-MODE-CLOSED-SET', `\`MODES\` 必须恰是四值闭集，实得 ${JSON.stringify(lib.mod.MODES)}`)
      }
      if (lib.mod.MODES?.includes?.('paused')) push('C1-MODE-PAUSED', '`paused` 出现在模式闭集里 —— 它是**任务状态**，不是模式（定形 §2.3 末段）')
      if (lib.mod.STAGE_KINDS !== undefined && JSON.stringify(lib.mod.STAGE_KINDS) !== JSON.stringify(['build', 'maintain'])) {
        push('C1-STAGE-KINDS', `\`STAGE_KINDS\` 必须恰是 build | maintain（阶段类型是闭集），实得 ${JSON.stringify(lib.mod.STAGE_KINDS)}`)
      }
    }
    if (hasLegacy) {
      const good = lib.mod.legacyTicketVerdict(legacyStoreFixture())
      if (good?.ok !== true) push('C1-LEGACY-VERDICT', `一份合法的 legacy 票店必须过判定，实得 ${JSON.stringify(good)}`)
      const dup = lib.mod.legacyTicketVerdict(legacyStoreFixture({ tickets: [...LEGACY_TICKETS, LEGACY_TICKETS[0]] }))
      if (dup?.ok !== false || dup?.code !== 'E_LEGACY_STORE_BAD') push('C1-LEGACY-VERDICT', `重复票号必须拒 \`E_LEGACY_STORE_BAD\`，实得 ${JSON.stringify(dup)}`)
    }

    // ── A · 建账（bare 工作区 + 7 张旧票）─────────────────────────────────────
    const wsA = makeWorkspace('led01', 'bootstrap')
    const { env } = clockEnv(wsA, NOW)
    writeLegacy(wsA, legacyStoreFixture())
    const before = {
      route_current: fileStatRoute(routeAbs(wsA, ROUTE_PATHS.current)),
      legacy: fileStatRoute(routeAbs(wsA, ROUTE_PATHS.legacyStore)),
      legacy_tickets: 7,
      route_tickets: 0,
    }
    if (before.route_current.exists) push('C1-PRE-STATE', '前置不成立：这个工作区一开始就不该有 current.json')

    const boot = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsA, env })
    if (opMissing(boot)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, boot).message)
    } else if (boot.exit_code !== 0) {
      const bad = okOf('bootstrap（7 张旧票的工作区）', boot)
      push('C1-BOOTSTRAP-REFUSED', `${bad} —— 定形 §7 的 C1a：组长执行、kind=build、建完 mode 已是 build`)
    } else {
      const route = readRoute(wsA)
      if (route === null) {
        push('C1-BOOTSTRAP-NO-LEDGER', 'bootstrap 说成功了，但没有 `current.json`')
      } else {
        // mode 立刻是 build；它**不存值**（派生值落在账本里就是第二个真相）。
        if ('mode' in route) push('C1-MODE-STORED', '`current.json` 里出现了 `mode` 键 —— 模式是**纯派生**，不存值（定形 §2.3）')
        if (route.stages?.[0] && 'mode' in route.stages[0]) push('C1-MODE-STORED', '阶段上出现了 `mode` 键 —— 存的是阶段类型 `kind`，不是模式')
        if (route.stages?.[0]?.kind !== 'build') push('C1-STAGE-KIND', `bootstrap 阶段必须是 kind=build，实得 ${JSON.stringify(route.stages?.[0]?.kind)}`)
        if (route.current_stage_id !== 'stage-build') push('C1-CURRENT-STAGE', `当前大阶段应是 bootstrap 那一段，实得 ${JSON.stringify(route.current_stage_id)}`)
        if ((route.transitions ?? []).length !== 0) push('C1-BOOTSTRAP-STAGE-ENTER', '建账**不调** `stage-enter`（§7 的 C1a 行：不调 stage-enter），`transitions` 必须是空的')
        // headline：唯一载体 = 账上的字段；值 = 目标 · 大阶段名。
        if (route.headline !== BOOTSTRAP_HEADLINE) push('C1-BOOTSTRAP-HEADLINE', `bootstrap 的 headline 必须是「${BOOTSTRAP_HEADLINE}」，实得 ${JSON.stringify(route.headline)}`)
        // 审计链恰好一条，且是 bootstrap（⇒ "用现有 ledger 代码"：原子写 + 链 + verify 都成立）。
        const audit = readAudit(wsA)
        if (audit.length !== 1) push('C1-BOOTSTRAP-AUDIT', `建账应恰好追加 1 条审计（op=bootstrap），实得 ${audit.length} 条：${JSON.stringify(audit.map((r) => r.op ?? r.unparsable)).slice(0, 200)}`)
        if (audit[0]?.op !== C1_OPS.bootstrap) push('C1-BOOTSTRAP-AUDIT-OP', `第一条审计的 op 必须是 \`${C1_OPS.bootstrap}\`，实得 ${JSON.stringify(audit[0]?.op)}`)
        if (audit.some((r) => r.op === 'stage-enter' || r.op === 'task-set')) push('C1-BOOTSTRAP-AUDIT-EXTRA', '建账那一跑里不许出现 stage-enter / task-set 记录')
        const verify = runRoute('LED-01', 'verify', {}, { workspace: wsA, env })
        if (verdictOf(verify) !== null) push('C1-BOOTSTRAP-CHAIN', `建完账 \`verify\` 必须权威（审计链对得上）：${verdictOf(verify)}`)
        // read：mode / headline 的读面（C2 的接缝）。
        const read = runRoute('LED-01', 'read', {}, { workspace: wsA, env })
        if (read.exit_code === 0) {
          if (read.json?.mode !== 'build') push('C1-READ-MODE', `\`read\` 必须给出派生出来的 mode=build，实得 ${JSON.stringify(read.json?.mode)}`)
          if (read.json?.headline?.stored !== BOOTSTRAP_HEADLINE) push('C1-READ-HEADLINE', `\`read.headline.stored\` 必须是「${BOOTSTRAP_HEADLINE}」，实得 ${JSON.stringify(read.json?.headline)}`)
          if (read.json?.headline?.empty !== false) push('C1-READ-HEADLINE-EMPTY', `建完账 headline 不许是空态，实得 ${JSON.stringify(read.json?.headline)}`)
          if (read.json?.headline?.stale !== false) push('C1-READ-HEADLINE-STALE', `stored 与 derived 必须同值（一个真相），实得 ${JSON.stringify(read.json?.headline)}`)
          if (hasMode && lib.mod.modeOf(route) !== 'build') push('C1-MODE-LEDGER', `\`modeOf(账本)\` 必须是 build，实得 ${JSON.stringify(lib.mod.modeOf(route))}`)
        }

        // ── B · 迁移（7 → 路线票段；legacy 清空）──────────────────────────────
        const tickets = route.tickets ?? []
        rec.readings.migration = {
          before: { legacy: before.legacy_tickets, route: 0 },
          after: { legacy: (readLegacy(wsA)?.tickets ?? []).length, route: tickets.length },
        }
        if (tickets.length !== 7) {
          push('C1-MIGRATE-COUNT', `C1a 之后路线票段必须恰有 7 张票，实得 ${tickets.length}`)
        }
        const wantIds = LEGACY_TICKETS.map((t) => t.id)
        const gotIds = tickets.map((t) => t.id)
        if (JSON.stringify(gotIds) !== JSON.stringify(wantIds)) {
          push('C1-MIGRATE-IDS', `迁移票的票号必须**沿用** legacy 票号（两套票号并存），期望 ${JSON.stringify(wantIds)}，实得 ${JSON.stringify(gotIds)}`)
        }
        for (const legacy of LEGACY_TICKETS) {
          const hit = tickets.find((t) => t.id === legacy.id)
          if (hit === undefined) continue
          if (hit.legacy_status !== legacy.status) {
            push('C1-MIGRATE-LEGACY-STATUS', `迁移票 ${legacy.id} 必须带 \`legacy_status\`=${JSON.stringify(legacy.status)}（迁移字段，不是票状态），实得 ${JSON.stringify(hit.legacy_status)}`)
          }
          if ('status' in hit) {
            push('C1-MIGRATE-STATUS-STORED', `迁移票 ${legacy.id} 不许**存** \`status\` —— 迁移票的投影用 \`legacy_status\`（定形 §2.3）；存了就是第二个真相`)
          }
          for (const field of ['title', 'source', 'next_step', 'acceptance']) {
            if (typeof hit[field] !== 'string' || hit[field].trim() === '') push('C1-MIGRATE-FIELD', `迁移票 ${legacy.id} 的 \`${field}\` 必须逐字搬过来（非空）`)
          }
        }
        const store = readLegacy(wsA)
        if (store === null) {
          push('C1-MIGRATE-STORE-MISSING', '迁移之后 legacy 票店文件不见了 —— 它要留一份"已迁空"的读数，不许删')
        } else {
          if ((store.tickets ?? []).length !== 0) push('C1-MIGRATE-STORE-LEFT', `迁移后 legacy 票店必须清空（0 在 legacy），实得 ${(store.tickets ?? []).length} 张`)
          if (store.migrated_at !== NOW) push('C1-MIGRATE-STORE-AT', `legacy 票店的 \`migrated_at\` 必须取注入时钟那一刻（${NOW}），实得 ${JSON.stringify(store.migrated_at)}`)
          if (store.migrated_to !== 'route.tickets') push('C1-MIGRATE-STORE-TO', `legacy 票店的 \`migrated_to\` 必须是 \`route.tickets\`（迁移后票店 = 路线票段），实得 ${JSON.stringify(store.migrated_to)}`)
        }
        if (fileStatRoute(routeAbs(wsA, ROUTE_PATHS.bugDir)).exists) {
          push('C1-BOOTSTRAP-MADE-BUG-LEDGER', '没有 bug 台账的工作区里，`bootstrap` **不许**把 `.team/bug/` 建出来（bug 台账由第一次登记创建，B1 的准入前提）')
        }
      }
    }

    // ── A2 · 没有 legacy 票店的工作区：照样能建账（迁 0 张，如实报 present:false）──
    const wsN = makeWorkspace('led01', 'no-store')
    const { env: envN } = clockEnv(wsN, NOW)
    const bootN = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsN, env: envN })
    if (opMissing(bootN)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootN).message)
    } else {
      const bad = okOf('bootstrap（没有 legacy 票店）', bootN)
      if (bad !== null) {
        push('C1-BOOTSTRAP-NO-STORE', `${bad} —— 别的老工作区可能一张旧票都没有；这时候建账照样要能落（迁 0 张）`)
      } else {
        if (bootN.json?.legacy?.present !== false) push('C1-BOOTSTRAP-NO-STORE-PRESENT', `没有 legacy 票店时 \`legacy.present\` 必须是 false，实得 ${JSON.stringify(bootN.json?.legacy)}`)
        if ((readRoute(wsN)?.tickets ?? []).length !== 0) push('C1-BOOTSTRAP-NO-STORE-TICKETS', '没有 legacy 票店时票段必须是空的')
        if (fileStatRoute(routeAbs(wsN, ROUTE_PATHS.legacyStore)).exists) push('C1-BOOTSTRAP-CREATED-STORE', '没有 legacy 票店时 bootstrap **不许凭空造一个**（票店是输入，不是产物）')
      }
    }

    // ── C · 可重入：半跑可续（route 3 + store 剩 4）─────────────────────────────
    const wsC = makeWorkspace('led01', 'resume')
    const { env: envC } = clockEnv(wsC, NOW)
    writeLegacy(wsC, legacyStoreFixture({ tickets: LEGACY_TICKETS.slice(0, 3) }))
    const first = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsC, env: envC })
    if (opMissing(first)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, first).message)
    } else if (first.exit_code !== 0) {
      push('C1-RESUME-FIRST', `半跑的第一段（3 张）必须能落，实得 exit=${first.exit_code} / ${first.json?.error?.code}`)
    } else {
      // 制造"半跑"现场：legacy 侧还剩 4 张（第一次只吃掉了 3 张）。
      writeLegacy(wsC, legacyStoreFixture({ tickets: LEGACY_TICKETS.slice(3) }))
      const second = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsC, env: envC })
      if (second.exit_code !== 0) {
        push('C1-RESUME-SECOND', `半跑可续：第二次必须把剩下的 4 张补进去，实得 exit=${second.exit_code} / ${second.json?.error?.code}：${String(second.stderr).trim().slice(0, 200)}`)
      } else {
        const route = readRoute(wsC)
        const ids = (route?.tickets ?? []).map((t) => t.id)
        if (ids.length !== 7) push('C1-RESUME-COUNT', `半跑可续之后必须恰好 7 张（不许重复、不许漏），实得 ${ids.length}：${JSON.stringify(ids)}`)
        if (new Set(ids).size !== ids.length) push('C1-RESUME-DUP', `半跑可续出了重复票号：${JSON.stringify(ids)}`)
        if (JSON.stringify(ids) !== JSON.stringify(LEGACY_TICKETS.map((t) => t.id))) push('C1-RESUME-ORDER', `票段里 7 张票的顺序/票号必须与 legacy 票店一致，实得 ${JSON.stringify(ids)}`)
        if ((readLegacy(wsC)?.tickets ?? []).length !== 0) push('C1-RESUME-STORE', '半跑可续之后 legacy 票店必须清空')
        const verify = runRoute('LED-01', 'verify', {}, { workspace: wsC, env: envC })
        if (verdictOf(verify) !== null) push('C1-RESUME-CHAIN', `两次 bootstrap 之后审计链必须仍然权威：${verdictOf(verify)}`)
      }
    }
    // 再脏一次：route 已经 7 张、store 又有 7 张（"route 写了、store 还没清"那一步的半跑形态）⇒ 加 0 张。
    if (!opMissing(first)) {
      writeLegacy(wsC, legacyStoreFixture())
      const third = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsC, env: envC })
      if (third.exit_code === 0) {
        const ids = (readRoute(wsC)?.tickets ?? []).map((t) => t.id)
        if (ids.length !== 7) push('C1-RERUN-DUP', `账上已经有 7 张时再跑一次 bootstrap 不许长到 ${ids.length} 张（按票号去重）`)
        if ((readLegacy(wsC)?.tickets ?? []).length !== 0) push('C1-RERUN-STORE', '账上已经有的票，再跑一次也必须把 legacy 侧清空')
      } else {
        push('C1-RERUN-REFUSED', `已建账 + legacy 又有票 ⇒ 必须能续（去重后加 0 张），实得 exit=${third.exit_code} / ${third.json?.error?.code}`)
      }
      // 用过之后就不许再 bootstrap（不许抹历史）：加一个任务，再跑一次。
      const used = runRoute('LED-01', 'task-set', {
        tasks: [{ id: 'T-used', stage_id: 'stage-build', title: '这账用起来了', status: 'in_progress', five_gate_state: '实现', kind: 'implement' }],
        current_task_id: 'T-used', version: readRoute(wsC)?.version,
      }, { workspace: wsC, env: envC })
      if (okOf('task-set（用起来）', used) !== null) {
        push('C1-USED-SETUP', `前置不成立：建完账之后实现任务必须能落（${okOf('task-set（用起来）', used)}）`)
      } else {
        const sha = fileStatRoute(routeAbs(wsC, ROUTE_PATHS.current)).sha256
        const again = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsC, env: envC })
        const bad = envelopeProblem('bootstrap（账已经被用过）', again, 'E_ROUTE_EXISTS')
        if (bad !== null) push('C1-USED-REFUSED', `${bad} —— 账用起来之后再 bootstrap 就是抹历史，必须拒（沿用既有码 \`E_ROUTE_EXISTS\`）`)
        if (fileStatRoute(routeAbs(wsC, ROUTE_PATHS.current)).sha256 !== sha) push('C1-USED-ZERO-WRITE', '被拒的 bootstrap **零写入**')
      }
    }

    // ── D · 回滚：坏 store ⇒ 拒 + 两个文件一个字节都不写 ────────────────────────
    const badStores = [
      ['重复票号', legacyStoreFixture({ tickets: [...LEGACY_TICKETS, LEGACY_TICKETS[0]] })],
      ['status 越界', legacyStoreFixture({ tickets: [{ ...LEGACY_TICKETS[0], status: 'weird' }] })],
      ['schema 不对', legacyStoreFixture({ schema: 2, tickets: LEGACY_TICKETS.slice(0, 1) })],
    ]
    for (const [label, store] of badStores) {
      const ws = makeWorkspace('led01', `rollback-${label.replace(/[^a-z0-9]+/gi, '-')}`)
      const { env: envOne } = clockEnv(ws, NOW)
      writeLegacy(ws, store)
      const storeSha = fileStatRoute(routeAbs(ws, ROUTE_PATHS.legacyStore)).sha256
      const res = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: ws, env: envOne })
      if (opMissing(res)) {
        push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, res).message)
        break
      }
      const bad = refusalOfCode(`坏 legacy 票店（${label}）`, res, 'E_LEGACY_STORE_BAD')
      if (bad !== null) push('C1-ROLLBACK-CODE', `${bad} —— 坏了就明确拒，不许半信半疑地搬一半`)
      if (fileStatRoute(routeAbs(ws, ROUTE_PATHS.current)).exists) push('C1-ROLLBACK-WROTE-ROUTE', `坏 store 被拒时**零写入**：\`current.json\` 不许出现（${label}）`)
      if (fileStatRoute(routeAbs(ws, ROUTE_PATHS.legacyStore)).sha256 !== storeSha) push('C1-ROLLBACK-WROTE-STORE', `被拒时 legacy 票店不许被改写（${label}）`)
    }

    // ── E · 两期都能建：maintain 直建（不先进 build）──────────────────────────
    const wsE = makeWorkspace('led01', 'maintain-direct')
    const { env: envE } = clockEnv(wsE, NOW)
    writeLegacy(wsE, legacyStoreFixture())
    const bootM = runRoute('LED-01', C1_OPS.bootstrap, { ...BUILD_THEN_MAINTAIN_GRAPH, current_stage_id: 'stage-maintain' }, { workspace: wsE, env: envE })
    if (opMissing(bootM)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootM).message)
    } else if (bootM.exit_code !== 0) {
      push('C1-BOOTSTRAP-MAINTAIN', `老板说「进入维护」⇒ 直接建 kind=maintain（不先进 build）；实得 exit=${bootM.exit_code} / ${bootM.json?.error?.code}`)
    } else {
      const read = runRoute('LED-01', 'read', {}, { workspace: wsE, env: envE })
      if (read.exit_code === 0 && read.json?.mode !== 'maintain') push('C1-BOOTSTRAP-MAINTAIN-MODE', `直建维护段之后 mode 必须是 maintain，实得 ${JSON.stringify(read.json?.mode)}`)
      if ((readRoute(wsE)?.tickets ?? []).length !== 7) push('C1-BOOTSTRAP-MAINTAIN-MIGRATE', '直建 maintain 时 7 张旧票照样要迁过去')
      const route = readRoute(wsE)
      if (route !== null && hasMode && lib.mod.modeOf(route) !== 'maintain') push('C1-MODE-MAINTAIN', `\`modeOf(直建维护段的账本)\` 必须是 maintain，实得 ${JSON.stringify(lib.mod.modeOf(route))}`)
    }
    // 阶段类型是闭集：kind 越界 ⇒ 写面就拒（不是读的时候才炸）。
    const wsK = makeWorkspace('led01', 'bad-kind')
    const { env: envK } = clockEnv(wsK, NOW)
    const badKind = runRoute('LED-01', C1_OPS.bootstrap, {
      ...BOOTSTRAP_GRAPH,
      stages: [{ id: 'stage-build', name: '执行一 · 拆账并员通电', order: 1, kind: 'weird' }],
    }, { workspace: wsK, env: envK })
    if (!opMissing(badKind) && badKind.exit_code === 0) {
      push('C1-STAGE-KIND-CLOSED-SET', '阶段类型是闭集（build | maintain）：喂 `kind: "weird"` 必须被拒（否则 mode 派生不出四个值）')
    }

    // ── F · observation 迁移（定形 §7 的 C1a 行：建账时迁移、迁移后关闭）──────────
    const wsF = makeWorkspace('led01', 'observation')
    const { env: envF } = clockEnv(wsF, NOW)
    writeLegacy(wsF, legacyStoreFixture({ tickets: [] }))
    const obsId = 'obs-20261031-01'
    writeLedger(wsF, ledgerFixture({
      entries: [bugEntry(obsId, '2026-10-31T09:00:00+08:00', { kind: 'observation' }), bugEntry('bug-live-1', '2026-10-31T09:05:00+08:00')],
    }))
    const obsVersionBefore = readLedger(wsF)?.version ?? null
    const bootF = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsF, env: envF })
    if (opMissing(bootF)) {
      push('C1-OP-MISSING', missingOpProblem(C1_OPS.bootstrap, bootF).message)
    } else if (bootF.exit_code !== 0) {
      push('C1-OBS-MIGRATE', `有 bug 台账（含 observation）时 bootstrap 必须照常落，实得 exit=${bootF.exit_code} / ${bootF.json?.error?.code}`)
    } else {
      const route = readRoute(wsF)
      const ticket = (route?.tickets ?? []).find((t) => t.legacy_ref === obsId) ?? null
      if (ticket === null) {
        push('C1-OBS-MIGRATE-TICKET', `observation（quality finding）建账时要转一张票（source = \`legacy:observation:<entry id>\`），实得票段 ${JSON.stringify((route?.tickets ?? []).map((t) => [t.id, t.source, t.legacy_ref]))}`)
      } else {
        if (ticket.source !== `legacy:observation:${obsId}`) push('C1-OBS-MIGRATE-SOURCE', `observation 转出来的票 source 必须是 \`legacy:observation:${obsId}\`，实得 ${JSON.stringify(ticket.source)}`)
        if (ticket.legacy_status !== 'open') push('C1-OBS-MIGRATE-STATUS', `observation 转出来的票 legacy_status 必须是 open，实得 ${JSON.stringify(ticket.legacy_status)}`)
      }
      const led = readLedger(wsF)
      const obs = (led?.entries ?? []).find((e) => e.id === obsId) ?? null
      if (obs === null) {
        push('C1-OBS-MIGRATE-STILL-THERE', '迁移后 observation 必须还在 live 段（只是**关闭**：写 disposition），不许被删')
      } else {
        if ((obs.disposition ?? null) === null) push('C1-OBS-MIGRATE-CLOSED', '迁移后 observation 必须关闭（disposition 非空）—— "迁移前不转票；迁移后关闭 observation"')
        if (ticket !== null && obs.migrated_ticket_id !== ticket.id) push('C1-OBS-MIGRATE-REF', `observation 上要记下它转成了哪张票（migrated_ticket_id=${JSON.stringify(ticket.id)}），实得 ${JSON.stringify(obs.migrated_ticket_id)}`)
      }
      const live = (led?.entries ?? []).find((e) => e.id === 'bug-live-1') ?? null
      if (live === null || (live.disposition ?? null) !== null) push('C1-OBS-MIGRATE-TOUCHED-BUG', 'observation 迁移只动 observation：`kind=bug` 的条目一个字节都不许动（disposition 必须仍是 null）')
      if (Number.isInteger(obsVersionBefore) && led?.version !== obsVersionBefore + 1) {
        push('C1-OBS-MIGRATE-VERSION', `写 bug 台账要守它自己的写纪律（version +1）：期望 ${obsVersionBefore + 1}，实得 ${JSON.stringify(led?.version)}`)
      }
      // 幂等：再跑一次 bootstrap 不许再转一张票。
      const again = runRoute('LED-01', C1_OPS.bootstrap, { ...BOOTSTRAP_GRAPH }, { workspace: wsF, env: envF })
      if (!opMissing(again) && again.exit_code === 0) {
        const tickets = readRoute(wsF)?.tickets ?? []
        if (tickets.length !== 1) push('C1-OBS-MIGRATE-IDEMPOTENT', `已迁过的 observation 不许再转票（再跑一次 bootstrap 之后票段应仍是 1 张），实得 ${tickets.length} 张`)
      }
    }

    rec.readings.led01 = {
      pure_surface_missing: lib.surfaceMissing ? ROUTE_EXPORTS.length : lib.missing.length,
      bootstrap_ok: boot.exit_code === 0,
      migration: rec.readings.migration ?? null,
      // 🔴 现量（不是 `wsC !== null` 那种字面量）：可重入那一段跑完之后，盘上那张账长什么样。
      reentrant: (() => {
        const ids = (readRoute(wsC)?.tickets ?? []).map((t) => t.id)
        return { tickets: ids.length, unique: new Set(ids).size === ids.length, legacy_left: (readLegacy(wsC)?.tickets ?? []).length }
      })(),
      rollback_cells: badStores.length,
      maintain_direct: bootM.exit_code === 0,
    }
    caseFail(problems)
  })
})

/** `verify` 的判读：权威 ⇒ `null`，否则一句人话。 */
function verdictOf(res) {
  if (res?.spawn_error) return `spawn 失败（${res.spawn_error}）`
  if (res?.exit_code !== 0) return `verify 非零退出（${res?.exit_code} / ${res?.json?.error?.code}）`
  if (res?.json?.authoritative !== true) return `verify 的 authoritative 不是 true（${JSON.stringify(res?.json)?.slice(0, 200)}）`
  return null
}

/** 期望被某个码拒（与 `envelopeProblem` 同形；这里只是让 D 段读起来短一点）。 */
function refusalOfCode(label, res, code) {
  return envelopeProblem(label, res, code)
}
