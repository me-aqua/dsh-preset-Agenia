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
 *   node .tools/mount-dashboard-profile.mjs --apply          # 挂上（要客户端已关；只追加那一块，**不做格式改动**）
 *   node .tools/mount-dashboard-profile.mjs --revert         # 撤掉（要客户端已关；**只写"能逐字节还原"的那一次**）
 *
 * `--apply` 只做一件事：在文件末尾追加 `\n` + 挂载块。**不再折叠多行 plain scalar** ——
 * 测试侧的窄口径读取器已经支持那种形状（`tests/agenia-upgrade/support/composition.mjs`）；
 * 折叠是当年绕读取器盲区的兼容动作，已经退休。旧记录（`folds` 非空、盘上那份是折叠过的）
 * 仍然能逐字节还原：记录命中走备份；记录丢失走 `findPreApplyBackup()` 的"折叠后"那一支。
 *
 * `--revert` 两种情形分开：
 *   · apply 记录命中 ⇒ 把备份写回去（写完回读验 sha）；
 *   · 记录没命中（文件被动过 / 记录丢了）⇒ 只有备份目录里有一份 `.bak` 按 apply 的变换重建后
 *     与当前全文逐字节相同才写（逐字节还原）；否则**拒绝写盘、退 4**，并打出"要删哪几行"的 diff。
 *     绝不做"删块留折叠"的半还原。
 *
 * 备份目录是**稳定**的（默认 `<root>/.team/leader/backup`，不按天分）⇒ 23:59 apply / 00:01 revert
 * 也能找到同一份记录 / 备份。`--apply` 把**备份文件路径**与**记录文件路径**逐条打出来（给人抄），
 * `--revert` 第一行打**它到底在哪个目录里找**（`查找目录 …`）—— 找不到时不用猜。
 *
 * 可选：`--profile <名字>`（默认 desktop）· `--file <绝对路径>` / `--file=<绝对路径>`
 *       （默认本机那份 profile 补丁；**必须带值**：裸 `--file` / `--file=` 是参数错，退 6；
 *         `--file` 后面跟另一个 flag 也是参数错；**任何其它 `--file*` 形状**（`--files`、`--filex`…）
 *         **一律拒绝**（`E_PARAM_FILE_UNKNOWN_FORM`），不静默回落到现役；
 *         显式给副本时不上进程锁，但**解析出的路径等于现役路径时照样上锁**）
 *       `--root <工作区>`（默认 E:/Harness，写进那一行的 config.root；也是默认备份目录的根）
 *       `--backup-dir <目录>`（默认 `<root>/.team/leader/backup`；跨天 / 旧版按天目录时显式指过来）
 *
 * 退出码：0 挂载成立 / 已经挂上 / 已撤掉 · 1 没挂 · 2 补丁读不到 ·
 *         3 客户端还开着（拒绝写）· 4 形状 / 包事实 / 标记块不对，或回退做不到逐字节（拒绝写）·
 *         6 参数错（裸 `--file` / `--file=` / 值像另一个 flag / 重复给 `--file` / 不认识的 `--file*`）
 *
 * ── 已知边界（**不是保证**，别把它们当判据读）──────────────────────────────────
 * ① **路径比较是字符串比较，不认链接**：`isLivePath` 只比 `path.resolve(...).toLowerCase()`。
 *    一个 junction / symlink / 硬链接指到现役那份文件时，这里会把它当"副本"（`scope 副本`、
 *    不上进程锁）—— 写穿到现役仍然可能发生。要堵这一格得比 `realpath` / 文件身份（dev+ino），
 *    这一版没做。
 * ② **进程保险按进程名**：`clientRunning()` 只匹配 `DeepSeek Harness|dsh-desktop`。换入口、改名、
 *    或另一个 `node` 宿主持有同一份 profile 时，它返回"关着"，apply 照写。
 * ③ 上面两条都**不在 `.tools` 这一层能关死**；能用的是人工前提"客户端真的关着"。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileAtomic } from '../presets/agenia/lib/atomic.mjs'
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
 * `--file` 的取值。**只认两种写法**：`--file <值>` 与 `--file=<值>`。
 *
 * 裸 `--file` / `--file=` / 值像另一个 flag 都是参数错；**任何其它 `--file*` 形状**
 * （`--files` / `--filex` / `--file-…`）也是参数错。旧版让这些形状"不是 `--file`"，
 * 于是静默回落到现役路径 —— 写热重载层，而且不看进程。这里把"没给"和"给了但形状不认"分开。
 *
 * @returns {{given: boolean, value: string|null, form?: string, error?: string, arg?: string}}
 */
