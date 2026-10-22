/**
 * **「声明即义务」的两族判据**（`F-112` ① ② · 2026-10-22）。
 *
 * ## 病根一句话
 *
 * 一张**声明的名字表**旁边，没有任何一条判据问「这些名字真的在盘上 / 真的跟跑的那份一致吗」。
 * ⇒ 名字写在那儿、判据全是绿的、事实早就没了（`cand-20261020-0013` 说的就是这个病）。
 *
 * ## 这一份判三族（两根轴 + 一处注释）
 *
 *   · `declaredFilesProblems` —— **注入面清单**：声明的每一份 `.md` 必须在盘上。
 *   · `declaredFilesNonemptyProblems` —— **同一张清单的下一格**：在盘上**还不够**，
 *     它还不许是**空壳**（去掉空白后必须还有字）。`AGENTS.md` 那种 1 字节占位就是这一格治的病：
 *     文件在、注入器读到空正文、"在不在"那条判据全绿（`F-112` ① 的补格，2026-10-22）。
 *     靶子同上一格：`FROZEN.staged.injectedMarkdownFiles`（`env.mjs` 那张 13 份的名单：
 *     `leader` / `work-guidelines` / `persona` / `style` 各 1 份 + `charter` 撑起的 `team/<角色>.md` ×9）。
 *     原来那张表**只与组合对账**（`STAT-03`：名单 + 份数），**从不问盘上有没有** ——
 *     删掉 `persona.md` / `style.md`，整套测试一声不响（2026-10-22 审计的现场）。
 *   · `fallbackRosterProblems` —— **兜底名单的注释与常量是同一个名单**。
 *     靶子是 `presets/agenia/inject.js` 里 `DEFAULT_LEADER_ORDER` / `DEFAULT_MEMBER_ORDER`
 *     以及**紧贴它们上方那段说明**。审计现场：注释说 `memory` 刻意不在、常量里它在
 *     （`style` 两处都不在，那一半是对的）⇒ 读注释的人与跑代码的人拿到两个答案。
 *     🔴 **2026-10-22 收紧**：那段说明里必须有一行**机读声明** `@roster key=present|absent …`；
 *     **散文只给人读、不算声明**（没有 `@roster` ⇒ 红，见 `readRosterClaims`）。
 *
 * ## 判据的方向（三族都要能**翻面**）
 *
 * 三族都是纯函数：喂合成输入就能证明它「该红时红、该绿时绿」——
 * 用例内部各跑一组控制面（`declaredFilesControls` / `nonemptyControls` / `rosterControls`），
 * 不许只靠"这一次跑出来是绿的"（`mig-rules-14`）。
 *
 * 🔴 **两根轴各报各的**（"只红那一条"的结构保证）：`SURF-01` 只判**在不在**，
 *    `SURF-03` 只判**在但是不是空壳**。⇒ 删掉一份：`SURF-01` 红、`SURF-03` 绿（缺的那份不归它管）；
 *    把一份改成 1 字节：`SURF-03` 红、`SURF-01` 绿。同一份文件不许被两条判据同时报。
 *
 * ⚠️ **不在这一份里的**：`STAT-03` 已经钉着「组合声明的名单 = 冻结名单」（声明 ↔ 声明）；
 * 这里钉的是**声明 ↔ 盘上**。两边合起来才是"声明了、也在盘上、配置里也真会读到它"。
 */

/** 问题码（稳定、可 grep；`SURF-` 是这个族的前缀）。 */
export const CODES = {
  declEmpty: 'SURF-DECL-EMPTY',
  declCount: 'SURF-DECL-COUNT',
  fileMissing: 'SURF-FILE-MISSING',
  existsControl: 'SURF-EXISTS-CONTROL',
  /** 在盘上、但去掉空白后 0 个字符（1 字节占位 / 只剩空白 / 只有一个 BOM）。 */
  fileEmpty: 'SURF-FILE-EMPTY',
  /** 在盘上、但读不出正文（权限 / 是目录 / 不是文本）——"非空"证明不了，**不许当没事**。 */
  fileUnreadable: 'SURF-FILE-UNREADABLE',
  nonemptyControl: 'SURF-NONEMPTY-CONTROL',
  rosterConstMissing: 'SURF-ROSTER-CONST-MISSING',
  rosterNoClaim: 'SURF-ROSTER-NO-CLAIM',
  rosterNoClaimKey: 'SURF-ROSTER-NO-CLAIM-KEY',
  rosterClaimViolated: 'SURF-ROSTER-CLAIM-VIOLATED',
  rosterUnusedConst: 'SURF-ROSTER-UNUSED-CONST',
  rosterControl: 'SURF-ROSTER-CONTROL',
}

/**
 * **兜底名单的两张表**（`inject.js` 里那两个常量）——
 *
 * `requiredClaims`：这段注释**必须**对哪几个 key 表态（在 / 不在，二选一，但必须有）。
 * 为什么要有这一栏：把"注释说错了"改成"把那句话删掉"也能让一致性判据变绿 ——
 * 那是把判据读成"沉默即合格"。这两个 key 是这一票的靶子（`F-112` ②）：
 *   · `memory` —— 活体组合里声明的那一项（`computedOrderKeys` 之一），也是分叉的那一格；
 *   · `style`  —— 唯一只走尾巴提醒、又被组合声明进 `leaderOrder` 的那一份。
 * ⚠️ 加一个 key 进这张表是**合法改动**（它只会让判据更严）；删一个 key 等于把那一格改宽。
 */
export const FALLBACK_ROSTERS = [
  {
    name: 'DEFAULT_LEADER_ORDER',
    who: '组长那份兜底',
    requiredClaims: ['memory', 'style'],
  },
  {
    name: 'DEFAULT_MEMBER_ORDER',
    who: '组员那份兜底',
    requiredClaims: ['memory'],
  },
]

