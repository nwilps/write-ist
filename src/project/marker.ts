/**
 * `project.md` — the file that makes a folder a bundle (ADR-0025).
 *
 * It holds four things and no more: the format version, the project id, the
 * format, and the project's name. ADR-0025's shape for every sidecar file is
 * *the writer's words in the body, the application's bookkeeping in a short
 * labelled header beneath the heading* — so the name is the heading, because
 * it is the one field the writer chose, and the other three are labelled lines
 * under it.
 *
 * The labels are `Key: value`, which is Fountain's own title-page shape. A
 * screenwriter opening this file in a text editor has read that shape before,
 * and ADR-0012's reason for readability is diagnosis: the id has to be
 * greppable on the day a writer has lost a folder.
 *
 * **Reading fails closed.** Anything this file cannot parse returns `null`,
 * and ADR-0015 then declines to treat the folder as a bundle at all rather
 * than adopting it and writing into it. That is ADR-0008 rule 3 one step
 * earlier — at the point of deciding what a folder even is.
 */

/**
 * The version of the bundle format, written from the project's first day
 * (ADR-0004). One field now; unrecoverable later, because there is no way to
 * migrate files that never said what they were.
 */
export const FORMAT_VERSION = "1";

/**
 * The formats slice 1 knows. An import is always a Feature (#38) — choosing a
 * format, and the blank New Screenplay that would need one, are out of scope.
 */
export const FORMATS = ["Feature"] as const;
export type ProjectFormat = (typeof FORMATS)[number];

export interface ProjectMarker {
  /** The writer's name for the project. The heading. */
  readonly name: string;
  /** Which version of the bundle format this project is in (ADR-0004). */
  readonly formatVersion: string;
  /** A UUID4, minted at creation and never changed (ADR-0015). */
  readonly projectId: string;
  readonly format: ProjectFormat;
}

const LABELS = {
  formatVersion: "Format version",
  projectId: "Project id",
  format: "Format",
} as const;

/** The text of a `project.md`. */
export function serialiseMarker(marker: ProjectMarker): string {
  return [
    `# ${marker.name}`,
    "",
    `${LABELS.formatVersion}: ${marker.formatVersion}`,
    `${LABELS.projectId}: ${marker.projectId}`,
    `${LABELS.format}: ${marker.format}`,
    "",
  ].join("\n");
}

/**
 * Read a `project.md`, or `null` if it is not one.
 *
 * Null means *this folder is not a bundle*, never *this bundle is empty*. The
 * caller's only correct response is to leave the folder alone.
 */
export function parseMarker(text: string): ProjectMarker | null {
  const lines = text.split(/\r\n?|\n/);

  const heading = lines.find((line) => line.startsWith("# "));
  if (heading === undefined) return null;
  const name = heading.slice(2).trim();
  if (name === "") return null;

  const labelled = new Map<string, string>();
  for (const line of lines) {
    const match = /^([A-Za-z][A-Za-z ]*):[ \t]*(.*)$/.exec(line);
    // The heading's own text can contain a colon; only lines after it count,
    // and the heading never matches because it starts with `#`.
    if (match !== null && !labelled.has(match[1]!)) labelled.set(match[1]!, match[2]!.trim());
  }

  const formatVersion = labelled.get(LABELS.formatVersion);
  const projectId = labelled.get(LABELS.projectId);
  const format = labelled.get(LABELS.format);
  if (!formatVersion || !projectId || !format) return null;

  // An unknown format is unreadable rather than a default. Guessing here would
  // be the application adopting a bundle it does not understand.
  if (!(FORMATS as readonly string[]).includes(format)) return null;

  return { name, formatVersion, projectId, format: format as ProjectFormat };
}
