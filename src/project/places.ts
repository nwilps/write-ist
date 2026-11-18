/**
 * Where the writer left the caret in each project, so reopening one puts them
 * back there.
 *
 * **Not the writer's work, and not in the bundle.** The manuscript and the
 * marker are the writer's files (ADR-0020); a caret is the application's
 * memory of a session. So it lives above every bundle, in `appLocalDataDir()`
 * beside the ledger (ADR-0016), keyed by the project's id (ADR-0015) — the id
 * says *which* project, so a project renamed or moved keeps its place.
 *
 * Format: one line per project, tab-separated, in plain sight:
 *
 *   <projectId>\t<element>\t<offset>\t<elements>
 *
 * Written whole, through the port's temp-flush-rename (ADR-0008 rule 5).
 * **A file that will not read is never written over** (ADR-0008 rule 3): it
 * may hold every other project's place, so the caret simply starts at the top
 * of the script and the file is left for whoever looks at it. Losing a place
 * costs the writer a scroll, never a word.
 */
import type { CaretPlace } from "../screenplay/caret-place.ts";
import type { Filesystem } from "./filesystem.ts";
import { join } from "./filesystem.ts";

/** The file's name inside `appLocalDataDir()`. */
export const PLACES_FILE = "places.txt";

export interface Places {
  /** The place remembered for a project, or `undefined` when there is none or it cannot be read. */
  recall(projectId: string): Promise<CaretPlace | undefined>;
  /** Remember a project's place. Rejects, writing nothing, when the file there will not read. */
  remember(projectId: string, place: CaretPlace): Promise<void>;
}

export function openPlaces(filesystem: Filesystem, directory: string): Places {
  const path = join(directory, PLACES_FILE);
  // One write at a time, so two quick ones cannot each read the file before
  // the other has written it.
  let queue: Promise<unknown> = Promise.resolve();

  /** Every place on disk; an empty map when there is no file yet. Rejects when it will not read. */
  async function read(): Promise<Map<string, CaretPlace>> {
    if (!(await filesystem.exists(path))) return new Map();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await filesystem.readFile(path));
    const places = parsePlaces(text);
    if (places === undefined) throw new Error(`${PLACES_FILE} is not a list of places Write-ist can read.`);
    return places;
  }

  return {
    async recall(projectId) {
      try {
        return (await read()).get(projectId);
      } catch {
        return undefined;
      }
    },
    remember(projectId, place) {
      const write = queue.then(async () => {
        const places = await read();
        places.set(projectId, place);
        await filesystem.createDirectory(directory);
        await filesystem.writeFile(path, new TextEncoder().encode(serialisePlaces(places)));
      });
      queue = write.catch(() => {});
      return write;
    },
  };
}

const COUNT = /^\d+$/;

/** The places a file holds, or `undefined` when any line is not one. */
export function parsePlaces(text: string): Map<string, CaretPlace> | undefined {
  const places = new Map<string, CaretPlace>();
  for (const line of text.split("\n")) {
    if (line === "") continue;
    const fields = line.split("\t");
    if (fields.length !== 4) return undefined;
    const [id, element, offset, elements] = fields as [string, string, string, string];
    if (id === "" || ![element, offset, elements].every((field) => COUNT.test(field))) return undefined;
    places.set(id, { element: Number(element), offset: Number(offset), elements: Number(elements) });
  }
  return places;
}

export function serialisePlaces(places: ReadonlyMap<string, CaretPlace>): string {
  return [...places]
    .map(([id, place]) => `${id}\t${place.element}\t${place.offset}\t${place.elements}\n`)
    .join("");
}
