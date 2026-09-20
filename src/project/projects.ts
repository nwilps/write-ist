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
import { parseMarker, type ProjectMarker } from "./marker.ts";

// Lenient, and the only lenient decode in the application: nothing downstream
// ever writes this text back. A marker full of replacement characters simply
// fails to parse, and failing to parse is an answer this module has a name
// for. The manuscript, which *is* written back, goes through `decodeFile`'s
// strict path instead.
const decoder = new TextDecoder("utf-8", { fatal: false });

export interface ProjectsListing {
  /** Every folder that is a project, sorted by name without case. */
  readonly projects: readonly Project[];
  /**
   * Folders that hold a `project.md` which could not be read.
   *
   * **Absent and unparseable are different** (ADR-0016), and this is the
   * difference. A folder with no marker is not a project and is not mentioned
   * — most folders in `Documents` are not projects, and listing them as
   * problems would be noise. A folder that *has* a marker Write-ist cannot
   * read is a project-shaped thing that went wrong, and ADR-0008 rule 4 is
   * that such a record fails **loudly** and is retained: it is named here so
   * the writer is told, and it is never adopted and never written into
   * (ADR-0015).
   */
  readonly unreadable: readonly string[];
}

/**
 * Every project in the default location, and every folder that looked like one
 * and could not be read.
 */
export async function listProjects(
  filesystem: Filesystem,
  projectsDirectory: string,
): Promise<ProjectsListing> {
  const entries = await filesystem.readDirectory(projectsDirectory);
  const projects: Project[] = [];
  const unreadable: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    // A hidden folder is never a project. Write-ist does not make them, and
    // the default location is inside `Documents`, where other tools do — the
    // writer's own `.catalog-snapshot` sits there today. Reading one to find
    // out costs a line in the report the moment anything about it is
    // unusual, and it could never have been a project anyway.
    if (entry.name.startsWith(".")) continue;
    const path = join(projectsDirectory, entry.name);

    const marker = await readMarker(filesystem, path);
    if (marker === "no marker") continue;
    if (marker === "unreadable") {
      unreadable.push(entry.name);
      continue;
    }
    projects.push({ path, marker });
  }

  projects.sort((one, other) =>
    one.marker.name.localeCompare(other.marker.name, "en", { sensitivity: "base" }),
  );
  return { projects, unreadable: unreadable.sort() };
}

/**
 * What a folder's marker turns out to be.
 *
 * Whether the marker is *there* is answered by listing the folder rather than
 * by whether reading it threw, because those are two different questions and
 * a thrown read cannot tell them apart. A permission error on a marker that
 * exists is `"unreadable"`, which is what makes it loud.
 */
async function readMarker(
  filesystem: Filesystem,
  bundlePath: string,
): Promise<ProjectMarker | "no marker" | "unreadable"> {
  let held;
  try {
    held = await filesystem.readDirectory(bundlePath);
  } catch {
    // The folder itself would not open. Nothing can be said about what is in
    // it, so it is not claimed as a project.
    return "unreadable";
  }
  if (!held.some((entry) => entry.name === MARKER_FILE && !entry.isDirectory)) {
    return "no marker";
  }

  try {
    const bytes = await filesystem.readFile(join(bundlePath, MARKER_FILE));
    return parseMarker(decoder.decode(bytes)) ?? "unreadable";
  } catch {
    return "unreadable";
  }
}
