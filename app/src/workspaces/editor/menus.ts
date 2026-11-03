/**
 * What the Editor's three menus hold (the desk design, §2.4), read from the
 * command table (`commands.ts`).
 *
 * **Only what exists.** A command with no `menu` is not here, and a menu item
 * that pretended would be worse than one that is absent. The hint on each item
 * is computed from the key the table answers, so it is only ever a shortcut
 * that really works — which is why the title page items have none.
 */
import type { MenuEntry } from "../../menus/drop-menu.ts";
import { COMMANDS, hintOf, runCommand, type CommandHost, type MenuName } from "./commands.ts";

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
      const { checked } = command;
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
