/**
 * Persona + team injector for the `agenia` agent preset.
 *
 * WHAT IT DOES
 * Reads markdown from a CONTENT ROOT on every model step and contributes each
 * file as a prompt CONTEXT section, so edits take effect on the NEXT STEP of a
 * running session — no restart, no new session. Text is revalidated per file by
 * mtime+size, so a rewrite is picked up on the following assembly at the latest.
 *
 * WHERE THE CONTENT LIVES — three levels, first hit wins
 *   1. the row's `config.contentDir`  — the preset writes `.`, its own directory
 *   2. `AGENIA_CONTENT_DIR`           — swap roots without editing a config
 *   3. this package's own `content/`  — the default when nobody names a root
 * An empty string counts as UNSET and falls through to the next level; it never
 * means "the current directory". `resolveContentDir` hands the configured value
 * back VERBATIM, and the reader resolves a relative one against the row's own
 * base (`ctx.baseUrl` — the directory of the composition that declared the row),
 * never against `process.cwd()`: the preset author means the preset's directory,
 * and a guess in the wrong base is a silent loss of every file under it.
 * A named root is the ONLY source for its files: one that is missing contributes
 * nothing rather than falling back to the packaged copy, because a silent
 * fallback is exactly how an edit to `persona.md` stops being the text the model
 * reads.
 *
 * TWO AUDIENCES, ONE PLUGIN
 * One preset mount serves the group leader (the session) and every child she
 * delegates to. They must NOT receive the same text: a member handed the
 * leader's persona would believe it is the leader. So the files are split into
 * three sets:
 *
 *   leader  persona · leader · process · world · work · practices · roster
 *   member  world · process · work · practices · (its own charter)
 *   hire    world · process · work · practices · (its own charter team/hire.md)
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
 * FAILURE POLICY
 * Never throw into assembly: a bad or missing markdown file must not break the
 * agent. A source that cannot be read injects nothing and logs once per
 * distinct problem; every other source is unaffected.
 *
 * EDITING THIS FILE REQUIRES A HARNESS RESTART
 * ES modules are cached by URL, and a FAILED import is cached as failed against
 * that URL too, so a module imported while this file was broken keeps failing
 * after the file is fixed, and the persona stops being injected while `MOUNT OK`
 * and `fiber=2` both still look fine.
 *
 * A VERSION BUMP DOES NOT CLEAR THAT CACHE. Measured 2026-09-20 with the package
 * installed, the row's bare name resolving from the profile directory:
 *
 *   resolved = file:///C:/Users/DAVID/.dsh/profiles/web/node_modules/@agenia/persona-plugin/inject.js
 *   has query/version = false
 *
 * No version, no query string — so reinstalling a new `version` produces the
 * SAME URL and the loader hands back the module instance it already has. A
 * harness restart is the only thing that reloads this file.
 *
 * The content root is unaffected: the markdown under it is read from disk on
 * every step, so editing a `.md` still takes effect on the next step.
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
 * The package's own copy of the twelve files — the root used when neither the
 * row's config nor the environment names one. Resolved from this module's own
 * URL, so it keeps pointing inside the package wherever the package is installed.
 */
const DEFAULT_CONTENT_DIR = fileURLToPath(new URL('./content/', import.meta.url))

/** Environment override, second in precedence: an operator's root without a config edit. */
const CONTENT_DIR_ENV = 'AGENIA_CONTENT_DIR'

/**
 * Self-check switch. When `PERSONA_SELF_CHECK` is set in the environment, the
 * plugin records what it was handed, so the scope-filtering claim can be
 * re-measured instead of believed. Bounded, append-only, and off by default.
 */
const SELF_CHECK = typeof process !== 'undefined' && Boolean(process.env && process.env.PERSONA_SELF_CHECK)

/**
 * Every injectable file, keyed by the role it plays.
 *
 * `name` is relative to a CONTENT ROOT — the package's own `content/` when
 * nobody names a directory, otherwise the directory that was named — so the
 * same table describes every root.
 */
