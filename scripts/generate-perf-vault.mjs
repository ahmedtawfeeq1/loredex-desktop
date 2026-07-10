/**
 * Synthetic perf vault generator (story 15.2, AC1).
 *
 * Emits a DETERMINISTIC loredex-shaped vault: ≥1,200 notes across 8 projects
 * with topic folders, wikilinks, provenance fields, commit-sha mentions, and
 * 120 handoff cards covering every lifecycle state plus replies_to/fulfills
 * threads and `## Reading order` sections (everything the lib's listHandoffs
 * and the Atlas builder parse). Same seed → byte-identical output.
 *
 *   node scripts/generate-perf-vault.mjs <dir> [noteCount]
 *
 * or import { generatePerfVault } from vitest (tests/perf.test.ts does).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** mulberry32 — tiny seeded PRNG; determinism is the whole point. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PROJECTS = [
  'nimbus-web',
  'nimbus-api',
  'nimbus-mobile',
  'nimbus-infra',
  'nimbus-data',
  'nimbus-design',
  'nimbus-billing',
  'nimbus-auth',
]

const TOPICS = [
  'architecture',
  'auth',
  'billing',
  'caching',
  'contracts',
  'deploys',
  'incidents',
  'onboarding',
  'performance',
  'research',
  'search',
  'telemetry',
]

const TYPES = ['research', 'decision', 'analysis', 'note', 'plan']
const STATUSES = ['open', 'accepted', 'declined', 'snoozed', 'consumed']

const WORDS = (
  'vault index poller watcher contract timeline handoff routing atlas cluster ' +
  'schema frontmatter reconcile fetch merge commit branch remote token budget ' +
  'latency cache derived truth identity stamp receipt thread reply fulfil scope'
).split(' ')

function sentence(rand, n) {
  const parts = []
  for (let i = 0; i < n; i++) parts.push(WORDS[Math.floor(rand() * WORDS.length)])
  const s = parts.join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1) + '.'
}

function dateFor(rand) {
  // 18 months ending 2026-06-30, deterministic
  const day = Math.floor(rand() * 540)
  const d = new Date(Date.UTC(2026, 5, 30) - day * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function shaFor(rand) {
  let s = ''
  for (let i = 0; i < 10; i++) s += '0123456789abcdef'[Math.floor(rand() * 16)]
  return /\d/.test(s) ? s : `1${s.slice(1)}` // must read as a sha (needs a digit)
}

/**
 * Generate the vault. Returns { files, notes, handoffs } counts.
 * opts: { notes?: number (total incl. handoffs, default 1200), seed?: number }
 */
export function generatePerfVault(dir, opts = {}) {
  const total = opts.notes ?? 1200
  const rand = mulberry32(opts.seed ?? 20260710)
  const handoffTarget = Math.max(100, Math.floor(total / 10))
  const plainTarget = total - handoffTarget

  /** note names per project — wikilink + reading-order targets */
  const namesByProject = new Map(PROJECTS.map((p) => [p, []]))
  const allNames = []
  let written = 0

  // ── plain notes: projects/<p>/<topic>/<name>.md ────────────────────────────
  for (let i = 0; i < plainTarget; i++) {
    const project = PROJECTS[i % PROJECTS.length]
    const topic = TOPICS[Math.floor(rand() * TOPICS.length)]
    const type = TYPES[Math.floor(rand() * TYPES.length)]
    const date = dateFor(rand)
    const name = `${topic}-${type}-${String(i).padStart(4, '0')}`
    const lines = [
      '---',
      `project: ${project}`,
      `topic: ${topic}`,
      `type: ${type}`,
      `date: ${date}`,
    ]
    // ~15% carry provenance (source nodes in the Atlas)
    if (rand() < 0.15) {
      lines.push(
        `source_project: ${project}`,
        `source_rel: src/${topic}/${name}.ts`,
        `source_path: /work/${project}/src/${topic}/${name}.ts`,
      )
    }
    lines.push('---', '', sentence(rand, 12), '')
    // 2–4 wikilinks to earlier notes (the Atlas wikilink-edge load)
    const links = 2 + Math.floor(rand() * 3)
    for (let l = 0; l < links && allNames.length > 0; l++) {
      const target = allNames[Math.floor(rand() * allNames.length)]
      lines.push(`See [[${target}]] for prior art. ${sentence(rand, 8)}`)
    }
    // ~10% mention a commit sha (commit nodes + mentioned-tier links)
    if (rand() < 0.1) lines.push('', `Shipped in ${shaFor(rand)}.`)
    lines.push('', sentence(rand, 10), '')

    const rel = join('projects', project, topic)
    mkdirSync(join(dir, rel), { recursive: true })
    writeFileSync(join(dir, rel, `${name}.md`), lines.join('\n'))
    namesByProject.get(project).push(name)
    allNames.push(name)
    written++
  }

  // ── handoff cards: projects/<to>/handoffs/<date>-handoff-<from>-<i>.md ─────
  const handoffNames = []
  for (let i = 0; i < handoffTarget; i++) {
    const from = PROJECTS[Math.floor(rand() * PROJECTS.length)]
    let to = PROJECTS[Math.floor(rand() * PROJECTS.length)]
    if (to === from) to = PROJECTS[(PROJECTS.indexOf(from) + 1) % PROJECTS.length]
    const status = STATUSES[i % STATUSES.length]
    const kind = rand() < 0.3 ? 'request' : 'delivery'
    const date = dateFor(rand)
    const name = `${date}-handoff-${from}-${String(i).padStart(3, '0')}`
    const lines = [
      '---',
      `status: ${status}`,
      `kind: ${kind}`,
      `from_project: ${from}`,
      `to_project: ${to}`,
      `objective: ${sentence(rand, 6)}`,
      `date: ${date}`,
      'loredex_schema: 2',
    ]
    if (status === 'snoozed') lines.push(`snoozed_until: ${i % 2 === 0 ? '2026-01-01' : '2027-01-01'}`)
    if (status === 'declined') lines.push('declined_reason: synthetic decline')
    // ~25% thread onto an earlier handoff (thread edges + rails)
    if (handoffNames.length > 0 && rand() < 0.25) {
      const parent = handoffNames[Math.floor(rand() * handoffNames.length)]
      lines.push(rand() < 0.5 ? `replies_to: ${parent}` : `fulfills: ${parent}`)
    }
    lines.push('---', '', sentence(rand, 10), '', '## Reading order', '')
    const pool = namesByProject.get(from)
    for (let r = 0; r < 3 && pool.length > 0; r++) {
      lines.push(`1. [[${pool[Math.floor(rand() * pool.length)]}]]`)
    }
    lines.push('')

    const rel = join('projects', to, 'handoffs')
    mkdirSync(join(dir, rel), { recursive: true })
    writeFileSync(join(dir, rel, `${name}.md`), lines.join('\n'))
    handoffNames.push(name)
    written++
  }

  return { files: written, notes: plainTarget, handoffs: handoffTarget }
}

// CLI entry: node scripts/generate-perf-vault.mjs <dir> [noteCount]
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: node scripts/generate-perf-vault.mjs <dir> [noteCount]')
    process.exit(1)
  }
  const counts = generatePerfVault(dir, {
    ...(process.argv[3] ? { notes: Number(process.argv[3]) } : {}),
  })
  console.log(`perf vault: ${counts.files} files (${counts.notes} notes + ${counts.handoffs} handoffs) → ${dir}`)
}
