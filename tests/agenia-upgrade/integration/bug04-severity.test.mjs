/**
 * `BUG-04` · **严重三线 · 四出口 · 预注册样本 · 判不了就升级**（任务 B3）。
 *
 * 冻结依据：定形 `.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）
 *   §4.2（**严重 bug 三条线**：数据/库坏了 · 产品功能坏了 = 一个用户可见功能失败 + 复现步骤 ·
 *        「读数说假话」**只有掩盖前两条时才算**；**三条线 + `unclassified` = 四个出口**（不是第五桶）；
 *        样本四个、**由组长在事故前预注册**；**测试岗按样本评估**；**组长拍线**；
 *        装不进样本 ⇒ `unclassified` 升级老板；**判不了 ⇒ 升级 + 卡红**（不是静默保留 open））·
 *   §3.1 第 3 条（评估 = 真/假/重复/判不了 + 严重度 + 代价档 + 大概怎么修；**这个「判不了」只是 bug 评估**，
 *        与严重线的「判不了」是两个词）· §6.2「严重 bug 判定」那一行（**改样本 = 版本 + 旧样本留档；改后不许重判**）。
 *   契约：`.team/test/CONTRACT-B.md` §7。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这一格守五件事：
 * `A` **四出口是闭集**：三条线 + `unclassified`；第五个值 ⇒ 拒（不是第五桶）。
 * `B` **第三线要有地基**：「读数说假话」**只有掩盖前两条时才算** ⇒ 判 `reading_lies` 必须点名它掩盖了哪一条
 *     （`hides`）；没点名 ⇒ 拒（`E_BUG_SEVERITY_THIRD_LINE_UNGROUNDED`）。这是定形那句话唯一的机械形态。
 * `C` **样本**：恰好四个（正 / 负 / 第三线正 / 第三线负）；**事故前预注册**（样本的 `registered_at`
 *     晚于它判的那次评估 ⇒ 拒 `E_BUG_SAMPLE_LATE`）；**改样本 = 版本 + 旧样本逐字留档**；
 *     **改后不许重判**（同一 entry 拿新版本再判一次 ⇒ 拒 `E_BUG_SAMPLE_REJUDGE`）；
 *     **第三线正 / 负只代表它自己的线** ⇒ 没被采样的第二条线，读数里 `calibrated:false`
 *     （"只校准够不够线"，不给未采样线赋值）。
 * `D` **两个作者各一个事实**：测试岗评估（`severity_line` / `severity_confidence`）· 组长拍线（`line_decision`）·
 *     组长处置（`disposition`）；跨角色写 ⇒ 拒 `E_BUG_WRITER_ROLE`。
 * `E` **判不了不是静默**：严重线上 `severity_confidence:'cannot'` 与 `unclassified` 都必须
 *     **升级（`escalate:true`）+ 卡红**（`bug-read` 的 `card_red`）；不给升级 ⇒ 拒
 *     `E_BUG_SEVERITY_ESCALATE_MISSING`。而**bug 评估**里的 `assessment:'unknown'` 是另一个词：
 *     它只让条目**保留 open、不清零**，不升级 —— 两个词分开（这一格两格都量）。
 *
 * ── 现在为什么红 ─────────────────────────────────────────────────────────
 * `lib/bug-ledger.mjs` 不存在 ⇒ A/B/C 的纯函数面没有载体；`agenia-route.mjs` 没有
 * `bug-samples-register` / `bug-assess` / `bug-read` ⇒ D/E 的写面没有载体。
 * （`bug-assess` / `bug-read` 与 `BUG-01` 共用 —— 那一格红了这一格必然也红，两个红因分开报。）
 */
