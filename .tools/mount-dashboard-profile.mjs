#!/usr/bin/env node
/**
 * 把「看板」挂到客户端 **profile 层**的顶层插入块里 —— **只在客户端关着的时候用**。
 *
 * 为什么是 profile 层：浏览器只收**宿主 Loader 树**里的条目
 * （`@deepseek-ai/dsh-client-modules` 的 `ClientModuleRegistry.processOne()` 只枚举
 * `ctx.loader.entries()`）；bundle 层在 boot 时被合成，而预设里的行由
 * `@deepseek-ai/dsh-agent-preset` 注册进它自建的 Loader 树。宿主级行住 profile 补丁，
 * 预设级行住 bundle 补丁 —— 两层各有一个落点。
 *
 * profile 补丁是**热重载层**（`patchReload: live`）：在会话里写它 = 正在跑的工具当场掉光。
 * ⇒ 这个脚本**先看进程**：客户端还开着就直接拒（退出码 3），一个字节都不写。
 *
 * 形状的**唯一来源**是 `./lib/dashboard-mount.mjs` 的 `dashboardMountRow()`：
 * 写进去的行、`--check` 比对的期望、`BOOT-01/02` 能 import 的那份形状，全都从它来。
 *
 * 用法（三条，都要显式说；默认 = check）：
 *   node .tools/mount-dashboard-profile.mjs --check          # 只看现在挂没挂（形状 / 包事实 / 标记块三格都参与退出码）
 *   node .tools/mount-dashboard-profile.mjs --apply          # 挂上（要客户端已关）
 *   node .tools/mount-dashboard-profile.mjs --revert         # 撤掉（要客户端已关；**只写"能逐字节还原"的那一次**）
 *
 * `--revert` 两种情形分开：
 *   · apply 记录命中 ⇒ 把备份写回去（写完回读验 sha）；
 *   · 记录没命中（文件被动过 / 记录丢了）⇒ 只有备份目录里有一份 `.bak` 按 apply 的变换重建后
 *     与当前全文逐字节相同才写（逐字节还原）；否则**拒绝写盘、退 4**，并打出"要删哪几行"的 diff。
 *     绝不做"删块留折叠"的半还原。
 *
 * 可选：--profile <名字>（默认 desktop）· --file <绝对路径>（默认本机那份 profile 补丁；
 *       **必须带值**：裸 `--file` 是参数错，退 6，不当"现役"；显式给副本时不上进程锁，
 *       但**解析出的路径等于现役路径时照样上锁**）
 *       --root <工作区>（默认 E:/Harness，写进那一行的 config.root）
 *       --backup-dir <目录>（默认 .team/leader/<今天>/backup；副本实验时指到 .team/dev/…）
 *
 * 退出码：0 挂载成立 / 已经挂上 / 已撤掉 · 1 没挂 · 2 补丁读不到 ·
 *         3 客户端还开着（拒绝写）· 4 形状 / 包事实 / 标记块不对，或回退做不到逐字节（拒绝写）·
 *         6 参数错（裸 `--file`，或 `--file` 的值像另一个 flag）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareDashboardMount,
  dashboardMountPayload,
  dashboardPackageFacts,
  readDashboardMount,
  remainingDashboardReferences,
  stripDashboardMount,
} from './lib/dashboard-mount.mjs'

// 判据那边可以直接 import 这个入口拿形状；这里原样再导出，路径只留一个。
export {
  MOUNT_MARKERS,
  compareDashboardMount,
  dashboardMountBlock,
  dashboardMountRow,
  dashboardPackageFacts,
  readDashboardMount,
  stripDashboardMount,
} from './lib/dashboard-mount.mjs'

const ARGV = process.argv.slice(2)
const flag = (name) => ARGV.includes(name)
const opt = (name, dflt) => {
  const i = ARGV.indexOf(name)
  return i >= 0 && i + 1 < ARGV.length ? ARGV[i + 1] : dflt
}

/**
 * `--file` 的取值。**裸 `--file`（最后一个参数 / 后面跟另一个 flag）是参数错**：
 * 旧版 `opt()` 在缺值时返回 null ⇒ `profilePatchPath()` 落回现役路径 ——
 * 一个手滑就会写热重载层，而且不看进程。这里把"缺值"与"给了路径"分开。
 */
