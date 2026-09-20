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
_Avoid_: snapshot, version, pass, copy, Draft as the name of a workspace (that is the Editor)

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
Writing the in-progress draft to disk without the writer asking — a couple of seconds after they
stop typing, when they switch away, and when they close the project. Autosave preserves the
present; it never creates a draft and never appears in history. It never writes over a file that
something else has changed since Write-ist last touched it: if the writer has typed too, it keeps
both (ADR-0028).
_Avoid_: save, checkpoint, snapshot, backup

**Import**:
Bringing a script Write-ist has never seen into a new project. The script is copied into a new
bundle and saved at once, with the enumerated normalisations of ADR-0020 applied and named in the
import report; the file it came from is never touched. Opening a project Write-ist already holds is
not an import.
_Avoid_: open (that is a project Write-ist already holds), convert, load

**Chain**:
The sequence of locked drafts leading to the draft in progress — 1, 2 and 2a are on it while
2a is being written, leaving 3 and 4 set aside. Membership is computed from where work is
happening now, never stored on a draft, so resuming from a different locked draft redraws
the chain without renaming or rewriting anything.
_Avoid_: line (that is a line of text, and pagination needs the word), branch, trunk,
mainline, path, history

**Set aside**:
A locked draft that is not on the current chain. Being set aside is a relationship to present
work, not a verdict on the draft and not a permanent state — resuming from a set-aside draft
makes it current and sets aside whatever chain was running before.
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
Everything in a bundle that is not the work itself: comments, notes, plan cards, log entries,
project metadata. Most of it sits in its own files; a comment is the exception, stored inline
in the manuscript file so that it cannot come adrift from the text it is about. The writer's own words in it come back as readable documents if the app is
gone; the app's bookkeeping around them is plain structured text. Only the part of it that
*anchors* into a manuscript freezes when a draft locks; the rest is project-level and there
is one of it per project.
_Avoid_: metadata, database, index

**Comment**:
Something the writer says about a place in the manuscript, anchored to the span it was left
on and shown beside the text as a floating card. Its remark is stored inside the opening
delimiter, so the remark and the span it is about are one construct and deleting the span
takes the remark with it. Its text is stored inline in the manuscript
file, delimited in band and matched by id — but it is not part of the work: it is stripped
before pagination, before word and page counts, and before export, and the writer never sees
its syntax. A comment anchors, so it belongs to one draft and freezes with it.
_Avoid_: note (that anchors to nothing), annotation, highlight, work marker

**Bundle**:
The on-disk form of a project — a folder holding the manuscript and its sidecar, rather
than a single file. Everything in a bundle is text; it never holds images or other binary
files.
_Avoid_: package, archive, container

**Project id**:
The identifier a bundle carries for itself, minted when the project is created and never
changed. It says *which* project a bundle is; it never says where the bundle lives, and a
bundle never records its own location. Duplicating a project in the app mints a fresh one, so
the copy is a new project from that moment.
_Avoid_: project identity, uuid, key, path

**Registry**:
The record Write-ist keeps outside every bundle, holding pointers to the bundles the writer
has moved out of the default location. It never holds any of the writer's work, so losing it
costs some re-pointing and never a word. The writer never sees or manages it; they
occasionally re-point a project they moved. The ledger and the app's preferences sit outside
every bundle too, each in its own file; neither is part of the registry.
_Avoid_: database, store, cache, index (that is the project-level index, inside a bundle)

**Ledger**:
The append-only record of what the writer produced each day — words and pages per project, and
how long each session lasted. It sits outside every bundle and spans all of them, because it
is a record of the writer's days rather than a property of any one work, and it outlives a
project that is deleted. It holds no work: losing it costs a chart, never a word.
_Avoid_: log (that is the Log workspace), history, metrics (that is the view of it), analytics,
event log

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
dialogue. The element vocabulary belongs to the surface, never to the format. Elements form
a flat sequence and never contain one another; everything that looks like nesting — a scene,
a chapter, a part — is a *range* computed from the sequence.

**This is narrower than the screenwriting sense of the word, and the two are easy to confuse.**
In Final Draft and in ordinary talk, a speech of four lines is *one* Dialogue element. Here it is
**four** elements, because no element spans more than one line (ADR-0019) — they are written back
without blank lines between them because the spacing table says so, not because they are one
thing. Say **speech** for the screenwriting sense; it is the run of dialogue under one character
cue, and it is a range over elements like a scene is.
_Avoid_: node, block, token, line; element for a whole speech (say speech)

