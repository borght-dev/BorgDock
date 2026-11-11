use tokio::sync::watch;

pub struct FlyoutReadiness(watch::Sender<bool>);

impl Default for FlyoutReadiness {
    fn default() -> Self {
        Self(watch::channel(false).0)
    }
}

impl FlyoutReadiness {
    pub fn reset(&self) {
        self.0.send_replace(false);
    }

    pub fn mark_ready(&self) {
        self.0.send_replace(true);
    }

    pub async fn wait(&self) -> Result<(), String> {
        let mut ready = self.0.subscribe();
        tokio::time::timeout(
            std::time::Duration::from_secs(30),
            ready.wait_for(|ready| *ready),
        )
        .await
        .map_err(|_| "flyout renderer did not become ready".to_string())?
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cold_delivery_waits_for_renderer_and_warm_delivery_does_not() {
        let ready = FlyoutReadiness::default();
        let first = ready.wait();
        let second = ready.wait();
        tokio::pin!(first, second);
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), &mut first)
                .await
                .is_err()
        );
        ready.mark_ready();
        first.await.unwrap();
        second.await.unwrap();
        ready.wait().await.unwrap();
        ready.reset();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), ready.wait())
                .await
                .is_err()
        );
    }
}