function fileArg() {
  if (!flag('--file')) return { given: false, value: null }
  const i = ARGV.indexOf('--file')
  const value = i + 1 < ARGV.length ? ARGV[i + 1] : null
  if (value === null || value.startsWith('--')) return { given: true, value: null }
  return { given: true, value }
}

/** 现役 profile 补丁路径（**不看 `--file`**）—— 进程锁按它判"这一份是不是热重载层"。 */
function liveProfilePatchPath() {
  const profile = opt('--profile', null)
  if (profile !== null) {
    return { file: path.join(os.homedir(), '.dsh', 'profiles', profile, 'cordis.patch.yml'), source: '--profile' }
  }
  if (typeof process.env.DSH_PROFILE_DIR === 'string' && process.env.DSH_PROFILE_DIR.trim() !== '') {
    return { file: path.join(process.env.DSH_PROFILE_DIR, 'cordis.patch.yml'), source: 'DSH_PROFILE_DIR' }
  }
  const fallback = process.env.DSH_PROFILE ?? 'desktop'
  return { file: path.join(os.homedir(), '.dsh', 'profiles', fallback, 'cordis.patch.yml'), source: 'homedir()/.dsh/profiles' }
}

function profilePatchPath(file = fileArg()) {
  if (file.given) {
    if (file.value === null) return { file: null, source: '--file', error: 'E_PARAM_FILE_WITHOUT_VALUE' }
    return { file: path.resolve(file.value), source: '--file' }
  }
  return liveProfilePatchPath()
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').toUpperCase()
const localDay = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 客户端还开着吗 —— 以进程名为准（这台机器上是 `DeepSeek Harness`）。 */
function clientRunning() {
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'DeepSeek Harness|dsh-desktop' } | Measure-Object).Count",
    ], { encoding: 'utf8', timeout: 15000 })
    const count = Number.parseInt(String(out).trim(), 10)
    return Number.isFinite(count) ? count > 0 : null
  } catch {
    // 读不到进程表 ⇒ 不能当成"没开"（"读不到"≠"没有"）
    return null
  }
}

function backupDirOf(root) {
  const explicit = opt('--backup-dir', null)
  if (explicit !== null) return path.resolve(explicit)
  return path.join(root, '.team', 'leader', localDay(), 'backup')
}

function writeBackup(file, root, profile) {
  const dir = backupDirOf(root)
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dst = path.join(dir, `cordis.patch.yml.${profile}.${stamp}.bak`)
  writeFileSync(dst, readFileSync(file))
  return dst
}

/** 原子写：同目录临时件 → rename（半截文件不会被热重载层读到）。 */
function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, file)
  } catch (err) {
    try { if (existsSync(tmp)) unlinkSync(tmp) } catch { /* 清理失败不盖住原错误 */ }
    throw err
  }
}

const indentOf = (line) => (/^[ ]*/.exec(line) ?? [''])[0].length
const KEY_SHAPE = /^[A-Za-z0-9_$@.\-/]+\s*:/
const SCALAR_KEY = /^(\s*)([A-Za-z0-9_$@.\-/]+):\s+(.*\S)\s*$/

/**
 * 把**多行 plain scalar** 折成一行 —— 只动空白，不改值。
 *
 * 为什么需要它：项目自己的窄口径 YAML 读取器（`tests/agenia-upgrade/support/composition.mjs`
 * 的 `parseYamlSubset`）不支持多行 plain scalar；现役 profile 补丁里那条模型 `description`
 * 正好是两行 ⇒ 读取器从那一行起就报"未被解析器吃掉"，后面（包括我们挂上去的那一块）
 * 全都读不到。`--apply` 折叠它，挂载行才在读数里存在；`--revert` 用 apply 前的备份
 * **逐字节还原**，所以"撤掉 = 回到原样"仍然成立。
 *
 * 只折这一种形状：上一行是 `key: 非空 plain 值`（不是引号 / 块标量 / 行内集合 / `!!js`），
 * 下一行缩进更深、不是空行 / 注释 / 列表项 / 新 key、也没有行尾注释。
 * 看不懂的形状一律不碰 —— 宁可让读取器出声，也不猜。
 *
 * @returns {{text: string, folds: {line: number, from: string[], to: string}[]}}
 */
