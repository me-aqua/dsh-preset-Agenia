/**
 * `F-120`～`F-123`（门 1 · 回执链路四票）共用的**量尺与夹具**。
 *
 * 病根一句话：**校验方不自己复算，只信作业自报**。四张脸 → 四组用例（`VRF-01`…`VRF-04`）：
 *   · `VRF-01` / `F-120` 指纹口径（排除表按**根相对**写）
 *   · `VRF-02` / `F-121` `findings_set_sha256` 必须**复算**
 *   · `VRF-03` / `F-122` `code_fingerprint.equal` 是自报 ⇒ 拒三种形状
 *   · `VRF-04` / `F-123` 「打的是哪棵树」必须**逐树枚举**，不是盯名单
 *
 * 本文件只做两件事，**不含断言**（断言在各用例里，红因要能指到行）：
 *   ① **一把独立的尺子** `q10Digest()` —— Q10 规范化配方在测试侧的**第二份实现**。
 *      不许拿被测模块的 `findingsSetSha256()` 当期望值：那是自证
 *      （`cand-20261016-selfsourced-order-01`：期望与实现读同一份来源，它就不是判据）。
 *   ② 夹具树 + 真跑 `.tools/fingerprint.mjs`（`F-120` 的被测对象就是那把尺子，必须真起子进程）。
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, PATHS, requireEnv } from './env.mjs'
import { childEnv } from './sut.mjs'
import { canonical } from './root-guard.mjs'

export const NODE_BIN = process.execPath

/** 被测的那把仓库尺子（`F-120` 的现场就在它身上）。 */
export const FINGERPRINT_TOOL = path.join(PATHS.repo, '.tools', 'fingerprint.mjs')

