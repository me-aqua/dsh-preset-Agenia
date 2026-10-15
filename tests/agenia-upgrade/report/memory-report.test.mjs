/**
 * MEM-10 —— 记忆更新报告 + 每日状态的四类分布（报告层）。
 *
 * 冻结依据：契约 §6.4 MEM-10 + 提案 §B3.4（字段路径 / 字符单位 / 汇总不变量 / 无四类硬帽）
 * + §B1.5（`distributionOf` / `capacityVerdict` / `charCountOf` 签名）+ 拍板 Q9（`typeId` 英文、中文只作 `typeName`）。
 *
 * 三条口径：
 *   · **字符单位**（§B3.4 逐字冻结）：只数 `entry.text`；删 BOM；`\r\n` 与 `\r` → `\n`；**不 trim**；**不做** NFC/NFD；
 *     单位 = **Unicode code point**（不是 UTF-16 code unit、不是字节）。
 *   · **汇总不变量**全部是"严格相等"；四类里 0 条的类型也必须在 `distribution[]` 里。
 *   · `capacityVerdict(entries, ops)` 的 **`ops` 形状没有冻结** ⇒ 一律传空数组（= 只看当前集合），
 *     并把这条歧义记进读数（不许自创 op 形状）。
 */
import { before, describe, test } from 'node:test'
import { FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings } from '../support/evidence.mjs'
import { loadStagedModule, nonCallables, readStagedText, runBrain, stagingExists } from '../support/sut.mjs'

before(() => {
  preflight()
})

/** 合成条目（形状照提案 §B3.6 的 entry）；**不含真实私有数据**。 */
const entry = (id, type, text, over = {}) => ({
  id: `m-${String(id).padStart(8, '0')}`,
  type,
  text,
  raw: 0.8,
  imp_share: 0.25,
  fresh_share: 0.25,
  double_low_streak: 0,
  last_evidence_review: '2026-10-01',
  known_from: 'fixture@2026-10-14',
  created_at: '2026-01-01T00:00:00+08:00',
  type_changed_at: null,
  ...over,
})

/** 四类硬帽字段的键名扫描（§B3.4 定义）：命中且对象里带 type/typeId 键 ⇒ 红。 */
const CAP_KEY_RE = /(^|_)(cap|limit|max|quota)_?(count|chars|entries)?$/i
function findTypeCapKeys(obj, path = '$', out = []) {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findTypeCapKeys(v, `${path}[${i}]`, out))
    return out
  }
  if (obj === null || typeof obj !== 'object') return out
  const keys = Object.keys(obj)
  const hasTypeKey = keys.some((k) => k === 'type' || k === 'typeId')
  for (const k of keys) {
    if (hasTypeKey && CAP_KEY_RE.test(k)) out.push(`${path}.${k}`)
    findTypeCapKeys(obj[k], `${path}.${k}`, out)
  }
  return out
}