function foldPlainContinuations(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(eol)
  const folds = []
  let blockScalarIndent = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (blockScalarIndent !== null) {
      if (line.trim() === '' || indentOf(line) > blockScalarIndent) continue
      blockScalarIndent = null
    }
    if (/:\s*[|>][-+]?\s*$/.test(line)) {
      blockScalarIndent = indentOf(line)
      continue
    }
    const hit = SCALAR_KEY.exec(line)
    if (hit === null) continue
    const indent = hit[1].length
    const value = hit[3]
    if (/^['"[{]/.test(value) || value.startsWith('!!js')) continue
    const original = [line]
    const continuation = []
    let j = i + 1
    while (j < lines.length) {
      const next = lines[j]
      if (next.trim() === '' || /^\s*#/.test(next)) break
      if (indentOf(next) <= indent) break
      const rest = next.trim()
      if (/^- /.test(rest) || KEY_SHAPE.test(rest) || rest.includes(' #')) break
      continuation.push(next)
      j += 1
    }
    if (continuation.length > 0) {
      const folded = `${line.trimEnd()} ${continuation.map((item) => item.trim()).join(' ')}`
      folds.push({ line: i + 1, from: [...original, ...continuation], to: folded })
      // 把折好的那一行写回，并删掉被吃掉的续行。
      lines.splice(i, j - i, folded)
    }
  }
  return { text: lines.join(eol), folds }
}

function applyRecordPath(backupFile) {
  return backupFile.replace(/\.bak$/, '.json')
}

function writeApplyRecord({ backup, file, profile, original, applied, folds }) {
  const record = {
    schema: 1,
    at: new Date().toISOString(),
    file,
    profile,
    backup,
    original: { bytes: Buffer.byteLength(original, 'utf8'), sha256: sha256(Buffer.from(original, 'utf8')) },
    applied: { bytes: Buffer.byteLength(applied, 'utf8'), sha256: sha256(Buffer.from(applied, 'utf8')) },
    folds,
  }
  const recordFile = applyRecordPath(backup)
  writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  return recordFile
}

function findApplyRecord(root, file, currentText) {
  const dir = backupDirOf(root)
  if (!existsSync(dir)) return null
  const current = sha256(Buffer.from(currentText, 'utf8'))
  const samePath = (a, b) => typeof a === 'string' && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort().reverse().slice(0, 50)) {
    const candidate = path.join(dir, name)
    try {
      const record = JSON.parse(readFileSync(candidate, 'utf8'))
      if (record?.schema === 1 && samePath(record.file, file) && record.applied?.sha256 === current) return record
    } catch { /* 坏记录不算匹配 */ }
  }
  return null
}

/**
 * 记录没命中时，去找"apply 前原文"的备份 —— **逐字节**判定，不靠文件名 / 时间猜。
 *
 * 对每一份 `.bak` 试两种重建（不折叠 / 折叠后）再拼上本次 apply 会追加的那段 payload；
 * 与当前全文逐字节相同 ⇒ 那份 `.bak` 就是 apply 前的原文，可以安全写回去。
 * 一份都对不上 ⇒ null（调用方**拒绝写盘**，不删块留折叠）。
 *
 * @returns {{file: string, text: string, how: string}|null}
 */
function findPreApplyBackup({ root, currentText, mount }) {
  const dir = backupDirOf(root)
  if (!existsSync(dir)) return null
  const rowRoot = mount?.mount?.root
  const payload = dashboardMountPayload({ root: rowRoot ?? root })
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.bak')).sort().reverse().slice(0, 50)) {
    const file = path.join(dir, name)
    let candidate = ''
    try {
      candidate = readFileSync(file, 'utf8')
    } catch { continue }
    if (`${candidate}${payload}` === currentText) return { file, text: candidate, how: '未折叠' }
    if (`${foldPlainContinuations(candidate).text}${payload}` === currentText) return { file, text: candidate, how: '折叠后' }
  }
  return null
}

