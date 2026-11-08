/**
 * PRS-01..05 —— **任务 A**（拆账·并员·通电 的第一个任务）的自动判据。
 *
 * 冻结依据：定形 `2026-10-30/定形-拆账·并员·通电.md`（02:14 版）§2.2 身份表 / §3.3 通用组员 /
 * §5 迁移算术 / §6.1 任务 A 那张验收表 / §7 任务 A 行；接缝口径见 `.team/test/CONTRACT-A.md`。
 *
 * ── 被测树 = **现役** `presets/agenia`（这是本文件与其余用例**唯一**一处口径不同，写明理由）──────
 * 本套件其余用例的靶子是 `AGENIA_STAGING_PRESET`（`.tools/_staging/…/preset`），那是**设计如此**；
 * 这几条**故意打现役**，因为任务 A 的交付物就是**页面上的那两条预设**（定形 §5：「预设与工具是全局的，
 * 只改 `E:\Harness` 这份」；§6.1 的验收格是 **GUI**）：
 *   · 打 staging ⇒ "staging 改了、现役没改"这一形态会**绿**（而老板的页面没变）；
 *   · 打现役 ⇒ 那一形态只会**红**（假红，安全方向）。
 * 两棵树是否同步由**已有的** `STAT-01`（`STAGED-LIVE-DRIFT`）与入口的 `F57-TARGET` 各管一次 ——
 * 本文件**不**再抄一份漂移判据（同一件义务两份算式 = `M-4` 那类病）。
 *
 * ── 红在哪里、为什么现在红（第 2 关，功能未做）─────────────────────────────
 * 今天盘上的事实：补丁里有**10** 份预设入口（组长 1 + 组员 9），九条委派行各指自己那份
 * （`agenia-team-design` … `agenia-job-memory-judge`），判决岗的提案工具靠 `# @member-deny proposal_file`
 * + `proposalFile: false` **根本不注册**；`inject.js` 里没有任何容器装"toolName → 角色"，
 * 身份仍由注入文本里的 `【组员:<角色>】` 标记认出（`ROLE_MARK`）。
 * ⇒ 本文件的判据全落在"功能还没做"那一侧：缺面一律记 `…-SURFACE-MISSING`（**不是** import 崩），
 *   每一条都点名它等的是哪个名字 / 哪一份产物。
 *
 * ── 每条判据的两个方向（红不是目的，能翻面才是判据）────────────────────────
 * · 页面两条：**恰好 2** 且**不许第 3 条**（③ 卡标记方案不是 A 的停选项）；
 * · 一份组员预设：九行 `agentPreset` **同值**；而**九个 toolName 与九份 charter 一个不少**（另一方向）；
 * · 组员预设**不声明** `model` / `tools`；**组长预设不受此限**（另一方向；组长块的功能字段与值行
 *   逐行等于基线 —— 值行里只允许两样：九条 `agentPreset` 的值，以及一条 `defaultRole: leader`
 *   （组长 ruling 7，见 `PRS-01` ⑤′ 与 `CONTRACT-A` §3.2））；
 * · 身份：9 对 toolName↔role **正向**逐条中；**反向**：未知工具名 / 组长预设+工具名 ⇒ 拒；
 * · `defaultRole`：**只报警** —— 缺 / 合法 / 与预设不符 / 非法串 四种输入下 `row`/`role`/`narrow` **一格不变**，
 *   只有 `warnings` 变（四种都试过 ⇒ 才叫"只报警"）；
 * · 判决岗：它的 `proposal_file` **在列表里、调用被拒**；其余八个角色**调得通**（另一方向）；
 * · 内部 worker / legacy：`narrow === false` 且"记未受管"；**manual 组员 / 未知预设**：`narrow === true`
 *   —— 窄权限的三条来源**只有** row 5/6/7（多一条少一条都红）。
 *
 * ── 2026-11-01 第 4 关返修（第三轮）补的**运行时**腿（评审 N-5）───────────────────────────
 * 上面那些都只钉**纯函数与静态面**；这一批新的运行时规则原来一条判据都没有（删除 `narrowSessions.add(…)`、
 * 把门禁次序倒过来、拿掉 `agenia:role-persona` 那一条 push ⇒ 102 条全绿、128 条体检全绿）。
 * 现在由 `support/injector-harness.mjs` 在**真的** `inject.js` 上跑 `apply()`（假 ctx + 合成内容根）来钉：
 *   · `PRS-02` ⑥ 窄权限的**执行者** `narrowVerdict`：三个码各一格 + 放行的三格 + 门禁五条判定的**次序**
 *     （文件序代理）+ 刀（白名单里加一个 `pwsh` ⇒ 同一个调用从"拒"变"放行"）；
 *   · `PRS-02` ⑦ **注入哪一侧**：只有 row 3 是组长侧（row 0 / 0.5 / 5 / 7 都是组员侧）、共享记忆的受众
 *     跟着**侧**走而不是跟着"有没有角色"走、工具那一侧不跟着动（0 / 0.5 仍不窄）+ 刀（`row >= 4` ⇒
 *     row 0 / 0.5 变回组长侧，row 5 不动）；
 *   · `PRS-04` ⑤ 角色工具集的**执行者** `roleToolVerdict` / `toolCatalogFor`（review 没有 shell；
 *     框架工具不误伤）+ 刀（改 `review` 那一格 ⇒ 目录与放行**一起**变）；
 *   · `PRS-04` ⑥ 角色人格**真的被注入**（`agenia:role-persona` 紧挨 charter、正文逐字是表里那一句、
 *     全上下文里**只出现一次**）+ 刀（换掉表里那句 ⇒ 注入的正文跟着换）。
 * 每一刀都打在**证据根里的副本**上（`presets/**` 一个字节不动），刀没咬到时另有一个码（`…-NOT-FLIPPED`）。
 *
 * ── 2026-11-08 补的 `PRS-05`（老板改模型 · 旧契约判为"不具备"的那一格）──────────────────────
 * 老板原话：「派 subagent 组员的时候一律显式调用 DeepSeek-V41-Flash（写死）」。落法**不在**角色表
 * （`ROLE_TABLE.model` 是纯声明、没有读者 —— `CONTRACT-A` §12.4），而在**九条委派行**的 `agentOptions`
 * （`dsh-tool-subagent` 的配置键；`provider: deepseek-official` + `model: deepseek-flash`，
 * 后者是**模型 id**，`DeepSeek-V41-Flash` 只是显示名）。
 * ⇒ 旧契约 §12.4 说"第 5 关没有'改一个 model，会话真用它'这一格"，现在这一格**有了**：
 *   量具 = **装好的真插件**（`resources/app.asar` 里的 `dsh-tool-subagent/lib/index.js`）拿到那一行配置后
 *   交给 `startActivation` 的 `request.agentOptions`，再用真运行时的 `resolveChildAgentOptions` 算成
 *   子 Agent 的 options；**不是**子会话记录（那要一次真 LLM 往返），读数里 `child_session_record:false` 写明。
 *   假父会话的路由故意不是 `deepseek-flash` ⇒ 刀（去掉一行 `agentOptions`）必须让子会话回落到父路由：
 *   两臂都量，"配置生效"才与"继承父会话"分得开。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseDir, caseFail, caseHold, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { cfg, delegationToolNames, enabledDelegations, hostLevelPairingProblems, leaderBlockProblems, listMd, memberAnnotations, parseComposition, plain, presetEntries, readPresetBaseline } from '../support/composition.mjs'
// 2026-11-08：`PRS-05` 的运行时量具（真插件 + 真 provider + 切出来的真运行时函数；口径写在文件头）。
import { CHILD_MODEL_DISPLAY_NAME, CHILD_MODEL_PIN, childModelReadings } from '../support/subagent-options.mjs'
import {
  buildCatalog, buildContentRoot, configFromComposition, guardOrderOf, importSourceCopy,
  injectedNames, injectedText, knifeReplace, loadInjector as loadInjectorFile, namesOfCatalog,
  sectionNames, withHarness, SYNTH_LEGACY_SESSION,
} from '../support/injector-harness.mjs'
// 回滚期那一格用的码与量具（`DASH-15` / `DASH-16` / `PRS-01` 共用**同一个**码：一个事实一个载体）。
import { DISABLED_PENDING_CODE } from '../support/client-ui-placement.mjs'

before(() => {
  preflight()
})

// ─────────────────────────────────────────────────────────────────────────────
// 冻结期望（**手写自定形**，不从被测物反推）
// ─────────────────────────────────────────────────────────────────────────────

/** 定形 §2.2 那张闭表：`toolName → role → read/write`。九行，一个不多一个不少。 */
const ROLE_PAIRS = [
  ['team_design', 'design', 'read'],
  ['team_dev', 'dev', 'write'],
  ['team_test', 'test', 'read'],
  ['team_review', 'review', 'read'],
  ['subagent', 'hire', 'write'],
  ['job_memory_judge', 'memory-judge', 'read'],
  ['job_memory_review', 'memory-review', 'read'],
  ['job_conversation_review', 'conversation-review', 'read'],
  ['job_technical_review', 'technical-review', 'read'],
]
const TOOL_NAMES = ROLE_PAIRS.map(([t]) => t)
const ROLE_NAMES = ROLE_PAIRS.map(([, r]) => r)
const READ_ROLES = ROLE_PAIRS.filter(([, , m]) => m === 'read').map(([, r]) => r)
const WRITE_ROLES = ROLE_PAIRS.filter(([, , m]) => m === 'write').map(([, r]) => r)
/** 组长那一份的预设 id（`FROZEN.patchPresets.leaderPresetId` 同值；这里字面写死，免得被测物自己说了算）。 */
const LEADER_PRESET_ID = 'agenia'
/** 委派工具名 —— 角色表里任何一条 `tools` 都不许含它们（组员结构上不能再招人）。 */
const DELEGATION_TOOL_NAMES = [...TOOL_NAMES, 'workflow', 'ralph', 'subagent_fork', 'subagent_codex', 'subagent_claude_code']
/** 窄权限的闭三元组（定形 §2.2「窄 = 闭三元组」）。 */
const NARROW_WANT = { tools: ['read', 'write', 'edit'], write_scope: 'team', proposal: 'deny' }
/** 判决岗提案那一声拒的码（本契约冻的名字；报文措辞不冻，只冻码）。 */
const JUDGE_PROPOSAL_CODE = 'E_GUARD_JUDGE_PROPOSAL'
/** 组长预设 + 工具名 ⇒ 拒 / 工具名不在角色表 ⇒ 拒（本契约冻的两个码）。 */
const IDENTITY_CODES = { leaderWithTool: 'E_IDENTITY_LEADER_PRESET', unknownTool: 'E_IDENTITY_UNKNOWN_TOOL' }
/** 窄权限拒的三格各一个码（`CONTRACT-A` §7；措辞不冻，只冻码 —— 三个格子读日志要分得开）。 */
const NARROW_DENY_CODES = { tool: 'E_GUARD_NARROW_TOOL', write: 'E_GUARD_NARROW_WRITE', proposal: 'E_GUARD_NARROW_PROPOSAL' }
/** 只有**组长侧**才该拿到的那几样（注入侧的两面：有 / 没有）。 */
const LEADER_ONLY_CONTEXTS = ['agenia:leader', 'agenia:persona', 'agenia:style']
/** 长期记忆里"全条那三类"的节标题（`memorySections` 给组长侧的那一段；组员侧一节都不许有）。 */
const FULL_MEMORY_MARKS = ['### 关于老板 · boss', '### 关于本机 · machine', '### 关于某个项目 · project']