**Mark**:
Inline formatting carried on a span of text — italic, bold, underline, small caps. Marks are
a *set*, not a tree: two marks over the same characters have no order, so the order they are
written in is chosen by the serialiser rather than remembered from the file. A mark is **read**
across elements — an opening delimiter finds its partner on a later line, and every element
between them carries the mark — but it is **stored and written inside one element**, which is why
a run of italic dialogue is written back with a delimiter pair on each of its lines. Anything
carrying an id is exempt, which is why a comment may nest and cross and bold may not.
_Avoid_: style, formatting, span, decoration

**Synopsis**:
A line the writer authors summarising the scene that follows, stored in the manuscript on
Fountain's standard `=`. Authored, unlike everything else the scene list shows, which is
derived from the text.
_Avoid_: summary, logline, description, note

**Tag**:
One open `name: value` line the writer may put on a scene, carrying whatever single axis
that writer has adopted — storyline, POV, status. Deliberately not a schema: writers adopt
one axis wholesale, and different writers adopt different ones.
_Avoid_: field, property, attribute, label, category

**Boneyard**:
Text the writer has taken out of the screenplay without deleting it, wrapped in Fountain's
`/* */`. It is in the file and absent from everything computed off the manuscript — the page
count, the word count, the export. Shown collapsed, expandable in place.
_Avoid_: comment (that is a remark *about* text), cut, omitted, deleted

**Passthrough**:
A block of Pandoc Markdown outside the subset Write-ist specifies, kept as an exact copy of
its own text and written back unchanged. It exists on the prose surface only: Fountain has
no unrecognisable text, because anything matching nothing else is action.
_Avoid_: unknown, raw, unparsed, fallback

**Extension**:
A qualifier written on a character cue, in parentheses, saying something about how the line is
delivered or that the speaker has not changed — `(V.O.)`, `(O.S.)`, `(CONT'D)`. It is part of
the **element**, not a separate one, and specifically not a *parenthetical*: `EDWARD (V.O.)
(CONT'D)` is one cue carrying two extensions. The distinction is the easiest mis-parse in
Fountain, because on the page they look identical.

Extensions divide, and the divide decides who may write them. `(V.O.)` and `(O.S.)` are
**authored** — whether a line is voice-over or off-screen is a judgement only the writer can
make, and the app never adds or removes one. `(CONT'D)` is **derived**: it follows entirely
from the element sequence, so the app maintains it and a writer who does not want it turns the
behaviour off rather than deleting instances.
_Avoid_: parenthetical (that is its own element, on its own line), modifier, qualifier, tag

**Scene**:
Screenplay-surface vocabulary: the range from one scene heading to the next. A scene is a
range of elements, not a single element — so anchoring to one means anchoring to a span.
A continuous dramatic beat that crosses locations is several scenes, because each new
location needs its own heading. Prose has no scenes: a novel's structure is parts and
chapters.
_Avoid_: slug, slugline (those name the heading, not the range), beat unqualified

**Speech**:
Screenplay-surface vocabulary: a character cue and everything under it until the next blank
line — the dialogue and parentheticals one character says in one go. Like a scene, it is a
*range* over elements rather than an element, which is the distinction the **Element** entry
warns about: a four-line speech is four elements. It is the one range Fountain marks in the
file rather than leaving to be computed, because a blank line ends it, and it is therefore
where a mark's lookahead stops ([ADR-0027](docs/adr/0027-a-mark-runs-from-its-opening-delimiter-to-the-next.md)).
_Avoid_: dialogue (that is one element inside a speech), block, paragraph, line

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
A unit of paginated output, computed from the manuscript by our own pagination engine, for
the screen and the export alike. Always a fact, never authored, and never read back off what
the screen happens to have drawn. For screenplay it is semantic — roughly one minute of
screen time — so a page count is a claim about the work, not a display detail.
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

**Editor**:
The workspace the in-progress draft is written in, running the project's surface. A
workspace like any other, not a frame around the others.
_Avoid_: Draft, draft view, writing mode

**Workspace bar**:
The floating bar at the top of the screen listing the workspaces a project shows, in order.
A format sets the default selection; the writer can add or remove any workspace the app
offers. It is persistent: workspaces stay in it as standing options rather than being opened and closed
like tabs. The writer reaches a workspace from the bar, by its keybinding, or by stepping
left and right through the bar's order.
_Avoid_: tab bar, toolbar, dock, menu

