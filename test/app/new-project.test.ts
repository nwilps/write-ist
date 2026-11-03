/**
 * The New Project button on the home screen, and the dialog it opens.
 */
// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderHome } from "../../app/src/screens/home.ts";
import { renderOpenProject } from "../../app/src/screens/open-project.ts";
import { showNewProject } from "../../app/src/screens/new-project.ts";

// jsdom has no modal dialog.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

describe("Home", () => {
  it("offers New Project first, above Open Project", () => {
    const into = document.createElement("div");
    const onNewProject = vi.fn();
    const gestures = renderHome(into, { onNewProject, onOpenProject: () => {}, onQuit: () => {} });
    expect(gestures.map((g) => g.label)).toEqual(["New Project", "Open Project", "Quit"]);
    const labels = [...into.querySelectorAll(".gesture__label")].map((n) => n.textContent);
    expect(labels).toEqual(["New Project", "Open Project", "Quit"]);
    (into.querySelector("button.gesture") as HTMLButtonElement).click();
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });
});

describe("Open Project", () => {
  it("has no New Project row", () => {
    const into = document.createElement("div");
    renderOpenProject(into, {
      listing: {
        projects: [{ path: "/p/Big Fish", marker: { name: "Big Fish", formatVersion: "1", projectId: "x", format: "Feature" } }],
        unreadable: [],
      },
      importing: false,
      onImport: () => {},
      onOpen: () => {},
      onBack: () => {},
    });
    expect(into.textContent).not.toContain("New Project​");
    expect([...into.querySelectorAll("button.project")].map((b) => b.textContent)).toEqual([
      "Big FishFeature",
    ]);
  });
});

function dialog(onCreate = vi.fn(async () => undefined as string | undefined)) {
  const into = document.createElement("div");
  const onClose = vi.fn();
  const modal = showNewProject(into, { onCreate, onClose });
  const title = modal.querySelector("#new-project-title") as HTMLInputElement;
  const type = modal.querySelector("#new-project-type") as HTMLSelectElement;
  const create = [...modal.querySelectorAll("button")].find((b) => b.textContent === "Create")!;
  const cancel = [...modal.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
  const type_ = (text: string) => {
    title.value = text;
    title.dispatchEvent(new Event("input"));
  };
  const submit = () => modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  return { into, modal, title, type, create, cancel, type_, submit, onCreate, onClose };
}

describe("the New Project dialog", () => {
  it("offers Screenplay as the only project type, and a title", () => {
    const { type, title } = dialog();
    expect([...type.options].map((o) => o.value)).toEqual(["Screenplay"]);
    expect(title.value).toBe("");
  });

  it("keeps Create disabled until a title is entered", () => {
    const { create, type_ } = dialog();
    expect(create.disabled).toBe(true);
    type_("   ");
    expect(create.disabled).toBe(true);
    type_("Big Fish");
    expect(create.disabled).toBe(false);
  });

  it("does not confirm an empty title on Enter", () => {
    const { submit, onCreate } = dialog();
    submit();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("confirms with the type and the title, and closes when it was made", async () => {
    const { type_, submit, onCreate, onClose, modal } = dialog();
    type_("Big Fish");
    submit();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith({ type: "Screenplay", title: "Big Fish" });
    expect(modal.hasAttribute("open")).toBe(false);
  });

  it("says a failure plainly and stays open, so the title can be changed", async () => {
    const { type_, submit, modal, onClose, create } = dialog(vi.fn(async () => "No room on the disk."));
    type_("Big Fish");
    submit();
    await vi.waitFor(() => expect(modal.querySelector("[role=alert]")).not.toBeNull());
    expect(modal.querySelector("[role=alert]")!.textContent).toBe("No room on the disk.");
    expect(modal.hasAttribute("open")).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(create.disabled).toBe(false);
  });

  it("cancels with the Cancel button, creating nothing", () => {
    const { cancel, onCreate, onClose } = dialog();
    cancel.click();
    expect(onClose).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("is a modal dialog, so Escape cancels it natively", () => {
    const { modal, into } = dialog();
    expect(modal.tagName).toBe("DIALOG");
    expect(into.contains(modal)).toBe(true);
  });
});
