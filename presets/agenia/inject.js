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
 *      看这一步领到的 messages。贴出去的是「`style.md` 的尾巴那一段」+「情绪板」
 *      （分数行 + 命中的场景例子），两条机制都带。
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
import { readFileSync, realpathSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
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
 * @roster memory=absent work-guidelines=present charter=present
 *
 * 成员语义见 `CONTRACT.md §7`。
 */
const DEFAULT_MEMBER_ORDER = ['work-guidelines', 'charter']

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
 * 组员上岗时，岗位配置那一行会在它的人设最前面留一枚标记。
 * 认这枚标记，就知道"这次开口的是谁"。
 */
const ROLE_MARK = /【组员:([a-z0-9][a-z0-9-]*)】/

/** 只有这两个工具的参数里写着"要写到哪儿"。 */
const WRITE_TARGET = { write: 'file_path', edit: 'file_path' }

/** 一条通用命令行就是一条通用写入通道。受限岗位不能留着它。 */
const SHELL = ['bash', 'pwsh']

/**
 * 团队的办公桌：**`resolve(cwd, '.team')` 这一棵子树**（含它自己）。受限岗位只能写这里。
 *
 * 🔴 判据是 **containment**（追加裁定 v1.7 · B4），不是"解析后的路径里含 `.team` 段"：
 *    段匹配在"cwd 自己就在某个 `.team` 之下"时会把外面误判成里面
 *    （实测：夹具 `AGENIA_TEST_WORKSPACE` = `E:\Harness\.team\test\…` ⇒ `ws\x.md` 被放行）。
 *    语义与 `lib/paths.mjs` 的 `resolveWithin` 一致：先 `resolve` 吃掉 `..`，
 *    盘上存在再 `realpath` 吃掉 junction/symlink（AGENTS.md 3e：路径判断必须算落点）。
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
 * 长期记忆那几节正文。**按受众分流**（组长 = 三类全条 + 索引；组员 = 只有索引）。
 *
 * ⚠️ 条数、类型名全从**真的注进去的那些条目**里数出来，**不读快照自带的 `distribution`** ——
 *    那个数与"这一份里到底有什么"是两件事：万一跳过了坏条目，读它就会写出一个假数。
 */
function memorySections(version, file, entries, role) {
  const ofType = (type) => entries.filter((entry) => entry.type === type)
  const inventory = MEMORY_TYPES.map(([type]) => `${type} ${ofType(type).length}`).join(' · ')
  const isLeader = role === undefined
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
 * @param role 岗位名；`undefined` = 组长。
 * @param warn `warnOnce(key, message)`；没给就退回 `console.error`（**出声不许省**）。
 */
async function sharedMemoryText(contentDir, role, warn) {
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
  } else if (role !== undefined) {
    // F-89：组员照旧（他们是一次性作业，很多活不到 10 个工具结果 ⇒ 走尾巴等于永远不看常识）；
    // 组长改走 ⑤ 那一刀（`commonSenseOf`），这里不 push。
    blocks.push(`## 共享记忆 · 常识\n\n${sense.text.trim()}`)
  }

  const snapshot = await currentSnapshotOf(root, say)
  if (snapshot !== undefined) {
    blocks.push(...memorySections(snapshot.version, snapshot.file, snapshot.entries, role))
  }

  return blocks.length === 0 ? undefined : blocks.join('\n\n')
}

/** 按 order 里写的顺序，把该给这一拨人的内容一份份读出来。 */
async function gather(order, { contentDir, role, board, warn }) {
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
      const text = await readText(join(contentDir, 'team', `${role}.md`))
      if (text !== undefined) out.push({ name: `agenia:charter:${role}`, text })
      continue
    }
    if (key === 'board') {
      if (board !== undefined) out.push({ name: 'agenia:board', text: board })
      continue
    }
    if (key === MEMORY_KEY) {
      const text = await sharedMemoryText(contentDir, role, warn)
      if (text !== undefined) out.push({ name: 'agenia:memory', text })
      continue
    }
    const text = await readText(join(contentDir, `${key}.md`))
    if (text !== undefined) out.push({ name: `agenia:${key}`, text })
  }
  return out
}

