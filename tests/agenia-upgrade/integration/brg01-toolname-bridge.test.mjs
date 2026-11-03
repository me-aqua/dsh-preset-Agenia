/**
 * `BRG-01`…`BRG-07` —— **`toolName` 插件桥**（父会话记、子会话取）的自动判据。
 *
 * 契约：`.team/test/CONTRACT-A-bridge.md`（规则 R1–R12 · 行映射 §5 · A0a 行 §6 · 失败模式 §7）。
 * 票：老板 2026-11-02 11:33「不改客户端本体，改走 `inject.js` 插件桥接」；
 * 长期票 `ticket-20261102-01`（平台侧给 `childSessionMeta` 带 `toolName`）仍然开着 —— 本桥是它的绕行。
 *
 * ── 今天为什么红（第 2 关，功能未做）──────────────────────────────────────────
 * 子会话头是 `["cwd","agentPreset","origin","parentSession"]`（**没有 `toolName`**）⇒
 * `identityVerdict()` 落 **row 5**：无角色、窄权限、人设与说明书**都不注入**、目录只剩
 * `read/write/edit`（`bash`/`pwsh` 被裁掉）——
 * 派工单要的就是这一格：`team_test` 写不了 `tests/`、`job_technical_review` 跑不了命令。
 * 六格因此都红在"桥没做"这一侧，红因码逐条见契约 §9；**不许**是 `SUT-SURFACE-MISSING` /
 * import 崩 / 夹具异常（那是"换个崩法"，不是判据）。
 *
 * ── 量的是哪棵树（口径，别读成"打的是 E:\Harness"）────────────────────────────
 * 本文件**按 `import.meta.url` 自己推根**（`HERE → REPO → PRESET`），不经过 `PATHS.finalPreset`：
 * 它量的是**跑着的这份测试代码所在的那棵树**的 `presets/agenia`（副本 / worktree 里也成立）。
 * `PATHS.finalPreset` 现在也由 `root-guard.mjs` 按自身位置派生（`REPO_ROOT` → `presets/agenia`），
 * 与这里推出同一个根；这一格仍然自己推一次，是为了让**被测树**这个输入不依赖另一个模块的实现
 * （`cand-20261028-0461`：根定在别处 ⇒ 红的那条会被人当成被测对象的问题）。
 * 路径 + `inject.js` 的 sha256 写进每一格的 `readings.preset`（"这份证据量的是哪一版"必须自报，
 * `cand-20261019-0033`）。
 *
 * ── 两实例 = 生产拓扑（**推断**，见契约 §2 / §10.2）──────────────────────────
 * `cordis.patch.yml:81`（`preset-agenia`）与 `:613`（`preset-agenia-member`）各有一行
 * `persona-injector`，两行都指同一个 `inject.js` ⇒ 模块只加载一次、`apply()` 被调两次、两套闭包。
 * 所以每一发都**先起组长那份 `apply()` 记 claim，再起组员那份 `apply()` 装配子会话** ——
 * 写成"一次 `apply()` 里父子共用一张表"就测不到闭包各存各的那个坑（契约 F11 / R5）。
 *
 * ── 阳性对照（红不是目的，能翻面才是判据）──────────────────────────────────────
 * 三件事各证一半，缺一半就别把"红"读成判据：
 *   ① **读路是健康的**：`BRG-03` 里"会话头**本来就有** `toolName`"那条腿今天就是绿的（人设 / 说明书 / 目录
 *      三面都判）—— 与 `BRG-02` 是同一批读法（`.team/test/2026-11-02/_probe/brg-probe.mjs` 的 B 发）；
 *   ② **读法器抽得出来**：`BRG-02` 先拿一条照契约写的合成行喂给取词函数（`BRG-A0A-READER`）——
 *      读法器一坏，每条断言都会以"读不出来"的样子变红（假红；本文件第一版就栽在全角冒号那一处）；
 *   ③ **整批能翻绿**：`BRG_SUT_INJECTOR` 指到一份照契约写的最小实现**副本**
 *      （`.team/test/2026-11-02/_probe/brg-mutant.mjs` 五刀造出，`presets/**` 零字节）⇒ 实测
 *      `RED 0 / GREEN 6`。⚠️ 那份副本**不是实现**：它只回答"六格能不能翻面"，读数里
 *      `readings.preset.sut_overridden` 会把这件事印出来。
 *
 * ── 桥现在怎么取 claim（`BRG-07` 锁的就是这一条）──────────────────────────────
 * `bridgeTakeClaim` 先拿**子会话自己的第一条用户消息**给 claim 对号（`inject.js::firstUserPromptOf`），
 * 只认**完整相等**（`item.prompt === prompt`）：对不上就**不取**（子会话落 row 5，安全），
 * 不退回队列队首。只有**取不到**第一条用户消息（`prompt === ''`）那一支才退回队首 ——
 * 那条老路径仍在，由 `BRG-FALLBACK-LOST` 单独锁着。
 * 理由：并行派两发时子会话的启动先后与父会话的调用先后**无关**，只按队列取
 * 会把两个角色发给对方。`BRG-04` 量的是"退回队列"那一侧，`BRG-07` 量的是"按 prompt 对号（完整相等）"那一侧。
 *
 * `BRG-07` 的翻面读数（都是 `run-all --glob=integration/brg01-toolname-bridge.test.mjs` 跑的；
 * 字节数与 sha256 量的是**提交里那个 blob**（`HEAD:presets/agenia/inject.js`），不是工作树）：
 *   · 现役 `inject.js`（提交 `ee48c24` · 222455 B · sha256 `37D63DAA…`）⇒ **RED 0 / GREEN 7**
 *     （run `b02-brg`：在 `ee48c24` 的**克隆**里跑的 —— 那一跑 `F57-TARGET 靶子=现役 · 50 份逐字节相同`，
 *     `readings.preset.injector` 与 `production_injector` 是同一个数 ⇒ 量的就是这一段点名的那一份）；
 *     三个数（提交号 / 字节数 / sha256）由 `FLIP-01` 逐项对上，**任一变化它当场红**。
 *   · 把 `BRG_SUT_INJECTOR` 指到修前那一份**副本**（`.team/test/2026-11-02/_probe/_run/pre-fix-inject.mjs`
 *     · 212390 B · sha256 `0314BD9B…`；它与提交 `6c848dd` 那份逐字节相同，`presets/**` 零字节；
 *     那一跑 `sut_overridden=true` / `acceptance_eligible=false`）
 *     ⇒ **RED 1 / GREEN 6**，红的就是 `BRG-07`：`BRG-PARALLEL-SWAP-TEST` ×3 + `BRG-PARALLEL-SWAP-REVIEW` ×3
 *     （三组里角色都换成了对方的）+ `BRG-PARALLEL-PERSONA` ×6（run `p02-brg-prefix`）
 *     —— 这一格只在"按 prompt 对号（完整相等）"那把修上翻面。
 */
