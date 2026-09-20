# DSH 插件生态调查：人格预设 / 固定团队 / 工作原则 / 每轮注入

调查日期：**2026-09-20**
调查目的：给「重做一版干净 agenia」做前置判断 —— 这四件事到底有没有人做过了。
调查渠道：GitHub `dsh-plugin` topic、awesome-dsh-plugin.com、awesome-deepseek-harness、dshbase.com、dsh-plugin.org、deepseek-harness-plugin.com、官方文档。

---

## 0. 一句话结论

**四件事全都有人做了，而且做的人不少；但「四合一」的成品只有两个，且它们的取舍跟 agenia 不同。**

具体说：

| 需求 | 生态成熟度 | 结论 |
| --- | --- | --- |
| 1. 加一个 preset | **原生能力**，不需要写插件 | 直接用官方 `agent-presets` |
| 4. 每轮注入防遗忘 | **极其成熟**，至少 12 个插件 | 直接用现成的，不要自己写 |
| 3. 自定义工作原则 | **成熟**，多数做成 skill 或常驻规则行 | 可复用，也可自己写 |
| 2. 固定编制团队 | **成熟但有分歧**：动态名册多、固定名册少 | 有 2 个几乎同构的成品，值得先跑一遍 |

所以结论不是「不用重做」，而是「**不用重写内核**」：agensia 的 injector 里有大约 2/3 的能力是生态已有的标准件，可以换成薄壳 + 复用。

---

## 1. 先看官方原生能力（决定「要不要造轮子」）

在做任何自研之前，必须先知道 DSH 自带的这几样：

### `agent-presets` —— preset 是一份目录，不是一个插件
- 一个 preset = 一个目录，里面 **`preset.yml`（展示元数据：name/description/order）+ `agent.cordis.yml`（本体：这个 agent 挂哪些插件）**
- 自己写的放 `$DSH_HOME/.agent-presets/<id>/`；id 规则 `[a-z0-9][a-z0-9-]*`
- 官方自带四个：`standard` / `code` / `minimal` / `cordis`
- `ctx.agentPresets.list() / resolve() / mount() / read() / copy() / remove()` 就是全部 API，**发现逻辑每次重新扫盘，新增 preset 不用重启**
- 硬约束：**提供服务的行必须挂在带 `isolate` realm 的分组里**，否则落进 process-global root realm 被拒

> 这条对 agenia 很关键：`agent.cordis.yml` 里那一堆 `cordis:group` + `isolate:` 不是作者的选择，是**框架要求**。重做一版也逃不掉。

### `@deepseek-ai/dsh-persona` —— 官方 persona 行，「自定义人格」的原生做法
- 配置字段：`prefix`（必填）/ `suffix`（默认空，**显式覆盖全局 suffix，不会继承**）/ `complete` / `includeRuntimeContext`
- 支持 `{{变量}}` 模板（`{{model}}`、`{{cwd}}`），**渲染时**而非装配时解析
- `complete: true` → 该行成为**唯一** system prompt section，别的身份/工具说明一律附加不上
- **只能在 agent scope 挂载**，挂到全局会跟 `deployment:persona-prefix` 撞名并 loud-fail

> 也就是说：agensia 里那个「**故意不含人格内容、只为 shadow 部署 persona**」的 `persona` 行，正是官方文档描述的用法。这不是野路子。

### 顺带一提
- `@deepseek-ai/dsh-system-prompt` 拥有全局 `deployment:persona-prefix`，**一个进程只有一个**
- 系统提示词是**有序 section 集合**，插件各贡献一段，按声明顺序拼装
- 内置 `/plan` 模式（`@deepseek-ai/dsh-plan-mode`）本身就是一个可组合的 text section，只在与不激活时贡献 0 token —— 这个「不激活就不花钱」的写法值得学

---

## 2. 四个需求 × 现有插件 对照

### 需求 1 + 4：人格 / 每轮注入（最拥挤的赛道）