/** 这次开口的是哪个岗位？没有标记就是组长。 */
function roleOf(assembly) {
  const sections = Array.isArray(assembly === null || assembly === undefined ? undefined : assembly.sections)
    ? assembly.sections
    : []
  for (const section of sections) {
    if (typeof section?.text !== 'string') continue
    const hit = ROLE_MARK.exec(section.text)
    if (hit !== null) return hit[1]
  }
  return undefined
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
 * 这个路径落在团队的办公桌上吗？
 *
 * 三条口径（追加裁定 v1.7 · B4）：
 *   · **先算落点再比** —— 先 `resolve`（吃掉 `..` 与 `.`），盘上存在再 `realpath`；
 *     只匹配字符串的话，`.team/review/../../x.txt` 里含有 `.team/` 却落在项目根；
 *   · **containment** —— 落点要在 `resolve(cwd, '.team')` 之下（含相等与子目录）才算组内；
 *   · **空目标 · 解析不出 cwd · 落点在 C 盘** ⇒ 一律算"不在组内"（C 盘是本机硬禁区）。
 *
 * ⚠️ 它与活体那版（段匹配）**语义不同**，是有意的收紧，安装后由 R1 验。
 */
function landsInOffice(target, agent) {
  if (typeof target !== 'string' || target.length === 0) return false
  const cwd = agent === null || agent === undefined ? undefined : agent.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd.trim().length === 0) return false
  const landing = canonicalPath(resolve(cwd, target))
  if (driveOfPath(landing) === 'C:') return false
  return isUnder(landing, canonicalPath(resolve(cwd, OFFICE_DIR)))
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
 *   · `write` / `edit` 按**落点**判：落点要在 `resolve(cwd, '.team')` 之下才放行
 *     （containment，追加裁定 v1.7 · B4 —— `landsInOffice` 那一节写着三条口径）。
 */
export function officeBoundVerdict(role, toolName, args, agent, officeBoundSet) {
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
  if (landsInOffice(target, agent)) return null

  return {
    code: 'E_GUARD_OFFICE_WRITE',
    message: `你的岗位（${role}）只能写项目里 .team/ 下面的东西。`
      + `你这次要写的是「${String(target)}」，按落点算在你的地盘外面。`
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
// 判决岗（`memory-judge`）提不了候选这件事**不在这个文件里**：它在 `agent.cordis.yml`
// 那一行的 `toolFilter.deny` 里（结构性：它的工具集里根本没有这个工具，不是"调用被拒"）。
// 🔴 这个文件里**不许**按"调用者是谁"做判断 —— 那是新发明一条身份判定。
// ─────────────────────────────────────────────────────────────

/**
 * 工具名。
 * ⚠️ 与 `tools/proposal-file.mjs` 的 `PROPOSAL_FILE_TOOL_NAME` 是**同一个字**；这里只能写字面量，
 * 因为注册发生在 `apply()` 里，而那个模块**不许**在顶层 import（理由见下面 `proposalFileToolModule`）。
 */
const PROPOSAL_FILE_TOOL = 'proposal_file'

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
  const KNOWN_CONFIG = ['leaderOrder', 'memberOrder', 'officeBound', 'contentDir', DELEGATION_TOOLS_KEY, 'proposalFile']
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
  // ③ / ④ / ⑤ 都要知道"这个 agent 是哪个岗位"，这张表就是它们之间的桥。
  // 表在装配时登记（那里才知道角色），门禁、台账、尾巴提醒按编号来查。
  // ─────────────────────────────────────────────────────────────
  const roleOfAgent = new Map()

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
    if (!called('test') && called('dev')) {
      lines.push('⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。')
    } else if (ledger.afterTest > 0) {
      lines.push(`⚠️ 最后一次测试之后，项目文件又动过 ${ledger.afterTest} 次 —— 那次测试作废，要重测。`)
    }
    if (called('review') && ledger.afterReview > 0) {
      lines.push(`⚠️ 最后一次评审之后，项目文件又动过 ${ledger.afterReview} 次 —— 那次评审作废，要重审。`)
    }
    return lines.join('\n')
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
    if (landsInOffice(target, call.agent)) return
    ledger.afterTest += 1
    ledger.afterReview += 1
  })

  // ④ 进度提醒的第一半在下面那个 `tools/result` 里；第二半（老板开口 ⇒ 账清零）
  // 排在文件最后 —— 为什么必须排在 ⑤ 后面，那儿写着。

  // ─────────────────────────────────────────────────────────────
  // ③ 岗位边界 + 后台硬门。**同一道门禁里两条判定，次序是定的：**
  //   ① 后台硬门（`subagentBackgroundVerdict`）先判 —— 它对**所有角色**都生效；
  //   ② 岗位写边界（`officeBoundVerdict`）后判 —— 认不出岗位的一律放行。
  //   ⚠️ **次序别倒过来**：受限岗位若先被岗位判定放行/拒绝，就轮不到后台硬门了，
  //      而 GRD-01 要的正是"门禁覆盖所有角色"。（真正的语义证明只能靠 R1 真挂载，
  //      这里这条只是文件序代理 —— 追加裁定 v1.1 · A15。）
  // ─────────────────────────────────────────────────────────────
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
          const role = typeof id === 'string' ? roleOfAgent.get(id) : undefined
          const office = officeBoundVerdict(role, toolName, args, who, officeBound)
          return office === null ? undefined : office.message
        }),
      'agenia：岗位写权限边界 + 后台硬门',
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
  // 🔴 2026-10-19（DSH 0.2.1）：`proposalFile: false` = 这一份预设**按设计**就没有提候选这个工具。
  //   判决岗（memory-judge）用它 —— 老板 2026-10-17 的原话：「判决应该不能提候选，
  //   其他这几个应该都可以自己提候选」。0.2.1 之前这条靠 `toolFilter.deny` 实现，
  //   那条路没了（`toolFilter` 删了）⇒ 改成让这个工具**根本不注册**（结构性，不是"调用被拒"）。
  //   ⚠️ 只有判决岗那一份组员预设带它；其余预设不写这个键 ⇒ 照常注册。
  const proposalFileEnabled = config.proposalFile !== false
  if (!proposalFileEnabled) {
    // 有意不装：不出声（这是配置要的结果，不是失败）。
  } else if (tools !== undefined && typeof tools.register === 'function') {
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
  // ⑤ 尾巴提醒 + 情绪板 —— 两条机制**同一个落点**：`agent/pre-step` 里往本步的
  //   `decision.messages` 塞一条。贴出去的是「`style.md` 的尾巴那一段 + 情绪板」。
  //
  // ① 那一套是**快照**：DSH 只在快照文本变了才重发一条，文本不变时人格就钉在
  // 上一次变化的位置上。2026-09-24 实测钉了 **4 小时 15 分 / 45 万 token** ——
  // 那一次老板质问她，她没还嘴也没带表情；查下来人格根本没丢，是**离得太远、太旧**。
  //
  // 这一条补上"真的每轮"。触发点**只有两个**（2026-09-25 老板定：就这两个，别加第三个）：
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
  // 认人用装配时登记的那份岗位（`roleOfAgent`，第 ② 件事那张表）——
  //   机制② 在 pre-step 那一刻认出是组员 ⇒ 整条丢；
  //   机制① 也按同一份登记整条丢掉（工具结果一定发生在首次装配之后：模型得先被装配出来
  //   才会去调工具，所以来得及）。
  // ⚠️ **装配排在 `agent/pre-step` 前面**（L890 早于 L894）⇒ 到 pre-step 那一刻，角色是现成的。
  // ⚠️ 关的是**语气**，不是**身份** —— 那枚 `【组员:xxx】` 标记还要给第 ② 件事分流用。
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

    // 组员：机制①② 都不成立，整条丢掉（口径 16）。认的是装配时登记的那份岗位。
    if (roleOfAgent.has(id)) return

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
  function commonSenseOf() {
    let raw
    try {
      raw = readFileSync(join(contentDir, RUNTIME_DIR, COMMON_SENSE_FILE), 'utf8')
    } catch {
      raw = undefined
    }
    if (raw === undefined || raw.trim().length === 0) {
      warnOnce('tail-common-sense', `[agenia] 读不到 ${RUNTIME_DIR}/${COMMON_SENSE_FILE}（尾巴那一刀要贴的常识）`
        + ' —— 这一刀只贴风格。')
      return undefined
    }
    return `## 共享记忆 · 常识\n\n${raw.trim()}`
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
   *   2. `## 共享记忆 · 常识`（**只在 ① 到点那一刀**，F-89）—— 与第 3 段成对，要么都在要么都不在
   *   3. 时间行（**只在 ① 到点那一刀**，F-102）
   *   4. `【这一票的进度】`（**只在板子内容变了的时候**，F-94；一模一样就不贴）
   *   5. 情绪段（读得出来就拼在最后）
   */
  function tailBodyOf(id, { cut = false, board } = {}) {
    const parts = [styleOf().text]
    if (cut) {
      const sense = commonSenseOf()
      if (sense !== undefined) parts.push(sense)
      parts.push(timeLineOf(id, Date.now()))
    }
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
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (decision?.kind === 'reject') return decision

    const id = agent?.id
    if (typeof id !== 'string') {
      warnOnce('pre-step-agent', '[agenia] `agent/pre-step` 里拿不到 agent.id —— '
        + '两条尾巴机制都没有生效（老板开口之后不补语气，每 n 个工具结果也不补）。')
      return decision
    }
    if (roleOfAgent.has(id)) return decision            // 组员：一条都不贴

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
    // 它是**第二个触发理由**（不是 ① 的账）：项目文件又动过 ⇒ 板子变了 ⇒ 这一刀贴板子。
    const boardNow = boardOf(id)
    const boardChanged = boardNow !== undefined && boardNow !== lastBoardPosted.get(id)
    const byOne = !byTwo && pendingTail.has(id)
    if (!byTwo && !byOne && !boardChanged) return decision   // 这一步既不关 ②/① 的事、板子也没变

    pendingTail.delete(id)      // ② 赢下这一格 ⇒ ① 的挂账清掉；① 落地了也把账销掉
    if (boardChanged) lastBoardPosted.set(id, boardNow)

    const tail = tailBodyOf(id, { cut: byOne, board: boardChanged ? boardNow : undefined })
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

    // 登记这次开口的是谁 —— ⑤ 两条机制（还有 ③ 的门禁）都靠这张表认人。
    const role = roleOf(assembly) ?? roleOf(result)
    const agentId = context.scope.id
    if (typeof agentId === 'string' && role !== undefined) roleOfAgent.set(agentId, role)

    const entries = await gather(role === undefined ? leaderOrder : memberOrder, {
      contentDir,
      role,
      board: undefined,   // F-94：板子不进快照（`boardOf` 改由 ⑤ 尾巴那条路贴）
      // 共享记忆库读不到时那几声（`memory` 那个 key）—— 同一个问题每个会话只喊一次。
      warn: warnOnce,
    })

    if (entries.length === 0) return result

    // 「每天开工第一步」只给组长：组员不读 `leader.md`，那四步是队伍设定，不是它的活。
    // 正文用 `gather` 刚读过的那一份，不另读一次盘 —— 读一次、用一次，两串不会分叉。
    const leaderText = role === undefined
      ? entries.map((entry) => entry?.text).find((text) => openingBlockOf(text) !== undefined)
      : undefined
    const opening = openingBlockOf(leaderText)
    if (role === undefined && opening === undefined) {
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
    if (opening === undefined) return { ...result, contexts: keptContexts }

    // 🔴 位置就是这一行：**`sections` 的数组第 0 位**（waterfall 的返回值就是权威值，`:355-356`）。
    // `interpolate: false`：这段正文是从 `.md` 抄来的散文，将来里面出现 `{{` 时框架会当成变量去求值，
    // 未知变量**直接抛**（`:167-170`）—— 整条请求跟着挂。散文不插值。
    return {
      ...result,
      sections: [
        { name: OPENING_SECTION, text: opening, interpolate: false },
        ...(Array.isArray(result.sections) ? result.sections : []),
      ],
      contexts: keptContexts,
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
