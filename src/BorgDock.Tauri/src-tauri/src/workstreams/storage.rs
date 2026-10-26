//! Workstream files: one `<id>.json` per workstream in a folder that may be
//! shared between machines by a sync client. Writes are atomic (a temp file
//! in the same folder renamed over the target) and refuse to overwrite a
//! revision the writer has not seen.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const EXTENSION: &str = ".json";
const BACKUP_SUFFIX: &str = ".json.bak";
const TEMP_PREFIX: &str = ".tmp-";
const TRASH_DIR: &str = ".trash";
const CORRUPT_DIR: &str = ".corrupt";
const TRASH_KEEP: Duration = Duration::from_secs(30 * 24 * 60 * 60);

/// One writer at a time, so two saves of one workstream can't interleave.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct WorkstreamFile {
    /// The workstream id this file belongs to.
    pub id: String,
    pub file_name: String,
    pub modified_ms: f64,
    pub size: f64,
    /// A copy a sync client made next to the real file (`<id>-PC.json`,
    /// `<id> (1).json`): it names the workstream it is a copy of.
    pub conflict_copy: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum WriteOutcome {
    Written,
    /// The file holds another revision than the writer expected; `disk` is what it holds.
    Conflict {
        disk: String,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct TrashedWorkstream {
    pub id: String,
    pub deleted_ms: f64,
    pub contents: String,
}

/// A workstream id: what `crypto.randomUUID()` makes.
pub fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn check_id(id: &str) -> Result<(), String> {
    if valid_id(id) {
        Ok(())
    } else {
        Err(format!("Not a workstream id: {id}"))
    }
}

fn millis(time: SystemTime) -> f64 {
    time.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

fn file_of(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}{EXTENSION}"))
}

/// The id a file name belongs to, and whether it is a sync client's copy.
fn classify(file_name: &str) -> Option<(String, bool)> {
    if file_name.starts_with('.') || !file_name.ends_with(EXTENSION) || file_name.len() < 36 {
        return None;
    }
    let id = file_name.get(..36)?;
    if !valid_id(id) {
        return None;
    }
    let rest = &file_name[36..];
    if rest == EXTENSION {
        Some((id.to_string(), false))
    } else {
        Some((id.to_string(), true))
    }
}

pub fn list(dir: &Path) -> Result<Vec<WorkstreamFile>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    purge_trash(dir);
    let mut files = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let file_name = entry.file_name().to_string_lossy().to_string();
        let Some((id, conflict_copy)) = classify(&file_name) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        files.push(WorkstreamFile {
            id,
            file_name,
            modified_ms: metadata.modified().map(millis).unwrap_or(0.0),
            size: metadata.len() as f64,
            conflict_copy,
        });
    }
    files.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(files)
}

/// What a workstream file, or a sync client's copy of one, holds.
pub fn read(dir: &Path, file_name: &str) -> Result<String, String> {
    if classify(file_name).is_none() && !is_backup_name(file_name) {
        return Err(format!("Not a workstream file: {file_name}"));
    }
    fs::read_to_string(dir.join(file_name)).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => "missing".to_string(),
        _ => e.to_string(),
    })
}

fn is_backup_name(file_name: &str) -> bool {
    file_name.strip_suffix(BACKUP_SUFFIX).is_some_and(valid_id)
}

/// The revision a stored document carries; `Err` when the file isn't readable JSON.
fn revision_of(contents: &str) -> Result<Option<u64>, ()> {
    let value: serde_json::Value = serde_json::from_str(contents).map_err(|_| ())?;
    Ok(value.get("revision").and_then(|r| r.as_u64()))
}

