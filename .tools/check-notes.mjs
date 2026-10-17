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
// 🔴 F-56 的判据本体住在 lib/ 里（**不 import 测试岗那一份**：它住在 `.team/`，那份目录不进 git，
//    发出去之后就不存在了）。⚠️ 抄本与参照实现的**口径必须同批改**。
import { analyzeTree as analyzeF56Forwards, describeReading as describeF56Reading } from './lib/f56-forward.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PRESET = join(REPO, 'presets', 'agenia')
const HOME = process.env.USERPROFILE ?? process.env.HOME
const PROFILES = join(HOME, '.dsh', 'profiles')

/**
 * 出厂 `standard` 的**唯一来源**：桌面客户端那一份固定的 oracle（拍板 I3 / 契约 PH0-5）。
 *
 * 🔴 2026-10-15（批次 I4c）**换源**。换之前这里去"npm 装出来的 dsh 身边"找出厂预设，三条路
 *   （`_npx` 缓存 / npm 全局安装 / `npm root -g`）—— 那些是**退役的 web 0.1.7 路径**
 *   （老板 2026-10-13 拍板：浏览器那条路退役，现行唯一入口是桌面客户端 0.2.0-rc.2）。
 *   ⇒ 现在读的是桌面客户端里那一份 `standard.patch.yml`，由 staging 的 oracle 目录固定落盘：
 *     `.tools/_staging/agenia-upgrade/oracle/standard.patch.yml`（+ 同目录的 `provenance.json`）。
 *
 * 🔴 **找不到来源 ⇒ 红，不许静默回落到旧路径。** 判据三条，各一条断言：
 *   · 文件在（不在 ⇒ 红，**不是**"这一族跳过"）；
 *   · sha256 与字节数 == 冻结值（版本换了、文件被换过 ⇒ 红）；
 *   · `provenance.json` 自报的版本与 SHA 与冻结值一致 —— oracle 是**别人放进来的一份快照**，
 *     它自证没有意义；版本与摘要都要**对上冻结值**，再由 STAT-01 那边独立复算同一份 SHA。
 *
 * ⚠️ **为什么原来那条红得比看上去严重**：`shippedPresets()` 返回 undefined ⇒ 下面 `else`
 *   那一整支（standard vs agenia 的集合比对，AGENTS.md 3b 的规矩）**整段被跳过** ——
 *   它既绿不了也红不了。所以现在缺来源时，那一族判据**一条都不许消失**（见下面 `pending` 那几行）。
 *
 * ⚠️ 这一段只讲**来源**。"这台机器上还躺着哪几份 dsh、各是哪一版"那条**读数**另有其人
 *   （`installedDshDirs()`，只报不红）—— 它列 npm 那两份只是为了读数自带口径，
 *   **不是** oracle 的来源，别把两者混起来读。
 */
const ORACLE_DIR = join(REPO, '.tools', '_staging', 'agenia-upgrade', 'oracle')
const ORACLE_FILE = join(ORACLE_DIR, 'standard.patch.yml')
const ORACLE_PROVENANCE = join(ORACLE_DIR, 'provenance.json')

/** 冻结值 —— 与 `tests/agenia-upgrade/support/env.mjs` 的 `FROZEN.oracle` 同源（desktop 0.2.0-rc.2）。 */
const ORACLE_FROZEN = {
  version: '0.2.0-rc.2',
  sha256: '6CD2F197737FC94A45E487D0BB57869461DD6F392D45F6429B576E75D973EDA8',
  bytes: 7511,
  /** 全部 `- id:` 行（含它自己那行注册声明）。 */
  rows: 33,
}

/** 摘要一律大写比较（provenance 是别人写的文本，大小写不保证）。 */
const sha256Upper = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').toUpperCase()

/**
 * **读数**（只报不红）：这台机器上躺着哪几份 dsh、各是哪一版。
 * 来历见 `AGENTS.local.md` 第七节 —— 客户端那份在 asar 里，这个脚本够不着，所以这里只列
 * 脚本自己找得到的那几份。⚠️ 它**不是** oracle 的来源（那一族在上面，走 desktop 固定落点）。
 */
