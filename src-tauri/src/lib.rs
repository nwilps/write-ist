//! Write-ist's shell.
//!
//! It opens a window onto the system webview and registers the two plugins the
//! application reaches the outside world through. The engine is TypeScript and
//! runs in the webview (ADR-0024), so the only traffic across this boundary is
//! reading and writing files and asking the writer to choose one.
//!
//! There is **one** command, and it is here because the plugin cannot do what
//! ADR-0008 rule 5 asks for: see `commit_write`.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The newest write that has landed on each path, by the number the webview
/// gave it.
///
/// The webview gives up on a write that takes too long (#64), so that a disk
/// that never answers cannot hold the writer in the application. Giving up does
/// not stop the write: it may still land, seconds later, after a newer save has
/// already put the writer's later words on disk. This is what refuses it.
#[derive(Default)]
struct Landed(Mutex<HashMap<PathBuf, u64>>);

/// Finish an atomic write: **flush, then rename** (ADR-0008 rule 5).
///
/// The rule is *temp, flush, rename*, and the middle word is the one that needs
/// this command. `@tauri-apps/plugin-fs` writes the temporary file and renames
/// it, and exposes no way to flush between the two — so without this, a rename
/// can land against bytes the disk has not written yet, and a power cut leaves
/// the manuscript's name pointing at an empty or partial file. That is the
/// failure the rule exists to prevent, and it is not the one the rename alone
/// prevents.
///
/// The parent directory is flushed as well, because the rename *is* a directory
/// entry: the file's own bytes being durable does not make the name that now
/// refers to them durable. Unix only — Windows has no directory handle to sync
/// and its rename is already ordered — and slice 1 ships Linux (ADR-0001).
///
/// **`sequence` orders the writes to one path**, and a write numbered below one
/// that has already landed is thrown away rather than renamed over it. That is
/// not a failure — the newer words are on disk — so it answers `Ok`.
///
/// **Run off the main thread** (`async`). A command without it runs on the
/// thread that draws the window, so a flush the disk takes its time over would
/// freeze the window with it.
#[tauri::command(async)]
fn commit_write(
    temporary: String,
    path: String,
    sequence: u64,
    landed: tauri::State<'_, Landed>,
) -> Result<(), String> {
    commit(&landed, Path::new(&temporary), Path::new(&path), sequence)
        .map_err(|error| error.to_string())
}

fn commit(landed: &Landed, temporary: &Path, path: &Path, sequence: u64) -> std::io::Result<()> {
    // Held across the flush and the rename, so two writes to one path finish
    // one at a time and the check below cannot go stale while one is running.
    // A panic elsewhere while holding it leaves the map as it was, which is
    // still true, so a poisoned lock is taken rather than refused.
    let mut landed = landed.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if landed.get(path).is_some_and(|&newest| newest >= sequence) {
        return fs::remove_file(temporary);
    }

    OpenOptions::new().write(true).open(temporary)?.sync_all()?;
    fs::rename(temporary, path)?;

    #[cfg(unix)]
    if let Some(folder) = path.parent() {
        File::open(folder)?.sync_all()?;
    }

    landed.insert(path.to_path_buf(), sequence);
    Ok(())
}

/// Linux draws no title bar (ADR-0036). `tauri.linux.conf.json` says so, but a
/// stale build or a toolkit that draws its own client-side bar on Wayland can
/// leave one anyway, so the window is told again once it exists. Other
/// platforms keep the operating system's bar.
#[cfg(target_os = "linux")]
fn drop_title_bar(app: &mut tauri::App) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.set_decorations(false) {
            eprintln!("Write-ist could not remove the title bar: {error}");
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn drop_title_bar(_app: &mut tauri::App) {}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Landed::default())
        .setup(|app| {
            drop_title_bar(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commit_write])
        .run(tauri::generate_context!())
        .expect("Write-ist could not open a window");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A folder of its own under the system's temporary directory, removed
    /// when the test is done with it.
    struct Folder(PathBuf);

    impl Folder {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir()
                .join(format!("write-ist-commit-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Folder(path)
        }
    }

    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn written(folder: &Folder, name: &str, text: &str) -> PathBuf {
        let path = folder.0.join(name);
        fs::write(&path, text).unwrap();
        path
    }

    #[test]
    fn renames_the_temporary_file_over_the_manuscript() {
        let folder = Folder::new("renames");
        let manuscript = written(&folder, "manuscript.fountain", "OLD");
        let temporary = written(&folder, "manuscript.fountain.writing-1", "NEW");

        commit(&Landed::default(), &temporary, &manuscript, 1).unwrap();

        assert_eq!(fs::read_to_string(&manuscript).unwrap(), "NEW");
        assert!(!temporary.exists());
    }

    #[test]
    fn a_write_that_lands_after_a_newer_one_is_thrown_away() {
        let folder = Folder::new("late");
        let landed = Landed::default();
        let manuscript = written(&folder, "manuscript.fountain", "OLD");
        let earlier = written(&folder, "manuscript.fountain.writing-1", "EARLIER");
        let later = written(&folder, "manuscript.fountain.writing-2", "LATER");

        // The webview gave up on write 1 and made write 2, which landed. Then
        // write 1 arrived after all.
        commit(&landed, &later, &manuscript, 2).unwrap();
        commit(&landed, &earlier, &manuscript, 1).unwrap();

        assert_eq!(fs::read_to_string(&manuscript).unwrap(), "LATER");
        // Nothing is left lying in the bundle beside the manuscript.
        assert!(!earlier.exists());
        assert!(!later.exists());
    }

    #[test]
    fn orders_each_path_on_its_own() {
        let folder = Folder::new("paths");
        let landed = Landed::default();
        let one = written(&folder, "one.fountain", "OLD");
        let two = written(&folder, "two.fountain", "OLD");

        commit(&landed, &written(&folder, "one.writing", "ONE"), &one, 5).unwrap();
        commit(&landed, &written(&folder, "two.writing", "TWO"), &two, 3).unwrap();

        assert_eq!(fs::read_to_string(&two).unwrap(), "TWO");
    }
}