| 插件 | 做法 | 与 agenia 的关系 |
| --- | --- | --- |
| **`@deepseek-ai/dsh-persona`**（官方） | system prompt section | agenia 用的就是这个 |
| **runfali/dsh-prompt-injector** | 设置页管理提示词清单，**每轮**以「上下文注入」提醒行注入 | **几乎就是需求 4 本身**；用途写的是"让纪律规则可靠生效" |
| **polohot/dsh-adrian-inject-context** | 独立 `Remember:` 行，插在用户消息**之后**；每条可设「每轮 / 每会话一次」；存 `~/.dsh/adrian-inject-context.json` | 比 agenia 多一个「每会话一次」的频率控制 |
| **Scorp1o117/dsh-soul-md** | 人设卡 → `soul:persona` section；支持按 **会话 / 工作区** 切换；AI 可 `soul_update` 自演化；带长期记忆 | 人格 + 记忆一体，UI 管理 |
| **orpheus0829/dsh-identity-control** | 输入栏旁人设按钮，`enabled` + `text` 两个字段 | 最简形态 |
| **LiFenrir/dsh-scenario** | 人设 + 模型 + 权限 打包成命名场景，一键热切换 | 比 agenia 多管了模型和权限 |
| **haimuhaimu/dsh-persona** | 人设 + **跨会话角色记忆** + 运行时切换，3 个内置人设 | 记忆那条 agenia 没有 |
| **WASD258-jpg/dsh-prompt-inject** | 每会话 system prompt section + 模板库 + 变量插值 + UI 下拉 | 编辑体验更完整 |
| **Moeblack/dsh-prompt-studio** | 编辑用户/内置 system prompt section，**实时预览** | 调试利器 |
| n0pe-sled/system-prompt-editor | 编辑组装后 prompt，实时预览 | 同上 |
| chaserchan/dsh-plugin-global-prompt | 全局提示词框，注入每对话 system prompt | |
| masknull/dsh-session-prompt | 会话 system prompt 顶部注入 | |
| CeilCelia/dsh-eli-mode | wiki 驱动长期记忆 + 技能的 preset | 整个 preset |
| bychv/dsh-preset-enhance | **SillyTavern 风格宏引擎** + 编辑器 | 宏系统 |
| john-walks-slow/dsh-simulated-life | 注入模拟生活上下文 | |

**判断**：这一层完全可以不自研。agensia 真正自研的是「**从磁盘 markdown 每步重读、改文件下一步生效**」这个特性 —— 但 `dsh-adrian-inject-context` 已经写明「freshly read from the store on every step」，机制重合。

### 需求 2：固定编制团队（关键分歧点）

| 插件 | 编制 | 与 agenia 的关系 |
| --- | --- | --- |
| **stuarthu/dsh-crew** | 会话变 PM，带 architect / engineer / test engineer / code engineer / QA / code reviewer / security reviewer / doc reviewer / researcher；**每角色工具集锁定**；角色定义在 `~/.dsh/.agent-presets/crew/agent.cordis.yml` | **最接近**。同样是「preset + 固定角色 + 工具边界」 |
| **yangdcm/dsh-expert-team** | **12 角色 + 9 阶段门控流水线**（clarify→research→design→spec review→plan approval→implement→review→test→deliver）；**own persona / toolFilter / maxDepth: 1**；质量门禁**由插件代码强制**；自己铺好 preset；持久团队模式；实时 overlay | **最接近，且比 agenia 工业化** |
| songoao25/virtual-product-team | PM → 工程师 → QA → 发布 | 同构 |
| Asher-2000/dsh-expert-mode | 首席协调官 + **11 位**领域专家子代理 | 同构 |
| ninipa/oh-my-dsh-slim | 编排器 + 5 种角色 | 同构 |
| MichengAI/dsh-agency-agents | 可召唤领域专家名册，父会话保留任务与最终答复 | 同构 |
| Socialist-Sister/dsh-collaboration | 协同模式 preset + 专家名册（main/planner/reviewer/looker），支持并行审查、圆桌评审、模型对比 | 有 agenia 没有的多人会话工具 |
| ABccgh/dsh-smith | preset：构建 harness agent，设计思维 + 四人专家 | 同构 |
| RossBool/dsh-plugins | 协作编排、团队模式、计划引擎 | |
| **NanmiCoder/dsh-agent-teams** | 1724★，最流行。Captain + **可续聊持久成员** + 任务 DAG + 直达邮箱 + Web 活动面板 | **名册是动态创建的，不是固定编制** —— 和 agenia 是两种哲学 |

