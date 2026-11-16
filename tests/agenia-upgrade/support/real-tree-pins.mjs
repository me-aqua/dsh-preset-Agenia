/**
 * **真树冻结读数（REAL-TREE PINS）** —— 这一份是**数据**，不是代码。
 *
 * 为什么单独一份（`bug-20261116-17`）：
 *   判据里原来散着几个硬编码数（157 · 52 / 62 / 43 / 4 · 153），它们是**活树的读数**。
 *   任何人**开一张票**，那些数就动 —— 于是一次诚实的开票会把套件读成 `LDG-03 CHAIN-READING-MISSING`，
 *   而那个码长得像「产品的链读数丢了」。2026-11-16 实测：`-01` 票在套件跑到一半时落盘 ⇒
 *   158/63/5 对 157/62/4 ⇒ RED 1。**那不是代码坏了，是账本多了一条。**
 *
 * 所以这一份负责三件事：
 *   ① 每条读数一个**具名常量**（一本册一个），值只在这里写一次；
 *   ② 每条读数带上它**冻在哪儿**：`day` + `commit` + `moved_by`（谁把它从上一个值推到现在）；
 *   ③ 漂移时的报文由 `pinDriftMessage()` 一处产出 —— 它说「钉住的是什么」，不装作代码坏了。
 *
 * 🔴 **重钉的唯一动作**：改本文件里那条常量 + 它的 `moved_by`，并把 old→new 记进
 *   `.team/test/<当天>/log.md`。**没有具名数据动作就不许改数**（`pinLedgerProblems()` 会红）。
 * 🔴 这里**不放**任何由读数派生的恒等式（例如「closed = 三组之和」）—— 那些是判据自己算的，
 *   跟着数据走，不进这张表。
 */

/**
 * 这一批读数冻在哪儿。
 *
 * ⚠️ `commit` 是**量读数那一刻活树的 HEAD**；`账本/` 下当天的写入在量的时候还没提交
 *   （`git status` 里是 `M` / `??`）—— 所以 `tree` 那一行要把这件事说清楚，
 *   不然下一个人会以为"提交 df4f6a3 里就是 173 条"。
 */
export const PIN_FROZEN = {
  day: '2026-11-16',
  commit: 'df4f6a3892e480256574ec1f2e19490021d4dcdb',
  commit_subject: '构案 0012 r8：bug-dispose 拒调用方写 历史（N-1 / bug-20261115-06）',
  tree: '活树 = HEAD df4f6a3 + 当天未提交的账本写入（产品 0014 · 构案 0015 · 缺陷/2026-11-16.json）',
  measured_by: 'node presets/agenia/bin/决议-check.mjs --root=. --json',
}

// ── 一、三册：一本册一个具名常量 ─────────────────────────────────────────────
/** 产品册条数（`check --json` 的 `books.产品.entries`）。 */
export const BOOK_PRODUCT_ENTRIES = 5
/** 缺陷册条数 —— **票数**，不是日文件数（`books.缺陷.entries`）。 */
export const BOOK_BUG_ENTRIES = 173
/** 构案册条数（`books.构案.entries`）。 */
export const BOOK_SCHEME_ENTRIES = 10

// ── 二、缺陷链的五组读数（`chain.bug.*`）────────────────────────────────────
/** 有结论、且由**生效构案**兜底的票数。 */
export const BUG_CLOSED_BY_SCHEME = 1
/** 有结论、由**判假**兜底的票数。 */
export const BUG_CLOSED_JUDGED_FALSE = 0
/** 有结论、由 `历史`（只由迁移写）兜底的票数。 */
export const BUG_LEGACY_CLOSED = 52
/** 暂缓、且是**本迁移之后**登记的票数（`deferred_open`）。 */
export const BUG_DEFERRED_OPEN = 77
/** 暂缓、且是**迁移带过来的冻结票**数（`legacy_frozen`）。 */
export const BUG_LEGACY_FROZEN = 43
/** 上面 `deferred_open` 里**带结构化落地计划**（`due_at`/`owner`/`next_step`）的票数。 */
export const BUG_DEFERRED_OPEN_STRUCTURED = 19
/** 迁移归档里的 `历史` 条数（`legacy_disposed`）—— 归档是回滚点，不随事件流增长。 */
export const LEGACY_DISPOSED = 153

/**
 * **钉账**（唯一改点）：`key` = 报文里点名用的路径 · `value` = 上面对应的具名常量 ·
 * `moved_by` = 谁把它从上一个钉点推到这里（**必须是能指认的数据动作**）。
 */
