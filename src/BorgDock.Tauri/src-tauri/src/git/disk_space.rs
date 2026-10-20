use std::collections::BTreeMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use super::remote_worktree::{shell_quote, ssh_command};
use super::{hidden_command, output_with_timeout};
use crate::settings::models::{AppSettings, RemoteWorktreeRepoSettings};
use crate::t3::hosts::HostRef;

const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpace {
    pub drive: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostDisks {
    pub id: String,
    pub label: String,
    pub disks: Vec<DiskSpace>,
    pub checked_at: u64,
    pub error: Option<String>,
    pub t3_host: Option<HostRef>,
}

fn parse_df(output: &str) -> Result<Vec<DiskSpace>, String> {
    let mut disks = BTreeMap::new();
    for line in output.lines().skip(1) {
        let fields: Vec<_> = line.split_whitespace().collect();
        // POSIX -P keeps one filesystem per line. A mount name may contain spaces.
        let Some(index) = (1..fields.len().saturating_sub(4)).find(|&i| {
            fields[i].parse::<u64>().is_ok()
                && fields[i + 1].parse::<u64>().is_ok()
                && fields[i + 2].parse::<u64>().is_ok()
                && fields[i + 3].ends_with('%')
        }) else {
            continue;
        };
        let total = fields[index].parse::<u64>().unwrap_or(0).checked_mul(1024);
        let free = fields[index + 2]
            .parse::<u64>()
            .unwrap_or(0)
            .checked_mul(1024);
        if let (Some(total_bytes), Some(free_bytes)) = (total.filter(|n| *n > 0), free) {
            let drive = fields[index + 4..].join(" ");
            if !drive.is_empty() {
                disks.insert(
                    drive.clone(),
                    DiskSpace {
                        drive,
                        total_bytes,
                        free_bytes: free_bytes.min(total_bytes),
                    },
                );
            }
        }
    }
    if disks.is_empty() {
        return Err("No disk measurements returned".to_string());
    }
    Ok(disks.into_values().collect())
}

#[cfg(any(windows, test))]
fn parse_windows(output: &str) -> Result<Vec<DiskSpace>, String> {
    let value: serde_json::Value =
        serde_json::from_str(output.trim()).map_err(|e| e.to_string())?;
    let rows = match value {
        serde_json::Value::Array(rows) => rows,
        other => vec![other],
    };
    let mut disks: Vec<_> = rows
        .into_iter()
        .filter_map(|row| {
            let drive = row["DeviceID"].as_str()?.to_string();
            let total_bytes = row["Size"].as_u64().filter(|n| *n > 0)?;
            let free_bytes = row["FreeSpace"].as_u64()?.min(total_bytes);
            Some(DiskSpace {
                drive,
                total_bytes,
                free_bytes,
            })
        })
        .collect();
    disks.sort_by(|a, b| a.drive.cmp(&b.drive));
    if disks.is_empty() {
        return Err("No fixed disk measurements returned".to_string());
    }
    Ok(disks)
}

fn read_command(mut command: std::process::Command) -> Result<String, String> {
    let output = output_with_timeout(&mut command, TIMEOUT).map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn df_command(paths: &[String]) -> String {
    let paths = paths
        .iter()
        .filter(|p| p.starts_with('/'))
        .map(|p| shell_quote(p))
        .collect::<Vec<_>>()
        .join(" ");
    format!("LC_ALL=C df -Pk / {paths}")
}

fn local_disks(settings: &AppSettings) -> Result<Vec<DiskSpace>, String> {
    #[cfg(windows)]
    {
        let _ = settings;
        let mut command = hidden_command("powershell.exe");
        command.args(["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress"]);
        parse_windows(&read_command(command)?)
    }
    #[cfg(not(windows))]
    {
        let paths = settings
            .repos
            .iter()
            .filter(|r| r.enabled)
            .map(|r| r.worktree_base_path.clone())
            .collect::<Vec<_>>();
        let mut command = hidden_command("sh");
        command.args(["-c", &df_command(&paths)]);
        parse_df(&read_command(command)?)
    }
}

fn remote_disks(
    repo: &RemoteWorktreeRepoSettings,
    paths: &[String],
) -> Result<Vec<DiskSpace>, String> {
    let mut command = ssh_command(repo)?;
    command.arg(df_command(paths));
    parse_df(&read_command(command)?)
}

fn remote_t3_host(settings: &AppSettings, target: &str) -> Option<HostRef> {
    let address = target.rsplit('@').next()?.trim_matches(['[', ']']);
    let matches: Vec<_> = settings
        .agents
        .t3_hosts
        .iter()
        .filter(|host| !host.id.is_empty() && host.id != "local")
        .filter(|host| {
            reqwest::Url::parse(&host.base_url)
                .ok()
                .and_then(|url| url.host_str().map(str::to_string))
                .is_some_and(|name| name.eq_ignore_ascii_case(address))
        })
        .collect();
    if matches.len() != 1 {
        return None;
    }
    Some(HostRef {
        id: matches[0].id.clone(),
        base_url: Some(matches[0].base_url.clone()),
    })
}

fn measurement(
    id: String,
    label: String,
    t3_host: Option<HostRef>,
    result: Result<Vec<DiskSpace>, String>,
) -> HostDisks {
    let (disks, error) = match result {
        Ok(disks) => (disks, None),
        Err(error) => (vec![], Some(error)),
    };
    HostDisks {
        id,
        label,
        disks,
        error,
        t3_host,
        checked_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    }
}

#[tauri::command]
pub async fn host_disk_space() -> Result<Vec<HostDisks>, String> {
    let settings = tokio::task::spawn_blocking(crate::settings::load_settings_internal)
        .await
        .map_err(|e| e.to_string())??;
    let mut remotes: BTreeMap<String, Vec<RemoteWorktreeRepoSettings>> = BTreeMap::new();
    for repo in settings
        .remote_worktree_repos
        .iter()
        .filter(|repo| repo.enabled && !repo.ssh_target.trim().is_empty())
    {
        remotes
            .entry(repo.ssh_target.trim().to_string())
            .or_default()
            .push(repo.clone());
    }
    let mut tasks = tokio::task::JoinSet::new();
    for (target, repos) in remotes {
        let t3_host = remote_t3_host(&settings, &target);
        tasks.spawn_blocking(move || {
            let repo = &repos[0];
            let label = if repo.label.trim().is_empty() {
                target.clone()
            } else {
                repo.label.clone()
            };
            let paths = repos
                .iter()
                .map(|r| r.base_path.clone())
                .collect::<Vec<_>>();
            measurement(target, label, t3_host, remote_disks(repo, &paths))
        });
    }
    tasks.spawn_blocking(move || {
        let label = std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "This machine".to_string());
        measurement(
            "local".to_string(),
            label,
            Some(HostRef::local()),
            local_disks(&settings),
        )
    });
    let mut hosts = Vec::new();
    while let Some(result) = tasks.join_next().await {
        hosts.push(result.map_err(|e| e.to_string())?);
    }
    hosts.sort_by(|a, b| {
        (a.id != "local")
            .cmp(&(b.id != "local"))
            .then_with(|| a.label.cmp(&b.label))
    });
    Ok(hosts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Read-only disk probe on this machine"]
    fn live_local_disk_probe() {
        let disks = local_disks(&AppSettings::default()).unwrap();
        assert!(!disks.is_empty());
        for disk in disks {
            assert!(disk.total_bytes > 0 && disk.free_bytes <= disk.total_bytes);
            println!(
                "{}: {} bytes free of {}",
                disk.drive, disk.free_bytes, disk.total_bytes
            );
        }
    }

    #[test]
    fn df_uses_available_space_and_keeps_mount_names_with_spaces() {
        let disks = parse_df("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/a 100 80 15 85% /\n/dev/b 200 10 190 5% /Volumes/My Drive\n/dev/a 100 80 15 85% /\n").unwrap();
        assert_eq!(disks.len(), 2);
        assert_eq!(disks[0].free_bytes, 15 * 1024);
        assert_eq!(disks[1].drive, "/Volumes/My Drive");
        assert!(parse_df("Filesystem\ninvalid").is_err());
    }

    #[test]
    fn windows_accepts_single_and_multiple_drives_and_rejects_missing_space() {
        let row = r#"{"DeviceID":"C:","Size":100,"FreeSpace":0}"#;
        assert_eq!(parse_windows(row).unwrap()[0].free_bytes, 0);
        assert_eq!(parse_windows(&format!("[{row},{row}]")).unwrap().len(), 2);
        assert!(parse_windows(r#"{"DeviceID":"C:","Size":100}"#).is_err());
    }

    #[test]
    fn t3_mapping_requires_one_exact_host_address() {
        let mut settings = AppSettings::default();
        settings
            .agents
            .t3_hosts
            .push(crate::settings::models::T3HostSettings {
                id: "mini".into(),
                label: "Mac mini".into(),
                base_url: "http://100.88.82.41:3773".into(),
            });
        assert_eq!(
            remote_t3_host(&settings, "koen@100.88.82.41").unwrap().id,
            "mini"
        );
        assert!(remote_t3_host(&settings, "vera").is_none());
        settings
            .agents
            .t3_hosts
            .push(settings.agents.t3_hosts[0].clone());
        assert!(remote_t3_host(&settings, "koen@100.88.82.41").is_none());
    }

    #[test]
    fn remote_paths_are_quoted_and_never_become_options() {
        assert_eq!(
            df_command(&["/Users/O'Brien/a b".into(), "-bad".into()]),
            "LC_ALL=C df -Pk / '/Users/O'\"'\"'Brien/a b'"
        );
    }
}
