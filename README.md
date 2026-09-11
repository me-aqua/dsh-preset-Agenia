# dsh-preset-Agenia

A custom **agent preset** for the DeepSeek Harness (DSH) — the personality and capability
composition of an agent named **Agenia**.

## What this is

In DSH, every capability an agent has is a plugin row in a Cordis composition. An agent
preset is one such composition: a directory holding an `agent.cordis.yml` that decides which
tools, prompt sections, skills, and policies a single session gets.

This repository is the home of the `Agenia` preset. It starts from a copy of a shipped
preset and is edited row by row.

## Layout (planned)

```
agent.cordis.yml      # the composition: plugin rows that define Agenia
preset.yml            # display metadata: name + description shown in the preset picker
skills/               # optional: skills shipped with this preset
```

Locally, an authored preset lives one directory per preset under:

```
${DSH_HOME:-$HOME/.dsh}/.agent-presets/<preset-id>/
```

`agent.cordis.yml` is the file that actually mounts; `preset.yml` is what makes the preset
show a readable name instead of its bare directory name.

## Design notes

A few rules this preset respects, since they decide what can live here at all:

- **Plane.** The host composition owns the registries (tools, prompts, agents, sessions),
  anything crossing sessions, the sandbox and approval stack, and the model route. A preset
  owns only what one session contributes to those registries — its tools, its persona, its
  compaction policy. Session persistence must never move into a preset.
- **Service providers need a realm.** A row that publishes a service cannot sit loose in a
  preset, or the second session that mounts the preset collides with the first. A service
  the preset genuinely owns is wrapped together with every consumer of it in one group
  carrying an `isolate` realm.
- **Consumers stay loose.** A row that only consumes a host capability must stay outside any
  realm, or it cannot resolve the instance it needs.

## Status

Work in progress. The persona and row-by-row composition of Agenia are being developed
incrementally.

## License

MIT
