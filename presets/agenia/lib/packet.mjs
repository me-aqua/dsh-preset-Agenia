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
 *         判据落在**行**上（跟 v1.7 同一个粒度）；turn 这一层在**整条流**上判（见 `filterFileInto`）。
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
 *   · **F-144（2026-10-23，CONTRACT §9）：解压总量有上限 · 超限是一条读数 · 全程不拼整份文本。**
 *     ① **闸量的量 = `out_bytes`**：本次**进包**（`classifySource` 判为 `included`、因而会被解压）的那些源，
 *        其"解压后文本"的 UTF-8 字节总量 = 这些源**逐帧"实解 N B"之和**（现成帧工具报的读数，见 `runFramesTool`）。
 *        是**字节**不是字符（`all_chars` 是另一本账）；是**读进来多少**不是**最后留下多少**
 *        （开了 `window` 裁剪 / `human` 人话筛的源照样按解压总量计）；被排除的源**一个字节都不计**。
 *     ② **上限可注入**：`AGENIA_PACKET_MAX_BYTES`（十进制非负整数字面量，允许首尾空白）。
 *        缺省 **536870912**（512 MiB）；`0` = **关掉**（`limit === null`，不表示"上限 0"）；
 *        负数 / 带单位 / 小数 / 指数 ⇒ 当场 `E_ARG_SCHEMA`（exit 2）。
 *     ③ **超限 ⇒ `E_PACKET_TOO_LARGE`（exit 5）**，`error.details = {session_count, out_bytes, limit}`
 *        （`out_bytes` 是**全量**，不是"读到被顶住那一刻的前缀和"）；`out_bytes === limit` **过**，
 *        只有 `>` 才拒。拒的时候 `outDir` 里**一个包目录都不落**。
 *     ④ **成功路上也有读数**：`buildSessionPacket` 的返回值与本 op 的信封顶层带
 *        `packet_bytes = {session_count, out_bytes, limit}` —— 生效上限只在失败路上读得到的话，
 *        "闸在不在"在跑得通的那一跑里就没有读数。`manifest` 的**十个顶层字段不动**（账走返回值与 audit）。
 *     ⑤ **峰值内存与"总文本量"脱钩**（这一条是本体，不是优化）：整条流**一次都不拼成一个 Buffer / 一个字符串** ——
 *        逐源跑现成帧工具 → 文本落在磁盘 → 逐块（`READ_CHUNK_BYTES`）读进来算账 → 逐行过滤 → 逐块写进
 *        `content.jsonl`。字符数（§B3.4）与 SHA-256 都是**流式**累加（`createCharCounter` / `createContentSink`），
 *        自校验（`validateSessionPacket`）也一样。121 MB 那一跑崩在"先 `Buffer.concat` / `pieces.join('')`
 *        攒出大字符串再处理"上 —— 闸比崩溃点还大，光装闸挡不住它。
 *     ⑥ 不许截断：错的是"你让我读这么多"，不是"读不到" ⇒ 只能拒，不许少读几帧凑一份包
 *        （所以量是**先量完所有进包源**再判，不是为了省事在顶住那一刻就报数）。
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
import { closeSync, existsSync, ftruncateSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { now as clockNow } from './clock.mjs'
import { charCountOf } from './memory.mjs'

/** manifest 的 schema 标签（v1.5 逐字）。 */
export const PACKET_SCHEMA = 'agenia.session-packet/1'

/**
 * 六个稳定码（v1.5 的五个 + F-144 的解压总量）。
 * ⚠️ 它们是 `validateSessionPacket` 的**返回码**，同时也是 CLI `--op session-packet` 的**错误码**：
 *    后者由 `lib/error-codes.mjs` 的 `PACKET_EXIT` 给退出码（值从本表取，不抄第二遍）。
 */
export const PACKET_CODES = Object.freeze({
  MANIFEST: 'E_PACKET_MANIFEST',
  FRAMES: 'E_PACKET_FRAMES',
  CONTENT_SHA: 'E_PACKET_CONTENT_SHA',
  WINDOW: 'E_PACKET_WINDOW',
  EXCLUDE: 'E_PACKET_EXCLUDE',
  /** F-144：解压总量超过生效上限（`AGENIA_PACKET_MAX_BYTES`）⇒ 整份拒，不截断。 */
  TOO_LARGE: 'E_PACKET_TOO_LARGE',
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

/**
 * 解压总量上限的旋钮（CONTRACT §9.1 ②③④）。
 * 缺省 **536870912**（512 MiB）是算出来的，不是拍的：崩溃点在 `all_chars` 侧 ≈121,000,000 字，
 * 一个 code point 最多 4 个 UTF-8 字节 ⇒ `out_bytes` 侧最多 484,000,000 B；取 512 MiB 同时满足
 * "不制造新的失败"（现在能过的 30 源最多 402,125,292 B）与"不比崩溃点更小"。
 * ⚠️ **它不是内存护栏**（比崩溃点还大）：把峰值内存压下去靠的是全程流式，不是这个数。
 */
const PACKET_MAX_BYTES_VAR = 'AGENIA_PACKET_MAX_BYTES'
const PACKET_MAX_BYTES_DEFAULT = 536870912

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
  // 🔴 两个键同批挂上：`detail`（单数）是本文件内的旧读法，`details`（复数）是 CLI catch 转发的那一个
  //    （`bin/agenia-brain.mjs` 的 catch 只读 `err.details`）—— 只挂单数时，payload 在 stdout 里是 null，
  //    而码名与退出码全对，看着像做完了。
  err.detail = detail ?? null
  err.details = detail ?? null
  return err
}

// ── 解压总量上限（F-144 · CONTRACT §9.1 ②③④）─────────────────────────────────

/**
 * 这一次**生效**的上限：`null` = 关掉（`AGENIA_PACKET_MAX_BYTES=0`），否则是字节数。
 *
 * 只认**十进制非负整数字面量**（允许首尾空白）：
 *   变量不在 / 空串 / 全空白 ⇒ 缺省 `536870912`；
 *   `0` ⇒ `null`（关闸；不许用 0 表示"上限 0"—— 那样"没设闸"和"闸设成 0"在读的人眼里是同一个数）；
 *   负数 / `1KB` / `1.5` / `1e9` ⇒ **当场** `E_ARG_SCHEMA`（不许静默当 0 就当关闸，也不许当无穷）。
 */
function packetMaxBytesOf(env = process.env) {
  const raw = env?.[PACKET_MAX_BYTES_VAR]
  if (raw === undefined || raw === null) return PACKET_MAX_BYTES_DEFAULT
  if (typeof raw !== 'string') {
    throw packetError('E_ARG_SCHEMA', `${PACKET_MAX_BYTES_VAR} 必须是十进制非负整数的字面量，实得 ${JSON.stringify(raw)}`)
  }
  const text = raw.trim()
  if (text === '') return PACKET_MAX_BYTES_DEFAULT
  if (!/^\d+$/.test(text)) {
    throw packetError(
      'E_ARG_SCHEMA',
      `${PACKET_MAX_BYTES_VAR} 只收十进制非负整数（负数 / 带单位 / 小数 / 指数一律拒；0 = 关掉上限）：${JSON.stringify(raw)}`,
    )
  }
  const value = Number(text)
  return value === 0 ? null : value
}

// ── 流式量具（F-144 的本体：峰值内存不随总文本量长）─────────────────────────────

/** 一次读多少字节（搬运 / 行扫描 / 自校验共用；内存只与它 + 最长的一行有关）。 */
const READ_CHUNK_BYTES = 256 * 1024

/**
 * `buf` 里**完整的 UTF-8 序列**结束在哪（之后那 0–3 个字节是半个字，要留到下一块再解）。
 * 用途：逐块解码时不能把一块的尾巴切成 U+FFFD —— 整份 `toString('utf8')` 不会那样。
 */
function completeUtf8End(buf) {
  let n = buf.length
  let back = 0
  while (n > 0 && back < 3 && (buf[n - 1] & 0xc0) === 0x80) {
    n -= 1
    back += 1
  }
  if (n === 0) return 0
  const lead = buf[n - 1]
  const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1
  return buf.length - (n - 1) >= need ? buf.length : n - 1
}

/**
 * §B3.4 的字符计数，**逐块累加**（不把整份文本拼成一个字符串）。
 * 口径与 `charCountOf`（`lib/memory.mjs` 里那一份唯一实现）逐字相同：去开头的 BOM → `\r\n`/`\r` 归一成
 * `\n` → 按 Unicode code point 数；不 trim、不做 NFC。跨块的两处状态各留一个：
 * `carry`（半个 UTF-8 序列，不完整就不解）· `pendingCR`（块末尾那个 `\r` 可能和下一块开头的 `\n` 组成 `\r\n`）。
 * ⚠️ 与 `charCountOf(整份文本)` 的等价只在**合法 UTF-8** 上成立 —— 进包的内容是从会话流解压出来的
 *    UTF-8，写进 `content.jsonl` 之后还是同一份字节。
 */
function createCharCounter() {
  let carry = Buffer.alloc(0)
  let count = 0
  let atStart = true
  let pendingCR = false

  const accept = (input) => {
    let s = input
    if (atStart) {
      s = s.replace(/^\uFEFF+/, '')
      if (s.length > 0) atStart = false
    }
    if (pendingCR) {
      count += 1 // 上一块末尾那个 \r ⇒ 归一成 \n，算 1 个字
      pendingCR = false
      if (s.charCodeAt(0) === 0x0a) s = s.slice(1) // \r\n 合成一个 \n
    }
    if (s.length === 0) return
    if (s.charCodeAt(s.length - 1) === 0x0d) {
      s = s.slice(0, -1)
      pendingCR = true
    }
    let n = 0
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i)
      if (c === 0x0d) {
        n += 1
        if (s.charCodeAt(i + 1) === 0x0a) i += 1 // \r\n 只算 1 个
        continue
      }
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        const low = s.charCodeAt(i + 1)
        if (low >= 0xdc00 && low <= 0xdfff) {
          i += 1 // 一个代理对 = 一个 code point
          n += 1
          continue
        }
      }
      n += 1
    }
    count += n
  }

  return {
    push(buf) {
      let chunk = buf
      if (carry.length > 0) {
        chunk = Buffer.concat([carry, buf])
        carry = Buffer.alloc(0)
      }
      const end = completeUtf8End(chunk)
      if (end < chunk.length) carry = Buffer.from(chunk.subarray(end))
      if (end === 0) return
      accept(chunk.subarray(0, end).toString('utf8'))
    },
    /** 记一个快照（拍完还能接着往里推；`rewind` 之后从快照那一刻继续）。 */
    mark() {
      return { count, atStart, pendingCR, carry: Buffer.from(carry) }
    },
    rewind(mark) {
      count = mark.count
      atStart = mark.atStart
      pendingCR = mark.pendingCR
      carry = Buffer.from(mark.carry)
    },
    /** 收口：把留在手里的那半个序列与末尾那个 `\r` 也算掉。只许调一次。 */
    finish() {
      if (carry.length > 0) {
        accept(carry.toString('utf8'))
        carry = Buffer.alloc(0)
      }
      if (pendingCR) {
        count += 1
        pendingCR = false
      }
      return count
    },
  }
}