import { before, describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import {
  buildCatalog, buildContentRoot, catalogNames, configFromComposition,
  injectedNames, injectedText, loadInjector, plantDailyReport, withHarness,
} from '../support/injector-harness.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// 被测树 = **本工作区**的 `presets/agenia`（不是 `PATHS.finalPreset`，理由见文件头）
// ─────────────────────────────────────────────────────────────────────────────
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const PRESET = path.join(REPO, 'presets', 'agenia')
const INJECTOR = path.join(PRESET, 'inject.js')
const YML = path.join(PRESET, 'agent.cordis.yml')
const PATCH = path.join(PRESET, 'cordis.patch.yml')
/**
 * 🔴 **阳性对照用的替换口**（默认空 = 量生产那一份）。
 *
 * 为什么留这个口：这一批是"功能还没做"的首跑红 —— 红要能翻面才叫判据，
 * 而"翻面"只能用一份**照契约写的最小实现**来证明。最小实现不许写进 `presets/`
 * （那一格是实现岗的），所以它落在 `.team/test/<日期>/_probe/_run/` 里的**副本**上，
 * 由 `BRG_SUT_INJECTOR` 指过来。口径与 `AGENIA_F125_SUT_TOOL` / `AGENIA_TREE_AT_COMMIT` 同族：
 * **指过来的时候读数里必须自报**（`readings.preset.sut_overridden = true` + 那一份的 sha256），
 * 否则"这份证据量的是哪一版"又变成自报（`cand-20261019-0033`）。
 */
const SUT_FILE = typeof process.env.BRG_SUT_INJECTOR === 'string' && process.env.BRG_SUT_INJECTOR.trim() !== ''
  ? path.resolve(process.env.BRG_SUT_INJECTOR)
  : INJECTOR

/**
 * 🔴 **验收门槛：`sut_overridden` 必须是 `false`**（组长 2026-11-02 裁）。
 * 替换口只许用来做阳性对照；**验收读数必须来自"没被替换"的那一跑**。两处一起兜：
 *   ① 被替换的那一跑在**控制台上**当场出声（一次，模块加载时）—— 一个全量的绿跑不可能"悄悄"是替换跑；
 *   ② 每一格 `readings.preset.acceptance_eligible` 记下这一跑能不能当验收证据
 *      （配套读法 `.team/test/_tools/brg-sut-check.mjs <RUN_ID>`：不是全 false 替换它就非零退出）。
 */
const SUT_OVERRIDDEN = SUT_FILE !== INJECTOR
if (SUT_OVERRIDDEN) {
  console.error(
    `[BRG] 🔴 SUT 被替换（BRG_SUT_INJECTOR）：${SUT_FILE}`
    + `\n        生产是 ${INJECTOR}`
    + '\n        这一跑**不是验收证据**（acceptance_eligible=false）—— 验收必须跑 sut_overridden:false 的那一版',
  )
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()

/**
 * 角色表**手写副本**（九个 `toolName → role` + `review` 没有 shell）。
 * 为什么抄一份：判据的期望值不许从被测物反推（`cand-20261016-selfsourced-order-01`）——
 * 这一份是"定形 §2.2 那张闭表"的复述，与 `ROLE_TABLE` 是两份独立载体；两边一起错的时候才看不见。
 */
const ROLE_PAIRS = [
  ['team_design', 'design'],
  ['team_dev', 'dev'],
  ['team_test', 'test'],
  ['team_review', 'review'],
  ['subagent', 'hire'],
  ['job_memory_judge', 'memory-judge'],
  ['job_memory_review', 'memory-review'],
  ['job_conversation_review', 'conversation-review'],
  ['job_technical_review', 'technical-review'],
]
/** 只有 `review` 没有命令行（`ROLE_TABLE[review].tools = NO_SHELL_TOOLS`）。 */
const NO_SHELL_ROLES = ['review']
/** 手写的人设开头（三份取样：`test` / `dev` / `review`）—— 又从表里抄一遍就是自证。 */
const PERSONA_PREFIX = {
  test: '你是这个项目的测试与流水线负责人',
  dev: '你是这个项目的实现者',
  review: '你是这个项目的独立评审',
}

// ─────────────────────────────────────────────────────────────────────────────
// 小工具
// ─────────────────────────────────────────────────────────────────────────────
/** 被测面（`loadInjector` 在 `before` 之后才有；缺面记 SUT-…，不 import 崩）。 */
let SUT = { ok: false, code: 'SUT-SURFACE-MISSING', why: '还没加载', mod: null }

/** 这一格量的是哪一版：被测那一份 + **判据自己这一份**（路径 + 字节 + sha256，`cand-20261019-0033`）。 */
function presetReadings() {
  try {
    return {
      root: PRESET,
      injector: { file: SUT_FILE, bytes: readFileSync(SUT_FILE).length, sha256: sha256(SUT_FILE) },
      production_injector: { file: INJECTOR, sha256: existsSync(INJECTOR) ? sha256(INJECTOR) : null },
      sut_overridden: SUT_FILE !== INJECTOR,
      /** 组长 2026-11-02 裁：**验收读数必须 `true`**（被替换过的跑不许当验收证据）。 */
      acceptance_eligible: SUT_FILE === INJECTOR,
      // 🔴 判据自己这一份：`run-all` 的 `[尺子]` 量的是 `PATHS.testRoot`（硬编码 `E:\Harness`），
      //    在 worktree 里它说的**不是**跑着的这份测试代码 ⇒ 这一格自己把本文件的 sha256 记下来。
      test_file: { file: fileURLToPath(import.meta.url), bytes: readFileSync(fileURLToPath(import.meta.url)).length, sha256: sha256(fileURLToPath(import.meta.url)) },
      patch_rows: [81, 613],
      note: '本文件按自身位置推根；不使用 PATHS.finalPreset（那是硬编码的 E:\\Harness 活树）',
    }
  } catch (err) {
    return { root: PRESET, injector: { file: SUT_FILE }, error: String(err?.message ?? err), sut_overridden: SUT_FILE !== INJECTOR }
  }
}

/** 装配结果 → 四样读数（注入面 / 工具面）。 */
function digestOf(assembled) {
  const names = injectedNames(assembled)
  const catalog = catalogNames(assembled)
  return {
    contexts: names,
    persona: injectedText(assembled, 'agenia:role-persona'),
    charters: names.filter((name) => String(name).startsWith('agenia:charter:')),
    catalog,
    shell: catalog.includes('bash') && catalog.includes('pwsh'),
    leader_side: names.includes('agenia:leader'),
  }
}

/**
 * 一行一次性读数里取一个 `name=value`（值到空白或 `·` 为止；引号里的值成对保留）。
 * ⚠️ 前导分隔符要连**全角冒号**一起认：`…（不是判定行）：row=5` 的那一格就长在 `：` 后面 ——
 *    不认它的话 `row` 永远取成 null，"row 不对"就会以"读不出来"的样子变红（假红的一种）。
 */
function tokenOf(line, name) {
  if (typeof line !== 'string') return null
  const m = new RegExp(`(?:^|[\\s（(·：:])${name}=("(?:[^"\\\\]|\\\\.)*"|[^\\s·]*)`).exec(line)
  if (m === null) return null
  const raw = m[1]
  return raw.startsWith('"') ? raw.slice(1, -1) : raw
}

/** A0a 那一行里的 `header_keys` → 字符串数组（读不出 ⇒ null，**不猜**）。 */
function headerKeysOf(line) {
  const raw = tokenOf(line, 'header_keys')
  if (raw === null) return null
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.map(String) : null
  } catch {
    return null
  }
}

/** 一条父会话（组长那份 `apply()`）：挂一次门禁调用，返回它的判词。 */
async function parentCall({ contentDir, conf, catalog, tool, args = {}, parentSid, agentId = 'agent-parent', extraHeader = {} }) {
  const header = { id: parentSid, cwd: contentDir, agentPreset: 'agenia', ...extraHeader }
  const agent = { id: agentId, session: { id: agentId, header } }
  let guard = null
  await withHarness(SUT.mod, { contentDir, config: conf, header, id: parentSid, catalog }, async (harness) => {
    guard = harness.guard({ name: tool, arguments: args, agent })
  })
  return { tool, args, guard, agent_id: agentId, header_id: parentSid }
}

/**
 * 一条子会话（组员那份 `apply()`）：走一次装配，返回读数 + 日志 + 会话头的前后指纹。
 * ⚠️ 子会话头**不带** `toolName`（除非显式给）—— 这是这一票要修的那个形状。
 * `messages`：这条会话的消息列表（桥按**第一条用户消息**给 claim 对号，见 `BRG-07`）；
 * 不给 ⇒ 会话形状与从前一样（没有 `messages` ⇒ 取不到第一条用户消息，桥走 `prompt === ''` 那一支：退回队首）。
 */
async function childAssemble({ contentDir, conf, catalog, childSid, header, sections = [], messages = undefined }) {
  const headerBefore = JSON.stringify(header)
  const keysBefore = Object.keys(header).sort()
  let reading = null
  let messagesSeen = null
  const logs = []
  await withHarness(SUT.mod, { contentDir, config: conf, header, id: childSid, catalog, messages }, async (harness) => {
    reading = digestOf(await harness.assemble(sections))
    logs.push(...harness.logs)
    // 夹具自证：装配那一刻会话里到底有没有那条消息（见 `BRG-HARNESS-MESSAGES`）。
    messagesSeen = typeof harness.session === 'function' ? (harness.session()?.messages ?? null) : null
  })
  return {
    child_id: childSid,
    reading,
    messages_seen: messagesSeen,
    a0a: logs.find((line) => line.includes('A0a 身份读数')) ?? null,
    header_keys_before: keysBefore,
    header_json_same: JSON.stringify(header) === headerBefore,
    header_keys_after: Object.keys(header).sort(),
  }
}

/**
 * **每日评审闸要的产物**（`RGATE-01` / `bug-20261103-01`，2026-11-03 落进生产）。
 *
 * 闸的规则：`job_conversation_review` / `job_technical_review` 被拒，除非内容根里有
 * `<内容根>/.runtime/reports/memory-update/<day>.json`。本文件量的是**桥**（记 claim / 取角色），
 * 不是那道闸 —— 不补这份产物，这两发委派会在门禁里被拒、claim 记不上，
 * `BRG-01` / `BRG-03` / `BRG-04` / `BRG-07` 会以"桥丢了名字"的样子红（2026-11-03 实测四条）。
 *
 * ⚠️ **不在夹具里再算一次 04:00 切点**（那是"切点"的第二份真相）：窗口按**本地日历**取
 * 前一天 / 当天 / 后一天 —— 一个健康脑根本来就攒着多天的报告，跑一次最多跨一次边界，
 * 切点落在哪一侧都在这三天里。闸自己的两侧（该拒 / 该放行 / 日子算得对不对）由 `RGATE-01` 判。
 * 断言一条没动：补的只是"环境里该有的那份产物"。
 */
function plantDailyReports(contentDir, nowMs = Date.now()) {
  const now = new Date(nowMs)
  return [-1, 0, 1].map((delta) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta)
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return plantDailyReport(contentDir, day, 'BRG 夹具：桥要的量的是委派，不是每日评审闸；这份产物只是把闸要的环境补齐')
  })
}