**作者自己的话很值得读**（dsh-agent-teams）：
> 「如果只是临时拆分几个任务，DSH 内置的多 Agent 工具已经完全够用了。只有任务需要长期推进、成员反复协作，还要管理任务依赖和查看执行状态时，才适合上 Agent Teams。」

**判断**：`dsh-expert-team` 和 `dsh-crew` 已经覆盖了 agenia 的概念。**在决定重做之前，应该先把这两个跑一遍** —— 如果它们够用，你的工作量就从「重写」变成「写一个窄差异的 preset」。

### 需求 3：工作原则与方法论

| 插件 | 做法 |
| --- | --- |
| zuoyunlai/lunheng-article-pipeline-dsh | **9 角色流水线 + M-gate 23 项检查 + G0-G14 审计 + 4 个人工检查点**（写作领域，但门控设计与 agenia 同源） |
| btspoony/mstar-harness | skill 驱动的 harness / loop engineering workflow |
| MengYuil/dsh-ponytail | **常驻最小改动准则** + `/ponytail-review` 等命令 |
| qwe225380/dsh-omni-router | Plan Mode + TDD + **交付门** + Git 工作流 |
| mycodesite/dsh-rules | 全局 + 项目两级 Markdown 规则注入 |
| Temoa/dsh-rules-paths | Claude Code 风格路径规则注入 |
| FeatherHunter/dsh-mattpocock-skills-deck | 25 个工程/生产力 skill 打包 |
| **Zhenyu98/dsh-context-doctor** | **审计注入的上下文**：token 成本、重复、冲突指令 —— **强烈建议给自己的 preset 跑一遍** |

### 需求 2 的孪生问题：写权限边界（agenia 的 `inject.js` 门禁）

这一层生态里也已经有人做了，而且比 agenia 规范：

| 插件 | 做法 |
| --- | --- |
| **dsh-governed-workflow** | 任务生命周期状态机 `AUTHORITY_OBSERVED → TASK_ADMITTED → RUNNING → BLOCKED/COMPLETED → REVIEW_PENDING`；**RUNNING-only Mutation Guard，保护 bash / write / edit**；非法迁移 **fail closed**；终态冻结；**Builder 不能自行 ACCEPT**，最终决定在 Builder Runtime 之外 |
| a903067276-rgb/dsh-perm-guard | 权限自动审批中间件，11 类三态开关（自动/询问/拒绝），标准/激进双模式 |
| FeatureAgents/AgentsGitFlowController | 分支角色守卫，禁止直推 / force-push / 删保护分支 |
| dsh-tool-permission | 把 Claude Code 的五层工具安全体系压进 `tools/pre-execute` 一个监听器 |

**判断**：agensia 里「product/review/retro 只能写 `.team/`、摘掉 shell、路径 resolve 后判落点」这套，**概念上不是独创**，生态在 `tools/pre-execute` / `guard` 层做的通用方案更完整（状态机 + fail closed + 审计日志）。agensia 的差异是「**把边界绑定到预设里声明出来的角色身份**」而不是「绑定到工具或路径规则」—— 这个绑定方式是它自己的。

---

## 3. agenia 里真正没人做的部分

剥掉生态已有的，剩下的才是重做时要保的东西：

1. **内容以纯 markdown 存放、与代码分离、改文件下一步生效，且不需要借助 UI**
   社区的同类要么在 Settings UI 里编辑（soul-md / identity-control / prompt-inject），要么写死在配置或代码里（expert-team / crew 的角色定义在 `agent.cordis.yml`）。**「preset 目录里放一堆 .md，作者用编辑器改，agent 下一步就变了」这个工作流是 agenia 独有。**

2. **写权限边界绑定到「预设声明的角色身份」**
   生态做的是通用 guard（按工具名/路径/审批策略）。agensia 做的是「**装配时看到角色标记 → 记下 `agent.id → 角色` → 门禁按 id 查**」，把边界和预设自己的编制绑死。这个接线方式（prompt 装配 ↔ tool guard 靠 agent id 接起来）没有现成替代。

3. **名册从章程文件派生，而不是另有一份名单**
   `rosterText()` 去读 `team/*.md` 的第一行当名字 —— **改名 = 改一个文件**，名单不会和章程漂移。社区插件普遍把名册写进配置，两处维护。

