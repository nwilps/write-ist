/**
 * The projects list: a directory listing, and nothing written down.
 *
 * ADR-0015 is explicit that the id says *which*, never *where*, so finding
 * projects needs no id and no store: every folder in the default location
 * carrying a readable `project.md` is a project. **A derived list cannot go
 * stale and cannot be corrupted** (ADR-0016) — which is why there is no index
 * here to keep in step with the disk.
 *
 * Relocated projects, and the registry that would point at them, are out of
 * scope for slice 1.
 */
import { join, type Filesystem } from "./filesystem.ts";
import { MARKER_FILE, type Project } from "./bundle.ts";
import { parseMarker } from "./marker.ts";

const decoder = new TextDecoder("utf-8", { fatal: false });

/**
 * Every project in the default location.
 *
 * **A folder with no marker, or with one that cannot be read, is not listed
 * and is never written into** (ADR-0015, #38). That is a fail-closed rule, not
 * a tidy-up: adopting an ambiguous folder is ADR-0008 rule 3 one step earlier,
 * at the point of deciding what a folder even is. So an unreadable marker is
 * skipped exactly as an absent one is — the folder stays whatever it was.
 *
 * Sorted by name, without case, so the list the writer sees does not depend on
 * the order the filesystem happened to hand the folders over in.
 */
export async function listProjects(
  filesystem: Filesystem,
  projectsDirectory: string,
): Promise<readonly Project[]> {
  const entries = await filesystem.readDirectory(projectsDirectory);
  const projects: Project[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const path = join(projectsDirectory, entry.name);
    const marker = await readMarker(filesystem, path);
    if (marker !== null) projects.push({ path, marker });
  }

  return projects.sort((one, other) =>
    one.marker.name.localeCompare(other.marker.name, "en", { sensitivity: "base" }),
  );
}

/**
 * A folder's marker, or `null` if this folder is not a bundle.
 *
 * A read that throws and a marker that will not parse are the same answer
 * here, and the answer is *not a bundle*. The decoder is deliberately lenient
 * — the only lenient decode in the application — because nothing downstream
 * ever writes this text back: it is read to decide whether to list a folder,
 * and a marker full of replacement characters simply fails to parse. The
 * manuscript, which is written back, goes through `decodeFile`'s strict path.
 */
async function readMarker(filesystem: Filesystem, bundlePath: string) {
  try {
    const bytes = await filesystem.readFile(join(bundlePath, MARKER_FILE));
    return parseMarker(decoder.decode(bytes));
  } catch {
    return null;
  }
}
