/**
 * `LOC-02` / `LOC-03` / `LOC-04` · **`F-156` 第二轮（门 2 · 2026-10-24）** —— `local-mark` 的**产物锚点闸**三条规则。
 *
 * 病根（证据：`.team/retro/2026-10-24/技术评审.md` 的 `F1`–`F3`，两次复现）：
 *   今天这一把闸对三个字段**一视同仁**地要 `findings_path` / `findings_set_sha256` / `findings_count`，
 *   全会话评审与记忆复核根本不产 findings 产物 ⇒ 那两个节点**无法诚实落地**（唯一能过的办法是编一份
 *   findings 文件加一个 64 位摘要）；而 `findings_count` 收了却**没人核**；`report_path` 只判"在工作区里 + 存在"，
 *   ⇒ 工作区里任何文件（例如 `README.md`）都能当报告锚点 —— 同一条路径三种写法三种下场。
 * 老板 2026-10-24 的裁定（选项 1）：**要求按字段** —— `technical` 要 findings；`memory-review` / `conversation`
 * 只要报告。外加 `F2`（`findings_count` 必须与产物条数对账）与 `F3`（锚点必须在 `.team/` 下）。
 *
 * 三格 · 三条规则（**一格一条规则**，红的时候一眼看得出是哪一条）：
 *
 *   `LOC-02` · **按字段的必填 + 三件套要么都给**（六个输入）：
 *     `A` `memory-review` **只交报告**（真路径 + 真 SHA256，**不带 findings**）⇒ `done`，盘上节点
 *         `report_path` / `report_sha256` 是两个真锚点，`findings_path` / `findings_set_sha256` / `findings_count`
 *         **必须是 `null`**（不许为了过闸编一个）；
 *     `B` `conversation` **只交报告** ⇒ 与 `A` 同；
 *     `C` `technical` **不带 findings** ⇒ **拒** `E_ARG_SCHEMA` · exit 2；节点停在 `running`（claim 痕迹保留）、
 *         五个锚点一个都不许落、**状态文件的字节一个都不许变**（与 `LOC-01` 的 `L1:B` 同一个读法）；
 *     `D` `technical` **带一份真 findings 产物** ⇒ `done`，五个锚点逐项落在节点上；
 *     `E` `memory-review` **只给 `findings_count`**（三件套缺 path 与 set）⇒ **拒** `E_ARG_SCHEMA` · exit 2 · 零写入
 *         （"要么三件都给、要么都不给"：只给一半会在节点上留下一个没有产物的锚点）；
 *     `F` `conversation` **给了 `findings_path` + `findings_set_sha256`、没给 `findings_count`**（半套）⇒ 同上。
 *     ⇒ 两个方向都在：只交报告的字段**不许**被逼着编摘要（`A`/`B`），技术评审**不许**丢掉 findings（`C`/`D`），
 *     而"给一半"两个字段都**不许**收（`E`/`F`）。
 *
 *   `LOC-03` · **`findings_count` 必须与产物条数对账 + 产物读不出来**（六个输入，全是 `technical` + 一份 findings 文件）：
 *     `A` 盘上 3 条 + `findings_count: 0` ⇒ 拒；`B` 盘上 3 条 + `findings_count: 9` ⇒ 拒（**两个方向都拒**：
 *         只挡"多报"的半修在 `A` 上会漏，而 `0` 恰好是最容易被读成"查过了、没问题"的那个数）；
 *     `C` 3 条 + `3` ⇒ `done`（诚实计数被收下）；`D` 空 findings + `0` ⇒ `done`（"零条发现"是合法产物，
 *         不许被"非空才算数"的半修挡掉）。条数不符的拒绝码取 `E_ARG_SCHEMA` —— 这个字段的形状错误就是它；
 *     `E` findings 文件**在盘上、是合法 JSON、但没有 `findings` 数组** ⇒ **拒** `E_DATA_CORRUPT` · exit 7 · 零写入；
 *     `F` findings 文件**是半截 JSON**（`JSON.parse` 抛错）⇒ 同上。
 *     ⇒ "文件不在"（`E_DATA_MISSING`）与"文件在但读不出来"（`E_DATA_CORRUPT`）是**两个**诊断，不许混成一个。
 *
 *   `LOC-04` · **锚点必须落到 `<工作区>/.team/` 里的一个真文件，落盘记规范形**（`.team/` 首段固定小写、
 *     其余段按磁盘真名；十一个输入，全是 `technical`，
 *     findings 那一侧全部合法 —— 只变 `report_path` 的拼法）：
 *     `A` 规范形 `.team/retro/2026-10-24/技术评审.md` ⇒ `done`（记下的就是它自己）；
 *     `B` `README.md`（工作区根下**存在**的无关文件，SHA256 也是真的）⇒ 拒（落在 `.team/` **外**）；
 *     `C` `./.team/...`（同一个文件、多一个 `./`）⇒ **收 + 记规范形**；
 *     `D` `retro/...`（**`.team` 相对**写法 —— `RCP-03` / `VRF-02` 用的就是这一种）⇒ **收 + 记规范形**；
 *     `E` `.team\retro\...`（反斜杠写法，同一个文件）⇒ **收 + 记规范形**；
 *     `F` `.team/.../不存在.md`（前缀对、文件不在）⇒ 拒（缺）；
 *     `G` `<工作区绝对路径>\.team\retro\...`（绝对路径、在 `.team/` 里）⇒ **收 + 记规范形**；
 *     `H` `<运行根>\outside-loc04\技术评审.md`（绝对路径、**包外**）⇒ 拒（落在 `.team/` 外）；
 *     `I` `.team/../README.md`（`..` 穿出 `.team/`）⇒ 拒（解析后落在 `.team/` 外）；
 *     `J` `retro/.../不存在.md`（`.team` 相对、文件不在）⇒ 拒（缺）；
 *     `K` **`.TEAM/retro/2026-10-24/技术评审.md`**（同一个文件、**前缀换大小写**）⇒ **收 + 记规范形**
 *     （首段落到小写 `.team/`，后面的段按磁盘真名 —— `retro/2026-10-24/技术评审.md` 原样）。
 *     🔴 `K` 这一条钉的是**位置判定不分大小写**（本平台是 Windows：`.TEAM` 与 `.team` 是同一个目录）——
 *     判据必须是"解析后落在 `.team/` 里"（跟平台路径语义走），不是字符串前缀比较；字符串前缀比较会把它判成"在外"。
 *     它今天由 `lib/local-state.mjs::insideTeam()`（`path.relative`）提供；`KQ6` 把那把尺子换回前缀比较 ⇒ 只翻 `K`
 *     （所以这一条将来即使全绿，也**能翻面**）。
 *     🔴 **五个"拒"必须是同一个诊断 `E_DATA_MISSING` · exit 7**（缺 / 在外 / 穿出去 / 拼错，读的人不必猜是哪一种）；
 *     🔴 **六个"收"必须把节点上的 `report_path` 记成规范形**（**首段固定小写 `.team/`、其余段按磁盘真名**、正斜杠）——
 *     调用方写 `./.team/…` / `retro/…` / `.team\…` / 绝对路径 / `.TEAM/…`，盘上记的都必须是那一个字符串
 *     （`readings.canonical_store` + `readings.case_folding` 是这一条的读数：`fed ≠ stored` 而 `stored === canonical`）。
 *     ⚠️ 这一格固定用 `technical` 且 findings 一侧全合法、`artifact_paths` 也一律给规范形：
 *     **只让 `report_path` 变**，否则拒绝原因会串到别的规则上。
 *
 * 三条阳性对照 + 六把刀（刀打在**本文件里那份照裁定写的最小实现**上，`presets/**` 一个字节都不碰）：
 *   · `REF`：`claimDoc` / `markDoc` / `readOutputOf`；`markDoc` **自己读盘**（存在性、`report_sha256` 与字节比对、
 *     解析后必须落在 `<工作区>/.team/` 里、落盘记规范形、findings 三件套要么都给要么都不给、findings 条数）——
 *     证明这三条规则**是可实现的**、且不是"只有今天这份实现才过"。二十三个输入喂它必须**全部**成立。
 *   · `KQ1-FIELD-BLIND`（三个字段都要 findings ⇒ 退回到"一视同仁"的形状）⇒ 只该翻 `LOC-02:A` / `LOC-02:B`；
 *     `KQ2-TECH-WITHOUT-FINDINGS`（三个字段谁都不要 findings）⇒ 只该翻 `LOC-02:C`
 *     （没有它，`C`/`D` 那两条"technical 仍然要 findings"的腿是**翻不了面的绿**）；
 *     `KQ3-COUNT-NOT-RECONCILED`（收下 count、不与条数对账）⇒ 只该翻 `LOC-03:A` / `LOC-03:B`；
 *     `KQ4-NO-TEAM-PREFIX`（不再要求锚点落在 `.team/` 下 ⇒ 工作区里任何存在的文件都收）⇒ 只该翻
 *     `LOC-04:B` / `LOC-04:H` / `LOC-04:I`（`F` / `J` 仍因"文件不在"被拒）；
 *     `KQ5-STORE-AS-WRITTEN`（验的时候归一化、**落盘却记调用方怎么写**）⇒ 只该翻
 *     `LOC-04:C` / `LOC-04:D` / `LOC-04:E` / `LOC-04:G` / `LOC-04:K`（`A` 本来就是规范形 ⇒ 不翻；`F`/`J` 根本没落地；
 *     `K` 也在里面，因为 `.TEAM/…` 同样是"收下了但拼法非规范"的那种输入 —— 与 `KQ6` 翻它的**理由不同**：
 *     那一把是把"收不收"判错，这一把是"收下了却记错"）；
 *     `KQ6-CASE-SENSITIVE-CONTAINMENT`（把"在不在 `.team/` 里"退回**字符串前缀比较**）⇒ 只该翻 `LOC-04:K`
 *     （`.TEAM/…` 被当成"在外"；其余输入的 `/` 前缀本来就是小写 `.team` ⇒ 前缀比较也过）。
 *     ⚠️ 这六个 id 带 **`KQ`** 前缀：`LOC-01` 那五把是 `K1–K5`（`CONTRACT.md` §12.4 的表点名它们），
 *     两套刀**同名不同刀**会让"`K4` 翻了哪几格"查串（第 4 关复审 round 2 的 `F5`）。
 *     向量是**先按规则推、跑完再对**；对不上 ⇒ `KNIFE-WRONG-VECTOR`（多翻 = 那一支与别的规则共用判据，
 *     少翻 = 这刀没切到它）。六把刀在**全部二十三个输入**上量（所以"只翻本格"这件事本身是读数，不是声明）。
 *
 * 边界（这三格**不覆盖**什么，写清，别假装更宽）：
 *   1. **`findings_path` 的拼法归一化没量**：三格的 findings 产物一律给**规范形**（`.team/…`），
 *      `LOC-04` 只让 `report_path` 换拼法 ⇒ "findings 那一侧也收 teamDir 相对 / 反斜杠"这一条**没被量**，
 *      别把这里的绿读成"它也管 findings 的归一化"。
 *   2. **不判** `findings_set_sha256` 的**内容复算**（`lib/receipt.mjs::findingsSetVerdict` / `VRF-02` 的事）：
 *      本文件喂进去的值是**真的**（三条发现按 Q10 算出来），但闸今天不做内容复算 —— 那一面归 `VRF-02`。
 *   3. **不判** `findings_count` 的**语义**（"三条发现"是不是真的三条值得看的发现）—— 只判它与产物条数一致。
 *   4. **不判** `stale`（`running` 过期是健康卡算的）· 不判 `local-fail` / `local-receipt-set` · 不判锁与原子写
 *      （都是 `LOC-01` / `HLT-02` / `STO-*` 的格子）。
 *   5. **CLI 层没有 REF 对应物**：`E_DATA_MISSING` / exit 7 / `E_ARG_SCHEMA` / exit 2 这些"谁拒、退几"只有生产臂有；
 *      刀只能证"文档层那一半"能翻面。生产臂的判据本身来自真子进程的退出码与错误码。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256File, sha256Text } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { fixtureDir, q10Digest } from '../support/verify-recompute.mjs'
import { loadStagedModule, runLocal, stagingExists, stagingPath, writeFixture } from '../support/sut.mjs'

before(() => {
  preflight()
})

// ── 现场常量（都从裁定 / 契约 / 盘上事实里来，不从"我算的"里取）──────────────────────
const DAY = '2026-10-24'
const PROJECT = 'harness'

/** 三个节点在文件里的键名（`LOCAL_FIELDS`）与 CLI 的 `--field` 拼法各写一份 —— 两者**故意不同**。 */
const FIELD_CLI = { conversation: 'conversation', technical: 'technical', memory_review: 'memory-review' }
const FIELDS = ['memory_review', 'conversation', 'technical']