// ── ① 注入面清单 ↔ 盘上 ─────────────────────────────────────────────────────
/**
 * 声明的每一份文件都必须在盘上（**点名叫出缺的那一份**）。
 *
 * @param {{declared: string[], exists: (rel: string) => boolean, where: string}} args
 *   `exists` 是**注进来的**（真跑时是 `stagingExists`，控制面里是假的）——
 *   判据不自己摸盘，否则"少一份"那一刻只能靠真删文件来造。
 * @returns {{problems: Array<{code:string,message:string,detail:object|null}>,
 *            readings: {declared_count:number, present:string[], missing:string[]}}}
 */
export function declaredFilesProblems({ declared, exists, where = '注入面清单' }) {
  const problems = []
  const present = []
  const missing = []
  if (!Array.isArray(declared) || declared.length === 0) {
    problems.push({
      code: CODES.declEmpty,
      message: `${where} 是空的（一份都没声明）—— 「声明了就必须在盘上」这句话在空表上恒真，`
        + '这种"全绿"没有意义（空表与"盘上一份都没有"长得一模一样）',
      detail: { declared: [], where },
    })
    return { problems, readings: { declared_count: 0, present, missing } }
  }
  for (const rel of declared) {
    let ok = false
    try {
      ok = exists(rel) === true
    } catch {
      ok = false
    }
    if (ok) present.push(rel)
    else {
      missing.push(rel)
      problems.push({
        code: CODES.fileMissing,
        message: `声明的注入面文件**不在盘上**：\`${rel}\`（名单：${where}）。`
          + '声明即义务：要么它在盘上，要么同批把它从声明里删掉 —— '
          + '"声明里有、盘上没有"就是一份在假账上签的字（注入器读不到它，这一份等于没注入，而判据全绿）',
        detail: { rel, where },
      })
    }
  }
  return { problems, readings: { declared_count: declared.length, present, missing } }
}

/**
 * ① 的控制面：同一份判据喂五组**合成**事实，每组要求的问题码 / 点名文件逐条对上。
 *
 * 为什么控制面不拿真树：真树少一份是"盘的问题"，判据能不能翻面是另一件事。
 *
 * @returns {{controls: Array<{name:string, want:string[], got:string[], named:string[], ok:boolean}>,
 *            failures: string[]}}
 */
export function declaredFilesControls(declared = ['a.md', 'b.md', 'c.md']) {
  const run = (presentList) => {
    const set = new Set(presentList)
    const v = declaredFilesProblems({ declared, exists: (rel) => set.has(rel), where: '<control>' })
    return {
      codes: v.problems.map((p) => p.code),
      named: v.problems.map((p) => p.detail?.rel).filter((x) => typeof x === 'string'),
    }
  }
  const cases = [
    ['三份都在 ⇒ 0 问题（绿的那一头）', declared, []],
    ['少一份（b.md）⇒ 恰好一条、点名 b.md', ['a.md', 'c.md'], [CODES.fileMissing]],
    ['少两份（a.md · c.md）⇒ 两条、各点名', ['b.md'], [CODES.fileMissing, CODES.fileMissing]],
    ['一份都不在 ⇒ 三条全点名', [], [CODES.fileMissing, CODES.fileMissing, CODES.fileMissing]],
  ]
  const controls = []
  const failures = []
  for (const [name, presentList, wantCodes] of cases) {
    const got = run(presentList)
    const wantMissing = declared.filter((rel) => !presentList.includes(rel))
    const ok = JSON.stringify(got.codes) === JSON.stringify(wantCodes)
      && JSON.stringify(got.named) === JSON.stringify(wantMissing)
    controls.push({ name, want: wantCodes, got: got.codes, named: got.named, ok })
    if (!ok) {
      failures.push(`${CODES.existsControl}：控制面「${name}」期望码 ${JSON.stringify(wantCodes)} / 点名 ${JSON.stringify(wantMissing)}，`
        + `实得 ${JSON.stringify(got.codes)} / ${JSON.stringify(got.named)} —— 判据翻不了面，这一跑的红绿都不算数`)
    }
  }
  // 第五组：空声明表 ⇒ 必须报"空表不算绿"
  {
    const v = declaredFilesProblems({ declared: [], exists: () => true, where: '<control>' })
    const got = v.problems.map((p) => p.code)
    const ok = JSON.stringify(got) === JSON.stringify([CODES.declEmpty])
    controls.push({ name: '空声明表 ⇒ 一条"空表不算绿"', want: [CODES.declEmpty], got, named: [], ok })
    if (!ok) {
      failures.push(`${CODES.existsControl}：空声明表那一格期望 ${CODES.declEmpty}，实得 ${JSON.stringify(got)} —— `
        + '空表被当成"全绿"正是这条判据最怕的哑掉形态')
    }
  }
  return { controls, failures }
}

// ── ①b 注入面清单 ↔ 「不是空壳」 ────────────────────────────────────────────
/**
 * **判据的度量，也是这一格唯一的口径**（`CONTRACT.md` §7.1.1 同一份）：
 * `text` 去掉**所有空白**之后还剩几个字符。
 *
 * 为什么口径是它、不是 `bytes >= 2`：
 *   · `\s` 覆盖空格 / 制表 / 换行 / 回车 / 全角空格（U+3000）/ BOM（U+FEFF）
 *     ⇒ 只剩空白的文件、CRLF 空文件、只写了一个 BOM 的文件，这里都读成 **0 字符**；
 *   · 而 `bytes >= 2` 在 Windows 上会被恰好 2 字节的 `\r\n`、3 字节的 BOM 骗过去 ——
 *     那两个正是"文件在、内容等于没有"的另两种写法。
 * ⇒ 病是**内容**上的，判据就得钉在内容上；字节数只当读数（`bytes` 落进证据，用来一眼看出"1 字节"）。
 */
export function nonWhitespaceLength(text) {
  return String(text ?? '').replace(/\s/g, '').length
}

