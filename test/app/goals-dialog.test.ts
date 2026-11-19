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
import { showDeleteProject, showRenameProject } from "../../app/src/screens/project-dialogs.ts";
import { mountShell } from "../../app/src/shell/shell.ts";
import type { WorkspaceContext } from "../../app/src/shell/workspace.ts";
import { commandById, runCommand, type CommandHost } from "../../app/src/workspaces/editor/commands.ts";
import { openExportDialog } from "../../app/src/workspaces/editor/export-dialog.ts";
import { openGoalsDialog } from "../../app/src/workspaces/editor/goals-dialog.ts";
import { openTitlePageDialog } from "../../app/src/workspaces/editor/title-page-dialog.ts";
import { editorMenus } from "../../app/src/workspaces/editor/menus.ts";
import { WEEKDAYS } from "../../src/goals/day.ts";
import { NO_GOALS } from "../../src/goals/history.ts";
import { GoalsTracker } from "../../src/goals/tracker.ts";
import { EXPORT_FORMATS } from "../../src/project/export-formats.ts";
import { wordCount } from "../../src/project/ledger.ts";
import { wordsIn } from "../../src/screenplay/counts.ts";
import { editorStateFor } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const css = (name: string): string => readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const editorCss = css("editor.css");
const SUNDAY_FIRST = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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
/** A key pressed on whatever holds the focus. */
const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  document.activeElement!.dispatchEvent(event);
  return event;
};
/** Escape as the webview treats it: the `<dialog>` cancels unless the key was used. */
const escape = (modal: HTMLDialogElement): void => {
  const event = press("Escape");
  const cancel = new Event("cancel", { cancelable: true });
  modal.dispatchEvent(cancel);
  if (!event.defaultPrevented && !cancel.defaultPrevented) modal.close();
};
/** The writer types in the box that has the focus. */
const typeIn = (box: HTMLInputElement, value: string): void => {
  box.value = value;
  box.dispatchEvent(new Event("input", { bubbles: true }));
};
const action = (modal: HTMLElement, label: string): HTMLButtonElement =>
  [...modal.querySelectorAll<HTMLButtonElement>(".dialog-action")].find((button) => button.querySelector("span:not(.gesture__cursor)")?.textContent === label)!;
const WITH_GOAL = { goal: 500, weekdays: NO_GOALS.weekdays, days: new Map<string, number>() };
const change = (box: HTMLInputElement, value: string): void => {
  box.value = value;
  box.dispatchEvent(new Event("change"));
};
const dayButton = (modal: HTMLElement, name: string): HTMLButtonElement =>
  [...modal.querySelectorAll<HTMLButtonElement>(".goals__day")].find((button) => button.textContent === name)!;
const isOn = (toggle: HTMLElement): boolean => toggle.getAttribute("aria-checked") === "true";
/** A key's text arriving in a box, as the webview asks first; `false` if the box would not take it. */
const offer = (box: HTMLInputElement, data: string, inputType = "insertText"): boolean =>
  box.dispatchEvent(new InputEvent("beforeinput", { data, inputType, bubbles: true, cancelable: true }));
/** No message of any kind: the number boxes never say they were wrong. */
const saysNothing = (modal: HTMLElement): void => {
  expect(modal.querySelector(".new-project__problem, .trouble, [role='alert']")).toBeNull();
  expect(modal.textContent).not.toContain("whole number");
};

