/**
 * Building a piece of the page.
 *
 * One helper, because **real text on the page** is a requirement rather than a
 * convenience (#37): every name, count and label the writer sees is text a
 * screen reader can read and a writer can select, so the screens build
 * ordinary elements and set `textContent`. Nothing here takes HTML, which is
 * what keeps a writer's title — `BRICK & STEEL` — from ever being parsed as
 * markup.
 */

/** Build an element, set its plain properties, and give it its children. */
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  properties: Partial<HTMLElementTagNameMap[K]> = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), properties);
  node.append(...children);
  return node;
}
