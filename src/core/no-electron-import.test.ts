/**
 * `src/core` runs in Electron's utilityProcess, which exposes only a subset of
 * the `electron` module — no `shell`, no `app`, no `BrowserWindow`. An import of
 * any of them type-checks fine, passes every unit test that mocks `electron`,
 * and then kills the core host on the first real launch:
 *
 *   SyntaxError: The requested module 'electron' does not provide an export
 *   named 'shell'
 *
 * That happened (2026-07-29, genudo-auth.ts) and no test caught it, because the
 * suite mocks `electron` — the mock is exactly what hides the defect. A static
 * check is the honest guard: anything in core needing a main-process capability
 * belongs in `src/main`, reached over IPC.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CORE_DIR = join(__dirname)

/**
 * Comments are stripped before matching. The first version of this test matched
 * its own doc comment — the very comment explaining the defect — because the
 * import pattern's `[^;]*` spanned newlines. Strip first, then any surviving
 * `from 'electron'` is a real import, multi-line import blocks included.
 */
function importsElectron(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  return (
    /\bfrom\s*['"]electron['"]/.test(code) ||
    /\brequire\(\s*['"]electron['"]\s*\)/.test(code) ||
    /\bimport\s*['"]electron['"]/.test(code)
  )
}

describe('src/core never imports electron', () => {
  it('no non-test module in src/core imports or requires electron', () => {
    const offenders = readdirSync(CORE_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
      .filter((e) => importsElectron(readFileSync(join(CORE_DIR, e.name), 'utf8')))
      .map((e) => e.name)

    expect(offenders).toEqual([])
  })

  it('detects the shapes it is meant to catch', () => {
    // guards the guard: a matcher that matched nothing would pass vacuously
    expect(importsElectron("import { shell } from 'electron'\n")).toBe(true)
    expect(importsElectron('import { app } from "electron"\n')).toBe(true)
    expect(importsElectron("import {\n  shell,\n} from 'electron'\n")).toBe(true)
    expect(importsElectron("const { shell } = require('electron')")).toBe(true)
    expect(importsElectron("import 'electron'\n")).toBe(true)
  })

  it('does not fire on prose or on unrelated imports', () => {
    expect(importsElectron("import { join } from 'node:path'\n")).toBe(false)
    expect(importsElectron("/** never write import { shell } from 'electron' here */\n")).toBe(false)
    expect(importsElectron("// import { app } from 'electron'\n")).toBe(false)
  })
})
