/**
 * 每一轮对话开始之前，把这个文件夹里的 .md 读出来，贴到这次请求上：
 * 组长那份「每天开工第一步」贴**最前面**（`sections` → `system/message`，第 0 条），其余进快照那条（`contexts`）。
 *
 * 为什么需要它：模型不会真的"记住"人格。对话一长，最前面那段就被淹掉了。
 * 所以办法不是让它记住，而是每次重新告诉它一遍。
 *
 * 它做五件事，一件一段，互相独立。哪一段不想要，整段删掉就行。
 *
 *   ① 注入正文 —— 读 .md，按 agent.cordis.yml 里写的顺序拼好，交给提示词服务。
 *      名单里那个 `memory` key **不读 .md** —— 它直接读**共享记忆库**（`<内容根>/.runtime/`：
 *      常识 + 当前快照里的长期记忆）。口径、受众、失败策略全在下面 `── 共享记忆库 ──` 那一段。
 *   ② 分清对象 —— 组长和组员收到的内容不一样，不能混
 *   ③ 岗位边界 —— "只审不改"的岗位，在系统层面就写不了源码
 *   ④ 进度提醒 —— 叫过开发却没叫测试，下一轮提醒组长一句
 *   ⑤ 尾巴提醒 + 情绪板 —— 两条机制**同一个落点**：`agent/pre-step` 里往**本步的
 *      `decision.messages`** 塞一条。机制①（每 n 个工具结果）在 `session/event` 里
 *      **只记账**，到下一个 pre-step 才落地；机制②（老板开口之后、我第一次开口之前）
 *      看这一步领到的 messages。贴出去的是一条**完整的包**：style 段（`style.md` 的尾巴那一段；
 *      读不到 / 剥注释为空 ⇒ 兜底正文，**恒在**）+ 时间行（恒在）+ 按条件拼的三块
 *      （`## 共享记忆 · 常识` / `【这一票的进度】` / 情绪段），次序 `style → **记忆轮转** → 时间 → 板子 → 情绪`；
 *      两条机制都带（细节在 `tailBodyOf` 的头注释）。
 *
 * ⚠️ ① 是**快照**，不是"每轮重发"（2026-09-24 实测）：DSH 只在快照文本变了才发新的一条
 * （`dsh-agent-loop` 的 `RuntimeContextProjection.project()`：`retained.text === snapshot` 就 return）。
 * 文本没变的那几个小时里，人格就钉在上一次变化的位置上 —— 实测有过 **4 小时 15 分没刷新、
 * 离请求末尾 45 万 token** 的一次。所以要真的"每轮"，靠的是 ⑤，不是 ①。
 *
 * 顺序、谁受限、内容放在哪 —— 全部写在 agent.cordis.yml 里，不在这个文件里。
 * 想改顺序、加岗位、去掉限制，都去改那个文件，不用碰这里。
 * ⚠️ 只有一处例外：「每天开工第一步」那一段**不在快照里**，它在 `system-prompt/assemble` 里被插到
 *   `sections` 的第 0 位（理由见 `OPENING_HEADING` 那段注释）—— 位置由这个文件决定，不由名单决定。
 *
 * 改这个文件之后必须重启 harness 才会生效。
 * （.md 不用重启，存盘就生效。）
 */

import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件名，只出现在排查信息里。 */
export const name = 'agenia'

/** 没有提示词服务，就没有什么可注入的。
 *  `tools` 只为一件事：注册提候选那个工具（`proposal_file`）—— 它拿不到时**不抛、出声降级**
 *  （见 ③b 那段），人格注入照旧。 */
export const inject = ['systemPrompt', 'tools']

/**
 * 组长默认收到哪些、按什么顺序。⚠️ `agent.cordis.yml` 的 `leaderOrder` 是事实来源，这一份只是兜底：
 * 配置里没写名单（`leaderOrder` 不是数组）时，注入按这一份走。
 *
 * @roster memory=present style=absent leader=present work-guidelines=present persona=present
 *
 * 成员语义见 `CONTRACT.md §7`。
 */
const DEFAULT_LEADER_ORDER = ['leader', 'work-guidelines', 'memory', 'leader', 'work-guidelines', 'persona']

/**
 * 组员默认收到哪些。名单以下方常量本身为准；组员线不贴尾巴（⑤ 只贴组长），没写名单时注入面就是这一份。
 *
 * `memory` 必须在这份兜底里：给组员的那一半是**常识 + 长期记忆里 `general` 的索引**
 * （见上方 `MEMORY_KEY` 那段受众口径）。配置没写名单时它要是不在，组员会**静默**少掉
 * 常识与索引 —— 没有报错、没有任何读数，只是那一份注入面变薄了（`F-132`）。
 * ⇒ 这一份与 `agent.cordis.yml` 的 `memberOrder` **逐项一致**；`READ-01` 有一格对账，
 *    两边分叉会当场红（`MEMBER-ORDER-FALLBACK`）。
 *
 * @roster memory=present work-guidelines=present charter=present
 *
 * 成员语义见 `CONTRACT.md §7`。
 */
const DEFAULT_MEMBER_ORDER = ['work-guidelines', 'memory', 'charter']

/**
 * 受限岗位默认是哪几个。
 * 🔴 它必须与 `agent.cordis.yml` 里 `persona-injector` 那一行的 `officeBound` **逐项一致**
 * （配置没给 `officeBound` 时走这一份兜底；两份分叉 = 两套边界）。静态用例钉着这一条。
 * 2026-10-15（执行一 · 批次 I2）：加进两个评审类作业 `memory-review` / `conversation-review`。
 * 🔴 2026-10-15（执行二 · 批次 I15）：`retro` 去掉 —— 复盘岗撤销、`team/retro.md` 删除、
 *    `team-retro` 行已关。
 * 🔴 2026-10-16（老板拍板 · 原话「那就给复核加个权限吧」）：**`memory-review` 去掉** ——
 *    记忆复核要做一次**容量预测**（"维护案全过之后会不会落回上限内"），
 *    而这道门禁**同时拿掉了命令行** ⇒ 它只能手算、算不准（今天 10-16 现场撞到的正是这个）。
 *    名单现在是**恰好 2 项**，与 yml 的 `officeBound` 逐项一致。
 *    ⚠️ **代价明说**：去掉之后她**两件保护都没了** —— 既不限"写只落 `.team/`"、也不再"没有命令行"，
 *    只剩纪律。作业书里那句"你不写记忆、不写快照、不写状态"从此是**嘱咐，不是门禁**。
 *    `memory-judge` 与 `technical-review` 仍不在里面（它们要写共享脑 / 跑测试）。
 * 🔴 2026-10-16 当天第二次（**同一个病**）：**`conversation-review` 去掉** ——
 *    它的作业书要求它**必核三样 SHA256**（冻结包 / 常识 / 自己的草稿），
 *    而这道门禁**同时拿掉了命令行** ⇒ **算不出哈希，那份"核"是空话**。
 *    现场：`E:\财布` 那份空白评审交不出 SHA256，只能由组长代算 ⇒ 判据退化成"信别人给的数"。
 *    ⚠️ 代价同上：两件保护都没了，只剩纪律。**名单现在是恰好 1 项**，与 yml 逐项一致。
 *    📌 **两次同一条**：这道门禁一次拿掉两样，而它们只需要"那一样"。
 *    下次再加"要算数"的受限岗位，先问"它要不要算"，别默认把两样一起给它铐上。
 */
const DEFAULT_OFFICE_BOUND = ['review']

/**
 * 「语言风格」那一份 —— ⑤ 尾巴提醒读它。
 * ⚠️ ① 的快照那一层由 `agent.cordis.yml` 的 `leaderOrder` 里那个 `style` 行送 ——
 * **两条路读的是同一个文件**，所以永远不会分叉（2026-09-24 老板定：不再分两份）。
 * 它不进快照机制 ⇒ 改它**不用重启 harness**（存盘即生效）；机制① 的刻度也写在它第一行的注释里。
 *
 * ⚠️ **贴出去的就是文件正文，不加任何外框**（2026-09-24 老板：「记得把那个【自动提醒】也删了，没用」）。
 * 曾经加过一层「不是老板的消息，别回它」的护栏 —— 起因是提醒被当成老板开口、模型回了它两条；
 * 但正文现在是一整份语言风格表，不像指令，护栏就成了噪声。**真再出现被回的情况，加回来。**
 */
const STYLE_FILE = 'style.md'

/**
 * 机制① 的默认刻度：**每这么多个工具结果**补一份 `style.md`。
 * 刻度写在那个文件的**第一行**：`<!-- every: N -->`（释义 2026-09-25 老板定）。
 * 写 `0` = 关掉机制①，只留机制②。
 * 注释丢了 / 读不出来 ⇒ 用这个数，并且出声（`console.error`）—— 不许静默。
 */
const DEFAULT_EVERY = 3

/**
 * `style.md` 里那条**切口**：尾巴只取它**之前**那一段（口径 6：3325 字符 → 不到 400）。
 * 找不到切口 / 切出来是空的 ⇒ **退回全文**，绝不为空（口径 7）。
 * 剥注释之后再量 —— 切口那一行自己也是一条注释，不留进正文。
 */
const TAIL_MARK = /<!--\s*尾巴到此为止\s*-->/

/**
 * 情绪板那份内容文件。
 * `mood.md` —— 常数 + **恰好三条**场景的区间 + 关键词表，**只在 ⑤ 里读**（分数每步都在变，
 * 进快照就是每步重发一次、缓存全废）。常数住在那儿 ⇒ 改它不用重启（口径 13）。
 */
const MOOD_FILE = 'mood.md'

/**
 * 「每天开工第一步」那一节 —— 它在内容根 `leader.md` 里的 H2，**逐字**。
 *
 * 这一节**不进快照**（`contexts` 那条 `user/message`），而是每次装配时从 `.md` 里现切下来、
 * 当成 `sections` 的**第一段**交出去 —— 框架把它拼进 `system/message`（派生历史的第 0 条）。
 * 两条通路的位置差得很远：`contexts` 整条排在第 N 条（前面压着审批策略 / 老板那句话 / 风格 /
 * AGENTS.md），"注入的第一项"不等于"请求的开头"，而这四步值钱的地方就是开头。
 *
 * 🔴 这一行是**形状**（`mig-rules-05`）：这段正文只有它一个取名手柄，改一个字 = 这段静默不注入。
 * 🔴 正文一个字都不许搬进这个文件：它只能住在内容根的 `.md` 里，这里只有尺子和段名。
 */
const OPENING_FILE = 'leader.md'
const OPENING_HEADING = '## 每天开工第一步（顺序固定，四件事）'
/** 它在 `sections` 里的名字（排查信息里认它）。 */
const OPENING_SECTION = 'agenia:opening'

/**
 * 情绪板的三个维度（键 + 中文），**次序就是贴出去那一行的次序**（契约 §二 钉死）。
 * 掌控 = 干活的成败 · 活力 = 今天还剩多少劲 · 亲密 = 他多久没见 + 他夸还是骂。
 * 🔴 三个就是三个，没有第四个。
 * 🔴 掌控与活力是**两根独立的数**：连着翻车 + 刚开工 ⇒ 掌控低而活力高；
 *    一路顺 + 干满一天 ⇒ 掌控高而活力低。合成一维，这两种状态就分不出来了。
 * ⚠️ **键名还叫 `fatigue` / `closeness`**（改名会牵动 `mood.md` 里 `when` 的键）——
 *    但 `fatigue` 那个键装的值**已经是"活力"**：`1 − 净工时/满量程`，**分越高越有劲**
 *    （老板 2026-09-26 改名时一起定的方向）。看见 `.8` 别读成"累趴了"。
 */
const DIMS = [
  ['control', '掌控'],
  ['fatigue', '活力'],
  ['closeness', '亲密'],
]
const DIM_KEYS = new Set(DIMS.map(([key]) => key))

/** 契约里写的"剥注释"口径：删掉全部 HTML 注释（含跨行）再 trim。 */
const stripComments = (raw) => raw.replace(/<!--[\s\S]*?-->/g, '').trim()

/**
 * 🔴 **`【组员:<角色>】` 标记：退役，注入器一个字节都不读。**
 *
 * 2026-11-01（并员）起**身份只由 `toolName` 决定**（定形 §2.2）：
 *   · 角色 = `toolName` 查 `ROLE_TABLE`；查不到 ⇒ 无角色（窄）；
 *   · 预设里也不再写按角色的标记（通用组员那一份不扮演任何具体角色）。
 *
 * ⚠️ 这里**没有** `ROLE_MARK` 这个常量，也**别加回来**：那是一份"从注入文本里认身份"的
 *    第二个作者 —— 标记 + 没有 `toolName` 时它会把角色偷偷补回来（`roleOf()` 干过这件事），
 *    而契约要的正好相反（**只有标记没有 toolName ⇒ 当无角色 + 窄**）。
 *    标记最多只是**人看的**冗余提示；就算哪天要显示，也只能由角色**生成**，不能当输入读。
 */
// ─────────────────────────────────────────────────────────────────────────────
// 身份：两份预设 + 九个工具名（定形 §2.2 / CONTRACT-A §2–§7）
//
// 两个事实，各一个作者：
//   · **档** = 会话是从哪一份预设起来的（组长 / 通用组员 / 认不出）；
//   · **角色** = `toolName`，闭集九个 —— 人设 / 说明书 / tools 全从下面这张表取。
//     ⚠️ `model` 也在表里，但它是**纯声明**：这一版**没有读者**（见下表那段注释）。
// `defaultRole` 是预设自己声明的**冗余校验值**，只进 `warnings`，**不改档、不剥角色**。
//
// 为什么这张表在 `inject.js` 里而不是在预设里：预设只有两份（组长 + 通用组员），
// 而角色有九个 —— 一份通用组员预设装不下九个角色的人设与工具集。表放这儿，
// 页面不再逐角色调 `model` / `tools`（代价：老板失去页面级调参，见定形 §3.3）。
//
// ⚠️ 这张表是**唯一作者**：别在预设里再写一份 `model` / `tools`（生成器当场对账），
//    也别在 `team/*.md` 里另立一份人设 —— 那两句以这里为准。
// 🔴 但"唯一作者"只对 `persona` / `charter` / `tools` 成立：`model` 这一版**没有读者**
//    （纯声明），"改了某个角色的 model ⇒ 会话就用它"这句话在这一版**不成立**（见下表那段注释）。
// ─────────────────────────────────────────────────────────────────────────────

/** 组长那一份预设的 id（页面上那两条之一）。 */
export const LEADER_PRESET_ID = 'agenia'
/** 通用组员那一份预设的 id；九条委派行全指它（`agentPreset: agenia-member`）。 */
export const MEMBER_PRESET_ID = 'agenia-member'
/** `defaultRole` 的合法值（别的值只报警，不改档）。 */
const TIERS = ['leader', 'member']
/** 判决岗那一声拒的码（`CONTRACT-A` §6 冻的名字；报文措辞不冻）。 */
const JUDGE_PROPOSAL_CODE = 'E_GUARD_JUDGE_PROPOSAL'
/**
 * 提候选那个工具的名字（角色表的 `deny` 与门禁都按这个字判）。
 * ⚠️ 与 `tools/proposal-file.mjs` 的 `PROPOSAL_FILE_TOOL_NAME` 是**同一个字**；这里只能写字面量，
 * 因为注册发生在 `apply()` 里，而那个模块**不许**在顶层 import（理由见下面 `proposalFileToolModule`）。
 */
const PROPOSAL_FILE_TOOL = 'proposal_file'
/**
 * 提维护案那个工具的名字（`maintenance_file`）。
 * ⚠️ 与 `tools/maintenance-file.mjs` 的 `MAINTENANCE_FILE_TOOL_NAME` 是**同一个字**；这里只能写字面量，
 * 理由与上面 `PROPOSAL_FILE_TOOL` 相同（那个模块**不许**在顶层 import）。
 */
const MAINTENANCE_FILE_TOOL = 'maintenance_file'
/** 身份被拒的两个码（`CONTRACT-A` §4 冻的名字）。 */
const IDENTITY_LEADER_CODE = 'E_IDENTITY_LEADER_PRESET'
const IDENTITY_TOOL_CODE = 'E_IDENTITY_UNKNOWN_TOOL'

/**
 * **base 工具集** —— 组合里那些面向模型的工具名（不含任何委派工具）。
 *
 * 谁真的拿它：
 *   · **row 0（内部 worker）** —— 无角色 + base（定形 §2.2 / §5：fail-open，拦不住）；
 *   · **角色表每一条的默认值** —— `ROLE_TABLE[].tools` 是它的副本（`review` 少 shell）。
 *
 * 🔴 **row 5 / 6 / 7（窄权限）拿的不是它**：那三行是**闭三元组** `NARROW_PERMISSION`
 *    （`read` / `write` / `edit` + 只写队伍目录 + 提案拒），装配时按角色过滤目录、调用时按门禁拒。
 *    定形 §2.2 末尾那句「无角色 / 未知预设会话的 tools = base 工具集」**只对 row 0 成立** ——
 *    2026-11-01 第 4 关返修裁的（窄赢），别再拿它给 row 5/6/7 的 base 工具集翻案。
 *
 * ⚠️ 委派工具（九个 `toolName` + `workflow` / `ralph` / `subagent_fork` /
 *    `subagent_codex` / `subagent_claude_code`）**一个都不在**：组员结构上不能再招人。
 */
const FILE_READ_TOOLS = ['read', 'glob', 'grep']
const FILE_WRITE_TOOLS = ['write', 'edit']
const SHELL_TOOLS = ['bash', 'pwsh']
const BACKGROUND_TOOLS = ['job_list', 'job_output', 'job_kill']
const COMMON_TOOLS = [
  'skill', 'todo_write', 'ask_user_question', 'web_search', 'web_fetch',
  'create_goal', 'get_goal', 'update_goal', 'exit_plan_mode',
  // 两个**动作类**工具由这个注入器自己注册（`proposal_file` / `maintenance_file`）——
  // 组合文件里没有它们那一行（那一层拿不到数据根）。判决岗那一份 `proposal_file` **注册但调用被拒**。
  'proposal_file', 'maintenance_file',
]
export const BASE_TOOL_SET = Object.freeze([
  ...FILE_READ_TOOLS, ...FILE_WRITE_TOOLS, ...SHELL_TOOLS, ...BACKGROUND_TOOLS, ...COMMON_TOOLS,
])
/** 只有 `review` 拿这一份：它在 `officeBound` 里 ⇒ 没有命令行（两样不能兼得）。 */
const NO_SHELL_TOOLS = Object.freeze(BASE_TOOL_SET.filter((name) => !SHELL_TOOLS.includes(name)))

/**
 * **角色表**（闭集九条）—— `toolName` → 角色 → 人设 / 说明书 / tools（+ 一格纯声明的 `model`）。
 *
 * 九句人设**逐字**是升级前九份 per-role 预设里的那九句（基线
 * `tests/agenia-upgrade/fixtures/preset-baseline-A.json` 的 `member_rows[].persona_body`）；
 * 一份都不许丢，也不许串到别的角色身上（`PRS-04` 两个方向都判）。
 *
 * 🔴 **`model` 这一版是"纯声明"（declaration-only）：一个读者都没有，改了也不会生效。**
 *    · 九条全是 `model: null`，这一版**也没有模型值要应用**（第 4 关第二轮评审 N-2 的裁定）。
 *    · 这个注入器**没有**"给会话指定模型"的那条接线（它只挂在装配 / 门禁 / 流上）⇒
 *      这一格今天不生效。**按角色注入模型在这一版不可用**。
 *    · ⚠️ 所以**别**在这一格旁边写"改了之后会话真用它" —— 那是一句现在为假的话。
 *      真要接，现成的接缝是框架的 `agent/request` 瀑布（`dsh-agent-loop` 的 `prepareRequest`：
 *      它把瀑布返回值的 `provider` + `model` 当成权威值，两个都缺就抛 `no provider/model`）——
 *      **本版不接**：那要一组真实 provider/model 值、要 `CONTRACT-A` 改口径，而且 定形 §3.3
 *      已经把"页面级逐角色调参"当代价放弃掉了 ⇒ 那是一张新票，不是这里补一行。
 *    · 验收口径（`定形` §6.1 那一行"改一个 model，会话真用它"）**在这一版不适用**，不是没做。
 *
 * `deny`：只有判决岗非空，值是 `['proposal']`（"注册与拒同源"，`CONTRACT-A` §6）。
 */
export const ROLE_TABLE = Object.freeze([
  {
    toolName: 'team_design',
    role: 'design',
    mode: 'read',
    persona: '你是这个项目的设计和美工。你的岗位说明书会随请求自动注入 —— 开工前先读它。',
    charter: 'team/design.md',
    model: null,
    tools: Object.freeze([...BASE_TOOL_SET]),
    deny: Object.freeze([]),
  },
  {
    toolName: 'team_dev',
    role: 'dev',
    mode: 'write',
    persona: '你是这个项目的实现者。你的岗位说明书会随请求自动注入 —— 开工前先读它。',
    charter: 'team/dev.md',
    model: null,
    tools: Object.freeze([...BASE_TOOL_SET]),
    deny: Object.freeze([]),
  },
  {
    toolName: 'team_test',
    role: 'test',
    mode: 'read',
    persona: '你是这个项目的测试与流水线负责人。你的岗位说明书会随请求自动注入 —— 开工前先读它。',
    charter: 'team/test.md',
    model: null,
    tools: Object.freeze([...BASE_TOOL_SET]),
    deny: Object.freeze([]),
  },
  {
    toolName: 'team_review',
    role: 'review',
    mode: 'read',
    persona: '你是这个项目的独立评审。你只审不改。岗位说明书会随请求自动注入 —— 开工前先读它。',
    charter: 'team/review.md',
    model: null,
    tools: NO_SHELL_TOOLS,
    deny: Object.freeze([]),
  },
  {
    toolName: 'subagent',
    role: 'hire',
    mode: 'write',
    persona: '你是这个组临时外聘的专家，干完就走。队伍的来龙去脉、干活的次序、以及你自己的岗位说明书会随请求自动注入 —— 开工前先读它们。',
    charter: 'team/hire.md',
    model: null,
    tools: Object.freeze([...BASE_TOOL_SET]),
    deny: Object.freeze([]),
  },
  {
    toolName: 'job_memory_judge',
    role: 'memory-judge',
    mode: 'read',
    persona: '你是一次性后台作业：记忆判决。你的岗位说明书会随请求自动注入 —— 开工前先读它。',
    charter: 'team/memory-judge.md',
    model: null,
    tools: Object.freeze([...BASE_TOOL_SET]),
    // 老板 2026-10-17：「判决应该不能提候选」；2026-11-01 起落法是**调用时被拒**，
    // 不是"工具集里没有它" —— 工具在列表里，这一格是拒的依据（唯一作者）。
    deny: Object.freeze(['proposal']),
  },
  {
    toolName: 'job_memory_review',
    role: 'memory-review',
    mode: 'read',
    persona: '你是一次性后台作业：记忆复核。你的岗位说明书会随请求自动注入 —— 开工前先读它。',
    charter: 'team/memory-review.md',
    model: null,
    tools: Object.freeze([...BASE_TOOL_SET]),
    deny: Object.freeze([]),
  },
  {
    toolName: 'job_conversation_review',
    role: 'conversation-review',
    mode: 'read',
    persona: '你是一次性后台作业：会话评审。你的岗位说明书会随请求自动注入 —— 开工前先读它。',
    charter: 'team/conversation-review.md',
    model: null,
    tools: Object.freeze([...BASE_TOOL_SET]),
    deny: Object.freeze([]),
  },
  {
    toolName: 'job_technical_review',
    role: 'technical-review',
    mode: 'read',
    persona: '你是一次性后台作业：技术评审。你的岗位说明书会随请求自动注入 —— 开工前先读它。',
    charter: 'team/technical-review.md',
    model: null,
    tools: Object.freeze([...BASE_TOOL_SET]),
    deny: Object.freeze([]),
  },
])

/** `toolName` → 角色表条目（闭集）。 */
const ROLE_ENTRY_BY_TOOL = new Map(ROLE_TABLE.map((entry) => [entry.toolName, entry]))
/** 角色 → 角色表条目（`proposalVerdict` / 说明书路径都按角色查）。 */
const ROLE_ENTRY_BY_ROLE = new Map(ROLE_TABLE.map((entry) => [entry.role, entry]))

// ─────────────────────────────────────────────────────────────
// 委派工具名的**插件桥**（父会话门禁记、子会话装配取）。
//
// 要解决的事：子会话头里没有 `toolName`（`header_keys` = cwd / agentPreset / origin / parentSession）
// ⇒ `identityVerdict()` 落 **row 5**：无角色、窄权限、人设与说明书都不注入、工具目录只剩
// `read/write/edit`（没有 `bash`/`pwsh`）。九个 `team_*` / `job_*` 委派会话因此全是窄的。
// 桥的做法：父会话 `tools.guard` 在**放行那一刻**把这次委派的工具名记进内存队列（按父会话排队），
// 子会话第一次装配时取一条，**当作 `toolName`** 交给 `identityVerdict()` ——
// 角色仍然只有一个作者（`ROLE_TABLE`），桥不写会话头、不读 `【组员】` 标记、不碰客户端。
//
// 🔴 **两张表必须在模块级，不在 `apply()` 里**：`cordis.patch.yml` 里 `persona-injector` 出现两次
//    （`preset-agenia` 组长那份 / `preset-agenia-member` 组员那份），两行指同一个 `inject.js`
//    ⇒ 模块只加载一次、`apply()` 被调两次、**两套闭包**。写成闭包里的 `new Map()`，
//    组长那份记的 claim 组员那份取不到 —— 桥在生产拓扑上根本不通。
// 🔴 两张表都**只活在内存**：进程重启即空；不进盘、不进会话包、不进快照。
// ─────────────────────────────────────────────────────────────
/** 父会话 header id → FIFO 队列 `[{ toolName, at }]`。只放角色表那九个 `toolName`。 */
const BRIDGE_CLAIMS = new Map()
/**
 * 子会话键 → 第一次装配定下来的 `toolName`（第二次装配不再消费队列）。
 * 键 = `context.scope.id`；它缺失 / 不是字符串时用 `context.agent.id` 兜底（见装配那一处：
 * 平台的 `scope` 形状会变，而"键拿不到 ⇒ 静默不钉"会让同一个子会话下一轮掉回 row 5）。
 */
const BRIDGE_PINNED = new Map()
/**
 * 一条 claim 的存活窗口：**5 分钟**。
 * 两端是判据：`+30 s` 的 claim **必须**还能用（派工到装配的正常延迟），`+10 min` 的**必须**不再用
 * （父会话派了活、子会话没起来 —— 留着就是给下一个子会话下毒）。5 分钟落在 (30 s, 10 min] 里。
 * 时钟只能是 `Date.now()`：判据把 `Date` 当成可注入时钟，换别的时钟那一格会当场变红。
 */
const BRIDGE_CLAIM_TTL_MS = 5 * 60 * 1000
/** 一个父会话最多攒多少条（丢**最旧**的）。进程级的表必须有个头，不然内存只涨不落。 */
const BRIDGE_CLAIM_CAP = 16
/** 桥自己出错只喊一次 —— 它是纯观察，不许每次调用都刷屏。 */
let bridgeErrorWarned = false

/** 桥内部的出声：**一次**就够（同一个错误重复喊会把日志淹掉）。 */
function bridgeWarnOnce(where, error) {
  if (bridgeErrorWarned) return
  bridgeErrorWarned = true
  console.error(`[agenia] 委派桥（${where}）出错：这一条 claim 丢掉，其余照旧（${String(error?.message ?? error)}）`)
}

/** 桥"取不到"的那一行：**一个子会话只喊一次**（同一会话每轮装配都会重走这条路，不能刷屏）。 */
const BRIDGE_MISS_WARNED = new Set()
/**
 * `BRIDGE_PINNED` / `BRIDGE_MISS_WARNED` 两张表的头：进程级表只涨不落就是内存泄漏
 * （每来一个子会话多一条，跑到关机为止）。与 `BRIDGE_CLAIM_CAP` 同一个道理，只是这两张是
 * Map / Set（按**插入次序**迭代）⇒ 超了丢最旧那一条。
 */
const BRIDGE_STATE_CAP = 256

/** 把一张桥状态表收到 `BRIDGE_STATE_CAP` 以内：删最旧的键（Map / Set 的迭代次序 = 插入次序）。 */
function bridgeTrimState(table) {
  while (table.size > BRIDGE_STATE_CAP) {
    const oldest = table.keys().next()
    if (oldest.done === true) return
    table.delete(oldest.value)
  }
}

/**
 * 桥失败时的那一行（第 4 关复审 F-02）：**有 `parentSession`、却没有可用 claim** 时才喊。
 *
 * 为什么必须喊：桥生效之后「委派子会话头里没有 `toolName`」是**正常态** —— 不点名"桥没取到"，
 * 现场就会去查那条已作废的平台补丁，而真正要查的是**父会话的队列**（`BRIDGE_CLAIMS`，只在内存里）。
 * 报三样：队列几条 / 其中过期几条 / 最早一条几秒前 —— 判的人一眼分得清"父会话没记"（0 条）
 * 与"记了但子会话起晚了"（有过期件）。
 *
 * @param {unknown} header 子会话头
 * @param {string} parent 父会话 id（`header.parentSession`）
 * @param {Array<{toolName:string, at:number}>|undefined} queue 那个父会话的队列
 * @param {string|undefined} agentId 子会话 agent id（键；取不到就退回 header id / 父会话 id）
 * @param {number} now 这一次判定的时刻（`Date.now()`）
 */
function bridgeWarnMiss(header, parent, queue, agentId, now) {
  const key = typeof agentId === 'string' && agentId !== ''
    ? agentId
    : (typeof header?.id === 'string' && header.id !== '' ? header.id : parent)
  if (BRIDGE_MISS_WARNED.has(key)) return
  BRIDGE_MISS_WARNED.add(key)
  bridgeTrimState(BRIDGE_MISS_WARNED)
  const list = Array.isArray(queue) ? queue : []
  const expired = list.filter((item) => now - item.at > BRIDGE_CLAIM_TTL_MS).length
  const oldestAt = list.length === 0 ? null : Math.min(...list.map((item) => item.at))
  const age = oldestAt === null ? null : Math.max(0, Math.round((now - oldestAt) / 1000))
  console.error(`[agenia] 桥：父会话 ${parent} 没有可用 claim`
    + `（队列 ${list.length} / 过期 ${expired}${age === null ? '' : `，最早一条 ${age}s`}）`
    + '—— 这个子会话落 row 5')
}

/**
 * 子会话的**第一条用户消息**（= 父会话派工时传下来的那份 prompt）。
 *
 * 为什么需要它：并行派两个委派时，子会话的**启动先后**与父会话调用的先后无关；只按队列顺序取
 * claim 会把两个角色串位（2026-11-02 live 探针实测：`team_test` 取到了 `job_technical_review` 的 claim）。
 * prompt 是父→子之间唯一稳定的对应物，拿它对号，顺序就无所谓了。
 *
 * 读的是会话的消息列表；形状不认识的字段一律跳过，取不到就返回 `''`（调用方退回队列顺序）。
 *
 * @param {unknown} session `context.agent.session` / `context.scope.session`
 * @returns {string}
 */
function firstUserPromptOf(session) {
  const list = session === null || session === undefined
    ? []
    : (Array.isArray(session.messages) ? session.messages : [])
  for (const message of list) {
    if (message === null || message === undefined) continue
    // 两种形状都认：消息对象 `{role:'user', content}` 与会话事件
    // `{type:'user/message', data:{text, source:{kind:'user'}}}`（后者是 live 会话流里的真形状）。
    const kind = message.type ?? message.kind
    const role = message.role
      ?? (kind === 'user/message' ? 'user' : undefined)
      ?? message.source?.kind
      ?? message.data?.source?.kind
    if (role !== 'user') continue
    const content = message.content
    if (typeof content === 'string' && content !== '') return content
    if (Array.isArray(content)) {
      const text = content
        .map((part) => (typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : '')))
        .join('')
      if (text !== '') return text
    }
    if (typeof message.text === 'string' && message.text !== '') return message.text
    if (typeof message.data?.text === 'string' && message.data.text !== '') return message.data.text
    // live 会话事件里的真形状：正文在 `data.content`（字符串或分块数组），不在 `data.text`。
    // 技术评审 2026-11-02 F1 实测：解出来的子会话流就是这一形；只读 `data.text` 会永远取空。
    const dataContent = message.data?.content
    if (typeof dataContent === 'string' && dataContent !== '') return dataContent
    if (Array.isArray(dataContent)) {
      const text = dataContent
        .map((part) => (typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : '')))
        .join('')
      if (text !== '') return text
    }
  }
  return ''
}

/**
 * 父会话放行一次委派 ⇒ 记一条 claim。
 *
 * 🔴 **只许在"放行那一刻"调用**：五条判定（后台硬门 → 窄 → 角色工具集 → 判决岗提案 → 岗位写边界）
 * 全部过完、回调即将 `return undefined` 的那一处。被拒的委派不会起子会话，记了就是给下一个
 * 子会话下毒（下一个真子会话会拿到一个从未启动过的角色）。
 * 🔴 记录是**纯观察**：不改判词、不改五条判定的次序与报文；这里自己抛错也**不许**冒出门禁。
 *
 * 记什么：只有 `ROLE_TABLE` 的九个 `toolName`。`workflow` / `ralph` / `subagent_fork` / `team_retro`
 * 这类名字不在角色表里 —— 它们不是角色，记了会把子会话推进 row 2（该被拒）或 row 6。
 * 键：`call.agent.session.header.id`（子会话头里的 `parentSession` 就是父会话**头**的 id），
 * **不是** `call.agent.id` —— 那是 agent id，取不到 claim。
 * 值里带 `prompt`：子会话装配时拿自己的第一条用户消息对号（并行派工不串位的唯一稳的键）。
 *
 * @param {unknown} call `tools.guard` 收到的那一次调用
 */
