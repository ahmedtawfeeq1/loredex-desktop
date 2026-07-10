# Loredex Desktop

macOS (arm64) desktop reader and control surface for [loredex](https://github.com/ahmedtawfeeq1/loredex) vaults — the same engine your CLI and agents use, embedded in-process.

Status: v0.1 walking skeleton (Epic 1 in progress).

## Development

```sh
npm install
npm run dev        # launch the app (electron-vite)
npm test           # vitest unit tests
npm run test:e2e   # E2E Nimbus suite — the release gate (see below)
npm run build      # typecheck + electron-vite build
npm run dist       # unsigned DMG/ZIP (arm64)
```

### E2E Nimbus suite (the release gate)

`npm run test:e2e` runs `tests/e2e/nimbus-suite.e2e.ts` — the executable
M1+M2 Definition of Done. It seeds the committed Nimbus fixture vault
(`tests/fixtures/nimbus-vault`) into a sandboxed local bare git remote,
clones it twice (two machines), and drives the full loop over the real IPC
seam: vault open → tree/read/wikilink → search facets → compose → reply →
accept/decline/snooze → fulfill → consume with identity → poller integration
(a real second-clone push) → atlas graph/tours/blocked-on/path → contract
timeline + pinned diff → activity grammar → sync-health loudness (F8) →
create/join wizards. Deterministic — no LLM, no network, no Electron; runs
in CI as its own job (`.github/workflows/ci.yml`, job `e2e`) and gates every
release. Wall time ≈ 25 s.

Architecture, IPC contract, and coding standards: `docs/architecture.md`.

## License

MIT
