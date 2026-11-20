/**
 * The Drift background behind every screen (`app/src/background/`).
 *
 * The engine draws with WebGL2, which jsdom does not have, so most of this
 * drives the layer with a stand-in engine that records what was asked of it:
 * started on which element, paused, played, destroyed. The last part loads the
 * real engine, here where it cannot draw, and checks that it says nothing and
 * leaves the flat desk.
 */
// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mountGround, type StartDrift } from "../../app/src/background/ground.ts";
import type { RunningDrift } from "../../app/src/background/drift-engine.ts";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeAll(() => {
  // jsdom has no media queries at all; each test says what the system wants.
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset["backgroundAnimation"];
  // Back to jsdom's own answer: the window is showing.
  delete (document as { hidden?: boolean }).hidden;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** An engine that draws nothing and remembers everything. */
function fakeEngine(draws = true) {
  const runs: {
    host: HTMLElement;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    pointer: ReturnType<typeof vi.fn>;
  }[] = [];
  const start = vi.fn<StartDrift>((host) => {
    if (!draws) return undefined;
    const run = { host, play: vi.fn(), pause: vi.fn(), destroy: vi.fn(), pointer: vi.fn() };
    runs.push(run);
    return run satisfies RunningDrift;
  });
  const load = vi.fn(async () => start);
  return { start, load, runs };
}

/** `prefers-reduced-motion`, as the system says it, and able to change its mind. */
function motionQuery(reduce: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: reduce,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.spyOn(window, "matchMedia").mockImplementation(() => query as unknown as MediaQueryList);
  return {
    listeners,
    change(next: boolean) {
      query.matches = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};

function mount(engine = fakeEngine()) {
  const app = document.createElement("div");
  app.id = "app";
  document.body.append(app);
  const ground = mountGround({ body: document.body, root: document.documentElement, load: engine.load });
  return { ground, engine, app };
}

describe("one layer under every screen", () => {
  it("is put first in the body, before the screens, and hidden from assistive technology", () => {
    const { app } = mount();
    const layer = document.body.firstElementChild as HTMLElement;
    expect(layer.className).toBe("drift-ground");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.nextElementSibling).toBe(app);
    expect(document.querySelectorAll(".drift-ground")).toHaveLength(1);
  });

  it("is styled to take no clicks and to sit under everything, its quietness a token", () => {
    const app = readFileSync("app/src/style/app.css", "utf8");
    const rule = /\.drift-ground \{([^}]*)\}/.exec(app)?.[1] ?? "";
    expect(rule).toContain("position: fixed;");
    expect(rule).toContain("inset: 0;");
    expect(rule).toContain("z-index: -1;");
    expect(rule).toContain("pointer-events: none;");
    expect(rule).toContain("opacity: var(--opacity-drift);");
    // The desk colour is the window's, so a layer between `html` and `body` shows.
    expect(app).toMatch(/\nhtml \{\s*background: var\(--colour-base\);\s*\}/);
    expect(/\nbody \{([^}]*)\}/.exec(app)?.[1]).not.toContain("background");
    const tokens = readFileSync("app/src/style/tokens.css", "utf8");
    expect(tokens).toMatch(/--colour-drift-ink: var\(--colour-faint\);/);
    expect(tokens).toMatch(/--opacity-drift: 0\.3;/);
  });
});

describe("the Editor with the background on", () => {
  const style = "app/src/style";
  const sheets = readdirSync(style)
    .filter((name) => name.endsWith(".css"))
    .map((name) => [name, readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")] as const);
  /** Every rule as `[file, selector, declarations]`. */
  const rules = sheets.flatMap(([name, sheet]) =>
    [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => [name, match[1]!.trim(), match[2]!] as const),
  );
  const tokens = readFileSync(join(style, "tokens.css"), "utf8");
  const token = (name: string): string => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim() ?? "";

  it("changes only the paper's fades, so the panels and every control sit and draw as they do with it off", () => {
    // A mask on the scroller is what cut the side panels off (#159): every rule
    // the background turns on is about the fades and nothing else.
    const gated = rules.filter(([, selector]) => selector.includes("data-background-animation"));
    expect(gated.length).toBeGreaterThan(0);
    for (const [, selector] of gated) expect(selector).toMatch(/ \.paper-fade(--top|--bottom)?$/);
  });

  it("clips and masks nothing on the desk", () => {
    const clipping = rules.filter(([, , body]) => /(?:^|[\s;])(-webkit-)?(mask[\w-]*|clip-path|isolation)\s*:/.test(body));
    expect(clipping.map(([name, selector]) => `${name} ${selector}`)).toEqual([]);
  });

  it("keeps the paper and its fades opaque, fading the writing into the paper's own colour", () => {
    expect(rules.find(([name, selector]) => name === "editor.css" && selector === ".page")![2]).toContain(
      "background: var(--colour-page);",
    );
    expect(token("--colour-paper-fade")).toBe("var(--colour-base)");
    expect(token("--colour-paper-fade-drift")).toBe("var(--colour-page)");
    expect(token("--opacity-paper-fade")).toBe("1");
    const on = rules.find(([, selector]) => selector === ':root[data-background-animation="on"] .paper-fade')![2];
    expect(on.trim()).toBe("--paper-fade-colour: var(--colour-paper-fade-drift);");
    // The fade's every stop is that colour or clear, laid over the opaque paper.
    const fade = rules.find(([name, selector]) => name === "editor.css" && selector === ".paper-fade")![2];
    expect(fade).toContain("--paper-fade-colour: var(--colour-paper-fade);");
    expect(fade).toContain("color-mix(in srgb, var(--paper-fade-colour) calc(var(--opacity-paper-fade) * 100%), transparent)");
    expect(fade).not.toContain("--colour-base");
    // Nothing the background turns on hides the fade, or lightens the paper.
    for (const [, , body] of rules.filter(([, selector]) => selector.includes("data-background-animation"))) {
      expect(body).not.toMatch(/display:\s*none|opacity:|visibility:|background:/);
    }
  });
});

describe("on and off", () => {
  it("starts nothing until it is wanted", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    await settle();
    expect(engine.load).not.toHaveBeenCalled();
    expect(ground.running()).toBe(false);
    expect(document.documentElement.dataset["backgroundAnimation"]).toBeUndefined();
  });

  it("starts the engine on the layer when turned on, and marks the root for the stylesheet", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.runs[0]!.host).toBe(document.querySelector(".drift-ground"));
    expect(ground.running()).toBe(true);
    expect(document.documentElement.dataset["backgroundAnimation"]).toBe("on");
  });

  it("takes the engine down at once when turned off, and leaves no listener of its own behind", async () => {
    const motion = motionQuery(false);
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    expect(motion.listeners.size).toBe(1);

    ground.set(false);
    expect(engine.runs[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(ground.running()).toBe(false);
    expect(document.documentElement.dataset["backgroundAnimation"]).toBeUndefined();
    expect(motion.listeners.size).toBe(0);
    const visibility = added.mock.calls.filter(([type]) => type === "visibilitychange").map(([, listener]) => listener);
    expect(visibility).toHaveLength(1);
    expect(removed.mock.calls.filter(([type]) => type === "visibilitychange").map(([, listener]) => listener)).toEqual(visibility);

    // Nothing answers the window being hidden any more.
    setHidden(true);
    expect(engine.runs[0]!.pause).not.toHaveBeenCalled();
  });

  it("starts again at once when turned back on, loading the engine only the first time", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    ground.set(false);
    ground.set(true);
    await settle();
    expect(engine.load).toHaveBeenCalledTimes(1);
    expect(engine.start).toHaveBeenCalledTimes(2);
    expect(engine.runs[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(engine.runs[1]!.destroy).not.toHaveBeenCalled();
    expect(ground.running()).toBe(true);
  });

  it("never shows a start that was turned off while the engine was still loading", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    ground.set(true);
    ground.set(false);
    await settle();
    expect(engine.start).not.toHaveBeenCalled();
    expect(ground.running()).toBe(false);
    expect(document.documentElement.dataset["backgroundAnimation"]).toBeUndefined();
  });

  it("asking for the same thing twice does nothing more", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    ground.set(true);
    ground.set(true);
    await settle();
    expect(engine.start).toHaveBeenCalledTimes(1);
  });
});

/** The pointer moving over something on the screen, as the webview sends it. */
const moveOver = (target: EventTarget, clientX: number, clientY: number): void => {
  target.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY, bubbles: true }));
};

