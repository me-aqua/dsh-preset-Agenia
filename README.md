# dsh-preset-Agenia

**Agenia** 是给 DeepSeek Harness（DSH）用的一份 agent preset：**一个带班子的工程组长**。

选「Agenia 模式」和选「标准模式」，她能*做*的事**只会多不会少** —— 标准模式有的工具她
一样不少，另外多出一支固定编制的队伍和一道写权限边界。多出来的部分在下面全部列清了。

> **想把它装起来用？** 看 [`INSTALL.md`](INSTALL.md) —— 一步一步，每步都写了"怎么知道这步成了"。
> ⚠️ 那里面第一句就是：**没有"一条命令装上"这回事**，有一段配置必须手写（原因写在那里）。

## 她是谁

16 岁女高中生，现在是**这个组的组长**。干练、直接、有锋利感，emoji 和颜文字照用。

**该损就损，该卖乖就卖乖** —— 队员、老板、她自己，都能吐槽；但**损的是事，不是人**。
她唯一不给面子的东西是：**糊弄**。口头禅是「**证据呢？**」——
这句话她对组员说，也对自己说。

> 怎么说话在 `persona.md` 里有**整节例子**：emoji 和颜文字各一张表（每个都写明什么时候用）、
> 三种吐槽对象各一句示范、以及"什么能损、什么不能"的分界。

## 她的班子

六个人，六个时区，**从没见过面**。她们在一个青少年开源社区里认识，起因通常很随意：
有人手上有个做不完的东西，丢进群里，谁有空谁上。这一次的活儿是你的项目。

**她们从来不开会** —— 六个时区，任何"大家一起在线"的时间都是某个人凌晨三点。
所以这个组只有一种协作方式：**把该写的写下来**。谁做了什么、为什么这么做、留了什么坑，
全部进文档。

| 岗位 | 名字 | 出身 | 什么时候上班 |
| --- | --- | --- | --- |
| **组长**（兼技术把关） | Agenia | 中国 · 自学接活出身 | 永远 |
| **实现** | 佐西亚（Zofia） | 波兰 · 数学竞赛出身 | 每票活 |
| **测试与流水线** | 玛尔塔（Marta） | 德国 · 家里开面包店 | 每票活 |
| **独立评审** | 伊莫金（Imogen） | 英国 · 辩论队 + 校刊 | 每票活 |
| **产品与体验** | 比娅（Beatriz） | 巴西 · 社区青年中心志愿者 | 按需（需求模糊 / 你要文档） |
| **流程与复盘** | 阿玛拉（Amara） | 尼日利亚 · 青少年开源社区组织者 | 按需（你说"复盘"） |
| **临时外聘** | 由任务决定 | —— | 组长自己招，招聘要求她自己写 |

**每个人都有一个本子。** 组员每次都是全新的人，但上岗前三步固定：读自己的 `log.md`
→ 读自己的 `must-know.md` → 读任务；收工前写回去。**日志就是他们的记忆。**

## 五道关

| 关 | 谁 | 交出什么 | 什么算过 |
| --- | --- | --- | --- |
| **S0 定形** | 组长 | 一页纸：问题 · 目标 · 改动预算 · **不做清单** · 验收口径 | 验收口径能被验证 |
| **S1 契约与测试** | 测试 | 技术契约 + 测试用例集 | 覆盖正常/边界/异常；**功能没做时必须是红的** |
| **S2 实现** | 实现 | 代码 + 跑过的门禁输出 | 门禁全绿；不超预算 |
| **S3 独立评审** | 评审 | 通过 / 有条件通过 / 打回 | **不是作者**，且**没看过实现过程** |
| **S4 验收** | 组长 | 验收记录 | 逐条核对 S0；CI 全绿 |

**不是所有事都走全套。** 分诊是组长的第一职责：问一句话自己答；小改动自己干；
新功能、改行为、碰架构才叫人。**"工具密集型的活，多人协作是净亏损"** —— 这条写进了她的手册。

