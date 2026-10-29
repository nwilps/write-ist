# Autosave saves after a pause, and never overwrites what it did not write

**Autosave writes a couple of seconds after the writer stops typing, whenever they switch to
another application, and when they close the project.** Importing a script saves it at once.
And autosave never writes over a file that something else has changed since Write-ist last
touched it: if the writer has typed too, it keeps both.

Decided 2026-09-19, closing [#11](https://github.com/nwilps/write-ist/issues/11). Autosave is the
routine that destroyed v1's highlights — *"a failed read initialising empty state, which the next
autosave writes over the good file"* (ADR-0008 rule 3) — so it is specified before it is written.

## When it fires

**A couple of seconds after the writer stops typing, on switching to another application, and on
closing the project.** A crash then costs at most the last few seconds of typing.

**Autosave and an explicit save are one save.** There is a single routine, and both call it, so
everything the round-trip gate proves about saving is proved about autosave too. That answers the
last question #11 asked.

## Importing saves at once

**Importing a script Write-ist has never seen copies it into a new project and writes it
immediately**, applying [ADR-0020](0020-what-write-ist-may-change-in-a-writers-file.md)'s
normalisations, at the moment the import report is shown. The report is the writer being told:
*this is imported; here is what was adjusted so it can be edited here; dismiss when satisfied.*

**The forcing reason is the writer who imports and leaves.** Someone may bring a script into
Write-ist to have it there, without time to edit it yet. If they come back and find it was never
saved, the import was broken as far as they are concerned — whatever the reasoning behind the
wait.

**The original file is never touched.** A project is a bundle
([ADR-0025](0025-what-a-bundle-holds-on-disk.md)) and a loose `.fountain` is not one, so importing
means copying the script into a new bundle. The save writes that copy. The file the writer
imported from stays exactly where it was, untouched, as the version before Write-ist adjusted
anything.

## When something else changed the file

A bundle is plain text in a folder (ADR-0003), so something other than Write-ist can change it: a
writer in another editor, or a sync service bringing in work from another machine.

**Before each save, and whenever the writer switches back to Write-ist, it checks whether the file
on disk is still the one it last read or wrote.**

- **Changed, and the writer has not typed since the last save:** it loads the new version. Edit in
  another tool, switch back, and the edits are there.
- **Changed, and the writer has typed too:** it keeps both. **The version being typed stays on
  screen and stays the project's manuscript.** The other is saved beside it as a dated copy, and
  the writer is told. Nothing from either side is lost, and nothing is swapped out mid-scene.

**Continuity across machines comes from the first rule, not from preferring this machine.** Finish
a scene on a laptop, open the desktop, and the scene is there, because the desktop loads the latest
version wherever it was written. A rule of "open the version last edited on this machine" was
considered and would have done the opposite: the desktop would open its own older version and
ignore the laptop's work.

**The same rule holds for each sidecar file** — notes, the plan, the log — file by file.

**A reloaded file is treated as an import**: it was written by something else, so the next save
may apply ADR-0020's normalisations, and the report names them.

**This covers every project, not only relocated ones.** The default location is inside
`Documents`, which many writers already have synced without ever thinking about it — iCloud's
*Desktop & Documents* on a Mac, OneDrive's folder backup on Windows. A writer with two computers can
meet a sync clash without ever choosing to move a project, so the protection cannot be tied to
moving one ([ADR-0016](0016-the-layer-above-a-bundle-holds-no-work.md)).

## What autosave never does

- **It never writes over a file it could not read.** ADR-0008 rule 3, and the exact failure that
  cost v1 its highlights. This is not a refusal to open: a file that cannot be read has nothing to
  open, so there is nothing to lock the writer out of. It is a refusal to overwrite.
- **It is never stopped by a comment missing its closing delimiter**
  ([ADR-0018](0018-comments-are-the-text.md)). The file loaded completely, every character kept,
  so there is nothing unsafe in saving it.
- **It never creates a draft** and never appears in history (`GLOSSARY.md`).

Saves are atomic — temp, flush, rename — under ADR-0008 rule 5, already decided. ADR-0008 rule 6's
fear, notes pointing at scenes that no longer exist after a crash, cannot arise in v2: the only
thing that anchors is a comment, and comments live in the manuscript
([ADR-0022](0022-scene-metadata-is-derived-or-inline.md)), so no sidecar file points into it. Each
file is saved atomically on its own, as ADR-0025 already requires.

## Considered options

- **Write nothing until the writer types.** Recommended first, on the grounds that looking at a
  file should not change it. Rejected, and on better grounds: an import the writer comes back to
  and finds unsaved feels broken. Since import copies into a new bundle, saving at once changes
  nothing of the writer's anyway.
- **A timer alone**, every thirty seconds or so. Rejected: it loses up to the whole interval, and
  saves while the writer is mid-word.
- **Ask the writer to choose a version when a clash is found.** Rejected: it asks them to pick
  blind, without seeing how large the other change is. Keeping both loses nothing and lets them
  decide later with both files in hand.
- **Merging the two versions.** Rejected as out of scope rather than as wrong. v2 is one writer,
  with no accounts and no sync (ADR-0003). Two people editing one script through a cloud service is
  a different product, and a merge tool for screenplays is a large feature for it.
- **Never letting the writer choose where a project lives**, so that nothing outside Write-ist
  touches it. Rejected: it reverses ADR-0016, which kept relocation deliberately, and it would not
  work — other tools can open the default folder just as easily, and the default folder may already
  be synced. Relocation stays, behind a deliberate barrier; see ADR-0016.
