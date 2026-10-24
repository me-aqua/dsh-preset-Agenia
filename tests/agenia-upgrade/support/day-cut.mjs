/**
 * **`F-158` 的量具** —— 一天的边界在本地 **04:00**：`dayKeyOf(instant) = 本地日期(instant − 4h)`。
 *
 * 定形：`.team/leader/2026-10-23/spec-F-158.md`（老板原话「改成从凌晨4点切分，不要在半夜一点我正在干活的时候
 * 嚷嚷"新的一天了，得先派记忆更新呀"」）。契约：`CONTRACT.md` §13。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 这个文件只做五件事（**不自建第二套骨架**）：
 *
 * ① **注入时钟**：写运行根里那一份 `AGENIA_NOW_FILE`（`run-all.mjs:205` 导出的同一份文件），
 *    跑一节、还原一节。`lib/clock.mjs` 只认这一份 —— 这里不另造任何"假 Date"。
 * ② **参考实现（REF）+ 刀**：照 §13 写的那份最小实现（`REF_SOURCE`，**不是生产代码**），
 *    外加每一刀要切的**逐字**片段与**从契约推出来的**翻面向量。生产里那几行存在之前没有字节可删，
 *    所以刀只能打在 REF 的字节上（同 `DLY-01` / `LOC-01` 的规矩：**不碰 `presets/**`**）。
 * ③ **四处的缺省日**：`claim-update` / `daily-start` / `daily-cards.py` / `local-*` 各一个驱动，
 *    统一返回 `{kind, day, exit_code, error_code, files, …}` —— 判据只看 `day` 与**盘上落点**，
 *    不看 stdout 里的散文（散文可以写得对，日子照旧错）。
 * ④ **两条"规矩"的参考实现**（`RULES_REF_SOURCE`）：§13.3「给了但坏 ⇒ 当场拒」与 §13.2「缺省日不等于
 *    `current-day` 指针」—— 各配一把刀（`K5` / `K6`），证明这两条规矩**各自能翻面**。
 * ⑤ **`check-notes` 的那一条红**：真子进程跑 `.tools/check-notes.mjs`（**只读**：全文 0 处写盘调用），
 *    把「今天的记忆更新报告在（…）」那一行**逐字**取回来 —— 判的是那一行里点名的**日子**，
 *    不是它绿不绿（绿不绿是体检自己的事）。
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 **08:00 与 04:00 之外的时刻一概不用**（那三个时刻各自只证一件事）：
 *   · `DAY_BELOW` = `2026-10-24T03:59:59+08:00` —— 切点**下方**：04:00 尺子说 10-23，零点尺子说 10-24。
 *   · `DAY_ABOVE` = `2026-10-24T04:00:01+08:00` —— 切点**上方**：两把尺子**同值**（10-24）。
 *     ⚠️ 这一格在两种尺子下同值 ⇒ 它**不能**靠"去掉 −4h"翻面（算术事实，见 `KNIVES` 的 K2：
 *     要让它翻面得把切点**搬晚**到 05:00）。它证明的是"改缺省分支别把切点上方也挪走"。
 *   · `AGREEMENT_NOW` = `2026-10-24T01:30:00+08:00` —— 老板那张现场（凌晨一点半还在干 10-23 的活）。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENV, PATHS } from './env.mjs'
import { NODE_BIN, childEnv, importStaged, runBrain, runLocal, stagingExists } from './sut.mjs'
import { canonical, ensureMarkedDir } from './root-guard.mjs'
import { fixtureDir } from './verify-recompute.mjs'

// ── 口径（**唯一一份**：三个时刻 + 两个日子 + 切点）────────────────────────────
/** 切点（小时，本地）。契约 §13 的那一个数。 */
export const CUT_HOURS = 4
/** 切点下方 / 上方 / 现场 —— 三个时刻都带时区偏移（`lib/clock.mjs` 只收这种形状）。 */
export const DAY_BELOW = '2026-10-24T03:59:59+08:00'
export const DAY_ABOVE = '2026-10-24T04:00:01+08:00'
export const AGREEMENT_NOW = '2026-10-24T01:30:00+08:00'
/** 三处该落到的日子。 */
export const DAY_PREV = '2026-10-23'
export const DAY_NEXT = '2026-10-24'
/** 现场那一格该落到的日子（凌晨一点半 ⇒ **前一天**）。 */
export const AGREEMENT_PREV = '2026-10-23'
/**
 * `DBY-06` 的现场：脑根上有一个**过期**的 `current-day` 指针，而时钟早就过了 04:00。
 * 契约 §13.2（2026-10-24 组长拍板）：`claim-update` / `daily-start` 的**缺省日只看时钟** ——
 * 指针是给**中途** op 的"正在进行的这一天"，不是"今天"。
 */
export const STALE_POINTER_AT = '2026-10-24T11:00:00+08:00'
export const STALE_POINTER_DAY = '2026-10-23'
/**
 * 契约 §13.3：`day` **一旦给出就必须是 day key**，连 `""` 与全空白都算"给了" ⇒ `E_ARG_SCHEMA`，
 * **不许**吞成"没给"。四个坏值分两组（两条都走**同一条**规则，不是两条规则）：
 *   · **不成形状**：`""` / 全空白 —— 形状那一关就不过；
 *   · **形状合规、日历上不存在**：`2026-13-40` / `2026-02-30` —— `isDayKey` 连**日历往返**一起验
 *     （`lib/state.mjs::isDayKey`；Python 那份是 `datetime.strptime`），所以它们和上面两个同命。
 *
 * ⚠️ 边界（`isDayKey` **不**判、也不该判）：形状合规**且**日历合法、只是"谁会写这种日子"的键
 * （比如 `1999-01-01`）仍然被收下 —— 那不是校验能管的事，别把这一格读成"日子必须像今天"。
 */
export const BAD_DAYS = ['', '   ', '2026-13-40', '2026-02-30']

/** 坏值 → 运行根目录名的一段（每个值一个 slug：共用一个名字会让两格撞同一批根）。 */
export function badDaySlug(value) {
  const text = String(value)
  if (text === '') return 'empty'
  if (text.trim() === '') return 'spaces'
  return text.replace(/[^0-9A-Za-z-]/g, '_')
}

/** 四个入口的名字（与契约 §13.2 的表逐字对应）。 */
export const CONSUMERS = ['claim-update', 'daily-start', 'daily-cards', 'local-claim']
export const PROJECT = 'harness'
export const SESSION = 'session-f158-day-cut-0001'

const PAD = (n) => String(n).padStart(2, '0')

// ── ① 注入时钟 ────────────────────────────────────────────────────────────
/**
 * 跑一节时把**注入式时钟**挪到 `iso`，跑完（**无论成不成**）还原。
 * 运行根那一份是四个测试文件共享的：留在别人那一格里会让后面每一格的时间读数跟着漂。
 * ⚠️ 还原值必须是**逐字节**的原样（`null` ⇒ 写回空串，与 `run-all.mjs` 建的那一份同形）。
 */
export function withClock(iso, fn) {
  const file = process.env[ENV.NOW_FILE]
  if (!file) throw new Error(`AGENIA_NOW_FILE 没设置 —— 这一票的日子全靠注入式时钟（${file}）`)
  const prior = existsSync(file) ? readFileSync(file, 'utf8') : null
  writeFileSync(file, `${iso}\n`, 'utf8')
  try {
    return fn()
  } finally {
    writeFileSync(file, prior === null ? '' : prior, 'utf8')
  }
}

/** `ISO8601` → `Date`（**同一个时刻**，不是同一个写法）。 */
export const instant = (iso) => new Date(iso)

// ── ①' 被测的那一处（纯函数）：`lib/route.mjs::dayKeyOf` ─────────────────────
/**
 * 定形 §「具体落点」第 3 条点名：`presets/agenia/lib/route.mjs::dayKeyOf`（`:58`）
 * **它本身就是那个函数**（收敛到它，别再造第三个）。所以纯函数这一格就量它。
 *
 * ⚠️ 它今天返回的是 **`YYYYMMDD`**（票号那 8 位），而契约 §13.1 要的是 `YYYY-MM-DD`：
 * 两者不是"写法不同"，是**两个日子形状**。这一格把差别**点名**（`DBY-PURE-SHAPE`），
 * 而不是拿 `20261023` 去跟 `2026-10-23` 比一次了事 —— 后者会让人以为"只是格式没对齐"。
 */