4. **流程台账 / 状态板**
   记录「叫过开发没叫过测试」「最后一次测试之后代码又动过 N 次，那次测试作废」。这是**把流程纪律变成可见的告警**，而不是写在守则里求模型遵守。ecosystem 里 `dsh-expert-team` 有类似的门禁（代码强制），但没人做成这种轻量的每轮状态板。

5. **可实测的设计文档文化**
   `DESIGN.md` 里那种「每条毛病都钉在具体某一行实践上」「核对日期 + 发现原文过期三处」的写法 —— 这是方法论层面的东西，不是功能。

---

## 4. 建议路线

### 不建议
- ❌ 从零重写 injector 内核 —— 2/3 是标准件
- ❌ 在没跑过 `dsh-expert-team` / `dsh-crew` 的情况下定架构 —— 可能白做

### 建议
1. **先做对照实验**：装 `yangdcm/dsh-expert-team` 和 `stuarthu/dsh-crew`，各跑一个真实任务，记录它们缺什么。这是最便宜的架构决策依据。
2. **重做时换掉这些**：
   - 人格 shadow → 官方 `@deepseek-ai/dsh-persona`（照用，但把它当配置不当代码）
   - 每轮注入 → 评估 `dsh-adrian-inject-context` 或 `dsh-prompt-injector` 能否直接用；不能再用自研（自研的理由只剩「preset 相对目录 + 无 UI」）
   - 写权限 → 评估 `dsh-governed-workflow` 的状态机能否承接；**注意它保护 bash/write/edit 且 fail closed，语义比 agenia 的门禁严**
   - 上下文健康 → 加装 `Zhenyu98/dsh-context-doctor` 审计 token 成本（agensia 的 leader 侧注入接近 **72KB**，这个数字值得复查）
3. **只保留 2 个自有能力**：
   - markdown 内容目录 + 每步重读（窄，好测）
   - 角色身份 ↔ 写边界的那条接线
4. **其余全部删掉**：`SETS` 的三套观众切分、roster 计算、台账状态板，都可以重新评估是否值得留。

### 一句话
agensia 不臃肿在功能多，臃肿在**它自己实现了本来该由框架/生态提供的东西**。重做的第一刀应该砍在「哪些能换成官方行 / 现成插件」，而不是砍在「哪些 .md 该精简」。

---

## 5. 附录：一手来源

**官方**
- `deepseek-ai/deepseek-harness`（230k★，TypeScript）
- `@deepseek-ai/dsh-persona` / `dsh-agent-presets` / `dsh-plan-mode` / `dsh-system-prompt`
- 文档：`deepseekdocs.com/en/docs/features/persona`

**精选列表 / 目录**
- `awesome-dsh-plugin/awesome-dsh-plugin`（16.3k★）
- `Dominic789654/awesome-deepseek-harness`
- `hackerFish/awesome-dsh-presets`
- awesome-dsh-plugin.com · dshbase.com · dsh-plugin.org · deepseek-harness-plugin.com · dsh.so · findharness.com

**最接近的竞品（建议先跑）**
- `yangdcm/dsh-expert-team` — 12 角色 / 9 阶段 / 代码强制门禁
- `stuarthu/dsh-crew` — PM + 9 角色 / 工具集锁定 / 文件共享
- `NanmiCoder/dsh-agent-teams` — 1724★ / 动态名册 / Web 面板

**每轮注入**
- `runfali/dsh-prompt-injector` · `polohot/dsh-adrian-inject-context` · `Scorp1o117/dsh-soul-md` · `orpheus0829/dsh-identity-control` · `LiFenrir/dsh-scenario` · `haimuhaimu/dsh-persona` · `WASD258-jpg/dsh-prompt-inject` · `Moeblack/dsh-prompt-studio`

**权限 / 边界**
- `dsh-governed-workflow`（状态机 + Mutation Guard）· `a903067276-rgb/dsh-perm-guard` · `FeatureAgents/AgentsGitFlowController`

**安全提醒（各目录站通用声明）**
> 社区插件没有官方安全审计，以 dsh 进程权限运行，可读你的文件、用你的凭据、访问网络；GitHub 来源的插件安装时会跑构建脚本。安装前看源码，尽量锁 commit（`github:owner/repo#sha`），谨慎开 `allowBuilds`。装坏了用 `dsh plugin --profile web remove <插件名>` 恢复。
