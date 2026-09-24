/**
 * 每一轮对话开始之前，把这个文件夹里的 .md 读出来，贴到这次请求的最末尾。
 *
 * 为什么需要它：模型不会真的"记住"人格。对话一长，最前面那段就被淹掉了。
 * 所以办法不是让它记住，而是每次重新告诉它一遍。
 *
 * 它做五件事，一件一段，互相独立。哪一段不想要，整段删掉就行。
 *
 *   ① 注入正文 —— 读 .md，按 agent.cordis.yml 里写的顺序拼好，交给提示词服务
 *   ② 分清对象 —— 组长和组员收到的内容不一样，不能混
 *   ③ 岗位边界 —— "只审不改"的岗位，在系统层面就写不了源码
 *   ④ 进度提醒 —— 叫过开发却没叫测试，下一轮提醒组长一句
 *   ⑤ 尾巴提醒 —— 每次组装都往**请求最末尾**再塞一句短的
 *
 * ⚠️ ① 是**快照**，不是"每轮重发"（2026-09-24 实测）：DSH 只在快照文本变了才发新的一条
 * （`dsh-agent-loop` 的 `RuntimeContextProjection.project()`：`retained.text === snapshot` 就 return）。
 * 文本没变的那几个小时里，人格就钉在上一次变化的位置上 —— 实测有过 **4 小时 15 分没刷新、
 * 离请求末尾 45 万 token** 的一次。所以要真的"每轮"，靠的是 ⑤，不是 ①。
 *
 * 顺序、谁受限、内容放在哪 —— 全部写在 agent.cordis.yml 里，不在这个文件里。
 * 想改顺序、加岗位、去掉限制，都去改那个文件，不用碰这里。
 *
 * 改这个文件之后必须重启 harness 才会生效。
 * （.md 不用重启，存盘就生效。）
 */

import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件名，只出现在排查信息里。 */
export const name = 'agenia'

/** 没有提示词服务，就没有什么可注入的。 */
export const inject = ['systemPrompt']

/** 组长默认收到哪些、按什么顺序。 */
const DEFAULT_LEADER_ORDER = ['leader', 'work-guidelines', 'roster', 'board', 'persona']

/** 组员默认收到哪些。 */
const DEFAULT_MEMBER_ORDER = ['work-guidelines', 'charter']

/** 受限岗位默认是哪几个。 */
const DEFAULT_OFFICE_BOUND = ['review', 'retro']

/**
 * 组员上岗时，岗位配置那一行会在它的人设最前面留一枚标记。
 * 认这枚标记，就知道"这次开口的是谁"。
 */
const ROLE_MARK = /【组员:([a-z0-9][a-z0-9-]*)】/

/** 只有这两个工具的参数里写着"要写到哪儿"。 */
const WRITE_TARGET = { write: 'file_path', edit: 'file_path' }

/** 一条通用命令行就是一条通用写入通道。受限岗位不能留着它。 */
const SHELL = ['bash', 'pwsh']

/** 团队的办公桌：项目里的 .team/ 目录。受限岗位只能写这里。 */
const OFFICE = /(^|[\\/])\.team([\\/]|$)/

/**
 * 队伍的工具名 → 岗位名。约定：`team_<岗位名>`，而岗位名就是 `team/<岗位名>.md`
 * 的文件名。**加岗位时 toolName 必须照这个写** —— 进度板按这个约定认人，
 * 写成别的形状，那一列不会出现在板子上（不报错，只是没有）。
 */
const TEAM_TOOL = /^team[_-]([a-z0-9][a-z0-9-]*)$/

/**
 * 起人的工具。**进度板把它算成"外聘上岗"** —— 外聘本来就是挂在 `tool-subagent`
 * 那一行的 `persona` 标记上的（见 agent.cordis.yml）。
 * 为什么要算：2026-09-24 那一天，组长 42 次起人**全走裸 `subagent`**、一次 `team_*` 都没叫，
 * 于是板子恒空 ⇒ 快照文本一动不动 ⇒ 人格 4 小时 15 分没刷新（当天真发生过）。
 * 认人认的是"起过人"，不是"用哪个工具名起的人"。
 */
