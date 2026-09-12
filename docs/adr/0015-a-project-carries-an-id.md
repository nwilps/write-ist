# A project carries an id, and it says which, not where

Every bundle carries a **project id**: a UUID4, minted when the project is created, written
into the same bundle-level metadata file as ADR-0004's format version, and never changed
afterwards. It answers *which project this bundle is*. It never says where the bundle lives.

**The forcing reason is that a folder's path is not a name for it.** A bundle is a folder
(ADR-0004), and folders get renamed and moved — deliberately so, since a writer may relocate a
bundle into a cloud drive. Anything that ever refers to a project from outside it has two
choices: the path, which breaks on the first rename, or an id. The id costs one field in a
file we already have to write.

**The accruing argument is not the reason, and was wrong.** Ticket #4 proposed this as the
same shape as ADR-0004's instruction to write a format version from day one — one field now,
unrecoverable later. It is not. A format version is unrecoverable because the fact was never
written down and may not be inferable from the bytes; a project id can be minted on first
open of an id-less bundle, because the bundle is right there and unambiguous. novelWriter did
exactly that, retrofitting a UUID4 into an existing format in its 1.5 release and minting it
lazily. By `docs/STANDARDS.md`'s own test — *can this be computed later from what is already
saved?* — a project id passes. What genuinely cannot survive being late is records written
**elsewhere** that needed to name a project before the id existed — and whether any such
record exists at all is the still-open question of whether anything lives above a bundle, not
this one. The argument is recorded here as rejected so it is not re-derived.

What remains is a cost asymmetry, and it is enough: one field written at creation, against a
retrofit path that has to run on every bundle opened for the life of the application, plus the
permanent ambiguity of not knowing whether a given bundle predates the id.

## Considered options

- **The path is the identity.** Costs nothing, adds no field, and is honest until the day a
  folder moves — at which point every record referring to it is orphaned, silently. Rejected.
  Relocating a bundle to a cloud drive is a supported move, so this design breaks on a
  feature we intend to offer rather than on writer error.
- **A filesystem identifier** — inode, NTFS file id, macOS file reference URL. Rejected on
  the evidence: a restore from backup writes new inodes and new birthtimes, so the mechanism
  fails the event most likely to hit a writer who has done nothing wrong. Apple documents its
  own file reference URLs as "not safe to store and reuse between launches"; Microsoft
  documents that "File IDs are not guaranteed to be unique over time". macOS bookmarks are the
  strongest move-tracking mechanism any platform offers and are ruled out separately: "an
  opaque data structure", so ADR-0012, and macOS-only besides.
- **Identity derived from content, which is git's answer.** Git has no project identity at
  all — there is no UUID anywhere in a repository, and what git identifies is content, by a
  hash of that content, so rename, move, copy and restore are all non-events. It is the only
  mechanism in the survey that survives every event, and it does not transfer: a project's
  content is mutable by definition, so a content-derived project id would change on every
  keystroke. Git identifies content, not projects.
- **Mint lazily on first open.** The real alternative once the accruing argument fell, and
  rejected on the cost asymmetry above rather than on principle.

Evidence for all four: `docs/research/project-identity-and-cross-project-state.md`.

## Consequences

- **The id says which, never where — so finding projects does not need it.** Projects live in
  a default location the application chooses, so discovery is a directory listing: every
  folder there carrying the marker is a project. Nothing is written down, so nothing can go
  stale. A path is an *input* to opening a bundle; the id is what the bundle turns out to be
  once opened.
- **Only a relocated bundle needs remembering, and where that memory lives is not decided
  here.** A bundle the writer has moved to a cloud drive cannot be found by scanning, so
  something outside every bundle has to point at it. That store is the **registry**, decided in
  [ADR-0016](0016-the-layer-above-a-bundle-holds-no-work.md). What this ADR fixes is the direction of authority: **the id is authoritative over
  the path, never the reverse.** A bundle never records its own location — a self-recorded
  path is wrong the instant the folder moves, wrong in the worst way because it looks
  authoritative, and necessarily wrong for a bundle synced between two machines that mount the
  same cloud drive at different paths.
- **A pointer that no longer resolves fails visibly and is repaired by the writer.** Never
  silently, never automatically, and *absent* is never read as *deleted* — a path that is not
  there may be an unmounted disk. This is ADR-0008 rule 3 applied across the bundle boundary,
  and it is Syncthing's `.stfolder` reasoning: an ambiguous read must not authorise a write.
- **In-app duplication mints a fresh id; duplication outside the app is undetectable, and
  accepted.** Duplicate copies everything the writer sees and nothing else — the copy earns a
  new id and is a new project from that moment. A `cp -r`, a Finder copy, a backup restored
  into a second location, or a cloud client's "conflicted copy" cannot be intercepted, and two
  such bundles are locally perfect and identical, so no in-bundle test can tell them apart.
  Detection would require something outside the bundle comparing two claims to one id. This is
  recorded as accepted rather than open: every tool surveyed accepts the same collision, and
  none asks the writer "is this a copy or a move?".
- **An ambiguous folder is not adopted.** A folder with no marker, or one whose marker cannot
  be read, fails closed: the application declines to treat it as a bundle rather than adopting
  it and writing into it. ADR-0008 rule 3 covers a failed load authorising a write; this is
  the same defect class one step earlier, at the point of deciding what a folder even is.
  novelWriter treats an unreadable lock file as locked rather than as absent, for the same
  reason.
- **The id is opaque and that is fine.** A UUID4 rather than the short prefixed hex of
  ADR-0008 rule 1's scene ids: those are short because they sit inside manuscript prose and
  need only be unique within one document, and neither pressure applies to a value sitting
  alone in a labelled field that must be unique across every project a writer will ever make.
  The writer never sees it. ADR-0012's readability guarantee is met by the field being named
  and the file being text, which is what makes the id greppable when a writer has lost a
  folder.
- **`CONTEXT.md` gains **Project id**.** The term was held out of the glossary pending this
  decision.