/// Write `contents` as workstream `id`, but only over `expected_revision`
/// (`None`: only when no file exists yet).
pub fn write(
    dir: &Path,
    id: &str,
    contents: &str,
    expected_revision: Option<u64>,
) -> Result<WriteOutcome, String> {
    check_id(id)?;
    serde_json::from_str::<serde_json::Value>(contents)
        .map_err(|e| format!("The workstream is not valid JSON: {e}"))?;
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let target = file_of(dir, id);
    match fs::read_to_string(&target) {
        Ok(disk) => match revision_of(&disk) {
            Ok(revision) if expected_revision.is_some() && revision == expected_revision => {}
            Ok(_) => return Ok(WriteOutcome::Conflict { disk }),
            Err(()) => {
                return Err(
                    "The file on disk can't be read, so it was left as it is. Restore the previous version first."
                        .to_string(),
                )
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if expected_revision.is_some() {
                return Err("The workstream's file is gone. It was deleted on another machine.".to_string());
            }
        }
        Err(e) => return Err(e.to_string()),
    }

    let temp = dir.join(format!(
        "{TEMP_PREFIX}{id}-{}{EXTENSION}",
        uuid::Uuid::new_v4()
    ));
    let written = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        if target.exists() {
            fs::copy(&target, dir.join(format!("{id}{BACKUP_SUFFIX}")))?;
        }
        // Replaces the target in one step on Windows (MoveFileExW with
        // MOVEFILE_REPLACE_EXISTING) and on Unix.
        fs::rename(&temp, &target)
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&temp);
        return Err(e.to_string());
    }
    Ok(WriteOutcome::Written)
}

/// Move a workstream (or a sync client's copy of one) to the trash folder.
pub fn trash(dir: &Path, file_name: &str) -> Result<(), String> {
    let Some((id, conflict_copy)) = classify(file_name) else {
        return Err(format!("Not a workstream file: {file_name}"));
    };
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let trash = dir.join(TRASH_DIR);
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let name = if conflict_copy {
        format!("{id}-copy-{}{EXTENSION}", uuid::Uuid::new_v4())
    } else {
        format!("{id}{EXTENSION}")
    };
    fs::rename(dir.join(file_name), trash.join(name)).map_err(|e| e.to_string())
}

/// The workstreams in the trash, newest first.
pub fn trashed(dir: &Path) -> Result<Vec<TrashedWorkstream>, String> {
    let trash = dir.join(TRASH_DIR);
    if !trash.exists() {
        return Ok(Vec::new());
    }
    let mut found = Vec::new();
    for entry in fs::read_dir(&trash).map_err(|e| e.to_string())?.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        let Some((id, false)) = classify(&file_name) else {
            continue;
        };
        let Ok(contents) = fs::read_to_string(entry.path()) else {
            continue;
        };
        let deleted_ms = entry
            .metadata()
            .and_then(|m| m.modified())
            .map(millis)
            .unwrap_or(0.0);
        found.push(TrashedWorkstream {
            id,
            deleted_ms,
            contents,
        });
    }
    found.sort_by(|a, b| b.deleted_ms.total_cmp(&a.deleted_ms));
    Ok(found)
}

/// Put a trashed workstream back, unless one with its id exists again.
pub fn restore(dir: &Path, id: &str) -> Result<(), String> {
    check_id(id)?;
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let target = file_of(dir, id);
    if target.exists() {
        return Err("A workstream with this id exists again.".to_string());
    }
    fs::rename(dir.join(TRASH_DIR).join(format!("{id}{EXTENSION}")), target)
        .map_err(|e| e.to_string())
}

/// Replace an unreadable file with its previous version. The unreadable one
/// moves to `.corrupt/`, never away.
pub fn restore_backup(dir: &Path, id: &str) -> Result<(), String> {
    check_id(id)?;
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let backup = dir.join(format!("{id}{BACKUP_SUFFIX}"));
    if !backup.exists() {
        return Err("There is no previous version of this workstream.".to_string());
    }
    let target = file_of(dir, id);
    if target.exists() {
        let corrupt = dir.join(CORRUPT_DIR);
        fs::create_dir_all(&corrupt).map_err(|e| e.to_string())?;
        let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S");
        fs::rename(&target, corrupt.join(format!("{id}-{stamp}{EXTENSION}")))
            .map_err(|e| e.to_string())?;
    }
    fs::copy(&backup, &target).map_err(|e| e.to_string())?;
    Ok(())
}

