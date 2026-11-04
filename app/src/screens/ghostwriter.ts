/**
 * The ghostwriter — the home screen's tagline, typed by an invisible hand.
 *
 * Ported from v1's `HomeScreen`, constant for constant. It types each tagline
 * with human timing, now and then fumbles a key, notices a few characters
 * later, backspaces and mends it; holds the finished line so it can be read;
 * deletes it (the first few characters slowly, the rest quickly); pauses; and
 * begins the next. The lines are played in a shuffled order, a whole round
 * before any repeats, and a new round never opens on the line that closed the
 * last.
 *
 * **Chance and time are handed in.** `random` and `timer` are parameters so
 * a test can script both and watch the result; the screen passes the real ones.
 * Nothing here touches the page: the module says what the tagline reads and
 * whether its cursor should blink, and the screen draws that.
 */

/** The lines, in the order v1 wrote them. */
export const TAGLINES: readonly string[] = [
  "A calm place to write.",
  "Your story lives here.",
  "No distractions. Just words.",
  "Write first. Edit later.",
  "The blank page, tamed.",
  "Every script starts somewhere.",
  "Put it on the page.",
  "Draft one awaits.",
  "Quiet enough to think.",
  "One line at a time.",
  "The cursor is patient.",
  "Zen is a butt in a seat.",
  "Just get it down.",
  "First drafts are supposed to be bad.",
  "There is no such thing as good writing, only good rewriting.",
  "Something from nothing.",
  "We were talking dragons, Tolkien and I...",
  "It ain't gonna write itself.",
  "Close the door. Open the file.",
  "Just you and the page.",
  "Silence is a feature.",
  "No notifications. No excuses.",
  "Hey dol! merry dol! ring a dong dillo!",
  "A story is never finished, only abandoned.",
  "Your characters are waiting.",
  "Every scene matters.",
  "Find the scene. Write the scene.",
  "The road to Hell is paved with adverbs.",
  "What happens next?",
  "Kill your darlings.",
  "Someone has to tell it.",
  "Stories want to be told.",
  "Give them something to feel.",
  "The best line is the next one.",
  "Make it true, even if it didn't happen.",
  "And then you found five dollars???",
  "Outline or chaos. Both work.",
  "Save early. Save often.",
  "It was a dark and stormy night...",
  "INT. YOUR DESK - NOW",
  "T-t-t-today, Junior!",
  "Even if it sucks.",
  "As you face trials of many kinds consider it great joy.",
];

/** The line shown still, when the writer has asked for less motion. */
export const STATIC_TAGLINE = "A calm place to write.";

/** Every pause and chance, in milliseconds or as a probability. */
export const TIMING = {
  holdMs: 8000,
  deleteIntervalMs: 40,
  deleteSlowMinChars: 3,
  deleteSlowMaxChars: 9,
  deleteSlowIntervalMs: 120,
  deleteSlowVarianceMs: 40,
  deleteSlowPauseMs: 180,
  deleteSlowPauseVarianceMs: 120,
  pauseMs: 400,
  typeBaseMs: 65,
  typeVarianceMs: 40,
  typePunctuationMs: 180,
  typeHesitationMs: 220,
  typeHesitationChance: 0.08,
  typeFloorMs: 20,
  initialDelayMs: 2000,
  typoChance: 0.06,
  typoNoticeMinChars: 0,
  typoNoticeMaxChars: 6,
  typoNoticePauseMs: 180,
  typoNoticePauseVarianceMs: 150,
  typoDeleteIntervalMs: 90,
  typoDeleteVarianceMs: 30,
} as const;

