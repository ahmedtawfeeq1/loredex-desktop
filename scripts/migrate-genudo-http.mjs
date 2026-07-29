#!/usr/bin/env node
/**
 * Fleet migration runner. Dry by default — `--apply` is required to write.
 *
 *   node scripts/migrate-genudo-http.mjs --vault ~/path/to/dex
 *   node scripts/migrate-genudo-http.mjs --vault ~/path/to/dex --apply
 *
 * Re-materialize afterwards from the app (Re-wire) so each client's .mcp.json is
 * regenerated with a live credential.
 *
 * `electron.vite.config.ts` bundles `src/core` into a single `out/main/core.js` —
 * there is no per-module `out/main/genudo-migrate.js` to import. This tries that
 * built path first (in case the build ever starts emitting per-module output) and
 * falls back to the TypeScript source, which only resolves when this script itself
 * is run through a TS-aware loader: `npx tsx scripts/migrate-genudo-http.mjs …`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let migrateWorkspaceYml, pruneEnabledPlugins
try {
  ;({ migrateWorkspaceYml, pruneEnabledPlugins } = await import('../out/main/genudo-migrate.js'))
} catch {
  try {
    ;({ migrateWorkspaceYml, pruneEnabledPlugins } = await import('../src/core/genudo-migrate.ts'))
  } catch (err) {
    console.error('Could not load migrateWorkspaceYml/pruneEnabledPlugins from either')
    console.error('  ../out/main/genudo-migrate.js (not built as its own module — expected)')
    console.error('  ../src/core/genudo-migrate.ts (needs a TS-aware loader)')
    console.error('Run this script with tsx: npx tsx scripts/migrate-genudo-http.mjs --vault <dex path>')
    console.error(String(err))
    process.exit(1)
  }
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const vault = args[args.indexOf('--vault') + 1]
if (!vault || !existsSync(join(vault, 'projects'))) {
  console.error('usage: migrate-genudo-http.mjs --vault <dex path> [--apply]')
  process.exit(1)
}

let touched = 0
for (const slug of readdirSync(join(vault, 'projects'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)) {
  const dir = join(vault, 'projects', slug)
  const ws = join(dir, 'workspace.yml')
  if (existsSync(ws)) {
    const { text, changed } = migrateWorkspaceYml(readFileSync(ws, 'utf8'))
    if (changed) {
      touched += 1
      console.log(`${apply ? 'migrate' : 'would migrate'}  ${slug}/workspace.yml`)
      if (apply) writeFileSync(ws, text)
    }
  }
  const settings = join(dir, '.claude', 'settings.json')
  if (existsSync(settings)) {
    const { json, changed } = pruneEnabledPlugins(readFileSync(settings, 'utf8'))
    if (changed) {
      console.log(`${apply ? 'prune   ' : 'would prune  '} ${slug}/.claude/settings.json`)
      if (apply) writeFileSync(settings, json)
    }
  }
}
console.log(`\n${touched} client(s) ${apply ? 'migrated' : 'would change'}${apply ? '' : ' — re-run with --apply'}`)
