/**
 * `DASH-10` / `DASH-13` / `DASH-14` —— 客户端看板**渲染层接线**的三格（第 2 关重开，2026-11-04）。
 *
 * 为什么会有这几格（第 4 关独立评审 `🟠 打回·修`，`.team/review/2026-11-04/评审报告.md`）：
 *   · 评审 `F1`：面板**没有定位代码** —— 我们只有 `position:fixed`，没有坐标、也没有 `style`；
 *     官方那一块是 `useAnchoredPosition({open, anchorRef, panelRef, gap:5, margin:16})` 再把结果
 *     塞进面板的 `style`（官方 `client.js` L230-236 / L327-331）。九格红测试里**没有一条**压着它。
 *   · 评审 §2.1 的"唯一少画的抄项"：`E29 button.expandToggle`（元素对照表 L148 标「抄（条件）」，
 *     且在"抄 25"那一栏里）—— 我们画了 2 行截断的 `p`，没有溢出测量、没有展开钮。
 *   · 第 4 关复审 `R2-1`：面板顶上一行成了 `读数日 <day>`，headline 掉到第二行 —— "第一行是目标"
 *     是老板自己的句子，机器**本来能抓**（源码顺序）却没抓。`DASH-14` 补这一格。
 *
 * 🔴 **`DASH-10` 的兜底那一条是 2026-11-06 重写的**（老板报障：点「看板」，按钮自己消失、
 *    面板一个字都不留）。那一次有两个成因，第二个就在兜底上：官方那套
 *    `position ?? {visibility:"hidden",left:0,top:0}` 在"定位一直没算出来"时把面板**挂上但藏起来**——
 *    点一下看起来什么都没发生。旧判据把那个字面量**当成期望值**（`DASH-POS-NO-FALLBACK`），
 *    于是它锁住的正是这个缺陷。现在换成：**位置还没算出来时，面板必须可见、且落在视口里的一个
 *    具体位置**（`DASH-POS-FALLBACK-HIDDEN` / `-UNPLACED`）。接线那四条（钩子 / 入参 / 两个真 ref /
 *    `style` 的左手来自钩子）**原样保留**，尺子仍然是官方那一份。
 *    ⚠️ 兜底那一条**不能**再拿官方当阳性对照 —— 官方那份就是故障形状（读数里照实记
 *    `readings.official_fallback`）。它的阳性/阴性对照是合成样本 + **故障那一版的真字节**
 *    （`d586215^`，见 `support/dash-client-harness.mjs`）。
 *    🔴 **红基线**（2026-11-06 实测）：把 `d586215^` 那一版当 SUT（`AGENIA_DASH_CLIENT` 指到副本）
 *    跑这一格 ⇒ **只**翻 `DASH-POS-FALLBACK-HIDDEN`（源码那位读者与渲染那位读者各翻一条），
 *    接线四条**一条都不翻**（`_runs/marta-red-on-defect-sut/run`，SUT 覆盖 ⇒ 同跑记 `HOLD`）。
 *
 * 🔴 **`DASH-13` 的红量在冻结评审副本上**（提交 `6dee18d` 的只读副本 —— 评审看到的那一版）：
 *   · `DASH-13` 红在 `E29-MEASURE-MISSING` + `E29-TOGGLE-MISSING` + `E29-TEXT-KEYS`
 *     （截断那一条**是绿的**：`.DASHB1_clampedDescription` 已经有 `-webkit-line-clamp:2`，
 *      读数里照实分开记 —— 一条用例里绿的那几条也是读数，别当成"这格绿的"）。
 *
 * 🔴 **`DASH-14` 只判顺序与区域，不判像素**：第一个 `h3`（headline 行）必须在 `view.day` 表达式**之前**；
 *    日期表达式必须落在**欠账网格（`.roster`）结束之后**。它不看类名、不看宽度/字号/上下间距 ——
 *    "看起来在底部、字号对不对、跟官方的灰条像不像"归 GUI 清单 #3/#4/#6（人点一次）。
 *    两种缺陷各有自己的码：日期抢在 headline 前面 ⇒ `DASH-DATE-BEFORE-HEADLINE`；
 *    日期还在 headline 之后但没走到欠账网格之后（E06/notice 那一带）⇒ `DASH-DATE-NOT-IN-FOOTER`。
 *
 * 🔴 **像素不在这里判**：`DASH-10/13` 判的是**存在与接线**（钩子有没有、接到哪个 ref、兜底可不可见、
 * 按钮与测量在不在），`DASH-14` 判的是**顺序与区域**。"面板开在哪、圆角阴影对不对、展开后长什么样、
 * 读数日看起来是不是在底部"是 `.team/test/2026-11-04/GUI清单-客户端看板.md` 第 2/4/8 条
 * （`DASH-14` 那一条对应第 3/4/6 条）那一格（**人点一次**）的事。
 * "兜底落在 16/64 这两个数上对不对"同理：本格只要求**可见 + 有具体落点**，不要求那两个数。
 *
 * 尺子：官方像素层（设计抽屉的只读副本 → asar 解包兜底）先被**接线**那套判据量一遍 ——
 * 它必须**干净**（证明判据认得出"官方那套接线"），再从官方源码上切刀：`DASH-10` 四把、`DASH-13` 五把，
 * 每把只翻它自己那一面（向量对不上报 `DASH-KNIFE-VECTOR`）；`DASH-14` 的两把刀在合成面板上切。
 * `DASH-10` 另有**两位读者**读同一个兜底：源码里那个对象字面量（静态）+ 真渲染出来的
 * `panel.props.style`（`useAnchoredPosition` 返回 `null` 的那一帧，见 `support/dash-client-harness.mjs`）。
 */
