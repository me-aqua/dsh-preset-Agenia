/**
 * 尾巴注入这一票用的**窗口指纹**工具 —— 把"量了哪 12 个文件、各自什么哈希"固定下来。
 *
 * 为什么要有它：2026-09-26 组长用三条不同的 PowerShell 命令手敲同一个指纹，量出**三个不同的值**
 * （`355623E…` / `C636D9C…` / `483654A…` / `8F28BBA…`）—— 因为**行格式（前导空格、列宽）是我手写的**，
 * 文件本身一个字没变。⇒ **手敲的指纹不是指纹**：换个引号就变一个数，而它要证明的恰恰是"没人动过文件"。
 *
 * 跑法：<node.exe> .tools/window-fingerprint.mjs
 *   → 打印 12 个文件各自的 sha256（前 16 位）+ 一个**由固定格式算出来**的合计指纹
 *   → 退出码恒 0（这是量尺，不是判据；红了不该红在这）
 *
 * ⚠️ **文件的组成不许随手改**：这份清单 = `presets/agenia/` 七份要送的 .md +
 * `.tools/` 三份判据 + 仓库根两份 `AGENTS*.md`（后两份**被 gitignore 挡着**，但**照样会进提示词**，
 * 是一次真事故之后补进来的）。改清单 = 换了一把尺子，**改之前先说清为什么**。
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/** 顺序固定 —— 指纹是按这个顺序拼出来的。 */
const FILES = [
  'presets/agenia/agent.cordis.yml',
  'presets/agenia/inject.js',
  'presets/agenia/style.md',
  'presets/agenia/persona.md',
  'presets/agenia/leader.md',
  'presets/agenia/work-guidelines.md',
  'presets/agenia/说明.md',
  '.tools/check-notes.mjs',
  '.tools/inject-probe.mjs',
  '.tools/inject-replay.mjs',
  'AGENTS.md',
  'AGENTS.local.md',
]

const rows = []
for (const rel of FILES) {
  const abs = ROOT + rel
  const buf = readFileSync(abs)
  const sha = createHash('sha256').update(buf).digest('hex')
  const bytes = statSync(abs).size
  // ⚠️ 这一行就是"指纹"的原料 —— 格式变了指纹就变，所以它写死在这里，不靠手敲。
  rows.push(`${rel}\t${bytes}\t${sha}`)
  console.log(`${rel.padEnd(38)} ${String(bytes).padStart(7)}  ${sha.slice(0, 16)}`)
}

const fingerprint = createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16)
console.log(`\n窗口指纹（${FILES.length} 个文件）= ${fingerprint}`)
