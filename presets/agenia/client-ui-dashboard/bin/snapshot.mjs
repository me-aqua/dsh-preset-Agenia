#!/usr/bin/env node
/**
 * 从**外面**驱动看板 Node 侧：算一次视图、原子写一份快照、打一行结果 JSON。
 *
 * 这是"只跑在活宿主里"之外的那条缝：`apply()` 只在 cordis 宿主里被调，而这一条不需要宿主 ——
 * 主机上的任何人都能用它复算 `presets/agenia/.runtime/state/dashboard/view.json`。
 *
 * 用法（`--root` 必给，缺了就报用法；`--now` 可选，只给复现某一天用）：
 *
 *   node presets/agenia/client-ui-dashboard/bin/snapshot.mjs --root=E:\Harness
 *   node presets/agenia/client-ui-dashboard/bin/snapshot.mjs --root=E:\Harness --now=2026-11-05T01:30:00+08:00
 *
 * `--now` 走的是同一个注入口径：`dayKeyOf` 减 4 小时 ⇒ 凌晨 1:30 仍算前一天（契约 §13.1）。
 */
import { refreshSnapshot } from '../lib/index.js'

const argv = process.argv.slice(2)
const arg = (name) => {
  const hit = argv.find((item) => item.startsWith(`--${name}=`))
  return hit === undefined ? null : hit.slice(name.length + 3)
}

const root = arg('root')
if (root === null || root.trim() === '') {
  console.error('用法：node presets/agenia/client-ui-dashboard/bin/snapshot.mjs --root=<工作区绝对路径> [--now=<ISO8601 带时区偏移>]')
  process.exit(2)
}

const raw = arg('now')
let instant
if (raw !== null) {
  instant = new Date(raw)
  if (Number.isNaN(instant.getTime())) {
    console.error(`--now 解析不了：${JSON.stringify(raw)}（要 ISO8601 带时区偏移，例 2026-11-05T01:30:00+08:00）`)
    process.exit(2)
  }
}

const result = refreshSnapshot({ root, ...(instant === undefined ? {} : { now: instant }) })
console.log(JSON.stringify(result))