## 硬边界（结构性的，不是嘱咐）

- **产品 / 审核 / 流程只能写项目里 `.team/` 下的东西。** 往项目文件上写，
  系统当场拦下。**这三个角色也没有 shell** —— 一条通用 shell 就是一条通用写入通道，
  留着它这道边界就是纸的。
- **评审只审不改。** 她要看什么材料，组长给她。
- **组员不许再招人**（`maxDepth: 1`，结构上做不到）。
- **评审前后项目文件必须逐字不变**，否则这次评审作废、重来。

## 文件

被注入提示词的有**十二份**，按受众分两套（组长 / 组员）：

| 文件 | 管什么 | 组长 | 组员 |
| --- | --- | --- | --- |
| `persona.md` | 她是谁 | ✅ | ❌ |
| `leader.md` | 她作为组长怎么干活 | ✅ | ❌ |
| `process.md` | 工序：五道关、分诊、独立规则 | ✅ | ✅ |
| `team/world.md` | 队伍怎么来的、怎么协作 | ✅ | ✅ |
| `work-guidelines.md` | 十条工程原则 | ✅ | ✅ |
| `codebase-practices.md` | 具体技术实例库 | ✅ | ✅ |
| `team/<角色>.md` ×6 | 岗位说明书 | 名册里露一行 | **只拿到自己那份** |

**每一份都是 markdown，存盘即生效** —— 正在跑的会话下一个步骤就变。
另外 `DESIGN.md` **不进提示词**，它是给维护的人看的设计记录。

> ### ⚠ 改了注入器的代码（`packages/persona-plugin/inject.js`）必须重启 harness
>
> 那个文件是**代码**，ESM 按 URL 缓存，改它不会自动重新加载。而且**"导入失败"也会
> 被缓存**——它曾一度处于语法错误状态，导致之后无论怎么修都一直复用坏掉的实例，
> 注入**静默消失**（挂载、行状态全都正常）。
>
> **唯一管用的办法是重启 harness。** ~~行名里带 `?v=`，改完把数字加一~~
> ⚠️ **已失效 2026-09-20**：行名现在写的是裸包名 `@agenia/persona-plugin`。
> 实测（2026-09-20）装出来的落点是
> `…/profiles/web/node_modules/@agenia/persona-plugin/inject.js` ——
> **路径里既没有版本号、也没有查询串**，所以"升版本号 + 重装"同样换不出新 URL。
>
> **那十二份 .md 都不受影响**——它们每轮从磁盘读，改完存盘照旧即时生效。

## 改人格 / 改守则 / 改流程

**直接改那几个 .md 就行，保存即可生效。**

- **改她的性格** —— 改 `persona.md`。整个仓库没有第二处。
- **改她怎么带队** —— 改 `leader.md`（领导手册）。
- **改工序** —— 改 `process.md`。**改它要经过你批准**：她在会话里改这个文件会
  弹权限请求给你 —— 那个弹窗就是"她来找你"的方式。
- **改队员** —— 改 `team/<角色>.md`（名字和脾气都在里面）或 `team/world.md`（队伍设定）。
- **改工作方式** —— 改 `work-guidelines.md`（原则）或 `codebase-practices.md`（实例）。
  改这两份时守住一条：**每条要么有出处，要么是本仓库实测过的**。

四件别做的事：

- **不要给 `agent.cordis.yml` 里的 `persona` 行加 `complete: true`。** 那会让它变成
  唯一的提示词段落，项目自己的 `AGENTS.md` 就再也读不进来了。
- **不要在任何一份 .md 里写半截的 `{{`。** 提示词里的 `{{...}}` 是变量引用，
  写错会直接抛错。
- **不要把项目专属的规矩写进这些文件。** 它们是**全局**的，会跟着预设进每一个项目；
  项目自己的约定归项目自己的 `AGENTS.md`。
