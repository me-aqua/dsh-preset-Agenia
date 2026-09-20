/**
 * 每一轮对话开始之前，把这个文件夹里的 .md 读出来，贴到这次请求的最末尾。
 *
 * 为什么需要它：模型不会真的"记住"人格。对话一长，最前面那段就被淹掉了。
 * 所以办法不是让它记住，而是每次重新告诉它一遍。
 *
 * 它做四件事，一件一段，互相独立。哪一段不想要，整段删掉就行。
 *
 *   ① 每轮注入 —— 读 .md，按 agent.cordis.yml 里写的顺序拼好，贴到请求最末尾
 *   ② 分清对象 —— 组长和组员收到的内容不一样，不能混
 *   ③ 岗位边界 —— "只审不改"的岗位，在系统层面就写不了源码
 *   ④ 进度提醒 —— 叫过开发却没叫测试，下一轮提醒组长一句
 *
 * 顺序、谁受限、内容放在哪 —— 全部写在 agent.cordis.yml 里，不在这个文件里。
 * 想改顺序、加岗位、去掉限制，都去改那个文件，不用碰这里。
 *
 * 改这个文件之后必须重启 harness 才会生效。
 * （.md 不用重启，存盘就生效。）
 */

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
  // ③ 和 ④ 都要知道"这个 agent 是哪个岗位"，这张表就是它们之间的桥。
  // 表在装配时登记（那里才知道角色），门禁和台账按编号来查。
  // ─────────────────────────────────────────────────────────────
  const roleOfAgent = new Map()

  // ─────────────────────────────────────────────────────────────
  // ④ 进度提醒。
  // 一本账，按"一票活"记：组长开口算新的一票，账清零。
  // 只记"叫过没有"，不判断"干得够不够" —— 它是提醒，不是门禁。
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
      entry = { design: 0, dev: 0, test: 0, review: 0, retro: 0, afterTest: 0, afterReview: 0 }
      ledgers.set(key, entry)
    }
    return entry
  }

  function boardOf(key) {
    const ledger = typeof key === 'string' ? ledgers.get(key) : undefined
    if (ledger === undefined) return undefined
    const total = ledger.design + ledger.dev + ledger.test + ledger.review + ledger.retro
    if (total === 0) return undefined

    const lines = [
      `【这一票的进度】设计 ${ledger.design} · 开发 ${ledger.dev} · 测试 ${ledger.test}`
        + ` · 评审 ${ledger.review} · 复盘 ${ledger.retro}`,
    ]
    if (ledger.test === 0 && ledger.dev > 0) {
      lines.push('⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。')
    } else if (ledger.afterTest > 0) {
      lines.push(`⚠️ 最后一次测试之后代码又动过 ${ledger.afterTest} 次 —— 那次测试作废，要重测。`)
    }
    if (ledger.review > 0 && ledger.afterReview > 0) {
      lines.push(`⚠️ 最后一次评审之后代码又动过 ${ledger.afterReview} 次 —— 那次评审作废，要重审。`)
    }
    return lines.join('\n')
  }

  ctx.on('tools/result', (call) => {
    if (call === null || call === undefined) return
    const ledger = ledgerFor(taskKey(call.agent))
    if (ledger === undefined) return
    if (call.name === 'team_design') ledger.design += 1
    else if (call.name === 'team_dev') ledger.dev += 1
    else if (call.name === 'team_retro') ledger.retro += 1
    else if (call.name === 'team_test') {
      ledger.test += 1
      ledger.afterTest = 0
    } else if (call.name === 'team_review') {
      ledger.review += 1
      ledger.afterReview = 0
    } else if (call.name === 'write' || call.name === 'edit') {
      ledger.afterTest += 1
      ledger.afterReview += 1
    }
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
  // ① + ② 每轮注入，并按标记分辨这次该给哪一拨人。
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
    if (entries.length === 0) return result

    // 自己上一轮留下的先清掉，免得叠起来。
    const kept = (Array.isArray(result.contexts) ? result.contexts : []).filter(
      (entry) => typeof entry?.name !== 'string' || !entry.name.startsWith('agenia:'),
    )
    return { ...result, contexts: [...kept, ...entries] }
  })
}
