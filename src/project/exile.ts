/**
 * Exile: erasing a project in the Graveyard, for good (ADR-0044).
 *
 * **The one intentional erase in Write-ist**, and the last of two steps.
 * Deleting a project only ever moves it into the Graveyard (`delete.ts`); a
 * project leaves the disk only when the writer, in Settings ▸ Graveyard,
 * chooses Exile on that one project and confirms it.
 *
 * So this is narrow. It erases exactly one bundle directly inside
 * `~/Documents/write-ist/Graveyard/`, and only the project the writer chose:
 * its `project.md` is read again here, and once more by the port a moment
 * before the erase, and its project id must still be the row's
 * (`exileFromGraveyard`, `filesystem.ts`). Anything else is refused and left
 * exactly as it was. There is no "empty the Graveyard".
 *
 * **The writer's history is not in the bundle**, so it is not erased with it.
 * The ledger (ADR-0017) is `ledger.txt` in app data (`LEDGER_FILE`,
 * `ledger.ts`), outside every bundle, and keeps every day an exiled project was
 * written on. Nothing here copies, strips or touches it.
 */
import type { Project } from "./bundle.ts";
import type { Filesystem } from "./filesystem.ts";
import { confirmBuried } from "./recover.ts";

/** Thrown for an Exile that was refused; its message is for the writer. Nothing was erased. */
export class CannotExile extends Error {}

/** Erase one project in the Graveyard, for good. */
export async function exileProject(filesystem: Filesystem, projectsDirectory: string, project: Project): Promise<void> {
  await confirmBuried(filesystem, projectsDirectory, project, CannotExile);
  await filesystem.exileFromGraveyard(project.path, project.marker.projectId);
}
