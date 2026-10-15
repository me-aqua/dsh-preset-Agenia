#!/usr/bin/env node
/**
 * 写权限门禁 + 委派硬门 —— **纯函数探针**（组长 · 2026-10-15 建）
 *
 * ── 这个文件为什么存在 ────────────────────────────────────────────────────────
 * R1 验收里有一批格子（B2 / B3 / A6 的判定层）原本需要**在真会话里造奇怪的现场**：
 * cwd 在 C 盘、cwd 落在目录联接上、故意把配置弄坏再干净挂载一次。
 * **老板 2026-10-15 明确否掉了前两种**（原话：「我这辈子都不会在c盘或者你说的什么快捷方式上
 * 建工作区，不要做这种奇怪的测试，你咋不让我测试把电脑硬盘拔了会发生什么呢」）。
 *
 * ⇒ 但它们要验的东西**本来就在两个纯函数里**（`officeBoundVerdict` / `delegationPolicy`）：
 *    **喂一个假的 agent（cwd 只是一根字符串）就能验完** ——
 *    一个字节都不落盘、不碰 C 盘、不起会话、不需要任何窗口、不需要老板配合。
 *
 * ── 判据来源（不发明，逐条指回源代码）────────────────────────────────────────
 * · `presets/agenia/inject.js` L297–315 `landsInOffice`：空目标 / 解析不出 cwd / 落点在 C 盘
 *   ⇒ 一律算"不在组内"
 * · L434–469 `officeBoundVerdict`：角色不在名单 ⇒ 放行；shell 一律拒；write/edit 按**落点**判
 * · L351–379 `delegationPolicy`：缺 / null / 非映射 / 空映射 / 非法模式值 ⇒ `E_GUARD_CONFIG_MISSING`
 * · L389–430 `subagentBackgroundVerdict`：配置坏时**只拦委派名**，
 *   `job_output` / `job_kill` / `job_list` **照常放行**（配置坏了也得能把作业结果收回来）
 *
 * ── 谁在用、什么时候跑 ────────────────────────────────────────────────────────
 * 改了 `inject.js` 的**任何一段判定逻辑**都要跑一次。它是**只读**的：不写文件、不读盘上的业务数据。
 *
 * 跑法：<node> .tools/office-guard-probe.mjs
 * 退出码：0 = 全过 · 1 = 有红
 *
 * ⚠️ **口径（别把两层混了）**：本探针验的是「**判定函数的行为**」。
 *    真会话层验的是「**喂进这个函数的 cwd 是什么形状**」。
 *    ⇒ 说结论时必须写清是哪一层；不许把本探针的绿说成"真回合验过"。
 */
import { readFileSync } from 'node:fs'
import {
  delegationPolicy,
  delegationToolNames,
  officeBoundVerdict,
  subagentBackgroundVerdict,
} from '../presets/agenia/inject.js'

// ─────────────────────────────────────────────────────────────────────────────
// 一、写权限门禁（officeBound）
// ─────────────────────────────────────────────────────────────────────────────
const BOUND = ['review']
const at = (cwd) => ({ session: { header: cwd === undefined ? {} : { cwd } } })
const W = (p) => ({ file_path: p })
const E = 'E:\\Harness'
const OFFICE = `${E}\\.team`

const ALLOW = null
const DENY_WRITE = 'E_GUARD_OFFICE_WRITE'
const DENY_SHELL = 'E_GUARD_OFFICE_SHELL'