/** 把一份文件**按块**喂给 `onChunk`（顺序读，不整份读进内存）。 */
function eachChunkOfFile(file, onChunk) {
  const fd = openSync(file, 'r')
  const buf = Buffer.allocUnsafe(READ_CHUNK_BYTES)
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null)
      if (n <= 0) break
      onChunk(n === buf.length ? buf : buf.subarray(0, n))
    }
  } finally {
    closeSync(fd)
  }
}

/**
 * 按 `\n` 切行，一次一块地读一份落盘的文本，`onLine(line, offset)` 拿到这一行的**字节**
 * （含行尾 LF；文件末尾没有 LF 的那半行也照给）。`offset` 是这一行在文件里的起始字节。
 * 跨块的那半行会攒起来（只有一行比那块还长时才用得到）。
 */
function eachLineOfFile(file, onLine) {
  const fd = openSync(file, 'r')
  const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES)
  let carry = null
  let offset = 0
  try {
    for (;;) {
      const n = readSync(fd, chunk, 0, chunk.length, null)
      if (n <= 0) break
      const view = n === chunk.length ? chunk : chunk.subarray(0, n)
      let start = 0
      let nl = view.indexOf(0x0a, start)
      while (nl !== -1) {
        const piece = view.subarray(start, nl + 1)
        const line = carry === null ? piece : Buffer.concat([carry, piece])
        const at = offset
        offset += line.length
        carry = null
        start = nl + 1
        if (onLine(line, at) === false) return
        nl = view.indexOf(0x0a, start)
      }
      if (start < view.length) {
        const rest = view.subarray(start)
        carry = carry === null ? Buffer.from(rest) : Buffer.concat([carry, rest])
      }
    }
    if (carry !== null) onLine(carry, offset)
  } finally {
    closeSync(fd)
  }
}

