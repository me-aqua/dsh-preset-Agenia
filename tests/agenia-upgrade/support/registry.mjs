/**
 * 用例注册表 —— **登记面**。分母不在这里：分母是 `discover.mjs` 从盘上数出来的那个数。
 *
 * 冻结依据：契约 §9.1（55 个自动用例的分组与 ID）+ 提案 §B1.4（测试文件落点表）
 * + 拍板 I9（"55 个自动用例的注册表以 `support/registry.mjs` 形状为准，由测试岗逐条核对，
 *   并在红基线里给出分母"）。
 *
 * 两个来源，一个分母（F-57）：
 *   · **发现**（`DISCOVERY`）—— 盘上 `test('<ID> …')` 的条数，这就是 `TOTAL`；
 *   · **登记**（`REGISTRY`）—— 这张表。它只负责"这条用例该在哪个文件、属于哪一批"。
 *   ！两边对不上由 `registryProblems()` 报红（四个方向都报、点名文件与 ID），**不让分母自己漂**。
 *   历史冻结的 55 条以 `FROZEN_IDS` 这份**显式清单**存在 —— 一条都不许少，但它不再是一个计数常数。
 *
 * 三个状态词（**不是** skip / 不是通过）：
 *   · `written`        —— 本批已写的可执行用例（首跑必须 RED）
 *   · `pending-write`  —— 已登记、尚未落笔（**留在分母里**，红基线里明写"未写"）
 * 分母口径：一个用例 = 盘上一个以 ID 开头的 `test()`；它由发现器数，不随被测对象缺失而缩水。
 *
 * ⚠️ 一处需要组长确认的**表内冲突**（没有自创，只是归一，见 RCP-03 的 notes）：
 *   契约 §10.2 与提案 §B1.4 的同一张表把 `RCP-03` **同时**列在
 *   `integration/technical-review.test.mjs`（列 REV-03、RCP-03）与 `unit/receipts.test.mjs`
 *   （列 RCP-01/02/03/04）两行。注册表只能给一个 `file`，本表归一到前者
 *   （锚点用例需要技术作业的真实产物），并把差异记在这条上。
 */
import { discoverCases, consistency } from './discover.mjs'

/** 本批（红测试批次 A）已写的 14 条：STAT-01..05 · DOC-01 · RT-01..08。 */
export const BATCH_A = [
  'STAT-01', 'STAT-02', 'STAT-03', 'STAT-04', 'STAT-05',
  'DOC-01',
  'RT-01', 'RT-02', 'RT-03', 'RT-04', 'RT-05', 'RT-06', 'RT-07', 'RT-08',
]

/** 批次 B 的 6 条（guard 三件 + 静态角色/读取义务/环境扫描）—— 裁定 A4 冻结的 `delegationTools` 是它的接口。 */
export const BATCH_B = ['GRD-01', 'GRD-02', 'GRD-03', 'REV-02', 'READ-01', 'ENV-02']

/** 批次 C 的 9 条（回执/报告/健康/data-root —— 走 read/report 层与 CLI，不需要真机停机）。 */
export const BATCH_C = ['RCP-01', 'RCP-02', 'RCP-04', 'MEM-10', 'HLT-01', 'HLT-02', 'DR-01', 'DR-02', 'DR-03']

/**
 * 批次 D 的 11 条（记忆核心：MEM-01..09 + MEM-11 + MEM-12）。
 * ⚠️ 派工单写"批次 D（记忆核心 12 条）"并列出 `MEM-01..09 + MEM-11 + MEM-12` = **11 个 ID**；
 *    差的第 12 条是 **MEM-10**，它已在**批次 C** 写完（记忆组 12 = 11 + MEM-10 已在批 C）。
 *    本表按**显式 ID 清单**登记（清单比标题里那个数更具体），差异记进 batch-D 基线。
 */
export const BATCH_D = ['MEM-01', 'MEM-02', 'MEM-03', 'MEM-04', 'MEM-05', 'MEM-06', 'MEM-07', 'MEM-08', 'MEM-09', 'MEM-11', 'MEM-12']

/** 批次 E 的 9 条（真子进程/故障注入层：事务与锁、作业状态机与通知、runner 自检）。 */
export const BATCH_E = ['STO-01', 'STO-02', 'STO-03', 'STO-04', 'JOB-01', 'JOB-02', 'JOB-03', 'JOB-04', 'ENV-01']

/** 批次 F 的 6 条（最后一批：会话包 / 技术作业锚点 / 安装回滚发布扫描）。 */
export const BATCH_F = ['REV-01', 'REV-03', 'RCP-03', 'INS-01', 'INS-02', 'INS-03']

/**
 * 批次 G 的 11 条 —— `proposal_file` 那套用例（F-53 写在 `.team/` 里的真身，F-57 搬进项目）。
 * 它们此前不进 git、也不进分母；搬进来之后走 `node:test` + `runCase`，与其余 55 条同形。
 */
export const BATCH_G = ['PFL-01', 'PFL-02', 'PFL-03', 'PFL-04', 'PFL-05', 'PFL-06', 'PFL-07', 'PFL-08', 'PFL-09', 'PFL-10', 'PFL-11']

/**
 * 批次 H 的 4 条 —— **门 1 · 回执链路四票**（`F-120`～`F-123`，2026-10-22）。
 *
 * 四票是同一句话的四张脸：**校验方不自己复算，只信作业自报**。
 *   · `VRF-01` `F-120` 指纹口径（`.tools/fingerprint.mjs` 的排除表按**根相对**写）
 *   · `VRF-02` `F-121` `findings_set_sha256` 必须由校验方复算（含 `receipt-check` 这个真消费点）
 *   · `VRF-03` `F-122` `code_fingerprint.equal` 是自报 ⇒ 拒三种形状
 *   · `VRF-04` `F-123` 「打的是哪棵树」逐树枚举，不是盯 `inject.js` 一份
 * 契约在 `CONTRACT.md` §6（本批与契约同批落盘）。
 * ⚠️ 它们**不进** `FROZEN_IDS`：那张清单是历史冻结的 A–F 55 条；批次 G/H 各自
 * 以**显式 ID 清单**存在（同一条政策：清单比计数常数硬）。
 */
export const BATCH_H = ['VRF-01', 'VRF-02', 'VRF-03', 'VRF-04']

/**
 * 批次 I 的 3 条 —— **门 1 · `F-112` 剩下两格**（+ 顺手 `F-111③`，2026-10-22）。
 *
 * 三格是同一句话的三张脸：**照着一张声明的名字表签字**。
 *   · `SURF-01` `F-112` ① 注入面清单「声明了就必须在盘上」（删 `persona.md` / `style.md` 原来一声不响）
 *   · `SURF-02` `F-112` ② `inject.js` 兜底名单的注释与常量必须是同一个名单
 *     （注释说 `memory` 不在、常量里它在 ⇒ 读注释的人与跑代码的人拿到两个答案）。
 *     🔴 2026-10-22 收口：**声明必须机读** —— 注释块里没有 `@roster` 那一行 ⇒ 红；散文不算声明。
 *   · `SURF-03` `F-112` ① 的**补格**：在盘上还不够，**不许是空壳**（去掉空白后必须还有字）。
 *     2026-10-22 补：`SURF-01` 当时只判 `existsSync`，1 字节占位（`AGENTS.md` 那种）会假绿。
 *     两根轴**各报各的**：缺一份只红 `SURF-01`，改成 1 字节只红 `SURF-03`。
 * 契约在 `CONTRACT.md` §7（本批与契约同批落盘）。
 * ⚠️ 它们**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H 的规矩。
 */
export const BATCH_I = ['SURF-01', 'SURF-02', 'SURF-03']

/**
 * 批次 J 的 3 条 —— **门 1 · `F-125`**（每条进库的正文都有 400 字上限，2026-10-22）。
 *
 * 三板是同一句话的三张脸：**同一个上限只挂在一条入口上，就等于没有**。
 *   · `MTC-01` `F-125` `payload.entry.text` 401 必拒 / 400 必过（纯函数 + **两条导入 CLI**
 *     `--op maintenance-import` / `--op proposal-import`：401 ⇒ exit 2 且零写入，400 ⇒ 追加一行）
 *   · `MTC-02` `F-125` `payload.engine_ops[].entry.text` 401 必拒 / 400 必过（**别只查一处**；
 *     真维护案用的就是这一格，纯 retire 案不许被误伤）
 *   · `MTC-03` **阳性对照**（旧的**工具**面，不是导入面）：普通候选 401 字仍被 `proposal-file.mjs`
 *     拒（400 过 · 同一把尺子）—— 它证明"同一台机器、同一把尺子"，不是"CLI 那条路没闸"的证据。
 * 契约在 `CONTRACT.md` §8（本批与契约同批落盘）。
 * ⚠️ 它们**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H / I 的规矩。
 */
export const BATCH_J = ['MTC-01', 'MTC-02', 'MTC-03']

/**
 * 批次 K 的 1 条 —— **门 2 · `F-129`**（`anchors` 的形状不对被当成「没给」，2026-10-23）。
 *
 * 一张脸：**「没给」与「给错了」必须分开** —— 判"给没给"用的是"是不是对象"，于是字符串 / 数组 /
 * 数字 / 布尔（以及对象里某一项不是 64 hex）都被静默当成"这一格没给"，`ok:true` 回来了，
 * 校验方以为自己核过了，其实一个字节都没核。
 *   · `ANC-01` 八格：非对象 / 短哈希 / 一半坏 / 坏值 ⇒ `E_ARG_SCHEMA`；`null` 与全对 ⇒ `ok:true`；
 *     真对不上 ⇒ 仍 `E_CODE_FINGERPRINT_MOVED`。`null` / 省略 那一格还要判 `detail`（非空且写明"判不了"，
 *     空串读起来就像"核过"）—— 形状对了、detail 什么都没说，是**另一个**红因（`ANCHORS-NULL-DETAIL-SILENT`）。
 *     **第三态**（同一格、不新开格）：`{}` / 两项都写成 `undefined` —— **对象在、但一项都没给** ⇒ 与 `null` 同形
 *     （同一段结论含「判不了」，各自前缀不同；一项都没核 ⇒ 判不了）；而 `{before_sha256: SHA_A}`（给了一项、核过一项）
 *     ⇒ 走"判过"那一侧（`G2`），`detail` **必须是空串**（判过了却写"判不了" ⇒ 红因 `ANCHORS-GOOD-DETAIL-CAVEATED`）。
 *     **第二项也要被读到**：`S2` 另喂 `after=null` 与 `after=''`（`null` 是"给了但形状不对"⇒ 拒，`undefined` 才是"没给"⇒ 跳过），
 *     `S3` 另喂 `{SHA_A, false}`；**次序**另有 `D2`（坏 `fp` + 非对象 `anchors` ⇒ 必须报 `fp` 那条，红因 `ANCHORS-ORDER-SWAPPED`）。
 *     外加**阳性对照**（照契约写的最小实现八格全过）与**三把反向刀**（删掉「非对象就报错」那一行 ⇒ 只有 `S0` 翻面；
 *     挖空 `null` / 省略 / 第三态共用的那句「判不了」⇒ `G1` 四形一起翻红；给"判过"那一侧加 caveat ⇒ `G2` 两形一起翻红 ——
 *     两次都另有"只翻一部分"的分项红因 `KNIFE2-PARTIAL` / `KNIFE3-PARTIAL`）。
 * 契约在 `CONTRACT.md` §6.3（同一族：`F-122` 的三样必须自己判）；定形在
 * `.team/leader/2026-10-23/spec-F-129.md`。
 * ⚠️ 它**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H / I / J 的规矩。
 */
export const BATCH_K = ['ANC-01']

/**
 * 批次 L 的 3 条 —— **门 2 · `F-148`**（思考链里「≤3 单元」的段落不进会话历史，2026-10-23 · 紧急票）。
 *
 * 三张脸：**清得对**（纯函数 + 流式）· **挂得上**（接缝的 delta 层）· **落得下**（装配之后那一份）。
 *   · `RFG-01` `F-148` `lib/reasoning-filter.mjs`：单元表七行 + `P0` + 四条易踩口径 · 3/4 边界 · `\r\n`
 *     · 空段落 · 围栏六格（老板 14:08 补的代码块例外）· 一字符一切/跨 delta 的**逐字节等价**
 *   · `RFG-02` `F-148` `inject.js` 的 `llm/stream` 监听器（delta 层）：**同步**返回 AsyncIterable
 *     （`dsh-agent-loop` 是 `for await`）· 只改 `reasoning-delta` · 其它 chunk 同对象同次序 · 出错不抛 + 出声一次
 *   · `RFG-03` `F-148` **落盘的那一份**：真适配器形状（`block-start` → delta → `block-end` 载荷 = 未过滤全文
 *     → `usage` → `finish`）装配之后必须等于清洗结果 · 只有 `block-end`、没有 delta 的形状也得清 ·
 *     尾巴排在 `finish` **之前** · text 块载荷一个字节不动。⚠️ 2026-10-23 14:4x 第 2 关重开时补的：
 *     只改 delta 会被 `block-end` 载荷整份覆盖（`dsh-llm/lib/index.js:1020-1021`）。
 * 契约在 `CONTRACT.md` §10（本批与契约同批落盘）；定形在 `.team/leader/2026-10-23/spec-F-148.md`。
 * ⚠️ 它们**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H / I / J / K 的规矩。
 */
export const BATCH_L = ['RFG-01', 'RFG-02', 'RFG-03']

/**
 * 批次 M 的 1 条 —— **门 2 · `F-152`**（板子把两种「没验过」说成同一句话，2026-10-23）。
 *
 * 一张脸：**同一个句子里，两种现场必须说两句不同的话** ——
 * `afterTest > 0` 那一支没先问「叫过测试没有」，于是一个**一次测试都没叫过**的会话只要动过项目文件，
 * 就会读到「最后一次测试之后，项目文件又动过 N 次 —— 那次测试作废」，可那次测试从来没发生过。
 *   · `BRD-01` 四格（A 叫过开发没叫过测试 / B 从没叫过测试但文件动过 / C 叫过测试之后又动了 /
 *     D 评审之后别的岗位又写了 —— `F-160` `P16`/`P17` 加的第 4 格）：
 *     判的是**注入文字**（假 ctx 上跑 staged `inject.js` 的 `apply()` → 喂 `tools/result` → 走一次
 *     `agent/pre-step` 瀑布 → 读那一步真的塞进请求的那条尾巴）；每格断言"该出现的那一句 + 不该出现的那几句"，
 *     外加进度行的前置（`BRD-STATE-SETUP`）· 阳性对照（照 §3.3 写的最小实现三格全成立）·
 *     反向刀（删掉「从没叫过测试、但文件动过」那一支 ⇒ **只有 B 格**翻红）。
 *     D 格只加**同一用例里的两条输入**，不动分母（98）：D1 评审之后动过 ⇒ 必须说「有新改动」+「还没被评审过」、
 *     不许说「评审作废」「要重审」；D2 评审之后什么都没写 ⇒ 那一行整个不许出现。口径在 `CONTRACT.md` §14.0。
 * 契约在 `CONTRACT.md` §3.3（板子告警的三态）；定形在 `.team/leader/2026-10-23/spec-F-152.md`。
 * ⚠️ 它**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H / I / J / K / L 的规矩。
 */
export const BATCH_M = ['BRD-01']

/**
 * 批次 N 的 2 条 —— **门 2 · `F-155`**（"今天开过工"既没有载体、也没有署名，2026-10-23）。
 *
 * 两格是同一句话的两张脸：**那份每日状态不记"谁开的这一天"，卡片也就说不出"是不是本会话"。**
 *   · `DLY-01` **写面**（`--op daily-start`）：第一次调用那几项**永不覆盖**（`first_session_id` / `first_at`），
 *     之后只更新"最后一次见到"（`last_session_id` / `last_seen_at` / `seen_count`）；
 *     **旧形状**（只有 `session_id` + `updated_at`）读得懂并升成新形状（老的当 `first_*`）；
 *     **不带 `session_id` 的调用**照样记一次，`first_*` 保持原样（从来没有过 ⇒ null）。
 *     四格（两次调用 / 旧形状 / 没带 session_id 且从来没有 / 没带 session_id 但先由别人开了）
 *     + 阳性对照（照契约 §11 的最小实现）+ 四把刀（旧形状不升级 / 完全不合并 / 每次覆盖 / 覆盖的窄形状）。
 *   · `DLY-02` **读面**（`--op health-read`）：`daily` 在、`local` 不在那一支，`detail` 必须点名
 *     `first_session_id` 与 `first_at`，并按 payload 的 `session_id` 分三种话（本会话**刚开工** /
 *     **本会话不是**开这一天的人 / 没带 `session_id` 时**不许冒充知道是谁**）；
 *     `status` 与 reason 码**一个都不动**（`RED` + `E_DATA_MISSING` 是今天就已经成立的那一半）。
 *     五格（B1 无 daily/local 保持 HOLD / B2 别人开的 / B3 本会话开的 / B4 没带 session_id /
 *     B5 端到端：真 `daily-start` 写下的那份卡片读得出来）+ 阳性对照。夹具里旧那个单值键 `session_id`
 *     = **最后一次调用的人**、`first_session_id` = **开这一天的人**，两者故意不同（谁去读旧键，B2/B3 当场翻面）。
 * 契约在 `CONTRACT.md` §11（本批与契约同批落盘）；定形在 `.team/leader/2026-10-23/spec-F-155.md`。
 * ⚠️ 它们**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H / I / J / K / L / M 的规矩。
 * ⚠️ **分母 81 → 83**（两格，不是一格加两条输入）：写面与读面是**两处不同的红因**
 *    （"字段没写下来" vs "detail 没点名/说错了谁"），一把刀也只能落在其中一处。
 */
export const BATCH_N = ['DLY-01', 'DLY-02']

/**
 * 批次 O 的 1 条 —— **门 2 · `F-156`**（三个本地节点没有写者，卡上永远说「本地双评审没启动」，2026-10-23）。
 *
 * 一张脸：**`local-claim` / `local-mark` / `local-fail` / `local-read` 四个 op 的行为**（不是"谁来调"）。
 *   · `LOC-01` 四格（真子进程 + 每格一个带 marker 的临时工作区）：
 *     `L1` `claim → mark` ⇒ 节点 `done` + 产物锚点（`report_sha256` **必须等于报告盘上字节**）+ claim 痕迹保留；
 *     `L2` `claim → fail` ⇒ 节点 `failed` 且 `failure_reason` **逐字**留住；
 *     `L3` **两个节点真并发 claim**（`conversation` + `technical` 两个真子进程）⇒ 谁都不许覆盖谁；
 *     `L4` **任何 claim 之前** `local-read` ⇒ `E_DATA_MISSING` + exit 7（缺 ≠ 坏 ≠ 空），
 *     且首个 claim 之后没被 claim 的两个节点以**文档里的空形状**（`unclaimed` + 15 个必填键）出现。
 *     外加阳性对照（照 `CONTRACT.md` §12 写的最小实现四格全成立）与**五把刀**
 *     （① `claim` 丢掉按节点合并 ⇒ **只有 `L3`** 翻面；② `fail` 丢掉 `reason` ⇒ **只有 `L2`** 翻面；
 *     ③④ 是量具自证：③ `mark` 不记锚点 ⇒ 只有 `L1:A`；④ `mark` 不核锚点 ⇒ 只有 `L1:B`；⑤ `emptyNode()` 丢那 10 个键 ⇒ 五条一起翻）。
 *     ⚠️ 这五把的 id 是 `K1`–`K5`（批次 **Q** 那**六**把是 **`KQ1`–`KQ6`** —— 两套同名会让"`K4` 翻了哪几格"查串）。
 *   · 🔴 **今天这四个 op 的行为本身已经是对的**（2026-10-23 门 2 现量）⇒ 这一格**不是首跑红**，
 *     它今天 **RED 0**，是"已写入契约的三态语义"的**回归锁**；红只可能是有人把语义改坏了。
 *     这一票缺的是**调用者**（写者 = 组长，`CONTRACT.md` §12），那一半是流程，测试判不了。
 * 契约在 `CONTRACT.md` §12（本批与契约同批落盘）；定形在 `.team/leader/2026-10-23/spec-F-156.md`。
 * ⚠️ 它**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H / I / J / K / L / M / N 的规矩。
 * ⚠️ **分母 83 → 84**（一格四格：四个 op 的四条腿同住一个文件 —— 它们判的是**同一份文件**的三态）。
 */
export const BATCH_O = ['LOC-01']

/**
 * 批次 P 的 6 条 —— **`F-158`**（"今天"从本地 **04:00** 切，不从 0 点切，2026-10-24）。
 *
 * 六格是同一句话的六张脸：**一天的边界在本地 04:00 —— `dayKeyOf(instant) = 本地日期(instant − 4h)`，一处算、处处用。**
 *   · `DBY-01` **切点下方** `2026-10-24T03:59:59+08:00` ⇒ `2026-10-23`：那一处算（`lib/route.mjs::dayKeyOf`，
 *     定形落点 3 点名"它本身就是那个函数"）+ **四个消费方的缺省日**（`daily-start` / `claim-update` /
 *     `daily-cards.py` / `local-claim`）+ `report-read`（**体检那条红走的同一条路**）+ **票号那 8 位**的形状（§13.4）。
 *     另配一把**切点刀**：把 `.tools/daily-cards.py` 的 `DAY_CUT_HOURS` 改成 3（跑的是运行根里的副本）⇒ 这一刻
 *     必须翻到 `10-24` —— 证明"Python 那份切点被钉在 4 小时"这条腿**能翻面**
 *   · `DBY-02` **切点上方** `04:00:01` ⇒ `2026-10-24`：同一批消费方，方向相反；切点刀改成 5 小时 ⇒ 翻回 `10-23`。
 *     ⚠️ 这一侧在**两种尺子下同值** ⇒ 它证明的是"别把切点上方也挪走"；纯函数那一格要红得用 `K2`（切点搬到 05:00）
 *   · `DBY-03` **四处入口同一个 01:30**（老板那张现场：凌晨一点半还在干前一天的活）：
 *     `claim-update` / `daily-start` / `daily-cards.py` / `local-claim` 的**缺省日**必须都落到 `2026-10-23`，
 *     而且**互相同值**（各自对 + 彼此相同是两层判据 —— 一起错也是一种同值）；另判**量具自证**
 *     `cardsKindOf`（`resolved` 之前必须 `exit_code === 0`，四行合成读数）
 *   · `DBY-04` **显式 day 的两种形态**：① 好值照抄（两个方向）；② **给了但坏 ⇒ `E_ARG_SCHEMA`**（`""` / 全空白 /
 *     `2026-13-40` / `2026-02-30` × 五个消费方 —— 裁定："给了就必须是 day key，不许吞成没给"）。
 *     `2026-13-40` 这类"形状合规、日历上不存在"的值与空串走**同一条**规则（`isDayKey` 连日历往返一起验）；
 *     边界：形状合规**且**日历合法、只是没人会写的日子（如 `1999-01-01`）仍然被收下 —— 那不是校验能管的事
 *   · `DBY-05` **体检那条红**（`.tools/check-notes.mjs` 的「今天的记忆更新报告在」）：注入 01:30 ⇒ 那一行必须点名
 *     `2026-10-23`；注入 `2027-01-02T04:30`（那一天盘上必然没有报告）⇒ 必须点名那一天**且是红的**。
 *     ✅ 这个工具**走同一把尺子**（`:241` 是 `dayKeyOf(clockNow())`，`:23-24` 从 `lib/clock.mjs` / `lib/route.mjs` 取）
 *     ⇒ 这一格守的是"别退回去"
 *   · `DBY-06` **根上有过期的 `current-day` 指针**（裁定 F4-b）：指针 `10-23`、时钟 `11:00`、
 *     不给 `day` ⇒ `claim-update` / `daily-start` 的缺省日必须落到 `2026-10-24`（另两个消费方只记读数）。
 *     两条腿**各有各的脑根**、各自种一次过期指针（`claim-update` 会把指针写成 10-24，共用根就等于
 *     把后一条腿的现场抹掉 —— 门 4 复审 R1），开跑前从盘上读回指针当见证。
 *     指针留着给**中途** op（`P2` 那一格）
 *
 * 契约在 `CONTRACT.md` §13（本批与契约同批落盘）；定形在 `.team/leader/2026-10-23/spec-F-158.md`。
 * ⚠️ 它们**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H / I / J / K / L / M / N / O 的规矩。
 * ⚠️ **分母 84 → 90**（六格，不是一格加五条输入）：六处**不同的红因** —— 切点下方算错 / 切点上方被挪 /
 *    四处各算各的 / 显式好值被吞或又被换算一次、坏值被吞 / 体检那条红不听时钟 / 缺省日被过期指针拐走。
 *     一把刀只能落在其中一处，所以它们不能合成一格。
 */
export const BATCH_P = ['DBY-01', 'DBY-02', 'DBY-03', 'DBY-04', 'DBY-05', 'DBY-06']

/**
 * 批次 Q 的 3 条 —— **门 2 第二轮 · `F-156`**（`local-mark` 的产物锚点闸三条规则，2026-10-24）。
 *
 * 证据：`.team/retro/2026-10-24/技术评审.md` 的 `F1`–`F3`（两次复现）；裁定：老板 2026-10-24 选项 1（**要求按字段**）。
 * 三格是三条规则，一格一条（红的时候一眼看得出是哪一条）：
 *   · `LOC-02` **按字段的必填 + 三件套要么都给**：`memory-review` / `conversation` **只交报告**（真路径 + 真 SHA256、
 *     不带 findings）⇒ `done`，盘上节点 `report_path` / `report_sha256` 是真锚点、`findings_*` 三个留 `null`；
 *     `technical` **不带 findings** ⇒ 拒 `E_ARG_SCHEMA` · exit 2 · 节点停在 `running` · **状态文件零写入**；
 *     `technical` 带真 findings 产物 ⇒ `done`（五个锚点逐项记下）；**半套三件套两个方向都拒** —— ① `memory-review`
 *     只给 `findings_count`、② `conversation` 给 path + set 却不给 count ⇒ 都是 `E_ARG_SCHEMA` · 零写入。
 *     刀 `KQ1` 三个字段都要 findings ⇒ 只翻 `A`/`B`；`KQ2` 三个字段谁都不要 ⇒ 只翻 `C`
 *     （"technical 仍然要交"那条腿翻面的唯一办法）
 *   · `LOC-03` **`findings_count` 与产物条数对账 + 产物读不出来**：盘上 3 条 + `0` ⇒ 拒、3 条 + `9` ⇒ 拒（**两个方向**：
 *     只挡"多报"的半修在 `0` 上会漏，而 `0` 恰好最容易被读成"查过了、没问题"）；3 条 + `3` ⇒ `done`；空 findings + `0`
 *     ⇒ `done`（零条发现是合法产物）；**文件在盘上却读不出 `findings` 数组**（合法 JSON 但没有那个数组 / 半截 JSON）⇒
 *     `E_DATA_CORRUPT` · exit 7 · 零写入（与"文件不在"的 `E_DATA_MISSING` 是两个诊断）。刀 `KQ3` 收下不对账 ⇒ 只翻 `A`/`B`
 *   · `LOC-04` **锚点必须落到 `.team/` 里的真文件，落盘记规范形**（`.team/` 首段固定小写、其余段按磁盘真名；老板 2026-10-24 的改判：收 + 归一化，不再"只收
 *     canonical"）：同一个文件的**十一种**写法 —— `A` 规范形 ⇒ `done`；`B` `README.md`（落在 `.team/` **外**）⇒ 拒；
 *     `C` `./.team/…` · `D` `retro/…`（**`.team` 相对**，`RCP-03`/`VRF-02` 用的就是这一种）· `E` 反斜杠 ·
 *     `G` 工作区内绝对路径 ⇒ **收 + 节点上记 `.team/<…>`（正斜杠）**；`K` **`.TEAM/…`（前缀换大小写）** ⇒ **收 + 记规范形**
 *     （首段 `.TEAM` → `.team`，其余按磁盘真名；本平台 Windows 不分大小写：位置判定跟平台路径语义走，不是字符串前缀比较 —— 第 4 关复审 round 2 的 `F3`）；
 *     `F` 文件不在 · `J` `.team` 相对但文件不在 · `I` `.team/../…`（`..` 穿出 `.team/`）· `H` 工作区外绝对路径
 *     ⇒ **同一个诊断** `E_DATA_MISSING` · exit 7。
 *     刀 `KQ4` 去掉"必须落在 `.team/` 下"⇒ 只翻 `B`/`H`/`I`；`KQ5` 验的时候归一化、**落盘却记调用方写法** ⇒
 *     只翻 `C`/`D`/`E`/`G`/`K`（"验对了但记错了"那种半修，只有它抓得到）；`KQ6` 把位置判定退回**大小写敏感的前缀比较**
 *     ⇒ 只翻 `K`（这一条将来全绿时**也能翻面**）
 *
 * 契约在 `CONTRACT.md` §12（`F-156` 那一节，按字段的句子由实现岗落）；证据与红向量在
 * `.team/test/2026-10-24/log.md` 第三节。三格同住一个文件（`loc02-per-field-anchors.test.mjs`）：
 * 三个规则共用同一份产物与同一个 REF / 刀架，红的时候报的那一行就带着 `格:输入`。
 * ⚠️ 它们**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G / H / I / J / K / L / M / N / O / P 的规矩。
 * ⚠️ **分母 90 → 93**（三条规则各有自己的红因：被逼着编摘要 / 计数不对账 / 锚点落点与规范形 ——
 *    一把刀只能落在其中一处，所以它们不能合成一格）。
 */
export const BATCH_Q = ['LOC-02', 'LOC-03', 'LOC-04']

/**
 * 批次 R 的 1 条 —— **`F-163`**（平台版本那条读数自己得先证明"读的是哪一版"，2026-10-24）。
 *
 * 病根：asar 目录头里的 `size` 是**声明值**。`0.2.1-rc.3` 这一包把
 * `package.json` / `dsh/node_modules/@deepseek-ai/dsh/package.json` 的声明长度写得比源文件短 2 B
 * （声明 797 / 7989；源文件 799 / 7991；asar 里能解析的 JSON 文本 798 / 7990，结尾的 `}` 在声明边界外 1 B）
 * ⇒ 按 `size` 精确读会把结尾的 `}` 切掉 ⇒
 * `JSON.parse` 抛 ⇒ 套件印 `[平台] 🔴 判不了`，而**没有任何一条用例证明过它读的是哪一版**。
 *
 * 一格五条腿（合成 asar 造在运行根里；真实 asar / `presets/**` 一个字节都不写）：
 *   · `A SHORT-2`：头里的 `size` 比真身短 2 B，两份 package.json 都必须读出**夹具里那个版本**；
 *   · `B BOM`：同一形状 + 文件头 `\uFEFF`，版本换成**另一个值** ⇒ 证"读的是这一份"（不是常量）；
 *   · `C TRUNCATED`：短 24 B（> 16 B 读窗）⇒ `ok:false`、版本 `null`，报文点名**文件 / 窗口 / 最后 40 字**，
 *     **不许补括号**把它"修"成 JSON；同一 asar 里没被截断的那一份照读；
 *   · `D PURE`：把容错解析当纯函数再喂两串文本（短 2 B / 截断），与 A/C 是同一条腿的两种入口；
 *   · `E LIVE`：这一跑真实 asar 上的 `[平台]` 行（**读数**，不写死版本；没有安装包时如实记 `asar_present:false`）。
 *
 * 契约：`tests/agenia-upgrade/support/platform.mjs::parseAsarJson` 的报文口径（文件 / 窗口 / 最后 40 字）。
 * 证据：`.team/test/2026-10-24/log.md` 第七节。⚠️ 它**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条）。
 * ⚠️ **分母 93 → 94**（一条读数自己的阳性/阴性对照：读对了、读错了、坏文件必须出声，一把刀落在其中一处）。
 */
export const BATCH_R = ['PLT-01']

