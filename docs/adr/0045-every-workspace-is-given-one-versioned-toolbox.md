# Every workspace is given one versioned toolbox

**A workspace reaches the application through one object, the toolbox, handed to it when it is
mounted. Every system the application already has — files, the writer's place, spellcheck, the
pills, hotkeys, settings, menus and dialogs — is a call on it, and a workspace imports nothing else
of the application's. The toolbox is a public contract with a version: a call may be added at any
time; a call is removed or renamed, or its promise changed, only by a dated amendment here.**

**Status: built, 2026-11-25 (Noah's request, after PR #164). Version 1.** This is the seed of a
framework for workspaces made by someone other than the people who made Write-ist — a doorway, not
a plugin system. See *Not yet* below.

## The forcing reason

Noah wants future workspaces — eventually other people's — to use what the application already
does, wholesale: its spellcheck, its file handling, its pills, its hotkeys, where its settings go,
its menus and its dialogs. Getting a workspace in should be as near to a simple tool call as it
can be.

ADR-0005 made the first half of that true: the shell hosts whatever is in the registry and knows
nothing of it. PR #164 then put Notes and Plan through that doorway, and a review of it found that
the doorway only ran one way. The shell knew nothing of the workspaces, but the workspaces reached
past it into the application:

- the Hotkeys list named Editor, Notes and Plan by hand (`[["Editor", "1"], ["Notes", "2"],
  ["Plan", "3"]]` in the Editor's command table), so a fourth workspace meant editing it;
- deleting a note was a filesystem call, a Tauri command and a Rust check all written for notes
  alone (`removeNote`, `remove_note`, `remove_note_within`, which allowed only a `.md` file in a
  folder named `notes`), so the next workspace that deletes anything would need a fourth;
- the registry handed Notes the dictionary (`notesManifest({ spellEngine })`), so the list of
  workspaces was also wiring;
- Notes' delete confirm was a Notes-named function in the application's dialog file
  (`showDeleteNote`), and Notes and Plan imported the menu, the dialog, the key helpers and the
  disk from wherever they lived;
- the tests asserted the registry was exactly Editor, Notes and Plan.

Each is small. Together they are the v1 failure ADR-0005 was written against, in the other
direction: every workspace becoming a little surgery in the application. And none of it was
written down anywhere a newcomer would find it.

## What it decides

- **One object, one version.** `mount(into, toolbox)`. The toolbox (`Toolbox`,
  `app/src/shell/workspace.ts`) carries `version` (`TOOLBOX_VERSION`, 1) and `workspace` (its own
  id and name), and the calls below. The shell builds one per workspace
  (`app/src/shell/toolbox.ts`), scoped to it.

- **The calls, grouped by what they are for.** Each wraps a system that already existed; none is
  new machinery.
  - `files` — the files and folders the manifest declares, and nothing else
    (`src/project/workspace-files.ts`): `read`, `open` (the safe save — temp, flush, rename —
    autosave at ADR-0028's moments, outside changes handled quietly per ADR-0031, and the save
    pill), `list`, `makeFolder`, `create` (only where nothing is), `move` (never over another
    file), `remove` (one file in a declared folder, for good). Paths are inside the project; a path
    not declared is refused before the disk is asked. A file that will not read is never written
    over (ADR-0008).
  - `memory` — `recall`, `remember`, `forget`: the writer's place (caret, scroll, tabs), kept in
    `workspace-places.txt` in app data under the project's id and the workspace's, never in the
    project (ADR-0009, ADR-0012).
  - `spelling` — the Editor's dictionary (ADR-0032): `check`, `misspelled`, `suggest`, `addWord`,
    and `available`. A word added anywhere is added everywhere.
  - `pills` — `setStatus`, `setGoal`, `whenGoalsAsked`, `setSaved`, `setSpellcheck`.
  - `hotkeys` — `add({ id, label, chord, act })`: listed in View ▸ Hotkeys and Settings ▸ Hotkeys
    under the workspace's name, answered while it is on screen and no dialog is open. A key someone
    already has — a tab's Alt key, Escape, the Editor's commands, the menus' access keys, another
    workspace's — or a bare letter, or Ctrl+Alt with a character, is refused **quietly**: `add`
    answers `undefined`. No toast, no message (`app/src/shell/hotkeys.ts`).
  - `menus` — `open` (Write-ist's own menu, ADR-0034), `claim` and `release` (for a picker of the
    workspace's own, so one menu is open at a time).
  - `dialogs` — `confirm({ label, question, lines, confirm, alarm, act, failed, closed })`: the
    application's confirm in the workspace's own words, the alarm colour and Cancel-first focus of
    Exile when `alarm` is set. Never the system's `confirm()` or `alert()`.
  - `settings` — `read(id)`, `whenChanged`, `open`: the workspace's own settings (below).
  - `details` — `read`, `edit`, `whenAsked`, `whenChanged`: the open project's details.
  - `window` — `whenSwitchedAway`, `whenSwitchedBack`.
  - And, as before: `project`, `report`, `leave`, `ledger`, `chooseCopyLocation`,
    `choosePdfLocation`.

- **The calls the context had before are kept, as version 1** (`EarlierCalls`): `filesystem`,
  `places`, `workspacePlaces`, and the flat `setStatus`, `setSaved`, `whenDetailsAsked` and the
  rest. The Editor still uses them — its manuscript needs the whole disk — and moving it is not this
  change's. **A new workspace uses the groups, never these**; `test/app/toolbox.test.ts` holds Notes,
  Plan, the template and the test-only workspace to that. Retiring them, once the Editor has moved,
  is an amendment here.

- **A workspace's settings are declared, not drawn.** The manifest's `settings` lists switches
  (`WorkspaceSetting`: `id`, `label`, `place`, `default`; `src/settings/workspace-settings.ts`).
  The application draws them in its own places, in its own manner, under the workspace's name, and
  keeps them in the files that already keep settings — no new store:
  - `place: "app"` — Settings ▸ General; `settings.json`, `workspaceSettings`.
  - `place: "project"` — Edit Project Details, kept in the project's `details.md` as a line
    `Setting <workspace>.<id>: yes` (ADR-0025, amended); and Settings ▸ New Project Defaults, per
    project type, which New Project writes into the new `details.md`.
  A value never set is the default; values are put right quietly; a value for a workspace this
  version does not offer is kept. Switches only, today; another kind is an addition. Neither Notes
  nor Plan has a setting yet, so no screen changed — the hook is there, and the test-only workspace
  uses all three places.

- **The registry is a plain list of manifests.** Nothing is handed to a workspace through it.

- **The Hotkeys lists read the registry.** A workspace tab's row (`Notes [Alt + 2]`) comes from its
  manifest's `name` and `key`, placed where the hand-written rows were; a workspace not in the list
  has no row. Alt+Left and Alt+Right stay in the command table: they belong to no workspace.

- **Deleting is generic, and as narrow as it was** (ADR-0044, amended). `Filesystem.removeWorkspaceFile(path,
  folder)` and the Tauri command `remove_workspace_file` replace `removeNote` and `remove_note`.
  `folders::remove_file_within` takes the folder's name from the workspace's declaration rather
  than the word `notes`, and checks everything the old one did: inside the projects folder, inside
  a real project (a real `project.md`), directly inside a real folder (not a link) of exactly that
  name, only a real file (not a link, not a folder, not hidden), a plain absolute path with no `..`,
  nothing replaced. The toolbox only asks it for a file directly inside a folder the manifest
  declares. What changed is that the Rust no longer insists on `.md`: a workspace's files are its
  own business, and the folder is the boundary.

- **Shared pieces are the toolbox's.** The confirm (`app/src/screens/confirm-dialog.ts`, which
  Delete Project and Exile are now built on too), the menu, and the small helpers a surface is drawn
  with (`element`, `chordHint`, `chordMatches`, `isCapturedKey`, `message`) are imported from the
  toolbox's public module, `app/src/toolbox/index.ts`.

- **Notes and Plan use only the toolbox.** Their behaviour is unchanged. Notes declares the old
  single `notes.md` among its files, beside `notes/`, because bringing it into the folder once is a
  move of its own file; nothing else reads `files` for anything but scoping and leaving a
  workspace's work alone when it is turned off.

## The versioning rule

The toolbox is a public contract, and is treated as one:

1. **Adding is free.** A new call, a new group, a new optional field in what a call takes, a new
   kind of setting: no version change, no amendment needed (say so in the pull request).
2. **Removing or renaming a call, or changing what one promises** (what it answers, when it
   rejects, what it may touch) raises `TOOLBOX_VERSION` and is a **dated amendment to this ADR**
   saying what changed and why. Nothing is removed casually: a workspace someone else wrote will
   be relying on it.
3. **The guide and the template move with it.** `docs/WORKSPACES.md` lists every call with an
   example; `app/src/workspaces/_template/` uses them. A call that is not in the guide is not part
   of the contract.

## Not yet

This is a doorway in code. A workspace is still a folder in this repository, added to a list in
code and built with the application. Still to come, each its own decision:

- **Runtime loading.** Reading workspaces from somewhere other than the source — a folder in app
  data, a package — at launch.
- **A permission sandbox.** Today scoping is by the toolbox's calls; a workspace written in this
  repository could still import past them, and only a test stops it. A workspace from elsewhere
  must not be able to: it would run where it can reach nothing but its toolbox, and declare what it
  needs (`files` is the first such declaration).
- **Install and signing.** How a writer adds one, how they know who made it, and how one is taken
  out cleanly.

None of these changes a call. A workspace written against version 1 should run in each.

## Consequences

- Adding a workspace is a folder (copied from `_template/`) and one line in the registry. The
  shell, the Hotkeys lists, Settings, Edit Project Details and New Project Defaults follow.
- The Editor is the one workspace still on the earlier calls. Moving it is the obvious next step
  and needs nothing new in the toolbox except, perhaps, a scoped way to the manuscript.
- A workspace can no longer reach the manuscript, the marker or another workspace's files through
  `files`, and a test fails if Notes, Plan or the template reach past the toolbox at all.
- `test/app/toolbox.test.ts` is the proof: Notes and Plan unplugged, the application still works;
  a test-only workspace plugged in, every call works end to end.
