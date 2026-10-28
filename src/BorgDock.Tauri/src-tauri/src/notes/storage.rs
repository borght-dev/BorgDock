//! Note files: one `.md` per note in a vault folder that may be shared
//! between machines by a sync client, and that Obsidian or an agent may
//! edit at the same time. Writes are atomic (a temp file in the same folder
//! renamed over the target) and refuse to overwrite text the writer has not
//! read. Paths are vault-relative with `/` separators.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const NOTE_EXTENSION: &str = "md";
const TEMP_PREFIX: &str = ".tmp-";
const TRASH_DIR: &str = ".trash";
/// A vault is notes, not a disk: stop listing past this many files.
const LIST_LIMIT: usize = 20_000;

/// One writer at a time, so two saves of one note can't interleave.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct NoteFile {
    pub path: String,
    pub modified_ms: f64,
    pub size: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct NoteContent {
    pub path: String,
    /// `None`: the note is gone or can't be read.
    pub contents: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum NoteWriteOutcome {
    Written,
    /// The file holds other text than the writer last read. `disk` is what
    /// it holds, `None` when the file is gone.
    Conflict { disk: Option<String> },
}

fn millis(time: SystemTime) -> f64 {
    time.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

fn is_note(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(NOTE_EXTENSION))
}

/// The file a vault-relative note path names. Refuses absolute paths, `..`,
/// hidden parts (`.obsidian/`, `.trash/`) and anything but a `.md` file, so
/// a note path can never reach outside the vault.
pub fn resolve(dir: &Path, path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(path);
    if path.trim().is_empty() || !is_note(relative) {
        return Err(format!("Not a note: {path}"));
    }
    let mut resolved = dir.to_path_buf();
    for component in relative.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part.starts_with('.') || part.trim().is_empty() {
                    return Err(format!("Not a note: {path}"));
                }
                resolved.push(part.as_ref());
            }
            _ => return Err(format!("Not a note: {path}")),
        }
    }
    Ok(resolved)
}

fn relative_of(dir: &Path, file: &Path) -> Option<String> {
    let relative = file.strip_prefix(dir).ok()?;
    let parts: Vec<String> = relative
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    Some(parts.join("/"))
}

/// Every note in the vault, skipping hidden folders and files.
pub fn list(dir: &Path) -> Result<Vec<NoteFile>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut notes = Vec::new();
    let mut pending = vec![dir.to_path_buf()];
    while let Some(folder) = pending.pop() {
        let Ok(entries) = fs::read_dir(&folder) else {
            continue;
        };
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if file_type.is_dir() {
                pending.push(path);
            } else if file_type.is_file() && is_note(&path) {
                let Ok(metadata) = entry.metadata() else {
                    continue;
                };
                let Some(relative) = relative_of(dir, &path) else {
                    continue;
                };
                notes.push(NoteFile {
                    path: relative,
                    modified_ms: metadata.modified().map(millis).unwrap_or(0.0),
                    size: metadata.len() as f64,
                });
                if notes.len() >= LIST_LIMIT {
                    break;
                }
            }
        }
    }
    notes.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(notes)
}

/// The text of each note; a note that can't be read comes back as `None`.
pub fn read_many(dir: &Path, paths: &[String]) -> Vec<NoteContent> {
    paths
        .iter()
        .map(|path| NoteContent {
            path: path.clone(),
            contents: resolve(dir, path)
                .ok()
                .and_then(|file| fs::read_to_string(file).ok()),
        })
        .collect()
}

fn write_atomically(target: &Path, contents: &str) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "A note needs a folder".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = parent.join(format!("{TEMP_PREFIX}{}.md", uuid::Uuid::new_v4()));
    let written = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        // Replaces the target in one step on Windows (MoveFileExW with
        // MOVEFILE_REPLACE_EXISTING) and on Unix.
        fs::rename(&temp, target)
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&temp);
        return Err(e.to_string());
    }
    Ok(())
}

/// Write a note over `base`, the text the writer last read. `None` creates
/// the note and refuses when it already exists. When the file holds other
/// text, nothing is written and the outcome carries what it holds.
pub fn write(
    dir: &Path,
    path: &str,
    contents: &str,
    base: Option<&str>,
) -> Result<NoteWriteOutcome, String> {
    let target = resolve(dir, path)?;
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let disk = match fs::read_to_string(&target) {
        Ok(disk) => Some(disk),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.to_string()),
    };
    if disk.as_deref() != base {
        return Ok(NoteWriteOutcome::Conflict { disk });
    }
    if disk.as_deref() == Some(contents) {
        return Ok(NoteWriteOutcome::Written);
    }
    write_atomically(&target, contents)?;
    Ok(NoteWriteOutcome::Written)
}

/// Move a note to another path. Refuses to replace a note that exists.
pub fn rename(dir: &Path, from: &str, to: &str) -> Result<(), String> {
    let source = resolve(dir, from)?;
    let target = resolve(dir, to)?;
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    if !source.exists() {
        return Err(format!("{from} is gone."));
    }
    let same_file = source.to_string_lossy().to_lowercase() == target.to_string_lossy().to_lowercase();
    if target.exists() && !same_file {
        return Err(format!("{to} already exists."));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&source, &target).map_err(|e| e.to_string())
}

