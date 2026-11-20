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
});

/** An engine that draws nothing and remembers everything. */
function fakeEngine(draws = true) {
  const runs: { host: HTMLElement; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];
  const start = vi.fn<StartDrift>((host) => {
    if (!draws) return undefined;
    const run = { host, play: vi.fn(), pause: vi.fn(), destroy: vi.fn() };
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
