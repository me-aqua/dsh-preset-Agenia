/**
 * 【测试替身 · 不是产品代码】`CTL-05` 刀架用的最小 `proposal_file` 工具：
 * `proposalFileVerdict`（纯函数，判控制字符）+ `proposalFileRun`（主路：拒 ⇒ 不写；收 ⇒ 池子恰好一行）。
 * 与产品同形（两个导出名 + 同样的返回/抛出形状），**只实现契约 §1.2 要的那一件事**。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CONTROL_CODE, controlCharVerdict, controlMessage } from '../lib/gate.mjs'

/**
 * @param {{args?: {text?: unknown, source?: string, kind?: string}, poolEntries?: Array}} input
 * @returns {{ok:true, sha256:string, kind:string}|{ok:false, code:string, message:string}}
 */
export function proposalFileVerdict({ args, poolEntries } = {}) {
  const a = args ?? {}
  void poolEntries
  if (typeof a.text !== 'string' || a.text.trim() === '') {
    return { ok: false, code: 'E_PROPOSAL_SHAPE', message: 'E_PROPOSAL_SHAPE: text 必填（非空字符串）' }
  }
  const v = controlCharVerdict(a.text, 'proposal_file')
  if (!v.ok) return { ok: false, code: CONTROL_CODE, message: controlMessage('proposal_file', v) }
  return { ok: true, sha256: '0'.repeat(64), kind: typeof a.kind === 'string' ? a.kind : 'general' }
}

/**
 * 主路：拒 ⇒ 抛（`.code` 稳定）；收 ⇒ 池子追加一行（`payload.entry.text` 逐字）。
 * @param {{text?: string, source?: string, kind?: string}} args
 * @param {{root?: string}} options
 */
export async function proposalFileRun(args, options = {}) {
  const pre = proposalFileVerdict({ args, poolEntries: [] })
  if (!pre.ok) {
    const err = new Error(pre.message)
    err.code = pre.code
    throw err
  }
  const dir = path.join(options?.root, 'proposals')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'pool.jsonl')
  const seq = existsSync(file)
    ? String(readFileSync(file, 'utf8')).split(/\r?\n/).filter((l) => l.trim() !== '').length + 1
    : 1
  const row = {
    schema: 1,
    kind: 'proposal',
    imported_id: `proposal-ctl-${String(seq).padStart(4, '0')}`,
    seq,
    payload: { entry: { id: `cand-ctl-${String(seq).padStart(4, '0')}`, type: pre.kind, text: args.text } },
  }
  appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')
  return { ok: true, proposal_id: row.imported_id }
}