/**
 * 只打"删块"这一处差异（公共前缀 / 后缀之外的那一段，逐行带行号）。
 * 记录没命中时把它打给人看 —— 拒绝写盘，但要说清"要删的到底是哪几行"。
 */
function printDiff(before, after, beforeLabel, afterLabel) {
  const a = String(before).replace(/\r\n/g, '\n').split('\n')
  const b = String(after).replace(/\r\n/g, '\n').split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1 }
  console.log(`--- ${beforeLabel}`)
  console.log(`+++ ${afterLabel}`)
  console.log(`@@ -${start + 1},${endA - start} +${start + 1},${endB - start} @@`)
  for (let i = start; i < endA; i += 1) console.log(`-${a[i]}`)
  for (let i = start; i < endB; i += 1) console.log(`+${b[i]}`)
}

const yesNo = (value) => (value === true ? 'YES' : value === false ? 'NO' : '判不了')

/** `--check` 的具名码 —— 退出码 0 的每一格都要有一个能翻面的名字。 */
const CHECK_CODE_TEXT = Object.freeze({
  E_CHECK_NOT_MOUNTED: 'profile 补丁里没有本工具写的那一行',
  E_CHECK_SHAPE: '挂载行形状与 dashboardMountRow() 不逐格相同（或重复数不是 1）',
  E_CHECK_MARKERS: '边界标记不是恰好各一行',
  E_CHECK_PACKAGE: '包事实有问题（见上面的「包问题」行）',
})

/**
 * `--check` 的判词：四个格各自一个具名码。
 *   0 = 挂载 + 形状 + 包事实 + 标记块全绿；
 *   1 = 没挂（既有的"没挂"契约）；
 *   4 = 挂了但有一格不对（**不许退 0**）。
 * 包事实 / 标记块以前只打印、不参与退出码 —— 那会让"check 绿"与"启动后读得到"变成两件事。
 */
function checkVerdict({ mount, compare, facts }) {
  if (!mount.present) {
    const strayMarkers = mount.markers.begin_lines.length > 0 || mount.markers.end_lines.length > 0
    return strayMarkers
      ? { exit: 4, codes: ['E_CHECK_NOT_MOUNTED', 'E_CHECK_MARKERS'], pass: false }
      : { exit: 1, codes: ['E_CHECK_NOT_MOUNTED'], pass: false }
  }
  const codes = []
  if (!compare.ok || mount.duplicates !== 1) codes.push('E_CHECK_SHAPE')
  if (!mount.markers.block) codes.push('E_CHECK_MARKERS')
  if (facts.problems.length > 0) codes.push('E_CHECK_PACKAGE')
  return { exit: codes.length === 0 ? 0 : 4, codes, pass: codes.length === 0 }
}