import { before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { caseFail, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  createDashboardHarness,
  messageOf,
  parseObjectLiteral,
  preFailureClientSource,
} from '../support/dash-client-harness.mjs'
import {
  DASH_CLIENT,
  elementCallByClassToken,
  extractCss,
  matchBracket,
  officialClient,
  propOf,
  splitTopLevel,
  squash,
  stripCommentLines,
  noteSutOverride,
} from '../support/dashboard-surface.mjs'

before(() => {
  preflight()
})

// ── 通用小工具 ────────────────────────────────────────────────────────────────
/** 表达式归一：挤掉空白、单引号换双引号（官方与我们的排版不一定一样）。 */
const normalizeExpr = (text) => squash(text).replace(/'/g, '"')

/** 剥掉最外层那一对括号（只剥配对的）。 */
function stripOuterParens(text) {
  let out = String(text).trim()
  while (out.startsWith('(') && out.endsWith(')')) {
    const close = matchBracket(out, 0)
    if (close !== out.length - 1) break
    out = out.slice(1, -1).trim()
  }
  return out
}

/** `const <name> = …useRef(` 这一类声明在不在（ref 必须是真 ref，不是 null）。 */
function refDeclared(code, name) {
  // 官方/我们这份的写法是 `(0, react.useRef)(null)`：`useRef` 后面还有一个 `)` —— 别只认 `useRef(`。
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*[^;\\n]{0,120}?useRef\\s*\\)?\\s*\\(`)
  return re.test(code)
}

/** 对象字面量 → `[{key, value, shorthand}]`；不是对象 ⇒ `null`。 */
function objectEntries(text) {
  const t = String(text).trim()
  if (!t.startsWith('{') || !t.endsWith('}')) return null
  const out = []
  for (const seg of splitTopLevel(t.slice(1, -1))) {
    const colon = seg.indexOf(':')
    if (colon < 0) out.push({ key: seg.trim(), value: seg.trim(), shorthand: true })
    else out.push({ key: seg.slice(0, colon).trim().replace(/^["']|["']$/g, ''), value: seg.slice(colon + 1).trim(), shorthand: false })
  }
  return out
}

/** `useAnchoredPosition` 那一次调用（含入参原文）。找不到 ⇒ `null`。 */
function hookCallOf(code) {
  const at = code.indexOf('useAnchoredPosition')
  if (at < 0) return null
  // 官方写法是 `(0, ns.useAnchoredPosition)({…})` —— 标识符后面先有一个 `)`，再是入参的 `(`。
  const open = code.indexOf('(', at + 'useAnchoredPosition'.length)
  if (open < 0) return null
  const close = matchBracket(code, open)
  if (close < 0) return null
  return { at, open, close, firstArg: splitTopLevel(code.slice(open + 1, close))[0] ?? '' }
}

// ── `DASH-10`：定位接线 ───────────────────────────────────────────────────────
const POS = {
  hook: 'DASH-POS-HOOK-MISSING',
  args: 'DASH-POS-HOOK-ARGS',
  style: 'DASH-POS-NO-STYLE',
  fallback: 'DASH-POS-NO-FALLBACK',
  shape: 'DASH-POS-FALLBACK-SHAPE',
  hidden: 'DASH-POS-FALLBACK-HIDDEN',
  unplaced: 'DASH-POS-FALLBACK-UNPLACED',
  fromHook: 'DASH-POS-STYLE-NOT-FROM-HOOK',
  anchor: 'DASH-POS-ANCHOR-UNWIRED',
  panel: 'DASH-POS-PANEL-UNWIRED',
}

/**
 * **接线**的判据（纯函数）：官方那一套必须**四件同时成立** ——
 *   ① `useAnchoredPosition({open, anchorRef, panelRef, gap:5, margin:16})` 被调用、结果有变量接住；
 *   ② 面板 JSX 上有 `style`，且里面有一条 `??` 兜底（`<那个变量> ?? <兜底>` —— 没兜底就意味着
 *      "位置还没算出来"那一帧没有任何保证）；
 *   ③ 两个 ref 都是**真 ref**（`useRef(...)` 声明过）；
 *   ④ 锚点 ref 真的挂在触发器上、面板 ref 真的挂在面板上（不是只写在钩子入参里）。
 *
 * ⚠️ 兜底的**内容**（可不可见、落在哪）不在这里判 —— 见下面的 `fallbackStyleProblems`。
 *    分成两条的理由很硬：**官方那一份的兜底就是故障形状**（`{visibility:"hidden",…}`），
 *    把"兜底内容"塞进这个函数，官方就不再是干净的阳性对照了。
 *
 * ⚠️ 为什么判"接线"而不是判"像素"：位置算得对不对只能在界面上看（GUI 清单第 2/8 条）；
 *    机器能判的是**这一段代码在不在、接没接上**。
 *
 * @param {string} source 渲染层源码
 * @returns {Array<{code:string,message:string}>}
 */
function wiringProblems(source) {
  const code = stripCommentLines(source)
  const problems = []
  const hook = hookCallOf(code)
  let posName = null
  let anchorName = null
  let panelName = null

  if (hook === null) {
    problems.push(problem(POS.hook, '渲染层里没有 `useAnchoredPosition(...)` —— 面板只有 `position:fixed`，坐标没有来源；`position:fixed` + 自动偏移量会取静态位置，而这块是 portal 到 <body> 末尾的'))
  } else {
    const before = code.slice(Math.max(0, hook.at - 240), hook.at)
    const assign = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]{0,200}$/.exec(before)
    posName = assign === null ? null : assign[1]
    if (posName === null) {
      problems.push(problem(POS.fromHook, '`useAnchoredPosition(...)` 的结果没有变量接住 —— 位置算出来也没地方用'))
    }
    const entries = objectEntries(hook.firstArg)
    if (entries === null) {
      problems.push(problem(POS.args, `useAnchoredPosition 的入参不是对象字面量：${JSON.stringify(hook.firstArg.slice(0, 120))} —— 官方是 {open, anchorRef, panelRef, gap:5, margin:16}`))
    } else {
      const get = (key) => entries.find((e) => e.key === key) ?? null
      const issues = []
      if (get('open') === null) issues.push('缺 open')
      const anchor = get('anchorRef')
      if (anchor === null) issues.push('缺 anchorRef')
      else if (!/^[A-Za-z_$][\w$]*$/.test(anchor.value)) issues.push(`anchorRef 不是 ref 标识符（${JSON.stringify(anchor.value.slice(0, 60))}）`)
      else anchorName = anchor.value
      const panel = get('panelRef')
      if (panel === null) issues.push('缺 panelRef')
      else if (!/^[A-Za-z_$][\w$]*$/.test(panel.value)) issues.push(`panelRef 不是 ref 标识符（${JSON.stringify(panel.value.slice(0, 60))}）`)
      else panelName = panel.value
      const gap = get('gap')
      if (gap === null || normalizeExpr(gap.value) !== '5') issues.push(`gap 应当是 5（实得 ${JSON.stringify(gap?.value ?? null)}）`)
      const margin = get('margin')
      if (margin === null || normalizeExpr(margin.value) !== '16') issues.push(`margin 应当是 16（实得 ${JSON.stringify(margin?.value ?? null)}）`)
      if (issues.length > 0) problems.push(problem(POS.args, `useAnchoredPosition 的入参不是官方那一套：${issues.join(' · ')}`))
    }
  }

  // ② 面板 style：必须有，且必须带一条 `??` 兜底；左手必须是钩子那个结果
  const panelEl = elementCallByClassToken(code, 'panel')
  if (panelEl === null) {
    problems.push(problem(POS.panel, '找不到 className 用到 `.panel` 的元素调用 —— 定位要落在面板那块 dialog 上'))
  } else {
    const style = propOf(panelEl.props, 'style')
    if (style === null) {
      problems.push(problem(POS.style, '面板 JSX 上没有 `style` —— 钩子算出来的坐标没有落点'))
    } else {
      const normalized = stripOuterParens(normalizeExpr(style))
      const parts = normalized.split('??')
      if (parts.length < 2) {
        problems.push(problem(POS.fallback, `面板的 style 是 ${JSON.stringify(style.slice(0, 120))} —— 没有"位置还没算出来时用哪一套"的兜底；钩子结果直接当 style，未定位的那一帧没有任何保证`))
      } else {
        const left = stripOuterParens(parts[0])
        if (posName !== null && left !== posName) {
          problems.push(problem(POS.fromHook, `面板 style 的左手是 ${JSON.stringify(left)}，不是 useAnchoredPosition 的结果 ${JSON.stringify(posName)} —— 算出来的位置没被用上`))
        }
      }
    }
  }

  // ③④ 两个 ref：真 ref + 真的挂在两个元素上
  if (hook !== null) {
    if (anchorName !== null) {
      const triggerEl = elementCallByClassToken(code, 'trigger')
      const triggerRef = triggerEl === null ? null : propOf(triggerEl.props, 'ref')
      if (triggerEl === null) problems.push(problem(POS.anchor, '找不到 className 用到 `.trigger` 的按钮 —— 锚点没有宿主'))
      else if (triggerRef === null || triggerRef.trim() !== anchorName) {
        problems.push(problem(POS.anchor, `触发器上的 ref 是 ${JSON.stringify(triggerRef)}，不是传进 anchorRef 的那个 ${JSON.stringify(anchorName)} —— 钩子量的是另一个东西`))
      }
      if (!refDeclared(code, anchorName)) problems.push(problem(POS.anchor, `${anchorName} 没有用 useRef(...) 声明 —— 传进去的不是真 ref`))
    }
    if (panelName !== null) {
      const panelRef = panelEl === null ? null : propOf(panelEl.props, 'ref')
      if (panelRef === null || panelRef.trim() !== panelName) {
        problems.push(problem(POS.panel, `面板上的 ref 是 ${JSON.stringify(panelRef)}，不是传进 panelRef 的那个 ${JSON.stringify(panelName)} —— 钩子不知道要挪哪一块`))
      }
      if (!refDeclared(code, panelName)) problems.push(problem(POS.panel, `${panelName} 没有用 useRef(...) 声明 —— 传进去的不是真 ref`))
    }
  }
  return problems
}

/**
 * **兜底**的判据（纯函数）：位置还没算出来（`useAnchoredPosition` → `null`）那一帧，
 * 面板必须**看得见**、而且落在视口里的一个**具体位置**。
 *
 *   · 看得见：`visibility` 只许 `visible`（**缺省也算可见** —— 不要求写那个字面量）、
 *     `display` 不许 `none`、`opacity` 不许 `0`。三种写法都是"挂上了但看不见"，同一个红因码。
 *   · 有落点：`left` / `top` 都必须是 ≥ 0 的具体数值（`"16px"` 这种带单位也认）。
 *     面板是 portal 到 `<body>` 末尾的 —— 没有坐标那一帧会落在页面末尾，读的人同样什么都看不到。
 *
 * 🔴 **它锁的是一条真故障**（2026-11-06 01:19）：旧兜底 `{visibility:"hidden",left:0,top:0}`
 *    在"定位一直没算出来"时把面板藏起来 ⇒ 点「看板」看起来什么都没发生。
 *
 * ⚠️ 不判"开在哪个像素"（现在那版是 `left:16/top:64`，那是**取值**不是**契约**）：
 *    "开在哪、圆角阴影"归 GUI 清单第 2/8 条（人点一次）。
 *
 * @param {unknown} style 一套样式对象（源码里那个兜底字面量，或渲染出来的 `panel.props.style`）
 * @param {string} where 读数里指到"这一套是从哪读出来的"
 * @returns {Array<{code:string,message:string}>}
 */
function fallbackStyleProblems(style, where) {
  if (style === null || typeof style !== 'object' || Array.isArray(style)) {
    return [problem(POS.shape, `${where}：兜底不是对象（${JSON.stringify(style)?.slice(0, 80)}）—— 面板拿不到一套能落地的样式`)]
  }
  /** 同一个红因码只报一条（`left`/`top` 缺两个不该变成两条 —— 刀向量要对得上）。 */
  const messages = new Map()
  const add = (code, message) => {
    if (!messages.has(code)) messages.set(code, [])
    messages.get(code).push(message)
  }
  const visibility = style.visibility
  if (visibility !== undefined && String(visibility).trim() !== 'visible') {
    add(POS.hidden, `${where}：兜底的 visibility 是 ${JSON.stringify(visibility)} —— 未定位的那一帧面板**挂上了但看不见**，点一下会像什么都没发生（2026-11-06 01:19 那个现场）`)
  }
  if (style.display !== undefined && String(style.display).trim() === 'none') {
    add(POS.hidden, `${where}：兜底的 display 是 "none" —— 面板还没定位就先不画，与 visibility:hidden 是同一种"看不见"`)
  }
  if (style.opacity !== undefined && Number(style.opacity) === 0) {
    add(POS.hidden, `${where}：兜底的 opacity 是 0 —— 面板在那里，但一个字都看不到`)
  }
  const placementOf = (key) => {
    const value = style[key]
    if (value === undefined || value === null) return { ok: false, why: `没有 \`${key}\`` }
    const numeric = typeof value === 'number' ? value : Number(String(value).trim().replace(/px$/, ''))
    if (!Number.isFinite(numeric)) return { ok: false, why: `\`${key}\` 是 ${JSON.stringify(value)}（不是具体坐标）` }
    if (numeric < 0) return { ok: false, why: `\`${key}\` 是 ${JSON.stringify(value)}（落在视口外）` }
    return { ok: true, why: null }
  }
  for (const key of ['left', 'top']) {
    const placed = placementOf(key)
    if (!placed.ok) {
      add(POS.unplaced, `${where}：兜底里${placed.why} —— 面板是 portal 到 <body> 末尾的，没有坐标的那一帧会落在页面末尾（读者看不到，等同于点了个寂寞）`)
    }
  }
  return [...messages.entries()].map(([code, list]) => problem(code, list.join(' · ')))
}

