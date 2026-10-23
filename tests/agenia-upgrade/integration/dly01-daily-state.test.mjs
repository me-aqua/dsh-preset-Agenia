/**
 * `DLY-01` / `DLY-02` · **`F-155`** —— "今天开过工"这件事既没有载体，也没有署名。
 *
 * 病根（2026-10-23 现量，见定形 `.team/leader/2026-10-23/spec-F-155.md`）：
 *   · `daily-start`（`presets/agenia/bin/agenia-brain.mjs:471-495`）**每次调用都覆盖** `session_id`，
 *     而且只记"最后一次"—— 同一天第二个会话一写，就再也看不出**谁开的这一天**；
 *   · `health-read` 在 `daily` 在、`local` 不在那一支只会说一句通用的
 *     「今天开过工（每日状态在），但本地状态还没有」—— 读的人不知道是不是**本会话**开的。
 *
 * 口径来源（一份定形 + 一份契约）：
 *   · 定形 `spec-F-155.md`「A · 幂等 + 一天两端」「B · 卡片说真话」「C · 契约」；
 *   · `CONTRACT.md` §11（每日状态的字段表 + `health-read` 的加性可选键）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 两格（`want` 照契约手写，**不从实现反推**）
 *
 * `DLY-01`（写面 · `--op daily-start`，真子进程 + 每个格子一个带 marker 的临时工作区）：
 *   A1 两次调用、两个不同的 `session_id` ⇒ `first_*` 是第一次的、`last_*` 是第二次的、`seen_count === 2`，
 *      其余键（`project` / `workspace` / `snapshot` / `distribution` / `totals` / `char_metric`）照旧。
 *   A2 **旧形状**（只有 `session_id` + `updated_at`）被调一次 ⇒ 仍读得懂，老的 `session_id` 就是
 *      `first_session_id`、老的 `updated_at` 就是 `first_at`（同一个**时刻**即可，不要求同一个写法）。
 *   A3 第一次调用就**没带** `session_id` ⇒ `first_session_id === null`、`first_at` 照写（记的是"第一次调用"）、
 *      `last_session_id === null`、`seen_count === 1`。
 *   A4 先由 `session-1` 开过，再一次调用**没带** `session_id` ⇒ `first_*` 保持原样、
 *      `last_session_id === null`、`last_seen_at` 前进、`seen_count === 2`（规则 3 的"stays whatever it was"）。
 * `DLY-02`（读面 · `--op health-read`，`daily` 在、`local` 不在那一支）：
 *   B1 没有 `daily`、也没有 `local` ⇒ `HOLD` + `E_NO_UPDATE_TODAY`，detail 仍是「今天还没有开工痕迹」。
 *   B2 `first_session_id` **≠** payload 的 `session_id` ⇒ `RED` + `E_DATA_MISSING`，detail 点名
 *      `first_session_id` 与 `first_at`（逐字），并说**本会话不是**开这一天的人。
 *   B3 `first_session_id` **=** payload 的 `session_id` ⇒ `RED` + `E_DATA_MISSING`，detail 说本会话**刚开工**。
 *   B4 payload **没有** `session_id` ⇒ `RED` + `E_DATA_MISSING`，detail 仍点名 `first_session_id` / `first_at`，
 *      但**不冒充知道是谁**（既不说「刚开工」、也不说「本会话不是」）。
 *   B5 端到端：真 `daily-start` 写的那一份（`first_*` 由写面记下），卡片读得出"谁开的、本会话是不是它"。
 *   ⚠️ B2/B3/B4 的 `daily` 夹具里 `session_id`（旧的那个单值键）= **最后一次调用的人**、
 *      `first_session_id` = **开这一天的人**，两者**故意不同** —— 谁去读旧那个单值键，B2 / B3 当场翻面。
 *
 * 四条控制 —— **它们才是"红"这个字的合法性来源**：
 *   · `REF`：本文件里那两份**照 §11 写的最小实现**（`dailyStartDoc(旧文件, 本次调用)` /
 *     `healthDetailOf(那份入参)`）喂同样的格子 ⇒ 每一格都必须成立。它证明这些格子**是可实现的**
 *     （不是"永远红"），且缺哪一项就红在哪一格（`mig-rules-14`）。
 *   · `KNIFE`：四把刀打在 REF 的字节上（**不碰 `presets/**`**：生产里那几行存在之前没有字节可删）：
 *       ① 老形状**不升级**（旧文件的 `session_id` / `updated_at` 不当 `first_*`）⇒ 只该 A2 翻面；
 *       ② 老形状**连同新形状一起不读**（每次从零写）—— 刀①的字面读法 ⇒ A1 / A2 / A4 一起翻面；
 *       ③ `first_*` **每次调用都覆盖** ⇒ A1 / A2 / A4（**算术上必然连带 A2**：老形状那一格的整个意思
 *          就是"升级上来的 `first_*` 活过这一次调用"，而这一刀正是覆盖它）；
 *       ④ 刀③的**窄形状**（只有旧文件已经是新形状时才覆盖）⇒ A1 / A4 —— 它才是"只翻两次调用"的那一刀。
 *     每一刀的实测向量都写进读数；向量与**从契约推出来的**不一致 ⇒ `KNIFE-WRONG-VECTOR`
 *     （一个变异体只证一格：多翻说明那一支与别的格子共用同一处判据，少翻说明这刀没切到它）。
 *     ⚠️ 定形验收 #3 的「(ii) 只翻两次调用那一格」对**每次都覆盖**这种刀**不成立**（算术原因见上），
 *     所以本格两把都造、两把的向量都记：窄的那把证明"一格一刀"，宽的那把记它的真实代价。
 *   · `STATE`：每一格先核对**前置**（工作区是新的、`local` 不在、`daily` 在/不在正是这一格要的）——
 *     前置不成立的话，后面读到的就不是这一格的东西（与"字段写错了"分开报）。
 *   · `CARD FILE`：`health-read` 判的是它**落盘**的那张卡（`<ws>/.team/brain/<day>/health.json`），
 *     不只判 stdout —— 两句必须说同一件事。
 *
 * 边界（这一格**不覆盖**什么，写清，别假装更宽）：
 *   1. **不改** `status` 的四个值、**不改**任何 reason 码：B2/B3/B4 的 `RED` + `E_DATA_MISSING`、
 *      B1 的 `HOLD` + `E_NO_UPDATE_TODAY` 都是**今天就已经成立**的那一半，本格只判 `detail` 里多出来的"谁"。
 *   2. **不判** `session_id`（那个旧的单值键）的取值：契约只要求它**键还在**（不另立权威），
 *      读的人要看 `first_session_id` / `last_session_id`。
 *   3. **不管** `local/<day>.json` 谁来写（那是两场每日评审的事，定形明写"另开票"）——
 *      所以 B 格全部是"`local` 不在"的现场，一格都不造 `local`。
 *   4. **不判** audit 行、不判原子写的实现方式：那是 `§B3.7` 与 `STO-*` 的事。
 *   5. `daily` 夹具里的 `distribution` / `totals` / `char_metric` 是**照今天的形状抄的常量**，
 *      只为了"其余键照旧"这一条能在 REF 臂上成立；它们的值不参与任何判据（卡片不读它们）。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENV } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256File, stagingReadings } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir, normKey } from '../support/root-guard.mjs'
import { fixtureDir } from '../support/verify-recompute.mjs'
import { runBrain, stagingExists, stagingPath } from '../support/sut.mjs'

before(() => {
  preflight()
})

// ── 现场常量（都从**这一次调用**里量，不从"我算的"里取）──────────────────────
const DAY = '2026-10-23'
const PROJECT = 'harness'
/** 注入式时钟的两行（op 自己会把它们变成 `toISOString()` 那一份，期望值取信封里的 `at`）。 */
const T1 = '2026-10-23T20:40:00+08:00'
const T2 = '2026-10-23T20:52:00+08:00'
const S_ONE = 'session-dly01-first-0001'
const S_TWO = 'session-dly01-second-0002'
const S_LEGACY = 'session-dly01-legacy-0003'
/** 旧形状文件里那个"老 `updated_at`"（比 `T2` 早，且**不是**一次调用写的）—— 只用来验"升上来时认得它"。 */
const OLD_AT = '2026-10-20T03:05:00.000Z'
/** B 格夹具：开这一天的人 ≠ 最后一次调用的人（谁读旧那个单值键，B2/B3 当场翻面）。 */
const OPENER_A = 'session-dly02-opener-aaaa'
const CALLER_B = 'session-dly02-caller-bbbb'
const FIRST_AT_STORED = '2026-10-23T12:40:00.000Z'
const LAST_AT_STORED = '2026-10-23T12:52:00.000Z'

