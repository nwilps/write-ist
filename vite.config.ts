import { defineConfig } from "vite";

/**
 * The webview's build.
 *
 * The parser, serialiser and everything else in `src/` are TypeScript running
 * *in the webview* (ADR-0024), so they are bundled into the page rather than
 * reached across an IPC boundary. Nothing on the keystroke path crosses into
 * Rust.
 */
export default defineConfig({
  root: "app",
  // Tauri drives this, and clearing the screen hides its output.
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2023",
    // A writer's file is never in the bundle, so readable output costs nothing
    // and makes the shipped page diagnosable — ADR-0012's reasoning, applied
    // to the application rather than to a sidecar.
    minify: false,
    sourcemap: true,
  },
});
