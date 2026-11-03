/**
 * `RGATE-01` —— **两份每日评审必须等今天的记忆判决报告落盘**（老板 2026-11-03 定的硬门）。
 *
 * 病历：`bug-20261103-01`（判决还没回来就派两份每日评审 —— 2026-11-02 犯过两次，2026-11-03 09:10 第三次）。
 * 被锁的那条判据（**生产** `presets/agenia/inject.js::dailyReviewGateVerdict`）：
 *   `job_conversation_review` / `job_technical_review` 在 `tools.guard` 里被拒，除非
 *   `<内容根>/.runtime/reports/memory-update/<day>.json` 在盘上；拒绝码 `E_REVIEW_BEFORE_JUDGE`，
 *   报文点名那一天。`<day>` 是**本地日**，从**本地 04:00** 切（与 `lib/route.mjs::dayKeyOf` 同一口径）。
 *
 * ── 这一格量哪一层（口径写清，别读成端到端）──────────────────────────────────
 *   · 真跑**生产**那份 `presets/agenia/inject.js` 的 `apply()`，调它自己注册的 `tools.guard` 回调
 *     （假 ctx，载具 `support/injector-harness.mjs`；与 `BRG-*` / `BMAP-01` 同一具）；
 *   · 内容根是**合成的**（`buildContentRoot`，落在运行根里）—— 报告文件由本用例亲手种，
 *     真 `presets/agenia/.runtime/` 一个字节都不碰；
 *   · 时钟是**钉住的**（`node:test` 的 `mock.timers`，只遮 `Date`）：判据按本地 04:00 切算"今天"，
 *     不钉就会随墙钟漂。钉没钉上由 `RGATE-CLOCK-*` 单独报 —— **判不了 ≠ 绿**。
 *   · 这棵树 = **本工作区**的 `presets/agenia`（与 `BRG-*` / `BMAP-01` 同口径；路径 + sha256 记在
 *     `readings.rgate01.preset`，"量的是哪一版"自报）。staged 靶子是否已带上这道闸**由入口的
 *     `F57-TARGET` 每次现量** —— 这里不复述那个差额（它会随靶子同步而变，写死就会变成一句过期的话）。
 *
 * ── 四格 + 两格量具自证（红要能翻面才叫判据，`mig-rules-14`）──────────────────
 *   `A` **RED（今天）**：内容根里**没有** `2026-11-02` 的报告 ⇒ 两个工具**都**被拒，
 *       码**恰好** `E_REVIEW_BEFORE_JUDGE`（且**不是**门禁里另外那几个码 —— `OTHER_GATE_CODES`），
 *       报文点名 `2026-11-02`、且**不**点名 `2026-11-03`。
 *   `B` **GREEN 对照**：种一份 `2026-11-02` 报告 ⇒ **同一个调用**（`name` / `arguments` / `agent`
 *       逐字相同，见 `RGATE-NOT-SAME-CALL`）放行，且放行值必须是 `undefined`（不是"别的闸放行"）。
 *       这一格就是 `A` 那个"红"字的合法性来源：两边唯一的差别是那份文件在不在。
 *   `C` **阴性对照**：`team_test`（不在这道闸的名单里）在**同一副"没有报告"的根**上照样放行。
 *   `D` **一天从本地 04:00 切**：两个钉住的时刻 × 三副报告现场（无 / 只有 11-02 / 只有 11-03）——
 *       本地 `01:30:00` ⇒ 点名 `2026-11-02`；本地 `04:00:01` ⇒ 点名 `2026-11-03`。
 *       两向一夹（`D1b` 只有 11-03 的报告在切点下方**不顶用**、`B2` 只有 11-02 的报告在切点上方
 *       **不顶用**），整数小时的切点只能是 **4**。
 *   `C2` **判词的区分力**（量具自证）：同一个每日评审工具**显式塞 `run_in_background:false`** ⇒ 被
 *       **后台硬门**先拒，那是**另一句话**（运行时报文不带码 —— `return background.message`，
 *       码 `E_GUARD_JOB_FOREGROUND` 只活在纯函数 verdict 里，由 `GRD-01` 钉）。
 *       没有这一格，"精确码"这条断言可能只是碰巧：它证明同一把工具上**还有**别的闸在响、
 *       而那一声与每日评审闸的报文分得开（不点日子、不点报告路径）。
 *   `P` **预检/夹具自证**：被测面加载得上、guard 真的挂上了（`RGATE-HARNESS-GUARD`，不是功能红）、
 *       三副根的报告现场恰好是 无/11-02/11-03（`RGATE-FIXTURE-REPORT-STATE`）、
 *       时刻真的落在"切点下方"（`RGATE-FIXTURE-CUT-SIDE`：零点尺子会算出另一天，否则分不出 04:00 与 00:00）。
 *
 * ── 为什么没有刀（`presets/**` 一个字节不动）──────────────────────────────────
 * 这条判据的"能翻面"由 `A`/`B` 与 `D` 两侧证明（同一个调用：报告在 ⇒ 过、不在 ⇒ 拒；同一副空根：
 * 时钟换一侧 ⇒ 点名的日子跟着换）。刀切的是**实现**，而这一票问的是"那道闸在不在、拒得对不对"；
 * 生产文件不归测试岗动 —— 所以没有变异体，也不假装有。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { FROZEN } from '../support/env.mjs'
import {
  DAILY_REPORT_DIR, buildCatalog, buildContentRoot, configFromComposition, dailyReportPathOf,
  loadInjector, plantDailyReport, withHarness,
} from '../support/injector-harness.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// 被测树 = 本工作区的生产预设（闸落在生产上；staged 靶子是否同版由入口的 `F57-TARGET` 现量）
// ─────────────────────────────────────────────────────────────────────────────
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const PRESET = path.join(REPO, 'presets', 'agenia')
const INJECTOR = path.join(PRESET, 'inject.js')
const YML = path.join(PRESET, 'agent.cordis.yml')

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()

let SUT = { ok: false, code: 'SUT-SURFACE-MISSING', why: '还没加载', mod: null }

// ── 契约（手写，不从被测物反推）───────────────────────────────────────────────
/** 这道闸守的那两个工具名（老板 2026-11-03 的原话：「两份每日评审」= 会话评审 + 技术评审）。 */
const DAILY_REVIEW_TOOLS = ['job_conversation_review', 'job_technical_review']
/** 不在这道闸名单里的工具（阴性对照）。 */
const UNRELATED_TOOL = 'team_test'
/** 这道闸的拒绝码（票面 / 定形逐字）。 */
const REVIEW_GATE_CODE = 'E_REVIEW_BEFORE_JUDGE'
/**
 * **门禁里另外那几个码**（闭集，2026-11-03 从生产 `inject.js` 的 guard 段读出、手抄在这儿）。
 * 为什么手抄：判据的期望值不许从被测物反推（`cand-20261016-selfsourced-order-01`）——
 * 这一份与源码是两份独立载体，两边一起错的时候才看不见。
 */
