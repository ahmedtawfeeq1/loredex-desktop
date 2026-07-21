# Backlog — future work

> **All items BL-1…BL-9 shipped in v0.9.5.** Kept as the record of what was
> wrong, why, and how each was fixed.

Small, well-scoped UX fixes captured from real use. Nothing here is scheduled;
pick them up in any order. Each item states the symptom, the cause (with
file:line), what "done" looks like, and the screenshot it came from.

Status legend: `open` · `in progress` · `done`

---

## BL-1 — Chat: drop the composer action strip; make the header "New conversation" obvious

**Status:** done (v0.9.5) · **Area:** agent panel · **Size:** S

**Symptom.** A `＋ New conversation` / `↻ Retry` strip sits directly above the
composer. It duplicates the header `＋` icon, and **Retry isn't wanted at all** —
re-sending the last turn is not a control worth the space.

**Cause / where.**
- The strip: `src/renderer/src/agent/AgentPanel.tsx` ~773–795 (`＋ New conversation`, `↻ Retry`, gated on `canRetry` at :481).
- The header twin: same file ~652–653 — the `＋` icon already carries
  `title="New conversation (vault root)"`.

**Done when.**
- The strip above the composer is gone (both buttons, and `canRetry`/`retryText`
  if nothing else uses them).
- The header `＋` is unmistakably "new conversation": hovering it reads
  **New conversation**, and it's visually distinct from the neighbouring
  history/pop-out icons.
- Starting a fresh conversation is still one click, discoverable without hunting.

**Reference.** Screenshots: the strip above the composer; the header icon row
(`AGENT · All · Claude · Codex · Gemini · 🕘 ＋ ⧉ ›`).

---

## BL-2 — Chat: keep the composer usable while the agent is responding

**Status:** done (v0.9.5) · **Area:** agent panel · **Size:** S–M

**Symptom.** While the agent is generating, the whole composer is inert — you
can't type the next message, paste, edit, or attach anything. You have to wait
for the turn to finish before you can even start writing.

**Cause / where.** `src/renderer/src/agent/AgentPanel.tsx` — `canSend` gates far
more than sending:
- `:826` the `<textarea>` — `disabled={!canSend}`
- `:815` the attach (`⊕`) button — `disabled={!canSend}`
- `:876` the Send button — `disabled={!canSend || !hasContent}` ← **this one is correct**

**Done when.**
- While a turn is in flight you can **type, edit, select, copy/paste, and attach
  images/files**; the draft persists (the store already holds `draft`).
- **Only sending** is blocked — Send is disabled (or, better, becomes **Stop**
  for the active turn) and re-enables the moment the turn ends.
- Pressing ↵ mid-response does not silently drop the text (either queue it or
  no-op with the draft intact).

---

## BL-3 — Chat: pin the code-block Copy button (stop it scrolling with the code)

**Status:** done (v0.9.5) · **Area:** agent panel / markdown · **Size:** S

**Symptom.** In a fenced code / JSON block, the hover **Copy** button drifts
across the code as you scroll the block horizontally — it ends up floating in
the middle of the content instead of staying in the corner.

**Cause / where.** The button is absolutely positioned *inside* the element that
scrolls:
- `src/renderer/src/agent/agentMarkdown.tsx` ~46–49 — the custom `<pre>` renders
  `<button class="agent-copy-code">` as a child of the `<pre>`.
- `src/renderer/src/styles.css` — `.agent-md pre` (~8508) is
  `position: relative` **and** the horizontal scroll container;
  `.agent-copy-code` (~8375) is `position: absolute; right: 4px`.
  Absolute positioning resolves against the *scrolled* padding box, so the
  button translates with the content.

**Done when.**
- Copy stays visually pinned to the **top-right of the visible code box** at any
  horizontal scroll offset.
- Fix by anchoring it outside the scroller — wrap the `<pre>` in a
  non-scrolling `position: relative` container and render the button there (or
  make the button `position: sticky`). Don't just bump `right`.