/** §B3.4 的四类分布（只为了让"其余键照旧"在 REF 臂上成立；值不参与判据）。 */
const DIST4 = [
  { typeId: 'general', typeName: '【底层通用】', count: 0, chars: 0 },
  { typeId: 'boss', typeName: '【关于老板】', count: 0, chars: 0 },
  { typeId: 'machine', typeName: '【关于本机】', count: 0, chars: 0 },
  { typeId: 'project', typeName: '【关于某个项目】', count: 0, chars: 0 },
]
const CHAR_METRIC = { unit: 'unicode-code-point', normalization: 'strip-bom+lf', scope: 'entry.text', schema: 1 }

/** 契约 §11 的五个新键 + **今天就有**的那些键（目标形状 = 两者之并，一个不多一个不少）。 */
const NEW_KEYS = ['first_session_id', 'first_at', 'last_session_id', 'last_seen_at', 'seen_count']
const OLD_KEYS = ['schema', 'day', 'project', 'workspace', 'session_id', 'snapshot', 'distribution', 'totals', 'char_metric', 'updated_at']

/** 卡片的三个锚点（契约 §11 逐字：`刚开工` / `本会话不是` / HOLD 那句保持）。
 *  ⚠️ "本会话不是"那一句话有**两种语序**：`本会话不是…` 与 `…不是本会话…`。第一句是契约要求的写法（判据认它）；
 *  另外两格（本会话就是 opener / 没带 session_id）**两种语序都不许出现**（不然一句"不是本会话开的"
 *  就能在"判不了是谁"那一格里悄悄变成一句断言）。 */
const ANCHOR_SAME = '刚开工'
const ANCHOR_OTHER = '本会话不是'
const ANCHOR_OTHER_SWAPPED = '不是本会话'
const HOLD_PHRASE = '今天还没有开工痕迹'

