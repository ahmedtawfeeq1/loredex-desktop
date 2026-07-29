import { describe, expect, it } from 'vitest'
import { migrateWorkspaceYml, normalizeGenudoUrl, pruneEnabledPlugins, setGenudoUrl } from './genudo-migrate'

const BEFORE = `# Agent tooling for this client — committed, secret-free.
mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_2ME}"
      GENUDO_BASE_URL: "https://api.genudo.ai"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`

describe('migrateWorkspaceYml', () => {
  it('rewrites the genudo block to remote http, keeping the ${VAR} ref', () => {
    const { text, changed } = migrateWorkspaceYml(BEFORE)
    expect(changed).toBe(true)
    expect(text).toContain('type: http')
    expect(text).toContain('url: https://api.genudo.ai/mcp')
    expect(text).toContain('Authorization: "Bearer ${GENUDO_TOKEN_2ME}"')
    expect(text).not.toContain('npx')
    expect(text).not.toContain('command:')
  })

  it('swaps the plugin id to the no-connector build', () => {
    expect(migrateWorkspaceYml(BEFORE).text).toContain('genudo-no-connector@genudo-ai')
    expect(migrateWorkspaceYml(BEFORE).text).not.toContain('[genudo@genudo-ai]')
  })

  it('preserves a non-genudo server untouched', () => {
    const withOther = BEFORE.replace(
      'plugins:',
      '  crm:\n    command: npx\n    args: [-y, crm-client]\nplugins:',
    )
    const { text } = migrateWorkspaceYml(withOther)
    expect(text).toContain('crm-client')
    expect(text).toContain('command: npx')
  })

  it('is idempotent', () => {
    const once = migrateWorkspaceYml(BEFORE).text
    const twice = migrateWorkspaceYml(once)
    expect(twice.changed).toBe(false)
    expect(twice.text).toBe(once)
  })

  it('preserves a self-hosted base url as the endpoint host', () => {
    const selfHosted = BEFORE.replace('https://api.genudo.ai', 'https://genudo.acme.internal')
    expect(migrateWorkspaceYml(selfHosted).text).toContain('url: https://genudo.acme.internal/mcp')
  })

  // Regression: the real fleet has clients whose workspace.yml uses YAML block-list
  // style (`args:` / `- '-y'`, unquoted env values) rather than the flow style in
  // BEFORE above. This mirrors an actual fixture from clients_work/projects.
  it('handles YAML block-list style with unquoted env values (real fixture shape)', () => {
    const blockStyle = `# Agent tooling for this client — committed, secret-free.
mcp:
  genudo:
    command: npx
    args:
      - '-y'
      - genudo-mcp-client
    env:
      GENUDO_TOKEN: \${GENUDO_TOKEN_ACME}
      GENUDO_BASE_URL: https://api.genudo.ai
plugins:
  claude:
    - genudo@genudo-ai
skills: []
`
    const { text, changed } = migrateWorkspaceYml(blockStyle)
    expect(changed).toBe(true)
    expect(text).toContain('type: http')
    expect(text).toContain('url: https://api.genudo.ai/mcp')
    expect(text).toContain('Authorization: "Bearer ${GENUDO_TOKEN_ACME}"')
    expect(text).toContain('- genudo-no-connector@genudo-ai')
    expect(text).not.toContain('command:')
  })

  // Regression: keys in a different order than the fixture (env before args) and an
  // extra key inside the block must not break the match or corrupt the swap.
  it('survives reordered keys and an extra key inside the block', () => {
    const reordered = `mcp:
  genudo:
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_X}"
      GENUDO_BASE_URL: "https://api.genudo.ai"
    timeout_ms: 30000
    command: npx
    args: [-y, genudo-mcp-client]
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = migrateWorkspaceYml(reordered)
    expect(changed).toBe(true)
    expect(text).toContain('url: https://api.genudo.ai/mcp')
    expect(text).toContain('Authorization: "Bearer ${GENUDO_TOKEN_X}"')
    expect(text).not.toContain('timeout_ms')
  })

  // Regression: a genudo block that is the LAST thing in the file (nothing after it —
  // no plugins/skills section) must still match. `\Z` is not a real JS regex escape;
  // without a correct end-of-string branch this block would be silently skipped.
  it('rewrites a genudo block that is the last content in the file', () => {
    const noTrailer = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_LAST}"
      GENUDO_BASE_URL: "https://api.genudo.ai"
`
    const { text, changed } = migrateWorkspaceYml(noTrailer)
    expect(changed).toBe(true)
    expect(text).toContain('type: http')
    expect(text).toContain('Authorization: "Bearer ${GENUDO_TOKEN_LAST}"')
  })

  // Regression: OLD_PLUGIN is a module-level `g`-flag regex. If it were ever driven
  // with `.test()` instead of `.replace()`, `lastIndex` would carry over between
  // calls and cause the plugin swap to be silently skipped for some files in a
  // multi-file run depending on call order. Two back-to-back calls on independent
  // inputs (as the real fleet script performs, one call per client) must each report
  // the swap correctly regardless of ordering or prior calls in this test file.
  it('swaps the plugin correctly across consecutive calls on different files', () => {
    const clientA = BEFORE.replace('GENUDO_TOKEN_2ME', 'GENUDO_TOKEN_A')
    const clientB = BEFORE.replace('GENUDO_TOKEN_2ME', 'GENUDO_TOKEN_B')
    const resultA = migrateWorkspaceYml(clientA)
    const resultB = migrateWorkspaceYml(clientB)
    expect(resultA.changed).toBe(true)
    expect(resultB.changed).toBe(true)
    expect(resultA.text).toContain('genudo-no-connector@genudo-ai')
    expect(resultB.text).toContain('genudo-no-connector@genudo-ai')
  })

  it('reports no change and leaves an already-http block alone', () => {
    const already = `mcp:
  genudo:
    type: http
    url: https://api.genudo.ai/mcp
    headers:
      Authorization: "Bearer \${GENUDO_TOKEN_X}"
plugins:
  claude: [genudo-no-connector@genudo-ai]
skills: []
`
    const { text, changed } = migrateWorkspaceYml(already)
    expect(changed).toBe(false)
    expect(text).toBe(already)
  })

  it('leaves a block with no recoverable ${VAR} ref for a human', () => {
    const noRef = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "hardcoded-secret-should-not-happen"
      GENUDO_BASE_URL: "https://api.genudo.ai"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = migrateWorkspaceYml(noRef)
    // the block itself is left alone (no ref to carry over)...
    expect(text).toContain('command: npx')
    expect(text).toContain('hardcoded-secret-should-not-happen')
    // ...but the plugin id is a separate, independent rewrite, so it still swaps.
    expect(changed).toBe(true)
    expect(text).toContain('genudo-no-connector@genudo-ai')
  })

  // Review finding (2026-07-29): the re-review flagged this as the weak
  // spot — migrateWorkspaceYml REBUILDS the entire matched block from
  // scratch (unlike setGenudoUrl, which only replaces a single line within
  // it), so an over-matched block boundary here wouldn't just misplace a
  // rewrite, it would DESTROY the sibling's content by omitting it from the
  // reconstruction entirely. setGenudoUrl's existing sibling test cannot
  // catch that class of bug — it never rebuilds anything.
  it('does not destroy a sibling genudo-old-platform: block when rebuilding the matched genudo: block', () => {
    const withOldPlatform = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_ACME}"
      GENUDO_BASE_URL: "https://api.genudo.ai"
  genudo-old-platform:
    type: http
    url: https://old.genudo.ai/mcp
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = migrateWorkspaceYml(withOldPlatform)
    expect(changed).toBe(true)
    expect(text).toContain('type: http')
    expect(text).toContain('url: https://api.genudo.ai/mcp')
    expect(text).toContain('Authorization: "Bearer ${GENUDO_TOKEN_ACME}"')
    // the sibling block must survive COMPLETELY intact — not swallowed into
    // the rebuilt genudo: block, not silently dropped
    expect(text).toContain('genudo-old-platform:')
    expect(text).toContain('url: https://old.genudo.ai/mcp')
  })
})

