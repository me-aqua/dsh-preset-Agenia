/**
 * `DASH-17` · **读盘窗口：两个数要有名字，读不全是必须说出口的一条状态**
 *
 * 票：`ticket-20261106-01` · 定形 `.team/leader/2026-11-07/定形-ticket-20261106-01.md`（batch 12）
 * 病根（定形 §一①）：`client.js` 写死 `{ offset: 1, limit: 200 }`。
 *   · 两个数没有名字 ⇒ 为什么 200 / 谁改的 / 改它会怎样，都读不出来；
 *   · **真正的问题**：`limit` 会**静默截断**。快照一旦超过 200 行，`svc.read` 交回的是**半份 JSON**，
 *     `JSON.parse` 抛一条与真因无关的错（`快照不是合法 JSON：…`）—— 红线指向"快照坏了"，
 *     真相是"只读了前 200 行"。读者会去查那份快照，而快照一个字都没坏。
 *
 * ── 被测对象的真实契约（**不是猜的**）─────────────────────────────────────────────
 * `svc.read(sessionId, path, { offset, limit })` 的返回值是宿主
 * `@deepseek-ai/dsh-api-workspace-files` 的 `WorkspaceFileText` = stat + `{ offset, text, lines, eof }`
 * （该包 README「Workspace read」那一节：`eof` 为真 ⇔ 这一页**含文件的最后一行**；
 *   `offset` 是 **1 基**的第一行；**一页只报 `eof`，不报总行数**）。
 * ⇒ 判据只认这一个形状；`eof === false` 是"后面还有行"的**唯一**信号，也是本票要求的那个出口。
 *
 * ── 判什么（每个码都能单独翻面）──────────────────────────────────────────────────
 *  `A` 静态（**真源码**）：
 *    · `RDW-WINDOW-CALL-MISSING` —— 找不到那条 `{offset, limit}` 的读盘调用；
 *    · `RDW-WINDOW-MAGIC-NUMBER` —— `offset` / `limit` 的值是**字面数字**（本票要治的就是它）；
 *    · `RDW-CONST-UNRESOLVED` —— 值是个名字，但这个文件里读不到 `const <名> = <整数>`（名字≠常量）；
 *    · `RDW-WINDOW-SHAPE` —— 两个值不是"1 基、正整数、limit ≥ offset"。
 *  `B` 行为（**真源码**，真装 `client.js`、真点一次、真让读盘落定；夹具给**真页形状**）：
 *    · `RDW-TRUNCATED-UNANNOUNCED` —— `eof === false` 时面板**没有**说「快照超过 N 行，读不全（路径…）」
 *      （N 必须是**实现自己那个上限值**，路径必须是 `SNAPSHOT_PATH`）；
 *    · `RDW-TRUNCATED-PARSER-BLAMED` —— 半份 JSON **被喂给了解析器**（面板出现解析错，
 *      或 `快照不是合法 JSON` / `JSON.parse` / `Unexpected end of JSON` 这类字样）——
 *      "读不全"被伪装成"快照坏了"；
 *    · `RDW-TRUNCATED-PANEL-GONE` —— 这一支把槽位带走了（根 / 触发器 / 面板不见了）。
 *  `C` 两条**对照输入**（同一条判据的另外两侧，防"只按解析失败兜底"的半修）：
 *    · `RDW-EOF-FLAG-IGNORED` —— 页的正文**能解析**（`lines === limit` 的完整 JSON），但 `eof === false`
 *      ⇒ 仍然必须说"读不全"：`eof` 是契约信号，不是"解析失败才报"；
 *    · `RDW-FULL-PAGE-BROKEN` —— 上限以内（`limit - 1` 行 / 恰好 `limit` 行）且 `eof === true`
 *      ⇒ 行为**不变**：正常出面板、不报"读不全"、不画错误条。
 *  `D` **尺子自证**（读判决，不读计数）：
 *    · `RDW-FACES-RULER-BROKEN` —— 三棵合成树把"说了 / 被解析器背锅 / 面板在"三面单独造出来，
 *      读面必须逐面分得开（含"两句话同时在"那一棵）；
 *    · `RDW-SAMPLE-NOT-TRUNCATED` / `RDW-SAMPLE-NOT-A-SNAPSHOT` —— **样本下限**：
 *      截断页必须真的是 `limit` 行且 `JSON.parse` 会抛，完整页必须真的是合法快照 ——
 *      否则"0 行 / 空串"也会让上面那几条静默成立（0 行快照 ≠ 通过）。
 *  `E` **阳性对照 + 两把刀**（判据自己会不会翻面；**产品零字节**，全在运行根里）：
 *    · `RDW-CONTROL-NOT-GREEN` —— 照上面这份契约写的**最小实现**（合成模块，住本文件）必须**全绿**；
 *      否则这一格的红是尺子坏了，不是产品缺功能；
 *    · `RDW-CONTROL-UNAVAILABLE` —— 合成实现的两处锚点没对上（夹具造不出来，判不了）；
 *    · 刀 `K1`（把 `limit: <常量>` 改回字面数字）⇒ **只有** `RDW-WINDOW-MAGIC-NUMBER` 翻红；
 *    · 刀 `K2`（把那份源码里 `eof` 这个名字整体改掉 —— "客户端看不见 eof 了"）⇒ 行为那几条一起翻红
 *      （`RDW-TRUNCATED-UNANNOUNCED` + `RDW-TRUNCATED-PARSER-BLAMED` + `RDW-EOF-FLAG-IGNORED`）；
 *      刀翻错面 ⇒ `RDW-KNIFE-VECTOR`，刀没咬住（输入没变）⇒ `RDW-KNIFE-NOT-BITING`。
 *  `F` **自守在块外**（防"把一段判据删掉，读数照旧绿"）：`RDW-LEGS-INCOMPLETE` ——
 *    `rec.readings.legs` 必须**按 id 成员**覆盖 `LEG_IDS`（多一格 / 少一格 / 缺 `measured` / 缺 `codes` 都红）。
 *    这一段在每条腿**外面**，读的是"这一跑真的量了哪几格"。
 *
 * ── 不判什么 ────────────────────────────────────────────────────────────────────
 *   · 不判上限应该是几（`200` 不是被冻结的值：**判据从源码的常量里读它**，换值不会假红）；
 *   · 不判像素 / 面板长什么样（归 GUI 清单，人点一次）；
 *   · 不判 `SNAPSHOT_PATH`（定形 §三明令不动它；这里只把它当"消息里必须有的路径"来读）。
 *
 * 证据：`<run root>/_evidence/<RUN_ID>/DASH-17/result.json`（`readings.legs` 逐格带 `codes` / `measured`）。
 */
