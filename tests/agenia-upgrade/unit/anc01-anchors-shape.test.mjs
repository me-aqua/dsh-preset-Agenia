/**
 * `ANC-01` · **`F-129`** —— `anchors` 的形状不对，被当成「调用方没给」。
 *
 * 被测面：`presets/agenia/lib/receipt.mjs` 的 `codeFingerprintVerdict(fp, anchorsFp)` 对账那一段。
 *
 * 一句话病根：**校验方以为自己核过了，其实一个字节都没核。** 那一层判"给没给"用的是"是不是对象"：
 * 字符串（哪怕它本身就是 64 hex）/ 数组 / 数字 / 布尔，以及对象里某一项不是 64 hex，
 * 全都被当成"这一格没给"，静默跳过 ⇒ `ok:true` + `detail:''` —— 与"真核过"长得一模一样。
 *
 * 口径来源（两份；哪份跟哪份对不上就当场提出来，别自己编）：
 *   · `.team/leader/2026-10-23/spec-F-129.md`「目标」那张表（跳过 / 拒 / 拒 / 跳过 / 过 / 拒 六行）；
 *   · `CONTRACT.md` §6.3（`F-122` 必须自己判的三样 + 拒绝形状 ①–④ + 「判不了的那一格」；`F-129` 追加的 ⑤–⑨ 五行）。
 *
 * 八格（`want` 手写，不从实现反推）。**输入形状比格多** —— 第三态骑在 `G1` 上、不新开格（分母不动）：
 *   `S0 非对象`    64 hex 的**字符串** / 数组 / 数字 / 布尔        ⇒ 拒 `E_ARG_SCHEMA`
 *   `S1 短哈希`    `{before_sha256:'abc', after_sha256:'abc'}`    ⇒ 拒 `E_ARG_SCHEMA`
 *   `S2 一半坏`    **第一项对、第二项坏**：`'xyz'` / **`null`** / **空串**（`''`）⇒ 拒 `E_ARG_SCHEMA`
 *                  （口径：`undefined` = 这一项**没给** ⇒ 跳过它（⑦）；`null` = **给了但形状不对** ⇒ 按 ⑥ 拒；
 *                  `''` 同样是"给了"。`null ≠ undefined`，空串更不是"没给"）
 *   `S3 两项都坏`  `{before_sha256:42, after_sha256:false}`；外加**第二项才是坏的那个** `{SHA_A, false}`
 *                  ⇒ 拒 `E_ARG_SCHEMA`（`false` 必须真被读到 —— 停在第一项上就算数，等于没覆盖 `false`）
 *   `G1 没给`      `null` / 省略第二个实参（走默认参数）           ⇒ `ok:true` + `code:null`，**且 `detail` 非空、写明"判不了"**
 *                  **第三态**：`{}` / 两项都写成 `undefined` —— **对象在、但一项都没给** ⇒ **与 `null` 同形**（一项都没核）。
 *                  （空串读起来就像"核过" —— 契约 §6.3 ⑧ 那一行；这一支单独一个红因 `ANCHORS-NULL-DETAIL-SILENT`）
 *   `G2 全对`      声明 = 盘面复算（两边都是 `SHA_A`）；或**只给一项** `{before_sha256: SHA_A}`（给了一项就核过一项）
 *                  ⇒ `ok:true` + `code:null`，**且 `detail` 必须是空串**（判过的这一格不许带"判不了"的话）
 *   `D1 真对不上`  `anchor.before = SHA_B ≠ 声明 SHA_A`（声明自洽）⇒ 拒 `E_CODE_FINGERPRINT_MOVED`（既有行为，不许退化）
 *   `D2 次序`      `fp` 不合法（`equal:false`）+ `anchors` 是个 64 hex **字符串**（两样都该拒）
 *                  ⇒ 必须报 `fp` 那一条（`E_CODE_FINGERPRINT_MOVED`）；报成 `E_ARG_SCHEMA` = 先判了 `anchors` 的形状
 *                  （契约 §6.3「次序」那一行 —— 没有这一格，那句散文就是零判据）
 *
 * 四条控制 —— **它们才是"红"这个字的合法性来源**：
 *   · `REF`：本文件里那份**照上面两张表写的最小实现**跑同样八格 ⇒ 八格必须全部成立。
 *     它证明这八格是可实现的（不是"永远红"），而且缺哪一样就红在哪一格（`mig-rules-14`）。
 *   · `KNIFE`：把 REF 里那句「非对象就报错」**整行删掉**再跑 ⇒ `S0` 必须不再被拒（翻面），
 *     而 `S1`/`S2`/`S3` 仍被拒 ⇒ 这一刀只证 `S0`（`mig-rules-16`：一个变异体只证一格）。
 *     ⚠️ 刀打在 REF 的字节上，**不碰 `presets/**`**：生产里那句话存在之前没有字节可删；
 *     REF 是同一句话的载体，刀读数自带 `readings.knife.subject`（`sut` = 删的是被测面那一行，
 *     `reference` = 删的是最小实现那一行）。两种都必须让 `S0` 翻面，否则这一刀不成立。
 *   · `KNIFE2`：把 REF 里那句**共享的**「判不了」文案 `UNJUDGEABLE` **挖空成 `''`**（`ok`/`code` 一个字节不动）⇒
 *     `G1` 的 detail 那一支翻红，其余七格与 `G1` 的 `ok`/`code` 都不许动。
 *     ⚠️ 那句文案是**三态共用一处** ⇒ 这一刀会把 `G1` 的**四个输入一起**翻红（`null` / 省略 / `{}` / 两项都 undefined）——
 *     这是**正确结果**，不是副作用；它反过来证明"第三态与 `null` 同形"这条规则在 REF 里真的是一处。
 *     若它只翻红一部分，报 `KNIFE2-PARTIAL`（说明那句话被写成了多处，这一刀只切到其中一处）。
 *     ⚠️ 没有这一刀，detail 那条判据就是"写上去但没人证它会红"（`cand-20261016-promise-without-assertion-01`）。
 *   · `KNIFE3`：把 REF 里**"判过"那一侧的 `detail`** 换成一句 caveat（含「判不了」，`ok`/`code` 不动）⇒
 *     `G2` 的 detail 那一支（`isEmpty`）必须翻红，其余七格与 `G2` 的 `ok`/`code` 不许动。
 *     ⚠️ 没有这一刀，`ANCHORS-GOOD-DETAIL-CAVEATED` 就是同一句"写上去但没人证它会红"：
 *     前两把刀都只能把 detail **变空**，做不出"判过了却带一句判不了"。
 *     若它只翻红 `G2` 的一部分输入，报 `KNIFE3-PARTIAL`（同 `KNIFE2-PARTIAL` 的口径）。
 *
 * 边界（这一格不覆盖什么）：只钉纯函数层。接缝
 * `validateReceiptCoverage(receipt, findings, tickets, anchors)` 把 `anchors.code_fingerprint`
 * 原样转给本函数，它自己的形状判据不在这一格里 —— 那个入口的三种形状由 `VRF-03` 守着。
 * 另：`G1` 的两个红因码保留旧名（`ANCHORS-NULL-*`）—— 它们现在管的是"**一项都没给**"这一族（第三态在内），
 * 报文逐条点名是哪个输入，所以不改名（这两个码在档案里要能 grep 到）。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { caseFail, preflight, problem, runCase, sha256File, sha256Text } from '../support/evidence.mjs'
import { loadStagedModule, stagingPath } from '../support/sut.mjs'
import { fixtureDir } from '../support/verify-recompute.mjs'

before(() => {
  preflight()
})

/**
 * 两个"盘面复算值"：**真算出来的** 64 hex（sha256 of 一段写在这儿的夹具文本），不是手打的一串 `a`。
 * 形状与相等关系都够这一票用；这一票判的是"形状与逐项对账"，不是"指纹那把尺子"（那是 `VRF-01`）。
 */
