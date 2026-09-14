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
  notes.md             notes
```

**Every sidecar file is written in the same Pandoc Markdown subset the prose surface uses**
(ADR-0023), with each record as a section: the writer's words in the body, the application's
bookkeeping in a short labelled header beneath the heading.

**One file per workspace, not one file per record.**

## The forcing reasons

**Markdown, and specifically the prose subset**, for three reasons that stack. ADR-0012
requires a lossless parser for any sidecar format holding the writer's prose — so this way
Write-ist writes **one prose parser, not two**. ADR-0012's readability standard is a diagnosis
argument, not an aesthetic one, and the file that survived v1's data loss was `notes.md`, plain
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
