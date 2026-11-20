//! Moving a project's folder: renaming a project, and deleting one, which is
//! moving it into the `Graveyard` (`src/project/rename.ts`,
//! `src/project/delete.ts`).
//!
//! Its own module, with nothing from Tauri in it, so that the one piece of the
//! shell that moves a writer's work can be compiled and tested on its own:
//! `rustc --edition 2021 --test src/folders.rs`.

use std::fs::{self, File};
use std::io;
use std::path::{Component, Path};

/// Whether a move failed because it would cross from one disk to another
/// (`EXDEV`: 18 on Linux and macOS).
pub fn crosses_disks(error: &io::Error) -> bool {
    cfg!(unix) && error.raw_os_error() == Some(18)
}

fn refused(why: String) -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, why)
}

/// Move the folder `from` to `to`, both inside `root`.
///
/// **Nothing is ever replaced.** The destination is claimed first with
/// `create_dir`, which fails if anything at all is there, and the rename then
/// lands on that empty folder — the only thing a rename of a folder may
/// replace, and the folder this made a moment ago. If something fills it in
/// between, the rename fails rather than replace it. On any failure the empty
/// folder is taken away again with `remove_dir`, which cannot remove anything
/// that is not empty, and `from` has not moved.
///
/// The rename is one call, atomic on one filesystem: the folder is either
/// where it was or where it went, never half of each. Across two filesystems
/// it fails with `EXDEV`, and that failure is the answer — no copy is made.
pub fn move_within(root: &Path, from: &Path, to: &Path) -> io::Result<()> {
    for path in [from, to] {
        plain(path)?;
    }
    let root = root.canonicalize()?;

    // A link is not a project's folder, and moving one moves only the link.
    if !fs::symlink_metadata(from)?.is_dir() {
        return Err(refused(format!("{} is not a folder", from.display())));
    }
    let from = from.canonicalize()?;
    if from == root || !from.starts_with(&root) {
        return Err(refused(format!("{} is not inside the projects folder", from.display())));
    }

    let (Some(parent), Some(name)) = (to.parent(), to.file_name()) else {
        return Err(refused(format!("{} has no folder to go in", to.display())));
    };
    let to = parent.canonicalize()?.join(name);
    if !to.starts_with(&root) || to == root {
        return Err(refused(format!("{} is not inside the projects folder", to.display())));
    }
    if to.starts_with(&from) {
        return Err(refused(format!("{} is inside {}", to.display(), from.display())));
    }

    fs::create_dir(&to)?;
    if let Err(error) = rename_onto_claimed(&from, &to) {
        let _ = fs::remove_dir(&to);
        return Err(error);
    }

    // The rename is two directory entries. Made durable where the platform
    // can; the move has happened either way, so a refused flush is not a failure.
    #[cfg(unix)]
    for folder in [from.parent(), to.parent()].into_iter().flatten() {
        if let Err(error) = File::open(folder).and_then(|handle| handle.sync_all()) {
            eprintln!("Write-ist moved a folder but could not flush {}: {error}", folder.display());
        }
    }
    Ok(())
}

/// Remove the folder `path`, inside `root`, **only if it is empty**:
/// `remove_dir` cannot remove a folder with anything in it.
pub fn remove_empty_within(root: &Path, path: &Path) -> io::Result<()> {
    plain(path)?;
    let root = root.canonicalize()?;
    if !fs::symlink_metadata(path)?.is_dir() {
        return Err(refused(format!("{} is not a folder", path.display())));
    }
    let path = path.canonicalize()?;
    if path == root || !path.starts_with(&root) {
        return Err(refused(format!("{} is not inside the projects folder", path.display())));
    }
    fs::remove_dir(path)
}

/// The folder deleted projects are moved into, inside the projects folder
/// (`GRAVEYARD_FOLDER` in `src/project/bundle.ts`).
pub const GRAVEYARD_FOLDER: &str = "Graveyard";

/// A project's marker, the file that makes a folder a project
/// (`MARKER_FILE` in `src/project/bundle.ts`).
pub const MARKER_FILE: &str = "project.md";

