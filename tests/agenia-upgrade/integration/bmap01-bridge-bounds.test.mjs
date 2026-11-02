/**
 * `BMAP-01` · **委派桥的两张表要有上限** + **`context.scope.id` 坏了也要钉得住**（长期票 `ticket-20261102-06` · 评审 `F5`）。
 *
 * 病根（评审原话两条，同一张票）：
 *   ① `BRIDGE_PINNED` / `BRIDGE_MISS_WARNED` 无上限 —— 长进程里只涨不落；
 *   ② `context.scope.id` 不是字符串时**跳 pin** ⇒ 同一子会话的第二次装配静默掉回 row 5。
 * 契约（这一格钉的那两句）：
 *   · 两张表**像 `BRIDGE_CLAIMS` 一样**有上限（那边已有 `BRIDGE_CLAIM_CAP = 16` + 丢最旧）；
 *   · `scope.id` **缺失 / 不是字符串** 时仍然钉住（用 `agentId` 兜底），不许因此把角色丢掉。
 *
 * ── 两条腿各判什么 ─────────────────────────────────────────────────────────
 * `A` **动态（钉住那一条）**：真跑 `inject.js`（真 `apply()`、假 ctx，与 `BRG-*` 同一具载具），
 *    父会话放行一次 `team_test`，子会话**第一次**装配拿到 test；再把**同一个子会话**装配第二次
 *    （队列此时已空）—— 今天这一步会掉回 row 5，因为 `BRIDGE_PINNED.set()` 只在
 *    `typeof agentId === 'string'` 时发生，而 `agentId = context.scope.id`（`inject.js:3221`）。
 *    两个输入：`scope.id = 12345`（给了个非字符串）与 `scope.id` **键缺失**（`MISSING_ID`）；
 *    两个输入下 `context.agent.id` 都是**正常字符串** —— 兜底的钥匙就在那儿。
 * `B` **静态（上限那一条）**：读 `inject.js` 源码，判两张表的**写入点附近有没有一个上限常量 +
 *    一条淘汰动作**（`delete` / `splice` / `clear` / 循环）。为什么这一条只能落在源码上：
 *    `BRIDGE_PINNED` 与 `BRIDGE_MISS_WARNED` 都是模块内的私有变量、不导出，运行时读不到大小；
 *    驱动一个"不知道多大的 N"去撑爆它，等于拿一个编出来的数当判据（`cand-20261020-0006`）。
 *    所以这一条按**声明面**判 —— 与 `SURF-02`（`@roster` 机读声明）同一族：可被机器读到、可翻面。
 *    阳性对照：同一只读取器喂一段**合成源码**（上限 + 淘汰都在写入点旁）⇒ 必须判"有界"，
 *    否则它就是一条只会红的装饰（`mig-rules-14`）。
 *
 * ── 今天为什么红 ───────────────────────────────────────────────────────────
 * `A`：第二次装配掉成无角色（`BRIDGE-PIN-LOST-*`）。
 * `B`：两张表的写入点旁既没有上限常量、也没有淘汰动作（`BRIDGE-MAP-UNBOUNDED`）；
 *     `BRIDGE_CLAIMS` 那一侧今天是**有界**的（`BRIDGE-CLAIM-CAP` 一栏会照实记成绿），
 *     这一栏的存在是为了防"修两张表的顺手把那一张的上限删掉"。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import {
  MISSING_ID, buildCatalog, buildContentRoot, catalogNames, configFromComposition,
  injectedNames, injectedText, loadInjector, withHarness,
} from '../support/injector-harness.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// 被测树 = **本工作区**的 `presets/agenia`（与 `BRG-01` 同一口径：不用硬编码的 `PATHS.finalPreset`）
// ─────────────────────────────────────────────────────────────────────────────
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const PRESET = path.join(REPO, 'presets', 'agenia')
const INJECTOR = path.join(PRESET, 'inject.js')
const YML = path.join(PRESET, 'agent.cordis.yml')

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()

let SUT = { ok: false, code: 'SUT-SURFACE-MISSING', why: '还没加载', mod: null }

/** 一份内容根 + config + 目录（落在运行根里）。 */
function fixture(id) {
  const contentDir = path.join(runRoot(), 'tmp', 'bmap', id)
  buildContentRoot({ root: contentDir, presetDir: PRESET, runRoot: runRoot() })
  const conf = configFromComposition({ ymlText: readFileSync(YML, 'utf8'), contentDir })
  const base = Array.isArray(SUT.mod?.BASE_TOOL_SET) ? SUT.mod.BASE_TOOL_SET : null
  return {
    contentDir,
    conf,
    catalog: base === null ? null : buildCatalog(base),
    config: conf.ok ? { ...conf.config, defaultRole: 'member' } : null,
  }
}

