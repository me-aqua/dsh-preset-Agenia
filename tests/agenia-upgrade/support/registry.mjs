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
 * 已落笔的二十三批。历史冻结的 **55 条**（A–F）见 `FROZEN_IDS`；批次 G 是 F-57 新加的那 11 条，
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
 */
export const WRITTEN_BATCHES = { A: BATCH_A, B: BATCH_B, C: BATCH_C, D: BATCH_D, E: BATCH_E, F: BATCH_F, G: BATCH_G, H: BATCH_H, I: BATCH_I, J: BATCH_J, K: BATCH_K, L: BATCH_L, M: BATCH_M, N: BATCH_N, O: BATCH_O, P: BATCH_P, Q: BATCH_Q, R: BATCH_R, S: BATCH_S, T: BATCH_T, U: BATCH_U, V: BATCH_V, W: BATCH_W, X: BATCH_X, Y: BATCH_Y, Z: BATCH_Z, AA: BATCH_AA }
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
  ['DR-02', 'data-root', F.dataRoot, '所有可写命令只在测试根落盘；真实根逐字节不变；四作业接缝；临时件全落 E 盘', '批次 C'],
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
  ['PRS-01', 'preset-identity', F.presetsTwo, '任务 A 预设面（**打现役** `presets/agenia`，理由见文件头）：① 基线自证（升级前冻的 10 份预设块，逐块 `sha256 = sha256(full_text)`；改了夹具任意一个字符 ⇒ `BASELINE-SELFPROOF`）；② 不变量（今天就对）：九个 `toolName` 一个不多不少、`delegationTools` 九个键、9 条已启用委派行；③ **页面恰好 2 条**预设入口（组长 `agenia` + **恰一份**通用组员），第 3 条 ⇒ `PAGE-COUNT`；④ 九条委派行的 `agentPreset` **同值**且不悬空；⑤ 通用组员预设**不声明** `model` / `tools`（禁字段提取器另有阳性对照：塞了 model+tools 的合成块必须抓得到），组长那一份允许有 leader 级字段；⑥ 旧九份 per-role 预设**全部删除**、组长块与基线**逐字相同**（并员不许顺手改组长那份）', '批次 U'],
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
  ['CPY-01', 'review-20261102', F.cpy01, '`F2` **只读副本原地跑不动套件**（`ticket-20261102-03`）：用 `.tools/tree-at-commit.mjs --with-staging` 在 `HEAD` 导出副本，再判两件事 —— ① **副本就是那个提交 + 恰好那一层声明的追加**（**份数不写在这一行**，见本行末尾「份数口径」）：`verifyCopyIsCommit({ declared: [STAGING_ADDITION] })` 对提交里的**全部 blob**做**子集核对**（少一份 / `git blob` 不同 ⇒ 红），多出来的只准是活树 `.tools/_staging/agenia-upgrade/{preset,oracle}` 那一层且每条 sha256 与活树相同（多一条别的一律红；任何链接 / junction 一律红；不给 `declared` 时行为与从前逐字相同 ⇒ `REV-04`/`REV-05` 不受影响）—— 🔴 **份数口径（第三轮评审 `R3-2`）**：这一行原来写着一个当时的份数、`cpy01` 文件头写过另外两个，同一个量三个值打架；现在**份数不进文档**，唯一来源是那一跑的读数：提交那一侧 = `readings.cpy01.commit_tree.files_total`（`git ls-tree -r --full-tree <commit>` 的条数）、声明的追加 = `readings.cpy01.declared_staging.live_paths`（`declaredAdditionPaths()` 现算）、副本 = `readings.cpy01.copy_is_commit.files`；三者必须满足 `副本 = 提交 + 追加`，由 `CPY-FILE-COUNT-DRIFT` 判② 套件跑起来必须有的四条输入在**副本里**且与活树**逐字节相同** —— `.tools/_staging/agenia-upgrade/preset/inject.js` · `preset/agent.cordis.yml` · `preset/lib/route.mjs` · `oracle/standard.patch.yml`（`run-all.mjs:194/201/206` 与 `support/env.mjs:27-35` 的绑定）。四个红因码分开：`CPY-EXPORT-STAGING`（工具那一半）/ `CPY-STAGING-NOT-IN-COPY` / `CPY-STAGING-DIFFERS-LIVE` / `CPY-STAGING-ESCAPES-COPY`。⚠️ 这一格**不跑全量**（跑一遍要几分钟，且会把"副本缺输入"与"套件自己按活树推路径"混成一条红 —— 后者归 `F-169`），只判**副本自足**；`.tools/_staging` 在提交里的份数同时记成读数（`readings.cpy01.commit_tree.staging_paths`；它是 0 ⇒ 追加只可能来自 `--with-staging`）；**副本的自证**（第 4 关打回项 2/3）：判据只用 `PATHS.repo`（来源自报）、副本必须在运行根之下（`CPY-COPY-OUTSIDE-RUNROOT`）、副本里不许有 `.git`（`CPY-COPY-HAS-GIT`）、拿**副本自己那份** `support/root-guard.mjs` 问出的根必须是副本自己（`CPY-COPY-NOT-SELFROOT`）、四条必需输入都从副本内读；副本在这一轮里不许被动过 —— 测试侧 fingerprint 开跑/收口各一次 + 文件份数前后相同（`CPY-COPY-CHANGED`）+ 导出器 `--verify` 的 `equal:true` / `is_that_commit.ok:true`（`CPY-VERIFY-NOT-EQUAL` / `CPY-VERIFY-NOT-THAT-COMMIT`，缺字段 `CPY-VERIFY-SURFACE`）。读数里记 `git_from_copy_is_live_repo`：从副本里调 git 会走到活树 `.git`（所以这一格**不在副本里调 git**，全部 `cwd: PATHS.repo`）', '批次 Z'],
  ['CSRC-01', 'review-20261102', F.csrc01, '`F3` **容量参考线的来源格 `capacity.cap_source`**（`ticket-20261102-04`）：三级回退（工作区 / 生成器那棵树 / cwd）**各跑一次**，每个现场只有那一级有 `presets/agenia/lib/memory.mjs`（另两级一个字节都不写，`sides` 自证），三级的三份数故意不同（311/31313 · 322/32323 · 333/33333）。判：① 参考线两个数 = **赢下来那一级**那份文件里的两个数；② `capacity.count/chars` 仍是快照 `totals`（参考线 ≠ 占用）；③ `capacity.cap_source` 这一格**在**、是非空字符串、点名赢下来那份、不把没赢的几级也点进来、不与 `capacity.source`（快照）同值；④ 三个值**互不相同**（"同一个常量 / 只印第一级"当场翻红）。今天红在 ③ 的第一条：那一格不存在', '批次 Z'],
  ['CSRC-02', 'review-20261102', F.csrc02, '`F4` **第三级（cwd）单独的正样本**（`ticket-20261102-05`）：现场 = 工作区没有 `presets/agenia/lib/memory.mjs`、**生成器副本**那棵树也没有（`<copyRoot>/presets/` 整个不存在）、只有 `<copyRoot>/cwd/presets/agenia/lib/memory.mjs`（333 / 33333）在；`lib/route.mjs` 摆进工作区（否则失败停在 `E_ROUTE_SOURCE`，量不到容量那一级）。判：卡照出（exit 0 + `C2 · 验收格` + 39 key）、`capacity.cap_count/cap_chars` = cwd 那份的两个数、`capacity.count/chars` = 快照 `totals`、`capacity.state:green`、`capacity.cap_source` 点名 **cwd** 那一份且不点不在盘上的候选。🔴 红的是最后一条（那一格不存在）；前几条**今天就是绿的**，读数里照实分开记 —— 但缺了来源那一句，"cwd 给的"与"生成器那棵树给的"在卡上同形，`F4` 要的那条**单独**的绿腿不可判', '批次 Z'],
  ['BMAP-01', 'review-20261102', F.bmap01, '`F5` **委派桥的两张表要有上限 + `scope.id` 坏了也要钉住**（`ticket-20261102-06`）：`A` 动态（真跑 `inject.js` 的 `apply()`）—— 父会话放行 `team_test`，子会话第一次装配拿到 test；再把**同一子会话**装配第二次（队列已空）必须是 test。两个输入：`context.scope.id = 12345`（非字符串）与 **`id` 键缺失**（`MISSING_ID`），两次 `context.agent.id` 都是正常字符串。今天第二次装配掉回 row 5（`BRIDGE_PINNED.set` 只在 `typeof agentId === "string"` 时执行，而 `agentId = context.scope.id`）。量具自证：`contextSeen()` 证明注入器真的看到了坏形状；`BMAP-HARNESS-SCOPE` 与功能红分开报。`B` 静态 —— 读 `inject.js`：两张表的**写入点旁**必须有一个 `BRIDGE_*CAP*` 常量 + 一条淘汰动作（`delete(`/`splice(`/`clear(`/循环），`BRIDGE_CLAIMS` 那一张今天有界（回归锁：不许把它一起删）；同一只读取器喂一段合成源码必须判"有界"（阳性对照，否则它只会红、翻不了面）。为什么上限只能落在源码上：两张表都是模块内私有变量、不导出，驱动一个编出来的 N 去撑爆它等于拿编的数当判据', '批次 Z'],
  ['BDOC-01', 'review-20261102', F.bdoc01, '`F6` **`brg01` 的注释与断言文本必须描述跑着的那套匹配**（`ticket-20261102-07`，**静态文档腿**）：读 `tests/agenia-upgrade/integration/brg01-toolname-bridge.test.mjs` 全文 —— ① **必须不出现**："互相包含" / "互含" / "对不上再退回" / "对不上才退回"（每一条都带行号与"它错在哪"；只钉"包含匹配"与"对不上退回队首"这两个轴 —— `加壳` 那半句是**理由**不是判据，单独禁它会把可能仍成立的话一起判红）；② **必须出现**完整相等那一句（`完整相等` / `完全相等` / `严格相等` / `精确相等` 任一）；③ **必须出现**"对不上就不取"那一条（`/对不上[^\\n]{0,30}不取/`）。期望值钉在**实现**上（`inject.js` 的 `item.prompt === prompt` + `prompt === "" ? fresh.shift() : undefined`）：实现一变，`BDOC-IMPL-ANCHOR` 先把这条腿按红喊停 —— 那时要改的是契约，不是让文档继续追着实现漂。另记读数：同一句话在 `support/registry.mjs` 的 `BRG-07` 那一行也出现过（只扫那一行，不扫全文 —— 本批自己的注释里也写着这几个词）', '批次 Z'],
  ['FLIP-01', 'review-20261102', F.flip01, '`F7` **`BRG-07` 的翻面读数点名本提交的 `inject.js`**（`ticket-20261102-08`）：从 `brg01` 文件头那一段（`BRG-07 的翻面读数` → 头部注释结束）里取所有提到 `inject.js` 的行，判 ① **至少一行**同时给**本提交那份 `inject.js`（`HEAD:presets/agenia/inject.js` 的 blob，字节数 + sha256 都从 `cat-file` 的字节算）**的字节数与 sha256 前缀（≥8 hex）；② 标着「现役」的那几行必须都是本提交那一份（新旧两个读数并排 = 读的人分不清）；③ 同一行里 sha 与字节数不许只说对一半（"改了 sha 忘了改字节"那种半修）。读数里另记一份**盘上**那份与 `disk_equals_commit`（工作树脏不脏是读数，判据仍按提交）。⚠️ 这是一条**会过期**的判据：`inject.js` 一变它就该红 —— 那正是它的用处（读数点名的是哪一版不能靠人记）', '批次 Z'],

  // ── 批次 AA · 每日评审闸（老板 2026-11-03 09:10 定的硬门；`bug-20261103-01`）──────────────
  // 一句话：**判决报告没落盘，两份每日评审不许派**。判据钉在产物上
  // （`<内容根>/.runtime/reports/memory-update/<day>.json`），不钉 `phase` 字段。
  // 判据口径、四格、量具自证逐条写在 `integration/rgate01-daily-review-gate.test.mjs` 的文件头。
  ['RGATE-01', 'guard', F.rgate01, '每日评审闸（**生产** `presets/agenia/inject.js::dailyReviewGateVerdict`，`bug-20261103-01`）：`job_conversation_review` / `job_technical_review` 必须等**今天**的记忆判决报告落盘 —— `A` 没有 `2026-11-02` 的报告 ⇒ 两个工具**都**被 `tools.guard` 拒、码**恰好** `E_REVIEW_BEFORE_JUDGE`（且**不是**门禁里另外那几个码 `E_GUARD_*`）、报文点名 `2026-11-02` 且不点名 `2026-11-03`；`B` 种一份 `2026-11-02` 报告 ⇒ **同一个调用**（`name`/`arguments`/`agent` 逐字相同）放行、放行值必须是 `undefined`（红的合法性来源：唯一变量是那份文件在不在）；`C` 阴性对照 `team_test` 在**同一副"没有报告"的根**上照样放行；`D` **一天从本地 04:00 切**：两个钉住的时刻（本地 `2026-11-03 01:30:00` / `04:00:01`）× 三副报告现场（无 / 只有 11-02 / 只有 11-03）—— 01:30 点名 `11-02`、04:00:01 点名 `11-03`，且 11-03 的报告在切点下方**不顶用**、11-02 的报告在切点上方**不顶用**（两向一夹，整数小时的切点只能是 4）；`C2` 同一个工具显式 `run_in_background:false` ⇒ 后台硬门先拒、用**另一句话**（运行时报文不带码，码 `E_GUARD_JOB_FOREGROUND` 只活在纯函数 verdict 里，`GRD-01` 钉）—— 证明"精确码"不是碰巧、两个闸的报文分得开；`P` 夹具自证（guard 挂没挂上 `RGATE-HARNESS-GUARD` / 时钟遮没遮住 `RGATE-CLOCK-NOT-DATE` + 用完还原 / 三副根的报告现场恰好 无·11-02·11-03 / 那个时刻真的落在切点下方）。时钟由 `node:test` 的 `mock.timers`（`apis:[Date]`）钉住，`Date.now()` 与 `new Date()` 两个入口都验 —— 不钉就会随墙钟漂。⚠️ 打的是**现役**树：那道闸只在生产上，staged 靶子还没同步它（`F57-TARGET` 会照实报）', '批次 AA'],
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
   */
  'static-doc': 6, route: 8, store: 4, memory: 12, guard: 4, job: 4,
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
  'memory-update-card': 6,
  /** 批次 Z · 技术评审 2026-11-02 的 F2–F7 六张票（`ticket-20261102-03`…`-08`）——
   *  一格一张票：副本自足 / 容量来源格 / 第三级正样本 / 桥的两张表 / 匹配描述 / 翻面读数。
   *  契约见 `.team/test/2026-11-02/CONTRACT-REVIEW-20261102.md`。 */
  'review-20261102': 6,
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
  const POST_FROZEN = [...BATCH_G, ...BATCH_H, ...BATCH_I, ...BATCH_J, ...BATCH_K, ...BATCH_L, ...BATCH_M, ...BATCH_N, ...BATCH_O, ...BATCH_P, ...BATCH_Q, ...BATCH_R, ...BATCH_S, ...BATCH_T, ...BATCH_U, ...BATCH_V, ...BATCH_W, ...BATCH_X, ...BATCH_Y, ...BATCH_Z, ...BATCH_AA]
  const nonFrozen = REGISTRY.filter((r) => !POST_FROZEN.includes(r.id)).length
  if (FROZEN_IDS.length !== nonFrozen) problems.push(`冻结清单 ${FROZEN_IDS.length} 条 ≠ 登记表里批次 G/H/I/J/K/L/M/N/O/P/Q/R/S/T/U/V/W/X/Y/Z/AA 之外的 ${nonFrozen} 条（清单与表分家了）`)
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
  for (const id of [...FROZEN_IDS, ...BATCH_G, ...BATCH_H, ...BATCH_I, ...BATCH_J, ...BATCH_K, ...BATCH_L, ...BATCH_M, ...BATCH_N, ...BATCH_O, ...BATCH_P, ...BATCH_Q, ...BATCH_R, ...BATCH_S, ...BATCH_T, ...BATCH_U, ...BATCH_V, ...BATCH_W, ...BATCH_X, ...BATCH_Y, ...BATCH_Z, ...BATCH_AA]) if (!CASES_BY_ID.has(id)) problems.push(`批次清单里的 ID 不在注册表：${id}`)
  return problems
}
