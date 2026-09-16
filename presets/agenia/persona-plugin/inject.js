/**
 * Persona + team injector for the `agenia` agent preset.
 *
 * WHAT IT DOES
 * Reads markdown from the preset directory on every model step and contributes
 * each file as a prompt CONTEXT section, so edits take effect on the NEXT STEP
 * of a running session — no restart, no new session. Text is revalidated per
 * file by mtime+size, so a rewrite is picked up on the following assembly at
 * the latest.
 *
 * TWO AUDIENCES, ONE PLUGIN
 * One preset mount serves the group leader (the session) and every child she
 * delegates to. They must NOT receive the same text: a member handed the
 * leader's persona would believe it is the leader. So the files are split into
 * three sets:
 *
 *   leader  persona · leader · process · world · work · practices · roster
 *   member  world · process · work · practices · (its own charter)
 *   hire    world · process · work · practices · (no charter — one-off work)
 *
 * WHICH SET APPLIES IS DECIDED BY A MARKER, NOT BY SCOPE
 * Every team tool row carries a `persona` beginning with `【组员:<role>】`, and
 * the persona is registered as this child's `deployment:persona-prefix`
 * section — so the marker is sitting in the assembly's own sections, verbatim
 * (the marker contains no `{{…}}`, so interpolation cannot touch it).
 *
 * An assembly with no marker is the leader's. That includes anything a future
 * row starts without a persona, which is why the leader set is the DEFAULT:
 * failing open keeps the leader working, and a mis-set marker is loud (a member
 * that starts calling itself Agenia) rather than silent.
 *
 * BEFORE THIS, DETECTION WAS DONE BY SCOPE ALONE
 * An earlier version keyed only off `context.scope`, which answered "is this
 * assembly mine" but not "which of my agents is it". The marker adds the second
 * answer without giving up the first: the scope guard below is unchanged.
 *
 * FAILURE POLICY
 * Never throw into assembly: a bad or missing markdown file must not break the
 * agent. A source that cannot be read injects nothing and logs once per
 * distinct problem; every other source is unaffected.
 *
 * EDITING THIS FILE REQUIRES A RESTART OR A `?v=` BUMP
 * ES modules are cached by URL, and a FAILED import is cached as failed against
 * that URL too — that once left the persona silently un-injected while
 * `MOUNT OK` and `fiber=2` both still looked fine. The row's `?v=` query is
 * load-bearing: any edit to this file needs a bump or a harness restart.
 */

