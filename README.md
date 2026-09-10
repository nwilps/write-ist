# Write-ist

A fully local, offline writing application. A project is created as a *format* —
screenplay, novel, short story, essay — and opens onto an editing surface tuned to it,
with planning workspaces alongside and format-appropriate export.

No accounts. No sync. No network. Your documents remain readable if this app disappears.

## Status

**v2 — pre-implementation.** This repository is the source of truth for the v2 rewrite.
No application code yet; planning and design docs only.

v1 shipped and produced a complete feature screenplay. It is being rewritten because its
screenplay parse/serialise engine isn't good enough — the editor is slow, locked to
single-line edits and selections, and has no undo/redo, spellcheck, or rich text.
**v1, jank and all, produced a finished screenplay. That is the bar.**

## Anchor decisions

- **Fountain is the source of truth** for screenplays. The manuscript is plain text, so
  everything else lives in a sidecar and a project is a folder bundle, not a file.
- **Surfaces are editing engines** (screenplay, prose — expensive, few).
  **Formats are manifests** — a label plus defaults, running on a surface.
- **Formats set defaults, never restrictions.**
- **Fully local, works entirely offline.**

Full reasoning, the v1 post-mortem, and the open questions: [`docs/PLANNING.md`](docs/PLANNING.md).

## The feature catalog

The master feature library is a live, editable Artifact:

<https://claude.ai/code/artifact/fb75cbb0-70bc-4a2e-9c07-2d3ecbe540b7>

100 `v2` items, 67 `someday` (the stress-test corpus — the point is not to build them,
it's to check the architecture survives them), 38 rejected. Re-triaged continuously, so
read the store rather than trusting a copy.