/**
 * 输入的时刻：第 `i` 条输入的 claim / 落地时刻（**互不相同**，`liveness_at` 的读数因此能指认是哪一条）。
 * `clockAt(i, 0)` 是 claim，`clockAt(i, 4)` 是落地（差 4 分钟）。
 */
const clockAt = (i, plus) => `2026-10-24T${String(10 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 10 + plus).padStart(2, '0')}:00+08:00`

// ── 产物（**真字节**）：报告 / findings（三条 / 零条）/ 工作区根下的无关文件 / 工作区外的文件 ─────────
const REPORT_TEXT = '# 技术评审报告（LOC-02 / 03 / 04 的产物）\n\n窗口：2026-10-23 04:00 – 2026-10-24 04:00。\n正文三行。\n'
const REPORT_REL = '.team/retro/2026-10-24/技术评审.md'
const FINDINGS_REL = '.team/retro/2026-10-24/技术评审.findings.json'
const FINDINGS_EMPTY_REL = '.team/retro/2026-10-24/技术评审.findings.empty.json'
const README_REL = 'README.md'
const OUTSIDE_REL_IN_RUN = 'outside-loc04/技术评审.md'
const REPORT_SHA = sha256Text(REPORT_TEXT)
const README_TEXT = '# 工作区根下的无关文件\n\n它不是任何作业的产物。（`LOC-04` 用它当"不带 `.team/` 的报告锚点"。）\n'
const README_SHA = sha256Text(README_TEXT)
const OUTSIDE_TEXT = '# 工作区之外的一份文件\n\n它在运行根下、工作区外。（`LOC-04` 用它当"绝对路径、包外"的锚点。）\n'
const OUTSIDE_SHA = sha256Text(OUTSIDE_TEXT)

/** 三条**真的**发现（形状照 `lib/receipt.mjs::parseFindings` 吃的那个产物）。 */
const ENTRIES_3 = [
  {
    id: 'LOC-24-1',
    title: '会话评审与记忆复核无法落地',
    severity: 'P1',
    evidence: [{ kind: 'file', ref: '.team/retro/2026-10-24/技术评审.md' }],
    summary: '两个字段不产 findings，闸却要求 findings 三件套 ⇒ 只能编一份。',
  },
  {
    id: 'LOC-24-2',
    title: 'findings_count 收了不核',
    severity: 'P2',
    evidence: [{ kind: 'cmd', ref: 'agenia-local.mjs --op local-mark --field technical' }],
    summary: '盘上三条、payload 写 0，照样 done。',
  },
  {
    id: 'LOC-24-3',
    title: '锚点不要求在 .team/ 下',
    severity: 'P3',
    evidence: [{ kind: 'log', ref: 'state/local/2026-10-24.json' }],
    summary: 'README.md 也能当报告锚点。',
  },
]
const ENTRIES_0 = []
const SET_SHA_3 = q10Digest(ENTRIES_3)
const SET_SHA_0 = q10Digest(ENTRIES_0)
/** findings 产物的盘上字节：自己声明 `report_sha256` 与 `findings_set_sha256`（与真实作业产物同形）。 */
const findingsText = (entries) => `${JSON.stringify({
  schema: 1,
  day: DAY,
  report_path: REPORT_REL,
  report_sha256: REPORT_SHA,
  generated_at: '2026-10-24T13:50:00+08:00',
  findings: entries,
  findings_set_sha256: q10Digest(entries),
}, null, 2)}\n`
const FINDINGS3_TEXT = findingsText(ENTRIES_3)
const FINDINGS0_TEXT = findingsText(ENTRIES_0)
/**
 * 两份**读不出来**的 findings 产物（`LOC-03:E` / `:F`）：
 * 一份是合法 JSON 但没有 `findings` 数组，另一份是半截 JSON。生产的 `findingsCountInFile()` 两种都返回 `null`
 * ⇒ `E_DATA_CORRUPT`（`lib/local-state.mjs` 的 `findings 文件里没有 findings 数组` 那一支）。
 * ⚠️ 用 `E_DATA_MISSING` 会把"文件不在"与"文件在但读不出来"混成一个诊断 —— 这两份文件**都在盘上**。
 */
const FINDINGS_BADJSON_REL = '.team/retro/2026-10-24/技术评审.findings.noarray.json'
const FINDINGS_TRUNCATED_REL = '.team/retro/2026-10-24/技术评审.findings.truncated.json'
const FINDINGS_BADJSON_TEXT = `${JSON.stringify({ schema: 1, day: DAY, note: '（没有 findings 数组）' }, null, 2)}\n`
const FINDINGS_TRUNCATED_TEXT = '{\n  "schema": 1,\n  "day": "2026-10-24",\n  "findings": [\n'

/**
 * 节点的 **15 个必填键**（`presets/agenia/lib/local-state.mjs:45-49` 的 `NODE_REQUIRED`，逐字抄）
 * —— 手抄是刻意的：拿被测模块的常量当期望值就是自证。
 * ⚠️ 加性键（`receipt_versions` / `failure_history`）**不在这里**：那一行注释明写"测试不许断言名字"。
 */
const NODE_REQUIRED = [
  'claim', 'state', 'job_id', 'liveness_at', 'failure_reason',
  'report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count',
  'receipt_path', 'receipt_sha256', 'receipt_version', 'ticket_ids', 'artifact_paths',
]
const NODE_NULL_WHEN_EMPTY = [
  'claim', 'job_id', 'liveness_at', 'failure_reason',
  'report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count',
  'receipt_path', 'receipt_sha256', 'receipt_version',
]
/** 被拒的 `local-mark` 一个锚点都不许落（五个）。 */
const ANCHOR_KEYS = ['report_path', 'report_sha256', 'findings_path', 'findings_set_sha256', 'findings_count']

// ── 小工具 ────────────────────────────────────────────────────────────────
const statePathOf = (ws) => path.join(ws, '.team', 'state', 'local', `${DAY}.json`)
const statePathTail = (p) => String(p ?? '').replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean).slice(-4).join('/')
const EXPECT_STATE_TAIL = `.team/state/local/${DAY}.json`
const sameInstant = (a, b) => {
  const ta = Date.parse(String(a ?? ''))
  const tb = Date.parse(String(b ?? ''))
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb
}
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const keyOf = (input) => `${input.cell}:${input.id}`

