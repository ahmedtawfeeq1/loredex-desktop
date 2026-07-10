# Loredex Desktop Architecture — M2 Addendum

**Author:** Winston (Architect) · **Date:** 2026-07-10 · **Status:** Approved
**Audience:** dev agents. This extends `docs/architecture.md` (still binding) for the M2 cycle: handoff lifecycle v2, app-db, poller, contract intelligence, GitHub layer, wizards. Read THIS + your story file. Decisions here are final; do not relitigate. Everything in `docs/architecture.md` (process model, anti-second-engine rule, write lock, coding standards) still applies verbatim.

### Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 1.0 | M2 contract distilled from BUILD-PLAN M2/M3 + DESIGN v2 | Winston |

Scope note: this cycle ships lifecycle v2 (BUILD-PLAN features 16–20, 24–26), app-db (deferred 3.6), poller (deferred 3.5), the no-OAuth wizards (deferred 5.5/5.6), and pulls two M3 items forward (contract timeline/diff, PR-merged suggestion) in read-only, heuristic-labeled form. **NO OAuth / device flow this cycle** — wizard is paste-URL only (BUILD-PLAN §3.5 gating: the device-flow spike has not landed; feature 11b stays gated).

---

## 1. Handoff schema v2 (vault frontmatter — team-visible truth)

`LOREDEX_SCHEMA` bumps `1 → 2` in `loredex/src/core/frontmatter.ts`. All fields **additive**; every engine write of any v2 field stamps `loredex_schema: 2` via the existing `stampSchema`. v1/unversioned notes remain fully readable (unknown-absent = defaults below).

### Fields (added to `Meta`)

| Field | Type | Values / format | Default when absent |
|---|---|---|---|
| `status` | string | `open \| accepted \| declined \| snoozed \| consumed` | — (v1 already has open/consumed) |
| `kind` | string | `request \| delivery` | `delivery` |
| `replies_to` | string | note name (no `.md`, no path) of the handoff this replies to | — |
| `fulfills` | string | note name of the **request** handoff this delivery fulfills | — |
| `declined_reason` | string | free text, single line | — |
| `snoozed_until` | string | `YYYY-MM-DD` | — |
| `accepted_by` | string | `Name <email>` (same format as `consumed_by`) | — |
| `accepted_at` | string | ISO timestamp | — |

`declined_by`/`declined_at` and `snoozed_by`/`snoozed_at` follow the same pattern (each transition is attributed; same `Name <email>` + ISO format). Note names in `replies_to`/`fulfills` resolve vault-wide via the existing shortest-path logic — same rule as reading-order wikilinks.

### State machine + writer semantics (who writes what, when)

```
open ──accept──▶ accepted ──consume──▶ consumed        (terminal)
open ──decline─▶ declined                              (terminal; reopen allowed)
open ──snooze──▶ snoozed ──(reopen/accept/consume as open)
open ──consume─▶ consumed                              (skip-accept stays legal — CLI v1 path)
```

| Transition | Writer (actor) | Fields written (and nothing else) |
|---|---|---|
| create | **sender** (via `createHandoff`/`replyToHandoff`) | full note: `status: open`, `kind`, `date`, `from_project`, `to_project`, `objective`, optional `replies_to`/`fulfills`, `loredex_schema: 2` |
| accept | **recipient** | `status: accepted`, `accepted_by`, `accepted_at` |
| decline | **recipient** | `status: declined`, `declined_by`, `declined_at`, `declined_reason` (required) |
| snooze | **recipient** | `status: snoozed`, `snoozed_by`, `snoozed_at`, `snoozed_until` (required) |
| reopen | recipient (from declined/snoozed only) | `status: open`; snooze fields removed; decline/accept attribution fields **kept** (history) |
| consume | **recipient** (existing `consumeHandoff`) | `status: consumed`, `consumed_by`, `consumed_at` |

