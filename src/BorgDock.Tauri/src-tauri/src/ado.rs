use serde::{Deserialize, Serialize};

/// Generic HTTP proxy for Azure DevOps API calls.
/// The webview cannot reach dev.azure.com directly because the ADO API
/// does not return CORS headers for the Tauri origin.  By routing through
/// reqwest on the Rust side we bypass the browser's same-origin policy.

#[derive(Deserialize)]
pub struct AdoFetchRequest {
    pub url: String,
    pub method: String, // GET, POST, PATCH, DELETE
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Serialize)]
pub struct AdoFetchResponse {
    pub status: u16,
    pub status_text: String,
    pub body: String,
    /// Base64-encoded body for binary / stream responses.
    pub body_base64: Option<String>,
    pub headers: std::collections::HashMap<String, String>,
}

#[tauri::command]
pub async fn ado_fetch(request: AdoFetchRequest) -> Result<AdoFetchResponse, String> {
    let client = reqwest::Client::new();

    let mut builder = match request.method.to_uppercase().as_str() {
        "POST" => client.post(&request.url),
        "PATCH" => client.patch(&request.url),
        "DELETE" => client.delete(&request.url),
        _ => client.get(&request.url),
    };

    for (key, value) in &request.headers {
        builder = builder.header(key.as_str(), value.as_str());
    }

    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    builder = builder.timeout(std::time::Duration::from_secs(30));

    let response = builder
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let resp_headers: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let body = String::from_utf8_lossy(&bytes).to_string();

    Ok(AdoFetchResponse {
        status,
        status_text,
        body,
        body_base64: None,
        headers: resp_headers,
    })
}