/// Erase one project in the Graveyard, for good: **Exile**, the one
/// intentional erase in Write-ist (ADR-0044).
///
/// Narrower than a recursive delete on purpose. `path` must be a plain,
/// absolute path to a real folder — not a link, not a file — whose parent is
/// exactly `root/Graveyard`, itself a real folder directly inside `root`. It
/// is never `root`, never the Graveyard, never anything deeper in the
/// Graveyard, never a hidden folder, and never anything outside it. Its
/// `project.md` must be a real file holding `project_id`, read here a moment
/// before the erase, so the project erased is the one the writer chose, on
/// disk now. Anything else is refused, and nothing is touched.
///
/// The erase is `remove_dir_all` on that one folder, which removes a link
/// inside it and never follows one out of it.
pub fn exile_within(root: &Path, path: &Path, project_id: &str) -> io::Result<()> {
    plain(path)?;
    if project_id.trim().is_empty() {
        return Err(refused("No project id was given".to_string()));
    }
    // Named as the Graveyard lists it, not reached by another way round.
    if path.parent() != Some(root.join(GRAVEYARD_FOLDER).as_path()) {
        return Err(refused(format!("{} is not in the Graveyard", path.display())));
    }
    let root = root.canonicalize()?;

    // The Graveyard is a real folder directly inside the projects folder.
    let graveyard = root.join(GRAVEYARD_FOLDER);
    if !fs::symlink_metadata(&graveyard)?.is_dir() || graveyard.canonicalize()? != graveyard {
        return Err(refused(format!("{} is not the Graveyard", graveyard.display())));
    }

    // A real folder, not a link and not a file.
    if !fs::symlink_metadata(path)?.is_dir() {
        return Err(refused(format!("{} is not a folder", path.display())));
    }
    let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
        return Err(refused(format!("{} is not in the Graveyard", path.display())));
    };
    // Directly in the Graveyard: not the Graveyard, not deeper, not hidden.
    let path = parent.canonicalize()?.join(name);
    if path.parent() != Some(graveyard.as_path()) || name.to_string_lossy().starts_with('.') {
        return Err(refused(format!("{} is not a project in the Graveyard", path.display())));
    }
    if path.canonicalize()? != path {
        return Err(refused(format!("{} is not a plain folder", path.display())));
    }

    // The project the writer chose, on disk now.
    let marker = path.join(MARKER_FILE);
    if !fs::symlink_metadata(&marker)?.is_file() {
        return Err(refused(format!("{} has no project marker", path.display())));
    }
    if project_id_in(&fs::read_to_string(&marker)?) != Some(project_id.trim()) {
        return Err(refused(format!("{} is not the project that was chosen", path.display())));
    }

    fs::remove_dir_all(&path)?;
    #[cfg(unix)]
    if let Err(error) = File::open(&graveyard).and_then(|handle| handle.sync_all()) {
        eprintln!("Write-ist exiled a project but could not flush {}: {error}", graveyard.display());
    }
    Ok(())
}

/// The `Project id:` a marker holds, read as `parseMarker` reads it
/// (`src/project/marker.ts`): the first line that labels it.
fn project_id_in(marker: &str) -> Option<&str> {
    marker
        .lines()
        .find_map(|line| line.strip_prefix("Project id:"))
        .map(str::trim)
        .filter(|id| !id.is_empty())
}

fn plain(path: &Path) -> io::Result<()> {
    if !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
    {
        return Err(refused(format!("{} is not a plain path", path.display())));
    }
    Ok(())
}

/// Unix renames a folder over an empty one. Windows will not, so there the
/// claimed folder is let go just before the rename, which still never replaces
/// anything: Windows refuses to rename over a folder that exists.
#[cfg(unix)]
fn rename_onto_claimed(from: &Path, to: &Path) -> io::Result<()> {
    fs::rename(from, to)
}