/** 一份文件的字符数（§B3.4 口径，流式）。 */
function countCharsOfFile(file) {
  const counter = createCharCounter()
  eachChunkOfFile(file, (chunk) => counter.push(chunk))
  return counter.finish()
}

/** 一份文件的字节 sha256 + 字符数（§B3.4 口径）—— 两样都流式累加，供自校验用。 */
function measureTextFile(file) {
  const hash = createHash('sha256')
  const counter = createCharCounter()
  eachChunkOfFile(file, (chunk) => {
    hash.update(chunk)
    counter.push(chunk)
  })
  return { sha256: hash.digest('hex'), all_chars: counter.finish() }
}

/**
 * `content.jsonl` 的**流式写入口**：写一块算一块（字节 sha256 + §B3.4 字符数），
 * 峰值内存只与一块的大小有关。
 *
 * `mark()` / `rewind()`：输出是一条源一条源地写，而"这条源一条都没留下"要到写完才知道 ⇒
 * 没贡献的那一条把**字节与账一起退回**（`ftruncate` + 哈希与计数器的快照），
 * 不为了这件事先把整条源的输出攒在内存里。
 */
function createContentSink(file) {
  const fd = openSync(file, 'w')
  let hash = createHash('sha256')
  const counter = createCharCounter()
  let bytes = 0
  let closed = false
  return {
    write(buf) {
      if (buf.length === 0) return
      let off = 0
      // ⚠️ 位置**显式**给（不靠文件指针）：`rewind()` 用 `ftruncate` 把尾巴切掉之后，
      //    文件指针还停在原处，接着写就会在中间留一段空洞 —— 包里的字节会静默变成 0。
      while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off, bytes + off)
      hash.update(buf)
      counter.push(buf)
      bytes += buf.length
    },
    mark() {
      return { bytes, hash: hash.copy(), counter: counter.mark() }
    },
    rewind(mark) {
      ftruncateSync(fd, mark.bytes)
      hash = mark.hash
      counter.rewind(mark.counter)
      bytes = mark.bytes
    },
    close() {
      if (closed) return
      closed = true
      closeSync(fd)
    },
    /** 收口读数（`close()` 之后调；只在最后调一次 —— `digest()` 用掉就没了）。 */
    result() {
      return { sha256: hash.digest('hex'), all_chars: counter.finish(), bytes }
    },
  }
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
 * 跑一次现成工具，把它解出来的文本落到 `outFile`，返回**帧这一层的读数**。
 * 任何"读不动"的形状（工具非 0 退出 / 输出形状不认识 / 帧报了 ❌ / 逐帧字节数与落盘文件对不上）
 * ⇒ 抛 `E_PACKET_FRAMES`。**绝不返回半截**。
 *
 * 🔴 这里**不把落盘文本读进内存**（F-144）：只核"逐帧实解之和 = 落盘文件的字节数"（`statSync`），
 *    文本按块流过去（`eachChunkOfFile` / `eachLineOfFile`）。`out_bytes` 就是逐帧那些"实解 N B"的和 ——
 *    它在任何拼接之前就成立，闸可以在攒出大字符串之前判。
 *
 * @returns {{frames:Array<{index:number,offset:number,bytes:number,outBytes:number,tail:string}>,
 *            count:number, bytes:number, out_bytes:number, out_file:string}}
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
  const outBytes = frames.reduce((n, f) => n + f.outBytes, 0)
  const fileBytes = statSync(outFile).size
  if (outBytes !== fileBytes) {
    throw packetError(PACKET_CODES.FRAMES, `逐帧"实解"合计 ${outBytes} B 与落盘文本 ${fileBytes} B 对不上 —— 有帧没进内容（${where}）`)
  }
  return { frames, count: frameCount, bytes: Number(declared[1]), out_bytes: outBytes, out_file: outFile }
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
  return countCharsOfFile(r.out_file)
}