/** 源码里那个兜底（`style: <钩子结果> ?? <兜底>` 的右手）：真求值成对象，不做文本比对。 */
function fallbackObjectOf(source) {
  const code = stripCommentLines(source)
  const panelEl = elementCallByClassToken(code, 'panel')
  if (panelEl === null) return { ok: false, why: '找不到面板元素（`.panel`）' }
  const style = propOf(panelEl.props, 'style')
  if (style === null) return { ok: false, why: '面板上没有 `style`' }
  const parts = stripOuterParens(normalizeExpr(style)).split('??')
  if (parts.length < 2) return { ok: false, why: '`style` 里没有 `??` 兜底' }
  return parseObjectLiteral(stripOuterParens(parts.slice(1).join('??')))
}

/** 一份**合法**的视图快照（只为让渲染载具的读盘那一支走成功路；内容不是这一格的判据）。 */
const RENDER_VIEW = {
  schema: 1,
  day: '2026-11-06',
  header: { text: '演示目标 · 执行一 · 演示', empty: false, stale: false },
  badge: null,
  main: null,
  emptyNotice: '本阶段没有当前任务',
  debts: [],
  alerts: [],
}
/** 一副"读得到"的 remote（`{offset,limit}` 只读一页 ⇒ 返回 `{text}`）。 */
const READABLE_REMOTE = { workspaceFiles: { read: async () => ({ text: JSON.stringify(RENDER_VIEW) }) } }

