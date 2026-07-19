import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const root = import.meta.dirname

// the app version, injected at build time so the header shows the exact build —
// identical string across every OS installer (all built from this package.json)
const { version: APP_VERSION } = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as { version: string }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'src/main/index.ts'),
          // core host entry — forked via utilityProcess.fork from main
          core: resolve(root, 'src/core/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/preload/index.ts') },
        // sandboxed preload scripts cannot be ESM — emit CJS
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
  },
})