/**
 * 批次 S 的 2 条 —— **门 2 · `F-162` 的两半**（`local-mark` 存回执三件套 + 卡的第二半，2026-10-24）。
 *
 * 两格是同一句话的两头：**收下的锚点要落盘，落不了的锚点卡上要红**。
 *   · `RCP-05` **回执三件套进 `local-mark`**（`CONTRACT.md` §12.2.4）：真子进程 + 每条输入一个带 marker 的
 *     临时工作区，**十三种输入**全部走"必交"那一支（先 `claim` + 回执真的落在 `.team/leader/<day>/` 下）：
 *     `A` 三件齐全且正确 ⇒ `done`（节点三格 = **盘上字节**的 SHA256 / `.team` 相对路径 / 回执声明的版本，
 *     `local-read` 读得到，且摘要 **≠** 回执自报的那个值）· `B0` 必交却没给 ⇒ `E_ARG_SCHEMA` ·
 *     `B1`/`B2`/`B3` 半套（各缺一件）⇒ 同一个 `E_ARG_SCHEMA` · `C` 摘要与字节不符 ⇒ `E_ARG_HASH` ·
 *     `D1`/`D2`/`D3` 回执没声明整数 `version`（缺 / 字符串 / `0`）⇒ `E_DATA_CORRUPT` ·
 *     `E1`/`E2` `memory_review` / `conversation` 交任一件回执锚点 ⇒ `E_ARG_SCHEMA` ·
 *     `F` 回执在 `.team` 外 ⇒ `E_DATA_MISSING` · `G` 版本不符 ⇒ `E_ARG_SCHEMA`；
 *     被拒的每一步**零写入**（比状态文件 SHA256）+ 节点仍 `running`。另加阳性对照（照裁定写的最小实现
 *     十三条全成立）与三把刀：`KR1` 删掉三行写回 ⇒ 只翻 `A` · `KR2` 档位恒 `optional` ⇒ 只翻 `B0` ·
 *     `KR3` 摘要不与字节对账 ⇒ 只翻 `C`（三把刀都在**全部十三种输入**上量）。
 *   · `HLT-03` **卡的第二半**：`technical` 已 `done`、回执在盘上、三个锚点只齐 1–2 个 ⇒ `RED E_RECEIPT_ANCHOR`；
 *     回执**不在盘上** ⇒ `RED E_RECEIPT_MISSING`；三个锚点全齐 + 回执在盘上 ⇒ `GREEN`（阳性对照）。
 *     判的是**真实卡那一扇门**（`agenia-local.mjs --op health` → `healthVerdict` → `buildHealthCard` →
 *     `<工作区>/.team/brain/<day>/health.json`），不是脑侧 `health-read`（那一扇对真实根会 `E_ROOT_REAL_BRAIN`）。
 *     证据：`.team/review/2026-10-24/F-162-第4关-评审.md` §7（这一族**一条判据都没有**，连票面那个红因
 *     `E_RECEIPT_ANCHOR` 在整棵测试树里都零命中）。⚠️ 它们**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条）。
 * ⚠️ **分母 94 → 96**（两格各一条 `test()`）。
 */
export const BATCH_S = ['RCP-05', 'HLT-03']

/**
 * 批次 T 的 2 条 —— **门 2 · `F-160`**（技术评审评的是**派工那一刻的提交**，不是活树，2026-10-24）。
 *
 * 病根是今天 11:05–11:35 量出来的：前后 CODE 指纹一直量在**活树**上，而活树里装着"别的岗位此刻正在写的文件"
 * ⇒ `equal:true` 在派出那一刻就注定失败（25 分钟翻了 7 次、`changed[]` 4 → 18；
 * 四份 findings 内容可用、**效力作废**）。根因不是排除表，是**对象选错了**：要钉在不可变对象上。
 *
 * 两格是**同一把尺子的两个方向**（少任何一个方向，新口径都是只会往"有效"那一边倒的判据）：
 *   · `REV-04` **活树在窗口里动了 ⇒ 本轮仍然有效**：夹具仓库（两次提交、钉住哈希）+ 导出器落只读副本，
 *     副本逐份 `git blob` SHA-1 = 该提交、CODE 指纹 = 卡片上的 `before_sha256`（提交侧从 git 对象独立算出来）；
 *     窗口里动活树两处（改一份 + 加一份，都进 CODE 名单）⇒ **副本前后 equal:true（有效）**，
 *     而**活树前后 equal:false**（旧口径会作废这轮好评审 —— 今天红的就是这条）。
 *     校验模式必须自己复算：`equal:true` · `is_that_commit.ok:true` · 活树动了 **2** 处
 *     （**不是**"副本 vs 活树的分歧"：今天真仓库是 135 份提交 vs 192 份活树，分歧 57 —— 按分歧报就是读数撒谎）；
 *     没给活树基线 ⇒ 变动数必须**判不了**（`null` + 一句说法），不许读成 0；同一个 `--out` 再导一次必须拒（读数不许原地覆盖）。
 *     另加真仓库里**钉住的一个提交**（`8b7cea6…`）那一段：副本仍必须是它、CODE 指纹仍必须对得上。
 *   · `REV-05` **评审自己动了副本 ⇒ 本轮作废**：单因（活树一个字节不动），改副本里一份 CODE 文件
 *     ⇒ 副本前后 `equal:false`、`changed[]` 恰好那一份、活树前后 `equal:true`；
 *     校验必须自己复算 ⇒ `equal:false`（**不许照抄卡上的值**）+ `is_that_commit.ok:false` 并**点名**哪一份文件；
 *     再拿**另一个提交**去核一份干净的副本 ⇒ `equal:true`（副本确实没动）但 `is_that_commit.ok:false`
 *     —— 两条腿互相独立，只比哈希的实现会在这一格上"绿得看不出来"。
 *   · `F-160` 第 4 关留下的两笔（`P7`/`P8`，**不加格、不动分母**）：
 *     `REV-04` `C` 段加**夹具自检**（`LIVE-COUNT-FIXTURE`）——「按分歧报 moved」那条判据的样本取决于
 *     「分歧 ≠ 变动」，夹具一旦把两个数做成一样，那条判据静默空转 ⇒ 当场红；
 *     `REV-05` 的「`live.moved` 必须是 0」那条腿改成 **`null` 也红**（`LIVE-COUNT-UNMEASURED`）——
 *     "判不了"不许通过一条要求"必须是 0"的腿。
 *
 * 契约（判断形状、CLI、JSON 字段、三份文档的针）在 `.team/test/2026-10-24/契约-F-160-判断形状.md`；
 * 定形在 `.team/leader/2026-10-24/spec-F-160.md`。⚠️ 它们**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条）。
 * ⚠️ **分母 96 → 98**（两格各一条 `test()`；两格是两处**不同的红因**：副本有效 / 副本被动过）。
 */
export const BATCH_T = ['REV-04', 'REV-05']

/**
 * 批次 U —— **任务 A**（拆账·并员·通电 的第一个任务，2026-11-01 第 2 关）。
 *
 * 四格各自一条红因，能拆开读：
 *   · `PRS-01` 页面两条 / 一份通用组员预设 / 九行工具不变 / 旧九份删除（+ 升级前基线逐字留存）；
 *   · `PRS-02` 身份判定表九行（toolName 定角色 · `defaultRole` 只报警 · 内部 worker / legacy 不窄 · 窄恰三条来源）；
 *   · `PRS-03` 判决岗提案「工具在列表里、调用被拒」；
 *   · `PRS-04` 角色表是 persona / charter / model / tools 的唯一作者（逐字 no-regression · 不串味）。
 *
 * ⚠️ 这四格**打现役** `presets/agenia`（其余用例打 staged 靶子）—— 理由写在
 * `static/presets-two.test.mjs` 文件头：A 的交付物就是页面上的那两条，打 staging 会让
 * "staging 改了、现役没改"变绿。两棵树是否同步仍由 `STAT-01` 与入口的 `F57-TARGET` 各管一次。
 *
 * 契约：`.team/test/CONTRACT-A.md`；定形：`.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）。
 * ⚠️ 它们**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条）。
 */
export const BATCH_U = ['PRS-01', 'PRS-02', 'PRS-03', 'PRS-04']

/**
 * 批次 V —— **任务 B**（bug 系统 = 登记簿 + bug 任务 + 严重三线，2026-11-01 第 2 关）。
 *
 * 四格各自一条红因，能拆开读（定形 §7 的 B1 / B2 / B3 三行）：
 *   · `BUG-01` **登记簿**：九个 bug op 的面 · 登记**不建路线**（B1 的准入前提）· 现象+证据准入 ·
 *     **open = 无 disposition**（评估不等于处置）· **50/30 两条边界**（49/50 · 30/31）·
 *     `kind=observation` 不进数 · 封顶红**不动手** · 票不进这个数且路线账本一个字节不动；
 *   · `BUG-02` **五分支分流表**：五行进位（含"环境相关但重复成功 ⇒ 不加 env 标签"那条反例）·
 *     判不了（`repeat=failure` + 环境未知）不许猜 · **报表冻结**（核 SHA256、正文一个字节不变）·
 *     老板报的 bug **不适用此表** · 裸工作区只落 `.team/routing.jsonl`（分流不需要账先存在）；
 *   · `BUG-03` **bug 任务 + 批次 + 归档 + 准入**：批次 `{id, frozen_at, entry_ids[]}` 冻结一次逐字不变 ·
 *     冻结之后登记的进下一批 · 归档只搬带结论的（`E_BUG_ARCHIVE_OPEN`，零写入）· 五关**共用** `FIVE_GATES`
 *     （`方案` 这种并集同义词也必须收）· `admitTask` **16 格**准入矩阵 · 未建账只许登记；
 *   · `BUG-04` **严重三线**：三条线 + `unclassified` 四出口闭集 · 「读数说假话」必须点名它掩盖了哪一条 ·
 *     样本四个**事故前预注册**（时间序）· 改样本 = 版本 + 旧样本逐字留档 · **改后不许重判** ·
 *     没被采样的线 `calibrated:false` · 两个作者（测试评估 / 组长拍线）· 判不了 ⇒ 升级 + 卡红。
 *
 * ⚠️ **两条依赖写在这里，别读成 B 的缺陷**（契约 `.team/test/CONTRACT-B.md` §11）：
 *   · `BUG-03` 的 `admitTask` 16 格：函数的**作者是 C1**（定形 §6.2「两期互斥」那一路）⇒ 缺面记
 *     `BLOCKED-ON-C1-ADMITTASK`（C1b 节点/headline + C1d 暂停集合），不是"B 没做"。
 *   · `BUG-03` 的运行时准入（`maintain` / `build-paused` 两支）要真账本与暂停集合 ⇒ 归 C1，本批只钉
 *     `uninitialized` 那一支（不依赖 C1）。
 *
 * 契约：`.team/test/CONTRACT-B.md`；定形：`.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）。
 * ⚠️ 它们**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条），同 G…U 的规矩。
 */
export const BATCH_V = ['BUG-01', 'BUG-02', 'BUG-03', 'BUG-04']

/**
 * 批次 W —— **任务 C1**（路线账本 = 建账 + 节点 + headline + 槽 + 暂停 + 一个准入函数，2026-11-01）。
 *
 * 五格各自一条红因，能拆开读（定形 §7 的 C1a / C1b / C1c / C1d 四行 + §2.3 的 `admitTask`）：
 *   · `LED-01` **C1a 建账 + 迁移**：`bootstrap` 落一个 `kind=build` 的 bootstrap 阶段（**mode 已是 build**、
 *     **不调 `stage-enter`**、审计链恰好一条）；7 张旧票从 **legacy 票店**（独立存储）搬进路线票段
 *     （票号沿用 + `legacy_status` + **不存 `status`**），legacy 侧清空并记 `migrated_at`；
 *     **半跑可续**（路线 3 + store 剩 4 ⇒ 补 4 不重复）、**坏了零写入**（`E_LEGACY_STORE_BAD`）；
 *     老板说「进入维护」⇒ **直接建 maintain**（不先进 build）；没建 bug 台账就不许建 `.team/bug/`；
 *   · `LED-02` **C1b 节点 + headline**：落 route 的三个节点（开工 / 交活 / 验收）只进**审计 detail.node**、
 *     任务上没有 `node` 字段、`close`（收工）与怪值都拒；`headline` = 目标 · 大阶段名（**唯一载体**）、
 *     只随 `stage-enter` / `headline-set` 变；**空 headline 拒实现任务**（`E_ADMIT_HEADLINE`）+ 补齐后收；
 *     RT-08 的首行常量一格不动；
 *   · `LED-03` **C1c 槽**：`slotBusy()` 一个谓词、四态闭集（busy / exited / crash / unknown）、
 *     `stale` 严格大于 30 分钟、**`ref` 空 = busy 但它自己的第一次 spawn 放行**、`unknown` 按 busy 拒、
 *     `fence` 的 paused 不算活、**`paused + 活会话` 非法**、**两本账一个写者**；`read.slot` 与纯函数同值；
 *   · `LED-04` **C1d 暂停/恢复**：暂停必须停会话（没声明 ⇒ `E_PAUSE_SESSION_LIVE` + 零写入）、
 *     写 `session_exit` 但**不清 `session_ref`**；**maintain 不许暂停**（`E_PAUSE_NOT_SUPPORTED`）；
 *     扩大（同一 set 加 entry）vs 另开（新 set + 旧 set 关闭）；**旧 set 关闭不自动 free 在途修任务**；
 *     resume 不顺手改任务；pause set 解析**读 live + archived 两段**；**切阶段要先停会话**；
 *   · `LED-05` **`admitTask` 十六格 + 两个创建入口**：四种模式 × 三种工作种类 + 四格边界，
 *     每格一个冻死的码；`task-set` 与 `bug-task-set` **同一份判据**（该收的收、该拒的拒、批外点名 entry）。
 *
 * ⚠️ **一条依赖写在这里，别读成 C1 的缺陷**：`LED-05` 与 `BUG-03` 的 D 段是**同一件事的两个读者**
 *   （`lib/route.mjs::admitTask`；函数归 C1、判据归 B，契约 `.team/test/CONTRACT-B.md` §11）。
 *   C1 落地之后 `BUG-03` 的 `BLOCKED-ON-C1-ADMITTASK` 必须**同批翻绿** —— 那不是一个用例变绿，
 *   是两条判据对上了同一个事实。
 *
 * 契约：`.team/test/CONTRACT-C1.md`；定形：`.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）。
 * ⚠️ 它们**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条），同 G…V 的规矩。
 */
export const BATCH_W = ['LED-01', 'LED-02', 'LED-03', 'LED-04', 'LED-05']

/**
 * 批次 Y —— **任务 C2**（卡 = 记忆更新报告：三区 + 状态条 + 容量行 + 两张卡，2026-11-02 第 2 关）。
 *
 * 批次号是 **Y 不是 X**：`X` 已被 `toolName` 桥那六格（`BRG-01`…`BRG-06`）占了（第 4 关评审 `F-01`）。
 *
 * 六格各自一条红因，能拆开读（定形 §6.2 的那十行）：
 *   · `CARD-01` **路线格**：第一行 = 目标 · 大阶段名；**未建账 = 只印那一行**；**headline 空 ⇒
 *     「（目标未填）」+ 红条**；**暂停 = 第二行徽标**（第一行一字不动）；**加一条任务不改第一行**；
 *     账本坏了**照样出卡**但要说"未填"+ 红；**正文「目标 · 大阶段」行 = `route.first_line`**（§2.2 同值，
 *     负样本 = 只改正文一格 ⇒ 必红）+ `card.reasons` 闭集（`gate4-C2` F-05/F-08）；
 *   · `CARD-02` **票区**：`open` / `in_progress` / `done` / `void` 四个数来自**路线票段投影**
 *     （夹具里 `follow-ups.md` 故意写 9 张、票段 8 张 ⇒ 卡上必须是 8）；**第五个数 `tickets.legacy`**
 *     = 迁移票张数（`legacy_status` 非空；今天 7）——**子集计数**，不进四数、不加进 `total`；
 *     `void` 存下的终态；**0 不是错**；**负样本：`void` 票 + 在途任务 ⇒ 红并点名**；
 *     **正文票区六个数的形状**（§2.2 同值，负样本 = 改一个数 ⇒ 必红）+ `card.reasons` 闭集；
 *   · `CARD-03` **bug 开放数 + 50/30**：`kind=bug` + 无 disposition（observation / 票都不进）；
 *     **与 50/30 同值同 source**（同一个查询的机械形态）+ 第三个读者（`bug-read`，**同一注入时钟**；
 *     比计数 / **`oldest_age_days`** / `reasons` / 阈值 / 天数；不可用 ⇒ HOLD）；
 *     49/50 · 30/31 四条边界；**封顶不动手**（卡前后台账 sha256 同值）+ `card.reasons` 闭集；
 *   · `CARD-04` **严重度那一排**：三条线 + `unclassified` 四出口；样本四个；**只校准自己的线**
 *     （未采样的 `function_broken_repro` ⇒ `calibrated:false`）；**判不了两向**（升级 ⇒ 卡红并点名 /
 *     没升级 ⇒ 更要红）；`assessment:'unknown'` 是另一个词；**无 bug 台账 ⇒ `samples=[]` 且卡不红**
 *     （组长 2026-11-02 裁定 · `gate4-C2` F-10；编样本 ⇒ 必红）+ `card.reasons` 闭集；
 *   · `CARD-05` **状态条十二格**：`count===12` + key 逐字同序 + 至少六字段 + **`label`/`producer` 逐字**
 *     （互换 producer ⇒ 必红）；**十二格全部接线**
 *     （组长 2026-11-02 裁定第 1 条：`sla` / `carrier_missing` / `unknown_preset` / `preset_downgrade` /
 *     `legacy_sessions` 五格全部接上，不留常驻红）+ 五格真读数两向；`wired:false ⇒ red` 保留为**负样本**
 *     （合成输入证明它翻得动面；`wired` 今天是常量 true ⇒ 只守判据不守生产路径）；**红条格 = `card.red` 总闸**；
 *     **SLA 判不了也算超期**（`assessment.verdict:'unknown'`）+ `bug-read.sla` 同注入时钟跨读者；
 *     **槽谓词 JS/Python 同值**（`implement`+`bug-repair` 两个活持有人 ⇒ `SLOT_NOT_ENFORCED`；
 *     `crash` 心跳 ⇒ `STALE_SLOT`；心跳缺 ⇒ 两格黄）+ **producer A/B 自己的写面** + `card.reasons` 闭集；
 *   · `CARD-06` **容量行 + 两段回执 + 卡本身**：容量五读数（参考线读 `memory.mjs` 的**怪值**
 *     ⇒ 写死 200/80000 当场翻红）+ 来源不许是路线 + 快照读不到 ⇒ 红不出 0；回执四态
 *     （present / missing / expired / na）**逐段逐卡**（第一段在卡 1、第二段在卡 2 的 `C2 · 回执格`；
 *     裁定第 5 条）+ **第二段 `report_path` = `.team/retro/<day>/会话评审.md`**；**生成失败四件套**
 *     （非 0 · 没有卡 · append-only 失败标记 · stderr 🔴）+ **正文容量行同值**（负样本 = 首数印 0 ⇒ 必红）
 *     + 两张卡的 `card.reasons` 闭集。
 *
 * 契约：`.team/test/CONTRACT-C2.md`；裁定：`.team/leader/2026-11-02/C2-rulings.md`；
 * 定形：`.team/leader/2026-10-30/定形-拆账·并员·通电.md`（02:14 版）。
 * ⚠️ 它们**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条），同 G…X 的规矩。
 */
export const BATCH_Y = ['CARD-01', 'CARD-02', 'CARD-03', 'CARD-04', 'CARD-05', 'CARD-06']

/**
 * 批次 X 的 6 条 —— **`toolName` 插件桥**（2026-11-02 第 2 关 · 老板 11:33「不改客户端，走 `inject.js` 桥接」）。
 * 契约：`.team/test/CONTRACT-A-bridge.md`。打的树 = **本工作区** `presets/agenia`（测试文件自己按位置推根，
 * 不用硬编码 `E:\Harness` 的那几个 `PATHS`）。
 * 六格同住 `integration/brg01-toolname-bridge.test.mjs`：一个机制六面（记录 / 消费 / 九名全表 / 队列 /
 * 过期 / 边界），红的行自己带码（`BRG-*`），一眼看得出是哪一面。
 * ⚠️ 这批**不是** C2 那六格（`CARD-01`…`CARD-06`，批次 **Y**，**已装**在
 *    `tests/agenia-upgrade/report/card0*.test.mjs`）—— 两者都装上之后分母才是 111 + 6 + 6 = 123；
 *    再加 `BRG-07`（并行派工那把修的回归锁）= **124**。
 *    （2026-11-02 补：C2 六格在 `_deliver/apply.mjs` 跑完之后就已进盘；"仍在 `_deliver` 未装"那句是
 *    装之前的读数 —— `gate4-C2` F-14 #5 点到为止，别再照旧话读。）
 */
export const BATCH_X = ['BRG-01', 'BRG-02', 'BRG-03', 'BRG-04', 'BRG-05', 'BRG-06', 'BRG-07']

/**
 * 批次 Z 的 6 条 —— **技术评审 2026-11-02 的 F2–F7 六张票**（`ticket-20261102-03`…`-08`，同日第 2 关补）。
 *
 * 六格是**六张票各一条**（一格一个文件：红的时候一眼看得出是哪张票），
 * 契约：`.team/test/2026-11-02/CONTRACT-REVIEW-20261102.md`。
 *   · `CPY-01` `F2` **只读副本原地跑不动套件**（`.tools/_staging` 被 gitignore ⇒ 导出的副本不自足）：
 *     判的是"副本里有没有套件要的那四条输入"，缺哪条就点哪条的**绝对路径**（不跑全量 —— 那会把
 *     "副本缺输入"与"套件自己有几处按活树推路径"混成一条红）。
 *   · `CSRC-01` `F3` **容量参考线的来源格 `capacity.cap_source`**：三级回退各跑一次，
 *     卡上三个值必须互不相同、各自点到赢下来那一份 `memory.mjs`；参考线的两个数必须跟着**那一级**走。
 *   · `CSRC-02` `F4` **第三级（cwd）单独的正样本**：只有 cwd 有 `memory.mjs` ⇒ 卡照出、两个数来自那份、
 *     来源格点名 cwd（这一条要用 `F3` 的格子才判得动：缺了它，"cwd 给的"与"生成器那棵树给的"同形）。
 *   · `BMAP-01` `F5` **委派桥的两张表要有上限**（`BRIDGE_PINNED` / `BRIDGE_MISS_WARNED`，
 *     像 `BRIDGE_CLAIMS` 的 `BRIDGE_CLAIM_CAP` 那样）+ **`context.scope.id` 缺失/非字符串时仍然钉住**
 *     （用 `agentId` 兜底，不许静默落 row 5）。
 *   · `BDOC-01` `F6` **`brg01` 的注释与断言文本要描述跑着的匹配**（只认完整相等 / 对不上就不取；
 *     不许再出现"互相包含 / 互含 / 对不上再退回队首"）—— **静态文档腿**。
 *   · `FLIP-01` `F7` **`BRG-07` 的翻面读数要点名本提交的 `inject.js`**（字节数 + sha256 对得上 `HEAD` 那个 blob）。
 *
 * ⚠️ **分母 124 → 130**（六格各一条 `test()`，一条一张票）。
 * ⚠️ 它们**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G…Y 的规矩。
 */
export const BATCH_Z = ['CPY-01', 'CSRC-01', 'CSRC-02', 'BMAP-01', 'BDOC-01', 'FLIP-01']

/**
 * 批次 AA 的 1 条 —— **每日评审要等今天的记忆判决报告**（老板 2026-11-03 定的硬门；`bug-20261103-01`）。
 *
 * 一张脸：**产物在不在**决定能不能派 —— `job_conversation_review` / `job_technical_review`
 * 在 `tools.guard` 里被拒，除非 `<内容根>/.runtime/reports/memory-update/<day>.json` 在盘上；
 * 拒绝码 `E_REVIEW_BEFORE_JUDGE`，报文点名那一天，`<day>` 从**本地 04:00** 切。
 * 判据钉在**产物**上，不钉 `phase` 字段（字段会被中途改、产物不会）。
 *   · `RGATE-01` 四格 + 两格量具自证（真跑生产 `presets/agenia/inject.js` 的 `apply()` + 假 ctx，
 *     时钟由 `node:test` 的 `mock.timers` 钉住）：`A` 没有当天报告 ⇒ 两个工具都被拒、码**恰好**
 *     `E_REVIEW_BEFORE_JUDGE`（且不是门禁里另外那几个码）、报文点名那一天；`B` 种一份报告 ⇒
 *     **同一个调用**放行（红的合法性来源）；`C` `team_test` 在同一个"没有报告"的现场照样放行；
 *     `D` 两个钉住的时刻（本地 `01:30:00` / `04:00:01`）× 三副报告现场（无 / 11-02 / 11-03）——
 *     两向一夹，整数小时的切点只能是 4；`C2` 同一个工具显式塞前台 ⇒ 后台硬门用**另一个码**拒
 *     （证明"读码"这一步分得清两个闸）；`P` 夹具自证（guard 挂没挂上 / 时钟遮没遮住 / 报告现场对不对）。
 * 契约：本条（判据口径逐条写在用例文件头）。⚠️ 它**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条）。
 * ⚠️ **分母 130 → 131**（一格：这道闸只有一个红因 —— "该拒绝时没拒绝 / 拒错了码 / 算错了日子"，
 *    三样都落在同一格的两侧对照里，拆成三格只会让"哪一条坏了"更贵）。
 */
export const BATCH_AA = ['RGATE-01']

/**
 * 批次 AB 的 1 条 —— **提案不许当 bug 报告**（老板 2026-11-03 21:2x 插票；21:24 更正：只加判决岗）。
 *
 * 一张脸：**库的入库口只收知识，不收 bug 报告** —— 一条提案如果针对的是「一个或一组修复动作就能解决的问题」，
 * 判决岗必须**拒绝**（落点是 bug 台账 / 那一处代码，不是长期记忆）。这一票交付的是**两份说明书里的那一节**，
 * 所以判据是**静态文本**（现役 `presets/agenia`，与 `PRS-01..04` 同一个理由：注入到岗位手里的就是那一份）。
 * **面 = 5 个，码 = 5 个**（分布与逐条针只写在 `static/mjudge01-judge-charter.test.mjs` 的文件头，这里不重抄）：
 * A / B / C1 / C2 在**判决岗**那一侧（必须落在同一节里），D 在**复核岗**那一侧。
 *   · `A` `MJUDGE-RULE-SUBJECT` 老板原话那半句（`一个或一组修复动作`）**同一段里**的结论必须是"拒"（不是"收"）；
 *   · `B` `MJUDGE-DISCRIMINATOR` 定形 §3 的**替换法**（`替换法` + `改(变)?那一处` + 结论 `缺陷报告`）；
 *   · `C1` `MJUDGE-BOUNDARY-READING` 一处具体读数**不构成入库理由**；
 *   · `C2` `MJUDGE-BOUNDARY-CARVE-OUT` **反例必须成立**：不许退化成「提到具体文件 / 具体数字就拒」；
 *   · `D` `MJUDGE-REVIEW-CARRIES-RULE` **复核岗一个字都不许带** —— 做成"这条规矩的标记句
 *     （`替换法` / `一个或一组修复动作`）不许出现在两份复核岗说明书里"：将来谁整节复制粘贴过去 ⇒ 当场红
 *     （钉"标记句"而不是"哈希逐字节不变"：那两份与这条规矩无关的合法改动不该被判红）。
 * 另一条腿是**判据自己的可翻面性**（任何一次跑都要成立：文字没写时红、写了之后绿）：用例体内一具**合成阳性对照** + **刀架（K1…K8）**
 * （删替换法段 / 删读数边界 / 删反例 / 把"拒绝"换成"接受" / 标题去掉「入库」 / 把那一节粘进复核岗），
 * 每把刀**只许翻它那一面**；红在那一族（`MJUDGE-CONTROL-FAIL` / `MJUDGE-KNIFE-*`）说明尺子坏了，不是现役文本缺那几件事。
 * 定形：`.team/leader/2026-11-03/定形-提案不许当bug报告.md`。
 * ⚠️ 它**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G…AA 的规矩。
 * ⚠️ **分母 131 → 132**（一格：这一票的**五个面**是**同一句话的五张脸**——"这条规矩进了判决岗、没进复核岗"，
 *    一把刀只能落在其中一面，但它们同住一份文本、同一个判定体，拆成五格只会让"哪一面坏了"更贵）。
 */
export const BATCH_AB = ['MJUDGE-01']

