# Write-ist

A fully local, offline writing application. A project is created as a *format* —
screenplay, novel, short story, essay — and opens onto an editing surface tuned to it,
with planning workspaces alongside and format-appropriate export.

No accounts. No sync. No network. Your documents remain readable if this app disappears.

## Status

**v2 — building the document model.** This repository is the source of truth for the v2 rewrite.

The parser and serialiser for both surfaces are built and tested: five manuscripts go in and come
back out, the largest 645 KB, compared as bytes on disk rather than strings in memory. Everything
above that layer — comments, counts, pagination, the editor itself — is still to come.

v1 shipped and produced a complete feature screenplay. It is being rewritten because its
screenplay parse/serialise engine isn't good enough — the editor is slow, locked to
single-line edits and selections, and has no undo/redo, spellcheck, or rich text.
**v1, jank and all, produced a finished screenplay. That is the bar.**

## Decisions

Every decision, with its forcing reason, is in [`docs/adr/`](docs/adr/). The spine runs 0003
(local-first) → 0004 (Fountain) → 0010 and 0011 (prose) → 0019 and 0020 (the document model,
and what the app may change in a writer's file), with 0008 (sidecar integrity) explaining why
v2 is a rewrite rather than a refactor. Start there; nothing is summarised here, because a
summary is a copy and a copy drifts.

The rules that are not decisions are in [`docs/STANDARDS.md`](docs/STANDARDS.md), the v1
post-mortem in [`docs/PLANNING.md`](docs/PLANNING.md), and the open questions in this repo's
GitHub Issues.

## The feature catalog

The master feature library is a live, editable Artifact:

<https://claude.ai/code/artifact/fb75cbb0-70bc-4a2e-9c07-2d3ecbe540b7>

100 `v2` items, 67 `someday` (the stress-test corpus — the point is not to build them,
it's to check the architecture survives them), 38 rejected. Re-triaged continuously, so
read the store rather than trusting a copy.
