# What a bundle holds on disk

A bundle is a folder. Its contents, in full:

```
The Pilot/
  project.md          format version, project id, format, project name
  manuscript.fountain  the in-progress draft        (.md on the prose surface)
  drafts/
    1.fountain         locked drafts, each under its own name
    1.1.fountain
    2a.fountain
  drafts.md            the draft index — lock dates, what follows each draft
  plan.md              Plan: cards
  log.md               the Log: entries, tasks, pushes
  notes/               notes: one plain-text .md file a note (amended 2026-11-23)
    Ideas.md
  names.txt            the characters and locations the writer added to or removed from the lists by hand
  goals.md             the daily goal, the weekdays that count, and the words written each day
  details.md           the target page count and which workspaces the project shows
```

> **Amended 2026-11-26 (drafts, below).** `manuscript.fountain` is the **trunk's open draft**;
> each branch's open draft sits beside it as `manuscript 2a.fountain`; and `drafts.md` says which
> open draft the writer is in, as well as each lock's date and note.

**`names.txt` is the exception (slice 2, step 8).** It holds only names the writer confirmed,
plain text, a kind on a line and one indented name under it — kept trivial so its format can
change cheaply. It is project-level and never frozen at lock, like the other sidecar files.

> **Amended 2026-11-22 (Noah).** There is no confirming any more: a name is on its list from its
> first use. `names.txt` holds the names the writer **added** by hand (`characters`, `locations`)
> and those they **removed** (`removed characters`, `removed locations`), names only. An older
> file's `hidden characters` / `hidden locations` sections are read as removed, their counts
> ignored, and are written back as `removed …`.

**`goals.md` follows the shape below** (ADR-0040): a heading, a labelled header (`Daily goal`, `Days`), and
one line per day under *Words written*. Project-level and never frozen at lock.

**`details.md` is added by amendment (2026-11-21, Edit Project Details).** It holds what the
writer sets about the project that is not its marker's: the **target page count** and **which
workspaces it shows** (ADR-0006: the writer may add or remove any workspace). A heading and two
labelled lines, `Target pages:` and `Workspaces:` (workspace ids). It is **not** in `project.md`,
which keeps its four things: the marker decides whether a folder is a bundle at all, so it is
written only when a project is made or renamed, never on a toggle. A project without the file shows
every workspace and has no target; one whose file cannot be read shows the same and the file is
never written over (ADR-0008 rule 3). Project-level, and never frozen at lock. Turning a workspace
off never touches its files (`plan.md`, the `notes/` folder).

> **Amended 2026-11-23 (Noah, PR #164). Notes is a folder, `notes/`, not one `notes.md`.** Each
> note is its own plain-text `.md` file in it, named for the note (`notes/Ideas.md`) — exactly as
> typed, with no Markdown drawn — opened in tabs in the Notes workspace: new ones as `Untitled`,
> `Untitled 2`…, renamed by the writer (a name is made safe for every disk and numbered if taken,
> quietly), and deleted from the folder menu after a confirmation. A rename is a move that never
> replaces another file; a delete is the writer's, confirmed, and removes only a `.md` file directly
> in a project's `notes/` (see ADR-0044's note of the same date). Each note saves as a workspace
> file does (ADR-0028, ADR-0031): a change made elsewhere is kept beside the note *in `notes/`*.
> **An older project's `notes.md` is moved, once, into the folder** as `notes/Notes.md` — or
> `Notes 2.md` and on, if that name is taken, so nothing is ever written over — the first time Notes
> opens; if the move fails it stays where it is and is tried again. Which notes were open, which was
> in front, and each note's caret and scroll are session memory in app data
> (`workspace-places.txt`), never in the bundle (ADR-0009, ADR-0012). Turning Notes off never
> touches the folder.

> **Amended 2026-11-25 (ADR-0045).** A workspace's files are those its manifest declares, and its
> toolbox reaches those and no others. Notes declares `notes/` **and the old `notes.md`**, which it
> moves into the folder once; Plan declares `plan.md`. A delete removes one file directly in a
> declared folder (ADR-0044, amended the same day), whatever its extension. **`details.md` may also
> hold a workspace's own per-project settings**, a line each, `Setting <workspace>.<setting>: yes`
> or `no`, after the others — none today, since no workspace declares one. A line for a workspace
> this version does not offer is kept as it is.

**Every other sidecar file is written in the same Pandoc Markdown subset the prose surface uses**
(ADR-0023), with each record as a section: the writer's words in the body, the application's
bookkeeping in a short labelled header beneath the heading.

**One file per workspace, not one file per record.**

## The forcing reasons

**Markdown, and specifically the prose subset**, for three reasons that stack. ADR-0012
requires a lossless parser for any sidecar format holding the writer's prose — so this way
Write-ist writes **one prose parser, not two**. ADR-0012's readability standard is a diagnosis
argument, not an aesthetic one, and the file that survived v1's data loss was v1's `notes.md`, plain
Markdown anchored to nothing. And it satisfies ADR-0012's specific instruction that *"prose
embedded in a structured record stays plain, never escaped past recognition"* — the writer's
words sit in a document body rather than inside a quoted string.

**One file per workspace** is forced by ADR-0008 rule 6: the manuscript and sidecar cannot
disagree after a crash, so a bundle's files must be written as one logical change. A bundle
holding 200 plan-card files is 200 files to keep consistent; this one is four. One file per
record — the Obsidian and Scrivener shape — buys per-record readability that a workspace file
already provides, and pays for it in exactly the integrity problem the rules exist to prevent.