export async function stagedDayKeyOf(iso) {
  const rel = 'lib/route.mjs'
  if (!stagingExists(rel)) return { ok: false, missing: true, rel, day: null, error: `staged 里还没有 ${rel}` }
  let mod = null
  try {
    mod = await importStaged(rel)
  } catch (err) {
    return { ok: false, missing: err?.code === 'SUT-SURFACE-MISSING', rel, day: null, error: String(err?.message ?? err).slice(0, 240) }
  }
  const fn = mod?.dayKeyOf
  if (typeof fn !== 'function') return { ok: false, missing: true, rel, day: null, error: `${rel} 没有导出函数 dayKeyOf（§13.1 点名它是那一处）` }
  let day = null
  let error = null
  try {
    day = fn(instant(iso))
  } catch (err) {
    error = String(err?.message ?? err).slice(0, 240)
  }
  return { ok: error === null, missing: false, rel, day, error, iso, type: typeof day }
}

// ── ② 参考实现（照 §13 写的最小实现）+ 刀 ────────────────────────────────────
/**
 * REF：`dayKeyOf(instant) = 本地日期(instant − 4h)`，四处入口的缺省日**都过它**，
 * 显式日子**照抄不换算**（§13.2 第 3 条）。⚠️ **不是生产代码**，只住在运行根里。
 */
export const REF_SOURCE = `// F-158 的参考实现：照 CONTRACT.md §13 写的最小实现（**不是生产代码**，只住在运行根里）。
const CUT_HOURS = 4

function pad2(n) { return String(n).padStart(2, '0') }

/** 本地日历日（**不**做切点换算的纯格式化 —— 只有 dayKeyOf 该减那 4 小时）。 */
function localDateOf(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  return \`\${d.getFullYear()}-\${pad2(d.getMonth() + 1)}-\${pad2(d.getDate())}\`
}

/** 契约 §13.1：**唯一**一处算"这一天是哪一天"。本地日期(instant − 4h)，形如 YYYY-MM-DD。 */
export function dayKeyOf(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  const shifted = new Date(d.getTime() - CUT_HOURS * 3600 * 1000)
  return localDateOf(shifted)
}

/** 四处入口的缺省日 —— 四个函数体**故意长得一样**：它们证明的是"一处算、四处用"。 */
export function claimUpdateDay(now) { return dayKeyOf(now) }
export function dailyStartDay(now) { return dayKeyOf(now) }
export function dailyCardsDay(now) { return dayKeyOf(now) }
export function localDayOf(now) { return dayKeyOf(now) }

/** 契约 §13.2 第 3 条：显式日子**优先**，而且**不许被 −4h 再换算一次**。 */
export function pickDay(explicit, now) {
  return typeof explicit === 'string' && explicit.trim() !== '' ? explicit.trim() : dayKeyOf(now)
}
`

/** REF 的落点文件名（刀切的是盘上的字节；同一进程里用 `?sha256=` 防缓存）。 */
const REF_FILE = 'day-cut-ref.mjs'

/** 把一段源码落到运行根之下并 import 它（URL 带哈希 ⇒ 同一进程里不会拿到缓存里的旧字节）。 */
export async function importSource(dir, name, source) {
  const sub = path.join(dir, name)
  mkdirSync(sub, { recursive: true })
  const file = path.join(sub, REF_FILE)
  writeFileSync(file, source, 'utf8')
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex')
  const mod = await import(`${pathToFileURL(file).href}?sha256=${sha256}`)
  return { mod, file, sha256, bytes: Buffer.byteLength(source, 'utf8') }
}

/** 阳性对照那一份（`fixtureDir` = 运行根下唯一允许写夹具的地方）。 */
export async function loadRef() {
  return importSource(fixtureDir('DBY', 'day-cut-ref'), 'ref', REF_SOURCE)
}

/**
 * **八格**：两个边界 + 四处入口的缺省日 + 两条显式日子的方向。
 * `want` 是**照契约手写**的（不从实现反推）；`what` 进读数，红的时候一眼看得出是哪一格。
 */
export const CELLS = [
  { id: 'B1', cell: 'DBY-01', want: DAY_PREV, what: `dayKeyOf(${DAY_BELOW})（切点下方）`, run: (m) => m.dayKeyOf(instant(DAY_BELOW)) },
  { id: 'B2', cell: 'DBY-02', want: DAY_NEXT, what: `dayKeyOf(${DAY_ABOVE})（切点上方）`, run: (m) => m.dayKeyOf(instant(DAY_ABOVE)) },
  { id: 'A1', cell: 'DBY-03', want: AGREEMENT_PREV, what: `claim-update 的缺省日 @ ${AGREEMENT_NOW}`, run: (m) => m.claimUpdateDay(instant(AGREEMENT_NOW)) },
  { id: 'A2', cell: 'DBY-03', want: AGREEMENT_PREV, what: `daily-start 的缺省日 @ ${AGREEMENT_NOW}`, run: (m) => m.dailyStartDay(instant(AGREEMENT_NOW)) },
  { id: 'A3', cell: 'DBY-03', want: AGREEMENT_PREV, what: `daily-cards 的缺省日 @ ${AGREEMENT_NOW}`, run: (m) => m.dailyCardsDay(instant(AGREEMENT_NOW)) },
  { id: 'A4', cell: 'DBY-03', want: AGREEMENT_PREV, what: `local-* 的缺省日 @ ${AGREEMENT_NOW}`, run: (m) => m.localDayOf(instant(AGREEMENT_NOW)) },
  { id: 'E1', cell: 'DBY-04', want: DAY_PREV, what: `显式 ${DAY_PREV} @ ${DAY_ABOVE}（缺省会算成 ${DAY_NEXT}）`, run: (m) => m.pickDay(DAY_PREV, instant(DAY_ABOVE)) },
  { id: 'E2', cell: 'DBY-04', want: DAY_NEXT, what: `显式 ${DAY_NEXT} @ ${AGREEMENT_NOW}（缺省会算成 ${DAY_PREV}）`, run: (m) => m.pickDay(DAY_NEXT, instant(AGREEMENT_NOW)) },
]

/** 一份实现（REF 或某一刀）在八格上的读数。 */
export function matrixOf(mod) {
  const out = {}
  for (const c of CELLS) {
    let got = null
    let error = null
    try {
      got = c.run(mod)
    } catch (err) {
      error = String(err?.message ?? err).slice(0, 200)
    }
    out[c.id] = { cell: c.cell, what: c.what, want: c.want, got: error === null ? got : null, error, ok: error === null && got === c.want }
  }
  return out
}

/** 这份实现翻面的是哪几格（顺序按 `CELLS`）。 */
export function flippedIds(mod) {
  const m = matrixOf(mod)
  return CELLS.filter((c) => !m[c.id].ok).map((c) => c.id)
}

/**
 * **四把刀**（每把只切一处、只该翻它自己那几格）。
 *
 * 🔴 向量是**从契约推出来的**（写在 `want` 里，跑之前就写死）：跑出来不一致 ⇒ `KNIFE-WRONG-VECTOR`。
 * 两条算术事实要先认清，否则会把"对"读成"错"：
 *   · **`K1`（去掉 −4h）翻不了 `B2`** —— 04:00:01 在零点尺子下也是 10-24。要翻 `B2` 得用 `K2`（切点搬到 05:00）。
 *     所以"去掉 −4h ⇒ 两个边界格都翻"这句话**不成立**；它翻的是 `B1` + 四处入口（都是"切点下方"那一侧）。
 *   · **`K2`（切点搬到 05:00）翻不了 `B1`** —— 03:59:59 − 5h = 10-23 22:59:59，仍落在 10-23。
 *     两把刀合起来才证明"两个边界格各自都会红"（`mig-rules-14`：一格红不了，它就是装饰）。
 */
