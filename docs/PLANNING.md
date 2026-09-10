# Write-ist v2 — planning brief

**If you are a Claude session picking this up: read this file first, then read the live
catalog (below) before proposing anything.** Last updated 2026-09-09.

---

## What write-ist is

A fully local (offline, no sync, no accounts) writing application. A project is created as
a *format* — screenplay, novel, short story, essay, and so on — and opens onto an editing
surface tuned to it, with planning workspaces alongside and format-appropriate export.

v1 shipped and works: home screen, create/open projects, a screenplay-only editing surface,
raw-text export. A complete feature screenplay was written in it. Its editor is slow, locked
to single-line edits and selections, and has no spellcheck, undo/redo, or rich text.

**v2 is a full rewrite**, because v1's screenplay parse/serialise engine isn't good enough.
The writing surface is the most important part of the app.

---

## The live feature catalog

**https://claude.ai/code/artifact/fb75cbb0-70bc-4a2e-9c07-2d3ecbe540b7**

A published Artifact backed by the `db` capability. Noah edits it in the browser; Claude
reads it back with the Artifact tool:

```
action: read_db, db_op: list, collection: "sections", url: <the URL above>
```

Pass `out_dir` to save the documents as files rather than loading them into context.

**Always read the store. Never assume the tags in this file or in memory are current** —
Noah re-triages continuously.

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
- `someday` — plausible later. **These are the stress-test corpus**: the point is not to
  build them, it's to check the architecture survives them.
- `no` — decided against, with the reason in `f`. Rendered in a collapsed archive at the
  foot of the page and excluded from all totals.

There is no `v1` tag; it was removed as noise on 2026-09-09.

### Areas (`a`) — where a user reaches the feature

`global`, `home`, `open`, `editor/shell`, `editor/text`, `editor/screenplay`,
`editor/prose`, `editor/workspace/{notes,plan,log,outline,characters}`, `settings`,
`metrics`, `export`, `version`, `internal`.

Slash paths roll up hierarchically in the page's **By area** view. `internal` means the
item has no screen at all — it's an architectural constraint. A feature may list several
areas; there is one record, never duplicates.

---

## Decisions made (do not relitigate without new information)

**Fountain is the source of truth** for screenplay documents, in v1 and v2. Consequence:
the manuscript is plain text, so everything that isn't manuscript lives in a sidecar, and
a project is a folder bundle, not a file.

**Surfaces vs formats.** A *surface* is an editing engine (expensive, few): screenplay and
prose for v2; stage play deferred; structured-data rejected. A *format* is what the user
picks at New Project — a label plus defaults running on a surface. Feature and TV are both
screenplay formats; novel/novella/short story/flash fiction/essay/article are prose formats.

**Formats set defaults, never restrictions.** Every element the surface knows stays
available in every format — act breaks in a feature, a title page on a novel. Forced by
import: Fountain doesn't gate elements by format, so the parser can't either.

**The element vocabulary belongs to the surface, not the format.**

**Poetry is a prose format**, not a surface — the prose surface preserves authored line
breaks and that's the whole mechanism. Song lyrics ride poetry.

**Recipes are out. Chord layers are out.** These were the only two features forcing a model
that holds non-prose structured data or aligned layers. Dropping them materially simplified
the document model.

**Workspaces are a registry.** The shell hosts them uniformly; each declares itself. Same
shape as formats-are-manifests.

**Home and Open Project are separate screens.** Home is a short menu and lists no projects;
Open Project lists projects and their format.

---

## The v1 bug that shapes the design

v1's highlights were stored in `<project>/screenplay/draft.highlights.json` as one record
per line, keyed by a `lineId` UUID. **Those UUIDs appear zero times in `draft.fountain`** —
the anchor existed on only one side, so nothing could ever match after a re-parse. Entry
count (5784) had already drifted from the line count (5788). All highlights in all three v1
projects are empty; the file is 532 KB describing nothing, against a 170 KB manuscript.
Noah abandoned the feature rather than debugging it.

Meanwhile `notes/notes.md`, which anchors to nothing, survived intact.

**The lesson, and the rules now in the catalog:** an anchor must exist on both sides or be
derivable from content; store the annotations, not the lines; a failed load must never
authorise a write; unresolvable records fail loudly; saves are atomic; manuscript and
sidecar cannot disagree after a crash.

**Likely fix:** ids written into the Fountain itself. Its `[[ ]]` note syntax is ignored by
other Fountain tools and stripped on export, so an id smuggled there travels *with* the
text and survives re-parsing.

**Related reframe:** Noah used highlights as *work tracking* ("this scene needs work"), not
as formatting. If work markers live inline in the manuscript as Fountain notes, the
anchoring problem for them stops existing rather than being solved.

---

## Open questions

1. **The document model** — typed elements over Fountain. Not yet designed. This is next.
2. **Editor rendering**: buffer-first (Fountain text is the live buffer, decorated) vs
   model-first (parse to an element tree, serialise on save). Undecided. v2 must support
   multi-line selection, copy/paste, editing and delete — the thing v1 couldn't do.
   Buffer-first looks coherent given Fountain-as-truth, but it means Cmd+B inserts `**`.
3. **Live pagination** matching the PDF. Hard either way, independent of the above.
4. Whether to link log tasks/notes to scenes or plan cards. Noah is sceptical; current
   recommendation is *don't* — use plain text until the need proves itself.

---

## Prototypes Noah has NOT shown yet

Two v2 workspaces exist on his Windows machine, possibly to arrive via a GitHub repo:

- **Plan** — a story structure planner. Scene cards on a grid, X = page placement and page
  count, Y = arbitrary, for visualising tension and rising action; comparable against
  structure guidelines from screenwriting books. **Deliberately independent of the
  manuscript** — a playground, not a derived view. Its page numbers are targets, not facts.
- **Log** — a per-project vertical timeline of days. Notes and tasks land on days; "pushes"
  are future deadlines that a large task can be broken down into.

He withheld these on purpose so the plan wouldn't be reverse-justified from existing code.
Don't press for them; don't design around guesses about them either.

---

## How to work on this

- The catalog is the shared artifact. Update it as decisions land; read it before advising.
- Push back on scope. Noah built v1 while procrastinating on writing the screenplay it was
  for, and named that risk himself. A small, finishable v2 beats a complete one.
  **v1, jank and all, produced a finished screenplay. That is the bar.**
- Order of work agreed so far: feature inventory (done) → data model → milestones.
- When editing the catalog programmatically, read the store first and merge — Noah edits
  between sessions.