const SHA_A = sha256Text('# ANC-01 · 盘面复算 A（夹具文本）\n')
const SHA_B = sha256Text('# ANC-01 · 盘面复算 B（夹具文本）\n')

/** 声明值那一侧：两个哈希自洽（`equal:true` 且 before = after）。 */
const fpOk = () => ({ equal: true, before_sha256: SHA_A, after_sha256: SHA_A })
/** `D2` 那一格用：两个哈希仍自洽，坏的是 `equal`（作业自己说"本次作废"，契约 ④）。 */
const fpBad = { equal: false, before_sha256: SHA_A, after_sha256: SHA_A }
/** `undefined` 那一格要"省略第二个实参"才走得到默认参数 —— 用一个哨兵表示。 */
const OMIT = Symbol('omit-argument')

/**
 * 八格：`key` / `code`（红因码，稳定可 grep）/ `title` / `inputs`（一格可以有多种形状）/ `want`；
 * 有一支要**单独报**的格多一个 `detail_code`（`G1` 形状对但 `detail` 什么都没说 `ANCHORS-NULL-DETAIL-SILENT`；
 * `G2` 判过了却写了"判不了" `ANCHORS-GOOD-DETAIL-CAVEATED`）。
 * `want` 写 `ok`、`code`（成立时允许多值就写数组）；写了 `detail` 的那一格，`detail` 那一支也要成立
 * （`mustInclude` = 必须写明判不了；`isEmpty` = 必须恰为空串）。
 */