/** US QWERTY — nearby keys for fat-finger typos (lowercase letters + common punctuation). */
const ADJACENT: Readonly<Record<string, readonly string[]>> = {
  q: ["w", "a", "s"],
  w: ["q", "e", "a", "s", "d"],
  e: ["w", "r", "s", "d", "f"],
  r: ["e", "t", "d", "f", "g"],
  t: ["r", "y", "f", "g", "h"],
  y: ["t", "u", "g", "h", "j"],
  u: ["y", "i", "h", "j", "k"],
  i: ["u", "o", "j", "k", "l"],
  o: ["i", "p", "k", "l"],
  p: ["o", "l", "[", ";"],
  a: ["q", "w", "s", "z"],
  s: ["a", "w", "e", "d", "x", "z"],
  d: ["s", "e", "r", "f", "c", "x"],
  f: ["d", "r", "t", "g", "v", "c"],
  g: ["f", "t", "y", "h", "b", "v"],
  h: ["g", "y", "u", "j", "n", "b"],
  j: ["h", "u", "i", "k", "m", "n"],
  k: ["j", "i", "o", "l", "m"],
  l: ["k", "o", "p", ";", ".", "m"],
  z: ["a", "s", "x"],
  x: ["z", "s", "d", "c"],
  c: ["x", "d", "f", "v"],
  v: ["c", "f", "g", "b"],
  b: ["v", "g", "h", "n"],
  n: ["b", "h", "j", "m"],
  m: ["n", "j", "k", "l", ",", ".", "/"],
  ",": [".", "m", "k", "l"],
  ".": [",", "/", "l"],
  "!": ["1", "q", "a"],
  "?": ["/", "."],
  ")": ["(", "0", "o", "p"],
  "(": ["9", "i", "o", "p"],
  "/": [".", ","],
  "'": [";", "l", "["],
  ";": ["'", "l", ".", "p"],
  ":": [";", "l", "p"],
  "-": ["0", "p", "["],
  _: ["-", "0"],
};

const isLetter = (c: string): boolean => /[a-z]/i.test(c);

/** The wrong keys a finger could land on instead of `right`, matching its case. */
export function adjacentTypos(right: string): string[] {
  const key = isLetter(right) ? right.toLowerCase() : right;
  const raw = ADJACENT[key];
  if (raw === undefined || raw.length === 0) return [];
  const out: string[] = [];
  for (const w of raw) {
    const c =
      isLetter(right) && isLetter(w)
        ? right === right.toUpperCase()
          ? w.toUpperCase()
          : w.toLowerCase()
        : w;
    if (c !== right) out.push(c);
  }
  return out;
}

/** Fisher–Yates shuffle of `lines`; the first is never `previousLast`. */
export function shuffledQueue(
  lines: readonly string[],
  previousLast: string | null,
  random: () => number,
): string[] {
  const next = [...lines];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = next[i]!;
    next[i] = next[j]!;
    next[j] = t;
  }
  if (previousLast !== null && next.length > 1 && next[0] === previousLast) {
    const j = next.findIndex((t) => t !== previousLast);
    if (j > 0) {
      const tmp = next[0]!;
      next[0] = next[j]!;
      next[j] = tmp;
    }
  }
  return next;
}

