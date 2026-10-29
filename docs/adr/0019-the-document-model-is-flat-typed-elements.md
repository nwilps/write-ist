# The document model is a flat sequence of typed elements, held in memory

Write-ist is **model-first**: the canonical form of a manuscript while the application is
running is a typed element structure in memory. The file on disk is produced from it by a
serialiser and consumed by a parser. The writer never edits text-with-syntax, on either
surface.

The structure is **a flat sequence of elements with no container nodes**. Scenes and chapters
are computed as ranges — this heading through the element before the next — exactly as
`GLOSSARY.md` already defines them. Nothing nests.

Inline formatting is carried as a **set of marks** per span, not a tree. `_**x**_` and
`**_x_**` are therefore indistinguishable to the model, and one order is chosen on the way
out.

How far one such range may reach is decided separately, in
[ADR-0027](0027-a-mark-runs-from-its-opening-delimiter-to-the-next.md): a mark runs from its
opening delimiter to the next matching one, across elements when that is where it closes. It is
the one range in the model that crosses an element boundary, and it costs flatness nothing — it
is still a range, still a set, and still nothing containing anything.

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

## One element, one line — on the screenplay surface

**No element spans more than one line.** Blank lines are not stored, and where one falls on the
way out is a lookup on the pair of element types either side of it:

| Adjacent pair | Blank line between |
|---|---|
| Action → Action | **yes** |
| Dialogue → Dialogue | no — in Fountain a blank line *ends a speech*, so a two-paragraph speech has no other representation |
| Centered → Centered | no |
| Lyrics → Lyrics | no |
| Everything else | yes |

**No element is exempt, including omitted ones.** A run of tight prose inside a boneyard is
spaced by this table like any other run of action, so cut notes written without blank lines
between them gain them on first import. That is the cost of the boneyard being ordinary elements
rather than a special case ([ADR-0021](0021-the-screenplay-surface-implements-all-of-fountain.md)),
and it is recorded here so the reflowed notes are not later read as a bug. An exemption would
reintroduce exactly the "the boneyard is different" that treating it as a range removed.

This is what makes ADR-0020's claim — *spacing is derived from adjacent element types* — actually
true, and the rule is stated here because that claim depends on it.

**The title page is the one exception, and it is not really an exception**, because it is not a
text element: it is key-value pairs, several of which carry indented continuation lines
(`Title:` with two values, `Contact:` with a three-line address). ADR-0021 already treats it as
fields edited through a form and stored as Fountain.

**The boneyard is not a second exception, and the reason is worth recording**, because the first
implementation made it one. Read as a container — one element holding the whole of `/* … */`
with its own newlines — it breaks this rule, and it has to, since a boneyard may contain a blank
line and blank lines are not stored. It also cost a real defect: with the block opaque, a
character cue inside it was invisible, and an implementation that could not see the cue wrote a
`(CONT'D)` into cut material anyway. `/*` and `*/` are therefore **delimiters** and the elements
between them carry an `omitted` flag ([ADR-0021](0021-the-screenplay-surface-implements-all-of-fountain.md)).
A cue inside a boneyard is a cue. Nothing nests, nothing spans a line, and the blank-line problem
never arises because omitted elements are spaced by the same table as every other element.

## The prose surface does not inherit it, and could not

**A prose paragraph is one element whose text holds the writer's line wraps.** Measured on the
acceptance manuscript, 2026-09-16: **2,135 of its 4,317 paragraphs span more than one line, and
the longest runs 72.** Prose arrives hard-wrapped, as most real prose is, and rewrapping it is
not on ADR-0020's list — so the wraps are the writer's and they stay.

*(Re-measured against the landed parser, 2026-09-16. The figures first written here were 2,140
of 4,322: 2,140 is the count of **elements** holding a newline — the paragraphs plus the block
quote, the verse block and the two passthroughs — against 4,343 elements in all. The paragraph
figures are the ones the sentence is making a claim about, so they are the ones stated. Roughly
half either way, and the argument below is unchanged.)*

**The rule above was measured on screenplays, and that is why it does not transfer.** It was
decided on a count: one genuine multi-line action block across 2,104 action blocks in three
produced screenplays. Screenplay has no hard-wrapped construct, so the case barely exists.
Markdown paragraphs are nothing but that case — 2,135 of them in one book — and a rule bought
for 1-in-2,104 cannot be sold at 1-in-2.