const CELLS = [
  {
    key: 'S0',
    code: 'ANCHORS-NON-OBJECT',
    title: '非对象（字符串 / 数组 / 数字 / 布尔）',
    inputs: [
      ['字符串·本身就是 64 hex', SHA_A],
      ['数组·[SHA_A, SHA_A]', [SHA_A, SHA_A]],
      ['数字·42', 42],
      ['布尔·false', false],
    ],
    want: { ok: false, code: 'E_ARG_SCHEMA' },
  },
  {
    key: 'S1',
    code: 'ANCHORS-SHORT-HASH',
    title: '短哈希（两项都不是 64 hex）',
    inputs: [['对象·before=abc / after=abc', { before_sha256: 'abc', after_sha256: 'abc' }]],
    want: { ok: false, code: 'E_ARG_SCHEMA' },
  },
  {
    key: 'S2',
    code: 'ANCHORS-HALF-BAD',
    title: '一半坏（第一项对、第二项坏：xyz / null / 空串 —— null 是"给了但形状不对"，不是"没给"）',
    inputs: [
      ['对象·before=SHA_A / after=xyz', { before_sha256: SHA_A, after_sha256: 'xyz' }],
      // 第二项是坏的那个，且它是"假值"：`if (!raw) continue` / `if (raw == null) continue` 这类变异体会把它
      // 静默当成"没给"⇒ 变成 compared=1 + detail:''（"我核过"而这一项一个字节都没核）。这两条输入就是抓它的。
      ['对象·before=SHA_A / after=null（第二项给了个 null）', { before_sha256: SHA_A, after_sha256: null }],
      ['对象·before=SHA_A / after=空串（`\'\'`）', { before_sha256: SHA_A, after_sha256: '' }],
    ],
    want: { ok: false, code: 'E_ARG_SCHEMA' },
  },
  {
    key: 'S3',
    code: 'ANCHORS-BOTH-BAD',
    title: '坏值（42 / false）—— 外加"第二项才是坏的那个"，让 false 真被读到',
    inputs: [
      ['对象·before=42 / after=false（两项都坏，停在第一项上）', { before_sha256: 42, after_sha256: false }],
      // 上一行只会读到 `42`（生产在那一项就 return 了）⇒ `false` 一次都没被读。这一行让 false 成为**第二项**。
      ['对象·before=SHA_A / after=false（第二项才是坏的那个）', { before_sha256: SHA_A, after_sha256: false }],
    ],
    want: { ok: false, code: 'E_ARG_SCHEMA' },
  },
  {
    key: 'G1',
    code: 'ANCHORS-NULL-DEGRADED',
    detail_code: 'ANCHORS-NULL-DETAIL-SILENT',
    title: '没给（null / 省略 / 对象在但一项都没给）—— 这一格判不了，但不许判成"核过"之外的任何东西',
    inputs: [
      ['null', null],
      ['省略第二个实参（默认参数）', OMIT],
      ['对象·{}（给了个对象，一项都没给）', {}],
      ['对象·两项都写成 undefined', { before_sha256: undefined, after_sha256: undefined }],
    ],
    // 两支分开判、分开报：`ok`/`code` 不许退化（`code` 那个红因）；`detail` 必须写明"判不了"（`detail_code` 那个红因）。
    // 第三态（对象在、但一项都没给）与 `null` 同形 —— 同一格、同一支判据、同一个红因，不新开格（分母不动）。
    want: { ok: true, code: null, detail: { mustInclude: ['判不了'] } },
  },
  {
    key: 'G2',
    code: 'ANCHORS-GOOD-DEGRADED',
    detail_code: 'ANCHORS-GOOD-DETAIL-CAVEATED',
    title: '全对（声明 = 盘面复算）—— 判过的那一格，detail 必须是空串',
    inputs: [
      ['对象·before=after=SHA_A（两项都给、都对）', { before_sha256: SHA_A, after_sha256: SHA_A }],
      // 反面对照（"规则没有吞掉真活"）：给了一项就核过一项 ⇒ 这一格**判过**，detail 不许带"判不了"那类话。
      ['对象·只给 before=SHA_A（给了一项、核过一项）', { before_sha256: SHA_A }],
    ],
    want: { ok: true, code: null, detail: { isEmpty: true } },
  },
  {
    key: 'D1',
    code: 'ANCHORS-MOVED-DEGRADED',
    title: '真对不上（anchor.before 是 SHA_B，声明自洽于 SHA_A）',
    inputs: [['对象·before=SHA_B / after=SHA_A', { before_sha256: SHA_B, after_sha256: SHA_A }]],
    want: { ok: false, code: 'E_CODE_FINGERPRINT_MOVED' },
  },
  {
    key: 'D2',
    code: 'ANCHORS-ORDER-SWAPPED',
    title: '次序（坏 fp + anchors 是个 64 hex 字符串 —— 两样都该拒，但必须报 fp 那一条）',
    // 一条输入里同时喂两个坏东西：`fp` 自己说"本次作废"（④），`anchors` 是非对象（⑤）。
    // 契约 §6.3「次序」：`fp` 的 ①②③④ 先判 ⇒ 该报 `E_CODE_FINGERPRINT_MOVED`。
    inputs: [['fp={equal:false,…} + anchors=64 hex 字符串', SHA_A, fpBad]],
    want: { ok: false, code: 'E_CODE_FINGERPRINT_MOVED' },
    hint: '若实得 `E_ARG_SCHEMA`，说明先判了 anchors 的形状（次序反了）—— 该报的是 fp 的 ④/①②③',
  },
]

/**
 * 照 `spec-F-129` 的「目标」表 + `CONTRACT.md` §6.3 写的**最小实现**（阳性对照）。
 *
 * 它与被测面同签名、同码、只判这一件事。三处刻意写成这样：
 *   · 「非对象就报错」是**单独一整行** —— 反向刀一删的就是这一行；
 *   · 逐项读 `anchorsFp?.[key]`（不是 `if (isObject) { for … }` 那种整块包起来）——
 *     所以那一行删掉之后，非对象会**静默跳过**（正是被测面当初的病根形状），而不是抛 `TypeError`。
 *     刀要的是"变绿"，不是"换个崩法"。
 *   · **"一项都没给"只说一句文案**（`UNJUDGEABLE`）：`null` / 省略 / 对象在但一项都没给，三态共用它 ——
 *     "第三态与 `null` 同形"这条规则在代码里就是**一处**，所以反向刀二只挖这一个常量就能把 `G1` 四形全翻红。
 */
