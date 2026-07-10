# Story 20.1: Notion/Obsidian-style Properties panel

## Status

Done

## Story

**As a** reader looking at a filed note's metadata,
**I want** the flat frontmatter key/value table replaced by a real **Properties** panel — typed rows (date / tags / select / url / path / text), loredex-managed fields locked, my own fields editable inline with add/remove, tags clickable into a search,
**so that** the vault's metadata is legible and lightly editable the way Notion/Obsidian properties are — without ever touching the fields the agents own, per DESIGN.md "D1 amendment 7 §C".

## Acceptance Criteria

1. **Typed rows.** Each frontmatter property renders as a row: type icon + key name + a typed value control, the type inferred from key+value — `date` (date key / `*_at` / `*_until` / ISO-date string), `tags` (array or `tags`), `select` (`status`/`type`/`kind` → colored chip), `url` (http(s) string → link), `path` (`*_path`/`*_rel` / slash-y no-space string), `text` (default).
2. **Managed fields locked.** loredex-managed keys (`loredex`, `source_path`, `source_project`, `source_rel` and the rest of the agent-owned provenance/lifecycle/schema surface) render but are LOCKED — a ⚿ lock glyph with a "managed by loredex" tooltip, value read-only. Agents own frontmatter; the design principle stays intact.
3. **Editable user fields.** Non-managed fields edit inline and write back through a NEW core channel `note.setFrontmatter` — body untouched, path-guarded via `resolveNoteInsideVault`, git auto-commit, schema-preserving via the lib `serializeDoc`. Managed keys are rejected server-side (not only hidden in the UI).
4. **Add / remove.** A "+ Add property" affordance with a small type picker adds a user field; a × on a user row removes it. Neither can touch a managed key.
5. **Tags clickable.** A tag chip click runs a `tag:` search (Search view + the search store).
6. **Collapsible.** The panel is collapsible ("Properties ▸ N"), collapsed by default on long notes, expanded on short. Dense, mono values, DESIGN v2.
7. **DoD.** Gate green (typecheck, full sequential vitest, build); a core-channel unit test (`setFrontmatter` preserves body + rejects managed keys + traversal); a type-inference unit test.

## Tasks / Subtasks

- [x] Shared model (AC 1, 2, 3, 7): `src/shared/properties.ts` — `inferPropertyType(key, value)`, `MANAGED_FRONTMATTER_KEYS` + `isManagedKey`, `emptyValueForType`. Pure, no fs/loredex; imported by both the panel (renderer) and the writer (core) so the lock/type contract has ONE definition.
- [x] Pure edit helper (AC 3, 7): `applyFrontmatterEdit(meta, key, value, remove)` in `src/core/notes.ts` — rejects blank + managed keys (`ipcError('INTERNAL', …)`), otherwise sets/deletes the key. Node-testable without fs.
- [x] Engine writer (AC 3): `engine.setFrontmatter(path, key, value, remove, identity)` — `resolveInVault` guard → `parseDoc` → `applyFrontmatterEdit` → `serializeDoc({ meta, body: doc.body })` (body preserved) → `withGitIdentity` + `gitAutoCommit "loredex: set|remove property <key> on <note> (<name>)"`. Commit-only.
- [x] Channel (AC 3): `note.setFrontmatter` in `src/shared/ipc-contract.ts` + a handler in `src/core/handlers.ts` mirroring `note.save` — `withWriteLock`, `requireIdentity`, link/facet/atlas invalidation, `vault.changed` emit, returns the vault-relative path.
- [x] Panel (AC 1, 2, 4, 5, 6): `src/renderer/src/views/reader/PropertiesPanel.tsx` — collapsible header, typed rows, lock glyph on managed rows, inline edit (text/date/select/url/path) + tag chips (× per tag, + tag input, click → `searchTag`), "+ Add property" type picker + × remove, identity-gated. Wired into `NoteView` `NoteArticle` (`key={selected}`, `defaultCollapsed={doc.body.length > 1500}`); `FrontmatterPanel` kept for `NoteEditor`'s read-mode display.
- [x] CSS (AC 6): `.properties`/`.prop-*` in `styles.css` — DESIGN v2 dense mono, both themes via existing tokens.
- [x] Tests (AC 7): `src/shared/properties.test.ts` (inference across all six types + managed-key guard + empty-value); `src/core/set-frontmatter.test.ts` (channel drive over the seam: body byte-preserved, set/remove commit grammar with the payload identity, managed-key + blank-key + traversal + identity refusals).

## Dev Notes

- DESIGN.md "D1 amendment 7 §C", read verbatim, is the binding spec. [Source: DESIGN.md#d1-amendment-7]
- **One managed-key truth, two consumers.** `properties.ts` is pure and shared, so the panel's lock glyph and the writer's rejection can never drift. The managed set is broader than the four keys the spec names by example — it locks the whole agent-owned surface (route provenance, consume/accept/decline/snooze attribution, thread edges, the schema stamp) for the same "agents own frontmatter" reason; `status`/`type`/`kind`/`topic`/`project`/`date`/`tags`/`objective` and arbitrary user keys stay editable.
- **Body byte-for-byte.** `note.save` is body-only (frontmatter spliced verbatim); `note.setFrontmatter` is the inverse — frontmatter is exactly what changed, so it is re-serialized, and the BODY is what must survive. `engine.setFrontmatter` passes `doc.body` straight through `serializeDoc`; the channel test asserts the parsed body is identical across a set AND a remove.
- **Refresh, not optimistic.** After a write the panel calls `useReader.refresh()` to re-read committed truth; the panel is `key`ed by note path so its collapsed/edit state re-inits per note.
- **`tag:` search is forward-compatible.** Tag click does `setView('search') + setQuery('tag:<tag>')`; epic22 (powerful search) parses the `tag:` operator. Until then it degrades to a substring query for `tag:<tag>` — wired exactly as the spec words it.

## Deviations

- **`FrontmatterPanel` kept, not deleted.** The spec targets the reader's read surface (`NoteArticle`). `NoteEditor` (body-edit mode) still shows frontmatter read-only via the old `FrontmatterPanel`; editing frontmatter while editing the body is out of scope, and keeping the component leaves its tests + `formatValue` consumers untouched (no working-seam churn).
- **Broader managed set than the four named keys** — see Dev Notes; stricter, not looser, and defensible under "agents own frontmatter".
- **App visual drive skipped** per the standing QA convention (dev launch needs electron-rebuild → node-test ABI break). Verification is the channel + inference test coverage of the DoD plus the full gate.

## Dev Agent Record

- 2026-07-11: implemented as specced. Gate: typecheck (node+web) clean, full vitest 873/873 sequential (`--no-file-parallelism`; 858 prior + 15 new), production build clean. New: `src/shared/properties.ts` (+test), `src/core/set-frontmatter.test.ts`, `src/renderer/src/views/reader/PropertiesPanel.tsx`. Touched: `ipc-contract.ts`, `core/handlers.ts`, `core/engine.ts`, `core/notes.ts`, `NoteView.tsx`, `styles.css`.
