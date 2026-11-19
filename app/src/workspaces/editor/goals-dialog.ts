/**
 * Goals: the daily goal, the streak, the last thirty days, and a sprint
 * (ADR-0040).
 *
 * New Project's dialog, built from its pieces, its shared button and keys among
 * them: a modal `<dialog>` with no heading, and Escape closes it natively.
 * Nothing is "saved" with a button: choosing a goal, a weekday, a sprint changes
 * the Editor's goals at once and the picture redraws, so there is nothing to
 * cancel or confirm, and **Done** only puts the dialog away. Enter in a number
 * being edited applies it; Enter that nothing else used closes the dialog. What
 * the numbers mean — net words, which days count, how a streak is read — is
 * `src/goals/`'s; this draws and listens.
 *
 * The chart is drawn from the same tokens as everything else: a row of bars
 * whose heights are a percentage handed in as a custom property, and a line
 * across at the goal. No chart library.
 */
import { MAXIMUM_GOAL } from "../../../../src/goals/history.ts";
import type { Weekday } from "../../../../src/goals/day.ts";
import { SPRINT_DEFAULT, SPRINT_MAXIMUM, SPRINT_MINIMUM } from "../../../../src/goals/sprint.ts";
import type { GoalsView } from "../../../../src/goals/tracker.ts";
import { dialogAction } from "../../screens/dialog-action.ts";
import { dialogKeys } from "../../screens/dialog-keys.ts";
import { dialogToggle } from "../../screens/dialog-toggle.ts";
import { element } from "../../screens/element.ts";
import { trouble } from "../../screens/trouble.ts";

export interface GoalsDialogOptions {
  /** The goals as they stand now. */
  readonly view: () => GoalsView;
  /** Turn the daily goal on or off and choose the counted weekdays. `false`: the number is not allowed. */
  readonly setDaily: (goal: number | undefined, weekdays: readonly Weekday[]) => boolean;
  readonly startSprint: (target: number) => boolean;
  readonly endSprint: () => void;
  readonly closed: () => void;
}

/** What a daily goal defaults to when the writer first turns it on. */
const DEFAULT_GOAL = 500;

/** The day pills, Sunday first. Only how they are shown: a day is kept and counted as its `Weekday`. */
const DAY_PILLS: readonly { readonly day: Weekday; readonly label: string; readonly name: string }[] = [
  { day: "Sun", label: "Su", name: "Sunday" },
  { day: "Mon", label: "Mo", name: "Monday" },
  { day: "Tue", label: "Tu", name: "Tuesday" },
  { day: "Wed", label: "We", name: "Wednesday" },
  { day: "Thu", label: "Th", name: "Thursday" },
  { day: "Fri", label: "Fr", name: "Friday" },
  { day: "Sat", label: "Sa", name: "Saturday" },
];

/** The dim arrow on a Goals row, from the box to what it feeds. */
const rowArrow = (): HTMLElement => element("span", { className: "goals__arrow", ariaHidden: "true", textContent: "→" });

const WITH_COMMAS = new Intl.NumberFormat("en-US");
const said = (value: number): string => WITH_COMMAS.format(value);
const plural = (count: number, one: string, many: string): string => `${said(count)} ${count === 1 ? one : many}`;

