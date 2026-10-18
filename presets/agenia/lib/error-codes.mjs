/**
 * 稳定错误码表 —— 三支 CLI、健康判定、测试断言**共用同一份**。
 *
 * 冻结依据：接口冻结提案 v1 §B1.4（退出码表）/ §B1.7（码名规则 `E_<域>_<理由>`）/ §B1.8，
 * 以及追加裁定 v1.3 的退出码族：
 *   2 用法/参数 · 3 路径与隔离 · 4 并发/锁/CAS · 5 校验拒绝 · 6 状态与不变量 · 7 数据缺失/损坏 · 8 内部错误
 *
 * 追加裁定 **v1.10 ②** 补冻两个派生码：`E_ARG_SCHEMA` ⇒ **2** · `E_TXN_IO` ⇒ **4**
 * （"入参不成形状"与"打包 IO 失败"两处调用它们；值就是下面表里那两个，别处不许再写一份）。
 * 🔴 `E_PACKET_*` 五个（`MANIFEST` / `FRAMES` / `CONTENT_SHA` / `WINDOW` / `EXCLUDE`）**原先不在本表**：
 *    它们是 `lib/packet.mjs` 里 `validateSessionPacket` 的**返回码**，不是 CLI 退出码（v1.10 ② 明写"不许混"）。
 *    **2026-10-15 起有 CLI 暴露它们了**（`bin/agenia-brain.mjs --op session-packet`）⇒ 按那条规矩
 *    **同批搬进本表**：码名从 `lib/packet.mjs` 的 `PACKET_CODES` **取值**（不再抄一遍），这里只补退出码。
 *    ⚠️ 不搬的后果是"稳定码变 `E_INTERNAL`"——CLI 的 catch 只认本表里的码，别的全折成内部错误，
 *    于是"包坏了"和"程序有 bug"在报文里长得一模一样。
 *
 * 域：ARG|ROOT|PATH|LOCK|CAS|TXN|STATE|DATA|CAP|STREAK|CS|JOB|CLAIM|FENCE|COVERAGE|RECEIPT|
 *     TICKET|EVIDENCE|STAGE|TASK|ROUTE|GUARD|INSTALL|MANIFEST|PACKET|SCAN|PROPOSAL|INTERNAL
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
 * 会话包那五个码 ⇒ **退出码 5（校验拒绝）**。
 * 码名**从 `lib/packet.mjs` 取**（`PACKET_CODES` 才是它们唯一的一份），这里只补"CLI 该退几"。
 * ⚠️ 五个都是"校验没过"：包不合法就该停，不是数据缺失（7）也不是内部错误（8）。
 */
const PACKET_EXIT = Object.freeze({
  [PACKET_CODES.MANIFEST]: { exit: 5, zh: '会话包的 manifest 不合（v1.5 的字段表：缺字段 / 形状错 / schema 不是 agenia.session-packet/1）' },
  [PACKET_CODES.FRAMES]: { exit: 5, zh: '会话包的帧读数不合（坏帧 / 截断 / 逐帧实解字节与落盘文本对不上 / 字符数对不上）' },
  [PACKET_CODES.CONTENT_SHA]: { exit: 5, zh: '会话包 content.jsonl 的字节 sha256 与 manifest.content_sha256 不一致' },
  [PACKET_CODES.WINDOW]: { exit: 5, zh: '会话包的评审窗口不合（from/to 不是 ISO8601，或 from 比 to 还晚）' },
  [PACKET_CODES.EXCLUDE]: { exit: 5, zh: '会话包的排除项不合（不在 other_project / self_review / outside_window 三类里）' },
})

/** 退出码族（只作可读常量；表里每个码自带数字）。 */
export const CODES = Object.freeze({
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
  E_GUARD_JOB_FOREGROUND: { exit: 5, zh: '一次性作业必须显式后台运行（run_in_background: true）' },
  E_GUARD_SELF_FOREGROUND: { exit: 5, zh: '可续聊委派不许前台（省略即后台）' },
  E_GUARD_OFFICE_SHELL: { exit: 5, zh: '受限岗位没有 shell' },
  E_GUARD_OFFICE_WRITE: { exit: 5, zh: '受限岗位只能写 .team/ 下的东西' },
  E_GUARD_CONFIG_MISSING: { exit: 5, zh: 'delegationTools 配置缺失/非法 ⇒ 委派一律拒绝（宁可拦错，不许静默放前台）' },

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
  E_PROPOSAL_TOO_LONG: { exit: 2, zh: '提候选时正文超过每条 400 字的上限（2026-10-18 老板：「以后提案阶段超过400字的不准提」）—— 把来历挪进 log.md' },
})