describe('pruneEnabledPlugins', () => {
  it('removes the stale bundled-connector plugin and keeps the rest', () => {
    const { json, changed } = pruneEnabledPlugins(
      JSON.stringify({ enabledPlugins: { 'genudo@genudo-ai': true, 'n8n-mcp-skills@x': true } }),
    )
    expect(changed).toBe(true)
    expect(JSON.parse(json).enabledPlugins).toEqual({ 'n8n-mcp-skills@x': true })
  })

  it('reports no change when the stale key is absent', () => {
    expect(pruneEnabledPlugins(JSON.stringify({ enabledPlugins: { 'x@y': true } })).changed).toBe(false)
  })

  it('leaves unparseable json alone', () => {
    expect(pruneEnabledPlugins('not json').changed).toBe(false)
  })
})

describe('normalizeGenudoUrl', () => {
  it('appends /mcp to a bare host', () => {
    expect(normalizeGenudoUrl('https://staging.genudo.ai')).toBe('https://staging.genudo.ai/mcp')
  })

  it('does not double the /mcp suffix when the user pastes the full endpoint', () => {
    expect(normalizeGenudoUrl('https://staging.genudo.ai/mcp')).toBe('https://staging.genudo.ai/mcp')
  })

  it('strips a trailing slash before appending /mcp', () => {
    expect(normalizeGenudoUrl('https://staging.genudo.ai/')).toBe('https://staging.genudo.ai/mcp')
  })

  it('strips a trailing slash AFTER an existing /mcp too', () => {
    expect(normalizeGenudoUrl('https://staging.genudo.ai/mcp/')).toBe('https://staging.genudo.ai/mcp')
  })

  it('trims surrounding whitespace from a pasted value', () => {
    expect(normalizeGenudoUrl('  https://staging.genudo.ai  ')).toBe('https://staging.genudo.ai/mcp')
  })
})

