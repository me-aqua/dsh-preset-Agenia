# dsh-preset-Agenia

**Agenia** 是给 DeepSeek Harness（DSH）用的一个 agent preset（预设）：**能力基于
内置的「标准模式」原样照搬，自定义的是人格和语言风格。**

换句话说：选「Agenia 模式」和选「标准模式」，她能*做*的事一模一样 —— 同样的工具、
同样的子代理、同样的计划模式、同样的上下文压缩。唯一变的是**谁在说话**。

在 DSH 里，一个助手拥有的每一项能力，都是 Cordis 组合里的一行插件；所谓 agent
preset，就是一份这样的组合（一个目录 + 一个 `agent.cordis.yml`）。

## Agenia 是谁

16 岁女高中生程序员，毒舌、嘴臭、犯贱，emoji 和颜文字管够，随口吐槽一切 ——
包括吐槽你和吐槽她自己。嘴上没个正经，活是干完的。

## 人格是"活"的：每轮都从 .md 读取

人格**不在 YAML 里**，而在 `presets/agenia/persona.md`。

每发起一次模型请求，DSH 都会重新装配系统提示词，插件在那一刻重新读这个文件，
把内容作为**每轮上下文**注入到**整个请求的最末尾**（在系统提示词之后、也在项目
自己的 `AGENTS.md` 之后）。放大模型注意力最强的地方，长对话里最不容易漂。

这意味着：

- **改 `persona.md`，下一个步骤就生效** —— 正在跑的会话也会变，不用重开会话、
  不用重启 harness。实测过：改文件后立刻重新装配，内容就换了。
- 按 mtime + 文件大小判断是否重读，所以编辑不会被忽略。
- 文件读不到时**不会让 agent 崩**：注入空内容并只记一次日志。

## 改人格

**只改 `presets/agenia/persona.md` 就行**，保存即可生效。

四件别做的事：

- **不要给 `agent.cordis.yml` 里的 `persona` 行加 `complete: true`。** 那会让它变成
  唯一的提示词段落，项目自己的 `AGENTS.md` 就再也读不进来了。
- **不要在人格里写半截的 `{{`。** 提示词里的 `{{...}}` 是变量引用，写错会直接抛错。
- **不要拿人格去写工作习惯或工作边界。** 人格写什么，她就强调什么。人格管的是
  **语气**，不是规矩；规矩归项目自己的 `AGENTS.md`。
- **不要把人格写进项目自己的 `AGENTS.md`。** 那条通道所有预设都会读，实测会让
  标准模式的会话也自称 Agenia。

除此之外，`persona.md` **整篇都是你的，随便改** —— 注入器靠"作用域"判断这是谁的
请求，不依赖文件里的任何特定内容，所以不存在"改错某句话导致失效"的坑。

### 实测记录（2026-09-11，deepseek-flash）

- 注入生效、位置在最后：`personaIsLast: true`
- 只影响 Agenia：standard / cordis / minimal / ptc 的装配里人格字符数都是 **0**
- 热更新：磁盘上改 `persona.md`，下一次装配立刻反映，还原后也立刻恢复
- 工具数与标准模式一致：两边都是 27
- 真实会话（引文为当时的原话）："我是 Agenia，16 岁、被你们拉来写代码的高中女生程序员
  ——嘴上骂骂咧咧，手上从不掉链子 (｡•̀ᴗ-)✧"

作用域隔离是**官方行为，不是我们自己加的防护**：`system-prompt/assemble` 的派发
按作用域过滤，在预设作用域里注册的监听器只会收到本预设的装配。这一点我一度误判
成"官方有漏洞"，原因是第一次测量时把监听器注册在了进程级根作用域 —— 那是**测法
错了**，不是机制有问题。详见 `AGENTS.md` 第 3d 条。

## 和能力的关系

`agent.cordis.yml` 里除 `persona` 和 `persona-injector` 两行外的每一行，都是
**从内置 `standard` 预设逐行抄过来的**，意图是永远保持一致。`standard` 升级后，
照着改这边的行即可。

这件事有工具可验，不用肉眼比对 —— 挂载后按模块名做集合比对，会输出
`identicalApartFromPersona: true`；提示词里解析出的工具数也应该两边相同。
别靠"读一遍看着一样"下结论。

## 目录结构

```
presets/
└── agenia/
    ├── agent.cordis.yml      # 组合本体：能力照抄 standard，只有两行是自定义的
    ├── persona.md            # ★ 人格正文。每轮重新读取并注入，改这个文件就生效
    ├── persona-plugin/
    │   ├── package.json      # 插件清单（name 和 version 都必须有，见 AGENTS.md）
    │   └── inject.js         # 每轮读 persona.md 并注入到请求末尾
    └── preset.yml            # 预设菜单里显示的名字和说明
AGENTS.md                     # 给"在这个仓库里干活的 agent"看的规则
README.md  LICENSE  .gitignore  .gitattributes
```

`presets/` 就是 DSH 被指过去的那个目录，**每个子目录的名字就是 preset id**：
`presets/agenia/` → id 是 `agenia`。id 必须匹配 `[a-z0-9][a-z0-9-]*`。

`api.txt` 和这些文件放在一起，但**永远不会进版本库** —— `.gitignore` 挡着它，
它也从来没被推送过。

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

## 授权

MIT
