//! Moving a project's folder: renaming a project, and deleting one, which is
//! moving it into `Deleted Projects` (`src/project/rename.ts`,
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
        if !path.is_absolute()
            || path
                .components()
                .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
        {
            return Err(refused(format!("{} is not a plain path", path.display())));
        }
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
        fs::create_dir(root.join("Deleted Projects")).unwrap();
        let to = root.join("Deleted Projects").join("Paper Boats");

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