test('DASH-10 面板定位：useAnchoredPosition 接真锚点 + 未定位前必须可见的安全兜底（像素归 GUI）', async () => {
  await runCase('DASH-10', async (rec) => {
    noteSutOverride(rec)
    const problems = []

    // ① 尺子先量官方那一份：**接线**那四条必须认得出"官方那套接线"
    const official = officialClient({ extract: true })
    rec.readings.official = { ok: official.ok, path: official.path, origin: official.origin, sha256: official.sha256, tried: official.tried }
    if (!official.ok) {
      caseHold(rec, official.code ?? 'DASH-OFFICIAL-ABSENT', `官方像素层没找到（${official.reason}）—— 接线那四条的阳性对照与刀都判不了，只剩我们这一侧的红`)
    } else {
      const officialProblems = wiringProblems(official.source)
      rec.readings.official_wiring = officialProblems
      if (officialProblems.length > 0) {
        problems.push(problem('DASH-RULER-BROKEN', `同一套**接线**判据在官方 client.js 上读出了 ${officialProblems.length} 个问题（${officialProblems.map((p) => p.code).join(', ')}）—— 尺子不认官方那套接线，下面的红不算数`))
      }
      /**
       * 官方那个兜底**就是这次故障的形状** ⇒ 它**只能当读数**，不能当兜底那一条的阳性对照。
       * 记下来是为了回答"那为什么不用官方当尺子" —— 不是判据。
       */
      const officialFallback = fallbackObjectOf(official.source)
      rec.readings.official_fallback = officialFallback.ok
        ? { value: officialFallback.value, codes: fallbackStyleProblems(officialFallback.value, 'official').map((p) => p.code) }
        : { unparsed: officialFallback.why }

      /**
       * 从官方源码上切刀：每一把只拆掉**接线的一半**。
       * 判据必须逐把翻面，而且只翻它自己那一面（向量对不上报 `DASH-KNIFE-VECTOR`）。
       */
      const stripHook = (text) => {
        const at = text.indexOf('const position = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)')
        if (at < 0) return null
        const open = text.indexOf('(', text.indexOf('useAnchoredPosition', at))
        const close = matchBracket(text, open)
        if (close < 0) return null
        const semi = text.indexOf(';', close)
        if (semi < 0) return null
        return `${text.slice(0, at)}const position = null;${text.slice(semi + 1)}`
      }
      const knives = {
        删掉定位钩子: stripHook(official.source),
        删掉面板上的style: official.source.replace(/\n\s*style:\s*position\s*\?\?\s*\{[\s\S]*?\},/, ''),
        删掉未定位兜底: official.source.replace(/style:\s*position\s*\?\?\s*\{[\s\S]*?\}/, 'style: position'),
        锚点没挂到触发器: official.source.replace('ref: triggerRef,', ''),
      }
      const want = {
        删掉定位钩子: [POS.hook],
        删掉面板上的style: [POS.style],
        删掉未定位兜底: [POS.fallback],
        锚点没挂到触发器: [POS.anchor],
      }
      const vectors = {}
      for (const [name, mutated] of Object.entries(knives)) {
        if (mutated === null || mutated === official.source) {
          problems.push(problem('DASH-RULER-BROKEN', `刀「${name}」没切动官方源码（字符串没变）—— 这把刀不能证明判据会翻面`))
          continue
        }
        const got = wiringProblems(mutated).map((p) => p.code).sort()
        vectors[name] = got
        const expected = [...want[name]].sort()
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
          problems.push(problem('DASH-KNIFE-VECTOR', `刀「${name}」翻出来的面是 ${JSON.stringify(got)}，应当是 ${JSON.stringify(expected)} —— 判据分不开"缺哪一半"`))
        }
      }
      rec.readings.knives = vectors
    }

    // ② 兜底那一条的尺子自证：合成样本，每格**只翻它自己那一码**
    const FALLBACK_CELLS = {
      可见且有落点: [{ position: 'fixed', left: 16, top: 64, visibility: 'visible' }, []],
      不写visibility也算可见: [{ position: 'fixed', left: 16, top: 64 }, []],
      带单位的像素也认: [{ left: '16px', top: '64px' }, []],
      这次故障那一版: [{ visibility: 'hidden', left: 0, top: 0 }, [POS.hidden]],
      display_none: [{ display: 'none', left: 16, top: 64 }, [POS.hidden]],
      opacity_0: [{ opacity: 0, left: 16, top: 64 }, [POS.hidden]],
      没有坐标: [{ visibility: 'visible' }, [POS.unplaced]],
      坐标不是数: [{ left: 'auto', top: 'auto' }, [POS.unplaced]],
      空对象: [{}, [POS.unplaced]],
      不是对象: ['visible', [POS.shape]],
    }
    const fallbackVectors = {}
    let cellFailures = 0
    for (const [name, [style, expected]] of Object.entries(FALLBACK_CELLS)) {
      const got = fallbackStyleProblems(style, name).map((p) => p.code).sort()
      fallbackVectors[name] = got
      if (JSON.stringify(got) !== JSON.stringify([...expected].sort())) {
        cellFailures += 1
        problems.push(problem('DASH-KNIFE-VECTOR', `兜底判据在合成样本「${name}」上翻出来的面是 ${JSON.stringify(got)}，应当是 ${JSON.stringify(expected)}`))
      }
    }
    rec.readings.fallback_vectors = fallbackVectors
    if (cellFailures === 0) rec.readings.fallback_ruler = 'ok'

    // ③ 我们这一份：接线（静态）+ 兜底（静态；源码里的对象字面量）
    let source = null
    try {
      source = readFileSync(DASH_CLIENT, 'utf8')
    } catch (err) {
      problems.push(problem('DASH-CLIENT-MISSING', `渲染层读不出来：${DASH_CLIENT}（${messageOf(err)}）`))
    }
    if (source !== null) {
      const ours = wiringProblems(source)
      rec.readings.ours_wiring = ours
      for (const p of ours) problems.push(p)
      const parsed = fallbackObjectOf(source)
      if (parsed.ok) {
        const problemsFromSource = fallbackStyleProblems(parsed.value, '源码里那个兜底')
        rec.readings.ours_fallback_source = { value: parsed.value, codes: problemsFromSource.map((p) => p.code) }
        for (const p of problemsFromSource) problems.push(p)
      } else {
        // 不是对象字面量 ⇒ 静态这一路读不出来；**不记红** —— 兜底那一格的权威读者是渲染那一路（④）。
        rec.readings.ours_fallback_source = { unparsed: parsed.why }
      }
    }

    // ④ 第二位读者：真把 `client.js` 装起来、真点一次、看面板**真的**拿到了什么 `style`
    if (source !== null) {
      const harness = createDashboardHarness(source)
      rec.readings.render_harness = { ok: harness.ok, reason: harness.reason ?? null }
      if (!harness.ok) {
        problems.push(problem('DASH-POS-RENDER-HARNESS', `渲染载具装不起来（${harness.reason}）—— 兜底"真的可见吗"这一腿判不了，不许记绿`))
      } else {
        const scene = await harness.scene({ remote: READABLE_REMOTE, position: null })
        rec.readings.render = {
          apply_threw: scene.apply_threw,
          throws: scene.throws,
          trigger_present: scene.trigger_present,
          panel_style: scene.panel_style,
          hook: scene.hook_args,
        }
        if (scene.apply_threw !== null) problems.push(problem('DASH-POS-RENDER-HARNESS', `apply() 抛了：${scene.apply_threw}`))
        if (scene.throws.length > 0) problems.push(problem('DASH-POS-RENDER-HARNESS', `点一次按钮的过程中抛出了：${JSON.stringify(scene.throws)}`))
        if (!scene.trigger_present) problems.push(problem('DASH-POS-RENDER-HARNESS', '渲染出来的树里没有触发器 —— 点不了那一次，下面几条读数不作数'))
        if (scene.panel_style === null) {
          problems.push(problem(POS.style, '定位没算出来（钩子返回 null）时面板没有 `style`（渲染读数里是 null）—— 未定位的那一帧没有任何保证'))
        } else {
          for (const p of fallbackStyleProblems(scene.panel_style, '渲染出来的兜底（useAnchoredPosition → null）')) problems.push(p)
        }
        const hook = scene.hook_args
        if (hook === null) {
          problems.push(problem(POS.hook, '渲染过程中 `useAnchoredPosition` 一次都没被调用'))
        } else {
          if (hook.open !== true) problems.push(problem(POS.hook, `钩子拿到的 open 是 ${JSON.stringify(hook.open)} —— 面板已经开了，钩子却不知道`))
          if (hook.gap !== 5 || hook.margin !== 16) problems.push(problem(POS.args, `钩子拿到的 gap/margin 是 ${JSON.stringify([hook.gap, hook.margin])}，应当是 5/16`))
          if (hook.anchor_is_trigger_ref !== true) problems.push(problem(POS.anchor, '`anchorRef` 不是触发器上那个 ref（渲染读数）—— 钩子量的是另一个东西'))
          if (hook.panel_is_panel_ref !== true) problems.push(problem(POS.panel, '`panelRef` 不是面板上那个 ref（渲染读数）—— 钩子不知道要挪哪一块'))
        }
      }
    }

    // ⑤ 真刀：**故障那一版**的真字节（`d586215^`）。两条判据必须分得开那一次的两个成因。
    const old = preFailureClientSource()
    rec.readings.knife_old_source = { available: old.available, why: old.why, sha256: old.sha256, proves_old: old.proves_old, has_hidden_fallback: old.has_hidden_fallback, has_guard_message: old.has_guard_message }
    if (!old.available) {
      caseHold(rec, 'DASH-POS-KNIFE-UNAVAILABLE', `拿不到故障那一版的真字节（${old.why}）—— "这条判据抓得住那一次真故障"这一腿判不了`)
    } else if (!old.proves_old) {
      problems.push(problem('DASH-POS-KNIFE-NOT-OLD', `\`d586215^\` 那一版里 visibility:hidden=${old.has_hidden_fallback} / 兜底那串报错文案=${old.has_guard_message} —— 这不是"故障那一版"，这把刀证明的是别的东西`))
    } else {
      const oldHarness = createDashboardHarness(old.text)
      if (!oldHarness.ok) {
        problems.push(problem('DASH-POS-KNIFE-NOT-OLD', `故障那一版装不进载具（${oldHarness.reason}）—— 这把刀切不动`))
      } else {
        const scene = await oldHarness.scene({ remote: READABLE_REMOTE, position: null })
        const oldWiring = wiringProblems(old.text).map((p) => p.code).sort()
        const oldFallback = scene.panel_style === null ? [] : fallbackStyleProblems(scene.panel_style, '故障那一版的兜底').map((p) => p.code).sort()
        rec.readings.knife_old = { wiring: oldWiring, fallback: oldFallback, panel_style: scene.panel_style }
        if (JSON.stringify(oldFallback) !== JSON.stringify([POS.hidden])) {
          problems.push(problem('DASH-KNIFE-VECTOR', `故障那一版的兜底读出来是 ${JSON.stringify(oldFallback)}，应当**只有** ${JSON.stringify([POS.hidden])} —— 这一格抓不住那次真故障（或者连别的面一起抓）`))
        }
        if (oldWiring.length !== 0) {
          problems.push(problem('DASH-KNIFE-VECTOR', `故障那一版的**接线**读出来是 ${JSON.stringify(oldWiring)}，应当是 [] —— 接线判据把"接好了但兜底看不见"也算成"没接线"，两条判据分不开`))
        }
      }
    }

    caseFail(problems)
  })
})

