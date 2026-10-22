/**
 * 测试环境与**冻结常量**（单一来源）。
 *
 * 冻结依据：接口冻结提案 v1 §B1.1 / §B1.2 / §B1.4 / B2 / B3 / §4 + 组长拍板 v1（Q1–Q10、I1–I9）。
 * 规矩：**这里出现的每个值都必须能在拍板/提案里指到出处**；测试不许在别处再抄一份。
 * 有歧义的值不写进来 —— 报了再说，不许自创（派工单边界）。
 */
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import {
  REAL_BRAIN_ROOT,
  REAL_PRESET_ROOT,
  REAL_ROUTE_ROOT,
  REPO_ROOT,
  RUNS_PARENT,
  TEST_ROOT_MARKER,
} from './root-guard.mjs'

// ── 路径（提案 §B1.1 绝对路径表）────────────────────────────────────────────
export const PATHS = {
  repo: REPO_ROOT,
  /** 执行一 staging 根（提案 §B1.1；**实现岗的地盘**，测试只读）。 */
  stagingRoot: 'E:\\Harness\\.tools\\_staging\\agenia-upgrade',
  /** staged preset（测试唯一的只读靶子）。 */
  stagedPreset: 'E:\\Harness\\.tools\\_staging\\agenia-upgrade\\preset',
  /** desktop oracle 落点（拍板 Q2）。 */
  oracleFile: 'E:\\Harness\\.tools\\_staging\\agenia-upgrade\\oracle\\standard.patch.yml',
  oracleProvenance: 'E:\\Harness\\.tools\\_staging\\agenia-upgrade\\oracle\\provenance.json',
  /** 最终代码落点（执行一不许写；staged patch 里那两处绝对路径指的就是它）。 */
  finalPreset: REAL_PRESET_ROOT,
  /** 活体那两个文件 —— 只作**解析器阳性对照**的见证，永远不是被测对象（提案 §B1.1 第 3 条）。 */
  liveComposition: 'E:\\Harness\\presets\\agenia\\agent.cordis.yml',
  livePatch: 'E:\\Harness\\presets\\agenia\\cordis.patch.yml',
  liveInjector: 'E:\\Harness\\presets\\agenia\\inject.js',
  /**
   * **靶子落后声明**（F-105）—— 靶子（staged）与现役（`presets/agenia`）之间允许存在的差额，
   * 只许写在这里；没有这份文件就不许有差额。形状与判据见 `support/target.mjs`。
   */
  targetLagDeclaration: 'E:\\Harness\\.tools\\_staging\\agenia-upgrade\\target-lag.json',
  /** 本轮体检脚本 / 探针 / 生成器（STAT-03 的静态扫描对象）。 */
  checkNotes: 'E:\\Harness\\.tools\\check-notes.mjs',
  injectProbe: 'E:\\Harness\\.tools\\inject-probe.mjs',
  generator: 'E:\\Harness\\.tools\\make-bundle-patch.mjs',
  realBrainRoot: REAL_BRAIN_ROOT,
  realRouteRoot: REAL_ROUTE_ROOT,
  testRoot: 'E:\\Harness\\tests\\agenia-upgrade',
  runsParent: RUNS_PARENT,
  testMarker: TEST_ROOT_MARKER,
}

// ── 环境变量（提案 §B1.2 env 变量表）────────────────────────────────────────
export const ENV = {
  RUN_ROOT: 'AGENIA_TEST_RUN_ROOT',
  STAGING_PRESET: 'AGENIA_STAGING_PRESET',
  TEST_DATA_ROOT: 'AGENIA_TEST_DATA_ROOT',
  TEST_WORKSPACE: 'AGENIA_TEST_WORKSPACE',
  STATUS_ROOT: 'AGENIA_STATUS_ROOT',
  NOW_FILE: 'AGENIA_NOW_FILE',
  DESKTOP_ORACLE_STANDARD: 'AGENIA_DESKTOP_ORACLE_STANDARD',
  ORACLE_VERSION: 'AGENIA_ORACLE_VERSION',
  ORACLE_SHA256: 'AGENIA_ORACLE_SHA256',
  CONTENT_DIR: 'AGENIA_CONTENT_DIR',
}

export class EnvMissingError extends Error {
  constructor(name) {
    super(`ENV-MISSING: 环境变量 ${name} 没设置 —— 测试 runner 必须先按提案 §B1.2 导出它`)
    this.name = 'EnvMissingError'
    this.code = 'ENV-MISSING'
    this.envName = name
  }
}

export function requireEnv(name, env = process.env) {
  const v = env[name]
  if (v === undefined || String(v).trim() === '') throw new EnvMissingError(name)
  return v
}

export function optionalEnv(name, env = process.env) {
  const v = env[name]
  return v === undefined || String(v).trim() === '' ? null : v
}