// ─────────────────────────────────────────────────────────────────────────────
// 小工具
// ─────────────────────────────────────────────────────────────────────────────
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase()
const PRESET = PATHS.finalPreset
const readRel = (rel) => {
  const abs = path.join(PRESET, rel)
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null
}

/** 补丁里的**预设入口块**：`^    - id: preset-<id>` 到下一块之前（与基线夹具的切法同形）。 */
const BLOCK_START = /^ {4}- id: preset-(\S+)(?:\s*#.*)?$/
function presetBlocks(text) {
  const lines = String(text).split(/\r?\n/)
  const starts = []
  for (let i = 0; i < lines.length; i += 1) {
    const m = BLOCK_START.exec(lines[i])
    if (m !== null) starts.push({ line: i, row_id: m[1] })
  }
  return starts.map((s, k) => {
    const to = k + 1 < starts.length ? starts[k + 1].line : lines.length
    const full = lines.slice(s.line, to).join('\n').replace(/\n+$/, '')
    const idLine = lines.slice(s.line, to).find((l) => /^ {8}id: /.test(l)) ?? ''
    const m = /^ {8}id: (\S+)\s*$/.exec(idLine)
    return { row_id: s.row_id, preset_id: m === null ? null : m[1], full_text: full, sha256: sha256(full) }
  })
}

/** 递归找键名（`model` / `tools` 这种"以任意深度出现即算"的禁字段）。 */
function keysAnywhere(node, names, trail = '', out = []) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => keysAnywhere(v, names, `${trail}[${i}]`, out))
    return out
  }
  if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (names.includes(k)) out.push(`${trail}.${k}`)
      keysAnywhere(v, names, `${trail}.${k}`, out)
    }
  }
  return out
}

/** 动态 import **现役** `inject.js`（缺面 ⇒ 记号，**不是** import 崩 —— 首跑红必须是"功能没做"那一种）。 */
async function loadLiveInjector() {
  const abs = path.join(PRESET, 'inject.js')
  if (!existsSync(abs)) return { ok: false, code: 'SUT-SURFACE-MISSING', why: `现役 ${abs} 不在`, mod: null }
  const url = new URL(`file:///${abs.replace(/\\/g, '/')}`).href
  try {
    return { ok: true, code: null, why: null, mod: await import(url) }
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') return { ok: false, code: 'SUT-SURFACE-MISSING', why: `它自己或它 import 的东西不在盘上：${err.message}`, mod: null }
    return { ok: false, code: 'SUT-IMPORT-FAILED', why: String(err?.message ?? err), mod: null }
  }
}

/** 升级前基线夹具（读取器只有一份实现：`support/composition.mjs::readPresetBaseline`）。 */
const readBaseline = readPresetBaseline

/** 调一次被测纯函数：**不抛**，把形状问题如实回报（坏签名不许长成"红得对"）。 */
function callPure(fn, ...args) {
  try {
    return { out: fn(...args), err: null }
  } catch (err) {
    return { out: null, err: String(err?.message ?? err) }
  }
}

/** 身份判定的输出归一（少一格就记形状问题，不猜）。 */
function normalizeIdentity(out) {
  if (out === null || typeof out !== 'object' || Array.isArray(out)) return null
  return {
    row: typeof out.row === 'number' ? out.row : null,
    role: typeof out.role === 'string' ? out.role : null,
    narrow: out.narrow === true,
    managed: out.managed === true,
    rejected: out.rejected === true,
    code: typeof out.code === 'string' ? out.code : null,
    warnings: Array.isArray(out.warnings) ? out.warnings.map(String) : [],
  }
}