/**
 * 声明的每一份文件**不许是空壳**：在盘上、且**去掉空白后还有字**。
 *
 * 🔴 **这一格只判"有内容吗"**（不判"在不在" —— 那是 `declaredFilesProblems` / `SURF-01` 的轴）：
 *   · `read` 报 `missing` ⇒ 这份文件**不进这一格的读数、也不报问题**（缺的那一份不归它管，
 *     否则删一份文件会让两条判据一起红，"只红那一条"就没有落点了）；
 *   · `read` 报 `unreadable` ⇒ **红**（"非空"证明不了，不许把"读不到"读成"没事"）。
 *
 * @param {{declared: string[],
 *          read: (rel: string) => {status:'ok', text:string, bytes?:number}
 *                                     | {status:'missing'} | {status:'unreadable', error?:string},
 *          where?: string}} args
 *   `read` 是**注进来的**（真跑时读 staging 树，控制面里是假事实）—— 判据不自己摸盘，
 *   否则"1 字节占位"那一格只能靠真改盘上的文件来造。
 * @returns {{problems: Array<{code:string,message:string,detail:object|null}>,
 *            readings: {declared_count:number, nonempty:string[], empty:string[],
 *                       missing:string[], unreadable:string[]}}}
 */
export function declaredFilesNonemptyProblems({ declared, read, where = '注入面清单' }) {
  const problems = []
  const readings = { declared_count: 0, nonempty: [], empty: [], missing: [], unreadable: [] }
  if (!Array.isArray(declared) || declared.length === 0) {
    problems.push({
      code: CODES.declEmpty,
      message: `${where} 是空的（一份都没声明）—— 「不许是空壳」这句话在空表上恒真，`
        + '这种"全绿"没有意义（空表与"盘上一份都没有"长得一模一样）',
      detail: { declared: [], where },
    })
    return { problems, readings }
  }
  readings.declared_count = declared.length
  for (const rel of declared) {
    let r
    try {
      r = read(rel)
    } catch (err) {
      r = { status: 'unreadable', error: String(err?.message ?? err) }
    }
    const status = r?.status
    // 不在盘上 ⇒ 不是这一格的轴（`SURF-01` 报，且只由它报）。
    if (status === 'missing') {
      readings.missing.push(rel)
      continue
    }
    if (status !== 'ok' || typeof r.text !== 'string') {
      const error = status === 'ok' ? 'read 没给 text（读到的不是文本）' : (r?.error ?? `read 给了未知状态 ${JSON.stringify(status)}`)
      readings.unreadable.push(rel)
      problems.push({
        code: CODES.fileUnreadable,
        message: `声明的注入面文件**读不出正文**：\`${rel}\`（名单：${where}）—— 它在盘上，但拿不到内容（${error}）。`
          + '"非空"这件事证明不了 ⇒ 判红：这一格不许把"读不到"读成"没事"',
        detail: { rel, where, error },
      })
      continue
    }
    const chars = nonWhitespaceLength(r.text)
    const bytes = typeof r.bytes === 'number' ? r.bytes : null
    if (chars > 0) {
      readings.nonempty.push(rel)
      continue
    }
    readings.empty.push(rel)
    problems.push({
      code: CODES.fileEmpty,
      message: `声明的注入面文件是**空壳**：\`${rel}\`（名单：${where}）—— ${bytes === null ? '' : `${bytes} 字节、`}去掉空白后 **0 个字符**。`
        + '文件在盘上、内容等于没有：注入器读到的是空正文，这一份等于没注入，而"在不在"那条判据照样全绿。'
        + '判据是「去掉空白后非空」（不是 `bytes >= 2`：Windows 上 `\\r\\n` 恰好 2 字节、一个 BOM 3 字节，都会被它放过）。'
        + '修法二选一：把正文补回去，或者同批把它从声明里删掉',
      detail: { rel, where, bytes, chars },
    })
  }
  return { problems, readings }
}

/**
 * ①b 的控制面：同一份判据喂九组**合成**事实（每组只改"内容"这一件事）。
 *
 * 为什么这九组：这一格最可能的半修形态有五种 ——
 *   ① 把口径写成 `bytes >= 2`（窗口里恰好有 CRLF 2 字节 / BOM 3 字节两份文件会假绿）；
 *   ② 只判"文件存在"（那就是 `SURF-01`，这一格退化成重复）；
 *   ③ 把"读不出来"当成"没事"（读不到 ⇒ 静默放行）；
 *   ④ 缺一份时也在这里报（与 `SURF-01` 抢同一份文件，"只红那一条"当场失效）；
 *   ⑤ 空表恒真。
 * 第 3 / 4 / 5 组就是 ①②⑤ 的反证；第 6 组钉 ③；第 7 组钉 ④；第 9 组钉空表。
 *
 * @returns {{controls: Array<{name:string, want:string[], got:string[], named:string[], ok:boolean}>,
 *            failures: string[]}}
 */
