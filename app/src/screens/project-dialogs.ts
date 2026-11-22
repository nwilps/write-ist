/**
 * Edit Project Details and Delete Project: the two dialogs the Open Project
 * screen's right-click menu opens, for the project that was right-clicked.
 * Edit Project Details is also the open project's (File ▸ Edit Project
 * Details… and a click on the name pill): its name, type, target page count
 * and workspaces, a new name following the rename's own rules
 * (`src/project/rename.ts`). Exile Project is Settings ▸ Graveyard's, for a
 * project already deleted.
 *
 * Both are the New Project dialog's look (ADR-0042) and its manners, from the
 * same shared button and keys: a modal `<dialog>`, so Escape cancels and the
 * screen behind hears nothing; Cancel [Esc] on the left and the action [Enter]
 * on the right; a failure said inside the dialog in the writer's words, with
 * the dialog left open; and nothing to press twice while the disk is answering. What is done on disk is the
 * project layer's (`src/project/details.ts`, `src/project/delete.ts`).
 */
import { createElement, TriangleAlert } from "lucide";
import type { Project } from "../../../src/project/bundle.ts";
import {
  CannotEditDetails,
  readDetails,
  saveProjectDetails,
  workspaceShown,
  type ProjectDetails,
  type WantedDetails,
} from "../../../src/project/details.ts";
import type { Filesystem } from "../../../src/project/filesystem.ts";
import { FORMATS, type ProjectFormat } from "../../../src/project/marker.ts";
import { MOST_PAGES, wholeNumber } from "../../../src/settings/settings.ts";
import { dialogAction } from "./dialog-action.ts";
import { dialogKeys, enterSubmits, type DialogKeys } from "./dialog-keys.ts";
import { dialogSelect } from "./dialog-select.ts";
import { dialogToggle, type DialogToggle } from "./dialog-toggle.ts";
import { element } from "./element.ts";
import { chevron, field } from "./new-project.ts";
import { message, trouble as troublePanel } from "./trouble.ts";

/**
 * Do it. Resolves to words for the writer when it could not be done — the
 * dialog stays open with them — and to nothing when it was, and it closes.
 */
type Attempt = () => Promise<string | undefined>;

/** What editing a project's details needs of the application, wherever it was asked for. */
export interface RenamePorts {
  readonly filesystem: Filesystem;
  readonly projectsDirectory: () => Promise<string>;
  /** Read the list of projects again, so that it is true when next shown. */
  readonly reread: () => Promise<void>;
}

/** What differs between editing a project's details from Open Project and from the open project. */
export interface RenameRoute {
  /** Where the dialog goes. */
  readonly into: HTMLElement;
  /** Run the move, at a moment that is safe for whatever has the project open. */
  readonly carryOut: (move: () => Promise<Project>) => Promise<Project>;
  /** The project was renamed, and this is the project as it now is. */
  readonly renamed: (project: Project) => void;
  /** The dialog is gone, however it went. */
  readonly closed: () => void;
}

// --- Edit Project Details ----------------------------------------------------------

/** A workspace as Edit Project Details offers it: from the registry, by its manifest. */
export interface WorkspaceChoice {
  readonly id: string;
  readonly name: string;
  /** Shown in every project, so not offered (the Editor). */
  readonly alwaysOn: boolean;
}

export interface ProjectDetailsDialog {
  readonly project: Project;
  /** The details as the project's folder holds them now. */
  readonly details: ProjectDetails;
  /** Every workspace the application offers, in the workspace bar's order. */
  readonly workspaces: readonly WorkspaceChoice[];
  /** Save it all. Words for the writer when it could not be; nothing when it was, and the dialog closes. */
  readonly onSave: (wanted: WantedDetails) => Promise<string | undefined>;
  readonly onClose: () => void;
}

/**
 * The target page count as typed, put right quietly, as Goals and Settings
 * put a number right: blank is no target (0), a fraction is rounded, and too
 * large is the largest. Never a refusal.
 */
export function targetPagesFrom(typed: string, fallback: number): number {
  return typed.trim() === "" ? 0 : wholeNumber(typed, 0, MOST_PAGES, fallback);
}

