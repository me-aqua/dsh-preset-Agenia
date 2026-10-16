/**
 * 会话包（REV-01）—— 读会话流 · 算评审窗口 · 打包 · 校验。
 *
 * 冻结依据（**照抄，不许改良**）：
 *   · 追加裁定 v1.5：四个导出（`readSessionStream` / `packetWindow` / `buildSessionPacket` /
 *     `validateSessionPacket`）· 包布局 `packet-<YYYYMMDD-HHmmss>-<packet_id 前 8>` ·
 *     manifest 那**十个**顶层字段（= 下面 `PACKET_MANIFEST_FIELDS` 那一张表，逐字同一份：
 *     `schema` / `packet_id` / `project` / `created_at` / `window` / `source_ids` / `excluded` /
 *     `frames` / `content_sha256` / `tool`）· 五个稳定码 · 坏帧不留半包。
 *     ⚠️ **2026-10-15 订正（只改数与措辞）**：这一句原来写的是"manifest 那**十一**个字段"——笔误。
 *        字段表 / 顺序 / 校验逻辑**一个字没动**：`PACKET_MANIFEST_FIELDS` 是十项，校验器判的也是这十项
 *        （把 `window` 拆成 `from`/`to` 才凑得出 11）。三方口径现在一致 = **10**。
 *   · 追加裁定 v1.6 ①：`<statusRoot>/route/current.json` 的 `reviews[]` 每项 `event:"complete"` +
 *     `occurred_at`(ISO8601) + `attempt`(正整数)；取 `event==="complete"` 里 `occurred_at` **最大**的一条，
 *     同一时刻取 `attempt` 最大；一条都没有 ⇒ `from:null`（含全部历史）。
 *   · 追加裁定 v1.6 ②：`sources` **必填数组**（`{session_id, project, file, last_event_at}`），
 *     三类排除 `other_project` / `self_review` / `outside_window`；**不进包的 source 不许被解压**；
 *     `sources: []` 是合法空包。
 *   · 追加裁定 v1.7（2026-10-15，**这一条是本文件唯一一次内容口径改动**）：`sources` 每项多一个
 *     **可选**的 `window: {from?: ISO8601|null, to?: ISO8601}`（下称**裁剪窗口**，名字与形状是这一批定的）：
 *       · **给了** ⇒ 只把该 source 里**落在窗口内的那些事件**放进包，窗口外的**一条都不进**。
 *       · 🔴 **`frames` 那四个读数的口径：给了裁剪窗口 vs 没给**（**含义变了，逐条写清**；
 *         不给裁剪参数时四条**逐字等于 v1.5/v1.10 ④ 的旧含义**）：
 *
 *         | 字段 | 没给裁剪（旧含义，**不变**） | 给了裁剪（v1.7 新含义） |
 *         | --- | --- | --- |
 *         | `count` | 整条流**一共几帧**（= 工具报的 `帧: N`，v1.10 ④ 多源求和） | **有贡献的帧数** = 至少留下 1 条事件的帧的个数（没有贡献的源记 0） |
 *         | `bytes` | 整条流**的压缩字节**（= 文件字节，v1.10 ④ 多源求和） | 那些**有贡献的帧**的压缩字节之和（**不是**整条流的字节；"解了多少压缩字节"看得到，但一帧只要留了一行就整帧计入） |
 *         | `first_frame_chars` | 该源**第一帧**（工具报的帧 0）解出来的字符数 | 该源**第一个有贡献的帧**里**留下来的那几行**的字符数 |
 *         | `all_chars` | 整条流解出来的全部字符数 | **留下来的全部内容**的字符数（口径仍照 §B3.4，没变） |
 *
 *         ⇒ "同一块数据不许有两个意思"：**这四条只在"给没给裁剪窗口"上分叉，且分叉写在上面这张表里**；
 *         两种口径下的内容字符数（`all_chars`）都恒等于 `content.jsonl` 的字符数（校验器照旧钉这一条）。
 *       · **没给 ⇒ 一个字节都不许变**。判据（2026-10-15 实测）：把 2026-10-15 那份 68,094,717 B 的包
 *         按原 `now` 重造，`content_sha256` 仍是 `55f7ba51…8cf517`、`frames` 仍是
 *         `5098 / 19009485 / 567 / 53656859`。
 *       · 窗口与**包窗口**求交（包窗口的 `from` / `to` 是上界，v1.6 ① 的口径不动）；交集为空 ⇒
 *         `E_PACKET_WINDOW`（`from` 缺省 / `to` 缺省都按包窗口那一侧补齐）。
 *       · 🔴 **裁的是"事件"，不是"整帧"** —— 实测（2026-10-15，三条真实流）：5098 帧装着 9354 个事件
 *         （**1.86 事件/帧**，单帧最多 19 个；一帧的时间跨度最长 0.2 秒、中位 0 ms）。
 *         "一帧 = 一个事件"**不成立**（4 帧夹具解出来也是 5 行）⇒ 按整帧裁会在任意边界上把边界那一帧里
 *         另一半事件一起带进来/丢出去（实测最坏 18 条）。所以这里按**每一行事件自己的时间戳**判窗口：
 *         优先事件里的 `time`（v4 会话格式的 ms 数），会话头那一行读 `createdAt`；逐行决定去留，
 *         留下来的行**逐字节原样**进包。
 *       · 🔴 **怎么切到"行"这一层的（不许自造解压器，纪律 ① 照旧）**：仍然只调现成工具
 *         `.tools/asar-cli/zstd-frames.mjs`（子进程），**不 import `node:zlib`、不自己算帧边界**。
 *         工具已经把每一帧"实解 N B"报了出来（`runFramesTool` 逐帧解析、且核过"逐帧实解之和 = 落盘字节数"）
 *         ⇒ 按这些**工具报的字节数**做前缀和，就把工具吐出来的那份拼接文本切回"一帧一段"；
 *         帧内再按 `\n` 切行。**判断用的只有工具给的数**：本文件没有一处按魔数/块头自己找帧。
 *         （同一只手艺 v1.10 已经用过一次：`firstFrameChars` 就是按工具报的 `偏移/总长` 抠首帧那一段。）
 *       · 为什么加这一条（老板原话，2026-10-15）：
 *         「那肯定不能每天开一个新会话，我哪怕口头答应你行动上也很难保证，你得自己去切分了」
 *         ⇒ "一条流 ≈ 一天"是**机器的责任**，不是人的纪律。原来最小单位是整条流 ⇒ 一条跨三天的流
 *         会把前两天的历史一起塞进"今天那份包"（实测 68 MB 里今天只占 16.3 M 字符）。
 *     ⚠️ **v1.7 明确"没动"的（改冻结口径时逐条点名，下一个人照着看边界）**：
 *       ① manifest 的**十个顶层字段**（`PACKET_MANIFEST_FIELDS`）—— 一个没加、一个没减；
 *       ② `validateSessionPacket` 的**五项校验与判定顺序** —— 一行没动；
 *       ③ **三类排除**（`other_project` / `self_review` / `outside_window`）—— 枚举、顺序、语义都没动
 *          （裁剪窗口只**多用**了一次 `outside_window`：该源最后一个事件都在窗口之前 ⇒ **分类期**就排除，
 *          照旧**一个字节都不解**）；
 *       ④ **坏帧不留半包**（`E_PACKET_FRAMES`）· **原子落盘**（`outDir` 内的 token 格整目录改名）·
 *          **先分类、后解压**（被整条排除的源零解压）· **临时件落点**（v1.10 ⑤）· **五个稳定码** ·
 *          **字符口径**（§B3.4）—— 全部原样，一行没动；
 *       ⑤ 裁剪的账（每源留了几条 / 丢了几条 / 几行没有时间戳 / 生效窗口）**不进 manifest**
 *          （那十个字段不能动），走 `buildSessionPacket` 的返回值 `cropped` 与本 op 的 audit —— 盘上有据可查。
 *   · 追加裁定 v1.8（2026-10-16，**本文件第二次内容口径改动**）：`sources` 每项多一个**可选**的
 *     `human: true`（下称**人话过滤**；名字与形状是这一批定的）。它与 v1.7 的 `window` **正交** ——
 *     两个可以同时给，谁也不改写谁：
 *       · **给了 `true`** ⇒ 这条源**只留两类行**进包，其余一行不留：
 *         ① **老板的行**（`source.kind === 'user'`）—— **原样进包，一个字都不投影**；
 *         ② **每个 turn 的最后一条 `assistant`** —— **投影到 D 档**（见下）。
 *         判据落在**行**上（跟 v1.7 同一个粒度）；turn 这一层在**整条流**上判（见 `filterStream`）。
 *       · **没给 / 给了 `false`** ⇒ **与 v1.7 逐字相同**（判据见下面那张翻面表）。
 *       · 🔴🔴 **D 档 = 保证的降级，不是措辞变化**（组长 2026-10-15 逐字拍的，
 *         `.team/dev/2026-10-15/log.md` §32.7）：
 *
 *         | | 这份包对"字节"的保证 |
 *         | --- | --- |
 *         | v1.5 ~ v1.7 | **包里的字节 = 流里的原样字节**（留下的行逐字节原样） |
 *         | **v1.8 起 · 开了 `human` 的源** | 降成两条：**① 每行的 `text` 段逐字等于原流里那一行的 `text` 段**（解析之后 code point 序列相同）；**② 每行带 `seq` + `time` ⇒ 可回查**（拿 `seq` 回原流里找那一行） |
 *
 *         ⇒ 一句话：**开了 `human` 之后，"包里的字节 = 流里的字节"这句话不再成立。**
 *         组长的行是**投影**（只减不增 —— 留下的每个字都是原字，但原行里别的字段没进包）。
 *         **引用这份包的字节之前，先知道这一条。**
 *         ✅ 唯一**没降级**的地方：**老板那几行原样进包**（他的一言是最该保真的部分；
 *         他的消息里带 `image` 段 —— 投影会把图丢掉 ⇒ 所以这一侧一个字都不投影）。
 *       · **D 档到底留什么**（**白名单**：列出留什么，而不是"删掉哪几个字段"—— 删法哪天多一个
 *         字段就漏一个）。键序**也是契约的一部分**（同一输入 ⇒ 逐字节可复现，判据装置按它独立重造）：
 *
 *         ```
 *         {type, seq, time, data:{turn, step, message:{role, id,
 *          source:{kind, provider, model}, content:[{type:"text", text}]}}}
 *         ```
 *
 *         丢掉的是（逐条点名）：`content` 里的 `reasoning` 段 · `content` 里的 `tool-call` 段 ·
 *         `data.stream` · `data.usage` · `message.source.replayState` · 事件顶层的 `surfaceOp`。
 *         ⚠️ 其中 `surfaceOp` 是"白名单式投影"顺手去掉的 —— 它**不在**"留什么"那张单子里，
 *         所以它不进包（这一条写在这里，免得下一个人以为它是漏掉的）。
 *       · 三条边界（**逐字照拍，不许自己重新想**）：
 *         ① **未闭合 turn**（造包那一刻她正回着话）⇒ **(a) 不取**，`human` 账上写明。
 *            (b) 会取到"准备调工具前那一句"—— 那正是要排除的东西；(c) 是死锁（这条会话永远在跑）。
 *         ② 组长的行 ⇒ **D 档**（见上）。
 *         ③ **没 text 的 turn**（`aborted` / `error`）⇒ **记 0 条、不占位**。
 *            占位是伪造："他说话了、但内容是空"。
 *            ⚠️ 本文件的口径：**没有 `text` 段**、**或** `text` 段拼起来是空串，两种都算"没 text"
 *            （后者进包就是一行空话）。实测那三条真实流：只有前一种（0 条空串）。
 *       · 顺带一条**操作纪律**（组长 2026-10-15 拍）：**造包要在"会话空着"的时候**
 *         （开工第一步就是那个时刻）。**别在对话进行中造包** —— 那会撞上①。
 *       · 账：`human`（**在 `cropped` 旁边**）—— 逐源 + 合计；口径 = 对**裁剪之后剩下的那批行**数
 *         （**先裁后筛**：`cropped.kept_events` 说"窗口留了几条"，`human` 说"筛完留了几条"，
 *         两把账各说各的、不许互相借数）。`manifest` 那**十个**顶层字段**一个都不动**。
 *
 *         ```
 *         scanned_lines = kept_lines + dropped_non_last_assistant + turns_without_text
 *                       + dropped_unclosed_assistant + injected_lines + other_message_lines + non_message_lines
 *         kept_lines    = boss_lines + last_output_lines
 *         assistant_lines = last_output_lines + turns_without_text + dropped_non_last_assistant
 *                         + dropped_unclosed_assistant
 *         ```
 *
 *         ⇒ 这三行是**账自己闭合**的判据（哪天它对不上，就是某一格漏了或重了）。
 *     ⚠️ **v1.8 明确"没动"的**（照 v1.7 那条的写法逐条点名）：① manifest 的十个顶层字段；
 *       ② `validateSessionPacket` 的五项校验与判定顺序；③ 三类排除（枚举 / 顺序 / 语义）；
 *       ④ 坏帧不留半包 · 原子落盘 · 先分类后解压 · 临时件落点 · 五个稳定码 · 字符口径；
 *       ⑤ **不给 `human` 时一个字节都不许变**（判据：拿 v1.7 那三个用例重造，`content_sha256`
 *       与 `frames` 四条逐字相同 —— 见 `.team/dev/2026-10-16/log.md`）。
 *     ⚠️ **已知缺口（写给下一个读的人）**：人话过滤之后包里**只有**上面那两类行 ⇒
 *       **会话头那一行（`type:"session"`）不进包**，而它是"这条流从哪开始"的唯一标记。
 *       三条流的行是**按 `sources` 顺序首尾相接**的 ⇒ 段与段的界线要靠每行的 `time` 与
 *       `human.sources[].kept_lines` 去对。**这是 v1.8 的已知缺口**，怎么处置归组长（不在这批里）。
 *   · 提案 §B3.4：字符口径 = 去 BOM + `\r\n`/`\r`→`\n` + Unicode code point，不 trim、不做 NFC。
 *     ⚠️ 这个口径**只有一份实现**（B1.5 冻在 `lib/memory.mjs` 的 `charCountOf`），这里 import 它 ——
 *     不在本文件里再写第二份，否则同一份文本会在两个地方数出两个数。
 *
 * 四条纪律：
 *   ① **帧边界与解压只走现成工具** `.tools/asar-cli/zstd-frames.mjs`，而且是**子进程**调：
 *      那个脚本有顶层副作用（import 就会执行）⇒ 本模块一次都不 import 它，
 *      也一次都不 import `node:zlib`、不自己算帧边界（不然就是"自造解压器"）。
 *   ② **坏帧 / 截断 ⇒ 抛 `E_PACKET_FRAMES`，不吐半截**；临时件在 `finally` 里清掉。
 *   ③ **先分类、后解压**：被判排除的 source 一个字节都不解 —— 排除项上的坏帧不许把整包拖红。
 *   ④ **原子落盘**：包**本体**先写在 `outDir` 内的 `.packet-tmp-<id>/packet/`，两个文件都写好了、
 *      自校验过了，才整目录改名（`rename` 同卷 ⇒ 原子）。失败 ⇒ 临时目录清掉、**一个半包都不留**。
 *
 * 🔴 **临时件落点（追加裁定 v1.10 ⑤ 的红线）**：**源流目录一律只读** —— 任何情况下不许往源流所在目录
 *    （真实运行 = `~\.dsh\sessions\…`）写文件，**包括现成工具的 `--json-out`**。落点按序、每一格都显式：
 *     ① `AGENIA_SCRATCH_DIR`（若给）：帧工具的输出落 `<它>/.packet-tmp-<id>/`；包本体照旧暂存在
 *        `outDir` 内（原子改名要求同卷）—— 两格都在 `finally` 里清掉；
 *     ② 没给：**一格搞定** —— `<outDir>/.packet-tmp-<id>/`（帧工具的输出与包本体都在它下面）；
 *     ③ **裸读路径**（`readSessionStream(file)`：只有一个参数、没有 outDir）⇒ 进程临时根 `TEMP` / `TMP`；
 *        🔴 解析出来是 **C 盘 / UNC** ⇒ 抛 `E_TXN_IO`，**一个字节都不写** ——
 *        "临时件默认落 C 盘"正是这一票要修的形状，不许在这里复活。
 *    ⇒ **临时件不要求与源流同卷**：原子性只由"包写在 `outDir` 内再改名"保证。
 *
 * `frames` 的**多源合成口径**（追加裁定 v1.10 ④ 冻死）：`count` / `bytes` / `first_frame_chars` /
 *   `all_chars` = **各纳入源之和**（`first_frame_chars` = 每个源"只解第一帧"的字符数之和）；
 *   **单源时逐字等于 v1.5 的定义**（4 帧夹具那一格：`count=4 · bytes=259 · first_frame_chars=33 · all_chars=94`）。
 */
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { now as clockNow } from './clock.mjs'
import { charCountOf } from './memory.mjs'