export const KNIVES = [
  {
    id: 'K1-NO-OFFSET',
    by: 'DBY-01',
    title: '刀① 去掉 −4h（等于回到本地零点切）',
    find: '  const shifted = new Date(d.getTime() - CUT_HOURS * 3600 * 1000)',
    replace: '  const shifted = d',
    want: ['B1', 'A1', 'A2', 'A3', 'A4'],
  },
  {
    id: 'K2-CUT-TOO-LATE',
    by: 'DBY-02',
    title: '刀② 切点搬到 05:00（比契约晚一小时）',
    find: 'const CUT_HOURS = 4',
    replace: 'const CUT_HOURS = 5',
    want: ['B2'],
  },
  {
    id: 'K3-ONE-CONSUMER-BYPASS',
    by: 'DBY-03',
    title: '刀③ **一个**入口绕开那一处算（`daily-cards` 用不换算的本地日期）',
    find: 'export function dailyCardsDay(now) { return dayKeyOf(now) }',
    replace: 'export function dailyCardsDay(now) { return localDateOf(now) }',
    want: ['A3'],
  },
  {
    id: 'K4-EXPLICIT-IGNORED',
    by: 'DBY-04',
    title: '刀④ 显式日子被吞掉（永远用缺省）',
    find: '  return typeof explicit === \'string\' && explicit.trim() !== \'\' ? explicit.trim() : dayKeyOf(now)',
    replace: '  return dayKeyOf(now)',
    want: ['E1', 'E2'],
  },
]

/**
 * 打一把刀：`find` 必须在给定的源码里**恰好出现一次**（0 次 ⇒ 这一刀没有落点；2 次以上 ⇒ 切的是多处）。
 * @returns {{ok: boolean, code: string|null, source: string|null, why: string}}
 */
export function cutSource(source, knife) {
  const hits = source.split(knife.find).length - 1
  if (hits !== 1) {
    return { ok: false, code: hits === 0 ? 'KNIFE-LINE-MISSING' : 'KNIFE-LINE-AMBIGUOUS', source: null, why: `${JSON.stringify(knife.find)} 出现 ${hits} 次（必须恰好 1 次）` }
  }
  return { ok: true, code: null, source: source.replace(knife.find, knife.replace), why: '' }
}

/** 刀打在主 REF（八格：切点 + 四处缺省 + 显式优先）上。 */
export function cutKnife(knife) {
  return cutSource(REF_SOURCE, knife)
}

// ── ②' 两条**规矩**的参考实现（§13.3 给了但坏 · §13.2 缺省日不等于指针）────────
/**
 * 第 2 份 REF：**只**写这两条规矩（**不是生产代码**，只住在运行根里）。
 *
 * 为什么单开一份：切点那八格（`CELLS`）证的是"一处算、四处用"；这两条证的是**输入怎么收**。
 * 混进同一份 REF 会让四把老刀一刀切两件事（`KNIFE-WRONG-VECTOR` 会变成噪声）。
 *
 * 三条规矩逐字来自组长的裁定（2026-10-24）：
 *   · §13.3：`day` **给了（含 `""` 与全空白）就必须是 day key**，否则 `E_ARG_SCHEMA` —— 永不吞成"没给"；
 *   · §13.2：`claim-update` / `daily-start` 的**缺省日只看时钟**（过期指针不是"今天"）；
 *   · §13.2：`current-day` 指针留给**中途** op（"正在进行的这一天"）。
 */
export const RULES_REF_SOURCE = `// F-158 的参考实现（第 2 份）：§13.3 / §13.2 的输入规矩（**不是生产代码**，只住在运行根里）。
const CUT_HOURS = 4
const DAY_KEY_RE = /^\\d{4}-\\d{2}-\\d{2}$/

function pad2(n) { return String(n).padStart(2, '0') }
function localDateOf(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  return \`\${d.getFullYear()}-\${pad2(d.getMonth() + 1)}-\${pad2(d.getDate())}\`
}
export function dayKeyOf(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  return localDateOf(new Date(d.getTime() - CUT_HOURS * 3600 * 1000))
}

function argError(message) {
  const err = new Error(message)
  err.code = 'E_ARG_SCHEMA'
  return err
}

/** §13.3：给了就必须是 day key（\`""\` 与全空白也算"给了"）；没给才走缺省。 */
export function dayOfInput(explicit, now) {
  if (explicit !== undefined && explicit !== null) {
    const text = String(explicit).trim()
    if (!DAY_KEY_RE.test(text)) throw argError('day 给了就必须是 YYYY-MM-DD，实得 ' + JSON.stringify(explicit))
    return text
  }
  return dayKeyOf(now)
}

/** §13.2（F4-b）：写入口的缺省日**只看时钟** —— 根上有过期指针也一样。 */
export function defaultDayForWrite(now, pointer) {
  return dayKeyOf(now)
}

/** §13.2：指针留给**中途** op —— "正在进行的这一天"。 */
export function midDayOpDay(now, pointer) {
  if (typeof pointer === 'string' && DAY_KEY_RE.test(pointer.trim())) return pointer.trim()
  return dayKeyOf(now)
}
`

/** 这一份 REF 的七格：四格管输入（`D*`）、三格管缺省日与指针（`P*`）。 */
export const RULES_CELLS = [
  { id: 'D1', want: { throws: 'E_ARG_SCHEMA' }, what: "day = ''（给了但是空串）⇒ 当场拒", run: (m) => m.dayOfInput('', instant(AGREEMENT_NOW)) },
  { id: 'D2', want: { throws: 'E_ARG_SCHEMA' }, what: "day = '   '（给了但全空白）⇒ 当场拒", run: (m) => m.dayOfInput('   ', instant(AGREEMENT_NOW)) },
  { id: 'D3', want: { day: DAY_PREV }, what: `day = ${DAY_PREV}（好值）⇒ 照抄`, run: (m) => m.dayOfInput(DAY_PREV, instant(AGREEMENT_NOW)) },
  { id: 'D4', want: { day: AGREEMENT_PREV }, what: `没给 day @ ${AGREEMENT_NOW} ⇒ 走缺省`, run: (m) => m.dayOfInput(undefined, instant(AGREEMENT_NOW)) },
  { id: 'P1', want: { day: DAY_NEXT }, what: `根上有**过期**指针 ${STALE_POINTER_DAY}、时钟 ${STALE_POINTER_AT} ⇒ 写入口的缺省日 = ${DAY_NEXT}`, run: (m) => m.defaultDayForWrite(instant(STALE_POINTER_AT), STALE_POINTER_DAY) },
  { id: 'P2', want: { day: STALE_POINTER_DAY }, what: `中途 op 仍跟指针（${STALE_POINTER_DAY}）`, run: (m) => m.midDayOpDay(instant(STALE_POINTER_AT), STALE_POINTER_DAY) },
  { id: 'P3', want: { day: DAY_NEXT }, what: '没有指针时缺省日不受影响（仍是时钟那一天）', run: (m) => m.defaultDayForWrite(instant(STALE_POINTER_AT), null) },
]

/** 一份实现（REF 或某一刀）在七格上的读数。`want` 要么是日子，要么是"该抛哪个码"。 */
export function rulesMatrixOf(mod) {
  const out = {}
  for (const c of RULES_CELLS) {
    let got = null
    let error = null
    let errorCode = null
    try {
      got = c.run(mod)
    } catch (err) {
      error = String(err?.message ?? err).slice(0, 200)
      errorCode = err?.code ?? null
    }
    const ok = c.want.throws !== undefined
      ? errorCode === c.want.throws
      : error === null && got === c.want.day
    out[c.id] = { what: c.what, want: c.want, got: error === null ? got : null, error, errorCode, ok }
  }
  return out
}

export function rulesFlippedIds(mod) {
  const m = rulesMatrixOf(mod)
  return RULES_CELLS.filter((c) => !m[c.id].ok).map((c) => c.id)
}

