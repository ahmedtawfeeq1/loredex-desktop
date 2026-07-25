---
project: loredex-desktop
topic: integrations
type: research
status: current
tags: [langsmith, mcp, tracing, observability, integrations]
---

# LangSmith integration — what exists, what we wired, what cannot work

Research for adding LangSmith as an optional workspace integration alongside n8n
(asked 2026-07-23). Everything below was checked against live docs, the live API
and the installed packages on 2026-07-23; anything version-dependent says so.

## The actual use case

**Not** tracing loredex's own agent panel. The user's *Python* project runs the
AI agents that serve their clients, and it already traces to LangSmith. When
something goes wrong with a customer they have a **conversation link from their
own platform** — not a trace id, and not a LangSmith URL. They want to hand that
to the panel agent and get an analysis, without opening LangSmith or exporting
anything by hand.

The join key is metadata. A real export (al-hazem-tech, 2026-07-23) carries:

```
conversation_id: 126        (number)
session_id:      "conv-126"
thread_id:       "conv-126"
tracing_project: genudo-staging / 36afcf8f-a5c8-41f8-aa5d-41efc5d4c7cf
```

so one conversation is findable under **both** `126` and `conv-126`, under any of
three keys. Which key carries it is the user's choice, not ours — the query
matches all three.

Their runs also carry the whole picture already: `inputs` (query, persona,
instructions, model config), `outputs` (response, reasoning, tool_calls,
retrieved_documents, cost, tokens, stage_transition), and `metadata` (pipeline,
stage, actions fired, guards, RAG counts). That is enough for the agent to
reconstruct what happened — no extra fetching needed once the runs are in hand.

## A claim made here that turned out to be WRONG (kept as a lesson)

`@agentclientprotocol/claude-agent-acp@0.59.0` — the adapter the panel spawns for
Claude — passes `settingSources: []` to the Claude Agent SDK. That switches off
loading of user and project settings, which is where plugins and hooks come
from. So the official `langsmith-tracing` plugin, whose entire mechanism is
`UserPromptSubmit` / `PreToolUse` / `PostToolUse` / `Stop` hooks, is inert inside
a panel session. It works in `claude` run from a terminal, and nowhere else in
this app.

Verified by grepping the installed adapter bundle: one occurrence of
`settingSources`, and its value is `[]`.

**CORRECTION (same day).** The conclusion drawn from that — "therefore plugins do
not load in the panel" — is **wrong**. A panel session was observed listing
`/genudo:*` skills and `genudo:*` agents from an installed plugin, so plugins DO
load. Whatever `settingSources: []` gates, it is not plugin loading; whether the
tracing plugin's *hooks* fire is untested and now moot, since tracing this app
was dropped. The lesson: this was reasoning from a source read, not an
observation, and it was stated as fact.

The tracing plugin was removed from Settings entirely on request the same day —
tracing this app's own sessions is not wanted. LangSmith is here to READ the
traces the user's Python agent system writes.

## Conversation → runs: the query that does the work

`POST /api/v1/runs/query`, filter DSL from
<https://docs.langchain.com/langsmith/trace-query-syntax>:

```json
{
  "session": ["<tracing-project-uuid>"],
  "filter": "and(in(metadata_key, [\"conversation_id\", \"session_id\", \"thread_id\"]), or(eq(metadata_value, \"126\"), eq(metadata_value, \"conv-126\")))",
  "is_root": true,
  "order": "desc",
  "limit": 25
}
```

Details that matter:

- `metadata_value` compares as a **string**, so a numeric `conversation_id` is
  matched as `"126"`.
- `is_root: true` for a conversation — one root run per turn. For a pasted
  LangSmith run URL the query is `{"trace": "<run-id>"}` with **no** `is_root`:
  a trace query returns every run in the tree, and the children are usually the
  interesting part. (Per the schema, `limit` and cursor pagination are ignored
  when `trace` is set — the whole trace comes back in one page.)
- `session` wants the tracing project's **UUID**, not its name. A name is
  resolved first via `GET /api/v1/sessions?name=<name>&limit=1`. LangSmith's API
  calls a tracing project a "session", which is a third meaning of that word in
  this codebase — beware.
- `filter` vs `trace_filter` vs `tree_filter`: applied to the returned run, to
  the trace's root, and to any run anywhere in the tree, respectively. We use
  `filter`.
