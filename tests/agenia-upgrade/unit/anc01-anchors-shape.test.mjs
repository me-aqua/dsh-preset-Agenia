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
 *   · `CONTRACT.md` §6.3（`F-122` 必须自己判的三样 + 拒绝形状 ①–④ + 「判不了的那一格」）。
 *
 * 七格（`want` 手写，不从实现反推）：
 *   `S0 非对象`    64 hex 的**字符串** / 数组 / 数字 / 布尔        ⇒ 拒 `E_ARG_SCHEMA`
 *   `S1 短哈希`    `{before_sha256:'abc', after_sha256:'abc'}`    ⇒ 拒 `E_ARG_SCHEMA`
 *   `S2 一半坏`    `{before_sha256:<真值>, after_sha256:'xyz'}`   ⇒ 拒 `E_ARG_SCHEMA`
 *   `S3 两项都坏`  `{before_sha256:42, after_sha256:false}`       ⇒ 拒 `E_ARG_SCHEMA`
 *   `G1 没给`      `null` / 省略第二个实参（走默认参数）           ⇒ `ok:true` + `code:null`（这一格判不了，不是"核过"）
 *   `G2 全对`      声明 = 盘面复算（两边都是 `SHA_A`）             ⇒ `ok:true` + `code:null`
 *   `D1 真对不上`  `anchor.before = SHA_B ≠ 声明 SHA_A`（声明自洽）⇒ 拒 `E_CODE_FINGERPRINT_MOVED`（既有行为，不许退化）
 *
 * 两条控制 —— **它们才是"红"这个字的合法性来源**：
 *   · `REF`：本文件里那份**照上面两张表写的最小实现**跑同样七格 ⇒ 七格必须全部成立。
 *     它证明这七格是可实现的（不是"永远红"），而且缺哪一样就红在哪一格（`mig-rules-14`）。
 *   · `KNIFE`：把 REF 里那句「非对象就报错」**整行删掉**再跑 ⇒ `S0` 必须不再被拒（翻面），
 *     而 `S1`/`S2`/`S3` 仍被拒 ⇒ 这一刀只证 `S0`（`mig-rules-16`：一个变异体只证一格）。
 *     ⚠️ 刀打在 REF 的字节上，**不碰 `presets/**`**：生产里那句话存在之前没有字节可删；
 *     REF 是同一句话的载体，刀读数自带 `readings.knife.subject`（`sut` = 删的是被测面那一行，
 *     `reference` = 删的是最小实现那一行）。两种都必须让 `S0` 翻面，否则这一刀不成立。
 *
 * 边界（这一格不覆盖什么）：只钉纯函数层。接缝
 * `validateReceiptCoverage(receipt, findings, tickets, anchors)` 把 `anchors.code_fingerprint`
 * 原样转给本函数，它自己的形状判据不在这一格里 —— 那个入口的三种形状由 `VRF-03` 守着。
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
/** `undefined` 那一格要"省略第二个实参"才走得到默认参数 —— 用一个哨兵表示。 */
const OMIT = Symbol('omit-argument')