/**
 * **两把刀**（各自只切一条规矩）：
 *   · `K5`：把"给了但坏"的守卫改成"空串当没给" ⇒ 翻 `D1` `D2`（好值 / 没给那两格不动）；
 *   · `K6`：让写入口的缺省日**跟指针走** ⇒ 翻 `P1`（中途 op 与"没指针"那两格不动）。
 * 向量是**从裁定推出来的**（跑之前就写死）：不一致 ⇒ `KNIFE-WRONG-VECTOR`。
 */
export const RULES_KNIVES = [
  {
    id: 'K5-EMPTY-SWALLOWED',
    by: 'DBY-04',
    title: "刀⑤ 把「给了但坏」吞成「没给」（空串 / 全空白走缺省）",
    find: '  if (explicit !== undefined && explicit !== null) {',
    replace: "  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {",
    want: ['D1', 'D2'],
  },
  {
    id: 'K6-POINTER-WINS',
    by: 'DBY-06',
    title: '刀⑥ 缺省日跟指针走（过期指针 = 今天）',
    find: 'export function defaultDayForWrite(now, pointer) {\n  return dayKeyOf(now)\n}',
    replace: 'export function defaultDayForWrite(now, pointer) {\n  return pointer ?? dayKeyOf(now)\n}',
    want: ['P1'],
  },
]

/**
 * 跑一遍第 2 份 REF 的七格 + 两把刀，**只对 `ownedKnifeId` 那一把**判定向量（同 `controlArm` 的规矩）。
 */
export async function rulesControlArm(ownedKnifeId) {
  const problems = []
  const readings = {
    subject: 'rules-reference',
    why: '这两条规矩各有一份照裁定写的最小实现；刀打的是它的字节（**不碰 `presets/**`**）',
    owned_knife: ownedKnifeId,
    ref: null,
    matrix: null,
    knives: [],
  }
  let ref = null
  try {
    ref = await importSource(fixtureDir('DBY', 'day-rules-ref'), 'ref', RULES_REF_SOURCE)
  } catch (err) {
    problems.push({ code: 'CONTROL-REF-IMPORT', message: `第 2 份最小实现 import 失败（这一格不成立）：${String(err?.message ?? err).slice(0, 200)}` })
  }
  if (ref !== null) {
    readings.ref = { file: ref.file, bytes: ref.bytes, sha256: ref.sha256 }
    const matrix = rulesMatrixOf(ref.mod)
    readings.matrix = matrix
    for (const c of RULES_CELLS) {
      if (matrix[c.id].ok) continue
      problems.push({
        code: 'CONTROL-RULES-CELL',
        message: `照裁定写的最小实现在 ${c.id}（${c.what}）没成立：实得 ${JSON.stringify(matrix[c.id].got)}${matrix[c.id].error === null ? '' : ` · 抛了 ${matrix[c.id].error}`}、`
          + `期望 ${JSON.stringify(c.want)} —— 要么这一格写得不可实现，要么最小实现写错了，两件事必须分开处理`,
      })
    }
  }
  for (const knife of RULES_KNIVES) {
    const row = { id: knife.id, by: knife.by, title: knife.title, want: knife.want, measured: null, ok: false, error: null }
    if (ref === null) {
      row.error = 'REF 没起来 ⇒ 这一刀没有可比的对象'
      readings.knives.push(row)
      if (knife.id === ownedKnifeId) problems.push({ code: 'KNIFE-NO-BASELINE', message: `${knife.id}：${row.error}` })
      continue
    }
    const cut = cutSource(RULES_REF_SOURCE, knife)
    if (!cut.ok) {
      row.error = cut.why
      readings.knives.push(row)
      if (knife.id === ownedKnifeId) problems.push({ code: cut.code, message: `${knife.id}（${knife.title}）：${cut.why}` })
      continue
    }
    try {
      const mod = await importSource(fixtureDir('DBY', `rules-knife-${knife.id.toLowerCase()}`), 'k', cut.source)
      row.measured = rulesFlippedIds(mod.mod)
      row.ok = JSON.stringify(row.measured) === JSON.stringify(knife.want)
      row.file = mod.file
      row.sha256 = mod.sha256
    } catch (err) {
      row.error = `刀出了 import 失败（那不是"变红"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`
    }
    readings.knives.push(row)
    if (knife.id !== ownedKnifeId) continue
    if (row.measured === null) problems.push({ code: 'KNIFE-IMPORT', message: `${knife.id}（${knife.title}）：${row.error}` })
    else if (!row.ok) {
      problems.push({
        code: 'KNIFE-WRONG-VECTOR',
        message: `${knife.id}（${knife.title}）：翻面的格子是 ${JSON.stringify(row.measured)}，裁定推出的是 ${JSON.stringify(knife.want)}`
          + ' —— 一个变异体只证一格（mig-rules-16）：多翻说明两条规矩共用一处判据，少翻说明这刀没切到它',
      })
    }
  }
  return { problems, readings }
}

// ── ③ 四处的缺省日（真子进程；缺省 = payload 里**没有** day 这个键）──────────
/** 一个格子一副全新的根：工作区 + 脑根各自带 marker（脑根不许共用 —— 指针会让缺省值拐弯）。 */
export function makeRoots(caseId, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const base = path.join(runRoot, `${String(caseId).toLowerCase()}-${name}`)
  const ws = ensureMarkedDir(path.join(base, 'ws'), { runRoot, runId: path.basename(runRoot), kind: 'agenia-test-workspace' })
  const brain = ensureMarkedDir(path.join(base, 'brain'), { runRoot, runId: path.basename(runRoot), kind: 'agenia-test-brain-root' })
  mkdirSync(path.join(ws, '.team'), { recursive: true })
  return { base, ws, brain }
}

const short = (text, n = 240) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** 目录下的文件名清单（不存在 ⇒ `[]`；用来判"它到底写进了哪一天"）。 */
export function listFiles(dir, suffix = null) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => (suffix === null ? true : n.endsWith(suffix)))
    .sort()
}

/** 目录下的子目录名（`daily-cards.py` 的"它用了哪一天"就住在这儿）。 */
export function listDirs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => {
      try {
        return statSync(path.join(dir, n)).isDirectory()
      } catch {
        return false
      }
    })
    .sort()
}

/**
 * 一次调用读回来的东西 —— **四处统一成同一个形状**，判据才可能只看 `day`。
 *
 * `kind`：
 *   · `resolved`   —— 它算出了一个日子（`day` 非空）；
 *   · `no-default` —— 它**拒了**"没给日子"（`E_ARG_SCHEMA` 一类的形状错）⇒ **这一次**这一处没有缺省。
 *     四处（`claim-update` / `daily-start` / `daily-cards` / `local-claim`）**都有**缺省 ⇒ 读到 `no-default`
 *     就是"某一处又变回必填"的**回归信号**，不是"还没做"；
 *   · `failed`     —— 别的失败（缺面 / 被杀 / 非 JSON）—— 与"日子算错了"是两件事，分开报。
 */
function classify(res, day, where) {
  const errorCode = res?.json?.error?.code ?? null
  const message = short(res?.json?.error?.message ?? res?.stderr ?? '')
  const kind = day !== null && day !== undefined
    ? 'resolved'
    : (errorCode === 'E_ARG_SCHEMA' ? 'no-default' : 'failed')
  return {
    kind,
    day: day ?? null,
    where,
    exit_code: res?.exit_code ?? null,
    error_code: errorCode,
    message,
    cmdline: res?.cmdline ?? null,
    ms: res?.ms ?? null,
  }
}

/** `claim-update` 的缺省日（payload 里**没有** `day`）；`explicit` 给了就带上那一格（显式优先那一格）。 */
export function probeClaimUpdate(roots, nowIso, explicit = null) {
  let res = null
  const payload = { owner_project: PROJECT, owner_session: SESSION }
  if (explicit !== null) payload.day = explicit
  withClock(nowIso, () => {
    res = runBrain('claim-update', payload, { dataRoot: roots.brain, extra: ['--workspace', roots.ws] })
  })
  const files = listFiles(path.join(roots.brain, 'state', 'update'), '.json')
  return { ...classify(res, res?.json?.day ?? null, 'state/update/<day>.json'), artifact: 'file', instant: nowIso, files, state_path: res?.json?.state_path ?? null }
}