/** 一格要的东西：内容根 + config + 目录（每格一份，落在运行根里）。 */
function fixture(id) {
  const contentDir = path.join(runRoot(), 'tmp', 'brg', id)
  const built = buildContentRoot({ root: contentDir, presetDir: PRESET, runRoot: runRoot() })
  const conf = configFromComposition({ ymlText: readFileSync(YML, 'utf8'), contentDir })
  const base = Array.isArray(SUT.mod?.BASE_TOOL_SET) ? SUT.mod.BASE_TOOL_SET : null
  const dailyReports = plantDailyReports(contentDir)
  return {
    contentDir,
    built,
    dailyReports,
    conf,
    catalog: base === null ? null : buildCatalog(base),
    config: conf.ok ? { ...conf.config, defaultRole: 'member' } : null,
  }
}

/** 每一格的头三件事：被测面在不在 / 夹具成不成立 / 配置读不读得出。 */
function prerequisites(problems, fx) {
  if (!SUT.ok) {
    problems.push(problem(SUT.code ?? 'SUT-SURFACE-MISSING', `被测面没加载上：${SUT.why}`))
    return false
  }
  if (fx.conf?.ok !== true) {
    problems.push(problem('BRG-HARNESS-CONFIG', `载具的 config 读不出来：${fx.conf?.why ?? '(无)'}`))
    return false
  }
  if (fx.catalog === null) {
    problems.push(problem('BRG-HARNESS-CATALOG', '现役 inject.js 没有导出 `BASE_TOOL_SET` —— 合成工具目录无从造'))
    return false
  }
  return true
}

/**
 * 预检 + 加载被测面。
 * ⚠️ 这个钩子必须在**所有常量与 helper 之后**登记：`node:test` 里顶层 `before()` 会比模块体
 * 后面那些 `const` 先跑（实测 `Cannot access 'INJECTOR' before initialization`），
 * 放在文件末尾才拿得到已经初始化好的路径与 `SUT`。
 */
before(async () => {
  preflight()
  SUT = await loadInjector(SUT_FILE)
})