function readJsonOrNull(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** 一个文件的 SHA256（不在盘上 ⇒ `null`）—— 被拒的那一步"零写入"靠它量。 */
function fileShaOrNull(file) {
  try {
    return sha256File(file)
  } catch {
    return null
  }
}

/** 每条输入一个**带 marker 的**临时工作区（`.team` 由 CLI 自己在该目录下建）。 */
function makeWorkspace(caseId, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${caseId.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/** 跑一节时把**注入式时钟**挪到 `iso`，跑完（**无论成不成**）还原 —— 运行根那一份是共享的。 */
function withClock(iso, fn) {
  const file = process.env[ENV.NOW_FILE]
  if (!file) throw new Error(`AGENIA_NOW_FILE 没设置 —— 这一票的时间读数全靠它（${file}）`)
  const prior = existsSync(file) ? readFileSync(file, 'utf8') : null
  writeFileSync(file, `${iso}\n`, 'utf8')
  try {
    return fn()
  } finally {
    writeFileSync(file, prior === null ? '' : prior, 'utf8')
  }
}

/** 落一份源码到运行根之下并 import 它（URL 带哈希 ⇒ 同一进程里不会拿到缓存里的旧字节）。 */
async function importSource(dir, name, source) {
  const sub = path.join(dir, name)
  mkdirSync(sub, { recursive: true })
  const file = path.join(sub, 'anchors.mjs')
  writeFileSync(file, source, 'utf8')
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex')
  const mod = await import(`${pathToFileURL(file).href}?sha256=${sha256}`)
  return { mod, file, sha256, bytes: Buffer.byteLength(source, 'utf8') }
}

/** 在 `ws` 下写一份文件（`rel` 用 `/`）。 */
function writeUnder(ws, rel, text) {
  const abs = path.join(ws, ...String(rel).split('/'))
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')
  return abs
}

/** 工作区**之外**、运行根之下的那份文件（绝对路径锚点的"包外"形状）。 */
function writeOutside() {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const abs = path.join(runRoot, ...OUTSIDE_REL_IN_RUN.split('/'))
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, OUTSIDE_TEXT, 'utf8')
  return abs
}

// ── 真 CLI 调用 ────────────────────────────────────────────────────────────
let fixtureSeq = 0
function payloadFile(label, payload) {
  fixtureSeq += 1
  return writeFixture('LOC-02', `in-${label}-${fixtureSeq}`, payload)
}

/** 一次写 op（真子进程 · 注入式时钟）。返回 `{ok, exit, code, stderr_head}`。 */
function localWrite(ws, op, payload, atIso) {
  const inFile = payloadFile(op, payload)
  let res = null
  withClock(atIso, () => {
    res = runLocal('LOC-02', op, undefined, { workspace: ws, inFile })
  })
  return {
    ok: res !== null && res.exit_code === 0 && res.json?.ok === true,
    exit: res?.exit_code ?? null,
    code: res?.json?.error?.code ?? null,
    stderr_head: String(res?.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' | '),
  }
}

/** 一次 `local-read`（真子进程）。返回信封的几格 + 盘上那份文档（**一扇门两个读数**）。 */
function localRead(ws) {
  const res = runLocal('LOC-02', 'local-read', { day: DAY }, { workspace: ws })
  return {
    ok: res.exit_code === 0 && res.json?.ok === true,
    exit: res.exit_code,
    code: res.json?.error?.code ?? null,
    message: String(res.json?.error?.message ?? ''),
    state: res.json?.state ?? null,
    state_path: res.json?.state_path ?? null,
    summary: res.json?.summary ?? null,
    project: res.json?.project ?? null,
    day: res.json?.day ?? null,
    stderr_head: String(res.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' | '),
    on_disk: readJsonOrNull(statePathOf(ws)),
  }
}

// ── 断言小工具：每条返回 `{code, message}`，`null` 表示成立 ──────────────────────
const eq = (code, got, want, why) => (JSON.stringify(got) === JSON.stringify(want)
  ? null
  : { code, message: `${why}：期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}` })

const instant = (code, got, want, why) => (sameInstant(got, want)
  ? null
  : { code, message: `${why}：期望与 ${JSON.stringify(want)} 同一个时刻，实得 ${JSON.stringify(got)}` })

const compacts = (list) => list.filter((p) => p !== null)

/** 一个**没跑过**的节点必须是文档里的空形状（15 个必填键、该 null 的 null、该 `[]` 的 `[]`）。 */
function emptyNodeProblems(where, node) {
  if (!isObject(node)) return [{ code: 'LOC-NODE-SHAPE', message: `${where}：节点不是一个对象（${JSON.stringify(node)}）` }]
  const keys = Object.keys(node)
  const missing = NODE_REQUIRED.filter((k) => !keys.includes(k))
  return compacts([
    missing.length === 0 ? null : { code: 'LOC-NODE-SHAPE', message: `${where}：空节点缺必填键 ${JSON.stringify(missing)}（lib/local-state.mjs::emptyNode() 的 15 个必填键）` },
    eq('LOC-NODE-SHAPE', node.state, 'unclaimed', `${where}：没被 claim 过的节点 state 必须是 unclaimed`),
    ...NODE_NULL_WHEN_EMPTY.map((k) => eq('LOC-NODE-SHAPE', node[k], null, `${where}：空节点的 ${k} 必须是 null`)),
    eq('LOC-NODE-SHAPE', node.ticket_ids, [], `${where}：空节点的 ticket_ids 必须是 []`),
    eq('LOC-NODE-SHAPE', node.artifact_paths, [], `${where}：空节点的 artifact_paths 必须是 []`),
  ])
}

/** 兄弟两个节点一个字都不许动。 */
function siblingProblems(where, doc, field) {
  return FIELDS.filter((f) => f !== field).flatMap((f) => emptyNodeProblems(`${where}/${f}`, doc?.[f]))
}

/** 跑过的节点：状态 + claim 痕迹（`claim` / `job_id` 不许被落地动作抹掉，`claimed_at` 不许被改写）。 */
function claimTraceProblems(where, node, { jobId, attempt, at: claimedAt }) {
  if (!isObject(node)) return [{ code: 'LOC-CLAIM-TRACE', message: `${where}：节点不是一个对象` }]
  return compacts([
    eq('LOC-CLAIM-TRACE', node.job_id, jobId, `${where}：节点的 job_id 必须指得出是哪一次派工`),
    isObject(node.claim) ? null : { code: 'LOC-CLAIM-TRACE', message: `${where}：节点的 claim 不是一个对象（${JSON.stringify(node.claim)}）—— claim 痕迹被抹掉了` },
    isObject(node.claim) ? eq('LOC-CLAIM-TRACE', node.claim.job_id, jobId, `${where}：claim.job_id`) : null,
    isObject(node.claim) ? eq('LOC-CLAIM-TRACE', node.claim.attempt, attempt, `${where}：claim.attempt`) : null,
    isObject(node.claim) ? instant('LOC-CLAIM-TRACE', node.claim.claimed_at, claimedAt, `${where}：claim.claimed_at 是**claim 那一刻**，落地动作不许改写它`) : null,
  ])
}

/** `local-read` 那一扇门与盘上那份文件必须说同一件事。 */
function readAgrees(where, doc, read) {
  if (read === null) return [{ code: 'LOC-READ', message: `${where}：没有 local-read 的读数` }]
  return compacts([
    read.ok ? null : { code: 'LOC-READ', message: `${where}：local-read 必须可用（正例），实得 exit=${read.exit} code=${read.code ?? '(无)'} · ${read.stderr_head}` },
    eq('LOC-READ', statePathTail(read.state_path), EXPECT_STATE_TAIL, `${where}：local-read 的 state_path 必须指着这一天那个文件（尾巴）`),
    doc === null ? null : eq('LOC-READ-DISAGREE', read.state, doc, `${where}：local-read 的 state 与盘上那份文件必须是同一份`),
    eq('LOC-READ', read.project, PROJECT, `${where}：local-read 的 project`),
    eq('LOC-READ', read.day, DAY, `${where}：local-read 的 day`),
  ])
}

/**
 * 一步的**期望**：`ok` 必须成功；`reject` 必须被拒、码对、退出码对、**而且一个字节都不许写**
 * （`wrote` 由两条臂各自量：生产臂比状态文件的 SHA256，REF 臂比序列化后的文档）。
 */
function judgeStep({ where, step, got, wrote }) {
  const expect = step.expect ?? 'ok'
  if (expect === 'reject') {
    const wantCode = step.rejectCode
    const wantExit = FROZEN.exitCodes[wantCode]
    return compacts([
      got.ok === false ? null : { code: 'LOC-REJECT', message: `${where}：这一步必须被拒（${wantCode}），实得成功（exit=${got.exit}）—— 闸没拦住` },
      got.ok === false ? eq('LOC-REJECT', got.code, wantCode, `${where}：拒绝码必须是 ${wantCode}`) : null,
      got.ok === false && got.exit !== undefined && got.exit !== null ? eq('LOC-REJECT-EXIT', got.exit, wantExit, `${where}：拒绝的退出码（FROZEN.exitCodes.${wantCode}）`) : null,
      wrote === false ? null : { code: 'LOC-REJECT-NO-WRITE', message: `${where}：被拒的这一步**一个字节都不许写**，实得状态文件/文档变了（wrote=${JSON.stringify(wrote)}）` },
    ])
  }
  return compacts([
    got.ok === true ? null : { code: 'LOC-CLI', message: `${where}：这一步必须成功，实得 exit=${got.exit} code=${got.code ?? '(无)'} · ${got.stderr_head ?? ''}` },
  ])
}

/** `done` 的节点：五个锚点（该是 `null` 的那三个就判 `null`）+ 落地时刻 + 兄弟节点 + 读面。 */
function doneProblems(where, doc, read, { field, reportPath, reportSha, findings, jobId, claimAt, markAt }) {
  const node = doc?.[field]
  return compacts([
    doc === null ? { code: 'LOC-NO-FILE', message: `${where}：mark 成功之后读不到状态文件 —— 写面没落盘` } : null,
    eq('LOC-STATE-SHAPE', doc?.day, DAY, `${where}：状态文件的 day`),
    isObject(node) ? eq('LOC-DONE', node.state, 'done', `${where}：mark 之后 ${field} 必须是 done`) : { code: 'LOC-NODE-SHAPE', message: `${where}：${field} 节点不是一个对象` },
    isObject(node) ? eq('LOC-DONE', node.report_path, reportPath, `${where}：report_path 必须原样记下（相对工作区）`) : null,
    isObject(node) ? eq('LOC-DONE', node.report_sha256, reportSha, `${where}：report_sha256 必须等于**报告盘上字节**的 SHA256`) : null,
    isObject(node) && findings === null ? eq('LOC-FINDINGS-NULL', node.findings_path, null, `${where}：这个字段**只交报告** ⇒ findings_path 必须留在 null（不许为了过闸编一份）`) : null,
    isObject(node) && findings === null ? eq('LOC-FINDINGS-NULL', node.findings_set_sha256, null, `${where}：这个字段**只交报告** ⇒ findings_set_sha256 必须留在 null`) : null,
    isObject(node) && findings === null ? eq('LOC-FINDINGS-NULL', node.findings_count, null, `${where}：这个字段**只交报告** ⇒ findings_count 必须留在 null（连 0 都不许写）`) : null,
    isObject(node) && findings !== null ? eq('LOC-DONE', node.findings_path, findings.path, `${where}：findings_path 必须原样记下`) : null,
    isObject(node) && findings !== null ? eq('LOC-DONE', node.findings_set_sha256, findings.setSha, `${where}：findings_set_sha256 必须等于**真实发现集**的 Q10 摘要`) : null,
    isObject(node) && findings !== null ? eq('LOC-DONE', node.findings_count, findings.count, `${where}：findings_count 必须等于产物里的**真条数**`) : null,
    isObject(node) ? eq('LOC-DONE', node.failure_reason, null, `${where}：done 的节点不许留着失败原因`) : null,
    isObject(node) ? instant('LOC-DONE', node.liveness_at, markAt, `${where}：done 的 liveness_at 必须是**落地那一刻**（不是 claim 那一刻）`) : null,
    ...claimTraceProblems(`${field}.claim`, node, { jobId, attempt: 1, at: claimAt }),
    ...siblingProblems(where, doc, field),
    ...readAgrees(where, doc, read),
    eq('LOC-READ', read?.summary?.nodes?.[field]?.state, 'done', `${where}：local-read 的摘要里 ${field} 也必须是 done`),
  ])
}

/** 被拒的 mark：节点仍 `running`、五个锚点一个都不许落、`artifact_paths` 仍是 `[]`、落地时刻没动。 */
function rejectedProblems(where, doc, read, { field, jobId, claimAt }) {
  const node = doc?.[field]
  return compacts([
    doc === null ? { code: 'LOC-NO-FILE', message: `${where}：被拒之后状态文件不见了 —— 它该保持 claim 写完的那一份` } : null,
    isObject(node) ? eq('LOC-REJECT', node.state, 'running', `${where}：被拒之后 ${field} 必须仍是 running（拒绝不是落地）`) : { code: 'LOC-NODE-SHAPE', message: `${where}：${field} 节点不是一个对象` },
    ...ANCHOR_KEYS.map((k) => (isObject(node) ? eq('LOC-REJECT', node[k], null, `${where}：被拒的 mark 不许在节点上留下 ${k}`) : null)),
    isObject(node) ? eq('LOC-REJECT', node.artifact_paths, [], `${where}：被拒的 mark 不许写 artifact_paths`) : null,
    isObject(node) ? instant('LOC-REJECT', node.liveness_at, claimAt, `${where}：被拒之后 liveness_at 必须还是 claim 那一刻`) : null,
    ...claimTraceProblems(`${field}.claim`, node, { jobId, attempt: 1, at: claimAt }),
    ...readAgrees(where, doc, read),
    eq('LOC-REJECT', read?.summary?.nodes?.[field]?.state, 'running', `${where}：local-read 的摘要里也必须是 running`),
  ])
}

// ═════════════════════════════════════════════════════════════════════════════
// 二十三条输入 · 三格
// ═════════════════════════════════════════════════════════════════════════════

/** mark 的 payload（`day` / `project` / `field` 由跑的人补；这里只放这一条输入自己的锚点）。 */
function markPayload({ reportPath, reportSha, findingsPath = null, findingsSetSha = null, findingsCount = null, artifactPaths }) {
  const payload = { report_path: reportPath, report_sha256: reportSha }
  if (findingsPath !== null) {
    payload.findings_path = findingsPath
    payload.findings_set_sha256 = findingsSetSha
    payload.findings_count = findingsCount
  }
  payload.artifact_paths = artifactPaths
  return payload
}

/** 一份 `technical` 的**合法** findings 一侧（`LOC-04` 用它把"只变 report_path"这件事钉住）。 */
const LEGAL_FINDINGS = { path: FINDINGS_REL, setSha: SET_SHA_3, count: ENTRIES_3.length, text: FINDINGS3_TEXT }

const INPUTS = [
  // ── `LOC-02` · 按字段的必填（A 只报告 ⇒ done / C 不带 findings ⇒ 拒）────────────────────
  {
    cell: 'LOC-02',
    id: 'A',
    field: 'memory_review',
    expect: 'ok',
    title: 'memory-review **只交报告** ⇒ done，findings 三个锚点留 null',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      return {
        payload: markPayload({ reportPath: REPORT_REL, reportSha: REPORT_SHA, artifactPaths: [REPORT_REL] }),
        artifacts: { report, report_sha256_on_disk: sha256File(report), findings: null },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'memory_review', reportPath: REPORT_REL, reportSha: REPORT_SHA, findings: null, jobId: input.jobId, claimAt: input.claimAt, markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-02',
    id: 'B',
    field: 'conversation',
    expect: 'ok',
    title: 'conversation **只交报告** ⇒ done，findings 三个锚点留 null',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      return {
        payload: markPayload({ reportPath: REPORT_REL, reportSha: REPORT_SHA, artifactPaths: [REPORT_REL] }),
        artifacts: { report, report_sha256_on_disk: sha256File(report), findings: null },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'conversation', reportPath: REPORT_REL, reportSha: REPORT_SHA, findings: null, jobId: input.jobId, claimAt: input.claimAt, markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-02',
    id: 'C',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    title: 'technical **不带 findings** ⇒ 拒 E_ARG_SCHEMA，节点停在 running、状态文件零写入',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      return {
        payload: markPayload({ reportPath: REPORT_REL, reportSha: REPORT_SHA, artifactPaths: [REPORT_REL] }),
        artifacts: { report, report_sha256_on_disk: sha256File(report), findings: null },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-02',
    id: 'D',
    field: 'technical',
    expect: 'ok',
    title: 'technical **带一份真 findings 产物** ⇒ done，五个锚点逐项记下',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: REPORT_REL,
          reportSha: REPORT_SHA,
          findingsPath: LEGAL_FINDINGS.path,
          findingsSetSha: LEGAL_FINDINGS.setSha,
          findingsCount: LEGAL_FINDINGS.count,
          artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, report_sha256_on_disk: sha256File(report), findings, findings_sha256_on_disk: sha256File(findings), findings_set_sha256_fed: LEGAL_FINDINGS.setSha, findings_count_fed: LEGAL_FINDINGS.count },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: LEGAL_FINDINGS.path, setSha: LEGAL_FINDINGS.setSha, count: LEGAL_FINDINGS.count },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-02',
    id: 'E',
    field: 'memory_review',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    title: '记忆复核：**只给 `findings_count`**（三件套缺两件）⇒ 拒 E_ARG_SCHEMA、零写入、节点停在 running',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      return {
        // 三件套里**只有 count**：没有 `findings_path`、没有 `findings_set_sha256`。
        payload: { report_path: REPORT_REL, report_sha256: REPORT_SHA, findings_count: 0, artifact_paths: [REPORT_REL] },
        artifacts: { report, report_sha256_on_disk: sha256File(report), findings: null },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'memory_review', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-02',
    id: 'F',
    field: 'conversation',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    title: '会话评审：**给了 `findings_path` + `findings_set_sha256`、没给 `findings_count`**（半套）⇒ 拒 E_ARG_SCHEMA、零写入',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: {
          report_path: REPORT_REL,
          report_sha256: REPORT_SHA,
          findings_path: LEGAL_FINDINGS.path,
          findings_set_sha256: LEGAL_FINDINGS.setSha,
          artifact_paths: [REPORT_REL, LEGAL_FINDINGS.path],
        },
        artifacts: { report, findings, findings_count_fed: null },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'conversation', jobId: input.jobId, claimAt: input.claimAt })
    },
  },

  // ── `LOC-03` · findings_count 与产物条数对账（3 条 / 0 条 × 诚实与说谎）+ 产物读不出来 ──────────
  {
    cell: 'LOC-03',
    id: 'A',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    title: '盘上 3 条发现 + `findings_count: 0`（少报）⇒ 拒',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: REPORT_REL, reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: 0, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings, findings_count_fed: 0, findings_entries_on_disk: ENTRIES_3.length },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-03',
    id: 'B',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_ARG_SCHEMA',
    title: '盘上 3 条发现 + `findings_count: 9`（多报）⇒ 拒',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: REPORT_REL, reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: 9, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings, findings_count_fed: 9, findings_entries_on_disk: ENTRIES_3.length },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-03',
    id: 'C',
    field: 'technical',
    expect: 'ok',
    title: '盘上 3 条发现 + `findings_count: 3`（诚实计数）⇒ done',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: REPORT_REL, reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: ENTRIES_3.length, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings, findings_count_fed: ENTRIES_3.length, findings_entries_on_disk: ENTRIES_3.length },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: LEGAL_FINDINGS.path, setSha: SET_SHA_3, count: ENTRIES_3.length },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-03',
    id: 'D',
    field: 'technical',
    expect: 'ok',
    title: '空 findings（0 条）+ `findings_count: 0` ⇒ done（"零条发现"是合法产物）',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, FINDINGS_EMPTY_REL, FINDINGS0_TEXT)
      return {
        payload: markPayload({
          reportPath: REPORT_REL, reportSha: REPORT_SHA, findingsPath: FINDINGS_EMPTY_REL, findingsSetSha: SET_SHA_0, findingsCount: 0, artifactPaths: [REPORT_REL, FINDINGS_EMPTY_REL],
        }),
        artifacts: { report, findings, findings_count_fed: 0, findings_entries_on_disk: ENTRIES_0.length, findings_set_sha256_fed: SET_SHA_0 },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: FINDINGS_EMPTY_REL, setSha: SET_SHA_0, count: 0 },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-03',
    id: 'E',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_CORRUPT',
    title: 'findings 文件**在盘上、是合法 JSON、但没有 `findings` 数组** ⇒ 拒 E_DATA_CORRUPT、零写入',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, FINDINGS_BADJSON_REL, FINDINGS_BADJSON_TEXT)
      return {
        payload: markPayload({
          reportPath: REPORT_REL, reportSha: REPORT_SHA, findingsPath: FINDINGS_BADJSON_REL, findingsSetSha: SET_SHA_3, findingsCount: ENTRIES_3.length, artifactPaths: [REPORT_REL, FINDINGS_BADJSON_REL],
        }),
        artifacts: { report, findings, findings_sha256_on_disk: sha256File(findings), findings_note: '合法 JSON、没有 findings 数组 ⇒ 条数读不出来' },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-03',
    id: 'F',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_CORRUPT',
    title: 'findings 文件**是半截 JSON**（读不出来）⇒ 拒 E_DATA_CORRUPT、零写入（"文件在"与"读得出"是两件事）',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, FINDINGS_TRUNCATED_REL, FINDINGS_TRUNCATED_TEXT)
      return {
        payload: markPayload({
          reportPath: REPORT_REL, reportSha: REPORT_SHA, findingsPath: FINDINGS_TRUNCATED_REL, findingsSetSha: SET_SHA_3, findingsCount: ENTRIES_3.length, artifactPaths: [REPORT_REL, FINDINGS_TRUNCATED_REL],
        }),
        artifacts: { report, findings, findings_sha256_on_disk: sha256File(findings), findings_note: '半截 JSON ⇒ JSON.parse 抛错' },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },

  // ── `LOC-04` · 锚点必须落到 `.team/` 里的真文件，**落盘记规范形**（同一个文件的十一种写法）──────────
  {
    cell: 'LOC-04',
    id: 'A',
    field: 'technical',
    expect: 'ok',
    spelling: 'canonical · 工作区相对、带 `.team/`、正斜杠（**正例**）',
    title: '`.team/retro/2026-10-24/技术评审.md` ⇒ done（记下的就是它自己）',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: REPORT_REL, reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: LEGAL_FINDINGS.path, setSha: LEGAL_FINDINGS.setSha, count: LEGAL_FINDINGS.count },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-04',
    id: 'B',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_MISSING',
    spelling: '`README.md`（工作区根下**存在**的无关文件 ⇒ 解析后落在 `.team/` **外**）',
    title: '`README.md` ⇒ 拒（F3 的现场：修复前它会 `done`）',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      const readme = writeUnder(ws, README_REL, README_TEXT)
      return {
        payload: markPayload({
          reportPath: README_REL, reportSha: README_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings, readme, readme_sha256_on_disk: sha256File(readme), fed_report_sha256: README_SHA },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-04',
    id: 'C',
    field: 'technical',
    expect: 'ok',
    spelling: '`./.team/...`（同一个文件、多一个 `./`）',
    title: '`./.team/retro/2026-10-24/技术评审.md` ⇒ 收 + 记规范形',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: `./${REPORT_REL}`, reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: LEGAL_FINDINGS.path, setSha: LEGAL_FINDINGS.setSha, count: LEGAL_FINDINGS.count },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-04',
    id: 'D',
    field: 'technical',
    expect: 'ok',
    spelling: '`retro/...`（**`.team` 相对**写法 —— `RCP-03` / `VRF-02` 用的就是这一种）',
    title: '`retro/2026-10-24/技术评审.md` ⇒ 收 + 记规范形',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: REPORT_REL.replace(/^\.team\//, ''), reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: LEGAL_FINDINGS.path, setSha: LEGAL_FINDINGS.setSha, count: LEGAL_FINDINGS.count },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-04',
    id: 'E',
    field: 'technical',
    expect: 'ok',
    spelling: '`.team\\retro\\...`（反斜杠写法，同一个文件）',
    title: '`.team\\retro\\2026-10-24\\技术评审.md` ⇒ 收 + 记规范形',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: REPORT_REL.split('/').join('\\'), reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: LEGAL_FINDINGS.path, setSha: LEGAL_FINDINGS.setSha, count: LEGAL_FINDINGS.count },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-04',
    id: 'F',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_MISSING',
    spelling: '`.team/.../不存在.md`（前缀对、文件不在盘上）',
    title: '`.team/retro/2026-10-24/不存在.md` ⇒ 拒（缺）',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: '.team/retro/2026-10-24/不存在.md', reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-04',
    id: 'G',
    field: 'technical',
    expect: 'ok',
    spelling: '`<工作区绝对路径>\\.team\\...`（绝对路径、**在 `.team/` 里**）',
    title: '绝对路径（同一个文件、在 `.team/` 里）⇒ 收 + 记规范形',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: report, reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: LEGAL_FINDINGS.path, setSha: LEGAL_FINDINGS.setSha, count: LEGAL_FINDINGS.count },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
  {
    cell: 'LOC-04',
    id: 'H',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_MISSING',
    spelling: '`<运行根>/outside-loc04/技术评审.md`（绝对路径、**包外**）',
    title: '工作区之外的绝对路径 ⇒ 拒',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      const outside = writeOutside()
      return {
        payload: markPayload({
          reportPath: outside, reportSha: OUTSIDE_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings, outside, outside_sha256_on_disk: sha256File(outside) },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-04',
    id: 'I',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_MISSING',
    spelling: '`.team/../README.md`（`..` 穿出 `.team/`，目标文件**存在**）',
    title: '`.team/../README.md` ⇒ 拒（解析后落在 `.team/` 外）',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      const readme = writeUnder(ws, README_REL, README_TEXT)
      return {
        payload: markPayload({
          reportPath: '.team/../README.md', reportSha: README_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings, readme, readme_sha256_on_disk: sha256File(readme) },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-04',
    id: 'J',
    field: 'technical',
    expect: 'reject',
    rejectCode: 'E_DATA_MISSING',
    spelling: '`retro/.../不存在.md`（`.team` 相对、文件不在盘上）',
    title: '`retro/2026-10-24/不存在.md` ⇒ 拒（缺 —— 归一化不许凭空造出文件）',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: 'retro/2026-10-24/不存在.md', reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings },
      }
    },
    check(doc, read, input) {
      return rejectedProblems(keyOf(input), doc, read, { field: 'technical', jobId: input.jobId, claimAt: input.claimAt })
    },
  },
  {
    cell: 'LOC-04',
    id: 'K',
    field: 'technical',
    expect: 'ok',
    caseFold: true,
    spelling: '`.TEAM/...`（同一个文件，**前缀换大小写**）',
    title: '`.TEAM/retro/2026-10-24/技术评审.md` ⇒ 收 + 记**规范形**（首段 `.TEAM` 落盘成小写 `.team/`，其余按磁盘真名；本平台不分大小写）',
    prepare(ws) {
      const report = writeUnder(ws, REPORT_REL, REPORT_TEXT)
      const findings = writeUnder(ws, LEGAL_FINDINGS.path, LEGAL_FINDINGS.text)
      return {
        payload: markPayload({
          reportPath: '.TEAM/retro/2026-10-24/技术评审.md', reportSha: REPORT_SHA, findingsPath: LEGAL_FINDINGS.path, findingsSetSha: LEGAL_FINDINGS.setSha, findingsCount: LEGAL_FINDINGS.count, artifactPaths: [REPORT_REL, LEGAL_FINDINGS.path],
        }),
        artifacts: { report, findings },
      }
    },
    check(doc, read, input) {
      return doneProblems(keyOf(input), doc, read, {
        field: 'technical',
        reportPath: REPORT_REL,
        reportSha: REPORT_SHA,
        findings: { path: LEGAL_FINDINGS.path, setSha: LEGAL_FINDINGS.setSha, count: LEGAL_FINDINGS.count },
        jobId: input.jobId,
        claimAt: input.claimAt,
        markAt: input.markAt,
      })
    },
  },
].map((input, i) => ({ ...input, claimAt: clockAt(i, 0), markAt: clockAt(i, 4), jobId: `job-${input.cell.toLowerCase()}-${input.id.toLowerCase()}` }))

