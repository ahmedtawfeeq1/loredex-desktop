#!/usr/bin/env node
/**
 * node-pty@1.1.0 ships prebuilds/<platform>/spawn-helper mode 644 in its npm
 * tarball and never repairs it (no chmod in its install scripts or its runtime
 * loader), so a fresh install dies with "posix_spawnp failed" on first spawn.
 * Runs as `postinstall` so dev, CI, and release builds all get an executable
 * helper — electron-builder then packs the on-disk mode into app.asar.unpacked.
 * Also invoked defensively by scripts/prepare-electron-natives.mjs.
 */
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
try {
  const require_ = createRequire(join(root, 'package.json'))
  const prebuilds = join(dirname(require_.resolve('node-pty/package.json')), 'prebuilds')
  if (existsSync(prebuilds)) {
    for (const platformDir of readdirSync(prebuilds)) {
      const helper = join(prebuilds, platformDir, 'spawn-helper')
      if (existsSync(helper)) chmodSync(helper, 0o755)
    }
  }
} catch {
  // node-pty not installed (partial/omit install) — nothing to fix
}
