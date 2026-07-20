# Pipeline identity, versioning & data files — design

**Date:** 2026-07-20 · **Status:** approved (design), pending plan

## What the fleet actually looks like

Measured across the live `clients_work` dex, not assumed:

| Finding | Number |
|---|---|
| Clients | 65 |
| Clients whose pipeline is named `main` | **65** |
| Clients whose agent is named `assistant` | **65** |
| Snapshots ever taken (`_versions/`) | **0** |

Every client carries the scaffold defaults, unrenamed. Meanwhile al-hazem-tech's
*actual* pipeline on the platform is **"Hazem tech" (id 111)** with agent **خالد**.
So the folder name is not merely uninformative — it is the *same* uninformative
name 65 times, and it does not match the thing it mirrors.

And the snapshot feature shipped in WP-C has been used **zero times**. That is not
a discoverability bug to paper over with a bigger button; a feature nobody reaches
for is the wrong shape. This design replaces it rather than decorating it.

## Problems, in the order they cost the user

1. **Folder identity is meaningless.** `pipelines/main` tells you nothing, and
   nothing records that this is platform pipeline 111.
2. **No usable version history.** A version today is a timestamped copy in a
   sibling `_versions/` folder, with no record of *why* and no platform state.
3. **Knowledge tables are unreadable.** `.xlsx` is binary: the reader punts to the
   OS, so the most valuable client data cannot be seen in the app.

## Structure

```
projects/al-hazem-tech/
  pipelines/
    hazem-tech/                      ← was `main`; matches the platform
      _meta.yaml                     ← platform_id: 111, platform_name, last_synced
      _persona.md
      _general_instructions.md
      _actions.curls.yaml
      _settings.export.yaml
      stages/01_intake/…             ← the LIVE working copy
      _v/                            ← versions live WITH the unit
        v01/
          _persona.md … stages/…     ← full copy of the unit at that moment
          CHANGES/
            platform.export.json     ← what was LIVE on the platform
            SUMMARY.md               ← why this version was cut
        v02/…
  agents/
    khaled/                          ← was `assistant`
      … same shape, its own _v/
```

**Why `_v/` and not `v01/` directly inside the unit.** The unit folder is the live
working copy, walked by the fleet scan, the agent-ops lint, the reader tree and
MCP search. A bare `v01/` would make every one of them count
`v01/stages/01_intake` as a real stage, and "what is live?" would stop being
answerable. Underscore-prefixed folders are already skipped by these walkers
(`_inbox`, `_randoms`, `_index`) — `_v/` inherits that rule for free.

**Why `vNN` and not timestamps.** `v03` carries meaning; `2026-07-20_143022` does
not. No counter state is needed: `max(existing) + 1`, zero-padded to two digits.

## Identity: `_meta.yaml`

```yaml
platform_id: 111
platform_name: Hazem tech
kind: pipeline
last_synced: 2026-07-20T14:30:22Z
```

The folder is named for the platform pipeline **and** the id is recorded. Either
side can be renamed later and still be reconciled — a rename on the platform
changes `platform_name`, never the id, so the link survives.

## Versioning: manual, but prompted

Snapshots were manual-only and were never taken. They stay deliberate — an
automatic version on every platform push would bury the meaningful ones in noise
— but the app now **notices** instead of waiting:

- After any tool call that mutates the live pipeline (the genudo/n8n MCP write
  verbs), the client page surfaces: *"the platform changed since v02 — snapshot
  before you continue?"*
- Drift is computed by comparing the live platform export against
  `_v/<latest>/CHANGES/platform.export.json`. Equal → silent.

The prompt is a suggestion, never a block, and never writes on its own.

## `CHANGES/` — only what git cannot give

Git already stores every file-level diff, and the reader's Changes panel (BL-19)
already renders them. Re-deriving diffs into the vault would duplicate git and
drift from it. So `CHANGES/` holds exactly the two things git *cannot* produce:

- **`platform.export.json`** — the live platform state at that moment. The vault
  is a *mirror*; the platform is the source of truth for what is actually running,
  and a stale mirror is invisible to git. This is the whole point of a version.
- **`SUMMARY.md`** — why this version exists. Written at snapshot time (the
  dialog's note field, or the agent's own description when it cuts one).

File-level diffs between versions come from git and the reader, not from here.

## Data files in the reader

`.yaml/.yml/.json/.csv` already render as data. `.xlsx` renders **read-only** as a
sheet table, so knowledge tables are finally visible in-app.

Read-only is deliberate: these files are the client's own source data, and an
editable grid invites a write path that would have to round-trip formatting,
formulas and multiple sheets. Out of scope. Editing stays in Excel/Numbers via the
existing OS-open.

**Not doing:** a generated `.csv` mirror for git-diffability. It was considered and
rejected this round — two files to keep in sync, and a derived file that can drift
from its source. The xlsx stays a binary blob in history; version-to-version
comparison of table *content* is a later question if it turns out to matter.

## Migration — the risky part

Renaming 65 live client folders touches the user's real working dex.

- **Dry run first.** Produce the full rename table (client → old → new → platform
  id) and show it for review. Nothing moves until it is approved.
- **`git mv`, one commit, attributed.** Fully reversible with a single revert.
- **Skip, never guess.** A client whose platform pipeline cannot be resolved is
  left untouched and listed in the report. No inferred names.
- **Collision-safe.** If the target name already exists, skip and report.
- **agent-ops only.** Guarded by `requireAgentOps` — a research dex is never
  touched, and the existing research-safety tests must stay green.

## Open risk

The rename depends on reading each client's real pipeline name from the platform,
which needs the genudo MCP reachable **per client** with that client's own token.
Clients whose connection is unwired or whose token is stale cannot be resolved and
will be skipped. Expect the first pass to cover a subset, not all 65.
