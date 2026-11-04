/**
 * Goals in the window (ADR-0040): the dialog, the Goal pill, and the three ways
 * in. What the numbers mean is checked in `test/goals/`; this is that the
 * window draws them and passes the writer's choices on.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountShell } from "../../app/src/shell/shell.ts";
import type { WorkspaceContext } from "../../app/src/shell/workspace.ts";
import { commandById, runCommand, type CommandHost } from "../../app/src/workspaces/editor/commands.ts";
import { openGoalsDialog } from "../../app/src/workspaces/editor/goals-dialog.ts";
import { editorMenus } from "../../app/src/workspaces/editor/menus.ts";
import { NO_GOALS } from "../../src/goals/history.ts";
import { GoalsTracker } from "../../src/goals/tracker.ts";
import { wordCount } from "../../src/project/ledger.ts";
import { wordsIn } from "../../src/screenplay/counts.ts";
import { editorStateFor } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const editorCss = readFileSync(join(style, "editor.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

afterEach(() => {
  document.body.replaceChildren();
});

/** A tracker on Tuesday 3 November 2026, and a dialog over it. */
function opened(goals = NO_GOALS) {
  const tracker = new GoalsTracker(goals, { instant: { now: () => new Date(2026, 10, 3, 21, 0) } });
  const into = document.createElement("div");
  document.body.append(into);
  const closed = vi.fn();
  const total = 12_345;
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  const modal = openGoalsDialog(into, {
    view: () => tracker.view(total),
    setDaily: (goal, weekdays) => tracker.setDaily(goal, weekdays),
    startSprint: (target) => tracker.startSprint(target),
    endSprint: () => tracker.endSprint(),
    closed,
  });
  const q = <T extends HTMLElement>(selector: string): T => modal.querySelector<T>(selector)!;
  return { tracker, modal, closed, q, into };
}
const change = (box: HTMLInputElement, value: string): void => {
  box.value = value;
  box.dispatchEvent(new Event("change"));
};
const dayButton = (modal: HTMLElement, name: string): HTMLButtonElement =>
  [...modal.querySelectorAll<HTMLButtonElement>(".goals__day")].find((button) => button.textContent === name)!;