describe('static · presets-two (任务 A)', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // PRS-01 · 页面两条 + 一份通用组员预设 + 九行工具不变 + 旧九份删除
  // ═══════════════════════════════════════════════════════════════════════════
  test('PRS-01 预设页恰好两条（组长 + 通用组员）· 九行工具不变 · 旧九份删除且基线逐字留存', async () => {
    await runCase('PRS-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      const ymlText = readRel('agent.cordis.yml')
      const patchText = readRel('cordis.patch.yml')
      if (ymlText === null) push('SUT-SURFACE-MISSING', `读不到 ${path.join(PRESET, 'agent.cordis.yml')}`)
      if (patchText === null) push('SUT-SURFACE-MISSING', `读不到 ${path.join(PRESET, 'cordis.patch.yml')}`)
      const base = readBaseline()
      if (!base.ok) push('BASELINE-MISSING', base.why)
      if (ymlText === null || patchText === null) return caseFail(problems)

      // ── ⓪ 基线自证：这份底稿真的能重算出它自己写的哈希（否则下面拿它当"逐字"的尺子就是空话）
      //    翻面：改夹具里任意一块正文一个字符 ⇒ `BASELINE-SELFPROOF`（证明这条不是恒真）。
      if (base.ok) {
        const blocks = base.value.preset_blocks ?? []
        rec.readings.baseline_blocks = blocks.map((b) => b.preset_id)
        if (blocks.length !== 10) push('BASELINE-SELFPROOF', `基线应冻 10 份预设块（组长 1 + 组员 9），实得 ${blocks.length}`)
        for (const b of blocks) {
          if (sha256(b.full_text) !== b.sha256) push('BASELINE-SELFPROOF', `基线 ${b.preset_id} 的 sha256 与它自己的正文不符（夹具被动过 / 生成器坏）`)
        }
        const memberIds = blocks.filter((b) => b.preset_id !== LEADER_PRESET_ID).map((b) => b.preset_id)
        rec.readings.baseline_member_ids = memberIds
        if (memberIds.length !== 9) push('BASELINE-SELFPROOF', `基线里组员预设应为 9 份，实得 ${memberIds.length}`)
      }

      // ── ① 组合那一侧：九条委派行 / 九个 toolName / delegationTools 九个键（**不变量**，今天就是对的）
      const compRows = parseComposition(ymlText, 'live-composition').rows
      const tools = delegationToolNames(compRows)
      rec.readings.delegation_tool_names = tools
      if (JSON.stringify(tools) !== JSON.stringify([...TOOL_NAMES].sort())) {
        push('TOOLNAMES-DRIFT', `九个 toolName 变了（定形 §2.2：不新造工具名）：实得 ${JSON.stringify(tools)}`)
      }
      const injRow = compRows.find((r) => r.id === 'persona-injector')
      const delegationKeys = injRow === undefined ? null : cfg(injRow, 'delegationTools')
      const keyNames = delegationKeys instanceof Map ? [...delegationKeys.keys()].sort() : null
      rec.readings.delegation_tools_keys = keyNames
      if (keyNames === null || JSON.stringify(keyNames) !== JSON.stringify([...TOOL_NAMES].sort())) {
        push('DELEGATIONTOOLS-DRIFT', `\`delegationTools\` 的九个键变了（冻结契约）：实得 ${JSON.stringify(keyNames)}`)
      }
      const enabled = enabledDelegations(compRows)
      rec.readings.enabled_delegations = enabled.length
      if (enabled.length !== 9) push('DELEGATION-ROWS', `已启用的具名委派行应为 9 条，实得 ${enabled.length}`)

      // ── ② 页面那一侧：补丁里的预设入口**恰好 2**（组长 1 + 通用组员 1），不许第 3 条
      const blocks = presetBlocks(patchText)
      const ids = blocks.map((b) => b.preset_id)
      rec.readings.preset_entry_ids = ids
      rec.readings.preset_entry_count = ids.length
      if (ids.length !== 2) {
        push('PAGE-COUNT', `页面 = 2 条预设（组长 + 通用组员），补丁里实得 ${ids.length} 条：${JSON.stringify(ids)}`
          + ' —— ③ 卡标记方案**不是** A 的停选项（定形 §2.2 A 停菜单只有 ①/②）')
      }
      if (!ids.includes(LEADER_PRESET_ID)) push('PAGE-COUNT', `组长预设 ${LEADER_PRESET_ID} 的入口不见了`)
      const memberIdsNow = ids.filter((id) => id !== LEADER_PRESET_ID)
      if (memberIdsNow.length !== 1) {
        push('PAGE-COUNT', `组员预设必须**恰好一份**，实得 ${memberIdsNow.length}：${JSON.stringify(memberIdsNow)}`)
      }
      const memberPresetId = memberIdsNow.length === 1 ? memberIdsNow[0] : null
      rec.readings.member_preset_id = memberPresetId

      // ── ③ 九条委派行都指**同一份**通用组员预设（不是各指各的；也不是悬空引用）
      const assigned = enabled.map((row) => cfg(row, 'agentPreset'))
      rec.readings.agentpreset_values = assigned
      const distinct = [...new Set(assigned)]
      if (distinct.length !== 1) {
        push('AGENTPRESET-SINGLE', `九条委派行的 agentPreset 必须**同值**（并员之后共用一份组员预设），实得 ${distinct.length} 个不同值：${JSON.stringify(distinct)}`)
      }
      if (memberPresetId !== null) {
        for (const row of enabled) {
          const got = cfg(row, 'agentPreset')
          if (got !== memberPresetId) {
            push('AGENTPRESET-SINGLE', `${row.id} 的 agentPreset=${JSON.stringify(got)}，必须指那份通用组员预设 ${memberPresetId}`
              + '（并员之后九行共用一份；各指各的 = 还是九份）')
          }
        }
      }
      // 反向：agentPreset 的值一个都不许悬空（读得到的入口里没有它 ⇒ 装配时那一行 never started）
      for (const row of enabled) {
        const got = cfg(row, 'agentPreset')
        if (typeof got === 'string' && !ids.includes(got)) push('AGENTPRESET-DANGLING', `${row.id} 的 agentPreset=${got} 在补丁的预设入口里不存在（悬空引用）`)
      }

      // ── ④ 组员预设**不声明** `model` / `tools`；组长预设**不受此限**（两个方向都要）
      const patchRows = parseComposition(patchText, 'live-patch').rows
      const entries = presetEntries(patchRows)
      const roleRosterEntries = entries.filter((e) => ids.includes(e.id))
      const registrationRowsAll = patchRows.filter((r) => r.name === '@deepseek-ai/dsh-agent-preset')
      /** 摊成普通对象、扫**全部**插件配置（禁字段藏在哪一层都要抓得到）。 */
      const pluginBag = (presetId) => {
        const row = registrationRowsAll.find((r) => cfg(r, 'id') === presetId)
        if (row === undefined) return null
        return { id: presetId, plugins: plain(cfg(row, 'plugins')) ?? [] }
      }
      const memberEntry = roleRosterEntries.find((e) => e.id === memberPresetId) ?? null
      const leaderEntry = roleRosterEntries.find((e) => e.id === LEADER_PRESET_ID) ?? null
      const memberBag = memberPresetId === null ? null : pluginBag(memberPresetId)
      rec.readings.member_entry_plugin_ids = memberEntry === null ? null : memberEntry.pluginIds
      if (memberEntry === null || memberBag === null) {
        push('MEMBER-PRESET-MISSING', `补丁里读不到那份通用组员预设（id=${JSON.stringify(memberPresetId)}）—— 禁字段无从对账`)
      } else {
        const memberKeys = keysAnywhere(memberBag, ['model', 'tools'], memberPresetId)
        rec.readings.member_forbidden_keys = memberKeys
        if (memberKeys.length > 0) {
          push('MEMBER-DECLARES-MODEL-TOOLS', `通用组员预设里出现了 ${JSON.stringify(memberKeys)} —— 定形 §3.3：member preset **不声明** \`model\` / \`tools\`，角色表是唯一作者`)
        }
      }
      // 阳性对照：**同一个提取器**在"故意塞了 model 的块"上必须报出来（否则上面那条是恒真的空话）
      const detectorProof = keysAnywhere({ config: { plugins: [{ id: 'persona', config: { model: 'x', tools: ['read'] } }] } }, ['model', 'tools'], 'mutant')
      rec.readings.member_field_detector_flip = detectorProof
      if (detectorProof.length !== 2) {
        push('DETECTOR-BLIND', `禁字段提取器翻不了面：塞了 model+tools 的合成块只报出 ${JSON.stringify(detectorProof)}`)
      }
      // 另一方向：组长预设的 leader 级字段**允许存在**，判据不许把 leader 一起判红
      if (leaderEntry === null) push('LEADER-PRESET-MISSING', `补丁里读不到组长预设 ${LEADER_PRESET_ID}`)

      // ── ⑤ 旧九份 per-role 预设**删除**（升级日）；且基线底稿必须还在（供 ② 回滚）
      if (base.ok) {
        const stillThere = (base.value.preset_blocks ?? [])
          .filter((b) => b.preset_id !== LEADER_PRESET_ID)
          .filter((b) => patchText.includes(`id: ${b.preset_id}\n`) || ids.includes(b.preset_id))
          .map((b) => b.preset_id)
        rec.readings.old_member_presets_left = stillThere
        if (stillThere.length > 0) {
          push('OLD-PRESETS-LEFT', `旧 per-role 预设没有全部删除，还在 ${stillThere.length} 份：${JSON.stringify(stillThere)}`
            + '（定形 §5：旧 = leader + 9，新 = leader + 通用组员，9 份全删）')
        }

        // ── 🔴 ⑤′ 组长块：**功能字段逐字不变 + 值行里只有九条 `agentPreset` 变了** ────────
        // 【为什么不再是"整块 sha256 = 基线"】③ 要求九条委派行同指一份通用组员预设，而这九行就住在
        //   组长块里（组长要有 team_* 工具才能派人）⇒ 它们的 `agentPreset` 值是组长块字节的一部分。
        //   "整块 sha256 = 基线" 与 ③ **字面互斥**：满足 ③ 就必须改那九行的值；满足旧 ⑤ 就等于给组长
        //   发一份九行指向本次已删除的预设 id 的配置（每一行 never started ⇒ 组长没有班子）。
        //   定形 §2.2 / 契约 §3.1 要的是 ③ ⇒ ⑤ 换成它真正想量的那件事（两条腿，口径写在
        //   `support/composition.mjs::leaderBlockProblems` 的文件头里，探针在
        //   `.team/test/2026-11-01/_tools/prs01-leader-flip.mjs`：它拿同一个函数跑 10 个变异体，
        //   证明这一格该红时红、该绿时绿）。
        // 🔴 **2026-11-01 收口（组长 ruling 7）**：值行那一向再放行**恰好一条** `defaultRole: leader`
        //   —— 组长预设必须自己声明自己那一档，否则每个组长会话都报一次"没声明"。放行的是**具体那一行**
        //   （基线 0 条 · 现侧 1 条 · 逐字 `defaultRole: leader` · 坐在 `persona-injector` 的 config 里、
        //   与 `leaderOrder:` 同级缩进）；多一条 / 换个值 / 塞到别处 ⇒ `LEADER-VALUE-EXTRA`。
        // 🔴 **2026-11-05 深夜（挂载搬回 bundle 层）**：看板那一行标了 `# @host-level`、住补丁顶层
        //   `- insert:`，两份预设体里都没有它 ⇒ 组长块里**不该**出现它。
        //   标记本身现在是**要求**（不是违规）：判法翻成"标记 ↔ 补丁里的宿主行成对"，见下面对
        //   `hostLevelPairingProblems()` 的调用（旧方向 `hostLevelMarkProblems()` 已退休，恒红）。
        // 🔴 **2026-11-08 重定基线（老板改模型）**：老板原话「派 subagent 组员的时候一律显式调用
        //   DeepSeek-V41-Flash（写死）」⇒ 九条委派行各加 `agentOptions: {provider: deepseek-official,
        //   model: deepseek-flash}`（`model` 是**模型 id**，`DeepSeek-V41-Flash` 只是显示名；读的人别把
        //   显示名当成 id 写进 yml）。基线因此同批加了**恰好**那九块三行值行（`baseRest` 227 → 254），
        //   别的值行一个字节没动；**严格度不变** —— 别处差一个字符照样 `LEADER-CLOBBERED`，
        //   也没有"跳过这几行"的放行（本文件没有这类开关）。
        const leaderBase = (base.value.preset_blocks ?? []).find((b) => b.preset_id === LEADER_PRESET_ID)
        const leaderNow = blocks.find((b) => b.preset_id === LEADER_PRESET_ID)
        if (leaderBase !== undefined) {
          if (leaderNow === undefined) {
            push('LEADER-CLOBBERED', `组长预设块整块不见了（基线 ${leaderBase.sha256.slice(0, 12)}…）`)
          } else {
            const oldMemberIds = (base.value.preset_blocks ?? [])
              .filter((b) => b.preset_id !== LEADER_PRESET_ID)
              .map((b) => b.preset_id)
            // 组合里的 `# @host-level` 现在是**要求**：判"标记 ↔ 补丁顶层宿主行成对"（两件产物一起喂）。
            const markVerdict = hostLevelPairingProblems(ymlText, patchText)
            const verdict = leaderBlockProblems({
              baseText: leaderBase.full_text,
              nowText: leaderNow.full_text,
              leaderPresetId: LEADER_PRESET_ID,
              memberPresetId,
              oldMemberIds,
              // 组合原文：判"回滚期停在组长块里的那一行"（组合里 `disabled: true` + 不在基线里 + 值行与组合逐字相同）。
              compositionText: ymlText,
            })
            rec.readings.leader_block_base = leaderBase.sha256
            rec.readings.leader_block_now = leaderNow.sha256
            rec.readings.leader_block = verdict.readings
            rec.readings.host_level = {
              marks: markVerdict.readings.marks,
              host_level_ids: markVerdict.readings.host_level_ids,
              host_rows: markVerdict.readings.host_rows,
              top_level_blocks: markVerdict.readings.top_level_blocks,
            }
            for (const p of verdict.problems) push(p.code, p.message)
            // 宿主级那一族各自的码（`HOST-LEVEL-*`）—— 一个事实一个落点，别折成一个笼统的码。
            for (const p of markVerdict.problems) push(p.code, p.message)
            /**
             * 🔴 **第三态：回滚窗口里这一格量不了"逐行相同"**（2026-11-05 16:2x 起 · 只在组合把那一行
             * `disabled: true` 停回预设层时出现）。今天挂载走 bundle 层 ⇒ 那一行不在组长块里 ⇒
             * `pending_rows` 为空、这一腿不出声；留着它是给"临时停回预设层"的窗口一个**不绿**的落点。
             */
            const pending = verdict.readings.value_lines?.pending_rows ?? []
            if (pending.length > 0) {
              caseHold(rec, DISABLED_PENDING_CODE,
                `组长块里停着 ${pending.length} 行**回滚期故意停在预设层**的行：${JSON.stringify(pending.map((p) => p.id))}`
                + `（组合里 \`disabled: true\` · 不在基线里 · 值行与组合逐字相同：${JSON.stringify(pending.map((p) => p.identical_to_composition))}）`
                + ' ⇒ "组长块的值行与基线逐行相同"这一格在回滚窗口里不成立，记 HOLD（不是绿）。'
                + '挂载路线落地、那一行不再是 disabled 之后，这一格自动回到红/绿两态')
            }
          }
        }
      }
      caseFail(problems)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PRS-02 · 身份判定表：角色只由 toolName 决定；defaultRole 只报警；worker / legacy 两端
  // ═══════════════════════════════════════════════════════════════════════════
  test('PRS-02 身份判定表九行：toolName 定角色 · defaultRole 只报警 · worker/legacy 不窄 · 窄恰三条来源 · 窄执行者三码 · 只有 row 3 是组长侧', async () => {
    await runCase('PRS-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      const loaded = await loadLiveInjector()
      if (!loaded.ok) {
        push(loaded.code, `现役 inject.js 的面拿不到：${loaded.why}`)
        return caseFail(problems)
      }
      const mod = loaded.mod
      const table = mod.ROLE_TABLE
      const identity = mod.identityVerdict
      rec.readings.surface = {
        ROLE_TABLE: Array.isArray(table) ? `array(${table.length})` : typeof table,
        identityVerdict: typeof identity,
        isLegacySession: typeof mod.isLegacySession,
        NARROW_PERMISSION: mod.NARROW_PERMISSION === undefined ? 'missing' : typeof mod.NARROW_PERMISSION,
      }
      if (!Array.isArray(table)) {
        push('IDENTITY-SURFACE-MISSING', '现役 inject.js 没有导出 `ROLE_TABLE`（契约 A §3 冻的容器：九份 toolName↔role 的唯一作者）')
      }
      if (typeof identity !== 'function') {
        push('IDENTITY-SURFACE-MISSING', '现役 inject.js 没有导出 `identityVerdict`（契约 A §4 冻的纯函数：定形 §2.2 的判定表按行序判）')
      }
      if (!Array.isArray(table) || typeof identity !== 'function') return caseFail(problems)

      // ── ① 九对 toolName↔role（正向逐条）+ 闭集（反向：不许第十个）
      const pairs = table.map((e) => [e?.toolName, e?.role, e?.mode])
      rec.readings.role_table_pairs = pairs
      for (const [toolName, role, mode] of ROLE_PAIRS) {
        const hit = pairs.find(([t]) => t === toolName)
        if (hit === undefined) push('ROLE-TABLE-PAIR', `角色表里没有 toolName=${toolName}（定形 §2.2 的闭表九行之一）`)
        else if (hit[1] !== role) push('ROLE-TABLE-PAIR', `${toolName} 的 role 应为 ${role}，实得 ${JSON.stringify(hit[1])}`)
        else if (hit[2] !== mode) push('ROLE-TABLE-PAIR', `${toolName} 的 read/write 应为 ${mode}，实得 ${JSON.stringify(hit[2])}`)
      }
      const extra = pairs.filter(([t]) => !TOOL_NAMES.includes(t)).map(([t]) => t)
      if (extra.length > 0) push('ROLE-TABLE-EXTRA', `角色表里多出不在闭表里的 toolName：${JSON.stringify(extra)}（闭集 = 九个）`)
      if (table.length !== 9) push('ROLE-TABLE-COUNT', `角色表应恰 9 条，实得 ${table.length}`)
      rec.readings.read_roles = READ_ROLES
      rec.readings.write_roles = WRITE_ROLES

      // ── ② 判定表：九行各喂一次（输入手写，不从实现反推）；每行断言 row / role / narrow / rejected
      const cases = [
        // [标签, 输入, 期望]
        ['row0 worker=workflow', { preset: 'member', toolName: null, worker: 'workflow' }, { row: 0, role: null, narrow: false, managed: false, rejected: false }],
        ['row0 worker=ralph', { preset: 'member', toolName: null, worker: 'ralph' }, { row: 0, role: null, narrow: false, managed: false, rejected: false }],
        ['row0.5 legacy', { preset: 'member', toolName: 'team_dev', legacy: true }, { row: 0.5, role: null, narrow: false, managed: false, rejected: false }],
        ['row1 组长+工具名 ⇒ 拒', { preset: 'leader', toolName: 'team_dev' }, { rejected: true, code: IDENTITY_CODES.leaderWithTool }],
        ['row2 未知工具名 ⇒ 拒', { preset: 'member', toolName: 'team_retro' }, { rejected: true, code: IDENTITY_CODES.unknownTool }],
        ['row2 非工具名 ⇒ 拒', { preset: 'member', toolName: 'proposal_file' }, { rejected: true, code: IDENTITY_CODES.unknownTool }],
        ['row3 组长+无工具 ⇒ leader', { preset: 'leader', toolName: null }, { row: 3, role: null, narrow: false, rejected: false }],
        ['row4 组员+工具 ⇒ 该角色', { preset: 'member', toolName: 'team_dev' }, { row: 4, role: 'dev', narrow: false, rejected: false }],
        ['row4 job 行', { preset: 'member', toolName: 'job_memory_judge' }, { row: 4, role: 'memory-judge', narrow: false }],
        ['row5 组员+无工具 ⇒ 窄', { preset: 'member', toolName: null }, { row: 5, role: null, narrow: true, rejected: false }],
        ['row6 未知预设+有效工具 ⇒ 角色保留+窄', { preset: 'unknown', toolName: 'team_dev' }, { row: 6, role: 'dev', narrow: true, rejected: false }],
        ['row7 未知+无工具 ⇒ 窄', { preset: 'unknown', toolName: null }, { row: 7, role: null, narrow: true, rejected: false }],
      ]
      const matrix = {}
      for (const [label, input, want] of cases) {
        const r = callPure(identity, input)
        const norm = r.err === null ? normalizeIdentity(r.out) : null
        matrix[label] = norm === null ? { err: r.err } : norm
        if (norm === null) {
          push('IDENTITY-SHAPE', `${label}：identityVerdict 没给出形状合法的判定（${r.err ?? JSON.stringify(r.out)?.slice(0, 160)}）`)
          continue
        }
        for (const key of ['row', 'role', 'narrow', 'managed', 'rejected', 'code']) {
          if (!(key in want)) continue
          if (norm[key] !== want[key]) push('IDENTITY-ROW', `${label}：${key} 应为 ${JSON.stringify(want[key])}，实得 ${JSON.stringify(norm[key])}`)
        }
      }
      rec.readings.identity_matrix = matrix

      // ── ③ defaultRole **只报警**：缺 / 合法 / 与预设不符 / 非法串 **四种**输入下，身份三格（row/role/narrow）**一格都不许动**
      //    翻面：谁把 defaultRole 改成"改身份"，这里当场红；谁把报警删掉 ⇒ warnings 那两条红。
      //    2026-11-01 收口补第 8 格（第 4 关评审 R-11）：契约 §4.2 硬口径 2 写的是 **row 3 与 row 4 各喂四种**
      //    （缺 / 合法 / 与预设不符 / 非法串）—— 这张表原来 row 4 只有三格，少的正是"非法串"那一格。
      const defaultRoleCases = [
        ['row3 缺', { preset: 'leader', toolName: null }, { row: 3, role: null, narrow: false }, 1],
        ['row3 合法 leader', { preset: 'leader', toolName: null, defaultRole: 'leader' }, { row: 3, role: null, narrow: false }, 0],
        ['row3 与预设不符 member', { preset: 'leader', toolName: null, defaultRole: 'member' }, { row: 3, role: null, narrow: false }, 1],
        ['row3 非法串', { preset: 'leader', toolName: null, defaultRole: 'not-a-tier' }, { row: 3, role: null, narrow: false }, 1],
        ['row4 缺', { preset: 'member', toolName: 'team_dev' }, { row: 4, role: 'dev', narrow: false }, 1],
        ['row4 合法 member', { preset: 'member', toolName: 'team_dev', defaultRole: 'member' }, { row: 4, role: 'dev', narrow: false }, 0],
        ['row4 与预设不符 dev', { preset: 'member', toolName: 'team_dev', defaultRole: 'dev' }, { row: 4, role: 'dev', narrow: false }, 1],
        ['row4 非法串', { preset: 'member', toolName: 'team_dev', defaultRole: 'not-a-tier' }, { row: 4, role: 'dev', narrow: false }, 1],
      ]
      const drReadings = {}
      for (const [label, input, want, wantWarn] of defaultRoleCases) {
        const r = callPure(identity, input)
        const norm = r.err === null ? normalizeIdentity(r.out) : null
        if (norm === null) { push('IDENTITY-SHAPE', `${label}：${r.err ?? '形状不对'}`); continue }
        drReadings[label] = { row: norm.row, role: norm.role, narrow: norm.narrow, warnings: norm.warnings.length }
        for (const key of ['row', 'role', 'narrow']) {
          if (norm[key] !== want[key]) push('DEFAULTROLE-CHANGED-IDENTITY', `${label}：defaultRole 把 ${key} 改了（应恒为 ${JSON.stringify(want[key])}，实得 ${JSON.stringify(norm[key])}）—— 定形 §2.2：defaultRole 只报警、不改档、不剥角色`)
        }
        if (wantWarn === 0 && norm.warnings.length !== 0) push('DEFAULTROLE-FALSE-ALARM', `${label}：合法的 defaultRole 不该报警，实得 ${norm.warnings.length} 条`)
        if (wantWarn === 1) {
          if (norm.warnings.length === 0) push('DEFAULTROLE-SILENT', `${label}：该报警却一条都没有（缺 / 非法 / 与预设不符 都要出声）`)
          else if (!norm.warnings.some((w) => w.includes('defaultRole'))) {
            push('DEFAULTROLE-UNNAMED', `${label}：报警里没点名 defaultRole（读的人不知道是哪一格坏了）：${JSON.stringify(norm.warnings)}`)
          }
        }
      }
      rec.readings.defaultrole_matrix = drReadings

      // ── ④ 窄权限：**恰好** row 5 / 6 / 7；row 0 / 0.5 显式例外（不窄）；闭三元组逐格对
      const narrowRows = cases
        .map(([label, input]) => [label, matrix[label]])
        .filter(([, m]) => m !== undefined && m.err === undefined && m.narrow === true)
        .map(([label]) => label)
      rec.readings.narrow_rows = narrowRows
      const narrowWantLabels = ['row5 组员+无工具 ⇒ 窄', 'row6 未知预设+有效工具 ⇒ 角色保留+窄', 'row7 未知+无工具 ⇒ 窄']
      const narrowUnexpected = narrowRows.filter((l) => !narrowWantLabels.includes(l))
      const narrowMissing = narrowWantLabels.filter((l) => !narrowRows.includes(l))
      if (narrowUnexpected.length > 0) push('NARROW-EXTRA', `这些判定不该是窄：${JSON.stringify(narrowUnexpected)}（窄的三条来源只有 row 5/6/7，没有第四条）`)
      if (narrowMissing.length > 0) push('NARROW-MISSING', `这些判定该是窄却没窄：${JSON.stringify(narrowMissing)}`)
      const narrow = mod.NARROW_PERMISSION
      rec.readings.narrow_permission = narrow === undefined ? null : narrow
      if (narrow === null || typeof narrow !== 'object') {
        push('NARROW-SURFACE-MISSING', '现役 inject.js 没有导出 `NARROW_PERMISSION`（契约 A §3：窄权限的闭三元组）')
      } else {
        const toolsOk = Array.isArray(narrow.tools) && JSON.stringify([...narrow.tools].sort()) === JSON.stringify([...NARROW_WANT.tools].sort())
        if (!toolsOk) push('NARROW-PERMISSION', `窄权限的工具白名单应为 ${JSON.stringify(NARROW_WANT.tools)}，实得 ${JSON.stringify(narrow.tools)}`)
        if (narrow.write_scope !== NARROW_WANT.write_scope) push('NARROW-PERMISSION', `窄权限的写范围应为 ${JSON.stringify(NARROW_WANT.write_scope)}（只写队伍目录），实得 ${JSON.stringify(narrow.write_scope)}`)
        if (narrow.proposal !== NARROW_WANT.proposal) push('NARROW-PERMISSION', `窄权限的提案应为 ${JSON.stringify(NARROW_WANT.proposal)}，实得 ${JSON.stringify(narrow.proposal)}`)
      }

      // ── ⑤ legacy session 的谓词：升级那一刻的 session-id 快照；**快照坏了 ⇒ false**（走向窄，不走向不窄）
      const isLegacy = mod.isLegacySession
      if (typeof isLegacy !== 'function') {
        push('LEGACY-SURFACE-MISSING', '现役 inject.js 没有导出 `isLegacySession`（契约 A §5：谓词 = 升级那一刻的 session-id 快照）')
      } else {
        const snapshot = { upgrade_at: '2026-11-01T03:00:00+08:00', session_ids: ['s-on-1', 's-on-2'] }
        const legacyCases = [
          ['快照里的 id', ['s-on-1', snapshot], true],
          ['快照里的第二个 id', ['s-on-2', snapshot], true],
          ['之后同形（不在快照里）', ['s-after-1', snapshot], false],
          ['空 id', ['', snapshot], false],
          ['null id', [null, snapshot], false],
          ['快照是 null', ['s-on-1', null], false],
          ['快照缺 session_ids', ['s-on-1', { upgrade_at: 'x' }], false],
          ['session_ids 不是数组', ['s-on-1', { upgrade_at: 'x', session_ids: 's-on-1' }], false],
        ]
        const legacyReadings = {}
        for (const [label, args, want] of legacyCases) {
          const r = callPure(isLegacy, ...args)
          legacyReadings[label] = r.err === null ? r.out : { err: r.err }
          if (r.err !== null) { push('LEGACY-SHAPE', `${label}：${r.err}`); continue }
          if (r.out !== want) push('LEGACY-PREDICATE', `${label}：应为 ${want}，实得 ${JSON.stringify(r.out)}`
            + '（快照读不出来时必须判 false —— 那会走向窄权限，是安全方向；判 true 会把人放进"不窄"）')
        }
        rec.readings.legacy_predicate = legacyReadings
      }

      // ── ⑥ 窄权限的**执行者**（第 4 关第三轮评审 N-5）──────────────────────────────
      //    为什么这条腿非有不可：`identityVerdict().narrow` 只是**标签**；真正拦住一次工具调用的是
      //    门禁里那次 `narrowVerdict`。补这一腿之前，"删掉 `narrowSessions.add(…)`"、"把白名单换成
      //    别处的一份字面量"、"把窄挪到角色工具集后面"这三种改法，102 条一条都不会红。
      //    三格各一个码 + 三个"该放行"的格子（只拦不算数，拦过头也是错）。
      const narrowVerdictFn = mod.narrowVerdict
      const repoRoot = PATHS.repo
      const agentAt = (cwd) => ({ id: 'prs-narrow', session: { id: 'prs-narrow', header: { cwd } } })
      if (typeof narrowVerdictFn !== 'function') {
        push('NARROW-EXECUTOR-MISSING', '现役 inject.js 没有导出 `narrowVerdict` —— 窄权限只剩标签、没有执行者（`NARROW_PERMISSION` 就没有读者）')
      } else {
        const narrowCells = [
          ['工具不在白名单（pwsh）', ['pwsh', {}, agentAt(repoRoot)], NARROW_DENY_CODES.tool],
          ['工具不在白名单（bash，第二把）', ['bash', {}, agentAt(repoRoot)], NARROW_DENY_CODES.tool],
          ['工具名是空串', ['', {}, agentAt(repoRoot)], NARROW_DENY_CODES.tool],
          ['提案（proposal_file）', ['proposal_file', {}, agentAt(repoRoot)], NARROW_DENY_CODES.proposal],
          ['写项目文件（.team 之外）', ['write', { file_path: path.join(repoRoot, 'presets', 'agenia', 'inject.js') }, agentAt(repoRoot)], NARROW_DENY_CODES.write],
          ['写 .team 但用 .. 穿出去', ['edit', { file_path: path.join(repoRoot, '.team', '..', 'README.md') }, agentAt(repoRoot)], NARROW_DENY_CODES.write],
          ['写但没给落点', ['write', {}, agentAt(repoRoot)], NARROW_DENY_CODES.write],
          ['读（白名单内）', ['read', { file_path: path.join(repoRoot, 'presets', 'agenia', 'inject.js') }, agentAt(repoRoot)], null],
          ['写 .team 里的东西', ['write', { file_path: path.join(repoRoot, '.team', 'test', 'prs-narrow.md') }, agentAt(repoRoot)], null],
          ['写 .team 里带 .. 但没穿出去', ['edit', { file_path: path.join(repoRoot, '.team', 'a', '..', 'b.md') }, agentAt(repoRoot)], null],
        ]
        const narrowReadings = {}
        for (const [label, args, wantCode] of narrowCells) {
          const r = callPure(narrowVerdictFn, ...args)
          const out = r.err === null ? r.out : null
          narrowReadings[label] = r.err === null ? (out === null || out === undefined ? null : (out?.code ?? String(out))) : { err: r.err }
          if (r.err !== null) { push('NARROW-EXECUTOR-SHAPE', `${label}：narrowVerdict 抛了（${r.err}）`); continue }
          const gotCode = out === null || out === undefined ? null : (typeof out?.code === 'string' ? out.code : null)
          if (wantCode === null) {
            if (out !== null && out !== undefined) push('NARROW-OVERBLOCK', `${label}：该放行却被拒（${JSON.stringify(out)}）—— 拦过头与拦不住都是错`)
          } else if (gotCode !== wantCode) {
            push('NARROW-CODE', `${label}：应拒 ${wantCode}，实得 ${JSON.stringify(out)}`)
          } else if (typeof out.message !== 'string' || out.message.trim() === '') {
            push('NARROW-MESSAGE', `${label}：拒了但报文是空的 —— 读日志的人不知道被哪一格挡了`)
          }
        }
        rec.readings.narrow_executor = narrowReadings

        // 门禁里那五条判定的**次序**（文件序代理；真语义只有第 5 关真挂载能给）。
        // 次序别倒过来：受限岗位若先被角色工具集判，就轮不到窄那一条（安全边界被改松）。
        const srcText = readRel('inject.js')
        if (srcText === null) push('SUT-SURFACE-MISSING', '读不到 inject.js —— 门禁次序无从对')
        else {
          const order = guardOrderOf(srcText)
          rec.readings.guard_order = order
          for (const code of order.codes) {
            push(code, `门禁五条判定的次序不符：实得 ${JSON.stringify(order.order)}，缺 ${JSON.stringify(order.missing)}`)
          }
          // 量具自证：把窄与角色那两处调用换个名字（只换文本、不执行）⇒ 同一个提取器必须报"次序倒了"。
          const swap1 = knifeReplace({ source: srcText, find: 'const narrow = narrowVerdict(', replace: 'const narrow = __PRS_SWAP__(' })
          const swap2 = swap1.ok ? knifeReplace({ source: swap1.source, find: 'const roleTool = roleToolVerdict(', replace: 'const roleTool = narrowVerdict(' }) : swap1
          const swap3 = swap2.ok ? knifeReplace({ source: swap2.source, find: 'const narrow = __PRS_SWAP__(', replace: 'const narrow = roleToolVerdict(' }) : swap2
          if (!swap3.ok) push(swap3.code ?? 'KNIFE-NO-CUT', `次序刀的落点不对：${swap3.why ?? ''}`)
          else {
            const swapped = guardOrderOf(swap3.source)
            rec.readings.guard_order_knife = { order: swapped.order, ok: swapped.ok, codes: swapped.codes }
            if (swapped.ok || !swapped.codes.includes('GUARD-ORDER-SWAPPED')) {
              push('GUARD-ORDER-NOT-PROVEN', '把窄与角色工具集那两次调用对调之后，次序提取器仍然说"对" —— 那它就不是判据')
            }
          }

          // 刀：白名单那一格加一个 `pwsh`（**证据根里的副本**，`presets/**` 零字节）⇒ 同一个调用必须放行。
          // 这一刀证明"白名单只有一个作者"：它读的就是 `NARROW_PERMISSION.tools`，不是门禁里另抄的一份。
          const knife = knifeReplace({
            source: srcText,
            find: "  tools: Object.freeze(['read', 'write', 'edit']),",
            replace: "  tools: Object.freeze(['read', 'write', 'edit', 'pwsh']),",
          })
          if (!knife.ok) push(knife.code, `窄权限那把刀的落点不对：${knife.why}`)
          else {
            const cut = await importSourceCopy({ dir: path.join(caseDir('PRS-02'), 'knife-narrow'), source: knife.source })
            if (!cut.ok) push(cut.code, `窄权限那把刀 import 不了（那不是"变绿"，是换个崩法）：${cut.why}`)
            else {
              const baseline = callPure(narrowVerdictFn, 'pwsh', {}, agentAt(repoRoot))
              const mutant = callPure(cut.mod.narrowVerdict, 'pwsh', {}, agentAt(repoRoot))
              rec.readings.narrow_knife = {
                baseline: baseline.err === null ? baseline.out : { err: baseline.err },
                mutant: mutant.err === null ? mutant.out : { err: mutant.err },
              }
              if (baseline.err !== null || baseline.out?.code !== NARROW_DENY_CODES.tool) {
                push('NARROW-KNIFE-NO-BASELINE', '刀之前那一格就不是"拒" ⇒ 这一刀没有可比的对象（刀与基线是两件事）')
              }
              if (mutant.err !== null || (mutant.out !== null && mutant.out !== undefined)) {
                push('NARROW-KNIFE-NOT-FLIPPED', `白名单里加了 pwsh 之后 narrowVerdict('pwsh') 仍然被拒（${JSON.stringify(mutant.out)}）`
                  + ' ⇒ 白名单不是从 `NARROW_PERMISSION` 读的（那个常量没有读者）')
              }
            }
          }
        }
      }

      // ── ⑦ 注入哪一侧 + 记忆受众（第三轮 N-3 / N-5）────────────────────────────────
      //    口径（`CONTRACT-A` §5.2）：**只有 row 3 是组长侧**；row 0 / 0.5 / 5 / 7 都是组员侧。
      //    共享记忆的受众跟着**侧**走，不跟"有没有角色"走（并员之后"组员侧 + 没有角色"是常态）。
      //    工具那一侧**不跟着动**：row 0 / 0.5 仍然不窄 —— 这两件事正交，正是 N-3 的要点。
      const ymlText = readRel('agent.cordis.yml')
      if (ymlText === null) push('SUT-SURFACE-MISSING', '读不到 agent.cordis.yml —— 运行时载具的 config 没有来源')
      else {
        const contentRoot = path.join(runRoot(), 'tmp', 'prs-harness', 'PRS-02')
        const built = buildContentRoot({ root: contentRoot, presetDir: PRESET, runRoot: runRoot() })
        rec.readings.harness_content_root = { root: contentRoot, md_files: built.md_files.length }
        const conf = configFromComposition({ ymlText, contentDir: contentRoot })
        const baseToolSet = Array.isArray(mod.BASE_TOOL_SET) ? mod.BASE_TOOL_SET : null
        if (!conf.ok) push('HARNESS-CONFIG', conf.why)
        if (baseToolSet === null) push('HARNESS-CONFIG', '现役 inject.js 没有导出 `BASE_TOOL_SET` —— 合成工具目录无从造')
        if (conf.ok && baseToolSet !== null) {
          const catalog = buildCatalog(baseToolSet)
          const memberConf = { ...conf.config, defaultRole: 'member' }
          const leaderConf = { ...conf.config, defaultRole: 'leader' }
          // [标签, 载具入参, 该走哪一侧, 工具是否该被窄权限拦住]
          const sideSpecs = [
            ['row0 内部 worker', { header: { cwd: contentRoot, agentPreset: 'agenia-member', worker: 'workflow' }, id: 'prs-side-row0', config: memberConf }, 'member', false],
            ['row0.5 旧会话', { header: { cwd: contentRoot, agentPreset: 'agenia-member' }, id: SYNTH_LEGACY_SESSION, config: memberConf }, 'member', false],
            ['row3 组长', { header: { cwd: contentRoot, agentPreset: 'agenia' }, id: 'prs-side-row3', config: leaderConf }, 'leader', false],
            ['row5 手动组员', { header: { cwd: contentRoot, agentPreset: 'agenia-member' }, id: 'prs-side-row5', config: memberConf }, 'member', true],
            ['row7 未知预设', { header: { cwd: contentRoot }, id: 'prs-side-row7', config: memberConf }, 'member', true],
          ]
          /** 跑一条会话，量"这一侧拿到了什么"。
           *  ⚠️ agent id 就用 spec 里那个（**不要**加后缀）：row 0.5 的判定靠"id 恰在升级快照里"，
           *     加个后缀它就不是 legacy 了 —— 刀那一轮会量到 row 7，看着像"没翻面"。 */
          const runSide = async (targetMod, spec) => {
            const [label, input, want, narrowWant] = spec
            const agentId = input.id
            let reading = null
            await withHarness(targetMod, { contentDir: contentRoot, config: input.config, header: input.header, id: agentId, catalog }, async (h) => {
              const out = await h.assemble()
              const names = injectedNames(out)
              const memory = injectedText(out, 'agenia:memory')
              const guard = h.guard({ name: 'pwsh', arguments: {}, agent: { id: agentId, session: { id: agentId, header: input.header } } })
              reading = {
                label,
                want,
                names,
                opening: sectionNames(out).some((name) => String(name).includes('opening')),
                leader_only_present: LEADER_ONLY_CONTEXTS.filter((name) => names.includes(name)),
                memory_index: memory.includes('## 共享记忆 · 索引'),
                memory_common_sense: memory.includes('## 共享记忆 · 常识'),
                memory_full: FULL_MEMORY_MARKS.filter((mark) => memory.includes(mark)),
                tool_denied: typeof guard.reason === 'string',
                guard_ok: guard.ok,
                guard_why: guard.why,
                narrow_want: narrowWant,
              }
            })
            return reading
          }
          const sideRows = {}
          for (const spec of sideSpecs) {
            const reading = await runSide(mod, spec)
            sideRows[spec[0]] = reading
            if (reading === null) { push('SIDE-HARNESS', `${spec[0]}：载具没量出东西（apply / assemble 失败）`); continue }
            if (!reading.guard_ok) push('SIDE-HARNESS', `${spec[0]}：门禁没挂上（${reading.guard_why}）`)
            if (reading.want === 'member') {
              if (!reading.names.includes('agenia:work-guidelines')) push('SIDE-MEMBER-ORDER', `${spec[0]}：组员侧没有 work-guidelines（实得 ${JSON.stringify(reading.names)}）`)
              if (reading.leader_only_present.length > 0) push('SIDE-LEADER-LEAK', `${spec[0]}：组员侧拿到了组长那几样 ${JSON.stringify(reading.leader_only_present)}`)
              if (reading.opening) push('SIDE-OPENING-LEAK', `${spec[0]}：组员侧拿到了「每天开工第一步」`)
              if (!reading.memory_index || !reading.memory_common_sense) push('SIDE-MEMORY', `${spec[0]}：记忆里该有索引与常识（索引=${reading.memory_index} · 常识=${reading.memory_common_sense}）`)
              if (reading.memory_full.length > 0) push('SIDE-MEMORY-LEAK', `${spec[0]}：组员侧拿到了组长那三类全条 ${JSON.stringify(reading.memory_full)}`)
            } else {
              for (const want of LEADER_ONLY_CONTEXTS) {
                if (!reading.names.includes(want)) push('SIDE-LEADER-MISSING', `row3 组长：少了 ${want}（实得 ${JSON.stringify(reading.names)}）`)
              }
              if (!reading.opening) push('SIDE-OPENING-MISSING', 'row3 组长：没有「每天开工第一步」')
              if (reading.memory_full.length !== FULL_MEMORY_MARKS.length) push('SIDE-MEMORY-MISSING', `row3 组长：全条那三类少了几节（实得 ${JSON.stringify(reading.memory_full)}）`)
              if (reading.memory_common_sense) push('SIDE-MEMORY-EXTRA', 'row3 组长：常识不该进快照（它走尾巴那一路）')
            }
            if (reading.tool_denied !== reading.narrow_want) {
              push('SIDE-TOOLS-MOVED', `${spec[0]}：工具那一侧不对（该被窄权限拦住=${reading.narrow_want}，实得 ${reading.tool_denied}）`
                + ' —— 这一格只管"注入哪一侧"，工具侧不跟着动')
            }
          }
          rec.readings.inject_side = sideRows

          // 刀：`isMemberSide = identity.row >= 4`（第二轮之前的规则）⇒ row 0 / 0.5 必须变回组长侧；
          //    row 5 必须**不动**（它在两条规则下都是组员侧 —— 它是"刀没切宽"的证人）。
          const sideSrc = readRel('inject.js') ?? ''
          const sideKnife = knifeReplace({ source: sideSrc, find: 'const isMemberSide = identity.row !== 3', replace: 'const isMemberSide = identity.row >= 4' })
          if (!sideKnife.ok) push(sideKnife.code, `注入侧那把刀的落点不对：${sideKnife.why}`)
          else {
            const cut = await importSourceCopy({ dir: path.join(caseDir('PRS-02'), 'knife-side'), source: sideKnife.source })
            if (!cut.ok) push(cut.code, `注入侧那把刀 import 不了（那不是"变红"，是换个崩法）：${cut.why}`)
            else {
              const knifeRows = {}
              for (const spec of sideSpecs) knifeRows[spec[0]] = await runSide(cut.mod, spec)
              rec.readings.inject_side_knife = knifeRows
              const flippedToLeader = (label) => {
                const before = sideRows[label]
                const after = knifeRows[label]
                return before !== null && after !== null
                  && before.leader_only_present.length === 0 && after.leader_only_present.length > 0
                  && after.opening === true && after.memory_full.length > 0
              }
              for (const label of ['row0 内部 worker', 'row0.5 旧会话']) {
                if (!flippedToLeader(label)) {
                  push('SIDE-KNIFE-NOT-FLIPPED', `把谓词改回 \`row >= 4\` 之后 ${label} 没有变回组长侧 ⇒ `
                    + '"只有 row 3 是组长侧"这句话没有判据在守（写上去也不会红）')
                }
              }
              const witness = (row) => row === null ? null : JSON.stringify({ names: row.names, opening: row.opening, memory_full: row.memory_full })
              if (witness(sideRows['row5 手动组员']) !== witness(knifeRows['row5 手动组员'])) {
                push('SIDE-KNIFE-SIDE-EFFECT', 'row 5 在两条规则下都是组员侧，这一刀不该动它 —— 动了说明刀切到了别处')
              }
            }
          }
        }
      }
      caseFail(problems)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PRS-03 · 判决岗：提案工具「在列表里、调用被拒」（注册与拒同源）
  // ═══════════════════════════════════════════════════════════════════════════
  test('PRS-03 判决岗提案工具在列表里、调用被拒；其余八个角色调得通；说明书不再写「没有这个工具」', async () => {
    await runCase('PRS-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      const ymlText = readRel('agent.cordis.yml')
      const patchText = readRel('cordis.patch.yml')
      if (ymlText === null || patchText === null) {
        push('SUT-SURFACE-MISSING', '读不到 agent.cordis.yml / cordis.patch.yml')
        return caseFail(problems)
      }

      // ── ① 角色表那一侧：deny 只在判决岗身上，且就是 proposal
      const loaded = await loadLiveInjector()
      if (!loaded.ok) push(loaded.code, `现役 inject.js 的面拿不到：${loaded.why}`)
      const mod = loaded.mod
      const table = loaded.ok ? mod.ROLE_TABLE : null
      if (loaded.ok && !Array.isArray(table)) push('PRESET-DENY-SURFACE-MISSING', '现役 inject.js 没有导出 `ROLE_TABLE`（deny 的唯一作者）')
      if (Array.isArray(table)) {
        const denied = table.filter((e) => Array.isArray(e?.deny) && e.deny.length > 0).map((e) => [e.toolName, e.role, [...e.deny].sort()])
        rec.readings.role_table_deny = denied
        if (denied.length !== 1 || denied[0][1] !== 'memory-judge') {
          push('PRESET-DENY-SOURCE', `deny 只许挂在判决岗那一条上（"注册与拒同源"），实得 ${JSON.stringify(denied)}`)
        } else if (!denied[0][2].includes('proposal')) {
          push('PRESET-DENY-SOURCE', `判决岗那一条的 deny 应是 ['proposal']，实得 ${JSON.stringify(denied[0][2])}`)
        }
      }
      // ── ② 调用被拒：判决岗拒、其余八个角色放行（**两个方向**）
      const verdictFn = loaded.ok ? mod.proposalVerdict : undefined
      rec.readings.proposalVerdict = typeof verdictFn
      if (typeof verdictFn !== 'function') {
        push('PROPOSAL-VERDICT-MISSING', '现役 inject.js 没有导出 `proposalVerdict`（契约 A §6：判决岗的提案调用在**调用时**被拒）')
      } else {
        const judge = callPure(verdictFn, 'memory-judge', 'proposal_file')
        const judgeOut = judge.err === null ? judge.out : null
        rec.readings.proposal_judge = judgeOut
        if (judgeOut === null || typeof judgeOut !== 'object' || typeof judgeOut.code !== 'string') {
          push('PROPOSAL-NOT-DENIED', `判决岗调 proposal_file 必须被拒（返回 {code,message}），实得 ${JSON.stringify(judgeOut)}（${judge.err ?? ''}）`)
        } else {
          if (judgeOut.code !== JUDGE_PROPOSAL_CODE) push('PROPOSAL-DENY-CODE', `拒绝码应为 ${JUDGE_PROPOSAL_CODE}，实得 ${judgeOut.code}`)
          if (typeof judgeOut.message !== 'string' || judgeOut.message.trim() === '') push('PROPOSAL-DENY-MESSAGE', '拒绝报文是空的 —— 读的人不知道被什么挡了')
        }
        // 反向：其余八个角色**一个都不许**被挡（多挡一个 = 那个岗位提不了候选，而那不是它的活）
        for (const role of ROLE_NAMES.filter((r) => r !== 'memory-judge')) {
          const r = callPure(verdictFn, role, 'proposal_file')
          const out = r.err === null ? r.out : null
          if (out !== null && out !== undefined) {
            push('PROPOSAL-OVERBLOCK', `${role} 调 proposal_file 被挡了（${JSON.stringify(out)}）—— 只有判决岗该被挡`)
          }
        }
        // 反向：判决岗**别的工具**照常（只拒 proposal，不拒整个人）
        const otherTool = callPure(verdictFn, 'memory-judge', 'read')
        if (otherTool.err !== null || (otherTool.out !== null && otherTool.out !== undefined)) {
          push('PROPOSAL-OVERBLOCK', `判决岗调 read 被挡了（${JSON.stringify(otherTool.out)}）—— 拒的只是提案，不是这个人`)
        }
      }

      // ── ③ 注册面：它必须**在列表里** —— 旧的"根本不注册"两种表达（`@member-deny` / `proposalFile: false`）都得消失
      //    （定形 §2.2：判决岗「工具在列表里、调用被拒」，不再是"工具集里没有"）
      const ann = memberAnnotations(ymlText)
      const judgeAnn = ann.get('tool-job-memory-judge')
      rec.readings.judge_annotation_deny = judgeAnn === undefined ? null : judgeAnn.deny
      const denyLeak = [...ann].filter(([id, m]) => id !== 'tool-job-memory-judge' && (m.deny ?? []).includes('proposal_file')).map(([id]) => id)
      if (denyLeak.length > 0) push('DENY-LEAK', `这些行 deny 了 proposal_file：${JSON.stringify(denyLeak)}（只有判决岗该被挡）`)
      if (judgeAnn === undefined) {
        push('JUDGE-ROW-MISSING', '组合里找不到 `- id: tool-job-memory-judge` 那一行上方的组员注释')
      } else if ((judgeAnn.deny ?? []).includes('proposal_file')) {
        push('REGISTERED-BY-ABSENCE', '判决行上方还留着 `# @member-deny proposal_file` —— 那是"工具集里根本没有它"的旧口径；'
          + '定形 §2.2 改成「在列表里、调用被拒」')
      }
      // 只数**生效的配置行**（`#` 注释里提到 `proposalFile: false` 是在解释历史，不算"还在用"——
      // 拿 `includes` 数全文会把注释算进去，判据就会在"实现对了、注释没删"上假红）。
      const withFlag = patchText.split(/\r?\n/).filter((l) => /^\s+proposalFile:\s*false\s*$/.test(l)).length
      rec.readings.proposalFile_false_count = withFlag
      if (withFlag !== 0) {
        push('REGISTERED-BY-ABSENCE', `补丁里还有 ${withFlag} 处 \`proposalFile: false\` —— 判决岗的工具必须**注册**、靠门禁在调用时拒`)
      }

      // ── ④ 说明书那一侧：判决岗说明书要写「工具在列表里、调用被拒」，不许再写"没有这个工具"
      const charter = readRel(path.join('team', 'memory-judge.md'))
      if (charter === null) {
        push('CHARTER-MISSING', '缺 team/memory-judge.md')
      } else {
        const namesTool = ['proposal_file', '提案工具'].some((n) => charter.includes(n))
        const statesDenied = ['调用被拒', '调用会被拒', '调用时被拒'].some((n) => charter.includes(n))
        const claimsAbsent = ['没有这个工具', '工具集里没有', '看不见它'].filter((n) => charter.includes(n))
        rec.readings.judge_charter = { names_tool: namesTool, states_denied: statesDenied, claims_absent: claimsAbsent }
        if (!namesTool) push('CHARTER-NEEDLE', 'team/memory-judge.md 里没点出提案工具（`proposal_file` / 提案工具）—— "调用被拒"这句话得先有个宾语')
        if (!statesDenied) push('CHARTER-NEEDLE', 'team/memory-judge.md 里没有「调用被拒 / 调用会被拒 / 调用时被拒」这句（定形 §2.2 的措辞：工具在列表里、调用被拒）')
        if (claimsAbsent.length > 0) push('CHARTER-STALE', `team/memory-judge.md 还在写"没有这个工具"这一类（${JSON.stringify(claimsAbsent)}）—— 定形明令改成「调用被拒」`)
      }
      caseFail(problems)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PRS-04 · 角色表是 persona / charter / model / tools 的唯一作者（逐字 no-regression）
  // ═══════════════════════════════════════════════════════════════════════════
  test('PRS-04 角色表带 persona/charter/model/tools（九份逐字 no-regression · 不串味 · 不含委派工具）· 目录与放行都读那一格 · 人格注入逐字且只一次', async () => {
    await runCase('PRS-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      const base = readBaseline()
      if (!base.ok) {
        push('BASELINE-MISSING', base.why)
        return caseFail(problems)
      }
      const rows = base.value.member_rows ?? []
      const byRole = new Map(rows.map((r) => [r.role, r]))
      rec.readings.baseline_roles = rows.map((r) => r.role)

      const loaded = await loadLiveInjector()
      if (!loaded.ok) { push(loaded.code, `现役 inject.js 的面拿不到：${loaded.why}`); return caseFail(problems) }
      const table = loaded.mod.ROLE_TABLE
      if (!Array.isArray(table)) {
        push('IDENTITY-SURFACE-MISSING', '现役 inject.js 没有导出 `ROLE_TABLE`（persona/charter/model/tools 的唯一作者）')
        return caseFail(problems)
      }
      const teamFiles = listMd(path.join(PRESET, 'team')) ?? []
      rec.readings.team_files = teamFiles
      const byRoleTable = new Map(table.map((e) => [e?.role, e]))

      for (const [toolName, role] of ROLE_PAIRS) {
        const entry = byRoleTable.get(role)
        if (entry === undefined) { push('ROLE-TABLE-MISSING', `角色表里没有 role=${role}（toolName=${toolName}）`); continue }
        const marked = byRole.get(role)
        if (marked === undefined) { push('BASELINE-SELFPROOF', `基线里没有 role=${role} 的升级前人格`); continue }

        // ① persona：升级前那一句**逐字**还在，且挂在这个角色自己身上
        const persona = typeof entry.persona === 'string' ? entry.persona.trim() : ''
        if (persona === '') {
          push('PERSONA-MISSING', `${role} 的 persona 是空的 —— 定形 §6.1：基线是删 9 旧预设前冻结的全文，缺一句 ⇒ 红`)
        } else if (!persona.includes(marked.persona_body)) {
          push('PERSONA-DRIFT', `${role} 的 persona 里没有升级前那句原文（应含 ${JSON.stringify(marked.persona_body.slice(0, 48))}…，实得 ${JSON.stringify(persona.slice(0, 72))}…）`)
        }
        // ② 串味：别人的那句**不许**出现在这个角色身上（逐字比对基线）
        for (const other of rows) {
          if (other.role === role) continue
          if (persona.includes(other.persona_body)) {
            push('PERSONA-CROSSTALK', `${role} 的 persona 里出现了 ${other.role} 那一句 —— 串味（定形 §6.1 逐字比对基线 ⇒ 红）`)
          }
        }

        // ③ charter：相对路径、真的在 team/ 下、且就是这个角色那一份
        const charter = typeof entry.charter === 'string' ? entry.charter.replace(/\\/g, '/') : ''
        if (charter === '') push('CHARTER-MISSING', `${role} 的 charter 是空的`)
        else {
          const file = path.basename(charter)
          if (!teamFiles.includes(file)) push('CHARTER-MISSING', `${role} 的 charter=${charter} 在 team/ 下不存在（现有 ${teamFiles.length} 份）`)
          if (!file.startsWith(role)) push('CHARTER-WRONG', `${role} 的 charter=${charter} 指的不是自己那一份`)
        }

        // ④ model / tools：**两个键都得在**（值可以是 null = 引擎默认），且 tools 非空、不含委派工具
        if (!('model' in entry)) push('MODEL-TOOLS-MISSING', `${role} 的条目没有 \`model\` 键（定形 §3.3：角色表带 model/tools，每角色一份、唯一作者）`)
        if (!('tools' in entry)) push('MODEL-TOOLS-MISSING', `${role} 的条目没有 \`tools\` 键`)
        else if (!Array.isArray(entry.tools) || entry.tools.length === 0) {
          push('MODEL-TOOLS-SHAPE', `${role} 的 tools 应为非空数组，实得 ${JSON.stringify(entry.tools)}`)
        } else {
          const recruit = entry.tools.filter((t) => DELEGATION_TOOL_NAMES.includes(t))
          if (recruit.length > 0) {
            push('TOOLS-RECRUIT', `${role} 的 tools 里有委派工具 ${JSON.stringify(recruit)} —— 组员结构上不能再招人（委派组整个不搬过去）`)
          }
          const unknownTool = entry.tools.filter((t) => typeof t !== 'string' || t.trim() === '')
          if (unknownTool.length > 0) push('MODEL-TOOLS-SHAPE', `${role} 的 tools 里有非字符串/空串项：${JSON.stringify(unknownTool)}`)
        }
      }
      // 闭集另一方向：角色表条数 = 9（多一条 = 多一个身份，少一条 = 少一个岗位）
      if (table.length !== 9) push('ROLE-TABLE-COUNT', `角色表应恰 9 条，实得 ${table.length}`)

      // ── ⑤ 角色工具集的**执行者**（第三轮评审 N-5）────────────────────────────────
      //    `ROLE_TABLE[role].tools` 是运行时作者，两个落点：装配时裁目录（`toolCatalogFor`）+
      //    调用时拒（`roleToolVerdict`）。补这一腿之前，把 `review` 的 shell 加回去、或者让目录不再
      //    按角色裁，102 条一条都不会红（角色表原来只有**形状**判据）。
      //    翻面（刀）：改 `review` 那一格 `tools:`（**证据根里的副本**）⇒ 目录与放行**一起**变。
      const baseToolSet = Array.isArray(loaded.mod.BASE_TOOL_SET) ? loaded.mod.BASE_TOOL_SET : null
      const roleToolVerdictFn = loaded.mod.roleToolVerdict
      const toolCatalogForFn = loaded.mod.toolCatalogFor
      rec.readings.tool_executor_surface = {
        BASE_TOOL_SET: baseToolSet === null ? 'missing' : `array(${baseToolSet.length})`,
        roleToolVerdict: typeof roleToolVerdictFn,
        toolCatalogFor: typeof toolCatalogForFn,
      }
      if (baseToolSet === null) push('ROLE-TOOLS-SURFACE-MISSING', '现役 inject.js 没有导出 `BASE_TOOL_SET` —— "只裁模型面向的工具"这条口径无从量')
      if (typeof roleToolVerdictFn !== 'function') push('ROLE-TOOLS-SURFACE-MISSING', '现役 inject.js 没有导出 `roleToolVerdict` —— 角色表的 tools 只有装配那一半、没有调用时那一半')
      if (typeof toolCatalogForFn !== 'function') push('ROLE-TOOLS-SURFACE-MISSING', '现役 inject.js 没有导出 `toolCatalogFor` —— 角色表的 tools 在装配时没有读者')
      if (baseToolSet !== null && typeof roleToolVerdictFn === 'function' && typeof toolCatalogForFn === 'function') {
        const catalog = buildCatalog(baseToolSet)
        const shell = ['bash', 'pwsh']
        const frameworkExtras = ['run_code', 'framework_extra']
        const catalogOf = (role, narrow) => namesOfCatalog(toolCatalogForFn(role, narrow, catalog))
        const cells = [
          // [标签, 实际目录, 必须**在**的名字, 必须**不在**的名字]
          ['review（officeBound：没有命令行）', catalogOf('review', false), ['read', 'grep', 'write', 'edit', ...frameworkExtras], shell],
          ['dev（拿 base 全套）', catalogOf('dev', false), ['read', 'grep', 'write', 'edit', ...shell, ...frameworkExtras], []],
          ['窄（无角色）', catalogOf(undefined, true), ['read', 'write', 'edit', ...frameworkExtras], [...shell, 'glob', 'grep', 'proposal_file']],
          ['窄 + 有角色（窄赢过角色目录）', catalogOf('review', true), ['read', 'write', 'edit', ...frameworkExtras], [...shell, 'glob', 'grep']],
          ['无角色也不窄（row 0 / 0.5）', catalogOf(undefined, false), ['read', 'grep', ...shell, 'glob', ...frameworkExtras], []],
        ]
        const catalogReadings = {}
        for (const [label, got, mustHave, mustNot] of cells) {
          catalogReadings[label] = got
          for (const name of mustHave) {
            if (!got.includes(name)) push('ROLE-CATALOG-MISSING', `${label}：目录里少了 \`${name}\`（实得 ${JSON.stringify(got)}）`)
          }
          for (const name of mustNot) {
            if (got.includes(name)) push('ROLE-CATALOG-EXTRA', `${label}：目录里多了 \`${name}\`（实得 ${JSON.stringify(got)}）—— 角色表是工具集的唯一作者`)
          }
        }
        rec.readings.role_catalog = catalogReadings

        const toolCells = [
          ['review 调 pwsh ⇒ 拒（角色表那一格没有它）', ['review', 'pwsh'], 'E_GUARD_ROLE_TOOL'],
          ['review 调 bash ⇒ 拒（第二把）', ['review', 'bash'], 'E_GUARD_ROLE_TOOL'],
          ['review 调 read ⇒ 放行', ['review', 'read'], null],
          ['dev 调 pwsh ⇒ 放行（base 全套）', ['dev', 'pwsh'], null],
          ['review 调框架工具 run_code ⇒ 放行（不误伤 PTC）', ['review', 'run_code'], null],
          ['没有角色 ⇒ 不裁也不拒', [undefined, 'pwsh'], null],
          ['认不出的角色 ⇒ 不拒（fail-open，别把人锁死）', ['no-such-role', 'pwsh'], null],
          ['判决岗调 proposal_file ⇒ 不归这一格（那是 deny 那一格）', ['memory-judge', 'proposal_file'], null],
        ]
        const toolReadings = {}
        for (const [label, args, wantCode] of toolCells) {
          const r = callPure(roleToolVerdictFn, ...args)
          const out = r.err === null ? r.out : null
          toolReadings[label] = r.err === null ? (out === null || out === undefined ? null : (out?.code ?? String(out))) : { err: r.err }
          if (r.err !== null) { push('ROLE-TOOL-SHAPE', `${label}：roleToolVerdict 抛了（${r.err}）`); continue }
          const gotCode = out === null || out === undefined ? null : (typeof out?.code === 'string' ? out.code : null)
          if (wantCode === null && gotCode !== null) push('ROLE-TOOL-OVERBLOCK', `${label}：该放行却拒了（${JSON.stringify(out)}）`)
          if (wantCode !== null && gotCode !== wantCode) push('ROLE-TOOL-CODE', `${label}：应拒 ${wantCode}，实得 ${JSON.stringify(out)}`)
          if (wantCode !== null && gotCode === wantCode && (typeof out.message !== 'string' || out.message.trim() === '')) {
            push('ROLE-TOOL-MESSAGE', `${label}：拒了但报文是空的`)
          }
        }
        rec.readings.role_tool_verdict = toolReadings

        // 刀：`review` 那一格换成 base 全套（**证据根里的副本**；`presets/**` 零字节）⇒ 目录与放行一起变。
        const srcText = readRel('inject.js') ?? ''
        const tableKnife = knifeReplace({ source: srcText, find: '    tools: NO_SHELL_TOOLS,', replace: '    tools: Object.freeze([...BASE_TOOL_SET]),' })
        if (!tableKnife.ok) push(tableKnife.code, `角色工具集那把刀的落点不对：${tableKnife.why}`)
        else {
          const cut = await importSourceCopy({ dir: path.join(caseDir('PRS-04'), 'knife-role-tools'), source: tableKnife.source })
          if (!cut.ok) push(cut.code, `角色工具集那把刀 import 不了（那不是"变绿"，是换个崩法）：${cut.why}`)
          else {
            const mutantCatalog = namesOfCatalog(cut.mod.toolCatalogFor('review', false, catalog))
            const mutantVerdict = callPure(cut.mod.roleToolVerdict, 'review', 'pwsh')
            rec.readings.role_tools_knife = {
              baseline_catalog: catalogOf('review', false),
              mutant_catalog: mutantCatalog,
              baseline_verdict: toolReadings['review 调 pwsh ⇒ 拒（角色表那一格没有它）'],
              mutant_verdict: mutantVerdict.err === null ? (mutantVerdict.out?.code ?? null) : { err: mutantVerdict.err },
            }
            if (toolReadings['review 调 pwsh ⇒ 拒（角色表那一格没有它）'] !== 'E_GUARD_ROLE_TOOL') {
              push('ROLE-TOOLS-KNIFE-NO-BASELINE', '刀之前 review 那一格就不是"拒" ⇒ 这一刀没有可比的对象')
            }
            for (const name of shell) {
              if (!mutantCatalog.includes(name)) {
                push('ROLE-TOOLS-KNIFE-NOT-FLIPPED', `把 review 那一格换成 base 全套之后，目录里仍然没有 \`${name}\`（${JSON.stringify(mutantCatalog)}）`
                  + ' ⇒ 目录不是从角色表那一格读的')
              }
            }
            if (mutantVerdict.err !== null || (mutantVerdict.out !== null && mutantVerdict.out !== undefined)) {
              push('ROLE-TOOLS-KNIFE-NOT-FLIPPED', `把 review 那一格换成 base 全套之后，roleToolVerdict('review','pwsh') 仍然拒（${JSON.stringify(mutantVerdict.out)}）`
                + ' ⇒ 调用时那一半不是从角色表读的')
            }
          }
        }
      }

      // ── ⑥ 角色人格**真的被注入**（第三轮评审 N-5；定形 §6.1「子会话拿到那个角色的 persona/charter」）──
      //    这一段量的是装配出来的**正文**：`agenia:role-persona` 紧挨 `agenia:charter:<role>` 之前、
      //    正文逐字是角色表那一格、且**全上下文里只出现一次**（"一条 carrier"的运行时那一半）。
      //    翻面（刀）：把表里 `dev` 那一句换成一句哨兵 ⇒ 注入的正文必须跟着换。
      const ymlText = readRel('agent.cordis.yml')
      const devEntry = byRoleTable.get('dev')
      const devPersona = typeof devEntry?.persona === 'string' ? devEntry.persona : null
      if (ymlText === null) push('SUT-SURFACE-MISSING', '读不到 agent.cordis.yml —— 运行时载具的 config 没有来源')
      else if (devPersona === null || devPersona.trim() === '') push('PERSONA-MISSING', '角色表里 dev 的 persona 是空的 —— 注入那一侧没有可比的对象')
      else if (baseToolSet === null) push('ROLE-TOOLS-SURFACE-MISSING', '没有 `BASE_TOOL_SET` ⇒ 合成目录造不出来（这一腿量不了）')
      else {
        const contentRoot = path.join(runRoot(), 'tmp', 'prs-harness', 'PRS-04')
        buildContentRoot({ root: contentRoot, presetDir: PRESET, runRoot: runRoot() })
        const conf = configFromComposition({ ymlText, contentDir: contentRoot })
        const catalog = buildCatalog(baseToolSet)
        if (!conf.ok) push('HARNESS-CONFIG', conf.why)
        else {
          const memberConf = { ...conf.config, defaultRole: 'member' }
          /** 跑一条会话，量 persona / charter 那两条上下文。 */
          const runPersona = async (targetMod, header, id) => {
            let reading = null
            await withHarness(targetMod, { contentDir: contentRoot, config: memberConf, header, id, catalog }, async (h) => {
              const out = await h.assemble()
              const names = injectedNames(out)
              const personaIdx = names.indexOf('agenia:role-persona')
              const charterIdx = names.findIndex((name) => String(name).startsWith('agenia:charter:'))
              const personaText = injectedText(out, 'agenia:role-persona')
              const occurrences = (out?.contexts ?? []).filter((entry) => typeof entry?.text === 'string' && personaText !== '' && entry.text.includes(personaText)).length
              reading = { names, personaIdx, charterIdx, personaText, occurrences }
            })
            return reading
          }
          const devHeader = { cwd: contentRoot, agentPreset: 'agenia-member', toolName: 'team_dev' }
          const baseline = await runPersona(loaded.mod, devHeader, 'prs-persona-dev')
          rec.readings.persona_injection = baseline
          if (baseline === null) push('SIDE-HARNESS', 'persona 那一腿：载具没量出东西（apply / assemble 失败）')
          else {
            if (baseline.personaIdx < 0) push('PERSONA-NOT-INJECTED', `row 4 组员会话没有拿到 \`agenia:role-persona\`（实得 ${JSON.stringify(baseline.names)}）`)
            else {
              if (baseline.charterIdx !== baseline.personaIdx + 1) {
                push('PERSONA-ORDER', `\`agenia:role-persona\` 必须紧挨在 \`agenia:charter:<role>\` 之前（实得 persona@${baseline.personaIdx} · charter@${baseline.charterIdx}）`)
              }
              if (baseline.personaText !== devPersona) {
                push('PERSONA-DRIFT', `注入的人格不是角色表里那一句（表=${JSON.stringify(devPersona.slice(0, 40))}… · 注入=${JSON.stringify(baseline.personaText.slice(0, 40))}…）`)
              }
              if (baseline.occurrences !== 1) {
                push('PERSONA-MULTI-CARRIER', `那一句人格在上下文里出现了 ${baseline.occurrences} 次（必须恰好 1 次）—— 第二个作者会让"改哪儿"重新变成猜谜`)
              }
            }
          }
          // 另一方向：没有角色的组员侧会话（row 5）两条都不吐（没有人格，也就没有说明书）。
          const row5 = await runPersona(loaded.mod, { cwd: contentRoot, agentPreset: 'agenia-member' }, 'prs-persona-row5')
          rec.readings.persona_row5 = row5
          if (row5 !== null) {
            if (row5.names.includes('agenia:role-persona')) push('PERSONA-WITHOUT-ROLE', '没有角色的会话拿到了 `agenia:role-persona` —— 那一格是角色表按角色查的')
            if (row5.charterIdx >= 0) push('PERSONA-WITHOUT-ROLE', '没有角色的会话拿到了 charter')
          }
          // 刀：把表里 `dev` 那一句换成哨兵（**证据根里的副本**）⇒ 注入的正文必须跟着换。
          const sentinel = '【PRS-04 刀】这是一句被换掉的角色人格'
          const personaKnife = knifeReplace({ source: readRel('inject.js') ?? '', find: devPersona, replace: sentinel })
          if (!personaKnife.ok) push(personaKnife.code, `人格那把刀的落点不对：${personaKnife.why}`)
          else {
            const cut = await importSourceCopy({ dir: path.join(caseDir('PRS-04'), 'knife-persona'), source: personaKnife.source })
            if (!cut.ok) push(cut.code, `人格那把刀 import 不了（那不是"变红"，是换个崩法）：${cut.why}`)
            else {
              const mutant = await runPersona(cut.mod, devHeader, 'prs-persona-dev-mut')
              rec.readings.persona_knife = mutant
              if (mutant === null || mutant.personaText !== sentinel) {
                push('PERSONA-KNIFE-NOT-FLIPPED', `把表里 dev 那一句换掉之后，注入的正文没有跟着换（实得 ${JSON.stringify(mutant?.personaText ?? null)}）`
                  + ' ⇒ 注入的不是角色表那一格（"唯一作者"这句话没有运行时落点）')
              }
            }
          }
        }
      }
      caseFail(problems)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PRS-05 · 九条委派行写死的模型**真的落到子会话**（2026-11-08 · 老板改模型）
  // ═══════════════════════════════════════════════════════════════════════════
  test('PRS-05 九条委派行写死的模型落到子会话：真插件算出的 agentOptions = deepseek-flash（不是读 yml）', async () => {
    await runCase('PRS-05', async (rec) => {
      const problems = []
      const push = (code, msg) => problems.push(problem(code, msg))

      const ymlText = readRel('agent.cordis.yml')
      const patchText = readRel('cordis.patch.yml')
      if (ymlText === null) push('SUT-SURFACE-MISSING', `读不到 ${path.join(PRESET, 'agent.cordis.yml')}`)
      if (patchText === null) push('SUT-SURFACE-MISSING', `读不到 ${path.join(PRESET, 'cordis.patch.yml')}`)
      if (ymlText === null || patchText === null) return caseFail(problems)

      // 🔴 量的是**装好的真插件**（`resources/app.asar`），不是这份 yml；口径见 support/subagent-options.mjs 文件头。
      //    读数是它交给 `startActivation` 的 `request.agentOptions` + 真运行时算出的子 Agent options。
      const out = await childModelReadings({
        compositionText: ymlText,
        patchText,
        toolNames: TOOL_NAMES,
        workspace: caseDir('PRS-05'),
      })
      rec.readings.model_pin = {
        ...CHILD_MODEL_PIN,
        display_name: CHILD_MODEL_DISPLAY_NAME,
        display_name_note: '`DeepSeek-V41-Flash` 只是显示名；yml 里必须写模型 id `deepseek-flash`',
      }
      rec.readings.measured_layer = out.readings.measured_layer
      rec.readings.child_session_record = out.readings.child_session_record
      rec.readings.plugin = out.readings.plugin
      rec.readings.profile = out.readings.profile
      // 为什么量的是"子 Agent options"而不是"子会话记录"：子会话 header 的白名单里没有 provider/model
      // （`dsh-session` 的 `validateSessionHeader()`，本跑现读）；路由住在 `ctx.agents.create()` 的 options 里。
      rec.readings.session_header = out.readings.session_header
      rec.readings.parent_route = out.readings.parent_route
      rec.readings.rows = out.readings.rows
      rec.readings.knife = out.readings.knife ?? null
      rec.readings.patch_rows = out.readings.patch_rows ?? null

      if (out.hold !== undefined && out.hold !== null) caseHold(rec, out.hold.code, out.hold.why)
      for (const p of out.problems) push(p.code, p.message)

      // 插件读不到（HOLD）时下面这几条**一条都不跑** —— 否则"判不了"会被二次判成红（那是假红，不是读数）。
      if (out.hold === undefined || out.hold === null) {
        // 另一方向（**必须真的驱动过一个 `team_*` 工具**）：九行里至少一条 `team_*` 拿到了写死的那一对。
        const teamDriven = out.readings.rows.filter((r) => typeof r.toolName === 'string' && r.toolName.startsWith('team_'))
          .filter((r) => r.requested?.provider === CHILD_MODEL_PIN.provider && r.requested?.model === CHILD_MODEL_PIN.model)
        rec.readings.team_rows_driven = teamDriven.map((r) => r.toolName)
        if (teamDriven.length === 0) {
          push('CHILD-MODEL-TEAM-ROW-NOT-DRIVEN', '九条委派行里没有一条 `team_*` 真的被驱动出写死的那一对 —— 这一格要的是"派一个组员"那条路（不是只读配置）')
        }
        // 九行一条不多一条不少（量具自己也要对账：少一行 = 那一行没人量）。
        if (out.readings.rows.length !== TOOL_NAMES.length) {
          push('CHILD-MODEL-ROW-COUNT', `量到的委派行 ${out.readings.rows.length} 条，角色表闭表是 ${TOOL_NAMES.length} 条`)
        }
        const undriven = out.readings.rows.filter((r) => r.error !== null && r.error !== undefined).map((r) => r.toolName)
        if (undriven.length > 0) push('CHILD-MODEL-ROW-UNDRIVEN', `这些行没被真插件驱动出来：${JSON.stringify(undriven)}`)
      }
      caseFail(problems)
    })
  })
})
