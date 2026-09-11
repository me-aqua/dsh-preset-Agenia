/**
 * Persona injector for the `agenia` agent preset.
 *
 * WHAT IT DOES
 * Reads `../persona.md` and contributes its text as a prompt CONTEXT section,
 * so the persona is re-read and re-injected on EVERY model step. Nothing is
 * cached across turns except the file text, which is revalidated by mtime+size
 * on each read. Editing `persona.md` therefore changes the next step of a
 * RUNNING session — no restart, no new session. `persona.md` is the whole
 * persona: every byte of it is the operator's to edit freely.
 *
 * WHY A CONTEXT AND NOT A SECTION
 * `systemPrompt.section()` also re-evaluates per assembly, but its `text` may
 * be a function only in the SYNCHRONOUS sense: `assemble()` calls it and
 * immediately stringifies the result, so a section cannot await a file read.
 * `system-prompt/assemble` is an ASYNC waterfall over the finished assembly,
 * which is what makes reading from disk on every step possible.
 *
 * A context section also renders at the END of the request — after the system
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
 * If a future DSH changes that dispatch rule, the failure mode is a persona
 * leaking into other presets — loud and obvious, not silent. `PERSONA_SELF_CHECK`
 * exists to re-measure the claim if it is ever doubted.
 *
 * FAILURE POLICY
 * Never throw into assembly: a bad persona file must not break the agent. A
 * missing or unreadable `persona.md` injects nothing and logs once per distinct
 * problem.
 *
 * EDITING THIS FILE REQUIRES A HARNESS RESTART
 * ES modules are cached by URL, and this one is imported by a file URL that
 * never changes, so a running harness keeps executing the instance it first
 * loaded. Remounting the preset does NOT re-import it. Worse, a module whose
 * import FAILED is cached as failed too: while this file was briefly
 * syntactically broken, the failure was recorded against that URL, and every
 * later remount silently reused the broken instance — `MOUNT OK`, the row
 * reported `fiber=2`, and the persona simply stopped being injected with no
 * error anywhere. `persona.md` is exempt (it is read from disk every turn), so
 * only changes to THIS file need the restart.
 */

import { appendFile, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'agenia-persona'

/** This row needs the prompt registry; without it there is nothing to inject into. */
export const inject = ['systemPrompt']

/** Section name that shows up in the runtime context snapshot. */
const CONTEXT_NAME = 'agenia:persona'

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

const PERSONA_URL = new URL('../persona.md', import.meta.url)

/** Last text read from disk, reused when a re-read fails. */
let cachedText = null
/**
 * `mtimeMs:size` of the file as it was BEFORE the last successful read.
 *
 * Stamping before the read rather than after is deliberate: if the file is
 * rewritten while the read is in flight, the stamp no longer describes the text
 * that landed in `cachedText`, so the next assembly re-reads instead of serving
 * content that was already stale. Stamping after would let an equal-sized
 * rewrite be mistaken for a cache hit.
 */
let cachedStamp = null
/** Problems already logged, so a broken file does not spam every step. */
const loggedProblems = new Set()

function logOnce(key, message) {
  if (loggedProblems.has(key)) return
  loggedProblems.add(key)
  console.error(`[${name}] ${message}`)
}

/**
 * Read `persona.md`, reusing the cached text while its stamp is unchanged.
 *
 * Worst case on a same-millisecond, same-length edit is that one assembly
 * serves the previous text; the change lands on the following one. Rewriting
 * cannot be missed indefinitely, which is what matters for live editing.
 *
 * @returns the persona text, or undefined when it cannot be read.
 */
async function readPersona() {
  let info
  try {
    info = await stat(PERSONA_URL)
  } catch (error) {
    logOnce('stat', `cannot stat ${PERSONA_URL.pathname}: ${String(error && error.message)}`)
    return cachedText ?? undefined
  }

  const stamp = `${info.mtimeMs}:${info.size}`
  if (stamp === cachedStamp && cachedText !== null) return cachedText

  const beforeRead = stamp
  try {
    const text = await readFile(PERSONA_URL, 'utf8')
    cachedText = text
    cachedStamp = beforeRead
    loggedProblems.delete('read')
    return text
  } catch (error) {
    logOnce('read', `cannot read ${PERSONA_URL.pathname}: ${String(error && error.message)}`)
    return cachedText ?? undefined
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
 * Register the per-assembly persona contribution.
 * @param ctx - the preset scope context this row is composed into.
 */
export async function apply(ctx) {
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt === undefined) {
    logOnce('service', 'systemPrompt is unavailable; persona will not be injected')
    return
  }

  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()
    await noteSelfCheck(result, context)

    // Structural sanity check only: a scope-less assembly is a roster or global
    // read, never a session on this preset. Everything else that reaches this
    // listener already belongs to this preset (see the header note).
    if (context === null || context === undefined || context.scope === undefined) return result

    const text = await readPersona()
    if (text === undefined || text.trim().length === 0) return result

    const contexts = Array.isArray(result.contexts) ? result.contexts : []
    // Drop any previous entry with this name so a re-entrant or transformed
    // assembly cannot accumulate duplicates.
    const kept = contexts.filter((entry) => entry.name !== CONTEXT_NAME)
    return {
      ...result,
      contexts: [...kept, { name: CONTEXT_NAME, text }],
    }
  })
}