Rules: exactly one writer per transition (merge pressure stays near zero — BUILD-PLAN §3.4); transitions never erase prior attribution fields (except snooze fields on reopen); every transition = one lib write op = write-lock + `gitAutoCommit` + best-effort `gitPullPush` + `emitLoredexEvent`. **Snooze expiry never auto-writes**: when `snoozed_until` < today, every reader (lib `listHandoffs`, app board) *derives* an "expired" flag and sorts the card with open ones; flipping `status` back is a human/one-click action.

### Old-CLI degradation (schema 1 engine on a v2 vault)

- `gray-matter` round-trips unknown keys and v1 writers spread `...doc.meta` — v1 `consumeHandoff` on an `accepted` note preserves all v2 fields and legally lands on `consumed`. No data loss.
- v1 `listHandoffs` renders unknown statuses verbatim and sorts them as not-open — degraded but honest.
- `vaultSchemaStatus` reports `declared: 2 > supported: 1 → ok: false`; `loredex doctor` + app sync health + `.loredex/engine.json` (`schema: 2`, written on first v2 write and on scaffold) all warn loudly. That is the whole handshake — no hard blocks.

---

## 2. Lib API additions (loredex repo — **lib PR-11**, one release)

All are lib exports (anti-second-engine rule); the app calls them through `src/core/engine.ts` under the write lock. New module `loredex/src/core/handoff.ts`; CLI subcommands ride the same release.

```ts
// --- create (programmatic, NO LLM: brief assembled verbatim from inputs) ---
export interface CreateHandoffInput {
  fromProject: string
  toProject: string            // must be a registered project (target picker feeds this)
  objective: string
  kind: 'request' | 'delivery'
  notes: string[]              // note names → Reading order, in given order
  nextActions?: string[]
  repliesTo?: string           // note name
  fulfills?: string            // note name (request being fulfilled)
  body?: string                // optional prose section; verbatim, no generation
}
export interface HandoffCreateResult { id: string; path: string; pushed: boolean }
export function createHandoff(vaultPath: string, config: Config,
  input: CreateHandoffInput, identity: Identity): HandoffCreateResult

// --- reply (sugar: parent lookup + inverted route + replies_to) ---
export function replyToHandoff(vaultPath: string, config: Config, parentId: string,
  input: Omit<CreateHandoffInput, 'fromProject' | 'toProject' | 'repliesTo'>,
  identity: Identity): HandoffCreateResult

// --- lifecycle (one writer for every non-consume transition) ---
export type HandoffTransition =
  | { to: 'accepted' }
  | { to: 'declined'; reason: string }
  | { to: 'snoozed'; until: string }        // YYYY-MM-DD
  | { to: 'open' }                          // reopen, from declined|snoozed only
export interface StatusReceipt { handoffId: string; path: string; by: Identity;
  at: string; before: Meta; after: Meta; pushed: boolean }   // shape mirrors ConsumeReceipt
export function setHandoffStatus(vaultPath: string, config: Config, id: string,
  transition: HandoffTransition, identity: Identity): StatusReceipt

// --- comment: a NEW note (type: 'comment', replies_to: id) — never mutates the handoff ---
export function annotateHandoff(vaultPath: string, config: Config, id: string,
  comment: { title: string; body: string }, identity: Identity): HandoffCreateResult

// --- routing, programmatic (plan+execute in one call; the app's route surface) ---
export function routeFile(vaultPath: string, config: Config, path: string,
  opts: { mode: 'move' | 'copy'; projectName?: string; projectRoot?: string }): { written: string[] }
```

**Internals reused (build nothing twice):**

