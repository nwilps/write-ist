// Prevents a console window opening alongside the application on Windows.
// Slice 1 ships Linux only (ADR-0001); the attribute costs nothing and keeps
// the later platforms from needing a change here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    write_ist_lib::run()
}