export function nonemptyControls(declared = ['a.md', 'b.md', 'c.md']) {
  /** 事实表：`string` = 有正文；`undefined` = 不在盘上；对象 = 原样交给判据的 `read`。 */
  const readerOf = (facts) => (rel) => {
    const v = facts[rel]
    if (v === undefined) return { status: 'missing' }
    if (typeof v === 'string') return { status: 'ok', text: v, bytes: Buffer.byteLength(v, 'utf8') }
    return v
  }
  const run = (facts) => {
    const v = declaredFilesNonemptyProblems({ declared, read: readerOf(facts), where: '<control>' })
    return {
      codes: v.problems.map((p) => p.code),
      named: v.problems.map((p) => p.detail?.rel).filter((x) => typeof x === 'string'),
      readings: v.readings,
    }
  }
  const cases = [
    ['三份都有正文 ⇒ 0 问题（绿的那一头）',
      { 'a.md': '组长默认收到哪些。\n', 'b.md': '组员那份。\n', 'c.md': '# 一份作业书\n' }, [], []],
    ['b.md 是 1 字节（`\\n`）⇒ 恰好一条、点名 b.md',
      { 'a.md': '正文\n', 'b.md': '\n', 'c.md': '正文\n' }, [CODES.fileEmpty], ['b.md']],
    ['c.md 是 2 字节的 `\\r\\n`（**`bytes >= 2` 会放过的那一格**）⇒ 恰好一条、点名 c.md',
      { 'a.md': '正文\n', 'b.md': '正文\n', 'c.md': '\r\n' }, [CODES.fileEmpty], ['c.md']],
    ['a.md 只写了一个 BOM（3 字节）⇒ 恰好一条、点名 a.md',
      { 'a.md': '\uFEFF', 'b.md': '正文\n', 'c.md': '正文\n' }, [CODES.fileEmpty], ['a.md']],
    ['a.md 只有空白（空格 / 制表 / 换行 / 全角空格）⇒ 恰好一条、点名 a.md',
      { 'a.md': '  \t\n\u3000\r\n', 'b.md': '正文\n', 'c.md': '正文\n' }, [CODES.fileEmpty], ['a.md']],
    ['c.md 读不出来（EACCES）⇒ 一条 `SURF-FILE-UNREADABLE`、点名 c.md（**不许静默放行**）',
      { 'a.md': '正文\n', 'b.md': '正文\n', 'c.md': { status: 'unreadable', error: '<EACCES>' } }, [CODES.fileUnreadable], ['c.md']],
    ['b.md 不在盘上 ⇒ **0 问题**（缺的那份归 `SURF-01`，这一格不抢）',
      { 'a.md': '正文\n', 'c.md': '正文\n' }, [], []],
    ['两份都是空壳（a.md 1 字节 + c.md 空白）⇒ 恰好两条、各点名',
      { 'a.md': '\n', 'b.md': '正文\n', 'c.md': '   ' }, [CODES.fileEmpty, CODES.fileEmpty], ['a.md', 'c.md']],
  ]
  const controls = []
  const failures = []
  for (const [name, facts, wantCodes, wantNamed] of cases) {
    const got = run(facts)
    const ok = JSON.stringify(got.codes) === JSON.stringify(wantCodes)
      && JSON.stringify(got.named) === JSON.stringify(wantNamed)
    controls.push({ name, want: wantCodes, got: got.codes, named: got.named, ok })
    if (!ok) {
      failures.push(`${CODES.nonemptyControl}：控制面「${name}」期望码 ${JSON.stringify(wantCodes)} / 点名 ${JSON.stringify(wantNamed)}，`
        + `实得 ${JSON.stringify(got.codes)} / ${JSON.stringify(got.named)} —— 判据翻不了面，这一跑的红绿都不算数`)
    }
  }
  // 第九组：空声明表 ⇒ 必须报"空表不算绿"
  {
    const v = declaredFilesNonemptyProblems({ declared: [], read: () => ({ status: 'ok', text: 'x' }), where: '<control>' })
    const got = v.problems.map((p) => p.code)
    const ok = JSON.stringify(got) === JSON.stringify([CODES.declEmpty])
    controls.push({ name: '空声明表 ⇒ 一条"空表不算绿"', want: [CODES.declEmpty], got, named: [], ok })
    if (!ok) {
      failures.push(`${CODES.nonemptyControl}：空声明表那一格期望 ${CODES.declEmpty}，实得 ${JSON.stringify(got)} —— `
        + '空表被当成"全绿"正是这条判据最怕的哑掉形态')
    }
  }
  return { controls, failures }
}

// ── ② 兜底名单的注释 ↔ 常量 ─────────────────────────────────────────────────
/** 注释行（`//` / `/*` / 一片 `*`）。与项目里其余静态判据同口径。 */
const isCommentLine = (line) => /^\s*(\/\/|\/\*|\*)/.test(line)

/**
 * **散文的语气词表** —— 只为一件事服务：抓"散文与 `@roster` 说反了"。
 *
 * 🔴 2026-10-22 起它**不是**表态的来源（那是 `@roster` 的事）：
 *   · 说"**不在**"：句子里出现「不在」（`不在里面` / `不在这份兜底里` 都算）；
 *   · 说"**在**"：句子里出现「在这份兜底里 / 在兜底里 / 在名单里 / 在里面 / 也在」。
 *   ⇒ 散文读出来只进 `prose`（用来与机读声明对账），**永远不会**进 `claims`。
 * 🔴 含糊的提及**不算表态**（"它是活体组合里声明的那一项"既没说在、也没说不在）。
 *    判据不许把"提到"读成"声明"（`T-TEST-09`）。
 */
const ABSENT_MARK = /不在/
const PRESENT_MARKS = [/在这份兜底里/, /在兜底里/, /在名单里/, /在里面/, /也在/]

/** 反引号包起来的名字（`memory` / `style` / `work-guidelines` …）。 */
const KEY_TOKEN = /`([a-z][a-z0-9-]*)`/g

/** 句子切分：只在这几个标点处断开（括号、顿号不断 —— 别把"（共享记忆）刻意不在"切散）。 */
const CLAUSE_SPLIT = /[，。；：、]/

/**
 * 从 `src` 里取出 `const <name> = [ … ]` 那个常量。
 *
 * @returns {{ok:false, why:string} | {ok:true, keys:string[], line:number}}
 */
export function parseConstArray(src, name) {
  const lines = String(src ?? '').split(/\r?\n/)
  const declRe = new RegExp(`\\bconst\\s+${name}\\s*=`)
  const idx = lines.findIndex((l) => declRe.test(l))
  if (idx < 0) return { ok: false, why: `找不到 \`const ${name} = [ … ]\`（常量被改名 / 挪走 / 删掉了）` }
  let body = ''
  for (let i = idx; i < lines.length; i += 1) {
    body += `${lines[i]}\n`
    if (lines[i].includes(']')) break
  }
  const open = body.indexOf('[')
  const close = body.indexOf(']', open + 1)
  if (open < 0 || close < 0) return { ok: false, why: `\`${name}\` 的方括号没闭合（拿不到名单）` }
  const keys = body.slice(open + 1, close)
    .split(',')
    .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
    .filter((s) => s !== '')
  return { ok: true, keys, line: idx + 1 }
}

/**
 * 常量**正上方**那段说明（越过中间的空行；往前一直取到第一条非注释行为止）。
 * @returns {Array<{line:number, text:string}>}
 */
export function commentBlockAbove(src, constLine /* 1-based */) {
  const lines = String(src ?? '').split(/\r?\n/)
  let i = constLine - 2
  while (i >= 0 && lines[i].trim() === '') i -= 1
  const out = []
  while (i >= 0 && isCommentLine(lines[i])) {
    out.unshift({ line: i + 1, text: lines[i] })
    i -= 1
  }
  return out
}