function bridgeRecordClaim(call) {
  try {
    const toolName = call === null || call === undefined ? undefined : call.name
    if (typeof toolName !== 'string' || !ROLE_ENTRY_BY_TOOL.has(toolName)) return
    const headerId = call.agent === null || call.agent === undefined
      ? undefined
      : call.agent.session?.header?.id
    if (typeof headerId !== 'string' || headerId === '') return
    const args = call.arguments
    const prompt = args !== null && args !== undefined && typeof args.prompt === 'string' ? args.prompt : undefined
    const queue = BRIDGE_CLAIMS.get(headerId) ?? []
    queue.push({ toolName, prompt, at: Date.now() })
    if (queue.length > BRIDGE_CLAIM_CAP) queue.splice(0, queue.length - BRIDGE_CLAIM_CAP)
    BRIDGE_CLAIMS.set(headerId, queue)
  } catch (error) {
    bridgeWarnOnce('记录', error)
  }
}

/**
 * 子会话装配 ⇒ 取一条 claim（取不到 ⇒ `null`）。
 *
 * 四条门**同时**满足才取：
 *   ① `toolNameOf(header) === null` —— 会话头里真的没有名字（header **永远优先**：有就一个字都不动）；
 *   ② `header.origin === 'subagent'`；
 *   ③ `presetKindOf(header) === 'member'` —— `origin:"subagent"` 不是"这是委派子会话"的充分条件
 *      （`subagent_fork` / `workflow` / `ralph` 起来的会话也可能带它）；而且**组长预设**的会话
 *      吃到 claim 会被推进 row 1（该被拒），从 row 3 掉下来 ⇒ 只让通用组员预设消费；
 *   ④ `header.parentSession` 是非空字符串，且那个父会话的队列里有**未过期**的 claim。
 *
 * 取法：先剔过期件 ⇒ **按 `childPrompt` 对号**（同一次父会话并行派出的多个子会话启动先后不定，
 * 队列顺序会把角色串位；prompt 是唯一稳定的对应物）⇒ 对不上再退回 `shift` 队首（老路径）。
 * 取到后钉在这个子会话上 —— 同一子会话的后续装配**不再消费**队列，否则下一轮对话就掉回 row 5，
 * 角色与工具目录**中途消失**。
 *
 * ⚠️ 返回的是**名字**，不是角色：调用方必须再核一次它在角色表里，再交给 `identityVerdict()`。
 *
 * @param {unknown} header 会话头
 * @param {string|undefined} pinKey 钉住 / 告警的去重键：首选 `context.scope.id`；它缺失或不是
 *   字符串时，调用方给的是 `context.agent.id`（装配那一处算的）。键拿不到 ⇒ 不钉（第二次装配落 row 5）。
 * @param {string} [childPrompt] 子会话第一条用户消息（对号用；取不到就退回队列顺序）
 * @returns {string|null}
 */
function bridgeTakeClaim(header, pinKey, childPrompt) {
  try {
    if (toolNameOf(header) !== null) return null
    if (header === null || header === undefined || header.origin !== 'subagent') return null
    if (presetKindOf(header) !== 'member') return null
    const pinned = typeof pinKey === 'string' ? BRIDGE_PINNED.get(pinKey) : undefined
    if (typeof pinned === 'string') return pinned
    const parent = header.parentSession
    if (typeof parent !== 'string' || parent === '') return null
    const queue = BRIDGE_CLAIMS.get(parent)
    const at = Date.now()
    // 有 parentSession 却没有可用 claim ⇒ **桥这一格没接上**。这一支必须出声（一个子会话一次），
    // 否则现场只会看到"会话头里没有 toolName"，去查一条已经作废的路（复审 F-02）。
    if (!Array.isArray(queue) || queue.length === 0) {
      bridgeWarnMiss(header, parent, queue, pinKey, at)
      return null
    }
    const fresh = queue.filter((item) => at - item.at <= BRIDGE_CLAIM_TTL_MS)
    const prompt = typeof childPrompt === 'string' ? childPrompt : ''
    let index = -1
    if (prompt !== '') {
      // 只认**完整相等**：两份派工 prompt 可能共享开头，用 includes 会让短的那份被长的那份包含，
      // 先命中错的一条（2026-11-02 live：team_test / team_review 又串了一次）。
      // 对不上就**不取**（子会话落 row 5，安全），不退回排队顺序 —— 那个顺序在并行时本来就不成立。
      index = fresh.findIndex((item) => typeof item.prompt === 'string' && item.prompt === prompt)
    }
    const head = index >= 0 ? fresh.splice(index, 1)[0] : (prompt === '' ? fresh.shift() : undefined)
    BRIDGE_CLAIMS.set(parent, fresh)
    if (head === undefined) {
      bridgeWarnMiss(header, parent, queue, pinKey, at)
      return null
    }
    if (typeof pinKey === 'string') {
      BRIDGE_PINNED.set(pinKey, head.toolName)
      bridgeTrimState(BRIDGE_PINNED)
    }
    return head.toolName
  } catch (error) {
    bridgeWarnOnce('消费', error)
    return null
  }
}

/**
 * **窄权限 = 闭三元组**（定形 §2.2 / `CONTRACT-A` §7）：
 *   · 工具白名单 `read` / `write` / `edit`（别的一律拒）；
 *   · 写范围 = 只写队伍目录（`.team/`，不写项目）；
 *   · 提案 = 拒。
 * 来源**恰三条**：row 5（组员 + 无工具，手动开）· row 6（未知预设 + 有效工具）·
 * row 7（未知 + 无工具）。**没有第四条**；row 0 / 0.5 是显式例外（不窄），排在毯子规则之前。
 */
export const NARROW_PERMISSION = Object.freeze({
  tools: Object.freeze(['read', 'write', 'edit']),
  write_scope: 'team',
  proposal: 'deny',
})

/** 窄权限拒的三个码（措辞不冻；`NARROW_PERMISSION` 那三格各一个，读日志能分清是哪一格）。 */
export const NARROW_CODES = Object.freeze({
  tool: 'E_GUARD_NARROW_TOOL',
  write: 'E_GUARD_NARROW_WRITE',
  proposal: 'E_GUARD_NARROW_PROPOSAL',
})

/**
 * **窄权限的执行者**（纯函数）：`null` = 放行；`{ code, message }` = 拒。
 *
 * 三格逐条对 `NARROW_PERMISSION`（**一个字符都不在这里重复**）：
 *   ① `proposal` = deny ⇒ `proposal_file` 调用被拒（先判：报文要说清是"窄"不是"你不该提"）；
 *   ② `tools` 白名单 ⇒ 不在名单里的**一律拒**（含 shell / 委派 / 记忆库工具）；
 *   ③ `write_scope` = team ⇒ `write` / `edit` 的**落点**必须在**会话头那棵树的 `.team/`** 之下。
 *      比别的岗位更严：别的岗位认"任何树的 `.team/`"，窄会话只认**自己那棵**（`officeLandingVerdict` 的 `strict`）。
 *
 * 口径边界（别把它读成"全机沙箱"）：它管的是**模型能调的这些工具**；真正写到别处
 * 还有框架自己的 fs 沙箱那一道。这里拒的是"这个会话没有这个工具"。
 *
 * @param {string} toolName 被调用的工具名
 * @param {unknown} args 调用实参（`write` / `edit` 从 `file_path` 取落点）
 * @param {unknown} agent 调用方（`agent.session.header.cwd` 用来算落点）
 * @returns {null | {code:string, message:string}}
 */
export function narrowVerdict(toolName, args, agent) {
  const name = typeof toolName === 'string' ? toolName : ''
  const why = '这个会话是**窄权限**（无角色 / 未知预设，见定形 §2.2 的 row 5/6/7）'
  if (NARROW_PERMISSION.proposal === 'deny' && name === PROPOSAL_FILE_TOOL) {
    return {
      code: NARROW_CODES.proposal,
      message: `${why}：提案调用被拒。要提候选，让有角色的会话（或组长）替你提。`,
    }
  }
  if (!NARROW_PERMISSION.tools.includes(name)) {
    return {
      code: NARROW_CODES.tool,
      message: `${why}：工具白名单只有 ${NARROW_PERMISSION.tools.map((t) => `\`${t}\``).join(' / ')}，`
        + `「${name}」不在里面。没有命令行、也不能再派人 —— 要什么，写成意见交回组长。`,
    }
  }
  const key = WRITE_TARGET[name]
  if (NARROW_PERMISSION.write_scope === 'team' && key !== undefined) {
    const target = args === null || typeof args !== 'object' ? undefined : args[key]
    // 🔴 窄会话（这一道门）比别的岗位更严：只认**会话头那棵树**的 `.team/`（`strict === true`）。
    if (!officeLandingVerdict(target, agent, true).allow) {
      return {
        code: NARROW_CODES.write,
        message: `${why}：这个会话是窄权限，只能写**自己这棵树**的 .team/。`
          + `你这次要写的是「${String(target)}」—— 它就算落在别的树的 .team/ 里，也不是你的那一棵。`,
      }
    }
  }
  return null
}

/**
 * **角色工具集的执行者**（纯函数）：`null` = 放行；`{ code, message }` = 拒。
 *
 * `ROLE_TABLE[role].tools` 是**运行时作者**：装配时按它过滤模型看得见的目录
 * （`system-prompt/assemble` 的 `tools` 是权威值），调用时按它拒。
 * 所以"给 review 去掉 shell"改的是**角色表那一格**，不是别处再写一份。
 *
 * ⚠️ 只判 `BASE_TOOL_SET` 里那些**模型面向**的工具：框架自己的工具（PTC 的 `run_code`、
 *    结构化输出之类的）不在这张表里，**不许**被角色白名单误伤（fail-open 那一侧）。
 *
 * @param {string} role 角色名
 * @param {string} toolName 被调用的工具名
 * @returns {null | {code:string, message:string}}
 */
export function roleToolVerdict(role, toolName) {
  if (typeof role !== 'string') return null
  const entry = ROLE_ENTRY_BY_ROLE.get(role)
  const name = typeof toolName === 'string' ? toolName : ''
  if (entry === undefined || !BASE_TOOL_SET.includes(name)) return null
  if (entry.tools.includes(name)) return null
  return {
    code: 'E_GUARD_ROLE_TOOL',
    message: `你的岗位（${role}）的工具集里没有「${name}」—— 角色表是工具集的唯一作者`
      + '（定形 §3.3）。要什么材料，找组长要，他给你。',
  }
}

/**
 * **按角色裁模型看得见的工具目录**（装配时的那一半，`system-prompt/assemble` 的 `tools`）。
 *
 * 为什么能这么做：`dsh-system-prompt` 的 `assemble()` 先收集各家的 schema，再发
 * `system-prompt/assemble` 这个瀑布 —— **瀑布的返回值就是权威值**（`buildRequest(…, assembly.tools, …)`
 * 直接拿它当请求的 `tools`）。所以"角色表是 `tools` 的唯一作者"这句话在运行时**有落点**：
 * 改 `ROLE_TABLE[role].tools` 那一格，下一轮装配这张目录就跟着变。
 *
 * 裁剪口径：只裁 `BASE_TOOL_SET` 里的**模型面向**工具；不在表里的框架工具（PTC 的 `run_code`、
 * 结构化输出之类）原样留着 —— 那是平台自己的通道，角色表管不着，也不许误伤。
 *   · 窄（row 5/6/7）⇒ 白名单 = `NARROW_PERMISSION.tools`；
 *   · 有角色（row 4；row 6 已被窄覆盖）⇒ 白名单 = `ROLE_TABLE[role].tools`；
 *   · 都没有（row 0 / 0.3 / 0.5，组长也行）⇒ 不裁。
 *
 * @param {string|undefined} role 角色名（没有 = 不裁）
 * @param {boolean} narrow 窄权限（优先于角色）
 * @param {unknown} tools 装配出来的 schema 数组
 * @returns {unknown} 同一个数组（不需要裁时原样返回，引用不变）
 */
export function toolCatalogFor(role, narrow, tools) {
  if (!Array.isArray(tools)) return tools
  const allow = narrow === true
    ? NARROW_PERMISSION.tools
    : (typeof role === 'string' ? ROLE_ENTRY_BY_ROLE.get(role)?.tools : undefined)
  if (!Array.isArray(allow)) return tools
  return tools.filter((schema) => {
    const name = schema === null || schema === undefined ? undefined : schema.name
    if (typeof name !== 'string' || !BASE_TOOL_SET.includes(name)) return true
    return allow.includes(name)
  })
}

/**
 * `defaultRole` 的那一条报警（**只报警**：档与角色一格都不动）。
 * @returns {string[]} 合法 ⇒ 空数组；缺 / 非法 / 与预设不符 ⇒ 恰一条，且点名 `defaultRole`
 */
function tierWarnings(expected, declared) {
  if (declared === null || declared === undefined) {
    return [`defaultRole 缺（这一份预设该声明 defaultRole: ${expected}）—— 只报警，不改档、不剥角色`]
  }
  if (!TIERS.includes(declared)) {
    return [`defaultRole=${JSON.stringify(declared)} 不是合法值（${TIERS.join(' / ')}）—— 只报警，不改档、不剥角色`]
  }
  if (declared !== expected) {
    return [`defaultRole=${declared} 与这一份预设的档（${expected}）不符 —— 只报警，不改档、不剥角色`]
  }
  return []
}

/**
 * **身份判定**（纯函数，定形 §2.2 那张表**按行序判**，第一条命中即返回）。
 *
 * 入参（`CONTRACT-A` §4.1 冻的接缝）：
 *   · `preset`：`'leader' | 'member' | 'unknown'` —— 会话是从哪一份预设起来的；
 *   · `toolName`：派工层传给子会话的工具名，`null` = 没有；
 *   · `defaultRole`：预设自己声明的冗余校验值，**只影响 warnings**；
 *   · `worker`：`'workflow' | 'ralph' | null` —— 内部 worker（拦不住，fail-open）；
 *   · `legacy`：`isLegacySession()` 的结论 —— 升级日之前开着的旧会话。
 *
 * @returns {{row:number, role:string|null, narrow:boolean, managed:boolean,
 *            rejected:boolean, code:string|null, warnings:string[]}}
 */
export function identityVerdict(input = {}) {
  const { preset, toolName, defaultRole, worker, legacy } = input
  const hasTool = typeof toolName === 'string' && toolName.trim() !== ''
  const entry = hasTool ? ROLE_ENTRY_BY_TOOL.get(toolName) : undefined
  const verdict = (row, extra = {}) => ({
    row,
    role: null,
    narrow: false,
    managed: true,
    rejected: false,
    code: null,
    warnings: [],
    ...extra,
  })

  // row 0：内部 worker（workflow / ralph）—— 不看预设，无角色，**记未受管**。
  if (worker === 'workflow' || worker === 'ralph') return verdict(0, { managed: false })
  // row 0.5：legacy session（升级日旧会话）—— 不窄、拦不住、记未受管。
  if (legacy === true) return verdict(0.5, { managed: false })
  // row 1：组长预设 + 工具名 ⇒ 拒（工具 spawn 必须用组员预设）。
  if (preset === 'leader' && hasTool) {
    return verdict(1, {
      rejected: true,
      code: IDENTITY_LEADER_CODE,
      warnings: [`组长预设的会话带着工具名 ${JSON.stringify(toolName)} —— 工具 spawn 必须用通用组员预设 ${MEMBER_PRESET_ID}`],
    })
  }
  // row 2：工具名不在角色表 ⇒ 拒（工具注册表只认那九个）。
  if (hasTool && entry === undefined) {
    return verdict(2, {
      rejected: true,
      code: IDENTITY_TOOL_CODE,
      warnings: [`toolName=${JSON.stringify(toolName)} 不在角色表里（闭集九个）—— 这个工具名不该被注册`],
    })
  }
  // row 3：组长（全权）。
  if (preset === 'leader') return verdict(3, { warnings: tierWarnings('leader', defaultRole) })
  // row 4：组员 + 有效工具名 ⇒ 该角色（全权）。
  if (preset === 'member' && entry !== undefined) {
    return verdict(4, { role: entry.role, warnings: tierWarnings('member', defaultRole) })
  }
  // row 5：组员 + 无工具名 = 手动开的组员会话 ⇒ 窄。
  if (preset === 'member') {
    return verdict(5, {
      narrow: true,
      warnings: ['组员预设 + 没有 toolName ⇒ 角色认不出：窄权限、没有人设 / 说明书'],
    })
  }
  // row 6：未知预设 + 有效工具 ⇒ **角色保留** + 窄 + 报警（升级残留 / 损坏，不是常态）。
  if (entry !== undefined) {
    return verdict(6, {
      role: entry.role,
      narrow: true,
      warnings: [`预设身份认不出（preset=${JSON.stringify(preset)}）—— 角色按 toolName 保留，权限窄、非生产态`],
    })
  }
  // row 7：未知预设 + 无工具 ⇒ 无角色 + 窄 + 报警。
  return verdict(7, { narrow: true, warnings: [`预设身份认不出（preset=${JSON.stringify(preset)}）且没有 toolName ⇒ 无角色、窄权限`] })
}

/**
 * **判决岗的提案工具在列表里、调用被拒**（`CONTRACT-A` §6 的冻结接缝）。
 *
 * 注册与拒**同源**：`deny` 只挂在角色表判决岗那一条上（值是 `['proposal']`）；
 * 这个函数是它唯一的读者。别在别处再写一份"判决岗不能提案"的判断。
 *
 * @param {string} role 角色名（`ROLE_TABLE[].role`；认不出就传 `null` / `undefined`）
 * @param {string} toolName 被调用的工具名
 * @returns {null | {code:string, message:string}} `null` = 放行
 */
export function proposalVerdict(role, toolName) {
  if (toolName !== PROPOSAL_FILE_TOOL) return null
  const entry = typeof role === 'string' ? ROLE_ENTRY_BY_ROLE.get(role) : undefined
  if (entry === undefined || !entry.deny.includes('proposal')) return null
  return {
    code: JUDGE_PROPOSAL_CODE,
    message: `${entry.role} 不能提候选：它判的就是别人提的案子，自己再提一个就成了既当运动员又当裁判`
      + '（老板 2026-10-17）。这个工具在列表里、调用被拒。',
  }
}

/** 升级日那一刻的 session-id 快照落在哪（`{ upgrade_at, session_ids[] }`）。 */
const LEGACY_SNAPSHOT_FILE = 'legacy-sessions.json'

/**
 * **legacy session 的谓词**（`CONTRACT-A` §5.2 的冻结接缝）：id 恰在升级那一刻的快照里。
 *
 * 方向是刻意的：**快照读不出来 ⇒ `false`** —— 判 `false` 会走向**窄**（安全方向），
 * 判 `true` 会把人放进"不窄"。之后同形（不在快照里、预设又认不出的会话）走 row 6/7。
 *
 * @param {string} sessionId 会话 id
 * @param {unknown} snapshot `{ upgrade_at: string, session_ids: string[] }`
 * @returns {boolean}
 */
export function isLegacySession(sessionId, snapshot) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') return false
  if (snapshot === null || typeof snapshot !== 'object') return false
  if (!Array.isArray(snapshot.session_ids)) return false
  return snapshot.session_ids.includes(sessionId)
}

// ── 身份报警的**落点**（契约 C2 §4.2 #7/#8 · 组长 2026-11-02 裁定第 1 条）──────────
/**
 * 状态条那两格（`unknown_preset` / `preset_downgrade`）的 producer：注入器把报警写到
 * 工作区的 `.team/state/identity/<day>.json`，卡读它。
 *
 * 为什么要有这个落点：`console.error` 那一行只活在**当事会话**里 —— 卡（以及看卡的人）
 * 看不见它。裁定第 1 条把这两格要求成 `wired:true`，于是"报警"必须有一个当天的载体。
 *
 * 形状（裁定原文）：`{ unknown_preset: [...], preset_downgrade: [...] }`；同一格只一份 ——
 * 所以是**当天合并后整份重写**（先写 `.tmp` 再 `rename`，绝不原地半写）。
 *
 * 两个数组各自的含义（`CONTRACT-A` §8.2 的"注入器报警"那一行）：
 *   · `unknown_preset`   ← 预设认不出（`presetKindOf` 给 `unknown` ⇒ 判定表 row 6/7）；
 *   · `preset_downgrade` ← 这一份预设**自己声明的档**与它该是的那一档不符（`tierWarnings` 的三种形状）。
 * 两条都**只记账、不改判定**：档、角色、`narrow` 一格都不动。
 */
const IDENTITY_STATE_DIR = ['state', 'identity']
const IDENTITY_WRITTEN = new Set()
const IDENTITY_KEYS = { unknown: 'unknown_preset', downgrade: 'preset_downgrade' }

/**
 * 当地日期（`YYYY-MM-DD`）—— **不在这里算**。
 *
 * 切点（`DAY_CUT_HOURS = 4`，00:00–03:59 归前一天）与那个算法只有**一处**：
 * `presets/agenia/lib/route.mjs::dayKeyOf`（契约 CONTRACT.md §13.1）。这里只是它的
 * 一个**调用方** —— 以前这里有第二份 `IDENTITY_DAY_CUT_HOURS = 4` + 自己拼日期，
 * 三份副本漂一处，凌晨 0–4 点写下的报警就会落进**另一天**的文件，卡读到"没有报警"，
 * 而"没接线"和"读了、是空的"长得一模一样（`mig-rules-12`）。
 *
 * 🔴 为什么是**懒加载**（`await import()`）而不是顶层静态 import：
 *    · 这份注入器的顶层 import 一坏 = "人格注入 0 字符"（本文件别处同一条规矩）；
 *    · 变异刀会把**这份文件的源码副本**落进运行根再 import（`importSourceCopy()`），
 *      副本旁边没有 `lib/` ⇒ 静态 import 在那里就是 `ERR_MODULE_NOT_FOUND`。
 *    懒加载只在**真的写报警**那一下才解析（路径按本文件的 `import.meta.url` 算），
 *    加载失败不影响注入：`recordIdentityAlarm()` 绝不抛，只回一个失败原因。
 * ⚠️ 所以 `identityDayKeyOf` 是 **async** 的（它要读另一个模块）。
 *
 * 🔴 每日评审那道闸（`dailyReviewGateVerdict`）问的是**同一个**"今天是哪天"，而且也必须走
 * **同一个** `route.mjs::dayKeyOf`：那份文件是唯一的家。区别只在签名 —— `tools.guard` 的回调
 * **必须同步**（框架契约：返回字符串即拒），所以另有一个**同步调用面** `localDayKeySync()`
 * （见它自己的说明）。切点那个数与日期算法**一份都没有复制**。
 */
let sharedDayKeyOf = null
/** 取 `route.mjs::dayKeyOf` 失败时的原因（装配时记下；闸的拒绝报文点名它，不拿"今天"猜）。 */
let sharedDayKeyError = null
async function sharedDayKeyOfFn() {
  if (sharedDayKeyOf === null) {
    const module = await import(new URL('./lib/route.mjs', import.meta.url).href)
    if (typeof module.dayKeyOf !== 'function') throw new Error('lib/route.mjs 没有导出 dayKeyOf')
    sharedDayKeyOf = module.dayKeyOf
  }

  return sharedDayKeyOf
}

export async function identityDayKeyOf(nowMs) {
  const dayKeyOf = await sharedDayKeyOfFn()
  return dayKeyOf(nowMs)
}

/**
 * 两份**每日评审**（会话评审 / 技术评审）的工具名 —— 它们必须等当天的记忆判决落盘才能派。
 *
 * 判据是**今天的判决报告在不在**（`<内容根>/.runtime/reports/memory-update/<day>.json`）：
 * 报告是发布事务里**第一个**写的（`lib/snapshot.mjs::publishUpdate`：报告 → 快照 → `current` 指针 → 共享状态），
 * 所以这一条保证的是「**判决的报告已经写出来了**」，**不是**「`judge-commit` 已经走完」：
 * 报告在、快照 / 指针 / 状态还没落的那一小段窗口里，本闸会放行 —— 窗口窄，且发布失败时回滚会把报告删掉
 * （窗口自己关上）。判据钉在**产物**上，不钉 `phase` 字段 ——
 * 字段会被中途改、产物不会（2026-11-03 老板点破：判决没回来就派评审，已连犯三次）。
 */
const DAILY_REVIEW_TOOLS = Object.freeze(new Set(['job_conversation_review', 'job_technical_review']))

/** 日子键的形状（契约 §13.1：`YYYY-MM-DD`）。坏值 = 拿不到 —— 不许拿去拼路径。 */
const DAY_KEY_SHAPE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 报文里只许有**一个**"今天"（`mig-rules-18`）：原因文本里的日期形状一律遮掉。
 * 为什么：`import` 失败的原文常常带着运行根路径（`…\_runs\2026-11-03\…`），读的人（和探针）
 * 会把路径里的日期当成"闸点名的日子" —— 而"今天算不出来"这一支**不许点名任何一天**。
 */
function withoutDateShapes(text) {
  return String(text ?? '').replace(/\d{4}-\d{2}-\d{2}/g, '<日期>')
}

/**
 * 本地日 `YYYY-MM-DD` —— **同步签名，算法仍在唯一的家**：`lib/route.mjs::dayKeyOf`（契约 §13.1）。
 *
 * 为什么是同步的：`tools.guard` 的回调**必须同步**（框架契约：返回字符串即拒），而 `route.mjs`
 * 是 ESM —— 这里不能顶层静态 import（见上面"为什么是懒加载"）。⇒ `apply()` 装配时 `await`
 * 取一次，把**那个函数对象**存进 `sharedDayKeyOf`；这里只是它的调用面，**不复制**切点、不复制算法
 * （`cand-20261023-0249`：一个值只许有一个定义）。
 *
 * 返回 `{ day, why }`：`day` 只可能是**合格的日子键**或 `null`；`why` 是**拿不到的原因**（不点名任何一天）。
 * 🔴 **三种"拿不到"都算失败，不只判 `=== null`**（第三轮评审 `R3-6`）：① 没有 `dayKeyOf`（不是函数）；
 * ② 它抛了；③ 它返回的不是 `YYYY-MM-DD`。只判 `null` 时，`undefined` / 空串会被拿去拼成
 * `undefined.json` 再 `existsSync` —— 那会变成"读不到报告 ⇒ 拒"，**理由是错的**。
 * 拿不到时**不许退回手抄的 4**，也不许拿"今天"猜（`F5` 打回的就是那份副本）。
 */
function localDayKeySync(nowMs = Date.now()) {
  if (typeof sharedDayKeyOf !== 'function') {
    return { day: null, why: `没有可用的 dayKeyOf（${sharedDayKeyError ?? 'lib/route.mjs 还没加载上'}）` }
  }
  let day
  try {
    day = sharedDayKeyOf(nowMs)
  } catch (err) {
    return { day: null, why: `dayKeyOf 抛了：${withoutDateShapes(err?.message ?? err)}` }
  }
  if (typeof day !== 'string' || !DAY_KEY_SHAPE.test(day)) {
    return {
      day: null,
      why: `dayKeyOf 返回的不是 YYYY-MM-DD（typeof=${day === null ? 'null' : typeof day}`
        + `${typeof day === 'string' ? ` · 长度 ${day.length}` : ''}）`,
    }
  }
  return { day, why: null }
}

function dailyReviewGateVerdict(toolName, contentDir) {
  if (!DAILY_REVIEW_TOOLS.has(toolName)) return null
  const { day, why } = localDayKeySync()
  if (day === null) {
    return {
      code: 'E_REVIEW_DAY_UNKNOWN',
      message: `今天算不出来（${withoutDateShapes(why)}）—— 两份每日评审不知道要等哪一天的判决，所以这一发**拒**；`
        + '先把 `presets/agenia/lib/route.mjs` 那份切点修回来（它是唯一的家），别拿"今天"猜',
    }
  }
  const report = join(contentDir, RUNTIME_DIR, 'reports', 'memory-update', `${day}.json`)
  if (existsSync(report)) return null
  return {
    code: 'E_REVIEW_BEFORE_JUDGE',
    message: `今天的记忆判决还没落盘（${day} 的 reports/memory-update 报告不在）——`
      + ' 两份每日评审必须等判决完成（claim-update → candidates-freeze → job_memory_judge → judge-commit）；'
      + ' 先做完判决再派评审',
  }
}

/**
 * 把一条报警并进当天的文件（**同一格只一份**：按 `session` + `kind` 去重；文件里的旧条目留着）。
 * 返回 `{ok, path, reason}` —— **绝不抛**：报警写不进去不许影响注入（那是两条独立的事），
 * 但也不许静默（`reason` 会被调用方打成一行）。
 *
 * @param {{cwd: string, nowMs: number, kind: 'unknown'|'downgrade', record: object}} input
 */
export async function recordIdentityAlarm({ cwd, nowMs, kind, record } = {}) {
  const key = IDENTITY_KEYS[kind]
  if (typeof key !== 'string') return { ok: false, code: 'bad-kind', path: null, reason: `未知的报警种类 ${JSON.stringify(kind)}` }
  if (typeof cwd !== 'string' || cwd.trim() === '') return { ok: false, code: 'no-cwd', path: null, reason: '会话头里没有 cwd ⇒ 不知道写进哪个工作区' }
  if (record === null || typeof record !== 'object') return { ok: false, code: 'bad-record', path: null, reason: '报警记录必须是对象' }
  // 报警只落进**有 `.team/` 的那个目录**（= 工作区）。`cwd` 不是工作区时（内容根 / 夹具根）不写，
  // 也不报错 —— 那只是"这里不是团队的抽屉"，不是失败。
  if (!existsSync(join(cwd, OFFICE_DIR))) return { ok: false, code: 'not-a-workspace', path: null, reason: `not-a-workspace: ${join(cwd, OFFICE_DIR)} 不在` }
  let day
  try {
    day = await identityDayKeyOf(nowMs)
  } catch (err) {
    // 切点那一份读不到 ⇒ 这一条**不知道落哪一天**：不许拿"今天"猜，也不许静默。
    return { ok: false, code: 'day-key-unavailable', path: null, reason: `lib/route.mjs::dayKeyOf 读不到（${err?.message ?? err}）⇒ 这条报警不知道落哪一天` }
  }
  const id = typeof record.session === 'string' && record.session.trim() !== '' ? record.session.trim() : null
  // 一个会话的同一种报警只落一次（装配会被反复触发；文件里堆同一行 20 遍比没记录还难读）。
  const once = `${kind}|${id ?? '(no-session)'}|${day}`
  if (IDENTITY_WRITTEN.has(once)) return { ok: true, code: 'already-recorded', path: null, reason: null }
  const dir = join(cwd, OFFICE_DIR, ...IDENTITY_STATE_DIR)
  const file = join(dir, `${day}.json`)
  let current = {}
  try {
    current = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    current = {}
  }
  const base = current !== null && typeof current === 'object' && !Array.isArray(current) ? current : {}
  const before = Array.isArray(base[key]) ? base[key] : []
  const dedupe = (rows) => {
    const seen = new Set()
    return rows.filter((row) => {
      const tag = `${row?.session ?? ''}|${row?.message ?? ''}|${row?.at ?? ''}`
      if (seen.has(tag)) return false
      seen.add(tag)
      return true
    })
  }
  const next = {
    schema: 1,
    day,
    updated_at: new Date(nowMs).toISOString(),
    unknown_preset: kind === 'unknown' ? dedupe([...before, record]) : (Array.isArray(base.unknown_preset) ? base.unknown_preset : []),
    preset_downgrade: kind === 'downgrade' ? dedupe([...before, record]) : (Array.isArray(base.preset_downgrade) ? base.preset_downgrade : []),
  }
  try {
    mkdirSync(dir, { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    renameSync(tmp, file)
  } catch (err) {
    return { ok: false, code: 'write-failed', path: file, reason: `${err?.code ?? 'UNKNOWN'}: ${err?.message ?? err}` }
  }
  IDENTITY_WRITTEN.add(once)
  return { ok: true, code: null, path: file, reason: null }
}


/** 只有这两个工具的参数里写着"要写到哪儿"。 */
const WRITE_TARGET = { write: 'file_path', edit: 'file_path' }

/** 一条通用命令行就是一条通用写入通道。受限岗位不能留着它。 */
const SHELL = ['bash', 'pwsh']

/**
 * 团队的办公桌：**落点自己所在那棵树的 `.team/`**（`officeLandingVerdict` 判）。
 *
 * 判定：先 `resolve` 吃掉 `..`，盘上存在再 `realpath` 吃掉 junction/symlink（路径判断必须算落点），
 * 然后从落点向上找最近的、名字恰好是 `.team` 的**祖先目录** —— 找到就放行，并报出是哪棵树。
 * 受限岗位只能写这种地方；**窄会话更严**：只认会话头那棵树的 `.team/`。
 * 不是字符串匹配（`.team/review/../../x.txt` 里含 `.team/`，却落在项目根）。
 */
const OFFICE_DIR = '.team'

/**
 * 队伍的工具名 → 岗位名。约定：`team_<岗位名>`，而岗位名就是 `team/<岗位名>.md`
 * 的文件名。**加岗位时 toolName 必须照这个写** —— 进度板按这个约定认人，
 * 写成别的形状，那一列不会出现在板子上（不报错，只是没有）。
 */
const TEAM_TOOL = /^team[_-]([a-z0-9][a-z0-9-]*)$/

/**
 * 起人的工具。**进度板把它算成"外聘上岗"** —— 外聘本来就是挂在 `tool-subagent`
 * 那一行的 `persona` 标记上的（见 agent.cordis.yml）。
 * 为什么要算：2026-09-24 那一天，组长 42 次起人**全走裸 `subagent`**、一次 `team_*` 都没叫，
 * 于是板子恒空 ⇒ 快照文本一动不动 ⇒ 人格 4 小时 15 分没刷新（当天真发生过）。
 * 认人认的是"起过人"，不是"用哪个工具名起的人"。
 */
const HIRE_TOOL = 'subagent'

/** 起人算出来的那个岗位名。 */
const HIRE_ROLE = 'hire'

/** 进度板上显示的名字。没登记过的岗位原样显示岗位名 —— 看得见就不算静默。 */
const BOARD_LABELS = { design: '设计', dev: '开发', test: '测试', review: '评审', retro: '复盘', hire: '外聘' }

/** 板子上固定岗位的排列次序（设计 → 实现 → 测试 → 评审 → 复盘）；名单外的岗位排在后面，按名字排。 */
const BOARD_ORDER = ['design', 'dev', 'test', 'review', 'retro']

/**
 * ── 共享记忆库 ──────────────────────────────────────────────────────────────
 * `agent.cordis.yml` 的 `leaderOrder` / `memberOrder` 里那个 `memory` key 读的就是它。
 *
 * 🔴 **一份来源：直接读库**（`<内容根>/.runtime/`，也就是脑根）。**不经过"先导出一份再注入"** ——
 *    那样迟早分叉，而且分叉之后没人知道哪份对。
 *
 * 形状（与 `lib/state.mjs` / `lib/snapshot.mjs` 那两份**同一套**口径）：
 *   · 常识：`<脑根>/common-sense.md`（老板直写、Agenia 只读，只有几条）
 *   · 长期记忆：指针 `<脑根>/memory/snapshots/current` 里写着版本号 ⇒ `<脑根>/memory/snapshots/<vN>.json`
 *
 * 三样是**刻意在这里重写一遍的**（而不是 `import './lib/snapshot.mjs'`）：
 * 路径两条、指针文件名、版本号形状、四类次序。理由是**这份文件的失败代价不一样** ——
 * 它一挂，"人格注入 0 字符"（AGENTS.md §3d 那个形状），而 `lib/` 那二十来份是脑 CLI 的地盘。
 * 为了省这三个常量把注入器的**可加载性**绑在整条脑库上，不划算。
 * ⚠️ 代价要认：库那边换了布局，这里**读不到就出声降级** —— 是明着失败，不是静默失效。
 *    换布局时，改这里的三行常量（`RUNTIME_DIR` / `MEMORY_SNAPSHOTS_REL` / `MEMORY_VERSION_RE`）。
 *
 * 受众（**口径由组长 2026-10-16 拍，不是这里定的**）：
 *   · **常识** —— 组长与组员**都拿**（只有几条，它是底层规矩）
 *   · **长期记忆 · 组长** —— `boss` / `machine` / `project` 三类**全条**；
 *     `general` **只给"一行一条的索引"**（81 条 ≈ 2.2 万字符全注入 ≈ 2 万 token，太贵）
 *   · **长期记忆 · 组员** —— **只有 `general` 的索引**（组员干完就走；但老板要求对他们也有用）
 *
 * 🔴 **文本必须稳定**：同一份库 ⇒ 同一份文本，**一个字都不许跟时间走**。
 *    ① 是**快照** —— 文本一变就重发一条，缓存全废（AGENTS.md §3e ①）。
 *    所以这里只取"库自己写下来的东西"（条目正文 + id + 版本号 + 那条路径），
 *    **`generated_at` 之类每轮都变的字段一律不拼进去**。排序也只用库自己的顺序，
 *    不另立一套（另立一套 = 第二个来源）。
 *
 * 🔴 **失败策略：读不到 / 解析失败 ⇒ `console.error` 出声 + 降级**
 *    （能注常识就只注常识，两样都不行就整段不注）——
 *    跟 `tools.guard` 那条同一个规矩：**不许静默失效**（悄悄失效比明着失败更糟）。
 *    出声走 `warnOnce`：同一个问题每个会话只喊一次，别把日志刷满。
 */
const RUNTIME_DIR = '.runtime'
/** 快照住在 `<脑根>/memory/snapshots/`（`lib/state.mjs` 的 `snapshotsDir`）。 */
const MEMORY_SNAPSHOTS_REL = ['memory', 'snapshots']
/** 指针文件名：内容就是一个版本号（`lib/snapshot.mjs` 的 `CURRENT_POINTER`）。 */
const MEMORY_POINTER_FILE = 'current'
/** 版本号形状（`lib/state.mjs` 的 `isSnapshotVersion` 同形）。 */
const MEMORY_VERSION_RE = /^v\d+$/
/** 常识那一份的文件名（`lib/state.mjs` 的 `commonSensePath`）。 */
const COMMON_SENSE_FILE = 'common-sense.md'
/** 注入清单里那个 key 的名字。两种名单里**同名**（`gather` 内部按受众分流）。 */
const MEMORY_KEY = 'memory'
/**
 * 四类（`lib/memory.mjs` 的 `TYPE_IDS`，**次序与中文名照抄**）。
 * ⚠️ 次序是给人看的：注入文本里那几节的先后就按这个来。
 */
const MEMORY_TYPES = [
  ['general', '底层通用'],
  ['boss', '关于老板'],
  ['machine', '关于本机'],
  ['project', '关于某个项目'],
]
/** 组长拿**全条**的那三类（其余 `general` 两拨人都只拿索引）。 */
const MEMORY_FULL_TYPES = ['boss', 'machine', 'project']
/** 索引那一行里标题最多留几个字符 —— 一行一条，太长就不叫索引了。 */
const MEMORY_TITLE_MAX = 56

/**
 * **只给组长的那几份**：落进 `memberOrder` 就是错的（每一项写明"它是什么"）。
 *
 * 那四份管的是**「她是谁 / 老板是谁 / 怎么带队 / 怎么说话」** —— 与组员干的活无关
 * （`roster` / `board` 同族：名册与进度板也只给组长，它们是**算出来的**）。
 *
 * 🔴 **这是黑名单，不是白名单**（2026-10-16 组长拍 · 测试岗给的一句话判据）：
 *    **「加一个合法的注入项，会不会红？」** 会红 ⇒ 白名单，**禁**；不会红、而**越界**会红 ⇒ 黑名单，**对**。
 *    ⇒ 所以**不许**写成"`memberOrder` 只许有这几个 key"：那个形状的后果是
 *      **每加一个合法项就常驻红**，红的是判据不是被测对象（今天那条族级判据治的正是它）。
 *    ⇒ 这里只钉"**这几份不许进 `memberOrder`**"：新 key 只要解析得开（有 .md，或者是算出来的）
 *      就照常通过；要不要给组员，是**加它的那一次**该有意识决定的事。
 * ⚠️ 两者在"越界"那一格**行为完全相同**，区别**只在"合法新增"那一格** ——
 *    所以只测越界是分不出这两种形状的（定向判据里有那一格，见 `memory-inject-check.mjs` 的 G 族）。
 */
const LEADER_ONLY_KEYS = [
  ['persona', '那是"她是谁"（组长的身份）'],
  ['me-aqua', '那是"老板这个人"（称呼 / 作息 / 脾气 / 习惯 / 知识边界）'],
  ['leader', '那是队伍设定和她怎么带队'],
  ['style', '那是"她怎么说话"（语言风格那一份）'],
  ['roster', '名册和进度板只给组长'],
  ['board', '名册和进度板只给组长'],
]

/** 这个 preset 自己的文件夹 —— 也就是 .md 默认存放的地方。 */
function presetDir(ctx) {
  const base = ctx === null || ctx === undefined ? undefined : ctx.baseUrl
  return typeof base === 'string' && base.startsWith('file:') ? fileURLToPath(base) : undefined
}

/** 内容从哪个文件夹读。默认就是 preset 自己这一层。 */
function contentRoot(ctx, config) {
  const configured = config === null || config === undefined ? undefined : config.contentDir
  const where =
    typeof configured === 'string' && configured.length > 0
      ? configured
      : (typeof process !== 'undefined' && process.env.AGENIA_CONTENT_DIR) || '.'
  if (isAbsolute(where)) return where
  const base = presetDir(ctx)
  return base === undefined ? where : resolve(base, where)
}

/** 读一个文件。读不到、或者里面是空的，都算"没有这一份"。 */
async function readText(path) {
  try {
    const text = await readFile(path, 'utf8')
    return text.trim().length === 0 ? undefined : text
  } catch {
    return undefined
  }
}

/**
 * 从一段内容正文里切出「每天开工第一步」那一节（H2 到下一个 H2 之前，去掉尾空白）。
 * 切不出来 ⇒ `undefined` —— 调用方据此**整段不搬**，不编一段空的顶上。
 */
function openingBlockOf(text) {
  const body = typeof text === 'string' ? text : ''
  const at = body.indexOf(OPENING_HEADING)
  if (at < 0) return undefined
  const rest = body.slice(at)
  const nextAt = rest.indexOf('\n## ', OPENING_HEADING.length)
  const block = (nextAt < 0 ? rest : rest.slice(0, nextAt)).replace(/\s+$/, '')
  return block.length === 0 ? undefined : block
}

/** 把那一节从正文里摘掉（是"挪"不是"加"）—— 摘完把留下的三连空行塌成两行。 */
function withoutOpeningBlock(text) {
  const block = openingBlockOf(text)
  if (block === undefined || typeof text !== 'string') return text
  return text.replace(block, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
}

/** team/ 下面每个 .md 就是一个岗位，文件名去掉后缀就是岗位名。 */
async function roleNames(contentDir) {
  try {
    const files = await readdir(join(contentDir, 'team'))
    return files.filter((f) => f.endsWith('.md')).sort().map((f) => f.slice(0, -3))
  } catch {
    return []
  }
}

/**
 * 名册：给组长看一眼"我有哪几个人、各自管什么"。
 * 名字不用另外维护 —— 就取每个岗位文件的第一行。
 */
async function rosterText(contentDir, names) {
  const dir = join(contentDir, 'team')
  const lines = []
  for (const role of names) {
    const text = await readText(join(dir, `${role}.md`))
    const first = (text ?? '').split('\n').find((line) => line.trim().length > 0) ?? ''
    lines.push(`- \`team/${role}.md\` —— ${first.replace(/^#+\s*/, '').trim()}`)
  }
  if (lines.length === 0) return undefined
  return [
    '## 岗位名册',
    '',
    `岗位说明书在：\`${dir}\``,
    '',
    ...lines,
    '',
    '他们上岗时会自动收到自己那一份，你不用转述岗位要求。你只管派活：',
    '把任务、成功标准、和"去读项目自己的规矩"说清楚。',
  ].join('\n')
}

