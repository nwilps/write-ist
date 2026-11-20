/**
 * The looks the background can take: what Settings calls each, and where its
 * code is (Settings ▸ General ▸ Appearance ▸ Background).
 *
 * Each look is its own small chunk in `looks/`, fetched from the app's own
 * files the first time it is shown, so the window loads only the one the
 * writer chose. Nothing here imports the engine; the ids are the engine's own,
 * and `src/settings/settings.ts` keeps the list and its order.
 */
import { BACKGROUND_PRESETS, type BackgroundPreset } from "../../../src/settings/settings.ts";
import type { Look } from "./engine.ts";

export interface LookChoice {
  readonly id: BackgroundPreset;
  /** What Settings shows. */
  readonly label: string;
  /** Retired by the engine, which still ships it. Listed after the current ones. */
  readonly retired: boolean;
  readonly load: () => Promise<Look>;
}

type Loaders = Readonly<Record<BackgroundPreset, readonly [label: string, retired: boolean, load: () => Promise<{ look: Look }>]>>;

const LOADERS: Loaders = {
  drift: ["Drift", false, () => import("./looks/drift.ts")],
  contour: ["Contour", false, () => import("./looks/contour.ts")],
  mesh: ["Mesh", false, () => import("./looks/mesh.ts")],
  estuary: ["Estuary", false, () => import("./looks/estuary.ts")],
  capillary: ["Capillary", false, () => import("./looks/capillary.ts")],
  // The engine exports it as `wordField`; its id and its own name are Field.
  field: ["Field", false, () => import("./looks/field.ts")],
  fluid: ["Fluid", false, () => import("./looks/fluid.ts")],
  dune: ["Dune", true, () => import("./looks/dune.ts")],
  etch: ["Etch", true, () => import("./looks/etch.ts")],
  morph: ["Morph", true, () => import("./looks/morph.ts")],
  noise: ["Noise", true, () => import("./looks/noise.ts")],
  silk: ["Silk", true, () => import("./looks/silk.ts")],
  weave: ["Weave", true, () => import("./looks/weave.ts")],
};

/** Every look, in the order Settings lists them: Drift first. */
export const LOOKS: readonly LookChoice[] = BACKGROUND_PRESETS.map((id) => {
  const [label, retired, load] = LOADERS[id];
  return { id, label, retired, load: async () => (await load()).look };
});

/** Loads one look's code. */
export const loadLook = (id: BackgroundPreset): Promise<Look> => LOOKS.find((look) => look.id === id)!.load();
