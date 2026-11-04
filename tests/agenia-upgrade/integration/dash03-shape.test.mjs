/**
 * `DASH-05` / `DASH-06` / `DASH-07` —— 客户端看板**渲染层**的契约面（第 2 关，红先）。
 *
 * 契约：`.team/test/2026-11-04/技术契约-客户端看板.md` §5（渲染层形状）。
 * 定形：R4「主行 = 一行，同时承担当前阶段」· §五「不单独做活组员数那一格」· §八.1（欠账三列）·
 * §八.2（记忆相位住 `span.count` 徽标、**只许一个词**）。
 * 对照表：E25（`div.taskTitle`：`strong` + `span.taskState` **同一行**）· E10（成员数徽标 = 删）·
 * E11（`div.roster` 网格）· E02/E03/E04/E05/E06/E20（同款元素）· §8 的反向断言。
 *
 * 尺子的来路：官方像素层 `client.js`（CSS `L12` · JSX `L88-391`）由 `support/dashboard-surface.mjs`
 * 的取件函数按只读副本 → asar 解包兜底找到；**同一套提取器先量官方、再量我们** ——
 * 官方那一次是尺子自证（找对了、读得出来），我们那一次才是判据。
 *
 * 三格：
 *   · `DASH-05` **主行一行**：`div.taskTitle` 的直接子元素必须恰好是 `strong`（标题）+ `span.taskState`（五关词），
 *     与官方同形；把标题和五关拆成两块 ⇒ 红。插件身份（loader / slot / 触发器文案）同格判。
 *   · `DASH-06` **不许有活组员数**：整个渲染层零 `members` / `memberCount`；徽标宿主是 `h3` 里的 `span.count`，
 *     它的 children 必须是**一个词**（相位），不是计数 —— 官方那枚徽标的 children 恰好是 `team.members.length`，
 *     拿它当阴性对照（同一个判据在官方那枚徽标上必须为假）。
 *   · `DASH-07` **欠账三列 + 0 不许被藏**：CSS 里 `roster` 那一条网格必须是 `repeat(3, minmax(0,1fr))`
 *     （官方是 2 列 ⇒ 同一个判据在官方 CSS 上为假）；渲染条件不许用 `value > 0` 把 0 那一格藏掉。
 */