import { before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256Text } from '../support/evidence.mjs'
import {
  createDashboardHarness,
  findAlert,
  findPanel,
  findRoot,
  findTrigger,
  textsOf,
} from '../support/dash-client-harness.mjs'

before(() => {
  preflight()
})

/** 产品那一份渲染层（**只读**；本文件一个字节都不写它）。 */
const CLIENT_FILE = path.join(PATHS.finalPreset, 'client-ui-dashboard', 'lib', 'client.js')

/** 稳定、可 grep 的码（红的时候一眼看得出是哪一面）。 */
const CODE = {
  callMissing: 'RDW-WINDOW-CALL-MISSING',
  magic: 'RDW-WINDOW-MAGIC-NUMBER',
  unresolved: 'RDW-CONST-UNRESOLVED',
  shape: 'RDW-WINDOW-SHAPE',
  sampleNotTruncated: 'RDW-SAMPLE-NOT-TRUNCATED',
  sampleNotSnapshot: 'RDW-SAMPLE-NOT-A-SNAPSHOT',
  unannounced: 'RDW-TRUNCATED-UNANNOUNCED',
  blamed: 'RDW-TRUNCATED-PARSER-BLAMED',
  panelGone: 'RDW-TRUNCATED-PANEL-GONE',
  eofIgnored: 'RDW-EOF-FLAG-IGNORED',
  fullBroken: 'RDW-FULL-PAGE-BROKEN',
  facesRuler: 'RDW-FACES-RULER-BROKEN',
  controlUnavailable: 'RDW-CONTROL-UNAVAILABLE',
  controlNotGreen: 'RDW-CONTROL-NOT-GREEN',
  knifeVector: 'RDW-KNIFE-VECTOR',
  knifeNotBiting: 'RDW-KNIFE-NOT-BITING',
  legsIncomplete: 'RDW-LEGS-INCOMPLETE',
  limitUnreadable: 'RDW-LIMIT-UNREADABLE',
}

/**
 * 这一跑量了哪几格 —— **显式清单**（自守读它，不读条数：删一格与加一格都要分别报）。
 * ⚠️ 加一条腿 = 同时改这里（自守会当场报"少一格 / 多一格"）。
 */
const LEG_IDS = ['static', 'sample', 'truncated', 'eof-flag', 'full', 'faces', 'control', 'knife-magic', 'knife-eof']

// ── 源码读取：那条读盘调用 + 它的两个值 ──────────────────────────────────────
/** 括号 / 引号都认的最小扫描器：返回 `open` 位置对应的闭括号下标（找不到 ⇒ -1）。 */
function closingIndexOf(text, open) {
  const opens = { '(': ')', '[': ']', '{': '}' }
  const stack = [opens[text[open]]]
  let quote = null
  for (let i = open + 1; i < text.length; i += 1) {
    const c = text[i]
    if (quote !== null) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i)
      if (nl < 0) return -1
      i = nl
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) return -1
      i = end + 1
      continue
    }
    if (opens[c] !== undefined) { stack.push(opens[c]); continue }
    if (c === stack[stack.length - 1]) {
      stack.pop()
      if (stack.length === 0) return i
    }
  }
  return -1
}

/** 在 `depth === 0` 处按逗号切参数（引号 / 括号内不切）。 */
function splitTopLevel(text) {
  const out = []
  let start = 0
  let depth = 0
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quote !== null) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) depth -= 1
    else if (c === ',' && depth === 0) { out.push(text.slice(start, i)); start = i + 1 }
  }
  out.push(text.slice(start))
  return out.map((part) => part.trim()).filter((part) => part !== '')
}

/**
 * 从一份源码里读出**读盘窗口**。
 *
 * 找法（不钉实现写法）：所有 `xxx.read(` 调用里，第三个实参是**带 `offset` 与 `limit` 的对象字面量**
 * 的那些；多于一条时优先取调用文本里出现快照路径常量的那一条。
 *
 * @param {string} source
 * @returns {{found:boolean, calls:number, candidates:number, call_text:string|null,
 *   window:{offset:{raw:string|null, name:string|null, value:number|null},
 *           limit:{raw:string|null, name:string|null, value:number|null}},
 *   problems:{code:string,message:string}[]}}
 */
