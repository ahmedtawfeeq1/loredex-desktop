/**
 * Story 2.1: the vault tree walk — exclusion rules, ordering, flattening.
 * Runs against a constructed temp vault plus the fixture vault.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { TreeNode } from '../shared/types'
import { groupProjectsInTree, listMarkdownFiles, walkVault } from './tree'

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

describe('walkVault dataFiles mode (agent-ops)', () => {
  let opsVault: string
  beforeAll(() => {
    opsVault = mkdtempSync(join(tmpdir(), 'loredex-tree-ops-'))
    const put = (rel: string, content = 'x\n'): void => {
      mkdirSync(join(opsVault, rel, '..'), { recursive: true })
      writeFileSync(join(opsVault, rel), content)
    }
    put('projects/brightsmile-dental/pipelines/booking/_persona.md', '# p\n')
    put('projects/brightsmile-dental/pipelines/booking/_actions.curls.yaml', '# a\n')
    put('projects/brightsmile-dental/knowledge_tables/patients.csv', 'a,b\n1,2\n')
    put('projects/brightsmile-dental/automation_workflows/flow.json', '{}')
    put('projects/brightsmile-dental/workspace.yml', '# ws\n')
    mkdirSync(join(opsVault, 'projects/brightsmile-dental/_inbox'), { recursive: true })
  })

  it('md-only walk drops data-only dirs (research behavior unchanged)', () => {
    const client = walkVault(opsVault)
      .find((n) => n.name === 'projects')
      ?.children?.find((n) => n.name === 'brightsmile-dental')
    expect(names(client?.children ?? [])).toEqual(['pipelines'])
  })

  it('dataFiles walk includes yaml/json/csv with fileType, keeps their dirs', () => {
    const client = walkVault(opsVault, '', { dataFiles: true })
      .find((n) => n.name === 'projects')
      ?.children?.find((n) => n.name === 'brightsmile-dental')
    expect(names(client?.children ?? [])).toEqual([
      'automation_workflows',
      'knowledge_tables',
      'pipelines',
      'workspace.yml',
    ])
    const tables = client?.children?.find((n) => n.name === 'knowledge_tables')
    const csv = tables?.children?.[0]
    expect(csv?.name).toBe('patients.csv') // data files keep their extension
    expect(csv?.fileType).toBe('csv')
    expect(csv?.path).toBe('projects/brightsmile-dental/knowledge_tables/patients.csv')
    const booking = client?.children
      ?.find((n) => n.name === 'pipelines')
      ?.children?.find((n) => n.name === 'booking')
    expect(names(booking?.children ?? [])).toEqual(['_actions.curls.yaml', '_persona'])
    expect(booking?.children?.find((n) => n.fileType === 'md')?.name).toBe('_persona')
    // a truly empty dir still drops — the inbox badge reads clients.fleet, not the tree
    expect(names(client?.children ?? [])).not.toContain('_inbox')
  })
})

describe('groupProjectsInTree', () => {
  // stand-in for loredex's groupProjects bound to a manifest
  const grouper = (projects: string[]) => {
    const map: Record<string, string[]> = {
      genudo: ['genudo-ai-engine', 'genudo-website'],
      loredex: ['loredex-desktop'],
    }
    const assigned = new Set<string>()
    const groups: Array<{ product: string | null; projects: string[] }> = []
    for (const [product, members] of Object.entries(map)) {
      const present = projects.filter((p) => members.includes(p))
      if (present.length) {
        groups.push({ product, projects: present })
        for (const p of present) assigned.add(p)
      }
    }
    const ungrouped = projects.filter((p) => !assigned.has(p))
    if (ungrouped.length) groups.push({ product: null, projects: ungrouped })
    return groups
  }

  const projectsNode = (): TreeNode => ({
    name: 'projects',
    path: 'projects',
    kind: 'dir',
    children: [
      { name: 'genudo-ai-engine', path: 'projects/genudo-ai-engine', kind: 'dir', children: [] },
      { name: 'genudo-website', path: 'projects/genudo-website', kind: 'dir', children: [] },
      { name: 'loredex-desktop', path: 'projects/loredex-desktop', kind: 'dir', children: [] },
      { name: 'orphan', path: 'projects/orphan', kind: 'dir', children: [] },
    ],
  })

  it('wraps project dirs in product nodes, Ungrouped last', () => {
    const [projects] = groupProjectsInTree([projectsNode()], grouper)
    const productNames = projects?.children?.map((c) => c.name)
    expect(productNames).toEqual(['genudo', 'loredex', 'Ungrouped'])
    const genudo = projects?.children?.find((c) => c.name === 'genudo')
    expect(genudo?.children?.map((c) => c.name)).toEqual(['genudo-ai-engine', 'genudo-website'])
    // virtual product node uses a synthetic, non-file path
    expect(genudo?.path).toBe('projects#product=genudo')
  })

  it('leaves the tree flat when no products are defined', () => {
    const flatGrouper = (projects: string[]) => [{ product: null, projects }]
    const [projects] = groupProjectsInTree([projectsNode()], flatGrouper)
    expect(projects?.children?.map((c) => c.name)).toEqual([
      'genudo-ai-engine',
      'genudo-website',
      'loredex-desktop',
      'orphan',
    ])
  })

  it('leaves non-projects top-level nodes untouched', () => {
    const index: TreeNode = { name: '_index', path: '_index', kind: 'dir', children: [] }
    const [node] = groupProjectsInTree([index], grouper)
    expect(node).toBe(index)
  })
})
