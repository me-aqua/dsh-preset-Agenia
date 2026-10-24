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
 *   · `BRD-01` 三格（A 叫过开发没叫过测试 / B 从没叫过测试但文件动过 / C 叫过测试之后又动了）：
 *     判的是**注入文字**（假 ctx 上跑 staged `inject.js` 的 `apply()` → 喂 `tools/result` → 走一次
 *     `agent/pre-step` 瀑布 → 读那一步真的塞进请求的那条尾巴）；每格断言"该出现的那一句 + 不该出现的那几句"，
 *     外加进度行的前置（`BRD-STATE-SETUP`）· 阳性对照（照 §3.3 写的最小实现三格全成立）·
 *     反向刀（删掉「从没叫过测试、但文件动过」那一支 ⇒ **只有 B 格**翻红）。
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
 *
 * 契约（判断形状、CLI、JSON 字段、三份文档的针）在 `.team/test/2026-10-24/契约-F-160-判断形状.md`；
 * 定形在 `.team/leader/2026-10-24/spec-F-160.md`。⚠️ 它们**不进** `FROZEN_IDS`（历史冻结的 A–F 55 条）。
 * ⚠️ **分母 96 → 98**（两格各一条 `test()`；两格是两处**不同的红因**：副本有效 / 副本被动过）。
 */
export const BATCH_T = ['REV-04', 'REV-05']

/**
 * 已落笔的十八批。历史冻结的 **55 条**（A–F）见 `FROZEN_IDS`；批次 G 是 F-57 新加的那 11 条，
 * 批次 H 是门 1 回执链路四票的 4 条（2026-10-22），批次 I 是 `F-112` 剩下两格（同日），
 * 批次 J 是 `F-125` 维护案 400 字帽（同日），批次 K 是 `F-129` anchors 形状（2026-10-23），
 * 批次 L 是 `F-148` 思考链过滤（同日 · 紧急票），批次 M 是 `F-152` 板子三态（同日），
 * 批次 N 是 `F-155` 每日状态的两端与署名（同日），批次 O 是 `F-156` 三个本地节点的三态（同日），
 * 批次 P 是 `F-158` 一天从 04:00 切（2026-10-24），批次 Q 是 `F-156` 第二轮锚点闸的三条规则（同日），
 * 批次 R 是 `F-163` 平台版本读数的自证（同日）。
 * 批次 S 是 `F-162` 的两半（`RCP-05` 回执三件套进 `local-mark` / `HLT-03` 卡的第二半，同日）。
 * 批次 T 是 `F-160` 评审对象是**派工那一刻的提交**（`REV-04` 副本有效 / `REV-05` 副本被动过就作废，同日）。
 * ⇒ `pending-write` 必须是 **0**；这条不变量由 `registryProblems()` 钉住。
 */
export const WRITTEN_BATCHES = { A: BATCH_A, B: BATCH_B, C: BATCH_C, D: BATCH_D, E: BATCH_E, F: BATCH_F, G: BATCH_G, H: BATCH_H, I: BATCH_I, J: BATCH_J, K: BATCH_K, L: BATCH_L, M: BATCH_M, N: BATCH_N, O: BATCH_O, P: BATCH_P, Q: BATCH_Q, R: BATCH_R, S: BATCH_S, T: BATCH_T }
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
                                          : null