/** `daily-start` 的缺省日（payload 里**没有** `day`）；`explicit` 给了就带上那一格（显式优先那一格）。 */
export function probeDailyStart(roots, nowIso, explicit = null) {
  let res = null
  const payload = { project: PROJECT, session_id: SESSION }
  if (explicit !== null) payload.day = explicit
  withClock(nowIso, () => {
    res = runBrain('daily-start', payload, { dataRoot: roots.brain, extra: ['--workspace', roots.ws] })
  })
  const dir = path.join(roots.ws, '.team', 'state', 'daily')
  const files = listFiles(dir, '.json')
  return { ...classify(res, res?.json?.day ?? null, '.team/state/daily/<day>.json'), artifact: 'file', instant: nowIso, files, status_path: res?.json?.status_path ?? null }
}

/** `local-claim` 的缺省日（payload 里**没有** `day`）；`explicit` 给了就带上那一格（显式优先那一格）。 */
export function probeLocalClaim(roots, nowIso, explicit = null) {
  let res = null
  const payload = { project: PROJECT, field: 'conversation', attempt: 1, job_id: 'job-f158-day-cut' }
  if (explicit !== null) payload.day = explicit
  withClock(nowIso, () => {
    res = runLocal('DBY', 'local-claim', payload, { workspace: roots.ws })
  })
  const files = listFiles(path.join(roots.ws, '.team', 'state', 'local'), '.json')
  return { ...classify(res, res?.json?.state?.day ?? null, '.team/state/local/<day>.json'), artifact: 'file', instant: nowIso, files, state_path: res?.json?.state_path ?? null }
}

/**
 * `daily-cards.py` 的缺省日：它把两张卡落进 `<ws>/.team/leader/<day>/` —— 日子就是那个目录名。
 *
 * 🔴 **目录名不证明卡出来了**（`F-158` 门 4 评审 F2）：`daily-cards.py:140` 在**读数据之前**就
 * `os.makedirs(out_dir, exist_ok=True)`，所以"进程 exit 1、一张卡都没出"也会留下一个以日子命名的目录。
 * ⇒ `resolved` 之前必须 **`exit_code === 0`**；判"退出码"与判"目录名"是两层，缺一层这一格就分不出来。
 * 自证（不跑 python）：`CARDS_CLASSIFIER_ROWS` + `cardsClassifierProblems()`。
 */
export function cardsKindOf({ exitCode, noDefault, dirs }) {
  if (exitCode !== 0) return { kind: noDefault ? 'no-default' : 'failed', day: null }
  if (dirs.length === 1) return { kind: 'resolved', day: dirs[0] }
  if (dirs.length > 1) return { kind: 'resolved', day: dirs.join(',') }
  return { kind: 'failed', day: null }
}

/**
 * **`cardsKindOf` 的阳性对照**（合成读数，不碰 python）：四行形状，
 * `CLS-3` 就是"目录已建、进程失败"那一格 —— 它不判 `failed`，F2 就是没修。
 */
export const CARDS_CLASSIFIER_ROWS = [
  { id: 'CLS-1', what: 'exit 0 + 恰好一个目录 ⇒ resolved（正常那一支）', input: { exitCode: 0, noDefault: false, dirs: [DAY_PREV] }, want: { kind: 'resolved', day: DAY_PREV } },
  { id: 'CLS-2', what: 'exit 0 + 一个目录都没有 ⇒ failed（算了却没写）', input: { exitCode: 0, noDefault: false, dirs: [] }, want: { kind: 'failed', day: null } },
  { id: 'CLS-3', what: 'exit 1 + 目录已建 ⇒ **failed**（F2：崩在 `makedirs` 之后）', input: { exitCode: 1, noDefault: false, dirs: [DAY_PREV] }, want: { kind: 'failed', day: null } },
  { id: 'CLS-4', what: 'argparse 缺必填（exit 2、没有目录）⇒ no-default', input: { exitCode: 2, noDefault: true, dirs: [] }, want: { kind: 'no-default', day: null } },
]

/** 跑那四行合成读数；不一致 ⇒ `DBY-CARDS-CLASSIFY-<行>`（红是"量具坏了"，不是"被测量错了"）。 */
export function cardsClassifierProblems() {
  const problems = []
  const rows = []
  for (const row of CARDS_CLASSIFIER_ROWS) {
    const got = cardsKindOf(row.input)
    const ok = got.kind === row.want.kind && got.day === row.want.day
    rows.push({ id: row.id, what: row.what, input: row.input, want: row.want, got, ok })
    if (!ok) {
      problems.push({
        code: `DBY-CARDS-CLASSIFY-${row.id}`,
        message: `量具自证不过（${row.id} ${row.what}）：cardsKindOf(${JSON.stringify(row.input)}) = ${JSON.stringify(got)}，`
          + `应当是 ${JSON.stringify(row.want)} —— 这一条红说明**量具**坏了，不是被测对象`,
      })
    }
  }
  return { problems, rows }
}

export function probeDailyCards(roots, nowIso, explicit = null) {
  const py = pythonBin()
  if (!py.ok) {
    return { kind: 'failed', day: null, where: '.team/leader/<day>/', artifact: 'dir', instant: nowIso, exit_code: null, error_code: 'NO-PYTHON', message: py.note, cmdline: null, ms: null, files: [], python: py }
  }
  const args = [path.join(PATHS.repo, '.tools', 'daily-cards.py')]
  if (explicit !== null) args.push('--day', explicit)
  args.push('--workspace', roots.ws, '--data-root', roots.brain)
  const env = { ...childEnv() }
  const started = Date.now()
  // 时钟走**同一份**注入文件（不是另造一份假 Date）：`daily-cards.py` 读的就是它（`now_instant()`）。
  const res = withClock(nowIso, () => spawnSync(py.bin, args, {
    cwd: PATHS.repo, env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  }))
  const dirs = listDirs(path.join(roots.ws, '.team', 'leader'))
  const stderr = String(res?.stderr ?? '')
  // argparse 的"缺必填参数"是 exit 2 + `error: the following arguments are required`（没有 JSON 信封）。
  const noDefault = /the following arguments are required/.test(stderr)
  // 这个脚本的失败口径与 `lib/error-codes.mjs` 同一形状：`sys.exit("E_XXX: …")`（`E_CLOCK_FILE` 就是这一种）。
  // 所以"它报了哪个码"只能从 stderr 的第一枚 `E_*` 上读 —— 不这样读，Python 那一侧的拒绝就永远只有 exit code。
  const codeHit = /\b(E_[A-Z][A-Z_]+)\b/.exec(stderr)
  const errorCode = noDefault ? 'E_ARG_SCHEMA' : (codeHit === null ? null : codeHit[1])
  const exitCode = res?.status ?? null
  const base = {
    where: '.team/leader/<day>/',
    artifact: 'dir',
    instant: nowIso,
    exit_code: exitCode,
    error_code: errorCode,
    message: short(noDefault ? stderr : (stderr || res?.stdout)),
    cmdline: `"${py.bin}" ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`,
    ms: Date.now() - started,
    files: dirs,
    python: py,
  }
  return { ...base, ...cardsKindOf({ exitCode, noDefault, dirs }) }
}

/** `report-read` 的缺省日 —— 体检那条红走的就是**这一条路**（`reports/memory-update/<day>.json`）。 */
export function probeReportRead(roots, nowIso, explicit = null) {
  let res = null
  const payload = {}
  if (explicit !== null) payload.day = explicit
  withClock(nowIso, () => {
    res = runBrain('report-read', payload, { dataRoot: roots.brain })
  })
  const envelopeDay = res?.json?.day ?? null
  const reportPath = res?.json?.path ?? null
  return {
    ...classify(res, envelopeDay, 'reports/memory-update/<day>.json'),
    instant: nowIso,
    path: reportPath,
    derived: res?.json?.derived ?? null,
  }
}

