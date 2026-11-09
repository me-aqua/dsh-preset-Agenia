/**
 * 稳定错误码表 —— 三支 CLI、健康判定、测试断言**共用同一份**。
 *
 * 冻结依据：接口冻结提案 v1 §B1.4（退出码表）/ §B1.7（码名规则 `E_<域>_<理由>`）/ §B1.8，
 * 以及追加裁定 v1.3 的退出码族：
 *   2 用法/参数 · 3 路径与隔离 · 4 并发/锁/CAS · 5 校验拒绝 · 6 状态与不变量 · 7 数据缺失/损坏 · 8 内部错误
 *
 * 追加裁定 **v1.10 ②** 补冻两个派生码：`E_ARG_SCHEMA` ⇒ **2** · `E_TXN_IO` ⇒ **4**
 * （"入参不成形状"与"打包 IO 失败"两处调用它们；值就是下面表里那两个，别处不许再写一份）。
 * 🔴 `E_PACKET_*` 那五个（`MANIFEST` / `FRAMES` / `CONTENT_SHA` / `WINDOW` / `EXCLUDE`）**原先不在本表**：
 *    它们是 `lib/packet.mjs` 里 `validateSessionPacket` 的**返回码**，不是 CLI 退出码（v1.10 ② 明写"不许混"）。
 *    **2026-10-15 起有 CLI 暴露它们了**（`bin/agenia-brain.mjs --op session-packet`）⇒ 按那条规矩
 *    **同批搬进本表**：码名从 `lib/packet.mjs` 的 `PACKET_CODES` **取值**（不再抄一遍），这里只补退出码。
 *    ⚠️ 不搬的后果是"稳定码变 `E_INTERNAL`"——CLI 的 catch 只认本表里的码，别的全折成内部错误，
 *    于是"包坏了"和"程序有 bug"在报文里长得一模一样。
 *    （第六个 `E_PACKET_TOO_LARGE` —— 解压总量超过上限，F-144 2026-10-23 —— 走同一条：码名在
 *    `PACKET_CODES`，退出码 5 在本表。）
 *
 * 域：ARG|ROOT|PATH|LOCK|CAS|TXN|STATE|DATA|CAP|STREAK|CS|JOB|CLAIM|FENCE|COVERAGE|RECEIPT|
 *     TICKET|EVIDENCE|STAGE|TASK|ROUTE|GUARD|INSTALL|MANIFEST|PACKET|SCAN|PROPOSAL|MAINTENANCE|INTERNAL
 *
 * 两条纪律：
 *   ① 码名与退出码**不许**在两处各写一份 —— CLI 取 `CODES[code].exit`，测试读 `FROZEN.exitCodes`，
 *      两边对不上就是红（提案 §B1.7 最后一条）。
 *   ② 这个文件里**没有**逻辑，只有表：谁都不许在这儿塞副作用。
 *
 * ⚠️ **回执覆盖那一族（C-6）的键名不写在本文里**：C-6 把它冻成"只由 `lib/receipt.mjs` 的回执写入函数
 *    产生"，全树扫描（RCP-01 ⑤）按**字面量**判，所以那一行的键名从 `lib/receipt.mjs` 取
 *    （`RECEIPT_CODES`），本文件只做汇总 —— 退出码的值仍只在这一处。
 */
import { RECEIPT_CODES } from './receipt.mjs'
import { PACKET_CODES } from './packet.mjs'

/**
 * 会话包那一族码 ⇒ **退出码 5（校验拒绝）**。
 * 码名**从 `lib/packet.mjs` 取**（`PACKET_CODES` 才是它们唯一的一份），这里只补"CLI 该退几"。
 * ⚠️ 它们都是"校验没过 / 这份包不该出"：包不合法、或者"你让我读这么多"超过上限，都该停
 *    —— 不是数据缺失（7），也不是内部错误（8）。
 * 🔴 `E_PACKET_TOO_LARGE`（F-144，2026-10-23）必须在本表里：没登记的码会被 CLI 的 catch
 *    折成 `E_INTERNAL` ⇒ "包太大"与"程序有 bug"在报文里长得一模一样。
 */
