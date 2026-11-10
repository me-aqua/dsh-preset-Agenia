/**
 * **结算句组** —— 一行结算 + 一行锚点 + 逐条非绿 + 成因直方图（`SHN-01`；契约 §7.2）。
 *
 * 为什么单独成模块：这几行从前是 `run-all.mjs` 里的一个 `array.join(' ')`。它的两条信息
 * （"这一跑是哪个提交" / "非绿的是谁、为什么"）都**只活在控制台**过，落盘的 `judgement.txt`
 * 要靠人再抄一遍 —— 抄漏一个名字，数与名就分家了。
 *
 * ⇒ 一个纯函数产出**整组**，控制台与 `judgement.txt` 用**同一份数组**（两处消费，不许两边各写一句）。
 *
 * 口径（写在这里，读的人不必回推）：
 *   · 行序：`F57-SETTLE` → `[锚]` → 逐条非绿（`RED` 组在前、再按成因码升序、再按 id 升序）→ `[结算·成因]`；
 *   · 一行 = **一个（用例 × 成因码）**；一个用例两个码就两行（不许只留第一个）；
 *   · 直方图数的是**条成因**（= 行数），括号外那个数才是**例**（= 用例数，与 `F57-SETTLE` 的计数同义）；
 *     两个数各有单位、都由行数组算出来，所以"有一条非绿带着两个成因"不会读成"数错了"；
 *   · `HOLD` 行带 kind 词：`env`（环境给不给的问题）/ `case`（被测对象或判据自己的问题）；
 *     `RED` 行不带 kind（红没有"环境"这一档）。
 */
import { anchorLineOf } from './run-anchor.mjs'

/** 结算行（**逐字**是 `run-all.mjs` 一直在打的那一句；改格式要同批改契约与判据）。 */
export function settleLineOf({
  denominator, discovered, ranFiles, settled, fullScope, scopeCases,
  red, green, hold, consistent, diffCount, nodeExit, nodeTests, nodeFail, settleExit,
} = {}) {
  return [
    `F57-SETTLE 分母 ${denominator}`,
    `· 盘上发现 ${discovered === null ? '(缺失)' : discovered}`,
    `· 跑到 ${ranFiles} 文件/${settled} 条${fullScope ? '' : `（scope ${scopeCases ?? '?'}/${denominator}）`}`,
    `· RED ${red} / GREEN ${green} / HOLD ${hold}`,
    `· 登记=盘上 ${consistent ? '✓' : `✗（${diffCount} 处）`}`,
    `· node --test exit ${nodeExit}（tests ${nodeTests ?? '?'} · fail ${nodeFail ?? '?'}）`,
    `· settle exit ${settleExit}`,
  ].join(' ')
}

/** HOLD 成因的两档（**生产侧写进 `holds[].kind`**，这里只读；缺省 `case`）。 */
export const HOLD_KINDS = ['case', 'environment']
const KIND_TOKEN = { case: 'case', environment: 'env' }

/**
 * 从结算读数里取**非绿名单**（`settlement.json` 的 `cases[]` —— 它逐份读的就是 `_evidence/<ID>/result.json`）。
 *
 * @param {object} settlement `settlement.json` 的内容
 * @returns {Array<{id:string, result:'RED'|'HOLD', codes:Array<{code:string, kind:'case'|'environment'}>}>}
 *   `codes` 去重、保序；**一个码都不许丢**（丢掉的那个正是"名字少一个"）。
 */
export function nonGreenOf(settlement) {
  const cases = Array.isArray(settlement?.cases) ? settlement.cases : []
  const out = []
  for (const c of cases) {
    if (!c || c.settled !== true) continue
    if (c.result !== 'RED' && c.result !== 'HOLD') continue
    const codes = []
    const seen = new Set()
    const source = c.result === 'HOLD' ? (Array.isArray(c.holds) ? c.holds : []) : (Array.isArray(c.problems) ? c.problems : [])
    for (const item of source) {
      const code = typeof item?.code === 'string' && item.code.trim() !== '' ? item.code.trim() : null
      if (code === null || seen.has(code)) continue
      seen.add(code)
      const kind = c.result === 'HOLD' && item?.kind === 'environment' ? 'environment' : 'case'
      codes.push({ code, kind })
    }
    out.push({ id: String(c.id), result: c.result, codes })
  }
  return out
}