/**
 * 七格：`key` / `code`（红因码，稳定可 grep）/ `title` / `inputs`（一格可以有多种形状）/ `want`。
 * `want` 只写三个键：`ok`、`code`（成立时允许多值就写数组）。
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
    title: '一半坏（before 是真值 / after 是 xyz）',
    inputs: [['对象·before=SHA_A / after=xyz', { before_sha256: SHA_A, after_sha256: 'xyz' }]],
    want: { ok: false, code: 'E_ARG_SCHEMA' },
  },
  {
    key: 'S3',
    code: 'ANCHORS-BOTH-BAD',
    title: '两项都坏（42 / false —— 不是字符串也不是 64 hex）',
    inputs: [['对象·before=42 / after=false', { before_sha256: 42, after_sha256: false }]],
    want: { ok: false, code: 'E_ARG_SCHEMA' },
  },
  {
    key: 'G1',
    code: 'ANCHORS-NULL-DEGRADED',
    title: '没给（null / 省略）—— 这一格判不了，但不许判成"核过"之外的任何东西',
    inputs: [
      ['null', null],
      ['省略第二个实参（默认参数）', OMIT],
    ],
    want: { ok: true, code: null },
  },
  {
    key: 'G2',
    code: 'ANCHORS-GOOD-DEGRADED',
    title: '全对（声明 = 盘面复算）',
    inputs: [['对象·before=after=SHA_A', { before_sha256: SHA_A, after_sha256: SHA_A }]],
    want: { ok: true, code: null },
  },
  {
    key: 'D1',
    code: 'ANCHORS-MOVED-DEGRADED',
    title: '真对不上（anchor.before 是 SHA_B，声明自洽于 SHA_A）',
    inputs: [['对象·before=SHA_B / after=SHA_A', { before_sha256: SHA_B, after_sha256: SHA_A }]],
    want: { ok: false, code: 'E_CODE_FINGERPRINT_MOVED' },
  },
]

/**
 * 照 `spec-F-129` 的「目标」表 + `CONTRACT.md` §6.3 写的**最小实现**（阳性对照）。
 *
 * 它与被测面同签名、同码、只判这一件事。两处刻意写成这样：
 *   · 「非对象就报错」是**单独一整行** —— 反向刀删的就是这一行；
 *   · 逐项读 `anchorsFp?.[key]`（不是 `if (isObject) { for … }` 那种整块包起来）——
 *     所以那一行删掉之后，非对象会**静默跳过**（正是被测面当下的病根形状），而不是抛 `TypeError`。
 *     刀要的是"变绿"，不是"换个崩法"。
 */
