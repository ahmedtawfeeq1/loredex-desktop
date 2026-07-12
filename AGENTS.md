# Agent instructions

<!-- loredex:start -->
## Research filing (loredex)

When you produce research, analysis, findings, plans, or similar markdown in
this project, add YAML frontmatter so loredex can auto-file it into the vault:

```yaml
---
project: loredex-desktop
topic: <kebab-case-topic>
type: research | finding | analysis | snapshot | note
date: YYYY-MM-DD
source: claude-code | codex | cursor | manual
tags: []
---
```

Write such files into the vault inbox at `/Users/tawfeeq/Loredex/_inbox`, or into this
project's `docs/` — `loredex route` picks up both.

Never add `loredex: routed` yourself — the router stamps it after filing.
A pre-stamped file is skipped as already-filed and will never reach the vault.
<!-- loredex:end -->
