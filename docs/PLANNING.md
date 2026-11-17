# Write-ist v2 — planning brief

What this file holds: the v1 post-mortem, a note on the retired feature catalog, and how to
work on this project.

What it does **not** hold, and must not re-accumulate:

| | |
|---|---|
| Decisions | [`docs/adr/`](adr/) — each with its forcing reason |
| Rules that are not decisions | [`STANDARDS.md`](STANDARDS.md) |
| Open questions | GitHub Issues on `nwilps/write-ist` (see [`agents/issue-tracker.md`](agents/issue-tracker.md)) |
| Where the work has got to | [`../SETUP-CHECKLIST.md`](../SETUP-CHECKLIST.md) |
| Evidence behind a decision | [`research/`](research/) |

This file used to carry summaries of all five. They drifted, which is the whole argument
against keeping a second copy of anything.

---

## The v1 post-mortem

v1 shipped and works: home screen, create/open projects, a screenplay-only editing surface,
raw-text export. **A complete feature screenplay was written in it.** Its editor is slow,
locked to single-line edits and selections, and has no spellcheck, undo/redo, or rich text.

v1's stack: **Tauri v2, React + TypeScript on Vite, with some Rust in the backend.**

**What failed and what didn't is the useful part.** The rewrite is forced by the
parse/serialise engine and the editing surface — *not* by the shell, the platform layer, or
the language choices. Those were fine and their lessons carry forward.

The root cause underneath it: every screenplay line was its own `contenteditable`, with
hand-rolled DOM sync and caret restoration. Everything that hurt traces back to that one
decision — no multi-line selection or copy/paste, jank on Enter above an existing element,
arrow keys skipping empty lines, fragile undo, spellcheck abandoned as too slow, pagination
deferred for want of a layout engine, and a 3,535-line `Draft.tsx` for want of an enforced
seam.

The confirmed data-loss bug that shapes the sidecar design is told in full, with its fix, in
[ADR-0008](adr/0008-sidecar-integrity-rules.md). It is the reason v2 is a rewrite rather than
a refactor.

---

## The feature catalog — retired

Before the repo took over, features were triaged in a separate catalog, an Artifact outside this
repository. It was scaffolding for *deciding*, never a system of record, and it had a sunset from
the start. **Noah retired it on 2026-11-17.** Its load-bearing content lives on in `GLOSSARY.md`,
the ADRs and the issue tracker; nothing should read it, link to it or add to it.

---

## How to work on this

- **Read before advising**: `GLOSSARY.md`, then `docs/adr/`, then `docs/STANDARDS.md`. Use the
  glossary's words; don't drift to synonyms it tells you to avoid.
- **Push back on scope.** Noah built v1 while procrastinating on the screenplay it was for,
  and named that risk himself. A small, finishable v2 beats a complete one.
  **v1, jank and all, produced a finished screenplay. That is the bar.**
- **A decision goes in an ADR the moment it lands**, with its forcing reason. Amend in place
  when a decision only gains a consequence; write a new one that supersedes when the decision
  itself changes. Never renumber, never delete.
- **An open question goes in the tracker**, not here.

## A far-future maybe, not a plan

Merging collaborators' drafts, or comparing two versions of a manuscript, is a *maybe someday, if
users ask for it* — nothing more. It is not on the roadmap or in any slice. Write-ist stays a solo
writer's app ([ADR-0031](adr/0031-outside-changes-are-handled-quietly.md)). If someone asks, open
an issue then.