/**
 * 在**测试自己的**脑根上放一个 `current-day` 指针（形状与 `lib/state.mjs::writeCurrentDay` 逐字相同）。
 *
 * 为什么要手写它、而不是先 claim 一次：
 *   · 先 claim 会顺带写 `state/update/<day>.json` 与锁 —— 第二格 `claim-update` 会撞 `E_LOCK_HELD`，
 *     红因就变成"锁"而不是"指针拐走了缺省日"；
 *   · 我们要量的是**一个过期指针在场时缺省日去哪**，那不是"跑一遍流程"，是一个现场。
 * 只写运行根里的脑根（`makeRoots` 造的那一个），活体一个字节都不碰。
 *
 * 🔴 **一个现场只能给一条腿用**（门 4 复审 R1）：`claim-update` 成功之后会**自己写**这个指针，
 * 所以两条腿共用一副根时，后跑的 `daily-start` 看到的已经不是过期指针 —— 一个"退回指针"的实现
 * 会读到今天、与 `want` 同值 ⇒ 照样绿。要用这个现场的腿必须**各有各的根**，各自 `makeRoots` 之后再种一次。
 */
export function writeCurrentDayPointer(brain, day) {
  const file = path.join(brain, 'state', 'current-day.json')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ schema: 1, day, updated_at: '2026-10-24T02:49:41.280Z' }, null, 2)}\n`, 'utf8')
  return file
}

/**
 * 从盘上**读回**那个指针（`writeCurrentDayPointer` 的见证面）。
 *
 * 为什么读回来、而不是留一个变量说"我种过了"：`DBY-06` 要证的是"这条腿**开跑那一刻**指针确实是
 * 过期的" —— 那是盘上事实，不是调用顺序的**约定**。留变量的话，同一个文件被谁改写都一样读不出来。
 */
export function readCurrentDayPointer(brain) {
  const file = path.join(brain, 'state', 'current-day.json')
  if (!existsSync(file)) return { file, ok: false, day: null, why: '指针文件不在' }
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    return { file, ok: true, day: typeof doc?.day === 'string' ? doc.day : null, why: '' }
  } catch (err) {
    return { file, ok: false, day: null, why: `读不回 / 不是 JSON：${String(err?.message ?? err).slice(0, 160)}` }
  }
}

/**
 * 判「`day` 给了但坏」这一条腿（契约 §13.3 的组长裁定，2026-10-24）：
 * **给了（含 `""` 与全空白）就必须是 day key，否则 `E_ARG_SCHEMA`** —— 不许吞成"没给"。
 *
 * 三种结果三句话：
 *   · `resolved`（它算出了一个日子）⇒ `DBY-BAD-DAY-ACCEPTED-<入口>`：「吞成没给」；
 *   · 拒了但不是 `E_ARG_SCHEMA` ⇒ `DBY-BAD-DAY-CODE-<入口>`：拒得对、码不对（下一个读的人不知道按哪条规矩接）；
 *   · `E_ARG_SCHEMA` ⇒ 过。
 */
export function badDayVerdict(label, probe, badValue) {
  const problems = []
  const shown = JSON.stringify(badValue)
  const at = probe.instant === undefined ? '' : ` @ ${probe.instant}`
  if (probe.kind === 'resolved' || (probe.exit_code ?? null) === 0) {
    problems.push({
      code: `DBY-BAD-DAY-ACCEPTED-${label}`,
      message: `${label}${at}：\`day\` 给了 ${shown}（**不成形状**），它没有拒 —— `
        + (probe.day === null
          ? '它**退出 0** 但一个落点都没有（既没拒、也没写对日子）'
          : `它落到了 ${JSON.stringify(probe.day)}`)
        + `（exit=${probe.exit_code} · ${probe.error_code ?? '(无码)'}）。§13.3：给了就必须是 \`YYYY-MM-DD\`，`
        + '**不许**把坏值悄悄吞成"没给"—— 那会让一次拼错的日子落到别的日子上',
    })
    return problems
  }
  if (probe.error_code !== 'E_ARG_SCHEMA') {
    const crashed = /Traceback|Error:/.test(String(probe.message ?? ''))
    problems.push({
      code: `DBY-BAD-DAY-CODE-${label}`,
      message: `${label}${at}：\`day\` = ${shown} ${crashed ? '**崩了**（不是拒）' : '被拒了，但不是 `E_ARG_SCHEMA`'}`
        + `（exit=${probe.exit_code} · ${probe.error_code ?? '(无码)'} · ${probe.message}）—— §13.3 要的是同一个码、同一个时机：`
        + '**在用这个日子之前**就按形状拒掉，四处一个说法',
    })
  }
  return problems
}

// ── 判一条腿 ───────────────────────────────────────────────────────────────
/**
 * 判「某入口的缺省日」这一条腿。返回 `{problems, held}`（`problems` 是 `{code, message}`，**不抛**）。
 *
 * 三种态**三句不同的话**（混成一句就分不清"没有缺省"和"缺省算错了"）：
 *   · `no-default` ⇒ `DBY-NO-DEFAULT-<入口>`：**这一次**它拒了"没给 day" ⇒ 这一处没有缺省（回归信号）；
 *   · `failed`     ⇒ `DBY-LEG-FAILED-<入口>`：别的原因（缺面 / 非 JSON / 被杀）—— 与"日子错了"是两件事；
 *   · `resolved` 但日子不对 ⇒ `DBY-WRONG-DAY-<入口>`；日子对了但**落点不是那一天** ⇒ `DBY-WRONG-ARTIFACT-<入口>`。
 *
 * 判的是**它算出来的日子**（信封里的 `day` / 落点目录名）与**盘上落点**，不是 stdout 里的散文。
 */
export function legVerdict(label, probe, wantDay) {
  const problems = []
  const at = probe.instant === undefined ? '' : ` @ ${probe.instant}`
  if (probe.kind === 'no-default') {
    problems.push({
      code: `DBY-NO-DEFAULT-${label}`,
      message: `${label}${at}：这一次调用**没给** day（payload / 命令行里没有这个键）⇒ 它当场拒了（exit=${probe.exit_code} · ${probe.error_code ?? '(无码)'} · ${probe.message}）。`
        + '§13.2 要的是"缺省也走那一处算" —— 四处**都有**缺省，所以这一处再拒"没给 day"就是**回归**'
        + '（某一处又变回必填），不是"还没做"',
    })
    return { problems, held: false }
  }
  if (probe.kind === 'failed') {
    problems.push({
      code: `DBY-LEG-FAILED-${label}`,
      message: `${label}${at}：这一腿没跑成（exit=${probe.exit_code} · ${probe.error_code ?? '(无码)'} · ${probe.message}）—— `
        + `这不是"日子算错了"，是"这一腿没量到"（命令行：${probe.cmdline ?? '(无)'}）`,
    })
    return { problems, held: false }
  }
  if (probe.day !== wantDay) {
    problems.push({
      code: `DBY-WRONG-DAY-${label}`,
      message: `${label}${at}：缺省日算成了 ${JSON.stringify(probe.day)}，应当是 ${JSON.stringify(wantDay)} —— `
        + `本地 04:00 切之下，这一刻属于 ${wantDay}（契约 §13.1：dayKeyOf(instant) = 本地日期(instant − 4h)）`,
    })
  }
  const files = Array.isArray(probe.files) ? probe.files : []
  const wantName = probe.artifact === 'dir' ? wantDay : `${wantDay}.json`
  if (files.length === 0) {
    problems.push({
      code: `DBY-NO-ARTIFACT-${label}`,
      message: `${label}${at}：信封说日子是 ${JSON.stringify(probe.day)}，但盘上 ${probe.where} 下**一个落点都没有** —— 它算了却没写（或写去了别处）`,
    })
  } else if (!files.includes(wantName)) {
    problems.push({
      code: `DBY-WRONG-ARTIFACT-${label}`,
      message: `${label}${at}：盘上落点 ${JSON.stringify(files)} 里没有 ${JSON.stringify(wantName)} —— 写的日子与它自报的日子不是同一件事`,
    })
  }
  return { problems, held: false }
}