const E_PROPOSAL_CONTROL_CHAR_CODE = 'E_PROPOSAL_CONTROL_CHAR'
const PACKET_EXIT = Object.freeze({
  [PACKET_CODES.MANIFEST]: { exit: 5, zh: '会话包的 manifest 不合（v1.5 的字段表：缺字段 / 形状错 / schema 不是 agenia.session-packet/1）' },
  [PACKET_CODES.FRAMES]: { exit: 5, zh: '会话包的帧读数不合（坏帧 / 截断 / 逐帧实解字节与落盘文本对不上 / 字符数对不上）' },
  [PACKET_CODES.CONTENT_SHA]: { exit: 5, zh: '会话包 content.jsonl 的字节 sha256 与 manifest.content_sha256 不一致' },
  [PACKET_CODES.WINDOW]: { exit: 5, zh: '会话包的评审窗口不合（from/to 不是 ISO8601，或 from 比 to 还晚）' },
  [PACKET_CODES.EXCLUDE]: { exit: 5, zh: '会话包的排除项不合（不在 other_project / self_review / outside_window 三类里）' },
  [PACKET_CODES.TOO_LARGE]: { exit: 5, zh: '会话包的解压总量超过生效上限（AGENIA_PACKET_MAX_BYTES；details 带 session_count / out_bytes / limit）—— 整份拒，不截断' },
})