const OFFICE_CASES = [
  // ── 阳性对照：先证明这道门**会放行**，否则下面那些"拒"全是假的 ──────────────
  { n: '对照 · E 盘项目里写 .team/', cwd: E, tool: 'write', args: W(`${OFFICE}\\review\\x.md`), want: ALLOW },
  { n: '对照 · 写 .team/ 自己（相等也算组内）', cwd: E, tool: 'write', args: W(OFFICE), want: ALLOW },
  { n: '对照 · 角色不在名单（组长）⇒ 放行', role: 'leader', cwd: E, tool: 'write', args: W(`${E}\\x.md`), want: ALLOW },

  // ── 这条门真的会拒（同 cwd，只是落点出去了）─────────────────────────────
  { n: '拒 · 写项目根（办公桌外面）', cwd: E, tool: 'write', args: W(`${E}\\x.md`), want: DENY_WRITE },
  { n: '拒 · `.team/../x.md`（字面带 .team、落点在根）', cwd: E, tool: 'write', args: W('.team/../x.md'), want: DENY_WRITE },

  // ── C 盘一律拒（R1-B2 的实质；**不需要真的在 C 盘建工作区**）────────────────
  { n: 'B2a · 目标是 C:\\ 绝对路径', cwd: E, tool: 'write', args: W('C:\\Users\\DAVID\\_probe-should-deny.md'), want: DENY_WRITE },
  { n: 'B2b · 小写盘符 c:\\', cwd: E, tool: 'write', args: W('c:\\users\\david\\_probe-should-deny.md'), want: DENY_WRITE },
  { n: 'B2c · 正斜杠 C:/', cwd: E, tool: 'write', args: W('C:/Users/DAVID/_probe-should-deny.md'), want: DENY_WRITE },
  { n: 'B2d · cwd 本身在 C 盘 ⇒ 连自己的 .team 也拒', cwd: 'C:\\Users\\DAVID\\somewhere', tool: 'write', args: W('C:\\Users\\DAVID\\somewhere\\.team\\x.md'), want: DENY_WRITE },

  // ── 拿不到 cwd ⇒ 一律拒（R1-B3 的实质）────────────────────────────────────
  { n: 'B3a · agent = null', agent: null, tool: 'write', args: W(`${OFFICE}\\x.md`), want: DENY_WRITE },
  { n: 'B3b · agent 没有 session', agent: {}, tool: 'write', args: W(`${OFFICE}\\x.md`), want: DENY_WRITE },
  { n: 'B3c · session.header 是空的', agent: { session: { header: {} } }, tool: 'write', args: W(`${OFFICE}\\x.md`), want: DENY_WRITE },
  { n: 'B3d · cwd = 空串', cwd: '', tool: 'write', args: W(`${OFFICE}\\x.md`), want: DENY_WRITE },
  { n: 'B3e · cwd = 全空白', cwd: '   ', tool: 'write', args: W(`${OFFICE}\\x.md`), want: DENY_WRITE },
  { n: 'B3f · 目标为空串（不是"当前目录"）', cwd: E, tool: 'write', args: W(''), want: DENY_WRITE },

  // ── 一条通用命令行 = 一条通用写入通道 ──────────────────────────────────────
  { n: '拒 · pwsh', cwd: E, tool: 'pwsh', args: { command: 'echo hi' }, want: DENY_SHELL },
  { n: '拒 · bash', cwd: E, tool: 'bash', args: { command: 'echo hi' }, want: DENY_SHELL },

  // ── edit 与 write 同一道门 ────────────────────────────────────────────────
  { n: 'edit · .team/ 里放行', cwd: E, tool: 'edit', args: W(`${OFFICE}\\review\\x.md`), want: ALLOW },
  { n: 'edit · 项目根拒', cwd: E, tool: 'edit', args: W(`${E}\\x.md`), want: DENY_WRITE },

  // ── 机制读数：cwd 字面 ≠ 真实时，纯函数只会**按字面判**（junction 那一格的另一半）──
  { n: '机制 · cwd 字面 ≠ 真实时按字面判（期望放行）', cwd: 'E:\\Harness\\.tools\\_scratch\\_fake_link', tool: 'write', args: W('E:\\Harness\\.tools\\_scratch\\_fake_link\\.team\\x.md'), want: ALLOW },
]

// ─────────────────────────────────────────────────────────────────────────────
// 二、委派硬门（delegationPolicy / subagentBackgroundVerdict）
//     R1-A6 的判定层：**配置坏了必须拒，而且必须只拦委派名、不误伤框架工具**。
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG_ERROR = 'E_GUARD_CONFIG_MISSING'
const JOB_FOREGROUND = 'E_GUARD_JOB_FOREGROUND'
const SELF_FOREGROUND = 'E_GUARD_SELF_FOREGROUND'

