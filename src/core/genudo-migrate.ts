/**
 * One-shot fleet migration: the per-client `genudo` connection moves from the stdio
 * npx bridge to the remote Streamable HTTP endpoint.
 *
 * TEXT-level, not parse-and-redump, so comments and unrelated formatting survive in
 * files that are committed vault content. Idempotent: running it twice changes
 * nothing the second time, which is what makes a --check run trustworthy.
 *
 * The `${VAR}` ref is deliberately CARRIED OVER rather than dropped — a pasted token
 * keeps working the moment this lands, before anyone signs in.
 */
import { GENUDO_BASE_URL } from './genudo-http'
const GENUDO_BLOCK =
  // The end-of-block lookahead needs a real "true end of string" branch: `\Z` is not
  // a recognized escape in JS regex (it is silently read as a literal "Z"), so a file
  // whose `genudo:` block is the very last content would never match without this.
  // `(?![\s\S])` is the correct JS idiom — it only succeeds with zero characters left,
  // so it can't fire early at a blank line inside the block (unlike `$` with the `m`
  // flag, which would end the match right before that blank line's own `\n`).
  //
  // Review finding (2026-07-29): each repeated line ALSO needs a "true end of
  // string" branch, not just the block-end lookahead — a genudo block whose
  // last line has no trailing `\n` (a file that just doesn't end in a
  // newline) previously failed to match AT ALL, because the repetition
  // required every line, including the last, to be `\n`-terminated. `(?:\n|
  // (?![\s\S]))` accepts either a real newline or true end-of-string, so the
  // very last line of the file is no longer a silent no-match.
  /^([ \t]+)genudo:\n(?:\1[ \t]+.*(?:\n|(?![\s\S]))|\s*\n)*?(?=^\1\S|^\S|(?![\s\S]))/m

// Review finding (2026-07-29): `type: "http"` (quoted) is valid YAML and the
// lib's schema-level `isRemoteServer` check (and thus `'url' in conn`) already
// treats it as remote — but a bare `/type:\s*http/` does not match through the
// quote characters, so setGenudoUrl silently no-op'd on any block a human (or
// a future codegen path) happened to quote. Tolerate an optional `'`/`"` on
// either side; unquoted `type: http` still matches exactly as before.
const HTTP_TYPE_RE = /type:\s*['"]?http['"]?/

// NOTE: deliberately NOT reused with `.test()`. A global regex's `.test()`/`.exec()`
// carries `lastIndex` across calls, so calling `migrateWorkspaceYml` on a second file
// right after a first would silently start the search past the match and report no
// plugin swap needed — corrupting an unpredictable subset of a 59-client run. `.replace`
// is safe: for a global pattern it resets `lastIndex` to 0 on entry and exit, so the
// `changed` flag below is derived from a before/after string compare instead of `.test()`.
const OLD_PLUGIN = /\bgenudo@genudo-ai\b/g
const NEW_PLUGIN = 'genudo-no-connector@genudo-ai'
export const STALE_PLUGIN_KEY = 'genudo@genudo-ai'

export function migrateWorkspaceYml(text: string): { text: string; changed: boolean } {
  let changed = false
  let out = text.replace(GENUDO_BLOCK, (block, indent: string) => {
    if (HTTP_TYPE_RE.test(block)) return block // already migrated
    const ref = /\$\{([A-Z0-9_]+)\}/.exec(block)?.[1]
    const base = /GENUDO_BASE_URL:\s*"?([^"\s]+)"?/.exec(block)?.[1] ?? 'https://api.genudo.ai'
    if (!ref) return block // nothing to carry over — leave it for a human
    changed = true
    const inner = `${indent}  `
    return (
      `${indent}genudo:\n` +
      `${inner}type: http\n` +
      // Review finding (2026-07-29): was `${base.replace(/\/+$/, '')}/mcp`,
      // which does not strip an EXISTING /mcp suffix — a self-hosted
      // GENUDO_BASE_URL already ending in /mcp migrated to a doubled
      // `/mcp/mcp`. normalizeGenudoUrl is the one canonical strip-then-append
      // rule (also used by setGenudoUrl and mirrored by genudo-server.ts) —
      // this was the third copy silently disagreeing with the other two.
      `${inner}url: ${normalizeGenudoUrl(base)}\n` +
      `${inner}headers:\n` +
      `${inner}  Authorization: "Bearer \${${ref}}"\n`
    )
  })
  const swapped = out.replace(OLD_PLUGIN, NEW_PLUGIN)
  if (swapped !== out) {
    out = swapped
    changed = true
  }
  return { text: out, changed }
}

