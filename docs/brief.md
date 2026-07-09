# Project Brief: Loredex Desktop

**Author:** Mary (Business Analyst) · **Date:** 2026-07-09 · **Status:** Final — input to PRD
**Sources:** `loredex-simulation/DESKTOP-APP-FEATURES.md` (personas + evidence, F1–F10), `docs/plan/BUILD-PLAN.md` (approved architecture + milestones)

## Executive Summary

Loredex Desktop is a macOS (Apple Silicon) Electron app that becomes a team's single loredex engine: it embeds the published `loredex` npm library in-process, replaces Obsidian as the vault reading surface, and owns the layers the CLI cannot — handoff visibility and consumption, route safety, sync health, onboarding, identity, and notifications. The CLI, MCP clients, and agents keep writing the knowledge; the app makes it readable, actionable, and safe for a ~12-engineer team.

## Problem Statement

The 2026-07-09 Nimbus simulation (10 structured findings, F1–F10) showed a working knowledge pipeline with a broken human surface:

- **Senders are blind (F1).** After sending a handoff, the producer never learns it arrived, was read, or was consumed — consume is an anonymous one-liner. Receivers see handoffs only if they remember to run a command.
- **Routing damaged the vault (F4).** Silent auto-routing published an internal scratch file with invented metadata; duplicate-note races forced hand-editing "do not edit" indexes; route-once stamping stranded stale copies three times.
- **Split-brain is the most dangerous failure (F6).** MCP server and CLI silently served *different vaults* in one session.
- **Onboarding fails at rollout scale (F7).** 6–10 manual steps per engineer with two silent failure modes (missing remote, master/main mismatch); registration is invisible per-machine state.
- **Git failures are silent (F8).** A malformed `gitattributes` line warned on every vault op, unseen, and disabled the merge driver for the file most likely to conflict.
- **Reading requires terminal archaeology (F9).** Every reader did filesystem `find` per wikilink; the PM answered every question with grep. Obsidian is the accidental, unloved dependency.

## Proposed Solution

One app, one engine, one vault: Electron (arm64-first) hosting the pinned `loredex` library in a Node `utilityProcess` — no second engine, no RPC seam, config resolved exactly once, and the existing Streamable-HTTP MCP server hosted in-app so CLI/agent MCP traffic and the UI provably share a vault (F6 fixed by construction). Team-visible lifecycle state lives in vault frontmatter; per-user read/notification state lives in app-local SQLite; derived views are recomputed caches. The stack decision, process model, IPC contract, and milestones are **decided** in `docs/plan/BUILD-PLAN.md` and are not revisited here.

## Target Users (from the simulation)

| Persona | Core need |
|---|---|
| **Engineer** (AI-engine / frontend) | Know the fate of what I sent; read what I received without terminal archaeology |
| **Integrations engineer** (backend) | Contracts as diffs, not prose; operational knowledge with a home |
| **Mobile dev** | Read-mostly consumption; push-style awareness; threaded replies |
| **PM** | Live board, search, activity, product home — no Obsidian, no git |
| **DevOps / admin** | One-click setup and join; sync health; managed identity |

## Goals & Success Metrics (v1 = M1 MVP)

- Obsidian-free re-run of the Nimbus simulation: 0 Obsidian installs, 0 terminal commands for reading/consuming.
- Sender sees a consume (who/when) in outbox + notification ≤ 2 minutes after it happens.
- Team onboarding ≤ 5 min/engineer, 0 manual git commands, 0 TCC prompt ambushes.
- 0 split-brain incidents; 0 unrecoverable vault-damage events; 100% of routes carry a receipt + undo; 0 silent git failures.
- ≥ 95% of releases pass sign→notarize→staple CI unattended; cold start ≤ 2 s on M1 Air; idle RAM ≤ 450 MB.

## MVP Scope (M0 + M1 — the spec's five-pillar cut line)

1. **Walking skeleton (M0):** signed + notarized arm64 app; three-process topology; embedded pinned `loredex`; one rendered note; vault identity badge; in-app MCP server + discovery file + `loredex mcp --via-desktop` stdio proxy; auto-update pipeline.
2. **Vault reader:** rendered notes, resolved + project-disambiguated wikilinks, faceted search, rendered Start Here home with re-curate and changed-since diff.
3. **Handoffs:** inbox/outbox board, consume with identity + timestamp (ships the `loredex_schema:` version key), native notifications for new and state-changed handoffs.
4. **Route safety:** receipts + undo, content-hash dedupe, never-route globs, frontmatter-less confirmation, drift badges.
5. **Onboarding & health:** create-or-join wizard (join link/deep link; create = scaffold + pasted existing-repo URL — **no OAuth in v1**), registry-in-vault (a coordinated loredex-core release), sync health panel.
6. **Activity feed** from vault git history.

Includes the budgeted loredex library work (PR-1…PR-10 per BUILD-PLAN §3.2): every vault-writing operation is a lib export the CLI shares.

## Out of Scope for MVP

In-app GitHub repo creation via OAuth device flow (M2, gated on an auth spike); status lifecycle beyond open/consumed and request threading (M2); chain/lineage + dependency views (M2); commit/PR chips (M2); contract intelligence (M3); note editing/authoring; Android companion; Intel/universal2 builds; Windows/Linux; usage telemetry; Mac App Store.

## Technical Considerations (decided — see BUILD-PLAN)

Electron 43.x, arm64-only, macOS 14+; electron-vite + electron-builder + electron-updater (GitHub Releases, stable + beta channels); `@parcel/watcher`; `better-sqlite3` behind the core host; system git with bundled dugite-native fallback; MCP bound to `127.0.0.1` with bearer token and `~/.loredex/desktop.json` discovery; public MIT sibling repo from day one.

## Constraints & Assumptions

- Solo maintainer + coding agents; stories must be BMAD-sized (one focused agent session) and self-contained.
- M0 ≈ 3 weeks; M1 ≈ 14 weeks including ~4 weeks of loredex lib PRs.
- The vault remains plain markdown + git, Obsidian-compatible; the app is a disposable view (deleting `app.db` loses read-state only).

## Risks (top; full register in BUILD-PLAN §8)

Electron footprint criticism at launch (honest FAQ framing); version-skew split-brain between pinned app engine and floating CLI (schema/engine handshake ships in M1); 12-writer vault merge pressure (F8 fix verified in the pinned release; per-user state kept out of the vault); solo-maintainer bus factor (CI automation, agent-resumable stories); native-module ABI churn (CI smoke on both modules).

## Next Steps

1. PM: author `docs/prd.md` — FRs/NFRs and M0+M1 epics only.
2. Architect: author `docs/architecture.md` — dev-facing distillation of BUILD-PLAN §3 (tech stack, source tree, coding standards, IPC contract, testing strategy).
3. SM: shard stories into `docs/stories/`, Epic 1 = walking skeleton.
