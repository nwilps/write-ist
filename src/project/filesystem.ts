/**
 * The disk, as the project layer is allowed to see it.
 *
 * Everything above this file — importing, listing, the marker — is ordinary
 * TypeScript with no filesystem in it. That is deliberate and it is the whole
 * reason this interface exists: the application reaches the disk through
 * Tauri's filesystem plugin, and the tests reach it through `node:fs`, and
 * both are running the same code. Slice 1's testing decision is *"the disk,
 * with real files in a temporary folder"* — real files, not a fake, so this
 * port exists to let a temporary folder stand in for `~/Documents/write-ist/`
 * rather than to let the disk be mocked away.
 *
 * It stays narrow on purpose. Every question the project layer asks of the
 * disk is one of these, and the port stays cheap to implement twice.
 */

/** One entry directly inside a directory. */
export interface DirectoryEntry {
  readonly name: string;
  readonly isDirectory: boolean;
}

export interface Filesystem {
  /**
   * The entries directly inside a directory.
   *
   * **An absent directory reads as empty.** A writer who has never imported
   * anything has no `~/Documents/write-ist/` yet, and that is a first run
   * rather than an error (ADR-0016: *absent and unparseable are different*).
   */
  readDirectory(path: string): Promise<readonly DirectoryEntry[]>;

  /**
   * A file's bytes, exactly as they sit on disk.
   *
   * **Rejects when the file is absent or cannot be read.** It never resolves
   * to empty bytes: ADR-0008 rule 3 exists because v1 initialised empty state
   * from a failed read and the next save wrote it over the good file. A read
   * that could not happen has to be distinguishable from a file that is empty.
   */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * Write bytes to a file, **landing whole or not at all** — temp, flush,
   * rename (ADR-0008 rule 5).
   *
   * The atomicity is the implementation's to provide, because only it knows
   * what its platform offers. Nothing above this line may assume a partially
   * written file is possible.
   *
   * **A write its caller gave up on never lands over a later one.** The save
   * routine stops waiting for a disk that has not answered (#64), and stopping
   * waiting does not stop the write. If it lands at all, it lands before the
   * next write or not at all, so older words never replace newer ones.
   */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;

  /** Create a directory and any missing parents. Succeeds if it already exists. */
  createDirectory(path: string): Promise<void>;

  /**
   * Whether a path exists on disk.
   *
   * Needed above the bundle (ADR-0016 / ADR-0017): *absent* and *unreadable*
   * are different answers. Absent means first run; unreadable means refuse to
   * write. `readFile` rejects for both, so this is how a caller tells them apart.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Append bytes to a file without rewriting what is already there.
   *
   * Creates the file when it is absent. The ledger (ADR-0017) is append-only
   * so a crash can damage at most the last line; a full rewrite would put every
   * earlier day at risk again.
   */
  appendFile(path: string, bytes: Uint8Array): Promise<void>;
}

/**
 * Join path segments with `/`.
 *
 * Linux first (ADR-0001), and `/` is accepted by the Windows and macOS APIs
 * underneath Tauri too, so one separator serves all three. Empty segments are
 * dropped so that joining onto a root, or onto a path that already ends in a
 * separator, does not produce a doubled slash.
 */
export function join(...segments: readonly string[]): string {
  const parts: string[] = [];
  for (const [index, segment] of segments.entries()) {
    const trimmed = index === 0 ? segment.replace(/\/+$/, "") : segment.replace(/^\/+|\/+$/g, "");
    if (trimmed !== "") parts.push(trimmed);
  }
  return parts.join("/");
}

/** The last segment of a path — the file or folder's own name. */
export function basename(path: string): string {
  const segments = path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] ?? "";
}