/** 一行名字（`RED <id> <code>` / `HOLD <id> <code> env|case`）。 */
export function nameLineOf({ id, result, code, kind }) {
  return result === 'HOLD' ? `HOLD ${id} ${code} ${KIND_TOKEN[kind === 'environment' ? 'environment' : 'case']}` : `RED ${id} ${code}`
}

/**
 * 整组（结算 → 锚 → 名 → 直方图）。
 *
 * @param {object} input
 * @param {object} input.settle    `settleLineOf` 的入参
 * @param {object} input.anchor    起跑那一刻的读数额（`run-anchor.json`）
 * @param {Array} input.nonGreen   `nonGreenOf()` 的结果
 * @returns {string[]}
 */
export function settleGroupLines({ settle, anchor, nonGreen } = {}) {
  const list = Array.isArray(nonGreen) ? nonGreen : []
  const lines = [settleLineOf(settle), anchorLineOf(anchor)]
  const rows = []
  for (const c of list) {
    for (const k of c.codes) rows.push({ id: c.id, result: c.result, code: k.code, kind: k.kind })
  }
  rows.sort((a, b) => {
    if (a.result !== b.result) return a.result === 'RED' ? -1 : 1
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  for (const row of rows) lines.push(nameLineOf(row))
  lines.push(histogramLineOf({ nonGreen: list, rows }))
  return lines
}

/**
 * 成因直方图那一行：条数按码降序、同数按码升序 ⇒ 同一份输入永远同一行。
 *
 * 🔴 **两个数各有单位，不许互相冒充**（同一个数不许担两个意思）：`例` = 用例数（= `F57-SETTLE` 的计数），
 * `条成因` = 名字行数（一个用例两个码就是两条）。括号里那个数必须由**行数组**算出来 —— 它与 `例` 不同时
 * 读者一眼看得出"有一条非绿有两个成因"，而不是"数错了"。
 */
function histogramLineOf({ nonGreen, rows }) {
  const byCode = new Map()
  for (const r of rows) byCode.set(r.code, (byCode.get(r.code) ?? 0) + 1)
  const hist = [...byCode.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([code, n]) => `${code}=${n}`)
  const redCases = nonGreen.filter((c) => c.result === 'RED').length
  const holdCases = nonGreen.filter((c) => c.result === 'HOLD').length
  const envRows = rows.filter((r) => r.kind === 'environment').length
  return `[结算·成因] 非绿 ${nonGreen.length} 例（${rows.length} 条成因）= HOLD ${holdCases} / RED ${redCases} · 成因 ${hist.length === 0 ? '（无）' : hist.join(' · ')} · 环境性 ${envRows} 条`
}

/** 一份行数组 → `{ names, histogram, settle }`（判据与刀共用这一份解析）。 */
export function parseSettleGroup(lines) {
  const all = Array.isArray(lines) ? lines.map((l) => String(l)) : String(lines ?? '').split(/\r?\n/)
  const names = []
  for (const line of all) {
    const hold = /^HOLD (\S+) (\S+) (env|case)$/.exec(line)
    if (hold !== null) {
      names.push({ verdict: 'HOLD', id: hold[1], code: hold[2], kind: hold[3] === 'env' ? 'environment' : 'case', line })
      continue
    }
    const red = /^RED (\S+) (\S+)$/.exec(line)
    if (red !== null) names.push({ verdict: 'RED', id: red[1], code: red[2], kind: null, line })
  }
  const histogram = all.find((l) => l.startsWith('[结算·成因] ')) ?? null
  const settle = all.find((l) => l.startsWith('F57-SETTLE ')) ?? null
  return { names, histogram, settle, lines: all }
}

/** 从直方图那一行里把 `code=条数` 读回来（读不出 ⇒ `null`，**不许**当成 0）。 */
export function histogramOf(line) {
  if (typeof line !== 'string') return null
  const tail = line.split('· 成因 ')[1]
  if (tail === undefined) return null
  const body = tail.split('· 环境性 ')[0].trim()
  if (body === '（无）') return { counts: new Map(), total: 0 }
  const counts = new Map()
  for (const part of body.split('·').map((s) => s.trim()).filter((s) => s !== '')) {
    const m = /^(\S+)=(\d+)$/.exec(part)
    if (m === null) return null
    counts.set(m[1], Number(m[2]))
  }
  let total = 0
  for (const n of counts.values()) total += n
  return { counts, total }
}

/** 从 `F57-SETTLE` 那一行里把计数读回来（**行里写的数**，不是结算 JSON 里的数 —— 两个都要对得上）。 */
export function countsOfSettleLine(line) {
  if (typeof line !== 'string') return null
  const m = /^F57-SETTLE 分母 (\d+) .*?· RED (\d+) \/ GREEN (\d+) \/ HOLD (\d+) /.exec(line)
  if (m === null) return null
  return { denominator: Number(m[1]), red: Number(m[2]), green: Number(m[3]), hold: Number(m[4]) }
}

/**
 * **这一组判什么**（纯函数；真跑与刀喂同一份）。
 *
 * `evidence` 是判据**自己去盘上读**的 `_evidence/<ID>/result.json`（不是结算里的副本）——
 * 这样"行 ↔ 盘上判词"是两条路，谁对不上都红。
 *
 * @param {object} input
 * @param {string[]} input.lines                  `judgement.txt` 的行（或全文）
 * @param {object} input.settleCounts            `{red, green, hold, settled}`
 * @param {Record<string, object|null>} input.evidence  id → `result.json` 内容（缺 ⇒ `null`）
 * @param {object} input.anchor                  起跑那一刻的读数（只用于"锚点行紧跟结算行"那一条）
 * @returns {{ok:boolean, codes:string[], problems:Array<{code:string,message:string}>}}
 */
export function settleGroupVerdict({ lines, settleCounts, evidence, anchor } = {}) {
  const problems = []
  const push = (code, message) => problems.push({ code, message })
  const groups = parseSettleGroup(lines)
  const counts = settleCounts ?? {}
  const ev = evidence ?? {}
  /** 结算**行里写的**那几个数（计数的那一处载体）。 */
  const inLine = countsOfSettleLine(groups.settle)
  if (groups.settle !== null && inLine === null) {
    push('SHN-COUNTS-DISAGREE', `\`F57-SETTLE\` 行读不出 \`分母 / RED / GREEN / HOLD\` 四个数：${JSON.stringify(groups.settle)}`)
  }


  // ① 行序：结算 → 锚 → 名 → 直方图（名字在锚点之前 / 直方图不在最后，都算"句组没成形"）。
  const idx = (pred) => groups.lines.findIndex((l) => pred(l))
  const settleAt = idx((l) => l.startsWith('F57-SETTLE '))
  const anchorAt = idx((l) => l.startsWith('[锚] '))
  const histAt = idx((l) => l.startsWith('[结算·成因] '))
  const lastNameAt = groups.lines.reduce((acc, l, i) => (/^(HOLD|RED) \S+ \S+/.test(l) ? i : acc), -1)
  if (settleAt < 0) push('SHN-GROUP-ORDER', '`judgement.txt` 里没有 `F57-SETTLE` 行')
  if (anchorAt < 0) push('SHN-GROUP-ORDER', '`[锚]` 行不在（锚点归 `RCA-01` 判；这里只判它在不在句组里正确的位置）')
  if (histAt < 0) push('SHN-GROUP-ORDER', '没有 `[结算·成因]` 那一行 —— 成因直方图整个缺席')
  if (settleAt >= 0 && anchorAt >= 0 && anchorAt !== settleAt + 1) {
    push('SHN-GROUP-ORDER', `\`[锚]\` 在第 ${anchorAt + 1} 行、\`F57-SETTLE\` 在第 ${settleAt + 1} 行 —— 名字必须排在锚点之后、且锚点紧跟结算行`)
  }
  if (histAt >= 0 && lastNameAt > histAt) push('SHN-GROUP-ORDER', '名字行排在直方图之后 —— 直方图必须是这一组的最后一行')

  // ② 盘上每条非绿都点名、每个名都在盘上（两个方向都判）。
  const onDisk = new Map()
  for (const [id, rec] of Object.entries(ev)) {
    if (rec === null || rec === undefined) continue
    if (rec.result !== 'RED' && rec.result !== 'HOLD') continue
    const source = rec.result === 'HOLD' ? (Array.isArray(rec.holds) ? rec.holds : []) : (Array.isArray(rec.problems) ? rec.problems : [])
    const codes = []
    for (const item of source) {
      const code = typeof item?.code === 'string' && item.code.trim() !== '' ? item.code.trim() : null
      if (code !== null && !codes.some((c) => c.code === code)) codes.push({ code, kind: rec.result === 'HOLD' && item?.kind === 'environment' ? 'environment' : 'case' })
    }
    onDisk.set(id, { result: rec.result, codes })
  }
  const named = new Map()
  for (const n of groups.names) {
    const key = `${n.id} ${n.code}`
    if (named.has(key)) push('SHN-DUPLICATE-NAME', `\`${key}\` 被点了两次 —— 一条非绿只许有一行，重复行会把直方图数大`)
    named.set(key, n)
  }
  for (const [id, rec] of onDisk) {
    if (rec.codes.length === 0) {
      push('SHN-UNNAMED-CODE', `\`_evidence/${id}/result.json\` 判 \`${rec.result}\` 却一个成因码都没有 —— 这一条没法点名`)
      continue
    }
    for (const c of rec.codes) {
      if (!named.has(`${id} ${c.code}`)) {
        push('SHN-NAME-MISSING', `\`_evidence/${id}/result.json\` 判 \`${rec.result}\`（\`${c.code}\`），结算句组里却没有 \`${rec.result} ${id} ${c.code}\` 这一行 —— 数得到了、名字读不到`)
      }
    }
  }
  for (const n of groups.names) {
    const rec = onDisk.get(n.id)
    if (rec === undefined) {
      push('SHN-NAME-EXTRA', `句组点名了 \`${n.id}\`，但盘上 ${ev[n.id] === null ? '没有它的 result.json' : '它的判词不是非绿'} —— 名字多出来一个`)
      continue
    }
    if (!rec.codes.some((c) => c.code === n.code)) {
      push('SHN-CODE-MISSING', `\`${n.verdict} ${n.id}\` 行里的码 \`${n.code}\` 不在 \`result.json\` 的码集 ${JSON.stringify(rec.codes.map((c) => c.code))} 里`)
    }
    const disk = rec.codes.find((c) => c.code === n.code)
    if (disk !== undefined && n.verdict === 'HOLD' && disk.kind !== n.kind) {
      push('SHN-ENV-MISLABELED', `\`HOLD ${n.id} ${n.code}\` 标的 kind 是 \`${n.kind === 'environment' ? 'env' : 'case'}\`，\`result.json\` 里写的是 \`${disk.kind}\``)
    }
    if (n.verdict !== rec.result) {
      push('SHN-CODE-MISSING', `\`${n.id}\` 行首是 \`${n.verdict}\`，\`result.json\` 判的是 \`${rec.result}\``)
    }
  }

  // ③ 计数 ↔ 名字 ↔ 直方图：三处必须说同一件事（结算行里的数 / 结算 JSON 的数 / 名字 / 直方图）。
  const idsBy = (verdict) => new Set(groups.names.filter((n) => n.verdict === verdict).map((n) => n.id))
  const redIds = idsBy('RED').size
  const holdIds = idsBy('HOLD').size
  for (const [where, source] of [['F57-SETTLE 行里', inLine], ['结算 JSON 里', counts]]) {
    if (source === null || source === undefined) continue
    if (typeof source.red === 'number' && redIds !== source.red) {
      push('SHN-COUNTS-DISAGREE', `${where}说 RED ${source.red}，句组点名的 RED 用例是 ${redIds} 个 —— 数与名分家了`)
    }
    if (typeof source.hold === 'number' && holdIds !== source.hold) {
      push('SHN-COUNTS-DISAGREE', `${where}说 HOLD ${source.hold}，句组点名的 HOLD 用例是 ${holdIds} 个 —— 数与名分家了`)
    }
  }
  const onDiskCount = [...onDisk.values()].length
  if (inLine !== null && onDiskCount !== inLine.red + inLine.hold) {
    push('SHN-COUNTS-DISAGREE', `盘上非绿 ${onDiskCount} 条 ≠ settle 行里的 RED ${inLine.red} + HOLD ${inLine.hold} —— 判词与计数不是同一批`)
  }
  const hist = histogramOf(groups.histogram)
  if (hist === null) {
    push('SHN-HISTOGRAM-DRIFT', `直方图那一行读不出来：${JSON.stringify(groups.histogram)}`)
  } else {
    if (hist.total !== groups.names.length) {
      push('SHN-HISTOGRAM-DRIFT', `直方图求和 ${hist.total} ≠ 点名行数 ${groups.names.length} —— 直方图与名单分家`)
    }
    /** 直方图那一行自己的两个数：`例`（用例数）与 `条成因`（行数）—— 各有单位，两个都要对得上。 */
    const head = /非绿 (\d+) 例（(\d+) 条成因）/.exec(groups.histogram)
    if (head === null) {
      push('SHN-HISTOGRAM-DRIFT', `直方图那一行没写出「例」与「条成因」两个数：${JSON.stringify(groups.histogram)}`)
    } else {
      const [casesInLine, rowsInLine] = [Number(head[1]), Number(head[2])]
      if (casesInLine !== redIds + holdIds) {
        push('SHN-COUNTS-DISAGREE', `直方图说 \`非绿 ${casesInLine} 例\`，句组点名的不同用例是 ${redIds + holdIds} 个 —— 例数与名单分家`)
      }
      if (rowsInLine !== groups.names.length) {
        push('SHN-HISTOGRAM-DRIFT', `直方图说 \`${rowsInLine} 条成因\`，句组里实际有 ${groups.names.length} 行名字 —— 条数与名单分家`)
      }
      if (inLine !== null && casesInLine !== inLine.red + inLine.hold) {
        push('SHN-COUNTS-DISAGREE', `直方图说 \`非绿 ${casesInLine} 例\` ≠ \`F57-SETTLE\` 行里的 RED ${inLine.red} + HOLD ${inLine.hold} —— 两个计数说两件事`)
      }
    }
    const byCode = new Map()
    for (const n of groups.names) byCode.set(n.code, (byCode.get(n.code) ?? 0) + 1)
    for (const [code, n] of byCode) {
      if (hist.counts.get(code) !== n) push('SHN-HISTOGRAM-DRIFT', `码 \`${code}\` 的条数：直方图 ${hist.counts.get(code) ?? '(缺)'} ≠ 名单 ${n}`)
    }
    for (const code of hist.counts.keys()) {
      if (!byCode.has(code)) push('SHN-HISTOGRAM-DRIFT', `直方图里有 \`${code}\`，名单里一条都没有`)
    }
  }

  // ④ 锚点那一行必须紧跟结算行（"同一句组"这件事在组件层也要有判据）。
  if (anchor !== undefined && anchor !== null && anchorAt >= 0 && groups.lines[anchorAt] !== anchorLineOf(anchor)) {
    push('SHN-GROUP-ORDER', '`[锚]` 行不是起跑那一刻那份读数的渲染（锚点内容归 `RCA-01`，这里只判它属于这一组）')
  }

  const codes = [...new Set(problems.map((p) => p.code))]
  return { ok: problems.length === 0, codes, problems }
}