- Still hover/focus-revealed, still copies the **full** code (not the visible
  slice), and doesn't overlap the first line of code or the scrollbar.

**Reference.** Screenshot: `Copy` sitting mid-content over a horizontally
scrolled `"mcpServers":{"loredex":{"type":"http",…}` line.

---

## BL-4 — Terminal: collapse header actions into an overflow menu at narrow widths

**Status:** done (v0.9.5) · **Area:** terminal · **Size:** M

**Symptom.** With the terminal docked **left**, narrowing the pane makes its
header actions (`dock ▾ · pop ↖ · split ▸ · split ▾ · close`) run past the pane
and **overlap the Loredex logo / app chrome**. They neither wrap nor truncate —
they just collide.

**Cause / where.** `src/renderer/src/terminal/TerminalDrawer.tsx` ~116–181 — the
action row is laid out inline with no width breakpoint and no overflow
behaviour, so at small widths it overflows its container.

**Done when.**
- Narrowing the terminal **never** overlaps the logo or any app chrome.
- Below a width threshold the actions collapse into a single **hamburger (☰)**
  button that opens a menu containing *every* action (dock target, pop out,
  split right, split down, close) — the mobile-nav pattern.
- Above the threshold the inline buttons return unchanged.
- The menu is keyboard reachable (focusable trigger, Esc closes, arrow/tab
  through items) and the actions keep their current labels/behaviour.
- Applies to the left dock at minimum; check the bottom dock doesn't regress.

**Reference.** Screenshot: `TERMINAL  dock ▾  pop ↖  split ▸  split ▾  close`
running over the app's logo strip.

---

## BL-5 — Switching provider must keep the session's working directory (MCP breaks today)

**Status:** done (v0.9.5) · **Area:** agent panel / core · **Size:** M · **Priority:** high

**Symptom.** Start a chat scoped to a client (e.g. `projects/arabicss`), then
**CONTINUE IN → Codex** (or Gemini). The new session comes up at the **vault
root**, so that client's `.mcp.json` never loads and its MCP tools are gone —
the agent reports *"Genudo MCP is not callable in this current root session.
Current root `/clients_work/.mcp.json` only has loredex."* The connector exists
at `projects/arabicss/.mcp.json`, but the session wasn't started there, and MCP
is discovered **at startup** — `cd`-ing mid-session does not hot-load it.

**Cause / where.**
- `src/core/handlers.ts:981` — the `agent.continue` handler **hardcodes**
  `cwd: engine.getConfig().vaultPath`. The original folder is never consulted.
- `src/core/agent-conversations.ts` / `src/core/db/index.ts` — the conversation
  row persists `client_slug` but there is **no `cwd` column**, so continuation
  has nothing to restore even if the handler wanted to.
- All three continuation paths funnel through `startContinuation` →
  `agent.continue` → `acpContinue`, so reopen-from-history and pop-out inherit
  the same bug, not just provider switch.

**Extra wrinkle (honesty).** The `◈ <client>` chip *is* carried across
continuation now, so a continued session currently **displays a client scope it
doesn't actually have**. Fixing the cwd makes the chip truthful again; until
then the chip over-promises.

**Also reproduces on pop-out — and looks like a *different* bug.** Popping a
client-scoped chat into its own window loses the client's MCP while `loredex`
keeps working, which reads as "MCP partially died". It isn't: the two servers
arrive by different routes.

| Server | Delivery | Survives pop-out? |
|---|---|---|
| `loredex` | **Injected** by the app at spawn as a runtime HTTP server (`core/acp.ts:478–505`); in a secondary window it falls back to `readDiscovery()` and connects to the **main window's** host | ✅ by design |
| a client's server (e.g. `genudo`) | **File-registered** in `projects/<client>/.mcp.json`, discovered by the adapter **from the cwd at startup** | ❌ cwd is the vault root |