/**
 * 批次 AC · **客户端看板**（定形 `.team/leader/2026-11-04/定形-客户端看板.md`；第 2 关 2026-11-04）。
 *
 * 九格分三组，每组一棵树（`support/dashboard-surface.mjs` 是共用夹具/量具）：
 *   · **数据层**（`presets/agenia/lib/dashboard.mjs`，第三关才写）——
 *     `DASH-01` 字段映射表逐条指到活树上那四份真源（定形 §六.1）；
 *     `DASH-02` 两条负控（指向不存在的键必须红；四种读源状态分得开）；
 *     `DASH-09` 这一版不读 `now.md`（§八.3 的决定）。
 *   · **视图模型** —— `DASH-03` 第一行 = `headline` 原样（阶段名/目标名改不动它）；
 *     `DASH-04` 五关读 `five_gate_state`（把大阶段名改成五关词也冒充不了）；
 *     `DASH-08` 空集合写 `0`、缺源写 `未知`、不崩不空（定形 R5 + 对照表 §5「缺 ≠ 空」）。
 *   · **渲染层**（`presets/agenia/client-ui-dashboard/lib/client.js`，官方同款插件形态）——
 *     `DASH-05` 主行一行（`div.taskTitle` 的形状对官方 `client.js` L169-174）；
 *     `DASH-06` 没有活组员数（整个渲染层零 `members`；`span.count` 徽标里是相位词）；
 *     `DASH-07` 欠账三列（§八.1）+ 0 不许被渲染条件藏掉。
 *
 * 🔴 **2026-11-04 第 2 关重开**（第 4 关评审 `🟠 打回·修`：`.team/review/2026-11-04/评审报告.md`
 * 的 F1 定位 / F2 端到端零证据 / F3 陈旧读数当当下 —— 三条都是**判据集上的洞**，不是单点 bug）：
 *   · `DASH-10` **面板定位**：`useAnchoredPosition({open, anchorRef, panelRef, gap:5, margin:16})` 被调用、
 *     结果接进面板 `style`、两个 ref 是`useRef` 声明的真 ref 且真的挂在 `.trigger` / `.panel` 上；
 *     外加**兜底**：位置还没算出来（钩子返回 `null`）那一帧，面板必须**可见**（`visibility` 只许 `visible`、
 *     不许 `display:none` / `opacity:0`）且**落在视口里的一个具体位置**（`left`/`top` 是具体数值）——
 *     2026-11-06 01:19 那次"点一下按钮、按钮消失、什么都没留下"的第二半就是这个兜底是 `visibility:hidden`。
 *     ⚠️ **兜底那一条不能拿官方当阳性对照**（官方那份就是故障形状）：对照是合成样本 + **故障那一版的真字节**。
 *     像素（开在哪、圆角阴影、16/64 这两个数）归 GUI 清单第 2/8 条，本格不判。
 *   · `DASH-11` **Node 半边端到端**：真子进程跑 `lib/index.js` 的 `apply()`，判快照
 *     **原子写**（`.tmp` → rename；崩在写盘中间不许留下半份活文件）· 契约 §3 形状 · 第二次跑覆盖 ·
 *     渲染层**只读那一份快照**（路径两半同源、不碰账本）· **读盘失败只许画红条**（不许同步抛、
 *     不许把按钮带走；2026-11-06 01:19 那次故障的第一半）。
 *   · `DASH-12` **日身份**：`view.day` = 今天这个**周期日**（`dayKeyOf` 的 04:00 切点）+ 画面要看得到 +
 *     只有旧相位文件时 `badge` 必须是 `null`（"退回最近一天"那把刀必须红）。
 *   · `DASH-13` **E29 展开钮**：元素对照表标「抄（条件）」⇒ 溢出测量 + `button.expandToggle` +
 *     只在溢出时出现；像素归 GUI 清单第 4 条。
 *   · `DASH-14` **读数日的位置**：第一个 `h3`（headline）必须在 `view.day` 之前、日期必须落在
 *     欠账网格之后（第 4 关复审 `R2-1`；只判顺序与区域，像素归 GUI #3/#4/#6）。
 *   · 🔴 **2026-11-05 · `bug-20261104-02`（`DASH-15`）——「写出来了」≠「装上了」**：
 *     上面十四条判的都是**面板自己**（数据 / 视图 / 渲染 / 快照），**没有一条**读过
 *     `presets/agenia/cordis.patch.yml` —— 于是一行住在 `preset-agenia.plugins` 里的接线
 *     （只进预设层、不进宿主装载层）能一路全绿，而界面上什么都没有（组长 2026-11-04 §十四的现场）。
 *     `DASH-15` 判四条腿：**顶层 `- insert:` 的直接成员**（不在任何 `preset-*.plugins` 里）·
 *     行体带 `name` + `config.root` · 包声明 `dsh.client.platform: web` + `exports["./client"]` ·
 *     **生成补丁 = `make-bundle-patch.mjs --check` 从 `agent.cordis.yml` 造出来的那一份**（跑仓库
 *     自己的检查，不另写比较逻辑）+ 四把刀（放回预设层 / 包去掉声明 / 整行拿掉 / 副本上改一个值）。
 *     ⚠️ 分母 **146 → 147**（由盘上发现器数出来；`GROUP_COUNTS` 同批 14 → 15）。
 *   · 🔴 **2026-11-05 · 第 4 关评审 `R-1`（`DASH-16`）——「忘两处」也没有下一次**：
 *     上面三个生成期 throw 只覆盖**标记与表不一致**。一行新加的 `dsh.client` 插件若**两处都忘**
 *     （没写 `# @host-level`、也没进 `HOST_LEVEL_IDS`），生成器走 `marks === 0` 分支把它拷进
 *     **每一份预设** —— 与 `bug-20261104-02` 同形，而全套判据照样绿。
 *     `DASH-16` 判**语义**：每行用 `name` 解析到盘上的 `package.json`，声明了 `dsh.client.platform: "web"`
 *     却不住宿主装载层 ⇒ 红。**不读标记、不读生成器的点名表、不认行 id**。
 *     ⚠️ 分母 **147 → 148**（由盘上发现器数出来；`GROUP_COUNTS` 同批 15 → 16）。
 *   · 🔴 **2026-11-05 深夜 · 挂载搬回 bundle 层（定形「补记一」）——`DASH-15` / `DASH-16` 再次同批迁移**：
 *     早上"宿主级 insert 会让整个 bundle 层 boot 失败"的归因**已被证伪**（`bug-20261105-12` rejected）；
 *     官方「智能体团队」面板就是挂在自己的 `dsh.bundle.patch` **顶层 `- insert:`** 里，而我们自己的包
 *     `agenia-injector` 有同一个 `dsh.bundle.patch`。⇒ 挂载回到**我们自己的包**，形状照官方，
 *     **C 盘一个字节都不用动**；profile 层那条路线降级为**备用**（`.tools/mount-dashboard-profile.mjs`
 *     自己的 `--check` 是它的检查器，本套件只留一个 `{available, mounted}` 读数，**不进判词**）。
 *     两格现在的载体是 `presets/agenia/cordis.patch.yml`，验收口径（与实现岗约定）：
 *     `顶层 - insert: 1 个 · 直接成员 3 条（1 宿主 + 2 预设入口）` · `宿主级行 1 条` ·
 *     `预设体内客户端 UI 行 0 条` · `agenia-dashboard` 在整份文件里**恰好 1 次**。
 *       · `DASH-15`：那一行是顶层 insert 的**直接成员**（不是 ⇒ `DASH-NOT-HOST-LEVEL`）· 开着
 *         （`DASH-ROW-DISABLED`）· `name` 指得到包 + 包声明 `dsh.client` / `exports["./client"]` +
 *         `config.root` 在 + **Node 入口文件在盘上**（`DASH-NO-CLIENT-DECL`）· **缺席 ⇒ 红
 *         `DASH-ROW-ABSENT`**（缺席是产品事实，不是"我读不到"）· 顶层形状四条（`DASH-TOP-INSERT-SHAPE`）·
 *         真字节翻面（最近一次"那一行不在顶层 insert"的提交 = before ⇒ 红；把它搬进顶层 insert = fixture
 *         ⇒ 绿，且四条验收读数逐条命中）· 派生物那一腿原样保留（`--check` 的 exit 1 分开报）。
 *       · `DASH-16`：预设体里**一条客户端 UI 行都不许有**（路径形 / 裸包名都算；`disabled` 也不算合规
 *         ⇒ `DASH-CLIENT-IN-PRESET`）· 顶层 override 里的 ⇒ `DASH-CLIENT-OUTSIDE-INSERT` ·
 *         看板那一行**恰好一次**（`DASH-HOST-ROW-COUNT`，含文件里的文本出现次数）。
 *         解析不到的预设行**只进读数**（六十来行框架裸包名住在 `app.asar` 里，对它们记 HOLD 会让
 *         本格每次挂起 60 条）—— fail-closed 在生成器那一侧。
 *       · **退役的码**（写清原因，不静默消失）见 `support/client-ui-placement.mjs` 的文件头：
 *         `DASH-PROFILE-*` 全家（profile 层成为备用路线；两套码同时声称"挂载没做"是禁止的）·
 *         `DASH-HOST-MISSING` · `DASH-CLIENT-IN-BUNDLE-TOP` · `DASH-DISABLED-MISMATCH` ·
 *         `DASH-ROW-PACKAGE-UNRESOLVED`。**分母不动（150）**：迁移都在原有两条 ID 内完成。
 *       · ⚠️ 同批**已迁**（2026-11-05 深夜）：`presets/agenia/agent.cordis.yml` 里那枚
 *         `# @host-level` 现在是**要求**，静态口径跟着翻面 ——
 *         `composition.mjs::hostLevelMarks()` / `hostLevelPairingProblems()` / `expectedPresetRows()`
 *         （`hostLevelIds` 必填）/ `topLevelInserts()` 四条重写：标记与补丁顶层宿主行**成对**
 *         （标了没搬 / 搬了没标 / 多发一次 / 标记落空 / 顶层多出别的条目 ⇒ 各自的 `HOST-LEVEL-*` 码），
 *         宿主行从两份预设的期望行集里**减掉**、行数闭合**加回去**。
 *         `PRS-01` 与 `STAT-01/02/03/05` / `DOC-01` 的 `preflight({calibrateLive:true})` 因此回到红/绿两态；
 *         夹具电池在 `STAT-02`（绿对照 + 五把刀，每把刀只翻它该翻的那一粒码）。
 *         `FROZEN.staged.disabledLiteralRows` 同批 **6 → 5**（`agenia-dashboard` 不再 `disabled: true`）。
 *   ⚠️ 新增四格**不进** `FROZEN_IDS`（同一批政策），但**同批**进 `BATCH_AC` 与
 *   `GROUP_COUNTS['client-dashboard']`（分母 141 → 145，由盘上发现器数出来）。
 *
 * 官方像素层是**只读**取件（设计抽屉的只读副本 → `.tools/asar-cli` 解到运行根兜底）；
 * `DASH-05/06/07/10/13` 里"同一个判据先量官方"的那几行是尺子自证（官方那侧必须为真/为假），
 * 官方取不到时记 `HOLD` 并点名 `tried`，不记绿。
 * ⚠️ 它们**不进** `FROZEN_IDS`（那张清单是历史冻结的 A–F 55 条），同 G…AB 的规矩。
 */
export const BATCH_AC = ['DASH-01', 'DASH-02', 'DASH-03', 'DASH-04', 'DASH-05', 'DASH-06', 'DASH-07', 'DASH-08', 'DASH-09', 'DASH-10', 'DASH-11', 'DASH-12', 'DASH-13', 'DASH-14', 'DASH-15', 'DASH-16']

/**
 * 批次 AD 的 2 条 —— **启动后读数**（2026-11-05 第 2 关；定形 `定形-看板挂载profile层.md` R2 / R3 / R5）。
 *
 * 那一票的病根不是"面板没写出来"，是**没有任何一条读数在启动之后回答过两个问题**：
 *   预设还注册得上吗？浏览器真收到那个包了吗？ ⇒ 塌了和没塌在盘上长得一模一样。
 *   · `BOOT-01` **身份（R2 + R5）**：`T`（这一次客户端启动的时刻）之后**新建**的顶层会话，
 *     头里 `agentPreset` 必须是 `agenia`；`standard` ⇒ 塌了。没有 `createdAt >= T` 的会话 ⇒ **HOLD**
 *     （`BOOT-NO-SESSION-AFTER-RESTART`，**不是绿**）。
 *     **R5（2026-11-05 深夜组长裁定"重定义，不退役"）**：撤挂载 = **删 `# @host-level` 标记 + 重跑生成器**
 *     （一条命令序列，一次提交可回滚），判两半：① 两件产物 × 落点（标记在 ⇒ 只住顶层 insert；
 *     标记不在 ⇒ 回到两份预设体），任一端不合契约 ⇒ `RED BOOT-R5-ROLLBACK-CONTRACT-BROKEN`；
 *     ② 撤掉挂载 + 重启之后**新建**会话的头仍是 `agentPreset: agenia` —— 需要真的做过一次练习并交回执
 *     （`AGENIA_R5_REMOVAL_EXERCISE`），没做 ⇒ `HOLD BOOT-R5-REMOVAL-EXERCISE-MISSING`
 *     （名字刻意不是"挂载行不在"），回执说身份掉了 ⇒ `RED BOOT-R5-IDENTITY-COST`。
 *     旧的两条腿（`oneStepRemoval()` 删一行 / profile 补丁条件式）与五个旧码同批退役（墓碑在 `BOOT_CODES`）。
 *   · `BOOT-02` **包可达（R3）**：宿主 `boot 载荷`里有没有这个**包名** + `/plugins/<包名>/client.js?rev=…`
 *     取不取得到同一份字节；**两条都要有，缺一记 HOLD**（`BOOT-R3-HALF-PROOF`）。
 *
 * ⚠️ 分母 **148 → 150**（由盘上发现器数出来；`GROUP_COUNTS` 同批新增 `boot-readings: 2`）。
 * ⚠️ 这两条**不进** `FROZEN_IDS`（同一批政策：后加批次各自以显式清单存在）。
 */
export const BATCH_AD = ['BOOT-01', 'BOOT-02']

/**
 * 批次 AE 的 2 条 —— **回执卡的两族判据**（`ticket-20261106-02` · 复审 §7 的 E5 + E6，batch 6）。
 *
 * 复审对这两格的判词是同一句：**输出的句子对了，但没有任何测试读这一页** ——
 * 把三条腿合成一句、把 `disposition_of` 换回旧的"落点非空 ⇒ 采纳" ⇒ 全量照绿。
 * 两格各是一条**能翻面**的判据（刀在用例内每次真跑，不是"我跑过一次是绿的"）：
 *   · `CARD-07` **`待你拍` 三态**（E5）：有行 / `[]` / 文件不在**必须印三句不同的话**，
 *     而且每句都要说得对（`[]` 是"组长登记了没有要拍的事"、不在是"没有人登记 / 不代表今天没有"）。
 *     刀 = 把 `daily-cards.py` 里那三条腿合成一句写死的「（今天 0 件）」——**副本**上改，生产零字节。
 *   · `CARD-08` **「处置」列三错值 + 两好形状**（E6）：对象带 `ticket` 要把票号印出来；
 *     `"采纳不了：…"` 不许印成采纳；`findings-map.json` **在但没这一条** 与 **文件不在** 必须两句话。
 *     刀 = `e7bdbbe^` 那一版真字节（`disposition_of` 旧实现，只把签名补上 `map_present`）——
 *     **钉住的红基线**，不是手编的"某条规则"。
 *
 * 两格都靠 `--workspace` 夹具 + 真子进程驱动**生产那一份**生成器，再从产出的 `.xlsx` 读回人读页：
 * `待你拍` 与 `每条的落点`。⚠️ 这两格**没有机器格**（`C2 · 验收格` / `C2 · 回执格` 里没有它们），
 * 所以判据钉的是**老板读的那两页**；页名与列序在本批的 `card07`/`card08` 文件头里各写一次。
 *
 * ⚠️ 分母 **150 → 152**（由盘上发现器数出来；`GROUP_COUNTS['memory-update-card']` 同批 6 → 8）。
 * ⚠️ 这两条**不进** `FROZEN_IDS`（同一批政策：后加批次各自以显式清单存在）。
 */
export const BATCH_AE = ['CARD-07', 'CARD-08']

/**
 * 已落笔的二十五批。历史冻结的 **55 条**（A–F）见 `FROZEN_IDS`；批次 G 是 F-57 新加的那 11 条，
 * 批次 H 是门 1 回执链路四票的 4 条（2026-10-22），批次 I 是 `F-112` 剩下两格（同日），
 * 批次 J 是 `F-125` 维护案 400 字帽（同日），批次 K 是 `F-129` anchors 形状（2026-10-23），
 * 批次 L 是 `F-148` 思考链过滤（同日 · 紧急票），批次 M 是 `F-152` 板子三态（同日），
 * 批次 N 是 `F-155` 每日状态的两端与署名（同日），批次 O 是 `F-156` 三个本地节点的三态（同日），
 * 批次 P 是 `F-158` 一天从 04:00 切（2026-10-24），批次 Q 是 `F-156` 第二轮锚点闸的三条规则（同日），
 * 批次 R 是 `F-163` 平台版本读数的自证（同日）。
 * 批次 S 是 `F-162` 的两半（`RCP-05` 回执三件套进 `local-mark` / `HLT-03` 卡的第二半，同日）。
 * 批次 T 是 `F-160` 评审对象是**派工那一刻的提交**（`REV-04` 副本有效 / `REV-05` 副本被动过就作废，同日）。
 * 批次 U 是**任务 A** 九份组员预设并成一份（`PRS-01`..`PRS-04`，2026-11-01 第 2 关；打的是**现役**树）。
 * 批次 V 是**任务 B** bug 系统（`BUG-01`..`BUG-04`，2026-11-01 第 2 关；`BUG-03` 的准入矩阵有**一半依赖 C1**）。
 * 批次 W 是**任务 C1** 路线账本（`LED-01`..`LED-05`，同日第 2 关；`LED-05` 与 `BUG-03` 的 D 段是同一件事的两个读者）。
 * ⇒ `pending-write` 必须是 **0**；这条不变量由 `registryProblems()` 钉住。
 * 批次 X 是**任务 A 的运行时绕行**（`toolName` 插件桥，2026-11-02 第 2 关；老板 11:33 拍板，
 * 对应长期票 `ticket-20261102-01`）：`BRG-01` 记录面 / `BRG-02` 消费面 / `BRG-03` 九名全表 /
 * `BRG-04` 队列 / `BRG-05` 过期 / `BRG-06` 边界 / `BRG-07` 并行派工（live 修后补的那把回归锁）。
 * 批次 Z 是**技术评审 2026-11-02 的 F2–F7 六张票**（`ticket-20261102-03`…`-08`，同日第 2 关补；
 * 一格一张票，红的时候一眼看得出是哪张票）。
 * 批次 AA 是**每日评审闸**（`RGATE-01`，2026-11-03；老板 09:10 点破判决没回来就派评审，`bug-20261103-01`）——
 * 打的同样是**现役** `presets/agenia`；staged 靶子是否已同版由入口的 `F57-TARGET` 每次现量（这里不写死差额）。
 * 批次 AB 是**提案不许当 bug 报告**（`MJUDGE-01`，2026-11-03 21:2x 老板插票 · 21:24 更正"只加判决岗"）——
 * 判两份判决岗说明书里那一节（主语 + 替换法 + 两个边界）+ 复核岗不许带那条标记句；打的也是**现役**。
 */
export const WRITTEN_BATCHES = { A: BATCH_A, B: BATCH_B, C: BATCH_C, D: BATCH_D, E: BATCH_E, F: BATCH_F, G: BATCH_G, H: BATCH_H, I: BATCH_I, J: BATCH_J, K: BATCH_K, L: BATCH_L, M: BATCH_M, N: BATCH_N, O: BATCH_O, P: BATCH_P, Q: BATCH_Q, R: BATCH_R, S: BATCH_S, T: BATCH_T, U: BATCH_U, V: BATCH_V, W: BATCH_W, X: BATCH_X, Y: BATCH_Y, Z: BATCH_Z, AA: BATCH_AA, AB: BATCH_AB, AC: BATCH_AC, AD: BATCH_AD, AE: BATCH_AE }
const BATCH_OF = (id) =>
  BATCH_A.includes(id) ? 'A'
    : BATCH_B.includes(id) ? 'B'
      : BATCH_C.includes(id) ? 'C'
        : BATCH_D.includes(id) ? 'D'
          : BATCH_E.includes(id) ? 'E'
            : BATCH_F.includes(id) ? 'F'
              : BATCH_G.includes(id) ? 'G'
                : BATCH_H.includes(id) ? 'H'
                  : BATCH_I.includes(id) ? 'I'
                    : BATCH_J.includes(id) ? 'J'
                      : BATCH_K.includes(id) ? 'K'
                        : BATCH_L.includes(id) ? 'L'
                          : BATCH_M.includes(id) ? 'M'
                            : BATCH_N.includes(id) ? 'N'
                              : BATCH_O.includes(id) ? 'O'
                                : BATCH_P.includes(id) ? 'P'
                                  : BATCH_Q.includes(id) ? 'Q'
                                    : BATCH_R.includes(id) ? 'R'
                                      : BATCH_S.includes(id) ? 'S'
                                        : BATCH_T.includes(id) ? 'T'
                                          : BATCH_U.includes(id) ? 'U'
                                            : BATCH_V.includes(id) ? 'V'
                                              : BATCH_W.includes(id) ? 'W'
                                                : BATCH_X.includes(id) ? 'X' : BATCH_Y.includes(id) ? 'Y'
                                                  : BATCH_Z.includes(id) ? 'Z'
                                                    : BATCH_AA.includes(id) ? 'AA'
                                                      : BATCH_AB.includes(id) ? 'AB'
                                                        : BATCH_AC.includes(id) ? 'AC'
                                                          : BATCH_AD.includes(id) ? 'AD'
                                                            : BATCH_AE.includes(id) ? 'AE'
                                                              : null

const F = {
  composition: 'static/composition.test.mjs',
  docs: 'static/docs.test.mjs',
  roles: 'static/roles.test.mjs',
  presetsTwo: 'static/presets-two.test.mjs',
  readObligations: 'static/read-obligations.test.mjs',
  envScan: 'static/env-scan.test.mjs',
  routeUpdater: 'integration/route-updater.test.mjs',
  routeUnit: 'unit/route.test.mjs',
  store: 'integration/store.test.mjs',
  memoryUnit: 'unit/memory.test.mjs',
  memoryReport: 'report/memory-report.test.mjs',
  guard: 'unit/guard.test.mjs',
  jobs: 'integration/jobs.test.mjs',
  packet: 'integration/packet.test.mjs',
  technicalReview: 'integration/technical-review.test.mjs',
  receipts: 'unit/receipts.test.mjs',
  health: 'report/health.test.mjs',
  dataRoot: 'integration/data-root.test.mjs',
  install: 'integration/install-rollback.test.mjs',
  env: 'integration/env.test.mjs',
  proposalFile: 'integration/proposal-file.test.mjs',
  /** 门 1 回执链路四票（批次 H）—— 一票一个文件，红的时候一眼看得出是哪一票。 */
  vrf01: 'integration/vrf01-fingerprint-root.test.mjs',
  vrf02: 'integration/vrf02-findings-recompute.test.mjs',
  vrf03: 'unit/vrf03-fingerprint-equal.test.mjs',
  vrf04: 'static/vrf04-staging-surface.test.mjs',
  /** 门 1 · `F-112` 剩下两格（批次 I）—— 一格一个文件：红的时候一眼看得出是"清单"还是"注释"。
   *  ⚠️ 例外：`SURF-01` / `SURF-03` **同住一个文件**（同一张清单的两根轴：在不在 / 是不是空壳）——
   *  放一起是为了让反向那一跑一眼看到"一份改成 1 字节 ⇒ 只有 SURF-03 红、SURF-01 仍绿"。 */
  surf01: 'static/surface-exists.test.mjs',
  surf02: 'static/inject-roster.test.mjs',
  surf03: 'static/surface-exists.test.mjs',
  /** 门 1 · `F-125` 维护案 400 字帽（批次 J）—— 三条同住一个文件：
   *  两个入口面（`payload.entry` / `engine_ops`）+ 一条旧闸的阳性对照；
   *  红的时候一眼看得出是"哪一格没有闸"，绿的时候三条各自都还在量东西。 */
  mtc: 'integration/maintenance-cap.test.mjs',
  /** 门 2 · `F-129` anchors 形状（批次 K）—— 一张脸一个文件：八格 + 阳性对照 + 三把反向刀同住，
   *  红的时候一眼看得出"哪一格还在被静默收下"。 */
  anc01: 'unit/anc01-anchors-shape.test.mjs',
  /** 门 2 · `F-148` 思考链过滤（批次 L）—— 两层各一个文件：纯函数/流式一格、接缝一格，
   *  红的时候一眼看得出"是清得不对"还是"根本没挂上去"。 */
  rfg01: 'unit/rfg01-reasoning-filter.test.mjs',
  rfg02: 'integration/rfg02-reasoning-seam.test.mjs',
  /** 门 2 · `F-148` 的**落盘那一层**（装配之后）：真适配器形状 + 只有 block-end 的形状 + 尾巴排 finish 之前。 */
  rfg03: 'integration/rfg03-reasoning-assembly.test.mjs',
  /** 门 2 · `F-152` 板子三态（批次 M）—— 判的是**注入文字**：假 ctx 上跑 apply() → tools/result →
   *  agent/pre-step 瀑布 → 读那一步真的塞进请求的那条尾巴（量具 `support/board-surface.mjs`）。 */
  brd01: 'integration/brd01-board-states.test.mjs',
  /** 门 2 · `F-155` 每日状态的两端与署名（批次 N）—— **两格同住一个文件**：写面（`daily-start` 幂等）
   *  与读面（卡片点名"谁开的这一天"）是同一句话的两头，红的时候一眼看得出是哪一头。 */
  dly: 'integration/dly01-daily-state.test.mjs',
  /** 门 2 · `F-156` 三个本地节点的三态（批次 O）—— **一格四格同住一个文件**：`local-claim` / `local-mark` /
   *  `local-fail` / `local-read` 判的是**同一份** `state/local/<day>.json` 的四个腿，
   *  红的时候一眼看得出是"哪条腿"（节点没落 / 原因丢了 / 并行吞掉一个 / 读面把"缺"当成"空"）。 */
  loc: 'integration/loc01-local-state.test.mjs',
  /** 门 2 · `F-158` 一天从本地 04:00 切（批次 P）—— **切点两侧各一个文件行、外加四格**：
   *  `DBY-01` / `DBY-02` 同住 `dby01-day-boundary.test.mjs`（同一批**四个消费方**、两个方向 —— 红的时候一眼看得出
   *  是"切点下方算错"还是"切点上方被挪走"）；`DBY-03` / `DBY-04` / `DBY-06` 同住
   *  `dby02-day-cut-agreement.test.mjs`（四处入口同值 / 显式 day 的两种形态 / 过期指针 —— 判的是同一批入口的三件事）；
   *  `DBY-05` 单独一个文件（它驱的是 `.tools/check-notes.mjs`，一个**只读**的真子进程）。 */
  dby: 'integration/dby01-day-boundary.test.mjs',
  dbyAgreement: 'integration/dby02-day-cut-agreement.test.mjs',
  dbyCheckNotes: 'integration/dby03-check-notes-day-cut.test.mjs',
  /** 门 2 第二轮 · `F-156` 锚点闸三条规则（批次 Q）—— **三格同住一个文件**：按字段的必填 / `findings_count`
   *  对账 / `.team/` 前缀判的是**同一次 mark**的三条规则，三格共用同一份产物与同一个 REF + 刀架；
   *  红的时候报的那一行就带着 `格:输入`（哪条规则、哪种写法）。 */
  locAnchors: 'integration/loc02-per-field-anchors.test.mjs',
  /** 门 2 · `F-163` 平台版本读数的自证（批次 R）—— **一格五条腿同住一个文件**：
   *  合成 asar 的短 2 B / BOM / 截断（> 16 B 读窗）/ 纯函数入口，外加真实 asar 的 `[平台]` 读数。
   *  判的是"这个量具读的是哪一版、读不到时说不说得出来"——不是某一版平台该不该存在。 */
  plt: 'unit/plt01-platform-asar.test.mjs',
  /** 门 2 · `F-162` 的两半（批次 S）—— 一格一个文件：写面（回执三件套落盘）与读面（卡的两个红分支）
   *  是同一句话的两头，红的时候一眼看得出是哪一头。 */
  rcp05: 'integration/rcp05-receipt-trio.test.mjs',
  hlt03: 'report/hlt03-receipt-anchor.test.mjs',
  /** 门 2 · `F-160` 评审对象是提交（批次 T）—— **两格各一个文件**：活树动了它仍然有效（`rev04`）与
   *  副本被动过就作废（`rev05`）是同一把尺子的两个方向，红的时候一眼看得出是哪一头。
   *  夹具仓库造在运行根里（两次提交、钉住哈希）；导出器是 `.tools/tree-at-commit.mjs`（实现岗的文件，
   *  不在就用 `AGENIA_TREE_AT_COMMIT` 指过来 —— 它今天**还不存在**，所以这两格今天是红的）。 */
  rev04: 'integration/rev04-review-copy-valid.test.mjs',
  rev05: 'integration/rev05-copy-touched-void.test.mjs',
  /** 任务 B · bug 系统（批次 V）—— **一格一个文件**：四格的红因互不重叠（登记簿 / 分流 / 任务与准入 /
   *  严重线），合在一个文件里会让"哪一条坏了"只能靠码名去认。 */
  bug01: 'integration/bug01-bug-entry.test.mjs',
  bug02: 'integration/bug02-routing.test.mjs',
  bug03: 'integration/bug03-bug-task.test.mjs',
  bug04: 'integration/bug04-severity.test.mjs',
  /** 任务 C1 · 路线账本（批次 W）—— **一格一个文件**：五格的红因互不重叠（建账+迁移 / 节点+headline /
   *  槽 / 暂停 / 准入矩阵），合在一个文件里会让"哪一条坏了"只能靠码名去认。 */
  led01: 'integration/c1a-bootstrap-migrate.test.mjs',
  led02: 'integration/c1b-nodes-headline.test.mjs',
  led03: 'integration/c1c-slot.test.mjs',
  led04: 'integration/c1d-pause-resume.test.mjs',
  led05: 'integration/c1e-admit-matrix.test.mjs',
  /** 任务 A 的运行时绕行 · `toolName` 插件桥（批次 X）—— **六格同住一个文件**：
   *  记录面 / 消费面 / 九名全表 / 队列 / 过期清理 / 边界是**同一个机制**的六个面，
   *  红的行带 `BRG-*` 码，一眼看得出是哪一面；拆六个文件只会让"哪一面坏了"更贵。
   *  ⚠️ 它打的是**本工作区**的 `presets/agenia`（文件自己按位置推根），不是 `PATHS.finalPreset`。 */
  brg01: 'integration/brg01-toolname-bridge.test.mjs',
  /** 任务 C2 · 卡（记忆更新报告，批次 Y）—— **一格一个文件**：六格的红因互不重叠
   *  （路线格 / 票区 / bug 开放数与 50-30 / 严重度那一排 / 状态条十二格 / 容量与回执与卡本身），
   *  合在一个文件里会让"哪一条坏了"只能靠码名去认。 */
  card01: 'report/card01-route-grid.test.mjs',
  card02: 'report/card02-ticket-area.test.mjs',
  card03: 'report/card03-bug-open-cap.test.mjs',
  card04: 'report/card04-severity-row.test.mjs',
  card05: 'report/card05-status-bar.test.mjs',
  card06: 'report/card06-capacity-receipts.test.mjs',
  /** 批次 AE（2026-11-06 · `ticket-20261106-02` · 复审 §7 E5/E6）—— **回执卡的两族判据**：
   *  `CARD-07` `待你拍` 三态（有行 / `[]` / 文件不在）· `CARD-08` 「处置」列三错值 + 两好形状。
   *  两格都真跑**生产**生成器（`--workspace` 夹具）再从 `.xlsx` 读回人读页；刀在用例内真跑（副本，
   *  生产零字节）：`CARD-07` 把三条腿合成一句、`CARD-08` 换回 `e7bdbbe^` 那一版 `disposition_of`。 */
  card07: 'report/card07-pending-panel.test.mjs',
  card08: 'report/card08-disposition-column.test.mjs',
  /** 批次 Z · 技术评审 2026-11-02 的 F2–F7 六张票（一格一张票一个文件）——
   *  `F2` 只读副本自足 / `F3` 容量参考线来源格 / `F4` 第三级（cwd）正样本 /
   *  `F5` 桥的两张表有上限 + scope.id 兜底 / `F6` brg01 的匹配描述 / `F7` BRG-07 翻面读数点名本提交。 */
  cpy01: 'integration/cpy01-review-copy-inplace.test.mjs',
  csrc01: 'report/csrc01-cap-source.test.mjs',
  csrc02: 'report/csrc02-cap-cwd.test.mjs',
  bmap01: 'integration/bmap01-bridge-bounds.test.mjs',
  bdoc01: 'integration/bdoc01-bridge-doc.test.mjs',
  flip01: 'integration/flip01-bridge-reading.test.mjs',
  /** 批次 AA · **每日评审闸**（`RGATE-01`，2026-11-03；`bug-20261103-01`）——
   *  真跑**生产** `presets/agenia/inject.js` 的 `apply()`（与 `BRG-*` / `BMAP-01` 同一具载具），
   *  时钟由 `node:test` 的 `mock.timers` 钉住：这道闸判的是"今天的报告在不在"，
   *  不钉时钟就会随墙钟漂（`RGATE-CLOCK-*` 把"钉没钉上"与功能红分开报）。 */
  rgate01: 'integration/rgate01-daily-review-gate.test.mjs',
  /** 批次 AB · **提案不许当 bug 报告**（`MJUDGE-01`，2026-11-03 21:2x 老板插票）——
   *  判两份判决岗说明书（`team/` + `job-briefs/`）里那一节 + 四个面，外加**复核岗不许带**那条标记句。
   *  静态文本腿：打**现役** `presets/agenia`（定形 §4 点名的两个落点就在这棵树里，岗位读到的是它）。 */
  mjudge01: 'static/mjudge01-judge-charter.test.mjs',
  /** 批次 AC · **客户端看板**（`DASH-01`…`DASH-09`，2026-11-04 第 2 关）——
   *  契约 `.team/test/2026-11-04/技术契约-客户端看板.md`；量具与夹具在 `support/dashboard-surface.mjs`。
   *  三份文件按"数据层 / 视图模型 / 渲染层"分，各自文件头写着判据与自证。 */
  dash01: 'integration/dash01-fields.test.mjs',
  dash02: 'integration/dash02-view.test.mjs',
  dash03: 'integration/dash03-shape.test.mjs',
  /** 第 2 关重开（2026-11-04 第 4 关评审打回）：渲染层接线两格（`DASH-10` 定位 / `DASH-13` E29）。 */
  dash04: 'integration/dash04-wiring.test.mjs',
  /** 第 2 关重开：数据链端到端两格（`DASH-11` 快照机制 / `DASH-12` 日身份）。 */
  dash05: 'integration/dash05-snapshot.test.mjs',
  /** `bug-20261104-02`（2026-11-05）：**面板装上了没有** —— 判**生成的** `presets/agenia/cordis.patch.yml`
   *  里那一行在不在**宿主装载层**（顶层 `- insert:` 的直接成员，不在任何 `preset-*.plugins` 里）·
   *  行体 + 包的 `dsh.client` 声明 · 生成补丁是 `make-bundle-patch.mjs --check` 的派生物（跑仓库自己的检查）·
   *  四把刀（放回预设层 / 包去掉声明 / 整行拿掉 / 副本上改一个值）。**打现役**（浏览器收到的是装好的那一份）。 */
  dash06: 'integration/dash06-mount.test.mjs',
  /** 批次 AD（2026-11-05 第 2 关）：**启动后读数** —— `BOOT-01` 身份（R2 + R5）与
   *  `BOOT-02` 包可达（R3）**同住一个文件**：两条是同一件事的两半（"预设还注册得上吗" /
   *  "浏览器真收到那个包了吗"），各自独立、不互相吞。量具在 `support/boot-readings.mjs`。 */
  bootReadings: 'integration/boot01-restart.test.mjs',
}