// ── `DASH-13`：E29 展开钮 ────────────────────────────────────────────────────
const E29 = {
  measure: 'E29-MEASURE-MISSING',
  truncate: 'E29-TRUNCATE-MISSING',
  toggle: 'E29-TOGGLE-MISSING',
  aria: 'E29-TOGGLE-ARIA',
  condition: 'E29-TOGGLE-CONDITION',
  text: 'E29-TEXT-KEYS',
}

/**
 * `E29 button.expandToggle` 的判据（纯函数）：元素对照表标「抄（条件）」，
 * 条件 = **只在说明段被截断时才出现**。机器能判的是这四件（五样）：
 *   ① 说明段有 `ref`（溢出测量的宿主）；
 *   ② 代码里读 `scrollHeight` / `clientHeight`（"有没有溢出"的算法）；
 *   ③ `clampedDescription` 的 CSS 是 **2 行**截断（条件的前提）；
 *   ④ 一个 `expandToggle` 按钮：`aria-expanded` + `onClick` + **被一个布尔条件守着**；
 *   ⑤ 两个文案键（expand / collapse）在词典里，按钮的 children 用 `t(...)` 在两者之间切。
 *
 * ⚠️ 不判"展开后高度对不对"、"按钮在右边还是左边"—— 那是 GUI 清单第 4 条（人看）。
 * @param {string} source
 * @returns {Array<{code:string,message:string}>}
 */
