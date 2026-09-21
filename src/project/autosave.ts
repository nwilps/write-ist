/**
 * When autosave fires (ADR-0028).
 *
 * > **A couple of seconds after the writer stops typing, on switching to
 * > another application, and on closing the project.** A crash then costs at
 * > most the last few seconds of typing.
 *
 * `src/project/save.ts` is *what* a save does, and is one routine. This is
 * *when*, and it is deliberately the whole of when: three ways in, one way
 * out. Anything that wants the manuscript written asks here or asks the save
 * routine directly, and nothing has its own timer.
 *
 * ## Why the clock is injected
 *
 * `docs/STANDARDS.md`: *determinism claimed in a comment is not determinism* —
 * the rule written from a generator whose state lived in a closure that was
 * never reset. A test that waited two real seconds for each case would be slow
 * and would still be guessing; one that drives the clock itself knows the
 * difference between *fired after the pause* and *fired at all*.
 *
 * The default clock is the window's, so the application passes nothing.
 */

/**
 * A couple of seconds (ADR-0028).
 *
 * Long enough that it is not firing between words, short enough that a crash
 * costs a sentence rather than a scene.
 */
export const PAUSE = 2_000;

/** Somewhere to hang a pending save. Opaque: only the clock that made it reads it. */
export type Pending = unknown;

/** The clock autosave counts on, so a test can be the clock. */
export interface Clock {
  readonly wait: (run: () => void, after: number) => Pending;
  readonly cancel: (pending: Pending) => void;
}

/** The window's own clock. */
export const windowClock: Clock = {
  wait: (run, after) => setTimeout(run, after),
  cancel: (pending) => clearTimeout(pending as ReturnType<typeof setTimeout>),
};

export interface AutosaveDependencies {
  /** The one save routine (`editingSession`'s `save`). */
  readonly save: () => Promise<unknown>;
  /**
   * A save that did not happen, in words the writer can act on.
   *
   * Autosave is the thing the writer is not watching, so a failure it swallows
   * is a failure nobody ever learns about — ADR-0008 rule 4.
   */
  readonly trouble: (error: unknown) => void;
  readonly clock?: Clock;
}

export interface Autosave {
  /** The writer typed. Restarts the pause. */
  readonly typed: () => void;
  /**
   * Save now — the window lost focus, or the project is closing.
   *
   * Cancels anything pending, so the two never both fire, and resolves when
   * the save has landed. It never rejects: trouble is reported, because a
   * caller closing a project has nowhere to put an error.
   */
  readonly now: () => Promise<void>;
  /** Whether a save is waiting on the clock. */
  readonly pending: () => boolean;
}

export function autosave({ save, trouble, clock = windowClock }: AutosaveDependencies): Autosave {
  let waiting: Pending | undefined;

  const cancel = (): void => {
    if (waiting === undefined) return;
    clock.cancel(waiting);
    waiting = undefined;
  };

  const run = async (): Promise<void> => {
    try {
      await save();
    } catch (error) {
      trouble(error);
    }
  };

  return {
    typed: () => {
      // Restarted, not extended: the pause is measured from the last
      // keystroke, so it fires after the writer stops rather than part way
      // through a sentence.
      cancel();
      waiting = clock.wait(() => {
        waiting = undefined;
        void run();
      }, PAUSE);
    },
    now: async () => {
      cancel();
      await run();
    },
    pending: () => waiting !== undefined,
  };
}
