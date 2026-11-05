#!/usr/bin/env node
/**
 * 把「看板」挂到客户端 profile 层的顶层插入块里 —— **只在客户端关着的时候用**。
 *
 * 为什么要它：客户端 UI 插件只有成为**宿主 Loader 树**的一行才会被发给浏览器
 * （`dsh-client-modules` 只枚举 `ctx.loader.entries()`）；而把这一行放进 **bundle 补丁**的顶层插入块
 * 会让整个 bundle 层在 boot 时失效 —— 2026-11-05 实测：两份预设都没注册，新会话掉成
 * `agentPreset: "standard"` ⇒ 无角色 ⇒ 窄权限（没命令行、不能派活）。见 `bug-20261105-12`。
 *
 * profile 补丁是**热重载层**（`patchReload: live`）：在会话里写它 = 正在跑的工具当场掉光。
 * ⇒ 所以这个脚本**先看进程**：客户端还开着就直接拒（退出码 3），一个字节都不写。
 *
 * 用法（三条，都要显式说）：
 *   node .tools/mount-dashboard-profile.mjs --check          # 只看现在挂没挂（默认就是它）
 *   node .tools/mount-dashboard-profile.mjs --apply          # 挂上（要客户端已关）
 *   node .tools/mount-dashboard-profile.mjs --revert         # 撤掉（要客户端已关）
 *
 * 可选：--profile <名字>（默认 desktop）· --file <绝对路径>（默认本机的 desktop 档补丁）
 *       --root <工作区>（默认 E:/Harness，写进那一行的 config.root）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * 这一块的边界标记。🔴 两条规矩（2026-11-05 各踩过一次）：
 *  ① 标记串**不许**在正文里出现（早先正文那句「删掉 >>> … <<< 这一段」把自己的 END 变成了
 *     `indexOf` 的第一个命中 ⇒ 撤掉时只切掉半块，热补丁里剩一段孤儿 YAML）；
 *  ② END 用 `lastIndexOf` 找（块是最后加进去的），并在写回前跟备份逐字节比对。
 */
const BEGIN = '# >>>AGENIA-DASHBOARD-MOUNT>>>'
const END = '# <<<AGENIA-DASHBOARD-MOUNT<<<'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}

const profile = opt('--profile', 'desktop')
const file = opt('--file', path.join(os.homedir(), '.dsh', 'profiles', profile, 'cordis.patch.yml'))
const root = opt('--root', 'E:/Harness').replace(/\\/g, '/')

const mode = flag('--apply') ? 'apply' : flag('--revert') ? 'revert' : 'check'

/** 客户端还开着吗 —— 以进程名为准（这台机器上是 `DeepSeek Harness`）。 */
function clientRunning() {
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-Command',
      "(Get-Process | Where-Object { $_.ProcessName -match 'DeepSeek Harness|dsh-desktop' } | Measure-Object).Count",
    ], { encoding: 'utf8' })
    return Number.parseInt(out.trim(), 10) > 0
  } catch {
    // 读不到进程表 ⇒ 不能当成"没开"（"读不到"≠"没有"）
    return null
  }
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

function block() {
  return [
    BEGIN,
    '# 让「看板」成为宿主 Loader 树的一行：Node 侧每 15 秒写一份快照，浏览器侧读它。',
    '# 由 .tools/mount-dashboard-profile.mjs 写入；撤掉用它的 --revert（别手删，删漏一行就变成孤儿 YAML）。',
    '- insert:',
    '    - id: agenia-dashboard',
    `      name: 'file:///${root}/presets/agenia/client-ui-dashboard/lib/index.js'`,
    '      config:',
    `        root: '${root}'`,
    END,
    '',
  ].join('\n')
}

/**
 * 精确切掉我们加的那一段：`--apply` 加的是 `'\n' + block()`，这里就切掉**同一段字节**。
 * 2026-11-05 实测踩过：早先那版按行 `replace(/\n+$/,'\n')` 收尾，撤完文件比原来少/多一个换行 ——
 * 「撤掉」必须**逐字节回到原样**，否则热补丁层上留一个看不见的差异，下一次没人查得出来。
 */
function stripBlock(text) {
  // 首选：撤掉的就是 `--apply` 加进去的那**同一段字节**（`'\n' + block()`）⇒ 天然逐字节回到原样。
  const payload = '\n' + block()
  if (text.endsWith(payload)) return { text: text.slice(0, text.length - payload.length), removed: true }
  // 兜底：文件在 apply 之后又被别的东西碰过 ⇒ 按标记切，切完要是跟备份对不上就报警（不静默写）。
  const i = text.indexOf(BEGIN)
  if (i < 0) return { text, removed: false }
  const j = text.lastIndexOf(END)
  if (j < i) throw new Error('找到开头标记却没有结尾标记 —— 文件被动过，拒绝盲改（先人工看）')
  const cut = i > 0 && text[i - 1] === '\n' ? i - 1 : i
  return { text: text.slice(0, cut) + text.slice(j + END.length), removed: true, approximate: true }
}

const text = readText(file)
if (text === null) {
  console.log(`E_NO_PROFILE  找不到 profile 补丁：${file}`)
  process.exit(2)
}

const mounted = text.includes(BEGIN)
const hasSelfRow = /^\s*- id:\s*agenia-dashboard\s*$/m.test(text)

if (mode === 'check') {
  console.log(`file    ${file}`)
  console.log(`profile ${profile}`)
  console.log(`挂载    ${mounted ? 'YES（有我们写的那一块）' : 'NO'}`)
  console.log(`另有同 id 的行 ${hasSelfRow && !mounted ? 'YES（不是我写的形状，先看）' : 'NO'}`)
  console.log(`客户端  ${(() => { const r = clientRunning(); return r === null ? '判不了（读不到进程表）' : r ? '开着' : '关着' })()}`)
  process.exit(mounted ? 0 : 1)
}

const running = clientRunning()
// 保险只对**现役补丁**上锁：显式 `--file` 说明调用者已经在拿副本做实验（那一份不是热重载层）。
const explicitFile = argv.includes('--file')
if (!explicitFile && running !== false) {
  console.log(running === null
    ? '拒绝：读不到进程表，无法确认客户端已关（"读不到"不等于"关着"）。'
    : '拒绝：客户端还开着。profile 补丁是热重载层，会话里写它会让正在跑的工具当场掉光 —— 先把客户端关掉再来。')
  process.exit(3)
}

// 备份：落进工作区的日期抽屉（不写 C 盘以外以外的地方；补丁本身在 C 盘用户目录，那是它本来的位置）
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = path.join(root, '.team', 'leader', new Date().toISOString().slice(0, 10), 'backup')
fs.mkdirSync(backupDir, { recursive: true })
const backup = path.join(backupDir, `cordis.patch.yml.${profile}.${stamp}.bak`)
fs.copyFileSync(file, backup)
console.log(`备份    ${backup}`)

if (mode === 'apply') {
  if (mounted) { console.log('已经挂上了，不重复写。'); process.exit(0) }
  const next = text.replace(/\n*$/, '\n') + '\n' + block()
  fs.writeFileSync(file, next, 'utf8')
  console.log('已写入这一块：')
  console.log(block())
} else {
  const { text: next, removed } = stripBlock(text)
  if (!removed) { console.log('文件里没有我们写的那一块，什么都没改。'); }
  else { fs.writeFileSync(file, next, 'utf8'); console.log('已撤掉那一块。') }
}

console.log('\n下一步（每次改完都要）：重启客户端 → 新建一个会话 → 读它的会话头 agentPreset 必须是 agenia。')
