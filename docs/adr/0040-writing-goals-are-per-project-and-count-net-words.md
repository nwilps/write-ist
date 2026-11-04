# Writing goals are per project, and count words added minus words cut

**A project carries an optional daily word goal, with the weekdays that count, in its own `goals.md`.
Each day's words written are kept beside it. A streak is the run of counted days the goal was met.
A sprint is a one-time word target that lives only while the project is open. All of it counts one
thing — words added minus words cut, never shown below zero — and none of it counts moving text,
opening a file, or loading someone else's version.** The Goals dialog shows it, the Goal pill keeps it
in sight, and three things open the dialog: the Edit menu, the word count and the pill.

**Status: built, 2026-11-03.** The design is Noah's, taken from the Neo writing app. The calls the
brief left open are under *Calls made without Noah*, for him to overturn.

## The forcing reason

A goal is only worth having if the number is honest, and the obvious way to count is dishonest. The
manuscript's total goes up when the writer types and when the writer *moves a scene*, when a file is
opened, and when another program's version loads. Counting "the total now, minus the total this
morning" would credit all four, and a writer who reorganised Act Two would meet their goal by lunch. So
the count is taken from **edits**: the session is told how many words each change added or cut
(`GoalsTracker.wordsChanged`) and is never told the total, so opening and loading — which are not edits
— cannot count.

Moving text is a cut and a paste. Clamping at zero after each edit would make the cut free and the
paste worth its full words; **the day's count is held signed** (−40 after the cut, 0 after the paste)
and clamped only where it is read.

## What is decided

1. **The goal is per project and lives in the bundle.** `goals.md`, in ADR-0025's sidecar shape:
   `# Goals`, a header of `Daily goal: 500` (or `off`) and `Days: Mon, Tue, …` (or `none`), then
   `## Words written` with one `- YYYY-MM-DD: N` line per day. It is project-level and never frozen
   at lock. It travels with the script, which is what makes a streak mean something on another machine.
2. **The writer chooses the weekdays**, any subset, all seven by default. A day that does not count
   neither breaks a streak nor extends one; its words are still recorded and still drawn.
3. **A streak is consecutive counted days with the goal met**, and the best streak is the longest run
   on record. Today, until it is over, can only help: a counted day not yet met is pending, not missed.
   Both are computed in one walk (`streaks`) and **stored nowhere** — they are read from the recorded
   days against the goal the project has *now*. Lowering the goal therefore lengthens the past streak.
4. **Words written** is added minus cut, per day, held signed and read clamped (above). Editing the title
   page is not words written: `wordsIn` now leaves the title page out, as the ledger's count always did.
5. **The day.** A day is a calendar date in the writer's local time, ending at `dayEndsAt()` —
   midnight, the one function a settings page will drive; there is no settings UI. That is **app-wide,
   not per project.** It is not the ledger's day, which is UTC (see below).
6. **A sprint** is a whole number of words, 50 to 100,000, offered at 500. No timer, no history. It
   counts from its start by the same measure, ends when reached (and disappears, with nothing shown),
   can be ended sooner, and is not saved: it does not outlive the project being open.
7. **The Goal pill** is a bottom pill on the left, beside the project's name, in the same class as the
   others. It is visible only while a goal is active: a running sprint (`210 / 500 sprint`), else the
   daily goal on a day that counts (`320 / 500 today`), staying after the goal is met and reading
   `620 / 500 today` when it is passed. Met is the affirm colour, passed the accent. Nothing animates and
   nothing pops up when a goal is reached; that is deferred.
8. **The dialog** shows total words, today against the goal, the streak and the best, a thirty-day chart
   (bars of words per day, a dashed line at the goal, days that do not count drawn quietly, met days in
   the affirm colour), the goal's settings (on/off, the number, seven weekday toggles) and the sprint's
   controls (target and Start; End while one runs). Choices take effect at once; **Done** only closes it.
   The chart is HTML and CSS on the tokens — no chart library.
9. **Three ways in**, one dialog: **Edit ▸ Edit Goals…** (a command-table entry, so the menu, the hint
   and any key come from one place), the counts pill, and the Goal pill. The shell knows only that a
   pill was pressed (`whenGoalsAsked`); it does not know what a goal is.
10. **Saving** is a pause after a change, like the manuscript (ADR-0028), plus once on closing, through
    its own `autosave`. A project whose `goals.md` exists and cannot be read is **not overwritten**
    (ADR-0008 rule 3): the writer is told, goals work in memory for the session, and the file is
    left as found. A failed write is said once and never stops a project closing.

## Considered options

- **Keep the history in the ledger (ADR-0017), not the bundle.** The ledger is where "words per day"
  already lives, and it is the one place a day's count survives a deleted project. Rejected for this:
  ADR-0017 says history does not travel with a bundle, and a streak that resets when the script is
  moved or shared is not the feature Noah asked for. The two do not hold the same fact — the ledger
  records the *absolute* words and pages at the close of a session, this records the *net written* —
  and neither can be derived from the other, so ADR-0008 rule 6's worry about two stores disagreeing
  does not arise. **This is the call most worth Noah's eye:** it puts a record of days inside the bundle,
  which ADR-0017 weighed and rejected for the ledger.
- **Count "total now minus total at the start of the day".** Rejected above: it credits moves and loads.
- **Clamp at zero after every edit.** Rejected above: it makes a move worth its words.
- **Store the streak.** Rejected: it would have to be re-derived whenever the goal or the counted days
  change, and a stored copy would disagree with the days it was read from.
- **A timer on sprints.** Out of scope by the brief: a sprint is a word target, not a stopwatch.
- **A chart library.** Not already present, and thirty bars and a line do not warrant one.

## Consequences

- **`goals.md` is a new file in the bundle.** ADR-0025's list gains it; a copy or duplicate of a project
  carries it (it is in the folder).
- **The Goals dialog redraws from a view model** (`GoalsTracker.view`), which is what the tests read; the
  window draws it and passes choices back.
- **The Goal pill is refreshed every minute** as well as on every edit, so a pill left open across
  midnight notices the new day without a keystroke.
- **Local-time days, UTC ledger days.** A writer near midnight in a zone far from UTC can see the goals'
  day and the ledger's day disagree about which date a session fell on. They answer different questions
  (the writer's day, and a reproducible line) and are not reconciled.
- **Not built:** the settings page that moves *Day ends at*; completion animations (deferred); a per-day
  edit of the history.

## Calls made without Noah

- **Edit ▸ Edit Goals…** carries an ellipsis, like Edit Title Page…, because it opens a dialog.
- **A daily goal runs 1 to 100,000 words**; the upper bound only keeps a typo from being a number.
- **Turning the goal off keeps the days**, so turning it back on has a past.
- **Turning on the daily goal with an empty box offers 500**, as the sprint does.
- **The sprint's pill text is `210 / 500 sprint`**, beside `320 / 500 today`, so the two read as a pair.
- **`wordsIn` no longer counts title-page lines.** It did before, so the counts pill's words were a few
  too many on a script with a title page; it now agrees with the ledger's `wordCount`.