/** The clock, as far as the ghostwriter needs one. */
export interface Timer {
  readonly setTimeout: (run: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

/** What the tagline reads, and whether its cursor blinks (it is steady while typing). */
export interface GhostState {
  readonly text: string;
  readonly blinking: boolean;
}

export interface GhostwriterOptions {
  /** Each call returns a number in [0, 1), like `Math.random`. */
  readonly random: () => number;
  readonly timer: Timer;
  readonly onChange: (state: GhostState) => void;
  readonly taglines?: readonly string[];
}

export interface Ghostwriter {
  /** Begin: the cursor blinks on an empty line, and typing starts after a pause. */
  readonly start: () => void;
  /** Cancel every pending timer. Nothing more is reported. */
  readonly stop: () => void;
}

export function createGhostwriter(options: GhostwriterOptions): Ghostwriter {
  const { random, timer, onChange } = options;
  const lines = options.taglines ?? TAGLINES;
  const T = TIMING;

  let pending: unknown;
  let hasPending = false;
  let stopped = true;

  let queue: string[] = [];
  let queueIndex = 0;
  let currentLine = "";

  function show(text: string, blinking: boolean): void {
    if (!stopped) onChange({ text, blinking });
  }

  /** Run `fn` after `ms`. Only one thing is ever waiting. */
  function after(ms: number, fn: () => void): void {
    hasPending = true;
    pending = timer.setTimeout(() => {
      hasPending = false;
      if (!stopped) fn();
    }, ms);
  }

  function clearPending(): void {
    if (hasPending) timer.clearTimeout(pending);
    hasPending = false;
  }

  function typeDelayMs(char: string): number {
    let ms = T.typeBaseMs;
    ms += (random() * 2 - 1) * T.typeVarianceMs;
    if (",.!?)".includes(char)) ms += T.typePunctuationMs;
    if (random() < T.typeHesitationChance) ms += T.typeHesitationMs;
    return Math.max(T.typeFloorMs, ms);
  }

  function hold(): void {
    show(currentLine, true);
    after(T.holdMs, beginDelete);
  }

  function beginDelete(): void {
    let current = currentLine;
    show(current, false);

    function pauseBeforeNextLine(): void {
      after(T.pauseMs, () => {
        let next = queueIndex + 1;
        if (next >= queue.length) {
          queue = shuffledQueue(lines, queue[queue.length - 1]!, random);
          next = 0;
        }
        queueIndex = next;
        beginType(queue[queueIndex]!);
      });
    }

    function fastDeletes(): void {
      if (current.length === 0) return pauseBeforeNextLine();
      after(T.deleteIntervalMs, () => {
        current = current.slice(0, -1);
        show(current, false);
        fastDeletes();
      });
    }

    function slowDeletes(remaining: number): void {
      if (remaining > 0 && current.length > 0) {
        after(T.deleteSlowIntervalMs + random() * T.deleteSlowVarianceMs, () => {
          current = current.slice(0, -1);
          show(current, false);
          slowDeletes(remaining - 1);
        });
        return;
      }
      if (current.length === 0) return pauseBeforeNextLine();
      after(T.deleteSlowPauseMs + random() * T.deleteSlowPauseVarianceMs, fastDeletes);
    }

    const slowHi = Math.min(T.deleteSlowMaxChars, current.length);
    const slowLo = Math.min(T.deleteSlowMinChars, slowHi);
    slowDeletes(slowLo + Math.floor(random() * (slowHi - slowLo + 1)));
  }

  function beginType(target: string): void {
    currentLine = target;
    let built = "";
    let targetIndex = 0;
    let correcting = false;
    show("", false);

    function noticeThenDelete(typoPos: number): void {
      after(T.typoNoticePauseMs + random() * T.typoNoticePauseVarianceMs, () => {
        const prefix = target.slice(0, typoPos);
        function deleteStep(): void {
          if (built === prefix) {
            correcting = false;
            targetIndex = typoPos;
            nextChar();
            return;
          }
          after(T.typoDeleteIntervalMs + random() * T.typoDeleteVarianceMs, () => {
            built = built.slice(0, -1);
            show(built, false);
            deleteStep();
          });
        }
        deleteStep();
      });
    }

    function typo(typoPos: number, wrong: string, nAfter: number): void {
      after(typeDelayMs(wrong), () => {
        built += wrong;
        show(built, false);
        let carry = 0;
        function typeCarried(): void {
          if (carry >= nAfter) return noticeThenDelete(typoPos);
          const ch = target[typoPos + 1 + carry]!;
          after(typeDelayMs(ch), () => {
            built += ch;
            show(built, false);
            carry++;
            typeCarried();
          });
        }
        typeCarried();
      });
    }

    function nextChar(): void {
      if (targetIndex >= target.length) return hold();
      const char = target[targetIndex]!;
      const options = adjacentTypos(char);
      const noticeHi = Math.min(T.typoNoticeMaxChars, target.length - targetIndex - 1);
      const noticeLo = T.typoNoticeMinChars;
      const canTypo =
        !correcting &&
        char !== " " &&
        targetIndex < target.length - 4 &&
        options.length > 0 &&
        noticeHi >= noticeLo &&
        random() < T.typoChance;

      if (canTypo) {
        const wrong = options[Math.floor(random() * options.length)]!;
        const nAfter = noticeLo + Math.floor(random() * (noticeHi - noticeLo + 1));
        correcting = true;
        typo(targetIndex, wrong, nAfter);
        return;
      }

      after(typeDelayMs(char), () => {
        built += char;
        targetIndex++;
        show(built, false);
        nextChar();
      });
    }

    nextChar();
  }

  return {
    start() {
      clearPending();
      stopped = false;
      queue = shuffledQueue(lines, null, random);
      queueIndex = 0;
      show("", true);
      after(T.initialDelayMs, () => beginType(queue[queueIndex]!));
    },
    stop() {
      stopped = true;
      clearPending();
    },
  };
}