describe('report · memory-report (MEM-10)', () => {
  test('MEM-10 四类分布：汇总严格相等、含 0 类、无四类硬帽、字符单位照冻结口径', async () => {
    await runCase('MEM-10', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // `TYPE_IDS` 是**常量**（数组），不是函数 ⇒ 存在性由 `loadStagedModule` 管，
      // 类型由下面的 `nonCallables` 只对**函数**那一组查（曾经把常量当"没导出"，多一项假红）。
      const lib = await loadStagedModule('lib/memory.mjs', ['distributionOf', 'capacityVerdict', 'charCountOf', 'TYPE_IDS'])
      rec.readings.memory_lib = { surfaceMissing: lib.surfaceMissing, missing: lib.missing, errors: lib.errors }
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/memory.mjs 不在 —— 分布/容量拿不到（预期的首跑红）')
      for (const n of lib.missing) push('SUT-SURFACE-MISSING', `staged/lib/memory.mjs 没有导出 ${n}（提案 §B1.5 冻了签名）`)
      for (const n of nonCallables(lib.mod, ['distributionOf', 'capacityVerdict', 'charCountOf'])) push('SUT-SURFACE-MISSING', `staged/lib/memory.mjs 导出的 ${n} 不是函数（冻结签名里它是函数）`)
      if (lib.mod === null) caseFail(problems)
      const { distributionOf, capacityVerdict, charCountOf, TYPE_IDS } = lib.mod

      // ① 字符口径（B3.4 第 1–3 条逐字）
      const charCases = [
        ['普通中文', '你好', 2],
        ['BOM 要删', '\uFEFF你好', 2],
        ['CRLF→LF', 'a\r\nb', 3],
        ['单独 CR→LF', 'a\rb', 3],
        ['不 trim', ' a ', 3],
        ['emoji 算 1（code point 不是 UTF-16 码元）', '👍', 1],
        ['空串', '', 0],
        ['不做 NFC', 'e\u0301', 2],
      ]
      const charResults = {}
      for (const [label, text, want] of charCases) {
        let got = null
        try { got = charCountOf(text) } catch (err) { push('CHAR-COUNT', `charCountOf 抛错（${label}）：${String(err.message).slice(0, 140)}`); continue }
        charResults[label] = { got, want }
        if (got !== want) push('CHAR-COUNT', `${label}：charCountOf 应为 ${want}，实得 ${got}（B3.4 冻的是 code point 口径）`)
      }
      rec.readings.char_counts = charResults
      // 🔴 裁定 v1.13 ②③：「期望必须存在」前置 —— `TYPE_IDS` 必须是数组（§B1.5 冻的是**数组常量**）。
      //    原来只有 `if (Array.isArray(TYPE_IDS) && …)`：导出成别的形状时**整条静默跳过**，而且连读数都没留。
      rec.readings.type_ids = TYPE_IDS ?? null
      if (!Array.isArray(TYPE_IDS)) {
        push('TYPE-IDS-SHAPE', `TYPE_IDS 必须是数组（§B1.5 / 拍板 Q9），实得 ${JSON.stringify(TYPE_IDS)}（typeof=${typeof TYPE_IDS}）—— 形状不对时下面那条集合比对根本不会跑`)
      } else if (JSON.stringify([...TYPE_IDS].sort()) !== JSON.stringify([...FROZEN.typeIds].sort())) {
        push('TYPE-IDS', `TYPE_IDS 实得 ${JSON.stringify(TYPE_IDS)}，冻结 ${JSON.stringify(FROZEN.typeIds)}（拍板 Q9）`)
      }

      // ② distributionOf：四类齐全、含 0 类、汇总严格相等
      const entries = [
        entry(1, 'general', '一二三'),
        entry(2, 'general', '四五六七'),
        entry(3, 'machine', 'abcdef'),
        // boss / project 故意留 0 条
      ]
      let dist = null
      try { dist = distributionOf(entries) } catch (err) { push('DISTRIBUTION', `distributionOf 抛错：${String(err.message).slice(0, 160)}`) }
      rec.readings.distribution = dist
      if (Array.isArray(dist)) {
        if (dist.length !== FROZEN.typeIds.length) push('DISTRIBUTION', `distribution 必须恰 ${FROZEN.typeIds.length} 项，实得 ${dist.length}`)
        const ids = dist.map((d) => d.typeId).sort()
        if (JSON.stringify(ids) !== JSON.stringify([...FROZEN.typeIds].sort())) push('DISTRIBUTION', `typeId 集合实得 ${JSON.stringify(ids)}，冻结 ${JSON.stringify([...FROZEN.typeIds].sort())}`)
        for (const d of dist) {
          if (typeof d.typeName !== 'string' || d.typeName === '') push('DISTRIBUTION', `${d.typeId} 缺 typeName（中文只作呈现字段）`)
          if (typeof d.count !== 'number' || typeof d.chars !== 'number') push('DISTRIBUTION', `${d.typeId} 的 count/chars 必须是数字`)
        }
        const zeroTypes = dist.filter((d) => d.count === 0)
        if (zeroTypes.length !== 2) push('DISTRIBUTION', `0 条的类型也必须留在 distribution 里（这里应有 2 个 0 条类型），实得 ${zeroTypes.length}`)
        const sumCount = dist.reduce((a, d) => a + d.count, 0)
        const sumChars = dist.reduce((a, d) => a + d.chars, 0)
        rec.readings.sums = { sumCount, sumChars, expectedCount: entries.length, expectedChars: 3 + 4 + 6 }
        if (sumCount !== entries.length) push('DISTRIBUTION-SUM', `sum(count)=${sumCount} 必须等于总条数 ${entries.length}`)
        if (sumChars !== 13) push('DISTRIBUTION-SUM', `sum(chars)=${sumChars} 必须等于全库字符 ${13}（三类的 text 长度 3+4+6）`)
        for (const d of dist) if (d.chars === 0 && d.count > 0) push('DISTRIBUTION', `${d.typeId} 有条目但 chars=0 —— 字符口径没落到 entry.text 上`)
      } else {
        push('DISTRIBUTION', `distributionOf 必须返回数组（四类），实得 ${typeof dist}`)
      }
      const capKeysInDist = findTypeCapKeys(dist ?? [], '$distribution')
      rec.readings.cap_keys_in_distribution = capKeysInDist
      if (capKeysInDist.length > 0) push('TYPE-CAP', `分布里出现了逐类上限字段：${capKeysInDist.join(', ')}（B3.4：四类**不设**硬帽）`)

      // ③ capacityVerdict：双硬限 200 / 60000（恰好允许、越界拒绝）；返回值里没有逐类字段
      const mk = (n, charsPer = 1) => Array.from({ length: n }, (_, i) => entry(i + 1, 'general', 'x'.repeat(charsPer)))
      const capCases = [
        ['恰好 200 条', mk(200), null],
        ['201 条', mk(201), 'E_CAP_COUNT'],
        ['恰好 60000 字符', [entry(1, 'general', 'x'.repeat(60000))], null],
        ['60001 字符', [entry(1, 'general', 'x'.repeat(60001))], 'E_CAP_CHARS'],
        ['空库', [], null],
      ]
      const capResults = {}
      for (const [label, ents, wantCode] of capCases) {
        let out = null
        try { out = capacityVerdict(ents, []) } catch (err) { push('CAPACITY', `capacityVerdict 抛错（${label}）：${String(err.message).slice(0, 160)}`); continue }
        capResults[label] = { ok: out?.ok ?? null, code: out?.rejectCode ?? null, count: out?.count ?? null, chars: out?.chars ?? null }
        if (wantCode === null) {
          if (out?.ok !== true) push('CAPACITY', `${label} 必须通过（恰好到帽允许），实得 ok=${out?.ok} rejectCode=${out?.rejectCode}`)
        } else if (out?.ok !== false || out?.rejectCode !== wantCode) {
          push('CAPACITY', `${label} 必须被拒并给 ${wantCode}，实得 ok=${out?.ok} rejectCode=${out?.rejectCode}`)
        }
        if (Array.isArray(ents) && out && out.count !== ents.length) push('CAPACITY', `${label}：count 实得 ${out?.count}，应为 ${ents.length}`)
        if (out && 'deltaCount' in out && out.deltaCount !== 0) push('CAPACITY', `${label}：ops 为空时 deltaCount 应为 0，实得 ${out.deltaCount}`)
      }
      rec.readings.capacity = capResults
      const lastOut = (() => { try { return capacityVerdict(mk(3), []) } catch { return null } })()
      const capKeysInVerdict = findTypeCapKeys(lastOut ?? {}, '$capacityVerdict')
      rec.readings.cap_keys_in_capacity = capKeysInVerdict
      if (capKeysInVerdict.length > 0) push('TYPE-CAP', `capacityVerdict 的返回值里出现逐类上限字段：${capKeysInVerdict.join(', ')}`)
      rec.readings.ops_shape_note = { note: '`capacityVerdict(entries, ops)` 的 ops 形状没有冻结 ⇒ 一律传空数组（只看当前集合）；op（新增/改/退休）的形状要组长冻。' }

      // ④ 报告文件面（CLI：report-read）—— 唯一权威是 `<dataRoot>/reports/memory-update/<day>.json`
      const day = '2026-10-14'
      const cliExists = stagingExists('bin/agenia-brain.mjs')
      rec.readings.report_cli_surface = cliExists
      if (!cliExists) {
        push('SUT-SURFACE-MISSING', 'staged/bin/agenia-brain.mjs 不在 ⇒ 记忆更新报告与每日状态无从读取（预期的首跑红）')
      } else {
        const res = runBrain('report-read', { day })
        rec.readings.report_read = { exit_code: res.exit_code, code: res.json?.error?.code ?? null }
        if (res.exit_code !== 0) {
          push('REPORT-READ', `report-read 必须可用（正例），实得 exit=${res.exit_code} / ${res.json?.error?.code ?? '(无码)'}`)
        } else {
          const report = res.json?.report ?? {}
          const rDist = report.distribution
          const rTotals = report.totals ?? {}
          const rMetric = report.char_metric ?? {}
          rec.readings.report = { distribution: rDist, totals: rTotals, char_metric: rMetric }
          if (!Array.isArray(rDist) || rDist.length !== 4) push('REPORT-DISTRIBUTION', `报告的 distribution 必须恰 4 项，实得 ${JSON.stringify(rDist)?.slice(0, 200)}`)
          else {
            const sc = rDist.reduce((a, d) => a + (d.count ?? 0), 0)
            const sch = rDist.reduce((a, d) => a + (d.chars ?? 0), 0)
            if (sc !== rTotals.count) push('REPORT-SUM', `sum(distribution.count)=${sc} ≠ totals.count=${rTotals.count}（严格相等）`)
            if (sch !== rTotals.chars) push('REPORT-SUM', `sum(distribution.chars)=${sch} ≠ totals.chars=${rTotals.chars}（严格相等）`)
            if ((rTotals.count ?? 0) > FROZEN.caps.count) push('REPORT-CAP', `报告里的总条数超过硬帽 ${FROZEN.caps.count}`)
            if ((rTotals.chars ?? 0) > FROZEN.caps.chars) push('REPORT-CAP', `报告里的总字符超过硬帽 ${FROZEN.caps.chars}`)
          }
          if (rMetric.unit !== FROZEN.charMetric.unit) push('REPORT-METRIC', `char_metric.unit 应为 ${FROZEN.charMetric.unit}，实得 ${JSON.stringify(rMetric.unit)}`)
          if (rMetric.scope !== FROZEN.charMetric.scope) push('REPORT-METRIC', `char_metric.scope 应为 ${FROZEN.charMetric.scope}，实得 ${JSON.stringify(rMetric.scope)}`)
          const capKeysInReport = findTypeCapKeys(report, '$report')
          rec.readings.cap_keys_in_report = capKeysInReport
          if (capKeysInReport.length > 0) push('TYPE-CAP', `报告里出现逐类上限字段：${capKeysInReport.join(', ')}`)
        }
      }
      rec.readings.daily_state_note = {
        note: '每日状态（`<WS>/state/daily/<day>.json`）是**派生副本**，不另立权威（§B3.4）；读它需要 daily-start/judge-commit 两个写面 ⇒ 归 RCP/STO 批与 R1。',
      }

      caseFail(problems)
    })
  })
})
