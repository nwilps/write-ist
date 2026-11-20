/**
 * Asciify's backgrounds, started on one element (`asciify-engine`, MIT).
 *
 * The only file that imports the engine's background, and it is loaded on its
 * own only when the background is wanted (`ground.ts`), so a writer who turns
 * it off never pays for it. The looks themselves are loaded one at a time, the
 * one chosen only (`presets.ts`). Each look is the engine's own preset with its
 * own pointer response, not a copy of it. Only the ink is Write-ist's: tokens
 * from `tokens.css`, named here and read by the engine from the element's
 * computed style, so no colour is written in code (ADR-0030). How quiet each
 * look is, is the stylesheet's (`.background-ground`).
 *
 * **The pointer is handed in, not heard**, for the looks drawn on the GPU (all
 * but the retired ones). The kit reads their pointer on the host element: the
 * engine listens on the window, but passes a move on only when the host is in
 * the event's path. Our host takes no clicks (`pointer-events: none`) and sits
 * under everything, so it is never in that path and the look never stirred.
 * `pointer` is the engine's own way in — the field's `pointer(x, y)`, in CSS
 * pixels from the canvas's corner — and `ground.ts` calls it from the window.
 *
 * **Capillary, Estuary and Fluid hear the host itself**, not the window and not
 * the field: each adds its own `pointermove` and `pointerleave` listeners to the
 * host element, and turns the move into its own wake (the veins lit, the
 * currents stirred, the folds pushed). Their field's `pointer` reaches none of
 * that. Under `pointer-events: none` the host is never an event's target, so
 * those listeners never ran. For these three the move is said to the host
 * instead, as an event of the same name that does not bubble, at the window
 * place the engine reads (`clientX`, `clientY`); the pointer gone is a
 * `pointerleave`. Dispatching does not need the host to take clicks, so the
 * layer still lets everything through.
 *
 * **The retired looks hear the window themselves.** They draw on a 2D canvas,
 * have no field, and follow the pointer wherever it is, or not at all, by the
 * engine's `cursor` option. So Reactive and Ambient are also said through that
 * option, for every look: Reactive keeps the look's own response, Ambient turns
 * it off. Dune, Etch, Morph, Silk and Weave have no response of their own, and
 * are the same in both.
 */
import { background, type BackgroundPreset } from "asciify-engine/kit";

/** One of the engine's looks, as `presets.ts` loads it. */
export type Look = BackgroundPreset;

/** What `ground.ts` needs of a running background. */
export interface RunningBackground {
  readonly play: () => void;
  readonly pause: () => void;
  readonly destroy: () => void;
  /** Where the pointer is, in CSS pixels from the layer's top left; `null` when it has gone. */
  readonly pointer: (x: number | null, y?: number) => void;
  /** Reactive (`true`) or Ambient, used at once. */
  readonly react: (on: boolean) => void;
  /**
   * Another look, cross-faded in place by the engine with no blank between.
   * `false` when the new look cannot draw here: the old one has gone too.
   */
  readonly show: (look: Look) => boolean;
}

/**
 * Field's word. The look draws its letters from it; the engine's default is
 * its own name.
 */
const FIELD_WORD = "Write-ist";

/** The engine's `cursor` for a look: its own response, or none. */
const cursorFor = (look: Look, reactive: boolean): boolean => reactive && look.cursor;

/** The looks that listen for the pointer on their host element (above). */
const HEARS_HOST: ReadonlySet<string> = new Set(["capillary", "estuary", "fluid"]);

/** The pointer, said to the host as the look's own listeners expect it. */
function tellHost(host: HTMLElement, x: number | null, y: number | undefined): void {
  const view = host.ownerDocument.defaultView;
  if (view === null) return;
  if (x === null) {
    host.dispatchEvent(new view.Event("pointerleave"));
    return;
  }
  const box = host.getBoundingClientRect();
  const Move = typeof view.PointerEvent === "function" ? view.PointerEvent : view.MouseEvent;
  host.dispatchEvent(new Move("pointermove", { clientX: x + box.left, clientY: (y ?? 0) + box.top }));
}

/**
 * `look` drawing on `host`, or `undefined` when it cannot be drawn here: no
 * WebGL2 for a GPU look, a GPU the engine will not use, or anything thrown on
 * the way.
 */
export function startBackground(host: HTMLElement, look: Look, reactive: boolean): RunningBackground | undefined {
  const handle = background(host, {
    preset: look,
    ink: "--colour-background-ink",
    // Peaks and lit letters, for the looks that draw them. Without it a few
    // retired looks bring a bright colour of their own.
    accent: "--colour-background-accent",
    text: FIELD_WORD,
    cursor: cursorFor(look, reactive),
    // The layer covers the window for the life of the app, so there is
    // nothing to wait for before mounting.
    lazy: false,
  });
  if (!handle.supported) {
    handle.destroy();
    return undefined;
  }
  let hearing = reactive;
  return {
    play: () => handle.play(),
    pause: () => handle.pause(),
    destroy: () => handle.destroy(),
    pointer(x, y) {
      if (HEARS_HOST.has(handle.preset.id)) tellHost(host, x, y);
      else handle.field?.pointer(x, y);
    },
    react(on) {
      hearing = on;
      handle.update({ cursor: cursorFor(handle.preset, on) });
    },
    show(next) {
      // The cursor is one of the options kept across the change, so it is said
      // again for the look coming in.
      handle.update({ preset: next, cursor: cursorFor(next, hearing) });
      if (handle.supported) return true;
      handle.destroy();
      return false;
    },
  };
}
