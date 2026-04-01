use serde::Serialize;
use tiberius::{AuthMethod, Client, Config, Row};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

use crate::settings;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultSet {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
    pub row_count: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub result_sets: Vec<ResultSet>,
    pub execution_time_ms: u64,
    pub total_row_count: usize,
}

const MAX_ROWS: usize = 10_000;

fn build_config(
    server: &str,
    port: u16,
    database: &str,
    authentication: &str,
    username: Option<&str>,
    password: Option<&str>,
    trust_server_certificate: bool,
) -> Result<Config, String> {
    let mut config = Config::new();
    config.host(server);
    config.port(port);
    config.database(database);

    if trust_server_certificate {
        config.trust_cert();
    }

    match authentication {
        "sql" => {
            let user = username.unwrap_or_default();
            let pass = password.unwrap_or_default();
            config.authentication(AuthMethod::sql_server(user, pass));
        }
        _ => {
            // Windows Integrated auth (SSPI)
            config.authentication(AuthMethod::Integrated);
        }
    }

    Ok(config)
}

async fn connect(
    server: &str,
    port: u16,
    config: Config,
) -> Result<Client<tokio_util::compat::Compat<TcpStream>>, String> {
    let addr = format!("{server}:{port}");

    let tcp = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| "Connection timed out after 10 seconds".to_string())?
    .map_err(|e| format!("TCP connection failed: {e}"))?;

    tcp.set_nodelay(true).ok();

    let client = Client::connect(config, tcp.compat_write())
        .await
        .map_err(|e| format!("TDS connection failed: {e}"))?;

    Ok(client)
}

/// Convert a single row to a vector of optional strings.
/// Uses `try_get` with `&str` for string-convertible types and falls back to
/// reading the raw column data as a formatted string.
fn row_to_strings(row: &Row) -> Vec<Option<String>> {
    let col_count = row.columns().len();
    (0..col_count)
        .map(|i| {
            // Try common types in order of likelihood
            if let Some(val) = row.try_get::<&str, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<i32, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<i64, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<i16, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<u8, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<f64, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<f32, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<bool, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<uuid::Uuid, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<rust_decimal::Decimal, _>(i).ok().flatten() {
                return Some(val.to_string());
            }
            if let Some(val) = row.try_get::<chrono::NaiveDateTime, _>(i).ok().flatten() {
                return Some(val.format("%Y-%m-%d %H:%M:%S%.3f").to_string());
            }
            if let Some(val) = row.try_get::<chrono::NaiveDate, _>(i).ok().flatten() {
                return Some(val.format("%Y-%m-%d").to_string());
            }
            if let Some(val) = row.try_get::<chrono::NaiveTime, _>(i).ok().flatten() {
                return Some(val.format("%H:%M:%S%.3f").to_string());
            }
            if let Some(val) = row.try_get::<&[u8], _>(i).ok().flatten() {
                return Some(
                    val.iter()
                        .map(|b| format!("{b:02X}"))
                        .collect::<String>(),
                );
            }
            // If all typed attempts fail, the value is NULL
            None
        })
        .collect()
}

#[tauri::command]
pub async fn execute_sql_query(
    connection_name: String,
    query: String,
) -> Result<QueryResult, String> {
    let settings = settings::load_settings_internal()
        .map_err(|e| format!("Failed to load settings: {e}"))?;

    let conn_config = settings
        .sql
        .connections
        .iter()
        .find(|c| c.name == connection_name)
        .ok_or_else(|| format!("Connection '{}' not found", connection_name))?;

    let config = build_config(
        &conn_config.server,
        conn_config.port,
        &conn_config.database,
        &conn_config.authentication,
        conn_config.username.as_deref(),
        conn_config.password.as_deref(),
        conn_config.trust_server_certificate,
    )?;

    let server = conn_config.server.clone();
    let port = conn_config.port;
    let mut client = connect(&server, port, config).await?;

    let start = std::time::Instant::now();

    let stream = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        client.query(query, &[]),
    )
    .await
    .map_err(|_| "Query timed out after 30 seconds".to_string())?
    .map_err(|e| format!("Query failed: {e}"))?;

    let results = stream
        .into_results()
        .await
        .map_err(|e| format!("Failed to read results: {e}"))?;

    let execution_time_ms = start.elapsed().as_millis() as u64;

    let mut result_sets = Vec::new();
    let mut total_row_count = 0;

    for rows in results {
        if rows.is_empty() {
            continue;
        }

        let columns: Vec<String> = rows[0]
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect();

        let mut data_rows: Vec<Vec<Option<String>>> = Vec::new();
        let mut truncated = false;

        for (i, row) in rows.iter().enumerate() {
            if i >= MAX_ROWS {
                truncated = true;
                break;
            }
            data_rows.push(row_to_strings(row));
        }

        let row_count = data_rows.len();
        total_row_count += row_count;

        result_sets.push(ResultSet {
            columns,
            rows: data_rows,
            row_count,
            truncated,
        });
    }

    Ok(QueryResult {
        result_sets,
        execution_time_ms,
        total_row_count,
    })
}

#[tauri::command]
pub async fn test_sql_connection(
    server: String,
    port: u16,
    database: String,
    authentication: String,
    username: Option<String>,
    password: Option<String>,
    trust_server_certificate: bool,
) -> Result<String, String> {
    let config = build_config(
        &server,
        port,
        &database,
        &authentication,
        username.as_deref(),
        password.as_deref(),
        trust_server_certificate,
    )?;

    let mut client = connect(&server, port, config).await?;

    client
        .query("SELECT 1", &[])
        .await
        .map_err(|e| format!("Test query failed: {e}"))?;

    Ok("Connection successful".to_string())
}