const REF_SOURCE = `// ANC-01 的阳性对照：照契约写的最小实现（**不是生产代码**，只住在运行根里）。
const CODE_MOVED = 'E_CODE_FINGERPRINT_MOVED'
const E_SCHEMA = 'E_ARG_SCHEMA'
const KEYS = ['before_sha256', 'after_sha256']
const UNJUDGEABLE = '调用方一项盘面复算都没给 ⇒ 这一格判不了'
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isSha256 = (v) => typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v.trim())
const shaKeyOf = (v) => (isSha256(v) ? v.trim().toLowerCase() : null)
const supplied = (v) => (isObject(v) ? KEYS.filter((k) => v[k] !== undefined) : [])

export function codeFingerprintVerdict(fp, anchorsFp = null) {
  if (!isObject(fp)) return { ok: false, code: E_SCHEMA, detail: 'code_fingerprint 必填且必须是对象' }
  if (fp.equal !== true) return { ok: false, code: CODE_MOVED, detail: 'equal !== true ⇒ 本次作废' }
  const before = shaKeyOf(fp.before_sha256)
  const after = shaKeyOf(fp.after_sha256)
  if (before === null || after === null) return { ok: false, code: E_SCHEMA, detail: '两个哈希不都可复核' }
  if (before !== after) return { ok: false, code: CODE_MOVED, detail: 'equal:true 却 before ≠ after' }
  if (anchorsFp === null || anchorsFp === undefined) return { ok: true, code: null, detail: UNJUDGEABLE }
  if (!isObject(anchorsFp)) return { ok: false, code: E_SCHEMA, detail: '给了东西就得是个东西（非对象）' }
  // 第三态：对象在、但两项都没出现 ⇒ 一项都没核 ⇒ 与 null 同形（同一句文案）
  if (supplied(anchorsFp).length === 0) return { ok: true, code: null, detail: UNJUDGEABLE }
  const mismatches = []
  for (const [key, own] of [['before_sha256', before], ['after_sha256', after]]) {
    const raw = anchorsFp?.[key]
    if (raw === undefined) continue
    const anchor = shaKeyOf(raw)
    if (anchor === null) return { ok: false, code: E_SCHEMA, detail: key + ' 不是 64 hex' }
    if (own !== anchor) mismatches.push(key)
  }
  if (mismatches.length > 0) return { ok: false, code: CODE_MOVED, detail: '与盘面复算对不上：' + mismatches.join(' / ') }
  return { ok: true, code: null, detail: '' }
}
`

/** 反向刀要删的那一行（在 `REF_SOURCE` 里逐字存在；找不到就当场报 `KNIFE-LINE-MISSING`）。 */
const KNIFE_LINE = /^ *if \(!isObject\(anchorsFp\)\) return .*$/m

/**
 * 第二把刀要挖的那一行：REF 里那句**共享的**"判不了"文案（`null` / 省略 / 对象在但一项都没给，三态共用）。
 * 刀只把这一行的字符串值换成 `''`，`ok` / `code` 一个字节不动 ⇒ 只该切 `G1` 的 detail 支（四形一起翻）。
 */
const KNIFE2_LINE = /^ *const UNJUDGEABLE = '.+'$/m
const KNIFE2_TEXT = /'[^']*'/

/**
 * 第三把刀要换的那一行：REF 里**"判过"那一侧**的返回（`detail: ''`）。
 * 刀只把 `detail` 换成一句带「判不了」的 caveat，`ok` / `code` 一个字节不动 ⇒ 只该切 `G2` 的 detail 支（`isEmpty`）。
 * 前两把刀都只能把 detail **变空**（做不出"判过了却带一句判不了"），这一刀补的就是那一格。
 */
const KNIFE3_LINE = /^ *return \{ ok: true, code: null, detail: '' \}$/m
const KNIFE3_CAVEAT = "  return { ok: true, code: null, detail: '这一格判不了（刀三：判过的那一侧带了 caveat）' }"

/** 调一次判词 —— 不抛（抛也是一种"没按 want 回话"，要如实记）。`fp` 缺省 = "自洽且合法"那一份。 */
function callVerdict(fn, anchors, fp = fpOk()) {
  try {
    const out = anchors === OMIT ? fn(fp) : fn(fp, anchors)
    return { threw: null, ok: out?.ok ?? null, code: out?.code ?? null, detail: String(out?.detail ?? '') }
  } catch (err) {
    return { threw: String(err?.message ?? err).slice(0, 200), ok: null, code: null, detail: '' }
  }
}

const wantOf = (want) => `${want.ok ? 'ok:true' : 'ok:false'}/${want.code === null ? 'code:null' : want.code}`
  + (want.detail === undefined ? ''
    : want.detail.isEmpty === true ? "/detail==''（真核过，不许带判不了的话）"
      : `/detail≠'' 且含「${want.detail.mustInclude.join('」「')}」`)

/** 一条读数的形状：`want 成立了没有`，以及不成立时**实得什么**（每个输入各一条）。 */
function holds(got, want) {
  if (got.threw !== null) return false
  return got.ok === want.ok && got.code === want.code
}

/**
 * `want.detail` 那一支（只有写了 `detail` 的格才评），两种写法：
 *   · `{ mustInclude: [...] }` —— `detail` 非空，且包含要求的那几个词（"这一格判不了"那一侧）；
 *   · `{ isEmpty: true }`       —— `detail` 必须**恰为空串**（"这一格判过"那一侧：不许带判不了的话）。
 * 与 `holds` 分开，是为了让"形状不对"和"detail 说错了话"报成**两个**红因 —— 两者的修法不是一回事。
 */
function detailHolds(got, want) {
  if (want.detail === undefined) return true
  if (got.threw !== null) return false
  const text = String(got.detail ?? '').trim()
  if (want.detail.isEmpty === true) return text === ''
  if (text === '') return false
  return want.detail.mustInclude.every((needle) => text.includes(needle))
}