/**
 * 这段注释里**认得出名字**的那些词（词汇表由调用方给，别在这儿硬编一张）：
 * 只有"可能是一个 order key"的名字才算表态的候选 —— 否则同一句里提一嘴 `leaderOrder`
 * 就会被读成"leaderOrder 在这份兜底里"（假红）。
 */
export function rosterVocabulary(rosters = FALLBACK_ROSTERS, extra = []) {
  const vocab = new Set(extra)
  for (const r of rosters) {
    for (const k of r.requiredClaims ?? []) vocab.add(k)
  }
  return vocab
}

/**
 * **机器可读的声明行**：`@roster memory=present style=absent …`（`F-112` ② 收口后的**唯一**声明写法）。
 *
 * 为什么只有它算：注释要给人读，也要给判据读 —— 一句 `@roster key=present|absent` 把"谁在谁不在"
 * 变成**能逐个对账的字段**，比散文更难写歪；而散文要先被"读懂"才能判，词表一宽它就变成兜底。
 * ⚠️ 它**不是更松的口径**：同一个 vocabulary、同一条一致性判据（`fallbackRosterProblems`）。
 */
const ROSTER_MARKER = /(?:^|\s)@roster\s+(.+)$/
const ROSTER_PAIR = /([a-z][a-z0-9-]*)=(present|absent)\b/g

/**
 * 从一段注释里读出**机读声明**：`Map<key, {polarity:'present'|'absent', line}>`。
 * 同一段说明里两行 `@roster` 说法不一 ⇒ 记进 `conflicts`（机读行自相矛盾同样判红）。
 *
 * 🔴 **2026-10-22 收紧（`CONTRACT.md` §7.2 同一句话）：散文不再算声明。**
 *   · **病**：两种写法都认的时候，一段**只写散文、没有 `@roster`** 的注释仍然可能绿 ——
 *     "声明必须机读"这一格没有落地（`F-112` ② 剩下的那半格）。
 *   · **现在**：`claims` 只来自 `@roster` 行；散文可以留（给人读），但它**提供不了声明**，
 *     也就**不能让这一格变绿** —— 没有 `@roster` ⇒ `SURF-ROSTER-NO-CLAIM`。
 *   · **唯一的例外是"散文说反"**：散文里明确说了某个 key 在 / 不在，而 `@roster` 说反了，
 *     仍然记下来（由 `fallbackRosterProblems` 判 `SURF-ROSTER-CLAIM-VIOLATED`）——
 *     这不是"散文参与判定"，这是"读注释的人与跑代码的人拿到两个答案"，正是 `F-112` ② 的病。
 *
 * @returns {{claims: Map<string,{polarity:'present'|'absent', line:number}>,
 *            conflicts: Array<{line:number, clause:string, keys:string[]}>,
 *            markerLines: number[],
 *            prose: Array<{key:string, polarity:'present'|'absent', line:number, clause:string}>}}
 */
export function readRosterClaims(block, { vocabulary }) {
  const claims = new Map()
  const conflicts = []
  const markerLines = []
  const prose = []
  /**
   * 记一条**机读**声明。同一个 key 两种方向都出现过 ⇒ 冲突（哪一行先出现都一样）。
   * @returns {boolean} 这一条是否记下了（冲突时不记）
   */
  const put = (key, polarity, line, clause) => {
    const prev = claims.get(key)
    if (prev !== undefined && prev.polarity !== polarity) {
      conflicts.push({ line, clause, keys: [key] })
      return false
    }
    if (prev === undefined) claims.set(key, { polarity, line })
    return true
  }
  for (const { line, text } of block) {
    // 去掉粗体/斜体星号：`在**这份兜底里**` 与 `在这份兜底里` 必须读成同一句话。
    const plain = text.replace(/\*/g, '')
    // ── 唯一的声明写法：机器可读的标记行（一行里可以有好几对）──────────────────
    const marker = ROSTER_MARKER.exec(plain)
    if (marker !== null) {
      markerLines.push(line)
      for (const m of marker[1].matchAll(ROSTER_PAIR)) {
        const key = m[1]
        if (!vocabulary.has(key)) continue
        put(key, m[2] === 'absent' ? 'absent' : 'present', line, marker[0].trim())
      }
      continue // 这一行已经是字段了，别再按散文切（`=` 两侧没有"在 / 不在"的散文语义）
    }
    // ── 散文：**不产生声明**，只用来抓"说反了" ────────────────────────────────
    for (const clause of plain.split(CLAUSE_SPLIT)) {
      const tokens = [...clause.matchAll(KEY_TOKEN)]
        .map((m) => m[1])
        .filter((k) => vocabulary.has(k))
      if (tokens.length === 0) continue
      const absent = ABSENT_MARK.test(clause)
      const present = PRESENT_MARKS.some((re) => re.test(clause))
      if (!absent && !present) continue
      if (absent && present) {
        // `不在里面` 同时命中两组词 —— 它不是冲突，它是在说"不在"
        const onlyNegated = clause.replace(/不在里面/g, '').replace(ABSENT_MARK, '')
        if (PRESENT_MARKS.some((re) => re.test(onlyNegated))) continue
      }
      const polarity = absent ? 'absent' : 'present'
      for (const key of tokens) prose.push({ key, polarity, line, clause: clause.trim() })
    }
  }
  return { claims, conflicts, markerLines, prose }
}

