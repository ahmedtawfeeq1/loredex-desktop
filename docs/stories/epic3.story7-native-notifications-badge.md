# Story 3.7: Native notifications & badge

## Status

Approved

## Story

**As a** receiver and a sender,
**I want** native notifications for new handoffs and state changes plus an honest badge,
**so that** nobody polls a command to learn their fate (FR9/FR10).

## Acceptance Criteria

1. A `handoff.new` event for one of my projects fires a native macOS notification; clicking it focuses the app and opens the handoff.
2. A state change on a handoff I sent (e.g. consumed with who/when) notifies me within one fetch cadence (≤ 2 min focused).
3. The dock/tray badge counts open inbound handoffs only (Things discipline); snoozes are respected.
4. Notifications are logged in `app.db`; bulk integrates produce one batched summary, never a storm.

## Tasks / Subtasks

- [ ] Event routing core → main (AC: 1, 2)
  - [ ] Core host filters `handoff.new`/`handoff.stateChanged` events (Story 3.5) by "my projects" (registered projects from config) and direction (inbound new; outbound state changes), checks snoozes (app.db), writes the notification log, then forwards display requests to main over the control channel
  - [ ] `src/main/notifications.ts`: show native `Notification` (title, body with from/to + objective or who-consumed); click → focus window + deep-navigate the renderer to the handoff (route message over the port)
- [ ] Badge (AC: 3)
  - [ ] Core host computes open-inbound count (from `listHandoffs` minus snoozed); pushes to main; `src/main/tray.ts` sets `app.setBadgeCount` + tray title
  - [ ] Recompute on `vault.changed`, consume, and poller integrate
- [ ] Storm control (AC: 4)
  - [ ] Batch window (~5 s) after a poller integrate: N>3 events collapse into one summary notification ("4 new handoffs for nimbus-frontend"); individual events still logged in `notification_log`
- [ ] Verify latency (AC: 2)
  - [ ] Two-clone integration test: consume in clone A → notification display request in B within one focused cadence

## Dev Notes

- Split of responsibilities: core host DECIDES (filter, snooze, log, batch — business logic), main only DISPLAYS (native `Notification`, badge APIs — OS chrome). Do not put filtering logic in main. [Source: architecture.md#process-model]
- Events originate in the poller (Story 3.5) and local ops (consume emits via the PR-8 emitter). Payloads are the contract's `handoff.new`/`handoff.stateChanged`. [Source: architecture.md#ipc-contract]
- Badge honesty is a UX-pattern decision: open inbound handoffs ONLY (Things discipline) — not unread counts, not outbound. Snoozed items don't count. 
- Notification log + snoozes live in `app.db` (Story 3.6). Dedupe across restarts uses the logged `item_id`+`kind`. [Source: architecture.md#state-placement]
- The ≤2 min metric is FR10's acceptance bar and M1's headline demo ("handoff sent from CLI appears as a notification on the other machine within one fetch cadence").
- Files: `src/core/poller.ts` (filter/forward), `src/core/db/read-state.ts` (log/snooze queries), `src/main/notifications.ts`, `src/main/tray.ts`, renderer deep-navigation handler in `App.tsx`. [Source: architecture.md#source-tree]

### Testing

- Unit: direction/project filtering, snooze suppression, batch collapse threshold, badge count math. Integration: the two-clone latency test above; notification click navigation (Playwright, can land with Story 6.3's harness). [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 3 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