/** The listeners this file put on the window, by event. */
function windowListeners() {
  const added = vi.spyOn(window, "addEventListener");
  const removed = vi.spyOn(window, "removeEventListener");
  const live = (type: string): number =>
    added.mock.calls.filter(([kind]) => kind === type).length - removed.mock.calls.filter(([kind]) => kind === type).length;
  return { added, removed, live };
}

describe("answering the pointer (Reactive)", () => {
  // The bug Noah found: the engine heard the pointer only when the layer was in
  // the event's path, and a layer that takes no clicks never is. These move the
  // pointer over the screens, never over the layer.
  it("hands the engine every move over the screens, the paper and dialogs included, in the layer's own pixels", async () => {
    motionQuery(false);
    const { ground, engine, app } = mount();
    ground.set(true);
    await settle();
    const layer = document.querySelector<HTMLElement>(".drift-ground")!;
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 800, 600));
    const paper = document.createElement("div");
    paper.className = "paper";
    app.append(paper);
    const dialog = document.createElement("dialog");
    document.body.append(dialog);

    moveOver(paper, 110, 220);
    moveOver(dialog, 50, 40);
    moveOver(document.body, 10, 20);
    expect(engine.runs[0]!.pointer.mock.calls).toEqual([
      [100, 200],
      [40, 20],
      [0, 0],
    ]);
  });

  it("is Reactive by default", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    moveOver(document.body, 5, 6);
    expect(engine.runs[0]!.pointer).toHaveBeenCalledWith(5, 6);
  });

  it("lifts the wake when the pointer leaves the window, and not when it only crosses from one thing to another", async () => {
    motionQuery(false);
    const { ground, engine, app } = mount();
    ground.set(true);
    await settle();
    app.dispatchEvent(new PointerEvent("pointerout", { relatedTarget: document.body, bubbles: true }));
    expect(engine.runs[0]!.pointer).not.toHaveBeenCalled();
    app.dispatchEvent(new PointerEvent("pointerout", { relatedTarget: null, bubbles: true }));
    expect(engine.runs[0]!.pointer.mock.calls).toEqual([[null]]);
  });

  it("listens passively, before the screens do, and only for the pointer: no key, no input, nothing on the typing path", async () => {
    motionQuery(false);
    const onWindow = windowListeners();
    const onDocument = vi.spyOn(document, "addEventListener");
    const { ground } = mount();
    ground.set(true);
    await settle();
    expect(onWindow.added.mock.calls.map(([type, , options]) => [type, options])).toEqual([
      ["pointermove", { capture: true, passive: true }],
      ["pointerout", { capture: true, passive: true }],
    ]);
    expect(onDocument.mock.calls.map(([type]) => type)).toEqual(["visibilitychange"]);
  });

  it("still answers where the webview has only mouse events", async () => {
    vi.stubGlobal("PointerEvent", undefined);
    motionQuery(false);
    const onWindow = windowListeners();
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    expect(onWindow.added.mock.calls.map(([type]) => type)).toEqual(["mousemove", "mouseout"]);
    document.body.dispatchEvent(new MouseEvent("mousemove", { clientX: 30, clientY: 40, bubbles: true }));
    expect(engine.runs[0]!.pointer).toHaveBeenCalledWith(30, 40);
  });

  it("stops listening when the background is turned off, and hands nothing to an engine that is gone", async () => {
    motionQuery(false);
    const onWindow = windowListeners();
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    expect(onWindow.live("pointermove")).toBe(1);
    ground.set(false);
    expect(onWindow.live("pointermove")).toBe(0);
    expect(onWindow.live("pointerout")).toBe(0);
    moveOver(document.body, 1, 2);
    expect(engine.runs[0]!.pointer).not.toHaveBeenCalled();
  });

  it("does not listen before the engine draws, nor where it cannot", async () => {
    motionQuery(false);
    const onWindow = windowListeners();
    const { ground } = mount(fakeEngine(false));
    ground.set(true);
    await settle();
    expect(onWindow.live("pointermove")).toBe(0);
  });
});

