//! Write-ist's shell.
//!
//! It opens a window onto the system webview and registers the two plugins the
//! application reaches the outside world through. There is deliberately no
//! command here: the engine is TypeScript and runs in the webview (ADR-0024),
//! so the only traffic across this boundary is reading and writing files and
//! asking the writer to choose one.

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("Write-ist could not open a window");
}