/**
 * ②「注释与常量是同一个名单」。
 *
 * 判四样（每样都能单独承重）：
 *   1. **机读声明必须在**：常量正上方那段说明里要有一行 `@roster key=present|absent …`；
 *      没有 ⇒ `SURF-ROSTER-NO-CLAIM`（**散文不算声明**：2026-10-22 收紧，散文只给人读）；
 *   2. **一致性**：机读声明说"不在"的 key 不许在常量里；说"在"的 key 必须在常量里
 *      （**点名到 key + 两处行号**）；两行 `@roster` 自相矛盾、或散文与 `@roster` 说反了，也归这一码；
 *   3. **不许沉默**：`requiredClaims` 里每个 key 都得在机读声明里出现一次
 *      （"把说错的那一对删掉"不是修好，是换了个地方让它静默）；
 *   4. **常量不是死名字**：`const` 在整个文件里至少被读到一次（只声明不读 = 与 `env.mjs:639`
 *      那个死常量同一个病）。
 *
 * @param {string} src 被测源码（真跑时 = staging 的 `inject.js`）
 * @param {{rosters?: typeof FALLBACK_ROSTERS, vocabulary?: string[]}} [options]
 *   `vocabulary` 是"哪些名字算 order key"（真跑时由用例从常量本身 + `computedOrderKeys` 现算）。
 * @returns {{problems: Array<{code:string,message:string,detail:object|null}>, readings: object}}
 */
export function fallbackRosterProblems(src, { rosters = FALLBACK_ROSTERS, vocabulary = [] } = {}) {
  const problems = []
  const text = String(src ?? '')
  const readings = { rosters: [], vocabulary: [] }
  // 词汇表：常量里真有的名字 ∪ 每张表要求表态的名字 ∪ 调用方给的（例如 computedOrderKeys）。
  const vocab = rosterVocabulary(rosters, vocabulary)
  for (const roster of rosters) {
    const parsed = parseConstArray(text, roster.name)
    if (!parsed.ok) {
      problems.push({
        code: CODES.rosterConstMissing,
        message: `${roster.who}（\`${roster.name}\`）：${parsed.why} —— 拿不到常量就判不了"注释与常量是不是同一个名单"`,
        detail: { const: roster.name },
      })
      continue
    }
    for (const k of parsed.keys) vocab.add(k)
  }
  readings.vocabulary = [...vocab].sort()
  for (const roster of rosters) {
    const parsed = parseConstArray(text, roster.name)
    if (!parsed.ok) continue
    const block = commentBlockAbove(text, parsed.line)
    const { claims, conflicts, markerLines, prose } = readRosterClaims(block, { vocabulary: vocab })
    const set = new Set(parsed.keys)
    // 0. **机读声明必须在**（2026-10-22 收紧：散文不算声明 ⇒ 没有 `@roster` 就没有声明）
    if (claims.size === 0) {
      const truth = roster.requiredClaims.map((k) => `${k}=${set.has(k) ? 'present' : 'absent'}`).join(' ')
      problems.push({
        code: CODES.rosterNoClaim,
        message: `${roster.who}（\`${roster.name}\`，第 ${parsed.line} 行的常量）**没有机读声明**：常量正上方那段说明里 `
          + (markerLines.length === 0
            ? '找不到 `@roster …` 那一行（散文只给人读、不算声明 ⇒ 判据读不出"谁在这份兜底里"）'
            : `有 \`@roster\` 行（第 ${markerLines.join(' / ')} 行），但里面**一对合法的 \`key=present|absent\` 都没有**（词表外的名字不算数）`)
          + `。修法：在那段说明里加一行 \`@roster ${truth}\`（取值按常量实际情况；判据要求逐项对上）`,
        detail: { const: roster.name, claims: [], marker_lines: markerLines, suggested_marker: `@roster ${truth}` },
      })
    }
    // 1. 机读声明自身不许自相矛盾（同一段说明里两行 `@roster` 说法不一）
    for (const c of conflicts) {
      problems.push({
        code: CODES.rosterClaimViolated,
        message: `\`${roster.name}\` 上方那段说明里的 \`@roster\` 行**自相矛盾**（同一个 key 两行说法不一）：第 ${c.line} 行「${c.clause}」`
          + ` 涉及 ${JSON.stringify(c.keys)} —— 这种机读声明谁也读不出一个答案`,
        detail: { const: roster.name, key: c.keys.length === 1 ? c.keys[0] : undefined, keys: c.keys, line: c.line },
      })
    }
    // 2. 一致性（两个方向都判、都点名）
    for (const [key, claim] of claims) {
      const inConst = set.has(key)
      if (claim.polarity === 'absent' && inConst) {
        problems.push({
          code: CODES.rosterClaimViolated,
          message: `\`${roster.name}\`（第 ${parsed.line} 行的常量）里**有** \`${key}\`，`
            + `而它上方第 ${claim.line} 行的 \`@roster\` 说它\`不在\`这份兜底里 —— 读注释的人与跑代码的人拿到两个答案。`
            + '两边只能有一个是真的：要么把常量改成 '
            + `${JSON.stringify([...set].filter((k) => k !== key))}，要么把那句机读声明改成事实`,
          detail: { const: roster.name, key, claim_line: claim.line, const_line: parsed.line, keys: [...set] },
        })
      } else if (claim.polarity === 'present' && !inConst) {
        problems.push({
          code: CODES.rosterClaimViolated,
          message: `\`${roster.name}\`（第 ${parsed.line} 行的常量）里**没有** \`${key}\`，`
            + `而它上方第 ${claim.line} 行的 \`@roster\` 说它在 —— 兜底里少一项，配置没写名单时它就不会被注入`,
          detail: { const: roster.name, key, claim_line: claim.line, const_line: parsed.line, keys: [...set] },
        })
      }
    }
    // 2b. 散文可以留，但**不许说反**（散文不是声明，它只是不能与机读声明相反）
    for (const p of prose) {
      const claim = claims.get(p.key)
      if (claim === undefined || claim.polarity === p.polarity) continue
      problems.push({
        code: CODES.rosterClaimViolated,
        message: `\`${roster.name}\` 上方那段说明**自相矛盾**：第 ${p.line} 行的散文说 \`${p.key}\` `
          + `${p.polarity === 'absent' ? '不在' : '在'}这份兜底里，而第 ${claim.line} 行的 \`@roster\` 说它`
          + `${claim.polarity === 'present' ? '在' : '不在'} —— 散文不算声明，但它说的话必须与机读声明一致，`
          + '否则读注释的人与跑代码的人仍然拿到两个答案（`F-112` ② 的病）',
        detail: { const: roster.name, key: p.key, claim_line: claim.line, prose_line: p.line },
      })
    }
    // 3. 不许沉默：`requiredClaims` 里每个 key 都必须在**机读声明**里出现一次（在 / 不在都行）
    if (claims.size > 0) {
      for (const key of roster.requiredClaims) {
        if (!claims.has(key)) {
          problems.push({
            code: CODES.rosterNoClaimKey,
            message: `\`${roster.name}\` 上方那句 \`@roster\` **没有对 \`${key}\` 表态**（在 / 不在都行，但不能不提）—— `
              + '"把说错的那一对删掉"不是修好：那是把这一格改成静默，下次它真跑偏了也没人读得到。'
              + '写法见 `support/declared-surface.mjs` 文件头与 `CONTRACT.md` §7.2',
            detail: { const: roster.name, key, claims: [...claims.keys()] },
          })
        }
      }
    }
    // 4. 常量不是死名字（只声明不读 = 零读点的死常量）
    const uses = [...text.matchAll(new RegExp(`\\b${roster.name}\\b`, 'g'))].length
    if (uses < 2) {
      problems.push({
        code: CODES.rosterUnusedConst,
        message: `\`${roster.name}\` 在整份源码里只出现 ${uses} 次（声明自己那一次）—— 它**零读点**：`
          + '一个没人读的兜底名单，改成什么都不影响行为（与 `env.mjs:639` 那个死常量同一个病）',
        detail: { const: roster.name, uses },
      })
    }
    readings.rosters.push({
      const: roster.name,
      const_line: parsed.line,
      keys: parsed.keys,
      comment_lines: block.map((l) => l.line),
      marker_lines: markerLines,
      claims: [...claims].map(([key, c]) => ({ key, polarity: c.polarity, line: c.line })),
      prose: prose.map((p) => ({ key: p.key, polarity: p.polarity, line: p.line })),
      uses,
    })
  }
  return { problems, readings }
}

