/**
 * `drift-engine.ts`, with the engine's kit stood in for: the pointer `ground.ts`
 * hands in must reach the engine's own field, by the engine's own API.
 *
 * Why it is handed in at all: the kit reads a background's pointer only when
 * its host is in the event's path, and our host takes no clicks, so it never
 * is (`drift-engine.ts`). WebGL2 is not here to draw it, so this checks the
 * hand-off, and `background-ground.test.ts` the listening.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const field = { pointer: vi.fn() };
const handle = {
  supported: true,
  field: field as { pointer: ReturnType<typeof vi.fn> } | null,
  play: vi.fn(),
  pause: vi.fn(),
  destroy: vi.fn(),
};
const background = vi.fn(() => handle);

vi.mock("asciify-engine/kit", () => ({ background, drift: { id: "drift" } }));

const { startDrift } = await import("../../app/src/background/drift-engine.ts");

afterEach(() => {
  vi.clearAllMocks();
  handle.supported = true;
  handle.field = field;
});

describe("the pointer, handed to Drift", () => {
  it("reaches the engine's field as the place on the layer, and lifts with null", () => {
    const run = startDrift(document.createElement("div"))!;
    run.pointer(120, 48);
    run.pointer(null);
    expect(field.pointer.mock.calls).toEqual([
      [120, 48],
      [null, undefined],
    ]);
  });

  it("is Drift on the layer, its ink a token", () => {
    const host = document.createElement("div");
    startDrift(host);
    expect(background).toHaveBeenCalledWith(host, { preset: { id: "drift" }, ink: "--colour-drift-ink", lazy: false });
  });

  it("does nothing while the engine has no field", () => {
    const run = startDrift(document.createElement("div"))!;
    handle.field = null;
    expect(() => run.pointer(1, 2)).not.toThrow();
  });

  it("plays, pauses and is taken down through the engine", () => {
    const run = startDrift(document.createElement("div"))!;
    run.pause();
    run.play();
    run.destroy();
    expect(handle.pause).toHaveBeenCalledTimes(1);
    expect(handle.play).toHaveBeenCalledTimes(1);
    expect(handle.destroy).toHaveBeenCalledTimes(1);
  });

  it("is nothing where the engine cannot draw, and leaves nothing behind", () => {
    handle.supported = false;
    expect(startDrift(document.createElement("div"))).toBeUndefined();
    expect(handle.destroy).toHaveBeenCalledTimes(1);
  });
});