/** `detail` 那一支没成立时，说清**该说哪一句**（两个方向的话不许混着说）。 */
const detailHint = (want) => (want.detail?.isEmpty === true
  ? '契约 §6.3 ③/⑦：给了一项就核过一项 ⇒ 这一格**判过**，detail 必须是空串；写"判不了"等于把核过的活退回成没核'
  : '契约 §6.3 ⑧：一项都没给时 detail 必须写明这一格判不了；空串读起来就像"核过"，那一步就是假绿')

const gotOf = (got) => (got.threw !== null ? `抛了 ${got.threw}` : `ok=${String(got.ok)} code=${got.code}`)

/** 把八格喂给一个模块，逐格评"want 成立了没有"（`ok`/`code` 一支 + `detail` 一支，分开报）。 */
function evaluate(fn) {
  return CELLS.map((cell) => {
    // 输入是 `[label, anchors]`，需要时第三位给一份自定义 `fp`（`D2` 那条"次序"输入用）
    const got = cell.inputs.map(([label, anchors, fp]) => ({ label, result: callVerdict(fn, anchors, fp ?? fpOk()) }))
    const broke = got.filter((g) => !holds(g.result, cell.want))
    // detail 那一支只对"ok/code 已经对了"的输入评 —— 形状都没对上时先说形状，别把两句红因摞在同一格里
    const silent = got.filter((g) => holds(g.result, cell.want) && !detailHolds(g.result, cell.want))
    return {
      cell: cell.key,
      code: cell.code,
      detail_code: cell.detail_code ?? null,
      title: cell.title,
      want: wantOf(cell.want),
      hint: cell.hint ?? null,
      held: broke.length === 0 && silent.length === 0,
      got,
      broke,
      silent,
    }
  })
}

/** 落一份源码到运行根之下并 import 它（URL 带哈希 ⇒ 同一进程里不会拿到缓存里的旧字节）。 */
async function importSource(dir, name, source) {
  const sub = path.join(dir, name)
  mkdirSync(sub, { recursive: true })
  const file = path.join(sub, 'receipt.mjs')
  writeFileSync(file, source, 'utf8')
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex')
  const mod = await import(`${pathToFileURL(file).href}?sha256=${sha256}`)
  return { mod, file, sha256, bytes: Buffer.byteLength(source, 'utf8') }
}

const readingsOf = (rows) => rows.map((r) => ({
  cell: r.cell,
  want: r.want,
  held: r.held,
  broke: r.broke.map((g) => g.label),
  detail_silent: r.silent.map((g) => g.label),
  got: r.got.map((g) => ({ input: g.label, threw: g.result.threw, ok: g.result.ok, code: g.result.code, detail: g.result.detail.slice(0, 120) })),
}))

