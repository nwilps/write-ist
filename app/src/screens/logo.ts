/**
 * The home screen's logo: WRITE-IST, drawn in characters (the home design,
 * ADR-0042).
 *
 * Sixteen lines, 107 columns at the widest, copied exactly from the design's
 * `logo.txt` — every space, the one `¯`, the backslashes. **Do not tidy it**:
 * `test/app/home-logo.test.ts` holds it byte for byte against
 * `test/fixtures/home-logo.txt`. It is `String.raw` so the backslashes are the
 * art's rather than escapes, and it has no trailing newline, like the file.
 */
export const LOGO = String.raw`
  ___    ___    __________    ___________   ___________   __________
 /\  \   \  \  /\   ____  \  /\____   ___\ /\____   ___\ /\   ______\
 \ \  \   \  \ \ \  \___\  \ \/___/\  \__/ \/___/\  \__/ \ \  \____ /     _______
  \ \  \ __\  \ \ \       __\     \ \  \        \ \  \    \ \   ___\     /\______\
   \ \  \/ \\  \ \ \   ___ \/      \ \  \        \ \  \    \ \  \__/     \/______/
    \ \         \ \ \  \_/\ ¯\_    _\_\  \____    \ \  \    \ \  \_______
     \ \_________\ \ \__\\ \___\  /\__________\    \ \__\    \ \_________\
      \/_________/  \/__/ \/___/  \/__________/     \/__/     \/_________/
                                                                 ___________    __________    ___________
                                                                /\____   ___\  /\   ______\  /\____   ___\
                                                                \/___/\  \__/  \ \  \_______ \/___/\  \__/
                                                                     \ \  \     \ \_______  \     \ \  \
                                                                      \ \  \     \/______/\  \     \ \  \
                                                                      _\_\  \____    ____\_\  \     \ \  \
                                                                     /\__________\  /\_________\     \ \__\
                                                                     \/__________/  \/_________/      \/__/`.slice(1);
