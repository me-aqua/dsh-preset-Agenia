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
/** `YYYY-MM-DD` 到今天差几天。算不出来返回 undefined。 */
const ageDays = (ymd) => {
  const d = Date.parse(`${ymd}T00:00:00`)
  return Number.isNaN(d) ? undefined : Math.round((Date.parse(`${today}T00:00:00`) - d) / 86400000)
}
/** 取**第一行**里的 `YYYY-MM-DD` —— `now.md` 的时效口径就写在这一行上。 */
const firstLineDate = (text) => (/(\d{4}-\d{2}-\d{2})/.exec(text.split('\n')[0] ?? '') ?? [])[1]

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
  // ⚠️ 2026-09-22 破例一次：`tool-subagent-fork` 那一行**被关掉**（老板拍板，来历见 yml 里那段注释）
  //    ⇒ `disabled` 的行数 4 → 5。**上面三个数（37 / 5 / 1）一个没动** —— 关掉不等于删掉。
  eq('composition', 'agenia 能力行总数', agenia.length, 37)
  eq('composition', 'team-* 子行数', agenia.filter((r) => r.startsWith('team-')).length, 5)
  eq('composition', 'persona-injector 行数', agenia.filter((r) => r === 'persona-injector').length, 1)
  eq('composition', 'agent.cordis.yml 里 disabled 的行数',
    (read(ageniaFile).match(/disabled:/g) ?? []).length, 5)

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
  // 进度板按**工具名**认人（inject.js 的 TEAM_TOOL）：形状不对，那一列就静默不出现。
  // 2026-09-20 加 —— 以前账本里写死五个工具名，加岗位的人怎么改都记不到账。
  const teamTools = [...effective.matchAll(/toolName:\s*(team[_-][a-z0-9-]+)/g)].map((m) => m[1]).sort()
  const wantTools = fixed.map((r) => `team_${r}`).sort()
  yes('preset', '每条 team-* 行的 toolName 都是 team_<岗位名>（进度板按它认人）',
    teamTools.length === wantTools.length && teamTools.every((t, i) => t === wantTools[i]),
    teamTools.join(', ') + '  ↔  ' + wantTools.join(', '))
  yes('preset', '外聘挂在 tool-subagent 那一行的 persona 标记上', /【组员:hire】/.test(yml))
  // ── 2026-09-24 加：两条路的分工，以及裸 subagent 那个洞 ──────────────────
  // 来历：老板问"team_* 还有必要吗"。查下来——五条行都开着、工具单里也都在，
  // 但 2026-09-24 那天组长 **42 次起人全走裸 subagent**（9/23 用 team_* 的 8 个子会话
  // 拿到的才是 `charter:test/dev/design/review/retro`；走裸 subagent 的一律 `charter:hire`）。
  // 根因不是她懒：**六个工具的说明文字是模块生成的、逐字一样**，预设里也没一处教她走哪条。
  // 所以分工写进了 `leader.md`「叫谁走哪条路」——那一条得钉住，它掉了就没人教。
  const leaderDoc = read(join(PRESET, 'leader.md'))
  yes('preset', 'leader.md 写着"固定岗位走 team_* / 外聘走裸 subagent"这条分工',
    /team_design/.test(leaderDoc) && /team_review/.test(leaderDoc) && /外聘/.test(leaderDoc) && /`subagent`/.test(leaderDoc),
    '没写的话，六个一模一样的工具描述教不会她走哪条路（2026-09-24 实测就是这么漂的）')
  // 裸 subagent 那一行原来**没写 maxDepth** ⇒ 默认 3 ⇒ 外聘还能自己再招人
  // （跟被关掉的 subagent_fork 同一类风险）。2026-09-24 补成 1。
  const hireRow = effective.split(/- id: tool-subagent\n/)[1]?.split(/- id: /)[0] ?? ''
  yes('preset', '裸 subagent（外聘通道）那一行有 maxDepth: 1',
    /maxDepth:\s*1(\s|$)/m.test(hireRow),
    '不写就是默认 3 —— 用完就散的人还能再招人')
  // 五条固定岗位行的两个键是**刻意不是默认值**的（老板 2026-09-20 拍板）：后台跑、不许再招人。
  // 为什么值得钉：改成 `backgroundMode: one-shot` 会静默地把"组员后台跑"变回"组长被卡住"，
  // 而改 `maxDepth` 会让"组员不许再招人"这条硬边界消失 —— 两者都不报错。
  const teamRows = effective.split(/- id: team-/).slice(1)
  const bgContinuable = teamRows.filter((r) => /backgroundMode:\s*continuable/.test(r)).length
  const depthOne = teamRows.filter((r) => /maxDepth:\s*1(\s|$)/m.test(r)).length
  yes('preset', '五条 team-* 行都是 backgroundMode: continuable（组员默认后台跑）',
    teamRows.length === 5 && bgContinuable === 5, `${bgContinuable}/${teamRows.length} 行`)
  yes('preset', '五条 team-* 行都是 maxDepth: 1（组员不许再招人）',
    teamRows.length === 5 && depthOne === 5, `${depthOne}/${teamRows.length} 行`)
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

  // ── 文书与配置对账（2026-09-22 加）──────────────────────────────────────
  // 上面那些断言盯的是"文件形状"，盯不到"某份文档里的说法和配置对不上"。
  // 通读一遍时抓到两处，都是**看起来像依据的假话** —— agent 会拿它去推理，比写错事实更毒：
  //   ① `leader.md` 写着「只有你有命令行，队员都没有」，而 officeBound 只有 review + retro：
  //      design / dev / test 三个岗位既有写权限也有命令行。那句话还是"体检脚本只能你干"的论据。
  //   ② `work-guidelines.md` 与 `说明.md` 的 `.team/` 目录树漏了 `design/` —— 而 `leader.md`
  //      说的是"六个岗位的文件夹"，照那棵树建抽屉就会少建一个。
  // 两条都钉**事实**：谁不受限、树里有没有这个人。
  const docs = [
    ['leader.md', join(PRESET, 'leader.md')],
    ['work-guidelines.md', join(PRESET, 'work-guidelines.md')],
    ['persona.md', join(PRESET, 'persona.md')],
    ['说明.md', join(PRESET, '说明.md')],
    ['README.md', join(REPO, 'README.md')],
  ].filter(([, p]) => existsSync(p)).map(([label, p]) => [label, read(p)])

  // ① 「只有组长有命令行」这种说法 —— officeBound 没收走的岗位本来就都有命令行。
  //    officeBound 真把五个岗位全收走的那天，这句话就成立了，所以那时本条自动放行。
  const freeShell = fixed.filter((r) => !office.includes(r))
  const exclusive = docs
    .filter(([, t]) => /只有(你|他|她|组长)有(命令行|shell)|(队员|组员)(都)?没有(命令行|shell)/.test(t))
    .map(([f]) => f)
  yes('preset', '没有哪份文档把命令行说成组长独有（办公桌边界只收走两个岗位的 shell）',
    freeShell.length === 0 || exclusive.length === 0,
    exclusive.length > 0 && freeShell.length > 0
      ? `${exclusive.join('、')} 里仍写着"只有组长有命令行" —— 事实是 ${freeShell.join('、')} 也有`
      : `${office.join('、')} 才没有；${freeShell.join('、') || '（全部岗位）'} 本来就有`)

  // ② `.team/` 目录树：编制里的岗位一个都不许漏。漏掉的抽屉不会有人建 —— 组长是照这棵树建的。
  const trees = docs.filter(([, t]) => (t.match(/```[\s\S]*?```/g) ?? []).some((b) => b.includes('.team/')))
  const treeMiss = []
  for (const [f, t] of trees) {
    const blocks = (t.match(/```[\s\S]*?```/g) ?? []).filter((b) => b.includes('.team/'))
    const miss = fixed.filter((r) => !blocks.some((b) => b.includes(`${r}/`)))
    if (miss.length > 0) treeMiss.push(`${f} 缺 ${miss.join('、')}`)
  }
  yes('preset', '`.team/` 目录树把编制里的岗位都列了出来（漏一个就少建一个抽屉）',
    trees.length > 0 && treeMiss.length === 0,
    treeMiss.length > 0 ? treeMiss.join('；')
      : trees.length === 0 ? '一份目录树都没了 —— 组长没有可照抄的结构'
        : `${trees.map(([f]) => f).join('、')}（${fixed.join('、')} 全在）`)
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
    // ⚠️ 不要用 stdio: 'pipe' —— 受限沙箱里子进程开不了管道，会报
    // `spawnSync … EPERM`，于是这条断言变成**永远红**（2026-09-20 实测：本机如此，
    // 而它红的不是代码，是环境）。stderr 用 inherit：真出语法错时原文照打，
    // 我们这边还能拿到退出码。判据：pipe 失败 / ignore 或 inherit 通过。
    execFileSync(process.execPath, ['--check', injector], { stdio: ['ignore', 'ignore', 'inherit'] })
  } catch (err) {
    syntax = `退出码 ${String(err.status ?? '?')}（语法错原文见上面 stderr）`
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

  // ── 2026-09-24 加的两条：为什么"每轮注入"这句话当年是假的 ────────────────
  // ① 那一套是**快照**，DSH 只在文本变了才重发一条（dsh-agent-loop 的
  //    RuntimeContextProjection.project()）。实测钉过 4 小时 15 分 / 45 万 token。
  //    所以"真的每轮"靠的是尾巴那一句 —— 它走 agent.inject()，拿不到就必须出声。
  yes('injector', '尾巴提醒走 agent.inject，拿不到时会报错（不静默失效）',
    /agent\.inject\(/.test(src) && /拿不到 agent\.inject/.test(src),
    '缺了这条，人格又只剩"变了才发"的快照那一条路')

  // ② 快照里唯一会变的是 agenia:board，而板子按 team_<岗位> 认人。
  //    2026-09-24 那天组长 42 次起人全走裸 subagent ⇒ 板子恒空 ⇒ 快照一整天没变。
  //    所以起人也算"叫了人"（算外聘）—— 认的是"起过人"，不是"用哪个工具名起的"。
  yes('injector', '起人的工具（subagent）也算进板子，算外聘',
    /HIRE_TOOL = 'subagent'/.test(src) && /call\.name === HIRE_TOOL/.test(src) && /hire: '外聘'/.test(src),
    '板子只认 team_* 的话，用 subagent 起人的那些回合里快照一动不动')

  // ── 2026-09-24 加的两条：提醒得自报家门，正文得在磁盘上 ──────────────────
  // ① 提醒是作为一条 **user 消息**进请求的。不带"不是老板的消息"这半句，
  //    模型会把它当成"老板开口了"，一本正经回它一段 —— 当天实测：一个回合里回了两条。
  // ② 正文放在 reminder.md 里：ESM 缓存只锁代码，不锁 .md，所以**改这句不用重启 harness**。
  const reminderPath = join(PRESET, 'reminder.md')
  const reminderText = existsSync(reminderPath) ? read(reminderPath) : ''
  yes('injector', '尾巴提醒自报"不是老板的消息"（否则会被当成新指令去回）',
    /不是老板的消息/.test(reminderText) || /不是老板的消息/.test(src),
    '缺了它，模型会回这条自动提醒 —— 2026-09-24 真发生过（一个回合白烧两步）')
  yes('injector', '尾巴提醒的正文住在 reminder.md（改它不用重启 harness）',
    /REMINDER_FILE/.test(src) && /reminder\.md/.test(src) && reminderText.trim().length > 0,
    '锁在代码里的话，每调一句都要重启一次 harness')
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
  add('office', '五个固定岗位 + 外聘的抽屉（缺的 = 那个岗位还没上过岗，不算红）',
    true, missing.length === 0 ? '全在' : `还没有：${missing.join(', ')}`)

  // 反过来才要命：抽屉在、预设里没有这个人 —— 读 .team/ 的人会以为组里还有他。
  // 换预设时最容易留下这种半截（旧版的 product 岗就是这么留下来的）。
  // leader 不在 team/ 里（他那一份是根目录的 leader.md），但队里当然有他。
  const known = [...presetRoles, 'leader']
  // `_archive/` 是归档旧岗位的地方（2026-09-20：`product/` → `_archive/product/`）。
  // **归档不是幽灵** —— 幽灵指的是"读 .team/ 的人会以为组里还有他"；归档明说了它不在编制里。
  // ⚠️ 2026-09-20 收窄：`deliverables` / `tmp` / `tmp-kit` 都从白名单里去掉了 ——
  //    那是上一代的结构（老板拍板"每人一个日期抽屉就够了"，`deliverables/` 已归档）。
  //    现在除归档外，`.team/` 下**只许**出现编制里的岗位。
  const housework = ['_archive']
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

  // ★ now.md 的时效（2026-09-22 加，**只报不红**）。
  // 来历：`now.md` 的规矩是"每天开工整个重写"，但**没有任何东西量过它到底多久没动**——
  // 于是 2026-09-21 全天零活动（`git log` 没有那天的提交、`~/.dsh/sessions` 里没有那天的目录）
  // 这件事，脚本一个字都没说。量尺缺了，纪律就只剩"我记得"。
  //
  // 口径落在**第一行**：`# now（YYYY-MM-DD · 一句话）`。不写日期 = 没人知道这一页是哪天的。
  // ⚠️ 为什么先只报不红：约定刚立，历史那几页的第一行格式对不上（有的写名字、有的写别的话），
  //    现在判红等于把"格式迁移"伪装成"违纪"，红一片之后这张表就没人看了。
  //    翻面条件：**连续两个工作日、五个固定岗位的第一行都带着当天的日期**，再把下面每行换成 yes。
  //    （和下面「今天的复盘在」同款：先钉事实，够稳了再钉纪律。）
  //
  // 翻面不能靠谁记得查 —— 所以先给一行**计数**，它自己会说"还有多远"。
  // 分母是"五个固定岗位里已经有 now.md 的那几份"：抽屉是懒建的，没上过岗的岗位没有这一页，
  // 拿它当分母，会让这条永远到不了满分（而分不动的量尺等于没有量尺）。
  const fixedRoles = presetRoles.filter((r) => r !== 'hire')
  const dated = fixedRoles.filter((r) => existsSync(join(teamRoot, r, 'now.md')))
  const fresh = dated.filter((r) => ageDays(firstLineDate(read(join(teamRoot, r, 'now.md')))) === 0)
  add('office', 'now.md 第一行是今天日期的岗位数（翻面信号，只报不红）', true,
    `${fresh.length}/${dated.length} —— 五个固定岗位里已经有 now.md 的那几份`)
  for (const r of [...presetRoles, 'leader']) {
    const p = join(teamRoot, r, 'now.md')
    if (!existsSync(p)) continue
    const ymd = firstLineDate(read(p))
    const age = ymd === undefined ? undefined : ageDays(ymd)
    const detail = ymd === undefined
      ? '第一行没写日期 —— 约定是 `# now（YYYY-MM-DD · 一句话）`'
      : age < 0 ? `写的是 ${ymd}（将来）`
        : age === 0 ? `今天（${ymd}）` : `${age} 天前（${ymd}）`
    add('office', `${r} 的 now.md 有多旧（只报不红）`, true, detail)
  }

  // ★ 承重的一条：今天的复盘在不在。
  // 这一条是"半硬方案"里唯一能**在没人记得的时候自己响**的形态 ——
  // 所以它必须留在这儿，而且必须为绿。红了不要删它，去叫流程位补。
  const review = join(teamRoot, 'retro', today, '每日复盘.md')
  yes('office', `今天的复盘在（.team/retro/${today}/每日复盘.md）`, existsSync(review),
    '开工第一步该由流程位做一份覆盖「上次复盘到现在」的复盘；不在 ⇒ 叫流程位补，'
    + '一次覆盖整段（别按天补、别按票叫）')
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

// ── 4b · 仓库根：不是草稿纸（2026-09-20 加）────────────────────────────────
// 来历：一次真回合把 `probe-note.txt` 留在了项目根，`git status` 里是 `??`，
// 而当时脚本一个字都没说。组长的原话：「这就是"文件在"和"文件被管着"的差别。」
// 判据是**白名单**：加一个新文件就把它加进这张表 —— 这一步本身就是提醒。
{
  const allowed = new Set([
    '.git', '.gitattributes', '.gitignore',
    '.team', '.tools', '.workbuddy',
    'AGENTS.md', 'AGENTS.local.md',
    'INSTALL.md', 'LICENSE', 'README.md',
    'api.txt',
    'presets',
  ])
  const stray = readdirSync(REPO).filter((n) => !allowed.has(n))
  yes('repo', '仓库根只许出现白名单里的条目（临时文件当场红）', stray.length === 0,
    stray.length === 0 ? `白名单 ${allowed.size} 项，干净` : `多出来：${stray.join(', ')} —— 删掉，或者加进 check-notes.mjs 的白名单`)
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
  // 交付路径不许依赖 roots 登记：拷文件夹才是装法。
  // 名字原来写的是「预设不靠 roots 登记」—— 那是**结论**，量到的其实是"目录里没有那个补丁文件"。
  // 判据和名字对不上的断言，红的时候会把人引去查 roots。
  yes('host', '预设目录里没有 cordis.patch.yml（拷文件夹就能装）',
    !existsSync(join(PRESET, 'cordis.patch.yml')))
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
