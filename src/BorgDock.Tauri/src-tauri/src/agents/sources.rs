use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::PathBuf;

pub fn neutral_directory() -> Result<PathBuf, String> {
    let directory = std::env::temp_dir().join("borgdock-summary-agent");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let canonical = directory.canonicalize().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        let path = canonical.to_string_lossy();
        if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
            return Ok(PathBuf::from(format!(r"\\{unc}")));
        }
        if let Some(path) = path.strip_prefix(r"\\?\") {
            return Ok(PathBuf::from(path));
        }
    }
    Ok(canonical)
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PromptSource {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SourceRead {
    pub id: String,
    /// One-based snapshot line numbers returned by successful read tools.
    pub lines: Vec<u32>,
}

pub struct SourceBundle {
    directory: PathBuf,
    prefix: String,
    sources: Vec<(String, Vec<Vec<String>>)>,
}

impl SourceBundle {
    pub fn create(sources: &[PromptSource], prompt: &mut String) -> Result<Self, String> {
        let mut ids = HashSet::new();
        if sources.len() > 4096
            || sources.iter().map(|s| s.text.len()).sum::<usize>() > 64 * 1024 * 1024
        {
            return Err("Review snapshots exceed the 64 MiB / 4096 file limit".into());
        }
        for source in sources {
            if source.id.is_empty()
                || !source
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                || !ids.insert(source.id.as_str())
            {
                return Err("Invalid or duplicate review snapshot ID".into());
            }
        }
        let nonce = uuid::Uuid::new_v4().simple().to_string();
        let directory = neutral_directory()?.join(format!("sources-{nonce}"));
        std::fs::create_dir(&directory).map_err(|e| e.to_string())?;
        let mut bundle = Self {
            directory,
            prefix: format!("BDREAD_{nonce}_"),
            sources: Vec::new(),
        };
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&bundle.directory, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        for (index, source) in sources.iter().enumerate() {
            let lines: Vec<Vec<String>> = source.text.lines().map(segments).collect();
            let mut contents = String::from("\u{feff}");
            for (line, parts) in lines.iter().enumerate() {
                for (part, text) in parts.iter().enumerate() {
                    contents.push_str(&format!(
                        "{}{index}_{}_{part}|{text}\n",
                        bundle.prefix,
                        line + 1
                    ));
                }
            }
            let path = bundle.directory.join(format!("{}.txt", source.id));
            std::fs::write(&path, contents).map_err(|e| e.to_string())?;
            *prompt = prompt.replace(
                &format!("{{{{source:{}}}}}", source.id),
                &serde_json::to_string(&path.to_string_lossy()).map_err(|e| e.to_string())?,
            );
            bundle.sources.push((source.id.clone(), lines));
        }
        Ok(bundle)
    }

    pub fn reads(&self, provider: &str, stdout: &[u8]) -> Vec<SourceRead> {
        let mut seen = vec![BTreeSet::new(); self.sources.len()];
        for output in tool_outputs(provider, stdout) {
            // CLI transcripts can retain more stdout than the model's tool result.
            // Require bounded reads rather than crediting an oversized dump.
            if output.len() > 12_000 {
                continue;
            }
            for line in output.lines() {
                let Some(at) = line.find(&self.prefix) else {
                    continue;
                };
                let tagged = &line[at + self.prefix.len()..];
                let Some((position, text)) = tagged.split_once('|') else {
                    continue;
                };
                let mut position = position.split('_');
                let (Some(source), Some(number), Some(part), None) = (
                    position.next(),
                    position.next(),
                    position.next(),
                    position.next(),
                ) else {
                    continue;
                };
                let (Ok(source), Ok(number), Ok(part)) = (
                    source.parse::<usize>(),
                    number.parse::<usize>(),
                    part.parse::<usize>(),
                ) else {
                    continue;
                };
                let Some((_, lines)) = self.sources.get(source) else {
                    continue;
                };
                if number > 0
                    && lines
                        .get(number - 1)
                        .and_then(|parts| parts.get(part))
                        .is_some_and(|expected| expected == text)
                {
                    seen[source].insert((number, part));
                }
            }
        }
        self.sources
            .iter()
            .zip(seen)
            .map(|((id, lines), seen)| SourceRead {
                id: id.clone(),
                lines: lines
                    .iter()
                    .enumerate()
                    .filter_map(|(line, parts)| {
                        (0..parts.len())
                            .all(|part| seen.contains(&(line + 1, part)))
                            .then_some((line + 1) as u32)
                    })
                    .collect(),
            })
            .collect()
    }
}

impl Drop for SourceBundle {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(&self.directory) {
            log::warn!("Review snapshot cleanup failed: {error}");
        }
    }
}

fn segments(line: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut start = 0;
    for (at, _) in line.char_indices() {
        if at - start >= 2000 {
            parts.push(line[start..at].to_owned());
            start = at;
        }
    }
    parts.push(line[start..].to_owned());
    parts
}