const inputsOf = (cell) => INPUTS.filter((input) => input.cell === cell)

// ═════════════════════════════════════════════════════════════════════════════
// REF：照（按字段 + count 对账 + `.team/` 前缀）写的**最小实现**（阳性对照 + 六把刀的载体）
// ═════════════════════════════════════════════════════════════════════════════
const REF_SOURCE = `// LOC-02/03/04 的阳性对照：照（老板 2026-10-24 按字段的裁定 + F2 + F3）写的**最小实现**（不是生产代码）。
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const FIELDS = ['memory_review', 'conversation', 'technical']
/** 按字段的**必填**产物：只有 technical 需要 findings（老板 2026-10-24 的裁定）。 */
const REQUIRES_FINDINGS = { memory_review: false, conversation: false, technical: true }
const TEAM_PREFIX = '.team/'
const SHA_RE = /^[0-9a-f]{64}$/
const isFilled = (v) => typeof v === 'string' && v.trim() !== ''
const isSha = (v) => SHA_RE.test(String(v === null || v === undefined ? '' : v).trim().toLowerCase())

function emptyNode() {
  return {
    claim: null, state: 'unclaimed', job_id: null, liveness_at: null, failure_reason: null,
    report_path: null, report_sha256: null, findings_path: null, findings_set_sha256: null, findings_count: null,
    receipt_path: null, receipt_sha256: null, receipt_version: null, ticket_ids: [], artifact_paths: [],
  }
}

function emptyDoc(call) {
  const doc = { schema: 1, day: call.day, project: call.project, snapshot: 'v0', local_lease_minutes: 45, imported_proposal_ids: [], updated_at: call.at }
  for (const f of FIELDS) doc[f] = emptyNode()
  return doc
}

export function claimDoc(prev, call) {
  const state = prev === null || prev === undefined ? emptyDoc(call) : prev
  const next = { ...state, updated_at: call.at }
  next[call.field] = {
    ...state[call.field],
    claim: { attempt: call.attempt, job_id: call.jobId, claimed_at: call.at },
    state: 'running',
    job_id: call.jobId,
    liveness_at: call.at,
    failure_reason: null,
  }
  return { ok: true, code: null, doc: next }
}

/**
 * \`abs\` 在 \`<工作区>/.team/\` 里吗 —— **用 \`path.relative\` 判**（跟着本平台的路径语义走）：
 * Windows 上 \`.TEAM\` 与 \`.team\` 是同一个目录，字符串前缀比较会说"不在"，而它就在。
 */
function insideTeam(teamRoot, abs) {
  const delta = path.relative(teamRoot, abs)
  if (delta === '' || path.isAbsolute(delta)) return false
  return delta !== '..' && !delta.startsWith('..' + path.sep)
}

/**
 * 一个锚点路径 → \`{abs, canonical}\`：**只要它解析到 \`<工作区>/.team/\` 里的一个真文件就收**。
 *
 * 认这几种写法（老板 2026-10-24 的裁定）：\`.team/a/b.md\` · \`a/b.md\`（\`.team\` 相对）· \`./.team/a/b.md\` ·
 * \`.team\\a\\b.md\`（反斜杠）· \`<工作区绝对路径>\\\\.team\\\\a\\\\b.md\` · **大小写不同**的 \`.TEAM/a/b.md\`
 * （Windows 不分大小写 ⇒ 同一个文件）。\`canonical\` 一律是 \`.team/<…>/<file>\`（**小写**、正斜杠）——
 * 落盘只记这一个形状，调用方怎么写（含 \`.TEAM\`）都不改变它。
 * 解析不到（文件不在 / 落在 \`.team/\` 外 / \`..\` 穿出去）⇒ \`null\`（调用方报 \`E_DATA_MISSING\`）。
 */
function resolveAnchor(workspace, rel) {
  if (!isFilled(rel)) return null
  const text = String(rel).trim()
  const root = path.resolve(workspace)
  const teamRoot = path.join(root, '.team')
  const candidates = path.isAbsolute(text) ? [text] : [path.resolve(root, text), path.resolve(teamRoot, text)]
  for (const candidate of candidates) {
    const abs = path.resolve(candidate)
    if (!insideTeam(teamRoot, abs)) continue
    if (!existsSync(abs) || !statSync(abs).isFile()) continue
    return { abs: abs, canonical: TEAM_PREFIX + path.relative(teamRoot, abs).split(path.sep).join('/') }
  }
  return null
}

export function markDoc(prev, call) {
  const p = call.payload || {}
  const field = call.field
  const problems = []
  const bad = (code, detail) => problems.push({ code: code, detail: detail })

  const reportAnchor = resolveAnchor(call.workspace, p.report_path)
  if (reportAnchor === null) bad('E_DATA_MISSING', 'report_path 必须解析到 <工作区>/.team/ 里的一个真文件（缺 / 在外 / 拼错同一个诊断）')

  const needFindings = REQUIRES_FINDINGS[field] === true
  const hasFindings = isFilled(p.findings_path)
  const setShaGiven = p.findings_set_sha256 !== undefined && p.findings_set_sha256 !== null
  const countGiven = p.findings_count !== undefined && p.findings_count !== null
  if (needFindings && !hasFindings) bad('E_ARG_SCHEMA', 'technical 必须交 findings 产物（findings_path 必填）')
  else if (!hasFindings && (setShaGiven || countGiven)) bad('E_ARG_SCHEMA', 'findings 三个锚点要么都给、要么都不给（findings_path 没给，却给了 set/count）—— 只给一半会在节点上留下一个没有产物的锚点')
  let countInArtifact = null
  let findingsAnchor = null
  if (hasFindings) {
    findingsAnchor = resolveAnchor(call.workspace, p.findings_path)
    if (findingsAnchor === null) bad('E_DATA_MISSING', 'findings_path 必须解析到 <工作区>/.team/ 里的一个真文件')
    else {
      try {
        const obj = JSON.parse(readFileSync(findingsAnchor.abs, 'utf8'))
        if (Array.isArray(obj.findings)) countInArtifact = obj.findings.length
      } catch (err) {
        countInArtifact = null
      }
      // 文件**在盘上**却读不出 \`findings\` 数组 ⇒ 数据坏了，不是"文件不在"。
      if (countInArtifact === null) bad('E_DATA_CORRUPT', 'findings 文件里没有 findings 数组（读不出来或形状不对）')
    }
  }
  if (!isSha(p.report_sha256)) bad('E_ARG_HASH', 'report_sha256 必须是 64 hex')
  if (needFindings || hasFindings) {
    if (!isSha(p.findings_set_sha256)) bad('E_ARG_HASH', 'findings_set_sha256 必须是 64 hex')
    if (!Number.isInteger(p.findings_count) || p.findings_count < 0) bad('E_ARG_SCHEMA', 'findings_count 必须是 ≥0 的整数')
    else if (countInArtifact !== null && p.findings_count !== countInArtifact) bad('E_ARG_SCHEMA', 'findings_count 与 findings 文件的条数对不上')
  }
  if (problems.length === 0 && reportAnchor !== null) {
    const actual = createHash('sha256').update(readFileSync(reportAnchor.abs)).digest('hex')
    if (actual !== String(p.report_sha256).trim().toLowerCase()) bad('E_ARG_HASH', 'report_sha256 与报告盘上字节对不上')
  }
  if (problems.length > 0) return { ok: false, code: problems[0].code, detail: problems[0].detail, doc: prev }

  const node = prev[field]
  const next = { ...prev, updated_at: call.at }
  next[field] = {
    ...node,
    state: 'done',
    report_path: reportAnchor.canonical,
    report_sha256: String(p.report_sha256).trim().toLowerCase(),
    findings_path: findingsAnchor === null ? null : findingsAnchor.canonical,
    findings_set_sha256: findingsAnchor === null ? null : String(p.findings_set_sha256).trim().toLowerCase(),
    findings_count: findingsAnchor === null ? null : p.findings_count,
    artifact_paths: Array.isArray(p.artifact_paths) ? p.artifact_paths.map(String) : node.artifact_paths,
    liveness_at: call.at,
    failure_reason: null,
  }
  return { ok: true, code: null, doc: next }
}

export function readOutputOf(doc, statePath) {
  const nodes = {}
  for (const f of FIELDS) {
    nodes[f] = { state: doc[f].state, job_id: doc[f].job_id, liveness_at: doc[f].liveness_at, failure_reason: doc[f].failure_reason }
  }
  return { ok: true, state: doc, state_path: statePath, summary: { project: doc.project, day: doc.day, snapshot: doc.snapshot, nodes: nodes }, project: doc.project, day: doc.day }
}
`