- **不要把队员的名字写进 `agent.cordis.yml`。** 名字只住在 `team/<角色>.md` 里，
  改名只改那一处。

## 和能力的关系（这条规矩 2026-09-16 改过）

**以前**写的是「除两行外全部照抄 `standard`，意图是永远一模一样」。
**现在不是了** —— 团队那六项是刻意加的能力。规矩改成：

> **`onlyInStandard` 必须为空；`onlyInAgenia` 必须正好是这八项**：
> `persona` · `persona-injector` · 五条 `team-*` 行 · `subagent` 行上的 `persona` 键。

有工具可验，不用肉眼比对：挂载后按 `moduleName + enabled + condition` 做**多重集**
比对（组员行让 `@deepseek-ai/dsh-tool-subagent` 出现 6 次，按集合比会漏）。
2026-09-16 实测：`standard: rows=28`、`agenia: rows=34`。

## 目录结构

```
presets/
└─ agenia/
   ├─ agent.cordis.yml        # 组合本体：能力照抄 standard，另加 8 项
   ├─ persona.md              # ★ 她是谁
   ├─ leader.md               # ★ 她作为组长怎么干活
   ├─ process.md              # ★ 工序：五道关
   ├─ work-guidelines.md      #   十条工程原则
   ├─ codebase-practices.md   #   具体技术实例库
   ├─ DESIGN.md               #   设计记录（不进提示词）
   ├─ team/
   │  ├─ world.md             #   队伍设定
   │  ├─ product.md  dev.md  test.md  review.md  retro.md   # ★ 五本岗位说明书
   │  └─ hire.md              #   临时外聘
   └─ preset.yml              #   预设菜单里的名字和说明
packages/
└─ persona-plugin/           # 注入器的**正式家**（不在 presets/ 里）
   ├─ package.json           #   name 和 version 都必须有
   ├─ inject.js              #   分源器 + 写权限门禁 + 流程账本
   └─ content/               #   十二份 markdown 的副本（没人指定内容根时的默认值）
README.md  INSTALL.md  LICENSE  .gitignore  .gitattributes
```

`presets/` 就是 DSH 被指过去的那个目录，**每个子目录的名字就是 preset id**：
`presets/agenia/` → id 是 `agenia`。id 必须匹配 `[a-z0-9][a-z0-9-]*`。

`api.txt` 和这些文件放在一起，但**永远不会进版本库** —— `.gitignore` 挡着它。
（维护者本机才有这个文件；**运行 Agenia 不需要它**。）

## 安装（第一次装，看这一节就够）

> 完整版、以及"卡住了怎么办"，在 [`INSTALL.md`](INSTALL.md)。**但下面五步就是全部。**

**0. 前提**：Node ≥ 22.13，以及 pnpm（没有就 `npm i -g pnpm`），以及一个能跑的 DSH
（`npx @deepseek-ai/dsh web`）。下面凡写 `dsh` 的地方，**没有全局 `dsh` 就写 `npx @deepseek-ai/dsh`**。

**1. 打包**

```sh
cd <仓库>/packages/persona-plugin
npm pack
```

→ 得到一个 `agenia-persona-plugin-<版本>.tgz`（15 个文件）。

**2. 装进 profile**

```sh
dsh plugin --profile web add <上面那个 .tgz 的路径>
```

→ 末行打印 `Done in …`、退出码 0。

- ⚠️ 会看到一句 `declares no dsh.bundle` 的**警告 —— 那是预期的，不是错误**：这个包是给预设里
  某一行当普通依赖用的，本来就不该是 profile 层。
- ⚠️ **别用 `npm install --no-save` 代替** —— 没登记进 `dependencies` 的包，
  下次谁跑一次 `pnpm install` 就会被当多余的东西清掉。

**3. ⚠️ 先把这个 harness 关掉，再改补丁文件**

