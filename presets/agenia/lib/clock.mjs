/**
 * 时钟接缝 —— **所有需要"现在"的模块只许从这里取时间**。
 *
 * 冻结依据：提案 §B1.2 env 表（`AGENIA_NOW_FILE` = 可注入时钟文件，ISO8601 一行；缺席 ⇒ 用真实时钟）
 * + §B1.6 时钟接缝（"不许把 `Date.now()` 直接埋进业务逻辑"）。
 *
 * 三条口径：
 *   ① `now()` 返回 `Date`（不是字符串）—— 调用方自己决定怎么格式化；
 *   ② **文件缺席（ENOENT）走真实时钟**：那是提案明写的合法默认；
 *   ③ **文件在、内容坏 ⇒ 抛错**（`E_ARG_SCHEMA`）。这一条是刻意的：测试用这个文件钉 89/90/91 分钟
 *      这类边界，如果坏内容悄悄回落真实时钟，那些断言会**随机**红或绿 —— "静默失效的检查
 *      和通过的检查长得一模一样"（AGENTS.md 工作原则 7）。
 */
import { readFileSync } from 'node:fs'

/** 注入式时钟文件的变量名（提案 §B1.2）。 */
const NOW_FILE_VAR = 'AGENIA_NOW_FILE'

/** ISO8601 **带时区偏移**（`Z` 或 `±HH:MM`）：`2026-10-14T12:00:00+08:00`。 */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

function clockError(message, detail) {
  const err = new Error(message)
  err.name = 'ClockError'
  err.code = 'E_ARG_SCHEMA'
  err.detail = detail ?? null
  return err
}

/**
 * 现在几点。`AGENIA_NOW_FILE` 里第一行非空文本就是"现在"；没有这个变量（或文件不在）⇒ 真实时钟。
 *
 * @param {Record<string,string|undefined>} [env] 环境（默认真实进程环境；测试可注入）
 * @returns {Date}
 */
export function now(env = process.env) {
  const raw = env?.[NOW_FILE_VAR]
  if (raw === undefined || String(raw).trim() === '') return new Date()

  const file = String(raw)
  let text = null
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    // 文件不在 ⇒ 真实时钟（提案 §B1.2：缺席是合法的）。其它读失败（权限、目录）⇒ 出声。
    if (err?.code === 'ENOENT') return new Date()
    throw clockError(`可注入时钟文件读不到：${file}（${err?.code ?? 'UNKNOWN'}）`, { file })
  }

  const line = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s !== '')
  if (!line) throw clockError(`可注入时钟文件是空的：${file}`, { file })
  if (!ISO_WITH_OFFSET.test(line)) {
    throw clockError(`可注入时钟文件必须是 ISO8601 带时区偏移的一行，实得 ${JSON.stringify(line.slice(0, 60))}`, { file })
  }
  const at = new Date(line)
  if (Number.isNaN(at.getTime())) throw clockError(`可注入时钟文件里的时间解析不了：${JSON.stringify(line)}`, { file })
  return at
}