// ── 小工具 ────────────────────────────────────────────────────────────────
const dailyPath = (ws) => path.join(ws, '.team', 'state', 'daily', `${DAY}.json`)
const localPath = (ws) => path.join(ws, '.team', 'state', 'local', `${DAY}.json`)
const healthPath = (ws) => path.join(ws, '.team', 'brain', DAY, 'health.json')
const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && normKey(a) === normKey(b)
const sameInstant = (a, b) => {
  const ta = Date.parse(String(a ?? ''))
  const tb = Date.parse(String(b ?? ''))
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonFile(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
}

/**
 * 跑一节时把**注入式时钟**挪到 `iso`，跑完（**无论成不成**）还原 —— 运行根那一份是共享的，
 * 留在别人那一格里会让后面每一格的时间读数跟着漂。
 */
function withClock(iso, fn) {
  const file = process.env[ENV.NOW_FILE]
  if (!file) throw new Error(`AGENIA_NOW_FILE 没设置 —— 这一票的时间全靠它（${file}）`)
  const prior = existsSync(file) ? readFileSync(file, 'utf8') : null
  writeFileSync(file, `${iso}\n`, 'utf8')
  try {
    return fn()
  } finally {
    writeFileSync(file, prior === null ? '' : prior, 'utf8')
  }
}

/** 每个格子一个**带 marker 的**临时工作区（脑根仍用运行根那一份 `AGENIA_TEST_DATA_ROOT`）。 */
function makeWorkspace(caseId, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${caseId.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/** 落一份源码到运行根之下并 import 它（URL 带哈希 ⇒ 同一进程里不会拿到缓存里的旧字节）。 */
async function importSource(dir, name, source) {
  const sub = path.join(dir, name)
  mkdirSync(sub, { recursive: true })
  const file = path.join(sub, 'daily.mjs')
  writeFileSync(file, source, 'utf8')
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex')
  const mod = await import(`${pathToFileURL(file).href}?sha256=${sha256}`)
  return { mod, file, sha256, bytes: Buffer.byteLength(source, 'utf8') }
}

/** 一次 `--op daily-start`（真子进程）。返回 `{ok, at, session_id, exit_code, message}`。 */
function dailyStart(ws, { at, sessionId }) {
  const payload = { day: DAY, project: PROJECT }
  if (sessionId !== null) payload.session_id = sessionId
  let res = null
  withClock(at, () => {
    res = runBrain('daily-start', payload, { extra: ['--workspace', ws] })
  })
  const message = res === null
    ? '子进程没回来'
    : `exit=${res.exit_code} · code=${res.json?.error?.code ?? '(无码)'} · stdout=${res.stdout.trim().slice(0, 240)} · stderr=${res.stderr.trim().slice(0, 240)}`
  return {
    ok: res !== null && res.exit_code === 0 && res.json?.ok === true,
    at: typeof res?.json?.at === 'string' ? res.json.at : null,
    session_id: sessionId,
    exit_code: res?.exit_code ?? null,
    message,
  }
}

/** 一次 `--op health-read`（真子进程）。返回 `{ok, status, code, detail, reasons, exit_code, message}`。 */
function healthRead(ws, sessionId) {
  const payload = { day: DAY, project: PROJECT }
  if (sessionId !== null) payload.session_id = sessionId
  const res = runBrain('health-read', payload, { extra: ['--workspace', ws] })
  const reasons = Array.isArray(res.json?.health?.reasons) ? res.json.health.reasons : null
  return {
    ok: res.exit_code === 0 && res.json?.ok === true,
    status: res.json?.health?.status ?? null,
    exit_code: res.exit_code,
    code: reasons === null || reasons.length === 0 ? null : (reasons[0]?.code ?? null),
    detail: reasons === null || reasons.length === 0 ? null : String(reasons[0]?.detail ?? ''),
    reasons,
    on_disk: readJsonOrNull(healthPath(ws)),
    message: `exit=${res.exit_code} · code=${res.json?.error?.code ?? '(无码)'} · stdout=${res.stdout.trim().slice(0, 240)} · stderr=${res.stderr.trim().slice(0, 240)}`,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// DLY-01 的 REF：照 `CONTRACT.md` §11 写的**最小实现**（阳性对照 + 三把刀的载体）
// ═════════════════════════════════════════════════════════════════════════════
const REF_DAILY_SOURCE = `// DLY-01 的阳性对照：照 CONTRACT.md §11 写的最小实现（**不是生产代码**，只住在运行根里）。
/** 旧文件里认"第一次那一对"：新形状读 first_*；旧形状（只有 session_id / updated_at）读那一对。 */
function firstPairOf(old) {
  const hasFirst = old !== null && Object.prototype.hasOwnProperty.call(old, 'first_session_id')
  const firstSessionId = old === null ? null : hasFirst ? (old.first_session_id ?? null) : (old.session_id ?? null)
  const firstAt = old === null ? null : hasFirst ? (old.first_at ?? null) : (old.updated_at ?? null)
  return { hasFirst, firstSessionId, firstAt }
}

/** 一次调用 ⇒ 盘上那份每日状态（prev = 旧文件，可能 null，也可能是旧形状）。 */
export function dailyStartDoc(prev, call) {
  const old = prev === null || prev === undefined ? null : prev
  const pair = firstPairOf(old)
  const firstSessionId = old === null ? (call.session_id ?? null) : pair.firstSessionId
  const firstAt = old === null ? call.at : pair.firstAt
  const seenBefore = old === null || !Number.isInteger(old.seen_count) ? 0 : old.seen_count
  return {
    schema: 1,
    day: call.day,
    project: call.project ?? null,
    workspace: call.workspace ?? null,
    session_id: call.session_id ?? null,
    snapshot: call.snapshot ?? null,
    distribution: call.distribution,
    totals: call.totals,
    char_metric: { ...call.char_metric },
    first_session_id: firstSessionId ?? null,
    first_at: firstAt ?? null,
    last_session_id: call.session_id ?? null,
    last_seen_at: call.at,
    seen_count: seenBefore + 1,
    updated_at: call.at,
  }
}
`

/**
 * 三把刀：`find` 必须在 `REF_DAILY_SOURCE` 里**逐字**存在（找不到 ⇒ `KNIFE-LINE-MISSING`，这一刀没有落点）。
 * 期望向量是**从契约推出来的**（不是跑完再抄）：写完才准跑，跑出来不一致就报 `KNIFE-WRONG-VECTOR`。
 */
const KNIVES = [
  {
    id: 'K1-OLD-SHAPE-NO-UPGRADE',
    title: '刀① 老形状不升级（旧 session_id / updated_at 不当 first_*）',
    find: `  const firstSessionId = old === null ? (call.session_id ?? null) : pair.firstSessionId
  const firstAt = old === null ? call.at : pair.firstAt`,
    replace: `  const firstSessionId = pair.hasFirst ? pair.firstSessionId : (call.session_id ?? null)
  const firstAt = pair.hasFirst ? pair.firstAt : call.at`,
    want: ['A2'],
  },
  {
    id: 'K1W-NO-MERGE-AT-ALL',
    title: '刀①的字面读法：旧文件完全不读（每次从零写）',
    find: `  const firstSessionId = old === null ? (call.session_id ?? null) : pair.firstSessionId
  const firstAt = old === null ? call.at : pair.firstAt
  const seenBefore = old === null || !Number.isInteger(old.seen_count) ? 0 : old.seen_count`,
    replace: `  const firstSessionId = call.session_id ?? null
  const firstAt = call.at
  const seenBefore = 0`,
    want: ['A1', 'A2', 'A4'],
  },
  {
    id: 'K2-FIRST-OVERWRITTEN',
    title: '刀③ first_* 每次调用都覆盖（刀②的字面读法）',
    find: `  const firstSessionId = old === null ? (call.session_id ?? null) : pair.firstSessionId
  const firstAt = old === null ? call.at : pair.firstAt`,
    replace: `  const firstSessionId = call.session_id ?? null
  const firstAt = call.at`,
    // ⚠️ 算术上**必然**连带 A2：老形状那一格的整个意思就是"升级上来的 first_* 活过这一次调用"，
    //    而这一刀正是"这次调用把它覆盖掉"。所以（A1, A2, A4）是这一刀的真实向量 ——
    //    "只翻两次调用那一格"这句话对"每次调用都覆盖"这种刀**不成立**（定形验收 #3 的(ii) 只对**窄**那把成立）。
    want: ['A1', 'A2', 'A4'],
  },
  {
    id: 'K2N-FIRST-OVERWRITTEN-NEW-SHAPE-ONLY',
    title: '刀③的窄形状：只有"旧文件已经是新形状"时才覆盖 first_*（老形状升级那一格不受影响）',
    find: `  const firstSessionId = old === null ? (call.session_id ?? null) : pair.firstSessionId
  const firstAt = old === null ? call.at : pair.firstAt`,
    replace: `  const firstSessionId = pair.hasFirst ? (call.session_id ?? null) : old === null ? (call.session_id ?? null) : pair.firstSessionId
  const firstAt = pair.hasFirst ? call.at : old === null ? call.at : pair.firstAt`,
    want: ['A1', 'A4'],
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// DLY-02 的 REF：卡片那三句话（照 `CONTRACT.md` §11 写的最小实现）
// ═════════════════════════════════════════════════════════════════════════════
const REF_HEALTH_SOURCE = `// DLY-02 的阳性对照：照 CONTRACT.md §11 写的**最小实现**（**不是生产代码**，只住在运行根里）。
const HOLD = '今天还没有开工痕迹（既无本地状态也无每日状态）'

/**
 * 那一支的 detail：daily 在、local 不在。
 * · 没带 session_id ⇒ 只报"谁开的"，**不冒充**知道本会话是谁；
 * · 带且等于 first_session_id ⇒ 本会话刚开工；
 * · 带且不等于 ⇒ 点名"谁开的"，并说本会话不是它。
 */
export function healthDetailOf(x) {
  const opener = '首次开工是 ' + x.first_session_id + '（' + x.first_at + '）'
  if (!x.session_id) return '今天开过工（每日状态在，' + opener + '），但本地状态还没有 —— 本地双评审没启动；本次调用没有带 session_id，判不了是谁开的'
  if (x.session_id === x.first_session_id) return '今天开过工（每日状态在，本会话刚开工：' + opener + '），但本地状态还没有 —— 本地双评审没启动'
  return '今天开过工（每日状态在，' + opener + '），但本地状态还没有 —— 本地双评审没启动；本会话不是开这一天的人'
}

/** 没有 daily、也没有 local 那一支（契约 §11：这句**保持**）。 */
export function holdDetailOf() {
  return HOLD
}
`

// ═════════════════════════════════════════════════════════════════════════════
// 断言小工具：每条返回 `{code, message}`，`null` 表示成立
// ═════════════════════════════════════════════════════════════════════════════
const eq = (code, got, want, why) => (JSON.stringify(got) === JSON.stringify(want)
  ? null
  : { code, message: `${why}：期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}` })

const instant = (code, got, want, why) => (sameInstant(got, want)
  ? null
  : { code, message: `${why}：期望与 ${JSON.stringify(want)} 同一个时刻，实得 ${JSON.stringify(got)}` })

const compacts = (list) => list.filter((p) => p !== null)

// ── "其余键照旧"（契约 §11 第 4 条）：每个键都在、形状与今天一样、更新的是 `updated_at` ──────────
function shapeProblems(prevDoc, doc, call, ws) {
  const where = '其余键照旧'
  const keys = doc === null ? [] : Object.keys(doc)
  const want = [...OLD_KEYS, ...NEW_KEYS]
  return compacts([
    doc === null ? { code: 'DLY-NO-FILE', message: `${where}：读不到每日状态文件（${dailyPath(ws)}）—— 写面没落盘` } : null,
    doc === null ? null : (want.every((k) => keys.includes(k)) ? null : {
      code: 'DLY-SHAPE-KEYS',
      message: `${where}：目标形状必须含 ${JSON.stringify(want)}，实得 ${JSON.stringify(keys)}（缺 ${JSON.stringify(want.filter((k) => !keys.includes(k)))}）`,
    }),
    doc === null ? null : (keys.every((k) => want.includes(k)) ? null : {
      code: 'DLY-SHAPE-KEYS',
      message: `${where}：不许**多出**契约没写的键，实得多出 ${JSON.stringify(keys.filter((k) => !want.includes(k)))}`,
    }),
    eq('DLY-SHAPE-VALUES', doc?.schema, 1, `${where}：schema`),
    eq('DLY-SHAPE-VALUES', doc?.day, DAY, `${where}：day`),
    eq('DLY-SHAPE-VALUES', doc?.project, PROJECT, `${where}：project`),
    doc !== null && samePath(doc?.workspace, ws) ? null : { code: 'DLY-SHAPE-VALUES', message: `${where}：workspace 必须是这次调用的工作区，实得 ${JSON.stringify(doc?.workspace)}` },
    doc === null || Array.isArray(doc.distribution) && doc.distribution.length === 4 ? null : { code: 'DLY-SHAPE-VALUES', message: `${where}：distribution 必须仍是四项（§B3.4），实得 ${JSON.stringify(doc?.distribution)}` },
    doc !== null && typeof doc?.totals === 'object' && doc.totals !== null && typeof doc.totals.count === 'number' && typeof doc.totals.chars === 'number' ? null : { code: 'DLY-SHAPE-VALUES', message: `${where}：totals 必须仍是 {count, chars}，实得 ${JSON.stringify(doc?.totals)}` },
    doc !== null && typeof doc?.char_metric === 'object' && doc.char_metric !== null && !Array.isArray(doc.char_metric) ? null : { code: 'DLY-SHAPE-VALUES', message: `${where}：char_metric 必须仍是对象，实得 ${JSON.stringify(doc?.char_metric)}` },
    doc === null ? null : eq('DLY-SHAPE-KEYS', Object.keys(doc).includes('session_id'), true, `${where}：旧那个 session_id 键不许被删（契约：键还在，但不再承重）`),
    doc === null ? null : instant('DLY-UPDATED-AT', doc.updated_at, call.at, `${where}：updated_at 照旧 = 本次调用的时间`),
    prevDoc === null || doc === null ? null : eq('DLY-SHAPE-VALUES', doc.char_metric, prevDoc.char_metric, `${where}：char_metric 两次调用之间不许变`),
    prevDoc === null || doc === null ? null : eq('DLY-SHAPE-VALUES', doc.totals, prevDoc.totals, `${where}：totals 两次调用之间不许变`),
    prevDoc === null || doc === null ? null : eq('DLY-SHAPE-VALUES', doc.distribution, prevDoc.distribution, `${where}：distribution 两次调用之间不许变`),
    prevDoc === null || doc === null ? null : eq('DLY-SHAPE-VALUES', doc.snapshot, prevDoc.snapshot, `${where}：snapshot 两次调用之间不许变`),
  ])
}

/** 旧形状夹具（**只有** `session_id` + `updated_at`；契约 §11② 的形状）。 */
const oldShapeDoc = (ws) => ({
  schema: 1,
  day: DAY,
  project: PROJECT,
  workspace: ws,
  session_id: S_LEGACY,
  snapshot: null,
  distribution: DIST4,
  totals: { count: 0, chars: 0 },
  char_metric: CHAR_METRIC,
  updated_at: OLD_AT,
})

/**
 * DLY-01 的四格。`calls[i].session_id === null` = 那次调用**没带** `session_id`（payload 里没有这个键）。
 * `seed(ws)` = 调用之前盘上那份旧文件（`null` = 这一格从零开始）。
 */
const A_CELLS = [
  {
    key: 'A1',
    title: '两次调用、两个不同的 session_id',
    rule: '契约 §11①：first_* 永不覆盖、last_* 是最后一次、seen_count 累计',
    seed: () => null,
    calls: [{ at: T1, session_id: S_ONE }, { at: T2, session_id: S_TWO }],
    check(docs, calls) {
      const doc = docs[1]
      const prev = docs[0]
      return compacts([
        eq('DLY-FIRST-SESSION', doc?.first_session_id, S_ONE, 'first_session_id 必须是**第一次调用**的那个（此后永不覆盖）'),
        instant('DLY-FIRST-AT', doc?.first_at, calls[0].at, 'first_at 必须是**第一次调用**的时间（永不覆盖）'),
        eq('DLY-LAST-SESSION', doc?.last_session_id, S_TWO, 'last_session_id 必须是最后一次调用的那个'),
        instant('DLY-LAST-SEEN', doc?.last_seen_at, calls[1].at, 'last_seen_at 必须是最后一次调用的时间'),
        eq('DLY-SEEN-COUNT', doc?.seen_count, 2, 'seen_count 必须是 2（累计被调用几次）'),
        ...shapeProblems(prev, doc, calls[1], calls[1].ws),
      ])
    },
  },
  {
    key: 'A2',
    title: '旧形状文件（只有 session_id + updated_at）被调一次',
    rule: '契约 §11②：老 session_id ⇒ first_session_id、老 updated_at ⇒ first_at（同一个时刻即可）',
    seed: (ws) => oldShapeDoc(ws),
    calls: [{ at: T2, session_id: S_TWO }],
    check(docs, calls) {
      const doc = docs[0]
      return compacts([
        eq('DLY-OLD-FIRST-SESSION', doc?.first_session_id, S_LEGACY, '旧形状升级：老的 session_id 必须成为 first_session_id'),
        instant('DLY-OLD-FIRST-AT', doc?.first_at, OLD_AT, '旧形状升级：老的 updated_at 必须成为 first_at（同一个时刻即可，不要求同一个写法）'),
        eq('DLY-LAST-SESSION', doc?.last_session_id, S_TWO, 'last_session_id 必须是这次调用的那个'),
        instant('DLY-LAST-SEEN', doc?.last_seen_at, calls[0].at, 'last_seen_at 必须是这次调用的时间'),
        eq('DLY-SEEN-COUNT', doc?.seen_count, 1, '老文件没有 seen_count ⇒ 这一次是第 1 次（累计口径不许凭空 +1）'),
        ...shapeProblems(null, doc, calls[0], calls[0].ws),
      ])
    },
  },
  {
    key: 'A3',
    title: '第一次调用就没带 session_id',
    rule: '契约 §11③：first_session_id 从来没有过 ⇒ null；first_at 照写（记的是"第一次调用"这件事）',
    seed: () => null,
    calls: [{ at: T1, session_id: null }],
    check(docs, calls) {
      const doc = docs[0]
      return compacts([
        eq('DLY-NOSESSION-FIRST', doc?.first_session_id, null, '从来没带过 session_id ⇒ first_session_id 必须是 null'),
        instant('DLY-NOSESSION-FIRST-AT', doc?.first_at, calls[0].at, 'first_at 记的是**第一次调用**的时间，不带 session_id 也照写'),
        eq('DLY-NOSESSION-LAST', doc?.last_session_id, null, '这次调用没带 session_id ⇒ last_session_id 是 null'),
        instant('DLY-LAST-SEEN', doc?.last_seen_at, calls[0].at, 'last_seen_at 必须照样前进'),
        eq('DLY-SEEN-COUNT', doc?.seen_count, 1, '没带 session_id 的调用也算一次（seen_count === 1）'),
        ...shapeProblems(null, doc, calls[0], calls[0].ws),
      ])
    },
  },
  {
    key: 'A4',
    title: '先由 session-1 开过，再一次调用没带 session_id',
    rule: '契约 §11③ 后半：first_session_id **stays whatever it was**；只更新"最后一次见到"',
    seed: () => null,
    calls: [{ at: T1, session_id: S_ONE }, { at: T2, session_id: null }],
    check(docs, calls) {
      const doc = docs[1]
      const prev = docs[0]
      return compacts([
        eq('DLY-STAYS-FIRST', doc?.first_session_id, S_ONE, 'first_session_id 必须**保持原样**（这一次没带 session_id 也不许把它抹掉）'),
        instant('DLY-STAYS-FIRST-AT', doc?.first_at, calls[0].at, 'first_at 必须保持第一次调用的那个时刻'),
        eq('DLY-LAST-NULL', doc?.last_session_id, null, '最后一次调用没带 session_id ⇒ last_session_id 是 null（字段名说的就是"最后一次调用的那个"）'),
        instant('DLY-LAST-SEEN', doc?.last_seen_at, calls[1].at, 'last_seen_at 必须前进到这次调用的时间'),
        eq('DLY-SEEN-COUNT', doc?.seen_count, 2, '两次调用 ⇒ seen_count === 2'),
        ...shapeProblems(prev, doc, calls[1], calls[1].ws),
      ])
    },
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// DLY-02 的五格（读面）
// ═════════════════════════════════════════════════════════════════════════════
/** `daily` 夹具：目标形状，`first_session_id`（开这一天的人）≠ `session_id`（最后一次调用的人）。 */
const dailyFixture = (ws) => ({
  schema: 1,
  day: DAY,
  project: PROJECT,
  workspace: ws,
  session_id: CALLER_B,
  snapshot: null,
  distribution: DIST4,
  totals: { count: 0, chars: 0 },
  char_metric: CHAR_METRIC,
  first_session_id: OPENER_A,
  first_at: FIRST_AT_STORED,
  last_session_id: CALLER_B,
  last_seen_at: LAST_AT_STORED,
  seen_count: 2,
  updated_at: LAST_AT_STORED,
})

/** payload 里到底有没有 `session_id` 这个键（`null` = 没有）。 */
const B_CELLS = [
  {
    key: 'B1',
    title: '没有 daily、也没有 local',
    daily: false,
    payloadSession: CALLER_B,
    want: { status: 'HOLD', code: 'E_NO_UPDATE_TODAY' },
    holds: [HOLD_PHRASE],
    forbids: [ANCHOR_SAME, ANCHOR_OTHER, ANCHOR_OTHER_SWAPPED],
  },
  {
    key: 'B2',
    title: 'daily 在（首次是 opener）、local 不在；payload 的 session_id 是**别人**',
    daily: true,
    payloadSession: CALLER_B,
    want: { status: 'RED', code: 'E_DATA_MISSING' },
    holds: [OPENER_A, FIRST_AT_STORED, ANCHOR_OTHER],
    forbids: [ANCHOR_SAME],
  },
  {
    key: 'B3',
    title: 'daily 在（首次是 opener）、local 不在；payload 的 session_id **就是** opener',
    daily: true,
    payloadSession: OPENER_A,
    want: { status: 'RED', code: 'E_DATA_MISSING' },
    holds: [ANCHOR_SAME],
    forbids: [ANCHOR_OTHER, ANCHOR_OTHER_SWAPPED],
  },
  {
    key: 'B4',
    title: 'daily 在、local 不在；payload **没有** session_id',
    daily: true,
    payloadSession: null,
    want: { status: 'RED', code: 'E_DATA_MISSING' },
    holds: [OPENER_A, FIRST_AT_STORED],
    forbids: [ANCHOR_SAME, ANCHOR_OTHER, ANCHOR_OTHER_SWAPPED],
  },
]

/** 一段 detail 在某格上成不成立：`holds` 全在、`forbids` 一个都不许命中。 */
function judgeDetail(cell, detail) {
  const text = String(detail ?? '')
  return {
    missed: cell.holds.filter((n) => !text.includes(n)),
    hit: cell.forbids.filter((n) => text.includes(n)),
    text,
  }
}

describe('integration · daily state (DLY) · F-155 开工痕迹的两端与署名', () => {
  test('DLY-01 daily-start 幂等：first_* 永不覆盖、旧形状升得上、不带 session_id 也算一次（+ 阳性对照 + 三把刀）', async () => {
    await runCase('DLY-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ── ⓪ 被测面读数（"我量的是哪一版"，与 `run-all` 的靶子对数分开记）──────────
      rec.readings.sut = {}
      for (const rel of ['bin/agenia-brain.mjs', 'lib/health.mjs', 'lib/state.mjs']) {
        const abs = stagingExists(rel) ? stagingPath(rel) : null
        rec.readings.sut[rel] = abs === null ? { missing: true } : { file: abs, bytes: readFileSync(abs).length, sha256: sha256File(abs) }
      }
      if (!stagingExists('bin/agenia-brain.mjs')) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 —— `daily-start` 这一面拿不到（预期的首跑红）')
      }
      if (!process.env[ENV.NOW_FILE]) {
        push('DLY-CLOCK', 'AGENIA_NOW_FILE 没设置 —— 这一票的时间全靠注入式时钟（运行根会写一行）')
      }

      // ── ① 生产臂：四格，每格一个**新**工作区，调用次数与 payload 照表 ─────────────
      const prodRows = []
      for (const cell of A_CELLS) {
        const ws = makeWorkspace('DLY-01', cell.key.toLowerCase())
        const seed = cell.seed(ws)
        const row = { cell: cell.key, title: cell.title, ws, seed_written: seed !== null, docs: [], calls: [], problems: [] }
        if (seed !== null) writeJsonFile(dailyPath(ws), seed)
        if (seed === null && existsSync(dailyPath(ws))) {
          push('DLY-STALE-WS', `${cell.key}：工作区里**已经有** daily 文件（${dailyPath(ws)}）—— 这一格要的是"从零开始"；`
            + '读数会变成"上一跑留下的"，所以每个格子必须是一个全新的运行根（`_runs\\<RUN_ID>`）')
        }
        for (const [index, call] of cell.calls.entries()) {
          const res = dailyStart(ws, { at: call.at, sessionId: call.session_id })
          if (!res.ok) {
            row.problems.push({ code: 'DLY-CLI', message: `${cell.key} 第 ${index + 1} 次调用失败：${res.message}` })
            break
          }
          row.calls.push({ at: res.at, session_id: call.session_id, ws })
          const doc = readJsonOrNull(dailyPath(ws))
          if (doc === null) {
            row.problems.push({ code: 'DLY-NO-FILE', message: `${cell.key} 第 ${index + 1} 次调用之后读不到 ${dailyPath(ws)}` })
            break
          }
          row.docs.push(doc)
        }
        const done = row.calls.length === cell.calls.length && row.docs.length === cell.calls.length
        row.verdict = done ? cell.check(row.docs, row.calls) : []
        prodRows.push(row)
        for (const p of row.problems) push(p.code, `${cell.key}（${cell.title}）：${p.message}`)
        if (done) {
          for (const p of row.verdict) push(p.code, `${cell.key}（${cell.title}）：${p.message}`)
        }
      }
      rec.readings.production = prodRows.map((r) => ({
        cell: r.cell,
        title: r.title,
        workspace: r.ws,
        calls: r.calls,
        docs: r.docs,
        held: r.problems.length === 0 && r.verdict.length === 0,
        failed: [...r.problems, ...r.verdict].map((p) => p.code),
        problems: [...r.problems, ...r.verdict].map((p) => p.message),
      }))

      // ── ② 阳性对照：照 §11 写的最小实现，四格必须**全部**成立 ─────────────────
      let ref = null
      const refRows = []
      try {
        ref = await importSource(fixtureDir('DLY-01', 'daily-ref'), 'ref', REF_DAILY_SOURCE)
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小实现 import 失败（阳性对照这一格不成立）：${String(err?.message ?? err).slice(0, 200)}`)
      }
      if (ref !== null) {
        for (const cell of A_CELLS) {
          const ws = '<ref-ws>'
          let doc = cell.seed(ws)
          const docs = []
          const calls = []
          for (const call of cell.calls) {
            doc = ref.mod.dailyStartDoc(doc, {
              at: call.at,
              session_id: call.session_id,
              day: DAY,
              project: PROJECT,
              workspace: ws,
              snapshot: null,
              distribution: DIST4,
              totals: { count: 0, chars: 0 },
              char_metric: CHAR_METRIC,
            })
            calls.push({ at: call.at, session_id: call.session_id, ws })
            docs.push(doc)
          }
          const verdict = cell.check(docs, calls)
          refRows.push({ cell: cell.key, held: verdict.length === 0, problems: verdict.map((p) => `${p.code} ${p.message}`) })
          for (const p of verdict) {
            push('CONTROL-REF-CELL',
              `阳性对照（照 §11 的最小实现）在 ${cell.key} 没成立：${p.message}`
              + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理，不许拿"实现还没做"糊过去')
          }
        }
        rec.readings.ref = { kind: 'reference', file: ref.file, bytes: ref.bytes, sha256: ref.sha256, cells: refRows }
      }

      // ── ③ 三把刀：每把只该翻**契约推出**的那几格 ─────────────────────────────
      const knifeRows = []
      for (const knife of KNIVES) {
        if (ref === null) {
          push('KNIFE-NO-BASELINE', `${knife.id}：阳性对照没起来 ⇒ 这一刀没有可比的对象（刀与基线是两件事，缺一条这一票不算数）`)
          continue
        }
        if (!REF_DAILY_SOURCE.includes(knife.find)) {
          push('KNIFE-LINE-MISSING', `${knife.id}：REF 里找不到要切的那几行（这一刀没有落点，证明不了任何事）：${JSON.stringify(knife.find.slice(0, 120))}`)
          continue
        }
        const mutated = REF_DAILY_SOURCE.replace(knife.find, knife.replace)
        let mod = null
        try {
          mod = await importSource(fixtureDir('DLY-01', 'daily-ref'), knife.id.toLowerCase(), mutated)
        } catch (err) {
          push('KNIFE-IMPORT', `${knife.id}：刀出了 import 失败（那不是"变红"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`)
          continue
        }
        const flipped = []
        for (const cell of A_CELLS) {
          const ws = '<ref-ws>'
          let doc = cell.seed(ws)
          const docs = []
          const calls = []
          for (const call of cell.calls) {
            doc = mod.mod.dailyStartDoc(doc, {
              at: call.at,
              session_id: call.session_id,
              day: DAY,
              project: PROJECT,
              workspace: ws,
              snapshot: null,
              distribution: DIST4,
              totals: { count: 0, chars: 0 },
              char_metric: CHAR_METRIC,
            })
            calls.push({ at: call.at, session_id: call.session_id, ws })
            docs.push(doc)
          }
          const verdict = cell.check(docs, calls)
          if (verdict.length > 0) flipped.push({ cell: cell.key, codes: verdict.map((p) => p.code) })
        }
        const got = flipped.map((f) => f.cell)
        knifeRows.push({ id: knife.id, title: knife.title, file: mod.file, sha256: mod.sha256, flipped: got, details: flipped, want: knife.want })
        if (JSON.stringify(got) !== JSON.stringify(knife.want)) {
          push('KNIFE-WRONG-VECTOR',
            `${knife.id}（${knife.title}）：翻面的格子是 ${JSON.stringify(got)}，契约推出的是 ${JSON.stringify(knife.want)}`
            + ' —— 一个变异体只证一格（mig-rules-16）：多翻说明那一支与别的格子共用同一处判据，少翻说明这刀没切到它')
        }
      }
      rec.readings.knives = { subject: 'reference', why: '刀打在最小实现的字节上，**不碰 `presets/**`**；生产里那几行在不在由四格自己回答（今天它们是红的）', rows: knifeRows }

      // ── ④ 写清边界（这一格不假装覆盖得更宽）────────────────────────────────
      rec.readings.boundary = {
        status_codes_untouched: '**不判** `status` 的四个值、不判 reason 码 —— 这一票只让每日状态记下"谁开的"；卡片那一半由 `DLY-02` 判。',
        session_id_not_pinned: '旧那个单值键 `session_id` 只要求**键还在**（不另立权威）；它的取值不在判据里 —— 读的人要看 `first_session_id` / `last_session_id`。',
        last_session_null: '`last_session_id` 按字段名逐字读：最后一次调用带的是哪个就是哪个，**没带 ⇒ null**（契约 §11 写死）。',
        clock: '时间全部取**信封里的 `at`**（`AGENIA_NOW_FILE` 注入 + op 自己 `toISOString()`），不手算时刻；比的是**同一个时刻**（`Date.parse`），不是同一个写法 —— 防的是"实现读两次时钟"这种无关细节变成红。',
        audit: '不判 audit 行、不判原子写实现方式（`§B3.7` / `STO-*` 的事）。',
      }

      caseFail(problems)
    })
  })

  test('DLY-02 health-read 的卡片说真话：谁开的这一天、本会话是不是它、没带 session_id 时不许冒充知道', async () => {
    await runCase('DLY-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ── ⓪ 被测面读数 ─────────────────────────────────────────────────────
      rec.readings.sut = {}
      for (const rel of ['bin/agenia-brain.mjs', 'lib/health.mjs']) {
        const abs = stagingExists(rel) ? stagingPath(rel) : null
        rec.readings.sut[rel] = abs === null ? { missing: true } : { file: abs, bytes: readFileSync(abs).length, sha256: sha256File(abs) }
      }
      for (const rel of ['bin/agenia-brain.mjs', 'lib/health.mjs']) {
        if (!stagingExists(rel)) push('SUT-SURFACE-MISSING', `staged/${rel} 不在 —— 这一面拿不到（预期的首跑红）`)
      }

      // ── ① 生产臂：B1–B4（每格一个新工作区；`local` 一律不在）────────────────────
      const prodRows = []
      for (const cell of B_CELLS) {
        const ws = makeWorkspace('DLY-02', cell.key.toLowerCase())
        const row = { cell: cell.key, title: cell.title, workspace: ws, payload_session: cell.payloadSession, daily_seeded: cell.daily }
        if (cell.daily) writeJsonFile(dailyPath(ws), dailyFixture(ws))
        // 前置：`daily` 在不在、`local` 在不在正是这一格要的现场（不成立就单独报，别混进"detail 写错了"）
        row.precondition = {
          daily_present: existsSync(dailyPath(ws)),
          local_present: existsSync(localPath(ws)),
          daily_want: cell.daily,
        }
        if (row.precondition.daily_present !== cell.daily) {
          push('DLY-PRECONDITION', `${cell.key}（${cell.title}）：daily 文件应在=${cell.daily}，实得=${row.precondition.daily_present}（${dailyPath(ws)}）—— 现场没造出来，下面读到的不是这一格的东西`)
        }
        if (row.precondition.local_present) {
          push('DLY-PRECONDITION', `${cell.key}（${cell.title}）：这一格要的是"local 不在"（\`local\\<day>.json\` 谁写是另一张票），实得在盘上 —— 分支会换一支，读数不算`)
        }
        const res = healthRead(ws, cell.payloadSession)
        row.exit_code = res.exit_code
        row.status = res.status
        row.code = res.code
        row.reasons_count = Array.isArray(res.reasons) ? res.reasons.length : null
        row.detail = res.detail
        if (!res.ok) {
          push('DLY-CLI', `${cell.key}（${cell.title}）：\`health-read\` 必须可用（正例），实得 ${res.message}`)
          prodRows.push(row)
          continue
        }
        // ①a status 与 reason 码**一个都不动**（今天就已经成立的那一半）
        if (res.status !== cell.want.status) {
          push('DLY-STATUS', `${cell.key}（${cell.title}）：status 应为 ${cell.want.status}（这一支今天就是这个值，不许改），实得 ${res.status}`)
        }
        if (res.code !== cell.want.code) {
          push('DLY-STATUS', `${cell.key}（${cell.title}）：第一条 reason 的码应为 ${cell.want.code}（码不许改），实得 ${res.code}`)
        }
        if (row.reasons_count !== 1) {
          push('DLY-STATUS', `${cell.key}（${cell.title}）：这一支今天**恰好一条** reason，实得 ${row.reasons_count} 条 —— 这一票只许改 detail，不许加码/加条`)
        }
        // ①b detail：谁开的、本会话是不是它
        const verdict = judgeDetail(cell, res.detail)
        row.missed = verdict.missed
        row.forbidden = verdict.hit
        for (const n of verdict.missed) {
          push('DLY-DETAIL-MISSING', `${cell.key}（${cell.title}）：detail 里缺「${n}」。实得：${JSON.stringify(verdict.text)}`)
        }
        for (const n of verdict.hit) {
          push('DLY-DETAIL-WRONG', `${cell.key}（${cell.title}）：detail 里出现了**这一格不许说**的话「${n}」。实得：${JSON.stringify(verdict.text)}`)
        }
        // ①c 落盘的那张卡必须说同一件事（不只判 stdout）
        const onDisk = res.on_disk
        if (onDisk === null) {
          push('DLY-CARD-FILE', `${cell.key}（${cell.title}）：读不到落盘的 health.json（${healthPath(ws)}）`)
        } else {
          const diskDetail = Array.isArray(onDisk.reasons) && onDisk.reasons.length > 0 ? String(onDisk.reasons[0]?.detail ?? '') : null
          if (onDisk.status !== res.status) push('DLY-CARD-FILE', `${cell.key}（${cell.title}）：盘上 status=${onDisk.status} ≠ stdout ${res.status}`)
          if (diskDetail !== res.detail) push('DLY-CARD-FILE', `${cell.key}（${cell.title}）：盘上 detail 与 stdout 不是同一句（盘上=${JSON.stringify(diskDetail)}）`)
        }
        prodRows.push(row)
      }
      rec.readings.production = prodRows

      // ── ② 端到端那一格（B5）：真 `daily-start` 写的那一份，卡片读得出来 ─────────────
      const e2e = { cell: 'B5', title: '端到端：写面记下的 first_*，读面认得出"谁开的、本会话是不是它"' }
      {
        const ws = makeWorkspace('DLY-02', 'e2e')
        e2e.workspace = ws
        if (existsSync(dailyPath(ws))) {
          push('DLY-STALE-WS', `B5：工作区里已经有 daily 文件（${dailyPath(ws)}）—— 这一格要的是"从零开始"，请换一个全新的运行根`)
        }
        if (existsSync(localPath(ws))) push('DLY-PRECONDITION', 'B5：这一格要的是"local 不在"，实得在盘上')
        const started = dailyStart(ws, { at: T1, sessionId: OPENER_A })
        e2e.start = { ok: started.ok, at: started.at, exit_code: started.exit_code, message: started.message }
        if (!started.ok) push('DLY-CLI', `B5：\`daily-start\` 必须可用（正例），实得 ${started.message}`)
        const doc = readJsonOrNull(dailyPath(ws))
        e2e.daily = doc
        if (doc === null) {
          push('DAILY-NO-FIRST', `B5：\`daily-start\` 之后读不到 daily 文件（${dailyPath(ws)}）—— 卡片无从署名`)
        } else {
          const missingFields = ['first_session_id', 'first_at'].filter((k) => typeof doc[k] === 'undefined')
          e2e.missing_fields = missingFields
          if (typeof doc.first_session_id === 'undefined') {
            push('DAILY-NO-FIRST', 'B5：`daily-start` 写的那份文件里**没有** `first_session_id` —— 卡片拿什么去点名"谁开的这一天"？（`DLY-01` 的 A 格判它的全部行为，这里只判"卡片要用到的那两项在不在"）')
          } else if (doc.first_session_id !== OPENER_A) {
            push('DAILY-NO-FIRST', `B5：\`first_session_id\` 应是这次调用的 ${JSON.stringify(OPENER_A)}，实得 ${JSON.stringify(doc.first_session_id)}`)
          }
          if (typeof doc.first_at === 'undefined') {
            push('DAILY-NO-FIRST', 'B5：`daily-start` 写的那份文件里**没有** `first_at` —— detail 要点名"什么时候开的"就没有来源了')
          } else if (!sameInstant(doc.first_at, started.at)) {
            push('DAILY-NO-FIRST', `B5：\`first_at\` 应与这次调用的 at（${JSON.stringify(started.at)}）同一个时刻，实得 ${JSON.stringify(doc.first_at)}`)
          }
          const openerA = healthRead(ws, OPENER_A)
          const openerB = healthRead(ws, CALLER_B)
          e2e.read_as_opener = { status: openerA.status, code: openerA.code, detail: openerA.detail }
          e2e.read_as_other = { status: openerB.status, code: openerB.code, detail: openerB.detail }
          // ⚠️ "detail 里要点名 first_at"这一条只在**盘上真有那个值**时才当判据：
          //    空串会被 `includes('')` 平凡满足（那就是一条恒真的假绿）；缺值本身由上面的 `DAILY-NO-FIRST` 报。
          const storedFirstAt = typeof doc.first_at === 'string' && doc.first_at !== '' ? doc.first_at : null
          for (const [label, res, wantSame] of [['本会话那一读', openerA, true], ['别人那一读', openerB, false]]) {
            if (!res.ok) {
              push('DLY-CLI', `B5 ${label}：\`health-read\` 必须可用，实得 ${res.message}`)
              continue
            }
            if (res.status !== 'RED' || res.code !== 'E_DATA_MISSING') {
              push('DLY-STATUS', `B5 ${label}：status/code 应为 RED / E_DATA_MISSING（这一支今天就是这个值），实得 ${res.status} / ${res.code}`)
            }
            const holds = wantSame
              ? [ANCHOR_SAME]
              : [OPENER_A, ...(storedFirstAt === null ? [] : [storedFirstAt]), ANCHOR_OTHER]
            const own = judgeDetail({ holds, forbids: wantSame ? [ANCHOR_OTHER, ANCHOR_OTHER_SWAPPED] : [ANCHOR_SAME] }, res.detail)
            for (const n of own.missed) push('DLY-DETAIL-MISSING', `B5 ${label}：detail 里缺「${n}」。实得：${JSON.stringify(own.text)}`)
            for (const n of own.hit) push('DLY-DETAIL-WRONG', `B5 ${label}：detail 里出现了**这一格不许说**的话「${n}」。实得：${JSON.stringify(own.text)}`)
          }
        }
      }
      rec.readings.e2e = e2e

      // ── ③ 阳性对照：照 §11 写的最小实现，B1–B4 的 detail 判据必须全部成立 ─────────
      let ref = null
      try {
        ref = await importSource(fixtureDir('DLY-02', 'health-ref'), 'ref', REF_HEALTH_SOURCE)
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小实现 import 失败（阳性对照这一格不成立）：${String(err?.message ?? err).slice(0, 200)}`)
      }
      if (ref !== null) {
        const refRows = []
        for (const cell of B_CELLS) {
          const text = cell.daily
            ? String(ref.mod.healthDetailOf({ first_session_id: OPENER_A, first_at: FIRST_AT_STORED, session_id: cell.payloadSession }) ?? '')
            : String(ref.mod.holdDetailOf() ?? '')
          const verdict = judgeDetail(cell, text)
          refRows.push({ cell: cell.key, held: verdict.missed.length === 0 && verdict.hit.length === 0, missed: verdict.missed, forbidden: verdict.hit, text })
          if (verdict.missed.length > 0 || verdict.hit.length > 0) {
            push('CONTROL-REF-CELL',
              `阳性对照（照 §11 的最小实现）在 ${cell.key} 没成立：缺 ${verdict.missed.join('、') || '（无）'}`
              + ` · 不该出现的 ${verdict.hit.join('、') || '（无）'} · 实得 ${JSON.stringify(text)}`
              + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理')
          }
        }
        rec.readings.ref = { kind: 'reference', file: ref.file, bytes: ref.bytes, sha256: ref.sha256, cells: refRows, scope: 'REF 只管 detail 那几句；status / reason 码由生产臂判（它们是今天就已经成立的那一半）' }
      }

      // ── ④ 边界 ───────────────────────────────────────────────────────────
      rec.readings.boundary = {
        status_codes_untouched: 'B1 的 `HOLD` + `E_NO_UPDATE_TODAY`、B2–B5 的 `RED` + `E_DATA_MISSING` 都是**今天就已经成立**的那一半；这一票只许往 `detail` 里加"谁"，不许加码、不许加条、不许换支。',
        who_is_not_inferred: 'payload 没有 `session_id` 时，卡片**不许**冒充知道本会话是谁：既不许说「刚开工」，也不许说「本会话不是」（那两句都要求"知道本会话"。）',
        local_out_of_scope: '`local\\<day>.json` 谁写是**另一张票**（定形"不做"第 1 条）；所以五格全部是"`local` 不在"的现场，一格都不造 `local`。',
        fixture_vs_e2e: 'B2–B4 的 daily 是**测试写的夹具**（只为把读面单独钉住）；B5 才是"写面真的写下、读面读得出来"的那一条。',
        no_wording_freedom: '三句按**锚点**判（`刚开工` / `本会话不是` / HOLD 那句逐字保持），措辞其余部分自由；锚点在 `CONTRACT.md` §11 里写死，实现照那三个锚点说话即可。',
      }

      caseFail(problems)
    })
  })
})