describe('setGenudoUrl', () => {
  const HTTP_WS = `# Agent tooling for this client — committed, secret-free.
mcp:
  genudo:
    type: http
    url: https://api.genudo.ai/mcp
    headers:
      Authorization: "Bearer \${GENUDO_TOKEN_2ME}"
plugins:
  claude: [genudo-no-connector@genudo-ai]
skills: []
`

  it('rewrites the url line to a self-hosted/staging host, appending /mcp', () => {
    const { text, changed } = setGenudoUrl(HTTP_WS, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('url: https://genudo.acme.internal/mcp')
    // everything else in the block, and the rest of the file, is untouched
    expect(text).toContain('Authorization: "Bearer ${GENUDO_TOKEN_2ME}"')
    expect(text).toContain('genudo-no-connector@genudo-ai')
  })

  it('does not double the /mcp suffix when a user pastes the full endpoint they see in the file', () => {
    const { text } = setGenudoUrl(HTTP_WS, 'https://api.genudo.ai/mcp')
    expect(text).toContain('url: https://api.genudo.ai/mcp')
    expect(text).not.toContain('/mcp/mcp')
  })

  it('null restores the production default', () => {
    const overridden = setGenudoUrl(HTTP_WS, 'https://genudo.acme.internal').text
    const { text, changed } = setGenudoUrl(overridden, null)
    expect(changed).toBe(true)
    expect(text).toContain('url: https://api.genudo.ai/mcp')
  })

  it('is a no-op (changed: false) when the new value normalises to what is already stored', () => {
    const { text, changed } = setGenudoUrl(HTTP_WS, 'https://api.genudo.ai/mcp/')
    expect(changed).toBe(false)
    expect(text).toBe(HTTP_WS)
  })

  it('preserves comments and unrelated formatting elsewhere in the file', () => {
    const { text } = setGenudoUrl(HTTP_WS, 'https://genudo.acme.internal')
    expect(text).toContain('# Agent tooling for this client — committed, secret-free.')
    expect(text).toContain('skills: []')
  })

  // Review finding (2026-07-29): the fleet migration is dry-by-default and has
  // not touched the fleet yet, so most real clients are STILL on this shape.
  // The field must work on it too, or it is invisible fleet-wide.
  const STDIO_WS = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_X}"
      GENUDO_BASE_URL: "https://api.genudo.ai"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`

  it('rewrites GENUDO_BASE_URL (bare host, no /mcp) inside a still-stdio block', () => {
    const { text, changed } = setGenudoUrl(STDIO_WS, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('GENUDO_BASE_URL: https://genudo.acme.internal')
    // bare host, not the /mcp endpoint form — the stdio fallback appends
    // /mcp itself at read time (genudo-server.ts); writing it here too would
    // eventually double it
    expect(text).not.toContain('/mcp')
    // untouched: the command/args shape, the token ref, the rest of the file
    expect(text).toContain('command: npx')
    expect(text).toContain('GENUDO_TOKEN: "${GENUDO_TOKEN_X}"')
    expect(text).toContain('genudo@genudo-ai')
  })

  it('strips a pasted /mcp endpoint back to a bare host for the stdio shape too', () => {
    const { text } = setGenudoUrl(STDIO_WS, 'https://genudo.acme.internal/mcp/')
    expect(text).toContain('GENUDO_BASE_URL: https://genudo.acme.internal')
    expect(text).not.toContain('/mcp')
  })

  it('null restores the production default on the stdio shape (bare host)', () => {
    const overridden = setGenudoUrl(STDIO_WS, 'https://genudo.acme.internal').text
    const { text, changed } = setGenudoUrl(overridden, null)
    expect(changed).toBe(true)
    expect(text).toContain('GENUDO_BASE_URL: https://api.genudo.ai')
  })

  it('is a no-op (changed: false) on the stdio shape when already at the requested value', () => {
    const overridden = setGenudoUrl(STDIO_WS, 'https://genudo.acme.internal').text
    const { text, changed } = setGenudoUrl(overridden, 'https://genudo.acme.internal')
    expect(changed).toBe(false)
    expect(text).toBe(overridden)
  })

  // Review finding (2026-07-29), round 3: the previous "existing key" match
  // was a bare, unanchored "GENUDO_BASE_URL:" search — a COMMENT that merely
  // MENTIONS the key text matched first, got rewritten in place of the real
  // key, and still reported changed:true. The real key was left stale while
  // the panel reported success — a silent wrong result that walks straight
  // past the round-1 throw-on-no-op guard (engine.ts).
  it('rewrites the REAL key, not a comment that merely mentions GENUDO_BASE_URL:', () => {
    const withComment = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    # old config used GENUDO_BASE_URL: https://legacy.example — replaced below
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_X}"
      GENUDO_BASE_URL: "https://api.genudo.ai"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = setGenudoUrl(withComment, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    // the real key is rewritten...
    expect(text).toContain('GENUDO_BASE_URL: https://genudo.acme.internal')
    // ...and the comment survives COMPLETELY untouched — not rewritten,
    // not duplicated, not dropped
    expect(text).toContain(
      '# old config used GENUDO_BASE_URL: https://legacy.example — replaced below',
    )
  })

  // Review finding (2026-07-29), round 3: `\s*` after the colon can match a
  // NEWLINE. A block-style key with an EMPTY value let the match cross onto
  // the FOLLOWING line and swallow it whole — verified to destroy the
  // GENUDO_TOKEN line entirely. Data loss in a committed, human-authored
  // vault file. `[ \t]*` (never `\s*`) cannot cross a newline.
  it('an EMPTY block-style GENUDO_BASE_URL value does not swallow the following line', () => {
    const emptyValue = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_BASE_URL:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_X}"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = setGenudoUrl(emptyValue, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('GENUDO_BASE_URL: https://genudo.acme.internal')
    // the following line survives completely intact
    expect(text).toContain('GENUDO_TOKEN: "${GENUDO_TOKEN_X}"')
    expect(text).not.toContain('/mcp')
  })

  // Review finding (2026-07-29), New Important 2: the ORDINARY, most common
  // stdio client — no GENUDO_BASE_URL override at all, defaulted for at
  // migrateWorkspaceYml's line 53 and modeled at genudo-server.test.ts's
  // "falls back to the production default" case. The old version only ever
  // rewrote an EXISTING line, so this client's environment field rendered
  // but was permanently unsettable — the exact stranding this function
  // exists to prevent, just for a different fixture shape than round 1 fixed.
  it('INSERTS GENUDO_BASE_URL (block-style) when the key is absent entirely', () => {
    const noOverride = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_ACME}"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = setGenudoUrl(noOverride, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('GENUDO_BASE_URL: https://genudo.acme.internal')
    expect(text).not.toContain('/mcp')
    // the existing key, and everything else, survives untouched
    expect(text).toContain('GENUDO_TOKEN: "${GENUDO_TOKEN_ACME}"')
    expect(text).toContain('command: npx')
    expect(text).toContain('genudo@genudo-ai')
  })

  // Review finding (2026-07-29): flow-style env is the loredex scaffold
  // TEMPLATE's own convention (agent-ops-scaffold.ts's WORKSPACE_TEMPLATE)
  // and the shape clients-create.test.ts's fixtures use — a real shape, not
  // a hypothetical one.
  it('rewrites GENUDO_BASE_URL in place for flow-style env with the key present', () => {
    const flowWithKey = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env: { GENUDO_TOKEN: "\${GENUDO_TOKEN_ACME}", GENUDO_BASE_URL: "https://api.genudo.ai" }
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = setGenudoUrl(flowWithKey, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('GENUDO_BASE_URL: https://genudo.acme.internal')
    expect(text).not.toContain('/mcp')
    expect(text).toContain('GENUDO_TOKEN: "${GENUDO_TOKEN_ACME}"')
    // still one line, still flow-style — not exploded into block-style
    expect(text).toContain(
      'env: { GENUDO_TOKEN: "${GENUDO_TOKEN_ACME}", GENUDO_BASE_URL: https://genudo.acme.internal }',
    )
  })

  it('INSERTS GENUDO_BASE_URL into flow-style env when the key is absent', () => {
    const flowNoKey = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env: { GENUDO_TOKEN: "\${GENUDO_TOKEN_ACME}" }
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = setGenudoUrl(flowNoKey, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain(
      'env: { GENUDO_TOKEN: "${GENUDO_TOKEN_ACME}", GENUDO_BASE_URL: https://genudo.acme.internal }',
    )
  })

  it('INSERTS GENUDO_BASE_URL into a completely empty flow-style env', () => {
    const emptyFlow = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env: {}
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = setGenudoUrl(emptyFlow, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('env: { GENUDO_BASE_URL: https://genudo.acme.internal }')
  })

  it('leaves a workspace.yml with no genudo block at all alone', () => {
    const noGenudo = `mcp:
  crm:
    command: npx
    args: [-y, crm-client]
plugins:
  claude: []
skills: []
`
    const { text, changed } = setGenudoUrl(noGenudo, 'https://genudo.acme.internal')
    expect(changed).toBe(false)
    expect(text).toBe(noGenudo)
  })

  // Review finding (2026-07-29): `type: "http"` is valid YAML and passes the
  // lib's schema check + the handler's `'url' in conn` guard, but the old
  // unquoted-only `/type:\s*http/` check silently treated this block as
  // still-stdio and no-op'd — the panel would print "up to date" while never
  // actually writing anything.
  it('recognises a QUOTED type: "http" as the already-migrated shape', () => {
    const quoted = `mcp:
  genudo:
    type: "http"
    url: https://api.genudo.ai/mcp
    headers:
      Authorization: "Bearer \${GENUDO_TOKEN_X}"
plugins:
  claude: [genudo-no-connector@genudo-ai]
skills: []
`
    const { text, changed } = setGenudoUrl(quoted, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('url: https://genudo.acme.internal/mcp')
  })

  // Review finding (2026-07-29): a genudo block that is the LAST thing in the
  // file, with no trailing newline after its final line, previously failed to
  // match GENUDO_BLOCK at all (every repeated line required a trailing `\n`,
  // including the last) — so the rewrite silently did nothing.
  it('rewrites a genudo block that is the last content in the file, no trailing newline', () => {
    const noTrailer =
      'mcp:\n' +
      '  genudo:\n' +
      '    type: http\n' +
      '    url: https://api.genudo.ai/mcp\n' +
      '    headers:\n' +
      '      Authorization: "Bearer ${GENUDO_TOKEN_LAST}"'
    // sanity: this fixture really has no trailing newline
    expect(noTrailer.endsWith('\n')).toBe(false)
    const { text, changed } = setGenudoUrl(noTrailer, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('url: https://genudo.acme.internal/mcp')
  })

  // Review finding (2026-07-29): pin that a sibling `genudo-old-platform:`
  // block (same indent, name-prefixed with "genudo") cannot leak into the
  // match — GENUDO_BLOCK requires the literal "genudo:" immediately (not
  // "genudo-old-platform:"), and the block-end lookahead correctly recognises
  // a same-indent sibling key as the boundary. Behaviour was already correct;
  // nothing pinned it.
  it('does not let a sibling genudo-old-platform: block leak into the match', () => {
    const withOldPlatform = `mcp:
  genudo:
    type: http
    url: https://api.genudo.ai/mcp
    headers:
      Authorization: "Bearer \${GENUDO_TOKEN_X}"
  genudo-old-platform:
    type: http
    url: https://old.genudo.ai/mcp
plugins:
  claude: [genudo-no-connector@genudo-ai]
skills: []
`
    const { text, changed } = setGenudoUrl(withOldPlatform, 'https://genudo.acme.internal')
    expect(changed).toBe(true)
    expect(text).toContain('url: https://genudo.acme.internal/mcp')
    // the sibling block's own url must survive completely untouched
    expect(text).toContain('url: https://old.genudo.ai/mcp')
  })
})

describe('migrateWorkspaceYml — normalisation agreement', () => {
  // Review finding (2026-07-29): migrateWorkspaceYml built its own
  // `${base.replace(/\/+$/, '')}/mcp`, which does not strip an EXISTING /mcp
  // suffix — a third copy of the normalisation rule silently disagreeing with
  // normalizeGenudoUrl/genudo-server.ts. The migration is dry-by-default and
  // has not touched the fleet yet, so this was worth fixing now rather than
  // after real data was migrated with the doubled suffix baked in.
  it('does not double /mcp when GENUDO_BASE_URL already ends in /mcp', () => {
    const alreadySuffixed = `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_ACME}"
      GENUDO_BASE_URL: "https://genudo.acme.internal/mcp"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`
    const { text, changed } = migrateWorkspaceYml(alreadySuffixed)
    expect(changed).toBe(true)
    expect(text).toContain('url: https://genudo.acme.internal/mcp')
    expect(text).not.toContain('/mcp/mcp')
  })
})