describe('unit · anchors-shape (ANC) · F-129 anchors 形状不对被当成「没给」', () => {
  test('ANC-01 anchors 五格必拒（四格 E_ARG_SCHEMA + 次序那一格报 fp 那条）、两格必过、一格不许退化；阳性对照 + 三把反向刀', async () => {
    await runCase('ANC-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── ⓪ 被测面：staged 的 `lib/receipt.mjs`（缺面 = 预期红，`SUT-SURFACE-MISSING`）──
      const lib = await loadStagedModule('lib/receipt.mjs', ['codeFingerprintVerdict'])
      rec.readings.sut = {
        surfaceMissing: lib.surfaceMissing,
        missing: lib.missing,
        errors: lib.errors,
        file: (() => { try { return stagingPath('lib/receipt.mjs') } catch { return null } })(),
      }
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/receipt.mjs 不在 —— anchors 形状那八格拿不到（预期红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/receipt.mjs 没有导出 ${n}`)
      if (lib.mod === null) return caseFail(problems)
      const { codeFingerprintVerdict } = lib.mod
      if (typeof codeFingerprintVerdict !== 'function') {
        push('SUT-SURFACE-MISSING', 'codeFingerprintVerdict 不是一个函数 —— 八格没有可喂的东西')
        return caseFail(problems)
      }
      rec.readings.sut.sha256 = (() => { try { return sha256File(rec.readings.sut.file) } catch { return null } })()

      // ── ① 被测面：八格逐格（五格该拒、两格该过、一格不许退化）──────────────
      const sutRows = evaluate(codeFingerprintVerdict)
      rec.readings.cells = readingsOf(sutRows)
      for (const row of sutRows) {
        if (row.broke.length > 0) {
          const detail = row.broke.map((g) => `${g.label} ⇒ ${gotOf(g.result)}`).join(' · ')
          push(row.code, `${row.cell} ${row.title}：want ${row.want}，实得 ${detail}`
            + (row.hint === null ? '' : ` · ${row.hint}`), detail)
        }
        if (row.silent.length > 0) {
          const detail = row.silent.map((g) => `${g.label} ⇒ detail=${JSON.stringify(g.result.detail)}`).join(' · ')
          push(row.detail_code ?? 'ANCHORS-DETAIL-GUARD',
            `${row.cell} ${row.title}：ok/code 这一支成立（${row.want}），但 detail 那一支不成立 —— 实得 ${detail}`
            + ` ⇒ ${detailHint(row)}`,
            detail)
        }
      }

      // ── ② 阳性对照：照契约写的最小实现，同样八格必须全部成立 ──────────────
      let ref = null
      let refRows = null
      try {
        ref = await importSource(fixtureDir('ANC-01', 'anchors-ref'), 'ref', REF_SOURCE)
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小实现 import 失败（阳性对照这一格不成立）：${String(err?.message ?? err).slice(0, 200)}`)
      }
      if (ref !== null) {
        rec.readings.ref = { file: ref.file, bytes: ref.bytes, sha256: ref.sha256, cells: null }
        refRows = evaluate(ref.mod.codeFingerprintVerdict)
        rec.readings.ref.cells = readingsOf(refRows)
        for (const row of refRows) {
          if (row.broke.length > 0) {
            const detail = row.broke.map((g) => `${g.label} ⇒ ${gotOf(g.result)}`).join(' · ')
            push('CONTROL-REF-CELL',
              `阳性对照（照契约的最小实现）在 ${row.cell} 没成立：want ${row.want}，实得 ${detail}`
              + (row.hint === null ? '' : ` · ${row.hint}`)
              + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理，不许拿"实现还没做"糊过去')
          }
          if (row.silent.length > 0) {
            const detail = row.silent.map((g) => `${g.label} ⇒ detail=${JSON.stringify(g.result.detail)}`).join(' · ')
            push('CONTROL-REF-DETAIL',
              `阳性对照（照契约的最小实现）在 ${row.cell} 的 detail 那一支没成立：want ${row.want}，实得 ${detail}`
              + ` —— ${detailHint(row)}；这一句在最小实现里都写不出来，说明它不是"可实现的判据"，先改契约或改最小实现`)
          }
        }
      }

      // ── ③ 反向刀：删掉「非对象就报错」那一行 ⇒ S0 必须翻面，其余三格不动 ──
      const cut = REF_SOURCE.match(KNIFE_LINE)
      if (ref === null) {
        push('KNIFE-NO-BASELINE', '阳性对照没起来 ⇒ 这一刀没有可比的对象（刀与基线是两件事，缺一条这一票不算数）')
      } else if (cut === null) {
        push('KNIFE-LINE-MISSING', 'REF 里找不到「非对象就报错」那一整行（正则 `^ *if \\(!isObject\\(anchorsFp\\)\\) return .*$`）—— 这一刀没有落点，证明不了任何事')
      } else {
        const knifed = REF_SOURCE.replace(KNIFE_LINE, '')
        let knife = null
        try {
          knife = await importSource(fixtureDir('ANC-01', 'anchors-ref'), 'knife', knifed)
        } catch (err) {
          push('KNIFE-IMPORT', `刀出了 import 失败（那不是"变绿"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`)
        }
        if (knife !== null) {
          const knifeRows = evaluate(knife.mod.codeFingerprintVerdict)
          const rejectCells = knifeRows.filter((r) => ['S0', 'S1', 'S2', 'S3'].includes(r.cell))
          const s0 = rejectCells.find((r) => r.cell === 'S0')
          const others = rejectCells.filter((r) => r.cell !== 'S0')
          rec.readings.knife = {
            subject: 'reference',
            why: '刀删的是最小实现里那一行；被测面（staged/lib/receipt.mjs）里那句话在不在这由 S0 那一格自己回答',
            removed_line: cut[0].trim(),
            file: knife.file,
            sha256: knife.sha256,
            vector: rejectCells.map((r) => ({ cell: r.cell, held: r.held, got: r.got.map((g) => gotOf(g.result)) })),
          }
          if (s0 === undefined || s0.held) {
            push('KNIFE-NOT-FLIPPED',
              '把「非对象就报错」那一行删掉之后，S0（非对象）**仍然被拒** ⇒ 这一刀没有让任何一格翻面，'
              + '（"删了也全红"的刀）⇒ 那几条断言不成立在守这件事')
          }
          for (const row of others) {
            if (row.held) continue
            push('KNIFE-SIDE-EFFECT',
              `${row.cell} 在这一刀下也翻面了（want ${row.want}）—— 删"非对象"那一行不该动到它；`
              + '一个变异体只证一格（mig-rules-16），它翻面说明刀切到了别处或这一格与 S0 共用同一处判据')
          }
        }
      }

      // ── ③' 反向刀二：把 REF 里那句「判不了」的 detail 挖空 ⇒ 只有 G1 的 detail 支翻面 ──
      const cut2 = REF_SOURCE.match(KNIFE2_LINE)
      if (ref === null || refRows === null) {
        push('KNIFE2-NO-BASELINE', '阳性对照没起来 ⇒ 第二刀没有基线可比（这一刀证的是"detail 那一支会翻红"，基线不绿它就说明不了任何事）')
      } else if (cut2 === null) {
        push('KNIFE2-LINE-MISSING', `REF 里找不到那句共享的 \`UNJUDGEABLE\`（这把刀真正用的正则是 \`${KNIFE2_LINE.source}\`）—— 这一刀没有落点，证明不了任何事`)
      } else if (!KNIFE2_TEXT.test(cut2[0])) {
        push('KNIFE2-DETAIL-MISSING', '那一行找到了，但里面没有可挖的字符串值 —— 刀没有落点，证明不了 detail 那一支在守什么')
      } else {
        const blanked = cut2[0].replace(KNIFE2_TEXT, "''")
        const knifed2 = REF_SOURCE.replace(KNIFE2_LINE, () => blanked)
        if (knifed2 === REF_SOURCE) {
          push('KNIFE2-NO-CUT', '这一刀没改动 REF 一个字节（替换没命中）—— 没切开的刀不算刀')
        } else {
          let knife2 = null
          try {
            knife2 = await importSource(fixtureDir('ANC-01', 'anchors-ref'), 'knife2', knifed2)
          } catch (err) {
            push('KNIFE2-IMPORT', `刀二 import 失败（那不是"变红"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`)
          }
          if (knife2 !== null) {
            const g1Base = refRows.find((r) => r.cell === 'G1')
            const knife2Rows = evaluate(knife2.mod.codeFingerprintVerdict)
            const g1k = knife2Rows.find((r) => r.cell === 'G1')
            const rest2 = knife2Rows.filter((r) => r.cell !== 'G1')
            rec.readings.knife_detail = {
              subject: 'reference',
              why: '刀只把 REF 里那句共享的「判不了」文案挖空（三态共用一处，ok/code 一个字节不动）；被测面对应的那一句在不在，由 G1 的 detail 那一支自己回答',
              removed_text: JSON.stringify(cut2[0].match(KNIFE2_TEXT)[0]),
              replaced_with: "''",
              baseline_g1: g1Base === undefined ? null : {
                held: g1Base.held,
                want: g1Base.want,
                detail_silent: g1Base.silent.map((g) => g.label),
                got: g1Base.got.map((g) => `${g.label} ⇒ ${JSON.stringify(g.result.detail.slice(0, 120))}`),
              },
              file: knife2.file,
              sha256: knife2.sha256,
              flipped_inputs: g1k === undefined ? null : g1k.silent.map((g) => g.label),
              not_flipped_inputs: g1k === undefined ? null : g1k.got.filter((g) => g1k.silent.every((s) => s.label !== g.label)).map((g) => g.label),
              vector: knife2Rows.map((r) => ({ cell: r.cell, held: r.held, detail_silent: r.silent.map((g) => g.label) })),
            }
            if (g1Base === undefined || !g1Base.held) {
              push('KNIFE2-NO-BASELINE', 'REF 的 G1 本来就不成立 ⇒ 这一刀"切红了"说明不了任何事（基线先要绿，刀才有意义）')
            }
            if (g1k === undefined) {
              push('KNIFE2-NOT-FLIPPED', '刀二跑完之后 G1 那一格不见了 —— 这一刀没有可判的对象')
            } else {
              if (g1k.silent.length === 0) {
                push('KNIFE2-NOT-FLIPPED',
                  '把 REF 里那句「判不了」挖空之后，G1 的 detail 那一支**仍然成立** ⇒ 这一刀没让任何一格翻面 ⇒ '
                  + 'detail 那条判据不成立在守这件事（写上去也不会红，就是一句承诺）')
              }
              // 那一句文案是三态共用的 ⇒ 这一刀该让 G1 的**每一个**输入都翻红（四形一起翻，是正确结果，不是副作用）
              if (g1k.silent.length > 0 && g1k.silent.length < g1k.got.length) {
                const missed = g1k.got.filter((g) => g1k.silent.every((s) => s.label !== g.label)).map((g) => g.label)
                push('KNIFE2-PARTIAL',
                  `刀二只翻红了 G1 的一部分输入（${g1k.silent.map((g) => g.label).join(' / ')}），`
                  + `没翻的是：${missed.join(' / ')} —— REF 把"判不了"写成了多处，这一刀就只切到其中一处；`
                  + '要么把它收回一处（三态共用一句文案），要么这一刀的读数只能算部分证明')
              }
              if (g1k.broke.length > 0) {
                push('KNIFE2-ALSO-CELL', `刀二只该切 detail，但 G1 的 ok/code 那一支也坏了（want ${g1k.want}）—— 刀切到了别处`)
              }
            }
            for (const row of rest2) {
              if (row.held) continue
              push('KNIFE2-SIDE-EFFECT',
                `${row.cell} 在这一刀下也翻面了（want ${row.want}）—— 挖空那句「判不了」不该动到它；`
                + '一个变异体只证一格（mig-rules-16），它翻面说明刀切到了别处或这一格与 G1 共用同一处判据')
            }
          }
        }
      }

      // ── ③'' 反向刀三：把 REF 里"判过"那一侧的 detail 换成一句 caveat ⇒ 只有 G2 的 detail 支翻面 ──
      const cut3 = REF_SOURCE.match(KNIFE3_LINE)
      if (ref === null || refRows === null) {
        push('KNIFE3-NO-BASELINE', '阳性对照没起来 ⇒ 第三刀没有基线可比（这一刀证的是"判过的格带了判不了的话就会红"，基线不绿它说明不了任何事）')
      } else if (cut3 === null) {
        push('KNIFE3-LINE-MISSING', `REF 里找不到"判过"那一侧的返回（这把刀真正用的正则是 \`${KNIFE3_LINE.source}\`）—— 这一刀没有落点，证明不了任何事`)
      } else {
        const caveated = KNIFE3_CAVEAT
        const knifed3 = REF_SOURCE.replace(KNIFE3_LINE, () => caveated)
        if (knifed3 === REF_SOURCE) {
          push('KNIFE3-NO-CUT', '这一刀没改动 REF 一个字节（替换没命中）—— 没切开的刀不算刀')
        } else {
          let knife3 = null
          try {
            knife3 = await importSource(fixtureDir('ANC-01', 'anchors-ref'), 'knife3', knifed3)
          } catch (err) {
            push('KNIFE3-IMPORT', `刀三 import 失败（那不是"变红"，是换个崩法）：${String(err?.message ?? err).slice(0, 200)}`)
          }
          if (knife3 !== null) {
            const g2Base = refRows.find((r) => r.cell === 'G2')
            const knife3Rows = evaluate(knife3.mod.codeFingerprintVerdict)
            const g2k = knife3Rows.find((r) => r.cell === 'G2')
            const rest3 = knife3Rows.filter((r) => r.cell !== 'G2')
            rec.readings.knife_caveat = {
              subject: 'reference',
              why: '刀只把 REF 里"判过"那一侧的 detail 换成一句带「判不了」的 caveat（ok/code 一个字节不动）；被测面那一侧该不该带 caveat，由 G2 的 detail 支（isEmpty）自己回答',
              original_line: cut3[0].trim(),
              replaced_with: caveated.trim(),
              baseline_g2: g2Base === undefined ? null : {
                held: g2Base.held,
                want: g2Base.want,
                detail_silent: g2Base.silent.map((g) => g.label),
                got: g2Base.got.map((g) => `${g.label} ⇒ ${JSON.stringify(g.result.detail.slice(0, 120))}`),
              },
              file: knife3.file,
              sha256: knife3.sha256,
              flipped_inputs: g2k === undefined ? null : g2k.silent.map((g) => g.label),
              not_flipped_inputs: g2k === undefined ? null : g2k.got.filter((g) => g2k.silent.every((s) => s.label !== g.label)).map((g) => g.label),
              vector: knife3Rows.map((r) => ({ cell: r.cell, held: r.held, detail_silent: r.silent.map((g) => g.label) })),
            }
            if (g2Base === undefined || !g2Base.held) {
              push('KNIFE3-NO-BASELINE', 'REF 的 G2 本来就不成立 ⇒ 这一刀"切红了"说明不了任何事（基线先要绿，刀才有意义）')
            }
            if (g2k === undefined) {
              push('KNIFE3-NOT-FLIPPED', '刀三跑完之后 G2 那一格不见了 —— 这一刀没有可判的对象')
            } else {
              if (g2k.silent.length === 0) {
                push('KNIFE3-NOT-FLIPPED',
                  '把 REF 里"判过"那一侧的 detail 换成 caveat 之后，G2 的 detail 那一支（isEmpty）**仍然成立** ⇒ '
                  + '这一刀没让任何一格翻面 ⇒ `ANCHORS-GOOD-DETAIL-CAVEATED` 不成立在守这件事（写上去也不会红）')
              }
              if (g2k.silent.length > 0 && g2k.silent.length < g2k.got.length) {
                const missed = g2k.got.filter((g) => g2k.silent.every((s) => s.label !== g.label)).map((g) => g.label)
                push('KNIFE3-PARTIAL',
                  `刀三只翻红了 G2 的一部分输入（${g2k.silent.map((g) => g.label).join(' / ')}），没翻的是：${missed.join(' / ')} —— `
                  + 'REF 里"判过"那一侧被写成了多处，这一刀只切到其中一处')
              }
              if (g2k.broke.length > 0) {
                push('KNIFE3-ALSO-CELL', `刀三只该切 detail，但 G2 的 ok/code 那一支也坏了（want ${g2k.want}）—— 刀切到了别处`)
              }
            }
            for (const row of rest3) {
              if (row.held) continue
              push('KNIFE3-SIDE-EFFECT',
                `${row.cell} 在这一刀下也翻面了（want ${row.want}）—— 给"判过"那一侧加 caveat 不该动到它；`
                + '一个变异体只证一格（mig-rules-16），它翻面说明刀切到了别处或这一格走的是同一个出口')
            }
          }
        }
      }

      // ── ④ 写清"哪里判不了"（这一格不假装覆盖得更宽）───────────────────────
      rec.readings.boundary = {
        pure_function_only: '只钉 codeFingerprintVerdict 的纯函数层；validateReceiptCoverage 这个接缝不在这一格里（VRF-03 守它的三种形状）。',
        detail_text: 'G1 判两样：ok/code（不许退化）与 detail（非空且写明"判不了"，单独一个红因）。G1 的输入有四形：null / 省略 / 对象但一项都没给（{} 与两项都写 undefined）—— 第三态与 null 同形：同一段结论（含「判不了」），各自的前缀不同，不逐字相同、也不新开格。这一次实测的 detail 原文原样记在 cells[G1].got[].detail 里，不改写它。',
        detail_guard_control: 'detail 那一支（判不了那一侧）的可红性由 ③\' 那一刀证：挖空 REF 里那句共享的「判不了」⇒ G1 的四个输入一起翻红（正确结果），其余格与 G1 的 ok/code 不动。',
        judged_side_control: 'G2 的第二个输入（只给 before=SHA_A）是"规则没有吞掉真活"的那一面对照：给了一项、核过一项 ⇒ detail 必须是空串（G2 的 want 带 isEmpty）；这一支的可红性由 ③\'\' 那一刀证：给"判过"那一侧加 caveat ⇒ G2 两个输入一起翻红，其余格不动。',
        order_control: 'D2 是契约 §6.3「次序」那一行的唯一判据：坏 fp + 非对象 anchors 同时喂 ⇒ 必须报 fp 的 ④；报成 E_ARG_SCHEMA 就是次序反了（红因 `ANCHORS-ORDER-SWAPPED` 自带这句话）。',
        null_vs_undefined: 'S2 里 `null` 与空串都是"给了但形状不对"（按 ⑥ 拒），`undefined` 才是"没给"（按 ⑦ 跳过）—— `S3` 另有"第二项才是坏的那个"，让 `false` 真被读到。',
      }

      caseFail(problems)
    })
  })
})