import { before, test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { loadStagedModule, runRoute } from '../support/sut.mjs'
import {
  BUG_LIB, BUG_PATHS, SAMPLE_SET, SAMPLED_LINES, SEVERITY_EXITS, SEVERITY_LINES, UNCLASSIFIED,
  bugAbs, bugEntry, fileStat, ledgerFixture, makeWorkspace, missingOpProblem, opMissing, readLedger, refusalOf, writeLedger,
} from '../support/bug-surface.mjs'

before(() => {
  preflight()
})

/** 两个注入时刻：样本先注册（T_SAMPLES），评估在后（T_ASSESS）—— **预注册**就是这条时间序。 */
const T_SAMPLES = '2026-11-01T09:00:00+08:00'
const T_ASSESS = '2026-11-01T11:00:00+08:00'
/** 反过来的一对：评估在前、样本在后 ⇒ 那次评估"用了一个还不存在的样本集"。 */
const T_EARLY = '2026-11-01T08:00:00+08:00'

/** 四条预注册样本（形状照 `SAMPLE_SET`，正文是给人读的现场描述）。 */
const SAMPLES = SAMPLE_SET.map((s, i) => ({
  ...s,
  text: `样本 ${i + 1}：${s.line} 的 ${s.polarity} 例（夹具正文）`,
}))

const E_SEVERE = 'bug-20261101-01'
const E_CANNOT = 'bug-20261101-02'
const E_UNCLASS = 'bug-20261101-03'
const E_UNKNOWN = 'bug-20261101-04'

/**
 * 严重度判定的纯函数格（`severityVerdict`）。`want.exit` / `want.calibrated` / `want.escalate` 是判据全部。
 */
const SEVERITY_CELLS = [
  { id: 'S1', input: { line: 'data_broken', severity_confidence: 'yes' }, want: { ok: true, exit: 'data_broken', calibrated: true, escalate: false }, note: '第一条线：被采样 ⇒ 校准过' },
  { id: 'S2', input: { line: 'function_broken_repro', severity_confidence: 'yes' }, want: { ok: true, exit: 'function_broken_repro', calibrated: false, escalate: false }, note: '第二条线**没被采样** ⇒ calibrated:false（第三线正/负只代表它自己的线）' },
  { id: 'S3', input: { line: 'reading_lies', severity_confidence: 'yes' }, want: { ok: false, code: 'E_BUG_SEVERITY_THIRD_LINE_UNGROUNDED' }, note: '第三线不许空口断言 —— 必须点名它掩盖了前两条里的哪一条（hides）' },
  { id: 'S4', input: { line: 'reading_lies', hides: 'data_broken', severity_confidence: 'yes' }, want: { ok: true, exit: 'reading_lies', calibrated: true, escalate: false }, note: '点名掩盖第一条 ⇒ 收' },
  { id: 'S5', input: { line: 'unclassified', severity_confidence: 'cannot' }, want: { ok: true, exit: 'unclassified', escalate: true }, note: '装不进样本 ⇒ 第四个出口（不是第五桶）且**必须升级**' },
  { id: 'S6', input: { line: '严重', severity_confidence: 'yes' }, want: { ok: false }, note: '第四个值以外一律拒（出口是闭集）' },
]

/** 样本集的纯函数格（`sampleSetVerdict`）。 */
const SAMPLE_CELLS = [
  { id: 'P1', samples: SAMPLES, want: true, note: '正 / 负 / 第三线正 / 第三线负 —— 恰好四个' },
  { id: 'P2', samples: SAMPLES.slice(0, 3), want: false, note: '少一个 ⇒ 拒（四个样本是定形的数）' },
  { id: 'P3', samples: [...SAMPLES, { ...SAMPLES[0], text: '重复' }], want: false, note: '同一 line+polarity 出现两次 ⇒ 拒（集合不是多重集）' },
  { id: 'P4', samples: SAMPLES.map((s) => (s.line === 'reading_lies' ? { ...s, line: 'function_broken_repro' } : s)), want: false, note: '没有第三线那一对 ⇒ 拒（"第三线正 / 负"是定形点名要的）' },
]

test('BUG-04 严重三线：四出口闭集 · 第三线要有地基 · 样本预注册/版本化/不许重判 · 两个作者 · 判不了就升级+卡红', async () => {
  await runCase('BUG-04', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    const clockWs = makeWorkspace('bug04', 'clock')
    const nowFile = (t) => {
      const f = `${clockWs}/now-${t.replace(/[^0-9]/g, '')}.txt`
      writeFileSync(f, `${t}\n`, 'utf8')
      return f
    }
    const envAt = (t) => ({ ...process.env, AGENIA_NOW_FILE: nowFile(t) })

    // ── A/B · 出口与第三线的地基（纯函数）─────────────────────────────────────
    const lib = await loadStagedModule(BUG_LIB, ['severityVerdict', 'sampleSetVerdict', 'entryVerdict', 'openCounts', 'capVerdict'])
    if (lib.surfaceMissing || lib.missing.length > 0) {
      push('BUG-SEVERITY-SURFACE-MISSING', `${BUG_LIB} 还没有 severityVerdict / sampleSetVerdict ⇒ 三条线与四出口没有可判的载体（契约 §9.2）`)
    }
    if (!lib.surfaceMissing && typeof lib.mod.severityVerdict === 'function') {
      for (const cell of SEVERITY_CELLS) {
        const got = lib.mod.severityVerdict(cell.input)
        const ok = got?.ok === true
        if (ok !== cell.want.ok) {
          push('BUG-SEVERITY-EXIT', `${cell.id}（${cell.note}）：期望 ok=${cell.want.ok}，实得 ${JSON.stringify(got)}`)
          continue
        }
        if (!ok) {
          if (cell.want.code !== undefined && got.code !== cell.want.code) {
            push('BUG-SEVERITY-CODE', `${cell.id}：期望码 ${cell.want.code}，实得 ${JSON.stringify(got.code)}`)
          }
          continue
        }
        if (cell.want.exit !== undefined && got.exit !== cell.want.exit) {
          push('BUG-SEVERITY-EXIT-VALUE', `${cell.id}：exit 必须是 ${cell.want.exit}，实得 ${JSON.stringify(got.exit)}`)
        }
        if (cell.want.calibrated !== undefined && got.calibrated !== cell.want.calibrated) {
          push('BUG-SEVERITY-CALIBRATED', `${cell.id}：calibrated 必须是 ${cell.want.calibrated}，实得 ${JSON.stringify(got.calibrated)}（${cell.note}）`)
        }
        if (cell.want.escalate !== undefined && got.escalate !== cell.want.escalate) {
          push('BUG-SEVERITY-ESCALATE', `${cell.id}：escalate 必须是 ${cell.want.escalate}，实得 ${JSON.stringify(got.escalate)}（${cell.note}）`)
        }
        // 出口只能在四个里
        if (!SEVERITY_EXITS.includes(got.exit)) {
          push('BUG-SEVERITY-EXIT-SET', `${cell.id}：exit 必须是 ${SEVERITY_EXITS.join(' / ')} 之一，实得 ${JSON.stringify(got.exit)}`)
        }
      }
    }
    if (!lib.surfaceMissing && typeof lib.mod.sampleSetVerdict === 'function') {
      for (const cell of SAMPLE_CELLS) {
        const got = lib.mod.sampleSetVerdict({ samples: cell.samples })
        const ok = got?.ok === true
        if (ok !== cell.want) push('BUG-SAMPLE-SET', `${cell.id}（${cell.note}）：期望 ok=${cell.want}，实得 ${JSON.stringify(got)}`)
      }
    } else if (!lib.surfaceMissing) {
      push('BUG-SAMPLE-SURFACE-MISSING', `${BUG_LIB} 没有导出 sampleSetVerdict（样本集没有校验载体）`)
    }

    // ── C1 · 注册样本（预注册 = 时间序）+ 版本化留档 ─────────────────────────────
    const ws = makeWorkspace('bug04', 'samples')
    writeLedger(ws, ledgerFixture({
      entries: [bugEntry(E_SEVERE, T_ASSESS), bugEntry(E_CANNOT, T_ASSESS), bugEntry(E_UNCLASS, T_ASSESS), bugEntry(E_UNKNOWN, T_ASSESS)],
    }))
    const reg1 = await runRoute('bug04', 'bug-samples-register', { by_role: 'leader', samples: SAMPLES }, { workspace: ws, env: envAt(T_SAMPLES) })
    if (opMissing(reg1)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-samples-register', reg1).message)
    } else if (reg1.exit_code !== 0) {
      push('BUG-SAMPLES-REGISTER', `四条样本必须能注册（组长预注册；定形 §4.2），实得 exit=${reg1.exit_code} / ${reg1.json?.error?.code}：${String(reg1.stderr).trim().slice(0, 240)}`)
    } else {
      const set = readLedger(ws)?.severity_samples ?? null
      if (set === null || (set.samples ?? []).length !== 4) {
        push('BUG-SAMPLES-STORED', `台账的样本集必须留住四条，实得 ${JSON.stringify(set)?.slice(0, 240)}`)
      }
      if (set?.version !== 1) push('BUG-SAMPLES-VERSION', `第一次注册的样本集版本必须是 1，实得 ${JSON.stringify(set?.version)}`)
      if (set?.registered_by !== 'leader') push('BUG-SAMPLES-BY', `样本由**组长**预注册（定形 §4.2），实得 registered_by=${JSON.stringify(set?.registered_by)}`)
      if (set?.registered_at !== T_SAMPLES) push('BUG-SAMPLES-AT', `registered_at 必须是注入时钟那一刻（${T_SAMPLES}），实得 ${JSON.stringify(set?.registered_at)}`)
    }

    // 改样本 = 版本 + 旧样本留档（**逐字**）
    const changed = SAMPLES.map((s) => (s.line === 'data_broken' && s.polarity === 'negative' ? { ...s, text: '样本 2 换了正文（第二版）' } : s))
    const reg2 = await runRoute('bug04', 'bug-samples-register', { by_role: 'leader', samples: changed }, { workspace: ws, env: envAt(T_ASSESS) })
    if (!opMissing(reg2) && reg2.exit_code === 0) {
      const set = readLedger(ws)?.severity_samples ?? {}
      if (set.version !== 2) push('BUG-SAMPLES-BUMP', `改样本必须升版本（2），实得 ${JSON.stringify(set.version)}`)
      const old = (set.history ?? []).find((h) => h?.version === 1) ?? null
      if (old === null) {
        push('BUG-SAMPLES-HISTORY', '旧样本必须留档（`severity_samples.history[]` 里那一版逐字在），实得没有')
      } else if (JSON.stringify(old.samples) !== JSON.stringify(SAMPLES)) {
        push('BUG-SAMPLES-HISTORY-VERBATIM', '旧样本必须**逐字**留档（定形 §6.2：改样本 = 版本 + 旧样本留档），实得与第一版不同')
      }
    } else if (!opMissing(reg2)) {
      push('BUG-SAMPLES-SECOND', `第二次注册（改样本）必须能落，实得 exit=${reg2.exit_code} / ${reg2.json?.error?.code}`)
    }

    // ── D/E · 两个作者 + 判不了就升级 ─────────────────────────────────────────
    const assess = (payload, at = T_ASSESS) => runRoute('bug04', 'bug-assess', payload, { workspace: ws, env: envAt(at) })

    const leaderSeverity = await assess({ id: E_SEVERE, by_role: 'leader', assessment: 'true', severity_line: 'data_broken', severity_confidence: 'yes', sample_version: 2 })
    if (!opMissing(leaderSeverity)) {
      const bad = refusalOf('bug-assess（组长写严重线）', leaderSeverity, 'E_BUG_WRITER_ROLE')
      if (bad !== null) push('BUG-WRITER-ROLE-TEST', `${bad} —— 严重度评估的写者是**测试岗**（定形 §4.2：测试岗按样本评估），组长不写这一格`)
    }
    const testDecision = await assess({ id: E_SEVERE, by_role: 'test', assessment: 'true', line_decision: 'crosses', sample_version: 2 })
    if (!opMissing(testDecision)) {
      const bad = refusalOf('bug-assess（测试岗写线决定）', testDecision, 'E_BUG_WRITER_ROLE')
      if (bad !== null) push('BUG-WRITER-ROLE-LEADER', `${bad} —— 拍线的是**组长**（定形 §4.2：组长拍线），测试岗不写这一格`)
    }
    // 🔴 gate4 复审 BC-06：**两条缺的负样本**（都是真代码路径，但之前没有一条判据钉着）。
    // ① `severity_confidence` 是闭集（`yes` / `no` / `cannot`）：怪值 ⇒ `E_ARG_SCHEMA`，不许当成"没给"。
    const badConfidence = await assess({ id: E_SEVERE, by_role: 'test', assessment: 'true', severity_line: 'data_broken', severity_confidence: 'maybe', sample_version: 2 })
    if (!opMissing(badConfidence)) {
      const bad = refusalOf('bug-assess（severity_confidence=maybe）', badConfidence, 'E_ARG_SCHEMA')
      if (bad !== null) push('BUG-SEVERITY-CONFIDENCE-SET', `${bad} —— severity_confidence 只认 yes / no / cannot（判不了 = cannot）；怪值不许被读成"这一格没给"`)
    }
    // ② 处置（`bug-dispose`）的写者是**组长**：测试岗写 ⇒ `E_BUG_WRITER_ROLE` + 零写入。
    const ledgerFile = bugAbs(ws, BUG_PATHS.ledger)
    const shaBeforeDispose = fileStat(ledgerFile).sha256
    const testDispose = await runRoute('bug04', 'bug-dispose', {
      id: E_SEVERE, by_role: 'test', disposition: 'adopted', reason: '测试岗想直接把这条处置掉',
    }, { workspace: ws, env: envAt(T_ASSESS) })
    if (opMissing(testDispose)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-dispose', testDispose).message)
    } else {
      const bad = refusalOf('bug-dispose（测试岗写处置）', testDispose, 'E_BUG_WRITER_ROLE')
      if (bad !== null) push('BUG-DISPOSE-WRITER-ROLE', `${bad} —— 处置的写者是**组长**（定形 §3.1 第 4 条），测试岗不写这一格`)
      if (fileStat(ledgerFile).sha256 !== shaBeforeDispose) push('BUG-DISPOSE-WRITER-ROLE-WROTE', '被拒的处置**零写入**（bug 台账 sha256 前后相同）')
    }

    const okSevere = await assess({ id: E_SEVERE, by_role: 'test', assessment: 'true', severity_line: 'data_broken', severity_confidence: 'yes', sample_version: 2 })
    if (opMissing(okSevere)) push('BUG-OP-MISSING', missingOpProblem('bug-assess', okSevere).message)
    else if (okSevere.exit_code !== 0) push('BUG-ASSESS-SEVERITY-REFUSED', `合法严重度评估必须收，实得 exit=${okSevere.exit_code} / ${okSevere.json?.error?.code}`)

    // 第三线没地基 ⇒ 拒（写面同一口径）
    const thirdLine = await assess({ id: E_SEVERE, by_role: 'test', assessment: 'true', severity_line: 'reading_lies', severity_confidence: 'yes', sample_version: 2 })
    if (!opMissing(thirdLine)) {
      const bad = refusalOf('bug-assess（reading_lies 没 hides）', thirdLine, 'E_BUG_SEVERITY_THIRD_LINE_UNGROUNDED')
      if (bad !== null) push('BUG-THIRD-LINE-UNGROUNDED', `${bad} —— 「读数说假话」只有掩盖前两条时才算（定形 §4.2）；写面也必须挡住空口断言`)
    }

    // 判不了（严重线）但不升级 ⇒ 拒
    const cannotNoEsc = await assess({ id: E_CANNOT, by_role: 'test', assessment: 'unknown', severity_line: 'function_broken_repro', severity_confidence: 'cannot', sample_version: 2 })
    if (!opMissing(cannotNoEsc)) {
      const bad = refusalOf('bug-assess（cannot 不升级）', cannotNoEsc, 'E_BUG_SEVERITY_ESCALATE_MISSING')
      if (bad !== null) push('BUG-CANNOT-NO-ESCALATE', `${bad} —— 严重线上"判不了"必须**升级 + 卡红**（定形 §4.2），不许静默保留 open`)
    }
    // 判不了 + 升级 ⇒ 收；条目**保留 open、不清零**
    const cannotEsc = await assess({ id: E_CANNOT, by_role: 'test', assessment: 'unknown', severity_line: 'function_broken_repro', severity_confidence: 'cannot', escalate: true, sample_version: 2 })
    if (!opMissing(cannotEsc) && cannotEsc.exit_code !== 0) {
      push('BUG-CANNOT-ESCALATE-REFUSED', `判不了 + 升级必须收，实得 exit=${cannotEsc.exit_code} / ${cannotEsc.json?.error?.code}`)
    }
    // unclassified ⇒ 也要升级
    const unclassNoEsc = await assess({ id: E_UNCLASS, by_role: 'test', assessment: 'true', severity_line: 'unclassified', severity_confidence: 'cannot', sample_version: 2 })
    if (!opMissing(unclassNoEsc)) {
      const bad = refusalOf('bug-assess（unclassified 不升级）', unclassNoEsc, 'E_BUG_SEVERITY_ESCALATE_MISSING')
      if (bad !== null) push('BUG-UNCLASS-NO-ESCALATE', `${bad} —— 装不进样本 ⇒ unclassified 升级老板（定形 §4.2）`)
    }
    const unclassEsc = await assess({ id: E_UNCLASS, by_role: 'test', assessment: 'true', severity_line: 'unclassified', severity_confidence: 'cannot', escalate: true, sample_version: 2 })
    if (!opMissing(unclassEsc) && unclassEsc.exit_code !== 0) {
      push('BUG-UNCLASS-ESCALATE-REFUSED', `unclassified + 升级必须收，实得 exit=${unclassEsc.exit_code} / ${unclassEsc.json?.error?.code}`)
    }
    // bug 评估里的 unknown 是**另一个词**：保留 open、不升级
    const unknownOnly = await assess({ id: E_UNKNOWN, by_role: 'test', assessment: 'unknown', sample_version: 2 })
    if (!opMissing(unknownOnly) && unknownOnly.exit_code !== 0) {
      push('BUG-ASSESS-UNKNOWN', `评估为 unknown（判不了）必须收 —— 它只让条目**保留 open**，不升级（与严重线的"判不了"是两个词），实得 exit=${unknownOnly.exit_code} / ${unknownOnly.json?.error?.code}`)
    }

    // 卡红（读面）：判不了 / unclassified 必须让卡红，并点名那一条
    const read = await runRoute('bug04', 'bug-read', undefined, { workspace: ws, env: envAt(T_ASSESS) })
    if (opMissing(read)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-read', read).message)
    } else if (read.exit_code === 0) {
      const cardRed = read.json?.card_red ?? null
      if (cardRed === null) {
        push('BUG-CARD-RED-MISSING', '`bug-read` 必须给出 `card_red`（判不了 / unclassified 时卡要红 —— 定形 §4.2「升级 + 卡红」）')
      } else {
        if (cardRed.red !== true) push('BUG-CARD-RED', `有"判不了"与 unclassified 两条在账上 ⇒ card_red.red 必须是 true，实得 ${JSON.stringify(cardRed)}`)
        const text = JSON.stringify(cardRed)
        for (const id of [E_CANNOT, E_UNCLASS]) {
          if (!text.includes(id)) push('BUG-CARD-RED-NAMES', `卡红必须点名是哪一条（缺 ${id}），实得 ${text.slice(0, 240)}`)
        }
      }
      const counts = read.json?.counts ?? {}
      if (counts.bug_open !== 4) {
        push('BUG-UNKNOWN-STAYS-OPEN', `评估（含 unknown）不是处置：四条都还没有 disposition ⇒ bug_open 必须是 4，实得 ${JSON.stringify(counts)}`)
      }
    }

    // ── C2 · 预注册（时间序）：样本晚于它判的那次评估 ⇒ 拒 ────────────────────────
    const wsLate = makeWorkspace('bug04', 'late')
    writeLedger(wsLate, ledgerFixture({ entries: [bugEntry('bug-20261101-09', T_EARLY)] }))
    const lateReg = await runRoute('bug04', 'bug-samples-register', { by_role: 'leader', samples: SAMPLES }, { workspace: wsLate, env: envAt(T_ASSESS) })
    const lateAssess = await runRoute('bug04', 'bug-assess', {
      id: 'bug-20261101-09', by_role: 'test', assessment: 'true',
      severity_line: 'data_broken', severity_confidence: 'yes', sample_version: 1,
    }, { workspace: wsLate, env: envAt(T_EARLY) })
    if (opMissing(lateAssess)) {
      push('BUG-OP-MISSING', missingOpProblem('bug-assess', lateAssess).message)
    } else if (!opMissing(lateReg) && lateReg.exit_code === 0) {
      const bad = refusalOf('bug-assess（用了一个还没注册的样本集）', lateAssess, 'E_BUG_SAMPLE_LATE')
      if (bad !== null) push('BUG-SAMPLE-PREREGISTRATION', `${bad} —— 样本必须**事故前预注册**（定形 §4.2）：样本 registered_at=${T_ASSESS} 晚于这次评估的时刻 ${T_EARLY} ⇒ 那次评估不可能"按样本"判过`)
    }

    // ── C3 · 改后不许重判（同一 entry 换版本再判 ⇒ 拒）───────────────────────────
    const wsRe = makeWorkspace('bug04', 'rejudge')
    const RE = 'bug-20261101-10'
    writeLedger(wsRe, ledgerFixture({ entries: [bugEntry(RE, T_ASSESS)] }))
    const reReg = await runRoute('bug04', 'bug-samples-register', { by_role: 'leader', samples: SAMPLES }, { workspace: wsRe, env: envAt(T_SAMPLES) })
    const first = await runRoute('bug04', 'bug-assess', { id: RE, by_role: 'test', assessment: 'true', severity_line: 'data_broken', severity_confidence: 'yes', sample_version: 1 }, { workspace: wsRe, env: envAt(T_ASSESS) })
    const bump = await runRoute('bug04', 'bug-samples-register', { by_role: 'leader', samples: changed }, { workspace: wsRe, env: envAt(T_ASSESS) })
    const again = await runRoute('bug04', 'bug-assess', { id: RE, by_role: 'test', assessment: 'false', severity_line: 'data_broken', severity_confidence: 'no', sample_version: 2 }, { workspace: wsRe, env: envAt(T_ASSESS) })
    if (!opMissing(again) && !opMissing(first) && !opMissing(reReg) && reReg.exit_code === 0 && first.exit_code === 0 && !opMissing(bump) && bump.exit_code === 0) {
      const bad = refusalOf('bug-assess（换了样本版本再判一次）', again, 'E_BUG_SAMPLE_REJUDGE')
      if (bad !== null) push('BUG-SAMPLE-REJUDGE', `${bad} —— 改样本之后**不许重判**（定形 §6.2：改后不许重判）：同一条 entry 已经在 v1 下判过，v2 再判就是把旧结论改写成新样本的结论`)
    }

    caseFail(problems)
    rec.readings.bug04 = {
      exits: SEVERITY_EXITS,
      sampled_lines: SAMPLED_LINES,
      unsampled_line: 'function_broken_repro',
      sample_cells: SAMPLE_CELLS.map((c) => c.id),
      severity_cells: SEVERITY_CELLS.map((c) => c.id),
      // BC-06 的两条负样本：码是**跑出来的**（没走到的那一格是 null）。
      negative_cells: {
        severity_confidence_maybe: badConfidence.json?.error?.code ?? null,
        bug_dispose_by_test: testDispose.json?.error?.code ?? null,
      },
    }
  })
})
