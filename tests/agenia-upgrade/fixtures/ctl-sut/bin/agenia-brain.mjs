/**
 * 【测试替身 · 不是产品代码】`CTL-05` 刀架用的最小 `agenia-brain.mjs`：只实现判据要走的五个 op
 * （`init` / `claim-update` / `candidates-freeze` / `judge-start` / `judge-commit`）与两条导入
 * （`proposal-import` / `maintenance-import`）—— 落盘形状够 `CTL-0x` 的读数读就行。
 *
 * 控制字符闸在 `lib/gate.mjs`（`AGENIA_CTL_KNIFE` 选变体）；**拒必须零写入**：
 * 导入拒 ⇒ 池子 0 行；判决拒 ⇒ 快照版本 / `current` / `phase` 一个都不动。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CONTROL_CODE, controlCharVerdict, controlMessage } from '../lib/gate.mjs'

const DAY = '2026-11-08'

function parseArgs(argv) {
  const out = { op: null, dataRoot: null, inFile: null }
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]
    const eq = raw.indexOf('=')
    const key = eq >= 0 ? raw.slice(0, eq) : raw
    const inline = eq >= 0 ? raw.slice(eq + 1) : null
    const take = () => (inline !== null ? inline : (argv[i + 1] !== undefined ? argv[(i += 1)] : null))
    if (key === '--op') out.op = take()
    else if (key === '--data-root') out.dataRoot = take()
    else if (key === '--in') out.inFile = take()
  }
  return out
}

function readPayload(file) {
  if (file === null || file === undefined) return {}
  return JSON.parse(readFileSync(file, 'utf8'))
}

function ok(body) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...body })}\n`)
  process.exit(0)
}

function fail(code, message) {
  process.stderr.write(`[ctl-sut] ${code} ${String(message).replace(/\r?\n/g, ' ')}\n`)
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } })}\n`)
  process.exit(2)
}

/** 一格里正文的控制字符判决（`where` 是报文要点的位置串）。 */
function gateAt(text, where) {
  const v = controlCharVerdict(text, where)
  return v.ok ? null : controlMessage(where, v)
}

function gateEnvelope(payload) {
  const inner = payload?.payload ?? {}
  const hit = gateAt(inner?.entry?.text, 'payload.entry.text')
  if (hit !== null) return hit
  const ops = Array.isArray(inner?.engine_ops) ? inner.engine_ops : []
  for (let i = 0; i < ops.length; i += 1) {
    const opHit = gateAt(ops[i]?.entry?.text, `payload.engine_ops[${i}].entry.text`)
    if (opHit !== null) return opHit
  }
  return null
}

function appendPool(root, payload) {
  const dir = path.join(root, 'proposals')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'pool.jsonl')
  appendFileSync(file, `${JSON.stringify({ schema: 1, payload: payload?.payload ?? {} })}\n`, 'utf8')
}

function writeState(root, phase) {
  const dir = path.join(root, 'state', 'update')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${DAY}.json`), `${JSON.stringify({ phase })}\n`, 'utf8')
}

const args = parseArgs(process.argv.slice(2))
const root = path.resolve(String(args.dataRoot))
const payload = readPayload(args.inFile)

switch (args.op) {
  case 'init': {
    const dir = path.join(root, 'memory', 'snapshots')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'v0.json'), `${JSON.stringify({ entries: [] })}\n`, 'utf8')
    writeFileSync(path.join(dir, 'current'), 'v0\n', 'utf8')
    ok({ common_sense_sha256: 'a'.repeat(64) })
    break
  }
  case 'claim-update':
    ok({ generation: 1, attempt: 1, token: 'tok-ctl', day: DAY })
    break
  case 'candidates-freeze':
    ok({ frozen_proposal_ids: payload?.candidate_ids ?? [], count: (payload?.candidate_ids ?? []).length })
    break
  case 'judge-start':
    writeState(root, 'judging')
    ok({ phase: 'judging', day: DAY })
    break
  case 'proposal-import':
  case 'maintenance-import': {
    const hit = gateEnvelope(payload)
    if (hit !== null) fail(CONTROL_CODE, hit)
    appendPool(root, payload)
    ok({ imported_id: 'maintenance-ctl-0001', pool_rows: 1 })
    break
  }
  case 'judge-commit': {
    const ops = Array.isArray(payload?.entries_patch) ? payload.entries_patch : []
    for (let i = 0; i < ops.length; i += 1) {
      const hit = gateAt(ops[i]?.entry?.text, `entries_patch[${i}].entry.text`)
      if (hit !== null) fail(CONTROL_CODE, hit)
    }
    const dir = path.join(root, 'memory', 'snapshots')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'v1.json'), `${JSON.stringify({ entries: ops.map((op) => op?.entry) })}\n`, 'utf8')
    writeFileSync(path.join(dir, 'current'), 'v1\n', 'utf8')
    writeState(root, 'awaiting_review_start')
    ok({ new_snapshot: 'v1', snapshot_available: true, phase: 'awaiting_review_start' })
    break
  }
  default:
    fail('E_USAGE', `未知 op：${JSON.stringify(args.op)}`)
}
