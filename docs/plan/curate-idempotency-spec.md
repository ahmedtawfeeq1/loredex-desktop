# Spec — idempotent `curate` (loredex library)

**Repo:** `loredex` (the npm library), NOT loredex-desktop. The desktop app only
calls the lib; this is the root-cause fix for duplicate notes.

## Problem

`curate` re-files **every** source doc on each run, deriving the vault filename
from the *current* run date. So when two teammates curate the same source
project independently — A curates and pushes, B pulls and curates again — the
vault ends up with two copies of every note:

```
projects/genudo-platform-front/ai-model-picker/2026-07-08-ai-model-picker-design.md   (A's run)
projects/genudo-platform-front/ai-model-picker/2026-07-11-ai-model-picker-design.md   (B's run)
```

Same upstream file (`source_rel: docs/superpowers/specs/…-design.md`), two vault
copies. They differ only by the date prefix, so nothing path-based dedups them.
Observed in a real vault: ~30 source files duplicated across one project.

## Root cause

Curate is **not idempotent**. It has no notion of "this source file is already
filed in the vault"; it re-derives a fresh dated filename and writes again.

## Fix — key by provenance, skip already-filed

Each curated note already carries stable provenance frontmatter:

- `source_path` — absolute path of the upstream file, and/or
- `source_project` + `source_rel` — the project-relative source path.

Before filing a source file, curate must check whether a vault note with the
**same provenance identity** already exists, and:

1. **Already filed, unchanged** → skip (no new file, no commit churn).
2. **Already filed, source changed** → update the existing note in place
   (rewrite body/frontmatter at its existing path; keep its original filename
   and date), rather than creating a second dated copy.
3. **Not filed yet** → file it as today (current behaviour).

### Identity function (must match the desktop detector)

```ts
function sourceIdentity(meta): string | null {
  if (meta.source_path)  return `path:${meta.source_path.trim()}`
  if (meta.source_project && meta.source_rel)
    return `rel:${meta.source_project.trim()}|${meta.source_rel.trim()}`
  return null   // hand-written note — never auto-managed
}
```

Build the set of already-filed identities by scanning the target project's
existing notes' frontmatter once at the start of a curate run; consult it per
source file.

### "Source changed" test

Prefer a content hash of the source body stored in frontmatter (e.g.
`source_sha`) so an unchanged re-curate is a cheap no-op and a changed one is
detected without diffing. If no hash is stored, fall back to comparing the
serialized body.

## Warn on cross-actor re-curate

When a curate run targets a project that already has notes filed **by a
different actor** (git blame / `curated_by` frontmatter), print a warning before
doing the full run:

```
⚠ genudo-platform-front already has 146 notes curated by ahmedtawfeeq1.
  Re-curating will update changed notes and add new ones (already-filed notes
  are skipped). Use --force to re-file everything.
```

This makes the idempotent path the default and the destructive re-file opt-in.

## Acceptance

- Curating the same project twice (same source, no changes) produces **zero**
  new files and **zero** commits on the second run.
- Curating after a source file changed updates the **existing** note in place
  (same path/filename), not a new dated copy.
- A genuinely new source file is still filed.
- Notes with no provenance frontmatter (hand-written) are never touched.
- Unit test: two curate passes over the same fixture project → note count stable.

## Interop with the desktop cleanup

The desktop app (loredex-desktop) now ships a **duplicate detector + cleanup**
(`vault.duplicates` / `vault.dedupe`, Settings → Duplicate notes) keyed by the
same `sourceIdentity`. That cleans up vaults duplicated *before* this lib fix
lands. Keep the two identity functions in sync so the app's "duplicate" and the
lib's "already filed" mean exactly the same thing.