Pop-out path: `resumeConversation` (`stores/agentPanel.ts:684`) → `startContinuation`
→ `agent.continue` → the hardcoded vault-root cwd above. So the popped-out
session never had the client's server — the agent correctly reports
*"Current root `.mcp.json` only has loredex"*. Restoring the cwd fixes pop-out,
reopen-from-history, and provider switch in one change; no separate pop-out MCP
work is needed.

**Done when.**
- The conversation persists its working directory (new **additive, nullable**
  `cwd` column — next free migration index; `client_slug` already took one).
  `acpStart` already receives `arg.cwd`, so `createConversation` can record it.
- `acpContinue` restores that cwd instead of the vault root, so the switched-to
  provider spawns in the **same folder** and picks up the same `.mcp.json`.
- **Ask, don't assume.** Switching provider (CONTINUE IN → Codex/Gemini) prompts
  *where* to start the new session: **"Same folder (`projects/<client>`)"** —
  the default — or **"Vault root"**. Only show the prompt when the current
  session's cwd isn't already the vault root (otherwise there's no choice to
  make). Remembering the answer for the session is fine; a "don't ask again"
  preference is optional.
- Fallback order for older rows with no stored cwd:
  `cwd` → derive from `client_slug` (`<vault>/projects/<slug>`) → vault root.
- Guard it: if the stored directory no longer exists, fall back rather than
  failing the switch (`acpStart` already throws `ACP_CWD_INVALID` on a bad dir).
- Applies to **provider switch, reopen-from-history, and pop-out** alike.
- Verify: start at `projects/<client>`, confirm its MCP tools; switch provider;
  the new session lists the **same** MCP servers and the chip is accurate.

**Reference.** Screenshot: Codex session reporting root `.mcp.json` has only
`loredex`, with the arabicss connector sitting unused at
`projects/arabicss/.mcp.json`.

---

## BL-6 — "Chat Here" should ask which provider (it silently picks Claude)

**Status:** done (v0.9.5) · **Area:** clients / agent panel · **Size:** S

**Symptom.** On a client page, **Chat Here** always opens Claude Code. There's no
way to start that client-scoped session on Codex or Gemini without opening
Claude first and then switching provider (which today also loses the folder —
see BL-5).

**Cause / where.**
- `src/renderer/src/views/clients/ClientPage.tsx:398` — `chatHere()` calls
  `openHere(dir)` with no provider argument.
