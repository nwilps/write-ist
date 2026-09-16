# The screenplay surface implements all of Fountain

Every element Fountain defines is a typed element in the model: scene heading, action,
character, dialogue, parenthetical, transition, centered, **sections** (`#`), **synopses**
(`=`), **page breaks** (`===`), **lyrics** (`~`), **dual dialogue** (`^`), **notes**
(`[[ ]]`), and the **boneyard** (`/* */`). The **title page** stays where Fountain puts it,
at the top of the manuscript file.

The editor-shape spike implemented seven of these. The remaining six are not optional.

## The forcing reason

ADR-0006 already decided this and named the reason: **the parser cannot gate elements by
format, because Fountain does not.** Its argument was about formats, and it applies with more
force to the element set as a whole — a file arriving from Highland, Slugline, WriterDuet or a
Final Draft export may contain anything the format allows, and refusing to represent it means
losing the writer's text.

ADR-0020's passthrough is deliberately unavailable here. It exists for prose, where Write-ist
specifies a *subset* of a larger format, and it must not become a bin into which a third of
Fountain is quietly swept.

Three of these elements are already spoken for elsewhere: ADR-0005 makes act breaks sections,
and ADR-0018 claims `[[ ]]` for comments.

## The title page

Fountain puts the title page at the top of the manuscript file as `Title:` / `Credit:` /
`Author:` key-value lines, and the acceptance corpus has one. The feature catalog describes
the title page editor as *"structured fields, not prose. A second small document inside the
project"*, which reads as an argument for the sidecar.

**It stays in the manuscript file.** ADR-0004 says the Fountain file *is* the manuscript; move
the title page beside it and every other Fountain tool in the world opens the screenplay with
no title on it, which fails ADR-0003 directly. It is *edited* through a fields form and
*stored* as Fountain. The same reasoning gives prose its typed front matter, which ADR-0011
already requires.

## The boneyard

`/* … */` is Fountain's "omit this from the output" syntax. Write-ist renders it **in the
flow, collapsed by default**, expandable in place, struck through when expanded, and strips it
before pagination, before word and page counts, and before PDF export — the same exclusions
ADR-0018 gives comments, for the same reason. It is preserved exactly in the file.

The evidence, measured across 83 real `.fountain` files, is that the boneyard is rare and is
not used for what its name suggests:

- **7% of files use it at all.** For comparison: sections 11%, synopses 12%, notes 8%, scene
  numbers 1%.
- **Of the genuinely authored uses, none was cut material.** One holds reviewer comments signed
  with initials; one holds per-scene metadata (`/* Power arc: EXPOSED -> ACCEPTED */`).
- **Every implementation renders it visibly** rather than hiding it. Slugline exposes it as
  *Format ▸ Omit* and shows it highlighted in blue; Scrivener imports it struck through.

So the writers who reach for it are using it as an escape hatch for annotation the format
does not otherwise provide — which is exactly the gap ADR-0018 fills properly. Supporting it
for fidelity is cheap and correct; building anything on top of it would formalise a hack.
Collapsed-by-default with expansion on demand is the chosen middle: quieter than Slugline's
always-visible blue, and never hiding content the writer cannot get back.

## Two places where the surface goes past the spec

Recorded because "implements all of Fountain" is the title of this ADR, and both of these are
*more* than Fountain, not less. Each is a deliberate extension with a cost.

### Every combined interior/exterior heading form

Fountain names `INT./EXT.` and `I/E.`. Writers also write `EXT./INT.` — and use the order to
mean something, a scene beginning outside and moving in rather than the reverse. All six forms
are recognised, with or without the inner period:

`INT.` · `EXT.` · `EST.` · `INT./EXT.` · `EXT./INT.` · `INT/EXT.` · `EXT/INT.` · `I/E.`

This is not really an extension so much as the spec read generously, and it cost two scenes in
*Big Fish* before it was noticed. See the gate's limits, below.

### Transitions that do not end in `TO:`

Fountain requires a transition to be uppercase and **end in `TO:`**. That rule misses
transitions writers actually write — `FADE OUT.`, `CUT TO BLACK.`, `DISSOLVE:` — and Fountain's
own answer is that the writer should force them with `>`. **Write-ist recognises them without
forcing**, from a closed vocabulary:

`FADE IN:` · `FADE OUT.` · `FADE TO BLACK.` · `CUT TO BLACK.` · `DISSOLVE:` · `IRIS IN:` ·
`IRIS OUT.` · `WIPE:` · `SMASH CUT.` · `INTERCUT:`

**A closed vocabulary rather than a rule, and that is the whole decision.** The tempting rule —
an uppercase line, alone between blanks, ending in a period — is unavailable, because it is
also the shape of ordinary action. *Big Fish* contains `A RIVER.`, `THE BEAST.` and
`ON WILL AND SANDRA`, all action, all matching it. So the surface may only recognise phrases it
knows by name, and the list above is the decision surface: adding to it is a deliberate act,
here, in this file.

**The cost is rendering, not readability.** Another Fountain tool reads `CUT TO BLACK.` as
action and sets it left rather than right. The text is identical either way, and ADR-0011
already settled the principle for the prose surface: *"the text itself is always intact;
ADR-0003 is about reading, not rendering."* We do **not** write a `>` into the file to make the
classification portable — that would change a writer's file to serve another program, and
ADR-0020's list exists to prevent exactly that.

## What the round-trip gate cannot see

Found in Phase E2, and it qualifies ADR-0004's acceptance test rather than this ADR's rule.

Two headings — `EXT/INT. SORORITY HOUSE - THE DOORWAY` and `EXT/INT.  SWAMP SHACK - DAY` —
were being parsed as **action**, and **every byte test passed**. An unforced heading and an
action line with the same text serialise identically, so the round-trip could not distinguish
them: the scene-heading count moved 190 → 192 and the file size did not change at all.

**Round-trip proves the bytes survive. It does not prove the parser understood them.** On a
surface where element type is semantic — a heading means a scene, which means a page count,
which means a minute of screen time (ADR-0001) — that gap is not academic; two scenes were
missing from the model while the gate reported success.

The answer is a **census beside the byte gate**: count the elements of each type and pin the
numbers, so a misclassification moves a count even when it moves no bytes. The fix was found by
hand-auditing all 48 distinct cue names in *Big Fish*, all 45 all-caps lines not classified as
cues, and all three all-caps dialogue lines.

## Consequences

- **The element vocabulary belongs to the surface, and this is the whole of it.** ADR-0005
  already fixed that; this ADR fills in the list. A format may decide what sits on the toolbar
  and never what the parser understands.
- **Poetry and song lyrics gain a second home.** Fountain's `~` lyrics element is now
  implemented, independently of the prose surface's verse (ADR-0023). ADR-0005's poetry
  reasoning is unaffected.
- **Scene numbers (`#1#`) are parsed and preserved, and not authored.** The catalog keeps
  "scene numbering, with lock and unlock" as `someday`, noting that locked numbers *"must
  persist across edits — they become stored data, not derived data."* A file arriving with them
  round-trips; Write-ist does not mint them.
- **`.fdx` export has a natural target for every element**, which is the practical form of
  ADR-0003's promise that the work is portable.