/** 每条：`id / group / file / status`（+ `title` 给人读；`notes` 只在有表内歧义时出现）。 */
const ROWS = [
  // ── 静态 / 文档（6）──────────────────────────────────────────────────────
  ['STAT-01', 'static-doc', F.composition, '固定 desktop oracle 重算 + staged 组合多重集对账（onlyInStandard/onlyInAgenia/总行数）', '本批已写'],
  ['STAT-02', 'static-doc', F.composition, 'staged 组合四行 job 十项 checklist + officeBound 1（只剩 review）+ 9 角色/4 作业书 + 生成补丁一致', '本批已写'],
  ['STAT-03', 'static-doc', F.composition, '派生判据源成组改：team=9/job=4/固定 team_*=5/officeBound=1、oracle 换源、旧板不认 job_*', '本批已写'],
  ['STAT-04', 'static-doc', F.docs, '文档清单同批口径一致（新计数、后台 guard、回执、分布、旧每日检查退役）', '本批已写'],
  ['STAT-05', 'static-doc', F.composition, '枚举全部具名委派实例并对齐 guard 名单；插入第 11 条委派行必须让检查变红', '本批已写'],
  ['DOC-01', 'static-doc', F.docs, '老板阅读版 / now / log 与 v5、当前阶段、GO 状态一致；GO 证据含原话+来源+时间（或 null+note）', '本批已写'],

  // ── 路线（8）─────────────────────────────────────────────────────────────
  ['RT-01', 'route', F.routeUpdater, '并发两次 updater 写 / 旧 CAS 版本 / 崩溃后遗留锁：独占锁+CAS，绝不覆盖', '本批已写'],
  ['RT-02', 'route', F.routeUpdater, '成功提交的 audit 字段；篡改 current / 删改 audit 末条 / 直写 / 半写 JSON 一律拒读', '本批已写'],
  ['RT-03', 'route', F.routeUpdater, '票的完整字段与非法票拒绝；非 updater 写票无效；合法采纳票正例', '本批已写'],
  ['RT-04', 'route', F.routeUnit, '阶段图：自定义/合法大阶段名、两个 current 拒、任务错阶段拒、不自动推进、五关只在任务上', '本批已写'],
  ['RT-05', 'route', F.routeUnit, '五关词一律硬拒（并集词表 + 空白/“阶段”后缀变体），写入零副作用；合法阶段名正例', '本批已写'],
  ['RT-06', 'route', F.routeUnit, 'boss evidence 七场景：缺证据/转述/合法/复用/张冠李戴/下一阶段 gate/exit_criteria', '本批已写'],
  ['RT-07', 'route', F.routeUnit, '当前任务 0 或 1：null 合法、两个拒、错属拒、不存在拒；无任务时五关显示“不适用”', '本批已写'],
  ['RT-08', 'route', F.routeUnit, '摘要投影：首行“目标 · 当前大阶段”、任务/五关/票；不把大阶段当五关；与 current 同哈希', '本批已写'],

  // ── 存储 / 锁 / 状态（4）─────────────────────────────────────────────────
  ['STO-01', 'store', F.store, '判决提交原子性：各阶段故障注入后不得出现半写/`judging && snapshot_available`', '下一批'],
  ['STO-02', 'store', F.store, '两项目抢同一天记忆更新：只一个 claim，锁事件原子，过期锁不被静默顶掉', '下一批'],
  ['STO-03', 'store', F.store, '旧 attempt/token/迟到通知/旧候选一律拒；同日最多一个新成功快照', '下一批'],
  ['STO-04', 'store', F.store, '会话评审与技术评审各自独立 claim 可并行；同场重复 claim 拒；维护案 fence 不混用', '下一批'],

  // ── 记忆（12）────────────────────────────────────────────────────────────
  ['MEM-01', 'memory', F.memoryUnit, 'raw/freshness/T 映射/全库份额（含空库与新增后重算）', '下一批'],
  ['MEM-02', 'memory', F.memoryUnit, '类型内低线：n=4/5/6、并列全计入、空类型、单侧低不算双低', '下一批'],
  ['MEM-03', 'memory', F.memoryUnit, '连续双低 K=3、非双低清零、类型变更重置、读已发布 N 的 streak', '下一批'],
  ['MEM-04', 'memory', F.memoryUnit, '维护案基于 N、次日判决基于 N：不隔天过期、不拿临时分布追溯、无冷却', '下一批'],
  ['MEM-05', 'memory', F.memoryUnit, '存活集重算 N+1 份额/低线/streak；不追溯改变本轮斩杀资格', '下一批'],
  ['MEM-06', 'memory', F.memoryUnit, '容量是读数不是闸（199/200/201 · 80000/80001 都收，给 overCap/overBy/capRef）；无四类硬帽字段；偏科不自动配额', '下一批'],
  ['MEM-07', 'memory', F.memoryUnit, 'v0 初始化/缺失/损坏；旧 .team 记忆不自动导入；空候选也出报告', '下一批'],
  ['MEM-08', 'memory', F.memoryUnit, '常识 SHA 三处核对：无确认改动停更、运行中再改拒提交', '下一批'],
  ['MEM-09', 'memory', F.memoryUnit, '快照字段齐全、原子发布、直写/半写可检测、旧快照只读', '下一批'],
  ['MEM-10', 'memory', F.memoryReport, '报告 + 每日状态四类分布：汇总严格相等、含 0 类、无硬帽字段、字符按 code point 口径', '批次 C'],
  ['MEM-11', 'memory', F.memoryUnit, '各岗位提案口与 append-only 导入校验（schema/基准版本/来源/哈希/fence）；「已判」索引的行集合与维护案 verdict（来源 = accepted 里的它，或 maintenance_decisions 里带 action 的裁决）', '下一批'],
  ['MEM-12', 'memory', F.memoryUnit, '普通提案不得删/并/退/改类型；斩杀只经复核→次日判决；归档可查', '下一批'],

  // ── 后台 guard（3）───────────────────────────────────────────────────────
  ['GRD-01', 'guard', F.guard, 'job_* 显式 true **或省略**（0.2.1）放行、显式 false/非布尔真值拒；team_*/subagent 显式 false 拒；config 错误态一律拒；门禁在 officeBound 提前返回之前', '批次 B'],
  ['GRD-02', 'guard', F.guard, '合法调用与无关工具一律放行；guard 只按工具名+参数行动；判据两侧都成立（翻面）', '批次 B'],
  ['GRD-03', 'guard', F.guard, '拿不到 tools.guard 必须 loud（点名缺哪样 + 说清后果）；骨架里写着「装不上要出声、但那不是拦截」', '批次 B'],

  // ── 作业状态机（4）───────────────────────────────────────────────────────
  ['JOB-01', 'job', F.jobs, '后台完成通知驱动（非轮询）；丢通知时只检测未结、不冒充完成', '下一批'],
  ['JOB-02', 'job', F.jobs, '失败/父死/未完成/超租约：状态分别为 failed/partial/未结，无自动重跑', '下一批'],
  ['JOB-03', 'job', F.jobs, '快照可用而复核失败时可启动本地评审，partial 可见，重查点补起缺失场次', '下一批'],
  ['JOB-04', 'job', F.jobs, 'liveness 事件式更新；update 90 / local 45 的 89/90/91 边界；无 60 分钟旧值', '下一批'],

  // ── 会话包 / 角色 / 技术作业（3）─────────────────────────────────────────
  ['REV-01', 'review', F.packet, '多帧 zstd 会话包：全部解出、窗口/排除项正确、坏帧不产半包', '下一批'],
  ['REV-02', 'review', F.roles, '四角色工具面/写边界/CODE 不变；无 shell；越界写一律拒（officeBoundVerdict 单测 + 静态角色矩阵；组员标记与否定项按 0.2.1 的注释口径读）', '批次 B'],
  ['REV-03', 'review', F.technicalReview, '技术作业产物：CODE 前后哈希、findings 稳定 id、报告/发现集哈希可独立校验', '下一批'],

  // ── 回执 / 票（4）───────────────────────────────────────────────────────
  ['RCP-01', 'receipt', F.receipts, '覆盖校验正反矩阵：每条 finding 恰好一个落点、票真实且 acceptance 非空', '批次 C'],
  ['RCP-02', 'receipt', F.receipts, '未关闭采纳票可见；done 必有验收证据；void 必附理由与重呈现', '批次 C'],
  ['RCP-03', 'receipt', F.technicalReview, 'health 以作业产物为锚（改报告一字即红），不以回执自报 SHA 为锚', '下一批',
    '裁定 A3 已确认归一：RCP-03 归 integration/technical-review.test.mjs（依赖技术作业真实产物与锚点），unit/receipts.test.mjs 不再登记该 ID。来历：契约 §10.2 与提案 §B1.4 的同一张表把 RCP-03 同时列在两行'],
  ['RCP-04', 'receipt', F.receipts, '接手：先查已有产物、只补差、回执版本化不静默覆盖、不得伪造“原组长已处置”（父死窗口 PENDING）', '批次 C'],
  ['RCP-05', 'receipt', F.rcp05, 'F-162 回执三件套进 `local-mark`（真子进程 + 每格一个带 marker 的临时工作区，**十三种输入**全部走"必交"那一支）：A 三件齐全且正确 ⇒ `done`，节点三格 = **回执盘上字节**的 SHA256 / **`.team` 相对**路径（`leader/<day>/技术复盘回执.json`）/ 回执声明的整数版本，`local-read` 三格同值，且摘要 **≠** 回执自报的那个值（自报不算锚）· B0 必交却没给 ⇒ `E_ARG_SCHEMA` · B1/B2/B3 半套（各缺一件）⇒ 同一个 `E_ARG_SCHEMA` · C 摘要与盘上字节不符 ⇒ `E_ARG_HASH` · D1/D2/D3 回执没声明整数 `version`（缺 / `"2"` 字符串 / `0`）⇒ `E_DATA_CORRUPT` · E1/E2 `memory_review` / `conversation` 交任一件回执锚点 ⇒ `E_ARG_SCHEMA` · F 回执在 `.team` 外 ⇒ `E_DATA_MISSING` · G 版本不符 ⇒ `E_ARG_SCHEMA`；被拒的每一步 exit 码对得上 FROZEN.exitCodes、**零写入**（比状态文件 SHA256）、节点仍 `running`、六个锚点一个不落 —— 外加阳性对照（照裁定写的最小实现十三条全成立）与三把刀 `KR1` 三行写回删掉 ⇒ 只翻 A · `KR2` 档位恒 `optional` ⇒ 只翻 B0 · `KR3` 摘要不与字节对账 ⇒ 只翻 C（三把刀在全部十三种输入上量）', '批次 S'],

  // ── Health / 每日状态（2）───────────────────────────────────────────────
  ['HLT-01', 'health', F.health, 'health 六场景矩阵：没开工 HOLD、运行中非绿、缺本地双评审红、完整绿 —— 另加 `F-157` 一格：`agenia-local.mjs --op health` 必须把载荷里的 `session_id` 带进判定（「daily 在、local 不在」那一支）：带（= opener）⇒ detail 不许出现「判不了是谁开的」且点明「本会话刚开工」；不带 ⇒ 必须出现「判不了是谁开的」；两次 `status` 与 reason 码同值、两句话必须不同（否则那一格没人读）', '批次 C'],
  ['HLT-02', 'health', F.health, '失败/父死不丢原因；staleVerdict 边界按 update 90 / local 45 分列且无 60', '批次 C'],
  ['HLT-03', 'health', F.hlt03, 'F-162 **卡的第二半**（判真实卡那一扇门 `agenia-local.mjs --op health` → `healthVerdict` → `buildHealthCard` → `<工作区>/.team/brain/<day>/health.json`，**不是**脑侧 `health-read`）：A `technical` 已 `done` + 回执在盘上、三个锚点缺一个（`receipt_sha256` 是 null）⇒ `RED E_RECEIPT_ANCHOR`（**不许**报 `E_RECEIPT_MISSING`）· B 只齐一个锚点 ⇒ 同一个 `E_RECEIPT_ANCHOR`（"1–2 个"两个方向都量）· C 盘上没有回执 ⇒ `RED E_RECEIPT_MISSING` · D 三个锚点全齐 + 回执在盘上 ⇒ `GREEN`（阳性对照）—— 四条另判 `progress` 3/3 与 `receipt:true/false`、盘上那张卡与 stdout 同一句话（status + reasons）、`paths.local`/`paths.receipt` 给出处、读面零写入（状态文件 SHA256 前后相同）；另判两个分支**不许合并**（`E_RECEIPT_ANCHOR` ≠ `E_RECEIPT_MISSING`）', '批次 S'],

  // ── 门 2 · `F-160` 评审对象是提交（2）：活树动了不算你的事 / 副本动了就是（2026-10-24）──────────
  ['REV-04', 'review', F.rev04, 'F-160 **评审对象 = 派工那一刻的提交**（活树在窗口里动了 ⇒ 本轮仍然有效）：夹具仓库（两次提交、钉住哈希）+ 导出器落只读副本 —— 副本逐份 `git blob` SHA-1 = 该提交、路径集合一致、里面没有 `.git`，副本的 CODE 指纹 = 卡片上的 `before_sha256`（提交侧从 git 对象独立算出来的那个数，两条路必须同一个）；窗口里动**活树**两处（改 `lib/alpha.mjs` + 加 `lib/added-by-other-role.mjs`，都进 CODE 名单）⇒ **副本前后 `equal:true`（本轮有效）**、活树前后 `equal:false`（**旧口径会作废这轮好评审** —— 今天红的就是这条）；校验模式自己复算 ⇒ `equal:true` · `is_that_commit.ok:true` · 活树动了 **2** 处（**不是**"副本 vs 活树的分歧"：真仓库今天 135 份提交 vs 192 份活树，分歧 57 ⇒ 按分歧报 = 读数撒谎）；没给活树基线 ⇒ 变动数**判不了**（`null` + 一句说法，不许读成 0）；同一个 `--out` 再导一次必须拒（读数不许原地覆盖）；另加真仓库里钉住的提交 `8b7cea6…` 那一段（副本仍必须是它、CODE 指纹仍必须对得上）；外加三份载体上的针：作业书「必读输入清单」的代码根那一行 + 「地基」一节（副本 / 活树不在本轮 / 你得报一句）+ `leader.md` 第三步（`rev-parse` / 副本 / `before_sha256`）+ `CONTRACT.md` 的 `F-160` 那一句；`C` 段另有**夹具自检**（`LIVE-COUNT-FIXTURE`，`F-160` `P7`）：夹具一旦把"活树变动 2 处"与"副本 vs 活树的分歧"做成同一个数，`LIVE-COUNT-INFLATED` 就没有样本、会静默空转 ⇒ 当场红（先在夹具里造出"从没进过提交的文件"再读下面的绿）', '批次 T'],
  ['REV-05', 'review', F.rev05, 'F-160 **同一把尺子的反方向：评审自己动了副本 ⇒ 本轮作废**（单因：活树一个字节不动）：改副本里一份 CODE 文件 ⇒ 副本前后 `equal:false`、`changed[]` 恰好那一份、活树前后 `equal:true`（证明翻面只来自副本）；校验必须自己复算 ⇒ `equal:false`（**不许照抄卡上的值**——卡上还写着派工那一刻的数）+ `is_that_commit.ok:false` 并**点名**那一份文件；再拿**另一个提交**去核一份干净的副本 ⇒ `equal:true`（副本确实没动）但 `is_that_commit.ok:false` —— 两条腿互相独立，只比哈希的实现会在这一格上"绿得看不出来"；外加量具自证（副本上"盘上那一条路"与 `.tools/fingerprint.mjs` 必须是同一个数）；`live.moved` 那条"必须是 0"的腿（`F-160` `P8`）：这一格**给了**活树基线、活树一个字节没动 ⇒ 报 `null`（判不了）也**红**（`LIVE-COUNT-UNMEASURED`）—— `null` 不许通过一条要求"必须是 0"的腿', '批次 T'],

  // ── data-root 隔离（3）──────────────────────────────────────────────────
  ['DR-01', 'data-root', F.dataRoot, '命令清单 × 姿势矩阵：省略/空/相对/真根变体/C 盘/UNC/越界/合法根；非法一律非零退出零写入', '批次 C'],
  ['DR-02', 'data-root', F.dataRoot, '所有可写命令只在测试根落盘；真实脑路径集合不变（内容不判）；四作业接缝；临时件全落 E 盘', '批次 C'],
  ['DR-03', 'data-root', F.dataRoot, '脑根与路线工作区分舱：票进工作区、脑命令不产路线产物、错根被拒', '批次 C'],

  // ── 安装 / 回滚 / 发布扫描（3）──────────────────────────────────────────
  ['INS-01', 'install', F.install, '只按清单覆盖代码；非空数据逐字节保留；未知文件保留；重装幂等', '下一批'],
  ['INS-02', 'install', F.install, '回滚只回代码不回数据；脚本零 import 自足；失败保留现场', '下一批'],
  ['INS-03', 'install', F.install, '发布物无 .runtime/私有数据；备份在 E 盘带哈希清单；脚本无 C 默认临时', '下一批'],

  // ── 环境 / C 盘（2）─────────────────────────────────────────────────────
  ['ENV-01', 'env', F.env, '非法 TEMP/根/marker 在写任何 SUT 文件前被拒绝；合法环境全落 E 盘', '下一批'],
  ['ENV-02', 'env', F.envScan, '静态扫描：无 %TEMP% 默认、无 C 盘硬编码、无默认真实根、删除前有 marker 校验、不得 import 生成器（A11）', '批次 B'],

  // ── 读取义务（1）───────────────────────────────────────────────────────
  ['READ-01', 'read', F.readObligations, '四份作业书（清单/版本/哈希）+ 组长侧（全文读 + 评前评后指纹两次）条款齐备', '批次 B'],

  // ── 候选池工具（11）：F-53 写在 `.team/` 里的真身，F-57 搬进项目────────────
  ['PFL-01', 'proposal-file', F.proposalFile, '安全：跑前跑后真实候选池一个字节不变', '批次 G'],
  ['PFL-02', 'proposal-file', F.proposalFile, '一次调用 = 一条候选 + 一句出处（正向 + 反向零写入）', '批次 G'],
  ['PFL-03', 'proposal-file', F.proposalFile, '形状拒绝五格：text/source/kind/sha256/多余键 各自点名', '批次 G'],
  ['PFL-04', 'proposal-file', F.proposalFile, '判重键 = (source, sha256)：同源同文拒 · 同源换文收 · 换出处收', '批次 G'],
  ['PFL-05', 'proposal-file', F.proposalFile, '报文能指名：来源重了 / 内容哈希不符是两个码，各自点名', '批次 G'],
  ['PFL-06', 'proposal-file', F.proposalFile, '判决岗看不见它：# @member-deny proposal_file + 补丁里那一份 proposalFile: false（阳性对照先过）', '批次 G'],
  ['PFL-07', 'proposal-file', F.proposalFile, '除判决岗外都看得见（含 review）；且它真的注册上了', '批次 G'],
  ['PFL-08', 'proposal-file', F.proposalFile, '不依赖 shell · 不拆 review 写边界 · inject 顶层不 import 脑库', '批次 G'],
  ['PFL-09', 'proposal-file', F.proposalFile, '冻结契约同步：冻结 ID 一条不少 · 体检指名 · 增量常量对账', '批次 G'],
  ['PFL-10', 'proposal-file', F.proposalFile, '落点：判重与追加在同一把锁里（持锁时不写 · 两进程只进一条）', '批次 G'],
  ['PFL-11', 'proposal-file', F.proposalFile, '不许按人拒绝：主路不吃身份也照样能提', '批次 G'],

  // ── 门 1 · 回执链路四票（4）：校验方必须自己复算（F-120～F-123，2026-10-22）──────────
  ['VRF-01', 'verify-recompute', F.vrf01, 'F-120 指纹口径：写 <root>/.runtime/ 不许让 CODE 翻面 · 改 lib/ 必须翻面 · 现役预设根 CODE 名单里 .runtime/ 必须 0 份', '批次 H'],
  ['VRF-02', 'verify-recompute', F.vrf02, 'F-121 findings_set_sha256 必须由校验方复算：内容改一个字声明不动 ⇒ parseFindings / 覆盖校验 / receipt-check 三处都拒（E_RECEIPT_HASH）；零发现与真值两例必须过', '批次 H'],
  ['VRF-03', 'verify-recompute', F.vrf03, 'F-122 code_fingerprint 三种形状必须拒（before≠after 却 equal:true / 只有 {equal:true} / 声明与盘面复算不符）；equal:false 与真 equal 两例不许被改坏', '批次 H'],
  ['VRF-04', 'verify-recompute', F.vrf04, 'F-123 staging 树覆盖面：差异做在非 inject.js 文件（或同一新路径）上必须非 equal；相同树 / 只改 mtime / 只在 .runtime 上不同必须 equal', '批次 H'],

  // ── 门 1 · `F-112` 剩下两格（2）：照着一张声明的名字表签字（2026-10-22）──────────────
  ['SURF-01', 'surface-declared', F.surf01, 'F-112① 注入面清单「声明了就必须在盘上」：13 份声明逐份 existsSync（缺一份 ⇒ 红并点名）+ 名单↔份数成对 + 五组控制面（三份都在 / 少一份 / 少两份 / 一份都不在 / 空表）', '批次 I'],
  ['SURF-02', 'surface-declared', F.surf02, 'F-112② inject.js 兜底名单的注释与常量是同一个名单：注释块里必须有 `@roster` 机读声明（散文不算声明、没有它 ⇒ 红并点名那份兜底）+ 与常量逐项一致（说"不在"的不许在、说"在"的必须在；点名 key + 两处行号）+ 不许沉默（memory/style 必须表态）+ 常量不许零读点 + 十九组控制面 —— 其中五组是 `F-133` 的两把刀：① **注释掉的旧常量不许顶替真常量**（旧读取器取"第一条命中行"，真常量上方留一行注释掉的旧常量 ⇒ 判据量的是注释、跑代码的人读的是真常量）· ② **`@roster` 没表态的 key，散文说反了也要红**（散文说"不在"而常量里有 / 说"在"而常量里没有，两个方向都判、点名到 key 与行号）', '批次 I'],
  ['SURF-03', 'surface-declared', F.surf03, 'F-112① 补格：注入面声明的每一份 .md 不许是空壳（去掉空白后必须非空：1 字节 / 只剩空白 / 只有 BOM ⇒ 红并点名；读不出正文也点名；缺一份不归这一格）+ 九组控制面（含 CRLF 2 字节那一格）· `F-135` 再加一格：**真那份 `presets/agenia/.runtime/common-sense.md`（常识）在不在 / 空不空**（不在 / 空壳 / 读不出 ⇒ 三个码各说各的）+ 五组合成事实 + **抽走对照**（运行根里放一份活体正文的逐字节副本，改名搬开 ⇒ `SURF-COMMON-SENSE-MISSING` 点名那个路径，搬回 ⇒ 重新绿且逐字节相同）+ 注入器那一侧**得出声**（读不到 / 空文件两条分支都被注释掉 ⇒ `SURF-COMMON-SENSE-SILENT`；文本针先剥注释，注释掉的警告不算出声）', '批次 I'],

  // ── 门 1 · `F-125` 正文 400 字帽（3）：同一个上限只挂在一条入口上就等于没有（2026-10-22）──────
  ['MTC-01', 'maintenance-cap', F.mtc, 'F-125 `payload.entry.text`：401 字必拒（码带 TOO_LONG 且已登记；报文给 401/400/位置）/ 400 字必过 · BOM 与 CRLF 归一后 400 也算过（同一把 `charCountOf`）· **两条导入 CLI 同两格**：`--op maintenance-import` 与 `--op proposal-import` 各导一次，401 ⇒ exit 2 且池子零写入、400 ⇒ exit 0 且恰好追加一行（正文仍是 400 字）', '批次 J'],
  ['MTC-02', 'maintenance-cap', F.mtc, 'F-125 `payload.engine_ops[].entry.text`：401 必拒 / 400 必过 · 超长那条在第二位也要被抓（不许只看第一条）· 纯 retire 案（无正文）不许被误伤 · 两处都超也拒 · 真 CLI 同两格外加零写入', '批次 J'],
  ['MTC-03', 'maintenance-cap', F.mtc, 'F-125 阳性对照（旧**工具**面，不是导入面）：普通候选 401 字**仍然**被 `proposal_file` 拒（码 = `E_PROPOSAL_TOO_LONG` 且已登记；报文给 401/400）· 400 过 · BOM/CRLF 归一后 400 也过 · 主路拒时零写入、400 时追加一行 —— 两把闸不互相顶掉 · `F-134` 再加一格：**两个入口对同一段（两个开头 BOM）必须报同一个字数**（`lib/memory.mjs::charCountOf` 剥全部 BOM vs `tools/proposal-file.mjs::charCountOfText`）：两个 BOM + 400 字 ⇒ 工具必须收（只剥一个会算成 401 ⇒ 拒）；两个 BOM + 401 字 ⇒ 必须拒且报文里那个字数 = 401（不是 402）。刀靠 `AGENIA_F125_SUT_TOOL` 指到运行根里的副本（生产代码不动）', '批次 J'],

  // ── 门 2 · `F-129` anchors 形状（1）：没给与给错了必须分开（2026-10-23）─────────────────
  ['ANC-01', 'anchors-shape', F.anc01, 'F-129 `codeFingerprintVerdict` 的 anchors 八格：非对象（64 hex 字符串 / 数组 / 数字 / 布尔）· 短哈希 · 一半坏（**第二项**是 `xyz` / `null` / 空串 —— `null` 是"给了但形状不对"，`undefined` 才是"没给"）· 坏值（`42` / `false`，另有 `{SHA_A, false}` 让第二项真被读到）⇒ 拒 `E_ARG_SCHEMA`；`null` / 省略 / **对象在但一项都没给**（`{}` · 两项都 `undefined`，第三态与 `null` 同形：同一段结论含「判不了」、前缀各自不同）⇒ `ok:true` **且 `detail` 非空、写明"判不了"**（契约 §6.3 ⑧；这一支单独一个红因 `ANCHORS-NULL-DETAIL-SILENT`）；全对 · 只给一项（`{before_sha256: SHA_A}`）⇒ `ok:true` 且 **`detail` 必须是空串**（判过了却写"判不了" ⇒ `ANCHORS-GOOD-DETAIL-CAVEATED`）；真对不上 ⇒ 仍 `E_CODE_FINGERPRINT_MOVED`；**次序**（坏 `fp` + 非对象 `anchors` ⇒ 必须报 `fp` 那条，红因 `ANCHORS-ORDER-SWAPPED`）—— 外加阳性对照（照契约写的最小实现八格全成立）与三把反向刀（删掉「非对象就报错」那一行 ⇒ 只有 S0 翻面；挖空 REF 里三态共用的「判不了」⇒ G1 四形一起翻红；给"判过"那一侧加 caveat ⇒ G2 两形一起翻红；后两把另有 `KNIFE2-PARTIAL` / `KNIFE3-PARTIAL` 抓"只翻一部分"）', '批次 K'],

  // ── 门 2 · `F-148` 思考链过滤（3）：把碎片挡在落盘之前（2026-10-23 · 紧急票）──────────────
  ['RFG-01', 'reasoning-filter', F.rfg01, 'F-148 `lib/reasoning-filter.mjs`：单元表七行（汉字 1 / 英文单词 1 / emoji 1 / 阿拉伯数字 1 / 特殊字符 1 / 空白 0 / 标点 0）+ `P0` 逐字 + 四条易踩口径（`·`/`_`/`#`/`/` 计 1 · `-` 计 0 · 反引号计 1 · `~~~` 不当围栏）· 3 与 4 的边界 · `\\r\\n` 归一 · 空段落也删 · `\\n` 重建口径 · 代码块例外六格（围栏行 / 围栏内 / 围栏外 / 未闭合 / 跨 delta / 带语言标记）· `push`+`flush` 与批式**逐字节等价**（含一字符一切、`\\r` 与 `\\n` 跨 delta）· 两个 filter 不共享状态 · `MIN_UNITS === 3` —— 外加阳性对照（照契约写的最小实现全格成立）、反向对照（什么都不做 ⇒ 该删的格必须红）与反向刀（删掉围栏状态机那两行 ⇒ 只有围栏格翻面）', '批次 L'],
  ['RFG-02', 'reasoning-filter', F.rfg02, 'F-148 `inject.js` 的 `llm/stream` 监听器（**delta 层**）：`apply()` 之后**恰好一条** · 调用它**同步**拿到 AsyncIterable（`dsh-agent-loop` 是 `for await (… of llm.stream(request))`，返回 Promise 会 TypeError）· `next()` 恰好一次 · `reasoning-delta` 的文本被过滤（半行 + 围栏被拆在多个 delta 里 · 末段靠 `flush()` 吐尾巴）· 其它 chunk（正文 / 工具调用 / usage / finish）**同一个对象、同一次序、一个不少** · `index` 逐个保留 · 过滤时抛错 ⇒ **不冒到流上** + 出事的 chunk 原样吐出 + 后面的照旧过滤 + `console.error` 只一次 —— 外加阳性对照（照 §10.5 写的最小接缝六格全成立）与反向刀（删掉那对 `try`/`catch` ⇒ 只翻 S6）', '批次 L'],
  ['RFG-03', 'reasoning-filter', F.rfg03, 'F-148 **落盘的那一份**（`block-end` 的 reasoning 载荷，`dsh-llm/lib/index.js:1020-1021` 的「载荷优先」）：真适配器形状（`block-start` → 若干 `reasoning-delta`（含 ≤3 与 ≥4 单元的段）→ `block-end`（`block.text` = 那些 delta 的**未过滤拼接**）→ `usage` → `finish`）**装配之后**该 index 的 reasoning `text` 必须等于手写的清洗结果 · **只有 `block-end`、一个 delta 都没有**的形状也得清 · 尾巴（末段没有换行）必须排在**第一条 `finish` 之前**、`finish` 之后不许再有 `reasoning-delta` · `block-end` 的 **text 块**载荷一个字节不许动 —— 外加三条量具自控（`A-PREF` 载荷赢 / `A-ACC` 无载荷按 delta 累加 / `A-IGN` `block-end` 后被忽略；坏了报 `ASSEMBLER-RECOMPUTE`）、阳性对照（照 §10.5 写的最小接缝四格全绿）与两把刀（删载荷改写 ⇒ 只翻 A1/A2；删 `finish` 前 flush ⇒ 只翻 A3）', '批次 L'],

  // ── 门 2 · `F-152` 板子三态（1）：同一个句子里两种「没验过」必须说两句话（2026-10-23）──────
  ['BRD-01', 'board-states', F.brd01, 'F-152 板子告警三态（判**注入文字**：假 ctx 上跑 staged `inject.js` 的 `apply()` → 喂 `tools/result` → 走一次 `agent/pre-step` 瀑布 → 读那一步真的塞进 `decision.messages` 的尾巴）：A 叫过开发、从没叫过测试、文件没动 ⇒ 「⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。」（逐字）；B 从没叫过测试、项目文件动过一次 ⇒ 一句**新的**话，必须说明"文件改/动过 + 一次测试都没叫过"，且**不许**出现「最后一次测试之后」「那次测试作废」「叫过开发」—— **同一个格子两条输入**（B1 外聘叫过 / B2 开发叫过；组长 2026-10-23 拍板：「从没叫过测试」优先于「测试之后又动了」，红因点名是哪一条输入）；C 叫过测试之后又动过一次 ⇒ 「⚠️ 最后一次测试之后，项目文件又动过 1 次 —— 那次测试作废，要重测。」（逐字）；D 叫过**评审**、之后别的岗位又写了一个项目文件（`F-160` `P16`/`P17`）⇒ 板子只说「有新改动」+「还没被评审过」，**不许**出现「评审作废」「要重审」（钉**短语**不钉整句：现役那一句里有「不因这些变动作废」，拿裸「作废」当针会把正确的句子判红）—— **同一个格子两条输入**（D1 评审之后动过 ⇒ 那一行必须在；D2 评审之后什么都没写 ⇒ 那一行整个不许出现）；—— 每格另判板子**进度行**的前置（`BRD-STATE-SETUP`）与"板子整段没贴"（`BRD-NO-BOARD`）；外加阳性对照（照 §3.3 写的最小实现三格每条输入全成立）与反向刀（删掉「从没叫过测试、但文件动过」那一支 ⇒ **只有 B 格的每一条输入**翻红，`KNIFE-WRONG-VECTOR` 抓多翻/少翻）', '批次 M'],

  // ── 门 2 · `F-155` 开工痕迹的两端与署名（2）：写面记不下来、读面说不出是谁（2026-10-23）──────
  ['DLY-01', 'daily-state', F.dly, 'F-155 **写面** `--op daily-start`（真子进程 + 每格一个带 marker 的临时工作区）：A1 两次调用（两个不同 `session_id`）⇒ `first_*` 保第一次、`last_*` 是第二次、`seen_count === 2`，其余键（`project`/`workspace`/`snapshot`/`distribution`/`totals`/`char_metric`）照旧且**键集恰为目标形状**；A2 旧形状（只有 `session_id` + `updated_at`）被调一次 ⇒ 仍读得懂，老 `session_id` ⇒ `first_session_id`、老 `updated_at` ⇒ `first_at`（同一个**时刻**即可）、`seen_count === 1`；A3 第一次调用就**没带** `session_id` ⇒ `first_session_id === null`、`first_at` 照写、`last_session_id === null`、`seen_count === 1`；A4 先由 session-1 开过、再一次没带 `session_id` ⇒ `first_*` 保持原样、`last_session_id === null`、`seen_count === 2`（规则 3 的"stays whatever it was"）—— 外加阳性对照（照契约 §11 写的最小实现四格全成立）与**四把刀**（① 老形状不升级 ⇒ 只翻 A2；② 完全不合并 ⇒ 翻 A1/A2/A4；③ 每次都覆盖 ⇒ 翻 A1/A2/A4（**算术上必然连带 A2**）；④ 覆盖的窄形状 ⇒ 翻 A1/A4），每刀实测向量与契约推出的对不上 ⇒ `KNIFE-WRONG-VECTOR`', '批次 N'],
  ['DLY-02', 'daily-state', F.dly, 'F-155 **读面** `--op health-read`（`daily` 在、`local` 不在那一支；五格 + 阳性对照）：B1 没有 `daily`、也没有 `local` ⇒ `HOLD` + `E_NO_UPDATE_TODAY`，detail 仍是「今天还没有开工痕迹」（保持）；B2 `first_session_id` **≠** payload 的 `session_id` ⇒ `RED` + `E_DATA_MISSING`，detail 点名 `first_session_id` 与 `first_at`（逐字）且说**本会话不是**开这一天的人（锚点「本会话不是」）、不许说「刚开工」；B3 两者**相同** ⇒ `RED` + `E_DATA_MISSING`，detail 说本会话**刚开工**（锚点「刚开工」）、不许说「本会话不是」（两种语序「本会话不是…」/「…不是本会话…」都算禁）；B4 payload **没有** `session_id` ⇒ `RED` + `E_DATA_MISSING`，detail 仍点名 opener 与 `first_at`，但两句身份话**都不许说**（「刚开工」+「本会话不是」的两种语序 —— 不许冒充知道是谁）；B5 端到端：真 `daily-start` 写下的那份（`first_*` 在盘上）被卡片读两次（本会话 / 别人）各说各的话 —— 另判**落盘那张卡**与 stdout 同一句、这一支今天**恰好一条** reason、status/码一个都不动；⚠️ 夹具里旧单值键 `session_id`（= 最后一次调用的人）与 `first_session_id`（= 开这一天的人）**故意不同**：谁去读旧键，B2/B3 当场翻面', '批次 N'],

  // ── 门 2 · `F-156` 三个本地节点的三态（1）：写者是组长，不是作业（2026-10-23）──────────
  ['LOC-01', 'local-state', F.loc, 'F-156 三个本地节点（`memory_review` / `conversation` / `technical`）的三态契约（真子进程 + 每格一个带 marker 的临时工作区；判**盘上** `state/local/<day>.json` 与 `local-read` 的 `state`/`summary` 两处，不只判 stdout）：`L1` `claim → mark` ⇒ 节点 `done` + 产物锚点逐项记下（`report_sha256` **必须等于报告盘上字节的 SHA256**；`findings_set_sha256` / `findings_count` / `artifact_paths` 原样）+ `claim`/`job_id` 仍指得出是哪一次派工 + `liveness_at` = 落地那一刻 + 兄弟两节点一个字不动；`L2` `claim → fail` ⇒ 节点 `failed` 且 `failure_reason` **逐字**留住（换成「(没给原因)」就是这一格翻面）+ claim 痕迹保留；`L3` **两个节点真并发 claim**（`conversation` + `technical` 两个真子进程同时起）⇒ 两节点各自 `running`、各自 `job_id`/`attempt`，**谁都不许覆盖谁**，第三个节点仍空；`L4` **任何 claim 之前** `local-read` ⇒ `E_DATA_MISSING` + exit 7 + 报错点名那个路径（缺 ≠ 坏 ≠ 空；读面零写入），首个 claim 之后没被 claim 的两个节点以**文档里的空形状**出现（`unclaimed` + `lib/local-state.mjs::emptyNode()` 的 15 个必填键、该 null 的 null、该 `[]` 的 `[]`；加性键不判名字）—— 外加阳性对照（照 `CONTRACT.md` §12 写的最小实现**六条输入全成立**）与**五把刀**（① `claim` 丢掉按节点合并 ⇒ **只有 `L3:A`** 翻面；② `fail` 丢掉 `reason` ⇒ **只有 `L2:A` / `L2:B`** 翻面；③ `mark` 不记锚点 ⇒ **只有 `L1:A`**；④ `mark` 不核锚点 ⇒ **只有 `L1:B`**；⑤ `emptyNode()` 丢那 **10** 个键 ⇒ **五条输入**（`L1:A`/`L1:B`/`L2:A`/`L3:A`/`L4:A`）一起翻 —— ③④⑤ 是量具自证：这一格今天全绿，"绿"只有在每一格都能红时才算读数），每刀实测向量与契约推出的对不上 ⇒ `KNIFE-WRONG-VECTOR`。⚠️ 四个 op 的行为**今天就是对的** ⇒ 本格今天 **RED 0**，是回归锁不是首跑红（缺的是**调用者**：写者 = 组长，§12）', '批次 O'],

  // ── 门 2 · `F-158` 一天从本地 04:00 切（6）：一处算、处处用（2026-10-24）──────────────────
  ['DBY-01', 'day-boundary', F.dby, 'F-158 切点**下方** `2026-10-24T03:59:59+08:00` ⇒ `2026-10-23`：① 那一处算 `lib/route.mjs::dayKeyOf`（定形落点 3：它本身就是那个函数）返回的必须是**带连字符的日子**（返回 `20261024` 这种"票号 8 位"⇒ 红因 `DBY-PURE-SHAPE`，形状错与切点错分开报）且是前一天；②③④⑤ **四个消费方的缺省日**（真子进程 + 注入时钟 + payload/命令行里没有 `day`）：`daily-start`（信封 `day` + `.team/state/daily/<day>.json`）· `claim-update`（信封 `day` + `state/update/<day>.json`）· `daily-cards.py`（`.team/leader/<day>/` 那个**目录名** + `exit_code === 0`）· `local-claim`（信封 `state.day` + `.team/state/local/<day>.json`）四处都必须落到 `2026-10-23`；⑥ `report-read` 的**缺省日**（**体检那条红走的同一条路**）信封 `day` 与 `path` 都要以 `reports/memory-update/2026-10-23.json` 收尾；⑦ **票号那 8 位**：`nextTicketId([], dayKeyOf(instant))` 仍须是 `ticket-<8 位>-<NN>`（§13.4）；⑧ 阳性对照 + 刀 `K1`（去掉 −4h）实测向量 `[B1,A1,A2,A3,A4]`；⑨ **切点刀**：`.tools/daily-cards.py` 的 `DAY_CUT_HOURS = 4` 改成 3（跑**运行根里的副本**，`.tools/**` 零字节）⇒ 这一刻必须翻到 `10-24`（红因 `DBY-CARDS-KNIFE-NO-BITE`）—— 门 4 评审 F1：切点不被钉住时，改成 3/5/10/20 五个格全绿', '批次 P'],
  ['DBY-02', 'day-boundary', F.dby, 'F-158 切点**上方** `2026-10-24T04:00:01+08:00` ⇒ `2026-10-24`（同一批**四个消费方**，方向相反）：① `dayKeyOf` 的形状与前缀同上、日子必须是当天；②③④⑤ 四个消费方的缺省日同 `DBY-01`；⑥ `report-read` 的缺省日与 `path` 收尾；⑦ 阳性对照 + 刀 `K2`（切点搬到 05:00）实测向量 `[B2]`；⑧ **切点刀**：`DAY_CUT_HOURS` 改成 5 ⇒ 这一刻必须翻回 `10-23`。⚠️ 这一侧在**两种尺子下同值**（零点尺子也是 10-24）⇒ 它证的是"别把切点上方也挪走"；纯函数那一格 `K1` **翻不动**它（算术），所以让它红的那把刀必须是 `K2` —— 没有 `K2` 这一格就是装饰。两向一夹（`03:59:59 ⇒ 10-23` 且 `04:00:01 ⇒ 10-24`）整数小时的切点只能等于 4', '批次 P'],
  ['DBY-03', 'day-boundary', F.dbyAgreement, 'F-158 **四处入口同一个 01:30**（老板那张现场：凌晨一点半还在干前一天的活）：`claim-update`（信封 `day` + `state/update/<day>.json`）· `daily-start`（信封 `day` + `.team/state/daily/<day>.json`）· `daily-cards.py`（把两张卡落进的**目录名** `.team/leader/<day>/`，真 python 子进程）· `local-claim`（信封 `state.day` + `.team/state/local/<day>.json`）四处**都不给 day**，四处都必须落到 `2026-10-23`，**且互相同值**（各自对 + 彼此相同是两层判据：一起错也是一种同值 ⇒ 红因 `DBY-CONSUMERS-WRONG-DAY` / `DBY-CONSUMERS-DISAGREE`）；阳性对照 + 刀 `K3`（**一个**入口绕开那一处算）实测向量 `[A3]`；另判**量具自证** `cardsKindOf` 四行（`exit 0`+一个目录 ⇒ resolved · 无目录 ⇒ failed · **`exit 1`+目录已建 ⇒ failed** · argparse 缺必填 ⇒ no-default）：门 4 评审 F2 —— `daily-cards.py:140` 在读数据之前就 `makedirs`，只按目录名判绿就分不出"卡出了"与"崩在目录建好之后"', '批次 P'],
  ['DBY-04', 'day-boundary', F.dbyAgreement, 'F-158 **显式 day 的两种形态**（判的是同一批入口收不收、怎么收）：① **好值照抄**，两个方向 —— 显式 `2026-10-23` @ `04:00:01`（那一刻缺省会算成 `2026-10-24`）⇒ 四处都必须仍是 `2026-10-23`；显式 `2026-10-24` @ `01:30`（那一刻缺省会算成 `2026-10-23`）⇒ 四处都必须仍是 `2026-10-24`（只给一个方向的话"把显式值也过一遍 −4h"这种半修 `2026-10-23 ⇒ 2026-10-22` 看不出来）；② **给了但坏 ⇒ 当场拒**：`day` 给 `""` / 全空白 / `2026-13-40` / `2026-02-30`（`BAD_DAYS` 四个值）时 `claim-update` / `daily-start` / `daily-cards` / `local-claim` / `report-read` **五处都必须是 `E_ARG_SCHEMA`**（红因 `DBY-BAD-DAY-ACCEPTED-*` 吞成没给、`DBY-BAD-DAY-CODE-*` 拒得对但码不对）—— `2026-13-40` 这类"形状合规、日历上不存在"的值与空串走**同一条**规则（`isDayKey` 连日历往返一起验），边界是"形状合规**且**日历合法、只是没人会写"的日子（如 `1999-01-01`）仍被收下。阳性对照 + 两把刀：`K4`（显式被吞）实测向量 `[E1,E2]` · `K5`（空串被吞）实测向量 `[D1,D2]`', '批次 P'],
  ['DBY-05', 'day-boundary', F.dbyCheckNotes, 'F-158 **体检那条红的两向格**（`.tools/check-notes.mjs` 的「今天的记忆更新报告在（reports/memory-update/<day>.json）」那一行；判那一行点名的**日子**与**态**，不判绿不绿）：注入 `2026-10-24T01:30:00+08:00` ⇒ 那一行必须点名 `2026-10-23`（凌晨一点半属于前一天，不许嚷）；注入 `2027-01-02T04:30:00+08:00`（那一天盘上**必然**没有报告）⇒ 必须点名 `2027-01-02` **且是 `RED`**（该报就报）；外加"两向必须是同一把尺子"（两向读到同一个日子 ⇒ 红因 `DBY-CN-CLOCK-IGNORED`）。✅ 这个工具**走同一把尺子**（`:241` 是 `const today = dayKeyOf(clockNow())`，`:23-24` 从 `presets/agenia/lib/clock.mjs` / `route.mjs` 取 ⇒ 注入时钟生效）⇒ 这一格守的是"别退回真时钟 / 零点切"。`.tools/**` 不在测试岗的可写范围里：这一格**只判、不改**', '批次 P'],
  ['DBY-06', 'day-boundary', F.dbyAgreement, 'F-158 **根上有过期的 `current-day` 指针**（裁定 F4-b、门 4 评审 F4 的落点）：脑根上 `state/current-day.json` = `2026-10-23`、时钟 `2026-10-24T11:00:00+08:00`、payload **不给** `day` ⇒ `claim-update` / `daily-start` 的缺省日必须落到 **`2026-10-24`**（`daily-cards` / `local-claim` 同现场只记读数）。两条腿**各有各的脑根**、各自种一次过期指针，开跑前从盘上读回指针当见证（`pointer_witness[].at_start` 必须都是 `10-23`）—— `claim-update` 成功会写指针，共用一副根时后跑的 `daily-start` 已经看不见过期指针，退回指针的实现照样绿（门 4 复审 R1）。为什么：在一个已经 claim 过、新的一天还没开始的根上，缺省日若跟着指针走就永远回到上一次 claim 的那一天 —— 04:00 的切点**静默失效**（`DBY-03` 用全新脑根，结构上看不见这一支）；指针**没被废掉**，它留给**中途** op（`P2` 那一格：中途 op 跟指针、不跟时钟）。阳性对照 + 刀 `K6`（缺省日跟指针走）实测向量 `[P1]`', '批次 P'],

  // ── 门 2 第二轮 · `F-156` 锚点闸三条规则（3）：按字段 / count 对账 / `.team/` 前缀（2026-10-24）──
  ['LOC-02', 'local-state', F.locAnchors, 'F-156 第二轮 **按字段的必填**（老板 2026-10-24 选项 1；证据 `.team/retro/2026-10-24/技术评审.md` 的 `F1`）：真子进程 + 每格一个带 marker 的临时工作区，**六条输入**判的是同一次 `local-mark` 的**两面**：① `memory-review` **只交报告**（真路径 + 盘上字节的 SHA256、**不带 findings**）⇒ `done`，盘上节点 `report_path`/`report_sha256` 是真锚点、`findings_path`/`findings_set_sha256`/`findings_count` **三个都必须是 `null`**（不许为了过闸编一份）；② `conversation` **只交报告** ⇒ 同 ①；③ `technical` **不带 findings** ⇒ 拒 `E_ARG_SCHEMA` · exit 2 · 节点停在 `running`（claim 痕迹保留）· 五个锚点一个都不落 · **状态文件的字节一个都不许变**；④ `technical` 带一份**真** findings 产物（三条发现 + 真实的 Q10 集合摘要）⇒ `done`，五个锚点逐项记下；⑤ `memory-review` **只给 `findings_count`**（三件套缺 path 与 set）⇒ 拒；⑥ `conversation` 给了 path + set 却**没给 count** ⇒ 拒 —— ⑤⑥ 都是 `E_ARG_SCHEMA` · exit 2 · **零写入**（"要么三件都给、要么都不给"）。两把刀：`KQ1` 三个字段都要 findings（退回到"一视同仁"的形状）⇒ 只翻 ①/②；`KQ2` 三个字段谁都不要 ⇒ 只翻 ③（没有它，③④"technical 仍要 findings"那条腿是**翻不了面的绿**）。刀在**全部二十三个输入**上量 ⇒ 向量里看得见"只翻本格"', '批次 Q'],
  ['LOC-03', 'local-state', F.locAnchors, 'F-156 第二轮 **`findings_count` 与产物条数对账**（评审 `F2`：这个字段只写不读，`0` 最容易被读成"查过了、没问题"）：**六条输入**全是 `technical` + 一份 findings 文件（三条 / 零条发现）：① 盘上 3 条 + `findings_count: 0`（少报）⇒ 拒；② 盘上 3 条 + `findings_count: 9`（多报）⇒ 拒 —— **两个方向都要**：只挡"多报"的半修在 ① 上会漏；③ 3 条 + `3`（诚实计数）⇒ `done`，节点 `findings_count` 正是 3；④ 空 findings（0 条）+ `0` ⇒ `done`（"零条发现"是合法产物，不许被"非空才算数"挡掉）；⑤ 文件**在盘上、是合法 JSON、但没有 `findings` 数组** ⇒ 拒；⑥ 文件**是半截 JSON**（读不出来）⇒ 拒 —— ⑤⑥ 都是 `E_DATA_CORRUPT` · exit 7 · **零写入**（与"文件不在"的 `E_DATA_MISSING` 是两个诊断）。条数不符的拒绝码 `E_ARG_SCHEMA`（这个字段的形状错误就是它）。刀 `KQ3` 收下 count、不与条数对账 ⇒ 只翻 ①/②', '批次 Q'],
  ['LOC-04', 'local-state', F.locAnchors, 'F-156 第二轮 **锚点必须落到 `.team/` 里的真文件、落盘记规范形**（评审 `F3` + 老板 2026-10-24 的改判"收 + 归一化"）：同一次 `local-mark`、**同一个文件的十一种写法**（findings 一侧与 `artifact_paths` 全部规范形 ⇒ 只让 `report_path` 变）：① 规范形 `.team/retro/2026-10-24/技术评审.md` ⇒ `done`；② `README.md`（工作区根下存在的无关文件，SHA256 也是真的 ⇒ 解析后落在 `.team/` **外**）⇒ 拒；③ `./.team/…`（同一个文件、多一个 `./`）⇒ **收 + 记规范形**；④ `retro/…`（**`.team` 相对**写法 —— `RCP-03` / `VRF-02` 的正例用的就是这一种）⇒ **收 + 记规范形**；⑤ 反斜杠写法（同一个文件）⇒ **收 + 记规范形**；⑥ `.team/…/不存在.md`（文件不在）⇒ 拒；⑦ `<工作区绝对路径>\\.team\\…`（绝对路径、在 `.team/` 里）⇒ **收 + 记规范形**；⑧ `<运行根>/outside-loc04/技术评审.md`（绝对路径、包外）⇒ 拒；⑨ `.team/../README.md`（`..` 穿出 `.team/`，目标文件存在）⇒ 拒；⑩ `retro/…/不存在.md`（`.team` 相对、文件不在）⇒ 拒；⑪ **`.TEAM/retro/…`（同一个文件、前缀换大小写）** ⇒ **收 + 记规范形**（首段 `.TEAM` 落盘成小写 `.team/`、其余段按磁盘真名；Windows 不分大小写：位置判定跟平台路径语义走，不是字符串前缀比较 —— 第 4 关复审 round 2 的 `F3`）。🔴 五个"拒"必须是**同一个诊断** `E_DATA_MISSING` · exit 7（缺 / 在外 / 穿出去 / 拼错，读的人不必猜是哪一种）；🔴 **六个"收"**必须把节点上的 `report_path` 记成**规范形**（**首段固定小写 `.team/`、其余段按磁盘真名**、正斜杠）—— `readings.canonical_store` 与 `readings.case_folding` 逐行给出 `fed ≠ stored` 而 `stored === canonical` 的读数（只归一化不落盘的那种半修，只有这一条抓得到）。刀 `KQ4` 去掉"必须落在 `.team/` 下"⇒ 只翻 ②/⑧/⑨；`KQ5` 验的时候归一化、**落盘却记调用方怎么写** ⇒ 只翻 ③/④/⑤/⑦/⑪（① 本来就是规范形 ⇒ 不翻；⑥/⑩ 根本没落地）；`KQ6` 把位置判定退回大小写敏感的前缀比较 ⇒ 只翻 ⑪', '批次 Q'],

  // ── 门 2 · `F-163` 平台版本读数的自证（1）：量具先证明它读的是哪一版（2026-10-24）──────────
  ['PLT-01', 'platform-reading', F.plt, 'F-163 平台版本读数（`support/platform.mjs`：asar 头的 `size` 是**声明值**，`0.2.1-rc.3` 的两份 package.json 的声明都比真身短 2 B；asar 里可解析的 JSON 文本比声明长 1 B）：**合成 asar 造在运行根里**，五条腿 —— A `SHORT-2` 头里的 `size` 比真身短 2 B，两份 package.json 都必须读出**夹具里那个版本**；B `BOM` 同形状 + 文件头 `\\uFEFF`、版本换成**另一个值** ⇒ 证"读的是这一份"（写死常量过不了）；C `TRUNCATED` 短 24 B（> 16 B 读窗）⇒ `ok:false`、版本 `null`，报文点名**文件 / 读了多少字节的窗口 / 最后 40 个字符**且**不许补括号**"修"成 JSON，同一 asar 里没被截断的那一份照读；D `PURE` 容错解析当纯函数再喂两串文本（短 2 B / 截断），与 A/C 是同一条腿的两种入口；E `LIVE` 这一跑真实 asar 上的 `[平台]` 行（读数，不写死版本；没有安装包时记 `asar_present:false`，不把"没装上"当"读对了"）', '批次 R'],

  // ── 任务 A · 九份组员并成一份（2026-11-01 第 2 关）：页面两条 / toolName 定角色 / 判决岗调用被拒 ──────
  ['PRS-01', 'preset-identity', F.presetsTwo, '任务 A 预设面（**打现役** `presets/agenia`，理由见文件头）：① 基线自证（升级前冻的 10 份预设块，逐块 `sha256 = sha256(full_text)`；改了夹具任意一个字符 ⇒ `BASELINE-SELFPROOF`）；② 不变量（今天就对）：九个 `toolName` 一个不多不少、`delegationTools` 九个键、9 条已启用委派行；③ **页面恰好 2 条**预设入口（组长 `agenia` + **恰一份**通用组员），第 3 条 ⇒ `PAGE-COUNT`；④ 九条委派行的 `agentPreset` **同值**且不悬空；⑤ 通用组员预设**不声明** `model` / `tools`（禁字段提取器另有阳性对照：塞了 model+tools 的合成块必须抓得到），组长那一份允许有 leader 级字段；⑥ 旧九份 per-role 预设**全部删除**、组长块的值行与基线**逐行相同**（两处**具名**放行：`defaultRole: leader` 一条 + 末尾 `agenia-dashboard` 的 4 条值行，各有四条限制与自己的阳性对照；其余一个字不许动）', '批次 U'],
  ['PRS-02', 'preset-identity', F.presetsTwo, '任务 A 身份判定表（定形 §2.2 九行按行序判；纯函数 `identityVerdict`）：① 角色表 9 对 `toolName↔role↔read/write` 逐条对（正向）+ 不许第十个（反向）；② 九行各喂一次：`row0` 内部 worker（workflow / ralph）⇒ 无角色 + 不窄 + **未受管**；`row0.5` legacy ⇒ 不窄 + 未受管；`row1` 组长+工具名 ⇒ 拒；`row2` 未知工具名（`team_retro` / `proposal_file`）⇒ 拒；`row3` 组长+无工具 ⇒ leader；`row4` 组员+工具 ⇒ 该角色；`row5` 组员+无工具 ⇒ 窄；`row6` 未知预设+有效工具 ⇒ **角色保留 + 窄**；`row7` 未知+无工具 ⇒ 窄；③ `defaultRole` **只报警**：缺 / 合法 / 与预设不符 / 非法串 四种输入下 `row`·`role`·`narrow` **一格不许动**，只有 `warnings` 变（合法的 0 条、其余 ≥1 且点名 `defaultRole`）；④ 窄权限**恰好** row 5/6/7（row 0/0.5 显式例外）+ 闭三元组 `NARROW_PERMISSION` 逐格对；⑤ `isLegacySession` 谓词：快照里 ⇒ true、之后同形 ⇒ false、**快照坏了 ⇒ false**（走向窄 = 安全方向）；⑥ **运行时执行者**（第 4 关第三轮 N-5）：`narrowVerdict` 读的就是 `NARROW_PERMISSION` —— 三个码各一格（`E_GUARD_NARROW_TOOL` / `_WRITE` / `_PROPOSAL`）+ 三个"该放行"的格子（拦过头也是错）+ 门禁五条判定的**次序**（文件序代理）+ 文字刀自证次序提取器会翻面 + 表值刀（白名单里加 `pwsh`，**证据根里的副本**）⇒ 同一个 `narrowVerdict("pwsh")` 从拒变成放行；⑦ **注入哪一侧**（第三轮 N-3）：**只有 row 3 是组长侧** —— row 0（内部 worker）/ 0.5（旧会话）/ 5（手动组员）/ 7（未知预设）都走组员侧（没有 `leader`/`persona`/`style`、没有开工四步、记忆 = 索引 + 常识、**没有** `boss`/`machine`/`project` 全条），工具侧**不跟着动**（0 / 0.5 仍不窄、5 / 7 窄）+ 刀（`isMemberSide = row >= 4` ⇒ row 0 / 0.5 变回组长侧，row 5 是"刀没切宽"的证人）', '批次 U'],
  ['PRS-03', 'preset-identity', F.presetsTwo, '任务 A 判决岗：提案工具**在列表里、调用被拒**（不是"工具集里没有"）：① `ROLE_TABLE` 的 `deny` **只**挂在判决岗那一条、值含 `proposal`（注册与拒同源）；② `proposalVerdict(\u0027memory-judge\u0027,\u0027proposal_file\u0027)` 必须拒（码 `E_GUARD_JUDGE_PROPOSAL` + 非空报文）；③ 反向：其余八个角色调同一个工具**一个都不许被挡**，判决岗调 `read` 也不许被挡（拒的只是提案，不是这个人）；④ 注册面：判决行上方 `# @member-deny proposal_file` 与补丁里任何 `proposalFile: false` 都必须消失（那是"根本不注册"的旧口径）；⑤ `team/memory-judge.md` 要点出提案工具并写着「调用被拒 / 调用会被拒 / 调用时被拒」，且**不许**再写"没有这个工具"这一类', '批次 U'],
  ['PRS-04', 'preset-identity', F.presetsTwo, '任务 A 角色表是 persona / charter / model / tools 的**唯一作者**（定形 §3.3 + §6.1 的 no-regression）：九份升级前人格**逐字**在角色表里（缺一句 ⇒ `PERSONA-MISSING` / `PERSONA-DRIFT`）、**不串味**（别人的那句出现在这个角色身上 ⇒ `PERSONA-CROSSTALK`，逐字比基线）；`charter` 是 team/ 下**自己那一份**真文件；`model` / `tools` 两个键都在（`model` 可为 null = 引擎默认）、`tools` 非空且**不含任何委派工具**（组员结构上不能再招人）；角色表恰 9 条；⑤ **工具的运行时执行者**（第 4 关第三轮 N-5）：`toolCatalogFor`（装配时裁目录）+ `roleToolVerdict`（调用时拒）都从 `ROLE_TABLE[role].tools` 读 —— review 的目录里**没有** `bash`/`pwsh`、dev 有；窄赢过角色目录（`toolCatalogFor("review", true, …)` = 闭三元组）；框架工具（`run_code` / 不认识的）**不误伤**；刀（把 review 那一格换成 base 全套，**证据根里的副本**）⇒ 目录里冒出 `bash`/`pwsh` **且** `roleToolVerdict("review","pwsh")` 变成放行；⑥ **人格真的被注入**：`agenia:role-persona` 紧挨 `agenia:charter:<role>` 之前、正文**逐字**是角色表那一格、全上下文里**只出现一次**；没有角色的会话两条都不吐；刀（换掉表里 `dev` 那一句）⇒ 注入的正文跟着换。`model` 这一版是**纯声明**（没有读者，见 `CONTRACT-A` §12.4）—— 本格不测"改 model 会话真用它"', '批次 U'],

  // ── 任务 B · bug 系统（2026-11-01 第 2 关）：登记簿 / 五分支分流 / bug 任务与准入 / 严重三线 ──────
  ['BUG-01', 'bug-system', F.bug01, '任务 B1 **登记簿**（契约 `.team/test/CONTRACT-B.md`）：`A` 九个 bug op 在 `--op help` 里（缺面 ⇒ `BUG-OPS-MISSING`，这是"功能没做"不是"输入被拒"）+ `lib/bug-ledger.mjs` 导出 `entryVerdict`/`openCounts`/`capVerdict`；`B` **登记不建路线**（裸工作区上 `bug-register` 成、`.team/route/` 不许被建出来）+ `bug-read` 没有台账 ⇒ `E_DATA_MISSING`/exit 7 且零写入（缺 ≠ 空）；`C` 条目准入 = 现象 + 证据（≥1 条）是硬门、`kind` 只认 `bug`/`observation`、**老板报的 bug 不要求配方**（recipe=null 必须收）、被拒的记录零写入（比台账 SHA256）；`D` **两个词不混**：assessment 四值闭集 · `bug_open` 数的是"无 disposition"（评估为 duplicate/true 都不算处置）· `observation_open` 单独一格；`E` **50/30**：49/50 与 30/31 四条边界各一格（`cap.threshold=50` · `cap.days=30` · `oldest_age_days` 按注入时钟算）· 49 条 @31 天必须因**年龄**翻红（单调性：条数多不许吞掉年龄预警）· 50 条 open observation 不许红 · 60 条已归档不许红 · **封顶红不动手**（不自动改任何 disposition）；`F` **两本账不互串**：路线票段里 7 张 open 票不许进 `bug_open`，且 `bug-read` 前后 `current.json` SHA256 相同（`counts` 恰四格，不许有 ticket 那一格）', '批次 V'],
  ['BUG-02', 'bug-system', F.bug02, '任务 B1 **五分支分流表 + 独立 routing log**（定形 §2.3 那张表）：`A` 五行逐条判（`routingVerdict`）—— ①有配方+成功+环境相关 ⇒ **条目**且**不加** env 标签（"任意"那一格是反例位置）· ②有配方+失败+环境相关 ⇒ 条目+`env`+证据 · ③有配方+失败+与环境无关 ⇒ **票** · ④无配方 ⇒ 票+`one-off` · ⑤间歇 ⇒ 条目+`intermittent`；`B` 判不了不许猜（`repeat=failure` 而 `env_related` 没给 ⇒ 拒；配方词不在闭集 ⇒ 拒）；`C` **报表冻结**：`bug-route` 自己核声明的 `report_sha256`（不符 ⇒ `E_ARG_HASH`、零写入），相符时报告文件 SHA256/字节数前后不变；`D` 老板报的 bug 走这张表 ⇒ 拒 `E_BUG_ROUTE_NOT_APPLICABLE`（"不适用此表"）+ 裸工作区能写且只落 `.team/routing.jsonl`（`.team/route/` 与 `.team/bug/` 都不许被建出来）+ 记录字段 `{cycle, report_ref, report_sha256, finding_id, carrier, tags, by:"leader"}` + append-only（两次两条）+ 周期号是唯一时钟（缺/字符串/0 都拒）', '批次 V'],
  ['BUG-03', 'bug-system', F.bug03, '任务 B2 **bug 任务 + 批次 + 归档 + 准入**：`A` 批次 `{id, frozen_at, entry_ids[]}`——`frozen_at` = 注入时钟那一刻、`entry_ids` 逐字、**再冻结只加一条且旧 batch 逐字不变**、**冻结之后登记的条目 batch=null（进下一批）**；`B` **归档 = 同一本账的 `archived` 段**：带结论的搬走（`disposition` 与 `archived_at` 留住）、没结论的拒 `E_BUG_ARCHIVE_OPEN` 且零写入、归档后 live 段只剩没结论的；`C` 任务形状（`bugTaskVerdict`）：三态闭集 + 五关**共用** `FIVE_GATES`（`方案` 这种并集同义词**必须收**，另抄 5 正名就翻面）+ `batch` 必须指向真 batch + `entry_ids` 非空（一个根因一个任务）；`D` **`admitTask` 16 格准入矩阵**（纯函数；**函数的作者是 C1**，缺面记 `BLOCKED-ON-C1-ADMITTASK` 不是 B 的缺陷）：未建账拒一切修 · build 收实现（headline 空则拒）与票的修、拒 bug 修 · maintain 只收批内（batch 外/无 batch 拒，且点名那条 entry）· build-paused 只收 pause set 内（**即使它在 batch 里也拒** —— 两个集合不混名）· 模式四值闭集 · bug 修必须点名 entry；`E` 运行时那一支（**不依赖 C1**）：没有路线账本 ⇒ `bug-task-set` 拒（只能登记）、码不许被折成 `E_INTERNAL`、台账零写入', '批次 V'],
  ['BUG-04', 'bug-system', F.bug04, '任务 B3 **严重三线 / 四出口 / 样本**：`A` 出口是闭集（三条线 + `unclassified`；第五个值 ⇒ 拒）；`B` **第三线要有地基** —— `reading_lies` 必须点名它掩盖了前两条里的哪一条（没点名 ⇒ `E_BUG_SEVERITY_THIRD_LINE_UNGROUNDED`，纯函数与写面各一格）；`C` 样本：恰好四个（正/负/第三线正/第三线负，`sampleSetVerdict` 四格：少一个·重复·没有第三线那一对都拒）· `registered_by:"leader"` · `registered_at` = 注入时钟 · **事故前预注册**（样本 registered_at 晚于那次评估 ⇒ `E_BUG_SAMPLE_LATE`）· 改样本 = 版本 + **旧样本逐字留档** · **改后不许重判**（同一条 entry 在 v1 判过、v2 再判 ⇒ `E_BUG_SAMPLE_REJUDGE`）· 没被采样的第二条线 `calibrated:false`；`D` **两个作者**：测试岗写 `severity_line`/`severity_confidence`、组长写 `line_decision` 与 `disposition`，跨角色 ⇒ `E_BUG_WRITER_ROLE`（两格）；`E` **判不了不是静默**：`severity_confidence:"cannot"` 与 `unclassified` 不给升级 ⇒ 拒 `E_BUG_SEVERITY_ESCALATE_MISSING`，给了 ⇒ 收 + `bug-read` 的 `card_red.red:true` 且点名那两条 entry；而 bug 评估里的 `assessment:"unknown"` 是**另一个词**（保留 open、不升级，四条都还没 disposition ⇒ `bug_open=4`）', '批次 V'],

  // ── 任务 C1 · 路线账本（2026-11-01 第 2 关）：建账+迁移 / 节点+headline / 槽 / 暂停 / 准入矩阵 ──────
  ['LED-01', 'route-ledger', F.led01, '任务 C1a **建账 + bootstrap 阶段 + 7 张旧票迁移**（契约 `.team/test/CONTRACT-C1.md` §3/§4）：`A` 一次 `bootstrap` 落下 `kind=build` 的 bootstrap 阶段，**mode 立刻是 build**（`read.mode` + `modeOf(账本)`），`headline` = 目标 · 大阶段名（**唯一载体**），**`transitions` 空且审计链恰好一条 `bootstrap`**（证"用现有 ledger 代码"）；`mode` **不存值**（`current.json` 里没有 `mode` 键）+ 阶段类型是闭集（`kind:"weird"` ⇒ 拒）；`B` **迁移**：7 张旧票从 legacy 票店进路线票段（**票号沿用** `F-165`…`F-171`、`legacy_status` 留住、**不存 `status`**），legacy 侧清空 + `migrated_at`/`migrated_to`，**前后计数** 7/0 → 0/7；`C` **可重入**：半跑（route 3 + store 剩 4）再跑补 4 不重复；store 再脏一次（route 7 + store 7）加 0；`D` **回滚零写入**：重复票号 / status 越界 / schema 不对 ⇒ `E_LEGACY_STORE_BAD`，`current.json` 不出现、store sha256 不变；`E` **两期都能建**：老板说「进入维护」⇒ 直建 `maintain`（不先进 build），迁移照跑；没建 bug 台账的工作区 `bootstrap` 不许建 `.team/bug/`', '批次 W'],
  ['LED-02', 'route-ledger', F.led02, '任务 C1b **节点留痕 + headline**：`A` `init` / `bootstrap` 都写第一行（stored = derived、empty:false、stale:false）；`B` 落 route 的三个节点（开工 / 交活 / 验收）只进**审计 `detail.node`**（实施附注 §4），任务对象上**没有** `node` 字段，`close`（收工只落当日日志）与怪值 ⇒ `E_ARG_SCHEMA`；`C` `stage-enter` 换第一行（新阶段名、stale:false、mode=maintain），**`task-set` 不许改它**，`summarize` 首行仍是「目标 · 当前大阶段」（RT-08 冻结）+ 新增 `headline` 字段；`D` **headline 空是真实形态**（C1 之前的老账本）：`read.headline.empty:true`、`stored:null`、`derived` 算得出，`task-set` 的实现任务 ⇒ 拒 `E_ADMIT_HEADLINE` + **零写入** + 任务段仍空；`E` **补齐**：`headline-set` 把 stored 重算成 derived（不接受自带一行字），补齐之后同一发就收', '批次 W'],
  ['LED-03', 'route-ledger', F.led03, '任务 C1c **单写者 = `slotBusy()` 一个函数**（定形 §3.3 四态闭集）：**17** 格纯函数矩阵（`S01`…`S17`）—— 空槽 exited；活会话 busy；**`ref` 空 = busy 但它自己的第一次 spawn 放行**（换 `requester_task_id` 结论就翻面；别的任务看到 busy、**不是 unknown**）；空串 ref 同形；`session_exit` ⇒ exited/free；`paused + exit` ⇒ free；**`paused + 活会话` = 非法 ⇒ busy 拒**；`fence` 的 paused 不算活；心跳 > 30 分钟 ⇒ crash（回收前照样拒）；**整 30 分钟仍 busy**（边界）；心跳读不到 / 形状坏 ⇒ unknown（按 busy 拒）；done 不是持有者；**两本账一个写者**（路线已退 + bug 任务活着 ⇒ busy）；`kind` 缺省也算工作写；`stale_ms` 真的被读（调到 60 分钟 ⇒ 31 分钟前的心跳不 stale）；只读工作不占槽；`read.slot` 与纯函数同值、拒时点名 holders；`task-set` 不许写 `paused + 活会话`（非法态）', '批次 W'],
  ['LED-04', 'route-ledger', F.led04, '任务 C1d **暂停 / 恢复**（`build-paused` 那条路）：`A` 暂停必须停会话 —— 有活会话且没声明 ⇒ 拒 `E_PAUSE_SESSION_LIVE` + **零写入** + mode 仍 build（不锁死、不静默放行）；声明了 ⇒ 任务写 `session_exit`（**不清 `session_ref`**）+ 标 `paused`，暂停记录 `{state:open, by:"leader", reason, opened_at=注入时钟, entry_ids}`，`transitions` 不许出现，mode = build-paused；`B` **maintain 不许暂停** ⇒ `E_PAUSE_NOT_SUPPORTED` + 零写入；`C` **扩大**（默认：同一个 `pause_id`、entry 并集）vs **另开**（`new_set:true`：旧 set closed + closed_at、新 set open、新 id）；**旧 set 关闭不自动 free 在途修任务**（bug 台账那条仍 in_progress、route 侧一个字节不动，`read.slot` 仍 busy）；`D` **resume** 关掉 open 的 set、mode 回 build、**不顺手改任务**；不在 build-paused 时 resume ⇒ `E_RESUME_NOT_PAUSED`；`E` `pauseSetOf` 只认 open（closed 不算）+ `pauseEntriesVerdict` **live + archived 两段都查**（已归档的条目仍解得出，找不到的 **点名**）；`F` **切阶段要先停会话**：有活会话没声明 ⇒ 拒 `E_STAGE_SESSION_LIVE` + 零写入；声明了 ⇒ 过 + 在途实现任务 `paused` + `session_exit`（`session_ref` 不变）+ mode=maintain', '批次 W'],
  ['LED-05', 'route-ledger', F.led05, '任务 C1 **`admitTask` 十六格 + 两个创建入口**（定形 §2.3；函数归 C1、判据归 B）：`A` 十六格矩阵（四种模式 × 三种工作种类 + headline 空 / 集合外 / `paused` 不是模式 / `entry_id` 缺），每格**一个冻死的码**（`E_ADMIT_UNINITIALIZED` / `E_ADMIT_HEADLINE` / `E_ADMIT_KIND` / `E_ADMIT_SET` / `E_ADMIT_MODE` / `E_ADMIT_ENTRY`）+ 一句为什么；`A10`/`A13` **点名那条 entry**；收的时候不许带拒码；`B` **路线入口 `task-set`**：build 收实现（A03）与票的修（A05，**票号挂在任务上**、票投影 in_progress）、拒 bug 修（A06，不跨账）、build-paused 拒实现（A14）、maintain 拒实现与票的修（A07/A08）、`kind` 缺省 = implement（老调用方不破）、ticket-repair 缺票号 ⇒ `E_ARG_SCHEMA`；`C` **bug 入口 `bug-task-set`**：build 拒（A06）+ 零写入；maintain 收批内（A09）+ 落 bug 台账 tasks[]；批外 ⇒ `E_ADMIT_SET` + **点名** + 零写入；混装 entry_ids ⇒ 整条拒 + 点名集合外那条；空 batch（A11）；build-paused 收 pause set 内（A12）、**batch 内但 pause set 外也拒**（A13）+ 点名 + 零写入；未建账 ⇒ `E_ADMIT_UNINITIALIZED`（不许折成 `E_INTERNAL`）+ 零写入；`D` **判据一份（源码级）**：两个入口的函数体都调同一个导入的 `R.admitTask(`、`lib/route.mjs` 里 `admitTask` 只有一个定义（"同一个输入打两个入口"**造不出来** —— 两入口收的 `kind` 不相交）；`E`/`F`（票投影与 live-task void 不变量）之后另有**三段红先格**：`G` **迁移票的写路径**（`void` / `update` / `close` 的 from-state 读**投影**：迁移票不存 `status` 也动得动；**存着的 `status` 不许赢过 `legacy_status`** —— `ticket-update {status:"in_progress"}` 成功但投影仍 `open`、紧接着 `close` 照拒；迁移票要关走**任务**把投影变 `in_progress`；`legacy_status:"done"` 是终态）、`H` **`finding_refs` 载体**（`ticket-open` 收它、给了就 ≥1 条且 ids 唯一、读面查得到、legacy 票店与 observation 两条迁移路都逐字搬）、`I` **跨工作区负样本**（A 拿 B 的 `--status-root`/`--route-dir` 读或写 ⇒ `E_ROOT_OUTSIDE` + 两边零写入；显式写成自己的派生值 ⇒ 放行；同一个 stage id 在两区各一份不是缺陷）', '批次 W'],

  // ── 任务 A 的运行时绕行 · `toolName` 插件桥（2026-11-02 第 2 关）：记录 / 消费 / 九名 / 队列 / 过期 / 边界 ──
  ['BRG-01', 'toolname-bridge', F.brg01, '**记录面**：父会话的 `tools.guard` 把这次委派的工具名记下来（契约 `.team/test/CONTRACT-A-bridge.md` R1–R5）—— 两实例（组长那份 `apply()` 记 → 组员那份 `apply()` 取，生产拓扑：`cordis.patch.yml:81` / `:613` 各一行 `persona-injector` ⇒ 两套闭包 ⇒ store 必须模块级）；`team_test` 与 `job_technical_review` 两条正例都要让人设 + 说明书落到子会话；**串父会话**（p-other 记的 claim 被 p-stranger 的子会话吃）不许；**非角色名**（`workflow` / `subagent_fork`）一条都不许记；**被拒的委派**（`run_in_background:false`）不许记且判词照旧（不许改成"记了再说"）；放行那一侧判词必须是 `undefined`（记录是纯观察）；外加 `identityVerdict({preset:"member",toolName:"team_test"})` 仍是 row 4 / role=test / 不窄（角色表是唯一作者，桥不许自己算）', '批次 X'],
  ['BRG-02', 'toolname-bridge', F.brg01, '**消费面一发到底**：子会话头 = `["cwd","agentPreset","origin","parentSession"]`（**没有** `toolName`）+ 父会话刚放行 `team_test` ⇒ 装配必须给出：`agenia:role-persona` 以「你是这个项目的测试与流水线负责人」开头 · `agenia:charter:test` 在 · **工具目录里有 `bash`/`pwsh`**（row 5 的闭三元组必须被换掉 —— 这正是这一票要修的那件事：子会话写不了 `tests/`、跑不了命令）；**A0a 一次性读数行**必须带 `toolName_source=parent-call` / `row=4` / `role="test"` / `toolName="team_test"` / `role_from_toolName=true`，**并且仍然印 `header_keys`**（且里面不许冒出 `toolName`）；两条自洽：说了「带 toolName」就必须真的在头里 · `parent-call` 是判定行，不许再叫人去等"带 toolName 的那一行"', '批次 X'],
  ['BRG-03', 'toolname-bridge', F.brg01, '**角色表九个名字逐条映射**（`team_design` / `team_dev` / `team_test` / `team_review` / `subagent` / `job_memory_judge` / `job_memory_review` / `job_conversation_review` / `job_technical_review`）：每一发都必须只落 `agenia:charter:<自己的角色>`（多一份 = 角色算错 / 串味），三份取样人设**逐字开头**（test / dev / review），工具面按角色：**只有 `review` 没有 shell**（`NO_SHELL_TOOLS`），其余八个都有（row 5 的闭三元组与 review 的"少 shell"是两件事）；**未知名**（`team_retro`）不许被记 ⇒ 子会话照旧 row 5（没角色、目录仍是闭三元组）；**header 优先**：头里带 `toolName:"team_review"` ⇒ 走 review **且不消费** claim（紧随其后那个无 toolName 的子会话必须还拿得到 `team_test`）', '批次 X'],
  ['BRG-04', 'toolname-bridge', F.brg01, '**队列语义**：一个父会话连派 `team_test` + `job_technical_review` ⇒ 两个子会话按**派工次序**各自拿到自己的角色（FIFO；次序错 = 名字配错人，契约 F1）；队列空了之后第三个子会话必须回到 row 5（无角色 + 闭三元组）—— **一条 claim 只消费一次**；**同一个子会话第二次装配**（下一轮对话）仍然是 test（名字必须钉在子会话上，R9/F7：角色、人设、工具目录不许中途消失）；**同一个工具连派两次** ⇒ 两条 claim，两个子会话各拿一份（队列是"一次一条"，不是"一个父会话一条"）', '批次 X'],
  ['BRG-05', 'toolname-bridge', F.brg01, '**过期清理**（可注入时钟 = `node:test` 的 `mock.timers`，只遮 `Date`；量具先自证时钟真的被遮住，遮不住记 `BRG-CLOCK-NOT-DATE` 而不是记功能红）：`+30 s` 的 claim **必须**还能用（正常派工到装配的延迟，TTL 不许短过这个）· `+10 min` 的 claim **必须**不再用（父会话派了活、子会话没起来，留着就是给下一个子会话下毒）· 过期件之后**新的** claim 照常生效（清理不许把新的一起清，也不许让过期件把队列堵死）', '批次 X'],
  ['BRG-06', 'toolname-bridge', F.brg01, '**边界（四格，全是"别切宽"那一侧）**：① **会话头一个字节都不动** —— 装配前后键集相同、JSON 逐字相同、**不许**冒出 `toolName`（老板明令；写了它 A0a 就永远判不出来）；② **`【组员:dev】` 标记不参与身份** —— claim 说 review、装配入参里塞着 dev 的标记 ⇒ 必须 review（人设 + 说明书两面都判；标记若赢 = 身份第二作者回来了）；③ **`origin` 门** —— `origin:"manual"` 的会话不许吃 claim，而且**claim 要留给**紧随其后的真子会话（不是"吃了也没关系"）；④ **组长预设的子会话不许抢** —— `agentPreset:"agenia"` + `origin:subagent` + 有 claim ⇒ 仍在**组长侧**（有 `agenia:leader`、没有组员说明书），**且不消费** claim（契约 R7/F8：`subagent_fork` 那一类不许把名额定走）', '批次 X'],
  ['BRG-07', 'toolname-bridge', F.brg01, '**并行派工（子会话启动次序与父会话调用次序相反）**：一个父会话连派 `team_test`(prompt A) + `job_technical_review`(prompt B)，两个子会话**反序**装配（各自带自己的第一条用户消息）⇒ 每一发仍然拿到**自己**那个角色（charter / 人设 / shell 三面都判），不是对方的 —— 两向都量（先派 test 后起 review / 先派 review 后起 test；只量一向的话"固定偏移"那种半修看不出来）；红因分开：`BRG-PARALLEL-SWAP-TEST` / `-REVIEW`（哪一发串了位）+ `BRG-PARALLEL-PERSONA` / `-CATALOG`（角色到了但没有对应的注入面）；两处**量具自证**：① 两条 prompt 不许互为子串（`BRG-HARNESS-PROMPT-AMBIGUOUS`：互为子串时"对号"与"撞号"分不开）② 子会话的第一条用户消息必须真的交到注入器手里（`BRG-HARNESS-MESSAGES`，否则整格以功能红的样子假红）；外加**老路径仍在**：子会话取不到第一条用户消息时退回队列队首（`BRG-FALLBACK-LOST`）—— 这一格是"取不到第一条用户消息"那一支的判据（`prompt` 读空才退回队首；有 prompt 而**不完整相等** ⇒ 不取，落 row 5）；它是 2026-11-02 live 探针（`team_test` 取到了 `job_technical_review` 的 claim）那把修的回归锁', '批次 X'],
  // ── 任务 C2 · 卡（记忆更新报告，2026-11-02 第 2 关）：路线格 / 票区 / bug 开放数与 50-30 / 严重度 / 状态条 / 容量与回执 ──
  ['CARD-01', 'memory-update-card', F.card01, '任务 C2 **路线格**（契约 `.team/test/CONTRACT-C2.md` §3.1）：`A` 没有路线账本 ⇒ 第一行**逐字** `未建账`（不带目标 / 阶段 / 间隔号）+ `mode=uninitialized` + 徽标 `null` + `red_bar:false`（红由状态条「未建账」那一格说）+ `card.reasons` 有 `ROUTE_MISSING`；`B` 有账 ⇒ 第一行**逐字**等于账上 `headline`（唯一载体，C1 §6.1）+ `mode=build` + 没有徽标 / 红条；`C` `headline` **缺键** ⇒ `（目标未填）`（全角括号、四个字）+ `red_bar:true` + `HEADLINE_EMPTY`；`D` `headline` = `""` / 全空白 ⇒ 与 C 同形；`E` `pauses[]` 有一条 `state:open` ⇒ `mode=build-paused` + 徽标非空且含「暂停」+ **第一行与 B 逐字相同**（暂停写进第一行就翻面）；`F` 两版账本只差 `tasks[]` ⇒ 第一行**逐字不变**（定形 §6.2：「第一行只随 `stage-enter` 或 headline 补齐而变」）；`G` 账本在盘上但读不出来 ⇒ **卡照样出**、第一行 `（目标未填）`、`red_bar:true`、`ROUTE_UNREADABLE`（"读不出来"不是"没有"）；`H` 正文「目标 · 大阶段」行与 `route.first_line` **同值**（§2.2；负样本 = 只改正文一格 ⇒ 必红）；每一格的 `card.reasons` 都过 §5 闭集（`gate4-C2` F-05 / F-08）', '批次 Y'],
  ['CARD-02', 'memory-update-card', F.card02, '任务 C2 **票区**（契约 §3.2）：`open` / `in_progress` / `done` / `void` 四个数 + `total` 来自**路线票段投影**（C1 §7.5 唯一一份口径），**不是** `.team/leader/follow-ups.md` —— 夹具里那张文件**故意写 9 张**、票段 8 张（7 迁移 + 1 新票）⇒ 卡上必须是 8 的组合，出现 9 ⇒ `C2-TICKETS-FROM-FOLLOWUPS`；**第五个数 `tickets.legacy`**（组长 2026-11-02 裁定第 4 条）= `legacy_status` 非空的张数（今天 7）——**子集计数**，不进四数、不加进 `total`，`legacy <= total`；`A` 7 张迁移票按 `legacy_status` 投成 5 open / 1 in_progress / 1 done；`C` 在途任务把票顶成 `in_progress`（存着的 `status` 不是权威）、任务 `done` ⇒ 票 `done`；`D` 票段空 ⇒ 五个数都是**数** `0`（不是 `—` / `无` / 空串）；`D2` `void` 来自组长关票（控制写）；`E` **负样本（必须红）**：一张 `void` 的票 + 一条挂在它上面的在途任务 ⇒ `card.red:true` + `card.reasons` 有 `VOID_WITH_LIVE_TASK` 并**点名那张票**；`F` 正文票区那一行的六个数（四数 + 迁移票 + 合计）逐个与其机器格**同值**（§2.2；负样本 = 正文改一个数 ⇒ 必红）+ 闭集', '批次 Y'],
  ['CARD-03', 'memory-update-card', F.card03, '任务 C2 **bug 开放数 + 50/30**（契约 §3.3/§3.4）：`A` 口径 = `kind=bug` 且**无 disposition**（3 open bug + 1 已处置 + 2 observation ⇒ **3**；observation 不计、已处置不计）；`B` **票不漏进来**（票段 0 → 8 张，`bug.open` 一格不动）；`C` **同一个查询**：`bug.open.source` **逐字等于** `cap.bug_open.source` 且 `bug.open === cap.bug_open`，外加第三个读者 —— `--op bug-read` 的 `counts.bug_open` / `cap.bug_open` / `cap.red` 必须同值（op 不可用 / 拒了夹具 ⇒ **HOLD**，不记绿）；`D` 50 边界 49 不红 / **50 红**（`cap.reasons` 必须含 `count`）；`E` 30 边界（**日历天**、注入时钟）30 天不红 / **31 天红**（`reasons` 含 `age`）；`F` **封顶不动手**：卡前后 `ledger.json` 的 sha256 一字不变；跨读者用**同一注入时钟**并比 `oldest_age_days` / `reasons` / 阈值 / 天数（`gate4-C2` F-04）+ 闭集', '批次 Y'],
  ['CARD-04', 'memory-update-card', F.card04, '任务 C2 **严重度那一排**（契约 §3.5）：`A` `severity.lines` **恰好四条**、顺序 = 三条线 + `unclassified`（出口是闭集，不是第五桶）；`B` `severity.samples` 恰好四个（正 / 负 / 第三线正 / 第三线负）；`C` **只校准自己的线**：`calibrated.function_broken_repro === false`（未采样）、`data_broken` / `reading_lies` 为 `true`、`unclassified` **不出现在** `calibrated` 里；`D` **判不了两向**：① `severity_confidence:cannot` + 已升级 ⇒ `severity.card_red:true` + `escalations` 点名；② 同形但 `escalated_at:null` ⇒ 卡**更要**红（`SEVERITY_CANNOT_UNESCALATED` + 点名）—— "判不了不许静默"；`E` `assessment:\'unknown\'` 是**另一个词**（保留 open、不升级、不让卡因此红）；`F` **无 bug 台账** ⇒ `severity.samples=[]`、`calibrated` 三条 false、卡**不因此红**，且**不许编样本**（组长 2026-11-02 裁定 · `gate4-C2` F-10）+ 闭集', '批次 Y'],
  ['CARD-05', 'memory-update-card', F.card05, '任务 C2 **状态条十二格**（契约 §4 + 裁定第 1/2 条）：`A` 形状 —— `statusbar` 恰好 12 个对象、`key` 与 §4.2 **逐字同序**（50/30 · 未建账 · 记忆链红 · SLA 红 · carrier 缺 · observation 数 · 未知预设报警 · 预设降级 · legacy 会话数 · 单写者未执行 · stale 槽 · 红条）、每个对象**至少**六个键（`key/label/state/reading/producer/wired`）、`state` 在四值闭集、`statusbar.count===12`；`B` 🔴 **十二格全部接线**：主夹具（五种 producer 全给：路线 / bug 台账 / 数据根 / identity.<day>.json / 两份评审报告 / legacy 票店）里任何一格 `wired:false` ⇒ `C2-STATUSBAR-ANY-UNWIRED`；`C` 🔴 **未接线 = 红**（**负样本**，合成输入**六**份证明它翻得动面）：`wired:false` ⇒ `state:red` + `reading` 说"没接线" + `card.reasons` 有 `CARD_UNWIRED:<key>`（不许绿 / unknown / 黄），且"守规矩的未接线"只该剩 `ANY-UNWIRED` 一条（两条判据各有力）；`D` 🔴 **unknown / 黄只许探针降级的槽格**（`slot_not_enforced` / `stale_slot`，且必须 `wired:true` + `degraded_by ∈ {A0b,A0d}`）；`E` **五格真读数两向**：`sla`（当天开的不红 / 上一个开工周期仍未 `assessed` ⇒ 红 + `SLA_OVER_CYCLE`）、`carrier_missing`（两份评审报告都在 ⇒ 绿 / 缺一份 ⇒ 红）、`unknown_preset` + `preset_downgrade`（identity 文件两格都空 ⇒ 绿 / 有报警 ⇒ 红）、`legacy_sessions`（legacy 票店已迁空 ⇒ 绿 / 还剩 2 张 ⇒ 红）；`F` **红条格 = `card.red` 总闸**（定形：「卡红统一落状态条的「红条」格」）；`G` **SLA 判不了也算超期**（`assessment.verdict:\'unknown\'`）+ `bug-read.sla` 用**同一注入时钟**跨读者（不可用 ⇒ HOLD）· **槽谓词 JS/Python 同值**（`implement`+`bug-repair` 两个活持有者 ⇒ `SLOT_NOT_ENFORCED`；`crash` 心跳 ⇒ `STALE_SLOT`；心跳缺 ⇒ 两格黄 + `degraded_by`）· **`label`/`producer` 逐字**（互换 ⇒ 必红）· **producer A/B 自己的写面** · 闭集（`gate4-C2` F-01/F-02/F-03/F-06/F-07/F-09）', '批次 Y'],
  ['CARD-06', 'memory-update-card', F.card06, '任务 C2 **容量行 + 两段回执 + 卡本身**（契约 §3.6/§3.7/§3.8/§2.4 + 裁定第 5 条）：`A` 容量五读数 —— `count/chars` = 快照 `totals`（73 / 4321）、`cap_count/cap_chars` = 夹具 `presets/agenia/lib/memory.mjs` 的**怪值**（137 / 12_345 ⇒ 写死 200/80000 当场翻红）、`source` 必须点名快照且**不许**含 `.team/route`（定形：「容量读记忆库快照，路线账本不存」）；`B` 卡本身 —— `card.name` 逐字 `记忆更新报告` · `card.generator` 含 `daily-cards.py` · `card.day` = `--day` · `card.as_of` 带偏移的 ISO8601；`C` **快照读不到 ⇒ 红不出 0**（`capacity.state:red` + `count:null` + `CAPACITY_UNREADABLE`）；`D` 回执四态**逐段逐卡** —— 第一段（技术评审）在卡 1 的 `C2 · 验收格`、第二段（会话评审）在**卡 2** 的 `C2 · 回执格`：`present`（本周期 done）/ `missing`（本周期没有）/ `expired`（只有上一周期，**超一个开工周期**）/ `na`（无路线无任务 ⇒ **不判红**），缺 / 过期 ⇒ **那张卡**的 `receipt.red:true` + 逐段点名，两卡 `required` 同值、两段的红不许串卡；`E` **生成失败四件套** —— 退出码非 0 · **两张卡都没有**（绝不绿兜底）· append-only 失败标记（`at` = **注入时钟**、`day`、`code`；第二次失败 ⇒ 2 行）· stderr 一行 `🔴` 带 `E_*` 码；`G` 第二段 `receipt.conversation.report_path` 逐字 `.team/retro/<day>/会话评审.md`（`gate4-C2` F-09）；`H` 正文容量行与 `capacity.count/chars` **同值**（负样本 = 首数印 0 ⇒ 必红）；两张卡的 `card.reasons` 都过 §5 闭集', '批次 Y'],

  // ── 批次 Z · 技术评审 2026-11-02 的 F2–F7 六张票（`ticket-20261102-03`…`-08`；一格一张票）──────────
  ['CPY-01', 'review-20261102', F.cpy01, '`F2` **只读副本原地跑不动套件**（`ticket-20261102-03`）：用 `.tools/tree-at-commit.mjs --with-staging` 在 `HEAD` 导出副本，再判两件事 —— ① **副本就是那个提交 + 恰好那一层声明的追加**（**份数不写在这一行**，见本行末尾「份数口径」）：`verifyCopyIsCommit({ declared: [STAGING_ADDITION] })` 对提交里的**全部 blob**做**子集核对**（少一份 / `git blob` 不同 ⇒ 红），多出来的只准是活树 `.tools/_staging/agenia-upgrade/{preset,oracle}` 那一层且每条 sha256 与活树相同（多一条别的一律红；任何链接 / junction 一律红；不给 `declared` 时行为与从前逐字相同 ⇒ `REV-04`/`REV-05` 不受影响）—— 🔴 **份数口径（第三轮 `R3-2` + 第四轮 `F2`）**：份数不进文档；唯一来源是读数 `readings.cpy01.file_count_ledger.sources` 那几条 —— 副本逐份枚举（`copy` / `copy_staging`）· `git ls-tree -r --full-tree <commit>`（`commit`）· `declaredAdditionPaths()` 现走（`declared_live`）· 导出器自己记下的 `exp.json`（`export_record_commit` / `export_record_staging`）· **派工那一刻**记下的 `AGENIA_STAGING_MANIFEST`（`pinned_declared`，可选项，不给就记 `null`：没判 ≠ 对上了）。`CPY-FILE-COUNT-DRIFT` **两两对账**（只判 `副本 = 提交 + 追加` 是恒等式、响不了；而且它跑在"副本不是那个提交就早退"**之前** —— 否则最该响的那类事永远到不了它）。② 套件跑起来必须有的四条输入在**副本里**且与活树**逐字节相同** —— `.tools/_staging/agenia-upgrade/preset/inject.js` · `preset/agent.cordis.yml` · `preset/lib/route.mjs` · `oracle/standard.patch.yml`（`run-all.mjs:194/201/206` 与 `support/env.mjs:27-35` 的绑定）。四个红因码分开：`CPY-EXPORT-STAGING`（工具那一半）/ `CPY-STAGING-NOT-IN-COPY` / `CPY-STAGING-DIFFERS-LIVE` / `CPY-STAGING-ESCAPES-COPY`。⚠️ 这一格**不跑全量**（跑一遍要几分钟，且会把"副本缺输入"与"套件自己按活树推路径"混成一条红 —— 后者归 `F-169`），只判**副本自足**；`.tools/_staging` 在提交里的份数同时记成读数（`readings.cpy01.commit_tree.staging_paths`；它是 0 ⇒ 追加只可能来自 `--with-staging`）；**副本的自证**（第 4 关打回项 2/3）：判据只用 `PATHS.repo`（来源自报）、副本必须在运行根之下（`CPY-COPY-OUTSIDE-RUNROOT`）、副本里不许有 `.git`（`CPY-COPY-HAS-GIT`）、拿**副本自己那份** `support/root-guard.mjs` 问出的根必须是副本自己（`CPY-COPY-NOT-SELFROOT`）、四条必需输入都从副本内读；副本在这一轮里不许被动过 —— 测试侧 fingerprint 开跑/收口各一次 + 文件份数前后相同（`CPY-COPY-CHANGED`）+ 导出器 `--verify` 的 `equal:true` / `is_that_commit.ok:true`（`CPY-VERIFY-NOT-EQUAL` / `CPY-VERIFY-NOT-THAT-COMMIT`，缺字段 `CPY-VERIFY-SURFACE`）。读数里记 `git_from_copy_is_live_repo`：从副本里调 git 会走到活树 `.git`（所以这一格**不在副本里调 git**，全部 `cwd: PATHS.repo`）', '批次 Z'],
  ['CSRC-01', 'review-20261102', F.csrc01, '`F3` **容量参考线的来源格 `capacity.cap_source`**（`ticket-20261102-04`）：三级回退（工作区 / 生成器那棵树 / cwd）**各跑一次**，每个现场只有那一级有 `presets/agenia/lib/memory.mjs`（另两级一个字节都不写，`sides` 自证），三级的三份数故意不同（311/31313 · 322/32323 · 333/33333）。判：① 参考线两个数 = **赢下来那一级**那份文件里的两个数；② `capacity.count/chars` 仍是快照 `totals`（参考线 ≠ 占用）；③ `capacity.cap_source` 这一格**在**、是非空字符串、点名赢下来那份、不把没赢的几级也点进来、不与 `capacity.source`（快照）同值；④ 三个值**互不相同**（"同一个常量 / 只印第一级"当场翻红）。今天红在 ③ 的第一条：那一格不存在', '批次 Z'],
  ['CSRC-02', 'review-20261102', F.csrc02, '`F4` **第三级（cwd）单独的正样本**（`ticket-20261102-05`）：现场 = 工作区没有 `presets/agenia/lib/memory.mjs`、**生成器副本**那棵树也没有（`<copyRoot>/presets/` 整个不存在）、只有 `<copyRoot>/cwd/presets/agenia/lib/memory.mjs`（333 / 33333）在；`lib/route.mjs` 摆进工作区（否则失败停在 `E_ROUTE_SOURCE`，量不到容量那一级）。判：卡照出（exit 0 + `C2 · 验收格` + 39 key）、`capacity.cap_count/cap_chars` = cwd 那份的两个数、`capacity.count/chars` = 快照 `totals`、`capacity.state:green`、`capacity.cap_source` 点名 **cwd** 那一份且不点不在盘上的候选。🔴 红的是最后一条（那一格不存在）；前几条**今天就是绿的**，读数里照实分开记 —— 但缺了来源那一句，"cwd 给的"与"生成器那棵树给的"在卡上同形，`F4` 要的那条**单独**的绿腿不可判', '批次 Z'],
  ['BMAP-01', 'review-20261102', F.bmap01, '`F5` **委派桥的两张表要有上限 + `scope.id` 坏了也要钉住**（`ticket-20261102-06`）：`A` 动态（真跑 `inject.js` 的 `apply()`）—— 父会话放行 `team_test`，子会话第一次装配拿到 test；再把**同一子会话**装配第二次（队列已空）必须是 test。两个输入：`context.scope.id = 12345`（非字符串）与 **`id` 键缺失**（`MISSING_ID`），两次 `context.agent.id` 都是正常字符串。今天第二次装配掉回 row 5（`BRIDGE_PINNED.set` 只在 `typeof agentId === "string"` 时执行，而 `agentId = context.scope.id`）。量具自证：`contextSeen()` 证明注入器真的看到了坏形状；`BMAP-HARNESS-SCOPE` 与功能红分开报。`B` 静态 —— 读 `inject.js`：两张表的**写入点旁**必须有一个 `BRIDGE_*CAP*` 常量 + 一条淘汰动作（`delete(`/`splice(`/`clear(`/循环），`BRIDGE_CLAIMS` 那一张今天有界（回归锁：不许把它一起删）；同一只读取器喂一段合成源码必须判"有界"（阳性对照，否则它只会红、翻不了面）。为什么上限只能落在源码上：两张表都是模块内私有变量、不导出，驱动一个编出来的 N 去撑爆它等于拿编的数当判据', '批次 Z'],
  ['BDOC-01', 'review-20261102', F.bdoc01, '`F6` **`brg01` 的注释与断言文本必须描述跑着的那套匹配**（`ticket-20261102-07`，**静态文档腿**）：读 `tests/agenia-upgrade/integration/brg01-toolname-bridge.test.mjs` 全文 —— ① **必须不出现**："互相包含" / "互含" / "对不上再退回" / "对不上才退回"（每一条都带行号与"它错在哪"；只钉"包含匹配"与"对不上退回队首"这两个轴 —— `加壳` 那半句是**理由**不是判据，单独禁它会把可能仍成立的话一起判红）；② **必须出现**完整相等那一句（`完整相等` / `完全相等` / `严格相等` / `精确相等` 任一）；③ **必须出现**"对不上就不取"那一条（`/对不上[^\\n]{0,30}不取/`）。期望值钉在**实现**上（`inject.js` 的 `item.prompt === prompt` + `prompt === "" ? fresh.shift() : undefined`）：实现一变，`BDOC-IMPL-ANCHOR` 先把这条腿按红喊停 —— 那时要改的是契约，不是让文档继续追着实现漂。另记读数：同一句话在 `support/registry.mjs` 的 `BRG-07` 那一行也出现过（只扫那一行，不扫全文 —— 本批自己的注释里也写着这几个词）', '批次 Z'],
  ['FLIP-01', 'review-20261102', F.flip01, '`F7` **`BRG-07` 的翻面读数点名本提交的 `inject.js`**（`ticket-20261102-08`）：从 `brg01` 文件头那一段（`BRG-07 的翻面读数` → 头部注释结束）里取所有提到 `inject.js` 的行，判 ① **至少一行**同时给**本提交那份 `inject.js`（`HEAD:presets/agenia/inject.js` 的 blob，字节数 + sha256 都从 `cat-file` 的字节算）**的字节数与 sha256 前缀（≥8 hex）；② 标着「现役」的那几行必须都是本提交那一份（新旧两个读数并排 = 读的人分不清）；③ 同一行里 sha 与字节数不许只说对一半（"改了 sha 忘了改字节"那种半修）。读数里另记一份**盘上**那份与 `disk_equals_commit`（工作树脏不脏是读数，判据仍按提交）。⚠️ 这是一条**会过期**的判据：`inject.js` 一变它就该红 —— 那正是它的用处（读数点名的是哪一版不能靠人记）', '批次 Z'],

  // ── 批次 AA · 每日评审闸（老板 2026-11-03 09:10 定的硬门；`bug-20261103-01`）──────────────
  // 一句话：**判决报告没落盘，两份每日评审不许派**。判据钉在产物上
  // （`<内容根>/.runtime/reports/memory-update/<day>.json`），不钉 `phase` 字段。
  // 判据口径、四格、量具自证逐条写在 `integration/rgate01-daily-review-gate.test.mjs` 的文件头。
  ['RGATE-01', 'guard', F.rgate01, '每日评审闸（**生产** `presets/agenia/inject.js::dailyReviewGateVerdict`，`bug-20261103-01`）：`job_conversation_review` / `job_technical_review` 必须等**今天**的记忆判决报告落盘 —— `A` 没有 `2026-11-02` 的报告 ⇒ 两个工具**都**被 `tools.guard` 拒、码**恰好** `E_REVIEW_BEFORE_JUDGE`（且**不是**门禁里另外那几个码 `E_GUARD_*`）、报文点名 `2026-11-02` 且不点名 `2026-11-03`；`B` 种一份 `2026-11-02` 报告 ⇒ **同一个调用**（`name`/`arguments`/`agent` 逐字相同）放行、放行值必须是 `undefined`（红的合法性来源：唯一变量是那份文件在不在）；`C` 阴性对照 `team_test` 在**同一副"没有报告"的根**上照样放行；`D` **一天从本地 04:00 切**：两个钉住的时刻（本地 `2026-11-03 01:30:00` / `04:00:01`）× 三副报告现场（无 / 只有 11-02 / 只有 11-03）—— 01:30 点名 `11-02`、04:00:01 点名 `11-03`，且 11-03 的报告在切点下方**不顶用**、11-02 的报告在切点上方**不顶用**（两向一夹，整数小时的切点只能是 4）；`C2` 同一个工具显式 `run_in_background:false` ⇒ 后台硬门先拒、用**另一句话**（运行时报文不带码，码 `E_GUARD_JOB_FOREGROUND` 只活在纯函数 verdict 里，`GRD-01` 钉）—— 证明"精确码"不是碰巧、两个闸的报文分得开；`P` 夹具自证（guard 挂没挂上 `RGATE-HARNESS-GUARD` / 时钟遮没遮住 `RGATE-CLOCK-NOT-DATE` + 用完还原 / 三副根的报告现场恰好 无·11-02·11-03 / 那个时刻真的落在切点下方）。时钟由 `node:test` 的 `mock.timers`（`apis:[Date]`）钉住，`Date.now()` 与 `new Date()` 两个入口都验 —— 不钉就会随墙钟漂。⚠️ 打的是**现役**树（`presets/agenia`）：staged 靶子与现役是不是同一份，由那一跑的 `F57-TARGET` 照实报 —— 本行不预设', '批次 AA'],

  // ── 批次 AB · 提案不许当 bug 报告（老板 2026-11-03 21:2x 插票 · 21:24 更正「只加判决岗」）──────────
  // 一句话：**库的入库口只收知识，不收 bug 报告。** 判据口径、面与刀逐条写在
  // `static/mjudge01-judge-charter.test.mjs` 的文件头；打的是**现役** `presets/agenia`（定形 §4 逐字点名的两个落点）。
  ['MJUDGE-01', 'static-doc', F.mjudge01, '**提案不许当 bug 报告**（老板 2026-11-03 21:2x 插票；定形 `.team/leader/2026-11-03/定形-提案不许当bug报告.md`）：两份**判决岗**说明书（`team/memory-judge.md` + `job-briefs/memory-judge.md`）里必须有**一节**（标题点名「入库 / 进库」），节内四个面**各要一个段落**同时成立 —— `A` `MJUDGE-RULE-SUBJECT` 老板原话那半句（一个或一组修复动作）与"拒"的结论在**同一段**里（拒的词：拒绝 / 不进库 / 不通过 / 不收 / 驳回；换成"接受"⇒ 必红）；`B` `MJUDGE-DISCRIMINATOR` 定形 §3 的**替换法**（`替换法` + `改(变)?那一处` + 结论 `缺陷报告`）；`C1` `MJUDGE-BOUNDARY-READING` 一处具体读数**不构成入库理由**；`C2` `MJUDGE-BOUNDARY-CARVE-OUT` **反例必须成立**（不许退化成"提到具体文件 / 具体数字就拒"）—— 整节没写 ⇒ **只**报 `MJUDGE-SECTION-MISSING`（不拿四条噪音盖住第一条）；`D` `MJUDGE-REVIEW-CARRIES-RULE` **复核岗一个字都不许带**：这条规矩的标记句（`替换法` / `一个或一组修复动作`）不许出现在 `team/memory-review.md` 与 `job-briefs/memory-review.md` 里（将来整节复制粘贴过去 ⇒ 当场红；钉标记句而非哈希，是为了不把与这条规矩无关的合法改动判红）。另一条腿是**判据自己的可翻面性**（任何一次跑都要成立：文字没写时红、写了之后绿）：用例体内一具**合成阳性对照**（照契约写的最小实现 ⇒ 0 问题）+ **刀架**（刀名与刀数**只在用例文件头那一处**给，这里不复述），每把刀**只许翻它那一面**；同一批变异还会打在**现役文本的拷贝**上跑一遍外部对照（夹具由生成器从现役文本派生，落当天抽屉）（`MJUDGE-KNIFE-NOT-FLIPPED` / `-OVERREACH` / `-WRONG-VECTOR` / `MJUDGE-CONTROL-FAIL` 是**尺子坏了**，不是现役文本缺那几件事）。`AGENIA_MJUDGE_CHARTER_ROOT` 只给对照/刀用，一被设置就记 **HOLD**（那一跑不是对现役的判据）', '批次 AB'],

  // ── 批次 AC · 客户端看板（定形 `.team/leader/2026-11-04/定形-客户端看板.md`；第 2 关 2026-11-04）──
  // 九格三组：数据层（字段映射 / 负控 / 不读 now.md）· 视图模型（第一行 / 五关 / 缺空坏）·
  // 渲染层（一行 / 无组员数 / 三列与 0）。契约 `.team/test/2026-11-04/技术契约-客户端看板.md`；
  // 判据口径逐条写在三份用例文件头。**今天九格全红**：`presets/agenia/lib/dashboard.mjs` 与
  // `presets/agenia/client-ui-dashboard/lib/client.js` 都还不存在（第三关才写）。
  ['DASH-01', 'client-dashboard', F.dash01, '字段映射表逐条指到真源（定形 §六.1）：`DASHBOARD_FIELDS` 恰好 13 行（10 条有真源 + 3 条静态文案），逐条在**活树上那四份真文件**里解析 —— 读的是 `.team/route/current.json`（`/headline` `/current_task_id` `/tasks[]/title` `/tasks[]/five_gate_state` `/tasks[]/note` `/tickets`）、`.team/bug/ledger.json`（`/entries`）、`.team/state/local/<day>.json`（`/technical/state` `/conversation/state`）、`presets/agenia/.runtime/state/update/<day>.json`（`/phase`）；测试侧解析器与生产代码**各一份**（一边错一边绿不算绿），自带阳性（活树 `/headline` 必须解析得出）+ 阴性（一个不存在的键必须判 missing）两条尺子自证；外加 `readDashboardSources` 的四条读数（`route/bug/local/update` 各一条，带文件名与 ok）—— 定形 §六.2「哪个字段读了哪个文件」的机器那一半', '批次 AC'],
  ['DASH-02', 'client-dashboard', F.dash01, '映射表的**两条负控**：① 往 `DASHBOARD_FIELDS` 里塞一条指向 `/definitely_not_a_key_dash` 的字段 ⇒ 生产侧 `auditFields` 必须红、且**点名那个字段与那个键**（否则定形 §六.1「指不到 ⇒ 红」只写在文档里）；文件不在时也必须有它自己的码（缺 ≠ 空）。② 四种读源状态必须分得开 —— 在（`ok`）/ 不在（`missing`）/ 半截 JSON（`unreadable`）/ 不是对象（`schema`），塌成一种就没法告诉读的人"是没有还是坏了"。③ 票那一格读**投影**：夹具里一张 `status:"done"` 但没有任务、没有 `legacy_status` 的票，投影仍是 `open` ⇒ 三张票里 open 恰好 2（读落盘 `status` 会得到 1）', '批次 AC'],
  ['DASH-03', 'client-dashboard', F.dash02, '第一行 = `current.json#headline` **原样**（定形 R3；对照表 E09/§8 的反向断言）：五个现场 —— 自洽（stored = `目标 · 大阶段`）/ headline 与派生值不一致 / **阶段改名而 headline 不动** / **目标改名而 headline 不动** / headline 空。两种"改法"都必须**动不了**第一行（动了 ⇒ `DASH-HEADER-REDERIVED`：那是现拼，不是读 headline）；自洽那一格又必须正好等于 `goal.title + " · " + stages[].name`（它不是另一个值）；`stale` = stored ≠ derived（读数）；headline 空 ⇒ 第一行 `（目标未填）` + `DASH-HEADLINE-EMPTY` 报警；route 读不出来 ⇒ 第一行 `未知` + `DASH-SOURCE-UNREADABLE:route`（**不是空白**，也不是"没有目标"）', '批次 AC'],
  ['DASH-04', 'client-dashboard', F.dash02, '五关那一格读 `tasks[id].five_gate_state`（定形 R3/R4；对照表 E27）：五个现场 —— 正常值 `契约与测试` / **大阶段名恰好就是五关词 `独立评审`**（唯一可翻面的造法：印阶段名会得到 `独立评审`，读 five_gate_state 才得到 `契约与测试`）/ `null` ⇒ `不适用` / 并集同义词 `方案` ⇒ **原样收**（`FIVE_GATES` 的 9 值就是并集，不许"归一"成别的）/ 闭集外 `思考中` ⇒ `不适用` + `DASH-GATE-INVALID`。每一格的 `main.gate` 都必须落在 `FIVE_GATES ∪ {不适用}` 里；`current_task_id=null` ⇒ `main=null` 且 `emptyNotice` = `本阶段没有当前任务`（E20）', '批次 AC'],
  ['DASH-05', 'client-dashboard', F.dash03, '主行 = **一行**（定形 R4；对照表 E25 的 JSX 形状）：`div.taskTitle` 的直接子元素必须**恰好**是 `strong`（标题）+ `span.taskState`（五关词）—— 与官方 `client.js` L169-174 同形。**尺子先量官方**（取件走设计抽屉的只读副本，缺了再用 `.tools/asar-cli` 解到运行根；取不到 ⇒ HOLD 并点名 `tried`），外加两个合成阴性样本（拆成两行的 / 标题不是 `strong` 的）必须被判假 —— 判据得翻得动面。插件身份同格判：`window.__ModuleLoader__.load` 装载口、`conversation.session.header.actions` 槽位（官方 L491-497）、槽 id `dashboard`、触发器文案 `看板`、官方那 13 个元素的 CSS 类名格一个不少；渲染层里**不许**出现 `openCounts` / `ticketStatusOf` / 读盘（它只画数据层给的东西）', '批次 AC'],
  ['DASH-06', 'client-dashboard', F.dash03, '**不许有活组员数**（定形 §五；对照表 E10 已删）：渲染层（去注释后）零 `members` / `memberCount` —— **阴性对照**是官方那份里这两个针必须各命中 ≥1，否则"我们这边零命中"可能是针死了。同时 `span.count` 徽标是**复用官方元素装我们自己的内容**（§八.2）：它必须挂在某个 `h3` 上，children 必须是**一个词**（记忆相位），不带 `.length` / `members`；官方那枚徽标的 children 恰好是 `team.members.length` ⇒ 同一个判据在它身上必须为**假**。数据层这一侧：视图里没有 `member`/`roster` 类键，`badge.word` 在 `PHASES` 闭集里、不是数字、不含空白（只许一个词）', '批次 AC'],
  ['DASH-07', 'client-dashboard', F.dash03, '欠账区**三列** + 0 不许被藏（定形 §八.1 / R5；对照表 E11）：CSS 里 `roster` 那条网格必须含 `grid-template-columns:repeat(3, minmax(0,1fr))` 且**不再有** `repeat(2`（官方是 2 列 ⇒ 同一个判据在官方 CSS 上必须为假，证明它分得开 2 列与 3 列）；官方那四条尺寸/圆角原值（`min-height:28px` / `width:min(500px,100vw - 32px)` / `max-height:min(680px,100vh - 32px)` / `border-radius:12px`，对照表 E02/E03）逐条在；渲染条件不许用 `value > 0` / `value !== 0` / `!debt` 把 0 那一格藏掉（合成样本自证针是活的）；三格名 `票` / `bug` / `评审回执` 都在，且三格住在 `.roster` 网格里', '批次 AC'],
  ['DASH-08', 'client-dashboard', F.dash02, '缺 / 空 / 坏三态（定形 R5 + 对照表 §5「缺 ≠ 空」）：① **空但读得到** ⇒ 三格都是显式 `0`（`open 0` / `open 0` / `缺 0 段`，`state=done`，文字里真的有那个 0），第一行照印 headline，空态行照印；② **少一份源**（route / bug / local / update 各一次）⇒ 只有它那一格塌成 `null`/`未知`（读不到**不许**写 0），其余格与本行**一格不动**，**不抛异常**；route 读不到时**不许**印"本阶段没有当前任务"（那是"我们知道没有"，不是"不知道"）；update 不在是正常态 ⇒ badge=null 且**不报警**；③ **四份全不在** ⇒ 不崩、五格全 `未知`、报警点名 route/bug/local；④ **半截 JSON** 与"不在"必须两个诊断（`DASH-SOURCE-UNREADABLE:*` vs `DASH-SOURCE-MISSING:*`）；报警码全过契约 §4 的闭集', '批次 AC'],
  ['DASH-09', 'client-dashboard', F.dash01, '**这一版不读 `now.md`**（定形 §八.3 的决定；对照表 F9 的理由）：① 字段表里没有一条指向 `now.md`（针自证：喂一条假路径必须命中）；② 夹具里放一份带唯一标记的 `now.md`，看板数据（视图 + 读数）里**不许**出现它的正文；③ 视图里没有"下一步"这一类键（`next` / `nextStep` / `todo` / `nowMd`）—— 那是 `now.md` 唯一会带进来的东西。将来要加，先按 §八.3 给 `now.md` 加一行可解析的锚（另一条改动），不许从散文里捞', '批次 AC'],
  // ── 第 2 关重开（2026-11-04 第 4 关评审 🟠 打回·修：三条都是判据集上的洞）────────────────
  ['DASH-10', 'client-dashboard', F.dash04, '**面板定位**（评审 F1；官方 `client.js` L230-236 / L327-331）：① **接线**四条 —— `useAnchoredPosition({open, anchorRef, panelRef, gap:5, margin:16})` 必须被调用、结果有变量接住；面板 JSX 上必须有 `style`，且里面有一条 `??` 兜底、左手就是那个变量；两个 ref 必须是 `useRef(...)` 声明的真 ref，锚点 ref 真的挂在 `.trigger` 上、面板 ref 真的挂在 `.panel` 上。② **兜底必须可见**（2026-11-06 重写；老板报障"点「看板」，按钮自己消失、什么都没留下"的第二半）—— 位置还没算出来（钩子返回 `null`）那一帧：`visibility` 只许 `visible`（缺省也算）、不许 `display:"none"` / `opacity:0`（⇒ `DASH-POS-FALLBACK-HIDDEN`，旧兜底 `{visibility:"hidden",left:0,top:0}` 就是这条的来历），且 `left`/`top` 必须是 ≥0 的具体数值（⇒ `DASH-POS-FALLBACK-UNPLACED`；面板是 portal 到 `<body>` 末尾的，没坐标那一帧落在页面末尾）。**两位读者**读同一个兜底：源码里那个对象字面量（真求值成对象，不做文本比对）+ **真装 `client.js`、真点一次**后 `panel.props.style`（`support/dash-client-harness.mjs`）。**判存在与接线，不判像素**（开在哪、圆角阴影、`16/64` 这两个数归 GUI 清单第 2/8 条）。尺子：接线四条先量官方（必须干净）+ 官方源码上四把刀；兜底那条**不拿官方当尺子**（官方那份就是故障形状，只记读数 `readings.official_fallback`）—— 它的对照是十格合成样本（可见/缺省可见/带单位像素/故障字面量/display:none/opacity:0/没坐标/坐标不是数/空对象/不是对象，每格只翻自己那一码）**加故障那一版的真字节**（`d586215^`：兜底必须**只**翻 `-HIDDEN`，而接线四条在它身上仍干净 ⇒ 两条判据分得开"没接线"与"接好了但看不见"）', '批次 AC'],
  ['DASH-11', 'client-dashboard', F.dash05, '**Node 半边端到端**（评审 F2：端到端零证据）：真子进程 + 假 ctx 跑 `lib/index.js` 的 `apply()`，判六件事 —— ① **原子写**：`<file>.tmp` 先写、再 `rename` 到活路径；真在写盘中间崩一次（子进程里把 `writeFileSync` 换成"写半份再抛"，不改盘上源码），活文件必须**逐字不变**（半个字节都不许进活路径），崩过之后下一拍能自己恢复；② **契约 §3 形状**：快照**恰好九个键**（`schema` / `day` / `generated_at` / `header` / `badge` / `main` / `emptyNotice` / `debts` / `alerts`）—— 份数与键表**不在这一行复述**：唯一载体是契约 §3 与 `dash05` 的 `VIEW_KEYS`（复审 §7 D3：这个数有几份载体时，改一处等于没改）；三格次序固定；③ **第二次跑覆盖**（换掉 headline 再跑，快照内容跟过去）；④ **渲染层只读这一份**：`SNAPSHOT_PATH` 与 `DASHBOARD_SNAPSHOT_REL` 逐字相同、经那条 Remote 服务的 `.read(sessionId, SNAPSHOT_PATH, {offset:1,limit:200})` 读、不碰四份账本、不自己算（**不认 `workspaceFiles.read(...)` 这个文本形状**：先取服务再 `svc.read(...)` 也算 —— 2026-11-06 之前这条锁的正是那个形状，实现一改兜底它就假红在"路径漂了"上）；⑤ **运行时同源**（第二读者）：真装 `client.js` 点一次，把 `read` 的实参抓下来 —— 第二个实参必须逐字等于 `DASHBOARD_SNAPSHOT_REL`、第一个是当前会话、第三个是 `{offset:1,limit:200}`（⇒ `DASH11-CLIENT-READ-PATH-DRIFT`）；⑥ **读盘失败只许画红条**（2026-11-06 01:19 故障的第一半）：五种现场（没有 `remote` / 没有 `workspaceFiles` / `read` 不是函数 / `read` 同步抛 / `read` 返回 rejected）下 `readSnapshot` 都**不许同步抛**（⇒ `-THREW`；同步抛在 React 里等于整个槽位被拆掉）、必须是 **rejected 的 promise**（⇒ `-NOT-A-PROMISE` / `-NOT-REJECTED`）、原因**非空**（⇒ `-ERROR-EMPTY`）；点一次之后树里**槽位根与触发器按钮都还在**（⇒ `-BUTTON-GONE`）且多出一条 `role="alert"` 的错误条、条上就是那条原因（⇒ `-NO-ERROR-STATE`）；成功那一支是**读盘的新契约**：三种页形状（扁平 `{offset,text,lines,eof}` / `{value:{text}}` / `{result:{text}}`）都必须由 `pickPageText` 取出正文、`readSnapshot` resolve `{text}`、树里画出快照里的 headline（⇒ `-SUCCESS-BROKEN`）；认不出的页形状（`{ok:false}`）必须画一条**点名形状**的红条（类型 + 顶层键 + 预览，⇒ `-SHAPE-UNNAMED`），不许退化成 `"undefined" is not valid JSON`、也不许被吞成成功（⇒ `-SHAPE-SWALLOWED`）；⑦ **没有快照是一条状态、不是故障**（老板报障的另一半：`RealisticAccessories` 那边快照路径根本不存在）：远端报 `workspace-file/not-found` ⇒ `readSnapshot` resolve `{absent:<path>}`、面板画 `[data-dashboard-absent]` 的 `role="status"` 通知并带着那条路径（⇒ `-ABSENT-NO-NOTICE` / `-ABSENT-NOT-STATUS` / `-ABSENT-NO-PATH`）、**没有** `role="alert"`（⇒ `-ABSENT-AS-ALERT`）、按钮与槽位根都还在（⇒ `-ABSENT-BUTTON-GONE`）；红基线是 `46ddea6` 那一版真字节（缺 `absent` 那一支 ⇒ 只许翻 `-ABSENT-NO-NOTICE` + `-ABSENT-AS-ALERT`，按钮那一码不跟着翻）。两把刀只改内存里的源码：直接写活文件 ⇒ `DASH11-NONATOMIC-WRITE`；半份活文件 ⇒ `DASH11-HALF-LIVE-FILE`；**第三把刀是故障那一版的真字节**（`d586215^`，拿不到 ⇒ HOLD `DASH11-KNIFE-UNAVAILABLE`）：它在"服务不在"现场必须被 ⑥ 抓到，抓不到 ⇒ `DASH11-KNIFE-VECTOR`；⑧ **落点不在被测树里**（2026-11-06 复审 §7 E1/E2）：`DASHBOARD_SNAPSHOT_REL` 与渲染层 `SNAPSHOT_PATH` 逐字相同 **且** 都不在 `presets/agenia` / 任一 `.runtime` / 任一 `.team` 之下（绝对路径 / `..` 另给 `-REL-BAD-SHAPE`），三把刀只改内存里的字符串：只改渲染层·树外另一处 ⇒ 只翻 `-SNAPSHOT-PATH-DRIFT`；只改渲染层·搬进被测树 ⇒ 翻漂移 + `-SNAPSHOT-UNDER-MEASURED-TREE`；**两半同批**搬进 `presets/agenia` ⇒ 只翻被测树那一码（相等照样成立 —— 复审的原输入就是这一种）；⑨ **视图守卫十种现场**（复审 E3：这一条修复原来零样本）：缺 `alerts` / 缺 `header` / `header:null` / `debts:null` / `debts:[null]` / `alerts:[null]` / 缺 `badge` / 缺 `main` / `null`（`JSON.parse("null")`）/ 顶层数组，每种都必须 readSnapshot resolve、**渲染期不抛**、出现 `role="alert"` 且**点名那个缺陷**、按钮与槽位根还在（`-VIEW-SHAPE-THREW` / `-NO-ALERT` / `-UNNAMED` / `-BUTTON-GONE` / `-READ-BROKEN`）；好视图对照必须一格都不报（`-VIEW-SHAPE-CONTROL` 是尺子坏了）；红基线是 `84bdddb`（加 `viewProblem` 之前最后一版）真字节 —— **十种全部至少翻一码**，否则 `-VIEW-SHAPE-KNIFE`；⑩ **`generated_at` 的值与「多久以前」**（复审 D3 / E11 的值那一半）：注入时钟（`2026-11-04T12:34:56+08:00`）进程内跑 `refreshSnapshot({root, now})` ⇒ 盘上 `generated_at` 必须解析得了且等于那个时刻（±1 s，⇒ `-GENERATED-AT-MISSING` / `-UNPARSEABLE` / `-DRIFT`）；页脚（`role="status"` 的「读数日 …」）带 `generated_at` 时必须写「· N 分钟前」（⇒ `-AGE-SUFFIX-MISSING` / `-AGE-SUFFIX-WRONG`）、**没有** `generated_at` 时**不许**出现年龄后缀（⇒ `-AGE-SUFFIX-GUESSED`：不知道多旧不许写成「刚刚」）；三把刀各只翻一码：去掉写手的盖章（拷 `lib/` + 改过的入口到运行根里跑）⇒ 只翻 `-GENERATED-AT-MISSING`、删 `${ageSuffix(...)}` ⇒ 只翻 `-AGE-SUFFIX-MISSING`、缺章时猜「刚刚」⇒ 只翻 `-AGE-SUFFIX-GUESSED`。⚠️ **机制上①–③今天就是绿的**（原子写早就在），这一格补的是证据洞、不是首跑红 —— 读数里照实写；⚠️ ⑨ 里 `debts:[null]` / `alerts:[null]` / 缺 `badge` / 缺 `main` 四种**今天仍是红的**（产品缺口：`viewProblem` 只判容器类型，不判元素与 `badge`/`main`），红着交给实现岗，不许把要求降到"今天就这德行"', '批次 AC'],
  ['DASH-12', 'client-dashboard', F.dash05, '**日身份**（评审 F3：陈旧读数当当下）：`view.day` 必须 = **今天这个周期日**（`lib/route.mjs::dayKeyOf`，本地 04:00 切点，与全系统同一把尺子），且画面上**看得到 day**；三个现场 —— ① 注入时钟 12:00、盘上**只有前一天**的相位文件 ⇒ `day` = 今天、`badge` = `null`（契约 §3.4：当天文件不在是正常态，不报警）、回执读**今天**的 `local`；② 01:30（切点下方）⇒ `day` = 前一天（用日历日就会是本日）；③ 当天文件在 ⇒ `badge` = 当天的相位词。源码那一腿：日键必须从 `dayKeyOf(...)` 来（`index.js` 或 `latestUpdateDay` 的函数体），"按文件名排序取最后一天"那把刀当场红（`DASH-DAY-NOT-CYCLE-KEY`）；"画得到 day"另有合成正负样本自证。今天红在 `DASH-DAY-NOT-TODAY` + `DASH-BADGE-STALE` + `DASH-RECEIPT-DAY` + `DASH-DAY-NOT-SHOWN` + `DASH-DAY-NOT-CYCLE-KEY`', '批次 AC'],
  ['DASH-13', 'client-dashboard', F.dash04, '**E29 展开钮**（对照表 L148 标「抄（条件）」、在"抄 25"里；评审 §2.1 点名的唯一少画项）：① 说明段带 `ref` 且代码真读 `scrollHeight` / `clientHeight`（溢出测量）；② `clampedDescription` 的 CSS 是 2 行截断；③ 一个 `expandToggle` 按钮，带 `aria-expanded` + `onClick` + **被"只在溢出时出现"的条件守着**；④ 词典里有展开/收起那一对文案键、按钮 children 用 `t(...)` 切。**判存在与接线，不判像素**（按钮位置、展开后高度归 GUI 清单第 4 条）。判据先在官方源码上量（必须干净），再切五把刀（删测量/删类名/删 aria/删条件/删文案键），每把只翻它自己那一面 —— 今天红在 `E29-MEASURE-MISSING` + `E29-TOGGLE-MISSING` + `E29-TEXT-KEYS`（截断那一条今天是绿的）', '批次 AC'],
  ['DASH-14', 'client-dashboard', F.dash04, '**读数日的位置**（第 4 关复审 `R2-1`：日期抢了第一行）：**只判源码顺序与区域，不判像素**（看起来在底部 / 字号 / 灰条像不像归 GUI #3/#4/#6）—— ① 面板里**第一个 `h3`（headline 行）必须在 `view.day` 表达式之前**，日期抢在它前面 ⇒ `DASH-DATE-BEFORE-HEADLINE`（R2-1 的形态）；② `view.day` 必须落在**欠账网格（`.roster`）结束之后**（页脚）；还在 headline 之后、网格之前（E06/notice 那一带）⇒ `DASH-DATE-NOT-IN-FOOTER`。**不认类名**：页脚沿用 `notice` 的样式也算过。合成面板三格自证（正确形状干净 / 刀 A 日期挪回 headline 前 / 刀 B 日期塞回 notice 带），两把刀各只翻自己那一码（`DASH-KNIFE-VECTOR`）；冻结副本上今天红在 `DASH-DATE-BEFORE-HEADLINE`', '批次 AC'],
  // ── `bug-20261104-02`（2026-11-05）：面板**装上了没有**（「写出来了」≠「装上了」）──────────

  // `preset-*.plugins` 里；行体 + 包的 `dsh.client` 声明齐全；整份补丁是生成器的派生物。

  ['DASH-15', 'client-dashboard', F.dash06, '**面板装上了没有（bundle 层）**（`bug-20261104-02` 的迁移版；老板 2026-11-04「我在客户端里点哪，i see nothing」· 组长当天 log §十四）：挂载的载体是**我们自己的包**（`presets/agenia/cordis.patch.yml` 的顶层 `- insert:`）—— 官方「智能体团队」面板就是挂在自己的 `dsh.bundle.patch` 顶层 insert 里（`@deepseek-ai/dsh-experimental-agent-team-profile` 的 `ui-agent-team` 与两条服务行并列），而我们自己的 `agenia-injector` 有同一个 `dsh.bundle.patch`；"宿主层会把 bundle 层带塌"那个归因已被 `bug-20261105-12` 证伪。① **顶层 insert 的形状**（`DASH-TOP-INSERT-SHAPE`）：恰好 1 个、顶层没有别的条目、`@deepseek-ai/dsh-agent-preset` 恰好 2 条、宿主级行至多 1 条且必须是看板包那一份。② **看板那一行**：整份补丁里没有一行解析到看板包 ⇒ `DASH-ROW-ABSENT`（**红**，不是 HOLD：缺席是关于产品的事实）；在、但不是顶层 insert 的直接成员 ⇒ `DASH-NOT-HOST-LEVEL`；是直接成员但 `disabled: true` ⇒ `DASH-ROW-DISABLED`；`name` 指不到包 / 包没声明 `dsh.client.platform: web` / 没 `exports["./client"]` / 没 `config.root` / **包自己的 Node 入口文件不在盘上** ⇒ `DASH-NO-CLIENT-DECL`（报文各自点名）。🔴 认它**不认 id / 名字形状** —— 靠"那份 `package.json` 是不是看板包那一份"。③ **真字节翻面**：拿最近一次"那一行还没住进顶层 insert"的提交（回滚期那版真字节）当 before ⇒ **必须红**；把那一行搬进顶层 insert（`withHostRowInTopInsert()`：只搬这一行、其余字节不动）当 fixture ⇒ **必须绿**，且 `顶层 - insert: 1 个 · 直接成员 3 条（1 宿主 + 2 预设入口）` · `宿主级行 1 条` · `预设体内客户端 UI 行 0 条` · `agenia-dashboard` 恰好 1 次，逐条命中；刀翻错面 ⇒ `DASH-KNIFE-VECTOR`。④ **派生物**：生成的补丁必须等于 `make-bundle-patch.mjs --check` 从 `agent.cordis.yml` 造出来的那一份 —— exit 1 **分开报**（`E_PATCH_NOT_DERIVED` ⇒ `DASH-PATCH-NOT-DERIVED`；其余 `E_PATCH_*` ⇒ `DASH-PATCH-STRUCTURE-WRONG`；`E_BUNDLE_*` ⇒ `DASH-PATCH-COMPOSITION-REJECTED`；没判词 ⇒ `DASH-PATCH-DERIVE-CRASH`），三把刀各造一个原因，跑前有安全联锁、跑后量活体 sha256。另有**读取器覆盖**（warnings 为空 + "最后一条顶层 item"两把尺子一致）。备用路线（profile 层工具）**只落读数、不进判词**。**不判像素、不判浏览器真的收到包**（前者归 GUI 清单，后者归 `BOOT-02`）', '批次 AC'],
  // ── 第 4 关评审 `R-1`（2026-11-05）：**语义面** —— 忘写标记、忘点名表也必须红 ─────────────────


  ['DASH-16', 'client-dashboard', F.dash06, '**客户端 UI 行的层归属（语义面 · bundle 层）**（第 4 关评审 2026-11-05 `R-1`；`bug-20261104-02` 的下一次复现路径）：一行的层归属由"它指向的包是不是客户端 UI"决定，不由作者记得的两把钥匙（`# @host-level` / `HOST_LEVEL_IDS`）决定。① 补丁里**每一行**用 `name` 解析到盘上的 `package.json`（路径形真解析；裸包名按 `manifestRoots` 里的 `package.json.name` 匹配），只要那个包声明 `dsh.client.platform: "web"` 却住在**任一预设的 `config.plugins` 子树**里 ⇒ `DASH-CLIENT-IN-PRESET`（**红**；`disabled: true` 也不算合规 —— 关着只是让它不跑，不是把它装上）；② 同类行住在**顶层 override**（既不在 insert、也不在预设）⇒ `DASH-CLIENT-OUTSIDE-INSERT`；③ 看板那一行必须**恰好一次**（语义计数 + 文件里 `- id: agenia-dashboard` 的文本出现次数）⇒ 否则 `DASH-HOST-ROW-COUNT`（多一份就多一个 Node 写者，"装上了没有"没有唯一答案）。🔴 解析不到的预设行**只进读数** `unresolved_in_preset`：两份预设体里六十来行框架裸包名住在 `app.asar` 里，这棵树解析不到；对它们记 HOLD 会让本格**每一次都挂起 60 条**（`cand-20261019-0042` 那个病），fail-closed 的判定在生成器那一侧（`E_BUNDLE_CLIENT_UI_UNRESOLVED` / `E_BUNDLE_CLIENT_UI_IN_PRESET`）。④ **翻面**：只存在于夹具里的合成包（声明 web）+ 合成行 —— 放进**组长 / 组员**任一预设体 ⇒ **只有** `DASH-CLIENT-IN-PRESET`；**裸包名**（`manifestRoots` 索引解析得到 web 包）放进预设体 ⇒ 同一个码；放进顶层 override ⇒ **只有** `DASH-CLIENT-OUTSIDE-INSERT`；看板行缺席 ⇒ **只有** `DASH-HOST-ROW-COUNT`；insert 一份 + 预设一份 ⇒ 同一个码 + 预设那一条。刀翻错面 ⇒ `DASH-KNIFE-VECTOR`；扫描器没把夹具行解析到它自己的包 / 夹具行出现在生产输入里 ⇒ `DASH-KNIFE-UNREADABLE`。**退役的码**（墓碑见 `support/client-ui-placement.mjs` 文件头）：`DASH-PROFILE-*` 全家（profile 层降级为备用路线，`.tools/mount-dashboard-profile.mjs` 自己的 `--check` 是它的检查器；两套码同时声称"挂载没做"是禁止的）· `DASH-HOST-MISSING` · `DASH-CLIENT-IN-BUNDLE-TOP` · `DASH-DISABLED-MISMATCH` · `DASH-ROW-PACKAGE-UNRESOLVED`。**不判像素、不判浏览器真的收到包**（前者归 GUI 清单，后者归 `BOOT-02`）。判据本体与合成夹具：`support/client-ui-placement.mjs`', '批次 AC'],
  // ── 批次 AD（2026-11-05 第 2 关）：**启动之后的读数** —— 事故（log §十三）真正的漏洞 ─────────
  // 一句话：塌了和没塌在盘上长得一模一样，因为**没有一条读数**在启动之后问过"预设还注册得上吗 / 浏览器真收到包了吗"。
  // 量具与口径（含"会话头是创建时快照、续跑的老会话不算证据"）逐条写在 `support/boot-readings.mjs`。
  ['BOOT-01', 'boot-readings', F.bootReadings, '**启动后读数 A（身份）**（定形 R2 + R5，`定形-看板挂载profile层.md`）：`T` = 这一次客户端启动的时刻（`AGENIA_BOOT_AT`，否则量宿主进程启动时刻；都没有 ⇒ `BOOT-R2-RESTART-TIME-UNKNOWN` 的 HOLD）；取该工作区里**创建（`header.createdAt`）于 `T` 之后**、**顶层**（`delegationDepth === 0` 且不是 `origin: subagent` / 带 `parentSession` 的委派会话）的最新一份会话，判头里的 `agentPreset`：`agenia` ⇒ 成立 · `standard` ⇒ `BOOT-PRESET-NOT-REGISTERED`（= 事故形态：无角色 ⇒ 窄权限）· 别的值 ⇒ `BOOT-PRESET-UNEXPECTED`；**没有创建于 `T` 之后的顶层会话 ⇒ HOLD `BOOT-NO-SESSION-AFTER-RESTART`**（`mtime` 晚但 `createdAt` 早的**续跑会话**单独列进 `readings.identity.resumed_touched_after_T`，**不当证据** —— 事故现场那份 `session-cc5c68d1` 的头写于 2026-10-19，16:07 续跑起来守卫读的还是 `standard`）。**尺子自证两条**：① 拿盘上真实的两份流各喂一次（`standard` 那份必须 RED、`agenia` 那份必须 GREEN，判词不同，否则 `BOOT-R2-DETECTOR-DEAD`）；② `zstd-frames.mjs` 全解的头必须等于 `zstdDecompressSync`（只解第一帧）解出来的头，否则 `BOOT-R2-HEADER-NOT-IN-FIRST-FRAME`。同批 **R5 的条件式**（不是故事）：`profile 补丁里那一行` × 上面的判词 —— 行不在而判 RED ⇒ `BOOT-ROLLBACK-DID-NOT-RESTORE`；行在而判 RED ⇒ `BOOT-MOUNT-BROKE-IDENTITY`；行在还必须能**一步撤掉**（顶层 `- insert:` 一个 item、整块拿掉后仍解析干净、文件里再无第二处引用），否则 `BOOT-ROLLBACK-NOT-REMOVABLE`。读数带 `{repo, head, T 与来源, 每份会话的 bytes/sha256/首帧 sha256/createdAt, measured_at}`', '批次 AD'],
  ['BOOT-02', 'boot-readings', F.bootReadings, '**启动后读数 B（包可达）**（定形 R3；「两条读数都要有，缺一不算挂上」）：宿主侧的**两条**读数 —— A **boot 载荷**：页面（`GET /` / `/index.html`）里 `window.__DSH_BOOT__` 的 entry 表有没有这个**包名**（`@agenia/dsh-client-ui-dashboard`；表键是包名，不是 cordis 行 id —— 所以 `/plugins/agenia-dashboard/client.js` 那种写法必然 404，**404 不是"不在"的证据**）；B **插件路由**：`GET /plugins/<包名>/client.js?rev=<rev>` 是否 200 **且**前 N B 与盘上那份逐字节相同（`rev` 按平台的 `artifactRevision()` 从 `[mtimeMs, ctimeMs, size]` 算；抄错了只会 404 ⇒ HOLD，不会假绿）。三态：200 证据 / 404 **判不了**（`BOOT-R3-ROUTE-404-AMBIGUOUS`，同批三个对照：未知包名 404、错 rev 404、根页面 401 ⇒ 路由在、门禁不归它管）/ 连不上（`BOOT-R3-NO-HOST`）。⇒ GREEN 只在 A、B 都拿到证据；任一条读不到 ⇒ **HOLD `BOOT-R3-HALF-PROOF`**（带两条各自的码）；只有 A 读到 200 而表里没有这个包 ⇒ `RED BOOT-R3-ENTRY-NOT-IN-BOOT`。挂载行不在 / 关着 / 住错层 ⇒ HOLD `BOOT-R3-MOUNT-ABSENT` / HOLD `BOOT-R3-MOUNT-DISABLED` / RED `BOOT-R3-MOUNT-NOT-TOP-LEVEL-INSERT`。**不判像素、不判浏览器真的执行了那份 JS**（归 GUI 清单，人点一次）', '批次 AD'],
  // ── 批次 AE（2026-11-06 · `ticket-20261106-02`）：**回执卡的两族判据**（复审 §7 的 E5 + E6）──
  // 复审的判词是同一句：**输出的句子对了，但没有任何测试读这一页**。两格各补一条能翻面的判据；
  // 刀在用例里每次真跑（副本 / 钉住的旧字节），所以"红"这件事不必靠一次性的现场。
  ['CARD-07', 'memory-update-card', F.card07, '**`待你拍` 三态**（复审 §7 E5；判词是「文件不在 vs `[]` 真分开了，但零测试读这一页」）：`A` **有行** —— 夹具里两行的（事 / 为什么 / 代价）三列必须逐字出现在卡 1 的 `待你拍` 页，且**不许**印成任何一句占位语；`B` **文件在、`[]`** —— 必须是「今天 0 件 · 组长登记了『没有要拍的事』」这一族（含 `0 件` + `登记`），**不许**说 `不存在` / `没有人登记`；`C` **文件不在** —— 必须是「没有人登记 / 待你拍.json 不存在」+「**不代表**今天没有要拍的事」（**不许**印 `0 件`）；`D` **三态三句两两不同**（合成一句 ⇒ 这一条单独红）；`E` **刀**：把生成器**副本**里那三条腿（`daily-cards.py` 的 `:1358-1368`）合成一句写死的「（今天 0 件）」—— 只改副本、生产零字节，刀必须让 `A/B/C/D` 四条同时翻（`CARD07-PENDING-KNIFE` 是尺子坏了 / `-KNIFE-VECTOR` 是翻错了面），而**真源码那一跑 0 项**；`F` 生产 `daily-cards.py` 的 sha256 前后一字不变；`G` **B 列刀**：把错句子塞进 **B 列**（`[]` 那态塞「没有人登记」、文件不在那态多带一句「今天 0 件」而「不代表…」仍在）⇒ 必备语 / 禁止语按**全部数据列**判，必须恰好翻 `CARD07-EMPTY-NOT-REGISTERED` + `CARD07-ABSENT-AS-ZERO`（只扫 A 列时这一跑 0 条）；`H` **版式**：表头行 + 数据起始行被钉住、数据区**不许夹空行**（`CARD07-LAYOUT`；版式刀在数据前 / 数据区里各插一个空行 ⇒ 恰好翻这一条）；`I` **整页行数**：版式窗口只管"洞"，行数必须按**整页**量（`rawDataRows(...).length` 恰好 = 这一批应有的行数），刀 = 把第二条数据行**复制成第三行** ⇒ 必须恰好翻 `CARD07-ROWS-LOST`（窗口量时这一跑 0 条）；`J` **词的否定**：「登记」的否定形态（「组长没有登记」）不算"登记了"（词表**不放宽**），刀 = `[]` 那态换成否定句 ⇒ 恰好翻 `CARD07-EMPTY-NOT-REGISTERED`；`K` **多一列**：表头 / 数据行在声明的列数之外有非空格 ⇒ 版式红（原来表头是前缀比较、`rowCells` 只读 0..2），刀 = 表头加第 4 列 ⇒ 恰好翻 `CARD07-LAYOUT`。⚠️ 这一格钉的是**人读页**：机器格 `C2 · 验收格` 里没有这一格，老板读的就是这一页', '批次 AE'],
  ['CARD-08', 'memory-update-card', F.card08, '**「处置」列三错值 + 两好形状**（复审 §7 E6 / §3.3 的 (a)(b)(c)；`bug-*-12` 的修复原来只活了产品半边）：真跑生成器 + `findings-map.json` 夹具，读卡 2 的 `每条的落点` 页（**表头 6 列** = `# / 级别 / 发现（一句话） / 处置 /「票号 / 落点」（同一格） / 下一步`；判据读前 5 格，表头行 + 数据起始行钉住、数据区不许夹空行 ⇒ `CARD08-LAYOUT`）；七条发现各一格：`F-1` `{disposition:"adopted", ticket:"T"}` ⇒ 处置 `采纳` **且**落点里真的有 `T`（票号也是落点）；`F-2` `"采纳不了：前提不成立"` ⇒ 处置**不是** `采纳`（期望 `🔴 未登记口径`）；`F-3` `"采纳 · ticket-F-172 · …"` / `F-4` `{rejected, reason}` ⇒ 两条**好形状**必须仍绿；`F-5` map **在但没这一条** ⇒ `🔴 未登记落点` 且那句说 `findings-map.json 在`、**不许**说「还没写」；`F-6` 对象 `disposition` 认不出 / `F-7` 数字 ⇒ `🔴 未登记口径`（"其它一律不猜"）；`F-5` 另跑一副**没有 map 文件**的同形夹具 ⇒ 同一格必须印**另一句**（`还没写`）且与上面那句**不相等**（`CARD08-MAP-MESSAGES-SAME`；这条只在**两跑都真拿到那一句**时才判 —— 版式门一挡就是"没量到"，只记读数 `CARD08-MAP-MESSAGES-UNMEASURED`，不许写成"两句相同"）；`CARD08-LAYOUT` 的报文只报"形状不对"，**不替人判**是产品改版式还是页被写坏；刀 = `e7bdbbe^` 那一版 `disposition_of` 的**真字节**（只把签名补上 `map_present`，其余逐字），它必须恰好翻 `F-1 票号丢失` + `F-2 印成采纳` + `F-5 原因错/两句同形` 这六条码，而两条好形状与 `F-6/F-7` **一条都不许翻**（`CARD08-KNIFE-VECTOR`）；生产 `daily-cards.py` 的 sha256 前后不变、两跑都 exit 0', '批次 AE'],
]

