# Outside changes are handled quietly: reload silently, back up silently, report only failures

**When the manuscript changes outside Write-ist, Write-ist says nothing.** If the writer has not
typed, it loads the version on disk. If the writer has typed too, it writes the dated
`manuscript changed elsewhere …fountain` copy beside the manuscript and then saves the writer's
version. Neither shows a report, a dialog or a toast.

Decided 2026-10-28. **Supersedes the "the writer is told" part of
[ADR-0028](0028-autosave-saves-after-a-pause-and-never-overwrites-what-it-did-not-write.md)** —
the import report shown on a reload, and the message naming the copy. The rest of 0028 stands.

## The forcing reason

**Write-ist is a solo writer's application.** The writer may use more than one machine or editor,
but there is one writer, and a pop-up about a change they made themselves, elsewhere, tells them
nothing they did not do. It interrupts the page.

Collaboration is out of scope: no live editing, no in-app merging of other people's drafts, no sync
features of Write-ist's own. It plays nicely with sync the writer runs themselves (Git, iCloud,
OneDrive). Two people editing one manuscript through such a sync is **unsupported, at their own
risk**.

## What stays exactly as 0028 made it

- A manuscript that cannot be read is never written over.
- If the dated copy cannot be written, the manuscript is not written.
- The save timeouts.
- **Failures are errors, not information.** Could not save, could not check the disk, could not
  write the copy all still reach the writer through the existing `trouble` path. Only the
  informational outside-change messages go.

## Consequences

- The silent copy is the safety net, and the only trace. A writer who wonders finds it in the
  project folder.
- Closing the project after a clash no longer stays open to announce the copy; it closes.
- `reload` and `keptBoth` remain callbacks of the editing session, so state can follow and tests
  can assert them; the Editor shows nothing for either.
