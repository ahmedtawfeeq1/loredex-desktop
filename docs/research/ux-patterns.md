# UX Patterns to Steal for Loredex Desktop

Research date: 2026-07-09. Lens: concrete, buildable UX patterns for a developer-facing knowledge/inbox app on macOS, drawn from Obsidian, Linear, GitHub Desktop, Raycast, Slack, Things, and Apple's HIG — mapped against the loredex simulation frictions (F1–F10 in `SIMULATION-REPORT.md`) and the feature spec (`DESKTOP-APP-FEATURES.md`). Each section ends with a "steal this" block tying the pattern to a loredex feature, and notes whether it serves the keyboard-first engineer or the PM persona.

---

## 1. Markdown reader with wikilink resolution — Obsidian

### How Obsidian resolves `[[links]]`

Obsidian's default link format is **"Shortest path when possible"**: a link uses only the filename if that filename is unique in the vault (`[[My note]]`); when duplicates exist, "Obsidian adds enough path components to disambiguate" ([Internal links — Obsidian Help](https://help.obsidian.md/links)). Two other formats exist (relative path, absolute-from-vault-root), configurable under Settings → Files and links → New link format. Resolution when *reading* a link goes: exact filename match (case-insensitive, `.md` ignored) → normalized match (spaces/`-`/`_` treated as equivalent) → path components if provided.

Other load-bearing reader behaviors:

