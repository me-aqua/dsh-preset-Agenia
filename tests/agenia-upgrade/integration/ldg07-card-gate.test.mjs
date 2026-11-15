/**
 * `LDG-07` —— **卡片闸的新口径**：`票类: 产品 | 构案`（构案 0012 §②-7）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§2.2 构案头 · §7 卡片闸 · §11 K11/K12）。
 *
 * 三张脸，缺一不可：
 *   ① **产品卡**要一条**生效产品号**（悬空 / 不是产品 / 没写，三个码分开）；
 *   ② **构案卡**要一条**生效构案号** + `依据:` 与构案头的来源列表一致（缺 / 不一致，两个码分开）；
 *   ③ **词表换了**：旧的 `新机制` 不再收（fail-closed），`数据` 的具名豁免不扩不缩。
 * 另判 `card-land` 的**先落盘再过闸**：被拒的卡照样在盘上，一个字节不差。
 *
 * 🔴 **今天的预期是红**：检查器不在盘上 ⇒ `TOOL-MISSING`。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  CHECK, buildScene, cardText, codesOf, eventDisposed, eventRegistered, expectCodes, messagesOf,
  namedIn, runCardLand, runGate2Card, toolPresent,
} from '../support/three-books.mjs'

before(() => {
  preflight()
})

const DAY = '2026-11-15'
const PRODUCT = '0003'
const SCHEME = '0012'
const RETIRED = '0011'

/** 一棵能过闸的树：一条生效产品、一条生效构案（父=产品）、一条已废构案。 */
function cardScene(caseId, tag, card) {
  return buildScene({
    caseId, tag,
    products: [{ id: PRODUCT, title: '产品三' }],
    schemes: [
      { id: SCHEME, title: '三册账本', parent: PRODUCT, basisP: [PRODUCT], header: { supersedes: RETIRED } },
      { id: RETIRED, title: '旧的方案', parent: PRODUCT, basisP: [PRODUCT], header: { 状态: '已废', superseded_by: SCHEME } },
    ],
    days: [{
      day: DAY,
      events: [
        eventRegistered({ seq: 1, id: 'bug-20261115-01', at: `${DAY}T09:00:00+08:00` }),
        eventDisposed({ seq: 2, id: 'bug-20261115-01', at: `${DAY}T10:00:00+08:00`, value: 'rejected', extra: { 判假: '夹具判假' } }),
      ],
    }],
    team: true,
    files: card === null ? [] : [{ rel: 'card.md', text: card }],
  })
}

