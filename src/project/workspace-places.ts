/**
 * Where the writer was in each workspace of each project — Notes' caret and
 * scroll, Plan's scroll — so leaving a project and coming back puts them there.
 *
 * The manuscript's caret has its own file (`places.ts`), shaped round a place
 * in a screenplay. This is the same idea for every other workspace, with
 * nothing in it about what a workspace holds: a place is a few named whole
 * numbers, and what they mean is the workspace's business.
 *
 * **Not the writer's work, and not in the bundle** — the application's memory
 * of a session, in `appLocalDataDir()` beside the ledger and `places.txt`
 * (ADR-0016), keyed by the project's id (ADR-0015) and the workspace's id, so
 * a renamed project keeps its places. Never `localStorage` (ADR-0009).
 *
 * Format: one line per workspace of a project, tab-separated, in plain sight:
 *
 *   <projectId>\t<workspaceId>\tcaret=120\tscroll=340
 *
 * Written whole, through the port's temp-flush-rename (ADR-0008 rule 5). **A
 * file that will not read is never written over** (ADR-0008 rule 3): the
 * workspace opens at the top and the file is left for whoever looks at it.
 * Losing a place costs the writer a scroll, never a word.
 */
import type { Filesystem } from "./filesystem.ts";
import { join } from "./filesystem.ts";

/** The file's name inside `appLocalDataDir()`. */
export const WORKSPACE_PLACES_FILE = "workspace-places.txt";

/** A place: named whole numbers, as the workspace that keeps it names them. */
export type WorkspacePlace = Readonly<Record<string, number>>;

export interface WorkspacePlaces {
  /** The place a workspace was left at in a project, or `undefined` when there is none or it cannot be read. */
  recall(projectId: string, workspaceId: string): Promise<WorkspacePlace | undefined>;
  /** Remember it. Rejects, writing nothing, when the file there will not read. */
  remember(projectId: string, workspaceId: string, place: WorkspacePlace): Promise<void>;
}

const KEY = /^[a-z][a-z0-9-]*$/;
const COUNT = /^\d+$/;
const keyOf = (projectId: string, workspaceId: string): string => `${projectId}\t${workspaceId}`;

export function openWorkspacePlaces(filesystem: Filesystem, directory: string): WorkspacePlaces {
  const path = join(directory, WORKSPACE_PLACES_FILE);
  // One write at a time, so two quick ones cannot each read before the other writes.
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<Map<string, WorkspacePlace>> {
    if (!(await filesystem.exists(path))) return new Map();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await filesystem.readFile(path));
    const places = parseWorkspacePlaces(text);
    if (places === undefined) throw new Error(`${WORKSPACE_PLACES_FILE} is not a list of places Write-ist can read.`);
    return places;
  }

  return {
    async recall(projectId, workspaceId) {
      try {
        return (await read()).get(keyOf(projectId, workspaceId));
      } catch {
        return undefined;
      }
    },
    remember(projectId, workspaceId, place) {
      const write = queue.then(async () => {
        const places = await read();
        places.set(keyOf(projectId, workspaceId), place);
        await filesystem.createDirectory(directory);
        await filesystem.writeFile(path, new TextEncoder().encode(serialiseWorkspacePlaces(places)));
      });
      queue = write.catch(() => {});
      return write;
    },
  };
}

/** The places a file holds, keyed by project and workspace, or `undefined` when any line is not one. */
export function parseWorkspacePlaces(text: string): Map<string, WorkspacePlace> | undefined {
  const places = new Map<string, WorkspacePlace>();
  for (const line of text.split("\n")) {
    if (line === "") continue;
    const [projectId, workspaceId, ...fields] = line.split("\t");
    if (projectId === undefined || projectId === "" || workspaceId === undefined || !KEY.test(workspaceId)) return undefined;
    const place: Record<string, number> = {};
    for (const field of fields) {
      const [name, value, ...rest] = field.split("=");
      if (name === undefined || value === undefined || rest.length > 0 || !KEY.test(name) || !COUNT.test(value)) return undefined;
      place[name] = Number(value);
    }
    places.set(keyOf(projectId, workspaceId), place);
  }
  return places;
}

export function serialiseWorkspacePlaces(places: ReadonlyMap<string, WorkspacePlace>): string {
  return [...places]
    .map(([key, place]) => {
      const fields = Object.entries(place)
        .filter(([name, value]) => KEY.test(name) && Number.isSafeInteger(value) && value >= 0)
        .map(([name, value]) => `\t${name}=${value}`);
      return `${key}${fields.join("")}\n`;
    })
    .join("");
}
