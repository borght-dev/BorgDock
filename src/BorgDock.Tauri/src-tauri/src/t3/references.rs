use regex::Regex;
use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};
use std::sync::OnceLock;

#[derive(Debug, Default, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ConversationReferences {
    explicit_ids: BTreeSet<u64>,
    mentioned_ids: BTreeSet<u64>,
}

impl ConversationReferences {
    fn add(&mut self, text: &str) {
        static EXPLICIT: OnceLock<Regex> = OnceLock::new();
        static NUMBERS: OnceLock<Regex> = OnceLock::new();
        let explicit = EXPLICIT.get_or_init(|| Regex::new(r"(?i)\bAB(#?)(\d+)\b").unwrap());
        let numbers = NUMBERS.get_or_init(|| Regex::new(r"\b\d{3,7}\b").unwrap());
        for captures in explicit.captures_iter(text) {
            let digits = &captures[2];
            if let Ok(id) = digits.parse::<u64>() {
                if captures[1] == *"#" || digits.len() >= 5 {
                    self.explicit_ids.insert(id);
                } else if digits.len() >= 3 {
                    self.mentioned_ids.insert(id);
                }
            }
        }
        for number in numbers.find_iter(text) {
            if let Ok(id) = number.as_str().parse() {
                self.mentioned_ids.insert(id);
            }
        }
    }
}

pub fn from_database(
    connection: &Connection,
    thread_ids: &[String],
) -> Result<HashMap<String, ConversationReferences>, String> {
    let mut statement = connection.prepare(
        "SELECT json_extract(payload_json, '$.text') FROM orchestration_v2_projection_messages \
         WHERE thread_id = ?1 AND role IN ('user', 'assistant')",
    ).map_err(|error| error.to_string())?;
    let mut found = HashMap::new();
    for id in thread_ids {
        let messages = statement
            .query_map([id], |row| row.get::<_, Option<String>>(0))
            .map_err(|error| error.to_string())?;
        let mut references = ConversationReferences::default();
        for message in messages {
            if let Some(text) = message.map_err(|error| error.to_string())? {
                references.add(&text);
            }
        }
        found.insert(id.clone(), references);
    }
    Ok(found)
}

pub fn from_snapshot(snapshot: &Value) -> ConversationReferences {
    let mut references = ConversationReferences::default();
    for message in snapshot["projection"]["messages"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if matches!(message["role"].as_str(), Some("user" | "assistant")) {
            if let Some(text) = message["text"].as_str() {
                references.add(text);
            }
        }
    }
    references
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn scans_later_messages_without_clipping_and_ignores_tool_output() {
        let snapshot = json!({"projection":{"messages":[
            {"role":"user","text":"Please check the feature"},
            {"role":"assistant","text":format!("{} AB#59458 ab58138 AB404 59541", "x".repeat(5000))},
            {"role":"tool","text":"AB#99999"}
        ]}});
        let references = from_snapshot(&snapshot);
        assert_eq!(references.explicit_ids, BTreeSet::from([58138, 59458]));
        assert_eq!(
            references.mentioned_ids,
            BTreeSet::from([404, 59458, 59541])
        );
    }

    #[test]
    fn database_scans_every_user_and_assistant_message_and_returns_empty_threads() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE orchestration_v2_projection_messages (thread_id TEXT, role TEXT, payload_json TEXT)").unwrap();
        for (role, text) in [
            ("user", "Start here"),
            ("user", "Now work on 58138"),
            ("assistant", "Implemented AB#59458"),
            ("system", "AB#99999"),
        ] {
            connection
                .execute(
                    "INSERT INTO orchestration_v2_projection_messages VALUES (?1, ?2, ?3)",
                    ("thread", role, json!({"text":text}).to_string()),
                )
                .unwrap();
        }
        let references = from_database(&connection, &["thread".into(), "empty".into()]).unwrap();
        assert_eq!(references["thread"].explicit_ids, BTreeSet::from([59458]));
        assert_eq!(
            references["thread"].mentioned_ids,
            BTreeSet::from([58138, 59458])
        );
        assert_eq!(references["empty"], ConversationReferences::default());
    }
}
