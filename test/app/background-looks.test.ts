/**
 * Every look Settings offers, with the real engine (`asciify-engine`): each id
 * loads the engine's own preset of that id, and each one mounts on the layer
 * and comes down again leaving nothing behind.
 *
 * jsdom has no WebGL2, so the looks drawn on the GPU cannot draw here, and the
 * check for them is that they say so quietly: nothing on the layer, nothing in
 * the console. The retired looks draw on a 2D canvas, and jsdom is given a
 * stand-in for that, so they really mount, draw, swap and are taken down.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBackground, type Look } from "../../app/src/background/engine.ts";
import { LOOKS, loadLook } from "../../app/src/background/presets.ts";
import { BACKGROUND_PRESETS, type BackgroundPreset } from "../../src/settings/settings.ts";

/** The engine's own exports, by the id Settings keeps (`wordField`'s id is `field`). */
const EXPORTS: Readonly<Record<string, string>> = {
  drift: "drift",
  contour: "contour",
  mesh: "mesh",
  estuary: "estuary",
  capillary: "capillary",
  field: "wordField",
  fluid: "fluid",
  dune: "dune",
  etch: "etch",
  morph: "morph",
  noise: "noise",
  silk: "silk",
  weave: "weave",
};
const RETIRED: readonly BackgroundPreset[] = ["dune", "etch", "morph", "noise", "silk", "weave"];
const GPU = BACKGROUND_PRESETS.filter((id) => !RETIRED.includes(id));

/** A 2D context that draws nothing and answers every call. */
function stand2d(): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const held: Record<PropertyKey, unknown> = {};
  return new Proxy(held, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => gradient;
      if (key === "getTransform") return () => ({ a: 1 });
      if (key === "measureText") return () => ({ width: 1 });
      return () => {};
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let said: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, kind: string) {
    return kind === "2d" ? stand2d() : null;
  } as typeof HTMLCanvasElement.prototype.getContext);
  said = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
});
afterEach(() => {
  for (const spy of said) expect(spy).not.toHaveBeenCalled();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const layer = (): HTMLElement => {
  const host = document.createElement("div");
  host.className = "background-ground";
  document.body.append(host);
  return host;
};

describe("the looks Settings offers", () => {
  it("are the thirteen asked for, Drift first, then the rest by name", () => {
    expect(LOOKS.map((look) => look.label)).toEqual([
      "Drift",
      "Capillary",
      "Contour",
      "Dune",
      "Estuary",
      "Etch",
      "Field",
      "Fluid",
      "Mesh",
      "Morph",
      "Noise",
      "Silk",
      "Weave",
    ]);
  });

  it.each(BACKGROUND_PRESETS)("%s loads the engine's own preset of that id, under the engine's name for it", async (id) => {
    const kit = (await import("asciify-engine/kit")) as unknown as Record<string, Look>;
    const look = await loadLook(id);
    expect(look).toBe(kit[EXPORTS[id]!]);
    expect(look.id).toBe(id);
    expect(look.name).toBe(LOOKS.find((choice) => choice.id === id)!.label);
  });
});

describe("mounting and taking down, with the real engine", () => {
  it.each(GPU)("%s, which needs WebGL2, steps aside quietly where there is none", async (id) => {
    const host = layer();
    expect(startBackground(host, await loadLook(id), true)).toBeUndefined();
    expect(host.childElementCount).toBe(0);
  });

  it.each(RETIRED)("%s mounts its canvas under everything, takes no clicks, and leaves nothing when taken down", async (id) => {
    const host = layer();
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const run = startBackground(host, await loadLook(id), true)!;
    expect(run).toBeDefined();
    const canvas = host.querySelector("canvas")!;
    expect(canvas.style.pointerEvents).toBe("none");
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    run.pointer(10, 10);
    run.react(false);
    run.react(true);
    run.pause();
    run.play();
    run.destroy();
    expect(host.childElementCount).toBe(0);
    // The engine's own pointer listener, for the retired looks, goes with it.
    const moves = (spy: typeof added): number => spy.mock.calls.filter(([type]) => type === "pointermove").length;
    expect(moves(removed)).toBe(moves(added));
  });

  it("swaps one retired look for another on the same engine, then comes down whole", async () => {
    vi.useFakeTimers();
    try {
      const host = layer();
      const run = startBackground(host, await loadLook("dune"), true)!;
      expect(run.show(await loadLook("weave"))).toBe(true);
      // Both canvases while the engine cross-fades, then only the new one.
      expect(host.querySelectorAll("canvas")).toHaveLength(2);
      vi.advanceTimersByTime(400);
      expect(host.querySelectorAll("canvas")).toHaveLength(1);
      run.destroy();
      expect(host.childElementCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("goes from a look that can draw to one that cannot, and takes itself down", async () => {
    const host = layer();
    const run = startBackground(host, await loadLook("silk"), true)!;
    expect(run.show(await loadLook("contour"))).toBe(false);
    expect(host.childElementCount).toBe(0);
  });
});
