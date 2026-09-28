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
 * 出厂预设随 dsh 本体发布 —— **找的是那个目录，不是"某一种安装方式"**。
 *
 * 🔴 2026-09-28 换版（DSH 0.1.5 → 0.1.7）：**出厂预设搬家了，这里跟着搬。**
 *   · 旧位置 `…/node_modules/@deepseek-ai/dsh-agent-presets/presets/<id>/agent.cordis.yml`
 *     —— 那个包现在**根本不存在**了（实测 `require.resolve` 报 MODULE_NOT_FOUND）。
 *   · 新位置 `…/node_modules/@deepseek-ai/dsh-web-app/presets/<id>.patch.yml`
 *     —— 出厂四份是**四个补丁文件**，不是四个目录；`standard` 的组合本体内联在
 *        `standard.patch.yml` 里（`config.plugins:` 下面那一串），所以下面照样用
 *        `idLines()` 数行 —— **方言不同，数法相同**。
 *   · **判定形状钉在"标准模式那份在不在"上**，因为整个 composition 家族的比对都是
 *     围着它转的 —— 这正是它值得当判据的理由。
 *
 * ⚠️ **为什么原来那条会红，而且红得比看上去严重**：`shippedPresets()` 返回 undefined
 *   ⇒ 下面 `else` 那一整支（standard vs agenia 的集合比对，AGENTS.md 3b 的规矩）
 *   **整段被跳过** —— 它既绿不了也红不了。一条"找不到目录"的红，悄悄吃掉了六条断言。
 *   所以现在那条红会把**找过的每个落点**打出来，而且 `standard.patch.yml` 存在但数出
 *   0 行时另有一条红（防的是"文件还在、方言变了、正则一条都命中不了"那种假绿）。
 *
 * ⚠️ **搜索顺序 = 先找 dsh 本体在哪，再从它身边找预设**，不写死任何一种安装方式：
 *   本机 0.1.7 跑的是**全局安装**那份（`C:\Users\DAVID\AppData\Roaming\npm\node_modules`），
 *   而 0.1.5 时代是 `_npx` 缓存（目录名带哈希，会随版本变 —— 写死过，升级一次就找不到）。
 *   两条都留着：`_npx` 是上一版的形状，哪天回去跑还在。
 */
