use crate::settings;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ApiRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
}

#[derive(Deserialize)]
struct ContentBlock {
    text: Option<String>,
}

#[derive(Deserialize)]
struct ApiResponse {
    content: Vec<ContentBlock>,
}

#[derive(Deserialize)]
struct ApiError {
    error: Option<ApiErrorDetail>,
}

#[derive(Deserialize)]
struct ApiErrorDetail {
    message: Option<String>,
}

#[tauri::command]
pub async fn generate_pr_summary(
    title: String,
    body: String,
    changed_files: Vec<String>,
    branch_name: String,
    labels: Vec<String>,
    additions: u32,
    deletions: u32,
) -> Result<String, String> {
    // Load settings to get API key and model
    let settings = settings::load_settings_internal().map_err(|e| format!("Settings error: {}", e))?;
    let api_key = settings
        .claude_api
        .api_key
        .ok_or_else(|| "Claude API key not configured. Set it in Settings.".to_string())?;

    if api_key.is_empty() {
        return Err("Claude API key is empty. Set it in Settings.".to_string());
    }

    let model = if settings.claude_api.model.is_empty() {
        "claude-sonnet-4-6".to_string()
    } else {
        settings.claude_api.model
    };
    let max_tokens = if settings.claude_api.max_tokens == 0 {
        1024
    } else {
        settings.claude_api.max_tokens
    };

    // Build prompt
    let files_str = if changed_files.is_empty() {
        "None listed".to_string()
    } else {
        changed_files.join(", ")
    };
    let labels_str = if labels.is_empty() {
        "None".to_string()
    } else {
        labels.join(", ")
    };

    let prompt = format!(
        r#"You are a code review assistant. Given the following pull request metadata, provide a concise summary.

**Title:** {title}
**Branch:** {branch_name}
**Labels:** {labels_str}
**Size:** +{additions} / -{deletions} lines
**Changed files:** {files_str}

**Description:**
{body}

Please respond with exactly this format:

### Summary
<1-2 sentence explanation of what this PR does>

### Key Changes
- <bullet points of main changes>

### Risk Level
<Low / Medium / High> — <brief reason>

### Review Focus
- <areas reviewers should pay attention to>"#,
        title = title,
        branch_name = branch_name,
        labels_str = labels_str,
        additions = additions,
        deletions = deletions,
        files_str = files_str,
        body = if body.is_empty() { "No description provided" } else { &body },
    );

    let request = ApiRequest {
        model,
        max_tokens,
        messages: vec![Message {
            role: "user".to_string(),
            content: prompt,
        }],
    };

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        // Try to parse error message
        if let Ok(err) = serde_json::from_str::<ApiError>(&body_text) {
            if let Some(detail) = err.error {
                if let Some(msg) = detail.message {
                    return Err(format!("API error ({}): {}", status.as_u16(), msg));
                }
            }
        }
        return Err(format!("API error: {} {}", status.as_u16(), body_text));
    }

    let api_response: ApiResponse =
        serde_json::from_str(&body_text).map_err(|e| format!("Parse error: {}", e))?;

    let text = api_response
        .content
        .into_iter()
        .filter_map(|c| c.text)
        .collect::<Vec<_>>()
        .join("");

    if text.is_empty() {
        return Err("Empty response from Claude".to_string());
    }

    Ok(text)
}
