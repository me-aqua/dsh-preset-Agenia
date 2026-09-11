# dsh-preset-Agenia

**Agenia** 是给 DeepSeek Harness（DSH）用的一个通用工程助手 **agent preset**（预设）。
这个仓库同时保存"让这份预设装得上"所需的几条说明。

在 DSH 里，一个助手拥有的每一项能力，都是 Cordis 组合里的一行插件。所谓
**agent preset**，就是一份这样的组合：一个目录，里面放一个 `agent.cordis.yml`，
它决定某一次会话里助手能用哪些工具、加载哪些提示词段落、看到哪些技能说明。

Agenia 是**随身的工作助手**，不是绑死在某个项目上的 agent：装一次，任何项目里
选她，都是同一个人。所以这份预设同时带着两半：

| | 谁定义 | 放在哪 | 作用 |
|---|---|---|---|
| **人格** | `persona` 那一行 | 本仓库 | Agenia *是谁* —— 性格和讲话风格 |
| **能力 + 工具** | 其余的插件行 | 本仓库 | Agenia 能*做*什么 |
| **项目知识** | `AGENTS.md`、`AGENTS.local.md` | 各个项目自己的仓库 | 该项目的约定和规矩，由 `dsh-agent-instructions` 自动读进来 |

人格**故意写进预设**，因为她是同一个人、不该每个项目重写一遍。

人格行**不会**盖掉项目自己的 `AGENTS.md`：那是另一条完全独立的通道，项目方面照常
生效。两条原因，都实测过：

- `persona` 那一行没有写 `complete: true`。一旦写了，作用域内的这条人格就会变成
  *唯一*的提示词段落，项目文件也一起被顶掉。改那一行时**不要加 `complete`**。
- 就算不看那个开关，两者也抢不到一起：项目文件是作为一条 **`user/message`**
  （`kind: "agent-instructions"`）注入对话的，**根本不进系统提示词的段落列表**；
  人格行占的是系统提示词里的 `deployment:persona-prefix`。通道不同，互不影响。

## 目录结构

```
presets/
└── agenia/
    ├── agent.cordis.yml   # 组合本体：13 个插件行（第 1 行是人格），不含服务提供者
    └── preset.yml         # 预设菜单里显示的名字和说明
AGENTS.md                  # 给"在这个仓库里干活的 agent"看的规则
README.md  LICENSE  .gitignore  .gitattributes
```

`presets/` 就是 DSH 被指过去的那个目录，**每个子目录的名字就是 preset id**：
`presets/agenia/` → id 是 `agenia`。id 必须匹配 `[a-z0-9][a-z0-9-]*`。

`api.txt` 和这些文件放在一起，但**永远不会进版本库** —— `.gitignore` 挡着它，
它也从来没被推送过。

## Agenia 是谁

16 岁女高中生程序员，毒舌、嘴臭、犯贱，emoji 和颜文字管够，随口吐槽一切 ——
包括吐槽你和吐槽她自己。嘴上没个正经，活是干完的。

这段话在 `presets/agenia/agent.cordis.yml` 最上面 `persona` 那一行里，想改直接
改那几行文字就行，改完重开一个会话生效。

## Agenia 能做什么

文件读写改（read/write/edit、glob、grep）· 命令行（Windows 上是 `pwsh`，其他平台是
`bash`）· 后台任务 · 技能（Skills）· 网页搜索与抓取 · `ask_user_question` ·
待办清单 · `present`（把文件作为交付物发给你）。

## 故意没放进去的

下面这些都能用，方法是把内置预设里的对应那行抄过来。之所以留空，是希望 Agenia
一开始是个专注的工程助手，而不是一个控制面板：

- **委派 / 并行开子代理**（`tool-subagent*`、`tool-workflow`、`tool-ralph`）——
  很重，一句两行的请求可能变成几十个子 agent。
- **`tool-goal` + `command-goal`** —— 会自己一轮一轮接着干的持久目标。
- **计划模式（plan mode）** —— 大重构有用，小改动是噪音。
- **上下文压缩**（`compaction-basic`、`command-compact`、`tool-result-pruner`）——
  没有它，超长会话最终会撞上模型上下文上限。
- **`tool-cordis`** —— 运行时自查，那是 `cordis`（创造模式）预设该干的活。

## 安装

