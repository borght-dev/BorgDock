use crate::agent_overview::types::RawEvent;
use serde_json::Value;
use std::collections::HashMap;

/// Parse an OTLP/HTTP/JSON `ExportLogsServiceRequest` body into a flat list of
/// `RawEvent`s. Tolerant of missing/extra fields; never panics on malformed
/// input.
pub fn parse_export_logs(body: &Value) -> Vec<RawEvent> {
    let mut out = Vec::new();
    let resource_logs = body.get("resourceLogs").and_then(Value::as_array);
    let Some(resource_logs) = resource_logs else { return out };

    for resource_log in resource_logs {
        let resource_attrs = collect_attrs(resource_log.pointer("/resource/attributes"));
        let Some(scope_logs) = resource_log.get("scopeLogs").and_then(Value::as_array) else {
            continue;
        };
        for scope_log in scope_logs {
            let Some(records) = scope_log.get("logRecords").and_then(Value::as_array) else {
                continue;
            };
            for record in records {
                let mut attrs = resource_attrs.clone();
                for (k, v) in collect_attrs(record.get("attributes")) {
                    attrs.insert(k, v);
                }
                // Claude Code ≥ 2.1 emits `session.id` on the log record's
                // attributes, not on the resource. Look it up after merging so
                // both placements work.
                let sid = attrs
                    .get("session.id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                if sid.is_empty() {
                    continue;
                }
                let event_name = match attrs.get("event.name").and_then(Value::as_str) {
                    Some(s) => s.to_string(),
                    None => continue,
                };
                out.push(RawEvent { session_id: sid, event_name, attrs });
            }
        }
    }
    out
}

/// OTLP/JSON encodes attributes as `[{"key":..., "value":{"stringValue"|"intValue"|...}}, …]`.
/// Flatten the list to a key→Value map (collapsing the scalar wrapper).
fn collect_attrs(node: Option<&Value>) -> HashMap<String, Value> {
    let mut out = HashMap::new();
    let Some(arr) = node.and_then(Value::as_array) else { return out };
    for item in arr {
        let Some(key) = item.get("key").and_then(Value::as_str) else { continue };
        let val = item.get("value").map(unwrap_otlp_value).unwrap_or(Value::Null);
        out.insert(key.to_string(), val);
    }
    out
}

fn unwrap_otlp_value(node: &Value) -> Value {
    if let Some(s) = node.get("stringValue") {
        return s.clone();
    }
    if let Some(b) = node.get("boolValue") {
        return b.clone();
    }
    if let Some(i) = node.get("intValue") {
        // intValue is a string per the OTLP/JSON encoding; coerce to number.
        if let Some(s) = i.as_str() {
            if let Ok(n) = s.parse::<i64>() {
                return Value::from(n);
            }
        }
        return i.clone();
    }
    if let Some(d) = node.get("doubleValue") {
        return d.clone();
    }
    if let Some(a) = node.get("arrayValue") {
        return a.clone();
    }
    Value::Null
}

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone)]
pub struct ServerState {
    pub events_tx: UnboundedSender<RawEvent>,
}

/// Build the axum router. Exposed for tests.
pub fn build_router(state: ServerState) -> Router {
    Router::new()
        .route("/v1/logs", post(handle_logs))
        .with_state(Arc::new(state))
}

async fn handle_logs(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let events = parse_export_logs(&body);
    for e in events {
        if let Err(err) = state.events_tx.send(e) {
            log::warn!("agent_overview: events channel closed: {err}");
        }
    }
    (StatusCode::OK, Json(serde_json::json!({ "partialSuccess": {} })))
}

/// Bind on `127.0.0.1:port`, falling back across the next 10 ports if taken.
/// Returns the bound port on success.
pub async fn try_bind(port_start: u16) -> Result<(tokio::net::TcpListener, u16), String> {
    for p in port_start..port_start + 10 {
        let addr: SocketAddr = ([127, 0, 0, 1], p).into();
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => return Ok((l, p)),
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err(format!("no free port in {}..{}", port_start, port_start + 10))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sample_fixture() {
        let body: Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/otlp/api_request_end_turn.json"
        )).unwrap();
        let events = parse_export_logs(&body);
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.session_id, "8f7b28b7-cef1-45ac-b469-793b4c0d0fca");
        assert_eq!(e.event_name, "api_request");
        assert_eq!(e.attrs.get("model").unwrap(), &Value::String("claude-sonnet-4-6".into()));
        assert_eq!(e.attrs.get("stop_reason").unwrap(), &Value::String("end_turn".into()));
        assert_eq!(e.attrs.get("input_tokens").unwrap().as_i64().unwrap(), 1024);
    }

    #[test]
    fn missing_session_id_drops_record() {
        let body = serde_json::json!({
            "resourceLogs": [{
                "resource": { "attributes": [] },
                "scopeLogs": [{ "logRecords": [{
                    "attributes": [
                        { "key": "event.name", "value": { "stringValue": "api_request" } }
                    ]
                }] }]
            }]
        });
        assert!(parse_export_logs(&body).is_empty());
    }

    #[test]
    fn empty_body_returns_empty() {
        let body: Value = serde_json::from_str("{}").unwrap();
        assert!(parse_export_logs(&body).is_empty());
    }

    /// Claude Code ≥ 2.1 emits `session.id` on the log-record's attributes
    /// rather than the resource's. Make sure we still pick it up.
    #[test]
    fn record_level_session_id_is_picked_up() {
        let body = serde_json::json!({
            "resourceLogs": [{
                "resource": { "attributes": [
                    {"key": "service.name", "value": {"stringValue": "claude-code"}}
                ]},
                "scopeLogs": [{
                    "scope": {"name": "com.anthropic.claude_code.events"},
                    "logRecords": [{
                        "attributes": [
                            {"key": "session.id", "value": {"stringValue": "real-sid-123"}},
                            {"key": "event.name", "value": {"stringValue": "tool_decision"}},
                            {"key": "tool_name", "value": {"stringValue": "Bash"}}
                        ],
                        "body": {"stringValue": "claude_code.tool_decision"}
                    }]
                }]
            }]
        });
        let events = parse_export_logs(&body);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].session_id, "real-sid-123");
        assert_eq!(events[0].event_name, "tool_decision");
        assert_eq!(events[0].attrs.get("tool_name").unwrap(), &Value::String("Bash".into()));
    }
}
