/**
 * `CARD-08` · **「处置」列：三错值 + 两好形状**（长期票 `ticket-20261106-02` · 复审 §7-E6 · batch 6）。
 *
 * 复审的判词（逐字）：`disposition_of()`（`bug-*-12` 的修复）**没有任何测试读「处置」列**，也没有测试读
 * `findings-map.json`；换回旧判定 ⇒ 全绿；而 §3.3 的 (a)(b)(c) 三种值仍然印错。
 * 产品侧那三条已经在 `e7bdbbe` 修好（`disposition_of(entry, map_present=True)`）；**这一格补的是判据。**
 *
 * ── 七个现场（一副夹具 + 另一副只差"map 文件在不在"，读卡 2 的 `每条的落点` 页）──────────
 *   `F-1` `{disposition:"adopted", ticket:"T"}` ⇒ 处置 `采纳` **且**落点里真的有 `T`（票号也是落点）。
 *   `F-2` `"采纳不了：前提不成立"` ⇒ 处置**不是** `采纳`（期望 `🔴 未登记口径`）——
 *        「采纳」开头的否定句不许把判词翻面。
 *   `F-3` `"采纳 · ticket-F-172 · 已开票"`）· `F-4` `{rejected, reason}` ⇒ **两条好形状**必须仍绿。
 *   `F-5` map **在、但没有这一条** ⇒ `🔴 未登记落点`，那句必须说 `findings-map.json 在`、**不许**说「还没写」。
 *   `F-6` 对象 `disposition` 认不出 · `F-7` 数字 ⇒ `🔴 未登记口径`（"其它一律不猜"）。
 *   `F-5` 的**另一副**：同一个 findings 文件、**没有** `findings-map.json` ⇒ 每一行都只能是
 *        `🔴 未登记落点` + `还没写`（**不许替组长编一个处置**），而且与上面那句**不相等**
 *        （`CARD08-MAP-MESSAGES-SAME`）。⚠️ 这一跑里"票号 / 否定句 / 好形状 / 认不出的形状"四条现场
 *        **不可判**（它们量的是"登记了但写错了"，而这一跑没有任何登记）—— 所以那几条只在 map 在的那一跑判。
 *
 * ── 刀 = `e7bdbbe^` 那一版 `disposition_of` 的**真字节**（不是手编的规则）──────────────────
 * 从 git 取旧实现全文，**只把签名补上 `map_present=True`**（调用点不动），其余逐字塞进**副本**。
 * 它必须恰好翻六条码：`F-1 票号丢失` · `F-2 印成采纳`（两码）· `F-5 原因错`（两码）· `两句同形`；
 * 而 `F-3/F-4` 两条好形状与 `F-6/F-7` **一条都不许翻** —— 翻错面就是 `CARD08-KNIFE-VECTOR`。
 *
 * ── 为什么读的是人读页 ────────────────────────────────────────────────────────────
 * 「处置」「票号 / 落点」两列只在卡 2 的 `每条的落点` 页上（`C2 · 回执格` 的 6 个机器格不含它们）。
 * 老板读的就是这一页 ⇒ 判据钉这一页：页名逐字、表头 `# / 级别 / 发现（一句话） / 处置 / 票号 / 落点 / 下一步`、
 * 数据从第 5 行起、行键 = `第一场 · <finding id>`。版式常量只在 `support/card-surface.mjs` 里出现一次。
 */
import { before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, caseHold, preflight, problem, runCase, sha256Text } from '../support/evidence.mjs'
import {
  DAY, DISPOSITION_SHEET, DISPOSITION_WORDS, FINDINGS_FILE, NOW, card2File, copyGeneratorWithPatch,
  generatorScriptPath, makeCardRoots, runCards, sha256Of, sheetRows, writeDataRoot, writeFindings,
  writeFindingsMap, writeMemorySource,
} from '../support/card-surface.mjs'

before(() => {
  preflight()
})

/** 七条发现：每条只带 `id / severity / title`（卡只读这三个 + `next_step`；别的键不关这一格的事）。 */
const FINDINGS = Object.freeze([
  Object.freeze({ id: 'F-1', severity: '大', title: '对象：adopted + ticket（票号也是落点）', next_step: '开票' }),
  Object.freeze({ id: 'F-2', severity: '中', title: '否定句：采纳不了', next_step: '不许猜' }),
  Object.freeze({ id: 'F-3', severity: '小', title: '字符串好形状：采纳 · 票号', next_step: '—' }),
  Object.freeze({ id: 'F-4', severity: '小', title: '对象好形状：rejected + reason', next_step: '—' }),
  Object.freeze({ id: 'F-5', severity: '小', title: 'map 在、但没有这一条 / map 不在', next_step: '—' }),
  Object.freeze({ id: 'F-6', severity: '小', title: '对象 disposition 认不出', next_step: '—' }),
  Object.freeze({ id: 'F-7', severity: '小', title: '形状认不出：数字', next_step: '—' }),
])