| New export | Reuses |
|---|---|
| `createHandoff` | `curate.ts collectNotes` (validate `input.notes` exist in `fromProject`; unknown name → throw, never silently drop), `vault.ts slugify/uniquePath` (dest `projects/<to>/handoffs/<date>-handoff-<from>[-n].md`), `frontmatter.ts serializeDoc/stampSchema`, `router.ts gitAutoCommit/gitPullPush`, `indexer.ts rebuildIndexes`, `events.ts emitLoredexEvent` |
| `replyToHandoff` | `product.ts listHandoffs` for parent lookup (throws if missing), then `createHandoff` (kind defaults: reply to `request` → `delivery`) |
| `setHandoffStatus` | same resolve-by-id walk as `consume.ts consumeHandoff` (extract the shared finder while there — and fix the V1-STATUS qualified-id TODO: `id` accepts `"<project>/<name>"` to disambiguate cross-project basename collisions; bare name throws `AMBIGUOUS_HANDOFF` when it matches >1), `parseDoc/serializeDoc/stampSchema`, `gitAutoCommit/gitPullPush` |
| `annotateHandoff` | `store.ts storeNote` pattern via `createHandoff` machinery, `type: 'comment'`, filed in the handoff's own `handoffs/` dir |
| `routeFile` | `router.ts planFile + executePlan + knownStructure` verbatim — pure re-export composition |

New event kinds in `events.ts LoredexEventMap`: `'handoff.created': { id, path, from, to, kind }` and `'handoff.status': { id, path, from: string, to: string, by: Identity, at: string }` (status strings). Consume keeps its existing `'consume'` event.

Illegal transitions (`consumed → *`, reopen from accepted, decline without reason, snooze without date) throw typed errors; the app maps them to the `{code,message}` envelope (`ILLEGAL_TRANSITION`, `AMBIGUOUS_HANDOFF`, `UNKNOWN_HANDOFF`).

---

## 3. App-db (`better-sqlite3`, core host is the SOLE opener)

- **Path:** `<userData>/app.db` (main passes `app.getPath('userData')` to the core host at fork; core host resolves `join(userDataDir, 'app.db')`). WAL mode. Replaces the v0.1 userData-JSON shim for identity/settings (migration: read the JSON once, import, rename to `.bak`).
- **Migrations:** `PRAGMA user_version` + an ordered array of idempotent migration functions in `src/core/db/index.ts` (`migrations: Array<(db) => void>`; run `migrations.slice(user_version)` in one transaction, then bump). No ORM, no down-migrations — `app.db` is disposable by contract (read-state only is lost).
- **Vault scoping:** every table keys on `vault_id` = the normalized origin remote URL when one exists, else the absolute vault path. Computed once at vault open.

```sql
CREATE TABLE meta          (key TEXT PRIMARY KEY, value TEXT);              -- schema bookkeeping, identity profile, gh availability cache
CREATE TABLE read_state    (vault_id TEXT, note_path TEXT, read_at TEXT,
                            PRIMARY KEY (vault_id, note_path));
CREATE TABLE snooze_timers (vault_id TEXT, handoff_id TEXT, until TEXT,     -- LOCAL mirror of vault snoozed_until,
                            notified INTEGER DEFAULT 0,                     -- so expiry fires a toast once per machine
                            PRIMARY KEY (vault_id, handoff_id));
CREATE TABLE poll_cursor   (vault_id TEXT PRIMARY KEY, branch TEXT,
                            last_seen_sha TEXT, last_fetch_at TEXT);
CREATE TABLE contract_scan (repo_root TEXT, file TEXT, commit_sha TEXT,     -- cache of git-log timeline entries
                            committed_at TEXT, summary_json TEXT,           -- adds/dels, subject, author
                            PRIMARY KEY (repo_root, file, commit_sha));
CREATE TABLE app_settings  (vault_id TEXT, key TEXT, value TEXT,            -- per-vault: project roots map,
                            PRIMARY KEY (vault_id, key));                   -- user contract globs, poll overrides
```

Hard rule unchanged: nothing team-visible lives only here; nothing per-user goes to the vault. `snooze_timers` duplicates a *vault* fact purely to fire local notifications — vault is authoritative, timers reconcile from frontmatter on every board load.

---

## 4. Remote poller (`src/core/poller.ts` + `write-lock.ts`, finishing deferred 3.5)