/**
 * Edit Project Details: the project's name, its type within its surface, its
 * target page count and which workspaces it shows. New Project's look and
 * manners: Confirm [Enter] saves the lot, Cancel [Esc] changes
 * nothing, and a refusal is said inside it with the dialog left open.
 */
export function showProjectDetails(
  into: HTMLElement,
  { project, details, workspaces, onSave, onClose }: ProjectDetailsDialog,
): HTMLDialogElement {
  const name = element("input", {
    id: "project-details-name",
    className: "new-project-dialog__input",
    type: "text",
    value: project.marker.name,
    autocomplete: "off",
    spellcheck: false,
  });
  // Only this surface's types: a screenplay can change format, never surface (ADR-0005).
  const type = dialogSelect({
    id: "project-details-type",
    label: "Project type",
    choices: FORMATS.map((format) => ({ value: format, label: format })),
    onChange: () => shown.settle(),
  });
  type.set(project.marker.format);

  const pages = element("input", {
    id: "project-details-pages",
    className: "new-project-dialog__input settings__number",
    type: "number",
    step: "1",
    min: "0",
    max: String(MOST_PAGES),
    placeholder: "None",
    autocomplete: "off",
  });
  let targetPages = details.targetPages;
  const showPages = (): void => void (pages.value = targetPages === 0 ? "" : String(targetPages));
  showPages();
  const settlePages = (): void => {
    targetPages = targetPagesFrom(pages.value, targetPages);
    showPages();
    shown.settle();
  };
  pages.addEventListener("change", settlePages);

  // A switch for each workspace a project may do without. The Editor is in
  // every project, so it is not listed at all (Noah).
  let workspacesTouched = false;
  const always = workspaces.filter((workspace) => workspace.alwaysOn).map((workspace) => workspace.id);
  const optional = workspaces.filter((workspace) => !workspace.alwaysOn);
  const switches: [WorkspaceChoice, DialogToggle][] = optional.map((workspace) => {
    const toggle = dialogToggle({
      id: `project-details-workspace-${workspace.id}`,
      onChange: () => {
        workspacesTouched = true;
        shown.settle();
      },
    });
    toggle.set(workspaceShown(details, workspace.id, false));
    return [workspace, toggle];
  });
  const switchRow = ([workspace, toggle]: [WorkspaceChoice, DialogToggle]): HTMLElement =>
    element("div", { className: "settings__switch" }, [
      element("label", { htmlFor: toggle.control.id, className: "new-project-dialog__label", textContent: workspace.name }),
      toggle.control,
    ]);

  /** What the dialog says now. The workspaces stay "every one" until the writer changes one. */
  const wanted = (): WantedDetails => {
    const offered = new Set(workspaces.map((workspace) => workspace.id));
    return {
      name: name.value,
      format: type.value() as ProjectFormat,
      details: {
        targetPages,
        workspaces: workspacesTouched
          ? [
              // The ones always shown are written as shown, as they always were.
              ...always,
              ...switches.filter(([, toggle]) => toggle.on()).map(([workspace]) => workspace.id),
              // One this version does not offer stays as the project had it.
              ...(details.workspaces ?? []).filter((id) => !offered.has(id)),
            ]
          : details.workspaces,
      },
    };
  };
  const changed = (): boolean => {
    const now = wanted();
    const sameWorkspaces = switches.every(
      ([workspace, toggle]) => toggle.on() === workspaceShown(details, workspace.id, false),
    );
    return (
      now.name.trim() !== project.marker.name ||
      now.format !== project.marker.format ||
      now.details.targetPages !== details.targetPages ||
      !sameWorkspaces
    );
  };

  const shown = dialog(into, {
    label: "Edit Project Details",
    body: [
      field("Project name", name),
      field("Project type", type.control, [chevron(), type.tray]),
      element("div", { className: "new-project-dialog__field" }, [
        element("label", { htmlFor: pages.id, className: "new-project-dialog__label", textContent: "Target page count" }),
        element("div", { className: "settings__line" }, [pages, element("span", { className: "settings__unit", textContent: "pages" })]),
      ]),
      ...(switches.length === 0
        ? []
        : [
            element("div", { className: "new-project-dialog__field" }, [
              element("h3", { className: "new-project-dialog__label settings__subheading", textContent: "Workspaces" }),
              ...switches.map(switchRow),
            ]),
          ]),
    ],
    stops: [name, type.control, pages, ...switches.map(([, toggle]) => toggle.control)],
    confirm: "Confirm",
    ready: () => name.value.trim() !== "" && changed(),
    attempt: () => {
      // Enter in the number box submits before its `change` would put it right.
      targetPages = targetPagesFrom(pages.value, targetPages);
      showPages();
      return onSave(wanted());
    },
    failed: "The project's details could not be saved, so nothing was changed.",
    resume: () => shown.keys.edit(name),
    onClose,
  });
  name.addEventListener("input", shown.settle);
  pages.addEventListener("input", () => {
    // Settled as typed for Confirm, and put right when the box is left.
    targetPages = targetPagesFrom(pages.value, targetPages);
    shown.settle();
  });
  shown.modal.classList.add("project-details");
  shown.keys.edit(name);
  name.select();
  return shown.modal;
}