// ── LDG-07 ──────────────────────────────────────────────────────────────
test('LDG-07 卡片闸：产品卡要生效产品号；构案卡要生效构案号 + 依据与构案头一致', async () => {
  await runCase('LDG-07', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §7 的卡片闸（`--op gate2-card` / `card-land`）')) {
      caseFail(problems)
      return
    }

    /** 跑一张卡（`--op gate2-card`，只判不落盘）。 */
    const gate = (tag, card) => {
      const scene = cardScene('LDG-07', tag, card)
      const cardFile = path.join(scene.root, 'card.md')
      const run = runGate2Card(scene.root, { card: cardFile })
      rec.readings[tag] = {
        root: scene.root,
        card,
        exit: run.exit,
        ok: run.json?.ok ?? null,
        verdict: run.json?.verdict ?? null,
        code: run.json?.code ?? null,
        codes: codesOf(run.json),
        product: run.json?.product ?? null,
        basis: run.json?.basis ?? null,
        messages: messagesOf(run.json).map((m) => m.slice(0, 240)),
      }
      return run
    }

    const samples = [
      // ── 构案卡：三格齐、依据对 ⇒ 过 ─────────────────────────────────────────
      { tag: 'pass-scheme', card: cardText({ kind: '构案', scheme: SCHEME, basis: PRODUCT }), want: [], mustName: null },
      // 刀 K11a：缺 `依据` ⇒ 拒
      { tag: 'k11-no-basis', card: cardText({ kind: '构案', scheme: SCHEME }), want: ['GATE2-BASIS-MISSING'], mustName: '依据' },
      // 刀 K11b：`依据` 写成别的号（0011 不在 0012 的来源列表里）⇒ 拒，点名两边
      { tag: 'k11-basis-mismatch', card: cardText({ kind: '构案', scheme: SCHEME, basis: RETIRED }), want: ['GATE2-BASIS-MISMATCH'], mustName: RETIRED },
      // 构案号悬空 / 已废
      { tag: 'scheme-dangling', card: cardText({ kind: '构案', scheme: '9999', basis: PRODUCT }), want: ['GATE2-DANGLING-DECISION'], mustName: '9999' },
      { tag: 'scheme-retired', card: cardText({ kind: '构案', scheme: RETIRED, basis: PRODUCT }), want: ['GATE2-DECISION-NOT-LIVE'], mustName: RETIRED },
      // 没有 `构案:` 那一行
      { tag: 'scheme-line-missing', card: cardText({ kind: '构案', basis: PRODUCT }), want: ['GATE2-NO-DECISION'], mustName: '构案' },
      // ── 产品卡：要生效产品号 ────────────────────────────────────────────────
      { tag: 'pass-product', card: cardText({ kind: '产品', product: PRODUCT }), want: [], mustName: null },
      { tag: 'product-missing', card: cardText({ kind: '产品' }), want: ['GATE2-PRODUCT-MISSING'], mustName: '产品' },
      { tag: 'product-dangling', card: cardText({ kind: '产品', product: '9999' }), want: ['GATE2-PRODUCT-DANGLING'], mustName: '9999' },
      // 刀 K12：产品号写的是构案号（在册、但不是产品）
      { tag: 'k12-product-not-live', card: cardText({ kind: '产品', product: SCHEME }), want: ['GATE2-PRODUCT-NOT-LIVE'], mustName: SCHEME },
      // ── 词表：旧 `新机制` 不收；`数据` 的具名豁免照旧 ───────────────────────────
      { tag: 'old-kind', card: cardText({ kind: '新机制', scheme: SCHEME, basis: PRODUCT }), want: ['GATE2-TICKET-KIND-MISSING'], mustName: '新机制' },
      { tag: 'data-exempt', card: cardText({ kind: '数据', scheme: '—' }), want: [], mustName: null },
    ]
    for (const s of samples) {
      const run = gate(s.tag, s.card)
      const parsed = expectCodes(problems, run, s.want, push, { label: `LDG-07/${s.tag}` })
      if (parsed && s.mustName !== null && !namedIn(run.json, s.mustName)) {
        push('NOT-NAMED', `[LDG-07/${s.tag}] 报文没有点名 ${JSON.stringify(s.mustName)}：${JSON.stringify(messagesOf(run.json).slice(0, 3))}`)
      }
      if (parsed && s.want.length === 0 && run.json?.verdict !== 'pass') {
        push('VERDICT-DRIFT', `[LDG-07/${s.tag}] 过的那一侧 verdict 必须是 "pass"，实得 ${JSON.stringify(run.json?.verdict)}`)
      }
      if (parsed && s.want.length > 0 && run.json?.verdict !== 'refuse') {
        push('VERDICT-DRIFT', `[LDG-07/${s.tag}] 拒的那一侧 verdict 必须是 "refuse"，实得 ${JSON.stringify(run.json?.verdict)}`)
      }
    }
    // 词表那条报文的**人读**面：认得的那三个词要在报文里（不然改词表的人不知道写什么）
    {
      const run = gate('old-kind-again', cardText({ kind: '新机制', scheme: SCHEME, basis: PRODUCT }))
      const msg = messagesOf(run.json).join(' ')
      for (const word of ['产品', '构案', '数据']) {
        if (!msg.includes(word)) push('NOT-NAMED', `[LDG-07/old-kind] 不认识的票类，报文要把认得的词列出来 —— 少了 ${JSON.stringify(word)}（实得 ${JSON.stringify(msg.slice(0, 240))}）`)
      }
    }

    // ── `card-land`：先落盘、再过闸（被拒的卡照样在盘上，一个字节不差）───────────
    {
      const refused = cardText({ kind: '构案', scheme: SCHEME, basis: RETIRED })
      const scene = cardScene('LDG-07', 'land-refused', refused)
      const cardFile = path.join(scene.root, 'card.md')
      const run = runCardLand(scene.root, { card: cardFile, day: DAY, role: 'test' })
      const cardsDir = path.join(scene.root, '.team', 'leader', DAY, 'cards')
      const landed = existsSync(cardsDir) ? readdirSync(cardsDir).filter((n) => n.endsWith('-test.md')) : []
      rec.readings['land-refused'] = {
        root: scene.root, exit: run.exit, codes: codesOf(run.json), landed,
        messages: messagesOf(run.json).map((m) => m.slice(0, 240)),
      }
      if (expectCodes(problems, run, ['GATE2-BASIS-MISMATCH'], push, { label: 'LDG-07/land-refused' })) {
        if (landed.length !== 1) {
          push('LAND-NOT-KEPT', `[LDG-07/land-refused] 被拒的卡必须照样落在 .team/leader/${DAY}/cards/（实得 ${JSON.stringify(landed)}）—— 落盘在前、过闸在后（契约 §7.2）`)
        } else {
          const landedText = readFileSync(path.join(cardsDir, landed[0]), 'utf8')
          if (landedText !== refused) push('LAND-NOT-BYTE-IDENTICAL', '[LDG-07/land-refused] 落下去的那一份与派下来的卡不是逐字节相同')
        }
      }
    }
    {
      const passed = cardText({ kind: '构案', scheme: SCHEME, basis: PRODUCT })
      const scene = cardScene('LDG-07', 'land-pass', passed)
      const cardFile = path.join(scene.root, 'card.md')
      const run = runCardLand(scene.root, { card: cardFile, day: DAY, role: 'dev' })
      const cardsDir = path.join(scene.root, '.team', 'leader', DAY, 'cards')
      const landed = existsSync(cardsDir) ? readdirSync(cardsDir).filter((n) => n.endsWith('-dev.md')) : []
      rec.readings['land-pass'] = { root: scene.root, exit: run.exit, codes: codesOf(run.json), landed }
      if (expectCodes(problems, run, [], push, { label: 'LDG-07/land-pass' })) {
        if (landed.length !== 1) push('LAND-MISSING', `[LDG-07/land-pass] 过了闸的卡必须落在 .team/leader/${DAY}/cards/（实得 ${JSON.stringify(landed)}）`)
      }
      // 同一张卡再落一次：不许覆盖（`wx` 独占建）⇒ 要么新名字、要么拒；第一份绝不许被改
      if (landed.length === 1) {
        const firstBytes = readFileSync(path.join(cardsDir, landed[0]), 'utf8')
        const again = runCardLand(scene.root, { card: cardFile, day: DAY, role: 'dev' })
        const after = readdirSync(cardsDir).filter((n) => n.endsWith('-dev.md'))
        rec.readings['land-pass'].second = { exit: again.exit, codes: codesOf(again.json), cards: after }
        if (readFileSync(path.join(cardsDir, landed[0]), 'utf8') !== firstBytes) {
          push('LAND-OVERWROTE', '[LDG-07/land-pass] 第二次落卡把第一份改掉了 —— `card-land` 的落盘必须是独占建（契约 §7.2）')
        }
        if (after.length !== 2 && again.exit === 0) {
          push('LAND-OVERWROTE', `[LDG-07/land-pass] 第二次落卡 exit 0 却没有留下第二份（实得 ${JSON.stringify(after)}）—— 同一秒的第二次必须换名或被拒，不许静默吞掉一张卡`)
        }
      }
    }
    // 卡在盘上但读不出来 ⇒ 拒（fail-closed 的最低一格）
    {
      const scene = cardScene('LDG-07', 'card-missing', null)
      const run = runGate2Card(scene.root, { card: path.join(scene.root, 'nope.md') })
      rec.readings['card-missing'] = { root: scene.root, exit: run.exit, codes: codesOf(run.json) }
      expectCodes(problems, run, ['GATE2-CARD-MISSING'], push, { label: 'LDG-07/card-missing' })
    }

    caseFail(problems)
  })
})
