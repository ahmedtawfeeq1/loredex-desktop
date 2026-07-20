# Backlog — future work

Small, well-scoped UX fixes captured from real use. Nothing here is scheduled;
pick them up in any order. Each item states the symptom, the cause (with
file:line), what "done" looks like, and the screenshot it came from.

Status legend: `open` · `in progress` · `done`

---

## BL-1 — Chat: drop the composer action strip; make the header "New conversation" obvious

**Status:** open · **Area:** agent panel · **Size:** S

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

**Status:** open · **Area:** agent panel · **Size:** S–M

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

**Status:** open · **Area:** agent panel / markdown · **Size:** S

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

**Status:** open · **Area:** terminal · **Size:** M

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

**Status:** open · **Area:** agent panel / core · **Size:** M · **Priority:** high

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

**Done when.**
- The conversation persists its working directory (new **additive, nullable**
  `cwd` column — next free migration index; `client_slug` already took one).
  `acpStart` already receives `arg.cwd`, so `createConversation` can record it.
- `acpContinue` restores that cwd instead of the vault root, so the switched-to
  provider spawns in the **same folder** and picks up the same `.mcp.json`.
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

## Notes

- BL-1/2/3 are all in the agent panel and could ship as one pass.
- BL-2's "Send becomes Stop" is the nicer end state but is optional — unblocking
  typing is the actual ask.
- BL-5 is the highest-value item here: it silently breaks per-client MCP on every
  provider switch, and it also makes the `◈` chip honest.
