/**
 * Persona injector for the `agenia` agent preset.
 *
 * WHAT IT DOES
 * Reads every file in {@link SOURCES} — currently `../persona.md` (who the
 * agent is) and `../work-guidelines.md` (how it works) — and contributes each
 * as a prompt CONTEXT section, so both are re-read and re-injected on EVERY
 * model step. Nothing is cached across turns except the file text, which is
 * revalidated per file by mtime+size on each read. Editing either markdown
 * therefore changes the next step of a RUNNING session — no restart, no new
 * session. Those files are wholly the operator's to edit freely.
 *
 * WHY A CONTEXT AND NOT A SECTION
 * `systemPrompt.section()` also re-evaluates per assembly, but its `text` may
 * be a function only in the SYNCHRONOUS sense: `assemble()` calls it and
 * immediately stringifies the result, so a section cannot await a file read.
 * `system-prompt/assemble` is an ASYNC waterfall over the finished assembly,
 * which is what makes reading from disk on every step possible.
 *
 * Context sections also render at the END of the request — after the system
 * prompt and after the project's own `AGENTS.md` snapshot — which is the
 * position asked for: late in the prompt, where attention is strongest.
 *
 * WHY NO CONTENT MARKER
 * An earlier version of this file decided whether an assembly belonged to this
 * preset by looking for a marker STRING contributed by the `persona` row. That
 * made the row's text load-bearing and put a hidden constraint on the operator's
 * own files, which is the wrong trade. The scope does the job instead.
 *
 * `system-prompt/assemble` dispatch is scope-filtered: a listener receives only
 * assemblies whose scope chain contains the scope it registered in. This plugin
 * is composed inside this preset's standing scope, and every session on this
 * preset parents its scope to that mount, so the assemblies that arrive here are
 * this preset's by construction.
 *
 * That is documented behaviour, and it was measured rather than assumed. A probe
 * preset registering the same listener logged 2 entries for 12 cross-preset
 * assemblies it triggered (agenia, standard, cordis, ptc, minimal, and a global
 * scope-less assembly): it saw only its own. The guard below is therefore a
 * cheap structural sanity check, not a content match.
 *
 * If a future DSH changes that dispatch rule, the failure mode is content
 * leaking into other presets — loud and obvious, not silent. `PERSONA_SELF_CHECK`
 * exists to re-measure the claim if it is ever doubted.
 *
 * FAILURE POLICY
 * Never throw into assembly: a bad or missing markdown file must not break the
 * agent. A source that cannot be read injects nothing and logs once per distinct
 * problem; the other sources are unaffected.
 *
 * EDITING THIS FILE REQUIRES A HARNESS RESTART
 * ES modules are cached by URL, and this one is imported by a file URL that
 * never changes, so a running harness keeps executing the instance it first
 * loaded. Remounting the preset does NOT re-import it. Worse, a module whose
 * import FAILED is cached as failed too: while this file was briefly
 * syntactically broken, the failure was recorded against that URL, and every
 * later remount silently reused the broken instance — `MOUNT OK`, the row
 * reported `fiber=2`, and the persona simply stopped being injected with no
 * error anywhere. The markdown files are exempt (they are read from disk every
 * turn), so only changes to THIS file need the restart — or a bump of the `?v=`
 * query on this row, which is the cheaper of the two. See AGENTS.md section 3e.
 */

import { appendFile, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'agenia-persona'

/** This row needs the prompt registry; without it there is nothing to inject into. */
export const inject = ['systemPrompt']

/**
 * Self-check switch. When `PERSONA_SELF_CHECK` is set in the environment, the
 * plugin records what it was handed, so the scope-filtering claim below can be
 * re-measured instead of believed. Bounded, append-only, and off by default.
 *
 * Setting this needs a process restart to take effect: ES modules are cached by
 * URL, so editing this file does NOT change the code a running harness uses.
 * See AGENTS.md section 3e.
 */
const SELF_CHECK = typeof process !== 'undefined' && Boolean(process.env && process.env.PERSONA_SELF_CHECK)
/** Entries written while {@link SELF_CHECK} is on, capped so it cannot grow. */
let selfCheckWrites = 0

/**
 * Every file this plugin injects, in the order they appear in the prompt.
 *
 * A list rather than hardcoded paths, because the preset separates WHO the agent
 * is (`persona.md`), HOW it works (`work-guidelines.md`), and the CONCRETE
 * practices it should copy (`codebase-practices.md`). Those files stay
 * independently editable, and adding another source is a one-line change here.
 */
const SOURCES = [
  {
    name: 'persona.md',
    url: new URL('../persona.md', import.meta.url),
    contextName: 'agenia:persona',
  },
  {
    name: 'work-guidelines.md',
    url: new URL('../work-guidelines.md', import.meta.url),
    contextName: 'agenia:work',
  },
  {
    name: 'codebase-practices.md',
    url: new URL('../codebase-practices.md', import.meta.url),
    contextName: 'agenia:practices',
  },
]

/** Per-source cache: last good text, the stamp it was read at, and a log key. */
const cache = new Map()
for (const source of SOURCES) {
  cache.set(source.contextName, { text: null, stamp: null })
}

/** Problems already logged, so a broken file does not spam every step. */
const loggedProblems = new Set()

function logOnce(key, message) {
  if (loggedProblems.has(key)) return
  loggedProblems.add(key)
  console.error(`[${name}] ${message}`)
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
  const entry = cache.get(source.contextName)
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

/** Record one handled assembly when the self-check is on. */
async function noteSelfCheck(assembly, context) {
  if (!SELF_CHECK || selfCheckWrites >= 50) return
  const scope = context === null || context === undefined ? undefined : context.scope
  const line = `${JSON.stringify({
    hasScope: scope !== undefined,
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
 * Register the per-assembly contribution from every configured source.
 * @param ctx - the preset scope context this row is composed into.
 */
export async function apply(ctx) {
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt === undefined) {
    logOnce('service', 'systemPrompt is unavailable; nothing will be injected')
    return
  }

  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()
    await noteSelfCheck(result, context)

    // Structural sanity check only: a scope-less assembly is a roster or global
    // read, never a session on this preset. Everything else that reaches this
    // listener already belongs to this preset (see the header note).
    if (context === null || context === undefined || context.scope === undefined) return result

    const texts = []
    for (const source of SOURCES) {
      const text = await readSource(source)
      if (text !== undefined && text.trim().length > 0) texts.push({ source, text })
    }
    if (texts.length === 0) return result

    // Drop any previous entries with these names so a re-entrant or transformed
    // assembly cannot accumulate duplicates, then append in SOURCES order.
    const names = new Set(SOURCES.map((s) => s.contextName))
    const kept = (Array.isArray(result.contexts) ? result.contexts : []).filter((entry) => !names.has(entry.name))
    return {
      ...result,
      contexts: [...kept, ...texts.map(({ source, text }) => ({ name: source.contextName, text }))],
    }
  })
}