function readWindow(source) {
  const problems = []
  const snapshotPath = readSnapshotPath(source)
  const re = /([A-Za-z_$][\w$]*)\s*\.\s*read\s*\(/g
  const found = []
  let m
  while ((m = re.exec(source)) !== null) {
    const openParen = m.index + m[0].length - 1
    const close = closingIndexOf(source, openParen)
    if (close < 0) continue
    const args = splitTopLevel(source.slice(openParen + 1, close))
    if (args.length < 3) continue
    const third = args[2]
    if (!/^\{[\s\S]*\}$/.test(third)) continue
    if (!/\boffset\s*:/.test(third) || !/\blimit\s*:/.test(third)) continue
    found.push({
      call_text: source.slice(m.index, close + 1),
      args,
      third,
      mentions_path: snapshotPath !== null && source.slice(m.index, close + 1).includes(snapshotPath),
    })
  }
  const withPath = found.filter((f) => f.mentions_path)
  const chosen = withPath.length > 0 ? withPath[0] : found[0] ?? null
  const emptyWindow = {
    offset: { raw: null, name: null, value: null },
    limit: { raw: null, name: null, value: null },
  }
  if (chosen === null) {
    problems.push(problem(CODE.callMissing,
      `源码里找不到"第三个实参带 offset / limit 的 .read(...) 调用" —— 这一格判不了（找到 ${found.length} 条候选；`
      + `快照路径常量=${JSON.stringify(snapshotPath)}）。它不是"窗口没问题"，是**没有窗口可判**`))
    return { found: false, calls: (source.match(/\.\s*read\s*\(/g) ?? []).length, candidates: found.length, call_text: null, window: emptyWindow, problems }
  }

  const window = { offset: { raw: null, name: null, value: null }, limit: { raw: null, name: null, value: null } }
  for (const key of ['offset', 'limit']) {
    // 只认**这一层**的键（`{ offset: … , limit: … }`）；值取到逗号 / 行尾注释为止。
    const hit = new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*([^,}\\n]+)`).exec(chosen.third)
    const rawValue = hit === null ? '' : hit[1].replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()
    window[key].raw = rawValue === '' ? null : rawValue
    if (rawValue === '') {
      problems.push(problem(CODE.shape, `读盘窗口里没有可读的 \`${key}:\` 值（第三个实参 = ${JSON.stringify(chosen.third.slice(0, 160))}）`))
      continue
    }
    if (/^-?\d+$/.test(rawValue)) {
      problems.push(problem(CODE.magic,
        `读盘窗口的 \`${key}\` 是**字面数字** ${rawValue}（${JSON.stringify(chosen.call_text.slice(0, 200))}）—— `
        + '定形 §二① 要求两个数是有名字的常量：为什么是这个数、谁改的、改它会怎样，都要读得出来'))
      window[key].value = Number(rawValue)
      continue
    }
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(rawValue)) {
      problems.push(problem(CODE.shape,
        `读盘窗口的 \`${key}\` 是一个表达式（${JSON.stringify(rawValue)}），既不是字面数字也不是名字 —— 判不了它是什么`))
      continue
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(rawValue)) {
      problems.push(problem(CODE.unresolved,
        `读盘窗口的 \`${key}\` 是 ${JSON.stringify(rawValue)} —— 这一格只认"本文件里的 \`const <名> = <整数>\`"；`
        + '成员表达式读不出值，也就读不出那个上限'))
      continue
    }
    window[key].name = rawValue
    const decl = new RegExp(`\\b(?:const|let|var)\\s+${rawValue.replace(/[$]/g, '\\$')}\\s*=\\s*(-?\\d+)\\b`).exec(source)
    if (decl === null) {
      problems.push(problem(CODE.unresolved,
        `读盘窗口的 \`${key}\` 写的是名字 \`${rawValue}\`，但本文件里读不到 \`const ${rawValue} = <整数>\` —— 名字不是常量：`
        + '读者仍然回答不了"上限是多少"'))
      continue
    }
    window[key].value = Number(decl[1])
  }
  const { offset, limit } = window
  if (offset.value !== null && limit.value !== null) {
    const bad = []
    if (!Number.isSafeInteger(offset.value) || offset.value < 1) bad.push(`offset=${offset.value} 不是 ≥1 的整数（宿主是 1 基）`)
    if (!Number.isSafeInteger(limit.value) || limit.value < 1) bad.push(`limit=${limit.value} 不是 ≥1 的整数`)
    if (Number.isSafeInteger(offset.value) && Number.isSafeInteger(limit.value) && limit.value < offset.value) {
      bad.push(`limit=${limit.value} < offset=${offset.value}（一页读不到任何行）`)
    }
    if (bad.length > 0) problems.push(problem(CODE.shape, `读盘窗口的取值不成立：${bad.join(' · ')}`))
  }
  return {
    found: true,
    calls: found.length,
    candidates: withPath.length > 0 ? withPath.length : found.length,
    call_text: chosen.call_text,
    window,
    problems,
  }
}

