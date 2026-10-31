/**
 * Counting indentation the way ADR-0020's tenth entry says import changes it,
 * worked out from the text and not from the parser, so the report's count is
 * checked against the file rather than against itself.
 *
 * Title-page continuations keep their single tab (ADR-0020, PR #84): they are
 * written back as the same tab, so they are neither dropped nor counted. Any
 * other indentation, on the title page or in the body, is.
 */
const TITLE_PAGE_KEY = /^[A-Za-z][A-Za-z0-9 _-]*:/;
const TITLE_PAGE_CONTINUATION = "\t";

/**
 * The text with its indentation taken off, and how many lines that touched.
 * Expects normalised text (LF line endings).
 */
export function withoutIndentation(text: string): { text: string; lines: number } {
  const source = text.split("\n");
  const titlePage = TITLE_PAGE_KEY.test(source[0] ?? "");
  let inTitlePage = titlePage;
  let lines = 0;

  const dedented = source.map((line) => {
    if (inTitlePage && line === "") inTitlePage = false;
    const indent = /^[ \t]+(?=\S)/.exec(line)?.[0];
    if (indent === undefined) return line;
    if (inTitlePage && indent === TITLE_PAGE_CONTINUATION) return line;
    lines += 1;
    return line.slice(indent.length);
  });
  return { text: dedented.join("\n"), lines };
}
