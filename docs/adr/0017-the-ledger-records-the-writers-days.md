# The ledger records the writer's days, above every bundle

v2 writes an append-only **ledger** from the first run, before anything reads it. Per day, per
project: words and pages. Per session: when the application opened and when it closed. It
lives outside every bundle, there is one per writer, it spans every project, and it outlives
any project it names.

**The forcing reason is that none of it can be reconstructed.** `docs/STANDARDS.md` gives the
test — *can this be computed later from what is already saved, or does it only exist if
something recorded it as it happened?* — and names time spent writing as the second kind.
Words are the same: the manuscript on disk says what it says today, never what it said on
Tuesday. Pages are worse, because a page count is computed against the manuscript *as it was*
(ADR-0001), so once the text moves, Tuesday's page count is gone for good. This is the one
decision on this map where being late destroys something rather than deferring it.

**Days span projects, which is why the ledger sits above every bundle.** ADR-0014 lifted the
Log out of drafts because it "is a record of days, not of text", and cutting it per draft would
fragment the one continuous thing in the app. The same reasoning runs one level up: a writer's
Tuesday includes work on two projects, so a per-project record fragments Tuesday exactly the
way a per-draft Log fragmented it. The ledger is a record of the *writer's* days, not a
property of any one work.

This **widens [ADR-0016](0016-the-layer-above-a-bundle-holds-no-work.md)**, which said nothing
else would live above a bundle. Its invariant survives intact: losing the ledger costs the
writer a chart, never a word, because every word is still in a bundle.

## Considered options

- **Record nothing, and refuse metrics permanently.** The strongest case, and not waved
  through. Nothing in v2 consumes a ledger; metrics is a someday feature; and building a
  recording mechanism for a dashboard that may never exist is precisely the scope that produced
  v1 while the screenplay it was for went unwritten. Rejected only because the cost of being
  wrong is asymmetric: refusing costs a feature, and deferring costs *data that can never be
  made*. A ledger is a handful of numbers a day.
- **Per-bundle, inside the sidecar.** The prior intent — the Phase 2 review records that §19.2
  wanted metrics in the Log, and ADR-0012's own table names "daily word totals" as bookkeeping.
  Rejected on the days-span-projects argument above, and because a deleted project would take
  its history with it. The writer's record of their own work should not be destroyed by tidying
  up a folder.
- **Dual-write: per-bundle record of truth, plus a copy above that outlives deletion.** Keeps
  history travelling with a bundle to another machine. Rejected: two stores holding the same
  facts is two stores that can disagree, which is ADR-0008 rule 6's entire subject, bought for
  a portability benefit nobody asked for.
- **A full event log with idle detection from day one** — writing versus planning versus idle.
  Rejected for now rather than permanently, and deferrable *without loss* for a specific
  reason: a later classification can only subdivide time that was already recorded, so
  recording session boundaries now preserves the denominator. Idle detection needs a threshold
  nobody can pick correctly — ninety seconds of stillness is thinking or it is coffee, and the
  application cannot tell — and that tuning problem is exactly the kind that eats a week.

## Consequences

- **Append-only is an integrity decision, not a format preference.** An append never rewrites
  existing bytes, so a crash damages at most the last line, and ADR-0008 rule 3's failure mode
  — failed read, empty state, next save writes over the good file — becomes *structurally
  impossible*, because nothing ever rewrites the file. This is the cheapest integrity guarantee
  in the application and it comes from the shape of the file.
- **One record per line, dates and numbers in plain sight.** `grep 2026-09`, `tail` and
  `wc -l` all work on it, which is the diagnosis property ADR-0012 asks for. ADR-0016 already
  established that readability reaches outside a bundle and reaches *harder* there, because the
  writer never sees this file, so when the application is wrong about it the file is the only
  recourse.
- **Every entry carries the project's name beside its id.** ADR-0016 made this a rule for the
  registry; the ledger is where it becomes load-bearing, because entries outlive the projects
  they name. Without the name, a 2029 chart has a bar labelled `550e8400-e29b…` that nobody can
  identify — VS Code's failure exactly, where storage keyed by a vanished path can never be
  attributed to anything. This is also the first real work ADR-0015's project id does.
- **Pages are recorded, never recomputed.** One extra number per project per day. The
  alternative is discovering later that the page half of every historical chart is impossible
  to produce, and for screenplay that is the half that means something — a page is roughly a
  minute of screen time, so pages written is the unit the writer actually thinks in.
- **Counts come from the manuscript, and only from the manuscript.** The ledger is sidecar-class
  data about the manuscript; it never contributes to a word or page count. ADR-0004 already
  makes the manuscript the sole source of truth for its own content.
- **History does not travel with a bundle.** Move a project to another machine and its past
  stays behind, because the ledger belongs to the writer rather than to the folder. Recorded so
  it is not later mistaken for a bug. ADR-0003 rules out sync, so a writer working across two
  machines has two partial ledgers, and that is the same answer this application gives to every
  cross-machine question.
- **The ledger is not the Log.** They share a day axis and nothing else. The Log holds what the
  writer *authored* about a project — tasks, pushes, entries — and stays project-level inside
  the bundle (ADR-0014). The ledger holds what the application *recorded* about the writer's
  days. Conflating them would put authored content above the bundle, which ADR-0016 forbids.
- **Time classification is deferred, and the cost of deferring it is named.** Until it ships,
  the ledger knows how long the writer sat at the desk and not how that time divided. That
  division cannot be recovered for any day before the feature exists. This is a deliberate,
  priced deferral, not an oversight.
- **It lives beside the registry**, in `appLocalDataDir()`, under the same contract: a record,
  with ADR-0008 rule 3 in full, and a separate file — the registry and the ledger fail in
  different ways and must not share one.
- **`CONTEXT.md` gains **Ledger**.** The term was held out of the glossary pending this
  decision.