/** 注册表本体（冻结顺序 = 契约 §9.1 的组序）。 */
export const REGISTRY = ROWS.map(([id, group, file, title, batchNote, notes]) => ({
  id,
  group,
  file,
  status: BATCH_OF(id) === null ? 'pending-write' : 'written',
  batch: BATCH_OF(id) ?? 'pending',
  title,
  batch_note: batchNote,
  ...(notes ? { notes } : {}),
}))

/**
 * 历史冻结的 55 条（批次 A–F）—— **显式清单**，不是计数常数。
 * 判据因此从"总数 === 55"变成"**这 55 条一条不少**"：可以加新 ID（三处同批），
 * 但不许让任何一条悄悄离开登记表。
 */
export const FROZEN_IDS = [
  ...BATCH_A, ...BATCH_B, ...BATCH_C, ...BATCH_D, ...BATCH_E, ...BATCH_F,
]

/**
 * 分母：**盘上事实**（`discover.mjs` 数源码里的 `test('<ID> …')`，不数表）。
 * 表只做对账 —— 两边对不上由 `registryProblems()` 报红，而不是让分母跟着表漂。
 */
export const DISCOVERY = discoverCases()
export const TOTAL = DISCOVERY.ids.length
export const CASES_BY_ID = new Map(REGISTRY.map((r) => [r.id, r]))

