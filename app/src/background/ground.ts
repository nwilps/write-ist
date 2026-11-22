/**
 * The animated ground behind every screen: Home, Open Project, the Editor and
 * every dialog (Settings ▸ General ▸ Appearance ▸ Background animation).
 *
 * **One layer for the life of the app**, the first thing in `body`, fixed to
 * the window under everything else and taking no clicks (`app.css`,
 * `.background-ground`). The screens are drawn and redrawn over it without
 * knowing it is there.
 *
 * **One look at a time** (Background, the row below). Field unless the writer
 * chose another. Changing it while the background draws hands the engine the
 * new look, and the engine cross-fades from one to the other on the same
 * layer: no blank desk between, no flash. Each look's code is loaded only when
 * it is first shown (`presets.ts`). The layer carries the look's id
 * (`data-look`), so the stylesheet can give each look its own quietness.
 *
 * **Reactive or Ambient** (the next row in Settings). Reactive, this file
 * hears the pointer move on the window and hands it to the engine
 * (`engine.ts` says why the engine cannot hear it itself, and how it reaches
 * Capillary, Estuary and Fluid, which listen on the layer), so the layer lets
 * every click, drag and keystroke through and still answers the pointer over
 * the paper, the panels and every dialog. Ambient, nothing is heard and the
 * look moves on its own. Changing between them changes only that: the engine
 * keeps drawing, with no flash. Listening is passive and on the pointer only;
 * typing never reaches it.
 *
 * **Off means nothing running**: no engine, no frame loop, no worker, and no
 * listener of this file's, whichever the motion. It is off while the setting is off, while the
 * writer has asked the system for less motion, and wherever the engine cannot
 * draw. Each of those leaves the flat desk colour, which is what `html` is
 * painted. Nothing is said about it: a background that could not start is not
 * the writer's business.
 *
 * While it is drawing, the root carries `data-background-animation="on"`, and
 * the stylesheet uses that to fade the writing into the paper's own colour at
 * the window's edges rather than into the desk's (`editor.css`). The paper
 * stays opaque, and nothing else on the screen is drawn differently.
 *
 * Kept out of the shell (ADR-0005): the shell hosts workspaces and knows
 * nothing of what is drawn behind it.
 */
import { DEFAULT_BACKGROUND_PRESET, type BackgroundPreset } from "../../../src/settings/settings.ts";
import type { Look, RunningBackground } from "./engine.ts";
import { loadLook as loadLookCode } from "./presets.ts";

/** Starts the engine on a host, or says it cannot (`engine.ts`). */
export type StartBackground = (host: HTMLElement, look: Look, reactive: boolean) => RunningBackground | undefined;

export interface GroundOptions {
  /** Where the layer goes: it is put first, under everything after it. */
  readonly body: HTMLElement;
  /** Carries `data-background-animation` while the engine is drawing. */
  readonly root: HTMLElement;
  /**
   * Loads the engine. By default its own chunk, fetched from the app's own
   * files only the first time the background is wanted.
   */
  readonly load?: () => Promise<StartBackground>;
  /** Loads one look. By default its own small chunk (`presets.ts`). */
  readonly loadLook?: (id: BackgroundPreset) => Promise<Look>;
}

export interface Ground {
  /** The writer's setting, used at once: on starts the engine, off takes it down. */
  readonly set: (wanted: boolean) => void;
  /**
   * Reactive (`true`) or Ambient: whether the pointer moving is handed to the
   * engine. Used at once while it draws, and kept for when it next does.
   */
  readonly react: (on: boolean) => void;
  /**
   * Which look to draw. Swapped in place while it draws, and kept for when it
   * next does.
   */
  readonly look: (id: BackgroundPreset) => void;
  /** Whether the engine is drawing now. */
  readonly running: () => boolean;
}

const loadEngine = async (): Promise<StartBackground> => (await import("./engine.ts")).startBackground;

const LESS_MOTION = "(prefers-reduced-motion: reduce)";