/** Edit Project Details, from Open Project or the open project: where the dialog goes, and what follows a save. */
export interface ProjectDetailsRoute extends RenameRoute {
  /** Saved: these are the project's details now (the workspaces it shows among them). */
  readonly detailsChanged: (details: ProjectDetails) => void;
}

export interface ProjectDetailsPorts extends RenamePorts {
  /** Every workspace the application offers (the registry's). */
  readonly workspaces: readonly WorkspaceChoice[];
}

/**
 * The one way a project's details are edited (`src/project/details.ts`), in a
 * dialog over Open Project or the open project. Read from its folder first, so the dialog
 * starts from what is on disk; saved inside `carryOut`, so a rename's move
 * fits between the Editor's writes. Nothing opens over another dialog.
 */
export function askToEditProjectDetails(ports: ProjectDetailsPorts, project: Project, route: ProjectDetailsRoute): void {
  if (document.querySelector("dialog[open]") !== null) return;
  void readDetails(ports.filesystem, project.path).then(({ details }) => {
    if (document.querySelector("dialog[open]") !== null) return;
    showProjectDetails(route.into, {
      project,
      details,
      workspaces: ports.workspaces,
      onSave: async (wanted) => {
        let wrong: string | undefined;
        try {
          const directory = await ports.projectsDirectory();
          let saved: ProjectDetails = details;
          const now = await route.carryOut(async () => {
            const done = await saveProjectDetails(ports.filesystem, directory, project, wanted);
            saved = done.details;
            return done.project;
          });
          route.renamed(now);
          route.detailsChanged(saved);
        } catch (error) {
          wrong =
            error instanceof CannotEditDetails
              ? error.message
              : `The project's details could not be saved, so nothing was changed. ${message(error)}`;
        }
        await ports.reread();
        return wrong;
      },
      onClose: route.closed,
    });
  });
}

export interface DeleteProjectDialog {
  readonly project: Project;
  readonly onDelete: () => Promise<string | undefined>;
  readonly onClose: () => void;
}

/** Ask before a project is moved to the Graveyard, and say that is all it is. */
export function showDeleteProject(
  into: HTMLElement,
  { project, onDelete, onClose }: DeleteProjectDialog,
): HTMLDialogElement {
  const shown = dialog(into, {
    label: "Delete Project",
    body: [
      element("div", { className: "project-dialog__message" }, [
        element("p", {
          className: "project-dialog__line project-dialog__line--lead",
          textContent: `Delete "${project.marker.name}"?`,
        }),
        element("p", {
          className: "project-dialog__line",
          textContent:
            "This will NOT permanently delete your project, but move it to the Graveyard. You may access your Graveyard in Settings.",
        }),
      ]),
    ],
    stops: [],
    confirm: "Move to Graveyard",
    ready: () => true,
    attempt: onDelete,
    failed: `“${project.marker.name}” could not be moved, so it is where it was.`,
    resume: () => shown.confirm.focus(),
    onClose,
  });
  // Focus on the action whose key the label shows, as New Project's title does.
  shown.confirm.focus();
  return shown.modal;
}

export interface ExileProjectDialog {
  /** The project's name, as the Graveyard lists it. */
  readonly name: string;
  /**
   * Erase it for good (`src/project/exile.ts`). Resolves to words for the
   * writer when it was refused; the dialog then stays, with them.
   */
  readonly onExile: () => Promise<string | undefined>;
  readonly onClose: () => void;
}