/** `findings-map.json` 的 `map` 段。**F-5 故意不在这里**（"在、但没有这一条"那个现场）。 */
const MAP = Object.freeze({
  [FINDINGS_FILE]: Object.freeze({
    'F-1': Object.freeze({ disposition: 'adopted', ticket: 'ticket-20261106-01' }),
    'F-2': '采纳不了：前提不成立',
    'F-3': '采纳 · ticket-F-172 · 已开票',
    'F-4': Object.freeze({ disposition: 'rejected', reason: '前提不成立' }),
    'F-6': Object.freeze({ disposition: 'weird' }),
    'F-7': 42,
  }),
})

/** 数据行：`每条的落点` 版式 = r1 标题 / r2 作业书 / r3 空行 / r4 表头 / r5 起数据。 */
const dataRows = (rows) => (rows ?? []).slice(4).filter((r) => (r ?? []).some((c) => c !== null && String(c).trim() !== ''))
const rowCells = (row) => [0, 1, 2, 3, 4].map((i) => String(row?.[i] ?? '').trim())
const byFinding = (rows) => {
  const out = new Map()
  for (const row of dataRows(rows)) {
    const match = /^第一场 · (F-\d+)$/.exec(rowCells(row)[0])
    if (match !== null) out.set(match[1], rowCells(row))
  }
  return out
}

/**
 * 逐个现场判。`mapPresent` 只影响 `F-5` 那一句该说哪种原因。
 * 返回 `{problems, texts}`：`texts` 给"两句不同"那条判据用。
 */