/**
 * ② 的控制面：**十四组**合成源码（每份都能跑通解析，只有"声明与事实"不同）。
 *
 * 为什么必须这么造：收口之后最可能出现的半修形态有六种 ——
 *   ① **只写散文、把 `@roster` 删掉**（散文若还能救它，这一格就等于没收紧）；
 *   ② 只改机读声明不改常量（或反过来）；③ 把说错的那一对整句删掉（沉默即合格）；
 *   ④ 同一个病挪到组员那张表；⑤ 常量被改成没人读的死名字；⑥ `@roster` 在、但一对都对不上。
 * 每一组都要求**恰好**命中它该命中的码，并**点名**那个 key / 那个常量。
 *
 * 🔴 第 3 组是这一票**反向**在合成层的同形：散文还在、`@roster` 没了 ⇒ 必须红。
 *    它绿了，就说明"散文仍然算声明" —— 收口没落地，这一跑的红绿都不算数。
 */
export function rosterControls() {
  /** 给人读的说明（**不含任何名单判断** —— 它参与不了判定，也不许撒谎）。 */
  const LEADER_PROSE = ['组长默认收到哪些、按什么顺序。这一份只是兜底：配置里没写名单时，注入按这一份走。']
  const MEMBER_PROSE = ['组员默认收到哪些。名单以下方常量本身为准；组员线不贴尾巴（⑤ 只贴组长）。']
  /** 审计现场的散文（说 `memory` 不在）：现在它只是散文，救不了这一格。 */
  const LEADER_PROSE_AUDIT = [
    '组长默认收到哪些、按什么顺序。这一份只是兜底。',
    '⚠️ **`memory`（共享记忆）刻意不在这份兜底里，两边都不在**：',
    '它是活体组合里声明的那一项。',
  ]
  const LEADER_MARKER_OK = [
    ...LEADER_PROSE,
    '@roster memory=present style=absent leader=present work-guidelines=present persona=present',
  ]
  const MEMBER_MARKER_OK = [...MEMBER_PROSE, '@roster memory=absent work-guidelines=present charter=present']
  const LEADER_ORDER_PRE = ['leader', 'work-guidelines', 'memory', 'leader', 'work-guidelines', 'persona']
  const LEADER_ORDER_FIXED = ['leader', 'work-guidelines', 'leader', 'work-guidelines', 'persona']

  /** 拼一份源码：注释块 + 常量 + N 处读点（`uses` = 1 表示零读点）。 */
  const srcOf = ({ leaderComment, leaderOrder, memberComment, memberOrder, leaderUses = 2, memberUses = 2 }) => [
    '/**',
    ...leaderComment.map((l) => ` * ${l}`),
    ' */',
    `const DEFAULT_LEADER_ORDER = ${JSON.stringify(leaderOrder).replace(/"/g, "'")}`,
    ...Array.from({ length: Math.max(0, leaderUses - 1) }, (_, i) => `const leaderUse${i} = DEFAULT_LEADER_ORDER`),
    '',
    ...memberComment.map((l) => `/** ${l} */`),
    `const DEFAULT_MEMBER_ORDER = ${JSON.stringify(memberOrder).replace(/"/g, "'")}`,
    ...Array.from({ length: Math.max(0, memberUses - 1) }, (_, i) => `const memberUse${i} = DEFAULT_MEMBER_ORDER`),
    '',
  ].join('\n')

  const cases = [
    // ── 绿的那两头：机读声明与常量逐项对上（两个修法都认）──────────────────────
    {
      name: '现役写法：`@roster` 与常量逐项对上（`memory=present` / `style=absent`）⇒ 0 问题（绿的那一头）',
      src: srcOf({
        leaderComment: LEADER_MARKER_OK, leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [],
      wantKeys: [],
      wantConst: null,
    },
    {
      name: '照契约改常量（把 `memory` 从兜底里去掉）+ `@roster memory=absent` ⇒ 0 问题（另一个修法也认）',
      src: srcOf({
        leaderComment: [...LEADER_PROSE, '@roster memory=absent style=absent'],
        leaderOrder: LEADER_ORDER_FIXED,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [],
      wantKeys: [],
      wantConst: null,
    },
    // ── 收口的核：`@roster` 必需、散文不算声明 ────────────────────────────────
    {
      name: '散文还在、`@roster` 那一行被删掉 ⇒ 红 `SURF-ROSTER-NO-CLAIM`（散文不算声明 —— **这一格就是收口**）',
      src: srcOf({
        leaderComment: LEADER_PROSE_AUDIT, leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterNoClaim],
      wantKeys: [],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    {
      name: '注释整段删掉 ⇒ 红 `SURF-ROSTER-NO-CLAIM`（没有声明就没有分叉）',
      src: srcOf({
        leaderComment: [], leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterNoClaim],
      wantKeys: [],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    {
      name: '`@roster` 行在、但一对合法的 `key=present|absent` 都没有（写成 `key:present`）⇒ 红 `SURF-ROSTER-NO-CLAIM`',
      src: srcOf({
        leaderComment: [...LEADER_PROSE, '@roster memory:present style:absent'], leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterNoClaim],
      wantKeys: [],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    // ── 不许沉默：要求表态的 key 一个都不许少 ────────────────────────────────
    {
      name: '`@roster` 漏了 `memory`（把说错的那一对删掉）⇒ 红 `SURF-ROSTER-NO-CLAIM-KEY`，点名 memory',
      src: srcOf({
        leaderComment: [...LEADER_PROSE, '@roster style=absent'], leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterNoClaimKey],
      wantKeys: ['memory'],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    {
      name: '`@roster` 漏了 `style`（要求表态的 key）⇒ 红 `SURF-ROSTER-NO-CLAIM-KEY`，点名 style',
      src: srcOf({
        leaderComment: [...LEADER_PROSE, '@roster memory=present leader=present'], leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterNoClaimKey],
      wantKeys: ['style'],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    // ── 一致性：机读声明说反了（两个方向）────────────────────────────────────
    {
      name: '`@roster memory=absent` 而常量里有它 ⇒ 红并点名 memory（机读行不是免检通行证）',
      src: srcOf({
        leaderComment: [...LEADER_PROSE, '@roster memory=absent style=absent'], leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterClaimViolated],
      wantKeys: ['memory'],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    {
      name: '反向：`@roster memory=present` 而常量里没有它 ⇒ 红并点名 memory（兜底少一项）',
      src: srcOf({
        leaderComment: [...LEADER_PROSE, '@roster memory=present style=absent'], leaderOrder: LEADER_ORDER_FIXED,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterClaimViolated],
      wantKeys: ['memory'],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    {
      name: '散文「不在这份兜底里」与 `@roster memory=present` 说反 ⇒ 红（散文不是声明，但它不许撒谎）',
      src: srcOf({
        leaderComment: [...LEADER_PROSE_AUDIT, '@roster memory=present style=absent'],
        leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterClaimViolated],
      wantKeys: ['memory'],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    {
      name: '两行 `@roster` 互相矛盾（`memory=present` 与 `memory=absent`）⇒ 红（机读声明自己读不出一个答案）',
      src: srcOf({
        leaderComment: [...LEADER_PROSE, '@roster memory=present style=absent', '@roster memory=absent'],
        leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
      }),
      wantCodes: [CODES.rosterClaimViolated],
      wantKeys: ['memory'],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    // ── 换位置再犯一次 / 常量侧的两个病 ──────────────────────────────────────
    {
      name: '同一个病换到组员那张表（常量偷加 `memory`，机读行说不在）⇒ 红并点名 `DEFAULT_MEMBER_ORDER`',
      src: srcOf({
        leaderComment: LEADER_MARKER_OK, leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'memory', 'charter'],
      }),
      wantCodes: [CODES.rosterClaimViolated],
      wantKeys: ['memory'],
      wantConst: 'DEFAULT_MEMBER_ORDER',
    },
    {
      name: '常量改成没人读的死名字（零读点）⇒ 红 `SURF-ROSTER-UNUSED-CONST`',
      src: srcOf({
        leaderComment: LEADER_MARKER_OK, leaderOrder: LEADER_ORDER_PRE,
        memberComment: MEMBER_MARKER_OK, memberOrder: ['work-guidelines', 'charter'],
        leaderUses: 1,
      }),
      wantCodes: [CODES.rosterUnusedConst],
      wantKeys: [],
      wantConst: 'DEFAULT_LEADER_ORDER',
    },
    {
      name: '两个常量都不见了 ⇒ 两条 `SURF-ROSTER-CONST-MISSING`，各点名一个常量',
      src: '/** 什么都读不到 */\nconst SOMETHING_ELSE = []\n',
      wantCodes: [CODES.rosterConstMissing, CODES.rosterConstMissing],
      wantKeys: [],
      wantConst: null,
    },
  ]

  const controls = []
  const failures = []
  for (const c of cases) {
    const got = fallbackRosterProblems(c.src)
    const codes = got.problems.map((p) => p.code).sort()
    const wantCodes = [...c.wantCodes].sort()
    const keys = got.problems.map((p) => p.detail?.key).filter((k) => typeof k === 'string').sort()
    const wantKeys = [...c.wantKeys].sort()
    const namedConsts = new Set(got.problems.map((p) => p.detail?.const).filter((x) => typeof x === 'string'))
    const ok = JSON.stringify(codes) === JSON.stringify(wantCodes)
      && JSON.stringify(keys) === JSON.stringify(wantKeys)
      && (c.wantConst === null || namedConsts.has(c.wantConst))
    controls.push({ name: c.name, want: wantCodes, got: codes, keys, consts: [...namedConsts], ok })
    if (!ok) {
      failures.push(`${CODES.rosterControl}：控制面「${c.name}」期望码 ${JSON.stringify(wantCodes)} / 点名 key ${JSON.stringify(wantKeys)}`
        + ` / 点名常量 ${JSON.stringify(c.wantConst)}，实得 ${JSON.stringify(codes)} / ${JSON.stringify(keys)} / ${JSON.stringify([...namedConsts])}`
        + ' —— 判据在这条半修形态上翻不了面，这一跑的红绿都不算数')
    }
  }
  return { controls, failures }
}
