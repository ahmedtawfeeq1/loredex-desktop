#!/usr/bin/env node
/**
 * Native-ABI staging (story 15.1) — runs as `predev` and `postdist`.
 *
 * Problem: better-sqlite3 is a V8-native (non-N-API) addon — one binary serves
 * EITHER plain node (vitest, ABI 115) OR Electron (ABI 148), never both.
 * `@electron/rebuild` and electron-builder's dist rebuild overwrite
 * `build/Release` IN PLACE, so fixing one runtime silently broke the other
 * (the QA crash-loop <-> broken-tests seesaw).
 *
 * Mechanism: rebuild for Electron once, MOVE the Electron binary to a staging
 * path OUTSIDE the module (`node_modules/.loredex-natives/electron/`), then
 * restore the plain-node prebuild into `build/Release`. The core host passes
 * the staged path as better-sqlite3's `nativeBinding` option when running
 * under Electron (src/core/db/native-binding.ts); node keeps default
 * resolution, so vitest never sees the Electron binary. @parcel/watcher is
 * N-API (prebuildify --napi) — ABI-stable across both runtimes, nothing to do.
 *
 * Idempotent: a stamp (module + electron versions) skips the rebuild; the
 * plain-node check + `npm rebuild better-sqlite3` runs every time, which is
 * what un-breaks the tree after `npm run dist` rebuilt natives in place.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(join(root, 'package.json'))
const moduleDir = dirname(require_.resolve('better-sqlite3/package.json'))
const built = join(moduleDir, 'build', 'Release', 'better_sqlite3.node')
const stageDir = join(root, 'node_modules', '.loredex-natives', 'electron')
const staged = join(stageDir, 'better_sqlite3.node')
const stampFile = join(stageDir, 'stamp.json')
const stamp = JSON.stringify({
  'better-sqlite3': require_('better-sqlite3/package.json').version,
  electron: require_('electron/package.json').version,
})

function fail(msg) {
  console.error(`[natives] FAIL — ${msg}`)
  process.exit(1)
}

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, stdio: 'inherit' }).status === 0
}

/** Can THIS node open a db through the given binding (default when null)? */
function nodeCanOpen(binding) {
  const expr = binding
    ? `new (require('better-sqlite3'))(':memory:', { nativeBinding: ${JSON.stringify(binding)} })`
    : `new (require('better-sqlite3'))(':memory:')`
  return spawnSync(process.execPath, ['-e', expr], { cwd: root }).status === 0
}

/** Definitive check: the staged binary must open under the Electron runtime. */
function electronCanOpen(binding) {
  const checkFile = join(stageDir, 'stage-check.cjs')
  writeFileSync(
    checkFile,
    `const { createRequire } = require('node:module');\n` +
      `const r = createRequire(${JSON.stringify(join(root, 'package.json'))});\n` +
      `new (r('better-sqlite3'))(':memory:', { nativeBinding: ${JSON.stringify(binding)} });\n`,
  )
  const electronBin = join(root, 'node_modules', '.bin', 'electron')
  const res = spawnSync(electronBin, [checkFile], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  rmSync(checkFile, { force: true })
  return res.status === 0
}

// 1 — stage the Electron-ABI binary (skipped when the stamp is fresh)
const fresh =
  existsSync(staged) && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp
if (!fresh) {
  console.log('[natives] staging Electron-ABI better_sqlite3.node (electron-builder install-app-deps)…')
  if (!run(join(root, 'node_modules', '.bin', 'electron-builder'), ['install-app-deps']))
    fail('electron-builder install-app-deps exited non-zero')
  if (!existsSync(built)) fail(`rebuild produced no binary at ${built}`)
  if (nodeCanOpen(built))
    fail('install-app-deps left a plain-node binary in build/Release — expected an Electron rebuild')
  mkdirSync(stageDir, { recursive: true })
  rmSync(staged, { force: true })
  renameSync(built, staged)
  if (!electronCanOpen(staged)) {
    rmSync(stampFile, { force: true })
    fail(`staged binary does not load under Electron (${staged})`)
  }
  writeFileSync(stampFile, stamp)
  console.log(`[natives] staged → ${staged}`)
}

// 2 — restore/keep the plain-node default so vitest keeps its ABI
if (!nodeCanOpen(null)) {
  console.log('[natives] build/Release is not plain-node ABI — restoring (npm rebuild better-sqlite3)…')
  if (!run('npm', ['rebuild', 'better-sqlite3'])) fail('npm rebuild better-sqlite3 exited non-zero')
  if (!nodeCanOpen(null)) fail('build/Release still does not load under plain node after rebuild')
}

console.log(`[natives] OK — electron: ${staged} | node: build/Release (default)`)