/** 退出码族（只作可读常量；表里每个码自带数字）。 */
export const CODES = Object.freeze({
  // F-165：正文里出现控制字符（只放行 LF）。入口一律拒，不替谁洗。
  [E_PROPOSAL_CONTROL_CHAR_CODE]: { exit: 2, zh: '正文里有控制字符（只放行 LF）——入口不收' },
  // ── 2 用法 / 参数 ─────────────────────────────────────────────────────────
  E_USAGE: { exit: 2, zh: '用法错误：参数形状、未知 op、缺少必填项' },
  // v1.10 ② 补冻：入参不成形状（必填缺失 / 类型不对 / 枚举越界）也归这一族。
  E_ARG_SCHEMA: { exit: 2, zh: '入参 schema 不合（必填缺失 / 类型不对 / 枚举越界）' },
  E_ARG_HASH: { exit: 2, zh: '哈希形状或内容不符（64 hex、内容 SHA 对不上）' },
  E_ARG_USAGE: { exit: 2, zh: '调用方用法错误（缺必需上下文，例如删除前没给 runRoot）' },

  // ── 3 路径与隔离 ─────────────────────────────────────────────────────────
  E_ROOT_MISSING: { exit: 3, zh: '根路径缺失（省略或空串）' },
  E_ROOT_RELATIVE: { exit: 3, zh: '根路径必须是绝对路径' },
  E_ROOT_REAL_BRAIN: { exit: 3, zh: '根路径落在（或包住了）真实根 —— 任何测试与演练都不许碰' },
  E_ROOT_C_DRIVE: { exit: 3, zh: '根路径不许在 C 盘' },
  E_ROOT_UNC: { exit: 3, zh: '根路径不许是 UNC' },
  E_ROOT_NO_MARKER: { exit: 3, zh: '测试模式的根必须带 .agenia-test-root 标记' },
  E_ROOT_OUTSIDE: { exit: 3, zh: '根路径越界（不在允许的父目录之下）' },
  E_PATH_ESCAPE: { exit: 3, zh: '目标路径逃出了基准目录（`..` 穿越 / 绝对逃逸）' },

  // ── 4 并发 / 锁 / CAS ────────────────────────────────────────────────────
  E_LOCK_HELD: { exit: 4, zh: '锁被活着的持有者占着' },
  E_LOCK_STALE: { exit: 4, zh: '锁是僵锁（持有者已死或过期）—— 不静默抢写，要显式 --force-recover' },
  E_CAS_STALE: { exit: 4, zh: 'CAS 失败：调用方带的版本与当前不符（绝不覆盖）' },
  // v1.10 ② 补冻：打包 IO 失败（临时件/改名重试耗尽）也归事务族，与锁 / CAS 同码。
  E_TXN_IO: { exit: 4, zh: '原子写/rename 重试耗尽（Windows 上 EPERM/EBUSY）' },
  E_TXN_TOKEN: { exit: 4, zh: '事务 token 不匹配（旧 attempt 的 token 已失效）' },

  // ── 5 校验拒绝 ───────────────────────────────────────────────────────────
  E_EVIDENCE_MISSING: { exit: 5, zh: '老板门槛要关当前阶段却没有 evidence' },
  E_EVIDENCE_TRANSCRIBED: { exit: 5, zh: 'evidence 是"老板同意了"式转述，不是原话/动作' },
  E_EVIDENCE_TIME: { exit: 5, zh: 'evidence 的时间形状不合（ISO8601 带偏移，或本轮历史的 null+note）' },
  E_EVIDENCE_NOT_MATCH: { exit: 5, zh: 'evidence 属于另一阶段/另一次切换，或来源时间不匹配' },
  E_EVIDENCE_USED: { exit: 5, zh: '同一份 evidence 被第二次使用（唯一性键命中）' },
  E_EXIT_CRITERIA: { exit: 5, zh: 'exit_criteria 未满足就要切阶段' },
  E_STAGE_NAME_FORGED: { exit: 5, zh: '大阶段名撞五关词（bare / 仅空白 / 仅"阶段"后缀）' },
  E_STAGE_MULTI_CURRENT: { exit: 5, zh: '同一时刻出现多个 current 阶段' },
  E_TASKS_OPEN: { exit: 5, zh: '还有未结任务就要切阶段' },
  E_OP_INVALID: { exit: 5, zh: '记忆 op 非法（未知 kind / id 不存在 / add 重复 / merge 冲突 / typeId 非法）' },
  E_REDO_NOT_AUTHORIZED: { exit: 5, zh: '手动重做缺老板点名证据（previous_attempt_id + boss_redo_evidence 缺一不可）' },
  E_TASK_STAGE_MISMATCH: { exit: 5, zh: '任务与当前阶段不匹配' },
  E_TASK_MULTI_CURRENT: { exit: 5, zh: '出现多个 current 任务' },
  E_TASK_NOT_FOUND: { exit: 5, zh: '任务不存在' },
  E_TICKET_SOURCE_BAD: { exit: 5, zh: '票的来源形状不合（要能指到报告与 finding）' },
  E_TICKET_DUP: { exit: 5, zh: '同一来源的票重复开' },
  E_TICKET_NOT_FOUND: { exit: 5, zh: '票不存在' },
  E_TICKET_STATUS: { exit: 5, zh: '票状态字段不合法' },
  E_TICKET_TRANSITION: { exit: 5, zh: '票的非法状态转移（open→done 必须为假，关票要证据）' },
  E_TICKET_EVIDENCE_MISSING: { exit: 5, zh: '关票缺关闭证据（kind/ref/sha256 三样）' },
  E_TICKET_VOID_REASON: { exit: 5, zh: 'void 缺原因，或原因空泛' },
  E_TICKET_VOID_REPRESENT: { exit: 5, zh: 'void 缺重呈现位置（re_present）' },
  E_COVERAGE_MISSING: { exit: 5, zh: '回执漏了 findings 里的条目' },
  E_COVERAGE_DUP: { exit: 5, zh: '回执里同一条 finding 出现多次' },
  E_COVERAGE_EXTRA: { exit: 5, zh: '回执里出现了 findings 里没有的条目' },
  E_COVERAGE_TICKET: { exit: 5, zh: 'adopted 的票不存在 / 票的来源对不上报告 / 票无验收' },
  E_COVERAGE_REASON: { exit: 5, zh: 'rejected 缺具体原因（≥10 字，不许泛泛"不做"）' },
  E_RECEIPT_HASH: { exit: 5, zh: '回执/报告的锚点哈希对不上（findings 那条独立锚点）' },
  // 回执覆盖那个码：键名从 `lib/receipt.mjs` 取（C-6 —— 它的产生面只有那一个文件）。
  ...RECEIPT_CODES,
  // 会话包那五个码：键名从 `lib/packet.mjs` 取（同一条道理 —— 产生面只有那一个文件）。
  ...PACKET_EXIT,
  E_CS_UNCONFIRMED: { exit: 5, zh: '常识改了却没有老板确认' },
  E_CS_CHANGED: { exit: 5, zh: '判决运行中常识又变了 ⇒ 拒提交' },
  // ⚠️ 这两个容量码：**判决那条路径已经不再发出它们**（F-71，老板 2026-10-18 —— 容量是读数，不是闸）。
  //    定义**留着**，给历史调用方认（旧日志 / 旧回执 / 旧的 `E_CAP_*` 判断仍然认得出这两个键）。
  E_CAP_COUNT: { exit: 5, zh: '长期记忆条数超过参考线 200' },
  E_CAP_CHARS: { exit: 5, zh: '长期记忆字符数超过参考线 80000（2026-10-18 起；原 60000）' },
  E_STREAK_NOT_ELIGIBLE: { exit: 5, zh: '斩杀目标不在 N 的资格集合里（连续双低 K=3 才够格）' },
  E_FENCE_STALE: { exit: 5, zh: '导入 fence 过期（基准快照 / update_generation / review_attempt 对不上）' },
  E_JOB_FENCE_STALE: { exit: 5, zh: '作业侧 fence 过期（旧 attempt 的作业结果不许回写）' },

  // ── 任务 B · bug 系统（2026-11-01，契约 `.team/test/CONTRACT-B.md` §9.3）─────────
  // 七个新码，**全是"校验类拒绝" ⇒ 5**（同族：`E_TICKET_*` / `E_COVERAGE_*` 都是 5）。
  // 🔴 为什么必须进这张表：`bin/agenia-route.mjs` 的 catch **只认表里的码**，漏登记 ⇒ 被折成
  //    `E_INTERNAL` ⇒「该拒」与「程序有 bug」在报文里长得一模一样（`BUG-02` / `BUG-03` / `BUG-04`
  //    各有一格盯这件事）。测试侧 `support/env.mjs::FROZEN.exitCodes` 已先落好（值 = 5），
  //    两边重叠部分必须逐项相同。
  E_BUG_ROUTE_NOT_APPLICABLE: { exit: 5, zh: '老板报的 bug 被塞进五分支表（定形 §4.1：按「现象 + 证据」登记，不适用此表）' },
  E_BUG_ARCHIVE_OPEN: { exit: 5, zh: '归档了一条没有结论的条目（只搬带 disposition 的；簿上 live 段只留没结论的）' },
  E_BUG_SEVERITY_THIRD_LINE_UNGROUNDED: { exit: 5, zh: '判「读数说假话」却没点名它掩盖了前两条里的哪一条（第三线必须有地基）' },
  E_BUG_SEVERITY_ESCALATE_MISSING: { exit: 5, zh: '严重线"判不了" / unclassified 却没升级（必须 escalate + 卡红，不许静默保留 open）' },
  E_BUG_WRITER_ROLE: { exit: 5, zh: '跨角色写（测试岗写线决定 / 组长写严重度 / 测试岗写处置 —— 两个作者各一个事实）' },
  E_BUG_SAMPLE_LATE: { exit: 5, zh: '样本的 registered_at 晚于它判的那次评估（样本必须事故前预注册）' },
  E_BUG_SAMPLE_REJUDGE: { exit: 5, zh: '换了样本版本再判同一条 entry（改样本 = 版本 + 旧样本留档；改后不许重判）' },

  // ── 任务 C1 · 路线账本（2026-11-01，契约 `.team/test/CONTRACT-C1.md` §9.3）──────────
  // 十三个新码，**全是"校验类拒绝" ⇒ 5**（同族：`E_TICKET_*` / `E_BUG_*` 都是 5）。
  // 🔴 为什么必须进这张表：`bin/agenia-route.mjs` 的 catch **只认表里的码**，漏登记 ⇒ 被折成
  //    `E_INTERNAL` ⇒「该拒」与「程序有 bug」在报文里长得一模一样（`LED-05` / `BUG-03` 各有一格盯它）。
  //    测试侧 `support/env.mjs::FROZEN.exitCodes` 已先落好（值 = 5），两边重叠部分必须逐项相同。
  /** `admitTask` 的六个拒码：四种模式 × 三种工作种类，拒的理由至少六种（契约 §7）。 */
  E_ADMIT_UNINITIALIZED: { exit: 5, zh: '未建账（没有路线账本）⇒ 拒一切修任务与实现任务（只能登记）' },
  E_ADMIT_HEADLINE: { exit: 5, zh: 'headline 空 ⇒ 拒实现任务（先补第一行）' },
  E_ADMIT_KIND: { exit: 5, zh: '这个模式不收这种工作（两期互斥：哪个期收哪种工作）' },
  E_ADMIT_SET: { exit: 5, zh: '不在当前集合里 / 集合是空的（maintain 读 batch · build-paused 读 pause set）' },
  E_ADMIT_MODE: { exit: 5, zh: '模式不在四值闭集里（`paused` 是任务状态，不是模式）' },
  E_ADMIT_ENTRY: { exit: 5, zh: 'bug 修必须点名一条 entry（不点名就不知道修的是哪一条）' },
  E_LEGACY_STORE_BAD: { exit: 5, zh: 'legacy 票店形状不对 / 重复票号 / 状态越界 ⇒ 拒，零写入' },
  E_PAUSE_SESSION_LIVE: { exit: 5, zh: '暂停时还有没声明"已停"的活会话 ⇒ 拒（停不下来 ⇒ 暂停失败）' },
  E_PAUSE_NOT_SUPPORTED: { exit: 5, zh: '`(maintain, pause)` 拒 —— maintain 不支持暂停，不静默忽略' },
  E_RESUME_NOT_PAUSED: { exit: 5, zh: '不在 `build-paused` 时 resume ⇒ 拒（不许静默成功）' },
  E_STAGE_SESSION_LIVE: { exit: 5, zh: '切阶段那一刻还留着活会话 ⇒ 拒（先停会话再 stage-enter）' },
  E_TICKET_LIVE_TASK: { exit: 5, zh: '有 live task 的票不许 void（先取消任务）' },
  // ⚠️ 与上面五个 guard 码同族：它是**工具调用层**的拒绝码（派工门禁在 spawn 前拒），不是 CLI 退出码；
  //    给 5 只为让 `CODES[code].exit` 有确定值。
  E_GUARD_SLOT_BUSY: { exit: 5, zh: '槽被占（单写者：一个工作区同时最多一个工作写）' },

  // ── 6 状态与不变量 ───────────────────────────────────────────────────────
  E_STATE_PHASE: { exit: 6, zh: '当前 phase 不允许这个动作' },
  E_STATE_TYPE_CAP: { exit: 6, zh: '对象里出现了逐类硬帽字段（四类不设硬帽）' },
  E_CLAIM_HELD: { exit: 6, zh: '同一节点已被 claim（两场并行也只能各占各的节点）' },
  E_CLAIM_MIXED: { exit: 6, zh: '把另一场的维护案 fence 混进了本地场' },
  E_CLAIM_NOT_FOUND: { exit: 6, zh: 'claim 不存在' },

  // ── 7 数据缺失 / 损坏 ────────────────────────────────────────────────────
  E_DATA_EXISTS: { exit: 7, zh: '数据已存在（init 只在空根成功）' },
  E_DATA_MISSING: { exit: 7, zh: '数据不存在（不许返回一个像样的空结果）' },
  E_DATA_CORRUPT: { exit: 7, zh: '数据损坏（半截 JSON、字段缺失）' },
  E_ROUTE_MISSING: { exit: 7, zh: '路线文件不存在' },
  E_ROUTE_TAMPERED: { exit: 7, zh: '路线被外部改写（current 的 SHA 对不上审计末条）' },
  E_ROUTE_HALF_WRITTEN: { exit: 7, zh: '路线文件半写（原子写没走完）' },
  E_ROUTE_EXISTS: { exit: 7, zh: '路线已初始化过（提案 §B1.4 route init 的主要错误码）' },
  E_JOB_UNKNOWN: { exit: 7, zh: '作业记录不存在（提案 §B1.4 job-mark 的主要错误码）' },

  // ── 8 内部错误 ───────────────────────────────────────────────────────────
  E_INTERNAL: { exit: 8, zh: '内部错误（实现自己的 bug，不是入参问题）' },

  // ── 安装 / 回滚 / 发布扫描（提案 §B1.8 点名 E_MANIFEST_*）──────────────────
  E_MANIFEST_MISSING: { exit: 7, zh: '安装清单/备份缺失（回滚找不到可用的那一份）' },
  E_MANIFEST_MISMATCH: { exit: 5, zh: '清单里的哈希与磁盘不符（发布物被改过）' },

  // ── guard（住在 inject.js；码名在这里留一份，供文档与断言共用）───────────
  // ⚠️ 这五个不是 CLI 退出码：它们是**工具调用层**的拒绝码（guard 在启动子代理前拒）。
  //    给 5 是"校验拒绝"族的归口，只为让 `CODES[code].exit` 有确定值。
  E_GUARD_JOB_FOREGROUND: { exit: 5, zh: '一次性作业不许前台（0.2.1 委派天生异步，省略即后台）' },
  E_GUARD_SELF_FOREGROUND: { exit: 5, zh: '可续聊委派不许前台（省略即后台）' },
  E_GUARD_OFFICE_SHELL: { exit: 5, zh: '受限岗位没有 shell' },
  E_GUARD_OFFICE_WRITE: { exit: 5, zh: '受限岗位只能写 .team/ 下的东西' },
  E_GUARD_CONFIG_MISSING: { exit: 5, zh: 'delegationTools 配置缺失/非法 ⇒ 委派一律拒绝（宁可拦错，不许静默放前台）' },

  // ── office 落点账（住在 `inject.js`；码名在这里留一份，供文档与断言共用）──────────
  // ⚠️ 与上面那五个 guard 码同族：**不是 CLI 退出码** —— 写方那两条由 `recordOfficeLanding` 放进返回值
  //    （`ok:false` + `code`）、门禁那一侧另发 `E_GUARD_OFFICE_LEDGER` 并按 fail-closed 拒这次写；
  //    读方那两条由 `officeLandingLedger` 放进读数的 `reason` 前缀。
  //    给 5（校验拒绝）只为让 `CODES[code].exit` 有确定值。
  // 🔴 它必须与"盘写不进去"分开：那个是 IO 面（`E_OFFICE_LEDGER_UNWRITABLE`），这个是**这一行自己不合契约**。
  //    合成一个码，查的人会去弄盘，而盘一点事都没有（2026-11-09 第 4 关打回 R1）。
  E_OFFICE_LEDGER_SHAPE: { exit: 5, zh: '账行不合契约 §1.2（键集不是恰好七个 / 带正文键 / 七样的值类型不对）—— 这一行没进账，门禁按 fail-closed 拒这次写' },
  // 🔴 写方的另一个面：**盘写不进去**（建目录 / 追加失败）—— 与上面那条分开，查的人不一样：
  //    这个要去弄盘（权限 / 盘满 / 路径被目录占着），`reason` 点名 errno 一族。
  //    同样**不是 CLI 退出码**：`recordOfficeLanding` 只把它放进返回值（`ok:false` + `code`），
  //    门禁按 fail-closed 拒这次写；给 5 只为让 `CODES[code].exit` 有确定值。
  E_OFFICE_LEDGER_UNWRITABLE: { exit: 5, zh: '账本写不进去（建目录 / 追加失败：权限 / 盘满 / 路径被目录占着）—— 门禁按 fail-closed 拒这次写，reason 点名 errno 一族' },
  // 🔴 与写方那两条对称：读方的两个面也**必须分开**。
  //    "账本读不动 / 中间那一行坏了"（要去看那本账）与"最后一行写了一半"（并发追加没写完，重读一次通常就好）
  //    如果共用一个码，读的人分不出是哪件事、该去弄什么。
  //    两个读面都**不是 CLI 退出码**：`officeLandingLedger` 只把码放进读数的 `reason` 前缀；
  //    给 5 只为让 `CODES[code].exit` 有确定值。
  E_OFFICE_LEDGER_UNREADABLE: { exit: 5, zh: '账本读不动 / 中间行不合格（坏 JSON 或不合契约 §1.2）—— 读数 `ok:false` + `unreadable` 计数，不许当成 0 行' },
  E_OFFICE_LEDGER_PARTIAL_TAIL: { exit: 5, zh: '账本最后一行写了一半（无锁追加没写完）—— 读数 `ok:false` + `partial_tail` 计数，重读一次通常就好' },

  // ── 提候选那个动作（`proposal_file` 工具）的四个码 ─────────────────────────
  // ⚠️ 与上面那五个 guard 码同族：**不是 CLI 退出码** —— 它们由工具抛出（`error.code` + 报文以码开头），
  //    给 exit 只是为了让 `CODES[code].exit` 有一个确定值。
  // 🔴 为什么必须进这张表：CLI 的 catch **只认表里有的码**，别的全折成 `E_INTERNAL`
  //    ⇒ "候选被拒"会跟"程序有 bug"在报文里长得一模一样。工具本身不走 CLI，
  //    但池子那一行之后的处置（判决 / 复核 / 报告）会走。
  // 四格的分工（形状与内容重复**必须分开报**）：入参不成形状 / 声明哈希与内容不符 /
  //    同一出处同一段正文已提过 / 池子锁拿不到或原子写失败。
  E_PROPOSAL_SHAPE: { exit: 2, zh: '提候选的入参不成形状（text / source 缺或空、kind 越界、sha256 不是 64 hex、多给了不认识的字段）' },
  E_PROPOSAL_HASH_MISMATCH: { exit: 5, zh: '提候选时声明的 sha256 与 sha256(text) 不符（那一行的声明哈希从此是假话）' },
  E_PROPOSAL_DUPLICATE: { exit: 5, zh: '同一句出处 + 同一段正文已经提过（判重键 = (source, sha256(text))）' },
  E_PROPOSAL_IO: { exit: 4, zh: '候选池写不进去（锁争用到超时 / 原子写失败），报文带底层码' },
  E_PROPOSAL_TOO_LONG: { exit: 2, zh: '正文超过每条 400 字的上限（2026-10-18 老板：「以后提案阶段超过400字的不准提」·2026-10-22「不许超」）—— 提候选的工具与两条导入 CLI（proposal / maintenance）共用这一个码；把来历挪进 log.md 再导' },

  // ── 提维护案那个动作（`maintenance_file` 工具）的四个码 ─────────────────────
  // ⚠️ 与 `E_PROPOSAL_*` 同族：**不是 CLI 退出码** —— 它们由工具抛出（`error.code` + 报文以码开头），
  //    给 exit 只是为了让 `CODES[code].exit` 有一个确定值。
  // 🔴 为什么必须进这张表：CLI 的 catch **只认表里有的码**，别的全折成 `E_INTERNAL`
  //    ⇒「这份维护案该拒」会跟「程序有 bug」在报文里长得一模一样。工具本身不走 CLI，
  //    但它入池的那一行之后的处置（判决 / 复核 / 报告）会走。
  // 四格的分工（形状 / 目标 / 重复**必须分开报**）：入参不成形状 · 目标校不了或不在快照里 ·
  //    同一段内容已经提过 · 池子或落点写不进去。
  E_MAINTENANCE_SHAPE: { exit: 2, zh: '提维护案的入参不成形状（proposed_op 不在引擎那六个里 / 缺 target_original_text 或 reason / 多给了不认识的字段）' },
  E_MAINTENANCE_TARGET: { exit: 5, zh: '维护案的目标校不了：当前快照读不到，或 target_entry_id 不在快照的 entries 里（处置没有宾语）' },
  E_MAINTENANCE_DUPLICATE: { exit: 5, zh: '同一段草稿内容已经提过（判重键 = sha256(stableStringify(draft))，跨 kind、跨天）' },
  E_MAINTENANCE_IO: { exit: 4, zh: '维护案写不进去（池子锁争用到超时 / 草稿或池行的原子写失败 / 池子读不出来），报文带底层码' },
})
