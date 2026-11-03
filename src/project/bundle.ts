/**
 * A bundle: the folder a project lives in (ADR-0025).
 *
 * Slice 1 writes two of its files. The rest — `drafts/`, `drafts.md`,
 * `plan.md`, `log.md`, `notes.md` — arrive with the workspaces that own them,
 * so they are named in ADR-0025 and not here.
 */
import type { ProjectMarker } from "./marker.ts";

/** The marker that makes a folder a bundle (ADR-0025, ADR-0015). */
export const MARKER_FILE = "project.md";

/**
 * The in-progress draft. The extension says which surface, so a stranger
 * double-clicking it gets a sensible handler (ADR-0025); the prose surface's
 * is `manuscript.md`, and is not built in this slice.
 */
export const MANUSCRIPT_FILE = "manuscript.fountain";

/**
 * The names the writer confirmed by hand (slice 2, step 8; ADR-0025). Plain
 * text, project-level, never frozen at lock.
 */
export const NAMES_FILE = "names.txt";

/** A project as the application holds it: where it is, and what it says it is. */
export interface Project {
  /** The bundle's folder. An input to opening it, never its identity (ADR-0015). */
  readonly path: string;
  readonly marker: ProjectMarker;
}

/**
 * Characters no folder name may carry.
 *
 * Wider than Linux needs — Linux forbids only `/` and NUL — because a bundle
 * is a folder the writer may copy to a Windows machine or a cloud drive, and
 * a name that arrives there broken is worse than a name with a space in it.
 */
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * Long enough for any title a writer would use, short enough to leave room
 * for a path around it on every platform.
 */
const MAX_LENGTH = 80;

/**
 * The folder to put a project in, given its name and the folders already
 * there.
 *
 * The folder name is **derived from the project name and is not the project's
 * identity** — that is the id in the marker (ADR-0015). So it is free to be
 * adjusted for the disk, and free to gain a number: importing the same script
 * twice makes two projects, and the second cannot silently land on the first.
 *
 * Existing names are compared without case, because two folders differing only
 * in case are one folder on macOS and on Windows.
 */
export function folderNameFor(projectName: string, taken: ReadonlySet<string>): string {
  const cleaned = projectName
    .replace(FORBIDDEN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LENGTH)
    // A trailing dot or space is legal on Linux and silently dropped by
    // Windows, which would make the name the application wrote and the name
    // on disk disagree.
    .replace(/[. ]+$/, "");

  const base = cleaned === "" ? "Untitled" : cleaned;
  const lowercased = new Set([...taken].map((name) => name.toLowerCase()));

  if (!lowercased.has(base.toLowerCase())) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base} ${suffix}`;
    if (!lowercased.has(candidate.toLowerCase())) return candidate;
  }
}
