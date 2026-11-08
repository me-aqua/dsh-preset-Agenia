/**
 * 临时件扫描 —— `DR-02` ② 的那一把尺子（抽样 / 判词 / 读数都在这里）。
 *
 * 【判什么】临时/输出目录里不许留原子写的残渣（`.tmp-*` / `*.partial`）：
 *   · `TEMP-LEFTOVER`（红）：扫到了残渣，点名前几份；
 *   · `TEMP-SCAN-NO-SAMPLE`（**HOLD**，不是绿）：目录不存在 / 空 ⇒ **没有样本**，
 *     "没扫到残渣"与"什么都没看"在读数上必须分得开（同 `DR-01` 的真空真那一族）；
 *   · 有样本且干净 ⇒ 绿，**读数里必须写出扫了几份**（`scanned`）。
 * 三态判词只走这个函数（`DR-02` 的真跑、`TMP-01` 的四格行为、两把刀喂的都是它）。
 *
 * 【扫哪】目标由**这一跑**的环境算出来（`AGENIA_TEST_RUN_ROOT/tmp` + 活体预设）——
 * 不许写死日期（`bug-20261107-05`：写死成 `.team/test/2026-10-14/_runs` ⇒ 今天那个 run 的
 * `tmp` 根本不看，"全绿"是拿旧跑的证据当今天的结果）。
 *
 * 【翻面】把"空 ⇒ HOLD"改回"空 ⇒ 绿" ⇒ `TMP-01` 的 A/B 两格当场红；
 * 把目标改回写死日期 ⇒ `TMP-01` 的 E 格（两个不同运行根必须给出两个不同目标）当场红。
 * 两把刀都切**副本**（`TMP-01` 里做），本文件在跑动中一个字节不动。
 */
import path from 'node:path'
import { ENV, PATHS, requireEnv } from './env.mjs'
import { treeHash } from './evidence.mjs'

export const TEMP_SCAN_CODES = Object.freeze({
  leftover: 'TEMP-LEFTOVER',
  noSample: 'TEMP-SCAN-NO-SAMPLE',
})

/** 残渣形状：原子写的临时件（`.tmp-*`）与半截文件（`*.partial`）。 */
export const LEFTOVER_SHAPE = /\.tmp-|\.partial$/i

/**
 * 扫描目标（`[{label, dir}]`）。`env` 只给探针/刀用，正常调用走 `process.env`。
 *
 * 🔴 运行根那一条来自**环境**（`AGENIA_TEST_RUN_ROOT/tmp`），不是日期字面量。
 */
export function tempScanTargets({ env = process.env } = {}) {
  const runRoot = requireEnv(ENV.RUN_ROOT, env)
  return [
    { label: '本次运行的 tmp', dir: path.join(runRoot, 'tmp') },
    { label: '活体预设', dir: PATHS.finalPreset },
  ]
}

/**
 * 判词。返回 `{ verdict: 'GREEN'|'RED'|'HOLD', code, scanned, targets, leftovers, sample_targets, no_sample_targets, why }`。
 *
 * 三态口径（**红压过挂起**：有残渣就报残渣，残渣是更具体的那句话）：
 *   · 任一目标扫到残渣 ⇒ `RED` / `TEMP-LEFTOVER`（`scanned` 照旧写总数）；
 *   · 否则任一目标**不存在或空** ⇒ `HOLD` / `TEMP-SCAN-NO-SAMPLE`（`why` 点名是哪几个目标）；
 *   · 否则 ⇒ `GREEN`，`scanned` = 扫过的文件总数（**必须是正数**：有样本才谈得上"干净"）。
 */
export function tempScanVerdict({ targets }) {
  const rows = []
  const leftovers = []
  let scanned = 0
  for (const t of targets) {
    const tree = treeHash(t.dir)
    const files = tree.files ?? []
    scanned += files.length
    const hits = files.filter((f) => LEFTOVER_SHAPE.test(f.rel)).map((f) => path.join(t.dir, f.rel))
    leftovers.push(...hits)
    rows.push({ label: t.label, dir: t.dir, exists: tree.exists === true, files: files.length, leftovers: hits })
  }
  const sampleTargets = rows.filter((r) => r.exists && r.files > 0).map((r) => r.label)
  const noSample = rows.filter((r) => !r.exists || r.files === 0)
  const base = { code: null, scanned, targets: rows, leftovers, sample_targets: sampleTargets, no_sample_targets: noSample.map((r) => `${r.label}（${r.exists ? '空' : '不存在'}）`) }
  if (leftovers.length > 0) {
    return { ...base, verdict: 'RED', code: TEMP_SCAN_CODES.leftover, why: `扫到 ${leftovers.length} 份临时件残渣（扫了 ${scanned} 份）` }
  }
  if (noSample.length > 0) {
    return { ...base, verdict: 'HOLD', code: TEMP_SCAN_CODES.noSample, why: `没有样本：${base.no_sample_targets.join('、')}` }
  }
  return { ...base, verdict: 'GREEN', code: null, why: `扫了 ${scanned} 份，没扫到残渣` }
}