const OTHER_GATE_CODES = [
  'E_GUARD_CONFIG_MISSING', // 后台硬门：委派名单配置坏了
  'E_GUARD_JOB_FOREGROUND', // 后台硬门：job_* 显式塞前台
  'E_GUARD_SELF_FOREGROUND', // 后台硬门：continuable 显式塞前台
  'E_GUARD_NARROW_TOOL', // 窄权限：白名单
  'E_GUARD_NARROW_WRITE', // 窄权限：写落点
  'E_GUARD_NARROW_PROPOSAL', // 窄权限：提案
  'E_GUARD_ROLE_TOOL', // 角色工具集
  'E_GUARD_JUDGE_PROPOSAL', // 判决岗的提案拒
  'E_GUARD_OFFICE_SHELL', // 岗位写边界：命令行
  'E_GUARD_OFFICE_WRITE', // 岗位写边界：写落点
]
/** 记忆判决报告在内容根下的落点（相对）：`<内容根>/.runtime/reports/memory-update/<day>.json`。
 *  **路径只有一份定义**（`support/injector-harness.mjs`）—— 本用例与 `brg01` 的夹具共用它。 */
const REPORT_TAIL = DAILY_REPORT_DIR.slice(1).join('/')
/** 切点（小时，本地）—— 契约 §13.1 的那一个数。 */
const CUT_HOURS = 4
/**
 * 🔴 **两个钉住的时刻用"本地日历"构造**（`new Date(y, m, d, h, mm, ss)`），不用 `+08:00` 字符串：
 * 判据算的是**本地日**，夹具也按本地日历给定 ⇒ 换个时区跑，期望值一个字都不用改。
 *   · `INSTANT_BELOW` = 本地 `2026-11-03 01:30:00` —— 切点**下方**（零点尺子会说 11-03，04:00 尺子说 11-02）；
 *   · `INSTANT_ABOVE` = 本地 `2026-11-03 04:00:01` —— 切点**上方**（两把尺子同值）。
 */
