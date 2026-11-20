/**
 * The animated ground behind every screen: Home, Open Project, the Editor and
 * every dialog (Settings ▸ General ▸ Appearance ▸ Background animation).
 *
 * **One layer for the life of the app**, the first thing in `body`, fixed to
 * the window under everything else and taking no clicks (`app.css`,
 * `.drift-ground`). The screens are drawn and redrawn over it without knowing
 * it is there. The engine hears the pointer on the window itself, so the
 * layer can let every click, drag and keystroke through and still answer the
 * pointer moving.
 *
 * **Off means nothing running**: no engine, no frame loop, no worker, and no
 * listener of this file's. It is off while the setting is off, while the
 * writer has asked the system for less motion, and wherever the engine cannot
 * draw. Each of those leaves the flat desk colour, which is what `html` is
 * painted. Nothing is said about it: a background that could not start is not
 * the writer's business.
 *
 * While it is drawing, the root carries `data-background-animation="on"`, and
 * the stylesheet uses that to fade the paper out at the window's edges onto
 * the animation instead of onto a band of desk colour (`editor.css`).
 *
 * Kept out of the shell (ADR-0005): the shell hosts workspaces and knows
 * nothing of what is drawn behind it.
 */
import type { RunningDrift } from "./drift-engine.ts";

/** Starts the engine on a host, or says it cannot (`drift-engine.ts`). */
export type StartDrift = (host: HTMLElement) => RunningDrift | undefined;

export interface GroundOptions {
  /** Where the layer goes: it is put first, under everything after it. */
  readonly body: HTMLElement;
  /** Carries `data-background-animation` while the engine is drawing. */
  readonly root: HTMLElement;
  /**
   * Loads the engine. By default its own chunk, fetched from the app's own
   * files only the first time the background is wanted.
   */
  readonly load?: () => Promise<StartDrift>;
}

export interface Ground {
  /** The writer's setting, used at once: on starts the engine, off takes it down. */
  readonly set: (wanted: boolean) => void;
  /** Whether the engine is drawing now. */
  readonly running: () => boolean;
}

const loadEngine = async (): Promise<StartDrift> => (await import("./drift-engine.ts")).startDrift;

const LESS_MOTION = "(prefers-reduced-motion: reduce)";

export function mountGround({ body, root, load = loadEngine }: GroundOptions): Ground {
  const host = body.ownerDocument.createElement("div");
  host.className = "drift-ground";
  host.setAttribute("aria-hidden", "true");
  body.prepend(host);

  const document = body.ownerDocument;
  const view = document.defaultView;
  const motion = typeof view?.matchMedia === "function" ? view.matchMedia(LESS_MOTION) : undefined;

  let wanted = false;
  let engine: Promise<StartDrift | undefined> | undefined;
  let drawing: RunningDrift | undefined;
  /** Bumped on every change, so a start still loading can tell it was overtaken. */
  let turn = 0;

  const quiet = (act: () => void): void => {
    try {
      act();
    } catch {
      // The engine is decoration: a failure in it is the flat desk, never a message.
    }
  };

  const onVisibility = (): void => {
    if (drawing === undefined) return;
    const shown = drawing;
    quiet(() => (document.hidden ? shown.pause() : shown.play()));
  };
  const onMotion = (): void => apply();

  function stop(): void {
    if (drawing !== undefined) {
      const was = drawing;
      drawing = undefined;
      quiet(() => was.destroy());
    }
    delete root.dataset["backgroundAnimation"];
  }

  async function start(at: number): Promise<void> {
    engine ??= load().catch(() => undefined);
    const begin = await engine;
    if (at !== turn || begin === undefined) return;
    let started: RunningDrift | undefined;
    try {
      started = begin(host);
    } catch {
      started = undefined;
    }
    if (started === undefined) return;
    drawing = started;
    root.dataset["backgroundAnimation"] = "on";
    if (document.hidden) onVisibility();
  }

  function apply(): void {
    turn += 1;
    const go = wanted && motion?.matches !== true;
    if (!go) {
      stop();
      return;
    }
    if (drawing === undefined) void start(turn).catch(() => {});
  }

  return {
    set(next) {
      if (next === wanted) return;
      wanted = next;
      // The listeners are this file's only work while the setting is on; off,
      // there are none.
      if (wanted) {
        document.addEventListener("visibilitychange", onVisibility);
        motion?.addEventListener?.("change", onMotion);
      } else {
        document.removeEventListener("visibilitychange", onVisibility);
        motion?.removeEventListener?.("change", onMotion);
      }
      apply();
    },
    running: () => drawing !== undefined,
  };
}
