# Drafts are locked, never restored

Version history for a project is a sequence of **drafts**. The writer works on exactly one
draft at a time and **locks** it when finished, which freezes its manuscript and sidecar
together, permanently. At the moment of locking the writer says whether what follows is a
*revision* of the same draft (1 becomes 1.1) or a new *draft* (1.1 becomes 2). *(Amended
2026-11-26, below: the writer says what the lock itself is, revision or new draft, and the
dialog shows its exact name.)* Locking is
the only thing that mints a number, and numbers are never reused or rewritten.

> **Narrowed by [ADR-0014](0014-anchoring-decides-what-freezes.md).** "Manuscript and sidecar
> together" was too broad. What freezes is the manuscript plus the sidecar content *anchored
> into it*; sidecar content that anchors to nothing — Plan, the Log, notes, project metadata —
> is project-level and never freezes. Everything else in this ADR stands as written.

A locked draft is **read, never restored**. Work always continues forward into a new draft;
nothing ever overwrites live work with older content.

## Considered options

**Automatic snapshots with restore** was the obvious design and is rejected. Restoring pulls
old manuscript text into the present, where it meets sidecar data written against newer
text — anchors that no longer resolve, notes pointing at scenes that have moved. That is the
v1 highlights failure (see ADR-0001's sibling context in `docs/PLANNING.md`) reintroduced
deliberately, as a feature. Locking moves only forward, so the situation cannot arise.

Snapshots also ask the writer to manage a history they did not author. Locking is an act the
writer already performs mentally — "that draft is done" — so the record is a byproduct of
how they already work.

## Branching

The in-progress draft may continue from **any** locked draft, not only the most recent one.
This is not speculative: notes came back on a real screenplay saying an earlier draft was
the one to send, and work continued from there.

Constraints that keep this from becoming a tree to maintain:

- **Exactly one draft is in progress at any moment.** Resuming from an earlier draft is a
  deliberate move, not a parallel state. *(Amended 2026-11-26, below: the tip of the trunk and of
  each branch stays open until it is locked, so several open drafts may exist; the writer
  writes in one at a time.)*
- **A draft's name records its lineage.** Plain numbers run along the trunk — 1, 2, 3 — and
  a letter marks a departure from a locked draft, so resuming from draft 2 when 3 and 4
  already exist locks as 2a, and a second departure from draft 2 locks as 2b. Drafts 3 and 4
  keep their names: a plain number means trunk, a letter means departure, so the asymmetry
  carries meaning rather than being an artifact of ordering. A draft tree shows where each
  chain sits, which is what keeps 2a from reading as older than 4.
- **Nothing is renamed or restamped when the chain moves.** Whether a draft is on the current
  **chain** or **set aside** is computed from where work is happening now, so resuming from a
  set-aside draft simply redraws the chain. Locked drafts are immutable on disk, which is what
  makes locking trustworthy.

## Consequences

- Every lock retains a full copy of the manuscript and sidecar. Disk growth is bounded by
  how often the writer locks, which they control. Retention policy is deferred, not denied.
- Undo/redo remains a separate, session-level mechanism, and autosave a third. Drafts are
  durable and deliberate; undo is neither. Conflating any two of the three is the standard
  mistake this decision exists to avoid.
- Sidecar data anchors into a specific draft. The same anchor in two drafts refers to two
  different places.

## Amended 2026-11-26: open drafts on the trunk and on branches, and naming at the lock (Noah)

Built as Noah approved it. Where this conflicts with the text above, this wins.

- **Several drafts may be open.** The tip of the trunk and the tip of every branch is an *open
  draft*: written in, never locked until the writer locks it. Branching from an earlier locked
  draft (2, while 3 is open on the trunk) makes a new open draft and **does not lock, close or
  touch** the open draft on the trunk. The writer writes in one open draft at a time and moves
  between them from the Draft Tree; the one left is saved first, and stays open. "Exactly one
  draft is in progress" now means only that: one is on the paper.
- **Locking never closes an open draft.** It copies the open draft backward (ADR-0014) and the
  writer goes on in the same open draft, which continues from the lock just made. So every line
  of drafts always has its open draft at its foot.
- **The choice is made at the lock, after the writing — never at the start of a draft.** The
  lock dialog shows the exact name the lock will take, in its sentence and on its button
  ("Lock as Draft 1.1"), for whichever choice is selected.
- **Naming, exactly.** A name is read from the right:
  - `.R` is a revision: 1.1, 1.2, 2a.1, 2a-2.3.
  - A plain number is a trunk draft: 1, 2, 3.
  - Anything else ends in a **branch**: the locked draft it departs from and **one letter**, a to
    z — 2a, 2b (a second departure from 2), 1.1a (from revision 1.1), 2aa (from 2a) — optionally
    followed by **`-K`**, the branch's K-th new draft, K ≥ 2: 2a-2, 2a-3.
- **What a lock is called.** On a line (the trunk, or one branch) with no lock yet, the name is
  fixed and nothing is asked: **1** on the trunk, the branch's own name (**2a**) on a branch.
  After that, with L the latest lock on the line:
  - **Revision** → L's draft with the next revision number: 1 → 1.1, 1.1 → 1.2, 2a → 2a.1,
    2a-2.1 → 2a-2.2.
  - **New Draft** → the line's next draft: on the trunk the next plain number (1.1 → 2); on
    branch 2a, **2a-2**, then 2a-3. The hyphen is what keeps 2a's second new draft apart from a
    second departure from 2, which is **2b**: `2a-2` can never be read as a branch, and `2b`
    never as a draft on branch 2a.
- **Branch letters** are the first letter no branch from that draft has, locked or open. Twenty-six
  departures from one draft are the most there can be; a twenty-seventh is refused in words.
- **Branch from here** is on a locked draft read on the paper. It makes the branch's open draft,
  starting as a copy of that locked draft, and the writer is writing in it at once. Nothing types
  a branch into being: a locked draft on the paper takes no keystrokes at all.
- **Undo and the lock.** The open draft never stops at a lock, so its undo history carries on
  through one: Ctrl+Z after a lock changes the open draft, never the locked copy — and straight
  after an unticked *Carry comments forward* it brings the comments back. Moving to another draft
  starts that draft's own history, as opening a project does.
