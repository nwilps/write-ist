# The layer above a bundle holds no work

There is a place on disk that belongs to Write-ist and to no project, and it is narrow. Two
files, two contracts:

- **The registry**, a record in `appLocalDataDir()` holding pointers to bundles the writer has
  moved out of the default location. ADR-0008 rule 3 applies to it in full.
- **A config file**, in `appConfigDir()`, holding preferences that belong to the writer rather
  than to any one work — theme, their own name and contact details. Losing it means falling
  back to defaults.

> **Widened by [ADR-0017](0017-the-ledger-records-the-writers-days.md).** "Nothing else lives
> up there" was true when written and is now one item wider: the **ledger**, an append-only
> record of the writer's days, sits beside the registry under the same contract. The invariant
> below survives unchanged — a ledger is not work, and losing it costs a chart rather than a
> word. Everything else in this ADR stands as written.

The rule that keeps the layer narrow is this:

> **The layer above a bundle holds no work, ever.** Delete all of it and the writer loses some
> re-pointing and some preferences. They never lose a word they wrote, because every word is
> in a bundle in `~/Documents/write-ist/`.

**The forcing reason is ADR-0015.** A bundle the writer has relocated to a cloud drive cannot
be found by listing the default location, so something outside every bundle has to point at
it. The negative answer — no cross-project store at all — was available right up until that
decision, and taking it now means withdrawing relocation. That trade was put and declined:
letting a writer keep a project where they want it is worth one file.

## The constraints, re-derived rather than assumed

ADR-0009 and ADR-0012 bind *inside* a bundle, and neither mentions a store outside one. They
do not simply carry over, so each is re-derived here.

- **ADR-0009's text-only rule does not reach.** Its forcing argument is that locking copies the
  sidecar, so a binary file is copied once per lock. Nothing above a bundle is ever copied by a
  lock. The rule is not extended.
- **ADR-0012's readability does reach, and more strongly than inside a bundle.** Its reason is
  not aesthetics but diagnosis: readability "is what lets a person diagnose and rescue their
  own data when the app is wrong about it". This store is never shown to the writer and never
  managed by them, so when it goes wrong there is *no in-app recourse at all* and the file is
  the only place to look. Invisible in the interface is the strongest argument for legible on
  disk, not a weaker one.

The evidence for both, and for everything in Considered options, is
`docs/research/project-identity-and-cross-project-state.md`.

## Considered options

- **No store at all.** Coherent, and cheaper than it looks: recents become a directory
  listing, and per-project preferences could live in each bundle the way Obsidian keeps
  hotkeys and themes inside each vault. Rejected because it costs relocation, and only that.
  Recorded so the cost is visible rather than rediscovered.
- **One general-purpose store.** Rejected: it forces a single answer to whether the store is a
  cache or a record, and the candidates disagree. Call it all cache and relocation pointers can
  be destroyed by a bad read; call it all record and rule-3 ceremony wraps things whose correct
  repair is deletion.
- **A cache directory alongside the record.** Designed, then dropped, because after the
  refusals below it holds nothing: the search index is refused, recents are derived, ADR-0009
  means no binary previews exist, and the pagination metrics ship with the application rather
  than being user data. The split survives as a **sorting rule**, not a directory — see
  Consequences.
- **`appDataDir()` or a hand-built `XDG_STATE_HOME` for the record.** `XDG_STATE_HOME` is
  defined for precisely this job ("recently used files", "current state of the application"),
  but Tauri v2 exposes 23 path functions and no state directory, so it means hand-constructing
  paths on three platforms for a distinction only Linux recognises. `appDataDir()` is worse: it
  resolves to **Roaming** on Windows, and a store of absolute paths that roams to another
  machine is wrong on arrival.

## Consequences

- **Three locations, three contracts.** The bundles in `~/Documents/write-ist/` hold every word
  the writer has typed. The record refuses to write when it cannot read itself. The config file
  falls back to defaults and carries on. Keeping preferences out of the record file is what
  keeps those last two failure modes from blurring.
- **Local, never Roaming.** `appLocalDataDir()` and `appConfigDir()` both resolve to
  `%LOCALAPPDATA%`-class locations on Windows. Absolute paths must not follow a user to another
  machine.
- **Absent and unparseable are different, and the difference is the whole of rule 3 out here.**
  No file means first run: create it. A file that will not parse means refuse to write, keep a
  copy, and surface it. This is the exact line novelWriter crosses — `_data = {}` set *before*
  the `try`, and the next save writes the empty dict over the good file.
- **Losing the record is bounded, by construction.** If absence is wrong — a badly restored
  home directory — the cost is that relocated projects are not listed until the writer points
  at them again, and, since ADR-0017, that the ledger starts again from that day. The bundles
  are untouched and no word is lost. This is what makes an invisible, unmanaged store safe to
  have.
- **Every record carries a human breadcrumb.** The natural key is the project id, which is a
  UUID, and a store keyed only by UUID reproduces VS Code's failure exactly: an orphaned entry
  nobody can attribute to anything, under a name nobody can decode. So each entry carries the
  project's name and last-known path beside its id. novelWriter's registry has this shape, and
  it is ADR-0012's diagnosis argument applied outside the bundle.
- **The writer re-points a project; they never manage a store.** A pointer that no longer
  resolves surfaces as *"where did The Pilot go?"* — a question about a work they know about.
  There is no registry screen, no list to curate, and nothing is repaired silently or
  automatically. *Absent* is never read as *deleted*: a path that is not there may be an
  unmounted disk.
- **Recents are derived, not stored.** Listing the default location gives the projects kept
  there; the record gives the relocated ones; a bundle's folder modification time gives
  recency, and reflects when it was last written to rather than when it was last opened. A
  derived list cannot go stale and cannot be corrupted.
- **A global search index is refused, permanently.** Bundles are plain text in a known folder,
  which Spotlight, Windows Search, `grep` and `rg` already index. Our own index would rebuild —
  worse, and with a staleness problem — what ADR-0003's plain-text bet already bought. Recorded
  because from the outside this looks like a missing feature rather than a decision.
- **App-managed backup is refused, permanently**, on the same ground. ADR-0002 already retains
  a full copy on every lock, and a folder of text files in `~/Documents` is what every backup
  tool on every platform already handles. Writers who want backups manage them their own way.
- **The cache criterion survives without a cache.** *Regenerable by rescanning* means
  deletable, permitted to be opaque, and outside rule 3. Should something of that shape ever
  appear it gets its own location under `appCacheDir()` — where Apple documents that the system
  may delete the contents, which is exactly the semantics such data wants. It does not go in
  the record.
- **Per-project preferences are not up here.** How a surface renders and how an export is
  defined belong to one work: they are sidecar, they anchor to nothing, so ADR-0014 already
  makes them project-level and never frozen. Whether a global preference can be overridden per
  project is ADR-0006's question — formats set defaults, never restrictions — and is not
  decided here.
- **This constrains the open question of whether v2 records events from day one.** Cross-project
  work records would be the first thing to break the invariant at the top of this ADR: they
  accrue, so they cannot be regenerated, and `docs/STANDARDS.md` names time spent writing as
  exactly that kind of data. The way to keep the invariant is per-bundle event logs with the
  cross-project view computed by reading bundles — which ADR-0014 already sets up, the Log
  being project-level and inside the bundle. Recorded as a constraint, not as that decision.
- **`CONTEXT.md` gains **Registry****, naming the record specifically rather than the whole
  layer — the config file sits outside every bundle too, and is not part of it. A term was
  held out of the glossary pending this decision, because there was no word for the thing.
