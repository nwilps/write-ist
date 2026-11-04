# Every day is the writer's local day, ledger included

**The ledger dates its `day` lines with `writingDayOf()` — the function the writing goals use — so the
whole app rolls over at one moment: local midnight in the operating system's time zone (or wherever
*Day ends at* says, ADR-0040).** There is one definition of a day, in `src/goals/day.ts`, and
`ledger.ts` no longer has its own.

**Status: built, 2026-11-03.** Noah asked for everything to reset at local midnight. This overturns the
UTC ledger day recorded in ADR-0017's code and in ADR-0040's consequences; ADR-0017's decision (an
append-only record of the writer's days, above every bundle) stands.

## Why

A ledger day in UTC and a goal day in local time disagree about which date a late-evening session
fell on for anyone far from UTC, and a writer would see the Goals dialog and the ledger name two
different days for the same work. One boundary is easier to explain than two reasons for having two.
The reproducibility UTC bought (one Instant, one line on every machine) is not worth that: the ledger
belongs to one writer on one machine (ADR-0017, *History does not travel*).

## Old entries

The ledger is append-only (ADR-0017), so nothing is rewritten and nothing is lost.

- `day` lines already in the file were dated in UTC. They are kept byte for byte and **read as the date
  they carry**. The offset is unknown to us and, for a writer whose zone is behind UTC, at most one day
  off for work done in the hours either side of midnight UTC; no attempt is made to guess.
- The first `day` line written under this rule is preceded by one marker line,
  `days\tlocal\t<ISO-8601 instant>`, written in the same append. Every `day` line above the marker is
  UTC-dated; every one below is local. A ledger with no marker is wholly UTC-dated; a new ledger starts
  with the marker. Nothing reads the ledger yet, so nothing needs the marker today; it is there so a
  future reader does not have to guess where the change was.
- Unknown line kinds are skipped by readers, as `opened` and `closed` already would be by a reader
  that wanted only days.

## Daylight saving and a changing zone

- `writingDayOf` reads the wall clock in the system zone, then subtracts *Day ends at* with UTC
  arithmetic, which has no skipped or repeated hour. A 23-hour or 25-hour day is still exactly one
  date, and a day that ends at 02:30 cannot fall into the spring-forward gap.
- The zone is read each time an instant is dated and is **never stored**. A writer who flies from
  London to Tokyo, or whose clock changes offset, moves only where the next line lands. Lines already
  written are not re-dated. Across the move a date can repeat (west) or be skipped (east); the ledger
  records absolute counts at a moment (ADR-0017), so a repeated date is the later line and a skipped
  date is a day with no line, as a day the writer did not open the app would be.
- The goals' own history (ADR-0040) was already local and is unchanged.

## Considered options

- **Keep UTC in the ledger.** Rejected: the disagreement above.
- **Rewrite old lines to local dates.** Rejected: it needs the zone each line was written in, which was
  never recorded, and ADR-0017 makes rewriting the file structurally impossible on purpose.
- **Record the zone offset on every line.** Would let a reader re-date exactly. Rejected for now as
  scope; the marker keeps the door open, and a later format can add a field at the end.