describe("the Goals dialog", () => {
  it("shows total words, today against the goal, and the streak", () => {
    const { q } = opened({ goal: 500, weekdays: NO_GOALS.weekdays, days: new Map([["2026-11-02", 600], ["2026-11-03", 320]]) });
    const values = [...document.querySelectorAll(".goals__value")].map((node) => node.textContent);
    expect(values).toEqual(["12,345", "320 / 500", "1 day · best 1"]);
    expect(q<HTMLInputElement>("#goals-on").checked).toBe(true);
    expect(q<HTMLInputElement>("#goals-daily").value).toBe("500");
  });

  it("with no goal says the words written today and leaves the streak empty", () => {
    const { tracker } = opened();
    tracker.wordsChanged(1);
    const values = [...document.querySelectorAll(".goals__value")].map((node) => node.textContent);
    expect(values).toEqual(["12,345", "0 words", "—"]);
  });

  it("draws thirty days of bars, and a line at the goal only while there is one", () => {
    const { q, tracker } = opened({ goal: 500, weekdays: ["Mon", "Tue"], days: new Map([["2026-11-03", 250], ["2026-11-02", 500]]) });
    const bars = [...document.querySelectorAll<HTMLElement>(".goals-chart__bar")];
    expect(bars).toHaveLength(30);
    expect(bars.at(-1)!.style.getPropertyValue("--bar")).toBe("50");
    expect(bars.at(-2)!.style.getPropertyValue("--bar")).toBe("100");
    expect(bars.at(-2)!.classList.contains("goals-chart__bar--met")).toBe(true);
    expect(bars.at(-3)!.classList.contains("goals-chart__bar--idle")).toBe(true); // Sunday, not counted
    expect(bars.at(-1)!.title).toBe("Nov 3: 250 words");
    expect(q(".goals-chart__goal").hidden).toBe(false);
    expect(q(".goals-chart__goal").style.getPropertyValue("--goal-at")).toBe("100");
    tracker.setDaily(undefined, []);
    q<HTMLInputElement>("#goals-on").checked = false;
    q<HTMLInputElement>("#goals-on").dispatchEvent(new Event("change"));
    expect(q(".goals-chart__goal").hidden).toBe(true);
  });

  it("turns the goal on at 500, and off", () => {
    const { q, tracker } = opened();
    expect(q<HTMLInputElement>("#goals-daily").disabled).toBe(true);
    const on = q<HTMLInputElement>("#goals-on");
    on.checked = true;
    on.dispatchEvent(new Event("change"));
    expect(tracker.data().goal).toBe(500);
    expect(q<HTMLInputElement>("#goals-daily").disabled).toBe(false);
    on.checked = false;
    on.dispatchEvent(new Event("change"));
    expect(tracker.data().goal).toBeUndefined();
  });

  it("changes the number, and refuses one that is not a whole number of words", () => {
    const { q, tracker } = opened({ goal: 500, weekdays: NO_GOALS.weekdays, days: new Map() });
    change(q<HTMLInputElement>("#goals-daily"), "750");
    expect(tracker.data().goal).toBe(750);
    change(q<HTMLInputElement>("#goals-daily"), "0");
    expect(tracker.data().goal).toBe(750);
    expect(q(".new-project__problem").textContent).toContain("whole number of words");
    change(q<HTMLInputElement>("#goals-daily"), "12.5");
    expect(tracker.data().goal).toBe(750);
    change(q<HTMLInputElement>("#goals-daily"), "");
    expect(tracker.data().goal).toBe(750);
  });

  it("has all seven weekdays pressed to begin with, and toggles any subset", () => {
    const { modal, tracker } = opened({ goal: 500, weekdays: NO_GOALS.weekdays, days: new Map() });
    const buttons = [...modal.querySelectorAll<HTMLButtonElement>(".goals__day")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(buttons.every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    dayButton(modal, "Sat").click();
    dayButton(modal, "Sun").click();
    expect(tracker.data().weekdays).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(dayButton(modal, "Sat").getAttribute("aria-pressed")).toBe("false");
    dayButton(modal, "Sat").click();
    expect(tracker.data().weekdays).toContain("Sat");
  });

  it("starts a sprint at 500 by default, shows it, and ends it", () => {
    const { q, tracker } = opened();
    expect(q<HTMLInputElement>("#goals-sprint").value).toBe("500");
    expect(q<HTMLElement>(".goals__sprint-now").hidden).toBe(true);
    [...document.querySelectorAll<HTMLButtonElement>(".button")].find((b) => b.textContent === "Start")!.click();
    expect(tracker.view(1).sprint).toEqual({ target: 500, written: 0 });
    tracker.wordsChanged(210);
    // Redrawn by the next choice; ending needs no number.
    expect(q(".goals__sprint-now").hidden).toBe(false);
    expect(q<HTMLButtonElement>("#goals-sprint").hidden).toBe(true);
    [...document.querySelectorAll<HTMLButtonElement>(".button")].find((b) => b.textContent === "End")!.click();
    expect(tracker.view(1).sprint).toBeUndefined();
    expect(q<HTMLInputElement>("#goals-sprint").hidden).toBe(false);
  });

  it("will not start a sprint below 50", () => {
    const { q, tracker } = opened();
    q<HTMLInputElement>("#goals-sprint").value = "49";
    [...document.querySelectorAll<HTMLButtonElement>(".button")].find((b) => b.textContent === "Start")!.click();
    expect(tracker.view(1).sprint).toBeUndefined();
    expect(q(".new-project__problem").textContent).toContain("from 50");
  });

  it("is put away by Done, and says so", () => {
    const { modal, closed } = opened();
    [...modal.querySelectorAll<HTMLButtonElement>(".button")].find((b) => b.textContent === "Done")!.click();
    expect(modal.isConnected).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });
});

function shell() {
  const into = document.createElement("div");
  let given: WorkspaceContext | undefined;
  const quiet = (): (() => void) => () => {};
  mountShell(into, {
    project: { path: "/p", marker: { name: "Big Fish" } } as never,
    filesystem: {} as never,
    workspaces: [{ id: "x", name: "X", key: "1", icon: [], mount: (_h, c) => ((given = c), { unmount: async () => true }) }],
    onClose: () => {},
    onHome: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    chooseCopyLocation: async () => undefined,
    choosePdfLocation: async () => undefined,
    ledger: () => undefined,
  });
  return { into, context: given! };
}

describe("the Goal pill", () => {
  it("sits at the left beside the project's name, and is hidden until there is a goal", () => {
    const { into, context } = shell();
    const pill = into.querySelector<HTMLElement>(".pills--left .pill--goal")!;
    expect(pill.hidden).toBe(true);
    expect(pill.previousElementSibling?.classList.contains("pill--project")).toBe(true);
    context.setGoal({ text: "320 / 500 today", kind: "daily", state: "progress" });
    expect(pill.hidden).toBe(false);
    expect(pill.textContent).toBe("320 / 500 today");
    expect(pill.dataset["state"]).toBe("progress");
    context.setGoal({ text: "620 / 500 today", kind: "daily", state: "exceeded" });
    expect(pill.textContent).toBe("620 / 500 today");
    expect(pill.dataset["state"]).toBe("exceeded");
    context.setGoal(undefined);
    expect(pill.hidden).toBe(true);
  });

  it("is a pill like the others: the same class, so the same look", () => {
    const { into } = shell();
    const pill = into.querySelector(".pill--goal")!;
    expect(pill.classList.contains("pill")).toBe(true);
    // Only the button's own chrome is taken off; nothing of the pill is restyled.
    expect(editorCss).toMatch(/button\.pill\s*\{[^}]*border:\s*0/);
    expect(editorCss).toMatch(/\.pill--goal\[data-state="met"\]\s*\{[^}]*var\(--colour-affirm\)/);
  });

  it("asks for the Goals dialog when pressed, and so does the word count", () => {
    const { into, context } = shell();
    const asked = vi.fn();
    const stop = context.whenGoalsAsked(asked);
    context.setGoal({ text: "1 / 500 today", kind: "daily", state: "progress" });
    context.setStatus("Pages: ~1 / 4 | Words: 445");
    into.querySelector<HTMLElement>(".pill--goal")!.click();
    expect(asked).toHaveBeenCalledTimes(1);
    const counts = into.querySelector<HTMLElement>(".pill--counts")!;
    expect(counts.tagName).toBe("BUTTON");
    counts.click();
    expect(asked).toHaveBeenCalledTimes(2);
    stop();
    counts.click();
    expect(asked).toHaveBeenCalledTimes(2);
  });
});

describe("Edit Goals", () => {
  it("is in the Edit menu, from the command table, and opens the dialog", () => {
    const editGoals = vi.fn();
    const host = { editGoals, view: () => undefined } as unknown as CommandHost;
    const item = editorMenus(host)["Edit"]!.find((entry) => "label" in entry && entry.label === "Edit Goals…");
    expect(item).toBeDefined();
    expect(commandById("edit-goals")?.menu).toEqual({ name: "Edit", group: "goals" });
    runCommand(commandById("edit-goals")!, host);
    expect(editGoals).toHaveBeenCalledOnce();
  });
});

describe("the words counted", () => {
  it("leave out the title page, as the ledger does", () => {
    const withTitle = parse("Title: Big Fish\nAuthor: Someone Else Entirely\n\nINT. KITCHEN - NIGHT\n\nRain on the glass.\n");
    // "INT. KITCHEN - NIGHT" is four words and "Rain on the glass." four more.
    expect(wordsIn(editorStateFor(withTitle).doc)).toBe(8);
    expect(wordsIn(editorStateFor(withTitle).doc)).toBe(wordCount(withTitle));
  });
});
