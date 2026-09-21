/**
 * What a workspace declares to the shell (ADR-0005).
 *
 * > Workspaces use the same shape. The shell hosts them through a uniform
 * > registry; each declares itself — its name, its place in the workspace bar,
 * > which formats show it by default — and the shell hosts it without knowing
 * > what it is. […] Get this right and a new workspace is a manifest; get it
 * > wrong and every workspace is surgery in the shell.
 *
 * Slice 1 has exactly one workspace, the Editor, and the workspace bar is not
 * built. The manifest exists anyway, and that is the whole point: the bar and
 * the Notes, Plan and Log workspaces arrive as entries in a registry rather than
 * as changes in here. ADR-0005 records that stating this rule is what failed
 * last time — v1's architecture document already said modes must never be
 * hard-coded into the shell, and v1 still produced a 3,535-line `Draft.tsx`.
 *
 * So the rule has a form a test can fail on, and
 * `test/app/shell-knows-nothing.test.ts` is it.
 */
import type { Project } from "../../../src/project/bundle.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";

/** Everything a workspace is given. Nothing in it names a surface. */
export interface WorkspaceContext {
  /** Which project is open — a path and what its marker says (ADR-0015). */
  readonly project: Project;
  readonly filesystem: Filesystem;
  /**
   * Something went wrong that the writer must see, in words about their file.
   *
   * A workspace reports rather than drawing its own alarm, because trouble
   * belongs to the frame the writer is looking at and the shell is what knows
   * which that is.
   */
  readonly report: (trouble: string) => void;
}

/** A workspace that has been put on screen. */
export interface MountedWorkspace {
  /**
   * Take it down again, releasing whatever it holds.
   *
   * **It may have work to finish.** The Editor saves the manuscript on the way
   * out (ADR-0028), so this answers when it is safe to close the window rather
   * than when the last element was removed. A caller that is only swapping
   * screens need not wait; one that is about to quit must (#41).
   */
  readonly unmount: () => Promise<void>;
}

export interface WorkspaceManifest {
  /** Stable, and not shown to the writer. */
  readonly id: string;
  /** What the workspace bar will call it. */
  readonly name: string;
  /**
   * The letter the workspace bar will show beside it. The bar is not built, so
   * nothing reads this yet; it is declared here because it is part of what a
   * workspace *is*, and adding it later would mean touching every manifest.
   */
  readonly key: string;
  /**
   * **The third thing ADR-0005 names is deliberately absent**: *"which formats
   * show it by default"*.
   *
   * It is missing rather than forgotten. A format is data (ADR-0006) and today
   * there is exactly one, `Feature`, so a field listing which formats show this
   * workspace could only ever hold the same single value — an abstraction for a
   * need nothing has yet. It arrives with the second format or the second
   * workspace, whichever comes first, and it costs one line in each manifest
   * then.
   */
  /** Draw it into the element given, and answer how to take it down. */
  readonly mount: (into: HTMLElement, context: WorkspaceContext) => MountedWorkspace;
}
