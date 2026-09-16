# `CONT'D` is authored, not paginated — and Write-ist writes it

Two different things wear the name `CONT'D`, and only one of them is safe to write into a
manuscript.

- **The authored one** is a **character extension**: the same character's dialogue resumes
  after intervening action, and the cue is marked `EDWARD (CONT'D)` so a reader knows the
  speaker has not changed. It depends only on the *sequence of elements*.
- **The paginated one** is `(MORE)` at the foot of a page and `CHARACTER (CONT'D)` at the head
  of the next, when a speech is split by a page break. It depends on *where the page break
  falls*.

**Write-ist writes the first into the manuscript, as the writer types. It never writes the
second.** [ADR-0024](0024-the-engine-owns-the-count-the-webview-draws.md) already forbids the
second; this ADR exists because the first looks like the same thing and is not.

## The forcing reason

Structure-derived text is stable; layout-derived text is not.

An authored `(CONT'D)` cannot be moved by anything happening elsewhere in the script — adding a
paragraph on page 12 does not change whether Edward is resuming after an action line on page
40. So writing it into the file costs nothing in stability and the manuscript stays byte-stable
under ADR-0020.

A paginated `(CONT'D)` moves whenever the text above it moves. Writing it would mean an edit on
page 12 rewrites page 40, and a document that rewrites itself when a page break moves can never
be byte-stable. That is ADR-0024's argument and it applies only to the layout-derived case.

This is also `docs/STANDARDS.md`'s decide-early test used in the other direction: an authored
`(CONT'D)` is recoverable at any time, because it is computable from the element sequence
whenever we like. Nothing is lost by writing it and nothing is lost by not.

## The evidence

*Big Fish* — John August's own final production draft, and one of Fountain's reference
scripts — carries **102 authored `(CONT'D)` extensions and zero `(MORE)`**. Measured directly:

| Form | Count |
|---|---|
| `<CUE> (CONT'D)` | 75 |
| `<CUE> (V.O.) (CONT'D)` | 21 |
| `<CUE> (O.S.) (CONT'D)` | 2 |
| Other | 4 |
| **`(MORE)`** | **0** |

So the convention is written into the file by working screenwriters, and the pagination markers
are not. A tool that renders `(CONT'D)` instead of writing it would export a `.fountain` that
looks wrong to every reader and every other tool.

## Considered options

- **Render it rather than write it**, the way ADR-0024 treats the paginated pair. Rejected: it
  is authored convention that belongs in the file, every other tool writes it, and the stability
  argument that forbids writing the paginated marker simply does not apply.
- **Insert it retroactively at import**, so a file arriving without them gains them. Rejected
  firmly. It is not on ADR-0020's enumerated list, and it would be a silent mass edit of a
  writer's file on first open — 102 insertions into *Big Fish* before the writer typed anything.
  ADR-0020's whole credibility is that the list is short and named.
- **Leave it to the writer to type.** Rejected: this is exactly the job the application exists
  to do — *the writer's words are theirs; the format is ours* (ADR-0020).

## Consequences

- **A character extension is part of the Character element, not a Parenthetical.**
  `EDWARD (V.O.) (CONT'D)` is one element carrying two extensions, and it is the easiest
  mis-parse in Fountain because it looks exactly like a parenthetical on the same line. The
  acceptance corpus has 198 `(V.O.)`/`(O.S.)` extensions and 97 standalone parentheticals, so
  both paths are exercised. `CONTEXT.md` gains **Extension**.
- **It is written as the cue is created, never applied retroactively and never at import.**
  A writer who deletes one has deleted it; the application does not put it back. Automatic at
  the moment of authoring, the writer's thereafter — the same contract as auto-uppercasing a
  scene heading.
- **It does not carry across a scene heading.** A new scene starts the speaker fresh, which is
  the convention, and it keeps the rule computable from the element sequence alone.
- **Pagination must not double it.** A cue that already ends in `(CONT'D)` must not acquire a
  second when a speech splits across a page. *Big Fish* has 102 cues that would trigger exactly
  that defect, and the acceptance corpus has none — so this is a bug only the second fixture
  can catch.
- **It is a screenplay-surface behaviour, not a format setting.** Prose has no character cues.
  Within the surface it is a preference the writer can turn off, on the same footing as smart
  quotes (ADR-0020) — visible format gets a control.
- **The feature catalog's *"(MORE) and (CONT'D) inserted automatically across page breaks"* is
  the paginated pair only.** Its note is amended to name the split, so the two are not conflated
  again.