- **Typing `[[` triggers autocomplete** against every file in the vault — link creation is a search, not a path exercise.
- **Rename propagation**: Obsidian "automatically updates internal links in your vault when you rename a file" (toggleable). Any external writer (CLI, agent) that renames files will break this contract, so a desktop reader for a git vault must instead detect and surface broken links rather than assume it owns renames.
- **Heading and block links**: `[[Note#Heading]]`, `[[Note#^blockid]]` — heading links matter for handoff briefs that reference a specific section of a contract note.
- **Unresolved links** render distinctly (faded) and clicking one creates the note — a behavior loredex should *not* copy for a read-mostly team vault (accidental note creation from a typo'd link is exactly the F10 "ghost project" failure in link form).

### Hover preview (Page preview core plugin)

Obsidian shows a rendered popover preview of the target note on hover — by default automatically in File explorer, Search, and Backlinks, and with `Cmd` held while hovering links in the editor; a setting flips whether the modifier is required ([Page preview — Obsidian Help](https://help.obsidian.md/plugins/page-preview)). The community's most popular enhancement (Hover Editor) turns that popover into a pinnable, resizable pane — evidence that users want the preview to be *interactable*, not just a tooltip.

### Vault-open UX

The **Vault profile** opens on first run and offers exactly two paths: *Create new vault* (name + browse for parent folder) and *Open folder as vault* (any existing folder becomes a vault, no import step) ([Manage vaults — Obsidian Help](https://help.obsidian.md/manage-vaults)). The vault switcher lists known vaults with rename/move/remove (remove never deletes files). This "your folder is already the database" posture is precisely why Obsidian feels trustworthy — the app is a lens, not a container.

**Steal this (F9 — every reader did filesystem `find` per link):**
- Resolve wikilinks with Obsidian's exact algorithm (filename-unique → shortest path; case-insensitive; space/dash/underscore normalization) so links written by Obsidian users and by the CLI's LLM briefs resolve identically.
- On collision (the simulation's `[[2026-07-09-handoff-nimbus-backend]]` appearing twice), do what Obsidian does at *creation* time but at *render* time: show a disambiguation popover listing candidates **with their owning project as the discriminator**, since loredex vaults are project-partitioned. Never silently pick one.
- Hover preview with `Cmd`-hover in reading view, automatic in search results and the handoff reading-order list. Render the preview, don't excerpt raw markdown.
- Treat unresolved links as a *diagnostic* (badge + "did you mean" candidates), never as note creation.
- Persona: the reader is the one surface **both** personas share; hover preview is disproportionately valuable to the PM, who reads reading-order chains without wanting to navigate.

---

## 2. Handoff inbox + outbox — Linear's Inbox and Triage

Linear splits "things demanding my attention" into two different surfaces, and the distinction maps almost one-to-one onto loredex handoffs.

### Inbox (personal, subscription-driven)

Linear's Inbox collects notifications for "key events on your subscribed issues" — you're auto-subscribed when you create, are assigned, or are mentioned ([Inbox — Linear Docs](https://linear.app/docs/inbox)). Key mechanics:

- **Read ≠ delete ≠ unsubscribe** — three separate verbs. Mark-read (`U`) hides visually but keeps the subscription; delete (`Backspace`) removes the entry; unsubscribe (`Shift+S`) severs the relationship. Loredex's "consumed" conflates all three today (F1: "consumed is a read receipt, not an outcome").
- **Snooze (`H`)** hides an item until a chosen time *or until new activity* — the "or new activity" clause is the clever part and directly serves loredex's "waiting on upstream" case.
- Full keyboard loop: `G I` to enter, `J/K` to move, `Option+U` mark-all-read, `Shift+Backspace` delete-all-read. An inbox you can empty in ten keystrokes is what makes it a habit.

### Triage (team-level, gated intake)

"Triage is a special inbox for your team": issues arriving from outside the team (integrations, other teams) land there for review "before they are added to your team's workflow" ([Triage — Linear Docs](https://linear.app/docs/triage)). The review flow is number-key fast: **Accept (`1`) / Merge duplicate (`2`) / Decline (`3`, with reason) / Snooze (`H`)**, and *triage responsibility* designates who gets notified (with rotation support via PagerDuty et al.).

This is the missing loredex vocabulary. An inbound handoff from another project is exactly a triage item: it was created by someone outside your team and needs an explicit accept/decline before it's "your work." Linear's accept/decline/duplicate triad is a proven, minimal lifecycle extension beyond open/consumed — and decline-with-reason is verbatim what the feature spec asks for.

### Peek and batch patterns

`Space` peeks into an issue without leaving the list; multi-select + `Cmd+K` applies one action to many ([Select issues — Linear Docs](https://linear.app/docs/select-issues)). Notifications are processable project-by-project with snooze for deferral ([Linear's delightful patterns — Gunpowder Labs, Dec 2024](https://gunpowderlabs.com/2024/12/22/linear-delightful-patterns)).

**Steal this (F1 — sender blindness, the most-reported friction; F3 — request threading):**
- Two lanes, two semantics. **Inbox** = inbound handoffs to your project (triage semantics: accept `1` / decline `3` with reason / snooze `H`). **Outbox** = handoffs you sent, with live status chips — the outbox *is* the sender-visibility fix; Linear has no equivalent because assignment covers it, so the outbox is loredex's own invention wearing Linear's list anatomy (status chip, age, avatar, one-line objective).
- Keep read-state separate from lifecycle state. "I've seen this handoff" (per-user, app-side) must not mutate the vault; "accepted/declined/consumed" (team-visible) belongs in frontmatter. This cleanly answers open product question #2's read-state half.
- `Space` = peek the rendered brief in a side panel without leaving the inbox; `Enter` = open fully. `J/K` navigation. Empty-inbox state is a first-class goal.
- Snooze-until-activity for "waiting on upstream note to change" (the keep-alive-ping case in F10).
- Persona: the number-key triage loop is for engineers; the PM gets the same lists unfiltered ("all projects") — Linear proves one component serves both if filtering is a view concern, not a data concern.

---

## 3. Keyboard-first + command palette — Linear and Raycast

Linear's stated philosophy is **redundant paths to every action**: buttons, single-letter contextual shortcuts (`A` assign, `S` status, `P` priority on the selected item), right-click contextual menus, and the `Cmd+K` command menu all reach the same actions — "contextual menus are also a great tool for onboarding and teaching people how to use our popular keyboard shortcuts," because every menu row displays its shortcut ([Invisible details — Linear](https://linear.app/now/invisible-details)). The command menu is *contextual*: opened while a handoff is selected, it ranks actions on that handoff first ([Contextual command menu — Linear changelog, 2019](https://linear.app/changelog/2019-10-07-contextual-command-menu)). Navigation is `G`-then-letter chords (`G I` inbox, `G T` triage).

Two implementation details worth copying literally:
- Linear's submenu "safe triangle": a `clip-path` polygon hitbox between cursor and submenu so diagonal mouse travel doesn't close the submenu (~40 lines of React, per the Invisible details post).
- Command-K bars are by now a settled genre with known anatomy — fuzzy match, recent-first ranking, shortcut hints inline ([Command K Bars — Maggie Appleton](https://maggieappleton.com/command-bar)).

Raycast's contribution is *scope*: its palette fronts the whole OS, which loredex doesn't need — but its rule that **everything in the palette is also a first-class command with an assignable shortcut** is the discipline that keeps a palette from becoming a junk drawer.

**Steal this:**
- `Cmd+K` palette from day one, contextual to selection, every row showing its shortcut. Actions: open handoff, consume/accept/decline, search vault, re-curate, sync now, copy vault path, switch project.
- `G`-chords for the five MVP surfaces (Inbox, Outbox, Reader/Search, Sync, Activity).
- Single-letter actions on the selected handoff mirroring Linear triage (`1/2/3/H`, `U` read-toggle).
- Persona split: this whole section is the engineer persona's love language; the PM needs the *same actions as visible buttons* — Linear's redundancy principle says build both from one action registry, never two codepaths.

---

## 4. Sync-health indicators — GitHub Desktop

GitHub Desktop's repository bar is the canonical answer to "make git state legible without hiding git." The team explicitly killed the old combined "Sync" button because it created anxiety and ambiguity, replacing it with a **contextual button state machine** ([desktop/desktop#598](https://github.com/desktop/desktop/issues/598)):

- **Fetch origin** when in sync — with a persistent **"Last fetched N minutes ago"** subtitle communicating that background fetch is running.
- **Pull origin** with a ↓ badge and count when behind; **Push origin** with a ↑ badge and count when ahead.
- **Diverged**: pull first; after the merge, Desktop deliberately does *not* auto-push the merge commit — "we'll leave that action to the user."
- Merge conflicts are warned about **above the button, before the action** — you can't merge until resolved ([Syncing your branch — GitHub Docs](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop)).
- The redesign **uses real git terminology on purpose** so errors are searchable and users graduate to understanding, not away from it.

**Steal this (F5 — sync is a black box; F7/F8 — silent rollout failures):**
- One always-visible sync widget in the app chrome: vault name + branch (this doubles as the F6 **vault identity badge**), ahead ↑n / behind ↓n counts, last-pulled timestamp, and a state-contextual primary action (Pull / Push / Synced).
- Loredex's `sync` auto-pushes today, so unlike Desktop the default stays automatic — but adopt Desktop's *transparency*: before/after counts, and a click-through showing exactly which commits a sync will move (the spec's "sync transparency" should-have).
- Surface git *warnings* (stderr) as first-class health items — Desktop's "warn above the button" placement would have caught the F8 gitattributes bug on day one.
- Never auto-resolve divergence silently; show it as a state needing one explicit click, with real git words in the explanation.
- Persona: engineers get git vocabulary; the PM-facing summary is a single traffic-light ("Vault healthy · synced 2m ago") that expands into the engineer view — same data, two densities.

---

## 5. Activity feed derived from git history — GitHub Desktop's History tab

Desktop's History tab renders each commit as a row: **message, relative timestamp, author name + avatar (resolved by commit email), short SHA**; selecting a row opens a detail pane with per-file diffs; ranges are multi-selectable ([Viewing branch history — GitHub Docs](https://docs.github.com/en/desktop/making-changes-in-a-branch/viewing-the-branch-history-in-github-desktop)). One documented UX failure to avoid: relative-only dates degrade ("everything says 'last month'"), and finding a specific commit is hard without search/filter ([desktop/desktop#20077](https://github.com/desktop/desktop/issues/20077)).

Loredex is better positioned than Desktop here: vault auto-commits are *machine-generated with known shapes* (route, consume, handoff, curate, sync), so the feed can be **typed events, not raw commits**.

**Steal this (activity feed = MVP pillar 5, "the data already exists"):**
- Parse vault git log into typed rows: icon per event kind, actor (avatar from commit email — which makes the spec's managed-identity profiles load-bearing, since F7 says attribution is currently whatever each machine's git config says), verb phrase ("routed streaming-design.md → ai-engine"), relative time *with absolute on hover and day-group headers*.
- Row click = Desktop's detail pane: the underlying commit's file diff, rendered as markdown diff where applicable.
- Filters by project / event kind / person; this filtered feed *is* the PM's standup surface.
- Persona: PM-first feature; engineers touch it mainly via "what did sync just sweep" — deep-link from the sync widget's per-commit view into the same feed component.

---

## 6. First-run "create or join" wizard — Obsidian + GitHub Desktop

Obsidian's first-run **Vault profile** succeeds because it offers exactly two verbs — *Create new vault* and *Open folder as vault* — and because opening a folder requires zero import or conversion ([Manage vaults — Obsidian Help](https://help.obsidian.md/manage-vaults)). GitHub Desktop's equivalent adds the third verb loredex needs: *Clone a repository*, fronted by OAuth so the repo list is *yours* to pick from rather than a URL to paste.

The simulation's addendum showed a fresh clone of the vault repo is "a dead vault until someone hand-writes config.json" (F7) — so the join flow is clone **plus** registration, which is exactly what a wizard must fuse into one step.

**Steal this (F7 — the 12-engineer rollout fails on day one without this):**
- Three-tile first run: **Create team vault** (name → GitHub OAuth → create private repo, canonical `main`, initial push — closing the master/main trap by construction) / **Join team vault** (pick from your GitHub repos or paste an invite link that encodes remote + branch + registry; clone; write config) / **Open local vault** (Obsidian's folder-as-vault, for solo/offline).
- Then a repo-registration step: scan a parent folder, checkbox the repos to register (the spec's batch-register), and offer "commit the wiring files" (the F7 untracked-files fix).
- Obsidian's vault switcher pattern (list, remove-never-deletes) for people on multiple vaults — which is also the structural fix for F6's split-brain: the app is the single place vault selection happens.
- Persona: this flow is DevOps-persona-critical and everyone-persona-touched; optimize for the *joiner* (11 of 12 engineers), not the creator.

---

## 7. Menu-bar extra with badge count — Raycast, Things, Slack, Apple HIG

### Raycast's MenuBarExtra model

Raycast menu-bar commands are **not long-lived processes**: they're loaded on demand (icon click, scheduled `interval` like `"5m"`, root search), render icon + short title, then unload; cached state renders instantly on restart ([Menu Bar Commands — Raycast API](https://developers.raycast.com/api-reference/menu-bar-commands)). Structure is Items (icon, subtitle, shortcut, action) grouped in Sections with automatic separators, plus Submenus; guidance: keep titles short, return `null` to disappear entirely.

### Badge discipline — Things, Slack, Apple

- **Things 3** badges the dock icon with exactly one number: count of Today items — a deterministic, user-explainable count, never "unread stuff" ([Badge count — Things Support](https://culturedcode.com/things/support/articles/3340494/)).
- **Slack** distinguishes a **dot** (any unread activity) from a **red numeric badge** (mentions/DMs — things addressed to *you*) ([Guide to Slack notifications — Slack Help](https://slack.com/help/articles/360025446073-Guide-to-Slack-notifications)); its design team frames notifications as "inherently rude" intrusions governed by principles — intuitive, actionable, personal — with smart defaults doing the work because "less than 5% of users ever customize their notification settings" ([Layered product principles — Slack Design](https://slack.design/articles/how-we-layered-product-principles-to-refresh-slack-notifications/)).
- **Apple HIG**: badge = count of unread notifications only, never unrelated numbers; badging must never be the sole channel for essential information (users can disable it); and menu bar extras can be hidden or evicted by macOS, so don't rely on their presence ([HIG: Notifications — Apple](https://developer.apple.com/design/human-interface-guidelines/notifications)).

**Steal this (F1 — new-handoff notification, "the single highest-value feature" per the mobile persona):**
- Menu-bar extra showing an icon + badge count where the count is **exactly "open handoffs addressed to your projects"** — Things-style deterministic, not Slack-style unread soup. Dropdown: sections for Inbox (top 5, each row deep-links), Sync state line ("↑2 · pulled 3m ago"), and actions (Open Loredex, Sync now) with shortcuts shown Linear-style.
- Slack's dot-vs-number split adapted: numeric badge for handoffs *to you*; a mere dot for ambient activity (upstream note changed, teammate synced).
- Native notifications for handoff-received and sent-handoff-state-change, each with one action button (Peek / Open) per Slack's "actionable" principle; everything notified must also be findable in-app per HIG.
- Poll on a Raycast-style interval (the vault remote is just git — a 1–5 min fetch cadence) rather than keeping a heavy resident process.
- Persona: the menu-bar extra is the *engineer's* ambient surface (app closed, terminal open); the PM's equivalent ambient surface is the activity feed + badge on the dock icon.

---

## 8. Persona cheat-sheet

| Pattern | Keyboard-first engineer | PM |
|---|---|---|
| Wikilink reader + hover preview | Peek without navigation during implementation | Primary consumption surface; kills Obsidian dependency (F9) |
| Inbox triage keys (`1/2/3/H`, `J/K`, `Space`) | Core loop, must be empty-able in seconds | Uses buttons; needs the all-projects view (F5) |
| Outbox with status chips | "Fate of what I sent" (F1) | Critical-path overview across teams |
| `Cmd+K` + `G`-chords + shortcut hints in menus | Muscle memory; shortcut discovery via menus | Redundant buttons matter; palette optional |
| Sync widget (↑/↓, last-pulled, real git words) | Wants git vocabulary and per-commit detail | Wants a traffic light that expands |
| Git-derived activity feed | "What did sync just do" | Standup replacement; filter by project/person |
| Create-or-join wizard | Joins in one step | — (DevOps-adjacent) |
| Menu-bar badge + notifications | Ambient awareness while app is closed | Dock badge + daily digest tendency |

## 9. Recommendations (ranked)

1. **Adopt Linear's triage verbs as the handoff lifecycle extension** (accept/decline-with-reason/snooze on top of open/consumed) and keep per-user read-state app-side, team-visible state in frontmatter — this resolves the spec's open question #2 for the MVP scope.
2. **Build the sync widget as the vault identity badge** — one component answers F5, F6, and F8's surfacing needs, copying GitHub Desktop's state machine and "last fetched" subtitle verbatim.
3. **Implement Obsidian's link-resolution algorithm exactly**, plus project-aware disambiguation and diagnostics-not-creation for unresolved links.
4. **One action registry, three frontends** (buttons, shortcuts, Cmd+K) per Linear's redundancy principle — cheap if done from day one, expensive to retrofit.
5. **Badge = open inbound handoffs, nothing else** (Things/HIG discipline); dot for ambient activity (Slack split).
6. **Typed activity feed over raw git log**, with day headers and absolute-on-hover dates (learning from Desktop's #20077 complaint).

## Sources

- [Internal links — Obsidian Help](https://help.obsidian.md/links)
- [Page preview — Obsidian Help](https://help.obsidian.md/plugins/page-preview)
- [Manage vaults — Obsidian Help](https://help.obsidian.md/manage-vaults)
- [Inbox — Linear Docs](https://linear.app/docs/inbox)
- [Triage — Linear Docs](https://linear.app/docs/triage)
- [Select issues — Linear Docs](https://linear.app/docs/select-issues)
- [Invisible details: building contextual menus — Linear](https://linear.app/now/invisible-details)
- [Contextual command menu — Linear Changelog (2019-10-07)](https://linear.app/changelog/2019-10-07-contextual-command-menu)
- [Linear's delightful design patterns you should copy — Gunpowder Labs (2024-12-22)](https://gunpowderlabs.com/2024/12/22/linear-delightful-patterns)
- [Command K Bars — Maggie Appleton](https://maggieappleton.com/command-bar)
- [Syncing your branch in GitHub Desktop — GitHub Docs](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop)
- [Viewing the branch history in GitHub Desktop — GitHub Docs](https://docs.github.com/en/desktop/making-changes-in-a-branch/viewing-the-branch-history-in-github-desktop)
- [Push/pull button design discussion — desktop/desktop#598](https://github.com/desktop/desktop/issues/598)
- [Improve UX of searching for a specific commit — desktop/desktop#20077](https://github.com/desktop/desktop/issues/20077)
- [Menu Bar Commands — Raycast API Reference](https://developers.raycast.com/api-reference/menu-bar-commands)
- [How we layered product principles to refresh Slack notifications — Slack Design](https://slack.design/articles/how-we-layered-product-principles-to-refresh-slack-notifications/)
- [Guide to Slack notifications — Slack Help](https://slack.com/help/articles/360025446073-Guide-to-Slack-notifications)
- [Troubleshooting the badge count — Things Support (Cultured Code)](https://culturedcode.com/things/support/articles/3340494/)
- [Notifications — Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/notifications)
