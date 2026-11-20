/**
 * One look, in its own chunk (`presets.ts`).
 *
 * Etch is the engine's own preset, quickened and drawn finer: the engine's
 * pace (`speed` 1) left the grain all but still, and its 12-pixel letters too
 * coarse to show the cut lines whole. The engine reads both as the preset's
 * defaults, so they are Etch's alone and go with it when another look comes in.
 */
import { etch } from "asciify-engine/kit";

export const look: typeof etch = { ...etch, speed: 2.4, cellSize: 10 };