/// Workstreams stay in the trash for 30 days.
fn purge_trash(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir.join(TRASH_DIR)) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age > TRASH_KEEP);
        if old {
            let _ = fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0b9a5a8e-6f4e-4e4b-9d3c-2a1f0e9d8c7b";

    fn doc(revision: u64) -> String {
        format!(r#"{{"schema":1,"id":"{ID}","revision":{revision},"title":"t"}}"#)
    }

    #[test]
    fn writes_a_new_file_and_refuses_to_create_it_twice() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            write(dir.path(), ID, &doc(1), None).unwrap(),
            WriteOutcome::Written
        );
        assert_eq!(read(dir.path(), &format!("{ID}.json")).unwrap(), doc(1));
        assert_eq!(
            write(dir.path(), ID, &doc(1), None).unwrap(),
            WriteOutcome::Conflict { disk: doc(1) }
        );
    }

    #[test]
    fn writes_over_the_expected_revision_only() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), ID, &doc(1), None).unwrap();
        assert_eq!(
            write(dir.path(), ID, &doc(2), Some(1)).unwrap(),
            WriteOutcome::Written
        );
        assert_eq!(
            write(dir.path(), ID, &doc(3), Some(1)).unwrap(),
            WriteOutcome::Conflict { disk: doc(2) }
        );
        assert_eq!(read(dir.path(), &format!("{ID}.json")).unwrap(), doc(2));
    }

    #[test]
    fn keeps_the_previous_revision_as_a_backup() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), ID, &doc(1), None).unwrap();
        write(dir.path(), ID, &doc(2), Some(1)).unwrap();
        assert_eq!(read(dir.path(), &format!("{ID}.json.bak")).unwrap(), doc(1));
    }

    #[test]
    fn leaves_no_temp_file_behind_and_lists_none() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), ID, &doc(1), None).unwrap();
        fs::write(dir.path().join(format!(".tmp-{ID}-x.json")), "{").unwrap();
        let files = list(dir.path()).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].id, ID);
        assert!(!files[0].conflict_copy);
    }

    #[test]
    fn never_writes_over_a_malformed_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(file_of(dir.path(), ID), "{ not json").unwrap();
        assert!(write(dir.path(), ID, &doc(1), Some(0)).is_err());
        assert_eq!(
            read(dir.path(), &format!("{ID}.json")).unwrap(),
            "{ not json"
        );
    }

    #[test]
    fn restores_the_backup_and_keeps_the_malformed_file() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), ID, &doc(1), None).unwrap();
        write(dir.path(), ID, &doc(2), Some(1)).unwrap();
        fs::write(file_of(dir.path(), ID), "{ broken").unwrap();
        restore_backup(dir.path(), ID).unwrap();
        assert_eq!(read(dir.path(), &format!("{ID}.json")).unwrap(), doc(1));
        let corrupt: Vec<_> = fs::read_dir(dir.path().join(CORRUPT_DIR))
            .unwrap()
            .collect();
        assert_eq!(corrupt.len(), 1);
    }

    #[test]
    fn finds_the_copies_a_sync_client_makes() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), ID, &doc(1), None).unwrap();
        fs::write(dir.path().join(format!("{ID}-LAPTOP.json")), doc(1)).unwrap();
        fs::write(dir.path().join(format!("{ID} (1).json")), doc(1)).unwrap();
        fs::write(dir.path().join("notes.json"), "{}").unwrap();
        let files = list(dir.path()).unwrap();
        assert_eq!(files.len(), 3);
        assert_eq!(files.iter().filter(|f| f.conflict_copy).count(), 2);
        assert!(files.iter().all(|f| f.id == ID));
    }

    #[test]
    fn trashes_and_restores() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), ID, &doc(1), None).unwrap();
        trash(dir.path(), &format!("{ID}.json")).unwrap();
        assert!(list(dir.path()).unwrap().is_empty());
        let trashed = trashed(dir.path()).unwrap();
        assert_eq!(trashed.len(), 1);
        assert_eq!(trashed[0].contents, doc(1));
        restore(dir.path(), ID).unwrap();
        assert_eq!(list(dir.path()).unwrap().len(), 1);
    }

    #[test]
    fn refuses_names_outside_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(dir.path(), "../secrets.json").is_err());
        assert!(write(dir.path(), "../x", "{}", None).is_err());
        assert!(trash(dir.path(), "..\\x.json").is_err());
    }

    #[test]
    fn reports_a_file_deleted_elsewhere() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write(dir.path(), ID, &doc(2), Some(1)).is_err());
    }
}