import { before, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { caseFail, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  DASH_CLIENT,
  DASH_CLIENT_PKG,
  allKeys,
  extractCss,
  elementByClassToken,
  linesWith,
  loadDashboard,
  matchBracket,
  officialClient,
  sourcePathsOf,
  squash,
  stripCommentLines,
  taskTitleShape,
  writeSources,
  noteSutOverride,
} from '../support/dashboard-surface.mjs'
import { PHASES } from '../../../presets/agenia/lib/state.mjs'

before(() => {
  preflight()
})

/** 官方那一行（`client.js` L169-174）的结构：容器 `div`，直接子元素恰好 `strong` + `span.taskState`。 */
function isOneRowShape(shape) {
  if (shape?.found !== true) return false
  if (shape.container !== 'div') return false
  const kids = shape.children ?? []
  if (kids.length !== 2) return false
  const [title, state] = kids
  return title?.kind === 'element' && title.tag === 'strong' && state?.kind === 'element' && state.tag === 'span' && /taskState/.test(String(state.className ?? ''))
}

/** 徽标 children 的判据：**一个词**（相位），不是计数。 */
function badgeIsWord(children) {
  const text = String(children ?? '')
  if (text === '') return false
  if (/\bmembers\b|\.length|memberCount/.test(text)) return false
  return /word|phase/i.test(text)
}

/** CSS 模块映射表里有没有这一格（官方每个元素一枚类名；"拼装方式照抄"的机器那一半）。 */
function classSlotProblems(source, tokens, where) {
  const problems = []
  for (const token of tokens) {
    const hit = new RegExp(`["']${token}["']\\s*:`).test(source)
    if (!hit) problems.push(problem('DASH-CLASS-SLOT', `${where}：CSS 模块表里没有 ${token} 这一格 —— 对照表 §2 的对应元素没有落点（照抄要逐个元素有它的类名）`))
  }
  return problems
}

/** 提取 `h3` 元素（标题 + 徽标那一行；官方 E09/E21）。 */
function h3Elements(source) {
  const out = []
  const re = /(?:jsx|jsxs)\)?\(\s*['"]h3['"]/g
  let m
  while ((m = re.exec(source)) !== null) {
    const open = source.indexOf('(', m.index)
    const close = matchBracket(source, open)
    if (close < 0) continue
    out.push(source.slice(m.index, close + 1))
  }
  return out
}

test('DASH-05 主行 = 一行（标题 + 五关同一个 taskTitle）+ 插件身份对得上官方', async () => {
  await runCase('DASH-05', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const official = officialClient({ extract: true })
    rec.readings.official = { ok: official.ok, path: official.path, bytes: official.bytes, sha256: official.sha256, origin: official.origin, tried: official.tried }
    if (!official.ok) {
      caseHold(rec, 'DASH-OFFICIAL-ABSENT', `官方像素层没找到（${official.reason}）—— 这一格的行形状判不了宽窄，但下面的判据仍跑`)
    } else {
      // ① 尺子自证：同一套提取器读官方那一段，必须读出 div[strong, span.taskState]
      const officialShape = taskTitleShape(official.source)
      rec.readings.official_shape = officialShape
      if (!isOneRowShape(officialShape)) {
        problems.push(problem('DASH-RULER-BROKEN', `提取器在官方 client.js 上读出的形状不是 div[strong, span.taskState]：${JSON.stringify(officialShape).slice(0, 400)} —— 尺子坏了，下面的红不算数`))
      }
    }
    // ② 阴性对照：拆成两行 / 换错标签的合成源码，必须被同一个判据判假（判据要能翻面）
    const NEG_TWO_ROWS = 'jsxs("div", { className: css.main, children: [ jsxs("div", { className: css.taskTitle, children: [ jsx("strong", { children: title }) ] }), jsxs("div", { className: css.taskGate, children: [ jsx("span", { children: gate }) ] }) ] })'
    const NEG_WRONG_TAG = 'jsxs("div", { className: css.taskTitle, children: [ jsx("span", { children: title }), jsx("span", { className: css.taskState, children: gate }) ] })'
    const POS_SAME_ROW = 'jsxs("div", { className: css.taskTitle, children: [ jsx("strong", { children: title }), jsxs("span", { className: css.taskState, children: [ dot, word ] }) ] })'
    const control = {
      two_rows: isOneRowShape(taskTitleShape(NEG_TWO_ROWS)),
      wrong_tag: isOneRowShape(taskTitleShape(NEG_WRONG_TAG)),
      same_row: isOneRowShape(taskTitleShape(POS_SAME_ROW)),
    }
    rec.readings.shape_control = control
    if (control.same_row !== true) problems.push(problem('DASH-RULER-BROKEN', '合成的"同一行"样本没被判真 ⇒ 判据永远红，不是判据'))
    if (control.two_rows !== false) problems.push(problem('DASH-RULER-BROKEN', '合成的"拆成两行"样本没被判假 ⇒ 判据抓不到定形 R4 要禁的那件事'))
    if (control.wrong_tag !== false) problems.push(problem('DASH-RULER-BROKEN', '合成的"标题不是 strong"样本没被判假'))

    // ③ 渲染层在不在
    if (!existsSync(DASH_CLIENT)) {
      problems.push(problem('DASH-CLIENT-MISSING', `契约 §1 的渲染层不在盘上：${DASH_CLIENT}（第三关按契约落这个文件；挪了位置就要重开第 2 关）`))
      caseFail(problems)
    }
    const source = readFileSync(DASH_CLIENT, 'utf8')
    rec.readings.client = { file: DASH_CLIENT, bytes: source.length }
    if (!existsSync(DASH_CLIENT_PKG)) problems.push(problem('DASH-PLUGIN-PACKAGE', `渲染层没有包身份：${DASH_CLIENT_PKG}（定形 R1：插件形态接进去 —— 没有 package.json 就挂不上）`))
    else {
      try {
        const pkg = JSON.parse(readFileSync(DASH_CLIENT_PKG, 'utf8'))
        rec.readings.package = { name: pkg.name ?? null, version: pkg.version ?? null, dsh: pkg.dsh ?? null }
        if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') problems.push(problem('DASH-PLUGIN-PACKAGE', 'package.json 必须同时有 name 与 version（框架硬要求）'))
        if (pkg.dsh === undefined) problems.push(problem('DASH-PLUGIN-PACKAGE', 'package.json 缺 dsh 块（插件靠它声明入口与依赖服务，照官方那两个包）'))
      } catch (err) {
        problems.push(problem('DASH-PLUGIN-PACKAGE', `package.json 读不出来：${String(err?.message ?? err)}`))
      }
    }
    // 装载协议 + slot：与官方同一口（`L1` / `L491-497`）
    if (!/__ModuleLoader__\s*\.\s*load\s*\(/.test(source)) problems.push(problem('DASH-LOADER', '渲染层不是 `window.__ModuleLoader__.load({id, factory})` 这一口（官方就是这么装的，L1）'))
    if (!/conversation\.session\.header\.actions/.test(source)) problems.push(problem('DASH-SLOT', '渲染层没有注册到 `conversation.session.header.actions`（官方 L491-497 的位置；看板要长在同一个槽里）'))
    if (!/id\s*:\s*["']dashboard["']/.test(source)) problems.push(problem('DASH-SLOT', '槽位 id 应当是 "dashboard"（契约 §5；官方那枚是 "agent-team"）'))
    if (!/trigger\s*:\s*["']看板["']/.test(source)) problems.push(problem('DASH-TRIGGER', '触发器文案应当是 `看板`（E02：官方 `trigger: "智能体团队"` 的同位）'))
    problems.push(...classSlotProblems(source, ['trigger', 'panel', 'body', 'error', 'notice', 'roster', 'tasks', 'task', 'taskTitle', 'taskState', 'meta', 'emptyNotice', 'count'], 'board'))

    // 错误条 / 空态行要接到视图上（E05/E07/E20）：`error` 那一格画的是 `view.alerts`，`emptyNotice` 画的是空态文案。
    // ⚠️ E06（「正在读账本…」/「账本暂不可用」）**不判**：数据层是同步读，没有"读中"这一态（契约 §9 第 6 行）。
    const codeOnly = stripCommentLines(source)
    if (!/\.alerts\b/.test(codeOnly)) problems.push(problem('DASH-ALERTS-UNWIRED', '渲染层没有引用 `view.alerts` —— 读不到时的那条红条（E05/E07）就没有内容来源'))
    if (!/\.emptyNotice\b/.test(codeOnly)) problems.push(problem('DASH-EMPTY-UNWIRED', '渲染层没有引用 `view.emptyNotice` —— E20 的空态行没有内容来源'))
    const WIRE_SELFPROOF = 'view.alerts.map((alert) => jsx("div", { children: alert.message }))'
    if (!/\.alerts\b/.test(WIRE_SELFPROOF)) problems.push(problem('DASH-RULER-BROKEN', '"有没有接 alerts"那根针在合成源码上没命中'))

    // ④ 判据本体：我们那一段的形状
    const shape = taskTitleShape(source)
    rec.readings.board_shape = shape
    if (!isOneRowShape(shape)) {
      problems.push(problem('DASH-ONE-ROW', `主行不是"一行"：提取出来的是 ${JSON.stringify({ container: shape.container, children: shape.children }).slice(0, 400)} —— 定形 R4 要求标题与五关在同一个 div.taskTitle 里（官方 L169-174）；拆成两块就是两行`))
    }

    // ⑤ 渲染层不算账、不读盘（它只画数据层给的东西）
    const FORBIDDEN = [/\bopenCounts\s*\(/, /\bticketStatusOf\s*\(/, /node:fs/, /\breadFileSync\s*\(/]
    const hits = FORBIDDEN.flatMap((re) => linesWith(stripCommentLines(source), re))
    rec.readings.renderer_compute_hits = hits
    if (hits.length > 0) problems.push(problem('DASH-RENDERER-COMPUTES', `渲染层里出现了"自己算 / 自己读盘"的痕迹（${hits.slice(0, 3).map((h) => `L${h.line}: ${h.text}`).join(' · ')}）—— 看板是只读投影，数只能从数据层来`))
    // 针的自证：同一组正则喂一段合成源码，必须命中
    const SELFPROOF = 'const n = openCounts(ledger); const s = readFileSync(f, "utf8")'
    if (linesWith(SELFPROOF, FORBIDDEN[0]).length === 0 || linesWith(SELFPROOF, FORBIDDEN[3]).length === 0) problems.push(problem('DASH-RULER-BROKEN', '"渲染层不算账"那两针在合成源码上没命中'))

    caseFail(problems)
  })
})

test('DASH-06 没有活组员数（渲染层零 members；徽标里是相位词，不是计数）', async () => {
  await runCase('DASH-06', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const official = officialClient({ extract: true })
    if (!official.ok) caseHold(rec, 'DASH-OFFICIAL-ABSENT', `官方像素层没找到（${official.reason}）—— 阴性对照那一半判不了`)
    if (!existsSync(DASH_CLIENT)) {
      problems.push(problem('DASH-CLIENT-MISSING', `契约 §1 的渲染层不在盘上：${DASH_CLIENT}`))
      caseFail(problems)
    }
    const source = readFileSync(DASH_CLIENT, 'utf8')
    const code = stripCommentLines(source)

    // ① 阴性对照：官方那份里必须有 members / memberCount（针不是死的）
    if (official.ok) {
      const officialHits = {
        members: linesWith(stripCommentLines(official.source), /\bmembers\b/).length,
        memberCount: linesWith(stripCommentLines(official.source), /\bmemberCount\b/).length,
        badgeChildren: elementByClassToken(official.source, 'count')?.children ?? null,
      }
      rec.readings.official_member_needles = officialHits
      if (officialHits.members === 0) problems.push(problem('DASH-RULER-BROKEN', '官方 client.js 里扫不到 `members` ⇒ "我们这边零命中"可能是针死了'))
      if (officialHits.memberCount === 0) problems.push(problem('DASH-RULER-BROKEN', '官方 client.js 里扫不到 `memberCount`'))
      if (badgeIsWord(officialHits.badgeChildren)) problems.push(problem('DASH-RULER-BROKEN', `官方那枚 span.count 的 children 被判成"一个词"了（${JSON.stringify(officialHits.badgeChildren)}）—— 判据分不开计数与词`))
    }

    // ② 我们这边：一处都不许有
    const ours = {
      members: linesWith(code, /\bmembers\b/),
      memberCount: linesWith(code, /\bmemberCount\b/),
    }
    rec.readings.member_hits = { members: ours.members, memberCount: ours.memberCount }
    if (ours.members.length > 0) problems.push(problem('DASH-MEMBER-COUNT', `渲染层里出现了 members（${ours.members.slice(0, 3).map((h) => `L${h.line}: ${h.text}`).join(' · ')}）—— 定形 §五：不单独做「活组员数」那一格（对照表 E10 已删）`))
    if (ours.memberCount.length > 0) problems.push(problem('DASH-MEMBER-COUNT', `渲染层里出现了 memberCount（${ours.memberCount.slice(0, 3).map((h) => `L${h.line}: ${h.text}`).join(' · ')}）`))

    // ③ 徽标：h3 里那枚 span.count，children 必须是一个词
    const h3s = h3Elements(source)
    const withBadge = h3s.filter((h) => /\.\s*count\b/.test(h))
    rec.readings.h3_count = h3s.length
    rec.readings.h3_with_badge = withBadge.length
    if (withBadge.length === 0) {
      problems.push(problem('DASH-BADGE-MISSING', '没有任何 h3 挂着 span.count 徽标 —— 定形 §八.2 把记忆相位放在那枚官方徽标里（形状照抄、内容是我们自己的）'))
    }
    const badge = elementByClassToken(source, 'count')
    rec.readings.badge = badge
    if (badge === null) {
      problems.push(problem('DASH-BADGE-MISSING', '找不到 span.count 的元素调用（徽标要么没画，要么 className 里没有 count）'))
    } else if (!badgeIsWord(badge.children)) {
      problems.push(problem('DASH-BADGE-NOT-WORD', `徽标的 children 是 ${JSON.stringify(badge.children)} —— §八.2 只许放**一个词**（今天的记忆相位），不许塞计数或别的`))
    }

    // ④ 数据层这一侧：视图里没有"组员"这一类键；徽标词在闭集里、不是数字
    const mod = await loadDashboard()
    if (!mod.ok) {
      problems.push(problem('DASH-MODULE-MISSING', `契约 §1 的数据层不在盘上：${mod.file}（${mod.reason}）`))
    } else {
      const fixture = writeSources('DASH-06', 'view', {})
      if (typeof mod.mod.readDashboardSources !== 'function') {
        problems.push(problem('DASH-READER-MISSING', 'readDashboardSources 必须是函数（契约 §1 导出 #3）'))
      } else {
        const read = mod.mod.readDashboardSources(sourcePathsOf(fixture.files))
        const view = mod.mod.dashboardOf(read.input)
        const keys = allKeys(view)
        rec.readings.view_keys = keys
        const memberKeys = keys.filter((k) => /member|roster|组员/i.test(k))
        if (memberKeys.length > 0) problems.push(problem('DASH-MEMBER-COUNT', `视图里出现了只可能是组员数的键：${memberKeys.join(', ')}`))
        const word = view?.badge?.word
        rec.readings.badge_word = word ?? null
        if (typeof word !== 'string' || word === '') problems.push(problem('DASH-BADGE-NOT-WORD', `badge.word=${JSON.stringify(word)} —— 徽标必须是一个词`))
        else {
          if (![...PHASES, '未知'].includes(word)) problems.push(problem('DASH-BADGE-WORD', `badge.word=${JSON.stringify(word)} 不在 PHASES 闭集（lib/state.mjs L36-38）里`))
          if (/^\d+$/.test(word)) problems.push(problem('DASH-MEMBER-COUNT', `badge.word=${JSON.stringify(word)} 是个数字 —— 那正是 E10「活组员数」的形状`))
          if (/\s/.test(word)) problems.push(problem('DASH-BADGE-WORD', `badge.word=${JSON.stringify(word)} 不止一个词（§八.2：只许放一个词）`))
        }
        // 三格名（对照表 E14）：它们是**数据层**的静态文案（字段表里的 static.labels），
        // 渲染层只画 `debt.label` —— 所以判在这儿，不去渲染层里找字面量。
        const labels = (view?.debts ?? []).map((d) => d?.label)
        rec.readings.debt_labels = labels
        if (labels.join('/') !== '票/bug/评审回执') {
          problems.push(problem('DASH-DEBT-LABEL', `三格名是 ${JSON.stringify(labels)}，契约 §3/对照表 E14 是 ['票','bug','评审回执']`))
        }
      }
    }

    caseFail(problems)
  })
})

test('DASH-07 欠账三列（3 列网格）+ 0 不许被渲染条件藏掉', async () => {
  await runCase('DASH-07', async (rec) => {
    noteSutOverride(rec)
    const problems = []
    const official = officialClient({ extract: true })
    const officialCss = official.ok ? extractCss(official.source) : null
    if (officialCss === null) caseHold(rec, 'DASH-OFFICIAL-ABSENT', `官方像素层没找到（${official.reason}）—— 列数那一格的阴性对照判不了`)

    /** `roster` 那几条网格规则（官方 L360-361 是 2 列；§八.1 要 3 列）。 */
    const rosterRules = (css) => {
      const out = []
      const re = /\.([\w-]*roster)\s*\{([^}]*)\}/g
      let m
      while ((m = re.exec(css)) !== null) out.push({ selector: m[1], body: m[2] })
      return out
    }
    const columnsOf = (css) => {
      const rules = rosterRules(css)
      const repeat = rules.map((r) => /grid-template-columns\s*:\s*repeat\(\s*(\d+)/.exec(r.body)).filter((m) => m !== null).map((m) => Number(m[1]))
      return { rules: rules.length, repeat }
    }
    const officialCols = officialCss === null ? null : columnsOf(officialCss)
    rec.readings.official_columns = officialCols
    if (officialCols !== null) {
      // 阴性对照：同一个判据在官方 CSS 上必须为假（官方是 2 列，3 列是 §八.1 我们自己定的格子数）
      const officialIsThree = officialCols.repeat.length > 0 && officialCols.repeat.every((n) => n === 3) && !officialCols.repeat.includes(2)
      if (officialIsThree) problems.push(problem('DASH-RULER-BROKEN', `官方 CSS 的 roster 被判成 3 列了（${JSON.stringify(officialCols)}）⇒ 判据分不开 2 列与 3 列`))
    }

    if (!existsSync(DASH_CLIENT)) {
      problems.push(problem('DASH-CLIENT-MISSING', `契约 §1 的渲染层不在盘上：${DASH_CLIENT}`))
      caseFail(problems)
    }
    const source = readFileSync(DASH_CLIENT, 'utf8')
    const css = extractCss(source)
    rec.readings.client_css_bytes = css === null ? null : css.length
    if (css === null) {
      problems.push(problem('DASH-CSS-MISSING', '渲染层里没有 `const css = "…"` 那一段（官方就是这么装 CSS 的，L12）—— 元素与尺寸要逐条照抄，CSS 得在同一份模块里'))
      caseFail(problems)
    }
    const cols = columnsOf(css)
    rec.readings.board_columns = cols
    if (cols.repeat.length === 0) problems.push(problem('DASH-GRID-COLUMNS', '`roster` 那条网格没有 grid-template-columns（网格容器是欠账三格的宿主）'))
    else if (!cols.repeat.includes(3)) problems.push(problem('DASH-GRID-COLUMNS', `\`roster\` 的网格是 ${cols.repeat.join('/')} 列 —— 定形 §八.1 拍的是 **3 列**（三样欠账并列成一排）`))
    if (cols.repeat.includes(2)) problems.push(problem('DASH-GRID-COLUMNS', '`roster` 里还留着 2 列 —— 照抄官方 CSS 时忘了改 §八.1 那一格（第 3 格会掉到第二行）'))

    // 官方那几处尺寸/圆角/内边距的值（"照抄形状"里能被机器读的那几条，对照表 E02/E03）
    const squashed = squash(css)
    for (const needle of ['min-height:28px', 'width:min(500px,100vw-32px)', 'max-height:min(680px,100vh-32px)', 'border-radius:12px']) {
      if (!squashed.includes(needle)) problems.push(problem('DASH-COPY-VALUE', `CSS 里没有官方那条 \`${needle}\`（对照表 E02/E03：尺寸/圆角用官方原值）`))
    }

    // 渲染条件不许把 0 那一格藏掉（定形 R5：没有就写 0）
    const ZERO_HIDING = [/value\s*>\s*0\s*&&/, /value\s*!==\s*0\s*&&/, /if\s*\(\s*!\s*debt\b/]
    const hidden = ZERO_HIDING.flatMap((re) => linesWith(stripCommentLines(source), re))
    rec.readings.zero_hiding_hits = hidden
    if (hidden.length > 0) problems.push(problem('DASH-ZERO-HIDDEN', `渲染条件里出现了"只在有数时画"的形状（${hidden.slice(0, 3).map((h) => `L${h.line}: ${h.text}`).join(' · ')}）—— 定形 R5：0 也要印出来`))
    const SELFPROOF = 'debt.value > 0 && jsx("span", { children: debt.text })'
    if (linesWith(SELFPROOF, ZERO_HIDING[0]).length === 0) problems.push(problem('DASH-RULER-BROKEN', '"0 被藏掉"那根针在合成源码上没命中'))

    // 三格共用的是 `roster` 那个网格（不是另造一个 div）；三格名的判据在数据层（DASH-06 的 ④）
    if (elementByClassToken(source, 'roster') === null) problems.push(problem('DASH-GRID-HOST', '找不到 className 用到 .roster 的容器 —— 欠账三格必须住在官方那个网格里（E11）'))

    caseFail(problems)
  })
})