const installedDshDirs = () => [
  // ① 上一版的形状：npx 缓存（哈希目录名会变，所以枚举）
  ...(existsSync(join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx'))
    ? readdirSync(join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx'))
      .map((h) => join(process.env.LOCALAPPDATA, 'npm-cache', '_npx', h, 'node_modules', '@deepseek-ai', 'dsh'))
    : []),
  // ② 全局安装那份（web 档退役之后就只剩它 + 客户端里那份）
  join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@deepseek-ai', 'dsh'),
]

const rows = []
const add = (family, name, ok, detail) => rows.push({ family, name, ok, detail })
// 🆕 2026-10-01 加：**第三态「挂起」**（`ok: null`）—— 被测对象不在、这条断言这一轮判不了。
//    为什么必须有它：那几条断言原来被 `if (existsSync(review))` 包着，**复盘不在时整段消失**：
//    分母 100 对分母 102 —— `100/100` 读起来像全绿，**而恰恰是那天最需要它们响**。
//    （`.team/memory.md` §三 记的第四形态："分母随被测对象变 ⇒ 直接从输出里消失"。）
//    ⇒ 挂起**留在分母里、在输出里明写**，既不当绿也不当红。
//    退出码跟着分三档：0 全过 · **2 有挂起（未验 ≠ 通过）** · 1 有红。
const pending = (family, name, detail = '') => rows.push({ family, name, ok: null, detail })
const eq = (family, name, got, want) =>
  add(family, name, got === want, `笔记 ${want} / 实测 ${got}`)
const yes = (family, name, cond, detail = '') => add(family, name, cond, detail)

const read = (p) => readFileSync(p, 'utf8')
// 只数汉字：上限说的是"字"，全角标点、英文、markdown 记号不算字。
const hanCount = (text) => (text.match(/[\u4e00-\u9fff]/g) ?? []).length
// yml 里每一行能力行 —— 顶层两格、组内四格，两种缩进都收。
const idLines = (text) => (text.match(/^\s*- id: .+$/gm) ?? []).map((l) => l.trim().slice(6).trim())

/**
 * 编制**三组**（B2.5 ② 的分组口径）—— 判据按组写，不按"份数"写。
 *
 *   · **固定岗位 4**：说明书与 `team-<岗位>` 行**成对**，工具名 `team_<岗位>`；
 *   · **外聘 1**：说明书在、**没有** `team-hire` 行（他挂在 `tool-subagent` 那枚标记上）；
 *   · **一次作业 4**：说明书与 `tool-job-<角色>` 行成对，工具名 `job_<角色>`（`-` 换 `_`）。
 *
 * ⚠️ 这三张名单是**编制**（角色名），不是"今天有几个人" —— 所以它对
 *    装前（6 份说明书 / 0 条作业行）与装完（10 份 / 4 条）**都成立**，
 *    而"加了岗位只改了一处"照样当场红。
 *
 * 🔴 **2026-10-15（执行二 · 批次 I15）· 撤岗**：`retro`（流程与复盘）**不再是一份编制** ——
 *    老板原话「amara的旧岗就可以撤了，她现在做技术评审吧」+「为什么还在写每日复盘……旧的就不用再做了」。
 *    事实形状是**关掉不删**：`team/retro.md` 删了、`team-retro` 那一行还在（`disabled: true`）、
 *    它那枚【组员:retro】也还在 yml 里。⇒ 所以拆成两张表：
 *      · `FIXED_ROLES`   = **在岗的四个**（说明书 ↔ 行，成对、开着）；
 *      · `RETIRED_ROLES` = **已撤岗的一个**（**行在、关着；说明书不许再有**）。
 *    能力行总数因此**一个数都不动**（关掉 ≠ 删掉）：42 行 / 差集 10 项照旧，
 *    变的只有"关着的行" 4 → 5。
 */
const FIXED_ROLES = ['design', 'dev', 'test', 'review']
const RETIRED_ROLES = ['retro']
const HIRE_ROLE = 'hire'
/**
 * 四条**一次作业**的蓝图（提案 §B2.2 冻结的那三格：行 id / 工具名 / 角色）。
 * ⚠️ 行 id 与工具名**逐字写出来**（不从角色名推）：它们是要被对账的**目标**，
 *    推出来的话，"行 id 写歪了"这件事就永远对不上（`tool-job-<角色>` 只是个约定，不是保证）。
 */
const JOB_ROWS = [
  { role: 'memory-judge', rowId: 'tool-job-memory-judge', toolName: 'job_memory_judge' },
  { role: 'memory-review', rowId: 'tool-job-memory-review', toolName: 'job_memory_review' },
  { role: 'conversation-review', rowId: 'tool-job-conversation-review', toolName: 'job_conversation_review' },
  { role: 'technical-review', rowId: 'tool-job-technical-review', toolName: 'job_technical_review' },
]
const JOB_ROLES = JOB_ROWS.map((j) => j.role)

/**
 * 每条作业行 `toolFilter.deny` 的**期望集**（与下面切块那处 `.sort()` 同口径：排序后拼串比）。
 *
 * 基线：四条作业行都**必须** deny 掉 `workflow` / `ralph`（作业不该能再编排、也不该能自迭代）。
 * 额外：**判决岗还必须 deny `proposal_file`** —— 老板 2026-10-17 定：「判决应该不能提候选」。
 *   ⇒ 它判的是别人提的案子，自己再提一个就成了既当运动员又当裁判。
 *
 * ⚠️ 为什么做成"按行推导"而不是写死一句 `=== 'ralph,workflow'`：
 *   `mig-test-whitelist-vs-blacklist-01` —— **加一个合法的项，它会不会红？**
 *   写死那两串时，判决岗加上 `proposal_file`（合法且有据）**也会红** ⇒ 那是一条 change-detector，不是安全边界。
 *   现在这一条同时钉住两件事：**该有的必须有**（少了红）、**不该有的不许有**（多了红）。
 */
const JOB_DENY_BASE = ['ralph', 'workflow']
const JOB_DENY_EXTRA = Object.freeze({ 'tool-job-memory-judge': ['proposal_file'] })
const expectedJobDeny = (rowId) => [...JOB_DENY_BASE, ...(JOB_DENY_EXTRA[rowId] ?? [])].sort().join(',')

/**
 * 按 `- id:` 把**有效行**（已剔注释）切成块 —— 判"某一行自己的 config 长什么样"用。
 * 顶层两格、组内四格都收；块的 `lines` 是那一行自己后面跟着的行，不含 `- id:` 那行本身。
 */
function rowBlocks(effectiveText) {
  const out = []
  let cur = null
  for (const line of effectiveText.split('\n')) {
    const hit = /^\s*- id:\s*(\S+)\s*$/.exec(line)
    if (hit !== null) {
      cur = { id: hit[1], lines: [] }
      out.push(cur)
      continue
    }
    if (cur !== null) cur.lines.push(line)
  }
  return out
}

/** 块里某个 `key: value` 字段（取**第一处** —— 行自己的键总在 config 之前）。 */
function blockField(block, key) {
  const hit = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm').exec(block.lines.join('\n'))
  return hit === null ? undefined : hit[1]
}

/**
 * `persona-injector` 那行 config 里 `delegationTools:` 那张表：工具名 → 模式。
 * 没有这个键 ⇒ `null`（装前就是这一支）；键在但一条都没读到 ⇒ 也返回 `null`（由调用方报）。
 */
function delegationToolsOf(block) {
  const at = block.lines.findIndex((l) => /^\s*delegationTools:\s*$/.test(l))
  if (at < 0) return null
  const indent = block.lines[at].length - block.lines[at].trimStart().length
  const table = new Map()
  for (const line of block.lines.slice(at + 1)) {
    if (line.trim() === '') continue
    if (line.length - line.trimStart().length <= indent) break
    const hit = /^\s*([A-Za-z0-9_-]+):\s*(\S+)\s*$/.exec(line)
    if (hit !== null) table.set(hit[1], hit[2])
  }
  return table.size === 0 ? null : table
}

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

  const ageniaText = read(ageniaFile)
  const agenia = idLines(ageniaText)
  // 查"配置值里有没有"的时候只看**有效行** —— 注释里提一句名字不算（那是给人看的）。
  const effectiveYml = ageniaText.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  const ymlBlocks = rowBlocks(effectiveYml)

  // 那份补丁自己的注册行（`preset-standard`）不是能力行 —— 它是"这份补丁怎么被发现"，
  // 我们那份的对应物是 `cordis.patch.yml` 里的 `preset-agenia`（在另一个文件里，进不了这个集合）。
  // 不剔掉它，`onlyInStandard` 会永远非空，而这跟"我们少抄了一行能力"完全是两回事。
  const PRESET_DECL = /^preset-/

  // ── ① oracle：来源 / 版本 / SHA（找不到 ⇒ 红，**不回落**）────────────────────
  // 口径与来历写在文件头那一大段里；这里落三条断言：在不在 · SHA/字节 · provenance。
  const oracleThere = existsSync(ORACLE_FILE)
  const oracleSha = oracleThere ? sha256Upper(ORACLE_FILE) : '（文件不在）'
  const oracleBytes = oracleThere ? statSync(ORACLE_FILE).size : null
  yes('composition', 'desktop oracle 在（0.2.0-rc.2 的固定来源；找不到 ⇒ 红，不回落旧路径）',
    oracleThere,
    oracleThere ? ORACLE_FILE : `没有这个文件：${ORACLE_FILE} —— 拍板 I3 要的是"找不到就红"，不是回去 npm 那两份里找`)
  yes('composition', 'oracle 的 sha256 与字节数 = 冻结值（版本换过 / 文件被换过 ⇒ 红）',
    oracleThere && oracleSha === ORACLE_FROZEN.sha256 && oracleBytes === ORACLE_FROZEN.bytes,
    oracleThere
      ? `${oracleSha} · ${oracleBytes} 字节（冻结 ${ORACLE_FROZEN.sha256.slice(0, 8)}… · ${ORACLE_FROZEN.bytes} 字节 · ${ORACLE_FROZEN.version}）`
      : '（文件不在）')
  const provText = oracleThere && existsSync(ORACLE_PROVENANCE) ? read(ORACLE_PROVENANCE) : null
  yes('composition', 'oracle 的 provenance.json 自报版本 + SHA 与冻结值一致（来源可追溯）',
    provText !== null && provText.includes(ORACLE_FROZEN.version) && provText.toUpperCase().includes(ORACLE_FROZEN.sha256),
    provText === null
      ? `读不到 ${ORACLE_PROVENANCE} —— oracle 必须带来源 / 版本 / SHA 读数`
      : `版本 ${ORACLE_FROZEN.version} ${provText.includes(ORACLE_FROZEN.version) ? '✓' : '✗'} · `
        + `SHA ${provText.toUpperCase().includes(ORACLE_FROZEN.sha256) ? '✓' : '✗'}`)

  // ── ② 能力行总数：**按目标自身推导**，不写死 38 / 42 ────────────────────────
  // 🔴 2026-10-15（I4c）**换判据**：原来写死 `38`（装前读数）—— 装完活体是 42，那条数字
  //    当场变红，而红的是"事实变了"，不是"哪里坏了"（STAT-03 那 15 项就是这么来的）。
  //    现在的算式：**出厂能力行 + 组合自己声明的那几类增量**
  //      = standard + 1（persona-injector）+ 5（五个固定岗位行）+ 它自己有的 `tool-job-*` 行。
  //    装前 32 + 1 + 5 + 0 = 38 ✅ · 装完 32 + 1 + 5 + 4 = 42 ✅
  //    谁凭空多抄一行、或者抄丢一行 standard 行 ⇒ 两边对不上，当场红。
  const jobRowIds = agenia.filter((r) => r.startsWith('tool-job-'))
  if (!oracleThere) {
    pending('composition', 'agenia 能力行总数 = 出厂能力行 + 组合声明的增量（不写死 38 / 42）',
      '**挂起** —— oracle 不在，右边算不出来（上面那条已经红了）')
  } else {
    eq('composition', 'agenia 能力行总数 = 出厂能力行 + 组合声明的增量（不写死 38 / 42）',
      agenia.length,
      idLines(read(ORACLE_FILE)).filter((r) => !PRESET_DECL.test(r)).length + 1
        + FIXED_ROLES.length + RETIRED_ROLES.length + jobRowIds.length)
  }
  // ⚠️ 期望值含**已撤岗那一行**：`team-retro` 是"关掉不删"，行还在 ⇒ 5 条。
  eq('composition', 'team-* 子行数（含已撤岗但保留的那一行）',
    agenia.filter((r) => r.startsWith('team-')).length, FIXED_ROLES.length + RETIRED_ROLES.length)
  eq('composition', 'persona-injector 行数', agenia.filter((r) => r === 'persona-injector').length, 1)
  // 🔴 2026-09-28：这条原来数的是**全文里 `disabled:` 出现的次数**（含注释），
  //    实测 7 处 —— 而**生效的只有 4 行**：`tool-subagent-fork` / `tool-subagent-codex` /
  //    `tool-subagent-claude-code`（都是 `disabled: true`）+ `tool-plugin-manager`。
  //    另外两处是 `!!js` 表达式（tool-bash / tool-pwsh 的平台二选一），**不算"关着的行"**。
  //    ⇒ 换成**有效行判据**：剔掉注释行再数，而且只认 `disabled: true`。
  //    强得多：谁把某一行从"关着"改成"开着"（或者反过来），这条**当场红**，
  //    而旧的写法在注释里多写一个词就跟着漂（旧笔记里那个"5"就是这么来的）。
  //    ⚠️ 装完这四行**一个都不变**（四条作业行是**开着的**，不算"关着的行"）⇒ 这条对装前装后都成立。
  // 🔴 2026-10-15（执行二 · I15）：`team-retro` 关掉 ⇒ **4 → 5**。这是"改事实"，不是放宽：
  //    谁把某一行从关着改成开着（或反过来），这条照样当场红。
  eq('composition', 'agent.cordis.yml 里 disabled: true 的行数（有效行，不含注释）',
    (effectiveYml.match(/^\s*disabled:\s*true\s*$/gm) ?? []).length, 4 + RETIRED_ROLES.length)

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

  // ── ③ onlyInStandard / onlyInAgenia：集合比对（**不写死项数**）────────────────
  let onlyAge = []
  if (!oracleThere) {
    pending('composition', 'onlyInStandard 为空 / onlyInAgenia 的明细与增量类',
      '**挂起** —— oracle 不在 ⇒ 差集算不出来（上面那条已经红了）。'
      + '⚠️ 这几条**不许从分母里消失**：2026-09-28 那次就是"找不到来源"的一条红把整支集合比对吃掉了，'
      + '它既绿不了也红不了 —— 那比红更坏。')
  } else {
    const std = idLines(read(ORACLE_FILE)).filter((r) => !PRESET_DECL.test(r))
    // 🔴 2026-09-28 补：**文件在、方言变了** ⇒ 正则可以一条都不命中，于是数出 0 行、
    //    差集变成"agenia 多出 38 项"，下面每一条都红得莫名其妙。这条把病因直接点出来。
    yes('composition', 'oracle 数得出能力行（防"文件在、正则全哑"）',
      std.length > 0,
      std.length > 0
        ? `剔掉注册行 ${std.length} 行（${ORACLE_FILE}）`
        : `${ORACLE_FILE} 里一条能力行都没数出来 —— 先确认它的方言还是 \`- id:\` 那种，别去改下面的数`)
    const onlyStd = diff(std, agenia)
    onlyAge = diff(agenia, std)
    yes('composition', 'onlyInStandard 为空', onlyStd.length === 0, onlyStd.join(', ') || '空')
    // 多出来的每一项都必须写下来（AGENTS.md §3b）—— 但**不写死项数**（装前 6 / 装后 10）。
    // 期望的增量 = 组合**自己声明**的那几类：persona-injector + 它有的 team-* 行 + 它有的 tool-job-* 行。
    // 这一对断言把"多抄了"与"抄丢了"分开报：多出来的项不属于那几类 ⇒ 红；声明了却没多出来 ⇒ 红。
    const declared = ['persona-injector', ...agenia.filter((r) => r.startsWith('team-')), ...jobRowIds].sort()
    const extraNotDeclared = onlyAge.filter((r) => !declared.includes(r))
    const declaredMissing = declared.filter((r) => !onlyAge.includes(r))
    yes('composition', 'onlyInAgenia 里每一项都是"写下来的增量类"（persona-injector / team-* / tool-job-*）',
      extraNotDeclared.length === 0,
      extraNotDeclared.length === 0
        ? `${onlyAge.length} 项：${onlyAge.join(', ')}`
        : `凭空多出来（既不在 standard 里、也不属于声明的那几类）：${extraNotDeclared.join(', ')}`
          + ' —— 加能力要改 AGENTS.md §3b，别偷偷加')
    yes('composition', '组合声明的每一个增量类行都真的多出来（team-* / tool-job-* 一条不少）',
      declaredMissing.length === 0,
      declaredMissing.length === 0
        ? `声明 ${declared.length} 项，都在（实测多出 ${onlyAge.length} 项）`
        : `声明了却没多出来：${declaredMissing.join(', ')} —— 那一行被抄丢了，或者缩进 / 方言变了`)

    // ── ④ 四条作业行（`tool-job-*`）的结构：硬门全靠这几格 ────────────────────
    // 判据**按目标自身推导**：每一条 `tool-job-<角色>` 行都必须
    //   · 工具名 = `job_<角色>`（`-` 换 `_`）· `backgroundMode: one-shot`（默认前台等 = 把组长卡住）
    //   · `maxDepth: 1`（作业自己不许再招人）· `toolFilter.deny` = **基线那两条 + 这一行自己的额外项**
    //     （基线 `[workflow, ralph]`；目前只有判决岗多一个 `proposal_file` —— 老板 2026-10-17 定，见 `JOB_DENY_EXTRA`）
    //   · 开着 · 不写 `enableRunInBackground`（写了等于把 `run_in_background` 参数拿掉 —— 拍板 I1）
    // ⚠️ 活体现在**一条都没有**（装前）⇒ 这一条是**空集**；装完 4 条逐条判。
    //    读数里必须写明"现在是空的" —— 空集不许读成"验过了"（公共记忆 §三）。
    const jobBlocks = ymlBlocks.filter((b) => b.id.startsWith('tool-job-'))
    const jobProblems = []
    for (const b of jobBlocks) {
      const body = b.lines.join('\n')
      const blueprint = JOB_ROWS.find((j) => j.rowId === b.id)
      const role = blueprint === undefined ? b.id.slice('tool-job-'.length) : blueprint.role
      const toolName = blockField(b, 'toolName')
      const background = blockField(b, 'backgroundMode')
      const depth = blockField(b, 'maxDepth')
      const denyHit = /^\s*deny:\s*\[([^\]]*)\]\s*$/m.exec(body)
      const deny = denyHit === null ? [] : denyHit[1].split(',').map((s) => s.trim()).filter(Boolean).sort()
      if (blueprint === undefined) {
        jobProblems.push(`${b.id}：不在蓝图里（蓝图上的作业行是 ${JOB_ROWS.map((j) => j.rowId).join(' / ')}）`)
      } else if (toolName !== blueprint.toolName) {
        jobProblems.push(`${b.id}：toolName 实得 ${JSON.stringify(toolName)}，蓝图写的是 ${blueprint.toolName}`)
      }
      if (!JOB_ROLES.includes(role)) jobProblems.push(`${b.id}：角色 ${role} 不在编制里`)
      if (background !== 'one-shot') jobProblems.push(`${b.id}：backgroundMode 实得 ${JSON.stringify(background)}，应为 one-shot`)
      if (String(depth) !== '1') jobProblems.push(`${b.id}：maxDepth 实得 ${JSON.stringify(depth)}，应为 1`)
      if (deny.join(',') !== expectedJobDeny(b.id)) {
        jobProblems.push(`${b.id}：toolFilter.deny 实得 [${deny.join(', ')}]，应恰为 [${expectedJobDeny(b.id).split(',').reverse().join(', ')}]`)
      }
      if (/^\s*enableRunInBackground\s*:/m.test(body)) {
        jobProblems.push(`${b.id}：写了 enableRunInBackground —— 那会把 run_in_background 参数拿掉（拍板 I1）`)
      }
      if (/^\s*disabled:\s*true\s*$/m.test(body)) jobProblems.push(`${b.id}：作业行是关着的 —— 那四条都开着`)
    }
    yes('composition', '四条作业行（tool-job-*）的结构 = one-shot + maxDepth:1 + deny（基线 workflow/ralph；判决岗另加 proposal_file）（装前是空集）',
      jobProblems.length === 0,
      jobProblems.length > 0
        ? jobProblems.join('；')
        : (jobBlocks.length === 0
          ? '活体现在**一条作业行都没有**（装前）—— 这一条是空集，装完 4 条逐条判'
          : `${jobBlocks.length} 条全对：${jobBlocks.map((b) => b.id).join(', ')}`))

    // ── ⑤ 委派名单：**名单 = 组合自己**（裁定 A4）────────────────────────────
    // `persona-injector` 那行 config 里的 `delegationTools` 是后台硬门**唯一**的名单来源
    // （代码里不硬编码）。判"每个已启用的具名 `dsh-tool-subagent` 实例都在名单里"：
    //   · 表在 ⇒ 键集合必须**严格等于**组合里已启用的具名实例的 toolName 集合
    //     （缺一个 = 那个工具没有硬门；多一个 = 名单里有不存在的工具），而且值 = 那一行的 `backgroundMode`；
    //   · 表不在（装前就是这一支）⇒ 组合里**不许**有 `job_*` 作业行 —— 那四条的硬门全靠这张表。
    const subagentRows = ymlBlocks
      .filter((b) => String(blockField(b, 'name')).replace(/^['"]|['"]$/g, '') === '@deepseek-ai/dsh-tool-subagent')
      .map((b) => ({
        block: b,
        name: blockField(b, 'toolName'),
        background: blockField(b, 'backgroundMode'),
        disabled: /^\s*disabled:\s*true\s*$/m.test(b.lines.join('\n')),
      }))
    const enabledNamed = subagentRows
      .filter((r) => !r.disabled && typeof r.name === 'string')
      .map((r) => r.name)
      .sort()
    const injBlock = ymlBlocks.find((b) => b.id === 'persona-injector')
    const dt = injBlock === undefined ? null : delegationToolsOf(injBlock)
    const jobToolNames = jobBlocks.map((b) => blockField(b, 'toolName')).filter(Boolean)
    const dtKeys = dt === null ? [] : [...dt.keys()].sort()
    const dtModeGap = dt === null ? [] : enabledNamed
      .filter((n) => dt.has(n) && dt.get(n) !== (subagentRows.find((r) => r.name === n) ?? {}).background)
      .map((n) => `${n}：名单说 ${dt.get(n)}，那一行写的是 ${(subagentRows.find((r) => r.name === n) ?? {}).background}`)
    const dtProblem = dt === null
      ? (jobToolNames.length === 0
        ? null
        : `组合里没有 delegationTools，却有 ${jobToolNames.length} 条作业行（${jobToolNames.join(', ')}）——`
          + '那几条作业的硬门全靠这张表（裁定 A4：它是必填键）')
      : (dtKeys.join(',') !== enabledNamed.join(',')
        ? `名单实得 [${dtKeys.join(', ')}]，组合里已启用的具名实例是 [${enabledNamed.join(', ')}]`
          + ' —— 裁定 A4 第 4 条：多一个少一个都红'
        : (dtModeGap.length > 0 ? `名单里的模式与那一行的 backgroundMode 分叉：${dtModeGap.join('；')}` : null))
    yes('composition', '每个已启用的具名 dsh-tool-subagent 实例都在 delegationTools 里（名单 = 组合自己）',
      dtProblem === null,
      dtProblem !== null
        ? dtProblem
        : (dt === null
          ? `装前：组合里还没有 delegationTools，也没有作业行（已启用的具名实例 ${enabledNamed.length} 个：${enabledNamed.join(', ')}）`
          : `名单 ${dtKeys.length} 个 == 已启用的具名实例 ${enabledNamed.length} 个，模式逐条一致`))
  }

  // ── ⑥ 能力契约：实测的增量项数必须 = 契约常量 ──────────────────────────────
  // 🔴 2026-10-17（老板要求清空 `AGENTS.md`、知识一律走记忆）**换锚点**：
  //    权威数字原来只在 `AGENTS.md` §3b 一处；那份清空之后，数字**钉在这里** ——
  //    本脚本是**唯一还在读组合**的那个，契约钉在它自己的常量上，比钉在散文里更难撒谎。
  //    来历与全文：记忆条目 `capability-rows-set-vs-standard` · 归档 `.team/_archive/AGENTS.md-20261017/`。
  //    规则照旧：**多出来的每一项都必须写下来** —— 现在"写下来" = 改这个常量（+ 同批改记忆条目）。
  const EXPECTED_ONLY_AGENIA = 10
  if (!oracleThere) {
    pending('composition', '组合实测的增量项数 = 能力契约（本脚本常量）',
      '**挂起** —— oracle 不在 ⇒ 实测项数算不出来（上面那条已经红了）')
  } else {
    yes('composition', `组合实测的增量项数 = 能力契约（${EXPECTED_ONLY_AGENIA} 项：多出来的必须写下来）`,
      onlyAge.length === EXPECTED_ONLY_AGENIA,
      onlyAge.length === EXPECTED_ONLY_AGENIA
        ? `实测 ${onlyAge.length} 项 = 契约`
        : `实测 ${onlyAge.length} 项 ≠ 契约 ${EXPECTED_ONLY_AGENIA} 项 —— 加/减能力行要同批改这个常量 + 记忆条目`)
  }
  // 旧口径：只拦 README 又写回八项那一种措辞。它钉的是 README 的散文，留着。
  // 另加一条：README 那句"只会多不会少"是**对外的全称承诺**，是它唯一会误导人的话。
  const readme = join(REPO, 'README.md')
  if (existsSync(readme)) {
    const text = read(readme)
    yes('composition', 'README 不再说差异是"八项"',
      !/(这八项|差异是八行|差异是八项)/.test(text), '差异的项数以能力契约（本脚本常量）与实测为准')
    yes('composition', 'README 里那句全称承诺还在（标准模式有的她一样不少）',
      /标准模式有的工具她一样不少/.test(text),
      'README 的"只会多不会少"没了 —— 那是这份预设对外唯一的能力承诺')
  }
}

// 🔴 F-56（2026-10-17）：**每个 `healthVerdict(…)` 调用点都要配对一次 `progress` 转发**；
//    **每个出口都要自带 `progress`**。判据本体在 `lib/f56-forward.mjs`
//    （🔴 **参照实现已删、只 import 这一份**（F-61）—— 树里**只有一处**实现）。
//    ⚠️ **不是"出口数 == 转发点数"** —— 那两个数本来就不该相等（实测出口 6 / 转发 2），
//       按那个口径算，"加一个转了发的新入口"会让它红 ⇒ 那是 change-detector。
{
  const f56 = analyzeF56Forwards(REPO)
  yes('F-56 入口转发', 'F-56 · health 的每个调用点都配了 progress 转发，且每个出口都自带 progress',
    f56.ok,
    f56.ok
      ? describeF56Reading(f56) + (f56.notes.length > 0 ? ` · ⚠️ ${f56.notes.join('；')}` : '')
      : f56.problems.map((p) => p.detail).join('；'))
}

// ── 2 · 预设自身的形状 ─────────────────────────────────────────────────────
{
  const yml = read(join(PRESET, 'agent.cordis.yml'))
  // 查"配置值里有没有"的时候只看**有效行** —— 注释里提一句名字不算（那是给人看的）。
  const effective = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  const teamDir = join(PRESET, 'team')
  const files = readdirSync(teamDir).filter((f) => f.endsWith('.md'))
  const roles = files.map((f) => f.slice(0, -3)).sort()

  // 🔴 2026-10-15（I4c）**换判据（B2.5 ②）**：原来钉的是"team/ 下正好 6 份"—— 那是**份数**，
  //    装完变 10 份 ⇒ 假红（STAT-03 点名的旧口径之一）。现在按**编制三组**判（组名是角色清单，
  //    不是人数）：
  //      · 文件都在编制里（编制外的 .md = 加了岗位没登记）；
  //      · 五个固定岗位：说明书 ↔ `team-<岗位>` 行**成对**；
  //      · 四个作业角色：说明书 ↔ `tool-job-<角色>` 行**成对**（**今天这一组是空的**）；
  //      · 外聘：说明书在、**没有** `team-hire` 行（他挂在 `tool-subagent` 那枚标记上）。
  //    它对装前 / 装后都成立，而且"加了一半"（只改一处）照样当场红。
  const staffed = [...FIXED_ROLES, HIRE_ROLE, ...JOB_ROLES]
  const strayFiles = roles.filter((r) => !staffed.includes(r))
  yes('preset', 'team/ 下的每一份说明书都在编制里（编制外的 .md = 加了岗位没登记）',
    strayFiles.length === 0,
    strayFiles.length === 0
      ? `${roles.length} 份：${roles.join(', ')}`
      : `编制外：${strayFiles.join(', ')} —— 加岗位要同时改这张编制表`)
  yes('preset', '目录名合法（[a-z0-9][a-z0-9-]*）', /^[a-z0-9][a-z0-9-]*$/.test('agenia'))

  // 岗位表有两处：team/ 里的 .md 和 yml 里的 `team-*` 行。两处对不上就是"加了岗位只改了一处"。
  // 这是这份预设里最容易漂的地方 —— 说明书加了、能力行没加，启动时**整队一起挂**。
  //
  // ⚠️ 外聘（`hire`）不算固定编制：他没有 `team-hire` 那一行，挂在 `tool-subagent` 的标记上
  //    （下面单独断言）。`fixed` 这个名字留给后面那几条读文档的断言用，口径是"team/ 里除外聘之外的人"。
  const fixed = roles.filter((r) => r !== 'hire')
  const teamRowRoles = idLines(yml).filter((r) => r.startsWith('team-')).map((r) => r.slice(5)).sort()
  const fixedMissingRows = FIXED_ROLES.filter((r) => !teamRowRoles.includes(r))
  const fixedMissingFiles = FIXED_ROLES.filter((r) => !roles.includes(r))
  // 编制外的行 = **在岗四个 + 已撤岗那个** 以外的一切。
  const fixedStrayRows = teamRowRoles.filter((r) => !FIXED_ROLES.includes(r) && !RETIRED_ROLES.includes(r))
  yes('preset', '固定岗位：说明书与 team-<岗位> 行成对（一条不少、一条不多）',
    fixedMissingRows.length === 0 && fixedMissingFiles.length === 0 && fixedStrayRows.length === 0,
    `行 [${teamRowRoles.join(', ') || '（无）'}] ↔ 说明书 [${FIXED_ROLES.filter((r) => roles.includes(r)).join(', ') || '（无）'}]`
      + (fixedMissingRows.length + fixedMissingFiles.length + fixedStrayRows.length > 0
        ? ` —— 缺行 ${fixedMissingRows.join(', ') || '无'} · 缺说明书 ${fixedMissingFiles.join(', ') || '无'}`
          + ` · 编制外的行 ${fixedStrayRows.join(', ') || '无'}`
        : `（另有已撤岗的 ${RETIRED_ROLES.join(', ')}：行保留、关着、说明书已删）`))
  // 🔴 2026-10-15（执行二 · I15）加：**撤岗三件套必须同时成立** ——
  //    ① 行还在（关掉不删：能力行一个数都不动）；② 那一行是 `disabled: true`；③ 说明书已经不在。
  //    少一件就是"半截撤岗"：①缺 ⇒ 能力行数漂了；②缺 ⇒ 那个工具名还在注册、硬门名单里却没有它
  //    （后台硬门对它静默失效）；③缺 ⇒ 名册里多出一个叫不了的岗位。
  //    ⚠️ 行的块要从 `rowBlocks()` 里取（组内的行是**缩进**的，按行首 `- id:` 硬切会一条都匹配不到 ——
  //      第一版就是这么写的，量出来"行还在但没关"，红的其实是量具）。
  const retiredBlocks = (r) => {
    const b = rowBlocks(effective).find((x) => x.id === `team-${r}`)
    return b === undefined ? '' : b.lines.join('\n')
  }
  const retiredGap = RETIRED_ROLES.flatMap((r) => {
    const out = []
    if (!teamRowRoles.includes(r)) out.push(`${r}（行被删了 —— 关掉不删，行必须还在）`)
    else if (!/^\s*disabled:\s*true\s*$/m.test(retiredBlocks(r))) out.push(`${r}（行还在但没关 —— 那个工具名会重新注册）`)
    if (roles.includes(r)) out.push(`${r}（说明书又回来了 —— 撤岗的岗位不许有说明书）`)
    return out
  })
  yes('preset', '已撤岗的岗位：行保留且关着、说明书已删（撤岗三件套）',
    retiredGap.length === 0,
    retiredGap.length === 0
      ? `${RETIRED_ROLES.join(', ')}：行在（disabled: true）· 说明书已删`
      : retiredGap.join(' · '))

  // 四条一次作业（`tool-job-<角色>`）：**有说明书 ⇒ 必须有行；有行 ⇒ 必须有说明书**。
  // 今天活体两份都没有（这一组是空的，读数里写明）—— 装完是 4 / 4；只改一处 ⇒ 当场红。
  const jobRowRoles = idLines(yml).filter((r) => r.startsWith('tool-job-')).map((r) => r.slice(9)).sort()
  const jobFiles = JOB_ROLES.filter((r) => roles.includes(r)).sort()
  const jobGap = [
    ...jobFiles.filter((r) => !jobRowRoles.includes(r)).map((r) => `${r}（有说明书、没行）`),
    ...jobRowRoles.filter((r) => !jobFiles.includes(r)).map((r) => `${r}（有行、没说明书）`),
    ...jobRowRoles.filter((r) => !JOB_ROLES.includes(r)).map((r) => `${r}（不在编制里）`),
  ]
  yes('preset', '四个作业角色：说明书与 tool-job-<角色> 行成对（只改一处 ⇒ 红；装前是空集）',
    jobGap.length === 0,
    jobGap.length > 0
      ? `单边：${jobGap.join(' · ')}`
      : `说明书 ${jobFiles.length}/${JOB_ROLES.length}（${jobFiles.join(', ') || '这一组现在是空的'}）`
        + ` · 行 ${jobRowRoles.length}/${JOB_ROLES.length}`)

  // 外聘：说明书在、**没有** `team-hire` 行 —— 他不是固定编制，挂在 `tool-subagent` 那枚标记上。
  yes('preset', '外聘：说明书在、而且没有 team-hire 行（他挂在 tool-subagent 那枚标记上）',
    roles.includes(HIRE_ROLE) && !teamRowRoles.includes(HIRE_ROLE),
    `hire 说明书${roles.includes(HIRE_ROLE) ? '在' : '缺'} · `
      + `team-hire 行${teamRowRoles.includes(HIRE_ROLE) ? '**在（不该有）**' : '不在'}`)

  // 作业书（`job-briefs/<角色>.md`）：每条**上岗的**作业角色都要有一份 —— 它不进提示词，
  // 由派工方连活儿一起交过去；缺了，那个人拿不到自己那份活儿的说明。
  // 判据挂在"这个角色有没有上岗"上：今天一个都没有 ⇒ 0/4；装完 4/4。
  const briefDir = join(PRESET, 'job-briefs')
  const briefs = existsSync(briefDir)
    ? readdirSync(briefDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort()
    : []
  const briefGap = jobFiles.filter((r) => !briefs.includes(r))
  yes('preset', '每个上岗的作业角色都有 job-briefs/<角色>.md 作业书（缺了 ⇒ 他拿不到活儿的说明）',
    briefGap.length === 0,
    `作业书 ${briefs.length} 份（${briefs.join(', ') || '目录 / 文件都还没有'}） · 缺 ${briefGap.join(', ') || '无'}`)

  // 进度板按**工具名**认人（inject.js 的 TEAM_TOOL）：形状不对，那一列就静默不出现。
  // 2026-09-20 加 —— 以前账本里写死五个工具名，加岗位的人怎么改都记不到账。
  // 🔴 2026-10-15（I4c）**换判据**：期望那一半原来从 `team/` 目录推（装完是 9 个角色）⇒
  //    会去要求 `team_memory-review` 这种根本不存在的工具名（作业走 `job_*`）⇒ 假红。
  //    现在只按**在岗的固定岗位**推 —— 作业那四条的工具名形状归上面那条 job 行结构断言管。
  //    ⚠️ 2026-10-15（I15）：期望值要**带上已撤岗那一行** —— 它的 `toolName: team_retro` 还在 yml 里
  //    （关掉不删），不带就会假红。
  const teamTools = [...effective.matchAll(/toolName:\s*(team[_-][a-z0-9-]+)/g)].map((m) => m[1]).sort()
  const wantTools = [...FIXED_ROLES, ...RETIRED_ROLES].map((r) => `team_${r}`).sort()
  yes('preset', '五条固定行的 toolName 都是 team_<岗位名>（进度板按它认人；作业走 job_*，不走 team_*）',
    teamTools.join(',') === wantTools.join(','),
    `${teamTools.join(', ') || '（无）'}  ↔  ${wantTools.join(', ')}`)
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
  // ⚠️ 分母含**已撤岗但保留的那一行**（关掉不删 ⇒ 它的两个键也在）。行数 = 在岗四个 + 撤岗一个。
  yes('preset', 'team-* 行都是 backgroundMode: continuable（组员默认后台跑）',
    teamRows.length === FIXED_ROLES.length + RETIRED_ROLES.length && bgContinuable === teamRows.length,
    `${bgContinuable}/${teamRows.length} 行`)
  yes('preset', 'team-* 行都是 maxDepth: 1（组员不许再招人）',
    teamRows.length === FIXED_ROLES.length + RETIRED_ROLES.length && depthOne === teamRows.length,
    `${depthOne}/${teamRows.length} 行`)
  // 每个固定岗位的能力行都要带自己的标记 —— 少了它，那个人会以为自己是组长。
  // ⚠️ 2026-10-15（I15）：已撤岗那一行的 persona 标记**仍然在** yml 里（关掉不删），
  //    所以期望 = team/ 里的 9 份说明书 + 撤岗的那 1 个 = 10 枚。
  const marks = (effective.match(/【组员:[a-z0-9-]+】/g) ?? []).map((m) => m.slice(4, -1)).sort()
  const wantMarks = [...roles, ...RETIRED_ROLES].sort()
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

  // 源文件（组合本体）里的注入器行名是相对路径 —— 它跟着预设文件夹走，是生成器的输入。
  // ⚠️ 交付补丁里那一行**必须**是绝对的 file:/// URL（见下面 host 那一族）——
  //    两条断言各钉各的层，不是同一件事。2026-10-13 前这两层被混着读，出过一条"绿的自相矛盾"：
  //    这里说相对路径是对的、下面说绝对路径是必须的，而实际上两份文件本来就该一个相对一个绝对。
  yes('preset', '源组合里的注入器行是预设相对路径 ./inject.js（交付补丁的绝对路径另有一族断言）',
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

  // 🔴 2026-10-16 加 `memory`（老板当天拍：「**确保真的对你自己和组员都有用了，都能读到**」）——
  //    **在它之前，共享记忆库的内容谁都读不到**（`inject.js` 里搜 `.runtime` 零命中 ⇒
  //    常识与长期记忆躺在盘上，组长和组员一个字节都拿不到）。它排在 `work-guidelines` 之后：
  //    先给"怎么干活"，再给"队伍知道什么"。
  //    ⚠️ `memory` 与 `roster` / `board` 同族：**算出来的**（inject.js 现读库 + 按受众分），**不是文件** ——
  //    所以下面口径 9 那张"目录里每一份 `.md`"的清单里没有它，**这是对的，不是漏了**。
  yes('preset', 'leaderOrder 是 leader → work-guidelines → memory → roster → board → persona → style',
    leader.join(',') === 'leader,work-guidelines,memory,roster,board,persona,style', leader.join(' → '))
  // persona（她是谁）与 style（她怎么说话）排最后：越靠后离请求末尾越近，权重越高。
  // ⚠️ style **同时**是 inject.js 第 ⑤ 件事读的那个文件 —— 快照这条路和尾巴那条路读同一个文件，
  //    所以永远不会分叉（2026-09-24 老板定：不再分"开头注入的"和"每 n 步注入的"两份）。
  // ⚠️ **2026-09-26 改**：`me-aqua.md`（关于老板的那份）加在 `persona` 之后、`style` 之前
  //    —— 组长 2026-09-25 拍的（`方案清单-回滚后.md` §三.2）。这条断言跟着事实改，
  //    不是删：它仍然钉着"style 排最后"和"me-aqua 就在它前面"。
  yes('preset', 'leaderOrder 里 style 排最后（口径 13：语气压在最后）',
    leader[leader.length - 1] === 'style',
    leader.slice(-2).join(' → '))
  yes('preset', 'memberOrder 是 work-guidelines → memory → charter（组员不读 leader / persona）',
    member.join(',') === 'work-guidelines,memory,charter', member.join(' → '))

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
  // 🔴 2026-10-15（I4c）**换判据**：原来把 officeBound 写死成装前那两个岗位（review / retro）——
  //    装完是 4 项 ⇒ 假红（STAT-03 点名的旧口径之一）。改成**两处来源对账**：
  //    `inject.js` 的 `DEFAULT_OFFICE_BOUND` 是"配置读不到时"用的那份名单 —— 它与 yml 的
  //    `officeBound` 分叉 = 少受限 / 多受限，而且**不报错**（这正是它值得当判据的理由）。
  //    今天 2 == 2 ✅ · 装完 4 == 4 ✅；名单**该不该是这几个**另有两条管着：
  //    下面 `officeBound 里的岗位都真实存在`（角色必须在编制里）+ STAT-03 对 staged 的冻结表。
  const injectSrcForBound = read(join(PRESET, 'inject.js'))
  const boundHit = /DEFAULT_OFFICE_BOUND\s*=\s*\[([^\]]*)\]/.exec(injectSrcForBound)
  const defaultBound = boundHit === null
    ? null
    : boundHit[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort()
  const officeSorted = [...office].sort()
  yes('preset', 'officeBound（配置）与 inject.js 的 DEFAULT_OFFICE_BOUND（配置读不到时的回落）一致',
    defaultBound !== null && JSON.stringify(defaultBound) === JSON.stringify(officeSorted),
    defaultBound === null
      ? '`inject.js` 里找不到 DEFAULT_OFFICE_BOUND —— 配置读不到时就没有回落名单'
      : `yml [${officeSorted.join(', ') || '空'}]  ↔  代码 [${defaultBound.join(', ') || '空'}]`)

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
    const staleDocs = [join(REPO, 'AGENTS.md'), join(PRESET, '说明.md'), join(REPO, '.team', '_archive', 'me-aqua.md-20261017', 'me-aqua.md')]
    const dirty = staleDocs
      .map((p) => [p, existsSync(p) ? read(p) : undefined])
      .filter(([, t]) => t === undefined || /疲劳|亲近/.test(t))
      .map(([p, t]) => (t === undefined ? `${p}（读不到）` : `${p} 里 ${(t.match(/疲劳|亲近/g) ?? []).length} 处`))
    yes('preset', '改名彻底：`AGENTS.md` · `说明.md` · 归档的 `me-aqua.md` 里旧维度名 `疲劳` / `亲近` 一个字都不剩（口径 6）',
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

  // 🔴 **2026-10-17（老板：`me-aqua` 归档、不要留在 presets 里）**：这份文件**不在**预设目录里了 ——
  //    关于老板的事实改由**共享记忆的 `boss` 类**承载（`memory` 那一段，全条注入）。
  //    ⇒ 原来那两条"它在不在 / 它有没有进 leaderOrder"翻面成：**不在** + **归档副本还在**。
  const meArcPath = join(REPO, '.team', '_archive', 'me-aqua.md-20261017', 'me-aqua.md')
  const meText = existsSync(meArcPath) ? read(meArcPath) : undefined
  yes('preset', '`me-aqua.md` 不在预设目录里（关于老板的事实走共享记忆 `boss` 类）',
    !existsSync(join(PRESET, 'me-aqua.md')), '还在 presets 里 ⇒ 它又会回到注入层，与记忆那条路分叉')
  yes('preset', '`me-aqua.md` 的归档副本在（全文没丢）', meText !== undefined,
    meText === undefined ? '归档副本不存在' : `${meText.length} 字符`)
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
  yes('preset', '`me-aqua` 不在 `leaderOrder` 里（老板 10-17：关于老板的事实走共享记忆）',
    !leader.includes('me-aqua'),
    '又写回注入清单 ⇒ 与共享记忆 `boss` 类两份来源，迟早分叉')
  yes('preset', '归档的 `me-aqua.md` 里没有「他会突然消失」那一节（组长 09-26 点名删）',
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

  // ③ `officeBound` 名单 ⇄ 每份岗位说明书的「有没有命令行」（2026-10-16 加）
  //    来历：同一天两处"说反了" —— `team/conversation-review.md` 与 `team/memory-review.md`
  //    都还写着「你没有命令行」，而名单里早已把它们移了出去。上面那几条针**只扫 5 份文档、
  //    不扫 `team/`**，所以一路绿过去（`roles.test.mjs` 那条针也靠过期说明书喂饱）。
  //    钉的是**具体岗位**：某个 role 在不在 officeBound，与它说明书里那句"你有/没有命令行"。
  //    ⚠️ 没有"工具面"那一段的说明书不校验 —— 那是"没有说法"，不是"说法错了"。
  const teamRoleDocs = existsSync(join(PRESET, 'team'))
    ? readdirSync(join(PRESET, 'team')).filter((f) => f.endsWith('.md'))
      .map((f) => [f.slice(0, -3), read(join(PRESET, 'team', f))])
    : []
  const shellMismatch = []
  for (const [role, text] of teamRoleDocs) {
    const bound = office.includes(role)
    if (bound && /你有(命令行|shell)/.test(text)) {
      shellMismatch.push(`team/${role}.md 在 officeBound 里，说明书却说"你有命令行"`)
    }
    if (!bound && /你没有(命令行|shell)/.test(text)) {
      shellMismatch.push(`team/${role}.md 不在 officeBound 里，说明书却说"你没有命令行"`)
    }
  }
  yes('preset', 'officeBound 名单和每份岗位说明书的「有没有命令行」对得上',
    shellMismatch.length === 0,
    shellMismatch.length > 0
      ? shellMismatch.join('；')
      : `officeBound = ${office.join('、') || '（空）'}；${teamRoleDocs.length} 份 team/*.md 一致`)
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
  // 🔴 2026-10-15（I4c）**换判据（判据跟着语义走，不跟着旧写法走）**：
  //    原来钉的是活体那一版**内联判定**留下的字面量
  //    （`role === undefined || !officeBound.has(role)) return undefined`）。
  //    目标实现把那段抽成了纯函数 `officeBoundVerdict()`（裁定 §B1.5 冻的签名），
  //    同一句语义写成 `typeof role !== 'string' || !bound.has(role)` ⇒ `return null`。
  //    ⇒ 两种写法都算过，**唯独不许"认不出角色就拒绝"**（那会把组长自己挡住）。
  //    ⚠️ 这条只钉静态形状；"真的放行"归 GRD-01 与探针那一族（行为判据）。
  const passThroughShape =
    /role === undefined \|\| !officeBound\.has\(role\)\) return undefined/.test(src)
    || /typeof role !== 'string' \|\| !bound\.has\(role\)\) return null/.test(src)
  yes('injector', '认不出岗位的 agent 一律放行（别把组长自己挡住）',
    passThroughShape,
    passThroughShape ? '（内联的老形状 / 抽成 officeBoundVerdict 的新形状，两种都算）'
      : '两种已知形状都不在 —— 当心"认不出就拒绝"把组长自己挡住')

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
  // 🆕 2026-10-01 加：**这条消息的 source 是一个字段组，一起看**。
  //    来历：09-28 是真回合撞出 kind 那一格（整轮运行失败），09-30 才发现同一个对象上的 form 缺了
  //    （界面渲染成 opaque，"看不到情绪板"）—— **两个面，同一个坑**。
  //    ⇒ 改这一处之前，先照抄一个同类生产者的**整行**（`dsh-repeat-tool-reminder` 写的是
  //      `{ kind, form: 'notice', summary }`）；下面三条各管一格，**不许只改其中一条就收工**。
  const sourceFields = ['kind:', 'form:', 'summary:'].filter((k) => src.includes(k))
  yes('injector', '尾巴那条消息的 source 三个字段都在（kind / form / summary —— 一起看，别只钉一格）',
    sourceFields.length === 3,
    `在 ${sourceFields.length}/3：${sourceFields.join(' ') || '（一个都没有）'}`)

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

  // ④ 进快照的 .md 里不许夹**跨行**的 HTML 注释（2026-09-25 加，2026-10-01 从被强推丢掉的那一笔里找回）。
  //    来历：style.md 里那段 6 行维护说明曾**跟着快照进了提示词** —— 快照那条路是整份文件照着贴、
  //    **不剥注释**（只有尾巴那条路剥）。单行指令（如频率那行）放行。
  //    🔴 **2026-10-01 修正：判据不能用一行正则。** 找回来的原稿写的是
  //       `/<!--[\s\S]*?\n[\s\S]*?-->/`，它**当场在 style.md 上假红** ——
  //       它把第 1 行 `<!-- every: 3 -->` 的 `-->` 与第 16 行的 `-->` 配成了一对。
  //       ⇒ 任何"单行指令 + 后面还有别的注释"的文件都会被误报，而原稿自己的注释
  //         白纸黑字写着"单行指令放行"（**原意就是要放行，是那版正则做不到**）。
  //       换成"（1）先按 `<!--([\s\S]*?)-->` 逐条取出注释、（2）再看**体内**有没有换行"，
  //       八格对照（单行×2 / 真跨行×3 / CRLF×2 / 无注释 / 未闭合）全对 —— 见 `.team/leader/2026-10-01/log.md`。
  //       ⚠️ **别改回成一行正则**：修它时先跑那八格，两种坏法（假红 / 假绿）各栽过一次。
  const snapshotDocs = ['persona.md', 'leader.md', 'work-guidelines.md', 'style.md']
  const multilineIn = (text) => {
    for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) if (/\r?\n/.test(m[1])) return true
    return false
  }
  const multiline = snapshotDocs.filter((f) => {
    const path = join(PRESET, f)
    return existsSync(path) && multilineIn(read(path))
  })
  yes('injector', '进快照的 .md 里没有跨行 HTML 注释（会被原样贴进提示词）',
    multiline.length === 0,
    multiline.length > 0
      ? `${multiline.join('、')} 里有跨行注释 —— 快照那条路不剥注释，会跟着进上下文`
      : `${snapshotDocs.join('、')} 干净`)

  // 🆕 2026-10-01 加：`leader.md` 里"看昨天的复盘 ⇒ 当场叫人补"那一句的授权。
  //    来历：那条规矩**被静默丢掉过两次**（09-25 落了那一笔，当晚被回滚退掉；09-26 强推 main 时又没带上），
  //    两次都没人发现，直到 10-01 复盘逐字读全文才核出来。⇒ **被静默丢掉两次的规矩，该有判据钉着。**
  //
  // 🔄 2026-10-15（执行二 · 批次 I15）**翻了个面**：复盘岗连同**每日复盘**一起撤销了 ——
  //    `leader.md` 开工第一步里那一条被**整条删掉**（老板：「为什么还在写每日复盘……旧的就不用再做了啊」，
  //    派工单第 2 条：整条删、后面序号顺延）。
  //    ⇒ 断言跟着事实走：现在钉的是**那套授权不许自己长回来**（它回来了就红）。
  //    上面那两句来历留着 —— 它解释的正是"这条以前为什么必须钉住"，而现在钉的是反面。
  // 🔄 2026-10-13 改（另一条）：原来有两条断言要求开工第一步里"先报一句我跑在哪份预设上"。
  //    那条规矩 **2026-10-04 老板已经删了**（理由：菜单上自己看得见，不需要她报），
  //    `说明.md` 也同步改了口径 —— 两条断言却留着，于是体检长期报两条假红。
  //    ⇒ 断言跟着事实走：撤掉旧规矩，改成**不许它自己长回来**（钉子翻了个面，仍然会翻红）。
  //    旧断言的来历（09-28 / 09-30 两天 9 个会话只有 3 个真跑在 agenia 上）不算白记：
  //    它说明"跑错预设"没有任何机器读数，所以菜单那一下得由老板自己看（README / 说明.md 里写着）。
  // ✅ 2026-10-15 20:5x 组长改判（老板问「你说的明天变红的事现在能解决吗」之后当场做的）：
  //    下文那条承重的「今天的复盘在不在」**已经从"红/绿"降级成"挂起"** ——
  //    因为**被测对象自己没了**（复盘岗撤销 + 活体 `leader.md` 已不要求它）。
  //    判法与来历写在下面那一段的注释里；`AGENTS.md` §6 与 `now.md` 的"下一批"同批指过去。
  const leaderText = read(join(PRESET, 'leader.md'))
  // 🔴 2026-10-15 21:1x 修准（技术评审 F1 报的真缺陷）：
  //    原来这条查的是 `!/前日复盘/.test(leaderText) && !/流程位/.test(leaderText)` ——
  //    而当天晚上老板拍了「**技术评审 + 会话评审 = 每天开工第一步各一份**」，新 `leader.md` 里
  //    为了说清来历，写了一句话「原来那个位置是**一份**"前日复盘"，现在拆成两份」
  //    ⇒ **这条子串禁令当场和制度对撞，每天都必红。**
  //    ⇒ 它**本意**是"不许把已撤销的岗当活人用"，那就该钉**活路**，不是钉**词汇**：
  //      · `team_retro` —— 那才是"又把它当一条能叫的路"（工具名已注销）
  //      · 「当场叫人补」 —— 那才是"把补写复盘变成一条义务"
  //    ⚠️ 提到"前日复盘"**本身不算错**：那个位置的历史必须能被讲清楚，否则下一个人不知道来历。
  // ⚠️ **不能查"词汇出现"** —— `leader.md` 里**必须**能说清"那个岗敲掉了、别再叫它"（L29-30 就是），
  //     按词汇判会把"**教人别叫它**"读成"**在叫它**"。⇒ 这跟我刚修的 F1 是**同一个错误的第二次**：
  //     **拿词当判据，而不是拿活路当判据。**
  // ⇒ 钉**表格行**：只有它出现在 `|` 开头的行里，才说明它又被写成一条**能选的路**
  //     （"叫谁走哪条路"那张表和"四类一次性作业"那张表都是表）。
  // ⇒ 而"这个工具到底还活不活"另有一条判据钉着：`agent.cordis.yml` 里 `team-retro` 必须 `disabled: true`（见下）。
  const retroInTable = leaderText.split('\n').some((ln) => /^\s*\|/.test(ln) && /team_retro/.test(ln))
  yes('injector', 'leader.md 没把「流程与复盘」又写成一条能选的路（2026-10-15 撤岗 · 撤岗 ≠ 撤活）',
    !retroInTable && !/当场叫[人谁][^。\n]{0,6}补/.test(leaderText),
    '它回来了 ⇒ 有人把已注销的复盘岗又写进"叫谁走哪条路"那张表、或又把"补写复盘"变成义务'
    + '（老板 2026-10-15 定：那个岗撤了；**活儿没撤** —— 现在由两份每日评审接着，所以"提到前日复盘"不算错）')
  yes('injector', '开工第一步没有把"自报预设"长回来（2026-10-04 老板删的规矩）',
    !/跑在哪份预设/.test(leaderText) && !/报出当前生效预设/.test(leaderText),
    '老板 2026-10-04 定：菜单上自己看得见，不需要她报一句。要长回来先改这条断言和 说明.md')

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
  add('office', '固定岗位 + 外聘 + 作业的抽屉（缺的 = 那个岗位还没上过岗，不算红）',
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
  // 🔴 2026-10-15（执行二 · I15）加 `retro`：复盘岗撤销、`team/retro.md` 删了，
  //    而 `.team/retro/` 那个目录**照旧存在且不许删** —— 里面是冻结档案（老板：旧的不用再做了，
  //    但已有的文件一个都不删），外加 `conversation-review` 的产物落点。
  //    ⇒ 它不是幽灵：没有人会以为组里还有"流程与复盘"这号岗，那个格子只是档案柜。
  // 🔴 2026-10-16 加 `brain`：`health-read` 那条 op 把健康度写到
  //    `<ws>/.team/brain/<day>/health.json` —— 那是**引擎自己的落点，不是岗位**。
  //    它也不是幽灵：没有人会以为组里有个叫「brain」的岗。
  //    ⚠️ 它是**修好 `--workspace` 那条判定之后才冒出来的**（在那之前 `health-read`
  //    在 `E:\Harness` 上恒拒 `E_ROOT_REAL_BRAIN` ⇒ 这个目录从来没被建出来过）
  //    —— 也就是说：这条白名单的缺口，是"修好一处"当场带出来的第二处。
  // 🔴 2026-10-17 加 `state`：**引擎自己的落点**，位置 `<ws>/.team/state/{daily,local}/<day>.json`
  //    （`daily-start` 写开工痕迹、`local-claim` / `local-mark` 写本地双评审状态）。
  //    与 `brain` 同类：没有人会以为组里有个叫「state」的岗。
  //    ⚠️ 和 `brain` 那次一模一样，它也是**被"补上一处缺口"当场带出来的**：
  //    在这天之前 `local-*` 一次都没跑过（`audit.jsonl` 里 `local-*` 零条）⇒ `.team/state/local/`
  //    从来没被建出来过 ⇒ `state` 这一格一直是绿的。补登记跑通之后，它当场红了。
  const housework = ['_archive', 'brain', 'state', ...RETIRED_ROLES]
  const ghosts = roleDirs.filter((r) => !known.includes(r) && !housework.includes(r))
  add('office', '.team/ 下有没有预设之外的岗位目录（旧岗位留下的）',
    ghosts.length === 0, ghosts.length === 0 ? '干净' : `${ghosts.join(', ')} —— 改名成现在的岗位，或者归档掉`)

  // 🔴 2026-10-16 **记忆本子整族换锚**（I16 第 ⑤ 步 + 老板同日拍板
  //   「**也封吧，现在retro岗都退役了，他们的2000字上限也没人保了，能进长期记忆就进，进不去就扔掉**」）。
  //
  // 退役的是**整个"本子"结构**，不是某一条：
  //   · **公共三卷**（必读 / 规矩 / 资料）—— 职能被**注入的共享记忆**取代（装配里 `agenia:memory` 在岗）；
  //   · **各岗位五本私人 `memory.md`** —— 按旧规矩它们"不进公共记忆"，但老板拍板"能进就进、进不去就扔"
  //     ⇒ 逐句对账 239 句 / 108 句孤本，其中值得留的 9 条已走 `proposal-import`，其余归档；
  //     **2000 字上限一起作废**（没人保它了）。
  //   ⇒ 八本全在 `.team/_archive/memory-旧本子-20261016/`，**一字未改**。
  //
  // ⇒ **原来那几条判"本子在不在 / 超没超上限"的断言，判的是一个已经退役的结构**：
  //     · 旧 ①（公共必读卷 ≤3000 汉字）· ②（两副卷都在）· ③（必读卷指得到两副卷）
  //     · 旧 ④（每岗位 2000 字上限 × 5）
  //   全部换成**一条**：「八本旧记忆本都已冻结（档案全在 · 活体一本都不在）」。
  //
  // 🔴 为什么**合成一条**而不是删光：那几条原来是 `for (roleDirs)` + `existsSync` 循环量的，
  //   **文件一没，那一行就自己从分母里消失了、而且没有任何一行说它去哪了**
  //   （本文件 §三 记的第四形态：分母随被测对象变）。⇒ 合成一条 = **分母固定**，
  //   并且**仍然能翻面**：谁把任何一本拷回原位（= 复活旧结构），或者档案被删，当场红。
  // ⚠️ 只判"在不在"，**不判内容** —— 内容那一半由逐句对账 + 冻结时的 SHA256 负责。
  const frozenDir = join(teamRoot, '_archive', 'memory-旧本子-20261016')
  const FROZEN_BOOKS = [
    { live: 'memory.md', book: 'memory.md' },              // 公共必读卷
    { live: 'memory-规矩卷.md', book: 'memory-规矩卷.md' },
    { live: 'memory-资料卷.md', book: 'memory-资料卷.md' },
    { live: 'leader/memory.md', book: 'leader-memory.md' }, // 五本岗位私人本（归档时 \ 换成 -）
    { live: 'dev/memory.md', book: 'dev-memory.md' },
    { live: 'test/memory.md', book: 'test-memory.md' },
    { live: 'review/memory.md', book: 'review-memory.md' },
    { live: 'retro/memory.md', book: 'retro-memory.md' },
  ]
  const missingInArchive = FROZEN_BOOKS.filter((b) => !existsSync(join(frozenDir, b.book))).map((b) => b.book)
  const stillLive = FROZEN_BOOKS.filter((b) => existsSync(join(teamRoot, b.live))).map((b) => b.live)
  yes('office', '八本旧记忆本都已冻结（档案全在 · 活体一本都不在）',
    missingInArchive.length === 0 && stillLive.length === 0,
    `档案 ${FROZEN_BOOKS.length - missingInArchive.length}/${FROZEN_BOOKS.length} 在`
    + `${missingInArchive.length ? `（缺：${missingInArchive.join(' · ')}）` : ''} · `
    + `活体还剩 ${stillLive.length} 份${stillLive.length ? `（${stillLive.join(' · ')}）` : ''} —— `
    + '公共三卷 + 各岗位私人本 2026-10-16 全部退役（记忆层只剩注入的共享记忆）；拷回原位 = 复活旧结构，会红')

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

  // ★ 2026-10-15 20:5x 组长改判：**这一格从"红/绿"降级成"挂起"。**
  //
  // 为什么降级（来历照实记，别抹）：
  // 它曾经是"半硬方案"里唯一能**在没人记得的时候自己响**的形态 —— 那很值钱。
  // 但它守的那个**被测对象自己没了**：2026-10-15 老板撤掉「流程与复盘」这个岗
  // （原话：「amara的旧岗就可以撤了，她现在做技术评审吧」），`team-retro` 那一行关了、
  // `team/retro.md` 删了、活体 `leader.md` 的开工第一步也从三件事收成两件事。
  // ⇒ **没有任何人再欠这份文件** ⇒ 再判它红，红的是"制度没跟上"，不是"有人偷懒"。
  //    那种红会把大家教成"忽略脚本" —— 而"假红比不红更坏"正是这一族判据自己的教训。
  //
  // 现在的判法（**第三态**：留在分母里、明写、`挂起 ≠ 通过`）：
  //   · 盘上真有当天的回顾产物 ⇒ **照旧判它的三条形状**（将来"记忆更新"类产物也能套）；
  //   · 没有 ⇒ **挂起，不红**。
  //
  // 🔴 **新锚点还没定**：记忆系统那一半（共享脑）**还没落地**（I16 的后半批）。
  //    落地那天，这一格换成**"今天的记忆更新在不在"** —— 那时承担每日回顾的是记忆判决/复核。
  //    ⚠️ 在那之前**别把它删掉**：删了就再也没人想起这里缺一块。
  //
  // ⚠️ 文件名口径（2026-09-23）没变：抽屉日期 = **写它的那天**，里面覆盖前一天，所以叫"前日"。
  //    更早那几份老档案还叫旧名（**档案不改名**）。
  // ⚠️ `.team/retro/**` 是冻结档案（外加会话评审的落点）—— 不许删。
  // ★★ 2026-10-15 **再改（老板拍板）：这一格从"挂起"恢复成真判据** ——
  //
  // 老板原话（逐字）：「**当然是每天开工第一步了**……**这俩复盘对应的都是之前retro的位置，每天做一次**」
  // ⇒ 复盘岗撤掉之后，那个位置的**活儿没撤**（「撤岗 ≠ 撤活」），换成了两份每日评审：
  //    · `job_technical_review`（阿玛拉）→ `<team>/retro/<today>/技术评审.md`
  //    · `job_conversation_review`（绫）  → `<team>/retro/<today>/会话评审.md`
  // ⇒ 所以又有人欠东西了 ⇒ **判据可以真判**，锚点换成这两份。
  //
  // ⚠️ 口径边界：本判据**只判"两份在不在"**。两份的内容形状（结论 / findings / 窗口 / 原话）
  //    **暂时不判** —— 第一份真产物还没出来，该钉哪几条得等看到它长什么样。
  //    别拿"文件在"冒充"交得对"。
  //
  // 🔴🔴 **2026-10-15 21:1x 修 F2（技术评审报的头号缺陷）：判「昨天」的两份，不判今天的。**
  //
  //    缺陷形状（她说得很准）：开工第一步的三件事是
  //        ① 读 `now.md` → ② **派**两份评审（后台，还在跑）→ ③ 跑本脚本。
  //    ⇒ ③ 跑的那一刻，两份产物**结构上不可能存在**（刚派出去、还没写完）
  //    ⇒ 判"今天的"就是**每天都必红**，而且红得"很有道理"（"今天还没派"）——
  //      **那种红最难纠，因为没人会去查一个每天都红的判据。**
  //
  //    正解：评审评的是**昨天的工作** ⇒ 那两份的**验收窗口在明天早上**。
  //    今天开工时该在盘上的，是**昨天派的那两份**（它们评的是前天）。
  //    ⇒ 判 `yesterday`。今天做了 ⇒ 明天绿；明天没做 ⇒ 后天红。**它只欠一天，不欠自己。**
  //    ⚠️ 日期用 UTC 算：`today` 本来就是 `YYYY-MM-DD` 形态的纯日期，用本地时区减一天会在跨零点时漂。
  const yesterday = (() => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  })()
  const techReport = join(teamRoot, 'retro', yesterday, '技术评审.md')
  const convReport = join(teamRoot, 'retro', yesterday, '会话评审.md')
  const techOk = existsSync(techReport)
  const convOk = existsSync(convReport)
  yes('office', `**昨天（${yesterday}）的每日评审两份都在** —— 开工第一步该派的正是它（.team/retro/${yesterday}/）`,
    techOk && convOk,
    `技术评审 ${techOk ? '在' : '**缺**'} · 会话评审 ${convOk ? '在' : '**缺**'} —— `
    + '⚠️ 判的是**昨天**不是今天：今天的要到**明天早上**才验收（评审评的是昨天的工作，'
    + '今天派出去的那两份此刻还在写）；今天没派 ⇒ 明天这一格就红')

  // 旧锚点（前日复盘）：**已经退役**，在就判形状 —— **只报不红**（保留形状断言，不删）
  const review = join(teamRoot, 'retro', today, '前日复盘.md')
  if (existsSync(review)) {
    // 只报不红：盘上有它，是"有人自愿写的"，不是欠账。
    add('office', `今天的回顾产物在（.team/retro/${today}/前日复盘.md）（只报不红）`, true,
      '复盘岗 2026-10-15 已撤 ⇒ 这一份属于自愿留下，不是欠账')
    const body = read(review)
    yes('office', '回顾里有「我的把握有多大」那一行', /我的把握有多大/.test(body))
    yes('office', '三块齐全（坑 / 哪一关漏的 / 原文 → 新文）',
      /哪一关/.test(body) && /原文/.test(body) && /新文/.test(body))
    // 🆕 2026-10-01 加：回顾必须带一张「提案台账」（上一份提的逐条给状态与判据）。
    //    来历：09-25 提 8 处 → 09-26 数出 0.5/8；09-26 又提 8 处 → 10-01 数出 0/8。
    //    "提案的落地状态没有任何量尺"，于是"落了又被退"和"从来没落"长得一模一样。
    yes('office', '回顾里有「提案台账」那一节（上一份提的逐条有状态）', /提案台账/.test(body),
      '没有这一节 ⇒ 上一份提的东西落到哪了，谁也答不上来')
  } else {
    // 自 2026-10-01 起用的是**第三态「挂起」**：这一格**不许从分母里消失**
    //   （现场：10-01 那份落盘前分母 100、落盘后 102 ⇒ 恰恰在"没有"的那天它们整个不出现，
    //    而 `100/100` 读起来像全绿 —— memory §三 第四形态：分母随被测对象变）。
    //   ⚠️ **挂起不是通过** —— detail 里必须把这个词写出来。
    //
    // 🔴 2026-10-16（F-33）：**这一支不再挂起** —— 它下面换成真判据了（见紧跟着的那一段）。
    //   原来这里写的是「而新的锚点（记忆系统那半）还没落地」—— 那句话**当天就过期了**
    //   （记忆更新报告 2026-10-16 10:06 真产出了），而判据还在照念 ⇒ 天天 1 挂起，
    //   挂的理由却在陈述一件**已经成立的事**。**"理由过期了、判据还在照念"是"长得像判据"的另一种形态。**
    add('office', `今天的回顾产物在（.team/retro/${today}/前日复盘.md）（只报不红）`, true,
      '复盘岗 2026-10-15 已撤 ⇒ 这一份属于自愿留下，不是欠账')
  }

  // 🆕 2026-10-16 · F-33 处置：**换锚点，不删断言**。
  //   新锚点 = 共享记忆库的每日报告 `presets/agenia/.runtime/reports/memory-update/<今天>.json`，
  //   和 `leader.md`「每天开工第一步」第 2 条**同一条判据**（先查记忆更新做了没有）。
  //   🔴 **这一格是真判据**：交不出报告 = 真欠账（记忆更新是"首抢"的活，没人抢 ⇒ 整个记忆周期停摆）。
  //   ⚠️ **两条边界，都是为了不出假红**：
  //     ① **数据根整个不在**（换台机器 / 还没建库）⇒ **挂起**（判不了），不是红；
  //     ② 数据根在、今天没报告 ⇒ **红**（有库没做 = 真欠账）。
  const memRoot = join(PRESET, '.runtime')
  const memReport = join(memRoot, 'reports', 'memory-update', `${today}.json`)
  if (!existsSync(memRoot)) {
    pending('office', `今天的记忆更新报告（reports/memory-update/${today}.json）`,
      `**挂起** —— 共享记忆库的根（presets/agenia/.runtime）在这台机器上**还不存在** ⇒ 这一轮判不了。`)
  } else {
    const memOk = existsSync(memReport)
    yes('office', `今天的记忆更新报告在（reports/memory-update/${today}.json）`,
      memOk,
      memOk
        ? '记忆更新是"首抢"的活 —— 报告在 = 今天有人抢到了，记忆周期没停摆'
        : '**缺** —— 库在、但今天没人做记忆更新 ⇒ 记忆周期停摆（没有候选冻结、没有快照发布、没有报告）。'
          + '**开工第一步第 2 条就是去抢它**（`--op claim-update`），不是等它自己出现')
  }

  // ④ 昨天那一轮记忆更新走完了没有（2026-10-16 加）
  //    现场：复核作业 10:14 就 `done`、报告 25 KB 落盘，而 `state/update/<日>.json` **一整天**
  //    停在 `phase: "reviewing"` / `finished_at: null` —— "作业交活"从来没有被传播到 update state。
  //    钉的是**昨天**：本脚本在开工第一步跑，那一刻"昨天走完没有"才有答案
  //    （判"今天"= 结构上永远不可能绿，那就是天天必红）。
  //    🔴 F-49（2026-10-17）：`awaiting_review_start` **有两种长相**，靠 `phase` 一个字段分不开 ——
  //       ① 还没开跑（`state/jobs/` 里没有这一轮的复核作业记录）⇒ 当天上午的**正常态**，一个字节都不判；
  //       ② 起了、没交活（**作业记录在盘上**、`state≠done` 或 `finished_at` 空）⇒ **断头**，
  //          而 2026-10-17 之前这一种**没有任何机器会喊**（技术评审第二场 F5 / 第一场 F6）。
  //    ⇒ 判别信号是 **`phase` + 作业记录**两件事，不是 `phase` 一个字段。
  //    ⚠️ 仍然**只判昨天**（判今天 = 结构上永远不可能绿 = 天天必红，见上面那段理由）；
  //    ⚠️ 没有作业记录时 `awaiting_review_start` 不许判红（否则就是"天天必红的装饰"）。
  if (existsSync(memRoot)) {
    const prevDay = (() => {
      const t = new Date(`${today}T00:00:00Z`)
      t.setUTCDate(t.getUTCDate() - 1)
      return t.toISOString().slice(0, 10)
    })()
    const prevUpdate = join(memRoot, 'state', 'update', `${prevDay}.json`)
    let prevPhase = null
    // 🔴 还要读 `review_attempt`（2026-10-17 三审 S-1）：它是"写到第几次复核"的计数，
    //    作业记录里的 `attempt` 与它一比，就能分出**被重派取代的旧尝试**和**真的没交活**。
    //    在这之前这一段只取 `.phase` —— 于是那两种东西在 detail 里被说成同一件事。
    let prevReviewAttempt = null
    const hasPrev = existsSync(prevUpdate)
    if (hasPrev) {
      try {
        const st = JSON.parse(readFileSync(prevUpdate, 'utf8').replace(/^\uFEFF/, ''))
        prevPhase = st.phase ?? null
        prevReviewAttempt = Number.isInteger(st.review_attempt) ? st.review_attempt : null
      } catch {
        prevPhase = '（读不出来）'
      }
    }
    // 昨天那一轮的**复核作业记录**（`state/jobs/<job_id>.json`，形状见下面第 ⑤ 段已经在读的目录）
    const jobsDirOf = join(memRoot, 'state', 'jobs')
    const prevReviewJobs = (() => {
      if (!existsSync(jobsDirOf)) return []
      const out = []
      for (const name of readdirSync(jobsDirOf)) {
        if (!name.endsWith('.json') || name.startsWith('intent-')) continue
        let rec = null
        try { rec = JSON.parse(readFileSync(join(jobsDirOf, name), 'utf8').replace(/^\uFEFF/, '')) } catch { continue }
        if (!rec || rec.role !== 'memory-review') continue
        // 「昨天那一轮」怎么认：job_id 里带日期 **或** started_at 就是那一天（两种都认，别只认一种）
        if (!String(rec.job_id ?? '').includes(prevDay) && !String(rec.started_at ?? '').startsWith(prevDay)) continue
        out.push({
          job_id: String(rec.job_id ?? name),
          state: rec.state ?? null,
          finished_at: rec.finished_at ?? null,
          attempt: Number.isInteger(rec.attempt) ? rec.attempt : null,
        })
      }
      return out
    })()
    // 起了、但**没交活**（没 done 或没有 finished_at）—— 这一族是断头
    const undelivered = prevReviewJobs.filter((j) => j.state !== 'done' || !j.finished_at)
    // 🔴 `failed` 一律算断头（2026-10-17 评审 R-1）：复核**失败**就是没走完，不需要再看有没有残留记录。
    //    `reviewing` 同理（开跑却没结果）。`awaiting_review_start` 要看作业记录 —— 它有"还没开跑"的正常态。
    const stuck = prevPhase === 'reviewing'
      || prevPhase === 'failed'
      || (prevPhase === 'awaiting_review_start' && undelivered.length > 0)
    yes('office', `昨天（${prevDay}）那一轮记忆更新走完了（复核起了就必须交活；phase 不许停在 reviewing / failed / awaiting_review_start）`,
      !stuck,
      !hasPrev
        ? `${prevDay} 没有 update 状态 —— 那天没跑记忆更新（这一条不判）`
        : prevPhase === 'reviewing'
          ? `${prevDay} 的 phase 还停在 reviewing / finished_at 空 —— 复核开跑了却没有收口。`
            + '**补账那一步会把 review 的 done 写回 phase=done**：先确认作业真的交活了（翻会话流的 `turn/end`），再 `job-mark`'
                          : prevPhase === 'failed'
            ? `${prevDay} 的 phase = failed —— **这一轮没走完**（失败可能出在判决，也可能出在复核）。`
              + '先看 `state/update/` 里那一份的 `failure_reason` **键**（它一定在：状态是后写的；**值可能是 null**）；'
              + '再看 `state/jobs/` 里有没有对应的作业记录可对（**那一份可能根本不存在** —— 失败可能发生在派作业之前）。'
              + '**别直接 `job-mark --state done`**：失败要先处置（重跑那一环），处置完再结账'
            : (prevPhase === 'awaiting_review_start' && undelivered.length > 0)
              ? `${prevDay} 的 phase 停在 awaiting_review_start，**而复核作业已经在盘上、还没交活**：`
                + undelivered.map((j) => `${j.job_id}（state=${j.state ?? '?'} / finished_at=${j.finished_at ?? '空'}）`).join('、')
                + ' —— 这一种以前没有任何机器会喊。先确认作业真的交活了（翻会话流的 `turn/end`），再 `job-mark` 把 phase 写回 done'
              : `${prevDay} 的 phase = ${prevPhase}`
                // 🔴 「都已交活」必须由 `undelivered` 派生，不许另算（2026-10-17 重审 A）。
                // 🔴 而剩下那几份**也不许一句话全打成"没交活"**（2026-10-17 三审 S-1）：
                //    `state !== 'done'` 装了三种东西 —— ① 被重派取代的**旧尝试**（attempt 小）
                //    ② 报过失败的尝试 ③ 真断头（running 且没有 finished_at）。
                //    第一轮那句"这两件事对不上（查是谁把它结掉的）"给 ① 定了罪，而 ① 是正常补救路：
                //    `phase='done'` 的写入点被 `attempt === review_attempt` 卡着 ⇒ 写 done 的那份**必不在** remaining 里。
                + (prevReviewJobs.length === 0
                    ? ' · 还没有复核作业记录（正常态）'
                    : undelivered.length === 0
                      ? ` · 复核作业 ${prevReviewJobs.length} 份都已交活`
                      : (() => {
                          const older = undelivered.filter((j) => prevReviewAttempt !== null && j.attempt !== null && j.attempt < prevReviewAttempt)
                          const failedOnes = undelivered.filter((j) => !older.includes(j) && j.state === 'failed')
                          const broken = undelivered.filter((j) => !older.includes(j) && !failedOnes.includes(j))
                          const bits = []
                          if (older.length > 0) {
                            // 🔴 「旧尝试」这三段在**现实形状里永远落在这一支**（2026-10-17 A11 实测）：
                            //    `phase='done'` 的写入点被 `attempt === review_attempt` 卡着 ⇒ 残留必然是旧尝试。
                            //    所以"报过失败"那一支轮不到 ⇒ 必须在这一句里把它**补出来**，否则 S10 那种盘
                            //    （残留是 failed）读起来像是"没什么事"。补法不是另起一句"处置是重跑"——
                            //    那一环**已经重跑过了**（phase=done），说重跑会把人推去做一件已完成的事。
                            const failedOld = older.filter((j) => j.state === 'failed')
                            bits.push(`${older.length} 份是**被重派取代的旧尝试**（attempt 小于 review_attempt=${prevReviewAttempt}`
                              + (failedOld.length > 0 ? `，**其中 ${failedOld.length} 份报过失败**：${failedOld.map((j) => j.job_id).join('、')}` : '')
                              + '）—— 正常，不用管')
                          }
                          if (failedOnes.length > 0) {
                            // 🔴 2026-10-17 五审 R-2：这一支也能在 `phase=done` 的行上出现
                            //    （`review_attempt` 读不到时 `older` 恒空 ⇒ 所有 failed 都落这儿）。
                            //    所以「处置是重跑那一环」**不能无条件播报** —— 在 done 的行上那一环已经重跑过了。
                            bits.push(`${failedOnes.length} 份**报过失败**（${failedOnes.map((j) => j.job_id).join('、')}）`
                              + (prevPhase === 'done'
                                ? '—— 这一轮已经重跑并收口了，不用再重跑；翻一下它的 `failure_reason` 认原因就行'
                                : '—— 处置是重跑那一环，不是改状态'))
                          }
                          if (broken.length > 0) bits.push(`⚠️ ${broken.length} 份**真没交活**（${broken.map((j) => `${j.job_id}（state=${j.state ?? '?'} / finished_at=${j.finished_at ?? '空'}）`).join('、')}）`)
                          return ` · 另有 ${undelivered.length} 份不是 done：${bits.join('；')}`
                        })()))
  }

  // ⑤ 挂着的作业不许永远"正在跑"（2026-10-16 加）
  //    现场：`memory-review-2026-10-16-r1` 的作业记录一整天写着 `state: "running"` / `finished_at: null`，
  //    而她 10:14 就交活了 —— 差的那 8 小时里，**没有任何东西会觉得不对**。
  //    钉的是「记录自述还在跑，但已经超过**它自己写的**租约」⇒ 要么它真挂了，要么没人结账。
  //    ⚠️ 用**真实时钟**判（这一条问的就是"此刻是不是已经太久"）；租约从记录自己的 `lease_minutes` 取，
  //       代码里不写死数字。
  //    ⚠️ 阈值就是记录自己的租约 —— 撞红时先判"真挂了"还是"早交活了没结账"，**别直接放宽阈值**。
  const jobsDir = join(memRoot, 'state', 'jobs')
  const staleJobs = []
  if (existsSync(jobsDir)) {
    const nowMs = Date.now()
    for (const name of readdirSync(jobsDir)) {
      if (!name.endsWith('.json') || name.startsWith('intent-')) continue
      let rec = null
      try {
        rec = JSON.parse(readFileSync(join(jobsDir, name), 'utf8').replace(/^\uFEFF/, ''))
      } catch {
        continue
      }
      if (!rec || rec.state !== 'running') continue
      const lease = Number.isInteger(rec.lease_minutes) ? rec.lease_minutes : null
      if (lease === null) continue
      const stamp = rec.last_liveness_event_at ?? rec.started_at
      const t = typeof stamp === 'string' ? Date.parse(stamp) : NaN
      if (!Number.isFinite(t)) {
        staleJobs.push(`${name}：running 但没有可读的时间戳`)
        continue
      }
      const ageMin = Math.round((nowMs - t) / 60000)
      if (ageMin > lease) staleJobs.push(`${name}：running 已 ${ageMin} 分钟（租约 ${lease} 分钟）`)
    }
  }
  yes('office', '没有作业自述「还在跑」却已经超过自己的租约（挂着 ≠ 在跑）',
    staleJobs.length === 0,
    staleJobs.length > 0
      ? `${staleJobs.join('；')} —— **先翻会话流的 turn/end 判它是真挂了还是早交活了**，再 agenia-brain --op job-mark 结账`
      : '所有 running 记录都还在自己的租约内')
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
    // 🆕 2026-10-15 加：Agenia 升级的测试套件正式落点（计划 v5 §B1.1、接口冻结提案 B1.1：
    //    `tests/agenia-upgrade/`，55 条自动化用例 + support/）。它是仓库内容、进版本库，
    //    2026-10-14 已交最终红基线（54 RED + 1 GREEN），不是临时文件。
    'tests',
    // 🆕 2026-10-01 加：老板把桌面客户端装在仓库根（本机安装，不是仓库内容；.gitignore 也挡上了）。
    //    ⚠️ 装机包（*.exe）**不加进白名单** —— 那是可重下的临时文件：**删掉**（或挪进 `.tools/_backup/`）。
    //    白名单不是垃圾桶；一条长期红着的判据 = 教人忽略脚本（memory §三 恒红 ⇒ 空扫描）。
    'CLI',
    // 🆕 2026-10-01 加：**这台机器**装 DeepSeek VPN 通道用的运维脚本（老板 2026-10-01 装的桌面端要靠它）。
    //    它在根上是对的（人还要用），但**不进版本库** —— 里面是本机路径与安装动作，别人照抄只会装坏，
    //    `.gitignore` 已经挡着它。⇒ **白名单管"它在根上合不合规"，gitignore 管"它进不进库"，两条分开**。
    'install-deepseek-vpn.ps1',
  ])
  const stray = readdirSync(REPO).filter((n) => !allowed.has(n))
  yes('repo', '仓库根只许出现白名单里的条目（临时文件当场红）', stray.length === 0,
    stray.length === 0 ? `白名单 ${allowed.size} 项，干净` : `多出来：${stray.join(', ')} —— 删掉，或者加进 check-notes.mjs 的白名单`)
}

// ── 5 · 这台机器的既成事实 ─────────────────────────────────────────────────
{
  // 🆕 2026-10-01 加：**读数要自带口径** —— 这个脚本找得到哪几份 dsh、各是哪一版。
  //    来历：客户端里那份是 0.2.0-rc.2、npm 全局那份是 0.1.7-rc.2，而笔记里写着 0.1.5-rc.2；
  //    AGENTS.md 的**全部**实测都只在其中一版上做过，而"机器换版本"这件事当时**没有任何判据**盯着 ——
  //    发现路径是"老板装机报错 → 才去读 asar"。⇒ 先给一条读数，谁看脚本谁知道量的是哪一版。
  //    ⚠️ **只列找到的第一个会误导**：这台机器上同时躺着三份（`_npx` 那份还是 0.1.5 的旧垃圾、
  //       目录在但 `package.json` 不在）—— 所以**逐份列出来 + 各自版本**，找不到就照实说。
  //    ⚠️ 只报不红：客户端那一份在 asar 里，这个脚本够不着（要 `.tools/asar-cli/`）——
  //    能自动对账的只有"笔记里的数"与"这条读数"，而笔记是散文，抠字符串有代价（memory §三）。
  //    🔴 2026-10-15（I4c）：它**不是** oracle 的来源（那一族走 desktop 固定落点，见文件头）——
  //       这里列 npm 那两份只是"这台机器上还躺着谁"，别拿它当"出厂 standard 在哪"的依据。
  {
    const seen = installedDshDirs().filter((d) => d !== '' && existsSync(d))
    const rows = seen.map((d) => {
      let v = '（目录在，但没有 package.json —— 旧版残留？）'
      try { v = JSON.parse(read(join(d, 'package.json'))).version } catch { /* 读不到就照实说 */ }
      // 只留能认出是哪一份的那一段（全路径太长，这条是给人扫一眼的）
      const label = d.includes('_npx') ? `_npx\\${d.split('_npx\\')[1].split('\\')[0]}`
        : d.includes('Roaming') ? '（npm 全局安装）' : d
      return `${label} ⇒ dsh@${v}`
    })
    add('host', `这个脚本找得到哪几份 dsh、各是哪一版（读数自带口径 · 共 ${rows.length} 份）`, true,
      (rows.join(' · ') || '（一份都没找到）')
      + ' ｜ ⚠️ 笔记里客户端那份是 0.2.0-rc.2（在 asar 里，这里够不着）')
  }
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
// 三个态：`ok: true` 绿 · `ok: false` 红 · `ok: null` **挂起**（判不了，留分母、明写）。
const failed = rows.filter((r) => r.ok === false)
const held = rows.filter((r) => r.ok === null)
let family = ''
for (const r of rows) {
  if (r.family !== family) {
    family = r.family
    console.log(`\n── ${family} ──`)
  }
  const mark = r.ok === true ? '  ok  ' : r.ok === false ? '  RED ' : ' HOLD '
  console.log(`${mark} ${r.name}${r.detail ? `  ·  ${r.detail}` : ''}`)
}
console.log(`\n${rows.length - failed.length - held.length}/${rows.length} 条通过`
  + (held.length > 0 ? ` · ${held.length} 条挂起` : ''))
if (failed.length > 0) {
  console.log('\n红的是「笔记与现状对不上」。要么改笔记，要么改事实 —— 但不许两边都留着。')
  for (const r of failed) console.log(`  · ${r.family} / ${r.name} —— ${r.detail}`)
}
if (held.length > 0) {
  console.log('\n挂起的是**这一轮判不了**的（被测对象不在）。⚠️ **挂起 ≠ 通过** —— '
    + '它留在分母里就是为了不让"整段消失"读成满分。')
  for (const r of held) console.log(`  · ${r.family} / ${r.name} —— ${r.detail}`)
}
console.log('\n退出码：0 = 全过 · **2 = 没红但有挂起（未验 ≠ 通过）** · 1 = 有红')
process.exit(failed.length > 0 ? 1 : held.length > 0 ? 2 : 0)
