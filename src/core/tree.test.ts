/**
 * Story 2.1: the vault tree walk — exclusion rules, ordering, flattening.
 * Runs against a constructed temp vault plus the fixture vault.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { TreeNode } from '../shared/types'
import { listMarkdownFiles, walkVault } from './tree'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')

let vault: string

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'loredex-tree-'))
  const put = (rel: string, content = '# x\n'): void => {
    mkdirSync(join(vault, rel, '..'), { recursive: true })
    writeFileSync(join(vault, rel), content)
  }
  put('Start Here - Product.md')
  put('projects/beta/note-b.md')
  put('projects/alpha/note-a.md')
  put('projects/alpha/deep/nested.md')
  put('.git/config', '[core]\n') // must be hidden
  put('.obsidian/app.json', '{}') // dotfolder hidden
  put('.hidden.md') // dotfile hidden
  put('projects/alpha/image.png') // non-markdown hidden
  mkdirSync(join(vault, 'projects/empty-dir'), { recursive: true }) // no md → dropped
})

const names = (nodes: TreeNode[]): string[] => nodes.map((n) => n.name)

describe('walkVault', () => {
  it('excludes .git, dotfolders, dotfiles, non-markdown and empty dirs', () => {
    const flat = listMarkdownFiles(vault)
    expect(flat).toEqual([
      'projects/alpha/deep/nested.md',
      'projects/alpha/note-a.md',
      'projects/beta/note-b.md',
      'Start Here - Product.md',
    ])
    expect(flat.join()).not.toMatch(/\.git|\.obsidian|\.hidden|image\.png/)
    const top = walkVault(vault)
    expect(names(top)).toEqual(['projects', 'Start Here - Product'])
  })

  it('sorts dirs first, then case-insensitive alpha, and nests children', () => {
    const projects = walkVault(vault).find((n) => n.name === 'projects')
    expect(projects?.kind).toBe('dir')
    expect(names(projects?.children ?? [])).toEqual(['alpha', 'beta'])
    const alpha = projects?.children?.find((n) => n.name === 'alpha')
    expect(names(alpha?.children ?? [])).toEqual(['deep', 'note-a'])
    const file = alpha?.children?.find((n) => n.kind === 'file')
    expect(file?.path).toBe('projects/alpha/note-a.md')
  })

  it('walks the fixture vault', () => {
    expect(listMarkdownFiles(FIXTURE_VAULT)).toContain(
      'projects/nimbus-api/2026-07-02 - nimbus-api - rate limiting research.md',
    )
  })
})
