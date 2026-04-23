use ignore::WalkBuilder;
use serde::Serialize;
use std::path::{Path, PathBuf};

const DEFAULT_LIMIT: usize = 50_000;

/// Extensions we are willing to list. Anything not in this set is dropped
/// from the filename list (keeps binaries like .exe/.png out by default).
/// Match is case-insensitive.
const ALLOWED_EXTENSIONS: &[&str] = &[
    // source code
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "cs", "fs", "go", "py", "rb",
    "java", "kt", "swift", "c", "cc", "cpp", "h", "hpp", "m", "mm",
    // config
    "json", "yaml", "yml", "toml", "ini", "env", "editorconfig", "gitignore",
    "dockerfile",
    // sql / data
    "sql", "csv", "tsv",
    // web
    "html", "css", "scss", "less",
    // shell
    "sh", "bash", "zsh", "ps1", "bat", "cmd",
    // docs
    "md", "mdx", "txt", "rst",
];

#[derive(Debug, Serialize, serde::Deserialize)]
pub struct FileEntry {
    pub rel_path: String,
    pub size: u64,
}

#[derive(Debug, Serialize, serde::Deserialize)]
pub struct ListFilesResult {
    pub entries: Vec<FileEntry>,
    pub truncated: bool,
}

#[tauri::command]
pub async fn list_root_files(
    root: String,
    limit: Option<usize>,
) -> Result<ListFilesResult, String> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    tokio::task::spawn_blocking(move || walk_root(&PathBuf::from(root), limit))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn walk_root(root: &Path, limit: usize) -> Result<ListFilesResult, String> {
    if !root.exists() {
        return Err(format!("root does not exist: {}", root.display()));
    }
    let mut entries: Vec<FileEntry> = Vec::new();
    let mut truncated = false;
    let walker = WalkBuilder::new(root).hidden(false).build();
    for dent in walker {
        let dent = match dent {
            Ok(d) => d,
            Err(_) => continue,
        };
        if dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if !is_allowed_extension(dent.path()) {
                continue;
            }
            let rel = match dent.path().strip_prefix(root) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            let size = dent.metadata().map(|m| m.len()).unwrap_or(0);
            entries.push(FileEntry { rel_path: rel_str, size });
            if entries.len() >= limit {
                truncated = true;
                break;
            }
        }
    }
    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(ListFilesResult { entries, truncated })
}

fn is_allowed_extension(path: &Path) -> bool {
    // Files whose *name* matches an extension-style entry (e.g. `.gitignore`,
    // `Dockerfile`) are also allowed.
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        let lower = name.to_ascii_lowercase();
        if ALLOWED_EXTENSIONS.iter().any(|e| lower == *e || lower == format!(".{e}")) {
            return true;
        }
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => {
            let lower = ext.to_ascii_lowercase();
            ALLOWED_EXTENSIONS.iter().any(|e| lower == *e)
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write(dir: &Path, rel: &str, body: &str) {
        let p = dir.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(p, body).unwrap();
    }

    #[test]
    fn lists_source_files_and_skips_unknown_extensions() {
        let dir = tempdir().unwrap();
        write(dir.path(), "src/app.ts", "export const a = 1;");
        write(dir.path(), "src/app.test.ts", "// test");
        write(dir.path(), "image.png", "binary-ish");
        write(dir.path(), "doc.md", "# hello");
        write(dir.path(), "noext", "");

        let result = walk_root(dir.path(), DEFAULT_LIMIT).unwrap();
        let paths: Vec<&str> = result.entries.iter().map(|e| e.rel_path.as_str()).collect();

        assert!(paths.contains(&"src/app.ts"));
        assert!(paths.contains(&"src/app.test.ts"));
        assert!(paths.contains(&"doc.md"));
        assert!(!paths.contains(&"image.png"));
        assert!(!paths.contains(&"noext"));
        assert!(!result.truncated);
    }

    #[test]
    fn respects_gitignore() {
        let dir = tempdir().unwrap();
        // Create a git repo-like layout so ignore crate honors .gitignore.
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join(".gitignore"), "build/\n").unwrap();
        write(dir.path(), "src/app.ts", "");
        write(dir.path(), "build/out.ts", "");

        let result = walk_root(dir.path(), DEFAULT_LIMIT).unwrap();
        let paths: Vec<&str> = result.entries.iter().map(|e| e.rel_path.as_str()).collect();
        assert!(paths.contains(&"src/app.ts"));
        assert!(!paths.contains(&"build/out.ts"));
    }

    #[test]
    fn includes_dotfile_configs_like_gitignore_file() {
        let dir = tempdir().unwrap();
        write(dir.path(), ".gitignore", "x");
        write(dir.path(), ".editorconfig", "");

        let result = walk_root(dir.path(), DEFAULT_LIMIT).unwrap();
        let paths: Vec<&str> = result.entries.iter().map(|e| e.rel_path.as_str()).collect();
        assert!(paths.contains(&".gitignore"));
        assert!(paths.contains(&".editorconfig"));
    }

    #[test]
    fn truncates_past_limit() {
        let dir = tempdir().unwrap();
        for i in 0..20 {
            write(dir.path(), &format!("f{i}.ts"), "");
        }
        let result = walk_root(dir.path(), 5).unwrap();
        assert_eq!(result.entries.len(), 5);
        assert!(result.truncated);
    }

    #[test]
    fn missing_root_returns_error() {
        let err = walk_root(Path::new("/nope/does-not-exist-xyz"), DEFAULT_LIMIT).unwrap_err();
        assert!(err.contains("does not exist"));
    }
}
