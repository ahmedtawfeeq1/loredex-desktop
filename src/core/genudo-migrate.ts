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
const GENUDO_BLOCK =
  // The end-of-block lookahead needs a real "true end of string" branch: `\Z` is not
  // a recognized escape in JS regex (it is silently read as a literal "Z"), so a file
  // whose `genudo:` block is the very last content would never match without this.
  // `(?![\s\S])` is the correct JS idiom — it only succeeds with zero characters left,
  // so it can't fire early at a blank line inside the block (unlike `$` with the `m`
  // flag, which would end the match right before that blank line's own `\n`).
  /^([ \t]+)genudo:\n(?:\1[ \t]+.*\n|\s*\n)*?(?=^\1\S|^\S|(?![\s\S]))/m

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
    if (/type:\s*http/.test(block)) return block // already migrated
    const ref = /\$\{([A-Z0-9_]+)\}/.exec(block)?.[1]
    const base = /GENUDO_BASE_URL:\s*"?([^"\s]+)"?/.exec(block)?.[1] ?? 'https://api.genudo.ai'
    if (!ref) return block // nothing to carry over — leave it for a human
    changed = true
    const inner = `${indent}  `
    return (
      `${indent}genudo:\n` +
      `${inner}type: http\n` +
      `${inner}url: ${base.replace(/\/+$/, '')}/mcp\n` +
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