- The result is capped and the cap is **reported** — a silent truncation reads
  as "that is the whole conversation", the worst thing to believe while
  debugging one.
- `/api/v1/runs/threads/{thread_id}?session_id=<uuid>` also exists ("Thread
  Preview") and would match their `thread_id` directly. Not used: it returns a
  message preview rather than the runs, and it forces a project id, whereas the
  metadata query degrades to a workspace-wide search.

## Surfaces LangSmith offers

| Surface | What it is | Fits this app? |
|---|---|---|
| **Remote MCP server** | Streamable HTTP at `<endpoint>/mcp` | **Yes — wired.** No install; rides the same `type: 'http'` path as our own loredex host |
| Standalone MCP server | `langsmith-mcp-server` on PyPI, run via `uvx` | No. Would drag in a Python + `uv` toolchain we do not otherwise need |
| `langsmith-skills` plugin | 3 skills: trace / dataset / evaluator | **Yes — wired** as a setup card (Claude only) |
| `langsmith-tracing` plugin | Hooks that send Claude Code runs to LangSmith | **Partly** — terminal only, see above |
| LangSmith CLI | `uv tool install langsmith-cli`, agent-first JSON output | Not wired. Overlaps the MCP tools; add later if the tools prove too coarse |
| `langsmith` SDK (JS/Py) | Tracing client for app code | Out of scope — that is for the user's own apps, not the desktop app |

## Remote MCP — the details that matter

- Endpoints are separate **hosts**, not a query parameter:
  - GCP US `https://api.smith.langchain.com` (default)
  - GCP EU `https://eu.api.smith.langchain.com`
  - GCP APAC `https://apac.api.smith.langchain.com`
  - AWS US `https://aws.api.smith.langchain.com`
  - self-hosted `https://<host>/api` (LangSmith v0.16+, needs an Ed25519 JWKS in
    `config.signingJwks`)
- Transport: **Streamable HTTP** (MCP spec), path `/mcp`.
- Auth for programmatic clients: **`X-Api-Key`** header on every request.
  - NOT `Authorization: Bearer`.
  - NOT the standalone server's `LANGSMITH-API-KEY` — different header, same
    product. Getting this wrong 401s with no useful message.
  - OAuth 2.1 with dynamic client registration also exists, for interactive
    clients. We use the key: loredex already has a keychain and a seam rule that
    keeps secrets out of the renderer, and OAuth would need a browser round trip
    per session.
- Tools advertised (docs, 2026-07-23): `get_thread_history`, `list_prompts`,
  `get_prompt_by_name`, `push_prompt`, `fetch_runs`, `list_projects`,
  `list_datasets`, `list_examples`, `read_dataset`, `read_example`,
  `create_dataset`, `update_examples`, `list_experiments`, `run_experiment`,
  `get_billing_usage`.
  We do not hardcode that list — Settings probes the live server, same as n8n.
- Known upstream limitation: **Codex CLI cannot use the OAuth flow** (it omits
  the RFC 8707 `resource` parameter). Irrelevant to our injection, which is
  key-based — but it is why the Codex adapter may still fail if it ever
  negotiates OAuth itself.

## API, for the connection test

Base `https://api.smith.langchain.com`, header `X-Api-Key`. Probed unauthenticated
2026-07-23:

| Path | Status without a key |
|---|---|
| `/info` | 200 — public, useless as a credential test |
| `/api/v1/sessions?limit=1` | **401** — used for Test connection |
| `/api/v1/workspaces/current` | 404 (the trailing-slash form is the real one) |

`sessions` is LangSmith's name for tracing **projects**, so a success can honestly
report how many are visible.

Key shape: `lsv2_…`. Two kinds — personal access tokens (inherit the user's
permissions) and service keys (scoped to a workspace or org). Either works.

## Plugins — exact names

Both taken from each repo's `.claude-plugin/marketplace.json`, because Claude Code
parses the install argument as `<plugin>@<marketplace>` and a GitHub path in that
slot fails with "Marketplace not found" (the lesson from the n8n card).

```
/plugin marketplace add langchain-ai/langsmith-skills
/plugin install langsmith-skills@langsmith-skills

/plugin marketplace add langchain-ai/langsmith-claude-code-plugins
/plugin install langsmith-tracing@langsmith-claude-code-plugins
```

`langsmith-tracing` env: `TRACE_TO_LANGSMITH=true` (required),
`CC_LANGSMITH_API_KEY` (falls back to `LANGSMITH_API_KEY`),
`CC_LANGSMITH_PROJECT` (default `claude-code`), `LANGSMITH_ENDPOINT`,
plus `CC_LANGSMITH_DEBUG`, `CC_LANGSMITH_REDACT` (default true),
`CC_LANGSMITH_METADATA`, `CC_LANGSMITH_RUNS_ENDPOINTS`,
`CC_LANGSMITH_PARENT_DOTTED_ORDER`.

## What was built

Mirrors the n8n integration file for file:

| n8n | LangSmith |
|---|---|
| `core/n8n-config.ts` | `core/langsmith-config.ts` — keychain key, meta-table endpoint + project, `langsmithHttp()`, real `testLangsmithConnection()` |
| `core/n8n-install.ts` | *(none — remote, nothing to install)* |
| `core/workspace-mcp.ts` | same file: a `type: 'http'` entry with the `X-Api-Key` header, omitted without a key |
| `core/workspace-rows.ts` | same file: a row whose `setup` is `'key'` rather than `'install'` |
| `core/claude-plugins.ts` | same file: skills + tracing commands, `terminalLangsmithCommand`, `hasTerminalMcp` generalised |
| `core/mcp-tools.ts` | same file: `probeHttpTools` — the live tool list for a remote server |
| `workspace.n8n.*` IPC | `workspace.langsmith.get/set/test/status` |
| Settings card | `LangsmithSection` in `WorkspaceServersSection.tsx` |
| *(no n8n equivalent)* | `core/langsmith-links.ts` — paste → searchable ref |
| *(no n8n equivalent)* | `core/langsmith-trace.ts` — the conversation lookup |
| *(no n8n equivalent)* | `langsmith.trace.fetch` IPC + the composer's `◎` button |

### The paste → analysis path

1. Paste a conversation link (or `126`, or `conv-126`, or a LangSmith run URL)
   into the composer and press **◎**.
2. `parseTraceRef` resolves it. It **refuses to guess**: no "last number in the
   URL" fallback, because a port or a page number would parse just as happily
   and a wrong id returns an empty result that reads exactly like "this
   conversation was never traced".
3. `fetchTraceForRef` queries LangSmith and writes the runs to
   `<userData>/langsmith-traces/conversation-<id>-<stamp>.json`.
4. The file is staged as a resource attachment and the draft is replaced with an
   analysis prompt. Press Send.

**Why a file and not the IPC payload.** One of their runs is ~47 KB of inputs and
outputs; a conversation is many turns. Returning that through the seam and into a
chat message would exhaust the context before the agent read a word. A path costs
nothing, every provider can read a file, and the agent decides how much to pull
in. It lands under userData, **never the vault**: it is a working copy of another
system, not a note, and must not be routed into the dex or reach a commit.

Defaults **off**: enabling sends prompts and tool output to a third party. That
is a decision to opt into, never one to inherit.

## Open

1. **Untested against the live API.** Every request shape here comes from the
   published OpenAPI spec (`https://api.smith.langchain.com/openapi.json`, read
   2026-07-23) and the filter-syntax docs, and the fetch layer is unit-tested
   against stubbed responses — but no call has been made with a real key. The
   first real run may need the filter or the `sessions?name=` response shape
   adjusted.
2. ~~The conversation-link parser guesses at URL shapes.~~ **Resolved
   2026-07-23:** the real link is
   `https://devconsole.loop-x.co/inboxes?conversation=128`, which the explicit-
   parameter rule already handled. Pinned by a test named after the console, so
   a route rename fails there first.
3. **LangSmith CLI card.** If the MCP `fetch_runs` tool proves too coarse for
   follow-up questions, the CLI (`langsmith trace get <id>`) is the finer tool.
4. **Self-hosted endpoint** is accepted in the field but untested — no instance
   to test against.
5. **Tracing panel sessions** (a different want, recorded for completeness):
   blocked upstream by `settingSources: []`. Would mean loredex emitting runs to
   `/api/v1/runs` from the ACP event stream. Not built, not asked for.