import { appendFile, readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'agenia-persona'

/** This row needs the prompt registry; without it there is nothing to inject into. */
export const inject = ['systemPrompt']

/**
 * Self-check switch. When `PERSONA_SELF_CHECK` is set in the environment, the
 * plugin records what it was handed, so the scope-filtering claim can be
 * re-measured instead of believed. Bounded, append-only, and off by default.
 */
const SELF_CHECK = typeof process !== 'undefined' && Boolean(process.env && process.env.PERSONA_SELF_CHECK)
/** Entries written while {@link SELF_CHECK} is on, capped so it cannot grow. */
let selfCheckWrites = 0

/** The preset's own `team/` directory — the roster and every charter live here. */
const TEAM_DIR = new URL('../team/', import.meta.url)

/**
 * Every injectable file, keyed by the role it plays rather than by its path, so
 * the three sets below read as a table instead of a pile of URLs.
 */
const SOURCES = {
  persona: {
    name: 'persona.md',
    url: new URL('../persona.md', import.meta.url),
    contextName: 'agenia:persona',
  },
  leader: {
    name: 'leader.md',
    url: new URL('../leader.md', import.meta.url),
    contextName: 'agenia:leader',
  },
  process: {
    name: 'process.md',
    url: new URL('../process.md', import.meta.url),
    contextName: 'agenia:process',
  },
  world: {
    name: 'team/world.md',
    url: new URL('../team/world.md', import.meta.url),
    contextName: 'agenia:world',
  },
  work: {
    name: 'work-guidelines.md',
    url: new URL('../work-guidelines.md', import.meta.url),
    contextName: 'agenia:work',
  },
  practices: {
    name: 'codebase-practices.md',
    url: new URL('../codebase-practices.md', import.meta.url),
    contextName: 'agenia:practices',
  },
}

/** The group leader: who she is, how she leads, the process, the team, the rules. */
const LEADER_SET = ['persona', 'leader', 'process', 'world', 'work', 'practices']

/**
 * A team member: the shared frame and the shared rules only.
 *
 * The engineering guidelines and the practice library are deliberately here —
 * they are the whole reason a member can be handed a job and behave like
 * somebody who works in this codebase. The leader's identity and manual are
 * deliberately NOT.
 */
const MEMBER_SET = ['world', 'process', 'work', 'practices']

/**
 * The role marker a team tool row puts at the front of its child's persona.
 * Restricted to the same charset a preset id uses, so the captured role can
 * only ever name a sibling file inside `team/`.
 */
const ROLE_MARKER = /【组员:([a-z0-9][a-z0-9-]*)】/

/**
 * Which role each live agent is, keyed by agent id.
 *
 * Two halves of one fact, and neither half can see both: the role MARKER lives
 * in the child's persona section, which only the assembly listener sees, while
 * the CALLER of a tool is what a guard sees. They are joined here by agent id.
 *
 * If this map never fills, the guard recognises nobody and every write is
 * allowed — the boundary FAILS OPEN. That is the only safe direction: this rule
 * exists to keep three roles out of the source tree, and it must never be able
 * to stop the group leader from working.
 */
const agentRoles = new Map()

/** The roles whose pen is confined to the team office. */
const OFFICE_BOUND_ROLES = new Set(['product', 'review', 'retro'])

/** Tool name → the argument that names the path it writes. */
const WRITE_PATH_ARGUMENT = { write: 'file_path', edit: 'file_path' }

/**
 * A `.team/` path segment — the team office, and deliberately NOT the preset's
 * own `team/` charter directory (no leading dot), which only the leader may
 * touch, and only with the boss's approval.
 */
const OFFICE_SEGMENT = /(^|[\\/])\.team([\\/]|$)/

/** Boundary log lines written, capped so the file cannot grow without limit. */
let boundaryLogWrites = 0

/**
 * The process ledger, one per TASK, keyed by the leading agent's id.
 *
 * A member's calls belong to the leader's task, so the key is the child's
 * `parentSession` and the leader's own id otherwise. Writes are counted as they
 * happen — a member writing five files is five writes — so `team_dev` itself is
 * deliberately NOT counted as a change; the dev's own tool results are.
 *
 * Cleared when the boss speaks (`session/event`, `user/message`, source `user`),
 * because a ledger that never resets stops meaning anything after one task.
 * If that event never arrives the counts simply accumulate, which is degraded
 * but not wrong.
 */
const ledgers = new Map()

/** The id of the task this agent's call belongs to. */
function taskKeyOf(agent) {
  const header = agent === null || agent === undefined ? undefined : agent.session?.header
  const parent = header === undefined ? undefined : header.parentSession
  return typeof parent === 'string' ? parent : agent?.id
}

/** The ledger for one task, created on first use. */
function ledgerFor(key) {
  let entry = ledgers.get(key)
  if (entry === undefined) {
    entry = { product: 0, dev: 0, test: 0, review: 0, retro: 0, sinceTest: 0, sinceReview: 0 }
    ledgers.set(key, entry)
  }
  return entry
}

/**
 * Fold one settled tool call into its task's ledger.
 *
 * Called from a `tools/result` observer, so only calls that actually ran are
 * counted — a refused call leaves no trace here, which is what a process
 * ledger should mean.
 */
function noteSettledCall(name, agent) {
  if (agent === null || agent === undefined) return
  const key = taskKeyOf(agent)
  if (typeof key !== 'string') return
  const ledger = ledgerFor(key)
  if (name === 'team_product') ledger.product += 1
  else if (name === 'team_dev') ledger.dev += 1
  else if (name === 'team_retro') ledger.retro += 1
  else if (name === 'team_test') {
    ledger.test += 1
    ledger.sinceTest = 0
  } else if (name === 'team_review') {
    ledger.review += 1
    ledger.sinceReview = 0
  } else if (name === 'write' || name === 'edit') {
    ledger.sinceTest += 1
    ledger.sinceReview += 1
  }
}

/**
 * The board the leader sees every turn: what has been called, and — the part
 * that matters — whether anything has changed since the last time somebody
 * independent looked at it.
 */
function boardText(key) {
  const ledger = typeof key === 'string' ? ledgers.get(key) : undefined
  if (ledger === undefined) return undefined
  const total = ledger.product + ledger.dev + ledger.test + ledger.review + ledger.retro
  if (total === 0) return undefined

  const lines = [
    '【流程状态】'
      + `产品 ${ledger.product} · 开发 ${ledger.dev} · 测试 ${ledger.test}`
      + ` · 审核 ${ledger.review} · 复盘 ${ledger.retro}`,
  ]
  if (ledger.test === 0 && ledger.dev > 0) {
    lines.push('⚠️ 叫过开发，还没叫过测试 —— 没人验过的改动不算完成。')
  } else if (ledger.sinceTest > 0) {
    lines.push(`⚠️ 最后一次测试之后，代码又动过 ${ledger.sinceTest} 次 —— 那次测试作废，要重测。`)
  }
  if (ledger.review > 0 && ledger.sinceReview > 0) {
    lines.push(`⚠️ 最后一次评审之后，代码又动过 ${ledger.sinceReview} 次 —— 那次评审作废，要重审。`)
  }
  return lines.join('\n')
}

/** Append one boundary decision to a bounded log, for verification runs. */
async function noteBoundary(line) {
  if (boundaryLogWrites >= 60) return
  try {
    await appendFile(join(tmpdir(), 'agenia-boundary.log'), `${line}\n`, 'utf8')
    // Counted only after a successful write, so a failing write cannot burn the
    // budget and silently stop the record.
    boundaryLogWrites += 1
  } catch (error) {
    logOnce('boundary', `boundary log write failed: ${String(error && error.message)}`)
  }
}

/** The live agent id behind an assembly scope, when it exposes one. */
function agentIdOf(scope) {
  if (scope === null || typeof scope !== 'object') return undefined
  const id = scope.id
  return typeof id === 'string' ? id : undefined
}

/**
 * Shell tools. A general shell IS a general write channel, so an office-bound
 * role cannot keep one — otherwise the boundary is decoration. Denied by NAME
 * rather than through a row's `toolFilter` on purpose: the row would have to
 * name whichever of `pwsh`/`bash` this platform registers, and naming the other
 * one fails the child start as an unknown tool.
 */
const SHELL_TOOLS = new Set(['pwsh', 'bash'])

/**
 * Whether a path argument lands inside the team office.
 *
 * Resolved, never matched as text. `.team/product/../../x.txt` CONTAINS a
 * `.team/` segment and still lands in the project root — a verification run
 * found exactly that bypass, which is why this normalises against the agent's
 * own working directory before testing the segment.
 */
function landsInOffice(target, agent) {
  if (typeof target !== 'string' || target.length === 0) return false
  const cwd = agent === null || agent === undefined ? undefined : agent.session?.header?.cwd
  if (typeof cwd !== 'string') {
    // No base to resolve a relative path against. Only an already-absolute path
    // can be cleared; anything else is refused rather than guessed.
    return isAbsolute(target) && OFFICE_SEGMENT.test(resolve(target))
  }
  return OFFICE_SEGMENT.test(resolve(cwd, target))
}

/**
 * The monotonic guard behind the write boundary.
 *
 * Returns a reason to DENY, or undefined to leave the call alone. An unplaceable
 * agent (no id, no role) is always left alone — the boundary exists to keep
 * three roles out of the source tree, and must never stop the leader working.
 */
function boundaryReason(name, args, agent) {
  const id = agent === null || agent === undefined ? undefined : agent.id
  const role = typeof id === 'string' ? agentRoles.get(id) : undefined
  if (role === undefined || !OFFICE_BOUND_ROLES.has(role)) return undefined

  if (SHELL_TOOLS.has(name)) {
    void noteBoundary(`DENY  ${name}  role=${role}  (shell)`)
    return `你的角色（${role}）没有 shell。一条通用 shell 就是一个通用写入通道，留着它，这道边界就是纸的。要什么材料 —— git diff、命令输出、文件清单 —— 找组长要，他给你。`
  }

  const argument = WRITE_PATH_ARGUMENT[name]
  if (argument === undefined) return undefined

  const target = args === null || typeof args !== 'object' ? undefined : args[argument]
  if (landsInOffice(target, agent)) return undefined

  void noteBoundary(`DENY  ${name}  role=${role}  target=${String(target)}`)
  return `你的角色（${role}）只能写项目里 .team/ 下的东西 —— 你这次要写的是「${String(target)}」，按落点算它在你的地盘外面。项目代码归实现和测试；你要改什么，写成意见交回组长。`
}

/** Per-source cache: last good text, the stamp it was read at. */
const cache = new Map()

/** Problems already logged, so a broken file does not spam every step. */
const loggedProblems = new Set()

/** Roles already reported as handled, so the notice is one line per role. */
const announcedRoles = new Set()

function logOnce(key, message) {
  if (loggedProblems.has(key)) return
  loggedProblems.add(key)
  console.error(`[${name}] ${message}`)
}

/** The cache entry for one context name, created on first use. */
function entryFor(contextName) {
  let entry = cache.get(contextName)
  if (entry === undefined) {
    entry = { text: null, stamp: null }
    cache.set(contextName, entry)
  }
  return entry
}

/**
 * Read one injected file, reusing its cached text while its stamp is unchanged.
 *
 * Worst case on a same-millisecond, same-length edit is that one assembly
 * serves the previous text; the change lands on the following one. Rewriting
 * cannot be missed indefinitely, which is what matters for live editing.
 *
 * @returns the file text, or undefined when it cannot be read.
 */
async function readSource(source) {
  const entry = entryFor(source.contextName)
  let info
  try {
    info = await stat(source.url)
  } catch (error) {
    logOnce(`stat:${source.name}`, `cannot stat ${source.url.pathname}: ${String(error && error.message)}`)
    return entry.text ?? undefined
  }

  const stamp = `${info.mtimeMs}:${info.size}`
  if (stamp === entry.stamp && entry.text !== null) return entry.text

  // Stamped before the read, not after: a file rewritten mid-read must not be
  // recorded as matching the text that landed, or an equal-length rewrite would
  // look like a cache hit and keep serving stale content.
  const beforeRead = stamp
  try {
    const text = await readFile(source.url, 'utf8')
    entry.text = text
    entry.stamp = beforeRead
    loggedProblems.delete(`read:${source.name}`)
    return text
  } catch (error) {
    logOnce(`read:${source.name}`, `cannot read ${source.url.pathname}: ${String(error && error.message)}`)
    return entry.text ?? undefined
  }
}

/** The source descriptor for one role's charter, e.g. `team/dev.md`. */
function charterOf(role) {
  return {
    name: `team/${role}.md`,
    url: new URL(`${role}.md`, TEAM_DIR),
    contextName: `agenia:charter:${role}`,
  }
}

/**
 * Which role this assembly belongs to, or undefined for the group leader.
 *
 * Scans both the incoming assembly and the settled one: the marker is a static
 * section, so it is in both, but reading the settled value too costs nothing
 * and survives a listener that rebuilds the section list.
 */
function roleOf(assembly) {
  const sections = Array.isArray(assembly === null || assembly === undefined ? undefined : assembly.sections)
    ? assembly.sections
    : []
  for (const section of sections) {
    if (typeof section?.text !== 'string') continue
    const found = ROLE_MARKER.exec(section.text)
    if (found !== null) return found[1]
  }
  return undefined
}

/**
 * The team roster, for the leader only: one line per charter, carrying that
 * charter's own first line — which is where every member's name lives. The
 * names are never copied anywhere else, so renaming somebody is a one-file edit
 * and this list follows on the next request.
 *
 * A member does not need this: its own charter is injected for it.
 */
async function rosterText() {
  let files
  try {
    files = (await readdir(TEAM_DIR)).filter((entry) => entry.endsWith('.md') && entry !== 'world.md').sort()
  } catch (error) {
    logOnce('roster', `cannot list ${fileURLToPath(TEAM_DIR)}: ${String(error && error.message)}`)
    return undefined
  }

  const lines = []
  for (const file of files) {
    const source = {
      name: `team/${file}`,
      url: new URL(file, TEAM_DIR),
      contextName: `agenia:head:${file}`,
    }
    const text = await readSource(source)
    const heading = (text ?? '').split('\n').find((line) => line.trim().length > 0) ?? ''
    lines.push(`- \`${file}\` —— ${heading.replace(/^#+\s*/, '').trim()}`)
  }
  if (lines.length === 0) return undefined

  // The absolute paths are the point of this block: the leader cannot read a
  // path out of a relative mention, and the preset directory is machine
  // specific. Without them she goes looking for her own team on disk — which
  // cost a whole verification run a dozen wasted tool calls.
  return [
    '**这支队伍的固定组员**（岗位说明书就在下面这两个目录里）：',
    '',
    `- 预设目录：\`${fileURLToPath(new URL('../', import.meta.url))}\``,
    `- 说明书目录：\`${fileURLToPath(TEAM_DIR)}\``,
    '',
    ...lines,
    '',
    '他们上岗时会**自动收到自己那一份**，你不用交代说明书的事 —— 你只需要派活，',
    '把任务、成功标准、和"去读项目自己的规则"说清楚。',
    '',
    '你自己要用的工序、守则、现成做法，也都在这个预设目录里，路径同样在那两个目录内。',
  ].join('\n')
}

/** Record one handled assembly when the self-check is on. */
async function noteSelfCheck(assembly, context) {
  if (!SELF_CHECK || selfCheckWrites >= 50) return
  const scope = context === null || context === undefined ? undefined : context.scope
  const line = `${JSON.stringify({
    hasScope: scope !== undefined,
    role: roleOf(assembly) ?? null,
    sections: Array.isArray(assembly.sections) ? assembly.sections.length : -1,
    contextNames: (Array.isArray(assembly.contexts) ? assembly.contexts : []).map((c) => String(c.name)),
  })}\n`
  try {
    await appendFile(join(tmpdir(), 'agenia-selfcheck.log'), line, 'utf8')
    // Counted only after a successful write, so a failing write cannot burn
    // the budget and silently stop the record.
    selfCheckWrites += 1
  } catch (error) {
    logOnce('selfcheck', `self-check write failed: ${String(error && error.message)}`)
  }
}

/**
 * Register the per-assembly contribution for whichever audience this assembly
 * belongs to.
 * @param ctx - the preset scope context this row is composed into.
 */
export async function apply(ctx) {
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt === undefined) {
    logOnce('service', 'systemPrompt is unavailable; nothing will be injected')
    return
  }

  // The write boundary. `tools.guard` takes a SYNCHRONOUS check, which is why
  // the role cannot be read here and has to arrive through `agentRoles`. A
  // missing `tools` service is not fatal — it only means the boundary is off,
  // which is the same state the guard is in when it cannot place an agent.
  const tools = ctx.get('tools')
  if (tools !== undefined && typeof tools.guard === 'function') {
    ctx.effect(
      () => tools.guard((exec) => boundaryReason(exec.name, exec.arguments, exec.agent)),
      'agenia: 写权限的角色边界',
    )
  } else {
    logOnce('guard', 'tools.guard is unavailable; the write boundary is NOT installed')
  }

  // The process ledger's two inputs: calls that actually settled, and the boss
  // starting a new task. Observe-only — neither can fail a call.
  ctx.on('tools/result', (exec) => {
    if (exec === null || exec === undefined) return
    noteSettledCall(exec.name, exec.agent)
  })
  ctx.on('session/event', (session, event) => {
    if (event === null || event === undefined || event.type !== 'user/message') return
    if (event.data?.source?.kind !== 'user') return
    const id = session === null || session === undefined ? undefined : session.id
    if (typeof id === 'string') ledgers.delete(id)
  })

  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()
    await noteSelfCheck(result, context)

    // Structural sanity check only: a scope-less assembly is a roster or global
    // read, never a session on this preset. Everything else that reaches this
    // listener already belongs to this preset.
    if (context === null || context === undefined || context.scope === undefined) return result

    const role = roleOf(assembly) ?? roleOf(result)
    if (role !== undefined) {
      // Join the two halves of the role fact: THIS assembly carries the marker,
      // and its scope is the agent that a tool guard will later see as the
      // caller. See `agentRoles`.
      const agentId = agentIdOf(context.scope)
      if (agentId !== undefined && agentRoles.get(agentId) !== role) {
        agentRoles.set(agentId, role)
        void noteBoundary(`MAP   ${agentId} -> ${role}  hasSession=${String(context.scope.session !== undefined)}`)
      }
      if (!announcedRoles.has(role)) {
        announcedRoles.add(role)
        console.error(`[${name}] 组员装配：${role}`)
      }
    }

    const sources = (role === undefined ? LEADER_SET : MEMBER_SET).map((key) => SOURCES[key])
    if (role !== undefined) sources.push(charterOf(role))

    const texts = []
    for (const source of sources) {
      const text = await readSource(source)
      if (text !== undefined && text.trim().length > 0) texts.push({ source, text })
    }

    // The roster is the leader's alone, and it is computed rather than authored:
    // the names live in the charters, so this is the one place they are read back.
    if (role === undefined) {
      const roster = await rosterText()
      if (roster !== undefined) texts.push({ source: { contextName: 'agenia:roster' }, text: roster })
      // The board rides with the roster: it is the leader's alone, and it is the
      // thing that makes a skipped gate visible instead of merely forbidden.
      const board = boardText(agentIdOf(context.scope))
      if (board !== undefined) texts.push({ source: { contextName: 'agenia:board' }, text: board })
    }

    if (texts.length === 0) return result

    // Drop every entry this plugin owns before appending, so a re-entrant or
    // transformed assembly cannot accumulate duplicates. Filtering by prefix
    // rather than by a fixed name list keeps dynamic charters covered.
    const kept = (Array.isArray(result.contexts) ? result.contexts : []).filter(
      (entry) => typeof entry?.name !== 'string' || !entry.name.startsWith('agenia:'),
    )
    return {
      ...result,
      contexts: [...kept, ...texts.map(({ source, text }) => ({ name: source.contextName, text }))],
    }
  })
}
