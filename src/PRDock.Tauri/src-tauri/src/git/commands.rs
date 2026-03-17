use std::process::Command;

fn run_git(working_dir: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(working_dir)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "git {} failed (exit {}): {}",
            args.join(" "),
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn git_fetch(repo_path: String, remote: Option<String>) -> Result<(), String> {
    let remote = remote.unwrap_or_else(|| "origin".to_string());
    run_git(&repo_path, &["fetch", &remote])?;
    Ok(())
}

#[tauri::command]
pub fn git_checkout(repo_path: String, branch: String) -> Result<(), String> {
    run_git(&repo_path, &["checkout", &branch])?;
    Ok(())
}

#[tauri::command]
pub fn git_current_branch(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
}
