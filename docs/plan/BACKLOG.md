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

## Notes

- BL-1/2/3/7 are all in the agent panel and could ship as one pass — BL-1
  (removing the composer strip) and BL-7 (collapsing the header) are the same
  "give the thread its space back" goal from opposite ends.
- BL-2's "Send becomes Stop" is the nicer end state but is optional — unblocking
  typing is the actual ask.
- BL-5 is the highest-value item here: it silently breaks per-client MCP on every
  provider switch, and it also makes the `◈` chip honest.