The consequences that follow from the screenplay rule therefore do not follow here. Nothing
about prose wants a spacing table derived from element adjacency, because:

**A blank line in Markdown is syntax, not spacing.** Two paragraphs run together *are* one
paragraph. So the serialiser is not choosing a convention that could go either way; it is
choosing what the document says. Between paragraphs it is required, inside a verse line block or
a block quote it must be absent, and none of that is a style decision the way `Action → Action`
was.

**And the two surfaces stay honest about being different.** The flat, typed, marks-as-a-set
model at the top of this ADR holds on both. The line rule does not, and pretending otherwise
would have meant either rewrapping a novelist's paragraphs or storing every wrapped line as its
own element, which is the `precededByBlank` design rejected above wearing a longer coat.

## Headings carry a level; parts and chapters are computed

Confirmed by the prose implementation rather than decided here, because `GLOSSARY.md` already
fixes it: **Chapter** is *"the range from one chapter heading to the next"*, and **Scene** is
worded identically. So a prose heading is one element carrying a level, and which range it opens
is computed from the sequence — there is no `part` element and no `chapter` element.

Worth recording for what it prevents. With parts and chapters as types, the book's own title and
a front-matter heading are indistinguishable from a part and a chapter, and the structure a
reader sees comes out wrong at the very top of the file.

## Two things the serialiser carries rather than canonicalises

**A scene number and a dual-dialogue caret are lifted off the element's text only when the
source wrote exactly one space before them.** `INT. KITCHEN - DAY #14#` and `VINNIE ^` become an
element with a scene number and an element with the caret set; `INT. KITCHEN - DAY  #14#`, with
two spaces, keeps the whole string as text.

That is **deliberately wrong about the element and right about the bytes.** Canonicalising the
gap would be an eighth entry on ADR-0020's list, spending a writer's file on tidiness; leaving
it means the rarer spelling round-trips exactly while being typed as something slightly duller.
Recorded so it reads as a decision rather than as an oversight.

### What this costs, measured

Fountain permits a run of action lines with no blank between them, rendering as tight lines
rather than separate paragraphs. Under this rule those are separate elements, so the writer's
file gains a blank line between each on first save — the seventh entry on ADR-0020's list, which
since 2026-09-18 is stated in both directions: the table *places* blank lines, so two centered
lines or two lyric lines with a blank between them lose it by the same rule.

The alternative was to let an element hold newlines. It was rejected on measurement: across
**2,104 action blocks in three real screenplays** — the acceptance corpus, *Big Fish* and
*Brick & Steel* — there is exactly **one** genuine multi-line action block:

```
And then there's a long beat.
Longer than is funny.
Long enough to be depressing.
```

That becomes five lines instead of three. The rhythm the writer intended is flattened, and that
is a real loss; it is accepted because one instance in three produced screenplays does not
justify a dimension in the document model, and because the model then has to answer "may a
scene heading contain a newline?" for every type forever.

The same rule collapses *Brick & Steel*'s two title cards — `BRICK BRADDOCK / & DICK STEEL IN`
and `BRICK & STEEL / FULL RETIRED`, separated by a blank line — into one four-line card. Also
accepted, and also recorded so it is not later mistaken for a bug.

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
- **Elements that may contain newlines.** The obvious way to preserve a tight run of action
  lines, and the way that keeps every byte. Rejected on the measurement above, and on a second
  ground: it makes "may this type span lines?" a permanent per-type question, and the answer
  turned out to differ for action, dialogue, centered and lyrics — four special cases where a
  spacing table has one.
- **One element per line, plus a `precededByBlank` flag.** Also round-trips losslessly. Rejected
  because the flag is presentation state stored on an element purely so it can be serialised,
  which is the thing deriving spacing from types was meant to avoid.
- **Container nodes for scenes and chapters.** The obvious shape, and the one most editor
  libraries encourage. Rejected on ADR-0010's reasoning above.

## Consequences

- **Element identity is in memory and is never written to a file.** The editor needs to know
  that a given paragraph is the same object it was a keystroke ago — to render incrementally,
  to keep undo coherent, and to hold a comment card still while text above it changes. That
  identity is created on parse and dies when the project closes, exactly like undo/redo, which
  `GLOSSARY.md` already fixes as session-level and deliberately not durable. It is not an
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