/**
 * 六把刀：`find` 必须在 `REF_SOURCE` 里**逐字**存在（找不到 ⇒ 这一刀没有落点）。
 * 期望向量是**从规则推出来的**（不是跑完再抄），按 `格:输入` 记；跑出来不一致 ⇒ `KNIFE-WRONG-VECTOR`。
 * 向量在**全部二十三个输入**上量 ⇒ "只翻本格"是读数，不是声明。
 */
const KNIVES = [
  {
    id: 'KQ1-FIELD-BLIND',
    title: 'KQ1 · 三个字段都要 findings（退回到"一视同仁"的形状）',
    cell: 'LOC-02',
    find: `const REQUIRES_FINDINGS = { memory_review: false, conversation: false, technical: true }`,
    replace: `const REQUIRES_FINDINGS = { memory_review: true, conversation: true, technical: true }`,
    want: ['LOC-02:A', 'LOC-02:B'],
  },
  {
    id: 'KQ2-TECH-WITHOUT-FINDINGS',
    title: 'KQ2 · 三个字段谁都不要 findings（把"技术评审仍然要交"那条腿拆掉）',
    cell: 'LOC-02',
    find: `const REQUIRES_FINDINGS = { memory_review: false, conversation: false, technical: true }`,
    replace: `const REQUIRES_FINDINGS = { memory_review: false, conversation: false, technical: false }`,
    want: ['LOC-02:C'],
  },
  {
    id: 'KQ3-COUNT-NOT-RECONCILED',
    title: 'KQ3 · 收下 `findings_count`、不与产物条数对账（评审 `F2` 的现场）',
    cell: 'LOC-03',
    find: `    else if (countInArtifact !== null && p.findings_count !== countInArtifact) bad('E_ARG_SCHEMA', 'findings_count 与 findings 文件的条数对不上')`,
    replace: `    // KQ3：不拿 findings_count 与产物的条数对账（收了就记）`,
    want: ['LOC-03:A', 'LOC-03:B'],
  },
  {
    id: 'KQ4-NO-TEAM-PREFIX',
    title: 'KQ4 · 不再要求锚点落在 `.team/` 下（工作区里任何存在的文件都收）',
    cell: 'LOC-04',
    find: `    const abs = path.resolve(candidate)
    if (!insideTeam(teamRoot, abs)) continue
    if (!existsSync(abs) || !statSync(abs).isFile()) continue`,
    replace: `    const abs = path.resolve(candidate)
    // KQ4：不再要求锚点落在 \`.team/\` 下（工作区里任何存在的文件都收）
    if (!existsSync(abs) || !statSync(abs).isFile()) continue`,
    want: ['LOC-04:B', 'LOC-04:H', 'LOC-04:I'],
  },
  {
    id: 'KQ5-STORE-AS-WRITTEN',
    title: 'KQ5 · 验的时候归一化、**落盘却记调用方怎么写**（"验对了但记错了"的那种半修）',
    cell: 'LOC-04',
    find: `    report_path: reportAnchor.canonical,`,
    replace: `    report_path: p.report_path,`,
    want: ['LOC-04:C', 'LOC-04:D', 'LOC-04:E', 'LOC-04:G', 'LOC-04:K'],
  },
  {
    id: 'KQ6-CASE-SENSITIVE-CONTAINMENT',
    title: 'KQ6 · 把"在不在 `.team/` 里"退回**字符串前缀比较**（大小写敏感 ⇒ `.TEAM/…` 被当成"在外"）',
    cell: 'LOC-04',
    find: `    if (!insideTeam(teamRoot, abs)) continue`,
    replace: `    if (!abs.startsWith(teamRoot + path.sep)) continue`,
    want: ['LOC-04:K'],
  },
]

