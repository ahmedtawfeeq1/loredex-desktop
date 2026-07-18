# Research: VS Code-grade terminal + embedded Claude/Codex panels in Loredex

Researched 2026-07-18. Two asks: (1) a fully functional terminal inside
Loredex with VS Code-style horizontal/vertical splits; (2) Claude Code and
Codex running as first-class panels inside Loredex — the Antigravity
experience (session list, chat pane, tool-call stream, edit review) — not a
spawned external terminal. Both are $0 in licensing; costs are engineering
time plus the user's existing AI subscriptions.

---

## Part 1 — The embedded terminal

### The stack (the same one VS Code uses)

| Piece | Library | License | Role |
|---|---|---|---|
| Emulator (renderer) | **xterm.js** (`@xterm/xterm`) | MIT | Draws the terminal, handles input, scrollback, selection — literally VS Code's terminal component |
| Shell process (main) | **node-pty** | MIT | Spawns the user's shell ($SHELL) in a real pseudo-terminal; native module (we already ship better-sqlite3, so the electron-rebuild pipeline exists) |
| Addons | `@xterm/addon-fit`, `-webgl`, `-search`, `-web-links` | MIT | Resize-to-pane, GPU rendering, ⌘F search, clickable URLs |

Wiring in OUR architecture: pty processes live in the **core host** (they're
OS resources, renderer must not own them). New typed channels:

```
'term.create'  { cwd, cols, rows }        → { id }
'term.input'   { id, data }               → void
'term.resize'  { id, cols, rows }         → void
'term.kill'    { id }                     → void
CoreEvent: { kind: 'term.data', id, data } · { kind: 'term.exit', id, code }
```

Throughput note: terminal output is high-frequency; batch `term.data` writes
(flush every ~8ms) so the IPC bridge doesn't choke — this is the known
Electron pitfall. If it ever becomes hot, move pty ownership to a dedicated
`utilityProcess` with a MessagePort straight to the renderer.

### Splits, VS Code style

Splits are **pure renderer layout** — the pty side just sees N terminals. A
recursive layout tree, exactly VS Code's model:

```ts
type Pane = { kind: 'term'; id: string }
           | { kind: 'split'; dir: 'row' | 'column'; ratio: number; a: Pane; b: Pane }
```

