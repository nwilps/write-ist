/**
 * Goals: the daily goal, the streak, the last thirty days, and a sprint
 * (ADR-0040).
 *
 * A modal `<dialog>` built like the title page's, and like it Escape closes it
 * natively. Nothing is "saved" with a button: choosing a goal, a weekday, a
 * sprint changes the Editor's goals at once and the picture redraws, and
 * **Done** only puts the dialog away. What the numbers mean — net words, which
 * days count, how a streak is read — is `src/goals/`'s; this draws and listens.
 *
 * The chart is drawn from the same tokens as everything else: a row of bars
 * whose heights are a percentage handed in as a custom property, and a line
 * across at the goal. No chart library.
 */
import { MAXIMUM_GOAL } from "../../../../src/goals/history.ts";
import { WEEKDAYS, type Weekday } from "../../../../src/goals/day.ts";
import { SPRINT_DEFAULT, SPRINT_MAXIMUM, SPRINT_MINIMUM } from "../../../../src/goals/sprint.ts";
import type { GoalsView } from "../../../../src/goals/tracker.ts";
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
  const on = element("input", { id: "goals-on", type: "checkbox", className: "goals__check" });
  const onLabel = element("label", { htmlFor: "goals-on", className: "goals__check-label", textContent: "Daily word goal" });
  const goalBox = element("input", {
    id: "goals-daily",
    className: "field__input goals__number",
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
    WEEKDAYS.map((day) => {
      const button = element("button", { type: "button", className: "button goals__day", textContent: day });
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
    if (!on.checked) {
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
  on.addEventListener("change", () => {
    if (on.checked && goalTyped() === undefined) goalBox.value = String(DEFAULT_GOAL);
    applyDaily();
  });
  goalBox.addEventListener("change", applyDaily);
  goalBox.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyDaily();
  });
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
    className: "field__input goals__number",
    type: "number",
    min: String(SPRINT_MINIMUM),
    max: String(SPRINT_MAXIMUM),
    step: "1",
    value: String(SPRINT_DEFAULT),
    autocomplete: "off",
  });
  const start = element("button", { type: "button", className: "button button--leading", textContent: "Start" });
  const end = element("button", { type: "button", className: "button", textContent: "End" });
  const sprintLabel = element("label", { htmlFor: "goals-sprint", className: "goals__check-label", textContent: "Sprint (words)" });
  const sprintNow = element("span", { className: "goals__sprint-now", role: "status" });
  const startSprint = (): void => {
    problem.replaceChildren();
    const typed = Number(sprintBox.value);
    if (sprintBox.value.trim() === "" || !options.startSprint(typed)) {
      say(`A sprint is a whole number of words, from ${said(SPRINT_MINIMUM)} to ${said(SPRINT_MAXIMUM)}.`);
      return;
    }
    redraw();
  };
  start.addEventListener("click", startSprint);
  sprintBox.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    startSprint();
  });
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
        bar.title = `${shortDate(day.day)}: ${plural(day.words, "word", "words")}${day.counted ? "" : " (not a counted day)"}`;
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

    on.checked = view.goal !== undefined;
    if (view.goal !== undefined) goalBox.value = String(view.goal);
    goalBox.disabled = !on.checked;
    for (const [day, button] of dayButtons) {
      const counted = chosen.has(day);
      button.setAttribute("aria-pressed", String(counted));
      button.classList.toggle("goals__day--counted", counted);
      button.disabled = !on.checked;
    }

    const running = view.sprint;
    sprintBox.hidden = start.hidden = sprintLabel.hidden = running !== undefined;
    end.hidden = sprintNow.hidden = running === undefined;
    if (running !== undefined) sprintNow.textContent = `${said(running.written)} / ${said(running.target)} words`;
  }

  const done = element("button", { className: "button button--leading", type: "button", textContent: "Done" });
  const modal = element("dialog", { className: "report new-project goals", ariaLabel: "Goals" }, [
    element("div", { className: "new-project__form goals__form" }, [
      element("h2", { className: "report__heading", textContent: "Goals" }),
      summary,
      element("div", { className: "goals__chart" }, [chart, axis]),
      element("div", { className: "field" }, [
        element("div", { className: "goals__row" }, [on, onLabel, goalBox]),
        days,
      ]),
      element("div", { className: "field" }, [
        element("div", { className: "goals__row" }, [sprintLabel, sprintBox, start, sprintNow, end]),
      ]),
      problem,
      element("div", { className: "report__actions new-project__actions" }, [done]),
    ]),
  ]);

  done.addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    modal.remove();
    options.closed();
  });

  redraw();
  into.append(modal);
  modal.showModal();
  done.focus();
  return modal;
}