### The planning workspaces

**Plan card**:
Something the writer intends to happen, placed on the Plan grid at a target and given a
target length. A card exists only in Plan: it names no part of the manuscript, and nothing
in the manuscript creates one.
_Avoid_: scene card, beat card, index card, tile

**Lane**:
One of the rows a plan card sits in. Lanes keep cards from overlapping; which lane a card
is in carries no meaning.
_Avoid_: row, track, swimlane

**Structure sheet**:
A named set of structure beats — Save the Cat, the Hero's Journey — held as fractions of the
whole, so a sheet keeps its shape at any length.
_Avoid_: template, framework, paradigm

**Structure beat**:
One position on a structure sheet: a moment at a single fraction, or a span between two.
Always said in full; a bare "beat" names nothing here.
_Avoid_: beat unqualified, plot point

**Band**:
A group of structure beats belonging to one frame of thinking. Sheets stack band by band,
so one sheet's beats are never fragmented by another's.
_Avoid_: row, group, layer

**Push**:
A named stretch of days in the Log that tasks are worked against, reporting the pace needed
to clear them. A deadline is a push with nothing in it yet.
_Avoid_: sprint, milestone, goal, deadline (that is a push, not a second thing)

### Integrity

**Anchor**:
A reference from sidecar data to a place in the manuscript. An anchor must exist on both
sides, or be derivable from the manuscript's content — an identifier held only by the
sidecar is not an anchor. Anchors are scoped to a draft: the same anchor in two drafts
refers to two different places. In v2 exactly one thing anchors: a comment. Everything else
is either derived from the manuscript or stored inside it.
_Avoid_: link, reference, pointer, id

**Element identity**:
The handle the editor holds on an element while the project is open, so that it can redraw
incrementally and hold a comment card still while text above it changes. It is created on
parse, it dies when the project closes, and it is never written to a file. It is not an
*anchor* and the two must not be confused.
_Avoid_: id, element id, node id, key

**Round-trip**:
Parsing a manuscript into elements and serialising it back, with the result identical to
what was read — compared as *bytes on disk*, not as characters in memory. The acceptance test
for any document model. It holds in two strengths: on a file Write-ist has never seen, the
result equals the source after an enumerated list of normalisations and nothing else; on a
file Write-ist itself wrote, the result is identical, always.
_Avoid_: parse cycle, reparse, import/export

### The prior work

Three names for three things that already exist, all of them finished and none of them edited any
more. They are read as references, never as code to carry forward.

**v1**:
The shipped application, built in Tauri and React, that produced a complete feature screenplay. It
is the bar v2 has to clear and the reason v2 exists: its parse and serialise engine was not good
enough, its editor was slow and locked to single lines, and it had no undo. **Reference it for the
shape and flow of the screens around the editor — its home screen and its open-project screen — and
never for how it edits.**
_Avoid_: the old app, legacy, the first version

**Spike**:
The editor experiment in `nwilps/write-ist-ng`, under `spike/`. Built to answer one technical
question — model-first or buffer-first — and it answered it, at 3,457 blocks, with the corpus
round-tripping ([ADR-0019](docs/adr/0019-the-document-model-is-flat-typed-elements.md)). Its output
is knowledge, not code. **It is the reference for the page itself** — the manuscript surface the
writer types on, centred on its dark ground — and for the palette
([ADR-0030](docs/adr/0030-look-is-data-two-typefaces-and-no-styling-value-in-code.md)).
_Avoid_: prototype (that is the next entry), experiment, proof of concept

**Prototype**:
The mockups in the same repository, `plan.html` — built to see what the application should feel
like rather than to answer a technical question, and reviewed in
`docs/reviews/2026-09-11-prototype-review.md`. It holds Plan, the Log and a Draft mockup, and with
them the application's furniture: a workspace bar of numbered tabs, panels, an inspector.
**It is the reference for everything outside the page** — v1 elevated, which is the direction
chosen.
_Avoid_: spike (that is the entry above), mockup when the Plan and Log ones are meant

**The line between them is the edge of the page.** The spike drew the page; the prototype drew the
application around it. An Editor built from both takes its manuscript surface from one and its
furniture from the other, which is why a reference names which.

Both live in one repository, which is why a reference names the path rather than the nickname. A
session told to "follow the prototype" for the Editor could reasonably open the Plan mockup and copy
the wrong thing.