/**
 * Ask before a project in the Graveyard is erased forever (Settings ▸
 * Graveyard). Delete Project's dialog, dressed in the alarm colour so it reads
 * as the serious one: Cancel [Esc] is where focus starts, and Exile [Enter]
 * is the only way through.
 */
export function showExileProject(
  into: HTMLElement,
  { name, onExile, onClose }: ExileProjectDialog,
): HTMLDialogElement {
  const warning = createElement(TriangleAlert, { class: "project-dialog__alarm-icon" });
  warning.setAttribute("aria-hidden", "true");
  const shown = dialog(into, {
    label: "Exile Project",
    body: [
      element("div", { className: "project-dialog__message project-dialog__message--alarm" }, [
        warning,
        element("p", {
          className: "project-dialog__line project-dialog__line--lead",
          textContent: `Exile "${name}"?`,
        }),
        element("p", {
          className: "project-dialog__line",
          textContent: "This permanently deletes the project. It cannot be recovered.",
        }),
        element("p", {
          className: "project-dialog__line",
          textContent: "Your writing history for it stays in your metrics.",
        }),
      ]),
    ],
    stops: [],
    confirm: "Exile",
    ready: () => true,
    attempt: onExile,
    failed: `“${name}” could not be exiled, so it is still in the Graveyard.`,
    resume: () => shown.cancel.focus(),
    onClose,
  });
  shown.modal.classList.add("project-dialog--alarm");
  shown.confirm.classList.add("project-dialog__alarm-action");
  // Cancel first: the safe answer is the one under the writer's hand.
  shown.cancel.focus();
  return shown.modal;
}

interface DialogSpec {
  readonly label: string;
  readonly body: readonly HTMLElement[];
  /** What the keys visit above the buttons, top to bottom. */
  readonly stops: readonly HTMLElement[];
  readonly confirm: string;
  readonly ready: () => boolean;
  readonly attempt: Attempt;
  /** Said before the reason, when the attempt throws rather than answers. */
  readonly failed: string;
  /** Put focus back after a failure: the buttons were disabled, and it was lost. */
  readonly resume: () => void;
  readonly onClose: () => void;
}

interface ShownDialog {
  readonly modal: HTMLDialogElement;
  readonly confirm: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
  readonly keys: DialogKeys;
  readonly settle: () => void;
}

function dialog(into: HTMLElement, spec: DialogSpec): ShownDialog {
  const confirm = dialogAction(spec.confirm, "Enter", "submit");
  const cancel = dialogAction("Cancel", "Esc", "button");
  const problem = element("div", { className: "new-project__problem" });
  const form = element("form", { className: "new-project-dialog__form" }, [
    ...spec.body,
    problem,
    element("div", { className: "new-project-dialog__actions" }, [cancel, confirm]),
  ]);
  // No heading, as New Project has none; the dialog is still named.
  const modal = element("dialog", { className: "new-project-dialog project-dialog", ariaLabel: spec.label }, [form]);
  const keys = dialogKeys(modal, [...spec.stops.map((stop) => [stop]), [cancel, confirm]]);

  let working = false;
  const settle = (): void => {
    problem.replaceChildren();
    confirm.disabled = working || !spec.ready();
    cancel.disabled = working;
  };
  const say = (words: string): void => {
    problem.replaceChildren(troublePanel(words));
    spec.resume();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // Enter in a field submits even when the button is disabled.
    if (working || !spec.ready()) return;
    working = true;
    settle();
    spec.attempt().then(
      (wrong) => {
        working = false;
        if (wrong === undefined) {
          modal.close();
          return;
        }
        settle();
        say(wrong);
      },
      (error: unknown) => {
        working = false;
        settle();
        say(`${spec.failed} ${message(error)}`);
      },
    );
  });
  enterSubmits(modal, form);
  cancel.addEventListener("click", () => modal.close());
  // Escape closes a dialog natively; not while the disk is still answering.
  modal.addEventListener("cancel", (event) => {
    if (working) event.preventDefault();
  });
  modal.addEventListener("close", () => {
    modal.remove();
    spec.onClose();
  });

  into.append(modal);
  modal.showModal();
  settle();
  return { modal, confirm, cancel, keys, settle };
}
