use keyring::Entry;

fn entry(service: &str) -> Result<Entry, String> {
    Entry::new("borgdock", service).map_err(|e| format!("Keychain error: {e}"))
}

// Every command here talks to the OS credential store (Windows Credential
// Manager / Keychain / Secret Service), which is a blocking round-trip. They
// are async + `spawn_blocking` so they never run inline on the GUI thread.

#[tauri::command]
pub async fn get_credential(service: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || get_credential_blocking(&service))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

pub(crate) fn get_credential_blocking(service: &str) -> Result<Option<String>, String> {
    match entry(service)?.get_password() {
        Ok(pw) => {
            log::info!(
                "keychain: get_credential '{service}' → hit ({} chars)",
                pw.len()
            );
            Ok(Some(pw))
        }
        Err(keyring::Error::NoEntry) => {
            log::info!("keychain: get_credential '{service}' → no entry");
            Ok(None)
        }
        Err(e) => {
            log::error!("keychain: get_credential '{service}' → error: {e}");
            Err(format!("Failed to read credential: {e}"))
        }
    }
}

#[tauri::command]
pub async fn set_credential(service: String, secret: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let result = entry(&service)?
            .set_password(&secret)
            .map_err(|e| format!("Failed to store credential: {e}"));
        match &result {
            Ok(()) => log::info!(
                "keychain: set_credential '{service}' ← stored ({} chars)",
                secret.len()
            ),
            Err(e) => log::error!("keychain: set_credential '{service}' ← failed: {e}"),
        }
        result
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn delete_credential(service: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || match entry(&service)?.delete_credential() {
        Ok(()) => {
            log::info!("keychain: delete_credential '{service}' → deleted");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            log::info!("keychain: delete_credential '{service}' → no entry");
            Ok(())
        }
        Err(e) => {
            log::error!("keychain: delete_credential '{service}' → error: {e}");
            Err(format!("Failed to delete credential: {e}"))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