**Locked drafts stored under their own names** is ADR-0014's requirement, verbatim: *"a locked
draft is stored under its own name, so its identity is self-evident and the index holds only
presentation."* Losing `drafts.md` costs lock dates and never the ability to tell which draft is
which. Lineage needs no storing at all — `2a` already says it departs from 2, by ADR-0002's
naming rule.

## Considered options

- **TOML for the sidecar.** Holds bookkeeping natively, and ADR-0012's own table notes that
  *"almost everything is bookkeeping"*, which is a real argument for it. Rejected because it
  puts the writer's prose inside string literals, and because it would be a third parser in an
  application that already writes two.
- **One Markdown file per record.** Rejected on ADR-0008 rule 6 above.
- **A single sidecar file holding everything.** Rejected: Plan, the Log and notes fail
  independently and should not share a file, which is ADR-0017's reasoning for keeping the
  ledger and the registry apart, applied one level down.
- **Per-draft sidecar folders.** Rejected by ADR-0014: everything in the sidecar is
  project-level and never freezes, because comments — the sidecar's one anchored member — now
  live in the manuscript and freeze with it automatically (ADR-0018).

## Consequences

- **`project.md` is the marker that makes a folder a bundle.** ADR-0015's rules apply in full:
  a folder with no marker, or one whose marker cannot be read, is not adopted — the application
  declines to treat it as a bundle rather than writing into it. Discovery of projects in the
  default location is a directory listing for this file.
- **Saving a draft is a single-file atomic write**, as ADR-0010 requires, with ADR-0008 rule 5's
  temp-flush-rename. Sidecar writes are separate and must not be able to leave the bundle
  half-updated.
- **The extension says which surface.** `manuscript.fountain` and `manuscript.md` are the two
  shapes, which is ADR-0005's surfaces-are-few made visible on disk, and it means a stranger
  double-clicking the file gets a sensible handler.
- **A bundle holds only text, and this layout has nowhere to put anything else** (ADR-0009).
- **Retention for locked drafts is still open.** ADR-0002 deferred it — *"disk growth is bounded
  by how often the writer locks, which they control"* — and this layout makes the cost visible:
  one full manuscript per lock in `drafts/`. Nothing here decides it.

## Amended 2026-11-26: drafts, open drafts and `drafts.md`, as built (Noah)

ADR-0002 (amended the same day) allows several **open drafts** — the trunk's, and one at the tip
of each branch. On disk:

```
The Pilot/
  manuscript.fountain        the trunk's open draft — every project has it
  manuscript 2a.fountain     the open draft on branch 2a; one file a branch, named for the branch
  manuscript 2b.fountain
  drafts/
    1.fountain               a locked draft, under its own name; never written again
    1.1.fountain
    2.fountain
    2a.fountain
  drafts.md                  which open draft the writer is in; each lock's date and note
```

- **An open draft keeps one file for its life.** A branch's open draft is named for the branch
  (`manuscript 2a.fountain`), not for its next lock, so locking 2a, 2a.1 and 2a-2 never renames
  or moves it. Moving between open drafts writes nothing but which one is in front: there is no
  swapping of files, so there is no half-swapped bundle after a crash. The trunk's stays
  `manuscript.fountain`, so a stranger double-clicking the obvious file gets the trunk, and every
  tool that already reads it — export, the projects list, ADR-0028's changed-elsewhere copy —
  goes on working. A copy kept beside a branch's open draft is named for it:
  `manuscript 2a changed elsewhere 2026-11-26 10.00.00.fountain`, which can never be mistaken
  for an open draft, because a branch's name has no spaces.
- **A locked draft is `drafts/<name>.fountain`** (`.md` on the prose surface), written once, landing
  whole or not at all (ADR-0008 rule 5), and never over a file already there.
- **`drafts.md`** is a sidecar in this ADR's shape:

  ```
  # Drafts

  Writing in: manuscript 2a.fountain

  ## 1

  Locked: 2026-11-20

  First pass, for Sam.

  ## 1.1

  Locked: 2026-11-22
  ```

  `Writing in` is the open draft the project opens in; each lock has a section, its day in the
  writer's own time in the header, and the writer's one-line note (at most 120 characters, put
  right quietly) as its body. A section it does not recognise is kept as it was found.
- **Everything that says which draft is which is a file name**, as ADR-0014 requires: the line of
  drafts, their order, what an open draft continues from and what its next lock will be called
  are all read from the names in `drafts/` and the open drafts' files. **Losing `drafts.md` costs
  the dates, the notes and which open draft was in front** — the project then opens on the trunk —
  and never a draft.
- **A lock lands whole or not at all.** The locked file is written first, then `drafts.md`; if
  `drafts.md` cannot be written, the locked file is removed again (one file, directly in
  `drafts/`, through the one narrow delete), so a failed lock leaves the bundle as it was and the
  open draft untouched. Each lock, branch or move reads the folder afresh first.
- **A `drafts.md` that will not read is never written** (ADR-0008 rule 3). The writer is told when
  the project opens; locked drafts can still be read, and nothing can be locked, branched or
  moved between until the file reads (a move is recorded there).
- **An older bundle** — `project.md` and `manuscript.fountain`, no `drafts/`, no `drafts.md` — is
  read as one open draft on the trunk, which is the one written in, and whose first lock is
  **Draft 1**. Nothing is written to it until the writer locks or branches.
- Plan, Notes, the Log, goals, names and details stay project-level and are never copied at a lock
  (ADR-0014).