/** `2026-11-03` as "Nov 3". The day is a calendar date, so it is read as UTC and shown as UTC. */
function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function openGoalsDialog(into: HTMLElement, options: GoalsDialogOptions): HTMLDialogElement {
  const problem = element("div", { className: "new-project__problem" });
  const say = (words: string): void => problem.replaceChildren(trouble(words));

  // --- The summary -----------------------------------------------------
  const stat = (label: string): { readonly node: HTMLElement; readonly value: HTMLElement } => {
    const value = element("dd", { className: "goals__value" });
    return { node: element("div", { className: "goals__stat" }, [element("dt", { className: "goals__label", textContent: label }), value]), value };
  };
  const total = stat("Total words");
  const today = stat("Today");
  const streak = stat("Streak");
  const summary = element("dl", { className: "goals__summary" }, [total.node, today.node, streak.node]);

  // --- The chart -------------------------------------------------------
  const bars = element("div", { className: "goals-chart__bars" });
  const goalLine = element("div", { className: "goals-chart__goal", ariaHidden: "true" });
  const chart = element("div", { className: "goals-chart", role: "img" }, [bars, goalLine]);
  const firstDay = element("span");
  const lastDay = element("span", { textContent: "Today" });
  const axis = element("div", { className: "goals-chart__axis" }, [firstDay, lastDay]);

  // --- The daily goal --------------------------------------------------
  const chosen = new Set<Weekday>(options.view().weekdays);
  const on = dialogToggle({
    id: "goals-on",
    onChange: (isOn) => {
      if (isOn && goalTyped() === undefined) goalBox.value = String(DEFAULT_GOAL);
      applyDaily();
    },
  });
  const onLabel = element("label", { htmlFor: "goals-on", className: "new-project-dialog__label goals__toggle-label", textContent: "Daily word goal" });
  const goalBox = element("input", {
    id: "goals-daily",
    className: "new-project-dialog__input goals__number",
    ariaLabel: "Daily word goal",
    type: "number",
    min: "1",
    max: String(MAXIMUM_GOAL),
    step: "1",
    autocomplete: "off",
  });
  const dayButtons = new Map<Weekday, HTMLButtonElement>();
  const days = element(
    "div",
    { className: "goals__days", role: "group", ariaLabel: "Days that count" },
    DAY_PILLS.map(({ day, label, name }) => {
      const button = element("button", { type: "button", className: "pill goals__day", textContent: label, ariaLabel: name });
      dayButtons.set(day, button);
      return button;
    }),
  );

  /** The number in the goal box, or `undefined` if it is not a whole number of words. */
  const goalTyped = (): number | undefined => {
    const typed = Number(goalBox.value);
    return goalBox.value.trim() !== "" && Number.isInteger(typed) ? typed : undefined;
  };
  const applyDaily = (): void => {
    problem.replaceChildren();
    if (!on.on()) {
      options.setDaily(undefined, [...chosen]);
      redraw();
      return;
    }
    const goal = goalTyped();
    if (goal === undefined || !options.setDaily(goal, [...chosen])) {
      say(`A daily goal is a whole number of words, from 1 to ${said(MAXIMUM_GOAL)}.`);
      return;
    }
    redraw();
  };
  goalBox.addEventListener("change", applyDaily);
  for (const [day, button] of dayButtons) {
    button.addEventListener("click", () => {
      if (chosen.has(day)) chosen.delete(day);
      else chosen.add(day);
      applyDaily();
    });
  }

  // --- The sprint ------------------------------------------------------
  const sprintBox = element("input", {
    id: "goals-sprint",
    className: "new-project-dialog__input goals__number",
    ariaLabel: "Sprint, in words",
    type: "number",
    min: String(SPRINT_MINIMUM),
    max: String(SPRINT_MAXIMUM),
    step: "1",
    value: String(SPRINT_DEFAULT),
    autocomplete: "off",
  });
  // The arrow beside them already says where to press, so neither wears the `>`.
  const start = dialogAction("Start", undefined, "button", { cursor: false });
  const end = dialogAction("End", undefined, "button", { cursor: false });
  const sprintLabel = element("label", { htmlFor: "goals-sprint", className: "new-project-dialog__label", textContent: "Sprint" });
  const sprintNow = element("span", { className: "goals__sprint-now", role: "status" });
  const startSprint = (): void => {
    problem.replaceChildren();
    const typed = Number(sprintBox.value);
    if (sprintBox.value.trim() === "" || !options.startSprint(typed)) {
      say(`A sprint is a whole number of words, from ${said(SPRINT_MINIMUM)} to ${said(SPRINT_MAXIMUM)}.`);
      return;
    }
    redraw();
    // The box and Start have just been hidden, and the focus must not go with them.
    end.focus();
  };
  start.addEventListener("click", startSprint);
  end.addEventListener("click", () => {
    options.endSprint();
    redraw();
    sprintBox.focus();
  });

  /** Draw everything that follows from the goals as they stand now. */
  function redraw(): void {
    const view = options.view();

    total.value.textContent = said(view.totalWords);
    today.value.textContent =
      view.goal === undefined ? plural(view.today, "word", "words") : `${said(view.today)} / ${said(view.goal)}`;
    streak.value.textContent =
      view.goal === undefined
        ? "—"
        : `${plural(view.streak, "day", "days")}${view.bestStreak > 0 ? ` · best ${view.bestStreak}` : ""}`;

    const top = Math.max(view.goal ?? 0, ...view.chart.map((day) => day.words), 1);
    bars.replaceChildren(
      ...view.chart.map((day) => {
        const bar = element("div", { className: "goals-chart__bar" });
        bar.style.setProperty("--bar", String((day.words / top) * 100));
        if (day.met) bar.classList.add("goals-chart__bar--met");
        if (!day.counted) bar.classList.add("goals-chart__bar--idle");
        // Said to a screen reader, never shown on hover.
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", `${shortDate(day.day)}: ${plural(day.words, "word", "words")}${day.counted ? "" : " (not a counted day)"}`);
        return bar;
      }),
    );
    goalLine.hidden = view.goal === undefined;
    if (view.goal !== undefined) goalLine.style.setProperty("--goal-at", String((view.goal / top) * 100));
    chart.setAttribute(
      "aria-label",
      `Words written in the last ${view.chart.length} days${view.goal === undefined ? "" : `, against a goal of ${said(view.goal)} a day`}`,
    );
    firstDay.textContent = shortDate(view.chart[0]!.day);

    on.set(view.goal !== undefined);
    if (view.goal !== undefined) goalBox.value = String(view.goal);
    goalBox.disabled = !on.on();
    for (const [day, button] of dayButtons) {
      const counted = chosen.has(day);
      button.setAttribute("aria-pressed", String(counted));
      button.classList.toggle("goals__day--counted", counted);
      button.disabled = !on.on();
    }

    const running = view.sprint;
    sprintBox.hidden = start.hidden = running !== undefined;
    end.hidden = sprintNow.hidden = running === undefined;
    if (running !== undefined) sprintNow.textContent = `${said(running.written)} / ${said(running.target)} words`;
  }

  // Esc, because it closes from every stop; Enter is often some other control's.
  const done = dialogAction("Done", "Esc", "button");
  // No heading, as New Project has none; the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog goals", ariaLabel: "Goals" }, [
    element("div", { className: "new-project-dialog__form" }, [
      summary,
      element("div", { className: "goals__chart" }, [chart, axis]),
      element("div", { className: "goals__settings" }, [
        element("div", { className: "new-project-dialog__field" }, [
          element("div", { className: "goals__heading" }, [onLabel, on.control]),
          element("div", { className: "goals__row" }, [goalBox, rowArrow(), days]),
        ]),
        element("div", { className: "new-project-dialog__field" }, [
          sprintLabel,
          element("div", { className: "goals__row" }, [sprintBox, sprintNow, rowArrow(), start, end]),
        ]),
      ]),
      problem,
      element("div", { className: "new-project-dialog__actions" }, [done]),
    ]),
  ]);
  // Before `dialogKeys`, which leaves a used key alone: from the dialog itself,
  // where it opens, every arrow steps in at the top.
  modal.addEventListener("keydown", (event) => {
    if (event.target !== modal || !event.key.startsWith("Arrow")) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    on.control.focus();
  });
  dialogKeys(modal, [[on.control], [goalBox, ...dayButtons.values()], [sprintBox, start, end], [done]]);

  // After `dialogKeys`, so this is only the Enter it left: in a number being
  // edited, or on nothing that has a use for it.
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (event.target === goalBox) applyDaily();
    else if (event.target === sprintBox) startSprint();
    // Not a held key: Enter still down from the box must not close the dialog.
    else if (!event.repeat) modal.close();
  });
  done.addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    modal.remove();
    options.closed();
  });

  redraw();
  into.append(modal);
  modal.showModal();
  // Nothing is assumed: no control lit, and the focus still inside the dialog.
  modal.focus();
  return modal;
}
