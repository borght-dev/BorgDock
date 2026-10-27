use std::sync::LazyLock;

use regex::Regex;

use super::pattern;
use crate::ci_failures::signal::{Signal, SignalKind};

/// The word on its own: not glued to a branch, path or file name (`fix/save-error`,
/// `error-page.tsx`), which `\b` alone would accept.
static FAILURE_WORD: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i)(?:^|[^\w/.-])(?:error|failed|fatal)(?:$|[^\w/-])|exception"));
/// `0 Error(s)`, `2 warnings`, `failed: 0`: totals, not failures.
static TOTALS: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"(?i)^\s*\d+\s+(?:error|warning)|(?-u:\b)(?:failed|errors?)\s*[:=]\s*0(?-u:\b)")
});
/// A test runner's line for a passing test or a test's console output: test
/// names often contain "error" (`shows an error toast`) without anything failing.
static TEST_CHATTER: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^\s*(?:[✓✔√]|(?:stdout|stderr)\s*\|)"));

/// A hit's following lines are usually its own stack or detail.
const CONTEXT_LINES: usize = 3;

/// Lines that only say something failed. `first_line` is the section's offset
/// in the log, so `line` points into the whole log.
pub fn parse(lines: &[&str], first_line: usize) -> Vec<Signal> {
    let mut signals = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        if is_failure(line) {
            signals.push(Signal {
                line: u32::try_from(first_line + index + 1).ok(),
                ..Signal::new(SignalKind::Generic, "generic", line.trim())
            });
            index += CONTEXT_LINES;
        }
        index += 1;
    }
    signals
}

fn is_failure(line: &str) -> bool {
    FAILURE_WORD.is_match(line)
        && !TOTALS.is_match(line)
        && !TEST_CHATTER.is_match(line)
        && !line.trim_start().starts_with("##[")
}

#[cfg(test)]
mod tests {
    use super::super::extract;
    use super::*;

    const NETWORK: &str = include_str!("../fixtures/logs/network-generic.log");

    #[test]
    fn reads_a_network_failure_no_tool_parser_knows() {
        let extraction = extract(
            NETWORK,
            Some("Run node scripts/fetch-registry-metadata.mjs"),
        );
        assert!(extraction.step_found);
        let signals = extraction.signals;
        assert_eq!(signals.len(), 1, "{signals:#?}");
        assert_eq!(signals[0].kind, SignalKind::Generic);
        assert_eq!(
            signals[0].message,
            "Error: getaddrinfo ENOTFOUND registry.npmjs.org"
        );
        assert_eq!(signals[0].code, None);
        let log_line = signals[0].line.expect("log line") as usize;
        assert!(super::super::preprocess(NETWORK)
            .lines()
            .nth(log_line - 1)
            .is_some_and(|line| line.contains("ENOTFOUND registry.npmjs.org")));
    }

    #[test]
    fn skips_the_lines_after_a_hit() {
        let signals = parse(
            &[
                "error one",
                "error two",
                "error three",
                "error four",
                "error five",
            ],
            0,
        );
        let lines: Vec<Option<u32>> = signals.iter().map(|signal| signal.line).collect();
        assert_eq!(lines, vec![Some(1), Some(5)]);
    }

    #[test]
    fn ignores_passing_tests_console_output_names_and_zero_totals() {
        assert!(parse(
            &[
                " ✓  unit  src/forms/Summary.test.tsx > shows an error summary 4ms",
                "stderr | src/hooks/useUndo.test.ts > undo > shows error toast",
                "stdout | src/list.test.tsx > clears nothing when the list FAILED to load",
                " * [new branch]  fix/save-error -> origin/fix/save-error",
                "copied src/pages/error-page.tsx",
                "failed: 0",
            ],
            0,
        )
        .is_empty());
        assert_eq!(parse(&["Error: Cannot find module './client'"], 0).len(), 1);
        assert_eq!(parse(&["Deploy failed: 403 Forbidden"], 0).len(), 1);
    }

    #[test]
    fn matches_whole_words_only() {
        assert!(parse(&["errors were reported", "terrorist", "unfailed"], 0).is_empty());
        assert_eq!(
            parse(&["Unhandled exception. System.Exception: boom"], 0).len(),
            1
        );
    }
}
