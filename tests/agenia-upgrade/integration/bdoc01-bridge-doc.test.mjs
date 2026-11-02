/**
 * `BDOC-01` · **`brg01` 的注释与断言文本必须描述**跑着的那套匹配**（长期票 `ticket-20261102-07` · 评审 `F6`）。
 *
 * 病根（评审原话）：`brg01` 的注释与断言文本过期 —— 说"包含匹配 / 回退队首"，实现已经不这么做。
 * 契约（这一格钉的那一句）：**`tests/agenia-upgrade/integration/brg01-toolname-bridge.test.mjs`
 * 里描述 claim 匹配的那些句子，必须与 `inject.js::bridgeTakeClaim()` 今天的行为一致：
 * 只认**完整相等**；对不上就**不取**（落 row 5），不退回队列队首。**
 *
 * ── 与实现对齐的口径（这一格的"期望值"从哪儿来）────────────────────────────
 * 不从我读到的那几句散文里来，也不从"我觉得该怎么写"来 —— 从**跑着的那份实现**里来：
 *   · `inject.js` 的匹配是 `item.prompt === prompt`（完整相等）⇒ 本格要求文档里出现
 *     "完整相等 / 完全相等 / 严格相等 / 精确相等"之一；
 *   · 对不上时**只有** `prompt === ''` 那一支才 `fresh.shift()`（= 没有消息才退回队列），
 *     对不上（`index < 0` 且 prompt 非空）⇒ `undefined`（不取）⇒ 本格要求文档里有一句
 *     "对不上…不取"，并且**不许**再出现"对不上就退回队首 / 互相包含 / 平台加壳截断所以互含也算"。
 * 这三条**互相钉住**：如果哪天生产把匹配改成包含匹配，`BDOC-IMPL-ANCHOR` 会先把这条腿按红喊停
 * —— 那时要改的是这条契约，不是让文档继续追着实现漂（`cand-20261016-promise-without-assertion-01`）。
 *
 * ── 现在是什么状态（2026-11-02 按 `ticket-20261102-07` 把 `brg01` 的文本改完之后）────
 * `brg01` 里那几句过期说法**已经清掉**，改成"只认完整相等 + 对不上就不取"（老路径只剩
 * `prompt` 读空那一支），所以这一格今天**绿**。它照样会翻红：`brg01` 的文本再退回去，
 * `BDOC-STALE-MATCH-TEXT` / `BDOC-MISSING-*` 当场响；实现那一侧改了匹配，先响的是 `BDOC-IMPL-ANCHOR`。
 *
 * ── 这一格是什么形状 ───────────────────────────────────────────────────────
 * **静态文档腿**（不跑注入器）：读 `brg01` 的全文，判"必须出现的字"与"必须不出现的字"。
 * 为什么不跑：这段文字是给读的人看的；它错了不会让任何一条用例变红 —— 只有"读文本"这一层抓得到。
 * 与 `SURF-02`（注释与常量是同一个名单）同一族：**散文里承诺的行为必须与实现同源**。
 */
import { before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
/** 被判的那份文本文档（**它就是被测对象**：这一格不跑注入器，只读它）。 */
const BRG_TEST = path.join(REPO, 'tests', 'agenia-upgrade', 'integration', 'brg01-toolname-bridge.test.mjs')
/** 实现那一侧（只用来锚"文档该描述什么"，不是被测对象）。 */
const INJECTOR = path.join(REPO, 'presets', 'agenia', 'inject.js')

/**
 * **必须不出现**的句子（都是一句话：对不上 ⇒ 退回队首 / 包含匹配）。
 * 每一条都带"它错在哪"—— 红的时候读的人不用回查评审单。
 *
 * ⚠️ 只钉**这两个轴**（"包含匹配" 与 "对不上退回队首"）：`加壳` 那半句是**理由**，不是判据 ——
 *    "平台可能给 prompt 加壳或截断"这个观察本身未必假，它错在拿来推"所以互含也算对上"。
 *    那半句一旦单独出现、又被写成"所以互含也算"，`互含` 这一条就已经把它抓死了；
 *    单独禁 `加壳` 会把一句可能仍然成立的话一起判红（那是假红，`mig-test-05`）。
 */
const STALE = [
  ['互相包含', '把匹配说成"互相包含"；实现是 `item.prompt === prompt`（完整相等）'],
  ['互含', '同一句理由的简写（"互含也算对上"）；实现不认互含'],
  ['对不上再退回', '对不上就退回 shift 队首；实现对不上**不取**（只在拿不到第一条用户消息时才 shift）'],
  ['对不上才退回', '同一句承诺的另一种写法；同上'],
]

/** **必须出现**的（任一）:完整相等的说法。取值来自 `inject.js` 自己那句注释的字面（"只认完整相等"）。 */
const EXACT_EQUALITY = ['完整相等', '完全相等', '严格相等', '精确相等']

/** **必须出现**的："对不上就不取"那句（正则容忍 markdown 加粗 / 破折号）。 */
const MISMATCH_NO_CLAIM = /对不上[^\n]{0,30}不取/

/** 带行号地把 needle 出现的位置列出来（红因的 detail 要能直接当修法清单）。 */
function hitsOf(text, needle) {
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(needle)) out.push({ line: i + 1, text: lines[i].trim().slice(0, 160) })
  }
  return out
}

before(() => {
  preflight()
})