/**
 * 读一条会话流，把帧这一层的读数一起带回来（`readSessionStream` 只是它的 `.text`）。
 *
 * 🔴 `scratchParent`（v1.10 ⑤）：**临时件只落调用方给的这一格**（打包路径给的是
 * `<outDir>/.packet-tmp-<id>/`，或 `AGENIA_SCRATCH_DIR` 那一格）；不给 ⇒ 自己按 `scratchRootFor()`
 * 找一格，并连格一起清掉 —— **源流所在目录一个字节都不写**。
 *
 * ⚠️ 这条是**要整份文本**的那条路（`readSessionStream`），所以它确实把文本读进内存；
 *    打包那条路由 `buildSessionPacket` 自己走流式，不经过这里。
 *
 * @param {string} file 会话流（多帧 zstd）的路径
 * @param {string|null} [resolvedTool] 现成帧工具（打包路径解一次、每条源复用）
 * @param {string|null} [scratchParent] 临时件落点的父目录；`null` ⇒ 裸读路径自己找
 * @returns {{text:string, buf:Buffer, frames:Array<{index:number,offset:number,bytes:number,outBytes:number,tail:string}>,
 *            count:number, bytes:number, first_frame_chars:number, tool:string}}
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
    const buf = readFileSync(r.out_file)
    const first = r.frames.length > 1 ? firstFrameChars(tool, src, stem, r.frames[0]) : charCountOf(buf.toString('utf8'))
    return { text: buf.toString('utf8'), buf, frames: r.frames, count: r.count, bytes: r.bytes, first_frame_chars: first, tool }
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
 * 按生效窗口裁一条**已经解出来**的流（v1.7），需要的话再按"人话"筛一遍（v1.8）—— 一行一行过，
 * 留下来的行**逐条写进 `sink`**（`content.jsonl` 的流式写入口）。
 *
 * 🔴 **不自己解压、不自己算帧边界**（纪律 ①）：只用工具报出来的每帧"实解 N B"做前缀和，
 *    按这些**工具给的字节数**判每一行落在第几帧。切不齐（前缀和 ≠ 落盘文本的字节数）就当场抛
 *    —— 宁可红，不许按错位的边界裁。
 *
 * 🔴 **两遍都读那份落盘文本**（顺序读，一遍一行；不把整份文本拼成一个 `Buffer` / 一个字符串）：
 *    第一遍切行、取时间戳、（开人话时）判 turn 归属与"最后一条"；第二遍才定去留 ——
 *    因为"一条 assistant 是不是这个 turn 的最后一条"要看它**后面**的行。
 *
 * 🔴 **turn 这一层在"整条流"上判，不在裁剪之后的那几行上判**（v1.8 的要点）：
 *    `turn/start` / `turn/end` 可能落在窗口外（一个 turn 从窗口前开、在窗口里收尾）
 *    ⇒ 只拿裁剪剩下的行去认 turn，会把"闭合的 turn"误判成未闭合，白丢一条"最后输出"。
 *    ⇒ 判"最后一条"与"闭没闭合"看**整条流**；`human` 那把账只数**落进窗口**的那些行。
 *
 * 读数口径（写进文件头那张表）：`count` = 有贡献的帧数 · `bytes` = 这些帧的压缩字节 ·
 * `first_frame_chars` = 第一个有贡献的帧里**留下来的**那些行的字符数（投影过的行按投影后的字算）。
 *
 * @param {string} srcFile 现成工具解出来的文本（一条源一份，落在临时格上）
 * @param {Array<{bytes:number,outBytes:number}>} frames 工具报的逐帧读数
 * @param {{fromMs:number|null, toMs:number, from:string|null, to:string}|null} win 生效窗口；`null` = 只筛不裁
 * @param {boolean} human 要不要套人话筛（v1.8；`false` ⇒ 与 v1.7 逐字相同）
 * @param {{write:(buf:Buffer)=>void}} sink 留下的行往哪儿写（`createContentSink()` 的返回值）
 * @returns {{count:number, bytes:number, first_frame_chars:number, kept_events:number,
 *            dropped_events:number, untimed_lines:number, untimed_samples:Array<object>,
 *            kept_lines:number, human:object|null}}
 */