function printCheck({ mode, file, source, profile, root, text, mount, facts, client, isLivePath, guardApplies }) {
  const row = mount.mount
  const compare = compareDashboardMount(row, { root })
  console.log(`file      ${file}  (${source})`)
  console.log(`profile   ${profile}`)
  console.log(`scope     ${isLivePath ? '现役（热重载层）' : '副本（--file）'} · 进程锁 ${guardApplies ? '适用' : '不适用'}`)
  console.log(`bytes     ${Buffer.byteLength(text, 'utf8')} · sha256 ${sha256(Buffer.from(text, 'utf8'))}`)
  console.log(`挂载 ${mount.present ? 'YES' : 'NO'}`)
  console.log(`顶层 insert ${mount.present ? yesNo(row?.placement === 'insert') : '—'}`)
  console.log(`disabled ${mount.present ? yesNo(row?.disabled === true) : '—'}`)
  console.log(`id        ${mount.present ? (row?.id ?? '（无 id）') : '—'}`)
  console.log(`name      ${mount.present ? (row?.name ?? '?') : '—'}`)
  console.log(`root      ${mount.present ? (row?.root ?? '?') : '—'}`)
  if (mount.present && mount.rows.length > 1) console.log(`重复      指向这个包的行有 ${mount.rows.length} 处（${mount.rows.map((r) => `${r.placement}@L${r.line}`).join(' · ')}）`)
  if (mount.nested.length > 0) console.log(`住错层    ${mount.nested.map((r) => `${r.placement}${r.parent === null ? '' : `（${r.parent} 里）`}@L${r.line}`).join(' · ')}`)
  console.log(`形状      ${mount.present ? (compare.ok ? '与 dashboardMountRow() 逐格相同' : `不匹配：${Object.entries(compare.checks).filter(([, ok]) => !ok).map(([k]) => k).join(', ')}`) : '—'}`)
  console.log(`标记块    ${mount.markers.block ? `YES（BEGIN L${mount.markers.begin_lines[0]} · END L${mount.markers.end_lines[0]}）` : 'NO'}`)
  console.log(`package   ${facts.name ?? '?'} ${facts.version ?? ''}  (${facts.dir})`)
  console.log(`dsh.client.platform ${facts.platform ?? '?'}`)
  console.log(`dsh.client.inject   ${facts.inject === null ? '?' : JSON.stringify(facts.inject)}`)
  console.log(`exports["./client"] ${facts.exports_client ?? '?'} → ${facts.client_path ?? '?'}`)
  console.log(`client    ${facts.client_exists ? `在盘 · ${facts.client_bytes} B · sha256 ${facts.client_sha256}` : '不在盘'}`)
  console.log(`entry     ${facts.entry_exists ? `在盘 · ${facts.entry_path}` : `不在盘 · ${facts.entry_path}`}`)
  const folds = foldPlainContinuations(text).folds
  console.log(`窄口径解析 ${folds.length === 0 ? '可直接读（无多行 plain scalar）' : `有 ${folds.length} 处多行 plain scalar —— BOOT-01/02 的读取器读不懂；--apply 会折叠，--revert 用备份逐字节还原`}`)
  console.log(`客户端    ${client === null ? '判不了（读不到进程表）' : client ? '开着' : '关着'}`)
  for (const problem of facts.problems) console.log(`包问题    ${problem}`)
  // `--check` 的判词（只在 check 模式打；apply / revert 自己会打结果）。
  const verdict = checkVerdict({ mount, compare, facts })
  if (mode === 'check') {
    console.log(`check格   ${verdict.pass
      ? '全绿（挂载 · 形状 · 包事实 · 标记块）'
      : `未通过：${verdict.codes.join(' · ')}（exit ${verdict.exit}）`}`)
  }
  return { compare, verdict }
}