// ── 生产臂 / REF 臂 ────────────────────────────────────────────────────────
/** 生产臂：一条输入一个**新**工作区，claim → 落产物 → mark，逐步真跑；最后读盘 + `local-read`。 */
function runInputProduction(input) {
  const where = keyOf(input)
  const ws = makeWorkspace(input.cell, `${input.cell.toLowerCase()}-${input.id.toLowerCase()}`)
  const row = { key: where, cell: input.cell, input: input.id, title: input.title, field: input.field, workspace: ws, steps: [], problems: [] }
  if (existsSync(statePathOf(ws))) {
    row.problems.push(problem('LOC-STALE-WS', `${where}：工作区里**已经有**状态文件（${statePathOf(ws)}）—— 这一条要的是"从零开始"`))
  }
  const res = localWrite(ws, 'local-claim', { day: DAY, project: PROJECT, field: FIELD_CLI[input.field], attempt: 1, job_id: input.jobId }, input.claimAt)
  row.steps.push({ kind: 'claim', at: input.claimAt, expect: 'ok', exit: res.exit, code: res.code, ok: res.ok, stderr_head: res.stderr_head, state_sha_after: fileShaOrNull(statePathOf(ws)) })
  row.problems.push(...judgeStep({ where: `${where}/claim`, step: { kind: 'claim', expect: 'ok' }, got: res, wrote: null }))

  const prepared = input.prepare(ws)
  row.artifacts = prepared.artifacts
  row.payload = prepared.payload
  const before = fileShaOrNull(statePathOf(ws))
  const marked = localWrite(ws, 'local-mark', { day: DAY, project: PROJECT, field: FIELD_CLI[input.field], ...prepared.payload }, input.markAt)
  const after = fileShaOrNull(statePathOf(ws))
  row.steps.push({
    kind: 'mark', at: input.markAt, expect: input.expect, reject_code: input.rejectCode ?? null,
    exit: marked.exit, code: marked.code, ok: marked.ok, stderr_head: marked.stderr_head,
    state_sha_before: before, state_sha_after: after, state_written: before !== after,
  })
  row.problems.push(...judgeStep({ where: `${where}/mark`, step: { expect: input.expect, rejectCode: input.rejectCode }, got: marked, wrote: before !== after }))

  const doc = readJsonOrNull(statePathOf(ws))
  const read = localRead(ws)
  const verdict = row.problems.length === 0 ? input.check(doc, read, input) : []
  row.doc = doc
  row.read = { exit: read.exit, ok: read.ok, code: read.code, state_path: read.state_path, summary: read.summary, agrees: JSON.stringify(read.state) === JSON.stringify(doc) }
  row.verdict = verdict
  row.held = row.problems.length === 0 && verdict.length === 0
  row.failed = [...row.problems, ...verdict].map((p) => p.code)
  return row
}

/** REF 臂 / 刀臂：同一套输入喂 REF（或它的变异体）；REF **自己读盘**。 */
function runInputOnRef(mod, input) {
  const where = keyOf(input)
  const ws = makeWorkspace(input.cell, `ref-${input.cell.toLowerCase()}-${input.id.toLowerCase()}`)
  const problems = []
  const steps = []
  let doc = null

  let got = mod.claimDoc(doc, { field: input.field, attempt: 1, jobId: input.jobId, at: input.claimAt, project: PROJECT, day: DAY })
  if (got.ok) doc = got.doc
  steps.push({ kind: 'claim', ok: got.ok === true, code: got.code ?? null })
  problems.push(...judgeStep({ where: `${where}/claim`, step: { kind: 'claim', expect: 'ok' }, got: { ok: got.ok === true, code: got.code ?? null, stderr_head: '' }, wrote: null }))

  const prepared = input.prepare(ws)
  const before = doc === null ? null : JSON.stringify(doc)
  got = mod.markDoc(doc, { field: input.field, at: input.markAt, payload: { day: DAY, project: PROJECT, ...prepared.payload }, workspace: ws })
  if (got.ok) doc = got.doc
  const after = doc === null ? null : JSON.stringify(doc)
  steps.push({ kind: 'mark', expect: input.expect, ok: got.ok === true, code: got.code ?? null, wrote: before !== after })
  problems.push(...judgeStep({ where: `${where}/mark`, step: { expect: input.expect, rejectCode: input.rejectCode }, got: { ok: got.ok === true, code: got.code ?? null, exit: null, stderr_head: '' }, wrote: before !== after }))

  const plain = doc === null ? null : JSON.parse(JSON.stringify(doc))
  const read = mod.readOutputOf(plain, statePathOf(ws))
  const verdict = problems.length === 0 ? input.check(plain, read, input) : []
  return { key: where, cell: input.cell, input: input.id, workspace: ws, steps, problems, verdict, held: problems.length === 0 && verdict.length === 0, failed: [...problems, ...verdict].map((p) => p.code) }
}