export function countByStatus() {
  const out = { written: 0, 'pending-write': 0 }
  for (const r of REGISTRY) out[r.status] += 1
  return out
}

export function idsOf(file) {
  return REGISTRY.filter((r) => r.file === file).map((r) => r.id)
}

export function batchA() {
  return REGISTRY.filter((r) => BATCH_A.includes(r.id))
}

export function batchB() {
  return REGISTRY.filter((r) => BATCH_B.includes(r.id))
}

/** 契约 §9.1 的每组红用例数（分母的第二个口径，两处必须对上）。 */
export const GROUP_COUNTS = {
  /**
   * `guard` 3 → 4：`RGATE-01`（批次 AA，`bug-20261103-01`）守的是**同一道 `tools.guard`** 里的
   * 第 6 条判定（每日评审闸）—— 它不另开一族：拒它的是 guard 回调、被拒的是委派工具，
   * 与 `GRD-01..03` 同一个出口。差别只在量法：`GRD-*` 量纯函数 + 假 ctx，`RGATE-01` 量
   * **真 `apply()` 注册的那个回调**（载具 `support/injector-harness.mjs`）。
   *
   * `static-doc` 6 → 7：`MJUDGE-01`（批次 AB，2026-11-03 21:2x 老板插票）是**静态文本腿** ——
   * 判两份判决岗说明书里那一节（主语 / 替换法 / 两个边界）与"复核岗不许带"那一面；
   * 它与 `STAT-04` / `DOC-01` 同一族（"文档里必须出现 / 必须消失的字面量"），所以不另开一族。
   */
  'static-doc': 7, route: 8, store: 4, memory: 12, guard: 4, job: 4,
  /** `receipt` 4 → 5 / `health` 2 → 3：`F-162` 的两半（`RCP-05` 回执三件套进 `local-mark` ·
   *  `HLT-03` 卡的第二半 = `E_RECEIPT_ANCHOR` 那一支）各自归到它守的那一族。契约见 `CONTRACT.md` §12.2.4 / §12.5。 */
  /** `review` 3 → 5：`F-160` 的两格（`REV-04` 活树动了仍然有效 · `REV-05` 副本被动过就作废）——
   *  它们守的是**技术评审这一票的效力口径**（提交 / 副本），所以归 `review` 这一族。 */
  review: 5, receipt: 5, health: 3, 'data-root': 3, install: 3, env: 2, read: 1,
  'proposal-file': 11,
  /** 门 1 回执链路四票（`F-120`～`F-123`）—— 契约见 `CONTRACT.md` §6。 */
  'verify-recompute': 4,
  /** 门 1 · `F-112` 剩下两格（+ 顺手 `F-111③`）—— 契约见 `CONTRACT.md` §7。
   *  `SURF-01` 与 `SURF-03` 同住一个文件（同一张清单的两根轴：在不在 / 是不是空壳）。 */
  'surface-declared': 3,
  /** 门 1 · `F-125` 维护案 400 字帽 —— 契约见 `CONTRACT.md` §8。 */
  'maintenance-cap': 3,
  /** 门 2 · `F-129` anchors 形状 —— 契约见 `CONTRACT.md` §6.3（同族：`F-122`）。 */
  'anchors-shape': 1,
  /** 门 2 · `F-148` 思考链过滤 —— 契约见 `CONTRACT.md` §10。 */
  'reasoning-filter': 3,
  /** 门 2 · `F-152` 板子告警三态 —— 契约见 `CONTRACT.md` §3.3。 */
  'board-states': 1,
  /** 门 2 · `F-155` 每日状态的两端与署名（写面 `DLY-01` / 读面 `DLY-02`）—— 契约见 `CONTRACT.md` §11。 */
  'daily-state': 2,
  /** 门 2 · `F-156` 三个本地节点的三态（`LOC-01` 一格四格）+ 第二轮锚点闸三条规则
   *  （`LOC-02` 按字段 / `LOC-03` count 对账 / `LOC-04` `.team/` 前缀，三格同住 `locAnchors` 那个文件）
   *  —— 契约见 `CONTRACT.md` §12。 */
  'local-state': 4,
  /** 门 2 · `F-158` 一天从本地 04:00 切（`DBY-01` 切点下方 / `DBY-02` 切点上方 / `DBY-03` 四处入口同值 /
   *  `DBY-04` 显式 day 的两种形态 / `DBY-05` 体检那条红 / `DBY-06` 过期指针）—— 契约见 `CONTRACT.md` §13。 */
  'day-boundary': 6,
  /** 门 2 · `F-163` 平台版本读数的自证（`PLT-01`：短 2 B / BOM / 截断 / 纯函数 / 真实 asar 读数）。 */
  'platform-reading': 1,
  /** 任务 A · 九份组员并成一份（`PRS-01` 页面两条 / `PRS-02` 身份判定表 / `PRS-03` 判决岗调用被拒 /
   *  `PRS-04` 角色表唯一作者）—— 契约见 `.team/test/CONTRACT-A.md`。 */
  'preset-identity': 4,
  /** 任务 B · bug 系统（`BUG-01` 登记簿与封顶 / `BUG-02` 五分支分流 / `BUG-03` bug 任务与准入 /
   *  `BUG-04` 严重三线）—— 契约见 `.team/test/CONTRACT-B.md`。 */
  'bug-system': 4,
  /** 任务 C1 · 路线账本（`LED-01` C1a 建账+迁移 / `LED-02` C1b 节点+headline / `LED-03` C1c 槽 /
   *  `LED-04` C1d 暂停 / `LED-05` `admitTask` 十六格与两个入口）—— 契约见 `.team/test/CONTRACT-C1.md`。 */
  'route-ledger': 5,
  /** 任务 A 的运行时绕行 · `toolName` 插件桥（`BRG-01` 记录面 / `BRG-02` 消费面 / `BRG-03` 九名全表 /
   *  `BRG-04` 队列 / `BRG-05` 过期 / `BRG-06` 边界 / `BRG-07` 并行派工）—— 契约见 `.team/test/CONTRACT-A-bridge.md`。 */
  'toolname-bridge': 7,
  /** 任务 C2 · 卡（记忆更新报告）—— 六格：路线格 / 票区 / bug 开放数与 50-30 / 严重度那一排 /
   *  状态条十二格 / 容量与回执与卡本身。契约见 `.team/test/CONTRACT-C2.md`。 */
  'memory-update-card': 8,
  /** 批次 Z · 技术评审 2026-11-02 的 F2–F7 六张票（`ticket-20261102-03`…`-08`）——
   *  一格一张票：副本自足 / 容量来源格 / 第三级正样本 / 桥的两张表 / 匹配描述 / 翻面读数。
   *  契约见 `.team/test/2026-11-02/CONTRACT-REVIEW-20261102.md`。 */
  'review-20261102': 6,
  /** 批次 AC · 客户端看板（`DASH-01`…`DASH-16`：字段映射/视图三格/渲染三格 +
   *  第 2 关重开加的四格 —— 定位 / 端到端 / 日身份 / E29 展开钮 +
   *  `DASH-15` **面板装上了没有**（`bug-20261104-02`：profile 层顶层 insert 里的那一行 + 派生物，
   *  缺席 = 红）+
   *  `DASH-16` **客户端 UI 行的层归属（语义面）**（第 4 关评审 `R-1`：按包清单判，不看标记/点名表；
   *  读不到 ⇒ HOLD；bundle 层残余腿只许"关着留在预设里"））——
   *  契约见 `.team/test/2026-11-04/技术契约-客户端看板.md`（定形 §六.1/§六.2/§八；§11 是重开那一批；
   *  `DASH-15` 的定形在 bug 台账 + 组长 2026-11-04 log §十四；`DASH-16` 的定形在评审报告 `R-1`；
   *  2026-11-05 第 4 关复审（`评审报告-g3r2.md` §5）改的是**这四条判法**，不是加用例）。 */
  'client-dashboard': 16,
  /** 批次 AD · **启动后读数**（`BOOT-01` 身份 / `BOOT-02` 包可达）—— 定形
   *  `.team/leader/2026-11-05/定形-看板挂载profile层.md`（R2 / R3 / R5）；量具 `support/boot-readings.mjs`。 */
  'boot-readings': 2,
}

