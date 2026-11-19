/**
 * What the Editor's three menus hold (the desk design, §2.4), read from the
 * command table (`commands.ts`).
 *
 * **Only what exists.** A command with no `menu` is not here, and a menu item
 * that pretended would be worse than one that is absent. The hint on each item
 * is computed from the key the table answers, so it is only ever a shortcut
 * that really works — which is why the title page items have none.
 *
 * A command with `steps` is drawn as a row of steps (View ▸ Zoom's − and +),
 * which runs the two commands it names.
 */
import type { MenuEntry } from "../../menus/drop-menu.ts";
import { COMMANDS, commandById, hintOf, runCommand, type CommandHost, type MenuName } from "./commands.ts";

export type { EditorActions } from "./commands.ts";

/** The menus in the order the desk draws them. */
const MENU_NAMES: readonly MenuName[] = ["File", "Edit", "View"];

export function editorMenus(host: CommandHost): Readonly<Record<string, readonly MenuEntry[]>> {
  const menus: Record<string, MenuEntry[]> = {};
  for (const name of MENU_NAMES) {
    const entries: MenuEntry[] = [];
    let group: string | undefined;
    for (const command of COMMANDS) {
      if (command.menu?.name !== name) continue;
      // A rule falls between two groups, never at an edge.
      if (group !== undefined && group !== command.menu.group) entries.push({ divider: true });
      group = command.menu.group;
      const { checked, steps } = command;
      if (steps !== undefined) {
        const step = (id: string): { label: string; act: () => void } => {
          const stepping = commandById(id)!;
          return { label: stepping.label, act: () => runCommand(stepping, host) };
        };
        entries.push({
          label: command.label,
          ...(command.icon === undefined ? {} : { icon: command.icon }),
          less: step(steps.less),
          more: step(steps.more),
          at: () => ({ index: steps.at(host), count: steps.count }),
        });
        continue;
      }
      entries.push({
        label: command.label,
        ...(hintOf(command) === undefined ? {} : { hint: hintOf(command)! }),
        ...(command.icon === undefined ? {} : { icon: command.icon }),
        act: () => runCommand(command, host),
        ...(checked === undefined ? {} : { checked: () => checked(host) }),
      });
    }
    menus[name] = entries;
  }
  return menus;
}
