//! Transport to a T3 Code server, orchestration protocol 2: authenticated
//! HTTP for the read models, and Effect RPC over a WebSocket for commands.
//!
//! Every RPC opens its own socket. Commands are rare (start, answer, settle),
//! so a held connection would only add state to keep alive.

use super::hosts::{self, Host, HostRef};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;

const PROTOCOL_HEADER: &str = "x-t3-orchestration-protocol";
const PROTOCOL_VERSION: &str = "2";

const HTTP_TIMEOUT: Duration = Duration::from_secs(20);
const SOCKET_OPEN_TIMEOUT: Duration = Duration::from_secs(10);
const RPC_TIMEOUT: Duration = Duration::from_secs(30);

/// The id of the one request each socket carries.
const REQUEST_ID: &str = "1";

const REPAIR_HINT: &str = "Pair BorgDock with T3 again in Settings, Agents.";

pub struct Client {
    host: Host,
    token: String,
    http: reqwest::Client,
}

impl Client {
    /// A client for `host`, or an error when BorgDock holds no token for it.
    pub async fn connect(host: &HostRef) -> Result<Self, String> {
        let resolved = hosts::resolve(host).await?;
        let token = hosts::require_token(&resolved.id).await?;
        Ok(Self::new(resolved, token))
    }

    pub fn new(host: Host, token: String) -> Self {
        Self {
            host,
            token,
            http: crate::http::client(),
        }
    }

    pub fn host(&self) -> &Host {
        &self.host
    }

    pub async fn get(&self, path: &str) -> Result<Value, String> {
        let request = self
            .http
            .get(format!("{}{path}", self.host.origin))
            .header(PROTOCOL_HEADER, PROTOCOL_VERSION);
        self.send(path, request).await
    }

    pub async fn post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let request = self
            .http
            .post(format!("{}{path}", self.host.origin))
            .json(body);
        self.send(path, request).await
    }

    async fn post_without_body(&self, path: &str) -> Result<Value, String> {
        let request = self.http.post(format!("{}{path}", self.host.origin));
        self.send(path, request).await
    }

    async fn send(&self, path: &str, request: reqwest::RequestBuilder) -> Result<Value, String> {
        let response = request
            .bearer_auth(&self.token)
            .timeout(HTTP_TIMEOUT)
            .send()
            .await
            .map_err(|e| format!("T3 is not reachable ({path}): {e}"))?;
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("T3 {path} sent an unreadable answer: {e}"))?;
        if !status.is_success() {
            return Err(describe_http_failure(path, status.as_u16(), &body));
        }
        if body.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&body).map_err(|e| format!("T3 {path} sent invalid JSON: {e}"))
    }

    /// Call one RPC and wait for its result.
    pub async fn rpc(&self, tag: &str, payload: Value) -> Result<Value, String> {
        let started = std::time::Instant::now();
        let result = tokio::time::timeout(RPC_TIMEOUT, self.rpc_once(tag, payload))
            .await
            .unwrap_or_else(|_| {
                Err(format!(
                    "T3 did not answer {tag} within {} seconds",
                    RPC_TIMEOUT.as_secs()
                ))
            });
        log::info!(
            "T3 rpc {tag}: ok={} duration_ms={}",
            result.is_ok(),
            started.elapsed().as_millis()
        );
        result
    }

    async fn rpc_once(&self, tag: &str, payload: Value) -> Result<Value, String> {
        let ticket = self.post_without_body("/api/auth/websocket-ticket").await?;
        let ticket = ticket["ticket"]
            .as_str()
            .ok_or_else(|| "T3 did not issue a WebSocket ticket".to_string())?;
        let url = socket_url(&self.host.origin, ticket);
        let (mut socket, _) =
            tokio::time::timeout(SOCKET_OPEN_TIMEOUT, tokio_tungstenite::connect_async(url))
                .await
                .map_err(|_| "T3 WebSocket timed out while opening".to_string())?
                .map_err(|e| format!("T3 WebSocket failed to open: {e}"))?;

        socket
            .send(Message::Text(
                request_frame(tag, payload).to_string().into(),
            ))
            .await
            .map_err(|e| format!("T3 WebSocket send failed: {e}"))?;

        let outcome = loop {
            let Some(message) = socket.next().await else {
                break Err("T3 closed the connection before answering".to_string());
            };
            let text = match message {
                Ok(Message::Text(text)) => text,
                Ok(Message::Close(_)) => {
                    break Err("T3 closed the connection before answering".to_string())
                }
                Ok(_) => continue,
                Err(e) => break Err(format!("T3 WebSocket failed: {e}")),
            };
            let Ok(frames) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            let mut answer = None;
            for frame in frames_of(frames) {
                if frame["_tag"] == "Ping" {
                    let _ = socket
                        .send(Message::Text(json!({ "_tag": "Pong" }).to_string().into()))
                        .await;
                } else if let Some(result) = read_frame(&frame) {
                    answer = Some(result);
                    break;
                }
            }
            if let Some(result) = answer {
                break result;
            }
        };
        let _ = socket.close(None).await;
        outcome
    }
}

fn socket_url(origin: &str, ticket: &str) -> String {
    let base = if let Some(rest) = origin.strip_prefix("https://") {
        format!("wss://{rest}")
    } else {
        format!("ws://{}", origin.trim_start_matches("http://"))
    };
    format!(
        "{base}/ws?orchestrationProtocol={PROTOCOL_VERSION}&clientSurface=desktop&wsTicket={}",
        urlencoding::encode(ticket)
    )
}