const HIRE_TOOL = 'subagent'

/** 起人算出来的那个岗位名。 */
const HIRE_ROLE = 'hire'

/** 进度板上显示的名字。没登记过的岗位原样显示岗位名 —— 看得见就不算静默。 */
const BOARD_LABELS = { design: '设计', dev: '开发', test: '测试', review: '评审', retro: '复盘', hire: '外聘' }

/** 板子上固定岗位的排列次序（设计 → 实现 → 测试 → 评审 → 复盘）；名单外的岗位排在后面，按名字排。 */
const BOARD_ORDER = ['design', 'dev', 'test', 'review', 'retro']

/** 这个 preset 自己的文件夹 —— 也就是 .md 默认存放的地方。 */
function presetDir(ctx) {
  const base = ctx === null || ctx === undefined ? undefined : ctx.baseUrl
  return typeof base === 'string' && base.startsWith('file:') ? fileURLToPath(base) : undefined
}

/** 内容从哪个文件夹读。默认就是 preset 自己这一层。 */
function contentRoot(ctx, config) {
  const configured = config === null || config === undefined ? undefined : config.contentDir
  const where =
    typeof configured === 'string' && configured.length > 0
      ? configured
      : (typeof process !== 'undefined' && process.env.AGENIA_CONTENT_DIR) || '.'
  if (isAbsolute(where)) return where
  const base = presetDir(ctx)
  return base === undefined ? where : resolve(base, where)
}

/** 读一个文件。读不到、或者里面是空的，都算"没有这一份"。 */
async function readText(path) {
  try {
    const text = await readFile(path, 'utf8')
    return text.trim().length === 0 ? undefined : text
  } catch {
    return undefined
  }
}

/** team/ 下面每个 .md 就是一个岗位，文件名去掉后缀就是岗位名。 */
async function roleNames(contentDir) {
  try {
    const files = await readdir(join(contentDir, 'team'))
    return files.filter((f) => f.endsWith('.md')).sort().map((f) => f.slice(0, -3))
  } catch {
    return []
  }
}

/**
 * 名册：给组长看一眼"我有哪几个人、各自管什么"。
 * 名字不用另外维护 —— 就取每个岗位文件的第一行。
 */
async function rosterText(contentDir, names) {
  const dir = join(contentDir, 'team')
  const lines = []
  for (const role of names) {
    const text = await readText(join(dir, `${role}.md`))
    const first = (text ?? '').split('\n').find((line) => line.trim().length > 0) ?? ''
    lines.push(`- \`team/${role}.md\` —— ${first.replace(/^#+\s*/, '').trim()}`)
  }
  if (lines.length === 0) return undefined
  return [
    '## 岗位名册',
    '',
    `岗位说明书在：\`${dir}\``,
    '',
    ...lines,
    '',
    '他们上岗时会自动收到自己那一份，你不用转述岗位要求。你只管派活：',
    '把任务、成功标准、和"去读项目自己的规矩"说清楚。',
  ].join('\n')
}

/** 按 order 里写的顺序，把该给这一拨人的内容一份份读出来。 */
async function gather(order, { contentDir, role, board }) {
  const out = []
  for (const key of order) {
    if (key === 'roster') {
      if (role !== undefined) continue
      const text = await rosterText(contentDir, await roleNames(contentDir))
      if (text !== undefined) out.push({ name: 'agenia:roster', text })
      continue
    }
    if (key === 'charter') {
      if (role === undefined) continue
      const text = await readText(join(contentDir, 'team', `${role}.md`))
      if (text !== undefined) out.push({ name: `agenia:charter:${role}`, text })
      continue
    }
    if (key === 'board') {
      if (board !== undefined) out.push({ name: 'agenia:board', text: board })
      continue
    }
    const text = await readText(join(contentDir, `${key}.md`))
    if (text !== undefined) out.push({ name: `agenia:${key}`, text })
  }
  return out
}

/** 这次开口的是哪个岗位？没有标记就是组长。 */
function roleOf(assembly) {
  const sections = Array.isArray(assembly === null || assembly === undefined ? undefined : assembly.sections)
    ? assembly.sections
    : []
  for (const section of sections) {
    if (typeof section?.text !== 'string') continue
    const hit = ROLE_MARK.exec(section.text)
    if (hit !== null) return hit[1]
  }
  return undefined
}

