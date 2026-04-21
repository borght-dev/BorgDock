use serde::Serialize;
use std::path::PathBuf;

const DEFAULT_MAX_BYTES: u64 = 1_048_576; // 1 MB

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReadFileError {
    NotFound { path: String },
    TooLarge { size: u64, limit: u64 },
    Binary,
    Io { message: String },
}

#[tauri::command]
pub async fn read_text_file(
    path: String,
    max_bytes: Option<u64>,
) -> Result<String, ReadFileError> {
    let limit = max_bytes.unwrap_or(DEFAULT_MAX_BYTES);
    tokio::task::spawn_blocking(move || read_text_file_sync(PathBuf::from(path), limit))
        .await
        .map_err(|e| ReadFileError::Io { message: format!("join error: {e}") })?
}

fn read_text_file_sync(path: PathBuf, limit: u64) -> Result<String, ReadFileError> {
    let meta = std::fs::metadata(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => ReadFileError::NotFound {
            path: path.display().to_string(),
        },
        _ => ReadFileError::Io { message: e.to_string() },
    })?;
    let size = meta.len();
    if size > limit {
        return Err(ReadFileError::TooLarge { size, limit });
    }
    let bytes = std::fs::read(&path).map_err(|e| ReadFileError::Io { message: e.to_string() })?;
    if looks_binary(&bytes) {
        return Err(ReadFileError::Binary);
    }
    String::from_utf8(bytes).map_err(|e| ReadFileError::Io {
        message: format!("not valid UTF-8: {e}"),
    })
}

/// True if the first 8 KB contain > 10% non-printable bytes.
fn looks_binary(bytes: &[u8]) -> bool {
    let sample_len = bytes.len().min(8192);
    if sample_len == 0 {
        return false;
    }
    let sample = &bytes[..sample_len];
    let bad = sample
        .iter()
        .filter(|&&b| b == 0 || (b < 9) || (b > 13 && b < 32 && b != 27))
        .count();
    (bad * 10) > sample_len
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn reads_small_utf8_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("hello.txt");
        std::fs::write(&path, "hello world").unwrap();
        let content = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap();
        assert_eq!(content, "hello world");
    }

    #[test]
    fn refuses_oversized_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("big.txt");
        std::fs::write(&path, vec![b'a'; 2048]).unwrap();
        let err = read_text_file_sync(path, 1024).unwrap_err();
        match err {
            ReadFileError::TooLarge { size, limit } => {
                assert_eq!(size, 2048);
                assert_eq!(limit, 1024);
            }
            other => panic!("expected TooLarge, got {other:?}"),
        }
    }

    #[test]
    fn reports_not_found() {
        let err = read_text_file_sync(PathBuf::from("/nope/does-not-exist"), DEFAULT_MAX_BYTES)
            .unwrap_err();
        assert!(matches!(err, ReadFileError::NotFound { .. }));
    }

    #[test]
    fn detects_binary_by_null_bytes() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("binary.bin");
        let mut payload = vec![b'a'; 8000];
        // Inject many null bytes so > 10% of the sample is non-printable.
        for i in 0..1500 {
            payload[i] = 0;
        }
        std::fs::write(&path, payload).unwrap();
        let err = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap_err();
        assert!(matches!(err, ReadFileError::Binary));
    }

    #[test]
    fn accepts_text_with_tabs_and_newlines() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("tabs.txt");
        std::fs::write(&path, "a\tb\n\tc\r\nd").unwrap();
        let content = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap();
        assert!(content.contains("\tb"));
    }
}