- **Interval:** 60 s while any app window is focused, 5 min while blurred. Main sends focus/blur over the control channel; core host swaps the timer. Manual "Sync now" resets the clock.
- **Detect without merging:** each tick → `git fetch origin <branch>` (never touches worktree, always safe) → `git log --name-status --format=… <last_seen_sha>..origin/<branch>` scoped to `projects/*/handoffs/*.md`. For each touched handoff file, read the remote version via `git show origin/<branch>:<path>`, `parseDoc`, diff `status`/frontmatter against the local copy → emit `handoff.new` (added file) or `handoff.stateChanged` (status differs). Advance `poll_cursor.last_seen_sha` only after events are emitted. First poll on a fresh cursor seeds `last_seen_sha = origin/<branch>` and emits nothing (no notification storm on join).
- **Integrate (pull) gating:** unchanged from architecture.md — pull only when the write lock is free AND the worktree is clean; dirty/busy → defer to next tick, sync health shows "behind N, integrating…". After every pull: `rebuildIndexes` + full reconcile (F4 rule), including snooze_timers ← frontmatter.
- **Single-flight coordination:** one async mutex instance (`write-lock.ts`) in the core host is the ONLY gate. Every lib write (`createHandoff`, `setHandoffStatus`, `consumeHandoff`, `routeFile`, wizard git ops) and the poller's pull acquire it. The poller uses `tryAcquire` (skip tick if busy — user work always wins); user-initiated `sync.run` uses blocking `acquire`. Never two concurrent git mutations, by construction. Fetch itself runs outside the lock (read-only).

---

## 5. Contract intelligence (read-only, app-side — no vault writes, so core-host code, not lib)

- **Project-root discovery:** if the loredex `config.projects` map is non-empty and `config.vaultPath` matches the open vault → use it as-is (`root path → {name}`); else fall back to `app_settings key='project_roots'` for this vault (user picks folders in Settings; wizard join-flow seeds it). Config wins when both exist; app-side map is never written back into config.json.
- **Contract file patterns** (per project root, case-insensitive): `openapi*.y?(a)ml`, `*openapi*.json`, `postman*collection*.json`, `**/*.graphql` + user globs from `app_settings key='contract_globs'`. Matches under `.git/`, `node_modules/` excluded.
- **Timeline:** per repo root, `git log --follow --numstat --format=<token-separated>` per matched file → rows cached in `contract_scan` keyed `(repo_root, file, commit_sha)`; incremental: only log since the newest cached sha. Renderer gets a merged, date-sorted timeline (DESIGN v2 "Data visualizations" spec).
- **Diff extraction:** `contracts.diff` shells `git show <sha> -- <file>` (unified diff, size-capped at 200 KB; larger → truncated flag). Never `git diff` against the worktree — pins to commits only.
- **Linking changes → handoffs**, two tiers, tier always labeled in the payload:
  - `confidence: 'mentioned'` — commit sha (7–40 hex, word-bounded) appears in a handoff/note body or objective. Strong; renders as a solid chip.
  - `confidence: 'heuristic'` — same project + same calendar date (commit date vs note `date`). Renders with an explicit "heuristic" label (DESIGN: `--text-2` chip); never used for notifications or suggestions.

---

## 6. GitHub layer (`src/core/github.ts` — network/exec, app-side, read-only)

