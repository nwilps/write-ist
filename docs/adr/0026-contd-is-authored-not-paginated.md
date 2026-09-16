# `CONT'D` is authored, not paginated — and Write-ist writes it

Two different things wear the name `CONT'D`, and only one of them is safe to write into a
manuscript.

- **The derived one** is a **character extension**: the same character's dialogue resumes
  after intervening action, and the cue is marked `EDWARD (CONT'D)` so a reader knows the
  speaker has not changed. It depends only on the *sequence of elements*, and there is no
  judgement in it — which is why Write-ist maintains it rather than waiting to be asked.
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

**And the same file gets it wrong about twenty times.** Walking its element sequence for
continuations — same character, intervening action, within a scene — finds **98 correctly marked
and about 20 unmarked**, including three inside the first 140 lines. Two verified by eye at lines
91 and 132: `EDWARD`, an action line, then `EDWARD` again with no extension. *(Heuristic count,
from a throwaway parser; the real number lands when the actual parser does.)*

That is the argument for adding missing ones rather than offering to. If John August's final
production draft misses a fifth of them, nobody is keeping this straight by hand, and a file
without them is out of date rather than making a point.

**And the acceptance corpus is worse, which settled the default.** Measured by the
implementation, 2026-09-16: `script.fountain` authors **3** extensions and is missing **201**.
Its writer used the convention on 1.5% of the cues that call for it. Asked about it, he said he
had lost sight of it while writing and wanted them added — which is the case for this being a
normalisation rather than an opt-in, made by the person whose file it is. Adding them grows the
file from 170,642 to **172,451** bytes.

This is also why the switch turns the behaviour *off* rather than on. An implementation briefly
made it opt-in, on the reasoning that 201 was a lot of change to a writer's file; the number is
the reason to do it, not the reason to hesitate.

So the convention is written into the file by working screenwriters, and the pagination markers
are not. A tool that renders `(CONT'D)` instead of writing it would export a `.fountain` that
looks wrong to every reader and every other tool.

## Considered options

- **Render it rather than write it**, the way ADR-0024 treats the paginated pair. Rejected: it
  is authored convention that belongs in the file, every other tool writes it, and the stability
  argument that forbids writing the paginated marker simply does not apply.
- **Offer the missing ones at import rather than adding them**, on the grounds that adding
  visible words to a script is a bigger act than the other normalisations. Rejected: `(CONT'D)`
  is derived, so a file missing one is stale rather than different, and a writer who does not
  want them turns the behaviour off rather than declining it file by file. What the objection
  earns is the report, not a prompt — ADR-0020 names it, so nothing is silent.
- **Treat every extension the same way.** Rejected, and it is the mistake this ADR was first
  drafted with. `(V.O.)` and `(O.S.)` are *authored* — only the writer knows whether a line is
  voice-over or off-screen — and the application must never add or remove one. `(CONT'D)` is
  *derived*. Giving them one rule means either the app starts guessing at voice-over or it
  stops maintaining continuations.
- **Leave it to the writer to type.** Rejected: this is exactly the job the application exists
  to do — *the writer's words are theirs; the format is ours* (ADR-0020).

## Consequences

- **A character extension is part of the Character element, not a Parenthetical.**
  `EDWARD (V.O.) (CONT'D)` is one element carrying two extensions, and it is the easiest
  mis-parse in Fountain because it looks exactly like a parenthetical on the same line. The
  acceptance corpus has 198 `(V.O.)`/`(O.S.)` extensions and 97 standalone parentheticals, so
  both paths are exercised. `CONTEXT.md` gains **Extension**.
- **It is written when the writer moves on to the dialogue, not when the cue is typed.** That
  gap is deliberate: a writer beginning a cue may be about to type `(V.O.)`, and inserting
  `(CONT'D)` under their hands would be a fight. Once they commit to the dialogue line, their
  intent for the cue is known.
- **It appends *after* any extension already present.** The rule is not "add `(CONT'D)` if the
  cue is bare" — *Big Fish* contains 21 cues reading `EDWARD (V.O.) (CONT'D)`, so a bare-only
  rule gets 21 cues wrong in the reference script.
- **It is maintained, not merely inserted.** A derived value that the writer deletes does not
  become a preference; the file simply becomes wrong, so the application restores it. The
  control is **one switch that turns the behaviour off**, for the writer or house style that
  does not use `CONT'D` — not per-instance deletion. This is the line between derived and
  authored doing real work: the app maintains `(CONT'D)` and never touches `(V.O.)`.
- **Missing ones are added at import**, as the sixth entry on ADR-0020's enumerated list and
  named in the import report. A script without them is out of date rather than different, and
  the evidence is that even a reference production draft cannot keep it straight by hand.
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
