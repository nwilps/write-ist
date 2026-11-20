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
 */
import { background, drift } from "asciify-engine/kit";

/** What `ground.ts` needs of a running background. */
export interface RunningDrift {
  readonly play: () => void;
  readonly pause: () => void;
  readonly destroy: () => void;
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
  return handle;
}
