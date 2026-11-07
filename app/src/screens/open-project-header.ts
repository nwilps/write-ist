/**
 * The Open Project screen's header: OPEN PROJECT, drawn in characters (the
 * Open Project design, ADR-0043).
 *
 * Seventeen lines, 91 columns at the widest, copied exactly from the design's
 * `open-project.txt` — every space, the blank line between the two words, the
 * one `¯`, the ten fullwidth `＼` (U+FF3C) in the N, and the seven newlines
 * the file ends with. **Do not tidy it**: `test/app/open-project-header.test.ts`
 * holds it byte for byte against `test/fixtures/open-project-header.txt`. It is
 * `String.raw` so the backslashes are the art's rather than escapes.
 */
export const OPEN_PROJECT_ART = String.raw`
            __________   __________   __________   _____    ___
           /\   ____  \ /\   ____  \ /\   ______\ /\    ＼ /\  \
           \ \  \   \  \\ \  \___\  \\ \  \____ / \ \     ＼ \  \
            \ \  \   \  \\ \   ______\\ \   ___\   \ \  \＼ ＼\  \
             \ \  \   \  \\ \  \_____/ \ \  \__/    \ \  \ ＼  \  \
              \ \  \___\  \\ \  \       \ \  \_______\ \  \＼＼    \
               \ \_________\\ \__\       \ \_________\\ \__\ ＼＼___\
                \/_________/ \/__/        \/_________/ \/__/   ＼___/

 __________   __________   __________        _____   __________   __________  ___________
/\   ____  \ /\   ____  \ /\   ____  \      /\__  \ /\   ______\ /\   ______\/\____   ___\
\ \  \___\  \\ \  \___\  \\ \  \   \  \     \/_/\  \\ \  \____ / \ \  \ ____/\/___/\  \ _/
 \ \   ______\\ \       __\\ \  \   \  \       \ \  \\ \   ___\   \ \  \          \ \  \
  \ \  \_____/ \ \   ___ \/ \ \  \   \  \   ___ \ \  \\ \  \__/    \ \  \          \ \  \
   \ \  \       \ \  \_/\ ¯\_\ \  \___\  \ /\  \_\_\  \\ \  \_______\ \  \_______   \ \  \
    \ \__\       \ \__\\ \___\\ \_________\\ \_________\\ \_________\\ \_________\   \ \__\
     \/__/        \/__/ \/___/ \/_________/ \/_________/ \/_________/ \/_________/    \/__/






`.slice(1);

/**
 * The header as drawn: the seventeen lines, without the newlines the file ends
 * with. Drawn, those would be six empty lines of space under the art that the
 * design does not have (its header is 154px tall: seventeen 9px lines).
 */
export const OPEN_PROJECT_HEADER = OPEN_PROJECT_ART.replace(/\n+$/, "");