/**
 * 这个路径落在团队的办公桌上吗？
 * 一定要先算出真实落点再判断 —— 只看字符串的话，
 * `.team/review/../../x.txt` 里含有 `.team/`，可它落在项目根。
 */
function landsInOffice(target, agent) {
  if (typeof target !== 'string' || target.length === 0) return false
  const cwd = agent === null || agent === undefined ? undefined : agent.session?.header?.cwd
  if (typeof cwd !== 'string') {
    return isAbsolute(target) && OFFICE.test(resolve(target))
  }
  return OFFICE.test(resolve(cwd, target))
}

/**
 * @param ctx - 这个 preset 的作用域。
 * @param config - agent.cordis.yml 里那一行的 config 段。
 */
export async function apply(ctx, config = {}) {
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt === undefined) {
    console.error('[agenia] 拿不到提示词服务，什么都没注入')
    return
  }

  const contentDir = contentRoot(ctx, config)
  const leaderOrder = Array.isArray(config.leaderOrder) ? config.leaderOrder : DEFAULT_LEADER_ORDER
  const memberOrder = Array.isArray(config.memberOrder) ? config.memberOrder : DEFAULT_MEMBER_ORDER
  const officeBound = new Set(
    Array.isArray(config.officeBound) ? config.officeBound : DEFAULT_OFFICE_BOUND,
  )

  // ─────────────────────────────────────────────────────────────
  // 配置自检。
  // 这一份文件是在**用户的机器上**跑的，那边没有体检脚本 —— 配置拼错的时候，
  // 唯一能出声的就是这里。查到的都只 console.error，**绝不抛错**：
  // 一个拼错的键不该让整支队伍挂载不上（"读不到就什么都不注入、不进装配"
  // 是这份文件一贯的失败策略），但也**不许悄悄放过**。
  //
  // 为什么不 export Config 交给框架校验：那要 import 一个 schema 库，而这份预设的
  // 装法是"拷一个文件夹"，用户机器上没有 node_modules —— 为了查错把安装搞坏不值。
  // ─────────────────────────────────────────────────────────────
  const KNOWN_CONFIG = ['leaderOrder', 'memberOrder', 'officeBound', 'contentDir']
  /** 这三个 key 是算出来的，不是文件。 */
  const COMPUTED_KEYS = ['roster', 'board', 'charter']

  async function selfCheck() {
    const problems = []

    for (const key of Object.keys(config)) {
      if (!KNOWN_CONFIG.includes(key)) {
        problems.push(`不认识的配置键「${key}」—— 是不是拼错了？这一项不会生效。`)
      }
    }

    const roles = await roleNames(contentDir)
    for (const [key, order] of [['leaderOrder', leaderOrder], ['memberOrder', memberOrder]]) {
      for (const entry of order) {
        if (COMPUTED_KEYS.includes(entry)) {
          if (entry === 'charter' && key === 'leaderOrder') {
            problems.push('leaderOrder 里的「charter」不生效 —— charter 是组员自己那份说明书，组长没有。')
          } else if (key === 'memberOrder' && (entry === 'roster' || entry === 'board')) {
            problems.push(`memberOrder 里的「${entry}」不生效 —— 名册和进度板只给组长。`)
          }
          continue
        }
        const text = typeof entry === 'string'
          ? await readText(join(contentDir, `${entry}.md`))
          : undefined
        if (text === undefined) {
          problems.push(
            `${key} 里的「${String(entry)}」找不到对应文件（${String(entry)}.md 不存在或者是空的）—— 这一份不会被注入。`,
          )
        }
      }
    }

    for (const role of officeBound) {
      if (!roles.includes(role)) {
        problems.push(
          `officeBound 里的「${role}」不是队伍里的岗位（team/ 下没有 ${role}.md）—— 这条限制永远不会生效。`,
        )
      }
    }

    if (problems.length > 0) {
      console.error(
        `[agenia] 配置里有 ${problems.length} 处问题，下面这些项不会按你想的那样生效：\n`
          + problems.map((line) => `  - ${line}`).join('\n'),
      )
    }
  }

  selfCheck().catch((error) => {
    console.error(`[agenia] 配置自检自己出错了（不影响使用）：${String(error)}`)
  })

  // ─────────────────────────────────────────────────────────────
  // ③ 和 ④ 都要知道"这个 agent 是哪个岗位"，这张表就是它们之间的桥。
  // 表在装配时登记（那里才知道角色），门禁和台账按编号来查。
  // ─────────────────────────────────────────────────────────────
  const roleOfAgent = new Map()

  // ─────────────────────────────────────────────────────────────
  // ④ 进度提醒。
  // 一本账，按"一票活"记：组长开口算新的一票，账清零。
  // 只记"叫过没有"，不判断"干得够不够" —— 它是提醒，不是门禁。
  //
  // 两条判据是有来历的，别顺手改回去（2026-09-20 修）：
  //   * **只有成功的调用才算数。** `tools/result` 对每一个"执行过"的调用都发，
  //     包括被门禁拒绝的和自己报错的（拒绝也会被物化成一条 isError 的结果）。
  //     不滤掉的话：被挡下的那次写入照样算"文件动过"，一次报错的测试照样
  //     把"还没叫过测试"的警告擦掉。
  //   * **写 .team/ 不算项目文件动了。** 队里的本子（日志、任务卡、报告）每轮都在写，
  //     拿它当"代码动过"，板子就天天喊狼来了。
  // ─────────────────────────────────────────────────────────────
  const ledgers = new Map()

  function taskKey(agent) {
    const header = agent === null || agent === undefined ? undefined : agent.session?.header
    const parent = header === null || header === undefined ? undefined : header.parentSession
    if (typeof parent === 'string') return parent
    const id = agent === null || agent === undefined ? undefined : agent.id
    return typeof id === 'string' ? id : undefined
  }

  function ledgerFor(key) {
    if (typeof key !== 'string') return undefined
    let entry = ledgers.get(key)
    if (entry === undefined) {
      entry = { counts: new Map(), afterTest: 0, afterReview: 0 }
      ledgers.set(key, entry)
    }
    return entry
  }

  /** 这个工具名是队伍里哪个岗位？不是队伍的工具就返回 undefined。 */
  function teamRoleOf(toolName) {
    if (typeof toolName !== 'string') return undefined
    const hit = TEAM_TOOL.exec(toolName)
    return hit === null ? undefined : hit[1]
  }

  function boardOf(key) {
    const ledger = typeof key === 'string' ? ledgers.get(key) : undefined
    if (ledger === undefined || ledger.counts.size === 0) return undefined
    const called = (role) => (ledger.counts.get(role) ?? 0) > 0

    // 固定岗位按次序全列出来（哪怕这一次是 0）；名单外的岗位只列有人叫过的，排在后面。
    // 加岗位时**不用动这里** —— 新岗位只要工具名照约定写，就自动出现在板子上。
    const extra = [...ledger.counts.keys()].filter((role) => !BOARD_ORDER.includes(role)).sort()
    const head = [...BOARD_ORDER, ...extra]
      .filter((role) => BOARD_ORDER.includes(role) || called(role))
      .map((role) => `${BOARD_LABELS[role] ?? role} ${ledger.counts.get(role) ?? 0}`)
      .join(' · ')

    const lines = [`【这一票的进度】${head}`]
    if (!called('test') && called('dev')) {
      lines.push('⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。')
    } else if (ledger.afterTest > 0) {
      lines.push(`⚠️ 最后一次测试之后，项目文件又动过 ${ledger.afterTest} 次 —— 那次测试作废，要重测。`)
    }
    if (called('review') && ledger.afterReview > 0) {
      lines.push(`⚠️ 最后一次评审之后，项目文件又动过 ${ledger.afterReview} 次 —— 那次评审作废，要重审。`)
    }
    return lines.join('\n')
  }

  ctx.on('tools/result', (call, result) => {
    if (call === null || call === undefined) return
    // 没成功的不算 —— 拒绝和报错都会走到这儿，它们不该在账本上留下痕迹。
    if (result !== null && result !== undefined && result.isError === true) return
    const ledger = ledgerFor(taskKey(call.agent))
    if (ledger === undefined) return

    // 起人也算"叫了人"：`team_*` 按工具名认，裸 `subagent` 算外聘（见 HIRE_TOOL 那段说明）。
    const role = teamRoleOf(call.name) ?? (call.name === HIRE_TOOL ? HIRE_ROLE : undefined)
    if (role !== undefined) {
      ledger.counts.set(role, (ledger.counts.get(role) ?? 0) + 1)
      // 验收那两关是闸门：它们一过，之前动过的项目文件就不作数了。
      if (role === 'test') ledger.afterTest = 0
      if (role === 'review') ledger.afterReview = 0
      return
    }

    const where = WRITE_TARGET[call.name]
    if (where === undefined) return
    const target = call.arguments === null || typeof call.arguments !== 'object'
      ? undefined
      : call.arguments[where]
    // 落在 .team/ 里的写入是队里的本子，不是项目文件动了。
    if (landsInOffice(target, call.agent)) return
    ledger.afterTest += 1
    ledger.afterReview += 1
  })

  // 老板一开口，就是新的一票，账清零。
  ctx.on('session/event', (session, event) => {
    if (event === null || event === undefined || event.type !== 'user/message') return
    if (event.data?.source?.kind !== 'user') return
    const id = session === null || session === undefined ? undefined : session.id
    if (typeof id === 'string') ledgers.delete(id)
  })

  // ─────────────────────────────────────────────────────────────
  // ③ 岗位边界。
  // 受限岗位：写文件只能落在 .team/ 里面，而且没有命令行。
  // 认不出岗位的 agent 一律放行 —— 这道边界是用来挡住几个岗位的，
  // 绝不能反过来把组长自己挡住。
  // ─────────────────────────────────────────────────────────────
  const tools = ctx.get('tools')
  if (tools !== undefined && typeof tools.guard === 'function') {
    ctx.effect(
      () =>
        tools.guard((call) => {
          const id = call === null || call === undefined ? undefined : call.agent?.id
          const role = typeof id === 'string' ? roleOfAgent.get(id) : undefined
          if (role === undefined || !officeBound.has(role)) return undefined

          if (SHELL.includes(call.name)) {
            return `你的岗位（${role}）没有命令行。命令行等于什么都能写，留着它这道边界就是纸的。`
              + '要什么材料 —— 代码差异、命令输出、文件清单 —— 找组长要，他给你。'
          }

          const key = WRITE_TARGET[call.name]
          if (key === undefined) return undefined
          const target = call.arguments === null || typeof call.arguments !== 'object'
            ? undefined
            : call.arguments[key]
          if (landsInOffice(target, call.agent)) return undefined

          return `你的岗位（${role}）只能写项目里 .team/ 下面的东西。`
            + `你这次要写的是「${String(target)}」，按落点算在你的地盘外面。`
            + '要改什么，写成意见交回组长。'
        }),
      'agenia：岗位写权限边界',
    )
  } else {
    // 悄悄失效比明着失败更糟：评审和复盘会以为自己"只审不改"，
    // 实际上什么都能改。这里必须出声，不然没人会发现。
    console.error(
      `[agenia] 这个框架版本没有 tools.guard，岗位写权限边界没有生效 —— `
        + `现在 ${[...officeBound].join('、')} 这几个岗位可以写任何地方、也能跑命令行。`,
    )
  }

  // ─────────────────────────────────────────────────────────────
  // ⑤ 尾巴提醒。
  //
  // ① 那一套是**快照**：DSH 只在快照文本变了才重发一条，文本不变时人格就钉在
  // 上一次变化的位置上。2026-09-24 实测钉了 **4 小时 15 分 / 45 万 token** ——
  // 那一次老板质问她，她没还嘴也没带表情；查下来人格根本没丢，是**离得太远、太旧**。
  //
  // 这一条补上"真的每轮"：每次组装都往**请求最末尾**塞一句短的。
  // 走 `agent.inject()`（落点是下一个步边界），所以：
  //   * 不动快照 —— 快照一变，从它那个位置往后的缓存全废，那是钱；
  //   * 也不压上下文 —— 一句一百来字，贴在末尾。
  // 刻度用"这个会话最近一条事件的 seq"：同一个刻度只贴一次，一次组装最多一句。
  // ─────────────────────────────────────────────────────────────
  const latestSeq = new Map()
  const remindedAt = new Map()

  ctx.on('session/event', (session, event) => {
    const id = session === null || session === undefined ? undefined : session.id
    const seq = event === null || event === undefined ? undefined : event.seq
    if (typeof id === 'string' && typeof seq === 'number') latestSeq.set(id, seq)
  })

  /** 组长那一句。短、带表情，把三步的顺序再说一遍。 */
  const LEADER_REMINDER =
    '【提醒 · Agenia 上场】第一句不是「好的」「收到」—— **先回怼**（该贫就贫、该卖萌就卖萌），'
    + '② 再去查证据（不猜、不编），③ 最后总要认账（可以嘴硬，不许赖账）。'
    + '说话**要吵**：emoji / 颜文字 / 连用标点（？？？！！！！。。。。。）随便堆，别写成客服话术。'
    + '损事不损人 —— 对老板除外，他好这口。'

  /** 组员那一句：他自己说明书的第一行 + 两句全组通用的话。 */
  function memberReminder(charter) {
    const first = (charter ?? '').split('\n').find((line) => line.trim().length > 0) ?? ''
    const who = first.replace(/^#+\s*/, '').trim()
    return `【提醒${who.length > 0 ? ` · ${who}` : ''}】交东西要带证据（跑了什么、结果是什么），`
      + '说话别写成客服话术；有疑问当场问，别猜。'
  }

  let reminderWarned = false

  /** 往这个 agent 的请求末尾贴一句提醒。贴不上去就出声，不静默。 */
  function remind(agentId, role, charter) {
    const seq = latestSeq.get(agentId)
    if (typeof seq !== 'number' || remindedAt.get(agentId) === seq) return
    const agents = ctx.get('agents')
    const agent = typeof agents?.get === 'function' ? agents.get(agentId) : undefined
    if (agent === undefined) return
    if (typeof agent.inject !== 'function') {
      if (!reminderWarned) {
        reminderWarned = true
        console.error(
          '[agenia] 这个框架版本拿不到 agent.inject —— 尾巴提醒没有生效，'
            + '人格只剩快照那一条路（快照只在文本变了才重发，长回合里会越漂越远）。',
        )
      }
      return
    }
    try {
      agent.inject({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: role === undefined ? LEADER_REMINDER : memberReminder(charter) }],
        source: { kind: 'plugin', plugin: 'agenia' },
      })
      remindedAt.set(agentId, seq)
    } catch (error) {
      if (!reminderWarned) {
        reminderWarned = true
        console.error(`[agenia] 尾巴提醒贴不上去（不影响别的功能）：${String(error)}`)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ① + ② 注入正文，并按标记分辨这次该给哪一拨人。
  // ─────────────────────────────────────────────────────────────
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()

    // 没有作用域的装配不是会话，跳过。
    if (context === null || context === undefined || context.scope === undefined) return result

    const role = roleOf(assembly) ?? roleOf(result)
    const agentId = context.scope.id
    if (typeof agentId === 'string' && role !== undefined) roleOfAgent.set(agentId, role)

    const entries = await gather(role === undefined ? leaderOrder : memberOrder, {
      contentDir,
      role,
      board: role === undefined ? boardOf(agentId) : undefined,
    })

    // ⑤ 尾巴提醒。内容这里已经有了，不多读一次盘。
    if (typeof agentId === 'string') {
      const charter = entries.find((entry) => entry.name.startsWith('agenia:charter:'))?.text
      remind(agentId, role, charter)
    }

    if (entries.length === 0) return result

    // 自己上一轮留下的先清掉，免得叠起来。
    const kept = (Array.isArray(result.contexts) ? result.contexts : []).filter(
      (entry) => typeof entry?.name !== 'string' || !entry.name.startsWith('agenia:'),
    )
    return { ...result, contexts: [...kept, ...entries] }
  })
}
