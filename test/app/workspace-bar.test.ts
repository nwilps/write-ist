/**
 * The workspace bar (the desk design, §2.3): one tab for each workspace in the
 * registry, named by its manifest, the first of them active.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mountShell } from "../../app/src/shell/shell.ts";
import type { WorkspaceManifest } from "../../app/src/shell/workspace.ts";
import { WORKSPACES } from "../../app/src/workspaces/registry.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const editor = readFileSync(join(style, "editor.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = [...editor.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.map((match) => match[1]).join("\n");
}

function shellOf(workspaces: readonly WorkspaceManifest[]): HTMLElement {
  const into = document.createElement("div");
  const quiet = (): (() => void) => () => {};
  mountShell(into, {
    project: { path: "/p", marker: { name: "Big Fish" } } as never,
    filesystem: {} as never,
    workspaces: workspaces.map((w) => ({ ...w, mount: () => ({ unmount: async () => true }) })),
    onClose: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    ledger: () => undefined,
  });
  return into;
}

describe("the workspace bar", () => {
  it("has Editor, Notes and Plan tabs, each with a Lucide icon, and Editor is the active one", () => {
    const tabs = [...shellOf(WORKSPACES).querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Editor", "Notes", "Plan"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    for (const tab of tabs) expect(tab.querySelector("svg.workspace-bar__icon")).not.toBeNull();
  });

  it("takes a tab from every manifest, never from the shell", () => {
    const second: WorkspaceManifest = { ...WORKSPACES[0]!, id: "other", name: "Elsewhere" };
    const tabs = [...shellOf([...WORKSPACES, second]).querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Editor", "Notes", "Plan", "Elsewhere"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
  });

  it("is a raised pill with a strong border and a shadow, active tab in the accent", () => {
    const pill = rule(".workspace-bar__pill");
    expect(pill).toContain("background: var(--colour-raised)");
    expect(pill).toContain("var(--colour-border-strong)");
    expect(pill).toContain("box-shadow: var(--shadow-float)");
    expect(rule('.workspace-bar__tab[aria-selected="true"]')).toContain("var(--colour-accent)");
    expect(rule(".workspace-bar__tab")).toContain("var(--colour-muted)");
  });
});
