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
 * a column of items, each with its letter. Its ASCII animation and its typed
 * tagline are its feel rather than its shape, and its taglines are the
 * writer's own words to add if he wants them; the palette and the typefaces
 * here are ADR-0030's.
 */
import { element } from "./element.ts";
import { menu } from "./menu.ts";
import type { Gesture } from "./shortcuts.ts";
import { trouble as troublePanel } from "./trouble.ts";

export interface HomeScreen {
  /** To the Open Project screen, which is where a project comes from. */
  readonly onOpenProject: () => void;
  readonly onQuit: () => void;
  /** Something went wrong, in words the writer can act on. */
  readonly trouble?: string;
}

/** Draw the home screen, and return the gestures the window answers to. */
export function renderHome(into: HTMLElement, screen: HomeScreen): readonly Gesture[] {
  const gestures: readonly Gesture[] = [
    { label: "Open Project", key: "o", act: screen.onOpenProject },
    { label: "Quit", key: "q", act: screen.onQuit },
  ];

  into.replaceChildren(
    element("div", { className: "composition" }, [
      element("h1", { className: "wordmark", textContent: "Write-ist" }),
      menu(gestures),
      ...(screen.trouble === undefined ? [] : [troublePanel(screen.trouble)]),
    ]),
  );

  return gestures;
}