/** manifest 的 schema 标签（v1.5 逐字）。 */
export const PACKET_SCHEMA = 'agenia.session-packet/1'

/**
 * 五个稳定码（v1.5 逐字）。
 * ⚠️ 它们是 `validateSessionPacket` 的**返回码**，不是 CLI 退出码 ⇒ 没有进 `lib/error-codes.mjs`
 *    （那份表管 CLI 退出码族）。哪天有 CLI 暴露它们，同批搬进那张表。
 */
export const PACKET_CODES = Object.freeze({
  MANIFEST: 'E_PACKET_MANIFEST',
  FRAMES: 'E_PACKET_FRAMES',
  CONTENT_SHA: 'E_PACKET_CONTENT_SHA',
  WINDOW: 'E_PACKET_WINDOW',
  EXCLUDE: 'E_PACKET_EXCLUDE',
})

/** 三类排除原因（v1.5 / v1.6 ② 的枚举）。 */
export const EXCLUDE_REASONS = Object.freeze(['other_project', 'self_review', 'outside_window'])

/** manifest 的必填字段（v1.5 的字段表；多一个少一个都算不合）。 */
export const PACKET_MANIFEST_FIELDS = Object.freeze([
  'schema', 'packet_id', 'project', 'created_at', 'window', 'source_ids',
  'excluded', 'frames', 'content_sha256', 'tool',
])

/** 现成帧工具（相对仓库根；staging 与装好之后的层级不同，所以往上找而不是写死相对路径）。 */
const ZSTD_TOOL_REL = path.join('.tools', 'asar-cli', 'zstd-frames.mjs')

/** 临时目录前缀（本模块建的私有临时件；清理前按它认"这是我建的"）。 */
const PACKET_TMP_PREFIX = '.packet-tmp-'

/**
 * 临时件的家（追加裁定 v1.10 ⑤ 点名的 env）。
 * **本模块不自创落点、也不读别的 env 当默认**：给了就用它；没给就走 `outDir` 或进程临时根
 * （那一格**拒绝 C 盘**）—— 见文件头那张序表。
 */
const SCRATCH_DIR_VAR = 'AGENIA_SCRATCH_DIR'