/// T3 rejects a request without `headers`, and needs a `commandId` on every command.
fn request_frame(tag: &str, mut payload: Value) -> Value {
    if let Some(object) = payload.as_object_mut() {
        object
            .entry("commandId")
            .or_insert_with(|| json!(uuid::Uuid::new_v4().to_string()));
    }
    json!({ "_tag": "Request", "id": REQUEST_ID, "tag": tag, "payload": payload, "headers": [] })
}

/// A WebSocket text frame carries one message or an array of them.
fn frames_of(value: Value) -> Vec<Value> {
    match value {
        Value::Array(frames) => frames,
        frame => vec![frame],
    }
}

/// The result a frame carries for our request, if it is the one that ends it.
fn read_frame(frame: &Value) -> Option<Result<Value, String>> {
    match frame["_tag"].as_str()? {
        "Exit" if frame["requestId"] == REQUEST_ID => {
            let exit = &frame["exit"];
            if exit["_tag"] == "Success" {
                Some(Ok(exit["value"].clone()))
            } else {
                Some(Err(describe_rpc_failure(&exit["cause"])))
            }
        }
        "Defect" => Some(Err(format!("T3 failed: {}", plain_text(&frame["defect"])))),
        _ => None,
    }
}

fn plain_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

/// A failed Exit carries a list of causes: a typed error, a defect or an interrupt.
fn describe_rpc_failure(cause: &Value) -> String {
    let reasons = cause.as_array().cloned().unwrap_or_default();
    for reason in &reasons {
        let error = &reason["error"];
        if reason["_tag"] == "Fail" {
            if error["_tag"] == "EnvironmentAuthorizationError" {
                return format!(
                    "T3 denied the command ({}). {REPAIR_HINT}",
                    plain_text(&error["requiredScope"])
                );
            }
            if let Some(message) = error["message"].as_str() {
                return match error["detail"].as_str() {
                    Some(detail) if !detail.is_empty() => format!("{message} {detail}"),
                    _ => message.to_string(),
                };
            }
        }
    }
    for reason in &reasons {
        if reason["_tag"] == "Die" {
            return format!("T3 failed: {}", plain_text(&reason["defect"]));
        }
    }
    "T3 rejected the command".to_string()
}

fn describe_http_failure(path: &str, status: u16, body: &str) -> String {
    let detail: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    match status {
        401 => format!("T3 no longer accepts BorgDock's token. {REPAIR_HINT}"),
        403 => format!(
            "T3 denied {path} ({}). {REPAIR_HINT}",
            plain_text(&detail["requiredScope"])
        ),
        404 => format!("T3 has no such resource ({path})"),
        _ => match detail["reason"].as_str() {
            Some(reason) => format!("T3 {path} answered {status}: {reason}"),
            None => format!("T3 {path} answered {status}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_socket_url_follows_the_origin_scheme_and_encodes_the_ticket() {
        assert_eq!(
            socket_url("http://127.0.0.1:3773", "a b"),
            "ws://127.0.0.1:3773/ws?orchestrationProtocol=2&clientSurface=desktop&wsTicket=a%20b"
        );
        assert!(socket_url("https://mini.example", "t").starts_with("wss://mini.example/ws?"));
    }

    #[test]
    fn a_request_carries_headers_and_gets_a_command_id() {
        let frame = request_frame(
            "orchestration.dispatchCommand",
            json!({ "type": "thread.settle" }),
        );
        assert_eq!(frame["_tag"], "Request");
        assert_eq!(frame["headers"], json!([]));
        assert!(frame["payload"]["commandId"].as_str().is_some());
    }

    #[test]
    fn a_given_command_id_is_kept() {
        let frame = request_frame("x", json!({ "commandId": "mine" }));
        assert_eq!(frame["payload"]["commandId"], "mine");
    }

    #[test]
    fn a_successful_exit_yields_its_value() {
        let frame = json!({ "_tag": "Exit", "requestId": "1", "exit": { "_tag": "Success", "value": { "sequence": 7 } } });
        assert_eq!(read_frame(&frame), Some(Ok(json!({ "sequence": 7 }))));
    }

    #[test]
    fn frames_for_other_requests_and_pings_do_not_end_the_call() {
        assert_eq!(read_frame(&json!({ "_tag": "Pong" })), None);
        let other = json!({ "_tag": "Exit", "requestId": "2", "exit": { "_tag": "Success", "value": null } });
        assert_eq!(read_frame(&other), None);
    }

    #[test]
    fn a_failed_exit_reads_the_typed_error_message() {
        let frame = json!({ "_tag": "Exit", "requestId": "1", "exit": { "_tag": "Failure", "cause": [
            { "_tag": "Fail", "error": { "_tag": "OrchestrationV2DispatchCommandError", "message": "Request is not pending." } }
        ] } });
        assert_eq!(
            read_frame(&frame),
            Some(Err("Request is not pending.".to_string()))
        );
    }

    #[test]
    fn a_missing_scope_points_at_pairing() {
        let cause = json!([{ "_tag": "Fail", "error": { "_tag": "EnvironmentAuthorizationError", "message": "x", "requiredScope": "orchestration:operate" } }]);
        let message = describe_rpc_failure(&cause);
        assert!(message.contains("orchestration:operate"));
        assert!(message.contains("Pair BorgDock"));
    }

    #[test]
    fn a_defect_is_reported_as_text() {
        let cause = json!([{ "_tag": "Die", "defect": "Unknown request tag: nope" }]);
        assert_eq!(
            describe_rpc_failure(&cause),
            "T3 failed: Unknown request tag: nope"
        );
    }

    #[test]
    fn an_expired_token_asks_to_pair_again() {
        assert!(
            describe_http_failure("/api/orchestration/shell", 401, "{}").contains("Pair BorgDock")
        );
    }
}
