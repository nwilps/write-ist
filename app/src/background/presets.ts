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
  readonly load: () => Promise<Look>;
}

type Loaders = Readonly<Record<BackgroundPreset, readonly [label: string, load: () => Promise<{ look: Look }>]>>;

const LOADERS: Loaders = {
  drift: ["Drift", () => import("./looks/drift.ts")],
  capillary: ["Capillary", () => import("./looks/capillary.ts")],
  contour: ["Contour", () => import("./looks/contour.ts")],
  dune: ["Dune", () => import("./looks/dune.ts")],
  estuary: ["Estuary", () => import("./looks/estuary.ts")],
  etch: ["Etch", () => import("./looks/etch.ts")],
  // The engine exports it as `wordField`; its id and its own name are Field.
  field: ["Field", () => import("./looks/field.ts")],
  fluid: ["Fluid", () => import("./looks/fluid.ts")],
  mesh: ["Mesh", () => import("./looks/mesh.ts")],
  morph: ["Morph", () => import("./looks/morph.ts")],
  noise: ["Noise", () => import("./looks/noise.ts")],
  silk: ["Silk", () => import("./looks/silk.ts")],
  weave: ["Weave", () => import("./looks/weave.ts")],
};

/** Every look, in the order Settings lists them: Drift first. */
export const LOOKS: readonly LookChoice[] = BACKGROUND_PRESETS.map((id) => {
  const [label, load] = LOADERS[id];
  return { id, label, load: async () => (await load()).look };
});

/** Loads one look's code. */
export const loadLook = (id: BackgroundPreset): Promise<Look> => LOOKS.find((look) => look.id === id)!.load();