function main() {
  const mode = flag('--apply') ? 'apply' : flag('--revert') ? 'revert' : 'check'
  const rootRaw = opt('--root', 'E:/Harness')
  const root = path.resolve(rootRaw)
  const file = fileArg()
  if (file.given && file.value === null) {
    console.log('E_PARAM_FILE_WITHOUT_VALUE 裸 --file 没有值 —— 它不是"用现役路径"，是参数错；要给路径（或整条 --file 去掉）。')
    return 6
  }
  const where = profilePatchPath(file)
  const live = liveProfilePatchPath()
  // 进程锁按**解析后的路径**判：`--file` 指到现役那份时，锁照样在（副本实验只对副本成立）。
  const isLivePath = path.resolve(where.file).toLowerCase() === path.resolve(live.file).toLowerCase()
  const guardApplies = isLivePath || !file.given
  const profile = opt('--profile', process.env.DSH_PROFILE ?? path.basename(path.dirname(where.file)))

  if (!existsSync(where.file)) {
    console.log(`file      ${where.file}  (${where.source})`)
    console.log('E_NO_PROFILE 找不到 profile 补丁')
    return 2
  }

  const text = readFileSync(where.file, 'utf8')
  const mount = readDashboardMount(text)
  const facts = dashboardPackageFacts(root)
  const client = clientRunning()
  const { compare, verdict } = printCheck({
    mode, file: where.file, source: where.source, profile, root, text, mount, facts, client, isLivePath, guardApplies,
  })

  if (mode === 'check') {
    if (verdict.pass) {
      console.log('check     PASS（exit 0）')
      return 0
    }
    for (const code of verdict.codes) console.log(`红格      ${code} —— ${CHECK_CODE_TEXT[code]}`)
    console.log(`check     FAIL（exit ${verdict.exit}）`)
    return verdict.exit
  }

  // 写之前重新量一次：打印读数与真正动手之间，客户端可能已经被打开。
  const running = clientRunning()
  if (guardApplies && running !== false) {
    console.log(running === null
      ? '拒绝：读不到进程表，无法确认客户端已关（"读不到"不等于"关着"）。'
      : '拒绝：客户端还开着。profile 补丁是热重载层，会话里写它会让正在跑的工具当场掉光 —— 先把客户端关掉再来。')
    return 3
  }

  if (mode === 'apply') {
    if (mount.present) {
      if (compare.ok && mount.duplicates === 1) {
        console.log('已经挂上了（形状与 dashboardMountRow() 逐格相同），不重复写。')
        return 0
      }
      console.log('已经有一行指向这个包，但形状不是本工具写的那种 —— 不重复写，先人工看（或 --revert 之后再来）。')
      return 4
    }
    const before = sha256(Buffer.from(text, 'utf8'))
    const folded = foldPlainContinuations(text)
    const next = folded.text + dashboardMountPayload({ root })
    const backup = writeBackup(where.file, root, profile)
    const record = writeApplyRecord({ backup, file: where.file, profile, original: text, applied: next, folds: folded.folds })
    writeAtomic(where.file, next)
    console.log(`备份      ${backup}`)
    console.log(`记录      ${record}`)
    if (folded.folds.length > 0) {
      console.log(`格式归一化 ${folded.folds.length} 处多行 plain scalar（折叠成一行，只动空白；BOOT-01/02 的读取器才读得懂）`)
      for (const fold of folded.folds) console.log(`          L${fold.line}: ${fold.from.map((l) => l.trim()).join(' ⏎ ')}`)
    }
    console.log(`已写入    ${before} → ${sha256(Buffer.from(next, 'utf8'))}（${Buffer.byteLength(next, 'utf8')} B）`)
    console.log('\n下一步（每次改完都要）：重启客户端 → 新建一个会话 → 读它的会话头 agentPreset 必须是 agenia。')
    return 0
  }

  // revert
  // 正常路径：apply 时留下了记录（原文件备份 + 应用后哈希）。当前文件 = 应用后那份 ⇒
  // 直接把备份写回去 —— 连 `--apply` 折过的 plain scalar 也逐字节还原。写完**回读**量 sha。
  const record = findApplyRecord(root, where.file, text)
  if (record !== null) {
    if (!existsSync(record.backup)) {
      console.log(`记录指向的备份不在：${record.backup} —— 不能保证逐字节还原，先人工看。`)
      return 4
    }
    const original = readFileSync(record.backup, 'utf8')
    const originalSha = sha256(Buffer.from(original, 'utf8'))
    if (originalSha !== record.original?.sha256) {
      console.log(`备份与记录里的原始哈希对不上（记录 ${record.original?.sha256} · 备份 ${originalSha}）—— 拒绝盲写。`)
      return 4
    }
    const backup = writeBackup(where.file, root, profile)
    writeAtomic(where.file, original)
    const readBack = readFileSync(where.file, 'utf8')
    const readBackSha = sha256(Buffer.from(readBack, 'utf8'))
    console.log(`备份      ${backup}`)
    console.log(`已撤掉    ${sha256(Buffer.from(text, 'utf8'))} → ${readBackSha}（${Buffer.byteLength(readBack, 'utf8')} B · 读回）`)
    if (readBackSha !== originalSha) {
      console.log(`E_REVERT_READBACK 写回之后读到的不是备份那一份（期望 ${originalSha} · 实得 ${readBackSha}）—— 立刻人工看。`)
      return 4
    }
    console.log(`与备份逐字节相同 YES（${record.backup} · 读回 sha ${readBackSha}）`)
    return 0
  }

  const stripped = stripDashboardMount(text)
  if (stripped.error !== undefined) {
    console.log(`拒绝：${stripped.error}`)
    return 4
  }
  if (!stripped.removed) {
    if (mount.present) {
      console.log('文件里有一行指向这个包，但不是本工具写的块（没有边界标记）—— 拒绝删别人的行，先人工看。')
      return 4
    }
    console.log('文件里没有本工具写的块，什么都没改。')
    return 0
  }
  const remaining = remainingDashboardReferences(stripped.text)
  if (remaining.length > 0) {
    console.log(`拒绝：撤掉本工具的块之后，文件里还有 ${remaining.length} 处指向这个包（${remaining.map((r) => `${r.placement}@L${r.line}`).join(' · ')}）—— 不是"一步撤"，先人工看。`)
    return 4
  }

  // 记录没命中（文件被老板 / 客户端 / 别的工具动过，或记录丢了），**但块还在**。
  // 只有一种情况可以写：备份目录里有一份 `.bak`，把它按 apply 的变换重建后与当前全文**逐字节相同**
  // ⇒ 那份 `.bak` 就是 apply 前的原文，写回去 = 逐字节还原。找不到就**拒绝写盘**：
  // 删块留折叠会退 0，而验收承诺的是"与备份逐字节相同"—— 半还原比不还原更难发现。
  const beforeSha = sha256(Buffer.from(text, 'utf8'))
  const preApply = findPreApplyBackup({ root, currentText: text, mount })
  if (preApply !== null) {
    const originalSha = sha256(Buffer.from(preApply.text, 'utf8'))
    const backup = writeBackup(where.file, root, profile)
    writeAtomic(where.file, preApply.text)
    const readBack = readFileSync(where.file, 'utf8')
    const readBackSha = sha256(Buffer.from(readBack, 'utf8'))
    console.log(`记录      没命中 —— 用备份 ${preApply.file}（${preApply.how}）逐字节还原`)
    console.log(`备份      ${backup}`)
    console.log(`已撤掉    ${beforeSha} → ${readBackSha}（${Buffer.byteLength(readBack, 'utf8')} B · 读回）`)
    if (readBackSha !== originalSha) {
      console.log(`E_REVERT_READBACK 写回之后读到的不是备份那一份（期望 ${originalSha} · 实得 ${readBackSha}）—— 立刻人工看。`)
      return 4
    }
    console.log(`与备份逐字节相同 YES（${preApply.file} · 读回 sha ${readBackSha}）`)
    return 0
  }
  console.log('E_REVERT_NOT_BYTE_EXACT 记录没命中，且备份目录里没有与"apply 前原文"逐字节相同的一份 —— 拒绝写盘；文件一个字节没动。')
  console.log(`当前      ${beforeSha}（${Buffer.byteLength(text, 'utf8')} B · ${where.file}）`)
  const folds = foldPlainContinuations(text).folds
  if (folds.length > 0) {
    console.log(`⚠️ 这一份 apply 时做过格式归一化：现在第 ${folds.map((fold) => `L${fold.line}`).join(' / ')} 行是折叠后的一行（原文是两行）。`
      + '只删块会把折叠留在文件里 —— 所以这次不写；折叠前的字节要从备份 / 编辑器历史 / git 里取。')
  }
  console.log('下面的 diff 是"删掉挂载块"的**唯一**一处改动；照 `-` 行手工删，再补回折叠前的行：')
  printDiff(text, stripped.text, `当前 ${where.file}`, '删掉挂载块之后（仍不是 apply 前的字节）')
  return 4
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (invokedDirectly) process.exit(main())
