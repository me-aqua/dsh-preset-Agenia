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
 * 已落笔的十二批。历史冻结的 **55 条**（A–F）见 `FROZEN_IDS`；批次 G 是 F-57 新加的那 11 条，
 * 批次 H 是门 1 回执链路四票的 4 条（2026-10-22），批次 I 是 `F-112` 剩下两格（同日），
 * 批次 J 是 `F-125` 维护案 400 字帽（同日），批次 K 是 `F-129` anchors 形状（2026-10-23），
 * 批次 L 是 `F-148` 思考链过滤（同日 · 紧急票）。
 * ⇒ `pending-write` 必须是 **0**；这条不变量由 `registryProblems()` 钉住。
 */
export const WRITTEN_BATCHES = { A: BATCH_A, B: BATCH_B, C: BATCH_C, D: BATCH_D, E: BATCH_E, F: BATCH_F, G: BATCH_G, H: BATCH_H, I: BATCH_I, J: BATCH_J, K: BATCH_K, L: BATCH_L }
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

  // ── Health / 每日状态（2）───────────────────────────────────────────────
  ['HLT-01', 'health', F.health, 'health 六场景矩阵：没开工 HOLD、运行中非绿、缺本地双评审红、完整绿', '批次 C'],
  ['HLT-02', 'health', F.health, '失败/父死不丢原因；staleVerdict 边界按 update 90 / local 45 分列且无 60', '批次 C'],

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
  review: 3, receipt: 4, health: 2, 'data-root': 3, install: 3, env: 2, read: 1,
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
  // ⚠️ G / H / I / J / K / L 都是**后加的显式批次**（不进历史冻结清单），每一批都要从这一格里排掉 ——
  //    漏一个的现象是"冻结清单 55 条 ≠ 登记表里多出来的那几条"，而真正坏掉的可能是**别处**。
  const POST_FROZEN = [...BATCH_G, ...BATCH_H, ...BATCH_I, ...BATCH_J, ...BATCH_K, ...BATCH_L]
  const nonFrozen = REGISTRY.filter((r) => !POST_FROZEN.includes(r.id)).length
  if (FROZEN_IDS.length !== nonFrozen) problems.push(`冻结清单 ${FROZEN_IDS.length} 条 ≠ 登记表里批次 G/H/I/J/K/L 之外的 ${nonFrozen} 条（清单与表分家了）`)
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
  for (const id of [...FROZEN_IDS, ...BATCH_G, ...BATCH_H, ...BATCH_I, ...BATCH_J, ...BATCH_K, ...BATCH_L]) if (!CASES_BY_ID.has(id)) problems.push(`批次清单里的 ID 不在注册表：${id}`)
  return problems
}