const INSTANT_BELOW = new Date(2026, 10, 3, 1, 30, 0, 0)
const INSTANT_ABOVE = new Date(2026, 10, 3, 4, 0, 1, 0)
/** 两个时刻各自该落到的那一天（**手写**：01:30 属于前一天；04:00:01 已经是新的一天）。 */
const WANT_DAY_BELOW = '2026-11-02'
const WANT_DAY_ABOVE = '2026-11-03'

// ── 会话 / 调用（三副根共用同一份 `call`：只有内容和时钟在变）───────────────────
const SESSION_ID = 'rgate-session-0001'
const PARENT_HEADER_ID = 'rgate-parent-0001'
const AGENT_ID = 'rgate-agent-0001'
const agentCwd = () => path.join(runRoot(), 'workspace')
const headerOf = () => ({ id: PARENT_HEADER_ID, cwd: agentCwd(), agentPreset: 'agenia' })
const agentOf = () => ({ id: AGENT_ID, session: { id: SESSION_ID, header: headerOf() } })
/** 一次工具调用（`tools.guard` 收到的形状）；同一个工具永远是同一个对象形状 ⇒ 可逐字比。 */
const callOf = (name, args = {}) => ({ name, arguments: args, agent: agentOf() })

const pad2 = (n) => String(n).padStart(2, '0')
/** 本地日历日（**不做**切点换算的纯格式化）。 */
function localDayOf(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
/**
 * 契约口径：`本地日期(instant − 4h)`。
 * ⚠️ **只用于夹具自证**（"这个时刻真的落在切点下方吗"）；判据的期望值是上面手写的
 * `WANT_DAY_*` —— 拿实现反推期望值，两边一起错的时候就没人看得见。
 */
const cutDayOfLocal = (instant) => localDayOf(new Date(instant.getTime() - CUT_HOURS * 3600 * 1000))

const reportPathOf = (contentDir, day) => dailyReportPathOf(contentDir, day)

/** 种一份报告（路径与正文形状只有一份定义：`support/injector-harness.mjs::plantDailyReport`）。 */
const plantReport = (contentDir, day) => plantDailyReport(contentDir, day, 'RGATE-01 夹具：这道闸判的是这份文件在不在，不读正文')

/** 一副合成内容根 + 从组合读出来的 config（载具**不手抄** leaderOrder / delegationTools）。 */
function fixture(id) {
  const contentDir = path.join(runRoot(), 'tmp', 'rgate', id)
  buildContentRoot({ root: contentDir, presetDir: PRESET, runRoot: runRoot() })
  const conf = configFromComposition({ ymlText: readFileSync(YML, 'utf8'), contentDir })
  const base = Array.isArray(SUT.mod?.BASE_TOOL_SET) ? SUT.mod.BASE_TOOL_SET : null
  return {
    id,
    contentDir,
    conf,
    catalog: base === null ? null : buildCatalog(base),
    config: conf.ok ? { ...conf.config, defaultRole: 'member' } : null,
  }
}

/** 门禁读数的三态：`allow` / `reject`（带头码）/ `message`（拒了但报文里**没有**码）/ 别的东西。 */
function verdictOf(res) {
  if (res === null || typeof res !== 'object') return { kind: 'no-harness', code: null, message: '' }
  if (res.ok !== true) return { kind: 'no-guard', code: null, message: String(res.why ?? '') }
  const reason = res.reason
  if (reason === undefined) return { kind: 'allow', code: null, message: '' }
  if (typeof reason === 'string') {
    // 门禁的拒绝形状是 `${code}：${message}`（全角冒号；见 `inject.js` 的 guard 回调）。
    // ⚠️ 只有**码形状**的那个头才算码：后台硬门那条判定的运行时报文**不带码**
    //    （`return background.message`，码只活在纯函数的 verdict 里、由 `GRD-01` 钉）——
    //    不认形状的话，报文正文里的全角冒号会被当成码，`C2` 那一格就量错了。
    const at = reason.indexOf('：')
    const head = at > 0 ? reason.slice(0, at) : ''
    if (/^E_[A-Z][A-Z0-9_]+$/.test(head)) return { kind: 'reject', code: head, message: reason.slice(at + 1), raw: reason }
    return { kind: 'message', code: null, message: reason, raw: reason }
  }
  return { kind: 'shape', code: null, message: JSON.stringify(reason)?.slice(0, 200) ?? String(reason) }
}

/** 报文里出现过的所有 `E_*` 码（读数，不是断言 —— 断言只看**判词那个**码）。 */
const codesIn = (text) => [...new Set([...String(text ?? '').matchAll(/\bE_[A-Z][A-Z0-9_]+\b/g)].map((m) => m[0]))]

/** 跑一次 `apply()` 并调一次 guard（每次都是新闭包 ⇒ 不共享 `narrowSessions` 之类的状态）。 */
async function guardCall(fx, call) {
  let res = null
  let thrown = null
  try {
    await withHarness(SUT.mod, {
      contentDir: fx.contentDir,
      config: fx.config,
      header: headerOf(),
      id: SESSION_ID,
      catalog: fx.catalog,
    }, async (harness) => {
      res = harness.guard(call)
    })
  } catch (err) {
    thrown = `${err?.code ?? err?.name ?? 'THROW'}: ${String(err?.message ?? err).slice(0, 240)}`
  }
  return { call, res, thrown, verdict: verdictOf(res) }
}

test('RGATE-01 每日评审要等今天的记忆判决报告（码恰好 E_REVIEW_BEFORE_JUDGE · 本地 04:00 切）', async (t) => {
  await runCase('RGATE-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {
      preset: {
        file: INJECTOR,
        bytes: readFileSync(INJECTOR).length,
        sha256: sha256(INJECTOR),
        tree: '生产 · presets/agenia（不是 staged 靶子）',
      },
      /**
       * 静态读数（**不断言**）：那段闸的落点在不在。行为判据在下面四格里 —— 这里只给"红的时候
       * 先看哪一眼"一个指针（闸被整段 revert 掉时，`A` 会以 `RGATE-NOT-REFUSED` 的形状红）。
       */
      gate_in_source: Object.fromEntries(
        ['dailyReviewGateVerdict', 'E_REVIEW_BEFORE_JUDGE', 'localDayKeySync', 'reports', 'memory-update']
          .map((needle) => [needle, readFileSync(INJECTOR, 'utf8').includes(needle)]),
      ),
      clock: { seam: 'node:test mock.timers（apis:[Date]）', cells: [], fixture: null, after_reset: null },
      report_presence: null,
      planted: null,
      cells: {},
    }
    rec.readings.rgate01 = readings

    // ── P 预检：被测面 / 载具 / 时钟接缝（判不了 ≠ 绿，各自点名）──────────────────
    if (!SUT.ok) {
      push(SUT.code ?? 'SUT-SURFACE-MISSING', `被测面没加载上：${SUT.why}`)
      return caseFail(problems)
    }
    if (typeof SUT.mod.apply !== 'function') {
      push('SUT-SURFACE-MISSING', '生产 inject.js 没有导出 `apply` —— 那道闸挂在 apply() 的 guard 回调里，这一格无从驱动')
      return caseFail(problems)
    }
    if (typeof t?.mock?.timers?.enable !== 'function') {
      push('RGATE-CLOCK-NOT-DATE', '这一版 node 没有 `mock.timers` —— 时钟钉不住，"今天"这个输入就量不了（判不了，不是绿）')
      return caseFail(problems)
    }
    const fxNone = fixture('none') // 任何时候都不种报告
    const fxPrev = fixture('prev') // 只种 2026-11-02（切点下方那一天）
    const fxNext = fixture('next') // 只种 2026-11-03（切点上方那一天）
    for (const fx of [fxNone, fxPrev, fxNext]) {
      if (fx.conf?.ok !== true || fx.catalog === null || fx.config === null) {
        push('RGATE-HARNESS-CONFIG',
          `载具起不来（${fx.id}）：config ${fx.conf?.ok === true ? 'ok' : (fx.conf?.why ?? '(无)')}`
          + ` · catalog ${fx.catalog === null ? 'null' : 'ok'}`)
      }
    }
    if (problems.length > 0) return caseFail(problems)
    readings.planted = {
      prev: plantReport(fxPrev.contentDir, WANT_DAY_BELOW),
      next: plantReport(fxNext.contentDir, WANT_DAY_ABOVE),
    }
    readings.report_presence = Object.fromEntries([fxNone, fxPrev, fxNext].map((fx) => [fx.id, {
      content_dir: fx.contentDir,
      [WANT_DAY_BELOW]: existsSync(reportPathOf(fx.contentDir, WANT_DAY_BELOW)),
      [WANT_DAY_ABOVE]: existsSync(reportPathOf(fx.contentDir, WANT_DAY_ABOVE)),
    }]))
    // 夹具自证：三副根的现场必须**恰好**是 无/11-02/11-03 —— 差一格，后面的绿红都读不成那个意思。
    const wantPresence = {
      none: { [WANT_DAY_BELOW]: false, [WANT_DAY_ABOVE]: false },
      prev: { [WANT_DAY_BELOW]: true, [WANT_DAY_ABOVE]: false },
      next: { [WANT_DAY_BELOW]: false, [WANT_DAY_ABOVE]: true },
    }
    for (const [id, want] of Object.entries(wantPresence)) {
      const got = readings.report_presence[id]
      for (const day of [WANT_DAY_BELOW, WANT_DAY_ABOVE]) {
        if (got[day] !== want[day]) {
          push('RGATE-FIXTURE-REPORT-STATE',
            `夹具报告现场不对（${id} · ${day}）：期望 ${want[day] ? '在' : '不在'}，实得 ${got[day] ? '在' : '不在'}`
            + `（${reportPathOf(got.content_dir, day)}）—— 这一格量的不是功能，是夹具`)
        }
      }
    }
    /** 判"没有报告"的必须是**同一个路径形状**；把落点本身记下来，红的时候不用猜闸看的是哪儿。 */
    readings.report_path_shape = {
      none: reportPathOf(fxNone.contentDir, WANT_DAY_BELOW),
      prev: reportPathOf(fxPrev.contentDir, WANT_DAY_BELOW),
    }

    // ── 夹具自证：两个时刻真的落在切点两侧 ───────────────────────────────────────
    const cutBelow = cutDayOfLocal(INSTANT_BELOW)
    const cutAbove = cutDayOfLocal(INSTANT_ABOVE)
    const calBelow = localDayOf(INSTANT_BELOW)
    const calAbove = localDayOf(INSTANT_ABOVE)
    readings.clock.fixture = {
      cut_hours: CUT_HOURS,
      below: { instant_local: INSTANT_BELOW.toString(), want_day: WANT_DAY_BELOW, cut_day: cutBelow, calendar_day: calBelow },
      above: { instant_local: INSTANT_ABOVE.toString(), want_day: WANT_DAY_ABOVE, cut_day: cutAbove, calendar_day: calAbove },
    }
    if (cutBelow !== WANT_DAY_BELOW || cutAbove !== WANT_DAY_ABOVE) {
      push('RGATE-FIXTURE-DAY',
        `夹具时刻与"04:00 切"对不上：${INSTANT_BELOW.toString()} ⇒ ${cutBelow}（应为 ${WANT_DAY_BELOW}）、`
        + `${INSTANT_ABOVE.toString()} ⇒ ${cutAbove}（应为 ${WANT_DAY_ABOVE}）—— 先修夹具，别读成功能红`)
    }
    if (calBelow === WANT_DAY_BELOW) {
      push('RGATE-FIXTURE-CUT-SIDE',
        `${INSTANT_BELOW.toString()} 的本地日历日就是 ${WANT_DAY_BELOW}（零点尺子同值）⇒ 这一时刻在切点**上方**，`
        + '分不出 04:00 与 00:00 —— 夹具选错了时刻')
    }
    if (calAbove !== WANT_DAY_ABOVE) {
      push('RGATE-FIXTURE-CUT-SIDE',
        `${INSTANT_ABOVE.toString()} 的本地日历日是 ${calAbove}（应为 ${WANT_DAY_ABOVE}）—— 夹具选错了时刻`)
    }

    // ── 断言工具（两态：该拒 / 该放行；读数一律进 `readings.cells`）────────────────
    /**
     * 该拒的那一侧（**只判这道闸**：`C2` 那种"另一个闸"另走 `expectOtherGateRefusal`）。
     * @param {string} label 格名（`A:job_conversation_review` 这种，红的时候一眼看得出是哪一格）
     * @param {ReturnType<typeof guardCall>} out
     * @param {{day?: string|null, crossDay?: string|null, why: string}} want
     */
    const expectReject = (label, out, want) => {
      const v = out.verdict
      const code = REVIEW_GATE_CODE
      readings.cells[label] = {
        tool: out.call.name,
        arguments: out.call.arguments,
        call: JSON.stringify(out.call),
        harness_ok: out.res?.ok ?? null,
        thrown: out.thrown,
        kind: v.kind,
        code: v.code,
        message: v.message,
        raw: v.raw ?? null,
        codes_in_message: codesIn(v.raw),
      }
      if (out.thrown !== null) {
        push('RGATE-HARNESS-THROW', `${label}：门禁这一调用抛了（${out.thrown}）—— 那是被测对象的崩溃，不是"拒了"`)
        return
      }
      if (v.kind === 'no-guard') {
        push('RGATE-HARNESS-GUARD', `${label}：这个注入器没有注册 tools.guard（${v.message}）—— 门禁没挂上，夹具先修`)
        return
      }
      if (v.kind === 'allow') {
        push('RGATE-NOT-REFUSED', `${label}：应当被拒 ${code}（${want.why}），实得**放行** —— 这道闸没咬住`)
        return
      }
      if (v.kind !== 'reject') {
        push('RGATE-VERDICT-SHAPE',
          `${label}：门禁的返回值不是 \`{E_*码}：{message}\` 形状（kind=${v.kind}）`
          + `：${v.message.slice(0, 200)} —— 拒绝码就是这道闸的判词，头上一格不许缺`)
        return
      }
      if (v.code !== code) push('RGATE-WRONG-CODE', `${label}：拒绝码应为 ${code}，实得 ${JSON.stringify(v.code)}（报文：${v.message.slice(0, 200)}）`)
      // 任务口径："拒的**不是**门禁里另外那几个码"——精确相等已经蕴含它，这里再显式判一次（读的人不必推）
      if (OTHER_GATE_CODES.includes(v.code)) {
        push('RGATE-OTHER-GATE', `${label}：拒它的是**另一个闸**（${v.code}），不是每日评审那道闸 —— 这一格量错了东西`)
      }
      if (want.day !== undefined && want.day !== null) {
        if (!v.message.includes(want.day)) {
          push('RGATE-MESSAGE-NO-DAY', `${label}：报文里没有点名那一天 ${want.day}（实得：${v.message.slice(0, 240)}）—— 读的人不知道在等哪一天的报告`)
        }
        if (want.crossDay !== undefined && want.crossDay !== null && v.message.includes(want.crossDay)) {
          push('RGATE-MESSAGE-CROSS-DAY',
            `${label}：报文点名的是 ${want.day}，却把另一天 ${want.crossDay} 也写进去了（实得：${v.message.slice(0, 240)}）—— `
            + '"今天"到底是哪一天，这一句必须只有一个答案')
        }
      }
      if (code === REVIEW_GATE_CODE && !v.message.includes(REPORT_TAIL)) {
        push('RGATE-MESSAGE-NO-PATH', `${label}：报文里没有点出那份报告在哪（缺 \`${REPORT_TAIL}\`）：${v.message.slice(0, 240)}`)
      }
    }
    /**
     * **另一个闸**的拒绝（`C2` 用）：它拒的是同一把工具、但理由不是"判决没落盘"。
     * 判三件事：① 真的拒了；② 报文命中**后台硬门**的冻结针（`FROZEN.guardMessageNeedles.must`）；
     * ③ 报文里**没有**每日评审闸的痕迹（不点名日子、不点报告路径）—— 两句话必须分得开。
     * ⚠️ 后台硬门的运行时报文**不带码**：码只活在纯函数 verdict 里（`GRD-01` 钉）。
     *    所以这里记 `has_code_head:false` 是**读数**，不是红。
     * @param {string} label
     * @param {ReturnType<typeof guardCall>} out
     * @param {string} why
     */
    const expectOtherGateRefusal = (label, out, why) => {
      const v = out.verdict
      readings.cells[label] = {
        tool: out.call.name,
        arguments: out.call.arguments,
        call: JSON.stringify(out.call),
        harness_ok: out.res?.ok ?? null,
        thrown: out.thrown,
        kind: v.kind,
        code: v.code,
        message: v.message,
        raw: v.raw ?? null,
        codes_in_message: codesIn(v.raw),
        has_code_head: v.kind === 'reject',
      }
      if (out.thrown !== null) {
        push('RGATE-HARNESS-THROW', `${label}：门禁这一调用抛了（${out.thrown}）`)
        return
      }
      if (v.kind === 'allow') {
        push('RGATE-NOT-REFUSED', `${label}：另一个闸也没拒（${why}）—— 这一格证明不了"码是分得清的"`)
        return
      }
      /**
       * 判词**是不是**每日评审闸那一条 —— 这是这一格唯一的实质断言：
       *   · 带着每日评审闸的码 ⇒ 那一发被这道闸拒了（"另一句话"不成立）；
       *   · 带着门禁码表**之外**的头码 ⇒ 读码这一步会认不出它（两个闸分不开）。
       * ⚠️ 「后台硬门的运行时报文不带码」是**今天的读数**（`return background.message`，码只在纯函数
       *    verdict 里、`GRD-01` 钉），**不是**判据：哪一天给它加上 `E_GUARD_JOB_FOREGROUND：` 前缀，
       *    这一格照样绿（`has_code_head` 只进读数）—— 别让这一格变成"改格式就红"的变更探测器。
       */
      if (v.code === REVIEW_GATE_CODE) {
        push('RGATE-OTHER-GATE', `${label}：这一发的判词是每日评审闸的码（${v.code}）—— 后台硬门没先拒？那 \`A\` 那一格量到的可能不是这道闸（${why}）`)
      } else if (v.code !== null && !OTHER_GATE_CODES.includes(v.code)) {
        push('RGATE-OTHER-GATE-CODE',
          `${label}：报文带着一个不在门禁码表里的头码 ${JSON.stringify(v.code)}（码表 ${OTHER_GATE_CODES.join(' / ')}）—— `
          + '读码这一步会把它读成"另一个闸"，A 那一格的精确码断言就不算读数了')
      }
      if (!v.message.includes(FROZEN.guardMessageNeedles.must) || !v.message.includes(out.call.name)) {
        push('RGATE-OTHER-GATE-TEXT',
          `${label}：报文不像后台硬门那一条（要同时含「${FROZEN.guardMessageNeedles.must}」与工具名 ${out.call.name}）：${v.message.slice(0, 240)}`)
      }
      if (v.message.includes(REPORT_TAIL) || v.message.includes(WANT_DAY_BELOW) || v.message.includes(WANT_DAY_ABOVE)) {
        push('RGATE-OTHER-GATE-TEXT',
          `${label}：后台硬门的报文里出现了每日评审闸的痕迹（报告路径 / 日子）—— 两句话分不开，A 那一格就可能量错闸：${v.message.slice(0, 240)}`)
      }
    }
    /**
     * @param {string} label 格名
     * @param {ReturnType<typeof guardCall>} out
     * @param {string} why 为什么该放行（红的时候要能读出来）
     */
    const expectAllow = (label, out, why) => {
      const v = out.verdict
      readings.cells[label] = {
        tool: out.call.name,
        arguments: out.call.arguments,
        call: JSON.stringify(out.call),
        harness_ok: out.res?.ok ?? null,
        thrown: out.thrown,
        kind: v.kind,
        code: v.code,
        message: v.message,
        raw: v.raw ?? null,
      }
      if (out.thrown !== null) {
        push('RGATE-HARNESS-THROW', `${label}：门禁这一调用抛了（${out.thrown}）—— 放行那一侧也炸，不是"没拦"`)
        return
      }
      if (v.kind === 'no-guard') {
        push('RGATE-HARNESS-GUARD', `${label}：这个注入器没有注册 tools.guard（${v.message}）—— 门禁没挂上，"放行"这句话不成立`)
        return
      }
      if (v.kind !== 'allow') {
        push('RGATE-UNEXPECTED-REFUSAL',
          `${label}：应当放行（${why}），实得 ${v.kind}/${JSON.stringify(v.code)}：${v.message.slice(0, 240)}`)
      }
    }

    // ── 钉住时钟，跑整张表（`finally` 一定还原：读数落盘用的 `ms` 必须是真表）────────────
    let reset = null
    try {
      t.mock.timers.enable({ apis: ['Date'], now: INSTANT_BELOW.getTime() })
      /** 量具自证：`Date.now()` 与 `new Date()` **两个**入口都被遮住（实现用哪个都钉得住）。 */
      const pinTo = (label, instant) => {
        t.mock.timers.setTime(instant.getTime())
        const cell = { label, want_ms: instant.getTime(), now_ms: Date.now(), new_date_ms: new Date().getTime() }
        readings.clock.cells.push(cell)
        if (cell.now_ms !== cell.want_ms || cell.new_date_ms !== cell.want_ms) {
          push('RGATE-CLOCK-NOT-DATE',
            `注入时钟没生效（${label}）：Date.now()=${cell.now_ms} · new Date()=${cell.new_date_ms}、期望 ${cell.want_ms}`
            + ' —— 这一格量不了"今天"，别把下面的红读成功能红')
          return false
        }
        return true
      }
      if (!pinTo('below', INSTANT_BELOW)) return caseFail(problems)

      // ── A · RED（今天）：没有报告 ⇒ 两个工具都被拒 ─────────────────────────────
      for (const tool of DAILY_REVIEW_TOOLS) {
        expectReject(`A:${tool}`, await guardCall(fxNone, callOf(tool)), {
          day: WANT_DAY_BELOW,
          crossDay: WANT_DAY_ABOVE,
          why: '内容根里没有 2026-11-02 的报告（夹具 `none`）',
        })
      }

      // ── C · 阴性对照：不在名单里的工具，在同一副"没有报告"的根上照样放行 ──────────────
      expectAllow('C:team_test', await guardCall(fxNone, callOf(UNRELATED_TOOL)),
        '`team_test` 不在这道闸的名单里，且此刻内容根里没有任何报告')

      // ── C2 · 码的区分力：同一个工具显式塞前台 ⇒ 后台硬门用**另一句话**拒（量具自证）──────────
      expectOtherGateRefusal(`C2:${DAILY_REVIEW_TOOLS[0]}/foreground`,
        await guardCall(fxNone, callOf(DAILY_REVIEW_TOOLS[0], { run_in_background: false })),
        '后台硬门排在每日评审闸之前：显式 run_in_background:false 会被它先拒')

      // ── D2a · 同一副空根、只把时钟挪到 04:00:01 ⇒ 点名的日子必须换成 11-03 ────────────
      if (!pinTo('above', INSTANT_ABOVE)) return caseFail(problems)
      for (const tool of DAILY_REVIEW_TOOLS) {
        expectReject(`D2a:${tool}`, await guardCall(fxNone, callOf(tool)), {
          day: WANT_DAY_ABOVE,
          crossDay: WANT_DAY_BELOW,
          why: '本地 04:00:01 已经是 2026-11-03，而这副根里没有 11-03 的报告',
        })
      }

      // ── B · GREEN 对照：种一份 11-02 报告（切点下方）⇒ **同一个调用**放行 ─────────────
      if (!pinTo('below', INSTANT_BELOW)) return caseFail(problems)
      for (const tool of DAILY_REVIEW_TOOLS) {
        expectAllow(`B:${tool}`, await guardCall(fxPrev, callOf(tool)),
          `内容根里有 2026-11-02 的报告（夹具 prev）⇒ 判决已落盘，评审可以派`)
      }

      // ── B2 · 切点上方：只有 11-02 的报告**不顶用**（上一个切点那天的报告不能顶今天）────────
      if (!pinTo('above', INSTANT_ABOVE)) return caseFail(problems)
      for (const tool of DAILY_REVIEW_TOOLS) {
        expectReject(`B2:${tool}`, await guardCall(fxPrev, callOf(tool)), {
          day: WANT_DAY_ABOVE,
          crossDay: WANT_DAY_BELOW,
          why: '04:00:01 之后要的是 2026-11-03 的报告；这副根里只有 11-02 的',
        })
      }

      // ── D1b · 切点下方：只有 11-03 的报告**不顶用**（零点尺子会在这里翻绿）──────────────
      if (!pinTo('below', INSTANT_BELOW)) return caseFail(problems)
      for (const tool of DAILY_REVIEW_TOOLS) {
        expectReject(`D1b:${tool}`, await guardCall(fxNext, callOf(tool)), {
          day: WANT_DAY_BELOW,
          crossDay: WANT_DAY_ABOVE,
          why: '01:30 属于 2026-11-02；这副根里只有 11-03 的报告',
        })
      }

      // ── D2b · 切点上方：同一副"只有 11-03"的根 ⇒ 放行（那一侧的正例）──────────────────
      if (!pinTo('above', INSTANT_ABOVE)) return caseFail(problems)
      for (const tool of DAILY_REVIEW_TOOLS) {
        expectAllow(`D2b:${tool}`, await guardCall(fxNext, callOf(tool)),
          '04:00:01 属于 2026-11-03，这副根里正好有 11-03 的报告')
      }
    } finally {
      t.mock.timers.reset()
      reset = { now: Date.now(), below: INSTANT_BELOW.getTime(), above: INSTANT_ABOVE.getTime() }
      readings.clock.after_reset = reset
    }
    if (reset !== null && (reset.now === reset.below || reset.now === reset.above)) {
      push('RGATE-CLOCK-NOT-RESET',
        `时钟没还原（Date.now() 仍是钉住的 ${reset.now}）—— 这一格之后所有读数（含本文件的 \`ms\`）都会跟着漂`)
    }

    // ── 同一个调用：`A` 与 `B` 只许差"那份报告在不在" ─────────────────────────────
    for (const tool of DAILY_REVIEW_TOOLS) {
      const a = readings.cells[`A:${tool}`]?.call ?? null
      const b = readings.cells[`B:${tool}`]?.call ?? null
      if (a === null || b === null) continue
      if (a !== b) {
        push('RGATE-NOT-SAME-CALL',
          `${tool}：\`A\`（该拒）与 \`B\`（该放行）喂进去的调用不是同一个 —— 那样"报告在不在"就不是唯一的变量，`
          + '这一格的红绿证明不了任何因果')
      }
    }

    caseFail(problems)
  })
})

/**
 * 预检 + 加载被测面。
 * ⚠️ 必须在文件末尾登记：`node:test` 的顶层 `before()` 会比模块体后面那些 `const` 先跑
 * （`brg01` 第一版就栽在 `Cannot access 'INJECTOR' before initialization`）。
 */
before(async () => {
  preflight()
  SUT = await loadInjector(INJECTOR)
})
