# Standards

Rules, not decisions. Decisions live in [`docs/adr/`](adr/) with their forcing reasons; this
file holds the rules we hold ourselves to, which is a different thing — a standard is cheap to
honour, has no real alternative worth recording, and is expensive to rediscover.

Every rule here cost real time somewhere, and the cost is named. A rule with no scar is not a
standard, it is a preference; keep preferences out.

Provenance: **v1** is the shipped application; **prototype** is the throwaway
`write-ist-ng` spike, whose planning notes recorded twelve of these. Neither repo is edited
any more, so the rules live here.

---

## Measurement

**Measure the measurer.** A performance readout that excludes its own cost is not a
measurement, it is a reassurance.

> The prototype's editor HUD timed the editing engine's work and not its own. It stayed green
> while burning ~3.6 ms per keystroke just outside the window it measured — walking every
> block and running a word count on each, on every keystroke. The readout was lying by
> omission, and the machine felt it before the number did.

**Determinism claimed in a comment is not determinism.** A generator described as reproducible
has to be rewound, not merely seeded.

> A seeded log generator was documented as producing identical data every time, and did — on
> the first call. Its state lived in a closure that was never reset, so every later call
> continued the sequence. That made a reseed key non-reproducible and hid a threshold change
> during testing.

## Indices and boundaries

**1-based display, 0-indexed storage. Convert at the boundary, once, and never let the
internal index leak.**

> Switching a ruler to 1-based exposed two latent off-by-ones that a 0-based ruler had been
> forgiving of. Pages are 1-based because there is no page 0; the array holding them is not.

**The visual index and the model index are not the same number.** Track both, and say in the
name which is which.

> While a dragged row still occupies its own place, the rows a cursor is counted against
> include the item being moved. The slot to draw the insertion line at and the slot to splice
> into then differ by one whenever the source sits above the drop point.

## Layout and gesture

**While a gesture is being measured against the layout, do not change the layout.**

> Dragging a row hid it, to make the insertion preview exact. That shortened the content, the
> browser clamped the scroll position to match, and the surface slid up by exactly one row
> mid-drag. The day moved out from under the cursor and the drop landed a day early. It was
> misdiagnosed twice as scroll anchoring before anyone printed the scroll position: 2243 →
> 2221, one row height. The dragged row now fades instead of disappearing.

**Ask what an element was holding open before taking it out of flow.** Whatever was quietly
contributing height goes with it.

> A date gutter became absolutely positioned so it would stop affecting centring. The month
> label lived inside it, and its second line of text was what had been growing the row — so
> the label immediately overflowed into the next day and the dates collided.

**A separator belongs to the thing it separates, not to one of them.**

> A month divider was emitted from inside a day row, but two other things were drawn *ahead*
> of that row — so anything starting on the 1st rendered above its own month heading. Moving
> the divider out, to be emitted for whatever came first on that day, fixed both cases at once.

## Diagnosis

**Two sightings of one symptom is a structural cause.** The second time a bug appears
somewhere unrelated, stop writing it off as cosmetic and go find what both have in common.

> The month-divider bug above had already been seen once, in a different guise, and dismissed.

**Know which of your tools fail silently.** JS fails loudly; CSS does not.

> One unclosed rule in a stylesheet silently kills every rule after it, and the page still
> renders — just wrong. Cards lost their positioning and collapsed to the left edge, a panel
> vanished, a picker went unstyled, all from a single missing brace. Markup and geometry
> checks all passed, because the markup was fine.

## Deciding, and knowing when to stop

**A prototype is done when the next change you want to make would not change what you would
build.** Adjusting a border colour is past the line. Asking whether twelve lanes is too many
at this cell size is not.

This is the operational form of `SETUP-CHECKLIST.md`'s timebox: v1 got built while
procrastinating on the screenplay it was for, and a prototype that keeps getting nicer is the
same failure in a smaller frame.

**Decide early, build late — but only for what accrues.** Most late decisions cost a harder
migration. A few cost something else entirely: **data that never existed and cannot be
reconstructed.** Those are the only real emergencies in a plan.

The test: *can this be computed later from what is already saved, or does it only exist if
something recorded it as it happened?* Time spent writing versus planning is the second kind.
So is ADR-0004's instruction to write a format version into the bundle from day one — one
field now, unrecoverable later, because there is no way to migrate files that never said what
they were.

**If an interface needs a caption explaining how to use it, fix the interface.** Not a ban on
buttons — a ban on captioning gestures that already exist.

> A planning grid shipped with a toolbar and a line explaining how to add, move and resize
> cards. All of it was removed. A grid of squares is its own affordance; a drag is the obvious
> first thing to try, and it did the obvious thing.