fn content_text(value: &serde_json::Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_owned();
    }
    value
        .as_array()
        .map(|blocks| {
            blocks
                .iter()
                .filter(|block| block["type"] == "text")
                .filter_map(|block| block["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

fn tool_outputs(provider: &str, stdout: &[u8]) -> Vec<String> {
    let mut tools = HashMap::new();
    let mut outputs = Vec::new();
    for line in String::from_utf8_lossy(stdout).lines() {
        let Ok(event) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if provider == "codex" {
            let item = &event["item"];
            if event["type"] == "item.completed"
                && item["type"] == "command_execution"
                && item["status"] == "completed"
                && item["exit_code"].as_i64() == Some(0)
            {
                if let Some(text) = item["aggregated_output"].as_str() {
                    outputs.push(text.to_owned());
                }
            }
            continue;
        }
        let Some(blocks) = event["message"]["content"].as_array() else {
            continue;
        };
        for block in blocks {
            if event["type"] == "assistant" && block["type"] == "tool_use" {
                if let (Some(id), Some(name)) = (block["id"].as_str(), block["name"].as_str()) {
                    tools.insert(id.to_owned(), matches!(name, "Read" | "Grep" | "Glob"));
                }
            } else if event["type"] == "user"
                && block["type"] == "tool_result"
                && block["is_error"].as_bool() != Some(true)
                && block["tool_use_id"].as_str().and_then(|id| tools.get(id)) == Some(&true)
            {
                outputs.push(content_text(&block["content"]));
            }
        }
    }
    outputs
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn snapshots_are_complete_unique_and_removed_on_drop() {
        let sources = vec![PromptSource {
            id: "file-1".into(),
            text: "first\nlast".into(),
        }];
        let mut prompt = "Read {{source:file-1}}".into();
        let bundle = SourceBundle::create(&sources, &mut prompt).unwrap();
        let directory = bundle.directory.clone();
        let content = std::fs::read_to_string(directory.join("file-1.txt")).unwrap();
        assert!(content.contains("_0_1_0|first\n") && content.contains("_0_2_0|last\n"));
        assert!(!prompt.contains("{{source:"));
        let other = SourceBundle::create(&sources, &mut String::new()).unwrap();
        assert_ne!(directory, other.directory);
        drop(bundle);
        assert!(!directory.exists());
    }

    #[test]
    fn audits_only_successful_tool_output_and_deduplicates_ranges() {
        let bundle = SourceBundle::create(
            &[PromptSource {
                id: "file-1".into(),
                text: "first\nlast".into(),
            }],
            &mut String::new(),
        )
        .unwrap();
        let first = format!("{}0_1_0|first", bundle.prefix);
        let last = format!("{}0_2_0|last", bundle.prefix);
        let event = |kind: &str, status: &str, code: i32, text: &str| {
            json!({
                "type": "item.completed", "item": { "type": kind, "status": status,
                    "exit_code": code, "aggregated_output": text, "text": text }
            })
            .to_string()
        };
        let stdout = [
            event("agent_message", "completed", 0, &last),
            event("command_execution", "completed", 1, &last),
            event("command_execution", "in_progress", 0, &last),
            event(
                "command_execution",
                "completed",
                0,
                &format!("{first}\n{first}\n{last} incomplete"),
            ),
        ]
        .join("\n");
        assert_eq!(bundle.reads("codex", stdout.as_bytes())[0].lines, vec![1]);
        let stdout = [
            json!({"type":"assistant","message":{"content":[{"type":"tool_use","id":"read","name":"Read"}]}}),
            json!({"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"read","content":format!("1→{first}\n2→{last}")}]}}),
        ].iter().map(|e| e.to_string()).collect::<Vec<_>>().join("\n");
        assert_eq!(
            bundle.reads("claude", stdout.as_bytes())[0].lines,
            vec![1, 2]
        );
    }

    #[test]
    fn rejects_paths_and_duplicate_ids() {
        for ids in [vec!["../escape"], vec!["same", "same"]] {
            let sources = ids
                .iter()
                .map(|id| PromptSource {
                    id: (*id).into(),
                    text: "x".into(),
                })
                .collect::<Vec<_>>();
            assert!(SourceBundle::create(&sources, &mut String::new()).is_err());
        }
    }

    #[test]
    fn long_unicode_lines_need_every_fragment_and_oversized_dumps_do_not_count() {
        let text = "🦀".repeat(1600);
        let bundle = SourceBundle::create(
            &[PromptSource {
                id: "file-1".into(),
                text,
            }],
            &mut String::new(),
        )
        .unwrap();
        let contents = std::fs::read_to_string(bundle.directory.join("file-1.txt")).unwrap();
        let event = |output: &str| {
            json!({"type":"item.completed","item":{
                "type":"command_execution","status":"completed","exit_code":0,
                "aggregated_output":output
            }})
            .to_string()
        };
        let chunks = contents.lines().collect::<Vec<_>>();
        assert!(chunks.len() > 1);
        assert!(bundle.reads("codex", event(chunks[0]).as_bytes())[0]
            .lines
            .is_empty());
        let stdout = chunks
            .iter()
            .map(|chunk| event(chunk))
            .collect::<Vec<_>>()
            .join("\n");
        assert_eq!(bundle.reads("codex", stdout.as_bytes())[0].lines, vec![1]);
        let oversized = format!("{}\n{contents}", "padding".repeat(2000));
        assert!(bundle.reads("codex", event(&oversized).as_bytes())[0]
            .lines
            .is_empty());
    }
}