- `src/renderer/src/stores/agentPanel.ts` — `openHere` takes the provider from
  `get().agent` (the panel's current selection), which defaults to `'claude'`
  (store default at `:535`). So the button inherits panel state the user never
  consciously set.

**Done when.**
- **Chat Here** asks which provider to start — Claude / Codex / Gemini — before
  opening, rather than inheriting the panel's current agent.
- The picker reflects reality: show each provider's availability/auth state the
  way the panel's provider chips already do, so an unauthenticated or
  not-installed provider is obvious *before* starting (a missing binary
  otherwise fails later as an ENOENT spawn error).
- `openHere` accepts an explicit provider (optional arg, falling back to
  `get().agent`) so the existing `+` / ⌘K entry points are unchanged.
- Same courtesy as BL-5: remembering the last choice is fine; don't force the
  prompt when there's only one usable provider.

**Shared with BL-5.** Both items are "ask before starting a session" — BL-5 asks
*where*, BL-6 asks *which*. Build one small start-session prompt that can carry
both questions instead of two separate dialogs.

---

## BL-7 — Chat: collapse the header chrome to 3 lines (it eats the thread)

**Status:** done (v0.9.5) · **Area:** agent panel · **Size:** M

**Symptom.** Before a single message is visible the panel stacks **five** rows of
chrome — provider chips, a pop-out notice, the session row, CONTINUE IN, the
context meter, and the SESSION summary. On a short window that's most of the
panel; the actual conversation is squeezed into what's left.

**Cause / where.** `src/renderer/src/agent/AgentPanel.tsx:686–699` renders them
as independent stacked rows, none of which collapse together:

| Row | Element | Wanted |
|---|---|---|
| provider chips + 🕘 ＋ ⧉ › | panel header | **stays visible** |
| `⧉ Popped-out window — using the main window's loredex MCP server.` | `.agent-popout-note` (:686) | collapse |
| `[CC] <title>` · `◈ arabicss` · `● ready` · `×` | `.agent-sessions` → `SessionRow` (:691) | collapse |
| `CONTINUE IN [CX] Codex [GM] Gemini` | `<ContinueControl>` (:697) | collapse |
| `▪ CONTEXT ▬▬ 50,879 / 1,000,000 5%` | `<UsageBar>` (:698) | **stays visible** |
| `▸ SESSION Manual · 142 commands · 1 MCP` | `<SessionInfoPanel>` (:699) | **stays visible** (already a collapsed disclosure) |

**Done when.**
- Default chrome is **three lines**: (1) provider chips, (2) CONTEXT, (3) the
  session/tools/MCP summary line.
- The pop-out notice, session row, and CONTINUE IN collapse into **one**
  disclosure line that expands to show all of them (and their actions).
- **Nothing meaningful is lost while collapsed.** The session row currently
  carries the `◈ <client>` chip, the `● ready`/error state, and the close `×` —
  surface those in the collapsed summary (a compact `◈ arabicss · ready ×` is
  enough) rather than hiding state the user needs to see at a glance.
- CONTINUE IN stays reachable in one click from the collapsed state (it's an
  action, not just info — a button/menu is fine).
- The pop-out notice is one-time information; an icon + tooltip is enough, it
  doesn't need a full row.
- Collapsed/expanded preference persists per panel (same treatment
  `SessionInfoPanel` already gets).

**Reference.** Screenshot: five chrome rows above the first message, with the
thread starting barely a third of the way down the window.

---

## BL-10 — Chat: let the composer be made taller

**Status:** done (v0.9.6) · **Area:** agent panel · **Size:** S

**Symptom.** The composer is a ~2-line peephole. A long typed/dictated/pasted
message scrolls inside a tiny box with no way to enlarge it.

**Cause / where.**
- `src/renderer/src/styles.css` — `.agent-input-field` had `resize: none`, so the
  native drag handle was suppressed.
- `src/renderer/src/agent/AgentPanel.tsx` — `rows={Math.min(6, …)}` auto-grew by
  **newline count only**, so wrapped (dictated/pasted) text never grew the box.

**Fixed by.** `resize: vertical` (native drag handle at the **bottom-right**) with
a `max-height: 45vh` cap so it can't swallow the thread, and the auto-grow cap
raised 6 → 12 rows. Auto-grow applies until you set a height by hand; after that
your inline height wins.

---

## BL-11 — In-app update check

**Status:** done (v0.9.7) · **Area:** top bar · **Size:** S

**Why not a real auto-updater.** electron-updater/Squirrel.Mac requires a
**code-signed** bundle; these builds are unsigned, so auto-update would silently
fail on macOS — the primary platform. Shipping that is worse than nothing.

**Shipped.** `stores/updateCheck.ts` asks the GitHub releases API for the latest
tag once per launch, compares it to `__APP_VERSION__`, and shows a dismissible
top-bar pill linking to the download. Read-only, best-effort — any
network/API/rate-limit failure shows nothing. Version compare is **numeric**
(`0.9.10 > 0.9.9`) and treats a release as newer than its own pre-release, never
the reverse.

---

## BL-12 — Elapsed time on pending/running tools

**Status:** done (v0.9.7) · **Area:** agent panel · **Size:** S

**Symptom.** A tool row sat on `· pending` with no way to tell *working* from
*stuck*.

**Shipped.** Tool rows record `startedAt`; a non-terminal row shows a live
counter (`12s` → `4m 05s` → `1h 02m`), ticking once a second and only while in
flight. Terminal rows cost no timer.

---

## BL-13 — Permission modal: diff room, expand, and the toggle on the decision line

**Status:** done (v0.9.7) · **Area:** agent panel · **Size:** S

**Symptom.** The proposed diff — the thing you're actually judging — was a small
capped box; the *always allow* checkbox floated in its own centered row above the
buttons; there was no way to see the whole diff.

**Shipped.** Modal widened to `min(920px, 92vw)`; diff preview raised to `60vh`
with an **expand/collapse** toggle that lifts the cap entirely; the always-allow
toggle now rides the footer beside Allow/Reject.

---

## BL-14 — Tool rows showed output but never the input

**Status:** done (v0.9.7) · **Area:** agent panel / core · **Size:** S

**Symptom.** A tool row showed what came back but never what the tool was *asked*
to do.

**Cause.** ACP has always sent `ToolCall.rawInput` — `mapUpdate` in
`src/core/acp.ts` simply never read it, so the input was dropped at the core
seam and could not reach the UI.

**Shipped.** `mapToolInput` serializes `rawInput` (length-capped at 4000 chars),
it rides the `acp.tool` event and sparse-merges like every other field, and the
expanded row renders **Input** / **Output** sections. A tool with input but no
output yet is now expandable too.

---

## BL-15 — Arabic (and any non-ASCII) tool output rendered as `\uXXXX`

**Status:** done (v0.9.7) · **Area:** agent panel · **Size:** S

**Symptom.** Arabic in a tool result displayed as
`خاصية` instead of `خاصية`.

**Cause — not ours.** MCP servers commonly serialize with Python's
`json.dumps`, whose **`ensure_ascii=True` default** escapes every non-ASCII
character. We received escaped text and rendered it faithfully.

**Shipped.** Tool text that parses as JSON is round-tripped through
`JSON.parse` → `JSON.stringify` — JS does *not* escape non-ASCII on output, so
the escapes decode to real characters (and it pretty-prints as a bonus).
Non-JSON output is passed through untouched. Text blocks also carry `dir="auto"`
so RTL scripts lay out correctly.

---

## BL-16 — No way to open a note the agent just created/updated

**Status:** done (v0.9.8) · **Area:** agent panel → reader · **Size:** S

**Symptom.** The chat says a note was written, but there is no button to open
it. Clicking a file ref inside an expanded tool row from the Clients or Atlas
view appeared to do *nothing*.

**Cause — two.** (1) Openable refs lived only in the *expanded* tool body, so a
collapsed row gave no affordance at all. (2) `openFileRef` loaded the note into
the reader store but never switched the view — off the Reader tab the note
loaded invisibly behind whatever was on screen.

**Shipped.** Markdown refs now render as `↗ <name>` buttons on the tool line
itself (`stopPropagation` so they don't toggle the row), and `openFileRef` calls
`setView('reader')` before `open(rel)`. Non-markdown refs stay in the expanded
body — there is no reader view for them.

---

## BL-17 — Note metadata rail expanded by default

**Status:** done (v0.9.8) · **Area:** reader · **Size:** XS

**Symptom.** Every note opened with the right-hand metadata panel expanded,
pushing the prose narrow before you had read a word.

**Shipped.** `useMetaRail` defaults to `collapsed: true`. The rail is one click
away and its collapsed state still persists per the existing rails setting.

---

## BL-18 — Pop a note out into its own window

**Status:** done (v0.9.8) · **Area:** reader · **Size:** M

**Ask.** The same `⧉` pop-out chat and the terminal already have, on a note —
so a reference note can sit beside the app instead of inside it.

**Shipped.** `PopoutMode` widened to `'chat' | 'terminal' | 'note'`; a new
`loredex:open-note-window` main handler forks a window in `note` mode and sends
it the path once loaded. The window mounts the reader surface alone (no shell,
no rails). The path can arrive before the core host is brokered, so it is held
in a ref and opened on `status === 'ready'`. The `⧉ Pop out` button hides
inside a pop-out (`popoutMode() === null`) — no pop-outs of pop-outs.

`popoutMode()` also gained a `typeof window === 'undefined'` guard: BL-18 put it
on a render path, and the design-fidelity tests render in the node env.

---

## BL-19 — Review before/after for a note that changed

**Status:** done (v0.9.8) · **Area:** reader · **Size:** M

**Ask.** The contract timeline gives an API change a two-column before/after.
A note an agent just rewrote deserves the same read, on the note itself.

**Shipped.** `engine.noteDiff(path)` reads the last two commits touching the
note (`git log -2` + `git show <prev>:<rel>`) and returns
`{rel, oldText, newText, sha, subject, when}` — `oldText` null when the head
commit *created* the note. Exposed as the read-only `note.diff` channel, held by
a `useNoteDiff` store (opening the same note twice toggles it closed; a slow
read for note A is dropped if note B was opened meanwhile), and rendered by
`NoteChangesPanel` under the mode bar in **both** read and edit mode, reusing
the `.tool-diff` two-column shape. `dir="auto"` on both columns so RTL notes
read correctly.

It is plain git history, so it works identically on research and agent-ops
dexes — no `requireAgentOps` guard needed, and nothing is written.

---

## BL-20 — "Chat Here" does nothing after the first time

**Status:** done (v0.9.9) · **Area:** clients → agent panel · **Size:** S

**Symptom.** Chat Here works once. After that, pressing it opens the provider
picker, and picking any provider just collapses the picker — no chat, no error,
no clue.

**Cause.** Two silent `catch {}` blocks over the only failing step. `acp.start`
throws `agent session limit reached (4)` once four sessions are alive, and
`openHere` swallowed it ("the panel stays open" was the intent). `chatHere` in
ClientPage swallowed its own rewire/dirAbs failures the same way. Nothing ever
reached the user, so a hit cap was indistinguishable from a dead button.

**Shipped.** Both catches now push a toast naming the actual failure, with
"close a session and try again" appended when it is the cap. The cap itself went
**4 → 8**: it is per core host, and a fleet operator with several clients in
flight hits four quickly. (Pop-outs fork their own host, so each gets its own
budget of 8.)

---

## BL-21 — The second pop-out has no loredex MCP

**Status:** done (v0.9.9) · **Area:** MCP host · **Size:** S

**Symptom.** Pop out a conversation: MCP tools work. Pop out another one: no MCP.

**Cause.** The MCP host binds one fixed port. The first window's core wins it and
writes `~/.loredex/desktop.json`; a pop-out's core loses the bind and instead
reads that file to reach the winner's host. But `stopMcpServer` called
`removeDiscovery` **unconditionally** — including on a core that never bound and
therefore never wrote it. So closing any pop-out deleted the *main window's*
discovery file, and every pop-out opened afterwards found nothing to connect to.

**Shipped.** The removal is guarded on having actually bound: a host that never
listened never wrote the file, so it is not that host's to delete. Regression
test drives a losing boot + shutdown and asserts the winner's file is byte-identical
afterwards (it fails without the guard).

**Still open.** Closing the MAIN window while pop-outs are alive correctly removes
the file, so those pop-outs lose MCP on their next session start. Fixing that
properly means brokering the port rather than first-come-first-served — deferred.

---

## BL-22 — Saved client credentials disappear (Windows)

**Status:** done (v0.9.9) · **Area:** clients → credentials · **Size:** M

**Symptom.** Add a credential, open another client, come back — it is gone.
Reported on Windows; macOS unaffected.

**Cause — a read-modify-write over a read that lies.** `readEncMap` returned `{}`
for BOTH "no file" and "file present but would not decrypt". Every writer in the
store is read-modify-write, so a single failed decrypt made the map look empty
and the next save **overwrote the real encrypted contents** with one entry. The
key is `scrypt(hostname + username)`, so a machine rename or a roamed Windows
profile is enough to trigger it. macOS escaped the worst of it because secrets
go to the Keychain there — only the metadata index shared the file.

**Shipped, two parts.**
1. `readEncMap` now distinguishes the two cases: absent → `{}`, present but
   undecryptable → **throws**, naming the file and saying nothing was
   overwritten. Loud beats silent loss.
2. The metadata index (label, username, url, note — **never** a secret) moved out
   of that file into **app.db**, the same durable SQLite store every other
   setting uses. It was never secret, so it never needed the fragile crypto.
   Reads fall back to the old file when no db is open, and adopt a pre-BL-22
   file's entries on first touch, so existing credentials migrate forward.

Only the secret still needs platform crypto: Keychain on macOS, the encrypted
file elsewhere.

---

## BL-23 — Identity looks unsaved on every app open, and blocks editing

**Status:** done (v0.9.10) · **Area:** settings / reader · **Size:** S

**Symptom.** Open the app, open a note, try to edit — "Editing needs an
identity", Save disabled. Go to Settings and the identity is *right there*,
filled in. Save it again and editing works. Every launch, again.

**Cause.** The identity persists perfectly (`app.db`, via `saveIdentityProfile`).
It was just never **loaded at boot**. `useIdentity.load()` had exactly three call
sites — the Settings form, the create-vault wizard, and the Inbox — so a launch
straight into the Reader left the store at its initial `profile: null,
ambient: null`. Editing gates on that store, so it refused. Visiting Settings
ran the load as a side effect of rendering the form, which is why re-saving
"fixed" it and why the value always looked present once you went looking.

A second, smaller edge rode along: `loaded` starts `false`, and a null profile
before the load has run means *"not known yet"*, not *"none saved"*. The editor
treated both as "none" and printed the error during the async load even once the
boot call existed.

**Shipped.**
1. `useIdentity.load()` joins the boot effect in `App.tsx`, next to the dex,
   rails, terminal and agent-panel loads — and re-runs on vault change, since
   the ambient git identity is per-repo.
2. `identityLoaded` rides down to `NoteEditor` as a prop (matching the file's
   "store state rides down as props" rule, which keeps it statically testable).
   The "needs an identity" message only appears once the load has finished and
   genuinely found none. Save's `disabled` is unchanged — it already keys off the
   effective identity prop, and gating it on the load flag only made it dead.

Two regression tests cover both directions of the flag.

---

## BL-24 — Per-client MCP never worked on Windows

**Status:** done (v0.9.11) · **Area:** ACP adapter spawn · **Size:** M

**Symptom.** Multiple pop-outs, each carrying its own client's MCP, works on
macOS. On Windows the client's MCP servers are not there.

**Cause — a POSIX-only env allowlist.** `adapterEnv` is deliberately the opposite
of a full inherit (least privilege: a Codex adapter must never see
`ANTHROPIC_API_KEY`), so anything not listed simply does not reach the adapter.
The shared list was `HOME, PATH, USER, LOGNAME, SHELL, TMPDIR, LANG` — and on
Windows **none of those exist except PATH**.

The consequence lands squarely on client MCP. A client `.mcp.json` server is
typically `{"command": "npx", …}`, and the adapter spawns that child with the env
*it* received. On Windows that child needs `PATHEXT` to resolve `npx.cmd` at all,
plus `ComSpec`, `SystemRoot`/`windir`, and `APPDATA`/`LOCALAPPDATA` for npm's own
config. None were forwarded, so the MCP server never spawned. `USERPROFILE` was
missing too — that is what `HOME` names on POSIX, i.e. how the adapter finds
`~\.claude` / `~\.codex` credentials.

**Note this was never pop-out-specific.** The loredex MCP is an HTTP server we
inject by URL, so it needs no env and worked on Windows in both window kinds.
It is the *client's* npx-spawned servers that failed — in the main window too.

**Shipped.** `sharedEnvKeys(platform)` returns the POSIX set unchanged on
darwin/linux and a Windows set on win32. Tests assert the Windows set carries the
credential root and every key npx needs, that the POSIX names are absent from it,
and that the POSIX set is byte-for-byte what it was.

**Unverified on Windows.** Reasoned from the code and covered by tests; not
reproduced on a Windows machine.

---

## BL-25 — The composer can only grow downward, into the panel edge

**Status:** done (v0.9.11) · **Area:** agent panel · **Size:** S

**Symptom.** BL-10 made the message box resizable, but the grip is at the
bottom-right and drags *down* — and the composer is pinned to the bottom of the
panel, so there is no room below to grow into.

**Cause.** BL-10 used the browser's native `resize: vertical`. That grip's
corner and direction are not stylable — it is always bottom-right, always
downward.

**Shipped.** Native resize off; a real handle on the composer's **top** edge.
Dragging up grows the box upward, into the thread. `clampComposer` keeps it
between one line and 45% of the viewport (the ceiling `max-height: 45vh`
previously enforced), double-click resets to auto-grow. The grip is a
pseudo-element bar, not a gradient — the design-fidelity suite reserves gradients
for the cobalt button, and caught the first attempt.

---

## BL-26 — Vault-relative paths were computed POSIX-only

**Status:** done (v0.9.12) · **Area:** shared paths · **Size:** S

**Found while sweeping for BL-24**, not reported — but the same class, and it
touches several features on Windows.

**Cause.** `toVaultRelative` tested `absPath.startsWith(vaultPath + '/')`. On
Windows the separator is `\`, so the test never passed and the function returned
the **absolute path unchanged** for every in-vault note. Callers then either hand
that to git or run POSIX-shaped regexes over it. Two more sites derived the
relative path by hand with `resolved.slice(vault.length + 1)`, leaving `\`
separators that the `/^projects\/…/` and `/^(_archive\/)+/` patterns never match.

**What that broke on Windows:** the note before/after diff (BL-19) passed git an
absolute path; archive/unarchive failed to strip the prefix, so archiving twice
could nest `_archive/_archive/`; inline comments lost their project and filed
under the fallback topic.

**Shipped.** `toVaultRelative` compares on normalized copies (case-insensitively
when the input looks Windows-shaped, since drive-letter case varies) and returns
a forward-slash relative path — which is what git and every vault regex expect.
An out-of-vault path still returns **unchanged**: callers use `rel === abs` as
the "not in this vault" sentinel. Both hand-rolled slice sites now call it.

Tests cover Windows separators, drive-letter case, the out-of-vault sentinel, and
a shared-prefix sibling (`/vault-two` must not read as inside `/vault`).

**Unverified on Windows** — reasoned from the code, covered by tests.

---

## BL-28 — Environment secrets table (deferred)

**Status:** deferred · **Area:** settings / terminal · **Size:** M

**Ask.** A table in Settings to hold machine-local secrets (name + value), with
add / edit / copy / delete, reachable from the in-app terminal when running
commands — and never pushed to the remote.

**Interim convention (agreed 2026-07-21).** A `.secrets.local` file at the vault
root, `.gitignore`d, in `KEY=value` form like a `.env`. That gets the capability
today with no UI: source it in the terminal, and it cannot reach a commit.

**When built, the invariants that matter** — the same ones the n8n key and client
credentials already hold to:
- values live in the OS keychain, never in the vault and never in a commit;
- only PRESENCE crosses the IPC seam, never the value, except on an explicit
  reveal/copy;
- `.secrets.local` must be in `.gitignore` BEFORE the file is ever written, not
  after — the window between the two is how a secret reaches history;
- injected into the pty's env at spawn, never into the core host's `process.env`
  (which every child would then inherit).

**Why deferred.** The user asked for the file convention now and the UI later.
The invariant list above is why it is worth doing deliberately rather than
tacking onto a UI batch: getting it wrong puts a secret in git history, which is
not undoable by editing a file.

---

## Notes

- BL-1/2/3/7 are all in the agent panel and could ship as one pass — BL-1
  (removing the composer strip) and BL-7 (collapsing the header) are the same
  "give the thread its space back" goal from opposite ends.
- BL-2's "Send becomes Stop" is the nicer end state but is optional — unblocking
  typing is the actual ask.
- BL-5 is the highest-value item here: it silently breaks per-client MCP on every
  provider switch, and it also makes the `◈` chip honest.