describe("moving on its own (Ambient)", () => {
  it("stops handing the pointer on at once, lifts the wake, and keeps drawing with no restart", async () => {
    motionQuery(false);
    const onWindow = windowListeners();
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    moveOver(document.body, 1, 1);

    ground.react(false);
    expect(engine.runs[0]!.pointer.mock.calls).toEqual([[1, 1], [null]]);
    expect(onWindow.live("pointermove")).toBe(0);
    moveOver(document.body, 2, 2);
    expect(engine.runs[0]!.pointer).toHaveBeenCalledTimes(2);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.runs[0]!.destroy).not.toHaveBeenCalled();
    expect(ground.running()).toBe(true);

    ground.react(true);
    moveOver(document.body, 3, 4);
    expect(engine.runs[0]!.pointer).toHaveBeenLastCalledWith(3, 4);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(onWindow.live("pointermove")).toBe(1);
  });

  it("is kept while the background is off, and used when it next draws", async () => {
    motionQuery(false);
    const onWindow = windowListeners();
    const { ground, engine } = mount();
    ground.react(false);
    ground.set(true);
    await settle();
    expect(onWindow.live("pointermove")).toBe(0);
    moveOver(document.body, 1, 1);
    expect(engine.runs[0]!.pointer).not.toHaveBeenCalled();

    ground.set(false);
    ground.react(true);
    ground.set(true);
    await settle();
    moveOver(document.body, 7, 8);
    expect(engine.runs[1]!.pointer).toHaveBeenCalledWith(7, 8);
  });

  it("asking for the same motion twice does nothing more", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    ground.react(true);
    expect(engine.runs[0]!.pointer).not.toHaveBeenCalled();
  });
});