/** 快照路径常量（消息里必须出现的那条路径）—— 从源码里读，不在这里抄第二份。 */
function readSnapshotPath(source) {
  const hit = /\bconst\s+SNAPSHOT_PATH\s*=\s*["'`]([^"'`]+)["'`]/.exec(source)
  return hit === null ? null : hit[1]
}

// ── 夹具：真页形状 + 一张恰好 N 行的快照 ────────────────────────────────────
/**
 * 一张**合法视图**（`viewProblem` 认得的那种形状），并按 `targetLines` 补齐到**恰好那么多行**。
 * 补的是 `pad` 数组（视图层允许额外键）—— 行数是这一格的样本下限，必须精确。
 *
 * @returns {{text:string, lines:number, ok:boolean}}
 */
function snapshotWithLines(targetLines) {
  const base = {
    schema: 1,
    day: '2026-11-07',
    generated_at: '2026-11-07T04:00:00.000Z',
    header: { text: '目标 · 当前大阶段' },
    badge: null,
    main: null,
    emptyNotice: '本阶段没有当前任务',
    debts: [
      { key: 'tickets', label: '票', text: '0', state: 'done' },
      { key: 'bugs', label: 'bug', text: '0', state: 'done' },
      { key: 'receipts', label: '评审回执', text: '缺 0 段', state: 'done' },
    ],
    alerts: [],
  }
  const linesOf = (padLen) => `${JSON.stringify({ ...base, ...(padLen === 0 ? {} : { pad: Array.from({ length: padLen }, (_, i) => `pad-${i}`) }) }, null, 2)}`.split('\n').length
  if (linesOf(0) > targetLines) return { text: '', lines: linesOf(0), ok: false }
  let padLen = 0
  let guard = 0
  while (linesOf(padLen) < targetLines && guard < 5000) { padLen += 1; guard += 1 }
  const text = JSON.stringify({ ...(padLen === 0 ? base : { ...base, pad: Array.from({ length: padLen }, (_, i) => `pad-${i}`) }) }, null, 2)
  const lines = text.split('\n').length
  return { text, lines, ok: lines === targetLines }
}

/**
 * 宿主 `WorkspaceFileText` = stat + `{ offset, text, lines, eof }` —— 夹具按**契约的形状**给，
 * 不发明一个只有本套件认识的对象。
 */
function pageShape({ text, lines, eof, offset = 1 }) {
  return {
    path: SNAPSHOT_PATH_FALLBACK,
    version: 1,
    bytes: Buffer.byteLength(text, 'utf8'),
    offset,
    text,
    lines,
    eof,
  }
}

/** 快照路径的兜底值（源码里读不到时才用它 —— 读到就把读数写出来，别让兜底冒充事实）。 */
const SNAPSHOT_PATH_FALLBACK = '.tools/_scratch/dashboard/view.json'

/** 远端服务：`read` 把实参记下来，返回值钉成这一页（**不碰**真服务）。 */
function pageRemote(page, calls = []) {
  return {
    workspaceFiles: {
      read(...args) {
        calls.push(args)
        return Promise.resolve(page)
      },
    },
  }
}

// ── 读数：三面（说了 / 被解析器背锅 / 面板还在）+ 事件 ─────────────────────
/** 解析器背锅的几种说法（**同一件事**的几种字面：这几种都说明半份 JSON 进了解析器）。 */
const PARSER_BLAME = [
  '不是合法 JSON',
  'is not valid JSON',
  'Unexpected end of JSON',
  'Unexpected token',
  'JSON.parse',
  'SyntaxError',
]

/**
 * 一棵树 → 三面（纯函数；合成树与真树走**同一份**判读）。
 *
 * @param {unknown} tree
 * @param {{limit:number|null, snapshotPath:string|null, reading:object}} input
 * @returns {{announced:boolean, blamed:boolean, panel:boolean, crash:boolean,
 *   truncation_texts:string[], blame_texts:string[], texts:string[]}}
 */
function facesOf(tree, { limit, snapshotPath, reading }) {
  const texts = tree === null || tree === undefined ? [] : textsOf(tree).map((t) => String(t).trim()).filter((t) => t !== '')
  const numeric = limit === null ? null : String(limit)
  /** "读不全"那一句：必须有「快照超过 N 行」+「读不全」+ 快照路径 —— 三样都得在**同一段文字**里。 */
  const truncation = texts.filter((t) => /快照超过/.test(t) && /读不全/.test(t)
    && (numeric === null || new RegExp(`快照超过\\s*${numeric}\\s*行`).test(t))
    && (snapshotPath === null || t.includes(snapshotPath)))
  const blame = texts.filter((t) => PARSER_BLAME.some((needle) => t.includes(needle)))
  return {
    announced: truncation.length > 0,
    blamed: blame.length > 0,
    panel: findPanel(tree) !== null && findTrigger(tree) !== null && findRoot(tree) !== null,
    crash: (reading?.throws?.length ?? 0) > 0
      || (reading?.settled?.render_threw ?? null) !== null
      || (reading?.click?.render_threw ?? null) !== null
      || (reading?.click?.effect_threw ?? null) !== null
      || (reading?.apply_threw ?? null) !== null,
    truncation_texts: truncation,
    blame_texts: blame,
    texts,
  }
}

/**
 * 一个现场 → 读数（**只读一次**、码从三面推）。`expect` 三个值：
 *   · `truncated` —— `eof === false` 的半份 JSON：必须说"读不全"、不许背锅、面板要留；
 *   · `eof-flag`  —— `eof === false` 但正文**能解析**：仍然必须说"读不全"（信号是 eof，不是解析失败）；
 *   · `full`      —— 上限以内且 `eof === true`：行为不变（出面板 / 不报读不全 / 不画错误条）。
 *
 * @returns {{expect:string, page:string, eof:boolean|null, lines:number|null, faces:object|null,
 *   codes:string[], reading:object|null, error:string|null}}
 */
async function runLeg({ source, page, expect, label }) {
  const sourceWindow = readWindow(source)
  const limit = sourceWindow.window.limit.value
  const snapshotPath = readSnapshotPath(source)
  const harness = createDashboardHarness(source)
  if (!harness.ok) {
    return {
      expect, page: label, eof: page === null ? null : page.eof, lines: page === null ? null : page.lines,
      faces: null, codes: ['RDW-HARNESS-UNAVAILABLE'], reading: null, error: harness.reason,
    }
  }
  const calls = []
  const scene = await harness.scene({ remote: pageRemote(page, calls), ticks: 3 })
  const faces = facesOf(scene.tree ?? null, { limit, snapshotPath, reading: scene })
  const codes = []
  if (expect === 'full') {
    if (!faces.panel) codes.push(CODE.panelGone)
    if (!faces.panel || faces.announced || faces.blamed) codes.push(CODE.fullBroken)
    if (faces.crash) codes.push(CODE.fullBroken)
  } else {
    if (!faces.announced) codes.push(expect === 'eof-flag' ? CODE.eofIgnored : CODE.unannounced)
    if (faces.blamed) codes.push(CODE.blamed)
    if (!faces.panel || faces.crash) codes.push(CODE.panelGone)
  }
  return {
    expect,
    page: label,
    eof: page.eof,
    lines: page.lines,
    read_calls: calls.map((args) => ({ session: args[0], path: args[1], range: args[2] ?? null })),
    faces,
    codes: [...new Set(codes)],
    reading: {
      direct: scene.direct === null ? null : { status: scene.direct.status, value_type: typeof scene.direct.value },
      alert_text: scene.alert_text,
      trigger_present: scene.trigger_present,
      root_present: scene.root_present,
      panel_present: findPanel(scene.tree ?? null) !== null,
      status_texts: scene.status_texts,
      throws: scene.throws,
    },
    error: null,
  }
}

// ── 阳性对照：照契约写的**最小实现**（合成模块，住本文件；产品零字节）──────────
/**
 * 一个最小的渲染层模块（`window.__ModuleLoader__.load({id, factory})` 的形状与产品同一份）：
 *   · 两个数是有名字的常量；`svc.read(sessionId, SNAPSHOT_PATH, { offset: READ_FROM_LINE, limit: READ_MAX_LINES })`；
 *   · `page.eof === false` ⇒ 画一句「快照超过 N 行，读不全（路径）」，**不解析**；
 *   · `eof === true` ⇒ `JSON.parse` 出视图并画 headline（行为不变）。
 *
 * 🔴 它的用处只有一个：**证明这套判据会翻绿**（不是永远红）。所以它必须是"照契约写的最小实现"，
 *    而不是产品那份代码的影子 —— 它跟产品的实现细节没有任何耦合。
 */
const CONFORMING_CLIENT = `
window.__ModuleLoader__.load({
  id: '@fixture/conforming-client',
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    let react = require('react');
    let react_dom = require('react-dom');
    let jsxr = require('react/jsx-runtime');
    const SNAPSHOT_PATH = '.tools/_scratch/dashboard/view.json';
    const READ_FROM_LINE = 1;
    const READ_MAX_LINES = 200;
    function apply(ctx) {
      const readSnapshot = (sessionId) => {
        try {
          const svc = ctx.remote && ctx.remote.workspaceFiles;
          if (!svc || typeof svc.read !== 'function') return Promise.reject(new Error('remote.workspaceFiles 不可用'));
          return Promise.resolve(svc.read(sessionId, SNAPSHOT_PATH, { offset: READ_FROM_LINE, limit: READ_MAX_LINES }))
            .then((page) => {
              if (page && page.eof === false) return { truncated: { limit: READ_MAX_LINES, path: SNAPSHOT_PATH } };
              return { text: page && typeof page.text === 'string' ? page.text : '' };
            });
        } catch (err) { return Promise.reject(err); }
      };
      const Dashboard = ({ sessionId, t, readSnapshot }) => {
        const [open, setOpen] = react.useState(false);
        const [view, setView] = react.useState(null);
        const [failure, setFailure] = react.useState(null);
        const [note, setNote] = react.useState(null);
        react.useEffect(() => {
          if (!open) return;
          setFailure(null); setNote(null);
          readSnapshot(sessionId).then((result) => {
            if (result && result.truncated) { setNote(result.truncated); return; }
            try { setView(JSON.parse(result.text)); } catch (err) { throw new Error('快照不是合法 JSON：' + String(err && err.message ? err.message : err)); }
          }).catch((reason) => { setFailure(String(reason && reason.message ? reason.message : reason)); });
        }, [open, sessionId]);
        return jsxr.jsxs('div', { 'data-dashboard-action': true, children: [
          jsxr.jsx('button', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': open, onClick: () => { setOpen(!open); }, children: t('trigger') }),
          open && react_dom.createPortal(jsxr.jsxs('div', { role: 'dialog', 'data-dashboard-panel': true, children: [
            note !== null && jsxr.jsx('div', { role: 'status', 'data-dashboard-truncated': true, children: '快照超过 ' + note.limit + ' 行，读不全（' + note.path + '）' }),
            failure !== null && jsxr.jsx('div', { role: 'alert', children: failure }),
            view !== null && jsxr.jsx('h3', { children: view.header.text })
          ] }), { tagName: 'BODY' })
        ] });
      };
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions', id: 'dashboard', locale: 'dashboard',
        inject: () => ({ readSnapshot })
      }, Dashboard));
    }
    exports.apply = apply;
    return module.exports;
  }
});
`

/** 合成实现里的两处锚点（改产品不会影响这里；对不上 ⇒ `RDW-CONTROL-UNAVAILABLE`）。 */
const CONTROL_ANCHORS = {
  window: "svc.read(sessionId, SNAPSHOT_PATH, { offset: READ_FROM_LINE, limit: READ_MAX_LINES })",
  gate: 'if (page && page.eof === false) return { truncated',
}

/** 这一份源码"是不是已经合规"（合规 ⇒ 对照组直接用真源码，不必合成）。 */
function conforms(source) {
  const w = readWindow(source)
  return w.found && w.problems.length === 0 && /\beof\b/.test(source)
}

// ── 用例 ───────────────────────────────────────────────────────────────────
test('DASH-17 读盘窗口：两个数要有名字 + eof===false 必须说「快照超过 N 行，读不全」', async () => {
  await runCase('DASH-17', async (rec) => {
    const problems = []
    const legs = {}
    const leg = async (id, run) => {
      const got = await run()
      legs[id] = { ...got, measured: true, codes: Array.isArray(got.codes) ? got.codes : [] }
      for (const code of legs[id].codes) problems.push(problem(code, `「${id}」${got.page ?? ''}${got.error === null ? '' : `（${got.error}）`}`))
      return legs[id]
    }

    const source = readFileSync(CLIENT_FILE, 'utf8')
    const sourceSha = sha256Text(source)
    rec.readings.subject = { file: path.relative(PATHS.repo, CLIENT_FILE).replace(/\\/g, '/'), bytes: Buffer.byteLength(source, 'utf8'), sha256: sourceSha, measured_at: new Date().toISOString() }

    // ── A 静态：两个数有名字 ────────────────────────────────────────────────
    const windowReading = readWindow(source)
    rec.readings.window = {
      found: windowReading.found,
      calls: windowReading.calls,
      candidates: windowReading.candidates,
      call_text: windowReading.call_text,
      offset: windowReading.window.offset,
      limit: windowReading.window.limit,
      snapshot_path: readSnapshotPath(source),
    }
    // 静态腿：**报文逐条推**（红的时候读得到原因），读数里按码记一份
    for (const p of windowReading.problems) problems.push(p)
    legs.static = {
      expect: 'named-constants',
      page: '产品源码的读盘窗口',
      eof: null,
      lines: null,
      faces: null,
      codes: [...new Set(windowReading.problems.map((p) => p.code))],
      details: windowReading.problems.map((p) => p.message),
      measured: true,
    }

    const LIMIT = windowReading.window.limit.value
    const SNAPSHOT_PATH = readSnapshotPath(source)
    if (LIMIT === null || !Number.isSafeInteger(LIMIT) || LIMIT < 3) {
      // ⚠️ 这不是 HOLD：定形 §二① 要求"两个数变成有名字的常量"——读不出上限**本身就是红**
      //    （`RDW-CONST-UNRESOLVED` / `RDW-WINDOW-MAGIC-NUMBER` 已经在静态那一格里），行为那几格缺样本跟着报。
      problems.push(problem(CODE.limitUnreadable,
        `读不出一个可用的上限（limit=${JSON.stringify(windowReading.window.limit)}）—— 行为那几格的样本大小无从谈起；`
        + '这是"常量没建起来"，不是"这一档不适用"'))
    } else {
      // ── 样本下限（0 行 / 空串 ≠ 通过）──────────────────────────────────
      const fullText = snapshotWithLines(LIMIT + 1)
      const pageTextLines = fullText.text.split('\n').slice(0, LIMIT)
      const pageText = pageTextLines.join('\n')
      const parseFull = (() => { try { JSON.parse(fullText.text); return null } catch (err) { return String(err?.message ?? err) } })()
      const parsePage = (() => { try { JSON.parse(pageText); return null } catch (err) { return String(err?.message ?? err) } })()
      const sample = {
        limit: LIMIT,
        full_lines: fullText.lines,
        full_lines_ok: fullText.ok,
        page_lines: pageTextLines.length,
        page_bytes: Buffer.byteLength(pageText, 'utf8'),
        full_parses: parseFull === null,
        page_parses: parsePage === null,
        page_parse_error: parsePage,
      }
      rec.readings.sample = sample
      const sampleProblems = []
      if (fullText.ok !== true || fullText.lines !== LIMIT + 1) {
        sampleProblems.push(problem(CODE.sampleNotSnapshot, `完整快照没有补到恰好 ${LIMIT + 1} 行（实得 ${fullText.lines}）—— 这一格的样本造不出来`))
      }
      if (parseFull !== null) sampleProblems.push(problem(CODE.sampleNotSnapshot, `完整快照不是合法 JSON（${parseFull}）—— "上限以内正常出面板"那一侧没有样本`))
      if (pageTextLines.length !== LIMIT || Buffer.byteLength(pageText, 'utf8') === 0) {
        sampleProblems.push(problem(CODE.sampleNotTruncated, `截断页不是 ${LIMIT} 行 / 是空串（实得 ${pageTextLines.length} 行 · ${Buffer.byteLength(pageText, 'utf8')} B）—— 空样本不算通过`))
      }
      if (parsePage === null) {
        sampleProblems.push(problem(CODE.sampleNotTruncated, `截断页居然还能被 JSON.parse 解析 —— 它没有"缺最后一行"，这一格量不到"半份 JSON"（0 行 / 恰好完整都不算）`))
      }
      for (const p of sampleProblems) problems.push(p)
      legs.sample = { ...sample, measured: true, codes: [...new Set(sampleProblems.map((p) => p.code))] }

      // ── B/C 行为：三个现场（同一个上限值，从源码里读）──────────────────
      const truncatedPage = pageShape({ text: pageText, lines: pageTextLines.length, eof: false })
      const eofFlagPage = pageShape({ text: snapshotWithLines(LIMIT).text, lines: LIMIT, eof: false })
      const fullMinusOne = snapshotWithLines(LIMIT - 1)
      const fullExactly = snapshotWithLines(LIMIT)
      const fullPages = [
        { page: pageShape({ text: fullMinusOne.text, lines: fullMinusOne.lines, eof: true }), label: `${LIMIT - 1} 行（上限以内）· eof=true` },
        { page: pageShape({ text: fullExactly.text, lines: fullExactly.lines, eof: true }), label: `${LIMIT} 行（恰好一页）· eof=true` },
      ]

      await leg('truncated', async () => runLeg({ source, page: truncatedPage, expect: 'truncated', label: `${LIMIT} 行截断页（${LIMIT + 1} 行快照的前 ${LIMIT} 行）· eof=false` }))
      await leg('eof-flag', async () => runLeg({ source, page: eofFlagPage, expect: 'eof-flag', label: `${LIMIT} 行完整 JSON 但 eof=false` }))
      const fullRuns = []
      for (const item of fullPages) fullRuns.push(await runLeg({ source, page: item.page, expect: 'full', label: item.label }))
      await leg('full', async () => ({
        expect: 'full',
        page: fullRuns.map((r) => r.page).join(' / '),
        eof: true,
        lines: fullRuns.map((r) => r.lines),
        faces: fullRuns.map((r) => r.faces),
        codes: [...new Set(fullRuns.flatMap((r) => r.codes))],
        pages: fullRuns.map((r) => r.reading),
        error: null,
      }))

      // ── D 尺子自证：三面各自单独造得出来 ──────────────────────────────
      /** 合成树：根（`data-dashboard-action`）+ 触发器 + 面板（`role=dialog`），面板里放这一格要判的东西。 */
      const syntheticTree = (panelChildren) => ({
        type: 'div',
        props: {
          'data-dashboard-action': true,
          children: [
            { type: 'button', props: { 'aria-haspopup': 'dialog', children: '看板' } },
            { type: 'div', props: { role: 'dialog', children: panelChildren } },
          ],
        },
      })
      const fakeReading = { throws: [], settled: { render_threw: null }, click: { render_threw: null, effect_threw: null }, apply_threw: null }
      const facesControl = [
        {
          name: '该说的那一句在（没有解析错）',
          tree: syntheticTree([
            { type: 'div', props: { role: 'status', children: `快照超过 ${LIMIT} 行，读不全（${SNAPSHOT_PATH}）` } },
          ]),
          want: { announced: true, blamed: false, panel: true },
        },
        {
          name: '只有解析错（读不全一个字没说）',
          tree: syntheticTree([
            { type: 'div', props: { role: 'alert', children: '快照不是合法 JSON：Unexpected end of JSON input' } },
          ]),
          want: { announced: false, blamed: true, panel: true },
        },
        {
          name: '两句同时在（半修：说了、但半份 JSON 还是喂了解析器）',
          tree: syntheticTree([
            { type: 'div', props: { role: 'status', children: `快照超过 ${LIMIT} 行，读不全（${SNAPSHOT_PATH}）` } },
            { type: 'div', props: { role: 'alert', children: '快照不是合法 JSON：Unexpected end of JSON input' } },
          ]),
          want: { announced: true, blamed: true, panel: true },
        },
        {
          name: '数字不对（说了"超过 N+7 行"）',
          tree: syntheticTree([
            { type: 'div', props: { role: 'status', children: `快照超过 ${LIMIT + 7} 行，读不全（${SNAPSHOT_PATH}）` } },
          ]),
          want: { announced: false, blamed: false, panel: true },
        },
        {
          name: '路径不对（说了，但路径是另一份）',
          tree: syntheticTree([
            { type: 'div', props: { role: 'status', children: `快照超过 ${LIMIT} 行，读不全（.tools/_scratch/elsewhere/view.json）` } },
          ]),
          want: { announced: false, blamed: false, panel: true },
        },
      ]
      const facesProblems = []
      for (const cell of facesControl) {
        const got = facesOf(cell.tree, { limit: LIMIT, snapshotPath: SNAPSHOT_PATH, reading: fakeReading })
        const bad = ['announced', 'blamed', 'panel'].filter((k) => got[k] !== cell.want[k])
        if (bad.length > 0) {
          facesProblems.push(problem(CODE.facesRuler,
            `合成树「${cell.name}」判成 ${JSON.stringify({ announced: got.announced, blamed: got.blamed, panel: got.panel })}，`
            + `应当 ${JSON.stringify(cell.want)}（差在 ${bad.join(' / ')}）—— 尺子坏了：这一跑的红不能算在产品头上`))
        }
      }
      for (const p of facesProblems) problems.push(p)
      legs.faces = { control: facesControl.map((c) => c.name), measured: true, codes: [...new Set(facesProblems.map((p) => p.code))] }

      // ── E 阳性对照 + 两把刀（对照 = 合规的源码：产品已合规就用产品，否则用合成实现）──
      const productConforms = conforms(source)
      const controlSource = productConforms ? source : CONFORMING_CLIENT
      rec.readings.control = {
        source: productConforms ? 'product' : 'synthetic',
        anchors: productConforms ? null : {
          window: controlSource.includes(CONTROL_ANCHORS.window),
          gate: controlSource.includes(CONTROL_ANCHORS.gate),
        },
      }
      const controlRuns = {
        truncated: await runLeg({ source: controlSource, page: truncatedPage, expect: 'truncated', label: '对照 · 截断页' }),
        'eof-flag': await runLeg({ source: controlSource, page: eofFlagPage, expect: 'eof-flag', label: '对照 · eof=false 但可解析' }),
        full: await runLeg({ source: controlSource, page: fullPages[1].page, expect: 'full', label: '对照 · 恰好一页' }),
      }
      const controlCodes = [...new Set(Object.values(controlRuns).flatMap((r) => r.codes))]
      await leg('control', async () => ({
        expect: 'all-green',
        page: productConforms ? '产品源码（已合规）' : '合成最小实现',
        eof: null,
        lines: null,
        faces: Object.fromEntries(Object.entries(controlRuns).map(([k, v]) => [k, v.faces === null ? null : { announced: v.faces.announced, blamed: v.faces.blamed, panel: v.faces.panel }])),
        codes: controlCodes.length === 0 ? [] : productConforms ? controlCodes : [...new Set([CODE.controlUnavailable, ...controlCodes])],
        details: controlCodes.map((c) => `${c}: ${Object.entries(controlRuns).filter(([, v]) => v.codes.includes(c)).map(([k]) => k).join(',')}`),
        error: null,
      }))

      // 刀 K1：把 `limit: <常量>` 改回字面数字 ⇒ 只有静态那一格翻面
      const knifeMagic = controlSource.replace(/limit:\s*[A-Za-z_$][\w$]*/, `limit: ${LIMIT}`)
      const magicWindow = readWindow(knifeMagic)
      const k1Codes = [...new Set(magicWindow.problems.map((p) => p.code))]
      const k1Changed = knifeMagic !== controlSource
      const k1Problems = []
      if (!k1Changed) k1Problems.push(problem(CODE.knifeNotBiting, '刀 K1 没有改动任何字节（`limit: <常量>` 那处锚点没找到）—— 这把刀量不了'))
      if (JSON.stringify(k1Codes) !== JSON.stringify([CODE.magic])) {
        k1Problems.push(problem(CODE.knifeVector, `刀 K1（limit 改回字面数字）翻出来的面是 ${JSON.stringify(k1Codes)}，应当只有 ${JSON.stringify([CODE.magic])}`))
      }
      for (const p of k1Problems) problems.push(p)
      legs['knife-magic'] = {
        input: 'limit: <常量> ⇒ limit: <那个数>',
        expected_codes: [CODE.magic],
        actual_codes: k1Codes,
        changed: k1Changed,
        measured: true,
        codes: [...new Set(k1Problems.map((p) => p.code))],
      }

      // 刀 K2：把源码里 `eof` 这个名字整体改掉（客户端再也看不见 eof）⇒ 行为那几条一起翻面
      const knifeEofSource = controlSource.replace(/\beof\b/g, 'eofKnifed')
      const k2Runs = {
        truncated: await runLeg({ source: knifeEofSource, page: truncatedPage, expect: 'truncated', label: '刀 K2 · 截断页' }),
        'eof-flag': await runLeg({ source: knifeEofSource, page: eofFlagPage, expect: 'eof-flag', label: '刀 K2 · eof=false 但可解析' }),
      }
      const k2Codes = [...new Set(Object.values(k2Runs).flatMap((r) => r.codes))]
      const k2Want = [CODE.unannounced, CODE.blamed, CODE.eofIgnored].sort()
      const k2Problems = []
      if (knifeEofSource === controlSource) k2Problems.push(problem(CODE.knifeNotBiting, '刀 K2 没有改动任何字节（源码里没有 `eof` 这个名字）—— 这把刀量不了'))
      if (JSON.stringify([...k2Codes].sort()) !== JSON.stringify(k2Want)) {
        k2Problems.push(problem(CODE.knifeVector,
          `刀 K2（客户端看不见 eof）翻出来的面是 ${JSON.stringify([...k2Codes].sort())}，应当恰好 ${JSON.stringify(k2Want)}`
          + `（截断页那一格：${JSON.stringify(k2Runs.truncated.codes)} · eof-flag 那一格：${JSON.stringify(k2Runs['eof-flag'].codes)}）`))
      }
      for (const p of k2Problems) problems.push(p)
      legs['knife-eof'] = {
        input: '源码里 `eof` ⇒ `eofKnifed`（客户端读不到这个属性）',
        expected_codes: k2Want,
        actual_codes: [...k2Codes].sort(),
        per_page: Object.fromEntries(Object.entries(k2Runs).map(([k, v]) => [k, v.codes])),
        changed: knifeEofSource !== controlSource,
        measured: true,
        codes: [...new Set(k2Problems.map((p) => p.code))],
      }
    }

    // ── F 自守（**在每条腿外面**）：这一跑真的量了哪几格 ────────────────────
    const seen = Object.keys(legs)
    const missing = LEG_IDS.filter((id) => !seen.includes(id))
    const extra = seen.filter((id) => !LEG_IDS.includes(id))
    const malformed = seen.filter((id) => legs[id].measured !== true || !Array.isArray(legs[id].codes))
    if (missing.length > 0) problems.push(problem(CODE.legsIncomplete, `这一跑缺了 ${missing.length} 格：${missing.join(' / ')} —— 删掉一条腿没有别人会喊`))
    if (extra.length > 0) problems.push(problem(CODE.legsIncomplete, `这一跑多出没登记的格：${extra.join(' / ')} —— 加一条腿要同批登记进 LEG_IDS`))
    if (malformed.length > 0) problems.push(problem(CODE.legsIncomplete, `这几格没有"量过"的落点（measured / codes）：${malformed.join(' / ')}`))
    rec.readings.legs = legs
    rec.readings.legs_coverage = {
      expected: LEG_IDS,
      seen,
      missing,
      extra,
      malformed,
      codes: [...new Set(problems.filter((p) => p.code === CODE.legsIncomplete).map((p) => p.code))],
      at: new Date().toISOString(),
    }
    rec.readings.verdict = {
      red: problems.length,
      codes: [...new Set(problems.map((p) => p.code))],
      at: new Date().toISOString(),
    }
    caseFail(problems)
  })
})
