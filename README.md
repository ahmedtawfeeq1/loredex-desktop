# Loredex Desktop

macOS (arm64) desktop reader and control surface for [loredex](https://github.com/ahmedtawfeeq1/loredex) vaults — the same engine your CLI and agents use, embedded in-process.

Status: v0.1 walking skeleton (Epic 1 in progress).

## Development

```sh
npm install
npm run dev        # launch the app (electron-vite)
npm test           # vitest unit tests
npm run build      # typecheck + electron-vite build
npm run dist       # unsigned DMG/ZIP (arm64)
```

Architecture, IPC contract, and coding standards: `docs/architecture.md`.

## License

MIT
