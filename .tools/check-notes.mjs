#!/usr/bin/env node
// 把仓库里写下的事实与磁盘现状逐条对账。
//
// 每一条断言回答同一个问题：笔记里那句话，今天还成立吗？
// 只放**能变成断言**的事实 —— 判断与取舍归文档，数字、路径、结构归这里。
//
// 跑法：<node.exe> .tools/check-notes.mjs
// 退出码：0 全绿 / 1 有红。红的每一条都给出「笔记写的是」与「现在量到的是」。
//
// ⚠️ 2026-09-20 改版：旧预设（process.md / persona-plugin/ / world.md / product 岗）
//    已被新版替换。这一版盯的是新结构 —— 见 presets/agenia/ 与 README.md「文件」一节。

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PRESET = join(REPO, 'presets', 'agenia')
const HOME = process.env.USERPROFILE ?? process.env.HOME
const PROFILES = join(HOME, '.dsh', 'profiles')

/**
 * 出厂预设随 dsh 本体发布。本机是 npx 装的那一份，缓存目录名里带哈希、会变，
 * 所以按 glob 找，不写死那串哈希（写死过，升级一次就找不到）。
 */
function shippedPresets() {
  const cache = join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx')
  if (!existsSync(cache)) return undefined
  for (const entry of readdirSync(cache)) {
    const p = join(cache, entry, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets')
    if (existsSync(p)) return p
  }
  return undefined
}

const rows = []
const add = (family, name, ok, detail) => rows.push({ family, name, ok, detail })
const eq = (family, name, got, want) =>
  add(family, name, got === want, `笔记 ${want} / 实测 ${got}`)
const yes = (family, name, cond, detail = '') => add(family, name, cond, detail)

const read = (p) => readFileSync(p, 'utf8')
// 只数汉字：上限说的是"字"，全角标点、英文、markdown 记号不算字。
const hanCount = (text) => (text.match(/[\u4e00-\u9fff]/g) ?? []).length
// yml 里每一行能力行 —— 顶层两格、组内四格，两种缩进都收。
const idLines = (text) => (text.match(/^\s*- id: .+$/gm) ?? []).map((l) => l.trim().slice(6).trim())

/** 今天 / 昨天，按本机时区算。 */
const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = stamp(new Date())

// ── 1 · 能力行：集合比对，不是肉眼比对 ──────────────────────────────────────
// 规矩见 README「和能力的关系」：**standard 有的必须有、多出来的每一项都要写下来**。
{
  const ageniaFile = join(PRESET, 'agent.cordis.yml')
  const multi = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())
  const diff = (a, b) => {
    const [ma, mb, out] = [multi(a), multi(b), []]
    for (const [k, n] of ma) for (let i = n - (mb.get(k) ?? 0); i > 0; i--) out.push(k)
    return out.sort()
  }

  const agenia = idLines(read(ageniaFile))
  const shipped = shippedPresets()

  // 换到新预设后这几个数没变过（2026-09-20 实测）—— 换的是谁在建队，不是队伍大小。
  eq('composition', 'agenia 能力行总数', agenia.length, 37)
  eq('composition', 'team-* 子行数', agenia.filter((r) => r.startsWith('team-')).length, 5)
  eq('composition', 'persona-injector 行数', agenia.filter((r) => r === 'persona-injector').length, 1)
  eq('composition', 'agent.cordis.yml 里 disabled 的行数',
    (read(ageniaFile).match(/disabled:/g) ?? []).length, 4)

  if (shipped === undefined) {
    add('composition', '找得到出厂预设目录', false, 'npm-cache/_npx/*/node_modules/@deepseek-ai/dsh-agent-presets/presets 里没找到')
  } else {
    const stdFile = join(shipped, 'standard', 'agent.cordis.yml')
    if (!existsSync(stdFile)) {
      add('composition', '找得到出厂 standard 预设', false, `找不到 ${stdFile}`)
    } else {
      const std = idLines(read(stdFile))
      eq('composition', 'standard 能力行总数', std.length, 31)
      const onlyStd = diff(std, agenia)
      const onlyAge = diff(agenia, std)
      yes('composition', 'onlyInStandard 为空', onlyStd.length === 0, onlyStd.join(', ') || '空')
      eq('composition', 'onlyInAgenia 项数', onlyAge.length, 6)
      // 这一行是"多出来的每一项都要写下来"的执行点：明细必须正好是这六项。
      // 名单变过（product → design，2026-09-20），但**项数一直是 6**。
      const want = ['persona-injector', 'team-design', 'team-dev', 'team-retro', 'team-review', 'team-test']
      yes('composition', 'onlyInAgenia 明细 = persona-injector + 五个固定岗位行',
        onlyAge.length === want.length && onlyAge.every((x, i) => x === want[i]),
        onlyAge.join(', ') || '空（只有 persona 遮蔽行时说明岗位行丢了）')

      // README「和能力的关系」是全体广播那段，它写错一个数四天里没人发现过。
      // 用反向断言：只拦"又写回八项"，不管它怎么措辞 —— 正向那句是散文，钉不住。
      const readme = join(REPO, 'README.md')
      if (existsSync(readme)) {
        yes('composition', 'README 不再说差异是"八项"',
          !/(这八项|差异是八行|差异是八项)/.test(read(readme)), '文书与实测 6 项对不上')
      }
    }
  }
}

