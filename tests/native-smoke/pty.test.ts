/**
 * Native-module smoke (terminal-splits blueprint 2026-07-18): node-pty spawn →
 * real shell echo → clean exit, against whatever ABI this runner uses. node-pty
 * is N-API, so one prebuild serves plain node AND Electron; CI reruns this
 * under the packaged Electron ABI (see ci.yml native-smoke step).
 */
import * as pty from 'node-pty'
import { describe, expect, it } from 'vitest'

describe('node-pty native smoke', () => {
  it('spawns a shell, receives its output, exits 0', async () => {
    const proc = pty.spawn('/bin/sh', ['-c', 'echo PTY_OK'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
    })
    let output = ''
    proc.onData((d) => {
      output += d
    })
    const exitCode = await new Promise<number>((resolve) => {
      proc.onExit(({ exitCode: code }) => resolve(code))
    })
    expect(output).toContain('PTY_OK')
    expect(exitCode).toBe(0)
  }, 15_000)
})