describe("the Goals dialog", () => {
  it("shows total words, today against the goal, and the streak", () => {
    const { q } = opened({ goal: 500, weekdays: NO_GOALS.weekdays, days: new Map([["2026-11-02", 600], ["2026-11-03", 320]]) });
    const values = [...document.querySelectorAll(".goals__value")].map((node) => node.textContent);
    expect(values).toEqual(["12,345", "320 / 500", "1 day · best 1"]);
    expect(isOn(q("#goals-on"))).toBe(true);
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
    expect(bars.at(-1)!.getAttribute("aria-label")).toBe("Nov 3: 250 words");
    expect(bars.some((bar) => bar.hasAttribute("title"))).toBe(false);
    expect(q(".goals-chart__goal").hidden).toBe(false);
    expect(q(".goals-chart__goal").style.getPropertyValue("--goal-at")).toBe("100");
    q("#goals-on").click();
    expect(tracker.data().goal).toBeUndefined();
    expect(q(".goals-chart__goal").hidden).toBe(true);
  });

  it("turns the goal on at 500, and off", () => {
    const { q, tracker } = opened();
    expect(q<HTMLInputElement>("#goals-daily").disabled).toBe(true);
    const on = q("#goals-on");
    on.click();
    expect(tracker.data().goal).toBe(500);
    expect(isOn(on)).toBe(true);
    expect(q<HTMLInputElement>("#goals-daily").disabled).toBe(false);
    on.click();
    expect(tracker.data().goal).toBeUndefined();
    expect(isOn(on)).toBe(false);
    expect(q<HTMLInputElement>("#goals-daily").disabled).toBe(true);
  });

  it("turns the goal on from its label too", () => {
    const { q, tracker } = opened();
    q('label[for="goals-on"]').click();
    expect(tracker.data().goal).toBe(500);
  });

  it("leaves the day pills disabled while the goal is off", () => {
    const { modal, q } = opened();
    expect([...modal.querySelectorAll<HTMLButtonElement>(".goals__day")].every((pill) => pill.disabled)).toBe(true);
    q("#goals-on").click();
    expect([...modal.querySelectorAll<HTMLButtonElement>(".goals__day")].some((pill) => pill.disabled)).toBe(false);
  });

  it("changes the number, rounding a fraction and capping one too large, and says nothing", () => {
    const { modal, q, tracker } = opened({ goal: 500, weekdays: NO_GOALS.weekdays, days: new Map() });
    const box = q<HTMLInputElement>("#goals-daily");
    for (const [typed, goal] of [["750", 750], ["1", 1], ["12.5", 13], ["0.5", 1], ["99.4", 99], ["100000", 100_000], ["100001", 100_000], ["250000.7", 100_000]] as const) {
      change(box, typed);
      expect(tracker.data().goal, typed).toBe(goal);
      expect(box.value, typed).toBe(String(goal));
      expect(isOn(q("#goals-on")), typed).toBe(true);
      expect(box.disabled, typed).toBe(false);
    }
    saysNothing(modal);
  });

  it("puts the last good goal back in a box left blank, and keeps the goal on", () => {
    const { modal, q, tracker } = opened({ goal: 750, weekdays: NO_GOALS.weekdays, days: new Map() });
    const box = q<HTMLInputElement>("#goals-daily");
    change(box, "");
    expect(tracker.data().goal).toBe(750);
    expect(box.value).toBe("750");
    expect(isOn(q("#goals-on"))).toBe(true);
    change(box, "800");
    change(box, "   ");
    expect(tracker.data().goal).toBe(800);
    expect(box.value).toBe("800");
    saysNothing(modal);
  });

  it("turns the goal off for anything that rounds to 0 or less, with 500 back in the box", () => {
    for (const typed of ["0.3", "0.4", "-5", "-0.5", "-100001"]) {
      const { modal, q, tracker } = opened({ goal: 750, weekdays: NO_GOALS.weekdays, days: new Map() });
      const box = q<HTMLInputElement>("#goals-daily");
      change(box, typed);
      expect(tracker.data().goal, typed).toBeUndefined();
      expect(isOn(q("#goals-on")), typed).toBe(false);
      expect(box.value, typed).toBe("500");
      saysNothing(modal);
      document.body.replaceChildren();
    }
  });

  it("takes only digits, a point and a minus as they are typed or pasted", () => {
    for (const id of ["#goals-daily", "#goals-sprint"]) {
      const { q } = opened(WITH_GOAL);
      const box = q<HTMLInputElement>(id);
      box.value = "";
      for (const taken of ["7", "0", "-", "12.5", "-3", ".5"]) expect(offer(box, taken), `${id} ${taken}`).toBe(true);
      for (const blocked of ["a", "e", "E", "x", " ", "+", ",", "1,000", "12a", "1-2", "1.2.3"]) {
        expect(offer(box, blocked), `${id} ${blocked}`).toBe(false);
        expect(offer(box, blocked, "insertFromPaste"), `${id} pasted ${blocked}`).toBe(false);
      }
      box.value = "12.5";
      expect(offer(box, "."), `${id} a second point`).toBe(false);
      expect(offer(box, "-"), `${id} a minus after the number`).toBe(false);
      expect(offer(box, "3"), id).toBe(true);
      // Taking away is never stopped.
      expect(box.dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", cancelable: true })), id).toBe(true);
      document.body.replaceChildren();
    }
  });

  it("puts back the last good goal if letters get into the box anyway", () => {
    const { modal, q, tracker } = opened({ goal: 750, weekdays: NO_GOALS.weekdays, days: new Map() });
    const box = q<HTMLInputElement>("#goals-daily");
    // A number box holding letters reads as blank, which is what the webview hands over.
    change(box, "12abc");
    expect(tracker.data().goal).toBe(750);
    expect(box.value).toBe("750");
    expect(isOn(q("#goals-on"))).toBe(true);
    saysNothing(modal);
  });

  it("turns the goal off for a daily goal of 0, with 500 back in the box", () => {
    const { q, tracker } = opened({ goal: 750, weekdays: NO_GOALS.weekdays, days: new Map() });
    const box = q<HTMLInputElement>("#goals-daily");
    change(box, "0");
    expect(tracker.data().goal).toBeUndefined();
    expect(isOn(q("#goals-on"))).toBe(false);
    expect(box.value).toBe("500");
    expect(box.disabled).toBe(true);
    q("#goals-on").click();
    expect(tracker.data().goal).toBe(500);
    expect(isOn(q("#goals-on"))).toBe(true);
    expect(box.disabled).toBe(false);
  });

  it("never leaves the box greyed out while the goal is on, whatever was typed before", () => {
    const { modal, q, tracker } = opened({ goal: 750, weekdays: NO_GOALS.weekdays, days: new Map() });
    const box = q<HTMLInputElement>("#goals-daily");
    const on = q("#goals-on");
    const pills = (): HTMLButtonElement[] => [...modal.querySelectorAll<HTMLButtonElement>(".goals__day")];
    for (const typed of ["0", "", "12.5", "100001", "-5", "0.3", "abc"]) {
      change(box, typed);
      // Off and on again, from whichever state the typing left the switch in.
      if (isOn(on)) on.click();
      expect(box.disabled, typed).toBe(true);
      on.click();
      expect(isOn(on), typed).toBe(true);
      expect(box.disabled, typed).toBe(false);
      expect(pills().some((pill) => pill.disabled), typed).toBe(false);
      expect(tracker.data().goal, typed).toBeGreaterThanOrEqual(1);
    }
  });

  it("turns the goal on at 500 when the box holds no goal, and at the rounded number when it does", () => {
    const { q, tracker } = opened({ goal: 750, weekdays: NO_GOALS.weekdays, days: new Map() });
    const box = q<HTMLInputElement>("#goals-daily");
    const on = q("#goals-on");
    on.click();
    expect(tracker.data().goal).toBeUndefined();
    for (const [typed, goal] of [["", 500], ["abc", 500], ["0", 500], ["-5", 500], ["12.5", 13], ["100001", 100_000]] as const) {
      // The box is disabled while off; this is what it holds when the switch comes on.
      box.value = typed;
      on.click();
      expect(tracker.data().goal, typed).toBe(goal);
      expect(box.value, typed).toBe(String(goal));
      expect(box.disabled, typed).toBe(false);
      on.click();
    }
  });

  it("has all seven weekdays pressed to begin with, and toggles any subset", () => {
    const { modal, tracker } = opened({ goal: 500, weekdays: NO_GOALS.weekdays, days: new Map() });
    const buttons = [...modal.querySelectorAll<HTMLButtonElement>(".goals__day")];
    expect(buttons.map((button) => button.textContent)).toEqual(SUNDAY_FIRST);
    expect(buttons.every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    dayButton(modal, "Sa").click();
    dayButton(modal, "Su").click();
    expect(tracker.data().weekdays).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(dayButton(modal, "Sa").getAttribute("aria-pressed")).toBe("false");
    dayButton(modal, "Sa").click();
    expect(tracker.data().weekdays).toContain("Sat");
  });

  it("maps each pill to its own day: only the showing is Sunday first", () => {
    const { modal, tracker } = opened(WITH_GOAL);
    expect(WEEKDAYS).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    const pairs = SUNDAY_FIRST.map((label) => {
      const before = tracker.data().weekdays;
      dayButton(modal, label).click();
      const gone = before.filter((day) => !tracker.data().weekdays.includes(day));
      dayButton(modal, label).click();
      return [label, ...gone];
    });
    expect(pairs).toEqual([["Su", "Sun"], ["Mo", "Mon"], ["Tu", "Tue"], ["We", "Wed"], ["Th", "Thu"], ["Fr", "Fri"], ["Sa", "Sat"]]);
  });

  it("names each pill in full for a screen reader", () => {
    const { modal } = opened(WITH_GOAL);
    const pill = dayButton(modal, "Th");
    expect(pill.getAttribute("aria-label") ?? pill.ariaLabel).toBe("Thursday");
  });

  it("starts a sprint at 500 by default, shows it, and ends it", () => {
    const { modal, q, tracker } = opened();
    expect(q<HTMLInputElement>("#goals-sprint").value).toBe("500");
    expect(q<HTMLElement>(".goals__sprint-now").hidden).toBe(true);
    action(modal, "Start").click();
    expect(tracker.view(1).sprint).toEqual({ target: 500, written: 0 });
    tracker.wordsChanged(210);
    // Redrawn by the next choice; ending needs no number.
    expect(q(".goals__sprint-now").hidden).toBe(false);
    expect(q<HTMLButtonElement>("#goals-sprint").hidden).toBe(true);
    action(modal, "End").click();
    expect(tracker.view(1).sprint).toBeUndefined();
    expect(q<HTMLInputElement>("#goals-sprint").hidden).toBe(false);
  });

  it("will not start a sprint below 50, and quietly puts the last good number back", () => {
    const { modal, q, tracker } = opened();
    const box = q<HTMLInputElement>("#goals-sprint");
    for (const typed of ["49", "49.4", "12.5", "0", "0.3", "-5", "", "abc"]) {
      box.value = typed;
      action(modal, "Start").click();
      expect(tracker.view(1).sprint, typed).toBeUndefined();
      // Not lifted to 50: back to the default, as nothing good was typed before.
      expect(box.value, typed).toBe("500");
    }
    saysNothing(modal);
  });

  it("goes back to the last good sprint, not the default, once one was typed", () => {
    const { modal, q, tracker } = opened();
    const box = q<HTMLInputElement>("#goals-sprint");
    change(box, "800");
    for (const typed of ["49", "", "-5"]) {
      change(box, typed);
      expect(box.value, typed).toBe("800");
      box.value = typed;
      action(modal, "Start").click();
      expect(tracker.view(1).sprint, typed).toBeUndefined();
      expect(box.value, typed).toBe("800");
    }
    action(modal, "Start").click();
    expect(tracker.view(1).sprint).toEqual({ target: 800, written: 0 });
    saysNothing(modal);
  });

  it("rounds a sprint and caps it, and starts it only on Start", () => {
    for (const [typed, target] of [["49.6", 50], ["50", 50], ["750.4", 750], ["100000", 100_000], ["100001", 100_000], ["250000.5", 100_000]] as const) {
      const { modal, q, tracker } = opened();
      const box = q<HTMLInputElement>("#goals-sprint");
      change(box, typed);
      expect(box.value, typed).toBe(String(target));
      expect(tracker.view(1).sprint, typed).toBeUndefined();
      action(modal, "Start").click();
      expect(tracker.view(1).sprint, typed).toEqual({ target, written: 0 });
      saysNothing(modal);
      document.body.replaceChildren();
    }
  });

  it("puts the sprint right as Escape leaves the box, and starts nothing", () => {
    const { modal, q, tracker } = opened();
    const box = q<HTMLInputElement>("#goals-sprint");
    box.focus();
    press("Enter");
    typeIn(box, "12.5");
    escape(modal);
    expect(modal.hasAttribute("open")).toBe(true);
    expect(box.value).toBe("500");
    press("Enter");
    typeIn(box, "100001");
    escape(modal);
    expect(box.value).toBe("100000");
    expect(tracker.view(1).sprint).toBeUndefined();
    saysNothing(modal);
  });

  it("applies a daily goal typed and left by two quick Escapes, closing as before", () => {
    const { modal, q, tracker, closed } = opened(WITH_GOAL);
    const box = q<HTMLInputElement>("#goals-daily");
    box.focus();
    press("Enter");
    typeIn(box, "800");
    escape(modal);
    expect(modal.hasAttribute("open")).toBe(true);
    expect(tracker.data().goal).toBe(800);
    escape(modal);
    expect(closed).toHaveBeenCalledOnce();
    expect(tracker.data().goal).toBe(800);
  });

  it("applies a typed daily goal when the dialog closes, however it closes", () => {
    for (const [typed, goal] of [["900", 900], ["0", undefined], ["0.3", undefined], ["-5", undefined], ["12.5", 13], ["100001", 100_000], ["", 500]] as const) {
      const { modal, q, tracker, closed } = opened(WITH_GOAL);
      typeIn(q<HTMLInputElement>("#goals-daily"), typed);
      action(modal, "Done").click();
      expect(closed, typed).toHaveBeenCalledOnce();
      expect(tracker.data().goal, typed).toBe(goal);
      document.body.replaceChildren();
    }
  });

  it("starts no sprint when one was typed and the dialog left with Escape", () => {
    const { modal, q, tracker, closed } = opened();
    const box = q<HTMLInputElement>("#goals-sprint");
    box.focus();
    press("Enter");
    typeIn(box, "900");
    escape(modal);
    escape(modal);
    expect(closed).toHaveBeenCalledOnce();
    expect(tracker.view(1).sprint).toBeUndefined();
  });

  it("is put away by Done, and says so", () => {
    const { modal, closed } = opened();
    action(modal, "Done").click();
    expect(modal.isConnected).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });
});

describe("the Goals dialog's look", () => {
  it("has no title, and is still named for a screen reader", () => {
    const { modal } = opened();
    expect(modal.querySelector("h1, h2, h3, .report__heading")).toBeNull();
    expect(modal.getAttribute("aria-label") ?? modal.ariaLabel).toBe("Goals");
  });

  it("wears New Project's frame, fields and buttons, not the title page's", () => {
    const { modal, q } = opened();
    expect(modal.classList.contains("new-project-dialog")).toBe(true);
    expect(modal.querySelector(".report, .new-project, .new-project__form, .field, .field__input, .button, .report__actions")).toBeNull();
    expect(q("#goals-daily").classList.contains("new-project-dialog__input")).toBe(true);
    expect(q("#goals-sprint").classList.contains("new-project-dialog__input")).toBe(true);
    expect(q('label[for="goals-on"]').classList.contains("new-project-dialog__label")).toBe(true);
    expect(q('label[for="goals-sprint"]').classList.contains("new-project-dialog__label")).toBe(true);
    expect(modal.querySelector("select, .dialog-select, input[type='checkbox']")).toBeNull();
    expect(modal.querySelector("[title]")).toBeNull();
  });

  it("has one button at its foot, Done, hinted with the key that closes it from anywhere", () => {
    const { modal, q } = opened();
    const foot = [...q(".new-project-dialog__actions").querySelectorAll("button")];
    expect(foot).toEqual([action(modal, "Done")]);
    expect(foot[0]!.textContent).toBe(">Done[Esc]");
  });

  it("gives Start, End and the day pills no `>`, and leaves Done its own", () => {
    const { modal } = opened();
    expect(action(modal, "Start").textContent).toBe("Start");
    expect(action(modal, "End").textContent).toBe("End");
    expect(action(modal, "Start").querySelector(".gesture__cursor")).toBeNull();
    expect(action(modal, "End").querySelector(".gesture__cursor")).toBeNull();
    expect(action(modal, "Done").querySelector(".gesture__cursor")).not.toBeNull();
    expect(dayButton(modal, "Mo").classList.contains("dialog-action")).toBe(false);
    expect(dayButton(modal, "Mo").querySelector(".gesture__cursor")).toBeNull();
  });

  it("lights Start and End as every dialog button is lit", () => {
    const { modal } = opened();
    expect(action(modal, "Start").classList.contains("dialog-action")).toBe(true);
    expect(action(modal, "End").classList.contains("dialog-action")).toBe(true);
  });

  it("puts the switch on the label's line, and the box and day pills on the line below", () => {
    const { modal, q } = opened(WITH_GOAL);
    const heading = q("#goals-on").parentElement!;
    expect([...heading.children]).toEqual([q('label[for="goals-on"]'), q("#goals-on")]);
    const row = q("#goals-daily").parentElement!;
    expect(row).not.toBe(heading);
    expect(heading.nextElementSibling).toBe(row);
    expect([...row.children]).toEqual([q("#goals-daily"), row.querySelector(".goals__arrow"), q(".goals__days")]);
    expect(row.querySelectorAll(".goals__day")).toHaveLength(7);
    expect(modal.querySelector(".goals__check")).toBeNull();
  });

  it("makes the switch a real switch, with no tooltip", () => {
    const { q } = opened(WITH_GOAL);
    const on = q<HTMLButtonElement>("#goals-on");
    expect(on.tagName).toBe("BUTTON");
    expect(on.type).toBe("button");
    expect(on.getAttribute("role") ?? on.role).toBe("switch");
    expect(on.classList.contains("dialog-toggle")).toBe(true);
    expect(on.hasAttribute("title")).toBe(false);
  });

  it("draws the switch gold when on, dim when off, and still when motion is unwelcome", () => {
    const home = css("home.css");
    const tokens = css("tokens.css");
    expect(tokens).toContain("--colour-toggle-on: var(--colour-accent);");
    expect(tokens).toContain("--colour-toggle-off: var(--colour-border-strong);");
    expect(home).toMatch(/\.dialog-toggle\s*\{[^}]*background: var\(--colour-toggle-off\)/);
    expect(home).toMatch(/\.dialog-toggle\[aria-checked="true"\]\s*\{[^}]*background: var\(--colour-toggle-on\)/);
    expect(home).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.dialog-toggle,\s*\.dialog-toggle::after\s*\{\s*transition: none/);
  });

  it("makes the days the desk's pills: gold when counted, dim when not, never underlined", () => {
    const { modal } = opened({ ...WITH_GOAL, weekdays: ["Mon"] });
    const pills = [...modal.querySelectorAll<HTMLButtonElement>(".goals__day")];
    expect(pills.every((pill) => pill.classList.contains("pill"))).toBe(true);
    expect(pills.filter((pill) => pill.classList.contains("goals__day--counted")).map((pill) => pill.textContent)).toEqual(["Mo"]);
    const goals = css("goals.css");
    // The height, corner, background and type are the pill's, left alone.
    expect(goals).toMatch(/\.goals button\.pill\.goals__day\s*\{[^}]*width: var\(--size-pill\);\s*padding: 0/);
    expect(goals).toMatch(/\.goals button\.pill\.goals__day\s*\{[^}]*color: var\(--colour-faint\)/);
    expect(goals).toMatch(/\.goals button\.pill\.goals__day--counted\s*\{[^}]*color: var\(--colour-accent\)/);
    const dayRules = goals.match(/[^{}]*goals__day[^{}]*\{[^}]*\}/g)!;
    expect(dayRules.length).toBeGreaterThan(0);
    for (const rule of dayRules) expect(rule).not.toMatch(/height|border-radius|font-size|border-bottom|underline|background: var\(--colour-raised\)/);
  });

  it("puts Sprint on its own line, over the box, a dim arrow, then Start", () => {
    const { modal, q } = opened();
    const label = q('label[for="goals-sprint"]');
    expect(label.textContent).toBe("Sprint");
    const row = q("#goals-sprint").parentElement!;
    expect(label.nextElementSibling).toBe(row);
    expect(row.contains(label)).toBe(false);
    const shown = [...row.children].filter((child) => !(child as HTMLElement).hidden);
    const arrow = row.querySelector<HTMLElement>(".goals__arrow")!;
    expect(shown).toEqual([q("#goals-sprint"), arrow, action(modal, "Start")]);
    expect(arrow.textContent).toBe("→");
    expect(arrow.getAttribute("aria-hidden") ?? arrow.ariaHidden).toBe("true");
    const goals = css("goals.css");
    expect(goals).toMatch(/\.goals__arrow\s*\{[^}]*color: var\(--colour-faint\)/);
    expect(goals).toMatch(/\.goals__row \.new-project-dialog__action\s*\{[^}]*min-width: 0/);
  });

  it("keeps the label, the arrow and End in the row while a sprint runs, with the count", () => {
    const { modal, q } = opened();
    action(modal, "Start").click();
    const row = q(".goals__sprint-now").parentElement!;
    const shown = [...row.children].filter((child) => !(child as HTMLElement).hidden);
    expect(shown).toEqual([q(".goals__sprint-now"), row.querySelector(".goals__arrow"), action(modal, "End")]);
    expect(q(".goals__sprint-now").textContent).toBe("0 / 500 words");
    expect(q('label[for="goals-sprint"]').hidden).toBe(false);
    // The row stays as tall as the box it has lost, so the dialog does not jump.
    expect(css("goals.css")).toMatch(/\.goals__row\s*\{[^}]*min-height: var\(--size-field\)/);
  });

  it("puts the same arrow on both rows, with the same gap either side of it", () => {
    const { modal, q } = opened(WITH_GOAL);
    const arrows = [...modal.querySelectorAll<HTMLElement>(".goals__arrow")];
    expect(arrows.map((arrow) => arrow.parentElement)).toEqual([q("#goals-daily").parentElement, q("#goals-sprint").parentElement]);
    for (const arrow of arrows) {
      expect(arrow.textContent).toBe("→");
      expect(arrow.className).toBe("goals__arrow");
      expect(arrow.getAttribute("aria-hidden") ?? arrow.ariaHidden).toBe("true");
      expect(arrow.parentElement!.classList.contains("goals__row")).toBe(true);
    }
    // One gap, on the one rule both rows share, and it is a step of the shared scale.
    expect(css("goals.css")).toMatch(/\.goals__row\s*\{[^}]*gap: var\(--space-goals-arrow\)/);
    expect(css("tokens.css")).toContain("--space-goals-arrow: var(--space-loose);");
  });

  it("puts Done at the right inside the margin, with the room for its `>` kept", () => {
    const goals = css("goals.css");
    expect(goals).toMatch(/\.goals \.new-project-dialog__actions\s*\{[^}]*justify-content: flex-end/);
    const done = goals.match(/\.goals \.new-project-dialog__actions \.new-project-dialog__action\s*\{([^}]*)\}/)![1]!;
    expect(done).not.toMatch(/padding|margin/);
    expect(css("home.css")).toMatch(/\.new-project-dialog__action\s*\{[^}]*padding: 0 var\(--space-dialog-arrow\)/);
  });

  it("leaves every other dialog's buttons centred", () => {
    expect(css("home.css")).toMatch(/\.new-project-dialog__actions\s*\{[^}]*justify-content: center/);
    expect(css("home.css")).toMatch(/\.new-project-dialog__action\s*\{[^}]*min-width: var\(--measure-dialog-slot\)/);
    const footRules = css("goals.css").match(/[^{}]*\.new-project-dialog__actions[^{}]*\{/g)!;
    for (const rule of footRules) expect(rule.trim()).toMatch(/^\.goals /);
  });

  it("gives Goals more margin than New Project, and no other dialog", () => {
    const goals = css("goals.css");
    expect(goals).toMatch(/\.new-project-dialog\.goals\s*\{[^}]*padding: var\(--space-loose\)/);
    expect(css("home.css")).toMatch(/\.new-project-dialog\s*\{[^}]*padding: var\(--space-roomy\)/);
  });

  it("keeps the chart and the three totals as they were drawn", () => {
    const { modal } = opened(WITH_GOAL);
    expect([...modal.querySelectorAll(".goals__label")].map((label) => label.textContent)).toEqual(["Total words", "Today", "Streak"]);
    expect(modal.querySelectorAll(".goals-chart__bar")).toHaveLength(30);
    const goals = css("goals.css");
    expect(goals).toMatch(/\.goals__summary\s*\{[^}]*grid-template-columns: repeat\(3, 1fr\)/);
    expect(goals).toMatch(/\.goals-chart\s*\{[^}]*height: var\(--size-goals-chart\)/);
    // Its contents stay as wide as the old frame left them.
    expect(css("tokens.css")).toContain("--measure-goals: calc(var(--measure-reading) - var(--space-loose) * 2 - var(--rule-thin) * 2);");
    expect(goals).toMatch(/\.new-project-dialog\.goals\s*\{[^}]*calc\(var\(--measure-goals\) \+ var\(--space-loose\) \* 2 \+ var\(--rule-thin\) \* 2\)/);
  });

  it("keeps its look to itself: the title page dialog is not dressed as Goals", () => {
    const into = document.body.appendChild(document.createElement("div"));
    const modal = openTitlePageDialog(into, { titlePage: parse("Title: Big Fish\n\nx\n").titlePage, save: vi.fn(), closed: vi.fn() });
    expect(modal.classList.contains("goals")).toBe(false);
    expect(modal.classList.contains("title-page")).toBe(true);
  });
});

describe("the Goals dialog from the keyboard", () => {
  const stops = (modal: HTMLElement, count: number, key = "Tab", init: KeyboardEventInit = {}): string[] =>
    Array.from({ length: count }, () => {
      press(key, init);
      const at = document.activeElement as HTMLElement;
      return at.id || at.querySelector("span:not(.gesture__cursor)")?.textContent || at.textContent || modal.tagName;
    });
  const WALK = ["goals-on", "goals-daily", ...SUNDAY_FIRST, "goals-sprint", "Start", "Done"];

  it("opens with nothing focused or lit: the dialog itself holds the focus", () => {
    const { modal } = opened(WITH_GOAL);
    expect(document.activeElement).toBe(modal);
    expect(modal.querySelector(":focus")).toBeNull();
    expect(modal.querySelector(".dialog-keys__editing")).toBeNull();
    // The dialog holding the focus draws no ring of its own.
    expect(css("home.css")).toMatch(/\.dialog-keys:focus\s*\{\s*outline: none/);
  });

  it("closes on one Escape from the open state", () => {
    const { modal, closed } = opened(WITH_GOAL);
    escape(modal);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("goes to the first control on the first Tab, and the last on the first Shift+Tab", () => {
    expect(stops(opened(WITH_GOAL).modal, 1)).toEqual(["goals-on"]);
    expect(stops(opened(WITH_GOAL).modal, 1, "Tab", { shiftKey: true })).toEqual(["Done"]);
  });

  it.each(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"])("steps in at the first control on %s", (key) => {
    const { modal, tracker } = opened();
    expect(stops(modal, 1, key)).toEqual(["goals-on"]);
    expect(tracker.data().goal).toBeUndefined();
  });

  it("is back to the usual arrows once a control has the focus", () => {
    const { modal } = opened(WITH_GOAL);
    expect(stops(modal, 3, "ArrowUp")).toEqual(["goals-on", "Done", "goals-sprint"]);
  });

  it("leaves an arrow held with Ctrl, Alt or Cmd alone", () => {
    const { modal } = opened(WITH_GOAL);
    press("ArrowDown", { ctrlKey: true });
    press("ArrowDown", { altKey: true });
    press("ArrowDown", { metaKey: true });
    expect(document.activeElement).toBe(modal);
  });

  it("leaves the other dialogs opening where they did", () => {
    const into = document.body.appendChild(document.createElement("div"));
    const project = { marker: { name: "Big Fish" } } as never;
    const title = openTitlePageDialog(into, { titlePage: parse("Title: Big Fish\n\nx\n").titlePage, save: vi.fn(), closed: vi.fn() });
    expect(title.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(title);
    const exporting = openExportDialog(into, { formats: EXPORT_FORMATS, pageCount: () => 1, write: async () => true, report: vi.fn(), closed: vi.fn() });
    expect(document.activeElement).toBe(exporting.querySelector("#export-format"));
    const rename = showRenameProject(into, { project, onRename: async () => undefined, onClose: vi.fn() });
    expect(document.activeElement).toBe(rename.querySelector("input"));
    const remove = showDeleteProject(into, { project, onDelete: async () => undefined, onClose: vi.fn() });
    expect(document.activeElement).toBe([...remove.querySelectorAll(".new-project-dialog__action")].at(-1));
  });

  it("walks every control with Tab and Shift+Tab, and wraps", () => {
    const { modal } = opened(WITH_GOAL);
    expect(stops(modal, WALK.length)).toEqual(WALK);
    expect(document.activeElement).toBe(action(modal, "Done"));
    expect(stops(modal, 2, "Tab", { shiftKey: true })).toEqual(["Start", "goals-sprint"]);
    action(modal, "Done").focus();
    expect(stops(modal, 1)).toEqual(["goals-on"]);
  });

  it("moves between rows with Up and Down, and along one with Left and Right", () => {
    const { modal, q } = opened(WITH_GOAL);
    expect(stops(modal, 4, "ArrowDown")).toEqual(["goals-on", "goals-daily", "goals-sprint", "Done"]);
    q("#goals-daily").focus();
    expect(stops(modal, 2, "ArrowRight")).toEqual(["Su", "Mo"]);
    q("#goals-daily").focus();
    expect(stops(modal, 1, "ArrowLeft")).toEqual(["Sa"]);
    expect(stops(modal, 1, "ArrowUp")).toEqual(["goals-on"]);
    // Back to the control last on in the row below.
    expect(stops(modal, 1, "ArrowDown")).toEqual(["Sa"]);
  });

  it("steps over what the daily goal being off has disabled", () => {
    const { modal } = opened();
    expect(stops(modal, 3, "ArrowDown")).toEqual(["goals-on", "goals-sprint", "Done"]);
    expect(stops(modal, 4)).toEqual(["goals-on", "goals-sprint", "Start", "Done"]);
  });

  it("steps over what a running sprint has hidden, and over End when none runs", () => {
    const { modal, q } = opened(WITH_GOAL);
    q("#goals-sprint").focus();
    expect(stops(modal, 1)).toEqual(["Start"]);
    press("Enter");
    expect(document.activeElement).toBe(action(modal, "End"));
    expect(stops(modal, 2)).toEqual(["Done", "goals-on"]);
    action(modal, "Done").focus();
    expect(stops(modal, 1, "Tab", { shiftKey: true })).toEqual(["End"]);
  });

  it("passes through a number box until it is being edited; then the arrows are the box's", () => {
    const { modal, q } = opened(WITH_GOAL);
    const box = q<HTMLInputElement>("#goals-daily");
    box.focus();
    expect(press("ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q("#goals-sprint"));
    box.focus();
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(box.classList.contains("dialog-keys__editing")).toBe(true);
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(press(key).defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(box);
    }
  });

  it("starts editing when the writer types or clicks in a number box", () => {
    const { q } = opened(WITH_GOAL);
    const box = q<HTMLInputElement>("#goals-sprint");
    box.focus();
    typeIn(box, "7");
    expect(box.classList.contains("dialog-keys__editing")).toBe(true);
    press("Escape");
    box.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(box.classList.contains("dialog-keys__editing")).toBe(true);
  });

  it("takes the first Escape to leave the edit, and the second to close", () => {
    const { modal, q, closed } = opened(WITH_GOAL);
    const box = q<HTMLInputElement>("#goals-daily");
    box.focus();
    press("Enter");
    escape(modal);
    expect(closed).not.toHaveBeenCalled();
    expect(modal.isConnected).toBe(true);
    expect(document.activeElement).toBe(box);
    expect(box.classList.contains("dialog-keys__editing")).toBe(false);
    escape(modal);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("applies the goal on Enter while editing, and stays open", () => {
    const { modal, q, tracker, closed } = opened(WITH_GOAL);
    const box = q<HTMLInputElement>("#goals-daily");
    box.focus();
    typeIn(box, "750");
    press("Enter");
    expect(tracker.data().goal).toBe(750);
    expect([...modal.querySelectorAll(".goals__value")][1]!.textContent).toBe("0 / 750");
    expect(closed).not.toHaveBeenCalled();
  });

  it("puts the number right on Enter without a word, and stays in the box", () => {
    const { modal, q, tracker, closed } = opened(WITH_GOAL);
    const box = q<HTMLInputElement>("#goals-daily");
    box.focus();
    typeIn(box, "12.5");
    press("Enter");
    expect(tracker.data().goal).toBe(13);
    expect(box.value).toBe("13");
    typeIn(box, "");
    press("Enter");
    expect(tracker.data().goal).toBe(13);
    expect(box.value).toBe("13");
    saysNothing(modal);
    expect(document.activeElement).toBe(box);
    expect(closed).not.toHaveBeenCalled();
  });

  it("starts nothing from Enter in the sprint box when the number is too small", () => {
    const { modal, q, tracker } = opened();
    const box = q<HTMLInputElement>("#goals-sprint");
    box.focus();
    press("Enter");
    typeIn(box, "12.5");
    press("Enter");
    expect(tracker.view(1).sprint).toBeUndefined();
    expect(box.value).toBe("500");
    typeIn(box, "49.6");
    press("Enter");
    expect(tracker.view(1).sprint).toEqual({ target: 50, written: 0 });
    saysNothing(modal);
  });

  it("turns the goal off on Enter with 0 or less, and moves to the switch rather than a greyed box", () => {
    for (const typed of ["0", "0.3", "-5"]) {
      const { q, tracker, closed } = opened(WITH_GOAL);
      const box = q<HTMLInputElement>("#goals-daily");
      box.focus();
      typeIn(box, typed);
      press("Enter");
      expect(tracker.data().goal, typed).toBeUndefined();
      expect(box.value, typed).toBe("500");
      expect(document.activeElement, typed).toBe(q("#goals-on"));
      expect(closed, typed).not.toHaveBeenCalled();
      document.body.replaceChildren();
    }
  });

  it("does not apply a focused box on the Enter that only starts the edit", () => {
    const { q, tracker } = opened();
    const box = q<HTMLInputElement>("#goals-sprint");
    box.focus();
    press("Enter");
    expect(tracker.view(1).sprint).toBeUndefined();
    press("Enter");
    expect(tracker.view(1).sprint).toEqual({ target: 500, written: 0 });
  });

  it("flips the switch with Space and with Enter, staying on it with the dialog open", () => {
    const { q, tracker, closed } = opened();
    const on = q("#goals-on");
    on.focus();
    expect(press(" ").defaultPrevented).toBe(true);
    expect(tracker.data().goal).toBe(500);
    expect(isOn(on)).toBe(true);
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(tracker.data().goal).toBeUndefined();
    expect(isOn(on)).toBe(false);
    expect(document.activeElement).toBe(on);
    expect(closed).not.toHaveBeenCalled();
  });

  it("does not flip the switch again for a key held down", () => {
    const { q, tracker } = opened();
    q("#goals-on").focus();
    press(" ", { repeat: true });
    press("Enter", { repeat: true });
    expect(tracker.data().goal).toBeUndefined();
  });

  it("takes the focus to the switch when it is clicked, out of the box it may disable", () => {
    const { q } = opened(WITH_GOAL);
    q("#goals-daily").focus();
    q("#goals-on").click();
    expect(q<HTMLInputElement>("#goals-daily").disabled).toBe(true);
    expect(document.activeElement).toBe(q("#goals-on"));
  });

  it("keeps the switch a plain stop: never edited, and the arrows and Escape still work", () => {
    const { modal, q, tracker, closed } = opened();
    const on = q("#goals-on");
    on.focus();
    press(" ");
    expect(tracker.data().goal).toBe(500);
    expect(on.classList.contains("dialog-keys__editing")).toBe(false);
    press("ArrowDown");
    expect(document.activeElement).toBe(q("#goals-daily"));
    on.focus();
    on.click();
    expect(tracker.data().goal).toBeUndefined();
    expect(on.classList.contains("dialog-keys__editing")).toBe(false);
    escape(modal);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("toggles a weekday with Enter, and leaves the dialog open", () => {
    const { modal, tracker, closed } = opened(WITH_GOAL);
    dayButton(modal, "Su").focus();
    press("Enter");
    expect(tracker.data().weekdays).not.toContain("Sun");
    expect(dayButton(modal, "Su").getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(dayButton(modal, "Su"));
    press("Enter");
    expect(tracker.data().weekdays).toContain("Sun");
    expect(closed).not.toHaveBeenCalled();
  });

  it("starts and ends a sprint from the keyboard, keeping the focus in the dialog", () => {
    const { modal, q, tracker, closed } = opened();
    action(modal, "Start").focus();
    press("Enter");
    expect(tracker.view(1).sprint).toEqual({ target: 500, written: 0 });
    expect(document.activeElement).toBe(action(modal, "End"));
    press("Enter");
    expect(tracker.view(1).sprint).toBeUndefined();
    expect(document.activeElement).toBe(q("#goals-sprint"));
    expect(closed).not.toHaveBeenCalled();
  });

  it("closes on Enter from Done, and from where nothing has a use for it", () => {
    const first = opened(WITH_GOAL);
    press("Enter");
    expect(first.closed).toHaveBeenCalledOnce();
    const second = opened(WITH_GOAL);
    second.modal.focus();
    press("Enter");
    expect(second.closed).toHaveBeenCalledOnce();
    expect(second.tracker.data().goal).toBe(500);
  });

  it("does not close on an Enter that is still held down", () => {
    const { modal, closed } = opened(WITH_GOAL);
    modal.focus();
    press("Enter", { repeat: true });
    expect(closed).not.toHaveBeenCalled();
  });

  it("changes nothing by closing: what was chosen has already happened", () => {
    const { modal, tracker } = opened(WITH_GOAL);
    dayButton(modal, "Sa").click();
    const chosen = tracker.data().weekdays;
    escape(modal);
    expect(tracker.data().weekdays).toEqual(chosen);
    expect(chosen).not.toContain("Sat");
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
    askToRename: () => {},
    ledger: () => undefined,
    places: () => undefined,
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
    context.setStatus("p. ~1 / 4 | w. 445");
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
