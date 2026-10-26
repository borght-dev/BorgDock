use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct SqlQueries(Arc<Mutex<HashMap<String, CancellationToken>>>);

pub struct QueryGuard {
    id: String,
    queries: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl Drop for QueryGuard {
    fn drop(&mut self) {
        self.queries
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&self.id);
    }
}

impl SqlQueries {
    pub fn register(&self, id: String) -> Result<(CancellationToken, QueryGuard), String> {
        let mut queries = self.0.lock().unwrap_or_else(|p| p.into_inner());
        if queries.contains_key(&id) {
            return Err("A query with this id is already running".into());
        }
        let token = CancellationToken::new();
        queries.insert(id.clone(), token.clone());
        Ok((
            token,
            QueryGuard {
                id,
                queries: self.0.clone(),
            },
        ))
    }

    pub fn cancel(&self, id: &str) {
        if let Some(token) = self.0.lock().unwrap_or_else(|p| p.into_inner()).get(id) {
            token.cancel();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_targets_only_the_registered_query_and_cleans_up() {
        let queries = SqlQueries::default();
        let (first, guard) = queries.register("one".into()).unwrap();
        let (second, _guard) = queries.register("two".into()).unwrap();
        assert!(queries.register("one".into()).is_err());
        queries.cancel("one");
        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
        drop(guard);
        assert!(queries.register("one".into()).is_ok());
    }
}