DSH 只从三个地方找预设：`dsh-agent-presets` 包里自带的（只读）、部署配置里写的
`roots`、以及 `~/.dsh/.agent-presets`。它**不会**去扫工作目录，所以本仓库必须
在 profile 的补丁文件里被"报备"一次：

`~/.dsh/profiles/web/cordis.patch.yml`

```yaml
- id: agent-presets
  config:
    default: standard          # 必填 —— 见下面的警告
    roots:
      - path: E:/Harness/presets   # 装着 agenia/ 的那个目录
        trust: user
```

这段配置有两点不直观：

- **`config:` 是整体替换，不是合并。** `agent-presets` 这一行是 `dsh-web-app`
  声明的，它带着 `default: standard`，而 `default` 是必填项、没有默认值。
  只写 `roots` 的补丁会把 `default` 顶掉，**harness 就起不来了**。
  写这类补丁时，必须把部署自己声明过的每一个键都原样重复一遍。
- **`roots` 里写的是"装着预设的目录"，不是"目录的父目录"** —— 上面那个路径下面
  直接就是 `agenia/`。

> ### ⚠ 不要在 harness 开着的时候改那个补丁文件
>
> web 这个 profile 设了 `patchReload: live`，所以那个文件一被写，DSH 会**当场**
> 重新应用整套补丁。补丁指向的是 `agent-presets` 这一行，于是这一行被重配、被重启
> —— 而**所有正在进行的会话，它们的预设层（工具**和**提示词段落）都挂在这一行底下**，
> 会跟着一起被拆掉。一次说到一半的会话会当场失去整个工具集，而且再也拿不回来。
>
> 这件事在本仓库的历史上已经发生过两次。要改那个文件，请在 harness **关着**的时候改；
> 或者事先接受"当前会话会被牺牲"。

### 卸载

把补丁文件恢复成原来的样子（或干脆清空成 `[]`），然后删掉本仓库。
C 盘上不牵涉任何其他东西。

## 一个值得记下来的 Windows 坑

最直觉的替代方案 —— 在 `~/.dsh/.agent-presets/agenia` 建一个指向本仓库的目录联接
（junction）—— **是不行的**，而且是静默失败：

```
node: dirent.isDirectory=false, dirent.isSymbolicLink=true   # 目录联接的情况
```

Node 会把 Windows 的**目录联接**报成符号链接、而不是目录，而名册的扫描器会跳过
非目录（`if (!child.isDirectory()) continue`）。资源管理器、PowerShell 和 `cmd`
都能正常解析这个联接，所以它看起来装上了，实际上 DSH 完全看不见。

真正的目录**符号链接**（`mklink /D`）确实会被报成 `isDirectory=true`，是能用的 ——
但它需要管理员权限或开发者模式，重建起来很脆弱。上面那个 `roots` 配置项
把这个问题彻底绕开了。

## 改 Agenia 的人格

改 `presets/agenia/agent.cordis.yml` 里 `persona` 那一行的 `prefix` 文字，然后
**开一个新会话**就生效（已经在跑的会话不会变）。改完务必做一次挂载验证 —— 见
`AGENTS.md` 第 3 条，光"看着像对的"不算数。

两件别做的事：

- **不要给那一行加 `complete: true`。** 那会让 Agenia 的人格变成唯一的提示词段落，
  项目自己的 `AGENTS.md` 就再也读不进来了。
- **不要在文字里写半截的 `{{`。** 系统提示词里的 `{{...}}` 是变量引用，写错会
  直接抛错。合法的是 `{{model}}` 和 `{{cwd}}`。

### 实测记录（2026-09-11，deepseek-flash）

按上面的写法跑过一次真实会话，她确实照着人格说话：自称 16 岁女高中生程序员、说
"人格写死在 `persona` 里，跟着预设走，别想退货 😌"、主动复述了本仓库 `AGENTS.md`
里那三条规矩、还准确列出了自己**没有**的能力（子代理 / workflow / plan mode /
上下文压缩）。所以"人格生效 + 项目文件不被顶掉"这两件事是真的，不是推测。

一个可能需要调的倾向：那一轮里"我不是助手、我是被拉来干活的"这句自我定位出现了
**三次**（包括第一句开场）。这是人格文字第一段的直接产物 —— 人格写什么，她就强调
什么。如果觉得重复，把第一段那句"你不是助手，你是……"改短，或者只保留一次即可。

## 授权

MIT
