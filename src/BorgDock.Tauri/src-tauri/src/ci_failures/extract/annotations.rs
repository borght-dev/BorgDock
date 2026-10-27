use std::sync::LazyLock;

use regex::Regex;

use super::{pattern, playwright};
use crate::ci_failures::signal::{Signal, SignalKind};

/// The runner's own last line for a failed step; it says nothing about why.
pub const EXIT_CODE: &str = "Process completed with exit code";

/// Compiler lines the MSBuild and tsc parsers already report.
static COMPILER_ERROR: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"\(\d+,\d+\):\s*error\s+[A-Z]+\d+:"));

pub fn parse(lines: &[&str]) -> Vec<Signal> {
    lines
        .iter()
        .filter_map(|line| line.strip_prefix("##[error]"))
        .map(str::trim)
        .filter(|message| {
            !message.is_empty()
                && !message.starts_with(EXIT_CODE)
                && !COMPILER_ERROR.is_match(message)
                && !playwright::is_failure_header(message)
        })
        .map(|message| Signal::new(SignalKind::Annotation, "actions-annotation", message))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_playwright_headers_the_github_reporter_repeats() {
        assert!(parse(&[
            "##[error]  1) [chromium] › tests/login.spec.ts:42:10 › Login flow ───────────",
        ])
        .is_empty());
    }
}