/** 沿模块目录往上找现成工具；找不到 ⇒ `null`（**不回落自造解压**）。 */
function findZstdTool() {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(dir, ZSTD_TOOL_REL)
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

// ── 临时件落点（v1.10 ⑤ 红线）────────────────────────────────────────────────

/**
 * 临时件的家白名单：**C 盘与 UNC 一律拒绝**（抛 `E_TXN_IO`，一个字节都不写）。
 * 这不是"以防万一"：原来那一版的临时件落在**源流所在目录**，真实运行就是 C 盘的 `~\.dsh\sessions\…`。
 */
function assertWritableScratch(dir, from) {
  if (/^[Cc]:[\\/]/.test(dir)) {
    throw packetError('E_TXN_IO', `临时件的家解析到了 C 盘（来自 ${from}）—— 一个字节都不写：${dir}；请给 ${SCRATCH_DIR_VAR}`)
  }
  if (dir.startsWith('\\\\') || dir.startsWith('//')) {
    throw packetError('E_TXN_IO', `临时件的家不许是 UNC（来自 ${from}）：${dir}`)
  }
  return dir
}

/**
 * 给了 `AGENIA_SCRATCH_DIR` ⇒ 返回它的绝对路径（并拒绝 C 盘 / UNC）；
 * **没给 ⇒ `null`** —— 打包路径据此改用 `outDir` 里那一格，裸读路径据此改用进程临时根。
 */
function givenScratchRoot(env = process.env) {
  const given = env?.[SCRATCH_DIR_VAR]
  if (typeof given !== 'string' || given.trim() === '') return null
  return assertWritableScratch(path.resolve(given.trim()), SCRATCH_DIR_VAR)
}

/**
 * **裸读路径**（`readSessionStream(file)`：没有 outDir 可挂）的临时根：
 * `AGENIA_SCRATCH_DIR` ⇒ 否则进程临时根 `TEMP` / `TMP`。
 * 两个来源都不成形状 ⇒ **抛**（不回落"当前目录"这类说不清的地方 —— 说不清就别写）。
 */
function scratchRootFor(env = process.env) {
  const given = givenScratchRoot(env)
  if (given !== null) return given
  const temp = [env?.TEMP, env?.TMP].find((v) => typeof v === 'string' && v.trim() !== '')
  if (temp === undefined) {
    throw packetError('E_TXN_IO', `裸读路径没有可用的临时根：请给 ${SCRATCH_DIR_VAR}（或让 TEMP / TMP 指到非 C 盘）`)
  }
  return assertWritableScratch(path.resolve(temp.trim()), 'TEMP / TMP')
}

/** 在 `parent` 下**独占**建一格临时目录（撞名即炸，绝不覆盖别人的东西）；建不出来 ⇒ `E_TXN_IO`。 */
function makeTempDir(parent) {
  const root = path.resolve(String(parent))
  try {
    mkdirSync(root, { recursive: true })
    const dir = path.join(root, `${PACKET_TMP_PREFIX}${process.pid}-${randomBytes(5).toString('hex')}`)
    mkdirSync(dir)
    return dir
  } catch (err) {
    throw packetError('E_TXN_IO', `临时件那一格建不出来（${err?.code ?? 'UNKNOWN'}）：${root} —— ${String(err?.message ?? err)}`)
  }
}

/** 带码的错 —— 帧那一族的码由 v1.5 冻结，参数/IO 两个码是既有表里的同族码（见文件头）。 */
function packetError(code, message, detail) {
  const err = new Error(message)
  err.name = 'PacketError'
  err.code = code
  err.detail = detail ?? null
  return err
}

/** ISO8601 的毫秒数；解不出 ⇒ `null`（调用方决定怎么出声）。 */
function msOf(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (typeof value !== 'string' || value.trim() === '') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** `now` 参数：字符串原样用；`Date` 转 ISO；缺 ⇒ 走可注入时钟（**不许在业务逻辑里摸 `Date.now()`**）。 */
function isoOf(value) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return clockNow().toISOString()
}

/** 包目录名里的时间戳：`<YYYYMMDD>-<HHmmss>`，取 `now` 字面量上的那个钟点。 */
function stampOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(iso))
  if (m) return `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) throw packetError('E_ARG_SCHEMA', `now 必须是 ISO8601：${JSON.stringify(iso)}`)
  return at.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}

const sha256Of = (buf) => createHash('sha256').update(buf).digest('hex')

/** 读一份 JSON；不在 / 读不出 / 不是 JSON ⇒ `null`（窗口是"没有评审记录"这种合法态）。 */
function readJsonSoft(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// ── 帧：只走现成工具（子进程）────────────────────────────────────────────────

/** 一行一帧的读数；`tail` 里会出现工具自己打的 ❌ / ⚠️ 标记。 */
const FRAME_LINE = /^\s*帧\s+(\d+):\s*偏移\s+(\d+)\s*·\s*总长\s+(\d+)\s*B\s*·\s*块\s+(\d+)\s*·\s*声明解压\s+(\S+)\s*·\s*实解\s+(\d+)\s*B(.*)$/

/**
 * 跑一次现成工具，把它解出来的文本落到 `outFile`。
 * 任何"读不动"的形状（工具非 0 退出 / 输出形状不认识 / 帧报了 ❌ / 逐帧字节数与落盘文件对不上）
 * ⇒ 抛 `E_PACKET_FRAMES`。**绝不返回半截**。
 */
function runFramesTool(tool, file, outFile) {
  const res = spawnSync(process.execPath, [tool, file, '--json-out', outFile], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  const where = `${path.basename(file)}`
  if (res.error) throw packetError(PACKET_CODES.FRAMES, `现成帧工具起不来（${where}）：${String(res.error.message)}`)
  const out = String(res.stdout ?? '')
  if (res.status !== 0) {
    throw packetError(PACKET_CODES.FRAMES, `现成帧工具退出码 ${res.status}（${where}）—— 帧坏了/截断了：${String(res.stderr ?? '').trim().slice(0, 200)}`)
  }
  const declared = /^字节:\s*(\d+)\s+帧:\s*(\d+)\s*$/m.exec(out)
  if (declared === null) throw packetError(PACKET_CODES.FRAMES, `现成帧工具的输出形状不认识（没有"字节/帧"那一行）：${where}`)
  if (!/^合计:\s*\d+\s*字符/m.test(out)) throw packetError(PACKET_CODES.FRAMES, `现成帧工具没报"合计 … 字符"（多帧拼接那一路没走通）：${where}`)
  const frames = []
  for (const m of out.matchAll(new RegExp(FRAME_LINE.source, 'gm'))) {
    frames.push({ index: Number(m[1]), offset: Number(m[2]), bytes: Number(m[3]), outBytes: Number(m[6]), tail: m[7] ?? '' })
  }
  const frameCount = Number(declared[2])
  if (frames.length !== frameCount) {
    throw packetError(PACKET_CODES.FRAMES, `工具声明 ${frameCount} 帧、逐帧只打印出 ${frames.length} 帧 —— 输出不完整（${where}）`)
  }
  const bad = frames.find((f) => f.tail.includes('❌') || f.tail.includes('⚠️'))
  if (bad !== undefined) {
    throw packetError(PACKET_CODES.FRAMES, `第 ${bad.index} 帧坏了（工具报了 ${bad.tail.includes('❌') ? '解压失败' : '声明解压数与实解数不符'}）：${where}`)
  }
  if (!existsSync(outFile)) throw packetError(PACKET_CODES.FRAMES, `工具没有把解出来的文本落到 ${outFile}（${where}）`)
  const buf = readFileSync(outFile)
  const outBytes = frames.reduce((n, f) => n + f.outBytes, 0)
  if (outBytes !== buf.length) {
    throw packetError(PACKET_CODES.FRAMES, `逐帧"实解"合计 ${outBytes} B 与落盘文本 ${buf.length} B 对不上 —— 有帧没进内容（${where}）`)
  }
  return { text: buf.toString('utf8'), buf, frames, count: frameCount, bytes: Number(declared[1]) }
}

/** 首帧那一段字节单独喂给同一个工具 ⇒ 首帧字符数（**不自己解压**，只按工具报的边界抠字节）。 */
function firstFrameChars(tool, src, stem, first) {
  const sliceFile = path.join(stem, 'first-frame.zstd')
  const outFile = path.join(stem, 'first-frame.txt')
  const buf = Buffer.alloc(first.bytes)
  const fd = openSync(src, 'r')
  try {
    let filled = 0
    while (filled < buf.length) {
      const n = readSync(fd, buf, filled, buf.length - filled, first.offset + filled)
      if (n <= 0) break
      filled += n
    }
    if (filled !== buf.length) throw packetError(PACKET_CODES.FRAMES, `首帧那一段没读全（${filled}/${buf.length} B）：${src}`)
  } finally {
    closeSync(fd)
  }
  writeFileSync(sliceFile, buf)
  const r = runFramesTool(tool, sliceFile, outFile)
  if (r.count !== 1) throw packetError(PACKET_CODES.FRAMES, `首帧那一段应当只有 1 帧，工具读成 ${r.count} 帧：${src}`)
  return charCountOf(r.text)
}

/**
 * 读一条会话流，把帧这一层的读数一起带回来（`readSessionStream` 只是它的 `.text`）。
 *
 * 🔴 `scratchParent`（v1.10 ⑤）：**临时件只落调用方给的这一格**（打包路径给的是
 * `<outDir>/.packet-tmp-<id>/`，或 `AGENIA_SCRATCH_DIR` 那一格）；不给 ⇒ 自己按 `scratchRootFor()`
 * 找一格，并连格一起清掉 —— **源流所在目录一个字节都不写**。
 *
 * @param {string} file 会话流（多帧 zstd）的路径
 * @param {string|null} [resolvedTool] 现成帧工具（打包路径解一次、每条源复用）
 * @param {string|null} [scratchParent] 临时件落点的父目录；`null` ⇒ 裸读路径自己找
 * @returns {{text:string, buf:Buffer, frames:Array<{index:number,offset:number,bytes:number,outBytes:number,tail:string}>,
 *            count:number, bytes:number, first_frame_chars:number, tool:string}}
 *   ⚠️ `buf` / `frames` 是 v1.7 加的**只读副产品**（裁剪要按"工具报的每帧实解字节数"切文本）；
 *      不裁剪时一个都不碰，所以旧读数的字节不受影响。
 */
function readStreamDetail(file, resolvedTool = null, scratchParent = null) {
  const src = path.resolve(String(file ?? ''))
  if (file === undefined || file === null || String(file).trim() === '' || !existsSync(src)) {
    throw packetError(PACKET_CODES.FRAMES, `会话流文件不在：${src}`)
  }
  const tool = resolvedTool ?? findZstdTool()
  if (tool === null) {
    throw packetError(PACKET_CODES.FRAMES, `现成帧工具不在（沿模块目录往上找 ${ZSTD_TOOL_REL}）—— 帧边界没法定，不许自造解压器`)
  }
  const parent = scratchParent === null ? scratchRootFor() : path.resolve(String(scratchParent))
  const stem = makeTempDir(parent)
  try {
    const r = runFramesTool(tool, src, path.join(stem, 'frames.txt'))
    const first = r.frames.length > 1 ? firstFrameChars(tool, src, stem, r.frames[0]) : charCountOf(r.text)
    return { text: r.text, buf: r.buf, frames: r.frames, count: r.count, bytes: r.bytes, first_frame_chars: first, tool }
  } finally {
    removeTempDir(stem, parent) // 成功 / 失败都清（清理前校验落点；清不掉会在 stderr 出声）
  }
}

/**
 * 读一条会话流的**全帧拼接文本**（v1.5）。
 * 帧边界与解压都在子进程里（现成工具）；坏帧 / 截断 ⇒ 抛 `E_PACKET_FRAMES`，**不吐半截**。
 * 临时件落 `AGENIA_SCRATCH_DIR`（若给）⇒ 否则进程临时根（**C 盘一律拒绝**），用完即清（v1.10 ⑤）。
 *
 * @param {string} file 多帧 zstd 流的绝对路径
 * @returns {string}
 */
export function readSessionStream(file) {
  return readStreamDetail(file).text
}

// ── 按窗口裁一条流（追加裁定 v1.7）────────────────────────────────────────────

/**
 * 一条事件自带的时间戳（ms）。v4 会话格式里**普通事件**用 `time`（epoch 毫秒数），
 * **会话头那一行**（`type:"session"`）只有 `createdAt`（同样是 ms）⇒ 两种都认。
 * 都没有 ⇒ `null`（由调用方决定：当"没有时间"处理，**不硬猜**）。
 */
function eventMsOf(obj) {
  if (obj === null || typeof obj !== 'object') return null
  if (typeof obj.time === 'number' && Number.isFinite(obj.time)) return obj.time
  if (typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt)) return obj.createdAt
  return null
}

// ── 消息体的形状（v1.8 人话过滤要认"这是谁说的"）──────────────────────────────

/**
 * 取一条事件的**消息体**。v4 会话流里两种装法**都存在**（实测三条真实流）：
 *   · `assistant/message` / `tool/result` / `system/message` ⇒ 装在 `data.message` 里；
 *   · `user/message` ⇒ v4 把它**直接摊在 `data` 上**（`data` 自己就有 `role`）。
 * ⇒ 两条路都要认；都不是 ⇒ `null`（这一行没有"谁说的"这回事，比如 `turn/start`）。
 * ⚠️ 认"老板的话"看 `message.source.kind`，**不看 `role`** —— `tool/result` 的 `role` 也可以是
 *   `'user'` 一族（实测：`role==='user'` 的行里有 97 行是机制塞的注入文本）。
 */
function messageOf(obj) {
  const data = obj?.data
  if (data === null || typeof data !== 'object') return null
  const inner = data.message
  if (inner !== null && typeof inner === 'object' && inner.role !== undefined) return inner
  if (data.role !== undefined) return data
  return null
}

/** 消息里的**正文段**（`type:"text"`，按原序）。内容不是数组/是字符串都按这一条收敛到一种形状。 */
function textPartsOf(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []
  return content.filter((part) => part?.type === 'text')
}

/**
 * 一条消息的正文（`text` 段拼起来）。**空串算"没有"** —— 见文件头 v1.8 裁定 ③
 * （进包就是一行"他说话了、但内容是空"的占位）。
 */
function humanTextOf(msg) {
  const parts = textPartsOf(msg?.content)
  if (parts.length === 0) return null
  const text = parts.map((part) => part.text ?? '').join('')
  return text === '' ? null : text
}

/** `source.human`（v1.8）的形状：`true` / `false` / 缺省。别的形状 ⇒ 当场抛（不静默当 false）。 */
function humanFlagOf(source) {
  const raw = source?.human
  if (raw === undefined || raw === null || raw === false) return false
  if (raw === true) return true
  throw packetError('E_ARG_SCHEMA', `source.human 只能是 true / false（v1.8），实得 ${JSON.stringify(raw)}`)
}

/**
 * 把一条源的**生效裁剪窗口**算出来（v1.7）。
 *
 * 形状（名字与形状是本批定的，写进文件头 v1.7）：
 *   `source.window = { from?: ISO8601|null, to?: ISO8601 }` —— 两个键都可省：
 *   `from` 省 / `null` ⇒ 用**包窗口**的 `from`（包窗口也没有 ⇒ 不设下界）；
 *   `to` 省 ⇒ 用**包窗口**的 `to`。
 *
 * 🔴 **与包窗口求交**（包窗口的 `from`/`to` 是上界，v1.6 ① 的口径不动）：
 *    包窗口说"这次评审之后"，裁剪窗口就**不许**把评审之前的字节带回来 —— 那样 manifest 的
 *    `window` 就在说谎。交集为空 ⇒ `E_PACKET_WINDOW`（`window` 那一族的稳定码，不新造码）。
 *
 * @returns {{from:string|null, to:string, fromMs:number|null, toMs:number}|null} `null` = 这条源不裁
 */
function cropWindowOf(source, packetWin) {
  const raw = source?.window
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw packetError('E_ARG_SCHEMA', `source.window 必须是 {from,to}（v1.7）：${JSON.stringify(raw)}`)
  }
  const rawFrom = raw.from === undefined ? null : raw.from
  const rawTo = raw.to === undefined ? packetWin.to : raw.to
  if (rawFrom !== null && msOf(rawFrom) === null) {
    throw packetError('E_ARG_SCHEMA', `source.window.from 必须是 ISO8601 或 null（v1.7），实得 ${JSON.stringify(raw.from)}`)
  }
  const cropToMs = msOf(rawTo)
  if (cropToMs === null) {
    throw packetError('E_ARG_SCHEMA', `source.window.to 必须是 ISO8601（v1.7），实得 ${JSON.stringify(rawTo)}`)
  }
  const cropFromMs = msOf(rawFrom)
  const packetFromMs = msOf(packetWin.from)
  const packetToMs = msOf(packetWin.to)
  // 求交：下界取晚的那个、上界取早的那个（null = 那一侧不设界）
  const fromMs = packetFromMs === null ? cropFromMs : (cropFromMs === null ? packetFromMs : Math.max(cropFromMs, packetFromMs))
  const toMs = packetToMs === null ? cropToMs : Math.min(cropToMs, packetToMs)
  if (fromMs !== null && fromMs > toMs) {
    throw packetError(
      PACKET_CODES.WINDOW,
      `source.window 与包窗口没有交集（裁剪 [${rawFrom ?? 'null'} → ${rawTo}] · 包窗口 [${packetWin.from ?? 'null'} → ${packetWin.to}]）—— ` +
        '包窗口是上界（v1.6 ①），裁剪不许把评审之前的字节带回来',
    )
  }
  return {
    from: fromMs === null ? null : new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    fromMs,
    toMs,
  }
}

// ── 行级过滤：窗口裁（v1.7）+ 人话筛（v1.8）────────────────────────────────────

/**
 * 一行归到哪一类（v1.8 的人话过滤用）。
 * ⚠️ 只有 `BOSS` 与 `LAST_OUTPUT` 两种会进包（"只留两类行"）；其余全是**丢**，
 *    各自记进 `human` 账里对应的那一格 —— 账必须能自己闭合（见文件头那三行算式）。
 * ⚠️ 静态判据读整份源码：下面这张表的**取值**才是判据，注释里的名字只是给人看的。
 */
const LINE_KIND = Object.freeze({
  OTHER_LINE: 0, // 不带消息体的行（turn/start · tool/call · 会话头 · 送达回执 …）
  BOSS: 1, // 老板的话 —— 原样进包
  LAST_OUTPUT: 2, // 每个 turn 的最后一条 assistant（闭合 · 有 text）—— 投影到 D 档
  ASSISTANT_NON_LAST: 3, // 同一个 turn 里非最后的那几条（"准备调工具前那一句"）
  TURN_WITHOUT_TEXT: 4, // 闭合 turn 的最后一条 assistant 没有 text ⇒ 记 0 条、不占位
  ASSISTANT_OPEN_TURN: 5, // 未闭合 turn 里的 assistant ⇒ 一律不取（裁定 ①）
  INJECTED: 6, // `role` 是 user 一族但不是老板（语气尾巴 / 快照 / 作业书 … 机制塞进来的）
  OTHER_MESSAGE: 7, // 其它带消息体的行（role=tool 的工具结果 · role=system 的提示词 …）
})

/** `human` 账里要逐项求和的格（顺序即账面顺序；`samples` 不参与求和）。 */
const HUMAN_COUNT_KEYS = Object.freeze([
  'scanned_lines', 'kept_lines', 'boss_lines', 'boss_bytes', 'last_output_lines', 'last_output_bytes',
  'assistant_lines', 'dropped_non_last_assistant', 'turns_without_text', 'injected_lines',
  'unclosed_turns', 'dropped_unclosed_assistant', 'other_message_lines', 'non_message_lines',
])

/**
 * D 档的说明牌 —— **跟着账一起回去**。
 * 🔴 `manifest` 那十个顶层字段不许动 ⇒ **"这是投影、保证降级了"这句话挂在账上**
 *    （`human` 进返回值与本 op 的 audit：命令的 stdout 与盘上的审计链里都看得见）。
 */
const HUMAN_PROJECTION = Object.freeze({
  level: 'D',
  keeps: Object.freeze([
    'type', 'seq', 'time', 'data.turn', 'data.step', 'data.message.role', 'data.message.id',
    'data.message.source.kind', 'data.message.source.provider', 'data.message.source.model',
    'data.message.content[type=text].text',
  ]),
  drops: Object.freeze([
    'data.message.content[type=reasoning]', 'data.message.content[type=tool-call]',
    'data.stream', 'data.usage', 'data.message.source.replayState', 'surfaceOp',
  ]),
  guarantee: '每行的 text 段逐字等于原流里那一行的 text 段；每行带 seq + time ⇒ 可回查',
  downgrade: 'v1.8 起「包里的字节 = 流里的原样字节」只对老板那几行成立；组长的行是投影（只减不增）',
})

/** 逐源账求和（`human.totals`）：只加数字格。 */
function humanTotalsOf(reports) {
  const totals = {}
  for (const key of HUMAN_COUNT_KEYS) totals[key] = reports.reduce((sum, item) => sum + (item?.[key] ?? 0), 0)
  return totals
}

/**
 * 把一条 assistant 行**投影**成 D 档（v1.8）。
 *
 * 🔴 **白名单**：只搬 `HUMAN_PROJECTION.keeps` 那张单子上的键，其余一概不留 ——
 *    "列出留什么"比"删掉哪几个字段"稳：哪天原行多一个字段，删法会漏、白名单不会。
 * 🔴 **键序是契约的一部分**：
 *    `{type, seq, time, data:{turn, step, message:{role, id, source:{kind, provider, model}, content}}}`
 *    —— 同一份输入必须逐字节复现（独立判据装置就是按这个键序重造的）。
 * ⚠️ 原行没有的键**不凭空补**（只减不增）；`content` 里只留 `text` 段、每段只留 `type` + `text`。
 */
function projectHumanEvent(obj) {
  const msg = messageOf(obj) ?? {}
  const rawSource = msg.source !== null && typeof msg.source === 'object' ? msg.source : {}
  const source = {}
  if (rawSource.kind !== undefined) source.kind = rawSource.kind
  if (rawSource.provider !== undefined) source.provider = rawSource.provider
  if (rawSource.model !== undefined) source.model = rawSource.model
  const message = {}
  if (msg.role !== undefined) message.role = msg.role
  if (msg.id !== undefined) message.id = msg.id
  if (Object.keys(source).length > 0) message.source = source
  message.content = textPartsOf(msg.content).map((part) => ({ type: 'text', text: part.text ?? '' }))
  const data = {}
  if (obj?.data?.turn !== undefined) data.turn = obj.data.turn
  if (obj?.data?.step !== undefined) data.step = obj.data.step
  data.message = message
  return { type: obj?.type, seq: obj?.seq, time: obj?.time, data }
}

/**
 * 按生效窗口裁一条**已经解出来**的流（v1.7），需要的话再按"人话"筛一遍（v1.8）—— 一行一行过。
 *
 * 🔴 **不自己解压、不自己算帧边界**（纪律 ①）：只用工具报出来的每帧"实解 N B"做前缀和，
 *    把拼接文本切回"一帧一段"，帧内再按 LF 切行。切不齐（前缀和 ≠ 文本字节数）就当场抛
 *    —— 宁可红，不许按错位的边界裁。
 *
 * 🔴 **turn 这一层在"整条流"上判，不在裁剪之后的那几行上判**（v1.8 的要点）：
 *    `turn/start` / `turn/end` 可能落在窗口外（一个 turn 从窗口前开、在窗口里收尾）
 *    ⇒ 只拿裁剪剩下的行去认 turn，会把"闭合的 turn"误判成未闭合，白丢一条"最后输出"。
 *    ⇒ 判"最后一条"与"闭没闭合"看**整条流**；`human` 那把账只数**落进窗口**的那些行。
 *
 * 读数口径（写进文件头那张表）：`count` = 有贡献的帧数 · `bytes` = 这些帧的压缩字节 ·
 * `first_frame_chars` = 第一个有贡献的帧里**留下来的**那些行的字符数（投影过的行按投影后的字算）。
 *
 * @param {{buf:Buffer, frames:Array<{bytes:number,outBytes:number}>}} detail `readStreamDetail()` 的返回值
 * @param {{fromMs:number|null, toMs:number, from:string|null, to:string}|null} win 生效窗口；`null` = 只筛不裁
 * @param {boolean} human 要不要套人话筛（v1.8；`false` ⇒ 与 v1.7 逐字相同）
 * @returns {{text:string, count:number, bytes:number, first_frame_chars:number, kept_events:number,
 *            dropped_events:number, untimed_lines:number, untimed_samples:Array<object>,
 *            kept_lines:number, human:object|null}}
 */
function filterStream(detail, win, human) {
  const buf = detail.buf
  const frames = detail.frames
  const frameStart = new Array(frames.length)
  let cursor = 0
  for (let i = 0; i < frames.length; i += 1) {
    frameStart[i] = cursor
    cursor += frames[i].outBytes
  }
  if (cursor !== buf.length) {
    throw packetError(PACKET_CODES.FRAMES, `逐帧"实解"合计 ${cursor} B 与解出来的文本 ${buf.length} B 对不上 —— 帧边界切不开，不许硬裁（v1.7）`)
  }

  // ── 第一遍：切行 · 取时间戳 · （开人话时）判 turn 归属与"最后一条" ────────────────
  const starts = []
  const ends = []
  const times = []
  const lineFrames = []
  const kinds = human ? [] : null
  const turnOfLine = human ? [] : null
  const turns = []
  let openTurn = -1
  let framePtr = 0
  let scanStart = 0
  while (scanStart < buf.length) {
    const nl = buf.indexOf(0x0a, scanStart)
    const lineEnd = nl === -1 ? buf.length : nl + 1
    // 这一行落在第几帧：帧按顺序解、行起点单调 ⇒ 一个指针往后推就够（O(行数)）
    while (framePtr + 1 < frames.length && scanStart >= frameStart[framePtr + 1]) framePtr += 1
    const index = starts.length
    starts.push(scanStart)
    ends.push(lineEnd)
    lineFrames.push(framePtr)
    const lineText = buf.subarray(scanStart, lineEnd).toString('utf8')
    let obj = null
    try {
      obj = JSON.parse(lineText)
    } catch {
      obj = null
    }
    times.push(eventMsOf(obj))
    if (human) {
      // turn 归属的约定与 v1.7 的量具一致：`turn/start` 那一行**也算这个 turn 的**，
      // `turn/end` 那一行同样算在它闭合的那个 turn 里。
      const type = obj?.type ?? ''
      if (type === 'turn/start') {
        openTurn = turns.length
        turns.push({ turn: obj?.data?.turn ?? null, closed: false, reason: null, lastAssistant: -1, lastAssistantSeq: null, lastHasText: false, lastSeq: obj?.seq ?? null })
      } else if (openTurn >= 0) {
        turns[openTurn].lastSeq = obj?.seq ?? turns[openTurn].lastSeq
      }
      turnOfLine.push(openTurn)
      let kind = LINE_KIND.OTHER_LINE
      const msg = messageOf(obj)
      if (msg !== null) {
        if (msg?.source?.kind === 'user') {
          kind = LINE_KIND.BOSS // 老板的话：唯一**不投影**的一类
        } else if (msg.role === 'assistant') {
          kind = LINE_KIND.ASSISTANT_NON_LAST // 先按"非最后"记；这个 turn 收尾时再决定最后那条
          if (openTurn >= 0) {
            turns[openTurn].lastAssistant = index
            turns[openTurn].lastAssistantSeq = obj?.seq ?? null
            turns[openTurn].lastHasText = humanTextOf(msg) !== null
          }
        } else if (msg.role === 'user') {
          kind = LINE_KIND.INJECTED
        } else {
          kind = LINE_KIND.OTHER_MESSAGE
        }
      }
      kinds.push(kind)
      if (type === 'turn/end' && openTurn >= 0) {
        const t = turns[openTurn]
        t.closed = true
        t.reason = obj?.data?.reason?.kind ?? null
        if (t.lastAssistant >= 0) {
          // 裁定 ③：没有 text（含空串）⇒ 记 0 条、不占位；有 text ⇒ 这就是那条"最后输出"。
          kinds[t.lastAssistant] = t.lastHasText === true ? LINE_KIND.LAST_OUTPUT : LINE_KIND.TURN_WITHOUT_TEXT
        }
        openTurn = -1
      }
    }
    scanStart = lineEnd
  }

  const ledger = human
    ? {
        scanned_lines: 0,
        kept_lines: 0,
        boss_lines: 0,
        boss_bytes: 0,
        last_output_lines: 0,
        last_output_bytes: 0,
        assistant_lines: 0,
        dropped_non_last_assistant: 0,
        turns_without_text: 0,
        injected_lines: 0,
        unclosed_turns: 0,
        dropped_unclosed_assistant: 0,
        other_message_lines: 0,
        non_message_lines: 0,
        samples: { unclosed: [], without_text: [] },
      }
    : null
  const insideAt = (i) => {
    const ms = times[i]
    if (ms === null) return false
    if (win === null) return true
    return (win.fromMs === null || ms >= win.fromMs) && ms <= win.toMs
  }
  if (human) {
    // 裁定 ①：**没闭合**的 turn 一条都不取 —— 统一在这里改，免得"哪一条才是最后"分两处判。
    for (let i = 0; i < kinds.length; i += 1) {
      if (kinds[i] !== LINE_KIND.ASSISTANT_NON_LAST) continue
      const ti = turnOfLine[i]
      if (ti >= 0 && turns[ti].closed !== true) kinds[i] = LINE_KIND.ASSISTANT_OPEN_TURN
    }
    // 未闭合的 turn：只要它在窗口里**还有行**就记一笔 —— 哪怕一条 assistant 都还没来
    // （那正是"她正回着话"的形状）。账上写明，别让它静默消失。
    const openTurns = new Map()
    for (let i = 0; i < starts.length; i += 1) {
      const ti = turnOfLine[i]
      if (ti < 0 || turns[ti].closed === true || !insideAt(i)) continue
      const acc = openTurns.get(ti) ?? { lines: 0, assistant_lines: 0 }
      acc.lines += 1
      if (kinds[i] === LINE_KIND.ASSISTANT_OPEN_TURN) acc.assistant_lines += 1
      openTurns.set(ti, acc)
    }
    ledger.unclosed_turns = openTurns.size
    ledger.samples.unclosed = [...openTurns.entries()].slice(0, 5).map(([ti, acc]) => ({
      turn: turns[ti].turn,
      lines_in_window: acc.lines,
      assistant_lines_in_window: acc.assistant_lines,
      last_seq: turns[ti].lastSeq,
    }))
  }

  // ── 第二遍：定去留（先判窗口、再判人话）─────────────────────────────────────
  const keptChunks = []
  const untimedSamples = []
  let keptEvents = 0
  let droppedEvents = 0
  let untimedLines = 0
  let firstKeptFrame = -1
  let firstFrameCharsTotal = 0
  const framesKept = new Set()
  for (let i = 0; i < starts.length; i += 1) {
    if (!insideAt(i)) {
      droppedEvents += 1
      if (times[i] === null) {
        untimedLines += 1
        if (untimedSamples.length < 3) {
          untimedSamples.push({ frame: lineFrames[i], head: buf.subarray(starts[i], ends[i]).toString('utf8').slice(0, 80) })
        }
      }
      continue
    }
    keptEvents += 1
    if (human) ledger.scanned_lines += 1
    let chunk = buf.subarray(starts[i], ends[i])
    if (human) {
      const kind = kinds[i]
      let keep = true
      if (kind === LINE_KIND.BOSS) {
        // 老板那一侧**一个字都不投影**（他的消息里有 image 段 —— 投影会把图丢掉）
        ledger.boss_lines += 1
        ledger.boss_bytes += chunk.length
      } else if (kind === LINE_KIND.LAST_OUTPUT) {
        const obj = JSON.parse(chunk.toString('utf8'))
        chunk = Buffer.from(`${JSON.stringify(projectHumanEvent(obj))}\n`, 'utf8')
        ledger.last_output_lines += 1
        ledger.last_output_bytes += chunk.length
        ledger.assistant_lines += 1
      } else {
        keep = false
        if (kind === LINE_KIND.ASSISTANT_NON_LAST) {
          ledger.assistant_lines += 1
          ledger.dropped_non_last_assistant += 1
        } else if (kind === LINE_KIND.TURN_WITHOUT_TEXT) {
          ledger.assistant_lines += 1
          ledger.turns_without_text += 1
          const ti = turnOfLine[i]
          if (ledger.samples.without_text.length < 5) {
            ledger.samples.without_text.push({
              turn: ti >= 0 ? turns[ti].turn : null,
              reason: ti >= 0 ? turns[ti].reason : null,
              seq: ti >= 0 ? turns[ti].lastAssistantSeq : null,
            })
          }
        } else if (kind === LINE_KIND.ASSISTANT_OPEN_TURN) {
          ledger.assistant_lines += 1
          ledger.dropped_unclosed_assistant += 1
        } else if (kind === LINE_KIND.INJECTED) {
          ledger.injected_lines += 1
        } else if (kind === LINE_KIND.OTHER_MESSAGE) {
          ledger.other_message_lines += 1
        } else {
          ledger.non_message_lines += 1
        }
      }
      if (!keep) continue
    }
    keptChunks.push(chunk)
    framesKept.add(lineFrames[i])
    if (firstKeptFrame === -1) firstKeptFrame = lineFrames[i]
    if (lineFrames[i] === firstKeptFrame) firstFrameCharsTotal += charCountOf(chunk.toString('utf8'))
  }

  let bytesOfKeptFrames = 0
  for (const index of framesKept) bytesOfKeptFrames += frames[index].bytes
  if (human) ledger.kept_lines = keptChunks.length
  return {
    text: Buffer.concat(keptChunks).toString('utf8'),
    count: framesKept.size,
    bytes: bytesOfKeptFrames,
    first_frame_chars: firstFrameCharsTotal,
    kept_events: keptEvents,
    dropped_events: droppedEvents,
    untimed_lines: untimedLines,
    untimed_samples: untimedSamples,
    kept_lines: keptChunks.length,
    human: ledger,
  }
}

// ── 窗口 ────────────────────────────────────────────────────────────────────

/**
 * 评审窗口（v1.5 + v1.6 ①）。
 * `from` = `route/current.json` 里**最近一次 review 完成事件**的 `occurred_at`；没有 ⇒ `null`。
 * `to` = 调用方给的 `now`（原样回写，不做时区转换）。
 *
 * @param {{statusRoot:string, now?:string|Date}} options
 * @returns {{from:string|null, to:string}}
 */
export function packetWindow(options = {}) {
  const { statusRoot, now } = options ?? {}
  const to = isoOf(now)
  if (statusRoot === undefined || statusRoot === null || String(statusRoot).trim() === '') {
    throw packetError('E_ARG_SCHEMA', 'packetWindow：statusRoot 必填（路线在 <statusRoot>/route/current.json）')
  }
  const currentFile = path.join(path.resolve(String(statusRoot)), 'route', 'current.json')
  const route = readJsonSoft(currentFile)
  const reviews = Array.isArray(route?.reviews) ? route.reviews : []

  let best = null
  for (const entry of reviews) {
    if (entry === null || typeof entry !== 'object') continue
    if (entry.event !== 'complete') continue
    const at = msOf(entry.occurred_at)
    if (at === null) continue // 形状不合的记录不算"一次完成事件"（`from:null` 那条路照旧成立）
    const attempt = Number.isInteger(entry.attempt) ? entry.attempt : 0
    if (best === null || at > best.at || (at === best.at && attempt > best.attempt)) {
      best = { at, attempt, iso: String(entry.occurred_at) }
    }
  }
  return { from: best === null ? null : best.iso, to }
}

// ── 打包 ────────────────────────────────────────────────────────────────────

/**
 * 三类排除按冻结顺序判：别的项目 → 本次评审自己 → 窗口外。**判完才谈解压**。
 *
 * v1.7 只**多问一句**"这条源要不要裁"，并且把"该源最后一个事件都在裁剪窗口之前"并进
 * **已有那一格** `outside_window`（不新造理由、不改顺序）—— 因为它同样是"整条落空"，
 * 同样在**解压之前**判出来 ⇒ "先分类、后解压"这条纪律一格都没松。
 *
 * v1.8 再**多问一句**"这条源要不要筛人话"（`source.human`）：它只改**留下哪些行**，
 * 不改排除、不改窗口、不改解压那一层 —— 所以放在这里只做**形状校验**，判定仍走上面那三道。
 * ⚠️ `human` 的形状校验放在**排除之前**（跟 `window` 放在排除之后不同）：形状不合是**调用方的
 *    bug**，不该因为"这条源恰好被排除"就把它静默放过。
 */
function classifySource(source, { project, excludeIds, window }) {
  const sid = String(source?.session_id ?? '')
  const proj = String(source?.project ?? '')
  const file = String(source?.file ?? '')
  if (sid === '' || proj === '' || file === '') {
    throw packetError('E_ARG_SCHEMA', `sources 每项必填 session_id / project / file（v1.6 ②）：${JSON.stringify(source)}`)
  }
  const human = humanFlagOf(source)
  if (proj !== project) return { excluded: { session_id: sid, reason: 'other_project' } }
  if (excludeIds.has(sid)) return { excluded: { session_id: sid, reason: 'self_review' } }
  const at = msOf(source?.last_event_at)
  if (at === null) {
    throw packetError('E_ARG_SCHEMA', `source.last_event_at 必须是 ISO8601（v1.6 ②）：${JSON.stringify(source?.last_event_at)}`)
  }
  const fromMs = msOf(window.from)
  if (window.from !== null && fromMs !== null && at < fromMs) {
    return { excluded: { session_id: sid, reason: 'outside_window' } }
  }
  // v1.7：这条源要不要裁？形状不合/与包窗口没交集 ⇒ 这里就抛（还没解压过一个字节）。
  const crop = cropWindowOf(source, window)
  // 🔴 **先分类、后解压**（v1.6 ② / v1.7 没动）：该源最后一个事件都在裁剪窗口**之前** ⇒
  //    整条落空，**分类期就排除**，同一个 `outside_window` 理由，**一个字节都不解**。
  if (crop !== null && crop.fromMs !== null && at < crop.fromMs) {
    return { excluded: { session_id: sid, reason: 'outside_window' } }
  }
  return {
    included: {
      session_id: sid,
      project: proj,
      file,
      last_event_at: String(source.last_event_at),
      crop, // `null` = 这条源不裁（v1.7）；否则 = 生效窗口
      human, // v1.8：这条源要不要套人话筛（`false` ⇒ 与 v1.7 逐字相同）
    },
  }
}

/**
 * 只删**本函数在 `outDir` 里建的**临时目录：落点先校验（containment + 前缀），再来删。
 * 校验不过 ⇒ 抛（**宁可不删，也不删错**）。
 */
function assertDeletableTempDir(dir, parent) {
  const base = path.resolve(String(parent))
  const target = path.resolve(String(dir))
  const under = target !== base && target.startsWith(`${base}${path.sep}`)
  if (!under || !path.basename(target).startsWith(PACKET_TMP_PREFIX)) {
    throw packetError('E_TXN_IO', `拒绝删这个落点（它不是本模块在 outDir 里建的临时目录）：${target}`)
  }
  return target
}

/** 清临时目录；清不掉就出声（不静默）。 */
function removeTempDir(dir, parent) {
  let target = null
  try {
    target = assertDeletableTempDir(dir, parent)
  } catch (err) {
    process.stderr.write(`[packet] ${String(err?.message ?? err)}\n`)
    return false
  }
  try {
    rmSync(target, { recursive: true, force: true })
    return true
  } catch (err) {
    process.stderr.write(`[packet] 临时目录清不掉（${err?.code ?? 'UNKNOWN'}）：${target}\n`)
    return false
  }
}

/**
 * 生成一个会话包（v1.5 + v1.6 ②），**原子落盘**。
 *
 * 🔴 临时件（v1.10 ⑤ 红线）：帧工具的输出落 `AGENIA_SCRATCH_DIR`（若给）⇒ 否则
 * `<outDir>/.packet-tmp-<id>/frames/`；**包本体**恒暂存在 `<outDir>/.packet-tmp-<id>/packet/` 再改名
 * （`rename` 同卷 ⇒ 原子）。两处都在 `finally` 里清掉 —— **源流所在目录一个字节都不写**。
 *
 * @param {{project:string, outDir:string, statusRoot:string, now?:string|Date,
 *          sources:Array<{session_id:string,project:string,file:string,last_event_at:string,
 *                          window?:{from?:string|null, to?:string}, human?:boolean}>,
 *          excludeSessionIds?:string[]}} options
 *   ⚠️ `sources[].window` 是 v1.7 的**可选裁剪窗口**（见文件头）；不给 ⇒ 行为与 v1.6 逐字相同。
 *   ⚠️ `sources[].human` 是 v1.8 的**可选人话过滤**（见文件头）；不给 / `false` ⇒ 行为与 v1.7 逐字相同。
 *      两个键**正交**：可以只给一个、也可以都给。
 * @returns {{ok:true, packet_id:string, dir:string, manifest_path:string,
 *            content_sha256:string, frames:object, excluded:Array<{session_id:string,reason:string}>,
 *            cropped:Array<object>, human:object|null}}
 *   `cropped` = 裁剪的账（每源：生效窗口 / 留了几条 / 丢了几条 / 没有时间戳的几行 / 有贡献的帧数）。
 *   `human` = 人话过滤的账（v1.8）：`{projection, sources[], totals}` —— `projection` 里带着
 *   **"保证降级"那句话**（manifest 十个字段不许动 ⇒ 降级声明挂在账上）；**一条源都没开 ⇒ `null`**。
 */
export function buildSessionPacket(options = {}) {
  const { project, outDir, statusRoot, now, sources, excludeSessionIds } = options ?? {}
  if (typeof project !== 'string' || project.trim() === '') throw packetError('E_ARG_SCHEMA', 'buildSessionPacket：project 必填')
  if (typeof outDir !== 'string' || outDir.trim() === '') throw packetError('E_ARG_SCHEMA', 'buildSessionPacket：outDir 必填')
  // v1.6 ② 明写 `sources` 是**必填数组**：空源要显式给 `[]`，不给就出声（不静默当空包）。
  if (!Array.isArray(sources)) {
    throw packetError('E_ARG_SCHEMA', 'buildSessionPacket：sources 必填数组（v1.6 ②；空源请显式给 []）')
  }
  const excludeIds = new Set((Array.isArray(excludeSessionIds) ? excludeSessionIds : []).map((v) => String(v)))
  const at = isoOf(now)
  const window = packetWindow({ statusRoot, now: at })

  // ① 先分类：被判排除的 source **一个字节都不解压**（排除项上的坏帧不许把整包拖红）
  const included = []
  const excluded = []
  for (const source of sources) {
    const verdict = classifySource(source, { project, excludeIds, window })
    if (verdict.excluded !== undefined) excluded.push(verdict.excluded)
    else included.push(verdict.included)
  }

  const packetId = randomBytes(8).toString('hex')
  const base = path.resolve(outDir)
  const finalDir = path.join(base, `packet-${stampOf(at)}-${packetId.slice(0, 8)}`)
  // 临时件（v1.10 ⑤）：token 一格；**包本体**必须暂存在 `outDir` 内（改名要同卷 ⇒ 原子），
  // 帧工具的输出落 `AGENIA_SCRATCH_DIR`（若给）⇒ 否则同一个 token 格里的 `frames/`。**源流目录不碰**。
  const scratchRoot = givenScratchRoot()
  const token = `${PACKET_TMP_PREFIX}${process.pid}-${randomBytes(5).toString('hex')}`
  const tokenDir = path.join(base, token)
  const bodyTmp = path.join(tokenDir, 'packet')
  const framesParent = scratchRoot === null ? path.join(tokenDir, 'frames') : scratchRoot

  try {
    mkdirSync(base, { recursive: true }) // 父是文件 ⇒ 这里就抛（一个包目录都不会留）

    // ② 只解 included（每条源：全帧拼接文本 + 帧读数）—— 临时件只落 `framesParent` 那一格
    //    v1.7：带裁剪窗口的源走**逐行裁**（同一次解压，只是把窗口外的行留下不拼）；
    //    v1.8：`human` 开的源在同一次逐行过滤里**多筛一道**（窗口 → 人话，次序钉死）；
    //    **两个键都没给的源走的老路一个字没动** ⇒ 旧包的字节读数不受影响。
    const tool = findZstdTool()
    const pieces = []
    const sourceIds = []
    const croppedReport = []
    const humanReport = []
    let frameCount = 0
    let streamBytes = 0
    let firstFrameCharsTotal = 0
    for (const source of included) {
      const detail = readStreamDetail(source.file, tool, framesParent)
      const human = source.human === true
      const cropped = source.crop === null || source.crop === undefined ? null : source.crop
      if (cropped === null && !human) {
        // v1.7 原路（不裁不筛）：一个字节都不碰
        pieces.push(detail.text)
        sourceIds.push(source.session_id)
        frameCount += detail.count
        streamBytes += detail.bytes
        firstFrameCharsTotal += detail.first_frame_chars
        continue
      }
      const filtered = filterStream(detail, cropped === null ? null : cropped, human)
      if (cropped !== null) {
        croppedReport.push({
          session_id: source.session_id,
          window: { from: cropped.from, to: cropped.to },
          kept_events: filtered.kept_events,
          dropped_events: filtered.dropped_events,
          untimed_lines: filtered.untimed_lines,
          untimed_samples: filtered.untimed_samples,
          frames: filtered.count,
          bytes: filtered.bytes,
        })
      }
      // 人话那把账**先记**（哪怕这条源最后一条都没留下 —— 账要能解释"为什么它没进包"）
      if (human) humanReport.push({ session_id: source.session_id, ...filtered.human })
      // 一条事件都没留下（窗口裁）或一条人话都没有（v1.8 筛完）⇒ 这条源对包没有任何贡献：
      // **不写进 `source_ids`**（写了就是谎报"它在包里"）。`kept_lines` 对这一条负全责。
      if (filtered.kept_lines === 0) continue
      pieces.push(filtered.text)
      sourceIds.push(source.session_id)
      frameCount += filtered.count
      streamBytes += filtered.bytes
      firstFrameCharsTotal += filtered.first_frame_chars
    }

    const contentText = pieces.join('')
    const contentBuf = Buffer.from(contentText, 'utf8')
    const contentSha = sha256Of(contentBuf)
    const frames = Object.freeze({
      count: frameCount,
      bytes: streamBytes,
      first_frame_chars: firstFrameCharsTotal,
      all_chars: charCountOf(contentText),
    })

    const manifest = {
      schema: PACKET_SCHEMA,
      packet_id: packetId,
      project,
      created_at: at,
      window: { from: window.from, to: window.to },
      source_ids: sourceIds,
      excluded,
      frames,
      content_sha256: contentSha,
      // 空包（`sources: []`）没有解压任何 source ⇒ 如实写"没用到工具"，不编一个像样的路径。
      tool: { path: tool ?? `${ZSTD_TOOL_REL}（未找到；空包没有解压任何 source）` },
    }

    mkdirSync(tokenDir, { recursive: true })
    mkdirSync(bodyTmp) // 独占建：撞名即炸，绝不覆盖
    writeFileSync(path.join(bodyTmp, 'content.jsonl'), contentBuf)
    writeFileSync(path.join(bodyTmp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    // 自校验：自己产的包先过一遍自己的校验器，**改名之前**判 —— 不过就清临时目录、当场抛
    const check = validateSessionPacket(bodyTmp)
    if (check.ok !== true) {
      throw packetError('E_INTERNAL', `自产的包没过自己的校验（${check.code}）：${JSON.stringify(check.problems).slice(0, 240)}`)
    }
    renameSync(bodyTmp, finalDir) // 同目录改名 = 原子

    return {
      ok: true,
      packet_id: packetId,
      dir: finalDir,
      manifest_path: path.join(finalDir, 'manifest.json'),
      content_sha256: contentSha,
      frames,
      excluded,
      // v1.7：裁剪的账**不进 manifest**（那十个顶层字段不能动）⇒ 从这里回去，由调用方记账。
      // 没给任何裁剪窗口时它恒为空数组（旧调用方拿到的东西一个字段都没变，只是多了一把空账）。
      cropped: croppedReport,
      // v1.8：人话过滤的账，**在 `cropped` 旁边**。`projection` 里带着"保证降级"那句话 ——
      // manifest 十个字段不许动，所以降级声明只能挂在这里，由调用方带进 stdout 与 audit。
      // 一条源都没开 `human` ⇒ `null`（旧调用方只多看到这一个键，值是 null）。
      human: humanReport.length === 0 ? null : {
        projection: HUMAN_PROJECTION,
        sources: humanReport,
        totals: humanTotalsOf(humanReport),
      },
    }
  } catch (err) {
    if (err?.code !== undefined && String(err.code).startsWith('E_')) throw err
    throw packetError('E_TXN_IO', `打包失败（${err?.code ?? 'UNKNOWN'}）：${String(err?.message ?? err)}`)
  } finally {
    // 成功 / 失败都清掉这一格（包本体暂存 + 没给 SCRATCH 时的帧临时件）；清理前先校验落点。
    removeTempDir(tokenDir, base)
  }
}

// ── 校验 ────────────────────────────────────────────────────────────────────

function problemOf(code, detail) {
  return { code, detail }
}

/** manifest 的字段形状（v1.5 的字段表 + v1.6 ① 的窗口记录形状）。返回 problems（空 = 过）。 */
function manifestProblems(man) {
  const problems = []
  if (man === null || typeof man !== 'object' || Array.isArray(man)) {
    return [problemOf(PACKET_CODES.MANIFEST, 'manifest.json 不是对象')]
  }
  for (const key of PACKET_MANIFEST_FIELDS) {
    if (!Object.hasOwn(man, key)) problems.push(problemOf(PACKET_CODES.MANIFEST, `manifest 缺必填字段 ${key}（v1.5 的字段表）`))
  }
  if (man.schema !== PACKET_SCHEMA) problems.push(problemOf(PACKET_CODES.MANIFEST, `manifest.schema 应为 ${PACKET_SCHEMA}，实得 ${JSON.stringify(man.schema)}`))
  for (const key of ['packet_id', 'project', 'created_at']) {
    if (typeof man[key] !== 'string' || man[key] === '') problems.push(problemOf(PACKET_CODES.MANIFEST, `manifest.${key} 必须是非空字符串，实得 ${JSON.stringify(man[key])}`))
  }
  if (typeof man.content_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(man.content_sha256)) {
    problems.push(problemOf(PACKET_CODES.MANIFEST, `manifest.content_sha256 必须是小写 64 位 hex，实得 ${JSON.stringify(man.content_sha256)}`))
  }
  if (man.tool === null || typeof man.tool !== 'object' || typeof man.tool.path !== 'string' || man.tool.path === '') {
    problems.push(problemOf(PACKET_CODES.MANIFEST, 'manifest.tool.path 必须是非空字符串（写清用哪份工具/路径）'))
  }
  if (!Array.isArray(man.source_ids) || man.source_ids.some((v) => typeof v !== 'string')) {
    problems.push(problemOf(PACKET_CODES.MANIFEST, 'manifest.source_ids 必须是字符串数组'))
  }
  return problems
}

/** `window` 与 `frames` 两块的形状（v1.5 / v1.6 ①）。 */
function windowProblems(man) {
  const problems = []
  const w = man.window
  if (w === null || typeof w !== 'object' || Array.isArray(w)) return [problemOf(PACKET_CODES.WINDOW, 'manifest.window 必须是 {from,to}，实得 ' + JSON.stringify(w))]
  if (w.from !== null && msOf(w.from) === null) problems.push(problemOf(PACKET_CODES.WINDOW, `manifest.window.from 必须是 ISO8601 或 null，实得 ${JSON.stringify(w.from)}`))
  if (msOf(w.to) === null) problems.push(problemOf(PACKET_CODES.WINDOW, `manifest.window.to 必须是 ISO8601，实得 ${JSON.stringify(w.to)}`))
  if (w.from !== null && msOf(w.from) !== null && msOf(w.to) !== null && msOf(w.from) > msOf(w.to)) {
    problems.push(problemOf(PACKET_CODES.WINDOW, `manifest.window.from（${w.from}）比 to（${w.to}）还晚`))
  }
  return problems
}

function framesProblems(man) {
  const problems = []
  const f = man.frames
  if (f === null || typeof f !== 'object' || Array.isArray(f)) return [problemOf(PACKET_CODES.FRAMES, 'manifest.frames 必须是对象 {count,bytes,first_frame_chars,all_chars}')]
  for (const key of ['count', 'bytes', 'first_frame_chars', 'all_chars']) {
    const v = f[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) problems.push(problemOf(PACKET_CODES.FRAMES, `manifest.frames.${key} 必须是非负数，实得 ${JSON.stringify(v)}`))
  }
  return problems
}

function excludedProblems(man) {
  const problems = []
  if (!Array.isArray(man.excluded)) return [problemOf(PACKET_CODES.EXCLUDE, 'manifest.excluded 必须是数组')]
  const reasons = new Set(EXCLUDE_REASONS)
  for (const item of man.excluded) {
    if (item === null || typeof item !== 'object') {
      problems.push(problemOf(PACKET_CODES.EXCLUDE, `excluded 的每一项必须是对象，实得 ${JSON.stringify(item)}`))
      continue
    }
    if (typeof item.session_id !== 'string' || item.session_id === '') problems.push(problemOf(PACKET_CODES.EXCLUDE, `excluded 项缺 session_id：${JSON.stringify(item)}`))
    if (!reasons.has(item.reason)) problems.push(problemOf(PACKET_CODES.EXCLUDE, `excluded 的 reason 必须是 ${EXCLUDE_REASONS.join('|')} 之一，实得 ${JSON.stringify(item.reason)}`))
  }
  return problems
}

/**
 * 校验一个包目录（v1.5 + v1.6）。
 * 判定顺序固定：**manifest 形状 → 排除项 → 窗口 → 帧 → 内容存在 → content 字节 sha → 字符口径**
 * （顺序是断言对象：同一份坏包每次必须得到同一个稳定码）。
 *
 * @param {string} packetDir
 * @returns {{ok:boolean, code:string|null, manifest:object|null, problems:Array<{code:string,detail:string}>, content_sha256:string|null}}
 */
export function validateSessionPacket(packetDir) {
  const dir = path.resolve(String(packetDir ?? ''))
  const manifestPath = path.join(dir, 'manifest.json')
  const contentPath = path.join(dir, 'content.jsonl')
  const raw = (() => {
    try {
      return readFileSync(manifestPath, 'utf8')
    } catch {
      return null
    }
  })()
  if (raw === null) {
    return { ok: false, code: PACKET_CODES.MANIFEST, manifest: null, problems: [problemOf(PACKET_CODES.MANIFEST, `manifest.json 读不到：${manifestPath}`)], content_sha256: null }
  }
  let man = null
  try {
    man = JSON.parse(raw)
  } catch (err) {
    return { ok: false, code: PACKET_CODES.MANIFEST, manifest: null, problems: [problemOf(PACKET_CODES.MANIFEST, `manifest.json 不是可解析 JSON：${String(err?.message).slice(0, 120)}`)], content_sha256: null }
  }

  const byCode = [
    [PACKET_CODES.MANIFEST, manifestProblems(man)],
    [PACKET_CODES.EXCLUDE, manifestProblems(man).length === 0 ? excludedProblems(man) : []],
    [PACKET_CODES.WINDOW, manifestProblems(man).length === 0 ? windowProblems(man) : []],
    [PACKET_CODES.FRAMES, manifestProblems(man).length === 0 ? framesProblems(man) : []],
  ]
  for (const [code, problems] of byCode) {
    if (problems.length > 0) return { ok: false, code, manifest: man, problems, content_sha256: null }
  }

  let contentBuf = null
  try {
    contentBuf = readFileSync(contentPath)
  } catch {
    contentBuf = null
  }
  if (contentBuf === null) {
    return { ok: false, code: PACKET_CODES.FRAMES, manifest: man, problems: [problemOf(PACKET_CODES.FRAMES, `content.jsonl 读不到：${contentPath}`)], content_sha256: null }
  }

  const contentSha = sha256Of(contentBuf)
  if (contentSha !== man.content_sha256) {
    return {
      ok: false,
      code: PACKET_CODES.CONTENT_SHA,
      manifest: man,
      problems: [problemOf(PACKET_CODES.CONTENT_SHA, `content.jsonl 的字节 sha256=${contentSha} 与 manifest.content_sha256=${man.content_sha256} 不一致`)],
      content_sha256: contentSha,
    }
  }

  const allChars = charCountOf(contentBuf.toString('utf8'))
  if (man.frames.all_chars !== allChars) {
    return {
      ok: false,
      code: PACKET_CODES.FRAMES,
      manifest: man,
      problems: [problemOf(PACKET_CODES.FRAMES, `manifest.frames.all_chars=${man.frames.all_chars} 与 content.jsonl 的字符数 ${allChars} 不一致（字符口径 = §B3.4）`)],
      content_sha256: contentSha,
    }
  }

  return { ok: true, code: null, manifest: man, problems: [], content_sha256: contentSha }
}
