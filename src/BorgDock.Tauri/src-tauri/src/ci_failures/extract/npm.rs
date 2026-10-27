use std::sync::LazyLock;

use regex::Regex;

use super::pattern;
use crate::ci_failures::signal::{Signal, SignalKind};

/// npm's detail lines that only describe the request or process.
static DETAIL_KEY: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(?:code|errno|syscall|path|dest|command|cwd|signal|file)\b"));
/// ` ERR_PNPM_FETCH_404  GET https://… - 404`
static PNPM: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*(ERR_PNPM_[A-Z0-9_]+)\s+(.+)$"));
/// bun install's resolution failures. Its `error: script "test" exited` wraps a test run instead.
static BUN: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"^error: (.+ failed to resolve|lockfile had changes, but lockfile is frozen|No version matching .+|package "[^"]+" not found.*)$"#,
    )
});
/// `error: GET https://registry.npmjs.org/@acme%2fwidget - 404`, printed before the failure it causes.
static BUN_FETCH: LazyLock<Regex> = LazyLock::new(|| pattern(r"^error: GET \S+ - (\d{3})$"));

/// bun prints the failed request this many lines before the resolution error at most.
const BUN_FETCH_LINES: usize = 3;

pub fn parse(lines: &[&str]) -> Vec<Signal> {
    let mut signals = npm(lines);
    signals.extend(lines.iter().filter_map(|line| pnpm(line)));
    signals.extend(bun(lines));
    signals
}

/// `npm ERR! code E404` (`npm error` since npm 10) and the lines after it.
fn npm(lines: &[&str]) -> Vec<Signal> {
    let mut signals = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let Some(code) = npm_text(lines[index]).and_then(|text| text.strip_prefix("code ")) else {
            index += 1;
            continue;
        };
        let details: Vec<&str> = lines[index + 1..]
            .iter()
            .map_while(|line| npm_text(line))
            .take_while(|text| !text.starts_with("code "))
            .collect();
        let end = index + 1 + details.len();
        if !is_script_exit(code) {
            let message = details
                .iter()
                .find(|text| !text.is_empty() && !DETAIL_KEY.is_match(text))
                .map_or_else(|| format!("npm {code}"), |text| text.to_string());
            signals.push(Signal {
                code: Some(code.to_string()),
                excerpt: lines[index..end]
                    .iter()
                    .map(|line| line.trim_end().to_string())
                    .collect(),
                ..Signal::new(SignalKind::Tooling, "npm", message)
            });
        }
        index = end;
    }
    signals
}

fn npm_text(line: &str) -> Option<&str> {
    let rest = line
        .strip_prefix("npm ERR!")
        .or_else(|| line.strip_prefix("npm error"))?;
    (rest.is_empty() || rest.starts_with(' ')).then(|| rest.trim())
}

/// A script that exited non-zero: the failure is in the script's own output.
fn is_script_exit(code: &str) -> bool {
    code == "ELIFECYCLE" || code.chars().all(|c| c.is_ascii_digit())
}

fn pnpm(line: &str) -> Option<Signal> {
    let captures = PNPM.captures(line)?;
    Some(Signal {
        code: Some(captures[1].to_string()),
        excerpt: vec![line.trim().to_string()],
        ..Signal::new(SignalKind::Tooling, "npm", captures[2].trim())
    })
}

/// bun names no error code; the HTTP status of the request before it stands in, as npm's `E404`.
fn bun(lines: &[&str]) -> Vec<Signal> {
    lines
        .iter()
        .enumerate()
        .filter_map(|(index, line)| {
            let captures = BUN.captures(line)?;
            let fetch = lines[index.saturating_sub(BUN_FETCH_LINES)..index]
                .iter()
                .rev()
                .find_map(|line| BUN_FETCH.captures(line).map(|fetch| (*line, fetch)));
            let mut excerpt: Vec<String> = fetch.iter().map(|(line, _)| line.to_string()).collect();
            excerpt.push(line.to_string());
            Some(Signal {
                code: fetch.map(|(_, status)| format!("E{}", &status[1])),
                excerpt,
                ..Signal::new(SignalKind::Tooling, "npm", captures[1].trim())
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::extract;
    use super::*;

    const E404: &str = include_str!("../fixtures/logs/npm-e404.log");

    #[test]
    fn reads_an_npm_404_from_a_job_log() {
        let extraction = extract(E404, Some("Run npm ci"));
        assert!(extraction.step_found);
        let signals = extraction.signals;
        assert_eq!(signals.len(), 1, "{signals:#?}");
        assert_eq!(signals[0].kind, SignalKind::Tooling);
        assert_eq!(signals[0].parser, "npm");
        assert_eq!(signals[0].code.as_deref(), Some("E404"));
        assert_eq!(
            signals[0].message,
            "404 Not Found - GET https://registry.npmjs.org/@acme%2fwidgets - Not found"
        );
        assert_eq!(signals[0].excerpt[0], "npm ERR! code E404");
    }

    #[test]
    fn reads_npm_10_resolution_errors() {
        let signals = parse(&[
            "npm error code ERESOLVE",
            "npm error ERESOLVE unable to resolve dependency tree",
            "npm error",
            "npm error While resolving: borgdock-site@1.0.0",
        ]);
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].code.as_deref(), Some("ERESOLVE"));
        assert_eq!(
            signals[0].message,
            "ERESOLVE unable to resolve dependency tree"
        );
        assert_eq!(signals[0].excerpt.len(), 4);
    }

    #[test]
    fn skips_script_exits() {
        assert!(parse(&[
            "npm ERR! code ELIFECYCLE",
            "npm ERR! errno 1",
            "npm error code 1",
            "npm error path /home/runner/work/app/app",
            "npm error command failed",
        ])
        .is_empty());
    }

    #[test]
    fn reads_bun_resolution_errors_with_the_request_status() {
        let signals = parse(&[
            "bun install v1.1.38 (bf2f153f)",
            "error: GET https://registry.npmjs.org/@acme%2fwidgets - 404",
            "error: @acme/widgets@^2.1.0 failed to resolve",
            "error: script \"test\" exited with code 1",
        ]);
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].message, "@acme/widgets@^2.1.0 failed to resolve");
        assert_eq!(signals[0].code.as_deref(), Some("E404"));
        assert_eq!(signals[0].excerpt.len(), 2);

        let frozen = parse(&["error: lockfile had changes, but lockfile is frozen"]);
        assert_eq!(frozen[0].code, None);
    }

    #[test]
    fn reads_pnpm_codes() {
        let signals = parse(&[
            " ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@acme%2Fwidgets: Not Found - 404",
        ]);
        assert_eq!(signals[0].code.as_deref(), Some("ERR_PNPM_FETCH_404"));
        assert_eq!(
            signals[0].message,
            "GET https://registry.npmjs.org/@acme%2Fwidgets: Not Found - 404"
        );
    }
}