> **为什么得关**：`~/.dsh/profiles/web/cordis.patch.yml` 是**热加载**的（这个 profile 设了
> `patchReload: live`）。**你一存盘，DSH 会当场重放整套补丁** —— 而**所有正在跑的会话**，
> 它们的预设层都挂在 `agent-presets` 那一行底下，会跟着一起被拆掉：工具一个个消失
> （`cordis_*` → `pwsh`/`read`/`write`），而且**不可恢复**。
> 本仓库的历史上已经这么丢过两次会话。**万一你已经这么干了**：关掉重来就行，配置本身没写坏。

在 `~/.dsh/profiles/web/cordis.patch.yml` 里加上这一段
（**已经有 `- id: agent-presets` 了，就只加 `roots` 那一项，别抄两遍** —— 同一个 id 出现两次会让
harness 报 `duplicate loader entry id` 起不来）：

```yaml
- id: agent-presets
  config:
    default: standard          # 必填，别删 —— config 是整体替换（见下）
    roots:
      - path: <仓库>/presets   # 装着 agenia/ 的**那个目录本身**，不是它的上一层
        trust: user
```

**4. 重启 harness** —— **重启 = 先停掉现在这个（在终端里 Ctrl-C），确认退了，再重新起。**

⚠️ **别直接再开一个**：两个实例会抢 `~/.dsh/.credentials.yaml` 的写锁，第二个会报
`atomic-write: timed out waiting for the writer lock`。

**5. 怎么知道成了**：新开一个会话 → 把预设那一格从「标准模式」切成「**Agenia 模式**」→ 问它
「你是谁？你收到的上下文里的"内容目录"是什么？」

- ✅ **成了**：它自称 16 岁的组长，并报出 `内容目录：<仓库>\presets\agenia`
- ❌ **那一格里根本没有「Agenia 模式」**：预设**没被发现** → 回第 3 步查
  （路径填成上一层了？补丁和 `dsh-web-app` 自带那行撞 id 了？）**和第 4 步**（真重启了吗）
- ❌ **能切到 Agenia，但它说自己是"编码 agent"**：**注入没生效** → 回第 2 步

### 为什么这么写（两点不直观，踩过）

- **补丁里的 `config:` 是整体替换，不是合并。** `agent-presets` 这一行是 `dsh-web-app`
  声明的，带着 `default: standard`，而 `default` 是必填项、没有默认值 ——
  只写 `roots` 的补丁会把 `default` 顶掉，**harness 就起不来了**。
- **DSH 只从三个地方找预设**：`dsh-agent-presets` 包里自带的（只读）、配置里写的 `roots`、
  以及 `~/.dsh/.agent-presets`。它**不会**去扫工作目录。
  **没有任何机制能让一个 npm 包装上就变成一份预设** —— 所以第 3 步是你的活。

### 卸载

```sh
dsh plugin --profile web remove @agenia/persona-plugin
```

然后**关掉 harness**（同第 3 步的理由），把补丁文件里那一行恢复成装之前的样子，再重启。

⚠️ `remove` 只清清单、**不清 `node_modules/@agenia/` 那个目录** —— 想彻底干净就手动删掉它。

（完整版含七行"踩过的坑"，见 [`INSTALL.md`](INSTALL.md) 第 8 步。）

## 一个值得记下来的 Windows 坑

在 `~/.dsh/.agent-presets/agenia` 建一个指向本仓库的**目录联接（junction）**
是**不行的**，而且静默失败：

```
node: dirent.isDirectory=false, dirent.isSymbolicLink=true
```

Node 会把 Windows 的目录联接报成符号链接、而不是目录，而名册的扫描器会跳过非目录。
资源管理器、`PowerShell` 和 `cmd` 都能正常解析这个联接，所以它看起来装上了，
实际上 DSH 完全看不见。上面那个 `roots` 配置项把这个问题彻底绕开了。

## 授权

MIT