/**
 * 注册表自检 —— 每条用例跑之前先过。
 * 它自己红，说明**表写歪了**（不是被测对象没实现）：那种红必须与 RED-SURFACE 分得开。
 *
 * 分母不在这里判"等不等于某个数"：分母由 `TOTAL`（= 盘上条数）给，本函数判的是
 * **登记与盘上对不对得上**（`consistency()`）+ **发现器自己有没有问题**（`DISCOVERY.problems`）。
 * 冻结的 55 条以 `FROZEN_IDS`（显式清单）的形式守：任何一条离开登记表都是 `DISC-FROZEN`。
 */
export function registryProblems() {
  const problems = []
  // 发现 ↔ 登记：四个方向 + 冻结清单（每一条都点名文件与 ID）。
  for (const p of consistency({ registry: REGISTRY, discovery: DISCOVERY, frozenIds: FROZEN_IDS }).problems) problems.push(p.message)
  // 发现器自己报的问题（没有 ID 的 test() / 重复 ID）。
  for (const p of DISCOVERY.problems) problems.push(p.message)
  // 冻结清单必须正好盖住"后加的显式批次之外的全部登记行"（多一条或少一条都是清单与表分家）。
  // ⚠️ G / H / I / J / K / L / M / N / O / P / Q / R / S / T **以及** U / V / W / X / Y / Z 都是**后加的显式批次**（不进历史冻结清单），每一批都要从这一格里排掉 ——
  //    漏一个的现象是"冻结清单 55 条 ≠ 登记表里多出来的那几条"，而真正坏掉的可能是**别处**。
  const POST_FROZEN = [...BATCH_G, ...BATCH_H, ...BATCH_I, ...BATCH_J, ...BATCH_K, ...BATCH_L, ...BATCH_M, ...BATCH_N, ...BATCH_O, ...BATCH_P, ...BATCH_Q, ...BATCH_R, ...BATCH_S, ...BATCH_T, ...BATCH_U, ...BATCH_V, ...BATCH_W, ...BATCH_X, ...BATCH_Y, ...BATCH_Z, ...BATCH_AA, ...BATCH_AB, ...BATCH_AC, ...BATCH_AD, ...BATCH_AE]
  const nonFrozen = REGISTRY.filter((r) => !POST_FROZEN.includes(r.id)).length
  if (FROZEN_IDS.length !== nonFrozen) problems.push(`冻结清单 ${FROZEN_IDS.length} 条 ≠ 登记表里批次 G/H/I/J/K/L/M/N/O/P/Q/R/S/T/U/V/W/X/Y/Z/AA/AB/AC/AD/AE 之外的 ${nonFrozen} 条（清单与表分家了）`)
  if (BATCH_A.length !== 14) problems.push(`批次 A 的 ID 数 ${BATCH_A.length} ≠ 14`)
  if (BATCH_B.length !== 6) problems.push(`批次 B 的 ID 数 ${BATCH_B.length} ≠ 6`)
  const overlap = BATCH_A.filter((id) => BATCH_B.includes(id))
  if (overlap.length > 0) problems.push(`两批的 ID 有重叠：${overlap.join(', ')}`)
  // 全部批次都写完：`pending-write` 必须是 0（派工单的硬要求）
  const pending = REGISTRY.filter((r) => r.status === 'pending-write').length
  if (pending !== 0) problems.push(`全部批次写完之后 pending-write 必须为 0，实得 ${pending}：${REGISTRY.filter((r) => r.status === 'pending-write').map((r) => r.id).join(', ')}`)
  const seen = new Set()
  for (const r of REGISTRY) {
    if (seen.has(r.id)) problems.push(`重复 ID：${r.id}`)
    seen.add(r.id)
    if (!/^[A-Z]+-\d{2}$/.test(r.id)) problems.push(`ID 形状不合法：${r.id}`)
    if (!r.group || !r.file) problems.push(`缺 group/file：${r.id}`)
    if (!['written', 'pending-write'].includes(r.status)) problems.push(`状态词不合法：${r.id}=${r.status}`)
    const batch = BATCH_OF(r.id)
    if ((batch !== null) !== (r.status === 'written')) problems.push(`批次清单与 status 不一致：${r.id}`)
    if (r.batch !== (batch ?? 'pending')) problems.push(`batch 字段与清单不一致：${r.id}`)
  }
  const byGroup = {}
  for (const r of REGISTRY) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1
  for (const [g, n] of Object.entries(GROUP_COUNTS)) {
    if (byGroup[g] !== n) problems.push(`组 ${g} 计数 ${byGroup[g] ?? 0} ≠ 契约 §9.1 的 ${n}`)
  }
  for (const g of Object.keys(byGroup)) {
    if (!(g in GROUP_COUNTS)) problems.push(`多出一个组：${g}`)
  }
  for (const id of [...FROZEN_IDS, ...BATCH_G, ...BATCH_H, ...BATCH_I, ...BATCH_J, ...BATCH_K, ...BATCH_L, ...BATCH_M, ...BATCH_N, ...BATCH_O, ...BATCH_P, ...BATCH_Q, ...BATCH_R, ...BATCH_S, ...BATCH_T, ...BATCH_U, ...BATCH_V, ...BATCH_W, ...BATCH_X, ...BATCH_Y, ...BATCH_Z, ...BATCH_AA, ...BATCH_AB, ...BATCH_AC, ...BATCH_AD, ...BATCH_AE]) if (!CASES_BY_ID.has(id)) problems.push(`批次清单里的 ID 不在注册表：${id}`)
  return problems
}