const F = {
  composition: 'static/composition.test.mjs',
  docs: 'static/docs.test.mjs',
  roles: 'static/roles.test.mjs',
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
  ['HLT-01', 'health', F.health, 'health 六场景矩阵：没开工 HOLD、运行中非绿、缺本地双评审红、完整绿', '批次 C'],
  ['HLT-02', 'health', F.health, '失败/父死不丢原因；staleVerdict 边界按 update 90 / local 45 分列且无 60', '批次 C'],
  ['HLT-03', 'health', F.hlt03, 'F-162 **卡的第二半**（判真实卡那一扇门 `agenia-local.mjs --op health` → `healthVerdict` → `buildHealthCard` → `<工作区>/.team/brain/<day>/health.json`，**不是**脑侧 `health-read`）：A `technical` 已 `done` + 回执在盘上、三个锚点缺一个（`receipt_sha256` 是 null）⇒ `RED E_RECEIPT_ANCHOR`（**不许**报 `E_RECEIPT_MISSING`）· B 只齐一个锚点 ⇒ 同一个 `E_RECEIPT_ANCHOR`（"1–2 个"两个方向都量）· C 盘上没有回执 ⇒ `RED E_RECEIPT_MISSING` · D 三个锚点全齐 + 回执在盘上 ⇒ `GREEN`（阳性对照）—— 四条另判 `progress` 3/3 与 `receipt:true/false`、盘上那张卡与 stdout 同一句话（status + reasons）、`paths.local`/`paths.receipt` 给出处、读面零写入（状态文件 SHA256 前后相同）；另判两个分支**不许合并**（`E_RECEIPT_ANCHOR` ≠ `E_RECEIPT_MISSING`）', '批次 S'],

  // ── 门 2 · `F-160` 评审对象是提交（2）：活树动了不算你的事 / 副本动了就是（2026-10-24）──────────
  ['REV-04', 'review', F.rev04, 'F-160 **评审对象 = 派工那一刻的提交**（活树在窗口里动了 ⇒ 本轮仍然有效）：夹具仓库（两次提交、钉住哈希）+ 导出器落只读副本 —— 副本逐份 `git blob` SHA-1 = 该提交、路径集合一致、里面没有 `.git`，副本的 CODE 指纹 = 卡片上的 `before_sha256`（提交侧从 git 对象独立算出来的那个数，两条路必须同一个）；窗口里动**活树**两处（改 `lib/alpha.mjs` + 加 `lib/added-by-other-role.mjs`，都进 CODE 名单）⇒ **副本前后 `equal:true`（本轮有效）**、活树前后 `equal:false`（**旧口径会作废这轮好评审** —— 今天红的就是这条）；校验模式自己复算 ⇒ `equal:true` · `is_that_commit.ok:true` · 活树动了 **2** 处（**不是**"副本 vs 活树的分歧"：真仓库今天 135 份提交 vs 192 份活树，分歧 57 ⇒ 按分歧报 = 读数撒谎）；没给活树基线 ⇒ 变动数**判不了**（`null` + 一句说法，不许读成 0）；同一个 `--out` 再导一次必须拒（读数不许原地覆盖）；另加真仓库里钉住的提交 `8b7cea6…` 那一段（副本仍必须是它、CODE 指纹仍必须对得上）；外加三份载体上的针：作业书「必读输入清单」的代码根那一行 + 「地基」一节（副本 / 活树不在本轮 / 你得报一句）+ `leader.md` 第三步（`rev-parse` / 副本 / `before_sha256`）+ `CONTRACT.md` 的 `F-160` 那一句', '批次 T'],
  ['REV-05', 'review', F.rev05, 'F-160 **同一把尺子的反方向：评审自己动了副本 ⇒ 本轮作废**（单因：活树一个字节不动）：改副本里一份 CODE 文件 ⇒ 副本前后 `equal:false`、`changed[]` 恰好那一份、活树前后 `equal:true`（证明翻面只来自副本）；校验必须自己复算 ⇒ `equal:false`（**不许照抄卡上的值**——卡上还写着派工那一刻的数）+ `is_that_commit.ok:false` 并**点名**那一份文件；再拿**另一个提交**去核一份干净的副本 ⇒ `equal:true`（副本确实没动）但 `is_that_commit.ok:false` —— 两条腿互相独立，只比哈希的实现会在这一格上"绿得看不出来"；外加量具自证（副本上"盘上那一条路"与 `.tools/fingerprint.mjs` 必须是同一个数）', '批次 T'],

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
  ['SURF-02', 'surface-declared', F.surf02, 'F-112② inject.js 兜底名单的注释与常量是同一个名单：注释块里必须有 `@roster` 机读声明（散文不算声明、没有它 ⇒ 红并点名那份兜底）+ 与常量逐项一致（说"不在"的不许在、说"在"的必须在；点名 key + 两处行号）+ 不许沉默（memory/style 必须表态）+ 常量不许零读点 + 十四组控制面', '批次 I'],
  ['SURF-03', 'surface-declared', F.surf03, 'F-112① 补格：注入面声明的每一份 .md 不许是空壳（去掉空白后必须非空：1 字节 / 只剩空白 / 只有 BOM ⇒ 红并点名；读不出正文也点名；缺一份不归这一格）+ 九组控制面（含 CRLF 2 字节那一格）', '批次 I'],

  // ── 门 1 · `F-125` 正文 400 字帽（3）：同一个上限只挂在一条入口上就等于没有（2026-10-22）──────
  ['MTC-01', 'maintenance-cap', F.mtc, 'F-125 `payload.entry.text`：401 字必拒（码带 TOO_LONG 且已登记；报文给 401/400/位置）/ 400 字必过 · BOM 与 CRLF 归一后 400 也算过（同一把 `charCountOf`）· **两条导入 CLI 同两格**：`--op maintenance-import` 与 `--op proposal-import` 各导一次，401 ⇒ exit 2 且池子零写入、400 ⇒ exit 0 且恰好追加一行（正文仍是 400 字）', '批次 J'],
  ['MTC-02', 'maintenance-cap', F.mtc, 'F-125 `payload.engine_ops[].entry.text`：401 必拒 / 400 必过 · 超长那条在第二位也要被抓（不许只看第一条）· 纯 retire 案（无正文）不许被误伤 · 两处都超也拒 · 真 CLI 同两格外加零写入', '批次 J'],
  ['MTC-03', 'maintenance-cap', F.mtc, 'F-125 阳性对照（旧**工具**面，不是导入面）：普通候选 401 字**仍然**被 `proposal_file` 拒（码 = `E_PROPOSAL_TOO_LONG` 且已登记；报文给 401/400）· 400 过 · BOM/CRLF 归一后 400 也过 · 主路拒时零写入、400 时追加一行 —— 两把闸不互相顶掉', '批次 J'],

  // ── 门 2 · `F-129` anchors 形状（1）：没给与给错了必须分开（2026-10-23）─────────────────
  ['ANC-01', 'anchors-shape', F.anc01, 'F-129 `codeFingerprintVerdict` 的 anchors 八格：非对象（64 hex 字符串 / 数组 / 数字 / 布尔）· 短哈希 · 一半坏（**第二项**是 `xyz` / `null` / 空串 —— `null` 是"给了但形状不对"，`undefined` 才是"没给"）· 坏值（`42` / `false`，另有 `{SHA_A, false}` 让第二项真被读到）⇒ 拒 `E_ARG_SCHEMA`；`null` / 省略 / **对象在但一项都没给**（`{}` · 两项都 `undefined`，第三态与 `null` 同形：同一段结论含「判不了」、前缀各自不同）⇒ `ok:true` **且 `detail` 非空、写明"判不了"**（契约 §6.3 ⑧；这一支单独一个红因 `ANCHORS-NULL-DETAIL-SILENT`）；全对 · 只给一项（`{before_sha256: SHA_A}`）⇒ `ok:true` 且 **`detail` 必须是空串**（判过了却写"判不了" ⇒ `ANCHORS-GOOD-DETAIL-CAVEATED`）；真对不上 ⇒ 仍 `E_CODE_FINGERPRINT_MOVED`；**次序**（坏 `fp` + 非对象 `anchors` ⇒ 必须报 `fp` 那条，红因 `ANCHORS-ORDER-SWAPPED`）—— 外加阳性对照（照契约写的最小实现八格全成立）与三把反向刀（删掉「非对象就报错」那一行 ⇒ 只有 S0 翻面；挖空 REF 里三态共用的「判不了」⇒ G1 四形一起翻红；给"判过"那一侧加 caveat ⇒ G2 两形一起翻红；后两把另有 `KNIFE2-PARTIAL` / `KNIFE3-PARTIAL` 抓"只翻一部分"）', '批次 K'],

  // ── 门 2 · `F-148` 思考链过滤（3）：把碎片挡在落盘之前（2026-10-23 · 紧急票）──────────────
  ['RFG-01', 'reasoning-filter', F.rfg01, 'F-148 `lib/reasoning-filter.mjs`：单元表七行（汉字 1 / 英文单词 1 / emoji 1 / 阿拉伯数字 1 / 特殊字符 1 / 空白 0 / 标点 0）+ `P0` 逐字 + 四条易踩口径（`·`/`_`/`#`/`/` 计 1 · `-` 计 0 · 反引号计 1 · `~~~` 不当围栏）· 3 与 4 的边界 · `\\r\\n` 归一 · 空段落也删 · `\\n` 重建口径 · 代码块例外六格（围栏行 / 围栏内 / 围栏外 / 未闭合 / 跨 delta / 带语言标记）· `push`+`flush` 与批式**逐字节等价**（含一字符一切、`\\r` 与 `\\n` 跨 delta）· 两个 filter 不共享状态 · `MIN_UNITS === 3` —— 外加阳性对照（照契约写的最小实现全格成立）、反向对照（什么都不做 ⇒ 该删的格必须红）与反向刀（删掉围栏状态机那两行 ⇒ 只有围栏格翻面）', '批次 L'],
  ['RFG-02', 'reasoning-filter', F.rfg02, 'F-148 `inject.js` 的 `llm/stream` 监听器（**delta 层**）：`apply()` 之后**恰好一条** · 调用它**同步**拿到 AsyncIterable（`dsh-agent-loop` 是 `for await (… of llm.stream(request))`，返回 Promise 会 TypeError）· `next()` 恰好一次 · `reasoning-delta` 的文本被过滤（半行 + 围栏被拆在多个 delta 里 · 末段靠 `flush()` 吐尾巴）· 其它 chunk（正文 / 工具调用 / usage / finish）**同一个对象、同一次序、一个不少** · `index` 逐个保留 · 过滤时抛错 ⇒ **不冒到流上** + 出事的 chunk 原样吐出 + 后面的照旧过滤 + `console.error` 只一次 —— 外加阳性对照（照 §10.5 写的最小接缝六格全成立）与反向刀（删掉那对 `try`/`catch` ⇒ 只翻 S6）', '批次 L'],
  ['RFG-03', 'reasoning-filter', F.rfg03, 'F-148 **落盘的那一份**（`block-end` 的 reasoning 载荷，`dsh-llm/lib/index.js:1020-1021` 的「载荷优先」）：真适配器形状（`block-start` → 若干 `reasoning-delta`（含 ≤3 与 ≥4 单元的段）→ `block-end`（`block.text` = 那些 delta 的**未过滤拼接**）→ `usage` → `finish`）**装配之后**该 index 的 reasoning `text` 必须等于手写的清洗结果 · **只有 `block-end`、一个 delta 都没有**的形状也得清 · 尾巴（末段没有换行）必须排在**第一条 `finish` 之前**、`finish` 之后不许再有 `reasoning-delta` · `block-end` 的 **text 块**载荷一个字节不许动 —— 外加三条量具自控（`A-PREF` 载荷赢 / `A-ACC` 无载荷按 delta 累加 / `A-IGN` `block-end` 后被忽略；坏了报 `ASSEMBLER-RECOMPUTE`）、阳性对照（照 §10.5 写的最小接缝四格全绿）与两把刀（删载荷改写 ⇒ 只翻 A1/A2；删 `finish` 前 flush ⇒ 只翻 A3）', '批次 L'],

  // ── 门 2 · `F-152` 板子三态（1）：同一个句子里两种「没验过」必须说两句话（2026-10-23）──────
  ['BRD-01', 'board-states', F.brd01, 'F-152 板子告警三态（判**注入文字**：假 ctx 上跑 staged `inject.js` 的 `apply()` → 喂 `tools/result` → 走一次 `agent/pre-step` 瀑布 → 读那一步真的塞进 `decision.messages` 的尾巴）：A 叫过开发、从没叫过测试、文件没动 ⇒ 「⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。」（逐字）；B 从没叫过测试、项目文件动过一次 ⇒ 一句**新的**话，必须说明"文件改/动过 + 一次测试都没叫过"，且**不许**出现「最后一次测试之后」「那次测试作废」「叫过开发」—— **同一个格子两条输入**（B1 外聘叫过 / B2 开发叫过；组长 2026-10-23 拍板：「从没叫过测试」优先于「测试之后又动了」，红因点名是哪一条输入）；C 叫过测试之后又动过一次 ⇒ 「⚠️ 最后一次测试之后，项目文件又动过 1 次 —— 那次测试作废，要重测。」（逐字）—— 每格另判板子**进度行**的前置（`BRD-STATE-SETUP`）与"板子整段没贴"（`BRD-NO-BOARD`）；外加阳性对照（照 §3.3 写的最小实现三格每条输入全成立）与反向刀（删掉「从没叫过测试、但文件动过」那一支 ⇒ **只有 B 格的每一条输入**翻红，`KNIFE-WRONG-VECTOR` 抓多翻/少翻）', '批次 M'],

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
  'static-doc': 6, route: 8, store: 4, memory: 12, guard: 3, job: 4,
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
  // ⚠️ G / H / I / J / K / L / M / N / O / P / Q / R / S / T 都是**后加的显式批次**（不进历史冻结清单），每一批都要从这一格里排掉 ——
  //    漏一个的现象是"冻结清单 55 条 ≠ 登记表里多出来的那几条"，而真正坏掉的可能是**别处**。
  const POST_FROZEN = [...BATCH_G, ...BATCH_H, ...BATCH_I, ...BATCH_J, ...BATCH_K, ...BATCH_L, ...BATCH_M, ...BATCH_N, ...BATCH_O, ...BATCH_P, ...BATCH_Q, ...BATCH_R, ...BATCH_S, ...BATCH_T]
  const nonFrozen = REGISTRY.filter((r) => !POST_FROZEN.includes(r.id)).length
  if (FROZEN_IDS.length !== nonFrozen) problems.push(`冻结清单 ${FROZEN_IDS.length} 条 ≠ 登记表里批次 G/H/I/J/K/L/M/N/O/P/Q/R/S/T 之外的 ${nonFrozen} 条（清单与表分家了）`)
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
  for (const id of [...FROZEN_IDS, ...BATCH_G, ...BATCH_H, ...BATCH_I, ...BATCH_J, ...BATCH_K, ...BATCH_L, ...BATCH_M, ...BATCH_N, ...BATCH_O, ...BATCH_P, ...BATCH_Q, ...BATCH_R, ...BATCH_S]) if (!CASES_BY_ID.has(id)) problems.push(`批次清单里的 ID 不在注册表：${id}`)
  return problems
}