function fileArg() {
  const exact = []
  for (let i = 0; i < ARGV.length; i += 1) if (ARGV[i] === '--file') exact.push(i)
  const eq = ARGV.filter((a) => /^--file=/.test(a))
  const unknown = ARGV.filter((a) => /^--file/.test(a) && a !== '--file' && !/^--file=/.test(a))
  if (unknown.length > 0) return { given: true, value: null, error: 'E_PARAM_FILE_UNKNOWN_FORM', arg: unknown[0] }
  if (exact.length + eq.length > 1) return { given: true, value: null, error: 'E_PARAM_FILE_REPEATED' }
  if (exact.length + eq.length === 0) return { given: false, value: null }
  if (eq.length === 1) {
    const value = /^--file=([\s\S]*)$/.exec(eq[0])[1]
    return value.trim() === ''
      ? { given: true, value: null, form: '--file=', error: 'E_PARAM_FILE_WITHOUT_VALUE' }
      : { given: true, value, form: '--file=' }
  }
  const value = exact[0] + 1 < ARGV.length ? ARGV[exact[0] + 1] : null
  if (value === null || value.startsWith('--')) {
    return { given: true, value: null, form: '--file', error: 'E_PARAM_FILE_WITHOUT_VALUE' }
  }
  return { given: true, value, form: '--file' }
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
    if (file.value === null) return { file: null, source: file.form ?? '--file', error: file.error ?? 'E_PARAM_FILE_WITHOUT_VALUE' }
    return { file: path.resolve(file.value), source: file.form ?? '--file' }
  }
  return liveProfilePatchPath()
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').toUpperCase()

/** 客户端还开着吗 —— 以进程名为准（这台机器上是 `DeepSeek Harness`；**这是已知边界**，见文件头）。 */
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

/**
 * 备份 / 记录目录 —— **稳定**目录，不按天分。
 *
 * 按天分目录会让"23:59 apply / 00:01 revert"找不到同一份记录（旧版就是这样退 4）。
 * 现在默认 `<root>/.team/leader/backup`；文件名里带 apply 的时刻，记录里也有 `at`。
 * `--backup-dir` 仍然可以显式指到别处（副本实验 / 旧版按天目录）。
 */
function backupDirOf(root) {
  const explicit = opt('--backup-dir', null)
  if (explicit !== null) return path.resolve(explicit)
  return path.join(root, '.team', 'leader', 'backup')
}

/** 这个目录里现在有什么（`--revert` 打给人看：它到底看了哪个目录、看到几份）。 */
function backupDirReading(dir) {
  if (!existsSync(dir)) return { dir, exists: false, records: 0, backups: 0 }
  const names = readdirSync(dir)
  return {
    dir,
    exists: true,
    records: names.filter((name) => name.endsWith('.json')).length,
    backups: names.filter((name) => name.endsWith('.bak')).length,
  }
}

function writeBackup(file, root, profile) {
  const dir = backupDirOf(root)
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dst = path.join(dir, `cordis.patch.yml.${profile}.${stamp}.bak`)
  writeFileSync(dst, readFileSync(file))
  return dst
}

/**
 * 原子写：同目录临时件 → rename —— **走共享件**（`presets/agenia/lib/atomic.mjs` 的 `writeFileAtomic`：
 * 临时件与目标同目录、`'wx'` 独占建、`fsync` 之后 `rename`、失败退避重试；半截文件不会被热重载层读到）。
 *
 * 这里不自己拼临时名：那个形状在仓库里只许有一份实现（`决议/概念表.md` 的「原子写剩余实现」按形状数它）。
 * 共享件返回 `{ok, code, message}`、不抛；本函数的调用方只认"写成 / 抛"，所以这里转成异常。
 */
function writeAtomic(file, text) {
  const written = writeFileAtomic(file, text)
  if (!written.ok) throw new Error(`${written.code}：${written.message}`)
}

const indentOf = (line) => (/^[ ]*/.exec(line) ?? [''])[0].length
const KEY_SHAPE = /^[A-Za-z0-9_$@.\-/]+\s*:/
const SCALAR_KEY = /^(\s*)([A-Za-z0-9_$@.\-/]+):\s+(.*\S)\s*$/

