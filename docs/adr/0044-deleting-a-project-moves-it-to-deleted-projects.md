# Deleting a project moves it to Deleted Projects

**Deleting a project never erases it. Its bundle is moved, whole and unchanged, into
`Deleted Projects` in the default location — `~/Documents/write-ist/Deleted Projects/` — and leaves
the projects list. To bring it back, move its folder back into `~/Documents/write-ist/`.** Renaming a
project renames its folder and the name in its `project.md` together. Both are reached by
right-clicking a project row on the Open Project screen, and both move folders only through one
command that never replaces anything.

**Status: built, 2026-11-06 (Noah's request, on PR #133).**

## The forcing reason

Write-ist had no way to remove or rename a project, and nothing in the record planned one. No
trash, archive or deleted-folder mechanism existed in code, in an ADR, in the Slice 2 spec or in
`SETUP-CHECKLIST.md`; the nearest words are ADR-0017's and the glossary's *"a project that is
deleted"*, which say only that the ledger outlives one. So this is new, and it starts from the rule
the whole record leans on — ADR-0003 and ADR-0016's *a writer never loses a word* — rather than from
any trash convention. A delete that erases is one bad click from losing a screenplay; a delete that
moves is a folder the writer can see and move back.

## What it decides

- **The folder is `Deleted Projects`, inside the default location** (`DELETED_FOLDER`,
  `src/project/bundle.ts`). Inside, so it is on the same disk as the projects and a move is one
  rename; visible, not dot-hidden, so a writer browsing `Documents/write-ist` finds it, and because
  Write-ist does not make hidden folders (`projects.ts`). It has no `project.md`, so the projects
  list passes over it, and the bundles in it are not listed because the list reads only the top
  level. **The name is reserved**: `folderNameFor` never gives it to a new or imported project, and
  rename refuses it. A project already called that, from before, makes delete refuse rather than
  move bundles inside it.
- **Delete is a move, and nothing else** (`src/project/delete.ts`). The bundle keeps its folder name
  there; a name already there — the same title deleted twice — makes it `Title 2`, as two imports
  would. Nothing already in `Deleted Projects` is replaced, merged into or touched. Nothing is ever
  emptied: there is no "empty the deleted folder", and no code path deletes a project's files.
- **Every move is `moveFolder`, one atomic rename that never replaces anything** — the port's
  promise (`src/project/filesystem.ts`), kept in the application by the `move_folder` command
  (`src-tauri/src/folders.rs`). The plugin's own `rename` was not used, because a rename of a folder
  replaces an empty folder at the destination without a word. The command claims the destination
  with `create_dir`, which fails if anything at all is there, and renames onto that empty claim; on
  any failure it removes only the claim, with `remove_dir`, which cannot remove anything that is not
  empty. It **refuses a move across disks** (`EXDEV`) rather than copy and delete, refuses links and
  files, `..` and relative paths, a move into itself, and any path outside
  `~/Documents/write-ist/`. A failed move leaves the project where it was.
- **The project acted on is the one on disk now.** Before moving, delete and rename re-read the
  folder's `project.md` and check its project id against the row the writer chose (ADR-0015). A
  folder replaced or moved since the list was read is refused, not acted on.
- **Rename changes the folder and `project.md`, never the manuscript.** A project's name is its
  folder's name (`create.ts`), so both change; the title page is the writer's words (ADR-0020) and is
  left alone. The id does not change. The new name is made safe for the disk as a new title is.
  **A name already taken is refused, never numbered** — the writer asked for that name, and quietly
  giving them another is not what they asked. A name starting with a dot is refused, because the
  folder would be hidden and the list would never show it. If the folder moves and the marker then
  cannot be written, the folder is moved back, so a failed rename changes nothing.
- **Delete asks first, and says what it does.** The dialog names the project, says it is *not
  deleted for good*, gives the full path of the deleted folder, and says how to bring it back. It is
  the New Project dialog's look (ADR-0042): Cancel [Esc], Delete [Enter]. Rename is the same dialog
  with one field, the name, starting from the current one.
- **The menu is the shared context menu (ADR-0034), only on a project row.** Right-click on a row —
  or the Menu key or Shift+F10 on the lit row — opens it with exactly **Rename Project** and
  **Delete Project**, each bound to that row's project. The right-click lights and focuses the row
  first, so the one highlight is on the menu's project, and while the menu is open the pointer
  crossing other rows does not move it. Right-click on blank space opens nothing, and the webview's
  own menu is suppressed across the screen.

## Recovering a project

Move its folder from `~/Documents/write-ist/Deleted Projects/` back into `~/Documents/write-ist/`
with the file manager (or `mv`). It is listed again next time Open Project is shown, with its id,
manuscript and everything beside it as they were. If a project of that name has been made since,
give the folder another name first; the name the list shows is the one in its `project.md`.

## Considered options

- **The system trash** (freedesktop Trash, macOS Trash, the Windows Recycle Bin). Rejected: three
  platforms' conventions, one more crate, and a trash the system may empty on its own schedule. The
  point is that nothing is lost, and a folder Write-ist never empties says that more plainly.
- **A hidden `.deleted` folder.** Rejected: a writer looking for a deleted script in a file manager
  would not see it, and recovering is meant to need nothing but a file manager.
- **A folder outside the default location** (`appLocalDataDir()`, say). Rejected: ADR-0016 keeps
  that layer free of work, and it may be on another disk, which turns a rename into a copy.
- **Copy, verify, then delete the source, when a rename crosses disks.** Rejected for now: the
  deleted folder is inside the projects folder, so this only happens if the writer mounted something
  there. Refusing with an error is enough, and it has no path that deletes.
- **A restore screen.** Not built: moving the folder back is the recovery, and this ADR documents
  it. It can be added later without changing anything here.

## Consequences

- `Deleted Projects` grows until the writer empties it themselves. That is deliberate.
- The ledger keeps a deleted project's days, as it always said it would (ADR-0017).
- Relocated projects (the registry, ADR-0015) are not handled: delete and rename refuse a project
  not directly inside the default location.
