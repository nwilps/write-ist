// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  adjacentTypos,
  createGhostwriter,
  shuffledQueue,
  STATIC_TAGLINE,
  TAGLINES,
  TIMING,
  type GhostState,
  type Timer,
} from "../../app/src/screens/ghostwriter.ts";
import { renderHome } from "../../app/src/screens/home.ts";

/** A clock that only moves when told, and remembers what is waiting on it. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const waiting = new Map<number, { at: number; run: () => void }>();
  const timer: Timer = {
    setTimeout(run, ms) {
      const id = nextId++;
      waiting.set(id, { at: now + ms, run });
      return id;
    },
    clearTimeout(handle) {
      waiting.delete(handle as number);
    },
  };
  return {
    timer,
    get pending() {
      return waiting.size;
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...waiting.entries()].filter(([, w]) => w.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        waiting.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = end;
    },
  };
}

/** `Math.random` that never fumbles: just under the typo chance is never drawn. */
const steady = () => 0.5;

function play(options: { random?: () => number; taglines?: readonly string[] }) {
  const clock = fakeClock();
  const states: GhostState[] = [];
  const ghost = createGhostwriter({
    random: options.random ?? steady,
    timer: clock.timer,
    onChange: (s) => states.push(s),
    ...(options.taglines === undefined ? {} : { taglines: options.taglines }),
  });
  return { clock, states, ghost, last: () => states[states.length - 1]! };
}

describe("the ghostwriter's lines", () => {
  it("keeps v1's forty-three lines, with 'A calm place to write.' among them", () => {
    expect(TAGLINES).toHaveLength(43);
    expect(new Set(TAGLINES).size).toBe(43);
    expect(TAGLINES).toContain(STATIC_TAGLINE);
  });

  it("shuffles the whole set, and never opens a round on the line that closed the last", () => {
    const lines = ["a", "b", "c"];
    // random() = 0.999 leaves the order as given, so "a" would open again.
    const q = shuffledQueue(lines, "a", () => 0.999);
    expect([...q].sort()).toEqual(lines);
    expect(q[0]).not.toBe("a");
  });

  it("offers neighbouring keys for a typo, in the case of the key meant", () => {
    expect(adjacentTypos("q")).toEqual(["w", "a", "s"]);
    expect(adjacentTypos("Q")).toEqual(["W", "A", "S"]);
    expect(adjacentTypos("5")).toEqual([]);
    expect(adjacentTypos(" ")).toEqual([]);
  });
});

