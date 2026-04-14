use keyring::Entry;

fn entry(service: &str) -> Result<Entry, String> {
    Entry::new("prdock", service).map_err(|e| format!("Keychain error: {e}"))
}

#[tauri::command]
pub fn get_credential(service: String) -> Result<Option<String>, String> {
    match entry(&service)?.get_password() {
        Ok(pw) => {
            log::info!("keychain: get_credential '{service}' → hit ({} chars)", pw.len());
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
pub fn set_credential(service: String, secret: String) -> Result<(), String> {
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
}

#[tauri::command]
pub fn delete_credential(service: String) -> Result<(), String> {
    match entry(&service)?.delete_credential() {
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
    }
}
