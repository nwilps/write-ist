/**
 * Asciify's Drift, started on one element (`asciify-engine`, MIT).
 *
 * The only file that imports the engine, and it is loaded on its own only when
 * the background is wanted (`ground.ts`), so a writer who turns it off never
 * pays for it. Drift is the engine's own preset with its own pointer response,
 * not a copy of it. Only the ink is Write-ist's: a token from `tokens.css`,
 * named here and read by the engine from the element's computed style, so no
 * colour is written in code (ADR-0030). How quiet it is, is the stylesheet's
 * (`.drift-ground`).
 *
 * **The pointer is handed in, not heard.** The kit reads the pointer for a
 * background on its host element: the engine listens on the window, but passes
 * a move on only when the host is in the event's path. Our host takes no clicks
 * (`pointer-events: none`) and sits under everything, so it is never in that
 * path and Drift never stirred. `pointer` is the engine's own way in — the
 * field's `pointer(x, y)`, in CSS pixels from the canvas's corner — and
 * `ground.ts` calls it from the window.
 */
import { background, drift } from "asciify-engine/kit";

/** What `ground.ts` needs of a running background. */
export interface RunningDrift {
  readonly play: () => void;
  readonly pause: () => void;
  readonly destroy: () => void;
  /** Where the pointer is, in CSS pixels from the layer's top left; `null` when it has gone. */
  readonly pointer: (x: number | null, y?: number) => void;
}

/**
 * Drift drawing on `host`, or `undefined` when it cannot be drawn here: no
 * WebGL2, a GPU the engine will not use, or anything thrown on the way.
 */
export function startDrift(host: HTMLElement): RunningDrift | undefined {
  const handle = background(host, {
    preset: drift,
    ink: "--colour-drift-ink",
    // The layer covers the window for the life of the app, so there is
    // nothing to wait for before mounting.
    lazy: false,
  });
  if (!handle.supported) {
    handle.destroy();
    return undefined;
  }
  return {
    play: () => handle.play(),
    pause: () => handle.pause(),
    destroy: () => handle.destroy(),
    pointer: (x, y) => handle.field?.pointer(x, y),
  };
}
