/**
 * `engine.ts`, with the engine's kit stood in for: the pointer `ground.ts`
 * hands in must reach the engine's own field, by the engine's own API; a new
 * look is handed to the same engine, not a new one; and Reactive and Ambient
 * reach the looks that hear the window themselves.
 *
 * Why the pointer is handed in at all: the kit reads a GPU look's pointer only
 * when its host is in the event's path, and our host takes no clicks, so it
 * never is (`engine.ts`). WebGL2 is not here to draw it, so this checks the
 * hand-off, and `background-ground.test.ts` the listening.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const field = { pointer: vi.fn() };
const drift = { id: "drift", cursor: true };
const dune = { id: "dune", cursor: false };
const noise = { id: "noise", cursor: true };
const handle = {
  supported: true,
  field: field as { pointer: ReturnType<typeof vi.fn> } | null,
  preset: drift as { id: string; cursor: boolean },
  play: vi.fn(),
  pause: vi.fn(),
  destroy: vi.fn(),
  update: vi.fn((options: { preset?: { id: string; cursor: boolean } }) => {
    if (options.preset !== undefined) handle.preset = options.preset;
  }),
};
const background = vi.fn(() => handle);

vi.mock("asciify-engine/kit", () => ({ background }));

const { startBackground } = await import("../../app/src/background/engine.ts");
type Look = Parameters<typeof startBackground>[1];
const look = (preset: { id: string; cursor: boolean }): Look => preset as unknown as Look;

afterEach(() => {
  vi.clearAllMocks();
  handle.supported = true;
  handle.field = field;
  handle.preset = drift;
});

describe("the pointer, handed to the look", () => {
  it("reaches the engine's field as the place on the layer, and lifts with null", () => {
    const run = startBackground(document.createElement("div"), look(drift), true)!;
    run.pointer(120, 48);
    run.pointer(null);
    expect(field.pointer.mock.calls).toEqual([
      [120, 48],
      [null, undefined],
    ]);
  });

  it("is the look on the layer, its ink and accent tokens, Field's word Write-ist's", () => {
    const host = document.createElement("div");
    startBackground(host, look(drift), true);
    expect(background).toHaveBeenCalledWith(host, {
      preset: drift,
      ink: "--colour-background-ink",
      accent: "--colour-background-accent",
      text: "Write-ist",
      cursor: true,
      lazy: false,
    });
  });

  it("does nothing while the engine has no field, as for the retired looks", () => {
    const run = startBackground(document.createElement("div"), look(dune), true)!;
    handle.field = null;
    expect(() => run.pointer(1, 2)).not.toThrow();
  });

  it("plays, pauses and is taken down through the engine", () => {
    const run = startBackground(document.createElement("div"), look(drift), true)!;
    run.pause();
    run.play();
    run.destroy();
    expect(handle.pause).toHaveBeenCalledTimes(1);
    expect(handle.play).toHaveBeenCalledTimes(1);
    expect(handle.destroy).toHaveBeenCalledTimes(1);
  });

  it("is nothing where the engine cannot draw, and leaves nothing behind", () => {
    handle.supported = false;
    expect(startBackground(document.createElement("div"), look(drift), true)).toBeUndefined();
    expect(handle.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("Reactive and Ambient, for every look", () => {
  it("starts Ambient with the look's response off", () => {
    startBackground(document.createElement("div"), look(noise), false);
    expect(background).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cursor: false }));
  });

  it("keeps a look's own response when Reactive, and none where it has none", () => {
    startBackground(document.createElement("div"), look(dune), true);
    expect(background).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cursor: false }));
  });

  it("turns the look's own response off and on in place, with no new engine", () => {
    handle.preset = noise;
    const run = startBackground(document.createElement("div"), look(noise), true)!;
    run.react(false);
    run.react(true);
    expect(handle.update.mock.calls).toEqual([[{ cursor: false }], [{ cursor: true }]]);
    expect(background).toHaveBeenCalledTimes(1);
    expect(handle.destroy).not.toHaveBeenCalled();
  });
});

describe("another look", () => {
  it("is handed to the same engine, which cross-fades to it, the cursor said again for it", () => {
    const run = startBackground(document.createElement("div"), look(drift), true)!;
    expect(run.show(look(dune))).toBe(true);
    expect(run.show(look(noise))).toBe(true);
    expect(handle.update.mock.calls).toEqual([
      [{ preset: dune, cursor: false }],
      [{ preset: noise, cursor: true }],
    ]);
    expect(background).toHaveBeenCalledTimes(1);
    expect(handle.destroy).not.toHaveBeenCalled();
  });

  it("comes in Ambient when the writer is in Ambient", () => {
    const run = startBackground(document.createElement("div"), look(drift), true)!;
    run.react(false);
    run.show(look(noise));
    expect(handle.update).toHaveBeenLastCalledWith({ preset: noise, cursor: false });
  });

  it("that cannot draw here takes the engine down and says so to the layer", () => {
    const run = startBackground(document.createElement("div"), look(dune), true)!;
    handle.update.mockImplementationOnce(() => {
      handle.supported = false;
    });
    expect(run.show(look(drift))).toBe(false);
    expect(handle.destroy).toHaveBeenCalledTimes(1);
  });
});
