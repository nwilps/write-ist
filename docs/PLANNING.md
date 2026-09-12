# Write-ist v2 — planning brief

What this file holds: the v1 post-mortem, how to read the feature catalog, and how to work
on this project.

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

## The live feature catalog

**https://claude.ai/code/artifact/fb75cbb0-70bc-4a2e-9c07-2d3ecbe540b7**

A published Artifact backed by the `db` capability. Noah edits it in the browser; Claude reads
it back with the Artifact tool:

```
action: read_db, db_op: list, collection: "sections", url: <the URL above>
```

Pass `out_dir` to save the documents as files rather than loading them into context.

**Always read the store. Never assume the tags in this file or in memory are current** — Noah
re-triages continuously.

**It has a sunset.** The catalog is scaffolding for *deciding*, not a system of record to
maintain in parallel. As its load-bearing content lands in `CONTEXT.md`, the ADRs and the
tracker, it is retired rather than synced. Extract from it; never add to it.

### Data shape

Collection `sections`, one document per section:

```json
{ "slug": "INT. SECTION — HEADING", "note": "...", "order": 100,
  "items": [ { "id": "...", "t": "feature text", "g": "v2|someday|no",
               "f": "load-bearing note, empty if none",
               "a": ["area", "..."], "order": 100 } ] }
```

As of 2026-09-09: 11 sections, 167 in scope (100 `v2`, 67 `someday`), 38 rejected,
73 load-bearing.

### Tags (`g`)

- `v2` — in scope for the rewrite.
- `someday` — plausible later. **These are the stress-test corpus**: the point is not to build
  them, it's to check the architecture survives them.
- `no` — decided against, with the reason in `f`. Rendered in a collapsed archive at the foot
  of the page and excluded from all totals.

### Areas (`a`) — where a user reaches the feature

`global`, `home`, `open`, `editor/shell`, `editor/text`, `editor/screenplay`, `editor/prose`,
`editor/workspace/{notes,plan,log,outline,characters}`, `settings`, `metrics`, `export`,
`version`, `internal`.

Slash paths roll up hierarchically in the page's **By area** view. `internal` means the item
has no screen at all — it's an architectural constraint. A feature may list several areas;
there is one record, never duplicates.

---

## How to work on this

- **Read before advising**: `CONTEXT.md`, then `docs/adr/`, then `docs/STANDARDS.md`. Use the
  glossary's words; don't drift to synonyms it tells you to avoid.
- **Push back on scope.** Noah built v1 while procrastinating on the screenplay it was for,
  and named that risk himself. A small, finishable v2 beats a complete one.
  **v1, jank and all, produced a finished screenplay. That is the bar.**
- **A decision goes in an ADR the moment it lands**, with its forcing reason. Amend in place
  when a decision only gains a consequence; write a new one that supersedes when the decision
  itself changes. Never renumber, never delete.
- **An open question goes in the tracker**, not here.
- When editing the catalog programmatically, read the store first and merge — Noah edits
  between sessions.