export const PIN_LEDGER = [
  {
    key: 'books.产品.entries',
    what: '产品册条数',
    value: BOOK_PRODUCT_ENTRIES,
    moved_by: '4→5：新写一条产品决议 `账本/产品/0014-三册账本-分层与分发.md`',
  },
  {
    key: 'books.缺陷.entries',
    what: '缺陷册票数',
    value: BOOK_BUG_ENTRIES,
    moved_by: '157→173：+16 票（`bug-20261116-01`…`-16`，11-15 两份每日评审登记进 `账本/缺陷/2026-11-16.json`）',
  },
  {
    key: 'books.构案.entries',
    what: '构案册条数',
    value: BOOK_SCHEME_ENTRIES,
    moved_by: '9→10：新写一条构案 `账本/构案/0015-删掉历史写入口.md`',
  },
  {
    key: 'chain.bug.closed_by_scheme',
    what: '构案兜底的票数',
    value: BUG_CLOSED_BY_SCHEME,
    moved_by: '0→1：`bug-20261115-06` 经 `bug-reopen` → `bug-dispose`（adopted）落进构案 0015',
  },
  {
    key: 'chain.bug.closed_judged_false',
    what: '判假兜底的票数',
    value: BUG_CLOSED_JUDGED_FALSE,
    moved_by: '未动（0→0）：今天没有新的判假处置',
  },
  {
    key: 'chain.bug.legacy_closed',
    what: '历史兜底的票数（迁移）',
    value: BUG_LEGACY_CLOSED,
    moved_by: '未动（52→52）：迁移票的结论一条没改',
  },
  {
    key: 'chain.bug.deferred_open',
    what: '暂缓中的新票数',
    value: BUG_DEFERRED_OPEN,
    moved_by: '62→77：+16（新票全部按 `deferred` 记账）−1（`bug-20261115-06` 由 deferred 转 closed）= +15',
  },
  {
    key: 'chain.bug.legacy_frozen',
    what: '暂缓中的迁移冻结票数',
    value: BUG_LEGACY_FROZEN,
    moved_by: '未动（43→43）：迁移带过来的冻结票一条没重开',
  },
  {
    key: 'chain.bug.deferred_open_structured',
    what: '暂缓中新票带落地计划的条数',
    value: BUG_DEFERRED_OPEN_STRUCTURED,
    moved_by: '4→19：+16（新票都带 `due_at`/`owner`/`next_step`）−1（`bug-20261115-06` 出账）= +15',
  },
  {
    key: 'legacy_disposed',
    what: '迁移归档里的历史条数',
    value: LEGACY_DISPOSED,
    moved_by: '未动（153→153）：归档是回滚点，事件流再长也不改它',
  },
]

/** `key → {what, value, moved_by}`（取数与报文都走这一份）。 */
export const PINS_BY_KEY = new Map(PIN_LEDGER.map((p) => [p.key, p]))

/**
 * 从 `决议-check --json` 的读数里**取**这十条（单一取数口）。
 * 取不到就是 `null` —— 判据会把它读成"漂了"，不是"没有这一格"。
 */
export function pinReadingsOf(json) {
  const chain = json?.chain?.bug ?? null
  const books = json?.books ?? null
  const entriesOf = (book) => books?.[book]?.entries ?? null
  return {
    'books.产品.entries': entriesOf('产品'),
    'books.缺陷.entries': entriesOf('缺陷'),
    'books.构案.entries': entriesOf('构案'),
    'chain.bug.closed_by_scheme': chain?.closed_by_scheme ?? null,
    'chain.bug.closed_judged_false': chain?.closed_judged_false ?? null,
    'chain.bug.legacy_closed': chain?.legacy_closed ?? null,
    'chain.bug.deferred_open': chain?.deferred_open ?? null,
    'chain.bug.legacy_frozen': chain?.legacy_frozen ?? null,
    'chain.bug.deferred_open_structured': chain?.deferred_open_structured ?? null,
    legacy_disposed: json?.legacy_disposed ?? null,
  }
}

/**
 * 漂移报文 —— **一条漂移一行**，形状固定：
 *   `[真树] <key> 钉住 <值>（冻于 <day> · 提交 <sha7> · 归属：<moved_by>）；实得 <got> —— <动作>`
 *
 * 🔴 第二句是这报文存在的理由：读的人第一反应必须是「有人在动账本」，
 *   不是「产品的链读数坏了」。**别把这句话删成"期望值不符"。**
 */
export const PIN_DRIFT_ADVICE = '先看是不是有人开了票；是 ⇒ 同批重钉并记账（唯一改点：`support/real-tree-pins.mjs` 那一条 + 当天 `log.md`）'

export function pinDriftMessage(pin, got) {
  return `[真树] \`${pin.key}\` 钉住 ${pin.value}（冻于 ${PIN_FROZEN.day} · 提交 ${PIN_FROZEN.commit.slice(0, 7)}`
    + ` · 归属：${pin.moved_by}）；实得 ${JSON.stringify(got)} —— ${PIN_DRIFT_ADVICE}`
}

/**
 * 钉账自己的形状（谁想加一条没有归属的钉，这里当场红）。
 * 判的是**表**，不是数据 —— 所以它红的时候是"这一份写坏了"，不是"账本动了"。
 */
export function pinLedgerProblems() {
  const problems = []
  const seen = new Set()
  if (!/^[0-9a-f]{40}$/.test(String(PIN_FROZEN.commit ?? ''))) {
    problems.push(`PIN_FROZEN.commit 不是 40 位 sha：${JSON.stringify(PIN_FROZEN.commit ?? null)}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(PIN_FROZEN.day ?? ''))) {
    problems.push(`PIN_FROZEN.day 不是 YYYY-MM-DD：${JSON.stringify(PIN_FROZEN.day ?? null)}`)
  }
  if (PIN_LEDGER.length === 0) problems.push('PIN_LEDGER 是空的 —— 空表会让整条真树腿静默绿')
  for (const pin of PIN_LEDGER) {
    const at = `PIN_LEDGER[${JSON.stringify(pin.key ?? null)}]`
    if (typeof pin.key !== 'string' || pin.key.trim() === '') problems.push(`${at} 没有 key`)
    else if (seen.has(pin.key)) problems.push(`${at} 重复登记（同一个 key 两条钉 ⇒ 总有一条没人读）`)
    else seen.add(pin.key)
    if (!Number.isInteger(pin.value)) problems.push(`${at} 的 value 不是整数：${JSON.stringify(pin.value ?? null)}`)
    if (typeof pin.what !== 'string' || pin.what.trim() === '') problems.push(`${at} 没有 what（报文里要说这是哪一格）`)
    if (typeof pin.moved_by !== 'string' || pin.moved_by.trim() === '') {
      problems.push(`${at} 没有 moved_by —— **没有具名数据动作就不许钉**（bug-20261116-17）`)
    }
  }
  return problems
}