function dispositionProblems(sheet, { mapPresent }) {
  const out = []
  const texts = {}
  if (sheet.rows === null) {
    out.push(problem('CARD08-SHEET-MISSING',
      `CARD-08：卡 2 上没有 \`${DISPOSITION_SHEET}\` 这一页（${sheet.error}；页名实得 ${JSON.stringify(sheet.sheet_names)}）—— 「处置」列就住在这页上`))
    return { problems: out, texts }
  }
  const found = byFinding(sheet.rows)
  const missing = FINDINGS.filter((f) => !found.has(f.id)).map((f) => f.id)
  if (missing.length > 0) {
    out.push(problem('CARD08-ROW-MISSING',
      `CARD-08：卡 2 上找不到这些发现的处置行：${JSON.stringify(missing)}（行键 = \`第一场 · <id>\`）—— 有发现没印出来`))
    return { problems: out, texts }
  }

  // ── 没有 `findings-map.json`：组长**什么都没登记** ──────────────────────────────
  // 这一跑里"票号 / 否定句 / 好形状 / 认不出的形状"四条现场**不可判**（它们量的是"登记了但写错了"），
  // 能判的只有一件：**一条都不许被印成采纳/不采纳**，而且原因必须是"还没写"。
  if (!mapPresent) {
    for (const f of FINDINGS) {
      const row = found.get(f.id)
      if (row[3] !== DISPOSITION_WORDS.unregistered_landing) {
        out.push(problem('CARD08-ABSENT-INVENTS',
          `CARD-08[${f.id}][map 不在]：没有任何 findings-map.json ⇒ 处置必须是 \`${DISPOSITION_WORDS.unregistered_landing}\`，`
          + `实得 ${JSON.stringify(row[3])} —— 卡片替组长编了一个处置`))
      }
      if (row[4].includes('findings-map.json 在')) {
        out.push(problem('CARD08-ABSENT-WRONG-REASON',
          `CARD-08[${f.id}][map 不在]：那句在说「findings-map.json 在」—— 文件不在；实得 ${JSON.stringify(row[4])}`))
      }
    }
    const f5 = found.get('F-5')
    texts.f5 = f5[4]
    if (!f5[4].includes('还没写')) {
      out.push(problem('CARD08-MAP-ABSENT-NOT-SAID',
        `CARD-08[F-5][map 不在]：文件不在 ⇒ 那句必须说 \`还没写\`；实得 ${JSON.stringify(f5[4])}`))
    }
    return { problems: out, texts }
  }

  // F-1 —— 票号也是落点（复审 §3.3(a)）
  const f1 = found.get('F-1')
  if (f1[3] !== DISPOSITION_WORDS.adopted) {
    out.push(problem('CARD08-TICKET-NOT-ADOPTED',
      `CARD-08[F-1]：\`{disposition:"adopted", ticket:"…"}\` ⇒ 处置必须是 \`${DISPOSITION_WORDS.adopted}\`，实得 ${JSON.stringify(f1[3])}`))
  }
  if (!f1[4].includes('ticket-20261106-01')) {
    out.push(problem('CARD08-TICKET-LOST',
      `CARD-08[F-1]：落点带了票号 \`ticket-20261106-01\` ⇒ 卡片必须把它印出来；实得 ${JSON.stringify(f1[4])} —— `
      + '票号被丢掉，还会倒过来说"没写落点"（复审 §3.3(a) 的原错值）'))
  }

  // F-2 —— 以「采纳」开头的否定句不许翻面（复审 §3.3(b)）
  const f2 = found.get('F-2')
  if (f2[3] === DISPOSITION_WORDS.adopted) {
    out.push(problem('CARD08-NEG-AS-ADOPT',
      `CARD-08[F-2]：\`"采纳不了：前提不成立"\` 被印成了「采纳」—— 后缀判定把否定句翻了面（复审 §3.3(b) 的原错值）`))
  }
  if (f2[3] !== DISPOSITION_WORDS.unregistered_shape) {
    out.push(problem('CARD08-NEG-NOT-UNREGISTERED',
      `CARD-08[F-2]：认不出的字符串必须印 \`${DISPOSITION_WORDS.unregistered_shape}\`（不许猜），实得 ${JSON.stringify(f2[3])}`))
  }

  // F-3 / F-4 —— 两条**好形状**（它们必须仍绿：刀不许把它们一起判红）
  const f3 = found.get('F-3')
  if (f3[3] !== DISPOSITION_WORDS.adopted || !f3[4].includes('ticket-F-172')) {
    out.push(problem('CARD08-GOOD-STRING',
      `CARD-08[F-3]：\`"采纳 · ticket-F-172 · …"\` 是**好形状** ⇒ 处置 \`${DISPOSITION_WORDS.adopted}\` 且落点含 \`ticket-F-172\`，实得 ${JSON.stringify([f3[3], f3[4]])}`))
  }
  const f4 = found.get('F-4')
  if (f4[3] !== DISPOSITION_WORDS.rejected || !f4[4].includes('前提不成立')) {
    out.push(problem('CARD08-GOOD-OBJECT',
      `CARD-08[F-4]：\`{disposition:"rejected", reason:"前提不成立"}\` 是**好形状** ⇒ 处置 \`${DISPOSITION_WORDS.rejected}\` 且落点含原因，实得 ${JSON.stringify([f4[3], f4[4]])}`))
  }

  // F-6 / F-7 —— 其它形状一律「未登记口径」（"不许猜"）
  for (const [fid, label] of [['F-6', '对象 disposition 认不出'], ['F-7', '数字']]) {
    const row = found.get(fid)
    if (row[3] !== DISPOSITION_WORDS.unregistered_shape) {
      out.push(problem(fid === 'F-6' ? 'CARD08-UNKNOWN-SHAPE' : 'CARD08-OTHER-SHAPE',
        `CARD-08[${fid}]：${label} ⇒ 必须印 \`${DISPOSITION_WORDS.unregistered_shape}\`，实得 ${JSON.stringify(row[3])} —— 认不出就不许猜`))
    }
  }

  // F-5 —— map **在**、但没有这一条：那句必须说"文件在 + 没有这一条"，不许说「还没写」（复审 §3.3(c)）
  const f5 = found.get('F-5')
  texts.f5 = f5[4]
  if (f5[3] !== DISPOSITION_WORDS.unregistered_landing) {
    out.push(problem('CARD08-MAP-MISS-NOT-UNREGISTERED',
      `CARD-08[F-5]：没登记落点必须印 \`${DISPOSITION_WORDS.unregistered_landing}\`，实得 ${JSON.stringify(f5[3])}`))
  }
  {
    const saysExists = f5[4].includes('findings-map.json 在') && f5[4].includes('没有这一条')
    const wrongReason = f5[4].includes('还没写')
    if (!saysExists) {
      out.push(problem('CARD08-MAP-EXISTS-NOT-SAID',
        `CARD-08[F-5][map 在]：map 文件在、只是没有这一条 ⇒ 那句必须说 \`findings-map.json 在\` + \`没有这一条\`；实得 ${JSON.stringify(f5[4])}`))
    }
    if (wrongReason) {
      out.push(problem('CARD08-MAP-EXISTS-WRONG-REASON',
        `CARD-08[F-5][map 在]：那句在说「还没写」—— 文件明明在、而且写满了（复审 §3.3(c)：印的是错的原因）；实得 ${JSON.stringify(f5[4])}`))
    }
  }
  return { problems: out, texts }
}

