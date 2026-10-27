use std::collections::HashSet;
use std::sync::LazyLock;

use regex::{Captures, Regex};

use super::{excerpt, expected_received, number, pattern};
use crate::ci_failures::signal::{Signal, SignalKind, MAX_EXCERPT_LINES};

/// `1) [chromium] › tests/login.spec.ts:42:10 › Login flow ───`
static FAILURE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"\d+\)\s*\[(\w+)\]\s*›\s*(.+?):(\d+):\d+\s*›\s*(.+?)\s*$"));
static SUMMARY_LINE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^\s*(\d+)\s+(failed|flaky|skipped|did not run|passed)"));
static ERROR_CLASS: LazyLock<Regex> = LazyLock::new(|| pattern(r"^(\w*Error):"));

const BROWSERS: [&str; 3] = ["[chromium]", "[firefox]", "[webkit]"];
/// Where the list reporter ends a failure's error and starts its retries or files.
const CONTEXT_ENDS: [&str; 3] = ["Retry #", "attachment #", "Error Context:"];

/// The summary comes first, then each failed test once: the reporter repeats a
/// test's header for every retry it prints.
pub fn parse(lines: &[&str]) -> Vec<Signal> {
    if !lines.iter().any(|line| SUMMARY_LINE.is_match(line))
        || !lines
            .iter()
            .any(|line| BROWSERS.iter().any(|browser| line.contains(browser)))
    {
        return Vec::new();
    }
    let mut signals = Vec::new();
    signals.extend(summary(lines));
    signals.extend(failures(lines));
    signals
}

/// GitHub's reporter turns each failure header into an `##[error]` line.
pub fn is_failure_header(text: &str) -> bool {
    FAILURE.is_match(text)
}

fn failures(lines: &[&str]) -> Vec<Signal> {
    let mut seen = HashSet::new();
    let mut signals = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let Some(captures) = FAILURE.captures(line) else {
            continue;
        };
        if seen.insert(format!("[{}] {}", &captures[1], title(&captures))) {
            signals.push(failure(lines, index, &captures));
        }
    }
    signals
}

/// The header pads the title with box-drawing rules to the terminal's width.
fn title<'a>(captures: &'a Captures) -> &'a str {
    captures[4].trim_end_matches(|c: char| c == '─' || c.is_whitespace())
}

fn failure(lines: &[&str], header: usize, captures: &Captures) -> Signal {
    let block = block(lines, header);
    let context: Vec<&str> = block
        .iter()
        .copied()
        .take_while(|line| !CONTEXT_ENDS.iter().any(|end| line.trim().starts_with(end)))
        .filter(|line| !line.trim().is_empty())
        .take(MAX_EXCERPT_LINES)
        .collect();
    let title = title(captures);
    let path = captures[2].trim();
    let (expected, actual) = expected_received(&context);
    let retries = block
        .iter()
        .filter(|line| line.trim().starts_with("Retry #"))
        .count();
    let message = context.first().map_or_else(
        || format!("Test failed: {title}"),
        |line| line.trim().to_string(),
    );
    Signal {
        test_id: Some(format!("{path} › {title}")),
        params: Some(captures[1].to_string()),
        path: Some(path.to_string()),
        line: number(&captures[3]),
        error_class: context
            .iter()
            .find_map(|line| ERROR_CLASS.captures(line.trim()))
            .map(|class| class[1].to_string()),
        expected,
        actual,
        excerpt: excerpt(&context),
        repeats: u32::try_from(retries + 1).unwrap_or(u32::MAX),
        ..Signal::new(SignalKind::Test, "playwright", message)
    }
}

/// The lines after a header, up to the next failure or the summary.
fn block<'a>(lines: &[&'a str], header: usize) -> Vec<&'a str> {
    lines[header + 1..]
        .iter()
        .copied()
        .take_while(|line| !FAILURE.is_match(line) && !SUMMARY_LINE.is_match(line))
        .collect()
}

/// The last run of summary lines (`1 failed`, the tests it lists, `38 passed`).
fn summary(lines: &[&str]) -> Option<Signal> {
    let mut start = None;
    let mut end = None;
    for (index, line) in lines.iter().enumerate().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if start.is_some() {
                break;
            }
        } else if SUMMARY_LINE.is_match(trimmed) {
            start = Some(index);
            end.get_or_insert(index);
        } else if start.is_some() {
            let lists_a_test =
                trimmed.contains("] ›") && BROWSERS.iter().any(|browser| trimmed.contains(browser));
            if !lists_a_test {
                break;
            }
            start = Some(index);
        }
    }
    let block = &lines[start?..=end?];
    Some(Signal {
        excerpt: excerpt(block),
        ..Signal::new(SignalKind::Summary, "playwright", block[0].trim())
    })
}

#[cfg(test)]
mod tests {
    use super::super::extract;
    use super::*;

    const RETRIES: &str = include_str!("../fixtures/logs/playwright-retries.log");

    #[test]
    fn collapses_retries_into_one_signal_per_test() {
        let extraction = extract(RETRIES, Some("Run bunx playwright test"));
        assert!(extraction.step_found);
        let signals = extraction.signals;
        assert_eq!(signals.len(), 3, "{signals:#?}");

        let summary = &signals[0];
        assert_eq!(summary.kind, SignalKind::Summary);
        assert_eq!(summary.message, "1 failed");
        assert_eq!(
            summary.excerpt,
            vec![
                "1 failed",
                "  [chromium] › tests/checkout.spec.ts:42:7 › Checkout › applies a discount code ──",
                "1 flaky",
                "  [chromium] › tests/cart.spec.ts:18:5 › Cart › removes an item ──────────────",
                "24 passed (1.4m)",
            ]
        );

        let failed = &signals[1];
        assert_eq!(failed.kind, SignalKind::Test);
        assert_eq!(
            failed.test_id.as_deref(),
            Some("tests/checkout.spec.ts › Checkout › applies a discount code")
        );
        assert_eq!(failed.params.as_deref(), Some("chromium"));
        assert_eq!(failed.path.as_deref(), Some("tests/checkout.spec.ts"));
        assert_eq!(failed.line, Some(42));
        assert_eq!(
            failed.message,
            "Error: expect(locator).toHaveText(expected) failed"
        );
        assert_eq!(failed.error_class.as_deref(), Some("Error"));
        assert_eq!(failed.expected.as_deref(), Some("\"$90.00\""));
        assert_eq!(failed.actual.as_deref(), Some("\"$100.00\""));
        assert_eq!(failed.repeats, 3);
        assert!(failed
            .excerpt
            .iter()
            .any(|line| line
                == "> 48 |   await expect(page.getByTestId('total')).toHaveText('$90.00');"));

        let flaky = &signals[2];
        assert_eq!(
            flaky.test_id.as_deref(),
            Some("tests/cart.spec.ts › Cart › removes an item")
        );
        assert_eq!(flaky.error_class.as_deref(), Some("TimeoutError"));
        assert_eq!(flaky.repeats, 1);
    }

    #[test]
    fn needs_a_browser_tag() {
        assert!(parse(&["1 failed", "38 passed"]).is_empty());
    }
}