/**
 * 控制块（**一次跑里只算一次**，三格共用）：基线 REF 二十三条 + 六把刀在二十三条上的向量。
 * 刀只写盘到运行根，`presets/**` 一个字节都不碰。
 */
let CONTROL = null
async function control() {
  if (CONTROL !== null) return CONTROL
  const dir = fixtureDir('LOC-02', 'anchors-ref')
  const ref = await importSource(dir, 'ref', REF_SOURCE)
  const base = INPUTS.map((input) => {
    const r = runInputOnRef(ref.mod, input)
    return { key: r.key, cell: r.cell, input: r.input, held: r.held, steps: r.steps, failed: r.failed, problems: [...r.problems, ...r.verdict].map((p) => `${p.code} ${p.message}`) }
  })
  const knives = []
  for (const knife of KNIVES) {
    if (!REF_SOURCE.includes(knife.find)) {
      knives.push({ id: knife.id, title: knife.title, cell: knife.cell, find_present: false, want: knife.want, flipped: [], details: [] })
      continue
    }
    const mutated = REF_SOURCE.replace(knife.find, knife.replace)
    const mod = await importSource(dir, knife.id.toLowerCase(), mutated)
    const flipped = []
    for (const input of INPUTS) {
      const r = runInputOnRef(mod.mod, input)
      if (!r.held) flipped.push({ key: r.key, codes: r.failed })
    }
    knives.push({ id: knife.id, title: knife.title, cell: knife.cell, find_present: true, file: mod.file, sha256: mod.sha256, want: knife.want, flipped: flipped.map((f) => f.key), details: flipped })
  }
  CONTROL = { ref, base, knives }
  return CONTROL
}

/** 本格自己的那把刀（别的刀只当读数，不在这里报红）。 */
function knifeProblems(knives, ids) {
  const out = []
  for (const knife of knives) {
    if (!ids.includes(knife.id)) continue
    if (knife.find_present === false) {
      out.push(problem('KNIFE-LINE-MISSING', `${knife.id}：REF 里找不到要切的那几行（这一刀没有落点，证明不了任何事）`))
      continue
    }
    if (JSON.stringify(knife.flipped) !== JSON.stringify(knife.want)) {
      out.push(problem('KNIFE-WRONG-VECTOR',
        `${knife.id}（${knife.title}）：翻面的输入是 ${JSON.stringify(knife.flipped)}，规则推出的是 ${JSON.stringify(knife.want)}`
        + ' —— 一个变异体只证一格（mig-rules-16）：多翻说明那一支与别的规则共用同一处判据，少翻说明这刀没切到它'))
    }
  }
  return out
}

/** 三格共用的读数（SUT 版本 / 喂进去的摘要是不是算出来的 / 边界）。`push` 由各格自己给。 */
async function commonReadings(rec, push) {
  rec.readings.sut = {}
  for (const rel of ['bin/agenia-local.mjs', 'lib/local-state.mjs']) {
    const abs = stagingExists(rel) ? stagingPath(rel) : null
    rec.readings.sut[rel] = abs === null ? { missing: true } : { file: abs, bytes: readFileSync(abs).length, sha256: sha256File(abs) }
  }
  const receipt = await loadStagedModule('lib/receipt.mjs', ['findingsSetSha256'])
  const stagedSet3 = typeof receipt.mod?.findingsSetSha256 === 'function' ? receipt.mod.findingsSetSha256(ENTRIES_3) : null
  rec.readings.fed_digests = {
    report_sha256: { value: REPORT_SHA, from: 'sha256Text(REPORT_TEXT)' },
    findings_set_sha256_3: {
      value: SET_SHA_3,
      from: 'q10Digest(ENTRIES_3)（`support/verify-recompute.mjs`，测试侧第二份实现）',
      entries: ENTRIES_3.length,
      staged_lib_value: stagedSet3,
      staged_lib_note: stagedSet3 === null ? `判不了（${[...(receipt.missing ?? []), ...(receipt.errors ?? [])].join(' | ')}）` : (stagedSet3 === SET_SHA_3 ? '两个独立实现逐字相同' : '两套实现不一致'),
    },
    findings_set_sha256_0: { value: SET_SHA_0, from: 'q10Digest([])（零条发现也是合法产物）', entries: 0 },
    why: '喂进去的摘要**都是算出来的**（报告正文 / 真实发现集）；本文件没有任何手写 64 hex 当锚点。',
  }
  if (stagedSet3 !== null && stagedSet3 !== SET_SHA_3) {
    push('LOC-SET-DIGEST-SELFCHECK', `测试侧算出的 findings_set_sha256=${SET_SHA_3} ≠ 仓库 lib/receipt.mjs::findingsSetSha256=${stagedSet3} —— 两套 Q10 实现不一致，喂进去的那个摘要不能代表那三条发现`)
  }
  rec.readings.boundary = {
    findings_path_prefix_not_judged: '`findings_path` 的 `.team/` 前缀**不在本票判据里**（老板那句裁定只点名 `report_path`）：三格的 findings 产物一律落在 `.team/` 下 ⇒ 那一条没量，别把绿读成"它也管 findings"。',
    findings_set_content_not_recomputed: '`findings_set_sha256` 的**内容复算**归 `receipt-check` / `VRF-02`：本文件喂的值是**真的**（三条发现按 Q10 算出来），但闸今天不做内容复算，本格也没判它。',
    count_semantics_not_judged: '`findings_count` 只判"与产物条数一致"，**不判**"那三条发现值不值得看"。',
    cli_layer_has_no_ref: '`E_DATA_MISSING` / exit 7 / `E_ARG_SCHEMA` / exit 2 这些"谁拒、退几"只有生产臂有；刀只能证"规则那一半"能翻面。',
    not_here: '不判 `stale`（健康卡算的）· 不判 `local-fail` / `local-receipt-set` · 不判锁与原子写（`LOC-01` / `HLT-02` / `STO-*`）。',
    reject_codes: '拒绝码是**判据的一部分**：`technical` 不带 findings ⇒ `E_ARG_SCHEMA`（老板原话）；`findings_count` 与条数不符 ⇒ `E_ARG_SCHEMA`（这个字段的形状错误今天就是它）；"不在 `.team/` 下 / 不在盘上 / 拼错 / 绝对路径" ⇒ **同一个** `E_DATA_MISSING`（`job-briefs/technical-review.md:28` 已经承诺的那一句）。',
  }
}