export const SOURCES = {
  persona: { key: 'persona', name: 'persona.md', contextName: 'agenia:persona' },
  leader: { key: 'leader', name: 'leader.md', contextName: 'agenia:leader' },
  process: { key: 'process', name: 'process.md', contextName: 'agenia:process' },
  world: { key: 'world', name: 'team/world.md', contextName: 'agenia:world' },
  work: { key: 'work', name: 'work-guidelines.md', contextName: 'agenia:work' },
  practices: { key: 'practices', name: 'codebase-practices.md', contextName: 'agenia:practices' },
}

/** The three audiences, stated once so a set cannot drift from its reader. */
export const SETS = {
  /** The group leader: who she is, how she leads, the process, the team, the rules. */
  LEADER: ['persona', 'leader', 'process', 'world', 'work', 'practices'],
  /**
   * A team member: the shared frame and the shared rules only.
   *
   * The engineering guidelines and the practice library are deliberately here —
   * they are the whole reason a member can be handed a job and behave like
   * somebody who works in this codebase. The leader's identity and manual are
   * deliberately NOT. A temp hire is not a special case: it takes this frame
   * plus its own charter, like every other role.
   */
  MEMBER: ['world', 'process', 'work', 'practices'],
}

/**
 * The role marker a team tool row puts at the front of its child's persona.
 * Restricted to the same charset a preset id uses, so the captured role can
 * only ever name a sibling file inside `team/`.
 */
export const ROLE_MARKER = /【组员:([a-z0-9][a-z0-9-]*)】/

/** The roles whose pen is confined to the team office. */
const OFFICE_BOUND_ROLES = new Set(['product', 'review', 'retro'])

/** Tool name → the argument that names the path it writes. */
const WRITE_PATH_ARGUMENT = { write: 'file_path', edit: 'file_path' }

/**
 * A `.team/` path segment — the team office, and deliberately NOT the preset's
 * own `team/` charter directory (no leading dot), which only the leader may
 * touch, and only with the boss's approval.
 */
export const OFFICE_SEGMENT = /(^|[\\/])\.team([\\/]|$)/

/**
 * Shell tools. A general shell IS a general write channel, so an office-bound
 * role cannot keep one — otherwise the boundary is decoration. Denied by NAME
 * rather than through a row's `toolFilter` on purpose: the row would have to
 * name whichever of `pwsh`/`bash` this platform registers, and naming the other
 * one fails the child start as an unknown tool.
 */
const SHELL_TOOLS = new Set(['pwsh', 'bash'])

/**
 * Which content root applies, in precedence order.
 *
 * A relative value is returned EXACTLY as configured — resolving it here would
 * bind it to whatever directory this module happens to run from. See
 * `createInjector` for where it is resolved, and against what.
 *
 * @returns the configured root: absolute in the normal case, otherwise verbatim.
 */
export function resolveContentDir({ config, env, defaultContentDir } = {}) {
  const configured = config === null || config === undefined ? undefined : config.contentDir
  if (typeof configured === 'string' && configured.length > 0) return configured
  const fromEnv = env === null || env === undefined ? undefined : env[CONTENT_DIR_ENV]
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return defaultContentDir ?? DEFAULT_CONTENT_DIR
}

/** The source template for one role's charter, e.g. `team/dev.md`. */
export function charterSourceFor(role) {
  return { key: `team/${role}.md`, name: `team/${role}.md`, contextName: `agenia:charter:${role}` }
}

/** The sources one audience receives, in injection order. */
export function sourcesFor(role) {
  if (role === undefined) return SETS.LEADER.map((key) => SOURCES[key])
  return [...SETS.MEMBER.map((key) => SOURCES[key]), charterSourceFor(role)]
}

/**
 * Which role this assembly belongs to, or undefined for the group leader.
 *
 * Scans both the incoming assembly and the settled one: the marker is a static
 * section, so it is in both, but reading the settled value too costs nothing
 * and survives a listener that rebuilds the section list.
 */