const REF_SOURCE = `// ANC-01 的阳性对照：照契约写的最小实现（**不是生产代码**，只住在运行根里）。
const CODE_MOVED = 'E_CODE_FINGERPRINT_MOVED'
const E_SCHEMA = 'E_ARG_SCHEMA'
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isSha256 = (v) => typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v.trim())
const shaKeyOf = (v) => (isSha256(v) ? v.trim().toLowerCase() : null)

export function codeFingerprintVerdict(fp, anchorsFp = null) {
  if (!isObject(fp)) return { ok: false, code: E_SCHEMA, detail: 'code_fingerprint 必填且必须是对象' }
  if (fp.equal !== true) return { ok: false, code: CODE_MOVED, detail: 'equal !== true ⇒ 本次作废' }
  const before = shaKeyOf(fp.before_sha256)
  const after = shaKeyOf(fp.after_sha256)
  if (before === null || after === null) return { ok: false, code: E_SCHEMA, detail: '两个哈希不都可复核' }
  if (before !== after) return { ok: false, code: CODE_MOVED, detail: 'equal:true 却 before ≠ after' }
  if (anchorsFp === null || anchorsFp === undefined) return { ok: true, code: null, detail: '调用方没给盘面复算 ⇒ 这一格判不了' }
  if (!isObject(anchorsFp)) return { ok: false, code: E_SCHEMA, detail: '给了东西就得是个东西（非对象）' }
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

/** 调一次判词 —— 不抛（抛也是一种"没按 want 回话"，要如实记）。 */
function callVerdict(fn, anchors) {
  try {
    const out = anchors === OMIT ? fn(fpOk()) : fn(fpOk(), anchors)
    return { threw: null, ok: out?.ok ?? null, code: out?.code ?? null, detail: String(out?.detail ?? '') }
  } catch (err) {
    return { threw: String(err?.message ?? err).slice(0, 200), ok: null, code: null, detail: '' }
  }
}

const wantOf = (want) => `${want.ok ? 'ok:true' : 'ok:false'}/${want.code === null ? 'code:null' : want.code}`

/** 一条读数的形状：`want 成立了没有`，以及不成立时**实得什么**（每个输入各一条）。 */
function holds(got, want) {
  if (got.threw !== null) return false
  return got.ok === want.ok && got.code === want.code
}

const gotOf = (got) => (got.threw !== null ? `抛了 ${got.threw}` : `ok=${String(got.ok)} code=${got.code}`)

/** 把七格喂给一个模块，逐格评"want 成立了没有"。 */
function evaluate(fn) {
  return CELLS.map((cell) => {
    const got = cell.inputs.map(([label, anchors]) => ({ label, result: callVerdict(fn, anchors) }))
    const broke = got.filter((g) => !holds(g.result, cell.want))
    return {
      cell: cell.key,
      code: cell.code,
      title: cell.title,
      want: wantOf(cell.want),
      held: broke.length === 0,
      got,
      broke,
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
  got: r.got.map((g) => ({ input: g.label, threw: g.result.threw, ok: g.result.ok, code: g.result.code, detail: g.result.detail.slice(0, 120) })),
}))

describe('unit · anchors-shape (ANC) · F-129 anchors 形状不对被当成「没给」', () => {
  test('ANC-01 anchors 四格必拒（E_ARG_SCHEMA）、两格必过、一格不许退化；阳性对照 + 反向刀', async () => {
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
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/receipt.mjs 不在 —— anchors 形状那七格拿不到（预期红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/receipt.mjs 没有导出 ${n}`)
      if (lib.mod === null) return caseFail(problems)
      const { codeFingerprintVerdict } = lib.mod
      if (typeof codeFingerprintVerdict !== 'function') {
        push('SUT-SURFACE-MISSING', 'codeFingerprintVerdict 不是一个函数 —— 七格没有可喂的东西')
        return caseFail(problems)
      }
      rec.readings.sut.sha256 = (() => { try { return sha256File(rec.readings.sut.file) } catch { return null } })()

      // ── ① 被测面：七格逐格（四格该拒、两格该过、一格不许退化）──────────────
      const sutRows = evaluate(codeFingerprintVerdict)
      rec.readings.cells = readingsOf(sutRows)
      for (const row of sutRows) {
        if (row.held) continue
        const detail = row.broke.map((g) => `${g.label} ⇒ ${gotOf(g.result)}`).join(' · ')
        push(row.code, `${row.cell} ${row.title}：want ${row.want}，实得 ${detail}`, detail)
      }

      // ── ② 阳性对照：照契约写的最小实现，同样七格必须全部成立 ──────────────
      let ref = null
      try {
        ref = await importSource(fixtureDir('ANC-01', 'anchors-ref'), 'ref', REF_SOURCE)
      } catch (err) {
        push('CONTROL-REF-IMPORT', `最小实现 import 失败（阳性对照这一格不成立）：${String(err?.message ?? err).slice(0, 200)}`)
      }
      if (ref !== null) {
        rec.readings.ref = { file: ref.file, bytes: ref.bytes, sha256: ref.sha256, cells: null }
        const refRows = evaluate(ref.mod.codeFingerprintVerdict)
        rec.readings.ref.cells = readingsOf(refRows)
        for (const row of refRows) {
          if (row.held) continue
          const detail = row.broke.map((g) => `${g.label} ⇒ ${gotOf(g.result)}`).join(' · ')
          push('CONTROL-REF-CELL',
            `阳性对照（照契约的最小实现）在 ${row.cell} 没成立：want ${row.want}，实得 ${detail}`
            + ' —— 要么这一格写得不可实现，要么最小实现写错了；这两件事必须分开处理，不许拿"实现还没做"糊过去')
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

      // ── ④ 写清"哪里判不了"（这一格不假装覆盖得更宽）───────────────────────
      rec.readings.boundary = {
        pure_function_only: '只钉 codeFingerprintVerdict 的纯函数层；validateReceiptCoverage 这个接缝不在这一格里（VRF-03 守它的三种形状）。',
        detail_text: 'G1（null）成立与否只按 ok/code 判；这一次实测的 detail 原样记在 cells[G1].got[].detail 里，不改写它。',
      }

      caseFail(problems)
    })
  })
})
