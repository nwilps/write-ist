# Local-first, and readable without the app

Write-ist is fully local: no accounts, no sync, no network, no telemetry. A second and
stronger constraint sits underneath it — **the manuscript must remain readable if this
application disappears.** Not exportable, not recoverable with effort: readable, in a text
editor, by someone who has never heard of Write-ist.

These are values decisions rather than technical ones, but they constrain more of the design
than any technical choice does, which is why they are recorded first.

## Consequences

- **The manuscript cannot live in an opaque container.** An embedded database or a binary
  document format fails the readability test no matter how convenient it is. This is the
  constraint that makes plain text the only viable answer, and so is the real parent of
  ADR-0004.
- **A mobile companion stays rejected**, because it is the assumption most likely to
  reappear and it demands sync. Sync contradicts local-first directly.
- Being offline removes an enormous class of decisions — auth, session handling, conflict
  resolution, server cost, privacy policy, uptime. That absence is a feature, not a gap to
  fill in later.
