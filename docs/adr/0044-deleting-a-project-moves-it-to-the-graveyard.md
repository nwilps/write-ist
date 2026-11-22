# Deleting a project moves it to the Graveyard

**Deleting a project never erases it. Its bundle is moved, whole and unchanged, into
the `Graveyard` in the default location — `~/Documents/write-ist/Graveyard/` — and leaves
the projects list. To bring it back, move its folder back into `~/Documents/write-ist/`.** Renaming a
project renames its folder and the name in its `project.md` together. Both are reached by
right-clicking a project row on the Open Project screen, and both move folders only through one
command that never replaces anything.

**Status: built, 2026-11-06 (Noah's request, on PR #133). The folder was `Deleted Projects` until
2026-11-18 (PR #145), when it became the Graveyard. Amended 2026-11-19 (PR #158): Settings ▸
Graveyard recovers a project, and **Exile** — the permanent delete of one project already in the
Graveyard — is built. See *Exile* below.**

**Update, 2026-11-21 (PR #162, Noah): the row menu's first item is Edit Project Details**, the same
dialog File ▸ Edit Project Details… opens in the Editor, for the row's project. A rename is its name
field, through the same `renameProject`; the rename-only dialog is gone.

## The forcing reason

Write-ist had no way to remove or rename a project, and nothing in the record planned one. No
trash, archive or deleted-folder mechanism existed in code, in an ADR, in the Slice 2 spec or in
`SETUP-CHECKLIST.md`; the nearest words are ADR-0017's and the glossary's *"a project that is
deleted"*, which say only that the ledger outlives one. So this is new, and it starts from the rule
the whole record leans on — ADR-0003 and ADR-0016's *a writer never loses a word* — rather than from
any trash convention. A delete that erases is one bad click from losing a screenplay; a delete that
moves is a folder the writer can see and move back.

## What it decides

- **The folder is `Graveyard`, inside the default location** (`GRAVEYARD_FOLDER`,
  `src/project/bundle.ts`). Inside, so it is on the same disk as the projects and a move is one
  rename; visible, not dot-hidden, so a writer browsing `Documents/write-ist` finds it, and because
  Write-ist does not make hidden folders (`projects.ts`). It has no `project.md`, so the projects
  list passes over it, and the bundles in it are not listed because the list reads only the top
  level. **The name is reserved**: `folderNameFor` never gives it to a new or imported project, and
  rename refuses it. A project already called that, from before, makes delete refuse rather than
  move bundles inside it; that project can still be renamed out of the way.
- **A `Deleted Projects` folder is brought in, once a launch** (`moveDeletedProjectsToGraveyard`,
  `src/project/delete.ts`). With no Graveyard it is renamed. With one, each folder in it moves across,
  numbered on a clash, and the emptied folder is removed by `removeEmptyFolder`, which cannot remove
  anything that is not empty. Loose files, which `moveFolder` cannot carry, stay in the old folder,
  and it moves into the Graveyard whole. A `project.md` at the top of either folder makes it a
  project, and nothing is moved. A move that fails is said on Open Project and tried again next launch.
- **Delete is a move, and nothing else** (`src/project/delete.ts`). The bundle keeps its folder name
  there; a name already there — the same title deleted twice — makes it `Title 2`, as two imports
  would. Nothing already in the Graveyard is replaced, merged into or touched. Nothing is ever
  emptied: there is no "empty the Graveyard". Delete itself never erases a file; the only code path
  that does is **Exile**, a later and separate step inside the Graveyard (below).
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
- **Delete asks first, and says what it does.** The dialog names the project and says it is not
  permanently deleted but moved to the Graveyard. It is the New Project dialog's look (ADR-0042):
  Cancel [Esc], Move to Graveyard [Enter]. Rename is the same dialog
  with one field, the name, starting from the current one.
- **The menu is the shared context menu (ADR-0034), only on a project row.** Right-click on a row —
  or the Menu key or Shift+F10 on the lit row — opens it with exactly **Rename Project** and
  **Delete Project**, each bound to that row's project. The right-click lights and focuses the row
  first, so the one highlight is on the menu's project, and while the menu is open the pointer
  crossing other rows does not move it. Right-click on blank space opens nothing, and the webview's
  own menu is suppressed across the screen.

## Recovering a project

**Settings ▸ Graveyard ▸ Recover** moves the bundle back into `~/Documents/write-ist/` with the
same `moveFolder` (`src/project/recover.ts`), after checking its project id on disk as delete does;
if a project of that name has been made since, it comes back as `Title 2`. Moving the folder back
with the file manager (or `mv`) still works too. Either way it is listed again with its id,
manuscript and everything beside it as they were.

## Exile

**Exile is the one intentional erase in Write-ist, and it happens only inside the Graveyard**
(Noah, 2026-11-19: *"Exile should REALLY delete projects, the graveyard is meant as that layer of
protection"*). Deleting a project is unchanged: it only ever moves the bundle into the Graveyard.
Exile is the later, explicit, confirmed erase of one bundle that is already there.

- **Reached only from Settings ▸ Graveyard**, one project at a time, and **only after a confirm**:
  Delete Project's dialog in the alarm colour (`--colour-alarm`: its edge, a warning icon and the
  Exile button), Cancel [Esc] focused first and Exile [Enter]. No type-to-confirm; Escape and Cancel
  erase nothing. There is still no "empty the Graveyard".
- **The project erased is the one on disk now**, as for delete and rename: `exileProject`
  (`src/project/exile.ts`) re-reads `project.md` and checks the project id against the row the
  writer chose, and the command checks it again a moment before the erase.
- **The command is narrower than a recursive delete** (`exile_project` in `src-tauri/src/lib.rs`,
  `exile_within` in `src-tauri/src/folders.rs`). It erases only a real folder whose parent is
  exactly `~/Documents/write-ist/Graveyard/` — itself a real folder, not a link — and only when that
  folder's own `project.md` is a real file holding the chosen project id. It refuses the projects
  folder, the Graveyard itself, anything outside it or deeper in it, a hidden folder, a link, a
  file, a relative path or one with `..`, a missing marker and a different id, and touches nothing
  when it refuses. The erase is `remove_dir_all` on that one folder, which removes a link inside the
  project without following it.
- **The writer's history outlives the project.** The ledger (ADR-0017) is `ledger.txt` in
  `appLocalDataDir()` (`LEDGER_FILE`, `src/project/ledger.ts`), outside every bundle, so an exiled
  project's days are untouched; nothing is copied out of the bundle or stripped from the ledger.
  History does not travel with a bundle; it belongs to the writer.

## Considered options

- **The system trash** (freedesktop Trash, macOS Trash, the Windows Recycle Bin). Rejected: three
  platforms' conventions, one more crate, and a trash the system may empty on its own schedule. The
  point is that nothing is lost, and a folder Write-ist never empties says that more plainly.
- **A hidden `.deleted` folder.** Rejected: a writer looking for a deleted script in a file manager
  would not see it, and recovering is meant to need nothing but a file manager.
- **A folder outside the default location** (`appLocalDataDir()`, say). Rejected: ADR-0016 keeps
  that layer free of work, and it may be on another disk, which turns a rename into a copy.
- **Copy, verify, then delete the source, when a rename crosses disks.** Rejected for now: the
  Graveyard is inside the projects folder, so this only happens if the writer mounted something
  there. Refusing with an error is enough, and it has no path that deletes.
- **A restore screen.** Not built at first: moving the folder back was the recovery. Settings ▸
  Graveyard now lists the Graveyard with Recover and Exile on each project (PR #158), and moving the
  folder back by hand still works.
- **Exile as type-to-confirm, or an "empty the Graveyard".** Rejected (Noah, 2026-11-19): the
  Graveyard is already the layer of protection, so one regular confirm in the alarm colour is
  enough, and erasing is one project at a time.

## Consequences

- The Graveyard grows until the writer exiles what is in it, one project at a time. That is
  deliberate.
- The ledger keeps a deleted project's days, as it always said it would (ADR-0017).
- Relocated projects (the registry, ADR-0015) are not handled: delete and rename refuse a project
  not directly inside the default location.
