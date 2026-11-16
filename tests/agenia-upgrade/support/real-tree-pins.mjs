/**
 * **真树冻结读数（REAL-TREE PINS）** —— 这一份是**数据**，不是代码。
 *
 * 为什么单独一份（`bug-20261116-18…-28（本卡原写 -17：那个号从未登记，见 11-16 log）`）：
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
  commit: 'e83c88131e9df129f3a9803edd3368f1279ac699',
  commit_subject: 'fix(contract): ticket the C2 drift left by the card fix; re-pin +1',
  tree: 'HEAD e83c881 那棵树 + **一笔未提交的账本写入**（`bug-20261116-35` 在 14:29:31 被组长处置成'
    + '`deferred`，带 `due_at` / `owner` / `next_step`）—— 立案不动这两格，处置才动。'
    + '⚠️ 同一次写入之后 `账本/缺陷/INDEX.md` 还没重算，`决议-check --op check` 会报一条 `INDEX-ROW-MISMATCH`；'
    + '那是账本侧的重算，不是这一份的数据。',
  measured_at: '2026-11-16T14:58:59+08:00',
  measured_by: 'node presets/agenia/bin/决议-check.mjs --op check --json',
}

// ── 一、三册：一本册一个具名常量 ─────────────────────────────────────────────
/** 产品册条数（`check --json` 的 `books.产品.entries`）。 */
export const BOOK_PRODUCT_ENTRIES = 5
/** 缺陷册条数 —— **票数**，不是日文件数（`books.缺陷.entries`）。 */
export const BOOK_BUG_ENTRIES = 194
/** 构案册条数（`books.构案.entries`）。 */
export const BOOK_SCHEME_ENTRIES = 11

// ── 二、缺陷链的五组读数（`chain.bug.*`）────────────────────────────────────
/** 有结论、且由**生效构案**兜底的票数。 */
export const BUG_CLOSED_BY_SCHEME = 1
/** 有结论、由**判假**兜底的票数。 */
export const BUG_CLOSED_JUDGED_FALSE = 0
/** 有结论、由 `历史`（只由迁移写）兜底的票数。 */
export const BUG_LEGACY_CLOSED = 52
/** 暂缓、且是**本迁移之后**登记的票数（`deferred_open`）。 */
export const BUG_DEFERRED_OPEN = 97
/** 暂缓、且是**迁移带过来的冻结票**数（`legacy_frozen`）。 */
export const BUG_LEGACY_FROZEN = 43
/** 上面 `deferred_open` 里**带结构化落地计划**（`due_at`/`owner`/`next_step`）的票数。 */
export const BUG_DEFERRED_OPEN_STRUCTURED = 39
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
    moved_by: '173→186：+11（`bug-20261116-18`…`-28`，构案 0016 §② 的 11 份存量超限各挂一张）+1（`bug-20261116-29` · 组长 12:2x 登记）+1（`bug-20261116-30` · 第 4 关 r2 · M-2 的 `说明.md` 第 12 份存量，随 02285a2）',
  },
  {
    key: 'books.构案.entries',
    what: '构案册条数',
    value: BOOK_SCHEME_ENTRIES,
    moved_by: '10→11：新写一条构案 `账本/构案/0016-文件长度上限.md`（组长 11:52 落地，随 e28ac49 提交）',
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
    moved_by: '77→95：+11（文件长度那 11 张票全部按 `deferred` 记账）+1（`bug-20261116-29` · 组长 12:2x 登记）+1（`bug-20261116-30` · `说明.md` 第 12 份存量，随 02285a2）+1（`bug-20261116-31` · SLA 积压票，随 011550d）+3（`bug-20261116-32` / `-33` / `-34` · 0016 r2 复审的三张跟进，随 84f1dd2）+1（`bug-20261116-35` · 组长 14:29:31 处置成 `deferred` 的这张契约漂移票——立案不动这两格，处置才动）',
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
    moved_by: '19→37：+11（11 张票都带 `due_at` / `owner` / `next_step`，`due_at` 散在 2026-11-20…11-30）+1（`bug-20261116-29`，`due_at` 2026-11-18）+1（`bug-20261116-30`，`due_at` 2026-12-01 · `说明.md`）+1（`bug-20261116-31`，`due_at` 2026-11-17）+3（`bug-20261116-32` / `-33` / `-34`，`due_at` 2026-11-18 / 11-18 / 11-19）+1（`bug-20261116-35`，`due_at` 2026-11-17 · 组长 14:29:31 处置）',
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
 *   这三类数据动作都会推它：**开票**（缺陷册 +1）· **落决定**（产品/构案册 +1）· **处置**（五组位移）。
 */
export const PIN_DRIFT_ADVICE = '先看是不是有人开了票 / 落了决定；是 ⇒ 同批重钉并记账（唯一改点：`support/real-tree-pins.mjs` 那一条 + 当天 `log.md`）'

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
      problems.push(`${at} 没有 moved_by —— **没有具名数据动作就不许钉**（bug-20261116-18…-28（本卡原写 -17：那个号从未登记，见 11-16 log））`)
    }
  }
  return problems
}

// 2026-11-16 12:2x 组长重钉：+1 `bug-20261116-29`（INS-02 抖动 / `_tmp` 在 CODE 面）

// 2026-11-16 14:0x 组长重钉：+1 ug-20261116-31（SLA 积压 32 条，台账少了一道评估手续）

// 2026-11-16 14:1x 组长重钉：+3（0016 r2 评审的 N-2 / M-3 收窄 / 188-186 计数）

// 2026-11-16 14:3x 组长重钉：+1（-35 CONTRACT-C2 契约漂移）

// 2026-11-16 14:5x 测试岗重钉：`bug-20261116-35` 14:29:31 被组长处置成 `deferred` ⇒ 暂缓 94→95 · 带计划 36→37
// （立案不动这两格；处置才动。`账本/缺陷/INDEX.md` 的重算是账本侧的事，不在这份钉表里）

// 2026-11-16 15:5x 组长重钉：+2（`-33` 留的两件：CONTRACT §17.2 描述窄、FCAP-01 缺 `.team/`）

// 2026-11-16 16:0x 组长重钉：+1（`-38` C2 §3.7.1 旧口径）、-1 暂缓（`-31` 改判 adopted · 构案 0017 落地）
