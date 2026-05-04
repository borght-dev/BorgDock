use rusqlite::{params, Connection};

/// One row from `agent_session_meta`. Both ms fields are nullable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionMeta {
    pub snoozed_until_ms: Option<u128>,
    pub seen_at_ms: Option<u128>,
}

pub fn put(
    conn: &Connection,
    session_id: &str,
    snoozed_until_ms: Option<u128>,
    seen_at_ms: Option<u128>,
    now_ms: u128,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO agent_session_meta
            (session_id, snoozed_until_ms, seen_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(session_id) DO UPDATE SET
            snoozed_until_ms = excluded.snoozed_until_ms,
            seen_at_ms       = excluded.seen_at_ms,
            updated_at_ms    = excluded.updated_at_ms",
        params![
            session_id,
            snoozed_until_ms.map(|n| n as i64),
            seen_at_ms.map(|n| n as i64),
            now_ms as i64,
        ],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, session_id: &str) -> Result<Option<SessionMeta>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT snoozed_until_ms, seen_at_ms FROM agent_session_meta WHERE session_id = ?1",
    )?;
    let mut rows = stmt.query(params![session_id])?;
    if let Some(row) = rows.next()? {
        let snoozed: Option<i64> = row.get(0)?;
        let seen: Option<i64> = row.get(1)?;
        Ok(Some(SessionMeta {
            snoozed_until_ms: snoozed.map(|n| n as u128),
            seen_at_ms: seen.map(|n| n as u128),
        }))
    } else {
        Ok(None)
    }
}

pub fn load_all(
    conn: &Connection,
) -> Result<std::collections::HashMap<String, SessionMeta>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT session_id, snoozed_until_ms, seen_at_ms FROM agent_session_meta",
    )?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let snoozed: Option<i64> = row.get(1)?;
        let seen: Option<i64> = row.get(2)?;
        Ok((
            id,
            SessionMeta {
                snoozed_until_ms: snoozed.map(|n| n as u128),
                seen_at_ms: seen.map(|n| n as u128),
            },
        ))
    })?;
    let mut out = std::collections::HashMap::new();
    for r in rows {
        let (id, m) = r?;
        out.insert(id, m);
    }
    Ok(out)
}

pub fn gc_older_than(conn: &Connection, cutoff_ms: u128) -> Result<usize, rusqlite::Error> {
    let n = conn.execute(
        "DELETE FROM agent_session_meta WHERE updated_at_ms < ?1",
        params![cutoff_ms as i64],
    )?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE agent_session_meta (
                session_id TEXT PRIMARY KEY,
                snoozed_until_ms INTEGER,
                seen_at_ms INTEGER,
                updated_at_ms INTEGER NOT NULL);",
        )
        .unwrap();
        c
    }

    #[test]
    fn put_then_get_roundtrip() {
        let c = open();
        put(&c, "sid", Some(123), Some(456), 1000).unwrap();
        let got = get(&c, "sid").unwrap();
        assert_eq!(
            got,
            Some(SessionMeta {
                snoozed_until_ms: Some(123),
                seen_at_ms: Some(456),
            })
        );
    }

    #[test]
    fn put_overwrites_existing() {
        let c = open();
        put(&c, "sid", Some(1), Some(2), 1000).unwrap();
        put(&c, "sid", None, Some(99), 2000).unwrap();
        let got = get(&c, "sid").unwrap().unwrap();
        assert_eq!(got.snoozed_until_ms, None);
        assert_eq!(got.seen_at_ms, Some(99));
    }

    #[test]
    fn get_returns_none_for_missing() {
        let c = open();
        assert!(get(&c, "nope").unwrap().is_none());
    }

    #[test]
    fn gc_drops_rows_older_than_cutoff() {
        let c = open();
        put(&c, "old", None, Some(1), 100).unwrap();
        put(&c, "new", None, Some(2), 1000).unwrap();
        let removed = gc_older_than(&c, 500).unwrap();
        assert_eq!(removed, 1);
        assert!(get(&c, "old").unwrap().is_none());
        assert!(get(&c, "new").unwrap().is_some());
    }
}
