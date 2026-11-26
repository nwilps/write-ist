# Starter workspace

Copy this folder to begin a new workspace. It is **not** in the application's list of workspaces
(`app/src/workspaces/registry.ts`) and must never be added to it as it is.

1. Copy `_template/` to `app/src/workspaces/<your-id>/`; rename `template.ts` and `templateWorkspace`.
2. Fill in the manifest in it: id, name, Alt key, icon, files.
3. Add your manifest to `WORKSPACES` in `app/src/workspaces/registry.ts`.

Import from `../../toolbox/index.ts` only. Every call is explained, with an example, in
[`docs/WORKSPACES.md`](../../../../docs/WORKSPACES.md); the rules are ADR-0045.