function filterFileInto(srcFile, frames, win, human, sink) {
  const frameStart = new Array(frames.length)
  let cursor = 0
  for (let i = 0; i < frames.length; i += 1) {
    frameStart[i] = cursor
    cursor += frames[i].outBytes
  }
  const srcBytes = statSync(srcFile).size
  if (cursor !== srcBytes) {
    throw packetError(PACKET_CODES.FRAMES, `逐帧"实解"合计 ${cursor} B 与解出来的文本 ${srcBytes} B 对不上 —— 帧边界切不开，不许硬裁（v1.7）`)
  }

  // ── 第一遍：切行 · 取时间戳 · （开人话时）判 turn 归属与"最后一条" ────────────────
  const times = []
  const kinds = human ? [] : null
  const turnOfLine = human ? [] : null
  const turns = []
  let openTurn = -1
  let framePtr = 0
  eachLineOfFile(srcFile, (line, at) => {
    // 这一行落在第几帧：帧按顺序解、行起点单调 ⇒ 一个指针往后推就够（O(行数)）
    while (framePtr + 1 < frames.length && at >= frameStart[framePtr + 1]) framePtr += 1
    const index = times.length
    let obj = null
    try {
      obj = JSON.parse(line.toString('utf8'))
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
  })
  const lineCount = times.length

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
    for (let i = 0; i < lineCount; i += 1) {
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

  // ── 第二遍：定去留（先判窗口、再判人话）—— 留下来的行**写进 sink**，不攒在内存里 ──────────
  const untimedSamples = []
  let keptEvents = 0
  let droppedEvents = 0
  let untimedLines = 0
  let keptLines = 0
  let firstKeptFrame = -1
  let firstFrameCharsTotal = 0
  const framesKept = new Set()
  let index = 0
  let framePtr2 = 0
  eachLineOfFile(srcFile, (line, at) => {
    while (framePtr2 + 1 < frames.length && at >= frameStart[framePtr2 + 1]) framePtr2 += 1
    const lineFrame = framePtr2
    const i = index
    index += 1
    if (!insideAt(i)) {
      droppedEvents += 1
      if (times[i] === null) {
        untimedLines += 1
        if (untimedSamples.length < 3) {
          untimedSamples.push({ frame: lineFrame, head: line.toString('utf8').slice(0, 80) })
        }
      }
      return
    }
    keptEvents += 1
    if (human) ledger.scanned_lines += 1
    let chunk = line
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
      if (!keep) return
    }
    sink.write(chunk)
    keptLines += 1
    framesKept.add(lineFrame)
    if (firstKeptFrame === -1) firstKeptFrame = lineFrame
    if (lineFrame === firstKeptFrame) firstFrameCharsTotal += charCountOf(chunk.toString('utf8'))
  })

  let bytesOfKeptFrames = 0
  for (const frameIndex of framesKept) bytesOfKeptFrames += frames[frameIndex].bytes
  if (human) ledger.kept_lines = keptLines
  return {
    count: framesKept.size,
    bytes: bytesOfKeptFrames,
    first_frame_chars: firstFrameCharsTotal,
    kept_events: keptEvents,
    dropped_events: droppedEvents,
    untimed_lines: untimedLines,
    untimed_samples: untimedSamples,
    kept_lines: keptLines,
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
 * 🔴 **全程流式（F-144）**：整条流一次都不拼成一个 `Buffer` / 一个字符串 ——
 * ① 先分类（排除项一个字节都不解压）→ ② 逐源跑现成帧工具、按"逐帧实解 N B"累加 `out_bytes`
 * （解出来的文本落在临时格上）→ ③ 超上限就整份拒 → ④ 逐块写 `content.jsonl`。
 * ⇒ 处理 121 MB 的流时，峰值内存不随总文本量线性增长。
 *
 * @param {{project:string, outDir:string, statusRoot:string, now?:string|Date,
 *          sources:Array<{session_id:string,project:string,file:string,last_event_at:string,
 *                          window?:{from?:string|null, to?:string}, human?:boolean}>,
 *          excludeSessionIds?:string[]}} options
 *   ⚠️ `sources[].window` 是 v1.7 的**可选裁剪窗口**（见文件头）；不给 ⇒ 行为与 v1.6 逐字相同。
 *   ⚠️ `sources[].human` 是 v1.8 的**可选人话过滤**（见文件头）；不给 / `false` ⇒ 行为与 v1.7 逐字相同。
 *      两个键**正交**：可以只给一个、也可以都给。
 *   ⚠️ 解压总量上限只从环境变量 `AGENIA_PACKET_MAX_BYTES` 来（F-144 · 契约 §9.1 ②③④）。
 * @returns {{ok:true, packet_id:string, dir:string, manifest_path:string,
 *            content_sha256:string, frames:object, excluded:Array<{session_id:string,reason:string}>,
 *            packet_bytes:{session_count:number, out_bytes:number, limit:number|null},
 *            cropped:Array<object>, human:object|null}}
 *   `packet_bytes` = 这一次**生效**的上限与量出来的解压总量（`limit === null` = 闸关掉了）。
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
  // F-144：解压总量上限先读 —— 形状不合（负数 / `1KB` …）⇒ **当场** `E_ARG_SCHEMA`，解压一个字节之前就拒。
  const limit = packetMaxBytesOf()
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
  // 本次建的每一个帧临时格都记着：帧工具的输出在"量"那一遍就落盘，打包那一遍还要用它 ⇒ 不能当场删，
  // 统一在 `finally` 里按各自的父目录校验落点再清（清理前仍走 `assertDeletableTempDir`）。
  const tempDirs = []
  const newTempDir = (parent) => {
    const dir = makeTempDir(parent)
    tempDirs.push({ dir, parent: path.resolve(String(parent)) })
    return dir
  }

  try {
    mkdirSync(base, { recursive: true }) // 父是文件 ⇒ 这里就抛（一个包目录都不会留）
    const tool = findZstdTool()

    // ② 量：逐源跑现成帧工具，按它报的**逐帧"实解 N B"**累加 `out_bytes`。
    //    🔴 这一步**不拼任何整份文本**（F-144 的本体）：解出来的文本落在临时格（磁盘）上，
    //       内存里只有帧读数。量的是"读进来多少"（`included` 的那些源），不是"最后留下多少" ——
    //       窗口裁剪 / 人话筛改的是留下哪些行，不改这个数。
    const measured = []
    let outBytes = 0
    for (const source of included) {
      const srcFile = path.resolve(String(source.file))
      if (!existsSync(srcFile)) throw packetError(PACKET_CODES.FRAMES, `会话流文件不在：${srcFile}`)
      if (tool === null) {
        throw packetError(PACKET_CODES.FRAMES, `现成帧工具不在（沿模块目录往上找 ${ZSTD_TOOL_REL}）—— 帧边界没法定，不许自造解压器`)
      }
      const stem = newTempDir(framesParent)
      const r = runFramesTool(tool, srcFile, path.join(stem, 'frames.txt'))
      const first = r.frames.length > 1 ? firstFrameChars(tool, srcFile, stem, r.frames[0]) : countCharsOfFile(r.out_file)
      outBytes += r.out_bytes
      measured.push({ source, frameCount: r.count, framesBytes: r.bytes, frames: r.frames, outFile: r.out_file, firstFrameChars: first })
    }

    // ③ 闸：**先量完所有进包源，再一次比**（§9.1 ⑦：拒的时候 `out_bytes` 必须是全量，
    //    不是"读到被顶住那一刻的前缀和"）。`>` 才拒，`=== limit` 过。
    if (limit !== null && outBytes > limit) {
      throw packetError(
        PACKET_CODES.TOO_LARGE,
        `解压总量 ${outBytes} B 超过生效上限 ${limit} B（进包 ${included.length} 条源）—— ` +
          '只能整份拒；不许少读几帧凑出一份包（少读的帧与"读不到"在包里长得一样）',
        { session_count: included.length, out_bytes: outBytes, limit },
      )
    }

    // ④ 打包：逐源把留下来的行**逐块**写进 content.jsonl —— 与"总文本量"脱钩的就是这一步
    //    （写一块算一块：字节 sha256 + §B3.4 字符数都是流式累加，见 `createContentSink`）。
    mkdirSync(tokenDir, { recursive: true })
    mkdirSync(bodyTmp) // 独占建：撞名即炸，绝不覆盖
    const sink = createContentSink(path.join(bodyTmp, 'content.jsonl'))
    const sourceIds = []
    const croppedReport = []
    const humanReport = []
    let frameCount = 0
    let streamBytes = 0
    let firstFrameCharsTotal = 0
    try {
      for (const item of measured) {
        const source = item.source
        const human = source.human === true
        const cropped = source.crop === null || source.crop === undefined ? null : source.crop
        if (cropped === null && !human) {
          // v1.7 原路（不裁不筛）：整条流按块搬过去，一个字节都不改
          eachChunkOfFile(item.outFile, (chunk) => sink.write(chunk))
          sourceIds.push(source.session_id)
          frameCount += item.frameCount
          streamBytes += item.framesBytes
          firstFrameCharsTotal += item.firstFrameChars
          continue
        }
        // 这条源一条都没留下时，刚写下去的那些字节与账要一起退回去（`mark` / `rewind`）。
        const mark = sink.mark()
        const filtered = filterFileInto(item.outFile, item.frames, cropped, human, sink)
        if (filtered.kept_lines === 0) sink.rewind(mark)
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
        sourceIds.push(source.session_id)
        frameCount += filtered.count
        streamBytes += filtered.bytes
        firstFrameCharsTotal += filtered.first_frame_chars
      }
    } finally {
      sink.close()
    }
    // content.jsonl 的字节与字符读数：全是写的时候一块一块攒出来的，收口只取一次。
    const content = sink.result()
    const frames = Object.freeze({
      count: frameCount,
      bytes: streamBytes,
      first_frame_chars: firstFrameCharsTotal,
      all_chars: content.all_chars,
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
      content_sha256: content.sha256,
      // 空包（`sources: []`）没有解压任何 source ⇒ 如实写"没用到工具"，不编一个像样的路径。
      tool: { path: tool ?? `${ZSTD_TOOL_REL}（未找到；空包没有解压任何 source）` },
    }

    writeFileSync(path.join(bodyTmp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    // 自校验：自己产的包先过一遍自己的校验器，**改名之前**判 —— 不过就清临时目录、当场抛
    // （校验器自己也走流式：整份 content 不读进内存 —— 大包在这一步同样会被打崩）
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
      content_sha256: content.sha256,
      frames,
      excluded,
      // F-144（契约 §9.1 ⑤）：这一跑生效的那个上限与量出来的解压总量 —— **成功路上也要有读数**，
      // 否则"闸在不在"在跑得通的那一跑里读不到。`manifest` 的十个顶层字段不动（账走返回值与 audit）。
      packet_bytes: { session_count: included.length, out_bytes: outBytes, limit },
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
    // 成功 / 失败都清掉：每条源那一格帧临时件 + token 那一格（包本体暂存）；清理前先校验落点。
    for (const item of tempDirs) removeTempDir(item.dir, item.parent)
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

  // content.jsonl：**按块**量字节 sha256 与字符数（F-144）—— 整份读进内存这一步在 121 MB 的包上
  // 会把进程打崩，而"自校验"正是每次打包都会走的那一步。
  let contentIsFile = false
  try {
    contentIsFile = statSync(contentPath).isFile()
  } catch {
    contentIsFile = false
  }
  if (contentIsFile !== true) {
    return { ok: false, code: PACKET_CODES.FRAMES, manifest: man, problems: [problemOf(PACKET_CODES.FRAMES, `content.jsonl 读不到：${contentPath}`)], content_sha256: null }
  }

  const measuredContent = measureTextFile(contentPath)
  const contentSha = measuredContent.sha256
  if (contentSha !== man.content_sha256) {
    return {
      ok: false,
      code: PACKET_CODES.CONTENT_SHA,
      manifest: man,
      problems: [problemOf(PACKET_CODES.CONTENT_SHA, `content.jsonl 的字节 sha256=${contentSha} 与 manifest.content_sha256=${man.content_sha256} 不一致`)],
      content_sha256: contentSha,
    }
  }

  const allChars = measuredContent.all_chars
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
