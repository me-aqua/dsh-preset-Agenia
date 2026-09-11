/**
 * Persona injector for the `agenia` agent preset.
 *
 * WHAT IT DOES
 * Reads `../persona.md` and contributes its text as a prompt CONTEXT section,
 * so the persona is re-read and re-injected on EVERY model step. Nothing is
 * cached across turns except the file text, which is revalidated by mtime+size
 * on each read. Editing `persona.md` therefore changes the next step of a
 * RUNNING session — no restart, no new session.
 *
 * WHY A CONTEXT AND NOT A SECTION
 * `systemPrompt.section()` also re-evaluates per assembly, but its `text` is
 * allowed to be a function only in the SYNCHRONOUS sense: `assemble()` calls
 * it and immediately stringifies the result, so a section cannot await a file
 * read. `system-prompt/assemble` is an ASYNC waterfall over the finished
 * assembly, which is what makes reading from disk on every step possible.
 *
 * A context section also lands at the END of the request — after the system
 * prompt and after the project's own `AGENTS.md` snapshot — which is the
 * position asked for: late in the prompt, where attention is strongest.
 *
 * WHY THE GUARD MATTERS (read before touching this file)
 * `system-prompt/assemble` is documented as scope-filtered, and it is — for
 * listeners registered inside a preset's own scope. This plugin IS composed in
 * the preset's scope, so in theory only agenia assemblies reach it. Do not
 * rely on that alone. It was measured that a listener can observe EVERY
 * preset's assembly, and an injector that fires for the wrong preset would
 * stamp Agenia's persona onto unrelated sessions. The guard below therefore
 * requires BOTH:
 *
 *   1. a real agent assembly (`context.scope` present — a global or roster
 *      assembly has none), and
 *   2. the marker string in the assembled sections, which exists only because
 *      this preset's `persona` row puts it there.
 *
 * FAILURE POLICY
 * Never throw into assembly: a bad persona file must not break the agent. A
 * missing or unreadable `persona.md` injects nothing and logs once per
 * distinct problem. If the marker check ever stops matching — someone edited
 * the persona row's text — the plugin logs a loud warning at load time rather
 * than silently doing nothing forever.
 */

import { readFile, stat } from 'node:fs/promises'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'agenia-persona'

/** This row needs the prompt registry; without it there is nothing to inject into. */
export const inject = ['systemPrompt']

/**
 * A string that exists in the assembled prompt ONLY when this preset's
 * `persona` row is present. Keep it in sync with `agent.cordis.yml`.
 */
const PRESET_MARKER = 'Agenia（阿格妮娅）'

/** Section name that shows up in the runtime context snapshot. */
const CONTEXT_NAME = 'agenia:persona'

const PERSONA_URL = new URL('../persona.md', import.meta.url)

/** Last text read from disk, reused when a re-read fails. */
let cachedText = null
/** `mtimeMs:size` of the cached text, so an unchanged file skips the read. */
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

  try {
    const text = await readFile(PERSONA_URL, 'utf8')
    cachedText = text
    cachedStamp = stamp
    loggedProblems.delete('read')
    return text
  } catch (error) {
    logOnce('read', `cannot read ${PERSONA_URL.pathname}: ${String(error && error.message)}`)
    return cachedText ?? undefined
  }
}

/** True when this assembly belongs to a session running this preset. */
function isThisPreset(assembly, context) {
  if (context === null || context === undefined || context.scope === undefined) return false
  const sections = Array.isArray(assembly.sections) ? assembly.sections : []
  return sections.some((section) => typeof section.text === 'string' && section.text.includes(PRESET_MARKER))
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

  // Load-time sanity check: the guard depends on the preset's persona row, so
  // say so loudly if this preset no longer carries the marker.
  try {
    const own = await readFile(new URL('../agent.cordis.yml', import.meta.url), 'utf8')
    if (!own.includes(PRESET_MARKER)) {
      console.error(
        `[${name}] WARNING: agent.cordis.yml no longer contains the marker "${PRESET_MARKER}". ` +
        'The persona row was probably reworded, so the guard in inject.js will never match and ' +
        'the persona will silently stop being injected. Update PRESET_MARKER in inject.js to match.',
      )
    }
  } catch (error) {
    logOnce('marker', `cannot read agent.cordis.yml to verify the marker: ${String(error && error.message)}`)
  }

  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()
    if (!isThisPreset(result, context)) return result

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
