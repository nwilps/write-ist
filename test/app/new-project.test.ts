/**
 * The New Project button: first in the project list, shaped like its rows.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderOpenProject } from "../../app/src/screens/open-project.ts";

const marker = {
  name: "Big Fish",
  formatVersion: "1",
  projectId: "x",
  format: "Feature",
} as const;
const listing = { projects: [{ path: "/p/Big Fish", marker }], unreadable: [] };

function draw(over: Partial<Parameters<typeof renderOpenProject>[1]> = {}) {
  const into = document.createElement("div");
  const onCreate = vi.fn();
  renderOpenProject(into, {
    listing,
    importing: false,
    onImport: () => {},
    onOpen: () => {},
    onBack: () => {},
    onCreate,
    ...over,
  });
  return { into, onCreate };
}

describe("New Project", () => {
  it("is the first button in the list, ahead of every project", () => {
    const { into } = draw();
    const buttons = [...into.querySelectorAll("button.project")];
    expect(
      buttons.map((b) => b.querySelector(".project__name")?.textContent),
    ).toEqual(["New Project", "Big Fish"]);
    expect(buttons[0]?.className).toContain("project");
  });

  it("is offered when there are no projects yet", () => {
    const { into } = draw({ listing: { projects: [], unreadable: [] } });
    expect(into.querySelector("button.project--new")).not.toBeNull();
  });

  it("is not offered while the folder has not been read", () => {
    const { into } = draw({ listing: undefined });
    expect(into.querySelector("button.project--new")).toBeNull();
  });

  it("asks to create on click, and is disabled while creating", () => {
    const { into, onCreate } = draw();
    (into.querySelector("button.project--new") as HTMLButtonElement).click();
    expect(onCreate).toHaveBeenCalledTimes(1);

    const busy = draw({ creating: true });
    expect(
      (busy.into.querySelector("button.project--new") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
