# The document model is a flat sequence of typed elements, held in memory

Write-ist is **model-first**: the canonical form of a manuscript while the application is
running is a typed element structure in memory. The file on disk is produced from it by a
serialiser and consumed by a parser. The writer never edits text-with-syntax, on either
surface.

The structure is **a flat sequence of elements with no container nodes**. Scenes and chapters
are computed as ranges — this heading through the element before the next — exactly as
`CONTEXT.md` already defines them. Nothing nests.

Inline formatting is carried as a **set of marks** per span, not a tree. `_**x**_` and
`**_x_**` are therefore indistinguishable to the model, and one order is chosen on the way
out.

## The forcing reasons

**Model-first** is forced by three decisions already taken, pulling the same way. ADR-0001
says a buffer-first editor leaning on native `contenteditable` reflow "is the version of this
that goes wrong". ADR-0018 rules out showing comment syntax to the writer, which eliminates
the naive buffer-first editor outright. And the editor-shape spike returned a GO on a
model-first editor at 3,457 blocks, with the acceptance corpus round-tripping and a writer's
judgement at the keyboard behind it (`docs/research/editor-shape-spike.md`).

**Flat** is forced by ADR-0010, which rejected a chapter tree held beside the text because
boundaries held anywhere but in the text are not anchors and can disagree with it. A tree held
in memory is the same defect with a shorter lifetime: it is a second statement of boundaries
the text already carries, and two statements can disagree. A flat sequence cannot. The spike
measured the whole cost of computing scenes rather than nesting them at one file of 148 lines.

**Marks as a set** is the constraint the spike identified as belonging to the model rather than
to any library: *a mark set cannot round-trip a mark tree*. ADR-0018 already carved out the
exemption that matters — anything carrying an id is exempt, because its pairing is recorded
rather than inferred, which is why comments may nest and cross while bold and italic may not.

## Considered options

- **Buffer-first, with syntax hidden behind decorations.** Not the naive version ADR-0018
  rules out, but a real design: the text stays the live edit target and widgets suppress the
  delimiters. Rejected on cost rather than on principle — every comment delimiter must be
  hidden and every margin card positioned from a buffer offset instead of read off the model,
  and ADR-0001's reflow trap stays live throughout. Its one genuine advantage is recorded in
  ADR-0020, along with what we do instead.
- **A mark tree, preserving authored nesting order.** Rejected: it buys the ability to
  preserve an order that is invisible to the reader, means nothing in either format, and
  costs the document model a whole dimension.
- **Container nodes for scenes and chapters.** The obvious shape, and the one most editor
  libraries encourage. Rejected on ADR-0010's reasoning above.

## Consequences

- **Element identity is in memory and is never written to a file.** The editor needs to know
  that a given paragraph is the same object it was a keystroke ago — to render incrementally,
  to keep undo coherent, and to hold a comment card still while text above it changes. That
  identity is created on parse and dies when the project closes, exactly like undo/redo, which
  `CONTEXT.md` already fixes as session-level and deliberately not durable. It is not an
  **anchor** and must never be confused with one: an anchor is durable, lives in the
  manuscript, and freezes into locked drafts. See ADR-0022 for how few of those v2 actually
  writes.
- **One serialiser rule follows from marks being a set:** the emission order is fixed and
  declared, so that re-saving an untouched file is byte-identical. The corpus is
  underline-outermost and that is the order. A file authored with the other nesting normalises
  once, on the terms ADR-0020 sets.
- **Marks must survive inside every element, including headings.** All 181 scene headings in
  the acceptance corpus are written `.**INT. LOCATION - DAY**` — forced prefix *and* bold
  markup inside the heading text. Presentation therefore lives inside the element that
  structure is read from, and a model that only handles marks in action and dialogue fails on
  the first real file.
- **Undo is a session-level stack over model transactions**, coalescing consecutive typing and
  breaking on a structural change or a pause. This is the boring convention every editor uses
  and it is chosen because it is boring: v1's undo was *fragile*, and matching what writers
  already expect is the whole of the win. It is not an ADR-shaped decision on its own; it is
  recorded here because it rides on the model.
- **Scenes and chapters cost a computation, not a structure.** Per-scene counts, the scene
  list, an Outline workspace and reordering are all range operations over the flat sequence.
  Derived data must be computed incrementally or on demand and never for the whole document on
  every keystroke — `docs/STANDARDS.md`'s *"Measure the measurer"* names the exact defect,
  where a readout walked every element and ran a word count per keystroke while reporting itself
  as free.