/** 照 `agent.cordis.yml` 现在的 9 个具名实例（2026-10-15 I15 之后：4 固定 + 4 作业 + 裸 subagent）。 */
const GOOD_NAMES = {
  subagent: 'continuable',
  team_design: 'continuable',
  team_dev: 'continuable',
  team_test: 'continuable',
  team_review: 'continuable',
  job_memory_judge: 'one-shot',
  job_memory_review: 'one-shot',
  job_conversation_review: 'one-shot',
  job_technical_review: 'one-shot',
}
const broken = { delegationTools: { team_dev: 'forever' } } // 非法模式值 ⇒ 整份名单算坏

const DELEGATION_CASES = [
  // 合法名单
  { n: '合法 · configError 为 null', fn: () => delegationPolicy({ delegationTools: GOOD_NAMES }).configError, want: null },
  { n: '合法 · 名单 9 个键', fn: () => delegationToolNames({ delegationTools: GOOD_NAMES }).length, want: 9 },
  { n: '合法 · 名单里没有 team_retro（复盘岗已撤）', fn: () => delegationToolNames({ delegationTools: GOOD_NAMES }).includes('team_retro'), want: false },

  // 坏配置的六种形状 ⇒ 一律 configError
  { n: '坏 · config 整个是 undefined', fn: () => delegationPolicy(undefined).configError, want: CONFIG_ERROR },
  { n: '坏 · config 是 {}（缺键）', fn: () => delegationPolicy({}).configError, want: CONFIG_ERROR },
  { n: '坏 · delegationTools = null', fn: () => delegationPolicy({ delegationTools: null }).configError, want: CONFIG_ERROR },
  { n: '坏 · delegationTools 是数组', fn: () => delegationPolicy({ delegationTools: ['a'] }).configError, want: CONFIG_ERROR },
  { n: '坏 · 空映射', fn: () => delegationPolicy({ delegationTools: {} }).configError, want: CONFIG_ERROR },
  { n: '坏 · 非法模式值 forever', fn: () => delegationPolicy(broken).configError, want: CONFIG_ERROR },

  // 坏配置下的判定：**只拦委派名**
  { n: '坏 · team_dev 即便 run_in_background:true 也拒', fn: () => subagentBackgroundVerdict('team_dev', { run_in_background: true }, delegationPolicy(broken))?.code, want: CONFIG_ERROR },
  { n: '坏 · subagent 拒', fn: () => subagentBackgroundVerdict('subagent', {}, delegationPolicy(broken))?.code, want: CONFIG_ERROR },
  { n: '坏 · job_memory_judge 拒', fn: () => subagentBackgroundVerdict('job_memory_judge', { run_in_background: true }, delegationPolicy(broken))?.code, want: CONFIG_ERROR },
  { n: '坏 · job_output 放行（框架工具不许误伤）', fn: () => subagentBackgroundVerdict('job_output', {}, delegationPolicy(broken)), want: null },
  { n: '坏 · job_kill 放行', fn: () => subagentBackgroundVerdict('job_kill', {}, delegationPolicy(broken)), want: null },
  { n: '坏 · job_list 放行', fn: () => subagentBackgroundVerdict('job_list', {}, delegationPolicy(broken)), want: null },
  { n: '坏 · policy 传 null 也当配置坏（不是"全放行"）', fn: () => subagentBackgroundVerdict('team_dev', {}, null)?.code, want: CONFIG_ERROR },

  // 合法配置下的正向/反向
  { n: '合法 · one-shot 省略 ⇒ 拒（前台）', fn: () => subagentBackgroundVerdict('job_memory_judge', {}, delegationPolicy({ delegationTools: GOOD_NAMES }))?.code, want: JOB_FOREGROUND },
  { n: '合法 · one-shot false ⇒ 拒', fn: () => subagentBackgroundVerdict('job_memory_judge', { run_in_background: false }, delegationPolicy({ delegationTools: GOOD_NAMES }))?.code, want: JOB_FOREGROUND },
  { n: '合法 · one-shot 字符串真值 "true" ⇒ 拒（判据是 === true）', fn: () => subagentBackgroundVerdict('job_memory_judge', { run_in_background: 'true' }, delegationPolicy({ delegationTools: GOOD_NAMES }))?.code, want: JOB_FOREGROUND },
  { n: '合法 · one-shot true ⇒ 放行', fn: () => subagentBackgroundVerdict('job_memory_judge', { run_in_background: true }, delegationPolicy({ delegationTools: GOOD_NAMES })), want: null },
  { n: '合法 · continuable 省略 ⇒ 放行', fn: () => subagentBackgroundVerdict('team_dev', {}, delegationPolicy({ delegationTools: GOOD_NAMES })), want: null },
  { n: '合法 · continuable true ⇒ 放行', fn: () => subagentBackgroundVerdict('team_dev', { run_in_background: true }, delegationPolicy({ delegationTools: GOOD_NAMES })), want: null },
  { n: '合法 · continuable 显式 false ⇒ 拒（不许前台）', fn: () => subagentBackgroundVerdict('team_dev', { run_in_background: false }, delegationPolicy({ delegationTools: GOOD_NAMES }))?.code, want: SELF_FOREGROUND },
  { n: '合法 · 不在名单里的工具（read）⇒ 放行', fn: () => subagentBackgroundVerdict('read', {}, delegationPolicy({ delegationTools: GOOD_NAMES })), want: null },
]