// ── 冻结常量（提案 §4 汇总 + §B1.4 退出码 + §B2.4 派生计数）──────────────────
export const FROZEN = {
  /** desktop 0.2.0 oracle（契约 §0.2.2 / 提案 §B1.2）。 */
  oracle: {
    version: '0.2.0-rc.2',
    sha256: '6CD2F197737FC94A45E487D0BB57869461DD6F392D45F6429B576E75D973EDA8',
    bytes: 7511,
    /** 全部 `- id:` 行（含它自己的注册行）。 */
    rowsTotal: 33,
    /** 剔掉注册行（`name: @deepseek-ai/dsh-agent-preset`）后的能力行。 */
    capabilityRows: 32,
    registrationName: '@deepseek-ai/dsh-agent-preset',
  },

  /** 活体 agenia 组合的当前读数（AGENTS.md 3b / 契约 §0.2.2）—— 只作解析器校准，不是被测期望。 */
  liveWitness: {
    /** 活体组合的 `- id:` 行数（能力行口径，含 persona-injector 与五条 team-* 行）—— 装已完成，活体就是 42。 */
    capabilityRows: 42,
    teamToolRows: 5,
    /** 活体组合 `officeBound` 的名单（**一个**判断类岗位：`review` —— 复盘岗已撤 · `memory-review` / `conversation-review`
     *  2026-10-16 先后由老板拍板移出；来历见下面 `FROZEN.staged.officeBound` 那条 🔴）。 */
    officeBound: ['review'],
    /** 活体组合里 `disabled: true` 的**有效**行数（剔掉注释、不算 `!!js` 平台二选一那一对）。 */
    disabledLiteralRows: 5,
    /** 活体组合里**已启用**的具名 `dsh-tool-subagent` 实例数（`team-retro` 关着，不算）。 */
    enabledNamedDelegations: 9,
    onlyInAgenia: ['persona-injector', 'team-design', 'team-dev', 'team-test', 'team-review', 'team-retro'],
    /**
     * 解析器对照**允许**看到的活体行数：38 = 装前（AGENTS.md 3b 实测），42 = 装后（B2.4 冻结期望）。
     * 只用来抓"解析器坏了 / 有人手改了活体"，**不是**对被测对象的期望。
     */
    acceptableLiveRows: [38, 42],
    // 装已完成（2026-10-15，活体 42 行）。两个值的容差到此只剩历史意义；
    // 执行二整体收口时应当收成一个值（42）—— 收口前先问组长，别自己收。
  },

  /**
   * staged 生成补丁里那两处**绝对路径**的目标（AGENTS.md §7 + `.tools/make-bundle-patch.mjs`
   * 里的 INJECTOR / CONTENT_DIR）。
   *
   * ⚠️ **这一条是从既有事实推出来的，提案只写了"正确绝对路径"**（§B2.4 的 STAT-02 checklist 第 7 项）。
   * 推导：staging 与活体**逐字节对应**（§B1.1），装的时候是拷过去；补丁是预设的注册入口，
   * 所以它必须写**装好之后**那个绝对路径 —— 写 staging 路径 ⇒ 装完那一行 never started ⇒ 整份预设 broken。
   * 已作为"待组长确认的派生期望"记进红基线。
   */
  patchTargets: {
    injectorDir: 'E:/Harness/presets/agenia',
    injectorUrl: 'file:///E:/Harness/presets/agenia/inject.js',
    contentDir: 'E:/Harness/presets/agenia',
  },

  /**
   * **0.2.1 的补丁形状**（2026-10-19 迁移）：一份组合派生 **N 份预设入口**，不是"组合 + 1 行注册行"。
   *
   * 来历（只看这两处的原文，不从实现反推）：
   *   · `cordis.patch.yml` 文件头「一份预设变十份」那段：0.2.1 的 `tool-subagent` 删掉了 `persona` /
   *     `toolFilter` ⇒ 每条委派行必须用 `agentPreset:` 指向**一份独立的组员预设**；
   *   · `.tools/make-bundle-patch.mjs::memberBody()`：组员那一份 = 组合**去掉 delegation 组**，
   *     `persona` 换成组员人格（组员行上方的 `# @member-persona`）。
   *
   * 这里只冻**两个名字**，份数与行数一律从组合推（`expectedPresetIds()` / `expectedPresetRows()`）——
   * 钉死"10 份 / 259 行"会把判据钉在会变的东西上（`mig-test-criterion-drift-01`）。
   */
  patchPresets: {
    /** 组长那一份的预设 id（组员份由 `agentPreset:` 的值给出，不在这里）。 */
    leaderPresetId: 'agenia',
    /** 组员那一份要**整组去掉**的那个 `cordis:group` 的 id —— 组员没有委派工具。 */
    memberDropsGroup: 'delegation',
    /**
     * 🔴 **`delegation` 组里必须有的那 6 个包名**（`F-109` 第 4 关评审 `M-3` / 现场 `S-2`）。
     *
     * 为什么要有它：`expectedPresetRows()` 的第二行输入是 `subtreeIds(compRows, 'delegation')` ——
     * **组员预设的工具集 = 组合减去这一组**。也就是说"哪几行在组里"是**承重事实**，
     * 而在这一条之前它**零断言**（`row.parent` 只写不读、`subtreeIds` 只在 `composition.mjs` 里被调用）。
     * 现场：把 `tool-fs` 误缩进进组、重跑生成器 ⇒ 九个岗位全线失去它，所有派生判据照旧绿。
     *
     * 为什么钉 6 个**包名**、不钉 19 个**行 id**：钉 id 的话，加一条委派行就要改这张表
     * （`mig-test-whitelist-vs-blacklist-01`：加一个合法的项它就会红 = change-detector）；
     * 钉包名的话，**加几条委派行都绿**，而"`tool-fs` 挪进组"或"`tool-workflow` 挪出组"当场红。
     * 判据本体：`support/composition.mjs::delegationGroupProblems()`。
     */
    delegationToolNames: [
      '@deepseek-ai/dsh-tool-subagent',
      '@deepseek-ai/dsh-tool-subagent-control',
      '@deepseek-ai/dsh-tool-subagent-control/list-agents',
      '@deepseek-ai/dsh-tool-workflow',
      '@deepseek-ai/dsh-tool-ralph',
      '@deepseek-ai/dsh-workflow-ptc',
    ],
  },

  /**
   * **靶子过期判据**（F-105 · 2026-10-19）—— 测试打的是 staged 树，而 staged 树可以落后于现役，
   * 前提是**落后被逐字声明**。这里冻的是判据的三个输入口径：
   *
   *   · `markers` —— **功能名目录**：现役里有、staged 里没有的，声明必须逐字点名。
   *     ⚠️ 目录是**显式清单**（同 `FROZEN.ops` / `FROZEN.staged.injectedMarkdownFiles` 的规矩）：
   *     现役新增一样功能，**同批**把它加进这里，否则判据看不见它（剩下的兜底只有字节数）。
   *     这五样是 2026-10-19 复量出来的差额（`inject.js` 109601 B → 129771 B）：
   *     `commonSenseOf` / `timeLineOf` / `lastBoardPosted` / `proposalFileEnabled` / `boardChanged`。
   *   · `schema` —— 声明文件的形状版本（`PATHS.targetLagDeclaration`）。
   *   · `dataSegments` —— **不是漂移**的目录名（任一段命中即跳过）：`.runtime/` 是共享记忆库的
   *     数据目录，本来就不该同步进靶子（与 `evidence.mjs::stagedVsLiveDrift` / `release-scan.mjs` /
   *     `install.mjs` 同一口径）。不排除 ⇒ 判据常驻红，而常驻红会把真红淹掉（`cand-20261019-0042`）。
   *
   * 🔴 **`watchedFiles: ['inject.js']` 已退役（2026-10-22 · `F-123`）**：那是一份**手维护的名单**，
   *    48 份代码里只盯 1 份 —— 把 `lib/receipt.mjs` 改一个字符，判据照旧 `state=equal / ok=true`。
   *    现在判据的输入是**两棵树逐文件枚举**（`support/target.mjs::measureTarget`），
   *    枚举结果不落常量、每次现算 ⇒ 加一份合法的新文件不会让判据红（不是 change-detector），
   *    而两棵树在同一新路径上内容不同**当场**红。名单若将来还需要，只能是"读数缓存"，不许当口径。
   */
  targetLag: {
    schema: 1,
    markers: ['commonSenseOf', 'timeLineOf', 'lastBoardPosted', 'proposalFileEnabled', 'boardChanged'],
    dataSegments: ['.runtime'],
  },

  /** staged 组合的冻结期望（提案 §B2.4 + 2026-10-15 批次 I15 撤复盘岗后的事实）。 */
  staged: {
    capabilityRows: 42,
    /** `team/<角色>.md` 的份数：四个固定岗位 + `hire` + 四类一次性作业（复盘岗已撤，没有 `retro.md`）。 */
    teamFiles: 9,
    jobBriefFiles: 4,
    jobRows: 4,
    /** 固定 `team-*` **行**数 —— 含关着的 `team-retro`（关掉 ≠ 删掉）。 */
    fixedTeamToolRows: 5,
    bareSubagentRows: 1,
    /** officeBound 的**条数**（**1**：review）。
     *  ⚠️ 名单见下面的 `officeBoundRoles` —— 两者别混（混了会 `not iterable`）。
     *  🔴 2026-10-16：**2 → 1**。老板原话「你自己改就行，需要给什么命令行权限的就给」⇒ `conversation-review`
     *     从名单里去掉。**为什么**：它的作业书要求它**必核三样 SHA256**，而受限名单同时把命令行拿掉了
     *     ⇒ 它算不出哈希，"核"是空话（`E:\财布` 一次真现场只能由组长代算 ⇒ 判据退化成"信别人给的数"）。
     *     **代价照旧明说**：它**两件保护都没了**（不限写 `.team/`、不再"没有命令行"），只剩纪律
     *     （作业书里那段"只写 `retro/<日期>/` 是**纪律不是门禁**"）。
     *     ⚠️ **这是同一个病的第二次**：当天上午 `memory-review` 已因同一件事（要做容量预测）被移出，
     *     老板原话「那就给复核加个权限吧」⇒ 本条**不是**新口径，是同一条口径的第二次应用。
     *     生产侧 `presets/agenia/agent.cordis.yml`（`officeBound: - review`）与 `inject.js`
     *     （`DEFAULT_OFFICE_BOUND = ['review']`）同批改完；本条是**测试侧的同一批**
     *     （技术评审 F1 那一族：改了生产侧，冻结表要同批跟）。 */
    officeBound: 1,
    /**
     * officeBound 的**名单**（冻结的**顺序**，逐字 —— 现在只有 `review`）。
     * 两件保护（无命令行 / 写只落 `.team/`）**只剩 `review` 一个岗位有**：复盘岗已撤
     * （`team/retro.md` 不存在、`team-retro` 那一行关着）；`memory-review` 2026-10-16 上午移出 ·
     * `conversation-review` 2026-10-16 同日下午移出（为什么与代价见上面那条 🔴）。
     * 来历：`officeBound: 1` 是**计数**（同族 `capabilityRows: 42` / `teamFiles: 9` 都是计数），
     * 而 STAT-02 / REV-02 拿它当名单去 `for...of` ⇒ 实现做对的那一刻当场 `TypeError: not iterable`，
     * 把整条被测面挡在后面（证据：实现岗 `dev/2026-10-14/log.md` §11）。
     */
    officeBoundRoles: ['review'],
    onlyInStandard: [],
    onlyInAgenia: 10,
    disabledLiteralRows: 5,
    /** 进提示词的 .md 类数：persona/style/leader/work-guidelines + 9 角色 = **13**。
     *  🔴 2026-10-19（`F-109`）：**14 → 13**。`me-aqua.md` 是老板 2026-10-17 决定归档的
     *     （归档落在**仓库根**的 `.team/_archive/me-aqua.md-20261017/me-aqua.md` —— 不是预设目录下的
     *     `.team/`，那个不存在；"关于老板的事实"搬进了共享记忆库的 `boss` 类）
     *     ⇒ 组合的 `leaderOrder`/`memberOrder` 里已经没有它。
     *     **裁定：改冻结表，不补文件**（老板 2026-10-19 拍板：决定变了，判据跟着走）。
     *     ⚠️ 这条只改**期望**，没动判别逻辑：名单少一份照样红（见下面 `injectedMarkdownFiles`）。 */
    injectedMarkdownClasses: 13,
    /**
     * 🔴 **「会被注入的 `.md` 文件」的名单**（相对内容根，按路径去重）—— 与上面那个**计数**成对。
     *
     * 2026-10-16（票 `T-TEST-06` ③）：这一对原来**只有计数、而且那个计数是死常量**（`tests/**` 里零读点）。
     * 接活的口径（组长点名要写清，二选一）：
     *   ⇒ **数「配置里声明了哪几份」**（确定性 · 与盘上文件在不在无关），
     *      **不数「本回合实际注入了哪几份」**（那个环境相关：`inject.js` 读盘、**缺文件不回退** ⇒
     *      拿它当断言就是"红的是环境不是代码"）。"实际注入"那一半归**探针**（票 `T-TEST-07`）。
     *
     * 🔴 **这个数（13）不是 order 里的 key 数** —— `charter` **一个 key 撑 9 个文件**
     *    （`team/<role>.md` ×9）· `roster`/`board`/`memory` 是**算出来的** ⇒ **0 份** ·
     *    `leader`/`work-guidelines`/`persona`/`style` 各 1 份 ⇒ **`4 + 9 = 13` 只有按文件算才对**
     *    （`me-aqua` 2026-10-17 归档后不再注入，见上面那条 🔴）。
     *    （⚠️ 按 key 数接活会把加一个"算出来的"项也算进去 ⇒ **假变化**。怀疑「15 → 14」那次的口径混乱正是这一类。）
     *
     * 🔴 **两条一起钉**（名单 + 份数）才**能翻面**：
     *    · 加一个**算出来的**项（如 2026-10-16 的 `memory`）⇒ **名单与份数都不动** ⇒ 绿；
     *    · 加一个**真文件**进 order ⇒ **名单与份数都红**。
     *    ⚠️ 只钉个数会被"一进一出"骗过去（`officeBound` 那次的教训：同数不同集合）。
     */
    injectedMarkdownFiles: [
      'leader.md', 'work-guidelines.md', 'persona.md', 'style.md',
      'team/design.md', 'team/dev.md', 'team/test.md', 'team/review.md', 'team/hire.md',
      'team/memory-judge.md', 'team/memory-review.md', 'team/conversation-review.md', 'team/technical-review.md',
    ],
    /**
     * 🔴 **`leaderOrder` / `memberOrder` 里"不是文件"的 key**（**单一来源**）——
     *    「算注入面由哪几份 `.md` 拼成」时跳过它们（那是读共享脑 / 名册 / 进度板算出来的正文）。
     *
     * 读它的两处（都在测试侧 —— 本文件开头那条规矩：**测试不许在别处再抄一份**）：
     *   · `support/docs-surface.mjs::leaderInjectionSurface()` —— 算**组长**的注入面（`<key>.md`）；
     *   · `static/composition.test.mjs`（`STAT-03` 那段）—— 算「配置里声明了哪些会被注入的 `.md`」，
     *     那里 `charter` 另走一支（一个 key 撑 `team/<role>.md` ×9）。
     *
     * 🔴 **`charter` 故意不在这张表里，不许"补齐"成 `charter.md`**：
     *   · `charter` 只对**组员**有效；`leaderOrder` 里出现它**本身就是错误**
     *     （`presets/agenia/inject.js:1313-1317`：「charter 是组员自己那份说明书，组长没有」）；
     *   · 生产侧那张 `NON_FILE_KEYS`（`presets/agenia/inject.js:1283`）多一个 `charter`，
     *     是因为它判的是「这个 key 要不要去找 `<key>.md`」—— 组长 / 组员两个 order 都走同一段
     *     `selfCheck()`。那是**另一个问题**（生产会不会拦），不是「组长的注入面由哪几份拼成」
     *     ⇒ 别把生产那张表搬进测试。
     */
    computedOrderKeys: ['memory', 'roster', 'board'],
    /** 组合里**已启用**的具名 `dsh-tool-subagent` 实例数：四条固定岗位 + 裸 `subagent` + 四条 job。
     *  `team-retro` 那一行关着 ⇒ 它不注册 `team_retro` 这个工具名，也不进这个数。 */
    enabledNamedDelegations: 9,
  },

  /** 四条 job 行（提案 §B2.2 / §B2.4）。
   *  ⚠️ `officeBound` 这一栏**现在有断言读它**（REV-02 的"台账 ↔ 名单自洽"）：每条 job 的台账
   *  必须与它在 `FROZEN.staged.officeBoundRoles` 里在不在一致 —— 两张冻结表分叉当场红。
   *  ⇒ 现在四条 job 行**一个都不在** `officeBound` 里，台账与 `FROZEN.staged.officeBoundRoles` 一致。 */
  jobs: [
    { id: 'tool-job-memory-judge', toolName: 'job_memory_judge', role: 'memory-judge', officeBound: false },
    { id: 'tool-job-memory-review', toolName: 'job_memory_review', role: 'memory-review', officeBound: false },
    { id: 'tool-job-conversation-review', toolName: 'job_conversation_review', role: 'conversation-review', officeBound: false },
    { id: 'tool-job-technical-review', toolName: 'job_technical_review', role: 'technical-review', officeBound: false },
  ],
  /**
   * 🔴 **0.2.1 迁移（2026-10-19）把"四条作业行的否定名单"挪了地方** —— 旧值 `['workflow','ralph']`
   * 对应的是 `toolFilter.deny`，而 0.2.1 里 `toolFilter` 不再是 `tool-subagent` 的配置键
   * （来源：`presets/agenia/agent.cordis.yml` L443-449 / L458-470 的 🔴 注释；体检脚本
   * `.tools/check-notes.mjs::expectedJobDeny` 已是这个口径）。
   *
   * 现在两条并存、各管一件事：
   *   · `jobMemberDeny` —— 行上方 `# @member-deny <名字>` 的**期望表**（生成器据此给组员预设的注入器写
   *     `proposalFile: false`）。**只有判决岗**有；其余三行是空表。
   *   · `memberPresetForbidden` —— 组员预设里**结构性不许有**的东西（委派组整个不搬过去
   *     ⇒ workflow / ralph / 裸 subagent 根本不在那一份工具集里，所以不需要 deny 名单）。
   */
  jobMemberDeny: { 'tool-job-memory-judge': ['proposal_file'] },
  memberPresetForbidden: ['delegation', 'tool-subagent', 'tool-workflow', 'tool-ralph'],
  /**
   * 🔴 **退休的常量（`F-109` · 2026-10-19；第 4 关评审 `O-5` 让它们离开主表）**：
   * `backgroundMode` 在 0.2.1 里**已经不是 `tool-subagent` 的配置键**（组合
   * `agent.cordis.yml:295-301` 的注释：委派本身就是异步的）。模式现在只住在
   * `persona-injector.config.delegationTools`（上面那张 `delegationTools` 冻结表）。
   *
   * 为什么单开一张子表而不是直接删、也不是留在主表里：**留着是为了让"它为什么不在判据里"有处可查**，
   * 但留在主表里会被下一个人（或下一把刀）当成仍然生效的期望用 —— 又造出一条
   * `undefined === undefined`（`JOB-TOOLFILTER` 就是这么死的）。放这儿 = 一眼看出它不是判据输入。
   * 三样退休的东西：`jobBackgroundMode` / `teamBackgroundMode` / `bareSubagent.backgroundMode`。
   */
  retired: {
    jobBackgroundMode: 'one-shot',
    teamBackgroundMode: 'continuable',
  },
  jobMaxDepth: 1,
  jobProvider: 'spawn',
  /** config 键 —— **四条 job 行一律不许写它**（拍板 I1：写了等于把后台参数拿掉）。 */
  forbiddenJobConfigKey: 'enableRunInBackground',
  /** 调用参数名（下划线）—— 与上面那个 config 键不是一个东西。 */
  callArgName: 'run_in_background',

  /**
   * `persona-injector` 行 config 的必填键（**裁定 A4 冻结**）：
   * 键 = 委派工具名，值 = `one-shot` | `continuable`。
   * `delegationPolicy(config)` / `delegationToolNames(config)` **只认这一种形状**，
   * 测试不得三候选试探；键集合必须**严格等于**组合里已启用的 9 个具名 `dsh-tool-subagent` 实例。
   */
  delegationToolsKey: 'delegationTools',
  /** 冻结的名单与模式（裁定 A4 的逐字表）—— 九项 = 四条 job（`one-shot`）+ 四条固定岗位 + 裸 `subagent`（`continuable`）。 */
  delegationTools: {
    job_memory_judge: 'one-shot',
    job_memory_review: 'one-shot',
    job_conversation_review: 'one-shot',
    job_technical_review: 'one-shot',
    team_design: 'continuable',
    team_dev: 'continuable',
    team_test: 'continuable',
    team_review: 'continuable',
    subagent: 'continuable',
  },
  /** config 缺失/非法时的错误态（裁定 A4 第 3 条 + **追加裁定 v1.1 A13**）。 */
  guardConfigError: 'E_GUARD_CONFIG_MISSING',
  /**
   * 错误态下的 emergency 拒绝规则（**A13 采纳"别误杀框架 job 工具"**，逐字）：
   *   拒：精确名 `subagent`、以 `team_` 开头、以 `job_memory_` / `job_conversation_` / `job_technical_` 开头；
   *   放：`job_output` / `job_kill` / `job_list` 及其它非委派工具 —— **配置坏了还要能收作业结果**。
   * ⚠️ 旧的 `^(subagent|team_|job_)` 会连 `job_output` 一起误杀（现场再也收不回结果）⇒ 已作废。
   */
  guardConfigErrorRule: {
    rejectExact: ['subagent'],
    rejectPrefixes: ['team_', 'job_memory_', 'job_conversation_', 'job_technical_'],
    allowExplicit: ['job_output', 'job_kill', 'job_list'],
    /** 边界读数（只记不断言）：这些名字**不在**拒绝形状里。 */
    boundaryNames: ['subagent_fork', 'job_bonus', 'teamx', 'job_'],
  },
  /** 错误态下**必须拒绝**的委派名（GRD-01 的断言面）。 */
  guardConfigErrorRejects: [
    'subagent', 'team_test', 'team_design',
    'job_memory_judge', 'job_memory_review', 'job_conversation_review', 'job_technical_review',
  ],
  /** 错误态下**必须放行**的非委派名（含框架自己的 job 工具，A13 明确点名）。 */
  guardConfigErrorAllows: ['job_output', 'job_kill', 'job_list', 'read', 'present', 'send_message', 'edit', 'pwsh'],

  // ── 追加裁定 v1.2（C-1–C-6）冻结的形状 ────────────────────────────────────
  /**
   * **C-2**：`capacityVerdict(entries, ops)` 的 `ops` 形状（实现合同，逐字）。
   * 规则：省略/`[]` ⇒ 只看当前集合（delta 必须为 0）；纯函数（不改入参、不写盘）；
   * 任一 op 非法 ⇒ 立即 `{ok:false, rejectCode:'E_OP_INVALID'}` 且**不产生部分结果**；
   * 合法 ⇒ 按最终存活集给 count/chars/deltaCount/deltaChars/distribution；
   * 容量是**读数**不是闸（F-71）：越界只多给 overCap/overBy/capRef，`ok` 仍为 true、`rejectCode` 仍为 null；**无四类硬帽**。
   */
  capacityOps: {
    kinds: ['add', 'modify', 'retire', 'cull', 'merge', 'retag'],
    /** 每种的必填键（`entry` 为 Entry 对象；`ids` 为字符串数组；`typeId` 为四类之一）。 */
    required: {
      add: ['entry'],
      modify: ['id', 'entry'],
      retire: ['id'],
      cull: ['id'],
      merge: ['ids', 'entry'],
      retag: ['id', 'typeId'],
    },
    rejectCode: 'E_OP_INVALID',
    /** `merge.entry` 允许为 null（只吸收删除）。 */
    mergeEntryNullable: true,
  },
  /** **C-3**：票的状态机（终态不可回退）。 */
  ticketStateMachine: { open: ['in_progress', 'void'], in_progress: ['done', 'void'], done: [], void: [] },
  /** **C-4**：`nextReceiptVersion` = 现存 max + 1（空洞不填；重复 max 也 +1）；无历史 ⇒ 1。 */
  nextReceiptVersionRule: 'max+1（空洞不填）',
  /** **C-5**：`ageMinutes >= leaseMinutes` 即 stale（89 fresh / 90 stale / 91 stale；update 90 · local 45 同规则）。 */
  staleRule: 'age >= lease',
  /** **C-6**：`E_RECEIPT_OVERWRITE` 只由 `lib/receipt.mjs` 的回执写入函数产生（⚠️ 函数名/签名未冻，见读数）。 */
  receiptOverwriteSurface: { code: 'E_RECEIPT_OVERWRITE', file: 'lib/receipt.mjs' },
  /** **C-1**：`healthVerdict(input)` 入参形状**暂不冻结** ⇒ HLT 继续走 CLI 矩阵（这一条只作留痕）。 */
  healthVerdictInputFrozen: false,
  /** 后台 guard 的两个拒绝码与文案子串（提案 §B1.5 冻结）。 */
  guardVerdictCodes: { job: 'E_GUARD_JOB_FOREGROUND', self: 'E_GUARD_SELF_FOREGROUND' },
  guardMessageNeedles: {
    must: '必须后台运行',
    jobExample: 'run_in_background: true',
    selfOmitted: '（省略即后台）',
    /**
     * 拿不到 `tools.guard` 时，注入器必须**点名缺的是哪一样**。
     * 🔴 0.2.1 换了措辞（旧句 `subagent 后台硬门未生效` 已经不存在）—— 判据改成钉**两个属性**：
     * ①「没有 tools.guard」这句话在；② 同一句里说清后果（`missingGuardConsequence` 命中任一）。
     * 这样"删掉整段告警"仍然红、"喊了但没说是哪样/没后果"也红 —— 比原来只钉一句原文更硬。
     */
    missingGuard: '没有 tools.guard',
    missingGuardConsequence: ['没有生效', '没挂上'],
  },
  /**
   * 骨架里必须留下的两条口径（`work-guidelines.md`，**10-17「静态文件只留骨架」之后义务落在这儿**）。
   * 原来的判据要的是 `NO-GO` 这个**词**——它在骨架化之后整份预设里 0 处（`leader.md` 也没有），
   * 所以判据改成钉骨架**实际保留下来的**那件事：**门禁装不上必须出声、但那不是拦截**。
   * 来历：`cand-20261017-static-files-keep-skeleton-only-01`（老板 2026-10-17「别往里写了」）。
   *
   * 🔴 `loud` 这根针钉的是**那一行上的义务**（`work-guidelines.md:44` 的原文是
   *    `⚠️ **门禁装不上时必须出声**（注入器会打 …）—— 但那只是出声、**不是拦截**。`）——
   *    它是一个**正则源串**（按行匹配，`guard.test.mjs` 用 `new RegExp` 建），不是字面子串：
   *    「出声」两个字在同一份骨架里到处都是（该行后半句、`review.md`、`inject.js` 注释…）⇒ 拿它当针时，
   *    把该行的义务改成「门禁装不上时注入器会打一条日志」而**后面那句"只是出声"留着**，判据照旧绿。
   *    翻面输入就是那把刀 `K14`（它在新针下红、在旧针下存活 —— 已量过）。
   * 🔴 但它也**不许钉字面邻接**（2026-10-19 第 4 关复审 R-2）：`B-6` 那张待挂的票要把施动者写出来 ——
   *    「门禁装不上**时，注入器**必须出声」—— 义务一个字没少，字面针会**当场假红**。
   *    ⇒ 允许中间夹少量字（`[^\n]{0,10}` 吃得下 `时，注入器`）。
   *    两个方向都量过：`K14`（义务被换掉）⇒ 红；`A1`（写清施动者）⇒ 绿。
   */
  guardDocNeedles: { loud: '门禁装不上[^\\n]{0,10}必须出声', honest: '不是拦截' },
  /** officeBound 写边界的两个拒绝码（提案 §B1.5 冻结）。 */
  officeBoundCodes: { shell: 'E_GUARD_OFFICE_SHELL', write: 'E_GUARD_OFFICE_WRITE' },
  /** AGENTS.md 3e 的报文判据：门禁报文一定带这个前缀（用来与"工具自己的报错"分开）。 */
  officeBoundMessagePrefix: '你的岗位（',
  /**
   * 活体 `inject.js` 里写权限判定的现成语义（**从活体只读核出**，纯函数必须"语义一字不改"）：
   *   `WRITE_TARGET = { write: 'file_path', edit: 'file_path' }` · `SHELL = ['bash','pwsh']`
   *   `landsInOffice()` 用 `resolve(cwd, target)` 算**落点**再判 `.team/`（`..` 穿越因此被吃掉）
   *   `agent.session.header.cwd` 就是那个 cwd
   */
  officeBoundSemantics: {
    writeTarget: { write: 'file_path', edit: 'file_path' },
    shellTools: ['bash', 'pwsh'],
    cwdPath: 'agent.session.header.cwd',
  },

  // ── 追加裁定 v1.3（D-B3 / D-B4 / 退出码）────────────────────────────────
  /**
   * **D-B4**：`isCullEligible(entryN)` 的字段形状（冻结）——
   *   `entryN` 是**已发布 N 快照里的条目记录**，带 `double_low_streak:number` 与 `is_double_low:boolean`
   *   （都是 N 的发布值，**不许当前进程重算**）；判定 = `is_double_low === true && double_low_streak >= 3`。
   * ⚠️ 批次 D 里的"三键兼容试探"已**删除**；快照条目 schema 必须加 `is_double_low` 这一列。
   */
  cullEligibleShape: { streakField: 'double_low_streak', flagField: 'is_double_low', minStreak: 3 },
  /** 快照条目比 §B3.6 原表**多出来的**那几列（D-B4 加的那一列）。 */
  snapshotEntryExtraFields: ['is_double_low'],
  /** **D-B3**：`init` 只在**空根**成功；非空根 ⇒ `E_DATA_EXISTS`（exit 7）。 */
  initRequiresEmptyRoot: { code: 'E_DATA_EXISTS', exit: 7 },

  /** 五条固定 team_* 行（逐字不变 —— 含关着的 `team-retro`：关掉 ≠ 删掉，行与它的 `toolName` 都还在）。 */
  fixedTeamTools: ['team_design', 'team_dev', 'team_test', 'team_review', 'team_retro'],
  fixedTeamRowIds: ['team-design', 'team-dev', 'team-test', 'team-review', 'team-retro'],
  /**
   * 其中**已启用**的那四条 —— 用来推"已启用的具名委派"全集（`team-retro` 关着，不算）。
   * 与上面那个 `fixedTeamTools` 分工：那条是**行形状**的清单（五条都要逐字对），这条是**注册面**的清单。
   */
  enabledFixedTeamTools: ['team_design', 'team_dev', 'team_test', 'team_review'],
  /** ⚠️ 其中 `backgroundMode` 已**零读点**（0.2.1 撤掉了这个键，见上面 `FROZEN.retired` 那条 🔴）；`maxDepth` 仍在判据里。 */
  bareSubagent: { toolName: 'subagent', backgroundMode: 'continuable', maxDepth: 1 },
  teamMaxDepth: 1,
  /** 三条 disabled 子代理行必须保持 disabled（`tool-subagent-fork` / `-codex` / `-claude-code`）。 */
  disabledSubagentRowIds: ['tool-subagent-fork', 'tool-subagent-codex', 'tool-subagent-claude-code'],
  /** `disabled: true` 的**有效**行（不含 `!!js` 平台二选一那一对）—— 五项，`team-retro` 是"关掉不删"的那一条。 */
  disabledLiteralRowIds: ['tool-subagent-fork', 'tool-subagent-codex', 'tool-subagent-claude-code', 'team-retro', 'tool-plugin-manager'],
  /** 旧进度板认人正则（`inject.js` 的 TEAM_TOOL / HIRE_TOOL）—— `job_*` 必须零命中。 */
  oldBoard: { teamToolRe: '^team[_-]([a-z0-9][a-z0-9-]*)$', hireTool: 'subagent' },

  /** 九个角色的文件名（`team/<role>.md`）—— 四个固定岗位 + `hire` + 四类一次性作业。 */
  teamRoles: [
    'design', 'dev', 'test', 'review', 'hire',
    'memory-judge', 'memory-review', 'conversation-review', 'technical-review',
  ],

  /** 记忆核心常量（提案 §4）。⚠️ 2026-10-18 老板拍：字符参考线 60000 → 80000。 */
  caps: { count: 200, chars: 80000 },
  halfLifeDays: { general: 365, boss: 365, machine: 180, project: 90 },
  typeIds: ['general', 'boss', 'machine', 'project'],
  streakK: 3,
  lowLineQuotaRule: 'ceil(0.2n)',
  lowLineMinN: 5,
  leases: { update: 90, local: 45 },
  charMetric: { unit: 'unicode-code-point', normalization: 'strip-bom+lf', scope: 'entry.text' },

  /**
   * 五关词 denylist（拍板 Q5：**取并集**、bare / 仅空白 / 仅"阶段"后缀变体**硬拒绝**）。
   * 带额外限定的复合名（如"老板验收阶段"）**允许** —— 不做子串匹配。
   */
  fiveGateDenylist: ['方案', '实施', '内测', '评审', '验收', '定形', '契约与测试', '实现', '独立评审'],
  /** 明说允许的复合名（拍板 Q5 原文举的两个例子）。 */
  stageNamesAllowedWithQualifier: ['老板验收阶段', '功能验收阶段'],
  /** 可显示的大阶段名（v5/now 里的六段）。 */
  legalStageNames: ['讨论阶段', '计划阶段', '执行第一阶段 · 停机安装之前', '执行第二阶段 · 停机安装之后', '脑暴阶段', '等你试用阶段'],
  legalStageIds: ['discuss', 'plan', 'execute-1', 'execute-2', 'brainstorm', 'awaiting-trial'],

  /** 退出码表（提案 §B1.4）—— CLI / 健康判定 / 测试断言三处共用同一份。 */
  exitCodes: {
    E_USAGE: 2, E_ARG_SCHEMA: 2, E_ARG_HASH: 2,
    E_ROOT_MISSING: 3, E_ROOT_RELATIVE: 3, E_ROOT_REAL_BRAIN: 3, E_ROOT_C_DRIVE: 3,
    E_ROOT_UNC: 3, E_ROOT_NO_MARKER: 3, E_ROOT_OUTSIDE: 3, E_PATH_ESCAPE: 3,
    E_LOCK_HELD: 4, E_LOCK_STALE: 4, E_CAS_STALE: 4, E_TXN_IO: 4, E_TXN_TOKEN: 4,
    E_EVIDENCE_MISSING: 5, E_EVIDENCE_TRANSCRIBED: 5, E_EVIDENCE_TIME: 5,
    E_EVIDENCE_NOT_MATCH: 5, E_EVIDENCE_USED: 5, E_EXIT_CRITERIA: 5,
    E_STAGE_NAME_FORGED: 5, E_STAGE_MULTI_CURRENT: 5, E_TASKS_OPEN: 5,
    /** C-2 冻结的 `rejectCode`；退出码按同类（校验拒绝）= 5。 */
    E_OP_INVALID: 5,
    /** E-B5（追加裁定 v1.4）：`redo:true` 缺老板点名证据 ⇒ 拒绝（**exit 5**）。 */
    E_REDO_NOT_AUTHORIZED: 5,
    E_TASK_STAGE_MISMATCH: 5, E_TASK_MULTI_CURRENT: 5, E_TASK_NOT_FOUND: 5,
    E_TICKET_SOURCE_BAD: 5, E_TICKET_DUP: 5, E_TICKET_NOT_FOUND: 5, E_TICKET_STATUS: 5,
    E_TICKET_TRANSITION: 5, E_TICKET_EVIDENCE_MISSING: 5, E_TICKET_VOID_REASON: 5,
    E_TICKET_VOID_REPRESENT: 5, E_COVERAGE_MISSING: 5, E_COVERAGE_DUP: 5,
    E_COVERAGE_EXTRA: 5, E_COVERAGE_TICKET: 5, E_COVERAGE_REASON: 5, E_RECEIPT_HASH: 5,
    E_CS_UNCONFIRMED: 5, E_CS_CHANGED: 5, E_CAP_COUNT: 5, E_CAP_CHARS: 5,
    E_STREAK_NOT_ELIGIBLE: 5, E_FENCE_STALE: 5, E_JOB_FENCE_STALE: 5,
    E_STATE_PHASE: 6, E_STATE_TYPE_CAP: 6, E_CLAIM_HELD: 6, E_CLAIM_MIXED: 6, E_CLAIM_NOT_FOUND: 6,
    E_DATA_EXISTS: 7, E_DATA_MISSING: 7, E_DATA_CORRUPT: 7, E_ROUTE_MISSING: 7,
    E_ROUTE_TAMPERED: 7, E_ROUTE_HALF_WRITTEN: 7,
    E_INTERNAL: 8,

    // ── v1.11 ④ 补齐：以下 11 个码原先只有实现表有（值以 staged `lib/error-codes.mjs` 为准）──
    // 隐患（组长点名）：这张表被当成"期望值"用；缺码时**查不到期望 ⇒ 静默空过**，比红更坏。
    E_ARG_USAGE: 2,
    /** C-6 冻过的那个码（"只由 `lib/receipt.mjs` 的回执写入函数产生"）—— 之前竟然漏在本表外。 */
    E_RECEIPT_OVERWRITE: 5,
    E_MANIFEST_MISSING: 7, E_MANIFEST_MISMATCH: 5,
    E_ROUTE_EXISTS: 7, E_JOB_UNKNOWN: 7,
    // guard 那五个**不是 CLI 退出码**（工具调用层的拒绝码，住 `inject.js`）—— 归口给 5 只为让 `CODES[code].exit` 有确定值。
    E_GUARD_JOB_FOREGROUND: 5, E_GUARD_SELF_FOREGROUND: 5,
    E_GUARD_OFFICE_SHELL: 5, E_GUARD_OFFICE_WRITE: 5, E_GUARD_CONFIG_MISSING: 5,
  },

  /**
   * 三个 CLI 的 op 清单（提案 §B1.4）—— DR 用例的分母；新增 op 必须同批进清单。
   *
   * 🔴 **`--real-mode` 不在这张表里，也永远不许进** —— 它不是 op，是**开关**：
   *    `--op help` 的 op 数照样只由这里那几张表决定，开关一个都不占。
   *    它有自己的用例（`integration/data-root.test.mjs` 的 DR-01 里那组 `real-mode-*` 读数）——
   *    "有行为就必须有用例"这条规矩照样成立，只是落点不在 op 表上。
   *
   * ⚠️ `init-real` 是**唯一**能落真实库的 op（`lib/paths.mjs::realInitVerdict` 三道硬闸）。
   *    它 `writes: true` ⇒ 进 DR-01 的"写命令"名单；但它**不进那张非法根矩阵** ——
   *    矩阵里「真实脑根（原样）」那一格会真把真实根交给它，安全与否只取决于"与 `--test-mode` 互斥"
   *    那一道闸（派工单定性：那是"碰巧对"，不是"看得出来在护什么"）⇒ DR-01 把它**单列一组**钉码。
   */
  ops: {
    'agenia-brain.mjs': [
      { op: 'init', writes: true },
      // 一次性开库（只在"还不存在"的真实根上成功）—— 详见上面那段 ⚠️。
      { op: 'init-real', writes: true },
      { op: 'state-read', writes: false },
      { op: 'daily-start', writes: true }, { op: 'claim-update', writes: true },
      { op: 'candidates-freeze', writes: true }, { op: 'judge-start', writes: true },
      { op: 'judge-commit', writes: true }, { op: 'review-start', writes: true },
      { op: 'proposal-import', writes: true }, { op: 'maintenance-import', writes: true },
      { op: 'snapshot-read', writes: false }, { op: 'snapshot-list', writes: false },
      { op: 'entry-count', writes: false }, { op: 'report-read', writes: false },
      { op: 'health-read', writes: false }, { op: 'job-mark', writes: true },
      { op: 'audit-append', writes: true }, { op: 'snapshot-archive', writes: true },
      { op: 'cs-confirm', writes: true },
      // 会话包（2026-10-15 加 · v1.7 裁剪 / v1.8 人话）—— **生产侧 21:17 就进了活体清单，测试侧一直漏着**
      // ⇒ DR-01 的 `CLI-INVENTORY` 常驻红一条（2026-10-16 技术评审 F1，P1）。它 `writes: true`
      // （落 `<工作区>/.team/retro/<day>/conversation-packet/`，并往脑侧记一条审计）⇒ 按规矩**同批进这张表**。
      // ⚠️ 于是它也进了 DR-01 那张"非法根 × 写命令"矩阵 —— **安全**：它的根判定照样走 `main()` 第 1226 行
      //    那条 `resolveRoot()`（`--data-root` 那一道**先于** op 分派跑），真实根姿势在 op 跑起来之前
      //    就被 `E_ROOT_REAL_BRAIN` 拒掉，一个字节都不写。
      //    （它**另外**那套 `resolvePacketWorkspace()` 判的是**落点**，与 `--data-root` 那道闸并存、不互相替代。）
      { op: 'session-packet', writes: true },
      // `judge-pending`（2026-10-16 加 · T-MEM-07）：机械算「池子 − 已判」= 还没判过的 id 清单，
      // 顺带点名孤儿。**只读**：不写池子、不写索引、不推状态 ⇒ `writes: false`。
      // ⚠️ `writes: false` 的后果要认：它**不进** DR-01 那张"非法根 × 写命令"矩阵（那矩阵只跑写命令）。
      //    安全上不吃亏 —— 它一个字节都不写；它的根判定照样走 `main()` 那条 `resolveRoot()`
      //    （`--data-root` 那一道**先于** op 分派跑）。
      // 🔴 **同批**：生产侧 `lib/cli-inventory.mjs` 与 `bin/agenia-brain.mjs`（OP_NAMES / OPS 分派）
      //    必须同批加，否则 DR-01 的 `CLI-INVENTORY` 与 V7 那两条当场红。
      { op: 'judge-pending', writes: false },
      { op: 'help', writes: false },
    ],
    'agenia-route.mjs': [
      { op: 'init', writes: true }, { op: 'stage-graph-set', writes: true },
      { op: 'stage-enter', writes: true }, { op: 'task-set', writes: true },
      { op: 'ticket-open', writes: true }, { op: 'ticket-update', writes: true },
      { op: 'ticket-close', writes: true }, { op: 'ticket-void', writes: true },
      { op: 'read', writes: false }, { op: 'verify', writes: false },
      { op: 'summarize', writes: false }, { op: 'help', writes: false },
    ],
    'agenia-local.mjs': [
      { op: 'local-read', writes: false }, { op: 'local-claim', writes: true },
      { op: 'local-mark', writes: true }, { op: 'local-receipt-set', writes: true },
      { op: 'local-fail', writes: true }, { op: 'health', writes: false },
      { op: 'receipt-check', writes: false }, { op: 'help', writes: false },
    ],
  },

  /** 生产文件名（提案 §B1.3）—— 测试按这些名字找被测对象，找不到就是 RED-SURFACE。 */
  binFiles: [
    'agenia-brain.mjs', 'agenia-route.mjs', 'agenia-local.mjs',
    'install.mjs', 'rollback.mjs', 'release-scan.mjs', 'bg-notify.mjs',
  ],
  libFiles: [
    'error-codes.mjs', 'paths.mjs', 'atomic.mjs', 'clock.mjs', 'liveness.mjs', 'memory.mjs',
    'state.mjs', 'snapshot.mjs', 'reports.mjs', 'proposals.mjs', 'route.mjs', 'tickets.mjs',
    'evidence.mjs', 'local-state.mjs', 'health.mjs', 'receipt.mjs', 'manifest.mjs',
    'cli-inventory.mjs',
  ],

  /**
   * STAT-04 的文档清单（契约 §13.5 列的那批）。
   *
   * 🔴 **`STAT-04` 实际读的是 `static/docs.test.mjs` 的 `DOC_SPECS`，这张表零读点** ——
   *    它只是给人对照的口径。所以往这里加一个名字之前先答一句：**谁会读它？**
   *    答不出来就别加 —— 一个"声明了但零读点"的名字是假账：它让读者以为那份文件被管着，
   *    而盘上它可能是 1 字节占位、甚至不在、整套判据一声不响。
   *    这一栏现在与 `DOC_SPECS` 的 6 份逐项同名，多一处少一处都要先改那边。
   */
  docs: [
    { rel: 'leader.md', root: 'staged' },
    { rel: 'work-guidelines.md', root: 'staged' },
    { rel: '说明.md', root: 'staged' },
    { rel: 'README.md', root: 'repo' },
    { rel: 'AGENTS.local.md', root: 'repo' },
    { rel: '.team/leader/now.md', root: 'repo' },
  ],
  /** 文档清单里**路径没冻结**的几项 —— 只记录读数、不当失败（裁定 A7/A8）。 */
  docsUnresolved: ['报告模板', '名册说明'],
  /** 裁定 A7：`重启卡` 的路径**已有**（只记录、不判红）。 */
  restartCard: 'E:\\Harness\\.team\\leader\\2026-10-13\\agenia-upgrade-restart-card.md',

  /** DOC-01 读的三份载体（契约 §6.1 的读时清单）。 */
  docConsistency: {
    readingVersion: 'E:\\Harness\\.team\\leader\\2026-10-13\\Agenia升级-计划书-老板阅读版.md',
    leaderNow: 'E:\\Harness\\.team\\leader\\now.md',
    leaderLog: 'E:\\Harness\\.team\\leader\\2026-10-14\\log.md',
  },
}

// ── 只读小工具 ─────────────────────────────────────────────────────────────
export function readText(p) {
  return readFileSync(p, 'utf8')
}

export function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function exists(p) {
  return existsSync(p)
}

/** 冻结的绝对落点（路径表）与 RUN_ID 目录拼装。 */
export function runPaths(runRoot) {
  const root = runRoot
  return {
    root,
    marker: path.join(root, TEST_ROOT_MARKER),
    tmp: path.join(root, 'tmp'),
    state: path.join(root, 'state'),
    nowFile: path.join(root, 'state', 'now.txt'),
    brainRoot: path.join(root, 'brain-root'),
    workspace: path.join(root, 'workspace'),
    workspaceTeam: path.join(root, 'workspace', '.team'),
    fixtures: path.join(root, 'fixtures'),
    installCopy: path.join(root, 'install-copy'),
  }
}
