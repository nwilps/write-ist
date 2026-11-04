/**
 * The home screen — what Write-ist opens to.
 *
 * A short menu of what the writer can do, and nothing else. It is the calm,
 * obvious place a session starts from rather than the middle of something
 * (#37, story 10), and **it lists what exists**: when a project can be made
 * from nothing, or there are settings to change, they arrive here as further
 * gestures. Nothing is drawn for them now.
 *
 * Shape and flow are v1's `HomeScreen` — a centred composition, a wordmark and
 * a column of items, each with its letter. Its typed tagline is here too, as
 * the ghostwriter (`ghostwriter.ts`); its ASCII animation is not. The palette and the typefaces
 * here are ADR-0030's. The look — one typeface, a rule above and below, the
 * first row selected — is the home design's (ADR-0042).
 */
import { element } from "./element.ts";
import {
  createGhostwriter,
  STATIC_TAGLINE,
  type GhostState,
  type Timer,
} from "./ghostwriter.ts";
import { LOGO } from "./logo.ts";
import { menu, navigable } from "./menu.ts";
import type { Gesture, KeyPress } from "./shortcuts.ts";
import { trouble as troublePanel } from "./trouble.ts";

export interface HomeScreen {
  /** Ask for a new, empty project (a dialog over this screen). */
  readonly onNewProject: () => void;
  /** To the Open Project screen, which is where a project comes from. */
  readonly onOpenProject: () => void;
  readonly onQuit: () => void;
  /** Something went wrong, in words the writer can act on. */
  readonly trouble?: string;
  /** Chance, time and motion, handed in so a test can script them. Real ones by default. */
  readonly ghostwriter?: {
    readonly random?: () => number;
    readonly timer?: Timer;
    /** True shows the tagline still; by default the writer's `prefers-reduced-motion`. */
    readonly reducedMotion?: boolean;
  };
}

/** The line above and below the menu: 42 box-drawing dashes, as drawn. */
const RULE_LENGTH = 42;

function rule(): HTMLElement {
  return element("div", {
    className: "home-rule",
    ariaHidden: "true",
    textContent: "\u2500".repeat(RULE_LENGTH),
  });
}

/** The home screen as drawn: its letters, and what the arrow keys and Enter do. */
export interface DrawnHome {
  readonly gestures: readonly Gesture[];
  /** Answer a key press; true when it moved the highlight or acted on it. */
  readonly navigate: (press: KeyPress) => boolean;
  /** Put the tagline's timers away; called when the screen is left. */
  readonly stop: () => void;
}

/** Draw the home screen, and return what the window answers to. */
export function renderHome(into: HTMLElement, screen: HomeScreen): DrawnHome {
  const gestures: readonly Gesture[] = [
    { label: "New Project", key: "n", act: screen.onNewProject },
    { label: "Open Project", key: "o", act: screen.onOpenProject },
    // TODO(Noah's decision, ADR-0042): Metrics and Settings are drawn and do
    // nothing yet, on click or on their key. They are not `unavailable` — that
    // would disable the button and the highlight could not move through them.
    { label: "Metrics", key: "m", act: () => {} },
    { label: "Settings", key: "s", act: () => {} },
    { label: "Quit", key: "q", act: screen.onQuit },
  ];

  const list = menu(gestures, { home: true });

  const wantsLess =
    screen.ghostwriter?.reducedMotion ??
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const words = document.createTextNode(wantsLess ? STATIC_TAGLINE : "");
  // The blinking cursor is decoration, not part of the sentence.
  const cursor = element("span", { className: "tagline__cursor", ariaHidden: "true" });
  const draw = (state: GhostState): void => {
    words.data = state.text;
    cursor.classList.toggle("tagline__cursor--steady", !state.blinking);
  };
  const ghost = createGhostwriter({
    random: screen.ghostwriter?.random ?? Math.random,
    timer: screen.ghostwriter?.timer ?? {
      setTimeout: (run, ms) => window.setTimeout(run, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    },
    onChange: draw,
  });
  if (!wantsLess) ghost.start();
  into.replaceChildren(
    element("main", { className: "screen" }, [
      element("div", { className: "composition" }, [
        // The art is for the eye: the heading carries the name, the art is hidden.
        element("h1", { className: "wordmark", ariaLabel: "Write-ist" }, [
          element("pre", { className: "wordmark__art", ariaHidden: "true", textContent: LOGO }),
        ]),
        element("p", { className: "tagline" }, [words, cursor]),
        rule(),
        list,
        rule(),
        ...(screen.trouble === undefined ? [] : [troublePanel(screen.trouble)]),
      ]),
    ]),
  );

  return { gestures, navigate: navigable(list, gestures), stop: ghost.stop };
}
