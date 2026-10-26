use std::path::{Path, PathBuf};

pub fn directory() -> PathBuf {
    match std::env::var_os("BORGDOCK_DATA_DIR") {
        Some(path) => {
            let path = PathBuf::from(path);
            if path.is_absolute() {
                path
            } else {
                std::env::current_dir()
                    .expect("current directory unavailable")
                    .join(path)
            }
        }
        None => dirs::config_dir()
            .expect("config directory unavailable")
            .join("BorgDock"),
    }
}

fn scoped_service(profile: Option<&Path>, service: &str) -> String {
    match profile {
        Some(path) => format!(
            "borgdock-profile:{}:{service}",
            &blake3::hash(path.to_string_lossy().as_bytes()).to_hex()[..16]
        ),
        None => service.to_string(),
    }
}

pub fn credential_service(service: &str) -> String {
    let profile = std::env::var_os("BORGDOCK_DATA_DIR").map(|_| directory());
    scoped_service(profile.as_deref(), service)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn isolated_profiles_keep_the_default_credential_targets_untouched() {
        let name = "borgdock:github";
        assert_eq!(scoped_service(None, name), name);
        let first = scoped_service(Some(Path::new("profile-one")), name);
        let second = scoped_service(Some(Path::new("profile-two")), name);
        assert_ne!(first, second);
        assert_ne!(first, name);
        assert_eq!(first, scoped_service(Some(Path::new("profile-one")), name));
    }
}