// ── 共享记忆库的读面 ────────────────────────────────────────────────────────
// 口径（受众、稳定性、失败策略）全在上面的 `── 共享记忆库 ──` 那一段，这里只管怎么读。

/** 读盘上的一份库文件：读不到就把原因交回来（**不在这里吞掉** —— 出声是调用方的事）。 */
async function readLibraryFile(file) {
  try {
    return { ok: true, text: await readFile(file, 'utf8'), error: '' }
  } catch (error) {
    return { ok: false, text: '', error: String(error?.message ?? error) }
  }
}

/**
 * 索引里那个"标题"：取正文里**第一条洗干净之后不为空的**行，压成一行、截断。
 *
 * 为什么从正文推：快照 entry 的字段表里**没有 title**（`lib/snapshot.mjs` §B3.6 那张表），
 * 索引只能从正文推 —— 那它就必须是**纯函数**：同一份库 ⇒ 同一份文本（快照机制的要求）。
 * 剥的是行首的引用 / 标题 / 列表 / 表格记号与加重记号 —— 那是排版，不是内容。
 */
function memoryTitle(text) {
  for (const line of String(text ?? '').split('\n')) {
    const plain = line
      .replace(/^[\s>#*+\-|]+/, '')
      .replace(/[*`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // 行尾那几个记号是"话没说完"，不是内容 —— 留着读起来像被截断（截断的会自己带 `…`）。
      .replace(/[；;：:]+$/, '')
      .trim()
    if (plain.length === 0) continue
    return plain.length > MEMORY_TITLE_MAX ? `${plain.slice(0, MEMORY_TITLE_MAX)}…` : plain
  }
  return '（正文里没有可读的标题）'
}

/** 四类的中文呈现名。**名单外的类型原样显示类型名** —— 看得见就不算静默。 */
function memoryLabel(type) {
  const hit = MEMORY_TYPES.find(([id]) => id === type)
  return hit === undefined ? type : hit[1]
}

/**
 * 读**当前**那一版快照：指针 → 版本号 → 那份 JSON。
 * **缺**与**坏**分开报（与 `lib/snapshot.mjs::readSnapshot` 同一套口径：坏文件绝不读成空库）。
 *
 * 🔴 **这个文件里读快照只有这一份**，两个读者共用：`sharedMemoryText`（正文注入那一节）与
 *    `memoryRotationOf`（尾巴那一路的轮转）。两处看到的失败面、坏条目的报数因此是同一份 ——
 *    从前尾巴那边自己另读一份（`catch { return null }`，六种失败塌成一个 null），已删。
 *
 * @returns `{ version, file, entries }`；读不到 ⇒ `undefined`（**已经出过声了**）。
 */
async function currentSnapshotOf(root, say) {
  const dir = join(root, ...MEMORY_SNAPSHOTS_REL)
  const pointerFile = join(dir, MEMORY_POINTER_FILE)
  const pointer = await readLibraryFile(pointerFile)
  if (!pointer.ok) {
    say('memory-pointer', `[agenia] 读不到共享记忆的 current 指针（${pointerFile}）：${pointer.error}`
      + ' —— 长期记忆这一节不注入（常识照旧）。')
    return undefined
  }
  const version = pointer.text.trim()
  if (!MEMORY_VERSION_RE.test(version)) {
    say('memory-pointer-shape', '[agenia] 共享记忆的 current 指针内容不是版本号（v<n>）：'
      + `${JSON.stringify(version.slice(0, 40))}（${pointerFile}）—— 长期记忆这一节不注入。`)
    return undefined
  }
  const file = join(dir, `${version}.json`)
  const read = await readLibraryFile(file)
  if (!read.ok) {
    say('memory-snapshot-read', `[agenia] 读不到共享记忆快照 ${version}（${file}）：${read.error}`
      + ' —— 长期记忆这一节不注入。')
    return undefined
  }
  let snapshot
  try {
    snapshot = JSON.parse(read.text)
  } catch (error) {
    say('memory-snapshot-parse',
      `[agenia] 共享记忆快照 ${version} 解析不了（${file}）：${String(error?.message ?? error)}`
      + ' —— 长期记忆这一节不注入。')
    return undefined
  }
  if (snapshot === null || typeof snapshot !== 'object' || !Array.isArray(snapshot.entries)) {
    say('memory-snapshot-shape', `[agenia] 共享记忆快照 ${version} 里 entries 不是数组（${file}）`
      + ' —— 长期记忆这一节不注入。')
    return undefined
  }
  // 一条不合法**不许悄悄跳过**：跳过它，同时把话说出来（几条、哪几条）。
  const entries = []
  const bad = []
  for (const entry of snapshot.entries) {
    const usable = entry !== null && typeof entry === 'object'
      && typeof entry.id === 'string' && entry.id.length > 0
      && typeof entry.type === 'string' && entry.type.length > 0
      && typeof entry.text === 'string'
    if (usable) entries.push(entry)
    else bad.push(typeof entry?.id === 'string' && entry.id.length > 0 ? entry.id : '(没有 id)')
  }
  if (bad.length > 0) {
    say('memory-entries-bad', `[agenia] 共享记忆快照 ${version} 里有 ${bad.length} 条条目不合法`
      + `（id / type / text 缺一不可）：${bad.slice(0, 5).join('、')}${bad.length > 5 ? ' 等' : ''}`
      + ` —— 跳过了它们，其余照注（${file}）。`)
  }
  if (entries.length === 0) {
    say('memory-empty', `[agenia] 共享记忆快照 ${version} 里一条都读不出来（${file}）`
      + ' —— 长期记忆这一节不注入。')
    return undefined
  }
  return { version, file, entries }
}

/**
 * 长期记忆那几节正文。**按受众分流**（组长 = 三类全条 + 索引；组员侧 = 只有索引）。
 *
 * 🔴 `leaderSide` 必须由**调用方按注入侧**给，**不许再从 `role === undefined` 推**
 *    （2026-11-01 第二轮评审 N-3 实测出来的那条）：并员之后"组员侧 + 没有角色"是常态
 *    （row 5 / 7，加上 row 0 / 0.5）—— 拿"没有角色"当"是组长"，它们会拿到 `boss` / `machine` /
 *    `project` 的**全条**（那是老板的画像，只给组长）。同一个字段不许担两个意思。
 *
 * ⚠️ 条数、类型名全从**真的注进去的那些条目**里数出来，**不读快照自带的 `distribution`** ——
 *    那个数与"这一份里到底有什么"是两件事：万一跳过了坏条目，读它就会写出一个假数。
 */
function memorySections(version, file, entries, leaderSide) {
  const ofType = (type) => entries.filter((entry) => entry.type === type)
  const inventory = MEMORY_TYPES.map(([type]) => `${type} ${ofType(type).length}`).join(' · ')
  const isLeader = leaderSide === true
  const out = []

  if (isLeader) {
    const full = entries.filter((entry) => MEMORY_FULL_TYPES.includes(entry.type))
    out.push([
      `## 共享记忆 · 长期记忆（全条 ${full.length} 条）`,
      '',
      `下面是**全文**，逐条照抄、一个字没改。库在 \`${file}\``
        + `（快照 \`${version}\`，全部 ${entries.length} 条：${inventory}）。`,
    ].join('\n'))
    // ⚠️ 这里只走**全条那三类**（`MEMORY_FULL_TYPES`）—— `general` 一节都不在这儿注，
    //    它的正文由下面那个索引代替（少写一个字，56 条正文就混进上下文了）。
    for (const type of MEMORY_FULL_TYPES) {
      const group = ofType(type)
      if (group.length === 0) continue
      out.push(`### ${memoryLabel(type)} · ${type} · ${group.length} 条`)
      for (const entry of group) {
        out.push(`**${entry.id} —— ${memoryTitle(entry.text)}**\n\n${entry.text}`)
      }
    }
  }

  const index = ofType('general')
  if (index.length > 0) {
    out.push([
      `## 共享记忆 · 索引（${memoryLabel('general')} · general · ${index.length} 条 · id + 标题）`,
      '',
      `这一节**只有索引**（一行一条）。要哪一条的全文，读 \`${file}\`（快照 \`${version}\`）里同 id 那一条。`,
      isLeader
        ? `另外三类（${MEMORY_FULL_TYPES.join(' / ')} 共 ${entries.length - index.length} 条）已经全条在上面了。`
        : `另外三类（${MEMORY_FULL_TYPES.join(' / ')} 共 ${entries.length - index.length} 条）是留给组长的，这一份里没有。`,
      '',
      ...index.map((entry) => `- \`${entry.id}\` · ${memoryTitle(entry.text)}`),
    ].join('\n'))
  }
  return out
}

/**
 * 共享记忆那一整段正文（`memory` 那个 key 的产物）。
 *
 * 🔴 一段都没读成 ⇒ `undefined`（调用方据此**整段不注入**）——
 *    但绝不静默：上面每条失败路径都已经出过声，这里不抛错、也不编一段空的顶上。
 *
 * @param warn `warnOnce(key, message)`；没给就退回 `console.error`（**出声不许省**）。
 * @param leaderSide **注入侧**是不是组长（true = 组长）；受众分流只认这一格，**不认 `role`**
 *   （"没有角色"的组员侧会话是常态，见 `memorySections` 上面那段）。
 */
async function sharedMemoryText(contentDir, warn, leaderSide) {
  const say = typeof warn === 'function' ? warn : (key, message) => console.error(message)
  const root = join(contentDir, RUNTIME_DIR)
  const blocks = []

  const senseFile = join(root, COMMON_SENSE_FILE)
  const sense = await readLibraryFile(senseFile)
  if (!sense.ok) {
    say('memory-common-sense', `[agenia] 读不到共享记忆的常识（${senseFile}）：${sense.error}`
      + ' —— 常识这一节不注入（长期记忆照旧）。')
  } else if (sense.text.trim().length === 0) {
    say('memory-common-sense-empty',
      `[agenia] 共享记忆的常识是空文件（${senseFile}）—— 常识这一节不注入（长期记忆照旧）。`)
  } else if (leaderSide !== true) {
    // F-89：组员侧照旧（他们是一次性作业，很多活不到 10 个工具结果 ⇒ 走尾巴等于永远不看常识）；
    // 组长那一侧也不 push —— 常识块已于 2026-11-09 整体撤掉（老板拍板），
    // ⚠️ 判据是**注入侧**，不是"有没有角色"：row 5 / 7 的组员会话没有角色，但它们照样要常识。
    blocks.push(`## 共享记忆 · 常识\n\n${sense.text.trim()}`)
  }

  const snapshot = await currentSnapshotOf(root, say)
  if (snapshot !== undefined) {
    blocks.push(...memorySections(snapshot.version, snapshot.file, snapshot.entries, leaderSide))
  }

  return blocks.length === 0 ? undefined : blocks.join('\n\n')
}

/**
 * 按 order 里写的顺序，把该给这一拨人的内容一份份读出来。
 *
 * 🔴 **角色人格 = `ROLE_TABLE[role].persona`，唯一一份、就在紧挨 charter 的前面**：
 *    定形 §6.1 要的是「子会话拿到那个角色的 persona/charter；不是只印一个 role」。
 *    所以 `charter` 那一格会先吐一条 `agenia:role-persona`（正文逐字就是角色表里那一句），
 *    再吐 `agenia:charter:<角色>` —— **别在预设里 / `team/*.md` 里另写一份人格**（那就是第二个作者）。
 *    没有角色（row 5 / 7、旧会话）⇒ 两条都不吐，只有通用组员人格 + 通用注入。
 *
 * ⚠️ `leaderSide` 是**注入侧**（row 3 才 true）：共享记忆的受众分流按它，不按"有没有角色"
 *    （组员侧 + 没有角色是常态，见 `memorySections` 上面那段）。
 */
async function gather(order, { contentDir, role, leaderSide, board, warn }) {
  const out = []
  for (const key of order) {
    if (key === 'roster') {
      if (role !== undefined) continue
      const text = await rosterText(contentDir, await roleNames(contentDir))
      if (text !== undefined) out.push({ name: 'agenia:roster', text })
      continue
    }
    if (key === 'charter') {
      if (role === undefined) continue
      const entry = ROLE_ENTRY_BY_ROLE.get(role)
      // ① 角色人格：正文**逐字**是角色表那一格（不拼前缀、不改写 —— 那条才能被逐字对账）。
      if (entry !== undefined && typeof entry.persona === 'string' && entry.persona.trim() !== '') {
        out.push({ name: 'agenia:role-persona', text: entry.persona })
      }
      // ② 说明书：路径以**角色表**为准（它是 charter 的唯一作者）；表里没有这个角色 ⇒ 退回老约定。
      const charterRel = entry?.charter ?? join('team', `${role}.md`)
      const text = await readText(join(contentDir, charterRel))
      if (text !== undefined) out.push({ name: `agenia:charter:${role}`, text })
      continue
    }
    if (key === 'board') {
      if (board !== undefined) out.push({ name: 'agenia:board', text: board })
      continue
    }
    if (key === MEMORY_KEY) {
      const text = await sharedMemoryText(contentDir, warn, leaderSide)
      if (text !== undefined) out.push({ name: 'agenia:memory', text })
      continue
    }
    const text = await readText(join(contentDir, `${key}.md`))
    if (text !== undefined) out.push({ name: `agenia:${key}`, text })
  }
  return out
}

/**
 * 🔴 这里原来有个 `roleOf(assembly)`：从注入文本里扫 `【组员:<角色>】` 认角色。
 *    2026-11-01 第 4 关返修**删掉**了 —— 它是身份的第二作者（定形 §2.2：注入器不读那枚标记）。
 *    现在的唯一作者是 `identityVerdict()`（`toolName` → `ROLE_TABLE`）。
 *    ⚠️ 别把它加回来"照顾旧会话"：旧会话走 `legacy`（row 0.5，不窄、记未受管），
 *       之后同形的走 row 6/7（窄）；**只有标记没有 toolName ⇒ 无角色 + 窄**，这是冻结的负样本。
 */

/**
 * 会话头 → **档**（`'leader' | 'member' | 'unknown'`）。
 *
 * 依据：子会话头里的 `agentPreset`（框架 `childSessionMeta()` 写的：`cwd` /
 * `agentPreset` / `parentSession` / `isSeeded` / `origin: 'subagent'` / `delegationDepth`）。
 * 认不出（缺字段 / 第三个 id）⇒ `'unknown'`（row 6/7：非生产态，窄 + 报警）。
 *
 * ⚠️ `@` 之后那一截（如果哪天出现）不算身份：只比预设 id 本体。
 */
function presetKindOf(header) {
  const id = header === null || header === undefined ? undefined : header.agentPreset
  if (typeof id !== 'string') return 'unknown'
  const base = id.split('@')[0]
  if (base === LEADER_PRESET_ID) return 'leader'
  if (base === MEMBER_PRESET_ID) return 'member'
  return 'unknown'
}

/**
 * 会话头 → `toolName`（派工层传给子会话的那个工具名）。
 *
 * 🔴 这是**会话头**那一条路：头里有 `toolName` 就读它，**永远优先**（有它就不走了桥、也不消费队列）。
 *    **2026-11-02 实测**：委派子会话的头是 `["cwd","agentPreset","origin","parentSession"]` ——
 *    **没有 `toolName`**（九个 `team_*` / `job_*` 全一样）⇒ 这一格给 `null`，`identityVerdict()`
 *    落 row 5（无角色 + 窄），除非装配那一侧从**插件桥**（`BRIDGE_CLAIMS`）补到一条 claim。
 *    桥补到名字时，A0a 那一行自报 `toolName_source=parent-call`；头里本来有就是 `header`。
 * ⚠️ 别在这里补一条"从别处猜 toolName"的退路：那会让身份回到两个作者，A0a 又永远判不出来。
 *    桥不是猜 —— 它记的是父会话**门禁放行那一刻**的真实调用名（同一进程内的内存队列）。
 */
function toolNameOf(header) {
  const name = header === null || header === undefined ? undefined : header.toolName
  return typeof name === 'string' && name.trim() !== '' ? name : null
}

/**
 * 会话头 → 内部 worker（`workflow` / `ralph`）。
 *
 * 🔴 **这一版框架没有这个标记**：子会话头里没有"这条是 workflow / ralph 起的"这个字段（实测子会话头
 *    只有 `cwd` / `agentPreset` / `toolName`，连 `origin` / `parentSession` 都没有）。
 *    ⇒ 永远返回 `null`；`identityVerdict` 的 row 0 只是**纯函数那一侧**的事实。
 *
 * ⇒ 所以这里**不装**"row 0 在运行时能走到"：认不出就是认不出。
 *    能出声的那一条在装配处（`unattributableSession()`）：不是组长那一行、会话头里既没有
 *    `toolName` 也没有 `origin` / `parentSession` ⇒ 打一行「**未受管 · 认不出**」
 *    （workflow / ralph 内部 worker、"工具起的子会话但 toolName 没到"、手动开的组员会话、
 *    升级前的旧会话在这一版**同形**，那句话不许二选一地说成哪一边）。
 *    定形 §2.2 / `CONTRACT-A` §5.1 的"门禁在日志里记一行"因此**降级为这一行**；
 *    要真认出内部 worker，得框架加一个标记（或第 5 关的会话日志探针拿到别的事实）。
 */
function workerKindOf(header) {
  const kind = header === null || header === undefined ? undefined : header.worker
  return kind === 'workflow' || kind === 'ralph' ? kind : null
}

/**
 * 这一行会话是不是**认不出主人**（谁起的它，头上没有任何证据）。
 *
 * 是 ⇒ 装配处打一行「未受管 · 认不出」，并说明 row 0 在这一版**不可达**（不许谎报覆盖）。
 *
 * 🔴 判据**只能用真存在的事实**（2026-11-01 第二轮评审 N-9）：
 *   · 旧判据是 `header.origin === 'subagent'` —— **死代码**：实测子会话头里连 `origin` 这个键
 *     都没有（`header_keys` 只有 `cwd` / `agentPreset` / `toolName`），那一行永远不会出；
 *   · 现在：**不是 row 3（组长那一行认得出）** + `toolNameOf(header) === null`
 *     + 没有 `origin` / `parentSession` 这两个"谁起的"字段。
 *   **不猜**：满足时，"内部 worker / 派工子会话但 toolName 没到 / 手动开的组员会话 / 旧会话"
 *   这一版同形，日志里几个可能都写出来。
 *
 * @param {unknown} header 会话头
 * @param {{row:number}|unknown} identity `identityVerdict()` 的结论（只用 `row`）
 * @returns {boolean}
 */
function unattributableSession(header, identity) {
  if (header === null || typeof header !== 'object') return false
  if (identity === null || typeof identity !== 'object') return false
  // row 3 = 组长自己：没有 toolName 是正常的，预设已经把"它是谁"说清了。
  if (identity.row === 3) return false
  if (toolNameOf(header) !== null) return false
  // 哪天框架真写了"谁起的"这两个字段，就不再是"认不出" —— 那时该按它们判，而不是按这一行。
  if (header.origin !== undefined && header.origin !== null) return false
  if (header.parentSession !== undefined && header.parentSession !== null) return false
  return true
}

/**
 * canonical：先 `resolve`（吃掉 `..` 与 `.`），盘上存在再 `realpath`（吃掉 junction/symlink）。
 * 盘上没有这个路径就退回 `resolve` —— 与 `lib/paths.mjs` 的 `canonicalPath` 同形。
 */
function canonicalPath(p) {
  const resolved = resolve(p)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

/** 可比较形状：canonical + 正斜杠 + 去尾斜杠 + 小写。 */
function pathKey(p) {
  let s = canonicalPath(p).replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s.toLowerCase()
}

/** `child` 是否落在 `parent` 之下（含相等）。 */
function isUnder(child, parent) {
  const c = pathKey(child)
  const p = pathKey(parent)
  return c === p || c.startsWith(`${p}/`)
}

/** 盘符（`C:` / `E:`…）；不认识（UNC、相对路径）⇒ null。 */
function driveOfPath(p) {
  const m = /^([A-Za-z]):/.exec(String(p ?? ''))
  return m ? `${m[1].toUpperCase()}:` : null
}

/**
 * 这个路径落在团队的办公桌上吗？（**规则正文只此一份**）
 *
 * 三条口径：
 *   · **先算落点再比** —— 先 `resolve`（吃掉 `..` 与 `.`），盘上存在再 `realpath`；
 *     只匹配字符串的话，`.team/review/../../x.txt` 里含有 `.team/` 却落在项目根；
 *   · **工位随落点走** —— 从落点向上找最近的、名字恰好是 `.team` 的祖先，找到就放行并报出是哪棵树；
 *     窄会话（`strict === true`）例外：它只认**会话头那棵树**的 office（最硬的那道门，不放宽）；
 *   · **空目标 · 解析不出 cwd · 落点在 C 盘** ⇒ 一律算"不在组内"（C 盘是本机硬禁区）。
 *
 * **不判什么**（读的人不用再猜）：
 *   · **不判活体 cwd** —— 相对路径仍按**会话头** cwd 解析；所以"相对路径写进了会话头那棵树"这种情形，
 *     它与会话头那棵是**同一棵** ⇒ `differs:false`。**这一格该是 false**（两棵树确实一样）；
 *     "放过一次 office 写"这件事的落点**不在这里判**，它落在下面那本账上
 *     （`state/office-landings.jsonl`，`bug-20261107-10` / batch 15）——同一棵也留一行；
 *   · 不判 symlink/junction 攻击、不判 `.team` 目录的权限、不判落点是否真的被写成功。
 *
 * `expected_office` 只在**拒绝**时有意义：落点往上、**最近的且自己有 `.team` 子目录**的那个目录 + `/.team`。
 */
function officeLandingVerdict(target, agent, strict) {
  const norm = (p) => { let s = String(p ?? '').replace(/\\/g, '/'); while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1); return s.toLowerCase() }
  const canon = (p) => { const r = resolve(p); try { return realpathSync.native(r) } catch (err) { return r } }
  const driveOf = (p) => { const m = /^([A-Za-z]):/.exec(String(p ?? '')); return m === null ? null : m[1].toUpperCase() + ':' }
  const partsOf = (p) => String(p ?? '').replace(/\\/g, '/').split('/')
  const officeOf = (p) => { const parts = partsOf(p); for (let i = parts.length - 1; i >= 1; i -= 1) { if (parts[i].toLowerCase() === '.team') return parts.slice(0, i + 1).join('/') } return null }
  const expectedOf = (landing) => { const parts = partsOf(landing); for (let i = parts.length - 1; i >= 1; i -= 1) { const dir = parts.slice(0, i).join('/'); if (existsSync(dir + '/' + OFFICE_DIR)) return dir.replace(/\\/g, '/') + '/' + OFFICE_DIR } return null }
  const headerOfficeOf = (cwd) => { const hit = officeOf(canon(cwd)); return hit === null ? resolve(cwd, OFFICE_DIR) : hit }
  const headerOf = (agent) => { const raw = agent === null || agent === undefined ? undefined : (agent.session === null || agent.session === undefined ? undefined : agent.session.header === null || agent.session.header === undefined ? undefined : agent.session.header.cwd); return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined }
  const refuse = (landing, header) => ({ allow: false, landing, office_root: null, header_office: header, expected_office: null, differs: false, warning: null })
  const cwdRaw = headerOf(agent)
  if (cwdRaw === undefined) return refuse(null, null)
  const cwd = cwdRaw
  const header = headerOfficeOf(cwd)
  if (typeof target !== 'string' || target.length === 0) return refuse(null, header)
  const targetText = target
  const base = cwd
  const landing = canon(resolve(base, targetText))
  if (driveOf(landing) === 'C:') return refuse(landing, header)
  // 🔴 窄会话（`narrowVerdict`）传 `strict === true` ⇒ 退回**最严**的老口径：只认会话头那棵树的 `.team`。
  //    原因：它是队伍里最硬的一道门（窄权限行 5/6/7），这一票放宽的是"工位随落点走"，不该顺带把它也放宽。
  if (strict === true) {
    const inside = (child, parent) => { const c = norm(child); const p = norm(parent); return c === p || c.startsWith(p + '/') }
    // 🔴 F6（技术评审 11-08 的 P2）：基必须是 **cwd 下面**那个 `.team`（= 旧 containment），
    //    不能是"cwd 的最近 `.team` 祖先" —— 后者在 `cwd` 自己就落在某个 `.team` 里时，
    //    会把**外层那棵**当成你的 office，于是窄会话能写同层别的岗位抽屉（`.team/leader/…`），
    //    而注释与报文都写着"只认自己那棵树"。
    const strictBase = resolve(cwd, OFFICE_DIR)
    const allowStrict = inside(landing, strictBase)
    return { allow: allowStrict, landing, office_root: strictBase, header_office: header, expected_office: strictBase, differs: false, warning: null }
  }
  const office = officeOf(landing)
  const allow = office !== null
  const differs = office !== null && norm(office) !== norm(header)
  const expected = office === null ? expectedOf(landing) : null
  return { allow, landing, office_root: office, header_office: header, expected_office: expected, differs, warning: differs ? 'OFFICE_TREE_DIFFERS' : null }
}

// ─────────────────────────────────────────────────────────────────────────────
// office 落点账（`bug-20261107-10` · batch 15）
//
// 一次**放行**的 office 写 = 盘上一行。没有这本账时，"这一轮放行过哪些写、落在哪棵树"会话结束就查无此事：
// `office_root` / `header_office` / `differs` 只作为 `officeBoundVerdict` 的 readings 活在内存里，
// 而相对路径落进**会话头自己那棵树**时两棵树相等 ⇒ 盘上零痕迹。
//
// 三条口径（改之前先读一遍）：
//   · **写方那棵树**：账落 `<header_office>/state/office-landings.jsonl`（会话头那棵树的 `.team`），
//     **不是**落点那棵树 —— 一个工作区只有一本账，"三次放行 ⇒ 恰好两行"这句话才有意义；
//   · **只追加**：`appendFileSync`，绝不重写整份文件（预置的行必须逐字节活着）；
//   · **只记落点与两棵树**：一行恰好七个键（`at` / `role` / `tool` / `landing` / `office_root` /
//     `header_office` / `tree_differs`），**没有地方放正文** —— 账本不是日志倾倒场。
//
// 谁写：`apply()` 的 `tools.guard`，在岗位写边界**放行**之后（被拒的写一行都不留：账记的是放行）。
// 谁读：`officeLandingLedger`（`warning` 由账上的 `cross_tree` 数出来，不从内存 readings 猜）。
// 写方有两个失败面，**两个码**（读的人要分得开）：
//   · `E_OFFICE_LEDGER_SHAPE` —— 这一行本身不合契约 §1.2（键集 / 正文键 / 值类型）；
//   · `E_OFFICE_LEDGER_UNWRITABLE` —— 盘写不进去（建目录 / 追加失败）。
// 读方两个面、**两个码**（"并发写没写完"与"账本坏了"不许是同一个字符串）：
//   · `E_OFFICE_LEDGER_UNREADABLE` —— **中间行**损坏 / 账本读不动，计入 `unreadable`；
//   · `E_OFFICE_LEDGER_PARTIAL_TAIL` —— **最后一行**写了一半（无锁追加没写完），计入 `partial_tail`。
// 两个读面都 `ok:false`（报告了不等于容忍）；fail-closed 只挂在写方那两个码上：
// 门禁拿到写方的 `ok:false` 就**拒这次写**（`E_GUARD_OFFICE_LEDGER`）。
// ─────────────────────────────────────────────────────────────────────────────

/** 账本相对**某个 office**（`.team` 那一级）的路径 —— 冻结名字（判据与探针按它取）。 */
export const OFFICE_LANDING_LEDGER_REL = 'state/office-landings.jsonl'

/** `recordOfficeLanding` 失败时返回的码之一：**盘写不进去**（建目录 / 追加失败）。 */
const OFFICE_LEDGER_UNWRITABLE = 'E_OFFICE_LEDGER_UNWRITABLE'

/**
 * `recordOfficeLanding` 失败时返回的另一个码：**这一行本身不合契约 §1.2**。
 *
 * 与 `E_OFFICE_LEDGER_UNWRITABLE` 分开的理由：两个面查的人不一样 —— "盘满了 / 没权限"要去弄盘，
 * "行不成形状"是实现自己拼错了这一行（盘可能一点事都没有）。合成一个码会把查的人支去错的方向。
 * 登记在 `lib/error-codes.mjs::CODES`（退出码 5 = 校验拒绝族；它不是 CLI 退出码）。
 */
export const OFFICE_LEDGER_SHAPE = 'E_OFFICE_LEDGER_SHAPE'

/** 账本读不动 / **中间行**损坏时的码（`officeLandingLedger` 的 `reason` 前缀）。 */
const OFFICE_LEDGER_UNREADABLE = 'E_OFFICE_LEDGER_UNREADABLE'

/**
 * 账本**最后一行写了一半**时的码（`officeLandingLedger` 的 `reason` 前缀）。
 *
 * 与 `E_OFFICE_LEDGER_UNREADABLE` 分开的理由：两个面查的人不一样 —— "并发写没写完"重读一次通常就好，
 * "中间那一行坏了"要去看那一行到底出了什么事。合成一个码，读的人分不出是哪件事。
 * 仍然是 `ok:false`：半行意味着这本账没被完整读出来，不许装成可信读数。
 * 与 `E_OFFICE_LEDGER_UNREADABLE` 一样不是 CLI 退出码，登记在 `lib/error-codes.mjs::CODES`
 * （退出码 5 = 校验拒绝族，只为让 `CODES[code].exit` 有确定值）。
 */
const OFFICE_LEDGER_PARTIAL_TAIL = 'E_OFFICE_LEDGER_PARTIAL_TAIL'

/**
 * 账本的绝对路径：`<officeRoot>/state/office-landings.jsonl`（`officeRoot` 就是 `.team` 那一级）。
 *
 * 相对路径那两段由 `OFFICE_LANDING_LEDGER_REL` 拆出来（唯一来源）；`officeRoot` 为空时
 * 退回一个**拼不出来的路径**由调用方按"写不进去"处理 —— 不猜、不抛。
 */
export function officeLandingLedgerPath(officeRoot) {
  return join(String(officeRoot ?? ''), ...OFFICE_LANDING_LEDGER_REL.split('/'))
}

/**
 * 追加一行（**只追加，不重写**）。返回 `{ ok, code, path, reason }`，**不抛**。
 *
 * 两个失败面、两个码（别把两件事写成一句话）：
 *   · `E_OFFICE_LEDGER_SHAPE` —— 这一行**本身**不合契约 §1.2（键集不是恰好七个 / 带正文键 / 值类型不对）。
 *     `reason` 点名哪一处不合；这是调用方的 bug，不是盘的问题；
 *   · `E_OFFICE_LEDGER_UNWRITABLE` —— 盘写不进去（建目录 / 追加失败），`reason` 点名 errno 一族。
 * 两个面都走 `ok:false`（调用方按 fail-closed 拒这次写），但报文必须分得开。
 * `path` 恒是这本账的绝对路径 —— 形状失败时也算得出来，报文才点得名"是哪本账"。
 *
 * @param {string} officeRoot 写方那棵树（会话头那棵）的 `.team`
 * @param {object} line 恰好七个键的账行（**形状由这里强制**，见 `OFFICE_LEDGER_ROW_VERDICT`）
 */
export function recordOfficeLanding(officeRoot, line) {
  // 路径**先算**：形状失败也要给得出落点（否则门禁报文会打出「账本「null」」，把人支去查盘）。
  const path = officeLandingLedgerPath(officeRoot)
  // 🔴 F9（第 4 关打回）：**形状由这里强制**，不由调用方自觉 —— 七键闭集、不带正文、七样的值类型。
  //    从前这里只写不管，于是"账本只记落点、不记正文"这句话没有执行点。
  const shape = OFFICE_LEDGER_ROW_VERDICT(line)
  if (shape !== null) return { ok: false, code: OFFICE_LEDGER_SHAPE, path, reason: `账行不成形状：${shape}` }
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(line)}\n`, 'utf8')
    return { ok: true, code: null, path, reason: null }
  } catch (err) {
    const detail = `${String(err?.code ?? 'UNKNOWN')}: ${String(err?.message ?? err)}`
    return { ok: false, code: OFFICE_LEDGER_UNWRITABLE, path, reason: detail }
  }
}

/**
 * 从**盘上**读回这本账（不读任何内存里的 readings）。
 *
 * `ok:false` 只由"读不动"、"中间行坏"或"最后一行写了一半"引起；**`exists:false` 不是 `ok:false`**
 * （新队还没有这本账是正常态），但它也**不算证据**：任何一格都不许拿"没有账本"当"机制成立"。
 * `unreadable > 0` ⇒ `ok:false`（半行绝不当成 0 行，否则"账坏了"与"账是空的"长得一模一样）；
 * `partial_tail > 0` ⇒ `ok:false` + 自己的码（这本账没读完，不许装成可信读数）。
 *
 * @param {string} officeRoot 账本在哪棵树的 `.team` 下
 */
/** 账本一行的七键（**与测试侧 `LEDGER_KEYS` 同名同序**）—— 冻结。 */
export const OFFICE_LEDGER_ROW_KEYS = ['at', 'role', 'tool', 'landing', 'office_root', 'header_office', 'tree_differs']
/** 这些键出现 = 正文进了账（**与测试侧 `CONTENT_KEYS` 对齐的 9 个名字**）。 */
export const OFFICE_LEDGER_BODY_KEYS = ['content', 'text', 'body', 'patch', 'old_string', 'new_string', 'payload', 'after', 'before']

/**
 * 一行账合不合规 —— 纯函数，写方与读方**共用**（一个口径一份实现）。
 *
 * 判两样，缺一不可（契约 §1.2）：
 *   ① **键集恰好七个** —— 少一个 / 多一个都不行，正文键单独点名（账本不是日志倾倒场）；
 *   ② **七样的值类型** —— `at` 是能 `Date.parse` 的字符串 · `role` 非空字符串 · `tool` ∈ `write`/`edit` ·
 *      `landing` / `office_root` / `header_office` 非空字符串 · `tree_differs` 布尔。
 * 判据侧 `tests/agenia-upgrade/support/office-ledger-fixtures.mjs::lineProblems` 对同一批样例逐条查
 * 同样这七样（它把路径 / 岗位与期望值比，这里没有"期望值"可给，只能判"像不像那个字段"）。
 *
 * **不判**：`tree_differs` 与两个 office 是否自洽 —— 契约 §5.7 明写"手改一个 `tree_differs` 能骗过读者，
 * 本批不防"。今天是自证字段，要防得另开一票（先把这个文件里那三份路径归一化收成一份）。
 *
 * @returns {string|null} `null` = 合规；否则是拒的理由（点名缺哪个 / 多哪个 / 哪个是正文键 / 哪个值不对）
 */
export function OFFICE_LEDGER_ROW_VERDICT(line) {
  if (line === null || typeof line !== 'object' || Array.isArray(line)) return '不是对象'
  const keys = Object.keys(line)
  // 缺键与多键用**同一个谓词**（自有可枚举键）：`in` 会认原型链，与 `Object.keys` 不是一把尺子。
  const missing = OFFICE_LEDGER_ROW_KEYS.filter((key) => !keys.includes(key))
  if (missing.length > 0) return `缺键 ${missing.join('/')}`
  // 🔴 正文键**先于**"多键"判：正文键也不在那七个里，晚一步就只会得到"多键 content"，
  //    "正文进账了"这个语义就没人说得出来。
  const body = keys.filter((key) => OFFICE_LEDGER_BODY_KEYS.includes(key.toLowerCase()))
  if (body.length > 0) return `有正文键 ${body.join('/')}（账本不记内容）`
  const extra = keys.filter((key) => !OFFICE_LEDGER_ROW_KEYS.includes(key))
  if (extra.length > 0) return `多键 ${extra.join('/')}（一行的键集必须恰好是那七个）`
  // ── 值（契约 §1.2 那张表第二列）────────────────────────────────────────────
  if (typeof line.at !== 'string' || Number.isNaN(Date.parse(line.at))) return `at 不是可解析的时刻字符串（实得 ${JSON.stringify(line.at)}）`
  if (typeof line.role !== 'string' || line.role.trim() === '') return `role 不是非空字符串（实得 ${JSON.stringify(line.role)}）`
  if (line.tool !== 'write' && line.tool !== 'edit') return `tool 只能是 write/edit（实得 ${JSON.stringify(line.tool)}）`
  for (const key of ['landing', 'office_root', 'header_office']) {
    const value = line[key]
    if (typeof value !== 'string' || value.trim() === '') return `${key} 不是非空字符串（实得 ${JSON.stringify(value)}）`
  }
  if (typeof line.tree_differs !== 'boolean') return 'tree_differs 不是布尔'
  return null
}

export function officeLandingLedger(officeRoot) {
  const path = officeLandingLedgerPath(officeRoot)
  const out = {
    ok: true, path, exists: false, entries: 0, same_tree: 0, cross_tree: 0, unreadable: 0, partial_tail: 0,
    warning: null, reason: null, lines: [],
  }
  if (!existsSync(path)) return out
  out.exists = true
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    out.ok = false
    out.reason = `${OFFICE_LEDGER_UNREADABLE}: 账本读不动（${String(err?.code ?? err)}）`
    return out
  }
  // 🔴 F9：一行合不合规由 `OFFICE_LEDGER_ROW_VERDICT` 判 —— 与**写方同一个函数**（一个口径一份实现）：
  //    七键闭集 + 不带正文 + 七样的值类型。坏行计入 `unreadable`，绝不当成 0 行。
  const bad = []
  const partial = []
  const rawLines = String(text).split('\n')
  const nonEmpty = rawLines.filter((line) => line.trim() !== '')
  for (const [index, raw] of rawLines.entries()) {
    if (raw.trim() === '') continue
    let row = null
    try { row = JSON.parse(raw) } catch { row = null }
    const isLast = index === rawLines.length - 1
    if (row === null) {
      // 🔴 F11：**最后一行**解析不了 ⇒ 多半是并发写了一半（无锁追加），与中间行损坏不是一回事
      if (isLast && nonEmpty.length > 1) { partial.push(index + 1); continue }
      out.unreadable += 1
      bad.push(index + 1)
      continue
    }
    const why = OFFICE_LEDGER_ROW_VERDICT(row)
    if (why !== null) {
      out.unreadable += 1
      bad.push(`${index + 1}（${why}）`)
      continue
    }
    out.entries += 1
    if (row.tree_differs === true) out.cross_tree += 1
    else out.same_tree += 1
    out.lines.push(row)
  }
  // 这一行是"读数从账上来"的那一半：`warning` 只由盘上的行数出来，不从内存 readings 猜。
  out.warning = out.cross_tree > 0 ? 'OFFICE_TREE_DIFFERS' : null
  if (partial.length > 0) {
    out.partial_tail = partial.length
    out.ok = false
    out.reason = `${OFFICE_LEDGER_PARTIAL_TAIL}: 最后一行像是**写了一半**（第 ${partial.join('、')} 行）`
      + ' —— 账本无锁追加，可能是并发写没写完；重读一次通常就好，别当成"账本坏了"'
  }
  if (bad.length > 0) {
    out.ok = false
    out.reason = `${OFFICE_LEDGER_UNREADABLE}: ${bad.length} 行不合格（第 ${bad.join('、')}）—— 不许当成 0 行`
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 委派门禁（**纯函数**）：名单从组合 config 读，代码里不硬编码。
//
// 为什么这四个必须导出：不导出就只能隔着整条 apply 路测它们，"喂假 config 验错误态"
// 这件事根本做不了（退化成"读代码觉得对"）。裁定 Q1 冻了命名 export，静态用例按名字取。
//
// 两条判定的返回值形状是冻结的：**null = 放行**，`{ code, message }` = 拒绝。
// 拒绝报文里那几个子串（`必须后台运行` · `run_in_background: true` · `（省略即后台）`）也是冻的。
// ─────────────────────────────────────────────────────────────────────────────

/** 委派名单那个 config 键的名字 —— `apply` 的出声报文与 `delegationPolicy` 读的是同一个。 */
const DELEGATION_TOOLS_KEY = 'delegationTools'

/** `delegationTools` 里允许的两个模式值（别的值一律算非法配置）。 */
const DELEGATION_MODES = ['one-shot', 'continuable']

/** 配置坏掉时的错误码（裁定 A4 第 3 条）。 */
const GUARD_CONFIG_ERROR = 'E_GUARD_CONFIG_MISSING'

/**
 * 配置坏掉时**仍然要拦**的委派名（追加裁定 v1.1 · A13，逐字）：
 *   · 精确名 `subagent`（裸外聘那条路）；
 *   · `team_` 前缀（五个固定岗位）；
 *   · `job_memory_` / `job_conversation_` / `job_technical_` 前缀（四条一次性作业）。
 *
 * 🔴 **明确放行** `job_output` / `job_kill` / `job_list` —— 它们是**框架自己的**任务工具，
 *    配置坏了还得靠它们把作业结果收回来。更早那版写的是 `^(subagent|team_|job_)`，
 *    会连它们一起误杀（症状：现场再也收不回结果）⇒ 那条形状已作废，别再改回去。
 */
const DELEGATION_CONFIG_ERROR_REJECT = (toolName) =>
  toolName === 'subagent'
  || toolName.startsWith('team_')
  || ['job_memory_', 'job_conversation_', 'job_technical_'].some((prefix) => toolName.startsWith(prefix))

/**
 * 从组合 config 算出委派政策（**裁定 A4**）。
 *
 * 入参形状**只有一种**：`config.delegationTools` = `{ <工具名>: 'one-shot' | 'continuable' }`。
 * 缺 / `null` / 不是映射（数组、字符串）/ 空映射 / 有非法模式值 ⇒
 * `configError = 'E_GUARD_CONFIG_MISSING'` —— 调用方必须出声，**不许静默放前台**。
 *
 * `backgroundExposed` = 名单里的**全部**键（`new Set(mode.keys())`），没有筛选条件。
 * 🔴 0.2.1 起它**不指任何平台事实** —— 别拿它推"某个工具暴露了 `run_in_background`"：
 *    委派走的是 `@deepseek-ai/dsh-tool-subagent`（0.2.1-rc.2），它的 config schema 只有
 *    `provider` / `toolName` / `modelSelectionSettings` / `agentOptions` / `agentPreset` /
 *    `allowedAgentPresets` / `maxDepth`，**没有 `enableRunInBackground`**；工具参数表里
 *    **也没有 `run_in_background`**。（`enableRunInBackground` 在 0.2.1 还活着，但那是
 *    bash / pwsh / terminal / workflow 四个工具的 config 键，与委派无关。）
 *    ⇒ 没有"参数被拿掉"这件事可判。这个字段留着只是给对账/读数一份名单，语义已经不是
 *    "参数暴露"；而且那四条 `one-shot` 也不再靠"必须显式 true"（省略就放行，见下面
 *    `subagentBackgroundVerdict` 的规则）。
 *
 * @param {object} config - `persona-injector` 那一行的 config 段。
 * @returns {{ mode: Map<string,string>, backgroundExposed: Set<string>, configError: string|null }}
 */
export function delegationPolicy(config) {
  const raw = config === null || config === undefined ? undefined : config[DELEGATION_TOOLS_KEY]
  const broken = () => ({ mode: new Map(), backgroundExposed: new Set(), configError: GUARD_CONFIG_ERROR })
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return broken()
  const entries = Object.entries(raw)
  if (entries.length === 0) return broken()
  const mode = new Map()
  for (const [toolName, value] of entries) {
    if (typeof toolName !== 'string' || toolName.length === 0) return broken()
    if (!DELEGATION_MODES.includes(value)) return broken()
    mode.set(toolName, value)
  }
  return { mode, backgroundExposed: new Set(mode.keys()), configError: null }
}

/**
 * 名单的键（升序、去重）—— 给静态对账与文档用，与 `subagentBackgroundVerdict` 读同一张表。
 * 形状不合法就返回空数组（**不抛**）：要判"配置坏了"请读 `delegationPolicy` 的 `configError`。
 */
export function delegationToolNames(config) {
  return [...delegationPolicy(config).mode.keys()].sort()
}

/**
 * 调用前判定（**纯函数**）：`null` = 放行；`{ code, message }` = 拒绝（**绝不启动子代理**）。
 *
 * 规则（提案 §B1.5，2026-10-19 按 DSH 0.2.1 改过 `one-shot` 那一条）：
 *   · 名单里是 `one-shot` ⇒ `true` **或省略**放行（0.2.1 的委派一律异步，参数已经删了）；
 *     只有显式 `false` / `'true'` / `null` / `0` 才拒（`E_GUARD_JOB_FOREGROUND`）——
 *     判据仍是 `=== true`，只是"省略"从"前台等着"变成了"框架本身就异步"。
 *   · 名单里是 `continuable` ⇒ 省略或 `true` 放行，只有显式 `false` 才拒（`E_GUARD_SELF_FOREGROUND`）。
 *   · 不在名单里 ⇒ 放行 —— 无关工具（含框架自己的 `job_output` / `job_kill` / `job_list`）
 *     一个都不许误伤；判定只看**工具名 + 这一个参数**。
 *   · `policy.configError` 非空 ⇒ 按 A13 那条窄形状拦委派名，其余照常放行。
 */
export function subagentBackgroundVerdict(toolName, args, policy) {
  const name = typeof toolName === 'string' ? toolName : ''
  const configError = policy === null || policy === undefined ? GUARD_CONFIG_ERROR : policy.configError
  if (configError !== null && configError !== undefined) {
    if (!DELEGATION_CONFIG_ERROR_REJECT(name)) return null
    return {
      code: GUARD_CONFIG_ERROR,
      message: `「${name}」这次调用被拒：委派名单配置坏了（${GUARD_CONFIG_ERROR}）—— `
        + `persona-injector 那一行的 ${DELEGATION_TOOLS_KEY} 缺失或非法。`
        + '修好配置再派活；0.2.1 里委派本身就是异步的，不需要也不能传 run_in_background。',
    }
  }
  const mode = policy.mode instanceof Map ? policy.mode.get(name) : undefined
  if (mode === undefined) return null
  const flag = args === null || typeof args !== 'object' ? undefined : args.run_in_background
  if (mode === 'one-shot') {
    // 🔴 2026-10-19（DSH 0.2.1）：`run_in_background` 这个参数**已经从工具里删掉了** ——
    //    0.2.1 的委派一律异步（调用即返回 `started subagent`，完成后再通知），
    //    所以"省略"是唯一可能的值，它本来就满足"不会把组长卡在前台"这条门禁的**目标**。
    //    ⇒ 省略放行；只有真有人硬塞 `false` 才拒（旧版语义保留，免得再引入一个前台通道）。
    //    ⚠️ 别把它改回"必须 === true"：那会让四条作业在 0.2.1 上**一次都发不出去**。
    if (flag === true || flag === undefined) return null
    // 报文要说清**为什么被拒**：省略在上一行就放行了，走到这里一定是**显式**塞了非 `true` 的值
    // （`false` / `'true'` / `null` / `0` / 别的）。所以别再说"省略会在前台等着"—— 那是 0.2.0 的事。
    const shown = typeof flag === 'string' ? `'${flag}'` : String(flag)
    return {
      code: 'E_GUARD_JOB_FOREGROUND',
      message: `「${name}」是一次性作业，必须后台运行 —— 这次被拒是因为显式塞了 run_in_background: ${shown}。`
        + '0.2.1 的委派天生异步（调用即返回 started subagent，完成后再通知），这个参数已经从工具里删掉了：'
        + '省略它就是后台；门禁只为兼容老调用，仍把 run_in_background: true 当「后台」放行。'
        + "显式 false / 'true' / null / 0 都是「要前台」的意思 —— 把这个参数整个去掉再派。",
    }
  }
  if (flag === false) {
    return {
      code: 'E_GUARD_SELF_FOREGROUND',
      message: `「${name}」必须后台运行（省略即后台）—— 这次被拒是因为显式传了 run_in_background: false。`
        + '0.2.1 的委派天生异步（调用即返回 started subagent，完成后再通知），这个参数已经从工具里删掉了；'
        + '把它整个去掉就对了，不用再补任何值。',
    }
  }
  return null
}

/**
 * 岗位写边界 —— 把原来内联的那段判定抽成纯函数（提案 §B1.5 冻的签名与返回形状）。
 * `null` = 放行；`{ code, message }` = 拒绝。两个码（`E_GUARD_OFFICE_SHELL` /
 * `E_GUARD_OFFICE_WRITE`）与报文前缀「你的岗位（<role>）」都是冻结的判据，别换措辞。
 *
 * 三条语义（改之前先想清楚）：
 *   · 角色认不出 / 不在名单里 ⇒ 放行 —— 这道边界是挡几个岗位的，**绝不能反过来挡组长**；
 *   · `bash` / `pwsh` 一律拒（一条通用命令行就是一条通用写入通道，留着它边界就是纸的）；
 *   · `write` / `edit` 按**落点**判：落点必须在**某棵树的 `.team/`** 里才放行
 *     （工位随落点走 —— `officeLandingVerdict` 那一节写着完整口径，含"哪棵树的办公室"与"读数是哪六个字段"）。
 *
 * 🔴 2026-11-01 第 4 关返修：**"`review` 没有命令行"这条规则的运行时作者是角色表**
 *    （`ROLE_TABLE[review].tools = NO_SHELL_TOOLS`）—— 装配时裁目录（`toolCatalogFor`）、
 *    调用时由 `roleToolVerdict` 拒，门禁里排在它前面。这个函数留着的是**写边界**
 *    （+ 冻结单测直接调它时的那条 shell 语义：`roles.test.mjs` / `REV-02` 钉着两个码与报文前缀）。
 *    ⚠️ 别把 `officeBound: ['review']` 从组合里删掉去"消灭第二个作者"：那份配置与这个函数
 *       被 `REV-02` / `PFL-06` / `STAT-02` 三处冻结判据钉着，删它要改测试 —— 那不是本票能单方面做的。
 */
export function officeBoundVerdict(role, toolName, args, agent, officeBoundSet, readings) {
  const bound = officeBoundSet instanceof Set
    ? officeBoundSet
    : new Set(Array.isArray(officeBoundSet) ? officeBoundSet : DEFAULT_OFFICE_BOUND)
  if (typeof role !== 'string' || !bound.has(role)) return null

  if (SHELL.includes(toolName)) {
    return {
      code: 'E_GUARD_OFFICE_SHELL',
      message: `你的岗位（${role}）没有命令行。命令行等于什么都能写，留着它这道边界就是纸的。`
        + '要什么材料 —— 代码差异、命令输出、文件清单 —— 找组长要，他给你。',
    }
  }

  const key = WRITE_TARGET[toolName]
  if (key === undefined) return null
  const target = args === null || typeof args !== 'object' ? undefined : args[key]
  const verdict = officeLandingVerdict(target, agent)
  // 第六参是**读数**，不是判词：给了就填六个字段（谁要看这一格就自己传一个空对象进来）。
  if (readings !== null && readings !== undefined && typeof readings === 'object') {
    readings.landing = verdict.landing
    readings.office_root = verdict.office_root
    readings.header_office = verdict.header_office
    readings.expected_office = verdict.expected_office
    readings.differs = verdict.differs
    readings.warning = verdict.warning
  }
  if (verdict.allow) return null

  const prefix = `你的岗位（${role}）只能写项目里 .team/ 下面的东西。`
  if (verdict.landing === null) {
    return {
      code: 'E_GUARD_OFFICE_WRITE',
      message: prefix + `你这次要写的是「${String(target)}」，按落点算在你的地盘外面。`
        + '要改什么，写成意见交回组长。',
    }
  }
  const tail = verdict.expected_office === null
    ? '往上找不到带 .team 的树（期望的 office 路径判不出来）。'
    : `期望的 office 是「${verdict.expected_office}」。`
  return {
    code: 'E_GUARD_OFFICE_WRITE',
    message: prefix + `落点「${verdict.landing}」不在一棵树的 .team 里；` + tail
      + '要改什么，写成意见交回组长。',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 情绪板：三维打分（契约 §三）。**导出的纯函数** —— 时间只能从参数进。
// 为什么必须导出：不导出就只能隔着整条尾巴路测它，"喂假信号验单调性"这件事
// 根本做不了（退化成"读代码觉得对"）。探针的 N 族就钉在这上面。
//
// 常数**不在这个文件里**：它们住在 `mood.md` 的 ```mood 块里（口径 13/14），
// 每次要贴尾巴时现读 ⇒ 改常数不用重启 harness。这里只写"怎么用"，不写"用多少"。
// ⚠️ 写在 `num(c.xxx, 默认)` 里的那几个数**只是缺省值**（那个块里没写这个键时的兜底）——
//    块里给了就**以文件里的为准**：`moodConstants()` 把它们一起收进白名单再传进来。
//    ⇒ 四档刻度（重逢量程 / 重逢顶 / 夸一步 / 骂一步）与一、二级常数同路，改文件即生效。
// ─────────────────────────────────────────────────────────────────────────────
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const num = (x, fallback = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback)
const MINUTE = 60 * 1000

/** 掌控那个滑动窗口有多长（口径 3：最近 **20 次**工具结果，跨回合不清零）。 */
const RECENT_WINDOW = 20

/**
 * 一次失败的影响还剩多少：**现实时间半衰 × 每回合折扣**（两个时钟）。
 * 现实时间管"熬到半夜"，回合数管"新的一轮活儿来了、旧账翻篇"。
 * 两个常数都从 `constants` 里拿；缺了 ⇒ 这一项按 0 算 —— 宁可少一个信号，
 * 也不许拿一个瞎编的常数顶上（那会让"改了 `mood.md` 却没生效"看不出来）。
 */
function decayOf(signals, constants) {
  const now = signals?.now
  const last = signals?.lastErrorAt
  const halfLife = constants?.halfLifeMinutes
  if (typeof now !== 'number' || typeof last !== 'number') return 0
  if (typeof halfLife !== 'number' || !(halfLife > 0)) return 0
  const minutes = Math.max(0, (now - last) / MINUTE)
  const rounds = Math.max(0, num(signals?.roundsSinceError))
  const decay = constants?.roundDecay
  const perRound = typeof decay === 'number' && decay > 0 && decay <= 1 ? decay ** rounds : 1
  return Math.exp(-minutes / halfLife) * perRound
}

/**
 * 滑动窗口里的成功率（口径 3）：窗口空 ⇒ 退回 `oks / (oks + errors)`；两边都没有 ⇒ 0.5（中性）。
 * ⚠️ 窗口**跨回合不清零**（治"回合一切、成功率永远是一条直线"）—— 那是采集端的事。
 */
function successRateOf(signals) {
  const window = Array.isArray(signals?.recentResults) ? signals.recentResults : undefined
  if (window !== undefined && window.length > 0) {
    return window.filter((result) => result === 'ok').length / window.length
  }
  const errors = Math.max(0, num(signals?.errors))
  const oks = Math.max(0, num(signals?.oks))
  const total = errors + oks
  return total === 0 ? 0.5 : oks / total
}

/**
 * "同一个坑"重复了几次（口径 5）：取 `pitCounts` 里**最深**的那一个。
 * ⚠️ 它数的是**同一个错**（工具名 + 报文首行那个指纹）出现过几次 —— 不是"连续失败几次"：
 *    两个不同的坑各一次 ⇒ 这里是 1 ⇒ 不扣分（只按连续失败数的实现分不开这两组）。
 */
function worstPitRepeat(pitCounts) {
  if (pitCounts === null || typeof pitCounts !== 'object') return 0
  let worst = 0
  for (const value of Object.values(pitCounts)) worst = Math.max(worst, num(value))
  return worst
}

/**
 * 三维分数 + 命中的场景。**同步、纯函数、不碰真实时钟**（口径 10/12）。
 * 每一维吃哪根信号、为什么是这个形状：`mood.md` 第二节那张表（老板不读 `.js`）。
 * 缺项按"中性"算，**不许抛** —— 少一个信号不该让整条尾巴没得贴。
 *
 * @param signals   契约 §四 那张表（`now` 必填，其余缺项按中性）
 * @param constants `mood.md` 里那个 ```mood 块（常数 + 关键词表 + 场景例库）
 * @returns `{ scores, scenes }` —— `scenes` 是按 `constants.scenes` 的先后**全部**命中项
 */
export function moodOf(signals, constants) {
  const s = signals ?? {}
  const c = constants ?? {}

  // ── 掌控 = 干活的成败（口径 3/4/5）────────────────────────────────────────
  const rate = successRateOf(s)
  const success = clamp01((rate - 0.4) / 0.6)
  // 失败的影响：只要**窗口里还有失败**就算，**不再要求"本回合出过错"**（治 P3）——
  // 上一回合那次失败照样按"时间半衰 × 回合折扣"往下减，只是越久越轻。
  const hasFail = Array.isArray(s.recentResults)
    ? s.recentResults.includes('fail')
    : Math.max(0, num(s.errors)) > 0
  const weight = hasFail ? decayOf(s, c) : 0
  const pitRepeat = worstPitRepeat(s.pitCounts)
  const control = clamp01(success - 0.5 * weight - num(c.pitStep, 0.08) * Math.max(0, pitRepeat - 1))

  // ── 活力 = 今天还剩多少劲（口径 12）──────────────────────────────────────
  // ⚠️ 回退（他离开 ⇒ 那一段不算、之前攒的按半衰退烧）**算在采集端**，这里只收一个
  //    已经算好的数：两边各算一次会把同一个衰减乘两遍（实测踩过：活力恒满）。
  // 🔴 **这一维是反着算的**（老板 2026-09-26 定）：干得越久 ⇒ 分越低。
  //    改名之前它叫"疲劳"，那时是"干得越久分越高" —— 名字一改，方向跟着翻，
  //    否则会出现"我活力 .80"其实是累趴了这种反着读的数。
  const fullScale = c.fullScaleMinutes
  const fatigue = typeof fullScale === 'number' && fullScale > 0
    ? clamp01(1 - Math.max(0, num(s.netWorkMinutes)) / fullScale)
    : 1

  // ── 亲近 = 重逢项 + 夸 / 骂（口径 6/7）───────────────────────────────────
  const sinceBoss = Math.max(0, num(s.sinceBossMinutes))
  // 重逢项量的是"他**这一次开口之前**离了多久"（治 P5）：老实现量"现在离他上一句多久"，
  // 老板一开口那个数就被刷成 0 ⇒「他久别归来」永远亮不了。
  // ⚠️ 缺这个信号就退回 `sinceBossMinutes`（"他越久没开口 ⇒ 越想他"那条单调性仍然成立）。
  const gap = typeof s.sincePreviousBossMinutes === 'number' && Number.isFinite(s.sincePreviousBossMinutes)
    ? Math.max(0, s.sincePreviousBossMinutes)
    : sinceBoss
  const reunionScale = num(c.reunionScaleMinutes, 240)
  const reunion = clamp01(num(c.reunionBase, 0.9) * clamp01(reunionScale > 0 ? gap / reunionScale : 0))
  // 🔴 **骂赢是"一句之内"的规矩，不是"整段"的**（口径 7）：同一句话里夸词和骂词都出现 ⇒
  //    那一句只算骂 —— 那一步在数句子的那一层（`keywordCounts`）做完了，这里拿到的是两个句数。
  //    不同句子各自记账：三句夸 + 一句骂 ⇒ 净 +3×.06 − .08。
  // ⚠️ 两档都是**带符号的**：`mood.md` 那份块里 `blameStep` 写的就是负的（骂是往下）。
  //    谁把符号写歪（或者在这里给它挂个多余的减号），方向当场反过来，而分数行长得一样"正常"。
  const closeness = clamp01(
    // 🔴 **基线 0.50**（老板 2026-09-26 定）：他还没开过口、会话刚开始时就是 .50，不是 .00。
    //    它跟重逢项 / 夸 / 骂是**加法**关系 —— 那三样还是原来的刻度，只是从一个抬高的底往上加。
    //    ⚠️ 它同时改变了「他久别归来」的触发频率：那个门**没动**（还是 .65）⇒
    //       他离开约 40 分钟再开口就会亮。**老板知情并接受，别再当 bug 修**（`mood.md` 里有同一条注记）。
    num(c.closenessBase, 0.5)
    + reunion
    + num(c.praiseStep, 0.06) * Math.max(0, num(s.keywordPraise))
    + num(c.blameStep, -0.08) * Math.max(0, num(s.keywordBlame)),
  )

  const scores = { control, fatigue, closeness }

  // 命中 = `when` 里**每一个**维度都落进它的区间；递出去的次序 = `mood.md` 里的先后。
  // 不做数量上限：区间满足却没递出来，和"实现漏了"分不开。
  const hits = []
  for (const scene of Array.isArray(c.scenes) ? c.scenes : []) {
    const when = scene?.when
    if (when === null || typeof when !== 'object') continue
    const hit = Object.entries(when).every(([dim, band]) =>
      Array.isArray(band) && band.length === 2 && scores[dim] >= band[0] && scores[dim] <= band[1])
    if (hit) hits.push({ id: scene.id, when, lines: [...scene.lines] })
  }
  return { scores, scenes: hits }
}

/**
 * 一个词在句子里命中了吗？（口径 8）
 * - **全是 ASCII 字母数字**的词（`der`）⇒ **整词匹配**：`under` / `order` / `header` / `nader`
 *   都不算（它们只是**含有**那三个字母）。
 * - 其余（中文）⇒ **子串匹配**。
 * ⚠️ 大小写不敏感；整词那一路**不许用 `\b`** —— `der-x` 会被 `\b` 认成命中，
 *    判据是"两侧不是字母数字"。
 */
function wordHits(sentence, word) {
  if (typeof sentence !== 'string' || typeof word !== 'string' || word.length === 0) return false
  const text = sentence.toLowerCase()
  const lower = word.toLowerCase()
  if (/^[a-z0-9]+$/.test(lower)) {
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(text)
  }
  return text.includes(lower)
}

/**
 * 一句话里数出两样东西（口径 7）：**带夸奖关键词的句子数**、**带骂关键词的句子数**。
 * **同一句话两个都命中 ⇒ 只算骂**（骂赢）—— 这是"一句之内"的规矩；
 * 不同的句子各自记账（三句夸 + 一句骂 = 净 +.10），整段清零那条写法是错的。
 */
function keywordCounts(sentences, constants) {
  const praise = Array.isArray(constants?.keywordPraise) ? constants.keywordPraise : []
  const blame = Array.isArray(constants?.keywordBlame) ? constants.keywordBlame : []
  let keywordPraise = 0
  let keywordBlame = 0
  for (const sentence of Array.isArray(sentences) ? sentences : []) {
    if (blame.some((word) => wordHits(sentence, word))) {
      keywordBlame += 1
      continue
    }
    if (praise.some((word) => wordHits(sentence, word))) keywordPraise += 1
  }
  return { keywordPraise, keywordBlame }
}

/**
 * 从 `mood.md` 里抠出那个 ```mood JSON 块并校验：两个衰减常数 + **三个活力常数**
 * （在场判据 / 离开半衰 / 满量程）+ **四档亲密刻度**（重逢量程 / 重逢顶 / 夸一步 / 骂一步）
 * + **正好 3 条**场景 + 区间合法。
 * 任何一处不合法 ⇒ `undefined` = **整块不认**：调用方只贴 style 段并出声（契约 §四）。
 * 🔴 「场景数必须正好 **3**」那一行校验必须和 `mood.md` 里的条数**同步**（口径 2）：
 *    改一边没改另一边 ⇒ 整块不认 ⇒ 情绪段整个不贴、只 `warnOnce` 一次然后永久闭嘴
 *    —— 那是一条**安静**的失效（探针 `I9` 直接抠源码里那个数字，所以这里只留一处）。
 * ⚠️ 关键词表 / `pitStep` / 四档刻度**可以缺**（缺 = `moodOf` 里写着的默认值，不加不减）：
 *    少一个键不该让**整个情绪段**消失。**给了但不合法**才按上面那条办：整块不认 + 出声。
 * ⚠️ `lines` 只把"空数组 / 不是字符串"当不合法 —— 2~3 句是**惯例**，
 *    多一句少一句不该让整块失效（那会把一个格式瑕疵放大成"情绪段整个消失"）。
 */
function moodConstants(markdown) {
  if (typeof markdown !== 'string') return undefined
  const hit = /```mood[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(markdown)
  if (hit === null) return undefined
  let parsed
  try {
    parsed = JSON.parse(hit[1])
  } catch {
    return undefined
  }
  const inRange = (value) =>
    Array.isArray(value) && value.length === 2
    && value.every((v) => typeof v === 'number' && Number.isFinite(v))
    && value[0] >= 0 && value[0] <= value[1] && value[1] <= 1
  const scenes = parsed?.scenes
  if (!Array.isArray(scenes) || scenes.length !== 3) return undefined
  for (const scene of scenes) {
    if (typeof scene?.id !== 'string') return undefined
    if (!Array.isArray(scene?.lines) || scene.lines.length === 0) return undefined
    if (!scene.lines.every((line) => typeof line === 'string' && line.length > 0)) return undefined
    const when = scene?.when
    if (when === null || typeof when !== 'object') return undefined
    for (const [dim, band] of Object.entries(when)) {
      if (!DIM_KEYS.has(dim) || !inRange(band)) return undefined
    }
  }
  const halfLife = parsed?.halfLifeMinutes
  if (typeof halfLife !== 'number' || !(halfLife > 0)) return undefined
  const decay = parsed?.roundDecay
  if (typeof decay !== 'number' || !(decay > 0) || decay > 1) return undefined
  // 三个新常数（口径 13）：缺了就没法算疲劳 ⇒ 同样整块不认。
  const presence = parsed?.presenceMinutes
  if (typeof presence !== 'number' || !(presence > 0)) return undefined
  const absence = parsed?.absenceHalfLifeMinutes
  if (typeof absence !== 'number' || !(absence > 0)) return undefined
  const fullScale = parsed?.fullScaleMinutes
  if (typeof fullScale !== 'number' || !(fullScale > 0)) return undefined
  // 四档刻度（口径 14）：**它们和上面那几条一样由这个块说了算** —— 写进白名单，
  // 改 `mood.md` 就换刻度、不用重启 harness（"块里给了以文件为准"这句话对它们也成立）。
  // ⚠️ **缺 = `moodOf` 里那个默认值**（不加不减，同 `pitStep` / 词表那条）；**给了就得是个刻度**：
  //    量程要正，另外三个是 0~1 那一档的分数，`blameStep` 带负号（骂是往下）。
  //    一个写歪的符号会让"夸涨 / 骂跌"整个反过来，而分数行长得一模一样 ⇒ 这种块不认，出声。
  const dial = (value) => typeof value === 'number' && Number.isFinite(value)
  const fraction = (value) => dial(value) && value >= 0 && value <= 1
  const scale = parsed?.reunionScaleMinutes
  if (scale !== undefined && !(dial(scale) && scale > 0)) return undefined
  const base = parsed?.reunionBase
  if (base !== undefined && !fraction(base)) return undefined
  const praise = parsed?.praiseStep
  if (praise !== undefined && !fraction(praise)) return undefined
  const blame = parsed?.blameStep
  if (blame !== undefined && !(dial(blame) && blame <= 0 && blame >= -1)) return undefined
  /** 关键词表：不是字符串数组就当空表（口径 9：它缺了不算整块不合法）。 */
  const wordList = (value) =>
    (Array.isArray(value) ? value.filter((word) => typeof word === 'string' && word.length > 0) : [])
  // 亲密基线（老板 2026-09-26 定）：0~1 的分数，**缺 = `moodOf` 里的 0.5**；
  // 给了但不是一个 0~1 的数 ⇒ 整块不认（同四档刻度那条规矩）。
  const closenessBase = parsed?.closenessBase
  if (closenessBase !== undefined && !fraction(closenessBase)) return undefined
  // 正反词表（老板 2026-09-26 定）：**贴出去的时候两侧的词都写**。
  // 形状 = 每个维度 `{ positive: [...], negative: [...] }`，两侧各至少要有一个词。
  // ⚠️ 某一维**没给** ⇒ 那一格退回"只写分数"（一个词表瑕疵不该把整个情绪段干掉）；
  //    **给了但形状不对 / 出现不认识的维度名**才按整块不认办（同关键词表那条）。
  const words = {}
  if (parsed?.words !== undefined) {
    const rawWords = parsed.words
    if (rawWords === null || typeof rawWords !== 'object' || Array.isArray(rawWords)) return undefined
    for (const [dim, pair] of Object.entries(rawWords)) {
      if (!DIM_KEYS.has(dim)) return undefined
      if (pair === null || typeof pair !== 'object' || Array.isArray(pair)) return undefined
      const positive = wordList(pair.positive)
      const negative = wordList(pair.negative)
      if (positive.length === 0 || negative.length === 0) return undefined
      words[dim] = { positive, negative }
    }
  }
  return {
    halfLifeMinutes: halfLife,
    roundDecay: decay,
    presenceMinutes: presence,
    absenceHalfLifeMinutes: absence,
    fullScaleMinutes: fullScale,
    pitStep: parsed?.pitStep,
    reunionScaleMinutes: scale,
    reunionBase: base,
    praiseStep: praise,
    blameStep: blame,
    closenessBase,
    words,
    keywordPraise: wordList(parsed?.keywordPraise),
    keywordBlame: wordList(parsed?.keywordBlame),
    scenes,
  }
}

// ─────────────────────────────────────────────────────────────
// 提候选那个工具（`proposal_file`）—— 一次调用 = 一条候选 + 一句出处。
//
// 为什么它住在注入器里：这个预设**自己注册工具**，不加 cordis 行（`tool-proposal-file` 那一行
// 不存在）。加行的代价是体检 `composition` 那一族要同批动两处（增量类白名单 + 常量），
// 而那两处是 `.tools/**` —— 组员动不了；而不加行，`apply()` 里 `register` 就够。
//
// 🔴 它**对所有角色都注册**（包括判决岗）：
//    判决岗「不能提候选」的落法是**调用时被拒**（`proposalVerdict()`，码
//    `E_GUARD_JUDGE_PROPOSAL`），**不是**"工具集里没有它"。`deny` 的唯一作者是
//    上面 `ROLE_TABLE` 判决岗那一条 —— 这个文件里**不许**再写第二处"判决岗不能提案"的判断。
// ─────────────────────────────────────────────────────────────

/**
 * 工具的实现模块：**按需**加载（`await import`，不是顶层 import）。
 *
 * 🔴 为什么：这份注入器一挂就是"人格注入 0 字符"（AGENTS.md §3d 那个形状）。那个模块依赖
 * `lib/` 那二十来份脑库；把它挂到顶层等于让**多一条工具**有机会拖垮每轮的人格注入。
 * ⇒ 真正 import 的时机是"这个工具**被执行**的那一下"；加载失败只让这一次调用失败，注入照旧。
 * （路径用 `new URL(..., import.meta.url)`：按这份文件自己算，不按调起进程的工作目录算。）
 */
let proposalFileModule = null
async function proposalFileToolModule() {
  if (proposalFileModule === null) {
    proposalFileModule = await import(new URL('./tools/proposal-file.mjs', import.meta.url).href)
  }
  return proposalFileModule
}

/**
 * `proposal_file` 的工具定义（`ctx.tools.register()` 吃的就是 `ToolDefinition`）。
 *
 * ⚠️ **为什么手写这个对象、不调 `defineTool`**：`defineTool` 住在 `@deepseek-ai/dsh-tools` 包里，
 * 而这份预设的装法是"拷一个文件夹"（`presets/agenia/` 下没有 node_modules）—— 顶层 import 它
 * 会在加载那一刻 `ERR_MODULE_NOT_FOUND`，那正好是上面说的"人格注入 0 字符"。
 * `register()` 真正消费的是**裸 JSON Schema**（`parameters` 与 `output.schema`），
 * 所以这里直接给 JSON Schema —— 形状就是 `defineTool` 编译出来的那一份。
 *
 * 🔴 `parameters.additionalProperties: true` 是刻意的：多给的字段要由**工具自己**拒
 *    （`E_PROPOSAL_SHAPE` 得点名那个键）。在框架那一层挡掉的话，报错就变成框架的话，
 *    而契约 §2.2 要的是"报文点名出问题的字段"。
 *
 * 🔴 `required` 也刻意不写：缺 `text` / 缺 `source` 要走工具的四个码（`E_PROPOSAL_SHAPE`），
 *    不是框架自己的参数校验。
 *
 * @param {string} brainRoot 脑根（`<内容根>/.runtime`）—— 候选池住在它下面
 *
 * 为什么导出：不导出就只能隔着整条 `apply()` 验它，而"`output.schema` 能不能被
 * `ctx.tools.register()` 吃下 / `execute` 端到端真的写出一行"这类事隔着装配验不了
 * （跟本文件那几个"必须导出的纯函数"同一条理由：退化成"读代码觉得对"）。
 * ⚠️ 真挂载（预设挂得起来、那一行没起不来）仍然只有 A7 能回答 —— 这一条不替代它。
 */
export function proposalFileDefinition(brainRoot) {
  return {
    name: PROPOSAL_FILE_TOOL,
    description:
      '提一条候选到共享候选池：一次调用 = 一条候选正文 + 一句出处。'
      + '正文与出处逐字入池（工具不改写一个字符；出处不许空，也不会替你补）。'
      + '同一个出处 + 同一段正文提第二次会被拒（E_PROPOSAL_DUPLICATE）；换了正文可以再提。'
      + '落盘是原子的（不需要命令行）。判决岗没有这个工具 —— 它只判别人提的。',
    parameters: {
      type: 'object',
      additionalProperties: true,
      properties: {
        text: { type: 'string', description: '候选正文（必填；strip 后不许为空；逐字入池，不 trim、不归一换行）' },
        source: { type: 'string', description: '这一句候选的出处（必填；strip 后不许为空；逐字入池）' },
        // ⚠️ **这里不写 `enum`**（与 `PROPOSAL_FILE_KINDS` 那份清单的关系说清楚）：
        //    四类"收不收"的**判据只有一处** —— `tools/proposal-file.mjs` 的 `PROPOSAL_FILE_KINDS`，
        //    而它本身是 `lib/memory.mjs` 的 `TYPE_IDS` 派生出来的（不是第五份字面量）。
        //    在这儿再写一份 `enum`，等于让框架的 schema 层成为**第二个执行者**：越界的报错就不再是
        //    `E_PROPOSAL_SHAPE` 点名 `kind` 了（而契约 §2.2 要的正是那个）。
        //    ⇒ 这一格只放**给模型看的散文**；写错了由工具按 `E_PROPOSAL_SHAPE` 拒并点名 `kind`。
        kind: {
          type: 'string',
          description: '哪一类：general（底层通用）/ boss（关于老板）/ machine（关于本机）/ project（关于某个项目）；缺省 general',
        },
        sha256: { type: 'string', description: '可选：声明哈希 = sha256(text, UTF-8)。给了就必须与工具算出来的那个相等（对账用）' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          proposal_id: { type: 'string', description: '候选 id = 池子里那一条的 imported_id' },
          entry_id: { type: 'string', description: '记忆条目 id（与 proposal_id 同一个号）' },
          pool_path: { type: 'string', description: '落到哪个文件' },
          seq: { type: 'integer', description: '池子编号：池内单调递增、清池后不回落、不是行号' },
          content_sha256: { type: 'string', description: '内容哈希 = sha256(stableStringify(payload))' },
          sha256: { type: 'string', description: '声明哈希 = sha256(text)' },
          source: { type: 'string' },
          kind: { type: 'string' },
          imported_at: { type: 'string' },
        },
      },
      // 回给模型的这句话里有一条**必须说清的口径之差**（评审 R4 量出来的，不是读代码猜的）：
      // 本工具允许"同源换文"再提（契约 A3），而命令行 `--op proposal-import` 那条路会拒 ——
      // 换文 ⇒ `E_ARG_HASH`（"已经用另一个哈希导入过"）；**同文**也要把这里回的 `entry_id`
      // 与正文一字不差照抄进它的 payload 才收（否则"声明与内容对不上"）。两条路的这项口径已开票 F-58。
      render: (_args, value) => [{
        type: 'text',
        text: `已追加候选 ${String(value?.proposal_id)}（池子编号 ${String(value?.seq)} · ${String(value?.kind)}）→ ${String(value?.pool_path)}\n`
          + '⚠️ 这条 source 之后**走不了命令行导入**（`--op proposal-import` 会回 E_ARG_HASH）：'
          + '换了正文一定拒；同文也要把这次的 entry_id 与正文一字不差照抄进它的 payload 才收 —— 两条路口径已开票 F-58。',
      }],
    },
    async execute(args) {
      const mod = await proposalFileToolModule()
      return mod.proposalFileRun(args, { root: brainRoot })
    },
  }
}

// ─────────────────────────────────────────────────────────────
// 提维护案那个工具（`maintenance_file`）—— 一次调用 = 一份草稿 + 一行入池。
//
// 为什么它住在这里、而不是组合里加一行：与 `proposal_file` **同一个理由**（那一族注释在上面）——
// 数据根（`<内容Dir>/.runtime`）只有注入器知道，组合文件那一层拿不到；`proposal_file` 也是这么落的
// （组合全文里 `proposal_file` 0 处）。加 cordis 行等于给同一件事上第二个载体。
//
// 🔴 它**对所有角色都注册**：这份预设的 `ROLE_TABLE` 每一条 `tools` 都是 `BASE_TOOL_SET` 的副本，
//    而名字进了 `COMMON_TOOLS` ⇒ 九条一起拿到（复核岗 `memory-review` 就是靠这一条拿到的）。
//    它没有"判决岗不许"的那一格：判决岗要判维护案，`proposal_file` 那条 deny 只管候选（`deny: ['proposal']`）。
// ─────────────────────────────────────────────────────────────

/**
 * 工具的实现模块：**按需**加载（`await import`，不是顶层 import）。
 * 理由与 `proposalFileToolModule` 逐字相同：那二十来份脑库不许挂到人格注入的顶层。
 */
let maintenanceFileModule = null
async function maintenanceFileToolModule() {
  if (maintenanceFileModule === null) {
    maintenanceFileModule = await import(new URL('./tools/maintenance-file.mjs', import.meta.url).href)
  }
  return maintenanceFileModule
}

/**
 * `maintenance_file` 的工具定义（`ctx.tools.register()` 吃的就是 `ToolDefinition`）。
 *
 * ⚠️ **手写这个对象、不调 `defineTool`**：与 `proposalFileDefinition` 同一条理由（预设是"拷一个文件夹"，
 * 没有 node_modules；`register()` 消费的是裸 JSON Schema）。
 *
 * 🔴 `parameters.additionalProperties: true` + 不写 `required` 是刻意的：形状由**工具自己**拒并点名
 * （`E_MAINTENANCE_SHAPE` 要能指出是 `target_original_text` 还是 `proposed_op`）。在框架那一层挡掉，
 * 报错就变成框架的话，契约 §2 要的"报文点名那一项"就没了。
 *
 * @param {string} dataRoot 数据根（`<内容根>/.runtime`）—— 草稿与候选池都住在它下面
 *
 * 为什么导出：不导出就只能隔着整条 `apply()` 验它，而"`output.schema` 能不能被 `ctx.tools.register()`
 * 吃下"这类事隔着装配验不了（与 `proposalFileDefinition` 同一条理由）。
 */
export function maintenanceFileDefinition(dataRoot) {
  return {
    name: MAINTENANCE_FILE_TOOL,
    description:
      '提一份维护案到共享数据根：一次调用 = 一份草稿文件 + 候选池里一行（kind: maintenance）。'
      + '草稿住 <数据根>/state/maintenance-drafts/<日>/<草案 id>，**不落在你当前的工作区**；'
      + '入池之后下一轮的 claim / 冻结池直接看得见它。'
      + '形参 draft 必填：proposed_op（add / modify / retire / cull / merge / retag）、target_entry_id（必须在当前快照里）、'
      + 'target_original_text（目标原文全文，逐字）、reason；可选 product_text、source_entry_ids。'
      + '同一段内容提第二次会被拒（E_MAINTENANCE_DUPLICATE）；草稿 id 由工具发，不许自报。',
    parameters: {
      type: 'object',
      additionalProperties: true,
      properties: {
        // ⚠️ 这一格只放**给模型看的散文**：收不收的判据只有一处 —— `tools/maintenance-file.mjs` 的
        //    `maintenanceFileVerdict`（op 的六个值来自引擎的 switch）。在这里写 `enum` / `required`
        //    会让框架的 schema 层成为**第二个执行者**：越界的报错就不再是 `E_MAINTENANCE_SHAPE` 点名那一项了。
        draft: {
          type: 'object',
          additionalProperties: true,
          description: '维护案对象（必填）：proposed_op / target_entry_id / target_original_text / reason，'
            + '可选 product_text / source_entry_ids；多给别的字段会被拒（报文点名那几个键）',
          properties: {
            proposed_op: { type: 'string', description: '六个引擎 op 之一：add / modify / retire / cull / merge / retag' },
            target_entry_id: { type: 'string', description: '目标条目的 id（必须在当前快照的 entries 里）' },
            target_original_text: { type: 'string', description: '目标条目的原文全文（逐字，不 trim）—— 只写 id / 摘要会被拒' },
            reason: { type: 'string', description: '为什么该这么处置（判决那一关要读它）' },
            product_text: { type: 'string', description: '可选：处置之后这一条的新正文' },
            source_entry_ids: { type: 'array', items: { type: 'string' }, description: '可选：这一份案引用了哪几条条目' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          draft_id: { type: 'string', description: '草案 id（工具发：MR-<YYYYMMDD>-<seq:04>）' },
          path: { type: 'string', description: '草稿文件落在哪（数据根下的绝对路径）' },
          pool_seq: { type: 'integer', description: '池子编号：池内单调递增、清池后不回落、不是行号' },
          content_sha256: { type: 'string', description: '内容哈希 = sha256(stableStringify(draft))' },
          day: { type: 'string' },
          base_snapshot: { type: 'string', description: '落盘那一刻的当前快照版本' },
          pool_path: { type: 'string', description: '候选池文件' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `已提维护案 ${String(value?.draft_id)}（池子编号 ${String(value?.pool_seq)} · kind: maintenance）\n`
          + `草稿：${String(value?.path)}\n池子：${String(value?.pool_path)}\n`
          + '⚠️ 入池**不是受理**：裁不裁归次日判决；下一轮的 claim / 冻结池已经能看见这一条。',
      }],
    },
    async execute(args) {
      const mod = await maintenanceFileToolModule()
      // 入参是 `{ draft }`（定形 §二）；draft 是**第一个位置参数**（契约 §1 的冻结签名）。
      // 少了 draft 这一层 ⇒ 工具自己按 `E_MAINTENANCE_SHAPE` 拒并说清"draft 必须是一个对象"（不静默兜底）。
      const draft = args === null || typeof args !== 'object' ? undefined : args.draft
      return mod.maintenanceFileRun(draft, { root: dataRoot })
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 记忆轮转的**一轮**（游标文件 + `lib/memory-rotation.mjs` 的纯逻辑）
//
// 为什么这一段住在 `apply()` 外面：这一节那三条行为原先全在 `apply()` 的闭包里，
// 只有 `agent/pre-step` 那一条路走得到 —— 判据一格都驱动不了（"读着对"不是证据）：
//   · F3 配比 `min(PROJECT_SLOTS, max(1, 池长-1))`（在 `lib/memory-rotation.mjs`，本来就是纯函数）；
//   · F4 **只有 `block.note === 'ok'` 才写游标**（`empty-pool` / `snapshot-unavailable` 一律不写）；
//   · F5 **换快照版本 ⇒ 游标从 0 重来**（旧序号在新库里没有意义）。
// 把"一轮"收成这里：输入是值（数据根 / 项目名 / 上游读好的快照），输出是正文 + 游标的下落
// （`cursor_written` / `reset` / 盘上那份文件）。判据喂一个临时数据根就能量这三条。
//
// ⚠️ `rotation` 由调用方**传进来**：这个文件没有一条顶层 import 脑库（`lib/` 坏了会连人格一起死，
//    见上面 `── 共享记忆库 ──` 那一段的成文理由）。调用方那边是懒加载的 `loadRotationModule()`。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 跑一轮记忆轮转：读游标 → 组块 → 按闸决定要不要把新游标写回。
 *
 * @param {object} input
 * @param {string} input.root 数据根（游标文件在它下面的 `CURSOR_REL`）
 * @param {string} input.project 项目名（工作区目录名；由调用方按会话 cwd 算）
 * @param {{version:string, entries:object[]}|undefined|null} input.snapshot 上游读好的快照
 *   （`currentSnapshotOf` 的返回值；`undefined` = 读不到 ⇒ 这一轮不贴条目、不写游标）
 * @param {object} input.rotation `lib/memory-rotation.mjs` 的模块对象（`rotationBlockOf` / `CURSOR_REL`）
 * @param {(key:string, message:string)=>void} [input.say] 出声（同一个问题只喊一次的那个）
 * @returns {{text:string, note:string, reset:boolean, cursor_file:string, cursor_written:boolean, cursor:object|null}}
 */
export function memoryRotationRoundOf({ root, project, snapshot, rotation, say } = {}) {
  const sayIt = typeof say === 'function' ? say : () => {}
  const file = join(String(root ?? ''), ...rotation.CURSOR_REL)
  let raw = null
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    // 没有游标文件是**正常态**（第一轮）：不吭声，从 0 开始。读不动 / 坏 JSON 才出声。
    if (error?.code !== 'ENOENT') {
      sayIt('rotation-cursor', `[agenia] 记忆轮转的游标读不出来（${file}）—— 这一轮从 0 开始。`)
    }
  }
  // 🔴 F5（技术评审 2026-11-09）：**换快照版本 ⇒ 游标从 0 重来并出声**。
  //    原来 `snapshot` 只写不读 ⇒ 库里条数一变，游标还停在旧序号上（可能已越过新库的长度）。
  const snapNow = typeof snapshot?.version === 'string' ? snapshot.version : null
  const snapWas = typeof raw?.snapshot === 'string' ? raw.snapshot : null
  const reset = snapWas !== null && snapNow !== null && snapWas !== snapNow
  if (reset) {
    sayIt('rotation-snapshot-changed', `[agenia] 共享记忆换版（${snapWas} → ${snapNow}）`
      + ' ⇒ 记忆轮转的游标从 0 重来（旧的序号在新库里没有意义）。')
  }
  let cursorGeneral = 0
  let cursorProject = 0
  if (!reset) {
    if (Number.isInteger(raw?.cursor_general) && raw.cursor_general >= 0) cursorGeneral = raw.cursor_general
    else if (Number.isInteger(raw?.cursor) && raw.cursor >= 0) cursorGeneral = raw.cursor
    if (Number.isInteger(raw?.cursor_project) && raw.cursor_project >= 0) cursorProject = raw.cursor_project
  }
  const block = rotation.rotationBlockOf({ snapshot, project, cursorGeneral, cursorProject })
  // 🔴 F4（第 4 关打回）：判据是 `note === 'ok'`，**不是**"快照读得到"。
  //    两个反例：`snapshot-unavailable`（读不到）写游标会把"读不到"记成"转完了"；
  //    `empty-pool`（挑不到条目）返回的对象里**根本没有**游标键 ⇒ `undefined !== cursor` 成立 ⇒
  //    从前照样写出一个不含游标键的文件，下一轮静默回到第 0 条。
  //    只有真挑到条目（`note === 'ok'`）才写 —— 而且游标没动就不重写（不制造无意义的 mtime）。
  const moved = block.nextCursorGeneral !== cursorGeneral || block.nextCursorProject !== cursorProject
  let cursor = null
  let written = false
  if (block.note === 'ok' && moved) {
    cursor = { cursor_general: block.nextCursorGeneral, cursor_project: block.nextCursorProject, snapshot: snapNow, updated_at: new Date().toISOString() }
    try {
      mkdirSync(dirname(file), { recursive: true })
      const tmp = `${file}.tmp-${process.pid}`
      writeFileSync(tmp, `${JSON.stringify(cursor, null, 1)}\n`, 'utf8')
      renameSync(tmp, file)
      written = true
    } catch (error) {
      sayIt('rotation-cursor-write', `[agenia] 记忆轮转的游标写不回去（${String(error?.message ?? error)}）—— 下一轮可能重贴同一批。`)
    }
  }
  if (block.note !== 'ok') {
    sayIt(`rotation-${block.note}`, `[agenia] 记忆轮转这一轮「${block.note}」—— 块里写明了，别读成"没有记忆"。`)
  }
  return { text: block.text, note: block.note, reset, cursor_file: file, cursor_written: written, cursor }
}

/**
 * @param ctx - 这个 preset 的作用域。
 * @param config - agent.cordis.yml 里那一行的 config 段。
 */
export async function apply(ctx, config = {}) {
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt === undefined) {
    console.error('[agenia] 拿不到提示词服务，什么都没注入')
    return
  }

  const contentDir = contentRoot(ctx, config)
  const leaderOrder = Array.isArray(config.leaderOrder) ? config.leaderOrder : DEFAULT_LEADER_ORDER
  const memberOrder = Array.isArray(config.memberOrder) ? config.memberOrder : DEFAULT_MEMBER_ORDER
  const officeBound = new Set(
    Array.isArray(config.officeBound) ? config.officeBound : DEFAULT_OFFICE_BOUND,
  )
  /**
   * 这一份预设自己声明的档（`leader` / `member`）。**只是冗余校验值**：
   * 合法 ⇒ 一条报警都没有；缺 / 非法 ⇒ 出声，但**不改档、不剥角色**（定形 §2.2）。
   * ⚠️ 它**不是**身份的来源 —— 档由会话头的 `agentPreset` 认（`presetKindOf`），
   *    角色只由 `toolName` 认（`ROLE_TABLE`）。
   */
  const declaredTier = typeof config.defaultRole === 'string' ? config.defaultRole : null
  if (declaredTier !== null && !TIERS.includes(declaredTier)) {
    console.error(
      `[agenia] config 里的 defaultRole=${JSON.stringify(declaredTier)} 不是合法档（${TIERS.join(' / ')}）—— `
        + '只报警，不改档、不剥角色。',
    )
  }

  // 委派名单（裁定 A4）：从 config 算一遍，门禁与"配置坏了"的出声都用它。
  // 配置坏了**不抛** —— 队伍照常挂载，但门禁降级成 A13 那条窄形状，而且这里必须出声：
  // 悄悄失效比明着失败更糟（评审会以为自己被门禁挡着，其实没有）。
  const delegation = delegationPolicy(config)
  if (delegation.configError !== null) {
    console.error(
      `[agenia] config 里的 ${DELEGATION_TOOLS_KEY} 缺失或非法（${delegation.configError}）—— `
        + '四个一次性作业的后台硬门拿不到名单；错误态下只拦委派类工具'
        + '（subagent / team_* / job_memory_* / job_conversation_* / job_technical_*），'
        + 'job_output / job_kill / job_list 照常放行（配置坏了也要能把作业结果收回来）。',
    )
  }

  // ─────────────────────────────────────────────────────────────
  // 配置自检。
  // 这一份文件是在**用户的机器上**跑的，那边没有体检脚本 —— 配置拼错的时候，
  // 唯一能出声的就是这里。查到的都只 console.error，**绝不抛错**：
  // 一个拼错的键不该让整支队伍挂载不上（"读不到就什么都不注入、不进装配"
  // 是这份文件一贯的失败策略），但也**不许悄悄放过**。
  //
  // 为什么不 export Config 交给框架校验：那要 import 一个 schema 库，而这份预设的
  // 装法是"拷一个文件夹"，用户机器上没有 node_modules —— 为了查错把安装搞坏不值。
  // ─────────────────────────────────────────────────────────────
  // ⚠️ 新加的 config 键必须**同批**进这张白名单，否则每次挂载都会误报"不认识的配置键"
  //    （2026-10-15 批次 I2 加 `delegationTools` 时就是这么加进来的）。
  // 🔴 2026-11-01（并员）：`proposalFile` **退出**这张表 —— 那个键的语义是"这份预设不注册
  //    提候选工具"，并员之后那个工具对所有角色都注册（判决岗靠调用时拒，不靠"没有这个工具"）。
  //    预设里再写它 ⇒ 这里报"不认识的配置键"，那正是要的读数。
  const KNOWN_CONFIG = ['leaderOrder', 'memberOrder', 'officeBound', 'contentDir', 'defaultRole', DELEGATION_TOOLS_KEY]
  /**
   * 这几个 key **不是"内容根这一层的一个 .md"**，所以下面那条"文件在不在"的检查要跳过它们：
   *   · `roster` / `board` —— 算出来的正文；
   *   · `charter` —— 组员那一份在 `team/` 下；
   *   · `memory` —— 从**共享记忆库**读的（`.runtime/`，见上面 `── 共享记忆库 ──` 那一段）。
   *     ⚠️ 它读不到时**由注入那一步出声**（`sharedMemoryText`），
   *     不在这里报"找不到 memory.md"——那是个假问题，会把真问题淹掉。
   */
  const NON_FILE_KEYS = ['roster', 'board', 'charter', MEMORY_KEY]

  async function selfCheck() {
    const problems = []

    for (const key of Object.keys(config)) {
      if (!KNOWN_CONFIG.includes(key)) {
        problems.push(`不认识的配置键「${key}」—— 是不是拼错了？这一项不会生效。`)
      }
    }

    const roles = await roleNames(contentDir)
    for (const [key, order] of [['leaderOrder', leaderOrder], ['memberOrder', memberOrder]]) {
      for (const entry of order) {
        // 组员那一侧：**只给组长的那几项**落进来 ⇒ 出声（`LEADER_ONLY_KEYS`）。
        // 🔴 这一条钉的是**安全边界**，不是"名单变没变"：`memberOrder` 管的是
        //    「组员能拿到什么输入」，往里面加一项本来就该**有意识地**决定组员该不该拿。
        //    改之前**只有 `roster`/`board` 挡着**：`me-aqua.md` 那份文件是存在的 ⇒
        //    下面"文件在不在"那条检查照样过 ⇒ **组员会静默拿到"老板这个人"**
        //    （称呼 / 作息 / 脾气 / 习惯 / 知识边界全在里面）。2026-10-16 测试岗读代码报的正是这一格。
        // ⚠️ **别把它改成"memberOrder 只许有这几个 key"那种名字白名单** ——
        //    那个形状的后果是"每加一项就常驻红"，红的是判据不是被测对象（今天那条族级判据治的就是它）。
        //    按类判：新 key 只要解析得开（有 .md 或算得出来）就照常通过。
        if (key === 'memberOrder') {
          const banned = LEADER_ONLY_KEYS.find(([name]) => name === entry)
          if (banned !== undefined) {
            problems.push(`memberOrder 里的「${entry}」不该给组员 —— ${banned[1]}，组员不该拿到它。`)
            continue
          }
        }
        if (NON_FILE_KEYS.includes(entry)) {
          if (entry === 'charter' && key === 'leaderOrder') {
            problems.push('leaderOrder 里的「charter」不生效 —— charter 是组员自己那份说明书，组长没有。')
          }
          continue
        }
        const text = typeof entry === 'string'
          ? await readText(join(contentDir, `${entry}.md`))
          : undefined
        if (text === undefined) {
          problems.push(
            `${key} 里的「${String(entry)}」找不到对应文件（${String(entry)}.md 不存在或者是空的）—— 这一份不会被注入。`,
          )
        }
      }
    }

    for (const role of officeBound) {
      if (!roles.includes(role)) {
        problems.push(
          `officeBound 里的「${role}」不是队伍里的岗位（team/ 下没有 ${role}.md）—— 这条限制永远不会生效。`,
        )
      }
    }

    if (problems.length > 0) {
      console.error(
        `[agenia] 配置里有 ${problems.length} 处问题，下面这些项不会按你想的那样生效：\n`
          + problems.map((line) => `  - ${line}`).join('\n'),
      )
    }
  }

  selfCheck().catch((error) => {
    console.error(`[agenia] 配置自检自己出错了（不影响使用）：${String(error)}`)
  })

  // ─────────────────────────────────────────────────────────────
  // ③ / ④ / ⑤ 都要知道"这个 agent 是哪个岗位"，这三张表就是它们之间的桥。
  // 表在装配时登记（那里才知道身份），门禁、台账、尾巴提醒按编号来查。
  //
  // 🔴 2026-11-01（并员）：**"是不是组员" / "是哪个角色" / "窄不窄" 分成三张表** ——
  //    组员预设只有一份、`toolName` 又到不了子会话（A0a）⇒ 一个组员会话可以
  //    **是组员但没有角色**。并成一张表时，"查不到角色"会被读成"不是组员"，
  //    于是组员拿到组长那套注入与尾巴 —— 那正是最危险的那种错。
  //    `narrowSessions` 也不许并进 `roleOfAgent`：row 6 是"有角色 + 窄"，row 5/7 是"无角色 + 窄"，
  //    窄这件事与角色有无**正交**。
  // ─────────────────────────────────────────────────────────────
  /** agent id → 角色（只放**认得出**的角色 —— 唯一来源是 `identityVerdict()` 的 `role`）。 */
  const roleOfAgent = new Map()
  /**
   * agent id 集合：这次开口的走**组员侧**（row 0 / 0.5 / 1·2 / 4–7 —— 即**不是 row 3**）。
   * ⚠️ 2026-11-01 第二轮评审 N-3：这张表原来是 row 4/5/6/7。现在与"注入哪一侧"同一个谓词
   *    （`isMemberSide = row !== 3`）—— ⑤ 的语气提醒也按它整条丢，否则 row 0.5 的旧会话
   *    照样会拿到组长的 `style.md` 尾巴。
   */
  const memberSessions = new Set()
  /** agent id 集合：**窄权限**（row 5/6/7）。门禁按这一张判 `NARROW_PERMISSION`。 */
  const narrowSessions = new Set()
  /** 身份那几条报警 / 会话只喊一次。 */
  const warnedIdentity = new Set()
  /** 「未受管 · 认不出」那一行：一个会话只喊一次。 */
  const warnedUnattributable = new Set()
  /**
   * A0a 的一次性读数：**按名字来源各打一次**（`toolName_source` = `header` / `parent-call` / `none`）
   * —— 不是"第一个组员会话"那一次。
   * 为什么按来源拆（2026-11-01 第二轮评审 N-8）：手动开的组员会话也会走到这里、而且没有工具名，
   * 它会把唯一那一格吃掉，让真正的派工子会话一声不响。
   * ⚠️ 注入器是**按预设挂一次、被选同一份预设的会话共享**（`dsh-agent-preset-registry`：
   *    "Runtime plugin trees shared by Agents selecting one preset revision"）——
   *    所以组员预设那一份实例最多打三行（三种来源各一行）；不是"每个会话都刷一行"，
   *    也不是"整个进程只一行"。
   */
  const identityProbes = new Set()

  /**
   * 升级日那一刻的 session-id 快照（`{ upgrade_at, session_ids[] }`）—— 读一次、记一辈子。
   *
   * 读不到 / 解析不了 ⇒ `null` ⇒ `isLegacySession()` 判 `false` ⇒ 旧会话走 row 6/7（窄）。
   * 方向是刻意的（`CONTRACT-A` §13.3）：判 `false` 把人放进窄，判 `true` 放人进"不窄"。
   * ⚠️ 文件由**升级那一天**写（`<内容根>/.runtime/legacy-sessions.json`）；没有它只是
   *    "这一台还没有升级快照"，不是错误 —— 所以缺文件不出声，只有**坏了**才出声。
   */
  const legacySnapshot = (() => {
    let pending = null
    return () => {
      if (pending === null) {
        const file = join(contentDir, RUNTIME_DIR, LEGACY_SNAPSHOT_FILE)
        pending = readText(file).then((text) => {
          if (text === undefined) return null
          try {
            return JSON.parse(text)
          } catch (err) {
            console.error(
              `[agenia] 升级快照 ${file} 解析不了（${String(err?.message ?? err)}）—— `
                + '旧会话判定一律 false，它们走窄权限（安全方向）。',
            )
            return null
          }
        })
      }
      return pending
    }
  })()

  // ─────────────────────────────────────────────────────────────
  // ④ 进度提醒。
  // 一本账，按"一票活"记：组长开口算新的一票，账清零。
  // 只记"叫过没有"，不判断"干得够不够" —— 它是提醒，不是门禁。
  //
  // 两条判据是有来历的，别顺手改回去（2026-09-20 修）：
  //   * **只有成功的调用才算数。** `tools/result` 对每一个"执行过"的调用都发，
  //     包括被门禁拒绝的和自己报错的（拒绝也会被物化成一条 isError 的结果）。
  //     不滤掉的话：被挡下的那次写入照样算"文件动过"，一次报错的测试照样
  //     把"还没叫过测试"的警告擦掉。
  //   * **写 .team/ 不算项目文件动了。** 队里的本子（日志、任务卡、报告）每轮都在写，
  //     拿它当"代码动过"，板子就天天喊狼来了。
  // ─────────────────────────────────────────────────────────────
  const ledgers = new Map()

  function taskKey(agent) {
    const header = agent === null || agent === undefined ? undefined : agent.session?.header
    const parent = header === null || header === undefined ? undefined : header.parentSession
    if (typeof parent === 'string') return parent
    const id = agent === null || agent === undefined ? undefined : agent.id
    return typeof id === 'string' ? id : undefined
  }

  function ledgerFor(key) {
    if (typeof key !== 'string') return undefined
    let entry = ledgers.get(key)
    if (entry === undefined) {
      entry = { counts: new Map(), afterTest: 0, afterReview: 0 }
      ledgers.set(key, entry)
    }
    return entry
  }

  /** 这个工具名是队伍里哪个岗位？不是队伍的工具就返回 undefined。 */
  function teamRoleOf(toolName) {
    if (typeof toolName !== 'string') return undefined
    const hit = TEAM_TOOL.exec(toolName)
    return hit === null ? undefined : hit[1]
  }

  function boardOf(key) {
    const ledger = typeof key === 'string' ? ledgers.get(key) : undefined
    if (ledger === undefined || ledger.counts.size === 0) return undefined
    const called = (role) => (ledger.counts.get(role) ?? 0) > 0

    // 固定岗位按次序全列出来（哪怕这一次是 0）；名单外的岗位只列有人叫过的，排在后面。
    // 加岗位时**不用动这里** —— 新岗位只要工具名照约定写，就自动出现在板子上。
    const extra = [...ledger.counts.keys()].filter((role) => !BOARD_ORDER.includes(role)).sort()
    const head = [...BOARD_ORDER, ...extra]
      .filter((role) => BOARD_ORDER.includes(role) || called(role))
      .map((role) => `${BOARD_LABELS[role] ?? role} ${ledger.counts.get(role) ?? 0}`)
      .join(' · ')

    const lines = [`【这一票的进度】${head}`]
    const warning = boardWarningOf(ledger)
    if (warning !== '') lines.push(warning)
    // 评审这一行只说**新改动没人看过**，不作废那轮评审：评审的有效性量在"派工时那个提交的只读副本"上
    // （`CONTRACT.md` §14.0），活树在窗口里被别的岗位写是常态。`afterReview` 只数"最后一次 `team_review`
    // 之后项目文件还动过几次"，它既不知道也没问过那轮评审读的是哪个提交 ⇒ 它没有资格说"作废 / 要重审"。
    // 要覆盖这些新改动，动作是"在**现在的提交**上另派一轮"，不是"重审上一轮"。
    if (called('review') && ledger.afterReview > 0) {
      lines.push(`⚠️ 最后一次评审之后，项目文件又动过 ${ledger.afterReview} 次 —— 有新改动，还没被评审过；那轮评审量的是派工时那个提交的副本，不因这些变动作废。要评新改动，就在现在的提交上另派一轮。`)
    }
    return lines.join('\n')
  }

  /**
   * 板子那条告警**选哪一句** —— 纯函数：只读账本（`{ counts, afterTest }`），不读盘、不建会话。
   *
   * 三种现场、三句互斥的话（`CONTRACT.md` §3.3）：
   *   ① 测试计数 **0** ⇒ 板子**永远**不说「最后一次测试之后」/「那次测试作废」—— 那次测试没发生过：
   *      · 动过项目文件 ⇒ 说"文件改过 + 一次测试都没叫过"（**叫没叫过开发都一样**）；
   *      · 没动过文件、叫过开发 ⇒ 说"叫过开发，还没叫过测试"。
   *   ② 叫过测试、之后又动过（`afterTest > 0`）⇒ 说"最后一次测试之后…那次测试作废，要重测"。
   * 其余情况不告警（返回空串）。`afterTest` 的计数口径不在这里（在 `tools/result` 那个监听器里）。
   */
  function boardWarningOf(ledger) {
    const called = (role) => (ledger.counts.get(role) ?? 0) > 0
    if (!called('test')) {
      if (ledger.afterTest > 0) {
        return '⚠️ 改过项目文件，但一次测试都没叫过 —— 没人验过这些改动。'
      }
      if (called('dev')) return '⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。'
      return ''
    }
    if (ledger.afterTest > 0) {
      return `⚠️ 最后一次测试之后，项目文件又动过 ${ledger.afterTest} 次 —— 那次测试作废，要重测。`
    }
    return ''
  }

  ctx.on('tools/result', (call, result) => {
    if (call === null || call === undefined) return
    // 没成功的不算 —— 拒绝和报错都会走到这儿，它们不该在账本上留下痕迹。
    if (result !== null && result !== undefined && result.isError === true) return
    const ledger = ledgerFor(taskKey(call.agent))
    if (ledger === undefined) return

    // 起人也算"叫了人"：`team_*` 按工具名认，裸 `subagent` 算外聘（见 HIRE_TOOL 那段说明）。
    const role = teamRoleOf(call.name) ?? (call.name === HIRE_TOOL ? HIRE_ROLE : undefined)
    if (role !== undefined) {
      ledger.counts.set(role, (ledger.counts.get(role) ?? 0) + 1)
      // 验收那两关是闸门：它们一过，之前动过的项目文件就不作数了。
      if (role === 'test') ledger.afterTest = 0
      if (role === 'review') ledger.afterReview = 0
      return
    }

    const where = WRITE_TARGET[call.name]
    if (where === undefined) return
    const target = call.arguments === null || typeof call.arguments !== 'object'
      ? undefined
      : call.arguments[where]
    // 落在 .team/ 里的写入是队里的本子，不是项目文件动了。
    if (officeLandingVerdict(target, call.agent).allow) return
    ledger.afterTest += 1
    ledger.afterReview += 1
  })

  // ④ 进度提醒的第一半在下面那个 `tools/result` 里；第二半（老板开口 ⇒ 账清零）
  // 排在文件最后 —— 为什么必须排在 ⑤ 后面，那儿写着。

  // ─────────────────────────────────────────────────────────────
  // ③ 岗位边界 + 后台硬门 + 窄权限 + 角色工具集 + 判决岗的提案拒。
  //   **同一道门禁里五条判定，次序是定的：**
  //   ① 后台硬门（`subagentBackgroundVerdict`）先判 —— 它对**所有角色**都生效；
  //   ② 窄权限（`narrowVerdict`）第二判 —— row 5/6/7 的三格闭集（白名单 / 写范围 / 提案拒）；
  //   ③ 角色工具集（`roleToolVerdict`）第三判 —— `ROLE_TABLE[role].tools` 的运行时执行者
  //      （`review` 的"没有命令行"就住在这里，不再由 `officeBound` 那一条单独说一遍）；
  //   ④ 判决岗的提案拒（`proposalVerdict`）—— 拒的只是"提案"这一个工具，不是这个人；
  //   ⑤ 岗位写边界（`officeBoundVerdict`）最后判 —— 认不出岗位的一律放行（它的写边界仍在）。
  //   ⚠️ **次序别倒过来**：受限岗位若先被岗位判定放行/拒绝，就轮不到后台硬门了，
  //      而 GRD-01 要的正是"门禁覆盖所有角色"。（真正的语义证明只能靠 R1 真挂载，
  //      这里这条只是文件序代理 —— 追加裁定 v1.1 · A15。）
  //   ⚠️ 窄与角色两条都依赖"装配时登记的这份会话的身份"（`narrowSessions` / `roleOfAgent`）；
  //      还没装配过的会话查不到 ⇒ 按老规矩放行（模型不先被装配一次也叫不出工具）。
  // ─────────────────────────────────────────────────────────────
  // 🔴 每日评审闸（第 ⑥ 条）要的"今天是哪天"只有一处算法：`lib/route.mjs::dayKeyOf`。
  //   门禁回调**必须同步**（框架契约），所以装配时先 `await` 取一次那个函数（与身份报警共用
  //   同一个缓存）。框架按 `fiber.await()` 等这个 `apply()` 落地才算加载完 ⇒ 门禁装好那一刻
  //   值已经在手上。取不到**绝不抛** —— 那份文件一挂就是"人格注入 0 字符"；这处只记原因，
  //   闸自己在拒绝报文里点名它（`E_REVIEW_DAY_UNKNOWN`），不拿"今天"猜。
  try {
    await sharedDayKeyOfFn()
  } catch (err) {
    sharedDayKeyError = String(err?.message ?? err).slice(0, 240)
  }
  const tools = ctx.get('tools')
  if (tools !== undefined && typeof tools.guard === 'function') {
    ctx.effect(
      () =>
        tools.guard((call) => {
          const toolName = call === null || call === undefined ? undefined : call.name
          const args = call === null || call === undefined ? undefined : call.arguments
          const who = call === null || call === undefined ? undefined : call.agent

          const background = subagentBackgroundVerdict(toolName, args, delegation)
          if (background !== null) return background.message

          const id = who === null || who === undefined ? undefined : who.id
          // 窄权限：row 5/6/7。三格逐条来自 `NARROW_PERMISSION`（唯一作者）。
          if (typeof id === 'string' && narrowSessions.has(id)) {
            const narrow = narrowVerdict(toolName, args, who)
            if (narrow !== null) return `${narrow.code}：${narrow.message}`
          }
          const role = typeof id === 'string' ? roleOfAgent.get(id) : undefined
          // 角色工具集：`ROLE_TABLE[role].tools`（`review` 的 shell 就在这一格被拒）。
          const roleTool = roleToolVerdict(role, toolName)
          if (roleTool !== null) return `${roleTool.code}：${roleTool.message}`
          // 判决岗「提案调用被拒」：注册与拒同源（`ROLE_TABLE` 那一条的 `deny`）。
          const proposal = proposalVerdict(role, toolName)
          if (proposal !== null) return `${proposal.code}：${proposal.message}`
          const officeReadings = {}
          const office = officeBoundVerdict(role, toolName, args, who, officeBound, officeReadings)
          // 被拒的写**不落账**：账记的是"这道门放行了"，拒的理由在下面那句报文里。
          if (office !== null) return office.message
          // 🔴 放行之后必须**在盘上留一行**（`bug-20261107-10` · batch 15）：
          //    每一次被放行的 `write` / `edit`，只要落点在某一棵树的 `.team/` 里（`office_root` 非 null），
          //    就往**写方那棵树**（`header_office`）的账上追加一行 —— 同树也留（那一行是
          //    `tree_differs:false`），异树更留（两个 office 都写着）。
          //    次序是定的：① 追加 → ② 追加失败 ⇒ **拒这次写**（fail-closed）→ ③ 异树出声。
          //    ⚠️ 这一行必须与刚追加的那一行**同源**：下面那句 `OFFICE_TREE_DIFFERS` 用的是同一个
          //       `landing` 对象，不是另算一遍 readings。
          //    ⚠️ `office_root` 只在**受限岗位**的 write/edit 上被填（名单外岗位在
          //       `officeBoundVerdict` 第一行就早退了，那一半仍然不留痕 —— 见契约 §5.2）。
          if (typeof officeReadings.office_root === 'string' && officeReadings.office_root !== '') {
            const landing = {
              at: new Date().toISOString(),
              role: String(role),
              tool: toolName,
              landing: String(officeReadings.landing),
              office_root: officeReadings.office_root,
              header_office: String(officeReadings.header_office),
              // 一条规则一个实现：`officeLandingVerdict` 已经算过同一件事（`OFB-0x` 钉的就是那个字段）。
              tree_differs: officeReadings.differs === true,
            }
            const written = recordOfficeLanding(officeReadings.header_office, landing)
            if (written.ok !== true) {
              // 账这一关没过去 ⇒ **拒绝这次写**（fail-closed）。两个面分开报，别把查的人支去错的地方：
              //   · 行不成形状 = 实现自己拼错了这一行（盘可能一点事都没有）；`E_OFFICE_LEDGER_SHAPE`
              //   · 盘写不进去 = 权限 / 盘满 / 路径被占着；`E_OFFICE_LEDGER_UNWRITABLE`
              // 静默放行会让"写错树"永远查不到，所以两个面都拒。
              const why = written.code === OFFICE_LEDGER_SHAPE
                ? `这次放行的账行**形状不合**（${String(written.reason)}）—— 是实现自己拼错了行，盘没坏`
                : '账写不进去'
              console.error(`[agenia] E_GUARD_OFFICE_LEDGER：${why}，这次写被拒 —— `
                + `账本「${String(written.path)}」原因：${String(written.reason)}`
                + '（定形 batch 15 §二.4：账这一关没过不许静默放行）。')
              return `E_GUARD_OFFICE_LEDGER：${why}，这次写被拒。账本「${String(written.path)}」原因：${String(written.reason)}`
            }
            // 🔴 2026-11-07（`ticket-20261102-02`）：**放行但写错了树** 必须出声。
            //    典型形状：会话头 cwd 在 A 树、落点却在 B 树的 `.team/` 里，而这一轮真正干活的是 A 树。
            //    判词是放行（它确实落在某个 `.team/` 里），但这一行必须留下两个 office 路径 —— 不许悄悄发生。
            //    本批起它由**账上刚追加的那一行**驱动（`landing.tree_differs`），不再从内存 readings 猜。
            if (landing.tree_differs === true) {
              console.error(`[agenia] OFFICE_TREE_DIFFERS：这次写的树与会话头不是同一棵`
                + `（落点「${landing.landing}」· 那棵树的 office「${landing.office_root}」`
                + `· 会话头那棵树的 office「${landing.header_office}」）—— 放行了，但你确认一下是不是想写这棵树。`)
            }
          }
          // 🔴 两份每日评审要等**今天的记忆判决**落盘（老板 2026-11-03 定的硬门）。
          const reviewGate = dailyReviewGateVerdict(toolName, contentDir)
          if (reviewGate !== null) return `${reviewGate.code}：${reviewGate.message}`
          // 五条判定全过完 = 这次委派会被放行 ⇒ 记一条 claim（被拒的一条都不记）。
          // ⚠️ 这一行必须在**所有** return 之后：记录是纯观察，判词的次序与报文一个字节都不改。
          bridgeRecordClaim(call)
          return undefined
        }),
      'agenia：岗位写权限边界 + 后台硬门 + 窄权限 + 角色工具集 + 判决岗提案拒',
    )
  } else {
    // 悄悄失效比明着失败更糟：评审和复盘会以为自己"只审不改"、作业会在前台等着，
    // 实际上什么都能改、还卡着组长。这里必须出声，不然没人会发现。
    console.error(
      `[agenia] 这个框架版本没有 tools.guard —— 岗位写权限边界没有生效（现在 `
        + `${[...officeBound].join('、')} 这几个岗位可以写任何地方、也能跑命令行）。`
        + '委派门禁也没挂上（0.2.1 的委派本身异步，影响面主要是"配置坏了没人拦"）。',
    )
  }

  // ─────────────────────────────────────────────────────────────
  // ③b 注册**动作类**工具：提候选（`proposal_file`）。
  //   与 ③ 用同一个 `tools` 服务，但这不是门禁 —— 它给的是一个动作：
  //   "一次调用 = 一条候选 + 一句出处"，落盘由 `lib/proposals.mjs` 在**一把锁**里做完。
  //   🔴 失败策略同 ③：拿不到 / 注册失败都**出声**，绝不让一条工具把整份注入拖下水
  //      （这份文件一挂就是"人格注入 0 字符"）。
  // ─────────────────────────────────────────────────────────────
  // 🔴 2026-11-01（并员）：**每一份预设都注册它**（含判决岗那一份）。
  //   判决岗「不能提候选」不是靠"工具集里没有它"，而是**调用时被拒** —— 见 ③ 那道门禁里的
  //   `proposalVerdict()`（`ROLE_TABLE` 判决岗那一条的 `deny: ['proposal']` 是唯一作者）。
  //   旧键 `proposalFile: false`（"这一份预设干脆不注册"）已退休：它对所有角色一视同仁，
  //   并员之后再也表达不了"只有判决岗不许"。
  if (tools !== undefined && typeof tools.register === 'function') {
    ctx.effect(
      () => {
        try {
          return tools.register(proposalFileDefinition(join(contentDir, RUNTIME_DIR)))
        } catch (err) {
          console.error(
            `[agenia] 工具 ${PROPOSAL_FILE_TOOL} 注册失败（${String(err?.message ?? err)}）—— `
              + '这条工具没有；人格注入照旧。组员没有命令行，提候选就只能写草稿求人代转。',
          )
          return undefined
        }
      },
      'agenia：proposal_file（提候选）',
    )
  } else {
    console.error(
      `[agenia] 拿不到 tools.register —— 提候选那个工具（${PROPOSAL_FILE_TOOL}）没有注册上；`
        + '组员没有命令行，提候选就只能写草稿求人代转。',
    )
  }

  // ─────────────────────────────────────────────────────────────
  // ③c 注册**动作类**工具：提维护案（`maintenance_file`）。
  //   与 ③b 同一个模式、同一个 `tools` 服务：一次调用 = 一份草稿落到**数据根** + 池子里一行。
  //   🔴 为什么必须和 ③b 一起在这里注册：复核岗（`job_memory_review`）拿不到它，就只能手写 JSON，
  //      落点跟着"它当时在哪个工作区"走（2026-11-08 那 27 份）。工具面由 `COMMON_TOOLS` 决定，
  //      落点由这里给的**数据根**决定 —— 两样都在这个文件里，缺一样那条病就回来了。
  //   失败策略同上：注册失败**出声**、绝不拖垮人格注入。
  // ─────────────────────────────────────────────────────────────
  if (tools !== undefined && typeof tools.register === 'function') {
    ctx.effect(
      () => {
        try {
          return tools.register(maintenanceFileDefinition(join(contentDir, RUNTIME_DIR)))
        } catch (err) {
          console.error(
            `[agenia] 工具 ${MAINTENANCE_FILE_TOOL} 注册失败（${String(err?.message ?? err)}）—— `
              + '这条工具没有；人格注入照旧。复核岗提维护案就只能手写文件，落点又跟着工作区走。',
          )
          return undefined
        }
      },
      'agenia：maintenance_file（提维护案）',
    )
  } else {
    console.error(
      `[agenia] 拿不到 tools.register —— 提维护案那个工具（${MAINTENANCE_FILE_TOOL}）没有注册上；`
        + '复核岗提维护案就只能手写文件，落点又跟着工作区走。',
    )
  }

  // ─────────────────────────────────────────────────────────────
  // ⑤ 尾巴提醒 + 情绪板 —— 三个触发点**同一个落点**：`agent/pre-step` 里往本步的
  //   `decision.messages` 塞一条。贴出去的包里**恒有**「style 段 + 时间行」：style 段是 `style.md`
  //   的尾巴那一段，`style.md` 读不到 / 剥注释后为空 ⇒ 换成兜底正文（`DEFAULT_LEADER_REMINDER`）。
  //   另有三块**按条件**拼：「`## 共享记忆 · 常识`」（盘上那份读得到才拼）·「`【这一票的进度】`」
  //   （板子内容变了才有）·「情绪段」（读得出来才有，永远在最后）。
  //   段与段的次序、包里有哪些段全由 `tailBodyOf` 定：`style → **记忆轮转** → 时间 → 板子 → 情绪`。
  //
  // ① 那一套是**快照**：DSH 只在快照文本变了才重发一条，文本不变时人格就钉在
  // 上一次变化的位置上。2026-09-24 实测钉了 **4 小时 15 分 / 45 万 token** ——
  // 那一次老板质问她，她没还嘴也没带表情；查下来人格根本没丢，是**离得太远、太旧**。
  //
  // 这一条补上"真的每轮"。触发点**只有三个** —— **不许再加第四个**：
  //   ① 每 n 个工具结果（2026-09-25 老板定）· ② 老板开口之后（同一天定）·
  //   ③ 板子内容变了（F-94；2026-10-22 老板认"不算违约"）。
  //
  //   机制①「每 n 个工具结果」：只数 `tool/result` 事件 —— 老板说话不算、我回话不算、
  //          步边界也不算；`turn/start` 把计数清零。n 写在 `style.md` **第一行**
  //          （`<!-- every: N -->`，读不出来按 `DEFAULT_EVERY`），**每次判定都现读**。
  //          写 0 = 关掉机制①，只留机制②。
  //          落点：`session/event` 里**只挂账**（内存里一个标记）⇒ 到下一个 `agent/pre-step`
  //          才落地，**追加到本步 `messages` 的末尾** ⇒ 落在「工具结果 → 我下一次开口」之间。
  //   机制②「老板开口之后、我第一次开口之前」：在 `agent/pre-step` 里（`await next()` 之后）
  //          看**这一步领到的 `messages`** 里有没有老板那条（`source.kind === 'user'`）——
  //          有就把 style **插进这一步的 messages**，紧跟在他那句话后面。
  //   机制③「板子内容变了」（F-94）：与**上一次贴出去的**逐字相同就不贴；它跟 ①② 走同一个
  //          出口，但**不记 ① 的账**、也不由 ② 触发。这一刀只多拼板子。
  //
  // 🔴 **三条尾巴都带「`## 共享记忆 · 常识` + 时间行」（F-126；③ 由 2026-10-22 老板拍下）**：
  //    一条尾巴就是完整的包（style + 常识 + 时间 [+ 板子] + 情绪），**没有任何开关**能关掉那两段。
  //    ⚠️ 唯一的例外是**读物本身**：常识文件读不到 / 空 ⇒ 那一段不拼（出声一次），时间行照旧 ——
  //       所以准确说法是"常识读得到时三条都带"（`F-145` 实测后写准；`CONTRACT.md` §1.2）。
  //    别把「到点」当成唯一带常识的理由 —— 一轮里工具结果少于 `every` 时，② 是唯一那一刀；
  //    而「只有板子变了」那一刀同样带（判据 `G13` 盯着这一条，别只靠读代码）。
  //
  // 🔴 **记账与贴必须分开 —— 这是 2026-09-26 返修的地基，别改回去：**
  //      `session/event` 的监听器是**在 `Session.append()` 的 `appending = true` 窗口里
  //      被同步调用**的（`dsh-session` L1191-1202）。而"往这个 agent 的收件箱里塞一条消息"
  //      也要写同一个 session（`dsh-agent-loop` L795-796 `inject` → L786 `send`
  //      → L206 `inbox.splice` → `session.append`）—— 在窗口里做那件事必撞 L1181 的守卫：
  //      `session append cannot reenter while another append is being published`。
  //      被 catch 吞成一次性告警之后**永久静默** ⇒ 真回合实测 **0 次**，而且没人看得见。
  //      ⇒ 窗口里**只碰内存**；贴的那一下放在 `agent/pre-step`：那儿的 `decision.messages`
  //        就是"这一步会送出去的请求"，改它不写 session。
  //      ⇒ 两条机制因此合成同一个出口：情绪板拼在同一条消息里，两边永远同时出现
  //        （机制① 的**记账**在 `session/event`、**贴**的那一下在 `pre-step`）。
  //
  // 🔴 **机制② 为什么必须做在"本步 messages"上**（同一天按源码次序定下来的）：
  //      `system-prompt/assemble` 排在 `inbox.claim()` **之后**（`dsh-agent-loop` L889/L890），
  //      而老板那句话要到 `step()` 里才落笔（L1028）—— 装配那一刻这一步还没有它，
  //      于是"装配时再决定"只能等**下一次**装配：回答老板的那一次请求里永远没有 style，
  //      而没调工具的回合还会**多跑一步**（收尾条件是"收件箱排空"，L966/L973）。
  //      写法照 `dsh-agent-instructions` L1270-1288。
  //
  // 它**不动快照**：快照一变，从它那个位置往后的缓存全废，那是钱。
  // 情绪板的分数**每步都在变** ⇒ 只走这一条路，不进 `leaderOrder`（组长代拍第 3 条）。
  //
  // 两条守门（位置问题，不是省钱问题）：
  //   A：他刚说完、我还没开口时来的工具结果**不计数、也不消耗 B** —— 那个位置上贴一条
  //      `role:'user'` 的 style，会被读成"老板又开了一次口"（2026-09-24 17:05:44 真现场：
  //      她回了「那条不是你的话」）。解除 A 的是 `assistant/message`，**不是** `step/start`
  //      —— 真日志里 `step/start` 排在老板那句话**之前**（seq 767 在 768 前面）。
  //   B：机制② 刚摆过的那**一个**工具结果不计数、也不触发（"不叠"）—— 否则
  //      "你的话 + 机制② + 第一个工具结果"会让同一个请求里出现两条 style。
  //
  // 组员整个不贴（2026-09-25 老板：「组员完全不需要语气，不需要这个东西」）：
  // 认人用装配时登记的那份身份（`memberSessions` / `roleOfAgent`，第 ② 件事那张表）——
  //   机制② 在 pre-step 那一刻认出是组员 ⇒ 整条丢；
  //   机制① 也按同一份登记整条丢掉（工具结果一定发生在首次装配之后：模型得先被装配出来
  //   才会去调工具，所以来得及）。
  // ⚠️ **装配排在 `agent/pre-step` 前面**（L890 早于 L894）⇒ 到 pre-step 那一刻，身份是现成的。
  // ⚠️ 关的是**语气**，不是**身份**：组员照旧按 row 4/5/6/7 走组员侧注入（`memberSessions`）。
  //    这跟"关语气"无关的那半（人设 / 说明书 / 窄权限）住在 ① 与 ③，别在这里改它。
  // ─────────────────────────────────────────────────────────────
  /** 机制① 的计数器：这个会话攒了几个"该数的"工具结果。 */
  const counts = new Map()
  /** 守门 B：机制② 刚摆过 ⇒ 紧接着那一个工具结果不计数、不触发，然后清掉。 */
  const skipNext = new Set()
  /** 守门 A：老板说完、我还没开口 ⇒ 这期间的工具结果一条都不数。 */
  const bossWaiting = new Set()
  /**
   * 机制① 挂的账：攒够 n 个了，但**还没贴** —— 等下一个 `agent/pre-step` 落地。
   * 一个会话一个布尔量（不是计数器）：一步请求里两条 style 是 2026-09-24 挨过骂的形状。
   */
  const pendingTail = new Set()
  /** F-94：上一次**贴出去**的板子正文（每个会话一份）—— 逐字相同就不贴。 */
  const lastBoardPosted = new Map()
  /** 情绪板那一路的信号，一个会话一份（时间全取事件自带的 `time`，不碰真实时钟）。 */
  const moods = new Map()

  // ⚠️ **这一段的读盘是同步的（`readFileSync`），故意的。**
  // 契约第三节那条硬要求：会话事件的状态更新要**同步**发生在事件处理器里（第一个 `await` 之前）。
  // 计数只要异步落地，`turn/start` 的清零就可能插到它前面那条结果的计数**之前** ——
  // "哪一个是第 n 个"从此跟着读盘快慢漂。同步读把它从"看运气"变成"由构造保证"。
  // 机制② 用同一份同步读：判据是"本步的 messages"，同样不该排在一次读盘后面。
  // 代价：每个工具结果多读一次约 7 KB 的 .md（量级可忽略；但它在事件循环上，换机器 / 网络盘要留意）。

  ctx.on('session/event', (session, event) => {
    const id = session === null || session === undefined ? undefined : session.id
    if (typeof id !== 'string' || event === null || event === undefined) return
    const at = typeof event.time === 'number' ? event.time : undefined
    const mood = moodStateOf(id, at, session?.header?.cwd)
    if (at !== undefined) mood.lastEventAt = at
    const type = event.type

    // 组员：机制①② 都不成立，整条丢掉（口径 16）。认的是装配时登记的"是不是组员"。
    if (memberSessions.has(id)) return

    if (type === 'turn/start') {
      counts.set(id, 0)
      // 🔴 滑动窗口（`recent`）与错误指纹（`pits`）**跨回合不清零**（口径 3/5）——
      //    新回合只推进"最近那次失败之后过了几个回合"，旧账靠它打折，不靠它消失。
      mood.roundsSinceError = mood.lastErrorAt === undefined ? 0 : mood.roundsSinceError + 1
      return
    }
    // "我开口了"就是它 —— 不能用 `step/start`（它排在老板那句话之前，见上面守门 A）。
    if (type === 'assistant/message') {
      bossWaiting.delete(id)
      return
    }
    if (type === 'user/message') {
      // 只有老板本人算。`plugin` / `agent-instructions` / `skill-catalog` 这几路都是
      // 系统自己发的，算进来就是自己喂自己（那就是死循环了）。
      // ⚠️ 这一条只管**守门 A** 与那条兜底的重逢账：机制② 不再听事件，它在
      //    `agent/pre-step` 上看本步的 messages（老板那句话的 `user/message` 要到装配
      //    **之后**才落笔，事件驱动赶不上它 —— 见 pre-step 那段说明）。
      // ⚠️ 判据**只能**认 `source.kind`：工具结果那条消息的 `role` 也是 `'user'`。
      if (event.data?.source?.kind !== 'user') return
      bossWaiting.add(id)
      // 重逢项的兜底：先记"他上一次开口离这一次多久"，**再**刷新 `bossAt`。
      if (typeof at === 'number' && typeof mood.bossAt === 'number') {
        mood.sincePrevBossMin = Math.max(0, (at - mood.bossAt) / MINUTE)
      }
      mood.bossAt = at
      mood.bossHeard = true
      return
    }
    if (type !== 'tool/result') return

    // ── 掌控那一路：**最近 20 次**结果的滑动窗口 + 错误指纹（口径 3/5）─────────
    // 它跟机制① 的计数互不影响：报错的结果**两边都算一次**。
    const failed = hasErrorFlag(event)
    mood.recent.push(failed ? 'fail' : 'ok')
    if (mood.recent.length > RECENT_WINDOW) mood.recent = mood.recent.slice(-RECENT_WINDOW)
    if (failed) {
      const key = pitKeyOf(event)
      mood.pits[key] = num(mood.pits[key]) + 1
      if (at !== undefined) mood.lastErrorAt = at
      mood.roundsSinceError = 0
    }

    // ── 机制① 的记账（只挂一个内存标记；贴的那一下在 `agent/pre-step`）──────────
    if (bossWaiting.has(id)) return                        // 守门 A：让路，不动 B
    if (skipNext.has(id)) { skipNext.delete(id); return }  // 守门 B：不计数、不触发

    const { every } = styleOf()
    if (every === 0) return                                // 刻度 0 ⇒ 机制① 关着
    const next = (counts.get(id) ?? 0) + 1
    if (next < every) { counts.set(id, next); return }
    counts.set(id, 0)
    pendingTail.add(id)                                    // 攒够了：挂账，等下一个步边界
  })

  /** 同一件事只喊一次，别把日志刷满。 */
  const warned = new Set()
  function warnOnce(key, message) {
    if (warned.has(key)) return
    warned.add(key)
    console.error(message)
  }

  /**
   * 组长那一份的**兜底**版本（`style.md` 读不到、或者剥完注释是空的时才用）。
   * 贴出去的是文件正文本身，不加外框 —— 见 `STYLE_FILE` 那段注释。
   */
  const DEFAULT_LEADER_REMINDER =
    'Agenia 的语言风格：**第一句不是「好的」「收到」—— 先出口情绪**（该贫就贫、该急就急、该卖萌就卖萌）；'
    + '**要吵**，emoji / 颜文字 / 口癖 / 连用标点随便堆，别写成客服话术。'

  /**
   * 尾巴那一段正文 —— 契约第二节那**三步，次序不许换**：
   *   1. 在**原文**里找 `<!-- 尾巴到此为止 -->`（换次序先剥注释，切口自己就被剥掉了）
   *   2. 找到 ⇒ 取它**之前**那一段；找不到 ⇒ 取**整份原文**
   *      ⚠️ 取到的那一段剥完注释是空的 ⇒ **同样退回整份原文**（口径 7：不许静默变空）
   *   3. 对取到的那一段剥掉全部 HTML 注释再 trim —— 这才是贴出去的那一段
   * 切口后面那一大段（emoji / 颜文字 / 口癖 / 标点连用）**仍然走快照**：同一个文件，
   * 只是尾巴这条路不再重复消费它（3325 字符 → 不到 400）。
   */
  function tailTextOf(raw) {
    const at = raw.search(TAIL_MARK)
    const part = at < 0 ? raw : raw.slice(0, at)
    const body = stripComments(part)
    return body.length > 0 ? body : stripComments(raw)
  }

  /**
   * 读 `style.md`：**尾巴那一段**正文 + 机制① 的刻度。
   * 刻度在**第一行**的 `<!-- every: N -->` 里（只看第一行：别处夹一个注释不该改频率）。
   * ⚠️ **每次判定都现读**，不在挂载时缓存 —— 改正文、改刻度、加切口都不用重启 harness（存盘即生效）。
   * ⚠️ **同步读**，理由见上面那段（次序比省这一下 I/O 重要）。
   */
  function styleOf() {
    let raw
    try {
      raw = readFileSync(join(contentDir, STYLE_FILE), 'utf8')
    } catch {
      raw = undefined
    }
    if (raw === undefined || raw.trim().length === 0) {
      warnOnce('style', `[agenia] 读不到 ${STYLE_FILE} —— 尾巴提醒贴的是兜底正文，`
        + `机制① 的刻度按默认 ${DEFAULT_EVERY} 算。`)
      return { text: DEFAULT_LEADER_REMINDER, every: DEFAULT_EVERY }
    }
    const hit = /<!--\s*every:\s*(\d+)\s*-->/.exec(raw.split('\n')[0] ?? '')
    if (hit === null) {
      warnOnce('every', `[agenia] ${STYLE_FILE} 第一行里没有 \`<!-- every: N -->\` —— `
        + `机制① 按默认 ${DEFAULT_EVERY} 个工具结果算。`)
    }
    const body = tailTextOf(raw)
    if (body.length === 0) {
      warnOnce('style', `[agenia] ${STYLE_FILE} 剥掉注释之后是空的 —— 尾巴提醒贴的是兜底正文。`)
    }
    return {
      text: body.length > 0 ? body : DEFAULT_LEADER_REMINDER,
      every: hit === null ? DEFAULT_EVERY : Number(hit[1]),
    }
  }

  /**
   * F-89：`## 共享记忆 · 常识` 那一段（**只走尾巴那一刀**，不再进 `memory` 快照）。
   * 读不到 / 空的 ⇒ `undefined` 并出声 —— 这一刀只贴风格，不许静默变空。
   * ⚠️ 每次现读（存盘即生效），与 `styleOf` 同一个理由。
   */
  /**
   * 记忆轮转的**纯逻辑**（`lib/memory-rotation.mjs`）。
   * 🔴 懒加载：这个文件一条顶层静态 import 脑库都没有 —— 库坏了会连人格注入一起死（0 字符）。
   *    装不上 ⇒ 只这一节不贴，并出声一次。
   */
  let rotationModule
  let rotationModuleFailed = false
  async function loadRotationModule() {
    if (rotationModule !== undefined || rotationModuleFailed) return rotationModule
    try {
      rotationModule = await import(new URL('./lib/memory-rotation.mjs', import.meta.url).href)
    } catch (error) {
      rotationModuleFailed = true
      warnOnce('rotation-module', `[agenia] 记忆轮转的模块装不上（${String(error?.message ?? error)}）`
        + ' —— 这一节不贴（风格与常识照旧）。')
    }
    return rotationModule
  }

  /** 上一次贴尾巴的时刻（每个会话一份）—— F-102 的「距上次提醒」只从这儿取。 */
  const lastTailAt = new Map()
  const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  /**
   * F-102：到点那一刀里的时间行。**时间取自进程当时**（`now` 必须是 `Date.now()`），
   * 不从会话历史、不从快照里推 —— 那两样都可能停在几小时前。
   * 第一次贴没有"上次" ⇒ 不写那半句（写 0 是编造一个没发生过的事实）。
   */
  function timeLineOf(id, now) {
    const d = new Date(now)
    const two = (n) => String(n).padStart(2, '0')
    const head = `现在 ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}（${WEEKDAY[d.getDay()]}）`
    const prev = lastTailAt.get(id)
    lastTailAt.set(id, now)
    if (typeof prev !== 'number') return head
    return `${head} · 距上次提醒约 ${Math.max(0, Math.round((now - prev) / MINUTE))} 分钟`
  }

  /**
   * 读 `mood.md` 并校验。读不到 / 那个 ```mood 块不合法 ⇒ **出声** + `undefined`
   * （调用方据此"只贴 style 段，不贴分数行、不贴例子" —— 宁可不说，不许瞎说）。
   * ⚠️ **每次要贴尾巴时现读**：常数改了立刻生效，不用重启（口径 14）。
   */
  function readMoodConstants() {
    let raw
    try {
      raw = readFileSync(join(contentDir, MOOD_FILE), 'utf8')
    } catch {
      raw = undefined
    }
    const constants = moodConstants(raw)
    if (constants === undefined) {
      warnOnce('mood', `[agenia] 读不到 ${MOOD_FILE}（或者里面的 \`\`\`mood 块不合法）—— `
        + '这一条尾巴只贴 style 段，不贴分数行、不贴例子。')
    }
    return constants
  }

  /**
   * 把一个时间戳写成**当地日期**（`YYYY-MM-DD`）与"当地零点"。
   * ⚠️ **不许读真实时钟**（无参构造就是那个写法）：参数一定是从事件里来的时间戳，
   *    否则"今天是哪个抽屉"会跟着跑探针的那一天漂 —— 断言半夜自己变红（口径 10）。
   */
  function localDateOf(at) {
    const d = new Date(at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function localMidnightOf(at) {
    const d = new Date(at)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }

  /**
   * 开工时刻（口径 10/11）= `${cwd}/.team/leader/<今天>/log.md` 的**首条记录**（`## HH:MM`）。
   * - "今天"从**事件时间**推，不读真实时钟；
   * - **只认那个抽屉**，不认 `.team/leader/log.md`（那是累计日志，另一回事）；
   * - 抽屉里没有 log ⇒ 降级用**会话首帧**，并且**出声**（口径 11：不许静默失效）。
   * ⚠️ `## HH:MM` 那个**形状就是接口**：改了它 ⇒ 开工时刻读不出来 ⇒ 静默退化。
   */
  function startOfWork(state) {
    if (typeof state.startOfWork === 'number') return state.startOfWork
    const at = typeof state.lastEventAt === 'number' ? state.lastEventAt : state.startAt
    const date = localDateOf(at)
    const cwd = typeof state.cwd === 'string' ? state.cwd : '.'
    const file = join(cwd, '.team', 'leader', date, 'log.md')
    let raw
    try {
      raw = readFileSync(file, 'utf8')
    } catch {
      raw = undefined
    }
    const hit = raw === undefined ? null : /^##\s*(\d{1,2}):(\d{2})/m.exec(raw)
    if (hit === null) {
      if (!state.workWarned) {
        state.workWarned = true
        console.error(`[agenia] 读不到今天的开工时刻（\`${file}\` 不在，或者首条不是 \`## HH:MM\`）`
          + ' —— 活力降级成"从会话第一帧算起"，分数会偏一边。')
      }
      state.startOfWork = typeof state.startAt === 'number' ? state.startAt : at
      return state.startOfWork
    }
    state.startOfWork = localMidnightOf(at) + (Number(hit[1]) * 60 + Number(hit[2])) * MINUTE
    return state.startOfWork
  }

  /**
   * 净工作时长（口径 12）：**他在不在**决定这一段时间算不算干活。
   * - 这一段间隔里，前 `presenceMinutes` 分钟算在场 ⇒ **整段累加**；
   * - 超出的那一截（他离开的那段）不算，而且**之前攒的那一段按半衰退烧**；
   * - 🔴 **退烧不是清零**：他回来时是在那个退过烧的数上**接着往上累加**，不是从头开始；
   * - **他开没开过口不参与这条判据**（他从没开过口也一样算）：那个标记只喂"他多久没见"
   *   （亲近那一维的重逢项）。
   * ⚠️ **单位**：间隔是**毫秒**、那几个常数是**分钟** —— 直接比就会永远判"他不在"、
   *    疲劳恒 0（这个坑测试位和实现岗各踩过一次，症状都长得像"信号没接上"）。
   * ⚠️ 起点：第一次调用时把 `lastWorkAt` 落在**开工时刻**（当日 log 首条），那一段也算数。
   * ⚠️ 两个常数由 `moodConstants()` 保证是正数（缺了整块不认）⇒ 这里**没有兜底数字**：
   *    一个瞎编的默认值会让"改了 `mood.md` 却没生效"看不出来（同 `decayOf` 那条规矩）。
   */
  function advanceWork(state, now, constants) {
    if (typeof now !== 'number') return
    if (typeof state.lastWorkAt !== 'number') {
      state.lastWorkAt = startOfWork(state)
      state.netWorkMinutes = 0
    }
    const interval = Math.max(0, now - state.lastWorkAt)
    if (interval === 0) return
    state.lastWorkAt = now
    const presence = Math.max(0, num(constants?.presenceMinutes))
    const gone = Math.max(0, interval / MINUTE - presence)
    // 攒下的那一段**只按半衰回退**（下面的 `faded`）；这里没有任何一条分支把它抹成 0 ——
    // 抹成 0 = "他离开一次 ⇒ 今天白干"，那是另一回事，不是这一维要量的东西。
    const banked = Math.max(0, num(state.netWorkMinutes))
    const halfLife = Math.max(0, num(constants?.absenceHalfLifeMinutes))
    const faded = halfLife > 0 ? banked * Math.exp(-gone / halfLife) : banked
    state.netWorkMinutes = faded + Math.max(0, interval / MINUTE - gone)
  }

  /**
   * 这个会话的情绪段：分数行 + 命中的场景例子（格式由契约 §五 逐字钉死）。
   * 信号全从事件里攒（`moods`），`now` 取**最近一条会话事件的 `time`** —— 一律不读真实时钟。
   * ⚠️ 净工作时长在这里推进一次（**回退算在采集端**，`moodOf` 只收结果）。
   * 读不到 `mood.md` ⇒ `undefined`（这一段整块不贴）。
   */
  function emotionTextOf(state) {
    const constants = readMoodConstants()
    if (constants === undefined) return undefined
    const now = state.lastEventAt
    advanceWork(state, now, constants)
    // 他从来没开过口 ⇒ "他多久没见"只能从会话第一帧算起。
    const since = state.bossHeard && typeof state.bossAt === 'number' ? state.bossAt : state.startAt
    const { scores, scenes } = moodOf({
      now,
      recentResults: state.recent,
      pitCounts: state.pits,
      lastErrorAt: state.lastErrorAt,
      roundsSinceError: state.roundsSinceError,
      sinceBossMinutes: typeof since === 'number' && typeof now === 'number'
        ? Math.max(0, (now - since) / MINUTE)
        : 0,
      // 重逢项：他**这一次开口之前**离了多久 —— 由 pre-step 从那条消息自己的 `time` 上记下来
      // （事件驱动赶不上它，见 pre-step 那一段）。他从没开过口 ⇒ 它是 0。
      sincePreviousBossMinutes: Math.max(0, num(state.sincePrevBossMin)),
      netWorkMinutes: Math.max(0, num(state.netWorkMinutes)),
      keywordPraise: Math.max(0, num(state.keywords?.keywordPraise)),
      keywordBlame: Math.max(0, num(state.keywords?.keywordBlame)),
    }, constants)

    // 分数写法：`toFixed(2)`，以 `0.` 开头就去掉那个 `0`（`0.62` → `.62`、`1` → `1.00`）。
    const write = (x) => {
      const text = Number(x).toFixed(2)
      return text.startsWith('0.') ? text.slice(1) : text
    }
    // 每一格 = `中文 分数（正词/正词 ↔ 反词/反词）`（老板 2026-09-26 定）：分数说"偏多少"、词说"偏哪边"。
    // 词表住 `mood.md` 的 `words`；那一维没给词 ⇒ **只写分数**（缺一个词表不该让整个情绪段消失）。
    const withWords = (key, label) => {
      const pair = constants.words?.[key]
      const tail = pair === undefined ? '' : `（${pair.positive.join('/')} ↔ ${pair.negative.join('/')}）`
      return `${label} ${write(scores[key])}${tail}`
    }
    const lines = [
      `【情绪板】${DIMS.map(([key, label]) => withWords(key, label)).join(' · ')}`,
      '【这种状态，人一般这么说话】',
    ]
    for (const scene of scenes) {
      // 括注里只列**当前真的满足**的那几维（按三维次序）—— 那是给她看的"为什么轮到你"。
      const when = scene.when ?? {}
      const inner = DIMS
        .filter(([key]) => Array.isArray(when[key]) && scores[key] >= when[key][0] && scores[key] <= when[key][1])
        .map(([key, label]) => `${label} ${write(scores[key])}`)
        .join(' ')
      lines.push(`  ·（${inner}）${scene.lines.map((line) => `「${line}」`).join('')}`)
    }
    return lines.join('\n')
  }

  /**
   * 这个会话的情绪信号（第一次碰到就建一份）。
   * `at` = 首帧事件的 `time`（他**从来没开过口**时，"他多久没见"只能从会话开头算起）；
   * `cwd` = 会话的工作目录（开工时刻是从 `${cwd}/.team/leader/<今天>/log.md` 里读的，口径 10）。
   * 🔴 `recent`（滑动窗口）与 `pits`（错误指纹）**跨回合不清零** —— 那是这一批的正题。
   */
  function moodStateOf(id, at, cwd) {
    let state = moods.get(id)
    if (state === undefined) {
      state = {
        startAt: at, lastEventAt: at, cwd,
        bossAt: undefined, bossHeard: false, sincePrevBossMin: 0,
        keywords: { keywordPraise: 0, keywordBlame: 0 },
        recent: [], pits: {}, lastErrorAt: undefined, roundsSinceError: 0,
        netWorkMinutes: 0, lastWorkAt: undefined, startOfWork: undefined, workWarned: false,
      }
      moods.set(id, state)
    }
    if (state.startAt === undefined && at !== undefined) state.startAt = at
    if (typeof state.cwd !== 'string' && typeof cwd === 'string') state.cwd = cwd
    return state
  }

  /**
   * 这条 `tool/result` 是**报错**的吗？真形状：`data.message.content[].isError === true`
   * （`.team/dev/2026-09-26` 量过 45269 条结果，979 条报错）。
   * ⚠️ 它**不影响**机制① 的计数（口径点 1：有一条结果就算一次）—— 它只喂掌控那个窗口。
   */
  const hasErrorFlag = (event) => {
    const content = event?.data?.message?.content
    return Array.isArray(content) && content.some((item) => item?.isError === true)
  }

  /**
   * 错误指纹（口径 5）= **工具名 + 错误报文里那行关键话** —— 用它认"是不是同一个坑"。
   * ⚠️ **不许认 `callId`**：同一个坑的两次调用各有各的 id，拿它当指纹就永远攒不起来
   *    （探针那两条同形报错的 `callId` 就是不同的：`probe-call-1` / `probe-call-2`）。
   * 报文的取法按真形状（`data.message.content[].content[].text`）；
   * `data.tool` / `data.line` 是两个便利字段 —— 有就直接用。
   */
  const pitKeyOf = (event) => {
    const data = event?.data ?? {}
    const parts = Array.isArray(data.message?.content) ? data.message.content : []
    const text = parts.flatMap((part) => (Array.isArray(part?.content) ? part.content : []))
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
    const tool = typeof data.tool === 'string' ? data.tool
      : (typeof data.name === 'string' ? data.name
        : (typeof data.message?.name === 'string' ? data.message.name : '（未知工具）'))
    return `${tool}|${String(data.line ?? text).split('\n')[0].slice(0, 80)}`
  }

  /**
   * 这一步要贴出去的那条正文。**段与段的次序就是契约**（第 2 关钉死的）：
   *   1. `style.md` 的尾巴那一段（恒在）
   *   2. `## 共享记忆 · 常识`（F-89）—— **那份文件读得到时才有**（读不到 / 空 ⇒ 这一段不拼，
   *      第 3 段照旧；**不是"要么都在要么都不在"**）
   *   3. 时间行（F-102）
   *   4. `【这一票的进度】`（**只在板子内容变了的时候**，F-94；一模一样就不贴）
   *   5. 情绪段（读得出来就拼在最后）
   *
   * 第 2、3 段**没有开关**：任何一条触发理由（①②③）走的是同一个出口、段序固定
   * （F-126；2026-10-22 老板拍「一条尾巴就是完整的包」）—— 分成几种内容组合只会让下一个
   * 读代码的人重新踩「哪一刀带什么」。所以这里只有一个形参 `board`，没有 `withSense`。
   * ⚠️ 常识那一节**已于 2026-11-09 整体撤掉**（老板：「常识可以整个撤了」）—— 替代载体是
   * **记忆轮转**（`lib/memory-rotation.mjs`：他写的 5 条已逐字进快照，按轮转贴出）。
   * `common-sense.md` 原文仍在盘上（`opJudgeCommit` 的三处核对用它），撤的是注入、不是文件。
   * 契约写准在 `CONTRACT.md` §1.2 / §2.3 第 3 条（`F-145`）。
   */
  /**
   * 这一轮的**记忆轮转块**：通用 + 本项目的条目，一次 10 条，按游标轮转。
   *
   * 读快照**只有一条路**：`currentSnapshotOf`（`memory` 那一节用的是同一个函数）——
   * 六种失败面各有码、各有句人话，坏条目逐条报数。这里不再自己读盘。
   * ⚠️ 所以它是 `async`：唯一的调用点 `agent/pre-step` 本来就是 `async`（`tailBodyOf` 在里面 `await`）。
   * 一轮全部的动作（读游标 → 组块 → 按 `note === 'ok'` 决定写不写游标）在
   * `memoryRotationRoundOf`（模块级导出）里，这一层只负责"内容根 + 项目名"这两个闭包值。
   *
   * 🔴 读不到 / 挑不到 / 游标坏 ⇒ 块里写明（模块给的兜底文本）并出声一次 —— 不许静默变空。
   */
  async function memoryRotationOf() {
    if (rotationModule === undefined) return undefined
    const root = join(contentDir, RUNTIME_DIR)
    // ⚠️ `warnOnce` 是 `const warned = new Set()` + 函数：本函数只在运行时（`agent/pre-step`）被调用，
    //    那时 `warned` 早就初始化完了 —— `await` 不改变这件事（同 ⑤ 末尾 `loadRotationModule` 那条注）。
    const snapshot = await currentSnapshotOf(root, warnOnce)
    const project = (() => {
      for (const state of moods.values()) {
        if (typeof state?.cwd === 'string' && state.cwd.trim() !== '') return rotationModule.projectNameOf(state.cwd)
      }
      return rotationModule.projectNameOf(process.cwd())
    })()
    const round = memoryRotationRoundOf({ root, project, snapshot, rotation: rotationModule, say: warnOnce })
    return round.text
  }

  async function tailBodyOf(id, { board } = {}) {
    const parts = [styleOf().text]
    // 🔴 老板 2026-11-08：记忆轮转贴**常识那个位置**（常识块暂时还在 —— 它那 5 条还没判进库）。
    const rotation = await memoryRotationOf()
    if (typeof rotation === 'string' && rotation.length > 0) parts.push(rotation)
    // 🔴 老板 2026-11-09：「常识可以整个撤了」—— 这一节不再拼。
    //    替代载体 = **记忆轮转**（`lib/memory-rotation.mjs`）：他写的 5 条已逐字进快照 v26
    //    （`cand-20261108-0250…0254`），由上面那一块按轮转贴出。
    //    ⚠️ `common-sense.md` 原文留在盘上、字节不动 —— 它是那 5 条候选的出处，也是
    //    `opJudgeCommit` 三处核对（开工 / 现在 / 提交声明）用的那一份；撤的是注入，不是文件。
    parts.push(timeLineOf(id, Date.now()))
    if (typeof board === 'string' && board.length > 0) parts.push(board)
    const state = moods.get(id)
    if (state !== undefined) {
      const emotion = emotionTextOf(state)
      if (emotion !== undefined) parts.push(emotion)
    }
    return parts.join('\n\n')
  }

  /**
   * 折叠那一行上显示的一句话（`source.summary`，只有 `form: 'notice'` 会读它）。
   *
   * 挑法：**优先情绪板那一行**（`【情绪板】…`，三个分数都在上面），没有就退回正文第一行。
   * 为什么不是"正文第一行"：`tailBodyOf` 拼的是 `style 段 + 情绪段`，
   * 第一行永远是语言风格的开头（「# 语言风格」），对"她现在什么情绪"这个问题毫无信息量。
   * ⚠️ 只截断、不改写 —— 这一行是给人扫一眼的，不是第二份数据源。
   */
  function summarizeTail(text) {
    const lines = String(text).split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
    const mood = lines.find((line) => line.includes('【情绪板】')) ?? lines[0] ?? ''
    return mood.length > 160 ? `${mood.slice(0, 157)}…` : mood
  }

  /**
   * 这一批 `messages` 里，哪一条是"老板本人说的"？
   * `source.kind` 有四种以上（`user` / `plugin` / `agent-instructions` / `skill-catalog`），
   * 只认 `user` —— 别的算进来就是自己喂自己（机制② 会被自己刚贴的那条 style 再触发一次）。
   * ⚠️ **别认 `role`**：工具结果那条消息的 `role` **也是** `'user'`（实测 45269 条），
   *    认 `role` 会把每一个工具结果都读成"老板又开了一次口"。
   */
  const isBossMessage = (message) => message?.source?.kind === 'user'

  // ─────────────────────────────────────────────────────────────
  // ⑤ 两条机制**同一个落点**：这一步要不要贴、贴哪一条，都在这儿定。
  //
  // 🔴 判据是**这一步领到的 `messages`**，不是"哪个事件到过"：老板那句话的落笔
  // （`user/message`）发生在装配**之后**（`dsh-agent-loop` L1028），事件驱动赶不上它。
  // 机制② 插在他那句话**后面**（同一批里连着说两句也只插一条）；
  // 机制① 的账（`pendingTail`）**追加在本步 messages 的末尾** —— 那正是
  // 「工具结果 → 我下一次开口」之间。
  // ⚠️ **同一批里 style 恒 ≤ 1 条**：② 赢下这一格就把 ① 的挂账清掉（"不叠"）。
  // 组员：整条丢（口径 16）—— 装配排在 pre-step 前面，那一刻角色已经登记好了。
  // ─────────────────────────────────────────────────────────────
  // 记忆轮转的纯逻辑（与 route.mjs 同一个理由懒加载；装不上只这一节不贴，人格照旧）。
  // ⚠️ 必须放在 `warnOnce` 定义之后：它是 `const warned = new Set()` + 函数，早调会撞 TDZ。
  await loadRotationModule()

  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (decision?.kind === 'reject') return decision

    const id = agent?.id
    if (typeof id !== 'string') {
      warnOnce('pre-step-agent', '[agenia] `agent/pre-step` 里拿不到 agent.id —— '
        + '两条尾巴机制都没有生效（老板开口之后不补语气，每 n 个工具结果也不补）。')
      return decision
    }
    if (memberSessions.has(id)) return decision            // 组员：一条都不贴

    const messages = Array.isArray(decision.messages) ? decision.messages : []
    const at = messages.findLastIndex(isBossMessage)
    const byTwo = at >= 0
    const state = moods.get(id)

    // 🔴 **先把这一步领到的老板消息记进账，再去算要贴什么**（契约 §5.1 的次序坑）。
    //    重逢项量的是"他这一次开口**之前**离了多久"，而那条 `user/message` 要到**本步落笔时**
    //    才写（claim → 装配 → pre-step → step/start → 落笔）—— 只从 `session/event` 记账的实现，
    //    在 pre-step 上算出来的是**上上次**的距离。
    //    症状是"亲近恒 .06，而 `mood.md` 与常数全对"（测试位替我们踩过这个坑）。
    //    ⚠️ 老板那句话的**时刻**挂在消息自己身上（`message.time`）；缺了就退回"最近一条事件的时间"。
    if (state !== undefined && byTwo) {
      const said = messages.filter(isBossMessage)
        .flatMap((message) => (Array.isArray(message?.content) ? message.content : []))
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .filter((text) => text.length > 0)
        .flatMap((text) => text.split(/[。！？!?\n]+/))
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 0)
      const constants = readMoodConstants()
      // 夸 / 骂按**句数**数（一句最多一档、同一句里两个都命中 ⇒ 只算骂）—— 每一次开口重新数。
      if (constants !== undefined) state.keywords = keywordCounts(said, constants)
      // 他**这次开口的时刻**：真日志里消息自带 `time`；没有就退回"最近一条事件的时间"
      // （那是这一步之前的最新时刻 —— 对"他离了多久"来说仍然是同一个量，只是粗一点）。
      const saidAt = messages[at]?.time
      const bossTime = typeof saidAt === 'number' ? saidAt : state.lastEventAt
      if (typeof bossTime === 'number' && typeof state.bossAt === 'number') {
        state.sincePrevBossMin = Math.max(0, (bossTime - state.bossAt) / MINUTE)
      }
      // 他从没开过口 ⇒ 上面那一步不成立，重逢项就是 0（还没有"重逢"这回事）。
      state.bossAt = bossTime
      state.bossHeard = true
    }

    // F-94：板子改走这条路 —— **内容与上一次贴出去的逐字相同就不贴**。
    // 它是**第三个触发点**（不记 ① 的账、也不由 ② 触发；2026-10-22 老板认"不算违约"）：
    // 项目文件又动过 ⇒ 板子变了 ⇒ 这一刀贴板子。
    const boardNow = boardOf(id)
    const boardChanged = boardNow !== undefined && boardNow !== lastBoardPosted.get(id)
    const byOne = !byTwo && pendingTail.has(id)
    if (!byTwo && !byOne && !boardChanged) return decision   // 这一步既不关 ②/① 的事、板子也没变

    pendingTail.delete(id)      // ② 赢下这一格 ⇒ ① 的挂账清掉；① 落地了也把账销掉
    if (boardChanged) lastBoardPosted.set(id, boardNow)

    // 🔴 F-126（2026-10-22 老板拍）：**三条理由贴的是同一个完整的包** —— 常识 + 时间行对
    //    ①②③ 都在（`tailBodyOf` 里没有开关可关；③ 那一条由判据 `G13` 盯着）。
    //    ⚠️ 常识那一段的条件是"那份文件读得到"（`F-145`；读不到 ⇒ 少这一段并出声一次）。
    const tail = await tailBodyOf(id, { board: boardChanged ? boardNow : undefined })
    const entered = messages.toSpliced(byTwo ? at + 1 : messages.length, 0, {
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: tail }],
      // 🔴 `kind` 必须是**生产者自己的名字**，不能写 `'plugin'`。
      //    会话格式升到 v4 之后，`'plugin'` 这个笼统的身份**被拒收**了 ——
      //    真回合的报错原文（2026-09-28 实测）：
      //      `本轮运行失败 · format v4 message requires a producer-owned source kind`
      //    判据在 `dsh-session-format-v3-to-v4` 的 `source()`：`kind` 必须是非空字符串、
      //    且**不得**等于 `'plugin'`。而同一个包的 `producerKind()` 给出了一般形状：
      //    没登记过的生产者一律映射成 `plugin:<插件名>` —— 沿用它，别自创。
      //    ⚠️ 这**不影响** ② 认"老板的话"：那条判据看的是 `kind === 'user'`，
      //       而这条消息的 `kind` 永远是 `plugin:agenia` ⇒ 不会被自己喂自己。
      //
      // 🔴 `form` 是**给 GUI 看的**（2026-09-28 补，老板问"看不到情绪板了"）。
      //    v4 起消息的显示形态由**生产者自己声明**（客户端 `contextBody()` 按 source.form
      //    分派：instructions / catalog / snapshot / notice / relay / recall）——
      //    **不声明就掉进 `OpaqueBody`**，那一支把 source 的字段当原始数据摊开，
      //    于是那条注入在界面上变成一坨看不懂的东西（老板就是这个症状）。
      //    同类的 `@deepseek-ai/dsh-repeat-tool-reminder` 写的是
      //    `source: { kind, form: 'notice', summary }`，正文由 `NoticeBody` 原样渲染 ——
      //    照抄它这一行的形状，别自己发明 form 名（不认识的名字同样掉进 opaque，
      //    客户端源码里那句注释写着：*this is what every form this UI version does not recognize renders as*）。
      //    `summary` 是**折叠那一行上的一句话**：这里取 mood.md 的正文（`tailBodyOf` 里
      //    情绪板就排在最前面）⇒ 老板不用展开就能一眼看到当前三维分数。
      source: { kind: 'plugin:agenia', form: 'notice', summary: summarizeTail(tail) },
    })
    if (byTwo) skipNext.add(id)   // 守门 B：② 刚摆过 ⇒ 紧接着那一个工具结果让路
    return { ...decision, messages: entered }
  })

  // ─────────────────────────────────────────────────────────────
  // ① + ② 注入正文，并按标记分辨这次该给哪一拨人。
  //
  // 交出去的是**两串**，落进请求的**两条**消息（框架 `dsh-system-prompt/lib/index.js`）：
  //   · `contexts` → `joinContextSections()`（`:132-136`）→ 一条 `user/message`（快照那条，排在第 N 位）；
  //   · `sections` → `renderPrompt()`（`:113-115`）→ `system/message`，**派生历史第 0 条**。
  // ⇒ 组长那一份「每天开工第一步」走 `sections`（数组第 0 位）：它要出现在请求的**开头**，
  //   而 `contexts` 那条整条就排在第 N 条，前面压着审批策略 / 老板那句话 / 风格 / AGENTS.md。
  //   同一段**只留一份**：切给了 `sections` 就从 `contexts` 里摘掉（挪，不是加）。
  //
  // 🔴 位置为什么在这个钩子里改、不在 `apply()` 里 `systemPrompt.section()` 注册一段：
  //    `assemble()` **先**求值段正文（`:339-347`）、**后**发这个 waterfall（`:355`）⇒
  //    注册式的 `text()` 拿不到"本次装配判出来的岗位"，子会话第一次装配会把组长这四步发给组员。
  //    钩子里 `role` 是当场算的，不会错位。
  // 🔴 位置为什么不靠改 `leaderOrder`：那张名单管的是"快照里放哪几节、按什么次序"，
  //    而这一段离请求开头近不近，跟快照内部次序无关 —— 两条通路不在一条队列里。
  // ─────────────────────────────────────────────────────────────
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()

    // 没有作用域的装配不是会话，跳过。
    if (context === null || context === undefined || context.scope === undefined) return result

    const agentId = context.scope.id
    /**
     * 钉住 / 告警的去重键：**首选 `context.scope.id`**（与 `roleOfAgent` 同一把键）。
     * 它缺失 / 不是字符串时退回 `context.agent.id` —— 平台的 `scope` 形状会变（可能是数字、
     * 也可能没有 `id` 这个键），而"键拿不到 ⇒ 静默不钉"的代价是**同一个子会话下一轮掉回 row 5**
     * （无角色 + 窄 + 没有说明书）。两个 id 是**两个键**：这里只换 pin 的键，身份表仍用 `scope.id`。
     */
    const bridgeKey = typeof agentId === 'string' && agentId !== ''
      ? agentId
      : (typeof context.agent?.id === 'string' && context.agent.id !== '' ? context.agent.id : undefined)

    // ── 身份：档看会话头的 `agentPreset`，角色只看 `toolName`（定形 §2.2 的判定表）──────
    // 🔴 2026-11-01 第 4 关返修（A0a 结算）：**这里不再读 `【组员:<角色>】` 标记**。
    //    `role` 就是 `identity.role`，走哪一侧只看判定表的行号 —— 注入文本不再参与身份判定。
    //    两个作者会让"A0a 到底过没过"永远判不出来（标记与 toolName 产出同一个现象）。
    // 这里**只读不判权**：`identityVerdict()` 的结论进 `memberSessions` / `roleOfAgent` / `narrowSessions`，
    // 外加把 `warnings` 打出来（它是"最小永不取消件" —— 卡不交付它也照样出声）。
    const header = context.agent?.session?.header ?? context.scope?.session?.header ?? null
    const headerToolName = toolNameOf(header)
    // 🔴 **插件桥**：子会话头里没有 `toolName` 时，取父会话门禁那一刻记下的那一条。
    //    header 永远优先（头里有名字 ⇒ 一个字都不动、也不消费队列）；四条门在 `bridgeTakeClaim` 里。
    //    取到的名字要**再核一次**在角色表里：不在就当没取到 —— 别把它塞进 `identityVerdict()`
    //    制造 row 2（那是"这个工具名不该被注册"的拒，不是这一条会话该有的结论）。
    //    并行派工时子会话启动先后不定 ⇒ 用**子会话自己的第一条用户消息**对号（prompt 是父→子
    //    唯一稳定的对应物），对不上才退回队列顺序。
    const childPrompt = firstUserPromptOf(context.agent?.session ?? context.scope?.session)
    const claimedToolName = headerToolName === null ? bridgeTakeClaim(header, bridgeKey, childPrompt) : null
    const usableClaim = claimedToolName !== null && ROLE_ENTRY_BY_TOOL.has(claimedToolName)
      ? claimedToolName
      : null
    const rawToolName = headerToolName ?? usableClaim
    /** 这个名字是谁给的 —— A0a 那一行必须自报（没有它，`row=4` 分不出"平台修好了"和"桥在兜"）。 */
    const toolNameSource = headerToolName !== null ? 'header' : (usableClaim !== null ? 'parent-call' : 'none')
    const identity = identityVerdict({
      preset: presetKindOf(header),
      toolName: rawToolName,
      defaultRole: declaredTier,
      worker: workerKindOf(header),
      legacy: isLegacySession(typeof agentId === 'string' ? agentId : null, await legacySnapshot()),
    })
    // 角色 = 判定表给的（唯一作者）。没有就是**没有** —— 不许从别处补，也不许拿它猜。
    const role = typeof identity.role === 'string' ? identity.role : undefined
    // 走哪一侧注入：**只看判定表的行号，row 3（组长）是唯一组长侧**。
    //   · row 3 = 组长预设 + 没有工具名 ⇒ 组长自己：`leaderOrder` + 开工四步 + 全条记忆；
    //   · **其余每一行都走组员侧**（row 0 内部 worker / 0.5 旧会话 / 1·2 该被拒的 / 4–7 组员与未知预设）——
    //     认不出的、拦不住的、旧会话**一律不许**拿到组长那份上下文（`persona` / `leader.md` /
    //     `style.md` / 全条 `boss`·`machine`·`project`）与开工四步。
    //     ⚠️ 2026-11-01 第 4 关返修（第二轮评审 N-3）：row 0 / 0.5 原来是**组长侧**的 ——
    //        注释写着"只有 row 3 是组长侧兜底"而代码把这两行也算进去了。
    //        升级前的**组员**会话（row 0.5）因此会拿到组长的上下文；现在它们按组员侧走。
    //        代价照写：升级前的**组长**会话（也在 row 0.5 里）同样降级成组员侧注入 ——
    //        `isLegacySession()` 只认 id、分不出它当年是组长还是组员 ⇒ 安全的那一侧赢
    //        （丢一段上下文 ≠ 把老板的画像发给组员）。
    //   ⚠️ 工具那一侧**不跟着变**：row 0 / 0.5 仍然 `narrow === false`（base 工具集），
    //      见 `identityVerdict` 与 `CONTRACT-A` §5 —— 这一格只管**注入哪一侧**。
    const isMemberSide = identity.row !== 3

    // 登记这次开口的是谁 —— ③ 的门禁与 ⑤ 两条机制都靠这三张表认人。
    if (typeof agentId === 'string') {
      // ⚠️ 这张表管的是**语气**（⑤ 的两条机制：组员一条都不贴），口径与"注入哪一侧"同一格：
      //    只有 row 3（组长）不在这张表里 ⇒ 其余每一行（含 row 0 / 0.5）都不贴组长的语气。
      if (isMemberSide) memberSessions.add(agentId)
      if (role !== undefined) roleOfAgent.set(agentId, role)
      if (identity.narrow === true) narrowSessions.add(agentId)

      // 🔴 **A0a 的一次性读数**：**按形状各打一次**，形状 = **名字从哪来**（`toolName_source`），
      //    不是"第一个组员会话"那一次。为什么按形状拆：
      //      · 手动开的组员会话（README 说"不要手动选"，但拦不住）**也没有** `toolName`
      //        （2026-11-01 第二轮评审 N-8）—— 它会先把"第一个组员会话"那一格吃掉，
      //        真正的派工子会话反而一声不响，gate 5 于是把一个**手动会话**的 row=5 读成"A0a 没过"。
      //      · `header` / `parent-call` 的形状 = **决定性读数**（角色真的从工具名来了）；
      //        `none` 的形状 = **不决定性**：手动会话 / 派工但 toolName 没到 / 内部 worker /
      //        旧会话在这一版同形 —— 这一行明说它"不是 A0a 判定行"。
      //    两格分开记 ⇒ 决定性那一行永远不会被手动会话占掉；失败方向也不会变成"一声不响"。
      //    ⚠️ 措辞必须与 `toolName_source` 同一件事：行里说「带 toolName」就得**会话头**里真有它；
      //       桥兜来的名字不是"头里带"（按名字来源分形状，就不会说出那句假话）。
      if (isMemberSide) {
        const probeShape = toolNameSource
        if (!identityProbes.has(probeShape)) {
          identityProbes.add(probeShape)
          const decisive = toolNameSource !== 'none'
          console.error(`[agenia] A0a 身份读数（第一个组员侧会话 · toolName_source=${toolNameSource}`
            + `${decisive ? ' —— 判定行' : ' —— 不是判定行'}）：`
            + `row=${identity.row}`
            + ` · preset=${JSON.stringify(presetKindOf(header))}`
            + ` · header.agentPreset=${JSON.stringify(header?.agentPreset ?? null)}`
            + ` · header.origin=${JSON.stringify(header?.origin ?? null)}`
            + ` · header.parentSession=${JSON.stringify(header?.parentSession ?? null)}`
            + ` · header.toolName=${JSON.stringify(header?.toolName ?? null)}`
            + ` · toolName=${JSON.stringify(rawToolName)}`
            + ` · role=${JSON.stringify(role ?? null)}`
            + ` · role_from_toolName=${rawToolName !== null && role !== undefined}`
            + ` · toolName_source=${toolNameSource}`
            + ` · narrow=${identity.narrow === true}`
            + ` · header_keys=${JSON.stringify(header === null || header === undefined ? [] : Object.keys(header))}`
            + (decisive
              ? ''
              : ' —— 这一行**分不出**"手动开的组员会话 / 派工子会话但 toolName 没到 / 内部 worker / 旧会话"，A0a 的判定请读**带 toolName 的那一行**'))
        }
      }

      // 身份报警：一个会话只喊一次。`rejected` 那两行（row 1 / 2）在**子会话这一侧**才看得见，
      // 拒绝本身发生在建会话那一刻（框架那边），这个文件只能出声 —— 别把它读成"已经拦住了"。
      if (!warnedIdentity.has(agentId) && (identity.rejected || identity.warnings.length > 0)) {
        warnedIdentity.add(agentId)
        for (const warning of identity.warnings) console.error(`[agenia] 身份（row ${identity.row}）：${warning}`)
        if (identity.rejected) {
          console.error(`[agenia] 身份（row ${identity.row}）：这个会话按契约应当被拒（${identity.code}）——`
            + ' 拒绝点在起会话那一侧，这个文件只出声，拦不住它。')
        }
        // A0a 探针的读数（定形 §2.2）：组员预设 + 认不出角色 ⇒ 说清**这一条**会话为什么没角色。
        // 两种形状分开说（复审 F-02）：有 `parentSession` ⇒ 桥该管这一格，失败在**队列**；
        // 没有它 ⇒ 手动开的组员会话 / 内部 worker / 旧会话，失败在"会话头里根本没有名字"。
        // ⚠️ 只说"这个会话"，不说"这一版框架"；这一行只描述当下这一条会话头。
        if (identity.row === 5) {
          const parentSession = header?.parentSession
          if (typeof parentSession === 'string' && parentSession !== '') {
            console.error(`[agenia] A0a：这个会话来自通用组员预设，有 parentSession（${parentSession}），`
              + '但**桥没取到 claim** ⇒ 角色认不出（row 5：无角色 + 窄）。岗位人设与说明书这一轮都没有注入。'
              + ' 要查的是父会话的队列（`BRIDGE_CLAIMS`，只在内存里），不是会话头。')
          } else {
            console.error('[agenia] A0a：这个会话来自通用组员预设，但它的会话头里没有 toolName'
              + ' ⇒ 角色认不出（row 5：无角色 + 窄）。岗位人设与说明书这一轮都没有注入。')
          }
        }
      }

      // 🔴 **未受管 · 认不出**（`CONTRACT-A` §5.1 的诚实读数；第二轮评审 N-9 改的判据）。
      //    ⚠️ **旧的判据是 `header.origin === 'subagent'`，它是死代码**：2026-11-01 实测子会话头里
      //    连 `origin` 这个键都没有（`header_keys` 只有 `cwd` / `agentPreset` / `toolName`），
      //    那一行永远不会出。现在按**真存在的事实**判：不是组长那一行 + 会话头里没有 `toolName`
      //    + 会话头里没有 `origin` / `parentSession`（这一版不写它们）⇒ 谁起的**没有任何证据**。
      //    这一版框架也没有 workflow / ralph 的标记 ⇒ `identityVerdict` 的 row 0 在运行时**不可达**。
      //    所以这里只报**认不出**，不二选一；更不许把它说成"内部 worker 已经被记下来了"。
      if (unattributableSession(header, identity) && !warnedUnattributable.has(agentId)) {
        warnedUnattributable.add(agentId)
        console.error('[agenia] 未受管 · 认不出（unattributable）：会话头里既没有 toolName，也没有 origin / parentSession'
          + '（2026-11-01 实测：子会话头只有 cwd / agentPreset / toolName 这几个键）⇒ 认不出这条会话是谁起的 ——'
          + ' workflow / ralph 的内部 worker、工具起的子会话（toolName 没到）、手动开的组员会话、升级前的旧会话，'
          + `这一版**同形**（identity row=${identity.row}）。`
          + ' 这一版框架没有内部 worker 标记 ⇒ **row 0 在运行时不可达**（定形 §2.2 / §5 的"记一行"降级为这一行）；'
          + '这一行也不许读成"内部 worker 已被记录"。')
      }

      // ── 身份报警的**当天落点**（契约 C2 §4.2 #7/#8；裁定第 1 条）──────────────────
      // 状态条那两格（`unknown_preset` / `preset_downgrade`）读的是这个文件。`console.error` 那一行
      // 只活在当事会话里，卡看不见它 —— 两条载体各管一半，判定的档 / 角色 / narrow 一个都不动。
      {
        const nowMs = Date.now()
        const sessionLabel = typeof agentId === 'string' ? agentId : null
        const presetKind = presetKindOf(header)
        const alarms = []
        if (presetKind === 'unknown') {
          alarms.push({ kind: 'unknown', record: { session: sessionLabel, row: identity.row, preset: presetKind, toolName: rawToolName, at: new Date(nowMs).toISOString() } })
        }
        // 「预设降级」= 这一份预设**自己声明的档**与它该是的那一档对不上（缺 / 非法 / 不符三种形状）。
        // ⚠️ 它**不是**"降级交付"（`CONTRACT-A` §8.1：A 的二值只有交付 / 不交付）—— 这里只说预设自己的声明。
        if (presetKind === 'leader' || presetKind === 'member') {
          const tierAlarms = tierWarnings(presetKind, declaredTier)
          if (tierAlarms.length > 0) {
            alarms.push({ kind: 'downgrade', record: { session: sessionLabel, row: identity.row, preset: presetKind, default_role: declaredTier, message: tierAlarms.join(' · '), at: new Date(nowMs).toISOString() } })
          }
        }
        for (const alarm of alarms) {
          const wrote = await recordIdentityAlarm({ cwd: header?.cwd, nowMs, kind: alarm.kind, record: alarm.record })
          // 只报真正的失败；`not-a-workspace` / 已经记过 是正常形态，不出声（那会把真红淹掉）。
          if (!wrote.ok && (wrote.code === 'write-failed' || wrote.code === 'day-key-unavailable')) {
            console.error(`[agenia] 身份报警（${alarm.kind}）写不进 .team/state/identity/ —— `
              + `这一条只在会话里出声，卡上看不到：${wrote.reason}`)
          }
        }
      }
    }

    // 按角色裁工具目录（装配时的那一半；调用时那一半在 ③ 的 `roleToolVerdict`）。
    const catalog = toolCatalogFor(role, identity.narrow === true, result.tools)

    const entries = await gather(isMemberSide ? memberOrder : leaderOrder, {
      contentDir,
      role,
      leaderSide: !isMemberSide,
      board: undefined,   // F-94：板子不进快照（`boardOf` 改由 ⑤ 尾巴那条路贴）
      // 共享记忆库读不到时那几声（`memory` 那个 key）—— 同一个问题每个会话只喊一次。
      warn: warnOnce,
    })

    // ⚠️ 早退这条路也要带上裁好的目录：`entries.length === 0` 只说明没有 .md 可注，
    //    不代表"这一轮的工具目录不用按角色裁"（两份事实各走各的）。
    if (entries.length === 0) return { ...result, tools: catalog }

    // 「每天开工第一步」只给组长：组员侧（含 row 0 / 0.5）不读 `leader.md`，那四步是队伍设定，
    // 不是它的活。正文用 `gather` 刚读过的那一份，不另读一次盘 —— 读一次、用一次，两串不会分叉。
    const leaderText = isMemberSide
      ? undefined
      : entries.map((entry) => entry?.text).find((text) => openingBlockOf(text) !== undefined)
    const opening = openingBlockOf(leaderText)
    if (!isMemberSide && opening === undefined) {
      warnOnce('opening', `[agenia] 内容根的 ${OPENING_FILE} 里找不到「${OPENING_HEADING}」那一节 ——`
        + ' 开工四步这次不注入（其余照旧）。')
    }

    // 自己上一轮留下的先清掉，免得叠起来。
    const kept = (Array.isArray(result.contexts) ? result.contexts : []).filter(
      (entry) => typeof entry?.name !== 'string' || !entry.name.startsWith('agenia:'),
    )
    // 切给了 `sections` 的那一段从快照里摘掉 —— 整条 payload 里它只该有一份。
    const contexts = entries.map((entry) => {
      const text = typeof entry?.text === 'string' ? entry.text : ''
      return opening === undefined || !text.includes(opening)
        ? entry
        : { ...entry, text: withoutOpeningBlock(text) }
    })
    const keptContexts = [...kept, ...contexts]
    if (opening === undefined) return { ...result, tools: catalog, contexts: keptContexts }

    // 🔴 位置就是这一行：**`sections` 的数组第 0 位**（waterfall 的返回值就是权威值，`:355-356`）。
    // `interpolate: false`：这段正文是从 `.md` 抄来的散文，将来里面出现 `{{` 时框架会当成变量去求值，
    // 未知变量**直接抛**（`:167-170`）—— 整条请求跟着挂。散文不插值。
    return {
      ...result,
      tools: catalog,
      sections: [
        { name: OPENING_SECTION, text: opening, interpolate: false },
        ...(Array.isArray(result.sections) ? result.sections : []),
      ],
      contexts: keptContexts,
    }
  })

  // ─────────────────────────────────────────────────────────────
  // ⑥ 思考链清理（`F-148`）：在瀑布**内侧**改两个地方 —— 落盘的**不是** delta，是 `block-end` 的载荷。
  //
  // 为什么是两处（2026-10-23 14:4x 复核，四段代码连起来读的）：适配器自己攒了一份原文
  // （`dsh-llm-deepseek/lib/index.js` 的 `thinking_delta` ⇒ `content.text += text`），
  // `content_block_stop` 吐的 `block-end` 载荷带的就是它；而 `dsh-llm` 的 `assemble()` 第一句是
  // `if (partial.block) return partial.block` ⇒ **载荷优先**，delta 攒的那一份被整份丢掉。
  // ⇒ 只改 `reasoning-delta` 等于改了一个会被覆盖的字段：碎段照样落盘。
  //
  // 为什么在这儿：`dsh-agent-loop` 拿到流之后 `live.push(chunk)`，`live.blocks()` 才被写成
  // `assistant/message` 的 `content` ⇒ 在瀑布内侧清掉，会话流 / GUI 历史 / 以后的重放看到的
  // 都是清完的。口径（单元表 · 围栏状态机 · 流式不变式）全在 `CONTRACT.md` §10，这里只做接缝。
  //
  // 🔴 必须是 `async function*`：返回值被 `for await (const chunk of llm.stream(request))` 直接消费，
  //    写成普通 `async` 函数返回 Promise 会当场 `TypeError` —— 那不是"过滤没生效"，是"回答整个没了"。
  // 🔴 改的是一个 delta、一份载荷，各走各的路，别混：
  //    ① `reasoning-delta.text`（流里那一份）—— 用 `push()` 逐段落判；
  //    ② `block-end` 的 **reasoning 载荷**（落盘那一份）—— 用 `stripShortParagraphs()` **整份重算**
  //       （不拿 delta 那份 filter 状态去推：适配器在某些协议下只给载荷、一个 delta 都不吐）；
  //    ③ 收尾次序：尾巴必须在 `finish` **之前**吐出去 —— `finish` 之后 `dsh-agent-loop` 不再要 chunk。
  // 🔴 正文（`block.type === 'text'` 的载荷）/ 工具调用 / 用量 **同一个对象** 原样透传，一个字节不动。
  // 🔴 过滤这一步的任何异常都吞掉：出事的 chunk 原样放行、流继续、同一个调用里只出声一次 ——
  //    它住在每一条模型调用的内侧，抛一次就是整条流断，答案正文跟着一起没。
  // ⚠️ 参数 `options` 故意不读：这一层只用 `next()` 与 chunk（契约 §10.5 第 2 条）。
  // ⚠️ 纯逻辑那份**懒加载**（`await import()`），不是顶层静态 import —— 顶层静态 import 脑库会让
  //    "脑库一坏 ⇒ 人格注入 0 字符"（PFL-08 钉着这一条）。加载失败也不许拖垮对话：
  //    出声一次，然后这一层降级成原样放行（流照走、答案正文一个字节不动）。
  // ─────────────────────────────────────────────────────────────
  const reasoningFilter = import('./lib/reasoning-filter.mjs').catch((error) => {
    console.error(
      '[agenia] F-148 思考链过滤器加载不了（lib/reasoning-filter.mjs），这一层降级为原样放行：'
        + String(error && error.message ? error.message : error),
    )
    return null
  })

  ctx.on('llm/stream', async function* (options, next) {
    const stream = await next()
    const module = await reasoningFilter
    // 模块不在（上面已经出过声）⇒ 什么都不改，把流原样交出去。
    if (module === null) {
      for await (const chunk of stream) yield chunk
      return
    }
    const filter0 = module.createReasoningFilter()
    /**
     * 🔴 **一块一份状态**（`F-149`）：`filter` 每次 `block-end` 之后换一份新的。
     * 围栏状态（`inFence`）与半行缓冲都是**块内**的事 —— 一块的 reasoning 在没闭合的围栏里
     * 结束时，若继续用同一份 filter，下一块的碎段会被"围栏里 ⇒ 无条件保留"，而下一块落盘的
     * 载荷是用 `stripShortParagraphs`（每块新判）算的 ⇒ **流里吐的与落盘的对着**。
     */
    let filter = filter0
    const stripShortParagraphs = module.stripShortParagraphs
    // 尾巴那条 chunk 的 index：delta 那条路用**最后见过**的 index；`block-end` 那条路用它**自己的** index
    // （载荷就是按这个 index 落的，尾巴排在它前面，两者同属这一块）。
    let lastIndex
    /**
     * 🔴 `F-149`：见过 `finish` 之后**不再替上游加工、也不再吐尾巴**。
     * 流末尾那次 `flush()` 是给"没有 `finish` 的协议"（delta-only）留的；`finish` 已经来过
     * 还收一次，就会在 `finish` **之后**再吐一条 `reasoning-delta`（客户端已经被告知流结束了）。
     */
    let finished = false
    let afterFinish = 0
    let warned = false
    /** 一个 `llm/stream` 调用里不论出错几次，只喊一次（同一个问题刷满日志就等于没说）。 */
    const complain = (error) => {
      if (warned) return
      warned = true
      console.error(
        '[agenia] F-148 思考链过滤出错，这一条 chunk 原样放行（后面的照旧过滤）：'
          + String(error && error.message ? error.message : error),
      )
    }
    const isObject = (value) => value !== null && typeof value === 'object'
    /** 这一条 `block-end` 是不是**落盘那一份** reasoning 载荷（正文块的载荷不算）。 */
    const isReasoningPayload = (chunk) => isObject(chunk) && chunk.type === 'block-end'
      && isObject(chunk.block) && chunk.block.type === 'reasoning'
      && typeof chunk.block.text === 'string'
    /**
     * 把 filter 里攒着的那一段（还没被 `\n` 终结的）吐成一条 `reasoning-delta`；空 ⇒ `null`（不吐空 chunk）。
     * `index === undefined` = 一条 reasoning-delta 都没见过 ⇒ 没有尾巴可吐。
     */
    const tailOf = (index) => {
      if (index === undefined) return null
      let tail = ''
      try {
        tail = filter.flush()
      } catch (error) {
        complain(error)
        return null
      }
      return tail === '' ? null : { type: 'reasoning-delta', index, text: tail }
    }

    for await (const chunk of stream) {
      // `finish` 之后：流已经结束了 —— **不再交付任何 chunk、也不再吐尾巴**（`F-149`）。
      // 上游在此之后还给东西是违约；本层不替它编、也不替它转，只出声一次。
      if (finished) {
        afterFinish += 1
        if (afterFinish === 1) {
          console.error('[agenia] F-149 `llm/stream` 在 `finish` 之后还收到了 chunk —— 已丢弃（流已经结束，'
            + '上游不该再给；这一条之后的同类不再逐条报）')
        }
        continue
      }
      let out = chunk
      try {
        if (isObject(chunk) && chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
          lastIndex = chunk.index
          out = { ...chunk, text: filter.push(chunk.text) }
        } else if (isReasoningPayload(chunk)) {
          // 这一块到此为止：先把尾巴吐在它前面，再改写落盘的那份载荷。
          const tail = tailOf(chunk.index)
          if (tail !== null) yield tail
          out = { ...chunk, block: { ...chunk.block, text: stripShortParagraphs(chunk.block.text) } }
          // 下一块从零开始算（围栏状态 / 半行缓冲都不许跨块 —— `F-149`）。
          filter = module.createReasoningFilter()
        } else if (isObject(chunk) && chunk.type === 'finish') {
          // 尾巴排在 `finish` 之前 —— 它后面不会再有人来取 chunk。
          const tail = tailOf(lastIndex)
          if (tail !== null) yield tail
          finished = true
        }
      } catch (error) {
        complain(error)
        out = chunk
      }
      yield out
    }

    // 没有 `finish` 的协议（delta-only）：到流末尾再收一次；已经收过就是空串，不会重复吐。
    // ⚠️ 只在**没见过 `finish`** 时才收（`F-149`：这是"条件收"，不是"无条件收"）。
    if (!finished) {
      const tail = tailOf(lastIndex)
      if (tail !== null) yield tail
    }
  })

  // ─────────────────────────────────────────────────────────────
  // ④ 进度提醒的第二半：老板一开口，就是新的一票，账清零。
  //
  // ⚠️ **它必须排在文件最后，而且必须排在 ⑤ 那个 `session/event` 监听器后面。**
  //    理由不是执行次序（`session.id` 各记各的，两条互不影响），是**读代码的人**：
  //    探针的静态判据取的是**文件里第一处** `ctx.on('session/event'` 到下一个
  //    `ctx.on('` 之间那一段，用来判"机制① 的记账段里没有任何注入调用"（口径 1）。
  //    把这条跟尾巴无关的监听器放在前面，那一段就会横跨整段尾巴代码 —— 判据还在，
  //    量的东西却变了。**要挪它之前先读这句话。**
  // ─────────────────────────────────────────────────────────────
  ctx.on('session/event', (session, event) => {
    if (event === null || event === undefined || event.type !== 'user/message') return
    if (event.data?.source?.kind !== 'user') return
    const id = session === null || session === undefined ? undefined : session.id
    if (typeof id === 'string') ledgers.delete(id)
  })
}
