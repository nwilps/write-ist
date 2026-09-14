# Drafts are locked, never restored

Version history for a project is a sequence of **drafts**. The writer works on exactly one
draft at a time and **locks** it when finished, which freezes its manuscript and sidecar
together, permanently. At the moment of locking the writer says whether what follows is a
*revision* of the same draft (1 becomes 1.1) or a new *draft* (1.1 becomes 2). Locking is
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
  deliberate move, not a parallel state.
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