- **Remote-URL derivation:** `git remote get-url origin` in the project repo (contract chips) or vault repo (handoff/activity SHAs); normalize `git@github.com:o/r.git` and `https://github.com/o/r(.git)` → `https://github.com/o/r`. Non-GitHub remote → chips render as plain mono text, no link. Cache per repo per session.
- **Commit chip:** `<base>/commit/<sha>`. Existing SHA-hyperlink behavior from M1 home view is superseded by this one helper.
- **PR lookup:** feature-detect once at core-host startup: `gh --version` && `gh auth status` exit 0 → capability `gh: true` (cached in `meta`, re-checked on settings change). With gh: `gh pr list --repo <o/r> --search <sha> --state all --json number,title,state,mergedAt,url` (5 s timeout, per-sha session cache). Without gh: degrade gracefully — plain commit links, PR chips absent, Settings shows "install gh for PR chips". No REST fallback, no tokens, no OAuth this cycle.
- **PR-merged → SUGGEST, never auto-write:** when a merged PR (or `mentioned`-tier commit) references an `open`/`accepted` handoff owned by the current identity's project, core emits `suggest.statusChange { handoffId, suggested: 'consumed'|'accepted', evidence }`. Renderer shows a toast (DESIGN toast spec) with one-click **Apply** → ordinary `handoffs.setStatus` invoke (write lock, attributed, committed). Dismiss is remembered in `read_state`-style row (`app_settings key='dismissed:<handoffId>:<sha>'`). Silent auto-transitions are a bug, categorically.

---

## 7. Wizards (finishing deferred 5.5/5.6 — paste-URL only, NO OAuth)

Both are core-host sequences behind one channel each; each step reports progress events so the modal (DESIGN modal spec) can render step state. All git ops under the write lock, identity injected per command (`git -c user.name -c user.email`, F7).

**Create vault** (`wizard.createVault`) — steps, in order:
1. Native folder pick (main-process dialog) → target must be empty or nonexistent.
2. Optional remote: paste HTTPS/SSH URL → preflight `git ls-remote <url>` (auth/reachability check before any writes).
3. Identity confirm (from app profile; block if unset).
4. `scaffoldVault(path)` + `saveConfig` (vaultPath, sync:'git') + `git init -b main`.
5. If remote: `git remote add origin <url>`, `ensureGeneratedMergeDriver`, initial commit, `git push -u origin main`.
6. First `sync.status` + seed `poll_cursor`.

Failure states → typed envelope codes: `DEST_NOT_EMPTY`, `REMOTE_UNREACHABLE` (bad URL/auth — message says "check the URL or your git credentials (SSH key / credential helper); this app never asks for GitHub login"), `PUSH_REJECTED` (non-empty remote → offer join flow instead), `IDENTITY_MISSING`. Every failure after step 4 leaves a valid *local* vault; the wizard says so and offers "retry remote wiring" from Sync settings.

**Join vault** (`wizard.joinVault`) — steps:
1. Paste clone URL (or arrive via `loredex://join?remote=…&branch=…` deep link, main → core).
2. Native destination pick → `git clone <url> <dest>` (progress streamed).
3. Validate shape: `projects/` exists or `.loredex/engine.json` present → else `NOT_A_VAULT` (clone kept, user told).
4. Schema handshake: `vaultSchemaStatus` — newer-than-supported → loud warning, join continues read-mostly.
5. Register: `saveConfig` vaultPath (+ merge `projects` map when the registry note/config ships it); seed `app_settings project_roots` prompt ("where do this team's repos live on this machine?" — skippable).
6. Identity check: app profile set → done; else prompt (block writes, not reading).
7. `ensureGeneratedMergeDriver` + first fetch + seed `poll_cursor` (no notification storm — §4).

Failure states: `CLONE_AUTH_FAILED` (private repo, same no-OAuth message), `DEST_NOT_EMPTY`, `NOT_A_VAULT`, `SCHEMA_AHEAD` (warning, not fatal). The v0.1 `vault.createOrJoin` channel is **removed** in favor of the three channels below.

---

## 8. IPC additions + state placement (the one table dev agents check first)

**New/changed CoreApi channels** (all renderer → core request/response unless marked event):

