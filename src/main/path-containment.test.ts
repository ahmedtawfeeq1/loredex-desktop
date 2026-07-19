/**
 * WP-F: containment + open-eligibility gates (the reveal/open security surface).
 * Real temp dirs + a real symlink exercise the realpath escape defence.
 */
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { isInsideVault, isOpenableExt } from './path-containment'

let vault: string
let outside: string

beforeAll(() => {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-contain-')))
  vault = join(sandbox, 'vault')
  outside = join(sandbox, 'outside')
  mkdirSync(join(vault, 'projects', 'acme'), { recursive: true })
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(vault, 'projects', 'acme', 'report.pdf'), 'x')
  writeFileSync(join(outside, 'secret.pdf'), 'x')
  // a symlink INSIDE the vault pointing OUT — the classic escape
  symlinkSync(join(outside, 'secret.pdf'), join(vault, 'projects', 'acme', 'escape.pdf'))
  // a sibling dir whose name is a prefix of the vault ("/vault" vs "/vault-evil")
  mkdirSync(`${vault}-evil`, { recursive: true })
  writeFileSync(join(`${vault}-evil`, 'x.pdf'), 'x')
})

describe('isInsideVault', () => {
  it('accepts a real file inside the vault', () => {
    expect(isInsideVault(vault, join(vault, 'projects', 'acme', 'report.pdf'))).toBe(true)
  })
  it('accepts the vault root itself', () => {
    expect(isInsideVault(vault, vault)).toBe(true)
  })
  it('rejects a path outside the vault', () => {
    expect(isInsideVault(vault, join(outside, 'secret.pdf'))).toBe(false)
  })
  it('rejects a `..` traversal that escapes', () => {
    expect(isInsideVault(vault, join(vault, 'projects', '..', '..', 'outside', 'secret.pdf'))).toBe(
      false,
    )
  })
  it('rejects a symlink that points OUT of the vault (realpath defeats it)', () => {
    expect(isInsideVault(vault, join(vault, 'projects', 'acme', 'escape.pdf'))).toBe(false)
  })
  it('rejects a sibling whose name merely prefixes the vault (/vault-evil)', () => {
    expect(isInsideVault(vault, join(`${vault}-evil`, 'x.pdf'))).toBe(false)
  })
  it('rejects a missing target', () => {
    expect(isInsideVault(vault, join(vault, 'nope.pdf'))).toBe(false)
  })
})

describe('isOpenableExt (allowlist)', () => {
  it('allows documents + images', () => {
    for (const p of ['a.pdf', 'b.XLSX', 'c.docx', 'd.png', 'e.jpg', 'f.csv']) {
      expect(isOpenableExt(p), p).toBe(true)
    }
  })
  it('refuses executables, bundles, scripts, archives, unknown', () => {
    for (const p of ['x.command', 'y.app', 'z.desktop', 'w.jar', 'v.sh', 'u.zip', 'no-ext']) {
      expect(isOpenableExt(p), p).toBe(false)
    }
  })
})
