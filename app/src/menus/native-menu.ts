/**
 * No right-click menu of the system's, anywhere in Write-ist (ADR-0034).
 *
 * The webview offers its own menu — Reload, Inspect, Look Up, Back — on a
 * right-click wherever a page does not stop it, and it differs on each of the
 * three webviews (ADR-0001). The paper, the name pill and a row of Open
 * Project draw Write-ist's own menu and stop the webview's there; everywhere
 * else (Home, the desk around the paper, the panels, the dialogs, Settings,
 * empty chrome, and text fields) nothing opens at all.
 *
 * **One listener, on the window, in the capture phase**, so it hears every
 * right-click before anything else and before any handler can stop it on the
 * way. It only cancels the webview's menu: it does not stop the event, so
 * Write-ist's own menus still hear it and open as they did.
 */

/** Cancel the webview's own right-click menu everywhere in `target`. Answers how to stop. */
export function suppressNativeMenus(target: Window = window): () => void {
  const cancel = (event: Event): void => event.preventDefault();
  target.addEventListener("contextmenu", cancel, { capture: true });
  return () => target.removeEventListener("contextmenu", cancel, { capture: true });
}