// ═════════════════════════════════════════════════════════════════════════════
describe('integration · local anchors per field (LOC-02/03/04) · F-156 第二轮', () => {
  test('LOC-02 按字段的必填：memory-review / conversation 只交报告 ⇒ done（findings 三个锚点留 null）；technical 不带 findings ⇒ 拒 E_ARG_SCHEMA、节点停在 running、状态文件零写入；带真 findings ⇒ done', async () => {
    await runCase('LOC-02', async (rec) => {
      const problems = []
      const push = (code, msg) => problems.push(problem(code, msg))
      await commonReadings(rec, push)

      const control_ = await control()
      const own = inputsOf('LOC-02')

      // ① 生产臂：本格的六条输入，每条一个**新**工作区（`LOC-03` 也是六条）
      const rows = own.map((input) => {
        const row = runInputProduction(input)
        for (const p of [...row.problems, ...row.verdict]) push(p.code, `${row.key}（${input.title}）：${p.message}`)
        return row
      })
      rec.readings.production = rows.map((r) => ({ key: r.key, title: r.title, field: r.field, workspace: r.workspace, steps: r.steps, payload: r.payload ?? null, artifacts: r.artifacts ?? null, doc: r.doc, read: r.read, held: r.held, failed: r.failed }))

      // ② 阳性对照：同一批输入喂 REF（照裁定写的最小实现）必须全部成立
      for (const r of control_.base.filter((x) => x.cell === 'LOC-02')) {
        if (!r.held) push('CONTROL-REF-CELL', `阳性对照（照裁定写的最小实现）在 ${r.key} 没成立：${r.problems.join(' · ')} —— 要么这一条写得不可实现，要么最小实现写错了`)
      }
      rec.readings.ref = { file: control_.ref.file, sha256: control_.ref.sha256, bytes: control_.ref.bytes, rows: control_.base.filter((x) => x.cell === 'LOC-02') }

      // ③ 本格那两把刀（① 一视同仁 / ② 谁都不要 findings）
      for (const p of knifeProblems(control_.knives, ['KQ1-FIELD-BLIND', 'KQ2-TECH-WITHOUT-FINDINGS'])) push(p.code, p.message)
      rec.readings.knives = { subject: 'reference', scope: '六把刀都在**全部二十三个输入**上量（向量 = 翻面的那些 `格:输入`），所以"只翻本格"是读数不是声明', rows: control_.knives }

      // ④ 今天读到的情况
      rec.readings.situation = {
        measured_at_note: '门 2 第二轮 · 2026-10-24（本次运行现量；实现岗第二版已落盘）',
        rule: '按字段：`technical` 要 findings 三件套；`memory_review` / `conversation` 只要报告（老板 2026-10-24 选项 1）；三件套给一半两个字段都不收。',
        red_today: rows.filter((r) => !r.held).map((r) => ({ key: r.key, failed: r.failed })),
        why_red_at_gate2: '门 2 时（实现岗落地之前）`A` / `B` 会被 `E_ARG_SCHEMA: findings_path 必填…` 拒掉 —— 那是 `F1` 的现场。'
          + '今天红不红只看 `red_today`；`C` / `D` 守的是另一头：修 `F1` 时**不许**把 technical 的 findings 要求一起拆掉，'
          + '`E` / `F` 守"给一半"：三件套缺一件就必须拒（`E_ARG_SCHEMA`），不许留一个没有产物的锚点。',
      }
      caseFail(problems)
    })
  })

  test('LOC-03 findings_count 与产物条数对账：3 条 + 0 / 3 条 + 9 都拒（双向）；3 条 + 3 与空产物 + 0 收下', async () => {
    await runCase('LOC-03', async (rec) => {
      const problems = []
      const push = (code, msg) => problems.push(problem(code, msg))
      await commonReadings(rec, push)

      const control_ = await control()
      const own = inputsOf('LOC-03')

      const rows = own.map((input) => {
        const row = runInputProduction(input)
        for (const p of [...row.problems, ...row.verdict]) push(p.code, `${row.key}（${input.title}）：${p.message}`)
        return row
      })
      rec.readings.production = rows.map((r) => ({ key: r.key, title: r.title, field: r.field, workspace: r.workspace, steps: r.steps, payload: r.payload ?? null, artifacts: r.artifacts ?? null, doc: r.doc, read: r.read, held: r.held, failed: r.failed }))

      for (const r of control_.base.filter((x) => x.cell === 'LOC-03')) {
        if (!r.held) push('CONTROL-REF-CELL', `阳性对照在 ${r.key} 没成立：${r.problems.join(' · ')}`)
      }
      rec.readings.ref = { file: control_.ref.file, sha256: control_.ref.sha256, bytes: control_.ref.bytes, rows: control_.base.filter((x) => x.cell === 'LOC-03') }

      for (const p of knifeProblems(control_.knives, ['KQ3-COUNT-NOT-RECONCILED'])) push(p.code, p.message)
      rec.readings.knives = { subject: 'reference', scope: 'KQ3 在全部二十三个输入上量', rows: control_.knives }

      rec.readings.situation = {
        measured_at_note: '门 2 第二轮 · 2026-10-24（本次运行现量；实现岗第二版已落盘）',
        rule: '`findings_count` 必须等于 findings 产物里 `findings` 数组的条数（`F2`：收了不核 ⇒ 一个 `0` 就能把三条发现说成"没发现"）；'
          + '产物**在盘上却读不出条数** ⇒ `E_DATA_CORRUPT`（与"文件不在"的 `E_DATA_MISSING` 分开）。',
        red_today: rows.filter((r) => !r.held).map((r) => ({ key: r.key, failed: r.failed })),
        why_red_at_gate2: '门 2 时（实现岗落地之前）`A`（3 条 + 0）与 `B`（3 条 + 9）都 `done` —— 闸只判"是 ≥0 的整数"，没人拿它跟产物对账。'
          + '`C` / `D` 是"诚实计数与零条发现"那一头；`E` / `F` 是"文件在、但读不出来"那一头（`E_DATA_CORRUPT`）。今天红不红只看 `red_today`。',
      }
      caseFail(problems)
    })
  })

  test('LOC-04 锚点必须落到 .team/ 里的真文件、落盘记规范形（首段固定小写 .team/、其余按磁盘真名）：.team/… · ./.team/… · retro/…（.team 相对）· 反斜杠 · 工作区内绝对路径 · .TEAM/…（前缀换大小写） 六种写法收下并记成 .team/<…>；README.md（在 .team/ 外）· 文件不在 · ../… 穿出去 · 包外绝对路径 五种写法同一个诊断 E_DATA_MISSING · exit 7', async () => {
    await runCase('LOC-04', async (rec) => {
      const problems = []
      const push = (code, msg) => problems.push(problem(code, msg))
      await commonReadings(rec, push)

      const control_ = await control()
      const own = inputsOf('LOC-04')

      const rows = own.map((input) => {
        const row = runInputProduction(input)
        for (const p of [...row.problems, ...row.verdict]) push(p.code, `${row.key}（${input.spelling}）：${p.message}`)
        return row
      })
      rec.readings.production = rows.map((r) => ({ key: r.key, spelling: own.find((x) => keyOf(x) === r.key)?.spelling ?? null, title: r.title, field: r.field, workspace: r.workspace, steps: r.steps, payload: r.payload ?? null, artifacts: r.artifacts ?? null, doc: r.doc, read: r.read, held: r.held, failed: r.failed }))

      // 十一种写法今天各是什么下场（读数表：一条路径五种结局，就是 `F3`）
      const spellings = rows.map((r) => {
        const input = own.find((x) => keyOf(x) === r.key)
        const mark = r.steps.find((s) => s.kind === 'mark') ?? null
        const node = r.doc?.technical ?? null
        return {
          key: r.key,
          spelling: input?.spelling ?? null,
          report_path_fed: r.payload?.report_path ?? null,
          expect: input?.expect ?? null,
          today: mark === null ? null : { exit: mark.exit, code: mark.code, ok: mark.ok, state_written: mark.state_written },
          node_state_today: node === null ? null : node.state,
          node_report_path_today: node === null ? null : node.report_path,
          stored_is_canonical_today: node === null ? null : node.report_path === REPORT_REL,
          fed_was_canonical: (r.payload?.report_path ?? null) === REPORT_REL,
          held: r.held,
        }
      })
      rec.readings.spellings = {
        table: spellings,
        diagnosis_set: [...new Set(spellings.filter((s) => s.expect === 'reject').map((s) => s.today?.code ?? '(无码)'))],
        why: '五个"拒"必须是**同一个**诊断（`E_DATA_MISSING` · exit 7）；六个"收"必须把节点上的 `report_path` 记成**规范形**'
          + '（首段固定小写 `.team/`、其余段按磁盘真名）—— 见 `canonical_store`（`./` · `.team` 相对 · 反斜杠 · 绝对路径）'
          + ' 与 `case_folding`（`.TEAM/…`）。',
      }
      /**
       * 🔴 **规范形落盘的正面读数**：调用方用了别的拼法（`./` / `.team` 相对 / 反斜杠 / 绝对路径 / `.TEAM`）时，
       * 节点上记的必须仍是规范形：**首段固定小写 `.team/`**、其余段**按磁盘真名**（`path.relative` 的结果）、正斜杠。
       * 这一节与那几条断言是**同一次读数**：
       * 断言在 `doneProblems`（`reportPath: REPORT_REL`），这里只是把它逐行写出来，好让人一眼看见"fed ≠ stored"。
       */
      rec.readings.canonical_store = {
        canonical_form: REPORT_REL,
        rows: rows
          .filter((r) => own.find((x) => keyOf(x) === r.key)?.expect === 'ok')
          .map((r) => {
            const fed = r.payload?.report_path ?? null
            const stored = r.doc?.technical?.report_path ?? null
            return { key: r.key, fed: fed, stored: stored, fed_was_noncanonical: fed !== REPORT_REL, stored_is_canonical: stored === REPORT_REL, held: r.held }
          }),
        why: '`fed_was_noncanonical: true` 且 `stored_is_canonical: true` 的那几行就是"归一化真的落到了盘上"；'
          + '只归一化不落盘（`KQ5`）时，那几行的 `stored` 会退回调用方写法的原文。',
      }

      /**
       * 🔴 **大小写那一条自己的读数**（`LOC-04:K`）：本平台（Windows）**不分大小写** —— `.TEAM/…` 与 `.team/…`
       * 是同一个目录，所以它必须被**收下**、且节点上记的是**规范形**：**首段固定小写 `.team/`**，
       * 其余段**按磁盘真名**（不是"整串转小写"—— 文件名大小写由盘上那一份说了算）。
       * 字符串前缀比较（`startsWith`）会把 `.TEAM/…` 判成"在外"；`KQ6` 就是把这把尺子换回前缀比较，只翻这一格。
       */
      {
        const k = rows.find((r) => r.key === 'LOC-04:K') ?? null
        const fedK = k?.payload?.report_path ?? null
        const storedK = k?.doc?.technical?.report_path ?? null
        rec.readings.case_folding = {
          key: 'LOC-04:K',
          fed: fedK,
          stored: storedK,
          accepted: k?.held === true,
          fed_has_upper_prefix: fedK === '.TEAM/retro/2026-10-24/技术评审.md',
          stored_is_canonical: storedK === REPORT_REL,
          canonical_rule: '首段固定小写 `.team/`；其余段按磁盘真名（`path.relative(teamRoot, abs)` 的结果），正斜杠',
          platform: process.platform,
          why: '位置判定跟**平台路径语义**走（`path.relative`），不是字符串前缀比较；'
            + '这一步今天由实现岗 `lib/local-state.mjs::insideTeam()` 提供，`KQ6` 证明"换回前缀比较就红"。',
        }
      }

      for (const r of control_.base.filter((x) => x.cell === 'LOC-04')) {
        if (!r.held) push('CONTROL-REF-CELL', `阳性对照在 ${r.key} 没成立：${r.problems.join(' · ')}`)
      }
      rec.readings.ref = { file: control_.ref.file, sha256: control_.ref.sha256, bytes: control_.ref.bytes, rows: control_.base.filter((x) => x.cell === 'LOC-04') }

      // 本格三把刀：④ 不再要求落在 `.team/` 下 · ⑤ 归一化了却按调用方写法落盘 · ⑥ 大小写敏感的前缀比较
      for (const p of knifeProblems(control_.knives, ['KQ4-NO-TEAM-PREFIX', 'KQ5-STORE-AS-WRITTEN', 'KQ6-CASE-SENSITIVE-CONTAINMENT'])) push(p.code, p.message)
      rec.readings.knives = { subject: 'reference', scope: '六把刀都在**全部二十三个输入**上量（向量 = 翻面的那些 `格:输入`）', rows: control_.knives }

      rec.readings.situation = {
        measured_at_note: '门 2 第二轮 · 2026-10-24（本次运行现量；老板改判"收 + 归一化"之后）',
        rule: '`report_path` 必须解析到 `<工作区>/.team/` 里的一个真文件（`.team/…` / `.team` 相对 / `./` / 反斜杠 / 工作区内绝对路径 / **大小写不同的前缀**都收），'
          + '**节点上一律记规范形**（**首段固定小写 `.team/`、其余段按磁盘真名**、正斜杠）；缺 / 落在 `.team/` 外 / `..` 穿出去 ⇒ 同一个 `E_DATA_MISSING` · exit 7。',
        red_today: rows.filter((r) => !r.held).map((r) => ({ key: r.key, failed: r.failed })),
        why_red_at_gate2: '门 2 第一版（实现岗只收规范形的那一版）是：`C`/`D`/`E`/`G` 四种"应当收 + 归一化"的写法被 `E_DATA_MISSING` 拒掉，'
          + '而 `B`/`H`/`I`/`F`/`J` 拒得对 —— 同一版实现还把 `RCP-03` / `VRF-02` 的正例打红了（它们用 `.team` 相对写法），'
          + '那是这次改判的直接理由。`K` 那条腿在**大小写敏感的前缀比较**下会被判"在外"（第 4 关复审 round 2 的 `F3`）——'
          + '实现岗 14:54 的 `insideTeam()` 之后它收下并记规范形（首段 `.TEAM` → `.team`，其余按磁盘真名），今天红不红只看 `red_today`。',
      }
      caseFail(problems)
    })
  })
})