/** 跑一副夹具 → 读回卡 2 的 `每条的落点` 页。`script` 给刀后的副本；不给 = 生产那一份。 */
function dispositionScene(tag, { withMap, script = null, nowIso = NOW } = {}) {
  const roots = makeCardRoots('CARD-08', tag)
  writeMemorySource(roots.ws)
  writeDataRoot(roots.dr, { day: DAY })
  writeFindings(roots.ws, DAY, FINDINGS.map((f) => ({ ...f })))
  if (withMap) writeFindingsMap(roots.ws, DAY, MAP)
  const run = runCards(roots, { day: DAY, nowIso, script })
  const sheet = sheetRows(card2File(roots.ws, DAY), DISPOSITION_SHEET)
  return { tag, roots, run, sheet, card: card2File(roots.ws, DAY), script, withMap }
}

/**
 * 刀：`e7bdbbe^` 那一版 `disposition_of` 的**真字节**（`git show e7bdbbe^:.tools/daily-cards.py`）。
 * 与旧版**只差**签名那一行（补 `map_present=True`，因为调用点已经传了这个 kwarg）。
 * 其余逐字 —— 包括 `startswith("采纳")` 那个类级缺陷与"永远只说还没写"那一句。
 */
const OLD_DISPOSITION = `def disposition_of(entry, map_present=True):
    """把 findings-map 的一个落点值翻成（处置, 落点文字）。

    🔴 2026-11-06 修（技术评审 §4.4 / 登记请求 #2）：原来是「落点非空 ⇒ 印采纳」——
    于是落点写「不采纳：前提不成立」也会印成「采纳」，一张给老板看的卡把否决说成了采纳。
    现在只有两种可接受形状，认不出就印「未登记口径」，**不许猜**：
      · 字符串，以「采纳」或「不采纳」开头（\`采纳 · <票号> …\` / \`不采纳 · <原因>\`）；
      · 对象 \`{disposition: "adopted"|"rejected", landing|reason: "…"}\`。
    """
    if entry is None:
        return ("🔴 未登记落点", "（组长还没写 findings-map.json —— 不许猜）")
    if isinstance(entry, dict):
        d = str(entry.get("disposition") or "").strip().lower()
        text = entry.get("landing") or entry.get("reason") or ""
        if d in ("adopted", "adopt", "采纳"):
            return ("采纳", str(text) or "（采纳，但没写落点）")
        if d in ("rejected", "reject", "不采纳"):
            return ("不采纳", str(text) or "（不采纳，但没写原因）")
        return ("🔴 未登记口径", "（对象里 disposition 不是 adopted/rejected —— 认不出就不猜）")
    if isinstance(entry, str):
        text = entry.strip()
        if text.startswith("不采纳"):
            return ("不采纳", text)
        if text.startswith("采纳"):
            return ("采纳", text)
        return ("🔴 未登记口径", "（落点没以「采纳／不采纳」开头：%s）" % text[:60])
    return ("🔴 未登记口径", "（形状认不出：%r）" % (entry,))
`

/** 钉住的旧字节的 sha256（`e7bdbbe^` 那一版 + 只补签名）：本文件里那段被改过 ⇒ `CARD08-KNIFE`。 */
const OLD_DISPOSITION_SHA256 = 'c1ec56d1262f9eef63da6df6a4f662ce2207d8c60c275a75619a6c28b2ec36ec'

/** 刀后 map 在那一跑**恰好**该翻的六条码（好形状与 F-6/F-7 一条都不许翻）。 */
const KNIFE_EXPECTED = Object.freeze([
  'CARD08-MAP-EXISTS-NOT-SAID',
  'CARD08-MAP-EXISTS-WRONG-REASON',
  'CARD08-MAP-MESSAGES-SAME',
  'CARD08-NEG-AS-ADOPT',
  'CARD08-NEG-NOT-UNREGISTERED',
  'CARD08-TICKET-LOST',
].sort())

