/**
 * Story 2.2: Obsidian shortest-path wikilink resolution — happy path, nested
 * suffix, collision → ambiguous picker data, broken, relative, index cache.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { invalidateLinkIndex, resolveLink } from './links'

const VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const FROM = 'projects/nimbus-web/2026-07-08 - nimbus-web - crosslinks.md'

describe('resolveLink (Obsidian shortest-path)', () => {
  it('resolves a unique basename anywhere in the vault', () => {
    expect(resolveLink(VAULT, 'Start Here - Product', FROM)).toEqual({
      status: 'resolved',
      target: 'Start Here - Product.md',
    })
    expect(resolveLink(VAULT, '2026-07-02 - nimbus-api - rate limiting research', FROM)).toEqual({
      status: 'resolved',
      target: 'projects/nimbus-api/2026-07-02 - nimbus-api - rate limiting research.md',
    })
  })

  it('resolves exact vault-relative paths, with or without .md', () => {
    const target = 'projects/nimbus-web/meetings/2026-07-07 - meeting-notes.md'
    expect(resolveLink(VAULT, target, FROM)).toEqual({ status: 'resolved', target })
    expect(resolveLink(VAULT, target.replace(/\.md$/, ''), FROM)).toEqual({
      status: 'resolved',
      target,
    })
  })

  it('tolerates |alias and #heading parts and is case-insensitive', () => {
    expect(resolveLink(VAULT, 'start here - product#Overview', FROM).status).toBe('resolved')
    expect(resolveLink(VAULT, 'Start Here - Product|the brief', FROM).status).toBe('resolved')
  })

  it('disambiguates via the shortest distinguishing path suffix', () => {
    const viaSuffix = resolveLink(VAULT, 'nimbus-api/meetings/2026-07-07 - meeting-notes', FROM)
    expect(viaSuffix).toEqual({
      status: 'resolved',
      target: 'projects/nimbus-api/meetings/2026-07-07 - meeting-notes.md',
    })
  })

  it('cross-project basename collision → ambiguous with project-context candidates', () => {
    const res = resolveLink(VAULT, '2026-07-07 - meeting-notes', FROM)
    expect(res.status).toBe('ambiguous')
    expect(res.candidates).toEqual([
      {
        path: 'projects/nimbus-api/meetings/2026-07-07 - meeting-notes.md',
        project: 'nimbus-api',
      },
      {
        path: 'projects/nimbus-web/meetings/2026-07-07 - meeting-notes.md',
        project: 'nimbus-web',
      },
    ])
  })

  it('missing target → broken (and never creates a file)', () => {
    expect(resolveLink(VAULT, 'ghost-note', FROM)).toEqual({ status: 'broken' })
    expect(resolveLink(VAULT, '', FROM)).toEqual({ status: 'broken' })
  })

  it('resolves ./relative links against the linking note folder', () => {
    expect(resolveLink(VAULT, './meetings/2026-07-07 - meeting-notes', FROM)).toEqual({
      status: 'resolved',
      target: 'projects/nimbus-web/meetings/2026-07-07 - meeting-notes.md',
    })
    expect(resolveLink(VAULT, './ghost', FROM)).toEqual({ status: 'broken' })
  })

  it('caches the index until invalidated (refresh hook)', () => {
    const vault = mkdtempSync(join(tmpdir(), 'loredex-links-'))
    writeFileSync(join(vault, 'a.md'), '# a\n')
    expect(resolveLink(vault, 'a', '')).toEqual({ status: 'resolved', target: 'a.md' })
    mkdirSync(join(vault, 'later'))
    writeFileSync(join(vault, 'later', 'b.md'), '# b\n')
    expect(resolveLink(vault, 'b', '').status).toBe('broken') // cached index
    invalidateLinkIndex(vault)
    expect(resolveLink(vault, 'b', '')).toEqual({ status: 'resolved', target: 'later/b.md' })
  })
})