// ─────────────────────────────────────────────────────────────────────────────
// BRG-01 · 记录面：父会话门禁那一侧记下这次委派的工具名
// ─────────────────────────────────────────────────────────────────────────────
describe('integration · toolname-bridge (任务 A 绕行)', () => {
  test('BRG-01 父会话 tools.guard 记下委派的 toolName（两实例 / 只记角色表九名 / 只在放行那一刻记）', async () => {
    await runCase('BRG-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const fx = fixture('BRG-01')
      rec.readings.preset = presetReadings()
      // 拓扑前提的**可查**读数：两份预设各一行 `persona-injector`（两棵插件树 = 两次 apply()）。
      // 数不是 2 ⇒ 本文件的"两实例"这一层要么量宽了、要么量窄了 —— 先把它写出来，再往下判。
      try {
        const patchText = readFileSync(PATCH, 'utf8')
        rec.readings.topology_rows = (patchText.match(/^\s*-\s*id:\s*persona-injector\s*$/gm) ?? []).length
      } catch (err) {
        rec.readings.topology_rows = null
        rec.readings.topology_error = String(err?.message ?? err)
      }
      rec.readings.product_topology = {
        claim: '两份预设各一行 persona-injector（cordis.patch.yml:81 / :613）⇒ apply() 被调两次、两套闭包',
        source: 'cordis.patch.yml 里 `- id: persona-injector` 出现的两次（行号见 readings.patch_rows）',
        level: '推断（读文件得出）；真拓扑归第 5 关',
        actual_rows: rec.readings.topology_rows,
      }
      if (rec.readings.topology_rows !== null && rec.readings.topology_rows < 1) {
        push('BRG-TOPOLOGY-PREMISE', 'cordis.patch.yml 里一行 `persona-injector` 都没有 —— 这条路上根本没有注入器，整张票无从谈起')
      }
      if (!prerequisites(problems, fx)) return caseFail(problems)

      const { contentDir, config, catalog } = fx
      /** 一发：父记 → 子取。返回子会话读数与父会话判词。 */
      const shot = async (label, { tool, args, parentSid, agentId, childSid, childHeader, childSections = [] }) => {
        const parent = await parentCall({ contentDir, conf: config, catalog, tool, args, parentSid, agentId })
        const child = await childAssemble({ contentDir, conf: config, catalog, childSid, header: childHeader, sections: childSections })
        return { label, tool, parent, child }
      }
      const childHeader = (parentSid, extra = {}) => ({
        cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: parentSid, ...extra,
      })

      // ① 两实例正例：`team_test`（组长那份 apply 记，组员那份 apply 取）
      const testShot = await shot('team_test', {
        tool: 'team_test', parentSid: 'brg01-p-test', agentId: 'brg01-agent-parent-test',
        childSid: 'brg01-c-test', childHeader: childHeader('brg01-p-test'),
      })
      // ② 两实例正例：`job_technical_review`（四个一次性作业里的一个）
      const jobShot = await shot('job_technical_review', {
        tool: 'job_technical_review',
        parentSid: 'brg01-p-job', agentId: 'brg01-agent-parent-job',
        childSid: 'brg01-c-job', childHeader: childHeader('brg01-p-job'),
      })
      // ③ 串父会话：父 p-other 记 `team_design`，子会话却说自己的父是 p-stranger
      const crossShot = await shot('串父会话', {
        tool: 'team_design', parentSid: 'brg01-p-other', agentId: 'brg01-agent-parent-other',
        childSid: 'brg01-c-stranger', childHeader: childHeader('brg01-p-stranger'),
      })
      // ④ 非角色名：`workflow` / `subagent_fork` 不在角色表里 ⇒ 一条都不许记
      const workflowShot = await shot('workflow', {
        tool: 'workflow', parentSid: 'brg01-p-workflow', agentId: 'brg01-agent-parent-workflow',
        childSid: 'brg01-c-workflow', childHeader: childHeader('brg01-p-workflow'),
      })
      const forkShot = await shot('subagent_fork', {
        tool: 'subagent_fork', parentSid: 'brg01-p-fork', agentId: 'brg01-agent-parent-fork',
        childSid: 'brg01-c-fork', childHeader: childHeader('brg01-p-fork'),
      })
      // ⑤ 被门禁拒绝的那一发：拒掉的委派不会起子会话 ⇒ 不许记
      const rejectedShot = await shot('被拒的 job_technical_review', {
        tool: 'job_technical_review', args: { run_in_background: false },
        parentSid: 'brg01-p-rejected', agentId: 'brg01-agent-parent-rejected',
        childSid: 'brg01-c-rejected', childHeader: childHeader('brg01-p-rejected'),
      })

      rec.readings.shots = Object.fromEntries([testShot, jobShot, crossShot, workflowShot, forkShot, rejectedShot]
        .map((item) => [item.label, {
          tool: item.tool,
          args: item.parent.args,
          guard_reason: item.parent.guard?.reason ?? null,
          guard_ok: item.parent.guard?.ok ?? null,
          child: item.child.reading,
          a0a: item.child.a0a,
        }]))

      for (const shotItem of [testShot, jobShot, crossShot, workflowShot, forkShot, rejectedShot]) {
        if (shotItem.child.reading === null) push('BRG-HARNESS-ASSEMBLE', `${shotItem.label}：装配没有产出（夹具/入口失败）`)
        if (shotItem.parent.guard === null) push('BRG-HARNESS-GUARD', `${shotItem.label}：门禁没有回调（夹具/入口失败）`)
        if (shotItem.parent.guard?.ok !== true) push('BRG-GUARD-NOT-MOUNTED', `${shotItem.label}：这个注入器没有注册 tools.guard（${shotItem.parent.guard?.why ?? '(无)'}）`)
      }

      const persona = (item) => item.child.reading?.persona ?? ''
      const charterOf = (role) => `agenia:charter:${role}`

      // ① / ②：两条正例 —— 桥必须让父会话记下来的名字落到子会话身上
      if (!(persona(testShot) !== '' && testShot.child.reading.charters.includes(charterOf('test')))) {
        push('BRG-CLAIM-NOT-RECORDED',
          '父会话门禁放行了 `team_test`，但组员那份 apply 里的子会话仍然没有角色'
          + `（persona=${JSON.stringify(persona(testShot).slice(0, 24))} · charters=${JSON.stringify(testShot.child.reading?.charters ?? null)}）`
          + ' —— 记录面与消费面没有通（闭包各存各的 = 契约 F11；根本没记 = 契约 R1/R2）')
      }
      if (!(persona(jobShot) !== '' && jobShot.child.reading.charters.includes(charterOf('technical-review')))) {
        push('BRG-CLAIM-NOT-RECORDED',
          '`job_technical_review` 那一发同样没有角色（四个一次性作业是这张票的正题之一）'
          + `（charters=${JSON.stringify(jobShot.child.reading?.charters ?? null)}）`)
      }

      // ③ 串父会话：别人的 claim 不许被吃
      if (persona(crossShot) !== '') {
        push('BRG-CLAIM-CROSS-PARENT',
          '父会话 `brg01-p-other` 记的 `team_design` 被 `brg01-p-stranger` 的子会话吃掉了 —— 队列没有按父会话 id 分'
          + `（persona=${JSON.stringify(persona(crossShot).slice(0, 24))}）`)
      }
      // ④ 非角色名：`workflow` / `subagent_fork` 不是角色
      for (const [label, item] of [['workflow', workflowShot], ['subagent_fork', forkShot]]) {
        if (persona(item) !== '') {
          push('BRG-CLAIM-NONROLE-RECORDED',
            `「${label}」不在角色表里，却被记成了 claim 并给出角色 ${JSON.stringify(item.child.reading.charters)}`
            + ' —— 那一类名字进 identityVerdict 会变成 row 2/6（契约 R1）')
        }
      }
      // ⑤ 被拒的委派：判词照旧 + 一条都不许记
      if (typeof rejectedShot.parent.guard?.reason !== 'string' || !rejectedShot.parent.guard.reason.includes('必须后台运行')) {
        push('BRG-GUARD-VERDICT-MOVED',
          '显式 `run_in_background: false` 的那一发没有被拒（门禁判词变了或没挂上）'
          + `：${JSON.stringify(rejectedShot.parent.guard?.reason ?? null).slice(0, 160)}`)
      }
      if (persona(rejectedShot) !== '') {
        push('BRG-CLAIM-REJECTED-RECORDED',
          '被门禁拒掉的委派也留下了一条 claim（下一个子会话会拿到一个从未启动过的角色）'
          + `（charters=${JSON.stringify(rejectedShot.child.reading.charters)}）`)
      }
      // 放行的两发：判词必须是 undefined（记录是纯观察，不许改判）
      for (const item of [testShot, jobShot]) {
        if (item.parent.guard?.reason !== undefined && item.parent.guard?.reason !== null) {
          push('BRG-GUARD-VERDICT-MOVED', `放行的委派「${item.tool}」被判词拦住了：${JSON.stringify(item.parent.guard.reason).slice(0, 160)}`)
        }
      }

      // 纯函数那一侧：角色表仍然是唯一作者（锁：桥不许自己算角色）
      const pure = SUT.mod.identityVerdict({ preset: 'member', toolName: 'team_test' })
      rec.readings.identity_pure = { row: pure?.row ?? null, role: pure?.role ?? null, narrow: pure?.narrow ?? null }
      if (pure?.row !== 4 || pure?.role !== 'test' || pure?.narrow !== false) {
        push('BRG-IDENTITY-TABLE-MOVED',
          `identityVerdict({preset:'member', toolName:'team_test'}) 不再是 row 4 / role=test / 不窄：${JSON.stringify(pure)}`)
      }

      caseFail(problems)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // BRG-02 · 消费面：一发到底（无 header toolName ⇒ 人设 + 说明书 + 有 shell）+ A0a 行
  // ───────────────────────────────────────────────────────────────────────────
  test('BRG-02 子会话装配消费 claim（row 4 / 人设 + 说明书 / 目录有 shell）· A0a 行自报来源且仍印 header_keys', async () => {
    await runCase('BRG-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const fx = fixture('BRG-02')
      rec.readings.preset = presetReadings()
      if (!prerequisites(problems, fx)) return caseFail(problems)

      const { contentDir, config, catalog } = fx
      const parentSid = 'brg02-p'
      const childSid = 'brg02-c'
      const header = { cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: parentSid }
      const parent = await parentCall({ contentDir, conf: config, catalog, tool: 'team_test', parentSid, agentId: 'brg02-agent' })
      const child = await childAssemble({ contentDir, conf: config, catalog, childSid, header })
      rec.readings.parent_guard = { ok: parent.guard?.ok ?? null, reason: parent.guard?.reason ?? null }
      rec.readings.child = child.reading
      rec.readings.a0a = child.a0a
      rec.readings.header = { before: child.header_keys_before, after: child.header_keys_after }

      if (parent.guard?.ok !== true) push('BRG-GUARD-NOT-MOUNTED', `门禁没挂上：${parent.guard?.why ?? '(无)'}`)
      if (child.reading === null) { push('BRG-HARNESS-ASSEMBLE', '装配没有产出'); return caseFail(problems) }

      // 消费到了没有：人设 / 说明书 / 目录三样一起看（少一样都不算"角色到了"）
      if (!String(child.reading.persona).startsWith(PERSONA_PREFIX.test)) {
        push('BRG-PERSONA-MISSING',
          `子会话没有拿到测试岗人设（该以「${PERSONA_PREFIX.test}」开头）：${JSON.stringify(String(child.reading.persona).slice(0, 40))}`
          + ' —— 父会话放行了 `team_test` 而子会话仍然无角色')
      }
      if (!child.reading.charters.includes('agenia:charter:test')) {
        push('BRG-CHARTER-MISSING', `子会话没有拿到 \`team/test.md\`（charters=${JSON.stringify(child.reading.charters)}）`)
      }
      if (child.reading.shell !== true) {
        push('BRG-CATALOG-NARROW',
          'row 5 的窄目录没有被换掉：`bash`/`pwsh` 不在目录里'
          + `（catalog=${JSON.stringify(child.reading.catalog)}）—— 这正是这一票要修的那件事`
          + '（子会话写不了 `tests/`、跑不了命令）')
      }

      // A0a 一次性读数行：四个变量 + 两条自洽规则（契约 §6）
      // ⚠️ 先做**读法器自证**：拿一条照契约写的最小行喂给下面那几个取词函数 ——
      //    读法器要是自己抽不出来，后面每条断言都会以"读不出来"的样子变红（假红；本文件第一版
      //    就因为 `：row=5` 那个全角冒号把 `row` 永远取成 null）。这一格与"桥做没做"无关，
      //    它是这一格自己能不能翻面的前提（`mig-test-05`）。
      const SELFTEST_LINE = '[agenia] A0a 身份读数（合成自证行 —— 判定行）：row=4 · preset="member"'
        + ' · toolName="team_test" · role="test" · role_from_toolName=true · narrow=false'
        + ' · toolName_source=parent-call · header_keys=["cwd","agentPreset","origin","parentSession"]'
      const selftest = {
        source: tokenOf(SELFTEST_LINE, 'toolName_source'),
        row: tokenOf(SELFTEST_LINE, 'row'),
        role: tokenOf(SELFTEST_LINE, 'role'),
        toolName: tokenOf(SELFTEST_LINE, 'toolName'),
        keys: headerKeysOf(SELFTEST_LINE),
      }
      rec.readings.a0a_reader_selftest = { line: SELFTEST_LINE, extracted: selftest }
      if (selftest.source !== 'parent-call' || selftest.row !== '4' || selftest.role !== 'test'
        || selftest.toolName !== 'team_test' || !Array.isArray(selftest.keys) || selftest.keys.includes('toolName')) {
        push('BRG-A0A-READER', `这一格的读法器抽不出照契约写的行：${JSON.stringify(selftest)} —— 先修读法器，别把它读成功能红`)
      }

      const line = child.a0a
      if (line === null) push('BRG-A0A-MISSING', '没有打那一条 A0a 一次性读数行')
      else {
        const source = tokenOf(line, 'toolName_source')
        const keys = headerKeysOf(line)
        rec.readings.a0a_tokens = {
          row: tokenOf(line, 'row'),
          toolName: tokenOf(line, 'toolName'),
          role: tokenOf(line, 'role'),
          toolName_source: source,
          role_from_toolName: tokenOf(line, 'role_from_toolName'),
          narrow: tokenOf(line, 'narrow'),
          header_keys: keys,
        }
        if (source === null) {
          push('BRG-A0A-NO-SOURCE',
            '这一行没有 `toolName_source=` —— 没有它，`row=4` 分不出"平台把会话头修好了"与"桥在兜"（契约 R12）')
        } else if (source !== 'parent-call') {
          push('BRG-A0A-SOURCE-WRONG', `名字是从父会话那一次调用来的，行里却写着 toolName_source=${JSON.stringify(source)}`)
        }
        if (keys === null) {
          push('BRG-A0A-NO-HEADER-KEYS', '这一行没有印 `header_keys=`（它是"头里到底有没有 toolName"的唯一读数，不许因为有了 claim 就拿掉）')
        } else if (keys.includes('toolName')) {
          push('BRG-A0A-HEADER-KEYS-CONTAIN-TOOLNAME', `子会话头里不该有 toolName，但 header_keys=${JSON.stringify(keys)}`)
        }
        if (tokenOf(line, 'row') !== '4') push('BRG-A0A-ROW', `这一行说 row=${tokenOf(line, 'row')}，桥生效之后该是 row=4（role 已经从工具名算出来了）`)
        if (tokenOf(line, 'role') !== 'test') push('BRG-A0A-ROLE', `这一行说 role=${JSON.stringify(tokenOf(line, 'role'))}，该是 "test"`)
        if (tokenOf(line, 'toolName') !== 'team_test') push('BRG-A0A-TOOLNAME', `这一行说 toolName=${JSON.stringify(tokenOf(line, 'toolName'))}，该是 "team_test"`)
        if (tokenOf(line, 'role_from_toolName') !== 'true') {
          push('BRG-A0A-ROLE-FROM-TOOLNAME', '`role_from_toolName=` 该是 true（角色的确是从**工具名**来的，只是不是从会话头来的）')
        }
        // 自洽 1：**这一行的措辞**说"这个会话头带 toolName"就必须真的在头里。
        // ⚠️ 只判"形状标签"那一句（`带 toolName 的组员侧会话`），不判"去读带 toolName 的那一行"
        //    那种**指路句**——它是关于另一行的，判宽了会给出假红（本文件第一版就栽在这儿）。
        if (/带 toolName 的组员侧会话/.test(line) && !(keys ?? []).includes('toolName')) {
          push('BRG-A0A-CLAIMS-TOOLNAME-IN-HEADER',
            `这一行把形状说成「带 toolName 的组员侧会话」而 header_keys=${JSON.stringify(keys)} 里没有它 —— 措辞在说一件假事`)
        }
        // 自洽 2：parent-call 是判定行，不许再叫人去等"带 toolName 的那一行"
        if (source === 'parent-call' && (/不是判定行/.test(line) || /判定请读/.test(line))) {
          push('BRG-A0A-SAYS-WAITS-FOR-HEADER',
            '名字已经从父会话那一次调用取到了，这一行却仍然说"不是判定行 / 请读带 toolName 的那一行" —— 那一行永远不会再来')
        }
      }

      caseFail(problems)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // BRG-03 · 九个名字全表（+ 未知名 ⇒ 无角色 + header 优先）
  // ───────────────────────────────────────────────────────────────────────────
  test('BRG-03 角色表九个名字逐条映射（charter + 人设 + shell 三面）· 未知名不记 · 会话头有 toolName 时 header 赢', async () => {
    await runCase('BRG-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const fx = fixture('BRG-03')
      rec.readings.preset = presetReadings()
      if (!prerequisites(problems, fx)) return caseFail(problems)

      const { contentDir, config, catalog } = fx
      const rows = []
      for (const [toolName, role] of ROLE_PAIRS) {
        const parentSid = `brg03-p-${role}`
        const childSid = `brg03-c-${role}`
        const header = { cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: parentSid }
        const parent = await parentCall({ contentDir, conf: config, catalog, tool: toolName, parentSid, agentId: `brg03-agent-${role}` })
        const child = await childAssemble({ contentDir, conf: config, catalog, childSid, header })
        const reading = child.reading ?? {}
        rows.push({
          toolName, role,
          guard_reason: parent.guard?.reason ?? null,
          guard_ok: parent.guard?.ok ?? null,
          charters: reading.charters ?? null,
          persona_head: String(reading.persona ?? '').slice(0, 30),
          shell: reading.shell ?? null,
        })
        if (child.reading === null) { push('BRG-HARNESS-ASSEMBLE', `${toolName}：装配没有产出`); continue }
        // ① 说明书：`team/<role>.md` 那一份，且**只有**它（串味 = 角色算错）
        const want = `agenia:charter:${role}`
        if (!reading.charters.includes(want)) {
          push('BRG-NAME-NOT-MAPPED',
            `「${toolName}」没落到角色 ${role}：期望 ${want}，实得 ${JSON.stringify(reading.charters)}`
            + '（未知名会被 identityVerdict 判成 row 2；这里连角色都没有 ⇒ 桥把这条 claim 丢了或没记）')
        }
        if (reading.charters.length > 1) {
          push('BRG-CHARTER-WRONG', `「${toolName}」同时拿到了好几份说明书：${JSON.stringify(reading.charters)}（一个会话只有一个角色）`)
        }
        // ② 人设：取样三份逐字开头（`test` / `dev` / `review`）
        const prefix = PERSONA_PREFIX[role]
        if (prefix !== undefined && !String(reading.persona).startsWith(prefix)) {
          push('BRG-PERSONA-DRIFT', `「${toolName}」的人设开头不是 ${JSON.stringify(prefix)}：${JSON.stringify(String(reading.persona).slice(0, 30))}`)
        }
        // ③ 工具面：只有 review 没有命令行（其余八个角色都在 row 4 = 不窄）
        const wantShell = !NO_SHELL_ROLES.includes(role)
        if (reading.shell !== wantShell) {
          push('BRG-SHELL-WRONG',
            `「${toolName}」的目录里 shell=${reading.shell}，该是 ${wantShell}`
            + `（catalog=${JSON.stringify(reading.catalog)}）—— review 的 \`NO_SHELL_TOOLS\` 与 row 5 的闭三元组是两件事，别混`)
        }
      }
      rec.readings.nine = rows

      // ④ 未知名：`team_retro`（历史上有过的第十个岗位）不在角色表 ⇒ 一条 claim 都不许有
      const unknownTool = 'team_retro'
      const unknownParent = 'brg03-p-unknown'
      const unknownHeader = { cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: unknownParent }
      const unknownParentCall = await parentCall({ contentDir, conf: config, catalog, tool: unknownTool, parentSid: unknownParent, agentId: 'brg03-agent-unknown' })
      const unknownChild = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg03-c-unknown', header: unknownHeader })
      rec.readings.unknown = {
        tool: unknownTool,
        guard_reason: unknownParentCall.guard?.reason ?? null,
        child: unknownChild.reading,
        a0a: unknownChild.a0a,
      }
      if (unknownChild.reading !== null) {
        if (unknownChild.reading.charters.length > 0 || String(unknownChild.reading.persona) !== '') {
          push('BRG-UNKNOWN-NAME-ROLE',
            `「${unknownTool}」不在角色表里，子会话却拿到了角色（charters=${JSON.stringify(unknownChild.reading.charters)}）`
            + ' —— 桥只许记九个名字（契约 R1）')
        }
        if (unknownChild.reading.shell !== false) {
          push('BRG-UNKNOWN-NAME-ROLE', `「${unknownTool}」的子会话目录里居然有 shell ⇒ 它没有落在 row 5`)
        }
      }

      // ⑤ header 优先：头里有 `toolName` 时，header 赢 **且不消费** claim
      const priorityParent = 'brg03-p-priority'
      await parentCall({ contentDir, conf: config, catalog, tool: 'team_test', parentSid: priorityParent, agentId: 'brg03-agent-priority' })
      const headerWins = await childAssemble({
        contentDir, conf: config, catalog, childSid: 'brg03-c-priority-header',
        header: { cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: priorityParent, toolName: 'team_review' },
      })
      const stillWaiting = await childAssemble({
        contentDir, conf: config, catalog, childSid: 'brg03-c-priority-claim',
        header: { cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: priorityParent },
      })
      rec.readings.header_priority = { header_child: headerWins.reading, claim_child: stillWaiting.reading, a0a: headerWins.a0a }
      if (headerWins.reading === null || stillWaiting.reading === null) {
        push('BRG-HARNESS-ASSEMBLE', 'header 优先那一组装配没有产出')
      } else {
        if (!headerWins.reading.charters.includes('agenia:charter:review')) {
          push('BRG-HEADER-NOT-PRIORITY',
            `头里写着 \`toolName:"team_review"\`，装配却没走 review（charters=${JSON.stringify(headerWins.reading.charters)}）`)
        }
        if (!stillWaiting.reading.charters.includes('agenia:charter:test')) {
          push('BRG-HEADER-NOT-PRIORITY',
            '紧随其后的无 toolName 子会话拿不到 `team_test`'
            + `（charters=${JSON.stringify(stillWaiting.reading.charters)}）—— 两种可能：claim 被上一发吃掉了、`
            + '或者那条 claim 压根没记；两种都违反契约 §5 那一行（header 赢且不消费）')
        }
      }

      caseFail(problems)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // BRG-04 · 队列语义：FIFO / 一次只取一条 / 同一子会话二次装配不掉角色
  // ───────────────────────────────────────────────────────────────────────────
  test('BRG-04 队列语义：多个子会话 FIFO 取名字 · 每条只消费一次 · 同一子会话二次装配仍是该角色', async () => {
    await runCase('BRG-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const fx = fixture('BRG-04')
      rec.readings.preset = presetReadings()
      if (!prerequisites(problems, fx)) return caseFail(problems)

      const { contentDir, config, catalog } = fx
      const header = (parentSid) => ({ cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: parentSid })

      // ① FIFO：一个父会话连派两个**不同**岗位
      const fifoParent = 'brg04-p-fifo'
      const first = await parentCall({ contentDir, conf: config, catalog, tool: 'team_test', parentSid: fifoParent, agentId: 'brg04-agent-fifo-1' })
      const second = await parentCall({ contentDir, conf: config, catalog, tool: 'job_technical_review', parentSid: fifoParent, agentId: 'brg04-agent-fifo-2' })
      const childA = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg04-c-a', header: header(fifoParent) })
      const childB = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg04-c-b', header: header(fifoParent) })
      // ② 队列空了：第三个子会话不许"再拿一个"
      const childC = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg04-c-c', header: header(fifoParent) })
      rec.readings.fifo = {
        guards: [first.guard?.reason ?? null, second.guard?.reason ?? null],
        a: childA.reading, b: childB.reading, c: childC.reading,
        a0a: childA.a0a,
      }
      if (childA.reading !== null && !childA.reading.charters.includes('agenia:charter:test')) {
        push('BRG-FIFO-ORDER',
          `先派 \`team_test\` 的子会话没拿到 test（charters=${JSON.stringify(childA.reading.charters)}）`
          + ' —— 要么没记，要么队列取的不是队首')
      }
      if (childB.reading !== null && !childB.reading.charters.includes('agenia:charter:technical-review')) {
        push('BRG-FIFO-ORDER',
          `后派 \`job_technical_review\` 的子会话没拿到 technical-review（charters=${JSON.stringify(childB.reading.charters)}）`
          + ' —— 两个子会话取名字的次序与派工次序不一致（契约 F1：FIFO）')
      }
      if (childC.reading !== null && (childC.reading.charters.length > 0 || String(childC.reading.persona) !== '')) {
        push('BRG-CLAIM-REUSED',
          `队列里已经没有 claim 了，第三个子会话却拿到了 ${JSON.stringify(childC.reading.charters)} —— 一条 claim 被用了两次`)
      }
      if (childC.reading !== null && childC.reading.shell !== false) {
        push('BRG-CLAIM-REUSED', '队列空了，第三个子会话却不在 row 5（目录里有 shell）')
      }

      // ③ 同一子会话**二次装配**（下一轮对话）：名字钉住了没有
      const again = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg04-c-a', header: header(fifoParent) })
      rec.readings.reassemble = again.reading
      if (again.reading !== null && !again.reading.charters.includes('agenia:charter:test')) {
        push('BRG-REASSEMBLE-LOST-ROLE',
          '同一个子会话第二次装配掉回了无角色（charters=' + JSON.stringify(again.reading.charters) + '）'
          + ' —— 名字必须钉在子会话上（契约 R9 / F7）：角色、人设、工具目录不许中途消失')
      }

      // ④ 同一个工具连派两次：两条 claim，两个子会话各拿一份
      const twiceParent = 'brg04-p-twice'
      await parentCall({ contentDir, conf: config, catalog, tool: 'team_dev', parentSid: twiceParent, agentId: 'brg04-agent-twice-1' })
      await parentCall({ contentDir, conf: config, catalog, tool: 'team_dev', parentSid: twiceParent, agentId: 'brg04-agent-twice-2' })
      const devA = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg04-c-dev-a', header: header(twiceParent) })
      const devB = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg04-c-dev-b', header: header(twiceParent) })
      rec.readings.same_tool_twice = { a: devA.reading, b: devB.reading }
      for (const [label, item] of [['第一发', devA], ['第二发', devB]]) {
        if (item.reading !== null && !item.reading.charters.includes('agenia:charter:dev')) {
          push('BRG-SAMETOOL-TWICE',
            `同一个工具连派两次，${label}子会话没拿到 dev（charters=${JSON.stringify(item.reading.charters)}）`
            + ' —— 队列是"一次一条"，不是"一个父会话一条"')
        }
      }

      caseFail(problems)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // BRG-05 · 过期清理（可注入时钟：`node:test` 的 `mock.timers`，只遮 `Date`）
  // ───────────────────────────────────────────────────────────────────────────
  test('BRG-05 claim 过期：30 秒内必须还能用 · 10 分钟以上必须不再用 · 过期之后新的 claim 照常', async (t) => {
    await runCase('BRG-05', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const fx = fixture('BRG-05')
      rec.readings.preset = presetReadings()
      rec.readings.clock = { seam: 'node:test mock.timers（apis:[Date]）', why: '契约 R10：claim 的 at 必须取 Date.now()' }
      if (typeof t?.mock?.timers?.enable !== 'function') {
        push('BRG-CLOCK-NOT-DATE', '这一版 node 没有 `mock.timers` —— 过期那一层量不了（判不了 ≠ 绿）')
        return caseFail(problems)
      }
      if (!prerequisites(problems, fx)) return caseFail(problems)

      const { contentDir, config, catalog } = fx
      const header = (parentSid) => ({ cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: parentSid })
      const BASE = 1_800_000_000_000
      const clock = []
      const now = () => Date.now()
      // 🔴 被遮住的 `Date` 会把这一格自己的 `ms`（`runCase` 量的）也遮成天文数字 —— 那是**量具在撒谎**。
      //    所以 `finally` 里一定要把时钟还回去：读数落盘之前必须是真表。
      try {
        t.mock.timers.enable({ apis: ['Date'], now: BASE })

        // ① 30 秒之内的 claim 必须还能用（正常派工 → 装配的延迟）
        clock.push({ at: 'start', now: now() })
        await parentCall({ contentDir, conf: config, catalog, tool: 'team_test', parentSid: 'brg05-p-fresh', agentId: 'brg05-agent-fresh' })
        t.mock.timers.tick(30_000)
        clock.push({ at: '+30s', now: now() })
        const fresh = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg05-c-fresh', header: header('brg05-p-fresh') })

        // ② 10 分钟之后的 claim 必须不再用
        await parentCall({ contentDir, conf: config, catalog, tool: 'team_dev', parentSid: 'brg05-p-stale', agentId: 'brg05-agent-stale' })
        t.mock.timers.tick(600_000)
        clock.push({ at: '+10min30s', now: now() })
        const stale = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg05-c-stale', header: header('brg05-p-stale') })

        // ③ 过期之后新的 claim 照常（队列不许被那条过期件堵住）
        await parentCall({ contentDir, conf: config, catalog, tool: 'team_review', parentSid: 'brg05-p-stale', agentId: 'brg05-agent-stale-2' })
        const afterExpiry = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg05-c-after', header: header('brg05-p-stale') })

        rec.readings.clock.readings = clock
        rec.readings.fresh = { at: clock[1], child: fresh.reading }
        rec.readings.stale = { at: clock[2], child: stale.reading }
        rec.readings.after_expiry = afterExpiry.reading

        // 量具自证：时钟真的被遮住了（遮不住 ⇒ 后面两条腿的读数没有意义）
        const ticked = clock.length >= 3 && clock[1].now === BASE + 30_000 && clock[2].now === BASE + 630_000
        if (!ticked) {
          push('BRG-CLOCK-NOT-DATE',
            `注入时钟没生效（读数 ${JSON.stringify(clock)}）—— 过期那一层量不了，别把这条读成功能红`)
        } else {
          if (fresh.reading === null || !fresh.reading.charters.includes('agenia:charter:test')) {
            push('BRG-FRESH-CLAIM-DROPPED',
              `30 秒前的 claim 已经不能用了（charters=${JSON.stringify(fresh.reading?.charters ?? null)}）`
              + ' —— TTL 太短，正常派工的子会话会掉成无角色')
          }
          if (stale.reading !== null && (stale.reading.charters.length > 0 || String(stale.reading.persona) !== '')) {
            push('BRG-STALE-CLAIM-USED',
              `10 分钟前的 claim 仍然被消费了（charters=${JSON.stringify(stale.reading.charters)}）`
              + ' —— 父会话派了活、子会话没起来，那条 claim 会毒到下一个子会话（契约 F3 / R10）')
          }
          if (afterExpiry.reading === null || !afterExpiry.reading.charters.includes('agenia:charter:review')) {
            push('BRG-CLAIM-AFTER-EXPIRY',
              `过期件清掉之后，新的 claim 没有生效（charters=${JSON.stringify(afterExpiry.reading?.charters ?? null)}）`
              + ' —— 队列被那条过期件堵住了（或者清理把新的一起清了）')
          }
        }
      } finally {
        t.mock.timers.reset()
      }
      rec.readings.clock.after_reset_differs_from_mock = Date.now() !== BASE

      caseFail(problems)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // BRG-06 · 边界：不改会话头 / 不读标记 / origin 门 / 组长预设不抢 claim
  // ───────────────────────────────────────────────────────────────────────────
  test('BRG-06 边界：会话头一个字节不动 · `【组员】` 标记不参与 · origin 不是 subagent 不消费 · 组长预设子会话不抢', async () => {
    await runCase('BRG-06', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const fx = fixture('BRG-06')
      rec.readings.preset = presetReadings()
      if (!prerequisites(problems, fx)) return caseFail(problems)

      const { contentDir, config, catalog } = fx
      const header = (parentSid, extra = {}) => ({ cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: parentSid, ...extra })

      // ① 会话头：键集、值、连 JSON 都不许动（不写 header.toolName）
      const headParent = 'brg06-p-head'
      await parentCall({ contentDir, conf: config, catalog, tool: 'team_test', parentSid: headParent, agentId: 'brg06-agent-head' })
      const headChild = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg06-c-head', header: header(headParent) })
      rec.readings.header = {
        before: headChild.header_keys_before,
        after: headChild.header_keys_after,
        json_same: headChild.header_json_same,
      }
      if (!headChild.header_json_same) push('BRG-HEADER-MUTATED', '装配之后子会话头被改了（桥不许写 header.toolName，连别的键也不许动）')
      if (headChild.header_keys_after.includes('toolName')) {
        push('BRG-HEADER-MUTATED', `装配之后子会话头里多了 toolName（keys=${JSON.stringify(headChild.header_keys_after)}）—— 老板明令不许写`)
      }

      // ② `【组员:dev】` 标记不参与身份：claim 说 review，标记说 dev ⇒ 必须 review
      const markParent = 'brg06-p-mark'
      await parentCall({ contentDir, conf: config, catalog, tool: 'team_review', parentSid: markParent, agentId: 'brg06-agent-mark' })
      const markChild = await childAssemble({
        contentDir, conf: config, catalog, childSid: 'brg06-c-mark',
        header: header(markParent),
        sections: [{ name: 'brg-incoming', text: '【组员:dev】你是这个项目的实现者。' }],
      })
      rec.readings.mark = { child: markChild.reading, sections_in: ['【组员:dev】'] }
      if (markChild.reading === null) {
        push('BRG-HARNESS-ASSEMBLE', '标记那一发装配没有产出')
      } else {
        if (markChild.reading.charters.includes('agenia:charter:dev')) {
          push('BRG-MARK-WINS',
            '装配入参里的 `【组员:dev】` 把角色定成了 dev —— 标记又变成身份作者了（契约 §1 / R11）')
        }
        if (!markChild.reading.charters.includes('agenia:charter:review')) {
          push('BRG-MARK-WINS',
            `claim 说 review，子会话却没拿到 review（charters=${JSON.stringify(markChild.reading.charters)}）`)
        }
        if (!String(markChild.reading.persona).startsWith(PERSONA_PREFIX.review)) {
          push('BRG-MARK-WINS', `人设不是评审岗那一份：${JSON.stringify(String(markChild.reading.persona).slice(0, 30))}`)
        }
      }

      // ③ `origin` 门：不是 subagent 的会话不吃 claim，claim 要留给真正的子会话
      const originParent = 'brg06-p-origin'
      await parentCall({ contentDir, conf: config, catalog, tool: 'team_dev', parentSid: originParent, agentId: 'brg06-agent-origin' })
      const manual = await childAssemble({
        contentDir, conf: config, catalog, childSid: 'brg06-c-manual',
        header: header(originParent, { origin: 'manual' }),
      })
      const realChild = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg06-c-real', header: header(originParent) })
      rec.readings.origin_gate = { manual: manual.reading, real: realChild.reading }
      if (manual.reading !== null && (manual.reading.charters.length > 0 || String(manual.reading.persona) !== '')) {
        push('BRG-ORIGIN-GATE-MISSING',
          `\`origin:"manual"\` 的会话也吃到了 claim（charters=${JSON.stringify(manual.reading.charters)}）—— 契约 R6 第 2 条`)
      }
      if (realChild.reading !== null && !realChild.reading.charters.includes('agenia:charter:dev')) {
        push('BRG-ORIGIN-GATE-MISSING',
          '不是子会话的那一发把 claim 吃掉了：紧随其后的真子会话拿不到 `team_dev`'
          + `（charters=${JSON.stringify(realChild.reading.charters)}）`)
      }

      // ④ 组长预设的子会话：不许被 claim 推进 row 1，也不许吃掉 claim
      const leaderParent = 'brg06-p-leader'
      await parentCall({ contentDir, conf: config, catalog, tool: 'team_test', parentSid: leaderParent, agentId: 'brg06-agent-leader' })
      const leaderChild = await childAssemble({
        contentDir, conf: config, catalog, childSid: 'brg06-c-leader',
        header: { cwd: contentDir, agentPreset: 'agenia', origin: 'subagent', parentSession: leaderParent },
      })
      const afterLeader = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg06-c-after-leader', header: header(leaderParent) })
      rec.readings.leader_child = { leader: leaderChild.reading, claim_child: afterLeader.reading, a0a: leaderChild.a0a }
      if (leaderChild.reading === null) {
        push('BRG-HARNESS-ASSEMBLE', '组长预设那一发装配没有产出')
      } else {
        if (leaderChild.reading.leader_side !== true) {
          push('BRG-LEADER-ROW-MOVED',
            '`agentPreset:"agenia"` 的子会话没有走组长侧（没有 `agenia:leader`）—— claim 把它从 row 3 推到了 row 1'
            + `（contexts=${JSON.stringify(leaderChild.reading.contexts.slice(0, 6))}）`)
        }
        if (leaderChild.reading.charters.includes('agenia:charter:test')) {
          push('BRG-LEADER-ROW-MOVED', '组长预设的子会话拿到了组员说明书 —— 它被当成了委派子会话')
        }
      }
      if (afterLeader.reading !== null && !afterLeader.reading.charters.includes('agenia:charter:test')) {
        push('BRG-LEADER-CLAIM-STOLEN',
          '紧随组长预设子会话之后的真子会话拿不到 `team_test`'
          + `（charters=${JSON.stringify(afterLeader.reading.charters)}）—— 两种可能：组长预设的子会话把 claim 吃了、`
          + '或者那条 claim 压根没记；两种都违反契约 R7 / F8（那一类会话不许把名额定走）')
      }

      caseFail(problems)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // BRG-07 · 并行派工：两个子会话的启动次序与父会话的调用次序**相反**
  //
  // 为什么要这一格（2026-11-02 live 探针）：`BRG-04` 那格量的是"子会话按派工次序起来"，
  // 而现场不是这样 —— 并行派两发时，**谁先起来与父会话的调用先后无关**。只按队列顺序取 claim
  // 会把两个角色发给对方（live 实测：`team_test` 拿到了 `job_technical_review` 的 claim）。
  // 修法是拿**子会话自己的第一条用户消息**给 claim 对号（`inject.js::firstUserPromptOf`）。
  //
  // 这一格是那把修的**回归锁**：红的时候一眼看得出是"名字按启动次序发了"，而不是"桥没记"。
  // 反序的两向都量（先 test 后 review / 先 review 后 test）—— 只量一个方向的话，
  // "把匹配写成固定偏移"这种半修看不出来。
  // ───────────────────────────────────────────────────────────────────────────
  test('BRG-07 并行两发委派：子会话启动次序与调用次序相反时，按各自的第一条用户消息对号，角色不串位', async () => {
    await runCase('BRG-07', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const fx = fixture('BRG-07')
      rec.readings.preset = presetReadings()
      if (!prerequisites(problems, fx)) return caseFail(problems)

      const { contentDir, config, catalog } = fx
      const header = (parentSid) => ({ cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: parentSid })
      /** 父会话派工时传下来的那份 prompt（子会话的第一条用户消息就是它）。 */
      const PROMPT_TEST = 'BRG-07 派工：这一发是 team_test —— 只跑 tests/ 下的用例，别动生产代码。'
      const PROMPT_REVIEW = 'BRG-07 派工：这一发是 job_technical_review —— 只读评审，项目一个字节都不许改。'
      const PROMPT_DEV = 'BRG-07 派工：这一发是 team_dev —— 只写实现，别动测试。'
      /** 会话的消息列表：**第一条用户消息**就是要对号的那份 prompt。 */
      const firstUser = (content) => [{ role: 'user', content }]
      /**
       * **live 会话流里的真形状**（技术评审 2026-11-02 F1 实测）：事件对象，
       * 正文在 `data.content`（分块数组），不在 `data.text`。桥只读 `data.text` 时永远取空。
       */
      const firstUserEvent = (content) => [{
        type: 'user/message',
        data: { content: [{ type: 'text', text: content }], source: { kind: 'user' } },
      }]
      const charterOf = (role) => `agenia:charter:${role}`
      /**
       * 人设取样 = **手写副本**（与 `PERSONA_PREFIX` 同一族：来源是角色表 `ROLE_TABLE[role].persona`
       * 那一列，不是从这一跑的注入结果反推 —— `cand-20261016-selfsourced-order-01`）。
       * ⚠️ `technical-review` 与 `review` 是**两句话**：前者「你是一次性后台作业：技术评审。」，
       *    后者「你是这个项目的独立评审」。两者混用 ⇒ 角色明明算对了，也会以人设红的样子出现（假红）。
       */
      const PERSONA_OF = {
        test: PERSONA_PREFIX.test,
        'technical-review': '你是一次性后台作业：技术评审。',
      }

      // ── 量具自证 ①：两条 prompt **不许互为子串** ────────────────────────────
      // 桥的匹配是**完整相等**（`item.prompt === prompt`）：对不上就不取（子会话落 row 5），不按子串匹配。
      // 夹具里若一条 prompt 含另一条，这一格就分不出"对号"与"撞号" —— 那会以**功能红**的样子出现（假红）。
      const ambiguous = PROMPT_TEST.includes(PROMPT_REVIEW) || PROMPT_REVIEW.includes(PROMPT_TEST)
      rec.readings.prompts = { test: PROMPT_TEST, review: PROMPT_REVIEW, mutually_contained: ambiguous }
      if (ambiguous) {
        push('BRG-HARNESS-PROMPT-AMBIGUOUS', '两条派工 prompt 互为子串 —— 夹具分不出"对号"与"撞号"，先修夹具再看下面')
      }

      /**
       * 一组并行派工：父会话按 `calls` 的次序派，子会话按 `order` 的次序装配（反序 = 现场）。
       * 返回两发子会话的读数。
       */
      const pair = async ({ tag, calls, order, messagesOf = firstUser }) => {
        const parentSid = `brg07-p-${tag}`
        // ① 父会话：按 calls 的次序放行（队列 = calls 的次序）
        const guards = []
        for (const [index, call] of calls.entries()) {
          const shot = await parentCall({
            contentDir, conf: config, catalog, tool: call.tool,
            args: { prompt: call.prompt }, parentSid, agentId: `brg07-agent-${tag}-${index}`,
          })
          guards.push({ tool: call.tool, ok: shot.guard?.ok ?? null, reason: shot.guard?.reason ?? null })
        }
        // ② 子会话：按 order 的次序装配（每条带自己的第一条用户消息）
        const children = {}
        for (const [index, who] of order.entries()) {
          const call = calls.find((c) => c.who === who)
          children[who] = await childAssemble({
            contentDir, conf: config, catalog,
            childSid: `brg07-c-${tag}-${index}-${who}`,
            header: header(parentSid),
            messages: messagesOf(call.prompt),
          })
        }
        return { tag, guards, children, calls, order }
      }

      // ── 主组：先派 test、再派 review；子会话**反序**起来（review 先） ──────────
      const main = await pair({
        tag: 'main',
        calls: [
          { who: 'test', tool: 'team_test', prompt: PROMPT_TEST },
          { who: 'review', tool: 'job_technical_review', prompt: PROMPT_REVIEW },
        ],
        order: ['review', 'test'],
      })
      // ── 镜像组：先派 review、再派 test；子会话反过来（test 先） ────────────────
      const mirror = await pair({
        tag: 'mirror',
        calls: [
          { who: 'review', tool: 'job_technical_review', prompt: PROMPT_REVIEW },
          { who: 'test', tool: 'team_test', prompt: PROMPT_TEST },
        ],
        order: ['test', 'review'],
      })

      // ── 事件组：同样的反序，但子会话的消息列表是**live 会话事件的真形状** ─────────
      // 技术评审 2026-11-02 F1：live 里正文在 `data.content[0].text`，不在 `data.text`。
      // 只量消息对象形状的话，`firstUserPromptOf` 读空后回退队列顺序，这一格会以"恰好对了"的绿出现。
      const event = await pair({
        tag: 'event',
        calls: [
          { who: 'test', tool: 'team_test', prompt: PROMPT_TEST },
          { who: 'review', tool: 'job_technical_review', prompt: PROMPT_REVIEW },
        ],
        order: ['review', 'test'],
        messagesOf: firstUserEvent,
      })

      const digest = (group) => ({
        guards: group.guards,
        assemble_order: group.order,
        children: Object.fromEntries(Object.entries(group.children).map(([who, item]) => [who, {
          child_id: item.child_id,
          charters: item.reading?.charters ?? null,
          persona_head: String(item.reading?.persona ?? '').slice(0, 30),
          shell: item.reading?.shell ?? null,
          messages_seen: item.messages_seen,
          a0a: item.a0a,
        }])),
      })
      rec.readings.parallel = { main: digest(main), mirror: digest(mirror), event: digest(event) }

      // ── 前置：门禁真的挂上了、两发都被放行（不然"没记 claim"会伪装成"串位"） ──
      for (const group of [main, mirror, event]) {
        for (const guard of group.guards) {
          if (guard.ok !== true) {
            push('BRG-GUARD-NOT-MOUNTED', `${group.tag}：\`${guard.tool}\` 的门禁没挂上（${guard.reason ?? '(无)'}）`)
          } else if (guard.reason !== undefined && guard.reason !== null) {
            push('BRG-GUARD-VERDICT-MOVED', `${group.tag}：放行的 \`${guard.tool}\` 被判词拦住了：${JSON.stringify(guard.reason).slice(0, 160)}`)
          }
        }
      }
      const missing = [main, mirror, event].flatMap((group) => Object.entries(group.children)
        .filter(([, item]) => item.reading === null)
        .map(([who]) => `${group.tag}:${who}`))
      if (missing.length > 0) {
        push('BRG-HARNESS-ASSEMBLE', `这些子会话装配没有产出（夹具/入口失败）：${missing.join(' / ')}`)
        return caseFail(problems)
      }

      // ── 量具自证 ②：子会话的第一条用户消息**真的交到了注入器手里** ────────────
      // 交不进去 ⇒ prompt 对号那一层根本没被量到，下面每条断言都会以"功能红"的样子红（假红）。
      const seenBy = (group, who) => {
        const list = group.children[who]?.messages_seen
        const hit = (Array.isArray(list) ? list : []).find((m) =>
          m !== null && m !== undefined
          && (m.role === 'user' || m.type === 'user/message' || m.kind === 'user/message' || m.data?.source?.kind === 'user'))
        if (hit === undefined) return null
        if (typeof hit.content === 'string') return hit.content
        const dataContent = hit.data?.content
        if (typeof dataContent === 'string') return dataContent
        if (Array.isArray(dataContent)) {
          return dataContent.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('')
        }
        return null
      }
      const seen = {}
      for (const group of [main, mirror, event]) {
        for (const who of ['test', 'review']) seen[`${group.tag}:${who}`] = seenBy(group, who)
      }
      rec.readings.messages_seen = seen
      for (const group of [main, mirror, event]) {
        for (const [who, prompt] of [['test', PROMPT_TEST], ['review', PROMPT_REVIEW]]) {
          if (seen[`${group.tag}:${who}`] !== prompt) {
            push('BRG-HARNESS-MESSAGES',
              `夹具没把「${group.tag}:${who}」那条会话的第一条用户消息交到注入器手里`
              + `（读到 ${JSON.stringify(seen[`${group.tag}:${who}`])}）—— 先修夹具，别把它读成功能红`)
          }
        }
      }

      // ── 判据：反序装配之后，每一发仍然是**自己那个角色** ───────────────────────
      // 期望值的来历：契约 `.team/test/CONTRACT-A-bridge.md` R1（工具名 → 角色，九名闭表）；
      // 用例 ID 里的角色名与 `ROLE_PAIRS`（本文件那份手写副本）是两份独立载体。
      for (const group of [main, mirror, event]) {
        for (const [who, role] of [['test', 'test'], ['review', 'technical-review']]) {
          const item = group.children[who]
          const charters = item.reading.charters
          const tag = `${group.tag}:${who}`
          if (!charters.includes(charterOf(role)) || charters.length !== 1) {
            push(who === 'test' ? 'BRG-PARALLEL-SWAP-TEST' : 'BRG-PARALLEL-SWAP-REVIEW',
              `「${tag}」这一发没拿到自己的角色 ${role}（charters=${JSON.stringify(charters)}）`
              + `—— 父会话的调用次序 = ${JSON.stringify(group.calls.map((c) => c.who))}，`
              + `子会话的启动次序 = ${JSON.stringify(group.order)}；名字按**启动次序**发了（队首 claim 被吃掉）`
              + '。并行派工下按队列顺序取 claim 就会串位，正解是按子会话第一条用户消息对号')
          }
          const prefix = PERSONA_OF[role]
          if (!String(item.reading.persona).startsWith(prefix)) {
            push('BRG-PARALLEL-PERSONA',
              `「${tag}」注入的人设不是 ${role} 那一份（该以「${prefix}」开头）：`
              + `${JSON.stringify(String(item.reading.persona).slice(0, 30))}`)
          }
          // 工具面：两个角色都该在 row 4（窄目录被换掉 ⇒ 有 shell）。没角色 ⇒ 落在 row 5 的闭三元组。
          if (item.reading.shell !== true) {
            push('BRG-PARALLEL-CATALOG',
              `「${tag}」的工具目录里没有 shell（catalog=${JSON.stringify(item.reading.catalog)}）`
              + '—— 那一发落回 row 5 了，等于一个角色都没拿到')
          }
        }
      }

      // ── 老路径仍在：子会话**取不到**第一条用户消息时，退回队列队首 ──────────────
      // 那一支是 `inject.js::bridgeTakeClaim` 的 `prompt === ''` 分支（`fresh.shift()`）：
      // 只有"读不到第一条用户消息"才退回队首；**有** prompt 而不等 ⇒ 不取（落 row 5）。
      // 量不到它，就等于"加了 prompt 对号之后，没有消息列表的会话会掉成无角色"这件事没人管。
      const fallbackParent = 'brg07-p-fallback'
      const fallbackCall = await parentCall({
        contentDir, conf: config, catalog, tool: 'team_dev',
        args: { prompt: PROMPT_DEV }, parentSid: fallbackParent, agentId: 'brg07-agent-fallback',
      })
      const noMessages = await childAssemble({ contentDir, conf: config, catalog, childSid: 'brg07-c-fallback', header: header(fallbackParent) })
      rec.readings.fallback = {
        guard: { ok: fallbackCall.guard?.ok ?? null, reason: fallbackCall.guard?.reason ?? null },
        child: noMessages.reading,
        messages_seen: noMessages.messages_seen,
      }
      if (fallbackCall.guard?.ok !== true || fallbackCall.guard?.reason !== undefined && fallbackCall.guard?.reason !== null) {
        push('BRG-GUARD-VERDICT-MOVED', `兜底那一发的 \`team_dev\` 没被放行：${JSON.stringify(fallbackCall.guard?.reason ?? null).slice(0, 160)}`)
      }
      if (noMessages.reading === null) {
        push('BRG-HARNESS-ASSEMBLE', '兜底那一发装配没有产出')
      } else if (!noMessages.reading.charters.includes(charterOf('dev'))) {
        push('BRG-FALLBACK-LOST',
          '子会话取不到第一条用户消息时，队列顺序那条老路径没了'
          + `（charters=${JSON.stringify(noMessages.reading.charters)}，messages_seen=${JSON.stringify(noMessages.messages_seen)}）`
          + '—— 修法承诺"取不到第一条用户消息时退回 shift 队首"（`prompt` 读空那一支）；这一格是那一支的判据')
      }

      caseFail(problems)
    })
  })
})