const charterOf = (role) => `agenia:charter:${role}`

/**
 * **上限那一条的读取器**（纯函数；`BMAP-01` 的 `B` 腿与它自己的阳性对照共用一份）。
 *
 * 判什么：对每张表，看它的**写入路径**有没有"上限 + 淘汰"这一对：
 *   · 形状 ①（直写）：`MAP.set(` / `SET.add(` —— 写入点两侧 `window` 字符内必须同时有
 *     一个 `BRIDGE_*CAP*` 常量被引用、**且**一条淘汰动作（`delete(` / `splice(` / `clear(` / `while` / `for (`）；
 *   · 形状 ②（经助手）：表被当成**实参**传进去（`someHelper(MAP, …)`）—— 那就去那个助手的**定义体**里看
 *     同一对东西（上限常量 + 淘汰动作）。为什么认这一形：把四张表都收进一个 `bridgeTrim(map, cap)` 是
 *     最自然的修法；只认形状 ① 会把那种修法判成"没上限"（假红，`mig-test-05`）。
 *
 * 今天两张表都是形状 ①、窗口里都没有 `BRIDGE_*CAP*` ⇒ 判"无界"。
 *
 * @param {string} source  `inject.js` 全文
 * @param {{window?: number}} [opts]  写入点两侧看多少字符
 */
