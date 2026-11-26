/**
 * **Sketch: a workspace that exists only in the tests** — the worked proof
 * that a new workspace plugs in with toolbox calls alone (ADR-0045). It is
 * never in the application's registry.
 *
 * It keeps a scratch text in `sketch.md` and loose sketches in a `sketches/`
 * folder, and uses one of every kind of toolbox call: it reads and saves its
 * file (autosave, the safe save, the save pill), remembers the caret, puts a
 * word count in the counts pill, adds a hotkey, opens its own right-click
 * menu, asks before deleting a sketch with the destructive confirm, checks
 * spelling with the shared dictionary, and reads two settings of its own.
 *
 * Like any workspace, it imports from the toolbox's public module and nothing
 * else of the application's (`test/app/toolbox.test.ts` checks).
 */
import { PenLine, SpellCheck, Trash2 } from "lucide";
import {
  element,
  message,
  type MenuEntry,
  type MountedWorkspace,
  type OpenFile,
  type Toolbox,
  type WorkspaceManifest,
  type WordAt,
} from "../../app/src/toolbox/index.ts";

export const SKETCH_FILE = "sketch.md";
export const SKETCH_FOLDER = "sketches";

/** What the tests read back of what Sketch did. */
export interface SketchProbe {
  toolbox: Toolbox | undefined;
  file: OpenFile | undefined;
  /** Whether its hotkey was added, and how many times it was pressed. */
  added: boolean;
  tidied: number;
  /** The settings, as last read. */
  wrap: boolean | undefined;
  guides: boolean | undefined;
  /** The misspelt words, as last checked. */
  misspelt: readonly WordAt[];
  /** Resolves when its file has been read and opened. */
  ready: Promise<void>;
}

export function sketchWorkspace(key = "4"): { readonly manifest: WorkspaceManifest; readonly probe: SketchProbe } {
  let opened: () => void = () => {};
  const probe: SketchProbe = {
    toolbox: undefined,
    file: undefined,
    added: false,
    tidied: 0,
    wrap: undefined,
    guides: undefined,
    misspelt: [],
    ready: new Promise((resolve) => (opened = resolve)),
  };

  const mount = (into: HTMLElement, toolbox: Toolbox): MountedWorkspace => {
    probe.toolbox = toolbox;
    const box = element("textarea", { className: "sketch__text", ariaLabel: "Sketch" });
    into.replaceChildren(box);
    let text = "";
    const count = (): void => {
      const words = text.split(/\s+/).filter((word) => word !== "").length;
      toolbox.pills.setStatus(`${words} ${words === 1 ? "word" : "words"}`);
    };

    // --- Files: read, then open for saving. ---
    void (async () => {
      try {
        const read = await toolbox.files.read(SKETCH_FILE);
        text = read.text;
        box.value = text;
        probe.file = toolbox.files.open(
          SKETCH_FILE,
          {
            noun: "your sketch",
            text: () => text,
            reload: (found) => {
              text = found;
              box.value = found;
              count();
            },
          },
          read,
        );
        count();
        // --- Place memory. ---
        const place = await toolbox.memory.recall();
        const caret = place?.["caret"];
        if (typeof caret === "number") box.setSelectionRange(caret, caret);
      } catch (error) {
        toolbox.report(`Write-ist could not read ${SKETCH_FILE}, so nothing has been changed. ${message(error)}`);
      }
      opened();
    })();
    box.addEventListener("input", () => {
      text = box.value;
      probe.file?.changed();
      count();
    });

    // --- Settings of its own. ---
    const readSettings = async (): Promise<void> => {
      probe.wrap = await toolbox.settings.read("wrap");
      probe.guides = await toolbox.settings.read("guides");
      box.dataset["wrap"] = String(probe.wrap);
      box.dataset["guides"] = String(probe.guides);
    };
    void readSettings();
    const stopSettings = toolbox.settings.whenChanged(() => void readSettings());

    // --- The project name pill: Edit Project Details, over the workspace. ---
    const stopDetails = toolbox.details.whenAsked(() => {
      if (into.querySelector("dialog[open]") !== null) return;
      toolbox.details.edit({ into, carryOut: (move) => (probe.file === undefined ? move() : probe.file.relocate(move)), closed: () => box.focus() });
    });

    // --- A hotkey. ---
    probe.added = toolbox.hotkeys.add({ id: "tidy", label: "Tidy Sketch", chord: { key: "j", mod: true }, act: () => probe.tidied++ }) !== undefined;

    // --- A menu of its own, and the destructive confirm. ---
    const askToDelete = (name: string): void =>
      toolbox.dialogs.confirm({
        label: "Delete Sketch",
        question: `Delete "${name}"?`,
        lines: ["This permanently deletes the sketch. It cannot be recovered."],
        confirm: "Delete",
        alarm: true,
        failed: `“${name}” could not be deleted, so it is still in your sketches.`,
        act: async () => {
          await toolbox.files.remove(`${SKETCH_FOLDER}/${name}`);
          return undefined;
        },
        closed: () => box.focus(),
      });
    const onMenu = (event: MouseEvent): void => {
      event.preventDefault();
      void (async () => {
        const sketches = (await toolbox.files.list(SKETCH_FOLDER)).filter((entry) => !entry.isFolder).map((entry) => entry.name).sort();
        const items: MenuEntry[] = [
          {
            label: "Check Spelling",
            icon: SpellCheck,
            act: () => void toolbox.spelling.check(text).then((found) => (probe.misspelt = found)),
          },
          { divider: true },
          ...sketches.map((name) => ({ label: name, icon: PenLine, act: () => {}, aside: { label: `Delete ${name}`, icon: Trash2, alarm: true, act: () => askToDelete(name) } })),
        ];
        toolbox.menus.open({ label: "Sketch", items, x: event.clientX, y: event.clientY, restoreFocus: () => box.focus() });
      })();
    };
    box.addEventListener("contextmenu", onMenu);

    const keepPlace = async (): Promise<void> => {
      try {
        await toolbox.memory.remember({ caret: box.selectionStart });
      } catch {
        // Only a place.
      }
    };

    return {
      focus: () => box.focus(),
      hide: () => {
        void probe.file?.save();
        void keepPlace();
      },
      show: () => box.focus(),
      relocate: (move) => (probe.file === undefined ? move() : probe.file.relocate(move)),
      unmount: async () => {
        if (probe.file !== undefined && !(await probe.file.leave())) return false;
        await keepPlace();
        stopSettings();
        stopDetails();
        box.removeEventListener("contextmenu", onMenu);
        return true;
      },
    };
  };

  return {
    manifest: {
      id: "sketch",
      name: "Sketch",
      key,
      icon: PenLine,
      files: [SKETCH_FILE, `${SKETCH_FOLDER}/`],
      settings: [
        { id: "wrap", label: "Wrap Lines", place: "app", default: true },
        { id: "guides", label: "Show Guides", place: "project", default: false },
      ],
      mount,
    },
    probe,
  };
}