| Channel | Dir | Payload in → out | State touched |
|---|---|---|---|
| `handoffs.create` | R→C | `CreateHandoffInput & {identity from profile}` → `HandoffCreateResult` | vault (lib) |
| `handoffs.reply` | R→C | `{parentId, input}` → `HandoffCreateResult` | vault (lib) |
| `handoffs.setStatus` | R→C | `{id, transition: HandoffTransition}` → `StatusReceipt` | vault (lib) |
| `handoffs.annotate` | R→C | `{id, title, body}` → `HandoffCreateResult` | vault (lib) |
| `handoffs.thread` | R→C | `{id}` → `{ancestors: HandoffCard[], replies: HandoffCard[], fulfills?: HandoffCard}` | derived (from `listHandoffs` + `replies_to`/`fulfills` edges) |
| `readState.get` | R→C | `{paths: string[]}` → `Record<path, read_at \| null>` | app-db |
| `readState.mark` | R→C | `{paths: string[]}` → `void` | app-db |
| `route.file` | R→C | `{path, mode, projectName?}` → `{written: string[]}` | vault (lib `routeFile`) |
| `contracts.timeline` | R→C | `{project?}` → `ContractChange[]` (`{file, sha, date, author, adds, dels, links: {handoffId, confidence}[]}`) | derived + app-db cache |
| `contracts.diff` | R→C | `{repoRoot, file, sha}` → `{unified: string, truncated: boolean}` | derived (git show) |
| `github.prForCommit` | R→C | `{repoRoot, sha}` → `{url, number, title, state, mergedAt} \| null` | derived (gh CLI, session cache) |
| `settings.projectRoots` | R→C | get/set `{roots: Record<path,{name}>}` → — | app-db (unless config.projects wins, §5) |
| `settings.contractGlobs` | R→C | get/set `{globs: string[]}` → — | app-db |
| `wizard.validateRemote` | R→C | `{url}` → `{reachable, empty, defaultBranch}` | none (git ls-remote) |
| `wizard.createVault` | R→C | `{dir, remoteUrl?}` → `{vaultPath, remoteWired: boolean}` | vault + config + app-db seed |
| `wizard.joinVault` | R→C | `{url, dest}` → `{vaultPath, schemaOk: boolean}` | vault + config + app-db seed |

**New CoreEvents** (core → renderer, existing single event channel):

| Event | Payload | Source |
|---|---|---|
| `handoff.created` | `{card: HandoffCard}` | lib emitter (PR-11) |
| `handoff.stateChanged` | *(exists; payload gains `reason?`, `until?`)* | lib emitter + poller |
| `suggest.statusChange` | `{handoffId, suggested, evidence: {sha, prUrl?}}` | github.ts (§6) — toast, never auto-apply |
| `snooze.expired` | `{handoffId}` | snooze_timers sweep (core, on tick) |
| `contract.changed` | `{project, file, sha}` | contract scan after poll integrate |
| `wizard.progress` | `{flow, step, status, detail?}` | wizard sequences |

**Where each M2 feature's state lives:**

| Feature | Vault (frontmatter, lib-written) | app-db | Derived (recomputed) |
|---|---|---|---|
| Lifecycle v2 | status/kind/replies_to/fulfills/declined_reason/snoozed_until/*_by/*_at | — | expired-snooze flag, board lanes |
| Read/unread + badges | — | read_state | dock badge count |
| Snooze notifications | snoozed_until (truth) | snooze_timers (local mirror, `notified` flag) | — |
| Threads / lineage | replies_to, fulfills | — | thread graph |
| Poller | — | poll_cursor | behind/ahead counts |
| Contract timeline/diff/links | — | contract_scan cache, contract_globs, project_roots | timeline, diffs, link tiers |
| GitHub chips / PR suggest | — | gh capability + dismissals | URLs, PR lookups |
| Identity profile | (never) | meta (imported from v0.1 JSON) | — |
| Wizards | scaffold output | seeded cursor/roots | validation results |

**Story sequencing constraint:** lib PR-11 (schema 2 + the five exports + events + qualified-id fix) is the first M2 story; no app story that writes handoffs is authored against a pin that predates it. Contract/GitHub/wizard stories have no lib dependency and can run parallel from day one.
