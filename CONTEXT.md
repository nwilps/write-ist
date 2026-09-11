# Write-ist

A fully local writing application. A project is created as a *format* — screenplay, novel,
essay — and opens onto an editing *surface* tuned to it, with planning *workspaces*
alongside.

This file is a glossary and nothing else. Decisions live in [`docs/adr/`](docs/adr/).

## Language

### The work

**Project**:
A single work the user creates and opens, together with everything known about it. One
format, one surface, one or more drafts.
_Avoid_: document, file

**Draft**:
A numbered state of the work. Exactly one draft is in progress at any moment; every other
draft is locked. Work continues into a new draft rather than reopening a locked one, so a
draft is only ever read once it is locked — never restored over live work. A draft's name
records its lineage: plain numbers run along the trunk (1, 2, 3) and a letter marks a
departure from a locked draft, so 2a and 2b are two departures from draft 2.
_Avoid_: snapshot, version, pass, copy

**Lock**:
Declaring a draft finished. Locking is permanent and archival: the draft's manuscript and
sidecar freeze together and never change again. At the moment of locking the writer says
what follows — a *revision* of the same draft (1 becomes 1.1) or a new *draft* (1.1
becomes 2). Locking is the only thing that mints a number.
_Avoid_: publish, finalise, freeze, commit, save

**Undo/redo**:
A session-level stack of edits the writer can walk backwards and forwards. It is not durable
and not history: closing the project ends it. Distinct from a draft, which is durable and
deliberate, and from autosave, which is neither.
_Avoid_: history, versions, rollback

**Autosave**:
Writing the in-progress draft to disk without the writer asking. Autosave preserves the
present; it never creates a draft and never appears in history.
_Avoid_: save, checkpoint, snapshot, backup

**Line**:
The chain of locked drafts leading to the draft in progress — 1, 2 and 2a are on it while
2a is being written, leaving 3 and 4 set aside. Membership is computed from where work is
happening now, never stored on a draft, so resuming from a different locked draft redraws
the line without renaming or rewriting anything.
_Avoid_: branch, trunk, mainline, path, history

**Set aside**:
A locked draft that is not on the current line. Being set aside is a relationship to present
work, not a verdict on the draft and not a permanent state — resuming from a set-aside draft
makes it current and sets aside whatever line was running before.
_Avoid_: superseded, abandoned, deprecated, obsolete, dead

**Revision**:
A locked draft that continues the same draft number — 1.1 after 1. A revision is what the
writer chooses when the changes since the last lock were not large enough to be a new draft.
That judgement is the writer's, never the app's.
_Avoid_: minor version, patch, point release

**Manuscript**:
The authored text of a draft — the thing the writer types into, and the only artifact that
survives the app disappearing. Plain text.
_Avoid_: script, copy, body

**Sidecar**:
Everything known about a manuscript that is not the manuscript: notes, plan cards, log
entries, project metadata.
_Avoid_: metadata, database, index

**Bundle**:
The on-disk form of a project — a folder holding the manuscript and its sidecar, rather
than a single file. Everything in a bundle is text; it never holds images or other binary
files.
_Avoid_: package, archive, container

### The editing model

**Surface**:
An editing engine: one element vocabulary, one set of layout rules. Expensive and
deliberately few — screenplay and prose.
_Avoid_: editor, mode, view, engine

**Format**:
What the user picks at New Project — a label plus defaults, running on a surface. Feature
and TV are screenplay formats; novel, short story and essay are prose formats. Formats set
defaults, never restrictions.
_Avoid_: project type, template, genre, document type

**Manifest**:
The data that declares a format or a workspace to the shell — what it is called, what it
runs on or where it sits in the workspace bar, and what it defaults to. A manifest is data, never a branch in code.
_Avoid_: config, schema, descriptor, definition

**Element**:
A unit of the manuscript that a surface recognises — scene heading, action, character,
dialogue. The element vocabulary belongs to the surface, never to the format.
_Avoid_: node, block, token, line

**Scene**:
Screenplay-surface vocabulary: the range from one scene heading to the next. A scene is a
range of elements, not a single element — so anchoring to one means anchoring to a span.
A continuous dramatic beat that crosses locations is several scenes, because each new
location needs its own heading. Prose has no scenes: a novel's structure is parts and
chapters.
_Avoid_: slug, slugline (those name the heading, not the range), beat

**Chapter**:
Prose-surface vocabulary: the range from one chapter heading to the next. Chapters, grouped
into optional parts, are the whole of a prose manuscript's structure.
_Avoid_: section, scene

**Scene break**:
A typographic mark inside a prose chapter signalling a jump in time or place. It is a real
element of the manuscript, so it survives print and export, but it is not a boundary of
anything: prose has no scenes.
_Avoid_: scene divider, section break

**Page**:
A unit of paginated output, computed from the manuscript by our own pagination engine.
Always a fact, never authored. For screenplay it is semantic — roughly one minute of screen
time — so a page count is a claim about the work, not a display detail.
_Avoid_: sheet, leaf, screen

**Target**:
A page number the writer authors on a plan card, stating where they intend something to
land. A target is an intention; a page is a fact. Comparing the two is the point of the Plan
workspace, which is why they never share a word.
_Avoid_: planned page, estimated page, goal

**Shell**:
The application frame that hosts the workspaces and the workspace bar without knowing what
any workspace is. The surface runs inside the Editor workspace.
_Avoid_: app, chrome, frame, layout

**Workspace**:
A full screen the writer switches to, one at a time. The Editor, where the in-progress
draft is written, is a workspace like any other. Notes, Plan, Log, Outline and Characters
are candidates rather than a fixed set: the set is open, and new workspaces are added as
they prove useful. Each declares itself to the shell through a manifest.
_Avoid_: panel, pane, tab, tool, sidebar, view

**Workspace bar**:
The floating bar at the top of the screen listing the workspaces a project shows, in order.
A format sets the default selection; the writer can add or remove any workspace the app
offers. It is persistent: workspaces stay in it as standing options rather than being opened and closed
like tabs. The writer reaches a workspace from the bar, by its keybinding, or by stepping
left and right through the bar's order.
_Avoid_: tab bar, toolbar, dock, menu

### Integrity

**Anchor**:
A reference from sidecar data to a place in the manuscript. An anchor must exist on both
sides, or be derivable from the manuscript's content — an identifier held only by the
sidecar is not an anchor. Anchors are scoped to a draft: the same anchor in two drafts
refers to two different places.
_Avoid_: link, reference, pointer, id

**Round-trip**:
Parsing a manuscript into elements and serialising it back, with the result identical to
what was read. The acceptance test for any document model.
_Avoid_: parse cycle, reparse, import/export