const shippedDirections = () => [
  // ① 上一版的形状：npx 缓存（哈希目录名会变，所以枚举）
  ...(existsSync(join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx'))
    ? readdirSync(join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx'))
      .map((h) => join(process.env.LOCALAPPDATA, 'npm-cache', '_npx', h, 'node_modules', '@deepseek-ai', 'dsh'))
    : []),
  // ② 本机现在的形状：全局安装
  join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@deepseek-ai', 'dsh'),
  // ③ npm 自己说的全局 root（前面两条都落空时的兜底；跑不动就跳过，不影响判定）
  (() => {
    try {
      return join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
        '@deepseek-ai', 'dsh')
    } catch { return '' }
  })(),
]

function shippedPresets() {
  for (const dsh of shippedDirections()) {
    if (dsh === '' || !existsSync(dsh)) continue
    for (const candidate of [
      join(dsh, 'node_modules', '@deepseek-ai', 'dsh-web-app', 'presets'), // 0.1.7 起
      join(dsh, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets'), // 0.1.5 的旧位置
    ]) {
      if (existsSync(join(candidate, 'standard.patch.yml'))
        || existsSync(join(candidate, 'standard', 'agent.cordis.yml'))) return candidate
    }
  }
  return undefined
}

/** 出厂 `standard` 的组合本体：新形状是补丁文件，旧形状是目录里的 agent.cordis.yml。 */
function standardComposition(dir) {
  const patch = join(dir, 'standard.patch.yml')
  if (existsSync(patch)) return patch
  const legacy = join(dir, 'standard', 'agent.cordis.yml')
  return existsSync(legacy) ? legacy : undefined
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
// 规矩在 AGENTS.md §3b：**standard 有的必须有、多出来的每一项都要写下来**。
// ⚠️ 2026-09-28：这句原来引的是 README「和能力的关系」那一节 —— **那节已经不在了**，
//    而权威数字现在住 AGENTS.md §3b。引文跟着事实走（同一条规矩管注释）。
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

  // 🔴 2026-09-28 换版（0.1.5 → 0.1.7）：**这一族数字全部重测过**（换版后第一次真的跑起来）。
  //    出厂那边：`standard` **33** 行（旧记录 31 —— 多了 `preset-standard` 那行**自声明**
  //    与 `tool-plugin-manager` 那行**关着的**外部插件管理工具）。
  //    ⚠️ `preset-standard` 是 `standard.patch.yml` 的注册行、**不是能力行**，
  //       所以下面的比对会先把它剔掉（`PRESET_DECL`）—— 不剔的话"出厂多一行"就成了假红。
  //    我们这边：**38** 行（旧记录 37）—— 换版后补了**一处漏抄**：`workflow-ptc`
  //    （编排实现；出厂有、我们没有 ⇒ `onlyInStandard` 非空，脚本自己抓到的）。
  //    ⚠️ 2026-09-22 破例一次：`tool-subagent-fork` 那一行**被关掉**（老板拍板，来历见 yml 里那段注释）
  //    ⚠️ 2026-09-28 又改一条判据：`disabled` 原来数的是**全文里 `disabled:` 出现的次数**（含注释），
  //       实测 7 处 —— 而**生效的只有 4 行**。⇒ 换成有效行判据（下面那条），数字 4。
  //    **"差异恒为六项"那个数一个没动** —— 关掉不等于删掉，补抄也不是加能力。
  eq('composition', 'agenia 能力行总数', agenia.length, 38)
  eq('composition', 'team-* 子行数', agenia.filter((r) => r.startsWith('team-')).length, 5)
  eq('composition', 'persona-injector 行数', agenia.filter((r) => r === 'persona-injector').length, 1)
  // 🔴 2026-09-28：这条原来数的是**全文里 `disabled:` 出现的次数**（含注释），
  //    实测 7 处 —— 而**生效的只有 4 行**：`tool-subagent-fork` / `tool-subagent-codex` /
  //    `tool-subagent-claude-code`（都是 `disabled: true`）+ `tool-plugin-manager`。
  //    另外两处是 `!!js` 表达式（tool-bash / tool-pwsh 的平台二选一），**不算"关着的行"**。
  //    ⇒ 换成**有效行判据**：剔掉注释行再数，而且只认 `disabled: true`。
  //    强得多：谁把某一行从"关着"改成"开着"（或者反过来），这条**当场红**，
  //    而旧的写法在注释里多写一个词就跟着漂（旧笔记里那个"5"就是这么来的）。
  const effectiveYml = read(ageniaFile).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  eq('composition', 'agent.cordis.yml 里 disabled: true 的行数（有效行，不含注释）',
    (effectiveYml.match(/^\s*disabled:\s*true\s*$/gm) ?? []).length, 4)

  // 🔴 2026-09-28 换版加：**workflow 那三行**。
  //    来历：0.1.7 把 `@deepseek-ai/dsh-workflow-worker-thread`（0.1.5 里那一行，带 provider: spawn）
  //    换掉了 —— 那个包在新版里**整个不存在**，也没有任何包再注册那个模块名。
  //    ⚠️ **我第一版修错了方向**：以为换上来的是 `@deepseek-ai/dsh-workflow`，
  //       就在组合里补了一行 `- id: workflow`。跑体检脚本当场红（`onlyInAgenia` 多出 `workflow`）——
  //       查下来那个包**不是引擎实现，是引擎的契约本身**（`class WorkflowEngine extends Service`），
  //       而且**全机没有任何补丁文件引用它**（出厂四份预设一份都没声明）。
  //       ⇒ 契约由框架自己装，preset 只声明**实现**（`workflow-ptc`）。
  //       ⇒ 「standard 有的必须有」这条**反着也成立**：standard 没有的，**别自己加**。
  //    所以这三条钉的是：老名字不许回来 · 实现行必须在 · 宿主级的契约行不许被我们抄进来。
  yes('composition', '老的 workflow-worker-thread 名字不再出现（0.1.7 里那个包已经不存在）',
    !/dsh-workflow-worker-thread/.test(effectiveYml),
    '那个包在 0.1.7 里没了 —— 写着它，这一行解析不出来，整份预设挂不起来')
  yes('composition', 'workflow-ptc 编排实现行在，且带 provider: spawn（出厂 standard 的原文）',
    /- id: workflow-ptc\n\s+name: '@deepseek-ai\/dsh-workflow-ptc'\n\s+config:\n\s+provider: spawn/.test(effectiveYml),
    '缺了它，tool-workflow 在、能编排的东西是空的（出厂 standard 有这一行）')
  yes('composition', '没有多声明宿主级的 workflow 服务契约（standard 四份预设都不声明它）',
    !/name: '@deepseek-ai\/dsh-workflow'/.test(effectiveYml),
    'dsh-workflow 是服务契约本身、由框架装；preset 只声明实现。多写一行 = onlyInAgenia 漂移')

  // 那份补丁自己的注册行（`preset-standard`）不是能力行 —— 它是"这份补丁怎么被发现"，
  // 我们那份的对应物是 `cordis.patch.yml` 里的 `preset-agenia`（在另一个文件里，进不了这个集合）。
  // 不剔掉它，`onlyInStandard` 会永远非空，而这跟"我们少抄了一行能力"完全是两回事。
  const PRESET_DECL = /^preset-/

  if (shipped === undefined) {
    add('composition', '找得到出厂预设目录', false,
      '找过这些落点，一个都没有：'
      + shippedDirections().filter((d) => d !== '').map((d) => join(d, 'node_modules', '@deepseek-ai', 'dsh-web-app', 'presets')).join(' · ')
      + ' —— 0.1.7 起出厂预设住 @deepseek-ai/dsh-web-app/presets/<id>.patch.yml')
  } else {
    const stdFile = standardComposition(shipped)
    if (stdFile === undefined) {
      add('composition', '找得到出厂 standard 预设', false,
        `${shipped} 里既没有 standard.patch.yml，也没有 standard/agent.cordis.yml`)
    } else {
      const rawStd = idLines(read(stdFile))
      eq('composition', 'standard 能力行总数（含它自己那行注册声明）', rawStd.length, 33)
      const std = rawStd.filter((r) => !PRESET_DECL.test(r))
      // 🔴 2026-09-28 补：**文件在、方言变了** ⇒ 正则可以一条都不命中，
      //    于是数出 0 行、差集变成"agenia 多出 38 项"，下面每一条都红得莫名其妙。
      //    这条把病因直接点出来（实测新方言下命中的是 33，剔掉注册行是 32）。
      yes('composition', '出厂 standard 那份数得出能力行（防"文件在、正则全哑"）',
        rawStd.length > 0,
        rawStd.length > 0
          ? `${rawStd.length} 行 · 剔掉注册行 ${std.length} 行（${stdFile}）`
          : `${stdFile} 里一条能力行都没数出来 —— 先确认它的方言还是 \`- id:\` 那种，别去改下面的数`)
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

      // 🔴 2026-09-28：**权威数字只在 AGENTS.md 一处**。
      //    换版后我先给 README 也加了这条，跑出来是红的 —— 查下来 README 里
      //    **根本没有"六项"这句话**（它那节在改写时没了），我钉的是**别处的措辞**。
      //    ⇒ 按"判据跟着事实走、不跟着文案走"：README 只留它真正说的那句
      //      （"标准模式有的工具她一样不少"），数字由 AGENTS.md 3b 那一条钉。
      //    ⚠️ AGENTS.md 写的是「这份预设相对 standard 的差异是六项」——
      //      谁把六改成七/八，或者加了能力行却不动文档，这条当场红。
      const agents = join(REPO, 'AGENTS.md')
      if (existsSync(agents)) {
        const text = read(agents)
        yes('composition', 'AGENTS.md 说差异是"六项"（3b 的规矩：多出来的必须写下来）',
          /差异是六项/.test(text) && !/(差异是八项|差异是七项|这八项)/.test(text),
          '文书与实测 6 项对不上 —— 改文档，别改这个数')
      }
      // 旧口径：只拦 README 又写回八项那一种措辞。它钉的是 README 的散文，留着。
      // 另加一条：README 那句"只会多不会少"是**对外的全称承诺**，是它唯一会误导人的话。
      const readme = join(REPO, 'README.md')
      if (existsSync(readme)) {
        const text = read(readme)
        yes('composition', 'README 不再说差异是"八项"',
          !/(这八项|差异是八行|差异是八项)/.test(text), '文书与实测 6 项对不上')
        yes('composition', 'README 里那句全称承诺还在（标准模式有的她一样不少）',
          /标准模式有的工具她一样不少/.test(text),
          'README 的"只会多不会少"没了 —— 那是这份预设对外唯一的能力承诺')
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

  yes('preset', 'leaderOrder 是 leader → work-guidelines → roster → board → persona → me-aqua → style',
    leader.join(',') === 'leader,work-guidelines,roster,board,persona,me-aqua,style', leader.join(' → '))
  // persona（她是谁）与 style（她怎么说话）排最后：越靠后离请求末尾越近，权重越高。
  // ⚠️ style **同时**是 inject.js 第 ⑤ 件事读的那个文件 —— 快照这条路和尾巴那条路读同一个文件，
  //    所以永远不会分叉（2026-09-24 老板定：不再分"开头注入的"和"每 n 步注入的"两份）。
  // ⚠️ **2026-09-26 改**：`me-aqua.md`（关于老板的那份）加在 `persona` 之后、`style` 之前
  //    —— 组长 2026-09-25 拍的（`方案清单-回滚后.md` §三.2）。这条断言跟着事实改，
  //    不是删：它仍然钉着"style 排最后"和"me-aqua 就在它前面"。
  yes('preset', 'leaderOrder 里 style 排最后、me-aqua 紧随其后（口径 13）',
    leader[leader.length - 1] === 'style' && leader[leader.length - 2] === 'me-aqua',
    leader.slice(-2).join(' → '))
  yes('preset', 'memberOrder 是 work-guidelines → charter（组员不读 leader / persona）',
    member.join(',') === 'work-guidelines,charter', member.join(' → '))

  // ── 口径 9：**每一份要送的 `.md` 都得有人送**（2026-09-26 返修加）─────────────
  // 形状：把 `leaderOrder` / `memberOrder` 里那些 key 摊开，逐个 `.md` 对过去。
  //  · `roster` / `board` 不是文件（inject.js 里算出来的正文），不参与；
  //  · `charter` 展开成 `team/<岗位>.md`（组员只拿自己那份 —— "team/ 的文件与 yml 行
  //    一一对应"另有一条断言钉着）；
  //  · ⚠️ `说明.md` **故意排除**：它是给维护的人看的，**不进提示词**（AGENTS.md §7 明写）。
  //  · ⚠️ **2026-09-26 起 `mood.md` 也排除**：它也不进快照 —— 它由 inject.js 第 ⑤ 件事读
  //    （常数 + 场景例库），贴出去的只有**分数行 + 命中的例子**，而分数**每步都在变**。
  //    进快照 = 每步重发一次 = 缓存全废（组长 2026-09-26 代拍第 3 条）。
  // 🔴 **为什么写成"目录里每一份"而不是点名排除某一份**：口径 9 要的就是"下一批接
  //    `me-aqua.md` 的时候别静默漏送"。它 2026-09-26 落进目录 **并且** 进了 `leaderOrder`
  //    ⇒ 这条现在是绿的；哪天再落一份进来而没人往名单里加，**这条当场变红**。
  const deliverable = [
    ...readdirSync(PRESET).filter((f) => f.endsWith('.md') && f !== '说明.md' && f !== 'mood.md').map((f) => f.slice(0, -3)),
    ...readdirSync(join(PRESET, 'team')).filter((f) => f.endsWith('.md')).map((f) => `team/${f.slice(0, -3)}`),
  ]
  const sentKeys = new Set([...leader, ...member])
  const unwired = deliverable.filter((key) =>
    !(sentKeys.has(key) || (key.startsWith('team/') && sentKeys.has('charter'))))
  yes('preset', '每一份要送的 `.md` 都在 leaderOrder / memberOrder 名单里（口径 9）',
    unwired.length === 0,
    unwired.length === 0
      ? `${deliverable.length} 份都有主：${deliverable.join(', ')}`
      : `没人送：${unwired.join(', ')} —— 加进 leaderOrder 或 memberOrder，别让它静默漏掉`)
  yes('preset', 'officeBound 正好是 review + retro（只留做判断的岗位）',
    office.join(',') === 'review,retro', office.join(', ') || '（空）')

  // ── 口径 1 / 2 / 9 / 13 / 14：情绪模块的内容 + `me-aqua.md`（2026-09-26 加）──────
  // ⚠️ 这几条量的是**内容文件**，判不了"分打得对不对"——那是探针 N/O/Q/D2/E2/V/X/Y/Z 族的事。
  //    这里只钉"文件在不在、机器那半边读不读得出来、三维有没有漂"。
  const moodPath = join(PRESET, 'mood.md')
  const moodText = existsSync(moodPath) ? read(moodPath) : undefined
  yes('preset', '`mood.md` 在（口径 8）', moodText !== undefined,
    moodText === undefined ? '文件不存在 —— 情绪模块没落地' : `${moodText.length} 字符`)
  const moodBlock = moodText === undefined ? null : /```mood[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(moodText)
  let moodJson
  try {
    moodJson = moodBlock === null || moodBlock === undefined ? undefined : JSON.parse(moodBlock[1])
  } catch {
    moodJson = undefined
  }
  // 🔴 **2026-09-26 晚 · 事实变了**：场景库从 6 条砍到 **3 条**（他久别归来 · 一路绿到底 · 刚炸过），
  //    所以这条从 6 改成 3 —— 改的是**事实**，不是把红改绿。
  //    `inject.js` 的 `moodConstants()` 里那个"正好几条"的校验必须同步（那半边归探针 `I9`）。
  yes('preset', '`mood.md` 里有一个 ```mood JSON 块：常数 + 恰好 3 条场景（口径 2）',
    moodJson !== undefined && Array.isArray(moodJson.scenes) && moodJson.scenes.length === 3,
    moodJson === undefined
      ? '没有这个块 / JSON 不合法'
      : `scenes = ${Array.isArray(moodJson.scenes) ? moodJson.scenes.length : '（不是数组）'}`)
  // 三维**次序也钉住**（口径 1）。
  // ⚠️ **2026-09-26 换测法**：原来是"六个名字要在**同一行**里按序出现"（正则分词比对）。
  //    老板当天精简 `mood.md`、删掉了那句一行式的声明 —— 而**事实（表格里的次序）还在**，
  //    红的是**文案**。⇒ 改成钉「**名字首次出现的先后次序**」：
  //    表格拆成几行、句子怎么措辞都不影响；**换序 / 少一维照样红**。
  //    🔴 **判据要跟着事实走，不跟着文案走。**（改前先问：我钉的是那件事，还是那句话？）
  // 🔴 **2026-09-26 晚 · 事实又变了**：情绪模块砍到**三维 = 掌控 · 疲劳 · 亲近**（口径 1）。
  //    砍掉的那几个不是"少了"，是**不许回来** ⇒ 这条同时钉两半：三个按序在 + 砍掉的一个都不出现。
  // 🔴 **2026-09-26 第三批 · 改名**：`疲劳 → 活力` · `亲近 → 亲密`（键名一个字没动）。
  //    改的是**事实**（老板当天定名），不是把红改绿 —— 旧名字那一条由下面那条"文档那半边"接着钉。
  const dimNames = ['掌控', '活力', '亲密']
  const goneDims = ['愉悦', '唤起', '新异']
  const firstAt = dimNames.map((d) => (moodText ?? '').indexOf(d))
  const missing = dimNames.filter((_, i) => firstAt[i] < 0)
  const outOfOrder = missing.length === 0 && !firstAt.every((v, i) => i === 0 || v > firstAt[i - 1])
  const backAgain = goneDims.filter((d) => (moodText ?? '').includes(d))
  yes('preset', '三维 = 掌控 · 活力 · 亲密，次序没漂、砍掉的那三个没回来（口径 1）',
    missing.length === 0 && !outOfOrder && backAgain.length === 0,
    missing.length > 0
      ? `少了：${missing.join('、')}`
      : outOfOrder
        ? `三个都在，但**次序漂了**（首次出现的位置 ${firstAt.join(' / ')}）`
        : backAgain.length > 0
          ? `砍掉的那几维又回来了：${backAgain.join('、')}`
          : `三个都在，首次出现的次序对（位置 ${firstAt.join(' / ')}）`)
  // 🔴 **2026-09-26 第三批新增 · 改名彻底（方案第七节 #6 的"体检"那半边）** ────────────
  //    老板当天把维度改叫**掌控 · 活力 · 亲密**，而**三份文档**里还写着旧名字。
  //    ⇒ 这条盯的是"**笔记与现状对不上**"：那三份是给人读的，它们不改，
  //      下一个读的人就会照旧名字去找信号（`疲劳三档` / `亲近的重逢项` 那些说法已经不成立了）。
  //    ⚠️ **只在这三份文件里判**：`mood.md` 是一个例外 —— 那是**词表**，
  //      `爱慕/亲近` 里的"亲近"是**词**、不是维度名（拿它红人是量错了东西）。
  //    ⚠️ 探针 `I15` 钉的是同一件事的**产物那半边**（真贴出去的那一行）。
  {
    // ⚠️ 路径都从 `REPO` 拼（**不看 cwd**）：从别的目录跑这个脚本时，相对路径会静默读到"没有"。
    const staleDocs = [join(REPO, 'AGENTS.md'), join(PRESET, '说明.md'), join(PRESET, 'me-aqua.md')]
    const dirty = staleDocs
      .map((p) => [p, existsSync(p) ? read(p) : undefined])
      .filter(([, t]) => t === undefined || /疲劳|亲近/.test(t))
      .map(([p, t]) => (t === undefined ? `${p}（读不到）` : `${p} 里 ${(t.match(/疲劳|亲近/g) ?? []).length} 处`))
    yes('preset', '改名彻底：`AGENTS.md` · `说明.md` · `me-aqua.md` 里旧维度名 `疲劳` / `亲近` 一个字都不剩（口径 6）',
      dirty.length === 0,
      dirty.length === 0 ? '三份都干净' : `还写着旧名字：${dirty.join(' · ')}`)
  }
  const dingLines = (moodText ?? '').split('\n').filter((l) => l.includes('确定'))
  yes('preset', '「确定」没有作为第四个维度回来（口径 1）',
    dingLines.every((l) => /不|没有|别/.test(l)),
    dingLines.length === 0 ? '一次都没出现' : `出现了，且不像在否定：${dingLines[0].trim().slice(0, 60)}`)
  // 🔴 **2026-09-26 晚 · 这条回来了**（口径 14）：上一批它被删掉，是因为老板当天精简 `mood.md`、
  //    把整个 §五「边界」删了（含这一句），并拍板「删的都是我想删的」⇒ 那条口径当时没有了。
  //    当天下午老板又把它要回来（口径 14）—— 它是"分数只用来调语气"的唯一落点。
  //    ⇒ **事实变了，断言跟着回来**：删它 / 加它都得在这儿留出处，谁改谁交代。
  //    探针 `H10` 钉的是同一件事（**两处都得有**）。
  yes('preset', '`mood.md` 里写着「分数是调语气用的，不是绩效报表」（口径 14）',
    /分数是调语气用的/.test(moodText ?? ''),
    '这句话是"分数只用来调语气"那条口径的唯一落点；删了它，下一个读的人会以为分数是绩效')

  const mePath = join(PRESET, 'me-aqua.md')
  const meText = existsSync(mePath) ? read(mePath) : undefined
  yes('preset', '`me-aqua.md` 在（口径 13）', meText !== undefined,
    meText === undefined ? '文件不存在' : `${meText.length} 字符`)
  // 🔴 **2026-09-26 晚 · 换判据，不换文案**（评审条件 ⑤，测试位）。
  //    原来是「`me-aqua.md` 的「下班：HH:MM」**机器读得出来**」—— 它测的东西**已经死了**：
  //    唤起被砍 ⇒ `ME_FILE` / `minutesToOffWork` / 「距下班」那条信号整个删掉，
  //    **没有任何机器读那三行了**。前提没了、谓语还成立 ⇒ 正则照样命中 ⇒ **永远绿**。
  //    按公共记忆 §三：**不能翻面（该绿时绿、该红时红）的判据不是判据，是装饰。**
  //    ⇒ 换成一条**真的会翻面**的：**`inject.js` 里不许再有读 `me-aqua.md` 的代码**。
  //       谁哪天把"距下班"接回来，这条**当场红**；而"那三行还在不在"由**人**看（形状与来历留着）。
  //    （`me-aqua.md` 那份文件本身在不在，由上面那三条断言管。）
  const injectSrc = read(join(PRESET, 'inject.js'))
  yes('preset', '`inject.js` 里没有读 `me-aqua.md` 的代码（唤起被砍 ⇒ 那条信号整个删掉，别接回来）',
    !/ME_FILE|minutesToOffWork|距下班/.test(injectSrc),
    ['ME_FILE', 'minutesToOffWork', '距下班'].filter((w) => injectSrc.includes(w)).join('、')
      || '（干净：一个都没有）')
  yes('preset', '`me-aqua.md` 真的进了 `leaderOrder`（口径 13）', leader.includes('me-aqua'),
    '写了没接上 = 它一辈子不进提示词（假绿比红更坏）')
  yes('preset', '`me-aqua.md` 里没有「他会突然消失」那一节（组长 09-26 点名删）',
    !/突然消失/.test(meText ?? ''),
    '留着它 ⇒ 老板长时间不说话会被她解释成"正常"，而不是张嘴问一句')

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

  // ── 2026-09-26 改：这条钉的是**被推翻的旧事实** ─────────────────────────────
  // 原文是「尾巴提醒走 `agent.inject`，拿不到时会报错」—— 机制① 走那条路会撞
  // `dsh-session` L1181 的 `appending` 守卫（`session/event` 的监听器是在
  // `appending = true` 窗口里同步调的），被 catch 吞成 warnOnce ⇒ **真回合 0 次**。
  // ⇒ 这条**改成它的反面**（不是删）：两条机制都从 `agent/pre-step` 的 `decision.messages` 出去。
  //    "不静默失效"那半边留着：拿不到 `agent.id` 时必须出声（下面那条 pre-step-agent）。
  yes('injector', '机制① 不再走 `agent.inject()`（口径 1）—— 那条路在真 harness 里会撞 appending 守卫',
    !/agent\.inject\s*\(/.test(src),
    '还在用它 ⇒ 派发窗口里必抛、被 catch 吞成 warnOnce（只喊一次然后永久静默）')

  // ①-b **2026-09-26 补**：AGENTS.md 3e⑤ 写着"查不到 agent / 认不出 agent.id 也要出声，
  //    有断言盯着" —— 而当时只有上面那一条被钉着，另外两处**只有话没有断言**。
  //    第 4 关第二轮评审点名了这一处（"说三处有断言，实际只有一条成立"）。
  //    ⚠️ **2026-09-26 晚再改**：机制① 不再查 agent（它不走 `agent.inject()` 了）
  //    ⇒ "查不到 agent 要出声"那一格**没有了**（那个失败模式不存在了），换成这一批
  //    真正会静默失效的那一处：**情绪段读不到**。
  yes('injector', '情绪段读不到时会出声（口径 8）—— 有出声的口子',
    /mood\.md/.test(src) && /(warnOnce|console\.error)/.test(src),
    '这条只钉得住"有出声的口子"；"真的出声了"归探针 Q7/Q9（行为判据）')
  yes('injector', 'pre-step 里拿不到 agent.id 时会出声',
    /warnOnce\('pre-step-agent'/.test(src) && /拿不到 agent\.id/.test(src),
    '缺了这条，两条机制认不出是谁就整条不生效，而且是静默的')

  // 🔴 2026-09-28 加：**尾巴那条消息的 `source.kind` 不许写 `'plugin'`**。
  //    来历：真回合里整轮运行失败，报文是
  //      `format v4 message requires a producer-owned source kind`
  //    —— 会话格式升到 v4 之后，`'plugin'` 这个笼统身份**被拒收**，
  //    每个生产者必须用自己的名字（判据在 `dsh-session-format-v3-to-v4` 的 `source()`：
  //    `kind` 必须非空、且不得等于 `'plugin'`；同包的 `producerKind()` 给的一般形状是
  //    `plugin:<插件名>`）。**修之前那份代码写的正是 `{ kind: 'plugin', plugin: 'agenia' }`。**
  //    这条一起钉两半：新写法在、旧写法不在。
  //    ⚠️ 验它不用真回合：那个包导出了 `releasedV4SessionFormatCodec.encodeEvent`，
  //       把整条消息喂进去就会当场抛（实测：旧写法抛、新写法过）。
  yes('injector', '尾巴那条消息的 source.kind 是自己的名字，不是笼统的 \'plugin\'（v4 会拒收）',
    /kind:\s*'plugin:agenia'/.test(src) && !/kind:\s*'plugin'\s*,/.test(src),
    /kind:\s*'plugin'\s*,/.test(src)
      ? '还写着 { kind: \'plugin\', … } —— v4 的会话格式会拒收它，整轮运行直接失败'
      : '写的是 plugin:agenia（生产者的名字）')

  // 🔴 2026-09-28 加：**`source.form` 决定那条注入在 GUI 里长什么样**。
  //    来历：老板报"看不到情绪板了"。查下来 v4 起消息的显示形态由**生产者自己声明**
  //    （客户端 `contextBody()` 按 `source.form` 分派 instructions / catalog / snapshot /
  //    notice / relay / recall），**不声明就掉进 `OpaqueBody`** —— 那一支把 source 的字段
  //    当原始数据摊开，界面上就成了一坨看不懂的东西。同类的
  //    `@deepseek-ai/dsh-repeat-tool-reminder` 写的是 `{ kind, form: 'notice', summary }`。
  //    ⇒ 这两条钉住 `form: 'notice'` 与 `summary` 都在 —— 少任何一个，那一行就不可读。
  //    ⚠️ **不认识 form 名同样掉进 opaque**（客户端源码原话），所以别自创名字。
  yes('injector', '尾巴那条消息声明了 source.form（v4 起 GUI 按它分派渲染，不写就成 opaque）',
    /form:\s*'notice'/.test(src),
    '没声明 form ⇒ 那条注入在界面上退化成 OpaqueBody（就是"看不到情绪板"那个症状）')
  yes('injector', '尾巴那条消息带 source.summary，且摘要是**情绪板那一行**（折叠时一眼看到分数）',
    /summary:\s*summarizeTail\(/.test(src) && /function summarizeTail/.test(src) && /【情绪板】/.test(src),
    'summary 只在 notice 形态下显示；摘要取错行（比如取到「# 语言风格」）折叠行就没有分数')

  // ② 快照里唯一会变的是 agenia:board，而板子按 team_<岗位> 认人。
  //    2026-09-24 那天组长 42 次起人全走裸 subagent ⇒ 板子恒空 ⇒ 快照一整天没变。
  //    所以起人也算"叫了人"（算外聘）—— 认的是"起过人"，不是"用哪个工具名起的"。
  yes('injector', '起人的工具（subagent）也算进板子，算外聘',
    /HIRE_TOOL = 'subagent'/.test(src) && /call\.name === HIRE_TOOL/.test(src) && /hire: '外聘'/.test(src),
    '板子只认 team_* 的话，用 subagent 起人的那些回合里快照一动不动')

  // ── 2026-09-24 加的两条：提醒得自报家门，正文得在磁盘上 ──────────────────
  // ① 提醒是作为一条 **user 消息**进请求的。不带"不是老板的消息"这半句，
  //    模型会把它当成"老板开口了"，一本正经回它一段 —— 当天实测：一个回合里回了两条。
  // ② 正文放在 style.md 里：ESM 缓存只锁代码，不锁 .md，所以**改这句不用重启 harness**。
  //    外框（"不是老板的消息" + "不是任务"）留在代码里：那是护栏，不该由内容文件承担。
  const stylePath = join(PRESET, 'style.md')
  const styleText = existsSync(stylePath) ? read(stylePath) : ''
  // ① 改成"直接贴正文、不加外框"（2026-09-24 老板：「记得把那个【自动提醒】也删了，没用」）。
  //    那层护栏当年是为"提醒被当成老板开口、模型回了它两条"加的；删掉是老板拍的 ——
  //    真再出现被回的情况，把外框加回来并改这一条，**别争论，也别把断言删了当没看见**。
  yes('injector', '尾巴提醒直接贴 style.md 正文（不再加"自动提醒"外框）',
    /STYLE_FILE/.test(src) && !/REMINDER_HEAD|REMINDER_TAIL/.test(src),
    '外框是 2026-09-24 老板拍板删掉的；要加回来先改这一条')
  yes('injector', '尾巴提醒读的是 style.md（改它不用重启 harness）',
    /STYLE_FILE/.test(src) && /style\.md/.test(src) && styleText.trim().length > 0,
    '锁在代码里的话，每调一句都要重启一次 harness')

  // ③ **表达方式只有一份来源**（2026-09-24 老板定：开头注入的和每 n 步注入的是同一份）。
  //    这一条盯的是"别再分叉"：四张表住在 style.md；persona.md 只留身份与基本说明。
  //    以前两张表在 persona.md 和 reminder.md 各存一份 —— 那是迟早对不上的隐患。
  const personaText = read(join(PRESET, 'persona.md'))
  const styleHeadings = ['## emoji', '## 颜文字', '## 口癖', '## 标点连用']
  const inStyle = styleHeadings.filter((h) => styleText.includes(h)).length
  const leakedToPersona = styleHeadings.filter((h) => personaText.includes(h))
  yes('injector', '表达表只有一份来源：四张表在 style.md、persona.md 只留身份',
    inStyle === 4 && leakedToPersona.length === 0,
    leakedToPersona.length > 0
      ? `persona.md 里还留着：${leakedToPersona.join('、')}（两张表各存一份，迟早分叉）`
      : `style.md ${inStyle}/4 张表`)

  // ── 2026-09-26 加的两条：情绪模块的**代码那一半**（口径 10 / 14）─────────────
  // 口径 10：`moodOf` 必须是**导出的**——不导出，探针就只能隔着整条尾巴路测它，
  //          喂假信号、验单调性这些事全部做不了（那就退化成"读代码觉得对"）。
  yes('injector', '`moodOf` 是**导出**的函数（口径 10）',
    /export\s+(?:async\s+)?function\s+moodOf\b|export\s+const\s+moodOf\b/.test(src),
    '找不到导出的 moodOf ⇒ 探针的 N 族（单调性）一条都跑不了')
  // 口径 14：衰减常数住在 `mood.md` 的 ```mood 块里，`.js` 里一个都不许有 ——
  //          写死在代码里 ⇒ 调参要重启 harness（ESM 按 URL 缓存，AGENTS.md 3d）。
  yes('injector', '衰减常数不在 `.js` 里，住在 `mood.md`（口径 14）',
    !/halfLifeMinutes\s*[:=]\s*\d/.test(src) && !/roundDecay\s*[:=]\s*[\d.]/.test(src),
    '写死在 .js 里 ⇒ 改一个数要重启 harness；口径 14 要的是"改文件就生效"')
  yes('injector', '两条机制都落在 `agent/pre-step` 上（口径 1/2 的读代码那半边）',
    /ctx\.on\('agent\/pre-step'/.test(src) && /(pendingTail|dangling|[Tt]ail)/.test(src),
    '找不到 pre-step 里的尾巴判定')
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
  // ⚠️ 文件名是 **`前日复盘.md`** —— 口径（2026-09-23）：抽屉日期 = **写它的那天**，
  //    里面覆盖的是**前一天**，所以叫"前日"。`retro/2026-09-20`、`retro/2026-09-22`
  //    那两份老档案还叫旧名（**档案不改名**），这里钉的是新名。
  //    断言吃旧名的时候，流程位交得再对也是红的 —— **假红比不红更坏**：它会教人学会忽略脚本。
  const review = join(teamRoot, 'retro', today, '前日复盘.md')
  yes('office', `今天的复盘在（.team/retro/${today}/前日复盘.md）`, existsSync(review),
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
  // 2026-09-28 换版（DSH 0.1.5 → 0.1.7）：预设不再靠"扫目录"发现 —— 框架自己的 skill 写着
  // `Nothing reads that directory any more.`（连 ~/.dsh/.agent-presets/ 一起作废；
  // profile 里那行 agent-presets 与它的 roots 键在新版里**根本不存在**，写了只会被跳过）。
  // 现在一份预设是一个 **bundle**：package.json 里声明 dsh.bundle.patch，旁边放那个补丁，
  // 补丁里用一行 @deepseek-ai/dsh-agent-preset 把它注册进 agent-preset-registry。
  // 所以旧断言「预设目录里没有 cordis.patch.yml」正好反了 —— 现在**必须有**。
  // 守的东西没变：交付物要能自己装上去，不靠这台机器上别的东西。
  // 旧口径「拷文件夹就能装」的来历见 git 历史与 INSTALL.md 第 10 节，别照它改回去。
  const bundlePatch = join(PRESET, 'cordis.patch.yml')
  let bundlePatchDeclared
  try {
    bundlePatchDeclared = JSON.parse(read(join(PRESET, 'package.json')))?.dsh?.bundle?.patch
  } catch {
    bundlePatchDeclared = undefined
  }
  yes('host', '预设是个 bundle（补丁文件在，且 package.json 声明了 dsh.bundle.patch）',
    existsSync(bundlePatch) && bundlePatchDeclared === './cordis.patch.yml',
    `补丁文件${existsSync(bundlePatch) ? '在' : '不在'} · package.json 声明的是 ${String(bundlePatchDeclared)}`)
  // 🔴 2026-09-28 换版当天最贵的一组：**交付补丁的形状**。
  //    来历（读数全在 `.tools/mount-test/README.md`，是在**真 web 档**里量的）：
  //      · 原来那份补丁用 `cordis:include` 把 `agent.cordis.yml` 引进来 ——
  //        实测 `generation=false`、整份 `broken`（全部行 never started）；
  //        而**同一个组合本体内联**进去就正常（38 行全起）。出厂四份预设**没有一份**用 include。
  //      · 改成内联之后又踩到两处**必须绝对路径**的地方：
  //        `./inject.js` ⇒ 那一行 never started（整份 broken）；
  //        不写 `contentDir` ⇒ 那些 `.md` 全读不到，**而且不报错**（静默注入 0 字符）。
  //    ⇒ 这几条钉的就是"三个坑都填上了"，谁改回去谁当场红。
  {
    const patch = existsSync(bundlePatch) ? read(bundlePatch) : ''
    // ⚠️ 判"用没用它"必须**先剔掉注释行** —— 这份补丁的头部正好有一段说明在讲
    //    "为什么不用 cordis:include"，把注释算进去就成了永远红的假红（当场踩过）。
    const effectivePatch = patch.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
    yes('host', '交付补丁**不用** cordis:include 引组合本体（实测那样挂不起来）',
      patch.length > 0 && !/cordis:include/.test(effectivePatch),
      patch.length === 0
        ? '补丁文件读不到'
        : /cordis:include/.test(effectivePatch)
          ? '又用回 include 了 —— 真 web 档实测它 generation=false、整份 broken'
          : '内联的（照出厂四份预设的形状）')
    yes('host', '补丁里注入器的行名是绝对的 file:/// URL（相对路径那一行 never started）',
      /name:\s*'file:\/\/\/[^']*\/inject\.js'/.test(patch),
      '行名写成 ./inject.js 会让整份预设判 broken —— 实测过')
    yes('host', '补丁里注入器那行写着 contentDir（不写它那些 .md 全读不到，且不报错）',
      /contentDir:\s*'[A-Za-z]:[\\/]/.test(patch),
      '不写 ⇒ ctx.baseUrl 是调起进程的工作目录 ⇒ 静默注入 0 字符（实测 stderr 一串「找不到对应文件」）')
    yes('host', '补丁是 agent.cordis.yml 的派生物，且有生成器能对账',
      existsSync(join(REPO, '.tools', 'make-bundle-patch.mjs')),
      '没有生成器 ⇒ 两份会各走各的；跑 <node> .tools/make-bundle-patch.mjs --check 对账')
  }
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