function boundedTablesOf(source, { window = 700 } = {}) {
  const text = String(source)
  const capConstants = [...text.matchAll(/const\s+(BRIDGE_[A-Z0-9_]*CAP[A-Z0-9_]*)\s*=\s*([0-9][0-9_]*)/g)]
    .map((m) => ({ name: m[1], value: Number(String(m[2]).replace(/_/g, '')) }))
  const EVICTS = ['delete(', 'splice(', 'clear(', 'while (', 'for (']
  const capNamesIn = (chunk) => capConstants.filter((cap) => chunk.includes(cap.name)).map((cap) => cap.name)
  const evictsIn = (chunk) => EVICTS.filter((needle) => chunk.includes(needle))
  /** 一个函数的定义体（从 `function name(` / `const name = (` 起到它自己那一层的收尾括号；找不到 ⇒ null）。 */
  const bodyOf = (fnName) => {
    const at = new RegExp(`(?:function\\s+${fnName}\\s*\\(|(?:const|let|var)\\s+${fnName}\\s*=\\s*(?:async\\s*)?\\()`).exec(text)
    if (at === null) return null
    const start = text.indexOf('{', at.index)
    if (start < 0) return null
    let depth = 0
    for (let i = start; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1
      else if (text[i] === '}') {
        depth -= 1
        if (depth === 0) return text.slice(start, i + 1)
      }
    }
    return null
  }
  const table = (name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    /** 形状 ①：直写。 */
    const direct = [...text.matchAll(new RegExp(`${escaped}\\.(?:set|add)\\(`, 'g'))].map((m) => m.index)
    /** 形状 ②：当实参传进某个调用。 */
    const viaHelper = [...text.matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*\\(\\s*${escaped}\\s*[,)]`, 'g'))]
      .map((m) => ({ at: m.index, helper: m[1] }))
    const per = []
    for (const at of direct) {
      const around = text.slice(Math.max(0, at - window), at + window)
      const caps = capNamesIn(around)
      const evicts = evictsIn(around)
      per.push({ kind: 'direct', at, caps, evicts, bounded: caps.length > 0 && evicts.length > 0 })
    }
    for (const site of viaHelper) {
      const around = text.slice(Math.max(0, site.at - window), site.at + window)
      const body = bodyOf(site.helper) ?? ''
      const caps = [...new Set([...capNamesIn(around), ...capNamesIn(body)])]
      const evicts = [...new Set([...evictsIn(around), ...evictsIn(body)])]
      per.push({ kind: 'helper', helper: site.helper, at: site.at, caps, evicts, bounded: caps.length > 0 && evicts.length > 0 })
    }
    return {
      table: name,
      declares: new RegExp(`(?:const|let)\\s+${name}\\s*=`).test(text),
      write_sites: direct.length,
      helper_sites: viaHelper.map((site) => site.helper),
      per,
      bounded: per.some((item) => item.bounded),
    }
  }
  const tables = ['BRIDGE_CLAIMS', 'BRIDGE_PINNED', 'BRIDGE_MISS_WARNED'].map(table)
  return { cap_constants: capConstants, tables, ok: tables.every((t) => t.bounded) }
}

/**
 * 每一格的预检（被测面在不在 / 夹具成不成立 / 目录造不造得出）。
 * ⚠️ 与 `brg01` 同一处坑：`before()` 登记在文件末尾，别让顶层 `const` 晚于它初始化。
 */
function prerequisites(problems, fx) {
  if (!SUT.ok) {
    problems.push(problem(SUT.code ?? 'SUT-SURFACE-MISSING', `被测面没加载上：${SUT.why}`))
    return false
  }
  if (fx.conf?.ok !== true) {
    problems.push(problem('BMAP-HARNESS-CONFIG', `载具的 config 读不出来：${fx.conf?.why ?? '(无)'}`))
    return false
  }
  if (fx.catalog === null) {
    problems.push(problem('BMAP-HARNESS-CATALOG', '现役 inject.js 没有导出 `BASE_TOOL_SET` —— 合成工具目录无从造'))
    return false
  }
  return true
}

test('BMAP-01 委派桥的两张表有上限（像 BRIDGE_CLAIMS 一样）· scope.id 缺失/非字符串时仍然钉住角色', async () => {
  await runCase('BMAP-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = { sut: { file: INJECTOR, bytes: readFileSync(INJECTOR).length, sha256: sha256(INJECTOR) } }
    rec.readings.bmap01 = readings
    const fx = fixture('BMAP-01')
    if (!prerequisites(problems, fx)) return caseFail(problems)
    const { contentDir, config, catalog } = fx

    // ── A 腿：scope.id 坏了，pin 还钉不钉得住 ─────────────────────────────────────
    const PROMPT = 'BMAP-01 派工：这一发是 team_test —— 只跑 tests/ 下的用例。'
    /**
     * 一发子会话的两次装配（同一会话、第二次队列已空）。
     * @param {{label: string, scopeId: unknown}} input
     */
    const shot = async ({ label, scopeId }) => {
      const parentSid = `bmap-p-${label}`
      const childSid = `bmap-c-${label}`
      const agentId = `bmap-agent-${label}`
      const header = { cwd: contentDir, agentPreset: 'agenia-member', origin: 'subagent', parentSession: parentSid }
      // ① 父会话（组长那份 apply）放行 `team_test`，把 claim 记进模块级队列。
      let guard = null
      await withHarness(SUT.mod, { contentDir, config, header: { id: parentSid, cwd: contentDir, agentPreset: 'agenia' }, id: parentSid, catalog }, async (harness) => {
        guard = harness.guard({ name: 'team_test', arguments: { prompt: PROMPT }, agent: { id: agentId, session: { id: agentId, header: { id: parentSid, cwd: contentDir, agentPreset: 'agenia' } } } })
      })
      const assemble = async () => {
        let out = null
        let seen = null
        let logs = []
        await withHarness(SUT.mod, {
          contentDir, config, catalog, header, id: childSid, agentId, scopeId,
          messages: [{ role: 'user', content: PROMPT }],
        }, async (harness) => {
          out = await harness.assemble([])
          seen = harness.contextSeen()
          logs = [...harness.logs]
        })
        const names = injectedNames(out)
        return {
          charters: names.filter((name) => String(name).startsWith('agenia:charter:')),
          persona: injectedText(out, 'agenia:role-persona'),
          catalog: catalogNames(out),
          context_seen: seen,
          miss_warned: logs.filter((line) => line.includes('桥：父会话')).length,
        }
      }
      const first = await assemble()
      const second = await assemble()
      return { label, scope_id_input: typeof scopeId === 'symbol' ? 'MISSING_ID' : scopeId, guard: guard?.ok ?? null, guard_reason: guard?.reason ?? null, agent_id: agentId, first, second }
    }

    const shots = [
      await shot({ label: 'nonstring', scopeId: 12345 }),
      await shot({ label: 'missing', scopeId: MISSING_ID }),
    ]
    readings.pins = shots

    for (const item of shots) {
      // 夹具自证：门禁挂上了、claim 真的记了（第一次装配拿得到角色）——否则"第二次掉了"会被读成别的事。
      if (item.guard !== true || (item.guard_reason !== undefined && item.guard_reason !== null)) {
        push('BMAP-HARNESS-GUARD', `${item.label}：\`team_test\` 那一发没被放行（${JSON.stringify(item.guard_reason)}）`)
      }
      // 量具自证：注入器**真的**看到了"坏形状"的 scope.id（不然这一格量的是另一件事）
      const seen = item.first.context_seen ?? {}
      const shapeOk = item.label === 'missing'
        ? seen.scope_has_id === false
        : (typeof seen.scope_id !== 'string' && seen.scope_id !== undefined)
      if (seen.agent_id !== item.agent_id || !shapeOk) {
        push('BMAP-HARNESS-SCOPE',
          `${item.label}：载具没有把"坏形状的 scope.id"交到注入器手里（装配那一刻看到的是 ${JSON.stringify(seen)}，`
          + `期望 agent_id=${JSON.stringify(item.agent_id)} + ${item.label === 'missing' ? 'scope 上没有 id 键' : 'scope.id 不是字符串'}）`
          + ' —— 先修载具，别把它读成功能红')
      }
      if (!item.first.charters.includes(charterOf('test'))) {
        push('BMAP-FIRST-ASSEMBLY-LOST',
          `${item.label}：第一次装配就没拿到 test（charters=${JSON.stringify(item.first.charters)}）—— `
          + '那说明 claim 根本没被记/取（不是 pin 的问题）；这一格剩下的部分不再有意义')
        continue
      }
      /**
       * 🔴 判据：**同一个子会话第二次装配仍然是 test**。
       * 队列此时已经空了（第一条 claim 被消费掉）⇒ 唯一能让角色活下来的是 `BRIDGE_PINNED`。
       * 今天它钉不上：`BRIDGE_PINNED.set(...)` 只在 `typeof agentId === 'string'` 时执行，
       * 而 `agentId = context.scope.id` —— 形状一坏，pin 静默不写；第二次装配读 `pinned` 也拿不到 ⇒ row 5。
       */
      if (!item.second.charters.includes(charterOf('test'))) {
        push(item.label === 'missing' ? 'BRIDGE-PIN-LOST-MISSING-ID' : 'BRIDGE-PIN-LOST-NONSTRING-ID',
          `${item.label}：同一个子会话**第二次**装配掉回了无角色（charters=${JSON.stringify(item.second.charters)} · `
          + `persona=${JSON.stringify(String(item.second.persona).slice(0, 20))}）—— 队列这时已经空了，`
          + '所以只可能是 `BRIDGE_PINNED` 那一格没写进去：`context.scope.id` 不是字符串时 pin 被**静默跳过**'
          + `（装配那一刻注入器看到的是 ${JSON.stringify(item.second.context_seen)}）。`
          + `契约：\`scope.id\` 缺失 / 非字符串时必须用 \`agentId\`（\`context.agent.id\` = ${JSON.stringify(item.agent_id)}）兜底，`
          + '否则这个子会话的下一轮对话就掉成"无角色 + 窄 + 没有说明书"（`ticket-20261102-06`）',
          { seen: item.second.context_seen, agent_id: item.agent_id })
      }
    }

    // ── B 腿：两张表的上限（源码声明面 + 阳性对照）──────────────────────────────────
    const source = readFileSync(INJECTOR, 'utf8')
    const bounded = boundedTablesOf(source)
    readings.bounds = bounded
    const tableOf = (name) => bounded.tables.find((t) => t.table === name) ?? null
    for (const name of ['BRIDGE_PINNED', 'BRIDGE_MISS_WARNED']) {
      const table = tableOf(name)
      if (table === null || !table.declares) {
        push('BMAP-HARNESS-SOURCE', `源码里找不到 \`${name}\` 的声明 —— 读取器的落点没了（先修读取器/口径，别读成功能红）`)
        continue
      }
      if (!table.bounded) {
        push('BRIDGE-MAP-UNBOUNDED',
          `\`${name}\` 的写入路径上既没有上限常量、也没有淘汰动作（直写 ${table.write_sites} 处 · 经助手 ${JSON.stringify(table.helper_sites)}：`
          + `${JSON.stringify(table.per.map((p) => ({ kind: p.kind, helper: p.helper ?? null, caps: p.caps, evicts: p.evicts })))}）—— `
          + '同一份文件里 `BRIDGE_CLAIMS` 是**有界**的（`BRIDGE_CLAIM_CAP = 16` + 超了就 `splice` 掉最旧的），'
          + '这两张表却没有头：长进程里每来一个子会话就多一条，只涨不落（`ticket-20261102-06` / `F5`）',
          { table: name, cap_constants: bounded.cap_constants })
      }
    }
    // 回归锁：`BRIDGE_CLAIMS` 那一张**今天是有界的** —— 这一栏防"加两张表的头时把它一起删掉"。
    const claims = tableOf('BRIDGE_CLAIMS')
    readings.bounds_claims = { bounded: claims?.bounded ?? null, caps: claims?.per?.flatMap((p) => p.caps) ?? null }
    if (claims !== null && !claims.bounded) {
      push('BRIDGE-CLAIM-CAP-LOST',
        '`BRIDGE_CLAIMS` 那一张的上限不见了（`BRIDGE_CLAIM_CAP` + 丢最旧）—— 它今天是有界的，'
        + '给另外两张表加头时不许把它一起拿掉（那是把一条已经成立的上限换成没有）')
    }

    /**
     * 阳性对照：同一只读取器喂一段**照契约写的最小实现**（上限 + 淘汰都在写入点旁）⇒ 必须判"有界"。
     * 没有这一条，"函数永远返回 false"与"生产真的没上限"长得一模一样（`mig-rules-14`）。
     */
    const SYNTH_BOUNDED = [
      'const BRIDGE_CLAIM_CAP = 16',
      'const BRIDGE_STATE_CAP = 256',
      'function bridgeRecordClaim(call) {',
      '  const queue = BRIDGE_CLAIMS.get(id) ?? []',
      '  queue.push(call)',
      '  if (queue.length > BRIDGE_CLAIM_CAP) queue.splice(0, queue.length - BRIDGE_CLAIM_CAP)',
      '  BRIDGE_CLAIMS.set(id, queue)',
      '}',
      'function bridgeTrim(map) {',
      '  while (map.size > BRIDGE_STATE_CAP) map.delete(map.keys().next().value)',
      '}',
      'function pin(agentId, toolName) {',
      '  BRIDGE_PINNED.set(agentId, toolName)',
      '  bridgeTrim(BRIDGE_PINNED)',
      '}',
      'function warn(key) {',
      '  BRIDGE_MISS_WARNED.add(key)',
      '  bridgeTrim(BRIDGE_MISS_WARNED)',
      '}',
      '',
    ].join('\n')
    const control = boundedTablesOf(SYNTH_BOUNDED)
    readings.bounds_selfcheck = {
      ok: control.ok,
      tables: control.tables.map((t) => ({ table: t.table, bounded: t.bounded, write_sites: t.write_sites })),
      cap_constants: control.cap_constants,
    }
    if (!control.ok) {
      push('BMAP-READER-SELFTEST',
        `读取器抽不出照契约写的合成源码里的上限（${JSON.stringify(readings.bounds_selfcheck.tables)}）—— `
        + '先把读取器修好，否则 `BRIDGE-MAP-UNBOUNDED` 那条只会红，翻不了面')
    }

    caseFail(problems)
  })
})

/**
 * 预检 + 加载被测面。
 * ⚠️ 必须在文件末尾登记：`node:test` 的顶层 `before()` 会比模块体后面那些 `const` 先跑
 * （`brg01` 第一版就栽在 `Cannot access 'INJECTOR' before initialization`）。
 */
before(async () => {
  preflight()
  SUT = await loadInjector(INJECTOR)
})
