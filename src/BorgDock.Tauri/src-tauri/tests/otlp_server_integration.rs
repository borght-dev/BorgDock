use axum::body::Body;
use axum::http::Request;
use borgdock_lib::agent_overview::otlp_server::{build_router, ServerState};
use serde_json::Value;
use tokio::sync::mpsc::unbounded_channel;
use tower::ServiceExt;

#[tokio::test]
async fn post_v1_logs_pushes_events_to_channel() {
    let (tx, mut rx) = unbounded_channel();
    let app = build_router(ServerState { events_tx: tx });

    let body: Value = serde_json::from_str(
        include_str!("fixtures/otlp/api_request_end_turn.json"),
    ).unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/logs")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let evt = rx.try_recv().unwrap();
    assert_eq!(evt.event_name, "api_request");
}

#[test]
fn unknown_path_404s() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let (tx, _rx) = unbounded_channel();
        let app = build_router(ServerState { events_tx: tx });
        let resp = app
            .oneshot(Request::builder().uri("/v1/metrics").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), 404);
    });
}
