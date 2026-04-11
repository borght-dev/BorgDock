use keyring::Entry;

fn entry(service: &str) -> Result<Entry, String> {
    Entry::new("prdock", service).map_err(|e| format!("Keychain error: {e}"))
}

#[tauri::command]
pub fn get_credential(service: String) -> Result<Option<String>, String> {
    match entry(&service)?.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read credential: {e}")),
    }
}

#[tauri::command]
pub fn set_credential(service: String, secret: String) -> Result<(), String> {
    entry(&service)?
        .set_password(&secret)
        .map_err(|e| format!("Failed to store credential: {e}"))
}

#[tauri::command]
pub fn delete_credential(service: String) -> Result<(), String> {
    match entry(&service)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete credential: {e}")),
    }
}