/** `<run>/fixtures/<caseid>-<purpose>/` —— 只住运行根之下（C 盘一个字节都不写）。 */
export function fixtureDir(caseId, purpose) {
  const run = canonical(requireEnv(ENV.RUN_ROOT))
  const dir = path.join(run, 'fixtures', `${String(caseId).toLowerCase()}-${purpose}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 在 `root` 下写一份文本（相对路径用 `/`；父目录自动建）。 */
export function writeUnder(root, rel, text) {
  const abs = path.join(root, String(rel).split('/').join(path.sep))
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')
  return abs
}

/** 数一个目录下的普通文件（不存在 ⇒ 0；只读）。 */
export function countFiles(root) {
  let n = 0
  const walk = (dir) => {
    let names = []
    try { names = readdirSync(dir) } catch { return }
    for (const name of names) {
      const full = path.join(dir, name)
      let st = null
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) n += 1
    }
  }
  walk(root)
  return n
}

// ── ① 独立尺子：Q10 规范化哈希（测试侧第二份实现）────────────────────────────
/**
 * Q10（`lib/receipt.mjs` 文件头逐字）的规范化 JSON：**键按 UTF-8 字节序升序 + 无空白**。
 *
 * 这里**手写**一遍（不 import 被测模块），理由见文件头 ①。
 * 只处理 JSON 能表达的值：`undefined` 的键按 `JSON.stringify` 的口径**丢掉**。
 * ⚠️ 夹具里的键一律 ASCII（值里可以有中文）—— 非 ASCII 的**键**才会让"码元序"与"字节序"分家。
 */
export function q10Canonical(value) {
  if (Array.isArray(value)) return `[${value.map(q10Canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => typeof value[k] !== 'undefined')
      .sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
    return `{${keys.map((k) => `${JSON.stringify(k)}:${q10Canonical(value[k])}`).join(',')}}`
  }
  const encoded = JSON.stringify(value)
  return encoded === undefined ? 'null' : encoded
}

/** `findings_set_sha256` 的**独立**算法：`sha256(q10 规范化(findings 数组))`，UTF-8、小写 hex。 */
export function q10Digest(findings) {
  const list = Array.isArray(findings) ? findings : (Array.isArray(findings?.findings) ? findings.findings : [])
  return createHash('sha256').update(q10Canonical(list), 'utf8').digest('hex')
}

// ── ② 真跑 `.tools/fingerprint.mjs`（CODE 那一套）────────────────────────────
/**
 * 量一棵树的 CODE 指纹。**真起子进程**（不许在测试里"照它的配方再算一遍"——
 * 那样量的是我的抄写，不是那把尺子）。
 *
 * @param {string} root 要量的树根（相对它算排除表 —— 这正是 `F-120` 的病根所在）
 * @returns {{ok:boolean, code:{sha256:string,files:number,bytes:number,list:Array<{rel:string,bytes:number,sha256:string}>}|null,
 *            exit_code:number|null, problems:string[], root:string}}
 */
export function fingerprintCode(root, { env = process.env, timeoutMs = 120000 } = {}) {
  const abs = path.resolve(String(root))
  const res = spawnSync(NODE_BIN, [FINGERPRINT_TOOL, '--root', abs, '--set', 'code', '--json'], {
    cwd: PATHS.repo,
    env: childEnv(env),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  const problems = []
  if (res.error) problems.push(`起不了子进程：${res.error.message}`)
  if (res.status !== 0) problems.push(`fingerprint 退出码 ${res.status}：${String(res.stderr ?? '').trim().slice(0, 300)}`)
  const lines = String(res.stdout ?? '').split(/\r?\n/).filter((l) => l.trim() !== '')
  let report = null
  if (lines.length > 0) {
    try {
      report = JSON.parse(lines[lines.length - 1])
    } catch (err) {
      problems.push(`stdout 最后一行不是 JSON：${lines[lines.length - 1].slice(0, 200)}`)
    }
  } else {
    problems.push('stdout 是空的（`--json` 要求一行 JSON）')
  }
  const code = report?.sets?.code ?? null
  if (report !== null && code === null) problems.push('报告里没有 sets.code（`--set code` 应该给这一套）')
  if (code !== null && !Array.isArray(code.list)) problems.push('sets.code.list 不是数组（没法看"收了哪几份文件"）')
  return { ok: problems.length === 0, code, exit_code: res.status ?? null, problems, root: abs, report }
}

// ── ③ 夹具树：一棵"像预设"的小树（代码 + 数据 + 办公桌）─────────────────────
export const FIXTURE_INJECT = '// inject.js（夹具）—— 代码\nexport const INJECT_SCHEMA = 1\n'
export const FIXTURE_RECEIPT = '// lib/receipt.mjs（夹具）—— 代码\nexport const REJECT_REASON_MIN_CHARS = 10\n'
/** 与 `FIXTURE_RECEIPT` **只差一个字节数**的那一版（"改一个字节"的阳性对照）。 */
export const FIXTURE_RECEIPT_999 = FIXTURE_RECEIPT.replace('= 10', '= 999')
export const FIXTURE_LOCAL_BIN = '// bin/agenia-local.mjs（夹具）—— 代码\nexport const CLI_NAME = "agenia-local.mjs"\n'
export const FIXTURE_COMPOSITION = '- id: fixture-composition\n'
export const FIXTURE_PACKAGE = '{ "name": "@fixture/agenia-preset", "private": true }\n'
/** 数据目录（**不是代码**）：现役那 3.2 MB 脑数据就住这儿。 */
export const FIXTURE_RUNTIME_SNAPSHOT = '{ "schema": 1, "entries": [] }\n'

/**
 * 造一棵"像预设根"的小树：代码 5 份 · 数据 1 份（`.runtime/`）· 办公桌 1 份（`.team/`）。
 *
 * ⚠️ 目录名是**故意**这么起的：`F-120` 的病根就是"排除表按仓库根写"，
 *    所以夹具必须同时有"该被排除的"（`.runtime/` `.team/`）与"该被算进去的"（`lib/`）。
 */
export function buildPresetTree(caseId, purpose, { receipt = FIXTURE_RECEIPT, extra = {} } = {}) {
  const root = fixtureDir(caseId, purpose)
  writeUnder(root, 'inject.js', FIXTURE_INJECT)
  writeUnder(root, 'lib/receipt.mjs', receipt)
  writeUnder(root, 'lib/tickets.mjs', '// lib/tickets.mjs（夹具）—— 代码\nexport const TICKET_SCHEMA = 1\n')
  writeUnder(root, 'bin/agenia-local.mjs', FIXTURE_LOCAL_BIN)
  writeUnder(root, 'agent.cordis.yml', FIXTURE_COMPOSITION)
  writeUnder(root, 'package.json', FIXTURE_PACKAGE)
  writeUnder(root, '.runtime/memory/snapshots/v7.json', FIXTURE_RUNTIME_SNAPSHOT)
  writeUnder(root, '.team/desk.txt', 'office desk（夹具）\n')
  for (const [rel, text] of Object.entries(extra)) writeUnder(root, rel, text)
  return root
}
