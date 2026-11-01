/**
 * The shell hands a workspace the two ways out of a project — to the list of
 * projects, and Home — without the workspace knowing how a project closes.
 * The File menu's Open Project and Home items are these two; Esc is Home.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountShell } from "../../app/src/shell/shell.ts";
import type { WorkspaceContext } from "../../app/src/shell/workspace.ts";

describe("the ways out the shell gives a workspace", () => {
  it("are the application's own close routes, one for the list and one for Home", () => {
    let given: WorkspaceContext | undefined;
    const onClose = vi.fn();
    const onHome = vi.fn();
    const quiet = (): (() => void) => () => {};
    mountShell(document.createElement("div"), {
      project: { path: "/p", marker: { name: "Big Fish" } } as never,
      filesystem: {} as never,
      workspaces: [
        {
          id: "x",
          name: "X",
          key: "1",
          icon: [],
          mount: (_host, context) => {
            given = context;
            return { unmount: async () => true };
          },
        },
      ],
      onClose,
      onHome,
      whenSwitchedAway: quiet,
      whenSwitchedBack: quiet,
      chooseCopyLocation: async () => undefined,
      ledger: () => undefined,
    });
    given!.leave.toProjects();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onHome).not.toHaveBeenCalled();
    given!.leave.toHome();
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("send Esc Home, not to the list of projects", () => {
    const onClose = vi.fn();
    const onHome = vi.fn();
    const quiet = (): (() => void) => () => {};
    const { gestures } = mountShell(document.createElement("div"), {
      project: { path: "/p", marker: { name: "Big Fish" } } as never,
      filesystem: {} as never,
      workspaces: [
        { id: "x", name: "X", key: "1", icon: [], mount: () => ({ unmount: async () => true }) },
      ],
      onClose,
      onHome,
      whenSwitchedAway: quiet,
      whenSwitchedBack: quiet,
      chooseCopyLocation: async () => undefined,
      ledger: () => undefined,
    });
    const escape = gestures.find((gesture) => gesture.key === "escape");
    escape!.act();
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