/**
 * 把**多行 plain scalar** 折成一行 —— 只动空白，不改值。
 *
 * 今天唯一的用途是**旧记录兼容**：2026-11-05 之前的 `--apply` 会先把这种形状折成一行再挂
 * （当年测试侧的窄口径读取器还不支持多行 plain scalar）。读取器修好之后 `--apply` 不再折叠；
 * 但"记录丢了、盘上那份是折叠过的"这种旧文件，`findPreApplyBackup()` 仍要靠这一支把备份
 * 还原成当时的应用后文本，再**逐字节**判定。新代码路径不再调用它的写盘侧。
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

function findApplyRecord(root, file, currentText, dir = backupDirOf(root)) {
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
 * 对每一份 `.bak` 试两种重建再拼上本次 apply 会追加的那段 payload，与当前全文逐字节相同
 * ⇒ 那份 `.bak` 就是 apply 前的原文，可以安全写回去：
 *   · `未折叠`：现行 apply 只追加那一块；
 *   · `折叠后`：**旧记录兼容** —— 当年 apply 会先把多行 plain scalar 折成一行（已退休），
 *     那种记录丢了的旧文件只有把候选备份按同一支折叠再拼 payload 才对得上。
 * 一份都对不上 ⇒ null（调用方**拒绝写盘**，不删块留折叠）。
 *
 * @returns {{file: string, text: string, how: string}|null}
 */
function findPreApplyBackup({ root, currentText, mount, dir = backupDirOf(root) }) {
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
    if (`${foldPlainContinuations(candidate).text}${payload}` === currentText) return { file, text: candidate, how: '折叠后（旧记录兼容）' }
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
  // 多行 plain scalar 只是一条**读数**：测试侧的窄口径读取器已经支持这种形状，
  // 它不参与 `--check` 的退出码，`--apply` 也不再折叠它（折叠已退休，旧记录仍可逐字节还原）。
  const folds = foldPlainContinuations(text).folds
  if (folds.length > 0) {
    console.log(`多行 plain scalar ${folds.length} 处（${folds.map((fold) => `L${fold.line}`).join(' / ')}）—— 读取器已支持；--apply 不折叠`)
  }
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
  if (file.given && file.error !== undefined) {
    const message = {
      E_PARAM_FILE_WITHOUT_VALUE: `${file.form ?? '--file'} 没有值 —— 它不是"用现役路径"，是参数错；要给路径（或整条 --file 去掉）。`,
      E_PARAM_FILE_UNKNOWN_FORM: `不认识的 --file 形状：${file.arg} —— 只认 \`--file <路径>\` 与 \`--file=<路径>\`；不会回落到现役路径。`,
      E_PARAM_FILE_REPEATED: '`--file` 给了不止一次 —— 不知道该用哪一个；只给一次。',
    }[file.error] ?? '`--file` 参数错'
    console.log(`${file.error} ${message}`)
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
    // 只追加那一块：**不做格式改动**。折叠当年是为绕测试读取器的盲区，读取器已经支持那种形状，
    // 折叠在 2026-11-05 这一版退休（旧记录里带 folds 的那一份仍然能逐字节还原）。
    const next = text + dashboardMountPayload({ root })
    const dir = backupDirOf(root)
    const backup = writeBackup(where.file, root, profile)
    const record = writeApplyRecord({ backup, file: where.file, profile, original: text, applied: next, folds: [] })
    writeAtomic(where.file, next)
    console.log(`备份      ${backup}`)
    console.log(`记录      ${record}`)
    console.log(`备份目录  ${dir}（稳定目录，不按天分；--revert 默认看同一个目录）`)
    console.log(`折叠      不做（只追加挂载块；旧记录里的折叠仍能逐字节还原）`)
    console.log(`已写入    ${before} → ${sha256(Buffer.from(next, 'utf8'))}（${Buffer.byteLength(next, 'utf8')} B）`)
    console.log('\n下一步（每次改完都要）：重启客户端 → 新建一个会话 → 读它的会话头 agentPreset 必须是 agenia。')
    return 0
  }

  // revert
  // 正常路径：apply 时留下了记录（原文件备份 + 应用后哈希）。当前文件 = 应用后那份 ⇒
  // 直接把备份写回去 —— 连旧版 `--apply` 折过的 plain scalar 也逐字节还原。写完**回读**量 sha。
  const dir = backupDirOf(root)
  const dirReading = backupDirReading(dir)
  console.log(`查找目录  ${dir}${dirReading.exists ? `（记录 ${dirReading.records} 份 · 备份 ${dirReading.backups} 份）` : '（目录不存在）'}`
    + ' —— 跨天不变；旧版按天目录用 --backup-dir 指过来')
  const record = findApplyRecord(root, where.file, text, dir)
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
  const preApply = findPreApplyBackup({ root, currentText: text, mount, dir })
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
  console.log(`查找目录  ${dir}（记录 ${dirReading.records} 份 · 备份 ${dirReading.backups} 份）`)
  console.log(`当前      ${beforeSha}（${Buffer.byteLength(text, 'utf8')} B · ${where.file}）`)
  if (!dirReading.exists) {
    console.log(`提示      这个目录不存在。若 apply 是旧版（按天目录）跑的，用 --backup-dir <那一天的目录> 指过来。`)
  }
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