Render with nested flexbox; the divider is a drag handle updating `ratio`
(we already have the drag-resize pattern in the reader's list pane). Actions:
"Split right" (⌘\ in-terminal), "Split down", close pane, focus cycling
(alt+arrows). `addon-fit` refits each terminal on any ratio/size change.
Persist the layout tree per-vault in the rails store like the existing
sidebar/list state. ~2–3 days for terminal + splits at our conventions,
because every primitive (typed channels, event bus, drag handles, persisted
rails) already exists.

Where it lives: a bottom drawer on every view (VS Code-style, `` ⌃` ``
toggle) + "Open terminal here" on project/client rows (cwd = that folder).

Optional later (from Superset's daemon write-up): keep ptys alive across
window reloads by parking them in the core host with a headless xterm buffer
replayed on reattach — nice-to-have, not v1.

### What NOT to do

- Don't embed tmux for splits (fights xterm.js over scroll/selection/keys).
- Don't run node-pty in the renderer (works in dev, breaks under sandbox
  hardening; keep OS resources in the core host).

---

## Part 2 — Claude Code + Codex as panels inside Loredex (the Antigravity thing)

What Antigravity/Zed/JetBrains use is a real, open protocol: **ACP — Agent
Client Protocol** (agentclientprotocol.com, started by Zed). JSON-RPC 2.0
over **stdio**: the editor (us) spawns an agent adapter as a child process
and speaks the protocol. "LSP, but for agents." Loredex would be an **ACP
client** — one integration, every agent:

- **Claude Code**: `@agentclientprotocol/claude-agent-acp` (npm, official,
  built on the Claude Agent SDK). Capabilities it already ships: @-mentions,
  images, tool calls **with permission requests**, follow-along, **edit
  review**, TODO lists, interactive + background terminals, custom slash
  commands, client-provided MCP servers.
- **Codex**: `@agentclientprotocol/codex-acp` (npm, v1.x, actively released)
  — stdio ACP server over the Codex app-server; auth via ChatGPT login or
  `OPENAI_API_KEY`; supports model/reasoning/approval/sandbox config and
  /status /mcp /review slash commands.
- Same door later: Gemini CLI, OpenCode, Qwen — anything ACP.

**Auth/billing**: the adapters reuse the user's existing logins (Claude
Code subscription / ChatGPT login / API keys). Nothing for us to license;
MIT/Apache adapters; usage bills to the user's own accounts.

### What Loredex implements as an ACP client

1. Spawn adapter per session: `npx @agentclientprotocol/claude-agent-acp`
   (or `codex-acp`) with cwd = project/client dir, in the core host;
   JSON-RPC over stdin/stdout (same spawn hygiene as the re-curate wrapper).
2. Protocol client (~small): initialize/capability handshake, session
   lifecycle, streamed message/tool-call events → render as a chat pane.
3. Client-side capabilities we service:
   - **Permission requests** → our modal (approve/deny tool use)
   - **File edits / edit review** → we apply + show diffs (CodeMirror merge
     view, MIT) — or start in auto-apply mode and add review later
   - **Terminal requests** → Part 1's embedded terminal (this is why the
     terminal comes first: ACP agents ask the client for terminals)
4. UI: a right-side **Agent panel** (the vertical-panel pattern from the
   Inbox): session list per project (like Antigravity's left rail), chat
   thread with tool-call rows ([MCP]/[GIT]-style mono lines we already
   render in Agents view), input box, agent picker (Claude / Codex).
5. Dex superpowers no other client has: auto-attach our own MCP server to
   the session (the agent gets vault_search/handoffs/work tools instantly),
   and "Send comment to AI" from any note → opens a session with the note +
   comment as context; the reply can land as a thread comment.

### Effort map

| Slice | Size |
|---|---|
| Terminal + splits (Part 1) | ~2–3 days |
| ACP client core (spawn, handshake, chat streaming, permissions modal) | ~3–5 days |
| Edit-review diffs, session persistence, multi-agent picker | ~1 week incremental |

### Risks / gotchas

- ACP protocol is young — pin adapter versions; the npm adapters move fast.
- Codex adapter has multiple implementations; use the official
  `@agentclientprotocol/codex-acp`, fall back to zed-industries/codex-acp.
- node-pty native rebuilds per Electron version — wire into the existing
  `prepare-electron-natives.mjs` step.
- Never log agent stdout wholesale (may contain tokens); reuse the masking
  discipline from the GitHub auth work.

### Recommended order

1. Terminal + splits (standalone value + ACP prerequisite).
2. "Open agent here" buttons running `claude`/`codex` INSIDE that terminal —
   ships the core workflow in days, zero protocol work.
3. ACP Agent panel (Claude first, Codex second) — the Antigravity
   experience, native to Loredex.

## Sources

- xterm.js — https://github.com/xtermjs/xterm.js/ (VS Code's terminal)
- Terminals in Electron with node-pty + xterm.js —
  https://www.opcito.com/blogs/browser-based-terminals-with-xtermjs-and-electronjs ·
  https://saisandeepvaddi.com/blog/how-to-create-web-based-terminals
- Persistent-terminal daemon patterns — https://superset.sh/blog/terminal-daemon-deep-dive
- ACP overview — https://www.danilchenko.dev/posts/agent-client-protocol/
- Claude adapter — https://github.com/agentclientprotocol/claude-agent-acp ·
  https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp ·
  https://zed.dev/acp/agent/claude-agent
- Claude Agent SDK — https://code.claude.com/docs/en/agent-sdk/overview
- Codex adapter — https://github.com/agentclientprotocol/codex-acp ·
  https://www.npmjs.com/package/@agentclientprotocol/codex-acp ·
  https://github.com/zed-industries/codex-acp
- Multi-agent ACP client example (VS Code ext connecting Claude/Codex/…) —
  https://dev.to/formulahendry/vs-code-acp-client-extension-conect-to-claude-gemini-codex-opencode-qwen-code-and-so-on-3552