#[cfg(not(unix))]
fn rename_onto_claimed(from: &Path, to: &Path) -> io::Result<()> {
    fs::remove_dir(to)?;
    fs::rename(from, to)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// A folder of its own under the system's temporary directory, removed
    /// when the test is done with it.
    struct Folder(PathBuf);

    impl Folder {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir()
                .join(format!("write-ist-folders-{name}-{}", std::process::id()));
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

    /// A projects folder with one project in it, holding one file.
    fn projects_with(folder: &Folder, name: &str) -> (PathBuf, PathBuf) {
        let root = folder.0.join("write-ist");
        let project = root.join(name);
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("manuscript.fountain"), "Title: Paper Boats\n").unwrap();
        (root, project)
    }

    #[test]
    fn moves_a_project_folder_whole() {
        let folder = Folder::new("move");
        let (root, project) = projects_with(&folder, "Paper Boats");
        fs::create_dir(root.join("Graveyard")).unwrap();
        let to = root.join("Graveyard").join("Paper Boats");

        move_within(&root, &project, &to).unwrap();

        assert!(!project.exists());
        assert_eq!(fs::read_to_string(to.join("manuscript.fountain")).unwrap(), "Title: Paper Boats\n");
    }

    #[test]
    fn never_replaces_anything_at_the_destination_not_even_an_empty_folder() {
        let folder = Folder::new("collide");
        let (root, project) = projects_with(&folder, "Paper Boats");
        let full = root.join("Quiet Road");
        fs::create_dir(&full).unwrap();
        fs::write(full.join("manuscript.fountain"), "Title: Quiet Road\n").unwrap();
        let empty = root.join("Empty");
        fs::create_dir(&empty).unwrap();

        assert!(move_within(&root, &project, &full).is_err());
        assert!(move_within(&root, &project, &empty).is_err());

        // Both left exactly as they were.
        assert_eq!(fs::read_to_string(project.join("manuscript.fountain")).unwrap(), "Title: Paper Boats\n");
        assert_eq!(fs::read_to_string(full.join("manuscript.fountain")).unwrap(), "Title: Quiet Road\n");
        assert!(empty.is_dir() && fs::read_dir(&empty).unwrap().next().is_none());
    }

    #[test]
    fn a_failed_move_leaves_the_original_and_no_claimed_folder() {
        let folder = Folder::new("fails");
        let (root, project) = projects_with(&folder, "Paper Boats");
        // The destination's folder does not exist, so nothing can be claimed.
        let to = root.join("Nowhere").join("Paper Boats");

        assert!(move_within(&root, &project, &to).is_err());
        assert!(project.join("manuscript.fountain").exists());
        assert!(!root.join("Nowhere").exists());
    }

    #[test]
    fn refuses_a_move_into_itself() {
        let folder = Folder::new("itself");
        let (root, project) = projects_with(&folder, "Paper Boats");

        assert!(move_within(&root, &project, &project.join("inside")).is_err());
        assert!(!project.join("inside").exists());
        assert!(project.join("manuscript.fountain").exists());
    }

    #[test]
    fn moves_nothing_outside_the_projects_folder() {
        let folder = Folder::new("outside");
        let (root, project) = projects_with(&folder, "Paper Boats");
        let elsewhere = folder.0.join("elsewhere");
        fs::create_dir(&elsewhere).unwrap();

        // Out of it, into it, the folder itself, and a path that climbs.
        assert!(move_within(&root, &project, &folder.0.join("Paper Boats")).is_err());
        assert!(move_within(&root, &elsewhere, &root.join("elsewhere")).is_err());
        assert!(move_within(&root, &root, &folder.0.join("moved")).is_err());
        assert!(move_within(&root, &project, &root.join("..").join("climbed")).is_err());

        assert!(project.join("manuscript.fountain").exists());
        assert!(elsewhere.is_dir());
        assert!(!folder.0.join("Paper Boats").exists() && !folder.0.join("climbed").exists());
    }

    #[test]
    fn removes_only_an_empty_folder_inside_the_projects_folder() {
        let folder = Folder::new("remove");
        let (root, project) = projects_with(&folder, "Paper Boats");
        let empty = root.join("Empty");
        fs::create_dir(&empty).unwrap();
        let outside = folder.0.join("Outside");
        fs::create_dir(&outside).unwrap();

        assert!(remove_empty_within(&root, &project).is_err());
        assert!(remove_empty_within(&root, &project.join("manuscript.fountain")).is_err());
        assert!(remove_empty_within(&root, &outside).is_err());
        assert!(remove_empty_within(&root, &root).is_err());
        assert!(project.join("manuscript.fountain").exists() && outside.is_dir());

        remove_empty_within(&root, &empty).unwrap();
        assert!(!empty.exists());
    }

    /// A projects folder with one invented project in its Graveyard, and the
    /// writer's ledger beside it in a folder of its own, as app data is.
    fn graveyard_with(folder: &Folder, name: &str, id: &str) -> (PathBuf, PathBuf) {
        let root = folder.0.join("write-ist");
        let project = root.join(GRAVEYARD_FOLDER).join(name);
        fs::create_dir_all(project.join("drafts")).unwrap();
        fs::write(project.join("manuscript.fountain"), "Title: Paper Boats\n").unwrap();
        fs::write(project.join("drafts").join("1.fountain"), "INT. HARBOUR - DAY\n").unwrap();
        fs::write(
            project.join(MARKER_FILE),
            format!("# {name}\n\nFormat version: 1\nProject id: {id}\nFormat: Feature\n"),
        )
        .unwrap();
        (root, project)
    }

    #[test]
    fn exiles_one_project_in_the_graveyard_and_nothing_else() {
        let folder = Folder::new("exile");
        let (root, project) = graveyard_with(&folder, "Paper Boats", "id-boats");
        let neighbour = root.join(GRAVEYARD_FOLDER).join("Quiet Road");
        fs::create_dir(&neighbour).unwrap();
        fs::write(neighbour.join(MARKER_FILE), "# Quiet Road\n\nProject id: id-road\n").unwrap();
        let live = root.join("Still Here");
        fs::create_dir(&live).unwrap();
        let data = folder.0.join("app-data");
        fs::create_dir(&data).unwrap();
        let ledger = "day\t2026-11-18\tid-boats\t1200\t9\tPaper Boats\n";
        fs::write(data.join("ledger.txt"), ledger).unwrap();

        exile_within(&root, &project, "id-boats").unwrap();

        assert!(!project.exists());
        assert!(neighbour.join(MARKER_FILE).exists());
        assert!(live.is_dir());
        assert!(root.join(GRAVEYARD_FOLDER).is_dir());
        // History is the writer's, not the bundle's (ADR-0017).
        assert_eq!(fs::read_to_string(data.join("ledger.txt")).unwrap(), ledger);
    }

    #[test]
    fn exiles_nothing_but_a_project_directly_inside_the_graveyard() {
        let folder = Folder::new("exile-where");
        let (root, project) = graveyard_with(&folder, "Paper Boats", "id-boats");
        let graveyard = root.join(GRAVEYARD_FOLDER);
        // A live project, with a marker, outside the Graveyard.
        let live = root.join("Quiet Road");
        fs::create_dir(&live).unwrap();
        fs::write(live.join(MARKER_FILE), "# Quiet Road\n\nProject id: id-road\n").unwrap();
        // A folder outside the projects folder altogether.
        let outside = folder.0.join("Elsewhere");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join(MARKER_FILE), "# Elsewhere\n\nProject id: id-else\n").unwrap();
        // A project inside a project in the Graveyard: deeper than one step.
        let deeper = project.join("Nested");
        fs::create_dir(&deeper).unwrap();
        fs::write(deeper.join(MARKER_FILE), "# Nested\n\nProject id: id-nested\n").unwrap();
        // A hidden folder in the Graveyard.
        let hidden = graveyard.join(".Hidden");
        fs::create_dir(&hidden).unwrap();
        fs::write(hidden.join(MARKER_FILE), "# Hidden\n\nProject id: id-hidden\n").unwrap();

        assert!(exile_within(&root, &root, "id-boats").is_err());
        assert!(exile_within(&root, &graveyard, "id-boats").is_err());
        assert!(exile_within(&root, &live, "id-road").is_err());
        assert!(exile_within(&root, &outside, "id-else").is_err());
        assert!(exile_within(&root, &deeper, "id-nested").is_err());
        assert!(exile_within(&root, &hidden, "id-hidden").is_err());
        assert!(exile_within(&root, &folder.0, "id-boats").is_err());

        assert!(root.is_dir() && graveyard.is_dir());
        for kept in [&live, &outside, &deeper, &hidden] {
            assert!(kept.join(MARKER_FILE).exists(), "{} was touched", kept.display());
        }
        assert!(project.join("manuscript.fountain").exists());
    }

    #[test]
    fn exiles_nothing_whose_project_id_is_not_the_one_chosen() {
        let folder = Folder::new("exile-id");
        let (root, project) = graveyard_with(&folder, "Paper Boats", "id-boats");

        assert!(exile_within(&root, &project, "id-road").is_err());
        assert!(exile_within(&root, &project, "").is_err());
        assert!(exile_within(&root, &project, "   ").is_err());
        // Replaced since the list was read: same folder, another project.
        fs::write(project.join(MARKER_FILE), "# Paper Boats\n\nProject id: id-other\n").unwrap();
        assert!(exile_within(&root, &project, "id-boats").is_err());

        assert!(project.join("manuscript.fountain").exists());
    }

    #[test]
    fn exiles_nothing_without_a_marker_that_is_a_real_file() {
        let folder = Folder::new("exile-marker");
        let (root, project) = graveyard_with(&folder, "Paper Boats", "id-boats");
        let graveyard = root.join(GRAVEYARD_FOLDER);
        let bare = graveyard.join("No Marker");
        fs::create_dir(&bare).unwrap();
        fs::write(bare.join("manuscript.fountain"), "Title: No Marker\n").unwrap();
        let folder_marker = graveyard.join("Folder Marker");
        fs::create_dir_all(folder_marker.join(MARKER_FILE)).unwrap();

        assert!(exile_within(&root, &bare, "id-bare").is_err());
        assert!(exile_within(&root, &folder_marker, "id-folder").is_err());
        #[cfg(unix)]
        {
            // A marker that is a link to the real one is not this folder's marker.
            let linked = graveyard.join("Linked Marker");
            fs::create_dir(&linked).unwrap();
            std::os::unix::fs::symlink(project.join(MARKER_FILE), linked.join(MARKER_FILE)).unwrap();
            assert!(exile_within(&root, &linked, "id-boats").is_err());
            assert!(linked.is_dir());
        }
        assert!(bare.join("manuscript.fountain").exists() && folder_marker.is_dir());
        assert!(project.join(MARKER_FILE).exists());
    }

    #[test]
    fn exiles_nothing_by_a_relative_or_climbing_path() {
        let folder = Folder::new("exile-paths");
        let (root, project) = graveyard_with(&folder, "Paper Boats", "id-boats");
        let graveyard = root.join(GRAVEYARD_FOLDER);

        assert!(exile_within(&root, Path::new("write-ist/Graveyard/Paper Boats"), "id-boats").is_err());
        assert!(exile_within(&root, &graveyard.join("..").join(GRAVEYARD_FOLDER).join("Paper Boats"), "id-boats").is_err());
        assert!(exile_within(&root, &project.join("drafts").join(".."), "id-boats").is_err());
        assert!(project.join("manuscript.fountain").exists());
    }

    #[cfg(unix)]
    #[test]
    fn exiles_nothing_through_a_link() {
        let folder = Folder::new("exile-links");
        let (root, project) = graveyard_with(&folder, "Paper Boats", "id-boats");
        let graveyard = root.join(GRAVEYARD_FOLDER);
        // A live project, linked into the Graveyard.
        let live = root.join("Quiet Road");
        fs::create_dir(&live).unwrap();
        fs::write(live.join(MARKER_FILE), "# Quiet Road\n\nProject id: id-road\n").unwrap();
        let link = graveyard.join("Quiet Road");
        std::os::unix::fs::symlink(&live, &link).unwrap();

        assert!(exile_within(&root, &link, "id-road").is_err());
        assert!(live.join(MARKER_FILE).exists());
        assert!(fs::symlink_metadata(&link).is_ok());

        // A project's own folder reached through a linked parent.
        let alias = folder.0.join("Alias");
        std::os::unix::fs::symlink(&graveyard, &alias).unwrap();
        assert!(exile_within(&root, &alias.join("Paper Boats"), "id-boats").is_err());
        assert!(project.join(MARKER_FILE).exists());

        // A link inside the project is taken away with it, and never followed.
        let outside = folder.0.join("Outside");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("keep.txt"), "kept\n").unwrap();
        std::os::unix::fs::symlink(&outside, project.join("out")).unwrap();
        exile_within(&root, &project, "id-boats").unwrap();
        assert!(!project.exists());
        assert_eq!(fs::read_to_string(outside.join("keep.txt")).unwrap(), "kept\n");
    }

    #[cfg(unix)]
    #[test]
    fn exiles_nothing_when_the_graveyard_itself_is_a_link() {
        let folder = Folder::new("exile-graveyard-link");
        let root = folder.0.join("write-ist");
        fs::create_dir_all(&root).unwrap();
        let real = folder.0.join("Real Graveyard");
        let project = real.join("Paper Boats");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join(MARKER_FILE), "# Paper Boats\n\nProject id: id-boats\n").unwrap();
        std::os::unix::fs::symlink(&real, root.join(GRAVEYARD_FOLDER)).unwrap();

        assert!(exile_within(&root, &root.join(GRAVEYARD_FOLDER).join("Paper Boats"), "id-boats").is_err());
        assert!(project.join(MARKER_FILE).exists());
    }

    #[test]
    fn reads_the_project_id_as_the_marker_parser_does() {
        assert_eq!(project_id_in("# T\n\nFormat version: 1\nProject id: abc \nFormat: Feature\n"), Some("abc"));
        assert_eq!(project_id_in("# T\r\nProject id:\tabc\r\n"), Some("abc"));
        assert_eq!(project_id_in("# T\nProject id: first\nProject id: second\n"), Some("first"));
        assert_eq!(project_id_in("# T\nProject id:\n"), None);
        assert_eq!(project_id_in("# T\n  Project id: indented\n"), None);
    }

    #[test]
    fn moves_a_folder_and_never_a_file_or_a_link() {
        let folder = Folder::new("kinds");
        let (root, project) = projects_with(&folder, "Paper Boats");
        let file = project.join("manuscript.fountain");

        assert!(move_within(&root, &file, &root.join("moved")).is_err());
        #[cfg(unix)]
        {
            let link = root.join("Link");
            std::os::unix::fs::symlink(&project, &link).unwrap();
            assert!(move_within(&root, &link, &root.join("Moved Link")).is_err());
            assert!(link.exists());
        }
        assert!(file.exists());
    }
}