// ─────────────────────────────────────────────────────────────────────────────
// 三、静态（弱判据）：坏配置**必须出声**
//     A6 真挂载那一手本机做不到（只许一条实例，起第二个会抢凭据锁）⇒ 这里只钉住
//     「apply() 里那句 console.error 还在」。⚠️ 它**只能**证明字在，不能证明真的打出来了。
// ─────────────────────────────────────────────────────────────────────────────
const SRC = readFileSync(new URL('../presets/agenia/inject.js', import.meta.url), 'utf8')
const STATIC_CASES = [
  {
    n: '静态 · configError 时的那句 console.error 还在代码里',
    fn: () => SRC.includes('config 里的 ${DELEGATION_TOOLS_KEY} 缺失或非法') || /缺失或非法（\$\{delegation\.configError\}）/.test(SRC),
    want: true,
  },
  { n: '静态 · 那句里点名了 E_GUARD_CONFIG_MISSING 这个码', fn: () => SRC.includes('E_GUARD_CONFIG_MISSING'), want: true },
  { n: '静态 · 那句里写清"job_output/job_kill/job_list 照常放行"', fn: () => SRC.includes('job_output / job_kill / job_list 照常放行'), want: true },
]

// ─────────────────────────────────────────────────────────────────────────────
// 跑
// ─────────────────────────────────────────────────────────────────────────────
let pass = 0
const fails = []
const run = (label, rows) => {
  for (const c of rows) {
    let gotShape
    try {
      if (c.fn !== undefined) gotShape = c.fn()
      else {
        const role = c.role === undefined ? 'review' : c.role
        const agent = c.agent !== undefined ? c.agent : at(c.cwd)
        const got = officeBoundVerdict(role, c.tool, c.args, agent, new Set(BOUND))
        gotShape = got === null ? ALLOW : got?.code
      }
    } catch (error) {
      gotShape = `THREW:${String(error?.message ?? error)}`
    }
    const ok = gotShape === c.want
    if (ok) pass += 1
    else fails.push({ label, n: c.n, want: c.want, gotShape })
    console.log(`${ok ? 'ok  ' : 'RED '} [${label}] ${c.n}\n      期望=${String(c.want)}  实得=${String(gotShape)}`)
  }
}

run('写权限', OFFICE_CASES)
run('委派门', DELEGATION_CASES)
run('静态', STATIC_CASES)

const total = OFFICE_CASES.length + DELEGATION_CASES.length + STATIC_CASES.length
console.log('')
console.log(`${pass}/${total} 条通过`)
if (fails.length > 0) {
  console.log('红：')
  for (const f of fails) console.log(`  - [${f.label}] ${f.n}：期望 ${String(f.want)}，实得 ${String(f.gotShape)}`)
}
process.exitCode = fails.length === 0 ? 0 : 1
