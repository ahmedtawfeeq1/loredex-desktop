# vendor/

`loredex-2.8.0.tgz` — engine build from loredex commit `5df5e75` (v2.8.0 + the
desktop agent-ops verbs: `copyWorkspaceSpec`, `workspaceEnvRefs`, servers
subset, inbox list). The committed Add Client feature needs these exports and
no published loredex version has them yet, so the build is vendored — a
repo-relative `file:` path resolves on CI and fresh clones, unlike a sibling
checkout path.

Remove this directory and repoint `package.json` to the registry once the next
loredex engine release (2.8.1+) ships these exports.
