# Sidecar integrity rules

Every rule below is forced by a confirmed v1 defect, and together they are why v2 is a
rewrite rather than a refactor.

**What happened in v1.** Highlights were stored one record per line, keyed by a `lineId`
UUID. Those UUIDs appear **zero times** in the manuscript — the anchor existed on only one
side, so nothing could ever match after a re-parse. The entry count (5784) had already
drifted from the line count (5788). All highlights in all three v1 projects are empty: a
532 KB file describing nothing, against a 170 KB manuscript. The feature was abandoned rather
than debugged. Meanwhile the notes file, which anchors to nothing, survived intact.

## The rules

1. **An anchor exists on both sides, or is derivable from content.** An identifier held only
   by the sidecar is not an anchor. The mechanism is ids written into the Fountain itself —
   its `[[ ]]` note syntax is ignored by other Fountain tools and stripped on export, so an
   id smuggled there travels *with* the text and survives re-parsing. **Confirmed rather
   than assumed:** a prototype carried `.INT. KITCHEN - DAY [[wi-scene:a7f3c1]]` across all
   181 scenes of the v1 manuscript, unique and stable across saves, with the round-trip
   still byte-exact. Prose does the same job with ADR-0011's attribute syntax. One known
   detail, not a blocker: copying a scene duplicates its id, so ids are regenerated on paste
   when they collide with one already in the document.
2. **Store the annotations, not the lines.** One record per line guarantees drift, because
   the line count changes on every edit and the record count does not.
3. **A failed load never authorises a write.** The silent-destruction pattern is a failed
   read initialising empty state, which the next autosave writes over the good file. One bad
   read permanently destroys the data. Refuse to write, keep a copy, surface it.
4. **Unresolvable records fail loudly and are retained.** v1 dropped highlights with no
   error, which made the loss undiagnosable — that is why the feature was abandoned instead
   of fixed. Report and keep; never discard silently.
5. **Saves are atomic** — write to temp, flush, rename. About five lines, and cheaper than
   any recovery mechanism.
6. **Manuscript and sidecar cannot disagree after a crash.** A bundle is several files that
   must be written as one logical change, or a crash mid-save leaves notes pointing at scenes
   that no longer exist.

## Consequence

There is a cheaper move than solving anchoring, and it should be preferred where it fits:
v1's highlights were used as *work tracking* — "this scene needs work" — not as formatting.
Work markers living inline in the manuscript as Fountain notes make the anchoring problem
**stop existing** rather than being solved.