export function mountGround({ body, root, load = loadEngine, loadLook = loadLookCode }: GroundOptions): Ground {
  const host = body.ownerDocument.createElement("div");
  host.className = "background-ground";
  host.setAttribute("aria-hidden", "true");
  body.prepend(host);

  const document = body.ownerDocument;
  const view = document.defaultView;
  const motion = typeof view?.matchMedia === "function" ? view.matchMedia(LESS_MOTION) : undefined;

  let wanted = false;
  let reactive = true;
  let chosen: BackgroundPreset = DEFAULT_BACKGROUND_PRESET;
  /** Whether this file is listening for the pointer now. */
  let hearing = false;
  let engine: Promise<StartBackground | undefined> | undefined;
  /** Each look's code, loading or loaded; `undefined` where it would not load. */
  const looks = new Map<BackgroundPreset, Promise<Look | undefined>>();
  let drawing: RunningBackground | undefined;
  /** Bumped on every change, so a start still loading can tell it was overtaken. */
  let turn = 0;
  /** Bumped on every change of look, so a look still loading can tell it was overtaken. */
  let swap = 0;

  const quiet = (act: () => void): void => {
    try {
      act();
    } catch {
      // The engine is decoration: a failure in it is the flat desk, never a message.
    }
  };

  const lookCode = (id: BackgroundPreset): Promise<Look | undefined> => {
    let code = looks.get(id);
    if (code === undefined) {
      code = loadLook(id).catch(() => undefined);
      looks.set(id, code);
    }
    return code;
  };

  const onVisibility = (): void => {
    if (drawing === undefined) return;
    const shown = drawing;
    quiet(() => (document.hidden ? shown.pause() : shown.play()));
  };
  const onMotion = (): void => apply();

  // Pointer events where the webview has them (WebKitGTK does), mouse events
  // where it does not: one or the other, never both.
  const pointerEvents = typeof view?.PointerEvent === "function";
  const MOVE = pointerEvents ? "pointermove" : "mousemove";
  const OUT = pointerEvents ? "pointerout" : "mouseout";
  const LISTEN = { capture: true, passive: true } as const;

  const onMove = (event: MouseEvent): void => {
    // A move said to the layer itself is the engine's hand-off to a look
    // (`engine.ts`), passing this listener on its way: not the writer's.
    if (drawing === undefined || event.target === host) return;
    const shown = drawing;
    // The layer is the window's size, but measured all the same, so the engine
    // is told the place on its own canvas whatever the window does.
    const box = host.getBoundingClientRect();
    quiet(() => shown.pointer(event.clientX - box.left, event.clientY - box.top));
  };
  /** Out of the window altogether: the wake lifts, as it would on a web page. */
  const onOut = (event: MouseEvent): void => {
    if (event.relatedTarget !== null || drawing === undefined) return;
    const shown = drawing;
    quiet(() => shown.pointer(null));
  };

  /** Listen for the pointer exactly while the engine draws and the writer wants Reactive. */
  function hear(): void {
    const next = drawing !== undefined && reactive;
    if (next === hearing || view === null) return;
    hearing = next;
    if (hearing) {
      view.addEventListener(MOVE, onMove as EventListener, LISTEN);
      view.addEventListener(OUT, onOut as EventListener, LISTEN);
    } else {
      view.removeEventListener(MOVE, onMove as EventListener, LISTEN);
      view.removeEventListener(OUT, onOut as EventListener, LISTEN);
    }
  }

  function stop(): void {
    if (drawing !== undefined) {
      const was = drawing;
      drawing = undefined;
      quiet(() => was.destroy());
    }
    hear();
    delete root.dataset["backgroundAnimation"];
  }

  async function start(at: number): Promise<void> {
    engine ??= load().catch(() => undefined);
    const id = chosen;
    const [begin, look] = await Promise.all([engine, lookCode(id)]);
    if (at !== turn || begin === undefined || look === undefined) return;
    let started: RunningBackground | undefined;
    try {
      started = begin(host, look, reactive);
    } catch {
      started = undefined;
    }
    if (started === undefined) return;
    drawing = started;
    host.dataset["look"] = id;
    root.dataset["backgroundAnimation"] = "on";
    hear();
    if (document.hidden) onVisibility();
  }

  /** Hand the engine the chosen look once its code is here, unless it was overtaken. */
  async function change(at: number): Promise<void> {
    const id = chosen;
    const look = await lookCode(id);
    if (at !== swap || drawing === undefined) return;
    if (look === undefined) {
      // That look will not load here: the flat desk, as for one that cannot draw.
      stop();
      return;
    }
    const shown = drawing;
    let showing = false;
    quiet(() => (showing = shown.show(look)));
    if (!showing) {
      stop();
      return;
    }
    host.dataset["look"] = id;
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
    react(on) {
      if (on === reactive) return;
      reactive = on;
      if (drawing !== undefined) {
        const shown = drawing;
        // Ambient lifts the wake the pointer left, so it does not hang there.
        if (!reactive) quiet(() => shown.pointer(null));
        quiet(() => shown.react(reactive));
      }
      hear();
    },
    look(id) {
      if (id === chosen) return;
      chosen = id;
      swap += 1;
      if (drawing !== undefined) {
        void change(swap).catch(() => {});
        return;
      }
      // Not drawing: it may be the look that could not draw, so try this one
      // if the background is wanted.
      if (wanted) apply();
    },
    running: () => drawing !== undefined,
  };
}