test('BDOC-01 brg01 的匹配描述与实现一致：只认完整相等 · 对不上就不取（五句过期话必须消失）', async () => {
  await runCase('BDOC-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = {}
    rec.readings.bdoc01 = readings

    // ── 读两份文本（文档 = 被测对象；实现 = 锚）──────────────────────────────────
    let doc = null
    try {
      doc = readFileSync(BRG_TEST, 'utf8')
    } catch (err) {
      push('BDOC-FIXTURE', `读不到被判的那份文档 ${BRG_TEST}：${String(err?.message ?? err)}`)
      return caseFail(problems)
    }
    let impl = null
    try {
      impl = readFileSync(INJECTOR, 'utf8')
    } catch (err) {
      push('BDOC-FIXTURE', `读不到实现 ${INJECTOR}：${String(err?.message ?? err)}`)
      return caseFail(problems)
    }
    readings.doc = { file: BRG_TEST, bytes: Buffer.byteLength(doc, 'utf8') }
    readings.impl = { file: INJECTOR, bytes: Buffer.byteLength(impl, 'utf8') }

    // ── 锚：实现的匹配到底是哪一种（文档要描述的就是它）──────────────────────────
    const anchor = {
      exact_equality: /item\.prompt === prompt/.test(impl),
      /** 只有"拿不到 prompt"那一支才退回队首（`prompt === '' ? fresh.shift() : undefined`）。 */
      shift_only_without_prompt: /prompt === ''\s*\?\s*fresh\.shift\(\)/.test(impl),
      /** 有没有任何一处拿 prompt 做"包含"（`.includes(` / `.indexOf(`）—— 有的话锚就变了。 */
      prompt_contains: /prompt[^\n]{0,40}\.(?:includes|indexOf)\(/.test(impl),
    }
    readings.impl_anchor = anchor
    if (!anchor.exact_equality || !anchor.shift_only_without_prompt || anchor.prompt_contains) {
      push('BDOC-IMPL-ANCHOR',
        '实现那一侧已经不是"只认完整相等 + 只在拿不到 prompt 时退回队首"了'
        + `（${JSON.stringify(anchor)}）—— 这一格的期望值钉在实现上；改匹配要先改契约，别让文档继续追着实现漂`,
        anchor)
    }

    // ── 判据 ①：过期句子一句都不许留 ───────────────────────────────────────────
    const stale = []
    for (const [needle, why] of STALE) {
      const hits = hitsOf(doc, needle)
      if (hits.length > 0) stale.push({ needle, why, hits })
    }
    readings.stale = stale
    if (stale.length > 0) {
      push('BDOC-STALE-MATCH-TEXT',
        `\`brg01\` 里还有 ${stale.length} 句**过期**的匹配描述（实现只认完整相等、对不上就不取）：`
        + stale.map((item) => `「${item.needle}」（第 ${item.hits.map((h) => h.line).join(' / ')} 行：${item.why}）`).join(' · ')
        + ' —— 读这段注释的人会以为"对不上就退回队首"，而那一支今天不存在（`ticket-20261102-07`）',
        stale.map((item) => ({ needle: item.needle, lines: item.hits.map((h) => h.line) })))
    }

    // ── 判据 ②：必须说清"只认完整相等" ───────────────────────────────────────────
    const exactHits = EXACT_EQUALITY.filter((needle) => doc.includes(needle))
    readings.exact_equality_wording = exactHits
    if (exactHits.length === 0) {
      push('BDOC-MISSING-EXACT-EQUALITY',
        `\`brg01\` 里没有任何一句说"匹配只认**完整相等**"（可接受的写法：${EXACT_EQUALITY.join(' / ')}）—— `
        + '实现那一行是 `item.prompt === prompt`；文档不写这一句，读者就没有"为什么不能改成 includes"的依据'
        + '（2026-11-02 live 实测那次串位，正是拿"互含"当匹配改出来的）')
    }

    // ── 判据 ③：必须说清"对不上就不取" ──────────────────────────────────────────
    const mismatchHit = MISMATCH_NO_CLAIM.exec(doc)
    readings.mismatch_statement = mismatchHit === null ? null : { at: mismatchHit.index, text: mismatchHit[0] }
    if (mismatchHit === null) {
      push('BDOC-MISSING-MISMATCH-RULE',
        '`brg01` 里没有一句说"对不上就**不取**"（现役那段注释的原话是「对不上就**不取**（子会话落 row 5，安全），'
        + '不退回排队顺序」）—— 少了这一句，"对不上怎么办"就只剩读者自己猜；'
        + '而**猜成退回队首**正是这次评审点出来的那个过期承诺')
    }

    // ── 读数（不判）：别处的同名句子 ────────────────────────────────────────────
    // `support/registry.mjs` 的 **`BRG-07` 那一行**也描述同一件事；它不在本票的判据面上（评审点的是 brg01 这个文件），
    // 但同一句话漂两次会长成两份真相 ⇒ 照实记下来，交给改的人一并处理（`mig-rules-18`）。
    // ⚠️ 只扫**那一行**、不扫全文：本文件的 `BATCH_Z` 注释里也写着这几个词（"不许再出现 …"），
    //    扫全文会把"我自己写的禁令"读成"同一句话又出现了一次"（假读数）。
    try {
      const registry = readFileSync(path.join(REPO, 'tests', 'agenia-upgrade', 'support', 'registry.mjs'), 'utf8')
      const row = /^\s*\['BRG-07',.*$/m.exec(registry)
      readings.same_sentence_elsewhere = row === null
        ? { found_row: false, hits: [] }
        : { found_row: true, hits: STALE.filter(([needle]) => row[0].includes(needle)).map(([needle]) => needle) }
    } catch (err) {
      readings.same_sentence_elsewhere = null
      readings.same_sentence_error = String(err?.message ?? err)
    }

    caseFail(problems)
  })
})