export function roleOf(assembly) {
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

/** The live agent id behind an assembly scope, when it exposes one. */
function agentIdOf(scope) {
  if (scope === null || typeof scope !== 'object') return undefined
  const id = scope.id
  return typeof id === 'string' ? id : undefined
}

/**
 * Per-injector state: the source cache, the problems already reported, and the
 * write budgets of the two diagnostic logs. One bag per injector, so two
 * instances pointed at two roots cannot serve each other's text.
 */
export function createState() {
  return {
    cache: new Map(),
    loggedProblems: new Set(),
    announcedRoles: new Set(),
    boundaryWrites: 0,
    selfCheckWrites: 0,
  }
}

/** Log one distinct problem once, then stay quiet. */
function logOnce(state, log, key, message) {
  if (state.loggedProblems.has(key)) return
  state.loggedProblems.add(key)
  log(`[${name}] ${message}`)
}

/** The cache entry for one source in one root, created on first use. */
function entryFor(state, cacheKey) {
  let entry = state.cache.get(cacheKey)
  if (entry === undefined) {
    entry = { text: null, stamp: null }
    state.cache.set(cacheKey, entry)
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
 * The cache key carries the content root: the root is configurable now, so a
 * key of context name alone would serve the previous directory's text after a
 * root change — and it would do it silently, because the stamp still matches.
 *
 * @returns the file text, or undefined when it cannot be read.
 */
export async function readSource(source, contentDir, state, log) {
  const cacheKey = `${contentDir}\u0000${source.contextName}`
  const entry = entryFor(state, cacheKey)
  const file = isAbsolute(source.name) ? source.name : join(contentDir, source.name)

  let info
  try {
    info = await stat(file)
  } catch (error) {
    logOnce(state, log, `stat:${cacheKey}`, `cannot stat ${file}: ${String(error && error.message)}`)
    return entry.text ?? undefined
  }

  const stamp = `${info.mtimeMs}:${info.size}`
  if (stamp === entry.stamp && entry.text !== null) return entry.text

  // Stamped before the read, not after: a file rewritten mid-read must not be
  // recorded as matching the text that landed, or an equal-length rewrite would
  // look like a cache hit and keep serving stale content.
  const beforeRead = stamp
  try {
    const text = await readFile(file, 'utf8')
    entry.text = text
    entry.stamp = beforeRead
    state.loggedProblems.delete(`read:${cacheKey}`)
    return text
  } catch (error) {
    logOnce(state, log, `read:${cacheKey}`, `cannot read ${file}: ${String(error && error.message)}`)
    return entry.text ?? undefined
  }
}

/**
 * Read a whole audience's sources, in order.
 *
 * A source that is missing or empty is SKIPPED, not replaced: the named root is
 * the only source for its files.
 */
export async function readSources(sources, { contentDir, state, log }) {
  const texts = []
  for (const source of sources) {
    const text = await readSource(source, contentDir, state, log)
    if (text === undefined || text.trim().length === 0) continue
    texts.push({ name: source.contextName, text })
  }
  return texts
}

/**
 * The team roster, for the leader only: one line per charter, carrying that
 * charter's own first line — which is where every member's name lives. The
 * names are never copied anywhere else, so renaming somebody is a one-file edit
 * and this list follows on the next request.
 *
 * A member does not need this: its own charter is injected for it.
 */
export async function rosterText({ contentDir, state, log }) {
  const dir = join(contentDir, 'team')
  let files
  try {
    files = (await readdir(dir)).filter((entry) => entry.endsWith('.md') && entry !== 'world.md').sort()
  } catch (error) {
    logOnce(state, log, `roster:${dir}`, `cannot list ${dir}: ${String(error && error.message)}`)
    return undefined
  }

  const lines = []
  for (const file of files) {
    const text = await readSource(
      { key: `team/${file}`, name: `team/${file}`, contextName: `agenia:head:${file}` },
      contentDir,
      state,
      log,
    )
    const heading = (text ?? '').split('\n').find((line) => line.trim().length > 0) ?? ''
    lines.push(`- \`${file}\` —— ${heading.replace(/^#+\s*/, '').trim()}`)
  }
  if (lines.length === 0) return undefined

  // The absolute paths are the point of this block: the leader cannot read a
  // path out of a relative mention, and the root is machine specific. Without
  // them she goes looking for her own team on disk — which cost a whole
  // verification run a dozen wasted tool calls.
  return [
    '**这支队伍的固定组员**（岗位说明书就在下面这两个目录里）：',
    '',
    `- 内容目录：\`${contentDir}\``,
    `- 说明书目录：\`${dir}\``,
    '',
    ...lines,
    '',
    '他们上岗时会**自动收到自己那一份**，你不用交代说明书的事 —— 你只需要派活，',
    '把任务、成功标准、和"去读项目自己的规则"说清楚。',
    '',
    '你自己要用的工序、守则、现成做法，也都在这个内容目录里，路径同样在那两个目录内。',
  ].join('\n')
}

/**
 * Whether a path argument lands inside the team office.
 *
 * Resolved, never matched as text. `.team/product/../../x.txt` CONTAINS a
 * `.team/` segment and still lands in the project root — a verification run
 * found exactly that bypass, which is why this normalises against the agent's
 * own working directory before testing the segment.
 */
export function landsInOffice(target, agent) {
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
 *
 * `note` is the boundary log's writer. It is optional so the decision can be
 * called on its own; the guard passes one.
 */
export function boundaryReason(toolName, args, agent, agentRoles, note) {
  const id = agent === null || agent === undefined ? undefined : agent.id
  const role = typeof id === 'string' && agentRoles !== undefined ? agentRoles.get(id) : undefined
  if (role === undefined || !OFFICE_BOUND_ROLES.has(role)) return undefined

  if (SHELL_TOOLS.has(toolName)) {
    if (note !== undefined) note(`DENY  ${toolName}  role=${role}  (shell)`)
    return `你的角色（${role}）没有 shell。一条通用 shell 就是一个通用写入通道，留着它，这道边界就是纸的。要什么材料 —— git diff、命令输出、文件清单 —— 找组长要，他给你。`
  }

  const argument = WRITE_PATH_ARGUMENT[toolName]
  if (argument === undefined) return undefined

  const target = args === null || typeof args !== 'object' ? undefined : args[argument]
  if (landsInOffice(target, agent)) return undefined

  if (note !== undefined) note(`DENY  ${toolName}  role=${role}  target=${String(target)}`)
  return `你的角色（${role}）只能写项目里 .team/ 下的东西 —— 你这次要写的是「${String(target)}」，按落点算它在你的地盘外面。项目代码归实现和测试；你要改什么，写成意见交回组长。`
}

/** Append one boundary decision to a bounded log, for verification runs. */
async function noteBoundary(state, log, line) {
  if (state.boundaryWrites >= 60) return
  try {
    await appendFile(join(tmpdir(), 'agenia-boundary.log'), `${line}\n`, 'utf8')
    // Counted only after a successful write, so a failing write cannot burn the
    // budget and silently stop the record.
    state.boundaryWrites += 1
  } catch (error) {
    logOnce(state, log, 'boundary', `boundary log write failed: ${String(error && error.message)}`)
  }
}

/** Record one handled assembly when the self-check is on. */
async function noteSelfCheck(state, log, assembly, context) {
  if (!SELF_CHECK || state.selfCheckWrites >= 50) return
  const scope = context === null || context === undefined ? undefined : context.scope
  const line = `${JSON.stringify({
    hasScope: scope !== undefined,
    role: roleOf(assembly) ?? null,
    sections: Array.isArray(assembly.sections) ? assembly.sections.length : -1,
    contextNames: (Array.isArray(assembly.contexts) ? assembly.contexts : []).map((c) => String(c.name)),
  })}\n`
  try {
    await appendFile(join(tmpdir(), 'agenia-selfcheck.log'), line, 'utf8')
    // Counted only after a successful write, so a failing write cannot burn the
    // budget and silently stop the record.
    state.selfCheckWrites += 1
  } catch (error) {
    logOnce(state, log, 'selfcheck', `self-check write failed: ${String(error && error.message)}`)
  }
}

/**
 * The directory of the composition that declared this row, when it is a file URL.
 *
 * `ctx.baseUrl` is the base the framework hands a row for its own relative
 * specifiers, and for a row inside a preset composition that base is the preset
 * directory. Outside a loader — a bare module import, a test harness — there is
 * no such base, and a relative content root keeps its literal meaning.
 */
function baseDirOf(ctx) {
  const base = ctx === null || ctx === undefined ? undefined : ctx.baseUrl
  if (typeof base !== 'string' || !base.startsWith('file:')) return undefined
  return fileURLToPath(base)
}

/** The id of the task this agent's call belongs to. */
function taskKeyOf(agent) {
  const header = agent === null || agent === undefined ? undefined : agent.session?.header
  const parent = header === undefined ? undefined : header.parentSession
  return typeof parent === 'string' ? parent : agent?.id
}

/**
 * Bind one injector to a content root, a state bag and a role table.
 *
 * The root is read once per assembly from `config`/`env`, so an operator can
 * point the plugin at another directory without a restart, and the per-root
 * cache key keeps that switch from serving stale text.
 */
export function createInjector({ config, env, defaultContentDir, baseDir, log, state, agentRoles } = {}) {
  const boundState = state ?? createState()
  const boundLog = log ?? ((message) => { console.error(message) })
  const roles = agentRoles ?? new Map()

  /**
   * The process ledger, one per TASK, keyed by the leading agent's id.
   *
   * A member's calls belong to the leader's task, so the key is the child's
   * `parentSession` and the leader's own id otherwise. Writes are counted as
   * they happen — a member writing five files is five writes — so `team_dev`
   * itself is deliberately NOT counted as a change; the dev's own tool results
   * are.
   *
   * Cleared when the boss speaks (`session/event`, `user/message`, source
   * `user`), because a ledger that never resets stops meaning anything after
   * one task. If that event never arrives the counts simply accumulate, which
   * is degraded but not wrong.
   */
  const ledgers = new Map()

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
   * The content root in effect: the configured value, made absolute when it is
   * relative. `resolveContentDir` keeps the configured value untouched, so the
   * relative case is decided here, against the base of the composition that
   * declared this row — the preset directory, never `process.cwd()`.
   */
  function contentRoot() {
    const value = resolveContentDir({ config, env, defaultContentDir })
    if (isAbsolute(value)) return value
    if (typeof baseDir !== 'string' || baseDir.length === 0) return value
    return resolve(baseDir, value)
  }

  /**
   * Fold one settled tool call into its task's ledger.
   *
   * Called from a `tools/result` observer, so only calls that actually ran are
   * counted — a refused call leaves no trace here, which is what a process
   * ledger should mean.
   */
  function noteSettledCall(toolName, agent) {
    if (agent === null || agent === undefined) return
    const key = taskKeyOf(agent)
    if (typeof key !== 'string') return
    const ledger = ledgerFor(key)
    if (toolName === 'team_product') ledger.product += 1
    else if (toolName === 'team_dev') ledger.dev += 1
    else if (toolName === 'team_retro') ledger.retro += 1
    else if (toolName === 'team_test') {
      ledger.test += 1
      ledger.sinceTest = 0
    } else if (toolName === 'team_review') {
      ledger.review += 1
      ledger.sinceReview = 0
    } else if (toolName === 'write' || toolName === 'edit') {
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

  /** Clear one task's ledger — the boss speaking starts a new task. */
  function clearLedger(key) {
    if (typeof key === 'string') ledgers.delete(key)
  }

  /**
   * Read one audience's contributions and report the names to append.
   *
   * `settled` is the assembly the listener's `next()` returned: the marker is a
   * static section and sits in both, but reading the settled value too costs
   * nothing and survives a listener that rebuilds the section list.
   */
  async function assemble(assembly, scope, settled) {
    const role = roleOf(assembly) ?? roleOf(settled)
    const contentDir = contentRoot()
    const contexts = await readSources(sourcesFor(role), { contentDir, state: boundState, log: boundLog })

    if (role === undefined) {
      // The roster is the leader's alone, and it is computed rather than
      // authored: the names live in the charters, so this is the one place they
      // are read back. The board rides with it: also the leader's alone, and the
      // thing that makes a skipped gate visible instead of merely forbidden.
      const roster = await rosterText({ contentDir, state: boundState, log: boundLog })
      if (roster !== undefined) contexts.push({ name: 'agenia:roster', text: roster })
      const board = boardText(agentIdOf(scope))
      if (board !== undefined) contexts.push({ name: 'agenia:board', text: board })
    }

    return { role, contentDir, contexts }
  }

  return {
    assemble,
    /** The same decision as `boundaryReason`, with this injector's roles and log. */
    boundaryReason: (toolName, args, agent) =>
      boundaryReason(toolName, args, agent, roles, (line) => { void noteBoundary(boundState, boundLog, line) }),
    noteSettledCall,
    clearLedger,
    boardText,
    roles,
    state: boundState,
  }
}

/**
 * Register the per-assembly contribution for whichever audience this assembly
 * belongs to, plus the write boundary and the process ledger.
 * @param ctx - the preset scope context this row is composed into.
 * @param config - the row's config; `contentDir` is the only key it reads.
 */
export async function apply(ctx, config = {}) {
  const state = createState()
  const log = (message) => { console.error(message) }

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt === undefined) {
    logOnce(state, log, 'service', 'systemPrompt is unavailable; nothing will be injected')
    return
  }

  const injector = createInjector({ config, env: process.env, baseDir: baseDirOf(ctx), log, state })
  const agentRoles = injector.roles

  // The write boundary. `tools.guard` takes a SYNCHRONOUS check, which is why
  // the role cannot be read here and has to arrive through `agentRoles`. A
  // missing `tools` service is not fatal — it only means the boundary is off,
  // which is the same state the guard is in when it cannot place an agent.
  const tools = ctx.get('tools')
  if (tools !== undefined && typeof tools.guard === 'function') {
    ctx.effect(
      () => tools.guard((exec) => injector.boundaryReason(exec.name, exec.arguments, exec.agent)),
      'agenia: 写权限的角色边界',
    )
  } else {
    logOnce(state, log, 'guard', 'tools.guard is unavailable; the write boundary is NOT installed')
  }

  // The process ledger's two inputs: calls that actually settled, and the boss
  // starting a new task. Observe-only — neither can fail a call.
  ctx.on('tools/result', (exec) => {
    if (exec === null || exec === undefined) return
    injector.noteSettledCall(exec.name, exec.agent)
  })
  ctx.on('session/event', (session, event) => {
    if (event === null || event === undefined || event.type !== 'user/message') return
    if (event.data?.source?.kind !== 'user') return
    const id = session === null || session === undefined ? undefined : session.id
    if (typeof id === 'string') injector.clearLedger(id)
  })

  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()
    await noteSelfCheck(state, log, result, context)

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
        void noteBoundary(
          state,
          log,
          `MAP   ${agentId} -> ${role}  hasSession=${String(context.scope.session !== undefined)}`,
        )
      }
      if (!state.announcedRoles.has(role)) {
        state.announcedRoles.add(role)
        console.error(`[${name}] 组员装配：${role}`)
      }
    }

    const { contexts } = await injector.assemble(assembly, context.scope, result)
    if (contexts.length === 0) return result

    // Drop every entry this plugin owns before appending, so a re-entrant or
    // transformed assembly cannot accumulate duplicates. Filtering by prefix
    // rather than by a fixed name list keeps dynamic charters covered.
    const kept = (Array.isArray(result.contexts) ? result.contexts : []).filter(
      (entry) => typeof entry?.name !== 'string' || !entry.name.startsWith('agenia:'),
    )
    return { ...result, contexts: [...kept, ...contexts] }
  })
}