test('CARD-08 处置列：ticket 也算落点 · 「采纳不了」不许印成采纳 · map 在/不在必须两句话（刀 = e7bdbbe^ 旧真字节）', async () => {
  await runCase('CARD-08', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = { map_present: null, map_absent: null, knife: null }

    const productionFile = generatorScriptPath()
    readings.production_before = { file: productionFile, sha256: sha256Of(productionFile) }

    // ── 1. 两副夹具：只差 `findings-map.json` 在不在 ───────────────────────────────
    const scenes = []
    for (const [tag, withMap] of [['dispo-map', true], ['dispo-nomap', false]]) {
      const scene = dispositionScene(tag, { withMap })
      scenes.push(scene)
      const key = withMap ? 'map_present' : 'map_absent'
      readings[key] = {
        exit_code: scene.run.exit_code,
        stderr: String(scene.run.stderr ?? '').trim().slice(0, 400),
        card: scene.card,
        sheet_error: scene.sheet.error,
        data_rows: dataRows(scene.sheet.rows).map(rowCells),
      }
      if (scene.run.python?.ok === false) {
        caseHold(rec, 'CARD08-NO-PYTHON', `这一档要真跑 daily-cards.py，但找不到能 import openpyxl 的 python：${scene.run.python.note}`)
        readings.python = scene.run.python
        caseFail(problems)
        return
      }
      if (scene.run.exit_code !== 0) {
        push('CARD08-GENERATOR-FAILED',
          `CARD-08[${withMap ? 'map 在' : 'map 不在'}]：生成器 exit=${scene.run.exit_code} —— 卡没出`
          + `（stderr=${JSON.stringify(String(scene.run.stderr ?? '').trim().slice(0, 400))}）`)
      }
    }
    const real = { problems: [], texts: {} }
    for (const scene of scenes) {
      if (scene.run.exit_code !== 0) continue
      const verdict = dispositionProblems(scene.sheet, { mapPresent: scene.withMap })
      real.problems.push(...verdict.problems)
      if (scene.withMap) real.texts.present = verdict.texts.f5 ?? null
      else real.texts.absent = verdict.texts.f5 ?? null
    }
    // (c) 两句必须**不相等** —— 只有两跑都拿到那一格时才判（页不在由 SHEET-MISSING 说）
    if (real.texts.present !== undefined && real.texts.absent !== undefined) {
      readings.f5_texts = real.texts
      if (real.texts.present === real.texts.absent) {
        real.problems.push(problem('CARD08-MAP-MESSAGES-SAME',
          `CARD-08[F-5]：「map 在但没这一条」与「map 不在」用**同一句话**（${JSON.stringify(real.texts.present)}）—— `
          + '这两件事必须长得不一样，否则读卡的人分不出"组长还没写"与"写了但漏了这一条"（复审 §3.3(c)）'))
      }
    }
    problems.push(...real.problems)
    readings.real_codes = real.problems.map((p) => p.code)

    // ── 2. 刀：把**副本**里的 `disposition_of` 换回 `e7bdbbe^` 的真字节（只补签名）─────────
    //     先核"钉住的那段字节没被改过"：本文件里的 `OLD_DISPOSITION` 与 sha256 是同一个契约的两半，
    //     改了一半而没改另一半 ⇒ 这一格量的就不再是"旧实现"，红因 `CARD08-KNIFE`。
    const knifeDir = path.join(scenes[0].roots.runRoot, 'knife', 'card-08')
    const KNIFE_MARKER = '现在只有两种可接受形状'
    let knife = null
    let knifeError = null
    readings.old_disposition = { bytes: Buffer.byteLength(OLD_DISPOSITION, 'utf8'), sha256: sha256Text(OLD_DISPOSITION), pinned: OLD_DISPOSITION_SHA256 }
    if (readings.old_disposition.sha256 !== OLD_DISPOSITION_SHA256) {
      push('CARD08-KNIFE',
        `CARD-08[刀]：本文件里钉住的旧实现被改过（sha256 ${readings.old_disposition.sha256} ≠ 钉住的 ${OLD_DISPOSITION_SHA256}）`
        + ' —— 先核这是不是 `e7bdbbe^` 那一版，再改那份常量')
    }
    try {
      const src = readFileSync(productionFile, 'utf8')
      const start = src.indexOf('def disposition_of(entry, map_present=True):')
      const endAnchor = '\n\ndef review_dirs(ws, day, extra_days=()):'
      const endAt = src.indexOf(endAnchor, start >= 0 ? start : 0)
      if (start < 0 || endAt < 0 || endAt <= start) {
        throw new Error(`刀口找不到了（\`disposition_of\` 的边界不在：start=${start} · end=${endAt}）—— 生成器的正文变了，刀要跟着改`)
      }
      const from = src.slice(start, endAt)
      knife = copyGeneratorWithPatch(knifeDir, {
        why: 'CARD-08 换回旧 disposition_of',
        marker: KNIFE_MARKER,
        patch: [{ from, to: OLD_DISPOSITION, why: 'e7bdbbe^ 的真字节（旧判定）' }],
      })
    } catch (err) {
      knifeError = String(err?.message ?? err)
    }
    readings.knife = knife === null
      ? { error: knifeError }
      : {
          error: null,
          dir: knifeDir,
          script: knife.script,
          production: knife.production,
          applied: knife.applied,
          marker: knife.marker,
          changed: knife.changed,
          bytes: knife.bytes,
          production_bytes: knife.production_bytes,
          sha256: knife.sha256,
          production_sha256: knife.production_sha256,
        }

    if (knife === null) {
      push('CARD08-KNIFE',
        `CARD-08[刀]：刀没打上（${knifeError}）—— 这一格的红因此不可核：判据可能只是"永远绿"`)
    } else if (knife.changed !== true || knife.production_sha256 !== readings.production_before.sha256) {
      push('CARD08-KNIFE',
        `CARD-08[刀]：刀后的副本与生产那一份逐字节相同、或者副本不是从这一份生产文件复制的`
        + `（changed=${knife.changed} · production_sha256=${knife.production_sha256} ≠ ${readings.production_before.sha256}）—— 刀没落地`)
    } else {
      const knifeProblems = []
      const knifeTexts = {}
      for (const [tag, withMap] of [['dispo-map-knife', true], ['dispo-nomap-knife', false]]) {
        const scene = dispositionScene(tag, { withMap, script: knife.script })
        if (scene.run.exit_code !== 0) {
          push('CARD08-KNIFE',
            `CARD-08[刀]：刀后生成器 exit=${scene.run.exit_code}（${tag}）—— 刀把生成器弄崩了，`
            + `那不是"翻面"（stderr=${JSON.stringify(String(scene.run.stderr ?? '').trim().slice(0, 400))}）`)
          continue
        }
        const verdict = dispositionProblems(scene.sheet, { mapPresent: withMap })
        knifeProblems.push(...verdict.problems)
        if (withMap) knifeTexts.present = verdict.texts.f5 ?? null
        else knifeTexts.absent = verdict.texts.f5 ?? null
      }
      if (knifeTexts.present !== undefined && knifeTexts.absent !== undefined && knifeTexts.present === knifeTexts.absent) {
        knifeProblems.push(problem('CARD08-MAP-MESSAGES-SAME',
          `CARD-08[刀/F-5]：刀后两句相同（${JSON.stringify(knifeTexts.present)}）`))
      }
      const unique = [...new Set(knifeProblems.map((p) => p.code))].sort()
      readings.knife.runs_texts = knifeTexts
      readings.knife.codes = knifeProblems.map((p) => p.code)
      readings.knife.expected = KNIFE_EXPECTED
      if (unique.length === 0) {
        push('CARD08-KNIFE',
          'CARD-08[刀]：换回旧真字节之后**一条判据都没翻** —— 这一格是装饰（`mig-rules-14`）')
      } else if (unique.join(',') !== KNIFE_EXPECTED.join(',')) {
        push('CARD08-KNIFE-VECTOR',
          `CARD-08[刀]：刀翻错了面 —— 期望恰好 ${JSON.stringify(KNIFE_EXPECTED)}，实得 ${JSON.stringify(unique)}`
          + `（逐条：${JSON.stringify(knifeProblems.map((p) => p.code))}）`)
      }
    }

    // ── 3. 生产那一份一个字节都不许动 ───────────────────────────────────────────
    readings.production_after = { file: productionFile, sha256: sha256Of(productionFile) }
    if (readings.production_before.sha256 === null || readings.production_before.sha256 !== readings.production_after.sha256) {
      push('CARD08-PRODUCTION-TOUCHED',
        `CARD-08[F]：这一格跑前跑后 \`${productionFile}\` 的 sha256 不一致（${readings.production_before.sha256} → ${readings.production_after.sha256}）`
        + ' —— 被测文件被改了，这一跑的读数不算数')
    }

    rec.readings.card08 = readings
    caseFail(problems)
  })
})
