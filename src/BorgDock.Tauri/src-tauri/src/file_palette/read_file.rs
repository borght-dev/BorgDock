use serde::Serialize;
use std::path::PathBuf;

const DEFAULT_MAX_BYTES: u64 = 1_048_576; // 1 MB
const BINARY_SAMPLE_BYTES: usize = 8192;
const BINARY_THRESHOLD_PERCENT: usize = 10;

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

    // Decode based on BOM / heuristic. SQL Server scripts and many Windows-edited
    // files are UTF-16 LE with a BOM — those look binary to a naive UTF-8 check
    // (every other byte is 0 in the ASCII range).
    let decoded = decode_text(&bytes).ok_or(ReadFileError::Binary)?;

    // After decoding, re-check that the produced text isn't itself control-heavy
    // (catches things like real binaries that happened to start with a BOM-like
    // prefix by coincidence).
    if looks_binary(decoded.as_bytes()) {
        return Err(ReadFileError::Binary);
    }

    Ok(decoded)
}

/// Decode a file's raw bytes to a String, respecting BOM / UTF-16 heuristics.
/// Returns `None` if the bytes don't decode to any known text encoding.
fn decode_text(bytes: &[u8]) -> Option<String> {
    // UTF-8 with BOM: EF BB BF
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8(bytes[3..].to_vec()).ok();
    }
    // UTF-16 LE with BOM: FF FE
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return decode_utf16(&bytes[2..], /*little_endian*/ true);
    }
    // UTF-16 BE with BOM: FE FF
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return decode_utf16(&bytes[2..], /*little_endian*/ false);
    }
    // No BOM — the UTF-16 LE heuristic has to run BEFORE the UTF-8 try,
    // because ASCII-range UTF-16 LE (`S\0E\0L\0…`) is coincidentally valid
    // UTF-8 (interleaved U+0000s), so `from_utf8` would happily accept the
    // bytes and hand back a string full of NULs that the post-binary-check
    // then (correctly) flags as binary.
    if looks_like_utf16_le_ascii(bytes) {
        return decode_utf16(bytes, true);
    }
    if let Ok(s) = std::str::from_utf8(bytes) {
        return Some(s.to_string());
    }
    None
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> Option<String> {
    if bytes.len() % 2 != 0 {
        return None;
    }
    let mut units = Vec::with_capacity(bytes.len() / 2);
    for chunk in bytes.chunks_exact(2) {
        let u = if little_endian {
            u16::from_le_bytes([chunk[0], chunk[1]])
        } else {
            u16::from_be_bytes([chunk[0], chunk[1]])
        };
        units.push(u);
    }
    String::from_utf16(&units).ok()
}

/// Heuristic for UTF-16 LE where the text is mostly ASCII — even bytes are
/// printable ASCII, odd bytes are zero. Looks at the first 8 KB.
fn looks_like_utf16_le_ascii(bytes: &[u8]) -> bool {
    let sample_len = bytes.len().min(BINARY_SAMPLE_BYTES);
    if sample_len < 2 || sample_len % 2 != 0 {
        return false;
    }
    let mut zero_high_bytes = 0usize;
    let mut printable_low_bytes = 0usize;
    for chunk in bytes[..sample_len].chunks_exact(2) {
        if chunk[1] == 0 {
            zero_high_bytes += 1;
        }
        let b = chunk[0];
        if b == b'\t' || b == b'\n' || b == b'\r' || (b >= 0x20 && b <= 0x7E) {
            printable_low_bytes += 1;
        }
    }
    let pairs = sample_len / 2;
    // Require ≥ 95% zero high bytes AND ≥ 90% printable low bytes.
    zero_high_bytes * 100 >= pairs * 95 && printable_low_bytes * 100 >= pairs * 90
}

/// True if the first 8 KB contain > 10% non-printable bytes.
fn looks_binary(bytes: &[u8]) -> bool {
    let sample_len = bytes.len().min(BINARY_SAMPLE_BYTES);
    if sample_len == 0 {
        return false;
    }
    let sample = &bytes[..sample_len];
    let bad = sample
        .iter()
        // Treat control bytes as "bad" except TAB (9), LF (10), VT (11), FF (12), CR (13), ESC (27).
        .filter(|&&b| b < 9 || (b > 13 && b < 32 && b != 27))
        .count();
    (bad * 100) > sample_len * BINARY_THRESHOLD_PERCENT
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

    #[test]
    fn decodes_utf16_le_with_bom() {
        // SQL Server scripts commonly ship as UTF-16 LE with a BOM.
        let dir = tempdir().unwrap();
        let path = dir.path().join("script.sql");
        let text = "SELECT 1;\nGO\n";
        let mut bytes = vec![0xFF, 0xFE];
        for u in text.encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        std::fs::write(&path, bytes).unwrap();
        let content = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap();
        assert_eq!(content, text);
    }

    #[test]
    fn decodes_utf16_be_with_bom() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("script.xml");
        let text = "<root/>\n";
        let mut bytes = vec![0xFE, 0xFF];
        for u in text.encode_utf16() {
            bytes.extend_from_slice(&u.to_be_bytes());
        }
        std::fs::write(&path, bytes).unwrap();
        let content = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap();
        assert_eq!(content, text);
    }

    #[test]
    fn strips_utf8_bom() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bom.txt");
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(b"hello");
        std::fs::write(&path, bytes).unwrap();
        let content = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap();
        assert_eq!(content, "hello");
    }

    #[test]
    fn decodes_bomless_utf16_le_heuristic() {
        // Older SQL exports can be UTF-16 LE with no BOM — fall back on the
        // "every other byte is zero, the rest are ASCII" heuristic.
        let dir = tempdir().unwrap();
        let path = dir.path().join("no-bom.sql");
        let text = "SELECT * FROM users;\nGO\n";
        let mut bytes = Vec::new();
        for u in text.encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        std::fs::write(&path, bytes).unwrap();
        let content = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap();
        assert_eq!(content, text);
    }
}
