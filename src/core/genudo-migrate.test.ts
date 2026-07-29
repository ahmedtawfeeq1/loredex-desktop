import { describe, expect, it } from 'vitest'
import { migrateWorkspaceYml, pruneEnabledPlugins } from './genudo-migrate'

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
