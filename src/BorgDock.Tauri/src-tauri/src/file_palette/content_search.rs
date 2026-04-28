use grep_regex::RegexMatcherBuilder;
use grep_searcher::{BinaryDetection, SearcherBuilder, Sink, SinkMatch};
use ignore::{WalkBuilder, WalkState};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

const MAX_FILES_WITH_MATCHES: usize = 200;
const MAX_PREVIEWS_PER_FILE: usize = 5;
const MAX_PREVIEW_CHARS: usize = 200;

static CURRENT_TOKEN: AtomicU32 = AtomicU32::new(0);

#[derive(Debug, Serialize, Clone)]
pub struct ContentMatch {
    pub line: u32,
    pub preview: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ContentFileResult {
    pub rel_path: String,
    pub match_count: u32,
    pub matches: Vec<ContentMatch>,
}

#[tauri::command]
pub async fn search_content(
    root: String,
    pattern: String,
    cancel_token: u32,
) -> Result<Vec<ContentFileResult>, String> {
    CURRENT_TOKEN.store(cancel_token, Ordering::SeqCst);
    let my_token = cancel_token;
    tokio::task::spawn_blocking(move || {
        search(&PathBuf::from(root), &pattern, move || {
            CURRENT_TOKEN.load(Ordering::SeqCst) != my_token
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

fn search<F>(root: &Path, pattern: &str, is_cancelled: F) -> Result<Vec<ContentFileResult>, String>
where
    F: Fn() -> bool + Sync + Send + Clone + 'static,
{
    if pattern.is_empty() {
        return Ok(Vec::new());
    }
    let smart_case = pattern.chars().all(|c| !c.is_uppercase());
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(smart_case)
        .build(pattern)
        .map_err(|e| format!("bad regex: {e}"))?;

    let results: Arc<Mutex<Vec<ContentFileResult>>> = Arc::new(Mutex::new(Vec::new()));

    WalkBuilder::new(root).hidden(false).build_parallel().run(|| {
        let matcher = matcher.clone();
        let results = Arc::clone(&results);
        let root = root.to_path_buf();
        let is_cancelled = is_cancelled.clone();
        Box::new(move |entry| {
            if is_cancelled() {
                return WalkState::Quit;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(_) => return WalkState::Continue,
            };
            if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                return WalkState::Continue;
            }
            if results.lock().unwrap().len() >= MAX_FILES_WITH_MATCHES {
                return WalkState::Quit;
            }
            let rel = match entry.path().strip_prefix(&root) {
                Ok(r) => r.to_string_lossy().replace('\\', "/"),
                Err(_) => return WalkState::Continue,
            };
            let mut sink = CollectSink::default();
            let mut searcher = SearcherBuilder::new()
                .binary_detection(BinaryDetection::quit(b'\x00'))
                .build();
            if searcher.search_path(&matcher, entry.path(), &mut sink).is_err() {
                return WalkState::Continue;
            }
            if sink.match_count == 0 {
                return WalkState::Continue;
            }
            let mut guard = results.lock().unwrap();
            if guard.len() < MAX_FILES_WITH_MATCHES {
                guard.push(ContentFileResult {
                    rel_path: rel,
                    match_count: sink.match_count,
                    matches: sink.previews,
                });
            }
            WalkState::Continue
        })
    });

    if is_cancelled() {
        return Ok(Vec::new());
    }

    let mut out = Arc::try_unwrap(results)
        .map(|m| m.into_inner().unwrap())
        .unwrap_or_else(|a| a.lock().unwrap().clone());
    out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(out)
}

#[derive(Default)]
struct CollectSink {
    match_count: u32,
    previews: Vec<ContentMatch>,
}

impl Sink for CollectSink {
    type Error = std::io::Error;

    fn matched(
        &mut self,
        _searcher: &grep_searcher::Searcher,
        mat: &SinkMatch<'_>,
    ) -> Result<bool, Self::Error> {
        self.match_count += 1;
        if self.previews.len() < MAX_PREVIEWS_PER_FILE {
            let line = mat.line_number().unwrap_or(0) as u32;
            let text = std::str::from_utf8(mat.bytes()).unwrap_or("").trim_end();
            let preview = if text.chars().count() > MAX_PREVIEW_CHARS {
                let mut s: String = text.chars().take(MAX_PREVIEW_CHARS).collect();
                s.push('…');
                s
            } else {
                text.to_string()
            };
            self.previews.push(ContentMatch { line, preview });
        }
        Ok(true)
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
    fn finds_matches_and_groups_by_file() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "const x = handleLogin();\nhandleLogin();\n");
        write(dir.path(), "b.ts", "// unrelated\n");

        let results = search(dir.path(), "handleLogin", || false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].rel_path, "a.ts");
        assert_eq!(results[0].match_count, 2);
        assert_eq!(results[0].matches.len(), 2);
        assert!(results[0].matches[0].preview.contains("handleLogin"));
    }

    #[test]
    fn smart_case_insensitive_when_lowercase() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "const MyThing = 1;\n");
        let results = search(dir.path(), "mything", || false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].match_count, 1);
    }

    #[test]
    fn smart_case_case_sensitive_when_mixed() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "const MyThing = 1;\nconst mything = 2;\n");
        let results = search(dir.path(), "MyThing", || false).unwrap();
        assert_eq!(results[0].match_count, 1);
    }

    #[test]
    fn caps_preview_count_but_keeps_match_count() {
        let dir = tempdir().unwrap();
        let mut body = String::new();
        for _ in 0..12 {
            body.push_str("foo\n");
        }
        write(dir.path(), "a.ts", &body);
        let results = search(dir.path(), "foo", || false).unwrap();
        assert_eq!(results[0].match_count, 12);
        assert_eq!(results[0].matches.len(), MAX_PREVIEWS_PER_FILE);
    }

    #[test]
    fn empty_pattern_returns_empty() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "anything");
        let results = search(dir.path(), "", || false).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn bad_regex_returns_error() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "x");
        let err = search(dir.path(), "(unclosed", || false).unwrap_err();
        assert!(err.contains("bad regex"));
    }

    #[test]
    fn cancellation_short_circuits() {
        let dir = tempdir().unwrap();
        for i in 0..10 {
            write(dir.path(), &format!("f{i}.ts"), "foo\n");
        }
        let results = search(dir.path(), "foo", || true).unwrap();
        assert!(results.is_empty(), "cancelled search returned results");
    }
}