/** `probeReportRead` 那种"读面"的腿：判信封里的 `day` 与它点名的 `path` 是不是同一天。 */
export function readLegVerdict(label, probe, wantDay) {
  const problems = []
  const at = probe.instant === undefined ? '' : ` @ ${probe.instant}`
  if (probe.kind === 'failed') {
    problems.push({ code: `DBY-LEG-FAILED-${label}`, message: `${label}${at}：读面没跑成（exit=${probe.exit_code} · ${probe.message}）` })
    return problems
  }
  if (probe.day !== wantDay) {
    problems.push({ code: `DBY-WRONG-DAY-${label}`, message: `${label}${at}：缺省日算成了 ${JSON.stringify(probe.day)}，应当是 ${JSON.stringify(wantDay)}` })
  }
  const wantSuffix = `reports/memory-update/${wantDay}.json`
  const gotPath = String(probe.path ?? '').replace(/\\/g, '/')
  if (!gotPath.endsWith(wantSuffix)) {
    problems.push({
      code: `DBY-WRONG-PATH-${label}`,
      message: `${label}${at}：它点名的报告路径是 ${JSON.stringify(probe.path)}，应当以 ${JSON.stringify(wantSuffix)} 结尾 —— `
        + '体检那条「今天的记忆更新报告在」走的就是这一条路，路径的日子错了，那条红就会在凌晨一点嚷"新的一天"',
    })
  }
  return problems
}

// ── python：`daily-cards.py` 的解释器（找不到 ⇒ 这一档**判不了**，不许当成红）────
let PYTHON_CACHE = null
/**
 * 找得到 `E:\Anaconda\python.exe`（**笔记里写着的那一个**）就用它；也接受 `AGENIA_TEST_PYTHON` 覆盖。
 * 判"可用"的方式是**真 import 一次 openpyxl** —— 不是看文件在不在（那个脚本 import 的就是它）。
 */
export function pythonBin() {
  if (PYTHON_CACHE !== null) return PYTHON_CACHE
  const override = process.env.AGENIA_TEST_PYTHON
  const candidates = [override, 'E:\\Anaconda\\python.exe', 'python.exe', 'python'].filter((c) => typeof c === 'string' && c !== '')
  const tried = []
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['-c', 'import openpyxl; print("OPENPYXL-OK")'], {
      encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    })
    tried.push({ bin, exit_code: probe.status ?? null, error: probe.error ? String(probe.error.message) : null })
    if ((probe.status ?? 1) === 0 && String(probe.stdout ?? '').includes('OPENPYXL-OK')) {
      PYTHON_CACHE = { ok: true, bin, tried, note: '' }
      return PYTHON_CACHE
    }
  }
  PYTHON_CACHE = { ok: false, bin: null, tried, note: `找不到能 import openpyxl 的 python（试过 ${candidates.length} 个）—— daily-cards.py 这一档判不了（HOLD，不是红）` }
  return PYTHON_CACHE
}

// ── ③' Python 那份切点的**刀**（F1：把 4 改成 3 / 5，相邻那一格必须翻面）────────
/**
 * 把 `.tools/daily-cards.py` **拷到运行根**、只把 `DAY_CUT_HOURS = 4` 改成 `cutHours`，
 * 再用**同一个注入时钟、同一个命令行**跑一次，看它把卡落进了哪一天。
 *
 * 为什么要这一刀：切点今天**已经在 4 小时上**时，腿是绿的 —— 但"绿"不证明这条腿能红
 * （`mig-rules-14`：一格红不了，它就是装饰）。评审 F1 就是这么找到洞的：
 * 只走 `01:30` 一个时刻时，`DAY_CUT_HOURS` 改成 3 / 5 / 10 / 20，五个格**全绿**。
 * 这一刀改成 3（或 5）之后，`03:59:59`（或 `04:00:01`）那一向**必须**落到相邻的那一天 ——
 * 落到原来的日子 ⇒ 这条腿没有牙。
 *
 * ⚠️ `.tools/**` 一个字节都不动：改的是**运行根里的副本**。
 */
export function cardsCutKnife(roots, nowIso, cutHours) {
  const source = readFileSync(path.join(PATHS.repo, '.tools', 'daily-cards.py'), 'utf8')
  const find = 'DAY_CUT_HOURS = 4'
  const hits = source.split(find).length - 1
  if (hits !== 1) {
    return { ok: false, cut: cutHours, day: null, exit_code: null, file: null, dirs: [], why: `\`.tools/daily-cards.py\` 里 ${JSON.stringify(find)} 出现 ${hits} 次（这一刀必须恰好切一处）` }
  }
  const py = pythonBin()
  if (!py.ok) return { ok: false, cut: cutHours, day: null, exit_code: null, file: null, dirs: [], why: py.note }
  const dir = fixtureDir('DBY', `cards-knife-${cutHours}h`)
  const file = path.join(dir, `daily-cards-cut${cutHours}.py`)
  writeFileSync(file, source.replace(find, `DAY_CUT_HOURS = ${cutHours}`), 'utf8')
  const args = [file, '--workspace', roots.ws, '--data-root', roots.brain]
  const started = Date.now()
  const res = withClock(nowIso, () => spawnSync(py.bin, args, {
    cwd: PATHS.repo, env: { ...childEnv() }, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  }))
  const dirs = listDirs(path.join(roots.ws, '.team', 'leader'))
  const exitCode = res?.status ?? null
  const ok = exitCode === 0 && dirs.length === 1
  return {
    ok,
    cut: cutHours,
    day: ok ? dirs[0] : null,
    exit_code: exitCode,
    file,
    dirs,
    ms: Date.now() - started,
    // 只认**这次改一个字面量**之后的落点：目录里多于一个就说不清是哪一次写的。
    why: ok ? '' : `这一刀没跑成（exit=${exitCode} · 落点 ${JSON.stringify(dirs)} · ${short(res?.stderr, 200)}）`,
  }
}

// ── ④ `check-notes` 的那一条红 ──────────────────────────────────────────────
/**
 * 真子进程跑 `.tools/check-notes.mjs`，把「今天的记忆更新报告在（reports/memory-update/<day>.json）」
 * 那一行**逐字**取回来。三件事都从这一行上量：① 它点名的**日子**；② 它的**态**（`ok` / `RED` / `HOLD`）；③ 原文。
 *
 * 这个工具的"今天"走**同一套时钟与同一个切点**：`.tools/check-notes.mjs:241` 是
 * `const today = dayKeyOf(clockNow())`，`:23-24` 从 `presets/agenia/lib/` 取 `clock` 与 `route`；
 * 注入式时钟（`AGENIA_NOW_FILE`）对它生效 ⇒ 这里**照注入时钟的方式驱它**，两个方向各摆一个时刻。
 * 哪一天它退回真时钟 / 退回零点切，`DBY-05` 的 `DBY-CN-CLOCK-IGNORED` 与 `DBY-CN-*` 当场红 ——
 * 这一格**只判、不改**（`.tools/**` 不在测试岗的可写范围里）。
 */
export function runCheckNotes(iso, tag) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const dir = path.join(runRoot, 'dby05-check-notes')
  mkdirSync(dir, { recursive: true })
  const nowFile = path.join(dir, `now-${tag}.txt`)
  writeFileSync(nowFile, `${iso}\n`, 'utf8')
  const env = { ...childEnv(), [ENV.NOW_FILE]: nowFile }
  const started = Date.now()
  const res = spawnSync(NODE_BIN, [path.join(PATHS.repo, '.tools', 'check-notes.mjs')], {
    cwd: PATHS.repo, env, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  })
  const lines = String(res.stdout ?? '').split(/\r?\n/)
  const row = lines.find((l) => l.includes('今天的记忆更新报告')) ?? null
  const mark = row === null ? null : row.trim().split(/\s+/)[0]
  const hit = row === null ? null : /reports\/memory-update\/(\d{4}-\d{2}-\d{2})\.json/.exec(row)
  return {
    iso,
    now_file: nowFile,
    exit_code: res.status ?? null,
    ms: Date.now() - started,
    mark,
    day: hit === null ? null : hit[1],
    row: row === null ? null : row.trim(),
    stderr: short(res.stderr, 300),
    summary_line: lines.find((l) => /条通过/.test(l)) ?? null,
  }
}

