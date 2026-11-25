/**
 * Settings a workspace contributes (ADR-0045): switches it declares in its
 * manifest, drawn by the application where its own settings are drawn and
 * kept in the files that already keep settings. Nothing here is a new store.
 *
 * - **`app`** — one value for the whole application: a switch in Settings ▸
 *   General, under the workspace's name, kept in `settings.json`
 *   (`workspaceSettings`), as every other setting is.
 * - **`project`** — one value per project: a switch in Edit Project Details,
 *   under the workspace's name, kept in the project's `details.md` (a line
 *   `Setting <workspace>.<id>: yes`); and the value a new project starts with,
 *   per project type, in Settings ▸ New Project Defaults — which New Project
 *   writes into the new `details.md`, as it does the formatting.
 *
 * A value never set is the setting's `default`. Values are put right on the
 * way in, quietly, as Settings' are: an id that is not one, or a value that is
 * not yes or no, is left out and reads as the default. A value for a workspace
 * or a setting this version does not offer is **kept**, so a file written by
 * a newer Write-ist does not lose it.
 *
 * Switches only, today. Another kind (a number, a choice) is a field added
 * here and drawn there, which is an addition to the toolbox, not a change.
 */

/** A setting a workspace declares in its manifest. */
export interface WorkspaceSetting {
  /** Stable, lower case, letters, digits and dashes; never shown. */
  readonly id: string;
  /** What the switch is called, where the writer sees it. */
  readonly label: string;
  /** Where it lives: one value for the application, or one per project (above). */
  readonly place: "app" | "project";
  /** Its value until the writer changes it. */
  readonly default: boolean;
}

/** Kept values, by workspace id, then setting id. */
export type WorkspaceSettingValues = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

/** An id as kept: lower case, letters, digits and dashes. The same rule as a workspace id. */
export const SETTING_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Kept values, put right quietly: anything that is not an id and a yes or no is left out. */
export function workspaceSettingValuesOf(value: unknown): WorkspaceSettingValues {
  if (!isRecord(value)) return {};
  const kept: Record<string, Record<string, boolean>> = {};
  for (const [workspace, settings] of Object.entries(value)) {
    if (!SETTING_ID.test(workspace) || !isRecord(settings)) continue;
    const values: Record<string, boolean> = {};
    for (const [id, on] of Object.entries(settings)) if (SETTING_ID.test(id) && typeof on === "boolean") values[id] = on;
    if (Object.keys(values).length > 0) kept[workspace] = values;
  }
  return kept;
}

/** A setting's value: kept, or its default. */
export function settingValue(values: WorkspaceSettingValues | undefined, workspace: string, setting: WorkspaceSetting): boolean {
  return values?.[workspace]?.[setting.id] ?? setting.default;
}

/** `values` with one value changed. */
export function withSetting(
  values: WorkspaceSettingValues | undefined,
  workspace: string,
  id: string,
  on: boolean,
): WorkspaceSettingValues {
  return { ...values, [workspace]: { ...values?.[workspace], [id]: on } };
}

/** Whether any value is kept at all: a file with none says nothing about them. */
export const hasSettings = (values: WorkspaceSettingValues | undefined): values is WorkspaceSettingValues =>
  values !== undefined && Object.values(values).some((each) => Object.keys(each).length > 0);

/** The same values, compared without regard to order. */
export function sameSettings(one: WorkspaceSettingValues | undefined, other: WorkspaceSettingValues | undefined): boolean {
  const flat = (values: WorkspaceSettingValues | undefined): string =>
    Object.entries(values ?? {})
      .flatMap(([workspace, each]) => Object.entries(each).map(([id, on]) => `${workspace}.${id}=${on}`))
      .sort()
      .join();
  return flat(one) === flat(other);
}
