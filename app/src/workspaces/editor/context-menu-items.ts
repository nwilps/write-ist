/**
 * What the paper's right-click menu holds (ADR-0034), read from the command
 * table (`commands.ts`) the way `menus.ts` reads it for File, Edit and View.
 *
 * **To add an item**, give its command a `context: { group }` in the table.
 * Nothing here changes: the label, the icon, the hint, whether it is greyed
 * and what it does all come from the entry, so the menu can neither offer a
 * key that does nothing nor reach code the key does not.
 *
 * Two things are not in the table because they are not commands. A misspelt
 * word's suggestions come first, one per candidate for *this* word; and a group
 * marked `contextual` (Dual Dialogue) is left out entirely where none of it
 * could do anything, so action text is not offered it greyed.
 */
import { BookPlus } from "lucide";
import type { MenuEntry, MenuItem } from "../../menus/drop-menu.ts";
import { COMMANDS, hintOf, isAvailable, runCommand, type CommandHost } from "./commands.ts";

/** How many of the dictionary's suggestions the menu offers. */
export const MAX_SUGGESTIONS = 5;

/** The items for a right-click at document position `at`. */
export async function contextMenuItems(host: CommandHost, at: number): Promise<MenuEntry[]> {
  const groups: MenuEntry[][] = [];

  const wrong = host.misspellingAt(at);
  if (wrong !== undefined) {
    const suggestions = await wrong.suggestions().then(
      (found) => found.slice(0, MAX_SUGGESTIONS),
      // The dictionary could not answer; the menu still opens, with the rest.
      () => [] as string[],
    );
    const items: MenuItem[] =
      suggestions.length === 0
        ? [{ label: "No Suggestions", unavailable: true, act: () => {} }]
        : suggestions.map((text) => ({ label: text, act: () => wrong.replace(text) }));
    items.push({ label: "Add to Dictionary", icon: BookPlus, act: wrong.addToDictionary });
    groups.push(items);
  }

  const byGroup = new Map<string, { items: MenuItem[]; contextual: boolean; reachable: boolean }>();
  for (const command of COMMANDS) {
    if (command.context === undefined) continue;
    const { group, contextual } = command.context;
    const hint = hintOf(command);
    const available = isAvailable(command, host, at);
    const entry = byGroup.get(group) ?? { items: [], contextual: false, reachable: false };
    entry.items.push({
      label: command.label,
      ...(hint === undefined ? {} : { hint }),
      ...(command.icon === undefined ? {} : { icon: command.icon }),
      ...(available ? {} : { unavailable: true }),
      act: () => runCommand(command, host, at),
    });
    entry.contextual ||= contextual === true;
    entry.reachable ||= available;
    byGroup.set(group, entry);
  }
  for (const { items, contextual, reachable } of byGroup.values()) {
    if (!contextual || reachable) groups.push(items);
  }

  // A rule between groups, never at an edge.
  return groups.flatMap((items, index) => (index === 0 ? items : [{ divider: true as const }, ...items]));
}