describe("costing nothing it need not", () => {
  it("starts paused when the window is hidden as it starts", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    setHidden(true);
    ground.set(true);
    await settle();
    expect(engine.runs[0]!.pause).toHaveBeenCalledTimes(1);
  });

  it("pauses while the window is hidden and plays when it is back", async () => {
    motionQuery(false);
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    setHidden(true);
    expect(engine.runs[0]!.pause).toHaveBeenCalledTimes(1);
    setHidden(false);
    expect(engine.runs[0]!.play).toHaveBeenCalledTimes(1);
  });

  it("does not run for a writer who asked the system for less motion, and follows them changing their mind", async () => {
    const motion = motionQuery(true);
    const { ground, engine } = mount();
    ground.set(true);
    await settle();
    expect(engine.load).not.toHaveBeenCalled();
    expect(ground.running()).toBe(false);

    motion.change(false);
    await settle();
    expect(ground.running()).toBe(true);

    motion.change(true);
    expect(engine.runs[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(ground.running()).toBe(false);
  });
});

describe("failing quietly, to the flat desk", () => {
  const quietly = () => ({
    error: vi.spyOn(console, "error"),
    warn: vi.spyOn(console, "warn"),
    log: vi.spyOn(console, "log"),
  });
  const saidNothing = (console: ReturnType<typeof quietly>): void => {
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  };

  it("when the engine cannot draw here", async () => {
    motionQuery(false);
    const said = quietly();
    const { ground } = mount(fakeEngine(false));
    ground.set(true);
    await settle();
    expect(ground.running()).toBe(false);
    expect(document.documentElement.dataset["backgroundAnimation"]).toBeUndefined();
    saidNothing(said);
  });

  it("when starting it throws, or it will not load", async () => {
    motionQuery(false);
    const said = quietly();
    const throwing = { start: vi.fn(), runs: [], load: vi.fn(async () => (() => { throw new Error("no context"); }) as StartDrift) };
    const first = mountGround({ body: document.body, root: document.documentElement, load: throwing.load });
    first.set(true);
    const missing = mountGround({ body: document.body, root: document.documentElement, load: () => Promise.reject(new Error("no chunk")) });
    missing.set(true);
    await settle();
    expect(first.running()).toBe(false);
    expect(missing.running()).toBe(false);
    expect(document.documentElement.dataset["backgroundAnimation"]).toBeUndefined();
    saidNothing(said);
  });

  it("when its destroy throws on the way off", async () => {
    motionQuery(false);
    const engine = fakeEngine();
    const { ground } = mount(engine);
    ground.set(true);
    await settle();
    engine.runs[0]!.destroy.mockImplementation(() => {
      throw new Error("lost context");
    });
    expect(() => ground.set(false)).not.toThrow();
    expect(document.documentElement.dataset["backgroundAnimation"]).toBeUndefined();
  });

  it("with the real engine, where there is no WebGL2: nothing drawn, nothing said, the layer left empty", async () => {
    motionQuery(false);
    const said = quietly();
    const rejections: unknown[] = [];
    const onRejection = (event: PromiseRejectionEvent): void => void rejections.push(event.reason);
    window.addEventListener("unhandledrejection", onRejection);
    const ground = mountGround({ body: document.body, root: document.documentElement });
    ground.set(true);
    await vi.waitFor(async () => {
      // The engine's own chunk has loaded and answered.
      const { startDrift } = await import("../../app/src/background/drift-engine.ts");
      expect(startDrift(document.createElement("div"))).toBeUndefined();
    });
    await settle();
    expect(ground.running()).toBe(false);
    expect(document.querySelector(".drift-ground")!.childElementCount).toBe(0);
    expect(document.documentElement.dataset["backgroundAnimation"]).toBeUndefined();
    ground.set(false);
    window.removeEventListener("unhandledrejection", onRejection);
    expect(rejections).toEqual([]);
    saidNothing(said);
  });
});

describe("offline, and only as open as it must be", () => {
  const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it.each(["ground.ts", "drift-engine.ts"])("app/src/background/%s makes no network request", (name) => {
    const text = code(readFileSync(`app/src/background/${name}`, "utf8"));
    expect(text).not.toMatch(/\bfetch\s*\(/);
    expect(text).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("imports the engine in one file, and only Drift and the background from its kit", () => {
    const engine = readFileSync("app/src/background/drift-engine.ts", "utf8");
    expect([...engine.matchAll(/from "(asciify-engine[^"]*)"/g)].map((found) => found[1])).toEqual(["asciify-engine/kit"]);
    expect(engine).toMatch(/import \{ background, drift \} from "asciify-engine\/kit";/);
    expect(readFileSync("app/src/background/ground.ts", "utf8")).not.toMatch(/from "asciify-engine/);
  });

  it("lets the window start the engine's worker from its own blob, and loosens nothing else", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as { app: { security: { csp: string } } };
    const policy = Object.fromEntries(
      config.app.security.csp.split(";").map((part) => {
        const [name, ...sources] = part.trim().split(/\s+/);
        return [name!, sources];
      }),
    );
    expect(policy["worker-src"]).toEqual(["'self'", "blob:"]);
    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["script-src"]).toBeUndefined();
    // The one address it had before: Tauri's own bridge to the app.
    expect(config.app.security.csp.replace("http://ipc.localhost", "")).not.toMatch(/unsafe-eval|https?:|\*/);
  });
});
