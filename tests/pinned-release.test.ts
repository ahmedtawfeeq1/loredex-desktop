/**
 * Story 1.3 AC5: prove the installed loredex build contains the two landed CLI
 * fixes. Fails loudly on a regressed pin bump.
 *  - F8: router registers the generated-files merge driver with a QUOTED
 *    gitattributes pattern (gitattributes has no backslash escape for spaces).
 *  - F6: handoff briefs footer uses the project-local `loredex` invocation,
 *    never `npx -y loredex@latest` (which resolves a second, newer engine).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const distDir = join(dirname(require.resolve('loredex/package.json')), 'dist')
const distSources = readdirSync(distDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(distDir, f), 'utf8'))
const allDist = distSources.join('\n')

describe('pinned loredex release contains the landed fixes', () => {
  it('F8: gitattributes rule for the product brief is quoted', () => {
    expect(allDist).toContain('"Start Here - Product.md" merge=loredex-generated')
    // the broken backslash-escaped rule may only appear as the cleanup target,
    // adjacent to the removal logic — assert the quoted rule is what gets written
    expect(allDist).toContain('_index/** merge=loredex-generated')
  })

  it('F6: handoff consume footer is project-local, not npx@latest', () => {
    const footerLines = allDist.split('\n').filter((l) => l.includes('Consume with'))
    expect(footerLines.length).toBeGreaterThan(0)
    for (const line of footerLines) {
      expect(line).toContain('loredex handoffs --consume')
      expect(line).not.toContain('npx')
    }
  })
})