/**
 * `renderClaudeSettings` only ever ADDS keys, so swapping workspace.yml leaves the
 * old plugin enabled forever — and that plugin bundles its own Genudo connector,
 * which would authenticate as whichever account Claude last signed in to. Removing
 * the key is what makes the swap actually take effect.
 */
export function pruneEnabledPlugins(json: string): { json: string; changed: boolean } {
  let parsed: { enabledPlugins?: Record<string, boolean> }
  try {
    parsed = JSON.parse(json) as { enabledPlugins?: Record<string, boolean> }
  } catch {
    return { json, changed: false }
  }
  if (!parsed.enabledPlugins || !(STALE_PLUGIN_KEY in parsed.enabledPlugins)) {
    return { json, changed: false }
  }
  delete parsed.enabledPlugins[STALE_PLUGIN_KEY]
  return { json: `${JSON.stringify(parsed, null, 2)}\n`, changed: true }
}

/**
 * Strip an existing trailing `/mcp` and any trailing slashes — the shared half
 * of both normalisers below. A bare host (`https://x`) passes through
 * unchanged; the full endpoint pasted verbatim out of workspace.yml
 * (`https://x/mcp`, `https://x/mcp/`) collapses to the same host either way.
 */
function stripGenudoSuffix(input: string): string {
  return input.trim().replace(/\/mcp\/?$/, '').replace(/\/+$/, '')
}

/**
 * Task 7: normalise what a user TYPES (a bare host, or the full endpoint pasted
 * verbatim out of workspace.yml — the obvious copy-paste mistake) into the
 * canonical `url:` shape (the already-migrated/http block). Strip-then-append
 * `/mcp` exactly once, so pasting the endpoint whole never doubles the suffix.
 * Mirrors `genudo-server.ts`'s own fallback normalisation
 * (`.replace(/\/mcp\/?$/, '').replace(/\/+$/, '')` + `/mcp`) so the two paths —
 * "what a session actually connects to" and "what gets written to disk" — can
 * never disagree about what a given input resolves to.
 */
export function normalizeGenudoUrl(input: string): string {
  return `${stripGenudoSuffix(input)}/mcp`
}

/**
 * Rewrite the `genudo` connection's declared base host in a client's
 * workspace.yml — TEXT-level, exactly like `migrateWorkspaceYml` above, so
 * comments and unrelated formatting in this committed, human-authored file
 * survive. `url === null` restores the production default.
 *
 * Handles BOTH shapes (review finding, 2026-07-29 — the field must not be
 * unsettable just because a client hasn't been through the fleet migration,
 * which is dry-by-default and has not touched the fleet yet):
 *   - already-http: rewrites the `url:` line to the canonical `.../mcp` endpoint.
 *   - still-stdio (unmigrated): rewrites the `GENUDO_BASE_URL:` line inside the
 *     block's `env:` — as a BARE HOST, matching the existing fixture
 *     convention (`genudo-server.ts`'s stdio fallback appends `/mcp` itself at
 *     read time; writing the endpoint form here would eventually double it).
 *     Only rewrites an EXISTING line — every real fixture already declares
 *     one — never inserts a new one.
 *
 * A no-op (`changed: false`) when the block has neither a `url:` line (http
 * shape) nor a `GENUDO_BASE_URL:` line (stdio shape) to rewrite, or no genudo
 * block at all. The caller (engine/handlers) treats that as a hard failure —
 * see `setGenudoBaseUrl` in engine.ts — rather than silently reporting success.
 */
export function setGenudoUrl(text: string, url: string | null): { text: string; changed: boolean } {
  let changed = false
  const out = text.replace(GENUDO_BLOCK, (block: string) => {
    if (HTTP_TYPE_RE.test(block)) {
      const target = url === null ? `${GENUDO_BASE_URL}/mcp` : normalizeGenudoUrl(url)
      return block.replace(/^([ \t]+)url:[ \t]*.*$/m, (line: string, indent: string) => {
        const next = `${indent}url: ${target}`
        if (next !== line) changed = true
        return next
      })
    }
    // stdio (unmigrated) shape: the override lives in env.GENUDO_BASE_URL, as
    // a bare host (see doc comment above — no /mcp suffix here).
    const target = url === null ? GENUDO_BASE_URL : stripGenudoSuffix(url)
    return block.replace(/^([ \t]+)GENUDO_BASE_URL:[ \t]*.*$/m, (line: string, indent: string) => {
      const next = `${indent}GENUDO_BASE_URL: ${target}`
      if (next !== line) changed = true
      return next
    })
  })
  return { text: out, changed }
}
