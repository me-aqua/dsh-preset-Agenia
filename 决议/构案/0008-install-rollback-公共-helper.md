# 构案 0008 · install-rollback-公共-helper

状态: 生效
主题: install-rollback 公共 helper
日期: 2026-11-13
拍板人: 组长
原话: 「since now我们有构案系统了，是不是可以把整个agenia preset项目都重新审查一遍，我估计这几个月下来一定已经积攒了无数的史山和自己造的轮子，需要彻底打扫一遍屋子」
supersedes: —
superseded_by: —

## ① 背景（现量）

`presets/agenia/bin/install.mjs` 与 `rollback.mjs` 共有 **18 个同名函数**，其中 **8 个逐字同体**（合计 2,194 字符）：

| helper | install 行 | rollback 行 | 字符 |
| --- | ---: | ---: | ---: |
| `assertDeletableTarget` | 235 | 199 | 205 |
| `defaultBackupRoot` | 313 | 249 | 262 |
| `driveOf` | 163 | 144 | 111 |
| `emit` | 845 | 499 | 83 |
| `isUnder` | 158 | 139 | 132 |
| `normKey` | 153 | 134 | 152 |
| `pathVerdict` | 172 | 152 | 1110 |
| `slugOf` | 301 | 237 | 139 |

另外 **10 个同名但已分叉**（`allowedDeleteRoots` · `canonical` · `cliError` · `insideTestScene` · `main` · `parseArgs` · `refuseDelete` · `resolveWithin` · `treeHashOf` · `walkFiles`）—— 它们**不在本票**：分叉说明语义已经不同，要逐个判，不能当重复处理。

B1 只治了 `writeFileAtomic` 一处；这 8 个是同一类病（下一次只改一边不会有任何判据变红）。

## ② 决定

1. 把 **8 个逐字同体的 helper** 抽进 `presets/agenia/lib/cli-guards.mjs`（新模块，导出这 8 个 + 一个 `emitCli` 别名如需要），`install.mjs` 与 `rollback.mjs` **都改为 import**，删掉各自那份。
2. **出厂件（staged `rollback.mjs`）必须仍然单文件零静态 import**（Q6）：`publish-staged` 的内联机制从「只内联 `writeFileAtomic`」扩展成「内联两个标记块」（`原子写并集正文` + `公共 helper`），出厂 rollback 里不出现 import；`target-lag.json` 由发布器重算（`lag_bytes` 变，`sha256` / `baseline_sha256` 同批）。
3. `install.mjs` 的出厂件允许 import（它不需要单文件）：staged 的 `bin/` 与 `lib/cli-guards.mjs` 一起进预设，`INS-02 ①` 只钉 rollback。

## ③ 复用什么

- B1 已建好的内联机制（`@inline-begin/@inline-end` 标记 + `shippedRollbackSource()` + 发布时对出厂字节的断言 + `target-lag.json` 受控差异）
- 现有 `lib/atomic.mjs` 的模块形状（纯函数导出、无副作用）
- 判据侧已有的 `ATM-01` 腿 10（注入器同源）与 `DEC-09`（沙箱自足）作参照

## ④ 不复用什么

- **否「保留这 8 份重复、只加一条判据钉住它们逐字相同」**：那正是现在不要的状态 —— 两份会继续漂，而漂的那天没有任何人看得见。
- **否「顺手把那 10 个已分叉的也一起合并」**：分叉 = 语义已不同（例如 `treeHashOf` / `walkFiles` 的深度规则不同），盲合会把行为改掉；它们各自需要证据，单独开票。
- **否「把 helper 放进 `.tools/`」**：出厂件要 import 它 ⇒ 第三个位置；而且 `.tools` 有独立的内联/发布问题（B3 之前刚把 `.tools` 的手搓收掉，别又开一个口子）。

## ⑤ 新增什么

- 新模块 `presets/agenia/lib/cli-guards.mjs`（8 个导出）
- 内联机制从「一个块」到「两个块」（发布器 + 出厂件断言 + 声明算术）
- 一条判据：这 8 个 helper 在 `presets/**` 里**各只有一处定义**（`install.mjs` / `rollback.mjs` 里 0 定义），刀 = 手抄回一份必红

## ⑥ 公共化时点

本票内完成：repo 两文件 import 共享模块；出厂 rollback 内联两块；`lib/cli-guards.mjs` 进 staged 预设。

## ⑦ 反悔条件

| 编号 | 条件 | 触发时动作 | 状态 |
| --- | --- | --- | --- |
| RC-1 | 两块内联后出厂 rollback 的行为与今天不等（install→rollback 真机跑出不同结果） | **打回第 3 关**改成「只内联原子写、helper 走 import」并说明 Q6 是否被违反 | 未触发 |
| RC-2 | 8 个 helper 中某一个的调用方语义其实依赖**所在文件**（比如闭包里的 `SELF`/`CLI_NAME`） | **重开第 1 关**把它从本票剔除，单独记 | 未触发 |
| RC-3 | 判据（各只一处定义）在 `publish-staged` 的出厂件上误红（内联块里的定义被算成第二处） | **打回第 2 关**给该判据加「跳过标记块」的同一套作用域规则（B2 已立） | 未触发 |
| RC-4 | 内联两块让 `target-lag.json` 的算术无法自洽（`lag_bytes` 与双 sha 无法同时对上） | **重开第 1 关**评估「改成独立导出脚本 + 文档声明」，本票 supersede | 未触发 |

## 验收口径（在哪一层看）

| 层 | 判据 | 读数 |
| --- | --- | --- |
| 定义 | 8 个 helper 在 `presets/**` 各 1 处定义（在 `lib/cli-guards.mjs`），install/rollback 内 0 | grep 计数 + 判据一条 |
| 出厂件 | staged `rollback.mjs` 零静态 import · 两个内联块都在 · 指纹与共享源同源 | 判据读数 |
| 声明 | `target-lag.json` 单条、`bin/rollback.mjs`、双 sha + `lag_bytes` 实测对上 | 发布器 + 导出器 |
| 行为 | install→rollback 真机跑（staged 对）exit 0、数据未动、无残留 | 探针 |
| 套件 | 218 不破（新增判据并入已有格或说明分母） | settle line |
| 人眼行 | **无**（不改 GUI 可见行为） | 记录「无人眼行」 |