describe("the ghostwriter at work", () => {
  it("blinks on an empty line, then types the first line after the initial pause", () => {
    const { clock, states, ghost, last } = play({ taglines: ["Hi there, friend."] });
    ghost.start();
    expect(last()).toEqual({ text: "", blinking: true });
    clock.advance(TIMING.initialDelayMs - 1);
    expect(states).toHaveLength(1);
    clock.advance(1);
    expect(last()).toEqual({ text: "", blinking: false });
  });

  it("types a line, holds it blinking for eight seconds, deletes it, and types the next", () => {
    const { clock, states, ghost, last } = play({ taglines: ["Aa.", "Bb."] });
    ghost.start();
    clock.advance(TIMING.initialDelayMs + 5000);
    const first = last();
    expect(first).toEqual({ text: expect.stringMatching(/^[AB][ab]\.$/), blinking: true });
    // The typed line never shows a wrong letter at this setting (no typo is drawn).
    const typed = states.map((s) => s.text);
    expect(typed.slice(0, 5)).toEqual(["", "", first.text.slice(0, 1), first.text.slice(0, 2), first.text]);
    // Still held just before the hold ends...
    clock.advance(TIMING.holdMs - 5000 - 1);
    expect(last().text).toBe(first.text);
    // ...then it deletes, steady, to nothing, and the other line follows.
    clock.advance(3000);
    expect(states.some((s) => s.text === "" && !s.blinking)).toBe(true);
    const second = last();
    expect(second.text).toMatch(/^[AB][ab]\.$/);
    expect(second.text).not.toBe(first.text);
  });

  it("deletes the first characters slowly, then quickly", () => {
    const { clock, states, ghost, last } = play({ taglines: ["Abcdefghijkl."] });
    ghost.start();
    while (!(last().blinking && last().text === "Abcdefghijkl.")) clock.advance(1);
    clock.advance(TIMING.holdMs);
    const held = states.length; // the cursor having gone steady as deleting begins
    // The first delete lands after the slow interval (120 + 0.5 * 40 = 140ms), not the fast one.
    clock.advance(139);
    expect(states.length).toBe(held);
    clock.advance(1);
    expect(states.length).toBe(held + 1);
    // 0.5 picks 3 + floor(0.5 * 7) = 6 slow deletes, a pause, then 40ms deletes.
    clock.advance(140 * 5 + (TIMING.deleteSlowPauseMs + 60) + TIMING.deleteIntervalMs);
    const lengths = states.slice(held).map((s) => s.text.length);
    expect(lengths.slice(0, 6)).toEqual([12, 11, 10, 9, 8, 7]);
  });

  it("makes a typo, types on, notices, backspaces to before it, and lands the right letters", () => {
    // Draws, in order: shuffle (none for one line), then per character
    // typo-chance, ... A low first draw on the first letter forces a typo there.
    const script = [0.01, 0.0, 0.0];
    let i = 0;
    const random = () => (i < script.length ? script[i++]! : 0.5);
    const { clock, states, ghost, last } = play({ random, taglines: ["Write it down."] });
    ghost.start();
    clock.advance(TIMING.initialDelayMs + 20_000);
    const texts = states.map((s) => s.text);
    const wrong = texts.find((t) => t.length === 1 && t !== "" && t !== "W");
    expect(wrong).toBeDefined(); // the fumbled first letter, a neighbour of W
    expect(adjacentTypos("W")).toContain(wrong);
    // It backspaced to nothing and typed the correct letter afterwards.
    const afterTypo = texts.slice(texts.indexOf(wrong!));
    expect(afterTypo).toContain("");
    expect(texts).toContain("Write it down.");
    expect(last().blinking).toBe(true);
  });

  it("never fumbles within the last four characters, or on a space", () => {
    const target = "Go on now";
    const { clock, states, ghost } = play({ random: () => 0, taglines: [target] });
    ghost.start();
    clock.advance(TIMING.initialDelayMs + 60_000);
    let fumbles = 0;
    for (const { text } of states) {
      let at = 0;
      while (at < text.length && text[at] === target[at]) at++;
      if (at < text.length) {
        fumbles++;
        expect(target[at]).not.toBe(" ");
        expect(at).toBeLessThan(target.length - 4);
      }
    }
    expect(fumbles).toBeGreaterThan(0);
  });

  it("goes quiet when stopped: no timers left, nothing more reported", () => {
    const { clock, states, ghost } = play({ taglines: ["Aa.", "Bb."] });
    ghost.start();
    clock.advance(TIMING.initialDelayMs + 100);
    ghost.stop();
    expect(clock.pending).toBe(0);
    const n = states.length;
    clock.advance(60_000);
    expect(states).toHaveLength(n);
  });
});

describe("Home's tagline", () => {
  const screen = { onNewProject: () => {}, onOpenProject: () => {}, onQuit: () => {} };

  it("types, and a new Home after stop() leaves no timers behind", () => {
    const clock = fakeClock();
    const into = document.createElement("div");
    const home = renderHome(into, { ...screen, ghostwriter: { random: steady, timer: clock.timer, reducedMotion: false } });
    const p = into.querySelector(".tagline")!;
    expect(p.textContent).toBe("");
    clock.advance(TIMING.initialDelayMs + 30_000);
    expect(TAGLINES.some((t) => p.textContent === t)).toBe(true);
    // The cursor blinks while the line is held, and is steady while typing.
    expect(p.querySelector(".tagline__cursor--steady")).toBeNull();
    home.stop();
    expect(clock.pending).toBe(0);
  });

  it("keeps the cursor in the paragraph throughout, so the line never changes height", () => {
    const clock = fakeClock();
    const into = document.createElement("div");
    renderHome(into, { ...screen, ghostwriter: { random: steady, timer: clock.timer, reducedMotion: false } });
    const p = into.querySelector(".tagline")!;
    for (let t = 0; t < 40; t++) {
      clock.advance(500);
      expect(p.querySelectorAll(".tagline__cursor")).toHaveLength(1);
      expect(p.children).toHaveLength(1);
    }
  });

  it("shows 'A calm place to write.' still under reduced motion, with no timers", () => {
    const clock = fakeClock();
    const into = document.createElement("div");
    renderHome(into, { ...screen, ghostwriter: { timer: clock.timer, reducedMotion: true } });
    expect(into.querySelector(".tagline")!.textContent).toBe(STATIC_TAGLINE);
    expect(clock.pending).toBe(0);
  });
});
