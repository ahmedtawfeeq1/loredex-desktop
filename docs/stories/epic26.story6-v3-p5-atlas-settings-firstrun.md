# Story 26.6: DESIGN v3 P5 — Atlas lenses + Settings regroup + first-run

## Status

Done

## Story

**As a** loredex user,
**I want** the Atlas speaking the v3 lens language (Map → Project → Thread → Deep Dive), Settings regrouped Workspace/Personal/System with sync living inside it, and a first-run that teaches the three steps to a working dex,
**so that** navigation matches the locked IA and the old Sync page stops being a whole view.

Spec: docs/DESIGN.md v3 amendment §5 (Atlas lens ladder, Settings row, Sync row), §6.6. Pixel refs: handoff/screens/05–08.

## Acceptance Criteria

1. Atlas lens switcher reads **Map · Project · Thread · Deep Dive** (internal level ids `overview/learn/deep` stay, §8): Map ← Overview (Launcher/Flow sub-modes kept), Project ← Learn (Start-Here-first page kept), **Thread** = the re-homed Path tool (arms the path panel over the Deep Dive canvas; selected state follows the panel), Deep Dive kept. Toolbar utilities (Tours, Filters, Blocked, Changed-since, Export, ? legend) persist across lenses; legend lens rows updated; breadcrumb reads **dex ▸ project ▸ topic** and stays the esc ladder.
2. Settings tabs regroup to **Workspace** (scope, contracts, duplicates) / **Personal** (identity, appearance, typography) / **System** (**Sync & git** = the dissolved Sync view's full panel, GitHub, MCP). Tab state lives in a store so sync pills/deep links open System directly; the old `sync` view id keeps working (renders Settings › System); Sync leaves the nav (research dexes: 9 views, ⌘1-9 fully bound again).
3. First-run: cards say **dex** (Create a dex / Join a dex / Open an existing folder) + a mono-numbered 3-step checklist (create/join → identity → point agents at MCP). R1 mark already wired (P0).
4. Gates green; atlas-nav/visibility/legend + SettingsView + registry/nav tests updated.

## Dev Notes

- Files: `views/atlas/{AtlasView,atlas-visibility,atlas-legend}.ts(x)` + their tests, `views/settings/SettingsView.tsx(.test)`, `stores/settingsTab.ts`, `views/wizard/FirstRun.tsx`, `App.tsx` (SyncRedirect), `actions/registry(.test)/nav-groups.test`, `styles.css`.

## Dev Agent Record

- **Thread lens v1 = the Path tool re-homed** (§5 says Thread "absorbs the Path tool"): selecting Thread navigates to the Deep Dive canvas with the path panel armed — trace start/end, chain highlight, focus fade all carry over. The dedicated story-layout rendering (one chain as a vertical narrative) is a follow-up story; the lens, ladder position, and tool absorption land now.
- **Demo dex deferred**: §6.6 names "demo vault + checklist per wireframe 1j"; the checklist ships, but generating a demo dex means the app writing sample notes — an engine-side `loredex init --demo` belongs in the lib (anti-second-engine). Flagged for the lib backlog; the Create-a-dex wizard remains the guided path.
- **Sidebar sync pill**: the dex chip's sync dot (v2) already carries §5's "titlebar sync pill" duty; clicking still deep-links to sync health — now inside Settings › System.
- Known-flaky suite (`set-frontmatter` this run) passes isolated — pre-existing.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-17 | 1.0 | Lens renames + Thread lens, dex breadcrumb, Settings Workspace/Personal/System w/ Sync absorbed, first-run checklist + dex copy | Claude (dev agent) |
