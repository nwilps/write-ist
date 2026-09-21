//! Write-ist's shell.
//!
//! It opens a window onto the system webview and registers the two plugins the
//! application reaches the outside world through. The engine is TypeScript and
//! runs in the webview (ADR-0024), so the only traffic across this boundary is
//! reading and writing files and asking the writer to choose one.
//!
//! There is **one** command, and it is here because the plugin cannot do what
//! ADR-0008 rule 5 asks for: see `commit_write`.

use std::fs::{self, File, OpenOptions};
use std::path::Path;

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
#[tauri::command]
fn commit_write(temporary: String, path: String) -> Result<(), String> {
    commit(Path::new(&temporary), Path::new(&path)).map_err(|error| error.to_string())
}

fn commit(temporary: &Path, path: &Path) -> std::io::Result<()> {
    OpenOptions::new().write(true).open(temporary)?.sync_all()?;
    fs::rename(temporary, path)?;

    #[cfg(unix)]
    if let Some(folder) = path.parent() {
        File::open(folder)?.sync_all()?;
    }

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![commit_write])
        .run(tauri::generate_context!())
        .expect("Write-ist could not open a window");
}
