/**
 * Native-module smoke (story 9.3 AC6, risk 5 — ABI churn): @parcel/watcher
 * subscribe → real FSEvents emit → unsubscribe, against whatever ABI this
 * runner uses. CI reruns it under the packaged Electron ABI (see ci.yml).
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { startVaultWatcher } from '../../src/core/watcher'

describe('@parcel/watcher native smoke', () => {
  it('subscribes, receives a batched event for a written note, stops cleanly', async () => {
    const vault = mkdtempSync(join(tmpdir(), 'loredex-native-watcher-'))
    const batches: string[][] = []
    const watcher = await startVaultWatcher({
      vaultPath: vault,
      debounceMs: 100,
      sink: {
        onBatch: (paths) => batches.push(paths),
        onStorm: () => batches.push([]),
      },
      onError: (text) => {
        throw new Error(text)
      },
    })
    try {
      // FSEvents subscriptions settle asynchronously — give macOS a beat
      await new Promise((resolve) => setTimeout(resolve, 300))
      writeFileSync(join(vault, 'note.md'), '# hello\n')
      const deadline = Date.now() + 5_000
      while (batches.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(batches.length).toBeGreaterThan(0)
      expect(batches[0]).toContain('note.md')
    } finally {
      await watcher.stop()
    }
  }, 15_000)
})
