/**
 * Something went wrong, said on the page.
 *
 * Every screen can have trouble, so the panel is in one place. It is always
 * words the writer can act on and never a stack trace, and it is announced:
 * `docs/STANDARDS.md`, *"know which of your tools fail silently"*. A gesture
 * that quietly does nothing is the failure that rule is about — Quit did
 * exactly that until the window was given permission to close itself.
 */
import { element } from "./element.ts";

export function trouble(message: string): HTMLElement {
  // `role="alert"` so a screen reader is told without the writer going looking.
  const panel = element("p", { className: "trouble", textContent: message });
  panel.setAttribute("role", "alert");
  return panel;
}