/** 记忆库根在不在（`check-notes` 那一格的前置：库不在 ⇒ 它走「挂起」那一支，两向都判不了）。 */
export function memoryRootReading() {
  const root = path.join(PATHS.finalPreset, '.runtime')
  return {
    path: root,
    exists: existsSync(root),
    reports_dir: path.join(root, 'reports', 'memory-update'),
    note: '前置：库在、报告缺 —— 两向才都判得了（库不在 ⇒ 体检走"挂起"，那是另一件事）',
  }
}

/**
 * **票号那一侧的形状**：`lib/tickets.mjs::nextTicketId(tickets, dayKey)` 的第二个入参
 * 就是 `route.mjs::dayKeyOf(at)` 的输出（`bin/agenia-route.mjs:524`）。
 *
 * 🔴 契约 §13.4：**已经发出去的号不许重编**，而"新号的形状"也不许跟着日子形状一起变 ——
 * 收敛之后如果 `dayKeyOf` 返回 `2026-10-23`，这里必须仍然得到 `ticket-20261023-01`
 * （8 位那一段由日子派生，不是把带连字符的整串塞进去）。今天**形状是对的**（`YYYYMMDD`）
 * ⇒ 这一条是**回归锁**：它红，只可能是有人把那个 8 位改了。
 */
export async function ticketIdShape(iso) {
  const dayProbe = await stagedDayKeyOf(iso)
  if (!dayProbe.ok) return { ok: false, rel: 'lib/tickets.mjs', day: null, id: null, error: dayProbe.error, missing: dayProbe.missing, shape_ok: false }
  const rel = 'lib/tickets.mjs'
  if (!stagingExists(rel)) return { ok: false, missing: true, rel, day: dayProbe.day, id: null, error: `staged 里还没有 ${rel}`, shape_ok: false }
  let mod = null
  try {
    mod = await importStaged(rel)
  } catch (err) {
    return { ok: false, missing: err?.code === 'SUT-SURFACE-MISSING', rel, day: dayProbe.day, id: null, error: String(err?.message ?? err).slice(0, 240), shape_ok: false }
  }
  if (typeof mod?.nextTicketId !== 'function') {
    return { ok: false, missing: true, rel, day: dayProbe.day, id: null, error: `${rel} 没有导出函数 nextTicketId`, shape_ok: false }
  }
  const id = mod.nextTicketId([], dayProbe.day)
  const shapeOk = /^ticket-\d{8}-\d{2}$/.test(String(id))
  return { ok: shapeOk, missing: false, rel, day: dayProbe.day, id, shape_ok: shapeOk, error: null, iso }
}

// ── ⑤ 阳性对照 + 刀（四个测试文件共用的一份）──────────────────────────────────
/**
 * 跑一遍 REF 的八格 + 四把刀，**只对 `ownedKnifeId` 那一把**判定向量（一刀一格：别的刀是读数）。
 *
 * 为什么四把刀都要跑、却只有一把断言：向量是**从契约推出来的**（`KNIVES[].want`），
 * 一把刀翻错了格子 ⇒ 那一格的判据与别的格子共用了同一处判断（多翻）或没切到（少翻）。
 * 但"多翻/少翻"的结论只能落在**拥有那一刀**的那一格上，否则同一件事会在四个用例里红四遍，
 * 红基线就读不出"是哪一条规矩坏了"。
 *
 * @param {string} ownedKnifeId 本格拥有的那一把刀的 id（`KNIVES[].id`）
 * @returns {Promise<{problems: Array<{code: string, message: string}>, readings: object}>}
 */
export async function controlArm(ownedKnifeId) {
  const problems = []
  const readings = {
    subject: 'reference',
    why: '刀打在**照 §13 写的最小实现**的字节上（**不碰 `presets/**`**：生产里那几行存在之前没有字节可删）；'
      + '生产臂今天是不是红的，由这一格的三条腿自己回答',
    owned_knife: ownedKnifeId,
    ref: null,
    matrix: null,
    knives: [],
  }
  let ref = null
  try {
    ref = await loadRef()
  } catch (err) {
    problems.push({ code: 'CONTROL-REF-IMPORT', message: `最小实现 import 失败（阳性对照这一格不成立）：${String(err?.message ?? err).slice(0, 200)}` })
  }
  if (ref !== null) {
    readings.ref = { file: ref.file, bytes: ref.bytes, sha256: ref.sha256 }
    const matrix = matrixOf(ref.mod)
    readings.matrix = matrix
    for (const c of CELLS) {
      if (matrix[c.id].ok) continue
      problems.push({
        code: 'CONTROL-REF-CELL',
        message: `阳性对照（照 §13 写的最小实现）在 ${c.id}（${c.what}）没成立：实得 ${JSON.stringify(matrix[c.id].got)}、期望 ${JSON.stringify(c.want)}`
          + ` ${matrix[c.id].error === null ? '' : `· 抛了 ${matrix[c.id].error}`}`
          + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理，不许拿"实现还没做"糊过去',
      })
    }
  }
  for (const knife of KNIVES) {
    const row = { id: knife.id, by: knife.by, title: knife.title, want: knife.want, measured: null, ok: false, error: null }
    if (ref === null) {
      row.error = 'REF 没起来 ⇒ 这一刀没有可比的对象（刀与基线是两件事，缺一条这一票不算数）'
      readings.knives.push(row)
      if (knife.id === ownedKnifeId) problems.push({ code: 'KNIFE-NO-BASELINE', message: `${knife.id}：${row.error}` })
      continue
    }
    const cut = cutKnife(knife)
    if (!cut.ok) {
      row.error = cut.why
      readings.knives.push(row)
      if (knife.id === ownedKnifeId) problems.push({ code: cut.code, message: `${knife.id}（${knife.title}）：${cut.why}` })
      continue
    }
    try {
      const mod = await importSource(fixtureDir('DBY', `knife-${knife.id.toLowerCase()}`), 'k', cut.source)
      row.measured = flippedIds(mod.mod)
      row.ok = JSON.stringify(row.measured) === JSON.stringify(knife.want)
      row.file = mod.file
      row.sha256 = mod.sha256
    } catch (err) {
      row.error = `刀出了 import 失败（那不是"变红"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`
    }
    readings.knives.push(row)
    if (knife.id !== ownedKnifeId) continue
    if (row.measured === null) problems.push({ code: 'KNIFE-IMPORT', message: `${knife.id}（${knife.title}）：${row.error}` })
    else if (!row.ok) {
      problems.push({
        code: 'KNIFE-WRONG-VECTOR',
        message: `${knife.id}（${knife.title}）：翻面的格子是 ${JSON.stringify(row.measured)}，契约推出的是 ${JSON.stringify(knife.want)}`
          + ' —— 一个变异体只证一格（mig-rules-16）：多翻说明那一支与别的格子共用同一处判据，少翻说明这刀没切到它',
      })
    }
  }
  // K1 的"切点消失"读数：去掉 −4h 之后，两个边界时刻**落在同一天**（切点没了）。
  if (ref !== null) {
    const k1 = KNIVES.find((k) => k.id === 'K1-NO-OFFSET')
    const cut = cutKnife(k1)
    if (cut.ok) {
      const mod = await importSource(fixtureDir('DBY', 'knife-collapse'), 'k', cut.source)
      readings.cut_collapse = {
        what: 'K1 之后 dayKeyOf(切点下方) 与 dayKeyOf(切点上方) 是不是同一天',
        below: mod.mod.dayKeyOf(instant(DAY_BELOW)),
        above: mod.mod.dayKeyOf(instant(DAY_ABOVE)),
        collapsed: mod.mod.dayKeyOf(instant(DAY_BELOW)) === mod.mod.dayKeyOf(instant(DAY_ABOVE)),
        why: '这一条是读数：它说明"去掉 −4h"这一刀只能翻切点**下方**那一格（上方那一格在两种尺子下同值）',
      }
    }
  }
  return { problems, readings }
}
