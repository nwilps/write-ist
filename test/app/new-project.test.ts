/**
 * The New Project button on the home screen, and the dialog it opens.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("Home, as designed", () => {
  it("draws the tagline, a rule above and below the menu, and selects the first row", () => {
    const into = document.createElement("div");
    renderHome(into, { onNewProject: () => {}, onOpenProject: () => {}, onQuit: () => {} });
    expect(into.querySelector(".tagline")!.textContent).toBe("A calm place to write.");
    const rules = [...into.querySelectorAll(".home-rule")];
    expect(rules.map((r) => r.textContent)).toEqual(["\u2500".repeat(42), "\u2500".repeat(42)]);
    expect(into.querySelector(".menu")!.classList.contains("menu--home")).toBe(true);
    // Rule, menu, rule: in that order.
    const order = [...into.querySelector(".composition")!.children].map((c) => c.className.split(" ")[0]);
    expect(order).toEqual(["wordmark", "tagline", "home-rule", "menu", "home-rule"]);
  });
});

describe("Open Project", () => {
  it("keeps the old menu look, not the home screen's", () => {
    const into = document.createElement("div");
    renderOpenProject(into, {
      listing: { projects: [], unreadable: [] },
      importing: false,
      onImport: () => {},
      onOpen: () => {},
      onBack: () => {},
    });
    expect(into.querySelector(".menu--home")).toBeNull();
    expect(into.querySelector(".home-rule")).toBeNull();
  });

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
  const create = modal.querySelector(".new-project-dialog__action--confirm") as HTMLButtonElement;
  const cancel = modal.querySelector(".new-project-dialog__action:not(.new-project-dialog__action--confirm)") as HTMLButtonElement;
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

  it("keeps Confirm disabled until a title is entered", () => {
    const { create, type_ } = dialog();
    expect(create.disabled).toBe(true);
    type_("   ");
    expect(create.disabled).toBe(true);
    type_("Big Fish");
    expect(create.disabled).toBe(false);
  });

  it("has no heading, and labels its two buttons with their keys, Cancel first", () => {
    const { modal, create, cancel } = dialog();
    expect(modal.querySelector("h1, h2, h3")).toBeNull();
    expect(modal.getAttribute("aria-label")).toBe("New Project");
    expect([...modal.querySelectorAll("label")].map((l) => l.textContent)).toEqual([
      "Project type",
      "Project title",
    ]);
    expect(cancel.textContent).toBe(">Cancel[Esc]");
    expect(create.textContent).toBe(">Confirm[Enter]");
    const buttons = [...modal.querySelectorAll("button")];
    expect(buttons).toEqual([cancel, create]);
  });

  it("hints Untitled without pre-filling it", () => {
    const { title } = dialog();
    expect(title.placeholder).toBe("Untitled");
    expect(title.value).toBe("");
  });

  it("confirms on Enter in the title, and rejects Enter when it is empty", async () => {
    const { modal, title, type_, onCreate, onClose } = dialog();
    const enter = () =>
      title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    enter();
    expect(onCreate).not.toHaveBeenCalled();
    type_("Big Fish");
    enter();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith({ type: "Screenplay", title: "Big Fish" });
    expect(modal.hasAttribute("open")).toBe(false);
  });

  it("cancels on Escape, creating nothing", () => {
    const { modal, onCreate, onClose } = dialog();
    const escape = new Event("cancel", { cancelable: true });
    modal.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    modal.close();
    expect(onClose).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
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

describe("the dialogs that share the old New Project styles", () => {
  const css = (name: string) => readFileSync(join(import.meta.dirname, "..", "..", "app", "src", "style", name), "utf8");

  it("still have the classes the New Project redesign left alone", () => {
    const app = css("app.css");
    for (const selector of [".report", ".report__heading", ".report__actions", ".new-project__form", ".field", ".field__label", ".field__input", ".new-project__actions"]) {
      expect(app).toContain(`${selector} {`);
    }
    expect(app).toContain(".report::backdrop");
  });

  it("are not styled by the redesign's stylesheet", () => {
    const home = css("home.css");
    for (const old of [".report", ".new-project__form", ".field", ".new-project__actions", ".button"]) {
      expect(home).not.toMatch(new RegExp(`^${old.replace(".", "\\.")}[\\s,{:]`, "m"));
    }
  });
});