// ── 2 · 预设自身的形状 ─────────────────────────────────────────────────────
{
  const yml = read(join(PRESET, 'agent.cordis.yml'))
  // 查"配置值里有没有"的时候只看**有效行** —— 注释里提一句名字不算（那是给人看的）。
  const effective = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  const teamDir = join(PRESET, 'team')
  const files = readdirSync(teamDir).filter((f) => f.endsWith('.md'))
  const roles = files.map((f) => f.slice(0, -3)).sort()

  eq('preset', 'team/ 下的岗位说明书份数', files.length, 6)
  yes('preset', '目录名合法（[a-z0-9][a-z0-9-]*）', /^[a-z0-9][a-z0-9-]*$/.test('agenia'))

  // 岗位表有两处：team/ 里的 .md 和 yml 里的 team-* 行。两处对不上就是"加了岗位只改了一处"。
  // 这是这份预设里最容易漂的地方 —— 说明书加了、能力行没加，启动时整队一起挂。
  //
  // ⚠️ 临时外聘不算：他不是固定编制，没有 team-hire 那一行，
  //    他挂在 tool-subagent 的 persona 标记上（下面单独断言）。
  const fixed = roles.filter((r) => r !== 'hire')
  const ymlRoles = idLines(yml).filter((r) => r.startsWith('team-')).map((r) => r.slice(5)).sort()
  yes('preset', 'team/ 的文件与 yml 里的 team-* 行一一对应（外聘除外）',
    ymlRoles.length === fixed.length && ymlRoles.every((r, i) => r === fixed[i]),
    fixed.join(', ') + '  ↔  ' + ymlRoles.join(', '))
  yes('preset', '外聘挂在 tool-subagent 那一行的 persona 标记上', /【组员:hire】/.test(yml))
  // 每个固定岗位的能力行都要带自己的标记 —— 少了它，那个人会以为自己是组长。
  const marks = (effective.match(/【组员:[a-z0-9-]+】/g) ?? []).map((m) => m.slice(4, -1)).sort()
  const wantMarks = [...roles].sort()
  yes('preset', '每个岗位文件都有对应的【组员:xx】标记',
    marks.length === wantMarks.length && marks.every((m, i) => m === wantMarks[i]),
    marks.join(', ') + '  ↔  ' + wantMarks.join(', '))

  // 旧结构的残留 —— 换预设时最容易留下半截。
  for (const gone of ['process.md', 'DESIGN.md', 'codebase-practices.md', 'persona-plugin']) {
    yes('preset', `旧结构已清干净：没有 ${gone}`, !existsSync(join(PRESET, gone)))
  }
  for (const gone of ['world.md', 'product.md']) {
    yes('preset', `旧结构已清干净：team/ 下没有 ${gone}`, !files.includes(gone))
  }

  // 插件现在直接住在预设根目录，跟着文件夹走。
  yes('preset', '插件行是预设相对路径 ./inject.js',
    /name:\s*'\.\/inject\.js'/.test(yml), '写成裸包名就不再跟着文件夹走')
  yes('preset', '插件入口文件在预设根目录', existsSync(join(PRESET, 'inject.js')))
  const pkg = JSON.parse(read(join(PRESET, 'package.json')))
  // 少了 version：每次请求都报 REQUEST_EXTENSION（AGENTS.md 3b）。
  yes('preset', 'package.json 有非空 name', typeof pkg.name === 'string' && pkg.name.length > 0)
  yes('preset', 'package.json 有非空 version', typeof pkg.version === 'string' && pkg.version.length > 0)
  yes('preset', 'package.json 声明 type: module', pkg.type === 'module')

  // 名字、年龄、脾气只准住在 persona.md。YAML 里出现人名 = 有了第二份来源。
  const names = ['Agenia', '莉薇', 'Liv', '佐西亚', 'Zofia', '玛尔塔', 'Marta', '伊莫金', 'Imogen', '阿玛拉', 'Amara']
  const leaked = names.filter((n) => effective.includes(n))
  yes('preset', 'agent.cordis.yml 的配置值里没有人格内容（名字一个都不许有）',
    leaked.length === 0, leaked.join(', ') || '干净')

  // ── 每轮注入的三个配置：顺序、受众、谁受限 ────────────────────────────────
  // 只收「键下面那种 6 空格缩进的 - x」的行，收到第一个非列表行为止 ——
  // 注释行不参与，所以键之间不会互相串味。
  const block = yml.slice(yml.indexOf('id: persona-injector'))
  const orderOf = (key) => {
    const at = block.indexOf(`\n    ${key}:`)
    if (at < 0) return []
    const out = []
    for (const line of block.slice(at + 1).split('\n').slice(1)) {
      const hit = /^ {6}- ([a-z0-9:-]+)\s*(?:#.*)?$/.exec(line)
      if (hit !== null) { out.push(hit[1]); continue }
      if (line.trim().length === 0) continue
      break
    }
    return out
  }
  const leader = orderOf('leaderOrder')
  const member = orderOf('memberOrder')
  const office = orderOf('officeBound')

  yes('preset', 'leaderOrder 是 leader → work-guidelines → roster → board → persona',
    leader.join(',') === 'leader,work-guidelines,roster,board,persona', leader.join(' → '))
  // persona 排最后是有意的：越靠后离请求末尾越近，权重越高。
  yes('preset', 'leaderOrder 里 persona 排最后', leader[leader.length - 1] === 'persona')
  yes('preset', 'memberOrder 是 work-guidelines → charter（组员不读 leader / persona）',
    member.join(',') === 'work-guidelines,charter', member.join(' → '))
  yes('preset', 'officeBound 正好是 review + retro（只留做判断的岗位）',
    office.join(',') === 'review,retro', office.join(', ') || '（空）')

  // 受限岗位名单和队伍名单要能对上 —— 写个不存在的岗位名，那条限制永远不生效、也不报错。
  const orphan = office.filter((o) => !roles.includes(o))
  yes('preset', 'officeBound 里的岗位都真实存在', orphan.length === 0, orphan.join(', ') || '干净')
}

// ── 3 · 注入器：交付出去的那份还敢改吗 ─────────────────────────────────────
// 这个文件最贵的教训是"静默失效"：挂载正常、行状态正常、人格凭空消失。
// 所以这里的断言基本都在盯"出问题的时候会不会出声"。
{
  const injector = join(PRESET, 'inject.js')
  const src = read(injector)

  // 语法错误会被 ESM 按 URL 缓存住，之后怎么修都不生效 —— 写完必须先过这一关。
  let syntax = 'ok'
  try {
    execFileSync(process.execPath, ['--check', injector], { stdio: 'pipe' })
  } catch (err) {
    syntax = String(err.stderr ?? err).split('\n').slice(0, 3).join(' ')
  }
  yes('injector', 'node --check 通过（语法错会被 ESM 缓存住）', syntax === 'ok', syntax)

  const sha = createHash('sha256').update(readFileSync(injector)).digest('hex')
  add('injector', 'inject.js 的 sha256（记进日志，不当断言）', true, sha)

  // 边界拿不到就要出声 —— 悄悄失效比明着失败更糟（旧版踩过：门禁没生效而没人知道）。
  yes('injector', '拿不到 tools.guard 时会报错（不静默失效）',
    /tools\.guard/.test(src) && /console\.error\(/.test(src), '缺了那条告警，边界失效时没人会发现')
  yes('injector', '拿不到 systemPrompt 时会报错', /拿不到提示词服务/.test(src))
  // 只看字符串的话 `.team/review/../../x.txt` 含有 `.team/` 却落在项目根 —— 必须算落点。
  yes('injector', '写边界算落点、不匹配字符串', /resolve\(/.test(src) && !/target\.includes\(/.test(src))
  yes('injector', '通用命令行在禁止名单里（bash 与 pwsh 两个都写）',
    /SHELL\s*=\s*\[[^\]]*'bash'[^\]]*'pwsh'/.test(src))
  yes('injector', '认不出岗位的 agent 一律放行（别把组长自己挡住）',
    /role === undefined \|\| !officeBound\.has\(role\)\) return undefined/.test(src))
}

// ── 4 · 队伍的地方（.team/）────────────────────────────────────────────────
{
  const gi = read(join(REPO, '.gitignore'))
  yes('office', '.gitignore 里挡住了 .team/', /^\.team\/$/m.test(gi))

  const teamRoot = join(REPO, '.team')
  const roleDirs = existsSync(teamRoot)
    ? readdirSync(teamRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : []
  const presetRoles = readdirSync(join(PRESET, 'team')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))

  // 抽屉是**懒建**的：那个岗位上过岗才有。所以缺了不红，只报 ——
  // 硬要它一开工就六个齐，等于把"以后加岗位"这件事变成八处要一起改。
  const missing = presetRoles.filter((r) => !roleDirs.includes(r))
  add('office', '六个岗位 + 外聘的抽屉（缺的 = 那个岗位还没上过岗，不算红）',
    true, missing.length === 0 ? '全在' : `还没有：${missing.join(', ')}`)

  // 反过来才要命：抽屉在、预设里没有这个人 —— 读 .team/ 的人会以为组里还有他。
  // 换预设时最容易留下这种半截（旧版的 product 岗就是这么留下来的）。
  // leader 不在 team/ 里（他那一份是根目录的 leader.md），但队里当然有他。
  const known = [...presetRoles, 'leader']
  const housework = ['deliverables', 'tmp', 'tmp-kit']
  const ghosts = roleDirs.filter((r) => !known.includes(r) && !housework.includes(r))
  add('office', '.team/ 下有没有预设之外的岗位目录（旧岗位留下的）',
    ghosts.length === 0, ghosts.length === 0 ? '干净' : `${ghosts.join(', ')} —— 改名成现在的岗位，或者归档掉`)

  // 长期记忆：上限 2000 字。新名 memory.md，兼容还没改名的那几份 must-know.md。
  // ⚠️ 上限这条规矩**不告诉组员** —— 由流程位在每日复盘时按上限缩。这里只做量尺。
  for (const d of roleDirs) {
    const p = ['memory.md', 'must-know.md'].map((f) => join(teamRoot, d, f)).find(existsSync)
    if (p === undefined) continue
    const n = hanCount(read(p))
    yes('office', `${d} 的长期记忆在上限内`, n <= 2000, `${n} 字（上限 2000）`)
  }

  // ★ 承重的一条：今天的复盘在不在。
  // 这一条是"半硬方案"里唯一能**在没人记得的时候自己响**的形态 ——
  // 所以它必须留在这儿，而且必须为绿。红了不要删它，去叫流程位补。
  const review = join(teamRoot, 'retro', today, '每日复盘.md')
  yes('office', `今天的复盘在（.team/retro/${today}/每日复盘.md）`, existsSync(review),
    '开工第一步该由流程位做一份覆盖昨天的复盘；不在 ⇒ 叫流程位（一次覆盖两天，别按票叫）')
  if (existsSync(review)) {
    const body = read(review)
    yes('office', '复盘里有「我的把握有多大」那一行', /我的把握有多大/.test(body))
    yes('office', '三块齐全（坑 / 哪一关漏的 / 原文 → 新文）',
      /哪一关/.test(body) && /原文/.test(body) && /新文/.test(body))
  }
  const days = existsSync(join(teamRoot, 'retro'))
    ? readdirSync(join(teamRoot, 'retro'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : []
  add('office', '已归档的复盘日期（只报不红）', true, days.join(', ') || '（无）')
}

// ── 5 · 这台机器的既成事实 ─────────────────────────────────────────────────
{
  const nm = join(PROFILES, 'node_modules')
  if (existsSync(nm)) {
    const n = readdirSync(nm).length
    // 记录里写的是「186 个条目」，每次启动重建 —— 数字会随 dsh 版本变，所以只报不红。
    add('host', 'profiles/node_modules 条目数（记录 186，会随版本变）', true, `实测 ${n}`)
  } else {
    add('host', 'profiles/node_modules 存在', false, '找不到 junction 农场')
  }
  const userRoot = join(HOME, '.dsh', '.agent-presets')
  add('host', '用户根 ~/.dsh/.agent-presets/ 的条目数',
    true, existsSync(userRoot) ? `${readdirSync(userRoot).length} 条` : '目录不存在')
  // 交付路径不许依赖它：拷文件夹才是装法。
  yes('host', '预设不靠 roots 登记', !existsSync(join(PRESET, 'cordis.patch.yml')))
  // 用测试架子跑过之后要还原，忘了就是个坑（见 .tools/mount-test/README.md）。
  const probe = join(HOME, '.dsh', 'profiles', 'headless', 'cordis.patch.yml')
  const probeOn = existsSync(probe) && !/^\[\]\s*$/.test(read(probe))
  yes('host', '挂载测试的补丁已还原（headless 档写回 []）', !probeOn,
    '跑完测试忘了还原，那个档的行为就被静默改掉了')
}

// ── 输出 ───────────────────────────────────────────────────────────────────
const failed = rows.filter((r) => !r.ok)
let family = ''
for (const r of rows) {
  if (r.family !== family) {
    family = r.family
    console.log(`\n── ${family} ──`)
  }
  console.log(`${r.ok ? '  ok  ' : '  RED '} ${r.name}${r.detail ? `  ·  ${r.detail}` : ''}`)
}
console.log(`\n${rows.length - failed.length}/${rows.length} 条通过`)
if (failed.length > 0) {
  console.log('\n红的是「笔记与现状对不上」。要么改笔记，要么改事实 —— 但不许两边都留着。')
  for (const r of failed) console.log(`  · ${r.family} / ${r.name} —— ${r.detail}`)
}
process.exit(failed.length > 0 ? 1 : 0)