/// Move a note into the vault's `.trash/` folder, as Obsidian does.
pub fn trash(dir: &Path, path: &str) -> Result<(), String> {
    let source = resolve(dir, path)?;
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    if !source.exists() {
        return Ok(());
    }
    let mut target = dir.join(TRASH_DIR).join(path);
    if target.exists() {
        let stem = target
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let stamp = millis(SystemTime::now()) as u64;
        target.set_file_name(format!("{stem} {stamp}.md"));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&source, &target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(dir: &Path, path: &str, body: &str) {
        let file = dir.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, body).unwrap();
    }

    #[test]
    fn lists_notes_in_folders_and_skips_hidden_ones() {
        let dir = tempfile::tempdir().unwrap();
        note(dir.path(), "Inbox.md", "a");
        note(dir.path(), "Daily/2026-10-28.md", "b");
        note(dir.path(), ".obsidian/workspace.md", "c");
        note(dir.path(), "Projects/.tmp-123.md", "d");
        note(dir.path(), "Projects/diagram.png", "e");
        let paths: Vec<String> = list(dir.path()).unwrap().into_iter().map(|n| n.path).collect();
        assert_eq!(paths, vec!["Daily/2026-10-28.md", "Inbox.md"]);
    }

    #[test]
    fn a_missing_vault_lists_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(list(&dir.path().join("gone")).unwrap().is_empty());
    }

    #[test]
    fn refuses_paths_outside_the_vault() {
        let dir = tempfile::tempdir().unwrap();
        for path in ["../x.md", "/abs.md", ".obsidian/a.md", "a/../../b.md", "note.txt", ""] {
            assert!(resolve(dir.path(), path).is_err(), "{path}");
        }
        assert!(resolve(dir.path(), "Projects/Plan.md").is_ok());
    }

    #[test]
    fn creates_a_note_and_refuses_to_create_it_twice() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            write(dir.path(), "Projects/Plan.md", "one", None).unwrap(),
            NoteWriteOutcome::Written
        );
        assert_eq!(
            write(dir.path(), "Projects/Plan.md", "two", None).unwrap(),
            NoteWriteOutcome::Conflict {
                disk: Some("one".to_string())
            }
        );
        assert_eq!(fs::read_to_string(dir.path().join("Projects/Plan.md")).unwrap(), "one");
    }

    #[test]
    fn writes_only_over_the_text_the_writer_read() {
        let dir = tempfile::tempdir().unwrap();
        note(dir.path(), "Plan.md", "mine");
        assert_eq!(
            write(dir.path(), "Plan.md", "edited", Some("mine")).unwrap(),
            NoteWriteOutcome::Written
        );
        assert_eq!(
            write(dir.path(), "Plan.md", "stale edit", Some("mine")).unwrap(),
            NoteWriteOutcome::Conflict {
                disk: Some("edited".to_string())
            }
        );
        assert_eq!(fs::read_to_string(dir.path().join("Plan.md")).unwrap(), "edited");
    }

    #[test]
    fn a_note_deleted_elsewhere_is_a_conflict_not_a_new_file() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            write(dir.path(), "Plan.md", "edited", Some("mine")).unwrap(),
            NoteWriteOutcome::Conflict { disk: None }
        );
        assert!(!dir.path().join("Plan.md").exists());
    }

    #[test]
    fn reads_many_and_reports_missing_ones() {
        let dir = tempfile::tempdir().unwrap();
        note(dir.path(), "A.md", "a");
        let read = read_many(dir.path(), &["A.md".to_string(), "B.md".to_string()]);
        assert_eq!(read[0].contents.as_deref(), Some("a"));
        assert_eq!(read[1].contents, None);
    }

    #[test]
    fn renames_without_replacing_another_note() {
        let dir = tempfile::tempdir().unwrap();
        note(dir.path(), "A.md", "a");
        note(dir.path(), "B.md", "b");
        assert!(rename(dir.path(), "A.md", "B.md").is_err());
        rename(dir.path(), "A.md", "Projects/C.md").unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("Projects/C.md")).unwrap(), "a");
        assert!(!dir.path().join("A.md").exists());
    }

    #[test]
    fn trash_moves_a_note_aside_and_keeps_both_copies() {
        let dir = tempfile::tempdir().unwrap();
        note(dir.path(), "A.md", "first");
        trash(dir.path(), "A.md").unwrap();
        note(dir.path(), "A.md", "second");
        trash(dir.path(), "A.md").unwrap();
        assert!(!dir.path().join("A.md").exists());
        assert_eq!(fs::read_to_string(dir.path().join(".trash/A.md")).unwrap(), "first");
        let trashed = fs::read_dir(dir.path().join(".trash")).unwrap().count();
        assert_eq!(trashed, 2);
    }
}
