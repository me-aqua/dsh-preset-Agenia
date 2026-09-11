# dsh-preset-Agenia

**Agenia** is a general-purpose engineering-assistant **agent preset** for the
DeepSeek Harness (DSH), plus the instructions that keep the preset installable.

In DSH, every capability an agent has is a plugin row in a Cordis composition.
An *agent preset* is one such composition: a directory holding an
`agent.cordis.yml` that decides which tools, prompt sections, skills and
policies a single session gets.

Agenia is a **portable work assistant**, not a project-specific agent. That
split is deliberate:

| | Who defines it | Where it lives | Effect |
|---|---|---|---|
| **Persona + project knowledge** | `AGENTS.md`, `AGENTS.local.md` | the project repo | loaded into the system prompt by `dsh-agent-instructions` |
| **Capability + tools** | `agent.cordis.yml` | this repo | decides what Agenia can *do* |

The preset therefore carries **no persona**. A global persona prefix would
compete with each project's own `AGENTS.local.md`, and two sources for one
persona drift apart. Who Agenia *is* travels with the project; what she can
*do* is installed once and shared.

## Layout

```
presets/
└── agenia/
    ├── agent.cordis.yml   # the composition: 12 rows, no service providers
    └── preset.yml         # display metadata for the preset picker
AGENTS.md                  # rules for agents that work inside this repo
README.md  LICENSE  .gitignore  .gitattributes
```

`presets/` is the directory DSH is pointed at, and each **subdirectory name is
the preset id**: `presets/agenia/` → id `agenia`. Ids must match
`[a-z0-9][a-z0-9-]*`.

`api.txt` lives beside these files but is **never committed** — it is ignored
by `.gitignore` and has never been pushed.

## What Agenia can do

Filesystem (read/write/edit, glob, grep) · shell (`pwsh` on Windows, `bash`
elsewhere) · background jobs · skills · web search and fetch ·
`ask_user_question` · todo list · `present` (publish a file as a deliverable).

## What is deliberately left out

Each is available by copying a row from a shipped preset. They are omitted so
Agenia starts as a focused assistant rather than a control panel:

- **delegation / fan-out** (`tool-subagent*`, `tool-workflow`, `tool-ralph`) —
  heavy; a short request can become dozens of child agents.
- **`tool-goal` + `command-goal`** — persisted autonomous continuation rounds.
- **plan mode** — useful for large refactors, noise for small edits.
- **context compaction** (`compaction-basic`, `command-compact`,
  `tool-result-pruner`) — long sessions would hit the model's context ceiling
  without it.
- **`tool-cordis`** — runtime self-inspection; that work belongs to the
  `cordis` preset.

## Installing it

DSH scans exactly three preset sources: the presets shipped inside
`dsh-agent-presets` (read-only), any `roots` a deployment configures, and
`~/.dsh/.agent-presets`. It never scans a working directory, so this repo has
to be announced once in the profile patch file:

`~/.dsh/profiles/web/cordis.patch.yml`

```yaml
- id: agent-presets
  config:
    default: standard          # REQUIRED — see the warning below
    roots:
      - path: E:/Harness/presets   # the directory that CONTAINS agenia/
        trust: user
```

Two things about that entry are not obvious:

- **`config:` replaces the row's whole config, it does not merge.** The
  `agent-presets` row is declared by `dsh-web-app` with `default: standard`,
  and `default` is a required field with no fallback. A patch that sets only
  `roots` therefore drops `default` and the harness will refuse to start.
  Always repeat every key the deployment's own row declared.
- **`roots` entries are directories that contain presets, not parents of
  such directories** — the path above holds `agenia/` itself.

> ### ⚠ Do not edit that patch file from inside a running session
>
> The web profile sets `patchReload: live`, so writing that file makes DSH
> re-apply the whole patch list immediately. The patch targets the
> `agent-presets` row, so that row is reconfigured and restarted — and every
> live session's preset layer (its tools **and** its prompt sections) hangs off
> that row and unwinds with it. A session that is mid-conversation loses its
> whole toolset on the spot and never gets it back.
>
> This has already happened twice in this repo's history. Edit that file with
> the harness **stopped**, or accept the loss.

### Uninstalling

Restore the patch file to the original single entry (or an empty list `[]`) and
delete this repository. Nothing else on `C:` is involved.

## A Windows trap worth recording

The obvious alternative — a directory junction at
`~/.dsh/.agent-presets/agenia` pointing at this repo — **does not work**, and
fails silently:

```
node: dirent.isDirectory=false, dirent.isSymbolicLink=true   # for a junction
```

Node reports a Windows **junction** as a symlink, not a directory, and the
roster's scanner skips non-directories (`if (!child.isDirectory()) continue`).
Explorer, PowerShell and `cmd` all resolve the junction happily, so it looks
installed while remaining invisible.

A true directory **symlink** (`mklink /D`) does report `isDirectory=true` and
would work — but it requires Administrator or Developer Mode, which makes it
fragile to recreate. The configured `roots` entry above avoids the problem
entirely.

## License

MIT