function expandToggleProblems(source) {
  const code = stripCommentLines(source)
  const problems = []

  // ① 测量宿主
  const p = elementCallByClassToken(code, 'clampedDescription')
  if (p === null) {
    problems.push(problem(E29.measure, '找不到 className 用到 `.clampedDescription` 的说明段 —— 溢出测量的宿主不在'))
  } else if (propOf(p.props, 'ref') === null) {
    problems.push(problem(E29.measure, '说明段上没有 `ref` —— 没有 ref 就量不了 scrollHeight / clientHeight'))
  }
  if (!/\bscrollHeight\b/.test(code) || !/\bclientHeight\b/.test(code)) {
    problems.push(problem(E29.measure, '代码里没有同时读 `scrollHeight` 与 `clientHeight` —— "被截断了吗"这个判断没有算法（官方是 `paragraph.scrollHeight > paragraph.clientHeight + 1`）'))
  }

  // ② 截断（条件是"溢出才出现"，没有 2 行截断就没有这个条件）
  const css = extractCss(code)
  if (css === null) problems.push(problem(E29.truncate, '渲染层里没有内嵌 CSS（`const css = "…"`）—— 截断规则无处可判'))
  else if (!/\.[\w-]*clampedDescription\s*\{[^}]*line-clamp\s*:\s*2\b/.test(css)) {
    problems.push(problem(E29.truncate, '`clampedDescription` 的 CSS 不是 2 行截断（`line-clamp: 2`）—— 长说明永远不截，展开钮也就永远不该出现'))
  }

  // ③④ 按钮与接线
  const btn = elementCallByClassToken(code, 'expandToggle')
  if (btn === null) {
    problems.push(problem(E29.toggle, '渲染层里没有 `.expandToggle` 按钮 —— E29 在"抄 25"里，长说明被截断后没有展开路径（评审 §2.1 点名的唯一少画项）'))
  } else {
    if (propOf(btn.props, 'aria-expanded') === null) problems.push(problem(E29.aria, '展开钮没有 `aria-expanded` —— 读屏与测试都看不到它现在是展开还是收起'))
    if (propOf(btn.props, 'onClick') === null) problems.push(problem(E29.aria, '展开钮没有 `onClick` —— 画了一个按不动的钮'))
    const before = code.slice(Math.max(0, btn.callIndex - 320), btn.callIndex)
    if (!/&&/.test(before) || !/(clamped|expanded)/.test(before)) {
      problems.push(problem(E29.condition, '展开钮没有被"只在溢出时出现"的条件守着（官方是 `(clamped || expanded) && …`）—— 它会在每一行说明下面都冒出来'))
    }
    const children = String(btn.children ?? '')
    if (!/\bt\s*\(|\.t\s*\(/.test(children) || !/expand/i.test(children) || !/collapse/i.test(children)) {
      problems.push(problem(E29.text, `展开钮的 children 没有"展开/收起"这一对文案（实得 ${JSON.stringify(children.slice(0, 120))}）—— 官方是 t(expanded ? "task.collapse" : "task.expand")`))
    }
  }
  const hasExpandKey = /(["']?(?:task\.)?expand["']?)\s*:/.test(code)
  const hasCollapseKey = /(["']?(?:task\.)?collapse["']?)\s*:/.test(code)
  if (!hasExpandKey || !hasCollapseKey) {
    problems.push(problem(E29.text, `词典里缺"展开/收起"的键（expand=${hasExpandKey} · collapse=${hasCollapseKey}）—— 按钮上那一对文案没有出处`))
  }

  return problems
}

test('DASH-13 E29 展开钮：溢出测量 + expandToggle 按钮 + 只在溢出时出现（像素归 GUI）', async () => {
  await runCase('DASH-13', async (rec) => {
    noteSutOverride(rec)
    const problems = []

    const official = officialClient({ extract: true })
    if (!official.ok) {
      caseHold(rec, official.code ?? 'DASH-OFFICIAL-ABSENT', `官方像素层没找到（${official.reason}）—— E29 的阳性对照与刀都判不了`)
    } else {
      const officialProblems = expandToggleProblems(official.source)
      rec.readings.official_e29 = officialProblems
      if (officialProblems.length > 0) {
        problems.push(problem('DASH-RULER-BROKEN', `同一套判据在官方 client.js 的 E29 上读出了 ${officialProblems.length} 个问题（${officialProblems.map((p) => p.code).join(', ')}）—— 尺子不认官方那个钮`))
      }
      const knives = {
        删掉溢出测量: official.source.replace(/\bscrollHeight\b/, 'offsetHeight'),
        删掉展开钮的类名: official.source.replace(/className:\s*TeamAction_module_css_default\.expandToggle/, 'className: TeamAction_module_css_default.meta'),
        删掉aria: official.source.replace(/\s*"aria-expanded": expanded,/, ''),
        删掉条件: official.source.replace(/\(clamped \|\| expanded\) &&/, ''),
        删掉文案键的用法: official.source.replace(/t\(expanded \? "task\.collapse" : "task\.expand"\)/, '"展开"'),
      }
      const want = {
        删掉溢出测量: [E29.measure],
        删掉展开钮的类名: [E29.toggle],
        删掉aria: [E29.aria],
        删掉条件: [E29.condition],
        删掉文案键的用法: [E29.text],
      }
      const vectors = {}
      for (const [name, mutated] of Object.entries(knives)) {
        if (mutated === official.source) {
          problems.push(problem('DASH-RULER-BROKEN', `刀「${name}」没切动官方源码 —— 这把刀不能证明判据会翻面`))
          continue
        }
        const got = expandToggleProblems(mutated).map((p) => p.code).sort()
        vectors[name] = got
        const expected = [...want[name]].sort()
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
          problems.push(problem('DASH-KNIFE-VECTOR', `刀「${name}」翻出来的面是 ${JSON.stringify(got)}，应当是 ${JSON.stringify(expected)} —— 判据分不开"缺哪一半"`))
        }
      }
      rec.readings.knives = vectors
    }

    let source = null
    try {
      source = readFileSync(DASH_CLIENT, 'utf8')
    } catch (err) {
      problems.push(problem('DASH-CLIENT-MISSING', `渲染层读不出来：${DASH_CLIENT}（${String(err?.message ?? err)}）`))
    }
    if (source !== null) {
      const ours = expandToggleProblems(source)
      rec.readings.ours = ours
      for (const p of ours) problems.push(p)
    }

    caseFail(problems)
  })
})

// ── `DASH-14`：日期与 headline 的顺序 / 区域 ─────────────────────────────────
const ORDER = {
  before: 'DASH-DATE-BEFORE-HEADLINE',
  footer: 'DASH-DATE-NOT-IN-FOOTER',
  shape: 'DASH-DATE-PANEL-SHAPE',
}

/** `jsx(...)` / `jsxs)(` 那个调用的**结束偏移**（配对括号之后）；找不到 ⇒ -1。 */
function callEndAt(source, callIndex) {
  const open = source.indexOf('(', callIndex)
  if (open < 0) return -1
  const close = matchBracket(source, open)
  return close < 0 ? -1 : close + 1
}

/** 面板里**第一个 `h3`**（headline 行）的区间；找不到 ⇒ null。 */
function firstH3Range(source) {
  const m = /(?:jsx|jsxs)\)?\(\s*["']h3["']/.exec(source)
  if (m === null) return null
  const end = callEndAt(source, m.index)
  return end < 0 ? null : { start: m.index, end }
}

/** 画出来的 `view.day` 在源码里的偏移（必须前面 400 字内有一个 `jsx(` 调用）；找不到 ⇒ null。 */
function renderedDayIndex(source) {
  const re = /view\.day/g
  let m
  while ((m = re.exec(source)) !== null) {
    const before = source.slice(Math.max(0, m.index - 400), m.index)
    if (/(?:jsx|jsxs)\)?\([\s\S]{0,400}$/.test(before)) return m.index
  }
  return null
}

/**
 * `DASH-14` 的判据（纯函数）：**只判顺序与区域**。
 *
 * 三条，互斥（一条命中就不再往下判，读数才分得清是哪一种）：
 *   · 读数日没画在面板里 ⇒ `DASH-DATE-NOT-IN-FOOTER`；
 *   · 读数日在第一个 `h3`（headline 行）**结束之前** ⇒ `DASH-DATE-BEFORE-HEADLINE`（R2-1 的形态）；
 *   · 读数日在 headline 之后、但还没到欠账网格（`.roster`）结束 ⇒ `DASH-DATE-NOT-IN-FOOTER`
 *     （它还在 E06/notice 那一带，不是页脚）。
 *
 * 不看类名（页脚沿用 `notice` 的样式也算过）、不看像素 —— 那归 GUI 清单 #3/#4/#6。
 * @param {string} source
 * @returns {Array<{code:string,message:string}>}
 */
function dateOrderProblems(source) {
  const code = stripCommentLines(source)
  const problems = []
  const panel = elementCallByClassToken(code, 'panel')
  if (panel === null) return [problem(ORDER.shape, '找不到 className 用到 `.panel` 的元素调用 —— 面板的 JSX 范围判不了')]
  const panelEnd = callEndAt(code, panel.callIndex)
  const h3 = firstH3Range(code)
  const roster = elementCallByClassToken(code, 'roster')
  const dateIndex = renderedDayIndex(code)
  if (panelEnd < 0) problems.push(problem(ORDER.shape, '面板元素没有配对完整的调用括号'))
  if (h3 === null) problems.push(problem(ORDER.shape, '找不到第一个 `h3`（headline 那一行）—— 顺序判不了'))
  if (roster === null) problems.push(problem(ORDER.shape, '找不到 className 用到 `.roster` 的元素（欠账网格）—— "页脚区域"判不了'))
  if (dateIndex === null) problems.push(problem(ORDER.shape, '找不到画出来的 `view.day` 表达式（"有没有画"归 DASH-12）'))
  if (problems.length > 0) return problems

  const rosterEnd = callEndAt(code, roster.callIndex)
  if (h3.start < panel.callIndex || h3.end > panelEnd) problems.push(problem(ORDER.shape, '第一个 `h3` 不在面板的 JSX 范围里'))
  if (roster.callIndex < panel.callIndex || rosterEnd > panelEnd) problems.push(problem(ORDER.shape, '`.roster` 不在面板的 JSX 范围里'))
  if (rosterEnd < 0) problems.push(problem(ORDER.shape, '`.roster` 的调用没有配对完整的括号'))
  if (problems.length > 0) return problems

  if (dateIndex < panel.callIndex || dateIndex > panelEnd) {
    problems.push(problem(ORDER.footer, '读数日没有画在面板里 —— 它不属于这块面板的任何区域，更不是页脚'))
  } else if (dateIndex < h3.end) {
    problems.push(problem(ORDER.before, '读数日出现在第一个 h3（headline 行）**结束之前** —— 读者看到的第一行成了日期，不是「目标 · 当前大阶段」（R2-1 的形态；定形 §六.3 / GUI 清单 #3）'))
  } else if (dateIndex < rosterEnd) {
    problems.push(problem(ORDER.footer, `读数日在 headline 之后、但还在欠账网格结束（偏移 ${rosterEnd}）之前（偏移 ${dateIndex}）—— 它不是页脚，读者在面板上半截就会看到日期`))
  }
  return problems
}

/**
 * 合成面板（自证 + 两把刀）：同一份面板只改**读数日放哪**。
 *   · `footer`：headline → 欠账网格 → 读数日（正确形状）；
 *   · `top`：读数日在 headline 之前（刀 A）；
 *   · `notice`：读数日在 headline 之后、欠账网格之前（刀 B，E06/notice 那一带）。
 */
function panelFixture(place) {
  const dateLine = 'jsx("div", { className: css.footer, children: `读数日 ${view.day ?? "未知"}` })'
  const noticeLine = 'jsx("div", { className: css.notice, children: `读数日 ${view.day ?? "未知"}` })'
  const headline = 'jsx("h3", { children: view.header.text })'
  const grid = 'jsxs("div", { className: css.roster, children: view.debts.map((debt) => jsx("span", { children: debt.text })) })'
  const children = place === 'top'
    ? [dateLine, headline, grid]
    : place === 'notice'
      ? [headline, noticeLine, grid]
      : [headline, grid, dateLine]
  return `jsxs("div", { className: css.panel, children: [${children.join(', ')}] })`
}

test('DASH-14 读数日的位置：headline 必须在前、日期必须在欠账网格之后（顺序/区域，像素归 GUI）', async () => {
  await runCase('DASH-14', async (rec) => {
    noteSutOverride(rec)
    const problems = []

    // ① 合成样本：正确形状必须干净；两把刀各只翻自己那一码
    const control = {
      footer: dateOrderProblems(panelFixture('footer')).map((p) => p.code),
      top: dateOrderProblems(panelFixture('top')).map((p) => p.code),
      notice: dateOrderProblems(panelFixture('notice')).map((p) => p.code),
    }
    rec.readings.control = control
    if (control.footer.length !== 0) {
      problems.push(problem('DASH-RULER-BROKEN', `合成的"正确形状"（headline → 欠账网格 → 读数日）被判出 ${JSON.stringify(control.footer)} —— 判据连正确形状都过不了`))
    }
    if (JSON.stringify(control.top) !== JSON.stringify([ORDER.before])) {
      problems.push(problem('DASH-KNIFE-VECTOR', `刀 A（日期挪回 headline 之前）翻出来的面是 ${JSON.stringify(control.top)}，应当只有 ${JSON.stringify([ORDER.before])}`))
    }
    if (JSON.stringify(control.notice) !== JSON.stringify([ORDER.footer])) {
      problems.push(problem('DASH-KNIFE-VECTOR', `刀 B（日期塞回 E06/notice 那一带）翻出来的面是 ${JSON.stringify(control.notice)}，应当只有 ${JSON.stringify([ORDER.footer])}`))
    }

    // ② 我们这一份：位置读数 + 判据
    let source = null
    try {
      source = readFileSync(DASH_CLIENT, 'utf8')
    } catch (err) {
      problems.push(problem('DASH-CLIENT-MISSING', `渲染层读不出来：${DASH_CLIENT}（${String(err?.message ?? err)}）`))
    }
    if (source !== null) {
      const code = stripCommentLines(source)
      const panelForReading = elementCallByClassToken(code, 'panel')
      const h3ForReading = firstH3Range(code)
      const rosterForReading = elementCallByClassToken(code, 'roster')
      rec.readings.positions = {
        panel: panelForReading === null ? null : { start: panelForReading.callIndex, end: callEndAt(code, panelForReading.callIndex) },
        first_h3: h3ForReading,
        roster: rosterForReading === null ? null : { start: rosterForReading.callIndex, end: callEndAt(code, rosterForReading.callIndex) },
        date: renderedDayIndex(code),
        label_present: /读数日/.test(code),
      }
      const ours = dateOrderProblems(source)
      rec.readings.ours = ours
      for (const p of ours) problems.push(p)
    }

    caseFail(problems)
  })
})
